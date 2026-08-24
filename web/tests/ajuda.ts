// A CENTRAL DE AJUDA — a busca, o estado ao vivo, os caminhos e o vocabulario.
// Uso: node --experimental-strip-types web/tests/ajuda.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM
//
// A partir de 22/08/2026 entram usuarios novos e NAO HA DIVISAO DE SUPORTE. Isso
// muda o custo do erro: uma ajuda que nao acha o que a pessoa procura nao produz
// um chamado — produz alguem parado. As quatro formas de falhar sao silenciosas:
//
//   1. A BUSCA NAO ACHA A PALAVRA DA PESSOA. Quem trava digita "cade o boleto",
//      "nao consigo cobrar", "conta de luz" — e nao "conector de cobranca",
//      "relatorio de prontidao", "unidade consumidora". Uma base de sinonimos so
//      e util se alguem medir que ela casa com a palavra ERRADA, que e a que
//      sera digitada;
//
//   2. A RESPOSTA CERTA TERMINA SEM UM CLIQUE. E o bloco `A10`, e ele existe
//      por pedido do dono em 21/08: *"sempre devolver o possivel link de rota
//      para resolucao"*. Explicar onde fica uma tela e pior do que abri-la —
//      quem esta travado nao quer aprender a navegar, quer chegar;
//
//   3. O TEXTO DA AJUDA REPETE O JARGAO QUE ELA EXISTE PARA TRADUZIR. E o modo
//      de falha mais provavel deste arquivo, porque quem escreve a ajuda e quem
//      ja sabe o vocabulario: `V4` recusa codigo de regra, codigo de questao,
//      comando de terminal, "split", "camada" e nome de coluna nos textos que a
//      pessoa LE. Os `termos` de busca ficam de fora da regra de proposito — la
//      o jargao e util, porque alguem pode digita-lo;
//
//   4. O NUMERO AO VIVO DISCORDAR DA TELA DE PENDENCIAS. `passosDoEstado` le o
//      mesmo relatorio e reusa `destino-da-camada.ts`; se inventasse rota
//      propria, os dois caminhos divergiriam sem nenhum parecer errado.

import {
  normalizar, palavras, buscar, buscarTermos, topicosDaTela, topicosComuns,
  telasCitadas, responder, caminhosDaResposta,
  passosDoEstado, travamCobranca, TOPICOS, PALAVRAS_DA_TELA, type CamadaLida,
} from '../src/ajuda.ts';
import { VERBETE_DA_CAMADA, EFEITO, SITUACAO, GLOSSARIO } from '../src/vocabulario.ts';
import { DESTINO_DA_CAMADA, enderecoDoDestino } from '../src/destino-da-camada.ts';
import { CRM } from '../src/ajuda.ts';
import { TELAS } from '../src/navegacao.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/** A rota de um caminho, sem o filtro. E o que se compara com a lista de telas. */
const so = (rota: string): string => rota.split('?')[0]!;

/**
 * O CAMINHO E DE VERDADE, e desde 24/08/2026 ha DOIS jeitos de ser de verdade.
 *
 * `crm` aponta para fora deste sistema, e a rota dele e um endereco completo -
 * comparar com a lista de telas daqui diria "beco" para o unico caminho que
 * existe naquele caso. Continua sendo verificado, so que contra outra coisa: ele
 * tem de apontar para o CRM, e nao para um endereco qualquer que alguem colou.
 */
const caminhoDeVerdade = (c: { rota: string; tipo: string }) =>
  c.tipo === 'crm'
    ? c.rota.startsWith(`${CRM}/`)
    : TELAS.some((t) => t.rota === so(c.rota));


// ============================================================ A1 normalizacao
//
// O acento e a pontuacao saem porque ninguem digita "competencia" com acento
// numa busca com pressa. Se esta base falhar, TODA a busca falha junto.

chk('A1', normalizar('Competência') === 'competencia' && normalizar('NÃO') === 'nao',
    'acento sai, maiuscula sai');
chk('A1b', normalizar('cadê o boleto?') === 'cade o boleto',
    'pontuacao vira espaco e some — "boleto?" tem de casar com "boleto"');
chk('A1c', normalizar('  a   b  ') === 'a b', 'espaco repetido colapsa');

chk('A1d', palavras('o cliente nao aparece').join(',') === 'cliente,nao,aparece',
    '"o" sai por ser palavra vazia e "nao" FICA — a negacao e o que marca quem esta travado');
chk('A1e', palavras('clientes').join(',') === palavras('cliente').join(','),
    'plural e singular caem na mesma raiz');
chk('A1f', palavras('mes').join(',') === 'mes',
    'e a raiz nao corta palavra curta: "mes" nao pode virar "me"');

// ================================================== A2 a busca acha a PALAVRA DA PESSOA
//
// Cada linha aqui e uma frase que alguem vai digitar amanha. O `id` esperado e a
// resposta certa. Este bloco e o coracao da suite: se ele passar, a ajuda
// funciona para quem nao conhece o sistema.

const CASOS: Array<[consulta: string, id: string]> = [
  ['nao consigo cobrar', 'nao-consigo-cobrar'],
  ['não consigo emitir a fatura', 'nao-consigo-cobrar'],
  ['a fatura não sai', 'nao-consigo-cobrar'],
  ['o que falta', 'o-que-falta'],
  /* MUDOU EM 24/08/2026, quando a operacao assumiu o sistema. Esta frase
   * respondia `o-que-falta` - a tela certa, e a resposta errada para quem nunca
   * viu o sistema: ela diz ONDE olhar e nao COMO ler o que esta la. O
   * `primeiro-dia` leva a mesma tela e ensina a ordem de leitura. */
  ['por onde começo', 'primeiro-dia'],
  ['sicoob', 'banco'],
  ['o cliente já tem cpf mas diz que falta', 'documento-cliente'],
  ['confirmar documento', 'documento-cliente'],
  ['cnpj', 'documento-cliente'],
  ['criar contrato', 'contrato'],
  ['contrato não ativa', 'contrato'],
  ['dia de vencimento', 'vencimento'],
  ['quando vence', 'vencimento'],
  ['preço do kwh', 'tarifa'],
  ['tarifa', 'tarifa'],
  ['quem trouxe o cliente', 'comissao'],
  ['comissão', 'comissao'],
  ['dono da usina', 'dono-usina'],
  ['quanto o dono recebe', 'repasse'],
  ['o cliente pagou', 'cliente-pagou'],
  ['dar baixa', 'cliente-pagou'],
  ['o cliente não aparece', 'cliente-nao-aparece'],
  ['sumiu da lista', 'cliente-nao-aparece'],
  ['trocar de empresa', 'trocar-empresa'],
  ['fechar o mês', 'gerar-mes'],
  ['energia gerada', 'geracao'],
  ['ligar usina na unidade', 'rateio'],

  /*
   * OS ONZE DE 21/08, e eles medem os assuntos que a base NAO tinha: ela cobria
   * as pendencias do relatorio e quase nada do dia a dia de quem ja faturou.
   *
   * "cade o boleto" e "como emito boleto" MUDARAM DE RESPOSTA de proposito. Ate
   * hoje caiam em "Como configuro a emissao de boleto?" — a tela da CREDENCIAL —
   * porque nao havia outro assunto de boleto na base. Havia um buraco atras
   * disso: quem ja tinha o banco configurado e so queria o boleto de uma fatura
   * era mandado para o formulario de credencial. Agora existe o assunto certo, e
   * a tela do banco continua a um clique dentro dele.
   */
  ['cadê o boleto', 'gerar-boleto'],
  ['como emito boleto', 'gerar-boleto'],
  ['dá para cobrar por pix', 'cobrar-por-pix'],
  ['o ensaio vai cobrar alguém', 'ensaio'],
  ['o cliente ficou de fora', 'ficou-de-fora'],
  ['quanto entrou', 'quanto-entrou'],
  ['exportar para planilha', 'exportar'],
  ['quando pago o dono', 'pagar-dono'],
  ['cadastrar cliente novo', 'cadastrar-cliente'],
  ['o valor da fatura está errado', 'valor-errado'],
  ['importar boleto do banco', 'importar-boleto'],
];

for (const [consulta, esperado] of CASOS) {
  const r = buscar(consulta);
  const primeiro = r[0]?.topico.id;
  chk('A2', primeiro === esperado,
      `"${consulta}" -> ${esperado}${primeiro === esperado ? '' : ` (veio ${primeiro ?? 'NADA'})`}`);
}

chk('A2b', buscar('').length === 0 && buscar('x').length === 0,
    'busca vazia ou de uma letra nao devolve nada — a tela cai nos assuntos comuns');
chk('A2c', buscar('jabuticaba quantica').length === 0,
    'e o que nao existe devolve VAZIO em vez de um primeiro resultado qualquer: quem decide o que '
    + 'mostrar num vazio e `responder`, que tem mais contexto');

{
  /*
   * "contrato" de proposito, e nao "nao consigo cobrar": aquela e uma frase
   * exata de UM topico e desde o corte da palavra solta devolve um resultado so
   * — que e o comportamento certo, e nao serve para medir ordenacao.
   *
   * A AFIRMACAO MUDOU EM 21/08, e o motivo e uma qualidade e nao um defeito: com
   * a base dobrada, "contrato" empata em 122 com "contrato-errado", porque as
   * duas perguntas SAO sobre contrato. Exigir que o primeiro vencesse o segundo
   * por pontos passou a ser exigir que a base nao tenha dois assuntos proximos —
   * que e o contrario do que se quer. O que continua tendo de valer e o que a
   * verificacao sempre quis dizer: a lista sai ordenada por pontuacao, o topo e
   * o assunto certo, e a pontuacao de fato SEPARA (o topo vence o ultimo).
   */
  const r = buscar('contrato');
  const ordenada = r.every((x, i) => i === 0 || r[i - 1]!.pontos >= x.pontos);
  chk('A2d', r.length > 1 && ordenada && r[0]!.topico.id === 'contrato'
          && r[0]!.pontos > r[r.length - 1]!.pontos,
      `o resultado vem ORDENADO por pontuacao, e nao pela ordem da lista (${r.map((x) => `${x.topico.id}:${x.pontos}`).join(' > ')})`);
}

// ================================================ A3 o glossario responde "o que quer dizer"

chk('A3', buscarTermos('uc').some((t) => t.termo.includes('Unidade consumidora')),
    '"uc" acha a unidade consumidora');
chk('A3b', buscarTermos('conta de luz').some((t) => t.termo.includes('Unidade consumidora')),
    'e "conta de luz" tambem — e assim que se fala, mesmo nao sendo o nome certo');
chk('A3c', buscarTermos('split').some((t) => t.termo.includes('Repasse')),
    '"split" leva a repasse: quem ouviu a palavra do time tecnico tem de achar o verbete');
chk('A3d', buscarTermos('competencia').some((t) => t.termo.includes('Mês de referência')),
    '"competencia" leva a "mes de referencia" — a palavra do sistema acha a palavra de gente');
chk('A3e', buscarTermos('').length === 0, 'busca vazia nao devolve o glossario inteiro');

// A3f/A3g — O CASAMENTO PARCIAL NAO VALE NO GLOSSARIO, e os dois casos abaixo
// foram MEDIDOS contra producao antes de virarem regra.
chk('A3f', buscarTermos('o cliente pagou').length === 0,
    '"o cliente pagou" nao devolve verbete nenhum: com casamento parcial ele trazia rateio E '
    + 'originador, so porque os dois citam "cliente". Definir uma palavra e certo ou errado, e '
    + 'tres definicoes irrelevantes embaixo da resposta certa fazem a pessoa duvidar dela');
chk('A3g', buscarTermos('conta de luz').length === 1,
    'e "conta de luz" devolve UM verbete — a unidade consumidora — e nao uma lista');

// ============================ A2h a palavra solta nao e resposta
//
// MEDIDO contra producao: "conta de luz" casava com "Como configuro a emissao de
// boleto?" pela palavra "conta", que naquele topico quer dizer conta BANCARIA. O
// resultado errado e pior que resultado nenhum — ele chega sob o titulo "Isto
// responde" e a pessoa vai atras.
{
  const r = buscar('conta de luz');
  chk('A2h', r.every((x) => x.topico.id !== 'banco'),
      '"conta de luz" NAO cai no topico do boleto por causa da palavra "conta" — uma palavra solta '
      + 'de uma pergunta de tres nao e evidencia suficiente');

  chk('A2i', buscar('tarifa')[0]?.topico.id === 'tarifa',
      'e a busca de UMA palavra escapa da regra: quem digita "tarifa" deu tudo o que tinha, e '
      + 'exigir duas palavras casadas recusaria a busca mais comum de todas');

  chk('A2j', buscar('trocar de empresa')[0]?.topico.id === 'trocar-empresa',
      'duas palavras casadas bastam mesmo sem frase exata — "trocar" e "empresa" nos termos');
}

// ==================== A2k a FRASE casa por PALAVRA, e nao por pedaco de texto
//
// A regra antiga comparava a busca com o termo por `includes` cru, e isso escala
// mal: quanto mais assuntos a base tem, mais pares de palavras uma dentro da
// outra ela contem. Ao dobrar a base em 21/08 apareceu o caso "baixa" casando
// com o termo "baixar a lista" do assunto de exportar planilha — e chegando sob
// o titulo "Isto responde", que e o modo caro de errar.
{
  const r = buscar('baixa');
  chk('A2k', r[0]?.topico.id === 'cliente-pagou' && r.every((x) => x.topico.id !== 'exportar'),
      '"baixa" leva a dar baixa numa fatura, e NAO ao assunto de exportar planilha por causa de '
      + `"baixar" (veio ${r.map((x) => x.topico.id).join(' > ') || 'NADA'})`);
}

// ============================================ A4 contexto e assuntos comuns

chk('A4', topicosDaTela('/clientes').some((t) => t.id === 'documento-cliente'),
    'abrir a ajuda na aba Clientes ja sugere o documento — a duvida daquela tela');
chk('A4b', topicosDaTela('/unidades').length >= 3,
    'a aba Unidades concentra tres pendencias (usina, vencimento, tarifa) e sugere as tres');
chk('A4c', topicosDaTela('/nao-existe').length === 0,
    'tela desconhecida nao inventa sugestao — a tela cai nos comuns');
chk('A4d', topicosComuns().length >= 4 && topicosComuns().every((t) => t.comum === true),
    'ha assuntos comuns suficientes para preencher um vazio');

/*
 * A4e — TODA TELA TEM ASSUNTO PROPRIO, e esta e a linha que fecha a cobertura.
 *
 * Ate 21/08 quatro das doze abriam a ajuda sem nada sobre elas: Pendencias,
 * Fatura unificada, Contas a pagar e Relatorios. Quem travasse ali recebia as
 * perguntas comuns — que sao de OUTRAS telas — e concluia, com razao, que a
 * ajuda nao sabia onde ela estava.
 */
for (const t of TELAS) {
  chk('A4e', topicosDaTela(t.rota).length > 0,
      `${t.titulo}: tem ao menos um assunto proprio — abrir a ajuda ali fala do que a pessoa esta vendo`);
}

// ===================================== A5 toda camada tem verbete, e vice-versa
//
// Camada nova no servidor sem verbete aqui apareceria para o usuario com o nome
// da coluna do banco ("Cobranca sicoob"), que e exatamente o defeito que este
// vocabulario existe para corrigir.

const CAMADAS = Object.keys(DESTINO_DA_CAMADA);

for (const c of CAMADAS) {
  chk('A5', c in VERBETE_DA_CAMADA, `${c}: tem verbete em portugues de quem opera`);
}
chk('A5b', Object.keys(VERBETE_DA_CAMADA).every((c) => CAMADAS.includes(c)),
    'e nenhum verbete orfao — verbete de camada que nao existe mais e texto que ninguem le');

for (const [c, v] of Object.entries(VERBETE_DA_CAMADA)) {
  chk('A5c', v.titulo.trim() !== '' && v.simples.trim().length > 20 && v.consequencia.trim().length > 20,
      `${c}: tem titulo, o que falta e A CONSEQUENCIA — e a consequencia que responde "posso deixar para depois?"`);
  chk('A5d', v.titulo !== c && !v.titulo.includes('_'),
      `${c}: o titulo NAO e o nome da coluna capitalizado`);
}

chk('A5e', Object.keys(EFEITO).length === 2 && Object.keys(SITUACAO).length === 3,
    'os dois efeitos e as tres situacoes tem traducao — nenhum estado da tela sobra em ingles de banco');

/*
 * A5f — TODA PENDENCIA DO RELATORIO TEM UM ASSUNTO QUE A EXPLICA.
 *
 * Sem isto, uma linha do estado ao vivo aparece com o numero e sem passos: a
 * pessoa le "faltam 4" e nao recebe o que fazer. Era o caso do valor da comissao
 * ate 21/08 — a unica das onze sem assunto.
 */
for (const c of CAMADAS) {
  chk('A5f', TOPICOS.some((t) => t.camada === c),
      `${c}: tem um assunto que explica o que fazer, e nao so um numero`);
}

// ========================================= A6 os topicos apontam para lugar real

for (const t of TOPICOS) {
  if (t.camada !== null) {
    chk('A6', CAMADAS.includes(t.camada), `${t.id}: a camada "${t.camada}" existe`);
  }
  for (const c of t.caminhos) {
    chk('A6b', caminhoDeVerdade(c),
        `${t.id}: o caminho ${c.rota} e uma tela de verdade (ou o endereco do outro sistema)`);
    chk('A6g', c.rotulo.trim().length > 3,
        `${t.id}: o caminho "${c.rota}" tem rotulo que diz o ATO, e nao um botao mudo`);
  }
  for (const tela of t.telas) {
    chk('A6c', TELAS.some((tl) => tl.rota === tela), `${t.id}: a tela de contexto ${tela} existe`);
  }
  chk('A6d', t.passos.length > 0 && t.termos.length >= 3,
      `${t.id}: tem passos e ao menos tres jeitos de ser procurado`);

  /*
   * A6h TODA PENDENCIA DIZ POR QUE EXISTE, e esta e a verificacao que a
   * operacao pediu em 24/08/2026: *"a central de ajuda ter o porquê de cada
   * informação"*.
   *
   * Pendencia E um dado que alguem precisa digitar. Um campo obrigatorio sem
   * motivo escrito nao fica vazio - ele fica preenchido com qualquer coisa que
   * faca a tela parar de reclamar, e esse e o defeito caro: um dia de vencimento
   * inventado nao levanta erro nenhum, so cobra o cliente na data errada todo mes.
   *
   * O piso de tamanho existe porque "porque sim" cabe em `porque` e passaria.
   */
  if (t.camada !== null) {
    chk('A6h', (t.porque ?? '').trim().length > 60,
        `${t.id}: diz POR QUE este dado existe, e nao so onde se preenche`);
  }
}

/*
 * A6i NENHUM ENDERECO DE FORA QUE NAO SEJA O CRM.
 *
 * O caminho `crm` e a unica porta deste sistema para outro, e ela existe porque
 * quatro dados sao espelhados e nao se digitam aqui. Uma porta que aceitasse
 * qualquer endereco seria um lugar onde alguem cola um link e a ajuda passa a
 * mandar a operacao para fora sem ninguem rever - e o painel de ajuda e
 * exatamente onde uma pessoa nova confia no que le.
 */
{
  const externos = TOPICOS.flatMap((t) => t.caminhos.filter((c) => c.tipo === 'crm'));
  chk('A6i', externos.length > 0 && externos.every((c) => c.rota.startsWith(`${CRM}/`)),
      `os ${externos.length} caminhos que saem daqui apontam para o CRM, e so para ele`);
  chk('A6j', externos.every((c) => !/https?:\/\/[^/]*\bapp\.blackhaus\.io[^/]/.test(c.rota)),
      'e nenhum deles e o dominio nu — um link tem de cair numa tela de la, nao na porta de entrada');
}

{
  const ids = TOPICOS.map((t) => t.id);
  chk('A6e', ids.length === new Set(ids).size, 'nenhum id de topico repetido');
}

// O topico da camada REUSA o endereco do mapa, e nao escreve o proprio. Sem
// isto, o botao da ajuda e o botao da tela de Pendencias poderiam levar a
// lugares diferentes para a mesma pendencia.
for (const t of TOPICOS) {
  if (t.camada === null) continue;
  const esperado = enderecoDoDestino(DESTINO_DA_CAMADA[t.camada]!);
  if (esperado === null) continue;  // as duas sem tela: o caminho delas e `ver`, escrito a mao
  chk('A6f', t.caminhos[0]?.rota === esperado,
      `${t.id}: o primeiro caminho e O MESMO que a tela de Pendencias usa — dois mapas discordariam em silencio`);
}

// ============================================ A7 o estado ao vivo, em portugues

const camada = (p: Partial<CamadaLida>): CamadaLida =>
  ({ camada: 'vencimento', situacao: 'pendente', faltam: 3, total: 29, efeito: 'bloqueia_fatura', ...p });

{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    camada({ camada: 'rateio', situacao: 'ok' }),
    camada({ camada: 'tarifa_na_conta', situacao: 'nao_medido', faltam: 0, total: 0 }),
    camada({ camada: 'dono_da_usina', faltam: 4, total: 4, efeito: 'bloqueia_split' }),
  ]);

  chk('A7', passos.length === 3,
      'o que esta OK fica de fora — a lista e do que trava, e nao um relatorio');
  chk('A7b', passos[0]!.frase === 'CPF ou CNPJ do cliente: 11 de 29 pendentes.',
      `a frase sai pronta e em portugues (veio "${passos[0]!.frase}")`);
  chk('A7c', /ainda não dá para conferir/.test(passos[1]!.frase) && !/0 de 0/.test(passos[1]!.frase),
      '"nao medido" NAO vira "0 de 0" — seria o relatorio autorizando o que nao conferiu');
  chk('A7d', passos[0]!.caminho?.rota === enderecoDoDestino(DESTINO_DA_CAMADA.documento_do_cliente!)
          && passos[0]!.caminho?.tipo === 'resolver',
      'e cada passo carrega o MESMO endereco que a tela de Pendencias usaria, marcado como "resolver"');
  chk('A7e', passos[0]!.topico?.id === 'documento-cliente',
      'o passo acha o topico que o explica — o numero ao vivo e os passos escritos chegam juntos');

  chk('A7f', travamCobranca(passos).length === 2,
      'da para separar o que impede COBRAR do que impede dividir o dinheiro — sao perguntas diferentes');
}

{
  const um = passosDoEstado([camada({ faltam: 1 })]);
  chk('A7g', /1 de 29 pendente\./.test(um[0]!.frase),
      'singular concorda: "1 pendente", e nao "1 pendentes"');
}

chk('A7h', passosDoEstado([]).length === 0 && passosDoEstado([camada({ situacao: 'ok' })]).length === 0,
    'tudo pronto devolve lista vazia — a tela mostra a mensagem de tudo em dia');

{
  // Camada que o servidor mandou e este front nao conhece: nao pode quebrar, e
  // nao pode sumir. Cai no proprio nome, que e feio e HONESTO.
  const nova = passosDoEstado([camada({ camada: 'camada_do_futuro' })]);
  chk('A7i', nova.length === 1 && nova[0]!.titulo === 'camada_do_futuro' && nova[0]!.caminho === null,
      'camada desconhecida aparece com o nome cru em vez de sumir da lista — some seria a ajuda '
      + 'escondendo um bloqueio real');
}

/*
 * A7j — AS DUAS PENDENCIAS SEM TELA DE PREENCHIMENTO TAMBEM TERMINAM NUM CLIQUE.
 *
 * Energia gerada e valor da comissao nao tem formulario, e nao vao ter: a
 * primeira e espelhada do CRM (dar-lhe um campo aqui criaria um segundo dono do
 * mesmo numero) e a segunda e decisao versionada com dono nomeado. Ate 21/08
 * elas apareciam na lista com o numero e SEM link nenhum — verdadeiro e inutil,
 * porque a pessoa lia "faltam 4" e nao tinha nem onde ir olhar.
 *
 * O caminho delas e `ver`, e a distincao e a que impede a correcao de virar
 * mentira: leva a tela onde aquilo APARECE, com o rotulo dizendo isso.
 */
/*
 * E DESDE 24/08/2026 AS DUAS TERMINAM EM LUGARES DIFERENTES, de proposito:
 *
 *   energia gerada     -> `crm`, porque ela E digitada, so que no OUTRO sistema.
 *                         Mandar "olhar" onde da para preencher seria pedir menos
 *                         do que existe;
 *   valor da comissao  -> `ver`, porque nao ha onde preencher em sistema nenhum:
 *                         e decisao versionada com dono nomeado.
 *
 * A distincao e o que impede a correcao de virar mentira nos dois sentidos.
 */
{
  const p = passosDoEstado([camada({ camada: 'geracao_da_competencia', faltam: 2, total: 4 })])[0]!;
  chk('A7i', p.caminho?.tipo === 'crm' && p.caminho.rota.startsWith(`${CRM}/`),
      'energia gerada termina no CRM, que e onde o numero de fato entra');
}

for (const c of ['regra_de_comissao']) {
  const p = passosDoEstado([camada({ camada: c, faltam: 2, total: 4 })])[0]!;
  chk('A7j', p.caminho !== null && p.caminho.tipo === 'ver' && TELAS.some((t) => t.rota === so(p.caminho!.rota)),
      `${c}: sem tela de preencher, mas com uma tela para OLHAR — "${p.caminho?.rotulo ?? 'NENHUM'}"`);
}

// ================================= A8 o glossario define sem depender de si mesmo

for (const g of GLOSSARIO) {
  chk('A8', g.texto.trim().length > 40 && g.busca.length >= 3,
      `${g.termo}: tem explicacao e ao menos tres jeitos de ser procurado`);
  /* A8b — O VERBETE TAMBEM LEVA A ALGUM LUGAR. Definir a palavra e parar era
   * responder metade: quem descobriu o que e "fatia do cliente" quer, no ato
   * seguinte, ir onde ela se preenche. */
  chk('A8b', g.caminhos.length > 0 && g.caminhos.every((c) => TELAS.some((t) => t.rota === so(c.rota))),
      `${g.termo}: leva a uma tela de verdade, e nao termina na definicao`);
}

// ============================ A9 as telas citadas — a ultima defesa contra o beco

chk('A9', Object.keys(PALAVRAS_DA_TELA).every((r) => TELAS.some((t) => t.rota === r))
       && TELAS.every((t) => t.rota in PALAVRAS_DA_TELA),
    'as doze telas tem apelido, e nenhum apelido aponta para tela que nao existe');

{
  const casos: Array<[string, string]> = [
    ['onde ficam as usinas', '/usinas'],
    ['quero ver os donos', '/donos'],
    ['abrir contas a pagar', '/contas-a-pagar'],
    ['tela de relatorios', '/relatorios'],
    ['fatura unificada', '/documento'],
  ];
  for (const [consulta, rota] of casos) {
    const t = telasCitadas(consulta);
    chk('A9b', t[0]?.rota === rota,
        `"${consulta}" acha a tela ${rota}${t[0]?.rota === rota ? '' : ` (veio ${t[0]?.rota ?? 'NADA'})`}`);
  }
  chk('A9c', telasCitadas('jabuticaba quantica').length === 0,
      'e o que nao e nome de tela nao vira sugestao de tela — palpite ruim gasta a confianca do bom');
  chk('A9d', telasCitadas('fatura').length <= 3,
      'no maximo tres: uma lista de doze telas e um menu, e a pessoa ja tem um na barra');
}

// ============ A10 A PROMESSA: NENHUMA PERGUNTA TERMINA SEM UMA TELA CLICAVEL
//
// O pedido do dono, de 21/08: *"que esteja preparado para receber todo tipo de
// pergunta e sempre devolver o possivel link de rota para resolucao"*.
//
// O banco abaixo e deliberadamente selvagem: tem pergunta bem formulada, pergunta
// pela metade, palavra solta, jargao, giria, erro de digitacao e frase que nao
// tem nada a ver com o sistema. Todas TEM de sair daqui com pelo menos um
// caminho — nem que seja o assunto do primeiro dia.

const SELVAGENS = [
  'nao consigo cobrar', 'cade o boleto', 'como faturo', 'o cliente pagou',
  'quero ver as usinas', 'cadastrar dono', 'pix', 'boleto', 'planilha',
  'quanto entrou este mes', 'quem indicou o cliente', 'o sistema travou',
  'apareceu erro vermelho', 'me desconectou', 'trocar empresa', 'endereco',
  'preciso de ajuda', 'socorro', 'nao sei o que fazer', 'como comeco',
  'jabuticaba quantica', 'asdfgh', 'xxxxx', 'o que e isso', 'como funciona',
  'meu chefe pediu o relatorio', 'a conta de luz do cliente', 'kwh',
  'quero cancelar', 'imprimir', 'mandar por email', 'segunda via do boleto',
  'valor errado na fatura', 'ensaio', 'compor', 'dar baixa', 'contas a pagar',
  'despesa', 'logotipo', 'cnpj da empresa', 'esqueci', 'nao entendi',
  'onde clico', 'nao acho o cliente', 'sumiu tudo', 'esta lento',
];

for (const consulta of SELVAGENS) {
  const r = responder(consulta);
  const cs = caminhosDaResposta(r);
  chk('A10', cs.length > 0 && cs.every(caminhoDeVerdade),
      `"${consulta}" termina em ${cs.length} caminho(s) de verdade — e nunca num beco`);
}

chk('A10b', responder('jabuticaba quantica').palpite === true,
    'e quando e palpite a resposta ADMITE isso, para a tela poder escrever "nao achei" antes de sugerir');
chk('A10c', responder('nao consigo cobrar').palpite === false,
    'enquanto o acerto de verdade nao vem marcado como palpite');

{
  const r = responder('onde ficam as usinas');
  chk('A10d', r.palpite && r.telas[0]?.rota === '/usinas',
      'a pergunta que so procura uma TELA nao casa assunto nenhum e mesmo assim chega la — era o '
      + 'buraco que a terceira defesa fecha');
}

{
  const r = responder('rateio');
  chk('A10e', caminhosDaResposta(r).length > 0 && r.termos.length + r.achados.length > 0,
      'e quem so quer entender uma palavra recebe a definicao E o endereco dela');
}

chk('A10f', TOPICOS.every((t) => t.caminhos.length > 0),
    'nenhum assunto da base termina sem caminho — e a invariante de onde tudo isto depende');

{
  const repetido = TOPICOS.find((t) => new Set(t.caminhos.map((c) => c.rota)).size !== t.caminhos.length);
  chk('A10g', repetido === undefined,
      `nenhum assunto oferece a mesma tela duas vezes${repetido ? ` — ${repetido.id}` : ''}`);
}

// ======================================== V4 O TEXTO QUE A PESSOA LE NAO TEM JARGAO
//
// Este e o bloco que guarda o pedido de 21/08: "vocabulario simples em PT-BR".
// Ele mede o que e facil prometer e dificil manter, porque quem escreve a ajuda e
// quem ja sabe o vocabulario — a frase tecnica sai sem doer.
//
// O QUE FICA DE FORA DA REGRA, e de proposito: os `termos` de busca e o `busca`
// do glossario. La o jargao e UTIL — alguem que ouviu "split" numa reuniao vai
// digitar "split", e o verbete tem de aparecer. A regra vale para o que a tela
// EXIBE — e os ROTULOS DOS CAMINHOS entraram nessa conta em 21/08, porque um
// botao e texto exibido como qualquer outro.

const PROIBIDO: Array<[RegExp, string]> = [
  [/\bR\d{1,2}\b/, 'codigo de regra (R9, R25) — nao significa nada para quem opera'],
  [/\bQ-[A-Z]/, 'codigo de questao (Q-PAGADOR-01) — e rastreio interno'],
  [/npm run/, 'comando de terminal — usuario novo nao roda comando'],
  [/\bsplit\b/i, 'a GLOSSARIO.md proibe usar "split" sozinho: colide com o split payment tributario'],
  [/\bprontid[aã]o\b/i, 'o nome interno do calculo; na tela a palavra e "Pendencias"'],
  [/\bcamadas?\b/i, 'nome da estrutura interna do relatorio'],
  [/\btiers?\b/i, 'jargao de comissionamento'],
  [/\bUC\b/, 'sigla — a tela diz "unidade" ou "unidade consumidora"'],
  [/[a-z]+_[a-z]+/, 'nome de coluna em snake_case'],
  [/\(\)/, 'nome de funcao'],
];

/** So o que a tela EXIBE. Os campos de busca ficam fora — ver o cabecalho. */
const EXIBIDO: Array<[onde: string, texto: string]> = [
  ...Object.entries(VERBETE_DA_CAMADA).flatMap(([c, v]) =>
    [[`verbete ${c}.titulo`, v.titulo], [`verbete ${c}.simples`, v.simples],
     [`verbete ${c}.consequencia`, v.consequencia]] as Array<[string, string]>),
  ...Object.entries(EFEITO).flatMap(([k, e]) =>
    [[`efeito ${k}.curto`, e.curto], [`efeito ${k}.longo`, e.longo]] as Array<[string, string]>),
  ...Object.entries(SITUACAO).flatMap(([k, s]) =>
    [[`situacao ${k}.curto`, s.curto], [`situacao ${k}.longo`, s.longo]] as Array<[string, string]>),
  ...TOPICOS.flatMap((t) =>
    [[`topico ${t.id}.pergunta`, t.pergunta], [`topico ${t.id}.resposta`, t.resposta],
     ...(t.porque ? [[`topico ${t.id}.porque`, t.porque] as [string, string]] : []),
     ...t.passos.map((p, i) => [`topico ${t.id}.passo[${i}]`, p] as [string, string]),
     ...t.caminhos.map((c) => [`topico ${t.id}.caminho[${c.rota}]`, c.rotulo] as [string, string]),
    ] as Array<[string, string]>),
  ...GLOSSARIO.flatMap((g) =>
    g.caminhos.map((c) => [`verbete ${g.termo}.caminho[${c.rota}]`, c.rotulo] as [string, string])),
];

for (const [regra, porque] of PROIBIDO) {
  const culpados = EXIBIDO.filter(([, texto]) => regra.test(texto));
  chk('V4', culpados.length === 0,
      `nenhum texto exibido casa com ${regra} (${porque})`
      + (culpados.length ? ` — ACHADO em: ${culpados.map(([o]) => o).join(', ')}` : ''));
}

// O glossario e a EXCECAO declarada: ele existe para ensinar as palavras que a
// regra acima bane, entao "UC" e "split" aparecem la de proposito. O que ele nao
// pode e explicar jargao COM jargao.
for (const g of GLOSSARIO) {
  chk('V4b', !/\bR\d{1,2}\b|npm run|\bQ-[A-Z]/.test(g.texto),
      `${g.termo}: a explicacao nao usa codigo de regra nem comando de terminal`);
}

console.log();
if (falhas > 0) { console.log(`--- ajuda: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- ajuda (busca, caminhos, estado ao vivo e vocabulario): ${feitas} verificacoes, 0 falhas`);
