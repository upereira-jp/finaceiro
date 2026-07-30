// EXPORTACAO CSV, pura e testada. E o unico jeito de tirar numero do sistema
// hoje - antes disto o relatorio saia por `curl` ou nao saia.
//
// TRES DECISOES QUE PARECEM DETALHE E NAO SAO:
//
// 1. SEPARADOR `;`, nao `,`. O Excel em pt-BR usa `;` como separador de lista, e
//    um CSV com virgula abre com tudo numa coluna. Quem recebe estes arquivos e
//    o contador, no Excel dele.
//
// 2. DINHEIRO SAI COMO TEXTO EM REAIS COM VIRGULA, feito por manipulacao de
//    STRING a partir dos centavos - sem dividir por 100 e sem float, que e a
//    regra 1 valendo tambem na saida. `emReais()` nao serve aqui porque leva o
//    "R$ " e o ponto de milhar, e ai o Excel trata a celula como texto.
//
// 3. BOM UTF-8 no inicio. Sem ele o Excel do Windows le "Competência" como
//    "ComptÃªncia". O BOM e feio e resolve, e a alternativa e cada pessoa
//    reimportar o arquivo escolhendo a codificacao a mao.
//
// O que este modulo NAO faz: baixar o arquivo. Isso e `document`/`Blob`, mora na
// tela, e nao ha o que provar nele.

/** 123456 -> "1234,56". Sem simbolo, sem milhar, sem float — para celula de
 *  planilha, onde o Excel precisa reconhecer o numero. */
export function reaisParaPlanilha(centavos: number | null | undefined): string {
  if (centavos == null) return '';
  const negativo = centavos < 0;
  const a = Math.abs(Math.trunc(centavos));
  // Por TEXTO: "8" -> "008" -> "0,08". Nao ha `a / 100` em lugar nenhum.
  const s = String(a).padStart(3, '0');
  return `${negativo ? '-' : ''}${s.slice(0, -2)},${s.slice(-2)}`;
}

/**
 * Escapa uma celula. Aspas dobram, e o campo e citado sempre que contiver
 * separador, aspas ou quebra de linha.
 *
 * A quebra de linha DENTRO da celula e o caso que quebra CSV escrito a mao, e
 * ele chega de verdade: `motivo_cancelamento` e `observacao` sao texto livre
 * digitado por gente.
 */
export function celula(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type Coluna<T> = { titulo: string; de: (t: T) => unknown };

/**
 * Monta o CSV inteiro. CRLF entre linhas, porque e o que a RFC 4180 pede e o que
 * o Excel espera.
 */
export function paraCsv<T>(colunas: ReadonlyArray<Coluna<T>>, linhas: readonly T[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.de(l))).join(';'));
  return `﻿${[cabecalho, ...corpo].join('\r\n')}\r\n`;
}

/** Nome de arquivo previsivel e ordenavel: `financeiro-comissoes-2026-07.csv`. */
export const nomeDoArquivo = (assunto: string, competencia?: string): string =>
  `financeiro-${assunto}${competencia ? `-${competencia}` : ''}.csv`;
