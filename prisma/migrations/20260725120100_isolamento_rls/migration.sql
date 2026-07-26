-- SPEC-001 v2.2 - migration 2 de 2: ISOLAMENTO
-- Funcao de contexto (ADR-0003 r2, variante V1) + RLS FORCE + policy nas TREZE
-- tabelas com tenant_id. Separada da migration 1 por decisao da SPEC-001 3.2.

CREATE SCHEMA IF NOT EXISTS app;

-- ADR-0003 r2: le o GUC de sessao que o middleware define com SET LOCAL.
-- STABLE, nao IMMUTABLE: o valor muda entre transacoes.
-- O segundo argumento 'true' evita erro quando o GUC nunca foi definido -
-- devolve NULL, e a policy nega. Falha fechada, nao aberta.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Role da aplicacao. Sem BYPASSRLS e sem SUPERUSER, de proposito:
-- o dono da tabela ignora RLS, e por isso o FORCE abaixo tambem e obrigatorio.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_financeiro') THEN
    CREATE ROLE app_financeiro NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app, public TO app_financeiro;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO app_financeiro;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_financeiro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_financeiro;

-- As TREZE tabelas com tenant_id (SPEC-001 invariante 2).
-- tenant, usuario e plataforma_admin ficam fora por desenho: nao tem tenant_id.
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'usuario_tenant','acesso_plataforma_log','conector_crm',
    'cliente','cliente_estado_crm','unidade_consumidora',
    'usina','usina_geracao','dono_usina','originador','contrato',
    'regra_comissao','tarifa'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE: sem ele o OWNER da tabela le tudo, e migration roda como owner
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app.current_tenant_id())
        WITH CHECK (tenant_id = app.current_tenant_id())
    $f$, t);
  END LOOP;
END $$;

-- Invariante 3, verificada pelo BANCO e nao por revisao de PR.
-- Se alguem criar tabela com tenant_id e esquecer a policy, esta migration
-- nao pega - o teste test_rls_forcada_e_policy_presente pega. Mas o assert
-- abaixo garante que ESTA migration nao mentiu.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0
  WHERE c.relkind = 'r'
    AND (NOT c.relrowsecurity
      OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS incompleta em: %', faltando;
  END IF;
END $$;
