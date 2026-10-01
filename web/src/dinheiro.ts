// DINHEIRO NO FRONT. A regra 1 do CLAUDE.md nao para na borda do servidor:
// "Int em centavos em TODA camada: banco, API, UI, teste, fixture".
//
// ============================================================================
// CORRIGIDO EM 30/07/2026. A versao anterior deste comentario citava dois
// exemplos que NAO REPRODUZEM, e ficam registrados porque o erro e o mesmo que a
// sessao 14 pegou numa citacao inventada do CRC:
//
//     "Number('1234,56'.replace(',','.')) * 100 -> 123455.99999999999"
//         mede-se 123456, EXATO.
//     "Number('8,15') * 100 -> 814.9999999999999"
//         `Number('8,15')` e NaN - falta o `.replace`. Com ele, da 815 exato.
//
// O FENOMENO E REAL, e maior do que os exemplos falsos sugeriam. Medido em
// 30/07, varrendo centavo a centavo:
//
//     o produto `Number(s) * 100` difere do inteiro em 131.256 de 1.000.000
//     de valores (13%). Os primeiros: 0,07 -> 7.000000000000001,
//     0,14 -> 14.000000000000002, 0,29 -> 28.999999999999996,
//     19,99 -> 1998.9999999999998, 1,10 -> 110.00000000000001.
//
// E O ARREDONDAMENTO SALVA TODOS ELES. Medido na mesma varredura:
//
//     Math.round(Number(s) * 100) errou em 0 de 20.000.000 de valores,
//     de R$ 0,01 a R$ 200.000,00.
//
// Entao a afirmacao honesta nao e "o caminho ingenuo erra" - e a mesma de
// `src/dominio/centavos.ts` sobre o percentual: **o caminho ingenuo esta certo
// hoje, e esta certo por sorte**. Ele depende de o erro do float ficar sempre
// abaixo de meio centavo, o que e verdade nesta faixa e nao e uma garantia que
// alguem escreveu.
//
// A conversao aqui e por TEXTO - separa inteiro de decimal e concatena -, entao
// nao ha multiplicacao por 100 e nao ha float em ponto nenhum do caminho. O
// valor esta certo por CONSTRUCAO, e nao dentro de uma faixa medida.
//
// A IRMA NO SERVIDOR e `src/dominio/centavos.ts:reaisParaCentavos`, com regras
// identicas de proposito. `tests/planilha-tarifas.ts` V4 compara as duas SAIDAS
// entre si, e nao cada uma com uma tabela: o risco real e elas divergirem.

/** Dinheiro. Sempre inteiro, sempre em centavos. */
export type Centavos = number;

export class ValorInvalido extends Error {
  constructor(bruto: string) {
    super(`"${bruto}" nao e um valor em reais. Use 1234,56 ou 1234.56.`);
    this.name = 'ValorInvalido';
  }
}

/**
 * "1.234,56" -> 123456. Sem passar por float em momento nenhum.
 *
 * Aceita ponto ou virgula como separador decimal, e ignora o separador de
 * milhar. Uma casa decimal vira duas ("12,5" -> 1250), porque quem digita 12,5
 * quer doze reais e cinquenta - nao doze reais e cinco centavos.
 */
export function paraCentavos(bruto: string): Centavos {
  const limpo = bruto.trim().replace(/\s/g, '');
  if (!limpo) throw new ValorInvalido(bruto);

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  // O ULTIMO ponto ou virgula e o separador decimal; os demais sao de milhar.
  // "1.234,56", "1,234.56" e "1234,56" caem todos no mesmo lugar.
  const ultimo = Math.max(semSinal.lastIndexOf(','), semSinal.lastIndexOf('.'));
  const inteiraBruta = ultimo === -1 ? semSinal : semSinal.slice(0, ultimo);
  const decimalBruta = ultimo === -1 ? '' : semSinal.slice(ultimo + 1);

  const inteira = inteiraBruta.replace(/[.,]/g, '');
  // Tres ou mais digitos depois do separador significa que ele era de milhar:
  // "1.234" e mil duzentos e trinta e quatro, nao um real e 234 centavos.
  const ehMilhar = decimalBruta.length === 3 && ultimo !== -1 && !/[.,]/.test(inteiraBruta);
  const decimal = ehMilhar ? '' : decimalBruta;
  const inteiraFinal = ehMilhar ? inteira + decimalBruta : inteira;

  if (!/^\d*$/.test(inteiraFinal) || !/^\d*$/.test(decimal)) throw new ValorInvalido(bruto);
  if (inteiraFinal === '' && decimal === '') throw new ValorInvalido(bruto);
  if (decimal.length > 2) throw new ValorInvalido(bruto);

  const centavos = Number(`${inteiraFinal || '0'}${decimal.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(centavos)) throw new ValorInvalido(bruto);
  return negativo ? -centavos : centavos;
}

/**
 * 123456 -> "R$ 1.234,56". So para exibir. Nunca volta para calculo.
 *
 * [01/10/2026, etapa 6] O ESPACO DEPOIS DO «R$» E O INSEPARAVEL (U+00A0): o
 * valor nunca quebra entre o simbolo e o numero. Medido a 390px: «Somam R$ /
 * 24.671,74» em Contas a pagar e «R$ / 14.416,65» na tabela de faixas de Contas
 * a receber — o simbolo no fim de uma linha e o numero no comeco da outra.
 * A largura e a mesma do espaco comum; so a quebra muda. A folha impressa nao
 * passa por aqui (ela formata pelo `src/dominio/centavos.ts`).
 */
export function emReais(c: Centavos | null | undefined): string {
  if (c == null) return '—';
  const negativo = c < 0;
  const a = Math.abs(c);
  const inteiro = Math.trunc(a / 100).toLocaleString('pt-BR');
  return `${negativo ? '-' : ''}R$\u00a0${inteiro},${String(a % 100).padStart(2, '0')}`;
}

/**
 * Grandeza decimal - percentual, kWh, tarifa - normalizada como STRING.
 *
 * A regra 1 manda mante-las em escala decimal e NUNCA converte-las para
 * centavos: sao grandeza fisica e proporcao, nao dinheiro. E os repositorios
 * recusam `number` de proposito, porque numeric do Postgres chega como string e
 * converter na entrada reintroduz o float que a regra proibe. Entao o front
 * tambem manda string, e a virgula do teclado brasileiro vira ponto aqui.
 */
export function decimalTexto(bruto: string, casas: number): string {
  const s = bruto.trim().replace(',', '.');
  if (!new RegExp(`^\\d{1,9}(\\.\\d{1,${casas}})?$`).test(s)) {
    throw new Error(`"${bruto}" deve ser decimal com ate ${casas} casas.`);
  }
  return s;
}

/**
 * A GRANDEZA DECIMAL NA TELA, em portugues: `"2545.00"` -> `"2.545,00"`.
 *
 * E O CAMINHO DE VOLTA DE `decimalTexto`, e pelo mesmo motivo POR TEXTO: o
 * `numeric` do Postgres chega como string, e `Number(v).toLocaleString()` poria
 * o float de volta na exibicao de um valor que a regra 1 manda manter decimal.
 * Aqui se separa inteiro de decimal, agrupa-se o milhar com ponto e troca-se o
 * separador — nenhum digito e recalculado.
 *
 * NASCEU EM 30/09/2026 na tela de Emissao e cobranca, onde o consumo saia
 * "2545.00" ao lado de "R$ 2.062,89" — dois sistemas de numero na mesma linha.
 * A etapa 4 do redesenho generaliza para as outras telas.
 *
 * O que nao for numero decimal volta como veio: um valor estranho na tela e
 * informacao, e um "NaN" no lugar dele seria a tela inventando.
 */
export function decimalEmBr(v: string | number | null | undefined): string {
  if (v == null || String(v).trim() === '') return '—';
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return s;
  const inteiro = m[2]!.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${m[1]}${inteiro}${m[3] ? `,${m[3]}` : ''}`;
}

/**
 * kWh NA TELA: como `decimalEmBr`, e SEM a casa decimal quando ela e toda zero
 * — `"2545.00"` -> `"2.545"`, `"2545.50"` -> `"2.545,50"`.
 *
 * A conta da distribuidora imprime kWh inteiro, e e com ela na mao que se
 * confere a coluna. O ",00" em vinte linhas era ruido que nao carregava nada; a
 * casa que carrega (",50") continua la.
 */
export function kwhEmBr(v: string | number | null | undefined): string {
  const t = decimalEmBr(v);
  return /,0+$/.test(t) ? t.replace(/,0+$/, '') : t;
}

/**
 * A GRANDEZA DECIMAL DENTRO DE UM CAMPO, para ser editada: `"9.7122"` ->
 * `"9,7122"`. Como `decimalEmBr`, mas SEM o ponto de milhar e sem travessão: o
 * campo volta para `decimalTexto` ao gravar, e `decimalTexto` aceita a vírgula
 * do teclado e recusa o separador de milhar. [30/09/2026, etapa 4b] Até aqui a
 * fatia e a tarifa de Unidades abriam com o ponto do banco ("9.7122",
 * "0.936986") ao lado de um exemplo com vírgula ("1,185396").
 */
export function decimalParaCampo(v: string | number | null | undefined): string {
  if (v == null || String(v).trim() === '') return '';
  const s = String(v).trim();
  return /^-?\d+\.\d+$/.test(s) ? s.replace('.', ',') : s;
}

/** O que sai de um campo decimal: o texto canonico para o servidor, ou a frase
 *  que diz o que esta errado. */
export type DecimalDoCampo = { ok: true; valor: string } | { ok: false; erro: string };

/**
 * O CAMINHO DE VOLTA DE `decimalParaCampo`: o que a pessoa digitou -> o texto
 * canonico da API (`"2.5"`, `"0.029"`, `"10"`), POR TEXTO e sem float.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE (01/10/2026, etapa 5 do redesenho)
 *
 * O modelo da fatura (Contas de luz, aba 3) mostrava desconto, fator, multa e
 * juros no formato do banco — «0.029», com ponto — numa tela que escreve todo
 * outro numero com virgula. A exibicao passou a ser `decimalParaCampo`; esta
 * funcao e a volta, e as duas juntas tem uma propriedade que os testes prendem
 * (F12 em `web/tests/formato.ts`): para todo valor que o servidor devolve,
 * `campoParaDecimal(decimalParaCampo(x))` e EXATAMENTE `x`. O valor que
 * ninguem tocou volta ao servidor letra por letra igual ao de antes.
 *
 * ACEITA VIRGULA OU PONTO, e o servidor (`paraDecimal`, em
 * `src/dominio/fatura-unificada.ts`) tambem aceitaria — mas os dois leem a
 * mesma coisa so quando o texto NAO E AMBIGUO, e a tela agora recusa o que e:
 *
 *   «1.234»       um ponto seguido de exatamente tres algarismos, com parte
 *                 inteira: e «um virgula dois tres quatro» ou «mil duzentos e
 *                 trinta e quatro»? O servidor le o primeiro; quem digitou
 *                 pode ter querido o segundo. «0.029» passa: com zero na
 *                 frente nao ha milhar possivel;
 *   «1.234,5»     ponto E virgula. Em portugues e milhar e decimal; em ingles
 *   «1,234.5»     e o contrario, e o servidor leria o segundo como 1,2345.
 *                 Percentual e fator nao tem milhar: um separador so;
 *   «2,5,1»       mais de um separador do mesmo tipo;
 *   «-2», «2a»    sinal e letra: multa negativa nao existe, e «vinte» nao e 2.
 *
 * NAO ADIVINHA: recusar com a frase e o caminho mais curto ate o numero certo,
 * e um palpite errado aqui e uma multa impressa errada em toda folha do mes.
 *
 * Vazio devolve vazio — o servidor le vazio como zero hoje, e isso nao muda
 * aqui. O «%» do fim e os espacos saem, como o servidor ja tirava.
 */
export function campoParaDecimal(texto: string): DecimalDoCampo {
  const digitado = texto.trim();
  const s = digitado.replace(/\s+/g, '').replace(/%$/, '');
  if (s === '') return { ok: true, valor: '' };
  if (s.startsWith('-')) return { ok: false, erro: `«${digitado}» é negativo. Use um número positivo, como 2,5.` };
  if (!/^[\d.,]+$/.test(s)) {
    return { ok: false, erro: `«${digitado}» não é um número. Escreva só os algarismos e a vírgula, como 2,5.` };
  }
  const virgulas = (s.match(/,/g) ?? []).length;
  const pontos = (s.match(/\./g) ?? []).length;
  if (virgulas > 0 && pontos > 0) {
    return { ok: false, erro: `«${digitado}» tem ponto e vírgula. Use um separador só — a vírgula, para os decimais: 2,5.` };
  }
  if (virgulas + pontos > 1) {
    return { ok: false, erro: `«${digitado}» tem mais de um separador. Use uma vírgula só, para os decimais: 2,5.` };
  }
  const m = /^(\d*)[.,]?(\d*)$/.exec(s)!;
  const inteira = m[1]!;
  const fracao = m[2]!;
  const separador = virgulas + pontos === 1;
  if (separador && inteira === '') return { ok: false, erro: `Falta o zero antes da vírgula: 0${s.replace('.', ',')}.` };
  if (separador && fracao === '') return { ok: false, erro: `Faltam os algarismos depois da vírgula em «${digitado}».` };
  if (pontos === 1 && fracao.length === 3 && /[1-9]/.test(inteira)) {
    return {
      ok: false,
      erro: `«${digitado}» pode ser ${inteira},${fracao} ou ${inteira}${fracao}. Escreva com vírgula `
        + `(${inteira},${fracao}) ou sem separador (${inteira}${fracao}).`,
    };
  }
  return { ok: true, valor: separador ? `${inteira}.${fracao}` : inteira };
}

/**
 * VARIOS CAMPOS DECIMAIS DE UMA VEZ — os dois parametros da conta aberta em
 * Contas de luz (desconto e fator de CO2). [01/10/2026, etapa 6]
 *
 * O MESMO RIGOR DO MODELO DA FATURA (etapa 5), aplicado a cada campo por
 * `campoParaDecimal`: aceita virgula ou ponto, recusa o ambiguo com a frase, e
 * devolve o texto canonico. So devolve `ok` quando TODOS passam — um parametro
 * recusado nao vai ao servidor junto com os outros, porque o servidor compoe a
 * fatura com os dois.
 *
 * O QUE MUDA NO QUE CHEGA AO SERVIDOR, provado contra o `calcular` do proprio
 * servidor em `web/tests/formato.ts` (F17): para todo texto que ele aceitava,
 * o canonico produz a MESMA conta, centavo por centavo. Os que ele lia como
 * outra coisa («1.234» virava 1,23%) a tela recusa antes.
 */
export function camposParaDecimais<K extends string>(campos: Readonly<Record<K, string>>):
  { ok: true; valor: Record<K, string> } | { ok: false; erros: Partial<Record<K, string>> } {
  const valor = {} as Record<K, string>;
  const erros: Partial<Record<K, string>> = {};
  let ok = true;
  for (const k of Object.keys(campos) as K[]) {
    const r = campoParaDecimal(String(campos[k] ?? ''));
    if (r.ok) valor[k] = r.valor;
    else { erros[k] = r.erro; ok = false; }
  }
  return ok ? { ok: true, valor } : { ok: false, erros };
}

/** A volta: o que o servidor manda («0.029», «20.00») como a pessoa le
 *  («0,029», «20,00»), campo a campo. */
export function decimaisParaCampos<K extends string>(valores: Readonly<Record<K, string>>): Record<K, string> {
  const r = {} as Record<K, string>;
  for (const k of Object.keys(valores) as K[]) r[k] = decimalParaCampo(valores[k]);
  return r;
}

/**
 * O DECIMAL DE UM CAMPO DE CADASTRO, com o limite de casas da coluna — a fatia
 * (4 casas) e a tarifa (6) de Unidades. [01/10/2026, etapa 6]
 *
 * E `campoParaDecimal` seguido de `decimalTexto`: o primeiro recusa o ambiguo
 * («1.185» e um virgula cento e oitenta e cinco, ou mil cento e oitenta e
 * cinco?), o segundo confere as casas. O TEXTO QUE SAI e, letra por letra, o
 * que `decimalTexto(texto, casas)` mandava sozinho ate hoje para tudo o que
 * ele aceitava e nao era ambiguo — F18 em `web/tests/formato.ts` prende isso.
 * A unica diferenca e a recusa: o que antes ia como «1.185» e virava R$ 1,185
 * em silencio, agora volta com a frase.
 */
export function decimalDoCadastro(texto: string, casas: number): DecimalDoCampo {
  const r = campoParaDecimal(texto);
  if (!r.ok) return r;
  if (r.valor === '') return { ok: true, valor: '' };
  try {
    return { ok: true, valor: decimalTexto(r.valor, casas) };
  } catch {
    return { ok: false, erro: `«${texto.trim()}» tem mais de ${casas} casas depois da vírgula.` };
  }
}

/**
 * CENTAVOS DENTRO DE UM CAMPO: `12345` -> `"123,45"`, `8` -> `"0,08"`. Por
 * TEXTO, sem dividir por 100 — a regra 1 vale também para o valor que a tela
 * põe no campo. [30/09/2026, etapa 4b] A tarifa da distribuidora em Cobranças
 * abria com `(c / 100).toFixed(2)`, o float que a regra proíbe.
 */
export function centavosParaCampo(c: Centavos | null | undefined): string {
  if (c == null) return '';
  const negativo = c < 0;
  const s = String(Math.abs(Math.trunc(c))).padStart(3, '0');
  return `${negativo ? '-' : ''}${s.slice(0, -2)},${s.slice(-2)}`;
}

/** Percentual na tela: `"9.7122"` -> `"9,7122%"`. A escala do banco fica — a
 *  fatia tem quatro casas porque o rateio tem, e arredondar na tela mostraria
 *  uma fatia que não é a gravada. */
export const percentualEmBr = (v: string | number | null | undefined): string => {
  const t = decimalEmBr(v);
  return t === '—' ? t : `${t}%`;
};

/** Data ISO (AAAA-MM-DD) a partir do <input type="date">, ou null. */
export const dataOuNull = (v: string): string | null => (v.trim() ? v.trim() : null);

/** "2026-07" -> "2026-07-01". A competencia e o MES, e o primeiro dia o
 *  representa - o servidor recusa qualquer outro dia. */
export const competenciaISO = (mes: string): string => (/^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : mes);

/**
 * O MÊS PEDIDO PELO ENDEREÇO: `?mes=2026-08` -> `2026-08`, e `null` para tudo o
 * mais. Entrou em 22/09/2026 para que Contas a receber (na Empresa) abra Emissão
 * e cobrança (no Rateio) já no mês da fatura — sem isso a pessoa cai no mês
 * corrente e precisa lembrar de voltar o seletor, que é como o título antigo
 * some. Só o formato do `<input type="month">` passa; qualquer outra coisa é
 * ignorada em vez de virar um mês inválido no seletor.
 */
export function mesDaQuery(search: string): string | null {
  const m = new URLSearchParams(search).get('mes');
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
}
