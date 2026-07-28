-- PROVISIONAMENTO de um usuario num tenant que JA EXISTE.
--
-- POR QUE ESTE SCRIPT PRECISOU EXISTIR, medido em 28/07:
--
-- O `bootstrap-plataforma-admin.sql` cria o PRIMEIRO admin de plataforma e diz,
-- no proprio cabecalho, que "dai em diante o proprio app cria, com auditoria e
-- com a matriz de papeis valendo". O `provisionar-tenant.sql` cria o tenant e o
-- vinculo do primeiro admin.
--
-- Nenhum dos dois cobre "adicionar a SEGUNDA pessoa ao tenant" - e o app tambem
-- nao: varrido em 28/07, ha ZERO rotas de gestao de usuario em src/http/rotas.ts.
-- A frase do bootstrap descrevia uma intencao que nunca foi construida.
--
-- A consequencia aparece na hora em que a operacao entra: sem caminho, todo
-- mundo usa a conta de uma pessoa so, e a regra 9 - quem, quando, o que, antes e
-- depois - passa a gravar o nome errado em toda linha. A trilha continua
-- existindo e para de servir para o que existe.
--
-- Isto e PROVISIONAMENTO e nao migration, pelo mesmo motivo dos outros dois: a
-- policy de `usuario` exige `app.current_tier() = 'plataforma_admin'` no WITH
-- CHECK, e `app_financeiro` nao alcanca. Roda pela role dona do schema.
--
-- ---------------------------------------------------------------------------
-- USO
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -v modo=ensaio \
--     -v auth_user_id='<uuid da conta em auth.users>' \
--     -v nome='Fulano de Tal' \
--     -v email='fulano@empresa.com' \
--     -v papel='admin' \
--     -v tenant='<uuid do tenant>' \
--     -f scripts/provisionar-usuario.sql
--
-- `modo` e OBRIGATORIO e nao tem default. Script de provisionamento que escreve
-- porque alguem esqueceu uma flag e o modo de falha errado.
--
-- `papel` e um de: admin, financeiro, cobranca, leitura. A matriz esta no PRD 3
-- e em src/db/contexto.ts - `admin` e o UNICO que cobre as quatro capacidades
-- (ler, escrever_cadastro, escrever_carteira, administrar).
--
-- IDEMPOTENTE: rodar duas vezes nao duplica. Se o usuario ja existe, o papel e
-- ajustado; se o vinculo ja existe com o mesmo papel, nada muda.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

\if :{?modo}
\else
  DO $g$ BEGIN
    RAISE EXCEPTION 'modo ausente'
      USING HINT = 'Informe -v modo=ensaio (ROLLBACK) ou -v modo=valendo (COMMIT).';
  END $g$;
\endif

SELECT :'modo' IN ('ensaio','valendo') AS modo_valido \gset
\if :modo_valido
\else
  DO $g$ BEGIN
    RAISE EXCEPTION 'modo invalido'
      USING HINT = 'Tem que ser exatamente `ensaio` ou `valendo`.';
  END $g$;
\endif

BEGIN;

/*
 * pg_temp pelo mesmo motivo do bootstrap: psql nao interpola :'variavel' dentro
 * de dollar-quote, entao a interpolacao tem que acontecer na CHAMADA.
 */
CREATE FUNCTION pg_temp.provisionar_usuario(
  p_auth uuid, p_nome text, p_email text, p_papel text, p_tenant uuid)
  RETURNS TABLE (etapa text, resultado text)
  LANGUAGE plpgsql AS
$fn$
DECLARE
  v_usuario_id uuid;
  v_papel_atual text;
BEGIN
  -- GUARDA 1: a conta tem que existir no Supabase Auth DESTE projeto.
  -- Nao ha FK entre public.usuario e auth.users (schemas separados), entao um
  -- UUID errado nao falha - vira linha que nunca loga e que ninguem descobre.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_auth) THEN
    RAISE EXCEPTION 'auth_user_id % nao existe em auth.users deste projeto', p_auth
      USING HINT = 'Crie a conta no Supabase Auth primeiro.';
  END IF;

  /*
   * GUARDA 2: e-mail confirmado. Medido em 28/07: o projeto tem
   * `mailer_autoconfirm: false`, entao conta criada por signup nasce com
   * email_confirmed_at NULL e o login e RECUSADO pelo GoTrue.
   *
   * Sem esta guarda, o provisionamento termina com sucesso, a linha existe, o
   * papel esta certo - e a pessoa nao entra. O erro aparece longe daqui, na
   * tela de login, sem nada que aponte para ca.
   */
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_auth AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'a conta % existe mas o e-mail NAO esta confirmado', p_auth
      USING HINT = 'Confirme pelo painel do Supabase (Authentication > Users) ou, '
                   'se o projeto usar autoconfirm, ligue-o. Sem isso o login e recusado '
                   'e o provisionamento fica parecendo certo.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenant WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'tenant % nao existe', p_tenant;
  END IF;

  IF p_papel NOT IN ('admin','financeiro','cobranca','leitura') THEN
    RAISE EXCEPTION 'papel invalido: %', p_papel
      USING HINT = 'Um de: admin, financeiro, cobranca, leitura (PRD 3).';
  END IF;

  IF p_nome IS NULL OR btrim(p_nome) = '' THEN RAISE EXCEPTION 'nome vazio'; END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN RAISE EXCEPTION 'email vazio'; END IF;

  -- ------------------------------------------------------------- usuario
  SELECT id INTO v_usuario_id FROM usuario WHERE auth_user_id = p_auth;

  IF v_usuario_id IS NULL THEN
    INSERT INTO usuario (auth_user_id, nome, email, ativo)
    VALUES (p_auth, btrim(p_nome), lower(btrim(p_email)), true)
    RETURNING id INTO v_usuario_id;
    etapa := 'usuario'; resultado := 'CRIADO ' || v_usuario_id::text; RETURN NEXT;
  ELSE
    UPDATE usuario
       SET nome = btrim(p_nome), email = lower(btrim(p_email)), ativo = true
     WHERE id = v_usuario_id;
    etapa := 'usuario'; resultado := 'ja existia ' || v_usuario_id::text; RETURN NEXT;
  END IF;

  -- -------------------------------------------------------------- vinculo
  SELECT papel::text INTO v_papel_atual
    FROM usuario_tenant WHERE usuario_id = v_usuario_id AND tenant_id = p_tenant;

  IF v_papel_atual IS NULL THEN
    INSERT INTO usuario_tenant (tenant_id, usuario_id, papel, ativo)
    VALUES (p_tenant, v_usuario_id, p_papel::papel_tenant, true);
    etapa := 'vinculo'; resultado := 'CRIADO papel=' || p_papel; RETURN NEXT;
  ELSIF v_papel_atual IS DISTINCT FROM p_papel THEN
    UPDATE usuario_tenant
       SET papel = p_papel::papel_tenant, ativo = true
     WHERE usuario_id = v_usuario_id AND tenant_id = p_tenant;
    etapa := 'vinculo'; resultado := 'papel ALTERADO ' || v_papel_atual || ' -> ' || p_papel; RETURN NEXT;
  ELSE
    UPDATE usuario_tenant SET ativo = true
     WHERE usuario_id = v_usuario_id AND tenant_id = p_tenant;
    etapa := 'vinculo'; resultado := 'ja existia papel=' || v_papel_atual; RETURN NEXT;
  END IF;

  -- CONFERENCIA: o caminho de login tem que devolver a pessoa.
  IF NOT EXISTS (
    SELECT 1 FROM usuario u
      JOIN usuario_tenant vt ON vt.usuario_id = u.id
     WHERE u.auth_user_id = p_auth AND u.ativo AND vt.ativo AND vt.tenant_id = p_tenant
  ) THEN
    RAISE EXCEPTION 'conferencia falhou: usuario provisionado mas sem vinculo ativo';
  END IF;
  etapa := 'conferencia'; resultado := 'login resolve, vinculo ativo'; RETURN NEXT;
END
$fn$;

SELECT * FROM pg_temp.provisionar_usuario(
  :'auth_user_id'::uuid, :'nome', :'email', :'papel', :'tenant'::uuid);

\if :modo_valido
\endif
SELECT :'modo' = 'valendo' AS commitar \gset
\if :commitar
  COMMIT;
  \echo '== COMMIT. Usuario provisionado. =='
\else
  ROLLBACK;
  \echo '== ROLLBACK (--modo=ensaio). Nada foi gravado. =='
\endif
