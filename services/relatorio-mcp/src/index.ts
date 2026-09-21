/**
 * financeiro-relatorio-mcp
 *
 * Camada de LEITURA do Financeiro para IA. Duas faces, um runner:
 *   - MCP (Streamable HTTP) em POST/GET/DELETE /mcp  -> connector do claude.ai
 *   - REST em POST /v1/report                        -> backend / outra LLM
 *
 * Conecta ao Postgres do financeiro UMA vez, como a role `relatorio_ai`, que
 * so enxerga o schema `relatorio` (sql/01..05). Nenhuma outra credencial mora
 * aqui: sem service-role, sem certificado A1, sem token Sicoob.
 *
 * O QUE ESTE SERVICO NAO FAZ, DE PROPOSITO
 *   - Nao escreve. A role e read-only por privilegio E por
 *     default_transaction_read_only. "IA que emite boleto" nao e um patch
 *     aqui; e outro projeto, com aprovacao humana no meio.
 *   - Nao devolve meio de pagamento nem segredo. Chave PIX, banco/agencia/
 *     conta, credencial_ref, linha digitavel, codigo de barras e pix
 *     copia-e-cola nao existem nas views. Nem com pii=true.
 *   - Nao converte dinheiro para reais. CLAUDE.md 1: centavos em toda camada.
 *
 * ESCOPO POR IDENTIDADE (nao por parametro): o bearer resolve quem e; os
 * tenants que ele alcanca vem da IDENTIDADE, nao do argumento tenant_id.
 */
import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Pool, types as pgTypes } from "pg";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";
import { installOAuth } from "./oauth.js";

// ------------------------------------------------------------------ config
const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? "127.0.0.1";          // nginx na frente; nunca 0.0.0.0 sem TLS
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";
const OAUTH_LOGIN_PASSWORD = process.env.OAUTH_LOGIN_PASSWORD ?? "";
const OAUTH_STORE_PATH = process.env.OAUTH_STORE_PATH ?? "./oauth-store.json";
const OAUTH_IDENTITY_LABEL = process.env.OAUTH_IDENTITY_LABEL ?? "dono";

/**
 * Identidade. `tenants` sao UUIDs de tenant do financeiro; o literal "*"
 * significa "todos os tenants do banco", resolvido NO ARRANQUE.
 *
 * O "*" e conveniencia consciente para a identidade do dono, e tem um preco
 * declarado: tenant novo passa a ser visivel no proximo restart, sem ato
 * deliberado. Identidade de terceiro NUNCA usa "*" -- lista os UUIDs dele,
 * e pii=false ate existir DPA.
 */
type Identity = { token: string; label: string; tenants: string[]; pii: boolean };

function parseIdentities(raw: string | undefined): Identity[] {
  if (!raw) throw new Error("Faltou IDENTITIES no ambiente (JSON array de identidades).");
  let arr: any;
  try { arr = JSON.parse(raw); } catch { throw new Error("IDENTITIES nao e JSON valido."); }
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("IDENTITIES vazio.");
  return arr.map((x, i) => {
    if (!x || typeof x.token !== "string" || x.token.length < 32)
      throw new Error(`IDENTITIES[${i}].token ausente ou curto demais (use openssl rand -hex 32).`);
    if (typeof x.label !== "string" || !x.label) throw new Error(`IDENTITIES[${i}].label ausente.`);
    if (!Array.isArray(x.tenants) || x.tenants.length === 0 || x.tenants.some((t: any) => typeof t !== "string"))
      throw new Error(`IDENTITIES[${i}].tenants deve ser array nao vazio de strings (uuid ou "*").`);
    return { token: x.token, label: x.label, tenants: x.tenants as string[], pii: !!x.pii };
  });
}

const IDENTITIES = parseIdentities(process.env.IDENTITIES);
if (!DATABASE_URL) throw new Error("Faltou DATABASE_URL no ambiente (role relatorio_ai).");

// TLS com CA verificado. Este canal carrega a saida de fn_ficha_cliente (PII).
// Sem CA o TLS cifra mas nao autentica -- um intermediario termina a conexao
// com certificado proprio e le as respostas. Falha o boot de proposito.
const PG_CA_PATH = process.env.PG_CA_PATH ?? "";
if (!PG_CA_PATH) throw new Error("Faltou PG_CA_PATH (CA do Postgres, baixado do painel Supabase).");
let PG_CA: string;
try { PG_CA = readFileSync(PG_CA_PATH, "utf8"); }
catch (err: any) { throw new Error(`Nao consegui ler o CA em PG_CA_PATH='${PG_CA_PATH}': ${err.message}`); }

// int8/numeric chegam como string no driver `pg` (precisao). Aqui viram numero
// com trava: int8 so se couber em inteiro seguro; numeric so se for finito.
// Dinheiro aqui e SEMPRE int de centavos, entao nao ha float em dinheiro --
// numeric so aparece em kWh, tarifa e percentual, onde aproximar e aceitavel.
pgTypes.setTypeParser(20, (v) => { const n = Number(v); return Number.isSafeInteger(n) ? n : v; });
pgTypes.setTypeParser(1700, (v) => { const n = Number(v); return Number.isFinite(n) ? n : v; });
pgTypes.setTypeParser(1082, (v) => v); // date crua 'YYYY-MM-DD': virar Date carimbaria fuso que a coluna nao tem

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 3,                                   // role tem connection limit 5; folga p/ diagnosticar
  ssl: { ca: PG_CA, rejectUnauthorized: true },
  statement_timeout: 30_000,
  options: "-c default_transaction_read_only=on",  // segunda tranca: INSERT falha com 25006
});
pool.on("error", (err) => console.error(`[pool] erro em conexao ociosa: ${err.message}`));

// ----------------------------------------------------------------------- log
function audit(fields: Record<string, string | number | undefined>) {
  const line = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[audit] ts=${new Date().toISOString()} ${line}`);
}

// ------------------------------------------------------- conferencia de role
/**
 * A regra 4 do financeiro ("o CRM e read-only absoluto") virou condicao de
 * arranque em src/crm/conexao.ts. Aqui e a mesma ideia virada para dentro: a
 * credencial DESTE servico nao pode ter mais poder do que ler `relatorio`.
 *
 * O modo de falha que isto impede nao e alguem escrever de proposito -- e a
 * DATABASE_URL apontar um dia para uma role com mais poder (postgres num
 * teste, uma role nova criada as pressas, a mesma role depois de um GRANT
 * bem-intencionado). Nesse dia nada quebra e nada aparece em log.
 */
const SCHEMAS_DE_INFRAESTRUTURA = new Set(["extensions", "net", "graphql", "graphql_public", "pgbouncer", "vault"]);

async function conferirRole(): Promise<{ usuario: string; infraestrutura: string[] }> {
  const c = await pool.connect();
  try {
    const perfil = await c.query<{ usuario: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select current_user::text as usuario, r.rolsuper, r.rolbypassrls
         from pg_roles r where r.rolname = current_user`);
    const p = perfil.rows[0];
    if (!p) throw new Error("Nao consegui ler pg_roles para a role de relatorio.");
    if (p.rolsuper) throw new Error(`A role '${p.usuario}' e SUPERUSER. Aponte a DATABASE_URL para relatorio_ai.`);
    if (p.rolbypassrls) throw new Error(`A role '${p.usuario}' tem BYPASSRLS. Aponte a DATABASE_URL para relatorio_ai.`);

    // has_table_privilege considera privilegio herdado por participacao em role
    // -- information_schema filtrado por grantee=current_user NAO ve isso.
    const priv = await c.query<{ schema: string; objeto: string; escreve: boolean }>(
      `select n.nspname as schema, c.relname as objeto,
              (has_table_privilege(c.oid,'INSERT') or has_table_privilege(c.oid,'UPDATE')
               or has_table_privilege(c.oid,'DELETE') or has_table_privilege(c.oid,'TRUNCATE')) as escreve
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','v','m','p','f')
          and n.nspname not in ('pg_catalog','information_schema')
          and (has_table_privilege(c.oid,'SELECT') or has_table_privilege(c.oid,'INSERT')
            or has_table_privilege(c.oid,'UPDATE') or has_table_privilege(c.oid,'DELETE')
            or has_table_privilege(c.oid,'TRUNCATE'))
        order by 1,2`);

    const negocio = priv.rows.filter((r) => !SCHEMAS_DE_INFRAESTRUTURA.has(r.schema));
    const escrita = negocio.filter((r) => r.escreve);
    if (escrita.length) {
      throw new Error(
        `A role '${p.usuario}' pode ESCREVER em ${escrita.length} objeto(s): ` +
        escrita.slice(0, 5).map((r) => `${r.schema}.${r.objeto}`).join(", ") +
        ". Esta camada e de leitura -- revise os grants antes de subir.");
    }
    const foraDoSchema = negocio.filter((r) => r.schema !== "relatorio");
    if (foraDoSchema.length) {
      throw new Error(
        `A role '${p.usuario}' alcanca ${foraDoSchema.length} objeto(s) fora de 'relatorio': ` +
        foraDoSchema.slice(0, 5).map((r) => `${r.schema}.${r.objeto}`).join(", ") +
        ". Tabela base nao e superficie desta camada.");
    }
    // Privilegio herdado de extensao em schema de infraestrutura nao derruba o
    // arranque -- e declarado, nunca silenciado (mesma escolha do conector).
    return {
      usuario: p.usuario,
      infraestrutura: priv.rows.filter((r) => SCHEMAS_DE_INFRAESTRUTURA.has(r.schema))
        .map((r) => `${r.schema}.${r.objeto}${r.escreve ? " (ESCRITA)" : ""}`),
    };
  } finally { c.release(); }
}

// ------------------------------------------------------------------ catalogo
/**
 * O catalogo e lido do BANCO no arranque, nao escrito aqui. Consequencias
 * deliberadas: (1) coluna nova numa view aparece sem tocar neste arquivo;
 * (2) a lista de colunas vira allowlist de filtro/ordenacao -- e o que
 * permite montar SQL com nome de coluna sem abrir injecao; (3) a descricao
 * que o modelo le e o `comment on view`, que mora junto da definicao.
 */
type Coluna = { nome: string; tipo: string; numerica: boolean; temporal: boolean; comTimezone: boolean };
type Tabela = {
  publico: string;      // nome exposto: 'fatura'
  view: string;         // nome real: 'v_fatura'
  descricao: string;
  colunas: Coluna[];
  temTenant: boolean;
  periodo?: string;     // coluna de recorte temporal, quando existe
};

/** Coluna de periodo por view. Só existe onde a view tem data de verdade --
 *  inventar filtro de data em view sem data seria mentir para quem pergunta. */
const PERIODO: Record<string, string> = {
  v_fatura: "competencia",
  v_boleto: "vencimento",
  v_liquidacao: "data_liquidacao",
  v_split_execucao: "competencia",
  v_split_item: "competencia",
  v_conta_pagar: "competencia",
  v_pagamento: "data_pagamento",
  v_usina_geracao: "competencia",
  v_registro_fatura_unificada: "competencia",
  v_contrato: "data_fechamento",
  v_cliente: "criado_em",
  v_conector_execucao: "iniciado_em",
  v_agenda_execucao: "iniciado_em",
  v_auditoria: "ocorrido_em",
  v_acesso_plataforma_log: "ocorrido_em",
  v_ato_externo_log: "ocorrido_em",
  v_cofre_acesso_log: "ocorrido_em",
  v_faturamento_mes: "mes",
  v_recebimento_mes: "mes",
  v_repasse_comissao_mes: "mes",
  v_geracao_x_consumo_mes: "mes",
};

const CATALOGO = new Map<string, Tabela>();

async function carregarCatalogo(): Promise<void> {
  const res = await pool.query<{ view: string; descricao: string | null; coluna: string; tipo: string }>(
    `select c.relname as view, obj_description(c.oid) as descricao,
            a.attname as coluna, format_type(a.atttypid, a.atttypmod) as tipo
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'relatorio'
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relkind = 'v' and has_table_privilege(c.oid, 'SELECT')
      order by c.relname, a.attnum`);
  if (!res.rows.length) {
    throw new Error("Nenhuma view legivel em 'relatorio'. Rodou sql/01..05 no banco do financeiro?");
  }
  CATALOGO.clear();
  for (const r of res.rows) {
    const publico = r.view.replace(/^v_/, "");
    let t = CATALOGO.get(publico);
    if (!t) {
      t = { publico, view: r.view, descricao: r.descricao ?? "", colunas: [], temTenant: false, periodo: PERIODO[r.view] };
      CATALOGO.set(publico, t);
    }
    const tipo = r.tipo;
    t.colunas.push({
      nome: r.coluna,
      tipo,
      numerica: /^(smallint|integer|bigint|numeric|real|double precision)/.test(tipo),
      temporal: /^(date|timestamp)/.test(tipo),
      comTimezone: /with time zone/.test(tipo),
    });
    if (r.coluna === "tenant_id") t.temTenant = true;
  }
  // Periodo declarado que nao existe na view e erro de configuracao, nao
  // detalhe: o filtro seria aceito e silenciosamente ignorado.
  for (const t of CATALOGO.values()) {
    if (t.periodo && !t.colunas.some((c) => c.nome === t.periodo)) {
      throw new Error(`PERIODO['${t.view}'] aponta para '${t.periodo}', que nao existe na view.`);
    }
  }
}

function tabelaOuErro(nome: string): Tabela {
  const t = CATALOGO.get(nome) ?? CATALOGO.get(nome.replace(/^v_/, ""));
  if (!t) {
    throw new Error(`Tabela '${nome}' nao existe. Chame a tool 'tabelas' para ver a lista.`);
  }
  return t;
}
function colunaOuErro(t: Tabela, nome: string): Coluna {
  const c = t.colunas.find((x) => x.nome === nome);
  if (!c) throw new Error(`Coluna '${nome}' nao existe em '${t.publico}'. Colunas: ${t.colunas.map((x) => x.nome).join(", ")}`);
  return c;
}

// --------------------------------------------------------------- montagem SQL
const PAGE_MAX = 500;
const PAGE_DEFAULT = 100;

type Filtro = Record<string, any>;

/** WHERE base: tenant da IDENTIDADE (nunca "todos do banco"), periodo e filtros.
 *  Nome de coluna so entra depois de validado contra o catalogo; valor vai
 *  sempre por bind. */
function montarWhere(
  t: Tabela,
  p: Record<string, any>,
  id: Identity,
  escopo: string[],
): { where: string; values: any[]; avisos: string[] } {
  const values: any[] = [];
  const parts: string[] = [];
  const avisos: string[] = [];

  if (t.temTenant) {
    if (p.tenant_id) {
      values.push(p.tenant_id);
      parts.push(`tenant_id = $${values.length}::uuid`);
    } else {
      values.push(escopo);
      parts.push(`tenant_id = any($${values.length}::uuid[])`);
    }
  } else if (p.tenant_id) {
    avisos.push(`'${t.publico}' e global (nao tem tenant_id): o filtro de tenant foi IGNORADO nesta tabela.`);
  }

  if (p.date_from || p.date_to) {
    if (!t.periodo) {
      throw new Error(`'${t.publico}' nao tem coluna de data; ela nao aceita periodo. (Chame 'tabelas' para ver quais aceitam.)`);
    }
    const col = colunaOuErro(t, t.periodo);
    // timestamptz comparado com data crua joga o fim do dia de Brasilia no dia
    // seguinte -- a sessao do banco roda em UTC. Por isso a conversao explicita.
    const expr = col.comTimezone ? `("${col.nome}" at time zone 'America/Sao_Paulo')` : `"${col.nome}"`;
    if (p.date_from) { values.push(p.date_from); parts.push(`${expr} >= $${values.length}::date`); }
    if (p.date_to)   { values.push(p.date_to);   parts.push(`${expr} < ($${values.length}::date + 1)`); }
  }

  const filtros: Filtro = p.filtros ?? {};
  for (const [nome, valor] of Object.entries(filtros)) {
    const col = colunaOuErro(t, nome);
    if (valor === null) { parts.push(`"${col.nome}" is null`); continue; }
    if (Array.isArray(valor)) {
      if (!valor.length) throw new Error(`filtros['${nome}'] veio como lista vazia.`);
      values.push(valor);
      parts.push(`"${col.nome}"::text = any($${values.length}::text[])`);
      continue;
    }
    values.push(valor);
    parts.push(`"${col.nome}"::text = $${values.length}::text`);
  }

  if (p.busca && p.busca.coluna) {
    const col = colunaOuErro(t, p.busca.coluna);
    values.push(`%${p.busca.texto}%`);
    parts.push(`"${col.nome}"::text ilike $${values.length}`);
  }

  return { where: parts.length ? parts.join(" and ") : "true", values, avisos };
}

// ------------------------------------------------------- confiabilidade/meta
/** Metricas de v_cobertura_dados que qualificam cada relatorio agregado.
 *  O numero nunca viaja sem a ressalva que o qualifica. */
const CONFIABILIDADE: Record<string, string[]> = {
  faturamento_mes:      ["frescor_faturamento", "tarifa_uc"],
  recebimento_mes:      ["frescor_recebimento"],
  inadimplencia:        ["frescor_recebimento"],
  repasse_comissao_mes: ["frescor_recebimento"],
  geracao_x_consumo_mes:["rateio_alocado"],
  carteira:             ["espelho_crm", "documento_cliente", "tarifa_uc"],
  fatura:               ["frescor_faturamento", "tarifa_uc"],
  liquidacao:           ["frescor_recebimento"],
};

async function anexarConfiabilidade(meta: Record<string, any>, tabela: string, escopo: string[], tenant?: string) {
  const metricas = CONFIABILIDADE[tabela];
  if (!metricas) return;
  try {
    const values: any[] = [tenant ? [tenant] : escopo, metricas];
    const cov = await pool.query(
      `select tenant_id, tenant, metrica, escopo, confiavel, nota
         from relatorio.v_cobertura_dados
        where tenant_id = any($1::uuid[]) and metrica = any($2::text[])`, values);
    const ruins = cov.rows.filter((r) => r.confiavel !== true);
    meta.confiabilidade = {
      metricas,
      fonte: "v_cobertura_dados",
      avaliacoes: cov.rows.length,
      confiaveis: cov.rows.length - ruins.length,
      baixa_confianca: ruins.map((r) => ({ tenant: r.tenant, metrica: r.metrica, escopo: r.escopo, nota: r.nota })),
    };
    if (ruins.length) {
      meta.avisos = [...(meta.avisos ?? []),
        `${ruins.length} recorte(s) com baixa confianca -- ler meta.confiabilidade.baixa_confianca ANTES de citar numeros.`];
    }
  } catch (err: any) {
    meta.avisos = [...(meta.avisos ?? []),
      `confiabilidade indisponivel nesta resposta (${err.message}) -- chame a tool cobertura_dados.`];
  }
}

// --------------------------------------------------------------- tools/runner
type ToolDef = {
  title: string;
  description: string;
  input: ZodRawShape;
  pii?: boolean;
  run: (p: Record<string, any>, id: Identity, escopo: string[]) => Promise<any>;
};

const P_TENANT = {
  tenant_id: z.string().uuid().optional()
    .describe("uuid do tenant. OMITA para consolidar todos os tenants desta identidade (chame 'tenants' para ver quais)."),
};
const P_PERIODO = {
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("inicio do periodo, YYYY-MM-DD inclusive, em America/Sao_Paulo"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("fim do periodo, YYYY-MM-DD inclusive"),
};
const P_PAGE = {
  limit: z.number().int().min(1).max(PAGE_MAX).optional().describe(`linhas por pagina (padrao ${PAGE_DEFAULT}, max ${PAGE_MAX})`),
  offset: z.number().int().min(0).optional().describe("deslocamento (padrao 0). meta.total diz quantas existem."),
};
const P_FILTRO = {
  filtros: z.record(z.any()).optional()
    .describe("igualdade por coluna: {\"status\":\"emitida\"}. Lista = IN ({\"status\":[\"emitida\",\"paga\"]}). null = IS NULL."),
  busca: z.object({ coluna: z.string(), texto: z.string() }).optional()
    .describe("contem, sem diferenciar maiuscula: {\"coluna\":\"cliente_nome\",\"texto\":\"silva\"}"),
  ordenar_por: z.string().optional().describe("coluna de ordenacao (padrao: a coluna de periodo, decrescente)"),
  ordem: z.enum(["asc", "desc"]).optional(),
};

/** Consulta paginada em qualquer view do espelho. E o motor de quase tudo. */
async function consultar(p: Record<string, any>, id: Identity, escopo: string[], tabelaFixa?: string): Promise<any> {
  const started = Date.now();
  const t = tabelaOuErro(tabelaFixa ?? p.tabela);
  const tenant = p.tenant_id as string | undefined;
  if (tenant && !escopo.includes(tenant)) {
    audit({ evento: "negado_escopo_tenant", identidade: id.label, tabela: t.publico, tenant });
    throw new Error(`Tenant '${tenant}' fora do escopo desta identidade.`);
  }
  if (p.date_from && p.date_to && p.date_from > p.date_to) throw new Error("date_from e posterior a date_to.");

  const { where, values, avisos } = montarWhere(t, p, id, escopo);
  const limit = Math.min(p.limit ?? PAGE_DEFAULT, PAGE_MAX);
  const offset = p.offset ?? 0;

  let ordem = "";
  if (p.ordenar_por) {
    const col = colunaOuErro(t, p.ordenar_por);
    ordem = ` order by "${col.nome}" ${p.ordem === "asc" ? "asc" : "desc"} nulls last`;
  } else if (t.periodo) {
    ordem = ` order by "${t.periodo}" ${p.ordem === "asc" ? "asc" : "desc"} nulls last`;
  }

  const sql = `select *, count(*) over () as _total from relatorio.${t.view} where ${where}${ordem} limit $${values.length + 1} offset $${values.length + 2}`;
  const res = await pool.query(sql, [...values, limit, offset]);
  let linhas = res.rows as Array<Record<string, any>>;
  const total = linhas.length ? Number(linhas[0]._total) : 0;
  linhas = linhas.map(({ _total, ...resto }) => resto);

  const meta: Record<string, any> = {
    tabela: t.publico,
    descricao: t.descricao,
    as_of: new Date().toISOString(),
    unidade_monetaria: "centavos",
    linhas: linhas.length,
    total, limit, offset,
    truncado: offset + linhas.length < total,
  };
  if (meta.truncado) meta.proxima_pagina = { offset: offset + linhas.length };
  if (tenant) meta.tenant = tenant; else if (t.temTenant) meta.escopo = escopo;
  if (avisos.length) meta.avisos = avisos;
  if (t.periodo) {
    meta.periodo_coluna = t.periodo;
    if (p.date_from || p.date_to) meta.filtro_periodo = { de: p.date_from ?? null, ate: p.date_to ?? null };
    const stamps = linhas.map((r) => r[t.periodo!]).filter((v) => v != null)
      .map((v) => (v instanceof Date ? v.toISOString() : String(v))).sort();
    meta.periodo = stamps.length ? { de: stamps[0], ate: stamps[stamps.length - 1] } : null;
  }
  if (!linhas.length) {
    meta.avisos = [...(meta.avisos ?? []),
      "Nenhuma linha no recorte. Isso e 'nada registrado', que NAO prova 'nao aconteceu' -- pode ser dado que nunca entrou."];
  }
  await anexarConfiabilidade(meta, t.publico, escopo, tenant);

  audit({ evento: "consulta", identidade: id.label, tabela: t.publico, tenant: tenant ?? `[escopo:${escopo.length}]`,
          linhas: linhas.length, total, ms: Date.now() - started });
  return { meta, dados: linhas };
}

/** Agrupa e soma no BANCO. Existe para a pergunta agregada nao virar
 *  paginacao de milhares de linhas dentro do chat. */
async function contar(p: Record<string, any>, id: Identity, escopo: string[]): Promise<any> {
  const started = Date.now();
  const t = tabelaOuErro(p.tabela);
  const tenant = p.tenant_id as string | undefined;
  if (tenant && !escopo.includes(tenant)) {
    audit({ evento: "negado_escopo_tenant", identidade: id.label, relatorio: "contar", tabela: t.publico, tenant });
    throw new Error(`Tenant '${tenant}' fora do escopo desta identidade.`);
  }

  const grupos: string[] = (p.agrupar_por ?? []).slice(0, 4);
  if (!grupos.length) throw new Error("agrupar_por e obrigatorio (ate 4 colunas). Para linhas cruas use 'consultar'.");
  const colsGrupo = grupos.map((g) => colunaOuErro(t, g));
  const somas: Coluna[] = (p.somar ?? []).map((s: string) => {
    const c = colunaOuErro(t, s);
    if (!c.numerica) throw new Error(`'${s}' nao e numerica; nao da para somar.`);
    return c;
  });

  const { where, values, avisos } = montarWhere(t, p, id, escopo);
  const sel = [
    ...colsGrupo.map((c) => `"${c.nome}"`),
    "count(*) as linhas",
    ...somas.map((c) => `sum("${c.nome}") as soma_${c.nome}`),
  ].join(", ");
  const grp = colsGrupo.map((c) => `"${c.nome}"`).join(", ");
  const limit = Math.min(p.limit ?? PAGE_DEFAULT, PAGE_MAX);
  const sql = `select ${sel} from relatorio.${t.view} where ${where} group by ${grp} order by ${
    somas.length ? `sum("${somas[0].nome}") desc nulls last` : "count(*) desc"} limit $${values.length + 1}`;
  const res = await pool.query(sql, [...values, limit]);

  const meta: Record<string, any> = {
    tabela: t.publico, descricao: t.descricao,
    as_of: new Date().toISOString(), unidade_monetaria: "centavos",
    agrupado_por: grupos, somado: somas.map((c) => c.nome),
    linhas: res.rows.length, limit,
  };
  if (tenant) meta.tenant = tenant; else if (t.temTenant) meta.escopo = escopo;
  if (avisos.length) meta.avisos = avisos;
  if (p.date_from || p.date_to) meta.filtro_periodo = { de: p.date_from ?? null, ate: p.date_to ?? null };
  await anexarConfiabilidade(meta, t.publico, escopo, tenant);

  audit({ evento: "agrupamento", identidade: id.label, tabela: t.publico, grupos: grupos.join("+"),
          linhas: res.rows.length, ms: Date.now() - started });
  return { meta, dados: res.rows };
}

/** Atalho nomeado para uma view agregada: mesma mecanica de `consultar`,
 *  com a tabela fixa. Existe para o modelo achar o relatorio sem adivinhar. */
const atalho = (view: string, title: string, description: string, comPeriodo = true): ToolDef => ({
  title, description,
  input: { ...P_TENANT, ...(comPeriodo ? P_PERIODO : {}), ...P_FILTRO, ...P_PAGE },
  run: (p, id, escopo) => consultar(p, id, escopo, view),
});

const TOOLS: Record<string, ToolDef> = {
  tenants: {
    title: "Tenants no escopo",
    description: "Empresas que ESTA identidade alcanca, com o ultimo movimento de cada uma. Comece por aqui: " +
      "todo tenant_id de outras tools sai desta lista.",
    input: {},
    run: async (_p, id, escopo) => {
      const res = await pool.query(
        `select c.tenant_id, c.tenant, t.cnpj, t.status, c.clientes_ativos, c.ucs_ativas, c.contratos_ativos,
                c.ultima_competencia_faturada, c.ultima_liquidacao
           from relatorio.v_carteira c
           join relatorio.v_tenant t on t.tenant_id = c.tenant_id
          where c.tenant_id = any($1::uuid[]) order by c.tenant`, [escopo]);
      audit({ evento: "tenants", identidade: id.label, linhas: res.rows.length });
      return { meta: { as_of: new Date().toISOString(), linhas: res.rows.length, escopo }, dados: res.rows };
    },
  },

  tabelas: {
    title: "Catalogo de dados",
    description: "TUDO que este conector enxerga: cada tabela, o que ela significa, se aceita periodo e quais " +
      "colunas tem. Chame antes de usar 'consultar' ou 'contar' com uma tabela que voce ainda nao conhece.",
    input: {
      contem: z.string().optional().describe("filtra por pedaco do nome ou da descricao (ex.: 'fatura')"),
      detalhe: z.boolean().optional().describe("true traz a lista de colunas de cada tabela (padrao: so as principais)"),
    },
    run: async (p, id) => {
      const q = (p.contem ?? "").toLowerCase();
      const linhas = [...CATALOGO.values()]
        .filter((t) => !q || t.publico.includes(q) || t.descricao.toLowerCase().includes(q))
        .map((t) => ({
          tabela: t.publico,
          descricao: t.descricao,
          aceita_periodo: t.periodo ?? null,
          tem_tenant: t.temTenant,
          colunas: p.detalhe ? t.colunas.map((c) => `${c.nome}:${c.tipo}`) : t.colunas.map((c) => c.nome),
        }));
      audit({ evento: "catalogo", identidade: id.label, linhas: linhas.length });
      return {
        meta: {
          as_of: new Date().toISOString(), linhas: linhas.length,
          unidade_monetaria: "centavos",
          nota: "Coluna terminada em _centavos e dinheiro em CENTAVOS (int). Divida por 100 so ao escrever o texto. " +
                "Chave PIX, banco/agencia/conta, credencial, linha digitavel e codigo de barras nao existem aqui, de proposito.",
        },
        dados: linhas,
      };
    },
  },

  consultar: {
    title: "Consultar tabela",
    description: "Le linhas de qualquer tabela do catalogo, com filtro, periodo, ordenacao e paginacao. " +
      "meta.total diz quantas existem no recorte inteiro (nao so na pagina). Para 'quanto/quantos', prefira 'contar' -- " +
      "ele soma no banco em vez de trazer as linhas.",
    input: {
      tabela: z.string().describe("nome da tabela como aparece em 'tabelas' (ex.: fatura, boleto, cliente, conta_pagar)"),
      ...P_TENANT, ...P_PERIODO, ...P_FILTRO, ...P_PAGE,
    },
    run: (p, id, escopo) => consultar(p, id, escopo),
  },

  contar: {
    title: "Contar e somar",
    description: "Agrupa no BANCO: conta linhas e soma colunas numericas por ate 4 colunas. " +
      "Ex.: {tabela:'fatura', agrupar_por:['status'], somar:['valor_total_centavos'], date_from:'2026-01-01'}. " +
      "Use sempre que a pergunta for 'quanto', 'quantos' ou 'por ...' -- evita paginar milhares de linhas.",
    input: {
      tabela: z.string().describe("nome da tabela (ver 'tabelas')"),
      agrupar_por: z.array(z.string()).min(1).max(4).describe("colunas de agrupamento"),
      somar: z.array(z.string()).optional().describe("colunas numericas a somar (ex.: valor_total_centavos)"),
      ...P_TENANT, ...P_PERIODO,
      filtros: P_FILTRO.filtros, busca: P_FILTRO.busca,
      limit: P_PAGE.limit,
    },
    run: (p, id, escopo) => contar(p, id, escopo),
  },

  faturamento_mes: atalho("faturamento_mes", "Faturamento por competencia",
    "Quanto foi faturado por competencia, quanto ja voltou (liquidado) e o ticket medio. Cancelada nao entra em valor."),
  recebimento_mes: atalho("recebimento_mes", "Recebimento por mes",
    "Dinheiro que ENTROU, por mes de pagamento e origem da baixa. Nao confundir com faturamento_mes, que e por competencia."),
  inadimplencia: atalho("inadimplencia", "Inadimplencia por faixa de atraso",
    "Faturas vivas sem liquidacao, por faixa de atraso. A faixa '0 a vencer' e carteira sadia. Foto de agora, sem periodo.", false),
  repasses_comissoes: atalho("repasse_comissao_mes", "Repasse e comissao por competencia",
    "Quanto o rateio gerou de repasse ao dono da usina e de comissao ao originador. O que virou obrigacao esta em conta_pagar."),
  geracao_x_consumo: atalho("geracao_x_consumo_mes", "Geracao x consumo por usina",
    "Geracao medida contra consumo faturado, por usina e competencia. percentual_utilizado > 100 = faturou-se mais do que gerou; " +
    "percentual_rateio_alocado > 100 = sobrevenda de cota."),
  carteira: atalho("carteira", "Carteira agora",
    "Foto da carteira: clientes, UCs, contratos, usinas, saldo a pagar e as datas do ultimo movimento.", false),
  cobertura_dados: atalho("cobertura_dados", "Cobertura e confianca do dado",
    "METAVIEW: onde o numero e confiavel e por que. Chame antes de reportar qualquer numero que nao traga " +
    "meta.confiabilidade embutido.", false),

  ficha_cliente: {
    title: "Ficha do cliente (PII)",
    description: "Ficha COMPLETA de um cliente: documento, telefone, e-mail, endereco das UCs, contratos, " +
      "ultimas 12 faturas e totais. E a UNICA superficie de dado pessoal deste conector e fica registrada na trilha. " +
      "Para analise que nao precisa de dado pessoal, use 'consultar' na tabela cliente (ja vem mascarada). " +
      "Dados bancarios e linha digitavel NAO saem nem aqui.",
    input: {
      tenant_id: z.string().uuid().describe("uuid do tenant (obrigatorio)"),
      cliente_id: z.string().uuid().describe("uuid do cliente (saia de 'consultar' na tabela cliente)"),
    },
    pii: true,
    run: async (p, id, escopo) => {
      // A negacao tambem entra na trilha, e aqui ela importa mais que o acerto:
      // "quem tentou abrir ficha de tenant que nao e dele" e exatamente o que se
      // procura depois de um incidente. Sem esta linha, so o sucesso deixava rastro.
      if (!escopo.includes(p.tenant_id)) {
        audit({ evento: "negado_escopo_PII", identidade: id.label, relatorio: "ficha_cliente",
                tenant: p.tenant_id, cliente_id: p.cliente_id });
        throw new Error(`Tenant '${p.tenant_id}' fora do escopo desta identidade.`);
      }
      const res = await pool.query(`select relatorio.fn_ficha_cliente($1::uuid, $2::uuid) as ficha`, [p.tenant_id, p.cliente_id]);
      const ficha = res.rows[0]?.ficha ?? null;
      audit({ evento: "PII_ficha_cliente", identidade: id.label, tenant: p.tenant_id, cliente_id: p.cliente_id,
              achou: ficha ? "sim" : "nao" });
      return {
        meta: { as_of: new Date().toISOString(), tenant: p.tenant_id, cliente_id: p.cliente_id,
                achou: !!ficha, unidade_monetaria: "centavos",
                nota: "Dado pessoal. Use no que foi perguntado e nao o repita em resumo que nao precise dele." },
        dados: ficha,
      };
    },
  },
};

async function runTool(nome: string, params: Record<string, any>, identity: Identity, escopo: string[]): Promise<any> {
  const def = TOOLS[nome];
  if (!def) throw new Error(`Relatorio desconhecido: ${nome}`);
  if (def.pii && !identity.pii) {
    audit({ evento: "negado_pii", identidade: identity.label, relatorio: nome });
    throw new Error("Esta identidade nao tem acesso a dado pessoal (ficha_cliente).");
  }
  return def.run(params ?? {}, identity, escopo);
}

// -------------------------------------------------------------------- escopo
/** "*" vira a lista real de tenants do banco, resolvida no arranque. */
let TENANTS_DO_BANCO: string[] = [];
function escopoDe(id: Identity): string[] {
  return id.tenants.includes("*") ? TENANTS_DO_BANCO : id.tenants;
}

// -------------------------------------------------------------------- MCP
function buildMcpServer(identity: Identity): McpServer {
  const server = new McpServer({ name: "financeiro-relatorio", version: "0.1.0" });
  for (const [nome, def] of Object.entries(TOOLS)) {
    server.registerTool(
      nome,
      { title: def.title, description: def.description, inputSchema: def.input },
      async (args: Record<string, any>) => {
        try {
          const data = await runTool(nome, args ?? {}, identity, escopoDe(identity));
          return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text" as const, text: `erro: ${err.message}` }], isError: true };
        }
      },
    );
  }
  return server;
}

// -------------------------------------------------------------- app / auth
const app = express();
app.set("trust proxy", 1);   // nginx no mesmo host; nunca X-Forwarded-For arbitrario
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

let oauthProvider: ReturnType<typeof installOAuth> | null = null;
let PROTECTED_RESOURCE_METADATA = "";

async function resolveIdentity(req: Request): Promise<Identity | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const incoming = Buffer.from(token);
  for (const id of IDENTITIES) {
    const known = Buffer.from(id.token);
    if (incoming.length === known.length && timingSafeEqual(incoming, known)) return id;
  }
  if (oauthProvider) {
    try {
      const info = await oauthProvider.verifyAccessToken(token);
      const label = (info.extra?.identityLabel as string) ?? "";
      const id = IDENTITIES.find((i) => i.label === label);
      if (id) return id;
    } catch { /* nao e access token valido -> 401 */ }
  }
  return null;
}

function instalarRotasProtegidas() {
  app.use(async (req, res, next) => {
    const identity = await resolveIdentity(req);
    if (!identity) {
      audit({ evento: "auth_negada", rota: req.path, ip: (req.headers["x-forwarded-for"] as string) ?? req.ip });
      if (req.path === "/mcp" && PROTECTED_RESOURCE_METADATA) {
        res.set("WWW-Authenticate", `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA}"`);
      }
      return res.status(401).json({ error: "nao autorizado" });
    }
    res.locals.identity = identity;
    next();
  });

  // REST: relatorio pelo sistema.
  app.post("/v1/report", async (req: Request, res: Response) => {
    try {
      const { name, params } = req.body ?? {};
      if (!name) return res.status(400).json({ error: "campo 'name' obrigatorio" });
      const identity = res.locals.identity as Identity;
      const result = await runTool(name, params ?? {}, identity, escopoDe(identity));
      res.json({ name, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/v1/reports", (_req, res) =>
    res.json(Object.entries(TOOLS).map(([name, d]) => ({ name, title: d.title, pii: !!d.pii }))));

  // MCP: Streamable HTTP, sessao por mcp-session-id.
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const sessionIdentity: Record<string, string> = {};

  app.post("/mcp", async (req: Request, res: Response) => {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    const identity = res.locals.identity as Identity;
    if (sid && transports[sid]) {
      if (sessionIdentity[sid] !== identity.token) {
        res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "identidade nao confere com a sessao" }, id: null });
        return;
      }
      await transports[sid].handleRequest(req, res, req.body);
      return;
    }
    if (!sid && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { transports[id] = transport; sessionIdentity[id] = identity.token; },
      });
      transport.onclose = () => {
        if (transport.sessionId) { delete transports[transport.sessionId]; delete sessionIdentity[transport.sessionId]; }
      };
      await buildMcpServer(identity).connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }
    // SESSAO DESCONHECIDA -> 404, nao 400. A diferenca nao e cosmetica: pela
    // spec do Streamable HTTP, 404 e o sinal de "essa sessao nao existe mais,
    // abra outra", e o cliente re-inicializa sozinho. Com 400 ele trata como
    // erro de protocolo e a integracao fica morta ate alguem reconectar na mao
    // -- medido em 21/09: um `systemctl restart` derrubou o connector e toda
    // chamada seguinte respondia "Sessao invalida" sem se recuperar. As sessoes
    // vivem em memoria, entao TODO restart cai neste caminho.
    if (sid) {
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Sessao expirada -- reinicialize" }, id: null });
      return;
    }
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Requisicao sem sessao e sem initialize" }, id: null });
  });

  const streamOrClose = async (req: Request, res: Response) => {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    // Mesmo motivo do POST: sessao inexistente e 404 (o cliente reabre), nao 400.
    if (!sid) { res.status(400).send("Falta o cabecalho mcp-session-id"); return; }
    if (!transports[sid]) { res.status(404).send("Sessao expirada -- reinicialize"); return; }
    const identity = res.locals.identity as Identity;
    if (sessionIdentity[sid] !== identity.token) { res.status(401).send("identidade nao confere com a sessao"); return; }
    await transports[sid].handleRequest(req, res);
  };
  app.get("/mcp", streamOrClose);
  app.delete("/mcp", streamOrClose);
}

// ------------------------------------------------------------------- boot
/**
 * O arranque CONFERE antes de escutar: role segura, catalogo legivel, tenants
 * resolvidos. Banco fora do ar deixa o servico sem subir -- e o systemd
 * reinicia. E o contrario de subir sem saber com que credencial se conectou.
 */
async function main() {
  const diag = await conferirRole();
  console.log(`[boot] role '${diag.usuario}': sem superuser, sem bypassrls, sem escrita, nada fora de 'relatorio'`);
  if (diag.infraestrutura.length) {
    console.log(`[boot] privilegio herdado de extensao (declarado, nao silenciado): ${diag.infraestrutura.join(", ")}`);
  }

  await carregarCatalogo();
  console.log(`[boot] catalogo: ${CATALOGO.size} tabelas legiveis`);

  const t = await pool.query<{ tenant_id: string; tenant: string }>(
    `select tenant_id, tenant from relatorio.v_tenant order by tenant`);
  TENANTS_DO_BANCO = t.rows.map((r) => r.tenant_id);
  const nomePorId = new Map(t.rows.map((r) => [r.tenant_id, r.tenant]));

  for (const id of IDENTITIES) {
    const escopo = escopoDe(id);
    const nomes = escopo.map((x) => nomePorId.get(x) ?? `${x} (NAO EXISTE NO BANCO)`);
    console.log(`[boot] identidade '${id.label}': ${escopo.length} tenant(s)${id.pii ? " (pii)" : ""} -> ${nomes.join(", ")}`);
    if (id.tenants.includes("*")) {
      console.log(`[boot]   ATENCAO: '${id.label}' usa "*" -- tenant novo entra no escopo dela no proximo restart.`);
    }
    for (const x of escopo) if (!nomePorId.has(x)) console.warn(`[boot]   aviso: tenant ${x} nao existe no banco.`);
  }

  if (PUBLIC_BASE_URL && OAUTH_LOGIN_PASSWORD) {
    const oauthIdentity = IDENTITIES.find((i) => i.label === OAUTH_IDENTITY_LABEL);
    if (!oauthIdentity) throw new Error(`OAUTH_IDENTITY_LABEL='${OAUTH_IDENTITY_LABEL}' nao existe em IDENTITIES.`);
    oauthProvider = installOAuth(app, {
      baseUrl: new URL(PUBLIC_BASE_URL),
      loginPassword: OAUTH_LOGIN_PASSWORD,
      storePath: OAUTH_STORE_PATH,
      identityLabel: OAUTH_IDENTITY_LABEL,
      scopesSupported: ["relatorio"],
      displayTenants: escopoDe(oauthIdentity).map((x) => nomePorId.get(x) ?? x),
      displayPii: oauthIdentity.pii,
      audit,
    });
    PROTECTED_RESOURCE_METADATA = new URL("/.well-known/oauth-protected-resource", PUBLIC_BASE_URL).href;
    console.log(`[boot] OAuth ligado em ${PUBLIC_BASE_URL} (identidade '${OAUTH_IDENTITY_LABEL}')`);
  } else {
    console.log("[boot] OAuth DESLIGADO (sem PUBLIC_BASE_URL/OAUTH_LOGIN_PASSWORD) -- so bearer estatico.");
  }

  instalarRotasProtegidas();
  app.listen(PORT, HOST, () => console.log(`financeiro-relatorio-mcp on ${HOST}:${PORT}`));
}

main().catch((err) => {
  console.error(`[boot] FALHOU: ${err.message}`);
  process.exit(1);
});
