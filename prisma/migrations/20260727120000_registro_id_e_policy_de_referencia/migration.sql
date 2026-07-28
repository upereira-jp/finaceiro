-- Migration 13 - dois furos medidos em 27/07/2026, ambos achados por leitura do
-- catalogo e nenhum deles capaz de quebrar teste ou log.
--
--   1. Q-AUDIT-01 - a trilha da concessao de tier grava registro_id NULL.
--   2. Q-DISTRIB-01 - o rls_auto_enable do Supabase pos RLS sem policy numa
--      tabela nossa, e a role de runtime le zero linhas dela.
--
-- As duas decisoes sao do dono, tomadas em 27/07 sobre as entradas do
-- QUESTOES.md - regra 10.

-- ============================================================ 1. Q-AUDIT-01
/*
 * FURO MEDIDO: app.auditar() monta o registro_id com
 *   coalesce(depois->>'id', antes->>'id', depois->>'cliente_id', antes->>'cliente_id')
 *
 * Medido no catalogo em 27/07: das dezesseis tabelas auditadas, `plataforma_admin`
 * e a UNICA sem `id` e sem `cliente_id` - a PK dela e `usuario_id`. Consequencia
 * medida num ensaio BEGIN..ROLLBACK do bootstrap: o INSERT gravou a linha de
 * auditoria com registro_id NULL.
 *
 * O dado nao se perde - o `depois` jsonb carrega {usuario_id, tier}. O que se
 * perde e o CAMINHO INDEXADO: auditoria_registro_idx e (tabela, registro_id), e
 * a pergunta "quem recebeu tier de plataforma, e quando" passaria a exigir
 * varredura com operador de jsonb. A migration 10 justifica auditar as tres
 * tabelas de plataforma dizendo que "a regra 9 nomeia papel" - e conceder tier e
 * a escrita mais privilegiada do sistema. Era a unica cuja trilha nao se
 * consultava pelo indice.
 *
 * A CORRECAO E DE UMA LINHA, E A ORDEM DO COALESCE E O QUE A TORNA SEGURA.
 * `usuario_id` entra no FIM. Onde existe `id`, `id` continua vencendo - entao as
 * outras quinze nao mudam de comportamento. Em particular `usuario_tenant`, que
 * tem as DUAS colunas, continua identificada pelo proprio id. O teste G7 fixa
 * isso, para que a garantia nao dependa de quem ler o coalesce depois.
 */
CREATE OR REPLACE FUNCTION app.auditar() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE v_antes jsonb; v_depois jsonb; v_tenant uuid; v_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_antes  := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_depois := to_jsonb(NEW); END IF;

  v_tenant := coalesce((v_depois->>'tenant_id')::uuid, (v_antes->>'tenant_id')::uuid);
  v_id     := coalesce(v_depois->>'id',         v_antes->>'id',
                       v_depois->>'cliente_id', v_antes->>'cliente_id',
                       -- Q-AUDIT-01: por ULTIMO, de proposito. So alcanca
                       -- plataforma_admin, a unica sem as duas de cima.
                       v_depois->>'usuario_id', v_antes->>'usuario_id');

  INSERT INTO public.auditoria
    (tenant_id, tabela, registro_id, operacao, usuario_id, tier, antes, depois)
  VALUES
    (v_tenant, TG_TABLE_NAME, v_id, left(TG_OP,1),
     app.current_usuario_id(), app.current_tier(), v_antes, v_depois);
  RETURN NULL;
END $$;

/*
 * CREATE OR REPLACE preserva dono e ACL, mas as duas linhas abaixo sao
 * reafirmadas de proposito: e o dono `auditor_financeiro` que faz o SECURITY
 * DEFINER escrever sob a policy auditoria_escrita_do_gatilho, e portanto e ele
 * que sustenta o append-only sob FORCE RLS sem BYPASSRLS. Se um replace futuro
 * derrubar a posse, a auditoria para de gravar - e para em silencio.
 */
ALTER FUNCTION app.auditar() OWNER TO auditor_financeiro;
REVOKE ALL ON FUNCTION app.auditar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auditar() TO app_financeiro;

-- ============================================================ 2. Q-DISTRIB-01
/*
 * FURO MEDIDO: a migration 10 criou `distribuidora` declarando em comentario
 * "Sem tenant_id e sem RLS: lista de referencia publica, nao dado de negocio".
 *
 * Medido em 27/07 contra producao: relrowsecurity = t, relforcerowsecurity = f,
 * ZERO policies. Ninguem escreveu esse ENABLE - foi o event trigger
 * `ensure_rls` / `public.rls_auto_enable` da plataforma Supabase, que e
 * exatamente o MT-09. Ele deixou de ser risco previsto e virou fato no schema.
 *
 * EFEITO MEDIDO, e e o da regra 3 - resultado vazio, nao erro:
 *   postgres (BYPASSRLS)   -> 1 linha
 *   app_financeiro_login   -> 0 linhas
 * O `GRANT SELECT ON distribuidora TO app_financeiro` da migration 10 era letra
 * morta, e a primeira tela que enumerasse distribuidoras viria vazia, calada.
 *
 * O QUE NAO QUEBROU, e foi medido em reproducao local antes de classificar a
 * severidade: integridade referencial SEMPRE ignora row security. As tres FKs
 * (tarifa, usina, unidade_consumidora) seguem funcionando nos dois sentidos -
 * 'Equatorial' e aceita, 'Equatorial GO' e recusada com 23503. O desenho da
 * migration 10 secao 6, que troca "risco aceito" por "impossibilidade", continua
 * de pe. Por isso isto e amarelo e nao vermelho.
 *
 * A CORRECAO E DECLARAR A INTENCAO. A tabela ja estava com RLS por acidente de
 * plataforma; passa a estar com RLS e uma policy escrita por nos, que diz o que
 * ela e: lista de referencia legivel por todos, sem escrita concedida a ninguem
 * alem do dono do schema. O ENABLE abaixo e reafirmacao idempotente - e tambem o
 * que faz o banco LOCAL de teste espelhar producao neste ponto, que era a outra
 * metade do problema: as duas bases divergiam estruturalmente.
 */
ALTER TABLE distribuidora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS distribuidora_leitura_publica ON distribuidora;
CREATE POLICY distribuidora_leitura_publica ON distribuidora
  FOR SELECT USING (true);

COMMENT ON TABLE distribuidora IS
  'Lista de referencia publica: sem tenant_id, sem dado de negocio. A RLS aqui '
  'NAO isola - existe porque o rls_auto_enable do Supabase a habilita sozinho '
  '(MT-09), e uma tabela com RLS e zero policies nega tudo em silencio. A policy '
  'distribuidora_leitura_publica declara a intencao. Escrita so pelo dono do '
  'schema, por migration. Ver Q-DISTRIB-01.';
