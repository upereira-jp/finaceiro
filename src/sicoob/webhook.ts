// O TRADUTOR DO WEBHOOK DE LIQUIDACAO DA SICOOB.
//
// O contrato chegou em 28/08/2026, da documentacao do proprio banco (o exemplo
// de payload da Cobranca Bancaria v3). Ate entao o `ADR-0006` tinha resolvido
// QUEM pode chamar e nao O QUE o corpo diz - e a rota entregava `req.corpo`
// direto para `liquidacao.baixar()`, que espera os NOSSOS nomes de campo. Sem
// este arquivo, a porta autenticava e o corpo nao era compreendido.
//
// O QUE ELE FAZ, e nada alem: le o corpo CRU e devolve ou uma baixa traduzida ou
// um "ignorado" com motivo. Nao toca no banco, nao decide papel, nao chama nada.
// Por isso e exercivel sem rede e sem Postgres.
//
// ============================================================================
// DUAS COISAS QUE ELE RECUSA DE PROPOSITO, e as duas sao lacuna com dono
//
// 1. `tipoMovimento` E UMA LISTA FECHADA DE UM ELEMENTO. O exemplo da
//    documentacao traz `7`, e o significado dos demais codigos NAO esta medido -
//    a pagina e SPA e nao devolve conteudo sem navegacao autenticada (tentado em
//    28/08). Entao SO o 7 vira baixa, e todo o resto e ignorado com o codigo
//    nomeado no log.
//
//    A ASSIMETRIA E DELIBERADA. Se o 7 nao for "baixa por pagamento", o custo e
//    nenhuma liquidacao entrar - e a consulta ativa diaria pega no dia seguinte.
//    Se um codigo desconhecido virasse baixa, o custo seria dinheiro creditado
//    que ninguem recebeu: baixa por decurso de prazo e baixa por solicitacao do
//    beneficiario tambem sao "baixa", e nenhuma delas e pagamento.
//    `Q-WEBHOOK-MOVIMENTO-01`.
//
// 2. `cancelamentoBaixa` EXISTE NO PAYLOAD E O SISTEMA NAO TEM ESTORNO.
//    `liquidacao.baixar()` e idempotente e nao tem inverso: nao ha caminho que
//    desfaca uma baixa, e o split ja rodou na mesma transacao dela. Inventar um
//    aqui seria decidir sozinho o que acontece com comissao ja provisionada.
//    Evento de cancelamento e ignorado e NOMEADO no log, para alguem tratar a
//    mao. `Q-WEBHOOK-ESTORNO-01`.
//
// ============================================================================
// E UM DETALHE QUE NAO E DETALHE: O DINHEIRO CHEGA COMO FLOAT
//
// `"valorPagamento": 407.41` e literal JSON. `JSON.parse` entrega um double, e
// `407.41 * 100` nao e `40741` exato. Por isso a entrada aqui e o TEXTO CRU, e o
// parse e o `jsonComDinheiroEmTexto` - o mesmo que o adaptador ja usava desde
// 27/08. A regra 1 proibe float "inclusive em calculo intermediario", e um corpo
// ja parseado pelo servidor teria perdido a forma antes de chegar aqui.

import { reaisDecimalParaCentavos, type Centavos } from '../dominio/centavos.ts';
import { jsonComDinheiroEmTexto } from './json-dinheiro.ts';

/** O unico `tipoMovimento` que vira baixa. Ver a nota 1 do cabecalho. */
export const TIPO_MOVIMENTO_BAIXA = 7;

export type BaixaDoWebhook = {
  tipo: 'baixa';
  /** Identifica o titulo do nosso lado - `boleto.nosso_numero`. */
  nossoNumero: string;
  /** `numeroIdentificadorBaixa`: a chave de idempotencia do canal. */
  idExterno: string;
  valorLiquidadoCentavos: Centavos;
  /** O que veio ALEM do valor do boleto. Ver a nota sobre juros abaixo. */
  jurosCentavos: Centavos;
  dataLiquidacao: Date;
};

export type Traducao = BaixaDoWebhook | { tipo: 'ignorado'; motivo: string };

/**
 * Corpo que nao da para ler como evento. **Sai como 400 de proposito**, e nao
 * como um "ignorado" silencioso: um evento de baixa a que falta campo
 * obrigatorio e dinheiro que entrou e que nao foi registrado. Barulho aqui e
 * mais barato que silencio - e a consulta ativa diaria continua sendo a rede.
 */
export class EventoIlegivel extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(`Webhook de liquidacao ilegivel: ${motivo}. Nada foi gravado.`);
    this.name = 'EventoIlegivel';
  }
}

const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * O corpo CRU vira baixa, ou vira "ignorado" com motivo.
 *
 * SOBRE OS JUROS. O payload da `valorBoleto` e `valorPagamento` e **nao
 * decompoe** a diferenca entre juros e multa. O sistema tambem nao precisa que
 * ela seja decomposta: `dominio/split.ts` reparte pela SOMA (`jurosEMulta`), e
 * os dois campos so existem separados no registro. Entao o excedente vai
 * inteiro em `juros`, e `multa` fica zero - uma escolha de rotulo, nao de valor,
 * e ela esta escrita aqui para nao parecer medicao.
 *
 * Pagamento MENOR que o boleto nao e tratado aqui: a traducao passa adiante e
 * `liquidacao.baixar()` recusa com `ValorNaoConfere`, que e a recusa certa
 * enquanto o dominio nao tiver pagamento parcial (`Q-PAGAMENTO-PARCIAL-01`).
 */
export function traduzirEvento(corpoCru: string): Traducao {
  let evento: any;
  try {
    evento = jsonComDinheiroEmTexto(corpoCru);
  } catch {
    throw new EventoIlegivel('o corpo nao e JSON valido');
  }
  if (evento == null || typeof evento !== 'object') throw new EventoIlegivel('o corpo nao e um objeto');

  const d = evento.dados;
  if (d == null || typeof d !== 'object') throw new EventoIlegivel('falta o objeto `dados`');

  if (evento.tipoMovimento !== TIPO_MOVIMENTO_BAIXA) {
    return { tipo: 'ignorado', motivo:
      `tipoMovimento ${JSON.stringify(evento.tipoMovimento)} nao e o de baixa (${TIPO_MOVIMENTO_BAIXA}). ` +
      'Os demais codigos nao estao medidos - Q-WEBHOOK-MOVIMENTO-01.' };
  }

  if (d.cancelamentoBaixa === true) {
    return { tipo: 'ignorado', motivo:
      `cancelamento de baixa do titulo ${texto(d.nossoNumero) ?? '(sem nossoNumero)'} ` +
      `(motivo ${JSON.stringify(d.codigoMotivoCancelamento)}). O sistema NAO tem estorno e nao ` +
      'inventa um: trate a mao. Q-WEBHOOK-ESTORNO-01.' };
  }

  const pago = texto(d.valorPagamento);
  if (pago == null) {
    return { tipo: 'ignorado', motivo: 'baixa sem `valorPagamento` - baixa nem sempre e pagamento' };
  }
  const valorLiquidadoCentavos = reaisDecimalParaCentavos(pago);
  if (valorLiquidadoCentavos <= 0) {
    return { tipo: 'ignorado', motivo: `baixa com valorPagamento ${pago} - nao ha dinheiro a registrar` };
  }

  const nossoNumero = texto(d.nossoNumero);
  if (!nossoNumero) throw new EventoIlegivel('baixa sem `nossoNumero` - nao ha como achar a fatura');

  const idExterno = texto(d.numeroIdentificadorBaixa);
  if (!idExterno) {
    /* Sem ele nao ha idempotencia, e o modo de falha e o pior do arquivo: a fila
     * de reprocessamento do banco baixaria a mesma fatura duas vezes, rodando o
     * split duas vezes. Melhor recusar e deixar a consulta ativa pegar. */
    throw new EventoIlegivel('baixa sem `numeroIdentificadorBaixa` - sem ele nao ha idempotencia');
  }

  const quando = texto(d.dataHoraSituacaoBaixa);
  const dataLiquidacao = quando ? new Date(quando) : new Date(NaN);
  if (Number.isNaN(dataLiquidacao.getTime())) {
    throw new EventoIlegivel(`\`dataHoraSituacaoBaixa\` ausente ou invalida: ${JSON.stringify(quando)}`);
  }

  const boleto = texto(d.valorBoleto);
  const valorBoletoCentavos = boleto == null ? valorLiquidadoCentavos : reaisDecimalParaCentavos(boleto);
  const excedente = valorLiquidadoCentavos - valorBoletoCentavos;

  return {
    tipo: 'baixa',
    nossoNumero,
    idExterno,
    valorLiquidadoCentavos,
    jurosCentavos: (excedente > 0 ? excedente : 0) as Centavos,
    dataLiquidacao,
  };
}
