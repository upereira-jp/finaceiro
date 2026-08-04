// Os dois motores da carteira, SEM BANCO. Uso: node --experimental-strip-types tests/dominio-carteira.ts
//
// POR QUE ESTA SUITE EXISTE SEPARADA DAS OUTRAS. A invariante do centavo do PRD
// 5.5 e chamada de INEGOCIAVEL, e a unica forma de exercita-la nas suites que ja
// existiam seria montar banco, tenant, RLS e fixture - o que faz cada caso
// custar segundos e limita quantos casos alguem escreve. Aqui um caso custa
// microssegundos, e por isso da para varrer 2.000 combinacoes de valor em vez de
// escolher tres que parecem dificeis.
//
// A constraint deferida da migration 17 continua sendo o MECANISMO. Isto e a
// prova de que o motor nunca a aciona.

import {
  aplicarPercentual, percentualEmCentesimos, proporcao, somar, emReais, exigirCentavos,
} from '../src/dominio/centavos.ts';
import { calcularSplit, SplitNaoFecha, type EntradaDoSplit } from '../src/dominio/split.ts';
import {
  competencia, vencimentoDaFatura, ehFaturaCheia, triar, CompetenciaInvalida, EXPLICACAO,
  type LinhaCandidata,
} from '../src/dominio/faturamento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const lancou = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

// ================================================================ C. centavos

// ---------------------------------------------------- C1 o float que o BigInt evita
{
  /*
   * MEDIDO EM 28/07, e o resultado corrige a intuicao. Nas taxas que o sistema
   * usa hoje - 70, 65, 60, 50, 30, 25, 20, 33,33 - o caminho ingenuo em `number`
   * ACERTA em toda a faixa: zero divergencias de 1 centavo a R$ 50.000,00 de
   * base. Um teste que so usasse essas taxas daria verde com float.
   *
   * A divergencia mora abaixo de 1%, e `numeric(5,2)` aceita. Os tres casos
   * abaixo sao os primeiros encontrados na varredura, e sao o motivo real de
   * este arquivo existir - nao um exemplo escolhido para ilustrar.
   */
  const ingenuo = (base: number, pct: number) => Math.round(base * pct / 100);
  const casos: Array<[number, string, number, number]> = [
    [11_000, '0.35', 38, 39],
    [5_000,  '0.57', 28, 29],
    [25_000, '0.29', 72, 73],
  ];
  const divergem = casos.every(([b, p, f, e]) =>
    ingenuo(b, Number(p)) === f && aplicarPercentual(b, p) === e);
  chk('C1a', divergem,
      'percentual abaixo de 1%: o float perde 1 centavo em R$ 110,00 a 0,35%, R$ 50,00 a 0,57% e R$ 250,00 a 0,29%');

  const taxasDeHoje = ['70', '65', '60', '50', '30', '25', '20', '33.33'];
  const concordamHoje = taxasDeHoje.every((p) =>
    [78_900, 123_456, 1_000_000, 4_999_999].every((b) => ingenuo(b, Number(p)) === aplicarPercentual(b, p)));
  chk('C1b', concordamHoje,
      'e nas taxas de HOJE os dois caminhos concordam - o float esta certo por sorte, e quebraria na primeira taxa abaixo de 1%');
}

// ---------------------------------------------------- C2 meia para cima, nos dois lados
{
  chk('C2a', aplicarPercentual(1, '50') === 1, '50% de 1 centavo = 0,5 -> 1 (meia para cima)');
  chk('C2b', aplicarPercentual(3, '50') === 2, '50% de 3 centavos = 1,5 -> 2');
  chk('C2c', aplicarPercentual(100, '33.33') === 33, '33,33% de 100 = 33,33 -> 33 (abaixo da metade, desce)');
  chk('C2d', aplicarPercentual(0, '70') === 0, 'percentual sobre zero e zero, nao NaN');
  chk('C2e', aplicarPercentual(12345, '100') === 12345, '100% devolve a base intacta');
}

// ---------------------------------------------------- C3 number nao entra
{
  const e = lancou(() => aplicarPercentual(1000, 70 as any));
  chk('C3a', e instanceof TypeError, `percentual como number lanca (veio ${e?.name})`);
  const f = lancou(() => aplicarPercentual(10.5 as any, '70'));
  chk('C3b', f instanceof TypeError, `base fracionaria lanca - centavo nao tem metade (veio ${f?.name})`);
  const g = lancou(() => exigirCentavos(undefined as any, 'x'));
  chk('C3c', g instanceof TypeError, 'undefined em campo de dinheiro lanca antes de virar NaN e depois NULL');
}

// ---------------------------------------------------- C4 escala do percentual
{
  chk('C4', percentualEmCentesimos('70') === 7000n
         && percentualEmCentesimos('70.5') === 7050n
         && percentualEmCentesimos('0.01') === 1n
         && percentualEmCentesimos('100.00') === 10000n,
      'duas casas decimais viram centesimos de ponto percentual, sem passar por float');
}

// ---------------------------------------------------- C5 proporcao (PRD 5.3)
{
  chk('C5a', proporcao(1000, 8000, 10000) === 800, 'a fatia de 80% de R$ 10,00 de juro e R$ 8,00');
  chk('C5b', proporcao(1000, 0, 0) === 0, 'denominador zero devolve zero em vez de estourar');
  chk('C5c', proporcao(1, 1, 2) === 1, 'meia para cima tambem aqui: metade de 1 centavo -> 1');
}

// ---------------------------------------------------- C6 leitura humana
{
  chk('C6', emReais(123456) === 'R$ 1.234,56' && emReais(-1) === '-R$ 0,01' && emReais(0) === 'R$ 0,00',
      `formatacao para mensagem de erro: ${emReais(123456)}`);
}

// ================================================================ S. split

const base = (over: Partial<EntradaDoSplit> = {}): EntradaDoSplit => ({
  valorLiquidadoCentavos: 100_000,
  valorConsumoCentavos: 90_000,
  valorTarifasConcessionariaCentavos: 10_000,
  jurosCentavos: 0,
  multaCentavos: 0,
  repasse: { donoUsinaId: 'dono-1', percentual: '70.00', regraRepasseId: 'rr-1' },
  comissao: null,
  ...over,
});

// ---------------------------------------------------- S1 a conta do PRD, item a item
{
  const r = calcularSplit(base());
  const por = (t: string) => r.itens.find((i) => i.tipo === t)!;
  chk('S1a', por('repasse_usina').valor_centavos === 63_000,
      '70% sobre o consumo de R$ 900,00 = R$ 630,00 (PRD 5.3)');
  chk('S1b', por('repasse_concessionaria').valor_centavos === 10_000,
      'a tarifa da concessionaria passa inteira, sem percentual (PRD 5.1)');
  chk('S1c', por('liquido_g3').valor_centavos === 27_000,
      'o liquido G3 e a diferenca: 1000 - 630 - 100 = R$ 270,00');
  chk('S1d', r.itens.every((i) => i.percentual_aplicado === null || typeof i.percentual_aplicado === 'string'),
      'percentual sai como string decimal, nunca como number');
}

// ---------------------------------------------------- S2 a base da comissao NAO inclui tarifa nem juro
{
  const r = calcularSplit(base({
    valorLiquidadoCentavos: 105_000, jurosCentavos: 4_000, multaCentavos: 1_000,
    comissao: { originadorId: 'org-1', percentual: '25.00', regraComissaoId: 'rc-1', parcela: 1 },
  }));
  const com = r.itens.find((i) => i.tipo === 'comissao')!;
  chk('S2a', com.base_calculo_centavos === 90_000 && com.valor_centavos === 22_500,
      'a comissao incide SO sobre o consumo: 25% de R$ 900,00, e nao sobre os R$ 1.050,00 recebidos');
  // Juro proporcional: 5000 de juro, consumo 90000 de um faturado de 100000 -> 4500
  chk('S2b', r.baseRepasseCentavos === 94_500,
      `a base do repasse leva a fatia PROPORCIONAL do juro: 90.000 + 4.500 = ${r.baseRepasseCentavos}`);
  chk('S2c', r.itens.find((i) => i.tipo === 'repasse_usina')!.valor_centavos === 66_150,
      '70% sobre 94.500 = 66.150 - o dono participa do juro que incidiu sobre o consumo, nao sobre a conta da distribuidora');
}

// ---------------------------------------------------- S3 liquido G3 negativo e legitimo
{
  // PRD 5.6: captador senior, repasse 70% + comissao 30% sobre o consumo.
  const r = calcularSplit(base({
    valorLiquidadoCentavos: 90_000, valorConsumoCentavos: 90_000, valorTarifasConcessionariaCentavos: 0,
    comissao: { originadorId: 'org-1', percentual: '30.00', regraComissaoId: 'rc-1', parcela: 1 },
  }));
  const g3 = r.itens.find((i) => i.tipo === 'liquido_g3')!;
  chk('S3a', g3.valor_centavos === 0,
      'captador senior: 70 + 30 = 100% do consumo, e o liquido G3 e ZERO - o PRD 5.6 diz que sera');
  chk('S3b', !r.itens.some((i) => i.tipo === 'repasse_concessionaria'),
      'sem tarifa da concessionaria, o item nao entra: zero ali significa despesa inexistente');
}

// ---------------------------------------------------- S4 o item de comissao ZERO existe
{
  const r = calcularSplit(base({
    comissao: { originadorId: 'org-1', percentual: '0.00', regraComissaoId: 'rc-ind-2', parcela: 2 },
  }));
  const com = r.itens.find((i) => i.tipo === 'comissao');
  chk('S4', com != null && com.valor_centavos === 0 && com.percentual_aplicado === '0.00',
      'parceiro_indicador na 2a parcela: item de ZERO DECLARADO, porque a regra foi consultada e nao havia o que pagar');
}

// ---------------------------------------------------- S5 a invariante, em 2.000 casos
{
  // LCG deterministico: mesmo conjunto de casos em toda execucao. Aleatorio de
  // verdade daria um teste que falha uma vez em vinte e ninguem reproduz.
  let s = 20260728;
  const prox = (n: number) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };

  let piorResiduo = 0; let todosFecham = true; let negativos = 0;
  for (let i = 0; i < 2000; i++) {
    const consumo = prox(5_000_000) + 1;
    const tarifas = prox(200_000);
    const juros = prox(20_000);
    const multa = prox(5_000);
    const pctR = `${prox(101)}.${String(prox(100)).padStart(2, '0')}`;
    const temComissao = prox(2) === 1;
    const pctC = `${prox(61)}.${String(prox(100)).padStart(2, '0')}`;

    const e = base({
      valorLiquidadoCentavos: consumo + tarifas + juros + multa,
      valorConsumoCentavos: consumo,
      valorTarifasConcessionariaCentavos: tarifas,
      jurosCentavos: juros, multaCentavos: multa,
      repasse: { donoUsinaId: 'd', percentual: pctR, regraRepasseId: 'rr' },
      comissao: temComissao
        ? { originadorId: 'o', percentual: pctC, regraComissaoId: 'rc', parcela: 1 }
        : null,
    });

    let r;
    try { r = calcularSplit(e); } catch { todosFecham = false; break; }
    const soma = somar(r.itens.map((it) => it.valor_centavos));
    if (soma !== e.valorLiquidadoCentavos) { todosFecham = false; break; }
    const g3 = r.itens.find((it) => it.tipo === 'liquido_g3')!.valor_centavos;
    if (g3 < 0) negativos++;
    const outros = r.itens.filter((it) => it.tipo !== 'liquido_g3').length;
    piorResiduo = Math.max(piorResiduo, outros);
  }
  chk('S5a', todosFecham,
      'PRD 5.5 em 2.000 combinacoes de consumo, tarifa, juro e percentual: a soma dos itens fecha com o liquidado, ao centavo, em todas');
  chk('S5b', negativos > 0,
      `${negativos} dos 2.000 casos deram liquido G3 NEGATIVO - e o teste so vale porque esse caso apareceu`);
}

// ---------------------------------------------------- S6 o guarda-costas do motor
{
  // Se um dia alguem acrescentar item DEPOIS da subtracao, isto acusa. E o
  // sentido "acusa" da verificacao: sem ele, S5 poderia estar passando por a
  // funcao nunca ter sido chamada.
  const e = lancou(() => {
    const r = calcularSplit(base());
    r.itens.push({ ...r.itens[0]!, tipo: 'comissao' });
    const soma = somar(r.itens.map((i) => i.valor_centavos));
    if (soma !== 100_000) throw new SplitNaoFecha(soma, 100_000);
  });
  chk('S6', e instanceof SplitNaoFecha, `item acrescentado depois da subtracao quebra a invariante (veio ${e?.name})`);
}

// ================================================================ F. faturamento

// ---------------------------------------------------- F1 competencia e mes, nao dia
{
  chk('F1a', competencia('2026-07-01').getUTCMonth() === 6, 'primeiro dia do mes passa');
  const e = lancou(() => competencia('2026-07-15'));
  chk('F1b', e instanceof CompetenciaInvalida,
      'dia 15 RECUSA em vez de truncar: truncar faria "faturar julho" e "faturar do dia 15" virarem o mesmo lote');
  const f = lancou(() => competencia('nao-e-data'));
  chk('F1c', f instanceof CompetenciaInvalida, 'texto invalido recusa em vez de virar Invalid Date e depois NULL');
}

// ---------------------------------------------------- F2 vencimento no mes SEGUINTE
{
  const v = vencimentoDaFatura(competencia('2026-07-01'), 10);
  chk('F2a', v.toISOString().slice(0, 10) === '2026-08-10',
      `competencia de julho vence em agosto: ${v.toISOString().slice(0, 10)} - a geracao so e medida depois do mes virar`);
  const fev = vencimentoDaFatura(competencia('2027-01-01'), 31);
  chk('F2b', fev.toISOString().slice(0, 10) === '2027-02-28',
      `dia 31 em fevereiro cai no ultimo dia (${fev.toISOString().slice(0, 10)}), nao transborda para marco`);
  const dez = vencimentoDaFatura(competencia('2026-12-01'), 5);
  chk('F2c', dez.toISOString().slice(0, 10) === '2027-01-05', 'a virada de ano funciona');
}

// ---------------------------------------------------- F3 o que e fatura cheia
{
  const jul = competencia('2026-07-01');
  chk('F3a', ehFaturaCheia(dia(2026, 6, 20), jul), 'contrato fechado em junho cobre julho inteiro: cheia');
  chk('F3b', ehFaturaCheia(dia(2026, 7, 1), jul), 'fechado no dia 1 de julho tambem cobre o mes inteiro');
  chk('F3c', !ehFaturaCheia(dia(2026, 7, 10), jul),
      'fechado no dia 10 cobre julho pela metade: NAO e cheia, nao avanca o contador e nao paga comissao (Q-FATCHEIA-01)');
}

// ---------------------------------------------------- F4 a triagem, motivo a motivo
{
  const jul = competencia('2026-07-01');
  const completa: LinhaCandidata = {
    unidade_consumidora_id: 'uc-1', numero_uc: 'UC-1',
    contrato_id: 'k-1', usina_id: 'u-1', percentual_rateio: '10.0000',
    data_vencimento: dia(2026, 1, 10), data_fechamento: dia(2026, 5, 1),
    geracao_kwh: '10000.0000', dono_usina_id: 'd-1', ja_tem_fatura: false,
    rateio_situacao: 'ativado', crm_usina_cliente_id: 'crm-k-1',
  };
  const motivo = (over: Partial<LinhaCandidata>) => {
    const t = triar({ ...completa, ...over }, jul);
    return t.faturar ? null : t.motivo;
  };

  chk('F4a', triar(completa, jul).faturar === true, 'linha completa vira fatura');
  chk('F4b', motivo({ contrato_id: null }) === 'sem_contrato_vigente', 'sem contrato: sem_contrato_vigente');
  chk('F4c', motivo({ ja_tem_fatura: true }) === 'ja_faturada', 'ja faturada nao entra de novo no lote');
  chk('F4d', motivo({ percentual_rateio: null }) === 'sem_rateio', 'sem percentual de rateio: sem_rateio');
  chk('F4e', motivo({ geracao_kwh: null }) === 'sem_geracao_lancada',
      'sem geracao lancada RECUSA - e o caso da usina 0003, 100% alocado e zero geracao');
  chk('F4f', motivo({ data_vencimento: null }) === 'sem_vencimento',
      'sem data de vencimento recusa em vez de escolher um dia (Q-SPEC001-02)');

  // Ordem do diagnostico: sem contrato E sem geracao devolve o problema de
  // verdade, nao o primeiro que a implementacao encontrar.
  chk('F4g', motivo({ contrato_id: null, geracao_kwh: null }) === 'sem_contrato_vigente',
      'com dois problemas, o motivo devolvido e o que impede de existir, nao o que impede de calcular');

  /*
   * F4h-F4l: `rateio_nao_ativado` (migration 24, Q-SITUACAO-01).
   *
   * O dono decidiu em 04/08 que o financeiro fatura as ATIVADAS. Medido no dia:
   * 29 das 41 UCs estavam `ativado` e 12 nao, sete delas em troca de
   * titularidade - entao isto NAO e caso de borda, e 12 de 41 do lote real.
   */
  chk('F4h', motivo({ rateio_situacao: 'nao_ativado' }) === 'rateio_nao_ativado',
      'rateio nao ativado no CRM RECUSA - o financeiro fatura as ativadas (Q-SITUACAO-01)');

  /*
   * NULL NAO E "NAO ATIVADO", e cai na mesma recusa por decisao: o lado seguro
   * para dinheiro e nao faturar o que nao se confirmou. O que separa as duas e
   * a EXPLICACAO - uma pede rodar o ciclo, a outra pede falar com o CRM -, e e
   * por isso que a F4j confere o TEXTO e nao so o motivo.
   */
  chk('F4i', motivo({ rateio_situacao: null }) === 'rateio_nao_ativado',
      'situacao NUNCA LIDA numa UC ESPELHADA tambem recusa: ausencia de medicao nao e '
      + 'medicao de ausencia (o par mudo e a F4m)');
  chk('F4j', /conector ainda nao leu/.test(EXPLICACAO.rateio_nao_ativado)
       && /Q-SITUACAO-01/.test(EXPLICACAO.rateio_nao_ativado),
      'a explicacao SEPARA as duas causas que caem na mesma recusa, porque a acao e diferente');

  // Valor desconhecido do CRM recusa, e e o lado seguro: a coluna e `text` de
  // proposito (o vocabulario e deles), entao uma palavra nova nao quebra o
  // ciclo - ela so nao fatura ate alguem olhar.
  chk('F4k', motivo({ rateio_situacao: 'em_analise' }) === 'rateio_nao_ativado',
      'situacao DESCONHECIDA recusa em vez de faturar - `text` espelha, a triagem decide');

  // A ORDEM: vem depois de sem_contrato_vigente e ja_faturada, antes de sem_rateio.
  chk('F4l', motivo({ rateio_situacao: 'nao_ativado', contrato_id: null }) === 'sem_contrato_vigente'
       && motivo({ rateio_situacao: 'nao_ativado', ja_tem_fatura: true }) === 'ja_faturada'
       && motivo({ rateio_situacao: 'nao_ativado', percentual_rateio: null }) === 'rateio_nao_ativado',
      'a ordem: contrato e ja_faturada VENCEM a situacao; a situacao vence sem_rateio - '
      + 'mandar a operacao lancar geracao numa UC que nao e para faturar seria trabalho jogado fora');

  /*
   * F4m - A GUARDA QUE IMPEDIU UM DEFEITO DE ENTRAR, e ela e o par mudo da F4h.
   *
   * `POST /unidades-consumidoras` cria UC A MAO, e essa UC nunca vai ter
   * situacao no CRM - porque o CRM nao sabe dela. Sem esta condicao ela ficaria
   * NAO FATURAVEL PARA SEMPRE, sem erro e sem log: regra de uma fonte externa
   * aplicada a quem nao vem daquela fonte. A primeira versao desta migration
   * tinha esse buraco, e ele apareceu porque QUATRO suites quebraram - todas
   * criam UC pelo caminho da aplicacao, que e o mesmo caminho da tela.
   *
   * A diferenca entre esta linha e a F4h e UM campo: `crm_usina_cliente_id`.
   */
  chk('F4m', motivo({ rateio_situacao: null, crm_usina_cliente_id: null }) === null
       && motivo({ rateio_situacao: 'nao_ativado', crm_usina_cliente_id: null }) === null,
      'UC criada A MAO (sem crm_usina_cliente_id) FATURA - a regra da situacao so vale '
      + 'sobre o que veio do rateio do CRM');
}

// ---------------------------------------------------- F5 alerta nao e recusa
{
  const jul = competencia('2026-07-01');
  const t = triar({
    unidade_consumidora_id: 'uc-1', numero_uc: 'UC-1', contrato_id: 'k-1', usina_id: 'u-1',
    percentual_rateio: '10.0000', data_vencimento: dia(2026, 1, 10), data_fechamento: dia(2026, 5, 1),
    geracao_kwh: '10000.0000', dono_usina_id: null, ja_tem_fatura: false,
    rateio_situacao: 'ativado', crm_usina_cliente_id: 'crm-k-1',
  }, jul);
  chk('F5', t.faturar === true && t.alertas.includes('usina_sem_dono'),
      'usina sem dono FATURA e alerta: a cobranca ao cliente nao depende do cadastro do dono (R12 bloqueia o repasse, nao a fatura)');
}

console.log();
if (falhas > 0) { console.log(`--- dominio da carteira: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- dominio da carteira: 45 verificacoes, 0 falhas');
