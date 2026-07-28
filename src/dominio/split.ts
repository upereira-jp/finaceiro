// O MOTOR DE SPLIT. PRD-v2.2 5.3, 5.4 e 5.5.
//
// Funcao PURA: entra o que a liquidacao e o cadastro dizem, sai a lista de
// itens. Nao le banco, nao escreve banco, nao conhece Prisma. O repositorio
// (src/repos/split.ts) junta os insumos e persiste; aqui so ha aritmetica e a
// regra.
//
// POR QUE PURA, e nao e preferencia de estilo: a invariante do centavo do PRD
// 5.5 e chamada de INEGOCIAVEL, e uma invariante que so pode ser exercitada com
// banco de pe, tenant provisionado e RLS montada e uma invariante testada uma
// vez por sessao. Assim ela e testada com uma chamada de funcao, e os casos
// dificeis - residuo de um centavo, liquido G3 negativo, comissao zerada na 3a
// fatura - saem em milissegundos e sem fixture.
//
// A constraint do banco continua sendo o MECANISMO (migration 17). Isto aqui
// nao a substitui: fecha a conta antes de escrever, para que o abort deferido
// no COMMIT - que sai longe da linha que o causou - nunca aconteca no caminho
// normal.

import { aplicarPercentual, proporcao, somar, emReais, type Centavos } from './centavos.ts';

export type TipoDeItem = 'repasse_usina' | 'comissao' | 'repasse_concessionaria' | 'liquido_g3';

export type ItemDeSplit = {
  tipo: TipoDeItem;
  dono_usina_id: string | null;
  originador_id: string | null;
  base_calculo_centavos: Centavos;
  /** String decimal, como o `numeric` chega e sai do Postgres. Nulo no residual
   *  e no repasse a concessionaria: nenhum dos dois vem de percentual. */
  percentual_aplicado: string | null;
  valor_centavos: Centavos;
  regra_repasse_id: string | null;
  regra_comissao_id: string | null;
};

export type EntradaDoSplit = {
  /** Sempre igual ao total da fatura: o PRD 5.2 nao aceita pagamento parcial, e
   *  a constraint `liquidacao_pelo_total` da migration 16 recusa o contrario. */
  valorLiquidadoCentavos: Centavos;
  valorConsumoCentavos: Centavos;
  valorTarifasConcessionariaCentavos: Centavos;
  jurosCentavos: Centavos;
  multaCentavos: Centavos;

  /** R12: usina sem dono BLOQUEIA a execucao do repasse. Por isso nao e
   *  opcional aqui - o repositorio levanta antes de chegar neste ponto. */
  repasse: { donoUsinaId: string; percentual: string; regraRepasseId: string };

  /** Ausente quando: o contrato nao tem originador, a fatura nao e cheia, ou o
   *  contrato ja pagou as duas parcelas do PRD 5.4. */
  comissao: {
    originadorId: string;
    percentual: string;
    regraComissaoId: string;
    parcela: 1 | 2;
  } | null;
};

export type ResultadoDoSplit = {
  itens: ItemDeSplit[];
  baseConsumoCentavos: Centavos;
  baseRepasseCentavos: Centavos;
  parcelaComissao: 1 | 2 | null;
};

export class SplitNaoFecha extends Error {
  readonly status = 500;
  constructor(soma: Centavos, liquidado: Centavos) {
    super(
      `PRD 5.5: a soma dos itens deu ${emReais(soma)} e o liquidado e ${emReais(liquidado)} ` +
      `(diferenca de ${soma - liquidado} centavo(s)). O motor calculou o liquido G3 por ` +
      'subtracao justamente para isto ser impossivel - se caiu aqui, a lista de itens ' +
      'mudou depois da subtracao.'
    );
    this.name = 'SplitNaoFecha';
  }
}

/**
 * Reparte o valor liquidado. Ordem dos itens = ordem de calculo, e ela importa:
 * o liquido G3 e o ULTIMO porque e o unico que nao se calcula, se apura.
 *
 *   base da comissao = somente o consumo                       (PRD 5.4)
 *   base do repasse  = consumo + a fatia proporcional do juro  (PRD 5.3)
 *   concessionaria   = repasse puro, sem percentual            (PRD 5.1)
 *   liquido G3       = liquidado - os tres acima               (PRD 5.5)
 */
export function calcularSplit(e: EntradaDoSplit): ResultadoDoSplit {
  const { valorLiquidadoCentavos: liquidado } = e;

  const jurosEMulta = somar([e.jurosCentavos, e.multaCentavos], 'juros/multa');
  const faturado = somar([e.valorConsumoCentavos, e.valorTarifasConcessionariaCentavos], 'componente');

  /*
   * A palavra "proporcionalmente" do PRD 5.3. O juro incidiu sobre o titulo
   * inteiro, e o titulo tem uma parte que nao gera repasse - a conta da
   * distribuidora. So a fatia do juro que corresponde ao consumo entra na base.
   * O resto do juro nao some: cai no residual, que e o liquido G3.
   */
  const jurosDoConsumo = proporcao(jurosEMulta, e.valorConsumoCentavos, faturado);

  const baseConsumo = e.valorConsumoCentavos;
  const baseRepasse = baseConsumo + jurosDoConsumo;

  const itens: ItemDeSplit[] = [];

  // ---------------------------------------------------------------- repasse
  itens.push({
    tipo: 'repasse_usina',
    dono_usina_id: e.repasse.donoUsinaId,
    originador_id: null,
    base_calculo_centavos: baseRepasse,
    percentual_aplicado: e.repasse.percentual,
    valor_centavos: aplicarPercentual(baseRepasse, e.repasse.percentual, 'percentual_repasse'),
    regra_repasse_id: e.repasse.regraRepasseId,
    regra_comissao_id: null,
  });

  /*
   * ---------------------------------------------------------------- comissao
   * O item entra MESMO VALENDO ZERO quando ha originador e a regra foi
   * consultada - e o caso do parceiro_indicador na 2a parcela, que o seed
   * declara como 0,00. Zero declarado e informacao: diz que o beneficiario
   * existia, que a regra daquela parcela foi aplicada e que nao havia o que
   * pagar. Ausencia de item diria outra coisa - que nao havia beneficiario.
   *
   * Ja o repasse a concessionaria mais abaixo NAO entra quando e zero, e a
   * assimetria e proposital: la o zero significa que a despesa nao existiu, e
   * um item de zero real seria linha vazia no extrato.
   */
  if (e.comissao) {
    itens.push({
      tipo: 'comissao',
      dono_usina_id: null,
      originador_id: e.comissao.originadorId,
      base_calculo_centavos: baseConsumo,
      percentual_aplicado: e.comissao.percentual,
      valor_centavos: aplicarPercentual(baseConsumo, e.comissao.percentual, 'percentual_comissao'),
      regra_repasse_id: null,
      regra_comissao_id: e.comissao.regraComissaoId,
    });
  }

  // ------------------------------------------------------- concessionaria
  if (e.valorTarifasConcessionariaCentavos > 0) {
    itens.push({
      tipo: 'repasse_concessionaria',
      dono_usina_id: null,
      originador_id: null,
      base_calculo_centavos: e.valorTarifasConcessionariaCentavos,
      percentual_aplicado: null,   // repasse puro: nao ha percentual, ha o valor
      valor_centavos: e.valorTarifasConcessionariaCentavos,
      regra_repasse_id: null,
      regra_comissao_id: null,
    });
  }

  /*
   * ---------------------------------------------------------- liquido G3
   * NAO se calcula: e a diferenca. E dai vem a invariante do centavo de graca,
   * e a resposta 8a da PAUTA - "arredonda-se no total, distribuindo o residuo" -
   * junto com o PRD 5.5 - "diferencas de arredondamento vao sempre para o
   * liquido G3". As duas dizem a mesma coisa quando o residual e o ultimo.
   *
   * PODE SER NEGATIVO, e o PRD 5.6 diz que sera: com captador senior, repasse
   * de 70% mais comissao de 30% consomem o consumo inteiro nas duas primeiras
   * faturas de cada contrato. Um centavo de residuo faz o numero cruzar o zero.
   * Recusar aqui esconderia o CAC concentrado que o PRD manda mostrar "sem
   * suavizacao" - e o `split_item_valor_coerente` da migration 17 abre a
   * excecao exatamente para este tipo, e so para ele.
   */
  const distribuido = somar(itens.map((i) => i.valor_centavos), 'item');
  itens.push({
    tipo: 'liquido_g3',
    dono_usina_id: null,
    originador_id: null,
    base_calculo_centavos: liquidado,
    percentual_aplicado: null,
    valor_centavos: liquidado - distribuido,
    regra_repasse_id: null,
    regra_comissao_id: null,
  });

  // A mesma conta que a constraint deferida faz no COMMIT, feita aqui antes de
  // escrever. Se um dia divergirem, e esta que esta errada - a do banco vale
  // para quem escrever por outro caminho.
  const soma = somar(itens.map((i) => i.valor_centavos), 'item');
  if (soma !== liquidado) throw new SplitNaoFecha(soma, liquidado);

  return {
    itens,
    baseConsumoCentavos: baseConsumo,
    baseRepasseCentavos: baseRepasse,
    parcelaComissao: e.comissao?.parcela ?? null,
  };
}
