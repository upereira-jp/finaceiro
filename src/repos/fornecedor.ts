// FORNECEDOR — a quem a empresa paga (migration 44, 06/10/2026).
//
// DE ONDE ISTO VEM: na planilha `G3Solar_Financeiro.xlsx` o «FORNECEDOR / CREDOR»
// era texto livre, e no sistema continuou sendo (`conta_pagar.beneficiario_nome`)
// até a etapa 1 do controle total (`PLANO-empresa-controle-total-2026-10-06.md`).
// Texto livre não responde «quanto pagamos à imobiliária este ano»: «Imobiliária X»
// num mês e «Imob. X» no outro eram dois credores. O cadastro é o que os cartões
// (etapa 2) e as pessoas (etapa 3) vão apontar.
//
// O QUE ESTE ARQUIVO NÃO FAZ: não obriga ninguém a cadastrar. A despesa continua
// aceitando só o nome escrito (ou nada), como a planilha; o cadastro é o caminho
// melhor, oferecido na hora («cadastrar este»), e não uma porta trancada.
//
// O DOCUMENTO é conferido pelo dígito (`dominio/documento.ts`) e guardado
// NORMALIZADO; a chave Pix passa pelo `conferirChavePix`, que o cadastro do dono da
// usina ainda não usa — aqui ela entra desde o primeiro dia.

import { Prisma } from '../generated/prisma/client.ts';
import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { normalizar, detectarTipo, validar } from '../dominio/documento.ts';
import { conferirChavePix } from '../dominio/chave-pix.ts';
import { ACENTUADAS, SEM_ACENTO, padraoDeBusca } from '../dominio/lista-de-contas.ts';
import type { tipo_conta_bancaria as TipoConta } from '../generated/prisma/enums.ts';

const erro = (status: number, mensagem: string) => Object.assign(new Error(mensagem), { status });
const textoLivre = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const semAcento = (expr: Prisma.Sql) => Prisma.sql`lower(translate(${expr}, ${ACENTUADAS}, ${SEM_ACENTO}))`;

export type DadosDoFornecedor = {
  nome?: unknown;
  documento?: unknown;
  contato?: unknown;
  categoria_padrao_id?: unknown;
  centro_padrao_id?: unknown;
  banco?: unknown;
  agencia?: unknown;
  conta?: unknown;
  tipo_conta?: unknown;
  chave_pix?: unknown;
  tipo_chave_pix?: unknown;
  observacao?: unknown;
  ativo?: unknown;
};

/** O documento normalizado e o tipo, ou o erro que diz por que não. Vazio é «sem documento». */
function documento(v: unknown): { documento: string | null; documento_tipo: 'cpf' | 'cnpj' | null } {
  const bruto = textoLivre(v);
  if (!bruto) return { documento: null, documento_tipo: null };
  const d = normalizar(bruto);
  const tipo = detectarTipo(d);
  if (!tipo || !validar(d)) {
    throw erro(422, `«${bruto}» não é um CPF nem um CNPJ válido: o dígito verificador não confere.`);
  }
  return { documento: d, documento_tipo: tipo };
}

/** A chave Pix conferida pelo tipo, ou nada. Tipo sem chave (ou chave sem tipo) é erro. */
function chavePix(chave: unknown, tipo: unknown): { chave_pix: string | null; tipo_chave_pix: any } {
  const c = textoLivre(chave);
  if (!c && !textoLivre(tipo)) return { chave_pix: null, tipo_chave_pix: null };
  if (!c) throw erro(422, 'Escolheu o tipo da chave Pix mas não escreveu a chave.');
  const r = conferirChavePix(tipo, c);
  if (!r.ok) throw erro(422, `Chave Pix: ${r.motivo}`);
  return { chave_pix: r.chave, tipo_chave_pix: tipo };
}

const TIPOS_DE_CONTA: readonly TipoConta[] = ['corrente', 'poupanca'];

/** Converte o corpo nos campos da tabela. Só o que veio é tocado (PATCH). */
function campos(e: DadosDoFornecedor, criando: boolean) {
  const data: Record<string, unknown> = {};
  if (criando || e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'O fornecedor precisa de um nome.');
    data.nome = nome;
  }
  if (e.documento !== undefined) Object.assign(data, documento(e.documento));
  if (e.chave_pix !== undefined || e.tipo_chave_pix !== undefined) Object.assign(data, chavePix(e.chave_pix, e.tipo_chave_pix));
  for (const k of ['contato', 'banco', 'agencia', 'conta', 'observacao'] as const) {
    if (e[k] !== undefined) data[k] = textoLivre(e[k]);
  }
  if (e.tipo_conta !== undefined) {
    const t = textoLivre(e.tipo_conta);
    if (t && !(TIPOS_DE_CONTA as readonly string[]).includes(t)) throw erro(422, 'Tipo de conta: corrente ou poupança.');
    data.tipo_conta = t;
  }
  if (e.categoria_padrao_id !== undefined) data.categoria_padrao_id = textoLivre(e.categoria_padrao_id);
  if (e.centro_padrao_id !== undefined) data.centro_padrao_id = textoLivre(e.centro_padrao_id);
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  return data;
}

/**
 * O MESMO NOME DUAS VEZES é o defeito que o cadastro existe para acabar — o «Imob.
 * X» e a «Imobiliária X». O banco garante o documento único; o nome, sem acento e
 * sem caixa, é conferido aqui, e o erro diz qual já existe.
 */
async function nomeLivre(nome: string, menos?: string) {
  const [ja] = await dbt().$queryRaw<Array<{ nome: string }>>(Prisma.sql`
    SELECT nome FROM fornecedor
     WHERE ${semAcento(Prisma.sql`nome`)} = ${semAcento(Prisma.sql`${nome}`)}
       ${menos ? Prisma.sql`AND id <> ${menos}::uuid` : Prisma.empty}
     LIMIT 1`);
  if (ja) throw erro(409, `Já existe o fornecedor «${ja.nome}». Use o cadastro que existe, ou dê outro nome.`);
}

async function documentoLivre(doc: string | null, menos?: string) {
  if (!doc) return;
  const ja = await dbt().fornecedor.findFirst({ where: { documento: doc, ...(menos ? { id: { not: menos } } : {}) } });
  if (ja) throw erro(409, `Este CPF/CNPJ já é do fornecedor «${ja.nome}».`);
}

export async function criar(e: DadosDoFornecedor) {
  await exigir('escrever_corporativo');
  const data = campos(e, true) as { nome: string; documento?: string | null };
  await nomeLivre(data.nome);
  await documentoLivre(data.documento ?? null);
  return dbt().fornecedor.create({ data: { tenant_id: tenantCorrente(), ...(data as any) } });
}

/** Editar ou desativar. NUNCA apagar: há despesa apontando para ele. */
export async function alterar(id: string, e: DadosDoFornecedor) {
  await exigir('escrever_corporativo');
  const atual = await dbt().fornecedor.findFirst({ where: { id } });
  if (!atual) throw erro(404, 'Fornecedor não encontrado.');
  const data = campos(e, false) as { nome?: string; documento?: string | null };
  if (data.nome && data.nome !== atual.nome) await nomeLivre(data.nome, id);
  if (data.documento !== undefined && data.documento !== atual.documento) await documentoLivre(data.documento, id);
  await dbt().fornecedor.update({ where: { id }, data: data as any });
  /* O nome gravado nas despesas EM ABERTO acompanha o cadastro; as pagas ficam com o
     nome que tinham quando foram pagas — é o que o comprovante diz. */
  if (data.nome && data.nome !== atual.nome) {
    await dbt().conta_pagar.updateMany({
      where: { fornecedor_id: id, status: { in: ['aberta', 'parcial'] } },
      data: { beneficiario_nome: data.nome },
    });
  }
}

export type ResumoDoFornecedor = {
  id: string; nome: string; documento: string | null; documento_tipo: string | null; contato: string | null;
  categoria_padrao_id: string | null; centro_padrao_id: string | null; ativo: boolean;
  chave_pix: string | null; tipo_chave_pix: string | null; banco: string | null; agencia: string | null;
  conta: string | null; tipo_conta: string | null; observacao: string | null;
  /** O que SAIU para ele nos últimos 12 meses (baixas não estornadas, com juros e menos desconto). */
  pago_12_meses_centavos: number;
  em_aberto_centavos: number;
  despesas: number;
  ultimo_vencimento: string | null;
};

/**
 * A LISTA com o resumo de cada um, numa consulta: o que se pagou nos últimos 12
 * meses (pela data da baixa, no dia de Goiânia), o que está em aberto e o último
 * vencimento. Busca no nome e no documento, sem acento dos dois lados.
 */
export async function listar(f: { busca?: string | null } = {}): Promise<ResumoDoFornecedor[]> {
  await exigir('ler_corporativo');
  const padrao = padraoDeBusca(f.busca);
  /* Pelo documento só quando a busca tem cara de documento (3+ letras/dígitos):
     sem isso, buscar «é» viraria «%%» e casaria todo mundo. */
  const doc = normalizar(f.busca ?? '');
  const porDocumento = doc.length >= 3 ? Prisma.sql` OR coalesce(fo.documento, '') LIKE ${'%' + doc + '%'}` : Prisma.empty;
  const linhas = await dbt().$queryRaw<Array<ResumoDoFornecedor & { pago_12_meses_centavos: bigint; em_aberto_centavos: bigint; despesas: bigint }>>(Prisma.sql`
    SELECT fo.id, fo.nome, fo.documento, fo.documento_tipo::text, fo.contato, fo.categoria_padrao_id, fo.centro_padrao_id,
           fo.ativo, fo.chave_pix, fo.tipo_chave_pix::text, fo.banco, fo.agencia, fo.conta, fo.tipo_conta::text, fo.observacao,
           coalesce((SELECT sum(p.valor_centavos + p.acrescimo_centavos - p.desconto_centavos)
                       FROM pagamento p JOIN conta_pagar c ON c.tenant_id = p.tenant_id AND c.id = p.conta_pagar_id
                      WHERE c.fornecedor_id = fo.id AND p.estornado_em IS NULL
                        AND p.data_pagamento > ((now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '12 months')), 0) AS pago_12_meses_centavos,
           coalesce((SELECT sum(c.valor_centavos - c.valor_pago_centavos) FROM conta_pagar c
                      WHERE c.fornecedor_id = fo.id AND c.status IN ('aberta', 'parcial')), 0) AS em_aberto_centavos,
           (SELECT count(*) FROM conta_pagar c WHERE c.fornecedor_id = fo.id AND c.status <> 'cancelada') AS despesas,
           (SELECT max(c.vencimento)::text FROM conta_pagar c WHERE c.fornecedor_id = fo.id AND c.status <> 'cancelada') AS ultimo_vencimento
      FROM fornecedor fo
     ${padrao ? Prisma.sql`WHERE ${semAcento(Prisma.sql`fo.nome`)} LIKE ${padrao}${porDocumento}` : Prisma.empty}
     ORDER BY fo.ativo DESC, ${semAcento(Prisma.sql`fo.nome`)} ASC
     LIMIT 1000`);
  return linhas.map((l) => ({
    ...l,
    pago_12_meses_centavos: Number(l.pago_12_meses_centavos),
    em_aberto_centavos: Number(l.em_aberto_centavos),
    despesas: Number(l.despesas),
  }));
}

/** A ficha: o cadastro e as despesas dele (as 100 mais recentes), com as baixas. */
export async function ficha(id: string) {
  await exigir('ler_corporativo');
  const fornecedor = await dbt().fornecedor.findFirst({ where: { id } });
  if (!fornecedor) throw erro(404, 'Fornecedor não encontrado.');
  const despesas = await dbt().conta_pagar.findMany({
    where: { fornecedor_id: id },
    select: {
      id: true, numero: true, descricao: true, valor_centavos: true, valor_pago_centavos: true, status: true,
      competencia: true, vencimento: true, categoria_id: true,
      pagamento: {
        where: { estornado_em: null },
        select: { id: true, data_pagamento: true, valor_centavos: true, acrescimo_centavos: true, desconto_centavos: true },
        orderBy: [{ data_pagamento: 'asc' }],
      },
    },
    orderBy: [{ vencimento: 'desc' }, { criado_em: 'desc' }],
    take: 100,
  });
  return { fornecedor, despesas };
}
