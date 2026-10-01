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

/**
 * ONDE O MENU LATERAL VIRA GAVETA (30/09/2026, etapa 3b). Uma constante e nao
 * dois numeros: o CSS abaixo e o `matchMedia` de `menu-lateral.tsx` leem a mesma,
 * e a gaveta com foco preso nunca pode valer numa largura em que o menu esta
 * desenhado fixo — ou vice-versa. 900 e onde o conteudo, com os 248px do menu,
 * cai abaixo de ~650px e as tabelas passam a rolar mais do que mostram.
 */
export const MENU_VIRA_GAVETA = 900;

/**
 * O CARTAO DA TABELA — as regras que valem DENTRO da medida em que a tabela
 * vira lista de cartoes. Uma constante e nao texto no meio do ESTILO porque
 * valem em dois limites: 720px para a tabela de trabalho e 440px para a tabela
 * curta de resumo (`.estreita`). A nota inteira do desenho esta no ESTILO,
 * em "a tabela que vira cartao".
 */
const CARTAO_DA_TABELA = `
    .tabela-cartoes > .ordenar-por { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
    .tabela-cartoes > .rolagem { border: 0; background: none; overflow: visible; }
    .tabela-cartoes table, .tabela-cartoes tbody { display: block; }
    .tabela-cartoes thead { display: none; }

    .tabela-cartoes tbody > tr {
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 14px;
      margin: 0 0 8px; padding: 12px 14px;
      background: var(--fundo2); border: 1px solid var(--borda);
    }
    .tabela-cartoes tbody > tr:hover { background: var(--fundo2); }
    .tabela-cartoes tbody > tr > td {
      display: block; padding: 0; border: 0; text-align: left; white-space: normal; overflow-wrap: anywhere;
      min-width: 0 !important; max-width: none !important; width: auto !important;
    }
    .tabela-cartoes td[data-rotulo]:not([data-rotulo=""])::before {
      content: attr(data-rotulo); display: block; margin-bottom: 2px;
      font-family: var(--fonte-cond); font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
      text-transform: uppercase; letter-spacing: var(--rotulo-tracking); color: var(--fraco);
    }

    /* Os quatro lugares. */
    .tabela-cartoes tbody > tr > td:first-child, .tabela-cartoes tbody > tr > td.c-id {
      grid-column: 1 / -1; order: -3; font-size: var(--t-corpo);
    }
    /* A identificacao dispensa o rotulo: o nome e o numero se explicam. O
       "[data-rotulo]" no seletor e o que o faz vencer a regra do rotulo. */
    .tabela-cartoes tbody > tr > td:first-child[data-rotulo]::before,
    .tabela-cartoes tbody > tr > td.c-id[data-rotulo]::before { display: none; }
    .tabela-cartoes tbody > tr:has(> td.c-id) > td:first-child:not(.c-id) { grid-column: auto; order: 0; }
    .tabela-cartoes tbody > tr:has(> td.c-id) > td:first-child:not(.c-id)[data-rotulo]::before { display: block; }
    /* A celula com campo (a data de Unidades, o documento de Clientes, o
       rotulo impresso em Contas de luz) ocupa a largura toda: meia coluna de
       um telefone corta a data em «15/10/». */
    .tabela-cartoes tbody > tr > td:has(.inline, select, input:not([type="checkbox"])) { grid-column: 1 / -1; }
    .tabela-cartoes tbody > tr > td.c-sit { order: -2; }
    .tabela-cartoes tbody > tr > td.c-val { order: -1; }
    .tabela-cartoes tbody > tr > td.c-aco,
    .tabela-cartoes tbody > tr > td:last-child:not(:first-child):has(button, a[href]) {
      grid-column: 1 / -1; order: 9;
    }
    .tabela-cartoes tbody > tr > td.c-aco[data-rotulo]::before,
    .tabela-cartoes tbody > tr > td:last-child:not(:first-child):has(button, a[href])[data-rotulo]::before { display: none; }
    .tabela-cartoes td.num { text-align: left; }

    /* A LINHA QUE ATRAVESSA A TABELA (o detalhe aberto, a pergunta na linha, o
       formulario de pagamento) cola no cartao de cima: sem a linha do alto,
       e com a mesma moldura. */
    .tabela-cartoes tbody > tr:not(.grupo-da-tabela):not(.linha-retorno):has(> td[colspan]:only-child) {
      display: block; padding: 0; margin: -9px 0 8px; border-top: 0;
    }
    .tabela-cartoes tbody > tr:not(.grupo-da-tabela):not(.linha-retorno) > td[colspan]:only-child { padding: 12px 14px; }
    .tabela-cartoes tbody > tr.linha-pergunta > td, .tabela-cartoes tbody > tr.usuario-retorno > td { padding: 0; }
    .tabela-cartoes tr.linha-pergunta .pergunta { border-width: 1px 0 0; }
    .tabela-cartoes .rolagem td > .pergunta { position: static; max-width: none; }
    .tabela-cartoes tr.linha-aberta { background: var(--fundo-hover); }
    .tabela-cartoes tr.linha-aberta > td { background: none; }

    /* A linha do retorno nao e cartao: vazia, nao aparece; com a frase, o
       aviso e a moldura dela. */
    .tabela-cartoes tbody > tr.linha-retorno {
      display: block; margin: 0; padding: 0; background: none; border: 0;
    }
    .tabela-cartoes tbody > tr.linha-retorno > td { padding: 0; }
    .tabela-cartoes tr.linha-retorno .aviso { margin: 0 0 8px; }

    /* O CABECALHO DE GRUPO (Mes, Contas a pagar) e titulo, e nao cartao. */
    .tabela-cartoes tbody > tr.grupo-da-tabela {
      display: block; margin: 0; padding: 14px 0 8px; background: none; border: 0;
    }
    .tabela-cartoes tr.grupo-da-tabela td > * { position: static; max-width: none; }

    /* O que era desenhado para caber numa coluna estreita de tabela. O selo
       quebra linha: «Boleto recusado pelo banco» nao cabe em meio cartao. */
    .tabela-cartoes .uc-meta, .tabela-cartoes .marca { white-space: normal; }
    /* [01/10, etapa 6] O SELO QUE QUEBRA LINHA ganha 8px dos dois lados e o
       icone na altura da PRIMEIRA linha: os 6px da esquerda eram a
       compensacao otica do icone num selo de uma linha so, e na segunda linha
       o texto encostava na borda (o detector mediu 6px para letra de 12). */
    .tabela-cartoes .marca { padding: 4px 8px; line-height: 1.35; align-items: flex-start; }
    .tabela-cartoes .marca > .ic { margin-top: 2px; flex: none; }
    .tabela-cartoes .inline { flex-wrap: nowrap; }
    .tabela-cartoes .inline input:not(.caixa), .tabela-cartoes .inline select { width: 100% !important; min-width: 0; }
    .tabela-cartoes .inline .campo-data { flex: 1 1 auto; min-width: 0; }
    .tabela-cartoes .inline .campo-data input { width: 100%; }
    /* No cartao o campo da linha deixa de parecer texto: e um campo de verdade. */
    .tabela-cartoes .inline input, .tabela-cartoes .inline select { border-color: var(--borda); background: var(--campo); }
`;

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
  .setor-painel .titulo, .ajuda-secao h3, .marca, .lateral-item, .marca-app,
  .fu-rotulo, .fu-painel-rot, .fu-secao-tit {
    font-family: var(--fonte-cond);
  }

  /* O ICONE ACOMPANHA O TEXTO. 'block' evita o descolamento de linha de base que
     um svg inline ganha por ser tratado como caractere; o alinhamento fica com o
     flex do contexto, que e quem sabe o tamanho da linha. */
  .ic { display: block; flex: none; transition: transform .16s ease, color .16s ease; }

  /* ------------------------------------------- a casca e o menu lateral
     A BARRA DO TOPO VIROU MENU LATERAL em 30/09/2026 (etapa 3b), a pedido do
     dono: *«ao inves dos topicos ficarem dispostos na barra fixa superior, quero
     um menu lateral, similar ao de /opt/intreply»*. O que veio de la foi o
     COMPORTAMENTO — secoes, recolher para os desenhos com a escolha lembrada,
     conta no pe, gaveta no celular — e nao o desenho: aqui e o g3ref da etapa 0,
     navy com o laranja como sinal, condensada nos rotulos, canto reto e nenhuma
     sombra. O porque de cada escolha de comportamento esta em "menu-lateral.tsx".

     DUAS ZONAS DE PESO CONTINUAM, so mudaram de eixo. Desde 06/08 a faixa navy
     era o "onde voce esta" e o creme era onde o trabalho acontece; agora a
     coluna navy e o onde, e o creme ganhou a altura inteira da janela — que e o
     recurso que a barra de duas faixas mais gastava (~90px em toda tela).

     A LARGURA SAI DE UMA VARIAVEL NA CASCA, e nao de duas regras: o menu, a dica
     do menu recolhido e quem mais precisar leem a mesma "--lateral-largura".
     248px aberto cabe «Unidades consumidoras» com o desenho e o numero do passo
     de outra; 64px recolhido e o desenho com folga para o anel de foco. */
  .casca {
    --lateral-largura: 248px;
    display: flex; align-items: flex-start; min-height: 100vh; min-height: 100dvh;
  }
  .casca.recolhida { --lateral-largura: 64px; }
  .casca-corpo { flex: 1 1 auto; min-width: 0; }
  /* O foco chega aqui so pelo "Pular para o conteudo", por programa: o anel
     contornaria a tela inteira para dizer o que o salto ja disse. */
  .conteudo:focus { outline: none; }
  .filete { height: 3px; flex: none; background: var(--gradiente); }

  /* O MENU. Preso a janela no desktop (sticky, altura da janela): a tela rola e o
     menu fica — o que a barra "sticky" fazia, sem comer altura do conteudo. Ele
     NAO corta o que transborda: a lista de setores e o menu da conta saem para
     o lado quando ele esta recolhido, e quem rola por dentro e so a lista de
     telas.

     RECOLHER NAO ANIMA A LARGURA, e isto e diferente do intreply de proposito:
     la a largura desliza em 200ms. Aqui cada quadro dessa animacao refaria o
     layout da tela inteira — tabelas de ate 500 linhas —, e o detector de
     desenho acusa a transicao de "width" por isso mesmo. O menu troca de
     largura num quadro so; o estado e dito pelo proprio menu, que muda de forma.

     A BORDA DIREITA DE 1px e a do tema escuro: la o menu e a pagina sao dois
     navys quase iguais, e sem ela a coluna se dissolvia na tela. No claro ela e
     a linha bege entre o navy e o creme, e some. */
  .lateral {
    position: sticky; top: 0; z-index: 25; flex: none;
    width: var(--lateral-largura); height: 100vh; height: 100dvh;
    display: flex; flex-direction: column;
    background: var(--topo); color: var(--topo-texto);
    border-right: 1px solid var(--borda);
  }
  .lateral-cabeca {
    flex: none; display: flex; align-items: center; gap: 8px;
    min-height: 58px; padding: 0 12px 0 18px;
  }
  /* A MARCA NA CONDENSADA, e um degrau acima do corpo: e o nome do sistema, e
     ele pesa como o titulo de um cartao da referencia. */
  .marca-app {
    display: inline-flex; align-items: center; gap: 9px; min-width: 0;
    font-weight: 600; font-size: 18px; letter-spacing: .01em; white-space: nowrap;
  }
  .marca-app .logotipo { flex: none; }
  /* Fechar a gaveta so existe no celular; no desktop o menu nao fecha, recolhe. */
  button.lateral-fechar { display: none; }

  /* O SELETOR DE SETOR, no alto do menu (27/09 como migalha na barra; 30/09 aqui).
     O gatilho ocupa a largura do menu e tem contorno de 1px: e o "em que lugar
     estou" do menu inteiro, e as setas a direita dizem que dali se vai a outro.
     O desenho do setor leva o Orange sobre o Navy — o mesmo par do item ativo,
     5,93:1 —, e as setas ficam no "--topo-fraco" ate o ponteiro chegar: elas sao
     o convite, nao a informacao. */
  .lateral-setor { flex: none; padding: 0 12px 14px; border-bottom: 1px solid var(--topo-veu); }
  .setor { position: relative; }
  .lateral .setor-gatilho {
    width: 100%; justify-content: flex-start; gap: 9px; padding: 9px 10px;
    background: var(--topo-veu); border-color: var(--topo-veu-forte); box-shadow: none;
    color: var(--topo-texto); font-size: 17px; font-weight: 600; letter-spacing: .01em;
  }
  .lateral .setor-gatilho:hover:not(:disabled), .lateral .setor-gatilho[aria-expanded="true"] {
    background: var(--topo-veu-forte); border-color: var(--topo-veu-forte);
    color: var(--topo-texto); box-shadow: none; transform: none;
  }
  .setor-rotulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setor-gatilho .setor-simbolo { color: var(--acento); }
  .setor-gatilho .setor-setas { margin-left: auto; color: var(--topo-fraco); transition: color .16s ease; }
  .setor-gatilho:hover .setor-setas, .setor-gatilho[aria-expanded="true"] .setor-setas {
    color: var(--topo-texto);
  }
  /* A LISTA FLUTUA como o menu da conta - mesma superficie, borda, sombra do
     terceiro degrau e entrada. Presa ao gatilho, ela abre para baixo e para a
     DIREITA: com o menu recolhido (64px) ela sai por cima do conteudo, e e isso
     que o menu nao cortar o que transborda garante. */
  .setor-painel {
    position: absolute; left: 0; top: calc(100% + 6px); z-index: 30;
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

  /* A LISTA DE TELAS, em secoes na ordem do trabalho. E a unica parte do menu que
     rola: um setor com muitas telas numa janela baixa desce por dentro, e a
     marca, o setor e a conta continuam onde estao. */
  .lateral-nav {
    flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
    padding: 12px 10px 16px;
    scrollbar-width: thin; scrollbar-color: var(--topo-veu-forte) transparent;
  }
  .lateral-secao + .lateral-secao { margin-top: 14px; }
  /* O TITULO DA SECAO E O BOTAO QUE A FECHA. Rotulo em caixa alta, na tinta
     apagada da faixa (4,54:1): ele organiza, e quem chama o olho sao os itens.
     A seta gira para o lado quando a secao fecha — o mesmo desenho, sem um
     segundo icone para o mesmo sinal. */
  button.lateral-secao-tit {
    display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 6px;
    margin: 0 0 3px; padding: 4px 10px;
    background: none; border: 0; box-shadow: none; color: var(--topo-fraco);
    font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso); text-transform: uppercase;
    letter-spacing: var(--rotulo-tracking); line-height: 1.3; text-align: left;
  }
  button.lateral-secao-tit:hover:not(:disabled) {
    background: none; border-color: transparent; color: var(--topo-texto); transform: none;
  }
  .lateral-secao-tit[aria-expanded="false"] .lateral-secao-seta { transform: rotate(-90deg); }
  .lateral-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  /* O ITEM. Nome no creme, desenho na tinta apagada: nove nomes em tinta apagada
     leriam como lista desligada, e nove desenhos em creme brigariam com o nome.

     O ATIVO E O ORANGE SOBRE O NAVY com o lastro "--topo-ativo" por tras (4,84:1
     medido sobre o lastro), e o desenho passa a cheio. SEM FILETE LATERAL, e a
     decisao e de proposito: o filete de 2px embaixo era o sinal da aba, e o
     equivalente numa coluna e a faixa grossa de cor num lado so — o "callout"
     que o g3ref tirou do aviso na etapa 0. Tres sinais sem ele: a superficie, a
     tinta e o peso do desenho; e "aria-current" para quem nao ve nenhum dos tres. */
  .lateral-item {
    position: relative; display: flex; align-items: center; gap: 11px;
    min-height: 40px; padding: 8px 10px;
    color: var(--topo-texto); text-decoration: none; white-space: nowrap; overflow: hidden;
    font-size: 15.5px; font-weight: 500; letter-spacing: .01em; line-height: 1.2;
    transition: background-color .14s ease, color .14s ease;
  }
  .lateral-item .ic { color: var(--topo-fraco); }
  .lateral-item:hover { background: var(--topo-veu); color: var(--topo-texto); text-decoration: none; }
  .lateral-item:hover .ic { color: var(--topo-texto); }
  .lateral-item.ativo, .lateral-item.ativo:hover { background: var(--topo-ativo); color: var(--acento); font-weight: 600; }
  .lateral-item.ativo .ic { color: var(--acento); }
  .lateral-item:focus-visible { outline-offset: -2px; }
  .lateral-rotulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* O NUMERO DO PASSO: o mesmo quadrado de contorno fino que numera os passos no
     funil da tela Mes, pequeno e na tinta apagada. Ele conta a sequencia sem
     disputar com o nome; no item ativo acompanha a tinta dele. */
  .lateral-passos {
    flex: none; margin-left: auto; padding: 0 5px;
    border: 1px solid var(--topo-veu-forte); color: var(--topo-fraco);
    font-size: 12px; font-weight: 600; line-height: 18px; letter-spacing: .02em;
    font-variant-numeric: tabular-nums;
  }
  .lateral-item.ativo .lateral-passos { color: var(--acento); border-color: var(--acento); }

  /* RECOLHER E O PE. O botao de recolher mora logo acima da conta, e nao ao lado
     da marca: no alto ele disputaria com o nome do sistema, e recolhido nao
     haveria largura para os dois. Ele fala baixo — tinta apagada, sem contorno —
     porque e preferencia, e nao trabalho. */
  .lateral-recolher { flex: none; padding: 6px 10px; border-top: 1px solid var(--topo-veu); }
  .lateral-recolher button {
    width: 100%; justify-content: flex-start; gap: 11px; padding: 8px 10px;
    background: none; border-color: transparent; box-shadow: none; color: var(--topo-fraco);
    font-size: var(--t-ui); font-weight: 500; white-space: nowrap; overflow: hidden;
  }
  .lateral-recolher button:hover:not(:disabled) {
    background: var(--topo-veu); border-color: transparent; color: var(--topo-texto); transform: none;
  }
  .lateral-pe { flex: none; display: grid; gap: 8px; padding: 10px 10px 12px; border-top: 1px solid var(--topo-veu); }
  /* O TENANT, quando ha mais de um vinculo. Dentro da faixa escura o que era
     "--fraco" (medido contra superficie CLARA) ficaria ilegivel: a seta do
     seletor usa "--topo-fraco" (4,52:1 sobre o veu), a regra de 14/08. */
  .lateral-pe .campo-caixa select {
    width: 100%; padding: 7px 30px 7px 10px; font-size: var(--t-meta);
    background: var(--topo-veu); color: var(--topo-texto); border-color: var(--topo-veu-forte);
  }
  .lateral-pe .campo-caixa .adorno { color: var(--topo-fraco); }
  /* A CONTA: quem esta logado e em qual empresa, sempre a vista — todo dado da
     tela e de UM tenant, e quem opera precisa saber de qual sem procurar. O
     menu dela abre para CIMA ("Menu acima"), e a seta do gatilho vira junto. */
  .lateral-conta { display: block; }
  .lateral-conta > button {
    width: 100%; justify-content: flex-start; gap: 10px; padding: 7px 9px; text-align: left;
    background: none; border-color: transparent; box-shadow: none; color: var(--topo-texto);
  }
  .lateral-conta > button:hover:not(:disabled), .lateral-conta > button[aria-expanded="true"] {
    background: var(--topo-veu); border-color: var(--topo-veu-forte); color: var(--topo-texto); transform: none;
  }
  .lateral-conta > button .ic { color: var(--topo-fraco); }
  .lateral-conta > button .menu-seta { margin-left: auto; transform: rotate(180deg); }
  .lateral-conta-texto { display: grid; gap: 1px; min-width: 0; line-height: 1.25; }
  .lateral-conta-texto strong, .lateral-conta-texto span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lateral-conta-texto strong { font-size: var(--t-ui); font-weight: 600; }
  .lateral-conta-texto span {
    font-family: var(--fonte); font-size: var(--t-meta); font-weight: 400; letter-spacing: normal;
    color: var(--topo-fraco);
  }

  /* RECOLHIDO: SO OS DESENHOS. O nome continua no DOM — so sai da vista, com o
     mesmo recorte do ".so-leitor" —, e e por isso que o leitor de tela e a busca
     da pagina continuam achando cada item. Quem ve ganha a dica ao lado
     (".lateral-dica"), no ponteiro e no foco do teclado. Os titulos de secao
     viram uma linha fina: seis letras em caixa alta nao cabem em 64px, e a
     fronteira entre as secoes continua dita. */
  .recolhida .lateral-rotulo, .recolhida .setor-rotulo {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }
  .recolhida .lateral-cabeca { justify-content: center; padding: 0; }
  .recolhida .lateral-setor { padding: 0 8px 12px; }
  .recolhida .lateral .setor-gatilho { justify-content: center; gap: 2px; padding: 9px 0; }
  .recolhida .setor-gatilho .setor-setas { margin-left: 0; }
  .recolhida .lateral-nav { padding: 12px 8px 14px; }
  .recolhida .lateral-secao-tit, .recolhida .lateral-passos { display: none; }
  .recolhida .lateral-secao + .lateral-secao { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--topo-veu-forte); }
  .recolhida .lateral-item { justify-content: center; padding: 10px 0; }
  .recolhida .lateral-recolher { padding: 6px 8px; }
  .recolhida .lateral-recolher button { justify-content: center; padding: 8px 0; }
  .recolhida .lateral-pe { padding: 10px 8px 12px; }
  .recolhida .lateral-conta > button.so-icone { width: 100%; height: 38px; padding: 0; justify-content: center; }
  /* A DICA DO MENU RECOLHIDO: o nome do item, ao lado dele, no ponteiro e no foco.
     "position: fixed" com a altura medida do item, e nao um "::after" preso a
     ele: a lista rola e corta o que transborda, e uma dica cortada na borda do
     menu seria a dica que nao aparece. Navy com contorno do veu, como o menu —
     nenhuma sombra: ela fica rente ao menu e se separa do creme pela cor. */
  .lateral-dica {
    position: fixed; z-index: 45; left: calc(var(--lateral-largura) + 6px); top: var(--dica-topo);
    transform: translateY(-50%); pointer-events: none;
    padding: 5px 9px; background: var(--topo); color: var(--topo-texto);
    border: 1px solid var(--topo-veu-forte);
    font-family: var(--fonte-cond); font-size: var(--t-ui); font-weight: 600; white-space: nowrap;
    animation: surgir .12s ease-out;
  }

  /* PULAR PARA O CONTEUDO. Com o menu na frente do conteudo no DOM, quem usa
     teclado passaria por uma dezena de paradas antes da primeira linha da tela.
     O link fica fora da vista ate receber o foco, e ai aparece no canto, no
     laranja do botao primario. */
  .pular {
    position: fixed; left: 12px; top: 12px; z-index: 50; padding: 9px 14px;
    background: var(--acento); color: var(--acento-texto); text-decoration: none;
    font-family: var(--fonte-cond); font-weight: 600; letter-spacing: .02em;
    transform: translateY(-200%);
  }
  .pular:focus { transform: none; color: var(--acento-texto); }

  /* A FAIXA DO CELULAR e a gaveta. So existem abaixo de ${MENU_VIRA_GAVETA}px. */
  .faixa-celular, .lateral-veu { display: none; }

  /* NA TELA ESTREITA O MENU VIRA GAVETA (abaixo de ${MENU_VIRA_GAVETA}px).
     248px fixos deixariam 142px de conteudo num telefone de 390px, e mesmo os
     64px recolhidos comeriam um sexto da largura de uma tabela. O menu sai do
     fluxo e passa a deslizar da esquerda por cima da tela, aberto por um botao
     numa faixa fina no alto — a unica barra que sobrou, e so aqui: sem ela nao
     haveria de onde abrir o menu, nem onde dizer em que setor se esta.

     A GAVETA ESTA SEMPRE ABERTA POR DENTRO: recolher para os desenhos nao faz
     sentido num menu que ja sai da frente, e a preferencia do desktop fica
     guardada, intocada, para quando a janela voltar a ser larga.

     "visibility" entra na transicao com atraso na SAIDA: a gaveta desliza e so
     entao some — e sumida ela sai do Tab e do leitor de tela, que e o que um
     menu fechado tem de ser. */
  @media (max-width: ${MENU_VIRA_GAVETA - 0.02}px) {
    .casca { display: block; }
    .faixa-celular {
      display: block; position: sticky; top: 0; z-index: 20;
      background: var(--topo); color: var(--topo-texto);
    }
    .faixa-celular-linha { display: flex; align-items: center; gap: 10px; min-height: 50px; padding: 0 14px 0 6px; }
    .faixa-celular .marca-app { font-size: 17px; gap: 8px; }
    button.faixa-celular-botao {
      min-height: 44px; padding: 0 10px; gap: 8px;
      background: none; border-color: transparent; box-shadow: none; color: var(--topo-texto);
      font-size: var(--t-ui); text-transform: uppercase; letter-spacing: .06em;
    }
    button.faixa-celular-botao:hover:not(:disabled) {
      background: var(--topo-veu); border-color: transparent; color: var(--topo-texto); transform: none;
    }
    .faixa-celular-setor {
      margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: var(--fonte-cond); font-size: var(--t-ui); font-weight: 600; color: var(--topo-fraco);
    }
    .lateral {
      position: fixed; top: 0; bottom: 0; left: 0; z-index: 42;
      width: min(304px, 86vw); height: auto;
      transform: translateX(-100%); visibility: hidden;
      transition: transform .22s ease-out, visibility 0s linear .22s;
    }
    .gaveta-aberta .lateral { transform: none; visibility: visible; transition: transform .22s ease-out; }
    .lateral-veu {
      display: block; position: fixed; inset: 0; z-index: 41;
      background: color-mix(in srgb, var(--topo) 55%, transparent);
      animation: surgir .14s ease-out;
    }
    button.lateral-fechar {
      display: inline-flex; margin-left: auto; width: 44px; height: 44px; padding: 0;
      background: none; border-color: transparent; box-shadow: none; color: var(--topo-fraco);
    }
    button.lateral-fechar:hover:not(:disabled) {
      background: var(--topo-veu); border-color: transparent; color: var(--topo-texto); transform: none;
    }
    .lateral-recolher { display: none; }
    .lateral .setor-painel { left: 0; right: 0; width: auto; }
  }
  /* NO TOQUE, 44px DE ALVO em todo item, em qualquer largura: um notebook com
     tela de toque tem o menu aberto e o dedo de um celular. */
  @media (pointer: coarse) {
    .lateral-item, .lateral-conta > button, .lateral-recolher button { min-height: 44px; }
  }

  /* -------------------------------------------------- o menu suspenso
     Usado pela area do usuario e pelo seletor de tema. Sombra do terceiro degrau
     porque ele FLUTUA sobre tudo - e a profundidade e o que diz "isto fecha ao
     clicar fora", sem precisar de instrucao. */
  .menu { position: relative; }
  .menu > button { display: inline-flex; align-items: center; gap: 7px; }
  .menu-painel {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
    min-width: 216px; padding: 6px;
    background: var(--fundo2); color: var(--texto); border: 1px solid var(--borda);
    border-radius: var(--raio-cartao); box-shadow: var(--sombra-3);
    animation: descer-suave .14s ease-out;
  }
  .menu-painel .titulo { padding: 7px 10px 5px; color: var(--fraco); }
  .menu-painel hr { border: 0; border-top: 1px solid var(--borda-suave); margin: 5px 4px; }
  /* O ITEM ALINHA A ESQUERDA, e precisa dizer isso: o botao geral centraliza
     ("justify-content: center"), e sem esta linha tema e Sair saiam no meio do
     painel, cada um numa coluna — visto em 30/09/2026 com o menu da conta no pe
     do menu lateral. */
  .menu-painel button, .menu-painel .item {
    display: flex; align-items: center; justify-content: flex-start; gap: 9px; width: 100%;
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
  /* O PAINEL QUE ABRE PARA CIMA ("Menu acima", 30/09/2026): o da conta, no pe do
     menu lateral. Alinhado pela esquerda do gatilho — com o menu recolhido ele sai
     por cima do conteudo —, e a entrada sobe em vez de descer. A "color" e
     declarada no painel porque ele mora dentro do navy, e herdaria o creme. */
  .menu-acima > .menu-painel {
    top: auto; bottom: calc(100% + 6px); left: 0; right: auto;
    animation-name: subir-suave;
  }
  /* [30/09, etapa 4a] O painel "fixo" e a lista de lugares do menu
     sairam com os modos "fixo" e "lugares" do "Menu": eram do menu
     "Cadastros" da barra do topo, que o menu lateral substituiu. */

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

  /* O PORQUE AO LADO DO ROTULO. Ate 01/10/2026 o botao morava DENTRO do
     <label>, que virava flex; saiu para a linha ".campo-rotulo" (secao da etapa
     5, mais abaixo), porque dentro do label ele entrava no nome do campo. */
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
  /* SO PARA O LEITOR DE TELA: o cabecalho de uma coluna de botoes («Ações»)
     que a vista nao precisa ler, mas a navegacao por tabela precisa ouvir. O
     mesmo recorte do input de arquivo da Fatura unificada. */
  .so-leitor {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
  }

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
    /* "position: relative" desde 01/10/2026: sem ela, o recorte do leitor de
       tela (".so-leitor", absoluto) dentro de um cabecalho tomava a JANELA como
       referencia e escapava da rolagem — era ele que empurrava a pagina de
       Unidades 433px para o lado num telefone. */
    position: relative;
    overflow-x: auto; border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); scrollbar-color: var(--borda-forte) transparent;
  }
  .vazio { padding: 40px 32px; text-align: center; color: var(--fraco); font-size: var(--t-corpo); }

  /* O CABECALHO DE GRUPO DENTRO DA TABELA (30/09/2026, etapa 4a): a linha que
     diz UMA vez o que as linhas de baixo tem em comum — a lista da tela Mes e o
     dinheiro que espera em Contas a pagar. Sem o hover de linha: ela nao e
     linha de dado, e nao se clica nela. */
  tr.grupo-da-tabela td { padding-top: 20px; border-bottom: 0; }
  /* A tabela rola na horizontal quando nao cabe (no celular), e o cabecalho do
     grupo e uma celula da largura da TABELA: sem isto, a frase dele se lia
     rolando para o lado. Presa a esquerda e na medida da janela, ela fica. */
  tr.grupo-da-tabela td > * { position: sticky; left: 14px; max-width: min(80ch, calc(100vw - 96px)); }
  tr.grupo-da-tabela:hover { background: none; }
  .grupo-da-tabela h3, .grupo-da-tabela h4 {
    margin: 0; font-family: var(--fonte-cond); font-size: var(--t-h3); font-weight: 600; line-height: 1.25;
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
  }
  .grupo-da-tabela h4 .fraco { font-family: var(--fonte); font-size: var(--t-ui); font-weight: 500; }
  .grupo-da-tabela p { margin: 4px 0 0; color: var(--fraco); font-size: var(--t-ui); line-height: 1.5; max-width: 80ch; }
  .grupo-passos { margin: 6px 0 0; padding-left: 20px; font-size: var(--t-ui); line-height: 1.6; }
  /* O titulo do cartao com o icone NA LINHA dele — sem isto o icone de 17px caia
     numa linha propria acima do texto (o h3 nao e flex como o h2). */
  .cartao-tit { margin-top: 0; display: flex; align-items: center; gap: 8px; }

  /* A LISTA DENTRO DE UMA FAIXA (30/09/2026, etapa 4a): as lacunas de cadastro
     das Unidades eram tres avisos vermelhos empilhados, e viraram UMA faixa
     ambar com uma linha por lacuna e o filtro ao lado de cada uma. */
  .faixa-lista { margin: 6px 0 0; padding-left: 18px; }
  .faixa-lista li + li { margin-top: 3px; }

  /* A TABELA DE UNIDADES EM CINCO COLUNAS (etapa 4a): a distribuidora e a usina
     descem para uma linha apagada embaixo do numero; «O que falta» diz a
     lacuna em palavras, com o lapis da tarefa, na tinta ambar (AA sobre o
     branco); o detalhe da linha tem a fatia, a tarifa, o endereco e o vinculo. */
  .uc-meta { margin-top: 2px; color: var(--fraco); font-size: var(--t-meta); white-space: nowrap; }
  .uc-falta { min-width: 200px; max-width: 320px; }
  .uc-falta-lista {
    display: inline-flex; gap: 6px; align-items: flex-start;
    color: var(--alerta); font-size: var(--t-ui); font-weight: 600; line-height: 1.4;
  }
  .uc-falta-lista > .ic { margin-top: 2px; flex: none; }
  td.uc-abrir { width: 1%; white-space: nowrap; text-align: right; }
  td.uc-abrir button { padding: 6px 10px; }
  tr.linha-aberta > td { background: var(--fundo-hover); border-bottom-color: transparent; }
  tr.linha-detalhe:hover { background: none; }
  .detalhe-tit {
    margin: 4px 0 10px; font-family: var(--fonte-cond); font-size: var(--t-rotulo); font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase; color: var(--fraco);
  }
  .detalhe-regua { border: 0; border-top: 1px solid var(--borda-suave); margin: 16px 0 12px; }
  .detalhe-campos { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); align-items: start; }
  .detalhe-valor { margin: 0; padding: 8px 0; font-size: var(--t-corpo); }

  /* A SECAO DO PE DA TELA (etapa 4a): «Quem traz clientes», em Contratos — o que
     era espremido dentro do cartao de criar ganhou titulo e lugar proprio. */
  .secao-de-pe { margin-top: 8px; }
  .secao-de-pe .sub { margin-bottom: 12px; }
  .secao-de-pe-atos { display: grid; gap: 10px; justify-items: start; }
  .secao-de-pe-atos > .cartao, .secao-de-pe-atos > div, .secao-de-pe-atos > .aviso { justify-self: stretch; }

  /* ============== O QUE FALTA, ANTES DO QUE EXISTE (01/10/2026, etapa 7a)
     O caminho do cadastro travado: a trava do Mes leva a tela ja recortada no
     que falta, e a tela diz o recorte num chip que se tira.

     «MOSTRANDO SO: …» ("MostrandoSo"): o rotulo condensado e o chip — o mesmo
     par contorno-e-fundo do acento do chip de unidade de Contas de luz, agora
     fora da ilha, porque cinco telas o usam. O "x" e um alvo de 24px no
     computador e de 44px no telefone, com nome proprio. */
  .mostrando-so {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 0 0 20px;
  }
  /* Dentro da aba de leitura de Contas de luz o ritmo e o "gap" da coluna. */
  .g3ref .fu-leitura > .mostrando-so, .g3ref .fu-leitura > .recolhido { margin: 0; }
  .mostrando-so-rot {
    font-family: var(--fonte-cond); font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
    text-transform: uppercase; letter-spacing: var(--rotulo-tracking); color: var(--fraco);
  }
  .chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 2px 2px 10px; min-width: 0;
    border: 1px solid var(--acento-forte); background: var(--acento-suave); color: var(--texto);
    font-size: var(--t-ui); font-weight: 600; line-height: 1.35;
  }
  button.chip-x {
    flex: none; width: 24px; height: 24px; padding: 0;
    border-color: transparent; background: none; color: var(--texto);
  }
  button.chip-x:hover:not(:disabled) { border-color: var(--texto); background: none; }

  /* O BLOCO «UNIDADES SEM CONTRATO ATIVO» (Contratos): o titulo leva o lapis
     da tarefa na tinta ambar — e lacuna de cadastro, e nao falha —, e a
     contagem apagada ao lado. A tabela e a da casa. */
  .ct-falta { margin: 0 0 8px; }
  .ct-falta > h2 { margin-top: 0; }
  .ct-falta > h2 > .ic { color: var(--alerta); flex: none; }
  .ct-falta-n { color: var(--fraco); font-weight: 500; }
  .ct-falta > .sub { margin-bottom: 14px; }
  td.ct-falta-ato { width: 1%; white-space: nowrap; text-align: right; vertical-align: middle; }
  .ct-lista > h2 { margin-top: 34px; }
  .ct-lista .busca input { width: 300px; }
  /* A sugestao de quem trouxe, no painel: uma linha com o icone da ajuda e o
     «usar Fulano» como link — nunca um campo ja preenchido. */
  .ct-sugestao {
    display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; max-width: 72ch;
    font-size: var(--t-ui); line-height: 1.5;
  }
  .ct-sugestao > .ic { margin-top: 3px; flex: none; color: var(--fraco); }
  /* O «⋯» da linha de Contratos: o mesmo desenho do de Cobrancas. O texto
     «Mais ações» so aparece no cartao, onde o icone sozinho seria adivinhacao. */
  td.ct-aco { width: 1%; vertical-align: middle; text-align: right; }
  .ct-menu-texto { display: none; }
  /* O ITEM QUE DESFAZ, NO MENU, NA TINTA DO ERRO: encerrar o contrato apaga a
     ocupacao da unidade e nao tem desfazer pela tela — a mesma regra do
     "button.perigo", sem o contorno que um item de menu nao tem. */
  .menu-painel button.perigo { color: var(--erro); }
  /* Sob o ponteiro, o fundo tingido do erro (6,05:1) — e nao o vermelho cheio
     do "button.perigo", que viria junto por especificidade e deixaria o texto
     vermelho sobre vermelho. */
  .menu-painel button.perigo:hover:not(:disabled) {
    color: var(--erro); background: var(--erro-fundo); border-color: transparent;
  }

  /* O CLIENTE NA IDENTIFICACAO DA UNIDADE (Unidades): logo abaixo do numero,
     na tinta do texto e no corpo de interface — e por ele que se reconhece a
     linha; a distribuidora e a usina continuam apagadas embaixo. */
  .uc-cliente { margin-top: 2px; font-size: var(--t-ui); line-height: 1.35; }

  /* ================= MENOS PROSA, LISTA ANTES (30/09/2026, etapa 4a)
     Tres pecas que a etapa deu as telas de trabalho, e as tres moram aqui fora
     de qualquer escopo porque servem a cinco telas ou mais.

     O ATO DA TELA, AO LADO DO TITULO ("Pagina" com "acao"): o «Novo …» dos
     cadastros. Quebra para baixo do titulo quando nao cabe, e nunca estica. */
  .pagina-cab {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px 24px; flex-wrap: wrap; margin: 0 0 22px;
  }
  .pagina-cab-texto { flex: 1 1 420px; min-width: 0; }
  .pagina-cab-texto .sub { margin-bottom: 0; }
  .pagina-acao { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px; }
  /* Aberto, o gatilho fica afundado: diz que o painel logo abaixo e dele. */
  .pagina-acao button[aria-expanded="true"] { background: var(--fundo-recuo); border-color: var(--texto); }

  /* O PAINEL DE CRIAR ("PainelDeCriar"), acima da lista. E o cartao da casa com
     o titulo e o X na mesma linha; o respiro de baixo o separa da lista. */
  .painel-criar-cab {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px;
  }
  .painel-criar-cab h2 { margin: 0; }
  .painel-criar-pe { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
  .painel-criar .nota-do-painel {
    margin: 12px 0 0; color: var(--fraco); font-size: var(--t-ui); line-height: 1.5; max-width: 72ch;
  }

  /* O RECOLHIDO ("Recolhido"): o que se confere de vez em quando, fechado, com
     o resumo de uma linha a vista. E SUPERFICIE, e nao texto solto — a licao de
     10/09 com o painel das automacoes («esta apenas com o texto solto»). O
     marcador nativo sai e a seta do Phosphor entra, virando ao abrir. */
  .recolhido {
    border: 1px solid var(--borda); border-radius: var(--raio-cartao);
    background: var(--fundo2); margin: 22px 0 0;
  }
  .recolhido + .recolhido { margin-top: 10px; }
  .recolhido > summary {
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px;
    padding: 13px 18px; cursor: pointer; list-style: none;
  }
  .recolhido > summary::-webkit-details-marker { display: none; }
  .recolhido-tit {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--fonte-cond); font-size: var(--t-h3); font-weight: 600; color: var(--texto);
  }
  .recolhido-tit > .ic { color: var(--fraco); }
  .recolhido-resumo { flex: 1 1 280px; min-width: 0; color: var(--fraco); font-size: var(--t-ui); line-height: 1.45; }
  .recolhido-seta { align-self: center; flex: none; color: var(--fraco); transition: transform .15s ease; }
  .recolhido[open] > summary .recolhido-seta { transform: rotate(180deg); }
  .recolhido > summary:hover .recolhido-tit { color: var(--acento-forte); }
  .recolhido > summary:focus-visible { outline-offset: -2px; }
  .recolhido-corpo { padding: 14px 18px 18px; border-top: 1px solid var(--borda-suave); }
  .recolhido-corpo > :first-child { margin-top: 0; }
  .recolhido-corpo > :last-child { margin-bottom: 0; }
  .recolhido-corpo .rolagem { margin-top: 12px; }

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
  /* [01/10, etapa 6] O NUMERO NAO QUEBRA: a coluna de valor encolhia ate
     «R$ / 2.518,35» em Contas a receber a 1440. Ela cresce; quem quebra e a
     coluna de texto do lado. */
  td.num { white-space: nowrap; }
  /* A LINHA COM CONTROLE ALINHA PELO MEIO. O topo e o certo para texto (a
     primeira linha de cada celula na mesma altura), mas numa linha com botao
     ou campo o texto ficava 4 a 8px acima do rotulo do botao ao lado —
     Contratos, Unidades, Clientes, Historico. A tabela de Contas de luz e a de
     Cobrancas ja faziam assim, com regra propria (que continua mandando). */
  tbody tr:has(> td button, > td a.botao, > td input:not([type="checkbox"]), > td select) > td { vertical-align: middle; }

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
  /* SO LEITURA (01/10/2026): o fundo recuado do desabilitado, com a tinta do
     texto — o valor e verdadeiro e se le inteiro, so nao se muda aqui. */
  input:read-only:not([type="checkbox"]):not([type="radio"]):not([type="file"]) { background: var(--fundo-recuo); }
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
  /* [30/09/2026, etapa 4b] O CAMPO DE MES VAZIO DIZ O QUE O VAZIO QUER DIZER
     («Todos os meses»), no lugar da mascara «--------- de ----» do navegador. A
     mascara so fica transparente enquanto o campo nao tem foco: ao focar, a
     frase sai e a mascara volta, porque e nela que se digita. */
  .campo-data.sem-valor input:not(:focus) { color: transparent; }
  .campo-data-vazio {
    position: absolute; left: 11px; right: 36px; top: 50%; transform: translateY(-50%);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--texto); font-size: var(--t-corpo); pointer-events: none;
  }
  .campo-data.sem-valor input:focus ~ .campo-data-vazio { display: none; }

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
  /* [30/09/2026, etapa 4b] O BOTAO QUE DESFAZ — apagar, cancelar, limpar. Era
     escrito duas vezes («fu-perigo» em Contas de luz, «em-perigo» em Cobranças),
     com as mesmas tres regras; virou variante da casa, como o primario e o
     discreto. Contornado no vermelho, cheio so sob o ponteiro: nunca e o
     convite da tela, e o foco nunca nasce nele (ver "PerguntaNaTela"). */
  button.perigo { border-color: var(--erro); color: var(--erro); }
  button.perigo:hover:not(:disabled) { background: var(--erro); border-color: var(--erro); color: var(--fundo2); }
  button.perigo:disabled { color: var(--fraco); border-color: var(--borda); }

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
  /* [30/09, etapa 4a] OS TONS SAO CINCO, E O VERMELHO E SO DA FALHA. Ate aqui o
     vermelho se chamava "pendente" e pintava igual «Recusada pelo banco» e
     «Falta preencher». Agora: "erro" (a recusa, a vencida, o conector caido), e
     a lacuna de cadastro e "a_fazer" — ambar, com o lapis. "neutro" e o que nao
     e bom nem ruim (inativo, cancelada): o cinza de rotulo sobre o creme
     aprofundado, 4,6:1 no claro. A regra inteira: "TomDoSelo", iconografia.ts. */
  .marca.erro { background: var(--erro-fundo); color: var(--erro); }
  .marca.a_fazer { background: var(--alerta-fundo); color: var(--alerta); }
  .marca.nao_medido { background: var(--alerta-fundo); color: var(--alerta); }
  .marca.neutro { background: var(--fundo-recuo); color: var(--fraco); }
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
     10% de opacidade — que saiu tambem, em 30/09 (nota logo abaixo).

     [30/09] E A SOMBRA DO SEGUNDO DEGRAU SAIU TAMBEM. O pedido de 30/07 era o
     cartao FLUTUAR; o de 30/09 e o g3ref, onde nada flutua - o KPI e um cartao
     como os outros, 1px de linha sobre o creme. O que ele ganhou no lugar e
     tipografico: o numero na condensada a 700, que e o "numero grande" da
     referencia (o valor a pagar do painel navy e a mesma letra a 52px). */
  .kpis { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0 0 18px; }
  .kpi {
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
  /* [30/09, etapa 4a] A MARCA D'AGUA SAIU (o icone de 44px a 11% no canto): numa
     tela de trabalho ela era ruido ao lado do numero. O icone ficou pequeno, ao
     lado do nome e na cor dele. */
  .kpi .nome { display: flex; align-items: center; gap: 6px; color: var(--fraco); margin-bottom: 4px; }
  .kpi .nome > .ic { flex: none; }
  .kpi .valor { font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: 0; }
  /* [01/10, etapa 6] NO TELEFONE, DOIS POR LINHA. Um por linha, os quatro
     cartoes de Cobrancas e de Contas a receber ocupavam 420px antes da lista —
     meia tela de numero grande. A 22px o maior valor do mes («R$ 123.456,78»)
     cabe em meia largura de um telefone de 360px. */
  @media (max-width: 720px) {
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .kpi { padding: 10px 12px 12px; }
    .kpi .valor { font-size: 22px; }
  }

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
  @keyframes subir-suave {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .ic-carregando { animation: girar .9s linear infinite; }
  .ic-engrenagem { animation: girar 3.2s linear infinite; }
  .aviso.erro > .ic-aviso_erro { animation: pulsar 1.1s ease-in-out 2; }
  .aviso.ok > .ic-aviso_ok { animation: traco-do-check .42s ease-out; }

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
  /* [30/09, etapa 1] A BARRA TEM DUAS PARTES: o "tablist" com as tres abas e,
     do lado de fora dele, o «Nova fatura» — dentro, a seta do teclado o pularia
     e o leitor de tela o contaria como quarta aba. Em tela estreita as abas
     QUEBRAM LINHA em vez de rolar: aba escondida atras de uma rolagem lateral e
     aba que ninguem acha (a barra do topo ja ensinou isso). */
  .g3ref .fu-abas {
    display: flex; align-items: center; justify-content: space-between; gap: 10px 16px;
    flex-wrap: wrap; border-bottom: 0; padding-bottom: 0; margin-bottom: 22px;
  }
  .g3ref .fu-abas-lista { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
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
  /* NO CELULAR AS TRES ABAS SAO UMA FILEIRA SO, em tres colunas iguais, e o
     rotulo quebra DENTRO da aba — «1 · Leitura / e cálculo». Soltas, cada uma
     ocupava uma linha com o traco pendurado, e a barra comia 200px antes do
     trabalho. Sem o traco, a inativa ganha contorno: e o que ainda a desenha
     como aba, e nao como texto. */
  @media (max-width: 720px) {
    .g3ref .fu-abas-lista { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: 100%; }
    .g3ref .fu-aba-traco { display: none; }
    .g3ref .fu-aba {
      padding: 7px 9px; font-size: var(--rotulo-tamanho); letter-spacing: .03em; line-height: 1.3;
      white-space: normal; text-align: center; border: 1px solid var(--borda);
    }
    .g3ref .fu-abas > button { margin-left: auto; }
  }

  /* ------------------------------------------- a aba 1 em largura total
     [30/09, etapa 1] A GRADE "380px 1fr" DA REFERENCIA SAIU. Ela era o desenho
     de uma fatura avulsa: o envio e o painel navy na coluna estreita, o
     formulario na larga. Com o lote do mes, a coluna estreita virou o lugar do
     trabalho — a fila de 754px mostrava 332 — e a larga, um formulario vazio.

     Agora a aba 1 e uma pilha de blocos em largura total, na ordem do mes:
     envio, conta em edicao, fila, registradas. O RITMO E DE DOIS PASSOS: 28px
     entre blocos (sao assuntos diferentes) e 12px dentro de cada um (titulo,
     aviso e tabela sao o mesmo assunto). A conta aberta nao e mais uma coluna:
     e a gaveta, mais abaixo. */
  .g3ref .fu-leitura { display: flex; flex-direction: column; gap: 28px; }
  .g3ref .fu-leitura > .aviso { margin: 0; }

  .g3ref .fu-bloco-topo {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 10px 20px; flex-wrap: wrap; margin-bottom: 12px;
  }
  .g3ref .fu-bloco-titulo { min-width: 0; }
  .g3ref .fu-bloco-titulo h2 { margin: 0; }
  .g3ref .fu-bloco-resumo { margin: 3px 0 0; font-size: var(--t-meta); color: var(--fraco); }
  .g3ref .fu-bloco-acoes { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .g3ref .fu-bloco > .aviso { margin: 0 0 12px; }
  /* No celular o ato vem PRIMEIRO e na largura toda; «Limpar a fila» desce. */
  @media (max-width: 720px) {
    .g3ref .fu-bloco-acoes { flex-direction: column-reverse; align-items: stretch; width: 100%; }
  }
  /* O titulo que RECEBE foco por programa (a lista depois de uma exclusao, a
     gaveta ao abrir) nao desenha o anel: ele nao e controle, e o anel num
     titulo parece um campo. O leitor de tela anuncia do mesmo jeito. */
  .g3ref [tabindex="-1"]:focus { outline: none; }

  /* A CONTA EM EDICAO, com a gaveta fechada: uma linha, e nao um cartao — ela
     aponta para o trabalho, nao e o trabalho. */
  .g3ref .fu-emedicao {
    display: flex; align-items: center; justify-content: space-between; gap: 8px 16px;
    flex-wrap: wrap; padding: 10px 12px 10px 14px; font-size: var(--t-ui);
    background: var(--fundo2); border: 1px solid var(--borda);
  }

  /* A NOTA MIUDA sob um grupo — a origem do desconto, a economia da unidade. */
  .g3ref .fu-nota { margin: 10px 0 0; font-size: var(--t-meta); line-height: 1.5; color: var(--fraco); max-width: 80ch; }

  /* ----------------------------------------------------------- o cartão
     Superfície, linha e canto são os do cartão geral desde 30/09. O que fica
     aqui é o RESPIRO da referência: 22px na esquerda, 26px na direita — a coluna
     da direita é a que se lê campo a campo e ganha 4px. */
  .g3ref .cartao { padding: 22px; }
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
  .g3ref .fu-solta-titulo, .g3ref .fu-solta-sub { display: block; }
  /* A area e um "<label>", e o rotulo geral de campo e miudo, apagado e com
     margem embaixo — a tinta do titulo vinha dele. */
  .g3ref .fu-solta { margin: 0; color: var(--texto); font-weight: 400; }

  /* [30/09] O ENVIO DAS CONTAS E UMA FAIXA, e nao um cartao de 380px: a area de
     soltar ocupa a largura e o caminho sem arquivo fica ao lado, dito como
     alternativa. A area ganha o branco do cartao — sobre o creme da pagina, o
     creme dela sumiria e o tracejado seria a unica borda. */
  .g3ref .fu-envio { display: flex; align-items: stretch; gap: 12px 20px; }
  .g3ref .fu-envio .fu-solta { flex: 1; text-align: left; background: var(--fundo2); padding: 18px 20px; }
  .g3ref .fu-envio .fu-solta:hover { background: var(--fundo-hover); }
  .g3ref .fu-envio .fu-solta-titulo { display: flex; align-items: center; gap: 8px; }
  .g3ref .fu-envio-lado {
    flex: none; display: flex; flex-direction: column; justify-content: center;
    align-items: flex-start; gap: 6px; font-size: var(--t-meta);
  }
  @media (max-width: 720px) {
    .g3ref .fu-envio { flex-direction: column; }
  }

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
     O único bloco de fundo cheio da tela, e o motivo é de uso: quem opera
     precisa deste número para digitar no internet banking.

     [30/09, etapa 1] ELE MORA NO PÉ DA GAVETA, e só existe com uma conta
     aberta. Na coluna de 380px ele era o maior peso da aba 1 em qualquer
     estado — inclusive dizendo «—» para uma fila de sete contas. No pé, fixo, o
     valor fica à vista enquanto se corrige qualquer campo da gaveta, e muda na
     hora: é o sinal de que a correção pegou. Os 52px da referência viraram 40:
     é um rodapé, e a gaveta precisa da altura para os campos. (O cabeçalho do
     cartão grande, ".fu-cabeca", saiu junto: o título agora é o da gaveta.)

     É A SUPERFÍCIE DOMINANTE DO SISTEMA, a mesma da faixa do topo ("--topo"), e
     por isso sobrevive ao tema escuro sem par próprio. A legenda e o subtítulo
     são a tinta apagada que pousa nela ("--topo-fraco", 5,89:1), e o rótulo é o
     laranja sobre o navy — o mesmo par da aba ativa, 5,93:1. */
  .g3ref .fu-painel {
    background: var(--topo); color: var(--topo-texto); border-radius: var(--raio);
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: end;
    gap: 12px 28px; padding: 16px 22px 18px;
  }
  .g3ref .fu-painel-rot { color: var(--acento); margin-bottom: 0; }
  .g3ref .fu-painel-total {
    font-family: var(--fonte-cond); font-size: 40px; font-weight: 700;
    line-height: 1.05; margin-top: 4px;
  }
  .g3ref .fu-painel-sub { font-size: var(--t-meta); color: var(--topo-fraco); margin-top: 3px; }
  .g3ref .fu-painel-par {
    display: flex; gap: 6px 24px; flex-wrap: wrap; margin: 0; padding: 0 0 2px;
    font-size: var(--t-meta);
  }
  .g3ref .fu-painel-par dd { margin: 0; }
  .g3ref .fu-painel-cap { color: var(--topo-fraco); }
  .g3ref .fu-painel-val { font-size: 17px; font-weight: 600; }
  .g3ref .fu-painel-acoes { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  /* O RESULTADO DO REGISTRO FALA NO PRÓPRIO PÉ, onde o botão foi apertado. A
     tinta é a do navy e o ícone é o laranja — sucesso e falha se separam pelo
     DESENHO do ícone e pela frase, nunca por um verde ou vermelho sobre o navy,
     que ninguém mediu. */
  .g3ref .fu-painel-status {
    display: flex; align-items: flex-start; gap: 6px; margin: 0; max-width: 42ch;
    font-size: var(--t-meta); line-height: 1.45; color: var(--topo-texto);
  }
  .g3ref .fu-painel-status .ic { color: var(--acento); margin-top: 1px; }
  /* NO CELULAR O PE ENCOLHE PARA O ESSENCIAL — o valor e os dois atos —, e a
     gaveta fica com a altura para os campos. O vencimento e a unidade estao nos
     campos logo acima; a divisao energia/repasses esta na folha. */
  @media (max-width: 720px) {
    .g3ref .fu-painel { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px 16px 12px; }
    .g3ref .fu-painel-total { font-size: 28px; margin-top: 2px; }
    .g3ref .fu-painel-sub, .g3ref .fu-painel-par { display: none; }
    .g3ref .fu-painel-acoes { align-items: stretch; }
    .g3ref .fu-painel-acoes .fu-acoes > button { flex: 1; padding: 9px 8px; font-size: var(--t-meta); }
  }

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
  .g3ref .campos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
  /* [30/09] AS TRES COLUNAS FIXAS GANHARAM DOIS DEGRAUS. Fixas, elas davam
     campos de 100px num celular — «Consumo não compensado (R$)» quebrava em
     tres linhas de rotulo sobre um campo onde nao cabia o numero. O par do
     boleto e os parametros ficam em duas: dois campos curtos cabem lado a lado. */
  @media (max-width: 720px) { .g3ref .campos { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 480px) { .g3ref .campos { grid-template-columns: minmax(0, 1fr); } }
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

  /* ------------------------------------------ as duas tabelas do lote
     [30/09, etapa 1] A FILA E AS REGISTRADAS SAO TABELAS DA CASA ("Tabela" do
     ui.tsx) em largura total, e isto e o que so elas tem: a celula que trunca,
     a linha aberta na gaveta, e o cartao em que cada linha vira abaixo de 720px.

     O NOME QUE TRUNCA. "max-width: 0" com largura em porcentagem e o que faz
     uma celula de tabela automatica aceitar reticencias: sem ele, o nome mais
     longo empurraria a tabela para alem da tela, e as colunas de Situacao e de
     acao — as que decidem — seriam as que caem na rolagem lateral. Era o
     defeito medido: 754px de tabela, 332 visiveis. O nome inteiro esta no
     "title", e a frase do motivo QUEBRA LINHA, porque e ela que diz o que fazer. */
  .g3ref .fu-tabela thead th { padding: 10px 10px; }
  .g3ref .fu-tabela tbody td { padding: 11px 10px; vertical-align: middle; }
  .g3ref .fu-tabela thead th:first-child, .g3ref .fu-tabela tbody td:first-child { padding-left: 14px; }
  .g3ref .fu-tabela thead th:last-child, .g3ref .fu-tabela tbody td:last-child { padding-right: 14px; }
  .g3ref .fu-tabela td { white-space: nowrap; }
  .g3ref .fu-tabela td.c-arq, .g3ref .fu-tabela td.c-cli { white-space: normal; max-width: 0; width: 36%; }
  .g3ref .fu-nome { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .g3ref .fu-motivo {
    display: flex; align-items: flex-start; gap: 6px; margin-top: 4px;
    font-size: var(--t-meta); line-height: 1.45; color: var(--fraco); white-space: normal;
  }
  .g3ref .fu-motivo > .ic { margin-top: 2px; }
  .g3ref .fu-motivo.alerta { color: var(--alerta); }
  .g3ref .fu-motivo.ok { color: var(--ok); }
  .g3ref .fu-acoes { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  /* [01/10, etapa 6] Nas contas registradas a «2ª via» fica sempre no mesmo
     lugar: encostada a direita, ela andava para a esquerda nas linhas que tem
     tambem «conferir antes», e a coluna deixava de ser coluna. */
  .g3ref .fu-registradas td.c-aco .fu-acoes { justify-content: flex-start; }
  .g3ref .fu-tabela .c-sel { width: 36px; padding-right: 0; }
  .g3ref .fu-tabela .c-exc { width: 46px; }
  .g3ref .fu-tabela .c-sel input { width: 17px; height: 17px; margin: 0; display: block; }
  .g3ref .fu-tabela th.c-sel label { display: flex; margin: 0; }
  /* A LINHA ABERTA NA GAVETA fica marcada na parte da fila que continua a vista
     — e o que diz "voce esta nesta" sem contador. O "aria-current" diz o mesmo
     ao leitor de tela. */
  .g3ref .fu-tabela tr.fu-aberta td { background: var(--acento-suave); }
  .g3ref .so-celular { display: none; }

  /* A UNIDADE E UM LINK para a serie dela: texto sublinhado, sem caixa de botao.
     A TINTA E A DO TEXTO e o sublinhado e a linha forte: uma coluna inteira de
     links laranja brigaria com o botao laranja da tela, e o numero e DADO antes
     de ser caminho. O laranja-texto aparece sob o ponteiro e no foco. */
  .g3ref button.fu-link {
    padding: 0; border: 0; background: none; box-shadow: none;
    font: inherit; font-weight: 500; letter-spacing: normal; color: var(--texto);
    text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px;
    text-decoration-color: var(--borda-forte);
  }
  .g3ref button.fu-link:hover:not(:disabled), .g3ref button.fu-link:focus-visible {
    background: none; border-color: transparent; color: var(--acento-forte);
    text-decoration-color: currentColor; text-decoration-thickness: 2px;
  }

  /* O CHIP DA UNIDADE: o filtro dito e removivel. Contorno e fundo do acento —
     o par da opcao marcada —, e o "x" com alvo de 24px e nome proprio. */
  .g3ref .fu-chip {
    display: inline-flex; align-items: center; gap: 2px; padding: 2px 2px 2px 10px;
    border: 1px solid var(--acento-forte); background: var(--acento-suave);
    font-size: var(--t-ui); font-weight: 600; white-space: nowrap;
  }
  .g3ref button.fu-chip-x {
    width: 24px; height: 24px; padding: 0; border-color: transparent; background: none; color: var(--texto);
  }
  .g3ref button.fu-chip-x:hover:not(:disabled) { border-color: var(--texto); background: none; }
  .g3ref .fu-filtros { margin-bottom: 12px; }

  .g3ref a.fu-ir { font-weight: 600; font-size: var(--t-ui); }
  /* [30/09/2026, etapa 4b] A REVISAO ANTES DE GERAR e as PERGUNTAS NA LINHA
     (excluir, 2a via, limpar a fila, nova fatura) sairam daqui: sao a
     «RevisaoEmSerie» e a «PerguntaNaTela» de "serie.tsx", com o CSS comum na
     secao «A PERGUNTA NA TELA E A REVISAO EM SERIE», mais abaixo. O que fica e
     so o encaixe delas nesta tabela: a linha da pergunta nao tem respiro
     proprio, quem desenha a caixa e a pergunta. */
  .g3ref .fu-tabela tr.fu-confirma td { padding: 0; white-space: normal; }
  .g3ref .fu-tabela tr.fu-confirma:hover { background: none; }
  .g3ref .fu-tabela tr.fu-confirma .pergunta { border-width: 0 0 1px; }
  /* A pergunta que toma o lugar do botao na barra («Nova fatura») ou no topo
     do bloco («Limpar a fila») fica no mesmo canto que ele ocupava. */
  .g3ref .fu-abas > .pergunta, .g3ref .fu-bloco-topo > .pergunta { margin-left: auto; }
  @media (max-width: 720px) {
    .g3ref .fu-abas > .pergunta, .g3ref .fu-bloco-topo > .pergunta { margin-left: 0; width: 100%; }
  }


  /* ABAIXO DE 720px CADA LINHA VIRA UM CARTAO, e o mesmo HTML serve os dois:
     tabela nao cabe em 390px sem esconder coluna, e as colunas que caiam eram
     justamente Situacao e acao. As celulas de dado carregam o proprio rotulo em
     "data-rotulo". O cabecalho sai da vista — menos a caixa de «marcar todas»,
     que vira a primeira linha da lista. */
  @media (max-width: 720px) {
    .g3ref .fu-tabela .rolagem { border: 0; background: none; overflow: visible; }
    .g3ref .fu-tabela table, .g3ref .fu-tabela tbody, .g3ref .fu-tabela thead { display: block; }
    .g3ref .fu-tabela thead tr { display: flex; }
    .g3ref .fu-tabela thead th { display: none; }
    .g3ref .fu-tabela thead th.c-sel {
      display: flex; align-items: center; width: auto; padding: 0 0 8px; background: none; border: 0;
    }
    .g3ref .so-celular { display: inline; }
    .g3ref .fu-tabela thead th.c-sel label {
      display: inline-flex; align-items: center; gap: 8px; margin: 0; cursor: pointer;
      font-family: var(--fonte); font-size: var(--t-ui); font-weight: 500;
      text-transform: none; letter-spacing: normal; color: var(--texto);
    }
    .g3ref .fu-tabela tbody tr {
      display: grid; gap: 6px 12px; margin-bottom: 8px; padding: 12px 14px;
      background: var(--fundo2); border: 1px solid var(--borda);
    }
    .g3ref .fu-tabela tbody td,
    .g3ref .fu-tabela tbody td:first-child, .g3ref .fu-tabela tbody td:last-child {
      display: block; padding: 0; border: 0; width: auto; max-width: none; white-space: normal;
    }
    .g3ref .fu-tabela tbody td.c-arq, .g3ref .fu-tabela tbody td.c-cli { max-width: none; width: auto; }
    .g3ref .fu-tabela td[data-rotulo]::before {
      content: attr(data-rotulo); display: block; margin-bottom: 1px;
      font-family: var(--fonte-cond); font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
      text-transform: uppercase; letter-spacing: var(--rotulo-tracking); color: var(--fraco);
    }
    .g3ref .fu-tabela .fu-acoes { justify-content: flex-start; flex-wrap: wrap; }
    .g3ref .fu-tabela td.num { text-align: left; }

    .g3ref .fu-fila tbody tr {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "sit sit" "arq arq" "uc mes" "tot ven" "aco aco";
    }
    .g3ref .fu-fila .c-sit { grid-area: sit; }
    .g3ref .fu-fila .c-arq { grid-area: arq; }
    .g3ref .fu-fila .c-uc { grid-area: uc; }
    .g3ref .fu-fila .c-mes { grid-area: mes; }
    .g3ref .fu-fila .c-tot { grid-area: tot; }
    .g3ref .fu-fila .c-ven { grid-area: ven; }
    .g3ref .fu-fila .c-aco { grid-area: aco; margin-top: 4px; }

    .g3ref .fu-registradas tbody tr {
      grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: "sel uc sit" "sel cli cli" "sel ven val" "sel mes mes" "sel aco aco";
    }
    .g3ref .fu-registradas .c-sel { grid-area: sel; }
    .g3ref .fu-registradas .c-uc { grid-area: uc; }
    .g3ref .fu-registradas .c-sit { grid-area: sit; justify-self: end; }
    .g3ref .fu-registradas .c-cli { grid-area: cli; }
    .g3ref .fu-registradas .c-ven { grid-area: ven; }
    .g3ref .fu-registradas .c-val { grid-area: val; }
    .g3ref .fu-registradas .c-mes { grid-area: mes; }
    .g3ref .fu-registradas .c-aco { grid-area: aco; }
    /* A lixeira divide a ultima faixa com as acoes, na ponta oposta: sozinha
       numa coluna estreita ela empurrava «conferir antes» para outra linha. */
    .g3ref .fu-registradas .c-exc { grid-area: aco; justify-self: end; align-self: center; }
    /* A pergunta na linha vira a propria caixa, em largura cheia, logo abaixo
       do cartao que a pediu — sem o quadro do cartao em volta. */
    .g3ref .fu-registradas tr.fu-confirma { display: block; padding: 0; border: 0; background: none; }
    .g3ref .fu-registradas tr.fu-confirma td { padding: 0; background: none; }
    .g3ref .fu-tabela tr.fu-confirma .pergunta { border-width: 1px; }
  }

  /* ------------------------------------------------------------- a gaveta
     [30/09, etapa 1] A CONTA ABERTA EM «CONFERIR». Ela entra pela direita por
     cima da fila, que continua a vista a esquerda com a linha aberta marcada.
     Tres faixas: o topo (titulo, onde se esta na fila, Anterior/Proxima,
     fechar), o corpo que rola (os campos) e o pe fixo (o painel navy e os
     atos). SEM SOMBRA: o veu Navy e a linha de 1px ja dizem "isto esta por
     cima" — o g3ref separa por linha, nunca por volume (I8c2). O veu e o da
     central de ajuda, pelo mesmo motivo escrito la. */
  .g3ref .fu-veu {
    position: fixed; inset: 0; z-index: 40;
    background: color-mix(in srgb, var(--topo) 55%, transparent);
    animation: surgir .14s ease-out;
  }
  .g3ref .fu-gaveta {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
    width: min(880px, 100vw); display: flex; flex-direction: column;
    background: var(--fundo2); border-left: 1px solid var(--borda);
    animation: entrar-da-direita .18s ease-out;
  }
  .g3ref .fu-gaveta-topo {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas: "cab nav x"; align-items: start; gap: 8px 16px;
    padding: 16px 22px 14px; border-bottom: 1px solid var(--borda);
  }
  .g3ref .fu-gaveta-cabeca { grid-area: cab; min-width: 0; }
  .g3ref .fu-gaveta-cabeca h2 { margin: 0; }
  .g3ref .fu-gaveta-sub { margin-top: 3px; font-size: var(--t-meta); line-height: 1.45; color: var(--fraco); overflow-wrap: anywhere; }
  .g3ref .fu-gaveta-nav { grid-area: nav; display: flex; align-items: center; gap: 8px; }
  .g3ref .fu-gaveta-pos { font-size: var(--t-meta); color: var(--fraco); margin-right: 4px; white-space: nowrap; }
  .g3ref .fu-gaveta-x { grid-area: x; }
  .g3ref .fu-gaveta-corpo { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 22px 28px; }
  .g3ref .fu-gaveta-pe { flex: none; }
  .g3ref .fu-gaveta-corpo > .aviso { margin: 16px 0 0; }
  @media (max-width: 720px) {
    .g3ref .fu-gaveta-topo { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "cab x" "nav nav"; padding: 10px 16px; }
    .g3ref .fu-gaveta-nav { flex-wrap: wrap; }
    .g3ref .fu-gaveta-nav button { padding: 6px 12px; }
    .g3ref .fu-gaveta-pos { margin-right: auto; }
    /* A frase do topo em duas linhas no maximo: ela diz de onde a conta veio, e
       a gaveta inteira ainda esta por baixo dela. */
    .g3ref .fu-gaveta-sub {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    }
    .g3ref .fu-gaveta-corpo { padding: 0 16px 24px; }
  }

  /* A SERIE DA UNIDADE, no alto da gaveta: uma faixa recuada, nao um aviso —
     e informacao para decidir, nao alerta. */
  .g3ref .fu-serie {
    display: flex; align-items: baseline; justify-content: space-between; gap: 4px 14px; flex-wrap: wrap;
    margin: 16px 0 0; padding: 10px 12px; background: var(--fundo-recuo); font-size: var(--t-ui); line-height: 1.5;
  }
  .g3ref .fu-serie p { margin: 0; flex: 1 1 360px; }

  /* O BOLETO DOBRADO. O resumo diz o estado; o "descer" gira quando abre. O
     titulo de secao perde a regua dele aqui — a regua e a do proprio resumo. */
  .g3ref .fu-detalhe { margin-top: 22px; border-top: 1px solid var(--borda-suave); }
  .g3ref .fu-detalhe > summary {
    display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap;
    padding: 12px 0 10px; cursor: pointer; list-style: none;
  }
  .g3ref .fu-detalhe > summary::-webkit-details-marker { display: none; }
  .g3ref .fu-detalhe > summary .ic { align-self: center; color: var(--fraco); transition: transform .16s ease; }
  .g3ref .fu-detalhe[open] > summary .ic { transform: rotate(180deg); }
  .g3ref .fu-detalhe > summary .fu-secao-tit { border: 0; padding: 0; }
  .g3ref .fu-detalhe-estado { font-size: var(--t-meta); color: var(--fraco); }

  /* ------------------------------------------------------------- os botões
     Primário, comum e discreto são os gerais desde 30/09 — inclusive o "Nova
     fatura" e o "Conferir" das linhas, que eram "fu-acao" (contorno navy em
     caixa alta) e passaram a ser o botão comum da casa. [30/09, etapa 1] Os
     dois de largura cheia do cartão da esquerda ("fu-largo", "fu-contorno") e o
     pé do cartão da direita ("fu-pe") saíram com a grade: «Registrar este mês»
     é o primário do pé da gaveta. Fica aqui o de imprimir, na barra da aba 2. */

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

  /* ====================== EMISSÃO E COBRANÇA (30/09/2026, etapa 2 do redesenho)
     A tela ganhou os padroes que a etapa 1 criou para a Fatura unificada — a
     revisao antes do ato em serie, a confirmacao na propria linha, o cartao em
     que cada linha vira no celular — e eles moram aqui FORA do ".g3ref", com o
     prefixo "em-". Sao o mesmo desenho, nao uma segunda gramatica: mesma linha
     de 1px, mesmo contorno laranja-texto na revisao, mesmo vermelho so no que
     desfaz. A etapa 4 junta os dois ("fu-" e "em-") num padrao da casa. */

  /* O LINK COM CARA DE BOTAO. «Completar o endereço» leva a outra tela, e o que
     leva e link — botao do meio e «abrir em outra aba» funcionam. O desenho e o
     do botao comum (e do primario, com a classe), para ele ser lido como o ATO
     da linha, e nao como uma palavra sublinhada no meio do texto. */
  a.botao {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    padding: 8px 14px; border: 1px solid var(--borda); border-radius: var(--raio);
    background: var(--fundo2); color: var(--texto); text-decoration: none; white-space: nowrap;
    font-family: var(--fonte-cond); font-size: var(--t-corpo); font-weight: 600;
    letter-spacing: .01em; line-height: 1.2;
    transition: border-color .14s ease, background-color .14s ease;
  }
  a.botao:hover { border-color: var(--texto); color: var(--texto); text-decoration: none; }
  a.botao.primario {
    background: var(--acento); border-color: var(--acento); color: var(--acento-texto);
    text-transform: uppercase; letter-spacing: .06em;
  }
  a.botao.primario:hover { background: var(--acento-hover); border-color: var(--acento-hover); color: var(--acento-texto); }

  /* O botao que se le como link: texto sublinhado, sem caixa. A tinta e a do
     texto, e o laranja-texto aparece sob o ponteiro e no foco. */
  button.em-link {
    display: inline; padding: 0; border: 0; background: none; box-shadow: none;
    font: inherit; font-weight: 500; letter-spacing: normal; color: var(--texto);
    text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px;
    text-decoration-color: var(--borda-forte);
  }
  button.em-link:hover:not(:disabled) {
    background: none; border-color: transparent; color: var(--acento-forte);
    text-decoration-color: currentColor; text-decoration-thickness: 2px;
  }

  /* O MES: o campo, o porque de a tela estar nele, e o CSV no canto. */
  .em-mes {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center;
    gap: 10px 22px; padding: 14px 18px;
  }
  .em-mes-campo label { margin-bottom: 4px; }
  .em-mes-procurando { display: block; padding: 8px 0; color: var(--fraco); font-size: var(--t-corpo); }
  .em-mes-porque {
    display: flex; align-items: flex-start; gap: 8px; margin: 0;
    font-size: var(--t-ui); line-height: 1.45; color: var(--texto); max-width: 60ch;
  }
  .em-mes-porque > .ic { margin-top: 2px; flex: none; color: var(--fraco); }
  @media (max-width: 720px) {
    .em-mes { grid-template-columns: minmax(0, 1fr); padding: 12px 14px; }
    .em-mes-csv { justify-self: start; }
  }

  /* O BLOCO DO MES: titulo e resumo a esquerda, o ato a direita, e a revisao e
     a tabela embaixo. Ritmo de dois passos, como na aba 1 da Fatura unificada:
     12px dentro do bloco, o respiro da secao fora. */
  .em-bloco-topo {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 10px 20px; flex-wrap: wrap; margin-bottom: 6px;
  }
  .em-bloco-titulo { min-width: 0; }
  .em-bloco-titulo h2 { margin: 0; }
  .em-bloco-resumo { margin: 3px 0 0; font-size: var(--t-ui); color: var(--fraco); }
  .em-bloco-acoes { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .em-ordem { margin: 0 0 12px; font-size: var(--t-meta); color: var(--fraco); line-height: 1.5; }
  .em-ordem a.em-outros { color: var(--acento-forte); font-weight: 600; }
  .em-bloco > .aviso { margin: 0 0 12px; }
  /* O titulo que recebe foco por programa (depois de fechar a revisao ou de
     cancelar) nao desenha anel: nao e controle. O leitor anuncia do mesmo jeito. */
  .em-bloco-titulo h2[tabindex="-1"]:focus { outline: none; }
  @media (max-width: 720px) {
    .em-bloco-acoes { flex-direction: column-reverse; align-items: stretch; width: 100%; }
  }

  /* A TABELA DO MES. Sem rolagem lateral em largura nenhuma: acima de 860px de
     tabela as sete colunas cabem (o cliente trunca), abaixo cada linha vira
     cartao. E o que deixa o menu da linha e o painel aberto FORA de um
     "overflow" que os cortaria.

     [30/09/2026, etapa 3b] A MEDIDA PASSOU A SER A DA PROPRIA TABELA, e nao a da
     janela. Ate aqui era "@media (max-width: 900px)", que supunha o conteudo na
     largura da janela; com o menu lateral de 248px, uma janela de 1024 deixa
     736px para a tabela, as sete colunas nao cabiam e a PAGINA INTEIRA rolava
     87px para o lado. Com a tabela como "container", ela vira cartao quando ELA
     fica estreita — com o menu aberto, recolhido ou na gaveta. Nenhum elemento
     "position: fixed" mora dentro dela, entao a contencao nao muda onde nada
     aparece. */
  .em-tabela { container-type: inline-size; }
  .em-tabela .rolagem { overflow: visible; }
  .em-tabela thead th { padding: 10px 10px; }
  .em-tabela tbody td { padding: 11px 10px; vertical-align: middle; }
  .em-tabela thead th:first-child, .em-tabela tbody td:first-child { padding-left: 8px; padding-right: 0; }
  .em-tabela thead th:last-child, .em-tabela tbody td:last-child { padding-right: 12px; }
  .em-tabela td { white-space: nowrap; }
  .em-tabela td.c-uc { white-space: normal; max-width: 0; width: 30%; }
  .em-tabela td.c-sit { white-space: normal; min-width: 150px; max-width: 260px; }
  .em-tabela .c-abrir { width: 34px; }
  .em-cliente {
    display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: var(--t-meta); color: var(--fraco); margin-top: 2px;
  }
  .em-nota {
    display: flex; align-items: flex-start; gap: 5px; margin-top: 5px;
    font-size: var(--t-meta); line-height: 1.4; color: var(--fraco);
  }
  .em-nota > span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .em-nota > .ic { margin-top: 2px; flex: none; }
  .em-nota.alerta { color: var(--alerta); }
  .em-acoes { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
  .em-acoes-esq { justify-content: flex-start; }
  .em-tabela .em-acoes { flex-wrap: nowrap; }
  .em-tabela .em-acoes > button, .em-tabela .em-acoes > a.botao { padding: 6px 11px; font-size: var(--t-ui); }
  .em-menu-vazio { display: inline-block; width: 30px; flex: none; }
  /* OS TRES PONTOS SEM CAIXA ate o ponteiro ou o foco: vinte quadrados
     contornados numa coluna eram a coluna mais pesada da tabela, para o ato
     menos usado dela. */
  .em-menu > button.so-icone { border-color: transparent; background: none; color: var(--fraco); }
  .em-menu > button.so-icone:hover:not(:disabled),
  .em-menu > button.so-icone[aria-expanded="true"] { border-color: var(--borda); color: var(--texto); }
  /* O TRIANGULO DA LINHA: 30px de alvo, sem caixa ate o ponteiro chegar. */
  button.em-abrir {
    width: 30px; height: 30px; padding: 0; border-color: transparent; background: none; color: var(--fraco);
  }
  button.em-abrir:hover:not(:disabled) { border-color: var(--borda); color: var(--texto); background: none; }
  button.em-abrir[aria-expanded="true"] { color: var(--texto); }
  .em-abrir-texto { display: none; }
  .em-tabela tr.em-aberta td { background: var(--fundo-hover); border-bottom-color: transparent; }
  .em-tabela tr.em-linha-painel td,
  .em-tabela tr.em-linha-confirma td { white-space: normal; max-width: none; padding: 0; }
  .em-tabela tr.em-linha-painel:hover, .em-tabela tr.em-linha-confirma:hover { background: none; }
  .em-tabela tr.em-linha-painel td { background: var(--fundo-recuo); }

  /* O PAINEL DA LINHA: secoes separadas por linha, nao por caixa. */
  .em-painel { padding: 4px 18px 16px 44px; }
  .em-painel-secao { padding: 14px 0; border-bottom: 1px solid var(--borda-suave); }
  .em-painel-secao:last-of-type { border-bottom: 0; }
  .em-painel-secao h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; }
  .em-painel-secao h4 { font-family: var(--fonte-cond); font-size: var(--t-corpo); font-weight: 600; margin: 12px 0 6px; }
  .em-painel-nota { margin: 0 0 10px; font-size: var(--t-ui); line-height: 1.5; color: var(--fraco); max-width: 80ch; }
  .em-painel > .aviso { margin: 10px 0 0; }
  .em-boleto { display: grid; gap: 8px; margin-bottom: 12px; font-size: var(--t-ui); }
  .em-copiavel { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; }
  .em-copiavel > .fraco { min-width: 120px; }
  .em-copiavel > code { flex: 1 1 240px; word-break: break-all; }
  .em-importar { margin-top: 8px; }
  .em-importar > button.discreto { justify-content: flex-start; text-align: left; }
  .em-importar-corpo { padding: 4px 0 0 18px; }
  .em-baixa-campos {
    display: grid; gap: 12px; grid-template-columns: 170px 120px 120px minmax(0, 1fr); align-items: end;
  }
  .em-baixa-pe { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; margin-top: 12px; font-size: var(--t-corpo); }

  /* A RECUSA: o que falta e o que fazer, em texto, e a saida como o ato. */
  .em-recusa { display: grid; gap: 8px; margin: 0 0 10px; }
  .em-recusa-frase { display: flex; align-items: flex-start; gap: 8px; margin: 0; font-size: var(--t-ui); line-height: 1.5; max-width: 80ch; }
  .em-recusa-frase > .ic { margin-top: 3px; flex: none; color: var(--alerta); }
  .em-recusa-acoes { justify-content: flex-start; }

  /* [30/09/2026, etapa 4b] A REVISAO ANTES DO ATO saiu daqui para a secao
     comum «A PERGUNTA NA TELA E A REVISAO EM SERIE» (a mesma de Contas de luz).
     Fica o que so esta tela tem: o que ficou de fora e por que. */
  .em-defora { margin-top: 12px; font-size: var(--t-ui); }
  .em-defora-titulo { margin: 0 0 6px; font-weight: 600; }
  .em-defora ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .em-defora li {
    display: grid; grid-template-columns: 130px minmax(0, 200px) minmax(0, 1fr) auto;
    gap: 4px 14px; align-items: center;
  }
  .em-defora .r-uc { font-weight: 600; }
  .em-defora .r-cli { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fraco); }
  .em-defora .r-frase { color: var(--alerta); }

  /* A CONFIRMACAO NA LINHA e o RESUMO DO PAGAMENTO sao a «PerguntaNaTela» de
     "serie.tsx" desde 30/09/2026 (etapa 4b). Aqui fica o encaixe dela nesta
     tabela — recuada ate a coluna do triangulo, sem as bordas laterais, como a
     linha que ela explica — e o miolo do resumo. */
  .em-tabela tr.em-linha-confirma .pergunta { padding-left: 44px; border-width: 1px 0; }
  .em-painel .pergunta { padding: 14px 16px; }
  .em-resumo-pergunta { margin: 0 0 8px; font-size: var(--t-corpo); }
  .em-resumo-contas { display: grid; gap: 2px; margin: 0 0 10px; max-width: 420px; }
  .em-resumo-contas > div { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; border-bottom: 1px solid var(--borda-suave); }
  .em-resumo-contas dt { color: var(--fraco); }
  .em-resumo-contas dd { margin: 0; }
  .em-resumo-contas .em-resumo-total { border-bottom: 0; font-weight: 700; }
  .em-resumo-contas .em-resumo-total dt { color: var(--texto); }
  .em-resumo-efeito { margin: 0; max-width: 80ch; }

  /* ABAIXO DE 860px DE TABELA CADA LINHA VIRA UM CARTAO — o mesmo HTML, como na
     Fatura unificada. Total e o ato ficam sempre a vista; o triangulo ganha o
     nome escrito («Boleto e baixa»), porque no dedo um icone sozinho e
     adivinhacao. [30/09/2026] Medido na tabela ("@container"), e nao na janela:
     ver a nota do ".em-tabela" acima. O que mora FORA da tabela (a revisao antes
     de emitir, a lista de outros meses, o importar) continua na janela, logo
     abaixo. */
  @container (max-width: 860px) {
    .em-tabela .rolagem { border: 0; background: none; }
    .em-tabela table, .em-tabela tbody, .em-tabela thead { display: block; }
    .em-tabela thead { display: none; }
    /* [01/10, etapa 6] O cartao de Cobrancas nao tinha como ordenar: o
       cabecalho some, e a seta ia junto. Ganha o mesmo «Ordenar por» das
       outras tabelas. */
    .em-tabela > .ordenar-por { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
    .em-tabela tbody tr {
      display: grid; gap: 6px 12px; margin-bottom: 8px; padding: 12px 14px;
      background: var(--fundo2); border: 1px solid var(--borda);
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
      grid-template-areas: "uc uc sit" "ven kwh tot" "abrir aco aco";
    }
    .em-tabela tbody td,
    .em-tabela tbody td:first-child, .em-tabela tbody td:last-child {
      display: block; padding: 0; border: 0; width: auto; max-width: none; min-width: 0; white-space: normal;
    }
    .em-tabela td[data-rotulo]::before {
      content: attr(data-rotulo); display: block; margin-bottom: 1px;
      font-family: var(--fonte-cond); font-size: var(--rotulo-tamanho); font-weight: var(--rotulo-peso);
      text-transform: uppercase; letter-spacing: var(--rotulo-tracking); color: var(--fraco);
    }
    .em-tabela td.num { text-align: left; }
    .em-tabela td.c-uc, .em-tabela td.c-sit { max-width: none; width: auto; min-width: 0; }
    .em-tabela .c-uc { grid-area: uc; }
    .em-tabela .c-sit { grid-area: sit; justify-self: end; text-align: right; max-width: 200px; }
    .em-tabela .c-sit .em-nota { justify-content: flex-end; }
    .em-tabela .c-ven { grid-area: ven; }
    .em-tabela .c-kwh { grid-area: kwh; }
    .em-tabela .c-tot { grid-area: tot; text-align: right; }
    .em-tabela .c-abrir { grid-area: abrir; align-self: center; width: auto; }
    .em-tabela .c-aco { grid-area: aco; align-self: center; }
    .em-tabela .em-acoes { flex-wrap: wrap; }
    button.em-abrir { width: auto; height: auto; padding: 6px 8px 6px 4px; gap: 6px; color: var(--texto); border-color: transparent; }
    .em-abrir-texto { display: inline; font-size: var(--t-ui); }
    .em-tabela tr.em-aberta { border-bottom-color: transparent; margin-bottom: 0; }
    .em-tabela tr.em-aberta td { background: none; }
    .em-tabela tr.em-linha-painel, .em-tabela tr.em-linha-confirma {
      display: block; padding: 0; margin: -1px 0 8px; grid-template-areas: none;
      border: 1px solid var(--borda); border-top: 0;
    }
    .em-tabela tr.em-linha-painel td, .em-tabela tr.em-linha-confirma td { display: block; }
    .em-painel { padding: 4px 14px 14px; }
    .em-tabela tr.em-linha-confirma .pergunta { padding: 12px 14px; border: 0; }
    .em-baixa-campos { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .em-baixa-obs { grid-column: 1 / -1; }
    .em-importar-corpo { padding-left: 0; }
  }
  @media (max-width: 900px) {
    .em-defora li { grid-template-columns: minmax(0, 1fr) auto; }
    .em-defora .r-frase { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    /* No telefone o ato da linha ganha a largura toda, e «Boleto e baixa» desce
       para o pe do cartao: lado a lado, os dois quebravam em duas linhas cada. */
    .em-tabela tbody tr {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-areas: "uc uc uc" "sit sit sit" "ven kwh tot" "aco aco aco" "abrir abrir abrir";
    }
    .em-tabela .c-aco .em-acoes { justify-content: flex-start; flex-wrap: nowrap; }
    .em-tabela .c-aco .em-menu { margin-left: auto; }
    .em-tabela .em-menu-vazio { display: none; }
    .em-tabela .c-abrir { border-top: 1px solid var(--borda-suave); padding-top: 4px; }
    .em-tabela .c-sit { justify-self: start; text-align: left; max-width: none; }
    .em-tabela .c-sit .em-nota { justify-content: flex-start; }
    .em-baixa-campos { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .em-baixa-campos > div:first-child { grid-column: 1 / -1; }
  }

  /* ====================== A PERGUNTA NA TELA E A REVISAO EM SERIE (30/09/2026, etapa 4b)
     Os dois desenhos de "serie.tsx". Ate esta data eles existiam duas vezes —
     "fu-*" em Contas de luz e "em-*" em Cobrancas — com as mesmas regras e
     medidas quase iguais; e quatro telas ainda perguntavam com a caixa do
     navegador. Agora ha um CSS so, e cada tela guarda apenas o ENCAIXE (a linha
     de tabela sem respiro proprio, o recuo ate a coluna do triangulo).

     A PERGUNTA: a caixa inteira diz o tom — fundo do erro quando o sim apaga,
     ambar quando tira algo so da tela, o cartao quando anda para a frente, e o
     contorno do acento no resumo do pagamento, que nao se desfaz. A cor fica no
     FUNDO e no botao, nunca no texto: e paragrafo para ser lido. */
  .pergunta {
    display: grid; gap: 10px; padding: 14px 18px; font-size: var(--t-ui);
    background: var(--fundo2); border: 1px solid var(--borda);
  }
  .pergunta.tom-perigo {
    background: var(--erro-fundo); border-color: color-mix(in srgb, var(--erro) 30%, var(--erro-fundo));
  }
  .pergunta.tom-aviso {
    background: var(--alerta-fundo); border-color: color-mix(in srgb, var(--alerta) 30%, var(--alerta-fundo));
  }
  .pergunta.tom-decisao { border-color: var(--acento-forte); }
  .pergunta-texto { line-height: 1.5; max-width: 80ch; }
  .pergunta-campo { display: grid; gap: 4px; max-width: 560px; }
  .pergunta-campo label { margin: 0; color: var(--texto); font-weight: 600; }
  .pergunta-campo textarea { resize: vertical; min-height: 56px; }
  .pergunta-nota { font-size: var(--t-meta); color: var(--fraco); }
  .pergunta-atos { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pergunta > .aviso { margin: 0; }
  /* NA LINHA (a linha de uma tabela, a barra de acoes): a frase a esquerda e os
     dois atos a direita, e eles descem para baixo da frase quando falta largura. */
  .pergunta.na-linha {
    display: flex; align-items: center; justify-content: space-between; gap: 8px 16px;
    flex-wrap: wrap; padding: 9px 12px;
  }
  .pergunta.na-linha .pergunta-texto { flex: 1 1 32ch; max-width: 72ch; line-height: 1.45; }
  .pergunta.na-linha .pergunta-atos { flex: none; }
  /* A PERGUNTA NUMA LINHA PROPRIA DA TABELA (Contratos, Contas a pagar): a
     linha nao tem respiro nem hover, e a caixa perde as bordas dos lados para
     ler como continuacao da linha que a pediu. */
  tr.linha-pergunta > td { padding: 0; border-bottom: 0; white-space: normal; }
  tr.linha-pergunta:hover { background: none; }
  tr.linha-pergunta .pergunta { border-width: 0 0 1px; }
  tr.usuario-retorno .pergunta { margin: 0 0 4px; }
  /* NA TABELA QUE ROLA PARA O LADO (Contratos e Usuarios no celular), a linha
     da pergunta tem a largura da TABELA, e nao a da tela: a frase sumia para a
     direita, atras da rolagem. A caixa fica presa a borda esquerda e na largura
     visivel — a da janela menos as margens da pagina e a borda da rolagem. */
  .rolagem td > .pergunta { position: sticky; left: 0; max-width: calc(100vw - 42px); }

  /* A REVISAO: uma caixa so, contornada no laranja-texto — e a decisao pendente
     da tela, e o contorno e o que a separa da tabela embaixo. A lista rola
     dentro dela: com trinta linhas ela nao empurra a tabela para fora da tela,
     e a soma e o «Sim» ficam a vista. */
  .serie-revisao {
    margin: 0 0 12px; padding: 16px 18px; background: var(--fundo2);
    border: 1px solid var(--acento-forte);
  }
  .serie-revisao h3 { margin: 0; }
  /* O titulo recebe foco por programa ao abrir: nao e controle, nao desenha anel. */
  .serie-revisao h3[tabindex="-1"]:focus { outline: none; }
  .serie-nota { margin: 4px 0 12px; font-size: var(--t-ui); color: var(--fraco); max-width: 80ch; }
  .serie-revisao > .aviso { margin: 0 0 12px; }
  .serie-lista {
    list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto;
    border-top: 1px solid var(--borda-suave); border-bottom: 1px solid var(--borda-suave);
  }
  .serie-lista li {
    display: grid; grid-template-columns: 150px minmax(0, 1fr) 120px minmax(0, 200px);
    gap: 4px 14px; align-items: center; padding: 7px 2px;
    border-bottom: 1px solid var(--borda-suave); font-size: var(--t-ui);
  }
  .serie-lista.com-selecao li {
    grid-template-columns: 22px 130px minmax(0, 1fr) 130px 110px minmax(0, 170px);
  }
  .serie-lista li:last-child { border-bottom: 0; }
  .serie-lista li.serie-tirada .r-uc, .serie-lista li.serie-tirada .r-cli,
  .serie-lista li.serie-tirada .r-ven, .serie-lista li.serie-tirada .r-val {
    color: var(--fraco); text-decoration: line-through;
  }
  .serie-lista .r-sel input { width: 17px; height: 17px; margin: 0; display: block; }
  .serie-lista .r-uc { font-weight: 600; }
  .serie-lista .r-cli { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .serie-lista .r-ven { color: var(--fraco); }
  .serie-lista .r-val { text-align: right; }
  .serie-lista .r-motivo { grid-column: 2 / -1; }
  .serie-lista .fu-motivo { margin-top: 0; }
  .serie-lista .r-motivo .em-recusa { margin: 2px 0 4px; }
  .serie-pe {
    display: flex; align-items: center; justify-content: space-between; gap: 10px 16px;
    flex-wrap: wrap; margin-top: 12px;
  }
  .serie-atos { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
  @media (max-width: 900px) {
    .serie-revisao { padding: 14px; }
    .serie-lista li {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "uc val" "cli cli" "est est" "mot mot";
    }
    .serie-lista.com-selecao li {
      grid-template-columns: 22px minmax(0, 1fr) auto;
      grid-template-areas: "sel uc val" "sel cli cli" "sel ven est" "sel mot mot";
    }
    .serie-lista .r-sel { grid-area: sel; align-self: start; padding-top: 2px; }
    .serie-lista .r-uc { grid-area: uc; }
    .serie-lista .r-val { grid-area: val; }
    .serie-lista .r-cli { grid-area: cli; }
    .serie-lista .r-ven { grid-area: ven; }
    .serie-lista .r-est { grid-area: est; }
    .serie-lista.com-selecao .r-est { justify-self: end; }
    .serie-lista .r-motivo { grid-area: mot; grid-column: auto; }
  }

  /* ======================== O MES, PASSO A PASSO (30/09/2026, etapa 3 do redesenho)
     O funil do mes no alto da tela Mes, e a faixa que diz, dentro de cada tela
     de trabalho, que parte do mes ela e. Ate esta data os dois eram desenhados
     com estilo escrito no proprio componente — cinco "style" por linha, e as
     cores com um valor de reserva literal ao lado do token. */

  /* ------------------------------------------------------------- a caixa */
  .roteiro { padding: 0; }
  .roteiro-topo { padding: 20px 20px 16px; }
  .roteiro-topo h2 { margin: 0; font-size: var(--t-h2); }
  .roteiro-frase {
    margin: 6px 0 0; max-width: 72ch; font-size: var(--t-corpo); line-height: 1.5;
    display: flex; gap: 7px; align-items: baseline;
  }
  .roteiro.estado-fechado .roteiro-frase { color: var(--ok); font-weight: 600; }
  .roteiro-frase .ic { align-self: center; }
  /* O AVISO DE OUTROS MESES (30/09, etapa 4a): uma linha abaixo da frase,
     menor que ela e sem o peso do risco — o triangulo ambar e o link. */
  .roteiro-fora {
    margin: 8px 0 0; display: flex; gap: 6px; align-items: flex-start; max-width: 72ch;
    font-size: var(--t-ui); line-height: 1.5;
  }
  .roteiro-fora .ic { color: var(--alerta); margin-top: 3px; flex: none; }

  /* ------------------------------------------------ os cinco passos, lado a lado
     UMA FAIXA, E NAO CINCO CARTOES: sao cinco momentos da mesma coisa, e a
     linha de 1px entre eles e o que os mantem uma peca so. Cada passo e uma aba
     do painel de baixo. */
  .roteiro-passos {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
    border-top: 1px solid var(--borda); border-bottom: 1px solid var(--borda);
    background: var(--fundo-recuo);
  }
  .roteiro-passo {
    display: grid; grid-template-rows: auto auto auto auto auto 1fr; justify-items: start;
    align-content: start; gap: 2px; text-align: left;
    padding: 12px 16px 14px; margin: 0;
    background: transparent; color: var(--texto);
    border: 0; border-left: 1px solid var(--borda); border-bottom: 3px solid transparent;
    border-radius: 0; box-shadow: none;
    font-family: var(--fonte); font-size: var(--t-corpo); font-weight: 400; letter-spacing: normal;
    line-height: 1.3; text-transform: none;
  }
  .roteiro-passo:first-child { border-left: 0; }
  .roteiro-passo:hover:not(:disabled) {
    background: var(--fundo-hover); color: var(--texto); border-color: var(--borda);
    border-bottom-color: transparent; box-shadow: none; transform: none;
  }
  .roteiro-passo:first-child:hover:not(:disabled) { border-left-color: transparent; }
  /* A ABA ESCOLHIDA SOBE PARA A SUPERFICIE DO PAINEL — o mesmo branco dele — e
     ganha o filete da aba ativa da barra. E o que liga o passo ao texto de baixo. */
  .roteiro-passo[aria-selected="true"],
  .roteiro-passo[aria-selected="true"]:hover:not(:disabled) {
    background: var(--fundo2); border-bottom-color: var(--acento-forte);
  }
  .roteiro-passo:focus-visible { outline-offset: -3px; }

  .roteiro-selo { min-height: 15px; color: var(--acento-forte); font-size: var(--t-rotulo); line-height: 1.25; }
  .roteiro-cab { display: flex; gap: 8px; align-items: flex-start; min-height: 2.5em; }
  .roteiro-num {
    flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin-top: 1px;
    border: 1px solid var(--borda-forte); border-radius: var(--raio-pequeno);
    font-family: var(--fonte-cond); font-size: 13px; font-weight: 700; color: var(--texto);
    background: var(--fundo2);
  }
  /* O DESTAQUE E O NUMERO CHEIO — o laranja com a tinta Navy, 5,93:1 — mais a
     palavra «Comece aqui» em cima. Forma e palavra: a cor nunca sozinha. */
  .roteiro-passo.foco .roteiro-num { background: var(--acento); border-color: var(--acento); color: var(--acento-texto); }
  .roteiro-tit { font-family: var(--fonte-cond); font-size: var(--t-ui); font-weight: 600; line-height: 1.25; }
  .roteiro-qtd {
    margin-top: 6px; font-family: var(--fonte-cond); font-size: 28px; font-weight: 600; line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .roteiro-rot { font-size: var(--t-meta); font-weight: 600; }
  .roteiro-ctx { font-size: var(--t-meta); color: var(--fraco); }
  /* O que de outros meses pede voce, na aba: a mesma linha de contexto com o
     triangulo do aviso — peso de aviso, nao de risco (30/09, etapa 4a). */
  .roteiro-ctx.fora { display: flex; gap: 4px; align-items: flex-start; }
  .roteiro-ctx.fora .ic { color: var(--alerta); margin-top: 2px; flex: none; }
  /* ZERO E NAO MEDIDO FICAM NA TINTA APAGADA — que continua AA (--fraco, 5,5:1
     no branco) —, e nao em opacidade: o «apagado a 60%» do roteiro antigo
     derrubava o texto para baixo de 4,5:1. */
  .roteiro-passo.zerado .roteiro-qtd, .roteiro-passo.zerado .roteiro-rot { color: var(--fraco); }
  .roteiro-risco {
    margin-top: 6px; display: flex; gap: 5px; align-items: flex-start;
    font-size: var(--t-meta); font-weight: 600; line-height: 1.35; color: var(--alerta);
  }
  .roteiro-risco .ic { margin-top: 2px; }

  /* ------------------------------------------------------------- o painel */
  .roteiro-painel { padding: 18px 20px 20px; }
  .roteiro-painel-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .roteiro-painel-cab h3 { margin: 0; font-size: var(--t-h3); }
  .roteiro-painel-risco {
    margin: 8px 0 0; display: flex; gap: 6px; align-items: flex-start;
    color: var(--alerta); font-size: var(--t-corpo);
  }
  .roteiro-painel-risco .ic { margin-top: 3px; }
  .roteiro-painel-oque { margin: 8px 0 0; max-width: 72ch; line-height: 1.6; }
  .roteiro-painel-ir { margin: 14px 0 0; }
  .roteiro-como-tit {
    margin: 18px 0 0; font-family: var(--fonte-cond); font-size: var(--t-rotulo); font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase; color: var(--fraco);
  }
  .roteiro-como { margin: 6px 0 0; padding-left: 20px; max-width: 76ch; line-height: 1.65; }
  .roteiro-como li + li { margin-top: 4px; }

  /* ------------------------------------------------- o que o cadastro trava
     UMA LINHA PROPRIA, embaixo do painel e separada dele: o cadastro trava
     unidades, nao passos. Ambar e nao vermelho — e trabalho a fazer, nao coisa
     quebrada; o vermelho da casa e para o que esta quebrado. */
  .roteiro-travas {
    border-top: 1px solid var(--borda); padding: 14px 20px 16px;
    background: var(--alerta-fundo);
  }
  .roteiro-travas-tit {
    margin: 0; display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap;
    font-size: var(--t-corpo);
  }
  .roteiro-travas-tit .ic { color: var(--alerta); align-self: center; }
  .roteiro-travas ul {
    list-style: none; margin: 8px 0 0; padding: 0;
    display: flex; flex-wrap: wrap; gap: 6px 22px;
  }
  .roteiro-travas li { font-size: var(--t-ui); line-height: 1.5; }
  .roteiro-trava-nome { font-weight: 600; }
  .roteiro-travas-repasse { margin: 8px 0 0; font-size: var(--t-meta); max-width: 90ch; }

  /* --------------------------------- a lista do mes, embaixo do funil
     [30/09, etapa 4a] MAIS QUIETA QUE O FUNIL, de proposito: o titulo e uma
     linha de estado (quantas em aberto, quantas fechadas, «ver quais» e o link
     da ajuda), e o grupo diz UMA vez o que as linhas dele travam. A linha da
     tabela ficou com o fato curto. */
  .mes-lista-cab h2 { margin: 30px 0 4px; }
  .mes-lista-estado {
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline;
    gap: 6px 18px; margin: 0 0 12px; color: var(--fraco); font-size: var(--t-ui);
  }
  .mes-lista-estado strong { color: var(--texto); }
  button.mes-como-ler { display: inline-flex; align-items: center; gap: 6px; }
  .mes-oque { max-width: 520px; }

  /* NO CELULAR OS CINCO PASSOS SAO UMA LISTA: numero e titulo a esquerda, a
     contagem grande a direita, e o risco embaixo, na largura toda. Cinco colunas
     de 70px quebrariam «Pedir o boleto e entregar ao cliente» em seis linhas. */
  @media (max-width: 720px) {
    .roteiro-topo { padding: 16px 16px 14px; }
    .roteiro-passos { grid-template-columns: minmax(0, 1fr); }
    .roteiro-passo {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: none;
      grid-template-areas: "selo selo" "cab qtd" "rot qtd" "ctx ctx" "risco risco";
      column-gap: 12px; padding: 10px 16px 11px;
      border-left: 0; border-top: 1px solid var(--borda);
    }
    .roteiro-passo:first-child { border-top: 0; }
    .roteiro-selo { grid-area: selo; min-height: 0; }
    .roteiro-selo:empty { display: none; }
    .roteiro-cab { grid-area: cab; min-height: 0; align-items: center; }
    .roteiro-qtd { grid-area: qtd; margin: 0; align-self: center; justify-self: end; font-size: 26px; }
    .roteiro-rot { grid-area: rot; padding-left: 30px; }
    .roteiro-ctx { grid-area: ctx; padding-left: 30px; }
    .roteiro-risco { grid-area: risco; padding-left: 30px; margin-top: 4px; }
    .roteiro-painel { padding: 16px; }
    .roteiro-travas { padding: 12px 16px 14px; }
    .roteiro-travas ul { flex-direction: column; gap: 6px; }
  }

  /* --------------------------------------------- a faixa da tela de trabalho */
  .faixa-do-passo { padding: 10px 14px; margin-bottom: 14px; font-size: var(--t-meta); line-height: 1.6; }
  .faixa-do-passo p { margin: 0; }
  .faixa-do-passo p + p { margin-top: 3px; }
  .faixa-do-passo > p:first-child .ic { display: inline-block; vertical-align: -2px; }

  /* ======================== CELULAR E ACESSIBILIDADE (01/10/2026, etapa 5)
     Tres pecas que valem para o sistema inteiro: a tabela que vira cartao, o
     alvo de toque, e a regiao viva que existe antes do texto. Cada uma esta
     explicada no componente que a usa ("Tabela", "RetornoDoAto", "Campo", em
     "ui.tsx"); aqui fica a mecanica. */

  /* A REGIAO VIVA VAZIA SAI DO LAYOUT, MAS NAO DA ARVORE DE ACESSIBILIDADE.
     "display: none" a tiraria das duas — e uma regiao que reaparece junto com
     o texto e justamente a que o leitor de tela nao anuncia. Recortada, ela
     continua la, esperando a frase. */
  .regiao-viva:empty {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip-path: inset(50%); border: 0;
  }

  /* O ROTULO E O PORQUE NUMA LINHA, fora do label — ver "Campo" em ui.tsx. A
     explicacao aberta desce para a linha de baixo, na largura toda. */
  .campo-rotulo { display: flex; align-items: center; flex-wrap: wrap; gap: 0 6px; margin-bottom: 5px; }
  .campo-rotulo label { margin: 0; }
  .campo-rotulo .campo-porque { flex: 1 1 100%; }
  /* O CAMPO ERRADO: contorno na cor do erro e a frase logo abaixo, ligada por
     "aria-describedby". A cor nao e o unico sinal — a frase diz o que fazer. */
  input[aria-invalid="true"], input[aria-invalid="true"]:hover:not(:disabled) { border-color: var(--erro); }
  .campo-erro {
    display: flex; gap: 6px; margin: 5px 0 0; font-size: var(--t-meta); line-height: 1.45; color: var(--erro);
  }

  /* O ROTULO DE UM VALOR QUE NAO E CAMPO (a data do certificado, a usina e a
     distribuidora no detalhe da unidade): o desenho do <label>, sem ser um —
     label sem controle e um nome que nao nomeia nada. */
  .rotulo-solto { display: block; margin: 0 0 5px; font-size: var(--t-meta); font-weight: 500; color: var(--fraco); }
  /* O rotulo na mesma linha do campo («Desde», no Historico). */
  label.rotulo-em-linha { margin: 0; font-size: var(--t-meta); }
  /* O recibo de uma linha de Contas a pagar: o corpo de meta, e nao 11,5px. */
  .recibo-da-linha { font-size: var(--t-meta); font-weight: 400; }
  /* O SUCESSO DENTRO DE OUTRO AVISO (o religar do aviso de pagamento): o icone
     da casa na cor do estado, a frase na tinta do texto. */
  .aviso-retorno { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; color: var(--texto); }
  .aviso-retorno > .ic { color: var(--ok); margin-top: 2px; flex: none; }
  /* A LINHA DO RETORNO (Contratos): vazia, sem altura e sem linha. */
  tr.linha-retorno > td { padding: 0; border-bottom: 0; }
  tr.linha-retorno:hover { background: none; }
  /* A ultima linha de verdade antes do retorno vazio nao desenha a linha de
     baixo: quem fecha a tabela e a borda da caixa, como sempre. */
  tbody tr:has(+ tr.linha-retorno:last-child) > td { border-bottom: 0; }
  tr.linha-retorno .aviso { margin: 8px 14px 10px; }
  /* O BOTAO QUE E UMA FRASE («Quem e quem no outro sistema — 2 ainda
     conferidos por nome»): no celular ele quebra linha, e a entrelinha de
     botao (1,2) aperta as duas linhas uma na outra. Entrelinha de texto, e a
     frase alinhada a esquerda. */
  button.botao-frase { line-height: 1.4; text-align: left; justify-content: flex-start; }

  /* A MEDIDA DE LEITURA nas frases que atravessavam a tela inteira a 1440 (o
     detector mediu 111 a 161 caracteres por linha): a faixa do passo, a lista
     de lacunas, a nota do cartao, a frase do cabecalho de grupo e a coluna de
     prosa das tabelas. 62ch, e nao 80: o "ch" e a largura do zero, e na Barlow
     o zero e mais largo que a letra media — 80ch davam 95 caracteres. */
  .faixa-do-passo p, .faixa-lista li, .cartao > p.nota, .roteiro-travas-repasse,
  .grupo-da-tabela p { max-width: 62ch; }
  /* A celula de tabela ignora "max-width"; quem tem a medida e o texto dentro dela. */
  .celula-frase { display: block; max-width: 62ch; }
  /* A linha de baixo do nome em «Quem mais deve» (Contas a receber) quebra,
     em vez de empurrar a coluna estreita para fora do telefone. */
  .devedor-meta { white-space: normal; }
  /* O cabecalho de grupo prende os filhos a esquerda (sticky) com a medida da
     janela; a frase dele fica na medida de leitura. */
  tr.grupo-da-tabela td > p { max-width: min(62ch, calc(100vw - 96px)); }
  .mes-oque { max-width: 62ch; }

  /* O BOTAO DENTRO DA LINHA QUE FILTRA (Contas a receber): parece o texto da
     linha, e e por ele que o teclado chega ao filtro. Ligado, ganha o
     sublinhado — o negrito da linha diz o mesmo para quem ve. */
  button.linha-filtro {
    padding: 0; min-height: 24px; border: 0; background: none; box-shadow: none;
    font: inherit; font-weight: inherit; letter-spacing: normal; text-transform: none;
    color: inherit; justify-content: flex-start; text-align: left;
  }
  button.linha-filtro:hover:not(:disabled) { background: none; border-color: transparent; color: var(--acento-forte); }
  button.linha-filtro[aria-pressed="true"] { text-decoration: underline; text-underline-offset: 3px; }

  /* ---------------------------------------- alvo de 24px em qualquer largura
     WCAG 2.5.8. O que ficava abaixo, medido a 1440 em 01/10: a seta de ordenar
     (16px de altura — o botao era so a palavra), o titulo de secao do menu
     (24 cravados, 23,5 na pratica), o porque do campo (18px), o "x" do balao
     da ajuda (20px), o link da unidade em Contas de luz (23px) e o da geracao
     em Usinas (22px). O desenho nao muda: cresce a area, nao a letra. */
  thead th:has(.ordenar) { padding-top: 6px; padding-bottom: 6px; }
  th .ordenar { min-height: 24px; }
  button.lateral-secao-tit { min-height: 26px; }
  .campo-porque-botao { width: 24px; height: 24px; }
  .ajuda-balao-x { width: 24px; height: 24px; }
  .g3ref button.fu-link, button.em-link, .ligacao-crm, a.ir-resolver { min-height: 24px; }
  .g3ref .fu-tabela th.c-sel label { min-height: 24px; align-items: center; }
  .ligacao-crm { align-items: center; }
  /* A CAIXA DE MARCAR DENTRO DE UMA CELULA ganha um "label" em volta, sem
     texto (o nome continua no "aria-label" da caixa): clicar na margem dele
     marca. O quadrado nativo fica do tamanho de sempre. */
  .alvo-caixa {
    display: inline-grid; place-items: center; min-width: 24px; min-height: 24px;
    margin: 0; cursor: pointer;
  }
  /* A busca da central de ajuda ocupa a largura do painel. */
  .ajuda-corpo .busca input { width: 100%; }
  /* O nome do painel de ajuda e titulo (h2) desde 01/10, no corpo de antes. */
  .ajuda-topo h2.ajuda-titulo {
    display: inline-flex; align-items: center; gap: 8px; margin: 0;
    font-family: var(--fonte); font-size: var(--t-corpo); font-weight: 700; line-height: 1.3;
  }

  /* ---------------------------------------- a tabela que vira cartao
     A medida e a da propria tabela (o "container"), como em Cobrancas desde a
     etapa 3b. Abaixo de 720px DE TABELA cada linha e um cartao do mesmo
     desenho dos de Contas de luz e Cobrancas: branco, 1px de linha, 8px entre
     um e outro. Dentro dele, duas colunas de "rotulo / valor", com quatro
     lugares fixos:

       identificacao   a primeira celula (ou ".c-id"), na largura toda, no alto
       situacao        ".c-sit", logo abaixo dela
       valor           ".c-val", logo depois
       acao            ".c-aco", ou a ultima celula quando ela tem botao: no pe,
                       na largura toda

     O CABECALHO SAI INTEIRO: o nome de cada coluna ja esta em cada celula
     ("data-rotulo", escrito pela "Tabela"), e a ordenacao vira UM seletor
     «Ordenar por» acima da lista (".ordenar-por", o "OrdenarPor" do "ui.tsx").
     [01/10, etapa 6] Ate aqui as colunas que ordenam viravam uma fileira de
     botoes de 44px — tres fileiras em Contas a pagar, antes do primeiro cartao.

     AS LARGURAS ESCRITAS NA CELULA ("style" de largura minima, 180px na data
     de Unidades, 210px no documento de Clientes) valem para a tabela e nao
     para o cartao: elas empurravam a coluna para fora de um telefone de 360px.
     O "!important" e o unico jeito de vencer um "style" — e e so aqui dentro. */
  .tabela-cartoes { container: tabela / inline-size; }
  /* O SELETOR «ORDENAR POR» so existe no cartao: na tabela, a ordem e a seta
     do cabecalho. Rotulo e campo na mesma linha, o campo do tamanho do que
     diz — e, no telefone, os 44px que todo campo tem. */
  .ordenar-por { display: none; }
  .ordenar-por label { margin: 0; white-space: nowrap; }
  .ordenar-por .campo-caixa { flex: 1 1 auto; min-width: 0; max-width: 320px; }
  @container tabela (max-width: 720px) {
    ${CARTAO_DA_TABELA}
  }
  /* [01/10, etapa 6] A TABELA CURTA DE RESUMO (Contas a receber: as faixas de
     atraso e quem mais deve) vira cartao so abaixo de 440px DE TABELA. Numa
     coluna de meia tela do computador ela tem uns 500px e cabe como tabela —
     com o limite de 720 ela virava cartao ali tambem, e «Quem mais deve» descia
     uma tela e meia abaixo da dobra. O nome do container muda, e o mesmo
     desenho de cartao vale nos dois limites, sem copia escrita a mao. */
  .tabela-cartoes.estreita { container-name: tabela-estreita; }
  @container tabela-estreita (max-width: 440px) {
    ${CARTAO_DA_TABELA}
  }
  /* [01/10, etapa 7a] A TABELA LARGA (Contratos: sete colunas e o «⋯» na
     linha) vira cartao abaixo de 860px DE TABELA, a medida de Cobrancas. Acima
     disso as colunas cabem, e a rolagem fica aberta — e por ela estar aberta
     que o menu da ULTIMA linha sai por baixo da tabela, em vez de ser cortado
     pela caixa que rola. As celulas quebram em qualquer ponto, para um nome
     comprido nunca empurrar a tabela para fora. */
  .tabela-cartoes.larga { container-name: tabela-larga; }
  .tabela-cartoes.larga > .rolagem { overflow: visible; }
  .tabela-cartoes.larga td { overflow-wrap: anywhere; }
  .tabela-cartoes.larga td.c-aco, .tabela-cartoes.larga td.num { overflow-wrap: normal; }
  @container tabela-larga (max-width: 860px) {
    ${CARTAO_DA_TABELA}
    /* O «Mais ações» divide a última linha do cartão com «Cheias pagas», à
       direita — uma linha inteira só para ele era a mais vazia do cartão. */
    .tabela-cartoes.larga tbody > tr > td.ct-aco.c-aco:last-child { grid-column: auto; text-align: right; align-self: end; }
    .tabela-cartoes .ct-menu { display: inline-block; }
    .tabela-cartoes .ct-menu > button.so-icone { width: auto; padding: 0 12px; gap: 6px; border-color: var(--borda); }
    .tabela-cartoes .ct-menu-texto { display: inline; }
  }

  /* ---------------------------------------- o celular: alvo de 44px
     A REGRA E POR LARGURA (720px, a mesma dos cartoes) e nao por "pointer":
     e no telefone que o dedo erra, e e la que a tela foi medida. Tudo o que
     se aperta ganha 44px de altura; o que e so icone ganha 44 nos dois lados.
     As excecoes sao duas, e nenhuma e acao — ficam nos 24px que valem em
     qualquer largura: o porque ao lado do rotulo (a 44px ele invadiria o
     campo logo abaixo, e quem erra o toque abre uma explicacao, nao apaga
     nada) e o "x" do balao da ajuda, que o dono pediu "bem pequeno" e que nao
     e o unico jeito de fechar o balao — abrir a ajuda tambem fecha. */
  @media (max-width: 720px) {
    button:not(.abrir-calendario):not(.campo-porque-botao):not(.ajuda-balao-x):not(.ordenar),
    a.botao, a.fu-ir, .ajuda-ir, summary { min-height: 44px; }
    button.so-icone, button.so-icone.grande, button.em-abrir, .g3ref button.fu-chip-x, button.chip-x { min-width: 44px; min-height: 44px; }
    button.discreto, button.em-link, .g3ref button.fu-link, .ligacao-crm, a.ir-resolver { min-height: 44px; }
    /* O CALENDARIO DE DENTRO DO CAMPO DE DATA: o proprio campo ja abre o
       seletor ao toque, mas o desenho e um botao — e botao no telefone e 44px.
       O campo reserva a direita para ele. */
    .campo-data input, .inline .campo-data input { padding-right: 46px; }
    .campo-data .abrir-calendario, .inline .campo-data .abrir-calendario { right: 0; width: 44px; height: 44px; }
    .ligacao-crm { padding: 0 10px; }
    .interruptor { min-height: 44px; }
    .alvo-caixa { min-width: 44px; min-height: 44px; }
    .g3ref .fu-tabela th.c-sel label { min-height: 44px; }
    .g3ref .fu-tabela td.c-sel .alvo-caixa, .serie-lista .r-sel .alvo-caixa { margin: -13px; }
    .opcao { min-height: 44px; }
    .menu-painel button, .menu-painel .item, .setor-item { min-height: 44px; }
    .ajuda-pergunta { min-height: 44px; align-items: center; }
    .ajuda-pergunta .ic { margin-top: 0; }
    .pular { min-height: 44px; display: inline-flex; align-items: center; }

    /* O CAMPO: 44px, e o texto a 16px. Abaixo de 16 o Safari do iPhone da
       zoom na pagina ao focar o campo, e a tela fica cortada ate a pessoa
       desfazer o zoom com dois dedos. */
    input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea { font-size: 16px; }
    input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select { min-height: 44px; }

    /* A BARRA DE FERRAMENTAS EMPILHA: a busca e cada filtro na largura toda,
       em vez de um campo de 260px e tres selects de larguras diferentes. */
    .ferramentas { align-items: stretch; }
    .ferramentas > .busca, .ferramentas > .campo-caixa { flex: 1 1 100%; }
    .ferramentas .busca input, .ferramentas select, .ferramentas .campo-caixa select { width: 100%; }
    .ferramentas .contagem { margin-left: 0; flex: 1 1 100%; }

    /* O CAMPO NUMA FILEIRA FLEXIVEL (o formulario do Conector Sicoob) ocupa a
       linha toda: lado a lado eles ja nao cabiam, e um embaixo do outro cada
       um ficava da largura do proprio rotulo. Na grade (".campos") isto nao
       vale nada — quem manda la e a grade. */
    .campo { flex: 1 1 100%; }
    /* O interruptor quebra a frase alinhada a esquerda, como texto. */
    .interruptor { justify-content: flex-start; text-align: left; }

    /* A BAIXA MANUAL de Cobrancas: tres colunas de 90px nao cabem num
       telefone — a data e o valor ficam lado a lado, o resto empilha. */
    .em-baixa-campos { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .em-baixa-campos > :first-child { grid-column: 1 / -1; }
  }

  /* ------------------------------------------- a ajuda no celular
     NO COMPUTADOR o botao fica no canto inferior direito, como o dono pediu em
     21/08. ABAIXO DE ${MENU_VIRA_GAVETA}px — onde existe a faixa do topo — ele
     sobe para ela, no canto direito, ao lado do «Menu»: no canto de baixo ele
     cobria a ultima coluna de toda tabela e o botao de toda linha que
     passasse por ele, medido em 01/10 em Clientes, Contas a pagar e Unidades.
     O balao da primeira visita desce dele, em vez de subir — e continua
     apontando para o botao que existe. */
  @media (max-width: ${MENU_VIRA_GAVETA - 0.02}px) {
    .faixa-celular-linha { padding-right: 60px; }
    .ajuda-gatilho { top: 6px; right: 8px; bottom: auto; width: 44px; height: 44px; z-index: 21; }
    .ajuda-balao {
      top: 76px; right: 8px; bottom: auto; transform-origin: top right;
      animation-name: ajuda-descer;
    }
    .ajuda-bolha { animation-name: ajuda-descer; }
    .ajuda-bolha-1 { top: 54px; bottom: auto; right: 26px; }
    .ajuda-bolha-2 { top: 62px; bottom: auto; right: 32px; }
  }
  @keyframes ajuda-descer {
    from { opacity: 0; transform: translateY(-10px) scale(.92); }
  }

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
  /* A ALTURA E FIXA, E NAO MINIMA — conserto de 30/09/2026, medido.

     Era "min-height: 297mm", e isso so garantia o PISO. Com conteudo real
     (endereco longo da Equatorial na grade de quatro colunas, nome em duas
     linhas, campos do tenant) a folha 1 media 301 mm: os 4 mm que sobravam
     iam para uma pagina propria, e o corte "uma folha por pagina" mandava a
     folha 2 para a TERCEIRA. O dono via tres paginas, a do meio quase em
     branco. Em qualquer navegador que nao honre o corte forcado dentro do
     "#documento" absoluto, o mesmo excesso desloca a folha 2 inteira e a
     quebra cai no meio da faixa de pagamento.

     Com a altura cravada, cada folha e EXATAMENTE uma pagina A4 e nada dela
     transborda para outra. Quando o conteudo nao cabe, a folha NAO RECORTA: ela
     se mede e sobe um degrau de aperto por vez ("Folha" em
     "fatura-unificada.tsx", regras em "layout-regras.ts", classes "aperto-*"
     mais abaixo) - primeiro a grade do cliente da ao endereco a largura que ele
     pede, depois os espacamentos compactam. Quando o conteudo cabe, nada muda: o
     "margin-top: auto" dos rodapes absorve a sobra como antes. Vale tambem na
     tela, e de proposito: a previa ja recortava em 297 mm, entao o que se ve
     continua sendo o que sai. O "overflow: hidden" daqui e so a ultima rede. */
  .g3 {
    width: 210mm; height: 297mm; overflow: hidden; padding: 13mm 15mm;
    background: #fff; color: #14213D;
    font-family: 'Barlow', system-ui, sans-serif; font-size: 16px; font-weight: 400;
    line-height: normal; letter-spacing: normal;
    display: flex; flex-direction: column;
    box-shadow: var(--sombra-2); border: 1px solid var(--borda);
  }
  /* NADA DA FOLHA ENCOLHE SOZINHO - o "flex-shrink: 1" de fabrica espremeria a
     faixa de pagamento junto com o resto, e esconderia da medida da "Folha" que o
     conteudo passou do pe (o encolhimento absorveria o excesso antes de ele
     aparecer no "scrollHeight").

     O DETALHAMENTO E "flex: none" E NAO ELASTICO, e isto e o conserto de uma
     primeira versao deste mesmo dia: ele encolhia com recorte, e numa fatura com
     endereco longo a barra «Total» saia cortada ao meio. Numa fatura de cliente
     isso nao passa. O detalhamento agora so COMPACTA (degraus 2 e 3), inteiro. */
  .g3 > * { flex-shrink: 0; }
  .g3 > .g3-det { flex: none; }
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
  /* O HISTORICO E UMA COLUNA FLEX para que, quando a folha 2 aperta, quem encolha
     seja a AREA DAS BARRAS - titulo e meses ficam inteiros. Com o conteudo
     cabendo, a coluna empilha igual ao bloco de antes (nenhuma margem aqui
     dependia de colapso). Ver ".g3.aperto-maximo > .g3-hist" nos degraus. */
  .g3-hist { margin-top: 11pt; display: flex; flex-direction: column; }
  .g3-hist-tit {
    font-size: 10.5pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    padding-bottom: 5pt; border-bottom: 1px solid #14213D; flex: none;
  }
  .g3-hist-barras {
    display: flex; align-items: flex-end; gap: 2pt; height: 34mm; margin-top: 7pt;
    flex: 0 1 auto; min-height: 0;
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
    display: flex; gap: 2pt; margin-top: 2.5pt; flex: none;
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
  .faixa-pgto-barras { height: 13mm; width: 100%; flex: none; }
  .faixa-pgto-barras svg { width: 100%; height: 100%; display: block; }

  .g3-rodape-2 {
    margin-top: auto; padding-top: 10pt; border-top: 1px solid #E4DFD4;
    display: grid; grid-template-columns: 1fr 1.2fr; gap: 12pt;
    font-size: 7pt; color: #66686F; line-height: 1.45;
  }
  .g3-tel-num { font-size: 13pt; font-weight: 700; color: #14213D; }

  /* ------------------------------------------ os degraus de aperto (30/09/2026)
     Aplicados pela "Folha" (fatura-unificada.tsx) SO quando o conteudo passa de
     297 mm, um degrau por vez, medindo entre um e outro. As regras e o porque de
     cada degrau estao em "layout-regras.ts". Nenhum deles mexe em codigo de
     barras, linha digitavel ou QR, e nenhum encolhe texto de valor.

     DEGRAU 1 - A GRADE DO CLIENTE DA A CADA CAMPO A LARGURA QUE ELE PEDE. E a
     causa do defeito medido: o endereco da Equatorial numa coluna de 1/4 quebrava
     em seis linhas, e a linha da grade inteira crescia com ele. O campo longo
     ocupa duas colunas; o que nem em duas cabe ganha uma linha propria, no alto -
     que e onde o servidor ja poe o endereco. "dense" preenche o buraco que o campo
     largo deixaria no fim da linha anterior. */
  .g3.aperto-grade .g3-meta { grid-auto-flow: row dense; }
  .g3.aperto-grade .g3-meta > .meta-dupla { grid-column: span 2; }
  .g3.aperto-grade .g3-meta > .meta-inteira { grid-column: 1 / -1; order: -1; }
  /* DEGRAU 2 - COMPACTA: espacamento e entrelinha, nunca corpo de letra. */
  .g3.aperto-compacta .g3-cliente { padding: 7pt 12pt; }
  .g3.aperto-compacta .g3-cliente-topo { padding-bottom: 6pt; }
  .g3.aperto-compacta .g3-meta { gap: 4pt 14pt; padding-top: 5pt; }
  .g3.aperto-compacta .g3-cartoes { margin-top: 7pt; }
  .g3.aperto-compacta .g3-total { margin-top: 8pt; padding: 10pt 14pt; }
  .g3.aperto-compacta .g3-aviso { padding: 7pt 12pt; }
  .g3.aperto-compacta .g3-det { margin-top: 7pt; }
  .g3.aperto-compacta .g3-det-cab { padding: 1.5pt 0; }
  .g3.aperto-compacta .g3-det-linha,
  .g3.aperto-compacta .g3-det-secao { padding-top: 1.2pt; padding-bottom: 1.2pt; line-height: 1.2; }
  .g3.aperto-compacta .g3-rodape { padding-top: 6pt; }
  .g3.aperto-compacta .g3-hist { margin-top: 7pt; }
  .g3.aperto-compacta .g3-hist-barras { height: 24mm; margin-top: 5pt; }
  .g3.aperto-compacta .g3-indicadores { margin-top: 6pt; }
  .g3.aperto-compacta .g3-ind { padding: 5pt 9pt; }
  .g3.aperto-compacta .faixa-pgto-instr { line-height: 1.25; padding-top: 1.5mm; padding-bottom: 1.5mm; }
  .g3.aperto-compacta .g3-rodape-2 { padding-top: 6pt; }
  /* DEGRAU 3 - A NOTA EXPLICATIVA DOS CARTOES SAI (nao e valor, e o valor esta
     nos cartoes), as barras baixam de novo e, SO AQUI, o grafico ganha licenca de
     encolher sozinho: e o unico bloco da folha cujo recorte nao corta numero -
     encolhe a area das barras, e titulo e meses ficam. O recorte e "clip" com 1pt
     de folga e nao "hidden" seco: medido, o "hidden" afinava a borda de 0,4pt da
     ultima barra. */
  .g3.aperto-maximo .g3-cartao-nota { display: none; }
  .g3.aperto-maximo .g3-hist-barras { height: 16mm; }
  .g3.aperto-maximo > .g3-hist {
    flex-shrink: 1; min-height: 0;
    overflow: hidden; overflow: clip; overflow-clip-margin: 1pt;
  }

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
     o documento tiver mais de uma folha. Hoje ele tem uma, e a regra nao custa.

     "flex: none" E NAO MAIS "height: 100%" (30/09/2026). Enquanto a folha tinha so
     altura minima, o "100%" nao resolvia contra nada e valia "auto". Com a folha em
     297 mm cravados ele passaria a valer a folha inteira e empurraria tudo para
     fora. A faixa tem a altura do proprio conteudo e NAO ENCOLHE: codigo de barras,
     linha digitavel e QR precisam sair inteiros e no tamanho, para ler no caixa e
     na camera. */
  .faixa-pgto {
    border: 1px solid #14213D; display: flex; flex-direction: column;
    break-inside: avoid; page-break-inside: avoid; flex: none;
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
      position: absolute; left: 0; top: 0; width: 100%; margin: 0;
      border: none; border-radius: 0; padding: 0; max-width: none; box-shadow: none;
    }
    /* O "top: 0" TEM DE SER O TOPO DA PAGINA (30/09/2026). Ele so e se nenhum
       ancestral do documento for bloco de contencao: com um "position: relative",
       "transform", "filter", "contain" ou "will-change" no caminho, o documento
       passaria a contar a partir DELE, e o padding que os ancestrais guardam
       (o "main" tem 26 px) desceria as duas folhas e mandaria o pe da segunda
       para uma terceira pagina. Medido hoje: nenhum ancestral posicionado e o
       documento em 0 mm. A regra e para continuar assim quando alguem mexer na
       casca da aplicacao. */
    body *:has(#documento) {
      position: static !important; transform: none !important; filter: none !important;
      contain: none !important; will-change: auto !important;
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
