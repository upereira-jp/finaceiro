// A conexao com o CRM, e as guardas que fazem a regra 4 valer em RUNTIME.
//
// A regra 4 diz que o financeiro NUNCA escreve no CRM e NUNCA le tabela base -
// so as views `financeiro.*`, pela role `financeiro_ro`. Isso e afirmacao ate
// alguem medir. Aqui vira condicao de arranque, do mesmo jeito que
// conferirRoleDeRuntime() do composition root transformou "a role de runtime nao
// pode ter BYPASSRLS" em falha de boot.
//
// O MODO DE FALHA QUE ISTO IMPEDE nao e alguem escrever um INSERT de proposito -
// e a connection string do CRM apontar, um dia, para uma role com mais poder do
// que devia: `postgres` num ambiente de teste, uma role nova criada as pressas,
// ou a mesma role depois de um GRANT bem-intencionado. Nesse dia nada quebra e
// nada aparece em log. Por isso a conferencia e no catalogo e no arranque.

import { Pool } from 'pg';

export class RoleDoCrmInsegura extends Error {
  constructor(usuario: string, motivo: string) {
    super(
      `A conexao com o CRM esta usando a role "${usuario}", que ${motivo}. ` +
      'A regra 4 do CLAUDE.md exige leitura pura, so pelas views financeiro.*. ' +
      'Aponte a CRM_DATABASE_URL para financeiro_ro.'
    );
    this.name = 'RoleDoCrmInsegura';
  }
}

export class SemCrmDatabaseUrl extends Error {
  constructor() {
    super('CRM_DATABASE_URL ausente. E a credencial de LEITURA do CRM (financeiro_ro). ' +
          'Formato no .env.example. Sem ela o conector nao sobe - de proposito.');
    this.name = 'SemCrmDatabaseUrl';
  }
}

/**
 * As DEZ views expostas pelo dev do CRM. Lista FECHADA - ver leitura.ts.
 *
 * Eram oito ate 03/08/2026. As duas ultimas - `vendas_creditadas` e
 * `rateio_situacao` - foram criadas por eles em 01/08 e nos so descobrimos ao
 * MEDIR uma resposta que dizia que elas nao existiam (`Q-VIEWSCRED-01`).
 *
 * A lista e fechada e a conferencia de arranque compara o que a role enxerga
 * contra ela: view NOVA do lado deles nao entra sozinha, e view que SUMIR
 * aparece. As duas direcoes importam - a segunda e o contrato de integracao
 * quebrando, a primeira e um mes de trabalho feito por planilha sem necessidade.
 */
export const VIEWS_DO_CRM = [
  'vendas_ganhas', 'usinas', 'rateio_clientes', 'rateio_creditos',
  'geracao_mensal', 'parceiros', 'leads_arquivados', 'lead_merges',
  'vendas_creditadas', 'rateio_situacao',
] as const;

export type ViewDoCrm = (typeof VIEWS_DO_CRM)[number];

/*
 * Schemas de infraestrutura da plataforma, nominais. Nao guardam dado de
 * negocio, e o que a role tem neles vem de grant a PUBLIC feito por extensao -
 * nao e concessao de ninguem e nao se remove sem desinstalar a extensao.
 * NOMINAL de proposito: lista que cresce por conveniencia vira lista que nao
 * significa nada, e este projeto ja tem o precedente do invariante 17.
 */
const SCHEMAS_DE_INFRAESTRUTURA = new Set(['extensions', 'net', 'graphql', 'graphql_public', 'pgbouncer', 'vault']);

export type DiagnosticoDaRole = {
  usuario: string;
  /**
   * Privilegio herdado de extensao, em schema de infraestrutura. NAO derruba o
   * arranque e NAO e silenciado: quem chama registra. Medido no CRM em 27/07 -
   * pg_net concede arwdDxtm a PUBLIC em net.http_request_queue.
   */
  privilegiosDeInfraestrutura: string[];
  /** Views de `financeiro` que a role enxerga. Tem que ser as dez. */
  viewsLegiveis: string[];
  /**
   * Views que expoem coluna de tenant - e o que liga a validacao por linha da
   * invariante 9. Medido em 27/07 depois do ajuste do dev: as OITO de entao; em
   * 03/08, as DEZ.
   */
  viewsComColunaDeTenant: string[];
  /**
   * VIEWS QUE O CRM EXPOE E QUE NAO ESTAO NA NOSSA LISTA FECHADA.
   *
   * Esta linha existe por um custo pago. O dev do CRM criou `vendas_creditadas` e
   * `rateio_situacao` em 01/08/2026, e nada deste lado notou: a lista fechada
   * continuou com oito, o conector continuou lendo oito, e a descoberta veio em
   * 03/08 por acaso - conferindo, por outro motivo, uma afirmacao de que as views
   * nao existiam. Entre uma coisa e outra, o eixo do originador estava legivel
   * por consulta e o projeto seguia planejando digitacao por documento.
   *
   * NAO derruba o arranque, e a escolha e deliberada: view nova do lado deles nao
   * e insegurança, e recusar o ciclo por causa dela pararia o espelho por um
   * evento que e boa noticia. Mas ela tambem nao pode chegar em silencio - a
   * mesma forma de `privilegiosDeInfraestrutura`: declarada no diagnostico, e
   * quem chama registra.
   */
  viewsNovasNoCrm: string[];
  /**
   * O SENTIDO CONTRARIO, e ele e mais grave: view da lista fechada que a role
   * nao enxerga mais. E o contrato de integracao quebrando, e o sintoma sem esta
   * linha seria um erro de SQL no meio do ciclo, longe da causa.
   */
  viewsAusentes: string[];
};

/**
 * Pool do CRM. Separado do pool do financeiro por ser outro banco, e com teto
 * BAIXO de proposito: o conector e trabalho de lote, nao caminho de requisicao.
 * Um lote lento nao pode competir por conexao com quem esta esperando na tela.
 */
export function criarPoolCrm(connectionString: string, teto = 2): Pool {
  return new Pool({
    connectionString,
    max: teto,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // O conector NUNCA escreve. Declarar a sessao como read-only e a segunda
    // tranca: mesmo que a role ganhasse privilegio por engano, um INSERT falha
    // com 25006. Custa nada e fecha a janela entre um GRANT errado e a proxima
    // conferencia de arranque.
    options: '-c default_transaction_read_only=on',
  });
}

/**
 * A conferencia de arranque. Recusa o conector se a credencial do CRM tiver
 * mais poder do que ler as views.
 *
 * As quatro perguntas sao as que a regra 4 faz, e nenhuma delas se responde por
 * revisao de codigo:
 *   1. a role e SUPERUSER ou tem BYPASSRLS?
 *   2. ela pode ESCREVER em algum objeto de schema de negocio?
 *   3. ela alcanca algum objeto de negocio fora das views `financeiro.*`?
 *   4. ela enxerga as dez views, quais expoem coluna de tenant, e o que apareceu
 *      ou sumiu em relacao a lista fechada?
 */
export async function conferirRoleDeLeitura(pool: Pool): Promise<DiagnosticoDaRole> {
  const c = await pool.connect();
  try {
    const perfil = await c.query<{ usuario: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user::text AS usuario, r.rolsuper, r.rolbypassrls
         FROM pg_roles r WHERE r.rolname = current_user`);
    const p = perfil.rows[0];
    if (!p) throw new Error('Nao foi possivel ler pg_roles para a role do CRM.');
    if (p.rolsuper)     throw new RoleDoCrmInsegura(p.usuario, 'e SUPERUSER');
    if (p.rolbypassrls) throw new RoleDoCrmInsegura(p.usuario, 'tem BYPASSRLS');

    /*
     * 2 e 3. AS DUAS ARMADILHAS DESTA CONFERENCIA, e a primeira versao caiu nas
     * duas. Ficam registradas porque cada uma sozinha torna a guarda decorativa.
     *
     * ARMADILHA 1 - `information_schema.table_privileges` filtrado por
     * `grantee = current_user` NAO ve privilegio herdado por participacao em
     * role: ele aparece com o nome da ROLE concedida, nao do usuario. Uma
     * credencial que ganhasse escrita por `GRANT algum_papel TO financeiro_ro`
     * passaria batido. O teste N21 pegou. `has_table_privilege()` resolve, porque
     * considera privilegio disponivel por participacao.
     *
     * ARMADILHA 2 - com `has_table_privilege()` a conferencia fica CERTA e, na
     * primeira execucao contra o CRM real, acusou 2 objetos com escrita e 4 com
     * leitura fora de `financeiro`. Nenhum e do dev do CRM: sao grants a PUBLIC
     * feitos por EXTENSAO. Medido em 27/07:
     *   net.http_request_queue, net._http_response  -> arwdDxtm a PUBLIC (pg_net)
     *   extensions.pg_stat_statements(_info)        -> r a PUBLIC
     * Recusar o arranque por causa disso deixaria o conector sem subir nunca, e a
     * guarda seria removida na primeira pressa - que e como guarda morre.
     *
     * O CRITERIO, ENTAO, NAO E "zero privilegio": e ONDE. Escrita em schema que
     * guarda dado de negocio derruba o arranque. Privilegio herdado de extensao
     * em schema de infraestrutura e DECLARADO e devolvido no diagnostico, para
     * quem chama registrar - nunca silenciado. A regra 4 fala de nao modificar o
     * CRM; `net.http_request_queue` nao e o CRM, mas tambem nao e nada: quem
     * escreve la faz o banco emitir HTTP. Por isso aparece, em vez de sumir.
     */
    const infra = await c.query<{ schema: string; objeto: string; escreve: boolean }>(
      `SELECT n.nspname AS schema, c.relname AS objeto,
              (has_table_privilege(c.oid,'INSERT') OR has_table_privilege(c.oid,'UPDATE')
               OR has_table_privilege(c.oid,'DELETE') OR has_table_privilege(c.oid,'TRUNCATE')) AS escreve
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','v','m','p','f')
          AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND (has_table_privilege(c.oid,'SELECT') OR has_table_privilege(c.oid,'INSERT')
            OR has_table_privilege(c.oid,'UPDATE') OR has_table_privilege(c.oid,'DELETE')
            OR has_table_privilege(c.oid,'TRUNCATE'))
        ORDER BY 1,2`);

    const deNegocio = infra.rows.filter((r) => !SCHEMAS_DE_INFRAESTRUTURA.has(r.schema));
    const escritaDeNegocio = deNegocio.filter((r) => r.escreve);
    if (escritaDeNegocio.length > 0) {
      const lista = escritaDeNegocio.slice(0, 5).map((r) => `${r.schema}.${r.objeto}`).join(', ');
      throw new RoleDoCrmInsegura(p.usuario, `pode ESCREVER em ${escritaDeNegocio.length} objeto(s): ${lista}`);
    }
    const leituraForaDasViews = deNegocio.filter((r) => r.schema !== 'financeiro');
    if (leituraForaDasViews.length > 0) {
      const lista = leituraForaDasViews.slice(0, 5).map((r) => `${r.schema}.${r.objeto}`).join(', ');
      throw new RoleDoCrmInsegura(p.usuario,
        `alcanca ${leituraForaDasViews.length} objeto(s) fora das views financeiro.*: ${lista}. ` +
        'A regra 4 proibe ler TABELA BASE do CRM');
    }
    const privilegiosDeInfraestrutura = infra.rows
      .filter((r) => SCHEMAS_DE_INFRAESTRUTURA.has(r.schema))
      .map((r) => `${r.schema}.${r.objeto}${r.escreve ? ' (ESCRITA)' : ''}`);

    // 4. E, de quebra, quais views expoem coluna de tenant - o que a SPEC-002
    // R1-b assume que existe e que hoje NAO existe em nenhuma. Nao e erro de
    // arranque: e um fato que o ciclo tem que registrar em vez de esconder.
    const views = await c.query<{ view: string; tem_tenant: boolean }>(
      `SELECT c.relname AS view,
              EXISTS (SELECT 1 FROM information_schema.columns col
                       WHERE col.table_schema = 'financeiro' AND col.table_name = c.relname
                         AND col.column_name IN ('crm_tenant_id','tenant_id')) AS tem_tenant
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'financeiro' AND c.relkind IN ('v','m')
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY c.relname`);

    const legiveis = views.rows.map((r) => r.view);
    const conhecidas = new Set<string>(VIEWS_DO_CRM);
    return {
      usuario: p.usuario,
      privilegiosDeInfraestrutura,
      viewsLegiveis: legiveis,
      viewsComColunaDeTenant: views.rows.filter((r) => r.tem_tenant).map((r) => r.view),
      viewsNovasNoCrm: legiveis.filter((v) => !conhecidas.has(v)),
      viewsAusentes: [...conhecidas].filter((v) => !legiveis.includes(v)),
    };
  } finally {
    c.release();
  }
}

export function crmDoAmbiente(): Pool {
  const url = process.env.CRM_DATABASE_URL;
  if (!url) throw new SemCrmDatabaseUrl();
  return criarPoolCrm(url, Number(process.env.POOL_CRM ?? 2));
}
