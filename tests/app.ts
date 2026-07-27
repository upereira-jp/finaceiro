// Composition root - a conferencia de arranque.
// Uso: bash tests/repos.sh
//
// O que esta suite protege: o app conectar com uma role que ignora RLS. Esse erro
// nao quebra nada, nao loga nada e passa em todas as outras suites - o sintoma e
// dado de outro tenant numa tela, meses depois. Aqui ele vira falha de boot.

import { criarApp, RoleDeRuntimeInsegura, SemDatabaseUrl, app, encerrarApp } from '../src/app.ts';

const RUNTIME = process.env.TEST_DATABASE_URL!;                 // app_financeiro_login
const SUPER = process.env.TEST_DATABASE_URL_SUPERUSER!;         // postgres

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

// ------------------------------------------------- A1 role de runtime passa
{
  const a = criarApp(RUNTIME);
  const r = await a.conferirRoleDeRuntime();
  chk('A1', r.usuario === 'app_financeiro_login',
      `a role sem BYPASSRLS passa no arranque (conectou como ${r.usuario})`);
  await a.encerrar();
}

// ------------------------------------------------- A2 superusuario NAO passa
{
  const a = criarApp(SUPER);
  const e = await lancou(() => a.conferirRoleDeRuntime());
  chk('A2', e instanceof RoleDeRuntimeInsegura,
      `conectar como superusuario aborta o arranque (veio ${e?.name ?? 'nada'})`);
  chk('A3', typeof e?.message === 'string' && /BYPASSRLS|SUPERUSER/.test(e.message),
      'a mensagem diz o que esta errado e para onde apontar a DATABASE_URL');
  await a.encerrar();
}

// ------------------------------------------------- A4 sem DATABASE_URL, erro nomeado
{
  const antes = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const e = await lancou(async () => app());
  chk('A4', e instanceof SemDatabaseUrl,
      `app() sem DATABASE_URL lanca erro nomeado, nao undefined adiante (veio ${e?.name ?? 'nada'})`);
  if (antes !== undefined) process.env.DATABASE_URL = antes;
}

// ------------------------------------------------- A5 o singleton e um so
{
  process.env.DATABASE_URL = RUNTIME;
  const um = app();
  const dois = app();
  chk('A5', um === dois, 'app() devolve a MESMA instancia - dois pools por processo, nao por chamada');
  await encerrarApp();
}

// ------------------------------------------------- A6 dois pools, tetos distintos
{
  const a = criarApp(RUNTIME);
  chk('A6', a.tetos.transacional === 8 && a.tetos.relatorio === 2 &&
            a.pools.transacional !== a.pools.relatorio,
      'transacional e relatorio sao pools DIFERENTES, com tetos 8 e 2');
  await a.encerrar();
}

// ------------------------------------------------- A7 o client cru nao sai daqui
{
  const a = criarApp(RUNTIME);
  const exportado = Object.keys(a);
  chk('A7', !exportado.includes('transacional') && !exportado.includes('relatorio') &&
            exportado.includes('protegido'),
      `o PrismaClient cru nao e exportado; so o protegido (${exportado.join(', ')})`);
  await a.encerrar();
}

// ------------------------------------------------- A8 o protegido barra modelo fora de contexto
{
  const a = criarApp(RUNTIME);
  const e = await lancou(() => (a.protegido as any).cliente.findMany());
  chk('A8', e?.name === 'SemContextoDeTenant',
      `operacao de modelo no client protegido fora de withTenant lanca (veio ${e?.name})`);
  await a.encerrar();
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
