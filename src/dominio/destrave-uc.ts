// A DECISAO DE DESTRAVAR UMA UC QUE O CONECTOR RECUSA. Q-UCMUDOU-01, 03/08/2026.
//
// Pura, sem banco e sem CRM: recebe as quatro leituras ja feitas e devolve
// "pode" ou "recusa com motivo". O script `scripts/destravar-uc.ts` faz as
// leituras e obedece.
//
// POR QUE ISTO E UM MODULO E NAO UM `if` DENTRO DO SCRIPT
//
// A R23 da SPEC-002 manda o conector RECUSAR quando um contrato de rateio muda
// de UC no CRM - das duas leituras uma esta errada, e escolher seria palpite. A
// recusa continua certa. O que este modulo decide e outra coisa: se a ADJUDICACAO
// externa (quem opera o CRM disse qual leitura vale) pode ser registrada apagando
// o ponteiro velho, deixando o conector gravar o vinculo novo pelo caminho normal.
//
// Um UPDATE cego aqui apagaria um vinculo BOM por digitacao errada de UC, e o
// sintoma so apareceria no ciclo seguinte - como uma UC criada em duplicidade,
// longe da causa. Por isso as guardas existem, e por isso elas sao testaveis sem
// banco: sao a parte que precisa estar certa antes de qualquer escrita.
//
// AS GUARDAS SAO ORDENADAS, e a ordem e deliberada: cada uma so faz sentido se a
// anterior passou, e o motivo devolvido e sempre o PRIMEIRO que barrou - do mesmo
// jeito que a triagem de faturamento mostra so o primeiro motivo de recusa.

/** Uma linha de `financeiro.rateio_clientes`, so o que a decisao usa. */
export type LinhaDoRateio = {
  uc: string;
  contrato_id: string;
  lead_codigo: string;
  cliente: string;
};

export type EntradaDoDestrave = {
  /** A UC que se quer destravar, como esta no nosso espelho. */
  numeroUc: string;
  /** O `crm_usina_cliente_id` que a nossa linha carrega hoje. `null` se nao tem. */
  contratoNoEspelho: string | null;
  /** O que o CRM diz sobre esse contrato hoje. `null` se ele sumiu da view. */
  crmPorContrato: LinhaDoRateio | null;
  /** O que o CRM diz sobre essa UC hoje. `null` se nenhum contrato a serve. */
  crmPorUc: LinhaDoRateio | null;
  /** Se o contrato substituto ja esta preso a outra UC nossa, qual e. */
  ucPresaAoSubstituto: string | null;
};

export type DecisaoDoDestrave =
  | { pode: true; contratoASoltar: string; ucQueVaiNascer: string; contratoQueVaiEntrar: string }
  | { pode: false; guarda: 1 | 2 | 3 | 4; motivo: string };

/**
 * As quatro guardas, na ordem. Devolve a primeira que barrar.
 */
export function decidirDestrave(e: EntradaDoDestrave): DecisaoDoDestrave {
  // 1. Sem ponteiro nao ha o que apagar - e o pedido provavelmente e outra coisa.
  if (!e.contratoNoEspelho) {
    return { pode: false, guarda: 1,
      motivo: `a UC ${e.numeroUc} nao tem crm_usina_cliente_id. Nao ha ponteiro a apagar.` };
  }

  // 2. A prova de que o contrato se moveu. Sem ela nao ha troca, e apagar o
  //    ponteiro so faria o conector reescreve-lo identico no ciclo seguinte.
  if (!e.crmPorContrato) {
    return { pode: false, guarda: 2,
      motivo: `o contrato ${e.contratoNoEspelho} nao esta mais em financeiro.rateio_clientes. `
            + 'Isto nao e troca de UC - e contrato que sumiu, e a decisao e outra.' };
  }
  if (e.crmPorContrato.uc === e.numeroUc) {
    return { pode: false, guarda: 2,
      motivo: `no CRM o contrato ${e.contratoNoEspelho} continua na UC ${e.numeroUc}. `
            + 'Nao ha troca a destravar, e apagar o ponteiro so faria o conector reescreve-lo.' };
  }

  // 3. A prova de que existe substituto. Sem ele a linha fica orfa: o ciclo
  //    seguinte nao teria contrato nenhum para gravar nesta UC.
  if (!e.crmPorUc) {
    return { pode: false, guarda: 3,
      motivo: `no CRM a UC ${e.numeroUc} nao e servida por contrato nenhum. `
            + 'Apagar o ponteiro deixaria a linha orfa: o ciclo seguinte nao teria o que gravar.' };
  }

  // 4. Um segundo conflito atras do primeiro. Apagar um ponteiro so trocaria uma
  //    recusa por outra - com uma escrita no meio, que e o pior dos dois mundos.
  if (e.ucPresaAoSubstituto !== null) {
    return { pode: false, guarda: 4,
      motivo: `o contrato substituto ${e.crmPorUc.contrato_id} ja esta vinculado a UC `
            + `${e.ucPresaAoSubstituto} no espelho. Ha um segundo conflito atras deste, e `
            + 'apagar um ponteiro so trocaria uma recusa por outra.' };
  }

  return {
    pode: true,
    contratoASoltar: e.contratoNoEspelho,
    ucQueVaiNascer: e.crmPorContrato.uc,
    contratoQueVaiEntrar: e.crmPorUc.contrato_id,
  };
}
