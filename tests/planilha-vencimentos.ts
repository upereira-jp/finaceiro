// A PLANILHA DE VENCIMENTOS. Pura, sem banco.
// Uso: node --experimental-strip-types tests/planilha-vencimentos.ts
//
// O MODO DE FALHA QUE ESTA SUITE PERSEGUE NAO E O DA PLANILHA DE TARIFAS, e a
// diferenca vale ser dita porque as duas se parecem por fora.
//
// La o risco e a ESCALA: "1.234" vale R$ 1.234,00 ou R$ 1,23, e as duas leituras
// produzem uma fatura plausivel. Aqui o numero vai de 1 a 31 e nao ha escala a
// errar. O que ha e:
//
//   (a) a pessoa entender "vencimento" como DATA e digitar "10/08/2026". Recusar
//       obrigaria a reeditar 39 linhas por uma divergencia de rotulo, entao e
//       ACEITO - e a suite prende que so o DIA e aproveitado, nunca o mes;
//   (b) o dia 29, 30 ou 31, que e VALIDO e nao e erro - mas cai no ultimo dia do
//       mes em fevereiro. A suite prende que ele passa E que sai marcado;
//   (c) celula vazia virando "dia 1". Ausente nao e zero.
//
// A TERCEIRA COISA QUE ELA PRENDE, e e a que liga esta planilha ao resto: o dia
// lido aqui tem de sobreviver a ida ao banco e a volta pelo `getUTCDate()` de
// `faturamento.ts`. O caso P8 fecha esse circuito sem banco, comparando o dia
// que entrou com o que `vencimentoDaFatura` produz - inclusive nos meses curtos.

import {
  lerPlanilhaDeVencimentos, lerDiaDoVencimento, dataQuePortaODia,
  MODELO_DE_VENCIMENTOS, type DiaDoMes,
} from '../src/dominio/planilha-vencimentos.ts';
import { vencimentoDaFatura } from '../src/dominio/faturamento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };

// ======================================================== D. a celula do dia

// ---------------------------------------------------- D1 as formas aceitas
{
  chk('D1a', lerDiaDoVencimento('10') === 10, 'o dia sozinho: "10" -> 10');
  chk('D1b', lerDiaDoVencimento('05') === 5, 'zero a esquerda: "05" -> 5 (o Excel guarda assim)');
  chk('D1c', lerDiaDoVencimento(' 7 ') === 7, 'espaco em volta nao atrapalha: " 7 " -> 7');
  chk('D1d', lerDiaDoVencimento('1') === 1 && lerDiaDoVencimento('31') === 31,
      'as duas pontas do intervalo passam: 1 e 31');
}

// ---------------------------------------------------- D2 a data completa
//
// Este bloco e a razao de o leitor aceitar data. A pessoa que digitou "10" pode
// VER "10/08/2026" na tela sem ter feito nada, se a coluna estiver formatada
// como data - e o arquivo sai assim do "salvar como CSV".
{
  chk('D2a', lerDiaDoVencimento('10/08/2026') === 10, 'data pt-BR: "10/08/2026" -> dia 10');
  chk('D2b', lerDiaDoVencimento('2026-08-25') === 25, 'data ISO: "2026-08-25" -> dia 25');
  chk('D2c', lerDiaDoVencimento('5/8/26') === 5, 'data curta sem zero a esquerda: "5/8/26" -> dia 5');

  /*
   * O QUE ESTA VERIFICACAO PRENDE, e ela e a mais importante do bloco: o MES da
   * celula NAO E LIDO. Se alguem um dia "melhorar" o leitor guardando a data
   * inteira, o vencimento passaria a ter mes proprio - e `faturamento.ts` monta
   * o mes a partir da COMPETENCIA. As duas datas abaixo tem meses diferentes e
   * o mesmo dia; se o mes importasse, elas dariam resultados diferentes.
   */
  chk('D2d', lerDiaDoVencimento('10/01/2026') === lerDiaDoVencimento('10/12/2030'),
      'o MES da celula e ignorado: 10/01/2026 e 10/12/2030 dao o mesmo dia');
}

// ---------------------------------------------------- D3 o que e recusado
{
  const vazio = lancou(() => lerDiaDoVencimento(''));
  chk('D3a', vazio !== null && /vazia/.test(vazio.message) && /nao e "dia 1"/.test(vazio.message),
      'celula vazia e ERRO nomeado, nao dia 1 - ausente nao e zero');

  chk('D3b', lancou(() => lerDiaDoVencimento('0')) !== null, 'dia 0 nao existe');
  chk('D3c', lancou(() => lerDiaDoVencimento('32')) !== null, 'dia 32 nao existe');
  chk('D3d', lancou(() => lerDiaDoVencimento('-5')) !== null, 'dia negativo e recusado');
  chk('D3e', lancou(() => lerDiaDoVencimento('1,5')) !== null, 'dia fracionario e recusado');
  chk('D3f', lancou(() => lerDiaDoVencimento('todo mes')) !== null, 'texto e recusado');

  const e = lancou(() => lerDiaDoVencimento('99'));
  chk('D3g', e !== null && /1 a 31/.test(e.message),
      'a recusa DIZ o intervalo, em vez de "valor invalido"');
}

// ================================================= P. a planilha inteira

// ---------------------------------------------------- P1 o caminho limpo
{
  const p = lerPlanilhaDeVencimentos('numero_uc;dia_vencimento\n000000000000001;10\n000000000000002;25\n');
  chk('P1a', p.linhas.length === 2 && p.erros.length === 0 && p.cabecalho,
      `2 linhas, 0 erros, cabecalho reconhecido (l=${p.linhas.length} e=${p.erros.length} cab=${p.cabecalho})`);
  chk('P1b', p.linhas[0]!.numero_uc === '000000000000001' && p.linhas[0]!.dia === 10,
      'a primeira linha carrega UC e dia');
  chk('P1c', p.linhas[0]!.linha === 2,
      'a numeracao conta o cabecalho: a primeira linha de DADO e a 2, como no Excel');
  chk('P1d', p.linhas[0]!.bruto === '10',
      'o texto original viaja junto, para o ensaio poder mostrar a interpretacao');
}

// ---------------------------------------------------- P2 sem cabecalho
{
  const p = lerPlanilhaDeVencimentos('000000000000001;10\n');
  chk('P2a', p.linhas.length === 1 && !p.cabecalho && p.linhas[0]!.linha === 1,
      'arquivo sem cabecalho: a linha 1 e dado');
}

// ---------------------------------------------------- P3 o cabecalho se reconhece pelo DADO
//
// Nao por texto ("uc", "dia"): o rotulo que a pessoa escolheu e desconhecido, e
// um detector por palavra falharia com "Unidade" ou "Vencimento (dia)".
{
  const p = lerPlanilhaDeVencimentos('Unidade Consumidora;Vencimento (dia do mes)\n000000000000001;10\n');
  chk('P3a', p.cabecalho && p.linhas.length === 1 && p.erros.length === 0,
      'cabecalho com rotulo qualquer e reconhecido pela segunda coluna nao ser dia');

  /*
   * E o outro lado, que e o que impede o detector de comer dado: uma linha
   * ILEGIVEL no MEIO do arquivo nao vira "cabecalho" e nao desaparece. Ela e
   * erro nomeado, porque o reconhecimento so roda na primeira linha util.
   */
  const q = lerPlanilhaDeVencimentos('000000000000001;10\n000000000000002;sei la\n');
  chk('P3b', q.linhas.length === 1 && q.erros.length === 1 && q.erros[0]!.linha === 2,
      `linha ilegivel no MEIO e erro na linha 2, nao "cabecalho" (e=${q.erros.length})`);
}

// ---------------------------------------------------- P4 colunas a mais sao ignoradas
{
  const p = lerPlanilhaDeVencimentos('000000000000001;10;FULANO DE TAL;0001;5.5000;ativa\n');
  chk('P4a', p.linhas.length === 1 && p.linhas[0]!.dia === 10,
      'o modelo sai com cliente/usina/rateio/status e o leitor usa so as duas primeiras');
}

// ---------------------------------------------------- P5 UC repetida
{
  const p = lerPlanilhaDeVencimentos('000000000000001;10\n000000000000001;25\n');
  chk('P5a', p.linhas.length === 1 && p.erros.length === 1 && /ja aparece na linha 1/.test(p.erros[0]!.motivo),
      'UC repetida e erro que APONTA a linha anterior - escolher uma das duas seria escolher em silencio');
}

// ---------------------------------------------------- P6 o BOM e a linha vazia
{
  const p = lerPlanilhaDeVencimentos('﻿000000000000001;10\n\n\n000000000000002;25\n');
  chk('P6a', p.linhas[0]!.numero_uc === '000000000000001',
      'o BOM do Excel sai da primeira UC - sem isso ela nao casa com UC nenhuma');
  chk('P6b', p.vazias === 3 && p.linhas.length === 2,
      `as vazias sao CONTADAS e nao ignoradas caladas (vazias=${p.vazias})`);
}

// ---------------------------------------------------- P7 o dia 29-31 passa E sai marcado
{
  const p = lerPlanilhaDeVencimentos('000000000000001;28\n000000000000002;29\n000000000000003;31\n');
  chk('P7a', p.erros.length === 0 && p.linhas.length === 3,
      'dia 29, 30 e 31 sao VALIDOS - a regra de mes curto e de vencimentoDaFatura, nao de recusa aqui');
  chk('P7b', p.linhas[0]!.mesCurtoAfeta === false
        && p.linhas[1]!.mesCurtoAfeta === true && p.linhas[2]!.mesCurtoAfeta === true,
      'e saem MARCADOS: 28 nao, 29 e 31 sim - o ensaio imprime a lista antes de gravar');
}

// ---------------------------------------------------- P8 o circuito fechado, sem banco
//
// A VERIFICACAO QUE LIGA ESTA PLANILHA AO FATURAMENTO. O dia lido aqui e gravado
// como `date` por `dataQuePortaODia`, e `faturamento.ts` o le de volta com
// `getUTCDate()`. Se as duas pontas discordassem, o vencimento sairia errado sem
// que nenhuma das duas metades parecesse errada.
//
// Nao ha tabela de datas esperadas: o que se afirma e a RELACAO - o dia que
// entrou e o dia que sai, exceto onde o mes e curto, e ali o que se afirma e que
// cai no ULTIMO dia, nunca no mes seguinte.
{
  let idaEVolta = true;
  for (let d = 1; d <= 31; d++) {
    if (dataQuePortaODia(d as DiaDoMes).getUTCDate() !== d) idaEVolta = false;
  }
  chk('P8a', idaEVolta, 'os 31 dias sobrevivem a ida a coluna `date` e a volta pelo getUTCDate()');

  // Competencia de janeiro -> vencimento em fevereiro, que e o mes curto de verdade.
  const jan2026 = new Date(Date.UTC(2026, 0, 1));
  const v31 = vencimentoDaFatura(jan2026, dataQuePortaODia(31 as DiaDoMes).getUTCDate());
  chk('P8b', v31.getUTCMonth() === 1 && v31.getUTCDate() === 28,
      `dia 31 em fevereiro de 2026 cai no dia 28, e NAO transborda para marco (veio ${v31.toISOString().slice(0, 10)})`);

  // 2028 e bissexto: o ultimo dia de fevereiro e 29, e a conta tem de acompanhar
  // sozinha em vez de carregar um 28 fixo.
  const jan2028 = new Date(Date.UTC(2028, 0, 1));
  const b31 = vencimentoDaFatura(jan2028, dataQuePortaODia(31 as DiaDoMes).getUTCDate());
  chk('P8c', b31.getUTCMonth() === 1 && b31.getUTCDate() === 29,
      `em ano bissexto o mesmo dia 31 cai no 29 - a conta deriva o ultimo dia, nao o fixa (veio ${b31.toISOString().slice(0, 10)})`);

  const v10 = vencimentoDaFatura(jan2026, dataQuePortaODia(10 as DiaDoMes).getUTCDate());
  chk('P8d', v10.getUTCMonth() === 1 && v10.getUTCDate() === 10,
      'dia que cabe no mes passa intacto: 10 em fevereiro e 10');

  /*
   * O PORTADOR E ARBITRARIO DE PROPOSITO, e esta verificacao existe para que
   * ninguem o leia como significativo. Janeiro de 2000 nao se confunde com
   * vencimento de verdade em tela nenhuma - "agosto de 2026" se confundiria.
   */
  const d = dataQuePortaODia(10 as DiaDoMes);
  chk('P8e', d.getUTCFullYear() === 2000 && d.getUTCMonth() === 0,
      'a data gravada e um PORTADOR do dia (jan/2000), nao um vencimento - so o dia e lido');
}

// ---------------------------------------------------- P9 linha sem separador
{
  const p = lerPlanilhaDeVencimentos('000000000000001\n');
  chk('P9a', p.erros.length === 1 && /";"/.test(p.erros[0]!.motivo),
      'linha sem ";" e erro que diz qual e o separador');
}

// ---------------------------------------------------- P10 o modelo e legivel por quem o le
//
// O modelo impresso pelo `--modelo` sem banco tem de passar pelo proprio leitor.
// Um modelo que o importador recusa e a pior instrucao possivel.
{
  const p = lerPlanilhaDeVencimentos(MODELO_DE_VENCIMENTOS);
  chk('P10a', p.erros.length === 0 && p.linhas.length === 2 && p.cabecalho,
      `o MODELO_DE_VENCIMENTOS passa pelo proprio leitor (l=${p.linhas.length} e=${p.erros.length})`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
