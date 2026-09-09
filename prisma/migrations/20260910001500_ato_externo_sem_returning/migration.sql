-- ============================================================================
-- O `RETURNING` DA MIGRATION 37 PEDIA UM PRIVILEGIO QUE A ROLE NAO TEM
-- ============================================================================
/*
 * MEDIDO CONTRA PRODUCAO em 09/09/2026, minutos depois de aplicar a 37, num
 * ensaio feito exatamente para isto:
 *
 *   permission denied for table ato_externo_log   (SQLSTATE 42501)
 *
 * A CAUSA, e ela e de uma palavra: `INSERT ... RETURNING id` exige **SELECT** na
 * coluna devolvida, e `auditor_financeiro` tem so **INSERT** - de proposito, e
 * esse aperto e o que impede a role de escrita ler ou forjar trilha. O gatilho
 * `app.auditar()`, que roda ha meses, nao tem `RETURNING`: era por isso que ele
 * funcionava e este nao.
 *
 * O CONSERTO NAO E CONCEDER `SELECT`. Seria a saida preguicosa e afrouxaria a
 * role mais apertada do sistema por causa de um valor de retorno. O uuid passa a
 * ser gerado NO CORPO e inserido explicitamente - mesmo valor, nenhum privilegio
 * novo.
 *
 * ⚠️ E A LICAO E SOBRE A CONFERENCIA, nao sobre o SQL. O modo `migration-37` do
 * `conferir-banco-alvo` conferiu OITO partes - tabela, RLS forcada, as duas
 * policies, a funcao, o DONO dela, os dois REVOKE, o registro - e passou verde
 * sobre uma funcao que nao conseguia escrever. Todas as oito eram de ESTRUTURA;
 * o defeito era de COMPORTAMENTO. Por isso a `tests/auditoria.sql` ganhou, junto
 * com esta migration, uma verificacao que CHAMA a funcao e confere que a linha
 * apareceu. Estrutura certa nao prova escrita possivel.
 */

CREATE OR REPLACE FUNCTION app.registrar_ato_externo(
  p_ato text, p_contraparte text, p_fase text, p_detalhe jsonb DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE v_id uuid; v_tenant uuid;
BEGIN
  v_tenant := app.current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ato externo sem contexto de tenant'
      USING HINT = 'Chame dentro de withTenant. A trilha nao existe fora de um tenant, '
                   'e gravar com tenant NULL esconderia o ato de quem tem direito de ve-lo.';
  END IF;

  -- GERADO AQUI, e nao devolvido pelo INSERT: `RETURNING` exigiria SELECT, e
  -- `auditor_financeiro` so tem INSERT. O DEFAULT da coluna continua existindo
  -- para quem inserir sem informar o id.
  v_id := gen_random_uuid();

  INSERT INTO public.ato_externo_log
    (id, tenant_id, ato, contraparte, fase, usuario_id, tier, detalhe)
  VALUES
    (v_id, v_tenant, p_ato, p_contraparte, p_fase,
     app.current_usuario_id(), app.current_tier(), p_detalhe);

  RETURN v_id;
END $$;

-- `CREATE OR REPLACE` PRESERVA dono e grants da funcao que ja existia, mas
-- reafirmar custa nada e protege contra o dia em que esta migration for a
-- primeira a rodar num banco limpo (recriacao do zero, ambiente novo).
ALTER FUNCTION app.registrar_ato_externo(text, text, text, jsonb) OWNER TO auditor_financeiro;
REVOKE ALL ON FUNCTION app.registrar_ato_externo(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_ato_externo(text, text, text, jsonb) TO app_financeiro;
