/*
 * O CALENDARIO BANCARIO NACIONAL - `src/dominio/calendario-bancario.ts`.
 *
 * POR QUE ELE MERECE SUITE PROPRIA: e a peca que decide EM QUE DIA o dinheiro e
 * cobrado, e ela erra em silencio. Um feriado a mais antecipa titulo que nao
 * precisava; um a menos poe o boleto vencendo num dia em que ninguem paga. Nos
 * dois casos a fatura sai bonita, a conferencia bate e a unica testemunha e o
 * cliente reclamando um mes depois.
 *
 *   CAL1  a Pascoa, contra datas conhecidas - inclusive as bordas do algoritmo
 *   CAL2  os moveis DERIVADOS dela, e a Quarta-feira de Cinzas que NAO e feriado
 *   CAL3  os fixos, e a Consciencia Negra que so vale a partir de 2024
 *   CAL4  24/12 e 31/12 sao dia util aqui, por decisao escrita
 *   CAL5  o recuo: idempotente, nunca empurra, atravessa cadeia longa
 *   CAL6  varredura de 40 anos - as invariantes que nenhum exemplo prova
 *
 * Rodar: node --experimental-strip-types tests/calendario-bancario.ts
 */
import {
  pascoa, feriadosNacionais, ehDiaUtilBancario, recuarParaDiaUtil, iso,
} from '../src/dominio/calendario-bancario.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

// ===========================================================================
// CAL1 - A PASCOA
// ===========================================================================

/* Datas conhecidas e verificaveis fora deste repositorio. 2038 e a Pascoa MAIS
 * TARDIA que o calendario gregoriano admite (25/04) e 2027 esta perto da mais
 * cedo - as duas bordas quebram implementacao que arredonda no lugar errado. */
const conhecidas: Record<number, string> = {
  2023: '2023-04-09', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
  2027: '2027-03-28', 2028: '2028-04-16', 2030: '2030-04-21', 2038: '2038-04-25',
};
chk('CAL1a', Object.entries(conhecidas).every(([a, d]) => iso(pascoa(Number(a))) === d),
    'oito Pascoas conhecidas, de 2023 a 2038, inclusive a mais tardia possivel (25/04/2038)');

let recusouAnoInvalido = 0;
for (const a of [1582, 4100, 2026.5, NaN]) {
  try { pascoa(a); } catch { recusouAnoInvalido++; }
}
chk('CAL1b', recusouAnoInvalido === 4,
    'fora de 1583..4099 e com ano nao-inteiro levanta - devolver data errada aqui moveria dinheiro');

// ===========================================================================
// CAL2 - OS MOVEIS, E A QUARTA-FEIRA DE CINZAS
// ===========================================================================

const f26 = feriadosNacionais(2026);
chk('CAL2a', f26.has('2026-02-16') && f26.has('2026-02-17'),
    'Carnaval 2026: segunda 16/02 e terca 17/02, derivadas da Pascoa em 05/04 (-48 e -47)');
chk('CAL2b', f26.has('2026-04-03') && f26.has('2026-06-04'),
    'Sexta-feira Santa 03/04 (-2) e Corpus Christi 04/06 (+60)');

/* A PEGADINHA DA LISTA. O banco abre ao meio-dia na Quarta-feira de Cinzas: ela
 * e dia util, e o boleto que vence nela e pago nela. Trata-la como feriado
 * antecipariria por engano todo vencimento perto do Carnaval. */
chk('CAL2c', !f26.has('2026-02-18') && ehDiaUtilBancario(dia('2026-02-18')),
    'Quarta-feira de Cinzas NAO e feriado - o banco abre ao meio-dia e o titulo e pago');

// ===========================================================================
// CAL3 - OS FIXOS, E A CONSCIENCIA NEGRA
// ===========================================================================

const fixos2026 = ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07',
                   '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25'];
chk('CAL3a', fixos2026.every((d) => f26.has(d)),
    'os oito fixos de sempre: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11 e 25/12');

/* A Lei 14.759 e de 2023 e vale a partir de 2024. Uma lista eterna diria que
 * 20/11/2023 foi feriado nacional, que e falso - e o erro so apareceria em
 * recalculo de historico, que e onde ninguem procura. */
chk('CAL3b', !feriadosNacionais(2023).has('2023-11-20') && f26.has('2026-11-20'),
    'Consciencia Negra e nacional so a partir de 2024 (Lei 14.759/2023)');
chk('CAL3c', feriadosNacionais(2023).size === 12 && f26.size === 13,
    '2023 tem 12 feriados bancarios nacionais e 2026 tem 13 - a diferenca e o 20/11');

// ===========================================================================
// CAL4 - 24/12 E 31/12
// ===========================================================================

/* Decisao escrita no modulo: sao ponto facultativo de ATENDIMENTO, nao feriado.
 * A agencia nao abre; o pagamento digital funciona. Se um dia a operacao medir o
 * contrario, este teste e o que vai falhar primeiro - de proposito. */
chk('CAL4a', ehDiaUtilBancario(dia('2026-12-24')) && ehDiaUtilBancario(dia('2026-12-31')),
    '24/12 e 31/12 sao dia util aqui (quinta-feira em 2026) - ponto facultativo nao e feriado');

// ===========================================================================
// CAL5 - O RECUO
// ===========================================================================

const sextaSanta2026 = dia('2026-04-04'); // sabado, e a sexta anterior e feriado
chk('CAL5a', iso(recuarParaDiaUtil(sextaSanta2026)) === '2026-04-02',
    'sabado 04/04/2026 recua por cima da Sexta-feira Santa e para na quinta 02/04');

const util = dia('2026-07-15');
chk('CAL5b', iso(recuarParaDiaUtil(util)) === '2026-07-15'
        && iso(recuarParaDiaUtil(recuarParaDiaUtil(util))) === '2026-07-15',
    'dia util volta ele mesmo, e a funcao e idempotente - chamar duas vezes nao move nada');

/* A CADEIA MAIS LONGA que o calendario nacional produz: 01/01/2027 e uma
 * sexta-feira, entao 02 e 03 sao fim de semana e 01 e feriado. Recuar de domingo
 * 03/01 atravessa os tres e cai em 31/12/2026 - ANO ANTERIOR, que e onde uma
 * implementacao que so olha o ano da data original erraria. */
chk('CAL5c', iso(recuarParaDiaUtil(dia('2027-01-03'))) === '2026-12-31',
    'de 03/01/2027 recua por cima do fim de semana e do 01/01 e cai em 31/12/2026 - outro ano');

// ===========================================================================
// CAL6 - VARREDURA DE 40 ANOS
// ===========================================================================

/* O que nenhum exemplo escolhido a mao prova. Sao ~14.600 dias. */
let naoUtil = 0, empurrou = 0, longe = 0, pascoaForaDaFaixa = 0;
for (let ano = 2020; ano < 2060; ano++) {
  const p = pascoa(ano);
  /* A Pascoa fica sempre entre 22/03 e 25/04. Fora disso o algoritmo quebrou. */
  if (iso(p) < `${ano}-03-22` || iso(p) > `${ano}-04-25`) pascoaForaDaFaixa++;
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const x = new Date(Date.UTC(ano, m, d));
      if (x.getUTCMonth() !== m) continue;            // 31 de fevereiro nao existe
      const r = recuarParaDiaUtil(x);
      if (!ehDiaUtilBancario(r)) naoUtil++;
      if (r.getTime() > x.getTime()) empurrou++;
      /* Nenhum recuo real passa de 4 dias no calendario nacional. Se passar, a
       * lista de feriados ganhou uma sequencia que ninguem previu. */
      if ((x.getTime() - r.getTime()) / 86_400_000 > 4) longe++;
    }
  }
}
chk('CAL6a', naoUtil === 0, 'em 40 anos de datas, o recuo SEMPRE termina num dia util bancario');
chk('CAL6b', empurrou === 0, 'e NUNCA empurra para frente - a regra do dono e "antes", nao "perto"');
chk('CAL6c', longe === 0, 'e nunca recua mais de 4 dias - o pior caso real do calendario nacional');
chk('CAL6d', pascoaForaDaFaixa === 0, 'e a Pascoa cai entre 22/03 e 25/04 em todos os 40 anos');

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
