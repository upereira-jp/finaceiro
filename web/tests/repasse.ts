/*
 * A DIVISÃO DO DINHEIRO DO CLIENTE, do jeito que a tela a mostra.
 *
 * A regra que o dono declarou em 21/08/2026: fora o que vai para a Equatorial,
 * **70% para o dono da usina e 30% para a G3**. Só o primeiro número é editável;
 * o segundo é derivado, porque duas cópias da mesma informação divergem.
 *
 * Rodar: node --experimental-strip-types web/tests/repasse.ts
 */
import {
  parteDaG3, divisaoEmPalavras, parteDaG3ComComissao, comVirgula,
} from '../src/repasse-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ===========================================================================
// P1 — o complemento
// ===========================================================================

chk('P1a', parteDaG3('70') === '30.00', 'a regra do dono: 70 para a usina deixa 30,00 na G3');
chk('P1b', parteDaG3('70,00') === '30.00', 'aceita a vírgula que a pessoa digita');
chk('P1c', parteDaG3('70.00') === '30.00', 'e o ponto, que é como o servidor recebe');
chk('P1d', parteDaG3('65,5') === '34.50', 'renegociar para 65,5 deixa 34,50 — a casa some, o valor não');
chk('P1e', parteDaG3('100') === '0.00', 'repasse de 100% deixa ZERO, e isso é dizível');
chk('P1f', parteDaG3('0') === '100.00', 'e repasse zero deixa tudo');

/* EXATIDÃO: `100 - 69.99` em ponto flutuante dá 30.009999999999998, e esse
 * número apareceria na tela ao lado de um campo de dinheiro. */
chk('P1g', parteDaG3('69,99') === '30.01',
    '69,99 deixa 30,01 exato — em ponto flutuante daria 30,009999999999998');
chk('P1h', parteDaG3('0,01') === '99.99', 'um centésimo de percentual fecha nas duas casas');

chk('P1i', parteDaG3('101') === null, 'acima de 100% não há complemento — devolve nada em vez de negativo');
chk('P1j', parteDaG3('') === null && parteDaG3('abc') === null && parteDaG3('7,999') === null,
    'vazio, texto e casas demais não viram número — a tela não pisca com o que não entende');

chk('P1k', comVirgula('30.00') === '30,00', 'a tela mostra vírgula; o servidor recebe ponto');

// ===========================================================================
// P2 — a frase
// ===========================================================================

chk('P2a', divisaoEmPalavras('70') === '70% para o dono da usina · 30,00% fica na G3',
    'a frase diz os DOIS lados — quem digita 70 vê a outra metade do que escreveu');
chk('P2b', divisaoEmPalavras('') === null,
    'enquanto o número não é legível, não há frase: um aviso que pisca a cada tecla é pior que nenhum');

// ===========================================================================
// P3 — as duas primeiras cobranças, com comissão
// ===========================================================================

/* Com 70% de repasse e 25% de comissão, sobram 5% para a G3 nas duas primeiras
 * cobranças cheias. Quem lê "30% fica na G3" e recebe 5% no primeiro mês vai
 * achar que o sistema errou — por isso a tela diz. */
chk('P3a', parteDaG3ComComissao('70', '25') === '5.00',
    '70 de repasse + 25 de comissão deixam 5,00% nas duas primeiras cobranças');
chk('P3b', parteDaG3ComComissao('70', '30') === '0.00',
    'com captador sênior (30%) não sobra nada — e zero é um resultado, não um erro');

/* NEGATIVO É LEGÍTIMO e a tela precisa poder dizer: o custo de trazer o cliente é
 * concentrado no começo, e o PRD manda mostrá-lo sem suavização. */
chk('P3c', parteDaG3ComComissao('75', '30') === '-5.00',
    'repasse renegociado para 75 com comissão de 30 fica NEGATIVO, e o sinal aparece');

chk('P3d', parteDaG3ComComissao('70', '0') === '30.00',
    'sem comissão — da 3ª cobrança em diante — a G3 fica com os 30% da regra');
chk('P3e', parteDaG3ComComissao('70', '') === null && parteDaG3ComComissao('', '25') === null,
    'faltando qualquer um dos dois, não há resposta — e não uma resposta errada');

console.log(`\n--- divisão do repasse: ${falhas === 0 ? 'todas passaram' : `${falhas} falha(s)`}`);
process.exit(falhas === 0 ? 0 : 1);
