// R11 - o teto de rateio, dos dois lados: o que bloqueia e o que so alerta.
// Uso: bash tests/repos.sh
//
// A suite existe porque a constraint trigger e DEFERRABLE INITIALLY DEFERRED e
// isso muda ONDE o erro aparece. Sem ela, o unico teste possivel seria "a
// transacao abortou" - sem dizer qual UC, nem quando.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as uc from '../src/repos/unidade_consumidora.ts';
import * as usina from '../src/repos/usina.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

/** Uma usina limpa por cenario: o teto e por usina, e cenario que herda rateio
 *  do anterior testa outra coisa que nao o que diz testar. */
const usinaNova = (codigo: string) =>
  emA(() => usina.criar({ codigo_geradora: codigo, distribuidora: 'Equatorial' }));
const ucNova = (numero: string) =>
  emA(() => uc.criar({ cliente_id: CLI, numero_uc: numero, distribuidora: 'Equatorial' }));

// ------------------------------------------------- T1 usina sem UC: 0% e com_folga
{
  const g = await usinaNova('GER-T1');
  const s = await emA(() => rateio.situacaoDaUsina(g.id));
  chk('T1', s?.percentual_alocado === '0' && s?.situacao === 'com_folga' && s?.ucs === 0,
      `usina sem UC soma 0% e a situacao e com_folga (veio ${s?.percentual_alocado}/${s?.situacao})`);
}

// ------------------------------------------------- T2 abaixo de 100 PASSA
{
  const g = await usinaNova('GER-T2');
  const a = await ucNova('UC-T2A');
  const b = await ucNova('UC-T2B');
  await emA(() => rateio.definirRateio({ unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '60.0000' }));
  const s = await emA(() => rateio.definirRateio({ unidade_consumidora_id: b.id, usina_id: g.id, percentual_rateio: '31.2000' }));
  chk('T2', s?.situacao === 'com_folga' && s?.percentual_livre === '8.8000',
      `91,20% passa com folga de 8,80 - abaixo do teto NAO bloqueia (veio ${s?.percentual_livre})`);
}

// ------------------------------------------------- T3 exatamente 100 = completo
{
  const g = await usinaNova('GER-T3');
  const a = await ucNova('UC-T3A');
  const s = await emA(() => rateio.definirRateio({
    unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '100.0000',
  }));
  chk('T3', s?.situacao === 'completo', `100% e 'completo', nao 'acima_do_teto' (veio ${s?.situacao})`);
}

// ------------------------------------------------- T4 acima de 100 BLOQUEIA, com autor
{
  const g = await usinaNova('GER-T4');
  const a = await ucNova('UC-T4A');
  const b = await ucNova('UC-T4B');
  await emA(() => rateio.definirRateio({ unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '60' }));
  const e = await lancou(() => emA(() =>
    rateio.definirRateio({ unidade_consumidora_id: b.id, usina_id: g.id, percentual_rateio: '50' })));
  chk('T4', e instanceof rateio.RateioAcimaDoTeto && e.status === 422 && /GER-T4/.test(e.message),
      `110% vira erro de negocio que NOMEIA a usina, nao abort de commit anonimo (veio ${e?.name})`);
}

// ------------------------------------------------- T5 o bloqueio nao deixa residuo
{
  const g = await emA(() => usina.porCodigo('GER-T4'));
  const s = await emA(() => rateio.situacaoDaUsina(g!.id));
  chk('T5', s?.percentual_alocado === '60.0000',
      `a transacao que estourou o teto reverteu inteira: a usina segue em 60% (veio ${s?.percentual_alocado})`);
}

// ------------------------------------------------- T6 cancelar a UC libera o rateio
{
  const g = await usinaNova('GER-T6');
  const a = await ucNova('UC-T6A');
  await emA(() => rateio.definirRateio({ unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '80' }));
  await emA(() => uc.cancelar(a.id));
  const s = await emA(() => rateio.situacaoDaUsina(g.id));
  chk('T6', s?.percentual_alocado === '0' && s?.ucs === 0,
      `UC cancelada sai da conta do teto (veio ${s?.percentual_alocado})`);
}

// ------------------------------------------------- T7 suspensa CONTINUA no rateio
{
  const g = await usinaNova('GER-T7');
  const a = await ucNova('UC-T7A');
  await emA(() => rateio.definirRateio({ unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '80' }));
  await emA(() => uc.suspender(a.id));
  const s = await emA(() => rateio.situacaoDaUsina(g.id));
  chk('T7', s?.percentual_alocado === '80.0000',
      `UC suspensa continua ocupando o rateio - so cancelada sai (veio ${s?.percentual_alocado})`);
}

// ------------------------------------------------- T8 remover zera os DOIS campos
{
  const g = await usinaNova('GER-T8');
  const a = await ucNova('UC-T8A');
  await emA(() => rateio.definirRateio({ unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: '40' }));
  await emA(() => rateio.removerDoRateio(a.id));
  const depois = await emA(() => uc.porId(a.id));
  const s = await emA(() => rateio.situacaoDaUsina(g.id));
  chk('T8', depois?.usina_id === null && depois?.percentual_rateio === null && s?.percentual_alocado === '0',
      'removerDoRateio zera usina_id E percentual juntos - percentual orfao sumiria da conta');
}

// ------------------------------------------------- T9 CLAUDE.md 1: percentual nao e number
{
  const g = await usinaNova('GER-T9');
  const a = await ucNova('UC-T9A');
  const e = await lancou(() => emA(() => rateio.definirRateio({
    unidade_consumidora_id: a.id, usina_id: g.id, percentual_rateio: 33.3333 as any,
  })));
  chk('T9', e instanceof TypeError, `percentual como number lanca TypeError (veio ${e?.name})`);
}

// ------------------------------------------------- T10 a view respeita a RLS
{
  const daA = await emA(() => rateio.situacaoDeTodas());
  const daB = await emB(() => rateio.situacaoDeTodas());
  const vazou = daB.some((x) => x.codigo_geradora.startsWith('GER-T'));
  chk('T10', daA.length > 0 && !vazou,
      'rateio_por_usina e security_invoker: o tenant B nao ve usina do A pela view');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
