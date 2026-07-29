// `emLotes` — o teto de chamadas simultaneas da SPA. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types web/tests/lotes.ts
//
// Roda de DENTRO de `web/` porque `dados.ts` importa `react`, que so existe em
// `web/node_modules`. Nao ha DOM aqui: os hooks sao importados e nao chamados.
//
// O QUE ESTES QUATRO PRENDEM: o teto de 6 e uma afirmacao sobre o pool
// transacional do servidor (8 conexoes, `maxWait` 5.000 ms). Afirmacao de
// comentario apodrece em silencio - trocar o corpo do `emLotes` por um
// `Promise.all` cru continuaria passando em toda tela e so apareceria como
// P2028 no dia da digitacao dos 39 contratos.

import { emLotes } from '../src/dados.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ L1 ordem
// A saida e casada com a entrada por INDICE, nao por ordem de chegada. Se isso
// quebrar, o mapa `{ uc_id: contrato }` de `contratos.tsx` associa o contrato de
// uma UC a outra UC - e as duas existem, entao nada falha.
{
  const itens = [50, 10, 40, 20, 30, 5, 45, 15];
  const saida = await emLotes(itens, async (ms) => { await espera(ms); return ms; });
  chk('L1', JSON.stringify(saida) === JSON.stringify(itens),
      `ordem preservada apesar de a conclusao ser fora de ordem (${saida.join(',')})`);
}

// ------------------------------------------------------------------- L2 teto
// O numero que importa. 39 e o universo real de UCs em producao.
{
  let emVoo = 0, pico = 0;
  await emLotes(Array.from({ length: 39 }, (_, i) => i), async () => {
    emVoo++; pico = Math.max(pico, emVoo);
    await espera(5);
    emVoo--;
  });
  chk('L2', pico <= 6, `39 itens, pico de ${pico} em voo — o pool transacional tem 8 slots`);
}

// -------------------------------------------------------------- L2b saturacao
// O teto tambem nao pode ser MENOR do que promete: um `emLotes` que rodasse em
// serie passaria no L2 e deixaria a tela lenta sem ninguem notar.
{
  let emVoo = 0, pico = 0;
  await emLotes(Array.from({ length: 39 }, (_, i) => i), async () => {
    emVoo++; pico = Math.max(pico, emVoo);
    await espera(5);
    emVoo--;
  });
  chk('L2b', pico === 6, `com 39 itens o teto e ATINGIDO, nao so respeitado (pico ${pico})`);
}

// ------------------------------------------------------------- L3 rejeicao
// A garantia que a correcao de 29/07 comprou: um erro sobe INTEIRO. Um mapa com
// buracos faria a tela dizer "esta UC nao tem contrato" sobre uma UC contratada.
{
  let subiu: unknown = null;
  try {
    await emLotes([1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
      await espera(n);
      if (n === 3) throw new Error('falha na 3');
      return n;
    });
  } catch (e) { subiu = e; }
  chk('L3', subiu instanceof Error && subiu.message === 'falha na 3',
      `a rejeicao de um item rejeita o conjunto (${subiu instanceof Error ? subiu.message : 'NAO SUBIU'})`);
}

// ----------------------------------------------------------------- L4 vazio
// `Math.min(6, 0)` da zero trabalhadores. Se o `Promise.all` de zero nao
// resolvesse, a tela ficaria carregando para sempre num tenant sem UC nenhuma.
{
  const saida = await emLotes([], async () => 1);
  chk('L4', Array.isArray(saida) && saida.length === 0, 'lista vazia devolve [] sem pendurar');
}

console.log(falhas === 0 ? '\nTODAS PASSARAM' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
