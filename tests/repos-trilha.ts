// A TRILHA PAGINADA POR CURSOR (`repos/auditoria.ts`, `trilha` com `antes_de`).
// Com banco: roda em tests/repos.sh, pela role SEM BYPASSRLS.
//
// O que so se ve com PostgreSQL de verdade, e por isso esta aqui e nao numa
// suite sem banco:
//
//   - `ocorrido_em` e `clock_timestamp()` em `timestamptz(6)`. UM `UPDATE` que
//     toca 30 clientes grava 30 linhas de trilha, quase todas no MESMO
//     milissegundo. O `Date` do JavaScript nao distingue essas linhas; o cursor
//     tem de distinguir, ou a pagina seguinte pula as que ficaram "no meio" do
//     milissegundo. TR3 prova que o cenario existe neste banco (controle
//     positivo); TR2 prova que o cursor passa por ele sem perder nem repetir.
//   - a linha do cursor passa pela RLS: o `id` de uma linha do tenant A,
//     usado no tenant B, nao e encontrado (TR5).
//   - linhas novas no topo nao deslocam a pagina seguinte (TR6) — que e o
//     defeito de uma paginacao por deslocamento numa tabela que cresce pelo topo.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { dbt } from '../src/db/tipado.ts';
import { criarPools } from '../src/db/pools.ts';
import * as auditoria from '../src/repos/auditoria.ts';
import type { LinhaDaTrilha } from '../src/repos/auditoria.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const PREFIXO = `Trilha paginada ${Date.now()}`;
/* A JANELA DO TESTE: so as linhas que ele mesmo gravou. As suites anteriores
 * deixaram trilha de cliente no tenant A — o conector do CRM, logo antes desta,
 * grava centenas —, e sem a janela a referencia dependeria de quantas.
 *
 * ⚠️ O INICIO DA JANELA E O RELOGIO DO POSTGRES, lido logo antes da primeira
 * escrita, e nao `Date.now()` com folga. A primeira versao usou "agora menos 2 s"
 * do Node e pegou mais de 500 linhas do conector no CI (02/10/2026, run
 * 37089381101): a folga que protegia contra relogios diferentes abria a janela
 * para a suite anterior. */
let DESDE = new Date(0);
const ms = (l: LinhaDaTrilha) => new Date(l.ocorrido_em).getTime();

/** Le a trilha inteira de `cliente`, pagina por pagina, seguindo o cursor. */
async function seguirCursor(limite: number): Promise<{ ids: string[]; paginas: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let paginas = 0;
  for (;;) {
    const p = await emA(() => auditoria.trilha({ tabela: 'cliente', desde: DESDE, limite, antes_de: cursor }));
    paginas++;
    ids.push(...p.linhas.map((l) => l.id));
    if (p.proximo === null) break;
    cursor = p.proximo;
    /* A trava conta paginas, e o teto e o que a janela pode ter: 60 linhas do
     * cenario + 30 do TR6, de 1 em 1. Passar disso e cursor andando em circulo. */
    if (paginas > 200) throw new Error(`o cursor nao termina (${ids.length} linhas em ${paginas} paginas)`);
  }
  return { ids, paginas };
}

try {
  // ------------------------------------------------------------- o cenario
  // 30 clientes criados de uma vez e depois alterados de uma vez: 60 linhas de
  // trilha, e o UPDATE grava as 30 dele dentro de um unico comando.
  DESDE = await emA(async () => {
    const [{ agora }] = await dbt().$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`;
    return agora;
  });
  await emA(async () => {
    await dbt().cliente.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({ tenant_id: A, nome: `${PREFIXO} ${String(i).padStart(2, '0')}` })),
    });
  });
  await emA(async () => {
    await dbt().cliente.updateMany({ where: { nome: { startsWith: PREFIXO } }, data: { origem: 'teste da trilha' } });
  });

  const referencia = await emA(() => auditoria.trilha({ tabela: 'cliente', desde: DESDE, limite: auditoria.TETO }));
  chk('TR1', referencia.proximo === null && referencia.linhas.length >= 60,
      `a referencia cabe numa pagina so (${referencia.linhas.length} linhas de cliente, proximo=${referencia.proximo})`);

  // ----------------------------------------------- o milissegundo compartilhado
  const repetidos = referencia.linhas.filter((l, i, a) =>
    (i > 0 && ms(a[i - 1]) === ms(l)) || (i < a.length - 1 && ms(a[i + 1]) === ms(l))).length;
  chk('TR3', repetidos >= 10,
      `CONTROLE POSITIVO: ${repetidos} linhas dividem o milissegundo com a vizinha — um cursor `
      + 'montado com o Date do JavaScript nao saberia separar estas linhas');

  // Quantas linhas um cursor "ocorrido_em < data do cursor" perderia, paginando
  // de 1 em 1: em cada corte, as que vem DEPOIS e tem o mesmo milissegundo.
  {
    let perderia = 0;
    for (let corte = 0; corte < referencia.linhas.length - 1; corte++) {
      const c = referencia.linhas[corte];
      if (ms(referencia.linhas[corte + 1]) === ms(c)) perderia++;
    }
    chk('TR3b', perderia > 0,
        `CONTROLE NEGATIVO: um cursor por data, de 1 em 1, perderia linha em ${perderia} corte(s) `
        + 'em silencio — e o defeito que o cursor por id existe para nao ter');
  }

  // ------------------------------------------------- o cursor percorre tudo
  for (const tamanho of [1, 7]) {
    const { ids, paginas } = await seguirCursor(tamanho);
    const esperado = referencia.linhas.map((l) => l.id);
    chk(`TR2-${tamanho}`, ids.join(',') === esperado.join(',') && new Set(ids).size === ids.length,
        `seguindo o cursor de ${tamanho} em ${tamanho} (${paginas} paginas) sai EXATAMENTE a referencia: `
        + `mesma ordem, nenhuma repetida, nenhuma pulada (${ids.length} de ${esperado.length})`
        + (tamanho === 1 ? ' — de 1 em 1, o cursor atravessa CADA fronteira de milissegundo' : ''));
  }

  {
    const p = await emA(() => auditoria.trilha({ tabela: 'cliente', desde: DESDE, limite: referencia.linhas.length }));
    chk('TR4', p.proximo === null,
        'pedir exatamente o que existe devolve proximo null — a linha a mais que a consulta pede '
        + 'e o que separa «acabou» de «encheu a pagina»');
  }

  // ------------------------------------------------- o cursor passa pela RLS
  {
    const doA = referencia.linhas[5].id;
    const noB = await emB(() => auditoria.trilha({ limite: 50, antes_de: doA, incluir_rodadas: true }));
    chk('TR5', noB.linhas.length === 0 && noB.proximo === null,
        `o id de uma linha do tenant A, usado como cursor no tenant B, nao e encontrado: pagina vazia `
        + `(${noB.linhas.length} linhas) — a posicao da linha de outra empresa nao vaza`);
  }

  // --------------------------------------- o topo cresce, a pagina 2 nao anda
  {
    const p1 = await emA(() => auditoria.trilha({ tabela: 'cliente', desde: DESDE, limite: 7 }));
    await emA(async () => {
      await dbt().cliente.updateMany({ where: { nome: { startsWith: PREFIXO } }, data: { origem: 'teste da trilha 2' } });
    });
    const p2 = await emA(() => auditoria.trilha({ tabela: 'cliente', desde: DESDE, limite: 7, antes_de: p1.proximo! }));
    const esperado = referencia.linhas.slice(7, 14).map((l) => l.id);
    chk('TR6', p2.linhas.map((l) => l.id).join(',') === esperado.join(','),
        '30 linhas novas no TOPO entre a pagina 1 e a 2 nao deslocam a 2: ela continua de onde a 1 parou '
        + '(com deslocamento por numero de pagina, a 2 repetiria as linhas da 1)');
  }

  // --------------------------------------------------- o cursor malformado
  {
    const lancou = (v: string) => { try { auditoria.cursorDaTrilha(v); return false; } catch (e) { return e instanceof TypeError; } };
    chk('TR7', lancou('abc') && lancou('0') && lancou('-5') && lancou('1;DROP') && lancou('1'.repeat(20))
        && auditoria.cursorDaTrilha('') === undefined && auditoria.cursorDaTrilha(null) === undefined
        && auditoria.cursorDaTrilha('123') === '123',
        'cursor que nao e um id positivo de ate 19 digitos e pedido malformado (400); vazio e ausente');
  }
} finally {
  await emA(async () => { await dbt().cliente.deleteMany({ where: { nome: { startsWith: PREFIXO } } }); }).catch(() => {});
  await prisma.$disconnect();
  await pools.transacional.end();
  await pools.relatorio.end();
}

console.log();
if (falhas > 0) { console.log(`--- trilha paginada: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- trilha paginada (cursor por id, milissegundo compartilhado, RLS no cursor): ${feitas} verificacoes, 0 falhas`);
