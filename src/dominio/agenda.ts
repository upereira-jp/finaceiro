// A AGENDA DE COBRANCA, na parte que nao toca banco nem rede.
//
// PRD 6 pede dois processos periodicos, e os dois existem porque um caminho
// feliz que falha uma vez fica falhado para sempre:
//
//   "fila de emissao com retry exponencial"
//   "consulta ativa diaria dos boletos em aberto para capturar liquidacoes cujo
//    webhook falhou"
//
// Este arquivo e a DECISAO dos dois - quando retentar, e o que fazer com o que o
// banco respondeu. Nada aqui abre conexao, le tabela ou chama a Sicoob, e a razao
// e a regra 8: invariante sem teste e comentario. A decisao de retentar um boleto
// as 3h da manha nao pode depender de esperar 3h para observar.
//
// ============================================================================
// OS QUATRO NUMEROS QUE O PRD NAO DA, E POR QUE ELES ESTAO TODOS AQUI
//
// O PRD diz "exponencial" e "diaria". Nao diz base, nao diz teto, nao diz quando
// desistir e nao diz com quantos dias avisar do certificado. Pela regra 10 isso
// e lacuna, e lacuna nao vira valor default escolhido "porque parecia razoavel"
// sem dono nomeado - entao os quatro estao num objeto so, marcados como escolha
// de quem escreveu o codigo, e registrados em Q-AGENDA-02 para o dono confirmar.
//
// O mesmo padrao do `web/src/tema.ts`, onde o que e da G3 e o que e [derivado]
// estao separados no arquivo em vez de misturados na cabeca de alguem.
//
// ============================================================================
// A DECISAO QUE NAO E ARBITRARIA: A FILA NUNCA DESISTE SOZINHA
//
// Nao ha "maximo de tentativas" aqui, e a ausencia e a parte pensada. Um boleto
// que sai da fila por contagem para de ser cobrado sem que ninguem tenha
// decidido parar de cobrar - a fatura fica emitida, o cliente nao recebe nada, e
// o sistema nao acusa porque, do ponto de vista dele, a fila esta limpa. E a
// falha silenciosa que esta agenda existe para fechar, cometida pela agenda.
//
// O teto e do INTERVALO. A fila desacelera ate uma tentativa a cada
// `tetoSegundos` e fica ali, visivel e contada, ate alguem consertar a causa ou
// decidir - com nome e data - que aquele boleto nao se cobra mais.

import type { Centavos } from './centavos.ts';
import type { SituacaoDoBoleto } from '../sicoob/porta.ts';

/**
 * Os quatro numeros escolhidos. Q-AGENDA-02: o PRD nao os da.
 *
 * Por que estes, e o raciocinio fica escrito para poder ser contestado:
 *
 *   baseSegundos 300 (5 min)  - falha de transporte que se resolve sozinha se
 *                               resolve em minutos. Menos que isso e martelar o
 *                               banco durante uma indisponibilidade dele.
 *   tetoSegundos 21600 (6 h)  - quatro tentativas por dia no regime lento, que e
 *                               a mesma ordem de grandeza da consulta ativa
 *                               diaria. Passar disso faria a fila parecer parada.
 *   diasDeAvisoDoCertificado 30 - A1 se renova com processo e assinatura, nao com
 *                               um clique. Trinta dias e prazo de agenda, nao de
 *                               emergencia.
 *   examinadosPorRodada 200   - teto de trabalho por execucao, para uma rodada
 *                               nao virar uma janela de horas. O que sobra fica
 *                               na fila e sai na proxima - e a rodada CONTA o
 *                               que deixou para tras, em vez de truncar calada.
 *
 * Com base 5 min e teto 6 h a progressao e 5, 10, 20, 40, 80, 160, 320 min e
 * dai 6 h fixas: a oitava tentativa cai por volta de 16 h depois da primeira.
 */
export type Politica = {
  readonly baseSegundos: number;
  readonly tetoSegundos: number;
  readonly diasDeAvisoDoCertificado: number;
  readonly examinadosPorRodada: number;
};

/*
 * Tipo declarado ANTES e nao `as const` depois. Com `as const` o tipo de
 * `Politica` viraria os literais 300/21600/30/200, e toda politica de teste - que
 * existe justamente para nao depender destes numeros - deixaria de compilar. Foi
 * o que aconteceu na primeira versao: o teste de propriedade nao entrava no tipo
 * da coisa cuja propriedade ele testa.
 */
export const POLITICA: Politica = {
  baseSegundos: 300,
  tetoSegundos: 21_600,
  diasDeAvisoDoCertificado: 30,
  examinadosPorRodada: 200,
};

/**
 * O intervalo ate a proxima tentativa, em segundos.
 *
 * `tentativas` e quantas JA falharam - depois da primeira falha o intervalo e a
 * base, e nao a base dobrada. Dobrar na primeira faria a retentativa mais rapida
 * possivel ser o dobro do que a politica diz.
 *
 * Recusa tentativas < 1 em vez de devolver zero: chamar isto com zero significa
 * que quem chamou acha que houve uma falha e nao houve, e devolver "tente agora"
 * poria em producao um laco que retenta o que nunca falhou.
 */
export function intervaloSegundos(tentativas: number, p: Politica = POLITICA): number {
  if (!Number.isInteger(tentativas) || tentativas < 1) {
    throw new RangeError(
      `intervaloSegundos espera o numero de tentativas JA FALHADAS (>= 1), recebeu ${tentativas}`,
    );
  }
  // 2^(n-1) sem Math.pow em float: deslocamento de inteiro, e saturado antes de
  // estourar. Com n grande o produto passaria de Number.MAX_SAFE_INTEGER e o teto
  // deixaria de ser alcancavel pelo caminho normal - o `min` de baixo nunca
  // veria um numero comparavel.
  const expoente = Math.min(tentativas - 1, 31);
  const fator = 2 ** expoente;
  return Math.min(p.baseSegundos * fator, p.tetoSegundos);
}

/** Quando a fila pode pegar esta linha de novo, contado a partir da tentativa
 *  que acabou de falhar. */
export function proximaTentativaEm(tentativas: number, desde: Date, p: Politica = POLITICA): Date {
  const t = desde.getTime();
  if (!Number.isFinite(t)) throw new RangeError('proximaTentativaEm: "desde" nao e uma data valida');
  return new Date(t + intervaloSegundos(tentativas, p) * 1000);
}

/**
 * A linha esta vencida, isto e, a fila pode pega-la?
 *
 * `proxima_tentativa_em` nulo e VENCIDO, e nao "nunca". E o estado das linhas que
 * ja existiam quando a migration 21 entrou - falharam e nunca foram retentadas -
 * e tambem o de um boleto `pendente` que nasceu e cuja chamada morreu antes de
 * carimbar qualquer coisa. Tratar nulo como "nao vence" deixaria os dois casos
 * fora da fila para sempre, que e exatamente o buraco que a fila veio fechar.
 */
export function vencido(
  linha: { proxima_tentativa_em: Date | null },
  agora: Date,
): boolean {
  if (linha.proxima_tentativa_em === null) return true;
  return linha.proxima_tentativa_em.getTime() <= agora.getTime();
}

// ============================================================ consulta ativa

/**
 * O que fazer com o que o banco respondeu.
 *
 * `divergencia` NAO e erro de programa e nao aborta a rodada: e um fato sobre o
 * mundo que precisa chegar a uma pessoa. O sistema registra e segue, porque uma
 * divergencia que derruba a rodada impede as outras 199 de serem verificadas.
 */
export type Acao =
  | { acao: 'nada'; motivo: string }
  | { acao: 'baixar'; motivo: string; dataLiquidacao: Date; valorCentavos: Centavos; chave: string }
  | { acao: 'marcar_baixado'; motivo: string }
  | { acao: 'divergencia'; motivo: string };

/**
 * A chave de idempotencia da baixa por consulta ativa.
 *
 * DETERMINISTICA de proposito: a mesma situacao no banco produz a mesma chave em
 * toda rodada. Sem isso, duas execucoes da consulta ativa sobre o mesmo boleto
 * liquidado produziriam duas chaves e dependeriam de outra coisa para nao
 * duplicar a baixa.
 *
 * A outra coisa existe e vale - `liquidacao_fatura_unica UNIQUE (tenant_id,
 * fatura_id)` da migration 16 -, mas depender dela transformaria o caso normal
 * "ja baixamos ontem" em violacao de constraint. Erro esperado no caminho feliz
 * treina o time a ignorar erro.
 *
 * O prefixo distingue a origem: um evento visto por consulta ativa e o mesmo
 * evento visto por webhook tem chaves diferentes, e e isso que se quer - a
 * `liquidacao_externa_unica` e por (tenant_id, ORIGEM, id_externo), e o que
 * impede a dupla contagem entre canais e o unico por fatura, nao a chave.
 */
export function chaveDaConsultaAtiva(nossoNumero: string, dataLiquidacao: Date): string {
  return `consulta:${nossoNumero}:${dataLiquidacao.toISOString().slice(0, 10)}`;
}

export function decidir(s: SituacaoDoBoleto): Acao {
  switch (s.situacao) {
    case 'em_aberto':
      return { acao: 'nada', motivo: 'o banco diz em aberto' };

    case 'baixado':
      // Baixado no banco e nao liquidado: o titulo foi cancelado la. Nao ha
      // dinheiro, entao nao ha split - so o nosso estado a alinhar.
      return { acao: 'marcar_baixado', motivo: 'o banco diz baixado - titulo cancelado, sem liquidacao' };

    case 'desconhecida':
      /*
       * O banco nao reconhece o nosso numero. Isto NAO e "nada a fazer": a
       * hipotese ruim e que o registro nunca chegou de fato e o cliente esta com
       * um boleto que o banco nao vai aceitar. Vale gente olhando.
       */
      return {
        acao: 'divergencia',
        motivo: `o banco nao reconhece o nosso numero "${s.nossoNumero}" - o registro pode nunca ter chegado`,
      };

    case 'liquidado': {
      if (s.dataLiquidacao === null) {
        return { acao: 'divergencia', motivo: 'o banco diz liquidado e nao informa a data - baixa sem data nao entra' };
      }
      if (s.valorLiquidadoCentavos === null) {
        return { acao: 'divergencia', motivo: 'o banco diz liquidado e nao informa o valor - nao ha o que conferir contra o titulo' };
      }
      return {
        acao: 'baixar',
        motivo: 'o banco diz liquidado',
        dataLiquidacao: s.dataLiquidacao,
        valorCentavos: s.valorLiquidadoCentavos,
        chave: chaveDaConsultaAtiva(s.nossoNumero, s.dataLiquidacao),
      };
    }
  }
}

// ============================================================ certificado A1

export type NivelDoCertificado = 'sem_certificado' | 'vencido' | 'vence_em_breve' | 'ok';

/**
 * PRD 6, ultima linha: "alerta de expiracao do certificado A1 - vencido, a
 * emissao para sem erro obvio".
 *
 * `sem_certificado` e `vencido` sao coisas diferentes e a distincao nao e
 * formal: sem data cadastrada nao se sabe se ha problema, e afirmar "ok" nesse
 * caso seria o sistema garantindo o que ele nao sabe.
 */
export function nivelDoCertificado(dias: number | null, p: Politica = POLITICA): NivelDoCertificado {
  if (dias === null) return 'sem_certificado';
  if (dias < 0) return 'vencido';
  if (dias <= p.diasDeAvisoDoCertificado) return 'vence_em_breve';
  return 'ok';
}
