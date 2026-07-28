// O TEMA. Cores, espaçamento e tipografia, num lugar só.
//
// A PALETA DE MARCA VEIO DA G3 EM 28/07/2026 e substitui a provisória que estava
// aqui — o cinza neutro com azul de acento que eu havia escolhido para as telas
// serem legíveis antes de existir identidade. Os valores de marca abaixo estão
// marcados `[G3]` e não se alteram por conveniência de implementação.
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
//      e 19.04:1. Todo par desta paleta foi medido, e dois reprovaram — ver
//      `acentoTexto` e `acentoForte` abaixo.
//   2. OS TRÊS ESTADOS DA PRONTIDÃO são semânticos e não decorativos:
//      `ok` (verde), `pendente` (vermelho) e `nao_medido` (âmbar). O terceiro
//      existe porque "zero sobre universo vazio" NÃO é pronto — pintá-lo de
//      verde faria a tela autorizar o que não conferiu, que foi um defeito real
//      achado em 28/07. Se a marca não tiver um âmbar, ele precisa de outra
//      forma de se distinguir do verde — nunca de virar verde.
//   3. COR NÃO PODE SER O ÚNICO SINAL. Hoje cada marca carrega o texto do estado
//      junto ("ok", "pendente", "não medido"). Mantenha, ou daltônico perde a
//      informação inteira.
//   4. OS DOIS TEMAS. `prefers-color-scheme` decide, e as duas metades são
//      mantidas juntas — um tema que só funciona claro é meio tema.
//
// UMA ADJACÊNCIA QUE A G3 PRECISA VER NA TELA. A identidade é laranja e o âmbar
// do `nao_medido` é laranja: eles são vizinhos por natureza, e nenhuma escolha de
// matiz separa os dois de todo. A restrição 2 exige separação do VERDE, e essa
// está cumprida com folga. A separação do acento vem da forma, não da cor — o
// acento só aparece preenchido (botão), e os estados só aparecem como pílula
// contornada com o texto dentro (restrição 3). Se ainda assim ficar confuso em
// uso real, o conserto é de forma — preencher a pílula —, nunca virar verde.

export type Paleta = {
  fundo: string; fundo2: string; texto: string; fraco: string; borda: string;
  acento: string;
  /** O texto SOBRE o acento. Separado de propósito: se a marca trouxer um acento
   *  claro, texto branco em cima dele fica ilegível — e um `#fff` cravado no CSS
   *  seria justamente o valor que ninguém lembra de trocar junto.
   *
   *  FOI EXATAMENTE O QUE ACONTECEU. Branco sobre o `#F39200` da G3 dá **2.35:1**
   *  e reprova; a tinta escura da própria marca dá **8.09:1**. O token existia
   *  para este dia. */
  acentoTexto: string;
  /** O acento QUANDO ELE É O TEXTO, e não o fundo. Existe pelo mesmo motivo que
   *  o de cima, no sentido inverso, e também foi medido:
   *
   *    `#F39200` sobre branco  2.35:1  reprova
   *    `#D97A00` sobre branco  3.12:1  reprova
   *    `#A56300` sobre branco  4.79:1  passa   <- este
   *
   *  `#A56300` é o próprio laranja da marca a 68% do brilho — mesma matiz, e a
   *  única coisa que muda é o que a restrição 1 exige que mude. Note que a
   *  paleta da G3 atribui `#F39200` a *"botões, dot do tag, checkbox, hover de
   *  links"* — elementos PREENCHIDOS e um estado transitório. Nenhum deles é
   *  texto em repouso, então usar o valor escurecido aqui não contraria a marca:
   *  cobre o caso que ela não endereçou. */
  acentoForte: string;
  erro: string; erroFundo: string; ok: string;
  alerta: string; alertaFundo: string;
};

/**
 * TEMA CLARO. As superfícies, o texto e as linhas são da G3, sem alteração.
 *
 * A inversão em relação à paleta antiga é intencional e é o que a marca pede:
 * antes a página era branca e o cartão era cinza; agora a página é o off-white
 * `--bg` e o cartão é o branco puro `--bg-card`. É o desenho entregue.
 *
 * `--bg-soft #F2F1EC` não recebeu slot: este layout tem dois níveis de
 * superfície, não três. Fica registrado que sobrou, em vez de ser encaixado em
 * algum lugar só para não sobrar.
 */
export const CLARO: Paleta = {
  fundo: '#FAFAF7',        // [G3] --bg
  fundo2: '#FFFFFF',       // [G3] --bg-card
  texto: '#0E1014',        // [G3] --ink        · 18.21:1 e 19.04:1
  fraco: '#5A5E66',        // [G3] --ink-3      · 6.22:1 e 6.51:1
  borda: '#E6E5DF',        // [G3] --line
  acento: '#F39200',       // [G3] --brand-orange
  acentoTexto: '#0E1014',  // [G3] --ink sobre o acento · 8.09:1 (branco daria 2.35:1)
  acentoForte: '#A56300',  // [derivado] o --brand-orange a 68% · 4.58:1 e 4.79:1
  // [derivado] A G3 não entregou os três estados semânticos. Verificados contra
  // as superfícies NOVAS, que são mais quentes que as antigas.
  erro: '#B42318',         // 6.29:1 e 6.05:1 sobre o próprio fundo de aviso
  erroFundo: '#FEF3F2',
  ok: '#067647',           // 5.44:1 e 5.69:1
  alerta: '#B54708',       // 5.19:1 e 5.20:1 sobre o próprio fundo de aviso
  alertaFundo: '#FFFAEB',
};

/**
 * TEMA ESCURO — [derivado] quase inteiro, e é a metade que a G3 ainda não viu.
 *
 * A única âncora entregue é o `--ink #0E1014`, que a paleta descreve como fundo
 * do aside escuro com texto `#fff`: é a prova de que a marca já admite a própria
 * tinta como superfície, e é dela que este tema parte. O resto — o segundo nível
 * de superfície, a borda e os estados — é escolha minha.
 *
 * O acento troca para `--brand-orange-soft #FFA827` aqui, e não é liberdade: o
 * laranja padrão sobre fundo escuro fica pesado, e a própria paleta reserva o
 * soft para gradiente/sunburst, que é uso sobre escuro. 9.87:1 sobre o `--ink`.
 */
export const ESCURO: Paleta = {
  fundo: '#0E1014',        // [G3] --ink, usado como superfície
  fundo2: '#191C21',       // [derivado] segundo nível
  texto: '#FFFFFF',        // [G3] o texto do aside escuro · 19.04:1 e 17.08:1
  fraco: '#8A8E94',        // [G3] --ink-4 · 5.78:1 e 5.19:1
  borda: '#2A2D33',        // [G3] --ink-2, usado como linha
  acento: '#FFA827',       // [G3] --brand-orange-soft · 9.87:1
  acentoTexto: '#0E1014',  // [G3] --ink sobre o acento · 9.87:1
  // No escuro o acento NÃO precisa escurecer para virar texto — precisa
  // continuar claro. O token é o mesmo valor, e isso é resposta, não descuido.
  acentoForte: '#FFA827',  // 9.87:1 e 8.85:1
  // [derivado] Os três estados. O âmbar puxa para amarelo aqui de propósito,
  // para afastar do laranja do acento — ver a nota de adjacência no cabeçalho.
  erro: '#FF6B6B',         // 6.86:1 e 6.16:1 · 6.25:1 sobre o fundo de aviso
  erroFundo: '#2A1416',
  ok: '#4ADE80',           // 10.93:1 e 9.80:1
  alerta: '#FFD75E',       // 13.72:1 e 11.42:1 sobre o fundo de aviso
  alertaFundo: '#2A2113',
};

/**
 * Tipografia e ritmo. `ui-sans-serif` primeiro: a fonte do sistema não precisa
 * ser baixada, e uma tela de operação que trava esperando webfont é uma tela que
 * pisca em toda navegação.
 */
export const TIPOGRAFIA = {
  familia: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  base: '15px',
  linha: '1.5',
  /** Tabular para número: coluna de dinheiro desalinhada é difícil de conferir,
   *  e conferir é o que a operação faz aqui. */
  numero: 'tabular-nums',
};

export const RITMO = {
  raio: '6px',
  raioCartao: '8px',
  gap: '12px',
  larguraMaxima: '1100px',
};

const variaveis = (p: Paleta) => `
    --fundo: ${p.fundo}; --fundo2: ${p.fundo2}; --texto: ${p.texto}; --fraco: ${p.fraco};
    --borda: ${p.borda}; --acento: ${p.acento}; --acento-texto: ${p.acentoTexto};
    --acento-forte: ${p.acentoForte};
    --erro: ${p.erro}; --erro-fundo: ${p.erroFundo};
    --ok: ${p.ok}; --alerta: ${p.alerta}; --alerta-fundo: ${p.alertaFundo};`;

/** As custom properties dos dois temas. `ui.tsx` cola isto no topo do CSS. */
export const VARIAVEIS_CSS = `
  :root {${variaveis(CLARO)}
    --raio: ${RITMO.raio}; --raio-cartao: ${RITMO.raioCartao}; --gap: ${RITMO.gap};
    --largura: ${RITMO.larguraMaxima};
  }
  @media (prefers-color-scheme: dark) {
    :root {${variaveis(ESCURO)}
    }
  }
`;
