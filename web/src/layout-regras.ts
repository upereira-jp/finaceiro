// A GEOMETRIA DO PAPEL NA TELA, PURA e fora do `.tsx`.
//
// O runner do `web/` nao le JSX, entao regra dentro do componente e inalcancavel
// por teste (regra 8).
//
// ESTE ARQUIVO ENCOLHEU EM 14/08, e o que sobrou diz o que ele e hoje. Ele
// nascera como as regras do EDITOR de layout - arrastar, redimensionar, prender
// na grade, criar bloco -, e o editor saiu junto com a composicao posicionada
// quando o modelo G3 fixo passou a cobrir os cinco tipos de bloco dele. Sobraram
// as quatro que nao eram do editor e sim do PAPEL, e continuam servindo a folha
// G3: escalar a previa, converter milimetro em pixel, montar a regra `@page` e
// medir o lado do QR.
//
// O QUE SUMIU JUNTO, e vale registrar porque era metade do arquivo: `naGrade`,
// `arrastar`, `redimensionar`, `blocoNovo`, `areaDaFolha` e
// `medidasComOrientacao`. Nenhuma tinha consumidor fora do proprio editor e do
// teste dele - medido antes de remover.

export type Medidas = { largura_mm: number; altura_mm: number };

/**
 * A ESCALA DA PREVIA: quantos pixels vale um milimetro na tela.
 *
 * A previa e a MESMA geometria do papel, so escalada - e e isso que conserta o
 * ponto 4 do plano. Antes a tela usava `max-width: 800px; padding: 32px` e o
 * papel usava margem de 16 mm: duas geometrias diferentes, entao a previa nao
 * respondia "e assim que vai sair?".
 *
 * Teto em 1 (nao amplia): esticar A4 numa tela larga mostraria tipografia maior
 * do que a impressa, que e o erro oposto e igualmente enganoso.
 */
export function escalaDaPrevia(larguraDisponivelPx: number, larguraDaFolhaMm: number): number {
  const natural = larguraDaFolhaMm * PX_POR_MM;
  if (larguraDisponivelPx <= 0 || natural <= 0) return 1;
  return Math.min(1, larguraDisponivelPx / natural);
}

/** 96 dpi CSS - e a definicao do `mm` no browser, nao uma escolha nossa. */
export const PX_POR_MM = 96 / 25.4;

/**
 * A REGRA `@page`, e ela e o conserto do ponto 3 do plano.
 *
 * Sem `size`, o navegador usa o padrao do SISTEMA de quem imprime - a mesma
 * fatura sai com geometria diferente em duas maquinas, e nada registra qual foi
 * usada. Com o papel declarado, o PDF sai igual em qualquer lugar.
 *
 * `margin: 0` e deliberado: as margens do tenant ja estao nas coordenadas dos
 * blocos. Somar as duas margens as aplicaria duas vezes.
 */
export function regraDaPagina(cssDoPapel: string, orientacao: string): string {
  return `@page { size: ${cssDoPapel} ${orientacao === 'paisagem' ? 'landscape' : 'portrait'}; margin: 0; }`;
}

/**
 * O LADO QUE O DESENHO DO QR OCUPA, LIDO DO PROPRIO SVG.
 *
 * MEDIDO EM 09/08/2026, no bundle que producao serve: a caixa do QR na tela era
 * `180x180` escrita a mao, e o SVG que o servidor manda tem `width="220"
 * height="220"` (`svgDoBrCode(..., { lado: 220 })`). O desenho vazava **40 px
 * para a direita e 40 px para baixo** da propria caixa, e como conteudo em linha
 * e pintado em ordem de arvore, o texto que vem DEPOIS era pintado POR CIMA do
 * QR: a legenda entrava 24 px no lado direito e o paragrafo "Copia e cola" cruzava
 * os 220 px de baixo, em cima do padrao localizador. Um QR com texto por cima nao
 * le - e o painel existe justamente para ser lido por uma camera.
 *
 * O DEFEITO NAO ERA O NUMERO ERRADO, ERA HAVER DOIS. O tamanho do desenho e
 * decidido no servidor, que e onde ele tem de ser decidido: o CRM consome o mesmo
 * payload e nao roda React. Enquanto a tela tambem afirmasse um tamanho, as duas
 * verdades podiam divergir - e divergiam em silencio, porque nada falha quando um
 * SVG transborda a caixa. Entao a tela parou de afirmar e passou a LER.
 *
 * Devolve `null` quando o SVG nao declara os dois lados, ou quando eles nao sao
 * iguais: nesse caso a caixa nao fixa tamanho nenhum e se ajusta ao conteudo, que
 * tambem nao sobrepoe. Fallback que encolhe o desenho seria pior - reescalar
 * modulo de QR e o que faz camera errar leitura.
 */
export function ladoDoQr(svg: string): number | null {
  // So a TAG DE ABERTURA: o `<rect>` do fundo branco tambem tem width e height,
  // e sao as medidas do viewBox (57), nao as da tela.
  const abertura = svg.match(/<svg\b[^>]*>/);
  if (!abertura) return null;
  const largura = abertura[0].match(/\swidth="(\d+(?:\.\d+)?)"/);
  const altura = abertura[0].match(/\sheight="(\d+(?:\.\d+)?)"/);
  if (!largura || !altura) return null;
  const l = Number(largura[1]);
  // Quadrado por construcao. Lados diferentes significam que a premissa mudou, e
  // ai a caixa nao adivinha qual dos dois vale.
  return Number.isFinite(l) && l > 0 && l === Number(altura[1]) ? l : null;
}

