// SPEC-001 R7-R9 + CLAUDE.md 1, 2 e 11 - repositorio de cliente contra banco real.
// Uso: bash tests/repos.sh   (nao rode solto: depende do banco que o .sh monta)

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, SemContextoDeTenant } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as cliente from '../src/repos/cliente.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const L = process.env.TEST_USUARIO_LEITURA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>, usuarioId = U) =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId }, () => f());
const emB = <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

// ------------------------------------------------- C1 sem contexto nao escreve
{
  const e = await lancou(() => cliente.criar({ nome: 'Fora de contexto' }));
  chk('C1', e instanceof SemContextoDeTenant,
      `criar() fora de withTenant lanca SemContextoDeTenant (veio ${e?.constructor?.name ?? 'nada'})`);
}

// ------------------------------------------------- C2 tenant vem do contexto
{
  const c = await emA(() => cliente.criar({ nome: 'Tenant do contexto' }));
  chk('C2', c.tenant_id === A, `linha nasce com tenant_id do escopo, nao de parametro (${c.tenant_id === A})`);
}

// ------------------------------------------------- C3 R8: semente do CRM
{
  const c = await emA(() => cliente.criar({
    nome: 'Semente CRM', documento_bruto: '529.982.247-25', documento_origem: 'crm_semente',
  }));
  chk('C3', c.documento === '52998224725' && c.documento_validado === false,
      'R8 documento do CRM com DV valido entra normalizado e NAO validado');
}

// ------------------------------------------------- C4 R9: invalido nao bloqueia
{
  const c = await emA(() => cliente.criar({
    nome: 'Documento ruim', documento_bruto: '11111111111', documento_origem: 'coleta_local',
  }));
  chk('C4', c.documento === '11111111111' && c.documento_validado === false,
      'R9 documento invalido NAO impede o cadastro - so a ativacao do contrato');
}

// ------------------------------------------------- C5 unico por tenant
{
  await emA(() => cliente.criar({ nome: 'Primeiro', documento_bruto: '00000000000191' }));
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Segundo', documento_bruto: '00.000.000/0001-91' })));
  chk('C5', e?.code === 'P2002',
      `documento repetido no mesmo tenant recusado, mesmo com formatacao diferente (${e?.code ?? 'passou'})`);
}

// ------------------------------------------------- C6 o indice E parcial
{
  await emA(() => cliente.criar({ nome: 'Sem doc 1' }));
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Sem doc 2' })));
  chk('C6', e === null,
      'DOIS clientes sem documento coexistem - se falhar, alguem trocou o parcial por unique cheio e proibiu cadastro sem documento');
}

// ------------------------------------------------- C7 isolamento por tenant
{
  const e = await lancou(() => emB(() => cliente.criar({ nome: 'Mesmo doc, outro tenant', documento_bruto: '00000000000191' })));
  chk('C7', e === null, 'mesmo documento no tenant B e aceito: a unicidade e por tenant, nao global');
}

// ------------------------------------------------- C8 RBAC no repositorio
{
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Nao deveria entrar' }), L));
  chk('C8', e?.name === 'PapelInsuficiente' && e?.status === 403,
      `papel 'leitura' nao cria cadastro (${e?.name ?? 'passou'})`);
}

// ------------------------------------------------- C9 CLAUDE.md 11
{
  const r = await emA(() => cliente.porDocumento(null));
  const r2 = await emA(() => cliente.porDocumento('   '));
  chk('C9', r === null && r2 === null,
      'porDocumento(null) e ("") devolvem null sem consultar - o indice parcial nao e caminho de navegacao');
}

// ------------------------------------------------- C10 normalizacao na busca
{
  const achado = await emA(() => cliente.porDocumento('00.000.000/0001-91'));
  chk('C10', achado?.documento === '00000000000191',
      'busca com documento formatado acha o normalizado');
}

// ------------------------------------------------- C11 centavos e Int
{
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Float', consumo_referencia_centavos: 100.5 })));
  chk('C11', e instanceof TypeError, `CLAUDE.md 1: float em centavos morre no repositorio (${e?.constructor?.name})`);
}

// ------------------------------------------------- C12 baixa e logica
{
  const c = await emA(() => cliente.criar({ nome: 'Para desativar' }));
  await emA(() => cliente.desativar(c.id));
  const depois = await emA(() => cliente.porId(c.id));
  chk('C12', depois !== null && depois.ativo === false, 'desativar faz baixa logica, nunca DELETE');
}

// ------------------------------------------------- C13 404 atravessa tenant
{
  const c = await emA(() => cliente.criar({ nome: 'Do tenant A' }));
  const e = await lancou(() => emB(() => cliente.desativar(c.id)));
  chk('C13', e?.status === 404,
      'editar cliente de outro tenant e 404, nunca 403: ausencia de vinculo e indistinguivel de inexistencia');
}

await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
console.log(falhas === 0 ? '\nrepos/cliente: todas passaram' : `\nrepos/cliente: ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
