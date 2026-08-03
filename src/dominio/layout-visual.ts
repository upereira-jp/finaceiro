// O LAYOUT DA FATURA POR POSICAO. Funcao pura: recebe a folha, os blocos e os
// dados da fatura, devolve o documento com cada elemento JA POSICIONADO e JA
// formatado. Migration 23, `PLANO-layout-visual-2026-08-03.md`.
//
// POR QUE ISTO E DADO E NAO DESENHO, e e a restricao que manda no arquivo todo.
//
// A decisao 4 da `Q-DOCFATURA-01` foi "entrega manual agora, com a rota do CRM ja
// preparada", e o CRM nao roda React. Entao o editor nao desenha o documento: ele
// GRAVA UM LAYOUT, e a composicao devolve blocos posicionados que qualquer
// consumidor pinta com posicionamento absoluto - a nossa SPA, o CRM, ou um
// gerador de PDF que ainda nao existe.
//
// E ISSO CONSERTA UM DEFEITO QUE JA ESTAVA LA. `web/src/telas/documento.tsx`
// punha o `valor_total_centavos` em negrito 18px, e essa decisao NAO estava no
// dado que `paraFatura` devolve - o CRM, consumindo a mesma rota, teria a mesma
// fatura sem o negrito. Dois lados, nenhum parecendo errado, que e o modo de
// falha que `web/src/contas-regras.ts` ja tinha registrado. Apresentacao que
// mora so num dos consumidores nao e apresentacao do documento: e do consumidor.
//
// MILIMETRO, E NAO PIXEL NEM PORCENTAGEM. Papel e milimetro. Pixel depende de
// DPI; porcentagem faria o mesmo layout mudar de proporcao entre A4 e A5, e
// escolher a folha e justamente o pedido. A regra 1 vale aqui na segunda
// metade: milimetro e grandeza fisica, mantem escala decimal e NUNCA vira
// centavos.

import {
  linhasDoDocumento, type CampoDeFatura, type ConfiguracaoDeCampo,
  type DadosDaFatura, type LinhaDoDocumento, type TipoDeValor,
} from './layout-do-documento.ts';

// ------------------------------------------------------------------- a folha

/** Os quatro papeis do enum `papel_do_documento` da migration 23. */
export type Papel = 'a4' | 'a5' | 'carta' | 'oficio';
export type Orientacao = 'retrato' | 'paisagem';

/**
 * As medidas, em MILIMETROS e em codigo.
 *
 * Nao vao para o banco pela mesma razao que o `PADRAO` de campos nao vai: um
 * valor semeado em migration decide por todo tenant futuro, e estas medidas sao
 * norma internacional, nao configuracao. O enum no banco valida QUAL papel; a
 * medida de cada um mora aqui, visivel e versionada.
 *
 * ISO 216 para A4 e A5; ANSI/uso americano para Carta; e o oficio brasileiro
 * (216x330), que nao e o Legal americano (216x356) - a diferenca e 26 mm e ela
 * apareceria como um rodape cortado.
 */
export const PAPEIS: Readonly<Record<Papel, { largura_mm: number; altura_mm: number; rotulo: string; css: string }>> = {
  a4:     { largura_mm: 210, altura_mm: 297, rotulo: 'A4 (210 × 297 mm)',     css: 'A4' },
  a5:     { largura_mm: 148, altura_mm: 210, rotulo: 'A5 (148 × 210 mm)',     css: 'A5' },
  carta:  { largura_mm: 216, altura_mm: 279, rotulo: 'Carta (216 × 279 mm)',  css: 'Letter' },
  oficio: { largura_mm: 216, altura_mm: 330, rotulo: 'Ofício (216 × 330 mm)', css: '216mm 330mm' },
};

export type Folha = {
  papel: Papel;
  orientacao: Orientacao;
  margem_topo_mm: number;
  margem_direita_mm: number;
  margem_baixo_mm: number;
  margem_esquerda_mm: number;
};

/**
 * A folha padrao. 16 mm de margem nos quatro lados e A4 retrato - os mesmos
 * 16 mm que `web/src/estilo.ts` ja usava no `@page`, para que quem nunca abrir o
 * editor imprima exatamente o que imprimia antes.
 */
export const FOLHA_PADRAO: Folha = {
  papel: 'a4', orientacao: 'retrato',
  margem_topo_mm: 16, margem_direita_mm: 16, margem_baixo_mm: 16, margem_esquerda_mm: 16,
};

export type Retangulo = { x_mm: number; y_mm: number; largura_mm: number; altura_mm: number };

/** A folha em milimetros, com a orientacao JA aplicada. */
export function medidasDaFolha(f: Folha): { largura_mm: number; altura_mm: number } {
  const p = PAPEIS[f.papel] ?? PAPEIS.a4;
  return f.orientacao === 'paisagem'
    ? { largura_mm: p.altura_mm, altura_mm: p.largura_mm }
    : { largura_mm: p.largura_mm, altura_mm: p.altura_mm };
}

/**
 * O RETANGULO IMPRIMIVEL - papel menos margens.
 *
 * E contra ele que a validacao roda, e nao contra o papel: um bloco dentro do
 * papel mas dentro da margem imprime em impressora nenhuma da faixa comum, e
 * descobrir isso no papel e o que este arquivo existe para evitar.
 */
export function areaImprimivel(f: Folha): Retangulo {
  const { largura_mm, altura_mm } = medidasDaFolha(f);
  return {
    x_mm: f.margem_esquerda_mm,
    y_mm: f.margem_topo_mm,
    largura_mm: largura_mm - f.margem_esquerda_mm - f.margem_direita_mm,
    altura_mm: altura_mm - f.margem_topo_mm - f.margem_baixo_mm,
  };
}

// ------------------------------------------------------------------ os blocos

/** Os seis valores do enum `tipo_de_bloco` da migration 23. */
export type TipoDeBloco = 'tabela_de_campos' | 'campo' | 'texto' | 'logo' | 'pagamento' | 'linha';
export type Alinhamento = 'esquerda' | 'centro' | 'direita';
export type Peso = 'normal' | 'forte';

export type Bloco = {
  id: string;
  tipo: TipoDeBloco;
  /** So em `tipo = 'campo'`. O CHECK do banco garante a exclusividade. */
  campo: CampoDeFatura | null;
  /** So em `tipo = 'texto'`. */
  texto: string | null;
  x_mm: number; y_mm: number; largura_mm: number; altura_mm: number;
  alinhamento: Alinhamento;
  tamanho_pt: number;
  peso: Peso;
  borda: boolean;
  fundo: boolean;
  /** Ordem de pintura. Maior por cima. */
  z: number;
};

/**
 * O LAYOUT PADRAO, e ele reproduz o documento que a tela ja pintava.
 *
 * `bloco_do_documento` vazio NAO significa documento vazio - e o mesmo argumento
 * do `PADRAO` de campos, e a migration 23 tambem nao semeia nada. Quem nunca
 * abrir o editor imprime o que imprimia antes: logo em cima a esquerda, titulo e
 * competencia a direita, a tabela no meio, o pagamento embaixo.
 *
 * As medidas sao as do A4 com 16 mm de margem - area imprimivel de 178 x 265 mm.
 * Num papel menor os blocos passam a acusar `fora_da_pagina`, e isso e o certo:
 * trocar de papel sem reposicionar E uma mudanca que precisa ser vista.
 */
export function layoutPadrao(): Bloco[] {
  const b = (o: Partial<Bloco> & { id: string; tipo: TipoDeBloco; x_mm: number; y_mm: number;
                                   largura_mm: number; altura_mm: number }): Bloco => ({
    campo: null, texto: null, alinhamento: 'esquerda', tamanho_pt: 10,
    peso: 'normal', borda: false, fundo: false, z: 0, ...o,
  });
  return [
    b({ id: 'padrao-logo',      tipo: 'logo',             x_mm: 16,  y_mm: 16, largura_mm: 60,  altura_mm: 20 }),
    b({ id: 'padrao-titulo',    tipo: 'texto',            x_mm: 114, y_mm: 16, largura_mm: 80,  altura_mm: 12,
        texto: 'FATURA', alinhamento: 'direita', tamanho_pt: 16, peso: 'forte' }),
    b({ id: 'padrao-linha',     tipo: 'linha',            x_mm: 16,  y_mm: 40, largura_mm: 178, altura_mm: 1 }),
    b({ id: 'padrao-tabela',    tipo: 'tabela_de_campos', x_mm: 16,  y_mm: 46, largura_mm: 178, altura_mm: 120 }),
    b({ id: 'padrao-pagamento', tipo: 'pagamento',        x_mm: 16,  y_mm: 174, largura_mm: 178, altura_mm: 90 }),
  ];
}

// ------------------------------------------------------------- as conferencias

export type ProblemaDeLayout =
  | { tipo: 'fora_da_pagina'; blocoId: string; detalhe: string }
  | { tipo: 'sobreposicao'; blocoId: string; comBlocoId: string; detalhe: string }
  | { tipo: 'sem_conteudo'; blocoId: string; detalhe: string };

const mm = (v: number) => Math.round(v * 10) / 10;

/**
 * UM BLOCO CABE NA AREA IMPRIMIVEL?
 *
 * Devolve `null` quando cabe. `fora_da_pagina` e ERRO e nao sinal - a diferenca
 * em relacao a `sobreposicao` e que aqui nao ha leitura em que o usuario esteja
 * certo: um bloco fora do papel simplesmente nao imprime. O repositorio recusa.
 */
export function foraDaPagina(bloco: Bloco, folha: Folha): ProblemaDeLayout | null {
  const a = areaImprimivel(folha);
  const dir = bloco.x_mm + bloco.largura_mm;
  const base = bloco.y_mm + bloco.altura_mm;
  const limiteDir = a.x_mm + a.largura_mm;
  const limiteBase = a.y_mm + a.altura_mm;

  const faltas: string[] = [];
  if (bloco.x_mm < a.x_mm)  faltas.push(`comeca em x=${mm(bloco.x_mm)}mm, antes da margem esquerda (${mm(a.x_mm)}mm)`);
  if (bloco.y_mm < a.y_mm)  faltas.push(`comeca em y=${mm(bloco.y_mm)}mm, acima da margem superior (${mm(a.y_mm)}mm)`);
  if (dir > limiteDir)      faltas.push(`termina em x=${mm(dir)}mm e a area imprimivel acaba em ${mm(limiteDir)}mm`);
  if (base > limiteBase)    faltas.push(`termina em y=${mm(base)}mm e a area imprimivel acaba em ${mm(limiteBase)}mm`);
  if (bloco.largura_mm <= 0 || bloco.altura_mm <= 0) faltas.push('tem largura ou altura zero');

  if (faltas.length === 0) return null;
  return {
    tipo: 'fora_da_pagina', blocoId: bloco.id,
    detalhe: `o bloco ${faltas.join('; ')}. Papel ${folha.papel} ${folha.orientacao}, `
           + `area imprimivel ${mm(a.largura_mm)}x${mm(a.altura_mm)}mm.`,
  };
}

const seSobrepoe = (a: Bloco, b: Bloco): boolean =>
  a.x_mm < b.x_mm + b.largura_mm && b.x_mm < a.x_mm + a.largura_mm &&
  a.y_mm < b.y_mm + b.altura_mm && b.y_mm < a.y_mm + a.altura_mm;

/**
 * TODAS as conferencias de um layout. Erro e sinal saem JUNTOS e distinguidos
 * pelo `tipo` - quem chama decide o que recusa.
 *
 * `sobreposicao` e SINAL e nao recusa, e a razao e a mesma da R21-b: sobrepor
 * pode ser intencional - uma tarja atras de um valor, uma moldura em volta da
 * tabela - e recusar decidiria pelo usuario o que ele quer no papel dele. O que
 * nao pode e ele descobrir por acidente.
 */
export function conferirLayout(folha: Folha, blocos: readonly Bloco[]): ProblemaDeLayout[] {
  const problemas: ProblemaDeLayout[] = [];

  for (const b of blocos) {
    const fora = foraDaPagina(b, folha);
    if (fora) problemas.push(fora);

    // Bloco que nao pinta nada. Nao e erro de geometria - e um bloco que ocupa
    // area e nao mostra coisa alguma, o que so se descobre imprimindo.
    if (b.tipo === 'texto' && !b.texto?.trim()) {
      problemas.push({ tipo: 'sem_conteudo', blocoId: b.id, detalhe: 'bloco de texto sem texto' });
    }
    if (b.tipo === 'campo' && !b.campo) {
      problemas.push({ tipo: 'sem_conteudo', blocoId: b.id, detalhe: 'bloco de campo sem campo escolhido' });
    }
  }

  for (let i = 0; i < blocos.length; i++) {
    for (let j = i + 1; j < blocos.length; j++) {
      const a = blocos[i]!, b = blocos[j]!;
      // `linha` e separador e atravessa por desenho: acusa-la seria ruido em
      // todo layout que use filete, e o criterio de ruido deste projeto ja esta
      // escrito na R25.
      if (a.tipo === 'linha' || b.tipo === 'linha') continue;
      if (seSobrepoe(a, b)) {
        problemas.push({
          tipo: 'sobreposicao', blocoId: a.id, comBlocoId: b.id,
          detalhe: `os blocos ocupam a mesma area. Nao e recusa - sobrepor pode ser intencional -, `
                 + 'mas no papel um vai cobrir o outro.',
        });
      }
    }
  }
  return problemas;
}

// ------------------------------------------------------------- a composicao

/** Um bloco pronto para pintar: geometria + conteudo JA formatado. */
export type BlocoComposto = {
  id: string;
  tipo: TipoDeBloco;
  x_mm: number; y_mm: number; largura_mm: number; altura_mm: number;
  alinhamento: Alinhamento;
  tamanho_pt: number;
  peso: Peso;
  borda: boolean;
  fundo: boolean;
  z: number;
  /** `tabela_de_campos`: as linhas, na ordem de `campo_do_documento`. */
  linhas?: LinhaDoDocumento[];
  /** `campo`: o rotulo, o valor formatado e o tipo - a mesma forma de uma linha. */
  rotulo?: string;
  valor?: string;
  tipoDeValor?: TipoDeValor;
  ausente?: boolean;
  /** `texto`: o texto do tenant, cru. */
  texto?: string;
};

export type DocumentoPosicionado = {
  folha: Folha;
  /** Papel com a orientacao aplicada - o que o `@page` e o `<div>` usam. */
  medidas: { largura_mm: number; altura_mm: number };
  area: Retangulo;
  blocos: BlocoComposto[];
  /** Erros e sinais. Vao junto com o documento, nunca em log. */
  problemas: ProblemaDeLayout[];
};

/**
 * O DOCUMENTO POSICIONADO. Junta folha + blocos + dados e devolve tudo pronto.
 *
 * `blocos` vazio cai no `layoutPadrao()`, pelo mesmo motivo que `configuracao`
 * vazia cai no `PADRAO` de campos - e as duas ausencias sao independentes: da
 * para ter layout novo com os campos padrao e vice-versa.
 *
 * NENHUM CALCULO DE ALTURA REAL DE TEXTO acontece aqui, e vale dizer por que:
 * medir texto exige fonte carregada, e este modulo e puro e roda no servidor. A
 * altura do bloco e a que o usuario deu; se o conteudo passar dela, quem pinta
 * decide (a tela recorta com `overflow: hidden` e avisa). Fingir uma medida aqui
 * seria pior que nao ter: erraria em silencio e pareceria exato.
 */
export function documentoPosicionado(
  dados: DadosDaFatura,
  folha: Folha,
  blocos: readonly Bloco[],
  campos: ReadonlyArray<ConfiguracaoDeCampo> = [],
): DocumentoPosicionado {
  const usados = blocos.length === 0 ? layoutPadrao() : [...blocos];
  const linhas = linhasDoDocumento(dados, campos);
  const porCampo = new Map(linhas.map((l) => [l.campo, l]));

  const compostos: BlocoComposto[] = usados
    .slice()
    .sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id))
    .map((b) => {
      const base: BlocoComposto = {
        id: b.id, tipo: b.tipo,
        x_mm: b.x_mm, y_mm: b.y_mm, largura_mm: b.largura_mm, altura_mm: b.altura_mm,
        alinhamento: b.alinhamento, tamanho_pt: b.tamanho_pt, peso: b.peso,
        borda: b.borda, fundo: b.fundo, z: b.z,
      };
      if (b.tipo === 'tabela_de_campos') return { ...base, linhas };
      if (b.tipo === 'texto')            return { ...base, texto: b.texto ?? '' };
      if (b.tipo === 'campo' && b.campo) {
        /*
         * CAMPO ESCONDIDO NA TABELA CONTINUA ESCONDIDO NO BLOCO, e isto e
         * deliberado: `linhasDoDocumento` ja filtrou por `visivel`, e esconder
         * e uma decisao que tem de valer para o documento inteiro. Um bloco que
         * ressuscitasse o campo escondido faria a configuracao de campos
         * significar duas coisas diferentes conforme onde se olha.
         */
        const l = porCampo.get(b.campo);
        if (!l) {
          return { ...base, rotulo: '', valor: '—', ausente: true, tipoDeValor: 'texto' as TipoDeValor };
        }
        return { ...base, rotulo: l.rotulo, valor: l.valor, tipoDeValor: l.tipo, ausente: l.ausente };
      }
      return base;   // logo, pagamento, linha: geometria so
    });

  return {
    folha,
    medidas: medidasDaFolha(folha),
    area: areaImprimivel(folha),
    blocos: compostos,
    problemas: conferirLayout(folha, usados),
  };
}
