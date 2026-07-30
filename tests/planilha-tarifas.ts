// A PLANILHA DE TARIFAS e a conversao reais -> centavos. Puro, sem banco.
// Uso: node --experimental-strip-types tests/planilha-tarifas.ts
//
// O MODO DE FALHA QUE ESTA SUITE PERSEGUE nao e o arquivo ilegivel - esse
// aparece. E o arquivo que le CERTO o numero ERRADO:
//
//     "1.234"   ->  R$ 1.234,00   ou   R$ 1,23 ?
//
// As duas leituras produzem uma fatura que parece certa, e a diferenca so
// aparece na conta de alguem. Por isso a metade dos casos aqui e sobre AMBIGUIDADE
// de separador, e nao sobre entrada invalida.
//
// A SEGUNDA COISA QUE ELA PRENDE e que a leitura do servidor e a da tela sao a
// MESMA leitura. `web/src/dinheiro.ts:paraCentavos` e `src/dominio/centavos.ts:
// reaisParaCentavos` existem separados porque as duas metades do repositorio tem
// tsconfig proprio - mas se "1.234" valesse coisas diferentes nas duas, o mesmo
// numero significaria duas coisas no mesmo sistema. O caso V4 abaixo e o que
// prende as duas juntas, comparando saida com saida em vez de com constante.

import { reaisParaCentavos, ReaisInvalidos, emReais } from '../src/dominio/centavos.ts';
import { paraCentavos as paraCentavosDoBrowser } from '../web/src/dinheiro.ts';
import { lerPlanilhaDeTarifas, MODELO_DE_PLANILHA } from '../src/dominio/planilha-tarifas.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };

// ================================================================ V. o valor

// ---------------------------------------------------- V1 o float, medido e nao suposto
{
  /*
   * A PRIMEIRA VERSAO DESTA VERIFICACAO ESTAVA ERRADA, e o registro fica porque
   * o erro e instrutivo. Ela usava os dois exemplos que o comentario de
   * `web/src/dinheiro.ts` trazia desde 29/07 - "1234,56 -> 123455.99999999999" e
   * "8,15 -> 814.9999999999999" - e NENHUM DOS DOIS reproduz: o primeiro da
   * 123456 exato, e o segundo nem e um numero (`Number('8,15')` e NaN, falta o
   * `.replace`). Eu tinha copiado a citacao em vez de medir.
   *
   * Entao aqui nao ha exemplo escolhido: a varredura e que fala. E o que ela diz
   * corrige a conclusao antiga - o caminho ingenuo com arredondamento acerta em
   * TODA a faixa, e esta certo por sorte, nao por construcao.
   */
  const ingenuo = (s: string) => Number(s.replace(',', '.')) * 100;
  let produtoNaoInteiro = 0;
  let roundErrou = 0;
  for (let c = 1; c <= 1_000_000; c++) {
    const s = `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;
    const p = ingenuo(s);
    if (!Number.isInteger(p)) produtoNaoInteiro++;
    if (Math.round(p) !== c) roundErrou++;
    if (reaisParaCentavos(s) !== c) roundErrou = -1;   // o nosso, se errar, marca
  }
  chk('V1a', produtoNaoInteiro > 100_000,
      `o produto \`Number(s) * 100\` NAO e inteiro em ${produtoNaoInteiro.toLocaleString('pt-BR')} de `
      + '1.000.000 de centavos - o float na porta de entrada e abundante, e nao um caso de borda');

  chk('V1b', roundErrou === 0,
      'e `Math.round` salva TODOS eles nesta faixa - a afirmacao honesta e a mesma que este projeto '
      + 'ja fez sobre o percentual: o caminho ingenuo esta certo hoje, e esta certo por SORTE. A '
      + 'leitura por texto esta certa por construcao, e por isso nao precisa desta varredura');

  chk('V1c', reaisParaCentavos('1234,56') === 123_456 && reaisParaCentavos('0,07') === 7,
      'e a leitura por TEXTO devolve o centavo sem multiplicar por 100 em ponto nenhum - inclusive '
      + 'no 0,07, que e o primeiro valor cujo produto em float nao e inteiro');
}

// ---------------------------------------------------- V2 a ambiguidade do ponto
{
  const casos: Array<[string, number, string]> = [
    ['1.234',      123400, 'tres digitos depois do ponto e sem separador antes: separador de MILHAR'],
    ['1.234,56',   123456, 'ponto de milhar e virgula decimal - o padrao brasileiro'],
    ['1,234.56',   123456, 'virgula de milhar e ponto decimal - o padrao ingles, e da o MESMO valor'],
    ['1234.5',     123450, 'uma casa decimal vira duas: quem escreve 1234,5 quer cinquenta centavos'],
    ['1234',       123400, 'sem separador nenhum sao reais inteiros'],
    ['0,07',            7, 'centavos sozinhos'],
  ];
  const todos = casos.every(([texto, esperado]) => reaisParaCentavos(texto) === esperado);
  chk('V2a', todos,
      'as seis formas de escrever dinheiro caem no valor certo - a que importa e "1.234", que le '
      + 'CERTO o numero ERRADO se o separador for confundido, e produz uma fatura plausivel');

  // O detalhe que separa "1.234" de "1.23": tres digitos depois do ponto.
  chk('V2b', reaisParaCentavos('1.234') === 123_400 && reaisParaCentavos('1.23') === 123,
      '"1.234" e mil duzentos e trinta e quatro reais e "1.23" e um real e vinte e tres centavos - '
      + 'a diferenca e a CONTAGEM de digitos depois do separador, e nao o separador');
}

// ---------------------------------------------------- V3 o que e recusado
{
  const ruins = ['', '   ', 'abc', 'R$ 10,00', '--5', '10,00 kWh'];
  const todosLevantam = ruins.every((s) => lancou(() => reaisParaCentavos(s)) instanceof ReaisInvalidos);
  chk('V3a', todosLevantam,
      'vazio, texto, cifrao, sinal duplo e unidade colada LEVANTAM com o motivo nomeado - '
      + '"R$ 10,00" e o caso real: o Excel formata a celula e a pessoa copia com o simbolo');

  /*
   * TRES CASAS DECIMAIS TEM DE SER "12,345" COM PONTO ANTES, e a primeira versao
   * desta verificacao errou aqui: "12,345" NAO e tres casas decimais, e doze mil
   * trezentos e quarenta e cinco - a virgula com tres digitos depois e separador
   * de MILHAR, que e a regra que "1.234" tambem usa. Descobri escrevendo o teste
   * errado, que e o unico jeito de descobrir que a regra tem duas leituras.
   */
  chk('V3b', reaisParaCentavos('12,345') === 1_234_500,
      '"12,345" e R$ 12.345,00 e nao "tres casas decimais" - virgula seguida de exatamente tres '
      + 'digitos, sem separador antes, e MILHAR. E a mesma regra de "1.234", e ela vale para os '
      + 'dois separadores');

  const e = lancou(() => reaisParaCentavos('1.234,567'));
  chk('V3c', e instanceof ReaisInvalidos && /3 casas decimais/.test(String(e.message)),
      'tres casas decimais DE VERDADE - "1.234,567", que ja tem separador de milhar antes - sao '
      + 'recusadas dizendo quantas casas vieram, em vez de "valor invalido": quem conserta a '
      + 'planilha precisa saber qual celula e por que');
}

// ---------------------------------------------------- V4 servidor e browser concordam
{
  /*
   * A VERIFICACAO CRUZADA, e ela e a razao de esta suite importar de `web/`. As
   * duas funcoes sao implementacoes separadas do mesmo contrato; comparar cada
   * uma com uma tabela minha provaria que cada uma bate com o que eu escrevi.
   * Comparar UMA COM A OUTRA prova que nao divergiram - que e o risco real.
   */
  const amostra = [
    '0,01', '0,10', '1', '1,5', '12,34', '1.234', '1.234,56', '1,234.56',
    '999999,99', '1000000', '0', '10.000,00', '7,07', '-25,50',
  ];
  const divergem = amostra.filter((s) => reaisParaCentavos(s) !== paraCentavosDoBrowser(s));
  chk('V4a', divergem.length === 0,
      `as ${amostra.length} formas dao o MESMO centavo no servidor e no browser - se divergissem, `
      + 'o valor digitado na tela e o mesmo valor vindo da planilha seriam faturas diferentes');

  const ruins = ['', 'abc', '1.234,567', 'R$ 9,90'];
  const ambosRecusam = ruins.every((s) =>
    lancou(() => reaisParaCentavos(s)) !== null && lancou(() => paraCentavosDoBrowser(s)) !== null);
  chk('V4b', ambosRecusam,
      'e recusam as mesmas entradas - concordar so no que aceita deixaria a planilha aceitar o que '
      + 'a tela recusa, e a diferenca apareceria como fatura sem explicacao');
}

// ---------------------------------------------------- V5 ida e volta
{
  const valores = [1, 7, 99, 100, 12_345, 123_400, 99_999_999];
  const voltam = valores.every((c) => reaisParaCentavos(emReais(c).replace('R$ ', '')) === c);
  chk('V5a', voltam,
      'centavos -> emReais -> reaisParaCentavos devolve o MESMO centavo, para toda a faixa testada - '
      + 'a formatacao de exibicao nao perde informacao, e isso importa porque e ela que aparece no '
      + 'ensaio para a pessoa conferir');
}

// ================================================================ P. a planilha

// ---------------------------------------------------- P1 o modelo se le
{
  const p = lerPlanilhaDeTarifas(MODELO_DE_PLANILHA);
  chk('P1a', p.erros.length === 0 && p.cabecalho === true && p.linhas.length === 2,
      'o proprio `--modelo` passa pelo leitor: 1 cabecalho, 2 linhas, 0 erros - um modelo que o '
      + 'leitor recusa e o primeiro erro que a pessoa encontra e o ultimo que alguem testa');
  chk('P1b', p.linhas[0]!.centavos === 12_345 && p.linhas[1]!.centavos === 198_720,
      'e os valores do modelo saem certos, inclusive o "1.987,20" com ponto de milhar');
}

// ---------------------------------------------------- P2 o cabecalho, e so ele
{
  const comCabecalho = lerPlanilhaDeTarifas('uc;valor\nA1;10,00\n');
  const semCabecalho = lerPlanilhaDeTarifas('A1;10,00\nA2;20,00\n');
  chk('P2a', comCabecalho.cabecalho === true && comCabecalho.linhas.length === 1
        && semCabecalho.cabecalho === false && semCabecalho.linhas.length === 2,
      'o cabecalho e reconhecido pela 2a coluna NAO ser dinheiro, e so na primeira linha util - '
      + 'reconhecer por texto ("uc","valor") falharia com o rotulo que a concessionaria usa, que '
      + 'ninguem sabe qual e');

  const meio = lerPlanilhaDeTarifas('A1;10,00\nA2;total\nA3;30,00\n');
  chk('P2b', meio.erros.length === 1 && meio.erros[0]!.linha === 2 && meio.linhas.length === 2,
      'linha ilegivel NO MEIO vira ERRO e nao "cabecalho" - reconhecer cabecalho em qualquer '
      + 'posicao faria uma linha de dado desaparecer sem sinal nenhum');
}

// ---------------------------------------------------- P3 a numeracao bate com o Excel
{
  const p = lerPlanilhaDeTarifas('uc;valor\nA1;10,00\nA2;xis\n');
  chk('P3a', p.erros.length === 1 && p.erros[0]!.linha === 3,
      'a linha do erro e a linha DO ARQUIVO (3), contando o cabecalho - numerar a partir dos dados '
      + 'faria "linha 2" apontar para a 3 na tela de quem abre o Excel');
}

// ---------------------------------------------------- P4 UC repetida nao se resolve sozinha
{
  const p = lerPlanilhaDeTarifas('A1;10,00\nA2;20,00\nA1;30,00\n');
  chk('P4a', p.erros.length === 1 && /repetida/.test(p.erros[0]!.motivo) && /linha 1/.test(p.erros[0]!.motivo),
      'UC repetida e ERRO que aponta a primeira ocorrencia - somar seria inventar um total que a '
      + 'distribuidora nao mandou, e escolher uma seria escolher em silencio');
}

// ---------------------------------------------------- P5 vazio e contado, nao ignorado
{
  const p = lerPlanilhaDeTarifas('A1;10,00\n\n\nA2;20,00\n\n');
  chk('P5a', p.linhas.length === 2 && p.vazias === 4 && p.erros.length === 0,
      'linha em branco nao e erro e nao e invisivel: e CONTADA (4, e a ultima e a que o \\n final '
      + 'produz) - um arquivo com 40 linhas e 2 '
      + 'uteis nao pode ter a mesma saida de um com 2 linhas');
}

// ---------------------------------------------------- P6 o separador errado se explica
{
  const p = lerPlanilhaDeTarifas('A1,10.00\nA2,20.00\n');
  chk('P6a', p.erros.length === 2 && /separador de CAMPO e ";"/.test(p.erros[0]!.motivo),
      'arquivo salvo com virgula como separador de campo e recusado COM A RAZAO - detectar o '
      + 'separador automaticamente obrigaria a escolher entre duas leituras validas, e escolher '
      + 'errado produz valor errado sem erro');
}

// ---------------------------------------------------- P7 o BOM do Excel
{
  const p = lerPlanilhaDeTarifas('﻿A1;10,00\n');
  chk('P7a', p.linhas.length === 1 && p.linhas[0]!.numero_uc === 'A1',
      'o BOM UTF-8 que o Excel escreve e removido - sem isso a PRIMEIRA UC viria com um caractere '
      + 'invisivel na frente, nao casaria com nenhuma fatura, e o erro nao aparece em editor nenhum');
}

// ---------------------------------------------------- P8 aspas e colunas a mais
{
  const p = lerPlanilhaDeTarifas('"A1";"1.234,56";"observacao da distribuidora"\n');
  chk('P8a', p.linhas.length === 1 && p.linhas[0]!.numero_uc === 'A1' && p.linhas[0]!.centavos === 123_456,
      'aspas sao removidas e as colunas ALEM das duas primeiras sao ignoradas - exigir exatamente '
      + 'duas faria a pessoa editar o arquivo da distribuidora antes de importar, que e onde erro '
      + 'de digitacao entra');
}

// ---------------------------------------------------- P9 negativo nao passa
{
  const p = lerPlanilhaDeTarifas('A1;-10,00\n');
  chk('P9a', p.erros.length === 1 && /negativo/.test(p.erros[0]!.motivo),
      'valor negativo e recusado - tarifa da concessionaria e cobranca, e credito teria de ser '
      + 'decidido antes de virar coluna de dinheiro');
}

// ---------------------------------------------------- P10 o bruto e preservado
{
  const p = lerPlanilhaDeTarifas('A1;1.234\n');
  chk('P10a', p.linhas[0]!.bruto === '1.234' && p.linhas[0]!.centavos === 123_400,
      'o TEXTO original fica na linha ao lado do centavo - e o que o ensaio imprime, e a unica '
      + 'forma de alguem pegar "1.234" lido como R$ 1,23 antes de a fatura sair');
}

console.log(`\n${falhas === 0 ? 'planilha de tarifas: todas as verificacoes passaram'
                              : `planilha de tarifas: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
