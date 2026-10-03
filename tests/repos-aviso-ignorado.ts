// O AVISO DE PAGAMENTO IGNORADO (migration 43 + `repos/aviso-ignorado.ts`).
// Com banco: roda em tests/repos.sh, pela role SEM BYPASSRLS.
//
// O que so o banco mostra: a gravacao pelo papel do webhook (`cobranca`), o
// mesmo pagamento nao entrando duas vezes (indice unico parcial + ON CONFLICT DO
// NOTHING), o append-only por PRIVILEGIO (UPDATE e DELETE recusados pelo banco, e
// nao por convencao do codigo), a contagem por motivo e a RLS.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { dbt } from '../src/db/tipado.ts';
import { criarPools } from '../src/db/pools.ts';
import * as aviso from '../src/repos/aviso-ignorado.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const UCOB = process.env.TEST_USUARIO_COBRANCA!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const como = (u: string, t = A) => <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: t, usuarioId: u }, () => f());
const emACob = como(UCOB);
const emALei = como(ULEI);
const emA = como(U);
const emB = como(U, B);

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

const ID = `pg-${Date.now()}`;

try {
  // -------------------------------------------------------- quem grava
  const gravou = await lancou(() => emACob(() => aviso.registrar({
    motivo: 'titulo_desconhecido', nosso_numero: '0000000072', valor_centavos: 123_456,
    data_liquidacao: new Date(Date.UTC(2026, 9, 2)), id_externo: ID,
  })));
  chk('AI1', gravou === null,
      'o papel `cobranca` — o do usuario de servico do webhook — grava o aviso (a mesma permissao da baixa)');
  const leitura = await lancou(() => emALei(() => aviso.registrar({ motivo: 'evento_ignorado', detalhe: 'x' })));
  chk('AI1b', leitura !== null, '`leitura` NAO grava aviso — e so le');

  // ---------------------------------------------- o mesmo pagamento, uma vez
  await emACob(() => aviso.registrar({
    motivo: 'titulo_desconhecido', nosso_numero: '0000000072', valor_centavos: 123_456, id_externo: ID,
  }));
  await emACob(() => aviso.registrar({ motivo: 'evento_ignorado', detalhe: 'cancelamento de baixa do titulo 9' }));
  await emACob(() => aviso.registrar({ motivo: 'evento_ignorado', detalhe: 'd'.repeat(900) }));
  const r = await emALei(() => aviso.recentes());
  const doId = r.avisos.filter((a) => a.nosso_numero === '0000000072');
  chk('AI2', doId.length === 1,
      `o mesmo pagamento avisado DUAS vezes (mesmo id do banco) vira UMA linha — o indice parcial e o skipDuplicates (${doId.length})`);
  chk('AI3', r.titulo_desconhecido.total >= 1 && r.titulo_desconhecido.valor_centavos >= 123_456
          && r.evento_ignorado.total >= 2,
      'a contagem e por motivo: o pagamento soma valor, o evento que nao e pagamento so conta');
  chk('AI3b', r.avisos.every((a) => (a.detalhe?.length ?? 0) <= 500),
      'o motivo em texto e cortado em 500 — o mesmo teto do CHECK, e o aviso nao vira deposito');
  chk('AI3c', r.janela_em_dias === 30 && r.avisos.length <= aviso.TETO_DA_LISTA && r.avisos[0]!.recebido_em >= r.avisos[r.avisos.length - 1]!.recebido_em,
      'a janela e de 30 dias, a lista tem teto e vem do mais novo ao mais antigo');

  // ------------------------------------------------------ append-only
  const alterou = await lancou(() => emA(async () => {
    await dbt().aviso_pagamento_ignorado.updateMany({ where: { id_externo: ID }, data: { valor_centavos: 1 } });
  }));
  const apagou = await lancou(() => emA(async () => {
    await dbt().aviso_pagamento_ignorado.deleteMany({ where: { id_externo: ID } });
  }));
  chk('AI4', alterou !== null && apagou !== null && /permission|permiss|42501/i.test(String(alterou?.message ?? alterou) + String(apagou?.message ?? apagou)),
      'nem o admin altera nem apaga um aviso: o BANCO recusa (sem UPDATE nem DELETE para app_financeiro) — append-only por privilegio');

  // --------------------------------------------------------------- RLS
  const noB = await emB(() => aviso.recentes());
  chk('AI5', !noB.avisos.some((a) => a.nosso_numero === '0000000072'),
      'o tenant B nao ve o aviso do tenant A');
} finally {
  await prisma.$disconnect();
  await pools.transacional.end();
  await pools.relatorio.end();
}

console.log();
if (falhas > 0) { console.log(`--- aviso ignorado: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- aviso ignorado (grava pelo papel do webhook, append-only, por motivo, RLS): ${feitas} verificacoes, 0 falhas`);
