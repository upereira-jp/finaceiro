// O MÊS EM CINCO PASSOS — o que fazer, nesta ordem, e como fazer cada um.
//
// ============================================================================
// POR QUE ELE EXISTE, e a pergunta que nenhuma tela respondia
//
// O sistema tem treze telas e um relatório de treze conferências. Todas elas
// respondem **«o que está faltando»**. Nenhuma respondia **«o que eu faço
// agora, e como»** — que é a pergunta de quem abre o sistema para trabalhar.
//
// A distância entre as duas não é de estilo. Medida em 10/09/2026, com o
// sistema inteiro no ar e zero faturas emitidas desde sempre, o caminho real de
// um mês atravessa DUAS telas cujos nomes não o anunciam, em seis atos com
// nomes diferentes dos das abas:
//
//   «Fatura unificada»      enviar as contas · «Conferir» · «Registrar» ·
//                           «conferir antes» · «gerar cobrança»
//   «Emissão e cobrança»    «Emitir as N em rascunho» · o botão do boleto
//
// E há uma armadilha a mais, que sozinha justifica este arquivo: a tela
// **«Faturamento»** parece ser onde o mês nasce, pelo nome, e é o **caminho
// aposentado** desde 21/08/2026 — está escrito no subtítulo dela, que é o
// último lugar onde alguém procuraria antes de clicar. Quem seguir o nome erra,
// e errar ali não dá erro: dá um mês composto pelo caminho velho.
//
// ============================================================================
// AS TRÊS REGRAS QUE GOVERNAM ESTE ARQUIVO
//
//   1. **UM passo é «agora», e só um.** A lista inteira aparece para dar
//      contexto — mas exatamente um item carrega o que fazer e como. Duas
//      instruções ao mesmo tempo é a mesma coisa que nenhuma, e foi o que a
//      tabela das treze camadas já fazia bem: ela é o DIAGNÓSTICO, e continua
//      logo abaixo. Este é o ROTEIRO;
//
//   2. **Nada é afirmado sem medida.** Cada passo tem um número que vem do
//      servidor. Sem o número, o passo diz «esperando» — nunca «feito». É a
//      mesma disciplina do `nao_medido` da prontidão e do `nao_verificavel` do
//      aviso de pagamento: não ter medido não autoriza dizer que está bem;
//
//   3. **O «como» nomeia botões que existem.** Cada linha do `comoFazer` foi
//      escrita lendo a tela de destino, e a suíte prende os rótulos que dá para
//      prender. Instrução que nomeia um botão inexistente é pior do que
//      instrução nenhuma: ela faz a pessoa duvidar de si.
//
// O MAPA DE DESTINO NÃO É REESCRITO AQUI. Quando um passo está travado por uma
// pendência de cadastro, quem diz onde ela se resolve é `destino-da-camada.ts`,
// que já sabe e tem suíte própria — e quem diz a frase em português de quem
// opera é `VERBETE_DA_CAMADA`, de `vocabulario.ts`. Dois mapas para a mesma
// pergunta discordariam em silêncio.

import { DESTINO_DA_CAMADA, enderecoDoDestino } from './destino-da-camada.ts';
import { VERBETE_DA_CAMADA } from './vocabulario.ts';

/** O mínimo que este módulo lê de uma linha do relatório. Estrutural de
 *  propósito: o tipo `Camada` de `api.ts` satisfaz isto sem que este arquivo
 *  precise importar o cliente de rede. Mesma disciplina de `CamadaLida`. */
export type CamadaDoRoteiro = {
  camada: string;
  situacao: 'ok' | 'pendente' | 'nao_medido';
  faltam: number;
  total: number;
  efeito: 'bloqueia_fatura' | 'bloqueia_boleto' | 'bloqueia_split';
};

/** A linha da carteira para a competência aberta — `GET /carteira?competencia=`.
 *  `null` enquanto não chegou, e `null` é o que faz os passos dizerem
 *  «esperando» em vez de «feito». */
export type PosicaoDoMes = {
  faturas: number;
  emitidas: number;
  liquidadas: number;
  vencidas_em_aberto: number;
} | null;

export type EstadoDoPasso =
  /** Medido e fechado. */
  | 'feito'
  /** É este. Exatamente um passo por vez recebe isto. */
  | 'agora'
  /** É este, e ele não começa enquanto uma pendência de cadastro não fechar.
   *  Também consome o «agora»: destravar É o trabalho de agora. */
  | 'travado'
  /** Depende de um passo acima, ou do cliente pagar. Sem instrução, de
   *  propósito — instrução para daqui a três passos é ruído. */
  | 'espera';

/** Uma pendência de cadastro que segura um passo, já em português e com o
 *  caminho. Vem inteira dos dois mapas que já existem. */
export type TravaDoPasso = {
  camada: string;
  titulo: string;
  frase: string;
  faltam: number;
  /** `null` quando aquela pendência não tem tela — e o mapa diz isso. */
  endereco: string | null;
};

export type PassoDoMes = {
  chave: ChaveDoPasso;
  /** 1..5, e é o número que a tela imprime. */
  numero: number;
  titulo: string;
  estado: EstadoDoPasso;
  /** «18 de 29 lidas». `null` quando ainda não há o que contar. */
  contagem: string | null;
  /** Uma frase. O que este passo É, para quem nunca o fez. */
  oQueFazer: string;
  /** O passo a passo. Só a tela do passo «agora» o mostra. */
  comoFazer: readonly string[];
  destino: { rotulo: string; endereco: string } | null;
  travas: readonly TravaDoPasso[];
  /** O passo que o sistema faz sozinho. Nunca vira «agora»: não há o que
   *  clicar, e pôr uma pessoa a esperar por ele seria mandá-la olhar. */
  automatico: boolean;
};

export type ChaveDoPasso = 'ler' | 'gerar' | 'emitir' | 'cobrar' | 'receber';

/* ==========================================================================
 * O TEXTO, separado do cálculo
 * ==========================================================================
 * Ele fica numa constante e não dentro da função porque é o que mais vai ser
 * revisto — e revisar texto não pode obrigar a reler a máquina de estados.
 */

type Molde = {
  chave: ChaveDoPasso;
  titulo: string;
  oQueFazer: string;
  comoFazer: readonly string[];
  destino: { rotulo: string; endereco: string } | null;
  automatico?: boolean;
  /** Que classe de pendência trava este passo. */
  trava: 'bloqueia_fatura' | 'bloqueia_boleto' | 'bloqueia_split' | null;
};

const FATURA_UNIFICADA = { rotulo: 'Fatura unificada', endereco: '/documento' };
const EMISSAO = { rotulo: 'Emissão e cobrança', endereco: '/faturas' };
const A_PAGAR = { rotulo: 'Contas a pagar', endereco: '/contas-a-pagar' };

export const MOLDES: readonly Molde[] = [
  {
    chave: 'ler',
    titulo: 'Ler as contas de luz do mês',
    oQueFazer:
      'Trazer para o sistema a conta que a distribuidora emitiu neste mês para cada unidade. '
      + 'Tudo o que vem depois sai dos números dela.',
    comoFazer: [
      'Baixe do portal da distribuidora as contas do mês — uma por unidade.',
      'Abra «Fatura unificada» e envie TODAS de uma vez na aba «1 · Leitura e cálculo». '
      + 'Não precisa ser uma por vez: o sistema lê em fila.',
      'Cada conta lida vira uma linha. A que estiver com pendência aparece no topo, com o motivo — '
      + 'clique «Conferir», ajuste o campo ao lado e salve.',
      'Com a linha sem pendência, clique «Registrar». Ela sai da fila e passa para a lista '
      + '«Contas registradas», logo abaixo.',
    ],
    destino: FATURA_UNIFICADA,
    trava: null,
  },
  {
    chave: 'gerar',
    titulo: 'Gerar as cobranças',
    oQueFazer:
      'Transformar cada conta registrada na cobrança que a G3 vai fazer. Ela nasce como rascunho — '
      + 'nada é enviado ao cliente neste passo.',
    comoFazer: [
      'Continue em «Fatura unificada», na lista «Contas registradas».',
      'Clique «conferir antes» na linha. Ele diz, sem gravar nada, se falta alguma coisa para '
      + 'aquela conta virar cobrança.',
      'Estando certo, clique «gerar cobrança» e confirme. A linha passa a dizer «cobrança gerada».',
      '⚠️ A aba «Faturamento» NÃO é este passo. Ela é o caminho antigo, de antes de a cobrança '
      + 'nascer da conta da distribuidora, e não deve ser usada.',
    ],
    destino: FATURA_UNIFICADA,
    trava: 'bloqueia_fatura',
  },
  {
    chave: 'emitir',
    titulo: 'Emitir as cobranças',
    oQueFazer:
      'Fechar o valor dos rascunhos. Depois de emitida, a cobrança vale e o valor dela não muda '
      + 'mais sozinho.',
    comoFazer: [
      'Abra «Emissão e cobrança» e escolha o mês no campo do alto.',
      'Confira as linhas que estão em rascunho — valor, unidade e vencimento.',
      'Clique «Emitir as N em rascunho» para fechar todas de uma vez, ou «Emitir» em cada linha.',
    ],
    destino: EMISSAO,
    trava: null,
  },
  {
    chave: 'cobrar',
    titulo: 'Pedir o boleto e entregar ao cliente',
    oQueFazer:
      'Pedir ao banco o boleto de cada cobrança emitida e entregar ao cliente a folha com o boleto '
      + 'e o Pix. É o passo em que o cliente finalmente recebe algo.',
    comoFazer: [
      'Em «Emissão e cobrança», peça o boleto na linha de cada cobrança emitida.',
      'Se o banco recusar, a própria linha diz o motivo. O mais comum é faltar o endereço do '
      + 'pagador na unidade — e ele costuma vir na conta que você já leu.',
      'Boleto pedido que não registrou volta sozinho na fila, a cada 5 minutos. Não adianta ficar '
      + 'clicando: a lista mostra quantas tentativas já houve.',
      'A folha do cliente se imprime em «Fatura unificada» — e a «2ª via» de qualquer mês já '
      + 'registrado sai pelo botão de mesmo nome.',
    ],
    destino: EMISSAO,
    trava: 'bloqueia_boleto',
  },
  {
    chave: 'receber',
    titulo: 'Receber e repartir',
    oQueFazer:
      'O pagamento entra sozinho: o banco avisa na hora e o sistema ainda confere todo dia de '
      + 'manhã. Quando o dinheiro entra, o repasse ao dono da usina e a comissão nascem em '
      + '«Contas a pagar».',
    comoFazer: [
      'Não há nada a clicar enquanto o cliente não paga.',
      'O que já entrou aparece em «Emissão e cobrança», e o que a G3 passou a dever por causa '
      + 'disso aparece em «Contas a pagar».',
      'Se um cliente disser que pagou e a linha não baixar, confira em «Emissão e cobrança» — dá '
      + 'para dar baixa à mão, e a trilha registra quem deu.',
    ],
    destino: A_PAGAR,
    automatico: true,
    trava: 'bloqueia_split',
  },
];

/* ==========================================================================
 * O CÁLCULO
 * ========================================================================== */

/** A camada que mede o passo 1 — e ela também é a que define o UNIVERSO do mês:
 *  quantas unidades esperam cobrança. */
const CAMADA_DA_CONTA = 'conta_lida_da_competencia';

export type LeituraDoMes = {
  camadas: readonly CamadaDoRoteiro[];
  posicao: PosicaoDoMes;
  /**
   * Quantas cobranças emitidas ainda estão sem boleto que preste — o `total` de
   * `GET /emissao/travada`. `null` enquanto não chegou.
   *
   * ⚠️ ESTE NÚMERO É DA CARTEIRA INTEIRA, e não do mês do seletor. É assim de
   * propósito no servidor, e o motivo está escrito lá: *«uma fatura de MAI que
   * nunca virou boleto continua sendo dinheiro parado em SET»*. A consequência
   * aqui é que a contagem deste passo DIZ que é de todos os meses — um número de
   * escopo diferente do título da caixa, sem dizer, seria a caixa mentindo por
   * omissão.
   */
  semCobranca: number | null;
};

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

/**
 * OS CINCO PASSOS, com estado, número e instrução.
 *
 * A CAMINHADA É DE CIMA PARA BAIXO e para no primeiro que não está feito — é
 * ela que garante a regra 1. Um passo travado também para a caminhada, porque
 * destravá-lo É o trabalho de agora; um passo automático não para, porque não
 * há o que uma pessoa faça nele.
 */
export function roteiroDoMes(e: LeituraDoMes): PassoDoMes[] {
  const camada = (nome: string) => e.camadas.find((c) => c.camada === nome) ?? null;
  const conta = camada(CAMADA_DA_CONTA);
  /* O universo do mês. Sem ele nenhuma contagem tem denominador, e um número
   * sem denominador («18 geradas») não diz se falta uma ou onze. */
  const universo = conta && conta.situacao !== 'nao_medido' ? conta.total : null;

  const p = e.posicao;

  const feitos: Record<ChaveDoPasso, boolean> = {
    ler: conta?.situacao === 'ok',
    gerar: universo !== null && p !== null && p.faturas >= universo && universo > 0,
    emitir: p !== null && p.faturas > 0 && p.emitidas >= p.faturas,
    cobrar: p !== null && p.emitidas > 0 && e.semCobranca === 0,
    receber: p !== null && p.emitidas > 0 && p.liquidadas >= p.emitidas,
  };

  /*
   * DENOMINADOR ZERO NÃO VIRA TEXTO, e isto foi visto lendo a caixa como quem
   * opera a lê, e não no código: num mês em que nada foi gerado, «0 de 0
   * emitidas» ocupa a linha para não dizer nada, e «todas com boleto» é pior —
   * é tranquilizar sobre um trabalho que nem começou. `null` some da tela, e
   * sumir é a resposta certa: o estado do passo já diz «depois».
   */
  const contagens: Record<ChaveDoPasso, string | null> = {
    ler: conta && conta.situacao !== 'nao_medido'
      ? `${conta.total - conta.faltam} de ${conta.total} ${plural(conta.total, 'lida', 'lidas')}`
      : null,
    gerar: p && universo !== null && universo > 0
      ? `${p.faturas} de ${universo} ${plural(universo, 'gerada', 'geradas')}` : null,
    emitir: p && p.faturas > 0
      ? `${p.emitidas} de ${p.faturas} ${plural(p.faturas, 'emitida', 'emitidas')}` : null,
    /* O NÚMERO DE FORA DO MÊS SÓ APARECE QUANDO É TRABALHO. Havendo cobrança
     * sem boleto em qualquer mês, ele vale a linha mesmo neste; não havendo,
     * «todas com boleto» só pode ser dito se existir alguma emitida para ter
     * boleto. */
    cobrar: e.semCobranca === null ? null
      : e.semCobranca > 0 ? `${e.semCobranca} sem boleto, contando todos os meses`
      : p && p.emitidas > 0 ? 'todas com boleto'
      : null,
    receber: p && p.emitidas > 0
      ? `${p.liquidadas} de ${p.emitidas} ${plural(p.emitidas, 'paga', 'pagas')}` : null,
  };

  let jaTemOAgora = false;

  return MOLDES.map((m, i): PassoDoMes => {
    const travas = m.trava === null ? [] : travasDe(e.camadas, m.trava);
    const feito = feitos[m.chave];

    let estado: EstadoDoPasso;
    if (feito) {
      estado = 'feito';
    } else if (jaTemOAgora) {
      estado = 'espera';
    } else if (travas.length > 0) {
      estado = 'travado';
      jaTemOAgora = true;
    } else if (m.automatico) {
      /* Não consome o «agora» E NÃO É «feito»: ninguém tem o que fazer, e ainda
       * assim o mês não fechou. As duas coisas são verdade ao mesmo tempo. */
      estado = 'espera';
    } else {
      estado = 'agora';
      jaTemOAgora = true;
    }

    return {
      chave: m.chave,
      numero: i + 1,
      titulo: m.titulo,
      estado,
      contagem: contagens[m.chave],
      oQueFazer: m.oQueFazer,
      comoFazer: m.comoFazer,
      destino: m.destino,
      travas,
      automatico: m.automatico === true,
    };
  });
}

/**
 * AS PENDÊNCIAS QUE SEGURAM UM PASSO, já em português e com o caminho.
 *
 * A conta lida fica de fora de propósito: ela é o passo 1, e listá-la como
 * trava do passo 2 diria duas vezes a mesma coisa — uma delas fora de ordem.
 */
export function travasDe(
  camadas: readonly CamadaDoRoteiro[],
  efeito: 'bloqueia_fatura' | 'bloqueia_boleto' | 'bloqueia_split',
): TravaDoPasso[] {
  return camadas
    .filter((c) => c.efeito === efeito && c.situacao !== 'ok' && c.camada !== CAMADA_DA_CONTA)
    .map((c) => {
      const v = VERBETE_DA_CAMADA[c.camada];
      const d = DESTINO_DA_CAMADA[c.camada];
      return {
        camada: c.camada,
        titulo: v?.titulo ?? c.camada,
        frase: v?.simples ?? '',
        faltam: c.faltam,
        endereco: d ? enderecoDoDestino(d) : null,
      };
    });
}

/** O passo que a tela abre expandido. `null` quando o mês inteiro fechou — e aí
 *  a tela diz isso, que é uma notícia e não um vazio. */
export function passoDeAgora(passos: readonly PassoDoMes[]): PassoDoMes | null {
  return passos.find((x) => x.estado === 'agora' || x.estado === 'travado') ?? null;
}

/* ==========================================================================
 * ONDE ESTOU, dentro da tela de trabalho
 * ==========================================================================
 *
 * O roteiro completo mora em Pendências. Só que o trabalho não: ele acontece em
 * «Fatura unificada» e em «Emissão e cobrança», e quem está lá dentro perdeu o
 * mapa — a tela não diz em que parte do mês ela é, nem para onde se vai depois.
 * Foi assim que o caminho aposentado conseguiu parecer o caminho: nenhuma tela
 * dizia o que vinha antes nem depois dela.
 *
 * ⚠️ ESTA LEITURA NÃO É AO VIVO, E É DE PROPÓSITO. Ela responde «que parte do
 * mês é esta tela», que é uma verdade do DESENHO e não do estado — e por isso
 * não precisa de rede, não pode ficar velha e não pode discordar de Pendências.
 * O estado ao vivo («você está no 1 de 5») tem UM lugar, e repetir estado em
 * três telas é criar três lugares para discordarem. O link volta para lá.
 */

export type PassoNoMapa = {
  numero: number;
  titulo: string;
  /** Onde ele acontece. Serve para a frase poder dizer «em «Emissão e cobrança»». */
  destino: { rotulo: string; endereco: string } | null;
};

export type OndeEstouNoMes = {
  /** Os passos que acontecem NESTA tela, na ordem do mês. Nunca vazio. */
  aqui: readonly PassoNoMapa[];
  /** Quantos passos o mês tem, para a frase poder dizer «de 5». */
  total: number;
  /** O passo imediatamente antes do primeiro daqui. `null` quando esta tela abre o mês. */
  antes: PassoNoMapa | null;
  /** O seguinte ao último daqui. `null` quando esta tela fecha o mês. */
  depois: PassoNoMapa | null;
};

const noMapa = (i: number): PassoNoMapa => ({
  numero: i + 1, titulo: MOLDES[i]!.titulo, destino: MOLDES[i]!.destino,
});

/**
 * Que parte do mês é esta tela.
 *
 * `null` para tela que não hospeda passo nenhum — e aí a faixa não desenha, que
 * é o certo: uma faixa dizendo «esta tela não é passo nenhum» é ruído em toda
 * tela de cadastro do sistema.
 */
export function ondeEstouNoMes(rota: string): OndeEstouNoMes | null {
  const indices = MOLDES
    .map((m, i) => (m.destino?.endereco === rota ? i : -1))
    .filter((i) => i >= 0);
  if (indices.length === 0) return null;

  const primeiro = indices[0]!;
  const ultimo = indices[indices.length - 1]!;
  return {
    aqui: indices.map(noMapa),
    total: MOLDES.length,
    antes: primeiro > 0 ? noMapa(primeiro - 1) : null,
    depois: ultimo < MOLDES.length - 1 ? noMapa(ultimo + 1) : null,
  };
}
