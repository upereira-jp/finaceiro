// O CONTRATO QUE MUDOU DE UC (SPEC-002 R28). Pura, sem banco e sem CRM.
// Uso: node --experimental-strip-types tests/troca-de-uc.ts
//
// Os dois lados do modo de falha, como na R27:
//
//   - NAO SOLTAR o ponteiro velho: a UC antiga prende usina e percentual, a nova
//     entra com o mesmo contrato, e a trava R11 derruba o ciclo. Foi o 24/09/2026;
//   - SOLTAR quando havia historia: o vinculo muda de dono sem ninguem decidir, e
//     com contrato isso e comissao para a pessoa errada (Q-UCMUDOU-01).
//
// Cada guarda tem o seu caso mudo ao lado do falante, com uma diferenca so.

import { decidirTrocas, historiaQueRetem, type UcComContrato, type LinhaLida } from '../src/dominio/troca-de-uc.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const SEM = { contratos: 0, faturas: 0, contas_lidas: 0 };
const uc = (numero: string, contrato: string, o: Partial<UcComContrato> = {}): UcComContrato => ({
  id: `id-${numero}`, numero_uc: numero, crm_usina_cliente_id: contrato,
  codigo_geradora: '04', percentual_rateio: '9.0000', historia: SEM, ...o,
});
const l = (contrato: string, numero: string | null): LinhaLida => ({ contrato_id: contrato, uc: numero });
/** A entrada grava todo contrato lido - o caso normal; o T11 tira um de proposito. */
const todos = (ls: readonly LinhaLida[]) => new Set(ls.map((x) => x.contrato_id));
const decidir = (v: readonly UcComContrato[], ls: readonly LinhaLida[]) => decidirTrocas(v, ls, todos(ls));
const soltos = (d: ReturnType<typeof decidirTrocas>) => d.soltar.map((t) => `${t.uc.numero_uc}>${t.para}`).sort().join(',');

// Pano de fundo: uma carteira de 12 UCs que nao mexem, para o freio ter base.
const fundo = Array.from({ length: 12 }, (_, i) => uc(`F${i}`, `cf-${i}`));
const fundoLido = fundo.map((u) => l(u.crm_usina_cliente_id, u.numero_uc));

// ---- T1: o caso real de 24/09. A Carla mudou de numero e a UC antiga nao tem nada.
{
  const carla = uc('000000100076075', 'd7d1758d');
  const d = decidir([...fundo, carla], [...fundoLido, l('d7d1758d', '000091762801211')]);
  chk('T1', soltos(d) === '000000100076075>000091762801211' && d.retidas.length === 0,
      `24/09: o ponteiro da UC antiga da Carla e solto e o contrato fica livre para a nova (${soltos(d)})`);
}

// ---- T2..T2c: a historia retem, uma de cada vez - cada uma sozinha basta.
for (const [id, h, palavra] of [
  ['T2', { ...SEM, contratos: 1 }, 'contrato'],
  ['T2b', { ...SEM, faturas: 2 }, 'fatura'],
  ['T2c', { ...SEM, contas_lidas: 1 }, 'conta'],
] as const) {
  const d = decidir([...fundo, uc('VELHA', 'ct', { historia: h })], [...fundoLido, l('ct', 'NOVA')]);
  chk(id, d.soltar.length === 0 && d.retidas.length === 1 && new RegExp(palavra).test(d.retidas[0].motivo)
       && /destravar-uc/.test(d.retidas[0].motivo),
      `com ${palavra} na UC antiga a troca e RETIDA e o motivo manda ao destravar-uc`);
}
chk('T2d', historiaQueRetem(SEM).length === 0 && historiaQueRetem({ contratos: 1, faturas: 1, contas_lidas: 1 }).length === 3,
    'historia vazia nao retem; as tres contagens aparecem no motivo');

// ---- T3/T3b: caminho limpo. Contrato na mesma UC, e contrato fora da leitura (e a R27).
{
  const d = decidir([...fundo, uc('X', 'ct')], [...fundoLido, l('ct', 'X')]);
  chk('T3', d.soltar.length === 0 && d.retidas.length === 0, 'contrato na mesma UC: nada a trocar, nada a dizer');
  const d2 = decidir([...fundo, uc('X', 'ct')], fundoLido);
  chk('T3b', d2.soltar.length === 0 && d2.retidas.length === 0,
      'contrato que sumiu da leitura nao e troca - e saida, e a R27 cuida');
}

// ---- T4: espaco em volta do numero no CRM nao e troca.
{
  const d = decidir([...fundo, uc('X', 'ct')], [...fundoLido, l('ct', '  X ')]);
  chk('T4', d.soltar.length === 0 && d.retidas.length === 0, 'o numero e comparado limpo, como a entrada o grava');
}

// ---- T5/T5b: a permuta do Carlos Gabriel. As duas saem juntas - e se uma tem
// historia, a outra fica presa pela guarda 3 em vez de trocar uma recusa por outra.
{
  const a = uc('000287800501262', 'e8ae88b1', { percentual_rateio: '2.0000' });
  const b = uc('000359808001273', 'b0c9035c', { percentual_rateio: '3.4600' });
  const lido = [...fundoLido, l('e8ae88b1', '000359808001273'), l('b0c9035c', '000287800501262')];
  const d = decidir([...fundo, a, b], lido);
  chk('T5', d.soltar.length === 2 && d.retidas.length === 0,
      `permuta entre duas UCs sem historia: as duas sao soltas na mesma decisao (${soltos(d)})`);
  const d2 = decidir([...fundo, a, { ...b, historia: { ...SEM, faturas: 1 } }], lido);
  chk('T5b', d2.soltar.length === 0 && d2.retidas.length === 2
       && d2.retidas.some((t) => /segundo conflito/.test(t.motivo)),
      'permuta em que um lado tem fatura: NENHUM e solto, e o outro diz que ha segundo conflito');
}

// ---- T6/T6b: a UC nova ja esta presa a um contrato que NAO esta mudando.
{
  const d = decidir([...fundo, uc('VELHA', 'ct'), uc('NOVA', 'outro')],
                          [...fundoLido, l('ct', 'NOVA'), l('outro', 'NOVA')]);
  chk('T6', d.soltar.length === 0 && d.retidas.length === 1 && /UC-DUP/.test(d.retidas[0].motivo),
      'dois contratos para a UC nova na leitura: retido pela UC-DUP, nao pela historia');
  const d2 = decidir([...fundo, uc('VELHA', 'ct'), uc('NOVA', 'outro')],
                           [...fundoLido, l('ct', 'NOVA')]);
  chk('T6b', d2.soltar.length === 0 && d2.retidas.length === 1 && /segundo conflito/.test(d2.retidas[0].motivo),
      'UC nova presa a contrato que sumiu da leitura (e da R27): retido, porque soltar trocaria uma recusa por outra');
}

// ---- T7: o contrato aparece em duas UCs na mesma leitura.
{
  const d = decidir([...fundo, uc('X', 'ct')], [...fundoLido, l('ct', 'Y'), l('ct', 'Z')]);
  chk('T7', d.soltar.length === 0 && d.retidas.length === 1 && /2 UCs/.test(d.retidas[0].motivo),
      'contrato em duas UCs: a leitura se contradiz e nada e solto');
}

// ---- T8/T8b: o freio de massa, com o caso mudo exatamente no teto.
{
  // 12 de fundo + 6 que podem mudar = 18 com contrato -> teto max(3, ceil(4,5)) = 5.
  const mudam = Array.from({ length: 6 }, (_, i) => uc(`V${i}`, `cm-${i}`));
  const lido = (n: number) => [...fundoLido, ...mudam.slice(0, n).map((u, i) => l(u.crm_usina_cliente_id, `N${i}`)),
                               ...mudam.slice(n).map((u) => l(u.crm_usina_cliente_id, u.numero_uc))];
  const d = decidir([...fundo, ...mudam], lido(6));
  chk('T8', d.soltar.length === 0 && d.retidas.length === 6 && /freio/.test(d.retidas[0].motivo),
      `6 trocas com teto 5: acima do freio, NENHUMA e solta (${d.retidas.length} retidas)`);
  const d2 = decidir([...fundo, ...mudam], lido(5));
  chk('T8b', d2.soltar.length === 5 && d2.retidas.length === 0, 'no teto exato (5 com teto 5) todas saem');
}

// ---- T9: a UC que a R27 soltou guarda o contrato como rastro, e tambem prende.
{
  const rastro = uc('X', 'ct', { codigo_geradora: null, percentual_rateio: null });
  const d = decidir([...fundo, rastro], [...fundoLido, l('ct', 'Y')]);
  chk('T9', soltos(d) === 'X>Y', 'rastro da R27 sem usina: se o contrato volta noutra UC, o ponteiro velho e solto');
}

// ---- T10: linha do CRM sem numero de UC nao conta como troca (a entrada a recusa).
{
  const d = decidir([...fundo, uc('X', 'ct')], [...fundoLido, l('ct', null), l('ct', '   ')]);
  chk('T10', d.soltar.length === 0 && d.retidas.length === 0, 'numero vazio no CRM: nada e decidido por ele');
}

// ---- T11/T11b: contrato que a entrada recusa por outro motivo (usina que nao
// existe aqui, linha sem lead) nao e troca - soltar deixaria o contrato sem UC.
{
  const lido = [...fundoLido, l('d7d1758d', '000091762801211')];
  const d = decidirTrocas([...fundo, uc('000000100076075', 'd7d1758d')], lido, todos(fundoLido));
  chk('T11', d.soltar.length === 0 && d.retidas.length === 0,
      'contrato fora do que a entrada grava: nada solto e nada dito - a recusa da entrada ja fala');
  const d2 = decidirTrocas([...fundo, uc('000000100076075', 'd7d1758d')], lido, todos(lido));
  chk('T11b', d2.soltar.length === 1, 'o mesmo caso com o contrato entrando: solto');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
