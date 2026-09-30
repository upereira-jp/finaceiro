-- ============================================================================
-- Migration 41 — ADMINISTRACAO DA PLATAFORMA: quem ve qual setor, e cadastrar
-- gente pela tela
-- ============================================================================
/*
 * O PEDIDO, do dono em 30/09/2026: *"o sistema financeiro esta sem
 * configuracoes de admin como: adicionar usuario [...] o que preciso nesse
 * momento e de adicionar usuarios ao sistema. e uma configuracao de quais
 * setores eles podem visualizar, isso deve ser marcado por checkbox."*
 *
 * O QUE EXISTIA ATE AQUI, medido no mesmo dia: ZERO rotas de gestao de usuario.
 * Cadastrar a segunda pessoa de um tenant era `scripts/provisionar-usuario.sql`,
 * rodado com `psql` e a `DIRECT_URL` de dono — o script dizia no cabecalho, desde
 * 28/07, que "a frase do bootstrap descrevia uma intencao que nunca foi
 * construida". Esta migration e o que falta no BANCO para a intencao existir.
 *
 * ============================================================================
 * TRES PECAS, e por que cada uma mora aqui e nao na aplicacao
 *
 *   1. `usuario_tenant.setores` — QUAIS SETORES o vinculo ve. Mora no VINCULO e
 *      nao no `usuario` porque e decisao de cada empresa: a mesma pessoa pode
 *      ver o Rateio de um tenant e so a Empresa de outro;
 *   2. `app.usuarios_do_tenant()` — a LISTA para quem administra. Precisa ser
 *      SECURITY DEFINER, e o motivo e medido na policy: `usuario` so e legivel
 *      por quem e membro ATIVO (`app.membros_do_tenant()` filtra `ativo`). Quem
 *      teve o acesso desligado some da leitura direta — e a tela que desliga e
 *      justamente a que precisa mostra-lo para religar;
 *   3. `app.vincular_usuario(...)` — CADASTRAR. Tambem SECURITY DEFINER, porque
 *      a policy de `usuario` so deixa INSERIR quem tem tier `plataforma_admin`
 *      (migration 3). O administrador de uma empresa nao tem tier, e nao deve
 *      ter: tier atravessa tenant (R2/R3), e cadastrar colega nao e isso.
 *
 * As duas funcoes REIMPOEM a autoridade no corpo — o mesmo contrato de
 * `membros_do_tenant()` e da resolvedora do cofre: SECURITY DEFINER e leitura
 * sem policy, entao o predicado da policy vai escrito dentro, e fora de contexto
 * de tenant o retorno e RECUSA, nunca a lista de todos.
 *
 * ============================================================================
 * «ADMINISTRACAO» E UM SETOR, E SO O PAPEL `admin` PODE TE-LO
 *
 * No menu do topo ela e uma pasta propria («Administracao da plataforma»), ao
 * lado dos «Setores financeiros» — mas no dado e o mesmo tipo de coisa: um lugar
 * da tela que a pessoa ve ou nao ve, marcado por caixa. Guardar num campo so
 * mantem UMA pergunta ("o que esta pessoa ve?") com UMA resposta.
 *
 * O que ela NAO e: um papel novo. O papel continua dizendo o que a pessoa PODE
 * FAZER (a matriz do PRD 3, `src/db/contexto.ts`), e so `admin` cobre
 * `administrar`. Ver a Administracao sem poder administrar seria uma tela que
 * recusa todo clique — por isso a constraint abaixo a prende ao papel. O
 * inverso e permitido, e e o caso real de hoje: a G3 tem tres pessoas com papel
 * `admin` (so `admin` escreve cadastro) e o dono nomeou DUAS para administrar a
 * plataforma.
 *
 * ============================================================================
 * QUEM COMECA COM A ADMINISTRACAO — e por que nao ha uuid de pessoa aqui
 *
 * A migration 40 deixou escrito: *"uma migration que gravasse dois uuids de UM
 * tenant seria uma migration que mente sobre ser schema."* Vale igual aqui, e
 * o dono nomeou os administradores em 30/09 ("jppereirraworkspace e vinicius
 * leal").
 *
 * A regra que sobra sem nomear ninguem: **ganha a Administracao quem ja
 * administra a plataforma hoje** — vinculo com papel `admin` de quem tem tier
 * `plataforma_admin` (`bootstrap-plataforma-admin.sql`). Em producao, medido em
 * 30/09 pelo conector de leitura, isso e UMA pessoa. Ela entra na tela e marca
 * a caixa da segunda. Ninguem que o dono nao nomeou chega a ver a pasta nem por
 * um minuto — o contrario de "todo admin ganha, depois se desmarca".
 *
 * Sem essa regra a pasta nasceria sem dono nenhum, e ai ninguem conseguiria
 * dar a Administracao a ninguem pela tela.
 */

-- ============================================================ 1. a coluna
/*
 * `text[]` COM CHECK, e nao enum nem tabela de juncao. Os setores sao tres,
 * fixos no codigo da tela (`web/src/navegacao.ts`), e o conjunto e lido inteiro
 * a cada login: uma tabela a mais seria um JOIN a mais no caminho mais quente do
 * sistema para guardar ate tres palavras. O CHECK da ao `text[]` o que o enum
 * daria — valor desconhecido nao entra.
 *
 * O DEFAULT e o que todo vinculo via ate hoje: os dois setores financeiros.
 * Nada muda para quem ja opera.
 */
ALTER TABLE usuario_tenant
  ADD COLUMN setores text[] NOT NULL DEFAULT ARRAY['rateio', 'empresa']::text[];

ALTER TABLE usuario_tenant
  ADD CONSTRAINT usuario_tenant_setores_conhecidos
    CHECK (setores <@ ARRAY['rateio', 'empresa', 'administracao']::text[]),
  /* Vinculo ativo sem setor nenhum e uma pessoa que entra e ve a barra vazia.
   * Tirar o acesso de alguem e desligar o vinculo (`ativo`), e nao desmarcar
   * tudo — sao duas coisas, e so uma delas aparece na trilha como "desligou". */
  ADD CONSTRAINT usuario_tenant_ao_menos_um_setor
    CHECK (cardinality(setores) >= 1),
  ADD CONSTRAINT usuario_tenant_administracao_so_admin
    CHECK (NOT ('administracao' = ANY (setores)) OR papel = 'admin');

COMMENT ON COLUMN usuario_tenant.setores IS
  'Quais setores da tela o vinculo ve: rateio, empresa, administracao. A '
  'administracao exige papel admin (constraint). O papel diz o que a pessoa PODE '
  'FAZER; os setores, o que ela VE. Migration 41, pedido do dono em 30/09/2026.';

-- ============================================================ 2. quem comeca
UPDATE usuario_tenant ut
   SET setores = ARRAY['rateio', 'empresa', 'administracao']::text[]
 WHERE ut.papel = 'admin'
   AND EXISTS (SELECT 1 FROM plataforma_admin pa
                WHERE pa.usuario_id = ut.usuario_id AND pa.tier = 'plataforma_admin');

-- ============================================================ 3. a autoridade
/*
 * QUEM ADMINISTRA A PLATAFORMA NO TENANT CORRENTE: vinculo ATIVO, papel `admin`
 * e o setor marcado. As tres, e a sessao nao escolhe: o usuario e o tenant saem
 * do contexto emitido por `withTenant`, nunca de parametro.
 *
 * SECURITY INVOKER (o padrao), de proposito: a policy de `usuario_tenant` ja
 * deixa o membro ler a propria linha, entao esta funcao nao precisa de
 * privilegio nenhum que quem chama nao tenha — e fica fora da lista fechada de
 * SECURITY DEFINER (inv. 19). Chamada de dentro das duas funcoes abaixo, roda
 * com o privilegio delas, e o predicado e o mesmo.
 */
CREATE FUNCTION app.administra_a_plataforma() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, public AS
$$
  SELECT app.current_usuario_id() IS NOT NULL
     AND app.current_tenant_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.usuario_tenant ut
        WHERE ut.usuario_id = app.current_usuario_id()
          AND ut.tenant_id  = app.current_tenant_id()
          AND ut.ativo
          AND ut.papel = 'admin'
          AND 'administracao' = ANY (ut.setores)
     )
$$;

REVOKE ALL ON FUNCTION app.administra_a_plataforma() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.administra_a_plataforma() TO app_financeiro;

-- ============================================================ 4. a lista
CREATE FUNCTION app.usuarios_do_tenant()
  RETURNS TABLE (
    usuario_id uuid, nome text, email text, papel text, setores text[],
    ativo boolean, criado_em timestamptz, voce boolean
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
BEGIN
  /* RECUSA, e nao lista vazia. Vazio aqui seria indistinguivel de "a empresa
   * nao tem ninguem", e a tela diria isso a quem so nao tinha permissao. */
  IF NOT app.administra_a_plataforma() THEN
    RAISE EXCEPTION 'so quem administra a plataforma neste tenant ve a lista de usuarios'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT u.id, u.nome, u.email, ut.papel::text, ut.setores,
           (ut.ativo AND u.ativo), u.criado_em,
           u.id = app.current_usuario_id()
      FROM public.usuario_tenant ut
      JOIN public.usuario u ON u.id = ut.usuario_id
     WHERE ut.tenant_id = app.current_tenant_id()
     ORDER BY (ut.ativo AND u.ativo) DESC, lower(u.nome);
END $$;

REVOKE ALL ON FUNCTION app.usuarios_do_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.usuarios_do_tenant() TO app_financeiro;

COMMENT ON FUNCTION app.usuarios_do_tenant() IS
  'A lista de quem tem vinculo com o tenant corrente, ativos e desligados. SECURITY '
  'DEFINER porque a policy de usuario esconde o membro desligado. Reimpoe a autoridade '
  '(app.administra_a_plataforma) e RECUSA com 42501 - nunca devolve vazio. Migration 41.';

-- ============================================================ 5. cadastrar
/*
 * LIGA UMA CONTA DE LOGIN (auth.users, criada pela aplicacao no Supabase Auth
 * antes desta chamada) AO TENANT CORRENTE, com papel e setores.
 *
 * O TENANT NAO E PARAMETRO — sai do contexto, como na trilha de ato externo e
 * na resolvedora do cofre. Uma assinatura que o recebesse deixaria quem chama
 * cadastrar gente em empresa alheia.
 *
 * O `usuario` e REUSADO quando ja existe (a mesma conta pode ter vinculo em
 * outro tenant): nome e e-mail dele NAO sao reescritos daqui, porque sao dado de
 * plataforma e o administrador de uma empresa nao edita a identidade de quem
 * tambem trabalha em outra.
 *
 * Vinculo que ja existe e ERRO (23505), e nao "atualiza": cadastrar de novo quem
 * ja esta na lista e quase sempre engano de pessoa, e a tela tem o caminho
 * certo para mudar o acesso de quem ja existe.
 *
 * A trilha e de graca: `usuario` e `usuario_tenant` tem o gatilho `auditar`
 * desde a migration 11, e ele grava `app.current_usuario_id()` — quem cadastrou.
 */
CREATE FUNCTION app.vincular_usuario(
  p_auth_user_id uuid, p_nome text, p_email text, p_papel text, p_setores text[]
) RETURNS TABLE (usuario_id uuid, usuario_ja_existia boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE
  v_tenant  uuid := app.current_tenant_id();
  v_usuario uuid;
  v_ativo   boolean;
BEGIN
  IF NOT app.administra_a_plataforma() THEN
    RAISE EXCEPTION 'so quem administra a plataforma neste tenant cadastra usuarios'
      USING ERRCODE = '42501';
  END IF;

  IF p_auth_user_id IS NULL THEN RAISE EXCEPTION 'conta de login ausente' USING ERRCODE = '22023'; END IF;
  IF p_nome  IS NULL OR btrim(p_nome)  = '' THEN RAISE EXCEPTION 'nome vazio'   USING ERRCODE = '22023'; END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN RAISE EXCEPTION 'e-mail vazio' USING ERRCODE = '22023'; END IF;

  SELECT u.id, u.ativo INTO v_usuario, v_ativo FROM public.usuario u WHERE u.auth_user_id = p_auth_user_id;

  IF v_usuario IS NULL THEN
    INSERT INTO public.usuario (auth_user_id, nome, email, ativo)
    VALUES (p_auth_user_id, btrim(p_nome), lower(btrim(p_email)), true)
    RETURNING id INTO v_usuario;
    usuario_ja_existia := false;
  ELSE
    /* Conta desligada NA PLATAFORMA nao se religa por aqui: `usuario.ativo`
     * e dado de plataforma, e o login dela e recusado em todo tenant. */
    IF NOT v_ativo THEN
      RAISE EXCEPTION 'esta conta esta desligada na plataforma' USING ERRCODE = '42501';
    END IF;
    usuario_ja_existia := true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_tenant ut
              WHERE ut.usuario_id = v_usuario AND ut.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'esta pessoa ja tem acesso a esta empresa' USING ERRCODE = '23505';
  END IF;

  /* papel e setores: o cast e as constraints da coluna fazem a validacao —
   * papel desconhecido falha no cast (22P02), setor desconhecido ou
   * administracao sem admin falham no CHECK (23514). */
  INSERT INTO public.usuario_tenant (tenant_id, usuario_id, papel, ativo, setores)
  VALUES (v_tenant, v_usuario, p_papel::papel_tenant, true, p_setores);

  usuario_id := v_usuario;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION app.vincular_usuario(uuid, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.vincular_usuario(uuid, text, text, text, text[]) TO app_financeiro;

COMMENT ON FUNCTION app.vincular_usuario(uuid, text, text, text, text[]) IS
  'Cadastra no tenant CORRENTE (do contexto, nunca parametro) uma conta de login ja '
  'criada no Supabase Auth. SECURITY DEFINER porque a policy de usuario so deixa '
  'inserir o tier plataforma_admin. Reimpoe a autoridade; vinculo repetido e 23505. '
  'Auditado pelos gatilhos de usuario e usuario_tenant. Migration 41.';

-- ============================================================ 6. o login
/*
 * `resolver_login` DEVOLVE OS SETORES, porque a barra do topo e desenhada com
 * eles antes de qualquer tela carregar. O resto e a funcao da migration 31
 * letra por letra (tenant INNER JOIN: vinculo com tenant nao-ativo some).
 *
 * DROP + CREATE, e nao REPLACE: mudar as colunas de RETURNS TABLE e mudar o
 * tipo de retorno, que o REPLACE recusa. Os dois GRANTs da migration 6 voltam
 * logo abaixo — sem eles o login de TODO MUNDO para no dia do deploy.
 *
 * O LEITOR (`src/auth/sessao.ts`) le com `SELECT *` e trata a coluna ausente
 * como "os dois setores financeiros". Assim o codigo novo roda contra o banco
 * velho — os timers carregam a arvore de trabalho sem esperar deploy.
 */
DROP FUNCTION app.resolver_login(uuid);

CREATE FUNCTION app.resolver_login(p_auth_user_id uuid)
  RETURNS TABLE (
    usuario_id uuid, nome text, email text,
    tier text, tenant_id uuid, tenant_razao_social text, papel text,
    setores text[]
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT u.id, u.nome, u.email,
         pa.tier::text,
         ut.tenant_id, t.razao_social, ut.papel::text,
         ut.setores
  FROM public.usuario u
  LEFT JOIN public.plataforma_admin pa ON pa.usuario_id = u.id
  LEFT JOIN (
    public.usuario_tenant ut
    JOIN public.tenant t ON t.id = ut.tenant_id AND t.status = 'ativo'
  ) ON ut.usuario_id = u.id AND ut.ativo
  WHERE u.auth_user_id = p_auth_user_id
    AND u.ativo
$$;

REVOKE ALL ON FUNCTION app.resolver_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_login(uuid) TO app_financeiro;

COMMENT ON FUNCTION app.resolver_login(uuid) IS
  'Bootstrap do login: unica funcao chamada SEM contexto de tenant. Devolve a '
  'identidade e os tenants ATIVOS a que a pessoa pertence, com o papel e os setores '
  'de cada vinculo, para o middleware montar o contexto. Nao devolve dado de negocio. '
  'Tenant INNER JOIN desde a 31; setores desde a 41.';
