// OS CASOS DO TESTE DE RENDERIZACAO. Roda por `web/tests/render.ts`, que
// compila este arquivo com esbuild — nao rode este direto.
//
// ============================================================================
// O QUE UM TESTE DE RENDERIZACAO PEGA QUE OS OUTROS NAO
//
// `web/tests/ajuda.ts` prova que a BUSCA acha, que toda resposta carrega um
// caminho e que o vocabulario nao tem jargao. Nada ali toca em React, e por isso
// nada ali percebe:
//
//   1. QUE O COMPONENTE NAO MONTA. Nome de icone que nao existe na uniao,
//      `passo.caminho` usado sem guarda, `.map` sobre `undefined` — tudo isso
//      passa no `tsc` de tipos frouxos e explode na primeira abertura. Este
//      arquivo monta o painel de verdade: se ele lancar, o teste falha;
//   2. QUE O TEXTO NAO CHEGA NA TELA. A frase pode estar certa em `ajuda.ts` e
//      nao ser desenhada — um `&&` mal colocado esconde a secao inteira sem
//      erro nenhum. Vale em dobro para os CAMINHOS: a promessa de que toda
//      resposta acaba num clique se perde exatamente assim;
//   3. QUE O ESTADO VAZIO E UM BECO. A pessoa que busca "jabuticaba" TEM de
//      receber alguma coisa, e a unica forma de provar isso e olhar o HTML;
//   4. QUE O BOTAO NAO LEVA A LUGAR NENHUM. Um `<button>` sem destino, ou uma
//      pendencia sem tela desenhando "Resolver", manda alguem clicar no vazio.
//
// COMO ELE RODA SEM NAVEGADOR: `renderToStaticMarkup` devolve o HTML do
// primeiro render. Efeito nao roda — e nao precisa: `ajuda-corpo.tsx` foi
// separado justamente para receber TUDO por propriedade, entao qualquer estado
// (carregando, falhou, vazio, cheio, buscando) e montavel sem rede e sem tempo.
// O `ajuda-gatilho.tsx` nasceu ja assim, pelo mesmo motivo.

import { renderToStaticMarkup } from 'react-dom/server';
import { CorpoDaAjuda } from '../src/ajuda-corpo.tsx';
import { CorpoDaSaude } from '../src/saude-corpo.tsx';
import { CorpoDoRoteiro } from '../src/roteiro-corpo.tsx';
import { FaixasDasAutomacoes, PainelDasAutomacoes } from '../src/automacoes-corpo.tsx';
import { FaixaDaEmissao, PainelDaEmissao } from '../src/emissao-travada-corpo.tsx';
import { PainelDoVinculo } from '../src/vinculo-do-crm-corpo.tsx';
import type { VinculoNaTela } from '../src/vinculo-do-crm.ts';
import type { LinhaNaTela, NivelDaEmissao, EmissaoTravadaNaTela } from '../src/emissao-travada.ts';
import type { NivelDaRodada, ChaveDaAutomacao, RodadaNaTela } from '../src/automacoes.ts';
import type { NivelDoAviso } from '../src/saude-do-dinheiro.ts';
import type { EstadoDoCertificado } from '../src/cobranca-regras.ts';
import { GatilhoDeAjuda } from '../src/ajuda-gatilho.tsx';
import { passosDoEstado, type CamadaLida } from '../src/ajuda.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/** Monta o painel e devolve o HTML. Se o componente lancar, o teste morre aqui —
 *  que e o resultado certo: painel que nao monta e painel que nao existe. */
const desenhar = (p: Partial<CorpoDaAjuda> = {}): string =>
  renderToStaticMarkup(
    <CorpoDaAjuda
      rota={p.rota ?? '/clientes'}
      passos={p.passos ?? []}
      carregando={p.carregando ?? false}
      falhou={p.falhou ?? false}
      aoFechar={() => {}}
      ir={() => {}}
      consultaInicial={p.consultaInicial}
      tudoInicial={p.tudoInicial}
    />,
  );

/** Monta o gatilho — o botao do canto e o balao de primeira visita. */
const desenharGatilho = (p: Partial<GatilhoDeAjuda> = {}): string =>
  renderToStaticMarkup(
    <GatilhoDeAjuda
      aberta={p.aberta ?? false}
      aviso={p.aviso ?? false}
      aoAbrir={() => {}}
      aoFecharAviso={() => {}}
    />,
  );

/** Texto visivel: sem marcacao e sem entidade, do jeito que a pessoa le. Sem
 *  isto, procurar "11 de 29" falharia por causa de um `<span>` no meio. */
const texto = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * O TEXTO DE UMA SECAO SO, achada pelo titulo.
 *
 * Existe porque procurar no HTML inteiro nao distingue "o assunto aparece no
 * CONTEXTO desta tela" de "o assunto aparece nas perguntas comuns, como em toda
 * tela" — e a primeira versao do R7c caiu exatamente nisso, acusando um defeito
 * que nao havia.
 */
const secao = (html: string, titulo: string): string => {
  const partes = html.split('<section class="ajuda-secao">');
  const alvo = partes.find((x) => texto(x).startsWith(titulo));
  return alvo === undefined ? '' : texto(alvo);
};

/** Quantos botoes de "ir para uma tela" o HTML desenhou. E a medida direta da
 *  promessa: resposta com zero e resposta que termina num beco. */
const botoesDeCaminho = (html: string): number => (html.match(/class="ajuda-ir/g) ?? []).length;

const camada = (p: Partial<CamadaLida>): CamadaLida =>
  ({ camada: 'vencimento', situacao: 'pendente', faltam: 3, total: 29, efeito: 'bloqueia_fatura', ...p });

// ================================================== R1 o painel monta, e e um dialogo
{
  const html = desenhar();
  chk('R1', html.length > 500, `o painel monta e produz HTML (${html.length} caracteres)`);
  chk('R1b', html.includes('role="dialog"') && html.includes('aria-modal="true"'),
      'e monta como DIALOGO com `aria-modal` — quem usa leitor de tela precisa saber que o resto da '
      + 'pagina ficou atras');
  chk('R1c', html.includes('aria-label="Central de ajuda"'),
      'com nome acessivel proprio: "dialogo" sem nome nao diz qual');
  chk('R1d', html.includes('aria-label="Fechar a ajuda"'),
      'e o botao de fechar tem rotulo — um X sozinho e um icone sem nome');
  // No HTML e nao no texto: a dica e um `placeholder`, que e ATRIBUTO — o
  // extrator de texto o descarta junto com a tag, e a primeira versao deste
  // teste acusou um defeito que nao existia.
  chk('R1e', html.includes('type="search"') && html.includes('Descreva com suas palavras'),
      'a caixa de busca aparece, com a dica que ensina a perguntar em portugues comum');
  chk('R1f', html.includes('aria-label="Descreva com suas palavras'),
      'e a mesma dica e o nome acessivel do campo — sem isso, para o leitor de tela ele e "busca" e nada mais');
}

// ============================================ R2 o estado ao vivo vira TEXTO na tela
//
// O `ajuda.ts` prova que a frase e montada. Este bloco prova que ela e DESENHADA
// — sao coisas diferentes, e um `&&` mal colocado separa as duas.
{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    camada({ camada: 'dono_da_usina', faltam: 4, total: 4, efeito: 'bloqueia_split' }),
    camada({ camada: 'geracao_da_competencia', situacao: 'nao_medido', faltam: 0, total: 0 }),
  ]);
  const t = texto(desenhar({ passos }));

  chk('R2', t.includes('CPF ou CNPJ do cliente: 11 de 29 pendentes.'),
      'a frase com o numero real chega na tela, inteira');
  chk('R2b', t.includes('Como está o mês agora'),
      'sob o titulo que responde a pergunta mais provavel de quem abre a ajuda');
  chk('R2c', t.includes('Impede dividir o dinheiro'),
      'a etiqueta de efeito aparece na pendencia que NAO impede cobrar — e a informacao que evita '
      + 'alguem parar o faturamento inteiro por uma linha que nao o bloqueia');
  chk('R2d', (t.match(/Impede dividir o dinheiro/g) ?? []).length === 1,
      'e SO nessa: repetir a etiqueta em toda linha viraria ruido');
  chk('R2e', t.includes('ainda não dá para conferir') && !t.includes('0 de 0'),
      '"nao medido" chega como frase e nunca como "0 de 0" — pintar zero sobre nada de verde foi '
      + 'um defeito real, achado contra producao em 28/07');
  chk('R2f', !/pendentes\.\s*pendentes/.test(t), 'nenhuma frase sai duplicada');
}

// ================================================ R3 todo botao leva a algum lugar
{
  const passos = passosDoEstado([
    camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
    // Esta NAO tem tela de preenchimento (espelho do CRM, regra 4): nao pode
    // desenhar "Resolver".
    camada({ camada: 'geracao_da_competencia', faltam: 2, total: 4 }),
  ]);
  const html = desenhar({ passos });
  const t = texto(html);

  chk('R3', (t.match(/Resolver/g) ?? []).length === 1,
      'so a pendencia COM tela de preenchimento ganha o botao "Resolver" — desenha-lo na que nao tem '
      + 'formulario mandaria alguem clicar no vazio');
  chk('R3b', t.includes('Esse número não se digita aqui'),
      'e a que nao tem tela explica por que, em vez de deixar a linha muda');
  /*
   * R3c — E A EXPLICACAO NAO E O FIM DA LINHA, que era o estado ate 21/08.
   *
   * A linha da energia gerada dizia "esse numero nao se digita aqui" e parava:
   * verdadeiro e inutil, porque a pessoa lia "faltam 2 de 4" e nao tinha nem
   * onde ir OLHAR. Em 21/08 passou a levar a Usinas, para olhar.
   *
   * DESDE 24/08 ELA LEVA AO LUGAR ONDE O NUMERO ENTRA, que e o outro sistema —
   * "nao se digita AQUI" nao e o mesmo que "nao se digita". Enquanto o destino
   * era so olhar, a linha continuava sem dizer o que fazer.
   */
  chk('R3c', t.includes('Lançar a geração no outro sistema'),
      'a pendencia sem tela de preencher leva ao sistema onde o numero de fato entra');
  /*
   * R3c2 — E ELA SAI COMO LINK, e nao como botao que navega.
   *
   * A rota e um endereco completo. Se virasse `onClick` da navegacao interna, o
   * clique cairia numa rota inexistente deste sistema e a tela ficaria em branco
   * — que foi exatamente o defeito achado ao ligar o CRM: o painel de ajuda
   * tratava o caso e a linha da tela de Pendencias desenhava o proprio botao.
   */
  chk('R3c2', /<a [^>]*href="https:\/\/[^"]+"[^>]*target="_blank"/.test(html)
           && /rel="noopener noreferrer"/.test(html),
      'e sai como ancora com target e rel — abre em outra aba sem dar a ela acesso a esta');
  chk('R3d', botoesDeCaminho(html) === 2,
      `as DUAS linhas terminam num botao — nenhuma pendencia fica sem clique (contados: ${botoesDeCaminho(html)})`);
}

// ==================================== R4 a busca desenha o resultado certo
{
  const html = desenhar({ consultaInicial: 'cadê o boleto' });
  const t = texto(html);
  chk('R4', t.includes('Isto responde'),
      'resultado unico vem sob "Isto responde", e nao "Isto pode responder"');
  chk('R4b', t.includes('Cadê o boleto? Como gero o boleto de uma fatura?'),
      'e a pergunta certa e desenhada — desde 21/08 esta e a do assunto do BOLETO DA FATURA, e nao '
      + 'a do formulario de credencial do banco, que era onde quem so queria o boleto acabava');
  chk('R4c', t.includes('Abra a aba Emissão e cobrança'),
      'com os PASSOS abertos: resultado unico ja vem expandido, porque nao ha o que escolher');
  chk('R4d', !t.includes('Como está o mês agora'),
      'e o estado ao vivo some durante a busca — quem digitou uma pergunta quer a resposta dela');
  /*
   * R4g — OS DOIS CAMINHOS DO MESMO ASSUNTO, e e por isso que `caminhos` e lista
   * e nao campo unico: "cade o boleto" tem duas respostas possiveis e elas estao
   * em telas diferentes — a fatura (se ja da para gerar) e a credencial do banco
   * (se nao da). Oferecer so a primeira deixa metade das pessoas presa.
   */
  chk('R4g', t.includes('Abrir Emissão e cobrança') && t.includes('Conferir a conexão com o banco'),
      'o assunto desenha TODOS os caminhos, e nao so o primeiro');
}

{
  const html = desenhar({ consultaInicial: 'conta de luz' });
  const t = texto(html);
  chk('R4e', t.includes('O que a palavra quer dizer') && t.includes('Unidade consumidora'),
      '"conta de luz" desenha o VERBETE, que e a resposta certa');
  chk('R4f', !t.includes('Como configuro a emissão de boleto?'),
      'e nao desenha o topico do boleto: o casamento fraco pela palavra "conta" foi cortado em '
      + '21/08, depois de aparecer rodando contra producao');
  /*
   * R4h — O VERBETE TAMBEM TERMINA NUM CLIQUE. Ate 21/08 ele definia a palavra e
   * parava ali: quem descobria o que e uma unidade consumidora continuava sem
   * saber onde mexer nela. Meio caminho, num sistema sem suporte, e a pessoa
   * perguntando a proxima coisa a ninguem.
   */
  chk('R4h', botoesDeCaminho(html) > 0 && t.includes('Ver as unidades'),
      'a definicao vem com o endereco de onde aquilo aparece na tela');
}

// ============================================ R5 o vazio NUNCA e um beco
//
// A razao de existir da central: nao ha divisao de suporte. Uma tela dizendo
// "nada encontrado" e ponto e alguem parado ate alguem chegar.
{
  const html = desenhar({ consultaInicial: 'jabuticaba quantica' });
  const t = texto(html);
  chk('R5', t.includes('Não achei isso'), 'a busca sem resultado admite que nao achou');
  chk('R5b', t.includes('Talvez seja um destes') && t.includes('Por que não consigo cobrar este mês?'),
      'e oferece as perguntas do primeiro dia na mesma frase — a saida vem junto com a recusa');
}

/*
 * R5c/R5d — A PERGUNTA QUE SO PROCURA UMA TELA.
 *
 * "onde ficam as usinas" nao e uma duvida: e alguem procurando uma tela. Ela nao
 * casa assunto nenhum — e nao deve casar, porque nenhum assunto e sobre isso —,
 * e ate 21/08 recebia as perguntas do primeiro dia, todas sobre outra coisa.
 * Agora a resposta abre a porta que ela pediu.
 */
{
  const html = desenhar({ consultaInicial: 'onde ficam as usinas' });
  const t = texto(html);
  chk('R5c', t.includes('Se você estava procurando uma tela'),
      'a resposta reconhece que a pergunta era de navegacao, e diz isso');
  chk('R5d', t.includes('Abrir Usinas'),
      'e desenha o botao que abre a tela — a terceira defesa contra o beco');
}

// ======================================== R6 os quatro estados do mes
{
  chk('R6', texto(desenhar({ carregando: true })).includes('Conferindo'),
      'carregando: diz que esta conferindo');
  chk('R6b', texto(desenhar({ falhou: true })).includes('Não consegui conferir o mês agora'),
      'falhou: admite a falha E diz que o resto da ajuda continua valendo');
  chk('R6c', texto(desenhar({ falhou: true })).includes('Perguntas mais comuns'),
      'e prova isso desenhando os assuntos mesmo sem o mes — a ajuda nao depende da rede');
  chk('R6d', texto(desenhar({ passos: [] })).includes('Nada pendente'),
      'vazio: "nada pendente" e uma resposta, e nao uma tela em branco');
  chk('R6e', !texto(desenhar({ carregando: true })).includes('Nada pendente'),
      'e carregando NAO diz "nada pendente" — anunciar tudo certo antes de conferir e o defeito '
      + 'mais perigoso desta tela');
}

// ==================================== R7 o contexto muda com a tela aberta
{
  const clientes = secao(desenhar({ rota: '/clientes' }), 'Sobre esta tela');
  const usinas = secao(desenhar({ rota: '/usinas' }), 'Sobre esta tela');

  chk('R7', clientes !== '' && usinas !== '',
      'a secao de contexto aparece quando a tela tem assunto proprio');
  chk('R7b', clientes.includes('O cliente tem CPF na tela, mas o sistema diz que falta'),
      'em Clientes, o contexto e a duvida daquela tela');
  chk('R7c', usinas.includes('Como cadastro o dono de uma usina?')
          && !usinas.includes('O cliente tem CPF na tela'),
      'e em Usinas e OUTRO. Comparado dentro da secao, e nao no HTML inteiro: o topico do CPF esta '
      + 'entre as perguntas comuns e aparece em toda tela — procurar na pagina toda confundiria '
      + '"e o contexto daqui" com "esta na pagina"');
  chk('R7d', secao(desenhar({ rota: '/nao-existe' }), 'Sobre esta tela') === '',
      'tela sem assunto proprio nao desenha a secao vazia');
  chk('R7e', secao(desenhar({ rota: '/nao-existe' }), 'Perguntas mais comuns') !== '',
      'e mesmo la as perguntas comuns continuam — nenhuma tela fica sem saida');
}

// ============================ R8 o assunto vem FECHADO, para a lista ser varrivel
{
  const html = desenhar({ rota: '/usinas' });
  chk('R8', html.includes('aria-expanded="false"'),
      'os assuntos vem fechados: quem reconhece a propria pergunta abre uma, e nao le quatro');
  chk('R8b', desenhar({ consultaInicial: 'cadê o boleto' }).includes('aria-expanded="true"'),
      'mas o resultado UNICO de uma busca ja vem aberto — nao ha o que escolher');
  chk('R8c', (html.match(/aria-expanded/g) ?? []).length >= 3,
      'e cada assunto carrega o proprio estado, e nao um so para todos');
}

/*
 * R8d/R8e — A LISTA COMPLETA, atras de um clique.
 *
 * Existe para quem NAO CONSEGUE FORMULAR a pergunta, e essa pessoa e exatamente
 * a que ficaria parada: buscar exige saber a palavra, varrer uma lista nao. Vem
 * fechada porque quem sabe perguntar nao precisa dela.
 */
{
  chk('R8d', texto(desenhar()).includes('Ver todos os assuntos'),
      'a lista completa e oferecida em toda tela');
  const aberta = texto(desenhar({ tudoInicial: true }));
  chk('R8e', aberta.includes('Como troco de empresa?') && aberta.includes('Como lanço uma despesa da empresa?'),
      'e aberta ela mostra ate os assuntos que nao sao de nenhuma tela e nao estao entre os comuns');
}

// ============================== R9 nenhum jargao chega na tela DESENHADA
//
// O bloco V4 de `ajuda.ts` guarda os TEXTOS. Este guarda o HTML MONTADO — sao
// coisas diferentes: um rotulo escrito direto no JSX (e nao vindo do
// vocabulario) escaparia daquele e cairia aqui.
{
  const html = desenhar({
    rota: '/unidades',
    tudoInicial: true,
    passos: passosDoEstado([
      camada({ camada: 'documento_do_cliente', faltam: 11, total: 29 }),
      camada({ camada: 'tarifa_na_conta', situacao: 'nao_medido', faltam: 0, total: 0 }),
      camada({ camada: 'regra_de_comissao', faltam: 1, total: 1, efeito: 'bloqueia_split' }),
    ]),
  });
  const t = texto(html);

  const PROIBIDO: Array<[RegExp, string]> = [
    [/\bR\d{1,2}\b/, 'codigo de regra'],
    [/\bQ-[A-Z]/, 'codigo de questao'],
    [/npm run/, 'comando de terminal'],
    [/\bsplit\b/i, 'palavra proibida pela GLOSSARIO.md'],
    [/\bprontid[aã]o\b/i, 'nome interno do calculo'],
    [/\bcamadas?\b/i, 'nome da estrutura interna'],
    [/[a-z]+_[a-z]+/, 'nome de coluna'],
  ];
  for (const [regra, porque] of PROIBIDO) {
    const m = t.match(regra);
    chk('R9', m === null, `o HTML desenhado nao casa com ${regra} (${porque})${m ? ` — ACHADO: "${m[0]}"` : ''}`);
  }
}

// =============== R10 A PROMESSA DESENHADA: nenhuma resposta sem um botao
//
// `ajuda.ts` prova que a resposta CARREGA caminho. Este bloco prova que ele
// CHEGA na tela — e sao coisas diferentes, porque entre um e outro ha um `&&`.
{
  const casos = ['nao consigo cobrar', 'cadê o boleto', 'conta de luz', 'jabuticaba quantica',
                 'onde ficam as usinas', 'asdfgh', 'socorro', 'quanto entrou', 'pix', 'kwh'];
  for (const q of casos) {
    const n = botoesDeCaminho(desenhar({ consultaInicial: q }));
    chk('R10', n > 0, `"${q}" desenha ${n} botao(oes) que levam a alguma tela`);
  }
  chk('R10b', botoesDeCaminho(desenhar({ rota: '/relatorios' })) >= 0,
      'e a tela parada, sem busca, tambem monta sem erro');
}

// ================================= R11 o gatilho do canto e o balao que o apresenta
{
  const html = desenharGatilho();
  chk('R11', html.includes('class="primario ajuda-gatilho"'),
      'o botao da ajuda existe e mora na classe do canto inferior direito');
  chk('R11b', html.includes('aria-label="Abrir a central de ajuda"')
           && html.includes('aria-haspopup="dialog"'),
      'com nome acessivel e dizendo que abre um dialogo — um icone sozinho e um botao mudo');
  chk('R11c', !html.includes('ajuda-balao'),
      'e SEM balao quando ninguem pediu: ele e de primeira visita, nao de toda visita');
}

{
  const html = desenharGatilho({ aviso: true });
  const t = texto(html);
  chk('R11d', t.includes('A ajuda mora aqui'),
      'na primeira visita o balao se apresenta — um icone novo num canto e mudo, e quem entra hoje '
      + 'nao tem por que saber que aquele desenho responde perguntas');
  chk('R11e', html.includes('aria-label="Fechar este aviso"'),
      'e o "x" bem pequeno tem nome: alvo minusculo sem nome e enfeite, nao botao de fechar');
  chk('R11f', html.includes('role="status"') && !html.includes('role="alert"'),
      'anunciado como AVISO e nao como alerta — apresentar um botao nao e urgencia, e interromper '
      + 'a leitura de quem ouve a tela por isso seria desproporcional');
  // Conta a classe NUMERADA e nao a de base: `class="ajuda-bolha ajuda-bolha-1"`
  // contem "ajuda-bolha" duas vezes, e a primeira versao deste teste acusou
  // quatro bolhas onde ha duas.
  chk('R11g', (html.match(/ajuda-bolha-/g) ?? []).length === 2,
      'as duas bolhas do pensamento ligam o botao ao balao — e o que faz "fica aqui" ter um AQUI');
  chk('R11h', html.includes('aria-hidden="true"'),
      'e elas sao invisiveis para o leitor de tela: nao dizem nada, e duas bolinhas anunciadas '
      + 'seriam ruido sem conteudo');
  chk('R11i', !html.includes('ajuda-fundo') && !html.includes('aria-modal'),
      'o balao NAO e modal: nao escurece a tela nem prende o foco. Um aviso que interrompe o '
      + 'trabalho para dizer "existe ajuda" e o contrario de ajudar');

  // O texto do balao passa pela MESMA regra de jargao do resto: ele e a primeira
  // frase que um usuario novo le neste sistema.
  for (const regra of [/\bsplit\b/i, /\bcamadas?\b/i, /\bprontid[aã]o\b/i, /[a-z]+_[a-z]+/]) {
    chk('R11j', !regra.test(t), `a primeira frase que o usuario novo le nao casa com ${regra}`);
  }
}

chk('R11k', !desenharGatilho({ aviso: true, aberta: true }).includes('ajuda-balao'),
    'com o painel ABERTO o balao some: ele existia para dizer onde a ajuda fica, e quem ja esta '
    + 'dentro dela nao precisa mais ser informado');

chk('R11l', desenharGatilho({ aberta: true }).includes('aria-expanded="true"'),
    'e o botao continua no DOM com o painel aberto — sumir com ele largaria o foco do teclado no nada');

// ============================================================================
// R12 — A FAIXA DO CAMINHO DO DINHEIRO APARECE DE VERDADE
// ============================================================================
//
// POR QUE ESTAS LINHAS EXISTEM, e a data importa: em 09/09/2026 o dono abriu
// Pendencias e disse *"nenhuma faixa aparece"*. A observacao era a ESPERADA — o
// A1 tem 341 dias e o aviso esta ativo — e nao provava nada, porque **faixa
// nenhuma e, letra por letra, o mesmo sintoma de faixa quebrada**.
//
// As regras ja estavam provadas em `web/tests/saude-do-dinheiro.ts` (`SD-*`, 25
// pares por exaustao). O que nao estava provado era que a TELA MOSTRA. Um `&&`
// mal colocado, um `length === 0` invertido: nada disso quebra o `tsc`, nada
// disso reprova `SD-*`, e o resultado e silencio.
//
// E o modo de falha da regra 3 dentro do proprio alarme: um alerta que nao
// aparece e indistinguivel de nao haver alerta.

const desenharSaude = (certificado: EstadoDoCertificado, aviso: NivelDoAviso | null): string =>
  renderToStaticMarkup(<CorpoDaSaude certificado={certificado} aviso={aviso} />);

{
  // ------------------------------------------------ o silencio, e ele e escolha
  chk('R12a', desenharSaude('ok', 'ativo') === '',
      'com o A1 em dia e o aviso ligado a faixa desenha NADA — e este e o estado de producao em '
      + '09/09, entao e ele que o "nenhuma faixa aparece" do dono estava vendo');
  chk('R12b', desenharSaude('sem_conector', null) === '',
      'e sem conector tambem: nao ha banco ligado, entao nao ha caminho do dinheiro sobre o qual '
      + 'alarmar');

  // ------------------------------------- e o alarme, que e o que faltava provar
  const morto = desenharSaude('ok', 'inativado');
  const t = texto(morto);

  chk('R12c', morto !== '' && morto.length > 100,
      `com o aviso DESLIGADO a faixa monta e produz HTML (${morto.length} caracteres) — sem esta `
      + 'linha, "nenhuma faixa" continuaria querendo dizer as duas coisas ao mesmo tempo');
  chk('R12d', t.includes('O banco desligou o aviso de pagamento.'),
      'e o titulo CHEGA no HTML, com as palavras que a suite pura prende');
  chk('R12e', /dinheiro n[aã]o se perde/.test(t) && t.includes('atraso'),
      'junto da frase que impede o panico — sem ela o alerta parece perda de dinheiro');
  chk('R12f', morto.includes('href="/cobranca"'),
      'e com o caminho REAL para onde se resolve: `href` de verdade, entao botao do meio e '
      + '"copiar endereco" funcionam, como manda `rota.tsx`');

  // --------------------------------- os dois tons chegam como classes distintas
  const quebrado = desenharSaude('vencido', 'ativo');
  const naoSei = desenharSaude('ok', 'nao_verificavel');
  chk('R12g', quebrado !== naoSei && quebrado !== '' && naoSei !== '',
      'o A1 vencido e o "ninguem sabe" desenham COISAS DIFERENTES — a fronteira entre "esta '
      + 'quebrado" e "ninguem sabe" sobrevive ate o HTML, e nao morre na borda');

  // ------------------------------------------- duas metades, duas faixas
  const duas = desenharSaude('vencido', 'inativado');
  chk('R12h', (duas.match(/O certificado do banco venceu\./g) ?? []).length === 1
           && (duas.match(/O banco desligou o aviso de pagamento\./g) ?? []).length === 1,
      'A1 vencido e aviso desligado desenham as DUAS faixas, cada uma uma vez: sao dois consertos '
      + 'com dois donos, e colapsar esconderia um deles');

  // ----------------------- e nada de jargao chega na tela, nem por acidente
  for (const regra of [/\bwebhook\b/i, /\bendpoint\b/i, /\bmTLS\b/i, /\btoken\b/i, /\bAPI\b/]) {
    chk('R12i', !regra.test(texto(duas)), `o que a pessoa le nao casa com ${regra}`);
  }
}


// ============================================================================
// R13 — O QUE O SISTEMA FEZ SOZINHO CHEGA MESMO NA TELA
// ============================================================================
//
// POR QUE ESTAS LINHAS SAO DIFERENTES DAS `R12*`, e a diferenca e o assunto.
//
// La, o teste dificil era provar que a faixa APARECE quando ha problema — o
// estado normal e o silencio. Aqui e o contrario: o estado normal é FALAR, e o
// que precisa ser provado é que o rodapé nunca fica mudo quando está tudo bem.
//
// Um rodapé vazio é indistinguível de um rodapé que nunca existiu, e é
// exatamente esse o defeito que este par de componentes veio fechar: o sistema
// pode parar de trabalhar e continuar parecendo bem. Se a prova morasse só em
// `AU-*` (que mede as regras) e nada montasse o componente, um `&&` mal colocado
// devolveria silêncio — e silêncio, aqui, é a cara da automação morta.

const rodada = (
  chave: ChaveDaAutomacao, nivel: NivelDaRodada, segundos: number | null = 300,
): RodadaNaTela => ({
  chave, nivel,
  intervalo_segundos: chave === 'consulta_ativa' ? 86_400 : chave === 'ciclo_do_crm' ? 900 : 300,
  ultima: segundos === null ? null : {
    iniciado_em: '2026-09-10T06:17:00.000Z', status: nivel === 'terminou_mal' ? 'erro' : 'ok',
    examinados: 12, feitos: 3, falhos: 0,
  },
  ha_quanto_tempo_segundos: segundos,
});

const TRES_EM_DIA: RodadaNaTela[] = [
  rodada('consulta_ativa', 'em_dia', 1_200),
  rodada('fila_de_emissao', 'em_dia', 120),
  rodada('ciclo_do_crm', 'em_dia', 400),
];

const desenharPainel = (r: RodadaNaTela[] | null, erro: string | null = null): string =>
  renderToStaticMarkup(<PainelDasAutomacoes rodadas={r} erro={erro} />);
const desenharFaixas = (r: RodadaNaTela[] | null): string =>
  renderToStaticMarkup(<FaixasDasAutomacoes rodadas={r} />);

{
  // ------------------------------------- a AFIRMACAO, que e a metade que importa
  const bom = desenharPainel(TRES_EM_DIA);
  chk('R13a', bom !== '' && /rodou/.test(texto(bom)) && texto(bom).includes('conferência'),
      'com as tres em dia o rodape FALA — diz que rodaram e o que fizeram. E o unico jeito de '
      + '"nao estou vendo aviso nenhum" voltar a significar alguma coisa nesta tela');

  chk('R13b', desenharFaixas(TRES_EM_DIA) === '',
      'e no alto da tela nao aparece nada: alarme que fala todo dia se aprende a ignorar');

  const t = texto(bom);
  chk('R13c', /12/.test(t) && /3/.test(t),
      'e os numeros da ultima rodada chegam ao HTML — afirmacao sem fato e a mesma promessa vazia '
      + 'que ela veio substituir');

  // ------------------------------------------- o ALARME, quando ha o que gritar
  const parada = desenharFaixas([rodada('consulta_ativa', 'atrasada', 400_000)]);
  const tp = texto(parada);
  chk('R13d', parada !== '' && tp.includes('parou de rodar'),
      'a automacao parada monta faixa e o titulo chega inteiro ao HTML');
  chk('R13e', /n[aã]o se perde/.test(tp) && /[aà] m[aã]o/.test(tp),
      'com a frase que impede o panico e a que diz o que fazer enquanto isso');

  chk('R13f', !parada.includes('systemctl') && /detalhe t[ée]cnico/.test(tp),
      'e o comando NAO esta na superficie: ele nasce fechado dentro do `DetalheTecnico`, que e o '
      + 'unico lugar suportado para comando de terminal na interface');

  // ------------------------------------------ tres paradas, tres faixas distintas
  const todas = desenharFaixas([
    rodada('consulta_ativa', 'atrasada', 400_000),
    rodada('fila_de_emissao', 'travada', 9_000),
    rodada('ciclo_do_crm', 'nunca_rodou', null),
  ]);
  const tt = texto(todas);
  chk('R13g', (tt.match(/parou de rodar/g) ?? []).length === 1
           && (tt.match(/travou no meio/g) ?? []).length === 1
           && (tt.match(/nunca rodou/g) ?? []).length === 1,
      'tres automacoes paradas desenham TRES faixas, cada uma com o seu diagnostico — colapsar '
      + 'esconderia dois consertos diferentes, como as duas metades do caminho do dinheiro');

  // ----------------------------------- carregando nao pisca, e nao afirma nada
  chk('R13h', desenharFaixas(null) === '' && desenharPainel(null) === '',
      'enquanto a leitura nao voltou as duas metades desenham NADA: ausencia de resposta nao e '
      + 'resposta, nem para gritar nem para tranquilizar');

  // ------------------------------- e falhar a leitura NAO pode virar silencio
  const falhou = texto(desenharPainel(null, 'a rede caiu'));
  chk('R13i', /ningu[ée]m sabe/.test(falhou) && falhou.includes('a rede caiu'),
      'quando a leitura falha o rodape DIZ que ninguem sabe, com o motivo — calar seria a tela '
      + 'tendo exatamente a cara de "esta tudo bem" no unico caso em que ela nao sabe de nada');

  // ------------------------ e nada de jargao chega na tela, nem por acidente
  for (const regra of [/\btimer\b/i, /\bsystemd\b/i, /\bwebhook\b/i, /\bcron\b/i]) {
    chk('R13j', !regra.test(tt) && !regra.test(t), `o que a pessoa le nao casa com ${regra}`);
  }

  /* ⚠️ R13k — A SUPERFICIE, e ela foi paga com o dono abrindo a tela.
   *
   * Em 10/09/2026, com o painel ja em producao, veio: *"está apenas com o texto
   * solto embaixo das pendências, mas existe"*. As duas metades importam — o
   * caminho inteiro funcionava (rota, leitura, montagem) e o que chegava na
   * tela era PROSA.
   *
   * Nesta tela, dado mora sobre superficie: os cartoes de cima, a tabela das
   * camadas e a do conector tem borda, fundo e sombra. O unico texto solto e o
   * «Como ler esta tela», que e prosa de verdade. Uma lista de ESTADO desenhada
   * como paragrafo le como legenda de rodape - e o painel que existe para ser
   * conferido todo dia vira nota de rodape.
   *
   * Nenhuma outra verificacao pegaria: `AU-*` mede as frases, `R13a` mede que o
   * texto chega, e os dois passam verdes sobre um painel que ninguem enxerga
   * como painel. */
  chk('R13k', bom.includes('class="cartao secao"'),
      'o painel desenha sobre a superficie da casa (`cartao secao`), e nao como texto solto no pe '
      + 'da pagina - foi assim que ele chegou em producao na primeira vez, e o dono viu antes de '
      + 'qualquer suite');
}

// ============================================================================
// R14 — O QUE NAO CHEGOU AO BANCO CHEGA MESMO NA TELA
// ============================================================================
//
// Mesma natureza das `R13*`, uma camada adiante: aqui tambem o estado normal e
// FALAR. A lista existe para responder «quais clientes ainda nao receberam
// cobranca», e uma lista vazia por defeito de montagem tem exatamente a cara da
// resposta boa. `EM-*` mede as frases; estas montam os componentes.

const linhaDaEmissao = (nivel: NivelDaEmissao, extra: Partial<LinhaNaTela> = {}): LinhaNaTela => ({
  fatura_id: `fat-${nivel}`,
  unidade: '000401269001287',
  cliente: 'Cliente de Ensaio',
  competencia: '2026-08-01',
  vencimento: '2026-09-20',
  valor_total_centavos: 45_678,
  status_fatura: nivel === 'parado' ? 'vencida' : 'emitida',
  nivel,
  pede_gente: nivel === 'esquecido' || nivel === 'insistindo' || nivel === 'parado',
  ha_quanto_tempo_segundos: 3 * 86_400,
  boleto: nivel === 'nao_pedido' || nivel === 'esquecido' ? null : {
    status: 'erro', tentativas: 4,
    ultimo_erro: 'documento do pagador invalido',
    ultima_tentativa_em: '2026-09-10T09:00:00Z',
    proxima_tentativa_em: '2026-09-10T15:00:00Z',
  },
  ...extra,
});

const conjuntoDaEmissao = (linhas: LinhaNaTela[], total = linhas.length): EmissaoTravadaNaTela => ({
  linhas, total, pedem_gente: linhas.filter((l) => l.pede_gente).length,
});

const desenharLista = (d: EmissaoTravadaNaTela | null, erro: string | null = null): string =>
  renderToStaticMarkup(<PainelDaEmissao dados={d} erro={erro} pedirBoleto={() => {}} />);
const desenharFaixaDaEmissao = (d: EmissaoTravadaNaTela | null): string =>
  renderToStaticMarkup(<FaixaDaEmissao dados={d} />);

{
  // ---------------------------------------------- o vazio FALA, e nao fica mudo
  const vazio = desenharLista(conjuntoDaEmissao([]));
  chk('R14a', vazio !== '' && /j[aá] t[eê]m boleto/i.test(texto(vazio)),
      'sem nenhuma pendencia a lista AFIRMA que todas as faturas emitidas tem boleto no banco - '
      + 'uma lista que some quando esta tudo certo e indistinguivel de uma lista que quebrou');

  chk('R14b', desenharFaixaDaEmissao(conjuntoDaEmissao([])) === '',
      'e a faixa de alarme NAO aparece nesse mesmo estado: o par «cala o alarme, fala o painel» e '
      + 'a divisao inteira dos dois componentes');

  // ------------------------------------------------ as cinco linhas desenham
  const todas = desenharLista(conjuntoDaEmissao([
    linhaDaEmissao('esquecido'), linhaDaEmissao('insistindo'), linhaDaEmissao('esperando'),
    linhaDaEmissao('nao_pedido'), linhaDaEmissao('parado'),
  ]));
  const t = texto(todas);
  chk('R14c', /ningu[eé]m pediu/i.test(t) && /banco recusou/i.test(t)
           && /parou de tentar/i.test(t) && t.includes('000401269001287'),
      'os cinco niveis montam e cada um chega com a SUA frase - o `.map` que renderiza um estado '
      + 'so passaria no `tsc` e mostraria a mesma linha cinco vezes');

  chk('R14d', t.includes('R$') && /vence 20\/09\/2026/.test(t),
      'a linha carrega valor e vencimento em portugues - sem eles, quem le sabe que falta cobrar '
      + 'e nao sabe quanto nem para quando');

  chk('R14e', t.includes('documento do pagador invalido'),
      'o que o banco respondeu aparece na propria linha - era isso que exigia abrir 29 paineis, '
      + 'um de cada vez, para descobrir');

  // ------------------------------------------- o botao existe, e nao no `parado`
  const so = (n: NivelDaEmissao) => desenharLista(conjuntoDaEmissao([linhaDaEmissao(n)]));
  const botoes = (html: string) => (html.match(/<button/g) ?? []).length;
  chk('R14f', botoes(so('esquecido')) === 1 && botoes(so('nao_pedido')) === 1
           && botoes(so('parado')) === 0,
      'quem pode ser pedido ganha botao e o `parado` NAO ganha - oferecer o clique que o servidor '
      + 'ja recusa e mandar a pessoa colher um erro que a tela ja sabia');

  chk('R14g', renderToStaticMarkup(<PainelDaEmissao dados={conjuntoDaEmissao([linhaDaEmissao('esquecido')])} />)
        .includes('<button') === false,
      'e sem o `pedirBoleto` o botao nao e desenhado: botao que existe sem efeito e pior que '
      + 'botao nenhum');

  // ------------------------------------------------- a faixa conta e nao lista
  const faixa = texto(desenharFaixaDaEmissao(conjuntoDaEmissao([
    linhaDaEmissao('esquecido', { ha_quanto_tempo_segundos: 9 * 86_400 }),
    linhaDaEmissao('insistindo'),
  ])));
  chk('R14h', /2 faturas/.test(faixa) && /9 dias/.test(faixa) && !faixa.includes('000401269001287'),
      'a faixa de Pendencias conta duas e da a idade da mais antiga, sem listar unidade nenhuma - '
      + 'listar viraria a segunda tela de emissao no alto da primeira tela da barra');

  // ------------------------------------------------- a leitura que falhou fala
  const falhou = texto(desenharLista(null, 'a rede caiu'));
  chk('R14i', /ningu[eé]m sabe/.test(falhou) && falhou.includes('a rede caiu'),
      'quando a leitura falha, a lista diz que NAO SABE, com o motivo - calar seria a mesma cara '
      + 'de dizer que esta tudo em dia');

  chk('R14j', desenharLista(null) === '' && desenharFaixaDaEmissao(null) === '',
      'e enquanto a resposta nao voltou nenhum dos dois desenha nada: ausencia de resposta nao e '
      + 'resposta');

  // ------------------------------------------------------------- a superficie
  /* A licao do `R13k`, aplicada antes de o dono precisar ver: nesta casa dado
   * mora sobre superficie, e uma lista de estado desenhada como paragrafo le
   * como legenda de rodape. */
  chk('R14k', vazio.includes('class="cartao secao"') && todas.includes('class="cartao secao"'),
      'a lista desenha sobre a superficie da casa (`cartao secao`), cheia ou vazia');

  // ------------------------------- nenhuma palavra proibida chega ao HTML final
  for (const regra of [/npm run/, /\bQ-[A-Z]/, /snake_case/, /\bUC\b/]) {
    chk('R14l', !regra.test(t) && !regra.test(faixa), `o que a pessoa le nao casa com ${regra}`);
  }
}

// ============================================================================
// R15 — O VINCULO COM O OUTRO SISTEMA MONTA, E O BOTAO SO APARECE ONDE PODE
// ============================================================================
//
// O caso e o de producao: a unidade recusada 519 vezes desde 04/09/2026. O que
// estas linhas provam e o que `V-*` nao alcanca - que o componente MONTA e que o
// botao existe exatamente onde as quatro guardas deixam.

const vinculoTravado: VinculoNaTela = {
  numero_uc: '000091762801211',
  cliente: 'Cliente do caso real',
  contrato_no_espelho: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
  crm_por_contrato: { uc: '000000100076075', contrato_id: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
                      lead_codigo: 'LEAD-1', cliente: 'Cliente A' },
  crm_por_uc: { uc: '000091762801211', contrato_id: 'aaaa1111-2222-3333-4444-555566667777',
                lead_codigo: 'LEAD-2', cliente: 'Cliente B' },
  uc_presa_ao_substituto: null,
  decisao: { pode: true, contratoASoltar: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
             ucQueVaiNascer: '000000100076075',
             contratoQueVaiEntrar: 'aaaa1111-2222-3333-4444-555566667777' },
};

{
  const travado = renderToStaticMarkup(
    <PainelDoVinculo dados={vinculoTravado} destravar={() => {}} />);
  const t = texto(travado);
  chk('R15a', /travada/i.test(t) && t.includes('000000100076075') && travado.includes('<button'),
      'o caso travado monta, nomeia a unidade para onde o contrato foi e oferece o botao');

  const semAcao = renderToStaticMarkup(<PainelDoVinculo dados={vinculoTravado} />);
  chk('R15b', !semAcao.includes('<button') || !/Soltar o v/i.test(texto(semAcao)),
      'sem a acao, o botao de soltar nao e desenhado - botao que existe sem efeito e pior que '
      + 'botao nenhum (o «ver detalhe tecnico» continua sendo um botao legitimo)');

  const recusado = renderToStaticMarkup(<PainelDoVinculo destravar={() => {}} dados={{
    ...vinculoTravado, decisao: { pode: false, guarda: 3, motivo: 'tecnico' }, crm_por_uc: null,
  }} />);
  chk('R15c', !/Soltar o v[ií]nculo velho/i.test(texto(recusado))
           && /[oó]rf[aã]|nenhum contrato serve/i.test(texto(recusado)),
      'e a guarda 3 monta a explicacao SEM o botao - oferecer o clique que o servidor recusa e '
      + 'mandar a pessoa colher um erro que a tela ja sabia');

  const falhou = texto(renderToStaticMarkup(
    <PainelDoVinculo dados={null} erro="a outra base nao respondeu" />));
  chk('R15d', /ningu[eé]m sabe/.test(falhou) && falhou.includes('a outra base nao respondeu'),
      'leitura falhada DIZ que ninguem sabe, com o motivo - e nao finge que o vinculo esta certo');

  chk('R15e', renderToStaticMarkup(<PainelDoVinculo dados={null} />) === '',
      'e enquanto a resposta nao voltou nao desenha nada');

  const carregando = texto(renderToStaticMarkup(<PainelDoVinculo dados={null} carregando />));
  chk('R15f', /conferindo/i.test(carregando),
      'durante a leitura a tela DIZ que esta conferindo - esta e a unica leitura do sistema que '
      + 'sai para outro banco, e ela demora o que aquele banco demorar');

  for (const regra of [/npm run/, /\bQ-[A-Z]/, /rateio_clientes/, /crm_usina_cliente_id/]) {
    chk('R15g', !regra.test(t), `o que a pessoa le, fora do detalhe tecnico, nao casa com ${regra}`);
  }
}

// ============================================================================
// R16 — O ROTEIRO DO MÊS CHEGA NA TELA, e com UMA instrução por vez
// ============================================================================
//
// A suíte pura (`web/tests/roteiro-do-mes.ts`, `RM*`) já prova a máquina de
// estados: um só «agora», nada afirmado sem medida, travar consome o «agora».
// O que ela NÃO prova é que a caixa monta e que o texto sai — e aqui o modo de
// falha é pior do que o da faixa da saúde, porque este componente é a primeira
// coisa que a operação lê na primeira tela do sistema.
//
// A DIFERENÇA PARA AS `R12*`: lá o estado normal era o silêncio, e provar que a
// faixa APARECE era o difícil. Aqui o componente nunca cala — então o difícil é
// provar que ele mostra **um** passo aberto, e não cinco.

const desenharRoteiro = (leitura: Parameters<typeof CorpoDoRoteiro>[0]): string =>
  renderToStaticMarkup(<CorpoDoRoteiro {...leitura} />);

{
  const camadas = [
    { camada: 'conta_lida_da_competencia', situacao: 'pendente' as const, faltam: 29, total: 29, efeito: 'bloqueia_fatura' as const },
    { camada: 'contrato_ativo', situacao: 'ok' as const, faltam: 0, total: 29, efeito: 'bloqueia_fatura' as const },
  ];

  const html = desenharRoteiro({
    competencia: 'julho de 2026', camadas, posicao: null, semCobranca: null,
  });
  const t = texto(html);

  chk('R16a', html.length > 300 && t.includes('O mês de julho de 2026, passo a passo'),
      `a caixa monta (${html.length} caracteres) e o título nomeia o mês por extenso - «a `
      + 'competência 2026-07-01» é o nome que o banco dá, e não o que a pessoa fala');

  chk('R16b', t.includes('Ler as contas de luz do mês') && t.includes('você está no 1 de 5'),
      'com o mês zerado, o passo aberto é o primeiro - e a caixa DIZ em qual dos cinco a pessoa '
      + 'está, que é a frase que ela guarda de um dia para o outro');

  chk('R16c', t.includes('Como fazer') && /Baixe do portal da distribuidora/.test(t),
      'e o «como fazer» sai inteiro no HTML, começando por onde o arquivo vem - sem isso a caixa '
      + 'diria o que fazer e não como, que é a metade que a operação não tem');

  chk('R16d', (html.match(/Como fazer/g) ?? []).length === 1,
      'UMA instrução por vez: só o passo aberto traz o «como fazer», e os outros quatro ficam em '
      + 'uma linha cada - cinco instruções ao mesmo tempo é o mesmo que nenhuma');

  chk('R16e', html.includes('href="/documento"'),
      'e o botão leva ao endereço REAL da tela onde o passo acontece (`href` de verdade, como '
      + 'manda `rota.tsx`) - não a uma explicação de onde clicar');

  // ------------------------------------------------ o passo travado, que é o difícil
  const travado = desenharRoteiro({
    competencia: 'julho de 2026',
    camadas: [
      { camada: 'conta_lida_da_competencia', situacao: 'ok', faltam: 0, total: 29, efeito: 'bloqueia_fatura' },
      { camada: 'contrato_ativo', situacao: 'pendente', faltam: 11, total: 29, efeito: 'bloqueia_fatura' },
    ],
    posicao: { faturas: 0, emitidas: 0, liquidadas: 0, vencidas_em_aberto: 0 },
    semCobranca: 0,
  });
  const tt = texto(travado);

  chk('R16f', /Antes disso, falta uma coisa/.test(tt) && tt.includes('contrato'),
      'o passo travado mostra O QUE fecha a porta, antes do passo a passo - seguir a instrução '
      + 'com uma porta fechada na frente termina numa recusa do servidor depois de cinco cliques');

  chk('R16g', travado.includes('href="/contratos"'),
      'e a trava carrega o link de onde ela se resolve, que vem de `destino-da-camada.ts` - o mapa '
      + 'não é reescrito no roteiro');

  // ------------------------------------------------- o mês fechado FALA
  const fechado = desenharRoteiro({
    competencia: 'julho de 2026',
    camadas: [{ camada: 'conta_lida_da_competencia', situacao: 'ok', faltam: 0, total: 29, efeito: 'bloqueia_fatura' }],
    posicao: { faturas: 29, emitidas: 29, liquidadas: 29, vencidas_em_aberto: 0 },
    semCobranca: 0,
  });
  chk('R16h', fechado !== '' && /os cinco passos fecharam/.test(texto(fechado)),
      'e com o mês inteiro fechado a caixa NÃO some: ela diz que fechou - caixa que some tem a '
      + 'mesma cara de caixa que quebrou, a lição que a tabela das camadas já tinha aprendido');

  // ------------------------------------- nada de jargão chega em quem lê
  for (const regra of [/\bcamada\b/i, /\bwebhook\b/i, /\bendpoint\b/i, /\bQ-[A-Z]/, /npm run/]) {
    chk('R16i', !regra.test(t) && !regra.test(tt), `o que a pessoa le nao casa com ${regra}`);
  }
}

export const resultado = () => ({ falhas, feitas });
