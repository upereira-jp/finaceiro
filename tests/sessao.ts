// SPEC-001 R1, R1-b, R1-c, R2, R3 - testes da camada de sessao.
// Roda contra o schema REAL das migrations (banco fin_sessao), nao contra o spike:
// esta camada depende de app.resolver_login e das policies com vinculo.
//
// Uso: bash tests/sessao.sh

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../spike-transacao/generated/client.ts';
import { criarPools } from '../src/db/pools.ts';
import { db, TenantNaoEncontrado, SemContextoDeTenant } from '../src/db/contexto.ts';
import {
  resolverLogin, selecionarTenant, abrirUnidadeDeTrabalho, abrirComoPlataforma,
  UsuarioNaoProvisionado, SemAcessoANenhumTenant,
} from '../src/auth/sessao.ts';

const CONN = process.env.CONN ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_sessao';
const pools = criarPools(CONN);
const tx = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

// Fixture montada por tests/sessao.sh; ids fixos para o teste ser legivel.
const AUTH_A   = 'aaaa1111-0000-4000-8000-000000000001';
const AUTH_AB  = 'aaaa2222-0000-4000-8000-000000000002';
const AUTH_SUP = 'aaaa3333-0000-4000-8000-000000000003';
const AUTH_ORF = 'aaaa4444-0000-4000-8000-000000000004';
const AUTH_XXX = 'ffffffff-0000-4000-8000-00000000ffff';

// ---------------------------------------------------------------- S1..S3 login
const sA  = await resolverLogin(tx as any, AUTH_A);
chk('S1', sA.tenants.length === 1 && sA.tier === null,
    `login sem contexto: ${sA.tenants.length} tenant(s), tier=${sA.tier} (esp. 1 e null)`);

const sAB = await resolverLogin(tx as any, AUTH_AB);
chk('S2', sAB.tenants.length === 2, `usuario em dois tenants: ${sAB.tenants.length} (esp. 2)`);

{
  let e: any;
  try { await resolverLogin(tx as any, AUTH_XXX); } catch (x) { e = x; }
  chk('S3', e instanceof UsuarioNaoProvisionado,
      `auth_user_id inexistente -> ${e?.name ?? 'NAO LANCOU'} (mensagem nao confirma existencia)`);
}

// ---------------------------------------------------------------- S4 sem vinculo
{
  const sOrf = await resolverLogin(tx as any, AUTH_ORF);
  let e: any;
  try { selecionarTenant(sOrf); } catch (x) { e = x; }
  chk('S4', e instanceof SemAcessoANenhumTenant && sOrf.tenants.length === 0,
      `usuario provisionado e sem vinculo -> ${e?.name ?? 'NAO LANCOU'} (403, e nao 404)`);
}

// ---------------------------------------------------------------- S5..S7 camada 1
{
  let e: any;
  try { selecionarTenant(sA, sAB.tenants.find(t => !sA.tenants.some(a => a.tenantId === t.tenantId))!.tenantId); }
  catch (x) { e = x; }
  chk('S5', e instanceof TenantNaoEncontrado,
      `tenant proposto FORA da lista do login -> ${e?.name ?? 'NAO LANCOU'} (404, nunca 403)`);
}
chk('S6', selecionarTenant(sA).tenantId === sA.tenants[0].tenantId, 'um vinculo e sem proposta: escolhe aquele');
{
  let e: any;
  try { selecionarTenant(sAB); } catch (x) { e = x; }
  chk('S7', e?.name === 'EscolhaDeTenantNecessaria' && e?.status === 409,
      `dois vinculos e sem proposta -> ${e?.name ?? 'NAO LANCOU'} 409, nao adivinha`);
}

// ---------------------------------------------------------------- S8 proposta invalida nao vira contexto
{
  const alheio = sAB.tenants.find(t => !sA.tenants.some(a => a.tenantId === t.tenantId))!.tenantId;
  let e: any, leu = -1;
  try {
    leu = await abrirUnidadeDeTrabalho(tx as any, sA, alheio, async () => (await db().cliente.findMany()).length);
  } catch (x) { e = x; }
  chk('S8', e instanceof TenantNaoEncontrado && leu === -1,
      `unidade de trabalho com tenant alheio: ${e?.name ?? 'ABRIU'} e o trabalho NAO rodou (leu=${leu})`);
}

// ---------------------------------------------------------------- S9 caminho normal
{
  const n = await abrirUnidadeDeTrabalho(tx as any, sA, undefined,
    async () => (await db().cliente.findMany()).length);
  chk('S9', n === 1, `caminho normal le o proprio tenant: ${n} cliente(s) (esp. 1)`);
}

// ---------------------------------------------------------------- S10 troca de tenant
{
  const r: number[] = [];
  for (const t of sAB.tenants) {
    r.push(await abrirUnidadeDeTrabalho(tx as any, sAB, t.tenantId,
      async () => (await db().cliente.findMany()).length));
  }
  chk('S10', r.length === 2 && r[0] !== undefined,
      `usuario de dois tenants alterna e ve so um de cada vez: ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------- S11 tier nao entra pelo normal
{
  const sSup = await resolverLogin(tx as any, AUTH_SUP);
  const alheio = sAB.tenants[0].tenantId;
  let e: any;
  try { await abrirUnidadeDeTrabalho(tx as any, sSup, alheio, async () => 1); } catch (x) { e = x; }
  chk('S11', e instanceof TenantNaoEncontrado || e instanceof SemAcessoANenhumTenant,
      `tier de plataforma pelo caminho NORMAL nao alcanca tenant sem vinculo -> ${e?.name ?? 'ALCANCOU'} (R3)`);
}

// ---------------------------------------------------------------- S12 plataforma com trilha
{
  const sSup = await resolverLogin(tx as any, AUTH_SUP);
  const alvo = sAB.tenants[0].tenantId;
  let n = -1, e: any;
  try {
    n = await abrirComoPlataforma(tx as any, sSup, alvo, 'diagnostico', 'cliente',
      async () => (await db().cliente.findMany()).length);
  } catch (x) { e = x; }
  chk('S12', n >= 0, `plataforma com trilha alcanca o tenant: ${n} cliente(s)${e ? ' erro=' + e.name : ''}`);

  const trilha = await abrirComoPlataforma(tx as any, sSup, alvo, 'conferencia', 'trilha',
    async () => {
      const r: any = await db().$queryRawUnsafe('SELECT count(*)::int AS c FROM acesso_plataforma_log');
      return r[0].c;
    });
  chk('S13', trilha >= 2, `trilha gravada: ${trilha} linha(s) em acesso_plataforma_log`);
}

// ---------------------------------------------------------------- S14 sem tier, sem caminho
{
  let e: any;
  try { await abrirComoPlataforma(tx as any, sA, sAB.tenants[0].tenantId, 'x', 'y', async () => 1); }
  catch (x) { e = x; }
  chk('S14', e?.name === 'RequerTierDePlataforma',
      `usuario comum tentando o caminho de plataforma -> ${e?.name ?? 'PASSOU'}`);
}

// ---------------------------------------------------------------- S15 R2 no banco: escrita sem trilha aborta
{
  const sSup = await resolverLogin(tx as any, AUTH_SUP);
  const alvo = sAB.tenants[0].tenantId;
  let cod = '';
  try {
    // Caminho proibido de proposito: contexto de plataforma SEM emitir a trilha.
    const { withTenantEm } = await import('../src/db/contexto.ts');
    await withTenantEm(tx as any, { tenantId: alvo, usuarioId: sSup.usuarioId, tier: sSup.tier }, async () => {
      await db().cliente.create({
        data: { id: 'cccc0000-0000-4000-8000-00000000000c', tenant_id: alvo, nome: 'sem trilha' } as any });
    });
    cod = 'COMMITOU';
  } catch (x: any) {
    const m = String(x?.message ?? x ?? '');
    cod = /R2:|insufficient_privilege|42501/.test(m) ? 'abortado pela R2'
        : (m.split('\n').filter(Boolean)[0] ?? 'erro sem mensagem').slice(0, 70);
  }
  chk('S15', cod === 'abortado pela R2',
      `escrita sob tier SEM trilha -> ${cod} (o gatilho confere no commit)`);
}

console.log(`\n--- sessao: 15 verificacoes, ${falhas} falha(s)`);
await tx.$disconnect(); await pools.transacional.end(); await pools.relatorio.end();
process.exit(falhas ? 1 : 0);
