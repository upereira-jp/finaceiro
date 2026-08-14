// O CODIGO DE BARRAS DO BOLETO, desenhado. Interleaved 2 of 5, em SVG.
// Funcao pura: entram 44 digitos, sai `<svg>`. Sem DOM, sem canvas, sem rede.
//
// DE ONDE ISTO VEM. Da `Q-DOCG3-06`, e ela mudou de forma no caminho. A pergunta
// original era "escrever um codificador ou sair sem codigo de barras"; a medicao
// da referencia em 13/08 mostrou que a parte dificil nao era desenhar, era SABER
// SE A LINHA ESTA CERTA - e isso entrou em `linha-digitavel.ts` no mesmo dia.
// Com os quatro digitos verificadores no lugar, o que sobrou foi o desenho, e o
// desenho e trinta linhas de aritmetica.
//
// POR QUE NAO UMA BIBLIOTECA. A referencia usa `JsBarcode`, que e do BROWSER. O
// documento deste sistema e composto no SERVIDOR - o CRM consome a mesma rota e
// nao roda React (decisao 4 da `Q-DOCFATURA-01`). E o precedente ja existe e
// funcionou: `src/dominio/qrcode.ts` desenha a matriz do QR a mao, pelo mesmo
// motivo, e tem 768 verificacoes.
//
// ============================================================================
// O QUE O ITF E, no minimo necessario para ler o codigo abaixo
//
// Cada digito vale cinco barras, e cada barra e ESTREITA ou LARGA. Os digitos
// andam em PARES: o primeiro do par vira as barras pretas, o segundo vira os
// espacos brancos ENTRE elas - por isso "interleaved". Cinco barras mais cinco
// espacos, alternando, dao dez faixas por par.
//
// Dai sai a exigencia que mais surpreende: o numero tem de ter quantidade PAR de
// digitos. Os 44 do boleto sao pares, e nao por acaso - o leiaute do FEBRABAN foi
// desenhado para caber neste codigo.

/** Estreita = `false`, larga = `true`. Cinco por digito. */
const PADROES: readonly (readonly boolean[])[] = [
  [false, false, true, true, false],  // 0
  [true, false, false, false, true],  // 1
  [false, true, false, false, true],  // 2
  [true, true, false, false, false],  // 3
  [false, false, true, false, true],  // 4
  [true, false, true, false, false],  // 5
  [false, true, true, false, false],  // 6
  [false, false, false, true, true],  // 7
  [true, false, false, true, false],  // 8
  [false, true, false, true, false],  // 9
];

export class CodigoDeBarrasInvalido extends TypeError {
  constructor(motivo: string) {
    super(
      `Nao da para desenhar o codigo de barras: ${motivo}. Nada foi desenhado - ` +
      'um retangulo listrado que o leitor otico recusa e pior que a ausencia dele.'
    );
    this.name = 'CodigoDeBarrasInvalido';
  }
}

export type BarrasSvg = {
  svg: string;
  /** Quantas faixas de largura o desenho tem. Util para conferir proporcao. */
  modulos: number;
  digitos: number;
};

/**
 * OS 44 DIGITOS -> SVG.
 *
 * `largura_larga` e 3 e nao 2 de proposito: a especificacao aceita de 2 a 3, e 3
 * e o que os leitores oticos mais toleram em impressao domestica - que e como
 * esta fatura vai sair.
 *
 * O SVG NAO CARREGA LARGURA NEM ALTURA em atributo. Ele traz so o `viewBox`, e
 * quem o usa define a caixa em CSS. E a mesma decisao de `qrcode.ts`, e o motivo
 * e o mesmo: a folha e milimetro de papel, e um SVG que traz o proprio tamanho
 * briga com ela.
 *
 * `shape-rendering="crispEdges"` porque barra e geometria de leitor otico, nao
 * desenho: antialiasing borra a fronteira entre estreita e larga.
 */
export function barrasDoCodigo(codigo: string, opcoes: { larga?: number } = {}): BarrasSvg {
  const d = String(codigo ?? '').replace(/\D/g, '');
  if (d.length === 0) throw new CodigoDeBarrasInvalido('nao ha digito nenhum');
  if (d.length % 2 !== 0) {
    throw new CodigoDeBarrasInvalido(
      `${d.length} digitos, e o Interleaved 2 of 5 exige quantidade PAR - os digitos andam em pares, ` +
      'um vira as barras e o outro os espacos entre elas'
    );
  }
  const larga = opcoes.larga ?? 3;
  if (!Number.isInteger(larga) || larga < 2 || larga > 3) {
    throw new CodigoDeBarrasInvalido(`largura da barra larga = ${larga}; a especificacao aceita 2 ou 3`);
  }

  /* As faixas, em ordem, comecando por BARRA e alternando com ESPACO. O valor de
   * cada uma e a largura em modulos. */
  const faixas: number[] = [];

  // Inicio: barra estreita, espaco estreito, barra estreita, espaco estreito.
  faixas.push(1, 1, 1, 1);

  for (let i = 0; i < d.length; i += 2) {
    const barras = PADROES[Number(d[i])];
    const espacos = PADROES[Number(d[i + 1])];
    for (let k = 0; k < 5; k++) {
      faixas.push(barras[k] ? larga : 1);
      faixas.push(espacos[k] ? larga : 1);
    }
  }

  // Fim: barra LARGA, espaco estreito, barra estreita.
  faixas.push(larga, 1, 1);

  const total = faixas.reduce((a, b) => a + b, 0);
  const ALTURA = 100;
  const partes: string[] = [];
  let x = 0;
  for (let i = 0; i < faixas.length; i++) {
    // Indice par = barra (preta); impar = espaco (nada a desenhar).
    if (i % 2 === 0) partes.push(`<rect x="${x}" y="0" width="${faixas[i]}" height="${ALTURA}"/>`);
    x += faixas[i];
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${ALTURA}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000000" ` +
    `role="img" aria-label="Codigo de barras do boleto">${partes.join('')}</svg>`;

  return { svg, modulos: total, digitos: d.length };
}
