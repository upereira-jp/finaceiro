// A LEITURA da planilha de contratos, sem banco.
// Uso: node --experimental-strip-types tests/planilha-contratos.ts
//
// O QUE ESTA SUITE PERSEGUE, e nao e o mesmo das outras tres planilhas.
//
// Em tarifas o modo de falha e a ESCALA; em vencimentos, o dia curto; em
// documentos, a COLISAO que o banco recusaria no meio do lote. Aqui e outro, e
// ele nao produz erro em lugar nenhum depois de gravado:
//
//   ORIGINADOR   decide quem recebe 25% a 60% do consumo, todo mes. Vazio e
//                PIOR que errado - o split roda, fecha e nao monta o item, sem
//                erro e sem log. A R20-b congela no rascunhar e nao ha edicao
//   FECHAMENTO   decide `flag_fatura_cheia`, e portanto em que mes a comissao
//                COMECA. No futuro, torna TODA fatura parcial - e parcial nao
//                avanca o contador nem paga
//   CALENDARIO   "31/02/2026" casa com a expressao regular e nao existe.
//                `new Date` normaliza para 03/03 em silencio, e um mes adiante
//                e exatamente a unidade em que `ehFaturaCheia` decide
//
// E o quarto, que e o unico que as outras tres planilhas tem e esta corrigido
// aqui: a PRIMEIRA LINHA DE DADO ENGOLIDA COMO CABECALHO. Ver C2.
//
// E o circuito fechado, que e o que amarra os dois lados: o arquivo que o
// `--modelo` escreve tem de passar pelo leitor que o `--ensaio` usa.

import {
  lerPlanilhaDeContratos, lerDataDeFechamento, lerOrigemDoValor, fechamentoNoFuturo,
  montarModeloDeContratos, MODELO_DE_CONTRATOS, ehUuid,
  type LinhaDoModeloDeContrato,
} from '../src/dominio/planilha-contratos.ts';
import { ehFaturaCheia, competencia } from '../src/dominio/faturamento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const O1 = '7f1c6d2e-0000-4000-8000-000000000001';
const O2 = '7f1c6d2e-0000-4000-8000-000000000002';
const UC1 = '000018428801244';
const UC2 = '000407359701237';
const UC3 = '000091584701207';

const CAB = 'numero_uc;originador_id;data_fechamento;valor_referencia;origem\n';

// ==================================================== K1 o caminho inteiro
{
  const p = lerPlanilhaDeContratos(
    CAB
    + `${UC1};${O1};2026-06-05;1.130,00;crm_consumo_reais\n`
    + `${UC2};${O2};05/06/2026;565,00;local\n`
  );

  chk('K1a', p.erros.length === 0 && p.linhas.length === 2 && p.cabecalho,
      `duas linhas lidas e o cabecalho reconhecido (l=${p.linhas.length} e=${p.erros.length})`);
  chk('K1b', p.linhas[0]!.numero_uc === UC1 && p.linhas[0]!.originador_id === O1,
      'a UC continua na primeira coluna e o originador na segunda');
  chk('K1c', p.linhas[0]!.data_fechamento.toISOString() === '2026-06-05T00:00:00.000Z'
          && p.linhas[1]!.data_fechamento.toISOString() === '2026-06-05T00:00:00.000Z',
      'as duas notacoes de data chegam ao MESMO instante - "2026-06-05" e "05/06/2026"');
  chk('K1d', p.linhas[0]!.valor_referencia_centavos === 113000
          && p.linhas[1]!.valor_referencia_centavos === 56500,
      `o valor vira centavos INTEIROS por texto (${p.linhas[0]!.valor_referencia_centavos}, ${p.linhas[1]!.valor_referencia_centavos})`);
  chk('K1e', Number.isInteger(p.linhas[0]!.valor_referencia_centavos),
      'regra 1: o que vai para a coluna e Int, nao float - a coluna e `integer NOT NULL`');
  chk('K1f', p.linhas[0]!.valor_referencia_origem === 'crm_consumo_reais'
          && p.linhas[1]!.valor_referencia_origem === 'local',
      'as duas origens do enum do banco, lidas como estao');
  chk('K1g', p.linhas[0]!.bruto.valor === '1.130,00' && p.linhas[0]!.bruto.fechamento === '2026-06-05',
      'o texto original fica, para o ensaio imprimir a INTERPRETACAO ao lado do digitado');
  chk('K1h', p.linhas[0]!.linha === 2,
      `a linha e a do Excel, contando o cabecalho (linha=${p.linhas[0]!.linha})`);
}

// ==================================================== K2 a data de fechamento
{
  chk('K2a', lerDataDeFechamento('2026-06-05').toISOString() === '2026-06-05T00:00:00.000Z',
      'ISO vira meia-noite UTC daquele dia');
  chk('K2b', lerDataDeFechamento('5/6/2026').toISOString() === '2026-06-05T00:00:00.000Z',
      'dd/mm/aaaa sem zero a esquerda tambem - o Excel produz as duas');

  /*
   * O DIA SOZINHO E RECUSADO, e e a diferenca deliberada para lerDiaDoVencimento.
   * La "10" e a resposta certa; aqui o mes e o ano SAO o dado, porque e deles que
   * sai flag_fatura_cheia. Aceitar "5" obrigaria a inventar o mes.
   */
  let recusouDia = false;
  try { lerDataDeFechamento('5'); } catch { recusouDia = true; }
  chk('K2c', recusouDia,
      'o dia sozinho ("5") e RECUSADO - o mes e o ano sao o dado, e inventa-los decidiria a comissao');

  // O CALENDARIO, e nao a forma. `new Date(Date.UTC(2026,1,31))` da 03/03/2026.
  let recusou31de2 = false, mensagem = '';
  try { lerDataDeFechamento('31/02/2026'); } catch (e) { recusou31de2 = true; mensagem = (e as Error).message; }
  chk('K2d', recusou31de2,
      '"31/02/2026" casa com a expressao regular e NAO existe - recusado pela volta ao calendario');
  chk('K2e', recusou31de2 && mensagem.includes('2026-03-03'),
      `a mensagem DIZ para onde a data teria escorregado (${mensagem.slice(0, 60)}...)`);

  chk('K2f', lerDataDeFechamento('29/02/2024').toISOString() === '2024-02-29T00:00:00.000Z',
      '29/02 em ano BISSEXTO e valido - a conferencia e do calendario, nao "fevereiro tem 28"');
  let recusou29de2 = false;
  try { lerDataDeFechamento('29/02/2026'); } catch { recusou29de2 = true; }
  chk('K2g', recusou29de2, '29/02 em ano NAO bissexto e recusado');

  for (const ruim of ['', '  ', 'ontem', '2026-13-01', '2026-06-32', '06/2026', '2026/06/05']) {
    let recusou = false;
    try { lerDataDeFechamento(ruim); } catch { recusou = true; }
    chk('K2h', recusou, `"${ruim}" recusado como data de fechamento`);
  }
}

// ==================================================== K3 a regra que a data decide
{
  /*
   * O ELO COM O DINHEIRO, e por isso ele e testado AQUI e nao so em faturamento:
   * a celula que a pessoa digita decide `flag_fatura_cheia`, e um dia de
   * diferenca adia uma parcela inteira de comissao. Prender isto aqui e o que
   * torna a mensagem de erro do leitor uma afirmacao conferivel.
   */
  const c = competencia('2026-06-01');
  chk('K3a', ehFaturaCheia(lerDataDeFechamento('2026-06-01'), c),
      'fechado no dia 1: junho e fatura CHEIA');
  chk('K3b', !ehFaturaCheia(lerDataDeFechamento('2026-06-02'), c),
      'fechado no dia 2: junho e PARCIAL - um dia de diferenca adia a comissao um mes inteiro');
  chk('K3c', ehFaturaCheia(lerDataDeFechamento('2026-05-31'), c),
      'fechado no mes anterior: cheia');

  // E o futuro, que e o silencioso.
  const hoje = new Date(Date.UTC(2026, 7, 5));    // 05/08/2026
  chk('K3d', fechamentoNoFuturo(lerDataDeFechamento('2026-08-06'), hoje),
      'amanha e futuro');
  chk('K3e', !fechamentoNoFuturo(lerDataDeFechamento('2026-08-05'), hoje),
      'HOJE nao e futuro - a comparacao e por DIA, e nao pelo instante em que o script roda');
  chk('K3f', !fechamentoNoFuturo(lerDataDeFechamento('2026-08-04'), hoje),
      'ontem nao e futuro');
  chk('K3g', !ehFaturaCheia(lerDataDeFechamento('2026-09-01'), competencia('2026-08-01')),
      'e o efeito do futuro, medido: fechamento adiante torna a competencia PARCIAL - '
      + 'nao avanca o contador e nao paga comissao, sem erro e sem log');
}

// ==================================================== K4 o originador
{
  const semOrig = lerPlanilhaDeContratos(CAB + `${UC1};;2026-06-05;565,00;local\n`);
  chk('K4a', semOrig.linhas.length === 0 && semOrig.erros.length === 1,
      'originador VAZIO e recusa de linha - nao vira contrato sem comissao');
  chk('K4b', semOrig.erros[0]!.motivo.toLowerCase().includes('nao paga comissao'),
      'e a recusa DIZ o que aconteceria: o split roda, fecha e nao monta o item');

  const nomeNoLugar = lerPlanilhaDeContratos(CAB + `${UC1};Renata;2026-06-05;565,00;local\n`);
  chk('K4c', nomeNoLugar.linhas.length === 0 && nomeNoLugar.erros.length === 1,
      'NOME no lugar do uuid e recusa - nome nao e chave de pessoa neste projeto');
  chk('K4d', nomeNoLugar.erros[0]!.motivo.includes('npm run originadores'),
      'e a recusa aponta o comando que resolve, em vez de so reclamar');

  chk('K4e', ehUuid(O1) && !ehUuid('Renata') && !ehUuid(''),
      'a forma do uuid e so a forma - quem existe de verdade e o banco que diz');

  // Caixa alta no uuid: o Excel nao muda, mas quem cola de um log pode.
  const alto = lerPlanilhaDeContratos(CAB + `${UC1};${O1.toUpperCase()};2026-06-05;565,00;local\n`);
  chk('K4f', alto.linhas.length === 1 && alto.linhas[0]!.originador_id === O1,
      'uuid em caixa alta e aceito e normalizado para minuscula - e o mesmo id');
}

// ==================================================== K5 o valor e a origem
{
  const negativo = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;-100,00;local\n`);
  chk('K5a', negativo.linhas.length === 0 && negativo.erros.length === 1,
      'valor NEGATIVO e recusa - o banco aceitaria (a coluna e `integer` sem CHECK) e nada estouraria depois');

  // A escala, que e o modo de falha do importador de tarifas, vale aqui tambem.
  const milhar = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;1.234;local\n`);
  chk('K5b', milhar.linhas[0]!.valor_referencia_centavos === 123400,
      `"1.234" e mil duzentos e trinta e quatro reais, nao R$ 1,23 (${milhar.linhas[0]!.valor_referencia_centavos})`);

  const zero = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;0,00;local\n`);
  chk('K5c', zero.linhas.length === 1 && zero.linhas[0]!.valor_referencia_centavos === 0,
      'zero e valido - o valor de referencia nao entra na conta da fatura (a base e geracao x tarifa, R23)');

  chk('K5d', lerOrigemDoValor('CRM_Consumo_Reais') === 'crm_consumo_reais',
      'a origem e lida sem caixa - o Excel nao muda, mas quem digita muda');

  for (const ruim of ['', '  ', 'crm', 'planilha', 'sim']) {
    let recusou = false;
    try { lerOrigemDoValor(ruim); } catch { recusou = true; }
    chk('K5e', recusou, `"${ruim}" recusado como origem - sao duas, e nao ha default`);
  }

  const semOrigem = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;565,00;\n`);
  chk('K5f', semOrigem.linhas.length === 0 && semOrigem.erros.length === 1,
      'origem VAZIA e recusa: `local` nao se deduz de `crm_consumo_reais`');
}

// ==================================================== K6 a UC repetida (R14)
{
  const p = lerPlanilhaDeContratos(
    CAB
    + `${UC1};${O1};2026-06-05;565,00;local\n`
    + `${UC1};${O2};2026-07-01;789,00;local\n`
  );
  chk('K6a', p.linhas.length === 1 && p.erros.length === 1,
      'a UC repetida e recusa e a primeira linha SOBREVIVE - o arquivo nao e descartado inteiro');
  chk('K6b', p.erros[0]!.motivo.includes('linha 2') && p.erros[0]!.motivo.includes('R14'),
      'a recusa nomeia a OUTRA linha e a regra - as duas sao plausiveis e escolher seria escolher em silencio');
}

// ==================================================== C1/C2 o cabecalho
{
  const semCab = lerPlanilhaDeContratos(`${UC1};${O1};2026-06-05;565,00;local\n`);
  chk('C1a', !semCab.cabecalho && semCab.linhas.length === 1,
      'arquivo SEM cabecalho: a primeira linha e dado, e nada e engolido');

  /*
   * O DEFEITO QUE AS OUTRAS TRES PLANILHAS ACEITAM E ESTA NAO, e e o assunto
   * deste bloco. Nelas o cabecalho se reconhece por UMA coluna nao ser valida,
   * entao a primeira linha de dado com aquela celula errada SOME sem erro. Aqui
   * o cabecalho precisa falhar nas TRES colunas conferiveis.
   */
  const dataRuimNaPrimeira = lerPlanilhaDeContratos(`${UC1};${O1};31/02/2026;565,00;local\n`);
  chk('C2a', !dataRuimNaPrimeira.cabecalho && dataRuimNaPrimeira.erros.length === 1,
      'primeira linha com data INEXISTENTE nao vira "cabecalho" - vira ERRO NOMEADO, porque '
      + 'ela tem uuid de originador e valor em reais');
  chk('C2b', dataRuimNaPrimeira.erros[0]!.linha === 1,
      'e o erro aponta a linha 1, que e onde a pessoa vai olhar');

  const valorRuimNaPrimeira = lerPlanilhaDeContratos(`${UC1};${O1};2026-06-05;abc;local\n`);
  chk('C2c', !valorRuimNaPrimeira.cabecalho && valorRuimNaPrimeira.erros.length === 1,
      'primeira linha com valor ilegivel tambem vira erro, nao cabecalho');

  const cabDeVerdade = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;565,00;local\n`);
  chk('C2d', cabDeVerdade.cabecalho && cabDeVerdade.linhas.length === 1 && cabDeVerdade.erros.length === 0,
      'e o cabecalho de verdade - sem uuid, sem data e sem valor - continua sendo reconhecido');

  // Um cabecalho depois da primeira linha nao e cabecalho: e linha ruim, e acusa.
  const doisCabs = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;565,00;local\n` + CAB.trim() + '\n');
  chk('C2e', doisCabs.linhas.length === 1 && doisCabs.erros.length === 1,
      'cabecalho repetido no MEIO do arquivo vira erro nomeado - nenhuma linha desaparece em silencio');
}

// ==================================================== C3 a forma do arquivo
{
  const bom = lerPlanilhaDeContratos('﻿' + CAB + `${UC1};${O1};2026-06-05;565,00;local\n`);
  chk('C3a', bom.linhas.length === 1 && bom.linhas[0]!.numero_uc === UC1,
      'o BOM UTF-8 que o Excel escreve nao gruda na primeira UC');

  const crlf = lerPlanilhaDeContratos(CAB.replace('\n', '\r\n') + `${UC1};${O1};2026-06-05;565,00;local\r\n`);
  chk('C3b', crlf.linhas.length === 1 && crlf.linhas[0]!.numero_uc === UC1,
      'CRLF do Windows e lido igual');

  const extras = lerPlanilhaDeContratos(
    CAB + `${UC1};${O1};2026-06-05;565,00;local;sim;FULANO;0001;Renata\n`);
  chk('C3c', extras.linhas.length === 1 && extras.erros.length === 0,
      'colunas adicionais sao IGNORADAS - obrigar a apaga-las seria pedir uma edicao a mais '
      + 'justamente no arquivo que nao pode ter erro');

  const aspas = lerPlanilhaDeContratos(CAB + `"${UC1}";"${O1}";"2026-06-05";"565,00";"local"\n`);
  chk('C3d', aspas.linhas.length === 1 && aspas.linhas[0]!.valor_referencia_centavos === 56500,
      'celula entre aspas e desembrulhada, como nas outras tres planilhas');

  // "cab\n" + "linha\n" + "\n\n" -> tres celulas vazias no split, e nenhuma e erro.
  const vazias = lerPlanilhaDeContratos(CAB + `${UC1};${O1};2026-06-05;565,00;local\n\n\n`);
  chk('C3e', vazias.linhas.length === 1 && vazias.vazias === 3 && vazias.erros.length === 0,
      `linha vazia e contada e nao e erro - o Excel deixa uma no fim (vazias=${vazias.vazias})`);

  const semSep = lerPlanilhaDeContratos(CAB + 'so um texto sem ponto e virgula\n');
  chk('C3f', semSep.erros.length === 1 && semSep.erros[0]!.linha === 2,
      'linha sem ";" e erro com o numero da linha');

  const semUC = lerPlanilhaDeContratos(CAB + `;${O1};2026-06-05;565,00;local\n`);
  chk('C3g', semUC.linhas.length === 0 && semUC.erros.length === 1,
      'UC vazia e recusa - a chave nao pode faltar');
}

// ==================================================== M1-M3 o modelo
{
  const linha = (over: Partial<LinhaDoModeloDeContrato>): LinhaDoModeloDeContrato => ({
    numero_uc: UC1, originador_id: O1, data_fechamento: '2026-06-05',
    valor_referencia: '565,00', origem: 'crm_consumo_reais',
    cliente: 'FULANO DE TAL', usina: '0001',
    originador_crm: 'Renata', originador_cadastro: 'Renata Lucy',
    ja_contratada: false, fatura: true, ...over,
  });

  const csv = montarModeloDeContratos([
    linha({ numero_uc: UC1, ja_contratada: true,  fatura: true }),
    linha({ numero_uc: UC2, ja_contratada: false, fatura: false }),
    linha({ numero_uc: UC3, ja_contratada: false, fatura: true }),
  ]);
  const corpo = csv.split('\n').filter(Boolean).slice(1);

  chk('M1a', corpo[0]!.startsWith(UC3),
      'a ordem e: falta contrato E fatura primeiro - e o bloco em que se comeca a trabalhar');
  chk('M1b', corpo[1]!.startsWith(UC2),
      'depois quem falta e NAO fatura hoje - marcado, no meio');
  chk('M1c', corpo[2]!.startsWith(UC1),
      'e quem JA tem contrato desce para o fim - reimportar nao a duplica, e ela nao e trabalho');
  chk('M1d', corpo[1]!.includes(';NAO;'),
      'a marca `fatura` NAO fica visivel na linha, como no modelo de vencimentos');
  chk('M1e', csv.startsWith('﻿'),
      'BOM UTF-8 primeiro - sem ele o Excel pt-BR abre "GABRIELLA" com acento quebrado');

  const semNada = montarModeloDeContratos([
    linha({ originador_id: '', originador_crm: '', originador_cadastro: '' }),
  ]);
  chk('M2a', semNada.includes('(sem credito no CRM)') && semNada.includes('(nao cadastrado)'),
      'as duas ausencias sao NOMEADAS na planilha - celula vazia nao diz qual dos dois lados falta');

  /*
   * O CIRCUITO FECHADO. O arquivo que o `--modelo` escreve tem de passar pelo
   * leitor que o `--ensaio` usa - as outras tres planilhas prendem o mesmo, e
   * aqui vale dobrado porque sao cinco colunas em vez de duas.
   */
  {
    const pronto = montarModeloDeContratos([
      linha({ numero_uc: UC1 }), linha({ numero_uc: UC2, origem: 'local' }),
    ]);
    const p = lerPlanilhaDeContratos(pronto);
    chk('M3a', p.cabecalho && p.erros.length === 0 && p.linhas.length === 2,
        `o modelo PREENCHIDO passa inteiro pelo leitor (l=${p.linhas.length} e=${p.erros.length})`);
    chk('M3b', p.linhas[0]!.originador_id === O1 && p.linhas[0]!.valor_referencia_centavos === 56500
            && p.linhas[0]!.data_fechamento.toISOString().startsWith('2026-06-05'),
        'e as cinco colunas chegam com o mesmo valor que o modelo escreveu');

    // O modelo VAZIO de originador e recusado - e e o estado de hoje, com
    // `originador` em 0 linhas. A recusa e o comportamento certo.
    const semOrig = lerPlanilhaDeContratos(montarModeloDeContratos([linha({ originador_id: '' })]));
    chk('M3c', semOrig.linhas.length === 0 && semOrig.erros.length === 1,
        'o modelo gerado sem originador cadastrado e RECUSADO pelo proprio leitor, de proposito');

    const ex = lerPlanilhaDeContratos(MODELO_DE_CONTRATOS);
    chk('M3d', ex.cabecalho && ex.erros.length === 0 && ex.linhas.length === 2,
        `o MODELO_DE_CONTRATOS passa pelo proprio leitor (l=${ex.linhas.length} e=${ex.erros.length})`);
  }
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
