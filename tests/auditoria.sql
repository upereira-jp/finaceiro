-- SPEC-001 R2, R9, R21 e Q-SPEC001-04 - auditoria, repasse versionado e os
-- quatro furos medidos em 26/07/2026.
--
-- Uso: psql -d fin_auditoria -f tests/auditoria.sql  (depois das dez migrations)
--
-- Todo teste aqui e PAR: um caso que falha se o furo reabrir, e um que falha se
-- o aperto virar nega-tudo. Aperto que quebra o caminho legitimo nao e correcao,
-- e outro defeito - foi o que a migration 6 quase produziu.
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  A uuid; B uuid; uA uuid; uSup uuid; uAdm uuid; usinaA uuid; donoB uuid; utA uuid;
  falhas int := 0; n int; x numeric; txt text;
BEGIN
  -- ============================================================== fixture
  INSERT INTO tenant (razao_social, cnpj) VALUES ('T A','11111111000191') RETURNING id INTO A;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('T B','22222222000272') RETURNING id INTO B;

  INSERT INTO usuario (auth_user_id, nome, email)
    VALUES (gen_random_uuid(),'U do A','a@x') RETURNING id INTO uA;
  INSERT INTO usuario (auth_user_id, nome, email)
    VALUES (gen_random_uuid(),'Suporte','s@x') RETURNING id INTO uSup;
  INSERT INTO usuario (auth_user_id, nome, email)
    VALUES (gen_random_uuid(),'Admin plataforma','p@x') RETURNING id INTO uAdm;

  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (A, uA, 'admin');
  INSERT INTO plataforma_admin (usuario_id, tier) VALUES (uSup, 'plataforma_suporte');
  INSERT INTO plataforma_admin (usuario_id, tier) VALUES (uAdm, 'plataforma_admin');

  INSERT INTO cliente (tenant_id, nome) VALUES (A, 'Cliente do A');
  INSERT INTO cliente (tenant_id, nome) VALUES (B, 'Cliente do B');

  INSERT INTO dono_usina (tenant_id, nome, natureza, documento, documento_tipo,
                          chave_pix, tipo_chave_pix)
    VALUES (B,'Dono do B','pf','52998224725','cpf','dono-real@b','email')
    RETURNING id INTO donoB;

  INSERT INTO usina (tenant_id, codigo_geradora, distribuidora)
    VALUES (A,'USINA-001','Equatorial') RETURNING id INTO usinaA;

  INSERT INTO tarifa (tenant_id, distribuidora, tarifa_reais_por_kwh, vigencia_inicio)
    VALUES (A,'Equatorial',1.130000,'-infinity');
  -- Segunda concessionaria cadastrada e SEM tarifa: e o caso real da ausencia -
  -- distribuidora nova entra no cadastro antes de alguem lancar a tarifa dela.
  INSERT INTO distribuidora (nome) VALUES ('CELG') ON CONFLICT DO NOTHING;
  -- 25 + 25, e nao 50: desde a migration 17 a linha e por PARCELA (PRD 5.4).
  INSERT INTO regra_comissao (tenant_id, originador_tipo, percentual, parcela, vigencia_inicio)
    VALUES (A,'vendedor_g3',25.00,1,'-infinity'), (A,'vendedor_g3',25.00,2,'-infinity');

  -- Duas vigencias de repasse na MESMA usina: e o que prova versionamento em vez
  -- de valor corrente. 70% ate 01/06, 65% depois.
  INSERT INTO regra_repasse (tenant_id, usina_id, percentual, vigencia_inicio, vigencia_fim)
    VALUES (A, usinaA, 70.00, '-infinity', '2026-06-01');
  INSERT INTO regra_repasse (tenant_id, usina_id, percentual, vigencia_inicio)
    VALUES (A, usinaA, 65.00, '2026-06-01');

  SET LOCAL ROLE app_financeiro;

  -- ============================================================== A. autopromocao
  PERFORM set_config('app.tenant_id',  A::text, true);
  PERFORM set_config('app.usuario_id', uA::text, true);
  PERFORM set_config('app.tier',       '', true);

  -- A1 FURO: policy FOR ALL sem WITH CHECK usava o USING como check de escrita.
  -- Medido em 26/07: papel 'leitura' inseria a propria linha com tier
  -- 'plataforma_admin' e passava a ler todos os tenants.
  BEGIN
    INSERT INTO plataforma_admin (usuario_id, tier)
      VALUES (app.current_usuario_id(), 'plataforma_admin');
    RAISE WARNING 'FALHA A1 usuario de tenant se promoveu a plataforma_admin';
    falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   A1   autopromocao negada: sem GRANT de escrita em plataforma_admin';
  WHEN OTHERS THEN
    RAISE NOTICE 'ok   A1   autopromocao negada (%)', SQLSTATE;
  END;

  -- A2 preserva o P1 da suite de RBAC: quem nao e plataforma nao enumera quem e.
  SELECT count(*) INTO n FROM plataforma_admin;
  IF n = 0 THEN RAISE NOTICE 'ok   A2   usuario de tenant nao enumera plataforma_admin';
  ELSE RAISE WARNING 'FALHA A2 viu % linha(s) de plataforma_admin', n; falhas := falhas + 1; END IF;

  -- A3 NEGA-TUDO: a policy virou FOR SELECT. Quem E plataforma tem que continuar
  -- lendo a propria linha, ou o login de plataforma quebra.
  PERFORM set_config('app.usuario_id', uSup::text, true);
  PERFORM set_config('app.tier',       'plataforma_suporte', true);
  SELECT count(*) INTO n FROM plataforma_admin WHERE usuario_id = uSup;
  IF n = 1 THEN RAISE NOTICE 'ok   A3   plataforma continua lendo a propria linha (aperto nao virou nega-tudo)';
  ELSE RAISE WARNING 'FALHA A3 plataforma nao le a propria linha: % linha(s)', n; falhas := falhas + 1; END IF;

  -- ============================================================== B. R2
  -- Os gatilhos sao DEFERRABLE: SET CONSTRAINTS ALL IMMEDIATE traz a conferencia
  -- para dentro do bloco, onde da para captura-la. Sem isso ela so aparece no
  -- COMMIT e o teste nao sabe se passou.
  SET CONSTRAINTS ALL IMMEDIATE;

  PERFORM set_config('app.tenant_id',  B::text, true);
  PERFORM set_config('app.usuario_id', uSup::text, true);
  PERFORM set_config('app.tier',       'plataforma_suporte', true);

  -- B1 FURO: o gatilho da migration 7 comecava com
  --   IF app.current_tier() IS NULL THEN RETURN NULL
  -- e e deferido - lia o GUC no COMMIT. Medido: escreveu, apagou app.tier antes
  -- do commit, commitou com zero linhas de trilha.
  BEGIN
    UPDATE cliente SET nome = 'trocado pela plataforma' WHERE tenant_id = B;
    PERFORM set_config('app.tier', '', true);   -- a burla
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE WARNING 'FALHA B1 apagar app.tier antes do commit dispensou a trilha';
    falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   B1   burla do GUC abortada: o tier vem da linha de auditoria, gravada NA ESCRITA';
  END;

  -- B2 FURO NOVO: dono_usina guarda a chave PIX e NAO tinha gatilho nenhum.
  -- Medido em 26/07: troquei o PIX do dono da usina de outro tenant sob tier,
  -- sem exigencia de trilha e sem registro.
  PERFORM set_config('app.tier', 'plataforma_suporte', true);
  BEGIN
    UPDATE dono_usina SET chave_pix = 'pix-do-atacante@x' WHERE tenant_id = B;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE WARNING 'FALHA B2 escrita em dono_usina sob tier sem trilha passou';
    falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   B2   dono_usina agora cobra trilha (chave PIX e para onde o dinheiro sai)';
  END;

  -- B3 NEGA-TUDO: o caminho legitimo tem que passar. Trilha antes, escrita depois.
  INSERT INTO acesso_plataforma_log (tenant_id, usuario_id, acao, recurso)
    VALUES (B, uSup, 'correcao', 'dono_usina');
  UPDATE dono_usina SET chave_pix = 'pix-corrigido@b' WHERE tenant_id = B;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'ok   B3   plataforma COM trilha escreve normalmente (aperto nao virou nega-tudo)';

  -- ============================================================== C. auditoria
  -- C1 a regra 9 exige ANTES E DEPOIS. Antes desta migration nao havia tabela.
  SELECT antes->>'chave_pix' || ' -> ' || (depois->>'chave_pix') INTO txt
  FROM auditoria WHERE tabela = 'dono_usina' AND operacao = 'U'
  ORDER BY id DESC LIMIT 1;
  IF txt = 'dono-real@b -> pix-corrigido@b' THEN
    RAISE NOTICE 'ok   C1   antes e depois gravados: %', txt;
  ELSE RAISE WARNING 'FALHA C1 imagem de linha ausente ou errada: %', coalesce(txt,'NULL');
    falhas := falhas + 1; END IF;

  -- C2 o tier tem que estar na linha, capturado na escrita: e o que torna a
  -- conferencia da R2 nao-burlavel.
  SELECT tier INTO txt FROM auditoria
  WHERE tabela = 'dono_usina' AND operacao = 'U' ORDER BY id DESC LIMIT 1;
  IF txt = 'plataforma_suporte' THEN RAISE NOTICE 'ok   C2   tier gravado na linha de auditoria';
  ELSE RAISE WARNING 'FALHA C2 tier na auditoria: %', coalesce(txt,'NULL'); falhas := falhas + 1; END IF;

  -- C3 NEGA-TUDO: escrita de usuario COMUM e auditada e NAO exige trilha.
  -- Cobrar trilha de quem tem vinculo pararia a operacao.
  PERFORM set_config('app.tenant_id',  A::text, true);
  PERFORM set_config('app.usuario_id', uA::text, true);
  PERFORM set_config('app.tier',       '', true);
  UPDATE cliente SET nome = 'renomeado pelo admin do tenant' WHERE tenant_id = A;
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*) INTO n FROM auditoria
  WHERE tenant_id = A AND tabela = 'cliente' AND operacao = 'U' AND tier IS NULL;
  IF n = 1 THEN RAISE NOTICE 'ok   C3   escrita de tenant: auditada, tier NULL, sem exigir trilha';
  ELSE RAISE WARNING 'FALHA C3 esperava 1 linha de auditoria, achou %', n; falhas := falhas + 1; END IF;

  -- C4 NEGA-TUDO: entidade de PLATAFORMA tem tenant_id NULL na auditoria e nao
  -- exige trilha - a R2 fala de acesso a dado de TENANT. Sem esta distincao,
  -- provisionar usuario ficaria impossivel.
  PERFORM set_config('app.usuario_id', uAdm::text, true);
  PERFORM set_config('app.tier',       'plataforma_admin', true);
  UPDATE usuario SET nome = 'U do A (corrigido)' WHERE id = uA;
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*) INTO n FROM auditoria
  WHERE tabela = 'usuario' AND operacao = 'U' AND tenant_id IS NULL;
  IF n = 1 THEN RAISE NOTICE 'ok   C4   escrita em entidade de plataforma: auditada com tenant NULL, sem trilha';
  ELSE RAISE WARNING 'FALHA C4 esperava 1, achou %', n; falhas := falhas + 1; END IF;

  SET CONSTRAINTS ALL DEFERRED;

  -- ============================================================== D. append-only
  -- FURO: a migration 2 concedeu UPDATE e DELETE em ALL TABLES, e o
  -- ALTER DEFAULT PRIVILEGES estende isso a toda tabela futura. Medido: DELETE
  -- nas proprias linhas de acesso_plataforma_log passou. Log apagavel pelo
  -- auditado nao e log.
  BEGIN
    DELETE FROM auditoria;
    RAISE WARNING 'FALHA D1 auditoria apagavel pela aplicacao'; falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   D1   DELETE em auditoria negado por GRANT';
  END;

  BEGIN
    UPDATE auditoria SET tier = NULL;
    RAISE WARNING 'FALHA D2 auditoria editavel pela aplicacao'; falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   D2   UPDATE em auditoria negado por GRANT';
  END;

  BEGIN
    DELETE FROM acesso_plataforma_log;
    RAISE WARNING 'FALHA D3 trilha apagavel por quem foi auditado'; falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   D3   DELETE em acesso_plataforma_log negado por GRANT';
  END;

  -- D4 NEGA-TUDO: append-only nao pode virar ilegivel. Quem pertence ao tenant
  -- le a propria auditoria - e o que faz dela util para conferencia.
  PERFORM set_config('app.usuario_id', uA::text, true);
  PERFORM set_config('app.tier',       '', true);
  SELECT count(*) INTO n FROM auditoria WHERE tenant_id = A;
  IF n > 0 THEN RAISE NOTICE 'ok   D4   tenant le a propria auditoria: % linha(s)', n;
  ELSE RAISE WARNING 'FALHA D4 auditoria ilegivel para quem pertence ao tenant'; falhas := falhas + 1; END IF;

  -- D5 e isolada como o resto: a auditoria de OUTRO tenant nao aparece.
  SELECT count(*) INTO n FROM auditoria WHERE tenant_id = B;
  IF n = 0 THEN RAISE NOTICE 'ok   D5   auditoria de outro tenant invisivel (RLS vale para ela tambem)';
  ELSE RAISE WARNING 'FALHA D5 vazou % linha(s) de auditoria do tenant B', n; falhas := falhas + 1; END IF;

  -- ============================================================== E. preco que falha alto
  -- FURO: tarifa_vigente devolvia NULL na ausencia, e consumo_centavos(x, NULL)
  -- devolve NULL. Base de faturamento NULL soma como nada e coalesce como zero -
  -- o modo de falha silenciosa que este projeto persegue na RLS, dentro da
  -- funcao que calcula dinheiro.
  BEGIN
    SELECT app.tarifa_vigente('CELG', date '2026-07-01') INTO x;
    RAISE WARNING 'FALHA E1 distribuidora sem tarifa devolveu % em vez de levantar', coalesce(x::text,'NULL');
    falhas := falhas + 1;
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'ok   E1   distribuidora sem tarifa levanta no_data_found, nao devolve NULL';
  END;

  -- E2 NEGA-TUDO: com tarifa vigente, devolve o valor.
  SELECT app.tarifa_vigente('Equatorial', date '2026-07-01') INTO x;
  IF x = 1.130000 THEN RAISE NOTICE 'ok   E2   tarifa vigente devolve 1,130000 R$/kWh';
  ELSE RAISE WARNING 'FALHA E2 tarifa vigente devolveu %', coalesce(x::text,'NULL'); falhas := falhas + 1; END IF;

  BEGIN
    SELECT app.percentual_comissao('parceiro_captador_senior', 1::smallint, date '2026-03-01') INTO x;
    RAISE WARNING 'FALHA E3 comissao sem regra devolveu %', coalesce(x::text,'NULL');
    falhas := falhas + 1;
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'ok   E3   comissao sem regra vigente levanta, nao devolve NULL';
  END;

  SELECT app.percentual_comissao('vendedor_g3', 1::smallint, date '2026-03-01') INTO x;
  IF x = 25.00 THEN RAISE NOTICE 'ok   E4   comissao com regra vigente devolve 25,00 na 1a parcela';
  ELSE RAISE WARNING 'FALHA E4 devolveu %', coalesce(x::text,'NULL'); falhas := falhas + 1; END IF;

  -- ============================================================== F. repasse versionado
  -- Q-SPEC001-04: percentual_repasse era coluna mutavel na usina. Renegociar
  -- 70 para 65 hoje reprecificava todo repasse ja pago - o furo da R20 com outro
  -- nome, e a R20-b nao cobria porque congelou o tier do originador, nao isto.
  SELECT app.percentual_repasse(usinaA, date '2026-03-01') INTO x;
  IF x = 70.00 THEN RAISE NOTICE 'ok   F1   competencia de marco devolve 70,00 - a vigencia da epoca';
  ELSE RAISE WARNING 'FALHA F1 marco devolveu % (esperado 70,00)', coalesce(x::text,'NULL'); falhas := falhas + 1; END IF;

  SELECT app.percentual_repasse(usinaA, date '2026-07-01') INTO x;
  IF x = 65.00 THEN RAISE NOTICE 'ok   F2   competencia de julho devolve 65,00 - renegociacao nao reprecifica o passado';
  ELSE RAISE WARNING 'FALHA F2 julho devolveu % (esperado 65,00)', coalesce(x::text,'NULL'); falhas := falhas + 1; END IF;

  BEGIN
    SELECT app.percentual_repasse(gen_random_uuid(), date '2026-07-01') INTO x;
    RAISE WARNING 'FALHA F3 usina sem regra devolveu %', coalesce(x::text,'NULL');
    falhas := falhas + 1;
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'ok   F3   usina sem regra de repasse levanta, nao devolve NULL';
  END;

  RESET ROLE;

  -- F4 vigencia sobreposta e recusada pelo BANCO, nao pela aplicacao (R21).
  BEGIN
    INSERT INTO regra_repasse (tenant_id, usina_id, percentual, vigencia_inicio)
      VALUES (A, usinaA, 80.00, '2026-03-01');
    RAISE WARNING 'FALHA F4 vigencia sobreposta aceita: aliquota passa a depender do planejador';
    falhas := falhas + 1;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'ok   F4   vigencia sobreposta recusada pelo EXCLUDE (23P01)';
  END;

  -- F5 a coluna morreu. Duas verdades e o defeito, nao a redundancia.
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema='public' AND table_name='usina' AND column_name='percentual_repasse';
  IF n = 0 THEN RAISE NOTICE 'ok   F5   usina.percentual_repasse nao existe mais';
  ELSE RAISE WARNING 'FALHA F5 a coluna voltou: duas verdades outra vez'; falhas := falhas + 1; END IF;

  -- ============================================================== G. invariantes 16 a 19
  -- Verificadas por CONSULTA AO CATALOGO, jamais por inspecao visual (regra 3).

  -- 16: a CLASSE do furo A1, nao o caso. Qualquer policy FOR ALL sem WITH CHECK
  -- em tabela gravavel repete o mesmo erro em outra tabela.
  SELECT string_agg(format('%s.%s', c.relname, p.polname), ', ') INTO txt
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE p.polcmd = '*' AND p.polwithcheck IS NULL
    AND has_table_privilege('app_financeiro', c.oid, 'INSERT');
  IF txt IS NULL THEN RAISE NOTICE 'ok   G1   inv.16 nenhuma policy FOR ALL sem WITH CHECK em tabela gravavel';
  ELSE RAISE WARNING 'FALHA G1 inv.16: %', txt; falhas := falhas + 1; END IF;

  -- 17: cobertura de auditoria. Antes desta migration eram 4 de 13, e as 4
  -- escolhidas nao incluiam dono_usina nem originador - onde estao as chaves PIX.
  SELECT string_agg(c.relname, ', ') INTO txt
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relkind = 'r'
    AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                   AND a.attname = 'tenant_id' AND a.attnum > 0)
         OR c.relname IN ('tenant','usuario','plataforma_admin'))
    AND c.relname NOT IN ('auditoria','acesso_plataforma_log')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = c.oid AND t.tgname LIKE 'auditar_%');
  IF txt IS NULL THEN RAISE NOTICE 'ok   G2   inv.17 toda tabela de negocio ou de papel tem gatilho de auditoria';
  ELSE RAISE WARNING 'FALHA G2 inv.17 sem gatilho: %', txt; falhas := falhas + 1; END IF;

  /*
   * 17-b: o gatilho chamado `auditar_*` EXECUTA `app.auditar()`.
   *
   * Acrescentado em 30/07, e o motivo e um caso concreto: `logo_de_cobranca`
   * guarda um bytea, e `to_jsonb` de bytea ocupa 2,00x (medido) - auditar a linha
   * inteira poria 1,2 MB na trilha por troca de uma logo de 300 KB. Ela audita
   * por PROPAGACAO: o gatilho carimba o sha256 na tabela de identidade, que e
   * auditada, e a trilha registra antes/depois do hash.
   *
   * O invariante 17 sozinho aceitaria isso - e aceitaria tambem um gatilho
   * chamado `auditar_qualquer_coisa` que nao auditasse NADA. Este fecha o furo: a
   * excecao tem de estar nomeada aqui, com o mecanismo. A lista branca e de UMA
   * linha de proposito; a segunda entrada deve doer.
   */
  SELECT string_agg(format('%s.%s -> %s', c.relname, t.tgname, p.proname), ', ') INTO txt
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgname LIKE 'auditar_%' AND NOT t.tgisinternal
    AND p.proname <> 'auditar'
    AND c.relname NOT IN ('logo_de_cobranca');
  IF txt IS NULL THEN RAISE NOTICE 'ok   G2b  inv.17-b gatilho auditar_* executa app.auditar(), fora da lista branca nomeada';
  ELSE RAISE WARNING 'FALHA G2b inv.17-b gatilho que nao audita: %', txt; falhas := falhas + 1; END IF;

  -- 17-c: e a propagacao da logo funciona - o hash chega na tabela auditada, e
  -- ele e o do CONTEUDO. Sem isto o 17-b seria uma lista branca sem prova.
  BEGIN
    PERFORM set_config('app.tenant_id', A::text, true);
    INSERT INTO identidade_de_cobranca (tenant_id) VALUES (A) RETURNING id INTO utA;
    INSERT INTO logo_de_cobranca (tenant_id, identidade_id, conteudo)
      VALUES (A, utA, decode('89504e470d0a1a0a', 'hex'));
    SELECT logo_sha256 || ' ' || logo_mime INTO txt FROM identidade_de_cobranca WHERE tenant_id = A;
    IF txt = encode(sha256(decode('89504e470d0a1a0a', 'hex')), 'hex') || ' image/png' THEN
      RAISE NOTICE 'ok   G2c  a logo audita por propagacao: sha256 do CONTEUDO e mime pela ASSINATURA';
    ELSE
      RAISE WARNING 'FALHA G2c propagacao da logo: veio %', coalesce(txt, '(nulo)');
      falhas := falhas + 1;
    END IF;
    DELETE FROM logo_de_cobranca WHERE tenant_id = A;
    SELECT coalesce(logo_sha256, '(limpo)') INTO txt FROM identidade_de_cobranca WHERE tenant_id = A;
    IF txt = '(limpo)' THEN
      RAISE NOTICE 'ok   G2d  e apagar a logo LIMPA o metadado - o hash de uma imagem que nao existe mais mentiria';
    ELSE RAISE WARNING 'FALHA G2d metadado sobreviveu ao DELETE: %', txt; falhas := falhas + 1; END IF;
  END;

  -- 17-e O SENTIDO QUE IMPORTA: SVG rotulado como imagem NAO entra. O mime e
  -- reconhecido pela assinatura justamente porque a logo e embutida no HTML do
  -- documento, e SVG executa script. Sem este par, o G2c passaria com a
  -- verificacao de tipo removida.
  BEGIN
    INSERT INTO logo_de_cobranca (tenant_id, identidade_id, conteudo)
      VALUES (A, utA, convert_to('<svg onload="alert(1)"></svg>', 'UTF8'));
    RAISE WARNING 'FALHA G2e um SVG entrou como logo';
    falhas := falhas + 1;
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'ok   G2e  SVG (e qualquer coisa que nao seja PNG/JPEG) e RECUSADO pela assinatura, nao pelo rotulo';
  END;
  DELETE FROM identidade_de_cobranca WHERE tenant_id = A;

  -- 18: append-only por PRIVILEGIO, nao por convencao. E a checagem que pega o
  -- ALTER DEFAULT PRIVILEGES da migration 2 reconcedendo DML numa tabela nova.
  IF has_table_privilege('app_financeiro','auditoria','UPDATE')
     OR has_table_privilege('app_financeiro','auditoria','DELETE')
     OR has_table_privilege('app_financeiro','acesso_plataforma_log','UPDATE')
     OR has_table_privilege('app_financeiro','acesso_plataforma_log','DELETE') THEN
    RAISE WARNING 'FALHA G3 inv.18 log gravavel pela aplicacao'; falhas := falhas + 1;
  ELSE RAISE NOTICE 'ok   G3   inv.18 auditoria e trilha sao append-only para a aplicacao'; END IF;

  -- 19: cada SECURITY DEFINER e leitura sem policy. A lista e fechada de
  -- proposito: a garantia de leitura da R2 depende de nao existir um segundo
  -- caminho, e disciplina nao e invariante.
  SELECT string_agg(p.proname, ', ') INTO txt
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname IN ('app','public') AND p.prosecdef
    AND p.proname NOT IN ('membros_do_tenant','tem_vinculo_no_tenant',
                          'resolver_login','auditar','exigir_trilha_de_plataforma');
  IF txt IS NULL THEN RAISE NOTICE 'ok   G4   inv.19 nenhum SECURITY DEFINER fora da lista branca';
  ELSE RAISE WARNING 'FALHA G4 inv.19 fora da lista: %', txt; falhas := falhas + 1; END IF;

  -- 3 e 13 outra vez, agora com as quinze tabelas com tenant_id.
  SELECT string_agg(c.relname, ', ') INTO txt
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0
  WHERE c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF txt IS NULL THEN RAISE NOTICE 'ok   G5   inv.3 RLS ENABLE + FORCE + policy em toda tabela com tenant_id';
  ELSE RAISE WARNING 'FALHA G5 inv.3 RLS incompleta: %', txt; falhas := falhas + 1; END IF;

  -- ======================================== Q-AUDIT-01, migration 13
  -- Conceder tier e a escrita mais privilegiada do sistema, e a regra 9 nomeia
  -- papel. A trilha tem que dizer A QUEM, na coluna INDEXADA - auditoria_registro_idx
  -- e (tabela, registro_id). Antes da migration 13 esta linha saia com
  -- registro_id NULL: plataforma_admin e a unica das dezesseis tabelas auditadas
  -- sem `id` e sem `cliente_id`, e o coalesce de app.auditar() nao alcancava a
  -- PK dela, que e usuario_id. Achado num ensaio de bootstrap, nao por teste.
  SELECT count(*) INTO n FROM auditoria
   WHERE tabela = 'plataforma_admin' AND operacao = 'I' AND registro_id = uAdm::text;
  IF n = 1 THEN RAISE NOTICE 'ok   G6   Q-AUDIT-01 a concessao de tier identifica o usuario em registro_id';
  ELSE RAISE WARNING 'FALHA G6 trilha de plataforma_admin sem registro_id (achou %)', n; falhas := falhas + 1; END IF;

  -- O OUTRO SENTIDO, e e ele que impede a correcao de virar defeito nas outras
  -- quinze. `usuario_tenant` tem `id` E `usuario_id`. Como `usuario_id` entrou
  -- por ULTIMO no coalesce, ela tem que continuar identificada pelo PROPRIO id.
  -- Se alguem reordenar o coalesce, quinze tabelas trocam de chave de auditoria
  -- em silencio - e este teste e o unico lugar que acusa.
  SELECT id INTO utA FROM usuario_tenant WHERE usuario_id = uA AND tenant_id = A;
  SELECT count(*) INTO n FROM auditoria
   WHERE tabela = 'usuario_tenant' AND operacao = 'I' AND registro_id = utA::text;
  IF n = 1 THEN RAISE NOTICE 'ok   G7   usuario_tenant segue identificada pelo proprio id, nao pelo usuario_id';
  ELSE RAISE WARNING 'FALHA G7 usuario_tenant trocou de chave de auditoria (achou %)', n; falhas := falhas + 1; END IF;

  -- ==============================================================
  IF falhas > 0 THEN RAISE EXCEPTION '% falha(s) em auditoria e repasse', falhas;
  ELSE RAISE NOTICE '--- auditoria e repasse: 35 verificacoes, 0 falhas'; END IF;
END $bloco$;
