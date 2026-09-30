// O TEMA. Cores, espaçamento e tipografia, num lugar só.
//
// ============================================================================
// EM 06/08/2026 A PALETA TROCOU INTEIRA, a pedido do dono. Navy + Creme, com o
// laranja passando de identidade a AÇÃO.
//
//   Navy    #14213D  (variante #1C2C4E)  dominante: topo, texto principal,
//                                        bordas de destaque
//   Cream   #F6F2EA                      fundo geral e blocos secundários
//   Orange  #E8843C                      ação: botão primário, valores totais,
//                                        navegação ativa
//   Gold    #F4A65A                      realce pontual: foco de input
//   Gray    #8F939D                      labels, texto secundário, ícones
//   Linhas  #E4DFD4 / #D8D2C6            divisórias sutis
//
// O QUE A TROCA MUDOU DE ESTRUTURA, e não é cosmético: antes a marca era o
// laranja e o resto era neutro; agora **a marca é o Navy** e o laranja ficou
// reservado ao que se CLICA e ao que se PAGA. Isso é uma hierarquia a mais na
// tela — quem opera passa a distinguir "onde estou" (navy) de "o que faço"
// (laranja) por cor, e não só por posição.
//
// TRÊS CORES ENTREGUES NÃO PASSAM ONDE FORAM PEDIDAS, e isso foi MEDIDO antes de
// escrito. As três são pedidas para TEXTO ou para FOCO, e as três reprovam:
//
//   Gray   #8F939D  sobre o creme  2.75:1   (AA de texto pede 4.5)
//   Orange #E8843C  sobre o creme  2.41:1   (idem — o mesmo caso de 28/07)
//   Gold   #F4A65A  sobre o creme  1.80:1   (WCAG 1.4.11 pede 3 para foco)
//
// Nenhuma foi descartada e nenhuma foi "aproximada no olho": cada uma tem um
// token DERIVADO na mesma matiz, achado por busca (o fator mais alto que ainda
// passa em TODAS as superfícies), e o valor entregue continua governando onde
// ele passa — o Orange segue sendo o fundo do botão, o Gold segue sendo o foco
// no tema escuro. Onde a cor entregue vale como está, ela está marcada `[G3]`.
//
// E O NAVY SOBRE O ORANGE DÁ 5.93:1 — o texto do botão primário deixou de ser
// uma tinta neutra e passou a ser a própria cor dominante. É a única das quatro
// combinações de marca que passa AA (branco sobre o Orange daria 2.69:1).
// ============================================================================
//
// A PALETA DE MARCA ANTERIOR VEIO DA G3 EM 28/07/2026 e substituiu a provisória
// que estava aqui — o cinza neutro com azul de acento que eu havia escolhido para
// as telas serem legíveis antes de existir identidade. O histórico abaixo fica
// intacto: ele explica POR QUE cada token existe, e os tokens não mudaram — só os
// valores dentro deles. Onde o texto antigo cita `#F39200` ou `#0E1014`, leia
// "o acento de então" e "a tinta de então".
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
//
// ============================================================================
// EM 30/09/2026 O G3REF DEIXOU DE SER ILHA E VIROU A IDENTIDADE DO SISTEMA.
//
// Decisão do dono, no plano de redesenho por etapas (etapa 0): o desenho da
// Fatura unificada — Barlow e Barlow Semi Condensed, cantos retos, sem sombra,
// rótulo condensado em caixa alta, filete fino — passa a ser o das quatorze
// telas. Até aqui ele morava num bloco `.g3ref` com paleta própria, e o sistema
// falava duas línguas na mesma barra de navegação (Inter, raio 12 e sombra de um
// lado; Barlow, raio zero e borda do outro). O que isto mudou AQUI:
//
//   1. A FONTE. `Inter` saiu; a Barlow é o corpo e o número, a Barlow Semi
//      Condensed é título, aba, rótulo e cabeçalho de tabela. Os bytes são os
//      mesmos que a ilha já servia (ver `FONTE_CSS`).
//   2. O RAIO. Zero, nos três tokens. Os tokens ficam — é por eles que o raio é
//      um valor com nome e não um `0` solto em cada regra.
//   3. A SOMBRA. A escala de três degraus continua, mas as SUPERFÍCIES (cartão,
//      KPI, tabela, filtro, aviso, botão) deixaram de usá-la: profundidade passa
//      a ser borda de 1px e fundo, como na referência. Só o que FLUTUA (menu,
//      painel de ajuda, balão) e a folha A4 na prévia mantêm sombra.
//   4. DOIS TOKENS NOVOS, `campo` e `bordaForte`, que eram da ilha e agora são
//      do sistema — ver cada um no tipo.
//   5. A PALETA DA ILHA (`--g3ref-*`) SAIU INTEIRA. Cada token dela foi mapeado
//      para o equivalente medido daqui, e três deles NÃO voltam, porque
//      reprovavam AA e eram a exceção `Q-DOCG3-15` de 14/08:
//
//        `#8F939D` como tinta apagada   3,08:1 no branco   ->  --fraco, 5,56:1
//        `#E8843C` como TINTA           2,69:1 no branco   ->  --acento-forte, 5,60:1
//        `#fff` sobre o laranja         2,69:1             ->  --acento-texto, 5,93:1
//
//      A decisão de 30/09 foi explícita: contraste AA é inegociável ao espalhar
//      o g3ref. A exceção de 14/08 valia para UMA aba; espalhada, seriam
//      quatorze telas reprovando.
//
// O QUE NÃO MUDOU: nenhum valor de cor da paleta entregue, os dois temas, e a
// folha impressa — que é literal, não lê token nenhum, e ganhou a própria fonte
// cravada no `estilo.ts` para não herdar a mudança do corpo.

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
  /** [30/09, veio da ilha g3ref] A LINHA FORTE — o tracejado da área de envio,
   *  o contorno do campo de parâmetro e a borda do campo sob o mouse. Na ilha ela
   *  era `--g3ref-borda-forte #C9C1B1`; subiu ao `:root` porque o hover de campo
   *  é do sistema inteiro. Não-texto e não é o único sinal de nada (o campo tem
   *  rótulo, a área de envio tem título): 1.79:1 contra o branco. */
  bordaForte: string;
  /** [30/09, veio da ilha g3ref] O FUNDO DO CAMPO. A referência não pinta o
   *  input de branco sobre o cartão branco: ela o afunda um tom, para o campo se
   *  anunciar pela superfície e não só pela linha. Era `--g3ref-campo #FBF9F5`.
   *  Medido: `--texto` 15.19:1, `--fraco` 5.29:1, `--foco` 3.56:1 — é uma das
   *  superfícies da T1 desde a entrada. */
  campo: string;
  acento: string;
  /** O texto SOBRE o acento. Separado de propósito: se a marca trouxer um acento
   *  claro, texto branco em cima dele fica ilegível — e um `#fff` cravado no CSS
   *  seria justamente o valor que ninguém lembra de trocar junto.
   *
   *  FOI EXATAMENTE O QUE ACONTECEU, DUAS VEZES. Em 28/07, branco sobre o
   *  `#F39200` de então dava **2.35:1**; em 06/08, branco sobre o Orange
   *  `#E8843C` dá **2.69:1** — reprova de novo, e pela mesma razão. O que passa
   *  é a tinta dominante da própria marca: **Navy sobre Orange, 5.93:1**. O
   *  token existia para os dois dias. */
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
   *  do marrom que um escurecimento por brilho puro produziria.
   *
   *  EM 06/08 O DEGRAU FOI REFEITO PELO MESMO CRITÉRIO, com a paleta nova, e
   *  desta vez por BUSCA em vez de por referência: o Orange `#E8843C` escalado
   *  nos três canais (que é o que preserva a matiz) até o fator mais alto que
   *  ainda passa 4.5:1 nas cinco superfícies — **`#995728`, fator 0.66, pior par
   *  4.55:1**. O Orange puro sobre o creme daria 2.41:1. */
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
  /**
   * [06/08] A FAIXA DO TOPO, e ela é token novo porque o pedido é estrutural e
   * não de valor: *"Navy — cor dominante: topo"*.
   *
   * Até 06/08 o topo era `--fundo2` — a mesma superfície do cartão. Com a paleta
   * nova isso o deixaria BRANCO sobre uma página creme, e o topo deixaria de ser
   * o elemento dominante para virar o mais claro da tela. Reaproveitar `--fundo2`
   * também não sobrevive ao tema escuro, onde ele já é escuro: o topo sumiria
   * dentro da página.
   *
   * Então são três tokens e não um: a faixa, a tinta que pousa nela, e a tinta
   * APAGADA da navegação inativa. Sem o terceiro, "onde estou" e "para onde posso
   * ir" ficariam com o mesmo peso dentro de uma faixa escura.
   *
   * ============================================================================
   * O PAPEL DELES ALARGOU EM 14/08, e a mudança é de NOME e não de valor: estes
   * três deixaram de ser "a barra" e passaram a ser **a superfície dominante e a
   * tinta que pousa nela**, onde quer que ela apareça. Quem os pediu foi o painel
   * cheio da aba Documento (`.fu-painel`, o valor a gerar no banco), que até aqui
   * usava `background: var(--texto); color: var(--fundo)`.
   *
   * Aquilo funcionava no claro por coincidência — `--texto` É o Navy — e no
   * escuro INVERTIA: `--texto` é o Creme, então o painel virava um bloco claro
   * dentro de uma tela escura. Pior, o par não era medido por teste nenhum: a
   * T1 mede tinta sobre SUPERFÍCIE, e `--texto` não é uma superfície.
   *
   * A alternativa era um segundo conjunto `--destaque/-texto/-fraco` com
   * exatamente os mesmos valores destes três. Seria a redundância que este
   * projeto vem tirando: dois nomes para uma cor é o começo de alguém editar um
   * e ler o outro. Estes já são a superfície dominante, já estão medidos (T6,
   * T6b) e já sobrevivem aos dois temas — então são eles.
   */
  topo: string;
  topoTexto: string;
  topoFraco: string;
  /**
   * [06/08] O VEU sobre a faixa — o fundo e a borda dos controles que vivem
   * DENTRO do topo (seletor de tenant, botao de tema, area do usuario).
   *
   * E branco translucido e nao cor solida por uma razao que vale os dois temas: o
   * mesmo valor funciona sobre o Navy do claro e sobre a variante do escuro,
   * entao um controle na barra nao precisa de duas cores para manter. Mesma ideia
   * do --brilho, que ja existia.
   *
   * SAO DOIS DEGRAUS E NAO SEIS. A primeira versao disto tinha seis alfas
   * escritos a mao (0.07, 0.08, 0.14, 0.16, 0.18, 0.28) — que e exatamente o
   * box-shadow a mao que o acabamento de 30/07 tirou daqui. Repouso e realce, e
   * nada entre os dois.
   */
  topoVeu: string;
  topoVeuForte: string;
  /** [06/08] O lastro do item ATIVO da navegacao. Laranja no claro, dourado no
   *  escuro — segue o --acento de cada tema, porque e o mesmo sinal. */
  topoAtivo: string;
  /** [derivado, 29/07] A cor da sombra dos cartões. Vive aqui porque `ui.tsx`
   *  não tem cor literal — nem em rgba. */
  sombra: string;
  /** [derivado, 30/07] A sombra do que FLUTUA ACIMA da página: menu suspenso,
   *  popover. Mais opaca que a dos cartões de propósito — a hierarquia de
   *  profundidade é o que diz "isto está sobre tudo e fecha ao clicar fora". */
  sombraForte: string;
  /* O `brilho` SAIU EM 30/09. Era a cor da faixa de luz que atravessava o botão
     primário no hover (700 ms, uma passada). Numa tela de trabalho aquilo era
     enfeite — o g3ref não tem nenhum —, e o hover do primário voltou a ser só o
     escurecimento do `--acento-hover`. Sem a faixa, o token não pinta nada. */
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
  fundo: '#F6F2EA',        // [G3] Cream — o fundo geral da página
  fundo2: '#FFFFFF',       // [derivado] o cartão SOBE do creme, e é o que dá a camada
  fundoRecuo: '#EDE7DB',   // [derivado] o creme aprofundado · texto 13.0:1, fraco 4.6:1
  fundoHover: '#F1ECE1',   // [derivado] entre o fundo e o recuo · --foco sobre ele 3.2:1
  texto: '#14213D',        // [G3] Navy — texto principal · 14.31:1 e 15.97:1
  fraco: '#66686F',        // [derivado do Gray #8F939D] o Gray puro dá 2.75:1 — ver a nota
  borda: '#D8D2C6',        // [G3] a linha de contorno
  bordaSuave: '#E4DFD4',   // [G3] a divisória interna · 1.19:1 contra o creme
  bordaForte: '#C9C1B1',   // [g3ref, 30/09] o tracejado e o campo sob o mouse · 1.79:1 no branco
  campo: '#FBF9F5',        // [g3ref, 30/09] o fundo do input · texto 15.19:1, fraco 5.29:1
  acento: '#E8843C',       // [G3] Orange — ação: botão primário, navegação ativa, filete
  acentoTexto: '#14213D',  // [G3] Navy sobre o Orange · 5.93:1 (branco daria 2.69:1)
  acentoForte: '#995728',  // [derivado do Orange] o laranja como TEXTO · pior par 4.55:1
  acentoHover: '#CC7435',  // [derivado] o Orange escurecido · --acento-texto sobre ele 4.65:1
  acentoSuave: '#FBEADB',  // [derivado] o laranja como superfície de destaque
  topo: '#14213D',         // [G3] Navy — a faixa dominante
  topoTexto: '#F6F2EA',    // [G3] Cream sobre Navy · 14.31:1
  topoFraco: '#999DA8',    // [derivado do Gray] a navegação inativa · 4.54:1 sobre o Navy
  topoVeu: 'rgba(255, 255, 255, 0.09)',
  topoVeuForte: 'rgba(255, 255, 255, 0.20)',
  topoAtivo: 'rgba(232, 132, 60, 0.14)',   // o Orange como lastro
  foco: '#B07841',         // [derivado do Gold #F4A65A] o Gold puro dá 1.80:1 — ver a nota
  // A sombra puxa o NAVY e não um preto neutro: sombra cinza sobre creme
  // acinzenta a página inteira, e o creme é o que a paleta tem de mais visível.
  sombra: 'rgba(20, 33, 61, 0.07)',
  sombraForte: 'rgba(20, 33, 61, 0.16)',
  gradiente: 'linear-gradient(90deg, #E8843C, #F4A65A)', // [G3] Orange → Gold
  // [derivado] A G3 não entregou os três estados semânticos. Verificados contra
  // as superfícies NOVAS, inclusive sobre o --acento-suave.
  erro: '#B42318',         // 6.29:1 e 6.05:1 sobre o próprio fundo de aviso · 5.77:1 sobre o suave
  erroFundo: '#FEF3F2',
  ok: '#067647',           // 5.44:1 e 5.69:1 · 4.99:1 sobre o suave
  okFundo: '#ECFDF3',      // [derivado, 30/07] · --ok sobre ele 5.40:1
  alerta: '#B14608',       // [derivado] escurecido 3% em 06/08: o creme aprofundado dava 4.41:1 · pior par 4.55:1
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
  fundo: '#14213D',        // [G3] Navy, usado como superfície — é a cor dominante
  fundo2: '#1C2C4E',       // [G3] a VARIANTE entregue, e ela é exatamente o segundo nível
  fundoRecuo: '#182642',   // [derivado] entre a página e o cartão · texto 13.5:1
  fundoHover: '#243458',   // [derivado] no escuro, destacar é CLAREAR acima do cartão
  texto: '#F6F2EA',        // [G3] Cream sobre Navy · 14.31:1 e 12.38:1
  fraco: '#999DA8',        // [derivado do Gray] o Gray CLAREADO 7% · pior par 4.54:1
  borda: '#2C3A5C',        // [derivado] a linha, um degrau acima do cartão
  bordaSuave: '#22304F',   // [derivado] a divisória interna · 1.13:1 contra o cartão
  // [derivado, 30/09] A linha forte, na mesma distância do cartão que a do claro
  // (2.08:1 contra o `#1C2C4E`, contra 1.79:1 do `#C9C1B1` no branco). A ilha
  // usava o `--fraco` aqui, e o tracejado da área de envio ficava mais aceso no
  // escuro do que no claro — o mesmo papel com dois pesos.
  bordaForte: '#4E5C80',
  // [derivado, 30/09] O campo afunda para a PÁGINA, como no claro: é o
  // mapeamento que a ilha já fazia (`--g3ref-campo: var(--fundo)`), agora com
  // nome próprio. Mesmo valor do `fundo` — o papel é outro.
  campo: '#14213D',
  acento: '#F4A65A',      // [G3] GOLD — e a troca é a mesma lógica de antes, ver a nota
  acentoTexto: '#14213D',  // [G3] Navy sobre o Gold · 7.95:1
  // No escuro o acento NÃO precisa escurecer para virar texto — precisa
  // continuar claro. O token é o mesmo valor, e isso é resposta, não descuido.
  acentoForte: '#F4A65A',  // 7.95:1 e 6.90:1
  // O hover ESCURECE aqui tambem: do Gold para o Orange da marca.
  // --acento-texto sobre ele: 5.93:1.
  acentoHover: '#E8843C',
  acentoSuave: '#3A2A18',  // [derivado] o laranja como superfície · texto 12.3:1, acento 6.9:1
  // No escuro a faixa não pode ser o mesmo navy da página, senão ela some — e
  // TAMBÉM não pode ser a variante `#1C2C4E`, que é o cartão: a primeira versão
  // disto usou a variante e a FOTO mostrou o defeito na hora — barra e cartão
  // ficaram indistinguíveis, e a tela perdeu a hierarquia que a mudança existia
  // para criar. No escuro a faixa AFUNDA em vez de subir, que é o inverso do
  // claro e a mesma lógica do `--fundo-recuo`: o papel é separar, e a direção
  // depende do tema.
  topo: '#0F1830',         // [derivado] o navy afundado · Cream sobre ele 16.02:1
  topoTexto: '#F6F2EA',    // [G3] Cream
  topoFraco: '#999DA8',    // [derivado do Gray] · sobre a variante, ver a nota do tipo
  topoVeu: 'rgba(255, 255, 255, 0.09)',
  topoVeuForte: 'rgba(255, 255, 255, 0.20)',
  topoAtivo: 'rgba(244, 166, 90, 0.14)',   // o Gold como lastro — segue o acento do escuro
  foco: '#F4A65A',         // [G3] Gold — no escuro ele passa direto, com folga sobre os 3:1
  sombra: 'rgba(0, 0, 0, 0.45)',
  sombraForte: 'rgba(0, 0, 0, 0.65)',
  gradiente: 'linear-gradient(90deg, #E8843C, #F4A65A)', // [G3] o mesmo filete Orange → Gold
  // [derivado] Os três estados. O âmbar puxa para amarelo aqui de propósito,
  // para afastar do laranja do acento — ver a nota de adjacência no cabeçalho.
  erro: '#FF6E6E',         // [derivado] clareado 1% em 06/08: o hover navy dava 4.43:1 · pior par 4.51:1
  erroFundo: '#2A1416',
  ok: '#4ADE80',           // 10.93:1 e 9.80:1
  okFundo: '#12261A',      // [derivado, 30/07] · --ok sobre ele 9.14:1
  alerta: '#FFD75E',       // 13.72:1 e 11.42:1 sobre o fundo de aviso
  alertaFundo: '#2A2113',
};

/**
 * A FONTE, SERVIDA POR NÓS.
 *
 * DESDE 30/09/2026 ELA É A BARLOW, e a Inter saiu. A Inter entrou em 30/07 a
 * pedido do dono, e o argumento dela era de uso — algarismo tabular de verdade
 * para coluna de dinheiro. A Barlow tem o mesmo recurso (`tnum`), e foi ela que o
 * dono escolheu como identidade: o desenho da Fatura unificada vira o do
 * sistema. Não são duas fontes de corpo convivendo: é UMA, e a condensada é o
 * segundo papel, não uma segunda opinião.
 *
 * AS DUAS FAMILIAS TEM PAPEIS SEPARADOS, e a separacao e o que faz o desenho
 * parecer o que parece: a **Barlow** e corpo, campo e valor; a **Barlow Semi
 * Condensed** e titulo, aba, botao, rotulo em caixa alta e numero grande. Na
 * referencia sao 61 ocorrencias da condensada contra 1 da Barlow — a condensada
 * e a fonte de superficie, nao a excecao.
 *
 * O ARGUMENTO ANTIGO DESTE ARQUIVO CONTRA WEBFONT CONTINUA VÁLIDO: *"uma tela de
 * operação que trava esperando webfont é uma tela que pisca em toda
 * navegação"*. O que o resolve são três coisas juntas, e as três seguem aqui:
 *
 *   1. **Servida pela nossa origem**, de `web/public/fontes/`. Sem CDN de
 *      terceiro: uma origem só, sem DNS nem TLS extra, e sem mandar o IP de
 *      quem opera para fora. A referencia puxa do `fonts.gstatic.com`, e isso
 *      nao veio;
 *   2. **`font-display: swap`** — o texto aparece imediatamente na fonte de
 *      sistema e troca quando a Barlow chega;
 *   3. **A pilha de sistema INTEIRA continua atrás.** Se o arquivo não chegar, a
 *      tela é a de ontem na fonte do sistema — não é uma tela quebrada.
 *
 * OS BYTES SAO OS DA PROPRIA REFERENCIA, desempacotados do manifesto `__bundler`
 * do commit `36e964e` — nao um download novo do Google. Conferido em 14/08 contra
 * o que o Google serve (`/s/barlow/v13`, `/s/barlowsemicondensed/v16`): **mesma
 * versao 1.408, mesmos 272 glifos, mesmas larguras** em A/a/M/m/0/R/$ e espaco.
 *
 * A VERSAO VIAJA NO NOME (`-v1.408`): o `public/` do Vite nao recebe hash e o
 * `servirEstatico` manda `immutable, max-age=31536000` para tudo que nao e o
 * `index.html` — sem a versao no nome, trocar a fonte deixaria um ano de
 * browsers com a antiga. A licenca (OFL 1.1) esta em `LICENSE-barlow.txt`.
 *
 * SO `latin` E `latin-ext`. O `vietnamese` da referencia sao 47 KB que nenhuma
 * tela em portugues alcanca — e `unicode-range` faz o browser baixar so o
 * subconjunto que a pagina realmente pinta.
 *
 * O ARQUIVO DA INTER SAIU DE `web/public/fontes/` em 30/09/2026 (etapa 4a). Ele
 * tinha ficado para trás na etapa 0 — e o `index.html` ainda o PRÉ-CARREGAVA em
 * toda visita, sem nenhuma regra que o usasse. O preload passou para a Barlow.
 */

/** Os dois `unicode-range` sao os da folha do Google Fonts que a referencia
 *  carrega, copiados sem alteracao — recorta-los seria mudar QUAL arquivo o
 *  browser escolhe para um caractere, que e a unica coisa que eles decidem. */
const FAIXAS_BARLOW = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, '
    + 'U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, '
    + 'U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, '
    + 'U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, '
    + 'U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
} as const;

/** Os quatro pesos que a referencia realmente pinta — medidos no template e no
 *  `renderVals()`: 400, 500, 600 e 700. Nao ha 300 nem italico em lugar nenhum
 *  dela, e por isso nenhum dos dois viajou. (`<em>` aparece em quatro lugares do
 *  sistema; o browser inclina a upright, e e o suficiente.) */
const PESOS_BARLOW = [400, 500, 600, 700] as const;

const FAMILIAS_BARLOW = [
  { nome: 'Barlow', arquivo: 'barlow' },
  { nome: 'Barlow Semi Condensed', arquivo: 'barlow-semi-condensed' },
] as const;

/** As dezesseis `@font-face`, geradas. Escritas a mao seriam dezesseis blocos
 *  quase iguais, e a proxima diferenca entre dois deles seria invisivel. */
export const FONTE_CSS = FAMILIAS_BARLOW.flatMap((f) =>
  PESOS_BARLOW.flatMap((peso) =>
    (Object.keys(FAIXAS_BARLOW) as Array<keyof typeof FAIXAS_BARLOW>).map((sub) => `
  @font-face {
    font-family: '${f.nome}';
    font-style: normal;
    font-weight: ${peso};
    font-display: swap;
    src: url('/fontes/${f.arquivo}-${peso}-${sub}-v1.408.woff2') format('woff2');
    unicode-range: ${FAIXAS_BARLOW[sub]};
  }`))).join('\n');

/**
 * Tipografia e ritmo.
 *
 * A pilha de sistema segue logo depois da Barlow, e não é decoração: é o que
 * torna a webfont uma melhoria em vez de uma dependência. Ver `FONTE_CSS`.
 */
export const TIPOGRAFIA = {
  familia: "'Barlow', ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
  /** [30/09] A condensada: título, aba, botão, rótulo em caixa alta, cabeçalho
   *  de tabela e número grande. A Barlow vem logo atrás dela de propósito — se o
   *  arquivo condensado falhar e o normal não, o título sai na família certa e só
   *  mais largo, em vez de cair direto na fonte do sistema. */
  familiaCond: "'Barlow Semi Condensed', 'Barlow', ui-sans-serif, system-ui, sans-serif",
  /** [30/07] Monoespaçada com nome. `<code>` carrega linha digitável, BR Code e
   *  `credencial_ref` — coisas que se conferem dígito a dígito —, e até aqui ela
   *  era o default do browser, que muda de máquina para máquina. */
  familiaMono: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace",
  /** [30/09] 15px de Barlow e não 16. A Barlow tem altura de x MENOR que a Inter
   *  (0,50 contra 0,55 do corpo), então 15px dela ocupam na tela o que ocupavam
   *  13,7px de Inter — e o sistema inteiro estava calibrado em 13,5px de Inter.
   *  15px devolve a MESMA largura de coluna com letra maior; 16px empurraria as
   *  tabelas largas (Unidades já estoura os 1160px) para a rolagem lateral. */
  base: '15px',
  linha: '1.5',
  /** Tabular para número: coluna de dinheiro desalinhada é difícil de conferir,
   *  e conferir é o que a operação faz aqui. */
  numero: 'tabular-nums',
  /** [30/09] ZERO. O `-0.011em` era o ajuste que a Inter pede em corpo; a Barlow
   *  é desenhada para tracking neutro, e a referência não declara
   *  `letter-spacing` fora dos rótulos em caixa alta. */
  tracking: 'normal',
  /**
   * [14/08] O RÓTULO EM CAIXA ALTA, e ele é token porque **eram cinco** — o
   * mesmo papel (nome de seção, cabeçalho de coluna, legenda de cartão) escrito
   * com cinco combinações de peso e tracking, medidas na auditoria de 14/08.
   *
   * [30/09] ELE PASSOU A SER O DA REFERÊNCIA, NA CONDENSADA. A ilha escrevia
   * 12px · 400 · .14em em cinza puro; a casa, 11px · 650 · .07em. O de hoje é
   * 12px · 500 · .1em: o tamanho e a família são os da referência, o peso sobe
   * um degrau porque a tinta desceu do Gray puro (3,08:1) para o `--fraco`
   * (5,56:1) e a condensada a 400 nesse cinza fica fina demais, e o tracking cai
   * um pouco porque cabeçalho de tabela com .14em alarga colunas que já não
   * cabem.
   */
  rotuloTamanho: '12px',
  rotuloPeso: '500',
  rotuloTracking: '.1em',
};

/**
 * [30/09] A ESCALA DE CORPO, por PAPEL e não por valor.
 *
 * Até aqui cada regra escolhia o seu: 11, 11.5, 12, 12.5, 13, 13.5, 14, 15.5,
 * 16px — nove tamanhos para quatro papéis. A escala abaixo tem SETE degraus e
 * cada um tem um dono. Passos de ~1.1 a ~1.2, que é o que tela de operação
 * pede: muito elemento de texto, e contraste exagerado entre eles vira ruído.
 *
 *   rotulo   12    só CAIXA ALTA condensada (cabeçalho, legenda de cartão, selo).
 *                  Nada de texto corrido aqui: caixa alta de 12px tem a letra
 *                  mais alta que o minúsculo de 13px
 *   meta     13.5  rótulo de campo, dica, contagem, nota ao pé — o piso do
 *                  texto corrido (o pedido é "nada abaixo de 13")
 *   ui       14    menu, aviso, botão de texto
 *   corpo    15    parágrafo, tabela, campo, botão
 *   h3       17
 *   h2       20
 *   h1       30
 *
 * O número grande do KPI (28) mora na própria regra: é um papel só, e token de
 * um uso só é o que o `extract` manda não criar.
 */
export const ESCALA = {
  rotulo: '12px',
  meta: '13.5px',
  ui: '14px',
  corpo: '15px',
  h3: '17px',
  h2: '20px',
  h1: '30px',
};

export const RITMO = {
  /**
   * [30/09] O RAIO É ZERO, nos três. A referência não tem um canto arredondado
   * — nem cartão, nem campo, nem botão, nem aviso — e a identidade dela passou a
   * ser a do sistema. Os tokens ficam, e o motivo é o mesmo de terem nascido em
   * 30/07: raio é um valor com NOME, e o próximo `border-radius: 6px` escrito à
   * mão numa regra nova é justamente a volta da segunda gramática. A suíte de
   * interface (I8c) prende os três em no máximo 2px.
   */
  raio: '0',
  raioCartao: '0',
  raioPequeno: '0',
  /** O que é REDONDO por natureza e não por acabamento: as duas bolhas do balão
   *  de ajuda (a cauda de um balão de pensamento). É a exceção nomeada na I8c. */
  raioPilula: '999px',
  gap: '12px',
  /**
   * [14/08] O ESPAÇO ENTRE SEÇÕES — entre dois cartões empilhados.
   *
   * Ele existia como o literal `20` em `style={{ marginBottom: 20 }}` em **dez
   * telas**, e a aba Documento empilhava com `var(--gap)` (12px). Os dois valores
   * conviviam na MESMA página: os cartões do cadastro a 20 e a grade de
   * conferência a 12.
   *
   * 20 ganhou por ser o que dez telas já faziam. E virou token para o próximo
   * cartão não escolher um terceiro número — é a mesma razão de `--gap` existir.
   */
  gapSecao: '20px',
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
 *
 * [30/09] OS DEGRAUS 1 E 2 FICARAM SEM SUPERFÍCIE. O g3ref separa cartão de
 * página por borda de 1px e por fundo, e nenhuma superfície apoiada tem sombra —
 * cartão, KPI, tabela, filtro, aviso e botão perderam a dela. O 3 continua sendo
 * o que FLUTUA (menu, painel de ajuda, balão), porque ali a sombra não é
 * acabamento: é o que diz "isto está por cima e fecha ao clicar fora". O 2
 * sobrevive num lugar só, a folha A4 na prévia — papel sobre a mesa, que é a
 * única sombra da própria referência. Os três ficam com nome pelo mesmo motivo
 * dos raios: a próxima sombra escrita à mão é a volta da segunda gramática.
 */
export const SOMBRAS = {
  um: '0 1px 2px var(--sombra), 0 1px 3px -1px var(--sombra)',
  dois: '0 1px 2px var(--sombra), 0 8px 20px -8px var(--sombra-forte)',
  tres: '0 2px 4px var(--sombra), 0 16px 32px -12px var(--sombra-forte)',
};

const variaveis = (p: Paleta) => `
    --fundo: ${p.fundo}; --fundo2: ${p.fundo2}; --fundo-recuo: ${p.fundoRecuo};
    --fundo-hover: ${p.fundoHover}; --texto: ${p.texto}; --fraco: ${p.fraco};
    --borda: ${p.borda}; --borda-suave: ${p.bordaSuave}; --borda-forte: ${p.bordaForte};
    --campo: ${p.campo};
    --acento: ${p.acento}; --acento-texto: ${p.acentoTexto};
    --acento-forte: ${p.acentoForte}; --acento-hover: ${p.acentoHover}; --acento-suave: ${p.acentoSuave};
    --foco: ${p.foco}; --sombra: ${p.sombra}; --sombra-forte: ${p.sombraForte};
    --topo: ${p.topo}; --topo-texto: ${p.topoTexto}; --topo-fraco: ${p.topoFraco};
    --topo-veu: ${p.topoVeu}; --topo-veu-forte: ${p.topoVeuForte}; --topo-ativo: ${p.topoAtivo};
    --gradiente: ${p.gradiente};
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
 *
 * ==========================================================================
 * O BLOCO `.g3ref { --g3ref-* }` SAIU EM 30/09, e o que ele era fica registrado.
 *
 * De 14/08 a 30/09 a aba Documento (hoje Fatura unificada) tinha uma paleta
 * inteira própria, medida no template da referência `g3-fatura-unificada` e com
 * um bloco escuro que remapeava cada token para o equivalente da casa. Com o
 * g3ref virando o sistema, as duas paletas passaram a dizer a mesma coisa com
 * valores quase iguais (`#E4DED2` contra `#E4DFD4`, `#DDD6C8` contra `#D8D2C6`)
 * — e duas paletas quase iguais são o pior caso: ninguém vê a diferença, e a
 * próxima correção entra numa só. Cada `--g3ref-*` virou o token daqui:
 *
 *   papel, fundo, campo          --fundo2, --fundo, --campo
 *   borda, borda-campo           --borda
 *   borda-forte, regua           --borda-forte, --borda-suave
 *   tinta, tinta-invertida       --texto, --fundo
 *   apagado  #8F939D             --fraco           (AA: 3,08 -> 5,56:1)
 *   laranja como tinta           --acento-forte    (AA: 2,69 -> 5,60:1)
 *   laranja-tinta  #fff          --acento-texto    (AA: 2,69 -> 5,93:1)
 *   laranja, laranja-hover       --acento, --acento-hover
 *   alerta-fundo  #FBF1E4        --alerta-fundo    (ver a nota no estilo.ts)
 *   navy, navy-tinta             --topo, --topo-texto
 *   navy-apagado, navy-legenda   --topo-fraco
 *   navy-regua, navy-rotulo      --topo-veu-forte, --acento
 *   fonte, fonte-cond            --fonte, --fonte-cond
 *
 * O ANEL DE FOCO DA ILHA TAMBÉM SAIU: era o laranja cru (2,41:1 sobre o creme,
 * abaixo dos 3:1 da WCAG 1.4.11). O sistema tem UM anel, `--foco`.
 */
export const VARIAVEIS_CSS = `
  ${FONTE_CSS}
  :root {${variaveis(CLARO)}
    --raio: ${RITMO.raio}; --raio-cartao: ${RITMO.raioCartao};
    --raio-pequeno: ${RITMO.raioPequeno}; --raio-pilula: ${RITMO.raioPilula};
    --gap: ${RITMO.gap}; --gap-secao: ${RITMO.gapSecao};
    --largura: ${RITMO.larguraMaxima};
    --sombra-1: ${SOMBRAS.um}; --sombra-2: ${SOMBRAS.dois}; --sombra-3: ${SOMBRAS.tres};
    --fonte: ${TIPOGRAFIA.familia};
    --fonte-cond: ${TIPOGRAFIA.familiaCond};
    --fonte-mono: ${TIPOGRAFIA.familiaMono};
    --t-rotulo: ${ESCALA.rotulo}; --t-meta: ${ESCALA.meta}; --t-ui: ${ESCALA.ui};
    --t-corpo: ${ESCALA.corpo}; --t-h3: ${ESCALA.h3}; --t-h2: ${ESCALA.h2}; --t-h1: ${ESCALA.h1};
    --rotulo-tamanho: ${TIPOGRAFIA.rotuloTamanho};
    --rotulo-peso: ${TIPOGRAFIA.rotuloPeso};
    --rotulo-tracking: ${TIPOGRAFIA.rotuloTracking};
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
