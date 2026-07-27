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

/** As oito views expostas pelo dev do CRM. Lista FECHADA - ver leitura.ts. */
export const VIEWS_DO_CRM = [
  'vendas_ganhas', 'usinas', 'rateio_clientes', 'rateio_creditos',
  'geracao_mensal', 'parceiros', 'leads_arquivados', 'lead_merges',
] as const;

export type ViewDoCrm = (typeof VIEWS_DO_CRM)[number];

export type DiagnosticoDaRole = {
  usuario: string;
  /** Views de `financeiro` que a role enxerga. Tem que ser as oito. */
  viewsLegiveis: string[];
  /**
   * Views que expoem coluna de tenant. Medido em 27/07: NENHUMA.
   * Ver `SPEC-002` R1-b e a nota em leitura.ts - e o que degrada a invariante 9.
   */
  viewsComColunaDeTenant: string[];
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
 *   2. ela tem QUALQUER privilegio de escrita, em qualquer schema?
 *   3. ela alcanca tabela base fora do schema `financeiro`?
 *   4. ela enxerga as oito views?
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

    // 2 e 3. `information_schema.table_privileges` ja resolve as roles herdadas
    // para o grantee corrente, entao isto cobre privilegio vindo por membership.
    const poder = await c.query<{ escrita: string; fora: string }>(
      `SELECT
         (SELECT count(*) FROM information_schema.table_privileges
           WHERE grantee = current_user
             AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES'))::text AS escrita,
         (SELECT count(*) FROM information_schema.table_privileges
           WHERE grantee = current_user AND table_schema <> 'financeiro')::text AS fora`);
    const q = poder.rows[0]!;
    if (Number(q.escrita) > 0) {
      throw new RoleDoCrmInsegura(p.usuario, `tem ${q.escrita} privilegio(s) de ESCRITA`);
    }
    if (Number(q.fora) > 0) {
      throw new RoleDoCrmInsegura(p.usuario, `alcanca ${q.fora} objeto(s) fora do schema financeiro`);
    }

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

    return {
      usuario: p.usuario,
      viewsLegiveis: views.rows.map((r) => r.view),
      viewsComColunaDeTenant: views.rows.filter((r) => r.tem_tenant).map((r) => r.view),
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
