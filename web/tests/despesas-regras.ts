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
  projecaoPorPlano, decomporBaixa, devidoAosSocios, SEM_PLANO, ROTULO_DA_SITUACAO_DA_DESPESA, ROTULO_DA_RECORRENCIA,
  situacaoDaCarteira, matrizPorPlano, linhaDoAcumulado, filtrarDespesas, ordenarDespesas, mesDaBusca, buscaComMes,
  colunasDoCsvDeDespesas, csvDaProjecao, grupoDe, nomeNoPlano,
} from '../src/despesas-regras.ts';
import { readFileSync } from 'node:fs';
import { paraCsv } from '../src/csv.ts';
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
  numero_documento: null, comprovante_url: null, observacao: null, reembolso_de_pagamento_id: null, pagamento: [], ...p,
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

// ------------------------------------------------------ a dívida com o sócio (Q-SOCIOS-01)
const reembolso = despesa({ descricao: 'Reembolso a Vinicius Leal — Internet', beneficiario_nome: 'Vinicius Leal',
  valor_centavos: 35_990, categoria_id: null, natureza: null, vencimento: '2026-09-20', competencia: '2026-09-01',
  reembolso_de_pagamento_id: 'pg1' });
const reembolsoRenata = despesa({ beneficiario_nome: 'Renata Estevam', valor_centavos: 10_000, natureza: null,
  categoria_id: null, reembolso_de_pagamento_id: 'pg2', status: 'parcial', valor_pago_centavos: 4_000 });
const COM_SOCIOS = [...LINHAS, reembolso, reembolsoRenata];
chk('Q1', situacao(reembolso, HOJE) === 'a_reembolsar', 'a dívida com o sócio não «vence»: é «A reembolsar», mesmo com a data passada');
const pq = painelDoMes(COM_SOCIOS, '2026-10', HOJE);
chk('Q2', pq.previsto === p.previsto && pq.vencido_acumulado === p.vencido_acumulado && pq.vence_em_7_dias === p.vence_em_7_dias,
    'o Painel não muda com a dívida ao sócio: ela é dívida, e a despesa que ele pagou já foi contada');
chk('Q3', projetar(COM_SOCIOS, '2026-09', 3).meses.map((m) => m.lancado).join() === projetar(LINHAS, '2026-09', 3).meses.map((m) => m.lancado).join(),
    'a Projeção também a deixa de fora');
const ds = devidoAosSocios(COM_SOCIOS);
chk('Q4', ds.total === 35_990 + 6_000 && ds.socios.map((x) => `${x.nome}:${x.centavos}`).join() === 'Vinicius Leal:35990,Renata Estevam:6000',
    'devido aos sócios: o saldo de cada um, do maior para o menor (a Renata já recebeu 40,00 dos 100,00)');
chk('Q5', devidoAosSocios(LINHAS).total === 0, 'sem reembolso, ninguém deve a sócio nenhum');

const rotulos = [...Object.values(ROTULO_DA_SITUACAO_DA_DESPESA), ...Object.values(ROTULO_DA_RECORRENCIA)];
chk('V1', rotulos.every((r) => !/[a-z]_[a-z]/.test(r)), 'nenhum rótulo mostra nome de coluna');

// ====================================================== 06/10/2026 — etapa 1 do controle total
// As lacunas da auditoria da planilha que moram nas regras. Família K (as letras S,
// P e J já tinham os números 7 a 12, com outro sentido).

// ------------------------------------------------------ K1/K2 a situação da carteira inteira (lacuna 2)
const setembroAtrasado = despesa({ descricao: 'Contador de agosto', valor_centavos: 70_000, vencimento: '2026-08-25', competencia: '2026-08-01' });
const dezembro = despesa({ descricao: 'Seguro', valor_centavos: 90_000, vencimento: '2026-12-15', competencia: '2026-12-01' });
const carteira = situacaoDaCarteira([...LINHAS, setembroAtrasado, dezembro], HOJE);
chk('K1', carteira.pago === 50_000 && carteira.vencido === 120_000 + 70_000 && carteira.a_vencer === 431_900 + 90_000,
    `a carteira inteira soma TODOS os meses (a planilha não filtra o mês): pago 500,00, vencido 1.900,00, a vencer 5.219,00 — deu ${JSON.stringify(carteira)}`);
const doMes = situacaoDoMes([...LINHAS, setembroAtrasado, dezembro], '2026-10', HOJE);
const comSocio = situacaoDaCarteira([despesa({ reembolso_de_pagamento_id: 'pg', valor_centavos: 5_000 })], HOJE);
chk('K2', doMes.vencido === 0 && doMes.a_vencer === 431_900 && comSocio.a_vencer === 0 && comSocio.vencido === 0,
    'a do mês continua só com outubro, e a dívida com o sócio fica fora das duas (é dívida, não despesa)');

// ------------------------------------------------------ K3/K4 «recorrente até» pelo vencimento (lacuna 3)
/* Competência de setembro, vence em 10 de outubro, repete até NOVEMBRO: pela planilha
   são outubro e novembro; pela competência seria até dezembro. */
const atrasadaNaComp = despesa({ recorrencia: 'mensal', serie_id: 'c', competencia: '2026-09-01', vencimento: '2026-10-10', recorrente_ate: '2026-11-01' });
const pc = projetar([atrasadaNaComp], '2026-10', 6);
chk('K3', pc.meses.filter((m) => m.total > 0).map((m) => m.mes).join(',') === '2026-10,2026-11',
    `projeta outubro e novembro e para: o corte é o mês do VENCIMENTO, como a coluna W (deu ${pc.meses.filter((m) => m.total > 0).map((m) => m.mes).join(',')})`);
const novDaSerie = despesa({ recorrencia: 'mensal', serie_id: 'c', competencia: '2026-10-01', vencimento: '2026-11-10', recorrente_ate: '2026-11-01' });
chk('K4', seriesQueProjetam([atrasadaNaComp, novDaSerie])[0]!.proximo_vencimento === null
      && seriesQueProjetam([atrasadaNaComp])[0]!.proximo_vencimento === '2026-11-10',
    'com novembro lançado, a série acabou (não há «Lançar o próximo» de dezembro); antes dele, o próximo vence em 10/11');

// ------------------------------------------------------ K5–K7 a Projeção por plano mês a mês e o acumulado (lacunas 7 e 8)
const CAT2: CategoriaDaEmpresa[] = [
  ...CATEGORIAS,
  { id: 'alu', nome: 'Aluguel e condomínio', ativo: true, ordem: 1, pai_id: 'adm', natureza: 'despesa' },
  { id: 'inv', nome: 'Investimentos', ativo: true, ordem: 13, pai_id: null, natureza: 'investimento' },
  { id: 'equ', nome: 'Equipamentos', ativo: true, ordem: 1, pai_id: 'inv', natureza: 'investimento' },
];
const naSub = despesa({ categoria_id: 'alu', recorrencia: 'mensal', serie_id: 'alu', valor_centavos: 100_000 });
const equip = despesa({ categoria_id: 'equ', valor_centavos: 300_000, vencimento: '2026-11-20', competencia: '2026-11-01' });
const pm = projetar([aluguel, software, naSub, equip], '2026-10', 24);
const mz = matrizPorPlano(pm, CAT2);
chk('K5', mz.meses.length === 24 && mz.meses.every((_, i) => mz.linhas.reduce((s, l) => s + l.meses[i]!, 0) === pm.meses[i]!.total),
    'a matriz plano × mês fecha: em cada um dos 24 meses, a soma das linhas é o total do mês da Projeção');
chk('K6', mz.linhas.map((l) => l.nome).join('|') === 'Despesas Administrativas|Tecnologia e Software|Investimentos'
      && mz.linhas[0]!.meses[1] === 431_900 + 100_000 && mz.linhas[2]!.total === 300_000,
    'uma linha por GRUPO, na ordem do plano: a subcategoria (Aluguel e condomínio) soma no grupo dela, e o Investimento tem a linha dele');
const acc = linhaDoAcumulado(pm);
chk('K7', acc.length === 24 && acc.every((v, i) => i === 0 || v >= acc[i - 1]!) && acc[23] === 1 && acc[0]! > 0,
    'a linha do acumulado no gráfico só sobe, começa acima de zero e termina no topo (100% do período)');

// ------------------------------------------------------ K8/K9 a subcategoria no Painel
const pk = porPlanoNoMes([aluguel, naSub, equip], '2026-10', CAT2);
const pk11 = porPlanoNoMes([equip], '2026-11', CAT2);
chk('K8', pk.linhas.length === 1 && pk.linhas[0]!.nome === 'Despesas Administrativas' && pk.linhas[0]!.previsto === 531_900
      && pk.linhas[0]!.subs?.length === 1 && pk.linhas[0]!.subs![0]!.nome === 'Aluguel e condomínio' && pk.linhas[0]!.subs![0]!.previsto === 100_000,
    'no Painel a subcategoria soma no grupo (4.319,00 direto + 1.000,00 na sub = 5.319,00) e aparece no detalhe');
chk('K9', pk11.linhas[0]!.fora_do_resultado === true && !pk.linhas[0]!.fora_do_resultado
      && grupoDe('equ', CAT2) === 'inv' && grupoDe('nao-existe', CAT2) === null
      && nomeNoPlano('alu', CAT2) === 'Despesas Administrativas › Aluguel e condomínio',
    'o grupo de investimento vem marcado como fora do resultado, e o nome no plano mostra grupo › subcategoria');

// ------------------------------------------------------ X1–X5 filtros e ordem (lacuna 10)
const fx = [
  despesa({ descricao: 'A', natureza: 'fixa', recorrencia: 'mensal', serie_id: 's1', forma_prevista: 'boleto', origem_pagamento_id: 'pj', numero: 7, valor_centavos: 20_000 }),
  despesa({ descricao: 'B', natureza: 'variavel', categoria_id: 'tec', forma_prevista: 'pix', origem_pagamento_id: 'socio', valor_centavos: 9_000, numero: 8,
    fornecedor_id: 'f1', centro_custo_id: 'com', competencia: '2026-09-01', observacao: 'pago pelo Vinícius em espécie' }),
  despesa({ descricao: 'C', natureza: null, categoria_id: 'alu', forma_prevista: null, origem_pagamento_id: null, valor_centavos: 50_000, numero: 9, beneficiario_nome: 'Ábaco' }),
];
const so2 = (f: Partial<Parameters<typeof filtrarDespesas>[1]>) =>
  filtrarDespesas(fx, { vista: 'todas', ...f }, HOJE, CAT2).map((d) => d.descricao).join('');
chk('X1', so2({ natureza: 'fixa' }) === 'A' && so2({ natureza: '-' }) === 'C' && so2({ recorrencia: 'mensal' }) === 'A' && so2({ recorrencia: 'avulsa' }) === 'BC',
    'filtra por tipo (fixa, variável, sem tipo) e por recorrência');
chk('X2', so2({ forma: 'pix' }) === 'B' && so2({ origem: 'pj' }) === 'A' && so2({ origem: '-' }) === 'C',
    'filtra pela forma prevista e pela origem («sai de»), inclusive «sem origem»');
chk('X3', so2({ competencia: '2026-09' }) === 'B' && so2({ fornecedor: 'f1' }) === 'B' && so2({ centro: 'com' }) === 'B'
      && so2({ plano: 'adm' }) === 'AC' && so2({ plano: 'alu' }) === 'C',
    'filtra pela competência, pelo fornecedor e pelo centro; o grupo pega as subcategorias dele');
chk('X4', so2({ busca: 'vinicius especie' }) === '' && so2({ busca: 'vinícius' }) === 'B' && so2({ busca: '#9' }) === 'C' && so2({ busca: '8' }) === 'B',
    'a busca olha as observações sem acento e acha pelo nº do lançamento («#9» ou «8»)');
const ord = (o: Parameters<typeof ordenarDespesas>[1], s: 'asc' | 'desc') => ordenarDespesas(fx, o, s, HOJE).map((d) => d.descricao).join('');
chk('X5', ord('valor', 'desc') === 'CAB' && ord('fornecedor', 'asc') === 'CAB' && ord('numero', 'desc') === 'CBA',
    'ordena por coluna nos dois sentidos: valor, fornecedor sem acento (Ábaco antes de Imobiliária) e nº');

// ------------------------------------------------------ V2 vence hoje × a vencer (lacuna 11)
chk('V2', SELO_DA_DESPESA.vence_hoje.tom !== SELO_DA_DESPESA.a_vencer.tom && SELO_DA_DESPESA.vence_hoje.tom === 'a_fazer',
    '«vence hoje» (tarefa de hoje, âmbar) e «a vencer» (ainda vai vencer) têm tons diferentes, como na planilha');

// ------------------------------------------------------ M1–M3 o mês na URL (lacuna 13)
chk('M1', mesDaBusca('?mes=2026-11') === '2026-11' && mesDaBusca('?vista=socios&mes=2027-01') === '2027-01',
    'o mês vem da URL (?mes=AAAA-MM), com outros parâmetros junto');
chk('M2', mesDaBusca('?mes=2026-13') === null && mesDaBusca('?mes=abc') === null && mesDaBusca('?mes=1999-12') === null && mesDaBusca('') === null,
    'mês inválido na URL é ignorado (vale o padrão da tela), e não quebra a tela');
chk('M3', buscaComMes('?vista=socios', '2026-12') === '?vista=socios&mes=2026-12' && buscaComMes('?mes=2026-12', null) === ''
      && buscaComMes('?mes=2026-10&x=1', '2026-11') === '?mes=2026-11&x=1',
    'trocar o mês na tela reescreve só o mês na URL, e tirar o mês limpa');

// ------------------------------------------------------ C1/C1b o nº e os dias no CSV (lacuna 14)
const nomes = { plano: (id: string | null) => nomeNoPlano(id, CAT2) ?? '', origem: () => '', centro: () => '' };
const cols = colunasDoCsvDeDespesas(nomes, HOJE);
const csv = paraCsv(cols, [despesa({ numero: 37, vencimento: '2026-10-10' }), atrasada, software]);
const linhasCsv = csv.trim().split(/\r?\n/);
const cab = linhasCsv[0]!;
chk('C1', cab.startsWith('No lancamento') && cab.includes('Dias a vencer (+) / em atraso (-)') && linhasCsv[1]!.startsWith('37'),
    'o CSV começa pelo nº do lançamento (a coluna A da planilha) e traz os dias como número');
const iDias = cols.findIndex((c) => c.titulo.startsWith('Dias'));
const dias = (d: Despesa) => cols[iDias]!.de(d);
chk('C1b', dias(despesa({ vencimento: '2026-10-10' })) === 8 && dias(atrasada) === -7 && dias(software) === ''
      && dias(despesa({ status: 'cancelada' })) === '',
    'os dias: +8 a vencer, −7 em atraso, vazio na paga e na cancelada (a fórmula da coluna O)');

// ------------------------------------------------------ C2 o CSV da Projeção (lacuna 15)
const csvP = csvDaProjecao(pm, CAT2, '2026-10', '2027-03').trim().split(/\r?\n/);
const ultima = csvP.at(-1)!;
chk('C2', csvP.length === 25 && csvP[0]!.includes('Acumulado') && csvP[0]!.includes('Despesas Administrativas')
      && csvP[1]!.includes('sim') && !csvP[24]!.includes('sim') && ultima.includes(String(pm.meses[23]!.acumulado / 100).replace('.', ',')),
    'o CSV da Projeção: 24 meses, com o acumulado, a marca do período e uma coluna por grupo do plano');

// ------------------------------------------------------ I1/I2 Painel e Projeção imprimem (lacuna 15)
/* A impressão do sistema imprime SÓ o que está em `#documento` (estilo.ts, o mesmo
   caminho da fatura unificada). O Painel e a Projeção são rotas próprias — nunca
   montam junto da fatura —, então cada uma monta UM `#documento` e o botão chama a
   impressão; o que é controle vai com `naoimprime`. Leitura do código, porque a
   tela não monta sem navegador. */
const fonte = (arq: string) => readFileSync(new URL(`../src/telas/${arq}`, import.meta.url), 'utf8');
/* O botão é o `BotaoDeImprimir` (definido no Painel, com o `window.print()`), e a
   Projeção o importa: vale um ou outro. */
const imprime = (t: string) => (t.match(/id="documento"/g) ?? []).length === 1
  && /window\.print\(\)|<BotaoDeImprimir \/>/.test(t) && /naoimprime/.test(t);
chk('I1', imprime(fonte('painel-empresa.tsx')), 'o Painel da empresa tem «Imprimir» e um único #documento, com os controles fora da folha');
chk('I2', imprime(fonte('projecao.tsx')) && /csvDaProjecao/.test(fonte('projecao.tsx')),
    'a Projeção tem «Imprimir», um único #documento e o «Baixar CSV» da projeção');

// ------------------------------------------------------ a baixa desfeita não soma
const comEstorno = despesa({
  status: 'parcial', valor_pago_centavos: 100_000,
  pagamento: [
    { id: 'e1', data_pagamento: '2026-10-01', valor_centavos: 431_900, acrescimo_centavos: 0, desconto_centavos: 0, forma: 'pix',
      origem_pagamento_id: null, referencia_externa: null, observacao: null, estornado_em: '2026-10-02T10:00:00Z', motivo_estorno: 'data errada' },
    { id: 'e2', data_pagamento: '2026-10-02', valor_centavos: 100_000, acrescimo_centavos: 500, desconto_centavos: 0, forma: 'pix',
      origem_pagamento_id: null, referencia_externa: null, observacao: null },
  ],
});
chk('K10', pagoEmCaixa(comEstorno) === 100_500, 'a baixa desfeita fica na lista e não soma no que saiu do banco');

console.log(`\n${falhas === 0 ? `despesas-regras: ${feitas} verificacoes, 0 falhas\nDESPESAS_REGRAS_OK`
                              : `despesas-regras: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
