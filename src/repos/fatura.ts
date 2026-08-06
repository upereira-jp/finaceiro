// Repositorio de fatura. O UNICO caminho de escrita da carteira.
//
// ONDE A CONTA ACONTECE, e por que nao aqui. A SPEC-001 R23 poe uma unica
// implementacao da formula do dinheiro em `app.consumo_centavos()`, e a derivada
// dela - quanto credito esta UC recebeu - e uma multiplicacao de `numeric`. As
// duas ficam do lado do SERVIDOR, no proprio INSERT:
//
//     consumo_kwh   = geracao_medida x percentual_rateio / 100
//     valor_consumo = app.consumo_centavos(consumo_kwh, app.tarifa_vigente(...))
//
// Trazer os numeros para o Node, multiplicar e devolver seria passar por
// `number` - float de 64 bits - em tres pontos de uma conta que produz o valor
// cobrado do cliente. O `Decimal` do Prisma resolveria o tipo, nao a duplicacao:
// continuariam existindo duas implementacoes da mesma formula, e a migration 9
// ja registrou por que isso e o problema.
//
// O que este arquivo faz e escolher QUEM entra no lote, e isso e decisao, nao
// aritmetica - mora em src/dominio/faturamento.ts, testavel sem banco.

import { dbt } from '../db/tipado.ts';
import { chavePixPadrao } from './documento.ts';
import { tenantCorrente, exigir, db } from '../db/contexto.ts';
import {
  triar, competencia as normalizar, competenciaISO,
  EXPLICACAO, EXPLICACAO_DO_ALERTA,
  type Candidata, type LinhaCandidata, type MotivoDeRecusa, type Alerta,
} from '../dominio/faturamento.ts';
import { exigirCentavos, emReais, type Centavos } from '../dominio/centavos.ts';

export class FaturaNaoEncontrada extends Error {
  readonly status = 404;
  constructor() { super('Fatura nao encontrada.'); this.name = 'FaturaNaoEncontrada'; }
}

export class TransicaoDeFaturaInvalida extends Error {
  readonly status = 409;
  constructor(de: string, para: string, motivo: string) {
    super(`Fatura em "${de}" nao vai para "${para}": ${motivo}`);
    this.name = 'TransicaoDeFaturaInvalida';
  }
}

export class SemPrecoNaCompetencia extends Error {
  readonly status = 422;
  constructor(distribuidora: string, comp: string) {
    super(
      `Nao ha tarifa vigente de ${distribuidora} na competencia ${comp}. ` +
      'R26: ausencia de preco levanta, nao vira zero - base de faturamento NULL soma como ' +
      'nada e coalesce como zero, e a fatura sairia com valor errado sem erro nenhum.'
    );
    this.name = 'SemPrecoNaCompetencia';
  }
}

export type ResumoDoLote = {
  competencia: string;
  criadas: number;
  recusadas: number;
  /** Contagem por motivo. E o numero que traz problema a tona - foi assim que a
   *  Q-VALOR-01 apareceu no conector, em vez de virar 40 faturas erradas. */
  recusas: Record<string, number>;
  /** Gravadas, e alguem precisa olhar. NAO mexem na contagem de recusas: a
   *  distincao e a mesma do RESUMO-SESSAO-9 2. */
  alertas: Record<string, number>;
  detalhe: Array<{ numero_uc: string; motivo: MotivoDeRecusa; explicacao: string }>;
};

/**
 * As UCs candidatas da competencia, com tudo que a triagem precisa, numa
 * consulta so.
 *
 * `c.uc_vigente = uc.id AND c.status = 'ativo'` e nao `c.unidade_consumidora_id`:
 * `uc_vigente` e a coluna gerada da R14 e o unico garante que ha no maximo uma
 * linha por UC. O `status = 'ativo'` estreita para o que fatura - contrato
 * SUSPENSO ocupa a UC (R14-b) mas tem o rateio pausado, e faturar rateio pausado
 * cobraria credito que o cliente nao esta recebendo.
 *
 * O filtro por tenant sai da RLS e nao de um WHERE escrito aqui. Os
 * `tenant_id = tenant_id` nos JOINs existem por outro motivo: sem eles o
 * planejador junta linhas de tenants diferentes ANTES de a policy filtrar, e o
 * resultado e correto mas o plano e ruim.
 */
async function candidatas(comp: Date): Promise<LinhaCandidata[]> {
  const iso = competenciaISO(comp);
  const r: any[] = await db().$queryRaw`
    SELECT uc.id                       AS unidade_consumidora_id,
           uc.numero_uc,
           uc.usina_id,
           uc.percentual_rateio::text  AS percentual_rateio,
           uc.data_vencimento,
           c.id                        AS contrato_id,
           c.data_fechamento,
           u.dono_usina_id,
           g.geracao_kwh::text         AS geracao_kwh,
           uc.rateio_situacao,
           uc.crm_usina_cliente_id,
           (f.id IS NOT NULL)          AS ja_tem_fatura
      FROM unidade_consumidora uc
      LEFT JOIN contrato c
             ON c.tenant_id = uc.tenant_id AND c.uc_vigente = uc.id AND c.status = 'ativo'
      LEFT JOIN usina u
             ON u.tenant_id = uc.tenant_id AND u.id = uc.usina_id
      LEFT JOIN usina_geracao g
             ON g.tenant_id = uc.tenant_id AND g.usina_id = uc.usina_id
            AND g.competencia = ${iso}::date
      LEFT JOIN fatura f
             ON f.tenant_id = uc.tenant_id AND f.unidade_consumidora_id = uc.id
            AND f.competencia_faturada = ${iso}::date
     WHERE uc.status = 'ativa'
     ORDER BY uc.numero_uc`;
  return r as LinhaCandidata[];
}

/**
 * ENSAIO. Roda a triagem e nao escreve nada.
 *
 * Existe pelo mesmo motivo do `--ensaio` do conector: um lote de faturamento
 * toca a carteira inteira, e a primeira execucao de qualquer coisa que emite
 * cobranca deve poder ser olhada antes de existir. O `scripts/ciclo-crm.ts`
 * exige `--ensaio` ou `--valendo` sem default, e pela mesma razao.
 */
export async function ensaiarLote(comp: Date | string): Promise<ResumoDoLote> {
  await exigir('ler');
  const c = normalizar(comp);
  const triadas = (await candidatas(c)).map((l) => triar(l, c));
  return resumir(c, triadas, 0);
}

function resumir(c: Date, triadas: Candidata[], criadas: number): ResumoDoLote {
  const recusas: Record<string, number> = {};
  const alertas: Record<string, number> = {};
  const detalhe: ResumoDoLote['detalhe'] = [];

  for (const t of triadas) {
    if (t.faturar) {
      for (const a of t.alertas) alertas[a] = (alertas[a] ?? 0) + 1;
    } else {
      recusas[t.motivo] = (recusas[t.motivo] ?? 0) + 1;
      detalhe.push({ numero_uc: t.numero_uc, motivo: t.motivo, explicacao: EXPLICACAO[t.motivo] });
    }
  }
  return {
    competencia: competenciaISO(c),
    criadas,
    recusadas: triadas.filter((t) => !t.faturar).length,
    recusas, alertas, detalhe,
  };
}

/**
 * VALENDO. Compoe as faturas da competencia, em RASCUNHO.
 *
 * Rascunho e nao emitida de proposito: compor e conferir sao dois atos, e o PRD
 * 9 pede a tela "import -> conferencia -> emissao em lote" nessa ordem. Fatura
 * em rascunho nao tem boleto, nao entra no a receber e some sem rastro
 * financeiro se for cancelada.
 *
 * TUDO NUMA TRANSACAO SO - a do withTenant. Um lote meio-criado deixaria parte
 * da carteira faturada e parte nao, e o unico por competencia faria a segunda
 * tentativa pular exatamente as que deram certo, escondendo o erro.
 */
export async function comporLote(
  comp: Date | string,
  opcoes: { tarifas_concessionaria_centavos?: Record<string, Centavos> } = {},
): Promise<ResumoDoLote> {
  await exigir('escrever_carteira');
  const c = normalizar(comp);
  const iso = competenciaISO(c);
  const tenant = tenantCorrente();
  const triadas = (await candidatas(c)).map((l) => triar(l, c));

  /*
   * A CHAVE PIX E CARIMBADA AQUI, uma vez para o lote inteiro (migration 25).
   *
   * Ela vem da chave PADRAO do tenant, e `null` e legitimo - tenant sem Pix
   * cadastrado compoe, emite e cobra; o que ele nao tem e faixa de pagamento, e
   * o documento diz isso com motivo em vez de sair com um QR que nao resolve.
   *
   * POR QUE CARIMBAR NA COMPOSICAO E NAO LER NA HORA DE IMPRIMIR: a segunda via
   * tem de sair identica a primeira. Ler o padrao no momento da impressao faria
   * o destino mudar quando alguem trocasse a chave padrao - sem erro e sem log,
   * e com o cliente segurando dois papeis com QRs diferentes para a mesma
   * divida. Depois de emitida o gatilho `fatura_chave_pix_congelada` impede a
   * troca; entre compor e emitir ela ainda e livre, de proposito.
   */
  const chavePadrao = await chavePixPadrao();

  let criadas = 0;
  for (const t of triadas) {
    if (!t.faturar) continue;
    const tarifas = opcoes.tarifas_concessionaria_centavos?.[t.unidade_consumidora_id] ?? 0;
    exigirCentavos(tarifas, `tarifas_concessionaria_centavos[${t.unidade_consumidora_id}]`);

    /*
     * Os cinco numeros da fatura saem daqui, e os cinco vem do SERVIDOR. A
     * subconsulta de geracao e a de tarifa sao reavaliadas dentro do INSERT em
     * vez de virem da triagem: a triagem decidiu QUEM entra, e um valor lido no
     * Node e reescrito no banco e um valor que passou por float sem precisar.
     */
    try {
      await db().$executeRaw`
        INSERT INTO fatura (
          tenant_id, contrato_id, unidade_consumidora_id, usina_id, competencia,
          geracao_kwh_competencia, percentual_rateio_aplicado, consumo_kwh, tarifa_reais_por_kwh,
          valor_consumo_centavos, valor_tarifas_concessionaria_centavos,
          flag_fatura_cheia, vencimento, status, chave_pix_id)
        SELECT ${tenant}::uuid,
               ${t.contrato_id}::uuid,
               uc.id,
               uc.usina_id,
               ${iso}::date,
               g.geracao_kwh,
               uc.percentual_rateio,
               g.geracao_kwh * uc.percentual_rateio / 100,
               app.tarifa_vigente(uc.distribuidora, ${iso}::date),
               app.consumo_centavos(
                 g.geracao_kwh * uc.percentual_rateio / 100,
                 app.tarifa_vigente(uc.distribuidora, ${iso}::date)),
               ${tarifas}::integer,
               ${t.flag_fatura_cheia}::boolean,
               ${t.vencimento.toISOString().slice(0, 10)}::date,
               'rascunho',
               ${chavePadrao?.id ?? null}::uuid
          FROM unidade_consumidora uc
          JOIN usina_geracao g
            ON g.tenant_id = uc.tenant_id AND g.usina_id = uc.usina_id
           AND g.competencia = ${iso}::date
         WHERE uc.id = ${t.unidade_consumidora_id}::uuid`;
      criadas += 1;
    } catch (err: any) {
      // R26 chegando pelo caminho da tarifa. A mensagem crua do Postgres diz
      // "no_data_found" e nao diz que faturamento parou - esta diz.
      if (err?.meta?.code === '02000' || /sem tarifa vigente/.test(String(err?.message))) {
        throw new SemPrecoNaCompetencia('a distribuidora da UC', iso);
      }
      throw err;
    }
  }

  return resumir(c, triadas, criadas);
}

/**
 * Rascunho -> emitida. E o fato gerador da RECEITA (PAUTA-contador 1:
 * competencia governa a receita), e por isso `emitida_em` e carimbado aqui e em
 * lugar nenhum mais.
 *
 * Nao emite boleto: isso e da porta Sicoob, e o motor de faturamento nao conhece
 * HTTP. Emitir e reservar o numero da cobranca sao atos separaveis, e separa-los
 * e o que permite a fila de retentativa do PRD 6 sem reemitir fatura.
 */
export async function emitir(id: string) {
  await exigir('escrever_carteira');
  const r = await dbt().fatura.updateMany({
    where: { id, status: 'rascunho' },
    data: { status: 'emitida', emitida_em: new Date() },
  });
  if (r.count === 0) {
    const f = await porId(id);
    if (!f) throw new FaturaNaoEncontrada();
    throw new TransicaoDeFaturaInvalida(f.status, 'emitida', 'so rascunho pode ser emitida');
  }
  return porId(id);
}

export async function emitirLote(comp: Date | string): Promise<{ emitidas: number }> {
  await exigir('escrever_carteira');
  const iso = competenciaISO(normalizar(comp));
  const r = await dbt().fatura.updateMany({
    where: { competencia: new Date(`${iso}T00:00:00Z`), status: 'rascunho' },
    data: { status: 'emitida', emitida_em: new Date() },
  });
  return { emitidas: r.count };
}

/**
 * Cancelamento. Fatura LIQUIDADA nao cancela - o dinheiro entrou, e desfazer o
 * documento sem desfazer o caixa e como o estorno de receita fica invisivel.
 * Reverter uma liquidacao e outro ato, com outro nome, e nao existe ainda:
 * Q-ESTORNO-01.
 *
 * O motivo e obrigatorio. Cancelamento sem motivo e a linha de auditoria que
 * nao responde "o que" - e a regra 9 pede quem, quando, O QUE, antes e depois.
 */
export async function cancelar(id: string, motivo: string) {
  await exigir('escrever_carteira');
  const texto = motivo?.trim();
  if (!texto) throw Object.assign(new TypeError('motivo do cancelamento e obrigatorio'), { status: 422 });

  const liquidada = await dbt().liquidacao.findFirst({ where: { fatura_id: id } });
  if (liquidada) {
    throw new TransicaoDeFaturaInvalida('paga', 'cancelada',
      'a fatura ja foi liquidada. Cancelar o documento sem desfazer o caixa deixaria ' +
      'o dinheiro sem titulo - reverter liquidacao e outro ato (Q-ESTORNO-01)');
  }

  const r = await dbt().fatura.updateMany({
    where: { id, status: { in: ['rascunho', 'emitida', 'vencida'] } },
    data: { status: 'cancelada', cancelada_em: new Date(), motivo_cancelamento: texto },
  });
  if (r.count === 0) {
    const f = await porId(id);
    if (!f) throw new FaturaNaoEncontrada();
    throw new TransicaoDeFaturaInvalida(f.status, 'cancelada', 'estado nao permite cancelamento');
  }
}

/**
 * Marca como vencida o que passou do vencimento e nao foi pago. Idempotente.
 *
 * NAO e um cron escondido no repositorio: e chamada explicita, porque "hoje"
 * dentro de uma consulta transforma o resultado do relatorio na hora em que ele
 * roda. A `posicao_da_carteira` calcula `vencidas_em_aberto` sem depender disto
 * - a coluna `status` e o registro do ato, a view e a leitura do fato.
 */
export async function marcarVencidas(): Promise<{ vencidas: number }> {
  await exigir('escrever_carteira');
  const r: number = await db().$executeRaw`
    UPDATE fatura f SET status = 'vencida'
     WHERE f.status = 'emitida'
       AND f.vencimento < current_date
       AND NOT EXISTS (SELECT 1 FROM liquidacao l
                        WHERE l.tenant_id = f.tenant_id AND l.fatura_id = f.id)`;
  return { vencidas: Number(r) };
}

/**
 * Lancamento das tarifas da concessionaria (PRD 5.1: planilha ou lancamento
 * manual, nao ha API da distribuidora). So em RASCUNHO: depois de emitida, o
 * total mudou e o boleto ja foi registrado com o valor antigo.
 */
export async function lancarTarifasDaConcessionaria(id: string, centavos: Centavos) {
  await exigir('escrever_carteira');
  exigirCentavos(centavos, 'valor_tarifas_concessionaria_centavos');
  if (centavos < 0) throw Object.assign(new RangeError('tarifa da concessionaria nao e negativa'), { status: 422 });

  const r = await dbt().fatura.updateMany({
    where: { id, status: 'rascunho' },
    data: { valor_tarifas_concessionaria_centavos: centavos },
  });
  if (r.count === 0) {
    const f = await porId(id);
    if (!f) throw new FaturaNaoEncontrada();
    throw new TransicaoDeFaturaInvalida(f.status, f.status,
      'as tarifas da concessionaria so entram em rascunho: emitida, o boleto ja carrega o total');
  }
}

export type ResultadoDoLancamento = {
  competencia: string;
  aplicadas: Array<{ numero_uc: string; fatura_id: string; centavos: Centavos }>;
  /** UC que veio na planilha e NAO tem fatura em rascunho nesta competencia.
   *  Pode ser UC que nao entrou no lote, fatura ja emitida, ou numero errado. */
  sem_fatura: Array<{ numero_uc: string; centavos: Centavos; porque: string }>;
  /** Fatura em rascunho que a planilha NAO cobriu. AUSENTE NAO E ZERO: ela fica
   *  com o valor que ja tinha, e a lista existe para alguem decidir. */
  sem_valor: Array<{ numero_uc: string; fatura_id: string; centavos_atuais: Centavos }>;
};

/**
 * Lancamento EM LOTE das tarifas da concessionaria, por numero de UC.
 *
 * `Q-TARIFA-CONC-01`. A rota unitaria (`PUT /faturas/:id/tarifas-concessionaria`)
 * pede o id da FATURA, e ninguem tem id de fatura na mao - a planilha da
 * distribuidora traz numero de UC. Sem esta funcao, "por planilha" (PRD §5.1)
 * significava alguem abrindo uma fatura por vez na tela.
 *
 * SO EM RASCUNHO, pela mesma razao da funcao unitaria: depois de emitida o total
 * mudou e o boleto ja foi registrado com o valor antigo. A diferenca e que aqui a
 * fatura fora de rascunho vira LINHA DE RELATORIO em vez de excecao - um lote de
 * 40 nao pode parar na oitava e deixar sete gravadas.
 *
 * A CONFERENCIA DO INTEIRO E POR ITEM, antes de qualquer escrita: `exigirCentavos`
 * em todos, e so depois o primeiro UPDATE. Um float que atravessasse a planilha
 * derrubaria o lote no meio, com parte gravada.
 */
export async function lancarTarifasPorUC(
  comp: Date | string,
  porUC: ReadonlyMap<string, Centavos>,
): Promise<ResultadoDoLancamento> {
  await exigir('escrever_carteira');
  const iso = competenciaISO(normalizar(comp));

  for (const [uc, c] of porUC) {
    exigirCentavos(c, `valor_tarifas_concessionaria_centavos[UC ${uc}]`);
    if (c < 0) throw Object.assign(new RangeError(`UC ${uc}: tarifa da concessionaria nao e negativa`), { status: 422 });
  }

  /*
   * As faturas da competencia COM o numero da UC. O join e necessario porque a
   * fatura guarda `unidade_consumidora_id` e a planilha traz `numero_uc` - e o
   * numero e o que a distribuidora conhece.
   */
  const faturas: Array<{ fatura_id: string; numero_uc: string; status: string; atuais: number }> =
    await db().$queryRaw`
      SELECT f.id AS fatura_id, uc.numero_uc, f.status::text,
             f.valor_tarifas_concessionaria_centavos AS atuais
        FROM fatura f
        JOIN unidade_consumidora uc
          ON uc.tenant_id = f.tenant_id AND uc.id = f.unidade_consumidora_id
       WHERE f.competencia = ${iso}::date`;

  const porNumero = new Map(faturas.map((f) => [f.numero_uc, f]));
  const r: ResultadoDoLancamento = { competencia: iso, aplicadas: [], sem_fatura: [], sem_valor: [] };

  for (const [numero_uc, centavos] of porUC) {
    const f = porNumero.get(numero_uc);
    if (!f) {
      r.sem_fatura.push({ numero_uc, centavos, porque: `nao ha fatura na competencia ${iso} para esta UC` });
      continue;
    }
    if (f.status !== 'rascunho') {
      r.sem_fatura.push({
        numero_uc, centavos,
        porque: `a fatura esta em "${f.status}" e as tarifas so entram em rascunho - emitida, o boleto ja carrega o total`,
      });
      continue;
    }
    await dbt().fatura.updateMany({
      where: { id: f.fatura_id, status: 'rascunho' },
      data: { valor_tarifas_concessionaria_centavos: centavos },
    });
    r.aplicadas.push({ numero_uc, fatura_id: f.fatura_id, centavos });
  }

  // O outro lado da conta, e ele so existe porque ausente nao e zero.
  for (const f of faturas) {
    if (f.status !== 'rascunho') continue;
    if (porUC.has(f.numero_uc)) continue;
    r.sem_valor.push({ numero_uc: f.numero_uc, fatura_id: f.fatura_id, centavos_atuais: f.atuais });
  }

  return r;
}

// ---------------------------------------------------------------- leitura

export async function porId(id: string) {
  await exigir('ler');
  return dbt().fatura.findFirst({ where: { id } });
}

export async function daCompetencia(comp: Date | string, opcoes: { limite?: number } = {}) {
  await exigir('ler');
  const iso = competenciaISO(normalizar(comp));
  return dbt().fatura.findMany({
    where: { competencia: new Date(`${iso}T00:00:00Z`) },
    orderBy: [{ vencimento: 'asc' }],
    take: Math.min(opcoes.limite ?? 500, 2000),
  });
}

export async function daUnidadeConsumidora(unidadeConsumidoraId: string, limite = 24) {
  await exigir('ler');
  return dbt().fatura.findMany({
    where: { unidade_consumidora_id: unidadeConsumidoraId },
    orderBy: [{ competencia: 'desc' }],
    take: Math.min(limite, 120),
  });
}

/** A `posicao_da_carteira` - view, e por isso $queryRaw: o generator nao tem o
 *  preview de `views` ligado. Ela declara security_invoker (invariante 13). */
export async function posicao(comp?: Date | string) {
  await exigir('ler');
  const iso = comp ? competenciaISO(normalizar(comp)) : null;
  const r: any[] = await db().$queryRaw`
    SELECT competencia, faturas::int, emitidas::int, liquidadas::int, vencidas_em_aberto::int,
           faturado_centavos::int, recebido_centavos::int, a_receber_centavos::int
      FROM posicao_da_carteira
     WHERE (${iso}::date IS NULL OR competencia = ${iso}::date)
     ORDER BY competencia DESC`;
  return r;
}

/** RATEIO-USO-01, o lado "quanto JA FOI usada". Com a base sendo a geracao
 *  medida, `saldo_kwh` negativo e impossivel por construcao - se aparecer, a
 *  composicao foi contornada por outro caminho. */
export async function usoDasUsinas(comp?: Date | string) {
  await exigir('ler');
  const iso = comp ? competenciaISO(normalizar(comp)) : null;
  const r: any[] = await db().$queryRaw`
    SELECT codigo_geradora, competencia, geracao_kwh::text, consumo_faturado_kwh::text, saldo_kwh::text
      FROM uso_da_usina_por_competencia
     WHERE (${iso}::date IS NULL OR competencia = ${iso}::date)
     ORDER BY competencia DESC, codigo_geradora`;
  return r;
}

export { EXPLICACAO, EXPLICACAO_DO_ALERTA, emReais };
export type { MotivoDeRecusa, Alerta };
