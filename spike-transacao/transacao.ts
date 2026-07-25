// ADR-0003 r2 — fecha as tres lacunas declaradas em 24/07/2026.
//
// O que se quer saber:
//   1. `$transaction()` interativo fixa a mesma conexao fisica?      -> T1, T7
//   2. `$extends` consegue injetar o SET LOCAL antes de cada operacao? -> T3 (nao), T4b (sim, de outra forma)
//   3. PgBouncer em modo transaction                                  -> FORA DE ESCOPO, nao testado
//
// E, de passagem, o preco: timeout e maxWait em default, e custo de round trip.
//
// Role usada: app_pool — sem SUPERUSER, sem BYPASSRLS. E o caso real.

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.ts';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONN = 'postgresql://app_pool:spike@127.0.0.1:5432/spike';

function mk(max: number) {
  const pool = new pg.Pool({ connectionString: CONN, max });
  return { pool, prisma: new PrismaClient({ adapter: new PrismaPg(pool) }) };
}

const linhas: string[] = [];
const reg = (id: string, veredito: string, detalhe: string) =>
  linhas.push(`${id.padEnd(5)} ${veredito.padEnd(9)} ${detalhe}`);

// ---------------------------------------------------------------- LACUNA 1
// T1 — o bloco interativo roda todo na mesma conexao fisica?
{
  const { pool, prisma } = mk(5);
  const r = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
    const pids = new Set<number>();
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const p: any = await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS pid`);
      pids.add(p[0].pid);
      n = (await tx.cliente.findMany()).length;
    }
    return { pids: pids.size, n };
  });
  reg('T1', r.pids === 1 && r.n === 2 ? 'OK' : 'FALHA',
      `pool 5, 4 queries no bloco: ${r.pids} pid distinto(s), ${r.n} clientes lidos (esperado 1 e 2)`);
  await prisma.$disconnect(); await pool.end();
}

// T7 — a forma em lote tambem fixa?
{
  const { pool, prisma } = mk(5);
  let n = -1, err = '';
  try {
    const r: any = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`),
      prisma.cliente.findMany(),
    ]);
    n = r[1].length;
  } catch (e: any) { err = (e.message ?? String(e)).split('\n')[0]; }
  reg('T7', n === 2 ? 'OK' : 'FALHA', `$transaction([...]) em lote: ${n} linhas (esperado 2)${err ? ' · ' + err : ''}`);
  await prisma.$disconnect(); await pool.end();
}

// ---------------------------------------------------------------- ESCOPO DO SET LOCAL
// T2 / T2b — fora de transacao o SET LOCAL nao serve. E nao e culpa do pool.
for (const [id, max] of [['T2', 5], ['T2b', 1]] as const) {
  const { pool, prisma } = mk(max);
  await prisma.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
  const n = (await prisma.cliente.findMany()).length;
  reg(id, n === 0 ? 'OK' : 'FALHA',
      `SET LOCAL fora de transacao, pool ${max}: ${n} linhas (esperado 0 — o escopo morre no fim do statement)`);
  await prisma.$disconnect(); await pool.end();
}

// ---------------------------------------------------------------- LACUNA 2
// T3 — a forma intuitiva de middleware: emite o SET LOCAL e chama query(args). NAO funciona.
{
  const { pool, prisma } = mk(5);
  const ext = prisma.$extends({
    query: { $allModels: { async $allOperations({ args, query }: any) {
      await prisma.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
      return query(args);
    } } },
  });
  const n = (await ext.cliente.findMany()).length;
  reg('T3', n === 0 ? 'OK' : 'FALHA',
      `$extends chamando query(args): ${n} linhas (esperado 0 — o hook nao rebinda a operacao)`);
  await prisma.$disconnect(); await pool.end();
}

// T4b — a forma que funciona: RECONSTROI a operacao no client de transacao.
{
  const { pool, prisma } = mk(5);
  const comTenant = (id: string) => prisma.$extends({
    query: { $allModels: { async $allOperations({ args, model, operation }: any) {
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${id}'`);
        return tx[model][operation](args);
      });
    } } },
  });
  let nA = -1, nB = -1, err = '';
  try {
    nA = (await comTenant(A).cliente.findMany()).length;
    nB = (await comTenant(B).cliente.findMany()).length;
  } catch (e: any) { err = (e.message ?? String(e)).split('\n')[0]; }
  reg('T4b', nA === 2 && nB === 1 ? 'OK' : 'FALHA',
      `$extends recriando tx[model][operation]: A=${nA} B=${nB} (esperado 2 e 1)${err ? ' · ' + err : ''}`);
  await prisma.$disconnect(); await pool.end();
}

// T4c — WITH CHECK segura escrita com tenant_id alheio?
{
  const { pool, prisma } = mk(5);
  let msg = '';
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
      await tx.cliente.create({ data: { id: 'c9999999-0000-4000-8000-000000000009', tenant_id: B, nome: 'invasor' } });
    });
    msg = 'ACEITOU';
  } catch (e: any) {
    msg = /42501/.test(e.message ?? '') ? 'rejeitado, SQLSTATE 42501' : 'rejeitado: ' + (e.message ?? '').split('\n')[0].slice(0, 60);
  }
  reg('T4c', msg.startsWith('rejeitado') ? 'OK' : 'FALHA', `INSERT com tenant_id do B sob contexto do A: ${msg}`);
  await prisma.$disconnect(); await pool.end();
}

// T4d — concorrencia real: dois tenants intercalados no mesmo pool.
{
  const { pool, prisma } = mk(4);
  const ler = (id: string, atraso: number) => prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${id}'`);
    await new Promise((r) => setTimeout(r, atraso));
    return (await tx.cliente.findMany()).length;
  });
  const r = await Promise.all([ler(A, 10), ler(B, 20), ler(A, 30), ler(B, 40), ler(A, 50), ler(B, 60)]);
  const esperado = [2, 1, 2, 1, 2, 1];
  reg('T4d', JSON.stringify(r) === JSON.stringify(esperado) ? 'OK' : 'FALHA',
      `6 transacoes concorrentes A/B/A/B/A/B, pool 4: ${JSON.stringify(r)} (esperado ${JSON.stringify(esperado)})`);
  await prisma.$disconnect(); await pool.end();
}

// ---------------------------------------------------------------- O VAZAMENTO DO SPIKE, SOB PRISMA
// T5 — SET sem LOCAL: a conexao volta ao pool contaminada?
{
  const { pool, prisma } = mk(1);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET app.tenant_id = '${A}'`);   // sem LOCAL, de proposito
    await tx.cliente.findMany();
  });
  const n = (await prisma.cliente.findMany()).length;           // requisicao nova, contexto nenhum
  reg('T5', n > 0 ? 'VAZOU' : 'limpo',
      `SET sem LOCAL, pool 1: requisicao seguinte sem contexto leu ${n} linhas (o spike previu vazamento)`);
  await prisma.$disconnect(); await pool.end();
}

// T6 — e com LOCAL, no mesmo cenario?
{
  const { pool, prisma } = mk(1);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
    await tx.cliente.findMany();
  });
  const n = (await prisma.cliente.findMany()).length;
  reg('T6', n === 0 ? 'OK' : 'VAZOU', `SET LOCAL, pool 1: requisicao seguinte leu ${n} linhas (esperado 0)`);
  await prisma.$disconnect(); await pool.end();
}

// T8 — transacao aninhada: o contexto de fora e herdado?
{
  const { pool, prisma } = mk(5);
  let n = -1, err = '';
  try {
    n = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${A}'`);
      return await prisma.$transaction(async (tx2: any) => (await tx2.cliente.findMany()).length);
    });
  } catch (e: any) { err = (e.message ?? String(e)).split('\n')[0]; }
  reg('T8', n === 0 ? 'CONFIRMADO' : 'ATENCAO',
      `tx dentro de tx: ${n} linhas. 0 = conexao nova, contexto NAO herdado, sem erro -> invariante I-7${err ? ' · ' + err : ''}`);
  await prisma.$disconnect(); await pool.end();
}

// ---------------------------------------------------------------- O PRECO
// T9 — timeout default do bloco interativo.
{
  const { pool, prisma } = mk(2);
  const t = Date.now();
  let msg = '';
  try {
    await prisma.$transaction(async (tx: any) => { await tx.$queryRawUnsafe('SELECT 1 AS x FROM pg_sleep(6)'); });
    msg = `nao estourou em ${Date.now() - t}ms`;
  } catch (e: any) {
    const m = (e.message ?? '').match(/timeout for this transaction was (\d+) ms/);
    msg = `${e.code} em ${Date.now() - t}ms · timeout default = ${m ? m[1] : '?'}ms`;
  }
  reg('T9', 'medido', `query de 6s dentro de $transaction: ${msg} — o erro chega DEPOIS de o banco concluir`);
  await prisma.$disconnect(); await pool.end();
}

// T10 — maxWait default com pool esgotado.
{
  const { pool, prisma } = mk(1);
  const longa = prisma.$transaction(async (tx: any) => { await tx.$queryRawUnsafe('SELECT 1 AS x FROM pg_sleep(4)'); }).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  const t = Date.now();
  let msg = '';
  try { await prisma.$transaction(async (tx: any) => { await tx.cliente.findMany(); }); msg = `passou em ${Date.now() - t}ms`; }
  catch (e: any) { msg = `${e.code} em ${Date.now() - t}ms — ${(e.message ?? '').replace(/\s+/g, ' ').slice(0, 60)}`; }
  reg('T10', 'medido', `pool 1 ocupado por tx longa, segunda requisicao: ${msg}`);
  await longa; await prisma.$disconnect(); await pool.end();
}

// T11 — custo: a MESMA query nas tres formas.
{
  const { pool, prisma } = mk(5);
  const N = 500;
  for (let i = 0; i < 50; i++) await prisma.cliente.findMany();          // warmup
  let t = Date.now(); for (let i = 0; i < N; i++) await prisma.cliente.findMany(); const direta = Date.now() - t;
  t = Date.now(); for (let i = 0; i < N; i++) await prisma.$transaction(async (tx: any) => tx.cliente.findMany()); const soTx = Date.now() - t;
  t = Date.now(); for (let i = 0; i < N; i++) await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id='${A}'`); return tx.cliente.findMany();
  }); const completo = Date.now() - t;
  reg('T11', 'medido',
      `${N} iter, localhost, pool 5 — direta ${(direta / N).toFixed(2)}ms · tx ${(soTx / N).toFixed(2)}ms (${(soTx / direta).toFixed(1)}x) · tx+SET LOCAL ${(completo / N).toFixed(2)}ms (${(completo / direta).toFixed(1)}x)`);
  await prisma.$disconnect(); await pool.end();
}

// ---------------------------------------------------------------- saida
const cab = [
  'ADR-0003 r2 — testes de $transaction / $extends do Prisma sobre RLS',
  `Executado em ${new Date().toISOString().slice(0, 10)}`,
  'PostgreSQL 16.14 · Prisma 7.9.0 · @prisma/adapter-pg · role app_pool (sem BYPASSRLS)',
  'Schema: spike-adr0003/01-schema.sql (variante V1 — SET LOCAL por transacao)',
  '',
  'PgBouncer em modo transaction NAO foi testado. Segue risco aceito no ADR.',
  '',
  'ID    VEREDITO  DETALHE',
  '-'.repeat(118),
];
console.log([...cab, ...linhas].join('\n'));
