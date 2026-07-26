# Financeiro G3 Solar

Sistema financeiro multi-tenant da G3 Solar: faturamento de crédito de energia, comissão de originadores e repasse a donos de usina. O CRM ao lado é **fonte de leitura e nada mais** — nenhuma linha dele é modificada por este sistema.

| Campo | Valor |
|---|---|
| **Dono** | Vinicius Leal |
| **Fase atual** | F0 fechada em 24/07/2026 · **F1 autorizada** (fundação: tenant, auth, RBAC, cadastros) |
| **Atualizado** | 25/07/2026 |

---

## Comece por aqui

Nesta ordem. Cada documento pressupõe o anterior.

1. **`RESUMO-SESSAO-3.md`** — estado atual, decisões tomadas e o que continua aberto
2. **`CLAUDE.md`** — as dez regras inegociáveis. Antes de qualquer linha de código
3. **`PRD-v2.2.md`** §7 e §8 — fronteira com o CRM
4. **`adr/ADR-0003-contexto-de-tenant.md`** (r2) — como o isolamento funciona de fato, e a que preço
5. **`SPEC-001-fundacao.md`** (v2.2) — a spec da F1. §3.2 é o contrato do middleware; §3.4 é a lista das nove FKs compostas
6. **`GLOSSARIO.md`** — se um termo está lá, é assim que ele se chama em spec, em código e em conversa

`QUESTOES.md` se consulta sob demanda, e é onde toda lacuna vira entrada (regra 10).

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
SPEC-001-fundacao.md         spec da F1 (v2.2)
_TEMPLATE-SPEC.md            anatomia fixa das specs
RESUMO-SESSAO-2.md           passagem da sessao 2
RESUMO-SESSAO-3.md           passagem da sessao 3 — comece por aqui
VIEWS-PROPOSTAS-r2.sql       proposta de DDL para o dev do CRM. NAO executada

adr/
  ADR-0002-...               modelo de tenant e de cliente, pos-auditoria
  ADR-0003-...               contexto de tenant: SET LOCAL por transacao (r2, aceita)
  ADR-0004-...               provisionamento: organizacao, dominio e host (aceita)

auditoria/
  P7-...                     topologia de funis do CRM
  P8-...                     reverificacao de 24/07
  PATCH-citacoes-...         reaponta as 18 citacoes ao CLAUDE.md que nunca existiu
  reparo-citacoes-....patch

spike-adr0003/               21 testes, tres variantes de contexto de tenant. ./run.sh
spike-transacao/             12 testes de $transaction/$extends do Prisma sobre RLS. ./run.sh
```

Os dois spikes são **reproduzíveis**, não relatos. `RESULTADOS.txt` em cada um é saída de execução real.

---

## O que a F1 tem que respeitar

Decidido e medido, não opinado. Detalhe em `adr/ADR-0003` r2.

- `tenant_id uuid NOT NULL` em toda entidade de negócio, **desde a migration 1**
- **FK composta `(tenant_id, id)`** em toda referência entre entidades de negócio, com `UNIQUE (tenant_id, id)` nas referenciadas. Medido: FK simples atravessa tenant e o banco aceita
- RLS `ENABLE` + `FORCE` + ao menos uma policy em toda tabela com `tenant_id`. RLS sem policy nega tudo em silêncio — 81 das 151 tabelas do CRM estão nesse estado
- `SET LOCAL`, **nunca `SET`**. Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte
- Ponto único de emissão do contexto, dentro de `$transaction`, reconstruindo a operação no client de transação
- `timeout` e `maxWait` explícitos. Os defaults do Prisma são 5.000 ms e 2.000 ms, e nenhum dos dois serve
- Vigência de `regra_comissao` e `tarifa` sem sobreposição, **recusada pelo banco** (`EXCLUDE USING gist`, exige `btree_gist`). Alíquota não pode depender de qual linha o planejador devolveu primeiro
- Tarifa em `numeric(12,6)` R$/kWh. Dinheiro em centavos; **taxa não é dinheiro**, e centavos truncariam a tarifa
- Teste de vazamento no CI, pool de tamanho 1, desde o primeiro dia

---

## Como aplicar as migrations

As migrations são **SQL puro**, não geradas por `prisma migrate dev`. Duas, na ordem, conforme a `SPEC-001` §3.2:

```
prisma/migrations/20260725120000_fundacao_schema/    tabelas, enums, as 9 FKs compostas
prisma/migrations/20260725120100_isolamento_rls/     app.current_tenant_id(), RLS FORCE, policies
```

Rodar tudo num banco limpo e validar:

```bash
./tests/run.sh        # aplica as duas e roda as 16 verificações de isolamento
```

O mesmo roda no CI (`.github/workflows/isolamento.yml`), com PostgreSQL 16 de serviço — `ADR-0004` condição 5 e `SPEC-001` §9 exigem que o teste de vazamento corra fora da máquina de produção desde o primeiro dia.

**Duas coisas para saber antes de mexer:**

1. **`prisma migrate` precisa do `binaries.prisma.sh`.** O Prisma 7 dispensa o engine Rust em *runtime* quando roda sobre driver adapter, mas a CLI ainda baixa o `schema-engine` para migrar. As migrations acima foram escritas e validadas com `psql` direto contra PostgreSQL 16.14 — o `migrate deploy` funciona na sua máquina e no CI, onde o domínio está liberado.
2. **`prisma/schema.prisma` não está aqui de propósito.** Gerar à mão dezesseis modelos é convidar divergência silenciosa entre o schema declarado e o schema real. Rode `prisma db pull` depois da migration 1: o schema vem do banco, que é a fonte.

---

## Pendente

| Item | Estado |
|---|---|
| **Reunião com o contador** | 🔴 Não ocorreu. Quatro questões fiscais **aceitas como risco** e rebaixadas para bloqueio de F2/F3. A F1 corre livre; a F2 não começa sem isso. Os 10 campos a levar estão no `RESUMO-SESSAO-3` §5 |
| **PgBouncer em modo *transaction*** | 🔴 Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` **reabre inteiro** |
| **F-01b** | 🔴 Nenhuma etapa do funil marca o cliente pagante. O gatilho de faturamento não é evento do CRM — decisão de F2 |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna |
| `$transaction` do Prisma | ✅ Fechado em 25/07 — `ADR-0003` r2, `spike-transacao/` |
| Contagem de FKs | ✅ Fechada — **nove**, lista nominal em `SPEC-001` §3.4 |
| `SPEC-001` v2.2 | ✅ Escrita em 25/07 |
| `ADR-0004` | ✅ Escrito em 25/07 |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
