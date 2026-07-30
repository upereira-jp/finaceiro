// A REGRA 11 NO CODIGO, por leitura do schema e dos fontes. Sem banco.
// Uso: node --experimental-strip-types tests/regra11.ts
//
// A METADE QUE O CATALOGO NAO ALCANCA. O `CAT-9` (tests/catalogo.sql) confere o
// BANCO: todo indice unico parcial tem predicado `IS NOT NULL`, e portanto
// nenhum devolve linha arbitraria. Isto aqui confere o CODIGO, que e a segunda
// consequencia de rotina que a regra 11 lista:
//
//     "Nenhum repositorio navega por indice parcial."
//
// E ela precisou virar teste porque o mecanismo que a sustentava CAIU. A regra
// afirma: "O Prisma ja exclui parcial das chaves de `findUnique` - verificado no
// DMMF". Medido em 27/07 e de novo hoje: com `previewFeatures =
// ["partialIndexes"]` ligado no generator, o `db pull` emite `where: raw(...)` e
// as chaves parciais APARECEM em `findUnique`. `Q-CLAUDE11-01`.
//
// ============================================================================
// A ARMADILHA QUE ESTA SUITE TEVE DE DESVIAR, e ela e o motivo de o teste ser
// por PAR (modelo, chave) e nao por nome de chave.
//
// `tenant_id_documento` e chave de tres modelos:
//
//     cliente        `cliente_documento_unico` e PARCIAL   -> proibido
//     originador     `originador_documento_unico` e CHEIO  -> legitimo
//     dono_usina     idem                                  -> legitimo
//
// Os dois ultimos usam `findUnique` por ela hoje, e estao certos: os comentarios
// deles ja dizem "ao contrario de cliente, onde o indice e parcial". Um teste
// que procurasse o NOME da chave acusaria os dois e treinaria o time a ignorar o
// teste - que e o argumento que o `CAT-3` ja fez sobre acusar `distribuidora`
// por nome.
//
// A LISTA DE CHAVES PARCIAIS SAI DO `schema.prisma`, e nao de uma lista escrita
// aqui. Uma lista escrita aqui envelheceria na primeira migration nova, e
// envelheceria em SILENCIO - que e a forma de falha que a propria regra 11
// descreve.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const RAIZ = new URL('..', import.meta.url).pathname;
const schema = readFileSync(join(RAIZ, 'prisma/schema.prisma'), 'utf8');

// ================================================================ o schema

type ChaveParcial = { modelo: string; colunas: string[]; mapa: string; predicado: string; chave: string };

/**
 * As chaves parciais, lidas do `schema.prisma`.
 *
 * O nome da chave composta e o que o Prisma gera quando nao ha `name:`: as
 * colunas unidas por `_`. E o mesmo nome que aparece em `WhereUniqueInput`, e a
 * verificacao R3 abaixo confere isso contra o client GERADO em vez de confiar
 * nesta derivacao.
 */
function chavesParciais(): ChaveParcial[] {
  const achadas: ChaveParcial[] = [];
  let modelo = '';
  for (const linha of schema.split('\n')) {
    const m = /^model\s+(\w+)\s*\{/.exec(linha);
    if (m) { modelo = m[1]!; continue; }
    if (/^\}/.test(linha)) { modelo = ''; continue; }

    const u = /@@unique\(\[([^\]]+)\][^)]*?map:\s*"([^"]+)"[^)]*?where:\s*raw\("([^"]+)"\)/.exec(linha);
    if (u && modelo) {
      const colunas = u[1]!.split(',').map((c) => c.trim());
      achadas.push({
        modelo, colunas, mapa: u[2]!, predicado: u[3]!,
        chave: colunas.join('_'),
      });
    }
  }
  return achadas;
}

const parciais = chavesParciais();
const porModelo = new Map<string, Set<string>>();
for (const p of parciais) {
  if (!porModelo.has(p.modelo)) porModelo.set(p.modelo, new Set());
  porModelo.get(p.modelo)!.add(p.chave);
}

// ---------------------------------------------------- R1 a leitura funciona
{
  chk('R1a', parciais.length >= 3,
      `o leitor achou ${parciais.length} chave(s) unica(s) parcial(is) no schema.prisma `
      + `(${parciais.map((p) => `${p.modelo}.${p.mapa}`).join(', ')}) - se achasse zero, todas as `
      + 'verificacoes seguintes passariam por vacuidade, que e o pior desfecho possivel aqui');
}

// ---------------------------------------------------- R2 o predicado, no schema
{
  const perigosas = parciais.filter((p) => !/^\(?\w+ IS NOT NULL\)?$/.test(p.predicado));
  chk('R2a', perigosas.length === 0,
      'todo unique parcial tem predicado IS NOT NULL - com ele, para todo valor nao-nulo da chave '
      + 'existe no maximo UMA linha, e `findUnique` nao tem como devolver arbitraria. E o `CAT-9` '
      + 'no banco, e aqui ele vale antes de haver banco'
      + (perigosas.length ? `: ${perigosas.map((p) => p.mapa).join(', ')}` : ''));
}

// ---------------------------------------------------- R3 as chaves EXISTEM mesmo
{
  /*
   * O REGIME. Esta verificacao nao afirma que a exposicao e boa nem ruim - ela
   * afirma qual dos dois mundos e o de hoje, e falha se o codigo e o gerador
   * discordarem sobre isso.
   *
   * `partialIndexes` LIGADO   as chaves parciais estao em WhereUniqueInput. A
   *                           protecao automatica NAO existe, e o que protege e
   *                           o R4 abaixo.
   * `partialIndexes` DESLIGADO as chaves somem, e a regra 11 volta a ter o
   *                           mecanismo que ela declara.
   */
  const ligado = /previewFeatures\s*=\s*\[[^\]]*"partialIndexes"/.test(schema);
  const amostra = parciais[0]!;
  const gerado = readFileSync(join(RAIZ, `src/generated/prisma/models/${amostra.modelo}.ts`), 'utf8');
  const apareceNoGerado = new RegExp(`\\b${amostra.chave}\\?:`).test(gerado);

  chk('R3a', ligado === apareceNoGerado,
      `o generator diz partialIndexes=${ligado} e o client gerado ${apareceNoGerado ? 'EXPOE' : 'nao expoe'} `
      + `\`${amostra.modelo}.${amostra.chave}\` em WhereUniqueInput - os dois concordam. Discordar `
      + 'significaria que o client em `src/generated/` nao corresponde ao schema, e o `tsc` passa '
      + 'em cima do client ANTERIOR sem acusar (Q-PRISMA11B-01)');

  chk('R3b', ligado === true,
      'e o regime de HOJE e o LIGADO: a protecao automatica que a regra 11 declara NAO existe, e '
      + 'quem impede a navegacao por chave parcial e a verificacao R4. Quando a `Q-CLAUDE11-01` '
      + 'for decidida no sentido (c) - desligar o preview -, esta linha cai e e o sinal de que a '
      + 'decisao foi aplicada');
}

// ================================================================ o codigo

/** Todo `.ts` de `src/` e `scripts/`, menos o client gerado. */
function fontes(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'generated' || nome === 'node_modules') continue;
      fontes(caminho, acc);
    } else if (nome.endsWith('.ts')) acc.push(caminho);
  }
  return acc;
}

const arquivos = [...fontes(join(RAIZ, 'src')), ...fontes(join(RAIZ, 'scripts'))];

/**
 * Toda navegacao por `findUnique`, com o modelo e a chave usada.
 *
 * O casamento e sobre o TEXTO e nao sobre a arvore sintatica, e a limitacao esta
 * dita: `.modelo.findUnique(` seguido de `where: {` e a primeira propriedade. Um
 * `findUnique` montado dinamicamente escaparia. Nao ha nenhum no repositorio -
 * conferido pela contagem em R4b, que compara os achados com o total de
 * ocorrencias de `findUnique` nos fontes.
 */
function navegacoes(): Array<{ arquivo: string; modelo: string; chave: string; linha: number }> {
  const achadas: Array<{ arquivo: string; modelo: string; chave: string; linha: number }> = [];
  for (const arquivo of arquivos) {
    const texto = readFileSync(arquivo, 'utf8');
    const re = /\.(\w+)\s*\.\s*findUnique\s*\(\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      const depois = texto.slice(m.index, m.index + 400);
      const w = /where:\s*\{\s*(\w+)/.exec(depois);
      if (!w) continue;
      achadas.push({
        arquivo: arquivo.slice(RAIZ.length),
        modelo: m[1]!,
        chave: w[1]!,
        linha: texto.slice(0, m.index).split('\n').length,
      });
    }
  }
  return achadas;
}

const usos = navegacoes();

// ---------------------------------------------------- R4 ninguem navega por parcial
{
  const totalDeChamadas = arquivos
    .map((a) => (readFileSync(a, 'utf8').match(/\.findUnique\s*\(/g) ?? []).length)
    .reduce((s, n) => s + n, 0);

  chk('R4a', usos.length === totalDeChamadas && totalDeChamadas > 0,
      `as ${totalDeChamadas} chamadas de findUnique dos fontes foram todas ANALISADAS - se o leitor `
      + 'entendesse menos do que existe, a verificacao seguinte passaria sobre o que ele nao viu, '
      + 'que e o modo de falha classico de teste por regex');

  const proibidas = usos.filter((u) => porModelo.get(u.modelo)?.has(u.chave));
  chk('R4b', proibidas.length === 0,
      'nenhum `findUnique` navega por chave unica PARCIAL - e a regra 11: "uma leitura que depende '
      + 'de predicado usa findFirst com o predicado explicito, ou uma chave unica cheia"'
      + (proibidas.length
        ? `. Achadas: ${proibidas.map((p) => `${p.arquivo}:${p.linha} ${p.modelo}.${p.chave}`).join(', ')}`
        : ''));
}

// ---------------------------------------------------- R5 o teste morde
{
  /*
   * A VERIFICACAO NEGATIVA, e sem ela o R4 seria uma afirmacao sobre nada. Ela
   * mostra que o par (modelo, chave) e o criterio: a MESMA chave passa num
   * modelo e falha no outro.
   */
  const chaveCompartilhada = 'tenant_id_documento';
  const emCliente = porModelo.get('cliente')?.has(chaveCompartilhada) === true;
  const emOriginador = porModelo.get('originador')?.has(chaveCompartilhada) === true;

  chk('R5a', emCliente && !emOriginador,
      `"${chaveCompartilhada}" e parcial em \`cliente\` e CHEIA em \`originador\` - e por isso o `
      + 'criterio e o PAR (modelo, chave). Procurar o nome da chave acusaria `originador` e '
      + '`dono_usina`, que estao certos, e teste que acusa errado treina o time a ignora-lo');

  const usamOriginador = usos.filter((u) =>
    (u.modelo === 'originador' || u.modelo === 'dono_usina') && u.chave === chaveCompartilhada);
  chk('R5b', usamOriginador.length === 2,
      `e os dois usos legitimos existem de fato (${usamOriginador.map((u) => u.arquivo.replace('/src/repos/', '')).join(', ')}) `
      + '- se um dia sumirem, esta linha cai e alguem confere se o R4 continua tendo o que discriminar');
}

console.log(`\n${falhas === 0 ? 'regra 11 (codigo): todas as verificacoes passaram'
                              : `regra 11 (codigo): ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
