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

import { readFileSync } from 'node:fs';
import {
  mover, paraEnvio, type CampoConfigurado,
  sinalDeSegredo, motivoDaTravaDoConector, podeSalvarConector,
  estadoDoCertificado, DIAS_DE_AVISO_DO_CERTIFICADO,
  podeEmitirFatura, podeGerarBoleto, podeBaixarManual,
  totalEsperadoDaBaixa, conferirTarifas,
  podeImportarBoleto, motivoDaTravaDaImportacao, podeImportarAgora, DIGITOS_DA_LINHA,
  podeBaixarNoBanco,
  type EstadoDoConector, type StatusFatura, type FaturaConferivel,
} from '../src/cobranca-regras.ts';
import {
  grupoDeAcao, chaveDaOrdemDeAcao, tipoDaRecusa, lerRecusa, recusaPrevista, recusaDaLinha,
  acaoDaLinha, notaDaSituacao, paraPedirBoleto, placarDaSerie, candidatosDoMes, mesSemTrabalho, procurarMesComTrabalho,
  lerMesLembrado, lembrarMes, CHAVE_DO_MES_LEMBRADO, type StatusDaCobranca,
} from '../src/emissao-regras.ts';
import { decimalEmBr, kwhEmBr } from '../src/dinheiro.ts';
import { SELO_DA_COBRANCA } from '../src/tom-do-estado.ts';
import { destinoDoEndereco, unidadeDaConsulta } from '../src/destino-da-camada.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
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
  /* [01/10/2026, etapa 7b] O tom saiu de `cobranca-regras.ts` para
     `tom-do-estado.ts`, e MUDOU: rascunho era `nao_medido` — o mesmo ambar da
     emitida —, e as duas ficavam iguais em dezesseis das vinte linhas. Rascunho
     e tarefa (`a_fazer`); emitida esta em curso sem voce (`neutro`). */
  chk('B7', SELO_DA_COBRANCA.paga.tom === 'ok'
         && SELO_DA_COBRANCA.vencida.tom === 'erro'
         && SELO_DA_COBRANCA.cancelada.tom === 'neutro'
         && SELO_DA_COBRANCA.rascunho.tom === 'a_fazer'
         && SELO_DA_COBRANCA.emitida.tom === 'neutro',
      'rascunho e tarefa (`a_fazer`) e emitida e neutra — nao dividem mais o tom; so a vencida e '
      + 'vermelha — cancelar e decisao, nao falha (30/09, etapa 4a; 01/10, etapa 7b)');
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

// ------------------- B10 a tarifa da concessionaria ausente vira NUMERO
//
// `Q-TARIFA-CONC-01`. O modo de falha perseguido nao e a fatura errada - e o
// SILENCIO: `valor_total_centavos` e coluna gerada, a parcela ausente vale zero,
// e o lote emite sem erro cobrando so o credito. Estas verificacoes prendem que a
// contagem existe, que ela nao perde item e que ela nao decide nada.
{
  const uc = (n: string) => `UC-${n}`;
  const numero = (id: string) => uc(id);
  const f = (status: StatusFatura, id: string, tarifa: number | null): FaturaConferivel =>
    ({ status, unidade_consumidora_id: id, valor_tarifas_concessionaria_centavos: tarifa });

  const lote: FaturaConferivel[] = [
    f('rascunho', '1', 0),
    f('rascunho', '2', 15_000),
    f('rascunho', '3', 0),
    f('emitida',  '4', 0),      // ja emitida: fora do universo, nao ha mais o que lancar
    f('cancelada', '5', 0),
  ];
  const c = conferirTarifas(lote, numero);

  chk('B10', c.rascunhos === 3 && c.semTarifa === 2 && c.comTarifa === 1,
      'so RASCUNHO entra na conta: 3 rascunhos, 2 sem tarifa - emitida e cancelada ficam fora');
  chk('B10b', c.comTarifa + c.semTarifa === c.rascunhos,
      'a INVARIANTE e a soma: com + sem = rascunhos, sempre - contagem que perde item parece completa');
  chk('B10c', c.ucsSemTarifa.join(',') === 'UC-1,UC-3',
      'as UCs sem tarifa saem NOMEADAS, e nao so contadas - contar manda procurar, nomear diz onde');

  // `null` e leitura PARCIAL, e nao "tarifa zero conferida". A coluna e NOT NULL
  // com default 0 no banco: null so chega aqui por leitura incompleta, e conta-lo
  // como conferido seria a mentira que esta funcao existe para nao contar.
  const comNulo = conferirTarifas([f('rascunho', '9', null)], numero);
  chk('B10d', comNulo.semTarifa === 1 && comNulo.comTarifa === 0,
      'null conta como AUSENTE, nao como zero conferido');

  // O sentido oposto: sem esta, um `semTarifa` preso em zero passaria despercebido.
  const todasComTarifa = conferirTarifas([f('rascunho', '7', 1), f('rascunho', '8', 99)], numero);
  chk('B10e', todasComTarifa.semTarifa === 0 && todasComTarifa.ucsSemTarifa.length === 0,
      'com tarifa em todas, a contagem e zero e a tela nao mostra aviso nenhum');

  // A contagem NAO trava nada: quem decide se zero esta certo e a Q-TARIFA-CONC-01
  // (a), que tem dono. `podeEmitirFatura` continua olhando so o status.
  chk('B10f', podeEmitirFatura('rascunho') === true && c.semTarifa > 0,
      'contar NAO e decidir: com 2 sem tarifa, emitir rascunho continua permitido (regra 10)');

  // Lista vazia nao e um estado especial, e o `0 de 0` nao pode virar aviso.
  const vazio = conferirTarifas([], numero);
  chk('B10g', vazio.rascunhos === 0 && vazio.semTarifa === 0,
      'competencia sem rascunho nao gera aviso - 0 de 0 nao e pendencia');
}

// ------------------------------- B11 o boleto EMITIDO NO BANCO, e quando ele entra
//
// O caminho novo de 17/08: enquanto o certificado A1 nao existe, o titulo e
// emitido a mao no portal da cooperativa e transcrito para ca. Estas verificacoes
// prendem as duas perguntas que a TELA responde sozinha - se oferece o campo, e
// se o botao acende. Quem confere a linha e o servidor.
{
  chk('B11', podeImportarBoleto('emitida', null) === true,
      'fatura emitida sem boleto nenhum: e o caso comum, e ele aceita importacao');
  chk('B11b', podeImportarBoleto('emitida', 'erro') === true,
      'boleto em ERRO aceita: a chamada a Sicoob falhou e alguem emitiu no portal - '
      + 'e exatamente para isto que o caminho existe');
  chk('B11c', podeImportarBoleto('emitida', 'pendente') === true,
      'pendente tambem: a linha nasceu antes da chamada e a chamada nunca terminou');
  chk('B11d', podeImportarBoleto('emitida', 'registrado') === false
       && podeImportarBoleto('emitida', 'liquidado') === false,
      'ja registrado ou ja liquidado NAO aceita - importar por cima apagaria o que existe');
  chk('B11e', podeImportarBoleto('emitida', 'baixado') === false
       && podeImportarBoleto('emitida', 'cancelado') === false,
      'baixado e cancelado tambem nao: a linha guarda o desfecho do titulo no banco');

  for (const s of ['rascunho', 'paga', 'vencida', 'cancelada', 'negociada'] as const) {
    chk('B11f', podeImportarBoleto(s, null) === false,
        `fatura em "${s}" nao recebe boleto importado - mesma precondicao de registrar()`);
  }

  // O espelho do servidor tem de valer nos DOIS sentidos: o que a tela oferece
  // para importar e o que ela oferece para gerar sao mutuamente exclusivos em
  // "registrado", e ambos exigem "emitida".
  chk('B11g', podeGerarBoleto('emitida', 'erro') === true && podeImportarBoleto('emitida', 'erro') === true,
      'com boleto em erro os DOIS caminhos ficam abertos: tentar de novo, ou trazer o do portal');
}

// ------------------------------------------- B12 a trava do botao de importar
{
  const LINHA = '75691.50043 01727.686907 00000.130013 1 15410000059669';
  const base = { linha: LINHA, ocupado: false, conferida: true };

  chk('B12', DIGITOS_DA_LINHA === 47, 'a linha de cobranca tem 47 digitos');
  chk('B12b', motivoDaTravaDaImportacao(base) === null && podeImportarAgora(base),
      'linha conferida pelo servidor e nada em voo: o botao acende');

  chk('B12c', motivoDaTravaDaImportacao({ ...base, ocupado: true }) === 'ocupado',
      'com escrita em voo o motivo e `ocupado`, e ele vem ANTES de qualquer juizo sobre o texto');
  chk('B12d', motivoDaTravaDaImportacao({ ...base, linha: '   ' }) === 'sem_linha',
      'campo vazio e `sem_linha`, e nao "linha invalida" - ausencia nao e defeito');
  chk('B12e', motivoDaTravaDaImportacao({ ...base, linha: '7569150043' }) === 'digitos_de_menos',
      'linha truncada trava sem ida ao servidor: contar digito e barato e honesto');

  // O ESTADO DO MEIO, e ele e o que impede o clique cego: a linha esta completa,
  // a conferencia foi pedida e ainda nao voltou.
  chk('B12f', motivoDaTravaDaImportacao({ ...base, conferida: null }) === 'nao_conferida',
      'linha completa e conferencia que nao voltou TRAVA - gravar sem saber e o que se evita');
  chk('B12g', motivoDaTravaDaImportacao({ ...base, conferida: false }) === 'recusada',
      'conferencia que voltou recusando trava, e o motivo e proprio');

  // A ordem importa: com tudo errado ao mesmo tempo, a pessoa resolve um por vez.
  chk('B12h', motivoDaTravaDaImportacao({ linha: '', ocupado: true, conferida: false }) === 'ocupado',
      'um motivo por vez, na ordem em que se resolve - a lista de reclamacoes que ninguem le');

  // A pontuacao impressa nao conta como digito, e nao pode inflar a contagem.
  chk('B12i', motivoDaTravaDaImportacao({ ...base, linha: LINHA.replace(/\D/g, '') }) === null,
      'os 47 digitos crus e a linha impressa com ponto e espaco valem o mesmo');
}

// ============================================================================
// B13 — CANCELAR O BOLETO NO BANCO, e o botao que nao existia
// ============================================================================
//
// ⚠️ O QUE ISTO PRENDE: a rota `POST /faturas/:id/boleto/baixar` existia desde
// sempre e NENHUMA tela a chamava - varredura de 10/09/2026. Sem ela, cancelar
// a fatura deixava no banco um titulo REGISTRADO, com linha digitavel valida na
// mao do cliente, e um pagamento que chegasse depois nao teria como virar baixa.
// Desde 10/09 o servidor RECUSA cancelar a fatura nesse estado - e a recusa so
// e cumprivel porque o botao passou a existir.
{
  chk('B13a', podeBaixarNoBanco('registrado', 'api_sicoob') === true,
      'o titulo que NOS registramos e cancelavel no banco por aqui');

  chk('B13b', podeBaixarNoBanco('registrado', 'importado') === false,
      'o IMPORTADO nao - `baixarNoBanco()` recusa por escrito: o "nosso numero" dele foi '
      + 'transcrito de um PDF, e mandar a Sicoob baixar por ele ou nao acha titulo nenhum ou acha '
      + 'o ERRADO. Baixa-se no portal onde ele nasceu');

  for (const s of ['pendente', 'erro', 'liquidado', 'baixado', 'cancelado'] as const) {
    chk('B13c', podeBaixarNoBanco(s, 'api_sicoob') === false,
        `boleto em "${s}" nao oferece o botao - ou nunca chegou ao banco, ou ja teve desfecho la`);
  }

  chk('B13d', podeBaixarNoBanco(null, null) === false,
      'e fatura sem boleto nenhum tambem nao - oferecer o cancelamento de um titulo que nao '
      + 'existe e mandar a pessoa colher um 404');

  /* A ULTIMA LIGACAO, e ela e a que faltava de verdade: a regra podia estar certa
     e nenhuma tela chamar a rota - que foi exatamente o estado do sistema por
     seis semanas. Comentario sai antes de procurar (a armadilha do `SD-12`). */
  const tela = readFileSync(new URL('../src/telas/faturas.tsx', import.meta.url), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  chk('B13e', /podeBaixarNoBanco\(/.test(tela) && /boleto\/baixar/.test(tela),
      'e a tela de emissao USA a regra e CHAMA a rota - sem esta linha, a rota volta a existir '
      + 'sem nenhum caminho de tela, que e como ela passou seis semanas');
}

// ============================================================================
// B14–B21 — EMISSÃO E COBRANÇA (30/09/2026, etapa 2 do redesenho)
// ============================================================================
//
// A critica de 30/09 mediu na tela: os rascunhos no FIM de uma tabela ordenada
// por vencimento, «PagadorSemEndereco» cru ao lado de um «Gerar boleto» que o
// servidor ia recusar de novo, a tela aberta no mes de hoje com o trabalho no
// mes da conta, e o kWh em "2545.00" ao lado de "R$ 2.062,89". O que decide
// cada uma dessas coisas mora em `emissao-regras.ts`, e e aqui que se prende.

// ------------------------------------------------ B14 a ordem do que precisa de acao
{
  const f = (id: string, status: StatusDaCobranca, vencimento: string) => ({ id, status, vencimento });
  const lista = [
    f('paga', 'paga', '2026-09-18'), f('venc', 'vencida', '2026-09-22'), f('emit', 'emitida', '2026-10-05'),
    f('semb', 'emitida', '2026-10-19'), f('rasc2', 'rascunho', '2026-10-31'), f('rasc1', 'rascunho', '2026-10-23'),
    f('canc', 'cancelada', '2026-09-01'),
  ];
  const semBoleto = new Set(['semb']);
  const ordem = [...lista].sort((a, b) =>
    chaveDaOrdemDeAcao(a, semBoleto.has(a.id)).localeCompare(chaveDaOrdemDeAcao(b, semBoleto.has(b.id)), 'pt-BR', { numeric: true }))
    .map((x) => x.id).join(',');
  chk('B14a', ordem === 'rasc1,rasc2,semb,venc,emit,paga,canc',
      `a ordem padrao e a do trabalho — rascunho, sem boleto, vencida, emitida, paga, cancelada; dentro, o vencimento (veio: ${ordem})`);
  chk('B14b', grupoDeAcao('vencida', true) === 'boleto' && grupoDeAcao('negociada', false) === 'emitida',
      'a vencida SEM boleto sobe com as sem boleto; a negociada anda com a emitida');
}

// ------------------------------------------------ B15 a recusa conhecida, traduzida
{
  chk('B15a', tipoDaRecusa('PagadorSemEndereco') === 'endereco'
          && tipoDaRecusa(null, 'PagadorSemEndereco: o banco recusa emitir sem logradouro') === 'endereco'
          && tipoDaRecusa('CobrancaNaoConfigurada') === 'sem_conexao',
      'o codigo vale pelo NOME do erro da API e pelo comeco do texto gravado em `ultimo_erro`');
  chk('B15b', tipoDaRecusa(null, 'documento do pagador invalido') === null && tipoDaRecusa('CobrancaFalhou') === null,
      'resposta do banco que nao esta na lista NAO e traduzida — inventar traducao e pior que mostrar a original');
  const r = lerRecusa({ nome: 'PagadorSemEndereco', texto: 'A UC 123 nao tem cep…', numeroUc: '000401269001287', mes: '2026-09' })!;
  chk('B15c', r.frase.startsWith('Falta o endereço do pagador') && r.saida?.rotulo === 'Completar o endereço'
          && r.saida.destino === '/unidades?uc=000401269001287&mes=2026-09' && r.original === 'A UC 123 nao tem cep…',
      '«Completar o endereço» leva a Unidades ja na unidade, com a volta; o texto cru vai para o detalhe tecnico');
  const d = lerRecusa({ nome: 'PagadorSemDocumento' })!;
  chk('B15d', d.saida?.rotulo === 'Completar o documento' && d.saida.destino === '/clientes?pendencia=sem_documento',
      'a recusa por documento tambem tem saida: Clientes, filtrada pelas que faltam');
  chk('B15e', lerRecusa({ nome: 'FaturaSemValorParaBoleto' })!.saida === null,
      'e a de valor zero nao inventa saida: nao ha campo que resolva, ha uma conta a conferir');
}

// --------------------------------------- B16 a recusa que o cadastro ja anuncia
{
  const uc = (over = {}) => ({ numero_uc: '000401269001287', endereco_logradouro: 'Rua A', endereco_bairro: 'Centro',
    endereco_municipio: 'Goiânia', endereco_uf: 'GO', endereco_cep: '74000000', ...over });
  chk('B16a', recusaPrevista(uc(), '2026-09') === null,
      'endereco completo, nada previsto');
  const p = recusaPrevista(uc({ endereco_bairro: null, endereco_cep: '' }), '2026-09')!;
  chk('B16b', p.prevista && p.tipo === 'endereco' && /bairro e CEP/.test(p.frase),
      'faltando bairro e CEP, a tela ja sabe que o banco recusa — pela MESMA funcao que o servidor usa');
  chk('B16c', recusaDaLinha({ ultimoErro: 'PagadorSemEndereco: …', uc: uc(), mes: '2026-09' }) === null,
      'a recusa por endereco SUPERADA some: o endereco foi completado depois, e mandar completar de novo seria mentira');
  chk('B16d', recusaDaLinha({ daSessao: { nome: 'PagadorSemDocumento', texto: '…' }, uc: uc(), mes: '2026-09' })?.tipo === 'documento',
      'a recusa que acabou de voltar vale antes de tudo');
}

// ------------------------------------------------------- B17 a acao de cada linha
{
  const endereco = lerRecusa({ nome: 'PagadorSemEndereco', numeroUc: '1', mes: '2026-09' });
  chk('B17a', acaoDaLinha('rascunho', undefined, null).tipo === 'emitir'
          && acaoDaLinha('emitida', { nivel: 'nao_pedido' }, null).tipo === 'pedir_boleto'
          && acaoDaLinha('emitida', { nivel: 'esperando' }, null).tipo === 'esperar',
      'rascunho emite, emitida sem boleto pede, e a que o sistema ja esta retentando nao pede clique');
  chk('B17b', acaoDaLinha('emitida', { nivel: 'insistindo' }, endereco).tipo === 'resolver'
          && acaoDaLinha('emitida', { nivel: 'esperando' }, endereco).tipo === 'resolver',
      'com recusa por endereco, a acao e a SAIDA — mesmo em «esperando»: a espera nao resolve, o endereco resolve');
  chk('B17c', acaoDaLinha('vencida', { nivel: 'parado' }, endereco).tipo === 'nenhuma'
          && acaoDaLinha('emitida', undefined, endereco).tipo === 'nenhuma'
          && acaoDaLinha('paga', undefined, null).tipo === 'nenhuma',
      'vencida nao ganha boleto (so emitida), emitida com boleto no banco nao pede nada, paga tambem nao');
  chk('B17d', notaDaSituacao('emitida', { nivel: 'nao_pedido' }, null)?.texto === 'Boleto ainda não pedido.'
          && notaDaSituacao('emitida', { nivel: 'insistindo' }, endereco)?.selo.tom === 'erro'
          && notaDaSituacao('paga', undefined, null) === null,
      'a segunda linha da situacao diz o porque curto, e cala onde o selo ja diz tudo');
}

// ------------------------------------------------ B18 o que «Pedir os N boletos» leva
{
  const lista = [
    { id: 'a', status: 'emitida' as const }, { id: 'b', status: 'emitida' as const },
    { id: 'c', status: 'emitida' as const }, { id: 'd', status: 'vencida' as const },
    { id: 'e', status: 'emitida' as const }, { id: 'f', status: 'rascunho' as const },
  ];
  const nivel: Record<string, 'nao_pedido' | 'esperando' | 'insistindo' | 'parado'> =
    { a: 'nao_pedido', b: 'insistindo', c: 'esperando', d: 'parado', e: 'nao_pedido' };
  const endereco = lerRecusa({ nome: 'PagadorSemEndereco' })!;
  const r = paraPedirBoleto(lista, (id) => (nivel[id] ? { nivel: nivel[id]! } : undefined),
    (f) => (f.id === 'e' ? endereco : null));
  chk('B18a', r.pedir.map((x) => x.id).join() === 'a,b' && r.deFora.map((x) => x.f.id).join() === 'e',
      'leva a emitida sem boleto num nivel pedivel; a com recusa conhecida fica DE FORA, nomeada; a que o sistema ja '
      + 'retenta, a vencida e o rascunho nem entram');
  chk('B18b', JSON.stringify(placarDaSerie({ a: { estado: 'feita' }, b: { estado: 'recusada', motivo: 'x', recusa: null }, c: { estado: 'na_vez' } }))
          === JSON.stringify({ total: 3, feitas: 1, recusadas: 1, faltam: 1 }),
      'o placar da serie soma: feitas + recusadas + faltam = total');
}

// ------------------------------------------------------ B19 o mes em que a tela abre
{
  const carteira = [
    { competencia: '2026-09-01', faturas: 20, emitidas: 9, liquidadas: 4 },
    { competencia: '2026-08-01', faturas: 33, emitidas: 0, liquidadas: 29 },
    { competencia: '2026-07-01', faturas: 30, emitidas: 0, liquidadas: 30 },
  ];
  const c = candidatosDoMes(carteira, [{ competencia: '2026-08-01' }]);
  chk('B19a', JSON.stringify(c) === JSON.stringify([{ mes: '2026-09', certo: false }, { mes: '2026-08', certo: true }]),
      'setembro PODE ter rascunho (nem emitida nem paga) e e conferido; agosto tem emitida sem boleto e e certo; julho '
      + `fechado nao entra (veio ${JSON.stringify(c)})`);
  chk('B19b', JSON.stringify(mesSemTrabalho('2026-06', carteira, '2026-10')) === JSON.stringify({ mes: '2026-06', origem: 'lembrado' })
          && JSON.stringify(mesSemTrabalho(null, carteira, '2026-10')) === JSON.stringify({ mes: '2026-09', origem: 'recente' })
          && JSON.stringify(mesSemTrabalho(null, [], '2026-10')) === JSON.stringify({ mes: '2026-10', origem: 'hoje' }),
      'sem trabalho: o ultimo mes escolhido, senao o mais recente com cobranca, senao o de hoje');
  const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  let guardado = '';
  const bom = { getItem: (k: string) => (k === CHAVE_DO_MES_LEMBRADO ? guardado : null), setItem: (_k: string, v: string) => { guardado = v; } };
  lembrarMes(bom, '2026-08'); lembrarMes(bom, 'lixo');
  chk('B19c', lerMesLembrado(quebrado) === null && (() => { lembrarMes(quebrado, '2026-08'); return true; })()
          && lerMesLembrado(bom) === '2026-08' && lerMesLembrado(null) === null,
      'o armazenamento do navegador que levanta nao derruba a tela, e so mes valido e guardado');
}

// ------------------ B19d a procura inteira, uma so para Cobrancas e Mes (etapa 4a)
// Ela morava dentro de `telas/faturas.tsx`; a tela Mes passou a abrir pelo MESMO
// criterio, e a procura desceu para `emissao-regras.ts` com a rede por parametro.
{
  const carteira = [
    { competencia: '2026-09-01', faturas: 20, emitidas: 9, liquidadas: 4 },
    { competencia: '2026-08-01', faturas: 33, emitidas: 0, liquidadas: 29 },
  ];
  const lidos: string[] = [];
  const a = await procurarMesComTrabalho({
    travadas: [{ competencia: '2026-08-01' }],
    carteira: async () => carteira,
    cobrancasDoMes: async (m) => { lidos.push(m); return m === '2026-09' ? [{ status: 'emitida' }] : []; },
    lembrado: null, hoje: '2026-10',
  });
  chk('B19d', a.mes === '2026-08' && a.origem === 'trabalho' && a.certo === true && lidos.join() === '2026-09',
      'setembro e LIDO (pode ter rascunho) e nao tem; agosto tem emitida sem boleto e e o mes da tela');
  const comRascunho = await procurarMesComTrabalho({
    travadas: [], carteira: async () => carteira,
    cobrancasDoMes: async () => [{ status: 'rascunho' }], lembrado: null, hoje: '2026-10',
  });
  const semRede = await procurarMesComTrabalho({
    travadas: [], carteira: async () => { throw new Error('caiu'); },
    cobrancasDoMes: async () => { throw new Error('caiu'); }, lembrado: '2026-06', hoje: '2026-10',
  });
  chk('B19e', comRascunho.mes === '2026-09' && comRascunho.origem === 'trabalho' && comRascunho.certo === false
          && semRede.mes === '2026-06' && semRede.origem === 'lembrado',
      'rascunho no mes mais recente abre nele; e leitura que falha so tira o candidato — sem rede, abre no '
      + 'mes lembrado');
}

// ------------------------------------------------ B20 kWh e decimal em portugues
{
  chk('B20a', decimalEmBr('2545.00') === '2.545,00' && decimalEmBr('1234567.891') === '1.234.567,891'
          && decimalEmBr(null) === '—' && decimalEmBr('abc') === 'abc',
      'a grandeza decimal sai em portugues, por texto — sem float, e o que nao e numero volta como veio');
  chk('B20b', kwhEmBr('2545.00') === '2.545' && kwhEmBr('2545.50') === '2.545,50' && kwhEmBr('947') === '947',
      'o kWh sem a casa decimal toda zero, como a conta da distribuidora imprime; a casa que carrega fica');
}

// ------------------------------------------- B21 a unidade pedida pelo endereco
{
  chk('B21a', destinoDoEndereco('0004.0126-9001287', '2026-09') === '/unidades?uc=000401269001287&mes=2026-09'
          && destinoDoEndereco(null, '2026-09') === '/unidades?pendencia=sem_endereco'
          && destinoDoEndereco('123', 'lixo') === '/unidades?uc=123',
      'o destino leva a unidade (so digitos) e o mes da volta; sem unidade, a lista das que nao emitem');
  chk('B21b', unidadeDaConsulta('?uc=000401269001287&mes=2026-09') === '000401269001287'
          && unidadeDaConsulta('?pendencia=sem_endereco') === null && unidadeDaConsulta('?uc=') === null,
      'e a tela de Unidades le a unidade do endereco');

  /* NENHUMA PERGUNTA DO NAVEGADOR sobrou nas telas desta etapa. Comentario sai
     antes de procurar (a armadilha do `SD-12`). */
  const semComentario = (t: string) => t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const fonte = (arq: string) => semComentario(readFileSync(new URL(`../src/${arq}`, import.meta.url), 'utf8'));
  const comPergunta = ['telas/faturas.tsx', 'telas/fatura-unificada.tsx', 'fatura-lote-corpo.tsx', 'emissao-corpo.tsx']
    .filter((a) => /\b(window\.)?(confirm|prompt)\(/.test(fonte(a)));
  chk('B21c', comPergunta.length === 0,
      'Cobranças e Contas de luz nao usam confirm() nem prompt() — toda pergunta acontece na tela '
      + `(achados: ${comPergunta.join(', ') || 'nenhum'})`);
  chk('B21d', !/emitirLote|\/faturamento\/\$\{[^}]*\}\/emitir/.test(fonte('telas/faturas.tsx'))
          && /\/faturas\/\$\{f\.id\}\/emitir/.test(fonte('telas/faturas.tsx')),
      'a emissao em serie usa a rota POR LINHA — a de lote emitiria tambem o que a pessoa tirou da revisao');
}

console.log();
if (falhas > 0) { console.log(`--- cobranca: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- cobranca (regras da tela): ${feitas} verificacoes, 0 falhas`);
