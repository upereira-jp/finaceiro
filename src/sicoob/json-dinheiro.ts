// `JSON.parse` QUE DEVOLVE DINHEIRO COMO TEXTO.
//
// MEDIDO EM 27/08/2026: `JSON.parse('{"v":0.07}')` ja entrega float, e
// `0.07 * 100` da `7.000000000000001`. Quem converte depois do parse converte a
// partir de um numero que ja perdeu a forma - e a regra 1 proibe float
// "inclusive em calculo intermediario". O Node 22.20 expoe o TEXTO original do
// literal no terceiro argumento do reviver (`ctx.source`), e e ele que vai para
// `reaisDecimalParaCentavos`.
//
// SO OS CAMPOS QUE SAO DINHEIRO viram texto. `nossoNumero` e `numeroCliente` sao
// numeros e continuam numeros - transformar tudo em string obrigaria cada leitor
// a desfazer.
//
// POR QUE ELE SAIU DE `http.ts` EM 28/08: o webhook de liquidacao precisa da
// mesma leitura, e pelo mesmo motivo - `valorPagamento` chega como `407.41`. Uma
// segunda copia da regra e a forma de as duas divergirem no dia em que uma for
// corrigida.

/**
 * O parse. `texto` e o corpo CRU - nao passe por `JSON.parse` antes, porque e
 * exatamente o que este arquivo existe para evitar.
 */
export function jsonComDinheiroEmTexto(texto: string): any {
  // O `as any` no reviver e do LIB do TypeScript, nao do runtime: o
  // `lib.es5.d.ts` ainda declara o reviver com dois parametros, e o terceiro -
  // o `context` com `source` - existe no Node 22.20 e foi medido funcionando.
  // Sem o cast, o codigo certo nao compila.
  const reviver = function (chave: string, valor: unknown, ctx?: { source?: string }) {
    if (typeof valor === 'number' && /^valor/i.test(chave) && ctx?.source != null) {
      return String(ctx.source);
    }
    return valor;
  } as unknown as (chave: string, valor: unknown) => unknown;
  return JSON.parse(texto, reviver);
}
