// CONTAS A RECEBER — as regras, puras e fora do `.tsx` (regra 8).
//
// ============================================================================
// O QUE ESTE ARQUIVO DECIDE, e por que fora da tela
//
// A tela de Contas a receber responde três perguntas com a MESMA lista de
// títulos: «quanto está atrasado, e há quanto tempo», «quem mais deve» e «esta
// fatura tem como ser paga hoje?». As três são contas sobre datas e sobre o
// estado do boleto, e o runner do `web/` não lê JSX — regra dentro do componente
// seria regra sem teste. `web/tests/receber.ts` é a suíte.
//
// TODA CONTA DE DIA PARTE DO `hoje` DO SERVIDOR (`ContasAReceber.hoje`), e não
// de `new Date()`: «3 dias de atraso» é afirmação sobre o sistema, e não pode
// mudar conforme o fuso ou o relógio da máquina de quem abriu a tela. É a mesma
// decisão de `ha_quanto_tempo_segundos` nas automações.

import type { TituloAReceber } from './api.ts';

export type { TituloAReceber };

// ------------------------------------------------------------- o atraso

const DIA_MS = 86_400_000;

/** `AAAA-MM-DD` -> meia-noite UTC. Só a DATA importa aqui; horário e fuso são
 *  ruído que faria o mesmo título ter 2 dias de atraso numa máquina e 3 noutra. */
const diaUtc = (iso: string): number => {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(a!, m! - 1, d!);
};

/** Dias que o vencimento já passou. Zero no dia; NEGATIVO quando ainda vai vencer. */
export function diasDeAtraso(vencimentoISO: string, hojeISO: string): number {
  return Math.round((diaUtc(hojeISO) - diaUtc(vencimentoISO)) / DIA_MS);
}

/**
 * AS CINCO FAIXAS DO RELATÓRIO DE IDADE («aging»), e por que estes cortes.
 *
 * 30/60/90 é a convenção que contador e banco usam para ler carteira, e a
 * planilha que a G3 mantinha antes deste sistema já cortava assim. Inventar
 * outros cortes obrigaria quem compara com a planilha a refazer a conta.
 *
 * «Vence hoje» É A VENCER, não atraso: o boleto vale o dia inteiro.
 */
export type FaixaDeAtraso = 'a_vencer' | 'ate_30' | 'ate_60' | 'ate_90' | 'acima_90';

export const FAIXAS: readonly FaixaDeAtraso[] = ['a_vencer', 'ate_30', 'ate_60', 'ate_90', 'acima_90'];

export const ROTULO_DA_FAIXA: Record<FaixaDeAtraso, string> = {
  a_vencer: 'A vencer',
  ate_30: 'Até 30 dias',
  ate_60: '31 a 60 dias',
  ate_90: '61 a 90 dias',
  acima_90: 'Mais de 90 dias',
};

/** Os três tons do sistema, e só eles: a vencer é `ok` (nada de errado), qualquer
 *  atraso é `pendente` (há trabalho — cobrar). O ícone e o texto carregam a
 *  gravidade; a cor nunca é o único sinal (restrição 3 do tema). */
export const TOM_DA_FAIXA: Record<FaixaDeAtraso, 'ok' | 'pendente' | 'nao_medido'> = {
  a_vencer: 'ok', ate_30: 'pendente', ate_60: 'pendente', ate_90: 'pendente', acima_90: 'pendente',
};

export function faixaDeAtraso(vencimentoISO: string, hojeISO: string): FaixaDeAtraso {
  const d = diasDeAtraso(vencimentoISO, hojeISO);
  if (d <= 0) return 'a_vencer';
  if (d <= 30) return 'ate_30';
  if (d <= 60) return 'ate_60';
  if (d <= 90) return 'ate_90';
  return 'acima_90';
}

/** A frase da coluna, em português e no singular certo. */
export function fraseDoAtraso(dias: number): string {
  if (dias === 0) return 'vence hoje';
  if (dias < 0) return dias === -1 ? 'vence amanhã' : `vence em ${-dias} dias`;
  return dias === 1 ? '1 dia de atraso' : `${dias} dias de atraso`;
}

// ------------------------------------------------------- a cobrança do título

/**
 * O QUE O BOLETO DIZ SOBRE A CHANCE DE ESTE TÍTULO SER PAGO, em seis estados que
 * a pessoa entende — e não os seis status crus do banco.
 *
 * A distinção que importa para quem olha o caixa: «sem boleto» e «boleto
 * baixado» são títulos que o cliente NÃO TEM COMO pagar, por mais que queira.
 * Isso não é atraso do cliente — é cobrança que não saiu, e a tela precisa
 * separar as duas coisas, senão o analista cobra quem nunca recebeu o boleto.
 */
export type SituacaoDaCobranca =
  | 'sem_boleto'        // ninguém pediu
  | 'boleto_a_caminho'  // pedido, ainda não registrado
  | 'boleto_no_banco'   // registrado pela nossa porta — pagável
  | 'boleto_importado'  // emitido no portal e transcrito — pagável, conferido a mão
  | 'boleto_recusado'   // o banco recusou; o sistema tenta de novo
  | 'boleto_baixado';   // baixado ou cancelado no banco — não pagável

export function situacaoDaCobranca(b: TituloAReceber['boleto']): SituacaoDaCobranca {
  if (!b) return 'sem_boleto';
  if (b.status === 'registrado' || b.status === 'liquidado') {
    return b.origem === 'importado' ? 'boleto_importado' : 'boleto_no_banco';
  }
  if (b.status === 'pendente') return 'boleto_a_caminho';
  if (b.status === 'erro') return 'boleto_recusado';
  return 'boleto_baixado';
}

export const SITUACOES: readonly SituacaoDaCobranca[] = [
  'sem_boleto', 'boleto_a_caminho', 'boleto_no_banco', 'boleto_importado', 'boleto_recusado', 'boleto_baixado',
];

export const ROTULO_DA_SITUACAO: Record<SituacaoDaCobranca, string> = {
  sem_boleto: 'Sem boleto',
  boleto_a_caminho: 'Boleto a caminho',
  boleto_no_banco: 'Boleto no banco',
  boleto_importado: 'Boleto importado',
  boleto_recusado: 'Boleto recusado pelo banco',
  boleto_baixado: 'Boleto baixado no banco',
};

export const TOM_DA_SITUACAO: Record<SituacaoDaCobranca, 'ok' | 'pendente' | 'nao_medido'> = {
  sem_boleto: 'pendente',
  boleto_a_caminho: 'nao_medido',
  boleto_no_banco: 'ok',
  boleto_importado: 'ok',
  boleto_recusado: 'pendente',
  boleto_baixado: 'pendente',
};

/** Só o título com boleto vivo no banco pode ser pago hoje. */
export const podeSerPaga = (s: SituacaoDaCobranca): boolean =>
  s === 'boleto_no_banco' || s === 'boleto_importado';

// ------------------------------------------------------------- as somas

export const valorCentavos = (t: Pick<TituloAReceber, 'valor_total_centavos'>): number =>
  t.valor_total_centavos ?? 0;

export const totalCentavos = (ts: readonly Pick<TituloAReceber, 'valor_total_centavos'>[]): number =>
  ts.reduce((a, t) => a + valorCentavos(t), 0);

export type LinhaPorFaixa = { faixa: FaixaDeAtraso; titulos: number; centavos: number };

/** Sempre as CINCO faixas, inclusive as zeradas: uma tabela de idade que omite a
 *  faixa vazia faz quem compara com o mês passado achar que a linha sumiu. */
export function porFaixa(ts: readonly TituloAReceber[], hojeISO: string): LinhaPorFaixa[] {
  const soma = new Map<FaixaDeAtraso, LinhaPorFaixa>(
    FAIXAS.map((f) => [f, { faixa: f, titulos: 0, centavos: 0 }]));
  for (const t of ts) {
    const l = soma.get(faixaDeAtraso(t.vencimento, hojeISO))!;
    l.titulos += 1;
    l.centavos += valorCentavos(t);
  }
  return FAIXAS.map((f) => soma.get(f)!);
}

export type Devedor = {
  cliente_id: string;
  cliente: string;
  titulos: number;
  centavos: number;
  vencido_centavos: number;
  /** O atraso do título mais antigo. Zero quando nada venceu. */
  maior_atraso_dias: number;
};

/**
 * QUEM MAIS DEVE, por cliente e não por unidade: um cliente com três unidades é
 * UMA pessoa a quem se liga. Ordem: quem tem mais VENCIDO primeiro, depois quem
 * tem mais em aberto, depois o nome — o que está atrasado é o que pede ação.
 */
export function porCliente(ts: readonly TituloAReceber[], hojeISO: string): Devedor[] {
  const por = new Map<string, Devedor>();
  for (const t of ts) {
    const d = por.get(t.cliente_id) ?? {
      cliente_id: t.cliente_id, cliente: t.cliente, titulos: 0, centavos: 0,
      vencido_centavos: 0, maior_atraso_dias: 0,
    };
    const atraso = diasDeAtraso(t.vencimento, hojeISO);
    d.titulos += 1;
    d.centavos += valorCentavos(t);
    if (atraso > 0) {
      d.vencido_centavos += valorCentavos(t);
      d.maior_atraso_dias = Math.max(d.maior_atraso_dias, atraso);
    }
    por.set(t.cliente_id, d);
  }
  return [...por.values()].sort((a, b) =>
    b.vencido_centavos - a.vencido_centavos
    || b.centavos - a.centavos
    || a.cliente.localeCompare(b.cliente, 'pt-BR'));
}

// ---------------------------------------------------------- a truncagem

/** A frase que diz que a lista não é a carteira inteira — `null` quando é. A
 *  lista muda quando trunca, então o texto não pode ser um rodapé fixo. */
export function avisoDeTruncagem(total: number, mostradas: number): string | null {
  if (total <= mostradas) return null;
  return `Mostrando os ${mostradas} títulos mais antigos de ${total} em aberto. Os números do topo `
       + 'e as tabelas de atraso e de clientes contam só o que está na lista.';
}
