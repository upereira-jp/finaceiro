// AS DUAS PERGUNTAS QUE SE FAZ A UM BANCO ANTES E DEPOIS DE MIGRAR ELE.
//
// Uso:
//   DIRECT_URL=... node --experimental-strip-types scripts/conferir-banco-alvo.ts identidade
//   DIRECT_URL=... node --experimental-strip-types scripts/conferir-banco-alvo.ts migration-32
//   node --experimental-strip-types scripts/conferir-banco-alvo.ts no-checkout migration-35
//
// ============================================================================
// POR QUE ISTO E UM ARQUIVO E NAO TRES LINHAS DENTRO DO YAML
//
// A primeira versao deste conferidor era `node -e '...'` dentro do
// `migrate-financeiro.yml`. Duas coisas o tiraram de la, e as duas sao de
// substancia:
//
//   - **nao dava para exercitar.** Codigo dentro de YAML so roda quando o
//     workflow roda, e o workflow so roda contra PRODUCAO. Aqui ele roda contra
//     qualquer banco, inclusive o `fin_upgrade` de teste;
//   - **as aspas mentem.** O SQL usa aspas simples para literal; o `-e` do shell
//     usa aspas simples para delimitar o script. `to_regclass('public.tenant')`
//     vira `to_regclass("public.tenant")` na fuga, e ai o Postgres le um
//     IDENTIFICADOR em vez de um texto - `column "public.tenant" does not exist`,
//     no meio de um workflow que muta producao.
//
// ============================================================================
// A GUARDA DE IDENTIDADE E A REGRA 4, E ELA E O MOTIVO PRINCIPAL DESTE ARQUIVO
//
// "O financeiro NUNCA executa INSERT, UPDATE ou DELETE no CRM, em nenhuma
// circunstancia, por nenhum caminho." Um secret trocado por engano e exatamente
// um desses caminhos, e `prisma migrate deploy` e DDL: contra o banco errado ele
// nao recusa, ele CRIA.
//
// A identidade nao e o nome na URL, que nao diz nada e pode ser qualquer coisa.
// E o banco alvo carregar a HISTORIA deste repositorio: a migration de fundacao
// registrada como aplicada, e as tabelas que ela criou. Nenhum outro banco do
// mundo tem `20260725120000_fundacao_schema` em `_prisma_migrations`.

import pg from 'pg';
import { existsSync, readdirSync } from 'node:fs';

/** A primeira migration deste repositorio. E a impressao digital do banco. */
const FUNDACAO = '20260725120000_fundacao_schema';

/** O que a migration 32 deixa no catalogo, e os tres tem de existir juntos. */
const MIGRATION_32 = '20260817120000_boleto_importado';
const MIGRATION_35 = '20260827120000_cofre_e_identidade_do_cooperado';
const MIGRATION_36 = '20260828230000_contrato_de_cobranca_e_opcional';

class ConferenciaFalhou extends Error {}

/** De "migration-NN" para o diretorio. Um lugar so, e os dois modos leem dele. */
const DIRETORIO: Record<string, string> = {
  'migration-32': MIGRATION_32,
  'migration-35': MIGRATION_35,
  'migration-36': MIGRATION_36,
};

/**
 * A MIGRATION QUE SE ESPERA APLICAR ESTA NESTE CHECKOUT?
 *
 * ESTE MODO NASCEU DE UM FALSO SUCESSO, em 28/08/2026. O workflow
 * `migrate-financeiro` rodou com `confirmar = aplicar`, terminou VERDE, e
 * imprimiu "Migrations aplicadas" - tendo aplicado NADA:
 *
 *     34 migrations found in prisma/migrations
 *     No pending migrations to apply.
 *
 * A migration 35 existia no disco de quem a escreveu e nunca tinha sido enviada
 * ao GitHub. O runner clonou a `main`, achou 34, e "sucesso" era literalmente
 * verdade: nao havia o que aplicar.
 *
 * E A CONFERENCIA DE CATALOGO NAO PEGOU porque estava fixa em `migration-32` -
 * conferindo uma migration de dez dias antes, que ja estava aplicada e ia passar
 * para sempre. O projeto ja tinha escrito a regra certa depois da 34
 * ("conferida no catalogo e nao na mensagem do comando") e ela furou num lugar
 * novo: o catalogo era consultado, mas o da migration errada.
 *
 * Este modo roda ANTES de discar para o banco e NAO precisa de credencial: ele
 * so olha o disco. E a pergunta mais barata do fluxo e a unica que teria
 * transformado aquele verde em vermelho.
 */
function noCheckout(chave: string): void {
  const dir = DIRETORIO[chave];
  if (!dir) {
    console.error(`modo desconhecido: ${JSON.stringify(chave)}. Conheco: ${Object.keys(DIRETORIO).join(', ')}.`);
    process.exit(1);
  }
  const caminho = new URL(`../prisma/migrations/${dir}/migration.sql`, import.meta.url);
  if (!existsSync(caminho)) {
    console.error(
      `\n  a ${chave} (${dir}) NAO esta neste checkout.\n\n` +
      '  Quase sempre isto quer dizer que ela foi escrita e nao foi commitada/enviada - o\n' +
      '  runner clona o repositorio, nao o disco de quem escreveu. Aplicar assim termina em\n' +
      '  VERDE tendo feito nada, porque "nenhuma migration pendente" e literalmente verdade.\n\n' +
      '  Nada foi tentado contra o banco.\n'
    );
    process.exit(1);
  }
  const total = readdirSync(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory()).length;
  console.log(`${chave} presente no checkout (${dir}) - ${total} migrations no diretorio.`);
}

// O checkout se confere sem banco, entao vem ANTES da exigencia de DIRECT_URL.
if (process.argv[2] === 'no-checkout') {
  noCheckout(process.argv[3] ?? '');
  process.exit(0);
}

const url = process.env.DIRECT_URL;
if (!url || !url.trim()) {
  console.error(
    'DIRECT_URL ausente. E a conexao DIRETA (session pooler, 5432), e nao a do runtime.\n' +
    'NUNCA a 6543: o Migrate exige prepared statements que o pooler de transacao nao\n' +
    'suporta, e o modo de falha dele nao e erro - ele PENDURA. Formato em .env.example.'
  );
  process.exit(1);
}

const modo = process.argv[2] ?? '';
const MODOS = ['identidade', 'migration-32', 'migration-35', 'migration-36'];
if (!MODOS.includes(modo)) {
  console.error(`modo desconhecido: ${JSON.stringify(modo)}. Conheco: ${MODOS.join(', ')}.`);
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });

/**
 * O BANCO ALVO E O NOSSO?
 *
 * Nao escreve nada, e e a pergunta que roda ANTES do `migrate deploy`. As tres
 * tabelas sao as que a fundacao cria; o registro da fundacao e o que distingue
 * "banco do financeiro" de "banco vazio onde o migrate criaria tudo do zero" -
 * que e o desfecho silencioso e ruim de apontar para o projeto errado.
 */
async function identidade(): Promise<void> {
  const { rows: [t] } = await cliente.query<{ registro: boolean; tenant: boolean; boleto: boolean }>(`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS registro,
           to_regclass('public.tenant')             IS NOT NULL AS tenant,
           to_regclass('public.boleto')             IS NOT NULL AS boleto`);

  if (!t.registro || !t.tenant || !t.boleto) {
    throw new ConferenciaFalhou(
      'o banco alvo NAO e o do financeiro, ou esta vazio: ' +
      `_prisma_migrations=${t.registro} tenant=${t.tenant} boleto=${t.boleto}. ` +
      'Nada foi aplicado. Confira o secret DIRECT_URL — e lembre que o CRM e ' +
      'read-only absoluto (regra 4).'
    );
  }

  const { rows: [f] } = await cliente.query<{ n: string }>(
    `SELECT count(*) AS n FROM _prisma_migrations
      WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    [FUNDACAO],
  );
  if (Number(f.n) !== 1) {
    throw new ConferenciaFalhou(
      `a migration de fundacao (${FUNDACAO}) nao esta aplicada no alvo. ` +
      'Este e o banco de outro projeto, ou de um projeto pela metade. Nada foi feito.'
    );
  }

  const { rows: [q] } = await cliente.query<{ n: string; pendente: boolean }>(
    `SELECT count(*) AS n,
            bool_or(migration_name = $1) AS pendente
       FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    [MIGRATION_32],
  );
  console.log(`identidade OK — banco do financeiro, ${q.n} migration(s) aplicada(s).`);
  console.log(q.pendente
    ? `a ${MIGRATION_32} JA esta aplicada; o deploy sera no-op.`
    : `a ${MIGRATION_32} ainda NAO esta aplicada.`);
}

/**
 * A MIGRATION 32 ENTROU DE FATO?
 *
 * Verificacao por CONSULTA AO CATALOGO, jamais por leitura do log do comando -
 * e a regra 3 e a regra 11 dizendo a mesma coisa em contextos diferentes.
 * "Aplicou sem erro" e uma afirmacao sobre o processo; isto e sobre o banco.
 */
async function migration32(): Promise<void> {
  const { rows: [r] } = await cliente.query<{ coluna: string; restricao: string; tipo: string; registro: string }>(`
    SELECT (SELECT count(*) FROM information_schema.columns
             WHERE table_name = 'boleto' AND column_name = 'origem')         AS coluna,
           (SELECT count(*) FROM pg_constraint
             WHERE conname = 'boleto_importado_tem_linha')                    AS restricao,
           (SELECT count(*) FROM pg_type WHERE typname = 'origem_boleto')     AS tipo,
           (SELECT count(*) FROM _prisma_migrations
             WHERE migration_name = '${MIGRATION_32}'
               AND finished_at IS NOT NULL AND rolled_back_at IS NULL)        AS registro`);

  const faltando = [
    Number(r.coluna) === 1 ? null : 'coluna boleto.origem',
    Number(r.restricao) === 1 ? null : 'constraint boleto_importado_tem_linha',
    Number(r.tipo) === 1 ? null : 'enum origem_boleto',
    Number(r.registro) === 1 ? null : `registro de ${MIGRATION_32} em _prisma_migrations`,
  ].filter(Boolean);

  if (faltando.length) {
    throw new ConferenciaFalhou(
      `a migration 32 nao esta completa no banco. Falta: ${faltando.join(', ')}.`
    );
  }
  console.log('migration 32 OK — enum origem_boleto, coluna boleto.origem e a constraint, os tres presentes.');

  /* A CONTAGEM POR ORIGEM E O FECHO. O DEFAULT e `api_sicoob`, entao toda linha
   * que ja existia tem de aparecer nela - e nenhuma pode ter nascido `importado`
   * antes de alguem importar. Zero boletos e resposta legitima e e o esperado
   * hoje: medido em producao, `boleto` tem 0 linhas porque o A1 nunca existiu. */
  const { rows } = await cliente.query<{ origem: string; n: string }>(
    'SELECT origem::text AS origem, count(*) AS n FROM boleto GROUP BY origem ORDER BY origem');
  console.log(rows.length
    ? `boletos por origem: ${rows.map((x) => `${x.origem}=${x.n}`).join(' ')}`
    : 'boletos por origem: nenhum boleto na tabela (esperado — o A1 nunca existiu)');
}

/**
 * A MIGRATION 35 ENTROU DE FATO?
 *
 * Mesma disciplina da 32 - catalogo, nunca a mensagem do comando -, mais UMA
 * conferencia que as anteriores nao precisavam fazer e que e a mais importante
 * daqui: **o dono da resolvedora enxerga o cofre?**
 *
 * `SECURITY DEFINER` roda com os privilegios de quem e DONO da funcao. Se a
 * migration for aplicada por uma role sem `SELECT` em `vault.decrypted_secrets`,
 * a funcao e criada, o `migrate deploy` diz "successfully applied", o catalogo
 * mostra a funcao presente - e a primeira emissao de boleto morre com
 * "permission denied for view decrypted_secrets", a tres camadas de distancia da
 * causa. E o modo de falha classico deste projeto: sucesso aparente agora,
 * sintoma longe da causa depois.
 */
async function migration35(): Promise<void> {
  const { rows: [r] } = await cliente.query<Record<string, string>>(`
    SELECT (SELECT count(*) FROM information_schema.columns
             WHERE table_name = 'conector_cobranca'
               AND column_name IN ('numero_cliente','codigo_modalidade',
                                   'numero_contrato_cobranca','numero_conta_corrente')) AS colunas,
           (SELECT count(*) FROM pg_constraint
             WHERE conname IN ('conector_identidade_positiva',
                               'conector_ativo_tem_identidade'))                        AS restricoes,
           (SELECT count(*) FROM pg_constraint
             WHERE conname = 'conector_ativo_tem_identidade' AND convalidated)          AS validada,
           (SELECT count(*) FROM pg_tables WHERE tablename = 'cofre_acesso_log')        AS tabela,
           (SELECT count(*) FROM pg_policies WHERE tablename = 'cofre_acesso_log')      AS policy,
           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app' AND p.proname = 'resolver_credencial_cobranca')    AS funcao,
           (SELECT count(*) FROM _prisma_migrations
             WHERE migration_name = '${MIGRATION_35}'
               AND finished_at IS NOT NULL AND rolled_back_at IS NULL)                  AS registro`);

  const faltando = [
    Number(r.colunas) === 4 ? null : `as 4 colunas de identidade em conector_cobranca (achei ${r.colunas})`,
    Number(r.restricoes) === 2 ? null : `as 2 constraints do conector (achei ${r.restricoes})`,
    Number(r.tabela) === 1 ? null : 'a tabela cofre_acesso_log',
    Number(r.policy) >= 1 ? null : 'a policy de cofre_acesso_log (regra 3: RLS sem policy e falha)',
    Number(r.funcao) === 1 ? null : 'a funcao app.resolver_credencial_cobranca',
    Number(r.registro) === 1 ? null : `o registro de ${MIGRATION_35} em _prisma_migrations`,
  ].filter(Boolean);

  if (faltando.length) {
    throw new ConferenciaFalhou(`a migration 35 nao esta completa no banco. Falta: ${faltando.join(', ')}.`);
  }
  console.log('migration 35 OK — 4 colunas, 2 constraints, cofre_acesso_log com policy, e a resolvedora.');

  // A conferencia que decide se algum boleto vai sair um dia.
  const { rows: [v] } = await cliente.query<{ dono: string; enxerga: boolean | null }>(`
    SELECT pg_get_userbyid(proowner) AS dono,
           has_table_privilege(pg_get_userbyid(proowner),
                               'vault.decrypted_secrets', 'SELECT') AS enxerga
      FROM pg_proc WHERE oid = 'app.resolver_credencial_cobranca(text)'::regprocedure`);

  if (!v.enxerga) {
    throw new ConferenciaFalhou(
      `a resolvedora existe mas o DONO dela ("${v.dono}") nao enxerga vault.decrypted_secrets. ` +
      'Nenhum boleto sairia, e o erro apareceria so na primeira emissao. Conserto: ' +
      'ALTER FUNCTION app.resolver_credencial_cobranca(text) OWNER TO postgres;'
    );
  }
  console.log(`cofre OK — a resolvedora e de "${v.dono}", que enxerga vault.decrypted_secrets.`);

  if (Number(r.validada) !== 1) {
    console.log(
      'aviso: conector_ativo_tem_identidade esta NOT VALID (esperado ate alguem preencher\n'
      + '       numeroCliente, codigoModalidade e numeroContaCorrente - os TRES que a\n'
      + '       migration 36 exige; numeroContratoCobranca e opcional e o banco pede para\n'
      + '       OMITIR). Depois de preencher, rode:\n'
      + '       ALTER TABLE conector_cobranca VALIDATE CONSTRAINT conector_ativo_tem_identidade;');
  }

  const { rows } = await cliente.query<{ n: string }>('SELECT count(*) AS n FROM vault.secrets');
  console.log(`segredos no cofre hoje: ${rows[0].n}`);
}

/**
 * A MIGRATION 36 ENTROU DE FATO?
 *
 * ELA E A UNICA DA SERIE EM QUE "A CONSTRAINT EXISTE" NAO E EVIDENCIA DE NADA, e
 * e por isso que este modo precisou nascer em vez de reaproveitar o da 35. A 36
 * nao cria objeto novo: ela faz `DROP CONSTRAINT` e `ADD CONSTRAINT` com o
 * MESMO NOME. Conferir por `conname`, como a 35 confere, responde `1` no banco
 * de antes e no banco de depois - passa sempre, e nao confere coisa alguma.
 *
 * O que distingue os dois estados e o TEXTO da restricao, e a diferenca e uma
 * TROCA e nao um afrouxamento (as duas exigem tres campos):
 *
 *     35:  numero_cliente  AND codigo_modalidade AND numero_contrato_cobranca
 *     36:  numero_cliente  AND codigo_modalidade AND numero_conta_corrente
 *
 * Por isso as duas afirmacoes abaixo sao feitas em separado, e a segunda vale
 * tanto quanto a primeira: o campo novo ENTROU **e** o antigo SAIU. Uma
 * constraint que exigisse os quatro passaria numa conferencia que so procurasse
 * `numero_conta_corrente`, e o efeito dela e exatamente o defeito que a 36
 * existe para consertar - o cooperado de contrato unico sem conseguir ligar o
 * conector.
 *
 * O resto da 36 e o da 35 intacto, entao ela e conferida antes: a 36 e um delta,
 * e um delta sobre um banco que perdeu o cofre nao e sucesso.
 */
async function migration36(): Promise<void> {
  await migration35();

  const { rows: [r] } = await cliente.query<{ definicao: string | null; registro: string }>(`
    SELECT (SELECT pg_get_constraintdef(oid) FROM pg_constraint
             WHERE conname = 'conector_ativo_tem_identidade')            AS definicao,
           (SELECT count(*) FROM _prisma_migrations
             WHERE migration_name = '${MIGRATION_36}'
               AND finished_at IS NOT NULL AND rolled_back_at IS NULL)   AS registro`);

  if (!r.definicao) {
    throw new ConferenciaFalhou('a constraint conector_ativo_tem_identidade nao existe no banco.');
  }

  const exigeConta = r.definicao.includes('numero_conta_corrente');
  const aindaExigeContrato = r.definicao.includes('numero_contrato_cobranca');

  const faltando = [
    exigeConta ? null : 'a exigencia de numero_conta_corrente (o campo que a 36 faz ENTRAR)',
    aindaExigeContrato ? 'a constraint AINDA exige numero_contrato_cobranca (o campo que a 36 faz SAIR)' : null,
    Number(r.registro) === 1 ? null : `o registro de ${MIGRATION_36} em _prisma_migrations`,
  ].filter(Boolean);

  if (faltando.length) {
    throw new ConferenciaFalhou(
      `a migration 36 nao esta no banco. Falta: ${faltando.join('; ')}.\n` +
      `  definicao atual: ${r.definicao}`
    );
  }
  console.log('migration 36 OK — a constraint exige numero_conta_corrente e NAO exige mais numero_contrato_cobranca.');
}

try {
  await cliente.connect();
  if (modo === 'identidade') await identidade();
  else if (modo === 'migration-36') await migration36();
  else if (modo === 'migration-35') await migration35();
  else await migration32();
  await cliente.end();
} catch (e) {
  await cliente.end().catch(() => {});
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e instanceof ConferenciaFalhou ? msg : `falha ao conferir o banco: ${msg}`);
  process.exit(1);
}
