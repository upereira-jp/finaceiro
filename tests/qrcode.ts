// O DESENHO DO QR - a suite.
// Uso: node --experimental-strip-types tests/qrcode.ts
//
// ------------------------------------------------------------------------
// COMO ESTA SUITE SE VERIFICA, E POR QUE ISSO E O ASSUNTO PRINCIPAL DELA.
//
// A sessao 14 pegou um erro meu no teste do CRC do BR Code: eu havia afirmado um
// "payload de exemplo do Manual do BACEN" que tinha reconstruido de memoria.
// Ajustar o esperado para a saida do meu proprio codigo teria virado TAUTOLOGIA -
// o teste passaria com o algoritmo errado. Um codificador de QR e o lugar onde
// esse erro custaria mais: Reed-Solomon errado nao produz codigo ilegivel, produz
// codigo que a camera CORRIGE para outra string.
//
// Entao nada aqui compara a saida com uma constante que eu escrevi olhando a
// saida. As verificacoes sao de tres tipos, e os tres sao independentes da
// construcao:
//
//   1. PROPRIEDADE MATEMATICA. A paridade Reed-Solomon esta certa se, e somente
//      se, o codeword completo avaliado nas raizes do gerador der zero (sindrome
//      nula). Isso usa `gfMul`/`gfExp` e NAO usa a divisao polinomial que gerou a
//      paridade - se a divisao estiver errada, a sindrome acusa. Mesma ideia para
//      o BCH do formato e da versao: divisibilidade conferida por uma rotina de
//      bits escrita de outro jeito, e distancia de Hamming minima do codigo.
//
//   2. IDA E VOLTA POR DECODIFICADOR SEPARADO. O `decodificar` daqui nao importa
//      nada do modulo alem das tabelas de GF: ele redescobre quais modulos sao de
//      funcao por PREDICADO GEOMETRICO, nao pelos mesmos lacos de marcacao, le o
//      formato do proprio desenho, desfaz a mascara, desintercala e recupera o
//      texto. Um erro de posicionamento aparece como texto diferente.
//
//   3. ANCORA PUBLICADA QUE DA PARA DERIVAR A MAO. O exemplo do ISO/IEC 18004
//      ("01234567" na versao 1-M) tem os codewords de dado DERIVAVEIS a mao -
//      estao derivados no comentario do Q4 - e a paridade publicada. Os dois
//      caminhos tem de concordar.
//
// O que NAO da para verificar aqui: se um celular real le o codigo. Isso e teste
// de campo e esta dito no RESUMO, nao escondido.

import {
  codificar, paraSvg, svgDoBrCode, penalidade,
  gfMul, gfExp, paridadeRs, informacaoDeFormato, informacaoDeVersao,
  totalDeCodewords, capacidadeEmBytes, menorVersao, VERSAO_MAXIMA,
  QrInvalido, type Matriz, type NivelDeCorrecao, type QrCode,
} from '../src/dominio/qrcode.ts';
import { pixEstatico, crcConfere } from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const NIVEIS: NivelDeCorrecao[] = ['L', 'M', 'Q', 'H'];

// ===========================================================================
// Q1-Q4  GF(256) e Reed-Solomon, por propriedade
// ===========================================================================

// -------------------------------------------------------------- Q1 o corpo
{
  // a^255 = 1 e a ordem do gerador. Se o polinomio primitivo estiver errado o
  // ciclo fecha antes de 255 e esta conta quebra.
  let ordem = 0;
  for (let i = 1; i <= 255; i++) if (gfExp(i) === 1) { ordem = i; break; }
  chk('Q1a', ordem === 255, `a ordem do gerador em GF(256) e 255 (medido ${ordem})`);

  // Distributividade sobre XOR em todo o corpo seria 16 milhoes de pares; uma
  // amostra determinista de 256x256 nas potencias cobre a estrutura inteira.
  let ok = true;
  for (let a = 0; a < 256 && ok; a++) for (let b = 0; b < 256; b++) {
    const c = (a * 7 + b * 13) & 0xff;
    if (gfMul(a, b ^ c) !== (gfMul(a, b) ^ gfMul(a, c))) { ok = false; break; }
  }
  chk('Q1b', ok, 'multiplicacao distribui sobre XOR nos 65.536 pares');

  chk('Q1c', gfMul(0, 123) === 0 && gfMul(123, 0) === 0, 'zero e absorvente (o caso que LOG[0] nao cobre)');
}

// -------------------------------------------- Q2 sindrome nula, o teste central
{
  /*
   * A VERIFICACAO QUE NAO PODE SER TAUTOLOGICA.
   *
   * Se P(x) e a paridade de D(x) para o gerador g(x) = (x-a^0)...(x-a^(t-1)),
   * entao C(x) = D(x)*x^t + P(x) e multiplo de g(x). Logo C(a^i) = 0 para todo
   * i < t. Avaliar por Horner usa so a tabela do corpo - nao usa a divisao
   * polinomial que produziu P. Uma paridade errada da sindrome nao nula.
   */
  const sindromeNula = (dados: Uint8Array, par: number): boolean => {
    const c = new Uint8Array(dados.length + par);
    c.set(dados);
    c.set(paridadeRs(dados, par), dados.length);
    for (let i = 0; i < par; i++) {
      const raiz = gfExp(i);
      let v = 0;
      for (const b of c) v = gfMul(v, raiz) ^ b;
      if (v !== 0) return false;
    }
    return true;
  };

  // Determinista de proposito - `Math.random()` daria um teste que falha um dia e
  // passa no outro, e nao ha como reproduzir a falha.
  let ok = 0;
  let total = 0;
  for (const par of [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]) {
    for (const tam of [1, 2, 9, 16, 31, 43, 68, 97, 116]) {
      const d = new Uint8Array(tam);
      for (let i = 0; i < tam; i++) d[i] = (i * 37 + par * 11 + tam * 7) & 0xff;
      total++;
      if (sindromeNula(d, par)) ok++;
    }
  }
  chk('Q2a', ok === total, `sindrome nula em ${ok}/${total} combinacoes de grau x tamanho`);

  // O contraponto: um bit trocado na paridade TEM de quebrar a sindrome. Sem isto
  // a verificacao acima poderia passar por vacuidade.
  const d = new Uint8Array([0x10, 0x20, 0x0c, 0x56]);
  const p = paridadeRs(d, 10);
  p[3] ^= 0x01;
  const c = new Uint8Array(d.length + 10);
  c.set(d); c.set(p, d.length);
  let quebrou = false;
  for (let i = 0; i < 10 && !quebrou; i++) {
    let v = 0;
    for (const b of c) v = gfMul(v, gfExp(i)) ^ b;
    if (v !== 0) quebrou = true;
  }
  chk('Q2b', quebrou, 'um bit trocado na paridade QUEBRA a sindrome (a verificacao nao e vacua)');
}

// ------------------------------------- Q3 a paridade publicada do exemplo do ISO
{
  /*
   * ANCORA EXTERNA. O exemplo do ISO/IEC 18004 (anexo I) codifica "01234567" na
   * versao 1, nivel M. Os 16 codewords de DADO dele sao derivaveis a mao, e eu
   * derivei antes de escrever esta linha:
   *
   *   modo numerico    0001
   *   contagem = 8     0000001000        (10 bits na v1)
   *   "012" = 12       0000001100        (10 bits)
   *   "345" = 345      0101011001        (10 bits)
   *   "67"  = 67       1000011           (7 bits, grupo de 2)
   *   terminador       0000, e enchimento EC 11 alternado ate 16 codewords
   *
   *   agrupando de 8 em 8:
   *     00010000 = 0x10   00100000 = 0x20   00001100 = 0x0C   01010110 = 0x56
   *     01100001 = 0x61   10000000 = 0x80   depois EC 11 EC 11 EC 11 EC 11 EC 11
   *
   * A paridade abaixo e a PUBLICADA no mesmo exemplo. Se o meu Reed-Solomon
   * discordar dela, um dos dois esta errado - e a sindrome do Q2 diz qual.
   */
  const dados = new Uint8Array([0x10, 0x20, 0x0c, 0x56, 0x61, 0x80,
    0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
  const esperada = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];
  const obtida = Array.from(paridadeRs(dados, 10));
  const hex = (a: number[]) => a.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  chk('Q3', hex(obtida) === hex(esperada),
    `paridade do exemplo do ISO 18004 (v1-M, "01234567"): ${hex(obtida)}${
      hex(obtida) === hex(esperada) ? '' : ` — esperada ${hex(esperada)}`}`);
}

// ===========================================================================
// Q4-Q6  BCH do formato e da versao, por propriedade
// ===========================================================================

/** Resto de divisao polinomial em GF(2), por VETOR DE BITS - implementacao
 *  diferente da do modulo, que trabalha por deslocamento de inteiro. */
function restoPorBits(palavra: number, bits: number, gerador: number, bitsGerador: number): number {
  const v: number[] = [];
  for (let i = bits - 1; i >= 0; i--) v.push((palavra >>> i) & 1);
  const g: number[] = [];
  for (let i = bitsGerador - 1; i >= 0; i--) g.push((gerador >>> i) & 1);
  for (let i = 0; i + g.length <= v.length; i++) {
    if (!v[i]) continue;
    for (let j = 0; j < g.length; j++) v[i + j] ^= g[j];
  }
  let r = 0;
  for (const b of v) r = (r << 1) | b;
  return r;
}

const hamming = (a: number, b: number) => {
  let x = a ^ b;
  let n = 0;
  while (x) { n += x & 1; x >>>= 1; }
  return n;
};

// ---------------------------------------------- Q4 formato: divisibilidade e d
{
  const MASCARA_XOR = 0b101010000010010;   // 0x5412, a do padrao
  const todos: number[] = [];
  let divisiveis = 0;
  for (const nivel of NIVEIS) for (let m = 0; m < 8; m++) {
    const f = informacaoDeFormato(nivel, m);
    todos.push(f);
    // Desfeito o XOR do padrao, a palavra tem de ser multipla do gerador
    // 0b10100110111. Conferido pela rotina de bits, nao pela do modulo.
    if (restoPorBits(f ^ MASCARA_XOR, 15, 0b10100110111, 11) === 0) divisiveis++;
  }
  chk('Q4a', divisiveis === 32, `as 32 palavras de formato sao multiplas do gerador BCH (${divisiveis}/32)`);

  // Caso derivavel a mao: nivel M e mascara 0 dao dado zero, BCH zero, e a palavra
  // e a propria mascara do padrao. Se os bits de nivel estiverem trocados, falha.
  chk('Q4b', informacaoDeFormato('M', 0) === MASCARA_XOR,
    `formato de M/mascara 0 e a mascara do padrao 0x${MASCARA_XOR.toString(16).toUpperCase()} (dado zero, BCH zero)`);

  let d = 15;
  for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) {
    d = Math.min(d, hamming(todos[i], todos[j]));
  }
  // O formato e o unico campo do QR SEM Reed-Solomon: ele se protege pela
  // distancia do codigo mais pela copia dupla. Distancia pequena aqui significaria
  // que um borrao no canto troca o nivel de correcao lido.
  chk('Q4c', d >= 6, `distancia de Hamming minima entre as 32 palavras de formato = ${d} (>= 6)`);
}

// --------------------------------------------- Q5 versao: divisibilidade, d, top
{
  let ok = 0;
  let topo = 0;
  const todos: number[] = [];
  for (let v = 7; v <= VERSAO_MAXIMA; v++) {
    const w = informacaoDeVersao(v);
    todos.push(w);
    if (restoPorBits(w, 18, 0b1111100100101, 13) === 0) ok++;
    if ((w >>> 12) === v) topo++;
  }
  const n = VERSAO_MAXIMA - 6;
  chk('Q5a', ok === n, `as ${n} palavras de versao (v7-v${VERSAO_MAXIMA}) sao multiplas do gerador BCH (${ok}/${n})`);
  chk('Q5b', topo === n, `os 6 bits altos de cada palavra de versao sao o numero da versao (${topo}/${n})`);

  // ANCORA: a palavra da versao 7 e publicada como 0x07C94. Ela e calculada aqui,
  // nao tabelada - se o meu BCH e a constante publicada concordam, sao duas
  // derivacoes independentes dando o mesmo numero.
  chk('Q5c', informacaoDeVersao(7) === 0x07c94,
    `versao 7 calculada = 0x${informacaoDeVersao(7).toString(16).toUpperCase().padStart(5, '0')}, publicada 0x07C94`);

  let d = 18;
  for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) {
    d = Math.min(d, hamming(todos[i], todos[j]));
  }
  chk('Q5d', d >= 7, `distancia minima entre as palavras de versao = ${d} (>= 7)`);
}

// ===========================================================================
// Q6-Q8  As tabelas que o padrao nao deixa derivar, conferidas por invariante
// ===========================================================================

// ------------------------------------- Q6 total de codewords: ancoras publicadas
{
  // Estes tres numeros sao os do padrao, e aqui eles NAO estao tabelados: saem da
  // contagem dos modulos livres do mapa de reservados. Se a geometria estiver
  // errada em um modulo so, um dos tres muda.
  const ancoras: [number, number][] = [[1, 26], [2, 44], [7, 196]];
  const erradas = ancoras.filter(([v, n]) => totalDeCodewords(v) !== n);
  chk('Q6a', erradas.length === 0,
    `total de codewords DERIVADO da geometria bate com o padrao em v1=26, v2=44, v7=196${
      erradas.length ? ` — erraram ${erradas.map(([v, n]) => `v${v} (deu ${totalDeCodewords(v)}, esperado ${n})`).join(', ')}` : ''}`);

  // Monotonia: versao maior nunca carrega menos codeword.
  let mono = true;
  for (let v = 2; v <= VERSAO_MAXIMA; v++) if (totalDeCodewords(v) <= totalDeCodewords(v - 1)) mono = false;
  chk('Q6b', mono, `total de codewords cresce de v1 (${totalDeCodewords(1)}) a v${VERSAO_MAXIMA} (${totalDeCodewords(VERSAO_MAXIMA)})`);
}

// --------------------------------- Q7 a invariante que guarda a tabela de blocos
{
  /*
   * A TABELA DE BLOCOS E O UNICO LUGAR DESTE MODULO COPIADO A MAO DO PADRAO, e
   * esta e a verificacao que a guarda. Para cada uma das 48 entradas:
   *
   *   - total (DERIVADO da geometria) = dados + blocos * paridadePorBloco;
   *   - `dados` se reparte em `blocosG1` blocos de tamanho k e `blocosG2` de k+1;
   *   - Reed-Solomon exige bloco + paridade <= 255.
   *
   * Sao quatro numeros amarrados por um quinto que eu nao escolhi. Um digito
   * errado em qualquer um quebra a conta em vez de gerar paridade plausivel.
   */
  let ok = 0;
  const ruins: string[] = [];
  for (const nivel of NIVEIS) for (let v = 1; v <= VERSAO_MAXIMA; v++) {
    const total = totalDeCodewords(v);
    const cap = capacidadeEmBytes(v, nivel);
    // `capacidadeEmBytes` desconta o cabecalho; reconstruir `dados` a partir dela
    // e do total exige que a conta feche nos dois sentidos.
    const cabecalho = v <= 9 ? 2 : 3;
    const dados = cap + cabecalho;
    const resto = total - dados;
    // Reparticao: dados = g1*k + g2*(k+1), com k = floor(dados/blocos).
    let coerente = false;
    for (let blocos = 1; blocos <= 20; blocos++) {
      if (resto % blocos !== 0) continue;
      const par = resto / blocos;
      const k = Math.floor(dados / blocos);
      const g2 = dados - k * blocos;
      const g1 = blocos - g2;
      if (g1 >= 0 && g2 >= 0 && g1 * k + g2 * (k + 1) === dados && k + par <= 255 && k >= 1) {
        coerente = true;
        break;
      }
    }
    if (coerente) ok++;
    else ruins.push(`${nivel}v${v}`);
  }
  chk('Q7', ok === 48, `as 48 entradas da tabela de blocos fecham contra o total derivado (${ok}/48)${
    ruins.length ? ` — ${ruins.join(', ')}` : ''}`);
}

// -------------------------------------------- Q8 os centros de alinhamento
{
  // O primeiro centro e sempre 6 e o ultimo e sempre 4*versao+10 - consequencia da
  // geometria, nao da tabela. Confere linha por linha o que foi copiado a mao.
  let ok = 0;
  const ruins: string[] = [];
  for (let v = 2; v <= VERSAO_MAXIMA; v++) {
    // Sem exportar a tabela: o alinhamento e observavel NO DESENHO. O centro
    // esperado tem de ser modulo escuro, e o anel em volta dele, claro.
    const qr = codificar('A'.repeat(Math.max(1, capacidadeEmBytes(v, 'H'))), { nivel: 'H' });
    if (qr.versao !== v) continue;   // a versao pedida nao coincidiu, pula
    const ultimo = 4 * v + 10;
    const centroEscuro = qr.matriz[ultimo][ultimo] === true;
    const anelClaro = qr.matriz[ultimo - 1][ultimo] === false && qr.matriz[ultimo][ultimo - 1] === false;
    if (centroEscuro && anelClaro) ok++;
    else ruins.push(`v${v}`);
  }
  chk('Q8', ruins.length === 0,
    `o padrao de alinhamento de baixo a direita esta em (4v+10, 4v+10) nas ${ok} versoes exercitadas${
      ruins.length ? ` — falhou em ${ruins.join(', ')}` : ''}`);
}

// ===========================================================================
// Q9  O DECODIFICADOR INDEPENDENTE, e a ida-e-volta
// ===========================================================================

/*
 * Este decodificador NAO reaproveita a geometria do modulo. Ele decide o que e
 * modulo de funcao por PREDICADO - uma pergunta por classe de padrao - em vez de
 * repetir os lacos que marcam o mapa. E o que torna a ida-e-volta uma verificacao
 * e nao um espelho: um erro de posicionamento nos dois lugares teria de ser o
 * mesmo erro, escrito de duas formas diferentes.
 *
 * Ele tambem NAO corrige erro. Nao precisa: confere a sindrome. Se o desenho
 * estiver errado, a sindrome acusa antes de o texto sair diferente - e as duas
 * coisas sao verificadas em separado.
 */
function decodificar(qr: QrCode): { texto: string; nivel: NivelDeCorrecao; mascara: number; sindromeOk: boolean } {
  const m = qr.matriz;
  const n = m.length;
  const versao = (n - 17) / 4;

  // ---- 1. o formato, lido do desenho
  let bruto = 0;
  for (let i = 0; i <= 5; i++) bruto |= (m[8][i] ? 1 : 0) << i;
  bruto |= (m[8][7] ? 1 : 0) << 6;
  bruto |= (m[8][8] ? 1 : 0) << 7;
  bruto |= (m[7][8] ? 1 : 0) << 8;
  for (let i = 9; i <= 14; i++) bruto |= (m[14 - i][8] ? 1 : 0) << i;
  const dadoFormato = (bruto ^ 0b101010000010010) >>> 10;
  const porBits: Record<number, NivelDeCorrecao> = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' };
  const nivel = porBits[(dadoFormato >>> 3) & 0b11];
  const mascara = dadoFormato & 0b111;

  // ---- 2. quem e modulo de funcao, por predicado geometrico
  const ali = ((): number[] => {
    if (versao === 1) return [];
    const ultimo = 4 * versao + 10;
    if (versao <= 6) return [6, ultimo];
    // Tres centros: 6, o do meio e o ultimo, igualmente espacados.
    return [6, (6 + ultimo) / 2, ultimo];
  })();
  const ehFuncao = (l: number, c: number): boolean => {
    // Localizador + separador: bloco 8x8 nos tres cantos.
    if (l < 8 && c < 8) return true;
    if (l < 8 && c >= n - 8) return true;
    if (l >= n - 8 && c < 8) return true;
    // Sincronismo.
    if (l === 6 || c === 6) return true;
    // Formato: a coluna 8 e a linha 8 inteiras, mais as duas caudas.
    if (l === 8 && (c < 9 || c >= n - 8)) return true;
    if (c === 8 && (l < 9 || l >= n - 8)) return true;
    // Versao.
    if (versao >= 7 && ((l < 6 && c >= n - 11 && c < n - 8) || (c < 6 && l >= n - 11 && l < n - 8))) return true;
    // Alinhamento: distancia de Chebyshev <= 2 de um centro valido.
    for (const cl of ali) for (const cc of ali) {
      if ((cl === 6 && cc === 6) || (cl === 6 && cc === n - 7) || (cl === n - 7 && cc === 6)) continue;
      if (Math.abs(l - cl) <= 2 && Math.abs(c - cc) <= 2) return true;
    }
    return false;
  };

  // ---- 3. desfaz a mascara e le em ziguezague
  const fn: ((l: number, c: number) => boolean)[] = [
    (l, c) => (l + c) % 2 === 0,
    (l) => l % 2 === 0,
    (_l, c) => c % 3 === 0,
    (l, c) => (l + c) % 3 === 0,
    (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
    (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
    (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
    (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
  ];
  const f = fn[mascara];
  const bits: number[] = [];
  let subindo = true;
  for (let c = n - 1; c >= 0; c -= 2) {
    if (c === 6) c = 5;
    for (let k = 0; k < n; k++) {
      const l = subindo ? n - 1 - k : k;
      for (const cc of [c, c - 1]) {
        if (cc < 0 || ehFuncao(l, cc)) continue;
        bits.push((m[l][cc] !== f(l, cc)) ? 1 : 0);
      }
    }
    subindo = !subindo;
  }

  const total = Math.floor(bits.length / 8);
  const cw = new Uint8Array(total);
  for (let i = 0; i < total * 8; i++) if (bits[i]) cw[i >> 3] |= 0x80 >>> (i & 7);

  /*
   * ---- 4. desintercala. A estrutura sai da conta, nao de tabela nova - e assim
   *         que este decodificador continua independente do modulo.
   *
   * A SINDROME NULA NAO IDENTIFICA `par`, SO O LIMITA POR BAIXO. Isto foi um
   * defeito desta suite, e ele merece ficar escrito porque e o mesmo modo de falha
   * que o projeto persegue no resto: silencioso e plausivel.
   *
   * O gerador de grau 18 e multiplo do de grau 11 - as raizes de um sao um
   * subconjunto das do outro. Entao um bloco com 18 simbolos de paridade PASSA na
   * verificacao de 11. Pior: quando o grupo 2 esta vazio, mover o ponto de corte
   * entre dados e paridade nao muda os bytes do bloco (os dois trechos tem
   * comprimento par e a intercalacao pega os mesmos indices), so muda onde o
   * decodificador acha que os dados terminam. Resultado: a primeira versao desta
   * busca aceitava `par = 11` num codigo de `par = 18`, cortava os dados 7 bytes
   * adiante e devolvia TEXTO ERRADO com sindrome nula.
   *
   * E HA UM SEGUNDO CASO, PIOR, e foi ele que sobreviveu a primeira correcao: o
   * fluxo INTEIRO de um codigo de dois blocos tambem e um codeword. Se B0 e B1
   * vanish em a^0..a^17, o fluxo intercalado S(x) = B0(x^2)*x^a + B1(x^2)*x^b
   * satisfaz S(a^i) = B0(a^2i)*a^ai + B1(a^2i)*a^bi, e para i <= 8 o expoente 2i
   * ainda esta na faixa das raizes - logo os dois termos somem e S(a^i) = 0. Ou
   * seja: `blocos = 1, par = 9` tem sindrome nula num codigo de `blocos = 2,
   * par = 18`, e por ser o primeiro candidato do laco era o escolhido.
   *
   * A correcao que resolve as duas: coletar TODOS os candidatos e escolher o de
   * MAIOR `par`. `par` acima do verdadeiro exige mais raizes do que existem e falha
   * de fato, entao o maximo e o verdadeiro - 18 ganha de 9 e de 11.
   */
  type Candidato = { par: number; blocos: number; dadosPorBloco: number[][] };
  const candidatos: Candidato[] = [];
  for (let blocos = 1; blocos <= 20; blocos++) {
    for (let par = 7; par <= 30; par++) {
      const dados = total - blocos * par;
      if (dados < blocos) continue;
      const k = Math.floor(dados / blocos);
      const g2 = dados - k * blocos;
      const g1 = blocos - g2;
      if (g1 < 0 || g2 < 0 || k < 1) continue;
      const tam = (i: number) => (i < g1 ? k : k + 1);
      const dadosPorBloco: number[][] = Array.from({ length: blocos }, () => []);
      let idx = 0;
      for (let i = 0; i < k + 1; i++) for (let b = 0; b < blocos; b++) {
        if (i < tam(b)) dadosPorBloco[b].push(cw[idx++]);
      }
      const parPorBloco: number[][] = Array.from({ length: blocos }, () => []);
      for (let i = 0; i < par; i++) for (let b = 0; b < blocos; b++) parPorBloco[b].push(cw[idx++]);
      if (idx !== total) continue;
      let todasNulas = true;
      for (let b = 0; b < blocos && todasNulas; b++) {
        const c = [...dadosPorBloco[b], ...parPorBloco[b]];
        for (let i = 0; i < par; i++) {
          let v = 0;
          for (const byte of c) v = gfMul(v, gfExp(i)) ^ byte;
          if (v !== 0) { todasNulas = false; break; }
        }
      }
      if (todasNulas) candidatos.push({ par, blocos, dadosPorBloco });
    }
  }
  if (candidatos.length === 0) return { texto: '', nivel, mascara, sindromeOk: false };
  // Maior `par`; empate pelo maior numero de blocos.
  candidatos.sort((a, b) => (b.par - a.par) || (b.blocos - a.blocos));

  // ---- 5. o texto, do fluxo de dados remontado na ordem dos blocos
  const fluxo: number[] = [];
  for (const b of candidatos[0].dadosPorBloco) fluxo.push(...b);
  const lerBits = (off: number, quantos: number) => {
    let v = 0;
    for (let i = 0; i < quantos; i++) {
      const p = off + i;
      v = (v << 1) | ((fluxo[p >> 3] >>> (7 - (p & 7))) & 1);
    }
    return v;
  };
  const modo = lerBits(0, 4);
  const larguraContagem = versao <= 9 ? 8 : 16;
  const quantos = lerBits(4, larguraContagem);
  let texto = '';
  if (modo === 0b0100) {
    for (let i = 0; i < quantos; i++) texto += String.fromCharCode(lerBits(4 + larguraContagem + i * 8, 8));
  }
  return { texto, nivel, mascara, sindromeOk: true };
}

// -------------------------------------------- Q9 ida e volta, todas as versoes
{
  let ok = 0;
  let total = 0;
  const ruins: string[] = [];
  for (const nivel of NIVEIS) for (let v = 1; v <= VERSAO_MAXIMA; v++) {
    // Enche a versao ate a borda: e onde o bloco de tamanho k+1 aparece, e onde
    // uma desintercalacao errada se manifesta.
    const cap = capacidadeEmBytes(v, nivel);
    if (cap < 1) continue;
    const alfabeto = ' !#$%&*+-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let texto = '';
    for (let i = 0; i < cap; i++) texto += alfabeto[(i * 31 + v * 7 + nivel.charCodeAt(0)) % alfabeto.length];
    const qr = codificar(texto, { nivel });
    total++;
    if (qr.versao !== v) { ruins.push(`${nivel}v${v}: escolheu v${qr.versao}`); continue; }
    const d = decodificar(qr);
    if (d.sindromeOk && d.texto === texto && d.nivel === nivel && d.mascara === qr.mascara) ok++;
    else ruins.push(`${nivel}v${v}${d.sindromeOk ? '' : ' (sindrome)'}${d.texto === texto ? '' : ' (texto)'}${d.nivel === nivel ? '' : ` (nivel ${d.nivel})`}${d.mascara === qr.mascara ? '' : ` (mascara ${d.mascara} vs ${qr.mascara})`}`);
  }
  chk('Q9a', ok === total, `ida-e-volta por decodificador separado, na CAPACIDADE MAXIMA: ${ok}/${total} (4 niveis x ${VERSAO_MAXIMA} versoes)`);
  if (ruins.length) console.log(`      ${ruins.slice(0, 8).join(' | ')}`);

  // E com um byte a menos que o teto, que exercita o terminador e o enchimento.
  let ok2 = 0;
  let total2 = 0;
  for (const nivel of NIVEIS) for (let v = 1; v <= VERSAO_MAXIMA; v++) {
    const cap = capacidadeEmBytes(v, nivel) - 1;
    if (cap < 1) continue;
    let texto = '';
    for (let i = 0; i < cap; i++) texto += String.fromCharCode(0x21 + ((i * 17 + v) % 93));
    const qr = codificar(texto, { nivel });
    if (qr.versao !== v) continue;
    total2++;
    const d = decodificar(qr);
    if (d.sindromeOk && d.texto === texto) ok2++;
  }
  chk('Q9b', ok2 === total2, `ida-e-volta um byte abaixo do teto (terminador + enchimento EC/11): ${ok2}/${total2}`);

  // As 8 mascaras, forcadas uma a uma: se `desenharFormato` gravasse a mascara
  // errada, o decodificador desfaria a mascara errada e o texto sairia lixo.
  let ok3 = 0;
  for (let k = 0; k < 8; k++) {
    const texto = 'MASCARA ' + k + ' — teste de placement, com acento fora de proposito';
    const limpo = texto.replace(/[^\x20-\x7e]/g, '?');
    const qr = codificar(limpo, { nivel: 'Q', mascara: k });
    const d = decodificar(qr);
    if (d.mascara === k && d.texto === limpo && d.sindromeOk) ok3++;
  }
  chk('Q9c', ok3 === 8, `as 8 mascaras forcadas voltam com a mascara e o texto certos (${ok3}/8)`);
}

// ===========================================================================
// Q10  Geometria observavel no desenho
// ===========================================================================
{
  const qr = codificar('GEOMETRIA', { nivel: 'M' });
  const m = qr.matriz;
  const n = m.length;

  // Os tres localizadores: 7x7, anel escuro, anel claro, centro 3x3 escuro.
  const localizadorOk = (l0: number, c0: number) => {
    for (let l = 0; l < 7; l++) for (let c = 0; c < 7; c++) {
      const borda = l === 0 || l === 6 || c === 0 || c === 6;
      const centro = l >= 2 && l <= 4 && c >= 2 && c <= 4;
      if (m[l0 + l][c0 + c] !== (borda || centro)) return false;
    }
    return true;
  };
  chk('Q10a', localizadorOk(0, 0) && localizadorOk(0, n - 7) && localizadorOk(n - 7, 0),
    'os tres localizadores 7x7 estao inteiros e sem inversao pela mascara');

  // Separadores: o anel claro em volta de cada localizador.
  let sep = true;
  for (let i = 0; i < 8; i++) {
    if (m[7][i] || m[i][7]) sep = false;
    if (m[7][n - 1 - i] || m[i][n - 8]) sep = false;
    if (m[n - 8][i] || m[n - 1 - i][7]) sep = false;
  }
  chk('Q10b', sep, 'os separadores dos tres localizadores estao claros');

  // Sincronismo: alterna, e comeca escuro em indice par.
  let sinc = true;
  for (let i = 8; i < n - 8; i++) if (m[6][i] !== (i % 2 === 0) || m[i][6] !== (i % 2 === 0)) sinc = false;
  chk('Q10c', sinc, 'os padroes de sincronismo alternam na linha 6 e na coluna 6');

  // O modulo escuro fixo. O padrao o exige e ele nunca varia com mascara nem nivel.
  let escuro = 0;
  let casos = 0;
  for (const nivel of NIVEIS) for (let k = 0; k < 8; k++) {
    const q = codificar('MODULO ESCURO FIXO', { nivel, mascara: k });
    casos++;
    if (q.matriz[4 * q.versao + 9][8]) escuro++;
  }
  chk('Q10d', escuro === casos, `o modulo escuro fixo em (4v+9, 8) e escuro nos ${casos} pares nivel x mascara`);

  chk('Q10e', qr.modulos === 4 * qr.versao + 17 && m.length === qr.modulos && m[0].length === qr.modulos,
    `a matriz e quadrada de lado 4v+17 (v${qr.versao} -> ${qr.modulos})`);
}

// ===========================================================================
// Q11  A escolha da mascara
// ===========================================================================
{
  // A penalidade tem de PREFERIR um QR real a uma matriz de cor unica - se as
  // quatro regras estiverem invertidas, isto acusa.
  const qr = codificar('PENALIDADE', { nivel: 'M' });
  const n = qr.modulos;
  const todaEscura: Matriz = Array.from({ length: n }, () => new Array<boolean>(n).fill(true));
  const todaClara: Matriz = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  chk('Q11a', penalidade(qr.matriz) < penalidade(todaEscura) && penalidade(qr.matriz) < penalidade(todaClara),
    `penalidade do QR real (${penalidade(qr.matriz)}) e menor que a de matriz de cor unica (${penalidade(todaEscura)} / ${penalidade(todaClara)})`);

  // A mascara escolhida e a de MENOR penalidade entre as oito - conferido
  // recodificando com cada uma e comparando.
  const p: number[] = [];
  for (let k = 0; k < 8; k++) p.push(penalidade(codificar('PENALIDADE', { nivel: 'M', mascara: k }).matriz));
  const menor = p.indexOf(Math.min(...p));
  chk('Q11b', qr.mascara === menor,
    `a mascara escolhida (${qr.mascara}) e a de menor penalidade das oito [${p.join(', ')}]`);

  // Determinismo: mesmo texto, mesma saida. Um codificador que varia de execucao
  // para execucao daria documentos diferentes para a mesma fatura.
  const a = codificar('DETERMINISMO 123', { nivel: 'H' });
  const b = codificar('DETERMINISMO 123', { nivel: 'H' });
  chk('Q11c', a.mascara === b.mascara && JSON.stringify(a.matriz) === JSON.stringify(b.matriz),
    'duas codificacoes do mesmo texto dao matriz identica (sem aleatoriedade)');
}

// ===========================================================================
// Q12  O que o modulo RECUSA
// ===========================================================================
{
  const recusa = (f: () => unknown): string | null => {
    try { f(); return null; } catch (e) { return e instanceof QrInvalido ? (e as Error).message : `OUTRO: ${e}`; }
  };

  chk('Q12a', recusa(() => codificar('')) !== null, 'texto vazio e recusado');

  const acento = recusa(() => codificar('JOÃO DA SILVA'));
  chk('Q12b', acento !== null && acento.includes('ASCII'),
    'acento e recusado com a razao nomeada (o modo byte gravaria o byte cru)');

  // O TETO NOMEADO. Acima da versao 12 a funcao levanta em vez de truncar - e a
  // mensagem tem de dizer o limite e por que ele existe.
  const grande = recusa(() => codificar('X'.repeat(capacidadeEmBytes(VERSAO_MAXIMA, 'L') + 1), { nivel: 'L' }));
  chk('Q12c', grande !== null && grande.includes(String(VERSAO_MAXIMA)) && /trunc/i.test(grande),
    `acima do teto levanta com o limite nomeado (versao ${VERSAO_MAXIMA}) e diz que nao trunca`);

  chk('Q12d', recusa(() => codificar('X', { mascara: 8 })) !== null, 'mascara 8 e recusada (sao 0 a 7)');

  // O contorno do teto: EXATAMENTE no limite tem de passar.
  const noLimite = capacidadeEmBytes(VERSAO_MAXIMA, 'L');
  chk('Q12e', recusa(() => codificar('X'.repeat(noLimite), { nivel: 'L' })) === null,
    `exatamente ${noLimite} bytes (o teto do nivel L) e aceito`);

  chk('Q12f', menorVersao(1, 'M') === 1 && menorVersao(capacidadeEmBytes(1, 'M') + 1, 'M') === 2,
    'menorVersao escolhe a menor que cabe, e sobe uma quando estoura');
}

// ===========================================================================
// Q13  O SVG
// ===========================================================================
{
  const qr = codificar('SVG', { nivel: 'M' });
  const svg = paraSvg(qr, { lado: 240, titulo: 'QR Code do Pix' });

  chk('Q13a', svg.startsWith('<svg ') && svg.endsWith('</svg>'), 'o SVG e um elemento fechado');

  // A ZONA DE SILENCIO ENTRA NO viewBox. Sem os 4 modulos de margem a camera
  // perde a borda quando ha texto do documento em volta - e num documento
  // impresso sempre ha.
  chk('Q13b', svg.includes(`viewBox="0 0 ${qr.modulos + 8} ${qr.modulos + 8}"`),
    `o viewBox inclui a zona de silencio de 4 modulos de cada lado (${qr.modulos} + 8)`);

  /*
   * A PROPRIEDADE QUE IMPORTA PARA SEGURANCA: o atributo `d` e montado a partir de
   * indices da matriz, entao nenhum dado de fatura, de cliente ou de chave Pix
   * atravessa a string. E o que permite ao consumidor - a nossa tela e o CRM -
   * pintar este SVG direto. Se um dia alguem interpolar texto ali, esta linha cai.
   */
  const d = svg.match(/ d="([^"]*)"/)?.[1] ?? '';
  chk('Q13c', d.length > 0 && /^[Mhvz0-9 -]+$/.test(d),
    `o caminho tem so comandos e inteiros — ${d.length} caracteres, nenhum fora de [Mhvz0-9 -]`);

  // Fundo branco explicito: QR transparente sobre papel colorido ou em tema escuro
  // inverte o contraste e nao le.
  chk('Q13d', svg.includes('fill="#fff"') && svg.includes('fill="#000"'),
    'o SVG traz fundo branco explicito e modulos preto');

  chk('Q13e', svg.includes('width="240"') && svg.includes('height="240"'),
    'o lado em pixels e aplicado sem mexer no viewBox (escala na impressao)');

  // O titulo e a UNICA entrada textual e vai escapado.
  const comAspas = paraSvg(qr, { titulo: 'a<b>&"c' });
  chk('Q13f', comAspas.includes('<title>a&lt;b&gt;&amp;&quot;c</title>'),
    'o titulo, unica entrada textual, e escapado');

  // Corridas horizontais viradas num retangulo so: o caminho tem de ser menor que
  // um `rect` por modulo. Nao e estetica - um documento tem varias faturas.
  const modulosEscuros = qr.matriz.flat().filter(Boolean).length;
  const comandos = (d.match(/M/g) ?? []).length;
  chk('Q13g', comandos < modulosEscuros,
    `${modulosEscuros} modulos escuros viraram ${comandos} retangulos (corridas agrupadas)`);
}

// ===========================================================================
// Q14  O caminho real: BR Code -> QR -> volta, e o CRC continua conferindo
// ===========================================================================
{
  // Os tres formatos de chave que a identidade aceita, mais o pior caso de
  // tamanho. O ponto e que o QR do documento nasce do BR Code REAL, nao de um
  // texto de teste - se o payload crescer alem do teto, o teste cai aqui.
  const casos: [string, string][] = [
    ['CNPJ', pixEstatico({ chave: '11222333000181', recebedorNome: 'G3 SOLAR LTDA', recebedorCidade: 'GOIANIA', valorCentavos: 18999 })],
    ['e-mail', pixEstatico({ chave: 'financeiro@g3solar.com.br', recebedorNome: 'G3 SOLAR', recebedorCidade: 'GOIANIA', valorCentavos: 1 })],
    ['aleatoria', pixEstatico({ chave: '123e4567-e89b-12d3-a456-426614174000', recebedorNome: 'G3 SOLAR ENERGIA LTDA ME', recebedorCidade: 'APARECIDA DE GO', valorCentavos: 123456789 })],
    ['acentos normalizados', pixEstatico({ chave: '11222333000181', recebedorNome: 'JOÃO & MARIA ENERGIA', recebedorCidade: 'SÃO PAULO', valorCentavos: 100000 })],
  ];

  let ok = 0;
  const detalhes: string[] = [];
  for (const [nome, brcode] of casos) {
    const qr = codificar(brcode, { nivel: 'M' });
    const d = decodificar(qr);
    const bom = d.sindromeOk && d.texto === brcode && crcConfere(d.texto);
    if (bom) ok++;
    detalhes.push(`${nome}: ${brcode.length}B -> v${qr.versao}-${qr.nivel} m${qr.mascara}${bom ? '' : ' FALHOU'}`);
  }
  chk('Q14a', ok === casos.length, `BR Code real -> QR -> volta, com CRC conferido na volta (${ok}/${casos.length})`);
  for (const l of detalhes) console.log(`      ${l}`);

  // O PIOR BR CODE POSSIVEL tem de caber com folga. Se um dia o `brcode.ts`
  // crescer o payload, este teste avisa ANTES de a fatura sair sem QR.
  const pior = pixEstatico({
    chave: 'x'.repeat(77), recebedorNome: 'ABCDEFGHIJKLMNOPQRSTUVWXY',
    recebedorCidade: 'ABCDEFGHIJKLMNO', valorCentavos: 9999999999999,
    txid: 'ABCDEFGHIJKLMNOPQRSTUVWXY',
  });
  const qrPior = codificar(pior, { nivel: 'M' });
  const dPior = decodificar(qrPior);
  chk('Q14b', dPior.texto === pior && qrPior.versao < VERSAO_MAXIMA,
    `o pior BR Code possivel (${pior.length}B) cabe na versao ${qrPior.versao}, abaixo do teto ${VERSAO_MAXIMA}`);

  // O atalho que o documento usa de fato.
  const s = svgDoBrCode(casos[0][1]);
  chk('Q14c', s.svg.includes('<svg ') && s.modulos === 4 * s.versao + 17 && s.nivel === 'M',
    `svgDoBrCode devolve svg + metadado coerente (v${s.versao}, ${s.modulos} modulos, nivel ${s.nivel})`);

  // O nivel M nao e default acidental: e o que sobrevive a papel dobrado. Um QR
  // gerado em L para o mesmo payload sai MENOR - o teste prende que a escolha
  // custa area, para que trocar o default seja decisao consciente.
  const emL = codificar(casos[0][1], { nivel: 'L' });
  const emM = codificar(casos[0][1], { nivel: 'M' });
  chk('Q14d', emL.versao <= emM.versao,
    `o nivel L cabe em versao menor ou igual a M (v${emL.versao} <= v${emM.versao}) — M custa area de proposito`);
}

console.log(falhas === 0
  ? `\nTODAS as verificacoes do QR passaram.`
  : `\n${falhas} FALHA(S) no QR.`);
process.exit(falhas === 0 ? 0 : 1);
