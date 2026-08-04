// PRONTIDAO PARA FATURAR — o que falta para uma competencia poder ser cobrada.
//
// POR QUE ESTE ARQUIVO EXISTE, e a razao foi MEDIDA em 28/07. O primeiro ensaio
// contra producao devolveu:
//
//     faturas a criar . 0
//     recusadas ....... 35
//        35  sem_contrato_vigente
//
// e isso e tudo o que a triagem podia dizer. A `SPEC-003` R32 manda ela devolver
// UM motivo por UC, e o que impede de EXISTIR antes do que impede de calcular -
// devolver `sem_geracao_lancada` mandaria a operacao lancar geracao para
// descobrir depois que faltava o contrato. Esta certo, e e insuficiente para
// planejar: por tras dos 35 contratos ausentes havia mais tres camadas vazias
// (vencimento, tarifa, dono de usina) que so apareceriam uma a uma, um ensaio
// por vez, cada um depois de dias de trabalho da operacao.
//
// A DIFERENCA ENTRE OS DOIS INSTRUMENTOS, e ela e de proposito:
//
//   ensaiarLote()  responde "esta UC entra?"        - por UC, primeiro motivo
//   prontidao()    responde "o que falta ao todo?"  - por CAMADA, todas de uma vez
//
// ESTE ARQUIVO NAO DECIDE NADA E NAO ESCREVE NADA. Ele conta, e cada linha
// carrega o dono nomeado da pendencia. Uma camada que ele apontasse e resolvesse
// sozinho seria o improviso que a regra 10 proibe - o valor de vencimento, a
// tarifa e o dono da usina tem dono de decisao, e nenhum deles e o programador.

import { db, exigir } from '../db/contexto.ts';
import { competencia as normalizar, competenciaISO } from '../dominio/faturamento.ts';

/**
 * `nao_medido` NAO E `ok`, e a distincao foi achada rodando o relatorio contra
 * producao em 28/07.
 *
 * Tres camadas - geracao da competencia, tarifa vigente e regra de comissao -
 * tem por universo as UCs CONTRATADAS, nao as ativas. Com zero contratos, o
 * universo delas e vazio, e "0 de 0" saiu marcado como `ok`. Nao e: ninguem
 * mediu nada. E exatamente o modo de falha que este projeto persegue desde a
 * regra 3 e que o RESUMO-SESSAO-9 registrou no conector - "zero divergencias
 * significa que ninguem editou o campo, NAO que a heranca esta certa".
 *
 * Um relatorio de prontidao que mostra verde sobre universo vazio e pior do que
 * relatorio nenhum: ele autoriza.
 */
export type SituacaoDaCamada = 'ok' | 'pendente' | 'nao_medido';

export type Camada = {
  camada: string;
  situacao: SituacaoDaCamada;
  /** Quantos itens da camada ainda faltam. Zero = fechada. */
  faltam: number;
  /** O universo contra o qual `faltam` foi contado. Sem ele, "faltam 3" nao diz
   *  se e de 3 ou de 300. */
  total: number;
  /** `bloqueia_fatura` impede a cobranca existir; `bloqueia_split` deixa faturar
   *  e estraga a reparticao quando o dinheiro entrar. A distincao e a mesma da
   *  R33 - recusa e alerta nao sao a mesma coisa.
   *
   *  ESTRAGAR NAO E SEMPRE TRAVAR, e a `originador_do_contrato` e o caso: ali o
   *  split roda ate o fim, fecha em zero de comissao e nao levanta. Vale a mesma
   *  marca porque o efeito sobre `pode_repartir` e o mesmo - o sistema nao pode
   *  se declarar pronto para repartir -, e porque a alternativa era uma marca
   *  nova cujo unico conteudo seria "e pior que as outras". */
  efeito: 'bloqueia_fatura' | 'bloqueia_split';
  explicacao: string;
  /** A questao aberta que a destrava, quando ha uma. Recusa e ponteiro, nao beco. */
  questao: string | null;
  dono: string;
};

export type Prontidao = {
  competencia: string;
  /**
   * As UCs FATURAVEIS - `status = 'ativa'` e, quando espelhada, rateio ativado
   * no CRM. O nome ficou por compatibilidade de payload; o significado mudou em
   * 04/08. Ver o comentario do `WITH uc_ativa`.
   */
  ucs_ativas: number;
  /** True so quando NENHUMA camada de `bloqueia_fatura` tem pendencia. Nao
   *  promete que a fatura vai sair certa - promete que ela pode sair. */
  pode_faturar: boolean;
  pode_repartir: boolean;
  camadas: Camada[];
};

/**
 * As dez camadas, numa consulta so.
 *
 * O filtro por tenant sai da RLS, nao de um WHERE escrito aqui. Os
 * `tenant_id = tenant_id` nos JOINs existem para o planejador, nao para o
 * isolamento - sem eles o resultado seria o mesmo e o plano seria pior.
 *
 * A ORDEM das camadas e a mesma da triagem, e pelo mesmo motivo: quem le a lista
 * de cima para baixo trabalha na ordem em que o trabalho destrava o proximo.
 */
export async function prontidao(comp: Date | string): Promise<Prontidao> {
  await exigir('ler');
  const c = normalizar(comp);
  const iso = competenciaISO(c);

  const r: any[] = await db().$queryRaw`
    /*
     * O UNIVERSO E O FATURAVEL, e nao "toda UC nao cancelada". Mudou em
     * 04/08/2026, e a razao e que a palavra "ativa" significava duas coisas.
     *
     * "unidade_consumidora.status" e conceito NOSSO, de cadastro - ninguem
     * suspendeu nem cancelou esta UC aqui -, e toda UC nasce "ativa".
     * "rateio_situacao" e conceito DO CRM - o contrato de rateio foi ativado no
     * funil. Medido no dia: 41 estavam "ativa" e 29 "ativado".
     *
     * A prontidao contava as 41, entao ela dizia "41 sem contrato" e "41 sem
     * vencimento" para um trabalho que so importa em 29 - inflando cada camada
     * em 12 e mandando a operacao preencher o que nunca ia faturar.
     *
     * O PREDICADO E O MESMO DA TRIAGEM, e isto e espelho: "triar()" em
     * "src/dominio/faturamento.ts" recusa por "rateio_nao_ativado" quando a UC
     * E ESPELHADA ("crm_usina_cliente_id" preenchido) e a situacao nao e
     * "ativado". UC cadastrada a mao nao tem opiniao do CRM e continua contando,
     * que e a guarda que impede uma UC local de ficar invisivel para sempre.
     *
     * Espelho tem modo de falha proprio - divergir sem que nenhum lado pareca
     * errado -, e por isso o "K18j" compara os dois lados um contra o outro em
     * vez de comparar cada um com um numero meu.
     */
    WITH uc_ativa AS (
      SELECT uc.* FROM unidade_consumidora uc
       WHERE uc.status = 'ativa'
         AND (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado')
    ),
    uc_contratada AS (
      SELECT uc.*, k.id AS contrato_id, k.originador_id,
             k.originador_tipo_no_fechamento, k.data_fechamento
        FROM uc_ativa uc
        JOIN contrato k ON k.tenant_id = uc.tenant_id AND k.uc_vigente = uc.id AND k.status = 'ativo'
    )
    SELECT
      (SELECT count(*) FROM uc_ativa)                                        AS ucs_ativas,
      -- 1. contrato: entidade LOCAL, nao espelhada do CRM (SPEC-002 §2)
      (SELECT count(*) FROM uc_ativa uc
        WHERE NOT EXISTS (SELECT 1 FROM contrato k
                           WHERE k.tenant_id = uc.tenant_id AND k.uc_vigente = uc.id
                             AND k.status = 'ativo'))                        AS sem_contrato,
      -- 2. rateio: sem a fatia contratada nao ha como derivar o credito
      (SELECT count(*) FROM uc_ativa uc
        WHERE uc.usina_id IS NULL OR uc.percentual_rateio IS NULL)           AS sem_rateio,
      -- 3. geracao da competencia, contada nas USINAS que tem UC contratada
      (SELECT count(DISTINCT uc.usina_id) FROM uc_contratada uc
        WHERE uc.usina_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM usina_geracao g
                           WHERE g.tenant_id = uc.tenant_id AND g.usina_id = uc.usina_id
                             AND g.competencia = ${iso}::date))              AS sem_geracao,
      (SELECT count(DISTINCT uc.usina_id) FROM uc_contratada uc WHERE uc.usina_id IS NOT NULL) AS usinas_contratadas,
      -- 4. vencimento: Q-SPEC001-02, 100% vazio no CRM
      (SELECT count(*) FROM uc_ativa uc WHERE uc.data_vencimento IS NULL)    AS sem_vencimento,
      -- 5. tarifa vigente NA COMPETENCIA, por distribuidora de UC contratada
      (SELECT count(DISTINCT uc.distribuidora) FROM uc_contratada uc
        WHERE NOT EXISTS (SELECT 1 FROM tarifa t
                           WHERE t.tenant_id = uc.tenant_id AND t.distribuidora = uc.distribuidora
                             AND daterange(t.vigencia_inicio, t.vigencia_fim, '[)') @> ${iso}::date)) AS sem_tarifa,
      (SELECT count(DISTINCT uc.distribuidora) FROM uc_contratada uc)        AS distribuidoras,
      -- 6. dono da usina: R12, bloqueia o SPLIT e nao a fatura
      (SELECT count(*) FROM usina u
        WHERE u.status = 'ativa' AND u.dono_usina_id IS NULL)                AS sem_dono,
      (SELECT count(*) FROM usina u WHERE u.status = 'ativa')                AS usinas_ativas,
      -- 7. regra de repasse vigente na competencia
      (SELECT count(*) FROM usina u
        WHERE u.status = 'ativa'
          AND NOT EXISTS (SELECT 1 FROM regra_repasse rr
                           WHERE rr.tenant_id = u.tenant_id AND rr.usina_id = u.id
                             AND daterange(rr.vigencia_inicio, rr.vigencia_fim, '[)') @> ${iso}::date)) AS sem_repasse,
      -- 8. originador do contrato: Q-ORIGINADOR-01, decidida em 29/07/2026.
      --    As UCs da carteira LEVAM originador e a comissao esta toda pela
      --    frente - ninguem recebeu nada ainda. Entao contrato ativo com
      --    originador_id nulo nao e "venda sem comissao", e defeito de cadastro.
      --    Conta ANTES da camada seguinte porque sem originador nao ha tier
      --    congelado, e sem tier a regra_de_comissao nao tem o que medir.
      (SELECT count(*) FROM uc_contratada uc WHERE uc.originador_id IS NULL)   AS sem_originador,
      (SELECT count(*) FROM uc_contratada uc)                                 AS contratos_ativos,
      -- 9. regra de comissao para o tier CONGELADO de cada contrato (R20-b),
      --    nas DUAS parcelas do PRD 5.4 - uma vigencia com so uma parcela faz o
      --    split levantar na fatura cheia que usar a outra
      (SELECT count(DISTINCT uc.originador_tipo_no_fechamento) FROM uc_contratada uc
        WHERE uc.originador_tipo_no_fechamento IS NOT NULL
          AND (SELECT count(*) FROM regra_comissao rc
                WHERE rc.tenant_id = uc.tenant_id
                  AND rc.originador_tipo = uc.originador_tipo_no_fechamento
                  AND daterange(rc.vigencia_inicio, rc.vigencia_fim, '[)') @> uc.data_fechamento) < 2) AS sem_comissao,
      (SELECT count(DISTINCT uc.originador_tipo_no_fechamento) FROM uc_contratada uc
        WHERE uc.originador_tipo_no_fechamento IS NOT NULL)                  AS tiers_em_uso,
      -- 10. conector de cobranca ativo (o boleto, PAUTA 5)
      (SELECT count(*) FROM conector_cobranca cc WHERE cc.ativo)             AS cobranca_ativa`;

  const l = r[0];
  const n = (v: any) => Number(v ?? 0);

  /*
   * `derivada` marca a camada cujo universo sao as UCs CONTRATADAS. Com zero
   * contratos o universo e vazio, e a camada nao pode ser declarada `ok` - ver
   * o comentario de SituacaoDaCamada.
   */
  const situar = (faltam: number, total: number, derivada = false): SituacaoDaCamada => {
    if (faltam > 0) return 'pendente';
    if (total === 0 && derivada) return 'nao_medido';
    return 'ok';
  };

  const bruto: Array<Omit<Camada, 'situacao'> & { derivada?: boolean }> = [
    { camada: 'contrato_ativo', faltam: n(l.sem_contrato), total: n(l.ucs_ativas),
      efeito: 'bloqueia_fatura', dono: 'Vinicius + operacao', questao: 'Q-022',
      explicacao: 'UC ativa sem contrato ativo. `contrato` e entidade LOCAL e NAO e espelhada do CRM ' +
        '(SPEC-002 §2 espelha cliente, usina, usina_geracao e unidade_consumidora): ele congela o tier ' +
        'do originador (R20-b) e guarda o contador de faturas cheias, que sao decisoes do financeiro' },

    { camada: 'rateio', faltam: n(l.sem_rateio), total: n(l.ucs_ativas),
      efeito: 'bloqueia_fatura', dono: 'operacao', questao: null,
      explicacao: 'UC sem usina vinculada ou sem percentual. Sem a fatia contratada nao ha como derivar ' +
        'quanto credito a UC recebeu da geracao medida' },

    { camada: 'geracao_da_competencia', faltam: n(l.sem_geracao), total: n(l.usinas_contratadas), derivada: true,
      efeito: 'bloqueia_fatura', dono: 'operacao', questao: 'RATEIO-USO-01',
      explicacao: 'usina com UC contratada e sem geracao lancada nesta competencia. A base e a geracao ' +
        'MEDIDA (PAUTA 9a), entao sem a linha a fatura nao nasce - e o caso da usina 0003' },

    { camada: 'vencimento', faltam: n(l.sem_vencimento), total: n(l.ucs_ativas),
      efeito: 'bloqueia_fatura', dono: 'operacao', questao: 'Q-SPEC001-02',
      explicacao: 'UC sem data de vencimento. Nao ha default: quem preenche, por UC ou por contrato, ' +
        'e questao sem dono resolvido, e escolher um dia aqui seria o improviso que a regra 10 proibe' },

    { camada: 'tarifa_vigente', faltam: n(l.sem_tarifa), total: n(l.distribuidoras), derivada: true,
      efeito: 'bloqueia_fatura', dono: 'Vinicius', questao: null,
      explicacao: 'distribuidora de UC contratada sem tarifa vigente NA COMPETENCIA. A composicao ' +
        'levanta no_data_found (R26): ausencia de preco e erro, nao zero. `prisma/seed/` tem o valor ' +
        'derivado de 1,130000 R$/kWh, e rodar o seed e decisao - a tarifa precifica toda fatura' },

    { camada: 'dono_da_usina', faltam: n(l.sem_dono), total: n(l.usinas_ativas),
      efeito: 'bloqueia_split', dono: 'operacao', questao: 'AUD-08',
      explicacao: 'usina ativa sem dono cadastrado. NAO impede faturar - a cobranca ao cliente nao ' +
        'depende disso -, mas a R12 bloqueia o split inteiro quando a fatura for paga, e o repasse ' +
        'fica acumulando sem destino' },

    { camada: 'regra_de_repasse', faltam: n(l.sem_repasse), total: n(l.usinas_ativas),
      efeito: 'bloqueia_split', dono: 'Vinicius', questao: null,
      explicacao: 'usina ativa sem percentual de repasse vigente na competencia. E a outra metade da ' +
        'R12: com dono e sem regra, o split levanta no meio em vez de na conferencia' },

    { camada: 'originador_do_contrato', faltam: n(l.sem_originador), total: n(l.contratos_ativos), derivada: true,
      efeito: 'bloqueia_split', dono: 'operacao', questao: null,
      explicacao: 'contrato ativo sem originador. A Q-ORIGINADOR-01 foi decidida em 29/07: as UCs da ' +
        'carteira LEVAM originador e nenhuma comissao foi paga ainda, entao o nulo aqui e cadastro que ' +
        'faltou, nao venda sem comissao. O modo de falha e o pior que existe neste sistema: split.ts so ' +
        'monta o item de comissao quando ha originador_id E tier congelado, entao a reparticao roda, ' +
        'fecha e NAO PAGA - sem erro, sem log e sem recusa. E nao ha caminho de edicao: originador_id e ' +
        'o tier so se escrevem no rascunhar (R20-b), e consertar depois e encerrar + renovar, que zera o ' +
        'contador de faturas cheias e registra na trilha uma renovacao que nao houve',
    },

    { camada: 'regra_de_comissao', faltam: n(l.sem_comissao), total: n(l.tiers_em_uso), derivada: true,
      efeito: 'bloqueia_split', dono: 'Vinicius', questao: 'Q-COMIS-TERC-01',
      explicacao: 'tier congelado em contrato ativo sem AS DUAS parcelas vigentes na data de fechamento ' +
        '(PRD §5.4). Uma vigencia com so uma parcela passa na 1a fatura cheia e levanta na 2a. ' +
        'O universo aqui sao os tiers EM USO: se esta camada diz `nao_medido` e a anterior acusa ' +
        'contrato sem originador, o vazio e consequencia dela e se resolve la - era a Q-PRONTIDAO-COMIS-01' },

    { camada: 'cobranca_sicoob', faltam: n(l.cobranca_ativa) > 0 ? 0 : 1, total: 1,
      efeito: 'bloqueia_fatura', dono: 'Vinicius', questao: 'Q-SICOOB-01',
      explicacao: 'conector de cobranca ativo. Sem ele a fatura existe e e cobravel por outro meio, mas ' +
        'nao ha boleto - e a PAUTA 5 respondeu que o boleto E o instrumento. Falta o certificado A1 e a ' +
        'credencial, que vivem em armazenamento cifrado e entram por credencial_ref (regra 5)' },
  ];

  const camadas: Camada[] = bruto.map(({ derivada, ...c }) => ({
    ...c, situacao: situar(c.faltam, c.total, derivada),
  }));

  // `pode_faturar` exige `ok`, nunca `nao_medido`. Contar nao-medido como
  // pronto seria o relatorio autorizando o que ele nao conferiu.
  return {
    competencia: iso,
    ucs_ativas: n(l.ucs_ativas),
    pode_faturar: camadas.filter((x) => x.efeito === 'bloqueia_fatura').every((x) => x.situacao === 'ok'),
    pode_repartir: camadas.every((x) => x.situacao === 'ok'),
    camadas,
  };
}
