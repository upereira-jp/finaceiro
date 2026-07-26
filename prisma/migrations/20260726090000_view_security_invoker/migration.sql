-- SPEC-001 invariante 13 - toda view do financeiro declara security_invoker.
--
-- ORIGEM: o dev do CRM corrigiu uma premissa nossa em 26/07/2026, e a correcao
-- vale mais para o nosso lado do que para o dele.
--
-- Eu vinha afirmando que "RLS habilitada sem policy nega tudo, e o modo de falha
-- e resultado vazio". Isso e verdade para acesso DIRETO a tabela por role sem
-- BYPASSRLS. E FALSO atraves de view: por padrao a RLS das tabelas base e
-- avaliada contra o DONO da view, nao contra quem consulta. View owned por
-- superusuario le tudo.
--
-- Medido neste schema, mesma sessao, role app_financeiro, SEM contexto de tenant:
--
--   tabela direta                 ->  0 linhas   (RLS funcionando)
--   view SEM security_invoker     ->  2 linhas   <-- TODOS os tenants
--   view COM security_invoker     ->  0 linhas
--
-- Ou seja: uma view criada sem essa opcao anula FORCE ROW LEVEL SECURITY e as
-- treze policies de uma vez, para o caminho dela. O financeiro nao tem view
-- nenhuma hoje - e o melhor momento possivel para a regra existir.

/*
 * Recusa view em public/app que nao declare security_invoker = true.
 * Roda como constraint de catalogo em migration e em teste; nao ha como
 * expressar isso como constraint de tabela.
 */
CREATE OR REPLACE FUNCTION app.views_sem_security_invoker() RETURNS SETOF text
  LANGUAGE sql STABLE AS
$$
  SELECT n.nspname || '.' || c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v','m')
    AND n.nspname IN ('public','app')
    AND NOT coalesce(
      (SELECT option_value::boolean
       FROM pg_options_to_table(c.reloptions)
       WHERE option_name = 'security_invoker'), false)
$$;

COMMENT ON FUNCTION app.views_sem_security_invoker() IS
  'Invariante 13 da SPEC-001. Retorno nao vazio e violacao: view que ignora a '
  'RLS das tabelas base porque a avaliacao usa o dono da view, nao o chamador.';

GRANT EXECUTE ON FUNCTION app.views_sem_security_invoker() TO app_financeiro;

DO $$
DECLARE ruins text;
BEGIN
  SELECT string_agg(v, ', ') INTO ruins FROM app.views_sem_security_invoker() AS v;
  IF ruins IS NOT NULL THEN
    RAISE EXCEPTION 'Invariante 13: view sem security_invoker = true: %', ruins;
  END IF;
END $$;
