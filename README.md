# Financeiro G3 Solar

Sistema financeiro multi-tenant da G3 Solar: faturamento de crédito de energia, comissão de originadores e repasse a donos de usina. O CRM ao lado é **fonte de leitura e nada mais** — nenhuma linha dele é modificada por este sistema.

| Campo | Valor |
|---|---|
| **Dono** | Vinicius Leal |
| **Fase atual** | F0 fechada · **F1 em execução** — as 12 migrations aplicadas no Supabase `sa-east-1`, client gerado, repositórios de cliente e contrato prontos. Falta a **role LOGIN de runtime**, que bloqueia tudo o que conecta |
| **Atualizado** | 27/07/2026 |

---

## Comece por aqui

Nesta ordem. Cada documento pressupõe o anterior.

1. **`RESUMO-SESSAO-6.md`** — estado atual, a fila da próxima sessão e as pendências gerais com dono nomeado
2. **`CLAUDE.md`** — as onze regras inegociáveis. Antes de qualquer linha de código
3. **`PRD-v2.2.md`** §7 e §8 — fronteira com o CRM
4. **`adr/ADR-0003-contexto-de-tenant.md`** (r2) — como o isolamento funciona de fato, e a que preço
5. **`SPEC-001-fundacao.md`** (v2.9) — a spec da F1. §3.2 é o contrato do middleware; §3.4 é a lista das **dez** FKs compostas — as linhas 536 e 565 ainda dizem nove, e é a `Q-SPEC001-08`
6. **`GLOSSARIO.md`** — se um termo está lá, é assim que ele se chama em spec, em código e em conversa

`QUESTOES.md` se consulta sob demanda, e é onde toda lacuna vira entrada (regra 10). Os `RESUMO-SESSAO-2` a `-5` são a trilha datada: cada um diz o que foi medido, **o que foi retirado depois de medido**, e o que ficou na fila.

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
RESUMO-SESSAO-6.md           passagem da sessao 6 — comece por aqui
VIEWS-PROPOSTAS-r2.sql       proposta de DDL para o dev do CRM. NAO executada
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

src/db/pools.ts              os dois pools: transacional 8/15s, relatorio 2/60s
src/db/contexto.ts           ponto UNICO de emissao do contexto. RBAC e trilha
src/db/tipado.ts             devolve os 19 modelos aos repos sem contexto.ts conhece-los
src/auth/sessao.ts           login, escolha de tenant validada, caminho de plataforma
src/repos/cliente.ts         cadastro, busca por documento, baixa logica
src/repos/contrato.ts        R14 e a ORDEM da renovacao: encerra o velho antes de inserir
src/dominio/documento.ts     CPF e CNPJ, inclusive alfanumerico (31/07/2026)
prisma/migrations/           DOZE, em ordem. As tres ultimas: auditoria e repasse
                             versionado, UNIQUE composto em cliente_estado_crm, R14
prisma/schema.prisma         vem do `db pull`. NAO editar a mao - ver regra 11
prisma/seed/                 regra_comissao e tarifa, idempotente
tests/catalogo.sql           CAT-1 a CAT-7: as regras 1, 2, 3 e 11 por catalogo
tests/                       154 verificacoes em 10 suites. `npm test` roda todas
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

As migrations são **SQL puro**, não geradas por `prisma migrate dev`. São **doze**, e a ordem importa. As três primeiras montam a fundação, conforme a `SPEC-001` §3.2:

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
npm test          # typecheck + as 10 suites, 154 verificacoes
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

## Pendente

A lista completa, com dono nomeado, está em `RESUMO-SESSAO-6` §Pendências gerais. O essencial:

| Item | Estado |
|---|---|
| **Role LOGIN de runtime + `DATABASE_URL`** | 🔴 **É o portão.** Sem ela o app só conecta como `postgres`, que tem `rolbypassrls = true` — e o vazamento entre tenants só aparece com o segundo cliente em produção. SQL pronto em `RESUMO-SESSAO-6` §Fila |
| **Reunião com o contador** | 🔴 Não ocorreu. Quatro questões fiscais **aceitas como risco** e rebaixadas para bloqueio de F2/F3. A F1 corre livre; a F2 não começa sem isso. Os 10 campos a levar estão no `RESUMO-SESSAO-3` §5 |
| **PgBouncer em modo *transaction*** | 🔴 Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` **reabre inteiro**. O `.env.example` manda o runtime para *session mode* por isso |
| **F-01b** | 🔴 Nenhuma etapa do funil marca o cliente pagante. O gatilho de faturamento não é evento do CRM — decisão de F2 |
| Repositórios de UC, usina, originador e rateio | 🟡 Próximo trabalho de código, no molde de `src/repos/cliente.ts` |
| `MT-09` — `rls_auto_enable` do Supabase | 🟡 Habilita RLS **sem policy e sem `FORCE`**. Coberto hoje pelo `CAT-3`; decidir se trata no provisionamento |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 Linhas 536 e 565 contra a §3.4. São **dez** |
| Bug do `GRANT` no Supabase | 🟡 Reportar. Derruba todas as sessões da instância |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna |
| **Banco no Supabase `sa-east-1`** | ✅ **Fechado em 27/07** — 12 migrations, fingerprint 11/11 exato |
| **`prisma generate` e os dois primeiros repos** | ✅ **Fechado em 27/07** — cardinalidade LISTA confirmada nos tipos |
| Verificação de tipo | ✅ Fechada — `tsconfig.json`, `npm run typecheck`, job no CI |
| `$transaction` do Prisma | ✅ Fechado em 25/07 — `ADR-0003` r2, `spike-transacao/` |
| Contagem de FKs | ✅ Fechada — **dez**, lista nominal em `SPEC-001` §3.4 |
| `ADR-0004` | ✅ Escrito em 25/07 |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
