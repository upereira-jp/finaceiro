// Repositorio do split. Junta os insumos, chama o motor puro, persiste.
//
// A DIVISAO DE TRABALHO E DELIBERADA: toda a aritmetica esta em
// src/dominio/split.ts, que nao conhece banco. Aqui so ha leitura de insumo,
// escrita e as duas regras que dependem de estado - a R12 (usina sem dono
// bloqueia) e qual parcela do PRD 5.4 incide.
//
// POR QUE O SPLIT NAO E CHAMADO PELA ROTA, e sim pela liquidacao: o PRD 5.2 diz
// "o split roda exclusivamente na liquidacao". Se fosse chamavel de fora,
// existiria um caminho para repartir dinheiro que nao entrou. A funcao e
// exportada porque o teste precisa dela, e o unico chamador de producao e
// src/repos/liquidacao.ts, na mesma transacao da baixa.

import { dbt } from '../db/tipado.ts';
import { db, tenantCorrente, exigir } from '../db/contexto.ts';
import { calcularSplit, type EntradaDoSplit, type ResultadoDoSplit } from '../dominio/split.ts';
import { provisionarDoSplit, type DespesaDoSplit } from './conta_pagar.ts';

export class RepasseBloqueado extends Error {
  readonly status = 422;
  constructor(codigoGeradora: string) {
    super(
      `R12: a usina ${codigoGeradora} nao tem dono cadastrado, e o repasse nao pode ser ` +
      'executado. O split inteiro para aqui em vez de rodar sem o item de repasse: sem ele, ' +
      'os 70% do dono cairiam no liquido G3 e a empresa apareceria lucrando o que deve a ' +
      'terceiro. AUD-08 - dono nulo em 3 de 3 usinas em 28/07.'
    );
    this.name = 'RepasseBloqueado';
  }
}

export class RegraDivergente extends Error {
  readonly status = 500;
  constructor(qual: string, daLinha: string, daFuncao: string) {
    super(
      `A regra de ${qual} selecionada pela linha diz ${daLinha}% e app.percentual_${qual}() diz ` +
      `${daFuncao}%. As duas usam o mesmo predicado de vigencia e tem de concordar; se ` +
      'divergiram, alguem alterou uma das duas sem a outra. Split abortado.'
    );
    this.name = 'RegraDivergente';
  }
}

export class SplitJaExecutado extends Error {
  readonly status = 409;
  constructor() {
    super('Esta liquidacao ja foi repartida. O unico por liquidacao existe para o webhook duplicado da Sicoob nao pagar o dono da usina duas vezes.');
    this.name = 'SplitJaExecutado';
  }
}

type Insumos = {
  liquidacao_id: string; fatura_id: string; contrato_id: string;
  competencia: Date;
  valor_liquidado_centavos: number;
  valor_consumo_centavos: number;
  valor_tarifas_concessionaria_centavos: number;
  juros_centavos: number; multa_centavos: number;
  flag_fatura_cheia: boolean;
  faturas_cheias_pagas: number;
  originador_id: string | null;
  originador_tipo_no_fechamento: string | null;
  data_fechamento: Date;
  usina_id: string; codigo_geradora: string; dono_usina_id: string | null;
};

/**
 * Tudo o que o split precisa, numa consulta. Uma segunda consulta abriria a
 * janela em que a fatura muda entre uma e outra - dentro da mesma transacao
 * isso nao acontece, mas a consulta unica tambem e a que deixa obvio que o
 * conjunto de insumos e fechado.
 */
async function insumos(liquidacaoId: string): Promise<Insumos | null> {
  const r: any[] = await db().$queryRaw`
    SELECT l.id  AS liquidacao_id, l.fatura_id, l.juros_centavos, l.multa_centavos,
           l.valor_liquidado_centavos,
           f.competencia, f.valor_consumo_centavos, f.valor_tarifas_concessionaria_centavos,
           f.flag_fatura_cheia, f.usina_id,
           k.id AS contrato_id, k.faturas_cheias_pagas, k.originador_id,
           k.originador_tipo_no_fechamento::text AS originador_tipo_no_fechamento,
           k.data_fechamento,
           u.codigo_geradora, u.dono_usina_id
      FROM liquidacao l
      JOIN fatura   f ON f.tenant_id = l.tenant_id AND f.id = l.fatura_id
      JOIN contrato k ON k.tenant_id = f.tenant_id AND k.id = f.contrato_id
      JOIN usina    u ON u.tenant_id = f.tenant_id AND u.id = f.usina_id
     WHERE l.id = ${liquidacaoId}::uuid`;
  return (r?.[0] as Insumos) ?? null;
}

/**
 * A regra de repasse vigente NA COMPETENCIA (R25), com o id da linha.
 *
 * POR QUE A LINHA E A FUNCAO SAO LIDAS AS DUAS. O split tem de gravar QUAL
 * versao da regra produziu o numero (PRD 4.3), e versao e a linha - a funcao
 * devolve so o percentual. Ler a linha pelo mesmo predicado da funcao poderia
 * virar uma segunda implementacao da selecao, que e exatamente o que a R21
 * proibe; entao o percentual da linha e CONFERIDO contra o da funcao, e a
 * divergencia aborta. A duplicacao vira igualdade verificada em vez de
 * divergencia silenciosa.
 *
 * Nenhuma das duas usa LIMIT 1: a garantia de linha unica e o EXCLUDE da R21.
 */
async function regraDeRepasse(usinaId: string, competencia: Date) {
  const r: any[] = await db().$queryRaw`
    SELECT rr.id, rr.percentual::text AS percentual,
           app.percentual_repasse(${usinaId}::uuid, ${competencia})::text AS oficial
      FROM regra_repasse rr
     WHERE rr.usina_id = ${usinaId}::uuid
       AND daterange(rr.vigencia_inicio, rr.vigencia_fim, '[)') @> ${competencia}::date`;
  const l = r?.[0];
  if (!l) return null;   // app.percentual_repasse ja teria levantado; defesa dupla
  if (Number(l.percentual) !== Number(l.oficial)) throw new RegraDivergente('repasse', l.percentual, l.oficial);
  return { id: l.id as string, percentual: l.percentual as string };
}

async function regraDeComissao(tier: string, parcela: 1 | 2, dataFechamento: Date) {
  const r: any[] = await db().$queryRaw`
    SELECT rc.id, rc.percentual::text AS percentual,
           app.percentual_comissao(${tier}::originador_tipo, ${parcela}::smallint, ${dataFechamento})::text AS oficial
      FROM regra_comissao rc
     WHERE rc.originador_tipo = ${tier}::originador_tipo
       AND rc.parcela = ${parcela}::smallint
       AND daterange(rc.vigencia_inicio, rc.vigencia_fim, '[)') @> ${dataFechamento}::date`;
  const l = r?.[0];
  if (!l) return null;
  if (Number(l.percentual) !== Number(l.oficial)) throw new RegraDivergente('comissao', l.percentual, l.oficial);
  return { id: l.id as string, percentual: l.percentual as string };
}

export type SplitExecutado = ResultadoDoSplit & {
  split_execucao_id: string;
  /** Quantas contas a pagar o split provisionou. PRD 5.5 itens 2 e 3. */
  contas_a_pagar: number;
};

/**
 * Reparte uma liquidacao. Chamado pela baixa, na mesma transacao dela.
 *
 * ORDEM QUE NAO PODE INVERTER, e ela esta escrita tambem na migration 17: o
 * contador `faturas_cheias_pagas` e lido AQUI, antes de a execucao existir; o
 * gatilho do banco o avanca DEPOIS do INSERT. Ler depois de inserir daria
 * parcela 2 na primeira fatura cheia de todo contrato - a comissao inteira
 * pagaria a taxa errada, e nada quebraria.
 */
export async function executar(liquidacaoId: string): Promise<SplitExecutado> {
  await exigir('escrever_carteira');
  const i = await insumos(liquidacaoId);
  if (!i) throw Object.assign(new Error('Liquidacao nao encontrada.'), { status: 404 });

  const jaFeito = await dbt().split_execucao.findFirst({ where: { liquidacao_id: liquidacaoId } });
  if (jaFeito) throw new SplitJaExecutado();

  // R12. Bloqueia o split INTEIRO, e o motivo esta na mensagem do erro.
  if (!i.dono_usina_id) throw new RepasseBloqueado(i.codigo_geradora);

  const repasse = await regraDeRepasse(i.usina_id, i.competencia);
  if (!repasse) throw Object.assign(new Error(`Sem regra de repasse vigente para a usina ${i.codigo_geradora} na competencia.`), { status: 422 });

  /*
   * Qual parcela do PRD 5.4 incide. Tres condicoes, e cada uma tem fonte:
   *   - ha originador no contrato                (sem beneficiario, sem item)
   *   - a fatura e CHEIA                         ("nao-cheia nao gera comissao")
   *   - a proxima parcela ainda e 1 ou 2         ("da 3a em diante, comissao zero")
   * O tier vem CONGELADO do contrato, nunca de originador.tipo corrente (R20-b).
   */
  const proxima = i.faturas_cheias_pagas + 1;
  let comissao: EntradaDoSplit['comissao'] = null;
  if (i.originador_id && i.originador_tipo_no_fechamento && i.flag_fatura_cheia && proxima <= 2) {
    const parcela = proxima as 1 | 2;
    const regra = await regraDeComissao(i.originador_tipo_no_fechamento, parcela, i.data_fechamento);
    if (!regra) {
      throw Object.assign(
        new Error(
          `Sem regra_comissao vigente para o tier ${i.originador_tipo_no_fechamento}, parcela ` +
          `${parcela}, na data de fechamento do contrato. R26: ausencia de preco levanta.`),
        { status: 422 });
    }
    comissao = {
      originadorId: i.originador_id, percentual: regra.percentual,
      regraComissaoId: regra.id, parcela,
    };
  }

  const resultado = calcularSplit({
    valorLiquidadoCentavos: i.valor_liquidado_centavos,
    valorConsumoCentavos: i.valor_consumo_centavos,
    valorTarifasConcessionariaCentavos: i.valor_tarifas_concessionaria_centavos,
    jurosCentavos: i.juros_centavos,
    multaCentavos: i.multa_centavos,
    repasse: { donoUsinaId: i.dono_usina_id, percentual: repasse.percentual, regraRepasseId: repasse.id },
    comissao,
  });

  const tenant = tenantCorrente();
  const execucao = await dbt().split_execucao.create({
    data: {
      tenant_id: tenant,
      liquidacao_id: i.liquidacao_id,
      fatura_id: i.fatura_id,
      contrato_id: i.contrato_id,
      competencia: i.competencia,
      valor_liquidado_centavos: i.valor_liquidado_centavos,
      base_consumo_centavos: resultado.baseConsumoCentavos,
      base_repasse_centavos: resultado.baseRepasseCentavos,
      parcela_comissao: resultado.parcelaComissao,
    },
  });

  /*
   * O ID SAI DAQUI, E NAO DO BANCO, e o motivo e a linha seguinte: as contas a
   * pagar precisam apontar para o `split_item` que as gerou, e `createMany` nao
   * devolve os ids. As alternativas eram um `create` por item (quatro viagens no
   * lugar de uma, dentro da transacao da baixa) ou um `findMany` depois - e
   * gerar o uuid aqui e o que `sincronizacao.ts` ja faz com os clientes do
   * rateio, pelo mesmo motivo.
   */
  const itens = resultado.itens.map((it) => ({ id: crypto.randomUUID(), ...it }));

  await dbt().split_item.createMany({
    data: itens.map((it) => ({
      id: it.id,
      tenant_id: tenant,
      split_execucao_id: execucao.id,
      tipo: it.tipo,
      dono_usina_id: it.dono_usina_id,
      originador_id: it.originador_id,
      base_calculo_centavos: it.base_calculo_centavos,
      percentual_aplicado: it.percentual_aplicado,
      valor_centavos: it.valor_centavos,
      regra_repasse_id: it.regra_repasse_id,
      regra_comissao_id: it.regra_comissao_id,
    })),
  });

  /*
   * AS DUAS ESCRITAS QUE FALTAVAM - PRD 5.5, itens 2 e 3, "na mesma transacao do
   * split". Ate 03/08/2026 esta funcao gravava DUAS das quatro, e a consequencia
   * nao era uma escrita a menos: era que o sistema saberia ao centavo QUANTO o
   * dono da usina e o originador tinham a receber e **nao teria onde registrar
   * que foram pagos**. Os relatorios sao extrato de apuracao, nao de quitacao, e
   * nada impedia pagar duas vezes o mesmo repasse. `Q-PAGAMENTO-01`.
   *
   * NA MESMA TRANSACAO, e nao "logo depois": esta funcao ja roda dentro da
   * transacao da baixa (`repos/liquidacao.ts`), entao provisionar aqui herda o
   * tudo-ou-nada que o PRD exige - "falha em qualquer parte reverte tudo".
   * Provisionar num segundo passo abriria a janela em que a liquidacao existe, o
   * split existe, e a despesa nao.
   *
   * `liquido_g3` NAO entra: e receita, e provisiona-la como despesa faria a
   * empresa dever a si mesma. O item 4 do PRD 5.5 - "receita G3 refletida no
   * fluxo e no DRE" - depende de `movimento_caixa`, que nao esta nesta fatia
   * (ver o cabecalho da migration 22).
   */
  const despesas = itens
    .filter((it) => it.tipo !== 'liquido_g3')
    .map((it) => ({
      split_item_id: it.id,
      tipo: it.tipo as DespesaDoSplit['tipo'],
      valor_centavos: it.valor_centavos,
      dono_usina_id: it.dono_usina_id,
      originador_id: it.originador_id,
    }));

  const provisionado = await provisionarDoSplit({
    competencia: i.competencia,
    itens: despesas,
    rotulo: `${i.codigo_geradora} ${i.competencia.toISOString().slice(0, 7)}`,
  });

  return { ...resultado, split_execucao_id: execucao.id, contas_a_pagar: provisionado.criadas };
}

// ---------------------------------------------------------------- leitura

/** O drill-down do PRD 9: fatura -> liquidacao -> itens. */
export async function porLiquidacao(liquidacaoId: string) {
  await exigir('ler');
  return dbt().split_execucao.findFirst({
    where: { liquidacao_id: liquidacaoId },
    include: { split_item: { orderBy: [{ tipo: 'asc' }] } },
  });
}

export async function daCompetencia(competencia: Date, limite = 500) {
  await exigir('ler');
  return dbt().split_execucao.findMany({
    where: { competencia },
    include: { split_item: true },
    orderBy: [{ executado_em: 'asc' }],
    take: Math.min(limite, 2000),
  });
}

/** Os dois extratos agregados. Views com security_invoker (invariante 13) -
 *  sem a opcao, um tenant leria a lista de pagamentos de outro. */
export async function repassesPorDono(competencia?: Date) {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT dono, competencia, itens::int, valor_centavos::int
      FROM repasse_por_dono_usina
     WHERE (${competencia ?? null}::date IS NULL OR competencia = ${competencia ?? null}::date)
     ORDER BY competencia DESC, dono`;
  return r;
}

export async function comissoesPorOriginador(competencia?: Date) {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT originador, competencia, parcela_comissao::int, itens::int, valor_centavos::int
      FROM comissao_por_originador
     WHERE (${competencia ?? null}::date IS NULL OR competencia = ${competencia ?? null}::date)
     ORDER BY competencia DESC, originador`;
  return r;
}
