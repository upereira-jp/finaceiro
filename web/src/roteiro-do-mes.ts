// O MÊS EM CINCO PASSOS — quantas unidades estão em cada um, onde está o risco
// e como se faz cada passo.
//
// ============================================================================
// POR QUE ELE EXISTE, e a pergunta que nenhuma tela respondia
//
// O sistema tem catorze telas e um relatório de treze conferências. Todas elas
// respondem **«o que está faltando»**. Nenhuma respondia **«o que eu faço
// agora, e como»** — que é a pergunta de quem abre o sistema para trabalhar.
//
// A distância entre as duas não é de estilo. Medida em 10/09/2026, o caminho
// real de um mês atravessa DUAS telas, em seis atos:
//
//   «Contas de luz»   enviar as contas · «Conferir» · «Registrar» ·
//                     «conferir antes» · «Gerar N cobranças»
//   «Cobranças»       «Emitir N cobranças» · «Pedir os N boletos»
//
// ============================================================================
// DE FILA PARA FUNIL (30/09/2026, etapa 3 do redesenho)
//
// ATÉ ESTA DATA O ROTEIRO ERA UMA FILA: um passo «agora», os de baixo apagados, e
// um passo travado por cadastro consumia o «agora». A crítica de 30/09 (P1 nº 3)
// mediu o custo disso num mês de verdade: com 15 cobranças emitidas e 4 pagas, a
// caixa dizia «você está no 1 de 5» — porque 15 contas ainda não tinham sido
// lidas — e a faixa vermelha logo acima mandava agir no passo 4. Duas respostas
// para «o que eu faço agora», e a caixa que existia para dar UMA era a errada.
//
// O mês não é uma fila, é um FUNIL: cada unidade anda sozinha, e num dia
// qualquer há unidades em todos os passos ao mesmo tempo. Então cada passo diz
// QUANTAS unidades estão nele agora, e o destaque vai para o passo que tem
// RISCO — a recusa do banco, a cobrança vencida, o boleto que ninguém pediu —, e
// não para o primeiro da lista.
//
// ============================================================================
// AS QUATRO REGRAS QUE GOVERNAM ESTE ARQUIVO
//
//   1. **Um passo em destaque, e só um.** A lista inteira aparece com os
//      números, mas exatamente um carrega o «comece aqui». A escolha tem ordem
//      escrita (`escolherOFoco`): risco primeiro; sem risco, o passo com
//      trabalho mais perto do dinheiro — terminar o que já começou antes de
//      abrir mais;
//
//   2. **Nada é afirmado sem medida.** Cada número vem de uma leitura que o
//      servidor já faz. Sem a leitura, o passo diz «não medido» — nunca zero e
//      nunca «feito». É a mesma disciplina do `nao_medido` da prontidão;
//
//   3. **Cadastro não é passo.** A pendência de cadastro não consome mais o
//      destaque: ela vira uma linha própria, com o link de onde se resolve. O
//      contrato que falta não é «o trabalho de agora» de quem tem cinco boletos
//      recusados;
//
//   4. **O «como» nomeia botões e abas que existem.** Cada linha do `comoFazer`
//      foi escrita lendo a tela de destino, e a suíte prende que todo destino é
//      rota da barra e que o nome no botão é, letra por letra, o rótulo da aba.
//
// O MAPA DE DESTINO NÃO É REESCRITO AQUI. Quando o cadastro trava parte do mês,
// quem diz onde se resolve é `destino-da-camada.ts`, e quem diz a frase em
// português de quem opera é `VERBETE_DA_CAMADA`, de `vocabulario.ts`.

import { DESTINO_DA_CAMADA, enderecoDoDestino } from './destino-da-camada.ts';
import { VERBETE_DA_CAMADA } from './vocabulario.ts';
import { tipoDaRecusa } from './emissao-regras.ts';
import { funilDoCaminho } from './navegacao.ts';

/** O mínimo que este módulo lê de uma linha do relatório. Estrutural de
 *  propósito: o tipo `Camada` de `api.ts` satisfaz isto sem que este arquivo
 *  precise importar o cliente de rede. */
export type CamadaDoRoteiro = {
  camada: string;
  situacao: 'ok' | 'pendente' | 'nao_medido';
  faltam: number;
  total: number;
  efeito: 'bloqueia_fatura' | 'bloqueia_boleto' | 'bloqueia_split';
};

/** A linha da carteira para a competência aberta — `GET /carteira?competencia=`.
 *  Daqui só sai `vencidas_em_aberto`: é o único número do mês que depende do
 *  relógio, e o relógio que vale é o do SERVIDOR (`current_date` na view), não o
 *  da máquina de quem abriu a tela. */
export type PosicaoDoMes = { vencidas_em_aberto: number } | null;

/** Uma cobrança do mês — `GET /faturamento/:competencia`. Só o status importa. */
export type CobrancaDoMes = { status: string };

/** Uma conta registrada — `GET /faturas/unificada/registros`. */
export type ContaRegistrada = { competencia: string; fatura_id: string | null; cobranca_disponivel: boolean };

/** Uma cobrança emitida sem boleto — uma linha de `GET /emissao/travada`. */
export type LinhaSemBoleto = {
  competencia: string;
  pede_gente: boolean;
  boleto: { ultimo_erro: string | null } | null;
};

/**
 * TUDO O QUE O FUNIL LÊ, e cada campo é uma leitura que a tela de Mês JÁ fazia
 * ou que a tela de destino faz — nenhuma rota nova no servidor. `null` em
 * qualquer um é «ainda não chegou» ou «falhou», e os dois viram «não medido» no
 * passo que dependia dele.
 */
export type LeituraDoMes = {
  /** `'AAAA-MM'`, o mês do seletor. As duas listas que atravessam meses
   *  (contas registradas e cobranças sem boleto) são recortadas por ele. */
  mes: string;
  /** `GET /faturamento/:competencia/prontidao` — a conta lida e o cadastro. */
  camadas: readonly CamadaDoRoteiro[];
  posicao: PosicaoDoMes;
  /** `GET /faturamento/:competencia` — a mesma lista da tela Cobranças. */
  cobrancas: readonly CobrancaDoMes[] | null;
  /** `GET /faturas/unificada/registros?limite=500` — a mesma da tela Contas de
   *  luz. `parcial`: a lista bateu no teto, e o mês mais velho dela pode estar
   *  pela metade. */
  registradas: { lista: readonly ContaRegistrada[]; parcial: boolean } | null;
  /** `GET /emissao/travada` — a carteira INTEIRA, não só o mês: `total` é o
   *  número do banco e `linhas` vem com teto. */
  semBoleto: { linhas: readonly LinhaSemBoleto[]; total: number } | null;
};

export type ChaveDoPasso = 'ler' | 'gerar' | 'emitir' | 'cobrar' | 'receber';

export type Destino = { rotulo: string; endereco: string };

/** O que faz um passo pesar mais que os outros agora. */
export type RiscoDoPasso = {
  /** Quantas unidades carregam o risco. */
  quantos: number;
  /** «1 recusada pelo banco», «2 vencidas sem pagamento». */
  frase: string;
  /** A ordem entre riscos: maior vem primeiro. Ver `escolherOFoco`. */
  peso: number;
};

/** Uma pendência de cadastro que trava parte do mês, já em português e com o
 *  caminho. Vem inteira dos dois mapas que já existem. */
export type TravaDoPasso = {
  camada: string;
  titulo: string;
  frase: string;
  faltam: number;
  /** O substantivo do `faltam` — «clientes», «unidades». */
  contagem: string;
  efeito: CamadaDoRoteiro['efeito'];
  /** `null` quando aquela pendência não tem tela — e o mapa diz isso. */
  endereco: string | null;
  /** O ato, como a tela de Mês já o escreve na coluna «Onde resolver». */
  rotuloDoDestino: string | null;
};

export type PassoDoMes = {
  chave: ChaveDoPasso;
  /** 1..5, e é o número que a tela imprime. */
  numero: number;
  titulo: string;
  /** Quantas unidades estão neste passo AGORA. `null`: não medido. */
  quantos: number | null;
  /** O rótulo curto do número, concordando com ele: «contas a ler». */
  rotulo: string;
  /** O nome do número numa frase corrida: «cobranças a gerar». */
  nome: string;
  /** Uma linha de contexto: «de 41 unidades», «e 2 de outros meses». */
  contexto: string | null;
  risco: RiscoDoPasso | null;
  /** O passo que a tela abre, e o único. */
  foco: boolean;
  /** Uma frase. O que este passo É, para quem nunca o fez. */
  oQueFazer: string;
  /** O passo a passo, numerado. */
  comoFazer: readonly string[];
  /** Para onde o botão leva. Com risco, pode ser outra tela — a do risco. */
  destino: Destino;
  /** O passo que o sistema faz sozinho. Só ganha o destaque com risco: sem
   *  ele não há o que clicar, e pôr alguém a esperar seria mandá-lo olhar. */
  automatico: boolean;
};

/* ==========================================================================
 * O TEXTO, separado do cálculo
 * ==========================================================================
 * Ele fica numa constante e não dentro da função porque é o que mais vai ser
 * revisto — e revisar texto não pode obrigar a reler a máquina de contagem.
 */

type Molde = {
  chave: ChaveDoPasso;
  titulo: string;
  /** O número, no rótulo curto e na frase — singular e plural. */
  rotulo: readonly [string, string];
  nome: readonly [string, string];
  oQueFazer: string;
  comoFazer: readonly string[];
  /** A tela onde o passo acontece — e a que a faixa da tela reconhece. */
  destino: Destino;
  /** A tela do RISCO, quando não é a mesma: a vencida se acompanha em Contas a
   *  receber, e não em Contas a pagar, onde o mês termina. */
  destinoDoRisco?: Destino;
  automatico?: boolean;
};

/* OS RÓTULOS SÃO OS DA BARRA, letra por letra (`RM13`). Mudaram em 30/09/2026:
 * «Fatura unificada» virou «Contas de luz» e «Emissão e cobrança» virou
 * «Cobranças» — o nome da aba passou a anunciar o passo do mês. «Fatura
 * unificada» continua sendo o nome da FOLHA que o cliente recebe. */
const CONTAS_DE_LUZ: Destino = { rotulo: 'Contas de luz', endereco: '/documento' };
const COBRANCAS: Destino = { rotulo: 'Cobranças', endereco: '/faturas' };
const A_RECEBER: Destino = { rotulo: 'Contas a receber', endereco: '/contas-a-receber' };
const A_PAGAR: Destino = { rotulo: 'Contas a pagar', endereco: '/contas-a-pagar' };

export const MOLDES: readonly Molde[] = [
  {
    chave: 'ler',
    titulo: 'Ler as contas de luz do mês',
    rotulo: ['conta a ler', 'contas a ler'],
    nome: ['conta de luz a ler', 'contas de luz a ler'],
    oQueFazer:
      'Trazer para o sistema a conta que a distribuidora emitiu neste mês para cada unidade. '
      + 'Tudo o que vem depois sai dos números dela.',
    comoFazer: [
      'Baixe do portal da distribuidora as contas do mês — uma por unidade.',
      'Abra «Contas de luz» e envie TODAS de uma vez na aba «1 · Leitura e cálculo». '
      + 'Não precisa ser uma por vez: o sistema lê em fila.',
      'Cada conta lida vira uma linha da fila. A que estiver com pendência aparece no topo, com o '
      + 'motivo — clique «Conferir», corrija o campo na gaveta que abre, e a linha se resolve.',
      'Com as linhas conferidas, clique «Registrar N contas conferidas» (ou «Registrar» numa linha '
      + 'só). Elas passam para a lista «Contas registradas», logo abaixo.',
    ],
    destino: CONTAS_DE_LUZ,
  },
  {
    chave: 'gerar',
    titulo: 'Gerar as cobranças',
    rotulo: ['a gerar', 'a gerar'],
    nome: ['cobrança a gerar', 'cobranças a gerar'],
    oQueFazer:
      'Transformar cada conta registrada na cobrança que a G3 vai fazer. Ela nasce como rascunho — '
      + 'nada é enviado ao cliente neste passo.',
    comoFazer: [
      'Continue em «Contas de luz», na lista «Contas registradas».',
      'Clique «conferir antes» na linha. Ele diz, sem gravar nada, se falta alguma coisa para '
      + 'aquela conta virar cobrança.',
      /* [30/09] UMA REVISAO NO LUGAR DE UM `confirm` POR LINHA: o botao age
       * sobre as marcadas (todas vem marcadas) e mostra a lista e a soma antes
       * de gravar. */
      'Clique «Gerar N cobranças»: as contas sem cobrança do mês vêm marcadas, e um resumo mostra '
      + 'unidade, cliente e valor antes de gravar. Confirme em «Sim, gerar as N». Cada linha passa '
      + 'a dizer «Cobrança gerada» — ou o motivo da recusa.',
      /* A LINHA QUE MANDAVA EVITAR A ABA «Faturamento» SAIU EM 10/09/2026, com a
       * aba. Um aviso sobre uma porta que não existe mais é uma porta que a
       * pessoa vai procurar. `RM14` prende que ela não volte. */
    ],
    destino: CONTAS_DE_LUZ,
  },
  {
    chave: 'emitir',
    titulo: 'Emitir as cobranças',
    rotulo: ['a emitir', 'a emitir'],
    nome: ['cobrança a emitir', 'cobranças a emitir'],
    oQueFazer:
      'Fechar o valor dos rascunhos. Depois de emitida, a cobrança vale e o valor dela não muda '
      + 'mais sozinho.',
    comoFazer: [
      'Abra «Cobranças». Ela abre no mês mais recente com cobrança por emitir, e os rascunhos vêm '
      + 'no topo da lista.',
      'Clique «Emitir N cobranças». Um resumo mostra unidade, cliente, vencimento e valor de cada '
      + 'uma, e a soma; tire da lista o que ainda não deve sair e confirme em «Sim, emitir as N».',
      'Para emitir uma só, use «Emitir» na linha dela.',
    ],
    destino: COBRANCAS,
  },
  {
    chave: 'cobrar',
    titulo: 'Pedir o boleto e entregar ao cliente',
    rotulo: ['sem boleto', 'sem boleto'],
    nome: ['cobrança sem boleto', 'cobranças sem boleto'],
    oQueFazer:
      'Pedir ao banco o boleto de cada cobrança emitida e entregar ao cliente a folha com o boleto '
      + 'e o Pix. É o passo em que o cliente finalmente recebe algo.',
    comoFazer: [
      'Em «Cobranças», clique «Pedir os N boletos»: os pedidos vão um de cada vez, e cada linha diz '
      + 'se o boleto foi registrado ou por que o banco recusou. Para um só, «Pedir o boleto» na '
      + 'linha dele.',
      'O motivo mais comum de recusa é faltar o endereço do pagador. A linha mostra «Completar o '
      + 'endereço», que abre Unidades consumidoras já na unidade certa — e o endereço costuma vir '
      + 'na conta que você já leu. Grave e peça o boleto de novo.',
      'Boleto pedido que não registrou volta sozinho na fila, a cada 5 minutos. Não adianta ficar '
      + 'clicando: a lista mostra quantas tentativas já houve.',
      'A folha do cliente — a Fatura unificada — se imprime em «Contas de luz», na aba «2 · Folha '
      + 'do cliente», e a «2ª via» de qualquer mês já registrado sai pelo botão de mesmo nome.',
    ],
    destino: COBRANCAS,
  },
  {
    chave: 'receber',
    titulo: 'Receber e repartir',
    rotulo: ['a receber', 'a receber'],
    nome: ['cobrança a receber', 'cobranças a receber'],
    oQueFazer:
      'O pagamento entra sozinho: o banco avisa na hora e o sistema ainda confere todo dia de '
      + 'manhã. Quando o dinheiro entra, o repasse ao dono da usina e a comissão nascem em '
      + '«Contas a pagar» — é lá que o mês termina.',
    comoFazer: [
      'Não há nada a clicar enquanto o cliente não paga.',
      'A cobrança vencida e ainda não paga aparece em «Contas a receber», por atraso e por '
      + 'cliente — é a lista de quem procurar.',
      'Se um cliente disser que pagou e a linha não baixar, confira em «Cobranças» — dá para dar '
      + 'baixa à mão, e o histórico registra quem deu.',
      'O que a G3 passou a dever por causa do pagamento — a parte do dono da usina e a comissão — '
      + 'aparece em «Contas a pagar».',
    ],
    destino: A_PAGAR,
    destinoDoRisco: A_RECEBER,
    automatico: true,
  },
];

/* ==========================================================================
 * A CONTAGEM
 * ========================================================================== */

/** A camada que mede o passo 1 — e ela também define o UNIVERSO do mês: quantas
 *  unidades esperam cobrança. */
const CAMADA_DA_CONTA = 'conta_lida_da_competencia';

/** O teto de `GET /faturamento/:competencia` sem `limite` — o mesmo da tela
 *  Cobranças. Lista que chega com este tamanho pode estar cortada. */
export const TETO_DAS_COBRANCAS = 500;

const plural = (n: number, formas: readonly [string, string]) => (n === 1 ? formas[0] : formas[1]);
const mesDe = (competencia: string | null | undefined): string => String(competencia ?? '').slice(0, 7);

/** Ainda viva: emitida e não paga. `negociada` anda com a emitida — é
 *  cobrança viva, com outro combinado. */
const VIVAS = new Set(['emitida', 'vencida', 'negociada']);

/**
 * O RISCO DO PASSO 4, e é o mais pesado do mês: cliente sem nada para pagar, e
 * que não se resolve sozinho. Conta a linha que o servidor já marca como
 * `pede_gente` (esquecida, insistindo, parada) e a que traz uma recusa do banco
 * que a tela sabe ler — a de endereço volta recusada até alguém completar o
 * cadastro, esteja ou não há mais de um dia.
 */
function pedeVoce(l: LinhaSemBoleto): boolean {
  return l.pede_gente || tipoDaRecusa(null, l.boleto?.ultimo_erro ?? null) !== null;
}
const recusada = (l: LinhaSemBoleto): boolean => tipoDaRecusa(null, l.boleto?.ultimo_erro ?? null) !== null;

type Numeros = {
  quantos: number | null;
  contexto: string | null;
  risco: RiscoDoPasso | null;
};

function contar(l: LeituraDoMes): Record<ChaveDoPasso, Numeros> & { pagas: number | null } {
  const conta = l.camadas.find((c) => c.camada === CAMADA_DA_CONTA) ?? null;
  /* O UNIVERSO DO MÊS. `nao_medido`, ou zero unidades, não vira número: «0 de 0
   * contas a ler» em verde seria o relatório autorizando o que não conferiu. */
  const universo = conta && conta.situacao !== 'nao_medido' && conta.total > 0 ? conta.total : null;
  const lidas = universo !== null && conta ? conta.total - conta.faltam : null;

  /* ------------------------------------------------------ 2 · a gerar
   * A mesma conta que o «Gerar N cobranças» faz na tela Contas de luz: conta do
   * mês sem cobrança, num banco que sabe fazer a ligação. Não medido quando a
   * lista não chegou, quando o banco não tem a ligação (`cobranca_disponivel`
   * falso: `fatura_id` nulo não quer dizer nada) ou quando a lista bateu no teto
   * e este mês é o mais velho dela — que é o que o teto corta. */
  let gerar: number | null = null;
  if (l.registradas) {
    const doMes = l.registradas.lista.filter((r) => mesDe(r.competencia) === l.mes);
    const meses = l.registradas.lista.map((r) => mesDe(r.competencia)).filter(Boolean).sort();
    const cortado = l.registradas.parcial && (meses.length === 0 || l.mes <= meses[0]!);
    const semLigacao = doMes.some((r) => !r.cobranca_disponivel);
    if (!cortado && !semLigacao) gerar = doMes.filter((r) => r.fatura_id == null).length;
  }

  /* ------------------------------------------------------ 3 · a emitir */
  const cobrancas = l.cobrancas && l.cobrancas.length < TETO_DAS_COBRANCAS ? l.cobrancas : null;
  const emitir = cobrancas ? cobrancas.filter((c) => c.status === 'rascunho').length : null;
  const naoCanceladas = cobrancas ? cobrancas.filter((c) => c.status !== 'cancelada').length : null;
  const pagas = cobrancas ? cobrancas.filter((c) => c.status === 'paga').length : null;
  const vivas = cobrancas ? cobrancas.filter((c) => VIVAS.has(c.status)).length : null;

  /* ------------------------------------------------------ 4 · sem boleto
   * `linhas` vem com teto e ordenada pelo vencimento mais antigo: cortada, a
   * parte deste mês pode ser a que ficou de fora. Aí o número do mês é «não
   * medido», e o da carteira inteira — `total`, que é do banco — continua
   * valendo como contexto. */
  const sb = l.semBoleto;
  const inteira = sb !== null && sb.total <= sb.linhas.length;
  const doMes = sb ? sb.linhas.filter((x) => mesDe(x.competencia) === l.mes) : [];
  const deFora = sb ? sb.linhas.filter((x) => mesDe(x.competencia) !== l.mes) : [];
  const cobrar = inteira ? doMes.length : null;
  const foraDoMes = inteira ? deFora.length : null;

  const recusadasNoMes = doMes.filter(recusada).length;
  const pedemNoMes = doMes.filter(pedeVoce).length;
  const pedemFora = deFora.filter(pedeVoce).length;
  let riscoDoBoleto: RiscoDoPasso | null = null;
  if (pedemNoMes + pedemFora > 0) {
    const partes: string[] = [];
    if (recusadasNoMes > 0) {
      partes.push(`${recusadasNoMes} ${recusadasNoMes === 1 ? 'recusada' : 'recusadas'} pelo banco`);
    }
    const paradas = pedemNoMes - recusadasNoMes;
    if (paradas > 0) partes.push(`${paradas} ${paradas === 1 ? 'parada' : 'paradas'} há mais de um dia`);
    if (pedemFora > 0) partes.push(`${pedemFora} de outros meses ${pedemFora === 1 ? 'pede' : 'pedem'} você`);
    riscoDoBoleto = { quantos: pedemNoMes + pedemFora, frase: partes.join(' · '), peso: 3 };
  }

  /* ------------------------------------------------------ 5 · a receber
   * Com boleto, esperando o cliente: as vivas menos as que ainda estão sem
   * boleto neste mês. Sem as duas leituras não há como separar — não medido. */
  const receber = vivas !== null && cobrar !== null ? Math.max(0, vivas - cobrar) : null;
  const vencidas = l.posicao?.vencidas_em_aberto ?? null;

  return {
    ler: {
      quantos: universo !== null && conta ? conta.faltam : null,
      contexto: universo !== null ? `de ${universo} ${universo === 1 ? 'unidade' : 'unidades'}` : null,
      risco: null,
    },
    gerar: {
      quantos: gerar,
      contexto: gerar !== null && lidas !== null && lidas > 0
        ? `de ${lidas} ${lidas === 1 ? 'conta lida' : 'contas lidas'}` : null,
      risco: null,
    },
    emitir: {
      quantos: emitir,
      contexto: emitir !== null && naoCanceladas ? `de ${naoCanceladas} ${naoCanceladas === 1 ? 'cobrança' : 'cobranças'}` : null,
      risco: null,
    },
    cobrar: {
      quantos: cobrar,
      /* O NÚMERO DE FORA DO MÊS SÓ APARECE QUANDO É TRABALHO — e quando é, ele
       * vale a linha mesmo neste: «uma fatura de MAI que nunca virou boleto
       * continua sendo dinheiro parado em SET». Cortada a lista, sobra o total
       * do banco, que é de todos os meses e diz isso. */
      contexto: foraDoMes !== null
        ? (foraDoMes > 0 ? `e ${foraDoMes} de outros meses` : null)
        : sb ? `${sb.total} sem boleto contando todos os meses` : null,
      risco: riscoDoBoleto,
    },
    receber: {
      quantos: receber,
      contexto: pagas !== null && pagas > 0 ? `${pagas} ${pagas === 1 ? 'já paga' : 'já pagas'}` : null,
      risco: vencidas !== null && vencidas > 0
        ? { quantos: vencidas, frase: `${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'} sem pagamento`, peso: 2 }
        : null,
    },
    pagas,
  };
}

/**
 * O PASSO EM DESTAQUE, e a ordem é a decisão.
 *
 *   1. RISCO PRIMEIRO, pelo peso: boleto que pede você (3) antes de cobrança
 *      vencida (2). A recusa do banco não passa sozinha e deixa o cliente sem
 *      nada para pagar; a vencida já tem boleto, e o cliente pode pagar hoje;
 *   2. SEM RISCO, o passo com trabalho MAIS PERTO DO DINHEIRO. Cinco rascunhos
 *      emitidos hoje viram boleto amanhã; quinze contas lidas hoje ainda têm três
 *      passos pela frente. Terminar o que já começou antes de abrir mais é o que
 *      põe dinheiro no caixa primeiro — e é a leitura de quadro de trabalho
 *      (puxar da direita);
 *   3. O passo AUTOMÁTICO só entra pelo risco: sem ele não há o que clicar.
 *
 * `null` quando nenhum passo tem trabalho nem risco — e aí a tela diz isso, que é
 * uma notícia e não um vazio.
 */
export function escolherOFoco(passos: readonly Omit<PassoDoMes, 'foco'>[]): ChaveDoPasso | null {
  const comRisco = passos.filter((p) => p.risco !== null)
    .sort((a, b) => b.risco!.peso - a.risco!.peso || b.numero - a.numero);
  if (comRisco.length > 0) return comRisco[0]!.chave;
  const comTrabalho = passos.filter((p) => !p.automatico && p.quantos !== null && p.quantos > 0)
    .sort((a, b) => b.numero - a.numero);
  return comTrabalho[0]?.chave ?? null;
}

/**
 * AS PENDÊNCIAS DE CADASTRO, já em português e com o caminho.
 *
 * A conta lida fica de fora de propósito: ela é o passo 1, e listá-la como
 * trava diria duas vezes a mesma coisa.
 */
export function travasDe(
  camadas: readonly CamadaDoRoteiro[],
  efeitos: ReadonlyArray<CamadaDoRoteiro['efeito']>,
): TravaDoPasso[] {
  return camadas
    .filter((c) => efeitos.includes(c.efeito) && c.situacao !== 'ok' && c.camada !== CAMADA_DA_CONTA)
    .map((c) => {
      const v = VERBETE_DA_CAMADA[c.camada];
      const d = DESTINO_DA_CAMADA[c.camada];
      return {
        camada: c.camada,
        titulo: v?.titulo ?? c.camada,
        frase: v?.simples ?? '',
        faltam: c.faltam,
        contagem: v ? (c.faltam === 1 ? v.contagem.singular : v.contagem.plural) : '',
        efeito: c.efeito,
        endereco: d ? enderecoDoDestino(d) : null,
        rotuloDoDestino: d?.rotulo ?? null,
      };
    });
}

export type EstadoDoMes =
  /** Há trabalho ou risco em algum passo. */
  | 'andando'
  /** Nada a fazer nos passos, mas o cadastro ainda trava parte do mês. */
  | 'travado'
  /** Falta medida para dizer como o mês está. */
  | 'nao_medido'
  /** Medido, e nada falta fazer: o que resta é o cliente pagar. */
  | 'fechado';

export type MesNoFunil = {
  passos: PassoDoMes[];
  foco: PassoDoMes | null;
  /** O que impede cobrar (a cobrança ou o boleto). */
  travas: TravaDoPasso[];
  /** O que só impede dividir o dinheiro quando ele entrar. */
  travasDoRepasse: TravaDoPasso[];
  pagas: number | null;
  estado: EstadoDoMes;
  /**
   * A FRASE DO ESTADO DO MÊS — uma só, para os três lugares que o narram: o
   * alto da tela Mês, o vazio da tabela de conferências e a Central de Ajuda.
   * Até 30/09/2026 eram três frases diferentes («os cinco passos fecharam»,
   * «Nada falta para este mês», «Nada pendente. Este mês pode ser cobrado») —
   * e a terceira dizia que o mês podia ser cobrado olhando só o cadastro.
   */
  frase: string;
};

/** «15 contas a ler, 6 cobranças a gerar e 3 sem boleto». */
const emLista = (itens: readonly string[]): string =>
  (itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

function fraseDoMes(
  passos: readonly PassoDoMes[], foco: PassoDoMes | null, travas: readonly TravaDoPasso[],
): { estado: EstadoDoMes; frase: string } {
  const comTrabalho = passos.filter((p) => p.risco !== null || (!p.automatico && (p.quantos ?? 0) > 0));
  const naoMedidos = passos.filter((p) => p.quantos === null);
  const semMedida = naoMedidos.length === 0 ? ''
    : ` ${naoMedidos.length === 1 ? 'O passo' : 'Os passos'} ${emLista(naoMedidos.map((p) => String(p.numero)))} `
      + `não ${naoMedidos.length === 1 ? 'foi medido' : 'foram medidos'}.`;

  if (foco && comTrabalho.length > 0) {
    const motivo = foco.risco
      ? foco.risco.frase
      : `${foco.quantos} ${plural(foco.quantos ?? 0, MOLDES.find((m) => m.chave === foco.chave)!.nome)}`;
    const EXTENSO = ['', 'um', 'dois', 'três', 'quatro'];
    const onde = comTrabalho.length >= passos.length ? 'nos cinco passos'
      : `em ${EXTENSO[comTrabalho.length]} dos cinco passos`;
    return {
      estado: 'andando',
      frase: `Falta trabalho ${onde}. Comece pelo ${foco.numero} · ${foco.titulo}: ${motivo}.${semMedida}`,
    };
  }
  if (naoMedidos.length > 0) {
    return { estado: 'nao_medido', frase: `Ainda não dá para dizer como está o mês.${semMedida}` };
  }
  if (travas.length > 0) {
    return {
      estado: 'travado',
      frase: 'Nenhum passo tem trabalho agora, mas o cadastro ainda trava parte do mês.',
    };
  }
  return {
    estado: 'fechado',
    frase: 'Nada falta fazer neste mês: o que resta é o cliente pagar, e isso o sistema acompanha sozinho.',
  };
}

/**
 * O MÊS INTEIRO, com números, destaque, travas e a frase.
 */
export function mesNoFunil(l: LeituraDoMes): MesNoFunil {
  const n = contar(l);

  const semFoco = MOLDES.map((m, i) => {
    const x = n[m.chave];
    return {
      chave: m.chave,
      numero: i + 1,
      titulo: m.titulo,
      quantos: x.quantos,
      rotulo: plural(x.quantos ?? 2, m.rotulo),
      nome: plural(x.quantos ?? 2, m.nome),
      contexto: x.contexto,
      risco: x.risco,
      oQueFazer: m.oQueFazer,
      comoFazer: m.comoFazer,
      destino: x.risco && m.destinoDoRisco ? m.destinoDoRisco : m.destino,
      automatico: m.automatico === true,
    };
  });

  const chaveDoFoco = escolherOFoco(semFoco);
  const passos: PassoDoMes[] = semFoco.map((p) => ({ ...p, foco: p.chave === chaveDoFoco }));
  const foco = passos.find((p) => p.foco) ?? null;
  const travas = travasDe(l.camadas, ['bloqueia_fatura', 'bloqueia_boleto']);
  const travasDoRepasse = travasDe(l.camadas, ['bloqueia_split']);

  return { passos, foco, travas, travasDoRepasse, pagas: n.pagas, ...fraseDoMes(passos, foco, travas) };
}

/* ==========================================================================
 * ONDE ESTOU, dentro da tela de trabalho
 * ==========================================================================
 *
 * O funil mora em Mês. Só que o trabalho não: ele acontece em «Contas de luz»,
 * em «Cobranças» e termina em «Contas a pagar», do outro setor — e quem está lá
 * dentro perdeu o mapa. Foi assim que o caminho aposentado conseguiu parecer o
 * caminho: nenhuma tela dizia o que vinha antes nem depois dela.
 *
 * ⚠️ ESTA LEITURA NÃO É AO VIVO, E É DE PROPÓSITO. Ela responde «que parte do
 * mês é esta tela», que é uma verdade do DESENHO e não do estado — e por isso
 * não precisa de rede, não pode ficar velha e não pode discordar de Mês. O
 * estado ao vivo tem UM lugar, e o link volta para lá.
 */

export type PassoNoMapa = {
  numero: number;
  titulo: string;
  /** Onde ele acontece. Serve para a frase poder dizer «em Cobranças». */
  destino: Destino | null;
};

export type OndeEstouNoMes = {
  /** Os passos que acontecem NESTA tela, na ordem do mês. Nunca vazio. */
  aqui: readonly PassoNoMapa[];
  /** Quantos passos o mês tem, para a frase poder dizer «de 5». */
  total: number;
  /** O passo imediatamente antes do primeiro daqui. `null` quando esta tela abre o mês. */
  antes: PassoNoMapa | null;
  /** O seguinte ao último daqui. `null` quando esta tela FECHA o mês. */
  depois: PassoNoMapa | null;
  /** A tela é de outro setor que o do mês (Contas a pagar mora na Empresa): a
   *  frase precisa dizer de QUE mês ela é o fim. */
  deOutroSetor: boolean;
};

const noMapa = (i: number): PassoNoMapa => ({
  numero: i + 1, titulo: MOLDES[i]!.titulo, destino: MOLDES[i]!.destino,
});

/** O setor em que o mês mora: o da primeira tela de trabalho dele. */
const SETOR_DO_MES = funilDoCaminho(MOLDES[0]!.destino.endereco).chave;

/**
 * Que parte do mês é esta tela.
 *
 * `null` para tela que não hospeda passo nenhum — e aí a faixa não desenha, que
 * é o certo: uma faixa dizendo «esta tela não é passo nenhum» é ruído em toda
 * tela de cadastro do sistema.
 */
export function ondeEstouNoMes(rota: string): OndeEstouNoMes | null {
  const indices = MOLDES
    .map((m, i) => (m.destino.endereco === rota ? i : -1))
    .filter((i) => i >= 0);
  if (indices.length === 0) return null;

  const primeiro = indices[0]!;
  const ultimo = indices[indices.length - 1]!;
  return {
    aqui: indices.map(noMapa),
    total: MOLDES.length,
    antes: primeiro > 0 ? noMapa(primeiro - 1) : null,
    depois: ultimo < MOLDES.length - 1 ? noMapa(ultimo + 1) : null,
    deOutroSetor: funilDoCaminho(rota).chave !== SETOR_DO_MES,
  };
}
