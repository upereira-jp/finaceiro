-- O USUARIO DE SERVICO DO WEBHOOK DE COBRANCA. `ADR-0006`, Decisao 3.
--
-- POR QUE ISTO E SCRIPT E NAO MIGRATION, e a ADR §8 nomeia: e provisionamento,
-- como o `bootstrap-plataforma-admin.sql` e o `provisionar-tenant.sql`. Migration
-- descreve o SCHEMA; um sujeito de trilha por tenant e DADO, e dado de um tenant
-- nao entra na definicao do banco de todos.
--
-- O QUE ELE CRIA, e nada alem disto:
--   1. uma linha em `usuario`, com o auth_user_id DERIVADO do tenant;
--   2. o vinculo em `usuario_tenant` com papel `cobranca`.
--
-- POR QUE `cobranca` E NAO `admin`: e o papel MINIMO que faz `escrever_carteira`
-- passar - a matriz esta em `src/db/contexto.ts`, e `escrever_carteira` e o que
-- `liquidacao.baixar()` exige. `admin` daria de brinde `escrever_cadastro` e
-- `administrar` a um sujeito que nunca digita cadastro e nunca administra nada.
--
-- POR QUE ELE NAO TEM CAMINHO DE LOGIN: o `auth_user_id` existe NESTA tabela e
-- NAO existe no Supabase Auth. Ninguem emite JWT com esse `sub` porque nao ha
-- conta - ele e sujeito de trilha e de policy, nunca credencial. Quem autentica
-- a chamada e o mTLS da Decisao 1.
--
-- ---------------------------------------------------------------------------
-- USO. O `auth_user_id` NAO SE DIGITA - ele e derivado, e o comando pronto sai de:
--
--   npm run servico-de-cobranca -- --tenant <tenant uuid>
--
-- que imprime esta invocacao com o uuid ja preenchido:
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -v modo=ensaio \
--     -v tenant_id='<tenant uuid>' \
--     -v auth_user_id='<derivado>' \
--     -f scripts/provisionar-servico-de-cobranca.sql
--
-- `modo` obrigatorio, sem default - mesma disciplina dos outros dois.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

\if :{?modo}
\else
  DO $g$ BEGIN RAISE EXCEPTION 'modo ausente'
    USING HINT = 'Informe -v modo=ensaio (ROLLBACK) ou -v modo=valendo (COMMIT).'; END $g$;
\endif
SELECT :'modo' IN ('ensaio','valendo') AS modo_valido \gset
\if :modo_valido
\else
  DO $g$ BEGIN RAISE EXCEPTION 'modo invalido'
    USING HINT = 'Tem que ser exatamente `ensaio` ou `valendo`.'; END $g$;
\endif

BEGIN;

CREATE FUNCTION pg_temp.provisionar_servico(p_tenant uuid, p_auth uuid)
RETURNS TABLE (etapa text, resultado text) LANGUAGE plpgsql AS
$fn$
DECLARE
  v_usuario uuid;
  v_outro   uuid;
BEGIN
  -- GUARDA 1: o tenant tem que existir. Sem ela, um uuid trocado criaria um
  -- usuario de servico orfao que nunca recebe webhook nenhum - e o sintoma
  -- apareceria como "a Sicoob nao chama", que manda procurar no lugar errado.
  IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'nenhum tenant com id %', p_tenant
      USING HINT = 'Confira o tenant. O do financeiro esta no financeiro-ciclo.service.';
  END IF;

  -- GUARDA 2: o auth_user_id e DERIVADO do tenant. Se ele ja existe apontando
  -- para outro tenant, alguem digitou o uuid a mao - e prosseguir daria ao
  -- servico de um tenant um vinculo no outro, que e a confusao entre tenants
  -- que a Decisao 2 existe para tornar inexpressavel.
  SELECT ut.tenant_id INTO v_outro
    FROM public.usuario u
    JOIN public.usuario_tenant ut ON ut.usuario_id = u.id
   WHERE u.auth_user_id = p_auth AND ut.tenant_id <> p_tenant
   LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION 'o auth_user_id % ja tem vinculo no tenant %', p_auth, v_outro
      USING HINT = 'Nao digite o uuid: use `npm run servico-de-cobranca -- --tenant <tenant>`.';
  END IF;

  -- ETAPA 1: o usuario. Idempotente pelo UNIQUE em auth_user_id.
  INSERT INTO public.usuario (auth_user_id, nome, email)
  VALUES (p_auth, 'Conector de cobranca Sicoob', 'cobranca+' || p_tenant::text || '@servico.invalido')
  ON CONFLICT (auth_user_id) DO NOTHING;
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = p_auth;
  etapa := 'usuario'; resultado := v_usuario::text; RETURN NEXT;

  -- ETAPA 2: o vinculo, com o papel MINIMO. Se ja existir com outro papel, NAO
  -- rebaixa nem promove calado - avisa, porque papel de sujeito de trilha e
  -- decisao e nao detalhe.
  INSERT INTO public.usuario_tenant (tenant_id, usuario_id, papel)
  VALUES (p_tenant, v_usuario, 'cobranca')
  ON CONFLICT (usuario_id, tenant_id) DO NOTHING;
  etapa := 'usuario_tenant'; resultado := (
    SELECT 'papel ' || ut.papel::text FROM public.usuario_tenant ut
     WHERE ut.usuario_id = v_usuario AND ut.tenant_id = p_tenant
  ); RETURN NEXT;
END
$fn$;

SELECT * FROM pg_temp.provisionar_servico(:'tenant_id'::uuid, :'auth_user_id'::uuid);

-- ---------------------------------------------------------------------------
-- VERIFICACAO. O que importa nao e a linha ter entrado - e o LOGIN devolver o
-- vinculo, porque e exatamente `app.resolver_login` que o webhook vai chamar.
SELECT usuario_id, nome, tier, tenant_id, papel
  FROM app.resolver_login(:'auth_user_id'::uuid);

-- E que o papel seja o MINIMO. `admin` aqui passaria em tudo e daria ao webhook
-- escrita de cadastro, que ele nunca deve ter.
SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM app.resolver_login(:'auth_user_id'::uuid) r
       WHERE r.tenant_id = :'tenant_id'::uuid AND r.papel::text = 'cobranca')
    THEN 'papel OK - cobranca, o minimo que faz escrever_carteira passar'
    ELSE 'ATENCAO: o papel NAO e cobranca. Confira antes de ligar o webhook.'
  END AS conferencia_do_papel;

SELECT :'modo' = 'valendo' AS commitar \gset
\if :commitar
COMMIT;
\echo '== COMMIT. O usuario de servico existe e o webhook tem quem assinar a trilha. =='
\else
ROLLBACK;
\echo '== ROLLBACK (modo=ensaio). Nada foi gravado. =='
\endif
