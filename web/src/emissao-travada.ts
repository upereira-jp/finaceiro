// O QUE NÃO CHEGOU AO BANCO — puro, sem JSX, com suíte própria.
//
// ============================================================================
// A PERGUNTA QUE ESTA LISTA RESPONDE, e ela não tinha onde ser feita
//
// «Quais clientes ainda não receberam cobrança deste mês, e por quê?»
//
// Até 10/09/2026 a resposta existia só POR FATURA, dentro de um painel que abre
// numa linha de tabela: com 29 unidades, descobrir que 4 estão retentando exigia
// abrir 29 painéis. E a fila de envio, por decisão registrada, **nunca desiste
// sozinha** — o que é certo, e tem o preço de um boleto poder retentar por
// semanas sem ninguém notar.
//
// ⚠️ E HÁ UM SEGUNDO CAMINHO PARA A MESMA AUSÊNCIA, que a fila não cobre: a
// fatura emitida em que **ninguém pediu o boleto**. Emitir e pedir o boleto são
// atos separados de propósito, e a fila só retenta boleto que já foi pedido uma
// vez. Essa fatura não está em erro, não está atrasada e não está em fila
// nenhuma — ela só não vira cobrança. As duas ausências têm a mesma cara para
// quem espera o dinheiro, e por isso saem na mesma lista.
//
// ============================================================================
// A REGRA DE EXIBIÇÃO É A DA VIZINHA `automacoes.ts`, e pelo mesmo motivo
//
// A lista **afirma quando está vazia**. «Nenhuma linha» e «a leitura quebrou»
// têm exatamente a mesma cara quando a tela cala — e o que se quer perceber aqui
// é uma AUSÊNCIA (a cobrança que não saiu), que não tem como gritar. Então o
// painel diz «todas as faturas emitidas já têm boleto no banco» com todas as
// letras, e quem lê pode confiar no silêncio porque o silêncio deixou de existir.
//
// PURO PELO MOTIVO DE SEMPRE (regra 8): o runner do `web/` não lê JSX, então
// regra dentro de `.tsx` não tem como ser verificada.

import { faz } from './automacoes.ts';

/* `faz()` VEM DE LÁ E NÃO É COPIADO. A escala («agora há pouco», minutos, horas,
 * dias) já foi decidida, medida e corrigida uma vez — a primeira versão dizia
 * uma coisa no comentário e fazia outra, e quem pegou foi uma verificação. Uma
 * segunda cópia da mesma escala é uma escala que diverge no dia em que só uma
 * das duas for corrigida. */

/** O espelho de `NivelDaEmissao` do servidor (`src/dominio/agenda.ts`). */
export type NivelDaEmissao = 'nao_pedido' | 'esquecido' | 'esperando' | 'insistindo' | 'parado';

export type LinhaNaTela = {
  fatura_id: string;
  unidade: string;
  cliente: string;
  competencia: string;
  vencimento: string;
  valor_total_centavos: number | null;
  status_fatura: string;
  nivel: NivelDaEmissao;
  pede_gente: boolean;
  /** Contado NO SERVIDOR — «há 3 dias sem cobrança» é afirmação sobre o sistema,
   *  e não pode depender do relógio da máquina de quem abriu a tela. */
  ha_quanto_tempo_segundos: number | null;
  boleto: {
    status: string;
    tentativas: number;
    ultimo_erro: string | null;
    ultima_tentativa_em: string | null;
    proxima_tentativa_em: string | null;
  } | null;
};

export type EmissaoTravadaNaTela = {
  linhas: readonly LinhaNaTela[];
  total: number;
  pedem_gente: number;
};

/* ==========================================================================
 * O QUE CADA NÍVEL É, PARA QUEM OPERA
 * ==========================================================================
 *
 * `estado` é o que aconteceu, dito sem culpa e sem jargão. `oQueFazer` é a única
 * frase acionável, e ela vem SEMPRE — inclusive quando a ação é «não faça nada,
 * o sistema tenta de novo», que é uma instrução tão legítima quanto as outras e
 * evita que alguém fique clicando em cima de uma fila que já está trabalhando.
 *
 * NENHUMA delas manda rodar comando: quem abre esta tela não tem terminal. Essa
 * é a regra que a suíte de vocabulário chama de beco.
 */
const NIVEL: Record<NivelDaEmissao, {
  estado: string;
  oQueFazer: string;
  /** `false` quando a linha está contando uma coisa que se resolve sozinha. A
   *  tela usa isto para o peso do texto; a cor sozinha nunca é o sinal. */
  grave: boolean;
}> = {
  nao_pedido: {
    estado: 'A cobrança foi emitida e o boleto ainda não foi pedido ao banco.',
    oQueFazer: 'Peça o boleto por aqui. Emitir a cobrança e pedir o boleto são dois atos, '
             + 'e o segundo não acontece sozinho.',
    grave: false,
  },
  esquecido: {
    estado: 'Ninguém pediu o boleto desta cobrança, e já passou de um dia.',
    oQueFazer: 'Peça o boleto por aqui. Nada vai pedir sozinho: o sistema só tenta de novo '
             + 'boleto que já foi pedido ao menos uma vez, e este nunca foi. '
             + 'Se o pedido for recusado, a recusa aparece na hora e diz o que falta no cadastro.',
    grave: true,
  },
  esperando: {
    estado: 'O boleto foi pedido, o banco recusou, e o sistema já está tentando de novo sozinho.',
    oQueFazer: 'Não é preciso fazer nada agora. A espera entre as tentativas cresce a cada '
             + 'falha, e a maioria das recusas se resolve na tentativa seguinte.',
    grave: false,
  },
  insistindo: {
    estado: 'O boleto vem sendo pedido há mais de um dia e continua sendo recusado.',
    oQueFazer: 'Leia o que o banco respondeu, abaixo. O sistema vai continuar tentando para '
             + 'sempre — o que esta linha diz é que a causa não passou sozinha, e não vai passar '
             + 'sem alguém mexer nela.',
    grave: true,
  },
  parado: {
    estado: 'Esta cobrança saiu do estado em que o banco aceita registrar boleto, e o sistema '
          + 'parou de tentar.',
    oQueFazer: 'Ninguém vai tentar de novo sozinho. Decida entre cobrar por outro caminho ou '
             + 'refazer a cobrança do mês para esta unidade.',
    grave: true,
  },
};

/** «há 3 dias sem cobrança», e o sujeito muda com o nível: antes do primeiro
 *  pedido conta-se desde a emissão; depois dele, desde a primeira tentativa. */
export function haQuantoTempo(l: LinhaNaTela): string {
  if (l.ha_quanto_tempo_segundos === null) return '';
  const quando = faz(l.ha_quanto_tempo_segundos);
  return l.boleto === null ? `emitida ${quando}` : `tentando desde ${quando}`;
}

export type FraseDaLinha = {
  estado: string;
  oQueFazer: string;
  grave: boolean;
  /** O que o banco respondeu, cru, quando há. É a única parte da linha que não
   *  é escrita aqui — e ela vem do outro lado, então não se traduz: inventar uma
   *  tradução para uma recusa que não se conhece é pior que mostrar a original. */
  respostaDoBanco: string | null;
  /** «2 tentativas» · vazio quando não houve nenhuma. */
  tentativas: string;
};

export function fraseDaLinha(l: LinhaNaTela): FraseDaLinha {
  const n = NIVEL[l.nivel];
  const t = l.boleto?.tentativas ?? 0;
  return {
    estado: n.estado,
    oQueFazer: n.oQueFazer,
    grave: n.grave,
    respostaDoBanco: l.boleto?.ultimo_erro ?? null,
    tentativas: t === 0 ? '' : t === 1 ? '1 tentativa' : `${t} tentativas`,
  };
}

/* O ALARME QUE CONTAVA (`faixaDaEmissaoTravada`) SAIU EM 30/09/2026 (etapa 4a),
 * com o componente que o desenhava: desde a etapa 3 o passo 4 do funil do mês
 * conta as cobranças sem boleto e leva o destaque quando alguma pede gente
 * (`roteiro-do-mes.ts`). Nenhuma tela o montava. */

/**
 * A AFIRMAÇÃO — o rodapé que fala MESMO quando está tudo certo.
 *
 * Devolve a frase de «tudo em dia» quando não há linha nenhuma. É a mesma
 * escolha do painel das automações, pelo mesmo motivo escrito lá: quando a coisa
 * que se quer perceber é uma ausência, uma tela vazia significa duas coisas ao
 * mesmo tempo.
 */
export function resumoDaEmissao(e: EmissaoTravadaNaTela): string {
  if (e.total === 0) {
    return 'Todas as cobranças emitidas já têm boleto registrado no banco.';
  }
  const n = e.total;
  const cobrancas = n === 1 ? '1 cobrança emitida' : `${n} cobranças emitidas`;
  const pedem = e.pedem_gente === 0
    ? 'nenhuma precisa de você agora — o sistema está tentando sozinho.'
    : e.pedem_gente === 1
      ? '1 delas não se resolve sozinha.'
      : `${e.pedem_gente} delas não se resolvem sozinhas.`;
  return `${cobrancas} ainda sem boleto no banco, e ${pedem}`;
}

/** Truncou? A resposta traz `total` do banco e a lista vem com teto. Uma tela
 *  que mostra 200 de 340 sem dizer isso afirma «são estas» sobre uma amostra. */
export function avisoDeTruncagem(e: EmissaoTravadaNaTela): string | null {
  if (e.total <= e.linhas.length) return null;
  return `Mostrando as ${e.linhas.length} de vencimento mais antigo, de ${e.total} ao todo.`;
}
