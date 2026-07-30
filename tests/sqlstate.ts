// O EXTRATOR DE SQLSTATE. Puro, sem banco.
// Uso: node --experimental-strip-types tests/sqlstate.ts
//
// POR QUE ESTA SUITE EXISTE, e o defeito que a produziu.
//
// Em 30/07/2026 o EXCLUDE da migration 21 recusou a segunda rodada da agenda, e
// a traducao para erro de negocio nao aconteceu. A condicao era a mesma que
// `src/crm/sincronizacao.ts` usava desde 27/07:
//
//   e?.code === 'P2010' || String(e?.meta?.code ?? e?.code) === '23P01'
//
// e no Prisma 7.9 sobre `@prisma/adapter-pg` `e.code` e **'P2039'** e
// `e.meta.code` e **undefined**. Nenhuma das duas metades alcanca. Consequencia
// no conector do CRM, que estava em producao: `CicloJaEmAndamento` NUNCA era
// lancada, e "o segundo ciclo nao inicia" (SPEC-002 §7) chegaria como 500 em vez
// de 409. Nao havia teste - a classe aparecia num unico lugar do sistema, o
// `throw` dela.
//
// O QUE ESTA SUITE AFIRMA, E COMO ELA EVITA A TAUTOLOGIA. A fixture E1 abaixo
// nao foi escrita a mao: e a forma do erro MEDIDA na sessao, copiada do
// `console.error` de um EXCLUDE de verdade. Um teste construido a partir da
// minha leitura do codigo teria a forma que eu ACHO que o Prisma produz - que e
// exatamente o erro que se esta consertando.
//
// A segunda metade e a que impede o conserto de ser generoso demais: um extrator
// que devolvesse `e.code` sem conferir a FORMA passaria 'P2002' como se fosse
// SQLSTATE (cinco caracteres, como '23505'), e todo `P2002` viraria violacao de
// exclusao em algum ponto do sistema.

import { sqlstate, ehSqlstate, SQLSTATE } from '../src/db/sqlstate.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

/**
 * E1 - A FORMA REAL, medida em 30/07/2026 contra PostgreSQL 16 pelo
 * `@prisma/adapter-pg` 7.9.0, ao inserir a segunda `agenda_execucao` em
 * andamento. Copiada da saida, nao redigida.
 */
const E1 = Object.assign(new Error('\nInvalid `prisma.agenda_execucao.create()` invocation'), {
  name: 'PrismaClientKnownRequestError',
  code: 'P2039',
  meta: {
    modelName: 'agenda_execucao',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23P01',
        originalMessage: 'conflicting key value violates exclusion constraint "agenda_uma_execucao_por_tarefa"',
        kind: 'postgres',
        code: '23P01',
        severity: 'ERROR',
        message: 'conflicting key value violates exclusion constraint "agenda_uma_execucao_por_tarefa"',
        detail: 'Key conflicts with existing key.',
      },
    },
  },
});

// ---------------------------------------------------- S1 a forma medida
{
  chk('S1a', sqlstate(E1) === '23P01',
      'a forma REAL do erro do Prisma 7.9 sobre driver adapter devolve 23P01 - a fixture e a '
      + 'medicao de 30/07 copiada da saida, e nao a forma que eu imaginava que o Prisma produz');

  chk('S1b', ehSqlstate(E1, SQLSTATE.violacaoDeExclusao) === true,
      'e o acucar de leitura concorda - e a chamada que `sincronizacao.ts` e `agenda.ts` fazem');
}

// ---------------------------------------------------- S2 a condicao ANTIGA falhava
{
  /*
   * A REGRESSAO EXPLICITA. Esta verificacao afirma que a condicao antiga NAO
   * funciona - ela e o registro executavel do defeito, e nao um comentario. Se
   * alguem "simplificar" o extrator de volta para `e.meta?.code`, esta linha cai.
   */
  const antiga = (e: any) => e?.code === 'P2010' || String(e?.meta?.code ?? e?.code) === '23P01';
  chk('S2a', antiga(E1) === false && sqlstate(E1) === '23P01',
      'a condicao ANTIGA nao alcanca esta forma (e.code = P2039, e.meta.code = undefined) e a nova '
      + 'alcanca - e a diferenca entre CicloJaEmAndamento existir e nunca ser lancada');
}

// ---------------------------------------------------- S3 forma, e nao tamanho
{
  const p2002 = Object.assign(new Error('Unique constraint failed'), {
    name: 'PrismaClientKnownRequestError', code: 'P2002', meta: { target: ['tenant_id', 'documento'] },
  });
  chk('S3a', sqlstate(p2002) === null,
      'um P2002 NAO vira SQLSTATE - ele tem cinco caracteres como 23505, e um extrator que so '
      + 'contasse o tamanho transformaria toda violacao de unico do Prisma em codigo do Postgres');

  const p2039 = Object.assign(new Error('sem detalhe'), { code: 'P2039' });
  chk('S3b', sqlstate(p2039) === null,
      'e um P2039 sem `driverAdapterError` devolve null em vez de "P2039" - null e uma resposta '
      + 'honesta, e o chamador relanca o erro cru');
}

// ---------------------------------------------------- S4 o erro do `pg` cru
{
  // O caminho do Pool direto, sem Prisma: `src/crm/conexao.ts` e os scripts de
  // provisionamento passam por aqui.
  const pgCru = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505', severity: 'ERROR', constraint: 'contrato_ativo_unico_por_uc',
  });
  chk('S4a', sqlstate(pgCru) === SQLSTATE.violacaoDeUnico,
      'o erro do `pg` cru, que carrega o SQLSTATE em `code`, tambem e reconhecido - as duas '
      + 'formas convivem no sistema porque nem tudo passa pelo Prisma');

  const embrulhado = Object.assign(new Error('falhou'), { cause: { code: '23503' } });
  chk('S4b', sqlstate(embrulhado) === SQLSTATE.violacaoDeFk,
      'e o embrulhado em `cause` tambem - e a forma que o `pg` usa quando o erro atravessa uma '
      + 'camada que o re-lanca');
}

// ---------------------------------------------------- S5 o fallback por texto
{
  const soTexto = new Error('ERROR: conflicting key value violates exclusion constraint (SQLSTATE 23P01)');
  chk('S5a', sqlstate(soTexto) === '23P01',
      'sobra o texto como ULTIMO recurso - e foi ele que fazia `regras.ts` funcionar sem que '
      + 'ninguem soubesse que os caminhos estruturados nao eram alcancados');

  const semNada = new Error('alguma coisa deu errado');
  chk('S5b', sqlstate(semNada) === null && sqlstate(null) === null && sqlstate('texto') === null,
      'erro sem codigo nenhum, null e string devolvem null - nao ha adivinhacao, e o chamador '
      + 'relanca o que nao reconheceu em vez de traduzir errado');
}

// ---------------------------------------------------- S6 a precedencia
{
  // Estruturado GANHA do texto. Um erro cuja mensagem cita um codigo e cujo
  // campo diz outro tem que seguir o campo: a mensagem pode estar citando o
  // codigo de um erro ANTERIOR, encadeado.
  const conflitante = Object.assign(
    new Error('a mensagem fala de 23505, mas nao e esse o erro'),
    { meta: { driverAdapterError: { cause: { code: '23P01' } } } },
  );
  chk('S6a', sqlstate(conflitante) === '23P01',
      'o campo estruturado tem precedencia sobre o texto - mensagem do Postgres muda com a versao '
      + 'e com lc_messages, e ha erro encadeado citando o codigo do anterior');
}

console.log(`\n${falhas === 0 ? 'sqlstate: todas as verificacoes passaram'
                              : `sqlstate: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
