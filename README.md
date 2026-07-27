# Financeiro G3 Solar

Sistema financeiro multi-tenant da G3 Solar: faturamento de crédito de energia, comissão de originadores e repasse a donos de usina. O CRM ao lado é **fonte de leitura e nada mais** — nenhuma linha dele é modificada por este sistema.

| Campo | Valor |
|---|---|
| **Dono** | Vinicius Leal |
| **Fase atual** | F0 fechada · **F1 em execução, e não fecha só com código nosso.** 15 migrations no Supabase `sa-east-1`, role de runtime, composition root, seis repositórios, 37 rotas, auth próprio medido ponta a ponta contra o Supabase real, conector do CRM construído e testado, e os 8 invariantes de catálogo verdes **contra produção**. A `Q-VIEWS-01` fechou no mesmo dia e o **invariante 9 está cumprido**. Falta `CRM_DATABASE_URL` e o primeiro ciclo real. Ver a tabela de critérios abaixo |
| **Atualizado** | 27/07/2026 |

---

## Comece por aqui

Nesta ordem. Cada documento pressupõe o anterior.

1. **`RESUMO-SESSAO-8.md`** — estado atual, a fila da próxima sessão e as pendências gerais com dono nomeado
2. **`CLAUDE.md`** — as onze regras inegociáveis. Antes de qualquer linha de código
3. **`PRD-v2.2.md`** §7 e §8 — fronteira com o CRM
4. **`adr/ADR-0003-contexto-de-tenant.md`** (r2) — como o isolamento funciona de fato, e a que preço
5. **`SPEC-001-fundacao.md`** (v2.9) — a spec da F1. §3.2 é o contrato do middleware; §3.4 é a lista das **dez** FKs compostas — as linhas 536 e 565 ainda dizem nove, e é a `Q-SPEC001-08`
6. **`GLOSSARIO.md`** — se um termo está lá, é assim que ele se chama em spec, em código e em conversa

`QUESTOES.md` se consulta sob demanda, e é onde toda lacuna vira entrada (regra 10). Os `RESUMO-SESSAO-2` a `-7` são a trilha datada: cada um diz o que foi medido, **o que foi retirado depois de medido**, e o que ficou na fila.

---

## Hierarquia normativa

Em conflito, a ordem é:

```
CLAUDE.md  →  PRD-v2.2  →  ADRs  →  SPECs
```

Uma regra do `CLAUDE.md` não é flexibilizada por spec, por prazo ou por conveniência de implementação. É alterada lá, com versão nova, ou não é alterada.

---

## Estrutura

```
CLAUDE.md                    regras inegociaveis — camada mais alta
PRD-v2.2.md                  fonte de verdade do produto
GLOSSARIO.md                 vocabulario unico (rev. 3)
QUESTOES.md                  registro unico de questoes abertas, com taxonomia de severidade
SPEC-001-fundacao.md         spec da F1 (v2.9)
SPEC-002-conector.md         spec do conector (v1.0 — 4.3 travada na AUD-07)
_TEMPLATE-SPEC.md            anatomia fixa das specs
RESUMO-SESSAO-2.md           passagem da sessao 2
RESUMO-SESSAO-3.md           passagem da sessao 3
RESUMO-SESSAO-4.md           passagem da sessao 4
RESUMO-SESSAO-5.md           passagem da sessao 5 — generate destravado, R14 e os repos
RESUMO-SESSAO-6.md           passagem da sessao 6 — as 12 migrations e o crash do GRANT
RESUMO-SESSAO-7.md           passagem da sessao 7 — role de runtime, 37 rotas, auth
RESUMO-SESSAO-8.md           passagem da sessao 8 — comece por aqui
VIEWS-PROPOSTAS-r2.sql       DDL proposta ao dev do CRM. EXECUTADA - as 8 views
                             existem e expoem crm_tenant_id desde 27/07 (Q-VIEWS-01)
PROMPT-dev-crm-rodada3-...   o pedido em aberto ao dev do CRM (27/07)
.env.example                 formato do .env. Le os comentarios: a porta importa

adr/
  ADR-0002-...               modelo de tenant e de cliente, pos-auditoria
  ADR-0001-...               estrategia de multi-tenancy: banco unico, RLS por linha (retroativa)
  ADR-0003-...               contexto de tenant: SET LOCAL por transacao (r2, aceita)
  ADR-0004-...               provisionamento: organizacao, dominio e host (aceita)

auditoria/
  P7-...                     topologia de funis do CRM
  P8-...                     reverificacao de 24/07
  PATCH-citacoes-...         reaponta as 18 citacoes ao CLAUDE.md que nunca existiu
  reparo-citacoes-....patch

spike-adr0003/               21 testes, tres variantes de contexto de tenant. ./run.sh
spike-transacao/             12 testes de $transaction/$extends do Prisma sobre RLS. ./run.sh

src/app.ts                   COMPOSITION ROOT - o unico lugar que instancia client,
                             pool e adapter. Recusa o arranque se a role tiver BYPASSRLS
src/db/pools.ts              os dois pools: transacional 8/15s, relatorio 2/60s
src/db/contexto.ts           ponto UNICO de emissao do contexto. RBAC e trilha
src/db/tipado.ts             devolve os 19 modelos aos repos sem contexto.ts conhece-los
src/auth/sessao.ts           login, escolha de tenant validada, caminho de plataforma
src/repos/cliente.ts         cadastro, busca por documento, baixa logica
src/repos/contrato.ts        R14 e a ORDEM da renovacao: encerra o velho antes de inserir
src/repos/unidade_consumidora.ts  cadastro da UC. NAO edita rateio - ver rateio.ts
src/repos/usina.ts           usina e geracao mensal. Decimal entra como STRING
src/repos/originador.ts      documento OBRIGATORIO aqui; R20 congela no contrato
src/repos/rateio.ts          R11, o teto de 100% por usina. Unico caminho de escrita
src/http/rotas.ts            as 37 rotas. A matriz de papeis NAO e aplicada aqui
src/http/servidor.ts         node:http puro. O Autenticador vem de FORA, por injecao
src/http/erros.ts            erro de dominio -> HTTP. 500 nao vaza mensagem interna
src/auth/jwt.ts              JWT do Supabase por node:crypto. O alg sai da CHAVE, nao do header
src/auth/autenticador.ts     Bearer -> auth_user_id. Auth PROPRIO (MT-06 resolvida)
src/dominio/documento.ts     CPF e CNPJ, inclusive alfanumerico (31/07/2026)
src/crm/conexao.ts           pool do CRM. RECUSA o arranque se a credencial tiver
                             escrita, BYPASSRLS ou alcance fora de financeiro.*
src/crm/leitura.ts           PONTO UNICO de leitura. SQL constante, lista fechada
                             das 8 views. Nao ha funcao que aceite nome de tabela
src/crm/sincronizacao.ts     o ciclo: dedup, idempotencia, recusas contadas e a
                             reconciliacao em tres classes. Porta INJETADA
prisma/migrations/           QUINZE, em ordem. 13 fecha Q-AUDIT-01 e Q-DISTRIB-01;
                             14 traz conector_execucao; 15 corrige o gatilho de
                             auditoria que a 14 esqueceu (o teste G2 acusou)
prisma/schema.prisma         vem do `db pull`. NAO editar a mao - ver regra 11
prisma/seed/                 regra_comissao e tarifa, idempotente
scripts/bootstrap-plataforma-admin.sql
                             PROVISIONAMENTO, nao migration. O primeiro admin de
                             plataforma. Exige -v modo=ensaio ou -v modo=valendo
scripts/verificar-auth-real.ts
                             auth ponta a ponta contra o Supabase real. Sem token
                             no stdin faz so o preflight do JWKS, que nao pede
                             credencial. `npm run auth:verificar`
tests/catalogo.sql           CAT-1 a CAT-8: as regras 1, 2, 3 e 11 por catalogo.
                             Leitura pura - RODE TAMBEM contra producao:
                             psql "$DIRECT_URL" -f tests/catalogo.sql
tests/                       283 verificacoes em 18 suites. `npm test` roda todas
tsconfig.json                `npm run typecheck` = tsc --noEmit. Roda no CI
```

Os dois spikes são **reproduzíveis**, não relatos. `RESULTADOS.txt` em cada um é saída de execução real.

---

## O que a F1 tem que respeitar

Decidido e medido, não opinado. Detalhe em `adr/ADR-0003` r2.

- `tenant_id uuid NOT NULL` em toda entidade de negócio, **desde a migration 1**
- **FK composta `(tenant_id, id)`** em toda referência entre entidades de negócio, com `UNIQUE (tenant_id, id)` nas referenciadas. Medido: FK simples atravessa tenant e o banco aceita
- RLS `ENABLE` + `FORCE` + ao menos uma policy em toda tabela com `tenant_id`. RLS sem policy nega tudo em silêncio — **82** das 151 tabelas do CRM estão nesse estado
- **A role de runtime não pode ter `BYPASSRLS`.** Medido em 27/07: a role `postgres` do Supabase tem `rolbypassrls = true`, e conectar com ela anula as 24 policies e o `FORCE` de uma vez. Ela não nasce em migration nenhuma, de propósito — é provisionamento, e sem ela o isolamento é enfeite
- `SET LOCAL`, **nunca `SET`**. Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte
- Ponto único de emissão do contexto, dentro de `$transaction`, reconstruindo a operação no client de transação
- `timeout` e `maxWait` explícitos. Os defaults do Prisma são 5.000 ms e 2.000 ms, e nenhum dos dois serve
- Vigência de `regra_comissao` e `tarifa` sem sobreposição, **recusada pelo banco** (`EXCLUDE USING gist`, exige `btree_gist`). Alíquota não pode depender de qual linha o planejador devolveu primeiro
- Tarifa em `numeric(12,6)` R$/kWh. Dinheiro em centavos; **taxa não é dinheiro**, e centavos truncariam a tarifa
- Teste de vazamento no CI, pool de tamanho 1, desde o primeiro dia

---

## Como aplicar as migrations

As migrations são **SQL puro**, não geradas por `prisma migrate dev`. São **quinze**, e a ordem importa. As três primeiras montam a fundação, conforme a `SPEC-001` §3.2:

```
prisma/migrations/20260725120000_fundacao_schema/   tabelas, enums, as 10 FKs compostas
prisma/migrations/20260725120100_isolamento_rls/    app.current_tenant_id(), RLS FORCE, policies
prisma/migrations/20260725120200_rbac_e_trilha/     RBAC dois níveis, RLS de plataforma, trilha da R2
```

Aplicar — **só `migrate deploy`**, nunca `migrate dev`, `db push` ou `migrate reset`:

```bash
npx prisma migrate deploy    # transacional POR MIGRATION. E o que salva de meia-aplicacao
```

Validar num banco limpo:

```bash
npm test          # typecheck + as 18 suites, 283 verificacoes
npm run typecheck # sozinho, tsc --noEmit
```

As suítes precisam de PostgreSQL em `127.0.0.1:5432`. Se não houver:

```bash
docker run -d --name pg16 -e POSTGRES_PASSWORD=spike -p 5432:5432 postgres:16
```

O mesmo roda no CI (`.github/workflows/isolamento.yml`), com PostgreSQL 16 de serviço — `ADR-0004` condição 5 e `SPEC-001` §9 exigem que o teste de vazamento corra fora da máquina de produção desde o primeiro dia.

**Quatro coisas para saber antes de mexer:**

1. **`prisma/schema.prisma` vem do `db pull` e não se edita à mão.** O schema declarado é derivado do real, nunca o contrário. Editar compila e o `db pull` seguinte reverte em silêncio — é a regra 11, e o custo dela foi medido: uma relação tipada errado devolveu um contrato de R$ 111,00 onde o vigente valia R$ 789,00.
2. **A conexão do CLI é `DIRECT_URL`, e ela tem que ser o *session pooler* na 5432.** O host direto `db.<ref>.supabase.co` é **IPv6-only** sem o add-on de IPv4 e não conecta de Codespaces nem de CI. A porta 6543 é *transaction pooler* e não serve para migration — não falha com mensagem útil, pendura. Detalhe no `.env.example`.
3. **Nunca use rolespec por palavra-chave em `GRANT`/`REVOKE` de role.** Medido em 27/07 contra Supabase, PG 17.6: `GRANT <role> TO CURRENT_USER` **derruba o backend do Postgres** e chega ao Prisma disfarçado de `P1017`. Vale para `CURRENT_ROLE` e `SESSION_USER`. A forma segura é `EXECUTE format('GRANT … TO %I', current_user)`. Foi a causa raiz da migration 10 aplicada pela metade — `RESUMO-SESSAO-6` §1 e §2.
4. **`prisma migrate` precisa do `binaries.prisma.sh`.** O Prisma 7 dispensa o engine Rust em *runtime* sobre driver adapter, mas a CLI ainda baixa o `schema-engine` para migrar.

---

## Onde a F1 está, contra os critérios formais

Medido em 27/07 contra o `PRD-v2.2` §10, não estimado. **Os três critérios de saída da F1:**

| Critério de saída | Evidência | |
|---|---|---|
| `migrate reset` limpo | `tests/run.sh` aplica as 15 migrations em banco vazio a cada `npm test`; `EXIT=0` | ✅ |
| sync idempotente | conector construído e provado contra stub (`N10`), **nunca contra o CRM real** — falta `CRM_DATABASE_URL` | ⚠️ |
| escrita no CRM falha por permissão | medido por catálogo: `financeiro_ro` tem 0 privilégio de escrita, 0 objeto fora de `financeiro`, 0 acesso a tabela base. **Não automatizado ainda** | ⚠️ |

**As entregas nomeadas da F1:**

| Entrega | Estado |
|---|---|
| projeto, auth, RBAC dois níveis | ✅ auth medido contra o Supabase real; RBAC com as 16 células do PRD §3 |
| schema completo com `tenant_id` | ✅ 13 migrations, 20 tabelas com RLS, 24 policies, **zero** tabela com `tenant_id` sem policy |
| cadastros | ⚠️ 6 repositórios para 11 modelos de negócio — faltam `dono_usina`, `regra_comissao`, `regra_repasse`, `tarifa`, `cliente_estado_crm` |
| **conector CRM read-only** | ⚠️ **construído em 27/07** (`src/crm/`, 23 verificações), invariante 9 cumprido, não ligado ao CRM real. `SPEC-002` segue *"Rascunho — aguarda aceite"* e a fase dele é a `Q-FASE-01` |

**A leitura honesta:** a fundação está pronta e provada, e o conector existe e é testado. O que falta **não é código nosso**: `CRM_DATABASE_URL`, o primeiro ciclo real e a decisão de fase (`Q-FASE-01`). Quem ler "F1 em execução" sem esta tabela superestima a proximidade do fim.

---

## Pendente

A lista completa, com dono nomeado, está em `RESUMO-SESSAO-7` §Pendências gerais. O essencial:

| Item | Estado |
|---|---|
| **Bootstrap — o primeiro `plataforma_admin`** | 🟡 **Script pronto e provado; falta o `COMMIT`.** `scripts/bootstrap-plataforma-admin.sql`, com `-v modo=ensaio\|valendo` — sem default, porque script de provisionamento que escreve por esquecimento é o modo de falha errado. Conta criada no Supabase Auth (`efcc8e11-…`) e ensaio rodado contra ela: `usuario` + tier criados, `app.resolver_login` devolveu `tier = plataforma_admin`, 2 linhas de trilha, `ROLLBACK` deixou tudo em zero. `app_financeiro` continua sem `INSERT` nessa tabela, de propósito |
| **Role LOGIN de runtime + `DATABASE_URL`** | ✅ **Fechado em 27/07** — `app_financeiro_login`, `NOSUPERUSER NOBYPASSRLS`. Isolamento provado conectado por ela: usuário de A apontando o contexto para o tenant B lê **0 linhas** e tem a escrita recusada. O composition root recusa o arranque se a role tiver `BYPASSRLS` |
| **Reunião com o contador** | 🔴 Não ocorreu. Quatro questões fiscais **aceitas como risco** e rebaixadas para bloqueio de F2/F3. A F1 corre livre; a F2 não começa sem isso. Os 10 campos a levar estão no `RESUMO-SESSAO-3` §5 |
| **PgBouncer em modo *transaction*** | 🔴 Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` **reabre inteiro**. O `.env.example` manda o runtime para *session mode* por isso |
| **F-01b** | 🔴 Nenhuma etapa do funil marca o cliente pagante. O gatilho de faturamento não é evento do CRM — decisão de F2 |
| Repositórios de UC, usina, originador e rateio | ✅ **Fechados em 27/07** — 45 verificações novas em 4 suítes |
| `Q-CLAUDE11-01` — a regra 11 perdeu o mecanismo | 🟡 Com `previewFeatures = ["partialIndexes"]`, o índice parcial **voltou** a ser chave de `findUnique`. A proteção automática que a regra supõe não existe mais, e o `CAT-1` não cobre este caso |
| Endpoints com a matriz de papéis | ✅ **Fechados em 27/07** — 37 rotas, 21 verificações. A matriz é aplicada no **repositório**, por `exigir()`, não no handler |
| `Q-RBAC-01` — matriz implementada ≠ PRD §3 | ✅ **Fechada em 27/07** — `escrever_cadastro` alinhada ao PRD: só `admin`. A matriz agora é fixada célula a célula, e o teste foi verificado nos dois sentidos |
| **Autenticação (`MT-06`)** | ✅ **Fechada em 27/07 — auth próprio, e agora medida contra o Supabase real.** `SUPABASE_URL` preenchida. Token emitido pelo projeto e verificado pelo caminho de produção: `iss` confere, projeto em **JWT signing keys ES256** (não HS256 legado — `SUPABASE_JWT_SECRET` fica ausente de propósito), JWKS responde no caminho que o código monta. `npm run auth:verificar` reproduz |
| `Q-AUDIT-01` — trilha da concessão de tier sem `registro_id` | ✅ **Fechada em 27/07** — migration 13. `usuario_id` entra no `coalesce` de `app.auditar()` **por último**, então as outras 15 tabelas não mudam. G6 e G7 verificados nos dois sentidos |
| `Q-DISTRIB-01` — RLS sem policy em `distribuidora` | ✅ **Fechada em 27/07** — migration 13. O `rls_auto_enable` do Supabase havia habilitado RLS na tabela, sem policy: a role de runtime lia **0** linhas. Agora lê 1. `CAT-8` acusa a classe inteira |
| `MT-09` — `rls_auto_enable` do Supabase | 🟡 **Reclassificado em 27/07: já aconteceu.** A cobertura pelo `CAT-3` que esta linha alegava **não existia** — ele filtra por `tenant_id`. Coberto agora pelo `CAT-8`, que é detecção e não prevenção. Resta decidir se o event trigger é tratado no provisionamento |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 Linhas 536 e 565 contra a §3.4. São **dez** |
| Bug do `GRANT` no Supabase | 🟡 Reportar. Derruba todas as sessões da instância |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna |
| **Banco no Supabase `sa-east-1`** | ✅ **Fechado em 27/07** — 13 migrations. Os 8 invariantes de catálogo passam **contra produção**, não só contra o banco de teste |
| **`prisma generate` e os dois primeiros repos** | ✅ **Fechado em 27/07** — cardinalidade LISTA confirmada nos tipos |
| Verificação de tipo | ✅ Fechada — `tsconfig.json`, `npm run typecheck`, job no CI |
| `$transaction` do Prisma | ✅ Fechado em 25/07 — `ADR-0003` r2, `spike-transacao/` |
| Contagem de FKs | ✅ Fechada — **dez**, lista nominal em `SPEC-001` §3.4 |
| `ADR-0004` | ✅ Escrito em 25/07 |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
