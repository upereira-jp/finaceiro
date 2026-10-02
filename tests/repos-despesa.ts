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
  chk('E1', r1.categorias_criadas === 12 && r1.origem_criada && r2.categorias_criadas === 0 && !r2.origem_criada,
      'começar pelo plano da planilha grava os 12 itens e a Conta PJ, e a segunda vez não duplica nada');
  chk('E1b', cad.categorias[0]!.nome === 'Despesas Administrativas' && cad.categorias.at(-1)!.nome === 'Outras Despesas',
      'na ordem da planilha: Administrativas primeiro, Outras por último');
  const ids = cad.categorias.map((c) => c.id);
  await emA(() => despesa.ordenarCategorias([ids[1], ids[0], ...ids.slice(2)]));
  const depois = await emA(() => despesa.cadastros());
  chk('E1c', depois.categorias[0]!.id === ids[1], 'reordenar troca a ordem que Painel e Projeção leem');
  const nova = await emA(() => despesa.criarCategoria({ nome: 'Seguros' }));
  chk('E1d', nova.ordem === 13, 'item novo entra no fim da ordem');
  const deB = await emB(() => despesa.cadastros());
  chk('E1e', !deB.categorias.some((c) => ids.includes(c.id)), 'o plano do tenant A não aparece no B');
  const e = await lancou(() => emALei(() => despesa.comecarPelaPlanilha()));
  chk('E1f', e !== null, 'quem só lê não grava o plano');
}

const { categorias, origens } = await emA(() => despesa.cadastros());
const ADM = categorias.find((c) => c.nome === 'Despesas Administrativas')!.id;
const PJ = origens[0]!.id;

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
