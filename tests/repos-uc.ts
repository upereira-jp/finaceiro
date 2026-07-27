// Repositorio de unidade consumidora contra banco real, pela role sem BYPASSRLS.
// Uso: bash tests/repos.sh   (nao rode solto: depende do banco que o .sh monta)

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, SemContextoDeTenant } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as uc from '../src/repos/unidade_consumidora.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const L = process.env.TEST_USUARIO_LEITURA!;
const CLI = process.env.TEST_CLIENTE!;

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

// ------------------------------------------------- U1 sem contexto nao escreve
{
  const e = await lancou(() => uc.criar({ cliente_id: CLI, numero_uc: 'U1', distribuidora: 'Equatorial' }));
  chk('U1', e instanceof SemContextoDeTenant,
      `criar() fora de withTenant lanca SemContextoDeTenant (veio ${e?.constructor?.name ?? 'nada'})`);
}

// ------------------------------------------------- U2 tenant vem do contexto
{
  const r = await emA(() => uc.criar({ cliente_id: CLI, numero_uc: 'UC-U2', distribuidora: 'Equatorial' }));
  chk('U2', r.tenant_id === A && r.status === 'ativa' && r.titularidade === 'propria',
      'linha nasce com tenant_id do escopo, status ativa e titularidade propria');
}

// ------------------------------------------------- U3 numero duplicado = 409
{
  const e = await lancou(() => emA(() =>
    uc.criar({ cliente_id: CLI, numero_uc: 'UC-U2', distribuidora: 'Equatorial' })));
  chk('U3', e instanceof uc.NumeroDeUCJaExiste && e.status === 409,
      `numero_uc repetido vira erro de negocio 409, nao P2002 cru (veio ${e?.name})`);
}

// ------------------------------------------------- U4 findUnique por indice CHEIO
{
  const achou = await emA(() => uc.porNumero('UC-U2'));
  const doOutro = await emB(() => uc.porNumero('UC-U2'));
  chk('U4', achou?.numero_uc === 'UC-U2' && doOutro === null,
      'porNumero acha no proprio tenant e devolve null no outro - o filtro sai da RLS');
}

// ------------------------------------------------- U5 indice PARCIAL: null nao vai ao banco
{
  const nulo = await emA(() => uc.porUsinaClienteDoCrm(null));
  const semNada = await emA(() => uc.porUsinaClienteDoCrm(undefined));
  chk('U5', nulo === null && semNada === null,
      'porUsinaClienteDoCrm(null) devolve null sem consultar - o parcial nao cobre NULL');
}

// ------------------------------------------------- U6 parcial encontra quando existe
{
  const crmId = '99990000-0000-4000-8000-00000000c001';
  await emA(() => uc.criar({
    cliente_id: CLI, numero_uc: 'UC-U6', distribuidora: 'Equatorial', crm_usina_cliente_id: crmId,
  }));
  const achou = await emA(() => uc.porUsinaClienteDoCrm(crmId));
  chk('U6', achou?.numero_uc === 'UC-U6',
      'findFirst com predicado explicito acha a UC pelo id do CRM');
}

// ------------------------------------------------- U7 papel leitura nao escreve
{
  const e = await lancou(() => emA(() =>
    uc.criar({ cliente_id: CLI, numero_uc: 'UC-U7', distribuidora: 'Equatorial' }), L));
  chk('U7', e?.name === 'PapelInsuficiente' && e?.status === 403,
      `papel "leitura" nao passa em escrever_cadastro (veio ${e?.name})`);
}

// ------------------------------------------------- U8 leitura le
{
  const r = await emA(() => uc.listar({ status: 'ativa' }), L);
  chk('U8', Array.isArray(r) && r.length > 0, 'papel "leitura" lista UCs normalmente');
}

// ------------------------------------------------- U9 transicoes de status
{
  const nova = await emA(() => uc.criar({ cliente_id: CLI, numero_uc: 'UC-U9', distribuidora: 'Equatorial' }));
  await emA(() => uc.suspender(nova.id));
  const suspensa = await emA(() => uc.porId(nova.id));
  await emA(() => uc.reativar(nova.id));
  const reativada = await emA(() => uc.porId(nova.id));
  await emA(() => uc.cancelar(nova.id));
  const cancelada = await emA(() => uc.porId(nova.id));
  chk('U9', suspensa?.status === 'suspensa' && reativada?.status === 'ativa' && cancelada?.status === 'cancelada',
      'ativa -> suspensa -> ativa -> cancelada, cada transicao exigindo o estado de origem');
}

// ------------------------------------------------- U10 transicao invalida = 404
{
  const nova = await emA(() => uc.criar({ cliente_id: CLI, numero_uc: 'UC-U10', distribuidora: 'Equatorial' }));
  const e = await lancou(() => emA(() => uc.reativar(nova.id)));   // esta ativa, nao suspensa
  chk('U10', e?.status === 404,
      'reativar UC que nao esta suspensa devolve 404 em vez de mudar nada em silencio');
}

// ------------------------------------------------- U11 editar nao alcanca o rateio
{
  const nova = await emA(() => uc.criar({ cliente_id: CLI, numero_uc: 'UC-U11', distribuidora: 'Equatorial' }));
  // usina_id/percentual_rateio nao existem em EdicaoUC - isto e barrado em
  // compilacao. Em runtime, chave desconhecida tem que ser ignorada, nunca
  // repassada ao update: seria o segundo caminho de escrita do rateio.
  await emA(() => uc.editar(nova.id, { endereco_uf: 'ma', usina_id: 'x' } as any));
  const depois = await emA(() => uc.porId(nova.id));
  chk('U11', depois?.endereco_uf === 'MA' && depois?.usina_id === null,
      'editar normaliza UF e IGNORA campo de rateio passado por fora do tipo');
}

// ------------------------------------------------- U12 isolamento na escrita
{
  const daA = await emA(() => uc.porNumero('UC-U2'));
  const e = await lancou(() => emB(() => uc.editar(daA!.id, { endereco_bairro: 'invasao' })));
  chk('U12', e?.status === 404,
      'editar do tenant B uma UC do tenant A devolve 404 - a RLS esconde, o repo nao mente');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
