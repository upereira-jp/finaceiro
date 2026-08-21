// AS REGRAS DA TELA DE CONTAS A PAGAR, puras e fora do `.tsx`.
//
// POR QUE FORA. Regra 8, e o mesmo motivo de `contrato-regras.ts` e
// `cobranca-regras.ts`: o runner do `web/` e `node --experimental-strip-types` e
// NAO le JSX. Regra dentro do componente e inalcancavel por teste.
//
// O QUE MORA AQUI, e sao tres coisas que a tela nao pode decidir sozinha:
//
//   1. O ESPELHO DAS TRANSICOES DO SERVIDOR. Cada trava cita a linha que manda.
//      Isto NAO substitui a do servidor - duplica de proposito, para o botao
//      apagar antes de o usuario clicar. Se as duas divergirem, quem vence e o
//      servidor, e o teste existe para elas nao divergirem.
//   2. O SALDO. Quanto ainda falta pagar de uma conta, em CENTAVOS e por
//      subtracao de inteiros. Regra 1 vale no browser tambem.
//   3. O QUE E "ATRASADA". A comparacao e por DIA, nao por instante - uma conta
//      que vence hoje nao esta atrasada as 14h e nao-atrasada as 9h.
//
// E DINHEIRO SO SE FORMATA POR `emReais`. A primeira versao desta mensagem
// usava `(saldo/100).toFixed(2)` e imprimia "1000,00" onde o resto do sistema
// diz "R$ 1.000,00" - pego pelo `C4c`. Duas formatacoes de dinheiro na mesma
// tela e como duas telas passam a discordar, com a diferenca de que aqui a
// discordancia aparece na frase que explica por que o botao travou.

import { emReais } from './dinheiro.ts';

/** A forma que a rota devolve. Espelha `conta_pagar` do banco. */
export type ContaAPagar = {
  id: string;
  descricao: string;
  beneficiario_tipo: 'dono_usina' | 'originador' | 'concessionaria' | 'outro';
  beneficiario_nome: string | null;
  dono_usina?: { nome: string } | null;
  originador?: { nome: string } | null;
  categoria?: { nome: string } | null;
  valor_centavos: number;
  valor_pago_centavos: number;
  competencia: string;
  vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'cancelada';
  origem_split_item_id: string | null;
};

export type FormaDePagamento = 'pix' | 'ted' | 'doc' | 'boleto' | 'dinheiro' | 'compensacao';

/**
 * QUANTO AINDA FALTA. Subtracao de inteiros, sem float em ponto nenhum.
 *
 * Nunca negativo: o banco tem `conta_pagar_nao_paga_demais`, entao pago > devido
 * nao existe - mas o `Math.max` fica porque um saldo negativo na TELA seria lido
 * como credito, e a tela nao deve inventar um conceito que o schema nao tem.
 */
export const saldoCentavos = (c: Pick<ContaAPagar, 'valor_centavos' | 'valor_pago_centavos'>): number =>
  Math.max(0, c.valor_centavos - c.valor_pago_centavos);

/** O nome de quem recebe, venha de onde vier. Uma so funcao porque a tela, o CSV
 *  e o resumo tem de dizer o MESMO nome - tres coalesces espalhados divergem. */
export function nomeDoBeneficiario(c: ContaAPagar): string {
  return c.dono_usina?.nome ?? c.originador?.nome ?? c.beneficiario_nome ?? '(sem nome)';
}

/**
 * ATRASADA? Comparacao por DIA, nao por instante.
 *
 * `hoje` entra como parametro em vez de vir de `new Date()` aqui dentro: uma
 * funcao que le o relogio nao e testavel em nenhuma das bordas, e as bordas sao
 * exatamente o que interessa - vence hoje, venceu ontem.
 */
export function estaAtrasada(c: ContaAPagar, hoje: Date): boolean {
  if (c.status === 'paga' || c.status === 'cancelada') return false;
  return c.vencimento.slice(0, 10) < diaISO(hoje);
}

export const diaISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ------------------------------------------------- as travas, com a fonte

export type Trava = { pode: false; porque: string } | { pode: true };
const nao = (porque: string): Trava => ({ pode: false, porque });
const sim: Trava = { pode: true };

/**
 * PAGAR. Espelha `registrarPagamento` de `src/repos/conta_pagar.ts` e o CHECK
 * `conta_pagar_nao_paga_demais` da migration 22.
 */
export function podePagar(c: ContaAPagar, valorCentavos: number): Trava {
  if (c.status === 'cancelada') {
    return nao('Esta conta foi cancelada, e conta cancelada não recebe pagamento.');
  }
  if (c.status === 'paga') {
    return nao('Esta conta já está paga por inteiro. Registrar de novo pagaria duas vezes o mesmo título.');
  }
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    return nao('O valor do pagamento precisa ser maior que zero.');
  }
  const saldo = saldoCentavos(c);
  if (valorCentavos > saldo) {
    return nao(`O valor excede o saldo. Faltam ${emReais(saldo)} nesta conta.`);
  }
  return sim;
}

/**
 * CANCELAR. Espelha `cancelar` do repo: conta com pagamento registrado nao se
 * cancela, porque isso deixaria um pagamento apontando para um titulo que "nao
 * existe" - a mesma razao da R46 na fatura liquidada.
 */
export function podeCancelar(c: ContaAPagar): Trava {
  if (c.status === 'cancelada') return nao('Esta conta já está cancelada.');
  if (c.valor_pago_centavos > 0) {
    return nao('Esta conta já tem pagamento registrado. Desfazer é estorno, e o estorno ainda '
             + 'não tem caminho decidido (Q-ESTORNO-01).');
  }
  return sim;
}

/**
 * CRIAR A MAO. A tela so cria conta de beneficiario `outro`.
 *
 * Repasse e comissao nascem do SPLIT, na transacao da baixa, e so de la - um
 * segundo caminho provisionaria a mesma despesa duas vezes ao mesmo
 * beneficiario, e as duas se somariam sem ninguem notar.
 */
export function podeCriar(e: {
  descricao: string; beneficiario_nome: string; valorCentavos: number;
  competencia: string; vencimento: string;
}): Trava {
  if (!e.descricao.trim()) return nao('A descrição é obrigatória — sem ela a lista de contas não se lê.');
  if (!e.beneficiario_nome.trim()) return nao('Diga quem recebe. Uma despesa sem dono é o mesmo que não registrar.');
  if (!Number.isInteger(e.valorCentavos) || e.valorCentavos <= 0) return nao('O valor precisa ser maior que zero.');
  if (!/^\d{4}-\d{2}$/.test(e.competencia)) return nao('Informe o mês de referência.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vencimento)) return nao('Informe o vencimento.');
  return sim;
}

/** O rotulo de cada situacao. Fechado por `Record`, entao status novo no banco
 *  NAO COMPILA aqui sem alguem escolher como ele se chama na tela. */
export const ROTULO_DO_STATUS: Record<ContaAPagar['status'], string> = {
  aberta: 'Em aberto',
  parcial: 'Parcialmente paga',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

export const ROTULO_DA_FORMA: Record<FormaDePagamento, string> = {
  pix: 'Pix',
  ted: 'TED',
  doc: 'DOC',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  /* NAO e "outro". Compensacao e encontro de contas: o beneficiario devia algo a
   * G3 e a divida foi abatida, sem dinheiro sair. Chamar isso de Pix faria a
   * conciliacao bancaria nunca fechar. */
  compensacao: 'Compensação (encontro de contas)',
};

export const ROTULO_DO_BENEFICIARIO: Record<ContaAPagar['beneficiario_tipo'], string> = {
  dono_usina: 'Dono de usina',
  originador: 'Quem trouxe o cliente',
  concessionaria: 'Concessionária',
  outro: 'Outro',
};
