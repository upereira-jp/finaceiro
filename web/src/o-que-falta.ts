// O QUE FALTA, UNIDADE POR UNIDADE — a lista por trás de cada número do Mês.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU (01/10/2026, etapa 7a do redesenho)
//
// A tela Mês diz, com precisão, QUANTAS unidades estão travadas: «Contrato ativo
// (6 unidades)», «15 contas a ler», «Quem trouxe o cliente (2 de 35)». E o
// link de cada número levava a uma tela que não sabia quais eram. Contratos
// listava os 37 contratos que EXISTEM — as 6 unidades sem contrato não
// apareciam em lugar nenhum —, e Contas de luz listava as 26 contas já lidas,
// sem dizer quais 15 faltavam. A crítica de 01/10 (P1 nº 1) mediu o custo: a
// analista da primeira semana abre 37 contratos sem saber quais 6 faltam.
//
// AS LISTAS SAEM DAS LEITURAS QUE AS TELAS JÁ FAZEM — unidades, contratos
// vigentes, clientes, contas registradas —, sem rota nova no servidor. E cada
// uma usa o MESMO predicado da camada da prontidão que ela detalha
// (`src/repos/prontidao.ts`), porque a regra 2 de `destino-da-camada.ts` vale
// aqui inteira: uma lista que não casa com a contagem manda a pessoa conferir
// um número contra outro e concluir que um dos dois mentiu.
//
//   unidades sem contrato ativo   `uc_ativa` sem contrato `ativo` na unidade —
//                                 a faturável (`ehFaturavel`, o espelho da
//                                 triagem) sem contrato ATIVO. A suspensa
//                                 conta: ela ocupa a unidade (R14) e não fatura;
//   contrato sem quem trouxe      contrato `ativo` numa unidade faturável, com
//                                 `originador_id` nulo — `uc_contratada` da
//                                 camada `originador_do_contrato`;
//   contas que faltam ler         a faturável sem conta registrada NAQUELE mês,
//                                 casada pelo número da unidade, como a junção
//                                 `conta_do_mes` do servidor;
//   sem endereço para o boleto    [etapa 7b] a faturável com contrato ativo sem
//                                 o endereço que o banco exige — `uc_contratada`
//                                 da camada `endereco_do_pagador`.
//
// `.ts` PURO, e pelo motivo de sempre: o runner do `web/` não lê JSX, e regra
// dentro de tela é inalcançável por teste (regra 8).

import { ehFaturavel, enderecoEmiteBoleto, type EnderecoDaUc, type UcParaSituacao } from './unidades-regras.ts';

/** O mínimo que estas listas leem de uma unidade. Estrutural: o tipo
 *  `UnidadeConsumidora` de `api.ts` satisfaz isto. */
export type UcDaLista = UcParaSituacao & {
  id: string;
  numero_uc: string;
  cliente_id: string;
  usina_id: string | null;
  distribuidora?: string;
};

/** O mínimo de um contrato vigente — o valor do mapa de `GET /contratos-vigentes`. */
export type ContratoDaLista = {
  id: string;
  cliente_id: string;
  unidade_consumidora_id: string;
  originador_id: string | null;
  status: string;
};

/** Os nomes que a tela já tem em mãos — o cliente pelo id, a usina pelo id.
 *  `null` quando não sabe: a lista escreve «—», e não inventa. */
export type Nomes = {
  cliente: (id: string) => string | null;
  usina: (id: string | null) => string | null;
};

/* ==========================================================================
 * AS UNIDADES SEM CONTRATO ATIVO
 * ========================================================================== */

export type UnidadeSemContrato = {
  uc_id: string;
  numero_uc: string;
  cliente_id: string;
  cliente: string | null;
  usina_id: string | null;
  usina: string | null;
  /**
   * O QUE A TELA OFERECE depende disto, e a diferença é a que o banco guarda:
   *
   *   `sem_contrato`   a unidade está LIVRE — «Criar contrato»;
   *   `suspenso`       há contrato, suspenso: ele ocupa a unidade (R14 conta
   *                    vigente incluindo suspenso), e criar outro daria 409.
   *                    O ato é «Reativar», no contrato que já existe.
   */
  motivo: 'sem_contrato' | 'suspenso';
  /** O contrato suspenso, quando é ele que ocupa a unidade. */
  contrato_id: string | null;
};

/**
 * As faturáveis sem contrato ATIVO — a lista por trás da camada
 * `contrato_ativo`.
 *
 * `null` QUANDO OS CONTRATOS NÃO CHEGARAM, e não lista vazia: sem o mapa de
 * vigentes, toda unidade pareceria sem contrato — é o mesmo cuidado que a tela
 * de Contratos já tinha com a lista de livres. Vazio é «medido, e nada falta».
 *
 * A ORDEM É A DO CLIENTE, e não a do número: quem procura na lista procura
 * pelo nome de quem assina, e duas unidades da mesma pessoa ficam juntas.
 */
export function unidadesSemContratoAtivo(
  ucs: readonly UcDaLista[] | null,
  vigentes: Readonly<Record<string, ContratoDaLista | null>> | null,
  nomes: Nomes,
): UnidadeSemContrato[] | null {
  if (!ucs || !vigentes) return null;
  return ucs
    .filter((u) => ehFaturavel(u) && vigentes[u.id]?.status !== 'ativo')
    .map((u): UnidadeSemContrato => {
      const k = vigentes[u.id] ?? null;
      return {
        uc_id: u.id, numero_uc: u.numero_uc,
        cliente_id: u.cliente_id, cliente: nomes.cliente(u.cliente_id),
        usina_id: u.usina_id, usina: nomes.usina(u.usina_id),
        motivo: k ? 'suspenso' : 'sem_contrato',
        contrato_id: k?.id ?? null,
      };
    })
    .sort((a, b) => (a.cliente ?? '￿').localeCompare(b.cliente ?? '￿', 'pt-BR', { sensitivity: 'base' })
      || a.numero_uc.localeCompare(b.numero_uc, 'pt-BR', { numeric: true }));
}

/**
 * QUEM TROUXE O CLIENTE, sugerido — e não escolhido.
 *
 * O que dá para inferir de uma unidade sem contrato é pouco, e o mais valioso
 * é isto: quando o MESMO cliente já tem outra unidade com contrato e quem
 * trouxe registrado, a venda quase sempre foi a mesma. A tela oferece o nome
 * com um botão «Usar», e NÃO pré-seleciona: `contratos.tsx` explica por que o
 * campo trava em vez de avisar — o tipo congela no contrato (R20-b) e um
 * engano não tem desfazer. Uma sugestão que a pessoa aceita é uma escolha; um
 * campo que já vem preenchido é uma escolha que ninguém fez.
 *
 * Duas pessoas diferentes nos outros contratos do cliente, nenhuma sugestão:
 * escolher entre elas seria adivinhar.
 */
export function quemTrouxeOMesmoCliente(
  clienteId: string,
  ucId: string,
  vigentes: Readonly<Record<string, ContratoDaLista | null>> | null,
): { originador_id: string; uc_id: string } | null {
  if (!vigentes) return null;
  const outros = Object.values(vigentes)
    .filter((k): k is ContratoDaLista => Boolean(k) && k!.cliente_id === clienteId
      && k!.unidade_consumidora_id !== ucId && Boolean(k!.originador_id));
  const pessoas = new Set(outros.map((k) => k.originador_id));
  if (pessoas.size !== 1) return null;
  return { originador_id: outros[0]!.originador_id!, uc_id: outros[0]!.unidade_consumidora_id };
}

/* ==========================================================================
 * O CONTRATO SEM QUEM TROUXE O CLIENTE
 * ========================================================================== */

/**
 * O contrato que a camada `originador_do_contrato` conta: ATIVO, numa unidade
 * faturável, sem quem trouxe. O suspenso não conta (o servidor também não), e
 * o de uma unidade que não fatura também não — o filtro tem de casar com o
 * «2 de 35» que o Mês mostra.
 */
export function contratoSemQuemTrouxe(k: ContratoDaLista, uc: UcParaSituacao | null | undefined): boolean {
  return k.status === 'ativo' && !k.originador_id && Boolean(uc) && ehFaturavel(uc!);
}

/* ==========================================================================
 * O ENDEREÇO DO PAGADOR QUE O BANCO EXIGE (01/10/2026, etapa 7b)
 * ========================================================================== */

/**
 * AS UNIDADES QUE A TRAVA «ENDEREÇO DO PAGADOR» CONTA — e a mesma lista que o
 * recorte `?pendencia=sem_endereco` mostra e que a faixa de Unidades conta.
 *
 * ATÉ ESTA DATA ERAM TRÊS NÚMEROS para a mesma frase, e a crítica de 01/10
 * mediu os três numa tela só: a trava do Mês dizia 4, a faixa de Unidades
 * dizia 5 e o recorte mostrava 6. Os três estavam certos, cada um sobre uma
 * população diferente — a trava conta a unidade COM CONTRATO ATIVO (o
 * `uc_contratada` de `src/repos/prontidao.ts`, porque sem contrato a unidade já
 * cai uma camada antes), a faixa contava a faturável, e o recorte, toda
 * unidade. Quem clicava em «4» e via 6 concluía que um dos dois mentia.
 *
 * AGORA OS TRÊS SÃO ESTE: faturável (`ehFaturavel`, o `uc_ativa` do servidor),
 * com contrato ATIVO na unidade (`k.status = 'ativo'`), e sem o endereço que o
 * banco exige (`enderecoEmiteBoleto`, que chama a MESMA `faltamNoEndereco` do
 * servidor — o número da casa não é exigido).
 *
 * `null` QUANDO OS CONTRATOS NÃO CHEGARAM: sem o mapa, não se sabe quais têm
 * contrato, e contar todas seria voltar ao número maior.
 */
export function semEnderecoParaOBoleto<T extends UcDaLista & EnderecoDaUc>(
  ucs: readonly T[] | null,
  vigentes: Readonly<Record<string, ContratoDaLista | null>> | null,
): T[] | null {
  if (!ucs || !vigentes) return null;
  return ucs.filter((u) => comContratoAtivo(u, vigentes) && !enderecoEmiteBoleto(u));
}

/** O universo da trava: a faturável com contrato ativo — o «de 35» do Mês. */
export function comContratoAtivo(
  u: UcDaLista, vigentes: Readonly<Record<string, ContratoDaLista | null>>,
): boolean {
  return ehFaturavel(u) && vigentes[u.id]?.status === 'ativo';
}

/* ==========================================================================
 * AS CONTAS QUE FALTAM LER NO MÊS
 * ========================================================================== */

/** Uma conta registrada — só o que esta lista lê dela. */
export type ContaLida = { numero_uc: string; competencia: string };

export type ContaQueFalta = {
  uc_id: string;
  numero_uc: string;
  cliente: string | null;
  usina: string | null;
  distribuidora: string | null;
};

const mesDe = (competencia: string | null | undefined): string => String(competencia ?? '').slice(0, 7);

/**
 * As faturáveis sem conta registrada em `mes` (`'AAAA-MM'`) — a lista por
 * trás do «15 contas a ler» do passo 1.
 *
 * O CASAMENTO É PELO NÚMERO, EXATO, como a junção `conta_do_mes` do servidor
 * (`r.numero_uc = uc.numero_uc`). Normalizar aqui e não lá faria esta lista
 * dar por lida uma conta que a prontidão conta como faltando.
 *
 * `null` É «NÃO SEI»: as contas não chegaram, ou a lista bateu no teto e este
 * mês é o mais velho dela — que é justamente o que o teto corta. Dar a unidade
 * por faltante nesse caso mandaria ler de novo uma conta já registrada. É a
 * mesma regra do passo 2 em `roteiro-do-mes.ts`.
 */
export function contasQueFaltam(
  ucs: readonly UcDaLista[] | null,
  registradas: { lista: readonly ContaLida[]; parcial: boolean } | null,
  mes: string,
  nomes: Nomes,
): ContaQueFalta[] | null {
  if (!ucs || !registradas || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const meses = registradas.lista.map((r) => mesDe(r.competencia)).filter(Boolean).sort();
  if (registradas.parcial && (meses.length === 0 || mes <= meses[0]!)) return null;
  const lidas = new Set(registradas.lista.filter((r) => mesDe(r.competencia) === mes).map((r) => r.numero_uc));
  return ucs
    .filter((u) => ehFaturavel(u) && !lidas.has(u.numero_uc))
    .map((u) => ({
      uc_id: u.id, numero_uc: u.numero_uc,
      cliente: nomes.cliente(u.cliente_id), usina: nomes.usina(u.usina_id),
      distribuidora: u.distribuidora ?? null,
    }))
    .sort((a, b) => (a.cliente ?? '￿').localeCompare(b.cliente ?? '￿', 'pt-BR', { sensitivity: 'base' })
      || a.numero_uc.localeCompare(b.numero_uc, 'pt-BR', { numeric: true }));
}

/* O MÊS DA LISTA DE CONTAS QUE FALTAM (`mesDasContasQueFaltam`) SAIU em
 * 01/10/2026 (etapa 8): o bloco escolhia o mês sozinho — endereço, lembrado, o
 * mais recente com conta, hoje — e podia contar um mês com a lista de
 * registradas, logo abaixo, em outro. Hoje ele recebe o MÊS DE TRABALHO da
 * casca, com a mesma ordem para o sistema inteiro (`resolverMes`,
 * `mes-do-trabalho.ts`). */
