/*
 * O CALENDARIO BANCARIO NACIONAL - os dias em que um boleto pode, de fato, vencer.
 *
 * POR QUE ELE EXISTE, e ele nasceu de uma decisao e nao de um gosto: a regra do
 * dono de 04/09/2026 diz que "o boleto vence 3 dias antes da data imposta pela
 * Equatorial", e "3 dias antes" nao diz o que fazer quando o alvo cai num
 * sabado, num domingo ou num feriado. A `Q-VENC3-01` (a) ficou aberta desde
 * 07/09 exatamente por isso, e em 09/09/2026 o dono decidiu: **antecipar ate o
 * dia util anterior**. Antecipar mais respeita a regra - o boleto nunca fica a
 * MENOS de 3 dias da conta da distribuidora -, enquanto empurrar para o dia util
 * seguinte a violaria, e violaria justo no ponto que a regra existe para
 * proteger: a ordem de pagamento na fila do cliente.
 *
 * Ate esta data a antecipacao era em dias corridos e o boleto podia vencer num
 * domingo. Nao era defeito - era a ausencia deste arquivo, dita por escrito em
 * `anteciparVencimento`, porque inventar um calendario de feriados sem decisao
 * seria o improviso que a regra 10 proibe.
 *
 * ---------------------------------------------------------------------------
 * O CALENDARIO E NACIONAL, E ISSO E TECNICO E NAO PREGUICA.
 *
 * Quem liquida boleto e o SPB/STR, que roda no calendario NACIONAL. Feriado
 * municipal e estadual fecha a agencia da esquina e nao para a compensacao: um
 * boleto com vencimento no aniversario de Goiania e pago normalmente pelo app.
 * Por isso aqui nao entram feriados locais - entrariam como falso negativo,
 * antecipando titulo que nao precisava ser antecipado.
 *
 * 24/12 E 31/12 SAO DIA UTIL AQUI, e a escolha e deliberada. Eles nao sao
 * feriado: sao ponto facultativo de ATENDIMENTO - a agencia nao abre ao publico
 * e o pagamento digital funciona o dia inteiro. Tratar os dois como nao-util
 * anteciparia todo vencimento de fim de ano em mais um ou dois dias sem que
 * nenhum cliente estivesse impedido de pagar. Se um dia a operacao medir o
 * contrario, o lugar de mudar e a lista abaixo, num lugar so.
 *
 * ---------------------------------------------------------------------------
 * O QUE ENTRA (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023 e o calendario de
 * feriados bancarios da Febraban para os moveis):
 *
 *   FIXOS    01/01 Confraternizacao Universal · 21/04 Tiradentes ·
 *            01/05 Dia do Trabalho · 07/09 Independencia ·
 *            12/10 Nossa Senhora Aparecida · 02/11 Finados ·
 *            15/11 Proclamacao da Republica ·
 *            20/11 Consciencia Negra (nacional desde 2024 - a lei e de 2023, e
 *                  por isso o ano entra na conta em vez de a data ser eterna) ·
 *            25/12 Natal
 *
 *   MOVEIS   segunda e terca de Carnaval (Pascoa -48 e -47) ·
 *            Sexta-feira Santa (Pascoa -2) · Corpus Christi (Pascoa +60)
 *
 * A QUARTA-FEIRA DE CINZAS NAO ENTRA, e ela e a pegadinha da lista: o banco abre
 * ao meio-dia, entao ela e dia util e o boleto que vence nela e pago nela.
 * Trata-la como feriado antecipariria por engano toda vez que o Carnaval caisse
 * perto de um vencimento.
 */

/** `AAAA-MM-DD` de uma data que, por convencao deste sistema, e UTC-meia-noite. */
export const iso = (d: Date) => d.toISOString().slice(0, 10);

const dataUtc = (ano: number, mes1a12: number, dia: number) =>
  new Date(Date.UTC(ano, mes1a12 - 1, dia));

/**
 * O DOMINGO DE PASCOA, pelo algoritmo de Meeus/Jones/Butcher (gregoriano).
 *
 * Ele esta aqui inteiro, com as variaveis do nome original, porque uma tabela de
 * datas coladas venceria em silencio: no ano seguinte ao ultimo que alguem
 * digitou, o Carnaval simplesmente deixaria de ser feriado e nenhum teste
 * saberia. Uma funcao nao tem ano de validade.
 *
 * Valido de 1583 a 4099, que e a faixa do algoritmo - fora dela levanta, porque
 * devolver uma data errada aqui moveria um vencimento sem avisar ninguem.
 */
export function pascoa(ano: number): Date {
  if (!Number.isInteger(ano) || ano < 1583 || ano > 4099) {
    throw new RangeError(`ano fora da faixa do algoritmo de Pascoa: ${JSON.stringify(ano)}`);
  }
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);      // 3 = marco, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return dataUtc(ano, mes, dia);
}

const somarDias = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Ano em que a Consciencia Negra passou a ser feriado NACIONAL (Lei 14.759/2023). */
const PRIMEIRO_ANO_DA_CONSCIENCIA_NEGRA = 2024;

const cache = new Map<number, ReadonlySet<string>>();

/**
 * Os feriados bancarios nacionais de um ano, como `AAAA-MM-DD`.
 *
 * Memorizado por ano porque `recuarParaDiaUtil` consulta ate quatro anos por
 * chamada em lote de centenas de faturas, e a Pascoa nao muda de opiniao.
 */
export function feriadosNacionais(ano: number): ReadonlySet<string> {
  const guardado = cache.get(ano);
  if (guardado) return guardado;

  const p = pascoa(ano);
  const datas = [
    dataUtc(ano, 1, 1),    // Confraternizacao Universal
    somarDias(p, -48),     // segunda de Carnaval
    somarDias(p, -47),     // terca de Carnaval
    somarDias(p, -2),      // Sexta-feira Santa
    dataUtc(ano, 4, 21),   // Tiradentes
    dataUtc(ano, 5, 1),    // Dia do Trabalho
    somarDias(p, 60),      // Corpus Christi
    dataUtc(ano, 9, 7),    // Independencia
    dataUtc(ano, 10, 12),  // Nossa Senhora Aparecida
    dataUtc(ano, 11, 2),   // Finados
    dataUtc(ano, 11, 15),  // Proclamacao da Republica
    dataUtc(ano, 12, 25),  // Natal
  ];
  if (ano >= PRIMEIRO_ANO_DA_CONSCIENCIA_NEGRA) datas.push(dataUtc(ano, 11, 20));

  const conjunto: ReadonlySet<string> = new Set(datas.map(iso));
  cache.set(ano, conjunto);
  return conjunto;
}

/** Sabado e domingo nao; feriado nacional nao; o resto sim - inclusive 24 e 31/12. */
export function ehDiaUtilBancario(d: Date): boolean {
  const semana = d.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !feriadosNacionais(d.getUTCFullYear()).has(iso(d));
}

/**
 * ANTECIPA ATE O DIA UTIL BANCARIO, e nunca empurra - decisao do dono em
 * 09/09/2026 (`Q-VENC3-01` (a)).
 *
 * Devolve a propria data quando ela ja e util, entao a funcao e idempotente e
 * pode ser chamada duas vezes sem mover nada. O limite de 10 passos nao e medo
 * de laco infinito: e a afirmacao de que nenhuma sequencia de feriado + fim de
 * semana no calendario nacional chega perto disso (o pior caso real e 4 - sexta
 * feriado, sabado, domingo, segunda feriado). Estourar significa que a lista de
 * feriados foi corrompida, e ai levantar e melhor do que devolver uma data.
 */
export function recuarParaDiaUtil(d: Date): Date {
  let atual = d;
  for (let i = 0; i <= 10; i++) {
    if (ehDiaUtilBancario(atual)) return atual;
    atual = somarDias(atual, -1);
  }
  throw new RangeError(
    `nao ha dia util bancario nos 10 dias anteriores a ${iso(d)} - a lista de feriados esta errada`);
}
