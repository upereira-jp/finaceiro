// AS CONTAS REGISTRADAS DO MES, como dado puro: que mes a lista abre, o que o
// filtro deixa passar, quais linhas o «Gerar N cobrancas» leva e quanto elas
// somam. Sem JSX, sem `fetch`, sem estado de React.
//
// ============================================================================
// POR QUE ISTO NASCEU EM 30/09/2026 (etapa 1 do redesenho)
//
// A lista das contas registradas morava na coluna estreita da aba 1, abaixo do
// boleto e dos parametros, e tinha tres defeitos medidos no espelho com 59
// registros:
//
//   1. AGOSTO E SETEMBRO MISTURADOS numa coluna so, 7.024px de pagina — quem
//      procurava as seis contas que faltava cobrar rolava por cinquenta que ja
//      tinham virado cobranca;
//   2. «GERAR COBRANCA» UM POR UM, cada clique com um `window.confirm`. Seis
//      cobrancas eram doze cliques e seis dialogos do navegador;
//   3. A LISTA MUDAVA DE ASSUNTO SOZINHA: bastava o formulario ter uma unidade
//      para ela virar "desta unidade", sem dizer que tinha filtrado.
//
// As tres respostas moram aqui porque sao REGRA — o mes que a lista abre decide
// o que a pessoa ve primeiro, e a selecao decide quem e cobrado. O runner do
// `web/` nao le JSX (regra 8), entao regra dentro da tela nao seria verificavel.
//
// ============================================================================
// O QUE ESTE ARQUIVO NAO FAZ
//
// Nao decide se uma conta PODE virar cobranca. Quem sabe se falta contrato,
// geracao ou vencimento e o servidor (`ensaio` e `faturar`), e ele recusa
// nomeando. `podeGerar` aqui so separa o que nem faria sentido pedir: a conta
// que ja virou cobranca, e o banco que ainda nao sabe cobrar conta lida.

import type { RegistroDeFatura } from './api.ts';
import { mesPorExtenso, mesEmBr, diaEmBr } from './formato.ts';
import { normalizarUc } from './lote-de-contas.ts';

/**
 * QUANTAS LINHAS A LISTA PEDE. O servidor aceita ate 500 (`registro.recentes`).
 *
 * 500 E NAO 200 (o numero de ate 30/09): com 50 unidades, 200 linhas sao quatro
 * meses, e o quarto chegava pela metade — a lista ordena por mes e corta onde o
 * teto cai. `listaParcial` diz quando o corte aconteceu, para o mes mais velho
 * nao se apresentar como completo.
 */
export const LIMITE_DA_LISTA = 500;

/** `'AAAA-MM'` do registro. A competencia vem do banco como data (`2026-09-01`,
 *  as vezes com horario no JSON); o mes e o recorte, sem `new Date` — em fuso
 *  negativo meia-noite UTC e o dia anterior. */
export const mesDoRegistro = (r: Pick<RegistroDeFatura, 'competencia'>): string =>
  String(r.competencia ?? '').slice(0, 7);

/** `'2026-09'` -> `'setembro de 2026'`. Cai no proprio texto quando nao le. */
export const rotuloDoMes = (mes: string): string => mesPorExtenso(`${mes}-01`) || mes;

/** `'2026-09'` -> `'09/2026'`, a forma curta que a fila e a folha usam. E o
 *  `mesEmBr` de `formato.ts` desde 30/09/2026 (etapa 4b) — so o vazio muda de
 *  resposta: devolve o proprio texto, como antes, e nao o travessao. */
export const mesCurto = (mes: string): string => (mes ? mesEmBr(mes) : mes);

export const vencimentoEmBr = (r: Pick<RegistroDeFatura, 'vencimento'>): string => diaEmBr(r.vencimento);

/** Ainda nao virou cobranca. */
export const semCobranca = (r: Pick<RegistroDeFatura, 'fatura_id'>): boolean => r.fatura_id == null;

/**
 * O QUE O «Gerar N cobrancas» PODE LEVAR: a conta sem cobranca, num banco que
 * sabe fazer a ligacao (migration 34). `cobranca_disponivel` e propriedade do
 * banco e vem repetida em toda linha — falso, e a tela nao oferece o ato em vez
 * de oferece-lo e falhar.
 */
export const podeGerar = (r: Pick<RegistroDeFatura, 'fatura_id' | 'cobranca_disponivel'>): boolean =>
  r.fatura_id == null && r.cobranca_disponivel;

/** Os meses presentes, do mais novo para o mais velho. */
export function mesesDaLista(lista: readonly RegistroDeFatura[]): string[] {
  return [...new Set(lista.map(mesDoRegistro).filter(Boolean))].sort().reverse();
}

/** `true` quando a lista bateu no teto e o mes mais velho pode estar pela metade. */
export const listaParcial = (lista: readonly RegistroDeFatura[]): boolean =>
  lista.length >= LIMITE_DA_LISTA;

/**
 * O MES QUE A LISTA ABRE: o mais recente que ainda tem conta por cobrar.
 *
 * NAO E O MES DE HOJE, e nao e o mais recente da lista. A cobranca nasce na
 * competencia da CONTA, que quase nunca e o mes corrente; e o mes mais recente
 * pode estar todo cobrado enquanto o anterior tem seis esperando. Abrir no
 * trabalho que falta e o que poe «Gerar 6 cobrancas» na primeira dobra.
 *
 * Sem nada por cobrar, abre no mais recente — e a confirmacao do que foi feito.
 * Lista vazia, `null`: nao ha mes para escolher.
 */
export function mesPadrao(lista: readonly RegistroDeFatura[]): string | null {
  const comTrabalho = mesesDaLista(lista.filter(podeGerar));
  if (comTrabalho.length > 0) return comTrabalho[0]!;
  return mesesDaLista(lista)[0] ?? null;
}

export type FiltroDasRegistradas = {
  /** `'AAAA-MM'`, ou `null` para todos os meses. */
  mes: string | null;
  soSemCobranca: boolean;
  /**
   * A UNIDADE, e ela e um filtro EXPLICITO desde 30/09. Ate ali a lista virava
   * "desta unidade" sozinha quando o formulario tinha uma — a mesma lista
   * respondendo duas perguntas conforme um campo de outra parte da tela.
   * Agora ela so filtra quando alguem pede, e a tela mostra o pedido num chip
   * que se tira.
   */
  unidade: string | null;
};

export function filtrarRegistradas(
  lista: readonly RegistroDeFatura[], f: FiltroDasRegistradas,
): RegistroDeFatura[] {
  const uc = f.unidade ? normalizarUc(f.unidade) : '';
  return lista.filter((r) =>
    (!f.mes || mesDoRegistro(r) === f.mes)
    && (!f.soSemCobranca || semCobranca(r))
    && (!uc || normalizarUc(r.numero_uc) === uc));
}

/**
 * O TRABALHO NO TOPO: primeiro o que pode virar cobranca, depois o que ja virou.
 *
 * E a mesma regra da fila (`ordemDaFila`), e pelo mesmo motivo: com 26 contas
 * no mes e 6 por cobrar, as 6 nasciam espalhadas entre as 20 prontas, na ordem
 * do banco, e quem conferia a selecao rolava a lista inteira. Dentro de cada
 * grupo a ordem de chegada e preservada, para a lista nao dancar quando uma
 * linha muda de grupo no meio da rodada.
 */
export function ordemDasRegistradas(lista: readonly RegistroDeFatura[]): RegistroDeFatura[] {
  const peso = (r: RegistroDeFatura) => (podeGerar(r) ? 0 : semCobranca(r) ? 1 : 2);
  return lista.map((r, i) => ({ r, i }))
    .sort((a, b) => peso(a.r) - peso(b.r) || a.i - b.i)
    .map(({ r }) => r);
}

/**
 * AS LINHAS QUE O «Gerar N cobrancas» LEVA: toda linha VISIVEL que pode gerar,
 * menos as que a pessoa desmarcou.
 *
 * A SELECAO E GUARDADA PELO AVESSO — o conjunto das DESMARCADAS —, e o motivo e
 * a lista recarregar. Depois de cada rodada as cobrancas geradas deixam de
 * poder gerar; um conjunto de MARCADAS teria de ser podado a cada recarga, e
 * uma poda esquecida levaria para a proxima rodada uma conta que ja virou
 * cobranca. Pelo avesso, o que entra de novo entra marcado e o que saiu some
 * sozinho.
 *
 * TODAS COMECAM MARCADAS, que e o mesmo contrato do «Registrar N contas
 * conferidas» da fila: o numero no botao e a promessa, e a revisao antes de
 * gravar mostra linha por linha o que vai ser cobrado.
 */
export function selecaoParaGerar(
  visiveis: readonly RegistroDeFatura[], desmarcadas: ReadonlySet<string>,
): RegistroDeFatura[] {
  return visiveis.filter((r) => podeGerar(r) && !desmarcadas.has(r.id));
}

/** Soma em CENTAVOS, inteiro com inteiro (regra 1). */
export const somaEmCentavos = (lista: readonly Pick<RegistroDeFatura, 'total_centavos'>[]): number =>
  lista.reduce((a, r) => a + r.total_centavos, 0);

/**
 * A ECONOMIA ACUMULADA DE UMA UNIDADE — o «Voce ja economizou» da folha 2.
 *
 * So faz sentido por unidade: somar o desconto de clientes diferentes daria um
 * numero que nenhuma folha imprime. Por isso a tela so o mostra com o chip de
 * unidade ligado, e na gaveta de uma conta.
 */
export function economiaAcumulada(
  lista: readonly Pick<RegistroDeFatura, 'desconto_centavos'>[],
): { centavos: number; faturas: number } {
  return { centavos: lista.reduce((a, r) => a + r.desconto_centavos, 0), faturas: lista.length };
}

/** Onde cada linha esta numa rodada de «Gerar N cobrancas». */
export type EstadoDaGeracao =
  | { estado: 'na_vez' }
  | { estado: 'gerando' }
  | { estado: 'gerada' }
  | { estado: 'recusada'; motivo: string };

export type ResumoDaRodada = { total: number; geradas: number; recusadas: number; faltam: number };

export function resumoDaRodada(rodada: Readonly<Record<string, EstadoDaGeracao>>): ResumoDaRodada {
  const estados = Object.values(rodada);
  const geradas = estados.filter((e) => e.estado === 'gerada').length;
  const recusadas = estados.filter((e) => e.estado === 'recusada').length;
  return { total: estados.length, geradas, recusadas, faltam: estados.length - geradas - recusadas };
}

/** «1 cobrança» / «6 cobranças». O numero e a promessa do botao. */
export const cobrancas = (n: number): string => `${n} ${n === 1 ? 'cobrança' : 'cobranças'}`;
