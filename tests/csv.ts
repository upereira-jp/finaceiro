// O CSV, ida e volta. Pura, sem banco.
// Uso: node --experimental-strip-types tests/csv.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, E ELA NASCE DE UM DEFEITO MEDIDO
//
// Ate 14/08/2026 o escritor e o leitor de CSV deste projeto DISCORDAVAM, e a
// discordancia estava espalhada em cinco copias:
//
//   escritor:  /[";\r\n]/.test(v) ? `"..."` : v     <- CITAVA o `;`
//   leitor:    crua.split(';').map(semAspas)         <- IGNORAVA as aspas
//
// O sintoma nao e erro: e o campo partido em dois, deslocando TODAS as colunas
// seguintes. O campo mais provavel de ter `;` e o `endereco_logradouro`, num
// pais onde "Rua X; fundos" e endereco comum - e o resultado seria CEP no lugar
// do bairro, UF no lugar do CEP, tudo gravado sem uma linha de log.
//
// A PROPRIEDADE QUE ESTA SUITE PRENDE E O ROUND-TRIP, e nao a implementacao:
// escrever N campos e ler de volta tem de devolver os MESMOS N campos, seja qual
// for o conteudo deles. E a unica forma de a duplicidade nao voltar - dois
// modulos que se contradizem passam em qualquer teste que olhe so um dos dois.

import { SEP, emLinhas, escreverCelula, lerLinha, semAspas, ehUuid } from '../src/dominio/csv.ts';

let falhas = 0;
let total = 0;
const chk = (id: string, cond: boolean, d: string) => {
  total++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const iguais = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const volta = (campos: readonly string[]) => lerLinha(campos.map(escreverCelula).join(SEP));

// ------------------------------------------------------ C1 o round-trip fecha
//
// OS QUATRO PRIMEIROS SAO OS CASOS MEDIDOS EM 14/08. Dois deles QUEBRAVAM com o
// leitor antigo, e os dois estao nomeados com o que produziam.

const CASOS: Array<[string, string[]]> = [
  ['campo simples', ['000123', 'Equatorial', '1,185396']],
  ['virgula dentro do campo (nao quebrava)', ['Rua das Flores, 100', 'Centro']],
  ['PONTO E VIRGULA dentro do campo (quebrava em 3 campos)', ['Rua A; fundos', 'Centro']],
  ['ASPA dentro do campo (voltava dobrada)', ['Ele disse "oi"', 'Centro']],
  ['os dois juntos', ['Rua "A"; fundos, 12', 'Setor Bueno']],
  ['campo vazio no meio', ['000123', '', 'Centro']],
  ['campo vazio no fim', ['000123', 'Centro', '']],
  ['so separadores', ['', '', '']],
  ['um campo so', ['000123']],
  ['aspa no comeco do campo', ['"aspas"', 'x']],
  ['espacos nas pontas sao aparados', ['  000123  ', ' Centro ']],
];

for (const [nome, campos] of CASOS) {
  const esperado = campos.map((c) => c.trim());
  chk('C1', iguais(volta(campos), esperado),
      `${nome}: ${JSON.stringify(campos)} -> ${JSON.stringify(volta(campos))}`);
}

// ------------------------------------------------ C2 a contagem NUNCA muda
//
// E a propriedade que de fato importa, e ela e mais forte que a igualdade campo
// a campo: o defeito antigo nao corrompia o texto, ele DESLOCAVA as colunas. Uma
// planilha com o numero certo de colunas e conteudo trocado passaria por
// qualquer leitura humana.

for (const [nome, campos] of CASOS) {
  chk('C2', volta(campos).length === campos.length,
      `${nome}: a linha volta com ${campos.length} campo(s), e nao mais nem menos`);
}

// ---------------------------------------------- C3 o que o escritor de fato cita
chk('C3', escreverCelula('simples') === 'simples',
    'campo sem caractere especial sai CRU - citar tudo engordaria a planilha sem ganho');
chk('C3b', escreverCelula('a;b') === '"a;b"',
    'ponto e virgula obriga aspas');
chk('C3c', escreverCelula('a"b') === '"a""b"',
    'aspa obriga aspas E dobra a de dentro');
chk('C3d', escreverCelula('a\nb') === '"a\nb"',
    'quebra de linha obriga aspas');
chk('C3e', escreverCelula('a,b') === 'a,b',
    'VIRGULA nao obriga: o separador deste projeto e ";" (Excel em pt-BR), e citar '
    + 'por virgula produziria aspas em todo endereco sem necessidade');

// -------------------------------------------- C4 o leitor sozinho, sem o escritor
chk('C4', iguais(lerLinha('a;b;c'), ['a', 'b', 'c']), 'tres campos crus');
chk('C4b', iguais(lerLinha('"a;b";c'), ['a;b', 'c']), 'separador DENTRO de aspas nao separa');
chk('C4c', iguais(lerLinha('"a""b";c'), ['a"b', 'c']), '`""` dentro de aspas e uma aspa literal');
chk('C4d', iguais(lerLinha(''), ['']), 'linha vazia e UM campo vazio, e nao zero campos');
chk('C4e', iguais(lerLinha('a;'), ['a', '']), 'separador no fim produz o campo vazio final');

// --------------------------------------------------------- C5 as linhas
chk('C5', emLinhas('a\r\nb\nc\rd').length === 4,
    'os tres finais de linha sao aceitos - planilha salva no Windows, no Mac antigo e no Unix');

// ------------------------------------------------------------- C6 as ajudas
chk('C6', semAspas('"x"') === 'x' && semAspas('x') === 'x' && semAspas('  x  ') === 'x',
    'semAspas tira as aspas de fora e apara - e usada onde o texto NAO passou por lerLinha');
chk('C6b', ehUuid('aaaaaaaa-1111-4000-8000-000000000001')
        && !ehUuid('000123') && !ehUuid(''),
    'ehUuid distingue id nosso de numero de UC - era exportada de DOIS modulos, com o mesmo corpo');

console.log();
if (falhas > 0) { console.log(`--- csv: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- csv (ida e volta): ${total} verificacoes, 0 falhas`);
