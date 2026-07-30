// O TEMA. Cores, espaçamento e tipografia, num lugar só.
//
// A PALETA DE MARCA VEIO DA G3 EM 28/07/2026 e substitui a provisória que estava
// aqui — o cinza neutro com azul de acento que eu havia escolhido para as telas
// serem legíveis antes de existir identidade. Os valores de marca abaixo estão
// marcados `[G3]` e não se alteram por conveniência de implementação.
//
// EM 29/07/2026 O DONO PEDIU DUAS MUDANÇAS DE USO, e nenhuma mexe nos valores
// `[G3]`: (1) o sistema abria escuro para quem tem o sistema operacional escuro,
// e a operação o achou escuro — o TEMA CLARO passa a ser o padrão, com a escolha
// da pessoa persistida (ver `ModoTema` no fim); (2) o laranja da marca ganha mais
// presença — filete de gradiente, navegação ativa, foco, destaques — sempre por
// token novo `[derivado]`, cada um com o contraste medido.
//
// EM 30/07/2026 O DONO PEDIU O ACABAMENTO, e o pedido foi explícito: sair do
// visual "genérico e datado" de tabela e input nativos, para bordas finas de
// contraste baixo, profundidade por sombra e tipografia moderna. O que isso
// mudou aqui, e SÓ isso:
//
//   1. TIPOGRAFIA — a `Inter` entra como primeira da pilha, SERVIDA POR NÓS
//      (`web/public/fontes/`), não por CDN. Ver `FONTE_CSS` e a nota que a
//      acompanha: o argumento antigo contra webfont era o PISCA, e ele continua
//      válido — o que o resolve é `font-display: swap` com a pilha de sistema
//      logo atrás, não abrir mão da fonte.
//   2. TRÊS SUPERFÍCIES em vez de duas. O `--bg-soft #F2F1EC` da G3, que estava
//      registrado aqui como "sobrou", ganhou o papel que faltava: cabeçalho de
//      tabela e barra de ferramentas. Não é cor nova — é a cor entregue que
//      passou a ser usada.
//   3. PÍLULA DE ESTADO PREENCHIDA, e isto é REVERSÃO de uma decisão minha —
//      está anotado na nota de adjacência no fim deste cabeçalho, porque
//      reverter em silêncio é o que faz um projeto perder o porquê.
//   4. ESCALA DE SOMBRA E DE RAIO em token, para "profundidade sutil" ser um
//      valor com nome e não um `box-shadow` escrito à mão em cada lugar.
//
// MAS NEM TUDO AQUI É DA G3, e a distinção importa mais do que parece. A paleta
// entregue cobre marca, superfícies, texto e linhas — **não cobre os três
// estados semânticos nem o tema escuro**. O que está marcado `[derivado]` fui eu
// que escolhi, continua sendo escolha de quem escreveu o código, e é o que a G3
// precisa olhar quando vir isto numa tela.
//
// O QUE A PALETA PRECISA PRESERVAR, e não é gosto:
//
//   1. CONTRASTE. `--texto` sobre `--fundo` e sobre `--fundo2` em pelo menos
//      4.5:1 (WCAG AA). Operação lê isto o dia inteiro. Medido em 28/07: 18.21:1
//      e 19.04:1. Todo par desta paleta foi medido, e os que reprovaram estão
//      anotados onde reprovaram. **DESDE 30/07 ISSO É TESTE, NÃO COMENTÁRIO:**
//      `web/tests/tema.ts` recalcula todos os pares e falha quando um reprova —
//      regra 8. Foi o teste que escolheu os valores novos, não o olho.
//   2. OS TRÊS ESTADOS DA PRONTIDÃO são semânticos e não decorativos:
//      `ok` (verde), `pendente` (vermelho) e `nao_medido` (âmbar). O terceiro
//      existe porque "zero sobre universo vazio" NÃO é pronto — pintá-lo de
//      verde faria a tela autorizar o que não conferiu, que foi um defeito real
//      achado em 28/07. Se a marca não tiver um âmbar, ele precisa de outra
//      forma de se distinguir do verde — nunca de virar verde.
//   3. COR NÃO PODE SER O ÚNICO SINAL. Hoje cada marca carrega o texto do estado
//      junto ("OK", "Pendente", "Não medido"). Mantenha, ou daltônico perde a
//      informação inteira. **Em 30/07 ganhou um segundo sinal, não um
//      substituto:** cada pílula leva também um ícone próprio — verde com
//      `check`, vermelho com `x`, âmbar com `question`. Forma, cor E texto.
//   4. OS DOIS TEMAS. As duas metades são mantidas juntas — um tema que só
//      funciona claro é meio tema. O que mudou em 29/07 foi só QUEM decide:
//      antes era `prefers-color-scheme` sozinho; agora é a escolha da pessoa
//      (padrão claro), e "Sistema" continua disponível para quem preferir.
//
// UMA ADJACÊNCIA QUE A G3 PRECISA VER NA TELA. A identidade é laranja e o âmbar
// do `nao_medido` é laranja: eles são vizinhos por natureza, e nenhuma escolha de
// matiz separa os dois de todo. A restrição 2 exige separação do VERDE, e essa
// está cumprida com folga.
//
// COMO A SEPARAÇÃO DO ACENTO É FEITA MUDOU EM 30/07, e o registro fica. Até 29/07
// ela vinha de "estado é pílula CONTORNADA, acento é preenchido"; o dono pediu
// pílula preenchida suave, e a separação passou a ser outra — o acento é
// preenchido **sólido** (botão primário, filete, navegação ativa) e o estado é
// preenchido **suave, com ícone e texto dentro**. Os dois nunca aparecem com o
// mesmo peso, e nenhum estado usa o laranja da marca. Se em uso real ainda ficar
// confuso, o conserto continua sendo de forma — nunca virar verde.

export type Paleta = {
  fundo: string; fundo2: string; texto: string; fraco: string; borda: string;
  /** [G3, ativado em 30/07] A TERCEIRA SUPERFÍCIE — `--bg-soft #F2F1EC`. Ela
   *  existia na paleta entregue e este arquivo registrava que tinha sobrado
   *  ("este layout tem dois níveis de superfície, não três"). O acabamento de
   *  30/07 é exatamente o que pede o terceiro nível: cabeçalho de tabela e barra
   *  de ferramentas recuam do cartão branco em vez de se separarem dele por
   *  linha. Medido: `--texto` 16.84:1, `--fraco` 5.75:1, `--acento-forte` 5.31:1. */
  fundoRecuo: string;
  /** [derivado, 30/07] A linha da tabela sob o mouse. Existe separada do
   *  `--fundo-recuo` por um motivo medido: o anel de foco (`--foco`) sobre o
   *  recuo dá 3.03:1 e passa por um fio os 3:1 da WCAG 1.4.11, e é dentro da
   *  linha que moram os inputs que recebem foco. Sobre este, 3.17:1. */
  fundoHover: string;
  /** [derivado, 30/07] A divisória INTERNA — entre duas linhas de tabela. O
   *  pedido foi "bordas muito finas, de contraste muito baixo"; `--borda` (1.26:1
   *  contra o branco) delimita o contêiner, e esta (1.16:1) separa conteúdo
   *  dentro dele. As duas são não-texto e não carregam informação sozinhas: quem
   *  lê a tabela lê o dado, não a linha. */
  bordaSuave: string;
  acento: string;
  /** O texto SOBRE o acento. Separado de propósito: se a marca trouxer um acento
   *  claro, texto branco em cima dele fica ilegível — e um `#fff` cravado no CSS
   *  seria justamente o valor que ninguém lembra de trocar junto.
   *
   *  FOI EXATAMENTE O QUE ACONTECEU. Branco sobre o `#F39200` da G3 dá **2.35:1**
   *  e reprova; a tinta escura da própria marca dá **8.09:1**. O token existia
   *  para este dia. */
  acentoTexto: string;
  /** O acento QUANDO ELE É O TEXTO, e não o fundo. Medido em 28/07 e REMEDIDO em
   *  29/07, quando o `--acento-suave` e o fundo creme entraram:
   *
   *    `#F39200` sobre branco          2.35:1  reprova
   *    `#A56300` sobre branco          4.79:1  passava — mas sobre o
   *    `#A56300` sobre `#FDEEDA`       4.20:1  fundo suave novo REPROVA
   *    `#A34E00` sobre branco          5.76:1  passa
   *    `#A34E00` sobre `#FFFBF5`       5.59:1  passa
   *    `#A34E00` sobre `#FDEEDA`       5.05:1  passa   <- este
   *
   *  `#A34E00` veio da pesquisa de 29/07 (é o degrau que Cloudflare e HubSpot
   *  usam para "o laranja da marca quando vira texto"): mais escuro que a marca
   *  o bastante para AA, e na MESMA matiz — o olho lê como a mesma cor, em vez
   *  do marrom que um escurecimento por brilho puro produziria. */
  acentoForte: string;
  /** [derivado, 29/07] O acento no HOVER do botão primário. A regra veio da
   *  pesquisa (HubSpot #FF4800→#C93700, Cloudflare idem): estado de botão
   *  laranja ESCURECE, nunca clareia — clarear derruba o contraste do texto e
   *  "apaga" o botão. `--acento-texto` sobre ele: 6.25:1. */
  acentoHover: string;
  /** [derivado, 29/07] O acento COMO SUPERFÍCIE DE DESTAQUE: navegação ativa,
   *  linha selecionada, cartão em evidência. É o que dá presença ao laranja sem
   *  gritar — medido: `--texto` sobre ele 16.70:1, `--acento-forte` 5.26:1, e as
   *  três pílulas de estado passam por cima (4.99, 5.77 e 4.76). */
  acentoSuave: string;
  /** [derivado, 29/07] Anel de foco de teclado. Não-texto exige 3:1 contra o
   *  fundo adjacente (WCAG 1.4.11): `#D97A00` dava 2.98:1 sobre `--fundo` e
   *  reprovava por um fio; `#CE7400` dá 3.43:1 no branco e 3.28:1 no off-white. */
  foco: string;
  /** [derivado, 29/07] A cor da sombra dos cartões. Vive aqui porque `ui.tsx`
   *  não tem cor literal — nem em rgba. */
  sombra: string;
  /** [derivado, 30/07] A sombra do que FLUTUA ACIMA da página: menu suspenso,
   *  popover. Mais opaca que a dos cartões de propósito — a hierarquia de
   *  profundidade é o que diz "isto está sobre tudo e fecha ao clicar fora". */
  sombraForte: string;
  /** [derivado, 30/07] A COR DA LUZ que atravessa o botão primário no hover.
   *  Ela precisa de token próprio porque é a única cor do sistema que não é nem
   *  tinta nem superfície: é um véu por cima do acento. Tentei usar `--fundo2` e
   *  o resultado expõe o problema — no tema escuro o `--fundo2` é escuro, e a
   *  faixa de luz virava uma faixa de SOMBRA passando pelo botão laranja.
   *  Branco translúcido nos dois temas, com alfa menor no escuro, onde o mesmo
   *  branco pesa mais. Não entra em nenhum par de contraste: não há texto sobre
   *  ela, e ela dura 700 ms. */
  brilho: string;
  /** [G3] O filete de marca: `--brand-orange` → `--brand-orange-soft`. A própria
   *  paleta reserva o soft para gradiente, e é o único lugar onde ele aparece no
   *  tema claro. Ninguém escreve texto sobre o filete — ele tem 3px. */
  gradiente: string;
  erro: string; erroFundo: string;
  ok: string;
  /** [derivado, 30/07] O fundo da pílula `ok`. Os outros dois estados já tinham
   *  o par (`erroFundo`, `alertaFundo`) porque serviam de fundo de aviso; o
   *  verde não tinha, porque não existe "aviso verde". Com a pílula preenchida
   *  ele passou a ser necessário. Medido: `--ok` sobre ele 5.40:1. */
  okFundo: string;
  alerta: string; alertaFundo: string;
};

/**
 * TEMA CLARO. As superfícies, o texto e as linhas são da G3, sem alteração.
 *
 * A inversão em relação à paleta antiga é intencional e é o que a marca pede:
 * antes a página era branca e o cartão era cinza; agora a página é o off-white
 * `--bg` e o cartão é o branco puro `--bg-card`. É o desenho entregue.
 *
 * Desde 30/07 o terceiro nível `--bg-soft #F2F1EC` também é usado, e a nota que
 * dizia que ele havia sobrado saiu daqui para o tipo `fundoRecuo`.
 */
export const CLARO: Paleta = {
  fundo: '#FAFAF7',        // [G3] --bg
  fundo2: '#FFFFFF',       // [G3] --bg-card
  fundoRecuo: '#F2F1EC',   // [G3] --bg-soft   · 16.84:1, 5.75:1 e 5.31:1
  fundoHover: '#F7F6F2',   // [derivado] entre --bg e --bg-soft · --foco sobre ele 3.17:1
  texto: '#0E1014',        // [G3] --ink        · 18.21:1 e 19.04:1
  fraco: '#5A5E66',        // [G3] --ink-3      · 6.22:1 e 6.51:1
  borda: '#E6E5DF',        // [G3] --line
  bordaSuave: '#EFEEEA',   // [derivado] a divisória interna · 1.16:1 contra o branco
  acento: '#F39200',       // [G3] --brand-orange
  acentoTexto: '#0E1014',  // [G3] --ink sobre o acento · 8.09:1 (branco daria 2.35:1)
  acentoForte: '#8F5600',  // [derivado] ver o porquê do degrau extra no tipo · 6.00:1, 5.74:1 e 5.26:1
  acentoHover: '#DC7C00',  // [derivado] a marca escurecida · --acento-texto sobre ele 6.28:1
  acentoSuave: '#FDEEDA',  // [derivado] o laranja como superfície de destaque
  foco: '#CE7400',         // [derivado] 3.43:1 e 3.28:1 — não-texto pede 3:1
  sombra: 'rgba(14, 16, 20, 0.06)',
  sombraForte: 'rgba(14, 16, 20, 0.14)',
  brilho: 'rgba(255, 255, 255, 0.55)',
  gradiente: 'linear-gradient(90deg, #F39200, #FFA827)', // [G3] orange → orange-soft
  // [derivado] A G3 não entregou os três estados semânticos. Verificados contra
  // as superfícies NOVAS, inclusive sobre o --acento-suave.
  erro: '#B42318',         // 6.29:1 e 6.05:1 sobre o próprio fundo de aviso · 5.77:1 sobre o suave
  erroFundo: '#FEF3F2',
  ok: '#067647',           // 5.44:1 e 5.69:1 · 4.99:1 sobre o suave
  okFundo: '#ECFDF3',      // [derivado, 30/07] · --ok sobre ele 5.40:1
  alerta: '#B54708',       // 5.19:1 e 5.20:1 sobre o próprio fundo de aviso · 4.76:1 sobre o suave
  alertaFundo: '#FFFAEB',
};

/**
 * TEMA ESCURO — [derivado] quase inteiro, e é a metade que a G3 ainda não viu.
 * Desde 29/07 ele não é mais o que abre sozinho em máquina com SO escuro — é
 * escolha da pessoa (ou "Sistema", para quem preferir que o SO decida).
 *
 * A única âncora entregue é o `--ink #0E1014`, que a paleta descreve como fundo
 * do aside escuro com texto `#fff`: é a prova de que a marca já admite a própria
 * tinta como superfície, e é dela que este tema parte. O resto — o segundo nível
 * de superfície, a borda e os estados — é escolha minha.
 *
 * O acento troca para `--brand-orange-soft #FFA827` aqui, e não é liberdade: o
 * laranja padrão sobre fundo escuro fica pesado, e a própria paleta reserva o
 * soft para gradiente/sunburst, que é uso sobre escuro. 9.87:1 sobre o `--ink`.
 *
 * OS DOIS TOKENS DE SUPERFÍCIE NOVOS invertem de direção aqui, e isso é resposta
 * e não descuido: no claro o recuo ESCURECE em relação ao cartão e o hover
 * clareia; no escuro o recuo escurece igual (fica entre a página e o cartão) e o
 * hover CLAREIA acima do cartão. O papel é o mesmo — recuar e destacar —, e no
 * escuro destacar é clarear.
 */
export const ESCURO: Paleta = {
  fundo: '#0E1014',        // [G3] --ink, usado como superfície
  fundo2: '#191C21',       // [derivado] segundo nível
  fundoRecuo: '#12151A',   // [derivado, 30/07] · texto 18.29:1, fraco 5.56:1, acento 9.48:1
  fundoHover: '#1E222A',   // [derivado, 30/07] · texto 15.94:1, fraco 4.84:1, acento 8.26:1
  texto: '#FFFFFF',        // [G3] o texto do aside escuro · 19.04:1 e 17.08:1
  fraco: '#8A8E94',        // [G3] --ink-4 · 5.78:1 e 5.19:1
  borda: '#2A2D33',        // [G3] --ink-2, usado como linha
  bordaSuave: '#22262C',   // [derivado, 30/07] · 1.12:1 contra o cartão
  acento: '#FFA827',       // [G3] --brand-orange-soft · 9.87:1
  acentoTexto: '#0E1014',  // [G3] --ink sobre o acento · 9.87:1
  // No escuro o acento NÃO precisa escurecer para virar texto — precisa
  // continuar claro. O token é o mesmo valor, e isso é resposta, não descuido.
  acentoForte: '#FFA827',  // 9.87:1 e 8.85:1
  // O hover ESCURECE aqui tambem: do soft para o laranja-base da marca.
  // --acento-texto sobre ele: 8.09:1.
  acentoHover: '#F39200',
  acentoSuave: '#2E2113',  // [derivado, 29/07] texto 15.64:1, acento 8.10:1, fraco 4.75:1
  foco: '#FFA827',         // [derivado, 29/07] 9.87:1 — folga sobre os 3:1 pedidos
  sombra: 'rgba(0, 0, 0, 0.45)',
  sombraForte: 'rgba(0, 0, 0, 0.65)',
  brilho: 'rgba(255, 255, 255, 0.30)',
  gradiente: 'linear-gradient(90deg, #F39200, #FFA827)', // [G3] o mesmo filete
  // [derivado] Os três estados. O âmbar puxa para amarelo aqui de propósito,
  // para afastar do laranja do acento — ver a nota de adjacência no cabeçalho.
  erro: '#FF6B6B',         // 6.86:1 e 6.16:1 · 6.25:1 sobre o fundo de aviso
  erroFundo: '#2A1416',
  ok: '#4ADE80',           // 10.93:1 e 9.80:1
  okFundo: '#12261A',      // [derivado, 30/07] · --ok sobre ele 9.14:1
  alerta: '#FFD75E',       // 13.72:1 e 11.42:1 sobre o fundo de aviso
  alertaFundo: '#2A2113',
};

/**
 * A FONTE, SERVIDA POR NÓS.
 *
 * O dono pediu `Inter` ou `Poppins` em 30/07. Entrou a **Inter**, e a escolha é
 * de uso e não de gosto: ela foi desenhada para interface densa — altura de x
 * grande, `1`/`l`/`I` distinguíveis e algarismo tabular de verdade, que é o que
 * uma coluna de dinheiro precisa. Poppins é geométrica e de caixa alta larga:
 * bonita em título, cansativa em tabela de 39 linhas.
 *
 * O ARGUMENTO ANTIGO DESTE ARQUIVO CONTRA WEBFONT CONTINUA VÁLIDO, e é por isso
 * que ele não foi apagado: *"uma tela de operação que trava esperando webfont é
 * uma tela que pisca em toda navegação"*. O que o resolve são três coisas
 * juntas, e nenhuma delas é abrir mão da fonte:
 *
 *   1. **Servida pela nossa origem**, de `web/public/fontes/`. Sem CDN de
 *      terceiro: uma origem só (o mesmo argumento do proxy do Vite), sem DNS
 *      nem TLS extra, e sem mandar o IP de quem opera para fora.
 *   2. **`font-display: swap`** — o texto aparece imediatamente na fonte de
 *      sistema e troca quando a Inter chega. O pisca que o comentário antigo
 *      descrevia é o do `font-display: block`, que esconde o texto esperando.
 *   3. **A pilha de sistema INTEIRA continua atrás.** Se o arquivo não chegar, a
 *      tela é exatamente a de ontem — não é uma tela quebrada.
 *
 * É UM ARQUIVO SÓ, 48 KB: `wght` variável (100–900) no subconjunto latino. Um
 * peso fixo por arquivo custaria três requisições para o mesmo resultado.
 *
 * ITÁLICO NÃO ENTROU, e é decisão medida em uso: `<em>` aparece em quatro
 * lugares no sistema inteiro. Um segundo arquivo de 52 KB para quatro palavras
 * não se paga; o browser inclina a upright, e é o suficiente.
 *
 * O NOME DO ARQUIVO CARREGA A VERSÃO (`v5.3.0`) de propósito. O `servirEstatico`
 * manda `immutable, max-age=31536000` para tudo que não é o `index.html`, e o
 * `public/` do Vite **não** recebe hash no nome — sem a versão no nome, trocar a
 * fonte deixaria um ano de browsers com a antiga. A licença (OFL 1.1) viaja ao
 * lado, em `LICENSE-inter.txt`, porque a OFL exige que ela acompanhe o arquivo.
 */
export const FONTE_CSS = `
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url('/fontes/inter-var-latin-v5.3.0.woff2') format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
      U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
      U+2212, U+2215, U+FEFF, U+FFFD;
  }
`;

/**
 * Tipografia e ritmo.
 *
 * A pilha de sistema segue logo depois da Inter, e não é decoração: é o que
 * torna a webfont uma melhoria em vez de uma dependência. Ver `FONTE_CSS`.
 */
export const TIPOGRAFIA = {
  familia: "'Inter', ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  /** [30/07] Monoespaçada com nome. `<code>` carrega linha digitável, BR Code e
   *  `credencial_ref` — coisas que se conferem dígito a dígito —, e até aqui ela
   *  era o default do browser, que muda de máquina para máquina. */
  familiaMono: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace",
  base: '15px',
  linha: '1.5',
  /** Tabular para número: coluna de dinheiro desalinhada é difícil de conferir,
   *  e conferir é o que a operação faz aqui. */
  numero: 'tabular-nums',
  /** [30/07] O ajuste que a Inter pede em corpo de texto: ela é desenhada com
   *  tracking neutro para tamanho grande, e em 15px fica larga. -0.011em é o
   *  valor que o próprio projeto da fonte recomenda para tamanho de interface. */
  tracking: '-0.011em',
};

export const RITMO = {
  raio: '8px',
  raioCartao: '12px',
  /** [30/07] Para o que é pequeno e clicável: botão de ícone, pílula, chip. */
  raioPequeno: '6px',
  raioPilula: '999px',
  gap: '12px',
  larguraMaxima: '1160px',
};

/**
 * A ESCALA DE PROFUNDIDADE, em três degraus e com nome.
 *
 * O pedido de 30/07 foi "sombras sutis e difusas para elevar cartões, menus e
 * contêineres, criando profundidade sem poluição". Três degraus bastam, e ter
 * nome é o que impede o quarto de aparecer:
 *
 *   1  o que está APOIADO na página — barra, cartão, tabela
 *   2  o que está EM DESTAQUE — cartão sob o mouse, botão primário
 *   3  o que FLUTUA — menu suspenso, popover
 *
 * Cada degrau é duas camadas: um contato curto (1px) que desenha a aresta, e um
 * halo largo e deslocado que dá o volume. Uma sombra só, larga, borra a aresta;
 * uma sombra só, curta, parece borda dupla.
 */
export const SOMBRAS = {
  um: '0 1px 2px var(--sombra), 0 1px 3px -1px var(--sombra)',
  dois: '0 1px 2px var(--sombra), 0 8px 20px -8px var(--sombra-forte)',
  tres: '0 2px 4px var(--sombra), 0 16px 32px -12px var(--sombra-forte)',
};

const variaveis = (p: Paleta) => `
    --fundo: ${p.fundo}; --fundo2: ${p.fundo2}; --fundo-recuo: ${p.fundoRecuo};
    --fundo-hover: ${p.fundoHover}; --texto: ${p.texto}; --fraco: ${p.fraco};
    --borda: ${p.borda}; --borda-suave: ${p.bordaSuave};
    --acento: ${p.acento}; --acento-texto: ${p.acentoTexto};
    --acento-forte: ${p.acentoForte}; --acento-hover: ${p.acentoHover}; --acento-suave: ${p.acentoSuave};
    --foco: ${p.foco}; --sombra: ${p.sombra}; --sombra-forte: ${p.sombraForte};
    --brilho: ${p.brilho}; --gradiente: ${p.gradiente};
    --erro: ${p.erro}; --erro-fundo: ${p.erroFundo};
    --ok: ${p.ok}; --ok-fundo: ${p.okFundo};
    --alerta: ${p.alerta}; --alerta-fundo: ${p.alertaFundo};`;

/**
 * As custom properties dos dois temas. `ui.tsx` cola isto no topo do CSS.
 *
 * O SELETOR É `data-tema`, NÃO `prefers-color-scheme` — a media query deixou de
 * decidir sozinha em 29/07. Quem grava o atributo é `aplicarModo` abaixo; sem
 * atributo nenhum (primeiro paint, JS ainda carregando) vale o claro, que é o
 * padrão do sistema desde a mesma decisão.
 */
export const VARIAVEIS_CSS = `
  ${FONTE_CSS}
  :root {${variaveis(CLARO)}
    --raio: ${RITMO.raio}; --raio-cartao: ${RITMO.raioCartao};
    --raio-pequeno: ${RITMO.raioPequeno}; --raio-pilula: ${RITMO.raioPilula};
    --gap: ${RITMO.gap};
    --largura: ${RITMO.larguraMaxima};
    --sombra-1: ${SOMBRAS.um}; --sombra-2: ${SOMBRAS.dois}; --sombra-3: ${SOMBRAS.tres};
    --fonte-mono: ${TIPOGRAFIA.familiaMono};
    color-scheme: light;
  }
  :root[data-tema="escuro"] {${variaveis(ESCURO)}
    color-scheme: dark;
  }
`;

// ------------------------------------------------------------------ o modo
//
// TRÊS MODOS, PADRÃO CLARO. "Sistema" existe porque tirar a opção de quem
// gostava do comportamento antigo seria trocar uma imposição por outra; só o
// padrão mudou de lado. A escolha persiste por browser em localStorage — é
// preferência de apresentação, não dado de negócio, então não vai ao servidor.

export type ModoTema = 'claro' | 'escuro' | 'sistema';

const CHAVE_MODO = 'financeiro.tema';

export function lerModo(): ModoTema {
  const v = localStorage.getItem(CHAVE_MODO);
  return v === 'escuro' || v === 'sistema' ? v : 'claro';
}

/** Grava a escolha e aplica no documento. O único lugar que escreve `data-tema`. */
export function aplicarModo(m: ModoTema): void {
  localStorage.setItem(CHAVE_MODO, m);
  const escuro = m === 'escuro' ||
    (m === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
}

/** Aplica o modo guardado no arranque e segue o SO enquanto o modo for
 *  "sistema". Chamado uma vez, no main. */
export function iniciarTema(): void {
  aplicarModo(lerModo());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (lerModo() === 'sistema') aplicarModo('sistema');
  });
}
