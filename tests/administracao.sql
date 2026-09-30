-- Migration 41 - a Administracao da plataforma: setores do vinculo, a lista e o
-- cadastro. Uso: psql -d fin_admin -f tests/administracao.sql (depois de todas as
-- migrations). Fixture propria; nada aqui depende de outra suite.
--
-- O QUE ESTA SUITE PRENDE, e cada linha e uma frase da migration que sem teste
-- seria comentario (regra 8):
--   - os tres CHECKs da coluna (setor conhecido, ao menos um, administracao so
--     com papel admin);
--   - as duas funcoes SECURITY DEFINER RECUSAM (42501) quem nao administra — sem
--     vinculo, sem papel, sem o setor, sem contexto — e nunca devolvem vazio;
--   - a lista traz o desligado (o motivo de ela ser SECURITY DEFINER) e so o
--     tenant do contexto;
--   - o cadastro grava no tenant do CONTEXTO, reusa o usuario de outro tenant sem
--     reescrever a identidade dele, recusa vinculo repetido (23505), e a trilha
--     assina com quem cadastrou;
--   - o login devolve os setores.
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  A uuid; B uuid;
  uAdm uuid; uAdm2 uuid; uFin uuid; uDesl uuid; uB uuid;
  authB uuid; authNovo uuid; novo uuid; ja boolean;
  falhas int := 0; n int; t text; s text[]; quem uuid;
BEGIN
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Adm A', '33333333000181') RETURNING id INTO A;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Adm B', '44444444000162') RETURNING id INTO B;
  authB := gen_random_uuid();
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(), 'Administra', 'adm@x')  RETURNING id INTO uAdm;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(), 'Admin sem pasta', 'adm2@x') RETURNING id INTO uAdm2;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(), 'Financeiro', 'fin@x') RETURNING id INTO uFin;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(), 'Desligada', 'desl@x') RETURNING id INTO uDesl;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (authB, 'Do B', 'b@x') RETURNING id INTO uB;

  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel, setores)
    VALUES (A, uAdm, 'admin', ARRAY['rateio','empresa','administracao']);
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (A, uAdm2, 'admin');
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel, setores) VALUES (A, uFin, 'financeiro', ARRAY['empresa']);
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel, ativo) VALUES (A, uDesl, 'leitura', false);
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel, setores)
    VALUES (B, uB, 'admin', ARRAY['rateio','empresa','administracao']);

  -- ------------------------------------------------ AD1 os tres CHECKs
  SELECT setores INTO s FROM usuario_tenant WHERE usuario_id = uAdm2;
  IF s = ARRAY['rateio','empresa'] THEN
    RAISE NOTICE 'ok   AD1  vinculo sem setores declarados nasce com os dois setores financeiros (o que todos viam ate a 41)';
  ELSE RAISE WARNING 'FALHA AD1 default da coluna: %', s; falhas := falhas + 1; END IF;

  BEGIN
    UPDATE usuario_tenant SET setores = ARRAY['rateio','administracao'] WHERE usuario_id = uFin;
    RAISE WARNING 'FALHA AD2 papel financeiro aceitou o setor administracao'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   AD2  administracao sem papel admin: recusado pelo banco (23514)';
  END;

  BEGIN
    UPDATE usuario_tenant SET setores = ARRAY['rateio','diretoria'] WHERE usuario_id = uFin;
    RAISE WARNING 'FALHA AD3 setor desconhecido entrou'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   AD3  setor que a tela nao conhece: recusado (23514)';
  END;

  BEGIN
    UPDATE usuario_tenant SET setores = ARRAY[]::text[] WHERE usuario_id = uFin;
    RAISE WARNING 'FALHA AD4 vinculo sem setor nenhum entrou'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   AD4  nenhum setor marcado: recusado — tirar o acesso e desligar o vinculo';
  END;

  BEGIN
    UPDATE usuario_tenant SET papel = 'cobranca' WHERE usuario_id = uAdm;
    RAISE WARNING 'FALHA AD4b rebaixar o papel manteve a administracao'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   AD4b rebaixar o papel de quem tem a administracao, sem tira-la: recusado';
  END;

  SET LOCAL ROLE app_financeiro;

  -- ------------------------------------------------ AD5 a lista
  PERFORM set_config('app.tenant_id',  A::text, true);
  PERFORM set_config('app.usuario_id', uAdm::text, true);
  PERFORM set_config('app.tier', '', true);

  SELECT count(*) INTO n FROM app.usuarios_do_tenant();
  IF n = 4 THEN RAISE NOTICE 'ok   AD5  a lista traz os 4 vinculos do A, inclusive a desligada — e so do A';
  ELSE RAISE WARNING 'FALHA AD5 lista com % linhas (esperado 4)', n; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM app.usuarios_do_tenant() WHERE NOT ativo AND nome = 'Desligada';
  IF n = 1 THEN RAISE NOTICE 'ok   AD5b a desligada aparece com ativo=false — e o motivo de a funcao ser SECURITY DEFINER';
  ELSE RAISE WARNING 'FALHA AD5b desligada: %', n; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM usuario WHERE nome = 'Desligada';
  IF n = 0 THEN RAISE NOTICE 'ok   AD5c controle: pela leitura direta a desligada some (a policy de usuario so ve membro ativo)';
  ELSE RAISE WARNING 'FALHA AD5c a leitura direta viu a desligada — a funcao nao precisaria existir'; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM app.usuarios_do_tenant() WHERE voce AND usuario_id = uAdm;
  IF n = 1 THEN RAISE NOTICE 'ok   AD5d a linha de quem pergunta vem marcada (voce) — a tela a usa para impedir tirar o proprio acesso';
  ELSE RAISE WARNING 'FALHA AD5d voce: %', n; falhas := falhas + 1; END IF;

  -- ------------------------------------------------ AD6 quem NAO ve a lista
  FOR quem, t IN SELECT * FROM (VALUES
      (uAdm2, 'admin sem o setor administracao'),
      (uFin,  'papel financeiro'),
      (uB,    'admin de OUTRO tenant apontando o contexto para o A'),
      (uDesl, 'vinculo desligado')) AS v(q, d)
  LOOP
    PERFORM set_config('app.usuario_id', quem::text, true);
    BEGIN
      PERFORM count(*) FROM app.usuarios_do_tenant();
      RAISE WARNING 'FALHA AD6 % viu a lista', t; falhas := falhas + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ok   AD6  %: recusado com 42501, e nao lista vazia', t;
    END;
  END LOOP;

  PERFORM set_config('app.tenant_id', '', true);
  PERFORM set_config('app.usuario_id', uAdm::text, true);
  BEGIN
    PERFORM count(*) FROM app.usuarios_do_tenant();
    RAISE WARNING 'FALHA AD6b sem contexto de tenant a lista respondeu'; falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   AD6b sem contexto de tenant: recusado — SECURITY DEFINER contido';
  END;

  -- ------------------------------------------------ AD7 o cadastro
  PERFORM set_config('app.tenant_id',  A::text, true);
  PERFORM set_config('app.usuario_id', uAdm::text, true);
  authNovo := gen_random_uuid();
  SELECT v.usuario_id, v.usuario_ja_existia INTO novo, ja
    FROM app.vincular_usuario(authNovo, '  Pessoa Nova ', ' Nova@X ', 'financeiro', ARRAY['rateio']) v;
  IF novo IS NOT NULL AND ja = false THEN RAISE NOTICE 'ok   AD7  cadastro de conta nova: usuario criado e vinculado ao tenant do CONTEXTO';
  ELSE RAISE WARNING 'FALHA AD7 novo=% ja=%', novo, ja; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM app.usuarios_do_tenant()
   WHERE usuario_id = novo AND nome = 'Pessoa Nova' AND email = 'nova@x'
     AND papel = 'financeiro' AND setores = ARRAY['rateio'] AND ativo;
  IF n = 1 THEN RAISE NOTICE 'ok   AD7b nome aparado, e-mail minusculo, papel e setores como pedidos';
  ELSE RAISE WARNING 'FALHA AD7b a linha nova nao bate (%)', n; falhas := falhas + 1; END IF;

  BEGIN
    PERFORM * FROM app.vincular_usuario(authNovo, 'De novo', 'nova@x', 'leitura', ARRAY['empresa']);
    RAISE WARNING 'FALHA AD7c o mesmo vinculo entrou duas vezes'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   AD7c cadastrar de novo quem ja tem acesso: 23505, e nao "atualiza em silencio"';
  END;

  SELECT v.usuario_id, v.usuario_ja_existia INTO novo, ja
    FROM app.vincular_usuario(authB, 'Nome que NAO deve colar', 'outro@x', 'leitura', ARRAY['empresa']) v;
  IF novo = uB AND ja THEN RAISE NOTICE 'ok   AD7d conta que ja trabalha em outro tenant: o usuario e REUSADO';
  ELSE RAISE WARNING 'FALHA AD7d novo=% ja=% (esperado %)', novo, ja, uB; falhas := falhas + 1; END IF;

  SELECT count(*) INTO n FROM app.usuarios_do_tenant() WHERE usuario_id = uB AND nome = 'Do B' AND email = 'b@x';
  IF n = 1 THEN RAISE NOTICE 'ok   AD7e ...e a identidade dele NAO e reescrita por quem administra outra empresa';
  ELSE RAISE WARNING 'FALHA AD7e o cadastro no A reescreveu nome/e-mail do usuario do B'; falhas := falhas + 1; END IF;

  BEGIN
    PERFORM * FROM app.vincular_usuario(gen_random_uuid(), 'X', 'x@x', 'leitura', ARRAY['administracao']);
    RAISE WARNING 'FALHA AD7f cadastrou leitura com administracao'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   AD7f cadastrar papel leitura com a administracao: o CHECK da coluna recusa';
  END;

  PERFORM set_config('app.usuario_id', uFin::text, true);
  BEGIN
    PERFORM * FROM app.vincular_usuario(gen_random_uuid(), 'Y', 'y@x', 'admin', ARRAY['rateio']);
    RAISE WARNING 'FALHA AD7g papel financeiro cadastrou gente'; falhas := falhas + 1;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok   AD7g quem nao administra nao cadastra (42501)';
  END;

  -- ------------------------------------------------ AD8 o login devolve os setores
  PERFORM set_config('app.tenant_id', '', true);
  PERFORM set_config('app.usuario_id', '', true);
  SELECT r.setores INTO s FROM app.resolver_login(authNovo) r WHERE r.tenant_id = A;
  IF s = ARRAY['rateio'] THEN RAISE NOTICE 'ok   AD8  resolver_login devolve os setores do vinculo — a barra e desenhada com eles';
  ELSE RAISE WARNING 'FALHA AD8 setores no login: %', s; falhas := falhas + 1; END IF;

  RESET ROLE;

  -- ------------------------------------------------ AD9 a trilha assina com quem cadastrou
  -- alias `au`, e nao `a`: o PL/pgSQL nao distingue maiuscula, e `a` colide com
  -- a variavel `A` do tenant.
  SELECT au.usuario_id INTO quem FROM auditoria au
   WHERE au.tabela = 'usuario_tenant' AND au.operacao = 'I'
     AND au.tenant_id = A AND (au.depois->>'usuario_id')::uuid = uB;
  IF quem = uAdm THEN RAISE NOTICE 'ok   AD9  o gatilho auditar grava QUEM cadastrou (regra 9), mesmo atraves da SECURITY DEFINER';
  ELSE RAISE WARNING 'FALHA AD9 a trilha do vinculo novo assina com %', quem; falhas := falhas + 1; END IF;

  IF falhas > 0 THEN RAISE EXCEPTION '% falha(s) na administracao', falhas;
  ELSE RAISE NOTICE '--- administracao da plataforma: 23 verificacoes, 0 falhas'; END IF;
END $bloco$;
