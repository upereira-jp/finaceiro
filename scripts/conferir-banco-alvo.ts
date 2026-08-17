// AS DUAS PERGUNTAS QUE SE FAZ A UM BANCO ANTES E DEPOIS DE MIGRAR ELE.
//
// Uso:
//   DIRECT_URL=... node --experimental-strip-types scripts/conferir-banco-alvo.ts identidade
//   DIRECT_URL=... node --experimental-strip-types scripts/conferir-banco-alvo.ts migration-32
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

/** A primeira migration deste repositorio. E a impressao digital do banco. */
const FUNDACAO = '20260725120000_fundacao_schema';

/** O que a migration 32 deixa no catalogo, e os tres tem de existir juntos. */
const MIGRATION_32 = '20260817120000_boleto_importado';

class ConferenciaFalhou extends Error {}

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
if (modo !== 'identidade' && modo !== 'migration-32') {
  console.error(`modo desconhecido: ${JSON.stringify(modo)}. Use "identidade" ou "migration-32".`);
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

try {
  await cliente.connect();
  if (modo === 'identidade') await identidade();
  else await migration32();
  await cliente.end();
} catch (e) {
  await cliente.end().catch(() => {});
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e instanceof ConferenciaFalhou ? msg : `falha ao conferir o banco: ${msg}`);
  process.exit(1);
}
