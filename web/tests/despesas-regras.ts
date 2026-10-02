// Suíte das contas da planilha da empresa (`web/src/despesas-regras.ts`).
//
// Os casos saem da planilha `G3Solar_Financeiro.xlsx` (commit 9ea5752): o único
// lançamento dela é o aluguel da sala comercial, R$ 4.319,00, mensal, competência
// 10/2026, vencimento 10/10/2026 — e a aba Projeção, com início em 10/2026,
// mostra esse valor em cada um dos 24 meses. Os demais casos exercitam as
// colunas auxiliares V, W e X (início da série, fim, intervalo).

import {
  situacao, diasAte, somarMeses, somarMesesAoDia, mesesEntre, saldo, pagoEmCaixa, ajusteDasBaixas, textoDaSerie,
  painelDoMes, situacaoDoMes, porPlanoNoMes, anoMesAMes, seriesQueProjetam, projetar, indicadoresDoPeriodo,
  projecaoPorPlano, decomporBaixa, SEM_PLANO, ROTULO_DA_SITUACAO_DA_DESPESA, ROTULO_DA_RECORRENCIA,
} from '../src/despesas-regras.ts';
import type { Despesa, CategoriaDaEmpresa } from '../src/api.ts';
import { SELO_DA_DESPESA } from '../src/tom-do-estado.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const HOJE = '2026-10-02';

let seq = 0;
const despesa = (p: Partial<Despesa>): Despesa => ({
  id: `d${++seq}`, descricao: 'Aluguel da sala comercial', beneficiario_nome: 'Imobiliária',
  valor_centavos: 431_900, valor_pago_centavos: 0,
  competencia: '2026-10-01T00:00:00.000Z', vencimento: '2026-10-10T00:00:00.000Z',
  status: 'aberta', criado_em: `2026-10-02T00:00:${String(seq).padStart(2, '0')}.000Z`, cancelada_em: null,
  categoria_id: 'adm', natureza: 'fixa', recorrencia: 'avulsa', recorrente_ate: null, serie_id: null,
  parcela_numero: null, parcela_total: null, forma_prevista: 'boleto', origem_pagamento_id: null,
  numero_documento: null, comprovante_url: null, observacao: null, pagamento: [], ...p,
});

const CATEGORIAS: CategoriaDaEmpresa[] = [
  { id: 'adm', nome: 'Despesas Administrativas', ativo: true, ordem: 1 },
  { id: 'tec', nome: 'Tecnologia e Software', ativo: true, ordem: 7 },
  { id: 'pes', nome: 'Despesas com Pessoal', ativo: true, ordem: 2 },
];

// ------------------------------------------------------ datas
chk('D1', diasAte('2026-10-10', HOJE) === 8 && diasAte('2026-09-30', HOJE) === -2, 'dias até o vencimento: +8 e −2');
chk('D2', somarMeses('2026-11', 2) === '2027-01' && somarMeses('2026-01', -1) === '2025-12', 'somar meses vira o ano nos dois sentidos');
chk('D3', somarMesesAoDia('2026-01-31', 1) === '2026-02-28' && somarMesesAoDia('2028-01-31', 1) === '2028-02-29',
    '31/01 + 1 mês é o último dia de fevereiro, inclusive no bissexto');
chk('D4', mesesEntre('2026-10', '2027-03') === 5, 'de 10/2026 a 03/2027 são 5 meses');

// ------------------------------------------------------ situação (coluna N da planilha)
chk('S1', situacao(despesa({ vencimento: '2026-09-30' }), HOJE) === 'vencida', 'vencimento antes de hoje é VENCIDA');
chk('S2', situacao(despesa({ vencimento: HOJE }), HOJE) === 'vence_hoje', 'vencimento hoje é VENCE HOJE');
chk('S3', situacao(despesa({}), HOJE) === 'a_vencer', 'vencimento depois de hoje é A VENCER');
chk('S4', situacao(despesa({ vencimento: '2026-09-30', status: 'paga' }), HOJE) === 'paga', 'paga é PAGA mesmo com a data passada');
chk('S5', situacao(despesa({ status: 'cancelada' }), HOJE) === 'cancelada', 'cancelada é cancelada');
chk('S6', situacao(despesa({ vencimento: '2026-09-30', status: 'parcial', valor_pago_centavos: 100 }), HOJE) === 'vencida',
    'paga em parte segue a DATA: o resto atrasou');
chk('S7', Object.keys(ROTULO_DA_SITUACAO_DA_DESPESA).every((k) => k in SELO_DA_DESPESA),
    'toda situação tem rótulo e selo');

// ------------------------------------------------------ baixa (colunas K, L e M)
const comJuros = despesa({
  status: 'paga', valor_pago_centavos: 431_900,
  pagamento: [{ id: 'p', data_pagamento: '2026-10-12', valor_centavos: 431_900, acrescimo_centavos: 8_638,
    desconto_centavos: 0, forma: 'boleto', origem_pagamento_id: null, referencia_externa: null, observacao: null }],
});
chk('B1', pagoEmCaixa(comJuros) === 440_538 && ajusteDasBaixas(comJuros) === 8_638,
    'pago com 2% de multa: saiu R$ 4.405,38 e o acréscimo é R$ 86,38');
chk('B2', saldo(comJuros) === 0 && saldo(despesa({ status: 'cancelada' })) === 0, 'paga e cancelada não deixam saldo');
const b1 = decomporBaixa(431_900, 440_538, null);
chk('B3', typeof b1 === 'object' && b1.valor_centavos === 431_900 && b1.acrescimo_centavos === 8_638,
    'saiu mais que o saldo: abate o saldo e o resto é juros/multa');
const b2 = decomporBaixa(431_900, 420_000, 'desconto');
chk('B4', typeof b2 === 'object' && b2.valor_centavos === 431_900 && b2.desconto_centavos === 11_900,
    'saiu menos e foi desconto: abate o saldo inteiro e registra o desconto');
const b3 = decomporBaixa(431_900, 200_000, 'parcial');
chk('B5', typeof b3 === 'object' && b3.valor_centavos === 200_000 && b3.desconto_centavos === 0,
    'saiu menos e foi parte: abate só o que saiu');
chk('B6', typeof decomporBaixa(431_900, 200_000, null) === 'string' && typeof decomporBaixa(431_900, 0, null) === 'string',
    'menos sem dizer o motivo, ou zero, devolve a frase do problema e não um pagamento');

// ------------------------------------------------------ série
chk('R1', textoDaSerie(despesa({ recorrencia: 'mensal', serie_id: 's' })) === 'Mensal'
       && textoDaSerie(despesa({ recorrencia: 'parcelada', serie_id: 's', parcela_numero: 3, parcela_total: 10 })) === '3/10'
       && textoDaSerie(despesa({})) === null, 'a série aparece como «Mensal» ou «3/10»; a avulsa, sem nada');

// ------------------------------------------------------ Painel (aba Painel, linha 8)
const aluguel = despesa({ recorrencia: 'mensal', serie_id: 'aluguel' });
const software = despesa({
  descricao: 'Software', categoria_id: 'tec', natureza: 'variavel', valor_centavos: 50_000,
  vencimento: '2026-10-05', status: 'paga', valor_pago_centavos: 50_000,
  pagamento: [{ id: 'q', data_pagamento: '2026-10-05', valor_centavos: 50_000, acrescimo_centavos: 0,
    desconto_centavos: 0, forma: 'cartao_credito', origem_pagamento_id: null, referencia_externa: null, observacao: null }],
});
const atrasada = despesa({ descricao: 'Contador', categoria_id: null, valor_centavos: 120_000, vencimento: '2026-09-25', competencia: '2026-09-01' });
const cancelada = despesa({ descricao: 'Cancelada', valor_centavos: 999_999, status: 'cancelada' });
const LINHAS = [aluguel, software, atrasada, cancelada];

const p = painelDoMes(LINHAS, '2026-10', HOJE);
chk('P1', p.previsto === 481_900, `previsto do mês = aluguel + software = 4.819,00 (deu ${p.previsto}); a cancelada não conta`);
chk('P2', p.pago === 50_000 && p.em_aberto === 431_900, 'pago 500,00 e em aberto 4.319,00');
chk('P3', p.liquidado_pct === 10.4, `liquidado = 1 − aberto/previsto = 10,4% (deu ${p.liquidado_pct})`);
chk('P4', p.vencido_acumulado === 120_000 && p.vencidos === 1, 'vencido acumulado pega o contador de setembro');
chk('P5', p.vence_em_7_dias === 0 && painelDoMes(LINHAS, '2026-10', '2026-10-03').vence_em_7_dias === 431_900,
    'o aluguel (10/10) não vence em 7 dias a partir de 02/10, e vence a partir de 03/10 (limite incluso)');
chk('P6', painelDoMes([], '2026-10', HOJE).liquidado_pct === 0, 'mês vazio: 0%, sem dividir por zero');

const sm = situacaoDoMes(LINHAS, '2026-10', HOJE);
chk('P7', sm.pago === 50_000 && sm.a_vencer === 431_900 && sm.vencido === 0, 'situação de outubro: pago, a vencer, vencido');

const pp = porPlanoNoMes(LINHAS, '2026-10', CATEGORIAS);
chk('P8', pp.linhas.map((l) => l.nome).join('|') === 'Despesas Administrativas|Tecnologia e Software',
    'por plano: na ordem do plano, sem as linhas zeradas');
chk('P9', pp.linhas[0]!.pct === 89.6 && pp.total.previsto === 481_900, '% do total da Administrativa = 89,6');
const ppSem = porPlanoNoMes([atrasada], '2026-09', CATEGORIAS);
chk('P10', ppSem.linhas.length === 1 && ppSem.linhas[0]!.nome === SEM_PLANO, 'despesa sem plano vai para «Sem plano de contas»');

const ano = anoMesAMes(LINHAS, 2026);
chk('P11', ano.meses.length === 12 && ano.meses[9]!.previsto === 481_900 && ano.meses[8]!.previsto === 120_000,
    'previsto × realizado: outubro e setembro nos seus meses');
chk('P12', ano.total.fixas === 431_900 + 120_000 && ano.total.variaveis === 50_000, 'fixas e variáveis do ano');

// ------------------------------------------------------ Projeção (aba Projeção)
const proj = projetar([aluguel], '2026-10', 24);
chk('J1', proj.meses.length === 24 && proj.meses.every((m) => m.total === 431_900),
    'o exemplo da planilha: aluguel mensal de 4.319,00 aparece nos 24 meses');
chk('J2', proj.meses[0]!.lancado === 431_900 && proj.meses[0]!.projetado === 0 && proj.meses[1]!.projetado === 431_900,
    'outubro é lançado; de novembro em diante, projetado');
chk('J3', proj.meses[23]!.acumulado === 24 * 431_900, 'o acumulado de 24 meses é 24 aluguéis');

const comFim = despesa({ recorrencia: 'mensal', serie_id: 'x', recorrente_ate: '2027-01-01' });
const pf = projetar([comFim], '2026-10', 24);
chk('J4', pf.meses.filter((m) => m.total > 0).map((m) => m.mes).join(',') === '2026-10,2026-11,2026-12,2027-01',
    '«recorrente até» 01/2027 para a repetição em janeiro, incluso');

const tri = despesa({ recorrencia: 'trimestral', serie_id: 't', valor_centavos: 30_000 });
const pt = projetar([tri], '2026-10', 12);
chk('J5', pt.meses.filter((m) => m.total > 0).map((m) => m.mes).join(',') === '2026-10,2027-01,2027-04,2027-07',
    'trimestral repete a cada 3 meses');

const parc = [1, 2, 3].map((n) => despesa({
  recorrencia: 'parcelada', serie_id: 'p', parcela_numero: n, parcela_total: 3, valor_centavos: 10_000,
  vencimento: somarMesesAoDia('2026-10-10', n - 1), competencia: `${somarMeses('2026-10', n - 1)}-01`,
}));
const pparc = projetar(parc, '2026-10', 6);
chk('J6', pparc.meses.map((m) => m.projetado).every((v) => v === 0) && pparc.meses.slice(0, 3).every((m) => m.lancado === 10_000),
    'parcelada não projeta: as três parcelas já estão lançadas');
chk('J7', projetar([despesa({})], '2026-10', 24).meses.slice(1).every((m) => m.total === 0), 'avulsa não projeta');

const novembro = despesa({ recorrencia: 'mensal', serie_id: 'aluguel', vencimento: '2026-11-10', competencia: '2026-11-01', valor_centavos: 450_000 });
const pn = projetar([aluguel, novembro], '2026-10', 4);
chk('J8', pn.meses.map((m) => m.total).join(',') === '431900,450000,450000,450000',
    'o molde é o ÚLTIMO título: lançado o de novembro com valor novo, a projeção segue o valor novo');
const so = seriesQueProjetam([aluguel, novembro]);
chk('J9', so.length === 1 && so[0]!.proximo_vencimento === '2026-12-10' && so[0]!.proxima_competencia === '2026-12',
    'a série tem um só molde, e o próximo vence em 10/12');
chk('J10', seriesQueProjetam([comFim, despesa({ recorrencia: 'mensal', serie_id: 'x', recorrente_ate: '2027-01-01',
  vencimento: '2027-01-10', competencia: '2027-01-01' })])[0]!.proximo_vencimento === null,
    'com o último mês já lançado, a série não tem próximo');
chk('J11', projetar([despesa({ recorrencia: 'mensal', serie_id: 'c', status: 'cancelada' })], '2026-10', 3).meses.every((m) => m.total === 0),
    'série cancelada não projeta');

const ind = indicadoresDoPeriodo(proj, '2026-10', '2027-03');
chk('J12', ind.total === 6 * 431_900 && ind.media === 431_900 && ind.meses === 6 && ind.proximos_12 === 12 * 431_900,
    'período de 10/2026 a 03/2027 (o da planilha): 6 meses, total, média e 12 meses');
const pplano = projecaoPorPlano(proj, '2026-10', '2027-03', CATEGORIAS);
chk('J13', pplano.linhas.length === 1 && pplano.linhas[0]!.nome === 'Despesas Administrativas' && pplano.total === ind.total,
    'por plano no período bate com o total do período');

const rotulos = [...Object.values(ROTULO_DA_SITUACAO_DA_DESPESA), ...Object.values(ROTULO_DA_RECORRENCIA)];
chk('V1', rotulos.every((r) => !/[a-z]_[a-z]/.test(r)), 'nenhum rótulo mostra nome de coluna');

console.log(`\n${falhas === 0 ? `despesas-regras: ${feitas} verificacoes, 0 falhas\nDESPESAS_REGRAS_OK`
                              : `despesas-regras: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
