---
name: Financeiro G3
description: O sistema do mês da G3 Solar — ler as contas de luz, cobrar, receber e repartir — no desenho da referência g3ref, em tela de trabalho.
colors:
  navy: "#14213D"
  creme: "#F6F2EA"
  cartao: "#FFFFFF"
  recuo: "#EDE7DB"
  hover: "#F1ECE1"
  campo: "#FBF9F5"
  tinta-fraca: "#66686F"
  borda: "#D8D2C6"
  borda-suave: "#E4DFD4"
  borda-forte: "#C9C1B1"
  laranja: "#E8843C"
  laranja-hover: "#CC7435"
  laranja-texto: "#995728"
  laranja-suave: "#FBEADB"
  foco: "#B07841"
  topo-fraco: "#999DA8"
  erro: "#B42318"
  erro-fundo: "#FEF3F2"
  ok: "#067647"
  ok-fundo: "#ECFDF3"
  alerta: "#B14608"
  alerta-fundo: "#FFFAEB"
  ouro: "#F4A65A"
  cartao-escuro: "#1C2C4E"
  recuo-escuro: "#182642"
  hover-escuro: "#243458"
  topo-escuro: "#0F1830"
  borda-escuro: "#2C3A5C"
  tinta-fraca-escuro: "#9CA6C0"
  erro-escuro: "#FF6E6E"
  ok-escuro: "#4ADE80"
  alerta-escuro: "#FFD75E"
typography:
  display:
    fontFamily: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  body-ui:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.1em"
  numero-grande:
    fontFamily: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tabular-nums"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "14px"
rounded:
  none: "0"
  bolha: "999px"
spacing:
  gap: "12px"
  secao: "20px"
  cartao: "20px"
  pagina-topo: "28px"
  pagina-lado: "20px"
  largura-maxima: "1160px"
  menu-lateral: "248px"
  menu-recolhido: "64px"
  toque: "44px"
  alvo-minimo: "24px"
components:
  button-primary:
    backgroundColor: "{colors.laranja}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.laranja-hover}"
    textColor: "{colors.navy}"
  button-primary-disabled:
    backgroundColor: "{colors.recuo}"
    textColor: "{colors.tinta-fraca}"
  button-secondary:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-discreto:
    textColor: "{colors.tinta-fraca}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  button-perigo:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.erro}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-perigo-hover:
    backgroundColor: "{colors.erro}"
    textColor: "{colors.cartao}"
  input:
    backgroundColor: "{colors.campo}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  card:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "20px"
  kpi:
    backgroundColor: "{colors.cartao}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "14px 18px 16px"
  table-header:
    backgroundColor: "{colors.recuo}"
    textColor: "{colors.tinta-fraca}"
    typography: "{typography.label}"
    padding: "10px 14px"
  selo-ok:
    backgroundColor: "{colors.ok-fundo}"
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px 3px 6px"
  selo-erro:
    backgroundColor: "{colors.erro-fundo}"
    textColor: "{colors.erro}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px 3px 6px"
  selo-a-fazer:
    backgroundColor: "{colors.alerta-fundo}"
    textColor: "{colors.alerta}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px 3px 6px"
  selo-neutro:
    backgroundColor: "{colors.recuo}"
    textColor: "{colors.tinta-fraca}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px 3px 6px"
  aviso-erro:
    backgroundColor: "{colors.erro-fundo}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "11px 14px"
  aviso-alerta:
    backgroundColor: "{colors.alerta-fundo}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "11px 14px"
  aviso-ok:
    backgroundColor: "{colors.ok-fundo}"
    textColor: "{colors.navy}"
    rounded: "{rounded.none}"
    padding: "11px 14px"
  menu-lateral:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.creme}"
    width: "{spacing.menu-lateral}"
  menu-lateral-item-ativo:
    textColor: "{colors.laranja}"
    rounded: "{rounded.none}"
  aba-ativa:
    textColor: "{colors.navy}"
    borderBottom: "2px solid {colors.navy}"
    rounded: "{rounded.none}"
---

# Design System: Financeiro G3

<!-- Gerado em 01/10/2026 (etapa 6 do redesenho) a partir do que está construído em
     `web/src/tema.ts` (tokens), `web/src/estilo.ts` (regras) e `web/src/ui.tsx`,
     `serie.tsx`, `menu-lateral.tsx` (componentes). O frontmatter é normativo; a
     fonte de verdade continua sendo o código — mudou lá, regenere aqui.
     Etapa 7b (01/10/2026): o tom de cada estado passou a morar em
     `web/src/tom-do-estado.ts`, com suíte (`web/tests/tom-do-estado.ts`); as
     seções Estados, Selos, Abas, Perigo, Funil e Vocabulário foram reescritas. -->

## Overview

**Creative North Star: "O livro-caixa da usina"**

O Financeiro é a mesa de trabalho do mês de uma geradora solar: ler cinquenta contas de luz, gerar e emitir as cobranças, pedir os boletos, dar baixa e repartir o dinheiro entre o dono da usina e quem trouxe o cliente. O desenho é o da referência **g3ref** — a folha que o cliente recebe — levado para o sistema inteiro em 30/09/2026: Barlow e a condensada dela, canto reto, linha de 1px em vez de sombra, o navy da marca como tinta e como faixa, o creme como papel, e o laranja guardado para o ato. É uma ferramenta de **Operate**: quem abre está no meio de uma tarefa, e a tela tem de sumir dentro dela.

A densidade é de livro-caixa, não de painel de vendas. Tabelas inteiras, sem paginação escondida; números em colunas tabulares que se conferem de cima a baixo; a prosa explicativa existe (o dono pediu que a tela dissesse o porquê), mas fecha atrás de «ver detalhe técnico» e de seções recolhidas. A ordem das coisas é a ordem do trabalho: o menu lateral lista o mês, depois os cadastros na ordem em que um depende do outro, depois os passos do mês numerados, depois o resultado.

O que o sistema recusa: sombra flutuando sob cartão, canto arredondado, filete colorido de 4px no lado de um aviso, ícone de outra família, vermelho para o que é só lacuna de cadastro, laranja em dois botões da mesma área, data em ISO na tela.

**Key Characteristics:**
- Canto reto em tudo (raio 0); profundidade por borda de 1px e por superfície (creme → branco → recuo), nunca por sombra, exceto no que flutua de fato (menu aberto, gaveta).
- Barlow 15px no corpo; Barlow Semi Condensed em título, botão, rótulo caixa-alta, cabeçalho de tabela, selo e número grande.
- Um laranja por contexto: o primário com tinta navy (5,93:1); o laranja como texto é sempre o derivado `#995728`.
- Cinco tons de estado com nome de significado, e o vermelho só para falha.
- Toda tabela vira lista de cartões quando a própria tabela fica estreita; no celular todo toque tem 44px.
- Formatos únicos: dia `dd/mm/aaaa`, mês por extenso na frase e `09/2026` na coluna, hora de Goiânia, dinheiro `R$ 1.234,56` com espaço inseparável.

## Colors

Paleta da G3 (navy, creme, laranja, ouro), com os derivados que a medição de contraste exigiu; restrita — o acento cobre menos de um décimo de qualquer tela.

### Primary
- **Laranja G3** (`laranja`): o primário da tela (fundo do botão do ato, com tinta navy), o item ativo do menu lateral e o realce do passo que pede ação no funil do mês. Nunca é texto sobre claro (2,69:1 no branco).
- **Laranja-texto** (`laranja-texto`): o laranja quando ele precisa ser lido — link, coluna ordenada, rótulo ativo. 5,60:1 no branco, 5,02:1 no creme, 4,77:1 no `laranja-suave`.
- **Laranja escurecido** (`laranja-hover`): o hover e o pressionado do primário; a tinta navy sobre ele dá 4,65:1.
- **Laranja-suave** (`laranja-suave`): superfície de destaque (seleção de texto, opção marcada).

### Secondary
- **Ouro G3** (`ouro`): o acento do tema escuro (navy sobre ele 7,95:1) e a ponta do filete laranja→ouro. No claro ele não aparece como cor de texto.
- **Ouro de foco** (`foco`): o anel de foco do claro, 2px cheios — 3,74:1 no branco e 3,35:1 no creme (WCAG 1.4.11). O ouro puro dá 1,80:1 e por isso não é o anel.

### Neutral
- **Navy G3** (`navy`): toda tinta principal (14,31:1 no creme, 15,97:1 no branco) e a faixa do menu lateral.
- **Creme** (`creme`): o papel — fundo da página. É a cor mais visível da marca; a sombra, quando existe, puxa o navy para não acinzentá-lo.
- **Cartão** (`cartao`): a superfície que sobe do creme — cartão, tabela, campo de seleção.
- **Creme aprofundado** (`recuo`): cabeçalho de tabela, linha aberta, botão desabilitado, selo neutro. Tinta fraca sobre ele 4,52:1.
- **Hover** (`hover`), **Campo** (`campo`): o realce da linha sob o mouse e o fundo do input, que afunda um tom do cartão.
- **Tinta fraca** (`tinta-fraca`): texto secundário, rótulo de campo, metadado. 5,56:1 no branco, 4,98:1 no creme. O cinza G3 `#8F939D` (3,08:1) não é usado como tinta.
- **Bordas** (`borda`, `borda-suave`, `borda-forte`): contorno de cartão e campo; divisória interna de tabela (separa sem desenhar grade); o tracejado da área de envio e o campo sob o mouse.
- **Topo-fraco** (`topo-fraco`): item inativo do menu lateral, 5,89:1 sobre o navy.

### Estados
A pergunta que decide o tom é **«o que isto pede de você?»**. Cada estado de negócio tem o seu tom e o seu desenho num lugar só, `web/src/tom-do-estado.ts`, e a tela não escolhe cor: o selo (`Marca`) recebe um `Selo` de lá, e o aviso que fala do mesmo estado lê o tom de lá (`tipoDoAviso`).
- **Erro** (`erro` sobre `erro-fundo`, 6,05:1): FALHOU — algo aconteceu e deu errado. A recusa do banco (em toda tela, inclusive quando o sistema já está tentando de novo), a cobrança e a conta a pagar vencidas, o atraso, a leitura que não voltou.
- **Alerta / a fazer** (`alerta` sobre `alerta-fundo`, 5,37:1): TAREFA de alguém — o rascunho a emitir, o boleto a pedir, a lacuna de cadastro, a recusa que o cadastro só anuncia, a conta a pagar em aberto.
- **Não medido** (o mesmo âmbar, com a interrogação): NÃO SE SABE — a camada sem medida, a situação que o conector não leu.
- **Ok** (`ok` sobre `ok-fundo`, 5,40:1): FECHOU — pago, registrado, conferido, pronto, ativo.
- **Neutro** (`fraco` sobre `recuo`): NADA A FAZER AGORA — o que está em curso sem você (emitida, boleto a caminho, na vez, aguardando o banco), o que ainda vai vencer, o inativo, o cancelado, o verbo da trilha.

#### O mapa, em resumo (o inteiro está em `tom-do-estado.ts`)
| Estado | Tom | Desenho |
|---|---|---|
| Cobrança: rascunho · emitida · negociada · paga · vencida · cancelada | a_fazer · neutro · neutro · ok · erro · neutro | documento · avião · aperto de mão · visto · alerta redondo · círculo cortado |
| Boleto da cobrança: não pedido · parado há um dia · recusa prevista · recusado (também retentando) | a_fazer · a_fazer · a_fazer · erro | código de barras · código de barras · lápis · X |
| Boleto na carteira: sem boleto · a caminho · no banco · importado · recusado · baixado | a_fazer · neutro · ok · ok · erro · a_fazer | — |
| Atraso: a vencer · até 30 / 31–60 / 61–90 / mais de 90 · faixa vazia | neutro · erro (todas iguais) · neutro | calendário · alerta redondo · traço |
| Conta a pagar: em aberto / parcial · paga · cancelada · vencida | a_fazer · ok · neutro · erro | mão com moedas · visto · círculo cortado · alerta redondo |
| Trilha: criou · alterou · apagou | neutro | mais · setas da troca · lixeira |
| Unidade: ativa · aguardando · troca de titularidade · suspensa · não lida · cancelada | ok · neutro · neutro · neutro · nao_medido · neutro | — · relógio · setas · traço · interrogação · círculo cortado |
| Série (emitir, pedir, ler, gerar): na vez · fazendo · feita · recusada | neutro · neutro · ok · erro | relógio · girando · visto · X |

### Tema escuro
O escuro parte do navy como superfície (`navy` → `cartao-escuro` → `hover-escuro`, com `recuo-escuro` entre a página e o cartão e a faixa afundando em `topo-escuro`). A tinta fraca ganha a matiz do navy (`tinta-fraca-escuro`, 5,68:1 no cartão, 5,05:1 no hover) em vez do cinza neutro. O acento troca para o ouro, e os estados clareiam (`erro-escuro`, `ok-escuro`, `alerta-escuro`, todos acima de 6:1 sobre os próprios fundos). O modo é escolha da pessoa (claro, escuro, sistema), guardado no navegador.

### Named Rules
**The Red Is Failure Rule.** O vermelho é só da falha — algo que aconteceu e deu errado. O que falta preencher é âmbar com o lápis (`a_fazer`), nunca o X vermelho. Faixa de lacuna de cadastro pintada de erro é defeito. E o contrário também: a falha é vermelha em TODA tela — a recusa do banco não sai âmbar no funil e cinza em Cobranças. Quando o sistema já está tentando de novo sozinho, isso é uma segunda linha, em tinta comum, e não outra cor.

**The One Map Rule.** O tom de um estado é decidido em `tom-do-estado.ts` e em mais nenhum lugar. `Marca` só aceita um `Selo` (um `tom=` solto não compila), e a suíte `web/tests/tom-do-estado.ts` prende um tom por estado contra uma tabela escrita à mão, recusa `selo={{ … }}` escrito na tela e recusa outro mapa de estado para tom.

**The Ok Is Closed Rule.** Verde é o que FECHOU. «Vence em 5 dias» não é verde (nada fechou: o cliente ainda não pagou), e «Criou», na trilha, também não (é um fato, não um estado).

**The In-Flight Is Neutral Rule.** O que está em curso sem você é neutro: a cobrança emitida, o boleto a caminho, a linha na vez. Um sexto tom «em curso» foi considerado e recusado em 01/10/2026: numa tela de trabalho a cor se gasta com o que pede alguém. O que separa a emitida da cancelada, as duas cinza, é o desenho, a palavra e o lugar na lista.

**The One Orange Rule.** Um botão laranja por contexto (a página, a gaveta, a revisão em série, a pergunta na tela). O segundo ato da mesma área é o botão comum, de contorno. Seleção não é ato: a aba ativa de Contas de luz é a tinta forte com o sublinhado de 2px (era o bloco laranja cheio, até 01/10/2026). O realce do passo em destaque no funil e o item ativo do menu lateral continuam laranja — são lugar, não botão, e não disputam com o ato da página.

**The AA Floor Rule.** Texto ≥ 4,5:1 em toda superfície dos dois temas; ≥ 3:1 só para o anel de foco e a borda de controle. Cor nova entra com o par medido escrito ao lado do token em `tema.ts`.

## Typography

**Display Font:** Barlow Semi Condensed (com Barlow e a sans do sistema)
**Body Font:** Barlow (com ui-sans-serif, system-ui, Segoe UI, Roboto)
**Label/Mono Font:** Barlow Semi Condensed em caixa alta para rótulo; `ui-monospace` só para código, linha digitável, BR Code e o campo de CPF/CNPJ.

**Character:** a mesma família em duas larguras. A condensada dá voz de cabeçalho de planilha a título, botão e rótulo sem trocar de família; a Barlow regular carrega o texto e os números.

### Hierarchy
- **Display** (600, 30px, 1.1): o título da página (`h1`), um por tela.
- **Headline** (600, 20px, 1.2): título de seção (`h2`), com 30px acima e 11px abaixo.
- **Title** (600, 17px, 1.25): subtítulo dentro de cartão (`h3`).
- **Body** (400, 15px, 1.5): o texto corrido e as células de tabela; a frase de apoio (`.sub`) vai a 72ch no máximo, e a frase dentro de célula a 62ch.
- **UI / Meta** (14px / 13,5px): botões discretos, avisos, a linha de metadado sob um nome.
- **Label** (500, 12px, tracking 0,1em, caixa alta, condensada): cabeçalho de tabela, rótulo de KPI, rótulo de seção, selo de estado.
- **Número grande** (700, 28px; 22px no telefone): o valor do KPI.

### Named Rules
**The Tabular Numbers Rule.** Todo número sai em `tabular-nums` e alinhado à direita em coluna; dinheiro não quebra linha (`td.num` em `nowrap` e espaço inseparável depois do «R$»).

**The No Display Face Rule.** Não há fonte de vitrine: título é a condensada da mesma família, a 30px, e nada passa disso.

## Layout

- **Casca:** menu lateral fixo à esquerda (248px; 64px recolhido), conteúdo com no máximo 1160px, 28px de respiro no alto e 20px dos lados. Abaixo de **900px** o menu vira gaveta com foco preso, aberta pelo «Menu» da faixa do topo; a ajuda sobe para essa faixa.
- **Ritmo:** 12px entre elementos de um grupo (`gap`), 20px entre seções (`secao`) e dentro do cartão. Cartões de resumo (KPI) em grade `auto-fit` de 180px; no telefone, dois por linha.
- **Tabela → cartões:** a medida é a da **própria tabela** (`container query`), não a da janela. Abaixo de **720px de tabela** cada linha vira cartão: identificação no alto, situação e valor logo abaixo, a ação no pé, e o nome de cada coluna escrito na célula. A tabela curta de resumo (`cartoes="estreita"`) só vira cartão abaixo de **440px**; Cobranças tem o cartão próprio abaixo de 860px. A ordenação do cartão é **um** seletor «Ordenar por» com coluna e direção.
- **Celular:** nenhuma tela rola para o lado; todo controle tem 44px de altura e o campo usa 16px de letra (o Safari não dá zoom). Em qualquer largura nenhum alvo tem menos de 24px.
- **Ordem da página:** título e frase de apoio, o ato da tela no canto do título («Novo …» dos cadastros), avisos do que falta, ferramentas (busca, filtros, contagem «N de M»), a lista. Listar antes de criar.

## Elevation & Depth

O sistema é plano. A profundidade é de **superfície e linha**: o creme é a página, o branco sobe dela, o creme aprofundado recua (cabeçalho, linha aberta), e cada camada tem contorno de 1px. Cartão, KPI, tabela, aviso, filtro e botão não têm sombra. A sombra existe para o que **flutua de verdade** — o painel de um menu aberto, a gaveta da conta, o balão da ajuda —, e puxa o navy, nunca o preto.

### Shadow Vocabulary
- **Degrau 3 — flutuante** (`box-shadow: 0 2px 4px var(--sombra), 0 16px 32px -12px var(--sombra-forte)`): menu aberto, painel de setor, gaveta.
- Os degraus 1 e 2 continuam como token e não são usados por superfície fixa desde 30/09.

### Named Rules
**The Flat-By-Default Rule.** Nada que está parado no fluxo da página tem sombra. Se parece precisar, falta uma borda ou uma superfície, não uma sombra.

## Shapes

Canto reto em tudo: `--raio`, `--raio-cartao` e `--raio-pequeno` valem 0 e continuam existindo como token, para a regra ser de um lugar só. A única forma redonda é a que é redonda por natureza — as duas bolhas do balão da ajuda (`bolha`, 999px). Bordas de 1px; a borda forte só no tracejado da área de envio e no campo sob o mouse. Sem filete lateral colorido em aviso, cartão ou item de lista: o estado é dito por fundo tingido, contorno de 1px da mesma matiz e o ícone próprio.

## Components

### Buttons
- **Shape:** canto reto (0), condensada 15px peso 600, ícone Phosphor à esquerda a 15px.
- **Primary (`primario`):** laranja com tinta navy, rótulo em caixa alta (tracking 0,06em). É o ato da área, e o rótulo diz o ato com a quantidade: «Gerar 6 cobranças», «Emitir 5 cobranças», «Registrar 5 contas conferidas».
- **Comum:** branco com contorno `borda` e tinta navy; no hover a borda vira navy.
- **Discreto:** sem contorno, tinta fraca, 14px — «2ª via», «conferir antes», «ver detalhe técnico».
- **Perigo:** contorno e tinta de erro; no hover, preenchido. Só para o que APAGA ou CANCELA sem volta por um clique — excluir, cancelar a cobrança, encerrar o contrato, descartar a conta em edição. O que se desfaz depois («Suspender o contrato», «Desligar o acesso», que se religa com tudo como estava) é o tom `aviso` da pergunta, nunca o perigo. No menu «⋯» da linha, o item que cancela leva a tinta de perigo («Encerrar», «Cancelar esta cobrança…»); o botão de linha que só abre a pergunta fica comum, e a pergunta é que é de perigo.
- **Desabilitado:** token e não opacidade — `recuo` com tinta fraca.
- **Foco:** anel de 2px no `foco`, afastado 2px.

### Selos de estado (`Marca`)
- **Style:** preenchido suave, canto reto, rótulo condensado em caixa alta a 12px, ícone a 12px. Três sinais juntos — cor, desenho, palavra.
- **Os cinco tons (`TomDoSelo`):** `ok` (verde, o visto — fechou), `erro` (vermelho, o X — só falha), `a_fazer` (âmbar, o lápis — tarefa), `nao_medido` (âmbar, a interrogação — não se sabe), `neutro` (recuo, o traço — nada a fazer agora, inclusive o que está em curso).
- **O desenho é o do significado, quando o do tom mentiria:** a emitida leva o avião, a cancelada o círculo cortado (a lixeira é o desenho do BOTÃO de apagar, e num selo lia como ação), a conta a pagar em aberto a mão com moedas (o lápis é da lacuna de cadastro). O lápis, a interrogação e o visto só aparecem no próprio tom — a suíte prende.
- **O selo vem de `tom-do-estado.ts`**, nunca da tela: `<Marca selo={SELO_DA_COBRANCA[status]}>`.
- **A linha de baixo** (a nota sob o selo em Cobranças, o risco no funil) pinta com o mesmo tom, pela classe `.tinta-do-tom`.
- **No cartão** o selo quebra linha com 8px dos dois lados e o ícone na altura da primeira linha.

### Cards / Containers
- **Cartão (`.cartao`):** branco sobre o creme, 1px de `borda`, canto reto, 20px de respiro, sem sombra.
- **KPI (`Kpi`):** o mesmo cartão com o rótulo caixa-alta e o ícone de 14px no alto e o número grande embaixo; a cor do número só muda para `ok`/`erro`/`alerta` quando o número É o estado (vencido em vermelho, recebido em verde).
- **Recolhido (`Recolhido`):** `<details>` nativo com título e o resumo de uma linha sempre à vista — o que se confere de vez em quando.

### Inputs / Fields
- **Campo (`Campo`):** rótulo em Barlow 13,5px na tinta fraca, ligado ao controle por `htmlFor`; o campo afunda um tom (`campo`), 1px de borda, canto reto. O teclado do celular sai do rótulo (decimal, numérico, e-mail, telefone).
- **Foco:** 2px cheios no `foco`, rente à borda.
- **Erro:** `aria-invalid`, a frase logo abaixo em `erro`, ligada por `aria-describedby`. O decimal digitado aceita vírgula ou ponto, mostra com vírgula e recusa o ambíguo com uma frase que diz as duas leituras.
- **Escolha / Data:** o seletor com a seta Phosphor; o campo de data com o calendário dentro, e, quando vazio quer dizer algo («Todos os meses»), a frase no lugar da máscara.

### Tabela (`Tabela`)
- Sem linha vertical; divisória horizontal `borda-suave`; cabeçalho no `recuo` com rótulo caixa-alta. Coluna ordenável com a seta no cabeçalho (`ThOrd`, `aria-sort`).
- Linha com controle alinha pelo meio; linha só de texto, pelo topo.
- Vira lista de cartões pela largura da própria tabela (ver Layout), com o seletor «Ordenar por» no lugar do cabeçalho.

### Avisos (`Aviso`, `RetornoDoAto`)
- **Style:** fundo tingido do estado, contorno de 1px da mesma matiz, ícone na cor do estado e o **texto em navy** (parágrafo em vermelho é mais difícil de ler que o erro).
- **Fala:** erro é `role="alert"`; ok e alerta são `role="status"`. O retorno de um ato que deu certo entra numa região viva que já existia antes do texto (`RetornoDoAto`).

### Navigation — o menu lateral (`MenuLateral`)
- **Style:** faixa navy de 248px, itens em condensada com ícone Phosphor na `topo-fraco`; o ativo ganha o lastro laranja translúcido e a tinta laranja. O seletor de setor (Rateio | Empresa | Administração) no alto, a conta da pessoa no pé.
- **A ordem é a do trabalho:** Mês; os cadastros na ordem em que um depende do outro (Donos de usina → Usinas → Clientes → Unidades consumidoras → Contratos); os passos do mês com o número de cada um (Contas de luz `1–2`, Cobranças `3–4`); Relatórios. No setor Empresa: Contas a receber, Contas a pagar (`5`), Conector Sicoob, Histórico.
- **Recolhe** para 64px nas telas de desenho; **vira gaveta** abaixo de 900px.

### Página (`Pagina`) e o painel de criar (`PainelDeCriar`)
- `Pagina` põe o título, a frase de apoio e o ato da tela no canto do título. Nos cadastros o ato é «Novo …» (botão comum) e abre o `PainelDeCriar` acima da lista — não uma gaveta: cadastrar se faz vendo a lista. Esc e «Cancelar» fecham, e o foco volta ao «Novo …».

### Revisão em série (`RevisaoEmSerie`) e pergunta na tela (`PerguntaNaTela`)
- **Revisão em série:** a casca comum de «Gerar N cobranças», «Emitir N cobranças» e «Pedir os N boletos» — antes, a lista do que vai acontecer e a soma ao lado do «Sim»; durante, o placar linha a linha; depois, o resultado e o próximo passo.
- **Pergunta na tela:** o lugar do `confirm()`/`prompt()` nativos, na própria linha ou em bloco, com quatro tons (`perigo`, `aviso`, `comum`, `decisao`); o «sim» só fica laranja no tom `comum`/`decisao`, e trava até o campo obrigatório ter texto.

### O funil do mês (`roteiro-corpo.tsx`)
- Os cinco passos lado a lado com o número em quadro, a contagem do que falta em número grande e o «de N» embaixo; UM passo ganha o realce laranja, e a palavra em cima diz por quê: «Mais urgente agora» quando é o risco (a recusa do banco, a vencida), «Próximo passo» quando é só o trabalho mais perto do dinheiro. (Era «Comece aqui» nos dois casos, e lia como ordem.) O risco sai na tinta do tom dele — a recusa e a vencida em vermelho, com o octógono; o boleto só parado, em âmbar. No celular, um passo por linha.

### As abas de Contas de luz (`Abas`, em `fatura-unificada.tsx`)
- **Sem número:** «Leitura e cálculo», «Folha do cliente», «Dados de quem cobra». A tela já numera os passos do mês (1 e 2), e uma segunda numeração nas abas não casava com a primeira. A terceira guarda quem cobra — razão social, CNPJ, contato, logo, chave Pix, modelo e campos da folha —, e por isso não se chama mais «Cadastro da fatura».
- **A ativa** é a tinta forte com o sublinhado de 2px na mesma tinta; a inativa, a tinta apagada com a borda reservada. No celular, as três numa fileira, a ativa contornada na tinta forte.

### A folha impressa (`Folha`, em `fatura-unificada.tsx`)
- O documento do cliente: duas páginas de **altura fixa**, com degraus de compactação (`aperto-*`) em vez de corte. É a ilha onde a referência vale letra por letra.

## Do's and Don'ts

### Vocabulário — um nome só para cada coisa
- **conta de luz** é o que entra, da distribuidora; **cobrança** é o que a G3 cobra do cliente (a tabela `fatura` no banco); **boleto** é o título dela no banco; **pagamento** (a baixa) é o que o cliente pagou.
- **Fatura unificada** é SÓ o nome da folha impressa que o cliente recebe. «Fatura» em qualquer outro sentido na tela é defeito.
- **Quem trouxe o cliente** é a pessoa da comissão — nunca «originador», «quem traz clientes» ou «quem indicou». O cadastro dessas pessoas é o «Cadastro de quem trouxe o cliente».
- O botão diz o que faz: «Descartar e começar outra conta» (era «Nova fatura», que não criava fatura nenhuma).
- O nome de código não muda (regra 7 do `CLAUDE.md`): `fatura`, `originador_id`. Só o texto. As exceções da varredura (`vocabulario-das-telas.ts`, T9 e T10) estão declaradas lá, com o motivo de cada uma.
- Os números de uma frase dizem a MESMA população em todo lugar, ou dizem qual contam: «Endereço do pagador (4 unidades)» no Mês, «4 das 35 com contrato ativo» em Unidades e o recorte com as 4.

### Do:
- **Do** usar os tokens de `tema.ts` (`var(--…)`) para toda cor, e medir o contraste do par novo nos dois temas antes de criar um token.
- **Do** deixar UM laranja por contexto; o segundo ato é o botão comum.
- **Do** usar o tom `a_fazer` (âmbar, lápis) para o que falta preencher e guardar `erro` para a falha.
- **Do** formatar por `formato.ts` e `dinheiro.ts`: `diaEmBr`, `mesEmBr`, `mesPorExtenso`, `emReais`, `decimalParaCampo`/`campoParaDecimal`. Nada de `toLocaleDateString` ou `toFixed` espalhado.
- **Do** manter o dinheiro em centavos inteiros e o decimal (percentual, kWh, tarifa) como texto, do banco à tela (regra 1).
- **Do** escrever o nome do botão e do link letra por letra igual ao rótulo da tela a que ele leva («Abrir Cobranças» leva a «Cobranças»; RM12/RM13 em `web/tests/roteiro-do-mes.ts`).
- **Do** listar antes de criar: a lista é a tela, o «Novo …» fica no canto do título.
- **Do** pôr o jargão (código de questão, nome de coluna, comando) atrás de `DetalheTecnico`.

### Don't:
- **Don't** arredondar canto nem pôr sombra em superfície parada.
- **Don't** usar o laranja `#E8843C` como texto ou o branco sobre ele (2,69:1); a tinta do primário é o navy.
- **Don't** pintar lacuna de cadastro de vermelho.
- **Don't** mexer na folha impressa (`Folha`, classes `g3-*` e `aperto-*`, suítes `tests/folha-g3.ts`, `tests/folha-unificada.ts`, `tests/layout-do-documento.ts`): altura fixa, aparência intocável.
- **Don't** mostrar data em ISO (`2026-09-05`) na tela, nem hora em UTC. (O CSV exportado usa ISO de propósito.)
- **Don't** usar ícone fora do Phosphor nem pedir o desenho pelo nome dele: a tela pede o nome semântico de `iconografia.ts`.
- **Don't** abrir `confirm()`, `prompt()` ou modal para pergunta que cabe na própria tela.
- **Don't** usar o cinza G3 `#8F939D` como tinta (3,08:1).
