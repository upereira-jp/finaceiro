// O REGISTRO DA FATURA UNIFICADA, por UC e competencia (migration 29).
//
// ============================================================================
// O QUE ELE EXISTE PARA RESOLVER, E ISSO ESTAVA IMPRESSO ERRADO NA FOLHA
//
// A folha 2 abre com o maior numero dela - 21pt, laranja - dizendo **"Voce ja
// economizou"**. Ate 14/08 esse numero era o desconto DESTA fatura, e a nota
// embaixo dizia **"Primeira fatura com a G3 Solar"**. Para toda fatura. Sempre.
//
// A composicao ja sabia fazer certo: `comporFolhas` aceita
// `economia_acumulada_centavos` e `desde`, e a verificacao `F7c` prova que a
// folha imprime a soma quando alguem os passa. O que faltava era **o
// alimentador** - nada guardava a fatura lida.
//
// A referencia guarda em `localStorage`, sob `fatura:{uc}:{AAAA-MM}`, e tira a
// economia acumulada da soma dos descontos dessa serie
// (`REFERENCIA-fatura-unificada-2026-08-13.md` §8). A chave dela nao se porta:
// nao tem tenant, e do lado de ca indice de negocio e SEMPRE composto com
// `tenant_id` (regra 2) - senao a UC 000123 do tenant A somaria a economia da UC
// 000123 do tenant B, e o numero errado sairia impresso sem erro em lugar nenhum.
//
// ============================================================================
// O QUE ESTE ARQUIVO NAO FAZ: A CONTA
//
// Ele grava o que `calcular()` produziu e le de volta. Nenhuma das nove parcelas
// em centavos e recalculada aqui - e os tres CHECKs da migration 29 conferem que
// as partes somam o todo antes de a linha entrar. Se este arquivo somasse, seria
// a segunda implementacao da conta.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { exigirCentavos, type Centavos } from '../dominio/centavos.ts';
import {
  paraDecimal, decimalParaTexto,
  type CamposDaFaturaUnificada, type ContaDaFatura, type ParametrosDaEmissao,
} from '../dominio/fatura-unificada.ts';
import type { DadosDoBoleto } from '../dominio/folha-unificada.ts';

export class RegistroNaoEncontrado extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Registro de fatura ${id} nao encontrado neste tenant.`);
    this.name = 'RegistroNaoEncontrado';
  }
}

export class CompetenciaIlegivel extends TypeError {
  readonly status = 422;
  constructor(bruto: string) {
    super(
      `Nao consegui ler a competencia "${bruto}". Use MM/AAAA (o que o extrator devolve) `
      + 'ou AAAA-MM. A competencia e a CHAVE do registro por UC: sem ela, a segunda fatura '
      + 'do mesmo mes viraria uma linha nova em vez de corrigir a primeira.'
    );
    this.name = 'CompetenciaIlegivel';
  }
}

export class UcIlegivel extends TypeError {
  readonly status = 422;
  constructor() {
    super(
      'A fatura nao tem numero de unidade consumidora, e ele e a outra metade da chave. '
      + 'Preencha o campo "Unidade consumidora" antes de registrar.'
    );
    this.name = 'UcIlegivel';
  }
}

/**
 * `MM/AAAA` ou `AAAA-MM` -> o PRIMEIRO DIA do mes.
 *
 * O dia 1 nao e detalhe: e o CHECK `registro_competencia_no_dia_1` da migration
 * 29, e o motivo e o mesmo de `fatura.competencia`. Sem ele a mesma UC teria uma
 * linha para 01/07 e outra para 15/07, e a unica coisa que existe e o mes.
 */
export function primeiroDiaDaCompetencia(bruto: string): Date {
  const s = String(bruto ?? '').trim();
  const br = /^(\d{2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  const ano = br ? br[2] : iso?.[1];
  const mes = br ? br[1] : iso?.[2];
  if (!ano || !mes) throw new CompetenciaIlegivel(bruto);
  const n = Number(mes);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new CompetenciaIlegivel(bruto);
  return new Date(`${ano}-${mes}-01T00:00:00.000Z`);
}

/** `AAAA-MM-DD` -> `Date`, e `null` quando nao e data. O extrator devolve
 *  `DD/MM/AAAA`; a tela nao converte, entao os dois formatos chegam aqui. */
function data(bruto: string | null | undefined): Date | null {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`);
  if (iso) return new Date(`${s}T00:00:00.000Z`);
  return null;
}

const inteiro = (v: string): number | null => {
  const n = Number(String(v ?? '').replace(/\D/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const decimal = (v: string, casas: number) => decimalParaTexto(paraDecimal(v), casas);

export type RegistroDeFatura = {
  campos: CamposDaFaturaUnificada;
  parametros: ParametrosDaEmissao;
  conta: ContaDaFatura;
  boleto: DadosDoBoleto;
  campos_personalizados?: Record<string, string>;
};

/**
 * GRAVA (ou corrige) a fatura de uma UC numa competencia.
 *
 * E `upsert` pela chave de negocio, e nao `create`: registrar duas vezes o mesmo
 * mes da mesma UC nao produz duas economias - produz uma correcao. Sem isso, o
 * operador que conferisse um numero e registrasse de novo dobraria a economia
 * acumulada impressa na folha do cliente.
 *
 * A LIGACAO COM A UC DO CADASTRO E OPCIONAL e resolvida aqui, por `numero_uc`.
 * Exigir que a UC exista para registrar inverteria a ordem do trabalho - quem
 * sobe o PDF esta conferindo, e travar a conferencia por cadastro faltando e o
 * tipo de exigencia que faz a pessoa registrar em outro lugar.
 */
export async function registrar(e: RegistroDeFatura) {
  await exigir('escrever_carteira');
  const tenant_id = tenantCorrente();

  const numero_uc = String(e.campos.unidade_consumidora ?? '').trim();
  if (!numero_uc) throw new UcIlegivel();
  const competencia = primeiroDiaDaCompetencia(e.campos.mes_referencia);

  const uc = await dbt().unidade_consumidora.findFirst({
    where: { tenant_id, numero_uc }, select: { id: true },
  });

  /* AS NOVE PARCELAS EM CENTAVOS passam por `exigirCentavos` antes do banco. Os
   * tres CHECKs da migration 29 ja conferem que elas SOMAM; isto confere que
   * cada uma e inteiro (regra 1) e nomeia qual falhou. */
  const c = e.conta;
  for (const [campo, v] of Object.entries({
    integral_centavos: c.integral_centavos,
    desconto_centavos: c.desconto_centavos,
    energia_g3_centavos: c.energia_g3_centavos,
    nao_compensado_centavos: c.nao_compensado_centavos,
    iluminacao_publica_centavos: c.iluminacao_publica_centavos,
    bandeira_centavos: c.bandeira_centavos,
    demais_centavos: c.demais_centavos,
    total_equatorial_centavos: c.total_equatorial_centavos,
    total_centavos: c.total_centavos,
  })) exigirCentavos(v, campo);

  const dados = {
    unidade_consumidora_id: uc?.id ?? null,
    cliente_nome: e.campos.cliente.trim() || null,
    cliente_documento: e.campos.documento.trim() || null,
    endereco: e.campos.endereco.trim() || null,
    classificacao: e.campos.classificacao.trim() || null,
    data_emissao: data(e.campos.data_emissao),
    leitura_anterior: data(e.campos.leitura_anterior),
    leitura_atual: data(e.campos.leitura_atual),
    dias_faturados: inteiro(e.campos.dias_faturados),
    vencimento: data(e.campos.vencimento),
    bandeira_tarifaria: e.campos.bandeira_tarifaria.trim() || null,

    compensada_kwh: decimal(c.compensada_kwh, 3),
    nao_compensado_kwh: decimal(e.campos.consumo_nao_compensado_kwh, 3),
    tarifa_kwh: decimal(c.tarifa_kwh, 6),
    percentual_desconto: decimal(c.percentual_desconto, 2),
    fator_emissao: decimal(e.parametros.fator_emissao, 6),

    integral_centavos: c.integral_centavos,
    desconto_centavos: c.desconto_centavos,
    energia_g3_centavos: c.energia_g3_centavos,
    nao_compensado_centavos: c.nao_compensado_centavos,
    iluminacao_publica_centavos: c.iluminacao_publica_centavos,
    bandeira_centavos: c.bandeira_centavos,
    demais_centavos: c.demais_centavos,
    total_equatorial_centavos: c.total_equatorial_centavos,
    total_centavos: c.total_centavos,

    linha_digitavel: e.boleto.linha_digitavel.trim() || null,
    pix_copia_e_cola: e.boleto.pix_copia_e_cola.trim() || null,
    nosso_numero: e.boleto.nosso_numero.trim() || null,
    instrucoes: e.boleto.instrucoes.map((t) => String(t ?? '').trim()).filter(Boolean),

    historico_consumo: e.campos.historico_consumo as unknown as object,
    campos_personalizados: (e.campos_personalizados ?? {}) as unknown as object,
    atualizado_em: new Date(),
  };

  return dbt().registro_de_fatura_unificada.upsert({
    where: { tenant_id_numero_uc_competencia: { tenant_id, numero_uc, competencia } },
    create: { tenant_id, numero_uc, competencia, ...dados },
    update: dados,
  });
}

/** A serie de uma UC, da mais nova para a mais velha. E o que a tela lista. */
export async function daUnidade(numeroUc: string, limite = 60) {
  await exigir('ler');
  return dbt().registro_de_fatura_unificada.findMany({
    where: { tenant_id: tenantCorrente(), numero_uc: String(numeroUc ?? '').trim() },
    orderBy: [{ competencia: 'desc' }],
    take: Math.max(1, Math.min(limite, 240)),
  });
}

/** As ultimas competencias do tenant inteiro, para a lista da aba. */
export async function recentes(limite = 50) {
  await exigir('ler');
  return dbt().registro_de_fatura_unificada.findMany({
    where: { tenant_id: tenantCorrente() },
    orderBy: [{ competencia: 'desc' }, { numero_uc: 'asc' }],
    take: Math.max(1, Math.min(limite, 500)),
  });
}

export async function apagar(id: string) {
  await exigir('escrever_carteira');
  const tenant_id = tenantCorrente();
  const existe = await dbt().registro_de_fatura_unificada.findFirst({ where: { id, tenant_id } });
  if (!existe) throw new RegistroNaoEncontrado(id);
  await dbt().registro_de_fatura_unificada.delete({ where: { id } });
}

const MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export type EconomiaAcumulada = {
  /** A soma dos descontos das faturas ANTERIORES desta UC, em centavos. */
  centavos: Centavos;
  /** "com a G3 Solar desde <isto>", ou `null` se e a primeira. */
  desde: string | null;
  /** Quantas faturas entraram na soma. */
  faturas: number;
};

/**
 * A ECONOMIA ACUMULADA DE UMA UC ATE (E INCLUINDO) UMA COMPETENCIA.
 *
 * A SOMA E FEITA PELO POSTGRES e nao em JavaScript, e nao e detalhe de estilo:
 * sao inteiros somando inteiros no lugar onde eles ja estao, sem trazer N linhas
 * para o Node so para reduzi-las. Com uma UC de tres anos sao 36 linhas; com o
 * volume que este sistema pretende operar, e uma consulta em vez de um laco.
 *
 * INCLUI A COMPETENCIA CORRENTE quando ela ja foi registrada, e e o que faz a
 * segunda via de uma fatura sair IGUAL a primeira: se a soma parasse na anterior,
 * reimprimir a de julho depois de registrar agosto mudaria o numero impresso numa
 * folha que ja circulou.
 */
export async function economiaAcumulada(
  numeroUc: string, ate: Date,
): Promise<EconomiaAcumulada> {
  await exigir('ler');
  const numero_uc = String(numeroUc ?? '').trim();
  if (!numero_uc) return { centavos: 0, desde: null, faturas: 0 };

  const r = await dbt().registro_de_fatura_unificada.aggregate({
    where: { tenant_id: tenantCorrente(), numero_uc, competencia: { lte: ate } },
    _sum: { desconto_centavos: true },
    _min: { competencia: true },
    _count: { _all: true },
  });

  const centavos = r._sum.desconto_centavos ?? 0;
  const primeira = r._min.competencia;
  /* SO DIZ "DESDE" COM MAIS DE UMA FATURA. Com uma so, "desde julho de 2026" na
   * propria fatura de julho e uma frase que nao informa nada - e a referencia
   * diz "Primeira fatura com a G3 Solar" nesse caso, que e o certo. */
  const desde = primeira && r._count._all > 1
    ? `${MES[primeira.getUTCMonth()]} de ${primeira.getUTCFullYear()}`
    : null;
  return { centavos, desde, faturas: r._count._all };
}
