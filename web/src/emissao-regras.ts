// A TELA DE EMISSÃO E COBRANÇA como dado puro: em que ordem as linhas aparecem,
// qual é a ação de cada uma, o que uma recusa do banco quer dizer e para onde
// ela manda, em que mês a tela abre. Sem JSX, sem `fetch`, sem estado de React.
//
// ============================================================================
// POR QUE ISTO NASCEU EM 30/09/2026 (etapa 2 do redesenho)
//
// A crítica de 30/09 (P1 nº 2) mediu cinco defeitos na tela, e quatro deles são
// REGRA, não desenho:
//
//   1. A ORDEM ERA A DO VENCIMENTO. Pagas e vencidas no topo, e os cinco
//      rascunhos — as únicas linhas com «Emitir» — no FIM de uma tabela de vinte.
//      A tela mostrava primeiro o que já estava resolvido;
//   2. A RECUSA ERA CRUA E SEM SAÍDA. «Último erro do banco: PagadorSemEndereco»,
//      e logo abaixo o mesmo «Gerar boleto» laranja — que o servidor vai recusar
//      de novo, pelo mesmo motivo, até alguém completar o endereço em OUTRA tela
//      que a linha não nomeava;
//   3. O MÊS ERA O DE HOJE. A cobrança nasce na competência da CONTA, que quase
//      nunca é o mês corrente — o próprio vazio da tabela admitia isso;
//   4. O BOLETO ERA PEDIDO LINHA A LINHA, e a lista do que falta pedir existia
//      (`/emissao/travada`) sem virar ato.
//
// O runner do `web/` não lê JSX (regra 8), então o que decide o que a pessoa vê
// primeiro e o que ela é mandada fazer mora aqui, com suíte em
// `web/tests/cobranca.ts` (B14–B21).
//
// ============================================================================
// O QUE ESTE ARQUIVO NÃO FAZ
//
// Não decide se um boleto PODE sair. Quem decide é `src/repos/boleto.ts`, que
// recusa nomeando. O que mora aqui é o espelho do que já se sabe sem perguntar:
// o endereço que falta está no cadastro da unidade, e a mesma função que o
// servidor usa para recusar (`faltamNoEndereco`, via `unidades-regras.ts`) diz
// isso antes do pedido. Oferecer «Pedir o boleto» numa linha que a tela SABE que
// volta recusada é mandar a pessoa colher um erro.

import type { NivelDaEmissao } from './emissao-travada.ts';
import { faltamParaOBoleto, type EnderecoDaUc } from './unidades-regras.ts';
import { destinoDoEndereco } from './destino-da-camada.ts';

/** O status da cobrança, como o enum `status_fatura` do banco. */
export type StatusDaCobranca = 'rascunho' | 'emitida' | 'paga' | 'vencida' | 'cancelada' | 'negociada';

/* ==========================================================================
 * 1. A ORDEM DO QUE PRECISA DE AÇÃO
 * ==========================================================================
 *
 * O TRABALHO PRIMEIRO, na ordem em que o mês anda: emitir o rascunho, depois
 * pôr no banco o que foi emitido e não tem boleto (inclusive o que o banco
 * recusou), depois cobrar o que venceu. Emitida com boleto é o dinheiro a
 * caminho, e paga é o que já chegou. Cancelada vai por último: é registro, não
 * trabalho.
 *
 * DENTRO DE CADA GRUPO, O VENCIMENTO: o cliente que vence antes é o que precisa
 * do boleto antes.
 */
export type GrupoDeAcao = 'emitir' | 'boleto' | 'vencida' | 'emitida' | 'paga' | 'cancelada';

export const ORDEM_DOS_GRUPOS: readonly GrupoDeAcao[] =
  ['emitir', 'boleto', 'vencida', 'emitida', 'paga', 'cancelada'];

/**
 * O grupo da linha. `semBoleto` vem de `/emissao/travada` — a lista, feita no
 * servidor, das emitidas cuja cobrança ainda não chegou ao banco. A tabela do
 * mês não traz o boleto de cada linha, e buscá-lo linha a linha seriam vinte
 * pedidos para ordenar uma tabela.
 *
 * `negociada` anda com a emitida: é cobrança viva, com outro combinado.
 */
export function grupoDeAcao(status: StatusDaCobranca, semBoleto: boolean): GrupoDeAcao {
  if (status === 'rascunho') return 'emitir';
  if ((status === 'emitida' || status === 'vencida') && semBoleto) return 'boleto';
  if (status === 'vencida') return 'vencida';
  if (status === 'paga') return 'paga';
  if (status === 'cancelada') return 'cancelada';
  return 'emitida';
}

/**
 * A CHAVE DE ORDENAÇÃO, como texto: `"0|2026-10-05"`. É o formato que o
 * `ordenar` de `ui.tsx` já compara (com `numeric: true`), e por isso a ordem de
 * ação é mais uma coluna ordenável — a padrão — e não um segundo mecanismo de
 * ordenar ao lado do primeiro.
 */
export function chaveDaOrdemDeAcao(
  f: { status: StatusDaCobranca; vencimento: string | null | undefined },
  semBoleto: boolean,
): string {
  const g = ORDEM_DOS_GRUPOS.indexOf(grupoDeAcao(f.status, semBoleto));
  return `${g}|${String(f.vencimento ?? '9999-12-31').slice(0, 10)}`;
}

/* ==========================================================================
 * 2. A RECUSA DO BANCO, LIDA
 * ==========================================================================
 *
 * SÓ OS CÓDIGOS CONHECIDOS SÃO TRADUZIDOS, e a lista é a dos erros nomeados em
 * `src/repos/boleto.ts` e `src/sicoob/porta.ts`. Uma resposta do banco que não
 * está aqui continua aparecendo com as palavras do banco — o mesmo princípio
 * escrito em `emissao-travada.ts`: inventar tradução para uma recusa que não se
 * conhece é pior que mostrar a original.
 *
 * O CÓDIGO CHEGA DE DOIS JEITOS: como `nome` do erro da API, na hora do pedido
 * (`ErroDaApi.nome`), e como o começo do texto gravado em `ultimo_erro`
 * («PagadorSemEndereco: …»). Os dois caem no mesmo tipo.
 */
export type TipoDeRecusa = 'endereco' | 'documento' | 'valor_zero' | 'sem_conexao' | 'nao_emitida';

const CODIGO_DA_RECUSA: Readonly<Record<string, TipoDeRecusa>> = {
  PagadorSemEndereco: 'endereco',
  PagadorSemDocumento: 'documento',
  FaturaSemValorParaBoleto: 'valor_zero',
  CobrancaNaoHabilitada: 'sem_conexao',
  CobrancaNaoConfigurada: 'sem_conexao',
  FaturaSemBoleto: 'nao_emitida',
};

/** O tipo da recusa, pelo nome do erro ou pelo texto gravado; `null` quando o
 *  código não é conhecido. */
export function tipoDaRecusa(nome?: string | null, texto?: string | null): TipoDeRecusa | null {
  if (nome && CODIGO_DA_RECUSA[nome]) return CODIGO_DA_RECUSA[nome]!;
  if (texto) {
    for (const [codigo, tipo] of Object.entries(CODIGO_DA_RECUSA)) {
      if (new RegExp(`\\b${codigo}\\b`).test(texto)) return tipo;
    }
  }
  return null;
}

export type SaidaDaRecusa = {
  /** O rótulo do botão, e ele é o nome do ato — «Completar o endereço». */
  rotulo: string;
  /** Para onde ele leva, já com a unidade: a pessoa chega na linha certa. */
  destino: string;
};

export type RecusaLida = {
  tipo: TipoDeRecusa;
  /** O que falta, dito numa frase curta. É o que a linha mostra. */
  frase: string;
  /** O que fazer, em uma frase. */
  oQueFazer: string;
  /** O ato que resolve, quando existe uma tela para ele. */
  saida: SaidaDaRecusa | null;
  /** O texto cru que a gerou — mora atrás do «ver detalhe técnico». */
  original: string | null;
  /** `true` quando ninguém pediu nada ainda: o cadastro já diz que vai recusar. */
  prevista: boolean;
};

const NOMES_DO_ENDERECO: Readonly<Record<string, string>> = {
  logradouro: 'logradouro', bairro: 'bairro', municipio: 'município', cep: 'CEP', uf: 'UF',
};

/** «bairro e CEP» — a lista em português, para a frase dizer O QUE falta. */
function listaEmPortugues(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * A recusa lida, com a frase, o que fazer e a saída.
 *
 * `numeroUc` e `mes` montam o destino de «Completar o endereço»: a tela de
 * Unidades abre JÁ na linha dessa unidade, com o endereço aberto, e oferece a
 * volta para este mês. Sem a unidade, a saída ainda existe, mas cai na lista
 * filtrada pelas que não emitem.
 */
export function lerRecusa(p: {
  nome?: string | null;
  texto?: string | null;
  numeroUc?: string | null;
  mes?: string | null;
  faltam?: readonly string[];
  prevista?: boolean;
}): RecusaLida | null {
  const tipo = tipoDaRecusa(p.nome, p.texto);
  if (!tipo) return null;
  const original = p.texto?.trim() || p.nome || null;
  const prevista = p.prevista ?? false;
  switch (tipo) {
    case 'endereco': {
      const falta = (p.faltam ?? []).map((c) => NOMES_DO_ENDERECO[c] ?? c);
      return {
        tipo, original, prevista,
        /* O QUE FALTA SÓ É LISTADO QUANDO É PARTE: com os cinco vazios, a lista
           repetiria a frase de baixo, que já nomeia os cinco. */
        frase: falta.length > 0 && falta.length < 5
          ? `Falta o endereço do pagador (${listaEmPortugues(falta)}).`
          : 'Falta o endereço do pagador.',
        oQueFazer: 'O banco só registra o boleto com logradouro, bairro, município, CEP e UF. '
          + 'Complete na unidade e peça o boleto de novo.',
        saida: { rotulo: 'Completar o endereço', destino: destinoDoEndereco(p.numeroUc ?? null, p.mes ?? null) },
      };
    }
    case 'documento':
      return {
        tipo, original, prevista,
        frase: 'Falta o CPF ou CNPJ do cliente.',
        oQueFazer: 'Sem ele o banco não registra o boleto. Complete em Clientes e peça o boleto de novo.',
        saida: { rotulo: 'Completar o documento', destino: '/clientes?pendencia=sem_documento' },
      };
    case 'valor_zero':
      return {
        tipo, original, prevista,
        frase: 'A cobrança fecha em R$ 0,00.',
        oQueFazer: 'O banco não registra boleto de valor zero — em geral a compensação cobriu a conta '
          + 'inteira. Se ela não devia fechar em zero, confira a conta lida em Contas de luz.',
        saida: null,
      };
    case 'sem_conexao':
      return {
        tipo, original, prevista,
        frase: 'A conexão com o banco não está configurada.',
        oQueFazer: 'Sem ela nenhum boleto sai por aqui. Dá para emitir o boleto no site do banco e '
          + 'importar a linha digitável, abaixo, ou cobrar pelo Pix.',
        saida: { rotulo: 'Abrir Conector Sicoob', destino: '/cobranca' },
      };
    case 'nao_emitida':
      return {
        tipo, original, prevista,
        frase: 'Só cobrança emitida ganha boleto.',
        oQueFazer: 'Emita a cobrança primeiro; o boleto vem depois.',
        saida: null,
      };
  }
}

/**
 * A RECUSA QUE O CADASTRO JÁ ANUNCIA — o endereço, que é da unidade e que a
 * tela já tem na mão (`/unidades-consumidoras`).
 *
 * É a mesma pergunta que o servidor faz antes de chamar o banco
 * (`faltamNoEndereco`), então «prevista» aqui não é palpite: é a resposta que o
 * pedido traria. O documento do cliente NÃO é previsto — ele mora em outra
 * leitura, e a recusa dele chega nomeada na hora do pedido, com a mesma saída.
 */
export function recusaPrevista(
  uc: (EnderecoDaUc & { numero_uc: string }) | null | undefined,
  mes: string | null,
): RecusaLida | null {
  if (!uc) return null;
  const faltam = faltamParaOBoleto(uc);
  if (faltam.length === 0) return null;
  return lerRecusa({ nome: 'PagadorSemEndereco', numeroUc: uc.numero_uc, mes, faltam, prevista: true });
}

/**
 * A RECUSA QUE VALE AGORA para uma linha, na ordem de quem sabe mais:
 *
 *   1. a que voltou NESTA sessão, no pedido que alguém acabou de fazer;
 *   2. a que o banco gravou (`ultimo_erro`), quando o código é conhecido;
 *   3. a que o cadastro anuncia.
 *
 * E A RECUSA SUPERADA SOME: um `ultimo_erro` de endereço sobre uma unidade cujo
 * endereço JÁ foi completado não é mais motivo — é história. Mostrá-lo com
 * «Completar o endereço» mandaria a pessoa completar o que já está completo. Aí
 * a linha volta a oferecer «Pedir o boleto», e a última recusa continua
 * legível no painel da linha.
 */
export function recusaDaLinha(p: {
  daSessao?: { nome?: string | null; texto?: string | null } | null;
  ultimoErro?: string | null;
  uc?: (EnderecoDaUc & { numero_uc: string }) | null;
  mes: string | null;
}): RecusaLida | null {
  const numeroUc = p.uc?.numero_uc ?? null;
  const faltam = p.uc ? faltamParaOBoleto(p.uc) : [];
  const superada = (r: RecusaLida | null) =>
    r !== null && r.tipo === 'endereco' && p.uc != null && faltam.length === 0;

  for (const fonte of [p.daSessao ?? null, p.ultimoErro ? { texto: p.ultimoErro } : null]) {
    if (!fonte) continue;
    const r = lerRecusa({ ...fonte, numeroUc, mes: p.mes, faltam });
    if (r && !superada(r)) return r;
    if (r) return null;
  }
  return recusaPrevista(p.uc, p.mes);
}

/* ==========================================================================
 * 3. A AÇÃO DE CADA LINHA — uma, e só uma
 * ==========================================================================
 *
 * A linha diz o próximo passo DELA. Botões demais por linha foi o defeito
 * medido: «Boleto e baixa» e «Cancelar» com o mesmo peso em dezessete linhas, e
 * o «Emitir» dos rascunhos perdido entre eles.
 */
export type AcaoDaLinha =
  | { tipo: 'emitir' }
  | { tipo: 'pedir_boleto' }
  /** A recusa tem saída: o botão é o da saída («Completar o endereço»). */
  | { tipo: 'resolver'; recusa: RecusaLida }
  /** O banco recusou uma vez e o sistema já está tentando de novo sozinho. */
  | { tipo: 'esperar' }
  | { tipo: 'nenhuma' };

/** Os níveis de `/emissao/travada` em que pedir o boleto AGORA faz sentido.
 *  `esperando` fica de fora: a fila já está tentando, e clicar em cima dela só
 *  gasta uma tentativa. `parado` também: o servidor não aceita mais. */
const NIVEIS_PEDIVEIS: readonly NivelDaEmissao[] = ['nao_pedido', 'esquecido', 'insistindo'];

export function acaoDaLinha(
  status: StatusDaCobranca,
  travada: { nivel: NivelDaEmissao } | null | undefined,
  recusa: RecusaLida | null,
): AcaoDaLinha {
  if (status === 'rascunho') return { tipo: 'emitir' };
  /* SÓ EMITIDA GANHA BOLETO (`podeGerarBoleto`): a vencida sem boleto está na
     lista, e o que se faz com ela não é pedir boleto nem completar o endereço
     para um boleto que o servidor não vai registrar — é o painel da linha. */
  if (!travada || status !== 'emitida') return { tipo: 'nenhuma' };
  /* A RECUSA VEM ANTES DO NÍVEL: um boleto recusado por endereço e marcado
     `esperando` vai ser recusado de novo na próxima tentativa, e na seguinte. A
     espera não resolve — o endereço resolve. */
  if (recusa) return recusa.saida ? { tipo: 'resolver', recusa } : { tipo: 'nenhuma' };
  if (travada.nivel === 'esperando') return { tipo: 'esperar' };
  return NIVEIS_PEDIVEIS.includes(travada.nivel) ? { tipo: 'pedir_boleto' } : { tipo: 'nenhuma' };
}

/**
 * A SEGUNDA LINHA DA SITUAÇÃO — o porquê curto, embaixo do selo. `null` quando o
 * selo já diz tudo («Paga», «Emitida» com boleto no banco).
 */
export function notaDaSituacao(
  status: StatusDaCobranca,
  travada: { nivel: NivelDaEmissao } | null | undefined,
  recusa: RecusaLida | null,
): { texto: string; alerta: boolean } | null {
  if (!travada || (status !== 'emitida' && status !== 'vencida')) return null;
  if (recusa && status === 'emitida') return { texto: recusa.frase, alerta: true };
  switch (travada.nivel) {
    case 'nao_pedido': return { texto: 'Boleto ainda não pedido.', alerta: false };
    case 'esquecido': return { texto: 'Boleto não pedido há mais de um dia.', alerta: true };
    case 'esperando': return { texto: 'O banco recusou; o sistema tenta de novo sozinho.', alerta: false };
    case 'insistindo': return { texto: 'O banco vem recusando o boleto.', alerta: true };
    case 'parado': return { texto: 'Sem boleto, e o sistema parou de tentar.', alerta: true };
  }
}

/* ==========================================================================
 * 4. OS ATOS EM SÉRIE — «Emitir N» e «Pedir os N boletos»
 * ==========================================================================
 *
 * UM DE CADA VEZ, e o motivo é o mesmo do «Gerar N cobranças» da Fatura
 * unificada: cada pedido prende uma conexão do pool transacional pelo bloco
 * inteiro, e o registro do boleto conversa com o banco dentro dele. Em série, a
 * linha que está sendo feita é a que se vê mudar.
 */
export type EstadoDaVez =
  | { estado: 'na_vez' }
  | { estado: 'andando' }
  | { estado: 'feita' }
  | { estado: 'recusada'; motivo: string; recusa: RecusaLida | null };

export type PlacarDaSerie = { total: number; feitas: number; recusadas: number; faltam: number };

export function placarDaSerie(r: Readonly<Record<string, EstadoDaVez>>): PlacarDaSerie {
  const e = Object.values(r);
  const feitas = e.filter((x) => x.estado === 'feita').length;
  const recusadas = e.filter((x) => x.estado === 'recusada').length;
  return { total: e.length, feitas, recusadas, faltam: e.length - feitas - recusadas };
}

/**
 * O QUE «Pedir os N boletos» LEVA, e o que fica de fora dizendo por quê.
 *
 * Leva a emitida que está em `/emissao/travada` num nível em que pedir faz
 * sentido e cuja recusa a tela NÃO conhece. A que tem recusa conhecida fica de
 * fora, nomeada, com a saída dela — pedir de novo daria a mesma resposta.
 */
export function paraPedirBoleto<T extends { id: string; status: StatusDaCobranca }>(
  lista: readonly T[],
  travadaDe: (id: string) => { nivel: NivelDaEmissao } | undefined,
  recusaDe: (f: T) => RecusaLida | null,
): { pedir: T[]; deFora: Array<{ f: T; recusa: RecusaLida }> } {
  const pedir: T[] = [];
  const deFora: Array<{ f: T; recusa: RecusaLida }> = [];
  for (const f of lista) {
    const t = travadaDe(f.id);
    if (f.status !== 'emitida' || !t || !NIVEIS_PEDIVEIS.includes(t.nivel)) continue;
    const r = recusaDe(f);
    if (r) deFora.push({ f, recusa: r });
    else pedir.push(f);
  }
  return { pedir, deFora };
}

/** «1 boleto» / «6 boletos». O número é a promessa do botão. */
export const boletos = (n: number): string => `${n} ${n === 1 ? 'boleto' : 'boletos'}`;

/* ==========================================================================
 * 5. O MÊS EM QUE A TELA ABRE
 * ==========================================================================
 *
 * A ORDEM DE QUEM MANDA:
 *
 *   1. o endereço (`?mes=2026-08`) — é o que «Ver na emissão», em Contas a
 *      receber, usa para abrir no mês da fatura;
 *   2. o mês MAIS RECENTE COM TRABALHO: rascunho a emitir ou emitida sem boleto.
 *      A cobrança nasce na competência da conta, e o mês de hoje costuma estar
 *      vazio justamente quando há trabalho no anterior;
 *   3. o último mês que a pessoa escolheu aqui (lembrado no navegador);
 *   4. o mês mais recente que tem cobrança;
 *   5. o mês de hoje, que era a única regra até 30/09.
 *
 * O TRABALHO SE DESCOBRE COM O QUE A API JÁ DÁ, sem rota nova (regra 3 da
 * etapa). `/emissao/travada` diz com certeza quais meses têm emitida sem boleto.
 * O rascunho não tem contagem própria: a `posicao_da_carteira` conta `faturas`,
 * `emitidas` (status `emitida`) e `liquidadas`, e o que sobra — nem emitida nem
 * paga — é rascunho, vencida ou negociada. Esse mês é CANDIDATO, e a tela
 * confere lendo o próprio mês antes de abrir nele.
 */
export type OrigemDoMes = 'endereco' | 'trabalho' | 'lembrado' | 'recente' | 'hoje' | 'escolhido';

export type CandidatoDoMes = {
  mes: string;
  /** `true`: há emitida sem boleto (certeza de `/emissao/travada`). `false`: há
   *  cobrança nem emitida nem paga, e só lendo o mês se sabe se é rascunho. */
  certo: boolean;
};

const mesDe = (competencia: string): string => String(competencia ?? '').slice(0, 7);
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Os meses com trabalho possível, do mais recente para o mais antigo. */
export function candidatosDoMes(
  carteira: ReadonlyArray<{ competencia: string; faturas: number; emitidas: number; liquidadas: number }>,
  travadas: ReadonlyArray<{ competencia: string }>,
): CandidatoDoMes[] {
  const certos = new Set(travadas.map((l) => mesDe(l.competencia)).filter((m) => MES_VALIDO.test(m)));
  const possiveis = new Set(carteira
    .filter((p) => p.faturas > p.emitidas + p.liquidadas)
    .map((p) => mesDe(p.competencia))
    .filter((m) => MES_VALIDO.test(m)));
  return [...new Set([...certos, ...possiveis])]
    .sort().reverse()
    .map((mes) => ({ mes, certo: certos.has(mes) }));
}

/** Quantos meses candidatos a tela confere lendo, no máximo. Cada um é um pedido
 *  em série antes de a tabela aparecer; três cobrem o mês corrente e os dois
 *  anteriores, que é onde a conta da distribuidora mora. */
export const MESES_A_CONFERIR = 3;

/** Sem trabalho em mês nenhum: o lembrado, senão o mais recente com cobrança,
 *  senão o de hoje. */
export function mesSemTrabalho(
  lembrado: string | null,
  carteira: ReadonlyArray<{ competencia: string; faturas: number }>,
  hoje: string,
): { mes: string; origem: OrigemDoMes } {
  if (lembrado && MES_VALIDO.test(lembrado)) return { mes: lembrado, origem: 'lembrado' };
  const recente = carteira.filter((p) => p.faturas > 0).map((p) => mesDe(p.competencia))
    .filter((m) => MES_VALIDO.test(m)).sort().reverse()[0];
  if (recente) return { mes: recente, origem: 'recente' };
  return { mes: hoje, origem: 'hoje' };
}

/** A FRASE AO LADO DO SELETOR, dizendo por que a tela está neste mês. Sem ela,
 *  abrir em agosto com setembro no calendário parece defeito. */
export function fraseDaOrigem(origem: OrigemDoMes): string {
  switch (origem) {
    case 'endereco': return 'Aberto no mês pedido pelo link.';
    /* UMA FRASE SÓ para os dois motivos: o mês que tem emitida sem boleto
       quase sempre tem rascunho também, e dizer só um dos dois soaria como se
       o outro não estivesse lá. */
    case 'trabalho': return 'Aberto no mês mais recente com trabalho: cobrança por emitir ou sem boleto no banco.';
    case 'lembrado': return 'Nenhum mês tem cobrança por emitir. Aberto no último mês que você escolheu.';
    case 'recente': return 'Nenhum mês tem cobrança por emitir. Aberto no mês mais recente com cobranças.';
    case 'hoje': return 'Nenhum mês tem cobrança ainda. Aberto no mês corrente.';
    case 'escolhido': return '';
  }
}

/** A chave do mês lembrado. Uma por navegador: é conveniência de quem opera,
 *  não dado do sistema — outra pessoa, noutra máquina, abre no trabalho dela. */
export const CHAVE_DO_MES_LEMBRADO = 'financeiro.emissao.mes';

/**
 * LER E GUARDAR NUNCA DERRUBAM A TELA. `localStorage` levanta em janela privada
 * de alguns navegadores e com o armazenamento bloqueado; aí a tela só não
 * lembra. O armazém vem por parâmetro para a suíte poder passar um falso.
 */
export function lerMesLembrado(armazem: Pick<Storage, 'getItem'> | null | undefined): string | null {
  try {
    const v = armazem?.getItem(CHAVE_DO_MES_LEMBRADO) ?? null;
    return v && MES_VALIDO.test(v) ? v : null;
  } catch { return null; }
}

export function lembrarMes(armazem: Pick<Storage, 'setItem'> | null | undefined, mes: string): void {
  if (!MES_VALIDO.test(mes)) return;
  try { armazem?.setItem(CHAVE_DO_MES_LEMBRADO, mes); } catch { /* sem armazenamento, sem lembrança */ }
}
