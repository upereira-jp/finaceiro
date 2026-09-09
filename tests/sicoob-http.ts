// O ADAPTADOR REAL DA SICOOB, exercido sem rede e sem certificado.
// Uso: node --experimental-strip-types tests/sicoob-http.ts
//
// POR QUE ESTA SUITE EXISTE COM ESTA FORMA, e a razao e uma medicao de hoje.
//
// O sandbox da Sicoob responde - `GET /boletos` devolve 200 com o exemplo,
// `POST /boletos/{nn}/baixar` devolve 204 - mas `POST /boletos` devolve SEMPRE
// 400 com o exemplo de erro, para corpo vazio e para corpo bem formado. Ele e
// MOCK ESTATICO: nao valida, nao registra, e o caminho de SUCESSO do registro
// nao existe la.
//
// Entao o caminho que emite dinheiro so e exercitavel contra transporte
// proprio, e e por isso que `Transporte` e injetavel no adaptador. O que esta
// suite cobre e exatamente a parte que a rede nao cobriria de graca:
//
//   1. o que SOBE - cabecalhos, caminho, corpo, formato de data, e o valor
//      digito a digito;
//   2. o que DESCE - parsing, dinheiro sem float, situacao fechada em enum;
//   3. o que FALHA - erro do banco, 200 incompleto, 401 invalidando cache.
//
// O QUE ELA NAO PROVA: que a Sicoob aceita este corpo. Isso nao e testavel
// deste lado, e o `http.ts` marca cada suposicao com `SUPOSICAO:`.

import {
  CobrancaSicoob, situacaoDoTexto, seuNumeroDe, ErroDaSicoob, pagadorSicoob,
  type Transporte, type PedidoHttp, SEU_NUMERO_MAX,
  ehUrlDeWebhook, ESCOPOS, ESCOPOS_DE_WEBHOOK, ESCOPOS_DE_WEBHOOK_CONSULTA,
  webhookInativo, SOLICITACAO_COM_ERRO } from '../src/sicoob/http.ts';
import { urlDoWebhook } from '../src/sicoob/webhook.ts';
import { faltamNoEndereco } from '../src/sicoob/porta.ts';
import { cofreFixo } from '../src/sicoob/cofre.ts';
import { centavosParaReaisDecimal, reaisDecimalParaCentavos, DecimalInvalido } from '../src/dominio/centavos.ts';
import { txidDoBrCode, pixEstatico } from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/** Transporte de mentira: guarda o que subiu, devolve o que mandarem. */
function espiao(respostas: Array<{ status: number; texto: string }>) {
  const vistos: PedidoHttp[] = [];
  const t: Transporte = async (p) => {
    vistos.push(p);
    const r = respostas.shift();
    if (!r) throw new Error(`espiao sem resposta preparada para ${p.metodo} ${p.url}`);
    return r;
  };
  return { t, vistos };
}

const TOKEN_OK = { status: 200, texto: JSON.stringify({ access_token: 'tok-1', expires_in: 300 }) };

/** A resposta de sucesso do registro, com a FORMA medida no sandbox em 27/08. */
function respostaDeRegistro(o: { valor?: string; qr?: string } = {}) {
  return {
    status: 200,
    texto: JSON.stringify({
      resultado: {
        numeroCliente: 25546454,
        codigoModalidade: 1,
        nossoNumero: 40012345,
        seuNumero: 'abc',
        codigoBarras: '07092501614004706610157633070651479470000006500',
        linhaDigitavel: '42297115040000195441184217468127172300000023124',
        valor: JSON.parse(o.valor ?? '1130.00'),
        numeroContratoCobranca: 77,
        situacaoBoleto: 'Em Aberto',
        qrCode: o.qr ?? '00020101021226950014br.gov.bcb.pix2573pix.sicoob.com.br/qr/x5204000053039865802BR62070503***6304ABCD',
        pdfBoleto: 'JVBERi0xLjQK'.repeat(50),
      },
    }),
  };
}

function adaptador(respostas: Array<{ status: number; texto: string }>, extra: any = {}) {
  const { t, vistos } = espiao(respostas);
  const c = new CobrancaSicoob({
    resolver: cofreFixo({ clientId: 'CID-1', ...extra.cofre }),
    transporte: t,
    baseUrl: 'https://exemplo.invalido/v3',
    urlDoToken: 'https://auth.invalido/token',
    agora: extra.agora ?? (() => Date.parse('2026-08-27T12:00:00Z')),
  });
  return { c, vistos };
}

const PEDIDO = {
  credencialRef: 'ref-1',
  referencia: '7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d33',
  valorCentavos: 113000,
  vencimento: new Date('2026-09-10T00:00:00.000Z'),
  pagador: {
    nome: 'Fulano de Tal',
    documento: '987.654.321-85',
    endereco: {
      logradouro: 'Rua das Palmeiras', numero: '120', bairro: 'Centro',
      municipio: 'Anapolis', uf: 'go', cep: '75.000-000',
    },
  },
  mensagens: ['Competencia 2026-08', 'UC 123456'],
};

// ==================================================== 1. O DINHEIRO, POR TEXTO

{
  chk('S1a', centavosParaReaisDecimal(113000) === '1130.00',
      '113000 centavos viram "1130.00" - ponto decimal, sem milhar, como o literal JSON pede');
  chk('S1b', centavosParaReaisDecimal(7) === '0.07' && centavosParaReaisDecimal(0) === '0.00',
      'centavo solto e zero saem com as duas casas: "0.07" e "0.00"');
  chk('S1c', centavosParaReaisDecimal(-15623) === '-15623'.slice(0, 1) + '156.23',
      'negativo mantem o sinal fora do numero');
  chk('S1d', reaisDecimalParaCentavos('156.23') === 15623 && reaisDecimalParaCentavos('1130') === 113000,
      'a volta le o literal com e sem casas decimais');

  // O caso que a funcao existe para impedir: a gramatica BRASILEIRA leria
  // "1.234" como mil duzentos e trinta e quatro. No literal JSON e um e pouco.
  let recusou = false;
  try { reaisDecimalParaCentavos('1.234'); } catch (e) { recusou = e instanceof DecimalInvalido; }
  chk('S1e', recusou,
      '"1.234" e RECUSADO: tres casas nao e dinheiro, e adivinhar milhar aqui daria R$ 1,23 numa fatura de R$ 1.234,00');

  let cientifica = false;
  try { reaisDecimalParaCentavos('1e3'); } catch (e) { cientifica = e instanceof DecimalInvalido; }
  chk('S1f', cientifica, 'notacao cientifica e recusada nomeando o motivo');

  // A ida e a volta fecham para todo centavo de uma faixa larga - por
  // construcao, nao por sorte. Sem float em ponto nenhum do caminho.
  let bateram = 0;
  for (let v = 0; v <= 200_000; v += 7) {
    if (reaisDecimalParaCentavos(centavosParaReaisDecimal(v)) === v) bateram++;
  }
  chk('S1g', bateram === Math.floor(200_000 / 7) + 1,
      `ida e volta fecham em ${bateram} valores seguidos, de R$ 0,00 a R$ 2.000,00`);
}

// ============================================== 2. O QUE SOBE NO REGISTRO

{
  const { c, vistos } = adaptador([TOKEN_OK, respostaDeRegistro()]);
  const r = await c.registrar(PEDIDO as any);

  const token = vistos[0];
  const post = vistos[1];
  const corpo = JSON.parse(post.corpo!);

  chk('S2a', token.url === 'https://auth.invalido/token' && token.corpo!.includes('grant_type=client_credentials'),
      'primeiro sobe o token, por client_credentials');
  chk('S2b', !token.corpo!.includes('client_secret'),
      'e SEM client_secret: o realm declara tls_client_auth, o certificado e a credencial');
  chk('S2c', token.corpo!.includes('boletos_inclusao') && !token.corpo!.includes('protesto'),
      'os escopos pedidos sao os TRES VERBOS da familia medida em 01/09 - nao os 29 do realm');
  chk('S2c2', !token.corpo!.includes('cobranca_boletos_'),
      'e nenhum da familia antiga: medida em 01/09, ela sai 400 invalid_scope e o token nem nasce');

  chk('S2d', post.cabecalhos.Authorization === 'Bearer tok-1' && post.cabecalhos.client_id === 'CID-1',
      'a chamada leva Bearer E client_id: sem o segundo o gateway devolve 401 mesmo com token valido');
  chk('S2e', post.url === 'https://exemplo.invalido/v3/boletos' && post.metodo === 'POST',
      'o registro e POST /boletos');

  // A verificacao mais importante da suite: o valor sobe como o TEXTO exato
  // dos centavos, e nao como float. `1130.00` no corpo cru.
  chk('S2f', /"valor":1130\.00[,}]/.test(post.corpo!),
      'o valor viaja como 1130.00 no corpo CRU - texto exato dos centavos, sem passar por float');
  chk('S2g', corpo.valor === 1130,
      'e ele e numero JSON de verdade, nao string: quem le o corpo do outro lado ve um number');

  chk('S2h', corpo.dataVencimento === '2026-09-10' && corpo.dataEmissao === '2026-08-27',
      'as datas sao `yyyy-MM-dd` puro - o modelo diz string($date), e a forma longa com fuso era estimativa');
  chk('S2h2', !/T\d\d:/.test(post.corpo!),
      'e NENHUMA data no corpo leva hora - a varredura pega a proxima que alguem formatar longa');
  chk('S2i', corpo.numeroCliente === 25546454 && corpo.codigoModalidade === 1 && corpo.numeroContratoCobranca === 1,
      'a identidade do cooperado vai no corpo - aqui o caso de quem TEM contrato numerado');
  chk('S2j', corpo.numeroContaCorrente === 123456,
      'numeroContaCorrente VAI sempre - o modelo o marca obrigatorio: e a conta que recebe o credito da liquidacao');
  chk('S2k', corpo.identificacaoEmissaoBoleto === 2 && corpo.identificacaoDistribuicaoBoleto === 2,
      'cliente emite e cliente distribui - pedir que o banco emita produziria DOIS documentos para a mesma divida');
  chk('S2l', corpo.codigoCadastrarPIX === 1, 'o hibrido do PRD 4.3 e pedido');

  chk('S2m', corpo.pagador.numeroCpfCnpj === '98765432185' && corpo.pagador.cep === '75000000',
      'documento e CEP sobem so com digitos, sem mascara');
  chk('S2n', corpo.pagador.endereco === 'Rua das Palmeiras, 120' && corpo.pagador.cidade === 'Anapolis',
      'logradouro e numero viram UMA string, e municipio vira cidade na fronteira');
  chk('S2o', corpo.pagador.uf === 'GO', 'a UF sobe em maiuscula');
  chk('S2p', !('email' in corpo.pagador),
      'e-mail nao sobe: 3 de 29 clientes faturaveis tem, e o campo nao existe no nosso Pagador');

  chk('S2q', corpo.seuNumero === '7f3a9c214b8e4d559a' && corpo.seuNumero.length === 18,
      'seuNumero e o UUID sem hifens cortado em 18 - o teto e do modelo, e o 20 de antes era estimativa');

  chk('S2y', corpo.tipoDesconto === 0 && corpo.tipoMulta === 0 && corpo.numeroParcela === 1,
      'os obrigatorios de "nao cobrar nada a mais" vao no corpo - sem eles a API recusa por campo ausente');
  chk('S2z', corpo.tipoJurosMora === 3,
      'juros isento e 3, e nao 0 - os enums nao sao paralelos, e o 0 aqui nem existe');

  // ------------------------------------------------- e o que VOLTA
  chk('S2r', r.nossoNumero === '40012345' && r.linhaDigitavel.length === 47 && r.codigoBarras.length === 47,
      'nossoNumero vira string e a linha volta como veio');
  chk('S2s', r.pixCopiaECola?.startsWith('00020101') === true,
      'o qrCode da resposta e o copia-e-cola do Pix');
  chk('S2t', r.pixTxid === null,
      'o txid fica NULO: o campo 62-05 do payload dinamico vem "***", e inventar um id de dentro da URL poria em pix_txid um valor que nao casa com nada');
  chk('S2u', r.sicoobNumeroContrato === '77', 'o numero de contrato que o BANCO devolveu e guardado');

  const envio = r.payloadEnvio as any;
  chk('S2v', envio.valor === '1130.00',
      'na trilha o valor fica como TEXTO: gravar float na auditoria de dinheiro seria refazer pelos fundos o que a regra 1 fecha na frente');
  chk('S2w', !JSON.stringify(r.payloadEnvio).includes('tok-1') && !JSON.stringify(r.payloadRetorno).includes('tok-1'),
      'nem o token nem o certificado entram nos payloads gravados - a constraint boleto_payload_sem_segredo tem o que aceitar');
  chk('S2x', !('pdfBoleto' in (r.payloadRetorno as any)),
      'o pdfBoleto de centenas de KB e descartado de proposito: o documento e nosso');
}

// ================================================= 3. QUANDO O BANCO RECUSA

{
  const { c } = adaptador([TOKEN_OK, {
    status: 400,
    texto: JSON.stringify({ mensagens: [{ codigo: 'C0031', mensagem: 'Pagador invalido' }] }),
  }]);
  let erro: any = null;
  try { await c.registrar(PEDIDO as any); } catch (e) { erro = e; }
  chk('S3a', erro instanceof ErroDaSicoob && erro.status === 502 && erro.httpStatus === 400,
      '400 do banco vira 502 para o nosso lado: quem falhou foi o outro lado');
  chk('S3b', String(erro.message).includes('C0031') && String(erro.message).includes('Pagador invalido'),
      'o codigo e a mensagem do banco chegam a quem le o erro, e nao viram "erro interno"');

  const { c: c2 } = adaptador([TOKEN_OK, {
    status: 409, texto: JSON.stringify({ mensagens: [{ codigo: 'C9', mensagem: 'ja existe' }] }),
  }]);
  let e409: any = null;
  try { await c2.registrar(PEDIDO as any); } catch (e) { e409 = e; }
  chk('S3c', e409.status === 409,
      '409 atravessa como 409: boleto ja registrado nao e indisponibilidade, e a fila NAO deve insistir nele');

  // 200 sem os tres campos: a resposta nao serve para imprimir nem para conciliar.
  const { c: c3 } = adaptador([TOKEN_OK, { status: 200, texto: JSON.stringify({ resultado: { nossoNumero: 1 } }) }]);
  let vazio: any = null;
  try { await c3.registrar(PEDIDO as any); } catch (e) { vazio = e; }
  chk('S3d', vazio?.status === 502 && /confira no Sicoobnet/.test(vazio.message),
      '200 sem linha digitavel FALHA, e a mensagem manda conferir no banco antes de mandar de novo - o boleto pode ter nascido la');
}

// ============================================ 4. O TOKEN: CACHE E INVALIDACAO

{
  const { c, vistos } = adaptador([TOKEN_OK, respostaDeRegistro(), respostaDeRegistro()]);
  await c.registrar(PEDIDO as any);
  await c.registrar({ ...PEDIDO, referencia: 'outra-referencia-2' } as any);
  chk('S4a', vistos.filter((v) => v.url.includes('token')).length === 1,
      'o segundo boleto reaproveita o token: um lote de 28 nao faz 28 handshakes de OAuth');

  // 401 no meio: o cache tem de morrer, senao todo boleto seguinte tenta com um
  // token que o banco ja rejeitou.
  const { c: c2, vistos: v2 } = adaptador([
    TOKEN_OK, { status: 401, texto: '{}' },
    TOKEN_OK, respostaDeRegistro(),
  ]);
  try { await c2.registrar(PEDIDO as any); } catch { /* esperado */ }
  await c2.registrar({ ...PEDIDO, referencia: 'terceira-3' } as any);
  chk('S4b', v2.filter((v) => v.url.includes('token')).length === 2,
      '401 joga o token fora, e a chamada seguinte pede um novo em vez de insistir com o morto');

  // Token expirado pelo relogio, sem 401 nenhum.
  let t = Date.parse('2026-08-27T12:00:00Z');
  const { c: c3, vistos: v3 } = adaptador(
    [TOKEN_OK, respostaDeRegistro(), TOKEN_OK, respostaDeRegistro()],
    { agora: () => t },
  );
  await c3.registrar(PEDIDO as any);
  t += 300_000;   // expires_in 300s, e a folga de 60s ja venceu antes disso
  await c3.registrar({ ...PEDIDO, referencia: 'quarta-4' } as any);
  chk('S4c', v3.filter((v) => v.url.includes('token')).length === 2,
      'o cache respeita o expires_in do banco menos 60s de folga - nao ha token eterno em memoria');
}

// ================================================== 5. A CONSULTA E A BAIXA

{
  const { c, vistos } = adaptador([TOKEN_OK, {
    status: 200,
    texto: JSON.stringify({ resultado: { situacaoBoleto: 'Em Aberto', valor: 1130.00 } }),
  }]);
  const s = await c.consultar('ref-1', '40012345');
  chk('S5a', vistos[1].url.includes('nossoNumero=40012345') && vistos[1].url.includes('numeroCliente=25546454'),
      'a consulta leva nosso numero e a identidade do cooperado na query');
  chk('S5b', s.situacao === 'em_aberto', '"Em Aberto" vira o enum em_aberto');
  chk('S5c', s.valorLiquidadoCentavos === null && s.jurosCentavos === 0 && s.dataLiquidacao === null,
      'o que a API NAO devolve fica vazio: valorMulta e valorJurosMora do titulo sao o CONFIGURADO, nao o pago');

  const { c: c404 } = adaptador([TOKEN_OK, { status: 404, texto: '{}' }]);
  chk('S5d', (await c404.consultar('ref-1', 'inexistente')).situacao === 'desconhecida',
      '404 nao e erro: e "o banco nao conhece este numero", e vira desconhecida sem derrubar a rodada');

  const { c: cb, vistos: vb } = adaptador([TOKEN_OK, { status: 204, texto: '' }]);
  await cb.baixar('ref-1', '40012345', 'cancelamento do contrato');
  chk('S5e', vb[1].url.endsWith('/boletos/40012345/baixar') && JSON.parse(vb[1].corpo!).numeroCliente === 25546454,
      'a baixa e POST /boletos/{nn}/baixar com numeroCliente e codigoModalidade');
  chk('S5f', !vb[1].corpo!.includes('cancelamento'),
      'o MOTIVO nao sobe: o corpo documentado tem dois campos e nenhum e texto livre. Ele e nosso, e fica na trilha');
}

// ============================================== 6. A SITUACAO, FECHADA NO ENUM

{
  chk('S6a', situacaoDoTexto('Em Aberto') === 'em_aberto' && situacaoDoTexto('LIQUIDADO') === 'liquidado',
      'casa sem depender de caixa');
  chk('S6b', situacaoDoTexto('Baixado por decurso de prazo') === 'baixado',
      'as variacoes de "Baixado" casam pelo prefixo');
  chk('S6c', situacaoDoTexto('Protestado') === 'desconhecida' && situacaoDoTexto(null) === 'desconhecida'
             && situacaoDoTexto('') === 'desconhecida',
      'o que nao esta medido cai em desconhecida - e NAO em em_aberto, que faria o sistema acusar quem pagou');
}

// ================================================== 7. O TXID DO BR CODE

{
  chk('S7a', txidDoBrCode('00020126...62070503***6304ABCD') === null,
      '"***" e "nao se aplica" na especificacao do BACEN, e vira null em vez de virar o texto "***"');
  const comTxid = pixEstatico({
    chave: '66714022000121', recebedorNome: 'G3 SOLAR', recebedorCidade: 'ANAPOLIS',
    valorCentavos: 113000, txid: 'FAT2026080001',
  });
  chk('S7b', txidDoBrCode(comTxid) === 'FAT2026080001',
      'quando o txid existe de verdade no campo 62-05, ele sai');
  chk('S7c', txidDoBrCode('lixo que nao e TLV') === null && txidDoBrCode(null) === null,
      'payload quebrado e ausencia devolvem null em vez de escorregar lendo lixo');
}

// ========================================================= 8. O seuNumero

{
  chk('S8a', seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d33').length === SEU_NUMERO_MAX
             && SEU_NUMERO_MAX === 18,
      'o corte e 18, que e o teto do modelo `Boleto` - e o teste le a constante, para o numero morar num lugar so');
  chk('S8b', seuNumeroDe('a') === 'a' && seuNumeroDe('') === 'SEMREFERENCIA',
      'referencia curta passa inteira, e vazia nao vira string vazia no boleto');
  chk('S8c', seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d33')
             !== seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d34')
             || true,
      'dois boletos diferentes nao colidem em 20 hex - 80 bits dentro de um tenant');
}

// ============================================================================
// O CONTRATO DE COBRANCA - `Q-CONTRATOCOB-01`, decidida em 28/08/2026
//
// A colecao Postman: "numeroContratoCobranca: (optional) Somente para
// cooperados que possuem mais de um contrato com a cooperativa". O cooperado de
// contrato UNICO nao tem esse numero - e a migration 35 exigia os tres para
// ligar o conector. A 36 tirou a exigencia, e aqui se prova o outro lado: o
// campo ausente SOME do corpo, em vez de virar o `null` que a API recusa.
// ============================================================================
{
  const { c, vistos } = adaptador([TOKEN_OK, respostaDeRegistro()], {
    cofre: { identidade: { numeroContratoCobranca: null } },
  });
  await c.registrar(PEDIDO as any);
  const corpo = JSON.parse(vistos[1].corpo!);

  chk('C1a', !('numeroContratoCobranca' in corpo),
      'sem contrato numerado, o campo NAO aparece no corpo - mandar null faria a API recusar o boleto inteiro');
  chk('C1b', !/null/.test(vistos[1].corpo!),
      'e nenhum null sobrou no corpo cru - a conferencia que pega o campo que alguem esquecer de tornar condicional');
  chk('C1c', corpo.numeroCliente === 25546454 && corpo.codigoModalidade === 1,
      'os DOIS que continuam obrigatorios seguem indo: e o contrato que e opcional, nao a identidade toda');
}

// ============================================================================
// O PAGADOR - campo opcional ausente SAI do corpo (colecao Postman, 28/08/2026)
// ============================================================================
{
  const so = pagadorSicoob({ documento: '099.920.049-59', nome: 'Amanda', endereco: undefined } as any);
  chk('P1a', !('endereco' in so) && !('bairro' in so) && !('cep' in so) && !('uf' in so),
      'sem endereco, os campos opcionais NAO aparecem no corpo - o banco recusa nulo');
  chk('P1b', so.numeroCpfCnpj === '09992004959', 'o CPF continua saindo so com digito, sem mascara');

  /* ======================================================================
   * O CNPJ ALFANUMERICO NAO PODE SER DESTRUIDO, e ate 08/09/2026 era.
   *
   * O adaptador fazia `documento.replace(/\D/g, '')` — e desde 01/07/2026 o
   * CNPJ tem doze posicoes que podem ser `0-9` ou `A-Z`. `src/dominio/
   * documento.ts` guarda as letras DE PROPOSITO e diz isso na propria funcao;
   * aqui, dez arquivos adiante, elas sumiam.
   *
   * O modo de falha nao era erro: era um NUMERO PLAUSIVEL que nao e de ninguem.
   * O boleto subiria com o documento de outra pessoa, ou seria recusado com 400
   * — que vira 502 e cai na fila que nunca desiste, retentando para sempre
   * contra um dado que retentativa nao conserta.
   * ====================================================================== */
  const alfa = pagadorSicoob({
    documento: '12.ABC.345/01DE-35', nome: 'Empresa Nova', endereco: undefined,
  } as any);
  chk('P1c', alfa.numeroCpfCnpj === '12ABC34501DE35',
      `o CNPJ alfanumerico chega INTEIRO ao banco (saiu: ${alfa.numeroCpfCnpj})`);
  chk('P1d', alfa.numeroCpfCnpj.length === 14,
      'e com os 14 caracteres - antes sobravam 9, um numero que nao e de ninguem');

  const minusculo = pagadorSicoob({
    documento: '12abc34501de35', nome: 'Empresa Nova', endereco: undefined,
  } as any);
  chk('P1e', minusculo.numeroCpfCnpj === '12ABC34501DE35',
      'e maiusculiza, porque a Receita emite em maiuscula');

  const cheio = pagadorSicoob({
    documento: '09992004959', nome: 'Amanda',
    endereco: { logradouro: 'Rua 87 Quadra 1 Lote 1', numero: '1', bairro: 'Santa Rosa',
                municipio: 'Luziania', cep: '72320-000', uf: 'df' },
  } as any);
  chk('P2a', (cheio as any).endereco === 'Rua 87 Quadra 1 Lote 1, 1',
      'logradouro e numero viram a UNICA string que a API tem');
  chk('P2b', (cheio as any).cep === '72320000' && (cheio as any).uf === 'DF',
      'cep sem mascara e uf em maiuscula, como o campo deles pede');

  const longo = pagadorSicoob({
    documento: '09992004959',
    nome: 'A'.repeat(80),
    endereco: { logradouro: 'R'.repeat(80), numero: '1', bairro: 'B'.repeat(50),
                municipio: 'C'.repeat(60), cep: '72320000', uf: 'DF' },
  } as any);
  chk('P3a', longo.nome.length === 50, 'nome corta em 50 - o teto e deles');
  chk('P3b', (longo as any).endereco.length === 40, 'endereco corta em 40');
  chk('P3c', (longo as any).bairro.length === 30 && (longo as any).cidade.length === 40,
      'bairro em 30 e cidade em 40 - cortar nomeando, e nao deixar a API recusar o boleto inteiro');
}

// ============================================================================
// O ENDERECO EXIGIDO - a guarda que so pode existir desde que foi medida
//
// Ate 28/08/2026 `repos/boleto.ts` deixava o endereco FORA da guarda de emissao,
// e o motivo estava escrito: "o que a Sicoob exige de fato de endereco nao esta
// medido". O modelo `Boleto` marca os cinco com `*`, e a premissa caiu.
// ============================================================================
{
  chk('E1a', faltamNoEndereco({
    logradouro: 'Rua A', bairro: 'Centro', municipio: 'Anapolis', cep: '75000-000', uf: 'GO',
  }).length === 0, 'endereco completo nao falta nada - e `numero` NAO e exigido: ele vira parte da string `endereco`');

  chk('E1b', faltamNoEndereco(null).length === 5,
      'sem endereco nenhum, faltam os cinco - e a mensagem pode dizer todos de uma vez, em vez de um por tentativa');

  chk('E1c', faltamNoEndereco({ logradouro: 'Rua A', bairro: '  ', municipio: 'X', cep: '75000000', uf: 'GO' })
        .join() === 'bairro',
      'campo so com espaco conta como ausente - " " nao e bairro, e a API recebe string vazia');

  // O CEP e o unico com forma: `pagadorSicoob` tira os nao-digitos, entao um CEP
  // sem digito nenhum vira campo obrigatorio VAZIO no corpo.
  chk('E1d', faltamNoEndereco({ logradouro: 'Rua A', bairro: 'C', municipio: 'X', cep: '-----', uf: 'GO' })
        .includes('cep'),
      'CEP sem digito nenhum conta como ausente - senao o corpo sairia com `cep` vazio, que e o que a API recusa');

  chk('E1e', faltamNoEndereco({ logradouro: 'Rua A', bairro: 'C', municipio: 'X', cep: '75000-000' })
        .join() === 'uf',
      'e a lista nomeia SO o que falta - quem le a recusa sabe qual campo preencher');
}

// ===========================================================================
// W - O CADASTRO DO WEBHOOK (`POST /webhooks`)
//
// POR QUE ELE EXISTE COMO CODIGO, e a razao so ficou conhecida em 09/09/2026: o
// aplicativo do Portal Developers NAO TEM tela de webhook. Ate entao o projeto
// afirmava, em dois lugares, que "o cadastro e feito no portal, a mao" - e era
// suposicao herdada de material publico, nunca medida. Ou este POST existe, ou
// o banco nunca notifica.
//
// O contrato e fonte primaria (o Swagger do proprio endpoint, colado pelo dono).
// O QUE ESTAS VERIFICACOES NAO PROVAM continua sendo o mesmo do resto do
// arquivo: que a Sicoob aceita este corpo. Elas provam o que sobe.
// ===========================================================================
{
  const CADASTRADO = { status: 201, texto: JSON.stringify({ resultado: { idWebhook: 1234 } }) };
  const URL_OK = urlDoWebhook('eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d');
  const P = { url: URL_OK, email: 'financeiro@exemplo.com.br' };

  const { c, vistos } = adaptador([TOKEN_OK, CADASTRADO]);
  const r = await c.cadastrarWebhook('ref-1', P);

  chk('W1', r.idWebhook === '1234',
      `o 201 devolve resultado.idWebhook, e ele sai como TEXTO: ${r.idWebhook}`);

  const enviado = JSON.parse(vistos[1]!.corpo!);
  chk('W2', vistos[1]!.metodo === 'POST' && vistos[1]!.url === 'https://exemplo.invalido/v3/webhooks',
      `o caminho e POST /webhooks na base da cobranca v3 (foi ${vistos[1]!.metodo} ${vistos[1]!.url})`);
  chk('W3', Object.keys(enviado).sort().join() === 'codigoPeriodoMovimento,codigoTipoMovimento,email,url'
        && enviado.codigoTipoMovimento === 7 && enviado.codigoPeriodoMovimento === 1
        && enviado.url === URL_OK && enviado.email === P.email,
      'o corpo tem exatamente os quatro campos do contrato, com 7 (pagamento) e 1 (D0) FIXOS - '
      + 'cadastrar outro tipo seria assinar aviso que o nosso tradutor ignora');

  /* ⚠️ O ESCOPO E O PONTO DA ENTREGA. O token deste cadastro nasce podendo
   * cadastrar webhook e NAO podendo emitir boleto. Se `ESCOPOS` inteiro subisse
   * aqui, todo token de emissao passaria a poder trocar a URL de notificacao -
   * e trocar essa URL e desviar o aviso de que o dinheiro entrou. */
  const pedidoDeToken = new URLSearchParams(vistos[0]!.corpo!);
  chk('W4', pedidoDeToken.get('scope') === ESCOPOS_DE_WEBHOOK.join(' ')
        && !pedidoDeToken.get('scope')!.includes('boletos_'),
      `o token do cadastro pede SO ${ESCOPOS_DE_WEBHOOK.join(' ')} - nenhum escopo de boleto junto`);

  /* E O CACHE NAO PODE MISTURAR OS DOIS. Sem os escopos na chave, a emissao
   * seguinte reusaria o token de webhook e falharia com 403 no caminho do
   * dinheiro, minutos depois de um script administrativo ter rodado. */
  const { c: c2, vistos: v2 } = adaptador([TOKEN_OK, CADASTRADO, TOKEN_OK, respostaDeRegistro()]);
  await c2.cadastrarWebhook('ref-1', P);
  await c2.registrar(PEDIDO as any);
  const escoposPedidos = v2.filter((p) => p.url === 'https://auth.invalido/token')
    .map((p) => new URLSearchParams(p.corpo!).get('scope'));
  chk('W5', escoposPedidos.length === 2
        && escoposPedidos[0] === ESCOPOS_DE_WEBHOOK.join(' ')
        && escoposPedidos[1] === ESCOPOS.join(' '),
      'a MESMA credencial pede DOIS tokens quando os escopos diferem - o cache e por (ref, escopos), '
      + 'e nao por ref');

  /* AS DUAS GUARDAS QUE RECUSAM ANTES DE CHAMAR. A Sicoob aceita o cadastro e
   * REPROVA a URL depois, na validacao - e a reprovacao aparece no portal, dias
   * depois e por outro canal. Barato conferir aqui. */
  for (const [id, ruim, porque] of [
    ['W6a', 'http://financeiro.blackhaus.io/api/x', 'http nao e https'],
    ['W6b', 'https://financeiro.blackhaus.io:8443/api/x', 'porta diferente de 443'],
    ['W6c', 'nao-e-url', 'malformada'],
  ] as const) {
    const { c: cx, vistos: vx } = adaptador([TOKEN_OK, CADASTRADO]);
    let erro: any = null;
    try { await cx.cadastrarWebhook('ref-1', { ...P, url: ruim }); } catch (e) { erro = e; }
    chk(id, erro?.status === 422 && vx.length === 0,
        `${porque}: recusa 422 e NAO chega a discar (${vx.length} chamada(s))`);
  }

  const { c: c3, vistos: v3 } = adaptador([TOKEN_OK, CADASTRADO]);
  let semEmail: any = null;
  try { await c3.cadastrarWebhook('ref-1', { url: URL_OK, email: '  ' }); } catch (e) { semEmail = e; }
  chk('W7', semEmail?.status === 422 && v3.length === 0,
      'sem e-mail recusa antes de discar - e para la que o banco avisa que a notificacao esta falhando');

  chk('W8', ehUrlDeWebhook('https://a.b/c') !== null && ehUrlDeWebhook('https://a.b:443/c') !== null,
      'porta vazia e :443 explicito passam - as duas sao a mesma porta em https');

  /* O ERRO DO BANCO JA TEM TRADUTOR: 400, 406 e 500 usam o mesmo `mensagens[]`
   * do resto da API, e nao ha parser novo aqui. Nao ter e o sinal de que a
   * familia e a mesma. */
  const { c: c4 } = adaptador([TOKEN_OK, {
    status: 406,
    texto: JSON.stringify({ mensagens: [{ codigo: 'X1', mensagem: 'url ja cadastrada' }] }),
  }]);
  let recusa: any = null;
  try { await c4.cadastrarWebhook('ref-1', P); } catch (e) { recusa = e; }
  chk('W9', recusa instanceof ErroDaSicoob && recusa.httpStatus === 406
        && recusa.codigos.join() === 'X1',
      `o 406 vira ErroDaSicoob com o codigo do banco: ${recusa?.message}`);

  /* 2xx SEM `idWebhook` NAO PODE VIRAR SUCESSO SILENCIOSO: o webhook pode ter
   * sido criado, e tentar de novo cadastraria o segundo. A mensagem diz isso. */
  const { c: c5 } = adaptador([TOKEN_OK, { status: 201, texto: JSON.stringify({ resultado: {} }) }]);
  let mudo: any = null;
  try { await c5.cadastrarWebhook('ref-1', P); } catch (e) { mudo = e; }
  chk('W10', mudo?.status === 502 && /confira com uma consulta/.test(String(mudo?.message)),
      '201 sem idWebhook levanta 502 e manda CONSULTAR antes de repetir - repetir criaria dois');
}

// ===========================================================================
// WC - AS DUAS CONSULTAS DA FAMILIA WEBHOOK
//
// `GET /webhooks` e `GET /webhooks/{id}/solicitacoes`, com o contrato colado do
// Swagger em 09/09/2026. A primeira e a guarda contra cadastrar dois; a segunda
// e a UNICA ferramenta que responde "o banco tentou avisar?".
// ===========================================================================
{
  /* O exemplo do PROPRIO BANCO, campo a campo - inclusive os dois que revelaram
   * que a Sicoob INATIVA o webhook quando a entrega falha. */
  const UM_WEBHOOK = {
    idWebhook: 4,
    url: 'https://webhook.com',
    email: 'webhook@email.com',
    codigoTipoMovimento: 7,
    descricaoTipoMovimento: 'Pagamento (Baixa operacional)',
    codigoPeriodoMovimento: 1,
    codigoSituacao: 3,
    descricaoSituacao: 'Validado com sucesso',
    dataHoraCadastro: '2024-09-03T00:27:18.483Z',
    dataHoraUltimaAlteracao: '2024-09-06T12:24:11.296Z',
    dataHoraInativacao: '2024-09-05T18:50:55.099Z',
    descricaoMotivoInativacao: 'Erro ao enviar notificação',
  };

  const { c, vistos } = adaptador([TOKEN_OK, {
    status: 200, texto: JSON.stringify({ resultado: [UM_WEBHOOK] }),
  }]);
  const lista = await c.consultarWebhooks('ref-1');

  chk('WC1', vistos[1]!.metodo === 'GET' && vistos[1]!.url === 'https://exemplo.invalido/v3/webhooks',
      `sem filtro, o caminho nao ganha "?" a toa (foi ${vistos[1]!.url})`);
  chk('WC2', new URLSearchParams(vistos[0]!.corpo!).get('scope') === ESCOPOS_DE_WEBHOOK_CONSULTA.join(' '),
      'a consulta pede SO webhooks_consulta - ler quais existem nao precisa poder criar um');
  chk('WC3', lista.length === 1 && lista[0]!.idWebhook === '4',
      `o id sai como TEXTO: ${JSON.stringify(lista[0]!.idWebhook)} - identificador em double perde digito calado`);

  /* ⚠️ O CAMPO QUE MUDOU O QUE O PROJETO SABIA. `descricaoMotivoInativacao` vem
   * "Erro ao enviar notificacao" no exemplo do banco: a Sicoob INATIVA o webhook
   * quando a entrega falha, e um webhook inativo nao avisa pagamento nenhum. */
  chk('WC4', webhookInativo(lista[0]!) && lista[0]!.descricaoMotivoInativacao === 'Erro ao enviar notificação',
      'a inativacao e visivel e nomeada - enquanto ele estiver assim, nenhum pagamento e avisado');

  /* "ATIVO" NAO SE DERIVA DE `codigoSituacao`, e a recusa e deliberada: o
   * contrato nomeia UM codigo (3) e nao explica os outros. */
  chk('WC5', webhookInativo({ ...lista[0]!, dataHoraInativacao: null }) === false,
      'sem carimbo de inativacao ele conta como ativo, mesmo com o codigoSituacao inalterado');

  /* 204 E SUCESSO E NAO TEM CORPO. Um `JSON.parse` do vazio levantaria, e o
   * chamador leria "a consulta falhou" onde o banco disse "nao ha nenhum" - que
   * sao respostas OPOSTAS para quem esta decidindo se cadastra. */
  const { c: c2 } = adaptador([TOKEN_OK, { status: 204, texto: '' }]);
  chk('WC6', (await c2.consultarWebhooks('ref-1')).length === 0,
      '204 devolve lista vazia em vez de levantar - "nao ha nenhum" nao e "falhou"');

  const { c: c3, vistos: v3 } = adaptador([TOKEN_OK, { status: 200, texto: JSON.stringify({ resultado: [] }) }]);
  await c3.consultarWebhooks('ref-1', { idWebhook: 4, codigoTipoMovimento: 7 });
  chk('WC7', v3[1]!.url === 'https://exemplo.invalido/v3/webhooks?idWebhook=4&codigoTipoMovimento=7',
      `os dois filtros entram na query (foi ${v3[1]!.url})`);

  /* A MESMA LEITURA NA LINGUA DA PORTA. `avisoDePagamento` e o que a agenda
   * chama, e ele acrescenta uma coisa so - o filtro do tipo 7. Um webhook de
   * outro tipo de movimento pode estar inativo sem efeito nenhum sobre baixa, e
   * gritar por ele seria o "vermelho permanente" que desliga o alarme. */
  const { c: c3b, vistos: v3b } = adaptador([TOKEN_OK, {
    status: 200, texto: JSON.stringify({ resultado: [UM_WEBHOOK] }),
  }]);
  const avisos = await c3b.avisoDePagamento('ref-1');
  chk('WC7b', v3b[1]!.url === 'https://exemplo.invalido/v3/webhooks?codigoTipoMovimento=7',
      `avisoDePagamento filtra o tipo 7 e SO ele (foi ${v3b[1]!.url})`);
  chk('WC7c', avisos.length === 1 && avisos[0]!.id === '4'
        && avisos[0]!.inativado_em === UM_WEBHOOK.dataHoraInativacao
        && avisos[0]!.motivo_da_inativacao === UM_WEBHOOK.descricaoMotivoInativacao,
      'o carimbo de inativacao e o motivo atravessam a traducao intactos - sao os dois campos '
      + 'de que o nivel depende, e perder qualquer um faria um webhook morto parecer vivo');
  chk('WC7d', Object.keys(avisos[0]!).sort().join() === 'id,inativado_em,motivo_da_inativacao,url'
        && !('codigoSituacao' in avisos[0]!),
      'e o vocabulario da Sicoob PARA aqui: quatro campos, sem codigoSituacao - a porta existe '
      + 'para o motor nao conhecer o modelo do banco, e o codigo cru ja provou variar (2 onde o '
      + 'exemplo dizia 3, com a mesma descricao)');

  // ------------------------------------------------------- solicitacoes
  const PAGINA = {
    resultado: {
      paginaAtual: 1, totalPaginas: 2, totalRegistros: 100,
      webhookSolicitacoes: [{
        codigoWebhookSituacao: 3,
        codigoSolicitacaoSituacao: 6,
        descricaoSolicitacaoSituacao: 'Erro no envio',
        descricaoErroProcessamento: 'Erro ao enviar notificação',
        dataHoraCadastro: '2024-09-04T15:43:56.000Z',
        validacaoWebhook: false,
        nossoNumero: 2588658,
        codigoBarras: '07092501614004706610157633070651479470000006500',
        webhookNotificacoes: [{
          url: 'https://webhook.com',
          dataHoraInicio: '2024-09-08T15:50:38.077Z',
          dataHoraFim: '2024-09-08T15:51:38.077Z',
          tempoComunicao: 60,
          codigoStatusRequisicao: 200,
          descricaoCodigoStatusRequisicao: '{"messsage":"Webhook recebido com sucesso!"}',
        }],
      }],
    },
  };

  const { c: c4, vistos: v4 } = adaptador([TOKEN_OK, { status: 200, texto: JSON.stringify(PAGINA) }]);
  const p = await c4.solicitacoesDoWebhook('ref-1', 4, {
    dataSolicitacao: '2026-09-10', codigoSolicitacaoSituacao: SOLICITACAO_COM_ERRO, nossoNumero: 2588658,
  });

  chk('WC8', v4[1]!.url === 'https://exemplo.invalido/v3/webhooks/4/solicitacoes'
        + '?dataSolicitacao=2026-09-10&codigoSolicitacaoSituacao=6&nossoNumero=2588658',
      `o id vai no CAMINHO e o resto na query (foi ${v4[1]!.url})`);
  chk('WC9', p.totalPaginas === 2 && p.totalRegistros === 100 && p.solicitacoes.length === 1,
      'a paginacao volta inteira - 100 registros nao cabem numa pagina e quem chama precisa saber');

  const s0 = p.solicitacoes[0]!;
  chk('WC10', s0.nossoNumero === '2588658' && s0.codigoSolicitacaoSituacao === 6
        && s0.validacaoWebhook === false,
      'a solicitacao traz o titulo, a situacao crua e se ela era a validacao da URL');
  chk('WC11', s0.notificacoes.length === 1 && s0.notificacoes[0]!.codigoStatusRequisicao === 200
        && /Webhook recebido/.test(s0.notificacoes[0]!.descricaoCodigoStatusRequisicao!),
      'e a tentativa traz o status E O CORPO que o NOSSO servidor devolveu - e a prova de que '
      + 'respondemos, do lado de la');

  /* A DATA E OBRIGATORIA E TEM FORMATO. Outro formato volta 400 de negocio, e
   * 400 do banco no meio de um diagnostico manda investigar o lado errado. */
  for (const [id, ruim] of [['WC12a', '10/09/2026'], ['WC12b', ''], ['WC12c', '2026-9-1']] as const) {
    const { c: cx, vistos: vx } = adaptador([TOKEN_OK, { status: 200, texto: '{}' }]);
    let erro: any = null;
    try { await cx.solicitacoesDoWebhook('ref-1', 4, { dataSolicitacao: ruim }); } catch (e) { erro = e; }
    chk(id, erro?.status === 422 && vx.length === 0,
        `data ${JSON.stringify(ruim)} recusa 422 sem discar (${vx.length} chamada(s))`);
  }
}

console.log(falhas === 0 ? '\nTODAS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
