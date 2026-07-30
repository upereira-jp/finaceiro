// O CODIGO SQLSTATE DE UM ERRO DO PRISMA, achado onde ele de fato esta.
//
// POR QUE ESTE ARQUIVO EXISTE, e a medicao que o produziu.
//
// Varias regras deste sistema sao impostas pelo BANCO e traduzidas para erro de
// negocio pela aplicacao: o EXCLUDE de vigencia (23P01 -> `VigenciaSobreposta`),
// o EXCLUDE de execucao unica (23P01 -> `CicloJaEmAndamento`), o unico de
// contrato vigente (23505 -> erro de R14). A traducao depende de reconhecer o
// SQLSTATE, e cada ponto do codigo estava reconhecendo-o de um jeito.
//
// MEDIDO EM 30/07/2026, Prisma 7.9 sobre `@prisma/adapter-pg`, ao ver o EXCLUDE
// da migration 21 recusar a segunda rodada da agenda. A forma real do erro:
//
//   e.code                                   'P2039'          <- NAO e 'P2010'
//   e.meta.code                              undefined
//   e.meta.modelName                         'agenda_execucao'
//   e.meta.driverAdapterError.cause.code     '23P01'          <- e AQUI
//   e.meta.driverAdapterError.cause.originalCode  '23P01'
//
// Consequencia imediata, e ela ja estava em producao: a condicao de
// `src/crm/sincronizacao.ts` era
//
//   e?.code === 'P2010' || String(e?.meta?.code ?? e?.code) === '23P01'
//
// e nenhuma das duas metades alcanca 'P2039'. `CicloJaEmAndamento` NUNCA era
// lancada - o erro cru do Prisma subia inteiro, e "o segundo ciclo nao inicia"
// (SPEC-002 §7) chegaria ao usuario como 500 em vez de 409. Nao havia teste: a
// classe era referenciada em um unico lugar do sistema, o `throw` dela.
//
// `src/repos/regras.ts` escapou por acaso - ele tem um `/23P01|exclusion/i.test(
// String(err?.message))` de fallback, e a mensagem do Prisma carrega o texto do
// Postgres. Depender do TEXTO da mensagem e depender de uma coisa que muda de
// versao para versao e de idioma para idioma.
//
// Este modulo olha os quatro lugares e devolve o codigo. E puro, entao a forma
// do erro medida acima virou fixture em `tests/sqlstate.ts` em vez de comentario.

/** Os SQLSTATE que este sistema traduz. Nao e a lista do Postgres inteiro - e a
 *  dos que tem erro de negocio correspondente aqui. */
export const SQLSTATE = {
  violacaoDeUnico: '23505',
  violacaoDeFk: '23503',
  violacaoDeExclusao: '23P01',
  violacaoDeCheck: '23514',
  semDado: '02000',
} as const;

/**
 * Devolve o SQLSTATE de cinco digitos, ou `null`.
 *
 * A ordem das tentativas vai do mais especifico ao mais generico, e para na
 * primeira que produz algo com FORMA de SQLSTATE - cinco caracteres
 * alfanumericos. A conferencia de forma importa: sem ela, `e.code` do Prisma
 * ('P2039', 'P2002') passaria como se fosse SQLSTATE, e 'P2002' tem cinco
 * caracteres.
 */
export function sqlstate(err: unknown): string | null {
  const e = err as any;
  if (!e || typeof e !== 'object') return null;

  const candidatos = [
    // 1. Onde o Prisma 7.9 sobre driver adapter de fato o poe.
    e.meta?.driverAdapterError?.cause?.code,
    e.meta?.driverAdapterError?.cause?.originalCode,
    // 2. O erro do `pg` cru, quando ele chega sem embrulho (caminho do Pool).
    e.cause?.code,
    e.originalCode,
    // 3. Versoes anteriores do Prisma punham aqui, e ha codigo vivo que confere
    //    este caminho. Fica por compatibilidade, nao por preferencia.
    e.meta?.code,
    // 4. O proprio `code`, que quase sempre e um 'Pxxxx' e sera descartado pela
    //    conferencia de forma. Esta na lista para o caso do erro do `pg` puro.
    e.code,
  ];

  for (const c of candidatos) {
    if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) && !/^P\d{4}$/.test(c)) return c;
  }

  /*
   * ULTIMO RECURSO: o texto. Fica por baixo de tudo e nao acima, porque mensagem
   * do Postgres muda com a versao e com `lc_messages`. E o fallback que fazia
   * `regras.ts` funcionar sem que ninguem soubesse que os caminhos estruturados
   * nao estavam sendo alcancados - o que e pior do que nao funcionar, porque nao
   * aparece.
   */
  const texto = String(e.message ?? '');
  const m = /\b(2[0-9A-Z]{4})\b/.exec(texto);
  return m ? m[1]! : null;
}

/** Acucar de leitura para o caso comum. */
export const ehSqlstate = (err: unknown, ...codigos: string[]): boolean => {
  const c = sqlstate(err);
  return c !== null && codigos.includes(c);
};
