// O QUE RODA SOZINHO — e quando cada coisa rodou pela ultima vez.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 10/09/2026, e a resposta e uma varredura
//
// Este sistema tem tres automacoes, e as tres gravam o que fizeram:
//
//   a fila de emissao      `agenda_execucao`, a cada 5 minutos
//   a consulta ativa       `agenda_execucao`, uma vez por dia
//   o ciclo do CRM         `conector_execucao`, a cada 15 minutos
//
// Em 08/09/2026 o `conector-execucao.ts` deu leitor ao terceiro. Os dois
// primeiros continuaram sem nenhum, e a varredura de 10/09 e igual a daquele
// dia:
//
//     agenda_execucao em src/http/rotas.ts .... 0 ocorrencias
//     agenda_execucao em src/repos/ ........... 0
//     agenda_execucao em web/ ................. 0
//
// **A tabela e escrita pelo motor a cada rodada e NUNCA lida.** O proprio
// `scripts/agenda.ts` previu a falta ao criar a migration 21: sem esse registro,
// *"«a agenda nao roda desde o dia 3» volta a ser impossivel de perguntar"*.
// Escreve-se a resposta e nao se pergunta.
//
// ⚠️ O QUE ISSO CUSTAVA, e nao e teorico: a consulta ativa e a UNICA porta
// automatica de baixa enquanto o `ADR-0006` nao existir - o webhook da Sicoob
// nao tem como chamar este sistema (`deploy/financeiro-agenda-consulta.service`
// escreve isso com todas as letras). Se o timer dela parar, boleto pago para de
// virar baixa, a cobranca segue acusando quem ja pagou, e **nada em lugar nenhum
// acusa**: a ausencia de execucao nao produz erro, nao produz log e nao produz
// linha. A unica forma de saber era `systemctl list-timers` no terminal.
//
// SO LE. Nao ha escrita aqui e nao vai haver: quem escreve sao os motores,
// dentro da rodada, e um segundo escritor criaria duas versoes da mesma
// historia. Mesma disciplina de `conector-execucao.ts`.
//
// ============================================================================
// POR QUE AS TRES NUM SO LUGAR, e nao uma leitura por tabela
//
// A pergunta que esta leitura responde e "o sistema esta trabalhando sozinho?",
// e ela nao se divide por qual tabela guarda a resposta. Quem opera nao sabe que
// sao dois motores, nao sabe que um deles e da cobranca e o outro do espelho do
// CRM, e nao deveria precisar saber para conferir se o sistema esta vivo. Uma
// leitura por tabela obrigaria a tela a somar tres respostas — e a somar errado
// no dia em que alguem acrescentasse a quarta automacao e esquecesse a tela.

import { dbt } from '../db/tipado.ts';
import { exigir } from '../db/contexto.ts';
import { CADENCIA, nivelDaRodada, type NivelDaRodada } from '../dominio/agenda.ts';

/** As tres, e a chave e a mesma que a tela usa para escolher a frase. */
export type ChaveDaAutomacao = keyof typeof CADENCIA;

export type UltimaRodada = {
  iniciado_em: Date;
  terminado_em: Date | null;
  status: string;
  /**
   * OS TRES CONTADORES, TRADUZIDOS - e a traducao esta aqui porque ela e
   * diferente em cada automacao, e a tela nao pode ser o lugar onde se lembra
   * disso:
   *
   *   fila de emissao   examinados = vencidos na fila · feitos = registrados no
   *                     banco · falhos = falharam de novo
   *   consulta ativa    examinados = boletos em aberto consultados · feitos =
   *                     baixas aplicadas · falhos = divergencias (o banco diz
   *                     liquidado e o valor nao fecha)
   *   ciclo do CRM      examinados = registros lidos · feitos = criados +
   *                     atualizados · falhos = recusados
   *
   * `feitos` e zero num dia sem trabalho, e zero E UM FATO: uma rodada que nao
   * achou nada e uma rodada que nao aconteceu contam historias opostas, e essa
   * distincao e o arquivo inteiro. Quem separa as duas e `iniciado_em`, nunca o
   * contador.
   */
  examinados: number;
  feitos: number;
  falhos: number;
};

export type Automacao = {
  chave: ChaveDaAutomacao;
  nivel: NivelDaRodada;
  /** A cadencia esperada, em segundos - a tela diz "a cada 5 minutos" a partir
   *  daqui em vez de repetir o numero. */
  intervalo_segundos: number;
  /** `null` quando nao ha rodada nenhuma registrada. */
  ultima: UltimaRodada | null;
  /**
   * ⚠️ CONTADO NO SERVIDOR, DE PROPOSITO. A tela poderia subtrair `iniciado_em`
   * do relogio dela — e o relogio dela e o do computador de quem abriu, que
   * erra minutos, horas e as vezes o fuso inteiro. "Ha 4 dias" e uma afirmacao
   * sobre o sistema, e ela nao pode depender da maquina de quem pergunta.
   */
  ha_quanto_tempo_segundos: number | null;
};

const contagem = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * As tres automacoes, com a ultima rodada de cada uma.
 *
 * A ORDEM E DE CONSEQUENCIA e nao alfabetica: a consulta ativa primeiro porque
 * ela e a unica porta automatica de baixa; a fila depois, porque sem ela o
 * cliente nao recebe boleto; o ciclo por ultimo, porque o espelho velho atrasa
 * cadastro e nao dinheiro.
 */
export async function comoVaoAsAutomacoes(agora: Date = new Date()): Promise<Automacao[]> {
  await exigir('ler');
  const db = dbt();

  /*
   * OS DOIS CONECTORES SAO A PERGUNTA ANTES DA PERGUNTA. Sem conector de
   * cobranca nao ha rodada de agenda a esperar - `agenda_execucao.conector_id` e
   * FK para ele, entao a tabela estaria vazia por construcao, e "vazia" leria
   * como "nunca rodou" numa instalacao que so ainda nao ligou o banco. E o mesmo
   * `sem_conector` da faixa do caminho do dinheiro, pelo mesmo motivo: vermelho
   * permanente e alarme desligado.
   */
  const [cobranca, crm] = await Promise.all([
    db.conector_cobranca.findFirst({ where: { ativo: true }, select: { criado_em: true } }),
    db.conector_crm.findFirst({ where: { ativo: true }, select: { id: true } }),
  ]);

  const ultimaDaTarefa = (tarefa: 'fila_de_emissao' | 'consulta_ativa') =>
    db.agenda_execucao.findFirst({
      where: { tarefa },
      orderBy: [{ iniciado_em: 'desc' }],
      select: {
        iniciado_em: true, terminado_em: true, status: true,
        examinados: true, registrados: true, falhos: true, liquidados: true, divergentes: true,
      },
    });

  const [consulta, fila, ciclo] = await Promise.all([
    ultimaDaTarefa('consulta_ativa'),
    ultimaDaTarefa('fila_de_emissao'),
    db.conector_execucao.findFirst({
      orderBy: [{ iniciado_em: 'desc' }],
      select: {
        iniciado_em: true, terminado_em: true, status: true,
        lidos: true, criados: true, atualizados: true, recusados: true,
      },
    }),
  ]);

  const montar = (
    chave: ChaveDaAutomacao,
    temConector: boolean,
    desde: Date | null,
    linha: { iniciado_em: Date; terminado_em: Date | null; status: string } | null,
    numeros: { examinados: number; feitos: number; falhos: number } | null,
  ): Automacao => {
    const intervalo = CADENCIA[chave];
    return {
      chave,
      intervalo_segundos: intervalo,
      nivel: nivelDaRodada({
        temConector,
        ultima: linha && {
          iniciado_em: linha.iniciado_em, terminado_em: linha.terminado_em, status: String(linha.status),
        },
        desde,
        agora,
        intervaloSegundos: intervalo,
      }),
      ultima: linha && numeros ? {
        iniciado_em: linha.iniciado_em,
        terminado_em: linha.terminado_em,
        status: String(linha.status),
        examinados: numeros.examinados, feitos: numeros.feitos, falhos: numeros.falhos,
      } : null,
      ha_quanto_tempo_segundos: linha
        ? Math.max(0, Math.round((agora.getTime() - linha.iniciado_em.getTime()) / 1000))
        : null,
    };
  };

  return [
    montar('consulta_ativa', cobranca != null, cobranca?.criado_em ?? null, consulta,
           consulta && {
             examinados: contagem(consulta.examinados),
             feitos: contagem(consulta.liquidados),
             falhos: contagem(consulta.divergentes),
           }),
    montar('fila_de_emissao', cobranca != null, cobranca?.criado_em ?? null, fila,
           fila && {
             examinados: contagem(fila.examinados),
             feitos: contagem(fila.registrados),
             falhos: contagem(fila.falhos),
           }),
    /* O `conector_crm` nao guarda `criado_em`, entao o piso e `null` - e a
     * consequencia esta declarada: um CRM ligado agora acusa "nunca rodou" por
     * ate 25 minutos, ate o primeiro ciclo. Alarme verdadeiro e cedo demais e
     * melhor que a alternativa, que seria inventar uma data. */
    montar('ciclo_do_crm', crm != null, null, ciclo,
           ciclo && {
             examinados: contagem(ciclo.lidos),
             feitos: contagem(ciclo.criados) + contagem(ciclo.atualizados),
             falhos: contagem(ciclo.recusados),
           }),
  ];
}
