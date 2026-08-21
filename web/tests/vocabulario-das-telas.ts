// O VOCABULARIO DAS DOZE TELAS — a mesma regra que a ajuda ja obedecia, agora
// valendo para o sistema inteiro.
// Uso: node --experimental-strip-types web/tests/vocabulario-das-telas.ts
//
// ============================================================================
// O VAO QUE ESTA SUITE FECHA, e ele era grande
//
// Em 21/08/2026 o texto da CENTRAL DE AJUDA era o unico guardado contra jargao:
// `V4` (em `ajuda.ts`) mede os verbetes e os assuntos, `R9` (em
// `caso-render.tsx`) mede o HTML que o painel monta. Nenhum dos dois olha para
// as telas — e as telas sao onde a pessoa passa o dia.
//
// A primeira varredura achou **23 trechos em 7 das 12 telas**, e o retrato era
// exatamente o que se esperaria de um vao sem medicao:
//
//   a PRIMEIRA tela      "Contando as camadas…" era a primeira frase que um
//                        usuario novo lia no sistema, e "Camadas pendentes" era
//                        o titulo de um cartao. "Camada" e o nome da estrutura
//                        interna do relatorio — a propria `V4` o proibe;
//   a ORDEM, em Clientes a unica linha acionavel do aviso ("digite na coluna
//                        Documento") vinha DEPOIS de tres identificadores
//                        internos e antes de um comando de terminal;
//   dois SUBTITULOS      Usinas e Faturas explicavam a divisao do dinheiro com a
//                        palavra "split", que a `GLOSSARIO.md` proibe usar
//                        sozinha porque colide com o split payment tributario.
//
// ============================================================================
// A REGRA E CUMPRIVEL PORQUE EXISTE UM LUGAR PARA O JARGAO
//
// Esta suite NAO manda apagar codigo de questao nem comando em lote: ela manda
// GUARDA-LOS. `<DetalheTecnico>` (em `ui.tsx`) e recortado antes da varredura, e
// isso e o desenho inteiro — a decisao do dono foi "esconder, nao remover", e uma
// regra que obrigasse a remover seria desobedecida na primeira vez que alguem
// precisasse do ponteiro.
//
// Quem escreve texto de tela tem, entao, duas saidas legitimas e nenhuma
// terceira: dizer em portugues, ou por dentro do `<DetalheTecnico>`.
//
// ============================================================================
// POR QUE LE O ARQUIVO COMO TEXTO em vez de montar o componente
//
// O runner do `web/` e `node --experimental-strip-types`, que nao le JSX — o
// mesmo motivo que empurrou toda regra para fora do `.tsx` neste projeto. Ler
// como texto tem um custo declarado: e uma APROXIMACAO do que a tela mostra, nao
// o HTML final. Ela erra para o lado seguro em dois pontos conhecidos, e os dois
// estao tratados abaixo (`${...}` de dado e `className`).
//
// O precedente e `tests/prontidao-destino.ts`, que le o arquivo do servidor como
// texto para conferir a lista de camadas.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ler = (rel: string) => readFileSync(SRC + rel, 'utf8');

// ============================================================================
// O QUE A PESSOA LE
// ============================================================================

/** Comentario fora, e as quebras de linha preservadas para o numero da linha do
 *  achado continuar apontando para o lugar certo. */
const semComentario = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/(?<!:)\/\/[^\n]*/g, '');

/**
 * O `<DetalheTecnico>` E A EXCECAO, e a unica.
 *
 * Recortado inteiro: e a forma suportada de manter codigo de questao, nome de
 * coluna e comando em lote. Ele nasce fechado, entao nada disso e a primeira
 * coisa que alguem le — que era o defeito, e nao a existencia do ponteiro.
 */
const semDetalheTecnico = (src: string): string =>
  src.replace(/<DetalheTecnico>[\s\S]*?<\/DetalheTecnico>/g,
              (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));

/** Interpolacao de DADO nao e texto da tela: `${u.codigo_geradora}` vira o codigo
 *  da usina para quem le, e nao o nome da coluna. Sem este corte a suite acusaria
 *  o proprio dado de ser jargao. */
const semInterpolacao = (t: string): string => t.replace(/\$\{[^}]*\}/g, '');

/**
 * NOME DE ICONE NAO E TEXTO DE TELA, e este corte foi pago na primeira execucao:
 * `<Icone nome="abrir_menu" />` caiu na regra de snake_case duas vezes no
 * `ui.tsx`. O `nome` de um `<Icone>` e uma chave da uniao fechada de
 * `iconografia.ts` — ninguem o le, e o compilador ja recusa um valor invalido.
 *
 * O `nome` de um `<Kpi>`, ao contrario, E o titulo do cartao. Por isso o corte e
 * pelo ELEMENTO e nao pela propriedade: some o `<Icone>` inteiro e a propriedade
 * `icone=` de quem a recebe, e `nome=` segue medido em todo o resto.
 */
const semIcones = (src: string): string =>
  src
    .replace(/<Icone\b[^>]*\/?>/g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/\bicone=(?:"[^"]*"|\{[^}]*\})/g, '');

/** As propriedades que carregam texto para a pessoa. `className` e `key` ficam
 *  fora por definicao — sao para o navegador. */
const PROPS = [
  'titulo', 'sub', 'rotulo', 'rotuloTexto', 'rotuloAcessivel', 'dica', 'texto',
  'nome', 'placeholder', 'title', 'label', 'aria-label', 'primeira', 'confirmLabel',
  /*
   * `vazio` ENTROU EM 21/08/2026, e a ausencia dele tinha custo medido.
   *
   * E o texto que a tabela mostra quando NAO ha linha - ou seja, exatamente o
   * que quem abre o sistema pela primeira vez le, porque no comeco toda tabela
   * esta vazia. Ele nao estava na lista, e a varredura passava verde por cima de
   * tres frases que a propria lista de proibidos condena:
   *
   *   usinas      "Sem regra de repasse - o split levanta."
   *   relatorios  "...o split so roda quando uma fatura e liquidada (PRD 5.2)."
   *   relatorios  "...a prontidao acusa (camada `originador_do_contrato`)."
   *
   * Duas com "split", uma com "prontidao", uma com "camada" e uma com nome de
   * coluna. A licao e a de sempre neste projeto: a regra vale onde ela E MEDIDA,
   * e uma propriedade fora da lista e uma regra que nao existe ali.
   */
  'vazio',
];

/** (linha, texto) de tudo o que a tela EXIBE — as propriedades de rotulo e o
 *  texto solto entre tags. */
function visiveis(src: string): Array<[number, string]> {
  const saida: Array<[number, string]> = [];
  const linhaDe = (i: number) => (src.slice(0, i).match(/\n/g) ?? []).length + 1;

  const props = new RegExp(
    `\\b(${PROPS.join('|')})=(?:"([^"]{2,})"|\\{"([^"]{2,})"\\}|\\{\`([^\`]{2,})\`\\})`, 'g');
  for (const m of src.matchAll(props)) {
    saida.push([linhaDe(m.index), m[2] ?? m[3] ?? m[4] ?? '']);
  }
  for (const m of src.matchAll(/>\s*([^<>{}\n]{4,})\s*</g)) {
    const t = m[1]!.trim();
    if (/[A-Za-zÀ-ÿ]/.test(t)) saida.push([linhaDe(m.index), t]);
  }
  return saida;
}

// ============================================================================
// O QUE NAO PODE APARECER
// ============================================================================

/**
 * A MESMA LISTA DA `V4`, e ela e a mesma DE PROPOSITO.
 *
 * Duas listas divergiriam, e a divergencia teria uma forma previsivel: a ajuda
 * ficaria limpa e as telas acumulariam excecoes, porque e nas telas que o dev
 * escreve com pressa. Se um termo passar a ser aceitavel, ele tem de ser
 * aceitavel nos dois lugares — ou nao e.
 */
const PROIBIDO: Array<[RegExp, string]> = [
  [/\bR\d{1,2}\b/, 'codigo de regra (R9, R25) — nao significa nada para quem opera'],
  [/\bQ-[A-Z]/, 'codigo de questao (Q-PAGADOR-01) — e rastreio interno'],
  [/npm run/, 'comando de terminal — quem abre a tela nao tem o repositorio clonado'],
  [/\bADR-\d/, 'numero de decisao de arquitetura'],
  [/\bsplit\b/i, 'a GLOSSARIO.md proibe usar "split" sozinho: colide com o split payment tributario'],
  [/\bprontid[aã]o\b/i, 'o nome interno do calculo; na tela a palavra e "Pendencias"'],
  [/\bcamadas?\b/i, 'nome da estrutura interna do relatorio'],
  [/\btiers?\b/i, 'jargao de comissionamento'],
  [/\bUC\b/, 'sigla — a tela diz "unidade" ou "unidade consumidora"'],
  [/(?<![\w/])[a-z]{3,}_[a-z]{3,}(?![\w/])/, 'nome de coluna em snake_case'],
];

// ============================================================================
// T1 — as doze telas
// ============================================================================

const TELAS = readdirSync(SRC + 'telas').filter((f) => f.endsWith('.tsx')).sort();

chk('T0', TELAS.length >= 12,
    `ha ${TELAS.length} arquivos de tela para varrer — a suite nao esta olhando para uma pasta vazia`);

for (const arq of TELAS) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(`telas/${arq}`))));
  const achados: string[] = [];

  for (const [linha, cru] of visiveis(src)) {
    const txt = semInterpolacao(cru);
    for (const [regra, porque] of PROIBIDO) {
      const m = regra.exec(txt);
      if (m) { achados.push(`${arq}:${linha} "${m[0]}" (${porque}) em «${txt.slice(0, 60)}»`); break; }
    }
  }

  chk('T1', achados.length === 0,
      `${arq}: nenhum jargao no texto exibido${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T2 — o chrome, que aparece em TODA tela
// ============================================================================
//
// `ui.tsx` e `app.tsx` desenham a barra, os avisos, os botoes e os vazios de
// tabela. Um rotulo errado ali aparece doze vezes, e nao uma.

for (const arq of ['ui.tsx', 'app.tsx']) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(arq))));
  const achados: string[] = [];
  for (const [linha, cru] of visiveis(src)) {
    const txt = semInterpolacao(cru);
    for (const [regra, porque] of PROIBIDO) {
      const m = regra.exec(txt);
      if (m) { achados.push(`${arq}:${linha} "${m[0]}" (${porque})`); break; }
    }
  }
  chk('T2', achados.length === 0,
      `${arq}: o que aparece em toda tela tambem esta em portugues${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T3 — o esconderijo existe, e e um so
// ============================================================================
//
// A regra acima so e cumprivel porque ha onde guardar o ponteiro. Se
// `DetalheTecnico` sumir do `ui.tsx`, a proxima pessoa que precisar de um codigo
// de questao na tela nao tera saida legitima — e a suite passaria verde enquanto
// o jargao voltasse a ser escrito em outro lugar qualquer.

{
  const ui = ler('ui.tsx');
  chk('T3', /export function DetalheTecnico/.test(ui),
      '`DetalheTecnico` existe em `ui.tsx` — e o unico lugar suportado para codigo de questao, '
      + 'nome de coluna e comando em lote');
  chk('T3b', /ocultar detalhe t[ée]cnico/.test(ui) && /ver detalhe t[ée]cnico/.test(ui),
      'e ele se anuncia com as duas palavras, aberto e fechado');
}

{
  // O bloco tem de ser USADO, e nao so existir: o valor da regra e o jargao ter
  // descido para dentro dele nas telas que o tinham na superficie.
  const usam = TELAS.filter((f) => /<DetalheTecnico>/.test(ler(`telas/${f}`)));
  chk('T3c', usam.length >= 4,
      `${usam.length} tela(s) guardam o detalhe tecnico atras do clique (${usam.join(', ')})`);
}

// ============================================================================
// T4 — nenhuma tela manda rodar comando, em lugar nenhum
// ============================================================================
//
// Esta e a unica regra que NAO aceita o esconderijo, e a diferenca e de
// natureza: as outras proibem uma PALAVRA no lugar errado; esta proibe uma
// INSTRUCAO impossivel. Quem abre a tela nao tem o repositorio clonado nem o
// `.env` na mao — mandar rodar `npm run` como PROXIMO PASSO e um beco, mesmo
// escrito em portugues perfeito.
//
// Dentro do `DetalheTecnico` o mesmo comando e legitimo: la ele e informacao
// para quem tem o repositorio, e nao instrucao para quem nao tem.

for (const arq of TELAS) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(`telas/${arq}`))));
  const linhas = visiveis(src).filter(([, t]) => /npm run/.test(t));
  chk('T4', linhas.length === 0,
      `${arq}: nao manda rodar comando na superficie${linhas.length ? ` — ACHADO na(s) linha(s) ${linhas.map(([l]) => l).join(', ')}` : ''}`);
}

console.log();
if (falhas > 0) { console.log(`--- vocabulario das telas: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- vocabulario das telas (jargao no texto exibido): ${feitas} verificacoes, 0 falhas`);
