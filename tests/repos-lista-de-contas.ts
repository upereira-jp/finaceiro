// A LISTA DE CONTAS A PAGAR NO SERVIDOR (`repos/conta_pagar.ts`, `pagina`).
// Com banco: roda em tests/repos.sh, pela role SEM BYPASSRLS.
//
// Ate 03/10/2026 a tela buscava, filtrava, ordenava e somava no navegador, sobre
// as 500 primeiras por vencimento. Agora o SQL faz isso, e esta suite prova que
// ele faz O MESMO que a tela fazia:
//
//   - cada uma das seis ordens, nos dois sentidos, igual a uma ordenacao de
//     referencia escrita aqui com as regras da tela (nome do beneficiario, saldo
//     nunca negativo, peso da situacao) e o desempate da lista antiga;
//   - a busca sem acento («joao» acha «João») e com `%` literal («50%» nao acha
//     «500 caixas» — o controle negativo do ESCAPE);
//   - os blocos colados um no outro = a lista inteira;
//   - os totais = a soma em JS da tabela inteira do tenant;
//   - «vencida» no dia de Goiania, com a borda: venceu ontem e vencida, vence
//     hoje nao;
//   - a RLS: o tenant B nao ve as contas do A.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as contaPagar from '../src/repos/conta_pagar.ts';
import { PESO_DA_SITUACAO, normalizarBusca, ORDENS_DA_LISTA, type OrdemDaLista } from '../src/dominio/lista-de-contas.ts';

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
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

/** O dia de Goiania hoje, como o servidor calcula — `en-CA` da AAAA-MM-DD. */
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const diaMais = (n: number) => {
  const d = new Date(`${HOJE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const iso = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

const TOKEN = `lista-${Date.now()}`;

type Item = Awaited<ReturnType<typeof contaPagar.pagina>>['itens'][number];
const nome = (c: Item) => c.dono_usina?.nome ?? c.originador?.nome ?? c.beneficiario_nome ?? '(sem nome)';
const saldo = (c: Item) => Math.max(0, c.valor_centavos - c.valor_pago_centavos);
const vencida = (c: Item) => (c.status === 'aberta' || c.status === 'parcial') && iso(c.vencimento) < HOJE;
const peso = (c: Item) => (vencida(c) ? PESO_DA_SITUACAO.vencida : PESO_DA_SITUACAO[c.status as 'aberta']);

/** A ORDENACAO DE REFERENCIA: a chave da tela, e o desempate da lista antiga
 *  (vencimento, criacao e id, sempre crescentes). */
const CHAVE: Record<OrdemDaLista, (c: Item) => string | number> = {
  vencimento: (c) => iso(c.vencimento),
  beneficiario: (c) => normalizarBusca(nome(c)),
  descricao: (c) => normalizarBusca(c.descricao),
  valor: (c) => c.valor_centavos,
  saldo,
  situacao: peso,
};
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
function referencia(itens: Item[], ordem: OrdemDaLista, desc: boolean): string[] {
  return [...itens].sort((a, b) => {
    const p = cmp(CHAVE[ordem](a), CHAVE[ordem](b));
    if (p !== 0) return desc ? -p : p;
    return cmp(iso(a.vencimento), iso(b.vencimento))
      || cmp(a.criado_em.getTime(), b.criado_em.getTime())
      || cmp(a.id, b.id);
  }).map((c) => c.id);
}

try {
  // --------------------------------------------------------------- o cenario
  /*
   * SETE CONTAS, uma letra inicial por nome (a..g) — a ordem por nome nao
   * depende do collation do banco, e o acento na primeira letra prova o
   * `translate`. As descricoes vao na ordem INVERSA dos nomes, para a ordem por
   * descricao nao coincidir com a por nome. 6 e 7 empatam em valor E vencimento:
   * o desempate pela criacao e o que decide.
   */
  const novas: Array<{ nome: string; desc: string; dias: number; valor: number; pago?: number; cancelar?: boolean }> = [
    { nome: 'Álvaro Aço', desc: 'g', dias: -1, valor: 30_000 },                 // vencida (ontem)
    { nome: 'bruno Silva', desc: 'f', dias: 0, valor: 10_000 },                 // vence HOJE: nao vencida
    { nome: 'Célia Ação', desc: 'e', dias: 1, valor: 50_000, pago: 20_000 },    // parcial
    { nome: 'davi', desc: 'd', dias: 2, valor: 20_000, pago: 20_000 },          // paga
    { nome: 'Érica João', desc: 'c', dias: 3, valor: 40_000, cancelar: true },  // cancelada
    { nome: 'fábio', desc: 'b reembolso 50% do frete', dias: 4, valor: 5_000 },
    { nome: 'gil', desc: 'a 500 caixas', dias: 4, valor: 5_000 },
  ];
  const ids: string[] = [];
  for (const n of novas) {
    const c = await emA(() => contaPagar.criarManual({
      descricao: `${TOKEN} ${n.desc}`, beneficiario_nome: n.nome, valor_centavos: n.valor,
      competencia: new Date(Date.UTC(diaMais(n.dias).getUTCFullYear(), diaMais(n.dias).getUTCMonth(), 1)),
      vencimento: diaMais(n.dias),
    }));
    if (n.pago) {
      await emA(() => contaPagar.registrarPagamento(c.id, {
        data_pagamento: diaMais(0), valor_centavos: n.pago!, forma: 'pix',
      }));
    }
    if (n.cancelar) await emA(() => contaPagar.cancelar(c.id));
    ids.push(c.id);
  }

  const minhas = await emA(() => contaPagar.pagina({ busca: TOKEN, limite: 500 }));
  chk('LS1', minhas.total === 7 && minhas.itens.length === 7 && minhas.hoje === HOJE,
      `a busca pelo marcador acha as 7 do cenario (${minhas.total}), e o «hoje» do servidor e o dia de Goiania (${minhas.hoje})`);
  const porId = new Map(minhas.itens.map((c) => [c.id, c]));
  chk('LS1b', porId.get(ids[2])!.status === 'parcial' && porId.get(ids[3])!.status === 'paga'
          && porId.get(ids[4])!.status === 'cancelada' && (porId.get(ids[2])!.pagamento?.length ?? 0) === 1,
      'o cenario esta montado: parcial, paga e cancelada, e o pagamento vem junto da conta (as relacoes do `include`)');

  // ----------------------------------------------- as seis ordens, nos dois sentidos
  for (const ordem of ORDENS_DA_LISTA) {
    for (const desc of [false, true]) {
      const r = await emA(() => contaPagar.pagina({ busca: TOKEN, ordem, desc, limite: 500 }));
      const esperado = referencia(minhas.itens, ordem, desc);
      const veio = r.itens.map((c) => c.id);
      chk(`LS2-${ordem.slice(0, 4)}${desc ? 'd' : 'a'}`, veio.join(',') === esperado.join(','),
          `ordem ${ordem} ${desc ? 'decrescente' : 'crescente'}: o SQL devolve exatamente a ordem que a tela fazia `
          + `(${veio.map((id) => ids.indexOf(id) + 1).join(' ')})`);
    }
  }
  {
    const r = await emA(() => contaPagar.pagina({ busca: TOKEN, ordem: 'situacao', limite: 500 }));
    chk('LS3', r.itens[0].id === ids[0] && r.itens[1].id === ids[1],
        'por situacao, a que venceu ONTEM vem primeiro (vencida) e a que vence HOJE logo depois, como em aberto — '
        + 'a borda e o dia de Goiania, e nao o UTC do banco');
  }

  // ------------------------------------------------------------------ a busca
  {
    const r = await emA(() => contaPagar.pagina({ busca: 'joao', limite: 500 }));
    chk('LS4', r.itens.some((c) => c.id === ids[4])
          && r.itens.every((c) => normalizarBusca(nome(c)).includes('joao') || normalizarBusca(c.descricao).includes('joao')),
        `«joao» acha «Érica João» — a busca sem acento da tela, agora no SQL (${r.total} achada(s))`);
    const r2 = await emA(() => contaPagar.pagina({ busca: 'ÇÃO', limite: 500 }));
    chk('LS4b', r2.itens.some((c) => c.id === ids[2]) && !r2.itens.some((c) => c.id === ids[0]),
        '«ÇÃO» acha «Célia Ação» e nao «Álvaro Aço» — acento e maiuscula tirados dos DOIS lados');
    const r3 = await emA(() => contaPagar.pagina({ busca: '50%', limite: 500 }));
    chk('LS4c', r3.itens.some((c) => c.id === ids[5]) && !r3.itens.some((c) => c.id === ids[6]),
        'CONTROLE DO ESCAPE: «50%» acha «reembolso 50% do frete» e NAO «500 caixas» — sem o escape, o % do termo '
        + 'viraria curinga e as duas casariam');
  }

  // ----------------------------------------------------------------- o filtro
  {
    const paga = await emA(() => contaPagar.pagina({ busca: TOKEN, situacao: 'paga' }));
    const parcial = await emA(() => contaPagar.pagina({ busca: TOKEN, situacao: 'parcial' }));
    chk('LS5', paga.total === 1 && paga.itens[0].id === ids[3] && parcial.total === 1 && parcial.itens[0].id === ids[2],
        'o filtro de situacao recorta no servidor, e se combina com a busca');
  }

  // ------------------------------------------------------------------ os blocos
  {
    const inteira = await emA(() => contaPagar.pagina({ busca: TOKEN, ordem: 'saldo', desc: true, limite: 500 }));
    const colados: string[] = [];
    for (let inicio = 0; inicio < 7; inicio += 2) {
      const b = await emA(() => contaPagar.pagina({ busca: TOKEN, ordem: 'saldo', desc: true, inicio, limite: 2 }));
      if (b.total !== 7 || b.inicio !== inicio || b.limite !== 2) throw new Error('bloco com cabecalho errado');
      colados.push(...b.itens.map((c) => c.id));
    }
    chk('LS6', colados.join(',') === inteira.itens.map((c) => c.id).join(','),
        'blocos de 2 colados um no outro = a lista inteira, na mesma ordem — sem repetir nem pular (com empate '
        + 'de saldo entre 6 e 7, decidido pelo desempate estavel)');
  }

  // ------------------------------------------------------------------ os totais
  {
    const tudo = await emA(() => contaPagar.pagina({ limite: 500 }));
    chk('LS7', tudo.total === tudo.total_geral && tudo.total_geral === tudo.itens.length && tudo.total_geral < 500,
        `sem busca nem filtro, total = total geral = o que veio (${tudo.total_geral} contas no tenant A)`);
    const abertas = tudo.itens.filter((c) => c.status === 'aberta' || c.status === 'parcial');
    const vencidas = abertas.filter(vencida);
    const soma = (l: Item[]) => l.reduce((a, c) => a + saldo(c), 0);
    chk('LS7b', tudo.totais.em_aberto.qtd === abertas.length && tudo.totais.em_aberto.saldo_centavos === soma(abertas)
          && tudo.totais.vencidas.qtd === vencidas.length && tudo.totais.vencidas.saldo_centavos === soma(vencidas),
        `os totais do servidor = a soma em JS da tabela inteira: em aberto ${abertas.length} / ${soma(abertas)} centavos, `
        + `vencidas ${vencidas.length} / ${soma(vencidas)}`);
    const comBusca = await emA(() => contaPagar.pagina({ busca: TOKEN }));
    chk('LS7c', comBusca.totais.em_aberto.qtd === tudo.totais.em_aberto.qtd
          && comBusca.totais.vencidas.saldo_centavos === tudo.totais.vencidas.saldo_centavos
          && comBusca.total_geral === tudo.total_geral,
        'os totais NAO encolhem com a busca: o aviso de vencidas e o saldo em aberto sao da empresa, nao do recorte');
    chk('LS7d', vencidas.some((c) => c.id === ids[0]) && !vencidas.some((c) => c.id === ids[1]),
        'a borda: venceu ontem entra nas vencidas, vence hoje nao');
  }

  // ------------------------------------------------------------------- a RLS
  {
    const noB = await emB(() => contaPagar.pagina({ busca: TOKEN, limite: 500 }));
    chk('LS8', noB.total === 0 && noB.itens.length === 0,
        'o tenant B nao acha as contas do A — o SQL proprio da lista passa pela RLS como o Prisma passava');
  }
} finally {
  await prisma.$disconnect();
  await pools.transacional.end();
  await pools.relatorio.end();
}

console.log();
if (falhas > 0) { console.log(`--- lista de contas a pagar: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- lista de contas a pagar (ordem, busca, blocos e totais no servidor): ${feitas} verificacoes, 0 falhas`);
