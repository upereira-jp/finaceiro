// AS REGRAS DO EDITOR DE LAYOUT, PURAS e fora do `.tsx`.
//
// O runner do `web/` nao le JSX, entao regra dentro do componente e inalcancavel
// por teste (regra 8). E aqui as regras sao geometria: arrastar, redimensionar,
// prender na grade e converter milimetro em pixel. Cada uma tem um jeito
// silencioso de errar - um bloco que sai da folha por 0,2 mm, uma alca que
// arrasta o lado errado -, e nenhum deles aparece em revisao de codigo.
//
// ESTE ARQUIVO E UM ESPELHO, E ESPELHO TEM MODO DE FALHA PROPRIO: divergir do
// servidor sem que nenhum dos dois lados pareca errado. E a mesma advertencia de
// `web/src/contas-regras.ts`, e vale igual aqui.
//
// O QUE FOI FEITO PARA REDUZIR O ESPELHO AO MINIMO:
//
//   - as MEDIDAS DOS PAPEIS nao estao aqui. Vem do servidor, em
//     `GET /cobranca/layout` -> `papeis`. Duplicar "A4 = 210x297" criaria duas
//     verdades sobre o tamanho da folha, e o sintoma seria a previa desenhando
//     uma coisa e a impressora saindo com outra;
//   - a CONFERENCIA de verdade tambem nao esta aqui. Quem recusa bloco fora da
//     pagina e `salvarLayout` no servidor (`src/repos/documento.ts`). O que este
//     arquivo faz e PRENDER o bloco dentro da area enquanto a pessoa arrasta,
//     para que a recusa nunca chegue a acontecer.
//
// O que sobra de espelho e uma subtracao - area = papel menos margens -, e ela
// esta presa nos dois sentidos pelo teste `W3`, contra a mesma relacao que a
// `L3` afirma do lado do servidor.

export type Medidas = { largura_mm: number; altura_mm: number };
export type Retangulo = { x_mm: number; y_mm: number; largura_mm: number; altura_mm: number };

export type FolhaDoEditor = {
  papel: string;
  orientacao: 'retrato' | 'paisagem';
  margem_topo_mm: number;
  margem_direita_mm: number;
  margem_baixo_mm: number;
  margem_esquerda_mm: number;
};

/** O papel com a orientacao aplicada. `medidas` vem do servidor. */
export function medidasComOrientacao(m: Medidas, orientacao: string): Medidas {
  return orientacao === 'paisagem'
    ? { largura_mm: m.altura_mm, altura_mm: m.largura_mm }
    : { largura_mm: m.largura_mm, altura_mm: m.altura_mm };
}

/** Espelha `areaImprimivel` de `src/dominio/layout-visual.ts`. Ver o cabecalho. */
export function areaDaFolha(m: Medidas, f: FolhaDoEditor): Retangulo {
  const p = medidasComOrientacao(m, f.orientacao);
  return {
    x_mm: f.margem_esquerda_mm,
    y_mm: f.margem_topo_mm,
    largura_mm: p.largura_mm - f.margem_esquerda_mm - f.margem_direita_mm,
    altura_mm: p.altura_mm - f.margem_topo_mm - f.margem_baixo_mm,
  };
}

/**
 * MEIO MILIMETRO e a resolucao do editor.
 *
 * Nao e estetica: a coluna e `numeric(6,1)`, entao 0,05 mm seria arredondado no
 * banco e o bloco voltaria de la num lugar levemente diferente de onde a pessoa
 * o soltou. Prender aqui no que o banco guarda faz o que se ve ser o que se
 * grava - e meio milimetro esta muito abaixo do que um olho distingue no papel.
 */
export const PASSO_MM = 0.5;

/**
 * Prende na grade e corta a imprecisao do `numeric(6,1)`.
 *
 * O GUARDA DO `passo` NAO E PARANOIA - foi um defeito, pego pela `W1b` ao
 * escreve-la. `[...].map(naGrade)` e a coisa natural de escrever, e `Array.map`
 * passa `(valor, indice, array)`: o indice vira `passo`, o primeiro elemento
 * divide por ZERO e sai `NaN`. Um `NaN` daqui viaja ate a coluna `numeric` como
 * coordenada, e o bloco some do papel sem erro em lugar nenhum.
 */
export const naGrade = (v: number, passo = PASSO_MM): number => {
  const p = Number.isFinite(passo) && passo > 0 ? passo : PASSO_MM;
  return Math.round(Math.round(v / p) * p * 10) / 10;
};

/** Tamanho minimo de um bloco. Menor que isto e um bloco que nao da para pegar. */
export const MINIMO_MM = 5;

type Geometria = { x_mm: number; y_mm: number; largura_mm: number; altura_mm: number };

/**
 * ARRASTAR: move sem deixar sair da area imprimivel.
 *
 * PRENDE A POSICAO, NAO O TAMANHO - e essa e a decisao. Encolher o bloco quando
 * ele encosta na borda seria "consertar" o arrasto mudando outra coisa, e a
 * pessoa veria o bloco mudar de tamanho sozinho ao passar perto da margem.
 * Bloco maior que a area nao se move: nao ha posicao valida, e mexer nele e
 * trabalho do redimensionamento.
 */
export function arrastar(g: Geometria, dx_mm: number, dy_mm: number, area: Retangulo): Geometria {
  const maxX = area.x_mm + area.largura_mm - g.largura_mm;
  const maxY = area.y_mm + area.altura_mm - g.altura_mm;
  return {
    ...g,
    x_mm: naGrade(Math.min(Math.max(g.x_mm + dx_mm, area.x_mm), Math.max(maxX, area.x_mm))),
    y_mm: naGrade(Math.min(Math.max(g.y_mm + dy_mm, area.y_mm), Math.max(maxY, area.y_mm))),
  };
}

/**
 * As oito alcas, por NOME e nao por ponto cardeal.
 *
 * A primeira versao usava `'e' | 'd' | 'n' | 's' | 'ne' | 'no' | ...`, e o `e`
 * significava *esquerda* nas simples e podia ser lido como *este* nas
 * diagonais - duas convencoes na mesma uniao de tipos. E a classe de confusao
 * que produz exatamente o defeito que a `W5` persegue: a alca move o lado
 * errado e o bloco foge do cursor. Nome inteiro nao tem esse problema.
 */
export type Aresta =
  | 'esquerda' | 'direita' | 'topo' | 'base'
  | 'topo-esquerda' | 'topo-direita' | 'base-esquerda' | 'base-direita';

/**
 * REDIMENSIONAR por uma alca. A alca OPOSTA fica parada.
 *
 * E o comportamento que todo editor tem e que ninguem escreve, entao a `W5` o
 * afirma: puxar a borda esquerda move `x` E muda `largura`, e a borda direita
 * nao sai do lugar. Trocar os dois sinais produz um bloco que foge do cursor, e
 * isso e invisivel em revisao de codigo.
 *
 * Os dois `Math.min` contra `MINIMO_MM` sao o que impede a borda de atravessar
 * a oposta e o bloco de nascer com largura negativa.
 */
export function redimensionar(
  g: Geometria, aresta: Aresta, dx_mm: number, dy_mm: number, area: Retangulo,
): Geometria {
  const bordaDireita = g.x_mm + g.largura_mm;
  const bordaBase = g.y_mm + g.altura_mm;
  const limiteDireita = area.x_mm + area.largura_mm;
  const limiteBase = area.y_mm + area.altura_mm;
  let { x_mm, y_mm, largura_mm, altura_mm } = g;

  if (aresta.includes('esquerda')) {
    const novoX = Math.min(Math.max(g.x_mm + dx_mm, area.x_mm), bordaDireita - MINIMO_MM);
    x_mm = novoX;
    largura_mm = bordaDireita - novoX;
  }
  if (aresta.includes('direita')) {
    largura_mm = Math.max(Math.min(g.largura_mm + dx_mm, limiteDireita - g.x_mm), MINIMO_MM);
  }
  if (aresta.includes('topo')) {
    const novoY = Math.min(Math.max(g.y_mm + dy_mm, area.y_mm), bordaBase - MINIMO_MM);
    y_mm = novoY;
    altura_mm = bordaBase - novoY;
  }
  if (aresta.includes('base')) {
    altura_mm = Math.max(Math.min(g.altura_mm + dy_mm, limiteBase - g.y_mm), MINIMO_MM);
  }
  return {
    x_mm: naGrade(x_mm), y_mm: naGrade(y_mm),
    largura_mm: naGrade(largura_mm), altura_mm: naGrade(altura_mm),
  };
}

/**
 * A ESCALA DA PREVIA: quantos pixels vale um milimetro na tela.
 *
 * A previa e a MESMA geometria do papel, so escalada - e e isso que conserta o
 * ponto 4 do plano. Antes a tela usava `max-width: 800px; padding: 32px` e o
 * papel usava margem de 16 mm: duas geometrias diferentes, entao a previa nao
 * respondia "e assim que vai sair?".
 *
 * Teto em 1 (nao amplia): esticar A4 numa tela larga mostraria tipografia maior
 * do que a impressa, que e o erro oposto e igualmente enganoso.
 */
export function escalaDaPrevia(larguraDisponivelPx: number, larguraDaFolhaMm: number): number {
  const PX_POR_MM = 96 / 25.4;      // 96 dpi CSS, a definicao do `mm` no browser
  const natural = larguraDaFolhaMm * PX_POR_MM;
  if (larguraDisponivelPx <= 0 || natural <= 0) return 1;
  return Math.min(1, larguraDisponivelPx / natural);
}

/**
 * A REGRA `@page`, e ela e o conserto do ponto 3 do plano.
 *
 * Sem `size`, o navegador usa o padrao do SISTEMA de quem imprime - a mesma
 * fatura sai com geometria diferente em duas maquinas, e nada registra qual foi
 * usada. Com o papel declarado, o PDF sai igual em qualquer lugar.
 *
 * `margin: 0` e deliberado: as margens do tenant ja estao nas coordenadas dos
 * blocos. Somar as duas margens as aplicaria duas vezes.
 */
export function regraDaPagina(cssDoPapel: string, orientacao: string): string {
  return `@page { size: ${cssDoPapel} ${orientacao === 'paisagem' ? 'landscape' : 'portrait'}; margin: 0; }`;
}

/**
 * Um bloco novo, colocado no canto superior esquerdo da area util.
 *
 * NAO no centro, e nao sob o cursor: o canto e previsivel, e um bloco que nasce
 * no centro nasce POR CIMA do que ja estiver la - o que gera um aviso de
 * sobreposicao no primeiro clique de quem esta so experimentando.
 */
export function blocoNovo(tipo: string, area: Retangulo): Geometria & { tipo: string } {
  const largura_mm = naGrade(Math.min(60, area.largura_mm));
  const altura_mm = naGrade(Math.min(tipo === 'linha' ? 1 : 20, area.altura_mm));
  return { tipo, x_mm: naGrade(area.x_mm), y_mm: naGrade(area.y_mm), largura_mm, altura_mm };
}
