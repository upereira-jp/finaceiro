// A CONTA DA FATURA UNIFICADA. Funcao pura: entram os campos lidos da fatura da
// Equatorial e os parametros de emissao, sai a conta em CENTAVOS INTEIROS.
//
// DE ONDE ISTO VEM. O dono construiu a tela definitiva em
// `github.com/lealvbl-stack/g3_fatura_unificada` e pediu que ela substitua o
// processo inteiro da aba Documento. Este arquivo e a aritmetica dela, portada -
// mesmos campos, mesmas linhas, mesmos numeros na tela.
//
// ============================================================================
// O QUE **NAO** FOI PORTADO, E E A UNICA COISA QUE MUDA DE VERDADE
//
// A referencia calcula em FLOAT. `toNum()` e `parseFloat`, e `integral`,
// `desconto`, `demais` e `total` sao todos `number`:
//
//     const integral = kwh * tarifa;
//     const desconto = integral * (perc / 100);
//
// A regra 1 proibe isso - "float e proibido, INCLUSIVE em calculo intermediario"
// -, e aqui ela nao e formalismo: `centavos.ts` mediu que o caminho em float
// concorda com o exato para todos os percentuais que o sistema usa hoje e
// DIVERGE abaixo de 1%, tirando um centavo de quem recebe, sem erro e sem log.
//
// Entao o DESENHO e a SEQUENCIA sao os da referencia; a conta e refeita em
// inteiro. Os numeros que aparecem na tela sao os mesmos - o que muda e que
// continuam sendo os mesmos no dia em que alguem declarar 0,35%.
//
// ============================================================================
// GRANDEZA FISICA NAO VIRA CENTAVO, e a regra 1 diz isso no segundo paragrafo.
// `energia_compensada_kwh`, `tarifa_kwh`, o percentual e o fator de emissao
// mantem escala decimal e viajam como STRING. So dinheiro vira inteiro.

import { exigirCentavos, aplicarPercentual, type Centavos } from './centavos.ts';

/**
 * Os vinte e um campos que a leitura da fatura da Equatorial devolve.
 *
 * Todos como STRING, e de proposito: e assim que saem do extrator, e assim que
 * a pessoa os corrige na tela. Converter cedo perderia a diferenca entre "o
 * campo veio vazio" e "o campo veio zero" - que na fatura da distribuidora e a
 * diferenca entre uma linha que nao existe e uma que existe valendo nada.
 */
export type CamposDaFaturaUnificada = {
  cliente: string;
  documento: string;
  endereco: string;
  unidade_consumidora: string;
  classificacao: string;
  mes_referencia: string;
  data_emissao: string;
  leitura_anterior: string;
  leitura_atual: string;
  dias_faturados: string;
  vencimento: string;
  energia_compensada_kwh: string;
  tarifa_kwh: string;
  consumo_nao_compensado_kwh: string;
  consumo_nao_compensado_valor: string;
  iluminacao_publica: string;
  bandeira_tarifaria: string;
  bandeira_valor: string;
  outros_encargos: string;
  valor_total_equatorial: string;
  historico_consumo: Array<{ mes: string; kwh: string }>;
};

export const CAMPOS_VAZIOS: CamposDaFaturaUnificada = {
  cliente: '', documento: '', endereco: '', unidade_consumidora: '', classificacao: '',
  mes_referencia: '', data_emissao: '', leitura_anterior: '', leitura_atual: '', dias_faturados: '',
  vencimento: '', energia_compensada_kwh: '', tarifa_kwh: '', consumo_nao_compensado_kwh: '',
  consumo_nao_compensado_valor: '', iluminacao_publica: '', bandeira_tarifaria: '',
  bandeira_valor: '', outros_encargos: '', valor_total_equatorial: '', historico_consumo: [],
};

export type ParametrosDaEmissao = {
  /** Percentual de desconto sobre a energia compensada. Decimal em STRING. */
  percentual_desconto: string;
  /** kg de CO2 por kWh. Grandeza fisica: STRING, nunca centavos. */
  fator_emissao: string;
};

/** Os defaults da referencia: 20% e o fator medio do SIN (MCTI/SIRENE). */
export const PARAMETROS_PADRAO: ParametrosDaEmissao = {
  percentual_desconto: '20', fator_emissao: '0.029',
};

// ---------------------------------------------------------------- o decimal

/** Um decimal exato: `valor / 10^escala`. Sem float em lugar nenhum. */
export type Decimal = { valor: bigint; escala: number };

export class DecimalInvalido extends TypeError {
  constructor(campo: string, bruto: unknown) {
    super(
      `${campo} nao e um decimal reconhecivel: ${JSON.stringify(bruto)}. ` +
      'CLAUDE.md regra 1: grandeza decimal viaja como string e nunca passa por parseFloat.'
    );
    this.name = 'DecimalInvalido';
  }
}

/**
 * TEXTO -> DECIMAL EXATO, com a MESMA regra de separador da referencia.
 *
 * Ela vale a pena escrita por extenso, porque a ambiguidade e real e a escolha
 * dela e a certa:
 *
 *   ha VIRGULA          o ponto e separador de milhar. "1.234,56" -> 1234,56
 *   ha DOIS OU MAIS      o ponto tambem e milhar. "1.234.567" -> 1234567
 *   pontos, em grupos
 *   de tres
 *   nos demais casos     o ponto e decimal. "10250.500" -> 10250,5
 *
 * ======================================================================
 * AQUI ESTE PARSER SAI DA REGRA DA REFERENCIA, E SAI PORQUE ELA ERRA.
 *
 * O `toNum` dela trata UM ponto seguido de tres digitos como milhar, e o efeito
 * foi MEDIDO rodando o algoritmo dela em 14/08:
 *
 *     toNum("0.029")  ->  29        <- o fator de CO2, mil vezes maior
 *     toNum("0.005")  ->  5
 *     toNum("1.234")  ->  1234      <- uma tarifa vira mil e duzentos
 *
 * Na referencia isso fica latente porque o fator chega como `number` de prop e
 * nao passa pelo parser; basta a pessoa DIGITAR "0.029" no campo, com ponto, e
 * o CO2 impresso sai mil vezes maior. Com virgula funciona - e a diferenca entre
 * os dois nao aparece em lugar nenhum da tela.
 *
 * Exigir DOIS pontos desfaz o caso patologico e mantem o legitimo: "1.234.567"
 * continua milhar, "10250.500" continua decimal. O que muda de propositio e
 * "1.234", que aqui vale um-virgula-dois-tres-quatro - e num campo de tarifa
 * essa e a leitura certa.
 *
 * Vazio devolve ZERO com escala zero. Nao e o mesmo que ausente - quem precisa
 * distinguir olha a string antes de chamar.
 */
export function paraDecimal(bruto: string | number | null | undefined, campo = 'valor'): Decimal {
  if (bruto === null || bruto === undefined) return { valor: 0n, escala: 0 };
  let s = String(bruto).trim().replace(/[^\d,.\-]/g, '');
  if (!s) return { valor: 0n, escala: 0 };

  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // DOIS pontos ou mais. Ver o quadro acima: e aqui que este parser SAI da regra
  // da referencia, e sai porque ela erra.
  else if ((s.match(/\./g) ?? []).length >= 2 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }

  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) throw new DecimalInvalido(campo, bruto);
  const sinal = m[1] === '-' ? -1n : 1n;
  const inteira = m[2] || '0';
  const fracao = m[3] || '';
  return { valor: sinal * BigInt(inteira + fracao), escala: fracao.length };
}

/** Volta ao texto, com o numero de casas pedido. Arredonda meio para cima. */
export function decimalParaTexto(d: Decimal, casas: number): string {
  const neg = d.valor < 0n;
  let v = neg ? -d.valor : d.valor;
  if (casas > d.escala) v *= 10n ** BigInt(casas - d.escala);
  else if (casas < d.escala) {
    const div = 10n ** BigInt(d.escala - casas);
    v = (v + div / 2n) / div;
  }
  const s = v.toString().padStart(casas + 1, '0');
  const corte = s.length - casas;
  const txt = casas === 0 ? s : `${s.slice(0, corte)}.${s.slice(corte)}`;
  return (neg && v !== 0n ? '-' : '') + txt;
}

/**
 * DECIMAL x DECIMAL -> CENTAVOS INTEIROS, exato, arredondando meio para cima.
 *
 * E a conta que a referencia faz com `kwh * tarifa` em float. Aqui os dois
 * fatores sao inteiros escalados, o produto e inteiro, e o unico arredondamento
 * acontece UMA vez, no fim, quando o resultado vira centavo. Nao ha passo
 * intermediario em que uma fracao binaria possa aparecer.
 */
export function multiplicarEmCentavos(a: Decimal, b: Decimal): Centavos {
  const bruto = a.valor * b.valor;              // escala = a.escala + b.escala
  const escala = a.escala + b.escala;
  // x reais -> centavos e multiplicar por 100, entao o divisor cai duas casas.
  const div = escala >= 2 ? 10n ** BigInt(escala - 2) : 1n;
  const mult = escala >= 2 ? 1n : 10n ** BigInt(2 - escala);
  const neg = bruto < 0n;
  const abs = neg ? -bruto : bruto;
  const centavos = (abs * mult + div / 2n) / div;
  const n = Number(neg ? -centavos : centavos);
  return exigirCentavos(n, 'produto em centavos');
}

/** `reaisParaCentavos` aceitando a mesma pontuacao do extrator. */
export function textoParaCentavos(bruto: string, campo = 'valor'): Centavos {
  return multiplicarEmCentavos(paraDecimal(bruto, campo), { valor: 1n, escala: 0 });
}

// ------------------------------------------------------------------ a conta

export type ContaDaFatura = {
  /** kWh compensados, decimal em STRING. */
  compensada_kwh: string;
  /** Tarifa cheia, seis casas, STRING. */
  tarifa_kwh: string;
  /** Tarifa com o desconto aplicado. Derivacao de APRESENTACAO, nao dado. */
  tarifa_g3: string;
  percentual_desconto: string;

  /** `compensada x tarifa cheia`. O que a energia custaria sem a G3. */
  integral_centavos: Centavos;
  desconto_centavos: Centavos;
  /** `integral - desconto`. O que a G3 cobra pela energia. */
  energia_g3_centavos: Centavos;

  /** O que a Equatorial cobra, total, como veio da fatura dela. */
  total_equatorial_centavos: Centavos;
  nao_compensado_centavos: Centavos;
  iluminacao_publica_centavos: Centavos;
  bandeira_centavos: Centavos;
  /** RESIDUO: `total - nao compensado - iluminacao - bandeira`. Ver a nota. */
  demais_centavos: Centavos;
  /** O que o extrator LEU como "outros encargos", para conferir contra o residuo. */
  outros_encargos_lidos_centavos: Centavos;
  /** `true` quando os dois acima discordam - leitura incompleta, nomeada. */
  residuo_discorda: boolean;

  /** `energia G3 + total Equatorial`. E o valor do boleto. */
  total_centavos: Centavos;
  /** `integral + total Equatorial`. O que seria sem a G3. */
  sem_g3_centavos: Centavos;

  /** kg de CO2 evitado. Grandeza fisica, STRING. */
  co2_kg: string;
  /** Compensado + nao compensado, em kWh. STRING. */
  consumo_do_mes_kwh: string;
};

/**
 * A CONTA, na mesma sequencia da referencia e em centavos inteiros.
 *
 * =========================================================== SOBRE O RESIDUO
 *
 * `demais_centavos` e `total - nao compensado - iluminacao - bandeira`, que e
 * exatamente o que a referencia faz. Portado assim porque o pedido foi a tela
 * definitiva, e ela fecha a conta desse jeito.
 *
 * MAS O RESIDUO TEM UM MODO DE FALHA CONHECIDO, e este arquivo nao o esconde:
 * ele absorve em silencio todo erro de leitura das outras tres. Se o extrator
 * errar a bandeira, a diferenca reaparece como "demais encargos" e a folha
 * continua fechando.
 *
 * A referencia tem o antidoto e nao o usa: ela PEDE `outros_encargos` ao
 * extrator, guarda o campo e nunca o le. Aqui ele e lido e comparado - se o que
 * o extrator viu discordar do residuo, `residuo_discorda` fica `true` e quem
 * emite ve. A folha nao muda; o que muda e alguem saber.
 */
export function calcular(c: CamposDaFaturaUnificada, p: ParametrosDaEmissao): ContaDaFatura {
  const kwh = paraDecimal(c.energia_compensada_kwh, 'energia_compensada_kwh');
  const tarifa = paraDecimal(c.tarifa_kwh, 'tarifa_kwh');
  const fator = paraDecimal(p.fator_emissao, 'fator_emissao');
  const perc = paraDecimal(p.percentual_desconto, 'percentual_desconto');
  const percTxt = decimalParaTexto(perc, 2);

  const integral = multiplicarEmCentavos(kwh, tarifa);
  const desconto = aplicarPercentual(integral, percTxt, 'percentual_desconto');
  const energiaG3 = integral - desconto;

  const totalEq = textoParaCentavos(c.valor_total_equatorial, 'valor_total_equatorial');
  const ncomp = textoParaCentavos(c.consumo_nao_compensado_valor, 'consumo_nao_compensado_valor');
  const ip = textoParaCentavos(c.iluminacao_publica, 'iluminacao_publica');
  const band = textoParaCentavos(c.bandeira_valor, 'bandeira_valor');
  const demais = totalEq - ncomp - ip - band;
  const outrosLidos = textoParaCentavos(c.outros_encargos, 'outros_encargos');

  /* A tarifa com desconto: `tarifa x (100 - perc) / 100`, em seis casas.
   *
   * `restante` carrega a ESCALA VERDADEIRA dele - `perc.escala + 2`, porque o
   * "/100" e duas casas. A primeira versao punha `perc.escala` aqui e compensava
   * com um "+ 2" na linha de baixo: dava o mesmo numero e o objeto mentia sobre
   * si mesmo, que e como um decimal escalado passa a errar quando alguem o
   * reusa. */
  const restante = {
    valor: 100n * 10n ** BigInt(perc.escala) - perc.valor,
    escala: perc.escala + 2,
  };
  const tarifaG3 = {
    valor: tarifa.valor * restante.valor,
    escala: tarifa.escala + restante.escala,
  };

  const naoCompKwh = paraDecimal(c.consumo_nao_compensado_kwh, 'consumo_nao_compensado_kwh');
  const escalaConsumo = Math.max(kwh.escala, naoCompKwh.escala);
  const consumoMes = {
    valor: kwh.valor * 10n ** BigInt(escalaConsumo - kwh.escala)
         + naoCompKwh.valor * 10n ** BigInt(escalaConsumo - naoCompKwh.escala),
    escala: escalaConsumo,
  };

  return {
    compensada_kwh: decimalParaTexto(kwh, kwh.escala),
    tarifa_kwh: decimalParaTexto(tarifa, 6),
    tarifa_g3: decimalParaTexto(tarifaG3, 6),
    percentual_desconto: percTxt,

    integral_centavos: integral,
    desconto_centavos: desconto,
    energia_g3_centavos: energiaG3,

    total_equatorial_centavos: totalEq,
    nao_compensado_centavos: ncomp,
    iluminacao_publica_centavos: ip,
    bandeira_centavos: band,
    demais_centavos: demais,
    outros_encargos_lidos_centavos: outrosLidos,
    /* So acusa quando o extrator DISSE alguma coisa: `outros_encargos` zerado e
     * "nao achei", nao "achei zero", e cobrar coerencia de um campo em branco
     * transformaria toda fatura sem essa linha num alerta. */
    residuo_discorda: outrosLidos !== 0 && outrosLidos !== demais,

    total_centavos: energiaG3 + totalEq,
    sem_g3_centavos: integral + totalEq,

    co2_kg: decimalParaTexto({ valor: kwh.valor * fator.valor, escala: kwh.escala + fator.escala }, 1),
    consumo_do_mes_kwh: decimalParaTexto(consumoMes, 0),
  };
}

/**
 * O HISTORICO PARECE CONSUMO DE VERDADE?
 *
 * Portado da referencia, e o motivo dela vale inteiro aqui: um modelo de visao
 * que nao acha a tabela lateral INVENTA uma plausivel, e o grafico do cliente e
 * o pior lugar do sistema para descobrir isso. A serie inventada tem assinatura
 * - valores iguais, ou progressao regular demais.
 *
 * O criterio e o mesmo: tres pontos ou mais, algum valor diferente do outro, e
 * os PASSOS entre meses variando mais que 1 kWh.
 */
export function historicoPlausivel(historico: ReadonlyArray<{ kwh: string }>): boolean {
  if (historico.length < 3) return false;
  const v = historico.map((h) => paraDecimal(h.kwh, 'historico').valor);
  const max = v.reduce((a, b) => (b > a ? b : a));
  const min = v.reduce((a, b) => (b < a ? b : a));
  if (max === min) return false;
  const passos = v.slice(1).map((x, i) => x - v[i]);
  const pmax = passos.reduce((a, b) => (b > a ? b : a));
  const pmin = passos.reduce((a, b) => (b < a ? b : a));
  return pmax - pmin > 1n;
}
