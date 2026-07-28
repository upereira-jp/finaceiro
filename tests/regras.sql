-- SPEC-001 R11, R14, R20-b, R22 e R23 - as regras que o banco garante sozinho.
-- Uso: psql -d <db> -f tests/regras.sql   (depois de todas as migrations)
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  T uuid; usr uuid; cli uuid; us uuid; uc1 uuid; uc2 uuid; org uuid;
  falhas int := 0; n int; v numeric; c integer; sit text;
BEGIN
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Regras','00000000000191') RETURNING id INTO T;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'R','r@x') RETURNING id INTO usr;
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (T, usr, 'admin');
  INSERT INTO cliente (tenant_id, nome) VALUES (T,'C') RETURNING id INTO cli;
  INSERT INTO usina (tenant_id, codigo_geradora, distribuidora) VALUES (T,'G1','Equatorial') RETURNING id INTO us;
  INSERT INTO originador (tenant_id,nome,natureza,tipo,documento,documento_tipo)
    VALUES (T,'O','pf','parceiro_captador','52998224725','cpf') RETURNING id INTO org;
  INSERT INTO tarifa (tenant_id,distribuidora,tarifa_reais_por_kwh,vigencia_inicio,vigencia_fim)
    VALUES (T,'Equatorial',1.130000,'-infinity','2026-07-01');
  INSERT INTO tarifa (tenant_id,distribuidora,tarifa_reais_por_kwh,vigencia_inicio)
    VALUES (T,'Equatorial',1.187650,'2026-07-01');
  -- A quebra do PRD 5.4: captador 30+20, senior 30+30. Desde a migration 17 a
  -- linha e por PARCELA, e a 2a e a que distingue os dois tiers - na 1a ambos
  -- pagam 30, e um teste que nao distingue nao prova nada.
  INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio)
    VALUES (T,'parceiro_captador',30,1,'-infinity'), (T,'parceiro_captador',20,2,'-infinity');
  INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio)
    VALUES (T,'parceiro_captador_senior',30,1,'-infinity'), (T,'parceiro_captador_senior',30,2,'-infinity');

  -- ---------------------------------------------------- R11 abaixo do teto passa
  INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id,percentual_rateio)
    VALUES (T,cli,'UC-1','Equatorial',us,91.2000) RETURNING id INTO uc1;
  RAISE NOTICE 'ok  R11 abaixo do teto passa: 91,20 por cento aceito (duas usinas reais estao assim hoje)';

  -- Trigger DEFERIDO nao dispara em subtransacao de bloco EXCEPTION: ele roda no
  -- COMMIT da transacao externa. Para testar o predicado dentro do bloco, forca
  -- avaliacao imediata. Em producao o comportamento deferido e o desejado - um
  -- rateio inteiro entra em varios INSERTs e so precisa fechar no fim.
  SET CONSTRAINTS exigir_teto_de_rateio IMMEDIATE;

  -- ---------------------------------------------------- R11 tolerancia
  BEGIN
    INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id,percentual_rateio)
      VALUES (T,cli,'UC-tol','Equatorial',us,8.8001);   -- soma 100,0001
    RAISE NOTICE 'ok  R11 tolerancia de 0,0001 aceita: soma 100,0001';
    DELETE FROM unidade_consumidora WHERE numero_uc = 'UC-tol' AND tenant_id = T;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FALHA R11 rejeitou 100,0001, que esta na tolerancia'; falhas := falhas + 1;
  END;

  -- ---------------------------------------------------- R11 acima rejeita
  BEGIN
    INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id,percentual_rateio)
      VALUES (T,cli,'UC-2','Equatorial',us,8.9000);     -- soma 100,10
    RAISE WARNING 'FALHA R11 ACEITOU soma acima de 100'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  R11 acima do teto rejeita: soma 100,10 recusada pelo banco';
  END;

  -- ---------------------------------------------------- R11 a view do alerta
  SELECT situacao INTO sit FROM rateio_por_usina WHERE usina_id = us;
  IF sit = 'com_folga' THEN RAISE NOTICE 'ok  R11 view de alerta classifica: com_folga (8,80 por cento livres), e nao e erro';
  ELSE RAISE WARNING 'FALHA R11 view classificou %', sit; falhas := falhas + 1; END IF;

  -- ---------------------------------------------------- invariante 13 com view real
  SELECT count(*) INTO n FROM app.views_sem_security_invoker();
  IF n = 0 THEN RAISE NOTICE 'ok  inv13 vale com view REAL no schema: rateio_por_usina declara security_invoker';
  ELSE RAISE WARNING 'FALHA inv13: % view(s) sem security_invoker', n; falhas := falhas + 1; END IF;

  -- ---------------------------------------------------- R14 contrato unico ativo
  INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                        originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,valor_referencia_origem,status)
    VALUES (T,cli,uc1,us,org,'parceiro_captador','2026-03-15',139506,'local','ativo');
  BEGIN
    INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                          originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,valor_referencia_origem,status)
      VALUES (T,cli,uc1,us,org,'parceiro_captador','2026-06-15',100000,'local','ativo');
    RAISE WARNING 'FALHA R14 aceitou SEGUNDO contrato ativo na mesma UC'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok  R14 segunda linha ativa na mesma UC recusada por contrato_vigente_unico_por_uc';
  END;
  -- R14-b: vigente inclui SUSPENSO. Ate 26/07 o indice era WHERE status='ativo' e
  -- isto PASSAVA - o banco aceitava um ativo e um suspenso na mesma UC, contra a
  -- propria regra que o comentario da migration de fundacao declarava.
  BEGIN
    INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                          originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,valor_referencia_origem,status)
      VALUES (T,cli,uc1,us,org,'parceiro_captador','2026-06-20',111,'local','suspenso');
    RAISE WARNING 'FALHA R14-b aceitou contrato SUSPENSO numa UC que ja tem vigente'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok  R14-b suspenso tambem ocupa a UC: rateio pausado, vinculo de pe';
  END;
  INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                        originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,valor_referencia_origem,status)
    VALUES (T,cli,uc1,us,org,'parceiro_captador','2026-06-15',100000,'local','encerrado');
  RAISE NOTICE 'ok  R14 contrato ENCERRADO na mesma UC coexiste: encerrado nao ocupa (uc_vigente e NULL)';

  -- ---------------------------------------------------- R23 um arredondamento
  PERFORM set_config('app.tenant_id', T::text, true);
  PERFORM set_config('app.usuario_id', usr::text, true);
  v := app.tarifa_vigente('Equatorial','2026-03-15');
  c := app.consumo_centavos(1234.567, v);
  IF v = 1.130000 AND c = 139506 THEN
    RAISE NOTICE 'ok  R23 competencia de marco: tarifa 1,130000 -> % centavos', c;
  ELSE RAISE WARNING 'FALHA R23 marco: tarifa=% centavos=%', v, c; falhas := falhas + 1; END IF;

  v := app.tarifa_vigente('Equatorial','2026-08-15');
  c := app.consumo_centavos(1234.567, v);
  IF v = 1.187650 AND c = 146623 THEN
    RAISE NOTICE 'ok  R23 competencia de agosto: tarifa reajustada 1,187650 -> % centavos', c;
  ELSE RAISE WARNING 'FALHA R23 agosto: tarifa=% centavos=%', v, c; falhas := falhas + 1; END IF;

  -- ---------------------------------------------------- R22 o custo de errar
  IF app.consumo_centavos(1234.567, round(1.187650*100)/100) - 146623 = 290 THEN
    RAISE NOTICE 'ok  R22 medido de novo: truncar a tarifa em centavos cobra 290 centavos a mais nesta UC, neste mes';
  ELSE RAISE WARNING 'FALHA R22 divergencia mudou: %', app.consumo_centavos(1234.567, round(1.187650*100)/100) - 146623; falhas := falhas + 1; END IF;

  -- ---------------------------------------------------- R20-b tier congelado
  UPDATE originador SET tipo = 'parceiro_captador_senior' WHERE id = org;
  SELECT app.percentual_comissao(k.originador_tipo_no_fechamento, 2::smallint, k.data_fechamento) INTO v
  FROM contrato k WHERE k.status = 'ativo' AND k.originador_id = org;
  IF v = 20 THEN RAISE NOTICE 'ok  R20-b originador promovido a senior (2a parcela 30), contrato de marco segue pagando %', v;
  ELSE RAISE WARNING 'FALHA R20-b contrato de marco passou a pagar %', v; falhas := falhas + 1; END IF;

  SELECT app.percentual_comissao('parceiro_captador_senior', 2::smallint, '2026-08-15') INTO v;
  IF v = 30 THEN RAISE NOTICE 'ok  R20-b contrato NOVO com tier senior paga % na 2a - a promocao vale daqui em diante', v;
  ELSE RAISE WARNING 'FALHA R20-b tier senior paga %', v; falhas := falhas + 1; END IF;

  IF falhas > 0 THEN RAISE EXCEPTION '% falha(s) em regras', falhas;
  ELSE RAISE NOTICE '--- regras: 12 verificacoes, 0 falhas'; END IF;
END $bloco$;
