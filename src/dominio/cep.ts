// A QUE UF UM CEP PERTENCE. Puro, sem rede e sem banco.
//
// POR QUE ISTO EXISTE, e foi medido contra conta de verdade em 28/09/2026.
//
// Das 21 contas da Equatorial lidas pelo leitor do CRM para fechar os enderecos
// que faltavam, DUAS imprimem um CEP que nao e da rua. Uma delas imprime
// "CEP: 76995000 INDIARA GO", e esse CEP e de Corumbiara, em RONDONIA. O
// importador aceitava a linha: ele confere oito digitos e confere a UF, mas
// nunca os dois juntos. O boleto sairia com cidade de Goias e CEP de Rondonia,
// e ninguem confere um campo que parece pronto.
//
// A FAIXA POR UF E A UNICA CONFERENCIA QUE DA PARA FAZER SEM REDE. Ela e publica,
// dos Correios, e nao muda. Nao prova que o CEP e da rua (a outra conta trazia um
// CEP de Rio Verde, so que de outra rua), mas pega sem falso positivo o erro mais
// caro: o CEP de outro estado.
//
// `null` QUANDO NAO DA PARA DIZER, e isso decide o desenho. Um CEP fora de toda
// faixa (os 789xx, que ja foram de Rondonia e hoje nao sao de ninguem) nao e
// acusado de nada: quem chama so recusa quando o CEP E, com certeza, de outra
// UF. Uma guarda que acusa o que nao sabe ensina a pessoa a ignorar a guarda.

import type { UF } from './planilha-enderecos.ts';

/**
 * As faixas dos Correios, em oito digitos. AM, DF e GO tem duas: o DF tem um
 * buraco no meio (72800000 a 72999999) que e de Goias, o Entorno. Por isso
 * Valparaiso de Goias (72870000) e GO e nao DF, e e o caso que mais erra quem
 * confere so pelo comeco do CEP.
 */
export const FAIXAS_DE_CEP: Readonly<Record<UF, ReadonlyArray<readonly [number, number]>>> = {
  SP: [[1000000, 19999999]],
  RJ: [[20000000, 28999999]],
  ES: [[29000000, 29999999]],
  MG: [[30000000, 39999999]],
  BA: [[40000000, 48999999]],
  SE: [[49000000, 49999999]],
  PE: [[50000000, 56999999]],
  AL: [[57000000, 57999999]],
  PB: [[58000000, 58999999]],
  RN: [[59000000, 59999999]],
  CE: [[60000000, 63999999]],
  PI: [[64000000, 64999999]],
  MA: [[65000000, 65999999]],
  PA: [[66000000, 68899999]],
  AP: [[68900000, 68999999]],
  AM: [[69000000, 69299999], [69400000, 69899999]],
  RR: [[69300000, 69399999]],
  AC: [[69900000, 69999999]],
  DF: [[70000000, 72799999], [73000000, 73699999]],
  GO: [[72800000, 72999999], [73700000, 76799999]],
  RO: [[76800000, 76999999]],
  TO: [[77000000, 77999999]],
  MT: [[78000000, 78899999]],
  MS: [[79000000, 79999999]],
  PR: [[80000000, 87999999]],
  SC: [[88000000, 89999999]],
  RS: [[90000000, 99999999]],
};

/** A UF do CEP, ou `null` quando ele nao tem oito digitos ou cai fora de toda
 *  faixa. Aceita mascara: `74825-110` e `74825110` sao o mesmo CEP. */
export function ufDoCep(cep: string | null | undefined): UF | null {
  const d = String(cep ?? '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const n = Number(d);
  for (const [uf, faixas] of Object.entries(FAIXAS_DE_CEP) as Array<[UF, ReadonlyArray<readonly [number, number]>]>) {
    if (faixas.some(([de, ate]) => n >= de && n <= ate)) return uf;
  }
  return null;
}

/**
 * A UF a que o CEP pertence, quando ela e OUTRA que a informada. `null` quando
 * batem ou quando nao da para dizer (CEP incompleto, UF vazia, CEP fora de toda
 * faixa). So um valor nao nulo justifica recusar ou deixar o CEP em branco.
 */
export function cepDeOutraUf(cep: string | null | undefined, uf: string | null | undefined): UF | null {
  const informada = String(uf ?? '').trim().toUpperCase();
  if (!informada) return null;
  const doCep = ufDoCep(cep);
  return doCep && doCep !== informada ? doCep : null;
}
