-- R14, corrigida em duas frentes: a REGRA estava furada e a TIPAGEM mentia.
--
-- 1. A REGRA. O comentario da migration de fundacao diz "uma UC tem no maximo um
--    contrato ativo" e o indice era `WHERE status = 'ativo'`. O enum tem quatro
--    estados. Medido em PG 17: o banco ACEITAVA um ativo e um suspenso na mesma
--    UC ao mesmo tempo. Contrato suspenso e UC comprometida - rateio pausado,
--    vinculo de pe - entao a regra que o negocio quer e "um contrato VIGENTE por
--    UC", vigente = ativo OU suspenso. Rascunho segue livre: varias propostas em
--    rascunho na mesma UC e legitimo.
--
--    Sem esta correcao o furo aparece tarde e mal: a UC com contrato suspenso
--    aceita um novo ativo, e no dia em que alguem reativar o suspenso o erro sai
--    como 23505 de indice - regra de negocio vazando como violacao de constraint.
--
-- 2. A TIPAGEM. O `db pull` do Prisma 7.9 ignora o predicado do indice parcial ao
--    inferir cardinalidade. Como o unique cobria EXATAMENTE o conjunto de colunas
--    da FK contrato_uc_fk, ele tipou unidade_consumidora.contrato como to-one.
--    Medido: numa UC com quatro contratos, a relacao devolveu um suspenso de
--    R$ 111,00 quando o vigente valia R$ 789,00. Sem erro, sem log. O cenario e
--    a primeira renovacao - mes 6, producao.
--
--    Coluna gerada em vez de indice parcial porque e a unica forma que sobrevive
--    ao `db pull`. Editar o schema na mao compila, mas todo pull reverte em
--    silencio, e este projeto nao aceita invariante que dependa de alguem
--    lembrar. Com a coluna, o unique e CHEIO e o conjunto (tenant_id, uc_vigente)
--    NAO e o conjunto da FK: a relacao volta a ser 1-N para sempre.
--
--    De brinde, o Prisma passa a gerar findUnique(tenant_id_uc_vigente), que e
--    "o contrato vigente desta UC" garantido pelo banco.
--
-- ORDEM OBRIGATORIA NA RENOVACAO, medida: indice unico nao e DEFERRABLE. Encerre
-- o contrato velho ANTES de inserir o novo, na mesma transacao. A ordem invertida
-- da 23505 e passa em teste com UC limpa. Ver src/repos/contrato.ts.
--
-- PRE-CHECAGEM antes de aplicar em banco com dado (conferida em 26/07: nenhuma):
--   SELECT tenant_id, unidade_consumidora_id, count(*),
--          array_agg(status::text ORDER BY data_fechamento)
--   FROM contrato WHERE status IN ('ativo','suspenso')
--   GROUP BY 1,2 HAVING count(*) > 1;
ALTER TABLE contrato ADD COLUMN uc_vigente uuid
  GENERATED ALWAYS AS (
    CASE WHEN status IN ('ativo','suspenso') THEN unidade_consumidora_id END
  ) STORED;

CREATE UNIQUE INDEX contrato_vigente_unico_por_uc ON contrato (tenant_id, uc_vigente);
DROP INDEX contrato_ativo_unico_por_uc;

COMMENT ON COLUMN contrato.uc_vigente IS
  'R14. Espelha unidade_consumidora_id enquanto o contrato ocupa a UC (ativo ou suspenso), NULL caso contrario. Coluna GERADA: nunca escrever.';
