-- MIGRATION 20 - UNIQUE (tenant_id, identidade_id) em logo_de_cobranca.
--
-- POR QUE ELA EXISTE, e o motivo e a regra 11 acontecendo numa direcao nova.
--
-- A migration 19 criou `logo_de_cobranca` com `tenant_id UNIQUE` (uma logo por
-- tenant) e a FK COMPOSTA `(tenant_id, identidade_id) -> identidade_de_cobranca
-- (tenant_id, id)`, que e o que o `CAT-7` exige. Aplicada em producao, sem erro.
--
-- Ai o `db pull` de 30/07 leu o banco e inferiu, corretamente, uma relacao
-- **to-one** - porque `tenant_id` e unico, uma identidade tem no maximo uma logo.
-- E o `prisma generate` RECUSOU o schema que a propria introspecao acabara de
-- escrever:
--
--   P1012: A one-to-one relation must use unique fields on the defining side.
--   Either add an `@@unique([tenant_id, identidade_id])` attribute to the model,
--   or change the relation to one-to-many.
--
-- Ou seja: o Prisma 7.9 exige que os campos DA RELACAO sejam unicos, e nao
-- aceita que a unicidade venha de um subconjunto deles. O banco garante mais do
-- que ele pede - `tenant_id` unico implica `(tenant_id, identidade_id)` unico -,
-- e ainda assim a validacao falha.
--
-- A REGRA 11 DECIDE ONDE CONSERTAR. "Editar `schema.prisma` compila, mas todo
-- `db pull` reverte em silencio. O conserto e no banco." Acrescentar
-- `@@unique` a mao no arquivo funcionaria hoje e desapareceria no proximo pull -
-- e o sintoma seria um `generate` quebrado, num dia em que ninguem lembraria por
-- que. Entao o UNIQUE vai para o banco, onde a introspecao o encontra.
--
-- A CONSTRAINT E REDUNDANTE DE PROPOSITO, e ha precedente: a regra 2 manda
-- `UNIQUE (tenant_id, id)` em toda tabela referenciada, redundante com a PK,
-- justamente para a garantia ser EXPRESSAVEL pela FK composta. Esta e do mesmo
-- tipo - redundante para o banco, necessaria para o gerador.
--
-- Tabela vazia em producao (0 linhas, criada minutos antes), entao o ALTER nao
-- pode falhar por dado existente.

ALTER TABLE logo_de_cobranca
  ADD CONSTRAINT logo_identidade_unico UNIQUE (tenant_id, identidade_id);

COMMENT ON CONSTRAINT logo_identidade_unico ON logo_de_cobranca IS
  'Redundante com tenant_id UNIQUE, e necessaria: sem ela o db pull produz uma '
  'relacao to-one que o prisma generate recusa com P1012. Regra 11 - o conserto '
  'e no banco, porque editar o schema.prisma some no proximo pull.';
