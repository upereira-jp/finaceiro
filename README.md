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
5. **`SPEC-001-fundacao.md`** — a spec da F1
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
SPEC-001-fundacao.md         spec da F1 (v2.1 — v2.2 pendente, ver abaixo)
_TEMPLATE-SPEC.md            anatomia fixa das specs
RESUMO-SESSAO-2.md           passagem da sessao 2
RESUMO-SESSAO-3.md           passagem da sessao 3 — comece por aqui
VIEWS-PROPOSTAS-r2.sql       proposta de DDL para o dev do CRM. NAO executada

adr/
  ADR-0002-...               modelo de tenant e de cliente, pos-auditoria
  ADR-0003-...               contexto de tenant: SET LOCAL por transacao (r2, aceita)

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
- Teste de vazamento no CI, pool de tamanho 1, desde o primeiro dia

---

## Pendente

| Item | Estado |
|---|---|
| `SPEC-001` → **v2.2** | Aguarda aceite. Entra: tabelas `regra_comissao` e `tarifa` versionadas por vigência, FK composta com lista nominal fechada, contrato do middleware, invariantes I-7 e I-8 |
| `ADR-0004-provisionamento` | A escrever. Promove as decisões A2/A3 e as 5 condições do VPS compartilhado, hoje registradas só no `RESUMO-SESSAO-3` |
| Reunião com o contador | Não ocorreu. Quatro questões fiscais **aceitas como risco** e rebaixadas para bloqueio de F2/F3. A F1 corre livre; a F2 não começa sem isso |
| Migration no CRM — subtipos de parceiro | Bloqueia o motor de comissão (F3). É item do dev do CRM |
| Contagem de FKs a converter | O `ADR-0003` diz sete; a leitura do `SPEC-001` §3.3 rende nove. Precisa de passada nominal **antes** da migration — FK esquecida é caminho cross-tenant aberto |
| PgBouncer em modo *transaction* | Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` reabre |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
