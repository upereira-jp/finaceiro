// AS CONTAS DA PLANILHA DA EMPRESA — Painel, Dashboard e Projeção de
// `G3Solar_Financeiro.xlsx`, como funções puras sobre a lista de `GET /despesas`.
//
// POR QUE NO NAVEGADOR: as três telas são somas sobre a mesma lista, e a
// planilha também era uma aba só de dados com fórmulas por cima. Aqui as
// fórmulas viram funções com suíte própria (`web/tests/despesas-regras.ts`),
// que roda sem banco — o volume (até 500 títulos por ano) cabe com folga.
//
// OS CRITÉRIOS SÃO OS DA PLANILHA, de propósito, para os números baterem com o
// que os sócios viam:
//   - previsto, pago e em aberto do mês contam pelo VENCIMENTO;
//   - «vencido» é acumulado, de qualquer mês;
//   - «vence em 7 dias» vai de hoje a hoje+7, só do que não está pago;
//   - a projeção repete o ÚLTIMO título de cada série a cada 1, 3, 6 ou 12
//     meses, até o «recorrente até»; avulsa e parcelada não projetam.
// Duas diferenças, as duas a favor da exatidão: «em aberto» é o SALDO (a
// planilha não conhecia pagamento parcial), e a série é um id, não o texto do
// histórico.
//
// A DÍVIDA COM O SÓCIO (Q-SOCIOS-01, decisão do dono em 02/10/2026): quando um
// sócio paga do bolso, nasce uma conta a pagar a ele. Ela é DÍVIDA, não despesa —
// a despesa é a conta que ele quitou —, e por isso Painel e Projeção a deixam de
// fora (`daEmpresa`) e ela aparece somada à parte (`devidoAosSocios`).
//
// Toda data chega como texto ISO; o dia é `AAAA-MM-DD` e o mês, `AAAA-MM`.
// Dinheiro é inteiro de centavos do começo ao fim (regra 1).

import type {
  Despesa, PagamentoDaDespesa, CategoriaDaEmpresa, RecorrenciaDaDespesa, NaturezaDaDespesa, TipoDeOrigem,
} from './api.ts';

// ------------------------------------------------------ datas

export const dia = (iso: string): string => String(iso).slice(0, 10);
export const mesDe = (iso: string): string => String(iso).slice(0, 7);

const emDias = (d: string): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

/** Dias de `hoje` até `data`: positivo no futuro, negativo no atraso. */
export const diasAte = (data: string, hoje: string): number => emDias(dia(data)) - emDias(hoje);

/** `AAAA-MM` + n meses. */
export function somarMeses(mes: string, n: number): string {
  const total = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Quantos meses de `de` até `ate` (0 quando é o mesmo mês). */
export const mesesEntre = (de: string, ate: string): number =>
  (+ate.slice(0, 4) - +de.slice(0, 4)) * 12 + (+ate.slice(5, 7) - +de.slice(5, 7));

/** Dia `AAAA-MM-DD` + n meses, sem transbordar (31/01 + 1 → 28 ou 29/02). */
export function somarMesesAoDia(d: string, n: number): string {
  const mes = somarMeses(d.slice(0, 7), n);
  const ultimo = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
  return `${mes}-${String(Math.min(+d.slice(8, 10), ultimo)).padStart(2, '0')}`;
}

// ------------------------------------------------------ rótulos

export const ROTULO_DA_RECORRENCIA: Record<RecorrenciaDaDespesa, string> = {
  avulsa: 'Avulsa', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral',
  anual: 'Anual', parcelada: 'Parcelada',
};

export const INTERVALO_EM_MESES: Partial<Record<RecorrenciaDaDespesa, number>> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

export const ROTULO_DA_NATUREZA: Record<NaturezaDaDespesa, string> = { fixa: 'Fixa', variavel: 'Variável' };

export const ROTULO_DO_TIPO_DE_ORIGEM: Record<TipoDeOrigem, string> = {
  conta_bancaria: 'Conta bancária', socio: 'Adiantamento de sócio', outra: 'Outra',
};

// ------------------------------------------------------ a situação

/** A coluna «SITUAÇÃO» da planilha, mais a cancelada que ela não tinha e a
 *  dívida com o sócio, que não vence: é devida desde o dia em que ele pagou. */
export type SituacaoDaDespesa = 'vencida' | 'vence_hoje' | 'a_vencer' | 'a_reembolsar' | 'paga' | 'cancelada';

export const SITUACOES_DA_DESPESA: readonly SituacaoDaDespesa[] = ['vencida', 'vence_hoje', 'a_vencer', 'a_reembolsar', 'paga', 'cancelada'];

export const ROTULO_DA_SITUACAO_DA_DESPESA: Record<SituacaoDaDespesa, string> = {
  vencida: 'Vencida', vence_hoje: 'Vence hoje', a_vencer: 'A vencer', a_reembolsar: 'A reembolsar',
  paga: 'Paga', cancelada: 'Cancelada',
};

/** A conta é a dívida com um sócio que pagou do bolso? */
export const ehReembolso = (d: Pick<Despesa, 'reembolso_de_pagamento_id'>): boolean => !!d.reembolso_de_pagamento_id;

/** «Vencido é a data, não o status» — a regra de Contas a receber vale aqui. */
export function situacao(d: Pick<Despesa, 'status' | 'vencimento' | 'reembolso_de_pagamento_id'>, hoje: string): SituacaoDaDespesa {
  if (d.status === 'cancelada') return 'cancelada';
  if (d.status === 'paga') return 'paga';
  if (ehReembolso(d)) return 'a_reembolsar';
  const n = diasAte(d.vencimento, hoje);
  return n < 0 ? 'vencida' : n === 0 ? 'vence_hoje' : 'a_vencer';
}

export const viva = (d: Pick<Despesa, 'status'>): boolean => d.status !== 'cancelada';
export const saldo = (d: Pick<Despesa, 'valor_centavos' | 'valor_pago_centavos' | 'status'>): number =>
  d.status === 'cancelada' ? 0 : d.valor_centavos - d.valor_pago_centavos;

/** O que SAIU DO BANCO num pagamento: o que abateu, mais juros, menos desconto. */
export const saidaDoPagamento = (p: Pick<PagamentoDaDespesa, 'valor_centavos' | 'acrescimo_centavos' | 'desconto_centavos'>): number =>
  p.valor_centavos + p.acrescimo_centavos - p.desconto_centavos;

/** A coluna «VALOR PAGO (R$)» da planilha: o que saiu, somando as baixas. */
export const pagoEmCaixa = (d: Pick<Despesa, 'pagamento'>): number =>
  d.pagamento.reduce((s, p) => s + saidaDoPagamento(p), 0);

/** Juros/multa menos desconto, somado nas baixas: a coluna «ACRÉSCIMOS (+) / DESCONTOS (−)». */
export const ajusteDasBaixas = (d: Pick<Despesa, 'pagamento'>): number =>
  d.pagamento.reduce((s, p) => s + p.acrescimo_centavos - p.desconto_centavos, 0);

/** «Mensal», «Trimestral», «3/10» — o que diz que o título faz parte de uma série. */
export function textoDaSerie(d: Pick<Despesa, 'recorrencia' | 'parcela_numero' | 'parcela_total'>): string | null {
  if (d.parcela_numero && d.parcela_total) return `${d.parcela_numero}/${d.parcela_total}`;
  if (!d.recorrencia || d.recorrencia === 'avulsa') return null;
  return ROTULO_DA_RECORRENCIA[d.recorrencia];
}

// ------------------------------------------------------ o Painel (o mês)

export type PainelDoMes = {
  previsto: number;
  pago: number;
  em_aberto: number;
  /** De 0 a 100, com uma casa: percentual não é dinheiro e mantém escala decimal (regra 1). */
  liquidado_pct: number;
  vencido_acumulado: number;
  vencidos: number;
  vence_em_7_dias: number;
  vencem_em_7_dias: number;
  titulos_do_mes: number;
};

/** O que é DESPESA da empresa: tudo, menos a dívida com sócio (que já foi contada
 *  como a despesa que ele quitou). */
export const daEmpresa = (d: Despesa): boolean => !ehReembolso(d);

const doMes = (linhas: readonly Despesa[], mes: string) =>
  linhas.filter((d) => viva(d) && daEmpresa(d) && mesDe(d.vencimento) === mes);

export function painelDoMes(linhas: readonly Despesa[], mes: string, hoje: string): PainelDoMes {
  const domes = doMes(linhas, mes);
  const previsto = domes.reduce((s, d) => s + d.valor_centavos, 0);
  const pago = domes.reduce((s, d) => s + pagoEmCaixa(d), 0);
  const em_aberto = domes.reduce((s, d) => s + saldo(d), 0);
  const vencidas = linhas.filter((d) => viva(d) && daEmpresa(d) && d.status !== 'paga' && diasAte(d.vencimento, hoje) < 0);
  const em7 = linhas.filter((d) => {
    if (!viva(d) || !daEmpresa(d) || d.status === 'paga') return false;
    const n = diasAte(d.vencimento, hoje);
    return n >= 0 && n <= 7;
  });
  return {
    previsto, pago, em_aberto,
    liquidado_pct: previsto === 0 ? 0 : Math.round(((previsto - em_aberto) * 1000) / previsto) / 10,
    vencido_acumulado: vencidas.reduce((s, d) => s + saldo(d), 0),
    vencidos: vencidas.length,
    vence_em_7_dias: em7.reduce((s, d) => s + saldo(d), 0),
    vencem_em_7_dias: em7.length,
    titulos_do_mes: domes.length,
  };
}

/** A barra «situação dos títulos» do Dashboard, no mês: o que fechou, o que vem, o que atrasou. */
export function situacaoDoMes(linhas: readonly Despesa[], mes: string, hoje: string) {
  const domes = doMes(linhas, mes);
  let pago = 0, a_vencer = 0, vencido = 0;
  for (const d of domes) {
    pago += d.valor_pago_centavos;
    if (d.status === 'paga') continue;
    if (diasAte(d.vencimento, hoje) < 0) vencido += saldo(d); else a_vencer += saldo(d);
  }
  return { pago, a_vencer, vencido };
}

export type LinhaPorPlano = {
  categoria_id: string | null;
  nome: string;
  previsto: number;
  pago: number;
  em_aberto: number;
  /** % do previsto do mês, com uma casa. */
  pct: number;
};

export const SEM_PLANO = 'Sem plano de contas';

/** «DESPESAS POR PLANO DE CONTAS — mês selecionado», na ordem do plano. Os
 *  itens sem movimento no mês ficam de fora; o sem plano vai por último. */
export function porPlanoNoMes(
  linhas: readonly Despesa[], mes: string, categorias: readonly CategoriaDaEmpresa[],
): { linhas: LinhaPorPlano[]; total: Omit<LinhaPorPlano, 'categoria_id' | 'nome'> } {
  const domes = doMes(linhas, mes);
  const conhecidas = new Set(categorias.map((c) => c.id));
  const chave = (d: Despesa) => (d.categoria_id && conhecidas.has(d.categoria_id) ? d.categoria_id : null);
  const ordem: Array<{ id: string | null; nome: string }> = [
    ...[...categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)).map((c) => ({ id: c.id, nome: c.nome })),
    { id: null, nome: SEM_PLANO },
  ];
  const previstoTotal = domes.reduce((s, d) => s + d.valor_centavos, 0);
  const saida: LinhaPorPlano[] = [];
  for (const c of ordem) {
    const delas = domes.filter((d) => chave(d) === c.id);
    if (!delas.length) continue;
    const previsto = delas.reduce((s, d) => s + d.valor_centavos, 0);
    saida.push({
      categoria_id: c.id, nome: c.nome, previsto,
      pago: delas.reduce((s, d) => s + pagoEmCaixa(d), 0),
      em_aberto: delas.reduce((s, d) => s + saldo(d), 0),
      pct: previstoTotal ? Math.round((previsto * 1000) / previstoTotal) / 10 : 0,
    });
  }
  return {
    linhas: saida,
    total: {
      previsto: previstoTotal,
      pago: saida.reduce((s, l) => s + l.pago, 0),
      em_aberto: saida.reduce((s, l) => s + l.em_aberto, 0),
      pct: previstoTotal ? 100 : 0,
    },
  };
}

export type MesDoAno = { mes: string; previsto: number; pago: number; em_aberto: number; fixas: number; variaveis: number };

/** «PREVISTO × REALIZADO — por mês de vencimento», janeiro a dezembro do ano. */
export function anoMesAMes(linhas: readonly Despesa[], ano: number): { meses: MesDoAno[]; total: Omit<MesDoAno, 'mes'> } {
  const meses: MesDoAno[] = Array.from({ length: 12 }, (_, i) => {
    const mes = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const domes = doMes(linhas, mes);
    return {
      mes,
      previsto: domes.reduce((s, d) => s + d.valor_centavos, 0),
      pago: domes.reduce((s, d) => s + pagoEmCaixa(d), 0),
      em_aberto: domes.reduce((s, d) => s + saldo(d), 0),
      fixas: domes.filter((d) => d.natureza === 'fixa').reduce((s, d) => s + d.valor_centavos, 0),
      variaveis: domes.filter((d) => d.natureza === 'variavel').reduce((s, d) => s + d.valor_centavos, 0),
    };
  });
  const soma = (k: keyof Omit<MesDoAno, 'mes'>) => meses.reduce((s, m) => s + m[k], 0);
  return {
    meses,
    total: { previsto: soma('previsto'), pago: soma('pago'), em_aberto: soma('em_aberto'), fixas: soma('fixas'), variaveis: soma('variaveis') },
  };
}

// ------------------------------------------------------ a Projeção

/** Uma série periódica, pelo seu molde: o último título vivo dela. */
export type SerieQueProjeta = {
  serie_id: string;
  molde: Despesa;
  intervalo: number;
  /** O vencimento do próximo título que ainda não foi lançado, ou null se a recorrência acabou. */
  proximo_vencimento: string | null;
  proxima_competencia: string | null;
};

/** As séries mensais, trimestrais, semestrais e anuais, cada uma pelo último título. */
export function seriesQueProjetam(linhas: readonly Despesa[]): SerieQueProjeta[] {
  const moldes = new Map<string, Despesa>();
  for (const d of linhas) {
    if (!viva(d) || !d.serie_id || !d.recorrencia || !INTERVALO_EM_MESES[d.recorrencia]) continue;
    const atual = moldes.get(d.serie_id);
    if (!atual || dia(d.vencimento) > dia(atual.vencimento)
        || (dia(d.vencimento) === dia(atual.vencimento) && d.criado_em > atual.criado_em)) {
      moldes.set(d.serie_id, d);
    }
  }
  return [...moldes.values()]
    .map((molde) => {
      const intervalo = INTERVALO_EM_MESES[molde.recorrencia!]!;
      const comp = somarMeses(mesDe(molde.competencia), intervalo);
      const acabou = molde.recorrente_ate !== null && comp > mesDe(molde.recorrente_ate);
      return {
        serie_id: molde.serie_id!, molde, intervalo,
        proximo_vencimento: acabou ? null : somarMesesAoDia(dia(molde.vencimento), intervalo),
        proxima_competencia: acabou ? null : comp,
      };
    })
    .sort((a, b) => (a.proximo_vencimento ?? '9999').localeCompare(b.proximo_vencimento ?? '9999')
      || a.molde.descricao.localeCompare(b.molde.descricao));
}

export type MesDaProjecao = {
  mes: string;
  lancado: number;
  projetado: number;
  total: number;
  acumulado: number;
};

export type Projecao = {
  meses: MesDaProjecao[];
  /** Quanto cada plano de contas soma em cada mês (lançado + projetado), para o recorte do período. */
  porPlano: Map<string | null, Map<string, number>>;
};

/**
 * «PROJEÇÃO MÊS A MÊS»: a partir de `inicio`, `quantos` meses (24 na planilha).
 *
 * Lançado é todo título vivo que vence no mês, pago ou não (coluna C). Projetado
 * é a repetição do molde de cada série (coluna D): a k-ésima repetição tem
 * competência = competência do molde + k·intervalo e vence no mesmo dia, k·
 * intervalo meses adiante; entra enquanto a competência não passar do
 * «recorrente até». Cai no mês do VENCIMENTO, como na planilha.
 */
export function projetar(linhas: readonly Despesa[], inicio: string, quantos = 24): Projecao {
  const fim = somarMeses(inicio, quantos - 1);
  const meses = new Map<string, { lancado: number; projetado: number }>();
  for (let i = 0; i < quantos; i++) meses.set(somarMeses(inicio, i), { lancado: 0, projetado: 0 });
  const porPlano: Projecao['porPlano'] = new Map();
  const somarNoPlano = (cat: string | null, mes: string, v: number) => {
    const m = porPlano.get(cat) ?? new Map<string, number>();
    m.set(mes, (m.get(mes) ?? 0) + v);
    porPlano.set(cat, m);
  };

  for (const d of linhas) {
    if (!viva(d) || !daEmpresa(d)) continue;
    const m = meses.get(mesDe(d.vencimento));
    if (!m) continue;
    m.lancado += d.valor_centavos;
    somarNoPlano(d.categoria_id, mesDe(d.vencimento), d.valor_centavos);
  }

  for (const s of seriesQueProjetam(linhas)) {
    const ate = s.molde.recorrente_ate ? mesDe(s.molde.recorrente_ate) : null;
    for (let k = 1; ; k++) {
      const comp = somarMeses(mesDe(s.molde.competencia), k * s.intervalo);
      if (ate && comp > ate) break;
      const venc = somarMeses(mesDe(s.molde.vencimento), k * s.intervalo);
      if (venc > fim) break;
      const m = meses.get(venc);
      if (!m) continue;
      m.projetado += s.molde.valor_centavos;
      somarNoPlano(s.molde.categoria_id, venc, s.molde.valor_centavos);
    }
  }

  let acumulado = 0;
  return {
    meses: [...meses.entries()].map(([mes, v]) => {
      const total = v.lancado + v.projetado;
      acumulado += total;
      return { mes, lancado: v.lancado, projetado: v.projetado, total, acumulado };
    }),
    porPlano,
  };
}

/** «INDICADORES» da Projeção: total, média, maior mês no período e as janelas de 12 e 24. */
export function indicadoresDoPeriodo(p: Projecao, de: string, ate: string) {
  const dentro = p.meses.filter((m) => m.mes >= de && m.mes <= ate);
  const total = dentro.reduce((s, m) => s + m.total, 0);
  const maior = dentro.reduce<MesDaProjecao | null>((a, m) => (!a || m.total > a.total ? m : a), null);
  return {
    total,
    meses: dentro.length,
    media: dentro.length ? Math.round(total / dentro.length) : 0,
    maior,
    proximos_12: p.meses.slice(0, 12).reduce((s, m) => s + m.total, 0),
    proximos_24: p.meses.slice(0, 24).reduce((s, m) => s + m.total, 0),
  };
}

/** «PROJEÇÃO POR PLANO DE CONTAS» no período, na ordem do plano, sem plano no fim. */
export function projecaoPorPlano(p: Projecao, de: string, ate: string, categorias: readonly CategoriaDaEmpresa[]) {
  const conhecidas = new Map(categorias.map((c) => [c.id, c]));
  const somas = new Map<string | null, number>();
  for (const [cat, porMes] of p.porPlano) {
    const chave = cat && conhecidas.has(cat) ? cat : null;
    for (const [mes, v] of porMes) if (mes >= de && mes <= ate) somas.set(chave, (somas.get(chave) ?? 0) + v);
  }
  const ordenadas = [...categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const linhas = [
    ...ordenadas.map((c) => ({ categoria_id: c.id as string | null, nome: c.nome, total: somas.get(c.id) ?? 0 })),
    { categoria_id: null, nome: SEM_PLANO, total: somas.get(null) ?? 0 },
  ].filter((l) => l.total > 0);
  return { linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
}

// ------------------------------------------------------ o que a empresa deve aos sócios

export type DevidoAoSocio = { nome: string; centavos: number; titulos: number };

/** A dívida em aberto com cada sócio (o saldo dos reembolsos), do maior para o menor. */
export function devidoAosSocios(linhas: readonly Despesa[]): { socios: DevidoAoSocio[]; total: number } {
  const por = new Map<string, DevidoAoSocio>();
  for (const d of linhas) {
    if (!ehReembolso(d) || !viva(d) || saldo(d) <= 0) continue;
    const nome = d.beneficiario_nome ?? 'Sócio';
    const s = por.get(nome) ?? { nome, centavos: 0, titulos: 0 };
    s.centavos += saldo(d); s.titulos += 1;
    por.set(nome, s);
  }
  const socios = [...por.values()].sort((a, b) => b.centavos - a.centavos || a.nome.localeCompare(b.nome));
  return { socios, total: socios.reduce((s, x) => s + x.centavos, 0) };
}

// ------------------------------------------------------ a baixa

/** O que a diferença entre o saldo e o que saiu do banco é. */
export type MotivoDaDiferenca = 'juros' | 'desconto' | 'parcial';

export type Baixa = { valor_centavos: number; acrescimo_centavos: number; desconto_centavos: number };

/**
 * «QUANTO SAIU DO BANCO» → o pagamento que o servidor grava.
 *
 * - igual ao saldo: abate o saldo, sem ajuste;
 * - maior: abate o saldo e o resto é juros/multa (a planilha: acréscimo +);
 * - menor e desconto: abate o saldo e a diferença é desconto (−);
 * - menor e parcial: abate só o que saiu, e a despesa fica em aberto.
 *
 * Devolve a frase do problema em vez de um pagamento que o banco recusaria.
 */
export function decomporBaixa(saldoDoTitulo: number, saiu: number, motivo: MotivoDaDiferenca | null): Baixa | string {
  if (!Number.isInteger(saiu) || saiu <= 0) return 'Diga quanto saiu do banco.';
  if (saiu === saldoDoTitulo) return { valor_centavos: saiu, acrescimo_centavos: 0, desconto_centavos: 0 };
  if (saiu > saldoDoTitulo) {
    return { valor_centavos: saldoDoTitulo, acrescimo_centavos: saiu - saldoDoTitulo, desconto_centavos: 0 };
  }
  if (motivo === 'desconto') {
    return { valor_centavos: saldoDoTitulo, acrescimo_centavos: 0, desconto_centavos: saldoDoTitulo - saiu };
  }
  if (motivo === 'parcial') return { valor_centavos: saiu, acrescimo_centavos: 0, desconto_centavos: 0 };
  return 'Saiu menos que o saldo: diga se foi desconto ou pagamento de uma parte.';
}
