// O TOM DE CADA ESTADO DE NEGÓCIO — o lugar único. Sem JSX, sem tela.
//
// ============================================================================
// POR QUE ISTO EXISTE (01/10/2026, etapa 7b do redesenho)
//
// Até esta data cada tela decidia a cor dos seus selos, e a crítica de 01/10
// (P1 nº 2) mediu o resultado: a MESMA coisa saía com cara diferente em cada
// lugar, e coisas diferentes saíam com a mesma cara.
//
//   - a recusa do banco era vermelha em Contas a receber, âmbar no funil do
//     Mês e cinza na linha de Cobranças — três gravidades para um fato só;
//   - Rascunho (tarefa) e Emitida (feito, em curso) caíam no mesmo âmbar, e
//     dezesseis das vinte linhas de Cobranças ficavam iguais;
//   - «Vence em 5 dias» saía verde com o visto, como se já tivesse sido pago;
//   - o aviso «2 contas vencidas» era âmbar sobre linhas com o selo VENCIDA
//     vermelho;
//   - «Alterou», no Histórico, saía âmbar — a cor de tarefa num verbo de
//     auditoria.
//
// Cada uma dessas era uma decisão certa tomada no lugar errado: dentro de um
// `.tsx`, longe das outras, sem teste. Aqui elas ficam juntas, lado a lado, e a
// contradição aparece na leitura — e na suíte `web/tests/tom-do-estado.ts`, que
// prende um tom por estado.
//
// ============================================================================
// O QUE CADA TOM QUER DIZER — a pergunta é «o que isto pede de você?»
//
//   `ok`          FECHOU. Pago, registrado, conferido, pronto, ativo.
//   `erro`        FALHOU — algo aconteceu e deu errado: o banco recusou, a
//                 cobrança venceu sem pagamento, a leitura não voltou. Só isto
//                 é vermelho (The Red Is Failure Rule, `DESIGN.md`);
//   `a_fazer`     TAREFA de alguém: o rascunho a emitir, o boleto a pedir, a
//                 lacuna de cadastro, a conta a pagar. Âmbar;
//   `nao_medido`  NÃO SE SABE: a camada sem medida, a situação que o conector
//                 ainda não leu. Âmbar com a interrogação;
//   `neutro`      NADA A FAZER AGORA: o que está em curso sem você (emitida,
//                 boleto a caminho, na vez, aguardando o banco), o que ainda vai
//                 vencer, o inativo, o cancelado, o verbo da trilha. Cinza.
//
// O «EM CURSO» É NEUTRO, E ESSA FOI A DECISÃO DA ETAPA. A alternativa era um
// sexto tom («em curso», um azul-navy) para Emitida. Não entrou: numa tela de
// trabalho a cor se gasta com o que pede alguém, e a emitida não pede — o
// cliente paga, o sistema acompanha. Cinza diz exatamente isso. O que distingue
// a emitida da cancelada, as duas cinza, é o desenho (o avião de papel contra o
// círculo cortado), a palavra e o lugar na lista (a cancelada vai por último).
//
// O ÍCONE MORA AQUI JUNTO COM A COR, e pelo mesmo motivo: o desenho também é
// um sinal de estado (restrição 3 do tema), e a crítica achou dois casos em que
// ele mentia — a CANCELADA com a lixeira, que lê como botão de apagar, e a
// conta EM ABERTO com o lápis, que é o desenho da lacuna de cadastro.
//
// ============================================================================
// COMO AS TELAS USAM
//
// `Marca` (ui.tsx) recebe um `Selo` — e só um `Selo`. Ela não aceita mais
// `tom=` solto: escolher a cor na tela não compila, e escrever o objeto à mão
// (`selo={{ … }}`) é recusado pela suíte. O aviso que fala do mesmo estado lê o
// tom daqui por `tipoDoAviso`, e por isso o aviso «2 contas vencidas» não tem
// mais como discordar do selo VENCIDA das linhas embaixo dele.

import { ICONE_DO_ESTADO, type NomeDeIcone, type TomDoSelo } from './iconografia.ts';
import type { StatusDaCobranca } from './emissao-regras.ts';
import type { NivelDaEmissao } from './emissao-travada.ts';
import type { FaixaDeAtraso, SituacaoDaCobranca as SituacaoDoBoleto } from './receber-regras.ts';
import type { SituacaoDaUc, SituacaoDoEndereco } from './unidades-regras.ts';
import type { SituacaoDoDocumento } from './clientes-regras.ts';
import type { MotivoDaEspera } from './repasse-pendente.ts';
import type { EstadoDoItem } from './lote-de-contas.ts';

/** O selo inteiro: a cor (pelo nome do que ela quer dizer) e o desenho. */
export type Selo = Readonly<{ tom: TomDoSelo; icone: NomeDeIcone }>;

/** Sem ícone próprio, o selo leva o desenho do tom (`ICONE_DO_ESTADO`). */
const selo = (tom: TomDoSelo, icone?: NomeDeIcone): Selo => ({ tom, icone: icone ?? ICONE_DO_ESTADO[tom] });

/* ==========================================================================
 * O DINHEIRO QUE ENTRA
 * ========================================================================== */

/** A COBRANÇA (`status_fatura`). Rascunho é tarefa — alguém emite —; emitida e
 *  negociada estão em curso sem você; paga fechou; vencida falhou; cancelada
 *  saiu da conta. Rascunho e Emitida NÃO dividem tom: era o defeito medido. */
export const SELO_DA_COBRANCA: Readonly<Record<StatusDaCobranca, Selo>> = {
  rascunho: selo('a_fazer', 'documento'),
  emitida: selo('neutro', 'emitir'),
  negociada: selo('neutro', 'donos'),
  paga: selo('ok'),
  vencida: selo('erro', 'vencidas'),
  cancelada: selo('neutro', 'cancelado'),
};

/**
 * O BOLETO DA COBRANÇA EMITIDA — a segunda linha da situação, em Cobranças, e
 * a linha do painel «O que ainda não chegou ao banco». As chaves são os níveis
 * de `/emissao/travada`, mais as duas recusas que a tela conhece por nome.
 *
 * A RECUSA É `erro` EM TODA TELA. O que muda quando o sistema já está tentando
 * de novo (`esperando`) não é a cor: é uma linha a mais, em tinta comum, dizendo
 * isso (`TENTANDO_DE_NOVO`). Até 01/10 essa mesma recusa saía cinza aqui, âmbar
 * no funil e vermelha em Contas a receber.
 *
 * A RECUSA PREVISTA NÃO É FALHA: ninguém pediu nada ainda, e o que existe é o
 * cadastro dizendo que o banco VAI recusar — lacuna, `a_fazer`, com o lápis.
 */
export const SELO_DO_BOLETO_DA_COBRANCA: Readonly<Record<NivelDaEmissao | 'recusa_prevista' | 'recusado', Selo>> = {
  nao_pedido: selo('a_fazer', 'boleto'),
  esquecido: selo('a_fazer', 'boleto'),
  recusa_prevista: selo('a_fazer'),
  recusado: selo('erro'),
  esperando: selo('erro'),
  insistindo: selo('erro'),
  parado: selo('erro'),
};

/** A linha a mais da recusa que o sistema já está retentando sozinho. */
export const TENTANDO_DE_NOVO = 'O sistema tenta de novo sozinho.';

/**
 * O BOLETO, VISTO DA CARTEIRA (Contas a receber e o painel da linha em
 * Cobranças). As seis situações de `receber-regras.ts`, mais as duas que só o
 * painel mostra (paga e cancelado no banco).
 *
 * Sem boleto e baixado são TAREFA — alguém pede (de novo) —; a caminho é o
 * pedido em curso, sem você; no banco e importado fecharam (o cliente pode
 * pagar); recusado é a falha.
 */
export const SELO_DO_BOLETO: Readonly<Record<SituacaoDoBoleto | 'boleto_pago' | 'boleto_cancelado', Selo>> = {
  sem_boleto: selo('a_fazer', 'boleto'),
  boleto_a_caminho: selo('neutro', 'a_receber'),
  boleto_no_banco: selo('ok', 'boleto'),
  boleto_importado: selo('ok', 'baixar'),
  boleto_recusado: selo('erro'),
  boleto_baixado: selo('a_fazer', 'boleto'),
  boleto_pago: selo('ok'),
  boleto_cancelado: selo('neutro', 'cancelado'),
};

/** O status cru do boleto no banco (`Boleto['status']`) na situação de cima. */
export function seloDoStatusDoBoleto(status: string): Selo {
  switch (status) {
    case 'pendente': return SELO_DO_BOLETO.boleto_a_caminho;
    case 'registrado': return SELO_DO_BOLETO.boleto_no_banco;
    case 'liquidado': return SELO_DO_BOLETO.boleto_pago;
    case 'baixado': return SELO_DO_BOLETO.boleto_baixado;
    case 'cancelado': return SELO_DO_BOLETO.boleto_cancelado;
    case 'erro': return SELO_DO_BOLETO.boleto_recusado;
    default: return SELO_DE_ORIGEM.desconhecido;
  }
}

/** DE ONDE O BOLETO VEIO — rótulo de fato, não estado: neutro. */
export const SELO_DE_ORIGEM: Readonly<Record<'emitido_no_banco' | 'desconhecido', Selo>> = {
  emitido_no_banco: selo('neutro', 'baixar'),
  /** O status que esta tela não conhece: não se sabe o que é. */
  desconhecido: selo('nao_medido'),
};

/**
 * O ATRASO (Contas a receber). A vencer é NEUTRO e não `ok`: o verde com o
 * visto dizia «resolvido» sobre um título que ninguém pagou ainda. Qualquer
 * atraso é `erro`, e todas as faixas de atraso têm o MESMO peso — «Mais de 90
 * dias» nunca parece mais leve que «Até 30».
 */
export const SELO_DO_ATRASO: Readonly<Record<FaixaDeAtraso, Selo>> = {
  a_vencer: selo('neutro', 'calendario'),
  ate_30: selo('erro', 'vencidas'),
  ate_60: selo('erro', 'vencidas'),
  ate_90: selo('erro', 'vencidas'),
  acima_90: selo('erro', 'vencidas'),
};

/** A FAIXA ZERADA no resumo por tempo de atraso: nada ali, e isso se sabe —
 *  neutro, e não a interrogação de «não se sabe» que ela usava até 01/10. */
export const SELO_DA_FAIXA_VAZIA: Selo = selo('neutro');

/** O selo de uma linha do resumo por faixa: o da faixa quando há título, o
 *  vazio quando não há. */
export const seloDaFaixa = (faixa: FaixaDeAtraso, titulos: number): Selo =>
  (titulos > 0 ? SELO_DO_ATRASO[faixa] : SELO_DA_FAIXA_VAZIA);

/* ==========================================================================
 * O DINHEIRO QUE SAI
 * ========================================================================== */

/** A CONTA A PAGAR. Em aberto é tarefa (pagar) — com o desenho da mão que
 *  entrega moedas, e não mais com o lápis do cadastro; vencida falhou. */
export const SELO_DA_CONTA_A_PAGAR: Readonly<Record<'aberta' | 'parcial' | 'paga' | 'cancelada' | 'vencida', Selo>> = {
  aberta: selo('a_fazer', 'a_pagar'),
  parcial: selo('a_fazer', 'a_pagar'),
  paga: selo('ok', 'confirmar'),
  cancelada: selo('neutro', 'cancelado'),
  vencida: selo('erro', 'vencidas'),
};

/** O DINHEIRO QUE ENTROU E AINDA NÃO FOI REPARTIDO. Aguardar o banco não é
 *  tarefa — o sistema pergunta todo dia e resolve sozinho —: neutro, com o
 *  relógio. Sem dono e pronto pedem alguém. */
export const SELO_DA_ESPERA_DO_REPASSE: Readonly<Record<MotivoDaEspera, Selo>> = {
  sem_dono: selo('a_fazer'),
  aguardando_banco: selo('neutro', 'a_receber'),
  pronto: selo('a_fazer', 'pode_repartir'),
};

/* ==========================================================================
 * O CADASTRO
 * ========================================================================== */

/** A UNIDADE CONSUMIDORA. Só `ativa` é verde: é a única que fatura. A
 *  cancelada ganhou o círculo cortado no lugar da lixeira. */
export const SELO_DA_UNIDADE: Readonly<Record<SituacaoDaUc, Selo>> = {
  ativa: selo('ok'),
  aguardando_ativacao: selo('neutro', 'a_receber'),
  em_troca_titularidade: selo('neutro', 'recarregar'),
  suspensa: selo('neutro'),
  situacao_nao_lida: selo('nao_medido'),
  cancelada: selo('neutro', 'cancelado'),
};

/** O ENDEREÇO DO PAGADOR. Incompleto é tarefa (com o lápis e a palavra do que
 *  falta); a recusa do banco, quando acontece, é a falha — em outro lugar. */
export const SELO_DO_ENDERECO: Readonly<Record<SituacaoDoEndereco, Selo>> = {
  vazio: selo('a_fazer'),
  parcial: selo('a_fazer'),
  completo: selo('ok'),
};

/** O CPF/CNPJ DO CLIENTE. A semente do CRM não está errada, está não
 *  confirmada: `nao_medido`. */
export const SELO_DO_DOCUMENTO: Readonly<Record<SituacaoDoDocumento, Selo>> = {
  sem_documento: selo('a_fazer'),
  digito_nao_confere: selo('a_fazer'),
  semente_do_crm: selo('nao_medido'),
  validado: selo('ok'),
};

/** O CONTRATO. Rascunho é a tarefa de ativar; suspender e encerrar são
 *  decisões, não falhas. */
export const SELO_DO_CONTRATO: Readonly<Record<'ativo' | 'rascunho' | 'suspenso' | 'encerrado', Selo>> = {
  ativo: selo('ok'),
  rascunho: selo('a_fazer'),
  suspenso: selo('neutro'),
  encerrado: selo('neutro'),
};

/** O status do contrato como vem do banco (texto livre na API). */
export const seloDoContrato = (status: string): Selo =>
  SELO_DO_CONTRATO[status as keyof typeof SELO_DO_CONTRATO] ?? SELO_DO_CONTRATO.encerrado;

/** CLIENTE, DONO DE USINA, USINA: ativo ou não. */
export const SELO_DO_CADASTRO: Readonly<Record<'ativo' | 'inativo', Selo>> = {
  ativo: selo('ok'),
  inativo: selo('neutro'),
};

/** A ENERGIA DO MÊS DE UMA USINA: lançada ou a lançar. */
export const SELO_DA_GERACAO: Readonly<Record<'lancada' | 'falta', Selo>> = {
  lancada: selo('ok', 'confirmar'),
  falta: selo('a_fazer'),
};

/** UMA LINHA DO MÊS (as conferências da tela Mês). `pendente` é tarefa. */
export const SELO_DA_CONFERENCIA: Readonly<Record<'ok' | 'pendente' | 'nao_medido', Selo>> = {
  ok: selo('ok'),
  pendente: selo('a_fazer'),
  nao_medido: selo('nao_medido'),
};

/** O QUE A LEITURA DO OUTRO SISTEMA ACHOU. A recusa é falha (a linha não foi
 *  gravada); a divergência e a revisão são coisa a olhar — tarefa. */
export const SELO_DA_LEITURA_DO_CRM: Readonly<Record<'recusa' | 'revisão' | 'divergência', Selo>> = {
  recusa: selo('erro'),
  'revisão': selo('a_fazer'),
  'divergência': selo('a_fazer'),
};

/** OS DEGRAUS DO CONECTOR (Conector Sicoob): pronto. */
export const SELO_DO_DEGRAU: Readonly<Record<'pronto', Selo>> = {
  pronto: selo('ok'),
};

/** QUEM É A PESSOA NA LISTA DE USUÁRIOS — rótulo, não estado: neutro. */
export const SELO_DA_PESSOA: Readonly<Record<'voce' | 'conta_do_sistema', Selo>> = {
  voce: selo('neutro', 'usuario'),
  conta_do_sistema: selo('neutro', 'cobranca'),
};

/** O VERBO DA TRILHA (Histórico). Um verbo de auditoria é FATO, não estado: os
 *  três são neutros, e o desenho diz qual — o mais, as setas da troca, a
 *  lixeira. Até 01/10 «Alterou» era âmbar, a cor de tarefa. */
export const SELO_DA_TRILHA: Readonly<Record<'I' | 'U' | 'D', Selo>> = {
  I: selo('neutro', 'acrescentar'),
  U: selo('neutro', 'alterou'),
  D: selo('neutro', 'remover'),
};

/* ==========================================================================
 * OS ATOS EM SÉRIE — o que acontece enquanto a pessoa olha
 * ========================================================================== */

/** «Emitir N cobranças» e «Pedir os N boletos», linha a linha. Esperar a vez e
 *  estar sendo feita são EM CURSO, sem você: neutro. */
export const SELO_DA_VEZ: Readonly<Record<'na_vez' | 'andando' | 'feita' | 'recusada', Selo>> = {
  na_vez: selo('neutro', 'a_receber'),
  andando: selo('neutro', 'carregando'),
  feita: selo('ok', 'confirmar'),
  recusada: selo('erro'),
};

/** A FILA DE CONTAS DE LUZ, linha a linha. `lido` se divide em dois pela
 *  conferência: falta corrigir (tarefa) ou conferida (fechou). */
export const SELO_DA_LEITURA: Readonly<Record<Exclude<EstadoDoItem, 'lido'> | 'corrigir' | 'conferida', Selo>> = {
  na_fila: selo('neutro', 'a_receber'),
  lendo: selo('neutro', 'carregando'),
  registrando: selo('neutro', 'carregando'),
  registrado: selo('ok', 'confirmar'),
  falhou: selo('erro'),
  corrigir: selo('a_fazer'),
  conferida: selo('ok'),
};

/** A CONTA REGISTRADA e a cobrança dela. «Sem cobrança» é o trabalho do passo
 *  2 — tarefa, com o recibo —, e «Registrada» numa base que não diz se há
 *  cobrança é `nao_medido`: não se sabe. */
export const SELO_DO_REGISTRO: Readonly<Record<'gerando' | 'gerada' | 'recusada' | 'na_vez' | 'sem_ligacao' | 'sem_cobranca' | 'conferindo', Selo>> = {
  gerando: selo('neutro', 'carregando'),
  gerada: selo('ok', 'confirmar'),
  recusada: selo('erro'),
  na_vez: selo('neutro', 'a_receber'),
  sem_ligacao: selo('nao_medido'),
  sem_cobranca: selo('a_fazer', 'faturas'),
  conferindo: selo('neutro', 'carregando'),
};

/* ==========================================================================
 * O AVISO QUE FALA DE UM ESTADO
 * ========================================================================== */

/**
 * O tipo do `Aviso` que fala do mesmo estado que um selo. O aviso tem três cores
 * (erro, alerta, ok) e o selo cinco: a tarefa e o não medido são o alerta; o
 * neutro não vira aviso nenhum — um aviso cinza é um parágrafo, e se não pede
 * nada não deveria ser aviso.
 */
export function tipoDoAviso(s: Pick<Selo, 'tom'>): 'erro' | 'alerta' | 'ok' {
  if (s.tom === 'erro') return 'erro';
  if (s.tom === 'ok') return 'ok';
  return 'alerta';
}

/* ==========================================================================
 * O MAPA INTEIRO, para quem precisa percorrê-lo (a suíte, o DESIGN.md)
 * ========================================================================== */

export const MAPA_DE_SELOS: Readonly<Record<string, Readonly<Record<string, Selo>>>> = {
  cobranca: SELO_DA_COBRANCA,
  boleto_da_cobranca: SELO_DO_BOLETO_DA_COBRANCA,
  boleto: SELO_DO_BOLETO,
  origem: SELO_DE_ORIGEM,
  atraso: { ...SELO_DO_ATRASO, faixa_vazia: SELO_DA_FAIXA_VAZIA },
  conta_a_pagar: SELO_DA_CONTA_A_PAGAR,
  espera_do_repasse: SELO_DA_ESPERA_DO_REPASSE,
  unidade: SELO_DA_UNIDADE,
  endereco: SELO_DO_ENDERECO,
  documento: SELO_DO_DOCUMENTO,
  contrato: SELO_DO_CONTRATO,
  cadastro: SELO_DO_CADASTRO,
  geracao: SELO_DA_GERACAO,
  conferencia: SELO_DA_CONFERENCIA,
  leitura_do_crm: SELO_DA_LEITURA_DO_CRM,
  degrau: SELO_DO_DEGRAU,
  pessoa: SELO_DA_PESSOA,
  trilha: SELO_DA_TRILHA,
  vez: SELO_DA_VEZ,
  leitura: SELO_DA_LEITURA,
  registro: SELO_DO_REGISTRO,
};
