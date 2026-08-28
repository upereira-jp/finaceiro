// Aritmetica de dinheiro. CLAUDE.md regra 1: Int em centavos, e float e proibido
// INCLUSIVE EM CALCULO INTERMEDIARIO.
//
// POR QUE ESTE ARQUIVO EXISTE. A conta do split e
//
//     valor = base_em_centavos x percentual / 100
//
// e ela e a unica do sistema que multiplica dinheiro por uma proporcao. A regra
// 1 ja basta - float e proibido, e o "inclusive em calculo intermediario" da
// regra e sobre exatamente esta linha. Mas vale registrar o que foi MEDIDO, em
// 28/07, porque o resultado nao e o que se espera:
//
//   Para os percentuais que o sistema usa hoje - 70, 65, 60, 50, 30, 25, 20 e
//   33,33 -, o caminho em `number` e o caminho exato CONCORDAM em toda a faixa
//   testada (base de 1 centavo a R$ 50.000,00, todas as bases). Zero
//   divergencias. O caminho ingenuo esta certo hoje, e esta certo por sorte.
//
//   A divergencia aparece em percentual ABAIXO DE 1%, e `numeric(5,2)` aceita
//   qualquer um deles:
//
//     base R$   110,00 a 0,35%  -> float 38 centavos,  exato 39   (38,49999999999999)
//     base R$    50,00 a 0,57%  -> float 28 centavos,  exato 29
//     base R$   250,00 a 0,29%  -> float 72 centavos,  exato 73
//
//   O produto cai um ulp abaixo do .5 exato, `Math.round` desce, e falta um
//   centavo. Ninguem percebe: a invariante do centavo continua fechando, porque
//   o liquido G3 absorve a diferenca. O beneficiario e que recebe a menos.
//
// Ou seja: a implementacao em float nao falharia em teste nenhum escrito com as
// taxas de hoje, e passaria a falhar no dia em que alguem declarasse uma taxa
// abaixo de 1% - sem erro, sem log, e do lado de quem recebe. E o modo de falha
// que este projeto persegue nas policies, dentro da funcao que calcula dinheiro.
//
// A saida e BigInt: inteiro exato, sem limite de 53 bits, sem representacao
// binaria de fracao. O percentual entra como STRING decimal - `numeric(5,2)` do
// Postgres chega como string no driver, e converter para `number` antes de
// multiplicar seria reintroduzir o float na porta de entrada.

/** Dinheiro. Sempre inteiro, sempre em centavos, em toda camada. */
export type Centavos = number;

export class ValorNaoInteiro extends TypeError {
  constructor(campo: string, v: unknown) {
    super(
      `${campo} deve ser inteiro em centavos, recebeu ${JSON.stringify(v)}. ` +
      'CLAUDE.md regra 1: dinheiro e Int em centavos em banco, API, UI, teste e fixture.'
    );
    this.name = 'ValorNaoInteiro';
  }
}

export function exigirCentavos(v: unknown, campo: string): Centavos {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new ValorNaoInteiro(campo, v);
  return v;
}

/**
 * Percentual decimal com ate duas casas -> centesimos de ponto percentual, em
 * BigInt. "70" -> 7000n, "70.5" -> 7050n, "0.01" -> 1n.
 *
 * Recusa `number` de proposito, e a mensagem diz por que: quem tiver um
 * percentual em `number` ja o obteve de um float em algum lugar, e o dano
 * aconteceu antes desta linha. O `numeric` do Postgres chega como string.
 */
export function percentualEmCentesimos(p: string, campo = 'percentual'): bigint {
  if (typeof p !== 'string') {
    throw new TypeError(
      `${campo} deve ser string decimal, nao number - numeric do Postgres chega como string, ` +
      'e converter para number antes de multiplicar reintroduz o float que a regra 1 proibe'
    );
  }
  const s = p.trim();
  const m = /^(-?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new TypeError(`${campo} deve ser decimal com ate 2 casas, recebeu ${JSON.stringify(p)}`);
  const [, sinal, inteira, decimal = ''] = m;
  const centesimos = BigInt(inteira) * 100n + BigInt(decimal.padEnd(2, '0'));
  return sinal === '-' ? -centesimos : centesimos;
}

/**
 * base x percentual / 100, em centavos inteiros, arredondando meia PARA CIMA.
 *
 * A conta em BigInt e `base * centesimos / 10000`, e o `+ 5000` antes da divisao
 * e o arredondamento: a divisao de BigInt trunca em direcao a zero, entao somar
 * metade do divisor a um numerador nao-negativo produz meia-para-cima. Bate com
 * `round()` do `numeric` do Postgres, que e meia-para-longe-do-zero, no dominio
 * em que esta funcao opera - base nunca e negativa, porque base negativa nao e
 * caso: nao se comissiona sobre valor negativo.
 *
 * Meia PARA CIMA e nao bancario porque o PRD 5.5 ja decidiu para onde vai a
 * diferenca - o liquido G3 - e um criterio de desempate que ora favorece e ora
 * desfavorece o beneficiario tornaria o residuo imprevisivel sem tornar o
 * resultado mais justo. Ver PAUTA-contador 8a.
 */
export function aplicarPercentual(base: Centavos, percentual: string, campo = 'percentual'): Centavos {
  exigirCentavos(base, 'base');
  if (base < 0) {
    throw new RangeError(`base negativa (${base}) nao e caso: nao se calcula percentual sobre valor negativo`);
  }
  const pct = percentualEmCentesimos(percentual, campo);
  if (pct < 0n) throw new RangeError(`${campo} negativo (${percentual}) nao e caso`);

  const bruto = BigInt(base) * pct;          // centavos x centesimos de ponto
  const valor = (bruto + 5000n) / 10000n;    // divide por 100 (pct) e por 100 (escala)
  return Number(valor);
}

/**
 * A fatia de `valor` que corresponde a `numerador/denominador`, em centavos
 * inteiros, meia para cima. Denominador zero devolve zero.
 *
 * Existe por uma palavra do PRD 5.3: "juros e multa entram na base
 * PROPORCIONALMENTE". A fatura tem duas partes - o consumo, sobre o qual se
 * repassa, e as tarifas da concessionaria, sobre as quais nao se repassa nada.
 * O juro e cobrado sobre o titulo inteiro. Jogar o juro todo na base do repasse
 * pagaria ao dono da usina uma fatia do juro que incidiu sobre a conta da
 * distribuidora; deixar o juro todo de fora tiraria dele a fatia que e sua. A
 * palavra "proporcionalmente" e o que resolve, e esta funcao e ela.
 */
export function proporcao(valor: Centavos, numerador: Centavos, denominador: Centavos): Centavos {
  exigirCentavos(valor, 'valor');
  exigirCentavos(numerador, 'numerador');
  exigirCentavos(denominador, 'denominador');
  if (denominador === 0) return 0;
  if (denominador < 0 || numerador < 0 || valor < 0) {
    throw new RangeError('proporcao() opera sobre valores nao-negativos');
  }
  const d = BigInt(denominador);
  return Number((BigInt(valor) * BigInt(numerador) * 2n + d) / (d * 2n));
}

/**
 * Soma de centavos que nao aceita nao-inteiro no meio. Existe para que
 * `soma([a, b, undefined as any])` falhe em vez de virar NaN e, tres passos
 * depois, virar NULL numa coluna de dinheiro.
 */
export function somar(valores: readonly Centavos[], campo = 'parcela'): Centavos {
  let total = 0;
  for (const [i, v] of valores.entries()) total += exigirCentavos(v, `${campo}[${i}]`);
  return total;
}

export class ReaisInvalidos extends TypeError {
  constructor(bruto: string, porque: string) {
    super(`"${bruto}" nao e um valor em reais: ${porque}. Use 1234,56 ou 1234.56.`);
    this.name = 'ReaisInvalidos';
  }
}

/**
 * "1.234,56" -> 123456. Sem passar por float em momento nenhum.
 *
 * IRMA DE `web/src/dinheiro.ts:paraCentavos`, E DE PROPOSITO IDENTICA NAS REGRAS.
 * As duas metades do repositorio tem tsconfig proprio e nao se importam (o alvo
 * la e o browser, aqui e Node), entao a funcao existe duas vezes - como `emReais`
 * ja existia. O que NAO pode divergir e a semantica: se "1.234" valesse mil
 * duzentos e trinta e quatro na tela e um real e vinte e tres centavos na
 * planilha, o mesmo numero significaria duas coisas no mesmo sistema, e a
 * diferenca so apareceria na fatura de alguem.
 *
 * A CONVERSAO E POR TEXTO, e o argumento para isso foi MEDIDO em 30/07 - nao
 * herdado. Varrendo centavo a centavo:
 *
 *   `Number(s) * 100` difere do inteiro em 131.256 de 1.000.000 de valores
 *   (0,07 -> 7.000000000000001; 19,99 -> 1998.9999999999998), e
 *   `Math.round(Number(s) * 100)` errou em 0 de 20.000.000, de R$ 0,01 a
 *   R$ 200.000,00.
 *
 * Ou seja: o caminho ingenuo com arredondamento esta CERTO na faixa inteira, e
 * esta certo por sorte - depende de o erro do float ficar sempre abaixo de meio
 * centavo, que e verdade aqui e nao e garantia que alguem escreveu. E o mesmo
 * achado que este arquivo ja registra sobre `aplicarPercentual`.
 *
 * Por texto o valor esta certo por CONSTRUCAO, e nao dentro de uma faixa medida.
 */
export function reaisParaCentavos(bruto: string): Centavos {
  const limpo = String(bruto).trim().replace(/\s/g, '');
  if (!limpo) throw new ReaisInvalidos(bruto, 'esta vazio');

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  // O ULTIMO ponto ou virgula e o separador decimal; os demais sao de milhar.
  const ultimo = Math.max(semSinal.lastIndexOf(','), semSinal.lastIndexOf('.'));
  const inteiraBruta = ultimo === -1 ? semSinal : semSinal.slice(0, ultimo);
  const decimalBruta = ultimo === -1 ? '' : semSinal.slice(ultimo + 1);

  const inteira = inteiraBruta.replace(/[.,]/g, '');
  // Tres digitos depois do separador, e nenhum separador antes: era de milhar.
  // "1.234" e mil duzentos e trinta e quatro, nao um real e 234 centavos.
  const ehMilhar = decimalBruta.length === 3 && ultimo !== -1 && !/[.,]/.test(inteiraBruta);
  const decimal = ehMilhar ? '' : decimalBruta;
  const inteiraFinal = ehMilhar ? inteira + decimalBruta : inteira;

  if (!/^\d*$/.test(inteiraFinal) || !/^\d*$/.test(decimal)) {
    throw new ReaisInvalidos(bruto, 'ha caractere que nao e digito nem separador');
  }
  if (inteiraFinal === '' && decimal === '') throw new ReaisInvalidos(bruto, 'nao ha digito nenhum');
  if (decimal.length > 2) throw new ReaisInvalidos(bruto, `${decimal.length} casas decimais - dinheiro tem 2`);

  const centavos = Number(`${inteiraFinal || '0'}${decimal.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(centavos)) throw new ReaisInvalidos(bruto, 'passa do inteiro seguro');
  return negativo ? -centavos : centavos;
}

/**
 * R$ 1.234,56 a partir de 123456. Para EXIBIR - nunca para calculo, e nunca de
 * volta para centavos por caminho nenhum.
 *
 * ESTA E A UNICA `emReais` DO SERVIDOR, e ate 14/08/2026 eram duas. A outra
 * morava em `layout-do-documento.ts` e era a que imprimia dinheiro no documento
 * que vai ao cliente - a copia, e a copia SEM validacao: ela aceitava `number`
 * cru onde esta exige `Centavos`.
 *
 * AS DUAS FORAM EXECUTADAS LADO A LADO ANTES DE COLAPSAR: 4.042 casos, incluindo
 * toda a fronteira do inteiro seguro e 4.000 sorteados. Saida identica em todos.
 * Nao havia divergencia a corrigir - havia uma superficie a menos para divergir
 * amanha.
 *
 * A QUE SOBREVIVEU E A "POR TEXTO", e a escolha nao e de gosto. A outra fazia
 * `Math.trunc(a / 100)`, e dividir dinheiro por 100 e passar por float: esta
 * exata para todo inteiro seguro - foi o que a medicao mostrou -, mas exata POR
 * MEDICAO e nao por construcao. A regra 1 diz "float e proibido, inclusive em
 * calculo intermediario"; recortar a string nao tem calculo nenhum.
 *
 * A terceira copia, `web/src/dinheiro.ts`, FICA e e justificada logo acima: o
 * browser nao importa de `src/`.
 */
export function emReais(c: Centavos): string {
  exigirCentavos(c, 'valor');
  const negativo = c < 0;
  const s = String(Math.abs(c)).padStart(3, '0');
  const inteiro = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${inteiro},${s.slice(-2)}`;
}

/**
 * 113000 -> "1130.00". A FRONTEIRA DE SAIDA do adaptador da Sicoob, e ela existe
 * porque a API recebe REAIS COM CASAS DECIMAIS onde todo o resto do sistema tem
 * `Int` em centavos (regra 1).
 *
 * POR TEXTO, e a razao e a mesma que `emReais` ja registra: `centavos / 100` e
 * float, e a regra 1 proibe float "inclusive em calculo intermediario". Aqui o
 * argumento e mais forte que na exibicao - este numero vai virar boleto, e um
 * centavo de diferenca entre o que o sistema cobra e o que o banco registra e
 * divergencia de conciliacao que ninguem consegue explicar depois.
 *
 * NAO E `emReais`. A outra formata para OLHO HUMANO - "R$ 1.234,56", com ponto de
 * milhar e virgula decimal. Esta formata para JSON, e a Sicoob espera o literal
 * numerico: ponto decimal, sem milhar, sem simbolo. Sao duas gramaticas, e usar
 * uma no lugar da outra manda "R$ 1.130,00" para um campo `number`.
 */
export function centavosParaReaisDecimal(c: Centavos): string {
  exigirCentavos(c, 'valor');
  const negativo = c < 0;
  const s = String(Math.abs(c)).padStart(3, '0');
  return `${negativo ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

export class DecimalInvalido extends TypeError {
  constructor(bruto: string, porque: string) {
    super(
      `"${bruto}" nao e um decimal de dinheiro da API: ${porque}. Esperado o literal ` +
      'numerico do JSON, como 156.23 ou 1130.00.'
    );
    this.name = 'DecimalInvalido';
  }
}

/**
 * "156.23" -> 15623. A FRONTEIRA DE ENTRADA, e ela recebe TEXTO de proposito.
 *
 * O QUE ELA NAO ACEITA E O PONTO DA COISA. A API devolve `"valor": 156.23` como
 * NUMERO JSON, e `JSON.parse` ja entrega float: medido aqui em 27/08/2026,
 * `0.07 * 100` da `7.000000000000001`. Quem chama esta funcao tem de pegar o
 * TEXTO do literal antes do parse - `JSON.parse(t, (k, v, ctx) => ctx.source)`,
 * disponivel no Node 22.20 - e nao o numero ja convertido. Por isso o parametro
 * e `string`: um tipo que aceitasse `number` faria o caminho errado compilar.
 *
 * E ELA NAO REUSA `reaisParaCentavos`, que existe ali em cima e parece servir.
 * Nao serve, e o modo de falha e silencioso: aquela funcao le a gramatica
 * BRASILEIRA, onde "1.234" e mil duzentos e trinta e quatro. No literal JSON,
 * `1.234` e um real e vinte e tres centavos e meio - valor que nem deveria
 * existir em dinheiro. A mesma string, dois significados, e a diferenca so
 * apareceria numa fatura de R$ 1.234,00 cobrada como R$ 1,23. Aqui a gramatica
 * e uma so, e o que fugir dela e recusado.
 */
export function reaisDecimalParaCentavos(bruto: string): Centavos {
  const t = String(bruto).trim();
  if (!t) throw new DecimalInvalido(bruto, 'esta vazio');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) {
    // Nomeia o caso mais provavel em vez de dizer so "invalido": notacao
    // cientifica e o que `JSON.stringify` produz para numero muito grande ou
    // muito pequeno, e tres casas e o que aparece quando alguem mandou
    // percentual para ca.
    const porque = /e/i.test(t) ? 'esta em notacao cientifica'
      : /\.\d{3,}/.test(t) ? 'tem mais de 2 casas decimais - dinheiro tem 2'
      : /,/.test(t) ? 'usa virgula decimal, e o literal JSON usa ponto'
      : 'ha caractere que nao e digito nem ponto decimal';
    throw new DecimalInvalido(bruto, porque);
  }
  const negativo = t.startsWith('-');
  const [inteira, decimal = ''] = (negativo ? t.slice(1) : t).split('.');
  const centavos = Number(`${inteira}${decimal.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(centavos)) throw new DecimalInvalido(bruto, 'passa do inteiro seguro');
  return negativo ? -centavos : centavos;
}
