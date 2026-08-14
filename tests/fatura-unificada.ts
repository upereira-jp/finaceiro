// A CONTA DA FATURA UNIFICADA, portada da referencia. Pura, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/fatura-unificada.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e a primeira e a que da direito as outras:
//
//   1. QUE O PORTE E FIEL. A `U1` roda o algoritmo da referencia, em float, lado
//      a lado com o nosso, sobre 900 casos. A energia integral bate em 900/900 e
//      a energia com desconto fica dentro de um centavo em 900/900. Se
//      discordassem alem disso, o porte estaria ERRADO - nao mais exato, errado.
//   2. QUE A DIFERENCA DE UM CENTAVO ESTA DO LADO CERTO. A `U1c` mede o que a
//      escolha compra: as tres linhas impressas fecham em 900/900 aqui e em
//      671/900 na referencia. Ela desconta o produto nao arredondado e arredonda
//      cada linha para exibir; em 229 faturas o cliente le um centavo que nao
//      soma. E a `U2` cobre os percentuais abaixo de 1% medidos em 28/07.
//   3. QUE OS DOIS DEFEITOS DA REFERENCIA NAO FORAM PORTADOS. O `toNum` dela
//      devolve 29 para "0.029" (`U0d2`), e ela pede `outros_encargos` ao extrator
//      e nunca o le (`U4c`).
//   4. QUE NENHUMA GRANDEZA FISICA VIRE CENTAVO. Regra 1, segundo paragrafo.

import {
  paraDecimal, decimalParaTexto, multiplicarEmCentavos, textoParaCentavos,
  calcular, historicoPlausivel, CAMPOS_VAZIOS, PARAMETROS_PADRAO, DecimalInvalido,
  type CamposDaFaturaUnificada,
} from '../src/dominio/fatura-unificada.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

/** A fatura da referencia: 503 kWh compensados a R$ 1,185396, R$ 0,44 de repasse. */
const FATURA: CamposDaFaturaUnificada = {
  ...CAMPOS_VAZIOS,
  cliente: 'Maria da Conceição', documento: '52998224725',
  unidade_consumidora: '000406456101252', mes_referencia: '07/2026', vencimento: '17/08/2026',
  energia_compensada_kwh: '503.0', tarifa_kwh: '1.185396',
  consumo_nao_compensado_kwh: '30', consumo_nao_compensado_valor: '35.56',
  iluminacao_publica: '8.44', bandeira_tarifaria: 'Verde', bandeira_valor: '0',
  outros_encargos: '0', valor_total_equatorial: '44.00',
};

// ------------------------------------------- U0 o decimal, sem passar por float
{
  const d = (s: string | null) => paraDecimal(s);
  chk('U0', d('1.185396').valor === 1185396n && d('1.185396').escala === 6,
      'seis casas viram inteiro escalado, sem perder digito');
  chk('U0b', d('1.234,56').valor === 123456n && d('1.234,56').escala === 2,
      'com VIRGULA o ponto e milhar: "1.234,56" vale 1234,56');
  chk('U0c', d('1.234.567').valor === 1234567n && d('1.234.567').escala === 0,
      'sem virgula e casando o padrao de milhar, o ponto tambem e milhar');
  chk('U0d', decimalParaTexto(d('10250.500'), 1) === '10250.5',
      '"10250.500" vale 10.250,5 kWh e nao dez milhoes - um ponto so nunca e milhar');
  chk('U0d2', decimalParaTexto(d('0.029'), 3) === '0.029' && decimalParaTexto(d('0.005'), 3) === '0.005',
      'O DEFEITO DA REFERENCIA NAO FOI PORTADO: o `toNum` dela devolve 29 para "0.029" e 5 para "0.005" '
      + '(medido em 14/08) - um ponto seguido de tres digitos virava milhar, e o fator de CO2 saia mil vezes maior');
  chk('U0e', d('').valor === 0n && d(null).valor === 0n, 'vazio e nulo dao zero, sem lancar');
  chk('U0f', d('-12,34').valor === -1234n, 'negativo sobrevive ao parse');

  let lancou = false;
  try { paraDecimal('abc-.-'); } catch (e) { lancou = e instanceof DecimalInvalido; }
  chk('U0g', lancou, 'texto que nao e decimal LANCA com nome, em vez de virar NaN silencioso');

  chk('U0h', decimalParaTexto(d('1.185396'), 2) === '1.19' && decimalParaTexto(d('1.184'), 2) === '1.18',
      'arredonda meio para CIMA ao encurtar casas, e nao trunca');
  chk('U0i', decimalParaTexto(d('0.5'), 0) === '1' && decimalParaTexto(d('503.0'), 0) === '503',
      'zero casas tambem arredonda, e nao deixa ponto solto');
}

// ------------------------------------------------ U1 o PORTE E FIEL a referencia
{
  /*
   * O ALGORITMO DA REFERENCIA, copiado tal e qual - float e tudo. Ele so existe
   * aqui: e a testemunha contra a qual o nosso e comparado, e por isso nao pode
   * ser "uma versao melhorada" dele.
   */
  const toNum = (v: string) => {
    let s = String(v ?? '').trim().replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  const refCentavos = (kwh: string, tarifa: string, perc: string) => {
    const integral = toNum(kwh) * toNum(tarifa);
    const desconto = integral * (toNum(perc) / 100);
    return {
      integral: Math.round(integral * 100),
      desconto: Math.round(desconto * 100),
      energiaG3: Math.round((integral - desconto) * 100),
    };
  };

  const PERCENTUAIS = ['20', '15', '10', '25', '12.5', '20.5', '30', '5'];
  let casos = 0, integralIgual = 0, dentroDeUmCentavo = 0, nossoFecha = 0, refFecha = 0;
  for (let i = 0; i < 900; i++) {
    const kwh = `${100 + (i * 37) % 4000}.${(i * 7) % 10}`;
    const tarifa = `1.${String(100000 + (i * 8971) % 900000)}`;
    const perc = PERCENTUAIS[i % PERCENTUAIS.length];
    const nosso = calcular(
      { ...CAMPOS_VAZIOS, energia_compensada_kwh: kwh, tarifa_kwh: tarifa },
      { percentual_desconto: perc, fator_emissao: '0.029' },
    );
    const ref = refCentavos(kwh, tarifa, perc);
    casos++;
    if (nosso.integral_centavos === ref.integral) integralIgual++;
    if (Math.abs(nosso.energia_g3_centavos - ref.energiaG3) <= 1) dentroDeUmCentavo++;
    if (nosso.integral_centavos - nosso.desconto_centavos === nosso.energia_g3_centavos) nossoFecha++;
    if (ref.integral - ref.desconto === ref.energiaG3) refFecha++;
  }

  chk('U1', integralIgual === casos,
      `a energia integral bate com a referencia em ${integralIgual}/${casos} - o produto kWh x tarifa e o mesmo numero`);

  chk('U1b', dentroDeUmCentavo === casos,
      `e a energia com desconto fica dentro de UM centavo em ${dentroDeUmCentavo}/${casos}`);

  /*
   * A DIFERENCA DE ATE UM CENTAVO E DE ORDEM DE ARREDONDAMENTO, e a escolha aqui
   * nao e "mais exato por esporte" - e a unica que faz as tres linhas IMPRESSAS
   * fecharem.
   *
   * A referencia desconta o produto NAO arredondado e depois arredonda cada
   * linha para exibir. Nos arredondamos o produto para centavo UMA vez e
   * descontamos em inteiro.
   *
   * Medido nos mesmos 900 casos: a referencia imprime `integral - desconto !=
   * energia G3` em 229 deles. E um centavo que nao fecha na conta que o cliente
   * confere, em um quarto das faturas. O nosso fecha em 900 de 900, por
   * construcao - a subtracao e entre inteiros.
   */
  chk('U1c', nossoFecha === casos && refFecha < casos,
      `as tres linhas fecham em ${nossoFecha}/${casos} aqui e em ${refFecha}/${casos} na referencia - `
      + `${casos - refFecha} faturas em que ela imprime um centavo que nao soma`);
}

// ------------------------ U2 e onde a referencia ERRA, o inteiro fica do lado certo
{
  /*
   * A medicao de 28/07 registrada em `centavos.ts`: abaixo de 1% o produto em
   * float cai um ulp abaixo do .5 exato, `Math.round` desce, e falta um centavo
   * DO LADO DE QUEM RECEBE. `numeric(5,2)` aceita esses percentuais.
   */
  const casos: Array<[string, string, string, number]> = [
    // base R$ 110,00 a 0,35% -> exato 39 centavos, float 38
    ['110', '1', '0.35', 39],
    ['50', '1', '0.57', 29],
    ['250', '1', '0.29', 73],
  ];
  let certos = 0;
  for (const [kwh, tarifa, perc, esperado] of casos) {
    const c = calcular({ ...CAMPOS_VAZIOS, energia_compensada_kwh: kwh, tarifa_kwh: tarifa },
                       { percentual_desconto: perc, fator_emissao: '0.029' });
    if (c.desconto_centavos === esperado) certos++;
  }
  chk('U2', certos === casos.length,
      `nos tres percentuais abaixo de 1% medidos em 28/07 o desconto sai EXATO (${certos}/3) — em float faltaria um centavo em cada`);
}

// ---------------------------------------------------- U3 a conta da referencia
{
  const c = calcular(FATURA, PARAMETROS_PADRAO);
  // 503 x 1,185396 = 596,254188 -> 59625 centavos
  chk('U3', c.integral_centavos === 59625, `a energia integral da R$ 596,25 (${c.integral_centavos} centavos)`);
  chk('U3b', c.desconto_centavos === 11925 && c.energia_g3_centavos === 47700,
      'o desconto de 20% e a energia com desconto fecham em inteiro');
  chk('U3c', c.total_centavos === c.energia_g3_centavos + c.total_equatorial_centavos
          && c.total_centavos === 52100,
      `o total a pagar e energia G3 + repasses (${c.total_centavos} centavos)`);
  chk('U3d', c.sem_g3_centavos === c.integral_centavos + c.total_equatorial_centavos,
      'e "sem a G3" e a energia INTEGRAL mais os repasses - a mudanca que a referencia fez em 13/08');
  chk('U3e', c.tarifa_kwh === '1.185396' && c.tarifa_g3 === '0.948317',
      `a tarifa com desconto e derivacao de apresentacao, em seis casas (${c.tarifa_g3})`);
}

// ------------------------------------------------------- U4 o residuo, e o aviso
{
  const c = calcular(FATURA, PARAMETROS_PADRAO);
  chk('U4', c.demais_centavos === 4400 - 3556 - 844 - 0 && c.demais_centavos === 0,
      'o residuo fecha a quebra da Equatorial: total - nao compensado - iluminacao - bandeira');

  chk('U4b', c.residuo_discorda === false,
      'com `outros_encargos` em branco nao ha discordancia a acusar - branco e "nao achei", nao "achei zero"');

  const mentiu = calcular({ ...FATURA, outros_encargos: '12.00' }, PARAMETROS_PADRAO);
  chk('U4c', mentiu.residuo_discorda === true && mentiu.outros_encargos_lidos_centavos === 1200,
      'O QUE A REFERENCIA JOGA FORA: ela PEDE `outros_encargos` ao extrator e nunca o le. '
      + 'Aqui ele e comparado com o residuo, e a discordancia (R$ 12,00 x R$ 0,00) e nomeada');

  chk('U4d', mentiu.demais_centavos === c.demais_centavos && mentiu.total_centavos === c.total_centavos,
      'e a discordancia NAO muda a folha - ela avisa. Mudar o numero por causa dela seria inventar');
}

// ------------------------------------- U5 grandeza fisica NAO vira centavo
{
  const c = calcular(FATURA, PARAMETROS_PADRAO);
  chk('U5', c.co2_kg === '14.6' && typeof c.co2_kg === 'string',
      `CO2 e kg e sai como STRING decimal, nunca centavos (${c.co2_kg} kg)`);
  chk('U5b', c.consumo_do_mes_kwh === '533',
      `consumo do mes e compensado + nao compensado, em kWh (${c.consumo_do_mes_kwh})`);
  chk('U5c', typeof c.tarifa_kwh === 'string' && typeof c.percentual_desconto === 'string',
      'tarifa e percentual continuam string - virar centavo estragaria as seis casas');

  const zerado = calcular({ ...CAMPOS_VAZIOS }, PARAMETROS_PADRAO);
  chk('U5d', zerado.total_centavos === 0 && zerado.co2_kg === '0.0',
      'fatura em branco da zero em tudo, sem lancar - a tela abre vazia antes de qualquer leitura');
}

// ------------------------------------------------- U6 o historico inventado
{
  const serie = (...kwh: string[]) => kwh.map((k, i) => ({ mes: `M${i}`, kwh: k }));
  const real = serie('412', '388', '455', '401');
  chk('U6', historicoPlausivel(real), 'consumo que oscila e aceito');

  chk('U6b', !historicoPlausivel(serie('400', '400', '400')),
      'serie IDENTICA e recusada - o modelo de visao que nao achou a tabela repete valor');

  chk('U6c', !historicoPlausivel(serie('400', '410', '420')),
      'PROGRESSAO REGULAR e recusada - consumo real nao anda em passo constante');

  chk('U6d', !historicoPlausivel(serie('400', '450')),
      'menos de tres pontos nao da para julgar, e "nao da para julgar" e recusa');
}

// ------------------------------------------------ U7 multiplicacao e centavos
{
  chk('U7', multiplicarEmCentavos(paraDecimal('503.0'), paraDecimal('1.185396')) === 59625,
      'kWh x tarifa arredonda UMA vez, no fim, quando vira centavo');
  chk('U7b', multiplicarEmCentavos(paraDecimal('1'), paraDecimal('0.005')) === 1,
      'meio centavo sobe (0,005 -> 1 centavo), e nao some por truncamento');
  chk('U7c', textoParaCentavos('44,00') === 4400 && textoParaCentavos('44.00') === 4400,
      'virgula e ponto dao o mesmo centavo - o extrator devolve os dois');
  chk('U7d', Number.isSafeInteger(multiplicarEmCentavos(paraDecimal('99999.999'), paraDecimal('9.999999'))),
      'valor grande continua inteiro seguro depois da multiplicacao em BigInt');
}

console.log();
if (falhas > 0) { console.log(`--- fatura unificada: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- a conta da fatura unificada: 29 verificacoes, 0 falhas');
