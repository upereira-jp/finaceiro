// Suite do repositorio das DESPESAS DA EMPRESA (`src/repos/despesa.ts`) — a
// planilha `G3Solar_Financeiro.xlsx` dentro do sistema (02/10/2026).
//
// As invariantes de banco da migration 42 (CHECK, FK, GRANT) estao em
// `tests/despesas.sql`. Aqui o que se prova e o COMPORTAMENTO: o que a tela
// pede e o que o repositorio faz com a serie, as parcelas e a baixa.
//
// Uso: via tests/repos.sh (precisa de PostgreSQL com a fixture de la).

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as despesa from '../src/repos/despesa.ts';
import * as contaPagar from '../src/repos/conta_pagar.ts';
import * as fornecedor from '../src/repos/fornecedor.ts';
import { dbt } from '../src/db/tipado.ts';
import pg from 'pg';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const como = (u: string, t = A) => <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: t, usuarioId: u }, () => f());
const emA = como(U);
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
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- o plano da planilha
{
  const r1 = await emA(() => despesa.comecarPelaPlanilha());
  const r2 = await emA(() => despesa.comecarPelaPlanilha());
  const cad = await emA(() => despesa.cadastros());
  chk('E1', r1.categorias_criadas === 12 && r1.origens_criadas === 3 && r2.categorias_criadas === 0 && r2.origens_criadas === 0,
      'começar pelo plano da planilha grava os 12 itens e as 3 origens (Conta PJ e os dois sócios), e a segunda vez não duplica nada');
  chk('E1g', cad.origens.filter((o) => o.tipo === 'socio').map((o) => o.nome).join() === 'Vinicius Leal,Renata Estevam',
      'os sócios são os que o dono nomeou em 02/10/2026, com o tipo sócio');
  /* Só os itens DA PLANILHA, na ordem relativa: no CI o tenant A já chega com a
     categoria que a suite de contas a pagar criou antes (02/10: esta linha supunha
     plano vazio e caiu no `fin_repos` compartilhado). */
  const daPlanilha = cad.categorias.filter((c) => (despesa.PLANO_DA_PLANILHA as readonly string[]).includes(c.nome));
  chk('E1b', daPlanilha.map((c) => c.nome).join('|') === despesa.PLANO_DA_PLANILHA.join('|'),
      'na ordem da planilha: Administrativas primeiro, Outras por último');
  const ids = cad.categorias.map((c) => c.id);
  await emA(() => despesa.ordenarCategorias([ids[1], ids[0], ...ids.slice(2)]));
  const depois = await emA(() => despesa.cadastros());
  chk('E1c', depois.categorias[0]!.id === ids[1], 'reordenar troca a ordem que Painel e Projeção leem');
  const maior = Math.max(...depois.categorias.map((c) => c.ordem));
  const nova = await emA(() => despesa.criarCategoria({ nome: 'Seguros' }));
  chk('E1d', nova.ordem === maior + 1, `item novo entra no fim da ordem (${nova.ordem} depois de ${maior})`);
  const deB = await emB(() => despesa.cadastros());
  chk('E1e', !deB.categorias.some((c) => ids.includes(c.id)), 'o plano do tenant A não aparece no B');
  const e = await lancou(() => emALei(() => despesa.comecarPelaPlanilha()));
  chk('E1f', e !== null, 'quem só lê não grava o plano');
}

const { categorias, origens } = await emA(() => despesa.cadastros());
const ADM = categorias.find((c) => c.nome === 'Despesas Administrativas')!.id;
const PJ = origens.find((o) => o.nome === 'Conta PJ G3 Solar')!.id;
const VINICIUS = origens.find((o) => o.nome === 'Vinicius Leal')!.id;
const RENATA = origens.find((o) => o.nome === 'Renata Estevam')!.id;

// ---------------------------------------------------------------- lançar
{
  const [aluguel] = await emA(() => despesa.lancar({
    descricao: 'Aluguel da sala comercial', fornecedor: 'Imobiliária', valor_centavos: 431900,
    competencia: dia(2026, 10, 7), vencimento: dia(2026, 10, 10), recorrencia: 'mensal',
    categoria_id: ADM, natureza: 'fixa', forma_prevista: 'boleto', origem_pagamento_id: PJ,
  }));
  chk('E2', !!aluguel!.serie_id && iso(aluguel!.competencia) === '2026-10-01' && aluguel!.recorrencia === 'mensal',
      'mensal nasce com série e a competência vira o primeiro dia do mês');

  const proximo = await emA(() => despesa.lancarProximo(aluguel!.serie_id!, {}));
  chk('E3', iso(proximo.competencia) === '2026-11-01' && iso(proximo.vencimento) === '2026-11-10'
        && proximo.valor_centavos === 431900 && proximo.serie_id === aluguel!.serie_id && proximo.categoria_id === ADM,
      '«lançar o próximo» copia o último título um mês adiante, com o mesmo plano e a mesma série');
  const dobrado = await lancou(() => emA(() => despesa.lancarProximo(aluguel!.serie_id!, { valor_centavos: 450000 })));
  chk('E3b', dobrado === null, 'o seguinte (dezembro) também entra, com valor ajustado');
  const lista = await emA(() => despesa.listar());
  const daSerie = lista.linhas.filter((l) => l.serie_id === aluguel!.serie_id);
  chk('E3c', daSerie.length === 3 && daSerie.at(-1)!.valor_centavos === 450000, 'a série tem 3 títulos, o último com o valor novo');

  await emA(() => despesa.encerrarRecorrencia(aluguel!.serie_id!, dia(2026, 12, 20)));
  const fim = await lancou(() => emA(() => despesa.lancarProximo(aluguel!.serie_id!, {})));
  chk('E4', fim !== null && /terminou/.test(String(fim.message)),
      'com «recorrente até» dezembro, não há janeiro para lançar — e a frase diz por quê');
  const depois = await emA(() => despesa.listar());
  chk('E4b', depois.linhas.filter((l) => l.serie_id === aluguel!.serie_id).every((l) => iso(l.recorrente_ate!) === '2026-12-01'),
      'o fim vale para a série inteira, guardado como o mês');
  const antes = await lancou(() => emA(() => despesa.encerrarRecorrencia(aluguel!.serie_id!, dia(2026, 9, 1))));
  chk('E4c', antes !== null, 'o fim não pode ser antes do último título lançado');
}

// ---------------------------------------------------------------- parcelada
{
  const parcelas = await emA(() => despesa.lancar({
    descricao: 'Notebook', fornecedor: 'Dell', valor_centavos: 82500, competencia: dia(2027, 1, 1),
    vencimento: dia(2027, 1, 31), recorrencia: 'parcelada', parcelas: 3,
  }));
  chk('E5', parcelas.length === 3 && parcelas.every((p) => p.serie_id === parcelas[0]!.serie_id)
        && parcelas.map((p) => `${p.parcela_numero}/${p.parcela_total}`).join() === '1/3,2/3,3/3',
      'parcelada grava todas as parcelas de uma vez, na mesma série, numeradas');
  chk('E5b', parcelas.map((p) => iso(p.vencimento)).join() === '2027-01-31,2027-02-28,2027-03-31',
      'o vencimento anda um mês sem transbordar: 31/01 → 28/02 → 31/03');
  const semProximo = await lancou(() => emA(() => despesa.lancarProximo(parcelas[0]!.serie_id!, {})));
  chk('E5c', semProximo !== null, 'parcelada não tem «próximo»: as parcelas já estão todas lançadas');
  const umaSo = await lancou(() => emA(() => despesa.lancar({
    descricao: 'X', fornecedor: 'Y', valor_centavos: 100, competencia: dia(2027, 1, 1), vencimento: dia(2027, 1, 5),
    recorrencia: 'parcelada', parcelas: 1,
  })));
  chk('E5d', umaSo !== null, 'parcelada de 1 parcela é recusada antes do banco');
}

// ---------------------------------------------------------------- editar
{
  const [c] = await emA(() => despesa.lancar({
    descricao: 'Contador', fornecedor: 'Contabilidade', valor_centavos: 180000,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 25),
  }));
  chk('E6', c!.serie_id === null && c!.recorrencia === 'avulsa', 'avulsa nasce sem série');
  await emA(() => despesa.editar(c!.id, { recorrencia: 'mensal', categoria_id: ADM, comprovante_url: 'https://x.example/nf' }));
  const l1 = (await emA(() => despesa.listar())).linhas.find((l) => l.id === c!.id)!;
  chk('E6b', l1.recorrencia === 'mensal' && !!l1.serie_id && l1.categoria_id === ADM,
      'virar mensal na edição cria a série');
  const link = await lancou(() => emA(() => despesa.editar(c!.id, { comprovante_url: 'C:\\nf.pdf' })));
  chk('E6c', link !== null && link.status === 422, 'comprovante que não é link volta 422 com a frase, antes do CHECK');

  await emA(() => contaPagar.registrarPagamento(c!.id, {
    data_pagamento: dia(2026, 10, 27), valor_centavos: 180000, acrescimo_centavos: 3600, forma: 'pix', origem_pagamento_id: PJ,
  }));
  const l2 = (await emA(() => despesa.listar())).linhas.find((l) => l.id === c!.id)!;
  chk('E7', l2.status === 'paga' && l2.valor_pago_centavos === 180000 && l2.pagamento[0]!.acrescimo_centavos === 3600,
      'baixa com juros: o título fecha no valor dele e os juros ficam no pagamento');
  const abaixo = await lancou(() => emA(() => despesa.editar(c!.id, { valor_centavos: 100000 })));
  chk('E7b', abaixo !== null, 'o valor não desce abaixo do que já foi pago');
  const desc = await lancou(() => emA(() => contaPagar.registrarPagamento(c!.id, {
    data_pagamento: dia(2026, 10, 27), valor_centavos: 1, desconto_centavos: 2, forma: 'pix',
  })));
  chk('E7c', desc !== null, 'desconto maior que o abatido é recusado');
}

// ---------------------------------------------------------------- o socio que pagou do bolso
{
  const [net] = await emA(() => despesa.lancar({
    descricao: 'Internet fibra', fornecedor: 'Vivo', valor_centavos: 34990,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 2),
  }));
  const pg = await emA(() => contaPagar.registrarPagamento(net!.id, {
    data_pagamento: dia(2026, 10, 3), valor_centavos: 34990, acrescimo_centavos: 1000, forma: 'pix', origem_pagamento_id: VINICIUS,
  }));
  const todas = (await emA(() => despesa.listar())).linhas;
  const divida = todas.find((l) => l.reembolso_de_pagamento_id === pg.id);
  chk('E9', !!divida && divida.valor_centavos === 35990 && divida.beneficiario_nome === 'Vinicius Leal'
        && iso(divida.vencimento) === '2026-10-03' && divida.status === 'aberta',
      'pago do bolso do Vinicius: nasce a dívida da empresa com ele, no que saiu do bolso (34990 + 1000 de juros), devida desde o dia');
  chk('E9b', todas.find((l) => l.id === net!.id)!.status === 'paga', 'e a despesa em si fica paga');

  const deOutroSocio = await lancou(() => emA(() => contaPagar.registrarPagamento(divida!.id, {
    data_pagamento: dia(2026, 10, 10), valor_centavos: 35990, forma: 'pix', origem_pagamento_id: RENATA,
  })));
  chk('E9c', deOutroSocio !== null && deOutroSocio.status === 422, 'o reembolso não se paga do bolso de outro sócio');
  const mudarValor = await lancou(() => emA(() => despesa.editar(divida!.id, { valor_centavos: 1 })));
  chk('E9d', mudarValor !== null && mudarValor.status === 422, 'o valor do reembolso não se edita: é o que saiu do bolso');

  await emA(() => contaPagar.registrarPagamento(divida!.id, {
    data_pagamento: dia(2026, 10, 10), valor_centavos: 35990, forma: 'ted', origem_pagamento_id: PJ,
  }));
  const depois = (await emA(() => despesa.listar())).linhas;
  chk('E9e', depois.find((l) => l.id === divida!.id)!.status === 'paga'
        && depois.filter((l) => l.reembolso_de_pagamento_id !== null).length === 1,
      'reembolsado pela Conta PJ: a dívida fecha, e pagar da conta da empresa não cria dívida nenhuma');
}

// ================================================================ 06/10/2026 — etapa 1 do controle total
// (PLANO-empresa-controle-total-2026-10-06, migration 44). As lacunas da planilha que
// mudavam número (1, 3, 4, 5, 6 e 14) e o chão: origem com banco, plano em dois
// níveis, centros de custo.

/** O dia de Goiânia agora, como o relógio da parede de quem opera. */
const hojeDeGoiania = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// ---------------------------------------------------------------- E20 o «hoje» é o de Goiânia
{
  /* A sessão do banco pode estar em qualquer fuso. Em UTC−12 e em UTC+14 o
     `current_date` é OUTRO dia que o de Goiânia em, ao menos, um dos dois a
     qualquer hora (−12 erra das 00h às 9h de Goiânia, +14 das 7h à meia-noite):
     o E20b prova que este teste enxergaria o `current_date`. */
  const antes = hojeDeGoiania();
  const vistos: Array<{ zona: string; hoje: string; current_date: string }> = [];
  for (const zona of ['Etc/GMT+12', 'Pacific/Kiritimati']) {
    vistos.push(await emA(async () => {
      await dbt().$executeRawUnsafe(`SET LOCAL TIME ZONE '${zona}'`);
      const l = await despesa.listar(1);
      const [{ cd }] = await dbt().$queryRawUnsafe<Array<{ cd: string }>>('SELECT current_date::text AS cd');
      return { zona, hoje: l.hoje, current_date: cd };
    }));
  }
  const depois = hojeDeGoiania();
  const certo = (d: string) => d === antes || d === depois;
  chk('E20', vistos.every((v) => certo(v.hoje)),
      `o «hoje» de Despesas é o dia de Goiânia (${antes}) com a sessão em UTC−12 e em UTC+14: ${vistos.map((v) => v.hoje).join(', ')}`);
  chk('E20b', vistos.some((v) => !certo(v.current_date)),
      `controle: o current_date dessas sessões (${vistos.map((v) => v.current_date).join(', ')}) erra o dia em ao menos uma — o E20 distingue os dois`);
}

// ---------------------------------------------------------------- E21 o fornecedor é opcional, e o do cadastro manda no nome
{
  const [sem] = await emA(() => despesa.lancar({
    descricao: 'Aluguel da sala comercial (como na planilha)', valor_centavos: 431900,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 10), recorrencia: 'mensal',
  }));
  chk('E21', !!sem && sem.beneficiario_nome === null && sem.fornecedor_id === null,
      'a despesa entra sem fornecedor, como o único lançamento real da planilha (lacuna 4)');
  const f = await emA(() => fornecedor.criar({ nome: 'Imobiliária Central', documento: '11.222.333/0001-81' }));
  const [com] = await emA(() => despesa.lancar({
    descricao: 'Condomínio', fornecedor: 'Imob. Central', fornecedor_id: f.id, valor_centavos: 65000,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 12),
  }));
  chk('E21b', com!.fornecedor_id === f.id && com!.beneficiario_nome === 'Imobiliária Central',
      'com o fornecedor do cadastro, grava o vínculo e o nome DO CADASTRO (o apelido digitado não vence)');
}

// ---------------------------------------------------------------- E22 parcelamento já em andamento
{
  const parcelas = await emA(() => despesa.lancar({
    descricao: 'Ar-condicionado', fornecedor: 'Loja', valor_centavos: 39900, competencia: dia(2026, 11, 1),
    vencimento: dia(2026, 11, 5), recorrencia: 'parcelada', parcelas: 10, parcela_inicial: 4,
  }));
  chk('E22', parcelas.length === 7
        && parcelas.map((p) => p.parcela_numero).join() === '4,5,6,7,8,9,10'
        && parcelas.every((p) => p.parcela_total === 10 && p.serie_id === parcelas[0]!.serie_id)
        && iso(parcelas[0]!.vencimento) === '2026-11-05' && iso(parcelas.at(-1)!.vencimento) === '2027-05-05',
      'na 4ª de 10: entram as parcelas 4 a 10, a 4ª no vencimento informado e a 10ª seis meses depois (lacuna 5)');
  const fora = await lancou(() => emA(() => despesa.lancar({
    descricao: 'X', valor_centavos: 100, competencia: dia(2026, 11, 1), vencimento: dia(2026, 11, 5),
    recorrencia: 'parcelada', parcelas: 10, parcela_inicial: 11,
  })));
  chk('E22b', fora !== null && fora.status === 422, 'começar na 11ª de 10 é recusado com a frase, antes do banco');
}

// ---------------------------------------------------------------- E23 «recorrente até» pelo VENCIMENTO
{
  /* Competência de setembro, vence em 10 de outubro, repete até NOVEMBRO. Pela
     planilha (coluna W contra o mês do vencimento) há outubro e novembro e acabou;
     pela competência haveria dezembro também. */
  const [m] = await emA(() => despesa.lancar({
    descricao: 'Software de gestão', fornecedor: 'SaaS', valor_centavos: 29900,
    competencia: dia(2026, 9, 1), vencimento: dia(2026, 10, 10), recorrencia: 'mensal', recorrente_ate: dia(2026, 11, 1),
  }));
  const nov = await lancou(() => emA(() => despesa.lancarProximo(m!.serie_id!, {})));
  const dez = await lancou(() => emA(() => despesa.lancarProximo(m!.serie_id!, {})));
  chk('E23', nov === null && dez !== null && /terminou/.test(String(dez.message)),
      'repete até novembro: o de novembro entra e o de dezembro é recusado — o corte é o mês do vencimento (lacuna 3)');
  const antes = await lancou(() => emA(() => despesa.lancar({
    descricao: 'Y', valor_centavos: 100, competencia: dia(2026, 9, 1), vencimento: dia(2026, 10, 10),
    recorrencia: 'mensal', recorrente_ate: dia(2026, 9, 1),
  })));
  chk('E23b', antes !== null && antes.status === 422,
      '«repete até setembro» num título que vence em outubro é recusado (pela competência teria passado)');
}

// ---------------------------------------------------------------- E24 desfazer a baixa
{
  const [c] = await emA(() => despesa.lancar({
    descricao: 'Energia do escritório', fornecedor: 'Equatorial', valor_centavos: 41250,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 20),
  }));
  const p1 = await emA(() => contaPagar.registrarPagamento(c!.id, {
    data_pagamento: dia(2026, 10, 2), valor_centavos: 41250, forma: 'pix', origem_pagamento_id: PJ, referencia_externa: 'E2E-ENERGIA',
  }));
  const r1 = await emA(() => despesa.estornarBaixa(p1.id, { motivo: 'data errada: foi dia 20' }));
  const l1 = (await emA(() => despesa.listar())).linhas.find((l) => l.id === c!.id)!;
  const refeita = await lancou(() => emA(() => contaPagar.registrarPagamento(c!.id, {
    data_pagamento: dia(2026, 10, 20), valor_centavos: 41250, forma: 'pix', origem_pagamento_id: PJ, referencia_externa: 'E2E-ENERGIA',
  })));
  chk('E24', r1.divida_cancelada === false && l1.status === 'aberta' && l1.valor_pago_centavos === 0
        && !!l1.pagamento.find((p) => p.id === p1.id)?.estornado_em && refeita === null,
      'desfeita, a despesa volta a aberta, a baixa errada fica marcada com o motivo, e a certa entra com a mesma referência');

  const [d] = await emA(() => despesa.lancar({
    descricao: 'Material de escritório', fornecedor: 'Papelaria', valor_centavos: 8790,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 3),
  }));
  const p2 = await emA(() => contaPagar.registrarPagamento(d!.id, {
    data_pagamento: dia(2026, 10, 3), valor_centavos: 8790, forma: 'pix', origem_pagamento_id: RENATA,
  }));
  const r2 = await emA(() => despesa.estornarBaixa(p2.id, { motivo: 'não foi ela quem pagou' }));
  const l2 = (await emA(() => despesa.listar())).linhas;
  chk('E24b', r2.divida_cancelada === true
        && l2.find((l) => l.reembolso_de_pagamento_id === p2.id)?.status === 'cancelada'
        && l2.find((l) => l.id === d!.id)?.status === 'aberta',
      'a baixa que saiu do bolso da Renata, desfeita, leva junto a dívida com ela (cancelada, não apagada)');

  const p3 = await emA(() => contaPagar.registrarPagamento(d!.id, {
    data_pagamento: dia(2026, 10, 4), valor_centavos: 8790, forma: 'pix', origem_pagamento_id: RENATA,
  }));
  const divida = (await emA(() => despesa.listar())).linhas.find((l) => l.reembolso_de_pagamento_id === p3.id)!;
  await emA(() => contaPagar.registrarPagamento(divida.id, {
    data_pagamento: dia(2026, 10, 5), valor_centavos: 8790, forma: 'ted', origem_pagamento_id: PJ,
  }));
  const tarde = await lancou(() => emA(() => despesa.estornarBaixa(p3.id, { motivo: 'tarde demais' })));
  chk('E24c', tarde !== null && tarde.status === 409 && /reembolsou/.test(String(tarde.message)),
      'com a Renata já reembolsada, desfazer a baixa é recusado e a frase manda desfazer o reembolso antes');

  /* Uma conta nascida do split, posta direto pelo superusuário (a cadeia do split é
     da suíte de carteira): o repositório tem de recusar com a frase da Q-ESTORNO-01. */
  const su = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL_SUPERUSER });
  await su.connect();
  await su.query('BEGIN');
  await su.query('SET LOCAL session_replication_role = replica');
  const { rows: [cs] } = await su.query(`INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, dono_usina_id, valor_centavos,
      competencia, vencimento, origem_split_item_id) VALUES ($1, 'Repasse (E24d)', 'dono_usina', gen_random_uuid(), 50000,
      '2026-10-01', '2026-11-10', gen_random_uuid()) RETURNING id`, [A]);
  const { rows: [ps] } = await su.query(`INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
      VALUES ($1, $2, '2026-11-10', 50000, 'pix') RETURNING id`, [A, cs.id]);
  await su.query('COMMIT');
  await su.end();
  const doSplit = await lancou(() => emA(() => despesa.estornarBaixa(ps.id, { motivo: 'teste' })));
  /* E sai como entrou: as suítes seguintes contam as contas do tenant A, e esta conta
     de split falsa (com dono inexistente) não pode sobrar para elas. */
  const limpa = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL_SUPERUSER });
  await limpa.connect();
  await limpa.query('BEGIN');
  await limpa.query('SET LOCAL session_replication_role = replica');
  await limpa.query('DELETE FROM pagamento WHERE id = $1', [ps.id]);
  await limpa.query('DELETE FROM conta_pagar WHERE id = $1', [cs.id]);
  await limpa.query('COMMIT');
  await limpa.end();
  chk('E24d', doSplit !== null && doSplit.status === 409 && /Q-ESTORNO-01/.test(String(doSplit.message)),
      'a baixa de um repasse do split não se desfaz aqui: 409 com a Q-ESTORNO-01 nomeada');
  const viva = (await emA(() => despesa.listar())).linhas.find((l) => l.id === c!.id)!.pagamento.find((p) => !p.estornado_em)!;
  const leitor = await lancou(() => emALei(() => despesa.estornarBaixa(viva.id, { motivo: 'x' })));
  const semMotivo = await lancou(() => emA(() => despesa.estornarBaixa(viva.id, { motivo: '  ' })));
  chk('E24e', leitor !== null && semMotivo !== null && semMotivo.status === 422,
      'quem só lê não desfaz baixa, e desfazer sem dizer por quê é recusado');
}

// ---------------------------------------------------------------- E25 as origens: banco, agência, final; nome e ordem
{
  const o = await emA(() => despesa.criarOrigem({ nome: 'Itaú PJ', tipo: 'conta_bancaria', banco: 'Itaú', agencia: '1234-5', conta_final: '9876' }));
  const inteiro = await lancou(() => emA(() => despesa.alterarOrigem(o.id, { conta_final: '12345-6' })));
  const socioComBanco = await lancou(() => emA(() => despesa.alterarOrigem(o.id, { tipo: 'socio', banco: 'Itaú' })));
  await emA(() => despesa.alterarOrigem(o.id, { nome: 'Itaú PJ (reserva)' }));
  const ids = (await emA(() => despesa.cadastros())).origens.map((x) => x.id);
  await emA(() => despesa.ordenarOrigens([o.id, ...ids.filter((x) => x !== o.id)]));
  const depois = (await emA(() => despesa.cadastros())).origens;
  chk('E25', depois[0]!.id === o.id && depois[0]!.nome === 'Itaú PJ (reserva)' && depois[0]!.conta_final === '9876'
        && depois[0]!.agencia === '1234-5' && inteiro?.status === 422 && socioComBanco?.status === 422,
      'a origem renomeia, vai para o topo da ordem e guarda banco, agência e o final — o número inteiro e o sócio com banco são recusados');
  const deB = await emB(() => despesa.cadastros());
  chk('E25b', !deB.origens.some((x) => x.id === o.id), 'as origens do A não aparecem para o B');
  const repetido = await lancou(() => emA(() => despesa.alterarOrigem(o.id, { nome: 'Conta PJ G3 Solar' })));
  chk('E25c', repetido !== null && repetido.status === 409, 'renomear para o nome de outra origem volta 409 com a frase');
}

// ---------------------------------------------------------------- E26 o plano em dois níveis
{
  const sub = await emA(() => despesa.criarCategoria({ nome: 'Aluguel da sede', pai_id: ADM }));
  const neto = await lancou(() => emA(() => despesa.criarCategoria({ nome: 'Neto', pai_id: sub.id })));
  chk('E26', sub.pai_id === ADM && sub.natureza === 'despesa' && neto !== null && neto.status === 422,
      'a subcategoria entra embaixo do grupo e herda a natureza; embaixo dela não entra nada (dois níveis)');
  const r1 = await emA(() => despesa.ampliarComSugeridas());
  const r2 = await emA(() => despesa.ampliarComSugeridas());
  const cats = (await emA(() => despesa.cadastros())).categorias;
  const total = Object.values(despesa.SUBCATEGORIAS_SUGERIDAS).flat().length
              + despesa.GRUPOS_FORA_DO_RESULTADO.reduce((s, g) => s + g.subs.length, 0);
  chk('E26b', r1.subcategorias_criadas === total && r1.grupos_criados === 2 && r1.grupos_que_faltam.length === 0
        && r2.subcategorias_criadas === 0 && r2.grupos_criados === 0
        && cats.find((c) => c.nome === 'IPTU')?.pai_id === ADM,
      `«ampliar com as sugeridas» pendura ${total} subcategorias e cria os 2 grupos fora do resultado; a segunda vez não duplica`);
  const inv = cats.find((c) => c.nome === 'Investimentos')!;
  const equip = cats.find((c) => c.nome === 'Equipamentos')!;
  const naturezaDaSub = await lancou(() => emA(() => despesa.alterarCategoria(equip.id, { natureza: 'despesa' })));
  chk('E26c', inv.natureza === 'investimento' && inv.pai_id === null && equip.natureza === 'investimento' && equip.pai_id === inv.id
        && cats.find((c) => c.nome === 'Distribuição de lucros')?.natureza === 'retirada_socio'
        && naturezaDaSub !== null && naturezaDaSub.status === 422,
      'Investimentos e Retiradas dos sócios ficam fora das despesas pela natureza, que a subcategoria herda e não escolhe');
}

// ---------------------------------------------------------------- E27 centros de custo
{
  const adm = await emA(() => despesa.criarCentro({ nome: 'Administrativo' }));
  const com = await emA(() => despesa.criarCentro({ nome: 'Comercial' }));
  const usi = await emA(() => despesa.criarCentro({ nome: 'Operação das usinas' }));
  await emA(() => despesa.alterarCentro(com.id, { nome: 'Comercial e marketing' }));
  await emA(() => despesa.alterarCentro(usi.id, { ativo: false }));
  await emA(() => despesa.ordenarCentros([com.id, adm.id, usi.id]));
  const [d] = await emA(() => despesa.lancar({
    descricao: 'Anúncios', fornecedor: 'Meta', valor_centavos: 150000, centro_custo_id: com.id,
    competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 15),
  }));
  const centros = (await emA(() => despesa.cadastros())).centros;
  const l = (await emA(() => despesa.listar())).linhas.find((x) => x.id === d!.id)!;
  chk('E27', centros.map((c) => c.nome).join('|') === 'Comercial e marketing|Administrativo|Operação das usinas'
        && centros.find((c) => c.id === usi.id)!.ativo === false && l.centro_custo_id === com.id,
      'centros: criar, renomear, desativar, ordenar — e a despesa carrega o centro');
  const dup = await lancou(() => emA(() => despesa.criarCentro({ nome: 'Administrativo' })));
  chk('E27b', dup !== null && dup.status === 409, 'o mesmo centro duas vezes volta 409 com a frase');
  const atravessa = await lancou(() => emB(() => despesa.lancar({
    descricao: 'Invasão', valor_centavos: 100, centro_custo_id: adm.id, competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 2),
  })));
  chk('E27c', atravessa !== null && !(await emB(() => despesa.cadastros())).centros.some((c) => c.id === adm.id),
      'o B não vê nem usa o centro do A (FK composta)');
}

// ---------------------------------------------------------------- E28 o nº do lançamento
{
  const linhas = (await emA(() => despesa.listar())).linhas;
  const nums = linhas.map((l) => l.numero);
  const [nova] = await emA(() => despesa.lancar({
    descricao: 'Correios', valor_centavos: 2350, competencia: dia(2026, 10, 1), vencimento: dia(2026, 10, 8),
  }));
  chk('E28', nums.every((n) => Number.isInteger(n) && n! > 0) && new Set(nums).size === nums.length
        && nova!.numero === Math.max(...(nums as number[])) + 1,
      `toda despesa tem o seu nº (${nums.length} títulos, sem repetição), e a nova leva o seguinte: ${nova!.numero}`);
}

// ---------------------------------------------------------------- o que nao e da planilha
{
  const lista = await emA(() => despesa.listar());
  chk('E8', lista.linhas.length === lista.total && /^\d{4}-\d{2}-\d{2}$/.test(lista.hoje),
      `a lista vem com o hoje do banco (${lista.hoje}) e o total`);
  const deB = await emB(() => despesa.listar());
  chk('E8b', deB.total === 0, 'as despesas do A não aparecem para o B');
  const naoAchou = await lancou(() => emB(() => despesa.editar(lista.linhas[0]!.id, { descricao: 'invasão' })));
  chk('E8c', naoAchou !== null && naoAchou.status === 404, 'o B não edita despesa do A: 404, e não um update silencioso');
}

console.log(`\n${falhas === 0 ? 'despesas da empresa: todas as verificacoes passaram'
                              : `despesas da empresa: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
