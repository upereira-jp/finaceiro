-- =====================================================================
-- CONFERENCIA que DEVOLVE LINHAS (nao notice)
--
-- O `05` termina num bloco DO que usa RAISE NOTICE, e o editor SQL do painel
-- Supabase nao mostra notice -- a conferencia passava batida justo onde ela
-- e mais necessaria (a primeira aplicacao, feita pelo painel). Este arquivo
-- responde as MESMAS perguntas em forma de tabela.
--
-- Rodar depois do 05. Nao altera nada.
-- Esperado: ok = true nas cinco linhas.
-- =====================================================================

select 'role sem SUPERUSER e sem BYPASSRLS'                      as verificacao,
       not (r.rolsuper or r.rolbypassrls)                        as ok,
       format('rolsuper=%s bypassrls=%s canlogin=%s (login=false ate voce dar a senha)',
              r.rolsuper, r.rolbypassrls, r.rolcanlogin)         as detalhe
  from pg_roles r where r.rolname = 'relatorio_ai'

union all
select 'role nao ESCREVE em objeto nenhum',
       count(*) = 0,
       coalesce(string_agg(n.nspname || '.' || c.relname, ', '), 'nenhum objeto com escrita')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r','v','m','p','f')
   and n.nspname not in ('pg_catalog','information_schema')
   and (has_table_privilege('relatorio_ai', c.oid, 'INSERT')
     or has_table_privilege('relatorio_ai', c.oid, 'UPDATE')
     or has_table_privilege('relatorio_ai', c.oid, 'DELETE')
     or has_table_privilege('relatorio_ai', c.oid, 'TRUNCATE'))

union all
-- Schemas de extensao ficam de fora: o que a role tem neles vem de grant a
-- PUBLIC feito pela extensao, nao de concessao nossa, e nao se remove sem
-- desinstalar a extensao. O servico declara isso no boot em vez de esconder.
select 'role nao LE nada fora do schema relatorio',
       count(*) = 0,
       coalesce(string_agg(n.nspname || '.' || c.relname, ', '), 'nada fora de relatorio')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r','v','m','p','f')
   and n.nspname not in ('pg_catalog','information_schema','relatorio',
                         'extensions','net','graphql','graphql_public','pgbouncer','vault')
   and has_table_privilege('relatorio_ai', c.oid, 'SELECT')

union all
select 'views legiveis em relatorio (esperado 43)',
       count(*) = 43,
       count(*) || ' view(s) com SELECT para relatorio_ai'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'relatorio' and c.relkind = 'v'
   and has_table_privilege('relatorio_ai', c.oid, 'SELECT')

union all
select 'ficha de cliente executavel pela role (e so por ela)',
       has_function_privilege('relatorio_ai', p.oid, 'EXECUTE')
         and not has_function_privilege('public', p.oid, 'EXECUTE'),
       format('relatorio_ai=%s public=%s',
              has_function_privilege('relatorio_ai', p.oid, 'EXECUTE'),
              has_function_privilege('public', p.oid, 'EXECUTE'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'relatorio' and p.proname = 'fn_ficha_cliente';
