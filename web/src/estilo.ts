// O ESTILO INTEIRO, numa string. Sem JSX — e é por isso que ele saiu do `ui.tsx`.
//
// POR QUE ELE MORA NUM `.ts` DESDE 30/07/2026. O `ui.tsx` afirmava duas coisas
// no comentário e nenhuma das duas era verificável, porque o runner do `web/` não
// lê JSX:
//
//   1. "NENHUMA COR LITERAL DAQUI PARA BAIXO" — e havia três, no bloco do
//      documento impresso. Elas estão certas e continuam aqui; o que faltava era
//      alguém dizer que são exceção NOMEADA em vez de descuido;
//   2. desde 30/07, "só quatro ícones se movem, e todo movimento é suspenso por
//      `prefers-reduced-motion`" — que é promessa de acessibilidade, o tipo que
//      se quebra num ajuste de CSS sem ninguém notar.
//
// Com o CSS numa string exportada de um módulo puro, `web/tests/interface.ts`
// confere as duas por leitura do próprio CSS. Regra 8, no lugar onde ela costuma
// não chegar.
//
// O ESTILO CONTINUA NUM <style> INJETADO, e não num .css importado: assim não há
// um segundo pipeline de build para manter. A escolha é a mesma coerência do
// resto — o servidor é `node:http` puro e as rotas são "uma tabela, não um
// framework".
//
// O ACABAMENTO DE 30/07/2026, a pedido do dono, e o que cada princípio virou:
//
//   "limpeza visual"        linha vertical nenhuma na tabela, divisória interna
//                           de contraste 1.16:1, e o cabeçalho recuando por
//                           SUPERFÍCIE (--fundo-recuo) em vez de por linha
//   "profundidade sutil"    três degraus de sombra com nome (--sombra-1/2/3), e
//                           nada fora deles
//   "interatividade"        movimento onde ele INFORMA, e a lista é fechada
//   "iconografia"           Phosphor, exclusivamente — ver `icones.tsx`
//   "input não nativo"      o input de dentro da tabela parece texto até receber
//                           foco, o checkbox virou interruptor, o "OK" virou
//                           botão redondo de ícone
//
// O QUE NÃO MUDOU, de propósito: a estrutura. Mesmas doze telas, mesma ordem,
// mesma tabela nos mesmos lugares. O pedido foi acabamento, e trocar a estrutura
// junto teria custado a familiaridade de quem já opera isto.
//
// ============================================================================
// EM 30/09/2026 O DESENHO DA FATURA UNIFICADA VIROU O DO SISTEMA (etapa 0 do
// redesenho). O que era a ilha `.g3ref` passou a ser a fundação, e cada regra
// geral abaixo foi reescrita na língua dela — não copiada de lá:
//
//   fonte     Inter -> Barlow no corpo, Barlow Semi Condensed em título, aba,
//             botão, rótulo em caixa alta e cabeçalho de tabela
//   raio      12/8/6px -> zero (os tokens continuam, valendo 0)
//   sombra    cartão, KPI, tabela, filtro, aviso e botão ficam SEM; a
//             profundidade é borda de 1px e fundo. Menu e painel que flutuam
//             mantêm o terceiro degrau
//   botões    primário laranja com tinta Navy e rótulo condensado em caixa
//             alta; o comum é contorno fino com tinta Navy; o brilho que
//             atravessava o primário e a ondulação do clique saíram
//   aviso     o filete lateral de 4px saiu — o estado é dito por fundo
//             tingido, contorno de 1px da mesma matiz e o ícone próprio
//
// E A ILHA ENCOLHEU PARA O QUE SÓ ELA TEM: a grade da Fatura unificada, o painel
// navy, a área de envio, as abas de etapa. Tudo o mais que ela repetia — cartão,
// campo, rótulo, botão, aviso, tabela — ela agora HERDA daqui, sem cópia.
//
// A FOLHA IMPRESSA NÃO MUDA. Ela nunca leu token; o que ela herdava era a FONTE
// do `.g3ref` em volta, e essa herança foi cortada: o `.g3` crava a própria.

import { VARIAVEIS_CSS, TIPOGRAFIA } from './tema.ts';

export const ESTILO = `
  ${VARIAVEIS_CSS}

  /* ------------------------------------------------------------------ base */
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fundo); color: var(--texto);
    font: ${TIPOGRAFIA.base}/${TIPOGRAFIA.linha} var(--fonte);
    letter-spacing: ${TIPOGRAFIA.tracking};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  /* AS SUPERFICIES QUE O NAVEGADOR DESENHA SOZINHO tambem falam a paleta: a
     selecao, o cursor de texto, a barra de rolagem e o controle nativo (caixa de
     marcar, radio). Sem isto elas saem no azul do sistema operacional - a unica
     cor da tela que nao e da G3. */
  ::selection { background: var(--acento-suave); color: var(--texto); }
  :root { accent-color: var(--acento-forte); scrollbar-color: var(--borda-forte) var(--fundo); }
  /* --acento-forte, e nao --acento: link e TEXTO, e o laranja da marca como texto
     reprova a restricao 1 do tema em qualquer superficie clara - 2.35:1 no branco
     com o laranja de 28/07, 2.41:1 no creme com o Orange de 06/08.

     O SUBLINHADO ENTROU EM 14/08, E ELE E O SEGUNDO SINAL. A WCAG 1.4.1 exige
     3:1 entre o link e o TEXTO AO REDOR quando a cor e a unica distincao. Medido:
     no claro o link contra o texto da 2,85:1 e no escuro da 1,80:1 - as duas
     reprovam, e a segunda e praticamente invisivel. Um link dentro de frase
     ("Defina o rateio em Unidades") passava a ser uma palavra de tom levemente
     diferente. O sublinhado resolve os dois temas de uma vez e nao depende de
     cor nenhuma. */
  a {
    color: var(--acento-forte);
    text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px;
    transition: color .14s ease, text-decoration-thickness .14s ease;
  }
  a:hover { color: var(--texto); text-decoration-thickness: 2px; }
  code, pre, .mono { font-family: var(--fonte-mono); font-size: .92em; }
  /* Numero em qualquer lugar sai tabular. Fora da tabela tambem: valor que muda
     de largura enquanto atualiza e valor que a pessoa le duas vezes.

     [30/09] A TABELA INTEIRA E O CAMPO ENTRARAM. Com a Inter isto era quase
     indiferente - o algarismo dela ja nasce de largura fixa. O da Barlow nasce
     PROPORCIONAL (o "1" e mais estreito que o "0"), e uma coluna de vencimentos
     ou de kWh sem o "tnum" sai com as casas desencontradas linha a linha. */
  .num, .valor, table, input, .marca { font-variant-numeric: ${TIPOGRAFIA.numero}; }

  /* O ROTULO CAIXA-ALTA E O TITULO saem da condensada. Uma regra por PAPEL, e as
     regras de cada lugar herdam dela em vez de repetir a familia. O botao nao
     esta aqui: a regra dele comeca por "font: inherit", que zeraria esta - ele
     declara a condensada na propria regra, logo depois. */
  h1, h2, h3, .rot-alta, thead th, .kpi .nome, .kpi .valor, .menu-painel .titulo,
  .setor-painel .titulo, .ajuda-secao h3, .marca, .barra-nav a, .marca-app,
  .fu-rotulo, .fu-painel-rot, .fu-secao-tit {
    font-family: var(--fonte-cond);
  }

  /* O ICONE ACOMPANHA O TEXTO. 'block' evita o descolamento de linha de base que
     um svg inline ganha por ser tratado como caractere; o alinhamento fica com o
     flex do contexto, que e quem sabe o tamanho da linha. */
  .ic { display: block; flex: none; transition: transform .16s ease, color .16s ease; }

  /* -------------------------------------------------------------- o topo
     Duas faixas em vez de uma: identidade e sessao em cima, navegacao embaixo.
     Doze telas numa faixa unica com o bloco do usuario ao lado quebravam em duas
     linhas irregulares - o desenho antigo dependia de 'flex-wrap' para caber. */
  .topo { position: sticky; top: 0; z-index: 20; }
  .filete { height: 3px; background: var(--gradiente); }
  /* A FAIXA E NAVY DESDE 06/08, e essa e a mudanca estrutural da paleta nova.
     Antes ela era '--fundo2' - a mesma superficie do cartao -, e sobre uma pagina
     creme isso a deixaria BRANCA: o elemento que deve dominar seria o mais claro
     da tela. Consequencia de leitura, e ela e o ganho: a pagina passou a ter duas
     zonas de peso - a faixa escura, que diz ONDE VOCE ESTA, e o creme, onde o
     trabalho acontece. */
  .barra {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap; row-gap: 6px;
    padding: 9px 20px; background: var(--topo); color: var(--topo-texto);
    border-bottom: 1px solid var(--topo-veu);
  }
  /* Dentro da faixa escura, o que era '--fraco' (medido contra superficie CLARA)
     ficaria ilegivel. Os seletores abaixo existem por isso, e nao por estilo:
     rotulo, select e botao da sessao passaram a pousar no Navy. O branco
     translucido, e nao um token novo, porque ele funciona sobre AS DUAS variantes
     de navy - a do tema claro e a do escuro - sem virar duas cores para manter. */
  .barra .fraco, .barra .sub, .barra label { color: var(--topo-fraco); }
  /* A SETA DO SELETOR DE EMPRESA ESCAPAVA DA REGRA ACIMA, e ela era o unico
     desenho do sistema ainda pintado com tinta de superficie CLARA dentro da
     faixa escura. ".campo-caixa .adorno" puxa "--fraco" e nao tem a classe
     ".fraco", entao o seletor de cima nao a alcancava. Medido em 14/08: 2,20:1
     contra o veu do topo no tema claro - a WCAG 1.4.11 pede 3 para componente
     nao-textual. Com "--topo-fraco": 4,52:1 no claro e 5,04:1 no escuro. */
  .barra .campo-caixa .adorno, .barra .campo-caixa .adorno-esquerda { color: var(--topo-fraco); }
  .barra .campo-caixa select, .barra button {
    background: var(--topo-veu); color: var(--topo-texto);
    border-color: var(--topo-veu-forte);
  }
  .barra button:hover:not(:disabled) {
    background: var(--topo-veu-forte); color: var(--topo-texto);
    border-color: var(--topo-veu-forte);
  }
  /* A MARCA NA CONDENSADA, e um degrau acima do corpo: e o nome do sistema, e
     ele pesa como o titulo de um cartao da referencia. */
  .marca-app {
    display: inline-flex; align-items: center; gap: 9px;
    font-weight: 600; font-size: 18px; letter-spacing: .01em;
  }
  .marca-app .logotipo { flex: none; }
  /* O SELETOR DE SETOR (27/09/2026), no desenho de migalha do Supabase:
     "Financeiro G3 / Rateio" e o par de setas que abre a lista. Substituiu as
     duas pilulas de 22/09 - o porque esta em "seletor-de-setor.tsx".

     A BARRA INCLINADA E UM FILETE DE 1px GIRADO, e nao o caractere "/": a barra
     da fonte muda de peso e de altura com a familia tipografica, e o filete fica
     igual nos dois temas e em qualquer zoom. A margem negativa come parte do
     "gap" da faixa - sem ela a marca e o setor pareceriam dois blocos soltos, e
     nao um endereco. */
  .migalha {
    flex: none; width: 1px; height: 20px; margin: 0 -4px;
    background: var(--topo-veu-forte); transform: rotate(20deg);
  }
  .setor { position: relative; flex: none; }
  /* O GATILHO E TEXTO, e nao botao pesado: fundo so no hover e com a lista
     aberta. O nome do setor pesa como a marca, porque e a segunda metade do
     mesmo endereco. O desenho do setor leva o Orange sobre o Navy - o mesmo par
     da aba ativa, 5,93:1 -, e as setas ficam no "--topo-fraco" ate o ponteiro
     chegar: elas sao o convite, nao a informacao. */
  .barra .setor-gatilho {
    gap: 7px; padding: 5px 8px 5px 9px;
    background: transparent; border-color: transparent; box-shadow: none;
    color: var(--topo-texto); font-size: 17px; font-weight: 600; letter-spacing: .01em;
  }
  .barra .setor-gatilho:hover:not(:disabled), .barra .setor-gatilho[aria-expanded="true"] {
    background: var(--topo-veu); border-color: var(--topo-veu-forte);
    color: var(--topo-texto); box-shadow: none; transform: none;
  }
  .setor-gatilho .setor-simbolo { color: var(--acento); }
  .setor-gatilho .setor-setas { color: var(--topo-fraco); transition: color .16s ease; }
  .setor-gatilho:hover .setor-setas, .setor-gatilho[aria-expanded="true"] .setor-setas {
    color: var(--topo-texto);
  }
  /* A LISTA FLUTUA como o menu da conta - mesma superficie, borda, sombra do
     terceiro degrau e entrada -, mas abre para a DIREITA a partir do gatilho,
     porque ela mora no comeco da faixa e o menu da conta, no fim. */
  .setor-painel {
    position: absolute; left: 0; top: calc(100% + 8px); z-index: 30;
    width: 324px; padding: 6px;
    background: var(--fundo2); color: var(--texto);
    border: 1px solid var(--borda); border-radius: var(--raio-cartao); box-shadow: var(--sombra-3);
    animation: descer-suave .14s ease-out;
  }
  .setor-painel .titulo { padding: 7px 10px 6px; color: var(--fraco); }
  .setor-painel ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .setor-item {
    display: flex; align-items: center; gap: 11px; padding: 8px 10px;
    border-radius: var(--raio-pequeno); color: var(--texto); text-decoration: none;
    transition: background-color .14s ease;
  }
  .setor-item:hover, .setor-item:focus-visible { background: var(--fundo-hover); color: var(--texto); }
  /* O anel do teclado vai PARA DENTRO: com o afastamento de 2px da regra geral
     ele encostava na borda da lista e parecia cortado. */
  .setor-item:focus-visible { outline-offset: -2px; }
  /* O SELO: o desenho do setor num quadrado de acento suave - o papel que o
     avatar do projeto tem no Supabase. E o que o olho encontra antes do nome. */
  .setor-selo {
    flex: none; display: grid; place-items: center; width: 32px; height: 32px;
    border-radius: var(--raio-pequeno); background: var(--acento-suave); color: var(--acento-forte);
  }
  .setor-texto { display: grid; gap: 1px; min-width: 0; }
  .setor-texto strong { font-size: var(--t-corpo); font-weight: 600; }
  .setor-texto span { font-size: var(--t-meta); color: var(--fraco); }
  .setor-marca { margin-left: auto; flex: none; color: var(--acento-forte); }
  /* AS DUAS PASTAS DO MENU (30/09/2026): «Setores financeiros» e «Administração da
     plataforma». A segunda se separa por uma linha suave e pelo proprio titulo -
     nenhuma cor nova: e a mesma lista, com outro assunto. */
  .setor-pasta + .setor-pasta { border-top: 1px solid var(--borda-suave); margin-top: 6px; padding-top: 4px; }
  /* EM TELA ESTREITA A LISTA OCUPA A LARGURA DA FAIXA. Presa ao gatilho, que
     fica a uns 180px da borda, ela passaria da tela num celular de 375px. */
  @media (max-width: 600px) {
    .barra { position: relative; }
    .setor { position: static; }
    .setor-painel { left: 16px; right: 16px; width: auto; top: calc(100% + 6px); }
  }
  .sessao { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: var(--t-meta); }
  .sessao .campo-caixa select { width: auto; max-width: 260px; padding: 5px 30px 5px 10px; }
  /* O nome de quem esta logado sai em tela estreita: o icone do menu continua
     clicavel e o nome esta dentro dele, no bloco de identidade. */
  @media (max-width: 720px) { .so-largo { display: none; } }

  /* A NAVEGACAO. O item ativo nao e uma aba: e um filete de marca embaixo mais um
     esfumado do --acento-suave subindo do rodape do item. A borda inferior de
     2px existe em TODOS os itens, transparente nos inativos - sem isso o ativo
     empurraria os vizinhos 2px para cima ao trocar de tela.

     [30/09] A ABA FALA COMO AS ABAS DE ETAPA DA REFERENCIA: condensada, caixa
     alta, tracking aberto. A sombra de baixo saiu - a faixa se separa do creme
     pela propria cor, que e o que ela faz na referencia. 13px e nao os 15px da
     aba de etapa: aqui sao nove abas numa linha, e caixa alta e mais larga que
     minusculo. A medida foi tirada, nao escolhida: com 13.5px e tracking .05em a
     barra do Rateio passava 49px da tela de 1280 e rolava para o lado; com 13px e
     .04em ela cabe nos 1280 como cabia com a Inter. */
  .barra-nav {
    display: flex; align-items: stretch; gap: 1px; overflow-x: auto;
    padding: 0 12px; background: var(--topo);
    border-bottom: 1px solid var(--borda);
    scrollbar-width: thin; scrollbar-color: var(--topo-veu-forte) transparent;
  }
  .barra-nav a {
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
    padding: 10px 10px 9px; text-decoration: none; color: var(--topo-fraco);
    font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    border-bottom: 2px solid transparent; border-radius: var(--raio-pequeno) var(--raio-pequeno) 0 0;
    transition: color .16s ease, background-color .16s ease, border-color .16s ease;
  }
  .barra-nav a:hover { color: var(--topo-texto); background: var(--topo-veu); }
  .barra-nav a:hover .ic { transform: translateY(-1px) scale(1.08); }
  /* O ATIVO E O ORANGE SOBRE O NAVY, e aqui ele NAO usa o '--acento-forte':
     aquele token existe para o laranja pousar em superficie CLARA. Sobre a faixa
     escura o Orange entregue vale como esta - 5.93:1. O esfumado de baixo saiu
     junto: sobre escuro ele virava borrao, e quem carrega o sinal sao a cor e o
     filete de 2px. */
  .barra-nav a.ativo {
    color: var(--acento);
    border-bottom-color: var(--acento);
    background: var(--topo-ativo);
  }
  .barra-nav a.ativo .ic { color: var(--acento); }
  /* A divisoria onde o grupo muda dentro do funil (cadastro | dinheiro no Rateio,
     dinheiro | apoio na Empresa). A fronteira e dado ('grupo', em navegacao.ts) e
     ate 29/07 era invisivel: doze abas iguais em fila. */
  .barra-nav .divisor { width: 1px; background: var(--topo-veu-forte); margin: 9px 9px; flex: none; }

  /* -------------------------------------------------- o menu suspenso
     Usado pela area do usuario e pelo seletor de tema. Sombra do terceiro degrau
     porque ele FLUTUA sobre tudo - e a profundidade e o que diz "isto fecha ao
     clicar fora", sem precisar de instrucao. */
  .menu { position: relative; }
  .menu > button { display: inline-flex; align-items: center; gap: 7px; }
  .menu-painel {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
    min-width: 216px; padding: 6px;
    background: var(--fundo2); border: 1px solid var(--borda);
    border-radius: var(--raio-cartao); box-shadow: var(--sombra-3);
    animation: descer-suave .14s ease-out;
  }
  .menu-painel .titulo { padding: 7px 10px 5px; color: var(--fraco); }
  .menu-painel hr { border: 0; border-top: 1px solid var(--borda-suave); margin: 5px 4px; }
  .menu-painel button, .menu-painel .item {
    display: flex; align-items: center; gap: 9px; width: 100%;
    padding: 8px 10px; border: 0; border-radius: var(--raio-pequeno);
    background: none; box-shadow: none; color: var(--texto);
    font: inherit; font-size: var(--t-corpo); letter-spacing: normal; text-transform: none;
    text-align: left; cursor: pointer;
  }
  .menu-painel button:hover:not(:disabled) {
    background: var(--fundo-hover); color: var(--texto); border-color: transparent; transform: none;
  }
  .menu-painel button[aria-checked="true"] { color: var(--acento-forte); font-weight: 600; }
  .menu-painel .item { cursor: default; color: var(--fraco); }
  .menu-painel .ao-fim { margin-left: auto; }
  /* O bloco de identidade no alto do menu: quem esta logado e em qual empresa. */
  .menu-painel .quem { padding: 4px 10px 8px; }
  .menu-painel .quem strong { display: block; font-size: var(--t-corpo); }
  .menu-painel .quem span { font-size: var(--t-meta); color: var(--fraco); }

  /* ------------------------------------------- o gatilho da central de ajuda
     O BOTAO DESCEU DA BARRA DO TOPO PARA O CANTO INFERIOR DIREITO em 21/08/2026,
     por pedido do dono. O motivo inteiro esta no cabecalho de ajuda-gatilho.tsx; o que
     importa aqui e a mecanica:

       z-index 30    acima do conteudo e do menu da conta, ABAIXO do veu do
                     painel (40) e do painel (41). Aberto o painel, o botao
                     continua no DOM — sumir com ele largaria o foco do teclado
                     no nada — e some sob o veu, que e o comportamento normal de
                     tudo que fica atras de um dialogo;
       bottom 22px   o .conteudo ja reservava 80px de respiro no rodape, entao
                     o botao nao tapa a ultima linha de nenhuma tabela;
       primario      herda o laranja da marca e o hover do resto do sistema.
                     Ver o cabecalho do componente.

     [30/09] QUADRADO E SEM SOMBRA, como tudo que o g3ref desenha. Era um circulo
     de 54px com a sombra do terceiro degrau - a unica bolha flutuante da tela, e
     o que mais denunciava "outro sistema" ao lado dos cartoes quadrados. O que o
     separa do conteudo embaixo agora e o bloco cheio de laranja com o contorno
     Navy de 1px, que se le sobre o creme, sobre o branco e sobre a faixa. A regra
     de hover antiga pedia "box-shadow: var(--sombra-forte)", que e uma COR e nao
     uma sombra: a declaracao era invalida e nunca valeu. */
  .ajuda-gatilho {
    position: fixed; right: 22px; bottom: 22px; z-index: 30;
    width: 48px; height: 48px; padding: 0;
  }
  /* A especificidade e a do primario MAIS UMA classe: o contorno Navy tem de
     vencer o "border-color: var(--acento)" dele nos dois estados. */
  button.primario.ajuda-gatilho,
  button.primario.ajuda-gatilho:hover:not(:disabled) { border-color: var(--acento-texto); }

  /* O BALAO DE PRIMEIRA VISITA. Um icone sozinho num canto e mudo, e quem entra
     pela primeira vez nao tem por que saber que aquele desenho responde
     perguntas. NAO E MODAL de proposito: nao escurece a tela, nao prende foco e
     nao impede clicar em nada atras — um aviso que interrompe o trabalho para
     dizer "existe ajuda" e o contrario de ajudar. */
  .ajuda-balao {
    position: fixed; right: 22px; bottom: 90px; z-index: 31;
    width: min(258px, calc(100vw - 40px));
    padding: 11px 26px 12px 13px;
    background: var(--fundo); color: var(--texto);
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    box-shadow: var(--sombra-3);
    animation: ajuda-subir .32s ease-out both;
    /* A ORIGEM E O CANTO DE BAIXO A DIREITA, que e onde o botao esta: e o que
       faz o balao parecer SUBIR DELE em vez de aparecer solto no ar. */
    transform-origin: bottom right;
  }
  .ajuda-balao strong { display: block; font-size: var(--t-ui); }
  .ajuda-balao p { margin: 3px 0 0; font-size: var(--t-meta); line-height: 1.5; color: var(--fraco); }
  /* O "x" BEM PEQUENO, no canto superior direito — pedido ao pe da letra. Mesmo
     pequeno ele tem 20px de alvo e nome acessivel: um alvo minusculo sem nome e
     enfeite, nao botao de fechar. */
  .ajuda-balao-x {
    position: absolute; top: 3px; right: 3px;
    width: 20px; height: 20px; padding: 0; flex: none;
    border-radius: var(--raio); border-color: transparent;
    background: none; box-shadow: none; color: var(--fraco);
  }
  .ajuda-balao-x:hover:not(:disabled) {
    background: var(--fundo-hover); color: var(--texto);
    border-color: transparent; transform: none; box-shadow: none;
  }

  /* AS DUAS BOLHAS DO PENSAMENTO, ligando o botao ao balao. Elas sobem em ordem,
     da menor (junto do botao) para a maior (junto do balao) — e o atraso e o que
     desenha o movimento de subida em vez de tres coisas piscando juntas.

     ELAS SAO LARANJA E NAO BRANCAS, e isto foi MEDIDO num render de verdade: com
     a cor do balao, duas bolinhas de 8 e 12px ficavam brancas sobre o creme da
     pagina e dentro da sombra do proprio balao — invisiveis. A convencao do
     quadrinho diz que a cauda e da cor do balao; aqui a cauda tinha de ser vista,
     e a cor do BOTAO diz melhor o que ela quer dizer: isto sobe DALI. */
  .ajuda-bolha {
    position: fixed; z-index: 31; display: block;
    background: var(--acento); border-radius: var(--raio-pilula);
    animation: ajuda-subir .3s ease-out both;
  }
  /* As bolhas sao a EXCECAO NOMEADA do raio zero (I8c): a cauda de um balao de
     pensamento e redonda por natureza, e quadrada ela deixaria de ser cauda. */
  .ajuda-bolha-1 { right: 36px; bottom: 73px; width: 8px; height: 8px; animation-delay: .05s; }
  .ajuda-bolha-2 { right: 28px; bottom: 81px; width: 12px; height: 12px; animation-delay: .13s; }

  @keyframes ajuda-subir {
    from { opacity: 0; transform: translateY(10px) scale(.92); }
  }

  /* ------------------------------------------------------ central de ajuda
     Painel que abre POR CIMA e nao uma tela: quem trava no meio de um cadastro
     nao pode perder o lugar (e o filtro) para ler como preencher.

     O VEU USA --topo, que e o navy da barra, e nao --topo-veu: aquele e um veu
     BRANCO, feito para clarear sobre o navy. Aqui e o contrario - escurecer a
     pagina - e o navy e a unica cor escura que vale nos dois temas. A mistura e
     feita com color-mix e nao com uma cor de canal alfa escrita a mao, porque
     cor literal fora do documento impresso e recusada pela suite (I1b).

     DUAS ARMADILHAS DESTE BLOCO, as duas pagas na primeira escrita:
       - CRASE fecha a string. O CSS inteiro vive num template literal;
       - escrever o NOME da funcao de cor com canal alfa, mesmo dentro de um
         comentario, e achado pela I1b - ela varre o CSS como texto, e nao
         distingue comentario de regra. E acertado que nao distinga. */
  .ajuda-fundo {
    position: fixed; inset: 0; z-index: 40;
    background: color-mix(in srgb, var(--topo) 55%, transparent);
    animation: surgir .14s ease-out;
  }
  .ajuda-painel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
    width: min(460px, 100vw);
    display: flex; flex-direction: column;
    background: var(--fundo); border-left: 1px solid var(--borda);
    box-shadow: var(--sombra-3);
    animation: entrar-da-direita .18s ease-out;
  }
  .ajuda-topo {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 14px 16px;
    border-bottom: 1px solid var(--borda); background: var(--fundo2);
  }
  .ajuda-corpo { overflow-y: auto; padding: 14px 16px 40px; }
  .ajuda-secao { margin-top: 20px; }
  .ajuda-secao h3 {
    font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso); text-transform: uppercase;
    letter-spacing: var(--rotulo-tracking); color: var(--fraco); margin: 0 0 9px;
  }
  .ajuda-nota { font-size: var(--t-meta); line-height: 1.55; margin: 0 0 10px; }

  /* O ESTADO AO VIVO. Uma linha por pendencia real do mes, com o numero dentro
     da frase - "11 de 29 pendentes" - e o botao que leva ao lugar de resolver. */
  .ajuda-passos { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .ajuda-passos li {
    display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
    padding: 10px 12px; border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno); background: var(--fundo2);
  }
  .ajuda-frase { font-size: var(--t-ui); line-height: 1.45; flex: 1 1 200px; }
  .ajuda-efeito {
    font-size: var(--rotulo-tamanho); padding: 2px 8px; border-radius: var(--raio-pequeno);
    background: var(--alerta-fundo); color: var(--alerta); white-space: nowrap;
  }
  .ajuda-ir {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; font-size: var(--t-ui); font-weight: 600;
    border: 1px solid var(--borda); border-radius: var(--raio-pequeno);
    background: var(--fundo); color: var(--acento-forte); cursor: pointer;
  }
  /* ":hover:not(:disabled)" e nao ":hover": o hover do botao generico e (0,2,1) e
     ganharia desta, trocando a tinta laranja pelo Navy. Ver a I7 da suite. */
  .ajuda-ir:hover:not(:disabled) { background: var(--acento-suave); border-color: var(--acento-forte); color: var(--acento-forte); }
  /* A seta do botao aponta para a DIREITA: o desenho reusado e o "descer" do
     resto do sistema, girado - um icone proprio so para isto seria mais um nome
     na uniao fechada para dizer a mesma coisa. */
  .ajuda-ir .ic { transform: rotate(-90deg); }

  /* O CAMINHO DE "VER" E MAIS LEVE QUE O DE "RESOLVER", e a diferenca nao e
     decoracao: um leva ao formulario onde o dado ENTRA, o outro a tela onde ele
     so APARECE. Pintar os dois iguais mandaria alguem procurar em Usinas um
     campo de energia gerada que nao existe la - nem em lugar nenhum, porque
     aquele numero e espelhado do CRM. */
  .ajuda-ir-ver { color: var(--fraco); font-weight: 500; }
  .ajuda-ir-ver:hover:not(:disabled) { color: var(--acento-forte); }

  /* Os botoes de caminho quebram linha em vez de esticarem a coluna: um rotulo
     como "Antes: confirmar o CPF ou CNPJ" nao cabe ao lado de outro em 460px. */
  .ajuda-caminhos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }

  .ajuda-tudo-certo {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--t-ui); color: var(--ok); margin: 0;
  }

  /* UM ASSUNTO. Fechado por padrao para a lista ser varrivel - quem reconhece a
     propria pergunta abre uma, e nao le quatro. */
  .ajuda-topico { border-bottom: 1px solid var(--borda-suave); }
  .ajuda-topico:last-child { border-bottom: 0; }
  /* O 'justify-content: flex-start' NAO E REDUNDANTE com o 'text-align: left', e a
     falta dele foi um defeito de verdade, achado fotografando o painel em
     21/08: a regra base de 'button' e 'justify-content: center', e um flex
     centrado empurra a linha inteira para o meio. O 'text-align' so governa o
     texto DENTRO da caixa; quem posiciona a caixa e o flex. O resultado eram sete
     perguntas comecando cada uma num recuo diferente, conforme o comprimento —
     numa lista feita para ser VARRIDA, que e o pior lugar para isso. */
  .ajuda-pergunta {
    display: flex; align-items: flex-start; justify-content: flex-start;
    gap: 8px; width: 100%;
    padding: 10px 2px; border: 0; background: none; box-shadow: none;
    color: var(--texto); font: inherit; font-size: var(--t-corpo); font-weight: 600;
    letter-spacing: normal; text-transform: none; text-align: left; cursor: pointer;
  }
  .ajuda-pergunta:hover:not(:disabled) { color: var(--acento-forte); }
  .ajuda-pergunta .ic { margin-top: 3px; flex: none; }
  .ajuda-resposta { padding: 0 2px 14px 22px; font-size: var(--t-ui); line-height: 1.6; }
  .ajuda-resposta p { margin: 0 0 10px; color: var(--fraco); }
  .ajuda-resposta ol { margin: 0 0 12px; padding-left: 18px; display: grid; gap: 6px; }
  /* O PORQUE E VISUALMENTE DIFERENTE DO RESTO, e nao por enfeite: ele responde
     outra pergunta que a resposta e os passos. A linha a esquerda o separa sem
     pedir uma cor propria - o painel ja tem cores demais disputando atencao.
     [30/09] 1px da linha forte, e nao mais 2px da comum: o filete fino e o da
     referencia, e o tom um degrau acima devolve a presenca que a espessura
     levou. */
  .ajuda-porque {
    border-left: 1px solid var(--borda-forte);
    padding: 2px 0 2px 10px;
    margin: 0 0 12px !important;
  }
  .ajuda-porque strong { color: var(--texto); font-weight: 600; }

  /* O PORQUE DENTRO DO CAMPO. O botao mora no <label> e por isso o label vira
     flex - sem isso o icone cai numa linha propria e o rotulo parece quebrado. */
  label:has(.campo-porque-botao) { display: inline-flex; align-items: center; gap: 6px; }
  /* [30/09] O HOVER PINTAVA "--acento" SOBRE O CARTAO CLARO: 2,69:1, abaixo dos
     3:1 que icone de controle pede (WCAG 1.4.11). E o fundo pedia
     "--fundo-suave", um token que nunca existiu - a declaracao caia inteira. */
  .campo-porque-botao {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; padding: 0;
    border: none; background: none; cursor: pointer;
    color: var(--fraco); border-radius: var(--raio); flex: none;
  }
  .campo-porque-botao:hover:not(:disabled) { color: var(--acento-forte); background: var(--fundo-hover); }
  .campo-porque-botao[aria-expanded="true"] { color: var(--acento-forte); }
  /* O caminho que SAI do sistema: sublinhado ao passar, para parecer link e nao
     botao, e sem o tom de acao primaria - ele leva para fora, nao resolve aqui. */
  /* A LIGACAO PARA O OUTRO SISTEMA DENTRO DE UMA TABELA. Discreta por padrao e
     nomeada ao passar: numa lista de quatro linhas, quatro links coloridos
     competiriam com o dado. A dica do title diz o que se faz la, porque "geração"
     sozinho e rotulo e nao ato.

     SEM CRASE NESTE COMENTARIO, e nao e estilo: o arquivo inteiro e um template
     literal, e uma crase aqui FECHA a folha de estilo no meio - o build morre
     em "',' expected" numa linha que nao tem virgula nenhuma. */
  .ligacao-crm {
    display: inline-flex; align-items: center; gap: 3px;
    margin-left: 8px; padding: 1px 5px;
    font-size: var(--rotulo-tamanho); color: var(--fraco); text-decoration: none;
    border: 1px solid var(--borda); border-radius: var(--raio-pequeno); vertical-align: middle;
  }
  .ligacao-crm:hover { color: var(--acento-forte); border-color: var(--acento-forte); }
  .ligacao-crm-texto { letter-spacing: .02em; }
  .ajuda-ir-crm { text-decoration: none; }
  .ajuda-ir-crm:hover { text-decoration: underline; }
  .campo-porque {
    margin: 6px 0 0; padding: 8px 10px;
    font-size: var(--t-meta); line-height: 1.55; color: var(--fraco);
    background: var(--fundo-recuo); border-left: 1px solid var(--borda-forte); border-radius: var(--raio);
  }

  .ajuda-termo { padding: 9px 0; border-bottom: 1px solid var(--borda-suave); }
  .ajuda-termo:last-child { border-bottom: 0; }
  .ajuda-termo strong { display: block; font-size: var(--t-corpo); }
  .ajuda-termo p { margin: 4px 0 0; font-size: var(--t-ui); line-height: 1.6; color: var(--fraco); }

  @keyframes entrar-da-direita { from { transform: translateX(16px); opacity: 0; } }
  @keyframes surgir { from { opacity: 0; } }

  /* --------------------------------------------------- conteudo e tipografia
     O titulo ganhou peso e corpo (24 -> 27px, 650 -> 700) e a descricao encolheu
     e ficou mais discreta: era o pedido de hierarquia de 30/07.

     [30/09] OS TRES TITULOS SAO DA CONDENSADA, a 600 - o peso que a referencia usa
     no titulo do cartao ("Conferencia dos dados", 22px). A condensada a 700 em
     30px vira cartaz; a 600 continua sendo titulo de tela de trabalho. Tracking
     neutro: a Barlow nao pede o aperto que a Inter pedia em tamanho grande.

     A DESCRICAO VOLTOU AO CORPO (13.5 -> 15px) e ganhou medida de leitura. Ela e
     a unica prosa de toda tela, e o pedido desta etapa foi texto corrido nunca
     abaixo de 13px; o "82ch" antigo, com a Barlow mais estreita, passava de 90
     caracteres por linha. */
  .conteudo { max-width: var(--largura); margin: 0 auto; padding: 28px 20px 80px; }
  h1 { font-size: var(--t-h1); font-weight: 600; line-height: 1.1; margin: 0 0 6px; letter-spacing: 0; }
  h2 {
    font-size: var(--t-h2); font-weight: 600; line-height: 1.2; margin: 30px 0 11px; letter-spacing: 0;
    display: flex; align-items: center; gap: 8px;
  }
  h3 { font-size: var(--t-h3); font-weight: 600; line-height: 1.25; margin: 0 0 8px; }
  .sub { color: var(--fraco); margin: 0 0 22px; font-size: var(--t-corpo); max-width: 72ch; }
  .fraco { color: var(--fraco); }

  /* ---------------------------------------------------------- superficies
     [30/09] O CARTAO DA REFERENCIA: branco sobre o creme, 1px de linha, canto reto
     e nenhuma sombra. O respiro subiu de 16 para 20px - a referencia usa 22 e 26,
     e esta e a medida que ainda cabe tela de lista. */
  .cartao {
    border: 1px solid var(--borda); border-radius: var(--raio-cartao); padding: 20px;
    background: var(--fundo2);
  }
  /* O RITMO ENTRE SECOES SAI DE UM TOKEN desde 14/08. Ele era o literal
     "style={{ marginBottom: 20 }}" escrito a mao DEZESSETE vezes em dez telas, e
     a aba Documento empilhava com "var(--gap)" (12px) - os dois valores na MESMA
     pagina. Uma classe, um token, e o proximo cartao para de escolher um terceiro
     numero. */
  .secao { margin-bottom: var(--gap-secao); }
  .rolagem {
    overflow-x: auto; border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); scrollbar-color: var(--borda-forte) transparent;
  }
  .vazio { padding: 40px 32px; text-align: center; color: var(--fraco); font-size: var(--t-corpo); }

  /* -------------------------------------------------------------- tabela
     LINHA VERTICAL NENHUMA, e a horizontal e a --borda-suave (1.16:1 contra o
     branco): ela separa sem desenhar grade. O cabecalho nao se separa por linha
     e sim por SUPERFICIE - o --fundo-recuo, que e a terceira cor da paleta da G3
     e ate 29/07 estava sem uso. */
  table { width: 100%; border-collapse: collapse; font-size: var(--t-corpo); }
  th, td { text-align: left; vertical-align: top; }
  /* O ROTULO CAIXA-ALTA SAI DE UM TOKEN SO desde 14/08. Eram cinco combinacoes de
     peso e tracking para o mesmo papel - ver a nota de "rotuloTamanho" no
     "tema.ts". Esta e a definicao; as outras regras a herdam.
     [30/09] A secao da Fatura unificada (".fu-secao-tit") e a legenda da ajuda
     entraram na lista: eram o mesmo papel com o tamanho e o tracking escritos a
     mao na ilha. */
  .rot-alta, thead th, .kpi .nome, .menu-painel .titulo, .fu-rotulo, .fu-painel-rot, .fu-secao-tit {
    font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
    text-transform: uppercase; letter-spacing: var(--rotulo-tracking); line-height: 1.3;
  }
  thead th {
    padding: 10px 14px; background: var(--fundo-recuo); color: var(--fraco);
    border-bottom: 1px solid var(--borda); white-space: nowrap;
  }
  tbody td { padding: 13px 14px; border-bottom: 1px solid var(--borda-suave); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr { transition: background-color .12s ease; }
  tbody tr:hover { background: var(--fundo-hover); }
  td.num, th.num { text-align: right; }

  /* Cabecalho ordenavel: o th vira botao sem deixar de parecer cabecalho. */
  th .ordenar {
    background: none; border: 0; padding: 0; box-shadow: none; font: inherit; color: inherit;
    text-transform: inherit; letter-spacing: inherit; font-weight: inherit; cursor: pointer;
    display: inline-flex; align-items: center; gap: 3px;
  }
  th .ordenar:hover { color: var(--texto); background: none; transform: none; border-color: transparent; }
  /* A SETA DE ORDENACAO ERA "opacity: .4", e ela e o UNICO sinal de que a coluna
     e ordenavel. Medido em 14/08: o "--fraco" a 40% sobre o "--fundo-recuo" do
     cabecalho da 1,68:1 no claro e 2,04:1 no escuro - a WCAG 1.4.11 pede 3. E o
     estado de repouso e o de onze das doze colunas de qualquer tabela.
     Opacidade sobre superficie produz uma cor que nenhum teste conhece; o token
     puro ja esta medido em T1 (4,52:1 sobre o recuo). */
  th .ordenar .ic { color: var(--fraco); }
  th[aria-sort] .ordenar { color: var(--acento-forte); }
  th[aria-sort] .ordenar .ic { color: var(--acento-forte); }

  /* ---------------------------------------------------------- formulario */
  /* [30/09] O CAMPO DA REFERENCIA. Rotulo em Barlow, tinta apagada, sem caixa
     alta - o rotulo de campo nao e o de secao. O campo afunda um tom do cartao
     ("--campo") em vez de ser branco sobre branco: e o fundo que o anuncia, e a
     linha de 1px so o contorna. Sem raio. */
  .campos { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  label { display: block; font-size: var(--t-meta); font-weight: 500; color: var(--fraco); margin-bottom: 5px; }
  input, select, textarea {
    width: 100%; padding: 8px 10px; border: 1px solid var(--borda); border-radius: var(--raio);
    background: var(--campo); color: var(--texto); font: inherit; font-size: var(--t-corpo);
    line-height: 1.3; caret-color: var(--acento-forte);
    transition: border-color .14s ease, background-color .14s ease;
  }
  /* SEM "opacity". O "--fraco" sozinho da 5,56:1 no claro e 5,10:1 no escuro e
     passa; com o alfa de 0,75 ele caia para 3,28:1 e 3,54:1, e placeholder e
     TEXTO - nao tem a isencao que controle inativo tem. O que separa a dica do
     valor digitado continua existindo: o valor e "--texto", e a distancia entre
     os dois e a mesma de sempre. */
  input::placeholder, textarea::placeholder { color: var(--fraco); }
  /* "textarea" ENTROU NAS TRES LISTAS em 14/08. Ela estava na regra base e na de
     foco e faltava no hover e no desabilitado - e as tres caixas da aba Documento
     (instrucoes, linha digitavel, PIX copia-e-cola) sao textareas. */
  input:hover:not(:disabled), select:hover:not(:disabled), textarea:hover:not(:disabled) {
    border-color: var(--borda-forte);
  }
  /* O FOCO E O DA REFERENCIA - 2px cheios, rente a borda, sem o halo de 3px em
     "box-shadow" que a casa usava - mas na cor do sistema: "--foco", o unico
     token medido a 3:1 contra toda superficie (T2). A referencia desenha este
     anel com o laranja cru, 2,41:1 sobre o creme. */
  input:focus, select:focus, textarea:focus {
    outline: 2px solid var(--foco); outline-offset: 0; border-color: var(--borda);
  }
  /* DESABILITADO E TOKEN, E NAO OPACIDADE. "opacity: .55" sobre o cartao dava
     3,70:1; e no botao primario, onde o alfa cai sobre o proprio acento, dava
     2,83:1 no claro e 1,85:1 no escuro - um rotulo que nao se le. A SC 1.4.3
     isenta controle inativo, entao isto nao era reprovacao formal; era um estado
     que o resto do sistema desenha com token e este desenhava com transparencia.
     "--fraco" sobre "--fundo-recuo" ja esta medido em T1. */
  input:disabled, select:disabled, textarea:disabled {
    background: var(--fundo-recuo); color: var(--fraco); cursor: default;
  }
  input[type="file"] { padding: 6px 8px; font-size: var(--t-ui); }
  /* O BOTAO DO SELETOR DE ARQUIVO era a ultima peca nativa da tela: "Choose File /
     No file chosen", com desenho e IDIOMA do sistema operacional - aparecia em
     ingles num sistema em portugues. O texto continua sendo do browser (nao ha
     como troca-lo por CSS), mas a caixa agora e a nossa. */
  input[type="file"]::file-selector-button {
    margin-right: 10px; padding: 6px 12px; border-radius: var(--raio-pequeno);
    border: 1px solid var(--borda); background: var(--fundo2); color: var(--texto);
    font: inherit; font-family: var(--fonte-cond); font-size: var(--t-ui); font-weight: 600; cursor: pointer;
    transition: border-color .14s ease, color .14s ease;
  }
  input[type="file"]::file-selector-button:hover { border-color: var(--texto); }

  /* O SELECT PERDE A SETA DO SISTEMA e recebe a do Phosphor, posicionada pelo
     .campo-caixa. A seta nativa e o que mais denuncia formulario nao estilizado -
     ela muda de desenho a cada sistema operacional. */
  .campo-caixa { position: relative; }
  .campo-caixa select { appearance: none; -webkit-appearance: none; padding-right: 32px; }
  .campo-caixa .adorno {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    color: var(--fraco); pointer-events: none;
  }
  .campo-caixa .adorno-esquerda {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    color: var(--fraco); pointer-events: none;
  }
  .campo-caixa .com-adorno-esquerda { padding-left: 34px; }

  /* A DATA COM CALENDARIO CLICAVEL. O indicador nativo do WebKit sai de cena e
     quem abre o seletor e o botao do Phosphor, por 'showPicker()'.
     NOTA DE COMPATIBILIDADE: o Firefox nao tem o pseudo-elemento e mantem o
     indicador dele visivel - ali aparecem dois. Fica registrado em vez de
     escondido; o navegador da operacao e Chrome. */
  .campo-data input::-webkit-calendar-picker-indicator { display: none; }
  .campo-data { position: relative; }
  .campo-data input { padding-right: 34px; }
  .campo-data .abrir-calendario {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
    width: 26px; height: 26px; padding: 0; display: grid; place-items: center;
    border: 0; background: none; box-shadow: none; color: var(--fraco); cursor: pointer;
  }
  .campo-data .abrir-calendario:hover { color: var(--acento-forte); background: none; transform: translateY(-50%); }

  /* O INPUT DE DENTRO DA TABELA PARECE TEXTO ate receber atencao. A borda existe
     desde o inicio, transparente: pintar borda so no hover mexeria no layout da
     linha inteira a cada passagem do mouse. */
  .inline input, .inline select {
    background: transparent; border-color: transparent; box-shadow: none;
    padding: 5px 7px; font-weight: 500;
  }
  .inline input:hover:not(:disabled), .inline select:hover:not(:disabled) {
    border-color: var(--borda); background: var(--fundo2);
  }
  .inline input:focus, .inline select:focus {
    border-color: var(--borda); background: var(--fundo2); box-shadow: none;
  }
  .inline { display: flex; align-items: center; gap: 4px; }
  /* O campo de data DENTRO da linha: precisa reservar a direita para o botao do
     calendario, e '.inline input' acima zeraria essa reserva por vir depois com a
     mesma especificidade. Escrito explicito em vez de contado em ordem de regra. */
  .inline .campo-data input { padding: 5px 28px 5px 7px; width: 132px; }
  .inline .campo-data .abrir-calendario { right: 1px; width: 24px; height: 24px; }

  /* O INTERRUPTOR, no lugar do checkbox nativo. 'role="switch"' de verdade, com
     'aria-checked' - o desenho mudou, a semantica nao. */
  .interruptor {
    display: inline-flex; align-items: center; gap: 9px; padding: 3px;
    border: 0; background: none; box-shadow: none; cursor: pointer;
    font: inherit; font-size: var(--t-corpo); letter-spacing: normal; color: var(--texto);
  }
  .interruptor:hover:not(:disabled) { background: none; border-color: transparent; transform: none; color: var(--texto); }
  /* O CONTORNO DO TRILHO E "--fraco", E NAO "--borda". Medido em 14/08: a
     "--borda" sobre o cartao da 1,50:1 no claro e 1,23:1 no escuro - e o trilho
     E o limite de um controle de formulario, que a WCAG 1.4.11 pede a 3:1. No
     tema claro NENHUM dos dois estados chegava la (ligado dava 2,69:1). Dois
     interruptores deste sistema decidem "sandbox" e "ativo" do conector de
     cobranca, que e onde um clique errado emite cobranca de verdade. */
  /* [30/09] QUADRADO, e o pino deixou de ser um disco branco com sombra: sem
     sombra, branco sobre o recuo daria 1,2:1 e o pino sumiria. Desligado, o pino
     e um bloco "--fraco" (4,52:1 sobre o recuo); ligado, e o Navy sobre o
     laranja - o mesmo par do botao primario, 5,93:1. Os dois estados continuam
     ditos pela POSICAO do pino, e nao so pela cor. */
  .interruptor .trilho {
    width: 38px; height: 22px; flex: none; padding: 3px;
    border-radius: var(--raio); background: var(--fundo-recuo);
    border: 1px solid var(--fraco); display: flex; align-items: center;
    transition: background-color .2s ease, border-color .2s ease;
  }
  .interruptor .pino {
    width: 14px; height: 14px; border-radius: var(--raio);
    background: var(--fraco);
    transition: transform .2s cubic-bezier(.4, 0, .2, 1), background-color .2s ease;
  }
  /* Ligado: o preenchimento continua sendo o acento - e o sinal da marca -, e
     quem carrega os 3:1 do CONTORNO e o "--acento-forte", que e o token que
     existe para o laranja em superficie clara (5,60:1 claro, 6,88:1 escuro). */
  .interruptor[aria-checked="true"] .trilho { background: var(--acento); border-color: var(--acento-forte); }
  .interruptor[aria-checked="true"] .pino { transform: translateX(16px); background: var(--acento-texto); }
  .interruptor:disabled { opacity: .55; cursor: default; }

  /* A CAIXA DE MARCAR, nativa de proposito (30/09/2026). O dono pediu "checkbox"
     para os setores de cada pessoa, e o nativo e o que todo leitor de tela, todo
     teclado e todo zoom ja sabem usar. O que muda e so o tamanho (a regra geral de
     "input" daria 100% de largura e padding) e a cor da marca, pelo "accent-color". */
  input.caixa, .opcao input[type="radio"] {
    width: 18px; height: 18px; padding: 0; margin: 0; flex: none;
    accent-color: var(--acento-forte); cursor: pointer; vertical-align: middle;
  }
  input.caixa:disabled { cursor: not-allowed; }

  /* ---------------------------------------------------------- usuarios
     A matriz pessoa x setor: as colunas de caixa sao estreitas e centradas, para a
     marca ser lida como coluna e nao como texto solto. */
  .usuario-coluna-setor { text-align: center; width: 1%; white-space: nowrap; }
  /* A LINHA CENTRA NA VERTICAL: nome e e-mail ocupam duas linhas, e caixa, perfil
     e interruptor presos ao topo pareciam pertencer so ao nome. */
  tr.usuario-linha td { vertical-align: middle; }
  /* O PERFIL NAO ENCOLHE: em tela estreita a tabela rola para o lado (o
     ".rolagem") em vez de esmagar o seletor ate ele mostrar "Ad". */
  .usuario-perfil { min-width: 164px; }
  .usuario-th-setor { display: inline-flex; align-items: center; gap: 5px; }
  .usuario-nome { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .usuario-email { font-size: var(--t-meta); margin-top: 2px; }
  tr.usuario-desligado td { color: var(--fraco); }
  tr.usuario-desligado strong { font-weight: 500; }
  tr.usuario-retorno td { padding-top: 0; }
  tr.usuario-retorno:hover { background: none; }
  .usuario-novo h2, .usuario-pronto h2 { display: flex; align-items: center; gap: 8px; margin-top: 0; }
  .usuario-senha { display: flex; gap: 6px; align-items: center; }
  .usuario-senha input { font-family: var(--fonte-mono); }
  .usuario-dica { display: flex; align-items: center; gap: 5px; margin: 6px 0 0; font-size: var(--t-meta); color: var(--fraco); }
  .usuario-grupo { border: 0; padding: 0; margin: 18px 0 0; min-width: 0; }
  .usuario-grupo legend { padding: 0; margin-bottom: 8px; font-size: var(--t-meta); font-weight: 500; color: var(--fraco); }
  .usuario-opcoes { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  /* A OPCAO E UM CARTAO CLICAVEL INTEIRO: o "label" envolve a caixa, entao
     clicar no texto marca. A marcada ganha a borda e o fundo do acento - o mesmo
     par da aba ativa -, e a caixa continua la dentro dizendo o estado sem cor. */
  .opcao {
    display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 10px 12px;
    border: 1px solid var(--borda); border-radius: var(--raio); background: var(--fundo2);
    color: var(--texto); font-size: var(--t-corpo); font-weight: 400; cursor: pointer;
    transition: border-color .14s ease, background-color .14s ease;
  }
  .opcao input { margin-top: 1px; }
  .opcao:hover { border-color: var(--borda-forte); }
  .opcao.marcada { border-color: var(--acento-forte); background: var(--acento-suave); }
  .opcao.travada { cursor: not-allowed; background: var(--fundo-recuo); color: var(--fraco); }
  .opcao.travada:hover { border-color: var(--borda); }
  .opcao-texto { display: grid; gap: 2px; min-width: 0; }
  .opcao-texto strong { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-corpo); font-weight: 600; }
  .opcao-texto span { font-size: var(--t-meta); color: var(--fraco); }
  .usuario-acoes { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .usuario-mensagem {
    margin: 0 0 4px; padding: 12px 14px; white-space: pre-wrap; user-select: all;
    background: var(--fundo-recuo); border: 1px solid var(--borda-suave); border-radius: var(--raio);
    font-size: var(--t-ui); color: var(--texto);
  }
  .usuario-rodape { margin-top: 12px; }

  /* ---------------------------------------------------------- botoes
     [30/09] OS BOTOES DA REFERENCIA, em tres pesos e nada entre eles:

       primario   bloco laranja, tinta Navy (5,93:1; o branco da referencia dava
                  2,69:1), rotulo condensado em CAIXA ALTA. E o unico em caixa
                  alta, e isso e o que o separa dos outros antes da cor
       comum      contorno de 1px da linha da casa, tinta Navy, condensada em
                  caixa de sentenca. No hover a linha escurece ate o Navy - e o
                  gesto do "Nova fatura" da referencia, sem a inversao inteira,
                  que numa coluna de vinte "Boleto e baixa" piscaria a tabela
       discreto   so texto, na Barlow e nao na condensada: e o "excluir" e o
                  "2a via" da lista de registros, acao miuda dentro de uma linha

     O QUE SAIU, e por que. A sombra do primeiro degrau (o botao nao flutua sobre
     nada), a subida de 1px no hover (movimento que so diz "sou clicavel", o que
     o cursor ja diz), o BRILHO que atravessava o primario em 700ms e a ONDULACAO
     que crescia do clique. Os quatro eram enfeite numa tela de trabalho, e o
     g3ref nao tem nenhum. O que ficou e sobrio e e estado: o hover muda a linha
     ou escurece o laranja, o clique afunda o fundo um tom. */
  button {
    position: relative;
    padding: 8px 14px; border-radius: var(--raio); border: 1px solid var(--borda);
    background: var(--fundo2); color: var(--texto);
    font: inherit; font-family: var(--fonte-cond); font-size: var(--t-corpo); font-weight: 600;
    letter-spacing: .01em; line-height: 1.2; cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px; justify-content: center;
    transition: border-color .14s ease, color .14s ease, background-color .14s ease;
  }
  button:hover:not(:disabled) { border-color: var(--texto); color: var(--texto); }
  /* O CLIQUE AFUNDA O FUNDO, e o seletor tem a especificidade do "button" puro
     de proposito (o ":where" zera a do resto). Assim ele vale para o botao comum
     e PERDE para todo botao que desenha o proprio fundo - o da faixa navy, o do
     menu, a aba, o discreto. Com a especificidade normal, apertar o botao da
     conta na faixa pintaria de creme um botao de tinta creme. */
  button:where(:active:not(:disabled)) { background: var(--fundo-recuo); }
  button.primario {
    background: var(--acento); border-color: var(--acento); color: var(--acento-texto);
    text-transform: uppercase; letter-spacing: .06em;
  }
  /* O hover do botao primario ESCURECE (--acento-hover), nunca clareia: clarear
     derruba o contraste do texto e "apaga" o botao - e a regra documentada no
     proprio token, vinda da pesquisa de 29/07. O clique acende o contorno Navy:
     e a unica diferenca entre "sob o ponteiro" e "apertado", e ela nao move nada. */
  button.primario:hover:not(:disabled) {
    background: var(--acento-hover); border-color: var(--acento-hover); color: var(--acento-texto);
  }
  button.primario:active:not(:disabled) { background: var(--acento-hover); border-color: var(--acento-texto); }
  /* DESABILITADO E TOKEN, pelo mesmo motivo dos campos acima. "opacity: .5" no
     botao PRIMARIO fazia o alfa cair sobre o proprio acento: 2,83:1 no claro e
     **1,85:1** no escuro, medido em 14/08. Um botao desabilitado tem de parecer
     desabilitado E continuar legivel - quem le "Compor os 28 documentos" apagado
     precisa saber o que esta apagado para descobrir o que destrava. O "!important"
     nao entra: a regra vem depois da do primario e tem a classe a mais. */
  button:disabled, button.primario:disabled {
    background: var(--fundo-recuo); color: var(--fraco); border-color: var(--borda);
    cursor: default; opacity: 1;
  }
  button.discreto {
    border-color: transparent; background: none; color: var(--fraco);
    padding: 4px 6px; font-family: var(--fonte); font-size: var(--t-ui); font-weight: 500; letter-spacing: normal;
  }
  button.discreto:hover:not(:disabled) { background: var(--fundo-hover); color: var(--texto); border-color: transparent; }
  button.discreto:disabled { background: none; border-color: transparent; }

  /* O BOTAO DE ICONE - o que era "OK" ao lado do input da tabela. Quadrado, 30px,
     o contorno do botao comum. Ele SEMPRE leva 'aria-label', senao o botao fica
     sem nome para quem usa leitor de tela: ver 'BotaoDeIcone' no ui.tsx. */
  button.so-icone {
    width: 30px; height: 30px; padding: 0; flex: none;
    border-radius: var(--raio);
  }
  button.so-icone.grande { width: 34px; height: 34px; }

  a:focus-visible, button:focus-visible, th .ordenar:focus-visible, .interruptor:focus-visible {
    outline: 2px solid var(--foco); outline-offset: 2px;
  }

  /* ------------------------------------------------------------- avisos
     O TEXTO CONTINUA EM --texto, e essa decisao de 30/07 fica: aviso de erro com
     dois paragrafos escritos em vermelho e mais dificil de ler que o proprio
     erro. A cor mora no que chama atencao sem atravancar.

     [30/09] O FILETE LATERAL SAIU, nos dois lugares que o tinham - 4px aqui e
     3px na ilha da Fatura unificada. Faixa grossa de cor num lado so e o
     "callout" de categoria (o detector acusa, e o craft-floor recusa acima de
     1px), e ela era o UNICO sinal que a caixa dava de longe. O estado agora e
     dito por TRES coisas, nenhuma delas o filete:

       1. o FUNDO tingido do estado - a caixa inteira, e nao uma aresta;
       2. o CONTORNO de 1px na mesma matiz, misturado ao fundo, para a caixa ter
          aresta sem sombra (o g3ref separa por linha, nunca por volume);
       3. o ICONE proprio de cada estado, na cor dele - forma, e nao so cor
          (restricao 3 do tema). As tres tintas passam AA sobre o proprio fundo
          (T1b), entao o icone se le em qualquer um dos dois temas.

     14px e nao o corpo: o aviso e nota ao lado do trabalho, e com dois
     paragrafos ele nao pode pesar como o conteudo da tela. */
  .aviso {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 11px 14px; margin: 12px 0; font-size: var(--t-ui); line-height: 1.5;
    background: var(--fundo2); border: 1px solid var(--borda); border-radius: var(--raio);
  }
  .aviso > .ic { margin-top: 1px; flex: none; }
  .aviso .corpo { color: var(--texto); flex: 1; min-width: 0; }
  .aviso.erro {
    color: var(--erro); background: var(--erro-fundo);
    border-color: color-mix(in srgb, var(--erro) 30%, var(--erro-fundo));
  }
  .aviso.ok {
    color: var(--ok); background: var(--ok-fundo);
    border-color: color-mix(in srgb, var(--ok) 30%, var(--ok-fundo));
  }
  .aviso.alerta {
    color: var(--alerta); background: var(--alerta-fundo);
    border-color: color-mix(in srgb, var(--alerta) 30%, var(--alerta-fundo));
  }

  /* ------------------------------------------------------- selo de estado
     PREENCHIDO SUAVE desde 30/07, com icone e texto dentro. A separacao do
     acento passou a ser de PESO (o acento e preenchido solido) e nao mais de
     contorno - a nota de adjacencia do tema.ts registra a troca.

     [30/09] DEIXOU DE SER PILULA E VIROU O CHIP DA REFERENCIA: canto reto e o
     rotulo condensado em caixa alta. E subiu de 11,5 para 12px - o detector
     mediu o de antes como texto miudo -, e a caixa alta ajuda mais que o meio
     ponto: a letra maiuscula de 12px e mais alta que o minusculo de 13. */
  .marca {
    display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    font-size: var(--rotulo-tamanho); font-weight: 600; line-height: 1.3;
    text-transform: uppercase; letter-spacing: .05em;
    padding: 3px 8px 3px 6px;
    border-radius: var(--raio-pequeno); border: 1px solid transparent;
  }
  .marca.ok { background: var(--ok-fundo); color: var(--ok); }
  .marca.pendente { background: var(--erro-fundo); color: var(--erro); }
  .marca.nao_medido { background: var(--alerta-fundo); color: var(--alerta); }
  /* SEM HOVER. A pilula e ROTULO, nao controle - "Marca" renderiza um "<span>".
     Ver a nota do ".kpi" acima: movimento sob o mouse e promessa de clique. */

  /* ------------------------------------------------------ busca e filtros
     A AREA DE FILTRO E UMA SUPERFICIE, nao um punhado de campos soltos: cartao
     proprio e borda fina. A sombra que o pedido de 30/07 pos aqui saiu em 30/09
     com todas as outras de superficie - a faixa branca sobre o creme ja e o que
     a destaca. */
  .ferramentas {
    display: flex; gap: 9px; align-items: center; flex-wrap: wrap; margin: 0 0 14px;
    padding: 10px 12px; background: var(--fundo2);
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
  }
  .ferramentas select, .ferramentas .campo-caixa select { width: auto; }
  .ferramentas .contagem { margin-left: auto; font-size: var(--t-meta); color: var(--fraco); }
  .busca { position: relative; }
  .busca input { padding-left: 34px; width: 260px; }
  .busca .adorno-esquerda { position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    color: var(--fraco); pointer-events: none; }
  .busca input:focus + .adorno-esquerda { color: var(--acento-forte); }

  /* ------------------------------------------------- cartoes de metrica
     A BORDA GROSSA SAIU em 30/07 (era uma faixa de 3px do acento num lado so) e
     a presenca de marca migrou para o icone de fundo: grande, em --acento, com
     10% de opacidade.

     [30/09] E A SOMBRA DO SEGUNDO DEGRAU SAIU TAMBEM. O pedido de 30/07 era o
     cartao FLUTUAR; o de 30/09 e o g3ref, onde nada flutua - o KPI e um cartao
     como os outros, 1px de linha sobre o creme. O que ele ganhou no lugar e
     tipografico: o numero na condensada a 700, que e o "numero grande" da
     referencia (o valor a pagar do painel navy e a mesma letra a 52px). */
  .kpis { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0 0 18px; }
  .kpi {
    position: relative; overflow: hidden;
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); padding: 14px 18px 16px;
  }
  /* O HOVER DO CARTAO SAIU EM 14/08, e o motivo e que ele MENTIA. "Kpi" renderiza
     um "<div>" sem "onClick", sem "href", sem "tabIndex" e sem "role" - nao ha o
     que clicar. Um cartao que levanta 2px e assume "--sombra-3" (o degrau que o
     "tema.ts" reserva ao que FLUTUA sobre tudo: menu suspenso, popover) promete
     interacao que nao existe, e gasta a profundidade mais alta da escala num
     elemento estatico. O dia em que o KPI virar um filtro clicavel, o hover
     volta junto com "role", "tabIndex" e ":focus-visible". */
  .kpi .marca-dagua {
    position: absolute; right: 10px; bottom: 6px; color: var(--acento);
    opacity: .11; pointer-events: none;
  }
  .kpi .nome { color: var(--fraco); margin-bottom: 4px; }
  .kpi .valor { font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: 0; position: relative; }
  .kpi .valor.sim-nao { display: flex; align-items: center; gap: 8px; font-size: 24px; }

  /* --------------------------------------------------------- carregando
     A ENGRENAGEM COM O SOL DA G3 DENTRO. Foi o pedido literal de 30/07 para o
     feedback de carga, e o desenho e o que ele descreve: a engrenagem gira, o
     sol fica parado no centro. Um dos dois em movimento le como mecanismo; os
     dois girando le como defeito. */
  .carregando { display: inline-flex; align-items: center; gap: 10px; color: var(--fraco); font-size: var(--t-ui); }
  .marca-girando { position: relative; width: 26px; height: 26px; flex: none; color: var(--acento); }
  .marca-girando .ic-engrenagem { position: absolute; inset: 0; }
  .marca-girando .logotipo { position: absolute; left: 50%; top: 50%; margin: -6px 0 0 -6px; }

  /* O ESQUELETO das faixas de numero, enquanto o valor nao chegou. Ele existe
     para a pagina nao PULAR quando o dado chega - reservar a altura e o ponto,
     nao a animacao. */

  /* ----------------------------------------------------------- movimento
     A LISTA E FECHADA e conferida por teste: 'ICONES_QUE_SE_MOVEM' em
     iconografia.ts tem de casar exatamente com as regras '.ic-*' que animam
     aqui - web/tests/interface.ts falha nos dois sentidos.

     TUDO ISTO PARA sob 'prefers-reduced-motion', no fim da secao. Nenhuma
     informacao vive so no movimento: o carregando tem texto ao lado, o erro tem
     icone e faixa, o sucesso tem frase. Parar a animacao nao esconde nada. */
  @keyframes girar { to { transform: rotate(360deg); } }
  @keyframes pulsar {
    0%, 100% { transform: scale(1); }
    35% { transform: scale(1.22); }
    70% { transform: scale(1); }
  }
  @keyframes traco-do-check {
    from { opacity: 0; transform: scale(.5) rotate(-25deg); }
    60% { opacity: 1; transform: scale(1.15) rotate(0deg); }
    to { opacity: 1; transform: scale(1) rotate(0deg); }
  }
  @keyframes descer-suave {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .ic-carregando { animation: girar .9s linear infinite; }
  .ic-engrenagem { animation: girar 3.2s linear infinite; }
  .aviso.erro > .ic-aviso_erro { animation: pulsar 1.1s ease-in-out 2; }
  .aviso.ok > .ic-aviso_ok { animation: traco-do-check .42s ease-out; }
  .ic-sim { animation: traco-do-check .5s ease-out; }
  .ic-nao { animation: traco-do-check .5s ease-out; }

  /* ======================= A FATURA UNIFICADA E A REFERENCIA (14/08/2026)
     PEDIDO DO DONO, literal, em 14/08: *"quero ajustar o layout da interface da
     aba documentos. A referência exata deve ser g3-fatura-unificada.vercel.app,
     sem tirar nem por, deve ser exatamente igual, com bordas iguais, sistema de
     cores, tipografia"*.

     DE ONDE SAEM OS NÚMEROS. Do template desempacotado do commit "36e964e" — o
     mesmo bundle que a Vercel serve —, não de olhar a página renderizada. É dele
     que vem cada "padding", cada grade e cada tamanho de título abaixo. É a
     mesma fonte de "REFERENCIA-fatura-unificada-2026-08-13.md".

     ============================ O QUE MUDOU EM 30/09 — A ILHA VIROU A FUNDAÇÃO
     De 14/08 a 30/09 esta seção era uma ILHA declarada: outra fonte, outra
     paleta ("--g3ref-*"), raio zero e sombra nenhuma, tudo prefixado por
     ".g3ref" para não escapar para as outras telas. Em 30/09 o dono decidiu que
     o desenho dela é o do sistema INTEIRO, e as regras gerais do começo deste
     arquivo passaram a ser escritas na língua dela.

     Consequência aqui: o que a ilha repetia para se diferenciar da casa SAIU —
     fonte do escopo, cartão, rótulo de campo, campo, placeholder, foco, botão
     comum, botão primário, aviso, cabeçalho de tabela, h2, h3, ".sub". Tudo isso
     é herdado agora, sem cópia. O que FICOU é o que só esta tela tem: a grade de
     duas colunas, as abas de etapa, a área de envio, o painel navy, as grades
     fixas de campos, o histórico em fichas, a lista de registros e os botões de
     largura cheia e de imprimir.

     E TRÊS DECISÕES DE 14/08 FORAM DESFEITAS, POR CONTRASTE. A referência pinta
     o rótulo apagado com o Gray puro (3,08:1), o título de seção com o laranja
     cru (2,69:1), a tinta do botão laranja de branco (2,69:1) e o anel de foco
     com o laranja cru (2,41:1). Na ilha isso era a exceção nomeada "Q-DOCG3-15";
     espalhado pelo sistema seriam quatorze telas reprovando AA. Os quatro usam
     agora "--fraco", "--acento-forte", "--acento-texto" e "--foco".

     O QUE CONTINUA NÃO TENDO VINDO, e as razões de 14/08 seguem valendo:

       1. O ÍCONE DO ".fu-status" e do ".aviso" FICA. A referência diz sucesso e
          falha com 13px de texto colorido e mais nada — quem não separa laranja
          de verde lê as duas iguais (restrição 3 do tema).
       2. O ANEL DE FOCO DE BOTÃO FICA — a referência não desenha nenhum.
       3. A BARRA NAVY DA REFERÊNCIA NÃO ENTROU — decisão do dono ("Só o
          conteúdo"): o sistema já tem uma faixa navy no topo.

     O PREFIXO "fu-" CONTINUA: ele nomeia o que a esteira de conferência É
     (fatura unificada). E ".g3ref" continua sendo a classe da raiz da tela,
     posta uma vez em "documento.tsx" — hoje ela só dá escopo às regras que são
     desta tela, e não troca mais fonte nem paleta. */

  /* -------------------------------------------------- as abas de etapa
     O DESENHO É O DA BARRA NAVY DA REFERÊNCIA, com uma troca obrigatória: lá as
     abas pousam sobre o navy, e aqui sobre o creme da página. A inativa é a
     tinta apagada do sistema ("--fraco", 4,98:1 no creme); a ATIVA é o bloco
     laranja cheio — com tinta NAVY, e não a branca da referência (2,69:1). */
  .g3ref .fu-abas {
    display: flex; align-items: center; gap: 10px;
    border-bottom: 0; padding-bottom: 0; margin-bottom: 22px;
  }
  /* A ESPECIFICIDADE FOI DEFEITO MEDIDO EM 14/08 e continua valendo aqui:
     "button:hover:not(:disabled)" lá em cima é (0,2,1), e uma regra de aba com
     (0,2,0) perde para ela. Com ".g3ref" na frente estas são (0,3,x) e ganham.
     O invariante I7 prende isto. */
  .g3ref .fu-aba {
    background: transparent; border: none; border-radius: var(--raio); box-shadow: none;
    padding: 9px 16px; margin-bottom: 0;
    font-size: var(--t-corpo); font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase;
    color: var(--fraco); cursor: pointer;
    transition: background-color .16s ease, color .16s ease;
  }
  /* "box-shadow: none" e "transform: none" continuam escritos mesmo com o botão
     geral sem sombra e sem subida: a I7b os exige, e é ela que impede a aba de
     voltar a flutuar no dia em que alguém devolver sombra ao botão. */
  .g3ref .fu-aba:hover:not(:disabled) {
    background: transparent; color: var(--texto);
    border-color: transparent; box-shadow: none; transform: none;
  }
  .g3ref .fu-aba[aria-selected="true"] {
    background: var(--acento); color: var(--acento-texto);
    border-color: transparent;
  }
  .g3ref .fu-aba[aria-selected="true"]:hover:not(:disabled) {
    background: var(--acento-hover); color: var(--acento-texto);
  }
  .g3ref .fu-aba-traco { width: 26px; height: 1px; background: var(--borda); }

  /* ------------------------------------------------------------- a grade
     "380px 1fr" é literal da referência, e o 380 é o que faz a coluna da
     esquerda caber o painel navy com "R$ 1.234,56" em 52px sem quebrar. Abaixo
     de 1100px as duas empilham, a esquerda primeiro, que é por onde o trabalho
     começa. */
  .g3ref .fu-grade { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
  .g3ref .fu-coluna { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  @media (max-width: 1100px) { .g3ref .fu-grade { grid-template-columns: 1fr; } }

  /* ----------------------------------------------------------- o cartão
     Superfície, linha e canto são os do cartão geral desde 30/09. O que fica
     aqui é o RESPIRO da referência: 22px na esquerda, 26px na direita — a coluna
     da direita é a que se lê campo a campo e ganha 4px. */
  .g3ref .cartao { padding: 22px; }
  .g3ref .fu-grade > .cartao { padding: 26px; }
  .g3ref .secao { margin-bottom: 18px; }
  /* A NOTA DENTRO DO CARTAO. Nesta tela ".sub" nao e a descricao da pagina (essa
     mora fora do ".g3ref", no "Pagina"): e a nota miuda sob um grupo de campos
     ("Padrao do cadastro...", "Saem na grade do cliente..."). A referencia a
     escreve a 12px colada no campo; aqui ela sobe ao piso do texto corrido
     (13.5px, "--t-meta") e mantem a margem de cima da referencia - com o ".sub"
     geral ela viraria corpo de 15px com 22px de ar embaixo, e o cartao de
     parametros cresceria um terco. */
  .g3ref .cartao .sub { font-size: var(--t-meta); line-height: 1.5; margin: 10px 0 0; }

  /* ---------------------------------------------------- o rótulo em caixa alta
     Tamanho, peso, caixa, tracking e família saem do token geral (".rot-alta" e
     irmãos, lá em cima). Aqui fica só o que é desta tela: a distância até o
     conteúdo e a tinta do painel navy. */
  .g3ref .fu-rotulo { color: var(--fraco); margin-bottom: 14px; }

  /* A LEGENDA MIÚDA — "Instruções do boleto", "Linha digitável", "PIX copia e
     cola". Na referência elas NÃO são rótulo em caixa alta: são texto corrido
     apagado, com margem "14px 0 3px". O trecho complementar (" · uma por
     linha") era a linha forte como TINTA — 1,79:1 no branco; passou ao --fraco,
     e o ponto do meio é o que o separa. */
  .g3ref .fu-legenda {
    font-size: var(--t-meta); font-weight: 400;
    text-transform: none; letter-spacing: normal;
    color: var(--fraco); margin: 14px 0 3px;
  }

  /* ------------------------------------------------------- a área de envio
     "<label>" e não "<div onClick>": o input de arquivo mora dentro dela, então
     clicar na área é clicar no input, sem uma linha de JavaScript no meio.

     A BORDA É 1px TRACEJADO, o da referência, na linha forte do sistema. O que
     segura a área não é a borda: são os 19px do título e o anel de foco. */
  .g3ref .fu-solta {
    display: block; border: 1px dashed var(--borda-forte); border-radius: var(--raio);
    background: var(--fundo); padding: 24px 18px; text-align: center; cursor: pointer;
    transition: border-color .15s ease, background .15s ease;
  }
  /* A da fatura tem 24px de padding e título 19px; a do boleto, 20px e 18px. São
     os dois valores da referência — o envio da fatura é o primeiro ato da tela e
     é maior de propósito. */
  .g3ref .fu-solta.curta { padding: 20px 18px; }
  /*
   * O INPUT DE ARQUIVO É INVISÍVEL E FOCÁVEL, e "display: none" não serve: sai
   * da ordem de tabulação E da árvore de acessibilidade, e o "<label>" também
   * não é focável — as duas áreas de envio ficariam inalcançáveis sem mouse, e a
   * regra ":focus-within" abaixo nunca dispararia.
   */
  .g3ref .fu-solta input[type="file"] {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  .g3ref .fu-solta:hover { border-color: var(--acento); background: var(--fundo-hover); }
  .g3ref .fu-solta:focus-within { border-color: var(--acento); outline: 2px solid var(--foco); outline-offset: 0; }
  .g3ref .fu-solta-titulo { font-family: var(--fonte-cond); font-size: 19px; font-weight: 600; }
  .g3ref .fu-solta.curta .fu-solta-titulo { font-size: 18px; }
  .g3ref .fu-solta-sub { font-size: var(--t-meta); color: var(--fraco); margin-top: 4px; }

  /* ------------------------------------------------------------- o status
     Texto apagado miúdo, como na referência. O ÍCONE FICA — ver a nota 1 do
     cabeçalho desta seção. As três margens são as dela: 12px depois do envio da
     fatura, 10px no caso geral, 6px colado no campo que acabou de ser digitado. */
  .g3ref .fu-status {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: var(--t-meta); color: var(--fraco); margin-top: 10px; line-height: 1.45;
  }
  .g3ref .fu-status > .ic { margin-top: 2px; }
  .g3ref .fu-status.solto { margin-top: 12px; }
  .g3ref .fu-status.rente { margin-top: 6px; }
  .g3ref .fu-status.ok { color: var(--ok); }
  .g3ref .fu-status.alerta { color: var(--alerta); }

  /* ------------------------------------------------------ o painel navy
     O único bloco de fundo cheio da tela, e o motivo é de uso: quem opera abre a
     aba, sobe o PDF e precisa deste número para digitar no internet banking — ele
     não pode estar no meio de trinta campos. 52px é o tamanho da referência.

     É A SUPERFÍCIE DOMINANTE DO SISTEMA, a mesma da faixa do topo ("--topo"), e
     por isso sobrevive ao tema escuro sem par próprio. A legenda e o subtítulo
     são a tinta apagada que pousa nela ("--topo-fraco", 5,89:1), e o rótulo é o
     laranja sobre o navy — o mesmo par da aba ativa, 5,93:1. */
  .g3ref .fu-painel {
    background: var(--topo); color: var(--topo-texto);
    border-radius: var(--raio); padding: 24px;
  }
  .g3ref .fu-painel-rot { color: var(--acento); margin-bottom: 0; }
  .g3ref .fu-painel-total {
    font-family: var(--fonte-cond); font-size: 52px; font-weight: 700;
    line-height: 1.05; margin-top: 6px;
  }
  .g3ref .fu-painel-sub { font-size: var(--t-ui); color: var(--topo-fraco); margin-top: 4px; }
  .g3ref .fu-painel-par {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: var(--t-meta);
    margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--topo-veu-forte);
  }
  .g3ref .fu-painel-cap { color: var(--topo-fraco); }
  .g3ref .fu-painel-val { font-size: 17px; font-weight: 600; }

  /* --------------------------------------------- o cabeçalho do cartão grande
     O título é o "h2" geral (condensada, 600) — era a mesma letra escrita de
     novo aqui a 22px. */
  .g3ref .fu-cabeca {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    margin-bottom: 6px;
  }
  .g3ref .fu-cabeca h2 { margin: 0; }
  .g3ref .fu-cabeca .fraco { font-size: var(--t-meta); }

  /* ------------------------------------------------------------ as seções
     DUAS FORMAS, e a referência usa as duas em lugares diferentes. No cartão da
     direita a seção se anuncia por um título LARANJA com régua EMBAIXO; no
     cartão do boleto ela se separa por uma régua EM CIMA e o título é apagado.

     O LARANJA DO TÍTULO É O DE TEXTO ("--acento-forte", 5,60:1 no branco) e não
     o cru da referência (2,69:1): é texto de 12px, e o critério é o de texto. */
  .g3ref .fu-secao { margin-top: 22px; padding-top: 0; border-top: 0; }
  .g3ref .fu-secao-tit {
    color: var(--acento-forte);
    padding-bottom: 8px; border-bottom: 1px solid var(--borda-suave); margin-bottom: 0;
  }
  .g3ref .fu-secao.com-regua {
    margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--borda-suave);
  }
  .g3ref .fu-secao.com-regua > .fu-rotulo { margin-bottom: 8px; }

  /* -------------------------------------------------------- os formulários
     TRÊS COLUNAS FIXAS no cartão da direita, "1fr 1fr" no par do boleto e nos
     parâmetros, "1fr" sozinho no "Nosso número". São as quatro grades da
     referência. Rótulo, campo, foco e placeholder são os gerais desde 30/09. */
  .g3ref .campos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 14px; }
  .g3ref .campos.duas { grid-template-columns: 1fr 1fr; gap: 12px; }
  .g3ref .campos.uma { grid-template-columns: 1fr; gap: 12px; margin-top: 12px; }
  .g3ref .campos.parametros { grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 0; }

  /* Os dois parâmetros são os únicos campos da referência com a borda forte e o
     fundo da página — eles não são dado lido da fatura, são decisão de quem
     opera. */
  .g3ref .campos.parametros input { border-color: var(--borda-forte); background: var(--fundo); }
  .g3ref .campos.parametros input:hover:not(:disabled) { border-color: var(--fraco); }
  .g3ref textarea, .g3ref .fu-area { padding: 10px; font-size: var(--t-ui); line-height: 1.5; resize: vertical; }
  .g3ref .fu-area.mono {
    font-family: var(--fonte-mono); font-size: 13px; word-break: break-all;
  }
  /* O PIX é 12px na referência e a linha digitável 13px: o payload EMV tem três
     vezes mais caracteres e ela abriu mão de um ponto para ele caber. É dado
     para copiar, não texto para ler. */
  .g3ref .fu-area.mono.miudo { font-size: 12px; }

  /* ------------------------------------------------------ o histórico editável
     É o campo que o extrator mais erra: a tabela lateral da Equatorial é
     desenhada em cinza claro, treze linhas altas. Na referência são fichas em
     "flex-wrap" com largura de conteúdo — 54px para o mês, 62px para o número. */
  .g3ref .fu-hist-edit { display: flex; flex-wrap: wrap; gap: 10px; }
  .g3ref .fu-hist-item {
    display: flex; align-items: center; gap: 6px;
    border: 1px solid var(--borda); background: var(--campo); padding: 6px 8px;
  }
  .g3ref .fu-hist-mes {
    font-size: var(--rotulo-tamanho); color: var(--fraco); width: 54px; flex: none;
    text-transform: uppercase;
  }
  .g3ref .fu-hist-kwh {
    width: 62px; flex: none; border: none; background: transparent; padding: 0;
    font-size: var(--t-corpo); color: var(--texto); text-align: right;
  }
  .g3ref .fu-hist-un { font-size: var(--rotulo-tamanho); color: var(--fraco); flex: none; }

  /* ----------------------------------------------------- as faturas registradas
     A referência lista as faturas já registradas na UC com mês, total e as ações
     miúdas por linha, e é dali que sai a economia acumulada impressa na folha 2.
     As ações são o botão "discreto" geral desde 30/09 (eram "fu-texto", um
     quarto desenho de botão que só existia aqui). */
  .g3ref .fu-registro {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid var(--borda-suave); font-size: var(--t-ui);
  }
  .g3ref .fu-registro-dir { display: flex; align-items: center; gap: 14px; }
  .g3ref .fu-registro-val { color: var(--fraco); }

  /* ------------------------------------------------------------- os botões
     Primário, comum e discreto são os gerais desde 30/09 — inclusive o "Nova
     fatura" e o "Conferir" das linhas, que eram "fu-acao" (contorno navy em
     caixa alta) e passaram a ser o botão comum da casa. Ficam aqui os TRÊS que
     só esta tela tem: largura cheia, contorno navy e imprimir. */
  /* Largura cheia dentro do cartão da esquerda: "Ler boleto com IA" (laranja) e
     "Registrar este mês" (contorno navy). Condensados em caixa alta nos dois. */
  .g3ref button.fu-largo {
    width: 100%; padding: 12px; margin-top: 12px;
    letter-spacing: .06em; text-transform: uppercase;
  }
  /* O CONTORNO NAVY é o botão secundário FORTE da referência, e só este cartão o
     tem: "Registrar este mês" é o ato que fecha a conta, e ao lado do laranja de
     "Ler boleto" um contorno claro sumiria. No hover ele inverte — fundo vira a
     tinta, tinta vira o fundo da página (o par que sobrevive aos dois temas). */
  .g3ref button.fu-contorno {
    border: 1px solid var(--texto); background: var(--fundo2);
    color: var(--texto); padding: 11px; margin-top: 16px;
  }
  .g3ref button.fu-contorno:hover:not(:disabled) {
    background: var(--texto); color: var(--fundo); border-color: var(--texto);
  }
  .g3ref button.fu-contorno:disabled { background: var(--fundo-recuo); color: var(--fraco); border-color: var(--borda); }
  /* O pé do cartão da direita: o primário e o "Nova fatura", 26px abaixo do
     último campo. "flex-wrap" é nosso — os rótulos em português são mais longos
     que os da referência e num monitor estreito eles se tocariam. */
  .g3ref .fu-pe { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }

  /* ----------------------------------------------------------- o aviso
     Fundo, contorno, ícone e tinta são os do aviso geral desde 30/09 — o filete
     de 3px da referência saiu junto com o de 4px da casa. Fica a margem da
     referência: dentro do cartão o aviso encosta no que vem depois. */
  .g3ref .aviso { margin: 0 0 8px; }

  /* ------------------------------------------------------------ a barra da aba 2
     Na referência ela tem a LARGURA DA FOLHA (210mm) e fica solta sobre o creme —
     sem cartão, sem borda —, porque o que precisa de moldura ali embaixo é o
     papel. */
  .g3ref .fu-barra {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    max-width: 210mm; margin: 22px auto 14px; padding: 0;
    background: none; border: 0; border-radius: var(--raio);
  }
  .g3ref .fu-barra .fraco { font-size: var(--t-ui); }
  /* "Voltar ao painel" ganha a altura do botão de imprimir ao lado. */
  .g3ref .fu-barra button { padding: 11px 18px; }
  /* IMPRIMIR É O BLOCO NAVY, a superfície dominante como botão: é o último ato
     da aba e não compete com o laranja de nenhuma outra. O hover clareia o navy
     misturando a própria tinta dele, e isso vale igual nos dois temas. */
  .g3ref button.fu-imprimir {
    background: var(--topo); color: var(--topo-texto); border-color: var(--topo);
    padding: 11px 22px; letter-spacing: .06em; text-transform: uppercase;
  }
  .g3ref button.fu-imprimir:hover:not(:disabled) {
    background: color-mix(in srgb, var(--topo) 86%, var(--topo-texto));
    border-color: color-mix(in srgb, var(--topo) 86%, var(--topo-texto)); color: var(--topo-texto);
  }

  /* ------------------------------------------- o que a aba 3 (Cadastro) herda
     O cadastro é markup da casa — ".cartao.secao", "h2", "h3", ".sub", tabela.
     Até 30/09 este bloco o traduzia para a língua da referência regra a regra;
     desde então a casa JÁ fala essa língua, e a tradução saiu inteira. */

  /* O CADASTRO DEIXOU DE SER UM "details" EM 14/08 e virou a terceira ABA.
     Dobrado no pe da aba 1, ele parecia rodape de uma tela de conferencia - e
     ele nao e: e o que a folha IMPRIME, e "Cadastro de Fatura" e uma
     funcionalidade nomeada pelo dono. As quatro regras de ".fu-cadastro" com "summary"
     sairam junto; o anel de foco que uma delas trazia continua valendo para
     qualquer summary do sistema, na regra abaixo.

     "summary" NAO E ALCANCADO pela regra geral de foco (a/button/th/.interruptor),
     e quem navega por Tab chegava nele sem sinal nenhum na tela. */
  summary:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    /* WCAG 2.3.3. Nao e cortesia: ha gente para quem movimento na tela e
       sintoma. A regra desliga ANIMACAO e TRANSICAO de tudo, inclusive o que
       vier depois desta linha - e por isso ela e a ultima palavra da secao. */
    *, *::before, *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      /* O ATRASO TAMBEM, e este furo so apareceu em 21/08 porque ate entao
         nenhuma animacao do arquivo tinha atraso. As duas bolhas do balao de
         ajuda tem, e o efeito de zerar a DURACAO sem zerar o ATRASO e cruel: com
         'fill-mode: both' o elemento segura o estado inicial - opacidade zero -
         durante todo o atraso e so entao aparece. Quem pediu menos movimento
         recebia um elemento invisivel por 130ms, que e movimento na mesma. */
      animation-delay: 0s !important;
      transition-duration: .001ms !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }
  }

  /* ---------------------------------------------------------- impressao
     INICIO-DOCUMENTO-IMPRESSO
     AS TRES UNICAS CORES LITERAIS DO ARQUIVO ESTAO AQUI, e sao exceção nomeada -
     do mesmo tipo que o invariante 17-b da migration 19 ("uma excecao nomeada; a
     segunda entrada nessa lista deve doer"). O documento e IMPRESSO: preto sobre
     branco em papel, independente do tema da tela. Puxar --texto/--fundo2 aqui
     imprimiria branco sobre preto para quem opera no tema escuro, e gastaria o
     toner de um cliente por causa de uma preferencia de tela.

     A decisao 3 da Q-DOCFATURA-01 foi "HTML agora, gerador de PDF depois": o PDF
     sai pelo dialogo do proprio sistema, e o que o define e este bloco. Sem ele,
     window.print() imprimiria a barra de navegacao e os botoes junto. */
  .documento {
    background: #fff; color: #14213D; padding: 32px; border: 1px solid var(--borda);
    border-radius: var(--raio-cartao); max-width: 800px; box-shadow: var(--sombra-2);
  }
  .documento table td { padding: 7px 4px; border-bottom: 1px solid #E4DFD4; }
  .documento thead th { background: none; }

  /* O PALCO DA ESCALA. Sobrou da geometria do editor e continua servindo a folha
     G3: a folha tem a medida EXATA do papel em mm e a tela so a escala, entao o
     que se ve e proporcao do que sai. ".folha" e ".bloco*" sairam em 14/08 com a
     composicao posicionada - eram posicionamento absoluto em milimetro, e o
     modelo fixo compoe em fluxo. */
  .folha-palco { transform: scale(var(--escala, 1)); transform-origin: top left; }


  /* --------------------------------------- a FOLHA 1 DO MODELO G3 (14/08/2026)
     O DESTINO DA Q-DOCFATURA-01, e agora ele e o que a tela mostra por padrao.
     A geometria e A4 FIXO - 210x297mm -, e isso e diferente da ".folha" de cima:
     aquela le o papel que o tenant gravou, esta NAO. Um modelo fixo que aceitasse
     papel variavel nao seria fixo, e o desenho da referencia e desenhado em mm de
     A4 ("REFERENCIA-fatura-unificada-2026-08-13.md" §7).

     TAMANHO EM "pt" E NAO "px", como na referencia: "pt" e unidade de impressao e
     nao muda com o zoom do navegador. A folha e escalada pelo "transform" do
     palco, entao o que se ve na tela e proporcao exata do que sai.

     AS TINTAS DO PAPEL ESTAO NOMEADAS UMA A UMA em "web/tests/interface.ts"
     (I1c) e MEDIDAS uma a uma em "web/tests/tema.ts" (T7). A lista mudou em
     14/08 por MEDICAO, e a correcao esta descrita na faixa de pagamento la
     embaixo: o Gray puro da G3 que estava aqui dava 3,08:1 contra o branco e
     2,75:1 contra o creme - e nao os "4,02:1" que este comentario afirmava. Ele
     saiu, e entrou o "#66686F", que e o valor que a INTERFACE ja usava como
     "--fraco" e que passa nos dois fundos do papel (5,56:1 e 4,98:1). */
  /* A FONTE DA FOLHA E CRAVADA AQUI desde 30/09, e isso e o que protege o papel
     da etapa 0 do redesenho. Ate entao a folha nao declarava familia, tamanho,
     entrelinha nem tracking: HERDAVA os quatro do ".g3ref" em volta (Barlow,
     16px, "normal", "normal"). Quando o g3ref virou o sistema, o ".g3ref" parou
     de declara-los e o corpo passou a 15px com entrelinha 1,5 - e a folha, que
     so herdava, mudaria de medida sem ninguem tocar nela. Os quatro valores
     abaixo sao exatamente os que ela herdava, e a familia e LITERAL, como as
     tintas: o papel nao le token. */
  .g3 {
    width: 210mm; min-height: 297mm; padding: 13mm 15mm;
    background: #fff; color: #14213D;
    font-family: 'Barlow', system-ui, sans-serif; font-size: 16px; font-weight: 400;
    line-height: normal; letter-spacing: normal;
    display: flex; flex-direction: column;
    box-shadow: var(--sombra-2); border: 1px solid var(--borda);
  }
  .g3-topo {
    display: flex; align-items: flex-end; justify-content: space-between; gap: 12pt;
    padding-bottom: 10pt; border-bottom: 2px solid #14213D;
  }
  .g3-topo img { height: 30pt; width: auto; display: block; }
  .g3-assinatura {
    font-size: 9pt; font-weight: 500; letter-spacing: .26em;
    text-transform: uppercase; color: #66686F; white-space: nowrap;
  }
  .g3-emissor { text-align: right; font-size: 8.5pt; line-height: 1.5; color: #66686F; max-width: 92mm; }
  .g3-cliente { background: #F6F2EA; padding: 10pt 14pt; margin-top: 9pt; }
  .g3-cliente-topo {
    display: grid; grid-template-columns: 1.6fr 1fr; gap: 10pt 18pt;
    padding-bottom: 9pt; border-bottom: 1px solid #E4DFD4;
  }
  .g3-rot {
    font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; color: #66686F;
  }
  .g3-nome { font-size: 15pt; font-weight: 600; line-height: 1.2; }
  .g3-doc { font-size: 10pt; margin-top: 2pt; }
  .g3-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt 14pt; padding-top: 7pt; }
  .g3-meta-val { font-size: 10pt; font-weight: 500; margin-top: 1pt; }
  .g3-total {
    background: #14213D; color: #fff; margin-top: 12pt; padding: 14pt 16pt;
    display: flex; align-items: center; justify-content: space-between; gap: 14pt;
  }
  .g3-total-rot { font-size: 13pt; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; }
  .g3-total-det { font-size: 11pt; margin-top: 2pt; opacity: .75; }
  .g3-total-val { font-size: 26pt; font-weight: 700; line-height: 1; text-align: right; }
  .g3-total-sub { font-size: 9pt; margin-top: 4pt; text-align: right; }
  .g3-total-sub.fraca { opacity: .75; }
  /* O AVISO E LARANJA COM TINTA NAVY, e nao o contrario: e a unica faixa da folha
     que precisa ser lida ANTES do valor, e inverter o par a apagaria ao lado da
     barra navy que vem logo acima. */
  .g3-aviso {
    background: #E8843C; color: #14213D; margin-top: 6pt; padding: 10pt 14pt;
    display: flex; align-items: center; gap: 11pt;
  }
  .g3-aviso svg { width: 24pt; height: 24pt; flex: none; }
  .g3-aviso-tit {
    font-size: 13.5pt; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; line-height: 1.15;
  }
  .g3-aviso-corpo { font-size: 9.5pt; line-height: 1.4; margin-top: 2pt; }
  /* "margin-top: auto" prende o rodape no pe da folha sem posicionamento
     absoluto - e o que faz a folha crescer por dentro quando as faixas que
     faltam entrarem, sem nada precisar ser recalculado. */
  .g3-rodape {
    margin-top: auto; padding-top: 12pt;
    font-size: 7.5pt; color: #66686F;
    display: flex; justify-content: space-between; gap: 12pt;
  }
  /* A TABELA DE VALORES. Grade de tres colunas em vez de <table>: o valor alinha
     a direita e o rotulo nao empurra a coluna quando um tenant renomeia o campo
     para algo longo. Regua fina por linha, e a ultima sem regua. */
  .g3-tabela { margin-top: 11pt; }
  .g3-tabela-tit {
    font-size: 11pt; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; padding-bottom: 5pt; border-bottom: 1px solid #14213D;
  }
  /* A ALTURA DA LINHA E MEDIDA, e nao escolhida por gosto. Com "padding: 4pt" e
     entrelinha padrao a linha dava 8,6 mm; quinze delas somavam 129 mm e a folha
     ia a 350,9 mm — duas paginas. O pior caso e o tenant que mostra os quinze
     campos do padrao, e e ele que a folha tem de caber. */
  .g3-tabela-linha {
    display: grid; grid-template-columns: 1fr auto; gap: 10pt;
    padding: 1.8pt 0; border-bottom: 1px solid #E4DFD4;
    font-size: 9.5pt; line-height: 1.3;
  }
  .g3-tabela-linha:last-child { border-bottom: none; }
  .g3-tabela + .faixa-pgto { margin-top: 8pt; }
  .g3-tabela-rot { color: #14213D; }
  .g3-tabela-val { text-align: right; font-weight: 600; white-space: nowrap; }
  /* AUSENTE FICA CINZA E NAO SOME: o travessao e informacao — diz que o campo
     existe e o dado nao chegou. Some-lo faria a linha parecer nunca ter existido. */
  .g3-tabela-val.ausente { color: #66686F; font-weight: 400; }

  /* ------------------------------- OS TRES CARTOES (14/08/2026, aba unificada)
     A COMPARACAO E ENERGIA CONTRA ENERGIA, e o desenho tem de dizer isso sem
     legenda: o primeiro cartao e o consumo integral, o do meio e o desconto e o
     terceiro e o que sobra. So o do meio e laranja - ele e o unico numero que a
     pessoa procura nesta faixa, e o mesmo criterio do valor a pagar. */
  .g3-cartoes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; margin-top: 11pt; }
  .g3-cartao { padding: 9pt 11pt; border: 1px solid #E4DFD4; }
  .g3-cartao.sem { background: #F6F2EA; }
  /* O TACHADO E DO CARTAO INTEIRO, e nao da tipografia: "line-through" num numero
     de 20pt fica um risco fino que some na impressao domestica. A opacidade diz a
     mesma coisa - este valor nao e o que se paga - e sobrevive a tinta economica. */
  .g3-cartao.sem .g3-cartao-val { opacity: .55; text-decoration: line-through; text-decoration-thickness: 1pt; }
  .g3-cartao.desconto { background: #E8843C; border-color: #E8843C; }
  .g3-cartao.com { background: #14213D; border-color: #14213D; color: #fff; }
  .g3-cartao-rot { font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: #66686F; }
  .g3-cartao.desconto .g3-cartao-rot { color: #14213D; }
  .g3-cartao.com .g3-cartao-rot { color: #E4DFD4; }
  .g3-cartao-linha { display: flex; align-items: baseline; justify-content: space-between; gap: 5pt; }
  .g3-cartao-pct { font-size: 9pt; font-weight: 700; color: #14213D; white-space: nowrap; }
  .g3-cartao-val { font-size: 17pt; font-weight: 700; margin-top: 3pt; line-height: 1.05; }
  .g3-cartao-nota { font-size: 7.5pt; color: #66686F; margin-top: 3pt; line-height: 1.35; }

  /* -------------------------------------------------- o detalhamento da fatura
     QUATRO COLUNAS EM GRADE, pelo mesmo motivo de ".g3-tabela": a descricao cresce
     e as tres colunas numericas ficam do tamanho do conteudo, alinhadas a direita.
     "tabular-nums" alinha as casas decimais em coluna - sem isso, "1.185396" e
     "0,72" nao encostam na mesma virgula e a coluna parece torta. */
  .g3-det { margin-top: 11pt; }
  .g3-det-tit {
    font-size: 10.5pt; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; padding-bottom: 4pt; border-bottom: 1px solid #14213D;
  }
  .g3-det-grade { font-size: 9pt; font-variant-numeric: tabular-nums; }
  .g3-det-cab, .g3-det-linha, .g3-det-total {
    display: grid; grid-template-columns: 1fr 8mm 20mm 22mm; gap: 6pt; align-items: baseline;
  }
  .g3-det-cab {
    font-size: 7pt; letter-spacing: .12em; text-transform: uppercase;
    color: #66686F; padding: 3pt 0;
  }
  .g3-det-secao {
    font-size: 8.5pt; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
    background: #F6F2EA; padding: 2.5pt 4pt; margin-top: 3pt;
  }
  .g3-det-linha { padding: 2.5pt 4pt; border-bottom: 1px solid #E4DFD4; }
  .g3-det-linha.subtotal { border-bottom: none; }
  .g3-det-total {
    background: #14213D; color: #fff; padding: 5pt 4pt; margin-top: 4pt;
    font-size: 11pt; font-weight: 700;
  }
  /* ESCOPADAS AO DETALHAMENTO, e nao a folha inteira. Um ".g3 .fraca" solto
     colidiria com ".g3-total-sub.fraca" - mesma especificidade, vence a ultima -
     e pintaria de cinza um texto que vive sobre a barra navy. */
  .g3-det .dir, .g3-hist .dir { text-align: right; }
  .g3-det .forte { font-weight: 600; }
  .g3-det .fraca, .g3-hist-tit .fraca { color: #66686F; font-weight: 400; }
  /* O CHEIO TACHADO ACIMA DO COM DESCONTO. Aqui o risco cabe - e 7,5pt, e o
     proposito e mostrar a diferenca entre os dois, nao ser lido de longe. */
  .g3-det .tachado { font-size: 7.5pt; color: #66686F; text-decoration: line-through; }

  /* ----------------------------------------------------- a FOLHA 2 (14/08/2026)
     A segunda folha nao repete o cabecalho inteiro: ela se identifica em uma linha
     e entrega o espaco ao grafico e a caixa de pagamento. */
  .g3-topo-curto {
    display: flex; align-items: center; justify-content: space-between; gap: 12pt;
    padding-bottom: 7pt; border-bottom: 1px solid #E4DFD4;
  }
  .g3-topo-curto img { height: 22pt; width: auto; display: block; }
  .g3-segunda { gap: 0; }

  /* O GRAFICO DE CONSUMO. Barras em "flex" com altura percentual - a proporcao vem
     do SERVIDOR ja calculada ("altura_pct"), e a tela nao divide nada. */
  .g3-hist { margin-top: 11pt; }
  .g3-hist-tit {
    font-size: 10.5pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    padding-bottom: 5pt; border-bottom: 1px solid #14213D;
  }
  .g3-hist-barras {
    display: flex; align-items: flex-end; gap: 2pt; height: 34mm; margin-top: 7pt;
  }
  .g3-hist-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
  .g3-hist-num {
    font-size: 6pt; text-align: center; color: #66686F; padding-bottom: 1.5pt;
    font-variant-numeric: tabular-nums;
  }
  /* "min-height" para que um mes de consumo quase zero continue sendo uma barra e
     nao um vao - a coluna precisa existir para o rotulo do mes ter dono.

     A BARRA GANHOU CONTORNO EM 14/08, e o motivo e medido: o preenchimento
     "#E4DFD4" da **1,33:1** contra o branco do papel e o "#E8843C" da 2,69:1 - e
     a barra E O DADO, o que a WCAG 1.4.11 pede a 3:1 para objeto grafico
     necessario a compreensao. A revisao de tintas do mesmo dia consertou os
     TEXTOS do papel e nao tinha tocado nestas duas superficies.

     O conserto e contorno e nao troca de preenchimento, e a razao e a
     impressora: um filete Navy de 0,4pt sobrevive a impressao em PRETO E BRANCO,
     que e o pior caso real da folha do cliente, e ao toner economico, que e o
     segundo. Trocar o cinza por um mais escuro resolveria o contraste e apagaria
     a distincao entre a barra do mes atual e as demais. */
  .g3-hist-barra { background: #E4DFD4; min-height: 1.5pt; border: 0.4pt solid #14213D; }
  .g3-hist-barra.atual { background: #E8843C; }
  .g3-hist-meses {
    display: flex; gap: 2pt; margin-top: 2.5pt;
    border-top: 1px solid #E4DFD4; padding-top: 2.5pt;
  }
  .g3-hist-meses > div { flex: 1; font-size: 6pt; text-align: center; color: #66686F; }

  /* Os tres indicadores. O da economia ocupa duas colunas: e o numero pelo qual o
     cliente abre a segunda folha. */
  .g3-indicadores { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 6pt; margin-top: 10pt; }
  .g3-ind { border: 1px solid #E4DFD4; padding: 8pt 10pt; }
  .g3-ind.destaque { background: #F6F2EA; border-color: #E4DFD4; }
  .g3-ind-val { font-size: 13pt; font-weight: 700; margin-top: 2pt; }
  .g3-ind-val.grande { font-size: 21pt; color: #995728; line-height: 1.05; }
  .g3-ind-nota { font-size: 7pt; color: #66686F; margin-top: 2pt; line-height: 1.3; }

  /* As duas pecas que a faixa de 12/08 nao tinha, porque naquele caminho o boleto
     vinha sem instrucoes e o codigo de barras ainda era a "Q-DOCG3-06" em aberto. */
  .faixa-pgto-instr {
    padding: 2mm 3mm; border-bottom: 1px solid #E4DFD4; font-size: 7pt; line-height: 1.4;
  }
  /* A ALTURA DA BARRA E FIXA EM MILIMETRO e a largura estica: leitor otico le a
     PROPORCAO entre estreita e larga na horizontal, e a altura so precisa dar
     margem para o feixe. 13mm e o minimo confortavel para leitura de balcao. */
  .faixa-pgto-barras { height: 13mm; width: 100%; }
  .faixa-pgto-barras svg { width: 100%; height: 100%; display: block; }

  .g3-rodape-2 {
    margin-top: auto; padding-top: 10pt; border-top: 1px solid #E4DFD4;
    display: grid; grid-template-columns: 1fr 1.2fr; gap: 12pt;
    font-size: 7pt; color: #66686F; line-height: 1.45;
  }
  .g3-tel-num { font-size: 13pt; font-weight: 700; color: #14213D; }

  /* O QUE FALTA, DITO NA TELA E NUNCA NO PAPEL. "naoimprime" nao basta como
     intencao: esta caixa e conferencia de quem opera, e imprimi-la entregaria ao
     cliente a lista das nossas pendencias. */
  .g3-pendente {
    border: 1px dashed var(--borda); border-radius: var(--raio-cartao);
    padding: 12px 14px; margin-bottom: 12px; font-size: 13px; line-height: 1.5;
  }
  .g3-pendente b { display: block; }
  .g3-pendente li { margin-top: 6px; }

  /* ------------------------------------------- a faixa de pagamento (12/08/2026)
     O DESENHO VEIO DO MODELO G3 ("g3_fatura_unificada"), e este e o primeiro
     pedaco dele a entrar - o unico que nao depende do leitor da Equatorial, porque
     beneficiario, nosso numero, vencimento, valor, QR e linha digitavel ja existem.
     Ver "PLANO-documento-modelo-g3-2026-08-12.md" §6.

     ============================================================================
     AS TINTAS DO PAPEL, E AS DUAS QUE MUDARAM EM 14/08 POR MEDICAO

     Este bloco carregava dois numeros errados, escritos aqui e repetidos na
     "Q-DOCG3-07" e no I1c da suite de interface. Eles foram REMEDIDOS com a
     mesma calculadora WCAG que a suite do tema usa, e as duas afirmacoes
     caem:

       "o Gray puro contra branco: 4,02:1"   ->  medido: 3,08:1   REPROVA (AA pede 4,5)
       "#E8843C so no valor a pagar"     ->  medido: 2,69:1 no branco, 2,41:1 no
                                             creme. Nos DOIS usos - a faixa de
                                             pagamento (13pt) e o "voce ja
                                             economizou" (21pt) - REPROVA

     Isto nao era detalhe de estilo: as duas tintas imprimem na fatura QUE VAI AO
     CLIENTE, e a segunda pinta justamente o numero que o cliente procura. Um
     rotulo cinza a 3:1 em impressora domestica, com toner economico, e um rotulo
     que nao se le.

     AS QUATRO TINTAS DE HOJE, e a lista continua fechada e continua doendo:

       #14213D  Navy. Texto e barras cheias. 15,97:1 no branco, 14,31:1 no creme
       #66686F  o cinza dos rotulos caixa-alta. E O MESMO VALOR do "--fraco" da
                interface, e nao um cinza novo: ele ja tinha sido derivado do
                Gray puro da G3 em 28/07 por este mesmo motivo, e ja estava
                medido. 5,10:1 no branco e 4,57:1 no creme - passa nos dois
                fundos que o papel tem
       #995728  o laranja QUANDO ELE E TEXTO. Tambem nao e cor nova: e o
                "--acento-forte" do tema claro, o degrau do Orange achado por
                busca em 06/08 exatamente para o laranja pousar em superficie
                clara. 5,60:1 no branco e 5,02:1 no creme
       #E8843C  o Orange, e agora ele tem UM papel so no papel: SUPERFICIE
                cheia - a faixa do aviso, o cartao do desconto e a barra do mes
                atual no grafico. Sobre ele pousa o Navy, 5,93:1. Como TEXTO ele
                saiu

     E A REGRA QUE GOVERNA O BLOCO NAO MUDOU: sao LITERAIS e nao "var(--...)". O
     documento e IMPRESSO, e puxar token de tema faria a mesma fatura sair de
     duas cores conforme o tema de quem mandou imprimir. Que os valores COINCIDAM
     com dois tokens do tema claro e consequencia de os dois terem sido derivados
     do mesmo lugar pelo mesmo criterio - nao e uma ligacao, e nao ha "var()"
     aqui.

     A CAIXA NAO PODE QUEBRAR NO MEIO: "break-inside: avoid" vale para o dia em que
     o documento tiver mais de uma folha. Hoje ele tem uma, e a regra nao custa. */
  .faixa-pgto {
    border: 1px solid #14213D; display: flex; flex-direction: column;
    break-inside: avoid; page-break-inside: avoid; height: 100%;
  }
  .faixa-pgto-topo {
    background: #14213D; color: #F6F2EA;
    padding: 2mm 3mm; display: flex; align-items: baseline; justify-content: space-between;
    text-transform: uppercase; letter-spacing: .2em; font-size: 9pt;
  }
  /* Os campos do cabecalho. O beneficiario cresce e empurra os numeros para a
     direita ("margin-right: auto"); os numeros ficam do tamanho do conteudo.
     E "flex" e nao "grid" de colunas fixas porque a linha tem TRES ou QUATRO campos
     conforme o caminho - o boleto nao tem beneficiario para mostrar (Q-DOCG3-08) -,
     e um "grid-template-columns" de quatro deixaria a primeira coluna esticando o
     "Nosso numero" no lugar de um beneficiario que nao existe. */
  .faixa-pgto-campos {
    display: flex; flex-wrap: wrap; gap: 4mm;
    padding: 2.5mm 3mm; border-bottom: 1px solid #E4DFD4; align-items: end;
  }
  .faixa-pgto-campos > :first-child { margin-right: auto; }
  .faixa-pgto-rot {
    text-transform: uppercase; letter-spacing: .12em; font-size: 6.5pt; color: #66686F;
  }
  .faixa-pgto-val { font-size: 10pt; font-weight: 600; }
  .faixa-pgto-total { font-size: 13pt; font-weight: 700; color: #995728; }
  /* As duas formas de pagar, lado a lado. "1fr" cada, e a divisoria e a borda da
     segunda - nao um filete separado, que somaria largura e desalinharia o par. */
  .faixa-pgto-vias { display: grid; gap: 0; flex: 1; min-height: 0; }
  .faixa-pgto-via { padding: 2.5mm 3mm; min-width: 0; display: flex; flex-direction: column; gap: 1.5mm; }
  .faixa-pgto-via + .faixa-pgto-via { border-left: 1px solid #E4DFD4; }
  /* O QR VEM DO SERVIDOR COM O TAMANHO DELE (220 px) E AQUI ELE SE AJUSTA A CAIXA.
     Nao e o mesmo caso do painel de conferencia, onde a caixa LE o desenho
     ("ladoDoQr"): la nao ha papel, entao o tamanho natural e o certo. Aqui a caixa
     e milimetro de folha e quem cede e o desenho - SVG e vetor, entao encolher nao
     perde modulo, ao contrario de reescalar um bitmap. */
  .faixa-pgto-qr { width: 30mm; height: 30mm; flex: none; align-self: center; }
  .faixa-pgto-qr svg { width: 100%; height: 100%; display: block; }
  /* Linha digitavel e copia-e-cola: monoespacada e quebrando em qualquer ponto -
     sao cadeias sem espaco, e sem isto elas estouram a coluna. */
  .faixa-pgto-codigo {
    font-family: var(--fonte-mono); font-size: 6.5pt; line-height: 1.35;
    word-break: break-all; background: #F6F2EA; padding: 1.5mm;
  }
  .faixa-pgto-linha {
    font-family: var(--fonte-mono); font-size: 8.5pt; font-weight: 600;
    letter-spacing: .02em; text-align: center;
  }
  .faixa-pgto-nota { font-size: 7pt; color: #66686F; }
  .faixa-pgto-rodape {
    padding: 1.5mm 3mm; border-top: 1px solid #E4DFD4;
    font-size: 6pt; letter-spacing: .04em; color: #66686F; line-height: 1.35;
  }

  @media print {
    /* Tudo fora do documento sai da pagina impressa - inclusive o que esta
       marcado com a classe naoimprime, que sao os controles da propria previa. */
    body * { visibility: hidden; }
    #documento, #documento * { visibility: visible; }
    /* ------------------------------------------- as paginas em branco (06/08)
       MEDIDO, e o defeito era ANTERIOR ao lote: imprimir UMA fatura produzia um
       PDF de CINCO paginas - a fatura na primeira e quatro em branco atras.

       A causa e que "visibility: hidden" ESCONDE MAS NAO DESOCUPA. A aba
       Documento inteira - logo, campos, editor de layout, painel do QR -
       continuava ocupando a altura dela, e a altura e o que o navegador
       pagina. O documento nem entrava na conta: ele e "position: absolute" e
       flutua por cima.

       O conserto tira do LAYOUT tudo que nao e o documento nem caminho ate ele.
       Os ancestrais sobrevivem por ":has(#documento)" e desabam para a altura
       do que sobrou dentro; o resto sai da conta de altura de verdade.

       ONDE ISSO FALHA E COMO: navegador sem ":has()" descarta a regra inteira
       (seletor invalido) e volta ao comportamento de antes - paginas em branco,
       nunca fatura faltando. E a direcao certa da falha. */
    body *:not(:has(#documento)):not(#documento):not(#documento *) { display: none !important; }
    #documento .naoimprime, .naoimprime { display: none !important; }
    #documento {
      position: absolute; left: 0; top: 0; width: 100%;
      border: none; border-radius: 0; padding: 0; max-width: none; box-shadow: none;
    }
    /* A folha imprime em tamanho REAL: a escala e da tela, nunca do papel. */
    #documento .g3 { border: none; box-shadow: none; }
    /* ------------------------------------------------ o LOTE (06/08/2026)
       "#documento" DEIXOU DE SER A FOLHA E PASSOU A SER O RECIPIENTE, e o
       seletor acima mudou junto: era "#documento.folha" (a mesma caixa), e
       agora e "#documento .folha" (as folhas dentro). Sem essa troca o lote
       imprimiria a primeira pagina e mais nada - "id" e unico por documento.

       UMA FOLHA POR PAGINA. As duas formas do corte estao escritas porque uma
       delas e a que o navegador de quem opera entende: "break-before" e a
       moderna e "page-break-before" e o apelido legado, e as duas dizem a
       mesma coisa. Sem elas, 28 folhas de 297 mm saem emendadas e o corte cai
       no meio do valor a pagar.

       O CORTE E NO "folha-item" E NAO NO "folha", e a diferenca nao e estilo:
       cada folha vive dentro do seu proprio palco de escala, entao duas folhas
       NUNCA sao irmas no DOM e "+" entre elas nao casaria nunca. O item e o
       envelope de um documento inteiro - o aviso de layout e a folha -, e e
       nesse nivel que as paginas sao irmas. */
    #documento .folha-item + .folha-item { break-before: page; page-break-before: always; }
    #documento .g3 { break-inside: avoid; page-break-inside: avoid; }
    /* O RECORTE DA TELA NAO PODE VIAJAR PARA O PAPEL. Na previa, a folha vive
       dentro de uma caixa de altura ESCALADA com "overflow: hidden" - e isso
       so existe para a pagina nao ficar com um vao branco embaixo do zoom.
       Impresso, a folha volta ao tamanho real e a caixa a cortaria em ~30% da
       altura. Antes isto nao aparecia por acidente: a folha ERA o
       "position: absolute" da regra acima e escapava do pai que a cortava. */
    #documento .folha-recorte { height: auto !important; overflow: visible !important; }
    .folha-palco { transform: none !important; }
    /* SEM "@page" AQUI. A regra e injetada em runtime por "regraDaPagina" -
       "size" nao aceita "var()". Deixar um "@page" fixo neste arquivo faria ele
       competir com o injetado, e quem venceria dependeria da ordem de insercao
       das folhas de estilo. Desde 14/08 o papel e sempre A4 retrato (o modelo G3
       e desenhado em milimetro de A4), mas a injecao continua pelo mesmo motivo. */
  }
  /* FIM-DOCUMENTO-IMPRESSO */

  /* -------------------------------------------------------------- login
     O centro da tela. Ate 30/09 com um brilho radial do laranja subindo do alto;
     o g3ref nao tem gradiente de enfeite (o unico e o filete de marca de 3px), e
     o cartao branco sobre o creme ja e a pagina inteira. */
  .central {
    min-height: 100dvh; display: grid; place-items: center; padding: 20px;
    background: var(--fundo);
  }
`;
