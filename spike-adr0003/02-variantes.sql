-- ADR-0003 — as três saídas candidatas da SPEC-001 §3.2, cada uma
-- instalável trocando UMA definição de função, como a spec promete.

-- =====================================================================
-- V1 — SET LOCAL por transação
-- =====================================================================
CREATE OR REPLACE FUNCTION app.instalar_v1() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE $q$
    CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
      LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
  $q$;
END $fn$;

-- =====================================================================
-- V2a — auth.uid() + join em usuario_tenant, SEM security definer
--       (a forma ingênua: é a que recursiona)
-- =====================================================================
CREATE OR REPLACE FUNCTION app.instalar_v2a() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE $q$
    CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
      LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('app.auth_uid', true), '')::uuid $$;
  $q$;
  EXECUTE $q$
    CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
      LANGUAGE sql STABLE AS
    $$ SELECT ut.tenant_id
         FROM usuario_tenant ut
         JOIN usuario u ON u.id = ut.usuario_id
        WHERE u.auth_user_id = app.current_user_id()
          AND ut.ativo
        LIMIT 1 $$;
  $q$;
END $fn$;

-- =====================================================================
-- V2b — mesma coisa, com SECURITY DEFINER (a saída padrão da recursão)
-- =====================================================================
CREATE OR REPLACE FUNCTION app.instalar_v2b() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM app.instalar_v2a();
  EXECUTE $q$
    CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER AS
    $$ SELECT ut.tenant_id
         FROM usuario_tenant ut
         JOIN usuario u ON u.id = ut.usuario_id
        WHERE u.auth_user_id = app.current_user_id()
          AND ut.ativo
        LIMIT 1 $$;
  $q$;
END $fn$;

-- =====================================================================
-- V3 — conexão por tenant: contexto fixado na role, não na transação
-- =====================================================================
CREATE OR REPLACE FUNCTION app.instalar_v3() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM app.instalar_v1();   -- mesma leitura de current_setting
  EXECUTE $q$ALTER ROLE app_tenant_a SET app.tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$;
  EXECUTE $q$ALTER ROLE app_tenant_b SET app.tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$;
END $fn$;
