-- SPEC-001 R1 a R4 - RBAC de dois niveis e a trilha de acesso.
--
-- ACHADO QUE ESTA MIGRATION CORRIGE:
-- a migration 2 deixou tenant, usuario e plataforma_admin fora da RLS, porque
-- nao tem coluna tenant_id. Mas a R1 exige que ausencia de vinculo seja
-- INDISTINGUIVEL de tenant inexistente - 404, nunca 403, para nao vazar
-- existencia. Com a tabela tenant legivel sem policy, a existencia vazava:
-- qualquer sessao listava a razao social e o CNPJ de todos os clientes do SaaS.
-- As tres entram na RLS aqui, com policy chaveada de outra forma.

-- ---------------------------------------------------------------- contexto
-- Segundo GUC, emitido pelo MESMO middleware e no mesmo set_config.
CREATE OR REPLACE FUNCTION app.current_usuario_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.usuario_id', true), '')::uuid $$;

-- Tier de plataforma da sessao: 'plataforma_admin', 'plataforma_suporte' ou NULL.
CREATE OR REPLACE FUNCTION app.current_tier() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tier', true), '') $$;

/*
 * Membros do tenant corrente.
 *
 * SECURITY DEFINER, e isso e uma decisao com custo - explicito:
 * a alternativa era uma policy em `usuario` com subquery em `usuario_tenant`.
 * O spike do ADR-0003 mediu essa forma na variante V2a e ela ESTOURA A PILHA
 * (54001): policy que le tabela com policy recorre. Esta funcao quebra a
 * recursao porque o corpo dela nao esta sujeito a policy que a invoca.
 *
 * O custo do SECURITY DEFINER e reintroduzir leitura sem policy (objecao da
 * variante V2b). Aqui isso e contido por tres coisas:
 *   1. o corpo REIMPOE o mesmo predicado da policy, explicitamente
 *   2. devolve so uuid - nenhum dado de negocio atravessa
 *   3. sem contexto, current_tenant_id() e NULL e o retorno e vazio
 * Ha teste para as tres na suite de RBAC.
 */
CREATE OR REPLACE FUNCTION app.membros_do_tenant() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT ut.usuario_id
  FROM public.usuario_tenant ut
  WHERE ut.tenant_id = app.current_tenant_id()
    AND ut.ativo
    AND app.current_tenant_id() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION app.membros_do_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_usuario_id(), app.current_tier(),
                          app.membros_do_tenant() TO app_financeiro;

-- ---------------------------------------------------------------- as tres de fora
-- tenant: so o tenant do contexto. Plataforma alcanca pelo tier, e a trilha
-- da R2 cobra o preco dessa passagem.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_do_contexto ON tenant
  USING (id = app.current_tenant_id())
  WITH CHECK (id = app.current_tenant_id());
CREATE POLICY tenant_plataforma ON tenant
  USING (app.current_tier() IN ('plataforma_admin','plataforma_suporte'))
  WITH CHECK (app.current_tier() = 'plataforma_admin');

-- usuario: a propria linha, ou membro do tenant corrente.
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario FORCE ROW LEVEL SECURITY;
CREATE POLICY usuario_self_ou_membro ON usuario
  USING (id = app.current_usuario_id() OR id IN (SELECT app.membros_do_tenant()))
  WITH CHECK (id = app.current_usuario_id());
CREATE POLICY usuario_plataforma ON usuario
  USING (app.current_tier() IN ('plataforma_admin','plataforma_suporte'))
  WITH CHECK (app.current_tier() = 'plataforma_admin');

-- plataforma_admin: quem nao e plataforma nao enumera quem e.
ALTER TABLE plataforma_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE plataforma_admin FORCE ROW LEVEL SECURITY;
CREATE POLICY plataforma_admin_self ON plataforma_admin
  USING (usuario_id = app.current_usuario_id());
CREATE POLICY plataforma_admin_por_tier ON plataforma_admin
  USING (app.current_tier() = 'plataforma_admin')
  WITH CHECK (app.current_tier() = 'plataforma_admin');

-- ---------------------------------------------------------------- vinculo
/*
 * ACHADO NA SUITE DE RBAC, 25/07/2026 - vazamento que a migration 2 deixou.
 *
 * A policy da migration 2 em usuario_tenant era so
 *   tenant_id = app.current_tenant_id()
 * Consequencia medida: qualquer sessao que APONTE o contexto para um tenant
 * enxerga a lista de quem tem acesso aquele tenant - nome do vinculo e papel -
 * mesmo sem ter vinculo nenhum ali. Nao vaza dado financeiro, vaza a folha de
 * quem opera o cliente. E contradiz a R1, que existe para nao vazar existencia.
 *
 * Correcao: so ve a composicao de um tenant quem PERTENCE a ele. Usa a mesma
 * funcao SECURITY DEFINER, que ja quebra a recursao.
 */
DROP POLICY tenant_isolation ON usuario_tenant;
CREATE POLICY usuario_tenant_membro ON usuario_tenant
  USING (
    tenant_id = app.current_tenant_id()
    AND (
      app.current_usuario_id() IN (SELECT app.membros_do_tenant())
      OR app.current_tier() IN ('plataforma_admin','plataforma_suporte')
    )
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    AND app.current_tier() IS DISTINCT FROM 'plataforma_suporte'
  );

-- ---------------------------------------------------------------- R2, no banco
-- A trilha nao pode depender da aplicacao lembrar de gravar. O gatilho abaixo
-- exige que a linha de log exista ANTES do commit da transacao que leu dado de
-- tenant sob tier de plataforma. Se nao existir, a transacao aborta.
--
-- Implementacao: constraint trigger DEFERRABLE INITIALLY DEFERRED em nivel de
-- transacao. Roda no commit, ve o que a transacao fez, e recusa.
CREATE TABLE IF NOT EXISTS app_marcador_leitura_plataforma (
  txid  bigint PRIMARY KEY,
  lida_em timestamptz NOT NULL DEFAULT now()
) ;
COMMENT ON TABLE app_marcador_leitura_plataforma IS
  'Efemera. Marca que a transacao corrente leu dado de tenant sob tier de '
  'plataforma. Conferida no commit pela constraint que implementa a R2.';

CREATE OR REPLACE FUNCTION app.exigir_trilha_de_plataforma() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF app.current_tier() IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.acesso_plataforma_log l
    WHERE l.usuario_id = app.current_usuario_id()
      AND l.tenant_id  = app.current_tenant_id()
      AND l.ocorrido_em >= now() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION
      'R2: leitura de dado de tenant sob tier de plataforma sem trilha em acesso_plataforma_log'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER exigir_trilha_cliente
  AFTER INSERT OR UPDATE OR DELETE ON cliente
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_trilha_de_plataforma();

GRANT SELECT, INSERT ON app_marcador_leitura_plataforma TO app_financeiro;

-- ---------------------------------------------------------------- assert
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname IN ('tenant','usuario','plataforma_admin')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS incompleta nas tabelas de plataforma: %', faltando;
  END IF;
END $$;
