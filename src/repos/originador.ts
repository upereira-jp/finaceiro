// Repositorio de originador - quem origina a venda e recebe comissao.
//
// R20 MORA NO CONTRATO, NAO AQUI. `originador_tipo` muda com o tempo (um
// parceiro captador vira senior), e a comissao de um contrato fechado NAO muda
// junto: contrato.ts congela `originador_tipo_no_fechamento` no fechamento. Este
// arquivo edita o cadastro de hoje e nao retroage nada - e o comentario existe
// porque a tentacao de "corrigir o tipo e reprocessar" e exatamente o erro.
//
// PENDENCIA CONHECIDA, nao inventada aqui: `originador_tipo` nao distingue
// socio, e a decisao depende da reuniao com o contador (RESUMO-SESSAO-6,
// pendencias gerais). Nao ha default escolhido "porque parecia razoavel" - o
// tipo e obrigatorio na assinatura.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { classificar, type OrigemDocumento } from '../dominio/documento.ts';
import type {
  natureza_pessoa as NaturezaPessoa, originador_tipo as OriginadorTipo,
  tipo_conta_bancaria as TipoConta, tipo_chave_pix as TipoChavePix,
} from '../generated/prisma/enums.ts';

export type DadosDeRepasse = {
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  tipo_conta?: TipoConta | null;
  chave_pix?: string | null;
  tipo_chave_pix?: TipoChavePix | null;
};

export type NovoOriginador = DadosDeRepasse & {
  nome: string;
  natureza: NaturezaPessoa;
  tipo: OriginadorTipo;
  /** Obrigatorio: a coluna e NOT NULL. Diferente de cliente, onde e opcional. */
  documento_bruto: string;
  documento_origem?: OrigemDocumento;
  crm_partner_id?: string | null;
  telefone?: string | null;
  email?: string | null;
};

export type EdicaoOriginador = Partial<Omit<NovoOriginador, 'crm_partner_id'>>;

export class DocumentoObrigatorio extends Error {
  readonly status = 422;
  constructor(entidade: string) {
    super(`${entidade} exige documento: a coluna e NOT NULL no schema.`);
    this.name = 'DocumentoObrigatorio';
  }
}

export class DocumentoDeOriginadorJaExiste extends Error {
  readonly status = 409;
  constructor(doc: string) {
    super(`Ja existe originador com o documento ${doc} neste tenant.`);
    this.name = 'DocumentoDeOriginadorJaExiste';
  }
}

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

/** Os campos de repasse, normalizados. Dado bancario e dado de negocio, nao
 *  segredo - a regra 5 fala de credencial de integracao, nao de conta. */
function repasse(e: DadosDeRepasse): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  if (e.banco !== undefined)      d.banco = limpar(e.banco);
  if (e.agencia !== undefined)    d.agencia = limpar(e.agencia);
  if (e.conta !== undefined)      d.conta = limpar(e.conta);
  if (e.tipo_conta !== undefined) d.tipo_conta = e.tipo_conta ?? null;
  if (e.chave_pix !== undefined)  d.chave_pix = limpar(e.chave_pix);
  if (e.tipo_chave_pix !== undefined) d.tipo_chave_pix = e.tipo_chave_pix ?? null;
  return d;
}

export async function criar(e: NovoOriginador) {
  await exigir('escrever_cadastro');
  const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
  if (d.documento === null || d.documento_tipo === null) throw new DocumentoObrigatorio('Originador');

  try {
    return await dbt().originador.create({
      data: {
        tenant_id: tenantCorrente(),
        nome: e.nome.trim(),
        natureza: e.natureza,
        tipo: e.tipo,
        crm_partner_id: e.crm_partner_id ?? null,
        documento: d.documento,
        documento_tipo: d.documento_tipo,
        documento_validado: d.documento_validado,   // R8: semente do CRM entra FALSE
        telefone: limpar(e.telefone),
        email: limpar(e.email)?.toLowerCase() ?? null,
        ...repasse(e),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new DocumentoDeOriginadorJaExiste(d.documento);
    throw err;
  }
}

/**
 * `originador_documento_unico` e unique CHEIO - sem predicado, porque documento
 * aqui e NOT NULL. Por isso findUnique e legitimo, ao contrario de cliente, onde
 * o mesmo indice e parcial (WHERE documento IS NOT NULL) e o caminho e findFirst.
 * Mesmo nome de invariante, tabelas diferentes, mecanismos diferentes.
 */
export async function porDocumento(bruto: string | null | undefined) {
  await exigir('ler');
  const { documento } = classificar(bruto, 'coleta_local');
  if (documento === null) return null;
  return dbt().originador.findUnique({
    where: { tenant_id_documento: { tenant_id: tenantCorrente(), documento } },
  });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().originador.findFirst({ where: { id } });
}

/** crm_partner_id nao tem indice unico: findFirst com predicado explicito. */
export async function porParceiroDoCrm(crmPartnerId: string | null | undefined) {
  await exigir('ler');
  if (!crmPartnerId) return null;
  return dbt().originador.findFirst({ where: { crm_partner_id: crmPartnerId } });
}

export async function listar(opcoes: { ativo?: boolean; tipo?: OriginadorTipo; limite?: number } = {}) {
  await exigir('ler');
  const where: Record<string, unknown> = {};
  if (opcoes.ativo !== undefined) where.ativo = opcoes.ativo;
  if (opcoes.tipo !== undefined)  where.tipo = opcoes.tipo;
  return dbt().originador.findMany({
    where,
    orderBy: [{ nome: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

/**
 * Mudar `tipo` vale de HOJE EM DIANTE. Contrato ja fechado continua com o tipo
 * congelado no fechamento - e por isso a comissao dele nao muda. Se a intencao
 * for corrigir um contrato especifico, o caminho e o contrato, nao o cadastro.
 */
export async function editar(id: string, e: EdicaoOriginador) {
  await exigir('escrever_cadastro');

  const dados: Record<string, unknown> = { ...repasse(e) };
  if (e.nome !== undefined)     dados.nome = e.nome.trim();
  if (e.natureza !== undefined) dados.natureza = e.natureza;
  if (e.tipo !== undefined)     dados.tipo = e.tipo;
  if (e.telefone !== undefined) dados.telefone = limpar(e.telefone);
  if (e.email !== undefined)    dados.email = limpar(e.email)?.toLowerCase() ?? null;
  if (e.documento_bruto !== undefined) {
    const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
    if (d.documento === null || d.documento_tipo === null) throw new DocumentoObrigatorio('Originador');
    dados.documento = d.documento;
    dados.documento_tipo = d.documento_tipo;
    dados.documento_validado = d.documento_validado;   // R8 vale na edicao tambem
  }
  if (Object.keys(dados).length === 0) return;

  const r = await dbt().originador.updateMany({ where: { id }, data: dados });
  if (r.count === 0) throw Object.assign(new Error('Originador nao encontrado.'), { status: 404 });
}

/** Baixa logica. Nunca DELETE: contrato aponta para ca e a comissao historica
 *  precisa continuar resolvendo o nome de quem recebeu. */
export async function desativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().originador.updateMany({ where: { id }, data: { ativo: false } });
  if (r.count === 0) throw Object.assign(new Error('Originador nao encontrado.'), { status: 404 });
}
