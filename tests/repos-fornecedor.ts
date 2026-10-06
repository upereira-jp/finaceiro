// Suite do repositorio de FORNECEDOR (`src/repos/fornecedor.ts`) — a migration 44,
// etapa 1 do controle total da empresa (06/10/2026).
//
// As invariantes de banco (documento unico por tenant, FK composta) estao em
// `tests/despesas.sql` (D12, D13). Aqui o COMPORTAMENTO: o documento conferido pelo
// digito, o nome repetido que o cadastro existe para acabar, a busca sem acento, o
// resumo do que se pagou (sem a baixa estornada) e a RLS pela role sem BYPASSRLS.
//
// Uso: via tests/repos.sh (precisa de PostgreSQL com a fixture de la).

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as fornecedor from '../src/repos/fornecedor.ts';
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
/** Hoje em Goiânia, como Date em UTC à meia-noite — a data de uma baixa feita agora. */
const hoje = () => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${d}T00:00:00.000Z`);
};

// ---------------------------------------------------------------- F1–F3 o cadastro
const f = await emA(() => fornecedor.criar({
  nome: 'Contabilidade Exata', documento: '11.444.777/0001-61', contato: 'contato@exata.example',
}));
chk('FO1', f.documento === '11444777000161' && f.documento_tipo === 'cnpj' && f.ativo,
    'o CNPJ entra com máscara e é guardado normalizado, com o tipo, e o fornecedor nasce ativo');
const invalido = await lancou(() => emA(() => fornecedor.criar({ nome: 'Errado', documento: '11.444.777/0001-62' })));
chk('FO2', invalido !== null && invalido.status === 422 && /dígito/.test(String(invalido.message)),
    'CNPJ com o dígito errado é recusado com a frase que diz por quê');
const mesmoDoc = await lancou(() => emA(() => fornecedor.criar({ nome: 'Outro nome', documento: '11444777000161' })));
const mesmoNome = await lancou(() => emA(() => fornecedor.criar({ nome: 'CONTABILIDADE exáta' })));
chk('FO3', mesmoDoc?.status === 409 && /Contabilidade Exata/.test(String(mesmoDoc.message))
      && mesmoNome?.status === 409 && /Contabilidade Exata/.test(String(mesmoNome.message)),
    'o mesmo CNPJ e o mesmo nome (sem acento e sem caixa) voltam 409 nomeando o cadastro que existe');

// ---------------------------------------------------------------- F4 o tenant B
const deB = await emB(() => fornecedor.listar());
const fichaDeB = await lancou(() => emB(() => fornecedor.ficha(f.id)));
chk('FO4', !deB.some((x) => x.id === f.id) && fichaDeB?.status === 404, 'o B não lista nem abre o fornecedor do A');

// ---------------------------------------------------------------- F5 a busca
const porNome = await emA(() => fornecedor.listar({ busca: 'contabilidade exata' }));
const porDoc = await emA(() => fornecedor.listar({ busca: '444777' }));
const nada = await emA(() => fornecedor.listar({ busca: 'xyzw-nao-existe' }));
chk('FO5', porNome.some((x) => x.id === f.id) && porDoc.some((x) => x.id === f.id) && nada.length === 0,
    'a busca acha pelo nome sem acento e por um pedaço do CNPJ, e não acha o que não existe');

// ---------------------------------------------------------------- F6 a despesa ligada e o nome que acompanha
const [aberta] = await emA(() => despesa.lancar({
  descricao: 'Honorários de outubro', fornecedor_id: f.id, valor_centavos: 120000,
  competencia: new Date(Date.UTC(2026, 9, 1)), vencimento: new Date(Date.UTC(2026, 9, 25)),
}));
const [paga] = await emA(() => despesa.lancar({
  descricao: 'Honorários de setembro', fornecedor_id: f.id, valor_centavos: 120000,
  competencia: new Date(Date.UTC(2026, 8, 1)), vencimento: new Date(Date.UTC(2026, 8, 25)),
}));
const pg = await emA(() => contaPagar.registrarPagamento(paga!.id, {
  data_pagamento: hoje(), valor_centavos: 120000, acrescimo_centavos: 2400, forma: 'pix',
}));
await emA(() => fornecedor.alterar(f.id, { nome: 'Exata Contabilidade Ltda' }));
const { despesas } = await emA(() => fornecedor.ficha(f.id));
chk('FO6', despesas.length === 2
      && (await emA(() => despesa.listar())).linhas.find((l) => l.id === aberta!.id)!.beneficiario_nome === 'Exata Contabilidade Ltda'
      && (await emA(() => despesa.listar())).linhas.find((l) => l.id === paga!.id)!.beneficiario_nome === 'Contabilidade Exata',
    'renomeado, o nome acompanha a despesa EM ABERTO; a paga guarda o nome com que foi paga');

// ---------------------------------------------------------------- F7 o que se pagou em 12 meses
const r1 = (await emA(() => fornecedor.listar({ busca: 'exata' }))).find((x) => x.id === f.id)!;
await emA(() => despesa.estornarBaixa(pg.id, { motivo: 'teste do resumo' }));
const r2 = (await emA(() => fornecedor.listar({ busca: 'exata' }))).find((x) => x.id === f.id)!;
chk('FO7', r1.pago_12_meses_centavos === 122400 && r1.em_aberto_centavos === 120000 && r1.despesas === 2
      && r2.pago_12_meses_centavos === 0 && r2.em_aberto_centavos === 240000,
    `o resumo soma o que SAIU (120000 + 2400 de juros = ${r1.pago_12_meses_centavos}) e o em aberto; a baixa desfeita sai do pago e volta ao aberto`);

// ---------------------------------------------------------------- F8 desativar
const outro = await emA(() => fornecedor.criar({ nome: 'Antigo Fornecedor' }));
await emA(() => fornecedor.alterar(outro.id, { ativo: false }));
const lista = await emA(() => fornecedor.listar());
const iInativo = lista.findIndex((x) => x.id === outro.id);
chk('FO8', iInativo >= 0 && lista[iInativo]!.ativo === false && lista.slice(iInativo).every((x) => !x.ativo),
    'desativado fica na lista (nunca se apaga), depois de todos os ativos');

// ---------------------------------------------------------------- F9 quem só lê
const leitor = await lancou(() => emALei(() => fornecedor.criar({ nome: 'Pelo leitor' })));
const leitorAltera = await lancou(() => emALei(() => fornecedor.alterar(f.id, { nome: 'Pelo leitor' })));
const leitorLe = await lancou(() => emALei(() => fornecedor.listar()));
chk('FO9', leitor !== null && leitorAltera !== null && leitorLe === null, 'quem só lê vê a lista e não cria nem altera');

// ---------------------------------------------------------------- F10 a chave Pix conferida
const pixRuim = await lancou(() => emA(() => fornecedor.criar({ nome: 'Pix ruim', tipo_chave_pix: 'cpf', chave_pix: '123.456.789-00' })));
const pixBom = await emA(() => fornecedor.criar({ nome: 'Pix bom', tipo_chave_pix: 'email', chave_pix: '  Financeiro@Fornecedor.example ' }));
const soTipo = await lancou(() => emA(() => fornecedor.criar({ nome: 'Só tipo', tipo_chave_pix: 'email' })));
chk('FO10', pixRuim?.status === 422 && soTipo?.status === 422 && pixBom.tipo_chave_pix === 'email' && !!pixBom.chave_pix
      && pixBom.chave_pix === pixBom.chave_pix.trim(),
    `a chave Pix passa pelo conferidor (CPF com dígito errado recusado, e-mail guardado como «${pixBom.chave_pix}»), e tipo sem chave é recusado`);

console.log(`\n${falhas === 0 ? 'fornecedores: todas as verificacoes passaram' : `fornecedores: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
