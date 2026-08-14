// A TRADUCAO DE ERRO PARA HTTP, verificada. Pura, sem banco e sem rede.
// Uso: node --experimental-strip-types tests/erros.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, E ELA E TARDIA
//
// `src/http/erros.ts` decide se um erro chega ao usuario NOMEADO ou anonimo, e
// ate 14/08/2026 ele nao tinha **uma** verificacao. As 1.786 da suite passavam
// por cima dele em toda requisicao de `tests/http.ts` e nenhuma o afirmava.
//
// O custo disso foi medido no mesmo dia, e sao dois defeitos que dois documentos
// deste repositorio ja descreviam como se estivessem consertados:
//
//   1. A FAIXA IA ATE 499. Todo erro NOSSO de 502/503 caia no 500 generico - e a
//      `Q-LEITOR-01` e o cabecalho das rotas de leitura afirmam, por escrito, que
//      a ausencia da chave da Anthropic responde 503 "com a mensagem certa".
//      Nao respondia: respondia "Erro interno.", e quem opera nao tinha como
//      saber que faltava configurar a chave;
//
//   2. ERRO DE TERCEIRO PASSAVA INTEIRO. O `APIError` do SDK da Anthropic tem
//      `status` numerico e `message` com o CORPO da API dentro. Um 401 dela
//      chegava como 401 NOSSO - e a SPA trata 401 como sessao morta e manda para
//      o login, levando junto a fatura em edicao e a chamada ja paga.
//
// O SEGUNDO NAO SE CONSERTA AQUI, e a tentativa esta registrada: a primeira
// versao pos um portao em `e.name !== 'Error'`, e ele derrubou 23 sitios
// legitimos que lancam `Object.assign(new Error('X nao encontrado.'), {status:
// 404})`. A suite acusou na hora (`H26`). O portao certo e na FRONTEIRA, em
// `leitor-visao.ts`, e a verificacao `E5` abaixo o prende.

import { traduzir, ehInesperado } from '../src/http/erros.ts';
import {
  SemChaveDaAnthropic, RespostaInesperadaDoModelo, LeituraRecusada,
  ArquivoNaoSuportado, LeitorSemCredencialValida, LeitorSobrecarregado,
  ArquivoRecusadoPeloLeitor,
} from '../src/concessionaria/leitor-visao.ts';
import { BoletoNaoConfere, CnpjDoEmissorInvalido, ChavePixNaoEncontrada,
         LogoGrandeDemais, LogoNaoEPngNemJpeg } from '../src/repos/documento.ts';
import { SemPrecoNaCompetencia, FaturaNaoEncontrada } from '../src/repos/fatura.ts';
import { PercentualForaDaFaixa } from '../src/dominio/fatura-unificada.ts';
import { ValorNaoInteiro } from '../src/dominio/centavos.ts';

let falhas = 0;
let total = 0;
const chk = (id: string, cond: boolean, d: string) => {
  total++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

// ---------------------------------------- E1 todo erro NOSSO chega com o nome
//
// A tabela e por CLASSE e nao por faixa: o que se afirma e que o status escrito
// no construtor e o status que sai, e que o `erro` do corpo e o nome da classe -
// que e o que um consumidor (a SPA, o CRM) usa para decidir o que fazer.

const NOSSOS: Array<[Error & { status?: number }, number]> = [
  [new SemChaveDaAnthropic(), 503],
  [new LeitorSemCredencialValida(), 503],
  [new LeitorSobrecarregado(), 503],
  [new RespostaInesperadaDoModelo('teste'), 502],
  [new ArquivoRecusadoPeloLeitor('teste'), 422],
  [new ArquivoNaoSuportado('application/x-teste'), 422],
  [new LeituraRecusada(null), 422],
  [new BoletoNaoConfere('id', [{ tipo: 'linha_invalida', falhas: ['comprimento'] }]), 409],
  [new CnpjDoEmissorInvalido('00'), 422],
  [new ChavePixNaoEncontrada('id'), 404],
  [new LogoGrandeDemais(999_999), 413],
  [new LogoNaoEPngNemJpeg('3c 3f 78 6d'), 422],
  [new SemPrecoNaCompetencia('x', '2026-07-01'), 422],
  [new FaturaNaoEncontrada(), 404],
  [new PercentualForaDaFaixa('150'), 422],
];

for (const [e, status] of NOSSOS) {
  const r = traduzir(e);
  chk('E1', r.status === status && r.corpo.erro === e.name,
      `${e.name} -> HTTP ${r.status} com erro "${r.corpo.erro}" (esperado ${status}/${e.name})`);
  chk('E1b', r.corpo.mensagem === e.message && r.corpo.mensagem.length > 20,
      `${e.name}: a mensagem escrita no construtor chega inteira a quem chamou`);
  chk('E1c', !ehInesperado(e), `${e.name} nao entra no log de erro INESPERADO`);
}

/*
 * E A FAIXA E O QUE MUDOU. Ate 14/08 `temStatusDeNegocio` parava em 499, e estes
 * dois - os unicos 5xx nossos - saiam como 500 "Erro interno.". A verificacao
 * afirma o numero e nao a faixa, para o dia em que alguem "arrumar" a condicao.
 */
chk('E1d', traduzir(new SemChaveDaAnthropic()).status === 503
        && traduzir(new RespostaInesperadaDoModelo('x')).status === 502,
    '503 e 502 NOSSOS chegam como 503 e 502 - a `Q-LEITOR-01` afirma isso por escrito desde 14/08, '
    + 'e ate hoje os dois saiam 500 "Erro interno."');

// -------------------------------------------- E2 validacao de entrada e 422
chk('E2', traduzir(new TypeError('campo x invalido')).status === 422,
    'TypeError -> 422: e o que os repositorios lancam para float em centavos e decimal como number');
chk('E2b', traduzir(new ValorNaoInteiro('valor', 1.5)).status === 422,
    'ValorNaoInteiro (regra 1) tambem - ele e TypeError com nome proprio');
chk('E2c', traduzir(new TypeError('x')).corpo.erro === 'EntradaInvalida',
    'e o nome do erro diz que a ENTRADA e que esta errada, nao o servidor');

// ------------------------------------------- E3 os erros do Prisma que falam
for (const [code, status, nome] of [
  ['P2002', 409, 'ConflitoDeUnicidade'],
  ['P2003', 422, 'ReferenciaInvalida'],
  ['P2025', 404, 'NaoEncontrado'],
] as const) {
  const r = traduzir(Object.assign(new Error('detalhe interno do driver'), { code }));
  chk('E3', r.status === status && r.corpo.erro === nome,
      `${code} -> ${status} ${nome}`);
  chk('E3b', !r.corpo.mensagem.includes('detalhe interno'),
      `${code}: a mensagem CRUA do driver nao vaza - sai a nossa`);
  chk('E3c', !ehInesperado(Object.assign(new Error('x'), { code })),
      `${code} nao entra no log de INESPERADO: e erro de negocio com leitura conhecida`);
}

// ------------------------------------- E4 o que NAO conhecemos sai generico
//
// E A ASSERCAO MAIS IMPORTANTE DESTA SUITE. Ela e o que impede o defeito 2 do
// cabecalho de voltar por outro caminho: erro sem `status` nosso nao pode
// carregar a mensagem dele para o cliente, seja qual for a origem.

for (const [nome, e] of [
  ['Error puro', new Error('SELECT * FROM tenant WHERE segredo = ...')],
  ['objeto qualquer', { mensagem: 'chave sk-ant-api03-XXXX' } as unknown as Error],
  ['string', 'senha=hunter2' as unknown as Error],
  ['null', null as unknown as Error],
  ['erro do Prisma sem code conhecido', Object.assign(new Error('P1017 conexao caiu'), { code: 'P1017' })],
] as const) {
  const r = traduzir(e);
  chk('E4', r.status === 500 && r.corpo.erro === 'ErroInterno' && r.corpo.mensagem === 'Erro interno.',
      `${nome} -> 500 generico, sem uma palavra do original`);
  chk('E4b', ehInesperado(e),
      `${nome} entra no log de INESPERADO - o detalhe vai para o journalctl e nunca para a resposta`);
}

// O CAMINHO MALFORMADO. `casar()` do servidor chama `decodeURIComponent` em todo
// segmento de parametro, e `%E0%A4%A` levanta `URIError` ANTES de qualquer rota
// existir. Ate 14/08 isso virava 500 e enchia o log de alarme falso a cada
// varredura de robo.
{
  const r = traduzir(new URIError('URI malformed'));
  chk('E4c', r.status === 400 && r.corpo.erro === 'CaminhoInvalido',
      'URIError -> 400 CaminhoInvalido, a mesma decisao que `lerCorpo` ja toma para JSON malformado');
  chk('E4d', !ehInesperado(new URIError('x')),
      'e ele NAO e inesperado: caminho torto e coisa que chega de fora o tempo todo');
}

// ------------------------------ E5 o erro de TERCEIRO nao chega ate o tradutor
//
// A verificacao e sobre a FRONTEIRA e nao sobre o tradutor, e e por isso que ela
// mora nesta suite: `erros.ts` aceita qualquer `status` na faixa de negocio, de
// proposito (ver o cabecalho), e o que impede o `APIError` da Anthropic de
// passar e o embrulho de `leitor-visao.ts`.
//
// Se alguem apagar o `try/catch` de `extrair`, esta linha cai - e o sintoma que
// ela previne e o pior tipo: um 401 de terceiro deslogando quem esta faturando.
{
  const modulo = await import('../src/concessionaria/leitor-visao.ts');
  const fonte = await import('node:fs').then((fs) =>
    fs.readFileSync('src/concessionaria/leitor-visao.ts', 'utf8'));

  chk('E5', /catch \(e\) \{\s*throw traduzirErroDaApi\(e\);/.test(fonte),
      'a chamada a API esta dentro de try/catch que embrulha o erro dela num erro NOSSO');
  chk('E5b', typeof modulo.LeitorSemCredencialValida === 'function'
          && typeof modulo.LeitorSobrecarregado === 'function'
          && typeof modulo.ArquivoRecusadoPeloLeitor === 'function',
      'e as tres classes de traducao existem e sao exportadas - 401/403, 429/529 e 4xx');

  const r = traduzir(Object.assign(new Error('401 {"type":"error","error":{"message":"invalid x-api-key"}}'),
                                   { status: 401 }));
  chk('E5c', r.status === 401,
      'o tradutor SOZINHO deixaria um 401 de terceiro passar (medido) - e por isso a defesa e na fronteira, '
      + 'e nao aqui: apertar isto derrubaria os 23 sitios que lancam Error puro com status 404');
}

console.log();
if (falhas > 0) { console.log(`--- erros: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- erros (traducao para HTTP): ${total} verificacoes, 0 falhas`);
