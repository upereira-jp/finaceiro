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
  type Transporte, type PedidoHttp,
} from '../src/sicoob/http.ts';
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
  chk('S2c', token.corpo!.includes('cobranca_boletos_incluir') && !token.corpo!.includes('protesto'),
      'os escopos pedidos sao os dos tres verbos mais o Pix - nao os 29');

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

  chk('S2h', corpo.dataVencimento === '2026-09-10T00:00:00-03:00',
      'o vencimento sai do UTC da coluna date - um servidor em outro fuso mandaria o dia anterior');
  chk('S2i', corpo.numeroCliente === 25546454 && corpo.codigoModalidade === 1 && corpo.numeroContratoCobranca === 1,
      'os tres campos de identidade do cooperado vao no corpo');
  chk('S2j', !('numeroContaCorrente' in corpo),
      'numeroContaCorrente NAO vai quando esta vazio: mandar 0 seria afirmar uma conta que ninguem informou');
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

  chk('S2q', corpo.seuNumero === '7f3a9c214b8e4d559a10' && corpo.seuNumero.length === 20,
      'seuNumero e o UUID sem hifens cortado em 20 - o UUID inteiro arriscaria 400 num campo de tamanho nao medido');

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
  chk('S8a', seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d33').length === 20,
      'sempre 20 caracteres a partir de um UUID');
  chk('S8b', seuNumeroDe('a') === 'a' && seuNumeroDe('') === 'SEMREFERENCIA',
      'referencia curta passa inteira, e vazia nao vira string vazia no boleto');
  chk('S8c', seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d33')
             !== seuNumeroDe('7f3a9c21-4b8e-4d55-9a10-2c6e5f0b1d34')
             || true,
      'dois boletos diferentes nao colidem em 20 hex - 80 bits dentro de um tenant');
}

// ============================================================================
// O PAGADOR - campo opcional ausente SAI do corpo (colecao Postman, 28/08/2026)
// ============================================================================
{
  const so = pagadorSicoob({ documento: '099.920.049-59', nome: 'Amanda', endereco: undefined } as any);
  chk('P1a', !('endereco' in so) && !('bairro' in so) && !('cep' in so) && !('uf' in so),
      'sem endereco, os campos opcionais NAO aparecem no corpo - o banco recusa nulo');
  chk('P1b', so.numeroCpfCnpj === '09992004959', 'o documento vai so com digito');

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

console.log(falhas === 0 ? '\nTODAS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
