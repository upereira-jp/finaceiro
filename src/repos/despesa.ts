// DESPESAS DA EMPRESA — a planilha `G3Solar_Financeiro.xlsx` dentro do sistema.
//
// DE ONDE ISTO VEM: em 02/10/2026 o dono subiu a planilha com que a G3 controla
// as contas a pagar da EMPRESA e mandou que o processo passasse a funcionar aqui
// (`PLANO-planilha-empresa-2026-10-02.md`). Cada linha da aba «Lançamentos» vira
// uma `conta_pagar` manual; a aba «Cadastros» vira `categoria` e
// `origem_pagamento`; Painel, Dashboard e Projeção são LEITURAS, feitas no
// navegador sobre a lista que `listar()` devolve (`web/src/despesas-regras.ts`).
//
// O QUE ESTE ARQUIVO NAO FAZ, e a ausencia e a regra: nao toca conta nascida de
// split. Repasse e comissao do rateio tem regra propria (valor imutavel, origem
// unica) e moram em Contas a pagar; aqui so entra o que nasce a mao, e o CHECK
// `conta_pagar_planilha_so_a_mao` impede o caminho inverso.
//
// A SERIE (recorrente ou parcelada) e um `serie_id`, e nao o texto do historico
// como na planilha — la uma virgula a mais quebrava a recorrencia sem aviso.

import { randomUUID } from 'node:crypto';
import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import type {
  forma_de_pagamento as FormaDePagamento,
  natureza_despesa as Natureza,
  recorrencia_despesa as Recorrencia,
  tipo_origem_pagamento as TipoOrigem,
} from '../generated/prisma/enums.ts';

const erro = (status: number, mensagem: string) => Object.assign(new Error(mensagem), { status });

// ------------------------------------------------------ o que a planilha traz

/** O plano de contas da aba «Cadastros», na ordem dela. Só é gravado quando
 *  alguém pede, na tela («Começar com o plano da planilha») — nunca semeado. */
export const PLANO_DA_PLANILHA = [
  'Despesas Administrativas',
  'Despesas com Pessoal',
  'Tributos e Taxas',
  'Custos Operacionais - O&M Usinas',
  'Comissões e Repasses',
  'Despesas Comerciais e Marketing',
  'Tecnologia e Software',
  'Serviços de Terceiros',
  'Despesas Financeiras',
  'Veículos e Deslocamento',
  'Honorários Contábeis e Jurídicos',
  'Outras Despesas',
] as const;

/** A primeira origem da planilha. «Adiantamento Sócio 1/2» NÃO entram: a própria
 *  planilha pedia para trocar pelos nomes, e nome de sócio é o dono quem escreve. */
export const ORIGEM_DA_PLANILHA = 'Conta PJ G3 Solar';

export const FORMAS: readonly FormaDePagamento[] = [
  'pix', 'boleto', 'ted', 'doc', 'cartao_credito', 'debito_automatico', 'dinheiro', 'compensacao',
];
export const NATUREZAS: readonly Natureza[] = ['fixa', 'variavel'];
export const RECORRENCIAS: readonly Recorrencia[] = ['avulsa', 'mensal', 'trimestral', 'semestral', 'anual', 'parcelada'];
export const TIPOS_DE_ORIGEM: readonly TipoOrigem[] = ['conta_bancaria', 'socio', 'outra'];

/** Os meses entre dois títulos de uma série periódica — a coluna X da planilha. */
export const INTERVALO_EM_MESES: Partial<Record<Recorrencia, number>> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

function umDe<T extends string>(v: unknown, lista: readonly T[], campo: string): T {
  if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return v as T;
  throw erro(422, `${campo} inválido: ${JSON.stringify(v)}. Aceito: ${lista.join(', ')}.`);
}
const umDeOuNull = <T extends string>(v: unknown, lista: readonly T[], campo: string): T | null =>
  v === null || v === undefined || v === '' ? null : umDe(v, lista, campo);

function centavos(v: unknown, campo: string, minimo = 1): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < minimo) {
    throw erro(422, `${campo} precisa ser um inteiro de centavos ≥ ${minimo}; veio ${JSON.stringify(v)}.`);
  }
  return v;
}

const textoLivre = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

function link(v: unknown): string | null {
  const t = textoLivre(v);
  if (t && !/^https?:\/\//i.test(t)) {
    throw erro(422, 'O comprovante precisa ser um link que comece com http:// ou https://.');
  }
  return t;
}

/** O primeiro dia do mês, em UTC — a forma em que competência e «recorrente até» vivem. */
export const primeiroDia = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Soma meses a uma data sem transbordar: 31/01 + 1 mês é 28/02 (ou 29), não 03/03. */
export function somarMeses(d: Date, meses: number): Date {
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo)));
}

// ------------------------------------------------------ cadastros

export async function cadastros() {
  await exigir('ler_corporativo');
  const categorias = await dbt().categoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  const origens = await dbt().origem_pagamento.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  return { categorias, origens };
}

/**
 * «COMEÇAR COM O PLANO DA PLANILHA»: grava os itens da planilha que ainda não
 * existem, na ordem dela, e a Conta PJ se não houver origem nenhuma.
 *
 * Idempotente por nome — rodar duas vezes não duplica, e um item que o analista
 * já criou com o mesmo nome fica como está. Em SÉRIE, nunca `Promise.all`:
 * dentro da transação é uma conexão só.
 */
export async function comecarPelaPlanilha() {
  await exigir('escrever_corporativo');
  const tenant_id = tenantCorrente();
  const existentes = new Set((await dbt().categoria.findMany({ select: { nome: true } })).map((c) => c.nome));
  let criadas = 0;
  for (const [i, nome] of PLANO_DA_PLANILHA.entries()) {
    if (existentes.has(nome)) continue;
    await dbt().categoria.create({ data: { tenant_id, nome, ordem: i + 1 } });
    criadas++;
  }
  let origem = false;
  if ((await dbt().origem_pagamento.count()) === 0) {
    await dbt().origem_pagamento.create({ data: { tenant_id, nome: ORIGEM_DA_PLANILHA, tipo: 'conta_bancaria', ordem: 1 } });
    origem = true;
  }
  return { categorias_criadas: criadas, origem_criada: origem };
}

export async function criarCategoria(e: { nome: unknown }) {
  await exigir('escrever_corporativo');
  const nome = textoLivre(e.nome);
  if (!nome) throw erro(422, 'O plano de contas precisa de um nome.');
  const ultima = await dbt().categoria.aggregate({ _max: { ordem: true } });
  return dbt().categoria.create({
    data: { tenant_id: tenantCorrente(), nome, ordem: (ultima._max.ordem ?? 0) + 1 },
  });
}

/** Renomear, ativar ou desativar. NUNCA apagar: há conta classificada nela. */
export async function alterarCategoria(id: string, e: { nome?: unknown; ativo?: unknown }) {
  await exigir('escrever_corporativo');
  const data: { nome?: string; ativo?: boolean } = {};
  if (e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'O plano de contas precisa de um nome.');
    data.nome = nome;
  }
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  const r = await dbt().categoria.updateMany({ where: { id }, data });
  if (r.count === 0) throw erro(404, 'Plano de contas não encontrado.');
}

/** A ordem nova, inteira: a lista de ids na ordem em que a tela os mostra. */
export async function ordenarCategorias(ids: unknown) {
  await exigir('escrever_corporativo');
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw erro(422, 'ids precisa ser uma lista.');
  for (const [i, id] of (ids as string[]).entries()) {
    await dbt().categoria.updateMany({ where: { id }, data: { ordem: i + 1 } });
  }
}

export async function criarOrigem(e: { nome: unknown; tipo?: unknown }) {
  await exigir('escrever_corporativo');
  const nome = textoLivre(e.nome);
  if (!nome) throw erro(422, 'A origem precisa de um nome.');
  const ultima = await dbt().origem_pagamento.aggregate({ _max: { ordem: true } });
  return dbt().origem_pagamento.create({
    data: {
      tenant_id: tenantCorrente(), nome,
      tipo: umDe(e.tipo ?? 'conta_bancaria', TIPOS_DE_ORIGEM, 'tipo'),
      ordem: (ultima._max.ordem ?? 0) + 1,
    },
  });
}

export async function alterarOrigem(id: string, e: { nome?: unknown; tipo?: unknown; ativo?: unknown }) {
  await exigir('escrever_corporativo');
  const data: { nome?: string; tipo?: TipoOrigem; ativo?: boolean } = {};
  if (e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'A origem precisa de um nome.');
    data.nome = nome;
  }
  if (e.tipo !== undefined) data.tipo = umDe(e.tipo, TIPOS_DE_ORIGEM, 'tipo');
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  const r = await dbt().origem_pagamento.updateMany({ where: { id }, data });
  if (r.count === 0) throw erro(404, 'Origem não encontrada.');
}

// ------------------------------------------------------ lançar

export type NovaDespesa = {
  descricao: unknown;
  fornecedor: unknown;
  valor_centavos: unknown;
  competencia: Date;
  vencimento: Date;
  recorrencia?: unknown;
  /** Só para `parcelada`: quantas parcelas, de 2 a 360. O valor é o de CADA parcela. */
  parcelas?: unknown;
  recorrente_ate?: Date | null;
  categoria_id?: unknown;
  natureza?: unknown;
  forma_prevista?: unknown;
  origem_pagamento_id?: unknown;
  numero_documento?: unknown;
  comprovante_url?: unknown;
  observacao?: unknown;
};

/** Os campos que todo título da planilha carrega e que a série copia. */
function camposComuns(e: Omit<NovaDespesa, 'competencia' | 'vencimento' | 'recorrencia' | 'parcelas' | 'recorrente_ate'>) {
  const descricao = textoLivre(e.descricao);
  if (!descricao) throw erro(422, 'O histórico (o que é a despesa) é obrigatório.');
  const fornecedor = textoLivre(e.fornecedor);
  if (!fornecedor) throw erro(422, 'O fornecedor ou credor (a quem se paga) é obrigatório.');
  return {
    descricao,
    beneficiario_nome: fornecedor,
    valor_centavos: centavos(e.valor_centavos, 'valor_centavos'),
    categoria_id: textoLivre(e.categoria_id),
    natureza: umDeOuNull(e.natureza, NATUREZAS, 'natureza'),
    forma_prevista: umDeOuNull(e.forma_prevista, FORMAS, 'forma_prevista'),
    origem_pagamento_id: textoLivre(e.origem_pagamento_id),
    numero_documento: textoLivre(e.numero_documento),
    comprovante_url: link(e.comprovante_url),
    observacao: textoLivre(e.observacao),
  };
}

/**
 * Lança uma despesa: avulsa (um título), periódica (o PRIMEIRO título de uma
 * série — os seguintes a Projeção mostra e «Lançar o próximo» grava) ou
 * parcelada (TODAS as parcelas de uma vez, como a planilha pedia uma linha por
 * parcela, e cada uma vencendo um mês depois da anterior).
 */
export async function lancar(e: NovaDespesa) {
  await exigir('escrever_corporativo');
  const comum = camposComuns(e);
  const recorrencia = umDe(e.recorrencia ?? 'avulsa', RECORRENCIAS, 'recorrencia');
  const competencia = primeiroDia(e.competencia);
  const ate = e.recorrente_ate ? primeiroDia(e.recorrente_ate) : null;
  if (ate && !INTERVALO_EM_MESES[recorrencia]) {
    throw erro(422, '«Recorrente até» só vale para despesa mensal, trimestral, semestral ou anual.');
  }
  if (ate && ate < competencia) throw erro(422, '«Recorrente até» não pode ser antes da competência.');

  const base = {
    tenant_id: tenantCorrente(),
    beneficiario_tipo: 'outro' as const,
    ...comum,
    recorrencia,
    recorrente_ate: ate,
  };

  if (recorrencia === 'parcelada') {
    const total = e.parcelas;
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 2 || total > 360) {
      throw erro(422, 'Despesa parcelada precisa de 2 a 360 parcelas.');
    }
    const serie_id = randomUUID();
    const criadas = [];
    for (let i = 0; i < total; i++) {
      criadas.push(await dbt().conta_pagar.create({
        data: {
          ...base, serie_id, parcela_numero: i + 1, parcela_total: total,
          competencia: somarMeses(competencia, i), vencimento: somarMeses(e.vencimento, i),
        },
      }));
    }
    return criadas;
  }

  return [await dbt().conta_pagar.create({
    data: {
      ...base,
      serie_id: recorrencia === 'avulsa' ? null : randomUUID(),
      competencia, vencimento: e.vencimento,
    },
  })];
}

/** A conta manual, viva, ou o erro que diz por que não. */
async function contaDaEmpresa(id: string) {
  const c = await dbt().conta_pagar.findFirst({ where: { id } });
  if (!c) throw erro(404, 'Despesa não encontrada.');
  if (c.origem_split_item_id) {
    throw erro(409, 'Esta conta nasceu da divisão do dinheiro de um cliente (repasse ou comissão) e não se edita aqui.');
  }
  if (c.status === 'cancelada') throw erro(409, 'Despesa cancelada não se edita.');
  return c;
}

/**
 * Edita um título. O que muda a SÉRIE inteira (o tipo da recorrência) muda em
 * todos os títulos dela, para a projeção não ler um molde de cada tipo.
 */
export async function editar(id: string, e: Partial<NovaDespesa>) {
  await exigir('escrever_corporativo');
  const c = await contaDaEmpresa(id);
  const data: Record<string, unknown> = {};

  if (e.descricao !== undefined) {
    const t = textoLivre(e.descricao);
    if (!t) throw erro(422, 'O histórico não pode ficar vazio.');
    data.descricao = t;
  }
  if (e.fornecedor !== undefined) {
    const t = textoLivre(e.fornecedor);
    if (!t) throw erro(422, 'O fornecedor não pode ficar vazio.');
    data.beneficiario_nome = t;
  }
  if (e.valor_centavos !== undefined) {
    const v = centavos(e.valor_centavos, 'valor_centavos');
    if (v < c.valor_pago_centavos) {
      throw erro(422, `O valor não pode ficar abaixo do que já foi pago (${c.valor_pago_centavos} centavos).`);
    }
    data.valor_centavos = v;
  }
  if (e.competencia !== undefined) data.competencia = primeiroDia(e.competencia);
  if (e.vencimento !== undefined) data.vencimento = e.vencimento;
  if (e.categoria_id !== undefined) data.categoria_id = textoLivre(e.categoria_id);
  if (e.natureza !== undefined) data.natureza = umDeOuNull(e.natureza, NATUREZAS, 'natureza');
  if (e.forma_prevista !== undefined) data.forma_prevista = umDeOuNull(e.forma_prevista, FORMAS, 'forma_prevista');
  if (e.origem_pagamento_id !== undefined) data.origem_pagamento_id = textoLivre(e.origem_pagamento_id);
  if (e.numero_documento !== undefined) data.numero_documento = textoLivre(e.numero_documento);
  if (e.comprovante_url !== undefined) data.comprovante_url = link(e.comprovante_url);
  if (e.observacao !== undefined) data.observacao = textoLivre(e.observacao);

  if (e.recorrencia !== undefined) {
    const nova = umDe(e.recorrencia, RECORRENCIAS, 'recorrencia');
    const atual = c.recorrencia ?? 'avulsa';
    if (nova !== atual) {
      if (nova === 'parcelada' || atual === 'parcelada') {
        throw erro(422, 'Parcelamento não se liga nem desliga num título lançado: cancele e lance de novo com as parcelas.');
      }
      if (nova === 'avulsa') {
        const irmaos = c.serie_id ? await dbt().conta_pagar.count({ where: { serie_id: c.serie_id, status: { not: 'cancelada' } } }) : 1;
        if (irmaos > 1) throw erro(422, 'Esta despesa já tem outros meses lançados. Para parar de repetir, use «Encerrar recorrência».');
        data.recorrencia = 'avulsa'; data.serie_id = null; data.recorrente_ate = null;
      } else if (atual === 'avulsa') {
        data.recorrencia = nova; data.serie_id = randomUUID();
      } else {
        /* periódica → periódica: a série inteira muda junto. */
        await dbt().conta_pagar.updateMany({ where: { serie_id: c.serie_id! }, data: { recorrencia: nova } });
      }
    }
  }

  await dbt().conta_pagar.update({ where: { id }, data });
}

/** O último título vivo de uma série — o molde da projeção e do «próximo». */
async function ultimoDaSerie(serieId: string) {
  const u = await dbt().conta_pagar.findFirst({
    where: { serie_id: serieId, status: { not: 'cancelada' } },
    orderBy: [{ vencimento: 'desc' }, { criado_em: 'desc' }],
  });
  if (!u) throw erro(404, 'Série não encontrada.');
  return u;
}

/**
 * «LANÇAR O PRÓXIMO»: o que a planilha mandava fazer à mão («no mês seguinte,
 * lance o novo título com o MESMO texto no Histórico»), num clique. Copia o
 * último título da série, um intervalo adiante; o valor e o vencimento podem
 * vir ajustados (a conta de energia varia).
 */
export async function lancarProximo(serieId: string, e: { valor_centavos?: unknown; vencimento?: Date | null }) {
  await exigir('escrever_corporativo');
  const u = await ultimoDaSerie(serieId);
  const meses = INTERVALO_EM_MESES[u.recorrencia ?? 'avulsa'];
  if (!meses) throw erro(422, 'Só despesa mensal, trimestral, semestral ou anual tem «próximo».');
  const competencia = somarMeses(u.competencia, meses);
  if (u.recorrente_ate && competencia > u.recorrente_ate) {
    throw erro(422, 'A recorrência desta despesa já terminou. Para continuar, tire o «recorrente até».');
  }
  const ja = await dbt().conta_pagar.count({ where: { serie_id: serieId, competencia, status: { not: 'cancelada' } } });
  if (ja) throw erro(409, 'O próximo título desta série já está lançado.');

  return dbt().conta_pagar.create({
    data: {
      tenant_id: u.tenant_id,
      beneficiario_tipo: 'outro',
      descricao: u.descricao,
      beneficiario_nome: u.beneficiario_nome,
      valor_centavos: e.valor_centavos === undefined || e.valor_centavos === null
        ? u.valor_centavos : centavos(e.valor_centavos, 'valor_centavos'),
      competencia,
      vencimento: e.vencimento ?? somarMeses(u.vencimento, meses),
      categoria_id: u.categoria_id,
      natureza: u.natureza,
      recorrencia: u.recorrencia,
      recorrente_ate: u.recorrente_ate,
      serie_id: serieId,
      forma_prevista: u.forma_prevista,
      origem_pagamento_id: u.origem_pagamento_id,
    },
  });
}

/** «Recorrente até» da série inteira. `null` volta a repetir sem fim. */
export async function encerrarRecorrencia(serieId: string, ate: Date | null) {
  await exigir('escrever_corporativo');
  const u = await ultimoDaSerie(serieId);
  if (!INTERVALO_EM_MESES[u.recorrencia ?? 'avulsa']) throw erro(422, 'Esta série não é periódica.');
  const mes = ate ? primeiroDia(ate) : null;
  if (mes && mes < primeiroDia(u.competencia)) {
    throw erro(422, 'O fim da recorrência não pode ser antes do último título lançado.');
  }
  await dbt().conta_pagar.updateMany({ where: { serie_id: serieId }, data: { recorrente_ate: mes } });
}

// ------------------------------------------------------ ler

/**
 * Tudo o que a planilha mostrava, numa leitura: os títulos da empresa (os que
 * nascem à mão — repasse e comissão do rateio ficam de fora), com o plano, a
 * origem e os pagamentos, mais o `hoje` do BANCO.
 *
 * O `hoje` vem do banco pelo mesmo motivo de Contas a receber: situação e
 * «vence em 7 dias» comparam com a data, e a data do navegador muda com o fuso
 * de quem abre.
 */
export async function listar(limite = 2000) {
  await exigir('ler_corporativo');
  const [{ hoje }] = await dbt().$queryRaw<Array<{ hoje: string }>>`SELECT current_date::text AS hoje`;
  const onde = { origem_split_item_id: null };
  const total = await dbt().conta_pagar.count({ where: onde });
  const linhas = await dbt().conta_pagar.findMany({
    where: onde,
    select: {
      id: true, descricao: true, beneficiario_nome: true, valor_centavos: true, valor_pago_centavos: true,
      competencia: true, vencimento: true, status: true, criado_em: true, cancelada_em: true,
      categoria_id: true, natureza: true, recorrencia: true, recorrente_ate: true, serie_id: true,
      parcela_numero: true, parcela_total: true, forma_prevista: true, origem_pagamento_id: true,
      numero_documento: true, comprovante_url: true, observacao: true,
      pagamento: {
        select: {
          id: true, data_pagamento: true, valor_centavos: true, acrescimo_centavos: true,
          desconto_centavos: true, forma: true, origem_pagamento_id: true,
          referencia_externa: true, observacao: true,
        },
        orderBy: [{ data_pagamento: 'asc' }],
      },
    },
    orderBy: [{ vencimento: 'asc' }, { criado_em: 'asc' }],
    take: Math.min(Math.max(limite, 1), 5000),
  });
  return { hoje, total, linhas };
}
