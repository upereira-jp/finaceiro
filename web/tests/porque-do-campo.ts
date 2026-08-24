// O PORQUE AO LADO DO CAMPO — a ligacao entre a tela e o texto, verificada.
// Uso: node --experimental-strip-types web/tests/porque-do-campo.ts
//
// ============================================================================
// O QUE ESTA SUITE PRENDE, e o modo de falha e mudo dos dois lados
//
// Desde 24/08/2026 um campo de formulario pode carregar o POR QUE daquele dado:
// `<Campo rotulo="Chave Pix" porqueDe="dono-usina" />`. A chave e o `id` de um
// assunto da ajuda, e o texto sai de `porques.ts` - um texto so, lido pela
// central de ajuda e pela tela.
//
// A ligacao e por STRING, e string combinada sem verificacao envelhece calada:
//
//   chave que nao existe    `PorqueDoCampo` devolve null e o botao simplesmente
//                           NAO APARECE. A tela nao quebra, o `tsc` nao reclama,
//                           e o campo volta a ser preenchido no chute - que e
//                           exatamente o que este recurso existe para evitar;
//   texto que ficou orfao   alguem renomeia o assunto na ajuda e as telas que
//                           apontavam para ele emudecem todas de uma vez.
//
// LE OS ARQUIVOS COMO TEXTO, e nao os importa - as telas sao `.tsx` e o runner
// do `web/` e `node --experimental-strip-types`, que nao le JSX. Mesmo desenho
// de `tests/prontidao-destino.ts`: a lista sai da FONTE, e nao de uma copia
// escrita aqui que envelheceria na primeira tela nova.

import { readdirSync, readFileSync } from 'node:fs';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const SRC = new URL('../src/', import.meta.url);
const ler = (rel: string) => readFileSync(new URL(rel, SRC), 'utf8');

// ------------------------------------------------------ as chaves que existem
const fonte = ler('porques.ts');
const CHAVES = [...fonte.matchAll(/^  '([a-z0-9-]+)':$/gm)].map((m) => m[1]!);

chk('PC1', CHAVES.length >= 12,
    `porques.ts define ${CHAVES.length} explicacoes — se este numero desabar, o recorte deste `
    + 'teste parou de casar com o fonte e ele passou a nao medir nada');

chk('PC1b', CHAVES.length === new Set(CHAVES).size,
    'nenhuma chave repetida — a segunda calaria a primeira sem aviso');

// ------------------------------------------------- todo texto diz o que quebra
//
// O piso existe porque "porque sim" caberia no campo e passaria. Nao mede
// qualidade; mede que alguem escreveu uma frase de verdade.
//
// A EXTRACAO PERCORRE `CHAVES` E NAO UM SEGUNDO PADRAO, e isso foi consertado no
// mesmo dia em que a suite nasceu: a primeira versao casava entrada por entrada
// com um lookahead, e o lookahead nao alcancava as duas entradas separadas por
// linha em branco depois de um comentario. Resultado: PC1 dizia 15 e PC2
// conferia 13, passando verde sobre duas que nunca foram olhadas.
//
// Um teste que mede menos do que afirma e pior que teste nenhum - ele autoriza.
// Por isso a contagem virou verificacao (PC2b) em vez de ficar implicita.
let conferidos = 0;
for (const chave of CHAVES) {
  const ini = fonte.indexOf(`\n  '${chave}':\n`);
  const resto = fonte.slice(ini + chave.length + 6);
  const fim = resto.indexOf("',\n");
  const texto = resto.slice(0, fim).replace(/\s*\+\s*/g, ' ').replace(/'/g, '').trim();
  conferidos++;
  chk('PC2', texto.length > 80, `${chave}: a explicacao tem corpo (${texto.length} caracteres)`);
}
chk('PC2b', conferidos === CHAVES.length,
    `as ${CHAVES.length} explicacoes foram conferidas uma a uma (${conferidos}) — se este numero `
    + 'ficar abaixo do de PC1, a suite esta passando verde sobre texto que nunca leu');

// ------------------------------------------- todo `porqueDe=` acha o texto
const TELAS = readdirSync(new URL('telas/', SRC)).filter((f) => f.endsWith('.tsx')).sort();
chk('PC3', TELAS.length >= 12, `ha ${TELAS.length} telas para varrer`);

let usados = 0;
const orfaos: string[] = [];
for (const arq of TELAS) {
  const src = ler(`telas/${arq}`);
  for (const m of src.matchAll(/porqueDe="([a-z0-9-]+)"/g)) {
    usados++;
    if (!CHAVES.includes(m[1]!)) orfaos.push(`${arq}: ${m[1]}`);
  }
}

chk('PC4', orfaos.length === 0,
    `todo porqueDe de tela acha texto em porques.ts — chave errada some o botao em silencio `
    + `(orfaos: ${orfaos.join(', ') || 'nenhum'})`);

chk('PC4b', usados > 0,
    `${usados} campo(s) de formulario carregam o porque ao lado — zero aqui significaria que o `
    + 'recurso existe no componente e nao esta em tela nenhuma');

// -------------------------------- o componente le do lugar certo, e nao de uma copia
const ui = ler('ui.tsx');
chk('PC5', /import \{ PORQUE \} from '\.\/porques\.ts'/.test(ui),
    'o campo le PORQUE de `porques.ts` — a mesma fonte da central de ajuda, e nao uma copia');
chk('PC5b', !/porque\w*\s*[:=]\s*'Porque /i.test(ui),
    'e nao ha explicacao escrita dentro do ui.tsx: duas copias da mesma frase divergem na '
    + 'primeira correcao, e as duas parecem certas');

// ------------------------------- a central de ajuda le a MESMA fonte
const ajuda = ler('ajuda.ts');
chk('PC6', /import \{ PORQUE \} from '\.\/porques\.ts'/.test(ajuda)
        && /porque: PORQUE\['/.test(ajuda),
    'a central de ajuda tambem le de `porques.ts` — se um dos dois lados voltar a escrever o '
    + 'texto inline, a divergencia comeca ali');

console.log();
if (falhas > 0) { console.log(`--- porque do campo: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- porque do campo (a ligacao tela <-> texto): ${feitas} verificacoes, 0 falhas`);
