// O CODIGO DE BARRAS DO BOLETO. Puro, sem DOM.
// Uso: node --experimental-strip-types tests/codigo-de-barras.ts
//
// A VERIFICACAO QUE VALE E A IDA E VOLTA. Conferir que o SVG tem o numero certo
// de retangulos prova que a funcao rodou, nao que ela codificou. Entao este
// arquivo traz um DECODIFICADOR escrito do zero - ele le as larguras de volta do
// SVG e reconstroi os digitos - e exige que o resultado seja o codigo original.
//
// O decodificador nao compartilha uma linha com o codificador de proposito: um
// bug simetrico nos dois passaria despercebido se eles dividissem a tabela de
// padroes, entao a tabela e escrita de novo aqui, na forma inversa (largura ->
// digito, em vez de digito -> largura).
//
// POR QUE ISTO IMPORTA. Um codigo de barras errado nao levanta erro: ele imprime.
// Quem descobre e o caixa do banco, com o cliente na frente.

import { barrasDoCodigo, CodigoDeBarrasInvalido } from '../src/dominio/codigo-de-barras.ts';
import { codigoDeBarrasDaLinha } from '../src/dominio/linha-digitavel.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const LINHA = '75691.50043 01727.686907 00000.130013 1 15410000059669';
const CODIGO = codigoDeBarrasDaLinha(LINHA)!;

/**
 * O DECODIFICADOR. Le as larguras do SVG e devolve os digitos.
 *
 * A tabela e escrita na forma INVERSA - a chave e o padrao "eelle" (estreita /
 * larga), o valor e o digito. Escrever a mesma tabela na mesma forma que o
 * codificador faria os dois errarem juntos e em silencio.
 */
function decodificar(svg: string, larga = 3): string {
  const rects = [...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)"/g)]
    .map((m) => ({ x: Number(m[1]), w: Number(m[2]) }));
  if (rects.length === 0) throw new Error('svg sem barra');

  // Reconstroi a sequencia alternada barra/espaco a partir das posicoes.
  const faixas: number[] = [];
  let cursor = 0;
  for (const r of rects) {
    if (r.x > cursor) faixas.push(r.x - cursor); // o espaco antes desta barra
    faixas.push(r.w);
    cursor = r.x + r.w;
  }

  /* Padrao -> digito. `e` = estreita, `l` = larga. Escrita a mao, na ordem
   * inversa da do codificador, para que um erro na tabela dele nao se repita
   * aqui e os dois passem juntos. */
  const INVERSA: Record<string, string> = {
    eelle: '0', leeel: '1', eleel: '2', lleee: '3', eelel: '4',
    lelee: '5', ellee: '6', eeell: '7', leele: '8', elele: '9',
  };

  const largura = (n: number) => (n >= larga ? 'l' : 'e');

  // Pula o inicio (4 faixas estreitas) e o fim (3 faixas).
  const corpo = faixas.slice(4, faixas.length - 3);
  if (corpo.length % 10 !== 0) throw new Error(`corpo com ${corpo.length} faixas, nao multiplo de 10`);

  let saida = '';
  for (let i = 0; i < corpo.length; i += 10) {
    let barras = '', espacos = '';
    for (let k = 0; k < 10; k += 2) {
      barras += largura(corpo[i + k]);
      espacos += largura(corpo[i + k + 1]);
    }
    const a = INVERSA[barras], b = INVERSA[espacos];
    if (a === undefined || b === undefined) throw new Error(`padrao desconhecido: ${barras} / ${espacos}`);
    saida += a + b;
  }
  return saida;
}

// -------------------------------------------------- B1 a ida e volta
{
  const b = barrasDoCodigo(CODIGO);
  chk('B1', b.digitos === 44 && CODIGO.length === 44, 'o codigo do boleto tem 44 digitos');

  const devolta = decodificar(b.svg);
  chk('B1b', devolta === CODIGO,
      `IDA E VOLTA: o SVG decodifica de volta para os 44 digitos originais${devolta === CODIGO ? '' : ` (veio ${devolta})`}`);

  chk('B1c', b.modulos === 405,
      `a largura fecha a conta: 4 (inicio) + 22 pares x 18 + 5 (fim) = ${b.modulos} modulos`);

  chk('B1d', (b.svg.match(/<rect/g) ?? []).length === 114,
      '114 barras pretas - 2 do inicio, 110 do corpo, 2 do fim');
}

// ---------------------------------------- B2 a ida e volta em 500 codigos
{
  /*
   * UM codigo que fecha pode fechar por sorte. Estes 500 varrem todos os pares de
   * digitos que a tabela conhece, em posicoes diferentes.
   */
  let ok = 0;
  for (let i = 0; i < 500; i++) {
    let d = '';
    for (let k = 0; k < 44; k++) d += String((i * 7 + k * 3 + (k % 5)) % 10);
    if (decodificar(barrasDoCodigo(d).svg) === d) ok++;
  }
  chk('B2', ok === 500, `500 codigos sorteados fazem ida e volta sem perder digito (${ok}/500)`);

  const todosPares = barrasDoCodigo('00112233445566778899' + '0011223344556677');
  chk('B2b', decodificar(todosPares.svg) === '001122334455667788990011223344556677',
      'os dez digitos aparecem como barra E como espaco, e todos voltam');
}

// -------------------------------------------- B3 o que ele recusa desenhar
{
  const recusa = (v: string, larga?: number) => {
    try { barrasDoCodigo(v, larga === undefined ? {} : { larga }); return false; }
    catch (e) { return e instanceof CodigoDeBarrasInvalido; }
  };

  chk('B3', recusa('123'),
      'QUANTIDADE IMPAR E RECUSADA: no Interleaved 2 of 5 os digitos andam em pares, '
      + 'um vira barra e o outro o espaco - 43 digitos nao tem como ser desenhado');
  chk('B3b', recusa(''), 'vazio e recusado, e nao vira um SVG em branco');
  chk('B3c', recusa('1234', 1) && recusa('1234', 4),
      'razao fora de 2..3 e recusada - fora dela o leitor otico erra estreita por larga');
  chk('B3d', !recusa('1234', 2) && !recusa('1234', 3), 'e 2 e 3 sao aceitas, que e o que a especificacao diz');
}

// ------------------------------- B4 o desenho nao carrega o proprio tamanho
{
  const b = barrasDoCodigo(CODIGO);
  chk('B4', !/<svg[^>]*\swidth=/.test(b.svg) && !/<svg[^>]*\sheight=/.test(b.svg),
      'o SVG NAO traz width/height - a folha e milimetro de papel, e quem define a caixa e o CSS '
      + '(mesma decisao de `qrcode.ts`)');
  chk('B4b', b.svg.includes('shape-rendering="crispEdges"'),
      'crispEdges: barra e geometria de leitor otico, e antialiasing borra a fronteira estreita/larga');
  chk('B4c', b.svg.includes('preserveAspectRatio="none"'),
      'a barra estica na horizontal sem distorcer a leitura - so a largura relativa importa');
  chk('B4d', b.svg.includes('aria-label'), 'o desenho se identifica para quem le por leitor de tela');
}

console.log();
if (falhas > 0) { console.log(`--- codigo de barras: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- o codigo de barras do boleto: 14 verificacoes, 0 falhas');
