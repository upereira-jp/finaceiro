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

/*
 * ================================================================ tarifa
 *
 * A TARIFA SAIU DAQUI EM 14/08/2026, com a migration 30. Ela era a terceira
 * "tabela de valor com data" deste arquivo - `tarifa`, chave (distribuidora,
 * vigencia) - e as duas funcoes que a serviam (`abrirVigenciaDeTarifa` e
 * `tarifasDe`) foram apagadas junto com a tabela.
 *
 * O QUE MEDIU A DECISAO, e ela e do dono: a granularidade real e POR CLIENTE.
 * Medido em 14/08 pelo join `rateio_clientes.lead_codigo -> vendas_ganhas.codigo`
 * do CRM: 41 das 41 UCs tem tarifa propria, e ela VARIA - 35 a 1,130000, 4 a
 * 1,16 e 2 a 1,180000. Uma tarifa por distribuidora obrigaria as 41 a
 * compartilharem um numero que 6 delas contradizem.
 *
 * Hoje a tarifa e `unidade_consumidora.tarifa_reais_por_kwh`, e quem a le na
 * composicao e `app.tarifa_da_uc(uuid)` - que mantem a R26 intacta: ausencia
 * LEVANTA (`no_data_found`), nunca vira zero.
 *
 * As outras duas tabelas deste arquivo - `regra_comissao` e `regra_repasse` -
 * continuam versionadas por vigencia, e por um motivo que a tarifa nao tinha:
 * elas sao REGRA e nao PRECO. A comissao de um contrato fechado em marco e a de
 * marco, para sempre (R20-b); a tarifa de uma UC e a que vale agora.
 */

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
