// O TEMA. Cores, espaçamento e tipografia, num lugar só.
//
// ⚠️ A PALETA ABAIXO É PROVISÓRIA E FOI ESCOLHIDA POR MIM, NÃO PELA G3.
//
// Ela existe para as oito telas serem legíveis hoje — não como decisão de marca.
// Nenhum valor daqui saiu de manual de identidade, de logotipo ou de conversa: é
// cinza neutro com um azul de acento, escolhido para não competir com nada e
// para funcionar em claro e escuro. **Trocar isto é trocar este arquivo, e só
// ele**: nenhuma tela tem cor literal, e `ui.tsx` monta o CSS a partir daqui.
//
// É deliberadamente o mesmo tratamento que a regra 10 dá a qualquer lacuna: em
// vez de escolher em silêncio e espalhar a escolha por oito arquivos, a escolha
// fica declarada, num lugar, marcada como provisória e barata de reverter.
//
// O QUE A SUBSTITUIÇÃO PRECISA PRESERVAR, e não é gosto:
//
//   1. CONTRASTE. `--texto` sobre `--fundo` e sobre `--fundo2` precisa passar em
//      4.5:1 (WCAG AA para texto). Operação lê isto o dia inteiro.
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

export type Paleta = {
  fundo: string; fundo2: string; texto: string; fraco: string; borda: string;
  acento: string;
  /** O texto SOBRE o acento. Separado de propósito: se a marca trouxer um acento
   *  claro, texto branco em cima dele fica ilegível — e um `#fff` cravado no CSS
   *  seria justamente o valor que ninguém lembra de trocar junto. */
  acentoTexto: string;
  erro: string; erroFundo: string; ok: string;
  alerta: string; alertaFundo: string;
};

/** PROVISÓRIA — ver o cabeçalho. */
export const CLARO: Paleta = {
  fundo: '#ffffff', fundo2: '#f6f7f9', texto: '#16181d', fraco: '#6b7280',
  borda: '#e3e6ea', acento: '#1f6feb', acentoTexto: '#ffffff', erro: '#b42318', erroFundo: '#fef3f2',
  ok: '#067647', alerta: '#b54708', alertaFundo: '#fffaeb',
};

/** PROVISÓRIA — ver o cabeçalho. */
export const ESCURO: Paleta = {
  fundo: '#0f1115', fundo2: '#161a21', texto: '#e6e8ec', fraco: '#9aa3af',
  borda: '#262c36', acento: '#4c8dff', acentoTexto: '#0f1115', erro: '#ff6b6b', erroFundo: '#2a1416',
  ok: '#4ade80', alerta: '#fbbf24', alertaFundo: '#2a2113',
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
