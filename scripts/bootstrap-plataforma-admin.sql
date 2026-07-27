-- BOOTSTRAP - o primeiro plataforma_admin. RESUMO-SESSAO-7 §Fila item 1.
--
-- POR QUE ISTO NAO E MIGRATION E NAO E CODIGO DE APLICACAO:
--
-- A cadeia trava por desenho. Criar tenant exige tier de plataforma; o tier vem
-- de uma linha em `plataforma_admin`; e `app_financeiro` NAO tem INSERT nessa
-- tabela - revogado na migration 10, secao 4, depois do furo de autopromocao
-- medido em 26/07 (policy FOR ALL sem WITH CHECK usava o USING como check de
-- escrita, e um usuario de papel 'leitura' se promovia a plataforma_admin).
--
-- Conferido em 27/07 contra o banco de producao:
--   has_table_privilege('app_financeiro','plataforma_admin','INSERT') = f
--   has_table_privilege('app_financeiro','usuario','INSERT')          = t
--
-- O INSERT em `usuario` existe, mas nao alcanca: a policy `usuario_plataforma`
-- tem WITH CHECK (app.current_tier() = 'plataforma_admin'), e o tier e
-- justamente o que ainda nao existe. As duas linhas nascem aqui, por psql, com a
-- role dona do schema - mesmo padrao da role de runtime: PROVISIONAMENTO.
--
-- ESTE SCRIPT NAO CRIA TENANT NEM VINCULO, de proposito. Dai em diante o proprio
-- app cria, com auditoria e com a matriz de papeis valendo. Alargar o script
-- seria alargar o caminho que contorna a aplicacao.
--
-- ---------------------------------------------------------------------------
-- USO
--
--   DIRECT_URL=...            # a role dona do schema, session pooler na 5432
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -v modo=ensaio \
--     -v auth_user_id='00000000-0000-0000-0000-000000000000' \
--     -v nome='Vinicius Leal' \
--     -v email='lealvbl@gmail.com' \
--     -f scripts/bootstrap-plataforma-admin.sql
--
-- `modo` e OBRIGATORIO e nao tem default:
--   modo=ensaio   -> roda tudo, mostra o resultado e da ROLLBACK. Rode SEMPRE
--                    isto primeiro. E como toda prova de escrita deste projeto
--                    rodou desde a sessao 6.
--   modo=valendo  -> COMMIT.
-- Sem default de proposito: um script de provisionamento que escreve porque
-- alguem esqueceu de passar uma flag e o modo de falha errado.
--
-- O `auth_user_id` e o `sub` do JWT, que e o `id` da conta em auth.users deste
-- projeto. Crie a conta no Supabase Auth ANTES: `usuario` nao tem FK para
-- auth.users (schemas separados), entao um UUID digitado errado nao falha aqui -
-- vira uma linha que nunca loga e que ninguem descobre. A guarda abaixo existe
-- por isso.
--
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

-- As duas guardas de `modo` erram em SQL, e nao com \quit: \quit sai com codigo
-- ZERO, e script de provisionamento que devolve sucesso quando nao fez nada e
-- exatamente o modo de falha que este projeto persegue. Com ON_ERROR_STOP=1 o
-- RAISE devolve 3.
\if :{?modo}
\else
  DO $g$ BEGIN
    RAISE EXCEPTION 'modo ausente'
      USING HINT = 'Informe -v modo=ensaio (ROLLBACK) ou -v modo=valendo (COMMIT).';
  END $g$;
\endif

SELECT :'modo' IN ('ensaio','valendo') AS modo_valido \gset
\if :modo_valido
\else
  DO $g$ BEGIN
    RAISE EXCEPTION 'modo invalido'
      USING HINT = 'Tem que ser exatamente `ensaio` ou `valendo`.';
  END $g$;
\endif

BEGIN;

/*
 * A logica vive numa funcao em pg_temp por um motivo de psql, nao de estilo:
 * psql NAO interpola :'variavel' dentro de string dollar-quoted, entao um bloco
 * DO $$ ... :'auth_user_id' ... $$ receberia o texto cru e falharia. Com a
 * funcao, a interpolacao acontece na CHAMADA, que e SQL normal.
 *
 * pg_temp morre com a sessao: nao fica funcao de provisionamento no schema.
 */
CREATE FUNCTION pg_temp.bootstrap_admin(p_auth uuid, p_nome text, p_email text)
  RETURNS TABLE (etapa text, resultado text)
  LANGUAGE plpgsql AS
$fn$
DECLARE
  v_usuario_id uuid;
  v_ativo      boolean;
  v_criou_u    boolean := false;
  v_criou_pa   boolean := false;
BEGIN
  -- GUARDA 1: a conta tem que existir no Supabase Auth DESTE projeto.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_auth) THEN
    RAISE EXCEPTION 'auth_user_id % nao existe em auth.users deste projeto', p_auth
      USING HINT = 'Crie a conta no Supabase Auth primeiro (dashboard ou Admin API). '
                   'Nao ha FK entre public.usuario e auth.users - um UUID errado '
                   'nao falha, vira uma linha que nunca loga.';
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'nome vazio';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'email vazio';
  END IF;

  -- ETAPA 1: o usuario. Idempotente pelo UNIQUE em auth_user_id.
  INSERT INTO public.usuario (auth_user_id, nome, email)
  VALUES (p_auth, btrim(p_nome), btrim(p_email))
  ON CONFLICT (auth_user_id) DO NOTHING;
  GET DIAGNOSTICS v_criou_u = ROW_COUNT;

  SELECT u.id, u.ativo INTO v_usuario_id, v_ativo
    FROM public.usuario u WHERE u.auth_user_id = p_auth;

  -- GUARDA 2: usuario inativo passa nas duas insercoes e some no login -
  -- app.resolver_login() filtra por `u.ativo`. Falha alto em vez de silenciar.
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'usuario % existe mas esta ativo = false', v_usuario_id
      USING HINT = 'app.resolver_login() filtra por ativo. Reative antes de conceder tier.';
  END IF;

  etapa := 'usuario'; resultado :=
    CASE WHEN v_criou_u THEN 'criado ' ELSE 'ja existia ' END || v_usuario_id::text;
  RETURN NEXT;

  -- ETAPA 2: o tier. So por aqui - a aplicacao nao alcanca esta tabela.
  INSERT INTO public.plataforma_admin (usuario_id, tier)
  VALUES (v_usuario_id, 'plataforma_admin')
  ON CONFLICT (usuario_id) DO NOTHING;
  GET DIAGNOSTICS v_criou_pa = ROW_COUNT;

  etapa := 'plataforma_admin'; resultado :=
    CASE WHEN v_criou_pa THEN 'tier concedido' ELSE 'tier ja existia' END;
  RETURN NEXT;
END
$fn$;

SELECT * FROM pg_temp.bootstrap_admin(:'auth_user_id'::uuid, :'nome', :'email');

-- ---------------------------------------------------------------------------
-- VERIFICACAO, na mesma transacao. Um bootstrap que nao se prova nao serve.
-- ---------------------------------------------------------------------------

-- 1. O caminho de login do sistema, exercitado de verdade. E a MESMA funcao que
--    src/auth/sessao.ts chama - a unica consulta feita fora de contexto de
--    tenant (R1-c). tier = 'plataforma_admin' e tenant_id NULL e o esperado
--    aqui: ainda nao ha tenant, e ter tier nao da papel dentro de tenant (R3).
SELECT usuario_id, nome, tier, tenant_id, papel
  FROM app.resolver_login(:'auth_user_id'::uuid);

-- 2. A trilha da regra 9. Conceder tier e a escrita mais privilegiada do
--    sistema, e a auditoria tem que ter as duas linhas.
--
--    usuario_id e tier vem NULL nas duas: a escrita e feita SEM contexto de
--    aplicacao, e a migration 10 declara isso como informacao, nao como falha -
--    "NULL = escrita sem contexto (migration, seed, DBA)". Quem executou fica no
--    log de conexao do Postgres, nao aqui.
SELECT tabela, operacao, registro_id, tenant_id, usuario_id, tier
  FROM auditoria
 WHERE tabela IN ('usuario','plataforma_admin')
 ORDER BY id;

-- 3. Contagem final.
SELECT (SELECT count(*) FROM usuario)          AS usuarios,
       (SELECT count(*) FROM plataforma_admin) AS admins,
       (SELECT count(*) FROM tenant)           AS tenants,
       (SELECT count(*) FROM auditoria)        AS linhas_de_trilha;

-- ---------------------------------------------------------------------------
SELECT :'modo' = 'valendo' AS commitar \gset
\if :commitar
COMMIT;
\echo '== COMMIT. O tier esta concedido. =='
\else
ROLLBACK;
\echo '== ROLLBACK (modo=ensaio). Nada foi gravado. =='
\endif
