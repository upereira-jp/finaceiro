// A CENTRAL DE AJUDA — a busca, o estado ao vivo e o vocabulario, verificados.
// Uso: node --experimental-strip-types web/tests/ajuda.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM
//
// A partir de 22/08/2026 entram usuarios novos e NAO HA DIVISAO DE SUPORTE. Isso
// muda o custo do erro: uma ajuda que nao acha o que a pessoa procura nao produz
// um chamado — produz alguem parado. As tres formas de falhar sao silenciosas:
//
//   1. A BUSCA NAO ACHA A PALAVRA DA PESSOA. Quem trava digita "cade o boleto",
//      "nao consigo cobrar", "conta de luz" — e nao "conector de cobranca",
//      "prontidao", "unidade consumidora". Uma base de sinonimos so e util se
//      alguem medir que ela casa com a palavra ERRADA, que e a que sera digitada;
//
//   2. O TEXTO DA AJUDA REPETE O JARGAO QUE ELA EXISTE PARA TRADUZIR. E o modo
//      de falha mais provavel deste arquivo, porque quem escreve a ajuda e quem
//      ja sabe o vocabulario: `V4` recusa `R9`, `Q-XXX`, `npm run`, `split`,
//      `camada`, `prontidao` e nome de coluna em snake_case nos textos que a
//      pessoa LE. Os `termos` de busca ficam de fora da regra de proposito —
//      la o jargao e util, porque alguem pode digita-lo;
//
//   3. O NUMERO AO VIVO DISCORDAR DA TELA DE PENDENCIAS. `passosDoEstado` le a
//      mesma prontidao e reusa `destino-da-camada.ts`; se inventasse rota
//      propria, os dois caminhos divergiriam sem nenhum parecer errado.
//
// A cobertura camada <-> verbete e o que impede uma camada nova aparecer para o
// usuario com o nome da coluna do banco.

import {
  normalizar, palavras, buscar, buscarTermos, topicosDaTela, topicosComuns,
  passosDoEstado, travamCobranca, TOPICOS, type CamadaLida,
} from '../src/ajuda.ts';
import { VERBETE_DA_CAMADA, EFEITO, SITUACAO, GLOSSARIO } from '../src/vocabulario.ts';
import { DESTINO_DA_CAMADA, enderecoDoDestino } from '../src/destino-da-camada.ts';
import { TELAS } from '../src/navegacao.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

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
  ['por onde começo', 'o-que-falta'],
  ['cadê o boleto', 'banco'],
  ['como emito boleto', 'banco'],
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
    + 'mostrar num vazio e a tela, que sabe a aba aberta');

{
  // "contrato" de proposito, e nao "nao consigo cobrar": aquela e uma frase
  // exata de UM topico e desde o corte da palavra solta devolve um resultado so
  // — que e o comportamento certo, e nao serve para medir ordenacao.
  const r = buscar('contrato');
  chk('A2d', r.length > 1 && r[0]!.pontos > r[1]!.pontos && r[0]!.topico.id === 'contrato',
      `o resultado vem ORDENADO por pontuacao, e nao pela ordem da lista (${r.map((x) => x.topico.id).join(' > ')})`);
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

// ================================================== A4 contexto e assuntos comuns

chk('A4', topicosDaTela('/clientes').some((t) => t.id === 'documento-cliente'),
    'abrir a ajuda na aba Clientes ja sugere o documento — a duvida daquela tela');
chk('A4b', topicosDaTela('/unidades').length >= 3,
    'a aba Unidades concentra tres pendencias (usina, vencimento, tarifa) e sugere as tres');
chk('A4c', topicosDaTela('/nao-existe').length === 0,
    'tela desconhecida nao inventa sugestao — a tela cai nos comuns');
chk('A4d', topicosComuns().length >= 4 && topicosComuns().every((t) => t.comum === true),
    'ha assuntos comuns suficientes para preencher um vazio');

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

// ========================================= A6 os topicos apontam para lugar real

for (const t of TOPICOS) {
  if (t.camada !== null) {
    chk('A6', CAMADAS.includes(t.camada), `${t.id}: a camada "${t.camada}" existe`);
  }
  if (t.destino !== null) {
    const rota = t.destino.split('?')[0]!;
    chk('A6b', TELAS.some((tl) => tl.rota === rota), `${t.id}: o destino ${rota} e uma tela de verdade`);
  }
  for (const tela of t.telas) {
    chk('A6c', TELAS.some((tl) => tl.rota === tela), `${t.id}: a tela de contexto ${tela} existe`);
  }
  chk('A6d', t.passos.length > 0 && t.termos.length >= 3,
      `${t.id}: tem passos e ao menos tres jeitos de ser procurado`);
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
  chk('A6f', t.destino === enderecoDoDestino(DESTINO_DA_CAMADA[t.camada]!),
      `${t.id}: o destino e O MESMO que a tela de Pendencias usa — dois mapas discordariam em silencio`);
}

// ============================================ A7 o estado ao vivo, em portugues

const camada = (p: Partial<CamadaLida>): CamadaLida =>
  ({ camada: 'vencimento', situacao: 'pendente', faltam: 3, total: 29, efeito: 'bloqueia_fatura', ...p });

{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    camada({ camada: 'rateio', situacao: 'ok' }),
    camada({ camada: 'tarifa_da_uc', situacao: 'nao_medido', faltam: 0, total: 0 }),
    camada({ camada: 'dono_da_usina', faltam: 4, total: 4, efeito: 'bloqueia_split' }),
  ]);

  chk('A7', passos.length === 3,
      'o que esta OK fica de fora — a lista e do que trava, e nao um relatorio');
  chk('A7b', passos[0]!.frase === 'CPF ou CNPJ do cliente: 11 de 29 pendentes.',
      `a frase sai pronta e em portugues (veio "${passos[0]!.frase}")`);
  chk('A7c', /ainda não dá para conferir/.test(passos[1]!.frase) && !/0 de 0/.test(passos[1]!.frase),
      '"nao medido" NAO vira "0 de 0" — seria o relatorio autorizando o que nao conferiu');
  chk('A7d', passos[0]!.destino === enderecoDoDestino(DESTINO_DA_CAMADA.documento_do_cliente!),
      'e cada passo carrega o MESMO endereco que a tela de Pendencias usaria');
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
  chk('A7i', nova.length === 1 && nova[0]!.titulo === 'camada_do_futuro' && nova[0]!.destino === null,
      'camada desconhecida aparece com o nome cru em vez de sumir da lista — some seria a ajuda '
      + 'escondendo um bloqueio real');
}

// ================================= A8 o glossario define sem depender de si mesmo

for (const g of GLOSSARIO) {
  chk('A8', g.texto.trim().length > 40 && g.busca.length >= 3,
      `${g.termo}: tem explicacao e ao menos tres jeitos de ser procurado`);
}

// ======================================== V4 O TEXTO QUE A PESSOA LE NAO TEM JARGAO
//
// Este e o bloco que guarda o pedido de 21/08: "vocabulario simples em PT-BR".
// Ele mede o que e facil prometer e dificil manter, porque quem escreve a ajuda e
// quem ja sabe o vocabulario — a frase tecnica sai sem doer.
//
// O QUE FICA DE FORA DA REGRA, e de proposito: os `termos` de busca e o `busca`
// do glossario. La o jargao e UTIL — alguem que ouviu "split" numa reunion vai
// digitar "split", e o verbete tem de aparecer. A regra vale para o que a tela
// EXIBE.

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
     ...t.passos.map((p, i) => [`topico ${t.id}.passo[${i}]`, p] as [string, string])] as Array<[string, string]>),
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
console.log(`--- ajuda (busca, estado ao vivo e vocabulario): ${feitas} verificacoes, 0 falhas`);
