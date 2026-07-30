// O QUE A SPA FAZ QUANDO A SESSAO CAI. Puro, sem DOM e sem rede.
// Uso: node --experimental-strip-types web/tests/sessao-perdida.ts
//
// DE ONDE ISTO VEM, e o relato foi literal: *"o erro credencial invalida
// permanece, esta destruindo a UX"*, em 30/07/2026, com o dono usando o sistema
// em producao.
//
// O DEFEITO NAO ERA O 401 - esse e correto, o token tinha vencido. Era o que a
// SPA fazia com ele: **nada**. `ErroDaApi.ehDeSessao` existia desde que a camada
// foi escrita, com o comentario "401 e 403 pedem acao diferente de 422:
// reautenticar contra corrigir o dado", e NINGUEM o chamava. O 401 descia como
// erro comum ate `useDados`, e cada painel pintava "Credencial invalida." numa
// caixa vermelha - a mesma frase seis vezes numa tela de seis blocos, e nenhuma
// delas dizendo o que fazer.
//
// E O ESTADO NAO TINHA SAIDA PELA TELA. A sessao vencida vive no `localStorage`
// do supabase-js: recarregar a le de volta e o erro volta igual - foi
// exatamente o que aconteceu quando ele deu Ctrl+Shift+R. So sair e entrar
// resolvia, e nada dizia isso.
//
// O QUE ESTA SUITE PRENDE, e as tres coisas sao independentes:
//
//   1. o 401 AVISA quem cuida da sessao - a ligacao que nao existia;
//   2. avisa UMA VEZ por sessao, e nao por requisicao. Uma tela dispara varias
//      chamadas em paralelo e todas falham juntas quando o token vence;
//   3. o 422 NAO avisa. Se avisasse, um erro de digitacao derrubaria a pessoa
//      para o login - trocar um defeito de UX por outro pior.

import { ErroDaApi, ligarPerdaDeSessao, rearmarPerdaDeSessao } from '../src/api.ts';

let falhas = 0;
// Contado, nunca escrito - ver o rodape de `web/tests/interface.ts`.
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d.replace(/\s+/g, ' ')}`);
};

/*
 * O `fetch` FALSO, e ele e o motivo de esta suite existir sem rede: `chamar()`
 * nao e exportado, entao o caminho exercitado e o de verdade - `api.get()` ->
 * `fetch` -> resposta 401 -> `avisarSePerdeuSessao`. Trocar `fetch` por um que
 * responde o que se quer e o unico jeito de percorrer isso sem servidor.
 */
type Resposta = { status: number; corpo: unknown };
let proxima: Resposta = { status: 200, corpo: {} };
const globalQualquer = globalThis as any;
globalQualquer.fetch = async () => ({
  ok: proxima.status >= 200 && proxima.status < 300,
  status: proxima.status,
  text: async () => JSON.stringify(proxima.corpo),
});

const { api } = await import('../src/api.ts');

const avisos: string[] = [];
ligarPerdaDeSessao((motivo) => { avisos.push(motivo); });

const chamarEsperandoErro = async (): Promise<unknown> => {
  try { await api.get('/qualquer'); return null; } catch (e) { return e; }
};

// ---------------------------------------------------- S1 o 401 avisa
{
  rearmarPerdaDeSessao();
  avisos.length = 0;
  proxima = { status: 401, corpo: { erro: 'TokenInvalido', mensagem: 'Credencial invalida.' } };

  const e = await chamarEsperandoErro();
  chk('S1a', e instanceof ErroDaApi && e.ehDeSessao,
      'o 401 continua chegando como ErroDaApi para quem quiser trata-lo - o aviso nao engole o erro');

  chk('S1b', avisos.length === 1,
      'e AVISA quem cuida da sessao. Era esta ligacao que nao existia: `ehDeSessao` era um getter '
      + 'que ninguem chamava, e o 401 virava texto vermelho em cada painel da tela');
}

// ---------------------------------------------------- S2 a mensagem diz o que fazer
{
  chk('S2a', /sess/i.test(avisos[0] ?? '') && /entre de novo/i.test(avisos[0] ?? ''),
      `a mensagem para a PESSOA e "${avisos[0]}" - e nao "Credencial invalida.", que e a do `
      + 'servidor e nao diz o que fazer para quem esta olhando a propria tela ja logada');

  chk('S2b', !/Credencial inv/i.test(avisos[0] ?? ''),
      'e ela NAO repete a frase do servidor - a generica de la existe para nao dizer a quem tenta '
      + 'se errou a assinatura ou se expirou; aqui quem le e o dono da sessao');
}

// ---------------------------------------------------- S3 uma vez, nao seis
{
  rearmarPerdaDeSessao();
  avisos.length = 0;
  proxima = { status: 401, corpo: { erro: 'TokenInvalido', mensagem: 'Credencial invalida.' } };

  // Seis chamadas simultaneas: e o numero de painels de uma tela cheia, e
  // tambem o teto de `emLotes`.
  await Promise.all(Array.from({ length: 6 }, () => chamarEsperandoErro()));

  chk('S3a', avisos.length === 1,
      'seis chamadas paralelas com 401 produzem UM aviso - sem a trava seriam seis `signOut()` '
      + 'concorrentes e seis re-renders, que e o sintoma virando outro sintoma');
}

// ---------------------------------------------------- S4 sessao nova rearma
{
  rearmarPerdaDeSessao();
  avisos.length = 0;
  await chamarEsperandoErro();
  chk('S4a', avisos.length === 1,
      'depois de rearmar - o que o provedor faz ao estabelecer sessao nova - o aviso volta a '
      + 'disparar. Sem isso, quem entrasse de novo e vencesse de novo ficaria preso em silencio, '
      + 'que e pior que o defeito original');
}

// ---------------------------------------------------- S5 o resto NAO derruba
{
  rearmarPerdaDeSessao();
  avisos.length = 0;

  for (const status of [400, 403, 404, 409, 412, 422, 500, 502]) {
    proxima = { status, corpo: { erro: 'X', mensagem: 'nao e sessao' } };
    await chamarEsperandoErro();
  }
  chk('S5a', avisos.length === 0,
      'nenhum outro status derruba a sessao - inclusive o 403, que e falta de PAPEL e nao de '
      + 'credencial: deslogar quem tentou o que nao pode seria punir com o login uma recusa que a '
      + 'tela ja explica');

  chk('S5b', avisos.length === 0,
      'e o 422 tambem nao - um erro de digitacao mandando a pessoa para o login trocaria um '
      + 'defeito de UX por um pior, com perda do que ela estava preenchendo');
}

console.log(`\n${falhas === 0 ? `--- sessao perdida: ${feitas} verificacoes ok`
                              : `--- sessao perdida: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
