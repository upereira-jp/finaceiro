-- SPEC-001 v2.2 - testes de isolamento das migrations 1 e 2.
-- Roda como superusuario mas TESTA como app_financeiro (SET ROLE), porque
-- o dono da tabela ignora RLS e o teste tem que rodar do lado do cliente.
-- Uso: psql -d fin -f tests/isolamento.sql

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  A uuid; B uuid; usr uuid;
  cli_a uuid; cli_b uuid; du_a uuid; du_b uuid; us_a uuid; us_b uuid;
  uc_a uuid; uc_b uuid; org_a uuid; org_b uuid;
  falhas int := 0; n int; msg text;

BEGIN
  -- ---------------------------------------------------------------- fixture
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Tenant A','00000000000191') RETURNING id INTO A;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Tenant B','00000000000272') RETURNING id INTO B;

  -- Desde a migration 6 a policy exige VINCULO, nao apenas tenant. A fixture
  -- passa a criar usuario e vinculo: sem isso o teste nao ve o proprio dado, e
  -- essa quebra foi a prova de que o aperto funcionou.
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'Teste','t@x') RETURNING id INTO usr;
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (A, usr, 'admin');
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (B, usr, 'admin');

  INSERT INTO cliente (tenant_id, nome) VALUES (A,'Cliente A') RETURNING id INTO cli_a;
  INSERT INTO cliente (tenant_id, nome) VALUES (B,'Cliente B') RETURNING id INTO cli_b;
  INSERT INTO dono_usina (tenant_id,nome,natureza,documento,documento_tipo) VALUES (A,'Dono A','pf','11111111111','cpf') RETURNING id INTO du_a;
  INSERT INTO dono_usina (tenant_id,nome,natureza,documento,documento_tipo) VALUES (B,'Dono B','pf','22222222222','cpf') RETURNING id INTO du_b;
  INSERT INTO usina (tenant_id,codigo_geradora,distribuidora,dono_usina_id) VALUES (A,'GA-1','Equatorial',du_a) RETURNING id INTO us_a;
  INSERT INTO usina (tenant_id,codigo_geradora,distribuidora,dono_usina_id) VALUES (B,'GB-1','Equatorial',du_b) RETURNING id INTO us_b;
  INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id) VALUES (A,cli_a,'UC-A','Equatorial',us_a) RETURNING id INTO uc_a;
  INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id) VALUES (B,cli_b,'UC-B','Equatorial',us_b) RETURNING id INTO uc_b;
  INSERT INTO originador (tenant_id,nome,natureza,tipo,documento,documento_tipo) VALUES (A,'Org A','pf','parceiro_captador','33333333333','cpf') RETURNING id INTO org_a;
  INSERT INTO originador (tenant_id,nome,natureza,tipo,documento,documento_tipo) VALUES (B,'Org B','pf','parceiro_captador','44444444444','cpf') RETURNING id INTO org_b;

  -- ------------------------------------------- 1..9  FK composta cross-tenant
  -- Cada bloco tenta apontar do tenant A para uma linha do tenant B.
  BEGIN INSERT INTO cliente_estado_crm (tenant_id,cliente_id) VALUES (A,cli_b);
        RAISE WARNING 'FALHA FK 1/9 cliente_estado_crm->cliente: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 1/9 cliente_estado_crm -> cliente'; END;

  BEGIN INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora) VALUES (A,cli_b,'X1','Eq');
        RAISE WARNING 'FALHA FK 2/9 uc->cliente: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 2/9 unidade_consumidora -> cliente'; END;

  BEGIN INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id) VALUES (A,cli_a,'X2','Eq',us_b);
        RAISE WARNING 'FALHA FK 3/9 uc->usina: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 3/9 unidade_consumidora -> usina'; END;

  BEGIN INSERT INTO usina (tenant_id,codigo_geradora,distribuidora,dono_usina_id) VALUES (A,'X3','Eq',du_b);
        RAISE WARNING 'FALHA FK 4/9 usina->dono_usina: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 4/9 usina -> dono_usina'; END;

  BEGIN INSERT INTO usina_geracao (tenant_id,usina_id,competencia,geracao_kwh,origem) VALUES (A,us_b,'2026-07-01',100,'local');
        RAISE WARNING 'FALHA FK 5/9 usina_geracao->usina: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 5/9 usina_geracao -> usina'; END;

  BEGIN INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,data_fechamento,valor_referencia_centavos,valor_referencia_origem)
        VALUES (A,cli_b,uc_a,us_a,'2026-07-01',10000,'local');
        RAISE WARNING 'FALHA FK 6/9 contrato->cliente: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 6/9 contrato -> cliente'; END;

  BEGIN INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,data_fechamento,valor_referencia_centavos,valor_referencia_origem)
        VALUES (A,cli_a,uc_b,us_a,'2026-07-01',10000,'local');
        RAISE WARNING 'FALHA FK 7/9 contrato->uc: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 7/9 contrato -> unidade_consumidora'; END;

  BEGIN INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,data_fechamento,valor_referencia_centavos,valor_referencia_origem)
        VALUES (A,cli_a,uc_a,us_b,'2026-07-01',10000,'local');
        RAISE WARNING 'FALHA FK 8/9 contrato->usina: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 8/9 contrato -> usina'; END;

  BEGIN INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,valor_referencia_origem)
        VALUES (A,cli_a,uc_a,us_a,org_b,'parceiro_captador','2026-07-01',10000,'local');
        RAISE WARNING 'FALHA FK 9/9 contrato->originador: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  FK 9/9 contrato -> originador'; END;

  -- ------------------------------------------- 10  vigencia sobreposta
  -- `parcela` entrou na migration 17 (PRD 5.4). O EXCLUDE agora inclui a
  -- parcela, entao o par sobreposto tem de ser da MESMA parcela para o teste
  -- continuar medindo o que media: sobreposicao de vigencia, nao de dimensao.
  INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio) VALUES (A,'parceiro_captador',30,1,'2026-01-01');
  BEGIN INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio) VALUES (A,'parceiro_captador',20,1,'2026-06-01');
        RAISE WARNING 'FALHA vigencia sobreposta em regra_comissao: ACEITOU'; falhas:=falhas+1;
  EXCEPTION WHEN exclusion_violation THEN RAISE NOTICE 'ok  regra_comissao recusa vigencia sobreposta'; END;

  INSERT INTO tarifa (tenant_id,distribuidora,tarifa_reais_por_kwh,vigencia_inicio,vigencia_fim) VALUES (A,'Equatorial',1.130000,'2026-01-01','2026-07-01');
  INSERT INTO tarifa (tenant_id,distribuidora,tarifa_reais_por_kwh,vigencia_inicio) VALUES (A,'Equatorial',1.187650,'2026-07-01');
  RAISE NOTICE 'ok  tarifa aceita vigencias adjacentes com [)';

  -- ------------------------------------------- 11  R22: tarifa nao e inteira
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='tarifa' AND column_name='tarifa_reais_por_kwh' AND data_type='numeric' AND numeric_scale=6;
  IF n=1 THEN RAISE NOTICE 'ok  tarifa e numeric(_,6), nao inteiro (R22)';
  ELSE RAISE WARNING 'FALHA R22: tarifa nao e numeric com 6 decimais'; falhas:=falhas+1; END IF;

  -- ------------------------------------------- 12  RLS sob a role da aplicacao
  SET LOCAL ROLE app_financeiro;

  SELECT count(*) INTO n FROM cliente;
  IF n=0 THEN RAISE NOTICE 'ok  sem contexto, a role da aplicacao le ZERO';
  ELSE RAISE WARNING 'FALHA: sem contexto leu % linhas', n; falhas:=falhas+1; END IF;

  PERFORM set_config('app.tenant_id', A::text, true);   -- true = LOCAL
  PERFORM set_config('app.usuario_id', usr::text, true);
  SELECT count(*) INTO n FROM cliente;
  IF n=1 THEN RAISE NOTICE 'ok  com contexto do A e vinculo, le somente o A';
  ELSE RAISE WARNING 'FALHA: com contexto do A leu % linhas (esperado 1)', n; falhas:=falhas+1; END IF;

  BEGIN INSERT INTO cliente (tenant_id,nome) VALUES (B,'invasor');
        RAISE WARNING 'FALHA WITH CHECK: aceitou insert com tenant_id alheio'; falhas:=falhas+1;
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  WITH CHECK recusa tenant_id alheio (42501)'; END;

  RESET ROLE;

  -- ------------------------------------------- 13  invariante 3 pelo catalogo
  SELECT string_agg(c.relname, ', ') INTO msg
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid=c.relnamespace AND ns.nspname='public'
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND a.attnum>0
  WHERE c.relkind='r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
        OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid));
  IF msg IS NULL THEN RAISE NOTICE 'ok  invariante 3: RLS+FORCE+policy em todas as tabelas com tenant_id';
  ELSE RAISE WARNING 'FALHA invariante 3 em: %', msg; falhas:=falhas+1; END IF;

  -- ------------------------------------------- 17  R20-b tier congelado
  -- Contrato fechado com o captador. Depois o originador e promovido a senior.
  -- A comissao do contrato antigo NAO pode mudar.
  INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                        originador_tipo_no_fechamento,data_fechamento,
                        valor_referencia_centavos,valor_referencia_origem)
  VALUES (A,cli_a,uc_a,us_a,org_a,'parceiro_captador','2026-03-15',100000,'local');
  UPDATE originador SET tipo = 'parceiro_captador_senior' WHERE id = org_a;
  SELECT count(*) INTO n FROM contrato c
   WHERE c.originador_id = org_a AND c.originador_tipo_no_fechamento = 'parceiro_captador';
  IF n = 1 THEN RAISE NOTICE 'ok  R20-b: originador promovido a senior, contrato de marco segue com o tier do fechamento';
  ELSE RAISE WARNING 'FALHA R20-b: o tier do contrato acompanhou a promocao'; falhas := falhas + 1; END IF;

  BEGIN
    INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                          data_fechamento,valor_referencia_centavos,valor_referencia_origem)
    VALUES (A,cli_a,uc_a,us_a,org_a,'2026-04-15',100000,'local');
    RAISE WARNING 'FALHA: aceitou contrato com originador e SEM tier congelado'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  R20-b: contrato com originador e sem tier congelado e recusado pelo banco'; END;

  -- ------------------------------------------- 18  invariante 13
  SELECT string_agg(v, ', ') INTO msg FROM app.views_sem_security_invoker() AS v;
  IF msg IS NULL THEN RAISE NOTICE 'ok  invariante 13: nenhuma view sem security_invoker (view sem isso ignora a RLS das bases)';
  ELSE RAISE WARNING 'FALHA invariante 13, views que furam a RLS: %', msg; falhas := falhas + 1; END IF;

  -- ------------------------------------------- 19  e o furo, provado
  CREATE VIEW _prova_furo AS SELECT id, tenant_id FROM cliente;
  SET LOCAL ROLE app_financeiro;
  SELECT count(*) INTO n FROM _prova_furo;      -- sem contexto
  RESET ROLE;
  DROP VIEW _prova_furo;
  IF n > 0 THEN RAISE NOTICE 'ok  furo confirmado: view sem invoker leu % linha(s) sem contexto - e por isso a 13 existe', n;
  ELSE RAISE WARNING 'ATENCAO: o furo nao reproduziu; revisar a invariante 13'; falhas := falhas + 1; END IF;

  -- ------------------------------------------- veredito
  IF falhas > 0 THEN RAISE EXCEPTION '% teste(s) falharam', falhas;
  ELSE RAISE NOTICE '--- 20 verificacoes, 0 falhas'; END IF;
END $bloco$;
