// A SITUACAO DE UMA UC COMO A PESSOA LE, e ela vem de DUAS fontes.
//
// Pura e fora do `.tsx`: o runner do `web/` nao le JSX, entao regra dentro do
// componente e inalcancavel por teste (regra 8).
//
// POR QUE ESTE MODULO EXISTE, e o motivo e uma palavra.
//
// "Ativo" significava duas coisas no sistema, e a tela mostrava a errada:
//
//   `unidade_consumidora.status = 'ativa'`  conceito NOSSO, de cadastro:
//                                           ninguem suspendeu nem cancelou. Toda
//                                           UC NASCE assim, e so gente muda
//   `rateio_situacao = 'ativado'`           conceito DO CRM: o contrato de
//                                           rateio foi ativado no funil
//
// Medido em 04/08/2026 contra producao: **41 estavam `ativa` e 29 `ativado`**. A
// tela escrevia "41 Ativas", e quem le entende "41 faturaveis". Sao 29. O mesmo
// vocabulario derrubou duas leituras seguidas do dono no mesmo dia - primeiro
// nos 86 clientes, depois nas 41 UCs.
//
// A DECISAO DE 04/08 E: **so aparece como Ativa o que fatura.** O resto continua
// na lista, com o nome do que de fato e - some-lo seria trocar um numero que
// engana por um que omite.
//
// A GUARDA DA UC LOCAL, e ela e a mesma da triagem no servidor: UC criada a mao
// por `POST /unidades-consumidoras` NAO tem `crm_usina_cliente_id`, entao o CRM
// nao tem opiniao sobre ela - e ela conta como Ativa. Sem isso, toda UC local
// ficaria "aguardando ativacao" para sempre, esperando um CRM que nao sabe dela.

export type UcParaSituacao = {
  status: string;
  /** Espelho do CRM (migration 24). `null` = o conector ainda nao leu. */
  rateio_situacao?: string | null;
  rateio_em_troca_titularidade?: boolean | null;
  /** Preenchido quando a UC veio do rateio do CRM. Ver a guarda acima. */
  crm_usina_cliente_id?: string | null;
};

export type SituacaoDaUc =
  | 'ativa'
  | 'aguardando_ativacao'
  | 'em_troca_titularidade'
  | 'situacao_nao_lida'
  | 'suspensa'
  | 'cancelada';

/** O que a pilula escreve. Vocabulario fechado - a tela nao inventa texto. */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaUc, string> = {
  ativa: 'Ativa',
  aguardando_ativacao: 'Aguardando ativação',
  em_troca_titularidade: 'Troca de titularidade',
  situacao_nao_lida: 'Situação não lida',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
};

/**
 * O tom da pilula. **So `ativa` e verde: e a unica que fatura.**
 *
 * Sao os TRES tons de `Marca`, e nao um quarto: a pilula existe com tres sinais
 * (cor, icone e palavra) pela restricao 3 do tema, e inventar um tom novo
 * pediria cor nova com contraste medido. Seis situacoes em tres tons e o mesmo
 * arranjo que os seis status de fatura ja usam.
 */
export const TOM_DA_SITUACAO: Record<SituacaoDaUc, 'ok' | 'pendente' | 'nao_medido'> = {
  ativa: 'ok',
  aguardando_ativacao: 'pendente',
  em_troca_titularidade: 'pendente',
  suspensa: 'pendente',
  // A interrogacao do `nao_medido` esta CERTA aqui: nos literalmente nao sabemos
  // - o conector nao leu esta UC.
  situacao_nao_lida: 'nao_medido',
  cancelada: 'nao_medido',
};

/**
 * O icone que SOBREPOE o do tom, quando o do tom mentiria.
 *
 * `Marca` aceita esse override justamente por isto, e o precedente esta no
 * comentario dela: "Emitida e tom `nao_medido` e exibiria a interrogacao de
 * 'nao sei', que e o certo para uma camada nao medida e o errado para uma
 * fatura emitida". Cancelada e o mesmo caso - nos sabemos muito bem.
 */
export const ICONE_DA_SITUACAO: Partial<Record<SituacaoDaUc, 'remover'>> = {
  cancelada: 'remover',
};

/**
 * A situacao que a pessoa le, derivada das duas fontes.
 *
 * A ORDEM DAS PERGUNTAS E A ORDEM DE QUEM MANDA, e ela nao e arbitraria:
 *
 *   1. cancelada/suspensa vencem tudo. Sao decisao de GENTE sobre o nosso
 *      cadastro, e o que o CRM acha de uma UC que alguem cancelou aqui nao
 *      muda o fato de ela estar cancelada aqui;
 *   2. UC sem `crm_usina_cliente_id` e LOCAL - o CRM nao tem opiniao, e ela
 *      e Ativa;
 *   3. so entao a situacao do CRM decide.
 *
 * `em_troca_titularidade` vem ANTES de `aguardando_ativacao` entre as nao
 * ativadas porque diz mais: as duas nao faturam, e "troca de titularidade"
 * explica POR QUE, enquanto "aguardando" so diz que nao. Sete das doze estao
 * assim.
 */
export function situacaoDaUc(u: UcParaSituacao): SituacaoDaUc {
  if (u.status === 'cancelada') return 'cancelada';
  if (u.status === 'suspensa')  return 'suspensa';

  // UC local: o CRM nao sabe dela, entao nao opina. Mesma guarda da triagem.
  if (!u.crm_usina_cliente_id) return 'ativa';

  if (u.rateio_situacao == null) return 'situacao_nao_lida';
  if (u.rateio_situacao === 'ativado') return 'ativa';
  if (u.rateio_em_troca_titularidade) return 'em_troca_titularidade';
  return 'aguardando_ativacao';
}

/**
 * A UC entra num lote de faturamento?
 *
 * ESPELHO da triagem do servidor (`triar()` em `src/dominio/faturamento.ts`), e
 * espelho tem modo de falha proprio: divergir sem que nenhum lado pareca
 * errado. Por isso ele e UMA linha derivada de `situacaoDaUc`, e nao uma
 * segunda copia das condicoes - se a regra mudar, muda num lugar so deste lado.
 *
 * O que ele NAO cobre, de proposito: contrato, geracao e vencimento. Aqueles
 * sao outros motivos de recusa, e a tela de Unidades nao os conhece. Aqui a
 * pergunta e so "esta UC pode chegar ao lote", nao "ela vai virar fatura".
 */
export const ehFaturavel = (u: UcParaSituacao): boolean => situacaoDaUc(u) === 'ativa';

/** As contagens do cabecalho, num lugar so. */
export function contarSituacoes(ucs: readonly UcParaSituacao[]) {
  const por = {} as Record<SituacaoDaUc, number>;
  for (const k of Object.keys(ROTULO_DA_SITUACAO) as SituacaoDaUc[]) por[k] = 0;
  for (const u of ucs) por[situacaoDaUc(u)]++;
  return { por, faturaveis: ucs.filter(ehFaturavel).length, total: ucs.length };
}
