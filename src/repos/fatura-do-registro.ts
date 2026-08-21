// A JUNCAO, do lado do banco: a conta unificada lida vira fatura.
//
// ============================================================================
// O DINHEIRO NAO PASSA PELO NODE, e aqui isso sai de graca
//
// A `SPEC-001` R23 poe uma unica implementacao da formula do dinheiro do lado do
// servidor, e o `comporLote` do caminho contratual precisa de um `INSERT ...
// SELECT` para honrar isso - a conta acontece dentro da consulta.
//
// Aqui a conta **ja aconteceu**: as nove parcelas em centavos foram calculadas
// por `calcular()` quando a pessoa conferiu a leitura, e estao gravadas em
// `registro_de_fatura_unificada`, com tres CHECKs do banco garantindo que as
// partes somam o todo. Entao o INSERT le os centavos da PROPRIA LINHA e os copia
// para a fatura: eles nunca sobem para o Node, nunca viram `number`, e nao ha
// segunda implementacao de nada.
//
// O que este arquivo passa por parametro sao as tres coisas que a TRIAGEM
// decidiu e que nao estao na linha - `contrato_id`, `vencimento` e
// `flag_fatura_cheia` -, exatamente como `comporLote` faz. Decisao vem do
// dominio; aritmetica fica no servidor.
//
// ============================================================================
// A UC E RESOLVIDA PELO NUMERO, e nao pela FK do registro
//
// `registro_de_fatura_unificada.unidade_consumidora_id` e preenchido no momento
// do registro, QUANDO a UC ja existe - a migration 29 deixou a FK opcional de
// proposito, porque exigir cadastro para registrar inverteria a ordem do
// trabalho de quem sobe o PDF.
//
// Consequencia: uma conta registrada antes de a UC ser cadastrada carrega a FK
// nula para sempre, e faturar por ela recusaria uma UC que hoje existe. Por isso
// a juncao resolve por `numero_uc`, que e a chave de negocio da tabela - e o
// caminho se conserta sozinho quando o cadastro chega depois.

import { db } from '../db/contexto.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { juncaoDaFaturaUnificadaExiste } from '../db/catalogo.ts';
import { chavePixPadrao } from './documento.ts';
import { competenciaISO } from '../dominio/faturamento.ts';
import {
  triarRegistro, EXPLICACAO_DO_REGISTRO,
  type LinhaDoRegistro, type CandidataDoRegistro, type MotivoDeRecusaDoRegistro,
} from '../dominio/fatura-do-registro.ts';

export class JuncaoNaoAplicada extends Error {
  readonly status = 503;
  constructor() {
    super(
      'A migration 34 ainda nao foi aplicada neste banco: a coluna ' +
      '`registro_de_fatura_unificada.fatura_id` nao existe, e sem ela a conta lida nao tem ' +
      'onde guardar a fatura que ela virou. Nada foi gravado. A ordem e migrar e depois ' +
      'implantar - o inverso deixaria esta rota escrevendo pela metade.'
    );
    this.name = 'JuncaoNaoAplicada';
  }
}

export class RegistroNaoFaturavel extends Error {
  readonly status = 422;
  readonly motivo: MotivoDeRecusaDoRegistro;
  constructor(numeroUc: string, motivo: MotivoDeRecusaDoRegistro) {
    super(`A conta da unidade ${numeroUc} nao pode virar fatura: ${EXPLICACAO_DO_REGISTRO[motivo]}.`);
    this.name = 'RegistroNaoFaturavel';
    this.motivo = motivo;
  }
}

export class FaturaDaCompetenciaJaExiste extends Error {
  readonly status = 409;
  constructor(numeroUc: string, competencia: string) {
    super(
      `Ja existe fatura da unidade ${numeroUc} na competencia ${competencia}, e o banco recusou ` +
      'a segunda. E a trava que impede o mesmo mes ser cobrado duas vezes do mesmo cliente. ' +
      'Nada foi gravado.'
    );
    this.name = 'FaturaDaCompetenciaJaExiste';
  }
}

export class RegistroNaoExiste extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Conta lida ${id} nao encontrada neste tenant.`);
    this.name = 'RegistroNaoExiste';
  }
}

/**
 * Tudo o que a triagem precisa, numa consulta.
 *
 * Os `LEFT JOIN` sao todos deliberados: cada ausencia vira um motivo de recusa
 * NOMEADO em vez de sumir da consulta. Um `JOIN` aqui devolveria zero linhas e a
 * rota diria "conta nao encontrada" para uma conta que existe e a que falta um
 * contrato - que e o diagnostico errado no lugar errado.
 *
 * O filtro por tenant sai da RLS. Os `tenant_id = tenant_id` nos JOINs existem
 * para o planejador, e nao para o isolamento.
 */
async function insumos(registroId: string): Promise<LinhaDoRegistro | null> {
  const r: any[] = await db().$queryRaw`
    SELECT r.id                          AS registro_id,
           r.numero_uc,
           r.competencia,
           r.fatura_id,
           r.compensada_kwh::text        AS compensada_kwh,
           r.tarifa_kwh::text            AS tarifa_kwh,
           r.energia_g3_centavos,
           r.total_equatorial_centavos,
           r.vencimento                  AS vencimento_da_conta,

           uc.id                         AS unidade_consumidora_id,
           uc.usina_id,
           uc.percentual_rateio::text    AS percentual_rateio,
           uc.data_vencimento,
           uc.rateio_situacao,
           uc.crm_usina_cliente_id,
           k.id                          AS contrato_id,
           k.data_fechamento,
           g.geracao_kwh::text           AS geracao_kwh,
           u.dono_usina_id,
           (f.id IS NOT NULL)            AS uc_ja_tem_fatura
      FROM registro_de_fatura_unificada r
      LEFT JOIN unidade_consumidora uc
             ON uc.tenant_id = r.tenant_id AND uc.numero_uc = r.numero_uc
      LEFT JOIN contrato k
             ON k.tenant_id = uc.tenant_id AND k.uc_vigente = uc.id AND k.status = 'ativo'
      LEFT JOIN usina u
             ON u.tenant_id = uc.tenant_id AND u.id = uc.usina_id
      LEFT JOIN usina_geracao g
             ON g.tenant_id = uc.tenant_id AND g.usina_id = uc.usina_id
            AND g.competencia = r.competencia
      LEFT JOIN fatura f
             ON f.tenant_id = uc.tenant_id AND f.unidade_consumidora_id = uc.id
            AND f.competencia_faturada = r.competencia
     WHERE r.id = ${registroId}::uuid`;
  const l = r?.[0];
  if (!l) return null;
  return {
    ...l,
    energia_g3_centavos: Number(l.energia_g3_centavos),
    total_equatorial_centavos: Number(l.total_equatorial_centavos),
    uc_ja_tem_fatura: Boolean(l.uc_ja_tem_fatura),
  } as LinhaDoRegistro;
}

/**
 * ENSAIO. Diz se esta conta viraria fatura, e nao escreve nada.
 *
 * Existe pelo mesmo motivo do `--ensaio` do conector e do ensaio do lote: o
 * primeiro ato que cobra um cliente deve poder ser olhado antes de existir. E
 * aqui ele custa uma consulta - a triagem e pura.
 */
export async function ensaiarRegistro(registroId: string): Promise<CandidataDoRegistro> {
  await exigir('ler');
  const l = await insumos(registroId);
  if (!l) throw new RegistroNaoExiste(registroId);
  return triarRegistro(l);
}

export type RegistroFaturado = Extract<CandidataDoRegistro, { faturar: true }> & {
  fatura_id: string;
};

/**
 * VALENDO. A conta lida vira fatura em RASCUNHO, e a linha passa a apontar para ela.
 *
 * RASCUNHO E NAO EMITIDA, como no caminho contratual: compor e conferir sao dois
 * atos, e o `PRD` §9 pede "import -> conferencia -> emissao" nessa ordem. Fatura
 * em rascunho nao tem boleto, nao entra no a receber e some sem rastro financeiro
 * se for cancelada. Quem emite e `POST /faturas/:id/emitir`, que ja existia.
 *
 * OS DOIS COMANDOS NA MESMA TRANSACAO - a do `withTenant`. Uma fatura criada sem
 * a linha apontando para ela seria o pior estado possivel deste caminho: a conta
 * pareceria nao faturada, alguem faturaria de novo, e a trava que recusaria a
 * segunda e um `23505` do banco, longe de quem clicou.
 */
export async function faturarRegistro(registroId: string): Promise<RegistroFaturado> {
  await exigir('escrever_carteira');

  /* A guarda de catalogo ANTES de qualquer leitura de negocio: sem a coluna, o
   * `UPDATE` do fim falharia depois de a fatura ja existir. */
  if (!(await juncaoDaFaturaUnificadaExiste())) throw new JuncaoNaoAplicada();

  const l = await insumos(registroId);
  if (!l) throw new RegistroNaoExiste(registroId);

  const c = triarRegistro(l);
  if (!c.faturar) throw new RegistroNaoFaturavel(c.numero_uc, c.motivo);

  /*
   * A CHAVE PIX E CARIMBADA AQUI, e o motivo e o mesmo do `comporLote`: a segunda
   * via tem de sair identica a primeira. Ler a chave padrao na hora de imprimir
   * faria o destino do dinheiro mudar quando alguem trocasse a padrao - sem erro
   * e sem log, e com o cliente segurando dois papeis com QRs diferentes para a
   * mesma divida.
   *
   * `null` e legitimo: tenant sem Pix cadastrado fatura, emite e cobra por outro
   * meio, e o documento diz isso com motivo em vez de imprimir um QR que nao
   * resolve.
   */
  const chave = await chavePixPadrao();
  const venc = competenciaISO(c.vencimento);

  let faturaId: string;
  try {
    /* Os centavos vem de `r.*` - eles nunca sobem para o Node. Ver o cabecalho. */
    const criada: any[] = await db().$queryRaw`
      INSERT INTO fatura (
        tenant_id, contrato_id, unidade_consumidora_id, usina_id, competencia,
        geracao_kwh_competencia, percentual_rateio_aplicado, consumo_kwh, tarifa_reais_por_kwh,
        valor_consumo_centavos, valor_tarifas_concessionaria_centavos,
        flag_fatura_cheia, vencimento, status, chave_pix_id)
      SELECT r.tenant_id,
             ${c.contrato_id}::uuid,
             uc.id,
             uc.usina_id,
             r.competencia,
             g.geracao_kwh,
             uc.percentual_rateio,
             r.compensada_kwh,
             r.tarifa_kwh,
             r.energia_g3_centavos,
             r.total_equatorial_centavos,
             ${c.flag_fatura_cheia}::boolean,
             ${venc}::date,
             'rascunho',
             ${chave?.id ?? null}::uuid
        FROM registro_de_fatura_unificada r
        JOIN unidade_consumidora uc
          ON uc.tenant_id = r.tenant_id AND uc.numero_uc = r.numero_uc
        JOIN usina_geracao g
          ON g.tenant_id = uc.tenant_id AND g.usina_id = uc.usina_id
         AND g.competencia = r.competencia
       WHERE r.id = ${registroId}::uuid
      RETURNING id`;
    faturaId = criada?.[0]?.id;
    if (!faturaId) {
      /* Zero linhas com a triagem aprovada significa que o cadastro mudou entre a
       * leitura e o INSERT. Dentro da transacao isso nao acontece; a defesa fica
       * porque um INSERT ... SELECT que nao insere nao levanta erro nenhum. */
      throw Object.assign(
        new Error('A fatura nao foi criada: o cadastro da unidade mudou entre a conferencia e a gravacao. Nada foi gravado.'),
        { status: 409 },
      );
    }
  } catch (err: any) {
    const codigo = err?.meta?.code ?? err?.code;
    if (codigo === '23505') throw new FaturaDaCompetenciaJaExiste(c.numero_uc, competenciaISO(c.competencia));
    throw err;
  }

  await db().$executeRaw`
    UPDATE registro_de_fatura_unificada
       SET fatura_id = ${faturaId}::uuid, atualizado_em = now()
     WHERE id = ${registroId}::uuid`;

  return { ...c, fatura_id: faturaId };
}

/**
 * Acrescenta `fatura_id` a uma lista de registros ja lida.
 *
 * POR QUE NAO SAI DA PROPRIA LEITURA. `registro.daUnidade()` le pelo cliente
 * gerado do Prisma, e o cliente so conhece a coluna DEPOIS de a migration 34 ser
 * aplicada e o `db pull` rodar. Ate la ele nem a selecionaria - a lista voltaria
 * sem o campo, e a tela nao teria como saber quais contas ja viraram cobranca.
 *
 * Entao a pergunta e feita a parte e GUARDADA pelo catalogo: sem a coluna,
 * devolve `null` para todo mundo em vez de estourar. A tela degrada para "ainda
 * nao da para cobrar por aqui", que e verdade, em vez de quebrar.
 *
 * Quem chama ja passou por `exigir('ler')` - esta funcao enriquece o que a
 * leitura autorizada devolveu, e nao abre um segundo caminho de leitura.
 */
export type ComFatura<T> = T & { fatura_id: string | null; cobranca_disponivel: boolean };

export async function comFatura<T extends { id: string }>(
  linhas: readonly T[],
): Promise<Array<ComFatura<T>>> {
  if (linhas.length === 0) return [];

  /*
   * `cobranca_disponivel` EXISTE PORQUE `fatura_id: null` DIZ DUAS COISAS, e a
   * tela precisa separa-las: "esta conta ainda nao foi cobrada" e "este banco
   * ainda nao sabe cobrar". Sem a distincao, o botao apareceria antes da
   * migration e o unico jeito de descobrir seria clicando - trocando uma recusa
   * nomeada por uma tentativa frustrada, que e o oposto do que a guarda existe
   * para fazer.
   *
   * E `false` para TODAS as linhas ou para nenhuma - e propriedade do banco, nao
   * da linha. Viaja por linha mesmo assim porque mudar a forma da resposta
   * quebraria o unico consumidor que ela ja tem.
   */
  const disponivel = await juncaoDaFaturaUnificadaExiste();
  if (!disponivel) {
    return linhas.map((l) => ({ ...l, fatura_id: null, cobranca_disponivel: false }));
  }

  const r: any[] = await db().$queryRaw`
    SELECT id, fatura_id
      FROM registro_de_fatura_unificada
     WHERE id = ANY(${linhas.map((l) => l.id)}::uuid[])
       AND fatura_id IS NOT NULL`;
  const mapa = new Map<string, string>(r.map((x) => [String(x.id), String(x.fatura_id)]));
  return linhas.map((l) => ({ ...l, fatura_id: mapa.get(l.id) ?? null, cobranca_disponivel: true }));
}
