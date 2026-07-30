// O DESENHO DO QR - o quadrado que o cliente aponta a camera.
//
// De onde ele vem: era a primeira das tres pendencias nomeadas da
// `Q-DOCFATURA-01` em 30/07. O `brcode.ts` ja produzia a string completa e
// valida - o Pix pagava por copia-e-cola -, e o que faltava era so o desenho.
// A sessao 14 registrou a ausencia em vez de desenhar um quadrado parecido com
// um QR, e este arquivo e o que fecha aquela linha.
//
// ------------------------------------------------------------------------
// POR QUE ESTE MODULO E PURO, E O QUE ISSO PROTEGE.
//
// Vale o mesmo raciocinio do `brcode.ts`, um degrau adiante. La os dois modos de
// falha eram "o app recusa" (barulhento) e "o app aceita e o dinheiro vai para o
// lugar errado" (silencioso). Aqui ha um terceiro, e ele e o pior:
//
//   - matriz malformada: a camera nao le. Barulhento, ninguem perde dinheiro.
//   - Reed-Solomon errado: a camera CORRIGE o que nao devia e le OUTRA string.
//     Os codigos de correcao existem para consertar sujeira no papel; um bloco de
//     paridade errado transforma essa capacidade em invencao silenciosa de dado.
//
// Por isso o codificador nao mora numa tela: e funcao pura, com suite propria, e
// a suite NAO se verifica contra a minha propria saida. Ver `tests/qrcode.ts`:
// as verificacoes sao propriedades matematicamente independentes da construcao
// (sindrome zero, divisibilidade do BCH, ida-e-volta por decodificador escrito
// separado) mais as ancoras publicadas que dao para DERIVAR a mao. Ajustar o
// esperado para a saida do meu codigo passaria com o algoritmo errado - foi
// exatamente o erro que a sessao 14 pegou no teste do CRC.
//
// ------------------------------------------------------------------------
// O QUE ESTE MODULO IMPLEMENTA, E O QUE NAO.
//
// Modo BYTE, versoes 1 a 12, quatro niveis de correcao. Byte e obrigatorio e nao
// e escolha: o modo alfanumerico do QR nao tem minusculas, e todo BR Code carrega
// `br.gov.bcb.pix` no campo 26. Tentar alfanumerico geraria um payload que o
// aplicativo le como outra coisa.
//
// O TETO DE 12 E DELIBERADO E NOMEADO. A versao 12 no nivel L cabe 370 bytes, e o
// pior BR Code que o `brcode.ts` consegue montar tem 244 (chave aleatoria de 77 no
// campo 26, valor de 13 digitos, txid de 25). Sobra 1,5x. Acima disso a tabela de
// blocos da §7 do ISO/IEC 18004 continua, e ela NAO esta aqui - entao a funcao
// LEVANTA com o limite nomeado, em vez de truncar o payload em silencio. Truncar
// daria um QR legivel apontando para um Pix incompleto.

/** Nivel de correcao de erro. `M` (15%) e o padrao do documento: o papel dobra. */
export type NivelDeCorrecao = 'L' | 'M' | 'Q' | 'H';

export class QrInvalido extends Error {
  constructor(m: string) { super(`QR: ${m}`); this.name = 'QrInvalido'; }
}

// ---------------------------------------------------------------------------
// GF(256) - a aritmetica de corpo finito que o Reed-Solomon usa.
//
// Polinomio primitivo 0x11d e gerador 2, que sao os do QR. Trocar o polinomio da
// tabelas coerentes entre si e paridade que nenhum leitor aceita - o tipo de erro
// que nao aparece em teste que compara a saida com a propria saida.
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // A segunda metade repete a primeira para que `EXP[a + b]` dispense o modulo.
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

/** Multiplicacao em GF(256). Zero e absorvente e precisa do caso explicito:
 *  `LOG[0]` nao existe, e usar 0 ali daria `EXP[...]` de um expoente errado. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** `EXP[i]` exposto para a suite poder avaliar polinomio nas raizes sem repetir a
 *  tabela - e a base da verificacao por sindrome. */
export function gfExp(i: number): number { return EXP[((i % 255) + 255) % 255]; }

/**
 * O polinomio gerador de grau `grau`: (x - a^0)(x - a^1)...(x - a^(grau-1)).
 *
 * Coeficientes do mais significativo para o menos, com o termo lider 1 implicito
 * na posicao 0.
 */
function geradorRs(grau: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < grau; i++) {
    const novo = new Uint8Array(g.length + 1);
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j];
      novo[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

/**
 * Os `grau` codewords de paridade de um bloco de dados.
 *
 * E divisao polinomial longa: o resto de `dados * x^grau` por `geradorRs(grau)`.
 */
export function paridadeRs(dados: Uint8Array, grau: number): Uint8Array {
  const g = geradorRs(grau);
  const resto = new Uint8Array(grau);
  for (const byte of dados) {
    const fator = byte ^ resto[0];
    resto.copyWithin(0, 1);
    resto[grau - 1] = 0;
    if (fator !== 0) {
      // `g[0]` e 1 e por isso o laco comeca em 1: o termo lider so serviu para
      // escolher o fator.
      for (let j = 0; j < grau; j++) resto[j] ^= gfMul(g[j + 1], fator);
    }
  }
  return resto;
}

// ---------------------------------------------------------------------------
// BCH - a informacao de formato e a de versao.
//
// As duas sao CALCULADAS, nao tabeladas, e isso e escolha: a tabela do ISO tem 32
// entradas de formato e 34 de versao, e uma constante copiada errada produz um QR
// que alguns leitores destroem tentando corrigir. Calcular deixa uma unica linha
// para estar certa, e a suite a confere contra os valores publicados.
// ---------------------------------------------------------------------------

/** Resto de `dado << grau` pelo gerador, em GF(2). */
function bch(dado: number, gerador: number, grau: number): number {
  let v = dado << grau;
  const bitsGerador = 32 - Math.clz32(gerador);
  while (32 - Math.clz32(v) >= bitsGerador) v ^= gerador << (32 - Math.clz32(v) - bitsGerador);
  return v;
}

/** Bits de nivel na informacao de formato. NAO e a ordem alfabetica: o ISO usa
 *  L=01, M=00, Q=11, H=10, e trocar isso da um QR que o leitor decodifica com o
 *  numero errado de codewords de paridade. */
const BITS_DO_NIVEL: Record<NivelDeCorrecao, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/**
 * Os 15 bits de informacao de formato: 5 de dado (2 de nivel + 3 de mascara),
 * 10 de BCH, tudo XOR com a mascara 0x5412 do padrao.
 *
 * A mascara final existe para que o formato nunca seja todo zero - um campo de
 * formato zerado e indistinguivel de area em branco.
 */
export function informacaoDeFormato(nivel: NivelDeCorrecao, mascara: number): number {
  const dado = (BITS_DO_NIVEL[nivel] << 3) | mascara;
  return ((dado << 10) | bch(dado, 0b10100110111, 10)) ^ 0b101010000010010;
}

/** Os 18 bits de informacao de versao (so v7+): 6 de dado, 12 de BCH. */
export function informacaoDeVersao(versao: number): number {
  return (versao << 12) | bch(versao, 0b1111100100101, 12);
}

// ---------------------------------------------------------------------------
// As duas tabelas que o padrao nao deixa derivar.
// ---------------------------------------------------------------------------

/**
 * Centros dos padroes de alinhamento, por versao.
 *
 * O primeiro e SEMPRE 6 e o ultimo e SEMPRE `4*versao + 10` - as duas coisas sao
 * consequencia da geometria, e a suite confere linha por linha contra elas. Foi
 * de proposito: e o que transforma uma tabela copiada a mao em tabela conferida.
 */
const ALINHAMENTO: readonly (readonly number[])[] = [
  [],                 // v1 - nao tem
  [6, 18],            // v2
  [6, 22],            // v3
  [6, 26],            // v4
  [6, 30],            // v5
  [6, 34],            // v6
  [6, 22, 38],        // v7
  [6, 24, 42],        // v8
  [6, 26, 46],        // v9
  [6, 28, 50],        // v10
  [6, 30, 54],        // v11
  [6, 32, 58],        // v12
];

/**
 * A estrutura de blocos, por versao e nivel: `[paridadePorBloco, blocosG1, blocosG2]`.
 *
 * O grupo 2 tem sempre UM codeword de dado a mais que o grupo 1, e por isso as
 * tres coisas bastam - o tamanho dos blocos sai da conta, junto com o total de
 * codewords, que e DERIVADO do mapa de modulos reservados e nao tabelado aqui.
 *
 * A INVARIANTE QUE GUARDA ESTA TABELA, e a suite a aplica em TODAS as 48 entradas:
 *
 *     totalDeCodewords(versao) == dados + (blocosG1 + blocosG2) * paridadePorBloco
 *
 * `totalDeCodewords` vem da geometria (§ `reservados`), e `dados` tem de se
 * repartir em blocos inteiros de dois tamanhos consecutivos. Sao quatro numeros
 * amarrados por um quinto que eu nao escolhi - errar um digito aqui quebra a
 * conta, em vez de gerar paridade plausivel e errada.
 */
const BLOCOS: Record<NivelDeCorrecao, readonly (readonly [number, number, number])[]> = {
  //           v1          v2          v3          v4          v5          v6
  L: [[7, 1, 0], [10, 1, 0], [15, 1, 0], [20, 1, 0], [26, 1, 0], [18, 2, 0],
    //         v7          v8          v9         v10          v11         v12
    [20, 2, 0], [24, 2, 0], [30, 2, 0], [18, 2, 2], [20, 4, 0], [24, 2, 2]],
  M: [[10, 1, 0], [16, 1, 0], [26, 1, 0], [18, 2, 0], [24, 2, 0], [16, 4, 0],
    [18, 4, 0], [22, 2, 2], [22, 3, 2], [26, 4, 1], [30, 1, 4], [22, 6, 2]],
  Q: [[13, 1, 0], [22, 1, 0], [18, 2, 0], [26, 2, 0], [18, 2, 2], [24, 4, 0],
    [18, 2, 4], [22, 4, 2], [20, 4, 4], [24, 6, 2], [28, 4, 4], [26, 4, 6]],
  H: [[17, 1, 0], [28, 1, 0], [22, 2, 0], [16, 4, 0], [22, 2, 2], [28, 4, 0],
    [26, 4, 1], [26, 4, 2], [24, 4, 4], [28, 6, 2], [24, 3, 8], [28, 7, 4]],
};

export const VERSAO_MAXIMA = ALINHAMENTO.length;

// ---------------------------------------------------------------------------
// A geometria: o que e funcao e o que e dado.
// ---------------------------------------------------------------------------

const lado = (versao: number) => 4 * versao + 17;

/**
 * Mapa dos modulos que NAO carregam dado: localizadores, separadores, sincronismo,
 * alinhamento, formato, versao e o modulo escuro fixo.
 *
 * E daqui que sai `totalDeCodewords`, e a escolha e o oposto de tabelar: o mesmo
 * mapa que POSICIONA os bits e o que os CONTA, entao os dois nao podem divergir.
 * Um mapa errado quebraria a invariante da tabela de blocos na suite.
 */
function reservados(versao: number): Uint8Array[] {
  const n = lado(versao);
  const r: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(n));
  const marcar = (l: number, c: number) => { if (l >= 0 && l < n && c >= 0 && c < n) r[l][c] = 1; };

  // Localizadores 7x7 e separadores: um bloco 8x8 em cada canto, menos o de baixo
  // a direita, que nao tem localizador.
  for (const [l0, c0] of [[0, 0], [0, n - 8], [n - 8, 0]] as const) {
    for (let l = 0; l < 8; l++) for (let c = 0; c < 8; c++) marcar(l0 + l, c0 + c);
  }
  // Sincronismo: linha 6 e coluna 6, no trecho entre os separadores.
  for (let i = 8; i < n - 8; i++) { marcar(6, i); marcar(i, 6); }
  // Alinhamento 5x5. O par (6,6) e os dois vizinhos de canto caem dentro dos
  // localizadores e sao pulados - marcar de novo seria inofensivo, mas nao
  // desenhar o padrao ali E obrigatorio (§ `desenhar`).
  const ali = ALINHAMENTO[versao - 1];
  for (const cl of ali) for (const cc of ali) {
    if ((cl === 6 && cc === 6) || (cl === 6 && cc === n - 7) || (cl === n - 7 && cc === 6)) continue;
    for (let l = -2; l <= 2; l++) for (let c = -2; c <= 2; c++) marcar(cl + l, cc + c);
  }
  // Informacao de formato: as duas copias somam 31 modulos, e o modulo escuro
  // fixo em (n-8, 8) entra na conta.
  for (let i = 0; i < 9; i++) { marcar(8, i); marcar(i, 8); }
  for (let i = 0; i < 8; i++) { marcar(8, n - 1 - i); marcar(n - 1 - i, 8); }
  // Informacao de versao: dois blocos 3x6, so a partir da v7.
  if (versao >= 7) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) { marcar(n - 11 + i, j); marcar(j, n - 11 + i); }
  }
  return r;
}

/** Quantos codewords (dados + paridade) a versao carrega. DERIVADO do mapa. */
export function totalDeCodewords(versao: number): number {
  const r = reservados(versao);
  let livres = 0;
  for (const linha of r) for (const m of linha) if (!m) livres++;
  // O resto da divisao por 8 sao os "remainder bits" do padrao: modulos que
  // existem, ficam claros e nao carregam codeword.
  return Math.floor(livres / 8);
}

/** Quantos bytes de conteudo cabem, no modo byte. */
export function capacidadeEmBytes(versao: number, nivel: NivelDeCorrecao): number {
  const [par, g1, g2] = BLOCOS[nivel][versao - 1];
  const dados = totalDeCodewords(versao) - (g1 + g2) * par;
  // 4 bits de indicador de modo + 8 ou 16 bits de contagem.
  const cabecalho = versao <= 9 ? 12 : 20;
  return dados - Math.ceil(cabecalho / 8);
}

/** A menor versao que cabe `bytes`. Levanta com o limite NOMEADO, nao trunca. */
export function menorVersao(bytes: number, nivel: NivelDeCorrecao): number {
  for (let v = 1; v <= VERSAO_MAXIMA; v++) if (capacidadeEmBytes(v, nivel) >= bytes) return v;
  throw new QrInvalido(
    `${bytes} bytes nao cabem no nivel ${nivel} ate a versao ${VERSAO_MAXIMA} `
    + `(o teto e ${capacidadeEmBytes(VERSAO_MAXIMA, nivel)} bytes). Este modulo para na `
    + `${VERSAO_MAXIMA} de proposito: o maior BR Code possivel tem 244 bytes, e versao acima `
    + `disso exigiria tabela de blocos que nao esta escrita. Truncar daria um QR legivel `
    + `apontando para um Pix incompleto.`
  );
}

// ---------------------------------------------------------------------------
// A codificacao do conteudo.
// ---------------------------------------------------------------------------

/** Acumulador de bits, do mais significativo para o menos. */
class Bits {
  private readonly b: number[] = [];
  push(valor: number, quantos: number) {
    for (let i = quantos - 1; i >= 0; i--) this.b.push((valor >>> i) & 1);
  }
  get tamanho() { return this.b.length; }
  /** Completa com zeros ate o byte e devolve os codewords. */
  paraBytes(): Uint8Array {
    const n = Math.ceil(this.b.length / 8);
    const saida = new Uint8Array(n);
    for (let i = 0; i < this.b.length; i++) if (this.b[i]) saida[i >> 3] |= 0x80 >>> (i & 7);
    return saida;
  }
}

/**
 * Os codewords de dado: modo, contagem, conteudo, terminador e enchimento.
 *
 * O enchimento alterna `0xEC` e `0x11` - sao os bytes que o padrao fixa, e nao
 * zeros. Zeros dariam longas corridas de modulos claros e a mascara pior.
 */
function codewordsDeDado(bytes: Uint8Array, versao: number, nivelDados: number): Uint8Array {
  const bits = new Bits();
  bits.push(0b0100, 4);                              // modo byte
  bits.push(bytes.length, versao <= 9 ? 8 : 16);     // contagem
  for (const b of bytes) bits.push(b, 8);

  const capacidadeBits = nivelDados * 8;
  if (bits.tamanho > capacidadeBits) throw new QrInvalido('conteudo maior que a versao escolhida');
  // Terminador: 4 zeros, ou o que couber.
  bits.push(0, Math.min(4, capacidadeBits - bits.tamanho));

  const saida = new Uint8Array(nivelDados);
  const parciais = bits.paraBytes();
  saida.set(parciais.subarray(0, Math.min(parciais.length, nivelDados)));
  for (let i = parciais.length; i < nivelDados; i++) saida[i] = (i - parciais.length) % 2 === 0 ? 0xec : 0x11;
  return saida;
}

/**
 * Reparte em blocos, calcula a paridade de cada um e INTERCALA.
 *
 * A intercalacao e o que faz a correcao servir para o mundo real: sujeira no papel
 * atinge uma regiao contigua, e com os blocos intercalados essa regiao vira um
 * erro pequeno em cada bloco em vez de um bloco inteiro perdido.
 */
function codewordsFinais(bytes: Uint8Array, versao: number, nivel: NivelDeCorrecao): Uint8Array {
  const [par, g1, g2] = BLOCOS[nivel][versao - 1];
  const blocos = g1 + g2;
  const dados = totalDeCodewords(versao) - blocos * par;
  const tamG1 = Math.floor(dados / blocos);

  const todos = codewordsDeDado(bytes, versao, dados);
  const partesDados: Uint8Array[] = [];
  const partesParidade: Uint8Array[] = [];
  let off = 0;
  for (let i = 0; i < blocos; i++) {
    const tam = i < g1 ? tamG1 : tamG1 + 1;
    const bloco = todos.subarray(off, off + tam);
    off += tam;
    partesDados.push(bloco);
    partesParidade.push(paridadeRs(bloco, par));
  }

  const saida = new Uint8Array(totalDeCodewords(versao));
  let k = 0;
  // Dados: coluna a coluna. Blocos do grupo 1 acabam antes e sao pulados.
  const maiorDado = tamG1 + (g2 > 0 ? 1 : 0);
  for (let i = 0; i < maiorDado; i++) for (const b of partesDados) if (i < b.length) saida[k++] = b[i];
  // Paridade: todos os blocos tem o mesmo tamanho aqui, sempre.
  for (let i = 0; i < par; i++) for (const b of partesParidade) saida[k++] = b[i];
  return saida;
}

// ---------------------------------------------------------------------------
// O desenho.
// ---------------------------------------------------------------------------

/** A matriz pronta: `true` e modulo escuro. */
export type Matriz = boolean[][];

export type QrCode = {
  versao: number;
  nivel: NivelDeCorrecao;
  mascara: number;
  /** Lado em modulos, SEM a zona de silencio. */
  modulos: number;
  matriz: Matriz;
};

function desenharFuncoes(m: Matriz, versao: number) {
  const n = m.length;
  const por = (l: number, c: number, v: boolean) => { if (l >= 0 && l < n && c >= 0 && c < n) m[l][c] = v; };

  // Localizadores: 7x7 com anel claro dentro.
  for (const [l0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
    for (let l = 0; l < 7; l++) for (let c = 0; c < 7; c++) {
      const borda = l === 0 || l === 6 || c === 0 || c === 6;
      const centro = l >= 2 && l <= 4 && c >= 2 && c <= 4;
      por(l0 + l, c0 + c, borda || centro);
    }
  }
  // Sincronismo: alterna comecando escuro na posicao par.
  for (let i = 8; i < n - 8; i++) { por(6, i, i % 2 === 0); por(i, 6, i % 2 === 0); }
  // Alinhamento 5x5. Os tres centros que colidem com localizador NAO se desenham -
  // desenhar destruiria o separador e o codigo fica ilegivel.
  const ali = ALINHAMENTO[versao - 1];
  for (const cl of ali) for (const cc of ali) {
    if ((cl === 6 && cc === 6) || (cl === 6 && cc === n - 7) || (cl === n - 7 && cc === 6)) continue;
    for (let l = -2; l <= 2; l++) for (let c = -2; c <= 2; c++) {
      const d = Math.max(Math.abs(l), Math.abs(c));
      por(cl + l, cc + c, d !== 1);
    }
  }
  // O modulo escuro fixo. O padrao o exige em (4*versao + 9, 8) e ele nunca varia.
  por(4 * versao + 9, 8, true);
}

function desenharFormato(m: Matriz, nivel: NivelDeCorrecao, mascara: number) {
  const n = m.length;
  const f = informacaoDeFormato(nivel, mascara);
  const bit = (i: number) => ((f >>> i) & 1) === 1;
  // Copia 1, em volta do localizador de cima a esquerda. A coluna 6 e a linha 6
  // sao puladas porque ali mora o sincronismo.
  for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
  m[8][7] = bit(6);
  m[8][8] = bit(7);
  m[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
  /*
   * Copia 2, repartida entre os outros dois cantos. Redundancia de proposito: o
   * formato e o unico campo sem correcao Reed-Solomon.
   *
   * A REPARTICAO E 7 + 8, NAO 8 + 7, e esta linha foi um defeito que a suite
   * pegou: com 8 bits na coluna, o bit 7 caia em (n-8, 8), que e o MODULO ESCURO
   * FIXO, e o apagava metade das vezes. Sintoma: leitor que nao encontra o codigo,
   * porque aquele modulo e uma das ancoras que ele procura. Invisivel em revisao -
   * era o `Q10d` que acusou.
   */
  for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = bit(i);
  for (let i = 7; i <= 14; i++) m[8][n - 15 + i] = bit(i);
}

function desenharVersao(m: Matriz, versao: number) {
  if (versao < 7) return;
  const n = m.length;
  const v = informacaoDeVersao(versao);
  for (let i = 0; i < 18; i++) {
    const b = ((v >>> i) & 1) === 1;
    const l = Math.floor(i / 3);
    const c = i % 3;
    m[n - 11 + c][l] = b;
    m[l][n - 11 + c] = b;
  }
}

/**
 * Coloca os bits em ziguezague, de baixo para cima, duas colunas por vez, da
 * direita para a esquerda, pulando a coluna 6.
 *
 * A coluna 6 e pulada como COLUNA INTEIRA, nao modulo a modulo: ela e sincronismo
 * de ponta a ponta, e trata-la como reservada comum desalinharia todo o par de
 * colunas seguinte.
 */
function colocarDados(m: Matriz, res: Uint8Array[], codewords: Uint8Array) {
  const n = m.length;
  let bit = 0;
  const total = codewords.length * 8;
  const proximo = () => {
    if (bit >= total) return false;   // remainder bits: ficam claros
    const b = (codewords[bit >> 3] >>> (7 - (bit & 7))) & 1;
    bit++;
    return b === 1;
  };
  let subindo = true;
  for (let c = n - 1; c >= 0; c -= 2) {
    if (c === 6) c = 5;
    const cd = c;
    const ce = c - 1;
    for (let k = 0; k < n; k++) {
      const l = subindo ? n - 1 - k : k;
      for (const cc of [cd, ce]) {
        if (cc >= 0 && !res[l][cc]) m[l][cc] = proximo();
      }
    }
    subindo = !subindo;
  }
}

/** As oito mascaras do padrao, na ordem. `true` = inverte o modulo. */
const MASCARAS: readonly ((l: number, c: number) => boolean)[] = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (_l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
];

/**
 * A penalidade das quatro regras do padrao. Menor ganha.
 *
 * Isto NAO e estetica. Uma mascara ruim produz regioes grandes de uma cor so, ou
 * imita o localizador dentro da area de dados - e ai o leitor procura o canto do
 * codigo onde nao ha canto, e nao le. As constantes 3, 3, 40 e 10 sao do padrao.
 */
export function penalidade(m: Matriz): number {
  const n = m.length;
  let p = 0;

  // Regra 1: corridas de 5 ou mais na mesma cor, em linha e em coluna.
  const corridas = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let cor = get(i, 0);
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (get(i, j) === cor) { run++; continue; }
        if (run >= 5) p += 3 + (run - 5);
        cor = get(i, j);
        run = 1;
      }
      if (run >= 5) p += 3 + (run - 5);
    }
  };
  corridas((i, j) => m[i][j]);
  corridas((i, j) => m[j][i]);

  // Regra 2: cada bloco 2x2 de cor unica. Blocos maiores contam varias vezes, de
  // proposito - e assim que o padrao pesa area contigua.
  for (let l = 0; l < n - 1; l++) for (let c = 0; c < n - 1; c++) {
    const v = m[l][c];
    if (m[l][c + 1] === v && m[l + 1][c] === v && m[l + 1][c + 1] === v) p += 3;
  }

  // Regra 3: o padrao 1:1:3:1:1 do localizador com 4 modulos claros de um lado.
  const ALVO = [true, false, true, true, true, false, true];
  const claros = [false, false, false, false];
  const casa = (get: (k: number) => boolean, k: number, seq: boolean[]) =>
    seq.every((v, i) => get(k + i) === v);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (const get of [(k: number) => (k >= 0 && k < n ? m[i][k] : false),
                         (k: number) => (k >= 0 && k < n ? m[k][i] : false)]) {
        if (j + 7 <= n && casa(get, j, ALVO)
            && ((j >= 4 && casa(get, j - 4, claros)) || (j + 11 <= n && casa(get, j + 7, claros)))) {
          p += 40;
        }
      }
    }
  }

  // Regra 4: desvio da proporcao de 50% de escuros, em degraus de 5%.
  let escuros = 0;
  for (const linha of m) for (const v of linha) if (v) escuros++;
  const pct = (escuros * 100) / (n * n);
  p += 10 * Math.floor(Math.abs(pct - 50) / 5);

  return p;
}

export type OpcoesDeQr = {
  /** Padrao `M` (15%). */
  nivel?: NivelDeCorrecao;
  /** Fixa a mascara em vez de escolher pela penalidade. Existe para a suite. */
  mascara?: number;
};

/**
 * Codifica um texto ASCII em QR. E a unica funcao que o resto do sistema chama.
 *
 * NAO ACEITA NAO-ASCII, e isso e trava e nao limitacao: o BR Code ja passou por
 * `apenasAscii`, e um byte acima de 127 aqui significa que alguem montou o payload
 * por outro caminho. Deixar passar geraria um QR valido com o nome do recebedor
 * corrompido - o modo de falha silencioso que o `brcode.ts` persegue.
 */
export function codificar(texto: string, opcoes: OpcoesDeQr = {}): QrCode {
  const nivel = opcoes.nivel ?? 'M';
  if (!texto) throw new QrInvalido('texto vazio');
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const cp = texto.charCodeAt(i);
    if (cp > 0x7e || cp < 0x20) {
      throw new QrInvalido(
        `caractere fora do ASCII imprimivel na posicao ${i} (codigo ${cp}). O modo byte `
        + `gravaria o byte cru e o leitor devolveria outro texto.`
      );
    }
    bytes[i] = cp;
  }

  const versao = menorVersao(bytes.length, nivel);
  const codewords = codewordsFinais(bytes, versao, nivel);
  const n = lado(versao);
  const res = reservados(versao);

  const base: Matriz = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  desenharFuncoes(base, versao);
  desenharVersao(base, versao);
  colocarDados(base, res, codewords);

  const aplicar = (mascara: number): Matriz => {
    const m = base.map((l) => l.slice());
    const f = MASCARAS[mascara];
    for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) {
      if (!res[l][c] && f(l, c)) m[l][c] = !m[l][c];
    }
    desenharFormato(m, nivel, mascara);
    return m;
  };

  if (opcoes.mascara != null) {
    if (!Number.isInteger(opcoes.mascara) || opcoes.mascara < 0 || opcoes.mascara > 7) {
      throw new QrInvalido(`mascara ${opcoes.mascara} nao existe - sao 0 a 7`);
    }
    return { versao, nivel, mascara: opcoes.mascara, modulos: n, matriz: aplicar(opcoes.mascara) };
  }

  let melhor = 0;
  let melhorMatriz = aplicar(0);
  let melhorP = penalidade(melhorMatriz);
  for (let k = 1; k < 8; k++) {
    const m = aplicar(k);
    const p = penalidade(m);
    if (p < melhorP) { melhor = k; melhorMatriz = m; melhorP = p; }
  }
  return { versao, nivel, mascara: melhor, modulos: n, matriz: melhorMatriz };
}

// ---------------------------------------------------------------------------
// SVG.
//
// POR QUE O SVG SAI DO SERVIDOR, e nao do `.tsx`: e a decisao 4 da
// `Q-DOCFATURA-01`. O documento e composto no servidor porque o CRM vai consumir a
// mesma rota e nao roda React. Um QR que so o navegador desenha obrigaria o CRM a
// portar este arquivo.
// ---------------------------------------------------------------------------

export type OpcoesDeSvg = {
  /** Zona de silencio em modulos. O padrao exige 4, e menos que isso a camera
   *  perde a borda quando o papel tem texto ao redor. */
  silencio?: number;
  /** Lado da imagem em pixels de usuario. So `width`/`height`; o `viewBox` e em
   *  modulos, entao a impressao escala sem borrar. */
  lado?: number;
  /** Texto do `<title>`, para leitor de tela. */
  titulo?: string;
};

/**
 * A matriz como SVG, num unico `<path>`.
 *
 * SO NUMEROS INTEIROS ENTRAM NO CAMINHO, e essa e a propriedade que importa: o
 * `path` e montado a partir de indices da matriz, entao nenhum dado de cliente,
 * de fatura ou de chave Pix atravessa a string. E o que torna seguro o consumidor
 * pintar este SVG direto. A suite verifica o conjunto de caracteres do `d`.
 *
 * O `titulo` e a UNICA entrada textual e vai escapado.
 */
export function paraSvg(qr: QrCode, opcoes: OpcoesDeSvg = {}): string {
  const silencio = opcoes.silencio ?? 4;
  const n = qr.modulos;
  const total = n + 2 * silencio;

  // Corridas horizontais viram um retangulo so. Um `rect` por modulo daria ~2.000
  // elementos num QR de versao 8, e o `path` unico fica em poucos KB.
  const partes: string[] = [];
  for (let l = 0; l < n; l++) {
    let c = 0;
    while (c < n) {
      if (!qr.matriz[l][c]) { c++; continue; }
      let fim = c;
      while (fim + 1 < n && qr.matriz[l][fim + 1]) fim++;
      const largura = fim - c + 1;
      partes.push(`M${c + silencio} ${l + silencio}h${largura}v1h-${largura}z`);
      c = fim + 1;
    }
  }

  const escapar = (s: string) => s.replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const titulo = opcoes.titulo ? `<title>${escapar(opcoes.titulo)}</title>` : '';
  const lado = opcoes.lado != null ? ` width="${opcoes.lado}" height="${opcoes.lado}"` : '';

  /*
   * `shape-rendering="crispEdges"` nao e enfeite: sem ele o navegador antialiasa a
   * borda de cada modulo, e num QR impresso pequeno o cinza da borda e o que faz a
   * camera errar a leitura.
   *
   * O fundo branco e EXPLICITO. Um QR desenhado sobre fundo transparente impresso
   * em papel colorido - ou visto em tema escuro - inverte o contraste e nao le.
   */
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${lado}`
    + ` shape-rendering="crispEdges" role="img">${titulo}`
    + `<rect width="${total}" height="${total}" fill="#fff"/>`
    + `<path fill="#000" d="${partes.join('')}"/></svg>`;
}

/** O caminho curto que o documento usa: BR Code -> SVG pronto. */
export function svgDoBrCode(brcode: string, opcoes: OpcoesDeQr & OpcoesDeSvg = {}): {
  svg: string; versao: number; nivel: NivelDeCorrecao; mascara: number; modulos: number;
} {
  const qr = codificar(brcode, opcoes);
  return {
    svg: paraSvg(qr, { ...opcoes, titulo: opcoes.titulo ?? 'QR Code do Pix' }),
    versao: qr.versao, nivel: qr.nivel, mascara: qr.mascara, modulos: qr.modulos,
  };
}
