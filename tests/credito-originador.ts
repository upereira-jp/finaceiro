// A CONFERENCIA DO EIXO DO ORIGINADOR, na parte pura. SEM BANCO e SEM CRM.
// Uso: node --experimental-strip-types tests/credito-originador.ts
// SPEC-002 R26 · invariante 14 · `Q-VIEWSCRED-01`.
//
// COMO ESTAS VERIFICACOES SE VERIFICAM, que e o assunto do arquivo.
//
// O risco de um modulo que so devolve TEXTO e escrever um teste que confere o
// texto - `sinal === 'a UC ...'` -, o que passaria com a regra errada desde que
// eu copiasse a saida para o esperado. A licao da sessao 15, inteira.
//
// Entao o que se afirma aqui e a CONDICAO DE DISPARO, nunca a redacao:
//
//   silencio      cada regra tem um caso limpo em que ela NAO dispara. Sem ele,
//                 um `sinais.length >= 1` passaria com uma funcao que acusa tudo
//   os dois lados cada disparo e verificado contra o seu proprio caso mudo, e a
//                 diferenca entre os dois e UM campo - o que a regra le
//   contagem      quantos sinais, nao quais. Duas regras que disparassem juntas
//                 por engano apareceriam como 2 onde a afirmacao diz 1
//   producao      o C1 usa a forma REAL medida em 03/08 - 3 revogadas com
//                 substituto vigente -, que e o caso que precisa ficar MUDO
//
// A unica comparacao contra texto e por `/Q-PARCERIA-01/`-like: identificador de
// questao, que e endereco e nao redacao, e mudar o ID sem mudar o teste seria
// justamente o que se quer pegar.

import {
  conferirCreditoDeOriginador, normalizarNome, ladoQueCasa,
  type CreditoDoCrm, type SituacaoDoRateio, type UcConferida,
} from '../src/dominio/credito-originador.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

// ------------------------------------------------------------- fixtures
//
// A FORMA E A REAL, medida pela `financeiro_ro` em 03/08/2026: `vendedor` como
// nome curto ("Renata", "Out Sales"), `parceiro_id`/`parceiro_nome` nulos em 45
// das 48, `parceria_tipo = 'indicador'` nas tres do Edimar, e as revogadas com
// `revogado_motivo` preenchido.
const credito = (o: Partial<CreditoDoCrm> & { uc: string }): CreditoDoCrm => ({
  lead_codigo: 'G3-0001', vendedor: 'Renata',
  parceiro_id: null, parceiro_nome: null, parceria_tipo: null,
  vigente: true, revogado_motivo: null, ...o,
});
const situacao = (o: Partial<SituacaoDoRateio> & { uc: string }): SituacaoDoRateio => ({
  situacao: 'ativado', em_troca_titularidade: false, ...o,
});
const uc = (numeroUc: string, contrato: UcConferida['contrato'] = null): UcConferida =>
  ({ numeroUc, contrato });
const comContrato = (nome: string | null, status = 'ativo', partner: string | null = null) =>
  ({ status, originadorNome: nome, originadorCrmPartnerId: partner });

const UC1 = '000041446801282';
const UC2 = '000241968901278';
const PARCEIRO = 'aaaa1111-0000-4000-8000-0000000000e1';

console.log('== SPEC-002 R26: o credito congelado conferido contra o originador digitado ==\n');

// ---- X1: a normalizacao, e ela e declarada porque a comparacao depende dela.
{
  chk('X1a', normalizarNome('  Out   Sales ') === 'out sales',
      `espacos colapsados e caixa baixa ("${normalizarNome('  Out   Sales ')}")`);
  chk('X1b', normalizarNome('Renáta') === normalizarNome('Renata'),
      'acento nao separa duas grafias do mesmo nome');
  chk('X1c', normalizarNome('') === null && normalizarNome(null) === null
       && normalizarNome('   ') === null,
      'vazio, nulo e so-espaco viram null - e null NUNCA casa com null em ladoQueCasa');
  // A metade que importa: nome ausente dos dois lados nao pode virar "casou".
  chk('X1d', ladoQueCasa(comContrato(null), credito({ uc: UC1, vendedor: null })) === null,
      'originador sem nome contra credito sem vendedor NAO casa (null !== null)');
}

// ---- X2: o caminho limpo. Sem ele, todo o resto poderia estar acusando qualquer coisa.
{
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC1, comContrato('Renata'))],
    creditos: [credito({ uc: UC1, vendedor: 'Renata' })],
    situacoes: [situacao({ uc: UC1 })],
  });
  chk('X2', r.conferido && r.sinais.length === 0,
      `UC com credito vigente unico, originador batendo e rateio ativado: ZERO sinais (${r.sinais.length})`);
}

// ---- X3: view VAZIA nao acusa ninguem - declara que nao rodou.
//
// A alternativa seria acusar 39 UCs de "sem credito" a partir de uma view que
// pode ter quebrado. E a mesma decisao que a §7 tomou para `vendas_ganhas`, e a
// diferenca entre as duas leituras de `sinais.length === 0` e o `conferido`.
{
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC1), uc(UC2)], creditos: [], situacoes: [situacao({ uc: UC1 })],
  });
  chk('X3', r.conferido === false && r.sinais.length === 0,
      `vendas_creditadas vazia: conferido=false e ZERO acusacoes (${r.sinais.length})`);
}

// ---- X4/X5: C1 - sem credito vigente. E o caso REAL de 03/08 fica MUDO.
{
  // A forma real: 3 revogadas que JA TEM substituto vigente. Este e o caso que
  // nao pode disparar - se disparasse, o ciclo cuspiria 3 sinais por rodada
  // sobre uma correcao que o CRM ja fez.
  const comSubstituto = conferirCreditoDeOriginador({
    ucs: [uc(UC2)],
    creditos: [
      credito({ uc: UC2, vendedor: 'Out Sales', vigente: false,
                revogado_motivo: 'parceria nao congelada: backfill de 01/08 rodou antes do vinculo' }),
      credito({ uc: UC2, vendedor: 'Out Sales', vigente: true,
                parceiro_id: PARCEIRO, parceiro_nome: 'EDIMAR', parceria_tipo: 'indicador' }),
    ],
    situacoes: [situacao({ uc: UC2 })],
  });
  chk('X4', comSubstituto.sinais.length === 0,
      `C1 revogada COM substituto vigente (a forma real das 3 de 03/08): MUDA (${comSubstituto.sinais.length})`);

  // Agora sem substituto - o unico credito da UC foi revogado e ninguem recreditou.
  const semSubstituto = conferirCreditoDeOriginador({
    ucs: [uc(UC2)],
    creditos: [
      credito({ uc: UC2, vigente: false, revogado_motivo: 'venda cancelada' }),
      credito({ uc: UC1 }),                       // outra UC, para a view nao estar vazia
    ],
    situacoes: [situacao({ uc: UC2 })],
  });
  chk('X5', semSubstituto.sinais.length === 1 && semSubstituto.sinais[0]!.chave === UC2
       && /venda cancelada/.test(semSubstituto.sinais[0]!.sinal),
      `C1 revogada SEM substituto: UM sinal, na UC certa, carregando o motivo do CRM `
      + `(${semSubstituto.sinais.length})`);

  // E a UC que nunca teve credito nenhum - mesma regra, outra redacao.
  const nunca = conferirCreditoDeOriginador({
    ucs: [uc(UC2)], creditos: [credito({ uc: UC1 })], situacoes: [],
  });
  chk('X5b', nunca.sinais.length === 1 && nunca.sinais[0]!.chave === UC2,
      `C1 UC espelhada ausente da view de credito: UM sinal (${nunca.sinais.length})`);
}

// ---- X6: C2 - dois vigentes. O conector nao escolhe (R8).
{
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC1)],
    creditos: [credito({ uc: UC1, vendedor: 'Renata' }), credito({ uc: UC1, vendedor: 'Out Sales' })],
    situacoes: [situacao({ uc: UC1 })],
  });
  chk('X6', r.sinais.length === 1 && /Renata/.test(r.sinais[0]!.sinal) && /Out Sales/.test(r.sinais[0]!.sinal),
      `C2 dois creditos VIGENTES na mesma UC: um sinal que NOMEIA os dois candidatos (${r.sinais.length})`);

  // A metade muda: com um vigente e um revogado nao ha ambiguidade nenhuma.
  const so1 = conferirCreditoDeOriginador({
    ucs: [uc(UC1)],
    creditos: [credito({ uc: UC1 }), credito({ uc: UC1, vendedor: 'Out Sales', vigente: false })],
    situacoes: [situacao({ uc: UC1 })],
  });
  chk('X6b', so1.sinais.length === 0,
      `C2 um vigente e um revogado NAO e ambiguidade (${so1.sinais.length})`);
}

// ---- X7: C3 - o digitado nao e nenhuma das pontas do credito.
{
  const base = { creditos: [credito({ uc: UC1, vendedor: 'Renata' })], situacoes: [situacao({ uc: UC1 })] };

  const bate = conferirCreditoDeOriginador({ ...base, ucs: [uc(UC1, comContrato('renata'))] });
  chk('X7a', bate.sinais.length === 0,
      `C3 "renata" contra vendedor "Renata": casa pela normalizacao, MUDO (${bate.sinais.length})`);

  const naoBate = conferirCreditoDeOriginador({ ...base, ucs: [uc(UC1, comContrato('Out Sales'))] });
  chk('X7b', naoBate.sinais.length === 1 && /Out Sales/.test(naoBate.sinais[0]!.sinal)
       && /Renata/.test(naoBate.sinais[0]!.sinal),
      `C3 contrato com "Out Sales" e credito com "Renata": sinal com OS DOIS nomes (${naoBate.sinais.length})`);

  // SEM contrato nao ha nada a acusar - e e o estado de producao hoje, 0 de 39.
  const semContrato = conferirCreditoDeOriginador({ ...base, ucs: [uc(UC1)] });
  chk('X7c', semContrato.sinais.length === 0,
      `C3 UC sem contrato digitado: MUDA - nao ha escolha registrada a conferir (${semContrato.sinais.length})`);
}

// ---- X8: C3 pela chave FORTE, e a chave forte vence o nome.
{
  // Originador que e parceiro: `crm_partner_id` casa com `parceiro_id`, e o
  // nome digitado nem precisa coincidir com `parceiro_nome`.
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC2, comContrato('Ferragista Sol Nascente Ltda', 'ativo', PARCEIRO))],
    creditos: [credito({ uc: UC2, vendedor: null, parceiro_id: PARCEIRO,
                         parceiro_nome: 'EDIMAR - FERRAGISTA SOL NASCENTE', parceria_tipo: 'indicador' })],
    situacoes: [situacao({ uc: UC2 })],
  });
  chk('X8a', r.sinais.length === 0,
      `C3 crm_partner_id casa com parceiro_id: MUDO mesmo com o NOME diferente (${r.sinais.length})`);

  // E o sentido contrario: partner_id diferente nao casa nem com nome parecido.
  const outro = conferirCreditoDeOriginador({
    ucs: [uc(UC2, comContrato('Alguem', 'ativo', 'bbbb2222-0000-4000-8000-0000000000e2'))],
    creditos: [credito({ uc: UC2, vendedor: null, parceiro_id: PARCEIRO, parceiro_nome: 'EDIMAR' })],
    situacoes: [situacao({ uc: UC2 })],
  });
  chk('X8b', outro.sinais.length === 1,
      `C3 crm_partner_id de OUTRO parceiro nao casa (${outro.sinais.length})`);
}

// ---- X9: C4 - a Q-PARCERIA-01 materializada num contrato.
//
// As tres UCs do Edimar tem vendedor E parceiro. Enquanto ninguem digita, nao ha
// escolha a acusar (X9c). Digitado um dos dois, o sinal nomeia o OUTRO - porque
// e a 2a parcela da comissao que muda, de 25% para zero.
{
  const cred = credito({ uc: UC2, vendedor: 'Out Sales', parceiro_id: PARCEIRO,
                         parceiro_nome: 'EDIMAR - FERRAGISTA SOL NASCENTE', parceria_tipo: 'indicador' });
  const situ = [situacao({ uc: UC2 })];

  const peloVendedor = conferirCreditoDeOriginador({
    ucs: [uc(UC2, comContrato('Out Sales'))], creditos: [cred], situacoes: situ,
  });
  chk('X9a', peloVendedor.sinais.length === 1 && /Q-PARCERIA-01/.test(peloVendedor.sinais[0]!.sinal)
       && /EDIMAR/.test(peloVendedor.sinais[0]!.sinal),
      `C4 contrato pelo VENDEDOR e o credito tambem tem parceiro: sinal nomeando o parceiro (${peloVendedor.sinais.length})`);

  const peloParceiro = conferirCreditoDeOriginador({
    ucs: [uc(UC2, comContrato('EDIMAR - FERRAGISTA SOL NASCENTE', 'ativo', PARCEIRO))],
    creditos: [cred], situacoes: situ,
  });
  chk('X9b', peloParceiro.sinais.length === 1 && /Q-PARCERIA-01/.test(peloParceiro.sinais[0]!.sinal)
       && /Out Sales/.test(peloParceiro.sinais[0]!.sinal),
      `C4 contrato pelo PARCEIRO e o credito tambem tem vendedor: sinal nomeando o vendedor (${peloParceiro.sinais.length})`);

  const semContrato = conferirCreditoDeOriginador({ ucs: [uc(UC2)], creditos: [cred], situacoes: situ });
  chk('X9c', semContrato.sinais.length === 0,
      `C4 as tres UCs do Edimar HOJE (sem contrato digitado): MUDAS - e por isso o ciclo `
      + `nao cospe 3 sinais por rodada (${semContrato.sinais.length})`);

  // C3 e C4 sao exclusivas: quando o digitado nao casa com NENHUMA ponta, o
  // sinal e um so - dizer tambem "e ha um parceiro" repetiria a mesma frase.
  const nenhuma = conferirCreditoDeOriginador({
    ucs: [uc(UC2, comContrato('Kallina Tandara'))], creditos: [cred], situacoes: situ,
  });
  chk('X9d', nenhuma.sinais.length === 1,
      `C3 e C4 nao disparam juntas na mesma UC (${nenhuma.sinais.length})`);
}

// ---- X10: C5 - contrato ATIVO sobre rateio que o CRM nao da por ativado.
{
  const base = { creditos: [credito({ uc: UC1 })] };

  const ok = conferirCreditoDeOriginador({
    ...base, ucs: [uc(UC1, comContrato('Renata'))], situacoes: [situacao({ uc: UC1 })],
  });
  chk('X10a', ok.sinais.length === 0, `C5 contrato ativo sobre rateio ativado: MUDO (${ok.sinais.length})`);

  const naoAtivado = conferirCreditoDeOriginador({
    ...base, ucs: [uc(UC1, comContrato('Renata'))],
    situacoes: [situacao({ uc: UC1, situacao: 'nao_ativado', em_troca_titularidade: true })],
  });
  chk('X10b', naoAtivado.sinais.length === 1 && /nao_ativado/.test(naoAtivado.sinais[0]!.sinal)
       && /TROCA DE TITULARIDADE/.test(naoAtivado.sinais[0]!.sinal),
      `C5 contrato ATIVO sobre rateio nao ativado e em troca: um sinal com AS DUAS causas (${naoAtivado.sinais.length})`);

  // RASCUNHO nao dispara: o contrato ainda nao fatura nada.
  const rascunho = conferirCreditoDeOriginador({
    ...base, ucs: [uc(UC1, comContrato('Renata', 'rascunho'))],
    situacoes: [situacao({ uc: UC1, situacao: 'nao_ativado' })],
  });
  chk('X10c', rascunho.sinais.length === 0,
      `C5 contrato em RASCUNHO sobre rateio nao ativado: MUDO (${rascunho.sinais.length})`);

  // E o estado de hoje: 11 UCs nao ativadas, ZERO contratos. Nenhum sinal.
  const hoje = conferirCreditoDeOriginador({
    ...base, ucs: [uc(UC1)], situacoes: [situacao({ uc: UC1, situacao: 'nao_ativado' })],
  });
  chk('X10d', hoje.sinais.length === 0,
      `C5 as 11 nao ativadas de hoje, sem contrato: MUDAS (${hoje.sinais.length})`);
}

// ---- X11: o RESUMO conta as UCs espelhadas, nao as linhas da view.
//
// A distincao importa: a view tem 41 linhas e nos espelhamos 39. Contar a view
// daria um numero que nao descreve a nossa carteira - e o numero existe
// justamente para responder "quantas das MINHAS estao nao ativadas".
{
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC1), uc(UC2)],
    creditos: [credito({ uc: UC1 }), credito({ uc: UC2 })],
    situacoes: [
      situacao({ uc: UC1 }),
      situacao({ uc: UC2, situacao: 'nao_ativado', em_troca_titularidade: true }),
      situacao({ uc: '000999999999999', situacao: 'nao_ativado' }),   // no CRM e nao espelhada
    ],
  });
  const s = r.resumoDeSituacao;
  chk('X11a', s.ativado === 1 && s.nao_ativado === 1 && s.em_troca_titularidade === 1
       && s.sem_linha_na_view === 0,
      `resumo conta as ESPELHADAS e ignora a UC que so existe no CRM `
      + `(${s.ativado}/${s.nao_ativado}/${s.em_troca_titularidade}/${s.sem_linha_na_view})`);

  const semLinha = conferirCreditoDeOriginador({
    ucs: [uc(UC1)], creditos: [credito({ uc: UC1 })], situacoes: [],
  });
  chk('X11b', semLinha.resumoDeSituacao.sem_linha_na_view === 1
       && semLinha.resumoDeSituacao.ativado === 0,
      `UC espelhada AUSENTE de rateio_situacao conta em sem_linha_na_view e nao em ativado `
      + `(${semLinha.resumoDeSituacao.sem_linha_na_view})`);
}

// ---- X12: credito sem UC nao conversa com o espelho, e nao pode virar ruido.
//
// Medido em 03/08: 1 das 48 linhas tem `uc` nula. Ela nao casa com UC nenhuma e
// nao pode fazer a view "contar como vazia" nem acusar quem quer que seja.
{
  const r = conferirCreditoDeOriginador({
    ucs: [uc(UC1)],
    creditos: [credito({ uc: null as any }), credito({ uc: UC1 })],
    situacoes: [situacao({ uc: UC1 })],
  });
  chk('X12', r.conferido && r.sinais.length === 0,
      `credito com uc NULA e ignorado sem virar sinal, e a conferencia roda (${r.sinais.length})`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
