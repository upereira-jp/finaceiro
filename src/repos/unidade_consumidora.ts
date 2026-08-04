// Repositorio de unidade consumidora - CADASTRO da UC.
//
// FRONTEIRA COM rateio.ts, e ela e deliberada: `usina_id` e `percentual_rateio`
// moram nesta tabela mas NAO se editam por aqui. Sao o rateio, tem regra propria
// (R11, teto de 100%) e uma constraint trigger DEFERRABLE atras. Deixar os dois
// campos em `editar()` daria dois caminhos para a mesma escrita, e so um deles
// conferiria o teto. Ver repos/rateio.ts.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import type { titularidade_uc as TitularidadeUC, status_uc as StatusUC } from '../generated/prisma/enums.ts';

export type NovaUC = {
  cliente_id: string;
  numero_uc: string;
  distribuidora: string;
  titularidade?: TitularidadeUC;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_municipio?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  data_vencimento?: Date | null;
  crm_usina_cliente_id?: string | null;
};

export type EdicaoUC = Partial<Omit<NovaUC, 'cliente_id' | 'numero_uc' | 'crm_usina_cliente_id'>>;

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

export class NumeroDeUCJaExiste extends Error {
  readonly status = 409;
  constructor(numero: string) {
    super(`Ja existe unidade consumidora ${numero} neste tenant.`);
    this.name = 'NumeroDeUCJaExiste';
  }
}

export async function criar(e: NovaUC) {
  await exigir('escrever_cadastro');
  try {
    return await dbt().unidade_consumidora.create({
      data: {
        // CLAUDE.md 2: nunca do chamador. O que nao entra na assinatura nao vaza.
        tenant_id: tenantCorrente(),
        cliente_id: e.cliente_id,
        numero_uc: e.numero_uc.trim(),
        distribuidora: e.distribuidora.trim(),
        titularidade: e.titularidade ?? 'propria',
        endereco_logradouro: limpar(e.endereco_logradouro),
        endereco_numero: limpar(e.endereco_numero),
        endereco_complemento: limpar(e.endereco_complemento),
        endereco_bairro: limpar(e.endereco_bairro),
        endereco_municipio: limpar(e.endereco_municipio),
        endereco_uf: limpar(e.endereco_uf)?.toUpperCase() ?? null,
        endereco_cep: limpar(e.endereco_cep),
        data_vencimento: e.data_vencimento ?? null,
        crm_usina_cliente_id: e.crm_usina_cliente_id ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new NumeroDeUCJaExiste(e.numero_uc);
    throw err;
  }
}

/**
 * `uc_numero_unico` e unique CHEIO - sem predicado. findUnique aqui e legitimo:
 * a chave e unica para TODA linha da tabela, nao para um subconjunto.
 * Compare com porUsinaClienteDoCrm() logo abaixo.
 */
export async function porNumero(numeroUc: string) {
  await exigir('ler');
  return dbt().unidade_consumidora.findUnique({
    where: { tenant_id_numero_uc: { tenant_id: tenantCorrente(), numero_uc: numeroUc.trim() } },
  });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().unidade_consumidora.findFirst({ where: { id } });
}

/**
 * CLAUDE.md 11, e ATENCAO: aqui a regra mudou de mecanismo.
 *
 * `uc_crm_unico` e PARCIAL (WHERE crm_usina_cliente_id IS NOT NULL). A regra 11
 * afirma que "o Prisma ja exclui parcial das chaves de findUnique - verificado no
 * DMMF". Isso era verdade quando foi medido e NAO E MAIS: com
 * previewFeatures = ["partialIndexes"] ligado no generator, o db pull emite
 * `where: raw(...)` no @@unique e a chave APARECE em findUnique. Conferido nos
 * tipos gerados: `tenant_id_crm_usina_cliente_id` esta em
 * unidade_consumidoraWhereUniqueInput.
 *
 * Ou seja: a protecao automatica que a regra 11 supunha nao existe mais, e o
 * findUnique errado agora COMPILA. Registrado como Q-CLAUDE11-01 em QUESTOES.md.
 * Ate haver decisao, o caminho continua sendo o que a propria regra manda:
 * findFirst com o predicado explicito.
 */
export async function porUsinaClienteDoCrm(crmUsinaClienteId: string | null | undefined) {
  await exigir('ler');
  if (!crmUsinaClienteId) return null;   // null nunca chega ao banco: o indice nao o cobre
  return dbt().unidade_consumidora.findFirst({
    where: { crm_usina_cliente_id: crmUsinaClienteId },
  });
}

export async function listarDoCliente(clienteId: string) {
  await exigir('ler');
  return dbt().unidade_consumidora.findMany({
    where: { cliente_id: clienteId },
    orderBy: [{ numero_uc: 'asc' }],
  });
}

export async function listar(opcoes: { status?: StatusUC; limite?: number } = {}) {
  await exigir('ler');
  return dbt().unidade_consumidora.findMany({
    where: opcoes.status === undefined ? {} : { status: opcoes.status },
    orderBy: [{ numero_uc: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

export async function editar(id: string, e: EdicaoUC) {
  await exigir('escrever_cadastro');

  const dados: Record<string, unknown> = {};
  if (e.distribuidora !== undefined) dados.distribuidora = e.distribuidora.trim();
  if (e.titularidade !== undefined)  dados.titularidade = e.titularidade;
  if (e.data_vencimento !== undefined) dados.data_vencimento = e.data_vencimento ?? null;
  for (const c of ['endereco_logradouro','endereco_numero','endereco_complemento',
                   'endereco_bairro','endereco_municipio','endereco_cep'] as const) {
    if (e[c] !== undefined) dados[c] = limpar(e[c]);
  }
  if (e.endereco_uf !== undefined) dados.endereco_uf = limpar(e.endereco_uf)?.toUpperCase() ?? null;
  if (Object.keys(dados).length === 0) return;

  // updateMany e nao update: `update` usa chave unica e lanca P2025 quando a RLS
  // esconde a linha - "nao existe" que na verdade e "outro tenant".
  const r = await dbt().unidade_consumidora.updateMany({ where: { id }, data: dados });
  if (r.count === 0) throw Object.assign(new Error('Unidade consumidora nao encontrada.'), { status: 404 });
}

// ------------------------------------------------- lancamento de vencimento

export type ResultadoDosVencimentos = {
  aplicadas: Array<{ numero_uc: string; unidade_consumidora_id: string; dia: number; antes: number | null }>;
  /** UC da planilha que nao existe no cadastro. Nao e erro do arquivo - e a
   *  planilha e o banco discordando sobre quais UCs existem, e quem decide o
   *  que fazer com isso e uma pessoa. */
  sem_uc: Array<{ numero_uc: string; dia: number }>;
  /** UC ATIVA do cadastro que a planilha nao cobriu, com o que ela tem hoje.
   *  Existe porque ausente nao e zero: o lancamento nao apaga o que nao veio.
   *
   *  `fatura` e o mesmo predicado da triagem, e ele muda o que a ausencia
   *  SIGNIFICA: UC faturavel sem dia vira recusa `sem_vencimento` no lote; UC
   *  com rateio nao ativado no CRM ja para antes disso, e o dia dela nao e
   *  trabalho pendente. Sem esta distincao o relatorio contava as duas juntas e
   *  mandava preencher doze que nao faturariam. */
  nao_cobertas: Array<{ numero_uc: string; dia_atual: number | null; fatura: boolean }>;
  /** Cobertas pela planilha com o MESMO dia que ja tinham. Contadas a parte para
   *  a segunda passada nao parecer trabalho: reimportar o mesmo arquivo tem de
   *  sair com `aplicadas` em zero. */
  inalteradas: Array<{ numero_uc: string; dia: number }>;
};

/**
 * Lanca o dia de vencimento de varias UCs de uma vez, casando por `numero_uc`.
 *
 * POR QUE `numero_uc` E NAO O id. E o unico identificador que a operacao tem na
 * mao - o mesmo argumento do `lancarTarifasPorUC`. `uc_numero_unico` e indice
 * unico CHEIO sobre `(tenant_id, numero_uc)`, entao navegar por ele nao esbarra
 * na regra 11.
 *
 * O QUE ESTA FUNCAO NAO FAZ, e os tres sao deliberados:
 *   - nao apaga vencimento de UC que a planilha nao trouxe (ausente nao e zero);
 *   - nao toca UC cancelada, porque cancelada saiu do rateio e nao vai faturar;
 *   - nao decide o dia de nada - `dia` chega ja validado pelo leitor puro.
 */
export async function lancarVencimentosPorUC(
  porUC: ReadonlyMap<string, number>,
): Promise<ResultadoDosVencimentos> {
  await exigir('escrever_cadastro');

  for (const [uc, dia] of porUC) {
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      throw Object.assign(new RangeError(`UC ${uc}: dia de vencimento invalido (${dia})`), { status: 422 });
    }
  }

  const atuais = await dbt().unidade_consumidora.findMany({
    where: { status: { not: 'cancelada' } },
    select: {
      id: true, numero_uc: true, data_vencimento: true,
      status: true, crm_usina_cliente_id: true, rateio_situacao: true,
    },
  });
  const porNumero = new Map(atuais.map((u) => [u.numero_uc, u]));

  const r: ResultadoDosVencimentos = { aplicadas: [], sem_uc: [], nao_cobertas: [], inalteradas: [] };

  for (const [numero_uc, dia] of porUC) {
    const u = porNumero.get(numero_uc);
    if (!u) { r.sem_uc.push({ numero_uc, dia }); continue; }

    const antes = u.data_vencimento ? u.data_vencimento.getUTCDate() : null;
    if (antes === dia) { r.inalteradas.push({ numero_uc, dia }); continue; }

    /*
     * A data e um PORTADOR do dia, nao um vencimento. `faturamento.ts` le dela
     * so `getUTCDate()` e monta a data real a partir da competencia - o mes e o
     * ano gravados aqui nao sao lidos por ninguem. Janeiro de 2000 tem 31 dias
     * (necessario para o dia 31 ser representavel) e e obviamente arbitrario,
     * que e o ponto: uma data plausivel seria lida como significativa.
     */
    await dbt().unidade_consumidora.updateMany({
      where: { id: u.id },
      data: { data_vencimento: new Date(Date.UTC(2000, 0, dia)) },
    });
    r.aplicadas.push({ numero_uc, unidade_consumidora_id: u.id, dia, antes });
  }

  for (const u of atuais) {
    if (porUC.has(u.numero_uc)) continue;
    r.nao_cobertas.push({
      numero_uc: u.numero_uc,
      dia_atual: u.data_vencimento ? u.data_vencimento.getUTCDate() : null,
      // O predicado da triagem, e nao "status = ativa": suspensa nao fatura, e
      // UC espelhada com rateio nao ativado no CRM tambem nao. UC criada a mao
      // (`crm_usina_cliente_id` nulo) continua contando - o CRM nao sabe dela.
      fatura: u.status === 'ativa'
        && (u.crm_usina_cliente_id === null || u.rateio_situacao === 'ativado'),
    });
  }

  return r;
}

/** Suspensa continua no rateio: o teto da R11 conta suspensa, so ignora cancelada. */
export async function suspender(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().unidade_consumidora.updateMany({
    where: { id, status: 'ativa' }, data: { status: 'suspensa' },
  });
  if (r.count === 0) throw Object.assign(new Error('UC ativa nao encontrada.'), { status: 404 });
}

export async function reativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().unidade_consumidora.updateMany({
    where: { id, status: 'suspensa' }, data: { status: 'ativa' },
  });
  if (r.count === 0) throw Object.assign(new Error('UC suspensa nao encontrada.'), { status: 404 });
}

/**
 * Cancelar SAI do rateio - `app.exigir_teto_de_rateio` ignora status 'cancelada'.
 * Nunca DELETE: contrato aponta para ca, e o historico do rateio tem que
 * continuar legivel depois do cancelamento.
 */
export async function cancelar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().unidade_consumidora.updateMany({
    where: { id, status: { in: ['ativa', 'suspensa'] } }, data: { status: 'cancelada' },
  });
  if (r.count === 0) throw Object.assign(new Error('UC nao encontrada.'), { status: 404 });
}
