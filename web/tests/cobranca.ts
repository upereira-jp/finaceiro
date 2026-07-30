// As regras da cobranca. Puras, sem banco, sem rede e sem DOM.
// Uso: node --experimental-strip-types web/tests/cobranca.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e sao duas coisas de naturezas diferentes.
//
// 1. A REGRA 5 NO FORMULARIO. A aba de Cobranca pede a credencial da Sicoob, e o
//    caminho natural de quem opera e colar ali o `client_secret` ou o conteudo do
//    certificado. A coluna e `text` e o banco aceitaria. O contraexemplo esta no
//    banco ao lado - cinco tokens em `text` puro na tabela `tenants` do CRM - e o
//    repositorio foi publico ate 25/07. O custo de errar aqui nao e um campo
//    errado: e rotacao de credencial.
//
// 2. O ESPELHO DAS TRANSICOES DO SERVIDOR. Se a tela oferecer "emitir" numa
//    fatura paga, o servidor recusa - entao o risco nao e cobranca errada, e uma
//    tela que promete o que nao entrega. O que estas verificacoes impedem e a
//    DERIVA: o dia em que alguem mudar `emitir()` no repositorio e nao aqui.
//
// A conta do `totalEsperadoDaBaixa` e a unica que mexe com dinheiro, e ela e
// soma de inteiros em centavos de proposito (regra 1).

import {
  mover, paraEnvio, type CampoConfigurado,
  sinalDeSegredo, motivoDaTravaDoConector, podeSalvarConector,
  estadoDoCertificado, DIAS_DE_AVISO_DO_CERTIFICADO,
  podeEmitirFatura, podeGerarBoleto, podeBaixarManual,
  totalEsperadoDaBaixa, tomDoStatusDaFatura,
  type EstadoDoConector, type StatusFatura,
} from '../src/cobranca-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ------------------------------------------- B1 a referencia legitima PASSA
{
  // Sem este sentido, a trava poderia ser um `false` preso e ninguem notaria.
  const refs = ['sicoob/g3-solar/prod', 'cofre:sicoob#1', '9f1c8e22-4d6a-4b31-9c77-1f2a3b4c5d6e', 'ref-001'];
  chk('B1', refs.every((r) => sinalDeSegredo(r) === null),
      'referencia curta e opaca passa: uuid, caminho de cofre, apelido');

  const completo: EstadoDoConector = { credencialRef: 'sicoob/g3-solar/prod', provedor: 'sicoob', ocupado: false };
  chk('B1b', podeSalvarConector(completo) === true && motivoDaTravaDoConector(completo) === null,
      'e o formulario completo libera o botao, sem motivo de trava');
}

// --------------------------------- B2 segredo colado no campo NAO passa (regra 5)
{
  const casos: Array<[string, string]> = [
    ['-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----', 'bloco PEM'],
    ['eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.aaaa', 'JWT'],
    ['client_secret=9f8e7d6c5b4a', 'nome de campo de segredo'],
    ['x'.repeat(220), 'texto longo demais'],
    ['QUJDRA'.repeat(30), 'base64 longo'],
  ];
  chk('B2', casos.every(([v]) => sinalDeSegredo(v) !== null),
      'PEM, JWT, client_secret, base64 longo e texto de 200+ sao reconhecidos como SEGREDO');

  const comPem: EstadoDoConector = {
    credencialRef: '-----BEGIN CERTIFICATE-----\nMIIC\n-----END CERTIFICATE-----',
    provedor: 'sicoob', ocupado: false,
  };
  chk('B2b', podeSalvarConector(comPem) === false
          && motivoDaTravaDoConector(comPem) === 'credencial_ref_parece_segredo',
      'e o botao TRAVA com motivo nomeado - a tela explica a regra 5 em vez de recusar sem dizer nada');
  chk('B2c', sinalDeSegredo(comPem.credencialRef) === 'bloco PEM',
      'o sinal se NOMEIA, para a mensagem dizer o que foi reconhecido');
  chk('B2d', podeSalvarConector({ ...comPem, credencialRef: 'sicoob/g3-solar/prod' }) === true,
      'e trocar por uma referencia destrava - a regra e sobre o valor, nao um `false` preso');
}

// ---------------------------------------------- B3 a ordem das travas do conector
{
  const vazio: EstadoDoConector = { credencialRef: '', provedor: '', ocupado: false };
  chk('B3', motivoDaTravaDoConector(vazio) === 'sem_provedor',
      'com tudo vazio o motivo e o provedor, e um motivo por vez');
  chk('B3b', motivoDaTravaDoConector({ ...vazio, provedor: 'sicoob' }) === 'sem_credencial_ref',
      'depois a credencial_ref, que e NOT NULL no banco');
  chk('B3c', motivoDaTravaDoConector({ ...vazio, ocupado: true }) === 'ocupado',
      '`ocupado` vence todos: durante a escrita o que importa e que ela esta em curso');
}

// --------------------------------------- B4 o certificado A1, e o `nao_medido`
{
  chk('B4', estadoDoCertificado({ temConector: false, dias: null }) === 'sem_conector',
      'sem conector cadastrado o estado e sem_conector, nao "ok"');
  chk('B4b', estadoDoCertificado({ temConector: true, dias: null }) === 'nao_medido',
      'conector SEM data de validade e `nao_medido` - e `nao_medido` NAO e `ok` (a licao do prontidao.ts)');
  chk('B4c', estadoDoCertificado({ temConector: true, dias: -1 }) === 'vencido',
      'vencido ontem e vencido: o PRD 6 diz que A1 vencido derruba a emissao SEM ERRO OBVIO');
  chk('B4d', estadoDoCertificado({ temConector: true, dias: DIAS_DE_AVISO_DO_CERTIFICADO }) === 'vence_em_breve'
          && estadoDoCertificado({ temConector: true, dias: DIAS_DE_AVISO_DO_CERTIFICADO + 1 }) === 'ok',
      `o limite de ${DIAS_DE_AVISO_DO_CERTIFICADO} dias e prendido nos dois lados da fronteira`);
  chk('B4e', estadoDoCertificado({ temConector: true, dias: 0 }) === 'vence_em_breve',
      'vence HOJE nao e vencido e nao e ok - ainda da para emitir, e e o ultimo dia');
}

// ------------------------- B5 as transicoes, espelho do servidor, dois sentidos
{
  const todos: StatusFatura[] = ['rascunho', 'emitida', 'paga', 'vencida', 'cancelada', 'negociada'];

  chk('B5', podeEmitirFatura('rascunho') === true
         && todos.filter((s) => s !== 'rascunho').every((s) => podeEmitirFatura(s) === false),
      'SO rascunho emite - `fatura.emitir()` filtra por status no proprio updateMany');

  chk('B5b', podeGerarBoleto('emitida', null) === true
          && todos.filter((s) => s !== 'emitida').every((s) => podeGerarBoleto(s, null) === false),
      'boleto SO em fatura emitida - `boleto.registrar()` levanta FaturaSemBoleto no resto');
  chk('B5c', podeGerarBoleto('emitida', 'registrado') === false
          && podeGerarBoleto('emitida', 'liquidado') === false
          && podeGerarBoleto('emitida', 'erro') === true,
      'boleto ja registrado ou liquidado nao se pede de novo; depois de `erro`, sim');

  chk('B5d', podeBaixarManual('emitida') === true && podeBaixarManual('vencida') === true
          && podeBaixarManual('rascunho') === false && podeBaixarManual('paga') === false,
      'baixa manual so em emitida ou vencida - `liquidacao.baixar()` levanta FaturaNaoLiquidavel no resto');
}

// ------------------------------------ B6 o total da baixa, em inteiros (regra 1)
{
  const f = { valor_consumo_centavos: 81244, valor_tarifas_concessionaria_centavos: 1050 };
  chk('B6', totalEsperadoDaBaixa(f, 0, 0) === 82294,
      'sem juros nem multa o total e consumo + tarifas da concessionaria');
  chk('B6b', totalEsperadoDaBaixa(f, 815, 1234) === 84343,
      'juros e multa ENTRAM na conta - e mudar um deles muda o valor que o servidor vai exigir');
  chk('B6c', Number.isInteger(totalEsperadoDaBaixa(f, 815, 1234)),
      'e o resultado e INTEIRO: soma de centavos, sem divisao e sem float (regra 1)');
  // O caso que a `ValorNaoConfere` do servidor pega: um centavo de diferenca.
  chk('B6d', totalEsperadoDaBaixa(f, 1, 0) !== totalEsperadoDaBaixa(f, 0, 0),
      'um centavo de juros muda o total - e o servidor recusa a baixa que nao fecha ao centavo');
}

// ------------------------------------------------------------ B7 tom do status
{
  chk('B7', tomDoStatusDaFatura('paga') === 'ok'
         && tomDoStatusDaFatura('vencida') === 'pendente'
         && tomDoStatusDaFatura('cancelada') === 'pendente'
         && tomDoStatusDaFatura('rascunho') === 'nao_medido',
      'rascunho nao e problema nem sucesso: e `nao_medido`, como no resto do sistema');
}

// -------------------------------- B8 reordenar campos do documento, sem buraco
{
  const l = ['a', 'b', 'c'];
  chk('B8', JSON.stringify(mover(l, 0, 1)) === JSON.stringify(['b', 'a', 'c']),
      'descer o primeiro troca com o segundo');
  chk('B8b', JSON.stringify(mover(l, 2, -1)) === JSON.stringify(['a', 'c', 'b']),
      'subir o ultimo troca com o penultimo');
  // O SENTIDO QUE IMPORTA: fora dos limites nao pode produzir `undefined` na
  // lista - a tela renderizaria uma linha em branco e o `paraEnvio` mandaria um
  // campo sem nome para o servidor.
  chk('B8c', JSON.stringify(mover(l, 0, -1)) === JSON.stringify(l)
          && JSON.stringify(mover(l, 2, 1)) === JSON.stringify(l)
          && JSON.stringify(mover(l, 9, 1)) === JSON.stringify(l),
      'subir o primeiro, descer o ultimo e indice inexistente devolvem a MESMA ordem, sem buraco');
  chk('B8d', mover(l, 0, 1) !== l && JSON.stringify(l) === JSON.stringify(['a', 'b', 'c']),
      'a lista original nao e mutada - o React nao re-renderiza mutacao no lugar');
}

// ------------------------------------- B9 a ordem enviada e a ordem MOSTRADA
{
  const cfg: CampoConfigurado[] = [
    { campo: 'valor_total_centavos', rotulo: 'Total do mês', visivel: true },
    { campo: 'numero_uc', rotulo: '  ', visivel: true },
    { campo: 'flag_fatura_cheia', rotulo: 'Cheia', visivel: false },
  ];
  const env = paraEnvio(cfg);
  chk('B9', env[0].ordem === 0 && env[1].ordem === 1 && env[2].ordem === 2,
      'a `ordem` sai da POSICAO na lista - numero digitado a mao empataria, e o servidor desempata pelo nome');
  chk('B9b', env[1].rotulo === null,
      'rotulo em branco vira NULL, e o servidor cai no rotulo padrao - string vazia viraria um campo sem nome no documento');
  chk('B9c', env[2].visivel === false && env.length === 3,
      'campo escondido VAI no envio com visivel=false - omiti-lo o faria voltar pelo padrao na proxima leitura');
}

console.log();
if (falhas > 0) { console.log(`--- cobranca: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- cobranca (regras da tela): 26 verificacoes, 0 falhas');
