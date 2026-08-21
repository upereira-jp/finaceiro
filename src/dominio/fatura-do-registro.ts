// A FATURA UNIFICADA VIRANDO FATURA. As decisoes, nao a aritmetica.
//
// ============================================================================
// A DECISAO QUE ESTE ARQUIVO EXECUTA
//
// `Q-CICLO-01`, decidida pelo dono em 21/08/2026: **o caminho oficial e o
// UNIFICADO**. O valor sai da conta da distribuidora lida, e nao da geracao
// medida multiplicada pelo rateio.
//
// Ate aqui os dois caminhos existiam e nao se encontravam, e a consequencia
// estava medida: `registro_de_fatura_unificada` nao tinha ligacao com `fatura`,
// entao o documento que o cliente EFETIVAMENTE recebe era o unico dos dois que
// nao conseguia pagar o dono da usina. A migration 34 pos a coluna; este arquivo
// decide quando ela e preenchida.
//
// ============================================================================
// A ARITMETICA NAO ESTA AQUI, E NAO PODE ESTAR
//
// As nove parcelas em centavos ja foram calculadas por `calcular()` em
// `fatura-unificada.ts` e conferidas por tres CHECKs do banco (migration 29)
// antes de a linha existir. Este arquivo **copia duas delas** e nao recalcula
// nenhuma - recalcular seria a segunda implementacao da mesma conta, que e o
// defeito que a migration 9 registrou.
//
// O MAPA E DE UM PARA UM, e ele foi medido e nao suposto. `src/repos/split.ts`
// le da fatura exatamente duas parcelas, e a conta unificada produz exatamente
// duas:
//
//     energia_g3_centavos        -> valor_consumo_centavos
//                                   base da comissao (PRD 5.4) e do repasse (5.3)
//     total_equatorial_centavos  -> valor_tarifas_concessionaria_centavos
//                                   repasse PURO, sem percentual (PRD 5.1)
//
// O `PRD` 5.1 ja descrevia o repasse a concessionaria como "nao ha percentual, ha
// o valor" - que e literalmente o que a parte da Equatorial e numa fatura
// unificada. **Nenhuma linha do motor de split muda.**
//
// ============================================================================
// O QUE A CONTA LIDA NAO SUBSTITUI
//
// Escolher o caminho unificado muda DE ONDE VEM O VALOR. Nao muda quem recebe.
// A fatura continua exigindo contrato, usina e rateio - nao para calcular, mas
// porque e da usina que sai o repasse e do contrato que sai o tier congelado do
// originador. Uma fatura sem usina seria dinheiro entrando sem destino.
//
// Entao a triagem daqui reusa o vocabulario de `faturamento.ts` onde a causa e a
// mesma, e nomeia o que e proprio do caminho novo. Reusar importa: quem opera ja
// aprendeu o que `sem_contrato_vigente` quer dizer, e um sinonimo seria divida de
// leitura (regra 7).

import { ehFaturaCheia, vencimentoDaFatura, type Alerta } from './faturamento.ts';
import { paraDecimal, decimalParaTexto, type Decimal } from './fatura-unificada.ts';
import { exigirCentavos, type Centavos } from './centavos.ts';

export type MotivoDeRecusaDoRegistro =
  | 'registro_ja_faturado'
  | 'sem_uc_cadastrada'
  | 'sem_contrato_vigente'
  | 'uc_ja_faturada'
  | 'rateio_nao_ativado'
  | 'sem_rateio'
  | 'sem_geracao_lancada'
  | 'sem_tarifa_na_conta'
  | 'sem_vencimento';

/** O texto que vai para quem opera. Cada recusa nomeia a saida - recusa e
 *  ponteiro, nao beco, e essa e a mesma promessa de `EXPLICACAO` em
 *  `faturamento.ts`. */
export const EXPLICACAO_DO_REGISTRO: Record<MotivoDeRecusaDoRegistro, string> = {
  registro_ja_faturado:
    'esta conta ja virou fatura. O unico por fatura existe para a segunda tentativa de um ' +
    'clique duplo nao cobrar o cliente duas vezes pelo mesmo mes. Para refazer, cancele a ' +
    'fatura primeiro',
  sem_uc_cadastrada:
    'o numero de unidade consumidora lido na conta nao existe no cadastro. E esperado que ' +
    'aconteca: registrar a conta lida NAO exige cadastro, de proposito, porque quem sobe o ' +
    'PDF esta conferindo. Faturar exige - e da UC que saem a usina, o rateio e o contrato',
  sem_contrato_vigente:
    'a UC nao tem contrato ativo. O contrato nao entra no calculo do valor no caminho ' +
    'unificado, e continua obrigatorio por outro motivo: e ele que congela o tier do ' +
    'originador (R20-b) e conta as faturas cheias pagas. Sem ele a comissao nao tem regra',
  uc_ja_faturada:
    'ja existe fatura nao cancelada desta UC nesta competencia, criada por outro caminho. ' +
    'Duas faturas do mesmo mes para a mesma UC cobrariam o cliente duas vezes',
  rateio_nao_ativado:
    'o CRM nao da o rateio desta UC por ativado. Se a coluna estiver VAZIA a causa e outra - ' +
    'o conector ainda nao leu esta UC, e o conserto e rodar o ciclo, nao falar com o CRM. ' +
    'Vale so para UC espelhada: UC cadastrada a mao nao passa por aqui',
  sem_rateio:
    'a UC nao tem usina vinculada ou nao tem percentual de rateio. No caminho unificado o ' +
    'percentual NAO calcula o valor - a conta ja o traz -, mas a usina e quem recebe o ' +
    'repasse, e sem ela o dinheiro entraria sem destino',
  sem_geracao_lancada:
    'a usina nao tem geracao lancada nesta competencia. Ela nao entra no valor no caminho ' +
    'unificado; entra como o registro do mes da usina, contra o qual o repasse ao dono e ' +
    'conferido depois. Nao ha tela para lancar: e espelho do CRM (regra 4), e duas das ' +
    'quatro usinas nunca tiveram medicao nenhuma - Q-GERACAO-USINA-01',
  sem_tarifa_na_conta:
    'a tarifa lida na conta e zero ou ausente, e a fatura exige tarifa positiva. Uma fatura ' +
    'com tarifa zero imprimiria "R$ 0,000000 por kWh" no documento que o cliente confere. ' +
    'Corrija o campo Tarifa na aba de leitura antes de faturar',
  sem_vencimento:
    'nem a conta lida traz vencimento nem a UC tem dia de vencimento cadastrado. Nao ha ' +
    'default e nao vai haver: escolher uma data aqui seria o improviso que a regra 10 proibe',
};

/**
 * A CONFERENCIA DA ALOCACAO - e ela e capacidade nova, nao defeito.
 *
 * O caminho unificado poe dois numeros lado a lado que antes nunca se
 * encontravam: quanto a usina ALOCOU para esta UC (geracao medida x percentual)
 * e quanto a distribuidora COMPENSOU de fato na conta. Sao grandezas diferentes
 * e quase nunca sao iguais - por isso isto NAO e um sinal booleano.
 *
 * Um `divergiu: boolean` aqui seria verdadeiro em praticamente toda fatura e
 * viraria ruido, que e o criterio que a R25 usa para decidir o que vira sinal. O
 * util e a diferenca em kWh, olhada por quem conhece a usina: "aloquei 500 e o
 * cliente compensou 480" e uma pergunta de negocio legitima, nao um erro.
 */
export type ConferenciaDaAlocacao = {
  /** `geracao_kwh x percentual_rateio / 100`. O que a usina reservou para esta UC. */
  alocado_kwh: string;
  /** `compensada_kwh` da conta. O que a distribuidora abateu de fato. */
  compensado_kwh: string;
  /** `alocado - compensado`. Positivo = sobrou credito alocado; negativo = o
   *  cliente compensou mais do que a usina reservou para ele. */
  diferenca_kwh: string;
};

/**
 * Multiplicacao exata de dois decimais, sem passar por float.
 *
 * A regra 1 proibe float em dinheiro e manda grandeza fisica manter escala
 * decimal. `Number(a) * Number(b)` satisfaria o tipo e nao a regra: o produto de
 * `10299.0000` por `4.7500` em ponto flutuante e reprodutivelmente errado no
 * ultimo digito, e este numero vai para a tela de quem confere a usina.
 *
 * Dividir por 100 NAO divide: desloca a escala em 2. Divisao inteira truncaria.
 */
function alocacao(geracao: Decimal, percentual: Decimal): Decimal {
  return {
    valor: geracao.valor * percentual.valor,
    escala: geracao.escala + percentual.escala + 2,
  };
}

/** Os dois na MAIOR das duas escalas - subir escala e exato, descer trunca. */
function subtrair(a: Decimal, b: Decimal): Decimal {
  const escala = Math.max(a.escala, b.escala);
  const subir = (d: Decimal) => d.valor * 10n ** BigInt(escala - d.escala);
  return { valor: subir(a) - subir(b), escala };
}

/** Casas com que a conferencia e apresentada. Quatro e a escala de
 *  `usina_geracao.geracao_kwh` e de `fatura.consumo_kwh` - a mesma do dado. */
const CASAS_KWH = 4;

export function conferirAlocacao(
  geracaoKwh: string, percentualRateio: string, compensadaKwh: string,
): ConferenciaDaAlocacao {
  const alocado = alocacao(paraDecimal(geracaoKwh, 'geracao_kwh'),
                           paraDecimal(percentualRateio, 'percentual_rateio'));
  const compensado = paraDecimal(compensadaKwh, 'compensada_kwh');
  return {
    alocado_kwh: decimalParaTexto(alocado, CASAS_KWH),
    compensado_kwh: decimalParaTexto(compensado, CASAS_KWH),
    diferenca_kwh: decimalParaTexto(subtrair(alocado, compensado), CASAS_KWH),
  };
}

/** O que o repositorio le, por registro. `numeric` chega como STRING e assim
 *  fica: converter para number aqui reintroduziria o float que a regra 1 proibe. */
export type LinhaDoRegistro = {
  registro_id: string;
  numero_uc: string;
  competencia: Date;

  // --------------------------------------------------- o que a conta lida diz
  fatura_id: string | null;
  compensada_kwh: string;
  tarifa_kwh: string;
  energia_g3_centavos: number;
  total_equatorial_centavos: number;
  /** O vencimento impresso na conta da distribuidora. Ver `vencimentoEscolhido`. */
  vencimento_da_conta: Date | null;

  // ------------------------------------------------- o que o cadastro local diz
  unidade_consumidora_id: string | null;
  usina_id: string | null;
  percentual_rateio: string | null;
  /** O dia escolhido na aba Unidades consumidoras. Segunda fonte do vencimento. */
  data_vencimento: Date | null;
  rateio_situacao: string | null;
  /** Preenchido quando a UC VEM do rateio do CRM. Sem ele, a regra da situacao
   *  valeria para UC criada a mao, que nunca tera situacao - e ela ficaria
   *  permanentemente nao faturavel, em silencio. Mesma guarda de `triar()`. */
  crm_usina_cliente_id: string | null;
  contrato_id: string | null;
  data_fechamento: Date | null;
  geracao_kwh: string | null;
  dono_usina_id: string | null;
  uc_ja_tem_fatura: boolean;
};

export type CandidataDoRegistro =
  | {
      faturar: true;
      registro_id: string;
      numero_uc: string;
      unidade_consumidora_id: string;
      contrato_id: string;
      usina_id: string;
      competencia: Date;
      /** Congelados na fatura: a UC pode mudar de usina amanha, e a fatura de
       *  julho tem de continuar dizendo de onde veio o credito daquele mes. */
      geracao_kwh: string;
      percentual_rateio: string;
      /** `compensada_kwh` da conta - o que o cliente de fato compensou. */
      consumo_kwh: string;
      /** A tarifa CHEIA lida da conta, seis casas. */
      tarifa_reais_por_kwh: string;
      /** `energia_g3_centavos`. Copiado, nunca recalculado. */
      valor_consumo_centavos: Centavos;
      /** `total_equatorial_centavos`. Copiado, nunca recalculado. */
      valor_tarifas_concessionaria_centavos: Centavos;
      flag_fatura_cheia: boolean;
      vencimento: Date;
      /** De onde saiu o vencimento. Vai para o relatorio porque as duas fontes
       *  significam coisas diferentes para quem confere. */
      vencimento_de: 'conta' | 'cadastro';
      alertas: Alerta[];
      conferencia: ConferenciaDaAlocacao;
    }
  | {
      faturar: false;
      registro_id: string;
      numero_uc: string;
      motivo: MotivoDeRecusaDoRegistro;
    };

/**
 * O VENCIMENTO VEM DA CONTA QUANDO A CONTA TEM, e isso e consequencia direta da
 * `Q-CICLO-01`, nao frouxidao.
 *
 * A camada `vencimento` existe porque o sistema "prefere recusar a cobranca a
 * escolher uma data por voce" - medido em 46 de 46 UCs vazias. O que ela proibe e
 * o sistema INVENTAR um dia. A conta da distribuidora nao e invencao: e a data
 * que o cliente ja tem no papel, no ciclo de leitura dele, e e a que a folha
 * unificada imprime.
 *
 * O cadastro fica como SEGUNDA fonte, e nao primeira, porque a conta e mais
 * especifica: ela diz o vencimento DAQUELE mes, e o cadastro diz um dia fixo que
 * `vencimentoDaFatura` ainda tem de projetar no mes seguinte.
 *
 * Efeito pratico medido: no caminho unificado a camada `vencimento` deixa de
 * bloquear as UCs cuja conta traz a data - que e o caso normal.
 */
export function vencimentoEscolhido(
  l: Pick<LinhaDoRegistro, 'vencimento_da_conta' | 'data_vencimento' | 'competencia'>,
): { data: Date; de: 'conta' | 'cadastro' } | null {
  if (l.vencimento_da_conta) return { data: l.vencimento_da_conta, de: 'conta' };
  if (l.data_vencimento) {
    return { data: vencimentoDaFatura(l.competencia, l.data_vencimento.getUTCDate()), de: 'cadastro' };
  }
  return null;
}

/**
 * A triagem do caminho unificado.
 *
 * ORDEM = ORDEM DE UTILIDADE DO DIAGNOSTICO, o mesmo criterio de `triar()`:
 * primeiro o que impede de existir, depois o que impede de repartir, por ultimo
 * o que impede de cobrar. Uma conta cuja UC nao esta cadastrada devolve
 * `sem_uc_cadastrada` e nao `sem_vencimento` - mandar preencher o vencimento de
 * uma UC que nao existe seria mandar trabalhar no lugar errado.
 *
 * `registro_ja_faturado` vem ANTES DE TUDO porque nenhuma outra informacao e
 * acionavel depois dela: se ja virou fatura, o que falta nao falta mais.
 */
export function triarRegistro(l: LinhaDoRegistro): CandidataDoRegistro {
  const recusa = (motivo: MotivoDeRecusaDoRegistro): CandidataDoRegistro =>
    ({ faturar: false, registro_id: l.registro_id, numero_uc: l.numero_uc, motivo });

  if (l.fatura_id)                 return recusa('registro_ja_faturado');
  if (!l.unidade_consumidora_id)   return recusa('sem_uc_cadastrada');
  if (!l.contrato_id || !l.data_fechamento) return recusa('sem_contrato_vigente');
  if (l.uc_ja_tem_fatura)          return recusa('uc_ja_faturada');
  if (l.crm_usina_cliente_id && l.rateio_situacao !== 'ativado') return recusa('rateio_nao_ativado');

  /* Percentual ZERO recusa junto com o nulo, e a razao e a coluna: a fatura tem
   * `CHECK (percentual_rateio_aplicado > 0 AND <= 100)`. Deixar passar trocaria
   * uma recusa nomeada por um `23514` cru vindo do banco. */
  if (!l.usina_id || !l.percentual_rateio || Number(l.percentual_rateio) <= 0) return recusa('sem_rateio');
  if (l.geracao_kwh == null)       return recusa('sem_geracao_lancada');

  /* Mesma logica da anterior: `CHECK (tarifa_reais_por_kwh > 0)` na fatura,
   * contra `CHECK (tarifa_kwh >= 0)` no registro. As duas faixas nao coincidem, e
   * a diferenca e exatamente o zero. */
  if (!(Number(l.tarifa_kwh) > 0)) return recusa('sem_tarifa_na_conta');

  const venc = vencimentoEscolhido(l);
  if (!venc)                       return recusa('sem_vencimento');

  exigirCentavos(l.energia_g3_centavos, 'energia_g3_centavos');
  exigirCentavos(l.total_equatorial_centavos, 'total_equatorial_centavos');

  return {
    faturar: true,
    registro_id: l.registro_id,
    numero_uc: l.numero_uc,
    unidade_consumidora_id: l.unidade_consumidora_id,
    contrato_id: l.contrato_id,
    usina_id: l.usina_id,
    competencia: l.competencia,
    geracao_kwh: l.geracao_kwh,
    percentual_rateio: l.percentual_rateio,
    consumo_kwh: l.compensada_kwh,
    tarifa_reais_por_kwh: l.tarifa_kwh,
    valor_consumo_centavos: l.energia_g3_centavos,
    valor_tarifas_concessionaria_centavos: l.total_equatorial_centavos,
    flag_fatura_cheia: ehFaturaCheia(l.data_fechamento, l.competencia),
    vencimento: venc.data,
    vencimento_de: venc.de,
    /* ALERTA NAO E RECUSA - a distincao e a mesma de `faturamento.ts`. Uma fatura
     * de UC cuja usina nao tem dono e VALIDA: a cobranca ao cliente nao depende
     * disso. O que ela nao pode e ser liquidada sem alguem notar, porque a R12
     * bloqueia o repasse e o dinheiro do dono se acumula sem destino. */
    alertas: l.dono_usina_id ? [] : ['usina_sem_dono'],
    conferencia: conferirAlocacao(l.geracao_kwh, l.percentual_rateio, l.compensada_kwh),
  };
}
