// Repositorio de usina e de geracao mensal.
//
// CLAUDE.md 1, segunda metade: potencia (kWp), geracao (kWh) e percentual
// MANTEM escala decimal e nunca viram centavos. Sao grandeza fisica, nao
// dinheiro. Por isso entram como STRING e nao como number - number aqui e a
// porta de entrada do float, e a regra 1 proibe float ate em calculo
// intermediario. numeric(14,4) recebendo double de JS perde precisao antes de
// chegar no banco, e o erro aparece no fechamento do mes.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import type {
  status_usina as StatusUsina, origem_geracao as OrigemGeracao,
} from '../generated/prisma/enums.ts';

export type NovaUsina = {
  codigo_geradora: string;
  distribuidora: string;
  apelido?: string | null;
  /** Decimal como STRING. Ver o cabecalho deste arquivo. */
  potencia_kwp?: string | null;
  geracao_nominal_kwh?: string | null;
  dono_usina_id?: string | null;
  data_homologacao?: Date | null;
  regime_fio_b?: boolean;
  crm_usina_id?: string | null;
};

export type EdicaoUsina = Partial<Omit<NovaUsina, 'codigo_geradora' | 'crm_usina_id'>>;

export class CodigoDeGeradoraJaExiste extends Error {
  readonly status = 409;
  constructor(codigo: string) {
    super(`Ja existe usina com codigo de geradora ${codigo} neste tenant.`);
    this.name = 'CodigoDeGeradoraJaExiste';
  }
}

/** CLAUDE.md 1: se chegou number numa grandeza decimal, morre aqui. */
function decimal(v: string | null | undefined, campo: string): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') {
    throw new TypeError(`${campo} deve ser string decimal, nao number - float perde precisao antes do banco`);
  }
  if (!/^-?\d+(\.\d+)?$/.test(v.trim())) throw new TypeError(`${campo} nao e decimal valido: ${JSON.stringify(v)}`);
  return v.trim();
}

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

export async function criar(e: NovaUsina) {
  await exigir('escrever_cadastro');
  try {
    return await dbt().usina.create({
      data: {
        tenant_id: tenantCorrente(),
        codigo_geradora: e.codigo_geradora.trim(),
        distribuidora: e.distribuidora.trim(),
        apelido: limpar(e.apelido),
        potencia_kwp: decimal(e.potencia_kwp, 'potencia_kwp'),
        geracao_nominal_kwh: decimal(e.geracao_nominal_kwh, 'geracao_nominal_kwh'),
        dono_usina_id: e.dono_usina_id ?? null,
        data_homologacao: e.data_homologacao ?? null,
        regime_fio_b: e.regime_fio_b ?? true,
        crm_usina_id: e.crm_usina_id ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new CodigoDeGeradoraJaExiste(e.codigo_geradora);
    throw err;
  }
}

/** `usina_codigo_unico` e unique CHEIO: findUnique legitimo. */
export async function porCodigo(codigoGeradora: string) {
  await exigir('ler');
  return dbt().usina.findUnique({
    where: {
      tenant_id_codigo_geradora: { tenant_id: tenantCorrente(), codigo_geradora: codigoGeradora.trim() },
    },
  });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().usina.findFirst({ where: { id } });
}

/** crm_usina_id nao tem indice unico: findFirst, e o tenant sai da RLS. */
export async function porUsinaDoCrm(crmUsinaId: string | null | undefined) {
  await exigir('ler');
  if (!crmUsinaId) return null;
  return dbt().usina.findFirst({ where: { crm_usina_id: crmUsinaId } });
}

export async function listar(opcoes: { status?: StatusUsina; limite?: number } = {}) {
  await exigir('ler');
  return dbt().usina.findMany({
    where: opcoes.status === undefined ? {} : { status: opcoes.status },
    orderBy: [{ codigo_geradora: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

export async function listarDoDono(donoUsinaId: string) {
  await exigir('ler');
  return dbt().usina.findMany({
    where: { dono_usina_id: donoUsinaId },
    orderBy: [{ codigo_geradora: 'asc' }],
  });
}

export async function editar(id: string, e: EdicaoUsina) {
  await exigir('escrever_cadastro');

  const dados: Record<string, unknown> = {};
  if (e.distribuidora !== undefined) dados.distribuidora = e.distribuidora.trim();
  if (e.apelido !== undefined) dados.apelido = limpar(e.apelido);
  if (e.potencia_kwp !== undefined) dados.potencia_kwp = decimal(e.potencia_kwp, 'potencia_kwp');
  if (e.geracao_nominal_kwh !== undefined) {
    dados.geracao_nominal_kwh = decimal(e.geracao_nominal_kwh, 'geracao_nominal_kwh');
  }
  if (e.dono_usina_id !== undefined) dados.dono_usina_id = e.dono_usina_id ?? null;
  if (e.data_homologacao !== undefined) dados.data_homologacao = e.data_homologacao ?? null;
  if (e.regime_fio_b !== undefined) dados.regime_fio_b = e.regime_fio_b;
  if (Object.keys(dados).length === 0) return;

  const r = await dbt().usina.updateMany({ where: { id }, data: dados });
  if (r.count === 0) throw Object.assign(new Error('Usina nao encontrada.'), { status: 404 });
}

export async function suspender(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().usina.updateMany({ where: { id, status: 'ativa' }, data: { status: 'suspensa' } });
  if (r.count === 0) throw Object.assign(new Error('Usina ativa nao encontrada.'), { status: 404 });
}

export async function reativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().usina.updateMany({ where: { id, status: 'suspensa' }, data: { status: 'ativa' } });
  if (r.count === 0) throw Object.assign(new Error('Usina suspensa nao encontrada.'), { status: 404 });
}

export async function encerrar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().usina.updateMany({
    where: { id, status: { in: ['ativa', 'suspensa'] } }, data: { status: 'encerrada' },
  });
  if (r.count === 0) throw Object.assign(new Error('Usina nao encontrada.'), { status: 404 });
}

// ---------------------------------------------------------------- geracao mensal

/**
 * Geracao de uma competencia. `usina_geracao_competencia_unica` e unique CHEIO
 * sobre (tenant_id, usina_id, competencia), entao o upsert e seguro: a chave
 * identifica UMA linha para qualquer estado da tabela.
 *
 * `competencia` e DATE e representa o MES. Passe o primeiro dia; o banco nao tem
 * como recusar dia 17, e duas competencias do mesmo mes com dias diferentes
 * conviveriam como linhas distintas.
 */
export async function registrarGeracao(e: {
  usina_id: string; competencia: Date; geracao_kwh: string; origem: OrigemGeracao;
}) {
  await exigir('escrever_cadastro');
  const kwh = decimal(e.geracao_kwh, 'geracao_kwh');
  if (kwh === null) throw new TypeError('geracao_kwh e obrigatorio');
  if (e.competencia.getUTCDate() !== 1) {
    throw new TypeError(
      `competencia deve ser o primeiro dia do mes (recebeu dia ${e.competencia.getUTCDate()}). ` +
      'Dias diferentes do mesmo mes viram linhas distintas e o unique nao pega.'
    );
  }

  const chave = {
    tenant_id: tenantCorrente(), usina_id: e.usina_id, competencia: e.competencia,
  };
  return dbt().usina_geracao.upsert({
    where: { tenant_id_usina_id_competencia: chave },
    create: { ...chave, geracao_kwh: kwh, origem: e.origem },
    update: { geracao_kwh: kwh, origem: e.origem },
  });
}

export async function geracaoDaCompetencia(usinaId: string, competencia: Date) {
  await exigir('ler');
  return dbt().usina_geracao.findUnique({
    where: {
      tenant_id_usina_id_competencia: {
        tenant_id: tenantCorrente(), usina_id: usinaId, competencia,
      },
    },
  });
}

export async function historicoDeGeracao(usinaId: string, limite = 24) {
  await exigir('ler');
  return dbt().usina_geracao.findMany({
    where: { usina_id: usinaId },
    orderBy: [{ competencia: 'desc' }],
    take: Math.min(limite, 120),
  });
}
