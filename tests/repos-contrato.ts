// R14 e a ordem da renovacao. Uso: bash tests/repos.sh
//
// A suite existe por causa de um achado de 26/07: o indice parcial
// `WHERE status = 'ativo'` fazia o `db pull` tipar unidade_consumidora.contrato
// como to-one, e a relacao devolvia contrato ARBITRARIO. Medido: R$ 111,00 de um
// suspenso onde o vigente valia R$ 789,00. Nenhum teste pegava, porque toda UC
// dos testes tinha um contrato so. K1 e K2 existem para nunca mais.

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import { dbt } from '../src/db/tipado.ts';
import * as contrato from '../src/repos/contrato.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A  = process.env.TEST_TENANT_A!;
const U  = process.env.TEST_USUARIO_ADMIN!;
const CLI = process.env.TEST_CLIENTE!;
const UC  = process.env.TEST_UC!;
const USI = process.env.TEST_USINA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const em = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
const novo = (valor: number) => ({
  cliente_id: CLI, unidade_consumidora_id: UC, usina_id: USI,
  data_fechamento: new Date('2026-01-10'),
  valor_referencia_centavos: valor,
  valor_referencia_origem: 'local' as const,
});

// ------------------------------------------------- K1 a relacao e 1-N
{
  // dbt() e nao o client base: fora da transacao nao ha contexto de tenant, e a
  // RLS devolve zero linhas sem erro - o teste passaria a testar nada.
  const uc = await em(() => dbt().unidade_consumidora.findFirst({
    where: { id: UC }, include: { contrato: true },
  }));
  chk('K1', Array.isArray(uc?.contrato),
      'unidade_consumidora.contrato e LISTA. Se vier objeto, o db pull voltou a tipar 1-1 e o valor lido da UC e arbitrario');
}

// ------------------------------------------------- K2 rascunho nao ocupa a UC
{
  await em(() => contrato.rascunhar(novo(11100)));
  await em(() => contrato.rascunhar(novo(22200)));
  const vigente = await em(() => contrato.vigenteDaUC(UC));
  chk('K2', vigente === null, 'dois rascunhos na mesma UC coexistem e nenhum e vigente');
}

// ------------------------------------------------- K3 um vigente por UC
let primeiro: any;
{
  primeiro = await em(() => contrato.rascunhar(novo(78900)));
  await em(() => contrato.ativar(primeiro.id));
  const v = await em(() => contrato.vigenteDaUC(UC));
  chk('K3', v?.id === primeiro.id && v?.valor_referencia_centavos === 78900,
      'vigenteDaUC devolve o contrato ativo por chave unica do banco, nao por LIMIT 1');
}

// ------------------------------------------------- K4 segundo ativo recusado
{
  const outro: any = await em(() => contrato.rascunhar(novo(99900)));
  const e = await lancou(() => em(() => contrato.ativar(outro.id)));
  chk('K4', e?.name === 'ContratoVigenteJaExiste' && e?.status === 409,
      `segundo contrato ativo na UC vira erro de negocio 409, nao 23505 cru (${e?.name ?? 'passou'})`);
}

// ------------------------------------------------- K5 suspenso AINDA ocupa
{
  await em(() => contrato.suspender(primeiro.id));
  const outro: any = await em(() => contrato.rascunhar(novo(44400)));
  const e = await lancou(() => em(() => contrato.ativar(outro.id)));
  chk('K5', e?.name === 'ContratoVigenteJaExiste',
      'R14 corrigida: com um SUSPENSO na UC, novo ativo e recusado. Antes da migration r14_vigente_unico isto PASSAVA');
  const v = await em(() => contrato.vigenteDaUC(UC));
  chk('K6', v?.id === primeiro.id && v?.status === 'suspenso',
      'o suspenso continua sendo o vigente da UC - rateio pausado, vinculo de pe');
}

// ------------------------------------------------- K7 encerrar libera
{
  await em(() => contrato.encerrar(primeiro.id));
  const v = await em(() => contrato.vigenteDaUC(UC));
  chk('K7', v === null, 'encerrar libera a UC: uc_vigente vira NULL sozinha, a coluna e gerada');
}

// ------------------------------------------------- K8 renovacao na ordem certa
{
  const a: any = await em(() => contrato.rascunhar(novo(50000)));
  await em(() => contrato.ativar(a.id));
  const b: any = await em(() => contrato.renovar(novo(60000)));
  const v = await em(() => contrato.vigenteDaUC(UC));
  chk('K8', v?.id === b.id && v?.valor_referencia_centavos === 60000,
      'renovar encerra o velho ANTES de inserir o novo, na mesma transacao - indice unico nao e DEFERRABLE');
}

// ------------------------------------------------- K9 a ordem invertida quebra
{
  const e = await lancou(() => em(async () => {
    const c: any = await contrato.rascunhar(novo(70000));
    await contrato.ativar(c.id);            // ocupa antes de liberar: proposital
  }));
  chk('K9', e?.name === 'ContratoVigenteJaExiste',
      'a ordem invertida FALHA - e a prova de que a ordem em renovar() nao e estilo, e requisito');
}

// ------------------------------------------------- K10 historico preservado
{
  const h: any[] = await em(() => contrato.historicoDaUC(UC));
  chk('K10', h.length >= 6 && h.filter(c => c.uc_vigente !== null).length === 1,
      `a UC guarda o historico inteiro (${h.length} contratos) com exatamente um ocupando a UC`);
}

await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
console.log(falhas === 0 ? '\nrepos/contrato: todas passaram' : `\nrepos/contrato: ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
