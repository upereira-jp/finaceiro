// UMA CONSULTA POR VEZ EM CADA CONEXAO - e quem manda duas juntas e o PRISMA.
//
// ============================================================================
// O AVISO QUE O CONSERTO DE 10/09 NAO FECHOU
//
// `db/em-serie.ts` e a guarda `tests/consulta-em-serie.ts` (CS2) tiraram todo
// `Promise.all` do NOSSO codigo que roda dentro da transacao. O aviso voltou
// assim mesmo - 10/09 21:48, 21/09 15:54, 22/09 03:06 -, e nas cinco vezes
// medidas o nginx registra, no mesmo segundo, a tela «Contas a pagar».
//
// A CAUSA ESTA UM DEGRAU ABAIXO DO NOSSO CODIGO. O Prisma 7 executa o plano da
// consulta em JavaScript, e o no `join` - o que carrega as relacoes de um
// `include` - roda os filhos com `Promise.all`. Medido no runtime instalado
// (`@prisma/client` 7.9.0, `runtime/client.js`):
//
//     case"join":{ ...await this.interpretNode(t.args.parent,r) ...
//       let o=await Promise.all(t.args.children.map(async s=>( ... )))
//
// Fora de transacao cada filho pega a SUA conexao do pool e isso e paralelismo
// de verdade. DENTRO da transacao interativa - que e toda unidade de trabalho
// deste sistema (`db/contexto.ts`) - os filhos dividem a UNICA conexao dela. O
// `pg` enfileira, e a partir da TERCEIRA consulta na fila ele avisa.
//
// `contaPagar.listar()` pede quatro relacoes (`dono_usina`, `originador`,
// `categoria`, `pagamento`): quatro filhos, tres esperando - e e a leitura que
// a tela dispara ao abrir, por isso o aviso nasce ali. NAO e a unica:
// `contaPagar.porId` pede cinco, e `conta_receber`/`emissao` aninham relacao
// dentro de relacao. O aviso sai uma vez por processo, entao o journal so
// mostra a PRIMEIRA a acontecer.
//
// ============================================================================
// POR QUE O CONSERTO E AQUI, e nao tirar os `include`
//
// Tirar os `include` de `listar` apaga ESTA ocorrencia e deixa a armadilha
// armada: `porId` continua com cinco, e o proximo `include` com tres relacoes,
// em qualquer repositorio, traz o aviso de volta - e no `pg@9`, que `^8.16.3` nao impede de chegar num
// `npm install`, o aviso vira EXCECAO na tela de quem abriu. A guarda CS2 nao
// pega esse caso porque nao ha `Promise.all` para ela ler: ele esta dentro do
// `node_modules`.
//
// A conexao que serializa as proprias consultas e o "mecanismo externo de
// controle de fluxo" que a propria mensagem do `pg` pede. E NAO CUSTA TEMPO: o
// `pg@8` ja executava uma de cada vez (so manda a proxima depois do
// ReadyForQuery), entao a ordem na rede e a mesma de antes - o que muda e que a
// espera passa a ser nossa, e nao da fila que o `pg` vai remover.
//
// O QUE PASSA DIRETO, SEM A FILA: a forma com callback e a consulta
// "submetivel" (cursor, stream). O `pg.Pool` usa a forma com callback no
// `pool.query()`, e ali a conexao e exclusiva daquela consulta; o adaptador do
// Prisma usa sempre a forma de promessa. Serializar o que nao precisa so
// esconderia um caminho que nao tem o defeito.

import pg from 'pg';

type ConstrutorDeConexao = new (...args: any[]) => pg.Client;

/**
 * A mesma classe de conexao, com as consultas de promessa enfileiradas.
 *
 * E uma fabrica, e nao so a classe pronta, para o teste poder vestir uma conexao
 * FALSA (`tests/conexao-em-serie.ts`) - o comportamento se prova sem banco.
 */
export function emSerieNaConexao<B extends ConstrutorDeConexao>(Base: B) {
  return class ConexaoEmSerie extends Base {
    /** A ultima consulta pedida, ja sem erro: a proxima espera por ela. */
    #fila: Promise<unknown> = Promise.resolve();

    query(...args: any[]): any {
      const [config, values, callback] = args;
      const semPromessa =
        typeof values === 'function' || typeof callback === 'function'
        || typeof config?.submit === 'function' || typeof config?.callback === 'function';
      if (semPromessa) return super.query.apply(this, args as any);

      const executar = () => super.query.apply(this, args as any);
      // Anterior falhou ou nao, a proxima roda: o erro e de quem pediu aquela
      // consulta, e nao pode travar a fila da conexao para quem vem depois.
      const resultado = this.#fila.then(executar, executar);
      this.#fila = resultado.then(() => undefined, () => undefined);
      return resultado;
    }
  };
}

/** A conexao dos dois pools do sistema - `db/pools.ts`. */
export const ConexaoEmSerie = emSerieNaConexao(pg.Client);
