-- CLAUDE.md regra 2 aplicada a cliente_estado_crm.
--
-- A regra manda UNIQUE composto com tenant_id em toda tabela referenciada, e a
-- tabela escapou porque a PK dela se chama cliente_id, nao id: o padrao foi
-- conferido por NOME DE COLUNA, nao por papel.
--
-- Consequencia medida em 26/07: o `db pull` ve cliente_id unico (e PK), infere
-- relacao 1-1, e emite a relacao pelos campos compostos (tenant_id, cliente_id)
-- - que nao tem unique. O Prisma entao RECUSA o schema inteiro:
--
--   P1012  A one-to-one relation must use unique fields on the defining side.
--          --> prisma/schema.prisma:62  (model cliente_estado_crm)
--
-- Nao ha client gerado enquanto isto nao existir, e portanto nao ha repositorio
-- que nao seja escrito contra `any`. Esta migration destrava o generate.
--
-- A relacao E 1-1 de verdade: um estado de CRM por cliente. O UNIQUE apenas diz
-- ao banco o que o desenho ja assumia.
ALTER TABLE cliente_estado_crm
  ADD CONSTRAINT cec_tenant_cliente_unico UNIQUE (tenant_id, cliente_id);
