-- SPEC-001 R1 - a policy passa a exigir VINCULO, nao apenas tenant.
--
-- FURO MEDIDO EM 26/07/2026, e e o mais grave do projeto ate aqui.
--
-- As treze policies diziam: tenant_id = app.current_tenant_id().
-- Isso confere o TENANT. Nao confere o VINCULO.
--
-- Medido, mesma transacao, role app_financeiro:
--   usuario COM vinculo no tenant A  -> 1 cliente lido   (correto)
--   usuario SEM vinculo, mesmo tenant -> 1 CLIENTE LIDO  (errado)
--
-- A verificacao de vinculo existia so na aplicacao (papelNoTenantCorrente),
-- e NADA obrigava um handler a chama-la. Um handler que fizesse
-- db().cliente.findMany() direto lia dado financeiro de outra empresa com a
-- sessao de qualquer usuario autenticado - bastava o tenantId errado chegar ao
-- middleware. Defesa em uma camada nao e defesa.
--
-- Isto tambem fecha o bootstrap do login (segundo furo): a policy de usuario
-- exigia app.current_usuario_id(), que e justamente o que o login esta tentando
-- descobrir. Circular, e portanto impossivel. app.resolver_login() resolve.

-- ---------------------------------------------------------------- vinculo
/*
 * SECURITY DEFINER pelo mesmo motivo de app.membros_do_tenant(): policy que le
 * usuario_tenant com subquery recorre, e o spike do ADR-0003 mediu isso
 * estourando a pilha (54001). STABLE: avaliado uma vez por query, nao por linha.
 *
 * Tier de plataforma passa. Nao e portao aberto: a constraint trigger da R2
 * aborta a transacao se a passagem nao gerar linha em acesso_plataforma_log.
 * O tier ve; a trilha cobra.
 */
CREATE OR REPLACE FUNCTION app.tem_vinculo_no_tenant() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT app.current_tier() IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.usuario_tenant ut
        WHERE ut.usuario_id = app.current_usuario_id()
          AND ut.tenant_id  = app.current_tenant_id()
          AND ut.ativo
          AND app.current_usuario_id() IS NOT NULL
          AND app.current_tenant_id()  IS NOT NULL
      )
$$;

REVOKE ALL ON FUNCTION app.tem_vinculo_no_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tem_vinculo_no_tenant() TO app_financeiro;

-- ---------------------------------------------------------------- as treze
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'acesso_plataforma_log','conector_crm',
    'cliente','cliente_estado_crm','unidade_consumidora',
    'usina','usina_geracao','dono_usina','originador','contrato',
    'regra_comissao','tarifa'
  ];   -- usuario_tenant ja tem policy propria, da migration 3
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
        WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- bootstrap
/*
 * Resolve o login. Chamada SEM contexto, porque contexto e o que ela produz.
 *
 * Superficie residual, declarada: quem alcanca a role da aplicacao pode
 * enumerar por auth_user_id. Contido por (a) auth_user_id e UUID vindo do
 * Supabase Auth, nao adivinhavel, (b) a role da aplicacao nao e exposta a
 * usuario final - so o processo a tem, e (c) o retorno nao carrega dado de
 * negocio: id, nome, email, tier e a lista de tenants a que a pessoa pertence.
 */
CREATE OR REPLACE FUNCTION app.resolver_login(p_auth_user_id uuid)
  RETURNS TABLE (
    usuario_id uuid, nome text, email text,
    tier text, tenant_id uuid, tenant_razao_social text, papel text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT u.id, u.nome, u.email,
         pa.tier::text,
         ut.tenant_id, t.razao_social, ut.papel::text
  FROM public.usuario u
  LEFT JOIN public.plataforma_admin pa ON pa.usuario_id = u.id
  LEFT JOIN public.usuario_tenant   ut ON ut.usuario_id = u.id AND ut.ativo
  LEFT JOIN public.tenant           t  ON t.id = ut.tenant_id AND t.status = 'ativo'
  WHERE u.auth_user_id = p_auth_user_id
    AND u.ativo
$$;

REVOKE ALL ON FUNCTION app.resolver_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_login(uuid) TO app_financeiro;

COMMENT ON FUNCTION app.resolver_login(uuid) IS
  'Bootstrap do login: unica funcao chamada SEM contexto de tenant. Devolve a '
  'identidade e os tenants a que a pessoa pertence, para o middleware montar o '
  'contexto. Nao devolve dado de negocio.';
