-- ADR-0003 spike — schema base
-- Reproduz o contrato da SPEC-001 §3.2 no menor schema que prova o ponto.

DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;

-- stub: as policies referenciam a função, então ela precisa existir antes delas.
-- As variantes reais entram depois, por CREATE OR REPLACE (02-variantes.sql).
CREATE FUNCTION app.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- roles
-- roles removidas pelo run.sh (DROP OWNED BY antes)



-- a role do pool do Prisma: sem superuser, sem BYPASSRLS. É o caso real.
CREATE ROLE app_pool LOGIN PASSWORD 'spike' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
-- variante 3: uma role por tenant, com o contexto fixado na role
CREATE ROLE app_tenant_a LOGIN PASSWORD 'spike' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_tenant_b LOGIN PASSWORD 'spike' NOSUPERUSER NOBYPASSRLS;

-- ---------------------------------------------------------------- tabelas
DROP TABLE IF EXISTS contrato, cliente, usuario_tenant, usuario, tenant CASCADE;

CREATE TABLE tenant (
  id   uuid PRIMARY KEY,
  nome text NOT NULL
);                                    -- raiz: sem tenant_id, sem RLS

CREATE TABLE usuario (
  id           uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL UNIQUE,
  nome         text NOT NULL
);                                    -- nível plataforma: sem tenant_id

CREATE TABLE usuario_tenant (
  usuario_id uuid NOT NULL REFERENCES usuario(id),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  papel      text NOT NULL,
  ativo      bool NOT NULL DEFAULT true,
  PRIMARY KEY (usuario_id, tenant_id)
);                                    -- TEM tenant_id -> cai nas invariantes 3 e 4

CREATE TABLE cliente (
  id        uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  nome      text NOT NULL
);

CREATE TABLE contrato (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  cliente_id      uuid NOT NULL REFERENCES cliente(id),
  valor_centavos  int  NOT NULL
);

-- tabela de controle: RLS habilitada e NENHUMA policy. Replica o defeito do P8 §2.
CREATE TABLE sem_policy (
  id        uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  nota      text
);

-- ---------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuario_tenant','cliente','contrato','sem_policy'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- policies conforme o contrato da SPEC-001 §3.2 — em todas menos sem_policy
CREATE POLICY tenant_isolation ON usuario_tenant
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON cliente
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY tenant_isolation ON contrato
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT USAGE ON SCHEMA app, public TO app_pool, app_tenant_a, app_tenant_b;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO app_pool, app_tenant_a, app_tenant_b;

-- ---------------------------------------------------------------- seed
INSERT INTO tenant VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','Tenant A'),
  ('bbbbbbbb-0000-4000-8000-000000000002','Tenant B');

INSERT INTO usuario VALUES
  ('11111111-0000-4000-8000-000000000001','a1111111-0000-4000-8000-000000000001','Ana  (A)'),
  ('22222222-0000-4000-8000-000000000002','b2222222-0000-4000-8000-000000000002','Bruno (B)');

INSERT INTO usuario_tenant VALUES
  ('11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','admin',true),
  ('22222222-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','admin',true);

INSERT INTO cliente VALUES
  ('c1111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Cliente A-1'),
  ('c1111111-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','Cliente A-2'),
  ('c2222222-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','Cliente B-1');

INSERT INTO contrato VALUES
  ('d1111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',150000),
  ('d2222222-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','c2222222-0000-4000-8000-000000000001',990000);

INSERT INTO sem_policy VALUES
  ('e1111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','linha do A');
