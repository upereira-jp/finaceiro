-- O `vault` DE MENTIRA, e ele existe porque o CI NAO E O SUPABASE.
--
-- Uso: aplicado pelos harnesses ANTES das migrations, num banco recem-criado.
--      Nunca entra em producao - `prisma migrate deploy` nao o conhece.
--
-- ============================================================================
-- O QUE ELE CONSERTA, e a falha era total e silenciosa no lugar errado
--
-- A migration 35 termina com um bloco que confere se o DONO da resolvedora
-- enxerga o cofre:
--
--     IF NOT has_table_privilege(v_dono, 'vault.decrypted_secrets', 'SELECT')
--
-- `has_table_privilege` LEVANTA quando a relacao nao existe - nao devolve false.
-- E o schema `vault` e do Supabase (extensao `supabase_vault`), entao num
-- PostgreSQL puro, que e o que o CI sobe em service container, a migration 35
-- morre com `ERROR: schema "vault" does not exist`.
--
-- CONSEQUENCIA MEDIDA EM 01/09/2026: desde 27/08 - o dia em que a 35 entrou - as
-- QUATRO suites de banco (`isolamento`, `middleware`, `sessao`, `repos`)
-- pararam na 35a de 36 migrations e NAO RODARAM MAIS. Somado a "elas nao rodam
-- na VPS, que nao tem PostgreSQL local", elas nao rodavam em lugar nenhum: todo
-- o trabalho de boleto, webhook e cofre de 28 a 30/08 entrou sem nenhuma
-- verificacao de banco ter sido executada.
--
-- ============================================================================
-- POR QUE UM STUB, E NAO CONSERTAR A MIGRATION 35
--
-- A 35 ESTA APLICADA EM PRODUCAO. Editar migration aplicada e reescrever
-- historia que o `_prisma_migrations` ja carimbou - foi por isso que a 36 pode
-- ser corrigida no lugar (ela ainda nao tinha sido aplicada) e a 35 nao pode.
-- O conserto pertence a quem monta o banco de teste, e o banco de teste e que
-- nao e Supabase.
--
-- ============================================================================
-- O QUE ESTE STUB NAO PROVA, E ISSO IMPORTA MAIS QUE O QUE ELE PROVA
--
-- Ele NAO CIFRA NADA: `decrypted_secret` e a mesma coluna `secret`, em claro. E
-- ele deixa o bloco da 35 cair no ramo do NOTICE, porque no CI o dono da funcao
-- e o `postgres`, que enxerga tudo. Ou seja: **a promessa do ADR-0005 continua
-- sem ser exercida aqui**, e nao ha teste no CI que possa dizer que o cofre
-- funciona.
--
-- QUEM PROVA AQUELAS SEIS PROMESSAS E O `npm run ensaio-cofre`, contra o
-- Supabase de verdade, com as roles de verdade e terminando em ROLLBACK. Este
-- arquivo so tira do caminho um `ERROR` de schema ausente para que as outras
-- centenas de verificacoes, que nada tem a ver com cofre, voltem a rodar.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE,
  description text NOT NULL DEFAULT '',
  secret      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A view que o codigo LE. No Supabase ela decifra; aqui ela so repete a coluna,
-- e o nome `decrypted_secret` e mantido porque e o contrato que a resolvedora
-- da migration 35 consulta.
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret, secret AS decrypted_secret, created_at, updated_at
    FROM vault.secrets;

COMMENT ON SCHEMA vault IS
  'FIXTURE DE TESTE - nao e o supabase_vault. Ver tests/vault-de-mentira.sql. '
  'Nao cifra nada, e nenhuma afirmacao sobre o cofre pode se apoiar nele.';
