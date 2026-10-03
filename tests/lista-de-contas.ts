// AS REGRAS PURAS DA LISTA DE CONTAS A PAGAR NO SERVIDOR (`src/dominio/lista-de-contas.ts`).
// Sem banco. Uso: node --experimental-strip-types tests/lista-de-contas.ts
//
// O SQL que usa estas regras e provado com banco em `tests/repos-lista-de-contas.ts`
// (no CI); a concordancia com a tela (peso da situacao, busca sem acento) em
// `web/tests/contas.ts`. Aqui fica o que decide o que a rota ACEITA.

import {
  padraoDeBusca, normalizarBusca, ordemDaLista, situacaoDaLista, inicioDoBloco, tamanhoDoBloco,
  ACENTUADAS, SEM_ACENTO, TETO_DA_BUSCA, BLOCO_PADRAO, TETO_DO_BLOCO, ORDENS_DA_LISTA,
} from '../src/dominio/lista-de-contas.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const recusa = (f: () => unknown) => { try { f(); return false; } catch (e) { return e instanceof TypeError; } };

// ------------------------------------------------------------------ a busca
chk('LC1', padraoDeBusca('João') === '%joao%' && padraoDeBusca('  AÇÃO  ') === '%acao%',
    'o termo vira padrao de LIKE sem acento e minusculo — a coluna passa pelo mesmo `translate` no SQL');
chk('LC1b', padraoDeBusca('50%') === '%50\\%%' && padraoDeBusca('a_b') === '%a\\_b%' && padraoDeBusca('c\\d') === '%c\\\\d%',
    '`%`, `_` e `\\` sao escapados: buscar «50%» nao casa tudo que comeca com 50 (o SQL declara ESCAPE)');
chk('LC1c', padraoDeBusca('') === null && padraoDeBusca('   ') === null && padraoDeBusca(null) === null,
    'vazio ou so espaco e «sem busca», e nao um LIKE «%%» que custaria um scan para devolver tudo');
chk('LC1d', padraoDeBusca('x'.repeat(500))!.length === TETO_DA_BUSCA + 2,
    `o termo e cortado em ${TETO_DA_BUSCA} caracteres — busca e um nome, nao um texto`);

{
  const a = [...ACENTUADAS], s = [...SEM_ACENTO];
  const errados = a.filter((c, i) => s[i] !== normalizarBusca(c));
  chk('LC2', a.length === s.length && errados.length === 0 && /^[a-z]+$/.test(SEM_ACENTO),
      `o mapa do \`translate\` tem ${a.length} letras dos dois lados, e cada uma vira o que \`normalizarBusca\` `
      + 'diria — `translate` casa posicao a posicao, e um caractere sobrando desloca o resto (a primeira versao, '
      + 'escrita a mao, transformava «Ú» em «o»)');
  chk('LC2b', [...'áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇàÀüÜ'].every((c) => ACENTUADAS.includes(c)),
      'o mapa cobre todas as letras acentuadas do portugues, maiusculas e minusculas');
}

// ------------------------------------------------------------ os parametros
chk('LC3', ordemDaLista(null) === 'vencimento' && ordemDaLista('') === 'vencimento'
        && ORDENS_DA_LISTA.every((o) => ordemDaLista(o) === o),
    'sem ordem, vencimento; as seis ordens da tela passam');
chk('LC3b', recusa(() => ordemDaLista('valor; DROP TABLE conta_pagar')) && recusa(() => ordemDaLista('id')),
    'ordem fora da lista e 400 — a expressao SQL sai de um mapa fechado, nunca do texto da query');
chk('LC4', situacaoDaLista(null) === undefined && situacaoDaLista('paga') === 'paga' && recusa(() => situacaoDaLista('vencida')),
    'situacao e status do banco; «vencida» nao e status (e data), e e recusada em vez de devolver vazio calado');
chk('LC5', inicioDoBloco(null) === 0 && inicioDoBloco('400') === 400
        && recusa(() => inicioDoBloco('-1')) && recusa(() => inicioDoBloco('1.5')) && recusa(() => inicioDoBloco('abc')),
    'inicio e inteiro >= 0; o resto e pedido malformado');
chk('LC6', tamanhoDoBloco(undefined) === BLOCO_PADRAO && tamanhoDoBloco(9000) === TETO_DO_BLOCO && tamanhoDoBloco(0) === 1,
    `sem pedido, ${BLOCO_PADRAO}; acima do teto, ${TETO_DO_BLOCO} — o teto do servidor vence o pedido da tela`);

console.log();
if (falhas > 0) { console.log(`--- lista de contas: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- lista de contas (busca sem acento, parametros fechados): ${feitas} verificacoes, 0 falhas`);
