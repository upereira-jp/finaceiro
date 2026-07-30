// COMPOSITION ROOT - o unico lugar do sistema que instancia client, pool e adapter.
//
// Ate aqui a fiacao estava faltando: criarPools() recebia a connection string por
// parametro, nenhum arquivo de src/ lia DATABASE_URL, e cada suite montava o seu
// proprio client. Isso funciona em teste e nao existe em producao.
//
// O QUE ESTE ARQUIVO NAO EXPORTA, e de proposito: o PrismaClient cru. Quem tem o
// client cru pode ler fora de contexto de tenant, e leitura fora de contexto
// devolve ZERO sem erro (CLAUDE.md 3). O que sai daqui e withTenant/withRelatorio
// e o client PROTEGIDO por comGuarda - onde $queryRaw passa (o login precisa) e
// operacao de modelo lanca.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { criarPools, TETO_TRANSACIONAL, TETO_RELATORIO } from './db/pools.ts';
import { comGuarda, type ClientTx, type Identidade } from './db/contexto.ts';
import {
  resolverLogin, abrirUnidadeDeTrabalho, abrirRelatorio, abrirComoPlataforma,
  type Sessao, type VinculoDaSessao,
} from './auth/sessao.ts';
import { COBRANCA_NAO_CONFIGURADA, type PortaDeCobranca } from './sicoob/porta.ts';

export class RoleDeRuntimeInsegura extends Error {
  constructor(usuario: string, motivo: string) {
    super(
      `A conexao esta usando a role "${usuario}", que ${motivo}. Com ela as 24 ` +
      'policies e o FORCE ROW LEVEL SECURITY nao valem nada, e o vazamento entre ' +
      'tenants so aparece com o segundo cliente em producao. Aponte a DATABASE_URL ' +
      'para app_financeiro_login (NOSUPERUSER NOBYPASSRLS).'
    );
    this.name = 'RoleDeRuntimeInsegura';
  }
}

export class ClienteGeradoDesatualizado extends Error {
  readonly tabelas: readonly string[];
  constructor(tabelas: readonly string[]) {
    super(
      `O client do Prisma em src/generated/ NAO corresponde ao banco: ${tabelas.length} tabela(s) ` +
      `existem em public e nao tem modelo no client — ${tabelas.join(', ')}. ` +
      'Toda leitura delas seria `undefined.findFirst()`, que e um TypeError na cara do usuario e ' +
      'nao um erro de banco.\n\n' +
      'A CAUSA E QUASE SEMPRE A MESMA: `src/generated/` esta no .gitignore, entao `git pull` nao o ' +
      'traz, e uma migration nova nao chega ao client sozinha. O conserto e uma linha, no servidor:\n\n' +
      '    npx prisma generate && systemctl restart financeiro\n\n' +
      'Em deploy, `prisma generate` vem DEPOIS de `prisma migrate deploy` e ANTES do restart.'
    );
    this.name = 'ClienteGeradoDesatualizado';
    this.tabelas = tabelas;
  }
}

export class SemDatabaseUrl extends Error {
  constructor() {
    super('DATABASE_URL ausente. Formato no .env.example - session pooler na 5432, ' +
          'nunca a 6543 (transaction pooler, sem cobertura, reabriria o ADR-0003).');
    this.name = 'SemDatabaseUrl';
  }
}

export type App = ReturnType<typeof criarApp>;

/**
 * A porta de cobranca chega AQUI e em nenhum outro lugar - e o mesmo desenho da
 * `PortaDeLeitura` do conector do CRM, e pela mesma razao: nenhum repositorio
 * importa adaptador concreto, entao todo o caminho do dinheiro e exercitavel sem
 * certificado A1, sem credencial de sandbox e sem rede.
 *
 * O DEFAULT E O ADAPTADOR QUE RECUSA, e nao um que finge funcionar. Sem
 * credencial, `registrar boleto` levanta 503 com o motivo nomeado, e o resto do
 * sistema - composicao, emissao, baixa manual, split - roda inteiro. A F2 nao
 * fica bloqueada esperando um certificado, e tambem nao emite boleto de mentira.
 */
export function criarApp(connectionString: string, cobranca: PortaDeCobranca = COBRANCA_NAO_CONFIGURADA) {
  const pools = criarPools(connectionString);

  // Dois clients porque sao dois pools. O de relatorio tem teto e timeout
  // proprios: relatorio lento num pool unico consome os slots e as requisicoes
  // seguintes falham com P2028 em maxWait - penhasco, nao degradacao.
  const transacional = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
  const relatorio    = new PrismaClient({ adapter: new PrismaPg(pools.relatorio) });

  /** Client protegido: $queryRaw passa, operacao de modelo lanca. E o que o
   *  login usa, e o que qualquer codigo que "so precisava dar uma olhada" recebe. */
  const protegido = comGuarda(transacional);

  /**
   * A conferencia que transforma vazamento silencioso em falha de boot.
   *
   * Medido em 27/07: a role `postgres` do Supabase tem rolbypassrls = true.
   * Conectar com ela nao quebra nada, nao loga nada e passa em todos os testes -
   * o sintoma e dado de outro tenant numa tela, meses depois. Por isso a
   * verificacao e no catalogo e no arranque, e nao na revisao de PR.
   */
  async function conferirRoleDeRuntime(): Promise<{ usuario: string }> {
    const r: any[] = await transacional.$queryRaw`
      SELECT current_user::text AS usuario, rolbypassrls, rolsuper
        FROM pg_roles WHERE rolname = current_user`;
    const l = r?.[0];
    if (!l) throw new Error('Nao foi possivel ler pg_roles para a role corrente.');
    if (l.rolsuper)     throw new RoleDeRuntimeInsegura(l.usuario, 'e SUPERUSER');
    if (l.rolbypassrls) throw new RoleDeRuntimeInsegura(l.usuario, 'tem BYPASSRLS');
    return { usuario: l.usuario };
  }

  /**
   * A SEGUNDA CONFERENCIA DE ARRANQUE: o client gerado corresponde ao banco?
   *
   * MEDIDO EM 30/07/2026, EM PRODUCAO, e o sintoma chegou pela tela: "Cannot read
   * properties of undefined (reading 'findFirst')" na aba Documento. A causa e
   * uma cadeia que nenhuma peca sozinha denuncia:
   *
   *   1. `src/generated/` esta no `.gitignore` - o `git pull` do VPS nao o traz;
   *   2. NADA no caminho de deploy rodava `prisma generate` (so o CI e as suites
   *      rodavam, e `tests/repos.sh` so gerava quando o diretorio NAO existia,
   *      entao nunca atualizava um obsoleto);
   *   3. as migrations 19 e 20 entraram em producao em 30/07 e trouxeram
   *      `identidade_de_cobranca`, `logo_de_cobranca` e `campo_do_documento`;
   *   4. o client do servidor continuou o de 28/07, sem esses tres modelos.
   *
   * `dbt().identidade_de_cobranca` era `undefined`, e `undefined.findFirst()` e o
   * erro que chegou ao usuario.
   *
   * O QUE ISSO ENSINA SOBRE A PROVA DO DEPLOY, e e a parte que dói: a publicacao
   * das 11:50 foi conferida dos dois lados e deu tudo verde - `index.html` certo,
   * bytes dos assets iguais, rotas novas em **401 TokenInvalido**. Mas
   * **401 prova que a rota existe e recusa credencial** - ela nem chega ao banco.
   * As tres rotas do documento estavam quebradas atras daquele 401.
   *
   * Por que virou guarda de arranque e nao linha no README: a `Q-PRISMA11B-01` ja
   * havia registrado que "`tsc --noEmit` passa em cima do client ANTERIOR - typecheck
   * verde nao prova que o client corresponde ao schema". Um passo a mais no
   * procedimento depende de alguem lembrar, e a regra 11 deste projeto ja disse o
   * que acha disso: "invariante que depende de alguem lembrar nao e invariante".
   *
   * A conferencia e barata e exata: toda tabela de `public` tem de existir como
   * modelo no client. Sobra do lado do client nao e problema (tabela removida por
   * migration antiga); falta e.
   */
  async function conferirClienteGerado(): Promise<{ modelos: number }> {
    const r: Array<{ tabela: string }> = await transacional.$queryRaw`
      SELECT c.relname AS tabela
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind = 'r'
         AND c.relname <> '_prisma_migrations'
       ORDER BY 1`;

    const cliente = transacional as unknown as Record<string, unknown>;
    const faltando = r.map((x) => x.tabela).filter((t) => cliente[t] === undefined);
    if (faltando.length > 0) throw new ClienteGeradoDesatualizado(faltando);
    return { modelos: r.length };
  }

  return {
    pools,
    tetos: { transacional: TETO_TRANSACIONAL, relatorio: TETO_RELATORIO },
    protegido,
    conferirRoleDeRuntime,
    conferirClienteGerado,
    cobranca,

    /** R1-c: a unica chamada feita fora de contexto de tenant. */
    login: (authUserId: string): Promise<Sessao> => resolverLogin(protegido as any, authUserId),

    /** Caminho normal. Uma transacao por unidade de trabalho. */
    withTenant: <T>(
      sessao: Sessao, tenantIdProposto: string | undefined,
      trabalho: (tx: ClientTx, vinculo: VinculoDaSessao) => Promise<T>,
    ) => abrirUnidadeDeTrabalho<T>(transacional, sessao, tenantIdProposto, trabalho),

    /** Pool e timeout de relatorio, mesma conferencia de vinculo. */
    withRelatorio: <T>(
      sessao: Sessao, tenantIdProposto: string | undefined,
      trabalho: (tx: ClientTx, vinculo: VinculoDaSessao) => Promise<T>,
    ) => abrirRelatorio<T>(relatorio, sessao, tenantIdProposto, trabalho),

    /** R2/R3: o unico caminho que alcanca tenant sem vinculo, e custa trilha. */
    comoPlataforma: <T>(
      sessao: Sessao, tenantId: string, acao: string, recurso: string,
      trabalho: (tx: ClientTx) => Promise<T>,
    ) => abrirComoPlataforma<T>(transacional, sessao, tenantId, acao, recurso, trabalho),

    async encerrar(): Promise<void> {
      await Promise.all([transacional.$disconnect(), relatorio.$disconnect()]);
      await Promise.all([pools.transacional.end(), pools.relatorio.end()]);
    },
  };
}

let instancia: App | undefined;

/**
 * O app do processo. Preguicoso de proposito: instanciar no import abriria pool
 * em qualquer `import` - inclusive em teste unitario que nao quer banco.
 */
export function app(): App {
  if (!instancia) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new SemDatabaseUrl();
    instancia = criarApp(url);
  }
  return instancia;
}

/**
 * Arranque explicito: as DUAS conferencias, antes de servir a primeira requisicao.
 *
 * A ordem importa. A role vem primeiro porque, com `BYPASSRLS`, a segunda
 * conferencia leria o catalogo por um caminho que nao e o de producao. E as duas
 * derrubam o arranque em vez de avisar: um servidor que sobe com a role errada
 * vaza entre tenants em silencio, e um que sobe com o client velho quebra na cara
 * do usuario numa tela que ninguem abriu ainda.
 */
export async function iniciar(): Promise<App> {
  const a = app();
  const { usuario } = await a.conferirRoleDeRuntime();
  console.log(`[financeiro] conectado como "${usuario}" - sem BYPASSRLS, sem SUPERUSER`);
  const { modelos } = await a.conferirClienteGerado();
  console.log(`[financeiro] client gerado cobre as ${modelos} tabelas de public`);
  return a;
}

/** Para teste: descarta a instancia sem deixar pool aberto. */
export async function encerrarApp(): Promise<void> {
  if (instancia) { await instancia.encerrar(); instancia = undefined; }
}

export type { Sessao, VinculoDaSessao, Identidade, ClientTx };
