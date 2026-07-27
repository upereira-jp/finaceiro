# RESUMO-SESSAO-6 — 27/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Aplicar o patch da sessão 5 e subir as 12 migrations no projeto Supabase novo (`sa-east-1`) |
| **Método** | PostgreSQL 16.14 local em container para validar antes de subir; Supabase **PostgreSQL 17.6** pelo session pooler; catálogo consultado direto, nunca por inspeção visual |
| **Achados** | 7, todos medidos |
| **Resultado** | **12 migrations aplicadas**, fingerprint 11/11 exato, F1 fechada do lado do banco |

---

## 1. `GRANT <role> TO CURRENT_USER` derruba o backend do Postgres no Supabase

O achado da sessão. Medido em PG 17.6, reproduzível em 2,1 s.

A sessão vizinha entrega a assinatura:

```
WARNING:  terminating connection because of crash of another server process
DETAIL:   The postmaster has commanded this server process to roll back the current
          transaction and exit, because another server process exited abnormally
          and possibly corrupted shared memory.
```

O postmaster **sobrevive** — `pg_postmaster_start_time()` não muda, ele mata os backends e roda recuperação. Por isso o sintoma chega ao Prisma apenas como `P1017 Server has closed the connection`, que não nomeia nada e manda a suspeita para timeout, pooler ou rede.

Recorte, statement a statement, cada um em transação com `ROLLBACK`:

| Statement | Resultado |
|---|---|
| `GRANT/REVOKE <role> TO/FROM CURRENT_USER` | 💥 crash |
| `GRANT <role> TO CURRENT_ROLE` | 💥 crash |
| `GRANT <role> TO SESSION_USER` | 💥 crash |
| `GRANT <role> TO postgres` (nome literal) | ✅ ok |
| `GRANT SELECT ON tenant TO CURRENT_USER` (privilégio) | ✅ ok |
| `SELECT CURRENT_USER` | ✅ ok |

**Não é o pooler.** O discriminador foi esconder o statement de qualquer parser de wire protocol:

```sql
DO $$ BEGIN EXECUTE 'GRANT app_financeiro TO CURRENT_USER'; END $$;   -- 💥 crash
DO $$ BEGIN EXECUTE 'GRANT app_financeiro TO postgres';     END $$;   -- ✅ ok
```

Dentro de `EXECUTE` o texto é string literal e o Supavisor não o enxerga. Morreu igual. Também morre nas duas portas, 5432 e 6543.

**Mecanismo provável — inferência, não medição.** Num `RoleSpec` de `CURRENT_USER`/`CURRENT_ROLE`/`SESSION_USER` o campo `rolename` é **NULL**; só `ROLESPEC_CSTRING` o preenche. Um hook de `ProcessUtility` que leia `rolename` num `GrantRoleStmt` sem checar `roletype` desreferencia NULL. Encaixa em tudo, inclusive em por que o grant de *privilégio* sobrevive: é outro nó de parse (`GrantStmt`).

**Duas ocorrências na migration 10, linhas 127 e 447** — não uma. Achar só a primeira teria custado outro ciclo inteiro. Trocadas por:

```sql
DO $$ BEGIN EXECUTE format('GRANT auditor_financeiro TO %I WITH SET TRUE', current_user); END $$;
```

Preserva a intenção — conceder a quem roda a migration — sem fixar `postgres`, que não é o dono em todo ambiente. Verificado: `MEMBER`, `USAGE` e `SET` todos verdadeiros, e `SET ROLE auditor_financeiro` funciona.

**É bug do lado do Supabase, e derruba todas as sessões da instância.** Num projeto com tráfego, tira o banco do ar. Vale abrir com eles.

## 2. É a causa raiz da "migration 10 pela metade" — e a prova estava no `schema.prisma` do patch

A migration 10 tem 510 linhas. O `GRANT` fatal estava na **127**. O que ela cria, em ordem:

| Objeto | Linha | Na previsão do patch? |
|---|--:|---|
| `regra_repasse` | 34 | ✅ **sim** |
| — `GRANT … TO CURRENT_USER` — | **127** | — |
| `auditoria` | 129 | ❌ não |
| `acesso_plataforma_log.xact_id` | 264 | ❌ não |
| `distribuidora` | 366 | ❌ não |
| as 3 FKs de `distribuidora` | 397, 399, 401 | ❌ não |

**O corte é exatamente na linha 127.** Não é coincidência, é assinatura.

A cadeia fecha inteira:

1. O `GRANT` derruba o backend.
2. Rodada pelo **SQL Editor, que não é transacional**, tudo antes da 127 persistiu e o resto se perdeu. É a "migration 10 pela metade" do projeto `us-west-2` — e a causa não era só a não-transacionalidade do Editor, era este crash.
3. O `schema.prisma` do patch foi tirado por `db pull` **daquele banco meio-aplicado**. Por isso a previsão errava exatamente nos objetos pós-127. Não estava mal escrita: estava lida de um banco corrompido.
4. No projeto novo, via `migrate deploy` (transacional por migration), o banco fez **rollback inteiro** em vez de meia-aplicação. Foi por isso que o encontrei limpo, com 17 tabelas e nenhum objeto órfão.

O **PONTO DE PARADA 2** disparou por isso: o diff do `db pull` não veio vazio. O `schema.prisma` passou a vir do banco, que é a fonte.

## 3. O Supabase habilita RLS sozinho — e do jeito que a regra 3 chama de falha

A migration parou na seção 7, no **invariante 19** dela mesma:

```
ERROR: inv.19 SECURITY DEFINER fora da lista branca: rls_auto_enable
```

E o invariante estava certo. `public.rls_auto_enable` é da plataforma: `SECURITY DEFINER`, disparada pelo event trigger `ensure_rls` em `ddl_command_end`, roda `ALTER TABLE … ENABLE ROW LEVEL SECURITY` em toda tabela nova de `public`.

**Ela habilita RLS mas não cria policy e não põe `FORCE`.** É exatamente o estado das 82 de 151 tabelas do CRM — nega tudo em silêncio. Para nós é inócuo hoje porque toda migration declara `ENABLE` + `FORCE` + policy, e o `CAT-3` confere. Mas uma tabela futura em `public` que esqueça a RLS **não fica sem RLS: fica com RLS sem policy**, por default da plataforma e não por desenho nosso.

Entrou na lista branca porque não controlamos nem podemos remover a função — dropar o trigger é brigar com a plataforma, que pode recriá-lo. Registrado como **`MT-09`**.

Inventário completo de `SECURITY DEFINER` em `app`/`public` no Supabase: 3 nossas (`membros_do_tenant`, `resolver_login`, `tem_vinculo_no_tenant`), mais as 2 que a migration 10 cria, mais `rls_auto_enable`. É a única de fora.

## 4. O host direto do Supabase é IPv6-only e não conecta de Codespaces nem de CI

`db.<ref>.supabase.co` resolve **só em AAAA** (`2600:1f1e:…`), nenhum registro A. O ambiente não tem endereço IPv6 global nem rota default v6 — `connect()` falha com *Network is unreachable* antes de qualquer autenticação. A senha ser válida não muda nada.

`aws-0-sa-east-1.pooler.supabase.com` resolve em IPv4 normalmente. O caminho é o **session pooler na 5432**; a 6543 é transaction pooler e não serve para `migrate` — não falha com mensagem útil, pendura.

Isso custou um ciclo antes de o `.env` ser corrigido, e está documentado no `.env.example`.

## 5. `npm test` estava quebrado por script, não por código

`"test:middleware"` chamava `tests/middleware.ts` direto e pulava `tests/middleware.sh`, que é quem cria as roles `app_pool`, `app_tenant_a` e `app_tenant_b`. Resultado: `28P01 password authentication failed for user "app_pool"` — falha que parecia de banco e era de `package.json`. Rodada como o `README` manda, a suíte sempre passou 12/12.

## 6. Número mágico em teste envelhece — `CAT-7`

As duas últimas linhas do `run.sh` conferiam *"FKs compostas, esperado 9"*. O banco tem **10**, e 10 é o correto: a décima entrou com `regra_repasse` na `SPEC-001` v2.9. Contagem fixa em teste treina o time a corrigir o número quando o teste acusa.

A forma que não envelhece é a própria regra 2, sem contagem: **nenhuma FK de uma coluna pode apontar para tabela que tenha `tenant_id`**. Se o destino tem `tenant_id`, é entidade de negócio e a referência tem que ser composta.

Verificado nos dois sentidos — devolve `nenhuma` contra o banco correto, e acusa `_viola_cliente_id_fkey -> cliente` contra uma violação plantada. Invariante que não sabe falhar não vale nada (regra 8).

As FKs simples são **20**: 14 para `tenant`, 3 para `usuario`, 3 para `distribuidora` — nenhuma das três com `tenant_id`, então zero falso-positivo. Fecha em 30 = 20 + 10.

## 7. A `SPEC-001` se contradiz na contagem de FKs

A §3.4 linha 320 registra que *"a décima entrou na v2.9"*, e a linha 488 diz *"as dez FKs compostas"*. Mas o checklist da linha 536 e a tabela de testes da linha 565 continuam dizendo **nove**. Consequência pela regra 8: a décima fica como invariante sem teste nomeado.

Registrado como **`Q-SPEC001-08`**. A SPEC **não foi editada** — é documento de decisão e a correção tem dono.

---

## Estado dos testes

```
documento         17 verificações      0 falhas
isolamento        20 verificações      0 falhas
RBAC              15 verificações      0 falhas
regras            12 verificações      0 falhas
auditoria         29 verificações      0 falhas
catalogo           7 invariantes       CAT-1 a CAT-7, nenhuma falha
middleware        12 verificações      0 falhas
sessao            15 verificações      0 falhas
repos/cliente     17 checks            todas passaram
repos/contrato    10 checks            todas passaram
tsc --noEmit      limpo
```

`npm test` sai com `EXIT=0`, com o client regerado do banco real — não da previsão.

**Fingerprint contra o Supabase: 11/11 exato.**

```
tabelas 19 · colunas 177 · fk 30 · unique 19 · indices 49 · idx_parciais 3
policies 24 · func_app 14 · rls_forcada 18 · check 12 · enums 17
```

Escopo que fecha, e vale anotar porque três métricas divergem `+1` se for lido errado: **excluir `_prisma_migrations`**, e contar colunas de tabelas **e views** — 170 das 19 tabelas + 7 da view `rateio_por_usina` = 177.

Tudo que faltava no projeto antigo, conferido presente no novo: `auditoria`, `distribuidora`, `app.auditar`, **16** triggers `auditar_*`, `acesso_plataforma_log.xact_id`, 3 FKs de `distribuidora`, 24 policies.

`unidade_consumidora.contrato` é **LISTA** — `ContratoListRelationFilter` ×2, zero to-one, confirmado nos tipos gerados depois do `db pull` real.

---

## Fila da próxima sessão

**1. 🔴 A role LOGIN de runtime. É o portão — nada de runtime anda antes dela.**

Medido hoje: a role `postgres` tem **`rolbypassrls = true`**. Enquanto o app conectar como ela, as 24 policies e o `FORCE ROW LEVEL SECURITY` **não valem nada**. E o modo de falha é o pior: os testes de isolamento passam contra o Postgres local, o app funciona, e o vazamento entre tenants só aparece quando o segundo cliente entrar em produção.

```sql
CREATE ROLE app_financeiro_login LOGIN PASSWORD '<senha>'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
GRANT app_financeiro TO app_financeiro_login;

-- conferência que não se pula. Se vier t, a role está errada:
SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_financeiro_login';
```

A role não nasce em migration nenhuma, de propósito.

**2. `DATABASE_URL` no `.env`**, apontando para essa role em **session mode, porta 5432**. Formato no `.env.example`. Não usar o `financeiro-sessao-5.patch` da raiz como referência: é a versão anterior e manda para o 6543 com `pgbouncer=true`, que é o PgBouncer em modo transação — sem cobertura, e reabriria o `ADR-0003` inteiro.

**3. Repositórios de UC, usina, originador e rateio**, no molde de `src/repos/cliente.ts` e `contrato.ts`. Depois os endpoints com a matriz de papéis.

**4. Reportar ao Supabase** o crash do `GRANT … TO CURRENT_USER`.

---

## Pendências gerais

| Item | Estado | Dono |
|---|---|---|
| Role LOGIN de runtime + `DATABASE_URL` | 🔴 bloqueia todo o runtime | Vinicius |
| Reunião com o contador | 🔴 não ocorreu. Risco aceito, rebaixado para bloqueio de F2/F3. Os 10 campos estão no `RESUMO-SESSAO-3` §5 | Vinicius |
| `originador_tipo` não distingue sócio | 🔴 depende do contador. `originador_tipo_no_fechamento` já congela a classificação por contrato | Vinicius |
| POP-01 — o denominador | 🔴 é a base de contratos vigentes com UC homologada, não nenhum dos três números do CRM | Vinicius |
| PgBouncer em modo *transaction* | 🔴 sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` reabre inteiro | — |
| F-01b | 🔴 nenhuma etapa do funil marca o cliente pagante. Decisão de F2 | Vinicius |
| `MT-09` — `rls_auto_enable` | 🟡 aceitar como risco coberto pelo `CAT-3`, ou tratar no provisionamento (`ADR-0004`) | Vinicius |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 corrigir linhas 536 e 565 | Vinicius |
| Bug do `GRANT` no Supabase | 🟡 reportar | Vinicius |
| `financeiro-sessao-5.patch` versionado na raiz | 🟡 veio do commit `7e77bda` e o `.gitignore` não desrastreia arquivo já versionado. `git rm --cached` resolve. É a versão **anterior** do patch | Vinicius |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório | dev do CRM |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna | dev do CRM |
| Apagar o projeto Supabase antigo (`us-west-2`) | 🟡 | Vinicius |
| Projeto Supabase `sa-east-1` com as 12 | ✅ **fechado hoje** | — |
| `prisma generate` e os dois primeiros repositórios | ✅ **fechado hoje** | — |

---

## Nota de método

Duas conclusões desta sessão foram **retiradas depois de medidas**, no mesmo padrão que a sessão 5 registrou.

**A primeira:** concluí que o crash do `GRANT` era do Supavisor e recomendei o add-on de IPv4 para contorná-lo por rede. Estava errado, e o add-on não teria resolvido nada. O que derrubou a hipótese foi esconder o statement dentro de `EXECUTE`: se fosse parser de wire protocol, a string literal passaria. Não passou. A recomendação de rede chegou a ser escrita antes de existir esse teste — evidência insuficiente sustentando uma inferência plausível, exatamente como o resumo anterior descreveu.

**A segunda:** o primeiro fingerprint acusou três métricas divergindo `+1` e eu quase reportei como migration incompleta. Não era divergência, era escopo mal definido: `_prisma_migrations` entrando na conta e as colunas da view `rateio_por_usina` fora dela. A contagem estava certa; a pergunta é que estava errada.

O padrão se repete e vale nomear: **o inventário por contagem fecha, a hipótese sobre a causa não.** Nas duas vezes o caminho foi o mesmo — parar de raciocinar sobre o mecanismo e desenhar o experimento que separa as hipóteses.

**Nota de processo.** O patch chegou duas vezes e nenhuma limpa: colado no chat veio com **zero quebras de linha** (67.320 bytes numa linha só, irrecuperável sem adivinhar milhares de fronteiras) e, como arquivo, sem o newline final — o que o `git apply` reporta como `corrupt patch at line 1378` num arquivo de 1377 linhas, mensagem que sugere truncamento quando o conteúdo estava íntegro. Para patch, o caminho é arquivo por upload ou URL, nunca colagem.
