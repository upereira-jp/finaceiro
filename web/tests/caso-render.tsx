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

export const resultado = () => ({ falhas, feitas });
