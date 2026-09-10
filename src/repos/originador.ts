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
import { poolDoCrm } from '../crm/pool-de-leitura.ts';
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
  /** Regra 6: o id do VENDEDOR no CRM. Ver `casarComOVendedorDoCrm`. */
  crm_user_id?: string | null;
  telefone?: string | null;
  email?: string | null;
};

export type EdicaoOriginador = Partial<Omit<NovoOriginador, 'crm_partner_id' | 'crm_user_id'>>;

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
        crm_user_id: uuidOuNull(e.crm_user_id, 'crm_user_id'),
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
/* ==========================================================================
 * QUEM E QUEM NO OUTRO SISTEMA — 10/09/2026
 * ==========================================================================
 *
 * O QUE ISTO FECHA. `credito-originador.ts` confere o originador do contrato
 * contra o credito congelado do CRM, e ate hoje a unica comparacao possivel para
 * o VENDEDOR era por NOME - o proprio arquivo dizia por escrito que a chave
 * faltava. O preco estava medido em producao: 29 divergencias por rodada, de 15
 * em 15 minutos, das quais **28 eram a mesma pessoa com dois nomes**:
 *
 *     26 x  aqui "Renata Ferreira Estevam"  x  la "Renata"
 *      2 x  aqui "Alice Ribeiro Franca"     x  la "Out Sales"
 *
 * A migration 40 criou `originador.crm_user_id`, e estas duas funcoes sao a
 * porta pela qual alguem que NAO tem terminal faz o casamento.
 *
 * ⚠️ POR QUE `crm_user_id` E EDITAVEL E `crm_partner_id` NAO. O do parceiro
 * chega pelo proprio conector, que ja sabe o id quando cria; este ninguem
 * descobre sozinho - e um julgamento humano ("a Renata do CRM e esta pessoa
 * daqui"), e as duas linhas que ele resolve sao de originadores que **ja
 * existiam** antes da coluna. Sem edicao, a coluna nasceria util so para quem
 * fosse cadastrado depois dela.
 */

/** UUID, ou `null`. Recusa o resto com o nome do campo - um id malformado aqui
 *  viraria uma comparacao que nunca casa, e o sintoma seria a divergencia
 *  continuar aparecendo sem ninguem entender por que. */
function uuidOuNull(v: string | null | undefined, campo: string): string | null {
  if (v == null || String(v).trim() === '') return null;
  const t = String(v).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    throw Object.assign(new TypeError(`${campo} deve ser identificador do outro sistema, recebeu "${t}".`),
                        { status: 422 });
  }
  return t;
}

/**
 * Casa (ou descasa) este originador com uma pessoa do CRM.
 *
 * `null` DESFAZ, e isso e proposital: casar errado e um erro que alguem comete e
 * precisa poder desfazer sem chamar ninguem. Desfeito, a conferencia volta a
 * comparar por nome - que e o comportamento de antes, e nao um buraco novo.
 */
export async function casarComOVendedorDoCrm(id: string, crmUserId: string | null) {
  await exigir('escrever_cadastro');
  const r = await dbt().originador.updateMany({
    where: { id },
    data: { crm_user_id: uuidOuNull(crmUserId, 'crm_user_id') },
  });
  if (r.count === 0) throw Object.assign(new Error('Originador nao encontrado.'), { status: 404 });
}

export type VendedorDoCrm = {
  vendedor: string;
  crm_user_id: string;
  /** Quantos creditos VIGENTES essa pessoa tem. E o que separa quem vende de
   *  quem aparece uma vez, e a tela ordena por ele. */
  creditos: number;
};

/**
 * QUEM VENDE, DO LADO DE LA — para a tela poder oferecer uma LISTA.
 *
 * ⚠️ A ALTERNATIVA ERA PEDIR O IDENTIFICADOR COLADO, e ela nao serve. Quem opera
 * nao tem como descobrir um uuid do CRM, e um campo assim seria "um campo que so
 * o psql alcanca" com outra roupa - exatamente o defeito historico que este
 * projeto passou o dia fechando. Oferecer os nomes que EXISTEM la, com quantos
 * creditos cada um tem, transforma o casamento num clique.
 *
 * LE O OUTRO BANCO, pela role sem BYPASSRLS e sempre FORA de transacao - a mesma
 * disciplina de `destrave.lerNoCrm`, que foi a primeira rota a fazer isso. O
 * pool e preguicoso: quem nunca abrir esta tela nunca abre conexao.
 *
 * REGRA 4: SELECT, e so. Nada aqui escreve no CRM, em nenhuma circunstancia.
 *
 * ⚠️ NAO CHAMA `exigir` AQUI, e a ausencia e obrigatoria e nao esquecimento:
 * `exigir` resolve o papel dentro da unidade de trabalho, e esta funcao roda
 * FORA dela por construcao. Quem confere o papel e a leitura que vem antes -
 * `crmTenantIdDoConector`, dentro do contexto - e sem ela nao ha `crmTenantId`
 * para chegar aqui. Mesma divisao de `destrave.lerNoCrm`, que tambem le o outro
 * banco depois de uma leitura nossa ter autorizado.
 */
export async function vendedoresDoCrm(crmTenantId: string): Promise<VendedorDoCrm[]> {
  const pool = await poolDoCrm();
  const r = await pool.query(
    `select vendedor, vendedor_user_id, count(*)::int as creditos
       from financeiro.vendas_creditadas
      where crm_tenant_id = $1 and vigente and vendedor_user_id is not null
      group by vendedor, vendedor_user_id
      order by creditos desc, vendedor`,
    [crmTenantId]);
  return (r.rows as Array<{ vendedor: string | null; vendedor_user_id: string; creditos: number }>)
    .map((x) => ({ vendedor: x.vendedor ?? '(sem nome no outro sistema)', crm_user_id: x.vendedor_user_id, creditos: x.creditos }));
}

/** O `crm_tenant_id` do conector deste tenant. Sai daqui porque a leitura acima
 *  precisa dele e ele NAO e o nosso `tenant_id` - regra 6, e o modo de falha de
 *  trocar um pelo outro e devolver zero linhas sem erro. */
export async function crmTenantIdDoConector(): Promise<string | null> {
  await exigir('ler');
  const c = await dbt().conector_crm.findFirst({ select: { crm_tenant_id: true } });
  return c?.crm_tenant_id ?? null;
}

export async function desativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().originador.updateMany({ where: { id }, data: { ativo: false } });
  if (r.count === 0) throw Object.assign(new Error('Originador nao encontrado.'), { status: 404 });
}
