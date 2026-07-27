-- PROVISIONAMENTO do primeiro tenant do FINANCEIRO. Passo 2 da cadeia de F1.
--
-- ATENCAO AO VOCABULARIO, e a regra 6 existe por causa disto: o `tenant` criado
-- aqui e a empresa dentro do FINANCEIRO. Nao tem relacao com o tenant do CRM.
-- Os dois sao uuid, e trocar um pelo outro nao falha em compilacao nem em
-- runtime - devolve zero linhas no melhor caso e dado de outra empresa no pior.
--   tenant.id       -> NOSSO. E o que a RLS filtra em 15 tabelas.
--   crm_tenant_id   -> DELES. So aparece em conector_crm, e so o conector usa.
--
-- POR QUE ISTO E SCRIPT E NAO CAMINHO DE APLICACAO, e a diferenca em relacao ao
-- que o RESUMO-SESSAO-7 previa:
--
-- Aquele resumo dizia "dai em diante o proprio app cria tenant e vinculo, com
-- auditoria". Medido em 27/07: **nao existe esse caminho**, e ele nao e trivial.
-- A policy `tenant_por_tier` exige `app.current_tier() = 'plataforma_admin'` no
-- WITH CHECK, e o unico emissor de contexto com tier e `abrirComoPlataforma()`,
-- que recebe um `tenantId` JA EXISTENTE para atravessar. Criar o PRIMEIRO tenant
-- nao tem tenant onde se apoiar - e o mesmo ovo-e-galinha do primeiro
-- plataforma_admin.
--
-- Nao inventei um caminho novo aqui: inventar contexto para uma linha que ainda
-- nao existe seria abrir uma segunda porta de emissao de contexto, e a SPEC-001
-- §3.2 existe para nao haver uma segunda. Registrado como Q-PROV-01.
--
-- ---------------------------------------------------------------------------
-- USO
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -v modo=ensaio \
--     -v auth_user_id='<o mesmo do bootstrap>' \
--     -v razao_social='G3 Solar' \
--     -v cnpj='00000000000191' \
--     -v crm_tenant_id='d4640f4b-f833-4a80-a4db-ccced1956ae4' \
--     -v credencial_ref='vault://crm/financeiro_ro' \
--     -f scripts/provisionar-tenant.sql
--
-- `modo` obrigatorio, sem default - mesma disciplina do bootstrap.
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

CREATE FUNCTION pg_temp.provisionar(
  p_auth uuid, p_razao text, p_cnpj text, p_crm_tenant uuid, p_credencial text
) RETURNS TABLE (etapa text, resultado text) LANGUAGE plpgsql AS
$fn$
DECLARE
  v_usuario uuid;
  v_tenant  uuid;
  v_tier    text;
  n         int;
BEGIN
  -- GUARDA 1: o usuario tem que existir E ser plataforma_admin. Provisionar
  -- tenant e acao de plataforma; sem o tier, esta linha nasceria orfa de dono.
  SELECT u.id, pa.tier::text INTO v_usuario, v_tier
    FROM public.usuario u
    LEFT JOIN public.plataforma_admin pa ON pa.usuario_id = u.id
   WHERE u.auth_user_id = p_auth AND u.ativo;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'nenhum usuario ativo com auth_user_id %', p_auth
      USING HINT = 'Rode scripts/bootstrap-plataforma-admin.sql primeiro.';
  END IF;
  IF v_tier IS DISTINCT FROM 'plataforma_admin' THEN
    RAISE EXCEPTION 'usuario % nao e plataforma_admin (tier = %)', v_usuario, coalesce(v_tier,'nenhum')
      USING HINT = 'Criar tenant exige tier de plataforma.';
  END IF;

  -- GUARDA 2: CNPJ so digito. O CHECK do banco recusa mascara, e falhar aqui
  -- com mensagem e melhor que falhar la com 23514.
  IF p_cnpj !~ '^[0-9]{14}$' THEN
    RAISE EXCEPTION 'cnpj "%" tem que ser 14 digitos, sem mascara', p_cnpj;
  END IF;

  -- ETAPA 1: o tenant. Idempotente pelo UNIQUE em cnpj.
  INSERT INTO public.tenant (razao_social, cnpj)
  VALUES (btrim(p_razao), p_cnpj)
  ON CONFLICT (cnpj) DO NOTHING;
  SELECT t.id INTO v_tenant FROM public.tenant t WHERE t.cnpj = p_cnpj;
  GET DIAGNOSTICS n = ROW_COUNT;
  etapa := 'tenant'; resultado := v_tenant::text; RETURN NEXT;

  -- ETAPA 2: o vinculo, com papel `admin`. Sem ele o login autentica e nao
  -- alcanca nada: `policy_exige_vinculo` recusa contexto de tenant sem vinculo,
  -- e foi exatamente o erro de fixture da sessao 7.
  INSERT INTO public.usuario_tenant (tenant_id, usuario_id, papel)
  VALUES (v_tenant, v_usuario, 'admin')
  ON CONFLICT (usuario_id, tenant_id) DO NOTHING;
  etapa := 'usuario_tenant'; resultado := 'papel admin para ' || v_usuario::text; RETURN NEXT;

  -- ETAPA 3: o conector. `crm_tenant_id` e o identificador DELES - regra 6.
  INSERT INTO public.conector_crm (tenant_id, tipo, crm_tenant_id, credencial_ref, ativo)
  VALUES (v_tenant, 'intreply', p_crm_tenant, p_credencial, true)
  ON CONFLICT (tenant_id) DO UPDATE
    SET crm_tenant_id = EXCLUDED.crm_tenant_id,
        credencial_ref = EXCLUDED.credencial_ref,
        ativo = true;
  etapa := 'conector_crm'; resultado := 'crm_tenant_id ' || p_crm_tenant::text; RETURN NEXT;
END
$fn$;

SELECT * FROM pg_temp.provisionar(
  :'auth_user_id'::uuid, :'razao_social', :'cnpj',
  :'crm_tenant_id'::uuid, :'credencial_ref');

-- ---------------------------------------------------------------------------
-- VERIFICACAO. O que importa nao e a linha ter entrado - e o LOGIN devolver o
-- vinculo, porque e por ele que o ciclo vai abrir contexto.
SELECT usuario_id, nome, tier, tenant_id, tenant_razao_social, papel
  FROM app.resolver_login(:'auth_user_id'::uuid);

SELECT (SELECT count(*) FROM tenant)         AS tenants,
       (SELECT count(*) FROM usuario_tenant) AS vinculos,
       (SELECT count(*) FROM conector_crm)   AS conectores,
       (SELECT count(*) FROM auditoria)      AS linhas_de_trilha;

SELECT :'modo' = 'valendo' AS commitar \gset
\if :commitar
COMMIT;
\echo '== COMMIT. O tenant do FINANCEIRO existe e o conector esta cadastrado. =='
\else
ROLLBACK;
\echo '== ROLLBACK (modo=ensaio). Nada foi gravado. =='
\endif
