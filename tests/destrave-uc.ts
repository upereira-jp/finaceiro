// AS QUATRO GUARDAS DO DESTRAVE. Pura, sem banco e sem CRM.
// Uso: node --experimental-strip-types tests/destrave-uc.ts
//
// O QUE ESTA SUITE PERSEGUE
//
// O `destravar-uc` apaga um campo de uma UC de producao. O modo de falha nao e
// "apagar o campo errado" - o script recebe a UC pelo nome. E apagar o campo
// CERTO de uma linha que estava BOA, porque quem rodou digitou a UC de outra
// pessoa ou porque o CRM mudou entre a adjudicacao e a execucao.
//
// O sintoma disso nao aparece no script: aparece no ciclo seguinte, como uma UC
// criada em duplicidade ou uma linha orfa, longe da causa e sem erro. Por isso as
// guardas sao a parte que precisa estar certa ANTES de qualquer escrita, e por
// isso elas moram fora do script - aqui elas rodam sem banco, e o caso feliz e
// medido pelas MESMAS entradas que a producao devolveu em 03/08.
//
// A ORDEM E O CONTRATO, e o caso E7 existe por isso: quando duas guardas barram
// ao mesmo tempo, o motivo devolvido tem de ser o da PRIMEIRA. Um script que
// dissesse "nao ha substituto" quando o problema real e que o contrato nem se
// moveu mandaria a pessoa consertar a coisa errada.

import { decidirDestrave, type EntradaDoDestrave } from '../src/dominio/destrave-uc.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

// As leituras reais de 03/08/2026, medidas em producao pela `financeiro_ro`.
// Sao a fixture do caso feliz: a troca que o dev do CRM adjudicou como correcao
// de digitacao, com o Fernando Albino saindo da UC da Renata Lucy.
const REAL: EntradaDoDestrave = {
  numeroUc: '000041446801282',
  contratoNoEspelho: '524a4866-be99-4803-a203-58691d506654',
  crmPorContrato: { uc: '000307301401201', contrato_id: '524a4866-be99-4803-a203-58691d506654',
                    lead_codigo: 'G3-0080', cliente: 'FERNANDO ALBINO - CARTEIRA LOURIVAL' },
  crmPorUc:       { uc: '000041446801282', contrato_id: '74bb7b2d-6765-4c89-9deb-4db72d25b4de',
                    lead_codigo: 'G3-0311', cliente: 'Renata Lucy Nogueira Drumond Teles Leaonilton' },
  ucPresaAoSubstituto: null,
};

// ================================================= E. o caso que destrava

{
  const d = decidirDestrave(REAL);
  chk('E1a', d.pode === true, 'a troca real de 03/08 passa nas quatro guardas');
  if (d.pode) {
    chk('E1b', d.contratoASoltar === '524a4866-be99-4803-a203-58691d506654',
        'solta o contrato que o espelho carregava, e nao outro');
    chk('E1c', d.ucQueVaiNascer === '000307301401201',
        'nomeia a UC que o ciclo seguinte vai CRIAR (a do Fernando)');
    chk('E1d', d.contratoQueVaiEntrar === '74bb7b2d-6765-4c89-9deb-4db72d25b4de',
        'nomeia o contrato que o ciclo seguinte vai GRAVAR (o da Renata Lucy)');
  }
}

// ================================================= as quatro recusas

// ---------------------------------------------------- E2 guarda 1: sem ponteiro
//
// UC espelhada que nunca recebeu contrato de rateio. Nao ha o que soltar, e o
// pedido quase certamente e sobre outra coisa.
{
  const d = decidirDestrave({ ...REAL, contratoNoEspelho: null });
  chk('E2a', d.pode === false && d.guarda === 1, 'sem crm_usina_cliente_id: recusa na guarda 1');
  chk('E2b', !d.pode && d.motivo.includes('nao tem crm_usina_cliente_id'),
      'o motivo diz que nao ha ponteiro, e nao inventa outra causa');
}

// ---------------------------------------------------- E3 guarda 2: nao houve troca
//
// ESTE E O CASO QUE PROTEGE A LINHA SADIA. Alguem digita a UC errada e o script
// recusa em vez de apagar um vinculo bom. Provado contra producao em 03/08 com a
// 000059133001226 (THAIS), que passou por aqui e foi recusada.
{
  const d = decidirDestrave({
    ...REAL,
    crmPorContrato: { ...REAL.crmPorContrato!, uc: REAL.numeroUc },
  });
  chk('E3a', d.pode === false && d.guarda === 2,
      'o contrato do CRM ainda aponta para esta UC: recusa na guarda 2');
  chk('E3b', !d.pode && d.motivo.includes('continua na UC'),
      'o motivo diz que nao ha troca, que e o que a pessoa precisa saber');
}

// ---------------------------------------------------- E4 guarda 2: contrato sumiu
//
// Diferente do E3: o contrato nao esta em lugar nenhum da view. Pode ser rateio
// encerrado, e a decisao ai e outra - encerrar a linha, nao repontar.
{
  const d = decidirDestrave({ ...REAL, crmPorContrato: null });
  chk('E4a', d.pode === false && d.guarda === 2, 'contrato fora da view: recusa na guarda 2');
  chk('E4b', !d.pode && d.motivo.includes('contrato que sumiu'),
      'o motivo separa "sumiu" de "trocou", porque a acao seguinte e diferente');
}

// ---------------------------------------------------- E5 guarda 3: sem substituto
//
// O contrato se moveu E nenhum outro serve esta UC. Apagar deixaria a linha orfa:
// o ciclo seguinte nao teria contrato para gravar, e a UC ficaria sem vinculo sem
// que nada acusasse.
{
  const d = decidirDestrave({ ...REAL, crmPorUc: null });
  chk('E5a', d.pode === false && d.guarda === 3, 'nenhum contrato serve a UC: recusa na guarda 3');
  chk('E5b', !d.pode && d.motivo.includes('orfa'), 'o motivo nomeia a consequencia, nao so a condicao');
}

// ---------------------------------------------------- E6 guarda 4: segundo conflito
//
// O substituto ja esta preso a outra UC nossa. Apagar um ponteiro so trocaria uma
// recusa por outra - com uma escrita no meio, que e o pior dos dois mundos.
{
  const d = decidirDestrave({ ...REAL, ucPresaAoSubstituto: '000099999999999' });
  chk('E6a', d.pode === false && d.guarda === 4, 'substituto preso a outra UC: recusa na guarda 4');
  chk('E6b', !d.pode && d.motivo.includes('000099999999999'),
      'o motivo NOMEIA a outra UC — sem ela a pessoa nao tem por onde comecar');
}

// ================================================= E7 a ordem das guardas

// Quando mais de uma barra, vale a PRIMEIRA. Aqui tudo esta errado ao mesmo
// tempo: sem ponteiro, sem contrato no CRM, sem substituto e com conflito.
{
  const d = decidirDestrave({
    numeroUc: '000000000000001', contratoNoEspelho: null,
    crmPorContrato: null, crmPorUc: null, ucPresaAoSubstituto: '000000000000002',
  });
  chk('E7a', d.pode === false && d.guarda === 1,
      'com as quatro condicoes falhando, o motivo devolvido e o da guarda 1');
}

// E com a 1 satisfeita, cai na 2 e nao pula para a 3 nem para a 4.
{
  const d = decidirDestrave({
    ...REAL, crmPorContrato: null, crmPorUc: null, ucPresaAoSubstituto: '000000000000002',
  });
  chk('E7b', d.pode === false && d.guarda === 2,
      'com a guarda 1 satisfeita e as outras tres falhando, devolve a 2');
}

// ================================================= E8 a decisao nao escreve nada
//
// Nao e teste de comportamento, e teste de FORMA: a decisao devolve nomes, nunca
// uma acao. Quem escreve e o script, e quem grava o vinculo novo e o conector
// (R6). Se um dia esta funcao passar a devolver "o que gravar", a R23 caiu junto.
{
  const d = decidirDestrave(REAL);
  const campos = d.pode ? Object.keys(d).sort() : [];
  chk('E8a', JSON.stringify(campos) ===
      JSON.stringify(['contratoASoltar', 'contratoQueVaiEntrar', 'pode', 'ucQueVaiNascer']),
      'a decisao devolve so nomes: nada que se pareca com "grave isto aqui"');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
