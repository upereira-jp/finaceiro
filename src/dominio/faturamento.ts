// AS DECISOES DA COMPOSICAO DA FATURA. Nao a aritmetica dela.
//
// A conta em si - `round(consumo_kwh x tarifa x 100)` - NAO esta aqui e nao
// pode estar: a SPEC-001 R23 poe uma unica implementacao da formula em
// `app.consumo_centavos()`, e o motivo esta escrito na migration 9 - "duas
// implementacoes da mesma formula sao duas respostas". O repositorio compoe a
// fatura num INSERT ... SELECT que faz a conta em `numeric` no servidor, e a
// derivacao do consumo pela geracao medida acontece do mesmo lado.
//
// O que sobra para este arquivo e o que a aritmetica nao decide:
//
//   qual competencia   - normalizacao e recusa de mes pela metade
//   quem entra         - e QUEM NAO ENTRA, com o motivo contado
//   quando vence       - PAUTA 5 = A: o boleto e o instrumento, e boleto tem data
//   e cheia?           - PRD 5.4, e a regra do que e "cheia" nao existe em
//                        documento nenhum: Q-FATCHEIA-01
//
// O PADRAO DA RECUSA CONTADA vem do conector (SPEC-002, invariante 8) e e
// deliberado: quando falta insumo, a UC nao e adivinhada nem faturada com valor
// escolhido "porque parecia razoavel" - ela sai do lote com o motivo nomeado, e
// a contagem de recusas e o que traz o problema a tona. Foi assim que a
// Q-VALOR-01 apareceu, em 27/07, em vez de virar 40 faturas erradas.

export type MotivoDeRecusa =
  | 'sem_geracao_lancada'
  | 'sem_rateio'
  | 'sem_contrato_vigente'
  | 'sem_vencimento'
  | 'ja_faturada'
  | 'rateio_nao_ativado';

/**
 * ALERTA NAO E RECUSA, e a distincao ja e do projeto - o RESUMO-SESSAO-9 2 a
 * fixou para o conector: recusa significa "nada foi gravado" e conta na
 * invariante; divergencia significa "foi gravado, e alguem precisa olhar" e nao
 * mexe no status. Aqui vale igual. Uma fatura de UC cuja usina nao tem dono e
 * uma fatura VALIDA - a cobranca ao cliente nao depende disso. O que ela nao
 * pode e ser liquidada sem alguem notar, porque o repasse fica bloqueado pela
 * R12 e o dinheiro do dono da usina se acumula sem destino.
 *
 * Misturar as duas faria a contagem de recusas medir duas coisas, que e
 * exatamente o erro que aquela sessao evitou.
 */
export type Alerta = 'usina_sem_dono';

/** O texto que vai para o operador. Cada um nomeia a questao aberta que o
 *  destrava, quando ha uma - a recusa e ponteiro, nao beco. */
export const EXPLICACAO: Record<MotivoDeRecusa, string> = {
  sem_geracao_lancada:
    'a usina nao tem geracao lancada nesta competencia. A base de faturamento e a geracao ' +
    'MEDIDA (PAUTA-contador 9a), entao faturar aqui seria emitir receita sobre energia que ' +
    'ninguem registrou ter sido gerada - o caso da usina 0003, com 100% alocado e zero geracao',
  sem_rateio:
    'a UC nao tem usina vinculada ou nao tem percentual de rateio. Sem a fatia contratada ' +
    'nao ha como derivar quanto credito esta UC recebeu',
  sem_contrato_vigente:
    'a UC nao tem contrato ativo. Contrato suspenso ocupa a UC mas nao fatura (R14)',
  sem_vencimento:
    'a UC nao tem data de vencimento cadastrada, e nao ha default: quem preenche, por UC ou ' +
    'por contrato, e a Q-SPEC001-02, sem dono resolvido. Escolher um dia aqui seria o ' +
    'improviso que a regra 10 proibe',
  ja_faturada:
    'ja existe fatura nao cancelada desta UC nesta competencia',
  /*
   * A EXPLICACAO DISTINGUE DUAS CAUSAS que caem na mesma recusa, e a distincao e
   * o que torna a recusa acionavel: uma pede rodar o ciclo, a outra pede falar
   * com o CRM. E a mesma separacao entre `nao_medido` e `pendente` na prontidao -
   * ausencia de medicao nao e medicao de ausencia.
   */
  rateio_nao_ativado:
    'o CRM nao da o rateio desta UC por ativado. O financeiro fatura as ATIVADAS (decisao do ' +
    'dono em 04/08, Q-SITUACAO-01): medido no dia, 29 das 41 estavam `ativado` e 12 nao, sete ' +
    'delas em troca de titularidade. Se a coluna estiver VAZIA a causa e outra - o conector ' +
    'ainda nao leu esta UC, e o conserto e rodar `npm run ciclo`, nao falar com o CRM. ' +
    'Vale so para UC que veio do rateio do CRM: UC cadastrada a mao nao passa por aqui',
};

export const EXPLICACAO_DO_ALERTA: Record<Alerta, string> = {
  usina_sem_dono:
    'a usina nao tem dono cadastrado. A fatura vale e a cobranca segue, mas o repasse fica ' +
    'bloqueado pela R12 e o split nao vai poder rodar quando ela for paga - AUD-08, nulo em ' +
    '3 de 3 usinas hoje. Cadastrar o dono antes da liquidacao evita destravar isso as pressas',
};

export class CompetenciaInvalida extends TypeError {
  readonly status = 422;
  constructor(v: unknown) {
    super(
      `competencia deve ser o primeiro dia de um mes (AAAA-MM-01), recebeu ${JSON.stringify(v)}. ` +
      'Meia competencia nao existe: a geracao e medida por mes e a tarifa vigora por mes.'
    );
    this.name = 'CompetenciaInvalida';
  }
}

/**
 * Normaliza e RECUSA em vez de truncar. Truncar '2026-07-15' para '2026-07-01'
 * em silencio faria "faturar julho" e "faturar a partir do dia 15" produzirem o
 * mesmo lote, e so um dos dois foi pedido.
 */
export function competencia(v: string | Date): Date {
  const d = v instanceof Date ? v : new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new CompetenciaInvalida(v);
  if (d.getUTCDate() !== 1) throw new CompetenciaInvalida(v);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export const competenciaISO = (c: Date): string => c.toISOString().slice(0, 10);

/**
 * O vencimento da fatura de uma competencia, a partir do dia cadastrado na UC.
 *
 * VENCE NO MES SEGUINTE ao da competencia, e a razao e de calendario e nao de
 * gosto: a competencia so fecha quando a geracao do mes e medida, e a medicao
 * chega depois do mes virar. Vencimento dentro da propria competencia venceria
 * antes de a fatura poder existir.
 *
 * Dia 29, 30 ou 31 em mes curto cai no ULTIMO dia do mes, nunca transborda para
 * o mes seguinte: transbordar mudaria a competencia de vencimento de uma parte
 * da carteira quatro vezes por ano, e ninguem pediu isso.
 */
export function vencimentoDaFatura(c: Date, diaDoVencimento: number): Date {
  if (!Number.isInteger(diaDoVencimento) || diaDoVencimento < 1 || diaDoVencimento > 31) {
    throw new TypeError(`dia de vencimento invalido: ${JSON.stringify(diaDoVencimento)}`);
  }
  const ano = c.getUTCFullYear();
  const mes = c.getUTCMonth() + 1;                       // mes seguinte
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(diaDoVencimento, ultimoDia)));
}

/**
 * PRD 5.4: fatura nao-cheia nao avanca o contador nem gera comissao.
 *
 * O QUE E "CHEIA" NAO ESTA DECLARADO EM DOCUMENTO NENHUM do projeto - nem no
 * PRD, nem na SPEC-001, nem no GLOSSARIO. A regra abaixo e a unica derivavel do
 * dado que existe, e esta escrita aqui em vez de escondida: cheia e a
 * competencia que o contrato cobre do primeiro ao ultimo dia. Contrato fechado
 * no dia 10 de julho cobre julho pela metade, entao a fatura de julho e
 * parcial, nao avanca o contador e nao paga comissao - a de agosto e a primeira
 * cheia.
 *
 * Q-FATCHEIA-01, e ela NAO e detalhe: a resposta define em que mes comeca a
 * pagar a comissao de todo contrato novo, e com captador senior sao 60% do
 * consumo. A coluna no banco e NOT NULL e sem default de proposito - o dia em
 * que a regra for outra, muda-se aqui e o banco nao tem opiniao.
 */
export function ehFaturaCheia(dataFechamento: Date, c: Date): boolean {
  const inicioDaCompetencia = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1);
  const fechamento = Date.UTC(
    dataFechamento.getUTCFullYear(), dataFechamento.getUTCMonth(), dataFechamento.getUTCDate(),
  );
  return fechamento <= inicioDaCompetencia;
}

/** Uma linha do lote: ou vira fatura, ou vira recusa com motivo. Nunca as duas,
 *  e nunca nenhuma das duas - o lote nao perde UC em silencio. */
export type Candidata =
  | { faturar: true; unidade_consumidora_id: string; contrato_id: string; usina_id: string;
      vencimento: Date; flag_fatura_cheia: boolean; alertas: Alerta[] }
  | { faturar: false; unidade_consumidora_id: string; numero_uc: string; motivo: MotivoDeRecusa };

/** O que a consulta do repositorio entrega por UC candidata. Datas ja como Date,
 *  percentual e geracao como string - `numeric` chega como string e converter
 *  para number aqui reintroduziria o float que a regra 1 proibe. */
export type LinhaCandidata = {
  unidade_consumidora_id: string;
  numero_uc: string;
  contrato_id: string | null;
  usina_id: string | null;
  percentual_rateio: string | null;
  data_vencimento: Date | null;
  data_fechamento: Date | null;
  geracao_kwh: string | null;
  dono_usina_id: string | null;
  ja_tem_fatura: boolean;
  /**
   * Espelho de `financeiro.rateio_situacao.situacao` do CRM (migration 24).
   *
   * `null` NAO e o mesmo que "nao ativado": significa que o conector ainda nao
   * leu esta UC. Ver a triagem - o que decide se isso recusa e se a UC E
   * espelhada, e nao o valor sozinho.
   */
  rateio_situacao: string | null;
  /**
   * `crm_usina_cliente_id`. E o que diz se esta UC VEM do rateio do CRM.
   *
   * Existe aqui por um defeito que quase entrou: sem ele, a regra da situacao
   * valeria tambem para UC criada A MAO por `POST /unidades-consumidoras`, que
   * nunca vai ter situacao nenhuma - e ela ficaria permanentemente nao
   * faturavel, em silencio. Regra de fonte externa so vale sobre o que vem
   * daquela fonte.
   */
  crm_usina_cliente_id: string | null;
};

/**
 * A triagem. Ordem das checagens = ordem de utilidade do diagnostico: primeiro
 * o que impede de existir, depois o que impede de calcular, por ultimo o que
 * impede de cobrar. Uma UC sem contrato e sem geracao devolve
 * `sem_contrato_vigente`, que e o problema de verdade; devolver
 * `sem_geracao_lancada` mandaria a operacao lancar geracao para descobrir
 * depois que faltava o contrato.
 */
export function triar(l: LinhaCandidata, c: Date): Candidata {
  const recusa = (motivo: MotivoDeRecusa): Candidata =>
    ({ faturar: false, unidade_consumidora_id: l.unidade_consumidora_id, numero_uc: l.numero_uc, motivo });

  if (!l.contrato_id || !l.data_fechamento) return recusa('sem_contrato_vigente');
  if (l.ja_tem_fatura)                      return recusa('ja_faturada');
  /*
   * TERCEIRO NA ORDEM, e a posicao foi escolhida e nao herdada.
   *
   * A ordem das checagens e a ordem de utilidade do diagnostico, e esta
   * pertence ao primeiro grupo - "o que impede de EXISTIR". Uma UC cujo rateio
   * o CRM nao da por ativado nao deveria estar num lote, e dizer a operacao
   * "falta geracao" ou "falta vencimento" a mandaria trabalhar numa UC que nao
   * e para ser faturada.
   *
   * Mas vem DEPOIS de `sem_contrato_vigente` e `ja_faturada`: sem contrato nao
   * ha nada a faturar de qualquer jeito, e se ja foi faturada a informacao util
   * e essa - "nao ativado" numa UC ja faturada mandaria procurar problema onde
   * nao ha acao possivel.
   *
   * E SO VALE PARA UC ESPELHADA (`crm_usina_cliente_id` preenchido), que e a
   * guarda que impede um defeito de acontecer: `POST /unidades-consumidoras`
   * cria UC a mao, e essa UC nunca tera situacao no CRM porque o CRM nao sabe
   * dela. Sem esta condicao ela ficaria nao faturavel PARA SEMPRE, sem erro e
   * sem log - a regra de uma fonte externa aplicada a quem nao vem dela.
   * Em producao as 41 sao espelhadas, entao a regra alcanca todas.
   */
  if (l.crm_usina_cliente_id && l.rateio_situacao !== 'ativado') return recusa('rateio_nao_ativado');
  if (!l.usina_id || !l.percentual_rateio)  return recusa('sem_rateio');
  if (l.geracao_kwh == null)                return recusa('sem_geracao_lancada');
  if (!l.data_vencimento)                   return recusa('sem_vencimento');

  return {
    faturar: true,
    unidade_consumidora_id: l.unidade_consumidora_id,
    contrato_id: l.contrato_id,
    usina_id: l.usina_id,
    vencimento: vencimentoDaFatura(c, l.data_vencimento.getUTCDate()),
    flag_fatura_cheia: ehFaturaCheia(l.data_fechamento, c),
    alertas: l.dono_usina_id ? [] : ['usina_sem_dono'],
  };
}
