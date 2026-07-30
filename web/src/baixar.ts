// O download do arquivo. Separado de `csv.ts` de proposito: aquele e puro e tem
// suite; este toca `document` e `URL`, que nao existem no runner do `web/`
// (`node --experimental-strip-types`, sem DOM).
//
// A separacao nao e purismo - e o que permite testar a MONTAGEM do CSV, que e
// onde o erro acontece (escape, dinheiro, codificacao). O clique em si nao tem o
// que provar.

/** Dispara o download de um texto como arquivo. `revokeObjectURL` no fim: sem
 *  ele cada exportacao vaza um blob pela vida da aba. */
export function baixarTexto(nome: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** `charset=utf-8` junto com o BOM que o `paraCsv` escreve: os dois, porque o
 *  Excel ignora o cabecalho HTTP ao abrir arquivo local e alguns leitores
 *  ignoram o BOM. */
export const baixarCsv = (nome: string, csv: string): void =>
  baixarTexto(nome, csv, 'text/csv;charset=utf-8');
