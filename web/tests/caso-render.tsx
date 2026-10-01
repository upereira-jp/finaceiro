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
import { CorpoDoRoteiro, FaixaDoPasso } from '../src/roteiro-corpo.tsx';
import { FaixasDasAutomacoes, PainelDasAutomacoes } from '../src/automacoes-corpo.tsx';
import { PainelDaEmissao } from '../src/emissao-travada-corpo.tsx';
import { PainelDoVinculo } from '../src/vinculo-do-crm-corpo.tsx';
import type { VinculoNaTela } from '../src/vinculo-do-crm.ts';
import type { LinhaNaTela, NivelDaEmissao, EmissaoTravadaNaTela } from '../src/emissao-travada.ts';
import type { NivelDaRodada, ChaveDaAutomacao, RodadaNaTela } from '../src/automacoes.ts';
import type { NivelDoAviso } from '../src/saude-do-dinheiro.ts';
import type { EstadoDoCertificado } from '../src/cobranca-regras.ts';
import { GatilhoDeAjuda } from '../src/ajuda-gatilho.tsx';
import { MenuLateral } from '../src/menu-lateral.tsx';
import { FUNIS, telaDoCaminho } from '../src/navegacao.ts';
import { passosDoEstado, type CamadaLida } from '../src/ajuda.ts';
import { TabelaDaFila, TabelaDasRegistradas, GavetaDaConta, type PropsDasRegistradas } from '../src/fatura-lote-corpo.tsx';
import type { ItemDoLote } from '../src/lote-de-contas.ts';
import { CAMPOS_DA_FATURA_VAZIOS, type RegistroDeFatura } from '../src/api.ts';
import { filtrarRegistradas } from '../src/registradas-regras.ts';
import { RevisaoDaSerie, RecusaNaTela, ResumoDaBaixa, SituacaoDaCobranca } from '../src/emissao-corpo.tsx';
import { PerguntaNaTela } from '../src/serie.tsx';
import { lerRecusa, recusaPrevista } from '../src/emissao-regras.ts';

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
      mes={p.mes ?? null}
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
  /* [30/09/2026] a aba se chama «Cobranças» (antes «Emissão e cobrança"); o
   * texto do passo e o botão acompanham o rótulo da barra. [etapa 3b] A barra
   * virou menu lateral, e a ajuda chama o lugar de «tela», não de «aba». */
  chk('R4c', t.includes('Abra a tela Cobranças'),
      'com os PASSOS abertos: resultado unico ja vem expandido, porque nao ha o que escolher');
  chk('R4d', !t.includes('Como está o mês agora'),
      'e o estado ao vivo some durante a busca — quem digitou uma pergunta quer a resposta dela');
  /*
   * R4g — OS DOIS CAMINHOS DO MESMO ASSUNTO, e e por isso que `caminhos` e lista
   * e nao campo unico: "cade o boleto" tem duas respostas possiveis e elas estao
   * em telas diferentes — a fatura (se ja da para gerar) e a credencial do banco
   * (se nao da). Oferecer so a primeira deixa metade das pessoas presa.
   */
  chk('R4g', t.includes('Abrir Cobranças') && t.includes('Conferir a conexão com o banco'),
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
  /* [30/09/2026] A FRASE DO MÊS É A DA TELA MÊS, e não uma da ajuda. Até esta
   * data o vazio dizia «Nada pendente. Este mês pode ser cobrado.» olhando só o
   * cadastro; agora o painel recebe a frase de `mesNoFunil` e a desenha como
   * veio — é o que a prende às outras duas. */
  const FECHADO = 'Nada falta fazer neste mês: o que resta é o cliente pagar, e isso o sistema acompanha sozinho.';
  const fechado = texto(desenhar({ passos: [], mes: { estado: 'fechado', frase: FECHADO } }));
  chk('R6d', fechado.includes(FECHADO) && fechado.includes('Ver o mês na tela Mês'),
      'vazio: a frase do mês fechado é uma resposta, e não uma tela em branco — e ela leva à tela Mês');
  chk('R6e', !texto(desenhar({ carregando: true })).includes('Nada falta')
             && !texto(desenhar({ carregando: true })).includes('Nada pendente'),
      'e carregando NAO diz que nada falta — anunciar tudo certo antes de conferir e o defeito '
      + 'mais perigoso desta tela');
  const andando = texto(desenhar({ passos: [], mes: { estado: 'andando', frase: 'Falta trabalho em dois dos cinco passos.' } }));
  chk('R6f', andando.includes('Falta trabalho em dois dos cinco passos.') && !andando.includes('Nada pendente'),
      'e sem pendência de CADASTRO o painel não diz mais que o mês pode ser cobrado: diz a frase do mês, '
      + 'que olha os cinco passos');
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
  /* [30/09/2026, etapa 4a] A SUPERFICIE PASSOU A SER O `Recolhido` — a secao
   * fecha com o resumo de uma linha a vista, e e ela que tem borda e fundo. A
   * garantia e a mesma: nao e texto solto. E o resumo fala mesmo fechado. */
  chk('R13k', /<details class="recolhido"/.test(bom) && /class="recolhido-resumo">As tr[eê]s rodadas est[aã]o em dia/.test(bom),
      'o painel desenha sobre uma superficie da casa (o `Recolhido`, com borda e fundo), e nao como '
      + 'texto solto no pe da pagina - foi assim que ele chegou em producao na primeira vez, e o dono '
      + 'viu antes de qualquer suite; e fechado ele ainda afirma que as tres estao em dia');
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
/* A FAIXA DE ALARME (`FaixaDaEmissao`) SAIU EM 30/09/2026 (etapa 4a) com o
 * caso dela nesta suite: ela nao era montada em tela nenhuma desde a etapa 3,
 * quando o passo 4 do funil passou a contar as cobrancas sem boleto. O que ela
 * garantia mora no funil (`RM2`, `RM10`, `R16j`). */

{
  // ---------------------------------------------- o vazio FALA, e nao fica mudo
  const vazio = desenharLista(conjuntoDaEmissao([]));
  chk('R14a', vazio !== '' && /j[aá] t[eê]m boleto/i.test(texto(vazio)),
      'sem nenhuma pendencia a lista AFIRMA que todas as faturas emitidas tem boleto no banco - '
      + 'uma lista que some quando esta tudo certo e indistinguivel de uma lista que quebrou');

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

  // ------------------------------------------------- a leitura que falhou fala
  const falhou = texto(desenharLista(null, 'a rede caiu'));
  chk('R14i', /ningu[eé]m sabe/.test(falhou) && falhou.includes('a rede caiu'),
      'quando a leitura falha, a lista diz que NAO SABE, com o motivo - calar seria a mesma cara '
      + 'de dizer que esta tudo em dia');

  chk('R14j', desenharLista(null) === '',
      'e enquanto a resposta nao voltou a lista nao desenha nada: ausencia de resposta nao e '
      + 'resposta');

  // ------------------------------------------------------------- a superficie
  /* A licao do `R13k`, aplicada antes de o dono precisar ver: nesta casa dado
   * mora sobre superficie, e uma lista de estado desenhada como paragrafo le
   * como legenda de rodape. */
  chk('R14k', vazio.includes('class="cartao secao"') && todas.includes('class="cartao secao"'),
      'a lista desenha sobre a superficie da casa (`cartao secao`), cheia ou vazia');

  // ------------------------------- nenhuma palavra proibida chega ao HTML final
  for (const regra of [/npm run/, /\bQ-[A-Z]/, /snake_case/, /\bUC\b/]) {
    chk('R14l', !regra.test(t), `o que a pessoa le nao casa com ${regra}`);
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

/* [30/09/2026, etapa 3] O ROTEIRO VIROU FUNIL, e estas verificações seguiram o
 * modelo: cinco abas com a contagem de cada passo, UM «Comece aqui», um painel
 * só, e o cadastro numa linha própria. As garantias de antes continuam — uma
 * instrução por vez, o link de verdade, o mês fechado que fala — com a forma
 * nova. */
const LEITURA_VAZIA = {
  mes: '2026-07', posicao: { vencidas_em_aberto: 0 }, cobrancas: [],
  registradas: { lista: [], parcial: false }, semBoleto: { linhas: [], total: 0 },
};

{
  const camadas = [
    { camada: 'conta_lida_da_competencia', situacao: 'pendente' as const, faltam: 29, total: 29, efeito: 'bloqueia_fatura' as const },
    { camada: 'contrato_ativo', situacao: 'ok' as const, faltam: 0, total: 29, efeito: 'bloqueia_fatura' as const },
  ];

  const html = desenharRoteiro({ competencia: 'julho de 2026', ...LEITURA_VAZIA, camadas });
  const t = texto(html);

  chk('R16a', html.length > 300 && t.includes('O mês de julho de 2026'),
      `a caixa monta (${html.length} caracteres) e o título nomeia o mês por extenso - «a `
      + 'competência 2026-07-01» é o nome que o banco dá, e não o que a pessoa fala');

  chk('R16b', (html.match(/role="tab"/g) ?? []).length === 5 && (t.match(/Comece aqui/g) ?? []).length === 1
             && t.includes('Ler as contas de luz do mês') && /29\s*contas a ler/.test(t),
      'os cinco passos aparecem como abas, cada um com a sua contagem, e UM só leva o «Comece aqui» '
      + '— com o mês zerado, o de ler as 29 contas');

  chk('R16c', t.includes('Como fazer') && /Baixe do portal da distribuidora/.test(t),
      'e o «como fazer» do passo em destaque sai inteiro no HTML, começando por onde o arquivo vem');

  chk('R16d', (html.match(/Como fazer/g) ?? []).length === 1 && (html.match(/role="tabpanel"/g) ?? []).length === 1,
      'UM painel, com UM «como fazer»: cinco instruções ao mesmo tempo é o mesmo que nenhuma');

  chk('R16e', html.includes('href="/documento"') && t.includes('Abrir Contas de luz'),
      'e o botão leva ao endereço REAL da tela onde o passo acontece, com o nome da aba — «Abrir '
      + 'Contas de luz» —, e não a uma explicação de onde clicar');

  // ------------------------------------ o cadastro que trava, numa linha própria
  const travado = desenharRoteiro({
    competencia: 'julho de 2026', ...LEITURA_VAZIA,
    camadas: [
      { camada: 'conta_lida_da_competencia', situacao: 'ok', faltam: 0, total: 29, efeito: 'bloqueia_fatura' },
      { camada: 'contrato_ativo', situacao: 'pendente', faltam: 11, total: 29, efeito: 'bloqueia_fatura' },
    ],
  });
  const tt = texto(travado);

  chk('R16f', /O cadastro trava parte do mês/.test(tt) && tt.includes('Contrato ativo') && /11\s*unidades/.test(tt),
      'a pendência de cadastro vira uma linha própria, com o nome, quantos faltam e de quê — e não '
      + 'consome mais o destaque do mês');

  chk('R16g', travado.includes('href="/contratos'),
      'e ela carrega o link de onde se resolve, que vem de `destino-da-camada.ts` - o mapa não é '
      + 'reescrito no roteiro');

  // ------------------------------------------------- o mês fechado FALA
  const fechado = desenharRoteiro({
    competencia: 'julho de 2026', ...LEITURA_VAZIA,
    camadas: [{ camada: 'conta_lida_da_competencia', situacao: 'ok', faltam: 0, total: 29, efeito: 'bloqueia_fatura' }],
    cobrancas: Array(29).fill({ status: 'paga' }),
    registradas: { lista: Array(29).fill({ competencia: '2026-07-01', fatura_id: 'x', cobranca_disponivel: true }), parcial: false },
  });
  chk('R16h', fechado !== '' && /Nada falta fazer neste mês/.test(texto(fechado)) && !/Comece aqui/.test(texto(fechado)),
      'e com o mês inteiro fechado a caixa NÃO some: ela diz que nada falta fazer, com a mesma frase '
      + 'da tabela de conferências e da Central de Ajuda');

  // ----------------------------------------- o risco leva o destaque, e o botão
  const risco = desenharRoteiro({
    competencia: 'setembro de 2026', mes: '2026-09',
    camadas: [{ camada: 'conta_lida_da_competencia', situacao: 'pendente', faltam: 15, total: 41, efeito: 'bloqueia_fatura' }],
    posicao: { vencidas_em_aberto: 2 },
    cobrancas: [...Array(5).fill({ status: 'rascunho' }), ...Array(9).fill({ status: 'emitida' }),
                ...Array(2).fill({ status: 'vencida' }), ...Array(4).fill({ status: 'paga' })],
    registradas: { lista: Array(6).fill({ competencia: '2026-09-01', fatura_id: null, cobranca_disponivel: true }), parcial: false },
    semBoleto: {
      linhas: [
        { competencia: '2026-09-01', pede_gente: false, boleto: null },
        { competencia: '2026-09-01', pede_gente: true, boleto: { ultimo_erro: 'PagadorSemEndereco: falta o endereço.' } },
      ],
      total: 2,
    },
  });
  const tr = texto(risco);
  const abaEscolhida = /<button[^>]*aria-selected="true"[^>]*data-passo="([a-z]+)"/.exec(risco)?.[1];
  chk('R16j', abaEscolhida === 'cobrar' && tr.includes('Abrir Cobranças') && /recusada pelo banco/.test(tr)
             && risco.includes('href="/faturas"'),
      'com 15 contas a ler e um boleto recusado pelo banco, o painel abre no PASSO 4 — «Abrir '
      + 'Cobranças», com a recusa escrita —, e não no 1');

  // ------------- o boleto de OUTRO mês é aviso com link, e não o destaque (4a)
  const deFora = desenharRoteiro({
    competencia: 'agosto de 2026', ...LEITURA_VAZIA, mes: '2026-08',
    camadas: [{ camada: 'conta_lida_da_competencia', situacao: 'ok', faltam: 0, total: 41, efeito: 'bloqueia_fatura' }],
    cobrancas: [...Array(20).fill({ status: 'paga' })],
    semBoleto: {
      linhas: [{ competencia: '2026-09-01', pede_gente: true, boleto: { ultimo_erro: 'PagadorSemEndereco: falta o endereço.' } }],
      total: 1,
    },
  });
  const tf = texto(deFora);
  chk('R16l', /E 1 de outros meses pede você/.test(tf) && deFora.includes('href="/faturas?mes=2026-09"')
             && !/Comece aqui/.test(tf) && !/data-passo="cobrar"[^>]*>\s*<span class="roteiro-selo[^"]*">Comece/.test(deFora),
      'em agosto, sem nada sem boleto no mês, o de setembro que pede você aparece como AVISO com o '
      + 'link para Cobranças em setembro — e o «Comece aqui» não cai no passo 4 vazio');

  const semMedida = desenharRoteiro({ competencia: 'julho de 2026', ...LEITURA_VAZIA, camadas, cobrancas: null });
  chk('R16k', /não medido/.test(texto(semMedida)) && semMedida.includes('>—<'),
      'e a leitura que não chegou aparece como «—» e «não medido», nunca como zero');

  // ------------------------------------- nada de jargão chega em quem lê
  for (const regra of [/\bcamada\b/i, /\bwebhook\b/i, /\bendpoint\b/i, /\bQ-[A-Z]/, /npm run/]) {
    chk('R16i', !regra.test(t) && !regra.test(tt) && !regra.test(tr), `o que a pessoa le nao casa com ${regra}`);
  }
}

// ============================================================================
// R17 — A FAIXA DE ORIENTAÇÃO, dentro da tela de trabalho
// ============================================================================
//
// O roteiro inteiro mora em Pendências; o trabalho mora nas outras duas telas —
// e quem está lá dentro perdeu o mapa. Foi assim que a aba aposentada conseguiu
// parecer o caminho: nenhuma tela dizia o que vinha antes nem depois dela.
//
// O modo de falha aqui é o silêncio: `ondeEstouNoMes` devolve `null` para tela
// sem passo, e um `!onde` invertido apagaria a faixa das duas telas que a
// precisam sem quebrar `tsc` nem reprovar `RM*`.

{
  const fu = renderToStaticMarkup(<FaixaDoPasso rota="/documento" />);
  const ec = renderToStaticMarkup(<FaixaDoPasso rota="/faturas" />);

  chk('R17a', /Passos 1 e 2 de 5 do mês/.test(texto(fu)),
      'a tela onde a cobrança nasce diz que ela é os passos 1 e 2 dos 5 - quem chega nela de fora '
      + 'do roteiro não tinha como saber que parte do mês estava fazendo');

  /* [30/09, etapa 4a] «Antes daqui: o passo 2, Gerar as cobranças» — o «·» saiu
     do meio da frase corrida. */
  chk('R17b', /Passos 3 e 4 de 5 do mês/.test(texto(ec)) && /Antes daqui: o passo 2, Gerar as cobranças/.test(texto(ec)),
      'e a de emitir diz que é a 3 e a 4, e que há um passo 2 antes dela');

  chk('R17c', ec.includes('href="/documento"') && fu.includes('href="/faturas"'),
      'cada uma aponta a vizinha pelo endereço real - a faixa é o corrimão entre as duas telas, e '
      + 'corrimão que não leva a lugar nenhum não é corrimão');

  chk('R17d', fu.includes('href="/pendencias"') && ec.includes('href="/pendencias"'),
      'e as duas voltam para o roteiro completo: o estado ao vivo tem UM lugar, e repeti-lo aqui '
      + 'criaria três lugares para discordarem');

  chk('R17e', !/Antes daqui/.test(texto(fu)) && /Depois daqui: o passo 3/.test(texto(fu)) && !/·/.test(texto(fu)),
      'a tela que ABRE o mês não inventa um passo anterior, e diz qual é o próximo');

  // -------------------------- a tela sem passo desenha NADA, e é o certo
  const cadastro = ['/clientes', '/unidades', '/contratos', '/usinas', '/donos', '/carteira']
    .map((r) => renderToStaticMarkup(<FaixaDoPasso rota={r} />));
  chk('R17f', cadastro.every((h) => h === ''),
      'e nenhuma tela de cadastro ganha faixa - inclusive a APOSENTADA, porque uma faixa de '
      + '«passo do mês» nela seria o sistema convidando de volta para o caminho que trava a unidade');

  // [30/09/2026] O FIM DO MÊS, do outro lado da barra.
  const cp = renderToStaticMarkup(<FaixaDoPasso rota="/contas-a-pagar" />);
  chk('R17g', /Passo 5 de 5 do mês do Rateio/.test(texto(cp)) && /É aqui que o mês termina/.test(texto(cp))
              && cp.includes('href="/pendencias"') && cp.includes('href="/faturas"'),
      'Contas a pagar diz que é o passo 5 e o FIM do mês do Rateio, aponta o passo 4 em Cobranças e '
      + 'volta para o mês inteiro — até 30/09 o roteiro mandava para cá e a tela não sabia de que mês '
      + 'era o fim');
}

// ============================================================================
// R18..R21 — A ABA 1 DA FATURA UNIFICADA (etapa 1 do redesenho, 30/09/2026)
// ============================================================================
//
// O QUE ESTAS VERIFICACOES PRENDEM e o que a critica de 30/09 mediu no espelho:
// Situacao e acao so com rolagem lateral, o laranja numa previa, «gerar
// cobrança» um por um com `confirm`, «excluir» colado nele. Nada disso aparece
// numa suite que nao monta a tabela — e a tabela agora e montavel, porque o
// desenho saiu da tela para `fatura-lote-corpo.tsx`.
{
  const campos = (uc: string, mes: string, total: string) =>
    ({ ...CAMPOS_DA_FATURA_VAZIOS, unidade_consumidora: uc, mes_referencia: mes, valor_total_equatorial: total,
       vencimento: '10/10/2026' });
  const UCS = new Set(['000000000000101', '000000000000102', '000000000000103', '000000000000104',
                       '000000000000105', '000000000000106']);
  const fila: ItemDoLote[] = [
    { id: 'a', nome: 'Equatorial_Goias_conta_de_energia_unidade_0101_setembro_2026_segunda_via.pdf', tamanho: 1,
      estado: 'lido', erro: null, campos: campos('101', '09/2026', '412,80') },
    { id: 'b', nome: 'conta-0102.pdf', tamanho: 1, estado: 'lido', erro: null, campos: campos('', '09/2026', '99,10') },
    { id: 'c', nome: 'conta-0103.pdf', tamanho: 1, estado: 'lido', erro: null, campos: campos('103', '09/2026', '87,00') },
    { id: 'd', nome: 'conta-0104.pdf', tamanho: 1, estado: 'registrado', erro: null, campos: campos('104', '09/2026', '120,00') },
    { id: 'e', nome: 'conta-0105.pdf', tamanho: 1, estado: 'lendo', erro: null, campos: null },
    { id: 'f', nome: 'foto-borrada.jpg', tamanho: 1, estado: 'falhou', erro: 'O leitor não achou a tabela da conta.', campos: null },
    { id: 'g', nome: 'conta-0106.pdf', tamanho: 1, estado: 'lido', erro: null, campos: campos('106', '09/2026', '55,00') },
  ];
  const semNada = () => {};
  const html = renderToStaticMarkup(
    <TabelaDaFila itens={fila} ucs={UCS} registrando={false} principal abertaId="c"
                  registrar={semNada} conferir={semNada} remover={semNada} limpar={semNada} />);
  const t = texto(html);
  const linhas = html.split('<tr').length - 2; // o cabecalho e o primeiro `<tr`

  chk('R18a', linhas === 7 && (html.match(/class="marca /g) ?? []).length === 7,
      `a fila desenha as sete linhas, cada uma com a sua Situação (linhas: ${linhas})`);
  chk('R18b', /<button[^>]*class="primario"[^>]*>Registrar 3 contas conferidas<\/button>/.test(html),
      'o laranja da tela e «Registrar N contas conferidas», com o numero das conferidas');
  chk('R18c', html.includes('title="Equatorial_Goias_conta_de_energia_unidade_0101_setembro_2026_segunda_via.pdf"')
          && html.includes('class="fu-nome"'),
      'o nome do arquivo trunca numa linha e leva o nome inteiro no title — ele nao quebra mais a linha em quatro');
  chk('R18d', (html.match(/data-conferir="/g) ?? []).length === 5,
      'toda linha com campos lidos tem «Conferir», e ele carrega o endereco da volta do foco');
  chk('R18e', /Corrigir/.test(t) && /Não leu/.test(t) && /Lendo…/.test(t) && /Registrada/.test(t),
      'os estados dizem a PALAVRA: corrigir, nao leu, lendo, registrada');
  chk('R18f', html.includes('aria-current="true"') && html.includes('class="fu-aberta"'),
      'a linha aberta na gaveta fica marcada na parte da fila que continua a vista');
  chk('R18g', (html.match(/data-rotulo="/g) ?? []).length === 7 * 4,
      'cada dado da linha carrega o proprio rotulo — e o que faz o cartao do celular sem outra marcacao');
  chk('R18h', renderToStaticMarkup(
      <TabelaDaFila itens={[]} ucs={UCS} registrando={false} principal
                    registrar={semNada} conferir={semNada} remover={semNada} limpar={semNada} />) === '',
      'sem fila, nada — uma tabela vazia na primeira dobra seria ruido');
  const naoPrincipal = renderToStaticMarkup(
    <TabelaDaFila itens={fila} ucs={UCS} registrando={false} principal={false}
                  registrar={semNada} conferir={semNada} remover={semNada} limpar={semNada} />);
  chk('R18i', !naoPrincipal.includes('class="primario"'),
      'e quando o passo e outro, o «Registrar N» deixa de ser laranja — um primario por tela');
}

{
  const reg = (id: string, uc: string, cli: string, total: number, over: Partial<RegistroDeFatura> = {}): RegistroDeFatura => ({
    id, numero_uc: uc, competencia: '2026-09-01', cliente_nome: cli, vencimento: '2026-10-10',
    compensada_kwh: '1', tarifa_kwh: '1', desconto_centavos: 500, total_centavos: total, fatura_id: null,
    cobranca_disponivel: true, criado_em: '', atualizado_em: '', ...over,
  });
  const lista = [
    reg('r1', '000000000000101', 'Ana Souza', 111_111),
    reg('r2', '000000000000102', 'Bruno Lima', 22_222),
    reg('r3', '000000000000103', 'Carla Dias', 33_333, { fatura_id: 'f3' }),
    reg('r4', '000000000000104', 'Davi Rocha', 4_444),
    reg('r5', '000000000000105', 'Elisa Prado', 5_555, { competencia: '2026-08-01', fatura_id: 'f5' }),
  ];
  const filtro = { mes: '2026-09', soSemCobranca: false, unidade: null };
  const nada = () => {};
  const base: PropsDasRegistradas = {
    lista, visiveis: filtrarRegistradas(lista, filtro), erro: null, filtro, meses: ['2026-09', '2026-08'],
    parcial: false, aoFiltrar: nada, desmarcadas: new Set(['r4']), aoMarcar: nada, aoMarcarTodas: nada,
    principal: true, revisando: false, aoRevisar: nada, rodada: {}, rodadaIds: [], rodando: false,
    aoGerar: nada, ensaio: {}, ensaiando: null, aoEnsaiar: nada, aoEnsaiarTodas: nada, aoSegundaVia: nada,
    excluindo: null, aoPedirExclusao: nada, aoExcluir: nada, aoVerUnidade: nada,
  };
  const desenharReg = (p: Partial<PropsDasRegistradas> = {}) => renderToStaticMarkup(<TabelaDasRegistradas {...base} {...p} />);

  const html = desenharReg();
  const t = texto(html);
  chk('R19a', /Contas registradas de setembro de 2026/.test(t),
      'o titulo diz O MES da lista — e nao «todas as unidades» com dois meses misturados');
  chk('R19b', /<button[^>]*class="primario"[^>]*>Gerar 2 cobranças<\/button>/.test(html),
      'o «Gerar N cobranças» conta as marcadas sem cobrança (tres sem cobrança, uma desmarcada) e e o laranja');
  chk('R19c', (html.match(/type="checkbox"[^>]*checked=""/g) ?? []).length === 2,
      'as marcadas aparecem marcadas; a ja cobrada nem tem caixa');
  chk('R19d', !/gerar cobrança<\/button>/.test(html) && !/window\.confirm/.test(html),
      'nao ha mais «gerar cobrança» por linha — a cobranca sai pela revisao, uma vez');
  chk('R19e', /Cobrança gerada/.test(t) && (t.match(/Sem cobrança/g) ?? []).length >= 3,
      'a Situacao de cada linha e palavra: sem cobranca ou cobranca gerada');
  chk('R19f', html.includes('aria-label="Excluir o registro de 09/2026 da unidade 000000000000101"')
          && !html.includes('aria-label="Excluir o registro de 09/2026 da unidade 000000000000103"'),
      '«excluir» e um icone com nome proprio no fim da linha, e a ja cobrada nao oferece');
  chk('R19g', !/\bUC\b/.test(t), 'a tela diz «unidade», nunca a sigla');

  const rev = desenharReg({ revisando: true });
  const rt = texto(rev);
  const soRevisao = texto(rev.slice(rev.indexOf('class="serie-revisao"'), rev.indexOf('class="fu-tabela fu-registradas"')));
  chk('R20a', /Gerar 2 cobranças de setembro de 2026\?/.test(soRevisao) && /Ana Souza/.test(soRevisao)
          && /Bruno Lima/.test(soRevisao) && /R\$ 1\.111,11/.test(soRevisao) && !/Davi Rocha/.test(soRevisao),
      'a revisao lista unidade, cliente e valor das MARCADAS — a desmarcada fica fora');
  chk('R20b', /Soma: R\$ 1\.333,33 em 2 contas/.test(rt),
      'e a soma, em centavos somados como inteiros');
  chk('R20c', /Sim, gerar as 2/.test(rt) && /rascunho/.test(rt),
      'o ato nomeia o que faz, e a nota diz que nada vai ao cliente agora');
  chk('R20d', !/>Gerar 2 cobranças<\/button>/.test(rev),
      'com a revisao aberta, o botao de cima some — o proximo clique e o de dentro da revisao');

  const rodando = desenharReg({
    revisando: true, rodando: true, rodadaIds: ['r1', 'r2', 'r4'],
    rodada: { r1: { estado: 'gerada' }, r2: { estado: 'gerando' }, r4: { estado: 'na_vez' } },
  });
  chk('R20e', /Gerando 2 de 3…/.test(texto(rodando)) && !/Sim, gerar/.test(texto(rodando)),
      'durante a rodada a revisao vira placar, e o botao de gerar nao existe para um segundo clique');
  const acabou = desenharReg({
    revisando: true, rodando: false, rodadaIds: ['r1', 'r2'],
    rodada: { r1: { estado: 'gerada' }, r2: { estado: 'recusada', motivo: 'Não vira cobrança: a unidade não tem contrato ativo.' } },
  });
  chk('R20f', /1 de 2 cobranças geradas/.test(texto(acabou)) && /não tem contrato ativo/.test(texto(acabou))
          && acabou.includes('href="/faturas"'),
      'no fim, o placar, o motivo de cada recusa, e o caminho para o passo seguinte');

  const exc = desenharReg({ excluindo: 'r1' });
  chk('R21a', /Excluir o registro de 09\/2026 da unidade 000000000000101 ?\?/.test(texto(exc))
          && /Manter/.test(texto(exc)) && /economia acumulada/.test(texto(exc)),
      'excluir pede confirmacao NA LINHA, dizendo o que sai da economia — sem dialogo do navegador');
  const chip = desenharReg({ filtro: { mes: null, soSemCobranca: false, unidade: '000000000000101' },
                             visiveis: filtrarRegistradas(lista, { mes: null, soSemCobranca: false, unidade: '000000000000101' }) });
  chk('R21b', /Contas registradas da unidade 000000000000101/.test(texto(chip))
          && chip.includes('aria-label="Tirar o filtro da unidade 000000000000101"'),
      'o filtro de unidade e um chip que se tira, e o titulo diz que a lista esta filtrada');
  const vazia = desenharReg({ lista: [], visiveis: [] });
  chk('R21c', /Nenhuma conta registrada ainda/.test(texto(vazia)) && /vira cobrança/.test(texto(vazia)),
      'a lista vazia ensina de onde as linhas vem e para onde vao');

  const gaveta = renderToStaticMarkup(
    <GavetaDaConta titulo="Conferência da conta" sub="Conferindo «conta.pdf»." aoFechar={nada}
                   rodape={<button type="button" className="primario">Registrar este mês</button>}>
      <p>campos</p>
    </GavetaDaConta>);
  chk('R21d', /role="dialog"/.test(gaveta) && /aria-modal="true"/.test(gaveta)
          && /aria-labelledby="fu-gaveta-titulo"/.test(gaveta) && /id="fu-gaveta-titulo"/.test(gaveta),
      'a gaveta e um dialogo modal de verdade, com nome — o titulo dela');
  chk('R21e', gaveta.includes('aria-label="Fechar a conferência"') && /data-foco-inicial/.test(gaveta),
      'fechar tem nome, e o foco sabe onde nascer');
}

// ============================================================================
// R22–R26 — EMISSÃO E COBRANÇA (30/09/2026, etapa 2 do redesenho)
// ============================================================================
//
// Os quatro estados que a crítica de 30/09 pediu, montados: a revisão antes de
// emitir (no lugar do `window.confirm` com `npm run tarifas`), a recusa que diz
// «Completar o endereço» (no lugar de «PagadorSemEndereco» cru e do «Gerar
// boleto» laranja), a confirmação do cancelamento com motivo (no lugar do
// `prompt()`) e o resumo do pagamento (no lugar do `confirm` de um parágrafo).
{
  const nada = () => {};
  const linhas = [
    { id: 'a', unidade: '000401269001287', cliente: 'Ana Souza', vencimento: '2026-10-05', valor_centavos: 123_456 },
    { id: 'b', unidade: '000401269001288', cliente: 'Bruno Lima', vencimento: '2026-10-07', valor_centavos: 10_000 },
  ];
  const antes = renderToStaticMarkup(
    <RevisaoDaSerie tipo="emitir" mes="setembro de 2026" linhas={linhas} estados={{}} emRodada={false} rodando={false}
                    alerta={<div className="aviso alerta">1 de 2 rascunhos sem a tarifa da distribuidora</div>}
                    aoConfirmar={nada} aoFechar={nada} />);
  const ta = texto(antes);
  chk('R22a', /Emitir 2 cobranças de setembro de 2026\?/.test(ta) && /Ana Souza/.test(ta) && /Bruno Lima/.test(ta)
          && /vence 05\/10\/2026/.test(ta) && /R\$ 1\.234,56/.test(ta),
      'a revisao da emissao lista unidade, cliente, vencimento e valor — a primeira emissao da empresa e vista antes');
  chk('R22b', /Soma: R\$ 1\.334,56 em 2 cobranças/.test(ta),
      'e a soma, inteiro com inteiro');
  chk('R22c', /<button[^>]*class="primario"[^>]*>Sim, emitir as 2<\/button>/.test(antes) && /sem a tarifa/.test(ta)
          && !/npm run/.test(ta),
      'o «Sim» e o laranja, o alerta da tarifa vem antes dele, e em portugues — sem comando de terminal');
  chk('R22d', (antes.match(/type="checkbox"[^>]*checked=""/g) ?? []).length === 2,
      'cada linha pode sair da rodada: todas nascem marcadas');

  const placar = renderToStaticMarkup(
    <RevisaoDaSerie tipo="emitir" mes="setembro de 2026" linhas={linhas} emRodada rodando={false}
                    estados={{ a: { estado: 'feita' }, b: { estado: 'recusada', motivo: 'só rascunho pode ser emitida', recusa: null } }}
                    aoConfirmar={nada} aoFechar={nada}
                    proxima={{ rotulo: 'Pedir os 3 boletos', ao: nada }} />);
  chk('R22e', /1 de 2 emitidas/.test(texto(placar)) && /só rascunho pode ser emitida/.test(texto(placar))
          && /<button[^>]*class="primario"[^>]*>Pedir os 3 boletos<\/button>/.test(placar)
          && !/Sim, emitir/.test(texto(placar)),
      'no fim, o placar, o motivo de cada recusa e o PROXIMO PASSO como o laranja: «Pedir os N boletos»');

  // ----------------------------------------------------- a recusa com saida
  const recusa = lerRecusa({ texto: 'PagadorSemEndereco: o banco recusa emitir sem logradouro…', numeroUc: '000401269001287', mes: '2026-09' })!;
  const rec = renderToStaticMarkup(<RecusaNaTela recusa={recusa} primario unidade="000401269001287" />);
  chk('R23a', /Falta o endereço do pagador/.test(texto(rec)) && !/PagadorSemEndereco/.test(texto(rec)),
      'a recusa por endereco vira frase; o codigo cru fica atras do «ver detalhe tecnico», fechado');
  chk('R23b', /<a href="\/unidades\?uc=000401269001287&amp;mes=2026-09"[^>]*class="botao primario"/.test(rec)
          && /Completar o endereço/.test(texto(rec)) && /ver detalhe técnico/.test(texto(rec)),
      '«Completar o endereço» e a acao, e leva a Unidades JA na linha da unidade, com a volta para o mes');

  const deFora = renderToStaticMarkup(
    <RevisaoDaSerie tipo="boletos" mes="setembro de 2026" linhas={[linhas[1]!]} estados={{}} emRodada={false} rodando={false}
                    deFora={[{ id: 'a', unidade: '000401269001287', cliente: 'Ana Souza', recusa }]}
                    aoConfirmar={nada} aoFechar={nada} />);
  chk('R23c', /Pedir 1 boleto ao banco\?/.test(texto(deFora)) && /Fica de fora, porque o banco recusaria/.test(texto(deFora))
          && /Completar o endereço/.test(texto(deFora)) && /Sim, pedir o boleto/.test(texto(deFora)),
      '«Pedir os N boletos» leva so o que o banco aceita, e diz o que ficou de fora com a saida de cada um');

  const prevista = recusaPrevista({ numero_uc: '000401269001287', endereco_logradouro: 'Rua A', endereco_bairro: null,
    endereco_municipio: 'Goiânia', endereco_uf: 'GO', endereco_cep: null }, '2026-09');
  const tp = texto(renderToStaticMarkup(<RecusaNaTela recusa={prevista} />));
  chk('R23d', /O banco vai recusar este boleto/.test(tp) && /bairro e CEP/.test(tp),
      'a recusa que o cadastro ja anuncia e dita ANTES do pedido, nomeando o que falta');

  // painel «O que ainda não chegou ao banco»: a recusa por endereço troca o botão pela saída
  const comEndereco = (extra: Partial<LinhaNaTela> = {}): LinhaNaTela => ({
    ...linhaDaEmissao('insistindo'),
    boleto: { status: 'erro', tentativas: 4, ultimo_erro: 'PagadorSemEndereco: o banco recusa emitir sem endereço.',
              ultima_tentativa_em: null, proxima_tentativa_em: null },
    ...extra,
  });
  const painel = renderToStaticMarkup(<PainelDaEmissao dados={conjuntoDaEmissao([comEndereco()])} pedirBoleto={nada} />);
  chk('R23e', /Completar o endereço/.test(texto(painel)) && !/Pedir o boleto/.test(texto(painel))
          && !/O banco respondeu: PagadorSemEndereco/.test(texto(painel)),
      'na lista do que nao chegou ao banco, a recusa por endereco oferece «Completar o endereço» e NAO '
      + '«Pedir o boleto» — o servidor recusaria de novo pelo mesmo motivo');
  chk('R23f', /<h2[^>]*>.*O que ainda não chegou ao banco<\/h2>/.test(painel),
      'e a lista e uma secao h2 da pagina — o salto h1 → h3 saiu');

  // ------------------------------------------------ a situacao na linha
  const sit = texto(renderToStaticMarkup(
    <SituacaoDaCobranca status="emitida" nota={{ texto: 'Falta o endereço do pagador.', alerta: true }} />));
  chk('R24a', /Emitida/.test(sit) && /Falta o endereço do pagador/.test(sit),
      'o selo «Emitida» ganha o porque embaixo quando a cobranca nao chegou ao banco');

  // --------------------------------- a confirmacao do cancelamento, na linha
  /* [30/09/2026, etapa 4b] A pergunta e a `PerguntaNaTela` de `serie.tsx` — a
     mesma de Contas de luz e das telas que usavam `window.confirm`. O botao que
     desfaz passou de `em-perigo` para a variante da casa, `perigo`. */
  const canc = renderToStaticMarkup(
    <PerguntaNaTela rotulo="Confirmar o cancelamento" tom="perigo"
                    campo={{ rotulo: 'Motivo do cancelamento', linhas: 2 }}
                    manter="Manter a cobrança" confirmar="Cancelar a cobrança" aoManter={nada} aoConfirmar={nada}>
      Cancelar a cobrança da unidade 000401269001287?
    </PerguntaNaTela>);
  chk('R25a', /<textarea/.test(canc) && /Motivo do cancelamento/.test(canc),
      'o motivo do cancelamento e pedido num campo da propria linha — nao num prompt()');
  chk('R25b', /<button[^>]*class="perigo"[^>]*disabled=""[^>]*>Cancelar a cobrança<\/button>/.test(canc)
          && /Manter a cobrança/.test(texto(canc)),
      'e o ato que desfaz nasce travado ate o motivo existir (o servidor recusa sem ele), contornado no vermelho');

  // ------------------------------------------------ o resumo do pagamento
  const baixa = renderToStaticMarkup(
    <ResumoDaBaixa unidade="000401269001287" consumo_centavos={100_000} tarifas_centavos={12_345} juros_centavos={1_000}
                   multa_centavos={500} total_centavos={113_845} data="2026-09-29" observacao="Pix direto"
                   aoVoltar={nada} aoConfirmar={nada} />);
  const tb = texto(baixa);
  chk('R26a', /Registrar o pagamento de R\$ 1\.138,45/.test(tb) && /29\/09\/2026/.test(tb)
          && /Tarifa da distribuidora/.test(tb) && /R\$ 123,45/.test(tb) && /Juros/.test(tb) && /Multa/.test(tb),
      'o pagamento passa por um resumo: valor aberto em parcelas, a data e a observacao');
  chk('R26b', /Não há como desfazer/.test(tb) && /<button[^>]*class="primario"[^>]*>Sim, registrar o pagamento<\/button>/.test(baixa)
          && /Voltar/.test(tb),
      'ele diz que nao se desfaz, e o laranja e o «Sim» DAQUI — nao mais o botao do painel');

  // ---------------------- a Fatura unificada: as perguntas que eram confirm()
  const regs: RegistroDeFatura[] = [{
    id: 'r1', numero_uc: '000000000000101', competencia: '2026-09-01', cliente_nome: 'Ana Souza', vencimento: '2026-10-10',
    compensada_kwh: '1', tarifa_kwh: '1', desconto_centavos: 500, total_centavos: 1000, fatura_id: 'f1',
    cobranca_disponivel: true, criado_em: '', atualizado_em: '',
  }];
  const filtro = { mes: '2026-09', soSemCobranca: false, unidade: null };
  const segunda = renderToStaticMarkup(
    <TabelaDasRegistradas lista={regs} visiveis={regs} erro={null} filtro={filtro} meses={['2026-09']} parcial={false}
                          aoFiltrar={nada} desmarcadas={new Set()} aoMarcar={nada} aoMarcarTodas={nada} principal
                          revisando={false} aoRevisar={nada} rodada={{}} rodadaIds={[]} rodando={false} aoGerar={nada}
                          ensaio={{}} ensaiando={null} aoEnsaiar={nada} aoEnsaiarTodas={nada} aoSegundaVia={nada}
                          emEdicao="unidade 101" confirmandoSegundaVia="r1" aoPedirSegundaVia={nada}
                          excluindo={null} aoPedirExclusao={nada} aoExcluir={nada} aoVerUnidade={nada} />);
  chk('R27a', /Abrir a 2ª via de\s+09\/2026\s+da unidade\s+000000000000101\s*\?/.test(texto(segunda))
          && /unidade 101/.test(texto(segunda)) && /Manter a edição/.test(texto(segunda)),
      'a 2a via pergunta NA LINHA, dizendo qual conta em edicao sai da tela — nao mais um window.confirm');
}

// ============================ R28 o menu lateral (30/09/2026, etapa 3b do redesenho)
//
// A barra do topo virou menu lateral, e as garantias que ela tinha precisam
// continuar de pé no DOM que chega à pessoa: um `<nav>` com nome, um único item
// «página atual», o nome de cada tela presente mesmo com o menu recolhido, a
// ordem do trabalho, e o número do passo dito por extenso para quem ouve.
{
  const menu = (rota: string, recolhido = false) => renderToStaticMarkup(
    <MenuLateral funil={FUNIS.find((f) => f.chave === telaDoCaminho(rota).funil)!} visiveis={FUNIS}
                 tela={telaDoCaminho(rota)} recolhidoInicial={recolhido}
                 pe={(r) => <span className="teste-pe">{r ? 'pe recolhido' : 'pe aberto'}</span>}>
      <h1>Conteudo da tela</h1>
    </MenuLateral>,
  );
  const aberto = menu('/unidades');
  const nav = aberto.slice(aberto.indexOf('<nav'), aberto.indexOf('</nav>'));
  const itens = [...nav.matchAll(/<a [^>]*class="lateral-item[^"]*"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => /<span class="lateral-rotulo">([^<]*)<\/span>/.exec(m[1]!)?.[1]);
  chk('R28a', /<nav class="lateral-nav" aria-label="Financeiro Rateio"/.test(aberto)
          && itens.join(' · ') === 'Mês · Donos de usina · Usinas · Clientes · Unidades consumidoras · Contratos · Contas de luz · Cobranças · Relatórios',
      `o menu do Rateio e um <nav> com o nome do setor, e os itens vem na ordem do trabalho (veio: ${itens.join(' · ')})`);
  const atuais = [...aberto.matchAll(/aria-current="page"/g)].length;
  chk('R28b', atuais === 1 && /<a href="\/unidades" class="lateral-item ativo" aria-current="page">/.test(aberto),
      'um item, e so um, e a pagina atual — e e o da tela aberta, com o desenho de ativo');
  chk('R28c', /aria-expanded="true"[^>]*>Cadastros</.test(aberto) && />O mês, passo a passo</.test(aberto) && />Resultado</.test(aberto)
          && /<ul class="lateral-lista" id="[^"]+" aria-labelledby="[^"]+">/.test(aberto),
      'as secoes tem titulo que e botao com aria-expanded, e cada lista leva o nome do titulo');
  chk('R28d', /class="lateral-passos" aria-hidden="true"[^>]*>1–2</.test(aberto) && /class="so-leitor">, passos 1 e 2 do mês</.test(aberto)
          && /class="lateral-passos" aria-hidden="true"[^>]*>3–4</.test(aberto),
      'Contas de luz mostra «1–2» e Cobrancas «3–4», e o leitor de tela ouve «passos 1 e 2 do mes», nao «um traco dois»');
  chk('R28e', aberto.indexOf('class="pular"') < aberto.indexOf('class="lateral"')
          && /<main id="conteudo" class="conteudo" tabindex="-1"><h1>Conteudo da tela<\/h1><\/main>/.test(aberto),
      '«Pular para o conteudo» e a primeira parada, e a tela entra inteira no <main> — o menu nao toca nela');
  chk('R28f', /aria-label="Recolher o menu"[^>]*title="Recolher o menu/.test(aberto) && /pe aberto/.test(aberto),
      'o botao de recolher tem nome e dica, e o pe recebe o estado aberto');

  const recolhido = menu('/documento', true);
  const nomes = [...recolhido.matchAll(/<span class="lateral-rotulo">([^<]*)<\/span>/g)].map((m) => m[1]);
  chk('R28g', /class="casca recolhida"/.test(recolhido) && nomes.includes('Contas de luz') && nomes.includes('Donos de usina')
          && /data-dica="Contas de luz · passos 1 e 2 do mês"/.test(recolhido)
          && /aria-label="Expandir o menu"/.test(recolhido) && /pe recolhido/.test(recolhido),
      'recolhido, o nome de cada tela CONTINUA no DOM (so sai da vista), a dica leva o passo, e o botao vira «Expandir»');

  const empresa = menu('/contas-a-pagar');
  chk('R28h', /<nav class="lateral-nav" aria-label="Financeiro Empresa"/.test(empresa)
          && /class="lateral-passos" aria-hidden="true"[^>]*>5</.test(empresa) && />Caixa</.test(empresa) && />Apoio</.test(empresa),
      'na Empresa: Caixa e Apoio, e Contas a pagar mostra o passo 5 — o fim do mes do Rateio');
}

export const resultado = () => ({ falhas, feitas });
