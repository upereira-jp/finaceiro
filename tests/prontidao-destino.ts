// AS CAMADAS DA PRONTIDAO E OS DESTINOS DELAS, lado a lado. Sem banco.
// Uso: node --experimental-strip-types tests/prontidao-destino.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, e ela guarda uma juncao que atravessa o repo
//
// Desde 19/08/2026 a tela de Pendencias nao diz so O QUE falta: cada camada
// carrega o LINK de onde o dado entra. As duas metades dessa frase moram em
// arquivos que nao se importam:
//
//   `src/repos/prontidao.ts`         o SERVIDOR, que nomeia as camadas
//   `web/src/destino-da-camada.ts`   a TELA, que diz onde cada uma se resolve
//
// A tela nao pode importar o repositorio (ele abre conexao com o banco), e o
// repositorio nao conhece rota de SPA. Entao a juncao e por NOME de camada, e
// nome combinado sem verificacao envelhece em silencio - que e exatamente o modo
// de falha que a prontidao inteira existe para combater.
//
// O QUE ACONTECE SEM ESTA SUITE, e o custo e assimetrico:
//
//   camada NOVA no servidor      a linha aparece na tela com um travessao onde
//                                deveria estar o caminho. A pessoa le que falta
//                                alguma coisa e nao tem para onde ir;
//   camada RENOMEADA             pior: a linha continua ali, o destino antigo
//                                vira orfao, e ninguem ve - nem a tela quebra,
//                                nem o `tsc` reclama, porque a chave e `string`.
//
// LE OS DOIS ARQUIVOS COMO TEXTO, e nao os importa. E o mesmo desenho do
// `tests/regra11.ts`: a lista sai da FONTE e nao de uma copia escrita aqui, que
// envelheceria na primeira camada nova - e envelheceria em silencio.

import { readFileSync } from 'node:fs';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

// ------------------------------------------------------------ as duas listas

/** As camadas como o SERVIDOR as nomeia, na ordem em que ele as monta. O literal
 *  `camada: '...'` so aparece na lista `bruto`; o `camada: string` do tipo nao
 *  casa, porque nao tem aspas. */
const doServidor = [...ler('src/repos/prontidao.ts').matchAll(/camada: '([a-z_]+)'/g)]
  .map((m) => m[1]!);

/** As chaves de `DESTINO_DA_CAMADA`, na ordem em que estao escritas. O recorte
 *  do bloco e obrigatorio: `FILTROS_DA_TELA` tem chaves de rota logo acima, e
 *  elas nao sao camadas. */
const doDestino = (() => {
  const fonte = ler('web/src/destino-da-camada.ts');
  const i = fonte.indexOf('export const DESTINO_DA_CAMADA');
  const j = fonte.indexOf('\n};', i);
  chk('PD0', i > 0 && j > i, 'o bloco DESTINO_DA_CAMADA foi localizado no fonte da tela');
  return [...fonte.slice(i, j).matchAll(/^ {2}([a-z_]+): \{$/gm)].map((m) => m[1]!);
})();

chk('PD1', doServidor.length >= 10,
    `o servidor nomeia ${doServidor.length} camadas — se este numero desabar, o recorte deste `
    + 'teste parou de casar com o fonte e ele passou a nao medir nada');

// ---------------------------------------------------- PD2 cobertura, nos dois sentidos

const semDestino = doServidor.filter((c) => !doDestino.includes(c));
chk('PD2', semDestino.length === 0,
    'toda camada da prontidao tem destino na tela — sem ele a linha aparece dizendo que falta '
    + `alguma coisa e sem para onde ir (orfas: ${semDestino.join(', ') || 'nenhuma'})`);

const orfaos = doDestino.filter((c) => !doServidor.includes(c));
chk('PD2b', orfaos.length === 0,
    'e nenhum destino aponta para camada que o servidor nao devolve mais — este e o lado que '
    + `NAO quebra nada e por isso passa despercebido (orfaos: ${orfaos.join(', ') || 'nenhum'})`);

// -------------------------------------------------------------- PD3 a ordem

// A ORDEM E DECISAO DOS DOIS LADOS, e a mesma: "quem le de cima para baixo
// trabalha na ordem em que o trabalho destrava o proximo". O `destino-da-camada`
// afirma isso no comentario dele; aqui a afirmacao vira verificacao. Ela nao
// muda o que a tela desenha — quem ordena a tabela e o servidor —, mas uma
// tabela de destinos em outra ordem e ilegivel ao lado da tela.
chk('PD3', JSON.stringify(doServidor) === JSON.stringify(doDestino),
    'as duas listas estao na MESMA ordem, que e a do trabalho'
    + (JSON.stringify(doServidor) === JSON.stringify(doDestino)
        ? '' : `\n       servidor: ${doServidor.join(' > ')}\n       destino:  ${doDestino.join(' > ')}`));

console.log();
if (falhas > 0) { console.log(`--- prontidao/destino: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- prontidao/destino (as camadas e onde elas se resolvem): ${feitas} verificacoes, 0 falhas`);
