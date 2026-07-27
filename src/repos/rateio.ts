// Repositorio de rateio - R11, o teto de 100% por usina.
//
// POR QUE ELE E SEPARADO DE unidade_consumidora.ts: `usina_id` e
// `percentual_rateio` sao colunas da UC, mas escrever nelas tem regra propria e
// uma constraint trigger atras. Um so caminho de escrita, um so lugar que
// confere o teto.
//
// A ASSIMETRIA DA R11 E DELIBERADA e vem do dado real: ACIMA de 100% o banco
// rejeita, ABAIXO passa. Hoje duas usinas reais somam 91,20% e 99,78% - bloquear
// abaixo pararia a operacao. Passar acima alocaria credito que nao existe, e ai
// o erro sai em fatura.
//
// O PONTO QUE CUSTA CARO SE FOR IGNORADO: a constraint trigger e DEFERRABLE
// INITIALLY DEFERRED. Ela protege no COMMIT, nao na linha. Quem escreve e le o
// proprio resultado antes de commitar VE o estado invalido, e a transacao inteira
// aborta depois - longe da linha que causou. Por isso definirRateio() confere a
// view logo apos escrever: transforma um abort de commit sem autor num erro de
// negocio com o numero da UC.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';

/** Situacao calculada pela view. 'com_folga' NAO e erro - ver o cabecalho. */
export type SituacaoDoRateio = 'acima_do_teto' | 'completo' | 'com_folga';

export type RateioDaUsina = {
  usina_id: string;
  codigo_geradora: string;
  ucs: number;
  /** numeric do Postgres chega como STRING. Nao converta para number: a regra 1
   *  proibe float em calculo, e 0.1+0.2 continua nao dando 0.3 aqui tambem. */
  percentual_alocado: string;
  percentual_livre: string;
  situacao: SituacaoDoRateio;
};

export class RateioAcimaDoTeto extends Error {
  readonly status = 422;
  constructor(codigoGeradora: string, alocado: string) {
    super(
      `R11: o rateio da usina ${codigoGeradora} passaria a somar ${alocado}%, acima ` +
      'do teto de 100. Isso alocaria credito que a usina nao gera. Reduza o ' +
      'percentual de outra UC antes, ou diminua este.'
    );
    this.name = 'RateioAcimaDoTeto';
  }
}

/** CLAUDE.md 1: percentual mantem escala decimal e entra como string. */
function percentual(v: string, campo = 'percentual_rateio'): string {
  if (typeof v !== 'string') {
    throw new TypeError(`${campo} deve ser string decimal, nao number - float perde precisao antes do banco`);
  }
  const s = v.trim();
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) {
    throw new TypeError(`${campo} deve ser decimal com ate 4 casas, recebeu ${JSON.stringify(v)}`);
  }
  return s;
}

/**
 * A view rateio_por_usina. Nao e modelo do Prisma - o generator nao tem o
 * preview de `views` ligado -, entao a leitura e por $queryRaw.
 *
 * A view declara WITH (security_invoker = true): a RLS das tabelas base e
 * avaliada contra QUEM CONSULTA, nao contra o dono. Sem essa opcao ela
 * devolveria todos os tenants e anularia o FORCE ROW LEVEL SECURITY de uma vez
 * (CLAUDE.md 3, tabela de medicao). O filtro por tenant sai da RLS, nunca de um
 * WHERE escrito aqui.
 */
export async function situacaoDaUsina(usinaId: string): Promise<RateioDaUsina | null> {
  await exigir('ler');
  const r: any[] = await dbt().$queryRaw`
    SELECT usina_id, codigo_geradora, ucs, percentual_alocado::text AS percentual_alocado,
           percentual_livre::text AS percentual_livre, situacao
      FROM rateio_por_usina WHERE usina_id = ${usinaId}::uuid`;
  const l = r?.[0];
  return l ? { ...l, ucs: Number(l.ucs) } : null;
}

export async function situacaoDeTodas(): Promise<RateioDaUsina[]> {
  await exigir('ler');
  const r: any[] = await dbt().$queryRaw`
    SELECT usina_id, codigo_geradora, ucs, percentual_alocado::text AS percentual_alocado,
           percentual_livre::text AS percentual_livre, situacao
      FROM rateio_por_usina ORDER BY codigo_geradora`;
  return r.map((l) => ({ ...l, ucs: Number(l.ucs) }));
}

export async function ucsDaUsina(usinaId: string) {
  await exigir('ler');
  return dbt().unidade_consumidora.findMany({
    where: { usina_id: usinaId, status: { not: 'cancelada' } },
    orderBy: [{ numero_uc: 'asc' }],
  });
}

/**
 * Vincula a UC a usina com um percentual, ou muda o percentual de um vinculo
 * existente. Confere o teto ANTES de devolver.
 *
 * A conferencia nao substitui a constraint trigger e nao tenta: ela e o
 * mecanismo, e continua valendo no COMMIT mesmo para quem escreva por outro
 * caminho. Isto aqui e o que da a mensagem util.
 */
export async function definirRateio(e: {
  unidade_consumidora_id: string; usina_id: string; percentual_rateio: string;
}) {
  await exigir('escrever_cadastro');
  const p = percentual(e.percentual_rateio);

  const r = await dbt().unidade_consumidora.updateMany({
    where: { id: e.unidade_consumidora_id },
    data: { usina_id: e.usina_id, percentual_rateio: p },
  });
  if (r.count === 0) throw Object.assign(new Error('Unidade consumidora nao encontrada.'), { status: 404 });

  const s = await situacaoDaUsina(e.usina_id);
  if (s?.situacao === 'acima_do_teto') throw new RateioAcimaDoTeto(s.codigo_geradora, s.percentual_alocado);
  return s;
}

/**
 * Tira a UC do rateio. Zera os dois campos juntos: usina_id sem percentual e
 * percentual sem usina sao os dois estados que fariam o teto somar errado -
 * `app.exigir_teto_de_rateio` soma por usina_id, e uma UC com percentual e sem
 * usina simplesmente sumiria da conta.
 */
export async function removerDoRateio(unidadeConsumidoraId: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().unidade_consumidora.updateMany({
    where: { id: unidadeConsumidoraId },
    data: { usina_id: null, percentual_rateio: null },
  });
  if (r.count === 0) throw Object.assign(new Error('Unidade consumidora nao encontrada.'), { status: 404 });
}

/**
 * Antecipa a constraint trigger da R11 para AGORA, em vez do COMMIT.
 *
 * Use quando um lote de UCs entra numa transacao so e voce quer o erro na linha
 * que o causou. Depois de SET CONSTRAINTS ALL IMMEDIATE a trigger volta a
 * disparar por linha ate o fim da transacao - o que e exatamente o que se quer
 * durante uma carga, e exatamente o que NAO se quer se as UCs entram uma a uma
 * e o rateio so fecha no fim.
 */
export async function conferirTetoAgora(): Promise<void> {
  await exigir('escrever_cadastro');
  await dbt().$queryRaw`SET CONSTRAINTS ALL IMMEDIATE`;
}
