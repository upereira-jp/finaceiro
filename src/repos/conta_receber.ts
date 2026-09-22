// CONTAS A RECEBER — o retrato do caixa a ENTRAR, para a vertente da empresa.
//
// ============================================================================
// POR QUE ESTE REPOSITÓRIO EXISTE, e por que ele não é a tela de emissão
//
// Até 22/09/2026 a pergunta «quanto os clientes ainda devem, ao todo?» só tinha
// resposta POR MÊS: `GET /faturamento/:competencia` lista um mês, e
// `posicao_da_carteira` agrega um mês. Uma fatura de maio que nunca foi paga
// continua sendo dinheiro parado em setembro — e para vê-la era preciso lembrar
// de voltar o seletor para maio. É a maneira mais silenciosa de perder
// justamente o caso antigo, que é o que mais dói.
//
// A vertente da EMPRESA (PRD §4.4) precisa da carteira INTEIRA, por vencimento e
// não por competência: o que venceu, o que vence nos próximos dias, o que entrou.
// É o que um analista financeiro chama de «contas a receber», e é a ponte entre
// os dois funis — a receita nasce no Rateio e vira caixa aqui.
//
// SÓ LEITURA. Cobrar (emitir, pedir boleto, dar baixa) é ato do Rateio e continua
// em `repos/fatura.ts`, `repos/boleto.ts` e `repos/liquidacao.ts`. Um segundo
// caminho de baixa aqui seria a mesma regra em dois lugares.
//
// ============================================================================
// «VENCIDO» É A DATA, NÃO O STATUS
//
// `fatura.status = 'vencida'` é registro de um ATO (`marcarVencidas()`), e a view
// `posicao_da_carteira` decidiu desde 28/07 que nenhum número de tela depende de
// alguém ter clicado. A mesma decisão vale aqui: em aberto é `emitida` ou
// `vencida` SEM liquidação; vencido é em aberto com `vencimento < hoje`.
//
// A fatura `cancelada` não entra (não é a receber nem recebido) e a `rascunho`
// também não (ainda nem foi emitida — é assunto de Pendências).

import { dbt } from '../db/tipado.ts';
import { exigir, db } from '../db/contexto.ts';
import { emSerie } from '../db/em-serie.ts';

/**
 * O TETO, pelo mesmo motivo do teto de `emissaoTravada`: uma leitura de
 * relatório não pode virar uma janela de segundos. Quem trunca DIZ que truncou —
 * `total` vem contado à parte, e a tela fala a diferença. Cinco vezes maior que
 * o da emissão porque esta lista É a carteira em aberto, e uma empresa com 300
 * unidades e dois meses em atraso já passa de 200.
 */
const TETO = 500;

export type TituloAReceber = {
  fatura_id: string;
  /** Número da unidade consumidora — o que quem opera reconhece. */
  unidade: string;
  cliente: string;
  cliente_id: string;
  competencia: Date;
  vencimento: Date;
  emitida_em: Date | null;
  /** `null` só se a coluna gerada vier vazia, o que não acontece em fatura
   *  emitida. Declarado porque o schema permite. */
  valor_total_centavos: number | null;
  status_fatura: string;
  /** `null` quando ninguém pediu o boleto — e a ausência é a informação: uma
   *  fatura sem boleto não tem COMO ser paga, e isso é diferente de atrasada. */
  boleto: { status: string; origem: string; nosso_numero: string | null } | null;
};

export type FaixaAReceber = { titulos: number; centavos: number };

export type ResumoAReceber = {
  em_aberto: FaixaAReceber;
  vencido: FaixaAReceber;
  vence_em_7_dias: FaixaAReceber;
  vence_em_30_dias: FaixaAReceber;
  /** Liquidações dos últimos 30 dias, pela DATA DA LIQUIDAÇÃO — é caixa, não
   *  competência. É o número que responde «quanto entrou este mês». */
  recebido_em_30_dias: FaixaAReceber;
};

export type ContasAReceber = {
  /** O dia em que o servidor contou, `AAAA-MM-DD`. Toda conta de atraso na tela
   *  parte dele, e não do relógio de quem abriu a tela. */
  hoje: string;
  resumo: ResumoAReceber;
  linhas: TituloAReceber[];
  /** Quantos há ao todo — `linhas.length` quando não truncou. */
  total: number;
};

const diaISO = (d: Date): string => d.toISOString().slice(0, 10);
const maisDias = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

/** O centavo agregado é `bigint` no Postgres (ver a nota em `fatura.posicao`), e
 *  `Number` é seguro até noventa trilhões de reais. O que não pode é sair como
 *  `BigInt` no JSON. */
const emNumero = (v: unknown): number => (v == null ? 0 : Number(v));

export async function contasAReceber(agora: Date = new Date()): Promise<ContasAReceber> {
  await exigir('ler');
  const t = dbt();

  const hoje = diaISO(agora);
  const em7 = diaISO(maisDias(agora, 7));
  const em30 = diaISO(maisDias(agora, 30));
  const ha30 = diaISO(maisDias(agora, -30));

  const emAberto = {
    status: { in: ['emitida', 'vencida'] as any },
    liquidacao: { is: null },
  };

  /*
   * QUATRO LEITURAS, EM SÉRIE — `emSerie`, nunca `Promise.all`: dentro da unidade
   * de trabalho há UMA conexão, e o paralelismo seria aparente (ver
   * `src/db/em-serie.ts` e a suíte `CS2`).
   *
   * O resumo é UMA consulta com `FILTER`, e não cinco `aggregate`: são as mesmas
   * linhas contadas de quatro jeitos, e varrê-las uma vez é o que faz esta tela
   * continuar barata quando a carteira tiver mil títulos em aberto.
   */
  const [faixas, recebido, total, linhas] = await emSerie(
    () => db().$queryRaw`
      SELECT count(*)                                                                 AS aberto_n,
             coalesce(sum(f.valor_total_centavos), 0)                                 AS aberto_c,
             count(*) FILTER (WHERE f.vencimento < ${hoje}::date)                      AS vencido_n,
             coalesce(sum(f.valor_total_centavos)
                      FILTER (WHERE f.vencimento < ${hoje}::date), 0)                  AS vencido_c,
             count(*) FILTER (WHERE f.vencimento >= ${hoje}::date
                                AND f.vencimento <= ${em7}::date)                      AS em7_n,
             coalesce(sum(f.valor_total_centavos)
                      FILTER (WHERE f.vencimento >= ${hoje}::date
                                AND f.vencimento <= ${em7}::date), 0)                  AS em7_c,
             count(*) FILTER (WHERE f.vencimento >= ${hoje}::date
                                AND f.vencimento <= ${em30}::date)                     AS em30_n,
             coalesce(sum(f.valor_total_centavos)
                      FILTER (WHERE f.vencimento >= ${hoje}::date
                                AND f.vencimento <= ${em30}::date), 0)                 AS em30_c
        FROM fatura f
        LEFT JOIN liquidacao l ON l.tenant_id = f.tenant_id AND l.fatura_id = f.id
       WHERE f.status IN ('emitida', 'vencida') AND l.id IS NULL` as Promise<any[]>,
    () => db().$queryRaw`
      SELECT count(*) AS n, coalesce(sum(valor_liquidado_centavos), 0) AS c
        FROM liquidacao
       WHERE data_liquidacao > ${ha30}::date AND data_liquidacao <= ${hoje}::date` as Promise<any[]>,
    () => t.fatura.count({ where: emAberto as any }),
    () => t.fatura.findMany({
      where: emAberto as any,
      /* A ORDEM É A DO DINHEIRO PARADO: o vencimento mais antigo primeiro. É o
       * cliente que deve há mais tempo, e é o que a lista existe para não deixar
       * sumir atrás do mês corrente. */
      orderBy: [{ vencimento: 'asc' }],
      take: TETO,
      select: {
        id: true, competencia: true, vencimento: true, emitida_em: true,
        valor_total_centavos: true, status: true,
        unidade_consumidora: { select: { numero_uc: true, cliente: { select: { id: true, nome: true } } } },
        boleto: { select: { status: true, origem: true, nosso_numero: true } },
      },
    }),
  );

  const fx = faixas[0] ?? {};
  const rc = recebido[0] ?? {};
  const faixa = (n: unknown, c: unknown): FaixaAReceber => ({ titulos: emNumero(n), centavos: emNumero(c) });

  return {
    hoje,
    resumo: {
      em_aberto: faixa(fx.aberto_n, fx.aberto_c),
      vencido: faixa(fx.vencido_n, fx.vencido_c),
      vence_em_7_dias: faixa(fx.em7_n, fx.em7_c),
      vence_em_30_dias: faixa(fx.em30_n, fx.em30_c),
      recebido_em_30_dias: faixa(rc.n, rc.c),
    },
    total,
    linhas: linhas.map((f): TituloAReceber => ({
      fatura_id: f.id,
      unidade: f.unidade_consumidora.numero_uc,
      cliente: f.unidade_consumidora.cliente.nome,
      cliente_id: f.unidade_consumidora.cliente.id,
      competencia: f.competencia,
      vencimento: f.vencimento,
      emitida_em: f.emitida_em,
      valor_total_centavos: f.valor_total_centavos,
      status_fatura: String(f.status),
      boleto: f.boleto && {
        status: String(f.boleto.status),
        origem: String(f.boleto.origem),
        nosso_numero: f.boleto.nosso_numero,
      },
    })),
  };
}
