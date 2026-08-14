// A LINHA DIGITAVEL, CONFERIDA. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/linha-digitavel.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. Ate 13/08/2026 o sistema imprimia
// `pagamento.linha_digitavel` sem conferir nada - 47 digitos ou 12, certo ou
// corrompido, sai igual no papel. O modo de falha nao e visivel: uma linha
// corrompida nao levanta erro, ela produz um boleto que o banco recusa no caixa
// ou, no caso pior, um que paga OUTRO titulo.
//
// A LINHA DE REFERENCIA E REAL. `75691.50043 01727.686907 00000.130013 1
// 15410000059669` esta escrita no prompt de extracao de
// `g3_fatura_unificada@36e964e` como o formato esperado de um boleto Sicoob, e
// as quatro verificacoes passam nela - o que so acontece por acaso com
// probabilidade de 1 em 10.000. Ela decodifica para banco 756, moeda 9, fator
// 1541 e R$ 596,69, e 1541 na era nova do fator e 17/08/2026. Tudo coerente com
// um boleto emitido nesta semana, o que e a evidencia de que e uma linha
// verdadeira e nao um exemplo inventado.
//
// ESTE MODULO CONTA E NOMEIA; QUEM RECUSA E O CHAMADOR - e desde 14/08 ele
// recusa. A `Q-DOCG3-13` fechou em (c): boleto que nao confere NAO tem documento
// composto (`BoletoNaoConfere`, 409, em `repos/documento.ts`). A separacao
// continua valendo e ficou mais importante: um modulo que recusasse por conta
// propria nao teria como servir a conferencia do operador, que precisa ver a
// divergencia para resolver.
//
// E A DECISAO OBRIGOU A CONSERTAR O FALSO. Ate 14/08 `src/sicoob/falso.ts`
// devolvia linha de formato inventado, e a verificacao L8g abaixo era a prova de
// que isso nao derrubava nada. Com a recusa, um falso assim obrigaria a uma
// EXCECAO para dado de teste dentro da regra - e excecao em regra de recusa e o
// buraco por onde a regra vaza. Hoje ele monta linha estruturalmente real
// (L9/L9c/L9d), e L8g virou o que sempre deveria ser: a prova de que uma linha
// fora do padrao, venha de onde vier, e nomeada em vez de aceita.

import {
  digitosDaLinha, modulo10, modulo11,
  conferirLinhaDigitavel, codigoDeBarrasDaLinha, linhaDigitavelFormatada,
  vencimentoDoFator, fatorDoVencimento, dadosDoCodigoDeBarras,
  montarLinhaDigitavel, conferirBoleto,
} from '../src/dominio/linha-digitavel.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

/** Sicoob, R$ 596,69, vencimento 17/08/2026. Impressa como sai no boleto. */
const IMPRESSA = '75691.50043 01727.686907 00000.130013 1 15410000059669';
const L = digitosDaLinha(IMPRESSA);
const BARRAS = '75691154100000596691500401727686900000013001';

// ------------------------------------------------------- L1 os quatro digitos
{
  chk('L1', L.length === 47, 'a linha impressa tem 47 digitos depois de tirar ponto e espaco');

  const c = conferirLinhaDigitavel(IMPRESSA);
  chk('L1b', c.valida && c.falhas.length === 0,
      'linha REAL de boleto Sicoob passa nas quatro verificacoes');

  chk('L1c', modulo10('756915004') === 3 && modulo10('0172768690') === 7 && modulo10('0000013001') === 3,
      'modulo 10 reproduz os tres DV de campo impressos na linha');

  const semDv = L.slice(0, 4) + L.slice(33, 47) + L.slice(4, 9) + L.slice(10, 20) + L.slice(21, 31);
  chk('L1d', semDv.length === 43 && modulo11(semDv) === 1,
      'modulo 11 sobre os 43 digitos reproduz o DV geral impresso');
}

// ------------------------------------------- L2 cada verificador pega o SEU erro
{
  // Trocar um digito DENTRO de um campo derruba o DV daquele campo. Trocar o
  // ULTIMO de um campo derruba os dois - o do campo e o geral -, entao os casos
  // abaixo mexem no meio de cada bloco.
  const troca = (i: number) => {
    const d = L.split('');
    d[i] = String((Number(d[i]) + 1) % 10);
    return d.join('');
  };

  chk('L2', conferirLinhaDigitavel(troca(3)).falhas.includes('campo 1'),
      'digito corrompido no campo 1 e nomeado como campo 1');
  chk('L2b', conferirLinhaDigitavel(troca(15)).falhas.includes('campo 2'),
      'digito corrompido no campo 2 e nomeado como campo 2');
  chk('L2c', conferirLinhaDigitavel(troca(25)).falhas.includes('campo 3'),
      'digito corrompido no campo 3 e nomeado como campo 3');

  /*
   * ATE ONDE OS VERIFICADORES ENXERGAM - exaustivo, e o resultado NAO e "pega
   * tudo". As 47 posicoes x 9 digitos alternativos dao 423 variantes de erro de
   * um digito. Medido:
   *
   *   posicoes  0..31   (campos 1, 2 e 3)   297 variantes, 0 passam
   *   posicoes 33..46   (fator + valor)     126 variantes, 26 PASSAM
   *
   * O motivo e a regra de colapso do modulo 11: resto 0, 10 ou 11 viram DV 1, e
   * o DV desta linha E 1 - varias somas diferentes chegam nele. Os campos 1 a 3
   * nao tem esse buraco porque sao protegidos DUAS vezes, pelo modulo 10 do
   * proprio campo e pelo modulo 11 geral.
   *
   * A CONSEQUENCIA E A RAZAO DE `conferirBoleto` COMPARAR VALOR: o campo que os
   * verificadores protegem pior e justamente o que carrega o dinheiro. Um erro
   * de um digito no valor tem ~1 chance em 5 de nao ser pego aqui. Quem fecha o
   * buraco e a comparacao com `fatura.valor_total_centavos` - ver L8c.
   */
  let variantes = 0, cegas = 0, cegasForaDoValor = 0, nomeErrado = 0;
  for (let i = 0; i < 47; i++) {
    for (let d = 0; d < 10; d++) {
      const c = String(d);
      if (c === L[i]) continue;
      variantes++;
      const r = conferirLinhaDigitavel(L.slice(0, i) + c + L.slice(i + 1));
      if (r.valida) { cegas++; if (i < 33) cegasForaDoValor++; continue; }
      // Um digito trocado no campo N nunca pode ser nomeado como campo M.
      const campo = i < 10 ? 'campo 1' : i < 21 ? 'campo 2' : i < 32 ? 'campo 3' : null;
      if (campo && !r.falhas.includes(campo as never)) nomeErrado++;
    }
  }
  chk('L2d', variantes === 423 && cegasForaDoValor === 0,
      'erro de 1 digito nos campos 1 a 3: 297 de 297 pegos, ZERO passa - dupla protecao');
  chk('L2e', cegas === 26,
      `erro de 1 digito no fator/valor: ${cegas} de 126 PASSAM pelo modulo 11 - o buraco e medido, nao suposto`);
  chk('L2f', nomeErrado === 0,
      'nenhum digito trocado e nomeado no campo errado - o nome da falha aponta onde procurar');

  // O defeito que a propria referencia consertou: o quarto grupo e um digito
  // isolado, e o modelo de visao o omitia quando pediam "so os digitos".
  const semQuarto = L.slice(0, 32) + L.slice(33);
  chk('L2g', conferirLinhaDigitavel(semQuarto).falhas[0] === 'comprimento'
          && semQuarto.length === 46,
      'linha SEM o digito isolado do quarto grupo cai no comprimento, e nao passa silenciosa');
}

// ---------------------------------------------------- L3 comprimento e sujeira
{
  chk('L3', conferirLinhaDigitavel('').falhas[0] === 'comprimento'
         && conferirLinhaDigitavel('').digitos === '',
      'linha vazia e comprimento invalido, nao erro');
  chk('L3b', !conferirLinhaDigitavel('123').valida, '3 digitos nao viram linha valida');
  chk('L3c', conferirLinhaDigitavel(IMPRESSA.replace(/ /g, '')).valida
          && conferirLinhaDigitavel(L).valida,
      'a conferencia nao depende da pontuacao - com pontos, sem pontos ou so digitos');
}

// ------------------------------------------------- L4 a remontagem dos 44
{
  chk('L4', codigoDeBarrasDaLinha(IMPRESSA) === BARRAS,
      'os 44 digitos remontados da linha batem com o codigo de barras esperado');
  chk('L4b', codigoDeBarrasDaLinha(IMPRESSA)!.length === 44, 'e sao 44, nao 43 nem 47');

  const d = L.split('');
  d[3] = String((Number(d[3]) + 1) % 10);
  chk('L4c', codigoDeBarrasDaLinha(d.join('')) === null,
      'LINHA CORROMPIDA NAO REMONTA: um codigo de barras plausivel e errado e pior que nenhum');

  chk('L4d', codigoDeBarrasDaLinha('') === null, 'linha vazia nao remonta');
}

// ------------------------------------------------- L5 o que o codigo de barras diz
{
  const b = dadosDoCodigoDeBarras(BARRAS)!;
  chk('L5', b.banco === '756' && b.moeda === '9', 'banco 756 (Sicoob) e moeda 9 (real)');
  chk('L5b', b.valor_centavos === 59669 && Number.isSafeInteger(b.valor_centavos),
      'o valor sai do codigo de barras em CENTAVOS INTEIROS - regra 1, sem passar por float');
  chk('L5c', b.fator === 1541 && b.vencimento === '2026-08-17',
      'fator 1541 na era nova (1000 = 22/02/2025) e 17/08/2026');
  chk('L5d', dadosDoCodigoDeBarras('123') === null, 'menos de 44 digitos nao decodifica');
}

// ---------------------------------------------------- L6 o fator de vencimento
{
  chk('L6', vencimentoDoFator(1000) === '2025-02-22',
      'o fator 1000 e o dia zero da era nova - 22/02/2025, quando o FEBRABAN reiniciou');
  chk('L6b', vencimentoDoFator(1001) === '2025-02-23' && vencimentoDoFator(1031) === '2025-03-25',
      'a contagem anda um dia por unidade, e atravessa mes');
  chk('L6c', vencimentoDoFator(0) === null, 'fator 0000 e "sem vencimento", nao 22/02/2022');
  // Fuso: se a aritmetica passasse por `new Date('AAAA-MM-DD')` local, um fuso
  // negativo devolveria o dia anterior. E o mesmo defeito que `dataBr` evita.
  chk('L6d', vencimentoDoFator(1365) === '2026-02-22',
      'um ano exato depois da base cai no mesmo dia - sem deslocamento de fuso');
}

// ------------------------------------------------------ L7 a formatacao impressa
{
  chk('L7', linhaDigitavelFormatada(L) === IMPRESSA,
      'os 47 digitos voltam EXATAMENTE ao formato impresso do boleto - ida e volta fecha');
  chk('L7b', linhaDigitavelFormatada('123') === null, 'linha curta nao ganha formatacao falsa');
}

// -------------------------------------------------- L8 a conferencia do boleto
{
  const ok = conferirBoleto({
    linha_digitavel: IMPRESSA, codigo_barras: BARRAS,
    valor_total_centavos: 59669, vencimento_iso: '2026-08-17',
  });
  chk('L8', ok.conferida && ok.divergencias.length === 0,
      'boleto coerente: linha valida, codigo de barras igual, valor e vencimento batem');

  const semBoleto = conferirBoleto({
    linha_digitavel: null, codigo_barras: null, valor_total_centavos: 59669, vencimento_iso: '2026-08-17',
  });
  chk('L8b', !semBoleto.conferida && semBoleto.divergencias.length === 0,
      'BOLETO NAO REGISTRADO NAO E DIVERGENCIA: "nao da para conferir" sai como conferida=false');

  const valor = conferirBoleto({
    linha_digitavel: IMPRESSA, codigo_barras: BARRAS,
    valor_total_centavos: 59700, vencimento_iso: '2026-08-17',
  });
  chk('L8c', valor.divergencias.length === 1
          && valor.divergencias[0].tipo === 'valor_discorda'
          && (valor.divergencias[0] as { no_boleto: number }).no_boleto === 59669,
      'BOLETO REGISTRADO COM VALOR DIFERENTE DA FATURA e hoje invisivel - passa a ser numero que nao bate');

  const venc = conferirBoleto({
    linha_digitavel: IMPRESSA, codigo_barras: BARRAS,
    valor_total_centavos: 59669, vencimento_iso: '2026-08-20',
  });
  chk('L8d', venc.divergencias.length === 1 && venc.divergencias[0].tipo === 'vencimento_discorda',
      'vencimento do codigo de barras discordando do da fatura e nomeado');

  const outro = conferirBoleto({
    linha_digitavel: IMPRESSA, codigo_barras: '7'.repeat(44),
    valor_total_centavos: 59669, vencimento_iso: '2026-08-17',
  });
  chk('L8e', outro.divergencias.some((d) => d.tipo === 'codigo_de_barras_discorda'),
      'O CODIGO DE BARRAS DO BANCO E A LINHA DO BANCO TEM DE SER A MESMA COISA - nada comparava os dois');

  const corrompida = conferirBoleto({
    linha_digitavel: L.slice(0, 3) + '0' + L.slice(4), codigo_barras: BARRAS,
    valor_total_centavos: 59669, vencimento_iso: '2026-08-17',
  });
  chk('L8f', corrompida.divergencias.length === 1 && corrompida.divergencias[0].tipo === 'linha_invalida',
      'linha invalida para a conferencia ali: comparar valor de um codigo remontado errado seria ruido');

  // O adaptador falso produz linha fora do padrao de proposito. A conferencia
  // tem de dizer isso sem derrubar nada.
  const falso = conferirBoleto({
    linha_digitavel: '1-3.0000059669', codigo_barras: '7560000059669',
    valor_total_centavos: 59669, vencimento_iso: '2026-08-17',
  });
  chk('L8g', falso.conferida && falso.divergencias[0].tipo === 'linha_invalida',
      'a linha do adaptador FALSO e nomeada invalida e nao lanca - a suite nao depende de boleto real');
}

// ------------------------------------- L9 montar e conferir fecham o circulo
{
  const m = montarLinhaDigitavel({
    vencimento_iso: '2026-08-17', valor_centavos: 59669, campoLivre: '1500401727686900000013001',
  });
  chk('L9', m.linha === L && m.codigo_barras === BARRAS,
      'montar com o campo livre da linha REAL reproduz a linha REAL, digito por digito');

  chk('L9b', fatorDoVencimento('2026-08-17') === 1541 && vencimentoDoFator(1541) === '2026-08-17',
      'fator e data sao inversos um do outro');

  /*
   * IDA E VOLTA SOBRE 500 CASOS SORTEADOS. Nao e enfeite: `montarLinhaDigitavel`
   * so serve se produzir linha que a conferencia aceite - e a partir de 14/08 a
   * conferencia RECUSA a emissao do documento. Um falso que gere linha invalida
   * derrubaria a suite inteira, e um que gere linha "quase valida" seria pior:
   * passaria hoje e quebraria no dia em que alguem apertasse a verificacao.
   */
  let ok = 0, ida = 0;
  for (let i = 0; i < 500; i++) {
    const dia = 1 + (i * 7) % 28;
    const mes = 1 + (i * 3) % 12;
    const iso = `2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const centavos = 1 + (i * 98765) % 9_999_999;
    const livre = String(1_000_000_000 + i * 7919).padStart(25, '3');
    const g = montarLinhaDigitavel({ vencimento_iso: iso, valor_centavos: centavos, campoLivre: livre });
    if (conferirLinhaDigitavel(g.linha).valida) ok++;
    const b = dadosDoCodigoDeBarras(codigoDeBarrasDaLinha(g.linha) ?? '');
    if (b && b.valor_centavos === centavos && b.vencimento === iso
        && codigoDeBarrasDaLinha(g.linha) === g.codigo_barras) ida++;
  }
  chk('L9c', ok === 500, `as 500 linhas montadas passam nas quatro verificacoes (${ok}/500)`);
  chk('L9d', ida === 500,
      `montar -> remontar -> decodificar devolve o MESMO valor e a MESMA data nos 500 (${ida}/500)`);
}

console.log();
if (falhas > 0) { console.log(`--- linha digitavel: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- linha digitavel: 34 verificacoes, 0 falhas');
