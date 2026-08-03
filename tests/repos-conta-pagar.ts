// CONTA A PAGAR E PAGAMENTO, com banco e pela role SEM BYPASSRLS.
// Uso: bash tests/repos.sh
//
// O QUE `tests/repos-carteira.ts` JA COBRE, e por isso NAO se repete aqui: que o
// split provisiona as tres contas na mesma transacao da baixa, com os valores do
// `split_item` ao centavo (`K7h`-`K7l`). Aquilo e a ligacao APURACAO -> QUITACAO.
//
// Esta suite cobre a QUITACAO em si, e o assunto dela e um so:
//
//     depois de 03/08/2026 tem de ser IMPOSSIVEL pagar duas vezes o mesmo
//     repasse, e impossivel por CONSTRUCAO - nao por alguem conferir.
//
// Por isso quase toda verificacao aqui tenta VIOLAR alguma coisa e afirma que o
// banco recusou. Onde a aplicacao tambem recusa, as duas sao exercitadas: a da
// aplicacao existe pela MENSAGEM (o usuario precisa saber o que fazer), e a do
// banco existe porque a da aplicacao vale ate o dia em que um segundo caminho
// escrever na tabela.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as contaPagar from '../src/repos/conta_pagar.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const UFIN = process.env.TEST_USUARIO_FINANCEIRO!;
const UCOB = process.env.TEST_USUARIO_COBRANCA!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const como = (u: string, t = A) => <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: t, usuarioId: u }, () => f());
const emA = como(U);
const emAFin = como(UFIN);
const emACob = como(UCOB);
const emALei = como(ULEI);
const emB = como(U, B);

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

const novaConta = (n: string, valor: number) => contaPagar.criarManual({
  descricao: n, beneficiario_nome: 'Fornecedor de teste', valor_centavos: valor,
  competencia: dia(2031, 3, 1), vencimento: dia(2031, 4, 10),
});

// ---------------------------------------------------- P1 o vencimento do PRD 5.5
//
// Puro, e esta aqui e nao numa suite sem banco porque e a regra que o split usa
// para preencher a coluna - o `K7k` da carteira prende a outra ponta.
{
  const v = contaPagar.vencimentoPadrao(dia(2026, 7, 1));
  chk('P1a', v.getUTCFullYear() === 2026 && v.getUTCMonth() === 7 && v.getUTCDate() === 10,
      `competencia de julho vence em 10/08 - "dia 10 do mes seguinte" (PRD 5.5), contado da `
      + `COMPETENCIA e nao do caixa (veio ${v.toISOString().slice(0, 10)})`);

  const dez = contaPagar.vencimentoPadrao(dia(2026, 12, 1));
  chk('P1b', dez.getUTCFullYear() === 2027 && dez.getUTCMonth() === 0 && dez.getUTCDate() === 10,
      `dezembro vira JANEIRO do ano seguinte, e nao mes 13 (veio ${dez.toISOString().slice(0, 10)})`);
}

// ---------------------------------------------------- P2 o ciclo do pagamento
let contaCiclo: string;
{
  const c = await emA(() => novaConta('Aluguel de marco', 100_000));
  contaCiclo = c.id;
  chk('P2a', c.status === 'aberta' && c.valor_pago_centavos === 0 && c.beneficiario_tipo === 'outro',
      'a conta digitada a mao nasce ABERTA, com zero pago e beneficiario `outro` - repasse e '
      + 'comissao nascem do split e SO de la');

  await emA(() => contaPagar.registrarPagamento(contaCiclo, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 30_000, forma: 'pix',
    referencia_externa: 'E2E-TESTE-001',
  }));
  const p1 = await emA(() => contaPagar.porId(contaCiclo));
  chk('P2b', p1!.status === 'parcial' && p1!.valor_pago_centavos === 30_000,
      `pagamento parcial leva a conta a PARCIAL, e o valor pago e DERIVADO por gatilho, nunca `
      + `escrito pela aplicacao (status=${p1!.status}, pago=${p1!.valor_pago_centavos})`);

  await emA(() => contaPagar.registrarPagamento(contaCiclo, {
    data_pagamento: dia(2031, 4, 8), valor_centavos: 70_000, forma: 'ted',
  }));
  const p2 = await emA(() => contaPagar.porId(contaCiclo));
  chk('P2c', p2!.status === 'paga' && p2!.valor_pago_centavos === 100_000 && p2!.pagamento.length === 2,
      `o segundo pagamento fecha a conta: PAGA, 100.000 pagos, DOIS pagamentos registrados `
      + `(status=${p2!.status}, n=${p2!.pagamento.length})`);

  /*
   * A INVARIANTE QUE O GATILHO EXISTE PARA MANTER, conferida contra a fonte e
   * nao contra uma constante: a coluna derivada tem de ser a soma dos
   * pagamentos, sempre. Fixar "100.000" aqui provaria menos - provaria que o
   * numero que eu escrevi e o numero que eu escrevi.
   */
  const soma: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT coalesce(sum(valor_centavos),0)::int AS s FROM pagamento WHERE conta_pagar_id = $1::uuid`,
    contaCiclo));
  chk('P2d', soma[0].s === p2!.valor_pago_centavos,
      `valor_pago_centavos == SUM(pagamento.valor_centavos), conferido contra a tabela `
      + `(${soma[0].s} == ${p2!.valor_pago_centavos})`);
}

// ---------------------------------------------------- P3 nao se paga a mais
//
// O CORACAO DA Q-PAGAMENTO-01. As duas metades sao exercitadas de proposito: a
// da aplicacao existe pela mensagem, a do banco existe porque a da aplicacao
// vale ate alguem escrever por outro caminho.
{
  const e = await lancou(() => emA(() => contaPagar.registrarPagamento(contaCiclo, {
    data_pagamento: dia(2031, 4, 9), valor_centavos: 1, forma: 'pix',
  })));
  chk('P3a', e !== null && e.name === 'PagamentoExcedeSaldo' && /restam 0/.test(e.message),
      'a aplicacao recusa o centavo a mais numa conta ja paga, e a mensagem DIZ quanto resta - '
      + 'sem ela o usuario receberia "23514" e teria de adivinhar');

  // Agora POR FORA do repositorio, que e o caminho que a aplicacao nao guarda.
  const c = await emA(() => novaConta('Conta para o teto do banco', 50_000));
  await emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 50_000, forma: 'pix',
  }));
  const eBanco = await lancou(() => emA(() => db().$queryRawUnsafe(
    `INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
     VALUES ($1::uuid, $2::uuid, DATE '2031-04-09', 1, 'pix')`, A, c.id)));
  chk('P3b', eBanco !== null && /conta_pagar_nao_paga_demais|23514/.test(String(eBanco.message ?? eBanco)),
      'e o BANCO recusa o mesmo centavo por INSERT direto - "pagar duas vezes o mesmo repasse" '
      + 'deixa de ser possivel por construcao, e nao por disciplina');

  const dep = await emA(() => contaPagar.porId(c.id));
  chk('P3c', dep!.valor_pago_centavos === 50_000 && dep!.pagamento.length === 1,
      `e a recusa nao deixou meio pagamento gravado (pago=${dep!.valor_pago_centavos}, n=${dep!.pagamento.length})`);
}

// ---------------------------------------------------- P4 cancelamento
{
  const c = await emA(() => novaConta('Conta a cancelar', 20_000));
  await emA(() => contaPagar.cancelar(c.id));
  const dep = await emA(() => contaPagar.porId(c.id));
  chk('P4a', dep!.status === 'cancelada' && dep!.cancelada_em !== null,
      'cancelar deixa status e carimbo, e o CHECK `conta_pagar_cancelamento_coerente` amarra os dois');

  const e = await lancou(() => emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 9), valor_centavos: 1_000, forma: 'pix',
  })));
  chk('P4b', e !== null && /cancelada/.test(String(e.message ?? e)),
      'conta cancelada NAO recebe pagamento pela aplicacao');

  const eBanco = await lancou(() => emA(() => db().$queryRawUnsafe(
    `INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
     VALUES ($1::uuid, $2::uuid, DATE '2031-04-09', 1000, 'pix')`, A, c.id)));
  chk('P4c', eBanco !== null && /cancelada/.test(String(eBanco.message ?? eBanco)),
      'nem pelo INSERT direto - o gatilho recusa, porque nenhum CHECK enxerga as duas tabelas');

  // E o contrario: conta COM pagamento nao se cancela. Cancelar deixaria um
  // pagamento apontando para um titulo que "nao existe" - a R46 na fatura.
  const paga = await emA(() => novaConta('Conta com pagamento', 10_000));
  await emA(() => contaPagar.registrarPagamento(paga.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 5_000, forma: 'dinheiro',
  }));
  const e2 = await lancou(() => emA(() => contaPagar.cancelar(paga.id)));
  chk('P4d', e2 !== null && e2.name === 'ContaJaPaga',
      'conta com pagamento registrado NAO se cancela - o caminho de desfazer e o estorno, '
      + 'e ele tem decisao propria (Q-ESTORNO-01)');
}

// ---------------------------------------------------- P5 a referencia externa
{
  const c = await emA(() => novaConta('Conta da referencia', 9_000));
  const e = await lancou(() => emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 1_000, forma: 'pix',
    referencia_externa: 'E2E-TESTE-001',      // ja usada em P2
  })));
  chk('P5a', e !== null && /23505|unique|referencia/i.test(String(e.message ?? e)),
      'o mesmo comprovante nao entra duas vezes - `pagamento_referencia_unica`, que e o que '
      + 'impede o lancamento em duplicidade do MESMO Pix');

  // E a ausencia nao colide com a ausencia: dinheiro e compensacao nao tem
  // referencia, e dois pagamentos em dinheiro precisam poder coexistir.
  await emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 1_000, forma: 'dinheiro',
  }));
  const dois = await lancou(() => emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 6), valor_centavos: 1_000, forma: 'compensacao',
  })));
  chk('P5b', dois === null,
      'dois pagamentos SEM referencia coexistem - o indice e parcial com predicado IS NOT NULL '
      + '(CAT-9), entao NULL nao colide com NULL');
}

// ---------------------------------------------------- P6 a matriz do PRD 3
//
// A COLUNA `Corporativo`, que ate 03/08 nao tinha entidade para governar.
// `cobranca` tem traco nela, e traco significa NEM LE.
{
  const c = await emA(() => novaConta('Conta da matriz', 7_000));

  const leu = await lancou(() => emACob(() => contaPagar.listar({})));
  chk('P6a', leu !== null && /ler_corporativo|permiss|papel/i.test(String(leu?.message ?? leu)),
      'papel `cobranca` NAO LE contas a pagar - a matriz do PRD 3 lhe da traco em Corporativo, '
      + 'e usar `ler` aqui lhe daria a lista de quanto a empresa deve a cada dono de usina');

  const escreveu = await lancou(() => emACob(() => novaConta('Nao deve entrar', 1_000)));
  chk('P6b', escreveu !== null, 'nem escreve');

  const fin = await lancou(() => emAFin(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 1_000, forma: 'pix',
  })));
  chk('P6c', fin === null,
      'e `financeiro` PAGA - a mesma matriz lhe da TOTAL em Corporativo, e e o unico papel '
      + 'alem de admin que a coluna contempla');

  const lei = await lancou(() => emALei(() => contaPagar.listar({})));
  chk('P6d', lei === null, '`leitura` le, e nao escreve - conferido na linha seguinte');
  const leiEscreve = await lancou(() => emALei(() => novaConta('Nao deve entrar', 1_000)));
  chk('P6e', leiEscreve !== null, 'e `leitura` NAO escreve');
}

// ---------------------------------------------------- P7 isolamento e append-only
{
  const c = await emA(() => novaConta('Conta do tenant A', 4_000));

  const doB = await emB(() => contaPagar.porId(c.id));
  chk('P7a', doB === null,
      'conta do tenant A e invisivel ao B - RLS FORCE, pela role sem BYPASSRLS');

  const eFk = await lancou(() => emB(() => db().$queryRawUnsafe(
    `INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
     VALUES ($1::uuid, $2::uuid, DATE '2031-04-09', 100, 'pix')`, B, c.id)));
  chk('P7b', eFk !== null,
      'e o B nao consegue pagar a conta do A nem por INSERT direto - a FK composta '
      + '`pagamento_conta_fk` nao atravessa tenant (regra 2)');

  // Append-only: o que nao se apaga aqui e a PROVA de que alguem foi pago.
  await emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 1_000, forma: 'pix',
  }));
  const eDel = await lancou(() => emA(() => db().$queryRawUnsafe(
    `DELETE FROM pagamento WHERE conta_pagar_id = $1::uuid`, c.id)));
  chk('P7c', eDel !== null && /permission|denied|negad/i.test(String(eDel.message ?? eDel)),
      'DELETE em `pagamento` e negado por GRANT - um pagamento apagavel por quem pagou nao e '
      + 'comprovante');

  const eDelC = await lancou(() => emA(() => db().$queryRawUnsafe(
    `DELETE FROM conta_pagar WHERE id = $1::uuid`, c.id)));
  chk('P7d', eDelC !== null && /permission|denied|negad/i.test(String(eDelC.message ?? eDelC)),
      'e DELETE em `conta_pagar` idem');
}

// ---------------------------------------------------- P8 a auditoria da regra 9
{
  const c = await emA(() => novaConta('Conta auditada', 3_000));
  await emA(() => contaPagar.registrarPagamento(c.id, {
    data_pagamento: dia(2031, 4, 5), valor_centavos: 3_000, forma: 'pix',
  }));
  /*
   * `auditoria.registro_id` e TEXT e nao uuid, e `operacao` e char(1) - 'I',
   * 'U', 'D'. A primeira versao desta verificacao comparava `registro_id =
   * $1::uuid` e morria com 42883 antes de afirmar nada. Vale como nota porque a
   * forma da trilha nao esta obvia em lugar nenhum do codigo da aplicacao: ela
   * e da migration 1 e so o SQL a ve.
   */
  const linhas: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT tabela, operacao FROM auditoria
      WHERE (tabela = 'conta_pagar' AND registro_id = $1)
         OR (tabela = 'pagamento' AND depois->>'conta_pagar_id' = $1)`, c.id));
  const tem = (t: string, o: string) => linhas.some((l) => l.tabela === t && l.operacao === o);
  chk('P8a', tem('conta_pagar', 'I') && tem('pagamento', 'I') && tem('conta_pagar', 'U'),
      `regra 9: a conta (I), o pagamento (I) e o UPDATE do gatilho (U) estao na trilha `
      + `(${linhas.length} linhas)`);

  /*
   * E o UPDATE da trilha e o do GATILHO, nao um da aplicacao - a aplicacao nunca
   * escreve `valor_pago_centavos`. Se um dia alguem a fizer escrever, esta
   * verificacao continua verde e a de cima tambem; o que acusaria e o `P2d`,
   * que confere a coluna contra a SOMA. Registrado para nao parecer cobertura
   * que nao e.
   */
  const u = linhas.filter((l) => l.tabela === 'conta_pagar' && l.operacao === 'U');
  chk('P8b', u.length === 1,
      `um unico UPDATE na conta - o do gatilho, disparado pelo pagamento (${u.length})`);
}

// ---------------------------------------------------- P9 o plano gerencial nasce vazio
{
  const cats = await emA(() => contaPagar.listarCategorias());
  chk('P9a', Array.isArray(cats),
      `categoria e centro de custo existem como tabela e nascem VAZIAS - semear um plano de `
      + `contas na migration decidiria o DRE de todo tenant futuro (${cats.length} hoje)`);

  const nova = await emA(() => contaPagar.criarCategoria('Repasse a terceiros'));
  const e = await lancou(() => emA(() => contaPagar.criarCategoria('Repasse a terceiros')));
  chk('P9b', nova.id.length === 36 && e !== null,
      'e o nome e unico por tenant - duas categorias com o mesmo nome dariam dois totais para '
      + 'a mesma linha do DRE');
}

console.log(`\n${falhas === 0 ? 'contas a pagar: todas as verificacoes passaram'
                              : `contas a pagar: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
