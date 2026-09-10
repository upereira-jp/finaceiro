// DUAS CONSULTAS NA MESMA TRANSACAO SAO SERIAIS. Isto so torna isso VISIVEL.
//
// ============================================================================
// O AVISO QUE APARECEU EM PRODUCAO, e ele e a razao deste arquivo existir
//
// Em 10/09/2026, as 17:39:59 - cinco minutos depois de a aba «Historico» entrar
// no ar - o journal do `financeiro.service` gravou:
//
//     DeprecationWarning: Calling client.query() when the client is already
//     executing a query is deprecated and will be removed in pg@9.0.
//
// Nao houve erro, nenhuma tela quebrou e nenhum numero saiu errado. O aviso e
// exatamente o que ele diz: alguem mandou DUAS consultas ao mesmo tempo pela
// MESMA conexao.
//
// COMO ISSO ACONTECE AQUI. Uma unidade de trabalho deste sistema e uma
// transacao interativa do Prisma (`db/contexto.ts`), e transacao interativa e
// UMA conexao - e ela que carrega o `app.tenant_id` que faz a RLS valer. Um
// `Promise.all` sobre `db.x.findFirst()` e `db.y.findFirst()` dispara as duas
// no mesmo instante, e as duas caem na mesma conexao.
//
// O QUE O `pg` FAZ COM ISSO HOJE: enfileira. A segunda espera a primeira, e o
// resultado sai certo. Ou seja - e vale ser explicito, porque muda o argumento -
// **nao ha ganho de tempo nenhum em usar `Promise.all` ali.** O paralelismo e
// aparente: o codigo pede duas de uma vez, o driver executa uma de cada vez, e o
// relogio marca a soma. O que se ganha e um aviso de descontinuacao.
//
// E O QUE ACONTECE NO `pg@9`: deixa de enfileirar e passa a LANCAR. O
// `package.json` fixa `pg` em `^8.16.3`, entao a versao 9 entra sozinha no dia
// em que alguem rodar `npm install` na raiz - e o sintoma nao seria um aviso no
// journal: seria a aba «Historico», o documento da fatura e a lista da fila
// quebrando na cara de quem abriu, todas no mesmo deploy.
//
// ============================================================================
// POR QUE UM AJUDANTE, E NAO SO TROCAR POR `await` SEGUIDO DE `await`
//
// Trocar tambem resolve, e em alguns lugares e o que se faz. Este arquivo existe
// pelos casos de tres, cinco, sete leituras seguidas - `repos/documento.ts` monta
// um documento com SETE -, onde a alternativa e sete `const` soltos e a perda da
// unica coisa boa que a forma antiga tinha: **ler como uma lista**. Aqui a lista
// continua sendo uma lista, os comentarios de cada leitura continuam ao lado
// dela, e a desestruturacao no destino nao muda.
//
// A DIFERENCA ESTA NUMA LINHA: cada leitura vem como `() => db...`, e nao como
// `db...`. A funcao adia; o valor nao. E o `for` abaixo garante que a proxima so
// comeca quando a anterior terminou.
//
// ⚠️ ISTO NAO VALE PARA O POOL DO CRM. `crm/pool-de-leitura.ts` e um `pg.Pool`
// de verdade: cada consulta pega a SUA conexao, e `Promise.all` la e paralelismo
// real, legitimo e desejado. A guarda de `tests/consulta-em-serie.ts` exclui
// aquele diretorio de proposito.

/**
 * As tarefas, uma depois da outra, na ordem em que foram escritas.
 *
 * ```ts
 * const [uc, chave, ident] = await emSerie(
 *   () => dbt().unidade_consumidora.findFirst({ ... }),
 *   () => dbt().chave_pix.findFirst({ ... }),
 *   () => dbt().identidade_de_cobranca.findFirst({ ... }),
 * );
 * ```
 *
 * O TIPO DE CADA POSICAO SOBREVIVE - a saida e uma tupla, e nao um `unknown[]`.
 * Sem isso a troca custaria um `as` em cada destino, e `as` e onde erro de tipo
 * se esconde.
 *
 * NAO HA VERSAO QUE RECEBA PROMESSAS PRONTAS, e a ausencia e o desenho: uma
 * `Promise` ja criada JA COMECOU, e um ajudante que a recebesse nao teria como
 * serializar coisa nenhuma - so daria a impressao de que sim.
 */
export async function emSerie<const T extends readonly (() => Promise<unknown>)[]>(
  ...tarefas: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const saidas: unknown[] = [];
  for (const tarefa of tarefas) saidas.push(await tarefa());
  return saidas as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
