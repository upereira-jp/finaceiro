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

import { VARIAVEIS_CSS, TIPOGRAFIA } from './tema.ts';

export const ESTILO = `
  ${VARIAVEIS_CSS}

  /* ------------------------------------------------------------------ base */
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fundo); color: var(--texto);
    font: ${TIPOGRAFIA.base}/${TIPOGRAFIA.linha} ${TIPOGRAFIA.familia};
    letter-spacing: ${TIPOGRAFIA.tracking};
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  ::selection { background: var(--acento-suave); }
  /* --acento-forte, e nao --acento: link e TEXTO, e o laranja da marca como texto
     reprova a restricao 1 do tema em qualquer superficie clara - 2.35:1 no branco
     com o laranja de 28/07, 2.41:1 no creme com o Orange de 06/08. */
  a { color: var(--acento-forte); }
  code, pre, .mono { font-family: var(--fonte-mono); font-size: .92em; }
  /* Numero em qualquer lugar sai tabular. Fora da tabela tambem: valor que muda
     de largura enquanto atualiza e valor que a pessoa le duas vezes. */
  .num, .valor, td.num, th.num { font-variant-numeric: ${TIPOGRAFIA.numero}; }

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
    display: flex; align-items: center; gap: 14px;
    padding: 9px 20px; background: var(--topo); color: var(--topo-texto);
    border-bottom: 1px solid var(--topo-veu);
  }
  /* Dentro da faixa escura, o que era '--fraco' (medido contra superficie CLARA)
     ficaria ilegivel. Os seletores abaixo existem por isso, e nao por estilo:
     rotulo, select e botao da sessao passaram a pousar no Navy. O branco
     translucido, e nao um token novo, porque ele funciona sobre AS DUAS variantes
     de navy - a do tema claro e a do escuro - sem virar duas cores para manter. */
  .barra .fraco, .barra .sub, .barra label { color: var(--topo-fraco); }
  .barra .campo-caixa select, .barra button {
    background: var(--topo-veu); color: var(--topo-texto);
    border-color: var(--topo-veu-forte);
  }
  .barra button:hover:not(:disabled) {
    background: var(--topo-veu-forte); color: var(--topo-texto);
    border-color: var(--topo-veu-forte);
  }
  .marca-app {
    display: inline-flex; align-items: center; gap: 9px;
    font-weight: 680; font-size: 15.5px; letter-spacing: -0.02em;
  }
  .marca-app .logotipo { flex: none; }
  .sessao { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .sessao .campo-caixa select { width: auto; max-width: 260px; padding: 5px 30px 5px 10px; }
  /* O nome de quem esta logado sai em tela estreita: o icone do menu continua
     clicavel e o nome esta dentro dele, no bloco de identidade. */
  @media (max-width: 720px) { .so-largo { display: none; } }

  /* A NAVEGACAO. O item ativo nao e uma aba: e um filete de marca embaixo mais um
     esfumado do --acento-suave subindo do rodape do item. A borda inferior de
     2px existe em TODOS os itens, transparente nos inativos - sem isso o ativo
     empurraria os vizinhos 2px para cima ao trocar de tela. */
  .barra-nav {
    display: flex; align-items: stretch; gap: 1px; overflow-x: auto;
    padding: 0 12px; background: var(--topo);
    border-bottom: 1px solid var(--borda); box-shadow: var(--sombra-1);
    scrollbar-width: thin;
  }
  .barra-nav a {
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
    padding: 9px 11px; text-decoration: none; color: var(--topo-fraco);
    font-size: 13.5px; font-weight: 500;
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
    color: var(--acento); font-weight: 600;
    border-bottom-color: var(--acento);
    background: var(--topo-ativo);
  }
  .barra-nav a.ativo .ic { color: var(--acento); }
  /* A divisoria entre cadastro e dinheiro. A fronteira e dado ('grupo', em
     navegacao.ts) e ate 29/07 era invisivel: doze abas iguais em fila. */
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
  .menu-painel .titulo {
    padding: 7px 10px 5px; font-size: 11px; font-weight: 650; color: var(--fraco);
    text-transform: uppercase; letter-spacing: .06em;
  }
  .menu-painel hr { border: 0; border-top: 1px solid var(--borda-suave); margin: 5px 4px; }
  .menu-painel button, .menu-painel .item {
    display: flex; align-items: center; gap: 9px; width: 100%;
    padding: 8px 10px; border: 0; border-radius: var(--raio-pequeno);
    background: none; box-shadow: none; color: var(--texto);
    font: inherit; font-size: 13.5px; text-align: left; cursor: pointer;
  }
  .menu-painel button:hover:not(:disabled) {
    background: var(--fundo-hover); color: var(--texto); border-color: transparent; transform: none;
  }
  .menu-painel button[aria-checked="true"] { color: var(--acento-forte); font-weight: 600; }
  .menu-painel .item { cursor: default; color: var(--fraco); }
  .menu-painel .ao-fim { margin-left: auto; }
  /* O bloco de identidade no alto do menu: quem esta logado e em qual empresa. */
  .menu-painel .quem { padding: 4px 10px 8px; }
  .menu-painel .quem strong { display: block; font-size: 13.5px; }
  .menu-painel .quem span { font-size: 12px; color: var(--fraco); }

  /* --------------------------------------------------- conteudo e tipografia
     O titulo ganhou peso e corpo (24 -> 27px, 650 -> 700) e a descricao encolheu
     e ficou mais discreta: era o pedido de hierarquia de 30/07. */
  .conteudo { max-width: var(--largura); margin: 0 auto; padding: 26px 20px 80px; }
  h1 { font-size: 27px; font-weight: 700; margin: 0 0 5px; letter-spacing: -0.025em; }
  h2 {
    font-size: 16px; font-weight: 650; margin: 30px 0 11px; letter-spacing: -0.01em;
    display: flex; align-items: center; gap: 8px;
  }
  h3 { font-size: 14px; font-weight: 650; margin: 0 0 8px; }
  .sub { color: var(--fraco); margin: 0 0 20px; font-size: 13.5px; max-width: 82ch; }
  .fraco { color: var(--fraco); }

  /* ---------------------------------------------------------- superficies */
  .cartao {
    border: 1px solid var(--borda); border-radius: var(--raio-cartao); padding: 16px;
    background: var(--fundo2); box-shadow: var(--sombra-1);
  }
  .rolagem {
    overflow-x: auto; border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); box-shadow: var(--sombra-1);
  }
  .vazio { padding: 40px 32px; text-align: center; color: var(--fraco); font-size: 13.5px; }

  /* -------------------------------------------------------------- tabela
     LINHA VERTICAL NENHUMA, e a horizontal e a --borda-suave (1.16:1 contra o
     branco): ela separa sem desenhar grade. O cabecalho nao se separa por linha
     e sim por SUPERFICIE - o --fundo-recuo, que e a terceira cor da paleta da G3
     e ate 29/07 estava sem uso. */
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; vertical-align: top; }
  thead th {
    padding: 10px 14px; background: var(--fundo-recuo); color: var(--fraco);
    font-weight: 650; font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
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
  th .ordenar .ic { opacity: .4; }
  th[aria-sort] .ordenar { color: var(--acento-forte); }
  th[aria-sort] .ordenar .ic { opacity: 1; }

  /* ---------------------------------------------------------- formulario */
  .campos { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  label { display: block; font-size: 12.5px; font-weight: 550; color: var(--fraco); margin-bottom: 5px; }
  input, select, textarea {
    width: 100%; padding: 8px 11px; border: 1px solid var(--borda); border-radius: var(--raio);
    background: var(--fundo2); color: var(--texto); font: inherit; font-size: 13.5px;
    transition: border-color .14s ease, box-shadow .14s ease, background-color .14s ease;
  }
  input::placeholder { color: var(--fraco); opacity: .75; }
  input:hover:not(:disabled), select:hover:not(:disabled) { border-color: var(--fraco); }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--foco); box-shadow: 0 0 0 3px var(--acento-suave);
  }
  input:disabled, select:disabled { opacity: .55; cursor: default; }
  input[type="file"] { padding: 6px 8px; font-size: 13px; }
  /* O BOTAO DO SELETOR DE ARQUIVO era a ultima peca nativa da tela: "Choose File /
     No file chosen", com desenho e IDIOMA do sistema operacional - aparecia em
     ingles num sistema em portugues. O texto continua sendo do browser (nao ha
     como troca-lo por CSS), mas a caixa agora e a nossa. */
  input[type="file"]::file-selector-button {
    margin-right: 10px; padding: 6px 12px; border-radius: var(--raio-pequeno);
    border: 1px solid var(--borda); background: var(--fundo2); color: var(--texto);
    font: inherit; font-size: 13px; font-weight: 550; cursor: pointer;
    box-shadow: var(--sombra-1); transition: border-color .14s ease, color .14s ease;
  }
  input[type="file"]::file-selector-button:hover {
    border-color: var(--acento); color: var(--acento-forte);
  }

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
    position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
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
    border-color: var(--foco); background: var(--fundo2); box-shadow: 0 0 0 3px var(--acento-suave);
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
    font: inherit; font-size: 13.5px; color: var(--texto);
  }
  .interruptor:hover:not(:disabled) { background: none; border-color: transparent; transform: none; color: var(--texto); }
  .interruptor .trilho {
    width: 38px; height: 22px; flex: none; padding: 3px;
    border-radius: var(--raio-pilula); background: var(--borda);
    border: 1px solid var(--borda); display: flex; align-items: center;
    transition: background-color .2s ease, border-color .2s ease;
  }
  .interruptor .pino {
    width: 16px; height: 16px; border-radius: var(--raio-pilula);
    background: var(--fundo2); box-shadow: var(--sombra-1);
    transition: transform .2s cubic-bezier(.4, 0, .2, 1);
  }
  .interruptor[aria-checked="true"] .trilho { background: var(--acento); border-color: var(--acento); }
  .interruptor[aria-checked="true"] .pino { transform: translateX(16px); }
  .interruptor:disabled { opacity: .55; cursor: default; }

  /* ---------------------------------------------------------- botoes
     O botao ganhou sombra do primeiro degrau e sobe 1px no hover. O "sobe" e o
     que da a leitura tatil sem animacao nenhuma tocando o layout: transform nao
     reflui a pagina. */
  button {
    position: relative; overflow: hidden;
    padding: 8px 14px; border-radius: var(--raio); border: 1px solid var(--borda);
    background: var(--fundo2); color: var(--texto); font: inherit; font-size: 13.5px;
    font-weight: 550; cursor: pointer; box-shadow: var(--sombra-1);
    display: inline-flex; align-items: center; gap: 7px; justify-content: center;
    transition: border-color .14s ease, color .14s ease, background-color .14s ease,
                box-shadow .16s ease, transform .12s ease;
  }
  button:hover:not(:disabled) {
    border-color: var(--acento); color: var(--acento-forte);
    box-shadow: var(--sombra-2); transform: translateY(-1px);
  }
  button:active:not(:disabled) { transform: translateY(0) scale(.985); box-shadow: var(--sombra-1); }
  button.primario {
    background: var(--acento); border-color: var(--acento); color: var(--acento-texto);
    font-weight: 650; box-shadow: var(--sombra-2);
  }
  /* O hover do botao primario ESCURECE (--acento-hover), nunca clareia: clarear
     derruba o contraste do texto e "apaga" o botao - e a regra documentada no
     proprio token, vinda da pesquisa de 29/07. */
  button.primario:hover:not(:disabled) {
    background: var(--acento-hover); border-color: var(--acento-hover); color: var(--acento-texto);
  }
  /* O BRILHO QUE ATRAVESSA o botao primario uma vez, no hover. Uma faixa de luz
     inclinada, 700ms, uma passada - e nao um loop: chamar atencao para onde o
     ponteiro ja esta seria ruido. */
  button.primario::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, var(--brilho) 50%, transparent 65%);
    opacity: 0; transform: translateX(-120%);
  }
  button.primario:hover:not(:disabled)::after { animation: atravessar .7s ease-out; }
  /* A EXPANSAO TATIL do clique: um anel que cresce do centro e se apaga. */
  button.primario::before {
    content: ""; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px;
    margin: -4px 0 0 -4px; border-radius: var(--raio-pilula); pointer-events: none;
    background: var(--acento-texto); opacity: 0;
  }
  button.primario:active:not(:disabled)::before { animation: ondular .45s ease-out; }
  button:disabled { opacity: .5; cursor: default; box-shadow: none; }
  button.discreto { border-color: transparent; background: none; box-shadow: none; color: var(--fraco); }
  button.discreto:hover:not(:disabled) { background: var(--fundo-hover); color: var(--texto); border-color: transparent; }

  /* O BOTAO DE ICONE - o que era "OK" ao lado do input da tabela. Redondo, 30px,
     sombra do primeiro degrau. Ele SEMPRE leva 'aria-label', senao o botao fica
     sem nome para quem usa leitor de tela: ver 'BotaoDeIcone' no ui.tsx. */
  button.so-icone {
    width: 30px; height: 30px; padding: 0; flex: none;
    border-radius: var(--raio-pilula);
  }
  button.so-icone.grande { width: 34px; height: 34px; }

  a:focus-visible, button:focus-visible, th .ordenar:focus-visible, .interruptor:focus-visible {
    outline: 2px solid var(--foco); outline-offset: 2px;
  }

  /* ------------------------------------------------------------- avisos
     A FAIXA LATERAL GROSSA no lugar do retangulo colorido inteiro. O que era
     "banner rosa" virou superficie de cartao com 4px de cor na borda esquerda,
     icone na cor do estado e o TEXTO em --texto: aviso de erro com dois
     paragrafos escritos em vermelho e mais difícil de ler que o proprio erro. */
  .aviso {
    display: flex; align-items: flex-start; gap: 11px;
    padding: 12px 14px; margin: 12px 0; font-size: 13.5px;
    background: var(--fundo2); border: 1px solid var(--borda);
    border-left: 4px solid currentColor; border-radius: var(--raio);
    box-shadow: var(--sombra-1);
  }
  .aviso > .ic { margin-top: 2px; }
  .aviso .corpo { color: var(--texto); flex: 1; min-width: 0; }
  .aviso.erro { color: var(--erro); background: var(--erro-fundo); }
  .aviso.ok { color: var(--ok); background: var(--ok-fundo); }
  .aviso.alerta { color: var(--alerta); background: var(--alerta-fundo); }

  /* ------------------------------------------------------- pilula de estado
     PREENCHIDA SUAVE desde 30/07, com icone e texto dentro. A separacao do
     acento passou a ser de PESO (o acento e preenchido solido) e nao mais de
     contorno - a nota de adjacencia do tema.ts registra a troca. */
  .marca {
    display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    font-size: 11.5px; font-weight: 600; padding: 3px 9px 3px 7px;
    border-radius: var(--raio-pilula); border: 1px solid transparent;
    transition: transform .14s ease;
  }
  .marca.ok { background: var(--ok-fundo); color: var(--ok); }
  .marca.pendente { background: var(--erro-fundo); color: var(--erro); }
  .marca.nao_medido { background: var(--alerta-fundo); color: var(--alerta); }
  .marca:hover .ic { transform: scale(1.18); }

  /* ------------------------------------------------------ busca e filtros
     A AREA DE FILTRO E UMA SUPERFICIE, nao um punhado de campos soltos: cartao
     proprio, borda fina e sombra do primeiro degrau. Foi o pedido de "usar
     sombras sutis para destacar a area de filtros". */
  .ferramentas {
    display: flex; gap: 9px; align-items: center; flex-wrap: wrap; margin: 0 0 14px;
    padding: 10px 12px; background: var(--fundo2);
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    box-shadow: var(--sombra-1);
  }
  .ferramentas select, .ferramentas .campo-caixa select { width: auto; }
  .ferramentas .contagem { margin-left: auto; font-size: 12.5px; color: var(--fraco); }
  .busca { position: relative; }
  .busca input { padding-left: 34px; width: 260px; }
  .busca .adorno-esquerda { position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
    color: var(--fraco); pointer-events: none; }
  .busca input:focus + .adorno-esquerda { color: var(--acento-forte); }

  /* ------------------------------------------------- cartoes de metrica
     A BORDA GROSSA SAIU. Era 'border-left: 3px solid var(--acento)', e o pedido
     de 30/07 foi trocar borda generica por borda finissima mais sombra, para o
     cartao FLUTUAR. A presenca de marca migrou para o icone de fundo: grande,
     em --acento, com 10% de opacidade. */
  .kpis { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0 0 18px; }
  .kpi {
    position: relative; overflow: hidden;
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); padding: 14px 16px; box-shadow: var(--sombra-2);
    transition: box-shadow .18s ease, transform .18s ease;
  }
  .kpi:hover { box-shadow: var(--sombra-3); transform: translateY(-2px); }
  .kpi .marca-dagua {
    position: absolute; right: 10px; bottom: 6px; color: var(--acento);
    opacity: .11; pointer-events: none;
  }
  .kpi:hover .marca-dagua { opacity: .16; }
  .kpi .nome {
    font-size: 11px; color: var(--fraco); text-transform: uppercase;
    letter-spacing: .07em; font-weight: 650; margin-bottom: 3px;
  }
  .kpi .valor { font-size: 23px; font-weight: 680; letter-spacing: -0.02em; position: relative; }
  .kpi .valor.sim-nao { display: flex; align-items: center; gap: 8px; font-size: 20px; }

  /* --------------------------------------------------------- carregando
     A ENGRENAGEM COM O SOL DA G3 DENTRO. Foi o pedido literal de 30/07 para o
     feedback de carga, e o desenho e o que ele descreve: a engrenagem gira, o
     sol fica parado no centro. Um dos dois em movimento le como mecanismo; os
     dois girando le como defeito. */
  .carregando { display: inline-flex; align-items: center; gap: 10px; color: var(--fraco); font-size: 13.5px; }
  .marca-girando { position: relative; width: 26px; height: 26px; flex: none; color: var(--acento); }
  .marca-girando .ic-engrenagem { position: absolute; inset: 0; }
  .marca-girando .logotipo { position: absolute; left: 50%; top: 50%; margin: -6px 0 0 -6px; }

  /* O ESQUELETO das faixas de numero, enquanto o valor nao chegou. Ele existe
     para a pagina nao PULAR quando o dado chega - reservar a altura e o ponto,
     nao a animacao. */
  .esqueleto {
    border-radius: var(--raio-pequeno); min-height: 1em;
    background: linear-gradient(90deg, var(--fundo-recuo), var(--fundo-hover), var(--fundo-recuo));
    background-size: 220% 100%; color: transparent;
  }

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
  @keyframes atravessar {
    from { opacity: 0; transform: translateX(-120%); }
    30% { opacity: .5; }
    to { opacity: 0; transform: translateX(120%); }
  }
  @keyframes ondular {
    from { opacity: .35; transform: scale(1); }
    to { opacity: 0; transform: scale(22); }
  }
  @keyframes descer-suave {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes deslizar-brilho {
    from { background-position: 220% 0; }
    to { background-position: -20% 0; }
  }

  .ic-carregando { animation: girar .9s linear infinite; }
  .ic-engrenagem { animation: girar 3.2s linear infinite; }
  .aviso.erro > .ic-aviso_erro { animation: pulsar 1.1s ease-in-out 2; }
  .aviso.ok > .ic-aviso_ok { animation: traco-do-check .42s ease-out; }
  .ic-sim { animation: traco-do-check .5s ease-out; }
  .ic-nao { animation: traco-do-check .5s ease-out; }
  .esqueleto { animation: deslizar-brilho 1.5s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    /* WCAG 2.3.3. Nao e cortesia: ha gente para quem movimento na tela e
       sintoma. A regra desliga ANIMACAO e TRANSICAO de tudo, inclusive o que
       vier depois desta linha - e por isso ela e a ultima palavra da secao. */
    *, *::before, *::after {
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
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

  /* ------------------------------------------------ a FOLHA (migration 23)
     A GEOMETRIA DA TELA E A DO PAPEL, E ISSO E O CONSERTO.

     Antes, a previa era "max-width: 800px; padding: 32px" e o papel era
     "width: 100%" com "@page { margin: 16mm }" - DUAS geometrias diferentes,
     entao a previa nao respondia "e assim que vai sair?". Ela conferia
     conteudo, nao forma.

     Agora a folha tem a largura e a altura EXATAS do papel escolhido, em mm, e
     a tela so a ESCALA ("transform", com a escala vinda de "escalaDaPrevia").
     Escalar nao muda proporcao nenhuma: o que se ve e o que sai.

     "--folha-w", "--folha-h" e "--escala" sao escritas pelo componente, porque
     dependem do papel que o tenant gravou. A regra "@page" correspondente e
     injetada em "<style>" por "regraDaPagina" - "size" nao aceita variavel. */
  .folha {
    position: relative;
    width: var(--folha-w); height: var(--folha-h);
    background: #fff; color: #14213D;
    box-shadow: var(--sombra-2); border: 1px solid var(--borda);
    overflow: hidden;
  }
  .folha-palco { transform: scale(var(--escala, 1)); transform-origin: top left; }
  /* A area util, desenhada como guia. Some na impressao - e guia, nao conteudo. */
  .folha .margem-guia {
    position: absolute; border: 1px dashed var(--borda); pointer-events: none;
  }
  .bloco { position: absolute; overflow: hidden; box-sizing: border-box; }
  .bloco table { width: 100%; border-collapse: collapse; }
  .bloco table td { padding: 4px 2px; border-bottom: 1px solid #E4DFD4; }
  .bloco-borda { border: 1px solid #14213D; }
  /* O CREME DA MARCA, e nao um cinza: e o bloco "secundario" da paleta de 06/08
     ("Cream - fundo geral da pagina e de blocos secundarios, tarjas de corte"),
     aplicado ao unico lugar do papel que tem esse papel. Continua sendo UMA cor
     e nao "quase igual" a outra - a lista deste bloco e fechada de proposito. */
  .bloco-fundo { background: #F6F2EA; }

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
    #documento .folha {
      width: var(--folha-w); height: var(--folha-h);
      border: none; box-shadow: none;
    }
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
    #documento .folha { break-inside: avoid; page-break-inside: avoid; }
    /* O RECORTE DA TELA NAO PODE VIAJAR PARA O PAPEL. Na previa, a folha vive
       dentro de uma caixa de altura ESCALADA com "overflow: hidden" - e isso
       so existe para a pagina nao ficar com um vao branco embaixo do zoom.
       Impresso, a folha volta ao tamanho real e a caixa a cortaria em ~30% da
       altura. Antes isto nao aparecia por acidente: a folha ERA o
       "position: absolute" da regra acima e escapava do pai que a cortava. */
    #documento .folha-recorte { height: auto !important; overflow: visible !important; }
    .folha-palco { transform: none !important; }
    .folha .margem-guia { display: none !important; }
    /* SEM "@page" AQUI. O papel e do tenant e a regra e injetada em runtime por
       "regraDaPagina" - "size" nao aceita "var()". Deixar um "@page" fixo neste
       arquivo faria ele competir com o injetado, e quem venceria dependeria da
       ordem de insercao das folhas de estilo. */
  }
  /* FIM-DOCUMENTO-IMPRESSO */

  /* -------------------------------------------------------------- login
     O centro da tela, com o brilho quente da marca no alto. */
  .central {
    min-height: 100dvh; display: grid; place-items: center; padding: 20px;
    background: radial-gradient(70% 50% at 50% 0%, var(--acento-suave), transparent 70%);
  }
`;
