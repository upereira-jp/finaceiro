// O QUE NAO CHEGOU AO BANCO — a lista que faltava, e ela SO LE.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 10/09/2026
//
// O levantamento *"o que falta para o sistema rodar sozinho"* escreveu, no §5.2:
//
//   "O erro aparece POR FATURA, uma de cada vez. Com 29 unidades, descobrir que
//    4 estao retentando exige abrir 29. E a fila nunca desiste sozinha — de
//    proposito —, entao um boleto pode retentar por semanas sem ninguem notar."
//
// A frase estava certa e era menor que o problema. Ao medir para escrever a
// leitura, apareceu um segundo caminho para a MESMA ausencia, e ele nao passa
// pela fila em momento nenhum:
//
//   `emitir()` NAO cria linha de boleto — esta escrito la, e e deliberado
//   ("emitir e reservar o numero da cobranca sao atos separaveis"). Quem cria a
//   linha e `registrar()`, e quem chama `registrar()` e o botao de UMA fatura.
//   `filaDeEmissao` so enxerga linha que EXISTE.
//
// Entao a fatura emitida em que ninguem clicou nao esta em erro, nao esta
// atrasada e nao esta em fila nenhuma: ela nao vira cobranca, e o unico sinal
// disso e um painel fechado numa linha de tabela. Para quem espera o dinheiro os
// dois casos sao um so — o cliente nao recebeu nada — e por isso os dois estao
// nesta lista. Uma lista que so mostrasse a fila esconderia justamente o caso
// que a fila nao cobre.
//
// SO LE, e nao vai escrever: quem escreve boleto e `repos/boleto.ts`, num
// caminho unico que ja carrega a memoria da falha. Um segundo escritor criaria
// duas versoes da mesma historia. Mesma disciplina de `repos/automacoes.ts`.
//
// ============================================================================
// POR QUE E UMA LEITURA SO, e nao uma por nivel
//
// A pergunta de quem opera e "quem ainda nao recebeu cobranca?", e ela nao se
// divide por qual tabela guarda a resposta. Quem le nao sabe o que e fila, nao
// sabe que existe uma linha de boleto separada da fatura, e nao deveria precisar
// saber para conferir se o mes inteiro saiu.

import { dbt } from '../db/tipado.ts';
import { exigir } from '../db/contexto.ts';
import { nivelDaEmissao, emissaoPedeGente, type NivelDaEmissao } from '../dominio/agenda.ts';

/**
 * O TETO, e ele existe pelo mesmo motivo do teto da rodada: uma leitura de
 * relatorio nao pode virar uma janela de segundos. Quem trunca DIZ que truncou —
 * `total` vem contado a parte, e a tela fala a diferenca. "Mostrei tudo" e
 * "mostrei os 200 primeiros" nao podem ter a mesma cara.
 */
const TETO = 200;

export type LinhaDaEmissao = {
  fatura_id: string;
  /** Numero da unidade consumidora — e o que quem opera reconhece. */
  unidade: string;
  cliente: string;
  competencia: Date;
  vencimento: Date;
  /** `null` so se a coluna gerada vier vazia, o que nao acontece em fatura
   *  emitida. Declarado porque o schema permite. */
  valor_total_centavos: number | null;
  status_fatura: string;
  nivel: NivelDaEmissao;
  /** `true` para os tres niveis que nao se resolvem sozinhos. Vem do dominio, e
   *  nao de uma segunda lista escrita na tela. */
  pede_gente: boolean;
  /**
   * ⚠️ CONTADO NO SERVIDOR, pela mesma razao de `ha_quanto_tempo_segundos` das
   * automacoes: "ha 3 dias sem cobranca" e uma afirmacao sobre o sistema, e ela
   * nao pode depender do relogio da maquina de quem abriu a tela.
   *
   * Conta desde a PRIMEIRA tentativa quando ha linha de boleto (`criado_em`
   * nasce imediatamente antes da primeira chamada ao banco), e desde a EMISSAO
   * quando nao ha. Nos dois casos responde a mesma pergunta: ha quanto tempo
   * este cliente esta sem cobranca por causa disto.
   */
  ha_quanto_tempo_segundos: number | null;
  /** `null` quando ninguem pediu o boleto — e a ausencia e a informacao. */
  boleto: {
    status: string;
    tentativas: number;
    /** O que o banco respondeu na ultima tentativa. Cru: a traducao para frase
     *  de tela e da camada de cima, que tem suite para as frases. */
    ultimo_erro: string | null;
    ultima_tentativa_em: Date | null;
    proxima_tentativa_em: Date | null;
  } | null;
};

export type EmissaoTravada = {
  linhas: LinhaDaEmissao[];
  /** Quantas ha ao todo — `linhas.length` quando nao truncou. */
  total: number;
  /** Quantas pedem gente. Vem contado do servidor porque e o numero que a faixa
   *  de alarme usa, e somar na tela seria a segunda implementacao da regra. */
  pedem_gente: number;
};

/**
 * As faturas emitidas cuja cobranca nao chegou ao banco.
 *
 * O FILTRO DE BOLETO E O MESMO DA FILA (`pendente` e `erro`), e a coincidencia e
 * proposital: `registrado`, `liquidado`, `baixado` e `cancelado` sao desfechos —
 * o boleto chegou la, e o que acontece depois e assunto de outra tela. Listar um
 * boleto `registrado` aqui faria a lista crescer com o trabalho FEITO, que e a
 * maneira mais rapida de treinar alguem a nao olhar para ela.
 *
 * A fatura `cancelada` nao entra, e a `rascunho` tambem nao: uma nao se cobra
 * mais, a outra ainda nem foi emitida. `vencida` ENTRA, e ela e o motivo de
 * `parado` existir — ver `nivelDaEmissao`.
 */
export async function emissaoTravada(agora: Date = new Date()): Promise<EmissaoTravada> {
  await exigir('ler');
  const db = dbt();

  const onde = {
    status: { in: ['emitida', 'vencida'] as any },
    OR: [
      { boleto: { is: null } },
      { boleto: { status: { in: ['pendente', 'erro'] as any } } },
    ],
  };

  const [total, linhas] = await Promise.all([
    db.fatura.count({ where: onde as any }),
    db.fatura.findMany({
      where: onde as any,
      /* A ORDEM E A DO DINHEIRO PARADO: o vencimento mais antigo primeiro, que e
       * o cliente ha mais tempo sem receber cobranca. Ordenar por nivel poria em
       * cima o que grita mais alto, e nao o que dói ha mais tempo. */
      orderBy: [{ vencimento: 'asc' }],
      take: TETO,
      select: {
        id: true, competencia: true, vencimento: true, valor_total_centavos: true,
        status: true, emitida_em: true,
        unidade_consumidora: { select: { numero_uc: true, cliente: { select: { nome: true } } } },
        boleto: {
          select: {
            status: true, tentativas: true, ultimo_erro: true,
            criado_em: true, ultima_tentativa_em: true, proxima_tentativa_em: true,
          },
        },
      },
    }),
  ]);

  const montadas = linhas.map((f): LinhaDaEmissao => {
    const b = f.boleto;
    const nivel = nivelDaEmissao({
      statusDaFatura: String(f.status),
      emitidaEm: f.emitida_em,
      boleto: b && { status: String(b.status), tentativas: b.tentativas, criado_em: b.criado_em },
      agora,
    });
    const desde = b ? b.criado_em : f.emitida_em;
    return {
      fatura_id: f.id,
      unidade: f.unidade_consumidora.numero_uc,
      cliente: f.unidade_consumidora.cliente.nome,
      competencia: f.competencia,
      vencimento: f.vencimento,
      valor_total_centavos: f.valor_total_centavos,
      status_fatura: String(f.status),
      nivel,
      pede_gente: emissaoPedeGente(nivel),
      ha_quanto_tempo_segundos: desde
        ? Math.max(0, Math.round((agora.getTime() - desde.getTime()) / 1000))
        : null,
      boleto: b && {
        status: String(b.status),
        tentativas: b.tentativas,
        ultimo_erro: b.ultimo_erro,
        ultima_tentativa_em: b.ultima_tentativa_em,
        proxima_tentativa_em: b.proxima_tentativa_em,
      },
    };
  });

  /*
   * `pedem_gente` conta o QUE VEIO, e nao o total do banco. A diferenca aparece
   * so quando truncou, e a tela diz que truncou — inventar aqui uma contagem
   * sobre o que nao foi lido seria afirmar sobre linhas que ninguem classificou.
   */
  return { linhas: montadas, total, pedem_gente: montadas.filter((l) => l.pede_gente).length };
}
