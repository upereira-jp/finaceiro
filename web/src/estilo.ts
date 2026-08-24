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
  .menu-painel .titulo { padding: 7px 10px 5px; color: var(--fraco); }
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
       primario      herda o laranja da marca, o brilho do hover e a expansao do
                     clique do resto do sistema. Ver o cabecalho do componente. */
  .ajuda-gatilho {
    position: fixed; right: 22px; bottom: 22px; z-index: 30;
    width: 54px; height: 54px; padding: 0;
    border-radius: var(--raio-pilula);
    box-shadow: var(--sombra-3);
  }
  .ajuda-gatilho:hover:not(:disabled) { box-shadow: var(--sombra-forte); }

  /* O BALAO DE PRIMEIRA VISITA. Um icone sozinho num canto e mudo, e quem entra
     pela primeira vez nao tem por que saber que aquele desenho responde
     perguntas. NAO E MODAL de proposito: nao escurece a tela, nao prende foco e
     nao impede clicar em nada atras — um aviso que interrompe o trabalho para
     dizer "existe ajuda" e o contrario de ajudar. */
  .ajuda-balao {
    position: fixed; right: 22px; bottom: 100px; z-index: 31;
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
  .ajuda-balao strong { display: block; font-size: 13.5px; }
  .ajuda-balao p { margin: 3px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--fraco); }
  /* O "x" BEM PEQUENO, no canto superior direito — pedido ao pe da letra. Mesmo
     pequeno ele tem 20px de alvo e nome acessivel: um alvo minusculo sem nome e
     enfeite, nao botao de fechar. */
  .ajuda-balao-x {
    position: absolute; top: 3px; right: 3px;
    width: 20px; height: 20px; padding: 0; flex: none;
    border-radius: var(--raio-pilula); border-color: transparent;
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
  .ajuda-bolha-1 { right: 40px; bottom: 79px; width: 8px; height: 8px; animation-delay: .05s; }
  .ajuda-bolha-2 { right: 32px; bottom: 88px; width: 12px; height: 12px; animation-delay: .13s; }

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
    font-size: 12px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .06em; color: var(--fraco); margin: 0 0 9px;
  }
  .ajuda-nota { font-size: 12.5px; line-height: 1.55; margin: 0 0 10px; }

  /* O ESTADO AO VIVO. Uma linha por pendencia real do mes, com o numero dentro
     da frase - "11 de 29 pendentes" - e o botao que leva ao lugar de resolver. */
  .ajuda-passos { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .ajuda-passos li {
    display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
    padding: 10px 12px; border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno); background: var(--fundo2);
  }
  .ajuda-frase { font-size: 13px; line-height: 1.45; flex: 1 1 200px; }
  .ajuda-efeito {
    font-size: 11px; padding: 2px 8px; border-radius: var(--raio-pilula);
    background: var(--alerta-fundo); color: var(--alerta); white-space: nowrap;
  }
  .ajuda-ir {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; font-size: 12.5px; font-weight: 600;
    border: 1px solid var(--borda); border-radius: var(--raio-pequeno);
    background: var(--fundo); color: var(--acento-forte); cursor: pointer;
  }
  .ajuda-ir:hover { background: var(--acento-suave); border-color: var(--acento); }
  /* A seta do botao aponta para a DIREITA: o desenho reusado e o "descer" do
     resto do sistema, girado - um icone proprio so para isto seria mais um nome
     na uniao fechada para dizer a mesma coisa. */
  .ajuda-ir .ic { transform: rotate(-90deg); }

  /* O CAMINHO DE "VER" E MAIS LEVE QUE O DE "RESOLVER", e a diferenca nao e
     decoracao: um leva ao formulario onde o dado ENTRA, o outro a tela onde ele
     so APARECE. Pintar os dois iguais mandaria alguem procurar em Usinas um
     campo de energia gerada que nao existe la - nem em lugar nenhum, porque
     aquele numero e espelhado do CRM. */
  .ajuda-ir-ver { color: var(--fraco); font-weight: 550; }
  .ajuda-ir-ver:hover { color: var(--acento-forte); }

  /* Os botoes de caminho quebram linha em vez de esticarem a coluna: um rotulo
     como "Antes: confirmar o CPF ou CNPJ" nao cabe ao lado de outro em 460px. */
  .ajuda-caminhos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }

  .ajuda-tudo-certo {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--ok); margin: 0;
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
    color: var(--texto); font: inherit; font-size: 13.5px; font-weight: 600;
    text-align: left; cursor: pointer;
  }
  .ajuda-pergunta:hover { color: var(--acento-forte); transform: none; }
  .ajuda-pergunta .ic { margin-top: 3px; flex: none; }
  .ajuda-resposta { padding: 0 2px 14px 22px; font-size: 13px; line-height: 1.6; }
  .ajuda-resposta p { margin: 0 0 10px; color: var(--fraco); }
  .ajuda-resposta ol { margin: 0 0 12px; padding-left: 18px; display: grid; gap: 6px; }
  /* O PORQUE E VISUALMENTE DIFERENTE DO RESTO, e nao por enfeite: ele responde
     outra pergunta que a resposta e os passos. A barra a esquerda o separa sem
     pedir uma cor propria - o painel ja tem cores demais disputando atencao. */
  .ajuda-porque {
    border-left: 2px solid var(--borda);
    padding: 2px 0 2px 10px;
    margin: 0 0 12px !important;
  }
  .ajuda-porque strong { color: var(--texto); font-weight: 600; }

  .ajuda-termo { padding: 9px 0; border-bottom: 1px solid var(--borda-suave); }
  .ajuda-termo:last-child { border-bottom: 0; }
  .ajuda-termo strong { display: block; font-size: 13.5px; }
  .ajuda-termo p { margin: 4px 0 0; font-size: 13px; line-height: 1.6; color: var(--fraco); }

  @keyframes entrar-da-direita { from { transform: translateX(16px); opacity: 0; } }
  @keyframes surgir { from { opacity: 0; } }

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
  /* O RITMO ENTRE SECOES SAI DE UM TOKEN desde 14/08. Ele era o literal
     "style={{ marginBottom: 20 }}" escrito a mao DEZESSETE vezes em dez telas, e
     a aba Documento empilhava com "var(--gap)" (12px) - os dois valores na MESMA
     pagina. Uma classe, um token, e o proximo cartao para de escolher um terceiro
     numero. */
  .secao { margin-bottom: var(--gap-secao); }
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
  /* O ROTULO CAIXA-ALTA SAI DE UM TOKEN SO desde 14/08. Eram cinco combinacoes de
     peso e tracking para o mesmo papel - ver a nota de "rotuloTamanho" no
     "tema.ts". Esta e a definicao; as outras quatro regras a herdam. */
  .rot-alta, thead th, .kpi .nome, .menu-painel .titulo, .fu-rotulo, .fu-painel-rot {
    font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
    text-transform: uppercase; letter-spacing: var(--rotulo-tracking);
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
  .campos { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  label { display: block; font-size: 12.5px; font-weight: 550; color: var(--fraco); margin-bottom: 5px; }
  input, select, textarea {
    width: 100%; padding: 8px 11px; border: 1px solid var(--borda); border-radius: var(--raio);
    background: var(--fundo2); color: var(--texto); font: inherit; font-size: 13.5px;
    transition: border-color .14s ease, box-shadow .14s ease, background-color .14s ease;
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
    border-color: var(--fraco);
  }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--foco); box-shadow: 0 0 0 3px var(--acento-suave);
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
  /* O CONTORNO DO TRILHO E "--fraco", E NAO "--borda". Medido em 14/08: a
     "--borda" sobre o cartao da 1,50:1 no claro e 1,23:1 no escuro - e o trilho
     E o limite de um controle de formulario, que a WCAG 1.4.11 pede a 3:1. No
     tema claro NENHUM dos dois estados chegava la (ligado dava 2,69:1). Dois
     interruptores deste sistema decidem "sandbox" e "ativo" do conector de
     cobranca, que e onde um clique errado emite cobranca de verdade. */
  .interruptor .trilho {
    width: 38px; height: 22px; flex: none; padding: 3px;
    border-radius: var(--raio-pilula); background: var(--fundo-recuo);
    border: 1px solid var(--fraco); display: flex; align-items: center;
    transition: background-color .2s ease, border-color .2s ease;
  }
  .interruptor .pino {
    width: 16px; height: 16px; border-radius: var(--raio-pilula);
    background: var(--fundo2); box-shadow: var(--sombra-1);
    transition: transform .2s cubic-bezier(.4, 0, .2, 1);
  }
  /* Ligado: o preenchimento continua sendo o acento - e o sinal da marca -, e
     quem carrega os 3:1 do CONTORNO e o "--acento-forte", que e o token que
     existe para o laranja em superficie clara (5,60:1 claro, 6,88:1 escuro). */
  .interruptor[aria-checked="true"] .trilho { background: var(--acento); border-color: var(--acento-forte); }
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
  /* DESABILITADO E TOKEN, pelo mesmo motivo dos campos acima. "opacity: .5" no
     botao PRIMARIO fazia o alfa cair sobre o proprio acento: 2,83:1 no claro e
     **1,85:1** no escuro, medido em 14/08. Um botao desabilitado tem de parecer
     desabilitado E continuar legivel - quem le "Compor os 28 documentos" apagado
     precisa saber o que esta apagado para descobrir o que destrava. O "!important"
     nao entra: a regra vem depois da do primario e tem a classe a mais. */
  button:disabled, button.primario:disabled {
    background: var(--fundo-recuo); color: var(--fraco); border-color: var(--borda);
    cursor: default; box-shadow: none; opacity: 1; transform: none;
  }
  /* E os dois enfeites do primario nao acontecem quando ele esta desabilitado. */
  button.primario:disabled::after, button.primario:disabled::before { display: none; }
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
  /* SEM HOVER. A pilula e ROTULO, nao controle - "Marca" renderiza um "<span>".
     Ver a nota do ".kpi" acima: movimento sob o mouse e promessa de clique. */

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
  .kpi .nome { color: var(--fraco); margin-bottom: 3px; }
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

  .ic-carregando { animation: girar .9s linear infinite; }
  .ic-engrenagem { animation: girar 3.2s linear infinite; }
  .aviso.erro > .ic-aviso_erro { animation: pulsar 1.1s ease-in-out 2; }
  .aviso.ok > .ic-aviso_ok { animation: traco-do-check .42s ease-out; }
  .ic-sim { animation: traco-do-check .5s ease-out; }
  .ic-nao { animation: traco-do-check .5s ease-out; }

  /* ======================= A ABA DOCUMENTO É A REFERÊNCIA (14/08/2026)
     PEDIDO DO DONO, literal: *"quero ajustar o layout da interface da aba
     documentos. A referência exata deve ser g3-fatura-unificada.vercel.app, sem
     tirar nem por, deve ser exatamente igual, com bordas iguais, sistema de
     cores, tipografia"*.

     DE ONDE SAEM OS NÚMEROS. Do template desempacotado do commit "36e964e" — o
     mesmo bundle que a Vercel serve —, não de olhar a página renderizada. O
     repositório da referência é "index.html" com o app inteiro em base64 gzipado
     dentro de um manifesto "__bundler"; o desempacotamento devolve 16 KB de DOM
     com "style" inline em cada elemento, e é dele que vem cada "padding", cada
     "1px solid" e cada "letter-spacing" abaixo. É a mesma fonte de "REFERENCIA-
     fatura-unificada-2026-08-13.md".

     ============================ O QUE MUDA EM RELAÇÃO AO RESTO DO SISTEMA
     Esta seção é uma ILHA, e ela é declarada: tudo aqui é prefixado por ".g3ref",
     que "documento.tsx" põe uma vez, em volta da aba inteira. Nenhuma regra
     escapa para as outras onze telas — e é por isso que as diferenças abaixo
     podem existir sem virar duas gramáticas no mesmo sistema:

       raio          12/8/6px  ->  ZERO. A referência não tem um canto arredondado
       sombra        3 degraus ->  NENHUMA. Só a folha A4 tem sombra, e ela já tinha
       fonte         Inter     ->  Barlow + Barlow Semi Condensed (ver "tema.ts")
       entrelinha    1.5       ->  "normal". A referência não declara nenhuma, e
                                   "normal" na Barlow é ~1,2 — o texto fecha mais
       tinta apagada o derivado ->  o Gray puro da referência (ver "tema.ts")

     ============================ O QUE **NÃO** VEIO, e são três, todas nomeadas
     "Sem tirar nem por" vale para desenho. Estas três não são desenho:

       1. O ÍCONE DO ".fu-status" e do ".aviso" FICA. A referência diz sucesso e
          falha com 13px de texto colorido e mais nada — quem não separa laranja
          de verde lê as duas iguais. É a restrição 3 do tema ("cor nunca é o
          único sinal"), e ela não é sobre borda, cor nem tipografia.
       2. O ANEL DE FOCO DE BOTÃO FICA. A referência desenha foco só em "input" e
          "textarea"; botão fica sem sinal nenhum para quem navega por teclado. O
          anel daqui usa o laranja DELA, então não introduz cor nova.
       3. A BARRA NAVY DA REFERÊNCIA NÃO ENTROU — decisão do dono na mesma
          consulta ("Só o conteúdo"). Ela carrega logo, assinatura e as abas de
          etapa, e o sistema já tem uma faixa navy no topo com logo e as doze
          abas. Duas faixas navy empilhadas seriam a referência copiada e a tela
          piorada. As abas de etapa herdaram o desenho dela; o resto, não.

     O PREFIXO "fu-" CONTINUA, e não virou "g3ref-": ele nomeia o que a esteira de
     conferência É (fatura unificada), e ".g3ref" nomeia de onde o DESENHO vem.
     São duas perguntas diferentes e a segunda é a que pode mudar de resposta. */

  /* --------------------------------------------------------------- o escopo */
  .g3ref {
    font-family: var(--g3ref-fonte);
    color: var(--g3ref-tinta);
    /* A Inter pede "-0.011em" em corpo de texto e a Barlow não pede nada — a
       referência não declara "letter-spacing" em lugar nenhum fora dos rótulos
       em caixa alta. Herdar o tracking da Inter apertaria a Barlow inteira. */
    letter-spacing: normal;
    /* 16px é o padrão do browser, e é o que a referência usa: o "body" dela não
       declara "font-size". O sistema usa 15px. A diferença aparece só onde nem
       ela nem nós damos tamanho explícito — que é quase lugar nenhum. */
    font-size: 16px;
    line-height: normal;
  }

  /* -------------------------------------------------- as abas de etapa
     O DESENHO É O DA BARRA NAVY DA REFERÊNCIA, com uma troca obrigatória: lá as
     abas pousam sobre o navy e a inativa é o cinza-claro dela, que sobre o creme desta
     página daria 1,6:1 — ilegível. A inativa aqui é a tinta apagada da própria
     referência ("--g3ref-apagado"); a ATIVA é idêntica, laranja cheio e tinta branca.
     Mesma decisão para o traço separador: o dela é navy-sobre-navy. */
  .g3ref .fu-abas {
    display: flex; align-items: center; gap: 10px;
    border-bottom: 0; padding-bottom: 0; margin-bottom: 22px;
  }
  /* A ESPECIFICIDADE FOI DEFEITO MEDIDO EM 14/08 e continua valendo aqui:
     "button:hover:not(:disabled)" lá em cima é (0,2,1), e uma regra de aba com
     (0,2,0) perde para ela — a aba pegava sombra e "translateY". Com ".g3ref"
     na frente estas são (0,3,x) e ganham. O invariante I7 prende isto. */
  .g3ref .fu-aba {
    background: transparent; border: none; border-radius: 0; box-shadow: none;
    padding: 9px 16px; margin-bottom: 0;
    font-family: var(--g3ref-fonte-cond); font-size: 15px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--g3ref-apagado); cursor: pointer;
    transition: background-color .16s ease, color .16s ease;
  }
  .g3ref .fu-aba:hover:not(:disabled) {
    background: transparent; color: var(--g3ref-tinta);
    border-color: transparent; box-shadow: none; transform: none;
  }
  .g3ref .fu-aba:active:not(:disabled) { transform: none; box-shadow: none; }
  .g3ref .fu-aba[aria-selected="true"] {
    background: var(--g3ref-laranja); color: var(--g3ref-laranja-tinta);
    border-color: transparent;
  }
  .g3ref .fu-aba[aria-selected="true"]:hover:not(:disabled) {
    background: var(--g3ref-laranja-hover); color: var(--g3ref-laranja-tinta);
  }
  .g3ref .fu-aba-traco { width: 26px; height: 1px; background: var(--g3ref-borda-campo); }

  /* "NOVA FATURA" — na referência ela mora numa faixa própria, encostada à
     direita, logo acima da grade. Aqui ela fica no fim da mesma linha das abas,
     que é a MESMA posição na tela; o desenho é o dela, sem tirar nem pôr. */
  .g3ref .fu-acao {
    background: transparent; border: 1px solid var(--g3ref-tinta); border-radius: 0;
    color: var(--g3ref-tinta); padding: 11px 20px; box-shadow: none;
    font-family: var(--g3ref-fonte-cond); font-size: 15px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
  }
  .g3ref .fu-acao:hover:not(:disabled) {
    background: var(--g3ref-tinta); color: var(--g3ref-tinta-invertida);
    border-color: var(--g3ref-tinta); box-shadow: none; transform: none;
  }

  /* ------------------------------------------------------------- a grade
     "380px 1fr" é literal da referência, e o 380 é o que faz a coluna da
     esquerda caber o painel navy com "R$ 1.234,56" em 52px sem quebrar. A nossa
     ".conteudo" tem 1120px de caixa útil contra os 1124px dela — 4px, e a coluna
     fixa é idêntica. Abaixo de 1100px as duas empilham, a esquerda primeiro,
     que é por onde o trabalho começa. */
  .g3ref .fu-grade { display: grid; grid-template-columns: 380px 1fr; gap: 24px; align-items: start; }
  .g3ref .fu-coluna { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  @media (max-width: 1100px) { .g3ref .fu-grade { grid-template-columns: 1fr; } }

  /* ----------------------------------------------------------- o cartão
     22px na esquerda, 26px na direita — são os dois valores da referência, e a
     diferença não é descuido dela: a coluna da direita é a que se lê campo a
     campo e ganha 4px de respiro. Zero raio, zero sombra: o cartão se separa do
     creme pelo branco e por uma linha de 1px, e é só. */
  .g3ref .cartao {
    background: var(--g3ref-papel); border: 1px solid var(--g3ref-borda);
    border-radius: 0; box-shadow: none; padding: 22px;
  }
  .g3ref .fu-grade > .cartao { padding: 26px; }
  .g3ref .secao { margin-bottom: 18px; }

  /* ---------------------------------------------------- o rótulo em caixa alta
     A referência escreve "font-family: 'Barlow Semi Condensed'" sessenta e uma
     vezes contra UMA da Barlow: a condensada é a fonte de superfície dela, não a
     exceção. Peso 400 porque ela não declara peso nenhum nestes rótulos — e a
     regra ".rot-alta, thead th, …, .fu-rotulo" lá em cima é (0,1,0), então esta,
     com ".g3ref" na frente, ganha sem "!important". */
  .g3ref .fu-rotulo, .g3ref .fu-painel-rot {
    font-family: var(--g3ref-fonte-cond); font-size: 12px; font-weight: 400;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--g3ref-apagado); margin-bottom: 14px;
  }

  /* A LEGENDA MIÚDA — "Instruções do boleto", "Linha digitável", "PIX copia e
     cola". Na referência elas NÃO são rótulo em caixa alta: são 13px de Barlow
     apagada, com margem "14px 0 3px". Eram ".fu-rotulo" aqui até hoje, e por
     isso saíam em caixa alta condensada, que é outra coisa. */
  .g3ref .fu-legenda {
    font-family: var(--g3ref-fonte); font-size: 13px; font-weight: 400;
    text-transform: none; letter-spacing: normal;
    color: var(--g3ref-apagado); margin: 14px 0 3px;
  }
  .g3ref .fu-legenda .fraco { color: var(--g3ref-borda-forte); }

  /* ------------------------------------------------------- a área de envio
     "<label>" e não "<div onClick>": o input de arquivo mora dentro dela, então
     clicar na área é clicar no input, sem uma linha de JavaScript no meio.

     A BORDA VOLTOU A 1px TRACEJADO, que é a da referência. Em 14/08 ela tinha
     virado "2px dashed var(--fraco)" por medição de contraste (1.4.11 pede 3:1
     para contorno de controle, e a "--borda" dava 1,50:1). A borda forte da
     referência sobre o creme dá 1,66:1 e reprova pelo mesmo critério — entra
     junto com o resto da decisão de tinta exata do dono, e está em "Q-DOCG3-15".
     O que segura a área continua existindo e não é a borda: são os 19px do
     título e o anel de foco laranja. */
  .g3ref .fu-solta {
    display: block; border: 1px dashed var(--g3ref-borda-forte); border-radius: 0;
    background: var(--g3ref-fundo); padding: 24px 18px; text-align: center; cursor: pointer;
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
   * regra ":focus-within" abaixo nunca dispararia. A referência usa "display:
   * none" e tem esse defeito; ele não é desenho, e por isso não veio.
   */
  .g3ref .fu-solta input[type="file"] {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  .g3ref .fu-solta:hover { border-color: var(--g3ref-laranja); background: var(--g3ref-solta-hover); }
  .g3ref .fu-solta:focus-within { border-color: var(--g3ref-laranja); outline: 2px solid var(--g3ref-laranja); outline-offset: 0; }
  .g3ref .fu-solta-titulo { font-family: var(--g3ref-fonte-cond); font-size: 19px; font-weight: 600; }
  .g3ref .fu-solta.curta .fu-solta-titulo { font-size: 18px; }
  .g3ref .fu-solta-sub { font-size: 13px; color: var(--g3ref-apagado); margin-top: 4px; }

  /* ------------------------------------------------------------- o status
     13px apagado, como na referência. O ÍCONE FICA — ver a nota 1 do cabeçalho
     desta seção. As três margens são as dela: 12px depois do envio da fatura,
     10px no caso geral, 6px colado no campo que acabou de ser digitado. */
  .g3ref .fu-status {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 13px; color: var(--g3ref-apagado); margin-top: 10px; line-height: 1.45;
  }
  .g3ref .fu-status > .ic { margin-top: 2px; }
  .g3ref .fu-status.solto { margin-top: 12px; }
  .g3ref .fu-status.rente { margin-top: 6px; }
  .g3ref .fu-status.ok { color: var(--ok); }
  .g3ref .fu-status.alerta { color: var(--alerta); }

  /* ------------------------------------------------------ o painel navy
     O único bloco de fundo cheio da tela, e o motivo é de uso: quem opera abre a
     aba, sobe o PDF e precisa deste número para digitar no internet banking — ele
     não pode estar no meio de trinta campos. 52px é o tamanho da referência, e é
     três vezes o do valor ao lado; era 30px aqui.

     OS TOKENS "--g3ref-navy-*" EXISTEM PARA O TEMA ESCURO. No claro eles são o
     navy literal da referência; no escuro viram "--topo", que é a superfície
     dominante da marca no escuro e já carrega tinta medida. Sem isso o painel
     seria um retângulo navy dentro de uma tela navy. */
  .g3ref .fu-painel {
    background: var(--g3ref-navy); color: var(--g3ref-navy-tinta);
    border-radius: 0; box-shadow: none; padding: 24px;
  }
  .g3ref .fu-painel-rot { color: var(--g3ref-navy-rotulo); margin-bottom: 0; }
  .g3ref .fu-painel-total {
    font-family: var(--g3ref-fonte-cond); font-size: 52px; font-weight: 700;
    line-height: 1.05; margin-top: 6px;
  }
  .g3ref .fu-painel-sub { font-size: 14px; color: var(--g3ref-navy-apagado); margin-top: 4px; }
  .g3ref .fu-painel-par {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;
    margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--g3ref-navy-regua);
  }
  .g3ref .fu-painel-cap { color: var(--g3ref-navy-legenda); }
  .g3ref .fu-painel-val { font-size: 17px; font-weight: 600; }

  /* --------------------------------------------- o cabeçalho do cartão grande */
  .g3ref .fu-cabeca {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    margin-bottom: 6px;
  }
  .g3ref .fu-cabeca h2 {
    margin: 0; font-family: var(--g3ref-fonte-cond); font-size: 22px; font-weight: 600;
    letter-spacing: normal;
  }
  .g3ref .fu-cabeca .fraco { font-size: 13px; color: var(--g3ref-apagado); }

  /* ------------------------------------------------------------ as seções
     DUAS FORMAS, e a referência usa as duas em lugares diferentes. No cartão da
     direita a seção se anuncia por um título LARANJA com régua EMBAIXO; no
     cartão do boleto ("Conferência do boleto") ela se separa por uma régua EM
     CIMA e o título é apagado. Eram a mesma classe aqui. */
  .g3ref .fu-secao { margin-top: 22px; padding-top: 0; border-top: 0; }
  .g3ref .fu-secao-tit {
    font-family: var(--g3ref-fonte-cond); font-size: 12px; font-weight: 400;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--g3ref-laranja);
    padding-bottom: 8px; border-bottom: 1px solid var(--g3ref-regua); margin-bottom: 0;
  }
  .g3ref .fu-secao.com-regua {
    margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--g3ref-regua);
  }
  .g3ref .fu-secao.com-regua > .fu-rotulo { margin-bottom: 8px; }

  /* -------------------------------------------------------- os formulários
     TRÊS COLUNAS FIXAS no cartão da direita, "1fr 1fr" no par do boleto e nos
     parâmetros, "1fr" sozinho no "Nosso número". São as quatro grades da
     referência, e o "auto-fit minmax(190px, 1fr)" daqui produzia duas ou quatro
     conforme a largura — nunca as três dela. */
  .g3ref .campos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 14px; }
  .g3ref .campos.duas { grid-template-columns: 1fr 1fr; gap: 12px; }
  .g3ref .campos.uma { grid-template-columns: 1fr; gap: 12px; margin-top: 12px; }
  .g3ref .campos.parametros { grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 0; }

  .g3ref label {
    display: block; font-family: var(--g3ref-fonte); font-size: 12px; font-weight: 400;
    letter-spacing: normal; color: var(--g3ref-apagado); margin-bottom: 4px;
  }
  /* No bloco de conferência do boleto a referência sobe o rótulo para 13px e
     encurta a margem para 3px — é o único lugar dela em que isso acontece. */
  .g3ref .campos.duas label, .g3ref .campos.uma label { font-size: 13px; margin-bottom: 3px; }

  .g3ref input, .g3ref select, .g3ref textarea {
    width: 100%; border: 1px solid var(--g3ref-borda-campo); border-radius: 0;
    background: var(--g3ref-campo); color: var(--g3ref-tinta);
    font-family: var(--g3ref-fonte); font-size: 15px; padding: 8px 10px;
    line-height: normal; box-shadow: none;
    transition: border-color .14s ease, background-color .14s ease;
  }
  /* Os dois parâmetros são os únicos campos da referência com a borda forte e o
     fundo creme — eles não são dado lido da fatura, são decisão de quem opera. */
  .g3ref .campos.parametros input {
    border-color: var(--g3ref-borda-forte); background: var(--g3ref-fundo);
  }
  .g3ref input::placeholder, .g3ref textarea::placeholder { color: var(--g3ref-apagado); }
  /* A REFERÊNCIA NÃO TEM HOVER DE CAMPO. Tinha aqui (a borda escurecia), e sair
     é "sem pôr" — o campo já se anuncia pelo fundo próprio contra o cartão. */
  .g3ref input:hover:not(:disabled), .g3ref select:hover:not(:disabled),
  .g3ref textarea:hover:not(:disabled) { border-color: var(--g3ref-borda-campo); }
  .g3ref .campos.parametros input:hover:not(:disabled) { border-color: var(--g3ref-borda-forte); }
  /* O FOCO É O DELA, exatamente: 2px sólidos do laranja, sem deslocamento.
     Sai o anel de 3px em "box-shadow" e a troca de cor da borda. */
  .g3ref input:focus, .g3ref select:focus, .g3ref textarea:focus {
    outline: 2px solid var(--g3ref-laranja); outline-offset: 0;
    border-color: var(--g3ref-borda-campo); box-shadow: none;
  }
  .g3ref input:disabled, .g3ref select:disabled, .g3ref textarea:disabled {
    background: var(--g3ref-fundo); color: var(--g3ref-apagado); cursor: default;
  }
  .g3ref textarea, .g3ref .fu-area { padding: 10px; font-size: 13px; line-height: 1.5; resize: vertical; }
  .g3ref .fu-area.mono {
    font-family: var(--g3ref-fonte-mono); font-size: 13px; word-break: break-all;
  }
  /* O PIX é 12px na referência e a linha digitável 13px: o payload EMV tem três
     vezes mais caracteres e ela abriu mão de um ponto para ele caber. */
  .g3ref .fu-area.mono.miudo { font-size: 12px; }

  /* ------------------------------------------------------ o histórico editável
     É o campo que o extrator mais erra: a tabela lateral da Equatorial é
     desenhada em cinza claro, treze linhas altas. Na referência são fichas em
     "flex-wrap" com largura de conteúdo — 54px para o mês, 62px para o número,
     encostados —, e não uma grade de colunas iguais. */
  .g3ref .fu-hist-edit { display: flex; flex-wrap: wrap; gap: 10px; }
  .g3ref .fu-hist-item {
    display: flex; align-items: center; gap: 6px;
    border: 1px solid var(--g3ref-borda-campo); background: var(--g3ref-campo); padding: 6px 8px;
  }
  .g3ref .fu-hist-mes { font-size: 12px; color: var(--g3ref-apagado); width: 54px; flex: none; }
  .g3ref .fu-hist-kwh {
    width: 62px; flex: none; border: none; background: transparent; padding: 0;
    font-size: 15px; color: var(--g3ref-tinta); text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .g3ref .fu-hist-un { font-size: 12px; color: var(--g3ref-apagado); flex: none; }

  /* ----------------------------------------------------- as faturas registradas
     O CARTÃO QUE FALTAVA. A referência lista as faturas já registradas na UC com
     mês, total e um "excluir" por linha, e é dali que sai a economia acumulada
     impressa na folha 2. As três rotas já existiam ("GET", "POST" e "DELETE" de
     "/faturas/unificada/registros") e nenhuma tela chamava as duas primeiras. */
  .g3ref .fu-registro {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 0; border-bottom: 1px solid var(--g3ref-regua); font-size: 14px;
  }
  .g3ref .fu-registro-dir { display: flex; align-items: center; gap: 14px; }
  .g3ref .fu-registro-val { color: var(--g3ref-apagado); }

  /* ------------------------------------------------------------- os botões
     QUATRO FORMAS NA REFERÊNCIA, e a de repouso é a mais discreta das quatro: o
     botão comum dela é Barlow 14px, caixa BAIXA, borda de campo e tinta
     apagada. Só o primário e os de largura cheia são condensados em caixa alta. */
  .g3ref button {
    border-radius: 0; box-shadow: none;
    font-family: var(--g3ref-fonte); font-size: 14px; font-weight: 400;
    letter-spacing: normal; text-transform: none;
    background: none; border: 1px solid var(--g3ref-borda-campo);
    color: var(--g3ref-apagado); padding: 13px 18px; cursor: pointer;
  }
  .g3ref button:hover:not(:disabled) {
    color: var(--g3ref-tinta); border-color: var(--g3ref-tinta);
    background: none; box-shadow: none; transform: none;
  }
  .g3ref button:active:not(:disabled) { transform: none; box-shadow: none; }
  .g3ref button:focus-visible { outline: 2px solid var(--g3ref-laranja); outline-offset: 2px; }
  .g3ref button:disabled { cursor: default; }

  .g3ref button.primario {
    background: var(--g3ref-laranja); color: var(--g3ref-laranja-tinta); border: none;
    padding: 13px 22px;
    font-family: var(--g3ref-fonte-cond); font-size: 16px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .g3ref button.primario:hover:not(:disabled) {
    background: var(--g3ref-laranja-hover); color: var(--g3ref-laranja-tinta); border: none;
  }
  /* Largura cheia dentro do cartão da esquerda: "Ler boleto com IA" (laranja) e
     "Registrar este mês" (contorno navy). 15px condensado nos dois. */
  .g3ref button.fu-largo {
    width: 100%; padding: 12px; margin-top: 12px;
    font-family: var(--g3ref-fonte-cond); font-size: 15px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .g3ref button.fu-largo.primario { padding: 12px; font-size: 15px; }
  .g3ref button.fu-contorno {
    border: 1px solid var(--g3ref-tinta); background: var(--g3ref-papel);
    color: var(--g3ref-tinta); padding: 11px; margin-top: 16px;
  }
  .g3ref button.fu-contorno:hover:not(:disabled) {
    background: var(--g3ref-tinta); color: var(--g3ref-tinta-invertida); border-color: var(--g3ref-tinta);
  }
  /* O pé do cartão da direita: o primário e o "Nova fatura" discreto, 26px
     abaixo do último campo. "flex-wrap" é nosso — os rótulos em português são
     mais longos que os da referência e num monitor estreito eles se tocariam. */
  .g3ref .fu-pe { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }

  /* O "excluir" de cada registro: sem caixa, 13px, apagado até o mouse chegar. */
  .g3ref button.fu-texto {
    border: none; background: none; color: var(--g3ref-apagado);
    font-family: var(--g3ref-fonte); font-size: 13px; font-weight: 400;
    letter-spacing: normal; text-transform: none; padding: 2px 4px;
  }
  .g3ref button.fu-texto:hover:not(:disabled) {
    color: var(--g3ref-tinta); border: none; background: none;
  }

  /* ----------------------------------------------------------- o aviso
     A CAIXA É A DELA — creme alaranjado, filete de 3px à esquerda, 9px 11px, 13px de
     texto, entrelinha 1,45. A COR DO FILETE continua variando por estado, e a
     razão é que a referência só tem UM estado: tudo nela é alerta laranja. Erro
     e sucesso são nossos (composição que falhou, fatura registrada), e pintá-los
     de laranja apagaria a diferença entre "confira" e "não deu certo". */
  .g3ref .aviso {
    background: var(--g3ref-alerta-fundo); border: 0;
    border-left: 3px solid var(--g3ref-laranja); border-radius: 0;
    padding: 9px 11px; font-size: 13px; line-height: 1.45;
    color: var(--g3ref-tinta); margin: 0 0 8px; box-shadow: none;
  }
  .g3ref .aviso.erro { background: var(--erro-fundo); border-left-color: var(--erro); }
  .g3ref .aviso.ok { background: var(--ok-fundo); border-left-color: var(--ok); }

  /* ------------------------------------------------------------ a barra da aba 2
     Na referência ela tem a LARGURA DA FOLHA (210mm) e fica solta sobre o creme —
     sem cartão, sem borda, sem sombra —, porque o que precisa de moldura ali
     embaixo é o papel. Era um cartão com borda e sombra aqui. */
  .g3ref .fu-barra {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    max-width: 210mm; margin: 22px auto 14px; padding: 0;
    background: none; border: 0; border-radius: 0; box-shadow: none;
  }
  .g3ref .fu-barra .fraco { font-size: 14px; color: var(--g3ref-apagado); }
  /* "Voltar ao painel" é o único botão de contorno da referência com tinta CHEIA
     em vez de apagada, e a razão é de peso: ao lado do navy sólido de imprimir,
     um cinza claro sumiria. Padding 11px, contra os 13px do pé do cartão. */
  .g3ref .fu-barra button { color: var(--g3ref-tinta); padding: 11px 18px; }
  .g3ref button.fu-imprimir {
    background: var(--g3ref-navy); color: var(--g3ref-navy-tinta); border: none;
    padding: 11px 22px;
    font-family: var(--g3ref-fonte-cond); font-size: 15px; font-weight: 600;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .g3ref button.fu-imprimir:hover:not(:disabled) {
    background: var(--g3ref-navy-hover); color: var(--g3ref-navy-tinta); border: none;
  }

  /* ------------------------------------------- o que a aba 3 (Cadastro) herda
     O cadastro é markup da casa — ".cartao.secao", "h2", "h3", ".sub", tabela.
     Dentro do escopo ele passa a falar a língua da referência, e isso é
     deliberado: uma aba com duas gramáticas seria pior que qualquer uma das duas.
     "h2" é o título de 22px do cartão da direita; "h3", o rótulo laranja de seção. */
  .g3ref h2 {
    font-family: var(--g3ref-fonte-cond); font-size: 22px; font-weight: 600;
    letter-spacing: normal; margin: 26px 0 6px; gap: 8px;
  }
  .g3ref h3 {
    font-family: var(--g3ref-fonte-cond); font-size: 12px; font-weight: 400;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--g3ref-laranja); margin: 0 0 10px;
  }
  /* A MEDIDA DE LINHA FICA. A referencia nao tem "max-width" porque a unica prosa
     dela e a nota de uma linha dos parametros; a aba 3 tem paragrafos de cinco
     linhas explicando o que a folha imprime, e 12px correndo por 1120px de
     largura e o tipo de texto que ninguem le. Onde a referencia tem opiniao —
     tamanho, tinta, entrelinha — vale a dela; onde ela nao tem, vale a nossa. */
  .g3ref .sub { font-size: 12px; color: var(--g3ref-apagado); margin: 10px 0 0; line-height: 1.5; max-width: 82ch; }
  .g3ref .fraco { color: var(--g3ref-apagado); }
  .g3ref .rolagem { border: 1px solid var(--g3ref-borda); border-radius: 0; background: var(--g3ref-papel); box-shadow: none; }
  .g3ref table { font-size: 14px; }
  .g3ref thead th {
    font-family: var(--g3ref-fonte-cond); font-size: 12px; font-weight: 400;
    text-transform: uppercase; letter-spacing: 0.14em;
    background: none; color: var(--g3ref-apagado);
    padding: 8px 10px; border-bottom: 1px solid var(--g3ref-regua);
  }
  .g3ref tbody td { padding: 8px 10px; border-bottom: 1px solid var(--g3ref-regua); }
  .g3ref tbody tr:hover { background: var(--g3ref-fundo); }

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
  .g3 {
    width: 210mm; min-height: 297mm; padding: 13mm 15mm;
    background: #fff; color: #14213D;
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
     O centro da tela, com o brilho quente da marca no alto. */
  .central {
    min-height: 100dvh; display: grid; place-items: center; padding: 20px;
    background: radial-gradient(70% 50% at 50% 0%, var(--acento-suave), transparent 70%);
  }
`;
