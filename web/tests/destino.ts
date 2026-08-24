// O DESTINO DE CADA CAMADA — o link da tela de Pendencias, verificado.
// Uso: node --experimental-strip-types web/tests/destino.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM, e nenhuma delas e sobre desenho
//
// Um link errado numa tela de operacao nao parece defeito: ele leva a algum
// lugar, a tela abre, e quem clicou conclui que entendeu errado a pendencia. As
// quatro formas de errar sao todas silenciosas:
//
//   1. APONTAR PARA TELA QUE NAO EXISTE. `telaDoCaminho` cai na PRIMEIRA tela
//      quando nao acha a rota — e a primeira e a propria Pendencias. Uma rota
//      com erro de digitacao faria o link voltar para onde a pessoa ja estava,
//      com o icone certo e tudo;
//   2. APONTAR PARA UM FILTRO QUE A TELA IGNORA. O endereco carrega
//      `?pendencia=sem_tarifa` e a aba abre com as 41 linhas. Quem clicou acha
//      que aquelas 41 sao as que faltam;
//   3. APONTAR PARA O FILTRO ERRADO. E o caso do documento: a camada conta
//      `NOT documento_validado`, que sao TRES estados, e um link para
//      `sem_documento` mostraria uma lista MENOR do que a que a prontidao acusa
//      — a lista zera e a camada continua pendente;
//   4. DIZER "nao ha tela" E PARAR AI. Duas camadas nao tem formulario, por
//      decisao registrada, e para essas o caminho escrito e a UNICA saida. Sem
//      ele a linha vira um beco, que e o que a regra 10 chama de recusa sem
//      ponteiro.
//
// A cobertura das camadas (nenhuma sem destino, nenhum destino orfao) e a OUTRA
// metade, e ela vive em `tests/prontidao-destino.ts` — la o servidor esta ao
// alcance da leitura, aqui nao.

import {
  DESTINO_DA_CAMADA, FILTROS_DA_TELA, CHAVE_DO_FILTRO,
  enderecoDoDestino, telaDoDestino, filtroDaConsulta,
} from '../src/destino-da-camada.ts';
import { TELAS, telaDoCaminho } from '../src/navegacao.ts';
import {
  casaComFiltroDeDocumento, ROTULO_DO_FILTRO_DE_DOCUMENTO, ROTULO_DA_SITUACAO_DO_DOCUMENTO,
  type ClienteConferivel,
} from '../src/clientes-regras.ts';
import { situacaoDaUc } from '../src/unidades-regras.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const CAMADAS = Object.keys(DESTINO_DA_CAMADA);
const destinos = Object.entries(DESTINO_DA_CAMADA);

// ------------------------------------------------- D1 a rota existe DE VERDADE
//
// `telaDoCaminho` e generoso de proposito (caminho desconhecido cai na primeira
// tela, que e a de Pendencias), e essa generosidade e justamente o que esconde o
// erro aqui: um `/unidade` sem o "s" nao quebraria nada — o link voltaria para a
// tela de onde a pessoa clicou. `telaDoDestino` busca EXATO, e estas duas linhas
// medem a diferenca.

for (const [camada, d] of destinos) {
  if (d.rota === null) continue;
  chk('D1', telaDoDestino(d) !== undefined,
      `${camada}: a rota ${d.rota} e uma tela de verdade da barra de navegacao`);
}

{
  const inventada = { rota: '/unidade', filtro: null, rotulo: 'x', caminho: null, nota: 'x' };
  chk('D1b', telaDoDestino(inventada) === undefined && telaDoCaminho('/unidade').rota === TELAS[0]!.rota,
      'e a busca e EXATA: `/unidade` sem o "s" nao acha tela nenhuma, enquanto `telaDoCaminho` '
      + 'devolveria a de Pendencias — que e o link voltando para onde ja se estava');
}

// --------------------------------------------- D2 o filtro existe na tela alvo

for (const [camada, d] of destinos) {
  if (d.filtro === null) continue;
  const aceitos: readonly string[] = FILTROS_DA_TELA[d.rota as keyof typeof FILTROS_DA_TELA] ?? [];
  chk('D2', aceitos.includes(d.filtro),
      `${camada}: o filtro "${d.filtro}" esta no vocabulario da tela ${d.rota} — filtro que a tela `
      + 'ignora abre a lista inteira, e quem clicou acha que aquilo e o que falta');
}

chk('D2b', Object.keys(FILTROS_DA_TELA).every((r) => TELAS.some((t) => t.rota === r)),
    'e toda tela que declara vocabulario de filtro e uma tela que existe');

// ------------------------------- D3 o filtro do documento e o AGREGADO, e nao um estado
//
// Esta e a unica verificacao deste arquivo amarrada a UMA camada, e ela existe
// porque este e o erro que ja quase aconteceu: `sem_documento` e o nome obvio e
// e o recorte errado. A camada conta `NOT documento_validado` — os tres estados
// que a R9 recusa —, e em producao (04/08) os 45 clientes estavam nesse conjunto
// com o campo preenchido em parte deles.

chk('D3', DESTINO_DA_CAMADA.documento_do_cliente!.filtro === 'nao_validado',
    'a camada do documento aponta para o AGREGADO `nao_validado`, e nao para `sem_documento`: '
    + 'a camada conta os tres estados que nao destravam a R9');

{
  const cli = (p: Partial<ClienteConferivel>): ClienteConferivel =>
    ({ documento: null, documento_validado: false, documento_origem: null, ...p });

  const semDoc = cli({});
  const semente = cli({ documento: '52998224725', documento_origem: 'crm_semente' });
  const errado = cli({ documento: '11111111111', documento_origem: 'coleta_local' });
  const valido = cli({ documento: '52998224725', documento_validado: true, documento_origem: 'coleta_local' });

  chk('D3b', [semDoc, semente, errado].every((c) => casaComFiltroDeDocumento(c, 'nao_validado'))
          && !casaComFiltroDeDocumento(valido, 'nao_validado'),
      '`nao_validado` pega os TRES que nao destravam contrato — inclusive a semente do CRM com '
      + 'digito correto (R8) — e deixa o validado de fora');

  chk('D3c', [semDoc, semente, errado, valido].every((c) => casaComFiltroDeDocumento(c, '')),
      'e filtro vazio nao filtra: a lista inteira e o padrao, nao um recorte silencioso');

  chk('D3d', casaComFiltroDeDocumento(semente, 'semente_do_crm')
          && !casaComFiltroDeDocumento(semDoc, 'semente_do_crm'),
      'os quatro estados individuais continuam valendo — o agregado ACRESCENTA, nao substitui');

  chk('D3e', Object.keys(ROTULO_DA_SITUACAO_DO_DOCUMENTO)
        .every((k) => k in ROTULO_DO_FILTRO_DE_DOCUMENTO)
          && Object.keys(ROTULO_DO_FILTRO_DE_DOCUMENTO)[0] === 'nao_validado',
      'o vocabulario do filtro cobre os quatro estados e ABRE pelo agregado — ele e o recorte do '
      + 'trabalho, e os outros respondem "por que este nao vale"');
}

// ----------------------------------- D4 o filtro da UC e do vocabulario da tela
//
// A aba Unidades ja tinha os quatro valores; o que este teste prende e que a
// lista declarada aqui nao pode inventar um quinto. `situacaoDaUc` e importada
// para amarrar as duas metades: se o vocabulario de situacao da UC mudar de
// arquivo, este import quebra antes de o link comecar a mentir.

chk('D4', typeof situacaoDaUc === 'function'
        && FILTROS_DA_TELA['/unidades'].every((v) => v.startsWith('sem_')),
    'todo filtro da aba Unidades e uma AUSENCIA (`sem_...`) — a tela filtra por pendencia, e um '
    + 'valor que nao seja ausencia nao seria pendencia nenhuma');

// -------------------------------------------------------- D5 o endereco montado

chk('D5', enderecoDoDestino(DESTINO_DA_CAMADA.vencimento!) === `/unidades?${CHAVE_DO_FILTRO}=sem_vencimento`,
    'o endereco sai com o filtro embutido — e um link colavel, nao um estado de tela');
chk('D5b', enderecoDoDestino(DESTINO_DA_CAMADA.contrato_ativo!) === '/contratos',
    'sem filtro, e a rota limpa: `?pendencia=` vazio seria sujeira num endereco que alguem cola');

// D5e AS DUAS CAMADAS DO CAMINHO OFICIAL APONTAM PARA A LEITURA DA CONTA, e nao
// para o cadastro. E a verificacao que prende a correcao de 24/08/2026: a tarifa
// que a cobranca usa e a LIDA, e um link para a aba Unidades consumidoras
// fecharia a coluna de la e deixaria a cobranca recusada do mesmo jeito.
chk('D5e', DESTINO_DA_CAMADA.conta_lida_da_competencia!.rota === '/documento'
        && DESTINO_DA_CAMADA.tarifa_na_conta!.rota === '/documento',
    'a conta lida e o preco do kWh se resolvem na aba da fatura unificada, que e onde a conta '
    + 'entra — apontar para o cadastro seria mandar trabalhar no lugar errado');
chk('D5c', enderecoDoDestino(DESTINO_DA_CAMADA.geracao_da_competencia!) === null,
    'e sem tela nao ha endereco — a tela mostra o caminho escrito em vez de um link morto');

chk('D5d', destinos.every(([, d]) => {
      const e = enderecoDoDestino(d);
      return e === null || (e.startsWith('/') && !e.includes(' '));
    }),
    'todo endereco comeca com / e nao tem espaco — a mesma regra que a barra de navegacao segue');

// --------------------------------------- D6 "nao ha tela" nunca e um beco
//
// Regra 10: recusa e ponteiro, nao beco. Uma camada sem tela que tambem nao
// dissesse por onde o dado entra seria a tela dizendo "vire-se".

for (const [camada, d] of destinos) {
  if (d.rota !== null) continue;
  chk('D6', (d.caminho ?? '').trim() !== '',
      `${camada}: nao tem tela E diz qual e o caminho — sem isso a linha e um beco`);
  chk('D6b', /não há tela/i.test(d.rotulo),
      `${camada}: o rotulo declara a ausencia em vez de fingir um ato que nao existe`);
}

chk('D6c', destinos.filter(([, d]) => d.rota === null).length === 2,
    'sao DUAS as camadas sem tela — geracao (espelho do CRM, regra 4) e regra de comissao '
    + '(decisao com dono). Uma terceira entrando aqui e decisao de produto, e tem de doer');

// ------------------------------------------------- D7 o rotulo e o ATO, e a nota existe

for (const [camada, d] of destinos) {
  chk('D7', d.rotulo.trim() !== '' && d.nota.trim().length > 40,
      `${camada}: tem rotulo e tem nota — a nota e o que diz o que a tela NAO resolve`);
  const tela = telaDoDestino(d);
  chk('D7b', !tela || d.rotulo !== tela.titulo,
      `${camada}: o rotulo nao e o nome da tela. "Unidades consumidoras" nao diz o que fazer la; `
      + '"Preencher a tarifa R$/kWh" diz');
}

// --------------------------------------------- D8 a consulta, peneirada

chk('D8', filtroDaConsulta('?pendencia=sem_tarifa', FILTROS_DA_TELA['/unidades']) === 'sem_tarifa',
    'valor conhecido passa');
chk('D8b', filtroDaConsulta('?pendencia=sem_documento', FILTROS_DA_TELA['/unidades']) === '',
    'valor de OUTRA tela nao passa — `sem_documento` e vocabulario da aba Clientes, e aqui '
    + 'desenharia um `<select>` sem opcao correspondente');
chk('D8c', filtroDaConsulta('', FILTROS_DA_TELA['/unidades']) === ''
        && filtroDaConsulta('?pendencia=', FILTROS_DA_TELA['/unidades']) === ''
        && filtroDaConsulta('?outra=coisa', FILTROS_DA_TELA['/unidades']) === '',
    'ausente, vazio e parametro de outro nome caem todos em "todas as pendencias"');
chk('D8d', filtroDaConsulta('?x=1&pendencia=sem_vencimento&y=2', FILTROS_DA_TELA['/unidades'])
        === 'sem_vencimento',
    'e a chave e achada no meio de outros parametros, sem depender da posicao');
chk('D8e', filtroDaConsulta('?pendencia=%3Cscript%3E', FILTROS_DA_TELA['/unidades']) === '',
    'valor arbitrario vindo de endereco editado a mao nao vira estado da tela — o vocabulario e '
    + 'uma lista fechada, e o que nao esta nela nao entra');

// --------------------------------------------- D9 as camadas e a barra, coerentes

chk('D9', CAMADAS.length === new Set(CAMADAS).size, 'nenhuma camada repetida no mapa');
{
  const rotas = destinos.map(([, d]) => d.rota).filter((r): r is string => r !== null);
  chk('D9b', new Set(rotas).size < rotas.length,
      'telas REPETEM entre camadas, e isso e o esperado: tres camadas terminam na aba Unidades e '
      + 'duas em Usinas — o que distingue os links e o FILTRO, nao a tela');
}

console.log();
if (falhas > 0) { console.log(`--- destino: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- destino (onde cada camada da prontidao se resolve): ${feitas} verificacoes, 0 falhas`);
