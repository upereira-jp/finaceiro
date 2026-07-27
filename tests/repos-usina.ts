// Repositorios de usina e originador contra banco real, pela role sem BYPASSRLS.
// Uso: bash tests/repos.sh

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as usina from '../src/repos/usina.ts';
import * as originador from '../src/repos/originador.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;

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
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));

// ------------------------------------------------- S1 codigo duplicado = 409
{
  await emA(() => usina.criar({ codigo_geradora: 'GER-S1', distribuidora: 'Equatorial' }));
  const e = await lancou(() => emA(() => usina.criar({ codigo_geradora: 'GER-S1', distribuidora: 'Equatorial' })));
  chk('S1', e instanceof usina.CodigoDeGeradoraJaExiste && e.status === 409,
      `codigo_geradora repetido vira 409 de negocio (veio ${e?.name})`);
}

// ------------------------------------------------- S2 CLAUDE.md 1: decimal nao e number
{
  const e = await lancou(() => emA(() => usina.criar({
    codigo_geradora: 'GER-S2', distribuidora: 'Equatorial', potencia_kwp: 1234.5678 as any,
  })));
  chk('S2', e instanceof TypeError,
      `potencia_kwp como number lanca TypeError - float nao entra em grandeza decimal (veio ${e?.name})`);
}

// ------------------------------------------------- S3 decimal sobrevive ida e volta
{
  const g = await emA(() => usina.criar({
    codigo_geradora: 'GER-S3', distribuidora: 'Equatorial',
    potencia_kwp: '1234.5678', geracao_nominal_kwh: '98765.4321',
  }));
  chk('S3', g.potencia_kwp?.toString() === '1234.5678' && g.geracao_nominal_kwh?.toString() === '98765.4321',
      'numeric(12,4) e (14,4) voltam com as quatro casas intactas');
}

// ------------------------------------------------- S4 findUnique por indice CHEIO
{
  const achou = await emA(() => usina.porCodigo('GER-S1'));
  const doOutro = await emB(() => usina.porCodigo('GER-S1'));
  chk('S4', achou?.codigo_geradora === 'GER-S1' && doOutro === null,
      'porCodigo acha no proprio tenant e null no outro');
}

// ------------------------------------------------- S5 competencia tem que ser dia 1
{
  const g = await emA(() => usina.porCodigo('GER-S1'));
  const e = await lancou(() => emA(() => usina.registrarGeracao({
    usina_id: g!.id, competencia: new Date(Date.UTC(2026, 6, 17)), geracao_kwh: '1000', origem: 'local',
  })));
  chk('S5', e instanceof TypeError,
      'competencia fora do dia 1 lanca: dias diferentes do mesmo mes furariam o unique');
}

// ------------------------------------------------- S6 upsert idempotente
{
  const g = await emA(() => usina.porCodigo('GER-S1'));
  await emA(() => usina.registrarGeracao({
    usina_id: g!.id, competencia: mes(2026, 7), geracao_kwh: '1000.5000', origem: 'local',
  }));
  await emA(() => usina.registrarGeracao({
    usina_id: g!.id, competencia: mes(2026, 7), geracao_kwh: '1200.2500', origem: 'crm',
  }));
  const lida = await emA(() => usina.geracaoDaCompetencia(g!.id, mes(2026, 7)));
  const hist = await emA(() => usina.historicoDeGeracao(g!.id));
  chk('S6', lida?.geracao_kwh?.toString() === '1200.25' && lida?.origem === 'crm' && hist.length === 1,
      'registrar duas vezes a mesma competencia atualiza a linha, nao duplica');
}

// ------------------------------------------------- S7 transicoes de status
{
  const g = await emA(() => usina.criar({ codigo_geradora: 'GER-S7', distribuidora: 'Equatorial' }));
  await emA(() => usina.suspender(g.id));
  const s = await emA(() => usina.porId(g.id));
  await emA(() => usina.encerrar(g.id));
  const f = await emA(() => usina.porId(g.id));
  const e = await lancou(() => emA(() => usina.reativar(g.id)));   // encerrada nao reativa
  chk('S7', s?.status === 'suspensa' && f?.status === 'encerrada' && e?.status === 404,
      'ativa -> suspensa -> encerrada, e encerrada nao volta por reativar()');
}

// ------------------------------------------------- O1 documento e obrigatorio
{
  const e = await lancou(() => emA(() => originador.criar({
    nome: 'Sem documento', natureza: 'pf', tipo: 'vendedor_g3', documento_bruto: '',
  })));
  chk('O1', e instanceof originador.DocumentoObrigatorio && e.status === 422,
      `originador sem documento e 422, nao violacao de NOT NULL (veio ${e?.name})`);
}

// ------------------------------------------------- O2 R8: semente do CRM nao valida
{
  const o = await emA(() => originador.criar({
    nome: 'Parceiro do CRM', natureza: 'pf', tipo: 'parceiro_indicador',
    documento_bruto: '529.982.247-25', documento_origem: 'crm_semente',
  }));
  chk('O2', o.documento === '52998224725' && o.documento_validado === false,
      'R8 vale para originador: documento do CRM com DV correto entra NAO validado');
}

// ------------------------------------------------- O3 coleta local com DV correto valida
{
  const o = await emA(() => originador.criar({
    nome: 'Parceiro conferido', natureza: 'pf', tipo: 'parceiro_captador',
    documento_bruto: '111.444.777-35', documento_origem: 'coleta_local',
  }));
  chk('O3', o.documento_validado === true && o.documento_tipo === 'cpf',
      'coleta local com digito correto entra validada');
}

// ------------------------------------------------- O4 documento duplicado = 409
{
  const e = await lancou(() => emA(() => originador.criar({
    nome: 'Repetido', natureza: 'pf', tipo: 'vendedor_g3', documento_bruto: '11144477735',
  })));
  chk('O4', e instanceof originador.DocumentoDeOriginadorJaExiste && e.status === 409,
      `documento repetido no mesmo tenant vira 409 (veio ${e?.name})`);
}

// ------------------------------------------------- O5 mesmo documento em OUTRO tenant passa
{
  const o = await emB(() => originador.criar({
    nome: 'Mesma pessoa, outra empresa', natureza: 'pf', tipo: 'vendedor_g3',
    documento_bruto: '11144477735',
  }));
  chk('O5', o.tenant_id === B,
      'o unique e (tenant_id, documento): a mesma pessoa existe nos dois tenants');
}

// ------------------------------------------------- O6 findUnique por indice CHEIO
{
  const achou = await emA(() => originador.porDocumento('111.444.777-35'));
  chk('O6', achou?.nome === 'Parceiro conferido',
      'porDocumento usa findUnique - aqui o indice e cheio, documento e NOT NULL');
}

// ------------------------------------------------- O7 edicao de tipo nao retroage
{
  const o = await emA(() => originador.porDocumento('111.444.777-35'));
  await emA(() => originador.editar(o!.id, { tipo: 'parceiro_captador_senior' }));
  const depois = await emA(() => originador.porId(o!.id));
  chk('O7', depois?.tipo === 'parceiro_captador_senior',
      'editar muda o cadastro de hoje - o contrato ja fechado guarda originador_tipo_no_fechamento');
}

// ------------------------------------------------- O8 baixa logica
{
  const o = await emA(() => originador.porDocumento('111.444.777-35'));
  await emA(() => originador.desativar(o!.id));
  const ativos = await emA(() => originador.listar({ ativo: true }));
  const todos = await emA(() => originador.listar());
  chk('O8', !ativos.some((x) => x.id === o!.id) && todos.some((x) => x.id === o!.id),
      'desativar tira da lista de ativos e NAO apaga - comissao historica ainda resolve o nome');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
