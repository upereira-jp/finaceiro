// A UC QUE SAIU DO RATEIO NO CRM — o caminho de saida que o conector nao tinha.
// SPEC-002 R27, decisao do dono em 22/09/2026.
//
// ============================================================================
// O DEFEITO QUE ISTO FECHA, medido
//
// O conector so criava e atualizava UC. Quando um contrato de rateio sumia de
// `financeiro.rateio_clientes`, a UC continuava aqui com usina e percentual - um
// estado que o CRM ja nao tinha. Em 16/09/2026 a operacao tirou tres UCs da usina
// 0001 (7,30%) e pos dois rateios novos na mesma usina. O espelho passou a somar
// 97,48 + 7,30 = 104,78%, a trava R11 (constraint DEFERIDA) derrubou o COMMIT, e
// o ciclo morreu em TODAS as rodadas seguintes - 590 ate 22/09, nenhuma completa.
// Uma divergencia de tres linhas parava o espelho inteiro.
//
// ============================================================================
// A DECISAO: SEGUIR O CRM, com freio
//
// "Quando uma UC some do rateio no CRM e ainda tem contrato ativo no Financeiro,
// o conector deve seguir o CRM" (dono, 22/09/2026). Usina e percentual sao campo
// ESPELHO (R5, o conector vence) e so o CRM valida o teto (R11 da SPEC-002). A
// UC fica, o cliente fica, o contrato fica - sai so o vinculo com a usina. E a
// saida e SINAL, nao silencio: aparece em `conector_execucao.detalhe` dizendo o
// que havia antes e se ha contrato ativo.
//
// Se foi engano no CRM, recadastrar la religa sozinho no ciclo seguinte: o
// espelho procura a UC pelo numero, e a UC solta nao tem vinculo que atrapalhe.
//
// ============================================================================
// OS DOIS FREIOS, e o que cada um protege
//
// Soltar vinculo tira a UC do faturamento. Uma view quebrada que devolvesse
// metade das linhas soltaria metade da carteira em quinze minutos - o mesmo medo
// que ja fez `perderiaSituacaoDaUc` preservar a situacao. Entao:
//
//   1. A USINA PRECISA TER FALADO. So solta UC de usina que tem ao menos uma
//      linha nesta leitura. Usina inteira ausente e "a view nao disse nada sobre
//      ela", e silencio nao e prova de saida.
//   2. SAIDA EM MASSA NAO SOLTA NADA. Acima de max(3, 25% das UCs vinculadas),
//      nenhuma e solta e todas viram sinal. Tres e o caso real de 16/09; 25% e
//      folga para a operacao mexer em uma usina inteira sem tocar o freio.
//
// O que o freio retem nao e recusa - nada foi lido para gravar - e sim sinal
// com o motivo, pela mesma distincao da R21-b.

/** Uma UC do espelho que ainda esta vinculada a uma usina. */
export type UcVinculada = {
  id: string;
  numero_uc: string;
  crm_usina_cliente_id: string;
  codigo_geradora: string | null;
  percentual_rateio: string | null;
};

/** O que a leitura desta rodada disse, reduzido ao que a decisao usa. */
export type RateioLido = {
  contratos: ReadonlySet<string>;
  ucs: ReadonlySet<string>;
  usinas: ReadonlySet<string>;
};

export type Retida = { uc: UcVinculada; motivo: string };

export type DecisaoDeSaida = {
  soltar: UcVinculada[];
  retidas: Retida[];
};

export const FREIO_MINIMO = 3;
export const FREIO_FRACAO = 0.25;

/** Quantas saidas uma rodada pode soltar antes de o freio de massa agir. */
export const tetoDeSaidas = (vinculadas: number): number =>
  Math.max(FREIO_MINIMO, Math.ceil(vinculadas * FREIO_FRACAO));

/**
 * Decide, sem banco, quais UCs vinculadas sairam do rateio no CRM e quais delas
 * podem ser soltas nesta rodada.
 *
 * Saiu = o contrato dela nao esta na leitura E o numero dela tambem nao. Se o
 * numero aparece sob outro contrato, e recadastro ou troca de contrato - o
 * espelho normal cuida, e soltar aqui brigaria com ele no mesmo ciclo.
 */
export function decidirSaidas(vinculadas: readonly UcVinculada[], lido: RateioLido): DecisaoDeSaida {
  // Leitura vazia nunca chega aqui (o espelho de UC sai antes), mas a guarda
  // mora na decisao para ela valer sozinha: zero linhas e ambiguo (SPEC-002 §7).
  if (lido.contratos.size === 0) return { soltar: [], retidas: [] };

  const sairam = vinculadas.filter((u) =>
    !lido.contratos.has(u.crm_usina_cliente_id) && !lido.ucs.has(u.numero_uc));

  const retidas: Retida[] = [];
  const candidatas: UcVinculada[] = [];
  for (const u of sairam) {
    if (!u.codigo_geradora || !lido.usinas.has(u.codigo_geradora)) {
      retidas.push({ uc: u, motivo:
        `a usina ${u.codigo_geradora ?? '(sem codigo)'} nao tem nenhuma linha nesta leitura do CRM, `
        + 'entao a ausencia da UC nao prova que ela saiu. O vinculo foi MANTIDO.' });
    } else {
      candidatas.push(u);
    }
  }

  const teto = tetoDeSaidas(vinculadas.length);
  if (candidatas.length > teto) {
    return {
      soltar: [],
      retidas: [...retidas, ...candidatas.map((uc) => ({ uc, motivo:
        `${candidatas.length} UCs sumiram do rateio do CRM na mesma leitura, acima do freio de `
        + `${teto} (max(${FREIO_MINIMO}, ${FREIO_FRACAO * 100}% de ${vinculadas.length} vinculadas)). `
        + 'Saida em massa parece view quebrada, e soltar tiraria essas UCs do faturamento: NENHUMA '
        + 'foi solta. Confira `financeiro.rateio_clientes` no CRM.' }))],
    };
  }
  return { soltar: candidatas, retidas };
}
