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
import { diaEmBr } from './formato.ts';

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
  /** O que JA foi pago nesta conta. Chega junto da lista desde 10/09/2026 —
   *  antes dela, pagar era um ato sem recibo dentro do proprio sistema. */
  pagamento?: readonly PagamentoDaConta[];
};

/** Um pagamento registrado. Espelha `pagamento` do banco. */
export type PagamentoDaConta = {
  id: string;
  data_pagamento: string;
  valor_centavos: number;
  forma: FormaDePagamento;
  referencia_externa: string | null;
  observacao: string | null;
};

export type FormaDePagamento =
  'pix' | 'ted' | 'doc' | 'boleto' | 'dinheiro' | 'compensacao' | 'cartao_credito' | 'debito_automatico';

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
    /* [30/09/2026, etapa 4b] O CODIGO DA QUESTAO SAIU DA FRASE: ela aparece na
       dica do botao, para quem opera, e «Q-ESTORNO-01» nao dizia nada a essa
       pessoa. O rastreio continua no QUESTOES.md e na suite (C5b). */
    return nao('Esta conta já tem pagamento registrado. Desfazer seria um estorno, e o sistema '
             + 'ainda não faz estorno.');
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
  /* [01/10/2026, etapa 7c] «Paga em parte», e não «Parcialmente paga»: o mesmo
     dito em palavras curtas. A palavra longa sozinha decidia a largura da
     coluna «Situação» na tabela de 1440 — e quem pagava eram a descrição e o
     beneficiário, que quebravam em cinco linhas. */
  parcial: 'Paga em parte',
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
  /* As duas da planilha da empresa (02/10/2026, migration 42). */
  cartao_credito: 'Cartão de crédito',
  debito_automatico: 'Débito automático',
};

/**
 * O RECIBO DA CONTA — o que foi pago, quando, e se ainda falta.
 *
 * POR QUE ISTO E UMA FUNCAO E NAO UMA CONTAGEM NA TELA: a frase muda com o
 * ESTADO, e cada estado significa uma coisa diferente para quem opera.
 *
 *   nunca pago       "nada pago ainda" — e nao "0 pagamentos", que soa a defeito;
 *   pago em uma vez  a data resolve a pergunta inteira, sem abrir nada;
 *   pago em partes   a contagem e o que importa, e o resto esta na lista;
 *   pago sem recibo  ⚠️ o saldo diz que foi pago e nao ha pagamento registrado.
 *
 * O ULTIMO CASO E O QUE JUSTIFICA A FUNCAO. `valor_pago_centavos` e mantido por
 * gatilho a partir da tabela de pagamentos, entao os dois so divergem se alguem
 * mexer no banco por fora — e quando isso acontece, o numero que a tela mostra
 * deixa de ter historia por tras. Dizer isso e melhor que somar em silencio.
 */
export function recibo(c: ContaAPagar): { frase: string; alerta: boolean } {
  const ps = c.pagamento ?? [];
  if (ps.length === 0) {
    if (c.valor_pago_centavos > 0) {
      return {
        frase: `${emReais(c.valor_pago_centavos)} constam como pagos, sem nenhum pagamento registrado`,
        alerta: true,
      };
    }
    return { frase: 'nada pago ainda', alerta: false };
  }
  if (ps.length === 1) {
    return { frase: `pago em ${emBr(ps[0]!.data_pagamento)}`, alerta: false };
  }
  return { frase: `${ps.length} pagamentos, o último em ${emBr(ps[ps.length - 1]!.data_pagamento)}`, alerta: false };
}

/** Data ISO do banco na forma brasileira. [30/09/2026, etapa 4b] E o
 *  `diaEmBr` de `formato.ts` — o formato do dia e um so no sistema inteiro, e
 *  este nome fica porque as telas e a suite o importam daqui. */
export const emBr = diaEmBr;

export const ROTULO_DO_BENEFICIARIO: Record<ContaAPagar['beneficiario_tipo'], string> = {
  dono_usina: 'Dono de usina',
  originador: 'Quem trouxe o cliente',
  concessionaria: 'Concessionária',
  outro: 'Outro',
};

// ------------------------------------------------- a lista, vinda do servidor

/**
 * UM BLOCO DA LISTA, como `GET /contas-a-pagar` devolve desde 03/10/2026.
 *
 * Até essa data a rota devolvia a tabela inteira até 500, ordenada por
 * vencimento crescente, e a tela filtrava, ordenava e somava aqui. Acima de 500
 * as contas MAIS NOVAS sumiam sem aviso, e os totais eram somados sobre o que
 * tinha chegado. Agora quem busca, filtra, ordena e soma é o servidor
 * (`src/dominio/lista-de-contas.ts`); a tela mostra o bloco e diz quanto falta.
 */
export type BlocoDeContas = {
  itens: ContaAPagar[];
  /** Quantas casam com a busca e a situação. */
  total: number;
  /** Quantas existem, sem busca nem filtro. */
  total_geral: number;
  inicio: number;
  limite: number;
  /** O dia de Goiânia que o servidor usou para «vencida» (AAAA-MM-DD). */
  hoje: string;
  /** Da tabela INTEIRA: não encolhem com a busca nem com o filtro. */
  totais: {
    em_aberto: { qtd: number; saldo_centavos: number };
    vencidas: { qtd: number; saldo_centavos: number };
  };
};

export type PedidoDaLista = {
  busca: string;
  situacao: '' | ContaAPagar['status'];
  ordem: string;
  desc: boolean;
  inicio?: number;
  limite?: number;
};

/** A query string do pedido. O que está vazio não vai — o servidor tem padrão. */
export function consultaDaLista(p: PedidoDaLista): string {
  const q = new URLSearchParams();
  if (p.busca.trim()) q.set('busca', p.busca.trim());
  if (p.situacao) q.set('situacao', p.situacao);
  if (p.ordem && p.ordem !== 'vencimento') q.set('ordem', p.ordem);
  if (p.desc) q.set('desc', '1');
  if (p.inicio) q.set('inicio', String(p.inicio));
  if (p.limite) q.set('limite', String(p.limite));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * O «HOJE» DO SERVIDOR COMO `Date` LOCAL, ao meio-dia. `estaAtrasada` compara
 * o dia local de um `Date`; um `new Date('2026-10-03')` seria meia-noite UTC —
 * no Brasil, 21h do dia 2, e a conta que vence dia 3 sairia vencida. O
 * meio-dia fica longe das duas bordas.
 */
export const hojeDoServidor = (dia: string): Date => new Date(`${dia}T12:00:00`);

/**
 * OS BLOCOS QUE A PESSOA JÁ PEDIU, presos ao primeiro (mesma amarra do
 * Histórico, `web/src/historico.ts`): trocar a busca, o filtro ou a ordem relê o
 * primeiro bloco, e os seguintes da consulta velha somem — inclusive uma
 * resposta que chega depois da troca, porque ela traz a `base` antiga.
 */
export type BlocosSeguintes = {
  base: BlocoDeContas | null;
  itens: ContaAPagar[];
  /** Quantos blocos já vieram depois do primeiro. Conta à parte porque a
   *  deduplicação faz `itens.length` deixar de dizer quanto foi lido. */
  blocos: number;
};

export const semSeguintes = (base: BlocoDeContas | null): BlocosSeguintes => ({ base, itens: [], blocos: 0 });

export const seguintesDe = (s: BlocosSeguintes, base: BlocoDeContas | null): BlocosSeguintes =>
  (s.base === base ? s : semSeguintes(base));

/** Acrescenta um bloco. Conta que já está na tela não entra de novo: entre um
 *  clique e outro uma conta pode ter mudado de lugar na ordem. */
export function acrescentarBloco(s: BlocosSeguintes, bloco: BlocoDeContas): BlocosSeguintes {
  const vistas = new Set([...(s.base?.itens ?? []), ...s.itens].map((c) => c.id));
  return {
    base: s.base,
    itens: [...s.itens, ...bloco.itens.filter((c) => !vistas.has(c.id))],
    blocos: s.blocos + 1,
  };
}

/** Onde o próximo bloco começa: logo depois do último que foi PEDIDO. */
export const inicioDoProximo = (s: BlocosSeguintes): number =>
  (s.base ? s.base.inicio + s.base.limite * (1 + s.blocos) : 0);

/**
 * HÁ MAIS PARA MOSTRAR? Medido pelo deslocamento contra o total, e não pelo que
 * está na tela: com uma repetida descartada, «na tela» ficaria uma abaixo do
 * total para sempre, e o botão nunca sumiria.
 */
export const haMaisContas = (s: BlocosSeguintes): boolean =>
  s.base !== null && inicioDoProximo(s) < s.base.total;

/**
 * A CONTAGEM DA LISTA, dita como fato: «12 de 312», e quando a busca ou o filtro
 * recortam, de quantas no total. É a frase que impede «a lista acabou» de ser
 * confundido com «a lista foi cortada» — a disciplina do DESIGN.md, «sem
 * paginação escondida».
 */
export function contagemDaLista(carregadas: number, b: Pick<BlocoDeContas, 'total' | 'total_geral'>): string {
  const recorte = b.total !== b.total_geral ? ` (de ${b.total_geral} no total)` : '';
  if (carregadas >= b.total) return `${b.total} ${b.total === 1 ? 'conta' : 'contas'}${recorte}`;
  return `${carregadas} de ${b.total}${recorte}`;
}

/**
 * O CSV LEVA TUDO O QUE CASA COM O FILTRO, e não o que está na tela. Com a
 * lista em blocos, exportar só o carregado entregaria uma planilha cortada sem
 * aviso — o defeito que esta lista existe para não ter. Lê bloco a bloco, na
 * ordem da tela, até o total que o servidor disse; repetida não entra duas vezes.
 */
export async function lerTodasAsContas(
  buscar: (inicio: number, limite: number) => Promise<BlocoDeContas>, limite = 500,
): Promise<ContaAPagar[]> {
  const todas: ContaAPagar[] = [];
  const vistas = new Set<string>();
  for (let inicio = 0; ; inicio += limite) {
    const b = await buscar(inicio, limite);
    for (const c of b.itens) if (!vistas.has(c.id)) { vistas.add(c.id); todas.push(c); }
    if (b.itens.length === 0 || inicio + limite >= b.total) return todas;
  }
}
