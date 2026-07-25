import pg from 'pg';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const AUTH_A = 'a1111111-0000-4000-8000-000000000001';
const AUTH_B = 'b2222222-0000-4000-8000-000000000002';

const conn = (user, pass = 'spike') =>
  ({ host: '127.0.0.1', port: 5432, database: 'spike', user, password: pass, max: 1 });

const admin = new pg.Pool(conn('postgres'));
const out = [];
const rec = (variante, teste, esperado, obtido, veredito) =>
  out.push({ variante, teste, esperado, obtido, veredito });

async function instalar(v) { await admin.query(`SELECT app.instalar_${v}()`); }

// ---------------------------------------------------------------- helpers
async function comSetLocal(pool, tenantId, sql) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    const r = await c.query(sql);
    await c.query('COMMIT');
    return r.rows;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

async function comSetSessao(pool, key, val, sql) {
  const c = await pool.connect();
  try { await c.query(`SET ${key} = '${val}'`); return (await c.query(sql)).rows; }
  finally { c.release(); }
}

const conta = async (rows) => Number(rows[0]?.n ?? -1);
const erroDe = (e) => `${e.code ?? '?'} ${String(e.message).split('\n')[0].slice(0, 90)}`;

// ================================================================== V1
async function testarV1() {
  await instalar('v1');
  const pool = new pg.Pool(conn('app_pool'));

  // 1. isolamento básico
  const nA = await conta(await comSetLocal(pool, A, 'SELECT count(*)::int n FROM cliente'));
  const nB = await conta(await comSetLocal(pool, B, 'SELECT count(*)::int n FROM cliente'));
  rec('V1', 'isolamento por tenant', 'A=2 B=1', `A=${nA} B=${nB}`, nA === 2 && nB === 1 ? 'PASSA' : 'FALHA');

  // 2. forçando a query com o id do outro tenant
  const forc = await conta(await comSetLocal(pool, A,
    `SELECT count(*)::int n FROM cliente WHERE tenant_id = '${B}'`));
  rec('V1', 'forçar tenant_id do outro na query', '0', String(forc), forc === 0 ? 'PASSA' : 'FALHA');

  // 3. sem contexto nenhum — o defeito observado no CRM
  const c = await pool.connect();
  const semCtx = Number((await c.query('SELECT count(*)::int n FROM cliente')).rows[0].n);
  c.release();
  rec('V1', 'role de serviço sem contexto', '0 linhas (não erro)', `${semCtx} linhas`,
      semCtx === 0 ? 'PASSA' : 'FALHA');

  // 4. WITH CHECK — inserir no tenant errado
  let insCross = 'permitiu';
  try {
    await comSetLocal(pool, A,
      `INSERT INTO cliente VALUES (gen_random_uuid(), '${B}', 'intruso')`);
  } catch (e) { insCross = erroDe(e); }
  rec('V1', 'INSERT com tenant_id do outro', 'bloqueado', insCross,
      insCross.startsWith('42501') ? 'PASSA' : 'FALHA');

  // 5. VAZAMENTO DE POOL — SET sem LOCAL persiste na conexão devolvida
  await comSetSessao(pool, 'app.tenant_id', A, 'SELECT 1');
  const c2 = await pool.connect();
  const herdado = Number((await c2.query('SELECT count(*)::int n FROM cliente')).rows[0].n);
  const guc = (await c2.query("SELECT current_setting('app.tenant_id', true) g")).rows[0].g;
  c2.release();
  rec('V1', 'SET sem LOCAL vaza para a próxima requisição', '0 / vazio',
      `${herdado} linhas / guc='${guc}'`, herdado === 0 ? 'PASSA' : 'FALHA — VAZOU');

  // 6. SET LOCAL fora de transação
  const c3 = await pool.connect();
  let semTx;
  try {
    await c3.query('RESET app.tenant_id');   // limpa o vazamento do teste anterior
    await c3.query(`SET LOCAL app.tenant_id = '${A}'`);
    semTx = `${Number((await c3.query('SELECT count(*)::int n FROM cliente')).rows[0].n)} linhas`;
  } catch (e) { semTx = erroDe(e); }
  c3.release();
  rec('V1', 'SET LOCAL fora de transação', '0 linhas (o SET é descartado)', semTx,
      semTx.startsWith('0') ? 'PASSA' : 'FALHA');

  await pool.end();
}

// ================================================================== V2
async function testarV2(sufixo, rotulo) {
  await instalar(sufixo);
  const pool = new pg.Pool(conn('app_pool'));

  let leitura, recursao = 'não';
  try {
    const r = await comSetSessao(pool, 'app.auth_uid', AUTH_A, 'SELECT count(*)::int n FROM cliente');
    leitura = `${await conta(r)} linhas`;
  } catch (e) { leitura = erroDe(e); if (e.code === '42P17') recursao = 'SIM'; }
  rec(rotulo, 'leitura de cliente com auth_uid do A', '2 linhas', leitura,
      leitura === '2 linhas' ? 'PASSA' : 'FALHA');
  rec(rotulo, 'recursão 42P17 na policy de usuario_tenant', 'não', recursao,
      recursao === 'não' ? 'PASSA' : 'FALHA');

  let isolado = 'n/d';
  try {
    const r = await comSetSessao(pool, 'app.auth_uid', AUTH_B, 'SELECT count(*)::int n FROM cliente');
    isolado = `${await conta(r)} linhas`;
  } catch (e) { isolado = erroDe(e); }
  rec(rotulo, 'isolamento: auth_uid do B', '1 linhas', isolado,
      isolado === '1 linhas' ? 'PASSA' : 'FALHA');

  // a função SECURITY DEFINER lê usuario_tenant sem policy?
  const dono = (await admin.query(
    `SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND p.proname='current_tenant_id'`)).rows[0].prosecdef;
  rec(rotulo, 'função é SECURITY DEFINER (lê sem policy)', 'ver ADR', String(dono), 'INFO');

  await pool.end();
}

// ================================================================== V3
async function testarV3() {
  await instalar('v3');
  const pa = new pg.Pool(conn('app_tenant_a'));
  const pb = new pg.Pool(conn('app_tenant_b'));

  const na = Number((await pa.query('SELECT count(*)::int n FROM cliente')).rows[0].n);
  const nb = Number((await pb.query('SELECT count(*)::int n FROM cliente')).rows[0].n);
  rec('V3', 'isolamento por role/conexão', 'A=2 B=1', `A=${na} B=${nb}`,
      na === 2 && nb === 1 ? 'PASSA' : 'FALHA');

  // sem SET nenhum na aplicação: o contexto veio da role
  rec('V3', 'aplicação não precisa emitir SET', 'sim', 'sim', 'PASSA');

  // um usuário de plataforma atravessando tenant
  let cross;
  try {
    const c = await pa.connect();
    await c.query(`SET app.tenant_id = '${B}'`);   // role comum consegue trocar!
    cross = `${Number((await c.query('SELECT count(*)::int n FROM cliente')).rows[0].n)} linhas do B`;
    c.release();
  } catch (e) { cross = erroDe(e); }
  rec('V3', 'role do tenant A consegue SET para o B', 'bloqueado', cross,
      cross.startsWith('0') ? 'PASSA' : 'FALHA — contexto não é imutável');

  await pa.end(); await pb.end();
}

// ============================================== testes independentes de variante
async function testarCatalogo() {
  await instalar('v1');

  const semPolicy = (await admin.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
  `)).rows.map(r => r.relname);
  rec('—', 'catálogo: RLS habilitada sem policy', "['sem_policy']", JSON.stringify(semPolicy),
      semPolicy.length === 1 && semPolicy[0] === 'sem_policy' ? 'PASSA' : 'FALHA');

  // o modo de falha: nega em silêncio, não dá erro
  const pool = new pg.Pool(conn('app_pool'));
  let r;
  try { r = `${await conta(await comSetLocal(pool, A, 'SELECT count(*)::int n FROM sem_policy'))} linhas`; }
  catch (e) { r = erroDe(e); }
  rec('—', 'ler tabela com RLS e sem policy', '0 linhas, SEM erro', r,
      r === '0 linhas' ? 'CONFIRMA O P8 §2' : 'FALHA');

  // FORCE: sem ele, o dono da tabela ignora a própria policy
  await admin.query('ALTER TABLE cliente NO FORCE ROW LEVEL SECURITY');
  const donoVe = Number((await admin.query(
    "SELECT count(*)::int n FROM cliente")).rows[0].n);
  await admin.query('ALTER TABLE cliente FORCE ROW LEVEL SECURITY');
  rec('—', 'sem FORCE, o dono (postgres) ignora a policy', '3 linhas (todas)', `${donoVe} linhas`,
      donoVe === 3 ? 'CONFIRMA A NECESSIDADE DO FORCE' : 'FALHA');

  // FK atravessando tenant: o banco aceita?
  let fk;
  try {
    await admin.query(`SET app.tenant_id = '${A}'`);
    await admin.query(`INSERT INTO contrato VALUES
      (gen_random_uuid(), '${A}', 'c2222222-0000-4000-8000-000000000001', 1)`);
    fk = 'ACEITOU — FK atravessou tenant';
  } catch (e) { fk = erroDe(e); }
  rec('—', 'FK apontando para cliente de outro tenant', 'rejeitado', fk,
      fk.startsWith('ACEITOU') ? 'FALHA — invariante 2 não é do banco' : 'PASSA');

  await pool.end();
}

// ---------------------------------------------------------------- main
await testarCatalogo();
await testarV1();
await testarV2('v2a', 'V2a (ingênua)');
await testarV2('v2b', 'V2b (SECURITY DEFINER)');
await testarV3();
await admin.end();

const W = [22, 46, 26, 34, 34];
const linha = (a) => '| ' + a.map((s, i) => String(s).padEnd(W[i]).slice(0, W[i])).join(' | ') + ' |';
console.log(linha(['VARIANTE', 'TESTE', 'ESPERADO', 'OBTIDO', 'VEREDITO']));
console.log('|' + W.map(w => '-'.repeat(w + 2)).join('|') + '|');
for (const r of out) console.log(linha([r.variante, r.teste, r.esperado, r.obtido, r.veredito]));
console.log(JSON.stringify({ total: out.length, falhas: out.filter(r => r.veredito.startsWith('FALHA')).length }));
