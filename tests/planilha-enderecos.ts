// A LEITURA da planilha de endereco do pagador, sem banco.
// Uso: node --experimental-strip-types tests/planilha-enderecos.ts
//
// O QUE ESTA SUITE PERSEGUE, e nao e o mesmo das outras quatro planilhas.
//
// Em tarifas o modo de falha e a ESCALA; em vencimentos, o dia curto; em
// documentos, a COLISAO; em contratos, a celula que muda quem recebe dinheiro.
// Aqui e o **preenchido que nao vale**, e ele e o unico insumo do projeto em que
// a celula errada nao tem consequencia nenhuma DESTE lado: nada valida, nada
// recusa, nada calcula. A recusa vem da Sicoob, traduzida em 502, num ponto onde
// a mensagem util ja se perdeu.
//
// Entao o que da para conferir aqui esta conferido aqui, e sao tres coisas:
//
//   UF        lista FECHADA de 27. "GOI" passa em qualquer verificacao de
//             tamanho e nao e UF nenhuma
//   CEP       oito digitos com ou sem mascara - e "00000000" RECUSADO, porque
//             ele e ausencia disfarcada de preenchimento: a celula vazia ao
//             menos aparece no relatorio
//   VAZIO     celula vazia e erro nos seis obrigatorios, nunca "sem endereco".
//             `complemento` e o unico opcional, e vira NULL e nao string vazia
//
// E o circuito fechado: o arquivo que o `--modelo` escreve tem de passar pelo
// leitor que o `--ensaio` usa - inclusive com o CEP saindo COM mascara do modelo
// e voltando SEM ela pelo leitor, que e a unica ida-e-volta assimetrica das
// cinco planilhas.

import {
  lerPlanilhaDeEnderecos, lerCep, lerUf, ehUf, cepComMascara,
  montarModeloDeEnderecos, MODELO_DE_ENDERECOS, UFS,
  type LinhaDoModeloDeEndereco,
} from '../src/dominio/planilha-enderecos.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const UC1 = '000018428801244';
const UC2 = '000407359701237';

const CAB = 'numero_uc;logradouro;numero;complemento;bairro;municipio;uf;cep\n';
const OK1 = `${UC1};Rua das Flores;120;Apto 302;Setor Bueno;Goiania;GO;74210-030\n`;
const OK2 = `${UC2};Avenida T-9;S/N;;Jardim America;Goiania;GO;74255220\n`;

// ==================================================== E1 o caminho inteiro
{
  const p = lerPlanilhaDeEnderecos(CAB + OK1 + OK2);

  chk('E1a', p.erros.length === 0 && p.linhas.length === 2 && p.cabecalho,
      `duas linhas lidas e o cabecalho reconhecido (l=${p.linhas.length} e=${p.erros.length})`);
  chk('E1b', p.linhas[0]!.cep === '74210030' && p.linhas[1]!.cep === '74255220',
      'a mascara do CEP sai - "74210-030" e "74255220" guardam os mesmos oito digitos');
  chk('E1c', p.linhas[0]!.bruto.cep === '74210-030',
      'e o texto original fica, para o ensaio mostrar a mascara ao lado do que sera gravado');
  chk('E1d', p.linhas[0]!.complemento === 'Apto 302' && p.linhas[1]!.complemento === null,
      'complemento vazio vira NULL, e nao string vazia - a coluna e nullable e "" seria um branco que EXISTE');
  chk('E1e', p.linhas[1]!.numero === 'S/N',
      '"S/N" e um numero de endereco legitimo e passa - muita UC nao tem numero');
  chk('E1f', p.linhas[0]!.uf === 'GO' && p.linhas[0]!.municipio === 'Goiania',
      'UF e municipio chegam como digitados, a UF em caixa alta');
  chk('E1g', p.linhas[0]!.linha === 2,
      `a linha e a do Excel, contando o cabecalho (linha=${p.linhas[0]!.linha})`);
}

// ==================================================== E2 a UF
{
  chk('E2a', UFS.length === 27, `a lista tem os 27 (${UFS.length})`);
  chk('E2b', new Set(UFS).size === 27, 'e nenhuma repetida');
  chk('E2c', ehUf('go') && ehUf(' SP ') && lerUf('go') === 'GO',
      'a UF e lida sem caixa e sem espaco - o Excel nao muda, quem digita muda');

  for (const ruim of ['GOI', 'Goias', 'XX', 'G', '', '  ', '12']) {
    let recusou = false;
    try { lerUf(ruim); } catch { recusou = true; }
    chk('E2d', recusou, `"${ruim}" recusado como UF - a lista FECHADA e o que separa isso de "duas letras"`);
  }

  const p = lerPlanilhaDeEnderecos(CAB + `${UC1};Rua X;1;;Centro;Goiania;GOI;74210-030\n`);
  chk('E2e', p.linhas.length === 0 && p.erros.length === 1 && p.erros[0]!.motivo.includes('GOI'),
      'e na planilha vira erro de linha, citando o que foi digitado');
}

// ==================================================== E3 o CEP
{
  chk('E3a', lerCep('74210-030') === '74210030' && lerCep('74210030') === '74210030',
      'com mascara e sem mascara sao o mesmo CEP');
  chk('E3b', lerCep(' 74.210-030 ') === '74210030',
      'ponto, traco e espaco saem - a mascara e apresentacao, nao dado');

  /*
   * "00000000" E O ASSUNTO DESTE BLOCO. Ele passa em qualquer verificacao de
   * tamanho, chega ao boleto e a recusa vem do outro lado. A celula vazia, por
   * contraste, aparece no relatorio de quem preencheu.
   */
  let recusouZeros = false, msg = '';
  try { lerCep('00000000'); } catch (e) { recusouZeros = true; msg = (e as Error).message; }
  chk('E3c', recusouZeros, '"00000000" e RECUSADO - e ausencia disfarcada de preenchimento');
  chk('E3d', recusouZeros && msg.includes('vazia'),
      'e a mensagem diz por que: a celula vazia ao menos aparece no relatorio');

  for (const ruim of ['', '  ', '7421003', '742100301', 'abcdefgh', '74210-03']) {
    let recusou = false;
    try { lerCep(ruim); } catch { recusou = true; }
    chk('E3e', recusou, `"${ruim}" recusado como CEP`);
  }

  chk('E3f', cepComMascara('74210030') === '74210-030',
      'a volta para mascara existe para relatorio e para o boleto impresso');
  chk('E3g', cepComMascara('abc') === 'abc',
      'e ela nao inventa mascara para o que nao e CEP - devolve como veio');
}

// ==================================================== E4 os obrigatorios
{
  const semBairro = lerPlanilhaDeEnderecos(CAB + `${UC1};Rua X;1;;;Goiania;GO;74210-030\n`);
  chk('E4a', semBairro.linhas.length === 0 && semBairro.erros.length === 1,
      'bairro vazio e recusa - celula vazia nao e "sem endereco", e arquivo pela metade');
  chk('E4b', semBairro.erros[0]!.motivo.includes('bairro'),
      'e a recusa NOMEIA o campo que falta');

  const semTres = lerPlanilhaDeEnderecos(CAB + `${UC1};;;;;Goiania;GO;74210-030\n`);
  chk('E4c', semTres.erros.length === 1
          && ['logradouro', 'numero', 'bairro'].every((c) => semTres.erros[0]!.motivo.includes(c)),
      'tres vazios saem numa recusa so, com os TRES nomes - uma por rodada faria tres rodadas');

  const semComplemento = lerPlanilhaDeEnderecos(CAB + `${UC1};Rua X;1;;Centro;Goiania;GO;74210-030\n`);
  chk('E4d', semComplemento.linhas.length === 1 && semComplemento.erros.length === 0,
      'complemento vazio NAO e erro - e o unico dos sete que e genuinamente opcional');

  const semUC = lerPlanilhaDeEnderecos(CAB + `;Rua X;1;;Centro;Goiania;GO;74210-030\n`);
  chk('E4e', semUC.linhas.length === 0 && semUC.erros.length === 1,
      'UC vazia e recusa - a chave nao pode faltar');
}

// ==================================================== E5 a UC repetida
{
  const p = lerPlanilhaDeEnderecos(CAB + OK1 + `${UC1};Outra Rua;9;;Outro;Goiania;GO;74000-000\n`);
  chk('E5a', p.linhas.length === 1 && p.erros.length === 1,
      'UC repetida e recusa e a primeira linha SOBREVIVE - o arquivo nao e descartado inteiro');
  chk('E5b', p.erros[0]!.motivo.includes('linha 2'),
      'e a recusa nomeia a OUTRA linha: os dois enderecos sao plausiveis e escolher seria escolher em silencio');
}

// ==================================================== C1/C2 o cabecalho
{
  const semCab = lerPlanilhaDeEnderecos(OK1);
  chk('C1a', !semCab.cabecalho && semCab.linhas.length === 1,
      'arquivo SEM cabecalho: a primeira linha e dado, e nada e engolido');

  /*
   * O DEFEITO QUE AS PLANILHAS ANTIGAS ACEITAM E ESTA NAO. O cabecalho precisa
   * falhar nas DUAS colunas conferiveis - UF e CEP. Uma linha de dado com o CEP
   * errado ainda tem UF valida, entao ela vira ERRO NOMEADO em vez de sumir.
   */
  const cepRuimNaPrimeira = lerPlanilhaDeEnderecos(`${UC1};Rua X;1;;Centro;Goiania;GO;7421\n`);
  chk('C2a', !cepRuimNaPrimeira.cabecalho && cepRuimNaPrimeira.erros.length === 1,
      'primeira linha com CEP invalido nao vira "cabecalho" - vira erro, porque a UF dela e valida');
  chk('C2b', cepRuimNaPrimeira.erros[0]!.linha === 1,
      'e o erro aponta a linha 1, que e onde a pessoa vai olhar');

  const ufRuimNaPrimeira = lerPlanilhaDeEnderecos(`${UC1};Rua X;1;;Centro;Goiania;GOI;74210-030\n`);
  chk('C2c', !ufRuimNaPrimeira.cabecalho && ufRuimNaPrimeira.erros.length === 1,
      'primeira linha com UF invalida tambem vira erro, porque o CEP dela e valido');

  const cabDeVerdade = lerPlanilhaDeEnderecos(CAB + OK1);
  chk('C2d', cabDeVerdade.cabecalho && cabDeVerdade.linhas.length === 1 && cabDeVerdade.erros.length === 0,
      'e o cabecalho de verdade - "uf" nao e UF e "cep" nao e CEP - continua sendo reconhecido');

  const doisCabs = lerPlanilhaDeEnderecos(CAB + OK1 + CAB.trim() + '\n');
  chk('C2e', doisCabs.linhas.length === 1 && doisCabs.erros.length === 1,
      'cabecalho repetido no MEIO vira erro nomeado - nenhuma linha desaparece em silencio');
}

// ==================================================== C3 a forma do arquivo
{
  const bom = lerPlanilhaDeEnderecos('﻿' + CAB + OK1);
  chk('C3a', bom.linhas.length === 1 && bom.linhas[0]!.numero_uc === UC1,
      'o BOM UTF-8 que o Excel escreve nao gruda na primeira UC');

  const crlf = lerPlanilhaDeEnderecos(CAB.replace('\n', '\r\n') + OK1.replace('\n', '\r\n'));
  chk('C3b', crlf.linhas.length === 1, 'CRLF do Windows e lido igual');

  const extras = lerPlanilhaDeEnderecos(CAB + OK1.replace('\n', ';sim;FULANO;0001\n'));
  chk('C3c', extras.linhas.length === 1 && extras.erros.length === 0,
      'colunas adicionais sao IGNORADAS - o modelo sai com `fatura`, `cliente` e `usina` no fim');

  const aspas = lerPlanilhaDeEnderecos(
    CAB + `${UC1};"Rua das Flores, 2";120;;"Setor Bueno";Goiania;GO;74210-030\n`);
  chk('C3d', aspas.linhas.length === 1 && aspas.linhas[0]!.logradouro === 'Rua das Flores, 2',
      'celula entre aspas e desembrulhada - e logradouro com virgula e comum');

  const vazias = lerPlanilhaDeEnderecos(CAB + OK1 + '\n\n');
  chk('C3e', vazias.linhas.length === 1 && vazias.vazias === 3 && vazias.erros.length === 0,
      `linha vazia e contada e nao e erro (vazias=${vazias.vazias})`);

  const semSep = lerPlanilhaDeEnderecos(CAB + 'texto sem ponto e virgula\n');
  chk('C3f', semSep.erros.length === 1 && semSep.erros[0]!.linha === 2,
      'linha sem ";" e erro com o numero da linha');
}

// ==================================================== M1-M3 o modelo
{
  const linha = (over: Partial<LinhaDoModeloDeEndereco>): LinhaDoModeloDeEndereco => ({
    numero_uc: UC1, logradouro: 'Rua das Flores', numero: '120', complemento: 'Apto 302',
    bairro: 'Setor Bueno', municipio: 'Goiania', uf: 'GO', cep: '74210-030',
    cliente: 'FULANO DE TAL', usina: '0001', fatura: true, completo: true, ...over,
  });

  const csv = montarModeloDeEnderecos([
    linha({ numero_uc: '000000000000001', completo: true,  fatura: true }),
    linha({ numero_uc: '000000000000002', completo: false, fatura: false }),
    linha({ numero_uc: '000000000000003', completo: false, fatura: true }),
  ]);
  const corpo = csv.split('\n').filter(Boolean).slice(1);

  chk('M1a', corpo[0]!.startsWith('000000000000003'),
      'a ordem e: incompleto E fatura primeiro - o bloco em que se comeca a trabalhar');
  chk('M1b', corpo[1]!.startsWith('000000000000002'),
      'depois incompleto que NAO fatura hoje - marcado, no meio');
  chk('M1c', corpo[2]!.startsWith('000000000000001'),
      'e quem ja esta completo desce para o fim - reimportar sai como `inalterado`');
  chk('M1d', csv.startsWith('﻿'),
      'BOM UTF-8 primeiro - sem ele o Excel pt-BR abre "GOIANIA" com acento quebrado');

  /*
   * O CIRCUITO FECHADO, e aqui ele e ASSIMETRICO: o modelo escreve o CEP COM
   * mascara (e como a pessoa o reconhece) e o leitor o devolve SEM. As outras
   * quatro planilhas nao tem essa volta, e por isso ela e prendida.
   */
  {
    const pronto = montarModeloDeEnderecos([linha({ numero_uc: UC1 }), linha({ numero_uc: UC2 })]);
    const p = lerPlanilhaDeEnderecos(pronto);
    chk('M3a', p.cabecalho && p.erros.length === 0 && p.linhas.length === 2,
        `o modelo PREENCHIDO passa inteiro pelo leitor (l=${p.linhas.length} e=${p.erros.length})`);
    chk('M3b', p.linhas[0]!.cep === '74210030',
        'e o CEP sai do modelo COM mascara e volta do leitor SEM ela - a ida-e-volta e assimetrica de proposito');
    chk('M3c', p.linhas[0]!.logradouro === 'Rua das Flores' && p.linhas[0]!.uf === 'GO',
        'as sete colunas de endereco chegam com o mesmo valor que o modelo escreveu');

    // O modelo de uma UC VAZIA e recusado - e e o estado de hoje, 29 de 29.
    const vazia = montarModeloDeEnderecos([linha({
      logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '',
      completo: false })]);
    const pv = lerPlanilhaDeEnderecos(vazia);
    chk('M3d', pv.linhas.length === 0 && pv.erros.length >= 1,
        'o modelo gerado sobre UC sem endereco e RECUSADO pelo proprio leitor - e o estado de hoje, 29 de 29');

    const ex = lerPlanilhaDeEnderecos(MODELO_DE_ENDERECOS);
    chk('M3e', ex.cabecalho && ex.erros.length === 0 && ex.linhas.length === 2,
        `o MODELO_DE_ENDERECOS passa pelo proprio leitor (l=${ex.linhas.length} e=${ex.erros.length})`);
  }
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
