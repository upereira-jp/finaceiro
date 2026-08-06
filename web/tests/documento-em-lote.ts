// O LOTE DE DOCUMENTOS — puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types web/tests/documento-em-lote.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e nenhuma delas e sobre aparencia.
//
// A impressao em lote existe para consertar uma OMISSAO: 28 impressoes a mao nao
// falham, elas esquecem uma. O conserto so vale se o codigo contar — e a D3 e a
// invariante inteira do arquivo: `imprimir` + `fora` = o total recebido, sempre,
// inclusive com status que esta tela nao conhece (D6). Se essa soma parar de
// fechar, uma fatura sai da competencia sem aparecer em lugar nenhum, que e o
// mesmo modo de falha que a impressao manual tinha.
//
// A D7 e de outra natureza: ela prende DUAS afirmacoes juntas, para que o padrao
// do lote e a regra de baixa nao possam divergir em silencio. Hoje as duas dizem
// "emitida e vencida" porque as duas citam a mesma linha do servidor.

import {
  STATUS_PADRAO_DO_LOTE, PORQUE_FORA, selecaoDoLote, separarComposicao, frasePreImpressao,
} from '../src/lote-de-documentos.ts';
import { podeBaixarManual, type StatusFatura } from '../src/cobranca-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

const f = (id: string, status: string) => ({ id, status });

/** A competencia de referencia: a forma real de 06/08 — 28 emitidas seria o lote
 *  de 2026-06, e aqui a mistura existe para os tres grupos aparecerem. */
const COMPETENCIA = [
  f('a', 'emitida'), f('b', 'rascunho'), f('c', 'vencida'), f('d', 'cancelada'),
  f('e', 'emitida'), f('g', 'paga'), f('h', 'emitida'), f('i', 'rascunho'),
];

// ------------------------------------------------------------------ D1 padrao
{
  const s = selecaoDoLote(COMPETENCIA);
  const ids = s.imprimir.map((x) => x.id).join(',');
  chk('D1', ids === 'a,c,e,h',
      `o padrao imprime emitida e vencida, e so elas (${ids})`);
}

// -------------------------------------------------------------- D2 o de fora
{
  const s = selecaoDoLote(COMPETENCIA);
  const rascunho = s.fora.find((x) => x.status === 'rascunho');
  const cancelada = s.fora.find((x) => x.status === 'cancelada');
  chk('D2', rascunho?.quantidade === 2 && cancelada?.quantidade === 1
            && !!rascunho?.porque && !!cancelada?.porque,
      `o que fica de fora vem agrupado, contado e COM MOTIVO ` +
      `(rascunho ${rascunho?.quantidade}, cancelada ${cancelada?.quantidade})`);
}

// ------------------------------------------------------- D3 nada some (a invariante)
{
  const s = selecaoDoLote(COMPETENCIA);
  const soma = s.imprimir.length + s.fora.reduce((t, x) => t + x.quantidade, 0);
  chk('D3', soma === COMPETENCIA.length && s.total === COMPETENCIA.length,
      `imprimir + fora = o total recebido (${soma} de ${COMPETENCIA.length}) — ` +
      'nenhuma fatura cai entre os dois grupos');
}

// ------------------------------------------------------------------- D4 ordem
// A ordem da tela e a ordem da pilha de papel. Reordenar aqui faria a
// conferencia visual deixar de valer para o que sai da impressora.
{
  const entrada = [f('z', 'emitida'), f('a', 'emitida'), f('m', 'vencida')];
  const ids = selecaoDoLote(entrada).imprimir.map((x) => x.id).join(',');
  chk('D4', ids === 'z,a,m', `a ordem de entrada e preservada, nao reordenada (${ids})`);
}

// --------------------------------------------------------------- D5 incluir
{
  const s = selecaoDoLote(COMPETENCIA, ['emitida', 'vencida', 'rascunho']);
  chk('D5', s.imprimir.length === 6 && !s.fora.some((x) => x.status === 'rascunho'),
      `incluir rascunho move os 2 do "fora" para o lote (${s.imprimir.length} no lote)`);
}

// ------------------------------------------------------- D6 status desconhecido
// Coluna nova no banco com cliente antigo. O errado seria sumir.
{
  const s = selecaoDoLote([...COMPETENCIA, f('x', 'protestada')]);
  const desconhecido = s.fora.find((x) => String(x.status) === 'protestada');
  const soma = s.imprimir.length + s.fora.reduce((t, x) => t + x.quantidade, 0);
  chk('D6', desconhecido?.quantidade === 1 && /desconhecido/.test(desconhecido?.porque ?? '')
            && soma === COMPETENCIA.length + 1,
      'status fora do enum conhecido aparece nomeado e continua somando');
}

// ------------------------------------------------- D7 espelho da regra de baixa
// As duas afirmam o mesmo conjunto e citam a mesma linha do servidor. Mudar uma
// sem a outra cai aqui, e nao no envelope do cliente.
{
  const TODOS: StatusFatura[] = ['rascunho', 'emitida', 'paga', 'vencida', 'cancelada', 'negociada'];
  const doLote = TODOS.filter((s) => STATUS_PADRAO_DO_LOTE.includes(s)).join(',');
  const daBaixa = TODOS.filter(podeBaixarManual).join(',');
  chk('D7', doLote === daBaixa && doLote === 'emitida,vencida',
      `o padrao do lote e o mesmo conjunto de podeBaixarManual (lote: ${doLote} · baixa: ${daBaixa})`);
}

// ------------------------------------------------- D8 todos os status tem motivo
{
  const TODOS: StatusFatura[] = ['rascunho', 'emitida', 'paga', 'vencida', 'cancelada', 'negociada'];
  const sem = TODOS.filter((s) => !PORQUE_FORA[s]?.trim());
  chk('D8', sem.length === 0,
      `todo status do enum tem texto de motivo (faltando: ${sem.join(',') || 'nenhum'})`);
}

// ------------------------------------------------------------ D9 as falhas
// Uma que nao compoe nao derruba as outras E NAO SOME. As duas metades.
{
  const r = separarComposicao<{ n: number }>([
    { ok: true, doc: { n: 1 } },
    { ok: false, fatura_id: 'ff', rotulo: 'UC 000123', erro: 'FaturaSemDocumento' },
    { ok: true, doc: { n: 3 } },
  ]);
  chk('D9', r.compostos.length === 2 && r.falhas.length === 1
            && r.falhas[0].rotulo === 'UC 000123' && r.falhas[0].erro === 'FaturaSemDocumento',
      `2 compostos e 1 falha nomeada, lado a lado (${r.compostos.length}/${r.falhas.length})`);
}

// ------------------------------------------------------------- D10 a frase
{
  const so = frasePreImpressao({ compostos: 28, falhas: 0, fora: 0, total: 28 });
  const com = frasePreImpressao({ compostos: 27, falhas: 1, fora: 3, total: 31 });
  chk('D10', so === '28 de 28 fatura(s) da competencia'
             && /27 de 31/.test(com) && /3 fora do lote/.test(com) && /1 NAO compos/.test(com),
      `a frase diz "de quantas" e nomeia falha ("${com}")`);
}

// -------------------------------------------------------------- D11 vazio
{
  const s = selecaoDoLote([]);
  chk('D11', s.imprimir.length === 0 && s.fora.length === 0 && s.total === 0,
      'competencia sem fatura devolve as duas listas vazias, sem inventar grupo');
}

// ------------------------------------------------- D12-D15: o CSS DE IMPRESSAO
//
// A parte do lote que nao esta em TypeScript nenhum esta aqui, e ela e a que
// decide o que sai da impressora. As quatro regras abaixo foram MEDIDAS em
// 06/08 num Chromium de verdade, por PDF - `page.pdf()`, o mesmo caminho do
// dialogo de imprimir:
//
//   codigo original, 1 fatura .... 5 paginas (1 fatura + 4 EM BRANCO)
//   com as quatro regras, 1 ...... 1 pagina
//   com as quatro regras, 3 ...... 3 paginas
//
// Nenhuma delas cai em `tsc`, em revisao de PR ou em qualquer outra verificacao
// desta suite: sao seletores dentro de uma string. O que este bloco prende e a
// FORMA de cada uma, que e o que uma edicao distraida quebra.

const { ESTILO } = await import('../src/estilo.ts');
/*
 * SEM OS COMENTARIOS, e a primeira versao deste teste caiu por isso: a D12 nega
 * a existencia de `#documento.folha` e o proprio comentario do `estilo.ts` cita
 * essa forma para explicar o que mudou. Casar contra comentario faz o teste
 * medir a documentacao em vez da regra - e ele estava certo em cair.
 */
const impressao = ESTILO.slice(ESTILO.indexOf('@media print')).replace(/\/\*[\s\S]*?\*\//g, '');

// D12 — o seletor que o lote inteiro depende. `#documento.folha` (a MESMA caixa)
// imprimiria a primeira folha e mais nada: `id` e unico por documento.
chk('D12', /#documento\s+\.folha\s*\{/.test(impressao) && !/#documento\.folha/.test(impressao),
    'o tamanho real e aplicado a `#documento .folha` (descendente) e nao a `#documento.folha`');

// D13 — uma folha por pagina, nas duas formas.
chk('D13', /#documento\s+\.folha-item\s*\+\s*\.folha-item\s*\{[^}]*break-before:\s*page/.test(impressao)
           && /#documento\s+\.folha-item\s*\+\s*\.folha-item\s*\{[^}]*page-break-before:\s*always/.test(impressao),
    'o corte de pagina esta no `.folha-item + .folha-item`, moderno e legado — 28 folhas nao saem emendadas');

// D14 — o recorte da tela desfeito no papel. Sem ele a folha imprime cortada em
// ~30% da altura, porque o recorte guarda a altura ESCALADA da previa.
chk('D14', /#documento\s+\.folha-recorte\s*\{[^}]*height:\s*auto\s*!important/.test(impressao)
           && /#documento\s+\.folha-recorte\s*\{[^}]*overflow:\s*visible\s*!important/.test(impressao),
    'o `folha-recorte` da previa e desfeito na impressao — senao o zoom da tela corta o papel');

// D15 — as paginas em branco. `visibility: hidden` esconde e NAO desocupa: a aba
// inteira continuava ocupando altura, e altura e o que o navegador pagina.
chk('D15', /body \*:not\(:has\(#documento\)\)/.test(impressao) && /display:\s*none\s*!important/.test(impressao),
    'o que nao e o documento nem caminho ate ele sai do LAYOUT, e nao so da vista');

console.log(falhas === 0 ? '\nTODAS PASSARAM' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
