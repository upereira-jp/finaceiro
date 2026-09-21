-- =====================================================================
-- Camada de relatorio para IA -- FUNDACAO (schema, role, mascaras)
-- Banco: projeto Supabase do FINANCEIRO. Rodar como owner (postgres),
-- pelo SQL Editor do painel. Ordem: 01 -> 02 -> 03.
--
-- POR QUE UM SCHEMA SEPARADO, E POR QUE ESTAS VIEWS *NAO* LEVAM
-- security_invoker (leia antes de "corrigir" isso):
--
--   A CLAUDE.md 3 exige `security_invoker = true` em toda view de `public`
--   e `app` -- porque la a view e caminho do APP, e sem a opcao ela avalia
--   a RLS contra o DONO e anula FORCE ROW LEVEL SECURITY.
--
--   Aqui e o contrario, e de proposito. A role `relatorio_ai` nao e membro
--   de `app_financeiro`, nao tem policy nenhuma e NAO deve ter: ela nao
--   representa um usuario de tenant. O recorte dela e a LISTA DE TENANTS
--   DA IDENTIDADE, aplicada pelo servico. As views deste schema rodam com
--   direito do dono de proposito -- e esse o mecanismo que permite ler
--   varios tenants sem dar BYPASSRLS a ninguem.
--
--   A trava estrutural nao e a RLS: e o PRIVILEGIO. `relatorio_ai` so
--   enxerga `relatorio.*`. Nao alcanca tabela base, nao alcanca `public`,
--   nao escreve em lugar nenhum, e a sessao nasce read-only. O servico
--   confere isso NO ARRANQUE (mesma ideia de src/crm/conexao.ts) e recusa
--   subir se a role tiver ganhado poder.
--
--   CAT-4 (tests/catalogo.sql) varre apenas `public` e `app`, entao este
--   schema nao a faz falhar -- e isso e coincidencia feliz, nao licenca:
--   view NOVA em public/app continua exigindo security_invoker.
--
-- REVERTER TUDO (nao toca tabela, policy nem dado do app):
--   begin;
--   reassign owned by relatorio_ai to postgres;
--   drop owned by relatorio_ai;
--   drop role if exists relatorio_ai;
--   drop schema if exists relatorio cascade;
--   commit;
-- =====================================================================

begin;

create schema if not exists relatorio;
comment on schema relatorio is
  'Superficie de LEITURA para IA. Views com direito do dono (ver 01-fundacao.sql). '
  'Unica coisa que a role relatorio_ai alcanca.';

-- ---------------------------------------------------------------- role
-- Nasce NOLOGIN e SEM SENHA: a porta antes da senha. A credencial so e
-- ativada depois que o servico esta de pe e escutando no loopback --
--   alter role relatorio_ai login password '<senha-forte>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'relatorio_ai') then
    create role relatorio_ai nologin;
  end if;
end
$$;

-- Segunda tranca do "so leitura": mesmo que um grant errado apareca, todo
-- INSERT/UPDATE falha com 25006 antes de tocar a tabela.
alter role relatorio_ai set default_transaction_read_only = on;
-- O servico usa pool de 3. Folga de 2 para abrir um psql e diagnosticar
-- com o servico no ar.
alter role relatorio_ai connection limit 5;

grant usage on schema relatorio to relatorio_ai;
-- Nada de CREATE: a role nao cria objeto nenhum, nem aqui.
revoke create on schema relatorio from relatorio_ai;

-- ------------------------------------------------------------ mascaras
-- PII de cliente nao viaja em consulta de rotina. O mascarado existe para
-- CONFERIR ("e esse mesmo o CPF que termina em 231?"), nunca para
-- reconstituir. A ficha completa sai so por relatorio.fn_ficha_cliente(),
-- que o servico tranca atras da flag `pii` da identidade e registra na
-- trilha com o id do cliente.

create or replace function relatorio.mascara_documento(p text)
returns text language sql immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) < 4 then '•••'
    else repeat('•', length(regexp_replace(p, '\D', '', 'g')) - 3)
         || right(regexp_replace(p, '\D', '', 'g'), 3)
  end
$$;
comment on function relatorio.mascara_documento(text) is
  'CPF/CNPJ com os 3 ultimos digitos. Serve para conferir, nao para reconstituir.';

create or replace function relatorio.mascara_telefone(p text)
returns text language sql immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) < 6 then '•••'
    else left(regexp_replace(p, '\D', '', 'g'), 4)
         || repeat('•', length(regexp_replace(p, '\D', '', 'g')) - 6)
         || right(regexp_replace(p, '\D', '', 'g'), 2)
  end
$$;

create or replace function relatorio.mascara_email(p text)
returns text language sql immutable
set search_path = ''
as $$
  select case
    when p is null or position('@' in p) = 0 then null
    else left(p, 1) || '•••@' || split_part(p, '@', 2)
  end
$$;

-- Endereco vira GRAO GEOGRAFICO (municipio/UF) + flag de completude. Rua,
-- numero e CEP so na ficha, atras do gate de PII: e o par que identifica
-- uma pessoa fisica com a mesma forca que o documento.
create or replace function relatorio.endereco_grao(
  p_municipio text, p_uf text
) returns text language sql immutable
set search_path = ''
as $$
  select nullif(trim(coalesce(p_municipio, '') || case when p_uf is null then '' else '/' || p_uf end), '')
$$;

commit;
