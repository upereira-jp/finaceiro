-- MIGRATION 31 - OS INDICES QUE A ESCALA PEDE, E O TENANT SUSPENSO QUE ENTRAVA.
--
-- ============================================================================
-- DE ONDE VEM: A MEDICAO DE 14/08/2026 CONTRA A ESCALA-ALVO
--
-- O objetivo declarado pelo dono e a plataforma operar como ERP financeiro para
-- empresa de grande porte, com alto volume. Isso deixou de ser adjetivo e virou
-- numero: um banco limpo com as 30 migrations, semeado com **50.000 UCs, 50.000
-- contratos e 600.000 faturas** (453 MB), e `EXPLAIN ANALYZE` nas consultas
-- quentes.
--
-- O Postgres **nao cria indice para chave estrangeira** - ao contrario do MySQL -
-- e nenhuma `@@index` cobria as FKs deste schema. Foram achadas 26 FKs sem
-- indice; tres estao em caminho quente e as tres viraram seq scan de 50.000
-- linhas. As quatro abaixo sao as que o `EXPLAIN` comprovou, com o antes e o
-- depois medidos:
--
--   unidade_consumidora (tenant_id, cliente_id)          6,70 ms -> 0,16 ms
--   unidade_consumidora (tenant_id, usina_id)            6,50 ms -> 0,12 ms
--   contrato (tenant_id, unidade_consumidora_id)         8,96 ms -> 0,37 ms
--   fatura (tenant_id, usina_id, competencia)            (o join do split)
--
-- OS OUTROS 22 NAO ENTRAM AGORA, e a omissao e deliberada: eles servem a
-- INTEGRIDADE REFERENCIAL (o Postgres varre a filha a cada UPDATE/DELETE na
-- pai), e as tabelas pai deste schema nao sofrem DELETE - `REVOKE DELETE` e a
-- regra aqui. Criar 22 indices para um caminho que nao existe custa escrita em
-- toda insercao e nao paga nada. Quando um deles doer, ele entra com medicao
-- propria, como estes quatro.
--
-- `CONCURRENTLY` NAO E USADO, e isto e escolha com custo: producao tem 41 UCs e
-- 0 faturas, entao o lock de `CREATE INDEX` dura milissegundos. `CONCURRENTLY`
-- nao roda dentro de bloco transacional, e o `migrate deploy` envolve cada
-- migration numa transacao - usa-lo aqui exigiria quebrar a migration em duas e
-- perder a atomicidade por um lock que nao vai existir.

-- ================================================== 1. os quatro indices

/*
 * A UC POR CLIENTE. Caminho da tela de Clientes (as UCs de um cliente) e do
 * conector, que casa `rateio_clientes` com o cadastro.
 */
CREATE INDEX unidade_consumidora_cliente_idx
  ON unidade_consumidora (tenant_id, cliente_id);

/*
 * A UC POR USINA. Caminho do rateio (`GET /usinas/:id/rateio`) e da triagem de
 * faturamento, que junta UC com geracao pela usina.
 */
CREATE INDEX unidade_consumidora_usina_idx
  ON unidade_consumidora (tenant_id, usina_id);

/*
 * O CONTRATO POR UC. Caminho de `contrato-vigente` e da tela de Contratos.
 *
 * NAO E O MESMO que `contrato_vigente_unico_por_uc`: aquele e sobre a coluna
 * GERADA `uc_vigente`, que so tem valor quando o contrato esta ativo (R14) - e
 * por isso nao serve a consulta que quer TODOS os contratos de uma UC, inclusive
 * os encerrados, que e a que a tela faz para mostrar historico.
 */
CREATE INDEX contrato_uc_idx
  ON contrato (tenant_id, unidade_consumidora_id);

/*
 * A FATURA POR USINA E COMPETENCIA. Caminho do split e dos dois extratos
 * agregados (`repasse_por_dono_usina`, `comissao_por_originador`).
 */
CREATE INDEX fatura_usina_competencia_idx
  ON fatura (tenant_id, usina_id, competencia);

-- ============================== 2. TENANT SUSPENSO NAO DA MAIS SESSAO
--
-- ============================================================================
-- O DEFEITO, E ELE E DE UMA PALAVRA
--
-- `app.resolver_login` filtrava o tenant assim:
--
--     LEFT JOIN public.tenant t ON t.id = ut.tenant_id AND t.status = 'ativo'
--
-- Num LEFT JOIN o predicado **nao elimina a linha da esquerda** - ele so faz
-- `t.*` vir NULL. E `resolverLogin` (src/auth/sessao.ts) so descarta a linha
-- quando `tenant_id` ou `papel` sao nulos, e os dois vem de `ut`, nao de `t`.
--
-- MEDIDO em 14/08 contra o banco de sessao, com o tenant em `suspenso`: o
-- vinculo SOBREVIVE, com `razaoSocial: null`. A pessoa entra, escolhe a empresa
-- (que aparece sem nome na barra) e opera normalmente - a policy de isolamento
-- confere VINCULO, nao status do tenant.
--
-- O status `suspenso` existe para suspender. Um tenant suspenso que continua
-- faturando e um estado que nao significa nada.
--
-- INNER JOIN e o conserto, e ele e exato: quem nao tem tenant nenhum continua
-- resolvendo login (a linha de `usuario` sobrevive pelos LEFT JOINs anteriores),
-- e quem tem vinculo com tenant nao-ativo passa a nao ter aquele vinculo. O erro
-- que a pessoa recebe e `SemAcessoANenhumTenant`, que e verdade.

CREATE OR REPLACE FUNCTION app.resolver_login(p_auth_user_id uuid)
  RETURNS TABLE (
    usuario_id uuid, nome text, email text,
    tier text, tenant_id uuid, tenant_razao_social text, papel text
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT u.id, u.nome, u.email,
         pa.tier::text,
         ut.tenant_id, t.razao_social, ut.papel::text
  FROM public.usuario u
  LEFT JOIN public.plataforma_admin pa ON pa.usuario_id = u.id
  /*
   * O PAR ABAIXO E UM LEFT JOIN SOBRE UM INNER. O `usuario_tenant` continua
   * LEFT - quem nao tem vinculo nenhum ainda resolve login, e recebe o erro
   * nomeado da aplicacao em vez de "usuario nao existe". O `tenant` dentro dele
   * e INNER, entao vinculo com tenant nao-ativo desaparece em vez de vir com o
   * nome nulo.
   */
  LEFT JOIN (
    public.usuario_tenant ut
    JOIN public.tenant t ON t.id = ut.tenant_id AND t.status = 'ativo'
  ) ON ut.usuario_id = u.id AND ut.ativo
  WHERE u.auth_user_id = p_auth_user_id
    AND u.ativo
$$;

COMMENT ON FUNCTION app.resolver_login(uuid) IS
  'Bootstrap do login: unica funcao chamada SEM contexto de tenant. Devolve a '
  'identidade e os tenants ATIVOS a que a pessoa pertence, para o middleware montar o '
  'contexto. Nao devolve dado de negocio. Desde a migration 31 o tenant e INNER JOIN: '
  'com LEFT, tenant suspenso continuava dando vinculo com razao social nula.';
