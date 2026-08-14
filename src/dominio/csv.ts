// O CSV DESTE PROJETO, num par coerente. Puro: sem rede, sem banco, sem DOM.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE, E O DEFEITO QUE ELE CONSERTA
//
// Cinco modulos `planilha-*.ts` liam e escreviam CSV, e os cinco carregavam
// copias do MESMO par de funcoes: `semAspas` byte-identica cinco vezes (md5
// `08e633795df5` nas cinco) e `celula` byte-identica quatro (md5 `655a893cd826`),
// mais cinco `const SEP = ';'` e cinco `split(/\r\n|\n|\r/)`.
//
// Duplicacao seria arrumacao. O que fez este arquivo existir e que o par NAO
// FECHAVA - o escritor e o leitor discordavam, e a discordancia produz dado
// errado sem erro nenhum:
//
//   escritor:  /[";\r\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v    <- CITA o `;`
//   leitor:    crua.split(SEP).map(semAspas)                           <- IGNORA as aspas
//
// Medido em 14/08 com o round-trip escritor -> leitor, quatro casos:
//
//   ["Rua das Flores, 100", "Centro"]   OK
//   ["Rua A; fundos", "Centro"]         QUEBRA: volta como 3 campos
//   ['Ele disse "oi"', "Centro"]        QUEBRA: as aspas dobradas voltam dobradas
//
// **Dois de quatro.** E o campo mais provavel de ter `;` e justamente o
// `endereco_logradouro` de `planilha-enderecos`, num pais onde "Rua X; fundos" e
// endereco comum. O sintoma nao e erro: e o endereco partido em duas colunas,
// deslocando TODAS as seguintes - CEP no lugar do bairro, UF no lugar do CEP.
//
// ============================================================================
// O QUE ESTE PARSER FAZ E O QUE ELE NAO FAZ
//
// FAZ: o subconjunto do RFC 4180 que o proprio escritor produz - campo entre
// aspas, `""` como aspa literal dentro dele, e separador dentro das aspas.
//
// NAO FAZ: quebra de linha DENTRO de aspas. O escritor cita `\r` e `\n`, entao
// ele pode produzir um campo com quebra dentro - e o leitor parte o texto em
// linhas ANTES de chamar isto. Fechar esse buraco exige um parser por caractere
// sobre o texto inteiro, e nenhuma das cinco planilhas tem campo multilinha: sao
// numero de UC, data, valor, documento e endereco de uma linha.
//
// A ASSIMETRIA ESTA REGISTRADA porque ela e a proxima a doer, e nao porque foi
// esquecida. Se um dia uma planilha tiver campo multilinha, o conserto e mover a
// quebra de linhas para dentro deste modulo - nao acrescentar um sexto parser.

/** O separador. Ponto e virgula, e nao virgula: e o que o Excel em pt-BR usa. */
export const SEP = ';';

/** Quebra o texto em linhas, aceitando os tres finais de linha. Uma so
 *  implementacao, e nao cinco copias do mesmo `split`. */
export const emLinhas = (texto: string): string[] => texto.split(/\r\n|\n|\r/);

/**
 * UM CAMPO, ESCRITO. Cita quando precisa e dobra a aspa de dentro.
 *
 * `[";\r\n]` sao exatamente os quatro caracteres que quebrariam a leitura se
 * saissem crus - o separador, a propria aspa e os dois finais de linha.
 */
export const escreverCelula = (v: string): string =>
  /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * UMA LINHA, LIDA. Respeita aspas, e e essa a diferenca em relacao ao
 * `split(SEP)` que estava nos cinco arquivos.
 *
 * O laco e por caractere e nao por regex de proposito: o estado "estou dentro de
 * aspas" nao e expressavel em expressao regular sem lookbehind de tamanho
 * variavel, e a versao com regex que eu tentaria escrever seria mais dificil de
 * conferir do que este `for`.
 */
export function lerLinha(crua: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentro = false;

  for (let i = 0; i < crua.length; i++) {
    const c = crua[i]!;
    if (dentro) {
      if (c !== '"') { atual += c; continue; }
      /* `""` DENTRO DE ASPAS E UMA ASPA LITERAL - e o escape do proprio RFC, e o
       * que o escritor produz. Sem este ramo, `Ele disse ""oi""` voltaria com as
       * aspas dobradas e o campo seguinte comecaria no lugar errado. */
      if (crua[i + 1] === '"') { atual += '"'; i++; continue; }
      dentro = false;
      continue;
    }
    if (c === '"' && atual.trim() === '') { dentro = true; atual = ''; continue; }
    if (c === SEP) { campos.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

/**
 * UM CAMPO SEM AS ASPAS DE FORA, quando ele ja veio separado.
 *
 * Ela sobreviveu porque tem um consumidor legitimo: o CABECALHO, que e comparado
 * campo a campo depois de `lerLinha`. Passar por ela de novo nao muda nada -
 * `lerLinha` ja tirou as aspas -, e por isso ela e usada so onde o texto NAO
 * passou por `lerLinha`.
 */
export const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/**
 * `ehUuid` estava EXPORTADA de dois modulos de planilha, com o mesmo corpo.
 *
 * Duas exportacoes do mesmo predicado sao duas coisas que podem divergir, e o
 * que elas decidem e se uma linha de planilha aponta para um registro nosso ou
 * para lixo digitado.
 */
export const ehUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
