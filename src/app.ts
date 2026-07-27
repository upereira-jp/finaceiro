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

export class SemDatabaseUrl extends Error {
  constructor() {
    super('DATABASE_URL ausente. Formato no .env.example - session pooler na 5432, ' +
          'nunca a 6543 (transaction pooler, sem cobertura, reabriria o ADR-0003).');
    this.name = 'SemDatabaseUrl';
  }
}

export type App = ReturnType<typeof criarApp>;

export function criarApp(connectionString: string) {
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

  return {
    pools,
    tetos: { transacional: TETO_TRANSACIONAL, relatorio: TETO_RELATORIO },
    protegido,
    conferirRoleDeRuntime,

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

/** Arranque explicito: confere a role ANTES de servir a primeira requisicao. */
export async function iniciar(): Promise<App> {
  const a = app();
  const { usuario } = await a.conferirRoleDeRuntime();
  console.log(`[financeiro] conectado como "${usuario}" - sem BYPASSRLS, sem SUPERUSER`);
  return a;
}

/** Para teste: descarta a instancia sem deixar pool aberto. */
export async function encerrarApp(): Promise<void> {
  if (instancia) { await instancia.encerrar(); instancia = undefined; }
}

export type { Sessao, VinculoDaSessao, Identidade, ClientTx };
