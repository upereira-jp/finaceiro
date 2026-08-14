// Repositorio de liquidacao. O EVENTO DE CAIXA, e o unico gatilho do split.
//
// PRD 5.2: "o split roda exclusivamente na liquidacao, por webhook Sicoob ou
// baixa via conciliacao. NUNCA na emissao." A PAUTA-contador 1 confirmou o eixo
// ao separar as duas coisas - a competencia governa a receita, o caixa governa a
// reparticao -, e e por isso que a receita nasce em fatura.emitida_em e o
// dinheiro se reparte aqui.
//
// A ORDEM DAS TRES ESCRITAS NAO E ARBITRARIA, e inverter qualquer uma quebra:
//
//   1. juros e multa vao para a FATURA          <- muda `valor_total_centavos`,
//                                                  que e coluna GERADA
//   2. a liquidacao entra                       <- a constraint
//                                                  `liquidacao_pelo_total` confere
//                                                  o valor contra esse total novo
//   3. a fatura vira `paga` e o split roda       <- na mesma transacao
//
// Inverter 1 e 2 faz a baixa com juros ser recusada pela propria constraint que
// existe para proteger a baixa sem juros. Foi a primeira coisa que quebrou ao
// escrever isto, e fica registrada aqui para nao se redescobrir.

import { dbt } from '../db/tipado.ts';
import { db, tenantCorrente, exigir } from '../db/contexto.ts';
import { exigirCentavos, emReais, type Centavos } from '../dominio/centavos.ts';
import * as split from './split.ts';
import type { origem_liquidacao as OrigemLiquidacao } from '../generated/prisma/enums.ts';

export class FaturaNaoLiquidavel extends Error {
  readonly status = 409;
  constructor(status: string) {
    super(
      `Fatura em "${status}" nao pode ser liquidada. So emitida ou vencida: rascunho ainda ` +
      'nao foi cobrada, cancelada nao existe mais, e paga ja entrou - o unico por fatura ' +
      'impede a segunda baixa antes de qualquer regra da aplicacao.'
    );
    this.name = 'FaturaNaoLiquidavel';
  }
}

export class ValorNaoConfere extends Error {
  readonly status = 422;
  constructor(recebido: Centavos, total: Centavos) {
    super(
      `A baixa trouxe ${emReais(recebido)} e o titulo vale ${emReais(total)}. O PRD 5.2 nao ` +
      'aceita pagamento parcial: boleto registrado liquida pelo valor cheio. Se o banco ' +
      'informou juros ou multa, mande-os em juros_centavos/multa_centavos - eles entram no ' +
      'total antes da conferencia.'
    );
    this.name = 'ValorNaoConfere';
  }
}

export type Baixa = {
  fatura_id: string;
  data_liquidacao: Date;
  valor_liquidado_centavos: Centavos;
  juros_centavos?: Centavos;
  multa_centavos?: Centavos;
  origem: OrigemLiquidacao;
  /** Idempotencia do canal automatico: o id do evento na origem. Nulo em baixa
   *  manual, e nulo nao conflita com nulo no unico (NULLS DISTINCT). */
  id_externo?: string | null;
  observacao?: string | null;
};

export type ResultadoDaBaixa = {
  liquidacao_id: string;
  ja_existia: boolean;
  /* `contas_a_pagar` entrou em 03/08 com a Q-PAGAMENTO-01: o split passou a
   * provisionar a despesa na mesma transacao (PRD 5.5 itens 2 e 3), e quem
   * da a baixa precisa VER que isso aconteceu - um numero que volta zero e a
   * unica forma de "provisionou nada" chegar a alguem. Nulo na releitura de
   * uma baixa que ja existia, onde nao houve provisionamento agora. */
  split: { split_execucao_id: string; itens: number; contas_a_pagar: number | null } | null;
  /** Preenchido quando a baixa entrou mas o split nao pode rodar. Nao e recusa:
   *  o dinheiro entrou e o titulo esta pago. E divergencia - gravada, e alguem
   *  precisa olhar. Mesma distincao do RESUMO-SESSAO-9 2. */
  split_bloqueado: string | null;
};

/**
 * Baixa a fatura e reparte, na MESMA transacao.
 *
 * "Falha em qualquer parte reverte tudo" (PRD 5.5) - e a transacao e a do
 * withTenant, uma por unidade de trabalho. Nao ha $transaction aqui dentro:
 * abrir transacao dentro de transacao toma conexao nova e NAO herda o contexto
 * de tenant, e a leitura devolveria zero linhas sem erro. E a invariante 10 da
 * SPEC-001, e o ContextoAninhado existe para transformar isso em excecao.
 *
 * EXCECAO DELIBERADA A "reverte tudo": o repasse bloqueado pela R12 - usina sem
 * dono - NAO reverte a baixa. Recusar a entrada de dinheiro porque falta um
 * cadastro deixaria o cliente pagante sem titulo baixado por um problema que
 * nao e dele. A baixa vale, o split fica pendente e o motivo volta no retorno.
 */
export async function baixar(e: Baixa): Promise<ResultadoDaBaixa> {
  await exigir('escrever_carteira');

  const juros = exigirCentavos(e.juros_centavos ?? 0, 'juros_centavos');
  const multa = exigirCentavos(e.multa_centavos ?? 0, 'multa_centavos');
  const recebido = exigirCentavos(e.valor_liquidado_centavos, 'valor_liquidado_centavos');
  if (juros < 0 || multa < 0) throw Object.assign(new RangeError('juros e multa nao sao negativos'), { status: 422 });

  // Idempotencia ANTES de qualquer escrita: o webhook da Sicoob pode repetir, e
  // repetir tem de ser barato e silencioso, nao um 409 que a fila reprocessa.
  if (e.id_externo) {
    const anterior = await dbt().liquidacao.findFirst({
      where: { origem: e.origem, id_externo: e.id_externo },
    });
    if (anterior) {
      const s = await split.porLiquidacao(anterior.id);
      return {
        liquidacao_id: anterior.id,
        ja_existia: true,
        split: s ? { split_execucao_id: s.id, itens: s.split_item.length, contas_a_pagar: null } : null,
        split_bloqueado: null,
      };
    }
  }

  const f = await dbt().fatura.findFirst({ where: { id: e.fatura_id } });
  if (!f) throw Object.assign(new Error('Fatura nao encontrada.'), { status: 404 });
  if (f.status !== 'emitida' && f.status !== 'vencida') throw new FaturaNaoLiquidavel(f.status);

  // 1. juros e multa na fatura, ANTES da baixa - ver o cabecalho.
  if (juros + multa !== f.valor_juros_multa_centavos) {
    await dbt().fatura.updateMany({
      where: { id: e.fatura_id },
      data: { valor_juros_multa_centavos: juros + multa },
    });
  }

  const total = f.valor_consumo_centavos + f.valor_tarifas_concessionaria_centavos + juros + multa;
  if (recebido !== total) throw new ValorNaoConfere(recebido, total);

  // 2. a baixa. A constraint `liquidacao_pelo_total` confere de novo, do lado do
  //    banco: a conferencia acima da a mensagem util, ela e o mecanismo.
  const l = await dbt().liquidacao.create({
    data: {
      tenant_id: tenantCorrente(),
      fatura_id: e.fatura_id,
      data_liquidacao: e.data_liquidacao,
      valor_liquidado_centavos: recebido,
      juros_centavos: juros,
      multa_centavos: multa,
      origem: e.origem,
      id_externo: e.id_externo ?? null,
      observacao: e.observacao ?? null,
    },
  });

  // 3. titulo pago e dinheiro repartido, na mesma transacao.
  await dbt().fatura.updateMany({ where: { id: e.fatura_id }, data: { status: 'paga' } });
  await dbt().boleto.updateMany({
    where: { fatura_id: e.fatura_id, status: { in: ['registrado', 'pendente'] } },
    data: { status: 'liquidado', baixado_em: new Date() },
  });

  try {
    const s = await split.executar(l.id);
    return {
      liquidacao_id: l.id, ja_existia: false,
      split: { split_execucao_id: s.split_execucao_id, itens: s.itens.length, contas_a_pagar: s.contas_a_pagar },
      split_bloqueado: null,
    };
  } catch (err: any) {
    if (err instanceof split.RepasseBloqueado) {
      return { liquidacao_id: l.id, ja_existia: false, split: null, split_bloqueado: err.message };
    }
    throw err;   // qualquer outra falha reverte a transacao inteira (PRD 5.5)
  }
}

/**
 * Roda o split de uma liquidacao que ficou pendente - o caso da R12 acima,
 * depois que a usina ganhou dono.
 *
 * Nao e um segundo caminho de reparticao: chama a mesma funcao, e o unico por
 * liquidacao impede que ela reparta o que ja foi repartido.
 */
export async function repartirPendente(liquidacaoId: string) {
  await exigir('escrever_carteira');
  return split.executar(liquidacaoId);
}

/** As baixas cujo split nao rodou. E a fila de trabalho da R12, e ela e
 *  visivel em vez de ficar implicita numa ausencia de linha. */
export async function pendentesDeSplit() {
  await exigir('ler');
  const r: any[] = await db().$queryRaw`
    SELECT l.id AS liquidacao_id, l.data_liquidacao, l.valor_liquidado_centavos::int,
           f.competencia, u.codigo_geradora, (u.dono_usina_id IS NULL) AS usina_sem_dono
      FROM liquidacao l
      JOIN fatura f ON f.tenant_id = l.tenant_id AND f.id = l.fatura_id
      JOIN usina  u ON u.tenant_id = f.tenant_id AND u.id = f.usina_id
     WHERE NOT EXISTS (SELECT 1 FROM split_execucao s
                        WHERE s.tenant_id = l.tenant_id AND s.liquidacao_id = l.id)
     ORDER BY l.data_liquidacao`;
  return r;
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().liquidacao.findFirst({ where: { id } });
}

export async function porFatura(faturaId: string) {
  await exigir('ler');
  return dbt().liquidacao.findFirst({ where: { fatura_id: faturaId } });
}
