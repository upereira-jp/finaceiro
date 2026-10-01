// O ROTEIRO DO MÊS, COMO FUNIL. Sem banco, sem rede, sem React.
// Uso: node --experimental-strip-types web/tests/roteiro-do-mes.ts
//
// ============================================================================
// A SUÍTE FOI REESCRITA EM 30/09/2026 (etapa 3 do redesenho), junto com o
// modelo. Até ali ela prendia uma FILA: «um só agora», «travar consome o agora»,
// «o passo aberto é o primeiro não feito». A crítica de 30/09 (P1 nº 3) mostrou
// que essas três garantias, juntas, produziam «você está no 1 de 5» num mês com
// quinze cobranças emitidas. O modelo virou funil, e as garantias viraram:
//
//   um só destaque   cinco números na tela, e UM destaque. Duas
//                    instruções ao mesmo tempo continuam sendo nenhuma;
//   risco primeiro    o destaque vai para o passo em que o dinheiro corre perigo,
//                    e não para o primeiro da lista;
//   nada sem medida   leitura que não chegou é «não medido» — nunca zero, nunca
//                    «fechado»;
//   cadastro à parte  a pendência de cadastro não consome o destaque: vira uma
//                    linha própria, com o caminho;
//   o texto aponta    todo destino é item do menu, e o nome no botão é letra por
//                    letra o que a pessoa lê onde clica (`RM12`/`RM13`, mantidas
//                    quando a barra virou menu lateral, na etapa 3b).
//   uma sequência só  o número do passo que o menu mostra ao lado de cada tela é
//                    o mesmo do funil e da faixa (`RM25`, etapa 3b).

import {
  mesNoFunil, travasDe, ondeEstouNoMes, escolherOFoco, MOLDES, TETO_DAS_COBRANCAS,
  rotuloDoDestaque, ROTULO_DO_DESTAQUE,
  type CamadaDoRoteiro, type LeituraDoMes, type LinhaSemBoleto, type ContaRegistrada,
} from '../src/roteiro-do-mes.ts';
import { TELAS, caminhoNoMenu, rotuloDosPassos } from '../src/navegacao.ts';
import { VERBETE_DA_CAMADA } from '../src/vocabulario.ts';
import { FILTROS_DA_TELA, filtroDaConsulta } from '../src/destino-da-camada.ts';
import { contasQueFaltam, mesDasContasQueFaltam, type UcDaLista } from '../src/o-que-falta.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/* ==========================================================================
 * As peças de montar — o mês de setembro de 2026, com 41 unidades
 * ========================================================================== */

const MES = '2026-09';

const camada = (
  nome: string, situacao: CamadaDoRoteiro['situacao'], faltam = 0, total = 41,
  efeito: CamadaDoRoteiro['efeito'] = 'bloqueia_fatura',
): CamadaDoRoteiro => ({ camada: nome, situacao, faltam, total, efeito });

/** Só a conta lida, com `faltam` contas a ler; o cadastro todo em dia. */
const cadastroEmDia = (aLer: number): CamadaDoRoteiro[] => [
  camada('conta_lida_da_competencia', aLer > 0 ? 'pendente' : 'ok', aLer, 41),
  camada('contrato_ativo', 'ok', 0, 41),
  camada('endereco_do_pagador', 'ok', 0, 41, 'bloqueia_boleto'),
  camada('dono_da_usina', 'ok', 0, 4, 'bloqueia_split'),
];

const registradas = (semCobranca: number, comCobranca: number, mes = MES): ContaRegistrada[] => [
  ...Array.from({ length: semCobranca }, () => ({ competencia: `${mes}-01`, fatura_id: null, cobranca_disponivel: true })),
  ...Array.from({ length: comCobranca }, (_, i) => ({ competencia: `${mes}-01`, fatura_id: `f${i}`, cobranca_disponivel: true })),
];

const cobrancas = (p: { rascunho?: number; emitida?: number; vencida?: number; paga?: number; cancelada?: number }) => [
  ...Array(p.rascunho ?? 0).fill({ status: 'rascunho' }),
  ...Array(p.emitida ?? 0).fill({ status: 'emitida' }),
  ...Array(p.vencida ?? 0).fill({ status: 'vencida' }),
  ...Array(p.paga ?? 0).fill({ status: 'paga' }),
  ...Array(p.cancelada ?? 0).fill({ status: 'cancelada' }),
];

const semBoleto = (n: number, extra: Partial<LinhaSemBoleto> = {}, mes = MES): LinhaSemBoleto[] =>
  Array.from({ length: n }, () => ({ competencia: `${mes}-01`, pede_gente: false, boleto: null, ...extra }));

const RECUSA_DE_ENDERECO: LinhaSemBoleto = {
  competencia: `${MES}-01`, pede_gente: false,
  boleto: { ultimo_erro: 'PagadorSemEndereco: o banco recusa emitir sem logradouro, bairro, município, CEP e UF.' },
};

/** Um mês inteiro, medido: tudo pode ser sobrescrito. */
const ler = (e: Partial<LeituraDoMes> = {}): LeituraDoMes => ({
  mes: MES,
  camadas: cadastroEmDia(0),
  posicao: { vencidas_em_aberto: 0 },
  cobrancas: [],
  registradas: { lista: [], parcial: false },
  semBoleto: { linhas: [], total: 0 },
  ...e,
});

/** O retrato de 30/09/2026 que a crítica mediu: 15 a ler, 6 a gerar, 5 a
 *  emitir, 3 sem boleto (uma recusada pelo banco), 4 pagas, 2 vencidas. */
const RETRATO = ler({
  camadas: cadastroEmDia(15),
  posicao: { vencidas_em_aberto: 2 },
  cobrancas: cobrancas({ rascunho: 5, emitida: 9, vencida: 2, paga: 4 }),
  registradas: { lista: registradas(6, 20), parcial: false },
  semBoleto: { linhas: [...semBoleto(2), RECUSA_DE_ENDERECO], total: 3 },
});

const passo = (e: LeituraDoMes, chave: string) => mesNoFunil(e).passos.find((p) => p.chave === chave)!;

/* ==========================================================================
 * RM1..RM5 — o destaque: um só, e pelo risco
 * ========================================================================== */

// ------------------------------------------ RM1 no máximo um destaque, sempre
{
  const cenarios: Array<[string, LeituraDoMes]> = [
    ['nada medido', ler({ cobrancas: null, registradas: null, semBoleto: null, posicao: null, camadas: [] })],
    ['só falta ler', ler({ camadas: cadastroEmDia(41) })],
    ['o retrato de 30/09', RETRATO],
    ['tudo pago', ler({ cobrancas: cobrancas({ paga: 41 }), registradas: { lista: registradas(0, 41), parcial: false } })],
    ['cadastro travando', ler({ camadas: [...cadastroEmDia(0), camada('contrato_ativo', 'pendente', 6)] })],
  ];
  const errados = cenarios.filter(([, c]) => mesNoFunil(c).passos.filter((p) => p.foco).length > 1);
  chk('RM1', errados.length === 0,
      `em nenhum dos ${cenarios.length} cenários há mais de um destaque`
      + `${errados.length ? ` (erram: ${errados.map(([n]) => n).join(', ')})` : ''} - duas instruções `
      + 'simultâneas é o mesmo que nenhuma');
}

// ------------------------------- RM2 o risco ganha do primeiro passo da lista
{
  const m = mesNoFunil(RETRATO);
  chk('RM2', m.foco?.chave === 'cobrar' && m.foco.risco !== null
             && m.passos.find((p) => p.chave === 'ler')!.quantos === 15,
      'no retrato de 30/09 — 15 contas a ler e 1 boleto recusado pelo banco — o destaque vai para o '
      + 'PASSO 4, e não para o 1: era a caixa dizer «1 de 5» com a faixa vermelha acima mandando '
      + 'agir no 4, duas respostas para «o que eu faço agora»');
}

// ------------------------------------- RM3 recusa do banco pesa mais que vencida
{
  const soVencida = ler({
    camadas: cadastroEmDia(15), posicao: { vencidas_em_aberto: 2 },
    cobrancas: cobrancas({ rascunho: 5, emitida: 9, vencida: 2 }),
    registradas: { lista: registradas(6, 16), parcial: false },
    semBoleto: { linhas: semBoleto(2), total: 2 },
  });
  const f = mesNoFunil(soVencida).foco;
  chk('RM3', f?.chave === 'receber' && f.destino.endereco === '/contas-a-receber'
             && mesNoFunil(RETRATO).foco?.chave === 'cobrar',
      'sem recusa, a vencida (passo 5) leva o destaque — e o botão dela leva a Contas a receber, onde '
      + 'a vencida se acompanha; com recusa do banco, o passo 4 passa na frente: a vencida já tem '
      + 'boleto e o cliente pode pagar hoje, a recusada deixa o cliente sem nada para pagar');
}

// ---------------------------- RM4 sem risco, o trabalho mais perto do dinheiro
{
  const semRisco = ler({
    camadas: cadastroEmDia(15),
    cobrancas: cobrancas({ rascunho: 5, emitida: 9 }),
    registradas: { lista: registradas(6, 14), parcial: false },
  });
  const zeroDireita = ler({ camadas: cadastroEmDia(15), registradas: { lista: registradas(6, 0), parcial: false } });
  chk('RM4', mesNoFunil(semRisco).foco?.chave === 'emitir' && mesNoFunil(zeroDireita).foco?.chave === 'gerar',
      'sem risco, o destaque é o passo com trabalho MAIS PERTO DO DINHEIRO: 5 a emitir antes de 6 a '
      + 'gerar antes de 15 a ler — terminar o que já começou antes de abrir mais');
}

// --------------------------- RM5 o passo automático só ganha destaque pelo risco
{
  const esperando = ler({ cobrancas: cobrancas({ emitida: 20 }), registradas: { lista: registradas(0, 20), parcial: false } });
  const m = mesNoFunil(esperando);
  const receber = m.passos.find((p) => p.chave === 'receber')!;
  chk('RM5', receber.automatico && receber.quantos === 20 && !receber.foco && m.foco === null
             && m.estado === 'fechado',
      'com 20 cobranças esperando o cliente e nada vencido, o passo 5 mostra 20 a receber e NÃO '
      + 'ganha o destaque: não há o que clicar — e o mês está fechado para quem opera');
}

/* ==========================================================================
 * RM6..RM10 — nada é afirmado sem medida
 * ========================================================================== */

// -------------------------------------------- RM6 sem leitura, «não medido»
{
  const m = mesNoFunil(ler({ camadas: cadastroEmDia(3), cobrancas: null, registradas: null, semBoleto: null, posicao: null }));
  const inventados = m.passos.filter((p) => p.chave !== 'ler' && p.quantos !== null);
  chk('RM6', inventados.length === 0 && m.passos[0]!.quantos === 3 && m.estado === 'andando'
             && /não foram medidos/.test(m.frase),
      'com só a prontidão na mão, só o passo 1 tem número; os outros quatro dizem «não medido» — '
      + `nunca zero —, e a frase do mês diz quais não foram medidos${inventados.length ? ` (inventaram: ${inventados.map((p) => p.chave).join(', ')})` : ''}`);
}

// -------------------------------- RM7 zero sobre nada não fecha o mês
{
  const semUniverso = ler({ camadas: [camada('conta_lida_da_competencia', 'nao_medido', 0, 0)] });
  const zeroDeZero = ler({ camadas: [camada('conta_lida_da_competencia', 'ok', 0, 0)] });
  const a = mesNoFunil(semUniverso);
  const b = mesNoFunil(zeroDeZero);
  chk('RM7', a.passos[0]!.quantos === null && b.passos[0]!.quantos === null
             && a.estado !== 'fechado' && b.estado !== 'fechado',
      '`nao_medido` ou universo zero na conta lida não viram «0 contas a ler» e não fecham o mês — '
      + '«0 de 0» em verde seria o relatório autorizando o que não conferiu');
}

// ---------------------- RM8 «a gerar» é o «Gerar N cobranças» da tela de lá
{
  const outroMes = ler({ registradas: { lista: [...registradas(6, 20), ...registradas(9, 0, '2026-08')], parcial: false } });
  const semLigacao = ler({ registradas: { lista: [{ competencia: `${MES}-01`, fatura_id: null, cobranca_disponivel: false }], parcial: false } });
  const cortada = ler({ mes: '2026-08', registradas: { lista: [...registradas(3, 0), ...registradas(2, 0, '2026-08')], parcial: true } });
  const inteira = ler({ registradas: { lista: [...registradas(3, 0), ...registradas(2, 0, '2026-08')], parcial: true } });
  chk('RM8', passo(outroMes, 'gerar').quantos === 6 && passo(semLigacao, 'gerar').quantos === null
             && passo(cortada, 'gerar').quantos === null && passo(inteira, 'gerar').quantos === 3,
      'conta do mês sem cobrança conta (e a de outro mês não); banco sem a ligação conta-cobrança é '
      + '«não medido»; e com a lista no teto, só o mês MAIS VELHO dela vira «não medido» — é o que o '
      + 'teto corta');
}

// ------------------------------------ RM9 lista no teto não vira número
{
  const noTeto = ler({ cobrancas: Array(TETO_DAS_COBRANCAS).fill({ status: 'rascunho' }) });
  chk('RM9', passo(noTeto, 'emitir').quantos === null && passo(noTeto, 'receber').quantos === null
             && passo(RETRATO, 'emitir').quantos === 5,
      `as cobranças do mês chegaram com ${TETO_DAS_COBRANCAS} linhas — o teto da leitura — e por isso «a emitir» e «a `
      + 'receber» dizem «não medido»: a lista pode estar cortada, e contar o pedaço seria afirmar o todo');
}

// ------------------------- RM10 sem boleto: do mês, de outros meses, e cortada
{
  const comDeFora = ler({ semBoleto: { linhas: [...semBoleto(3), ...semBoleto(2, {}, '2026-08')], total: 5 } });
  const cortada = ler({ semBoleto: { linhas: semBoleto(3, {}, '2026-07'), total: 250 } });
  const a = passo(comDeFora, 'cobrar');
  const b = passo(cortada, 'cobrar');
  chk('RM10', a.quantos === 3 && a.contexto === 'e 2 de outros meses'
              && b.quantos === null && /250 sem boleto contando todos os meses/.test(b.contexto ?? ''),
      'o passo 4 conta o mês e diz quantos há de OUTROS meses — «uma fatura de MAI que nunca virou '
      + 'boleto continua sendo dinheiro parado em SET» —; com a lista cortada, o número do mês é «não '
      + 'medido» e o total do banco, que é de todos os meses, diz que é');
}

// ------------- RM10c o boleto de OUTRO mês é aviso, e não o destaque (etapa 4a)
// Abrir agosto dizia «Comece pelo 4» sobre um passo VAZIO em agosto, porque havia
// um boleto recusado em setembro. O caso de fora continua valendo — com peso de
// aviso, numa linha própria com o link para o mês dele.
{
  const agosto = ler({
    mes: '2026-08',
    camadas: cadastroEmDia(0),
    posicao: { vencidas_em_aberto: 1 },
    cobrancas: cobrancas({ emitida: 3, vencida: 1, paga: 20 }),
    registradas: { lista: registradas(0, 24, '2026-08'), parcial: false },
    semBoleto: { linhas: [RECUSA_DE_ENDERECO, ...semBoleto(1, { pede_gente: true })], total: 2 },
  });
  const m = mesNoFunil(agosto);
  const p4 = m.passos.find((p) => p.chave === 'cobrar')!;
  chk('RM10c', p4.quantos === 0 && p4.risco === null && !p4.foco && m.foco?.chave === 'receber'
               && m.deOutrosMeses !== null && m.deOutrosMeses.quantos === 2
               && m.deOutrosMeses.endereco === '/faturas?mes=2026-09'
               && /de outros meses pedem você/.test(m.deOutrosMeses.frase),
      'com zero sem boleto em agosto e dois de setembro pedindo você, o passo 4 NÃO leva o destaque '
      + '(vai para a vencida do mês, no 5), e os de setembro viram o aviso com o link para Cobranças '
      + 'em setembro');

  const soFora = ler({
    mes: '2026-08', camadas: cadastroEmDia(0), cobrancas: cobrancas({ paga: 24 }),
    registradas: { lista: registradas(0, 24, '2026-08'), parcial: false },
    semBoleto: { linhas: [RECUSA_DE_ENDERECO], total: 1 },
  });
  const s2 = mesNoFunil(soFora);
  chk('RM10d', s2.foco === null && s2.deOutrosMeses?.quantos === 1
               && /^E 1 de outros meses pede você: está sem boleto\.$/.test(s2.deOutrosMeses.frase),
      'e com nada a fazer no mês, o destaque não aparece em lugar nenhum — o aviso de fora aparece '
      + 'sozinho, no singular');

  const risco = passo(RETRATO, 'cobrar').risco;
  chk('RM10e', risco !== null && risco.frase === '1 recusada pelo banco' && !/·/.test(risco.frase)
               && passo(ler({ semBoleto: { linhas: [RECUSA_DE_ENDERECO, ...semBoleto(1, { pede_gente: true })], total: 2 } }), 'cobrar')
                    .risco?.frase === '1 recusada pelo banco e 1 parada há mais de um dia',
      'o risco do mês é frase de gente — «1 recusada pelo banco e 1 parada há mais de um dia», com '
      + '«e» e não com «·»');
  /* [01/10/2026, etapa 7b] Só parada, sem recusa: é tarefa (`a_fazer`), e não a
     falha — ninguém pediu o boleto ainda. */
  const soParada = passo(ler({ semBoleto: { linhas: semBoleto(1, { pede_gente: true }), total: 1 } }), 'cobrar').risco;
  chk('RM10f', risco?.tom === 'erro' && soParada !== null && soParada.tom === 'a_fazer',
      'o risco com recusa do banco é `erro`; o boleto só parado há mais de um dia, sem recusa, é `a_fazer`');
}

// --------------------------------- RM10b o que está em cada passo soma o mês
{
  const r = passo(RETRATO, 'receber');
  chk('RM10b', r.quantos === 8 && r.contexto === '4 já pagas' && r.risco?.quantos === 2,
      '«a receber» é o que tem boleto e espera o cliente: 11 vivas menos 3 sem boleto = 8, com as 4 '
      + 'pagas de contexto e as 2 vencidas como risco — nenhuma unidade contada em dois passos');
}

/* ==========================================================================
 * RM11 — o cadastro fica à parte
 * ========================================================================== */

// ----------------------------- RM11 trava de cadastro não consome o destaque
{
  const travado = ler({
    camadas: [...cadastroEmDia(0), camada('contrato_ativo', 'pendente', 6),
              camada('dono_da_usina', 'pendente', 2, 4, 'bloqueia_split')],
    cobrancas: cobrancas({ rascunho: 5 }),
    registradas: { lista: registradas(0, 5), parcial: false },
  });
  const m = mesNoFunil(travado);
  const contrato = m.travas.find((t) => t.camada === 'contrato_ativo');
  chk('RM11', m.foco?.chave === 'emitir' && contrato !== undefined && contrato.endereco !== null
              && contrato.faltam === 6 && contrato.contagem === 'unidades'
              && m.travasDoRepasse.length === 1 && m.travas.every((t) => t.efeito !== 'bloqueia_split'),
      'com 6 unidades sem contrato e 5 rascunhos, o destaque é EMITIR, e o contrato vira uma linha '
      + 'própria com o link de onde se resolve — o que só impede dividir o dinheiro vai numa frase à '
      + 'parte. Até 30/09 o contrato consumia o «agora» de quem tinha cinco cobranças para emitir');
  chk('RM11b', travasDe(cadastroEmDia(15), ['bloqueia_fatura']).every((t) => t.camada !== 'conta_lida_da_competencia'),
      'a conta lida é o PASSO 1 e nunca é listada como trava — seria dizer duas vezes a mesma coisa');
  const t = travasDe([camada('contrato_ativo', 'pendente', 11)], ['bloqueia_fatura'])[0]!;
  chk('RM11c', t.titulo === VERBETE_DA_CAMADA['contrato_ativo']!.titulo && t.titulo !== t.camada && t.frase.length > 0,
      'a trava mostra o verbete de `vocabulario.ts` — o nome curto e a frase de quem opera —, e não '
      + 'o nome da camada');
}

/* ==========================================================================
 * RM12..RM15 — o texto aponta lugares que existem
 * ========================================================================== */

// -------------------------------------------- RM12 todo destino está no menu
{
  const destinos = MOLDES.flatMap((m) => [m.destino, ...(m.destinoDoRisco ? [m.destinoDoRisco] : [])]);
  const fora = destinos.filter((d) => caminhoNoMenu(d.endereco) === null);
  chk('RM12', fora.length === 0 && destinos.length >= MOLDES.length,
      `todo «Abrir X» do funil — o de cada passo e o do risco — aponta uma tela que é item do menu`
      + `${fora.length ? ` (fora: ${fora.map((d) => d.endereco).join(', ')})` : ''} - link para lugar nenhum `
      + 'é pior que link nenhum');
}

// ------------------------------- RM13 o nome no botão é o que se lê onde se clica
{
  /* «RÓTULO DO ITEM» (30/09/2026, etapa 3b): o ÚLTIMO nome de `caminhoNoMenu`
   * — o nome da tela no menu lateral, debaixo do título da seção. É a palavra
   * que a pessoa lê no lugar em que clica. Até a etapa 3 era `caminhoNaBarra`,
   * com a aba solta ou o item dentro do suspenso «Cadastros ▾». */
  const destinos = MOLDES.flatMap((m) => [m.destino, ...(m.destinoDoRisco ? [m.destinoDoRisco] : [])]);
  const divergem = destinos.filter((d) => {
    const c = caminhoNoMenu(d.endereco);
    return !c || c[c.length - 1] !== d.rotulo;
  });
  chk('RM13', divergem.length === 0,
      'o nome no botão é LETRA POR LETRA o que o menu mostra onde se clica'
      + `${divergem.length ? ` (divergem: ${divergem.map((d) => d.rotulo).join(', ')})` : ''} - «Abrir Fatura `
      + 'unificada» para uma aba chamada Contas de luz faz a pessoa procurar a aba errada');
  const menu = caminhoNoMenu('/unidades');
  chk('RM13b', menu?.join(' › ') === 'Cadastros › Unidades consumidoras'
               && caminhoNoMenu('/documento')?.join(' › ') === 'O mês, passo a passo › Contas de luz'
               && caminhoNoMenu('/contas-a-pagar')?.join(' › ') === 'Caixa › Contas a pagar'
               && caminhoNoMenu('/pendencias')?.join(' › ') === 'Mês'
               && MOLDES.some((m) => m.comoFazer.some((l) => l.includes(menu![1]!))),
      'o rótulo é o nome do ITEM, debaixo do título da seção («Unidades consumidoras», na seção '
      + '«Cadastros») — e é assim que o passo 4 a nomeia');
}

// ---------------------- RM14 o roteiro não manda procurar aba que saiu ou mudou
{
  /* ATÉ 10/09/2026 o passo 2 nomeava a aba «Faturamento» para dizer que não era
   * ali; ela saiu e o aviso virou o problema. Em 30/09/2026 três abas mudaram de
   * nome, e a mesma regra vale para os nomes velhos: entre «», o texto só cita o
   * que a barra mostra hoje. */
  const VELHOS = ['«Faturamento»', '«Fatura unificada»', '«Emissão e cobrança»', '«Pendências»'];
  const citam = MOLDES.filter((m) => [m.oQueFazer, ...m.comoFazer].some((l) => VELHOS.some((v) => l.includes(v))));
  const naBarra = TELAS.some((t) => ['Faturamento', 'Fatura unificada', 'Emissão e cobrança', 'Pendências'].includes(t.titulo));
  chk('RM14', citam.length === 0 && !naBarra,
      'nenhum passo cita aba que saiu da barra ou mudou de nome — instrução que nomeia aba inexistente '
      + 'faz a pessoa procurar na barra inteira antes de duvidar do texto'
      + `${citam.length ? ` (citam: ${citam.map((m) => m.chave).join(', ')})` : ''}`);
}

// ----------------------------------------- RM15 nenhum passo fica sem instrução
{
  const mudos = MOLDES.filter((m) => !m.titulo.trim() || !m.oQueFazer.trim() || m.comoFazer.length === 0);
  chk('RM15', mudos.length === 0 && MOLDES.length === 5,
      `os ${MOLDES.length} passos têm título, o que fazer e ao menos um como fazer`
      + `${mudos.length ? ` (mudos: ${mudos.map((m) => m.chave).join(', ')})` : ''}`);
}

/* ==========================================================================
 * RM16..RM18 — a frase do mês, uma só
 * ========================================================================== */

// ----------------------------- RM16 a frase diz o estado E onde começar
{
  const f = mesNoFunil(RETRATO).frase;
  const doisPassos = mesNoFunil(ler({ camadas: cadastroEmDia(15), cobrancas: cobrancas({ rascunho: 5 }),
                                      registradas: { lista: registradas(0, 5), parcial: false } })).frase;
  /* [30/09, etapa 4a] sem o «·» no meio da frase corrida. [01/10/2026, etapa
     7b] E sem o «Comece pelo passo…»: a frase diz POR QUE aquele passo, com as
     palavras do selo dele — «O mais urgente é o passo 4» quando é o risco, «O
     próximo é o passo 3» quando é só o trabalho mais perto do dinheiro. */
  chk('RM16', /^Falta trabalho nos cinco passos\. O mais urgente é o passo 4, Pedir o boleto/.test(f) && /recusada pelo banco/.test(f)
              && /^Falta trabalho em dois dos cinco passos\. O próximo é o passo 3, Emitir as cobranças: 5 cobranças a emitir\.$/.test(doisPassos)
              && !/·/.test(f) && !/Comece/.test(f + doisPassos),
      `no retrato de 30/09 a frase diz quantos passos têm trabalho, qual é o mais urgente e por quê — «${f}»`);
}

// ------------- RM16b o rótulo do destaque: urgência pelo risco, próximo passo sem ele
{
  const comRisco = mesNoFunil(RETRATO);
  const semRisco = mesNoFunil(ler({ camadas: cadastroEmDia(15), cobrancas: cobrancas({ rascunho: 5 }),
                                    registradas: { lista: registradas(0, 5), parcial: false } }));
  const rotulos = (m: ReturnType<typeof mesNoFunil>) => m.passos.map(rotuloDoDestaque).filter(Boolean);
  chk('RM16b', rotulos(comRisco).join() === ROTULO_DO_DESTAQUE.risco && rotuloDoDestaque(comRisco.foco!) === 'Mais urgente agora'
              && rotulos(semRisco).join() === ROTULO_DO_DESTAQUE.trabalho && rotuloDoDestaque(semRisco.foco!) === 'Próximo passo',
      'o destaque pelo risco diz «Mais urgente agora»; sem risco, no trabalho mais perto do dinheiro, '
      + '«Próximo passo» — e só o passo em destaque tem rótulo');
  /* E O RISCO TEM O TOM DO QUE ELE CONTA (`tom-do-estado.ts`): a recusa e a
     vencida são `erro`; o boleto só parado sem pedido, `a_fazer`. */
  const cobrar = comRisco.passos.find((p) => p.chave === 'cobrar')!;
  const receber = comRisco.passos.find((p) => p.chave === 'receber')!;
  chk('RM16c', cobrar.risco?.tom === 'erro' && /recusada pelo banco/.test(cobrar.risco.frase)
              && (receber.risco === null || receber.risco.tom === 'erro'),
      'o risco com recusa do banco é `erro` (vermelho), como a recusa em Cobranças e em Contas a '
      + 'receber; a vencida também');
}

// --------------------------------------- RM17 o mês fechado fala, e só medido
{
  const fechado = mesNoFunil(ler({ cobrancas: cobrancas({ paga: 41 }), registradas: { lista: registradas(0, 41), parcial: false } }));
  const semMedida = mesNoFunil(ler({ cobrancas: null }));
  chk('RM17', fechado.estado === 'fechado' && fechado.foco === null
              && fechado.frase === 'Nada falta fazer neste mês: o que resta é o cliente pagar, e isso o sistema acompanha sozinho.'
              && semMedida.estado === 'nao_medido' && !/Nada falta/.test(semMedida.frase),
      'medido e sem trabalho, a frase é a do mês fechado — a mesma nos três lugares que narram o mês —; '
      + 'com uma leitura faltando, ela diz que não dá para dizer, e nunca «nada falta»');
}

// ----------------------------- RM18 o escolhedor do foco é a mesma regra, isolada
{
  const base = mesNoFunil(RETRATO).passos.map(({ foco: _f, ...p }) => p);
  const semRiscos = base.map((p) => ({ ...p, risco: null }));
  chk('RM18', escolherOFoco(base) === 'cobrar' && escolherOFoco(semRiscos) === 'cobrar'
              && escolherOFoco(semRiscos.map((p) => (p.chave === 'cobrar' ? { ...p, quantos: 0 } : p))) === 'emitir',
      '`escolherOFoco` isolado: com os riscos, o 4; sem eles, ainda o 4 (tem trabalho e é o mais perto '
      + 'do dinheiro); zerado o 4, o 3');
}

/* ==========================================================================
 * RM19..RM24 — «que parte do mês é esta tela»
 * ========================================================================== */

// --------------------------- RM19 as duas telas de trabalho se reconhecem
{
  const cl = ondeEstouNoMes('/documento');
  const co = ondeEstouNoMes('/faturas');
  chk('RM19', cl !== null && co !== null
              && cl.aqui.map((p) => p.numero).join(',') === '1,2'
              && co.aqui.map((p) => p.numero).join(',') === '3,4',
      'Contas de luz hospeda os passos 1 e 2 e Cobranças os passos 3 e 4 — a faixa de cada tela sai da '
      + 'MESMA lista que monta o funil, então as duas não têm como discordar');
}

// ----------------------------- RM20 o antes e o depois apontam a tela vizinha
{
  const co = ondeEstouNoMes('/faturas')!;
  chk('RM20', co.antes?.numero === 2 && co.antes?.destino?.endereco === '/documento' && co.depois?.numero === 5,
      'quem está em Cobranças vê que o passo 2 acontece em Contas de luz e que ainda há um 5 depois');
}

// ---------------------- RM21 a tela que abre o mês não inventa um passo anterior
{
  const cl = ondeEstouNoMes('/documento')!;
  chk('RM21', cl.antes === null && cl.depois?.numero === 3 && !cl.deOutroSetor,
      'e a tela que ABRE o mês não tem «antes daqui»');
}

// ------------------ RM22 tela que não hospeda passo nenhum não ganha faixa
{
  const semPasso = ['/clientes', '/unidades', '/contratos', '/usinas', '/donos', '/cobranca',
                    '/historico', '/relatorios', '/carteira', '/pendencias', '/contas-a-receber'];
  const inventadas = semPasso.filter((r) => ondeEstouNoMes(r) !== null);
  chk('RM22', inventadas.length === 0,
      `nenhuma tela de cadastro ganha faixa de passo${inventadas.length ? ` (ganharam: ${inventadas.join(', ')})` : ''}`
      + ' - e a APOSENTADA está nessa lista: dar a ela uma faixa seria convidar de volta para o caminho '
      + 'que trava a unidade');
}

// ----------------------------- RM23 todo passo do mês tem onde acontecer
{
  const cobertos = new Set(MOLDES.flatMap((m) => ondeEstouNoMes(m.destino.endereco)?.aqui.map((p) => p.numero) ?? []));
  chk('RM23', cobertos.size === MOLDES.length,
      'os cinco passos têm tela, e cada um é alcançado pela faixa de alguma delas');
}

// --------------------- RM24 Contas a pagar é o fim do mês, e de outro setor
{
  const cp = ondeEstouNoMes('/contas-a-pagar');
  chk('RM24', cp !== null && cp.aqui.map((p) => p.numero).join() === '5' && cp.depois === null
              && cp.antes?.destino?.endereco === '/faturas' && cp.deOutroSetor,
      'Contas a pagar é o passo 5 e FECHA o mês (sem «depois»), aponta o passo 4 em Cobranças, e sabe '
      + 'que é de outro setor — a faixa dela diz «do mês do Rateio», porque quem chega pela Empresa '
      + 'não sabe de que mês ela é o fim');
}

/* ==========================================================================
 * RM25 — o menu conta a mesma sequência (30/09/2026, etapa 3b)
 * ========================================================================== */

// ------------------ RM25 o número no menu é o do funil e o da faixa, sempre
{
  /* O menu lateral mostra, ao lado de Contas de luz, Cobranças e Contas a pagar,
   * os passos do mês que acontecem ali («1–2», «3–4», «5»). O número é DADO em
   * `navegacao.ts` (o menu mora no pedaço de entrada e não pode carregar este
   * módulo), e é por isso que ele é conferido aqui contra `ondeEstouNoMes`: se um
   * passo mudar de tela nos moldes, o menu tem de mudar junto, ou esta linha
   * falha. As três contam a mesma sequência, ou nenhuma conta. */
  const divergem = TELAS.filter((t) => {
    const doFunil = ondeEstouNoMes(t.rota)?.aqui.map((p) => p.numero).join() ?? '';
    return (t.passos ?? []).join() !== doFunil;
  });
  chk('RM25', divergem.length === 0 && TELAS.some((t) => t.passos?.length),
      'o número do passo que o menu mostra em cada tela é o mesmo que o funil da tela Mês e a faixa da '
      + `própria tela mostram${divergem.length ? ` (divergem: ${divergem.map((t) => `${t.titulo} menu «${rotuloDosPassos(t.passos)}»`).join(', ')})` : ''}`);
}

/* ==========================================================================
 * RM26..RM29 — o botão leva ao que falta (01/10/2026, etapa 7a)
 * ==========================================================================
 *
 * «15 contas a ler» levava a Contas de luz, que lista as JÁ lidas. Agora o
 * botão do passo e o link de cada trava carregam o recorte e o mês — e as
 * garantias de RM12/RM13 continuam: a ROTA do endereço é item do menu, e o
 * nome no botão é o do item.
 */
{
  const m = mesNoFunil(ler({ camadas: [...cadastroEmDia(15), camada('contrato_ativo', 'pendente', 6)] }));
  const p1 = m.passos.find((p) => p.chave === 'ler')!;
  const [rota, consulta] = p1.ir.split('?');
  const menu = caminhoNoMenu(rota!);
  chk('RM26', p1.ir === `/documento?pendencia=sem_conta&mes=${MES}` && menu !== null
              && menu[menu.length - 1] === p1.destino.rotulo && p1.destino.endereco === rota,
      '«15 contas a ler» abre Contas de luz no recorte das que FALTAM, do mês do funil — e a rota do '
      + 'endereço continua sendo o item do menu, com o nome do botão letra por letra (RM12/RM13)');
  chk('RM26b', filtroDaConsulta(`?${consulta}`, FILTROS_DA_TELA['/documento']) === 'sem_conta'
               && MOLDES.every((mo) => !mo.recorte
                 || (FILTROS_DA_TELA as Record<string, readonly string[]>)[mo.destino.endereco]?.includes(mo.recorte)),
      'todo recorte de passo é do vocabulário da tela de destino — recorte que a tela ignora abriria a '
      + 'lista inteira, e quem clicou acharia que aquilo é o que falta');
  const p3 = m.passos.find((p) => p.chave === 'emitir')!;
  const p5 = m.passos.find((p) => p.chave === 'receber')!;
  chk('RM26c', p3.ir === `/faturas?mes=${MES}` && p5.ir === p5.destino.endereco,
      'Cobranças abre no mês do funil (ela já lia `?mes=`); a tela que não lê o mês recebe a rota limpa');
  const contrato = m.travas.find((t) => t.camada === 'contrato_ativo')!;
  chk('RM27', contrato.endereco === '/contratos?pendencia=sem_contrato',
      'a trava «Contrato ativo (6 unidades)» leva a Contratos já na lista das unidades sem contrato ativo');
}

{
  /* AS CONTAS QUE FALTAM — o predicado da camada `conta_lida_da_competencia`:
     faturável sem conta registrada NAQUELE mês, casada pelo número exato. */
  const u = (i: number, p: Partial<UcDaLista> = {}): UcDaLista => ({
    id: `u${i}`, numero_uc: `00${i}`, cliente_id: `c${i}`, usina_id: 'us', distribuidora: 'Equatorial Goiás',
    status: 'ativa', rateio_situacao: 'ativado', crm_usina_cliente_id: `crm${i}`, ...p,
  });
  const ucs = [u(1), u(2), u(3), u(4, { rateio_situacao: 'aguardando_ativacao' }), u(5, { status: 'cancelada' }), u(6)];
  const nomes = { cliente: (id: string) => ({ c1: 'Ana', c2: 'Bruno', c3: 'Carla', c6: 'Diego' } as Record<string, string>)[id] ?? null,
                  usina: () => 'Usina Sol' };
  const lidas = { lista: [{ numero_uc: '001', competencia: '2026-09-01' }, { numero_uc: '002', competencia: '2026-08-01' },
                          { numero_uc: '3', competencia: '2026-09-01' }], parcial: false };
  const f = contasQueFaltam(ucs, lidas, '2026-09', nomes)!;
  chk('RM28', f.map((x) => x.numero_uc).join() === '002,003,006' && f[0]!.cliente === 'Bruno' && f[0]!.usina === 'Usina Sol',
      'faltam as faturáveis sem conta DO MÊS — a de agosto não conta, o número casa exato como no '
      + 'servidor («3» não é «003»), e a que não fatura ou foi cancelada fica de fora; cada uma com cliente e usina');
  chk('RM28b', contasQueFaltam(ucs, null, '2026-09', nomes) === null
               && contasQueFaltam(ucs, { lista: lidas.lista, parcial: true }, '2026-08', nomes) === null
               && contasQueFaltam(ucs, { lista: lidas.lista, parcial: true }, '2026-09', nomes) !== null,
      'sem as contas, ou com a lista no teto e o mês sendo o mais velho dela, a lista é DESCONHECIDA — '
      + 'dar a unidade por faltante mandaria ler de novo uma conta já registrada');
  chk('RM29', mesDasContasQueFaltam({ doEndereco: '2026-08', lembrado: '2026-07', registradas: lidas.lista, hoje: '2026-10' }) === '2026-08'
              && mesDasContasQueFaltam({ doEndereco: null, lembrado: '2026-07', registradas: lidas.lista, hoje: '2026-10' }) === '2026-07'
              && mesDasContasQueFaltam({ doEndereco: 'lixo', lembrado: null, registradas: lidas.lista, hoje: '2026-10' }) === '2026-09'
              && mesDasContasQueFaltam({ doEndereco: null, lembrado: null, registradas: [], hoje: '2026-10' }) === '2026-10',
      'o mês da lista: o do endereço (o Mês manda), o lembrado, o mais recente com conta, o de hoje — e '
      + 'endereço inválido não vira mês');
}

console.log(`\n${falhas === 0 ? 'roteiro-do-mes: todas as verificacoes passaram'
                              : `roteiro-do-mes: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
