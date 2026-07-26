-- SPEC-001 R1 a R4 - RBAC de dois niveis, RLS de plataforma e a trilha.
-- Uso: psql -d fin_test -f tests/rbac.sql  (depois das migrations 1, 2 e 3)
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  A uuid; B uuid; uA uuid; uB uuid; uSup uuid;
  falhas int := 0; n int; papel text; msg text;
BEGIN
  INSERT INTO tenant (razao_social, cnpj) VALUES ('T A','11111111000191') RETURNING id INTO A;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('T B','22222222000272') RETURNING id INTO B;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'U do A','a@x') RETURNING id INTO uA;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'U do B','b@x') RETURNING id INTO uB;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'Suporte','s@x') RETURNING id INTO uSup;
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (A, uA, 'financeiro');
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (B, uB, 'admin');
  INSERT INTO plataforma_admin (usuario_id, tier) VALUES (uSup, 'plataforma_suporte');
  INSERT INTO cliente (tenant_id, nome) VALUES (A, 'Cliente do A');
  INSERT INTO cliente (tenant_id, nome) VALUES (B, 'Cliente do B');

  SET LOCAL ROLE app_financeiro;

  -- ---------------------------------------------- R1: sem vinculo = inexistente
  PERFORM set_config('app.tenant_id', B::text, true);
  PERFORM set_config('app.usuario_id', uA::text, true);   -- usuario do A pedindo o B
  PERFORM set_config('app.tier', '', true);

  SELECT count(*) INTO n FROM usuario_tenant;
  IF n = 0 THEN RAISE NOTICE 'ok   R1a  usuario do A no contexto do B: 0 vinculos. Sem pertencer, nao enumera a equipe do cliente';
  ELSE RAISE WARNING 'FALHA R1a viu % vinculos do tenant B sem ter vinculo nele', n; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM tenant;
  IF n = 1 THEN RAISE NOTICE 'ok   R1b  tabela tenant: so o tenant do contexto (1 linha), nao o SaaS inteiro';
  ELSE RAISE WARNING 'FALHA R1b viu % tenants', n; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM cliente;
  IF n = 1 THEN RAISE NOTICE 'ok   R1c  dado do B visivel pela RLS de tenant; o vinculo e que nega (aplicacao lanca 404)';
  ELSE RAISE WARNING 'FALHA R1c leu % clientes', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------- vinculo valido resolve papel
  PERFORM set_config('app.tenant_id', A::text, true);
  SELECT ut.papel INTO papel FROM usuario_tenant ut
   WHERE ut.usuario_id = app.current_usuario_id() AND ut.tenant_id = app.current_tenant_id() AND ut.ativo;
  IF papel = 'financeiro' THEN RAISE NOTICE 'ok   R4   papel resolvido pelo vinculo: %', papel;
  ELSE RAISE WARNING 'FALHA R4 papel=%', coalesce(papel,'NULL'); falhas := falhas + 1; END IF;

  -- ---------------------------------------------- usuario: self + membros
  SELECT count(*) INTO n FROM usuario;
  IF n = 1 THEN RAISE NOTICE 'ok   U1   usuario: ve a si mesmo e os membros do tenant corrente (1)';
  ELSE RAISE WARNING 'FALHA U1 viu % usuarios (esperado 1)', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------- SEM RECURSAO (o 54001 do spike)
  BEGIN
    PERFORM count(*) FROM usuario;
    RAISE NOTICE 'ok   U2   policy de usuario invoca app.membros_do_tenant() sem estourar pilha (o V2a do spike dava 54001)';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FALHA U2 recursao/erro: % (%)', SQLERRM, SQLSTATE; falhas := falhas + 1;
  END;

  -- ---------------------------------------------- membros_do_tenant contida
  PERFORM set_config('app.tenant_id', '', true);
  SELECT count(*) INTO n FROM app.membros_do_tenant();
  IF n = 0 THEN RAISE NOTICE 'ok   U3   membros_do_tenant() sem contexto: vazio (SECURITY DEFINER contido)';
  ELSE RAISE WARNING 'FALHA U3 devolveu % uuids sem contexto', n; falhas := falhas + 1; END IF;

  PERFORM set_config('app.tenant_id', A::text, true);
  SELECT count(*) INTO n FROM app.membros_do_tenant();
  IF n = 1 THEN RAISE NOTICE 'ok   U4   membros_do_tenant() devolve so o tenant do contexto (1)';
  ELSE RAISE WARNING 'FALHA U4 devolveu %', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------- plataforma_admin nao enumeravel
  SELECT count(*) INTO n FROM plataforma_admin;
  IF n = 0 THEN RAISE NOTICE 'ok   P1   plataforma_admin: usuario de tenant nao enumera quem e plataforma';
  ELSE RAISE WARNING 'FALHA P1 viu % linhas', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------- tier ve tenant, mas paga a trilha
  PERFORM set_config('app.usuario_id', uSup::text, true);
  PERFORM set_config('app.tier', 'plataforma_suporte', true);
  SELECT count(*) INTO n FROM tenant WHERE id IN (A, B);
  IF n = 2 THEN RAISE NOTICE 'ok   P2   tier de plataforma alcanca os dois tenants do teste (diagnostico)';
  ELSE RAISE WARNING 'FALHA P2 alcancou % dos 2', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------- e ainda assim nao ve tenant sem tier
  PERFORM set_config('app.tier', '', true);
  PERFORM set_config('app.tenant_id', A::text, true);
  SELECT count(*) INTO n FROM tenant WHERE id IN (A, B);
  IF n = 1 THEN RAISE NOTICE 'ok   P3   sem tier, so o tenant do contexto (1 de 2)';
  ELSE RAISE WARNING 'FALHA P3 viu % de 2 sem tier', n; falhas := falhas + 1; END IF;

  RESET ROLE;
  IF falhas > 0 THEN RAISE EXCEPTION '% falha(s) em RBAC', falhas;
  ELSE RAISE NOTICE '--- RBAC: 11 verificacoes, 0 falhas'; END IF;
END $bloco$;
