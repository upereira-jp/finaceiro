// SPEC-001 invariantes 10 e 11 - testes do middleware de contexto.
// Roda contra o schema do spike-adr0003 (cliente/contrato/tenant), que e
// suficiente: o middleware nao conhece modelo, so ciclo de vida de transacao.
//
// Uso: cd spike-transacao && node --experimental-strip-types ../tests/middleware.ts

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../spike-transacao/generated/client.ts';
import {
  withTenantEm, withTenantRelatorioEm, db, tenantCorrente,
  comGuarda, SemContextoDeTenant, ContextoAninhado,
} from '../src/db/contexto.ts';
import { criarPools, TETO_TRANSACIONAL, TETO_RELATORIO } from '../src/db/pools.ts';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONN = 'postgresql://app_pool:spike@127.0.0.1:5432/spike';

const pools = criarPools(CONN);
const tx  = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const rel = new PrismaClient({ adapter: new PrismaPg(pools.relatorio) });
const withTenant  = <T>(t: string, f: (c: any) => Promise<T>) => withTenantEm(tx as any, t, f);
const withRelator = <T>(t: string, f: (c: any) => Promise<T>) => withTenantRelatorioEm(rel as any, t, f);

let falhas = 0;
const ok  = (id: string, d: string) => console.log(`ok   ${id.padEnd(4)} ${d}`);
const bad = (id: string, d: string) => { falhas++; console.log(`FALHA ${id.padEnd(4)} ${d}`); };
const chk = (id: string, cond: boolean, d: string) => (cond ? ok : bad)(id, d);

// ---------------------------------------------------------------- M1 isolamento
{
  const a = await withTenant(A, async () => (await db().cliente.findMany()).length);
  const b = await withTenant(B, async () => (await db().cliente.findMany()).length);
  chk('M1', a === 2 && b === 1, `isolamento: A=${a} (esp. 2) B=${b} (esp. 1)`);
}

// ---------------------------------------------------------------- M2 ATOMICIDADE
// O que o desenho por operacao NAO dava: duas operacoes na MESMA transacao.
{
  const txids = await withTenant(A, async () => {
    const c = db();
    const r1: any = await c.$queryRawUnsafe('SELECT txid_current()::text AS t');
    await c.cliente.findMany();
    const r2: any = await c.$queryRawUnsafe('SELECT txid_current()::text AS t');
    await c.contrato.findMany();
    const r3: any = await c.$queryRawUnsafe('SELECT txid_current()::text AS t');
    return [r1[0].t, r2[0].t, r3[0].t];
  });
  chk('M2', new Set(txids).size === 1, `atomicidade: 3 pontos, ${new Set(txids).size} txid (esp. 1)`);
}

// ---------------------------------------------------------------- M3 rollback
{
  const ID = 'cc000000-0000-4000-8000-00000000000c';
  try {
    await withTenant(A, async () => {
      await db().cliente.create({ data: { id: ID, tenant_id: A, nome: 'parcial' } });
      throw new Error('falha do handler DEPOIS da escrita');
    });
  } catch { /* esperado */ }
  const sobrou = await withTenant(A, async () => (await db().cliente.findMany({ where: { id: ID } })).length);
  chk('M3', sobrou === 0, `rollback: escrita + falha do handler -> ${sobrou} linha(s) sobrando (esp. 0)`);
}

// ---------------------------------------------------------------- M4 invariante 10
{
  let e: any;
  try { await withTenant(A, async () => withTenant(B, async () => 1)); } catch (x) { e = x; }
  chk('M4', e instanceof ContextoAninhado, `invariante 10: aninhamento -> ${e?.name ?? 'NAO LANCOU'} (esp. ContextoAninhado)`);
}

// ---------------------------------------------------------------- M5 sem contexto
{
  let e: any;
  try { db(); } catch (x) { e = x; }
  chk('M5', e instanceof SemContextoDeTenant, `db() fora de unidade de trabalho -> ${e?.name ?? 'NAO LANCOU'}`);
}

// ---------------------------------------------------------------- M6 guarda no base
{
  const guardado = comGuarda(tx as any);
  let e: any;
  try { await guardado.cliente.findMany(); } catch (x) { e = x; }
  chk('M6', e instanceof SemContextoDeTenant, `client base guardado, sem contexto -> ${e?.name ?? 'NAO LANCOU'} (nao "zero linhas")`);
}

// ---------------------------------------------------------------- M7 WITH CHECK
{
  let cod = '';
  try {
    await withTenant(A, async () => db().cliente.create({
      data: { id: 'dd000000-0000-4000-8000-00000000000d', tenant_id: B, nome: 'invasor' } }));
  } catch (x: any) { cod = /42501/.test(x.message ?? '') ? '42501' : (x.message ?? '').slice(0, 40); }
  chk('M7', cod === '42501', `WITH CHECK com tenant_id alheio -> ${cod || 'ACEITOU'}`);
}

// ---------------------------------------------------------------- M8 injecao
{
  let e: any;
  try { await withTenant("' ; DROP TABLE cliente; --", async () => 1); } catch (x) { e = x; }
  const vivo = await withTenant(A, async () => (await db().cliente.findMany()).length);
  chk('M8', e instanceof TypeError && vivo === 2, `tenantId nao-UUID -> ${e?.name ?? 'NAO LANCOU'}; tabela viva com ${vivo} linhas`);
}

// ---------------------------------------------------------------- M9 concorrencia
{
  const ler = (t: string, ms: number) => withTenant(t, async () => {
    await new Promise(r => setTimeout(r, ms));
    return (await db().cliente.findMany()).length;
  });
  const r = await Promise.all([ler(A,10), ler(B,20), ler(A,30), ler(B,40), ler(A,50), ler(B,60)]);
  chk('M9', JSON.stringify(r) === '[2,1,2,1,2,1]', `6 unidades concorrentes A/B -> ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------- M10 pools separados
{
  const nomes = await withTenant(A, async () => {
    const r: any = await db().$queryRawUnsafe(`SELECT current_setting('application_name') AS n`);
    return r[0].n;
  });
  const nomeRel = await withRelator(A, async () => {
    const r: any = await db().$queryRawUnsafe(`SELECT current_setting('application_name') AS n`);
    return r[0].n;
  });
  chk('M10', nomes === 'financeiro/tx' && nomeRel === 'financeiro/relatorio',
      `pools separados: tx="${nomes}" relatorio="${nomeRel}"`);
}

// ---------------------------------------------------------------- M11 relatorio nao mata o tx
{
  const lentos = Array.from({ length: TETO_RELATORIO }, () =>
    withRelator(A, async () => { await db().$queryRawUnsafe('SELECT 1 FROM pg_sleep(3)'); }).catch(() => {}));
  await new Promise(r => setTimeout(r, 300));
  const t0 = Date.now();
  let n = -1, erro = '';
  try { n = await withTenant(A, async () => (await db().cliente.findMany()).length); }
  catch (x: any) { erro = x.code ?? x.name; }
  const ms = Date.now() - t0;
  chk('M11', n === 2 && ms < 1000,
      `pool de relatorio saturado (${TETO_RELATORIO}/${TETO_RELATORIO}); transacional respondeu em ${ms}ms com ${n} linhas${erro ? ' erro=' + erro : ''}`);
  await Promise.all(lentos);
}

// ---------------------------------------------------------------- M12 contexto sobrevive a await
{
  const r = await withTenant(A, async () => {
    await new Promise(res => setTimeout(res, 20));
    const t = tenantCorrente();
    const n = (await db().cliente.findMany()).length;
    return { t, n };
  });
  chk('M12', r.t === A && r.n === 2, `ALS atravessa await: tenant=${r.t.slice(0,8)} linhas=${r.n}`);
}

console.log(`\n--- 12 verificacoes, ${falhas} falha(s) · pools tx=${TETO_TRANSACIONAL} relatorio=${TETO_RELATORIO}`);
await tx.$disconnect(); await rel.$disconnect();
await pools.transacional.end(); await pools.relatorio.end();
process.exit(falhas ? 1 : 0);
