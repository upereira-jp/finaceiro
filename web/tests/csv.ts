// A exportacao CSV. Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/csv.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. O CSV vai para o CONTADOR, e um arquivo que
// abre torto no Excel dele volta como "o sistema esta errado". Tres coisas
// quebram na pratica e nenhuma delas aparece olhando a tela:
//
//   - dinheiro convertido por divisao (regra 1 furada na SAIDA, que e onde
//     ninguem procura);
//   - texto livre com `;`, aspas ou quebra de linha estourando a coluna - e
//     `motivo_cancelamento` e `observacao` sao texto digitado por gente;
//   - acento sem BOM, que o Excel do Windows le como "ComptÃªncia".

import { reaisParaPlanilha, celula, paraCsv, nomeDoArquivo } from '../src/csv.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// -------------------------------------------- V1 dinheiro por texto, sem float
{
  chk('V1', reaisParaPlanilha(123456) === '1234,56',
      'centavos viram reais com virgula, sem simbolo e sem ponto de milhar');
  chk('V1b', reaisParaPlanilha(8) === '0,08' && reaisParaPlanilha(0) === '0,00',
      'valor menor que um real nao perde o zero: 8 centavos e "0,08"');
  chk('V1c', reaisParaPlanilha(-4550) === '-45,50',
      'negativo mantem o sinal fora da parte numerica');
  chk('V1d', reaisParaPlanilha(null) === '' && reaisParaPlanilha(undefined) === '',
      'nulo sai VAZIO, nao "0,00" - celula vazia e "nao ha", zero e um valor');
  // A verificacao que importa para a regra 1: um valor onde a divisao por 100
  // erra em float. 815 / 100 * 100 nao volta 815 em ponto flutuante.
  chk('V1e', reaisParaPlanilha(815) === '8,15' && reaisParaPlanilha(2299999) === '22999,99',
      'os valores onde `c / 100` sujaria o resultado saem exatos - a conversao e por STRING');
}

// ------------------------------------------------ V2 escape, os tres caracteres
{
  chk('V2', celula('Renata; sócia') === '"Renata; sócia"',
      'ponto e virgula no texto obriga a citar - senao a coluna estoura');
  chk('V2b', celula('disse "pago"') === '"disse ""pago"""',
      'aspas DOBRAM dentro do campo citado, como manda a RFC 4180');
  chk('V2c', celula('linha 1\nlinha 2') === '"linha 1\nlinha 2"',
      'quebra de linha dentro da celula e citada - e ela chega de observacao digitada');
  chk('V2d', celula('simples') === 'simples' && celula(null) === '' && celula(0) === '0',
      'texto simples nao e citado; nulo e vazio; e o ZERO sai como "0", nao como vazio');
}

// -------------------------------------------------------- V3 o arquivo montado
{
  type L = { nome: string; centavos: number };
  const linhas: L[] = [{ nome: 'Renata', centavos: 123456 }, { nome: 'Out; Sales', centavos: 8 }];
  const csv = paraCsv<L>([
    { titulo: 'Originador', de: (l) => l.nome },
    { titulo: 'Competência', de: () => '2026-07' },
    { titulo: 'Valor', de: (l) => reaisParaPlanilha(l.centavos) },
  ], linhas);

  chk('V3', csv.startsWith('﻿'),
      'comeca com BOM UTF-8 - sem ele o Excel do Windows estraga todo acento');
  chk('V3b', csv.split('\r\n')[0] === '﻿Originador;Competência;Valor',
      'cabecalho separado por `;`, que e o separador de lista do Excel pt-BR');
  chk('V3c', csv.includes('"Out; Sales";2026-07;0,08'),
      'a linha com `;` no nome sai citada e o valor de 8 centavos sai "0,08"');
  chk('V3d', csv.split('\r\n').filter(Boolean).length === 3,
      'uma linha de cabecalho e duas de dado, separadas por CRLF');
  chk('V3e', csv.endsWith('\r\n'),
      'termina com quebra de linha - arquivo sem ela some a ultima linha em alguns leitores');
}

// --------------------------------------------------------- V4 lista vazia
{
  const vazio = paraCsv<{ x: number }>([{ titulo: 'X', de: (l) => l.x }], []);
  chk('V4', vazio === '﻿X\r\n',
      'lista vazia gera arquivo com SO o cabecalho - baixar e receber nada e pior que receber cabecalho');
}

// --------------------------------------------------------- V5 nome do arquivo
{
  chk('V5', nomeDoArquivo('comissoes', '2026-07') === 'financeiro-comissoes-2026-07.csv'
         && nomeDoArquivo('carteira') === 'financeiro-carteira.csv',
      'nome previsivel e ordenavel, com e sem competencia');
}

console.log();
if (falhas > 0) { console.log(`--- csv: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- csv (exportacao): 16 verificacoes, 0 falhas');
