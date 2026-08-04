// A SITUACAO DE UMA UC COMO A PESSOA LE, nos dois sentidos.
// Uso: node --experimental-strip-types web/tests/unidades.ts
//
// COMO ESTAS VERIFICACOES SE VERIFICAM.
//
// O risco de uma funcao que devolve rotulo e a tautologia: comparar a saida com
// a constante que a produziu prova que copiei duas vezes. Entao o que se afirma
// aqui e SEMPRE a condicao de disparo, com o par mudo ao lado e UM campo de
// diferenca entre os dois - e uma vez a saida contra a ENTRADA, nunca contra
// um numero meu.
//
// E ha uma afirmacao que vale mais que as outras: `ehFaturavel` tem de bater com
// a triagem do servidor. Nao da para importar `src/` daqui (o tsconfig do `web/`
// nao o inclui, de proposito), entao o que se prende e a TABELA VERDADE das
// mesmas condicoes - as duas cairiam juntas se uma das implementacoes mudasse
// sozinha.

import {
  situacaoDaUc, ehFaturavel, contarSituacoes,
  ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, ICONE_DA_SITUACAO,
  type UcParaSituacao, type SituacaoDaUc,
} from '../src/unidades-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

/** Espelhada e ativada — a UC "normal" de producao. 29 das 41 sao assim. */
const uc = (o: Partial<UcParaSituacao> = {}): UcParaSituacao => ({
  status: 'ativa', rateio_situacao: 'ativado', rateio_em_troca_titularidade: false,
  crm_usina_cliente_id: 'crm-contrato-1', ...o,
});

console.log('== a situacao de uma UC: duas fontes, um rotulo ==\n');

// ---- U1: o caminho normal, e ele e o par mudo de todo o resto.
{
  chk('U1', situacaoDaUc(uc()) === 'ativa' && ehFaturavel(uc()),
      'espelhada e ativada no CRM: Ativa e faturavel');
}

// ---- U2: A DECISAO DE 04/08 - so aparece como Ativa o que fatura.
//
// Um campo de diferenca em relacao a U1, e o rotulo muda. Sem esta, "Ativa"
// voltaria a significar "ninguem cancelou aqui", que e a confusao que este
// modulo existe para acabar.
{
  const naoAtivada = uc({ rateio_situacao: 'nao_ativado' });
  chk('U2a', situacaoDaUc(naoAtivada) === 'aguardando_ativacao' && !ehFaturavel(naoAtivada),
      'espelhada e NAO ativada: sai de Ativa - e a decisao de 04/08 (12 das 41 estao assim)');

  const emTroca = uc({ rateio_situacao: 'nao_ativado', rateio_em_troca_titularidade: true });
  chk('U2b', situacaoDaUc(emTroca) === 'em_troca_titularidade',
      'entre as nao ativadas, a troca de titularidade DIZ MAIS e vence - sete das doze');

  // Valor desconhecido do CRM nao vira Ativa. `text` espelha o que vier, e o
  // lado seguro para dinheiro e nao chamar de faturavel o que nao se conhece.
  chk('U2c', !ehFaturavel(uc({ rateio_situacao: 'em_analise' })),
      'situacao DESCONHECIDA do CRM nao aparece como Ativa');
}

// ---- U3: A GUARDA DA UC LOCAL, que e o par mudo da U2a.
//
// `POST /unidades-consumidoras` cria UC a mao, e o CRM nao sabe dela. Sem esta
// guarda ela ficaria "aguardando ativacao" PARA SEMPRE, esperando um sistema
// que nunca vai opinar. A diferenca para a U2a e UM campo.
{
  const local = uc({ crm_usina_cliente_id: null, rateio_situacao: null });
  chk('U3a', situacaoDaUc(local) === 'ativa' && ehFaturavel(local),
      'UC criada A MAO e Ativa: o CRM nao tem opiniao sobre ela');

  const localNaoAtivada = uc({ crm_usina_cliente_id: null, rateio_situacao: 'nao_ativado' });
  chk('U3b', situacaoDaUc(localNaoAtivada) === 'ativa',
      'e nem um valor perdido de situacao a tira de Ativa - sem ponteiro do CRM, o CRM nao manda');
}

// ---- U4: "nao lido" NAO e "nao ativado", e os dois nao faturam.
//
// Ausencia de medicao nao e medicao de ausencia - a mesma separacao que a
// prontidao faz entre `nao_medido` e `pendente`. As duas nao faturam, e o
// ROTULO e diferente porque a acao e diferente: uma pede rodar o ciclo.
{
  const naoLida = uc({ rateio_situacao: null });
  chk('U4a', situacaoDaUc(naoLida) === 'situacao_nao_lida' && !ehFaturavel(naoLida),
      'espelhada com situacao NUNCA LIDA: rotulo proprio, e nao fatura');
  chk('U4b', situacaoDaUc(naoLida) !== situacaoDaUc(uc({ rateio_situacao: 'nao_ativado' })),
      '"nao lida" e "nao ativada" sao rotulos DISTINGUIVEIS - a acao de cada uma e outra');
}

// ---- U5: decisao de GENTE sobre o nosso cadastro vence o CRM.
{
  chk('U5a', situacaoDaUc(uc({ status: 'cancelada' })) === 'cancelada'
       && situacaoDaUc(uc({ status: 'suspensa' })) === 'suspensa',
      'cancelada e suspensa vencem, mesmo com o CRM dizendo ativado');
  chk('U5b', !ehFaturavel(uc({ status: 'suspensa' })),
      'e nenhuma das duas fatura');
}

// ---- U6: A TABELA VERDADE contra a triagem do servidor.
//
// `triar()` recusa por `rateio_nao_ativado` quando `crm_usina_cliente_id` esta
// preenchido E a situacao nao e 'ativado'. Aqui a mesma tabela, escrita pelas
// condicoes e nao pela implementacao - as duas caem juntas se uma mudar so.
{
  const casos: Array<[string | null, string | null, boolean]> = [
    ['crm-1', 'ativado',     true],   // espelhada e ativada    -> passa
    ['crm-1', 'nao_ativado', false],  // espelhada, nao ativada -> recusa
    ['crm-1', null,          false],  // espelhada, nao lida    -> recusa
    [null,    'ativado',     true],   // local                  -> passa
    [null,    'nao_ativado', true],   // local                  -> passa (a guarda)
    [null,    null,          true],   // local                  -> passa
  ];
  const erradas = casos.filter(([crm, sit, esperado]) =>
    ehFaturavel(uc({ crm_usina_cliente_id: crm, rateio_situacao: sit })) !== esperado);
  chk('U6', erradas.length === 0,
      `a tabela verdade bate com a triagem do servidor nos SEIS casos `
      + `(divergentes: ${erradas.length})`);
}

// ---- U7: o vocabulario e FECHADO, e so uma cor e verde.
{
  const nomes = Object.keys(ROTULO_DA_SITUACAO) as SituacaoDaUc[];
  chk('U7a', nomes.every((n) => ROTULO_DA_SITUACAO[n]?.length > 0 && TOM_DA_SITUACAO[n] !== undefined),
      `toda situacao tem rotulo e tom - nome sem desenho nao compila, e sem rotulo apareceria vazio (${nomes.length})`);
  const verdes = nomes.filter((n) => TOM_DA_SITUACAO[n] === 'ok');
  chk('U7b', verdes.length === 1 && verdes[0] === 'ativa',
      `SO "ativa" e verde - e a unica que fatura, e verde em outra faria a tela mentir de novo (${verdes.join(',')})`);

  /*
   * U7c - o icone que SOBREPOE o do tom, e o precedente e o dos status de
   * fatura: "Emitida e tom nao_medido e exibiria a interrogacao de 'nao sei'".
   * `cancelada` cai no mesmo tom pela mesma razao de arranjo, e a interrogacao
   * mentiria - nos sabemos muito bem que ela foi cancelada.
   */
  chk('U7c', ICONE_DA_SITUACAO.cancelada === 'remover'
       && ICONE_DA_SITUACAO.situacao_nao_lida === undefined,
      'cancelada troca o icone do tom, e "nao lida" NAO troca - ali a interrogacao e o certo');
}

// ---- U8: a contagem do cabecalho, contra a ENTRADA e nao contra numero meu.
//
// A forma e a de producao em 04/08: 41 espelhadas, 29 ativadas, 12 nao - sete
// delas em troca de titularidade.
{
  const carteira: UcParaSituacao[] = [
    ...Array.from({ length: 29 }, () => uc()),
    ...Array.from({ length: 7 }, () => uc({ rateio_situacao: 'nao_ativado', rateio_em_troca_titularidade: true })),
    ...Array.from({ length: 5 }, () => uc({ rateio_situacao: 'nao_ativado' })),
  ];
  const c = contarSituacoes(carteira);
  chk('U8a', c.total === 41 && c.faturaveis === 29,
      `41 na lista e ${c.faturaveis} faturaveis - o numero que a tela dizia era 41`);
  chk('U8b', c.por.ativa + c.por.em_troca_titularidade + c.por.aguardando_ativacao === c.total,
      'as parcelas somam o total: nenhuma UC some da contagem');
  chk('U8c', c.por.em_troca_titularidade === 7 && c.por.aguardando_ativacao === 5,
      `as doze nao ativadas aparecem separadas por MOTIVO `
      + `(${c.por.em_troca_titularidade} em troca, ${c.por.aguardando_ativacao} aguardando)`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
