// Repositorio de cliente. CLAUDE.md 1 (centavos), 2 (tenant nunca vem do
// chamador), 11 (indice parcial nao e caminho de navegacao). R7-R9 ficam em
// dominio/documento.ts e nao sao reimplementadas aqui.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { classificar, type OrigemDocumento } from '../dominio/documento.ts';

export type NovoCliente = {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  crm_lead_id?: string | null;
  documento_bruto?: string | null;
  documento_origem?: OrigemDocumento;
  /** Decimal como STRING. Number aqui e a porta de entrada do float numa
   *  grandeza fisica - CLAUDE.md 1 proibe float ate em calculo intermediario. */
  consumo_kwh?: string | null;
  consumo_referencia_centavos?: number | null;
};

export type EdicaoCliente = Partial<Omit<NovoCliente, 'crm_lead_id'>>;

/** CLAUDE.md 1: se chegou float, morre aqui - nao no fechamento do mes. */
function centavos(v: number | null | undefined, campo: string): number | null {
  if (v == null) return null;
  if (!Number.isInteger(v)) throw new TypeError(`${campo} deve ser Int em centavos, recebeu ${v}`);
  return v;
}

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

export async function criar(e: NovoCliente) {
  await exigir('escrever_cadastro');
  const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');

  return dbt().cliente.create({
    data: {
      // NUNCA do chamador, e a defesa nao e a policy WITH CHECK - e nao existir
      // parametro. Este e o unico ponto do cadastro onde uma escrita poderia
      // atravessar tenant, e o que nao entra na assinatura nao vaza.
      tenant_id: tenantCorrente(),
      nome: e.nome.trim(),
      telefone: limpar(e.telefone),
      email: limpar(e.email)?.toLowerCase() ?? null,
      origem: limpar(e.origem),
      crm_lead_id: e.crm_lead_id ?? null,
      documento: d.documento,
      documento_tipo: d.documento_tipo,
      documento_validado: d.documento_validado,   // R8: semente do CRM entra FALSE
      documento_origem: d.documento_origem,
      consumo_kwh: e.consumo_kwh ?? null,
      consumo_referencia_centavos: centavos(e.consumo_referencia_centavos, 'consumo_referencia_centavos'),
    },
  });
}

/**
 * CLAUDE.md 11 na pratica.
 *
 * `cliente_documento_unico` e PARCIAL (WHERE documento IS NOT NULL). O Prisma 7.9
 * exclui indice parcial das chaves de findUnique - verificado no DMMF, as chaves
 * de cliente sao so [tenant_id+id] - entao nem existe findUnique por documento.
 * E se existisse nao deveria ser usado: com documento nulo a chave nao e unica.
 *
 * findFirst com o predicado explicito, e null nunca chega ao banco. O tenant sai
 * da RLS, nao de um WHERE.
 */
export async function porDocumento(bruto: string | null | undefined) {
  await exigir('ler');
  const { documento } = classificar(bruto, 'coleta_local');
  if (documento === null) return null;
  return dbt().cliente.findFirst({ where: { documento } });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().cliente.findFirst({ where: { id } });
}

/** Lead do CRM -> cliente local. Tambem parcial: crm_lead_id nulo nao localiza. */
export async function porLeadDoCrm(crmLeadId: string | null | undefined) {
  await exigir('ler');
  if (!crmLeadId) return null;
  return dbt().cliente.findFirst({ where: { crm_lead_id: crmLeadId } });
}

export async function listar(opcoes: { ativo?: boolean; limite?: number } = {}) {
  await exigir('ler');
  return dbt().cliente.findMany({
    where: opcoes.ativo === undefined ? {} : { ativo: opcoes.ativo },
    orderBy: [{ nome: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

/**
 * R8 continua valendo na edicao: documento reenviado com origem 'crm_semente'
 * NAO passa a valer, mesmo com digito correto. Por isso a reclassificacao passa
 * pelo dominio em vez de um UPDATE direto no campo.
 */
export async function editar(id: string, e: EdicaoCliente) {
  await exigir('escrever_cadastro');

  const dados: Record<string, unknown> = {};
  if (e.nome !== undefined)     dados.nome = e.nome.trim();
  if (e.telefone !== undefined) dados.telefone = limpar(e.telefone);
  if (e.email !== undefined)    dados.email = limpar(e.email)?.toLowerCase() ?? null;
  if (e.origem !== undefined)   dados.origem = limpar(e.origem);
  if (e.consumo_kwh !== undefined) dados.consumo_kwh = e.consumo_kwh ?? null;
  if (e.consumo_referencia_centavos !== undefined) {
    dados.consumo_referencia_centavos =
      centavos(e.consumo_referencia_centavos, 'consumo_referencia_centavos');
  }
  if (e.documento_bruto !== undefined) {
    const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
    dados.documento = d.documento;
    dados.documento_tipo = d.documento_tipo;
    dados.documento_validado = d.documento_validado;
    dados.documento_origem = d.documento_origem;
  }
  if (Object.keys(dados).length === 0) return;

  // updateMany e nao update: `update` usa chave unica e lanca P2025 quando a RLS
  // esconde a linha - erro de "nao existe" que na verdade e "outro tenant".
  // updateMany devolve count 0 e a decisao sobre o 404 fica aqui.
  const r = await dbt().cliente.updateMany({ where: { id }, data: dados });
  if (r.count === 0) throw Object.assign(new Error('Cliente nao encontrado.'), { status: 404 });
}

/** Baixa logica. Nunca DELETE: contrato, UC e comissao apontam para ca. */
export async function desativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().cliente.updateMany({ where: { id }, data: { ativo: false } });
  if (r.count === 0) throw Object.assign(new Error('Cliente nao encontrado.'), { status: 404 });
}
