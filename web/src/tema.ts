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
//      anotados onde reprovaram.
//   2. OS TRÊS ESTADOS DA PRONTIDÃO são semânticos e não decorativos:
//      `ok` (verde), `pendente` (vermelho) e `nao_medido` (âmbar). O terceiro
//      existe porque "zero sobre universo vazio" NÃO é pronto — pintá-lo de
//      verde faria a tela autorizar o que não conferiu, que foi um defeito real
//      achado em 28/07. Se a marca não tiver um âmbar, ele precisa de outra
//      forma de se distinguir do verde — nunca de virar verde.
//   3. COR NÃO PODE SER O ÚNICO SINAL. Hoje cada marca carrega o texto do estado
//      junto ("OK", "Pendente", "Não medido"). Mantenha, ou daltônico perde a
//      informação inteira.
//   4. OS DOIS TEMAS. As duas metades são mantidas juntas — um tema que só
//      funciona claro é meio tema. O que mudou em 29/07 foi só QUEM decide:
//      antes era `prefers-color-scheme` sozinho; agora é a escolha da pessoa
//      (padrão claro), e "Sistema" continua disponível para quem preferir.
//
// UMA ADJACÊNCIA QUE A G3 PRECISA VER NA TELA. A identidade é laranja e o âmbar
// do `nao_medido` é laranja: eles são vizinhos por natureza, e nenhuma escolha de
// matiz separa os dois de todo. A restrição 2 exige separação do VERDE, e essa
// está cumprida com folga. A separação do acento vem da forma, não da cor — o
// acento aparece preenchido (botão, filete, navegação ativa), e os estados só
// aparecem como pílula contornada com o texto dentro (restrição 3). Se ainda
// assim ficar confuso em uso real, o conserto é de forma — nunca virar verde.

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
  /** [G3] O filete de marca: `--brand-orange` → `--brand-orange-soft`. A própria
   *  paleta reserva o soft para gradiente, e é o único lugar onde ele aparece no
   *  tema claro. Ninguém escreve texto sobre o filete — ele tem 3px. */
  gradiente: string;
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
  acentoForte: '#8F5600',  // [derivado] ver o porquê do degrau extra no tipo · 6.00:1, 5.74:1 e 5.26:1
  acentoHover: '#DC7C00',  // [derivado] a marca escurecida · --acento-texto sobre ele 6.28:1
  acentoSuave: '#FDEEDA',  // [derivado] o laranja como superfície de destaque
  foco: '#CE7400',         // [derivado] 3.43:1 e 3.28:1 — não-texto pede 3:1
  sombra: 'rgba(14, 16, 20, 0.06)',
  gradiente: 'linear-gradient(90deg, #F39200, #FFA827)', // [G3] orange → orange-soft
  // [derivado] A G3 não entregou os três estados semânticos. Verificados contra
  // as superfícies NOVAS, inclusive sobre o --acento-suave.
  erro: '#B42318',         // 6.29:1 e 6.05:1 sobre o próprio fundo de aviso · 5.77:1 sobre o suave
  erroFundo: '#FEF3F2',
  ok: '#067647',           // 5.44:1 e 5.69:1 · 4.99:1 sobre o suave
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
  // O hover ESCURECE aqui tambem: do soft para o laranja-base da marca.
  // --acento-texto sobre ele: 8.09:1.
  acentoHover: '#F39200',
  acentoSuave: '#2E2113',  // [derivado, 29/07] texto 15.64:1, acento 8.10:1, fraco 4.75:1
  foco: '#FFA827',         // [derivado, 29/07] 9.87:1 — folga sobre os 3:1 pedidos
  sombra: 'rgba(0, 0, 0, 0.45)',
  gradiente: 'linear-gradient(90deg, #F39200, #FFA827)', // [G3] o mesmo filete
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
  raio: '8px',
  raioCartao: '12px',
  gap: '12px',
  larguraMaxima: '1160px',
};

const variaveis = (p: Paleta) => `
    --fundo: ${p.fundo}; --fundo2: ${p.fundo2}; --texto: ${p.texto}; --fraco: ${p.fraco};
    --borda: ${p.borda}; --acento: ${p.acento}; --acento-texto: ${p.acentoTexto};
    --acento-forte: ${p.acentoForte}; --acento-hover: ${p.acentoHover}; --acento-suave: ${p.acentoSuave};
    --foco: ${p.foco}; --sombra: ${p.sombra}; --gradiente: ${p.gradiente};
    --erro: ${p.erro}; --erro-fundo: ${p.erroFundo};
    --ok: ${p.ok}; --alerta: ${p.alerta}; --alerta-fundo: ${p.alertaFundo};`;

/**
 * As custom properties dos dois temas. `ui.tsx` cola isto no topo do CSS.
 *
 * O SELETOR É `data-tema`, NÃO `prefers-color-scheme` — a media query deixou de
 * decidir sozinha em 29/07. Quem grava o atributo é `aplicarModo` abaixo; sem
 * atributo nenhum (primeiro paint, JS ainda carregando) vale o claro, que é o
 * padrão do sistema desde a mesma decisão.
 */
export const VARIAVEIS_CSS = `
  :root {${variaveis(CLARO)}
    --raio: ${RITMO.raio}; --raio-cartao: ${RITMO.raioCartao}; --gap: ${RITMO.gap};
    --largura: ${RITMO.larguraMaxima};
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
