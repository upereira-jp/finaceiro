// DUAS CONSULTAS NA MESMA CONEXAO, prendidas no lugar. Sem banco.
// Uso: node --experimental-strip-types tests/consulta-em-serie.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, e o defeito que ela prende ja apareceu em PRODUCAO
//
// 10/09/2026, 17:39:59, journal do `financeiro.service`, cinco minutos depois de
// a aba «Historico» entrar no ar:
//
//     DeprecationWarning: Calling client.query() when the client is already
//     executing a query is deprecated and will be removed in pg@9.0.
//
// A causa esta explicada por inteiro em `src/db/em-serie.ts`, e em uma linha e
// esta: uma unidade de trabalho e uma transacao interativa, transacao interativa
// e UMA conexao, e `Promise.all` sobre duas leituras manda as duas ao mesmo
// tempo por ela.
//
// Hoje o `pg` enfileira e o resultado sai certo - o preco e so o aviso. No
// `pg@9` ele LANCA, e `pg` esta preso em `^8.16.3`: a versao 9 entra sozinha no
// dia em que alguem rodar `npm install` na raiz. O sintoma nao seria um aviso no
// journal, seria a tela quebrando para quem abriu.
//
// ============================================================================
// ELA VERIFICA A FORMA, NAO O COMPORTAMENTO, e isso e para ser dito em voz alta
//
// Nada aqui abre conexao. O que estas linhas garantem e que ninguem reintroduz
// `Promise.all` num arquivo que roda DENTRO da transacao - que e como o aviso
// nasceu, em sete lugares, cada um deles parecendo obviamente certo. Mesma
// disciplina de `tests/ci-apt.ts`: verificacao que le fonte se confere POR
// MUTACAO - escreva `Promise.all` num dos arquivos abaixo e esta suite fica
// vermelha.
//
// ⚠️ COMENTARIO SAI ANTES DE PROCURAR, e a licao e emprestada do `ci-apt`: os
// proprios comentarios que explicam o conserto CITAM `Promise.all` para dizer
// por que ele nao esta mais ali. Procurando no texto cru, a explicacao do
// conserto reprovaria o conserto.
//
// O QUE FICA DE FORA, E POR QUE:
//
//   `src/crm/`     e um `pg.Pool` de verdade (`crm/pool-de-leitura.ts`): cada
//                  consulta pega a SUA conexao, e ali `Promise.all` e
//                  paralelismo real, legitimo e desejado;
//   `src/app.ts`   o unico `Promise.all` dele e ciclo de vida de pool
//                  (`$disconnect`, `pool.end`), e nao consulta;
//   `src/sicoob/`  fala com o banco por HTTP, e HTTP paralelo nao divide conexao
//                  de Postgres com ninguem.

import { readFileSync, readdirSync } from 'node:fs';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const raiz = new URL('../', import.meta.url);

/** Bloco `/* ... *​/` e linha `//` fora, para a busca ver so codigo. */
const semComentario = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

/** Os arquivos que rodam DENTRO de `withTenant`, e por isso dividem a conexao. */
const alvos = (): string[] => {
  const lista: string[] = [];
  for (const dir of ['src/repos/', 'src/cobranca/', 'src/http/']) {
    for (const nome of readdirSync(new URL(dir, raiz))) {
      if (nome.endsWith('.ts')) lista.push(dir + nome);
    }
  }
  return lista.sort();
};

const arquivos = alvos();

// ------------------------------------------------ CS1 a lista de alvos existe
chk('CS1', arquivos.length >= 20,
    `sao ${arquivos.length} arquivos de repositorio, de cobranca e de fronteira HTTP - todos `
    + 'rodam dentro da transacao aberta por `withTenant`, e todos dividem a UNICA conexao dela');

// -------------------------------- CS2 nenhum deles dispara duas consultas juntas
{
  const sujos = arquivos.filter((rel) =>
    semComentario(readFileSync(new URL(rel, raiz), 'utf8')).includes('Promise.all'));

  chk('CS2', sujos.length === 0,
      'nenhum arquivo que roda dentro da transacao usa `Promise.all` - dentro dela ele nao '
      + 'paraleliza nada (o `pg` enfileira na mesma conexao), so produz o aviso que o `pg@9` '
      + `transforma em excecao. Use \`emSerie\` de \`db/em-serie.ts\`.${
        sujos.length ? ` SUJOS: ${sujos.join(', ')}` : ''}`);
}

// ------------------------------- CS3 o ajudante existe e e o que a mensagem manda usar
{
  const fonte = readFileSync(new URL('src/db/em-serie.ts', raiz), 'utf8');
  chk('CS3', fonte.includes('export async function emSerie') && fonte.includes('for (const tarefa of tarefas)'),
      '`emSerie` existe e serializa com um `for` de verdade - uma mensagem de erro que manda usar '
      + 'uma funcao que nao existe e pior do que nao ter mensagem');
}

// ---------------------------- CS4 e ele recebe FUNCOES, que e a metade que importa
{
  const fonte = semComentario(readFileSync(new URL('src/db/em-serie.ts', raiz), 'utf8'));
  chk('CS4', fonte.includes('() => Promise<unknown>'),
      'e ele recebe THUNKS e nao promessas: uma `Promise` ja criada JA COMECOU, e um ajudante que '
      + 'a recebesse nao serializaria nada - so daria a impressao de que sim');
}

// ------------------- CS5 o pool do CRM continua livre, e a excecao e deliberada
{
  const crm = readFileSync(new URL('src/crm/sincronizacao.ts', raiz), 'utf8');
  chk('CS5', semComentario(crm).includes('Promise.all'),
      'o lado do CRM CONTINUA usando `Promise.all`, e isto e afirmacao e nao descuido: ele le por '
      + 'um `pg.Pool`, onde cada consulta pega a sua conexao. Se um dia esta linha ficar vermelha, '
      + 'alguem "consertou" paralelismo legitimo por simetria com a regra de cima');
}

console.log(`\n${falhas === 0 ? 'consulta-em-serie: todas as verificacoes passaram'
                              : `consulta-em-serie: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
