// O ROTEIRO DO MÊS. Sem banco, sem rede, sem React.
// Uso: node --experimental-strip-types web/tests/roteiro-do-mes.ts
//
// O QUE ESTAS VERIFICAÇÕES AFIRMAM, e nenhuma delas é a tabela de novo:
//
//   um só «agora»    a caixa inteira existe para dizer UMA coisa a fazer. Dois
//                    passos abertos ao mesmo tempo é o mesmo que nenhum, e é o
//                    defeito que a tela das treze camadas já tinha;
//   nada sem medida   sem a posição da carteira, nenhum passo diz «feito». Não
//                    ter medido não autoriza dizer que está bem — a mesma
//                    disciplina do `nao_medido` e do `nao_verificavel`;
//   travar não pula   um passo travado por cadastro CONSOME o «agora»: destravar
//                    é o trabalho de agora, e mandar seguir para o passo
//                    seguinte terminaria numa recusa do servidor;
//   o texto aponta    todo passo tem o que fazer, como fazer e para onde ir — e
//                    o «como» não pode nomear tela que não existe.

import {
  roteiroDoMes, passoDeAgora, travasDe, MOLDES,
  type CamadaDoRoteiro, type LeituraDoMes, type PosicaoDoMes,
} from '../src/roteiro-do-mes.ts';
import { TELAS } from '../src/navegacao.ts';
import { VERBETE_DA_CAMADA } from '../src/vocabulario.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/* ==========================================================================
 * As peças de montar
 * ========================================================================== */

const camada = (
  nome: string,
  situacao: CamadaDoRoteiro['situacao'],
  faltam = 0,
  total = 29,
  efeito: CamadaDoRoteiro['efeito'] = 'bloqueia_fatura',
): CamadaDoRoteiro => ({ camada: nome, situacao, faltam, total, efeito });

/** O mês em que só falta ler as contas — o retrato real de 10/09/2026. */
const SO_FALTA_LER: CamadaDoRoteiro[] = [
  camada('conta_lida_da_competencia', 'pendente', 29, 29),
  camada('contrato_ativo', 'ok', 0, 29),
  camada('geracao_da_competencia', 'ok', 0, 3),
  camada('endereco_do_pagador', 'ok', 0, 29, 'bloqueia_boleto'),
  camada('dono_da_usina', 'ok', 0, 4, 'bloqueia_split'),
];

const comTudoLido = (extra: Partial<CamadaDoRoteiro>[] = []): CamadaDoRoteiro[] => [
  camada('conta_lida_da_competencia', 'ok', 0, 29),
  ...SO_FALTA_LER.slice(1),
  ...extra.map((e) => camada(e.camada ?? 'x', e.situacao ?? 'pendente', e.faltam ?? 1, e.total ?? 29, e.efeito)),
];

const posicao = (faturas: number, emitidas: number, liquidadas: number): PosicaoDoMes =>
  ({ faturas, emitidas, liquidadas, vencidas_em_aberto: 0 });

const ler = (e: Partial<LeituraDoMes>): LeituraDoMes => ({
  camadas: SO_FALTA_LER, posicao: null, semCobranca: null, ...e,
});

const estados = (e: Partial<LeituraDoMes>) => roteiroDoMes(ler(e)).map((p) => p.estado);
const agoraDe = (e: Partial<LeituraDoMes>) => passoDeAgora(roteiroDoMes(ler(e)));

/* ==========================================================================
 * RM1..RM4 — a regra do «um só agora»
 * ========================================================================== */

// ----------------------------------------- RM1 exatamente um, em toda combinação
{
  const cenarios: Array<[string, Partial<LeituraDoMes>]> = [
    ['nada medido', {}],
    ['só falta ler', { posicao: posicao(0, 0, 0), semCobranca: 0 }],
    ['lido, nada gerado', { camadas: comTudoLido(), posicao: posicao(0, 0, 0), semCobranca: 0 }],
    ['gerado, nada emitido', { camadas: comTudoLido(), posicao: posicao(29, 0, 0), semCobranca: 0 }],
    ['emitido, sem boleto', { camadas: comTudoLido(), posicao: posicao(29, 29, 0), semCobranca: 11 }],
    ['tudo cobrado', { camadas: comTudoLido(), posicao: posicao(29, 29, 0), semCobranca: 0 }],
    ['tudo pago', { camadas: comTudoLido(), posicao: posicao(29, 29, 29), semCobranca: 0 }],
    ['travado no cadastro', {
      camadas: comTudoLido([{ camada: 'contrato_ativo', situacao: 'pendente', faltam: 11 }]),
      posicao: posicao(0, 0, 0), semCobranca: 0,
    }],
  ];

  const errados = cenarios.filter(([, c]) => {
    const abertos = estados(c).filter((s) => s === 'agora' || s === 'travado').length;
    /* «tudo pago» é o único que pode ter ZERO: o mês fechou. */
    return abertos > 1;
  });

  chk('RM1', errados.length === 0,
      `em nenhum dos ${cenarios.length} cenários há mais de um passo aberto ao mesmo tempo`
      + `${errados.length ? ` (erram: ${errados.map(([n]) => n).join(', ')})` : ''} - duas `
      + 'instruções simultâneas é o mesmo que nenhuma');
}

// ---------------------------------------- RM2 o mês fechado não tem passo aberto
chk('RM2', agoraDe({ camadas: comTudoLido(), posicao: posicao(29, 29, 29), semCobranca: 0 }) === null,
    'com tudo lido, gerado, emitido, cobrado e pago não sobra passo aberto - e a tela usa esse '
    + '`null` para DIZER que fechou, em vez de sumir (caixa que some tem a mesma cara de caixa '
    + 'que quebrou)');

// ------------------------------- RM3 o passo aberto é sempre o primeiro não feito
{
  const passos = roteiroDoMes(ler({ camadas: comTudoLido(), posicao: posicao(29, 0, 0), semCobranca: 0 }));
  const aberto = passoDeAgora(passos)!;
  const antes = passos.slice(0, passos.indexOf(aberto));
  const depois = passos.slice(passos.indexOf(aberto) + 1);

  chk('RM3', aberto.chave === 'emitir'
             && antes.every((p) => p.estado === 'feito')
             && depois.every((p) => p.estado === 'espera'),
      'com as contas lidas e as cobranças geradas, o passo aberto é EMITIR - tudo acima dele sai '
      + '`feito` e tudo abaixo sai `espera`, que é o que faz a lista poder ser lida de uma vez');
}

// ------------------------------------ RM4 a numeração é fixa, e não a da lista
{
  const a = roteiroDoMes(ler({}));
  const b = roteiroDoMes(ler({ camadas: comTudoLido(), posicao: posicao(29, 29, 29), semCobranca: 0 }));
  chk('RM4', a.every((p, i) => p.numero === i + 1 && p.numero === b[i]!.numero),
      'o número de cada passo é o mesmo em qualquer estado do mês - «você está no 2 de 5» só é '
      + 'uma frase que se guarda de um dia para o outro se o 2 for sempre o mesmo passo');
}

/* ==========================================================================
 * RM5..RM7 — nada é afirmado sem medida
 * ========================================================================== */

// ------------------------------------------ RM5 sem a carteira, nada vira «feito»
{
  const passos = roteiroDoMes(ler({ camadas: comTudoLido(), posicao: null, semCobranca: null }));
  const depoisDeLer = passos.filter((p) => p.chave !== 'ler');
  chk('RM5', passos[0]!.estado === 'feito' && depoisDeLer.every((p) => p.estado !== 'feito'),
      'sem a posição da carteira, só o passo que TEM medida própria (as contas lidas) pode sair '
      + '`feito`; os outros quatro não - não ter medido não autoriza dizer que está bem');
}

// ------------------------------------------- RM6 sem medida, a contagem é nula
{
  const passos = roteiroDoMes(ler({ posicao: null, semCobranca: null }));
  const inventadas = passos.filter((p) => p.chave !== 'ler' && p.contagem !== null);
  chk('RM6', inventadas.length === 0,
      'e nenhuma contagem é inventada quando o número não chegou: `null` vira ausência de texto '
      + `na tela${inventadas.length ? ` (inventaram: ${inventadas.map((p) => p.chave).join(', ')})` : ''}`);
}

// ------------------------- RM7 competência sem universo medido não fecha o passo
{
  const semUniverso = [camada('conta_lida_da_competencia', 'nao_medido', 0, 0), ...SO_FALTA_LER.slice(1)];
  const passos = roteiroDoMes(ler({ camadas: semUniverso, posicao: posicao(0, 0, 0), semCobranca: 0 }));
  chk('RM7', passos[0]!.estado !== 'feito' && passos[0]!.contagem === null
             && passos[1]!.estado !== 'feito',
      '`nao_medido` na conta lida não fecha o passo 1 nem o 2, e não imprime contagem - um mês '
      + 'sem universo medido não tem denominador, e «0 de 0» em verde seria o relatório '
      + 'autorizando o que não conferiu');
}

/* ==========================================================================
 * RM8..RM10 — travar é o trabalho de agora
 * ========================================================================== */

// --------------------------------- RM8 pendência de cadastro trava o passo certo
{
  const passos = roteiroDoMes(ler({
    camadas: comTudoLido([{ camada: 'contrato_ativo', situacao: 'pendente', faltam: 11 }]),
    posicao: posicao(0, 0, 0), semCobranca: 0,
  }));
  const gerar = passos.find((p) => p.chave === 'gerar')!;
  chk('RM8', gerar.estado === 'travado' && gerar.travas.some((t) => t.camada === 'contrato_ativo')
             && passos.filter((p) => p.estado === 'agora').length === 0,
      'contrato faltando trava GERAR, e o passo travado consome o «agora» - seguir o passo a passo '
      + 'com uma porta fechada na frente termina numa recusa do servidor depois de cinco cliques');
}

// -------------------------------- RM9 a trava do boleto não trava o passo de gerar
{
  const passos = roteiroDoMes(ler({
    camadas: comTudoLido([{ camada: 'endereco_do_pagador', situacao: 'pendente', faltam: 10, efeito: 'bloqueia_boleto' }]),
    posicao: posicao(29, 29, 0), semCobranca: 10,
  }));
  chk('RM9', passos.find((p) => p.chave === 'gerar')!.estado === 'feito'
             && passos.find((p) => p.chave === 'cobrar')!.estado === 'travado',
      'endereço do pagador faltando NÃO impede gerar nem emitir: ele trava o boleto, e o passo '
      + 'que ele trava é o de cobrar - a mesma distinção `bloqueia_fatura` x `bloqueia_boleto` '
      + 'que o servidor faz desde 08/09/2026');
}

// --------------------------------- RM10 a conta lida nunca aparece como trava
{
  const travas = travasDe(SO_FALTA_LER, 'bloqueia_fatura');
  chk('RM10', travas.every((t) => t.camada !== 'conta_lida_da_competencia'),
      'a conta lida é o PASSO 1 e nunca é listada como trava do passo 2 - seria dizer duas vezes '
      + 'a mesma coisa, e uma delas fora de ordem');
}

/* ==========================================================================
 * RM11..RM14 — o texto, que é o que a pessoa lê
 * ========================================================================== */

// ------------------------------------------- RM11 nenhum passo fica sem instrução
{
  const mudos = MOLDES.filter((m) =>
    !m.titulo.trim() || !m.oQueFazer.trim() || m.comoFazer.length === 0);
  chk('RM11', mudos.length === 0 && MOLDES.length === 5,
      `os ${MOLDES.length} passos têm título, o que fazer e ao menos um como fazer`
      + `${mudos.length ? ` (mudos: ${mudos.map((m) => m.chave).join(', ')})` : ''} - passo sem `
      + 'instrução é uma linha que só informa que existe trabalho');
}

// ------------------------------------------- RM12 todo destino é uma tela de verdade
{
  const rotas = new Set(TELAS.map((t) => t.rota));
  const inventados = MOLDES.filter((m) => m.destino && !rotas.has(m.destino.endereco));
  chk('RM12', inventados.length === 0,
      'todo «Abrir X» aponta uma rota que existe na barra de navegação'
      + `${inventados.length ? ` (inventados: ${inventados.map((m) => m.destino!.endereco).join(', ')})` : ''}`
      + ' - link para lugar nenhum é pior que link nenhum');
}

// ----------------------------- RM13 o rótulo do destino é o mesmo da barra
{
  const porRota = new Map(TELAS.map((t) => [t.rota, t.titulo]));
  const divergem = MOLDES.filter((m) => m.destino && porRota.get(m.destino.endereco) !== m.destino.rotulo);
  chk('RM13', divergem.length === 0,
      'e o nome no botão é LETRA POR LETRA o rótulo da aba na barra'
      + `${divergem.length ? ` (divergem: ${divergem.map((m) => m.destino!.rotulo).join(', ')})` : ''}`
      + ' - mandar «Abrir Fatura unificada» para uma aba escrita de outro jeito faz a pessoa '
      + 'procurar a aba errada');
}

// --------------------- RM14 o passo de gerar avisa sobre a tela aposentada
{
  const gerar = MOLDES.find((m) => m.chave === 'gerar')!;
  const aposentada = TELAS.find((t) => t.rota === '/carteira')!;
  chk('RM14', gerar.comoFazer.some((l) => l.includes(aposentada.titulo)),
      `o passo de gerar nomeia «${aposentada.titulo}» para dizer que NÃO é ali - é a tela de nome `
      + 'mais óbvio da barra e é o caminho aposentado desde 21/08/2026, e uma cobrança composta '
      + 'por lá TRAVA a mesma unidade no caminho oficial');
}

// ------------------- RM15 a trava fala português de quem opera, e não nome de coluna
{
  const travas = travasDe(
    [camada('contrato_ativo', 'pendente', 11), camada('dono_da_usina', 'pendente', 4, 4, 'bloqueia_split')],
    'bloqueia_fatura');
  const t = travas[0]!;
  chk('RM15', travas.length === 1 && t.titulo === VERBETE_DA_CAMADA['contrato_ativo']!.titulo
              && t.titulo !== t.camada && t.frase.length > 0,
      'a trava mostra o verbete de `vocabulario.ts` — o nome curto e a frase de quem opera —, e '
      + 'não o nome da camada. Os dois mapas que já existiam não são reescritos aqui');
}

// ------------------------------ RM16 o passo automático nunca vira «agora»
{
  const passos = roteiroDoMes(ler({
    camadas: comTudoLido(), posicao: posicao(29, 29, 0), semCobranca: 0,
  }));
  const receber = passos.find((p) => p.chave === 'receber')!;
  chk('RM16', receber.automatico && receber.estado === 'espera',
      'com tudo cobrado e nada pago, o passo de RECEBER fica em espera e não vira «agora»: não há '
      + 'o que clicar, e pôr uma pessoa a esperar por ele seria mandá-la olhar a tela');
}

// -------------- RM17 nenhuma contagem tem denominador zero, nem tranquiliza à toa
{
  const zerado = roteiroDoMes(ler({
    camadas: SO_FALTA_LER, posicao: posicao(0, 0, 0), semCobranca: 0,
  }));
  const comZero = zerado.filter((p) => p.contagem !== null && / de 0\b/.test(p.contagem));
  const cobrar = zerado.find((p) => p.chave === 'cobrar')!;

  chk('RM17', comZero.length === 0 && cobrar.contagem === null,
      'num mês em que nada foi gerado, nenhum passo imprime «0 de 0» e o passo do boleto NÃO diz '
      + '«todas com boleto» - a segunda é pior que a primeira: tranquiliza sobre um trabalho que '
      + `nem começou${comZero.length ? ` (imprimem: ${comZero.map((p) => p.contagem).join(', ')})` : ''}`);

  /* E o contrário também: havendo trabalho parado em OUTRO mês, o número aparece
   * mesmo neste - é dinheiro parado, e some se a caixa só olhar a competência. */
  const comAtrasoDeOutroMes = roteiroDoMes(ler({
    camadas: SO_FALTA_LER, posicao: posicao(0, 0, 0), semCobranca: 7,
  }));
  chk('RM18', /7 sem boleto/.test(comAtrasoDeOutroMes.find((p) => p.chave === 'cobrar')!.contagem ?? ''),
      'e cobrança sem boleto de mês anterior aparece assim mesmo, dizendo que conta todos os meses '
      + '- «uma fatura de MAI que nunca virou boleto continua sendo dinheiro parado em SET»');
}

console.log(`\n${falhas === 0 ? 'roteiro-do-mes: todas as verificacoes passaram'
                              : `roteiro-do-mes: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
