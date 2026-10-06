// Suite do repositorio de ANEXO (`src/repos/anexo.ts`) — o comprovante como
// arquivo no proprio Postgres (migration 44, ADR-0009, 06/10/2026).
//
// As invariantes de banco (append-only por privilegio, um arquivo por sha256,
// teto, tipo pelos bytes, a trilha sem os bytes) estao em `tests/despesas.sql`
// (D16). Aqui o COMPORTAMENTO pela role de runtime, SEM BYPASSRLS: o que a tela
// manda e o que volta.
//
// Uso: via tests/repos.sh (precisa de PostgreSQL com a fixture de la).

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as anexo from '../src/repos/anexo.ts';
import * as despesa from '../src/repos/despesa.ts';
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

/** Um PDF mínimo de verdade (o cabeçalho é o que o gatilho lê), único por execução. */
const pdf = Buffer.from(`%PDF-1.4\n% comprovante de teste ${Date.now()}\n%%EOF\n`, 'latin1');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`foto ${Date.now()}`)]);

const [d1] = await emA(() => despesa.lancar({
  descricao: 'Internet (anexo)', valor_centavos: 19990,
  competencia: new Date(Date.UTC(2026, 9, 1)), vencimento: new Date(Date.UTC(2026, 9, 15)),
}));
const [d2] = await emA(() => despesa.lancar({
  descricao: 'Telefone (anexo)', valor_centavos: 9990,
  competencia: new Date(Date.UTC(2026, 9, 1)), vencimento: new Date(Date.UTC(2026, 9, 15)),
}));

// ---------------------------------------------------------------- A1 anexar
const a1 = await emA(() => anexo.anexar(d1!.id, { nome_arquivo: 'C:\\Users\\x\\boleto-pago.pdf', conteudo: pdf }));
const naLista = (await emA(() => despesa.listar())).linhas.find((l) => l.id === d1!.id)!;
chk('AN1', a1.tipo === 'application/pdf' && a1.tamanho_bytes === pdf.length && a1.nome_arquivo === 'boleto-pago.pdf'
      && naLista.anexo.length === 1 && naLista.anexo[0]!.id === a1.id,
    'o PDF entra com tipo e tamanho do banco, o nome sem o caminho do computador, e aparece na despesa');

// ---------------------------------------------------------------- A2 o que não é comprovante
const exe = await lancou(() => emA(() => anexo.anexar(d1!.id, { nome_arquivo: 'nota.pdf', conteudo: Buffer.from('MZ\x90\x00 executavel') })));
chk('AN2', exe !== null && exe.status === 422 && /PDF ou foto/.test(String(exe.message)),
    'um executável com nome de .pdf é recusado pelos bytes, com a frase da tela (e não um 500)');

// ---------------------------------------------------------------- A3 o mesmo arquivo duas vezes
const a3 = await emA(() => anexo.anexar(d2!.id, { nome_arquivo: 'mesmo.pdf', conteudo: pdf }));
const su = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL_SUPERUSER });
await su.connect();
const { rows: [{ n }] } = await su.query(
  `SELECT count(*)::int AS n FROM anexo_conteudo WHERE tenant_id = $1 AND sha256 = encode(sha256($2::bytea), 'hex')`, [A, pdf]);
await su.end();
chk('AN3', a3.id !== a1.id && n === 1, 'o mesmo PDF em duas despesas: dois vínculos, um arquivo só no banco');

// ---------------------------------------------------------------- A4 baixar
const b = await emA(() => anexo.baixar(a3.id));
chk('AN4', Buffer.compare(Buffer.from(b.conteudo), pdf) === 0 && b.tipo === 'application/pdf' && /^[0-9a-f]{64}$/.test(b.sha256),
    'baixar devolve os mesmos bytes, o tipo e o sha256 (que serve de ETag)');

// ---------------------------------------------------------------- A5 desvincular, sem apagar
const a5 = await emA(() => anexo.anexar(d2!.id, { nome_arquivo: 'foto.png', conteudo: png }));
await emA(() => anexo.desvincular(a5.id));
const deNovo = await lancou(() => emA(() => anexo.desvincular(a5.id)));
const daD2 = await emA(() => anexo.daConta(d2!.id));
const aindaLe = await lancou(() => emA(() => anexo.baixar(a5.id)));
chk('AN5', !daD2.some((x) => x.id === a5.id) && daD2.some((x) => x.id === a3.id) && deNovo?.status === 409 && aindaLe === null,
    'desvinculado, sai da despesa e o arquivo continua no banco (nada se apaga); desvincular de novo é 409');

// ---------------------------------------------------------------- A6 o tenant B
const bBaixa = await lancou(() => emB(() => anexo.baixar(a1.id)));
const bAnexa = await lancou(() => emB(() => anexo.anexar(d1!.id, { nome_arquivo: 'x.pdf', conteudo: pdf })));
const bTira = await lancou(() => emB(() => anexo.desvincular(a1.id)));
chk('AN6', bBaixa?.status === 404 && bAnexa?.status === 404 && bTira?.status === 404,
    'o B não baixa, não anexa e não tira anexo de despesa do A — 404, pela RLS');

// ---------------------------------------------------------------- A7 quem só lê
const lAnexa = await lancou(() => emALei(() => anexo.anexar(d1!.id, { nome_arquivo: 'y.pdf', conteudo: pdf })));
const lTira = await lancou(() => emALei(() => anexo.desvincular(a1.id)));
const lBaixa = await lancou(() => emALei(() => anexo.baixar(a1.id)));
chk('AN7', lAnexa !== null && lTira !== null && lBaixa === null, 'quem só lê abre o comprovante e não anexa nem tira');

console.log(`\n${falhas === 0 ? 'anexos: todas as verificacoes passaram' : `anexos: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
