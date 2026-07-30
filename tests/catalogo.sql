-- Invariantes verificadas por CONSULTA AO CATALOGO, nunca por revisao de PR.
-- CLAUDE.md 2, 3 e 11. Uso: psql -d <db> -f tests/catalogo.sql
--
-- Existe porque tres furos de 26/07 eram todos invisiveis em code review e todos
-- triviais no catalogo: o indice parcial que virou relacao 1-1, a tabela sem
-- UNIQUE composto que derrubou o `prisma generate`, e a tabela de referencia que
-- fazia o teste de RLS imprimir falha sem quebrar o build.
\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE falhas int := 0; n int; nomes text;
BEGIN
  -- ------------------------------------------------------------------ CAT-1
  -- CLAUDE.md 11. O `db pull` do Prisma 7.9 ignora o predicado do indice parcial
  -- ao inferir cardinalidade: unique parcial cobrindo EXATAMENTE as colunas de
  -- uma FK vira relacao to-one, e a relacao passa a devolver linha arbitraria.
  -- Medido: R$ 111,00 de um suspenso onde o vigente valia R$ 789,00.
  SELECT count(*), string_agg(DISTINCT i.indexrelid::regclass::text, ', ')
    INTO n, nomes
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = t.relnamespace AND ns.nspname = 'public'
  WHERE i.indisunique AND i.indpred IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = i.indrelid AND c.contype = 'f'
        AND (SELECT array_agg(x ORDER BY x) FROM unnest(c.conkey) x)
          = (SELECT array_agg(y ORDER BY y) FROM unnest(i.indkey::smallint[]) y)
    );
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-1 nenhum indice parcial cobre exatamente o conjunto de colunas de uma FK';
  ELSE RAISE WARNING 'FALHA CAT-1 indice parcial sobre conjunto de FK (vira relacao 1-1 no db pull): %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-2
  -- CLAUDE.md 2, na forma que pega o furo real: FK composta (tenant_id, X) onde X
  -- e unico SOZINHO mas o par nao e. A introspecacao infere 1-1 pelo X, emite a
  -- relacao pelo par, e o Prisma recusa o schema inteiro com P1012. Foi o que
  -- aconteceu com cliente_estado_crm, cuja PK se chama cliente_id e nao id.
  SELECT count(*), string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    INTO n, nomes
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = t.relnamespace AND ns.nspname = 'public'
  WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 2
    AND 'tenant_id' = (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1])
    AND EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisunique
                  AND i.indnatts = 1 AND i.indkey[0] = c.conkey[2])
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisunique
                      AND i.indnatts = 2 AND i.indkey[0] = c.conkey[1] AND i.indkey[1] = c.conkey[2]);
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-2 toda FK composta tem UNIQUE composto do lado definidor';
  ELSE RAISE WARNING 'FALHA CAT-2 FK composta sem UNIQUE composto (P1012 no generate): %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-3
  -- CLAUDE.md 3. O criterio e TER tenant_id, nao o nome da tabela: `distribuidora`
  -- e lista de referencia publica sem tenant_id e sem RLS, de proposito, e o teste
  -- antigo a acusava por nome. Acusacao errada treina o time a ignorar o teste.
  SELECT count(*), string_agg(c.relname, ', ') INTO n, nomes
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relkind = 'r'
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0)
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-3 toda tabela com tenant_id tem RLS, FORCE e ao menos uma policy';
  ELSE RAISE WARNING 'FALHA CAT-3 tabela com tenant_id sem RLS+FORCE+policy: %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-4
  -- Invariante 13: view sem security_invoker avalia a RLS contra o DONO e anula
  -- FORCE ROW LEVEL SECURITY e as policies de uma vez. Medido: 2 linhas de todos
  -- os tenants por uma view, 0 pela tabela.
  SELECT count(*), string_agg(c.relname, ', ') INTO n, nomes
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname IN ('public','app')
  WHERE c.relkind = 'v'
    AND NOT coalesce((SELECT option_value::boolean FROM pg_options_to_table(c.reloptions)
                      WHERE option_name = 'security_invoker'), false);
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-4 toda view declara security_invoker = true';
  ELSE RAISE WARNING 'FALHA CAT-4 view sem security_invoker (anula a RLS das tabelas base): %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-5
  -- CLAUDE.md 1: dinheiro e Int em centavos. Float e proibido em toda camada, e
  -- coluna monetaria carrega o sufixo. As duas metades sao verificaveis.
  SELECT count(*), string_agg(table_name || '.' || column_name || ':' || data_type, ', ')
    INTO n, nomes
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((column_name LIKE '%\_centavos' AND data_type NOT IN ('integer','bigint'))
      OR (data_type IN ('double precision','real')));
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-5 coluna _centavos e inteira e nao existe float em nenhuma tabela';
  ELSE RAISE WARNING 'FALHA CAT-5 dinheiro fora do contrato Int/centavos: %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-6
  -- R14 no catalogo: a coluna que carrega a regra e GERADA. Se alguem a tornar
  -- gravavel, o repositorio passa a poder mentir sobre qual contrato ocupa a UC.
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contrato'
    AND column_name = 'uc_vigente' AND is_generated = 'ALWAYS';
  IF n = 1 THEN RAISE NOTICE 'ok  CAT-6 contrato.uc_vigente e GENERATED ALWAYS - a R14 nao depende da aplicacao';
  ELSE RAISE WARNING 'FALHA CAT-6 contrato.uc_vigente nao e coluna gerada'; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-7
  -- CLAUDE.md 2, sem numero magico. O teste antigo contava "FKs compostas,
  -- esperado 9" e envelheceu no mesmo dia em que a decima entrou com
  -- regra_repasse (SPEC-001 v2.9). Numero fixo em teste treina o time a ignorar o
  -- teste: quando ele acusa, a primeira reacao e corrigir o numero.
  -- A forma que nao envelhece e a propria regra. Se o destino tem tenant_id, ele e
  -- entidade de negocio e a referencia TEM que ser composta; uma FK de coluna
  -- unica para ela e caminho cross-tenant aberto. O ADR-0003 mediu o banco
  -- aceitando contrato do tenant A apontando para cliente do B.
  -- Nao ha falso-positivo por desenho: as FKs simples legitimas apontam para
  -- tenant, usuario e distribuidora, e nenhuma das tres tem tenant_id.
  SELECT count(*), string_agg(c.conrelid::regclass::text || '.' || c.conname
                              || ' -> ' || c.confrelid::regclass::text, ', ')
    INTO n, nomes
  FROM pg_constraint c
  JOIN pg_namespace ns ON ns.oid = c.connamespace AND ns.nspname = 'public'
  WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid
                  AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped);
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-7 nenhuma FK de uma coluna aponta para tabela com tenant_id';
  ELSE RAISE WARNING 'FALHA CAT-7 FK simples para entidade de negocio (atravessa tenant): %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-8
  -- CLAUDE.md 3, agora SEM o filtro por tenant_id - e o filtro era o furo.
  --
  -- O CAT-3 so olha tabela COM tenant_id, e o comentario dele nomeia
  -- `distribuidora` como exemplo do que ignorar, "sem tenant_id e sem RLS, de
  -- proposito". Medido em 27/07 contra producao: aquela premissa e FALSA la. O
  -- event trigger rls_auto_enable do Supabase (MT-09) habilitou RLS na tabela
  -- sozinho, sem policy e sem FORCE, e a role de runtime passou a ler zero
  -- linhas dela. RLS com zero policies nega tudo em silencio, tenha a tabela
  -- tenant_id ou nao - a regra 3 nao fala de tenant_id, fala de RLS sem policy.
  --
  -- LISTA BRANCA NOMINAL, nunca por padrao de nome: `_prisma_migrations` e
  -- bookkeeping do proprio Prisma, escrita e lida so pelo dono do schema pela
  -- DIRECT_URL. Entra aqui porque nao a controlamos, do mesmo modo que o
  -- invariante 19 admite o rls_auto_enable.
  --
  -- ATENCAO AO ALCANCE: a suite roda em PG16 local, que NAO tem o event trigger
  -- da plataforma. Este invariante verde localmente nao prova producao. Rode-o
  -- tambem la, que e leitura pura:  psql "$DIRECT_URL" -f tests/catalogo.sql
  SELECT count(*), string_agg(c.relname, ', ') INTO n, nomes
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    AND c.relname <> '_prisma_migrations';
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-8 nenhuma tabela com RLS habilitada e zero policies';
  ELSE RAISE WARNING 'FALHA CAT-8 RLS habilitada sem policy - nega tudo em silencio: %', nomes; falhas := falhas + 1; END IF;

  -- ------------------------------------------------------------------ CAT-9
  /*
   * CLAUDE.md 11, no furo que a Q-CLAUDE11-01 abriu e que o CAT-1 NAO cobre.
   *
   * O CAT-1 acusa indice unico parcial que cobre EXATAMENTE as colunas de uma
   * FK, porque ali o `db pull` infere relacao to-one. Esse e um caso. O outro e
   * o que a regra 11 nasceu para impedir e que voltou a existir:
   *
   *   com `previewFeatures = ["partialIndexes"]` ligado no generator, todo
   *   `@@unique` parcial VOLTOU a ser chave de `findUnique`. Medido em 27/07 nos
   *   tipos gerados. A regra 11 afirma que "o Prisma ja exclui parcial das
   *   chaves de findUnique - verificado no DMMF", e isso deixou de ser verdade.
   *
   * O QUE SEPARA O PARCIAL PERIGOSO DO INOFENSIVO e o PREDICADO, e nao o fato de
   * ser parcial:
   *
   *   WHERE documento IS NOT NULL   para qualquer valor nao-nulo da chave existe
   *                                 no maximo UMA linha. `findUnique` por ela
   *                                 devolve uma linha ou nenhuma - correto.
   *
   *   WHERE status = 'ativo'        VARIAS linhas compartilham a chave (as
   *                                 inativas), e o Prisma devolve uma ARBITRARIA.
   *                                 E o `contrato_ativo_unico_por_uc` que
   *                                 originou a regra 11: R$ 111,00 de um
   *                                 suspenso onde o vigente valia R$ 789,00.
   *
   * Entao o invariante nao e "nao ha unique parcial" - os tres que existem sao
   * legitimos. E "todo unique parcial tem predicado IS NOT NULL".
   *
   * A OUTRA METADE E CODIGO, e mora em `tests/regra11.ts`: nenhum arquivo de
   * `src/` navega por chave parcial. O catalogo nao ve o codigo, e o codigo nao
   * ve o catalogo - por isso sao duas.
   */
  SELECT count(*), string_agg(i.indexrelid::regclass::text || ' WHERE ' ||
                              pg_get_expr(i.indpred, i.indrelid), ', ')
    INTO n, nomes
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace ns ON ns.oid = t.relnamespace AND ns.nspname = 'public'
  WHERE i.indisunique AND i.indpred IS NOT NULL
    AND pg_get_expr(i.indpred, i.indrelid) !~ '^\(?[a-z_]+ IS NOT NULL\)?$';
  IF n = 0 THEN RAISE NOTICE 'ok  CAT-9 todo indice unico parcial tem predicado IS NOT NULL - nenhum devolve linha arbitraria por findUnique';
  ELSE RAISE WARNING 'FALHA CAT-9 unique parcial com predicado que NAO e IS NOT NULL (varias linhas compartilham a chave, e com partialIndexes ligado ela e chave de findUnique): %', nomes; falhas := falhas + 1; END IF;

  IF falhas = 0 THEN RAISE NOTICE 'catalogo: 9 invariantes, nenhuma falha';
  ELSE RAISE WARNING 'catalogo: % FALHA(S)', falhas; END IF;
END $bloco$;
