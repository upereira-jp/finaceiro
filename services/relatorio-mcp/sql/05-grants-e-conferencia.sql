-- =====================================================================
-- GRANTS + CONFERENCIA DE CATALOGO
-- Rodar SEMPRE por ultimo, e DE NOVO a cada view nova (o grant e por
-- objeto existente; nao ha default privilege aqui de proposito -- view
-- nova so fica legivel se alguem rodar isto, o que e a versao de banco
-- do "fail-closed").
-- =====================================================================

begin;

grant usage  on schema relatorio to relatorio_ai;
grant select on all tables in schema relatorio to relatorio_ai;   -- views entram aqui
grant execute on function relatorio.fn_ficha_cliente(uuid, uuid) to relatorio_ai;

-- A role NAO recebe execute nas mascaras: elas rodam dentro das views,
-- com direito do dono. Dar execute solto seria dar um oraculo de
-- normalizacao sem necessidade.
revoke all on function relatorio.mascara_documento(text) from public, relatorio_ai;
revoke all on function relatorio.mascara_telefone(text)  from public, relatorio_ai;
revoke all on function relatorio.mascara_email(text)     from public, relatorio_ai;
revoke all on function relatorio.endereco_grao(text, text) from public, relatorio_ai;
-- fn_ficha_cliente e SECURITY DEFINER: PUBLIC nao pode alcanca-la.
revoke all on function relatorio.fn_ficha_cliente(uuid, uuid) from public;
grant execute on function relatorio.fn_ficha_cliente(uuid, uuid) to relatorio_ai;

commit;

-- ------------------------------------------------------- conferencia
-- Mesmas perguntas que o servico faz no arranque (src/index.ts,
-- conferirRole). Rodar aqui mostra o resultado ANTES de existir senha.
do $bloco$
declare n int; nomes text; escreve int;
begin
  select count(*) into n from pg_roles where rolname = 'relatorio_ai' and (rolsuper or rolbypassrls);
  if n = 0 then raise notice 'ok  role sem SUPERUSER e sem BYPASSRLS';
  else raise warning 'FALHA relatorio_ai tem SUPERUSER ou BYPASSRLS -- a camada inteira perde o sentido'; end if;

  select count(*), string_agg(n2.nspname || '.' || c.relname, ', ')
    into escreve, nomes
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where c.relkind in ('r','v','m','p','f')
     and n2.nspname not in ('pg_catalog','information_schema')
     and (has_table_privilege('relatorio_ai', c.oid, 'INSERT')
       or has_table_privilege('relatorio_ai', c.oid, 'UPDATE')
       or has_table_privilege('relatorio_ai', c.oid, 'DELETE')
       or has_table_privilege('relatorio_ai', c.oid, 'TRUNCATE'));
  if escreve = 0 then raise notice 'ok  role nao escreve em objeto nenhum';
  else raise warning 'FALHA relatorio_ai pode ESCREVER em %: %', escreve, nomes; end if;

  select count(*), string_agg(n2.nspname || '.' || c.relname, ', ')
    into n, nomes
    from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where c.relkind in ('r','v','m','p','f')
     and n2.nspname not in ('pg_catalog','information_schema','relatorio','extensions','net','graphql','graphql_public','pgbouncer','vault')
     and has_table_privilege('relatorio_ai', c.oid, 'SELECT');
  if n = 0 then raise notice 'ok  role nao le nada fora do schema relatorio';
  else raise warning 'FALHA relatorio_ai alcanca % objeto(s) fora de relatorio: %', n, nomes; end if;

  select count(*) into n from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
   where n2.nspname = 'relatorio' and c.relkind = 'v' and has_table_privilege('relatorio_ai', c.oid, 'SELECT');
  raise notice 'ok  % view(s) legiveis em relatorio', n;
end
$bloco$;
