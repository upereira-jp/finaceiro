// A TRILHA DOS ATOS QUE ACONTECEM FORA DO NOSSO BANCO. `Q-AUDIT-EXTERNO-01`.
//
// ============================================================================
// POR QUE ELA PRECISA EXISTIR SEPARADA DO GATILHO
//
// A regra 9 manda gravar "quem, quando, o que" para cadastro. O gatilho
// `app.auditar()` faz isso de graca em quatorze tabelas — mas ele so dispara em
// escrita NOSSA. Religar o aviso de pagamento na Sicoob cadastra o canal por
// onde o dinheiro e avisado e **nao escreve uma linha no nosso banco**: nao ha
// o que disparar o gatilho, e a role de runtime nao pode gravar em `auditoria`
// (so `SELECT`; o `INSERT` e de `auditor_financeiro`).
//
// ============================================================================
// DUAS LINHAS POR ATO, E A SEGUNDA PODE NAO VIR
//
// Chamada a terceiro NAO E TRANSACIONAL. Gravar so antes registraria um ato que
// talvez nao aconteca; gravar so depois perde a trilha se o processo morrer no
// meio — e ai o ato ja aconteceu no mundo, irreversivelmente.
//
//   `pedido`   ANTES, na nossa transacao. Se ELE falhar, nada e enviado — e
//              falhar aqui e seguro, porque nada aconteceu ainda;
//   `feito` /  DEPOIS, com o que o banco respondeu. Melhor esforco: ver
//   `falhou`   `registrarDesfecho`.
//
// Um `pedido` sem desfecho e exatamente a pergunta que se quer poder fazer —
// *"alguem mandou religar e ninguem sabe o que aconteceu"* — e ate 09/09/2026
// ela nao tinha onde ser feita. Mesmo desenho do `agenda_execucao`, cujo motor
// declara "uma linha de registro que COMMITA antes do trabalho".

import { db } from '../db/contexto.ts';

export type FaseDoAto = 'pedido' | 'feito' | 'falhou';

/**
 * ⚠️ NAO EXIGE PAPEL, e a ausencia e deliberada.
 *
 * Ela nao le nem escreve dado de negocio: ela registra que alguem agiu. Pedir
 * `exigir(...)` aqui poria a trilha atras da mesma permissao do ato — e o caso
 * que interessa a uma trilha e justamente o de quem agiu sem dever. Quem guarda
 * o ato e a rota; esta funcao guarda a memoria dele.
 *
 * O TENANT NAO E PARAMETRO: a funcao do banco o le de `app.current_tenant_id()`
 * e RECUSA fora de contexto. Mesma decisao da resolvedora do cofre, e pelo mesmo
 * motivo — uma assinatura que o recebesse deixaria quem chama escolher em nome
 * de quem a trilha e gravada.
 */
export async function registrarAto(e: {
  ato: string;
  contraparte: string;
  fase: FaseDoAto;
  detalhe?: unknown;
}): Promise<string> {
  const linhas: Array<{ id: string }> = await db().$queryRaw`
    SELECT app.registrar_ato_externo(
      ${e.ato}, ${e.contraparte}, ${e.fase},
      ${e.detalhe === undefined ? null : JSON.stringify(e.detalhe)}::jsonb
    ) AS id`;
  const id = linhas?.[0]?.id;
  if (!id) throw new Error('a trilha de ato externo nao devolveu id');
  return id;
}

/**
 * O DESFECHO, E ELE NAO PODE DERRUBAR O ATO — esta e a decisao que mais custou.
 *
 * Quando o desfecho chega, o ato JA ACONTECEU no sistema de terceiro. Deixar a
 * falha de gravar a trilha subir faria a rota devolver erro para uma acao que
 * DEU CERTO — e no caso do aviso de pagamento a consequencia e nomeavel: a
 * pessoa le "nao deu", aperta de novo, e o segundo webhook faz o banco notificar
 * EM DOBRO o mesmo pagamento, sem caminho de volta. Seria a guarda inteira
 * derrotada por um erro de log.
 *
 * O CONTRARIO DO QUE A REGRA 9 DIZ PARA LEITURA, e de proposito: la, "falha ao
 * gravar a trilha aborta a leitura" funciona porque abortar uma leitura nao
 * desfaz nada. Aqui abortar nao desfaz o ato — so mente sobre ele.
 *
 * E A FALHA NAO SOME: ela vai para o journal com o `pedido` que ficou orfao,
 * que e o unico lugar onde alguem consegue reconstruir o que houve.
 */
export async function registrarDesfecho(
  e: { ato: string; contraparte: string; fase: 'feito' | 'falhou'; detalhe?: unknown },
  aoFalhar: (m: string) => void,
  /** O escritor, injetavel SO para teste. Sem isto, a unica forma de exercitar a
   *  engolida seria derrubar o banco no meio de uma suite - e a engolida e
   *  justamente o comportamento que nao pode regredir em silencio: ela existe
   *  para que um erro de log nao faca a pessoa apertar o botao duas vezes. */
  escrever: typeof registrarAto = registrarAto,
): Promise<void> {
  try {
    await escrever(e);
  } catch (err: any) {
    aoFalhar(
      `[financeiro] ATENCAO: o ato externo "${e.ato}" em ${e.contraparte} terminou como `
      + `"${e.fase}" e a trilha do DESFECHO nao gravou: ${String(err?.message ?? err)}. `
      + 'O `pedido` esta em ato_externo_log e ficou sem par - e por ele que se reconstroi.',
    );
  }
}
