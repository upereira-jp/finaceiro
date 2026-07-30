// Composition root - a conferencia de arranque.
// Uso: bash tests/repos.sh
//
// O que esta suite protege: o app conectar com uma role que ignora RLS. Esse erro
// nao quebra nada, nao loga nada e passa em todas as outras suites - o sintoma e
// dado de outro tenant numa tela, meses depois. Aqui ele vira falha de boot.

import { criarApp, RoleDeRuntimeInsegura, ClienteGeradoDesatualizado, SemDatabaseUrl, app, encerrarApp } from '../src/app.ts';

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

// ------------------------------------------- A9 o client gerado corresponde ao banco
/*
 * O DEFEITO QUE ESTA VERIFICACAO EXISTE PARA IMPEDIR foi medido EM PRODUCAO em
 * 30/07/2026, e chegou pela tela: "Cannot read properties of undefined (reading
 * 'findFirst')" na aba Documento.
 *
 * `src/generated/` esta no .gitignore, nada no caminho de deploy rodava
 * `prisma generate`, e as migrations 19 e 20 trouxeram tres modelos que o client
 * do servidor - o de 28/07 - nao tinha. `dbt().identidade_de_cobranca` era
 * `undefined`.
 *
 * A parte que dói: o deploy foi conferido dos dois lados e deu verde, porque as
 * rotas responderam **401 TokenInvalido**. E 401 prova que a rota EXISTE e recusa
 * credencial - ela nao chega ao banco. As tres rotas estavam quebradas atras dele.
 */
{
  const a = criarApp(RUNTIME);
  const r = await a.conferirClienteGerado();
  chk('A9a', r.modelos > 20,
      `o client cobre as ${r.modelos} tabelas de public - a conferencia le o CATALOGO e compara com `
      + 'o client, entao ela nao envelhece: migration nova entra na conta sozinha');
  await a.encerrar();
}

// ------------------------------------------- A9b e a guarda MORDE
{
  /*
   * O PLANTIO: uma tabela que existe no banco e nao tem modelo. Criada e
   * derrubada aqui mesmo, porque provar que a guarda acusa exige um banco em que
   * ela DEVA acusar - e o estado normal do `fin_repos` e o correto.
   *
   * Sem esta verificacao, A9a passaria para sempre num client certo e ninguem
   * saberia se a comparacao chega a olhar para alguma coisa.
   */
  const a = criarApp(SUPER);
  await (a.protegido as any).$executeRawUnsafe('CREATE TABLE tabela_sem_modelo_no_client (id int)');
  const e = await lancou(() => a.conferirClienteGerado());
  await (a.protegido as any).$executeRawUnsafe('DROP TABLE tabela_sem_modelo_no_client');
  chk('A9b', e instanceof ClienteGeradoDesatualizado
        && (e as ClienteGeradoDesatualizado).tabelas.includes('tabela_sem_modelo_no_client'),
      'tabela sem modelo no client derruba o arranque NOMEANDO a tabela - e a mensagem traz o '
      + 'conserto (`npx prisma generate`), porque quem le esse erro esta num servidor as 23h');

  const depois = await a.conferirClienteGerado();
  chk('A9c', depois.modelos > 20,
      'e some quando a tabela some - a guarda le o estado, nao um cache do arranque');
  await a.encerrar();
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
