// O TRADUTOR DO WEBHOOK DE LIQUIDACAO. Puro, sem banco e sem rede.
// Uso: node --experimental-strip-types tests/webhook-sicoob.ts
//
// O PAYLOAD DE BASE E O DA DOCUMENTACAO DO BANCO, copiado sem edicao (28/08/2026).
// Nao e um exemplo inventado aqui: e o contrato que a Sicoob publica, e as
// variacoes abaixo saem dele mudando UM campo por vez - que e o que torna cada
// falha legivel.

import { traduzirEvento, EventoIlegivel, TIPO_MOVIMENTO_BAIXA } from '../src/sicoob/webhook.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const BASE = {
  idWebhook: 214,
  tipoMovimento: 7,
  dados: {
    numeroIdentificadorBaixa: '2024102000741150823',
    codigoBarrasBoleto: '75692868200000405001434201006355000002443003',
    nossoNumero: '0000002443',
    seuNumero: '00-03',
    numeroCliente: 63550,
    valorBoleto: 405,
    valorPagamento: 407.41,
    dataVencimento: '2021-07-15',
    dataHoraSituacaoBaixa: '2021-07-22T13:45:33.000Z',
    baixaRealizadaEmContigencia: false,
    cancelamentoBaixa: false,
  },
};

/** O corpo como CHEGA - texto. Trocar campos aqui e depois serializar preserva o
 *  literal, que e exatamente o que o tradutor precisa ler. */
const corpo = (mudanca: Record<string, unknown> = {}, raiz: Record<string, unknown> = {}) =>
  JSON.stringify({ ...BASE, ...raiz, dados: { ...BASE.dados, ...mudanca } });

const baixaDe = (texto: string) => {
  const t = traduzirEvento(texto);
  if (t.tipo !== 'baixa') {
    throw new Error(`esperava baixa, veio ${t.tipo}: ${t.tipo === 'ignorado' ? t.motivo : t.idWebhook}`);
  }
  return t;
};
const lanca = (fn: () => unknown) => {
  try { fn(); return false; } catch (e) { return e instanceof EventoIlegivel; }
};

// ============================================================================
// 1. O CAMINHO FELIZ, com o payload da documentacao
// ============================================================================

const b = baixaDe(corpo());
chk('W1', b.nossoNumero === '0000002443',
    'o nossoNumero sai como TEXTO, com os zeros a esquerda que o banco mandou');
chk('W2', b.idExterno === '2024102000741150823',
    'o numeroIdentificadorBaixa vira a chave de idempotencia');
chk('W3', b.valorLiquidadoCentavos === 40741, 'R$ 407,41 vira 40741 centavos');
chk('W4', b.jurosCentavos === 241, 'o excedente sobre o valor do boleto (R$ 2,41) vira 241');
chk('W5', b.dataLiquidacao.toISOString() === '2021-07-22T13:45:33.000Z',
    'a data da baixa atravessa sem deslocamento de fuso');

/*
 * O TESTE QUE JUSTIFICA O ARQUIVO INTEIRO - e ele quase nasceu errado.
 *
 * A primeira versao afirmava que `407.41 * 100` erra em float. **NAO ERRA**:
 * medido, da 40741 exato. E ISSO E O PERIGO, e nao o alivio - o caminho ingenuo
 * acerta a maioria dos valores e erra alguns, entao um sistema construido sobre
 * ele passa em todo teste feito com o numero do exemplo e produz um centavo a
 * mais ou a menos meses depois, num boleto qualquer.
 *
 * Os que erram, medidos aqui: `0.07 * 100` = 7.000000000000001 e `8.29 * 100` =
 * 828.9999999999999. Nenhum dos dois e exotico: sao valores de boleto.
 */
chk('W6', JSON.parse('{"v":0.07}').v * 100 !== 7 && 8.29 * 100 !== 829,
    'o caminho ingenuo erra em ALGUNS valores (0.07 e 8.29) e acerta em outros (407.41)');
chk('W7', b.valorLiquidadoCentavos === 40741 && Number.isInteger(b.valorLiquidadoCentavos),
    'e o tradutor nao depende de sorte: le o TEXTO do literal, nunca o double');

// ============================================================================
// 2. O QUE E IGNORADO - e nao vira baixa nenhuma
// ============================================================================

const ignorado = (texto: string) => {
  const t = traduzirEvento(texto);
  return t.tipo === 'ignorado' ? t.motivo : '';
};

/* A ASSIMETRIA DELIBERADA: codigo desconhecido nao vira dinheiro. Na propria
 * documentacao, "Baixa" e "Liquidacao" sao movimentos DIFERENTES - baixa por
 * decurso de prazo e por pedido do cedente nao sao pagamento. */
chk('W8', ignorado(corpo({}, { tipoMovimento: 6 })).includes('tipoMovimento'),
    'tipoMovimento 6 e ignorado - so o 7 vira baixa (Q-WEBHOOK-MOVIMENTO-01)');
chk('W9', ignorado(corpo({}, { tipoMovimento: undefined })).includes('tipoMovimento'),
    'tipoMovimento ausente e ignorado, e nao tratado como o padrao');
chk('W10', TIPO_MOVIMENTO_BAIXA === 7, 'o unico codigo aceito esta nomeado e exportado');

chk('W11', ignorado(corpo({ cancelamentoBaixa: true, codigoMotivoCancelamento: 2 })).includes('estorno')
        || ignorado(corpo({ cancelamentoBaixa: true })).includes('cancelamento'),
    'cancelamento de baixa e ignorado NOMEANDO - o sistema nao tem estorno');

chk('W12', ignorado(corpo({ valorPagamento: undefined })).includes('valorPagamento'),
    'baixa sem valorPagamento e ignorada - baixa nem sempre e pagamento');
chk('W13', ignorado(corpo({ valorPagamento: 0 })).length > 0,
    'baixa com valor zero nao registra dinheiro que nao entrou');

// ============================================================================
// 3. O QUE E ILEGIVEL - 400 alto, e nao um 200 silencioso
// ============================================================================

chk('W14', lanca(() => traduzirEvento('nao sou json')), 'corpo que nao e JSON: EventoIlegivel');
chk('W15', lanca(() => traduzirEvento('{"tipoMovimento":7}')), 'sem `dados`: EventoIlegivel');
chk('W16', lanca(() => traduzirEvento(corpo({ nossoNumero: undefined }))),
    'baixa sem nossoNumero: EventoIlegivel - nao ha como achar a fatura');
chk('W17', lanca(() => traduzirEvento(corpo({ numeroIdentificadorBaixa: undefined }))),
    'sem numeroIdentificadorBaixa: EventoIlegivel - sem ele o split rodaria duas vezes');
chk('W18', lanca(() => traduzirEvento(corpo({ dataHoraSituacaoBaixa: 'ontem' }))),
    'data que nao e data: EventoIlegivel, em vez de Invalid Date no banco');
chk('W19', lanca(() => traduzirEvento(corpo({ dataHoraSituacaoBaixa: undefined }))),
    'data ausente: EventoIlegivel');

// ============================================================================
// 4. AS BORDAS DO VALOR
// ============================================================================

chk('W20', baixaDe(corpo({ valorPagamento: 405 })).jurosCentavos === 0,
    'pagamento igual ao boleto: juros zero');
chk('W21', baixaDe(corpo({ valorPagamento: 400 })).jurosCentavos === 0,
    'pagamento MENOR que o boleto nao vira juros negativo - `baixar` recusa depois, nomeando');
chk('W22', baixaDe(corpo({ valorPagamento: 400 })).valorLiquidadoCentavos === 40000,
    'e o valor recebido continua sendo o que o banco disse');
chk('W23', baixaDe(corpo({ valorBoleto: undefined })).jurosCentavos === 0,
    'sem valorBoleto nao ha excedente a inventar');
chk('W24', baixaDe(corpo({ valorPagamento: 0.07, valorBoleto: 0.07 })).valorLiquidadoCentavos === 7,
    'o caso do 0.07 - 7 centavos, e nao 7.000000000000001');
chk('W25', baixaDe(corpo({ valorPagamento: 8.29, valorBoleto: 8.29 })).valorLiquidadoCentavos === 829,
    'e o do 8.29 - 829 centavos, e nao 828.9999999999999');

// ============================================================================
// A VALIDACAO DA URL - o primeiro corpo que a Sicoob manda, e o que exige 200
//
// Medido em 28/08/2026 na pagina "Visao Geral" da API: no cadastro, na alteracao
// da URL e na reativacao, o banco manda `{idWebhook, validacaoWebhook:true}` -
// sem `dados` e sem `tipoMovimento` - e so aceita a URL se a resposta for 200,
// 201 ou 204. Antes disto, este corpo virava EventoIlegivel, que e 400: o
// cadastro NUNCA teria funcionado.
// ============================================================================
{
  const v = traduzirEvento(JSON.stringify({ idWebhook: 990, validacaoWebhook: true }));
  chk('V1a', v.tipo === 'validacao',
      'o corpo de validacao e reconhecido, e NAO cai na conferencia de `dados` que o tornaria 400');
  chk('V1b', v.tipo === 'validacao' && v.idWebhook === '990',
      'o idWebhook volta, para o journal dizer QUAL webhook o banco estava validando');

  // A ordem importa: a deteccao tem de vir antes da conferencia de `dados`.
  chk('V1c', !lanca(() => traduzirEvento(JSON.stringify({ validacaoWebhook: true }))),
      'validacao sem idWebhook tambem passa - responder 200 vale mais que o campo');

  // E ela nao e uma porta: `validacaoWebhook` falso ou ausente segue o caminho normal.
  chk('V1d', lanca(() => traduzirEvento(JSON.stringify({ idWebhook: 1, validacaoWebhook: false }))),
      'validacaoWebhook FALSO nao vira aperto de mao - sem `dados`, continua sendo ilegivel');
  chk('V1e', traduzirEvento(corpo({}, { validacaoWebhook: false })).tipo === 'baixa',
      'e um evento de pagamento normal, que traz validacaoWebhook ausente, segue virando baixa');
}


console.log();
if (falhas > 0) { console.log(`--- webhook sicoob: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- webhook sicoob (o tradutor do evento de liquidacao): ${feitas} verificacoes, 0 falhas`);
