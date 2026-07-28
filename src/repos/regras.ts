// Repositorio das TRES tabelas de "valor com data": tarifa, regra_comissao e
// regra_repasse. Os tres ultimos cadastros que faltavam da F1.
//
// UM ARQUIVO PARA AS TRES porque a regra que as governa e uma so, e ela e a R21:
// "nunca tem vigencia sobreposta para a mesma chave, e a garantia e do banco
// (EXCLUDE USING gist), nao da aplicacao". Tres arquivos com a mesma logica de
// versionamento seriam tres lugares para errar a ordem das duas escritas.
//
// A UNICA OPERACAO DE ESCRITA E "ABRIR NOVA VIGENCIA". Nao ha `editar`, e a
// ausencia e o desenho: o PRD 4.6 diz "nunca editada no lugar. Cada mudanca cria
// versao com vigencia". Editar o percentual de uma linha vigente reprecificaria
// todo repasse e toda comissao ja calculados sobre ela - o furo que a R20-b
// fechou na comissao e a R25 fechou no repasse, com o mesmo nome de coluna
// mutavel.
//
// A ORDEM DAS DUAS ESCRITAS E OBRIGATORIA, e e a mesma licao da renovacao de
// contrato (R14, src/repos/contrato.ts): FECHA a vigencia velha ANTES de inserir
// a nova. O EXCLUDE nao e DEFERRABLE - inserir primeiro da 23P01 e passa em
// teste com tabela vazia, que e o pior lugar para descobrir.

import { dbt } from '../db/tipado.ts';
import { db, tenantCorrente, exigir } from '../db/contexto.ts';
import type { originador_tipo as OriginadorTipo } from '../generated/prisma/enums.ts';

export class VigenciaNoPassado extends Error {
  readonly status = 422;
  constructor(inicio: string, ultimoFechamento: string) {
    super(
      `A nova vigencia comeca em ${inicio}, e ha vigencia aberta desde ${ultimoFechamento}. ` +
      'Uma vigencia nova que comeca ANTES da atual reprecifica retroativamente o que ja foi ' +
      'faturado ou repassado - se e isso mesmo, feche a atual explicitamente primeiro.'
    );
    this.name = 'VigenciaNoPassado';
  }
}

export class VigenciaSobreposta extends Error {
  readonly status = 409;
  constructor(qual: string) {
    super(
      `O banco recusou a vigencia de ${qual} por sobreposicao (23P01). E a R21, e ela existe ` +
      'porque aliquota nao pode depender de qual linha o planejador devolveu primeiro - o ' +
      'Comissionamento das views do CRM usa LIMIT 1 sem ORDER BY, e por isso o mesmo lead ' +
      'pode pagar 25% hoje e 50% amanha.'
    );
    this.name = 'VigenciaSobreposta';
  }
}

/** `numeric` sai e entra como STRING. number aqui seria a porta do float, e a
 *  regra 1 o proibe ate em calculo intermediario. */
function decimal(v: string, campo: string, casas: number): string {
  if (typeof v !== 'string') {
    throw new TypeError(`${campo} deve ser string decimal, nao number - float perde precisao antes do banco`);
  }
  const s = v.trim();
  if (!new RegExp(`^\\d{1,4}(\\.\\d{1,${casas}})?$`).test(s)) {
    throw new TypeError(`${campo} deve ser decimal com ate ${casas} casas, recebeu ${JSON.stringify(v)}`);
  }
  return s;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const traduzir = (err: any, qual: string): never => {
  // 23P01 = exclusion_violation. O Prisma o entrega como P2010/raw conforme o
  // caminho; conferir os dois evita que a mensagem util dependa de qual foi.
  if (err?.meta?.code === '23P01' || /23P01|exclusion/i.test(String(err?.message))) {
    throw new VigenciaSobreposta(qual);
  }
  throw err;
};

// ================================================================ tarifa
/**
 * R22: tarifa e `numeric(12,6)` em R$/kWh, NAO centavos. E preco por unidade -
 * dimensionalmente uma taxa, como percentual de rateio. Medido na R22: truncar
 * 1,187650 em centavos cobra R$ 2,90 a mais numa UC, num mes, sempre a mais.
 */
export async function abrirVigenciaDeTarifa(e: {
  distribuidora: string; tarifa_reais_por_kwh: string; vigencia_inicio: Date;
}) {
  await exigir('administrar');
  const valor = decimal(e.tarifa_reais_por_kwh, 'tarifa_reais_por_kwh', 6);
  const inicio = iso(e.vigencia_inicio);

  const aberta = await dbt().tarifa.findFirst({
    where: { distribuidora: e.distribuidora, vigencia_fim: null },
  });
  if (aberta) {
    if (iso(aberta.vigencia_inicio) >= inicio) throw new VigenciaNoPassado(inicio, iso(aberta.vigencia_inicio));
    // FECHA antes de inserir. Ver o cabecalho.
    await dbt().tarifa.updateMany({ where: { id: aberta.id }, data: { vigencia_fim: e.vigencia_inicio } });
  }

  try {
    return await dbt().tarifa.create({
      data: {
        tenant_id: tenantCorrente(),
        distribuidora: e.distribuidora.trim(),
        tarifa_reais_por_kwh: valor,
        vigencia_inicio: e.vigencia_inicio,
      },
    });
  } catch (err) { return traduzir(err, 'tarifa'); }
}

export async function tarifasDe(distribuidora: string) {
  await exigir('ler');
  return dbt().tarifa.findMany({
    where: { distribuidora }, orderBy: [{ vigencia_inicio: 'desc' }],
  });
}

/** A funcao do banco, e nao uma segunda implementacao da selecao por vigencia.
 *  Ela LEVANTA quando nao ha tarifa (R26) - ausencia de preco e erro, e o
 *  chamador ve `no_data_found` em vez de um NULL que soma como nada. */
export async function tarifaVigente(distribuidora: string, competencia: Date): Promise<string> {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT app.tarifa_vigente(${distribuidora}, ${competencia})::text AS tarifa`;
  return r[0].tarifa as string;
}

// ================================================================ comissao
/**
 * PRD 5.4: a comissao e ESCALONADA pela 1a e pela 2a fatura cheia paga, e por
 * isso a chave de vigencia inclui a PARCELA desde a migration 17. Abrir vigencia
 * nova exige informar as duas parcelas juntas: abrir so a 1a deixaria a 2a
 * apontando para a vigencia velha, e o contrato pagaria metade pela regra nova e
 * metade pela antiga sem ninguem pedir isso.
 */
export async function abrirVigenciaDeComissao(e: {
  originador_tipo: OriginadorTipo;
  percentual_1a: string;
  percentual_2a: string;
  vigencia_inicio: Date;
}) {
  await exigir('administrar');
  const p1 = decimal(e.percentual_1a, 'percentual_1a', 2);
  const p2 = decimal(e.percentual_2a, 'percentual_2a', 2);
  const inicio = iso(e.vigencia_inicio);

  const abertas = await dbt().regra_comissao.findMany({
    where: { originador_tipo: e.originador_tipo, vigencia_fim: null },
  });
  for (const a of abertas) {
    if (iso(a.vigencia_inicio) >= inicio) throw new VigenciaNoPassado(inicio, iso(a.vigencia_inicio));
  }
  if (abertas.length) {
    await dbt().regra_comissao.updateMany({
      where: { id: { in: abertas.map((a) => a.id) } }, data: { vigencia_fim: e.vigencia_inicio },
    });
  }

  try {
    await dbt().regra_comissao.createMany({
      data: [1, 2].map((parcela) => ({
        tenant_id: tenantCorrente(),
        originador_tipo: e.originador_tipo,
        parcela,
        percentual: parcela === 1 ? p1 : p2,
        vigencia_inicio: e.vigencia_inicio,
      })),
    });
  } catch (err) { return traduzir(err, 'regra_comissao'); }

  return dbt().regra_comissao.findMany({
    where: { originador_tipo: e.originador_tipo, vigencia_inicio: e.vigencia_inicio },
    orderBy: [{ parcela: 'asc' }],
  });
}

export async function comissoesDe(originadorTipo: OriginadorTipo) {
  await exigir('ler');
  return dbt().regra_comissao.findMany({
    where: { originador_tipo: originadorTipo },
    orderBy: [{ vigencia_inicio: 'desc' }, { parcela: 'asc' }],
  });
}

/**
 * R20-b: recebe o tier CONGELADO no contrato e a data de FECHAMENTO, nunca o
 * tipo corrente do originador e nunca a data de hoje. Um captador promovido a
 * senior em junho nao faz o contrato de marco recalcular a 60%.
 */
export async function percentualDeComissao(
  tierNoFechamento: OriginadorTipo, parcela: 1 | 2, dataFechamento: Date,
): Promise<string> {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT app.percentual_comissao(
      ${tierNoFechamento}::originador_tipo, ${parcela}::smallint, ${dataFechamento})::text AS pct`;
  return r[0].pct as string;
}

// ================================================================ repasse
/**
 * R25: o percentual de repasse e o vigente na COMPETENCIA, nunca o corrente da
 * usina. Por usina e nao por tenant - cada dono negocia o seu -, e por vigencia
 * e nao congelado no contrato: o contrato e com o consumidor, o repasse e com o
 * dono da usina, e sao duas contrapartes com datas proprias. Contrato fechado em
 * marco nao fixa o que se deve ao dono da usina em novembro.
 */
export async function abrirVigenciaDeRepasse(e: {
  usina_id: string; percentual: string; vigencia_inicio: Date;
}) {
  await exigir('administrar');
  const pct = decimal(e.percentual, 'percentual', 2);
  const inicio = iso(e.vigencia_inicio);

  const aberta = await dbt().regra_repasse.findFirst({
    where: { usina_id: e.usina_id, vigencia_fim: null },
  });
  if (aberta) {
    if (iso(aberta.vigencia_inicio) >= inicio) throw new VigenciaNoPassado(inicio, iso(aberta.vigencia_inicio));
    await dbt().regra_repasse.updateMany({ where: { id: aberta.id }, data: { vigencia_fim: e.vigencia_inicio } });
  }

  try {
    return await dbt().regra_repasse.create({
      data: {
        tenant_id: tenantCorrente(),
        usina_id: e.usina_id,
        percentual: pct,
        vigencia_inicio: e.vigencia_inicio,
      },
    });
  } catch (err) { return traduzir(err, 'regra_repasse'); }
}

export async function repassesDa(usinaId: string) {
  await exigir('ler');
  return dbt().regra_repasse.findMany({
    where: { usina_id: usinaId }, orderBy: [{ vigencia_inicio: 'desc' }],
  });
}

export async function percentualDeRepasse(usinaId: string, competencia: Date): Promise<string> {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT app.percentual_repasse(${usinaId}::uuid, ${competencia})::text AS pct`;
  return r[0].pct as string;
}

/**
 * As usinas ATIVAS sem regra de repasse vigente hoje. E a outra metade da fila
 * da R12: usina com dono cadastrado mas sem percentual vigente tambem nao
 * reparte - so que essa falha aparece com `no_data_found` no meio do split, em
 * vez de na conferencia. Esta consulta a traz para antes.
 */
export async function usinasSemRepasseVigente(competencia: Date) {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT u.id, u.codigo_geradora
      FROM usina u
     WHERE u.status = 'ativa'
       AND NOT EXISTS (
         SELECT 1 FROM regra_repasse rr
          WHERE rr.tenant_id = u.tenant_id AND rr.usina_id = u.id
            AND daterange(rr.vigencia_inicio, rr.vigencia_fim, '[)') @> ${competencia}::date)
     ORDER BY u.codigo_geradora`;
  return r;
}
