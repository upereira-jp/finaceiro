// O LOTE DE DOCUMENTOS: quem entra na impressao do mes, quem fica de fora e por
// que — e o que fazer com o que nao pode ser composto.
//
// POR QUE ESTE ARQUIVO EXISTE, e por que a regra nao mora no `.tsx`. O runner do
// `web/` e `node --experimental-strip-types`, que nao le JSX: regra dentro de um
// `.tsx` e inalcancavel por teste, e a regra 8 diz que invariante sem teste e
// comentario. Mesmo motivo de `cobranca-regras.ts` e de `contrato-regras.ts`.
//
// ------------------------------------------------------------------------
// O QUE ELE CONSERTA, medido em 06/08/2026.
//
// `GET /faturas/:id/documento` e por fatura, e o unico consumidor na SPA era a
// previa da aba Documento, que escolhe UMA fatura num seletor e chama
// `window.print()`. Com 28 faturas na competencia isso sao 28 selecoes e 28
// impressoes a mao — e o modo de falha de um trabalho manual repetido 28 vezes
// nao e o erro, e a OMISSAO: ninguem percebe a fatura que ficou sem imprimir,
// porque nada conta.
//
// Entao o que este arquivo faz de verdade e CONTAR. As tres listas abaixo somam
// exatamente o total da competencia, sempre, e essa e a invariante do lote (L5).
//
// ------------------------------------------------------------------------
// A DECISAO QUE EU NAO TOMEI, e a regra 10 e o motivo.
//
// `documento.paraFatura` (src/repos/documento.ts:496) NAO tem guarda de status:
// ela compoe o documento de qualquer fatura, inclusive cancelada. O servidor
// nao tem opiniao aqui — entao uma tela que descartasse status em silencio
// estaria INVENTANDO regra de negocio, que e o improviso que a regra 10 proibe.
//
// A saida foi nao decidir por ninguem: o padrao e o conjunto que o proprio
// servidor ja nomeia como "a fatura que espera dinheiro" (`podeBaixarManual`), e
// tudo que fica de fora aparece na tela com status, quantidade e motivo, podendo
// ser incluido com um clique. Nada e escondido; nada e escolhido pelas costas.

import type { StatusFatura } from './cobranca-regras.ts';

/**
 * O padrao do lote, e ele e ESPELHO e nao regra nova.
 *
 * `src/repos/liquidacao.ts` → `baixar()`: `if (f.status !== 'emitida' && f.status
 * !== 'vencida') throw FaturaNaoLiquidavel` — ou seja, o servidor ja nomeia
 * `emitida` e `vencida` como o conjunto da fatura que espera dinheiro. Documento
 * de cobranca e o papel que pede esse dinheiro, entao o padrao e o mesmo
 * conjunto, citado em vez de escolhido.
 *
 * `web/src/cobranca-regras.ts` → `podeBaixarManual` afirma a mesma coisa para o
 * botao de baixa; a verificacao L7 prende as duas juntas, para que mudar uma sem
 * a outra caia no teste em vez de cair no envelope do cliente.
 */
export const STATUS_PADRAO_DO_LOTE: readonly StatusFatura[] = ['emitida', 'vencida'];

/**
 * Por que uma fatura fica fora do lote, por status.
 *
 * O texto e para quem opera e diz o que FAZER, nao o que aconteceu. "rascunho"
 * nao e erro — e a fatura que ainda nao foi emitida, e o conserto e emitir, na
 * propria tela de Faturas.
 */
export const PORQUE_FORA: Record<StatusFatura, string> = {
  rascunho:
    'ainda nao foi emitida — o valor nao esta fechado e o documento sairia com um total que ' +
    'pode mudar. Emitir e na aba Faturas',
  emitida: 'esta no lote',
  vencida: 'esta no lote',
  paga:
    'ja foi liquidada. O documento continua compondo, e serve de segunda via ou comprovante — ' +
    'so nao e cobranca',
  cancelada:
    'foi cancelada, com motivo registrado. Mandar ao cliente um papel cancelado cobra o que ' +
    'ninguem deve',
  negociada:
    'esta negociada — o valor a cobrar deixou de ser o desta fatura, e o documento sairia com ' +
    'o valor antigo',
};

export type ForaDoLote = {
  status: StatusFatura;
  quantidade: number;
  porque: string;
};

export type SelecaoDoLote<F> = {
  /** Na ORDEM EM QUE CHEGARAM — ver `selecaoDoLote`. */
  imprimir: F[];
  /** Agrupado por status, na ordem de `PORQUE_FORA`, para a tela nao decidir. */
  fora: ForaDoLote[];
  /** `imprimir.length + fora.somaDasQuantidades`. Igual ao total recebido, sempre. */
  total: number;
};

/**
 * Separa a competencia em "vai imprimir" e "ficou de fora, por isto".
 *
 * A ORDEM DE `imprimir` E A DE ENTRADA, deliberadamente: quem chama passa a
 * lista JA ORDENADA como esta na tela, e o papel sai na ordem que a pessoa esta
 * vendo. Reordenar aqui — por UC, por vencimento — produziria uma pilha em ordem
 * diferente da conferida, e a conferencia e o que da valor a impressao em lote.
 *
 * NENHUMA FATURA SOME. O total devolvido e o total recebido, e a verificacao L5
 * prende isso: o modo de falha desta funcao nao e recusar demais, e deixar cair
 * uma linha entre os dois grupos sem ninguem contar.
 */
export function selecaoDoLote<F extends { status: string }>(
  faturas: readonly F[],
  incluir: readonly StatusFatura[] = STATUS_PADRAO_DO_LOTE,
): SelecaoDoLote<F> {
  const dentro = new Set<string>(incluir);
  const imprimir: F[] = [];
  const contagem = new Map<string, number>();

  for (const f of faturas) {
    if (dentro.has(f.status)) imprimir.push(f);
    else contagem.set(f.status, (contagem.get(f.status) ?? 0) + 1);
  }

  // A ordem de `PORQUE_FORA` e a ordem do ciclo de vida da fatura, e ela e a
  // ordem util na tela: rascunho primeiro, porque e o unico grupo com acao.
  const fora: ForaDoLote[] = (Object.keys(PORQUE_FORA) as StatusFatura[])
    .filter((s) => contagem.has(s))
    .map((s) => ({ status: s, quantidade: contagem.get(s)!, porque: PORQUE_FORA[s] }));

  // Status fora do enum conhecido — coluna nova no banco, cliente desatualizado.
  // Ele NAO pode virar silencio: sem esta linha a soma pararia de fechar e a
  // fatura sumiria do relatorio em vez de aparecer sem explicacao.
  for (const [s, quantidade] of contagem) {
    if (s in PORQUE_FORA) continue;
    fora.push({
      status: s as StatusFatura, quantidade,
      porque: `status "${s}" desconhecido por esta tela — inclua-o de proposito ou atualize o sistema`,
    });
  }

  return { imprimir, fora, total: faturas.length };
}

// ------------------------------------------------- o que falhou ao compor

/**
 * O resultado de compor UM documento. Uniao discriminada, e nao `T | null`,
 * porque o motivo da falha e o que a tela precisa mostrar.
 */
export type Composicao<T> =
  | { ok: true; doc: T }
  | { ok: false; fatura_id: string; rotulo: string; erro: string };

export type ResultadoDaComposicao<T> = {
  compostos: T[];
  falhas: Array<{ fatura_id: string; rotulo: string; erro: string }>;
};

/**
 * Separa o que compos do que falhou.
 *
 * POR QUE NAO BASTA UM `Promise.all`, e por que isto nao usa o `emLotes` cru:
 * `emLotes` rejeita o conjunto quando um item rejeita (verificacao L3), e ali
 * isso e o certo — a tela de Contratos precisa do mapa COMPLETO ou de um erro.
 *
 * Aqui e o contrario, e a diferenca e o que esta em jogo. Um documento que nao
 * compoe entre 28 nao pode derrubar os 27 que compoem: a operacao ficaria sem
 * imprimir nada por causa de uma UC. Mas ele TAMBEM nao pode sumir — 27 papeis
 * saindo de uma competencia de 28 e exatamente a omissao que este arquivo existe
 * para impedir.
 *
 * Entao os dois caminhos sao percorridos e CONTADOS, e quem decide e quem opera,
 * com o numero na frente.
 */
export function separarComposicao<T>(rs: readonly Composicao<T>[]): ResultadoDaComposicao<T> {
  const compostos: T[] = [];
  const falhas: ResultadoDaComposicao<T>['falhas'] = [];
  for (const r of rs) {
    if (r.ok) compostos.push(r.doc);
    else falhas.push({ fatura_id: r.fatura_id, rotulo: r.rotulo, erro: r.erro });
  }
  return { compostos, falhas };
}

/**
 * A frase que vai acima do botao de imprimir.
 *
 * Ela e funcao pura e nao JSX pelo motivo do arquivo inteiro, e existe por um
 * segundo: "imprimir 27" e "imprimir 27 de 28" sao a mesma tela para quem esta
 * com pressa, e so a segunda deixa a pessoa parar.
 */
export function frasePreImpressao(e: {
  compostos: number;
  falhas: number;
  fora: number;
  total: number;
}): string {
  const partes = [`${e.compostos} de ${e.total} fatura(s) da competencia`];
  if (e.fora > 0) partes.push(`${e.fora} fora do lote por status`);
  if (e.falhas > 0) partes.push(`${e.falhas} NAO compos e precisa(m) de atencao`);
  return partes.join(' · ');
}
