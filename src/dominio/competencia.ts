// A COMPETENCIA DE UMA FATURA — um mes, e os TRES jeitos de escreve-lo que
// chegam aqui. Puro: texto entra, `{ano, mes}` sai, ou `null`. Sem rede, sem
// banco, sem excecao.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 08/09/2026, e a resposta e um defeito medido
//
// O projeto ja tinha DUAS leituras de competencia, escritas em momentos
// diferentes, e elas discordavam no unico formato que a Equatorial realmente
// imprime:
//
//   src/dominio/fatura-concessionaria.ts   MM/AAAA · AAAA-MM · **MMM/AAAA**
//   src/repos/registro-unificado.ts        MM/AAAA · AAAA-MM
//
// A primeira aprendeu `MMM/AAAA` em 08/08/2026, e o comentario que ela deixou
// diz por que: *"MEDIDO numa fatura REAL: a competencia sai como `FEV/2026`, e
// nao `02/2026`. A primeira versao desta funcao aceitava `MM/AAAA` e `AAAA-MM`
// e teria RECUSADO toda fatura da Equatorial"*.
//
// A segunda nunca aprendeu — e a segunda e a que esta no CAMINHO OFICIAL. A
// `Q-CICLO-01` foi decidida em 21/08/2026 pelo caminho UNIFICADO: quem grava a
// conta lida do mes e `registro-unificado.registrar()`, e e o registro dele que
// a prontidao conta na camada `conta_lida_da_competencia`.
//
// CONSEQUENCIA MEDIDA em 08/09/2026, nos textos das 17 faturas que a operacao
// ja tem em `/opt/financeiro/listas-2026-09-08/faturas-do-crm/`: a competencia
// impressa e `MAI/2026` (16 ocorrencias), `JUN/2026` (12), `ABR/2026` e
// `FEV/2026`. **Zero** trazem `05/2026`. O extrator (`leitor-visao.ts`)
// transcreve o que esta no papel e nao normaliza — nem o prompt nem o
// `SCHEMA_DA_FATURA` dizem qual formato ele deve devolver.
//
// Ou seja: registrar uma conta real da Equatorial pelo caminho oficial
// levantava `CompetenciaIlegivel`, e a unica saida era a pessoa reescrever
// `MAI/2026` como `05/2026` — vinte e nove vezes por mes. Era o mesmo defeito
// que a outra metade do sistema ja tinha consertado, uma casa ao lado.
//
// A LICAO, que e o motivo de isto ser UM arquivo e nao duas copias: enquanto a
// regra vive em dois lugares, consertar um nao conserta o outro, e nada falha
// no dia em que ela muda. Regra 7 — sinonimo em codigo e divida de leitura.

/** Ano com quatro digitos e mes com dois, ja normalizados. Nunca parcial. */
export type Competencia = { ano: string; mes: string };

/**
 * O mes por extenso abreviado, como a Equatorial escreve.
 *
 * Sem acento e em maiuscula porque e assim que o PDF traz; `lerCompetencia`
 * tira o acento antes de consultar, para o caso de outro layout trazer `MAR/`
 * com til em alguma variante.
 */
export const MES_POR_EXTENSO: Readonly<Record<string, string>> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

/** Os formatos aceitos, em uma linha — e a frase que as mensagens de erro usam,
 *  para que a recusa diga a mesma coisa nos dois caminhos. */
export const FORMATOS_DA_COMPETENCIA = 'MM/AAAA, AAAA-MM ou MMM/AAAA (ex.: 05/2026, 2026-05, MAI/2026)';

/**
 * Le a competencia dos tres formatos. `null` quando nao e nenhum deles.
 *
 * NAO LEVANTA de proposito: os dois chamadores tem vocabularios de recusa
 * diferentes e incompativeis — `fatura-concessionaria` acumula `ErroDaLeitura`
 * e devolve TODOS os erros de uma vez, `registro-unificado` levanta
 * `CompetenciaIlegivel` com a instrucao para a tela. Levantar aqui obrigaria um
 * dos dois a traduzir excecao em valor, que e o tipo de costura que apaga a
 * mensagem boa.
 */
export function lerCompetencia(bruto: unknown): Competencia | null {
  const t = String(bruto ?? '').trim();
  if (!t) return null;

  /* `AAAA-MM` e `AAAA-MM-DD`: o dia, se vier, e ignorado — a competencia E o
   * mes, e o CHECK `registro_competencia_no_dia_1` da migration 29 e quem
   * garante isso do lado do banco. */
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(t);
  if (iso) return normalizar(iso[1]!, iso[2]!);

  const br = /^(\d{2})\/(\d{4})$/.exec(t);
  if (br) return normalizar(br[2]!, br[1]!);

  /* `MAI/2026`, `MAI./2026`, `mai/2026` e `MAIO/2026` — o ponto e opcional e o
   * nome pode vir inteiro; so os TRES primeiros caracteres decidem. */
  const extenso = /^([A-Za-zÀ-ÿ]{3,})\.?\/(\d{4})$/.exec(t);
  if (extenso) {
    const nome = extenso[1]!.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 3);
    const mes = MES_POR_EXTENSO[nome];
    return mes ? normalizar(extenso[2]!, mes) : null;
  }

  return null;
}

/** `2026-05-01`, o primeiro dia — a forma que o banco guarda. */
export function competenciaEmIso(c: Competencia): string {
  return `${c.ano}-${c.mes}-01`;
}

/** `05/2026` — a forma que a tela mostra e que a pessoa digita. */
export function competenciaEmBr(c: Competencia): string {
  return `${c.mes}/${c.ano}`;
}

function normalizar(ano: string, mes: string): Competencia | null {
  const n = Number(mes);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return { ano, mes: String(n).padStart(2, '0') };
}
