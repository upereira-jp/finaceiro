# P7 — Topologia de funis e origem da carteira

| Campo | Valor |
|---|---|
| **Data** | 23/07/2026 |
| **Base factual** | 5 consultas SELECT no Postgres do intreply, tenant G3 (`d4640f4b-f833-4a80-a4db-ccced1956ae4`) |
| **Método** | Leitura de tabelas base via conexão privilegiada (não pela role `financeiro_ro`) |
| **Motivo** | Verificar a diretriz "a carteira sai do funil de clientes ativos" |
| **Revisa** | P2, P4 · ADR-0002 Decisão 2 · `VIEWS-PROPOSTAS.sql` · PRD §7.5, §8, §11 |

---

## 1. O mapa dos funis

| Funil | Criado | Leads | Em etapa `won` | `valor_mode` |
|---|---|--:|--:|---|
| Vendas - Assinatura | 24/05/2026 | 197 | 38 | `consumo_solar` |
| Rateio | 29/06/2026 | 38 | 0 | `consumo_solar` |
| Vendas - Integração | 05/06/2026 | 23 | 1 | `consumo_solar` |
| Parceiros | 18/05/2026 | 10 | 7 | `consumo_solar` |
| **Clientes ativos - Assinatura** | **29/06/2026** | **0** | **0** | `consumo_solar` |

Todos ativos (`is_active = true`).

---

## 2. Onde a carteira está hoje

**No funil "Rateio".** Contenção exata:

| Conjunto | Tamanho |
|---|--:|
| Leads no funil Rateio | 38 |
| Leads em `usina_clientes` | 36 |
| Interseção | **36** |
| Leads `won` ∩ `usina_clientes` | **0** |
| Leads `won` ∩ funil Rateio | **0** |

Os 36 clientes com rateio estão todos dentro do funil Rateio. Os 2 restantes estão no funil e ainda não têm vínculo em `usina_clientes`.

### Distribuição por etapa no funil Rateio

| # | Etapa | Tipo | Leads | Com rateio |
|--:|---|---|--:|--:|
| 0 | Pendente de Autorização | normal | 0 | 0 |
| 1 | Rateio autorizado | normal | 2 | 0 |
| 2 | Troca de Titularidade | normal | 7 | 7 |
| 3 | Troca concluída | normal | 0 | 0 |
| 4 | INICIADOS | normal | 0 | 0 |
| 5 | Rateio enviado | normal | 0 | 0 |
| 7 | Rateio Concluído | normal | 29 | 29 |
| 8 | **Desconto Ativo** | **won** | **0** | **0** |
| 9 | PERDIDOS | lost | 0 | 0 |

A etapa terminal do funil está vazia. A operação mantém posição até "Rateio Concluído" e para. **Posição de etapa não é sinal confiável de estado terminal.**

---

## 3. O que isso corrige na auditoria

### 3.1 Os 46 "vendas ganhas" incluem 7 parceiros

46 = 38 (Vendas - Assinatura) + 1 (Vendas - Integração) + 7 (Parceiros).

O funil "Parceiros" é onboarding de parceiro, não venda. `financeiro.vendas_ganhas` não filtra por funil, então qualquer contagem de carteira feita por ela erra por 7 e ainda mistura integração — negócio distinto — com assinatura.

→ **A view precisa de filtro de funil.** Corrigir no `VIEWS-PROPOSTAS.sql` antes de o dev do CRM aplicar.

### 3.2 A disjunção não é artefato de backfill

O P2 e o ADR-0002 explicaram a interseção zero como efeito de o módulo de rateio ter sido carregado com a carteira existente, e previram convergência em algumas competências.

A causa real é estrutural: são **dois funis distintos por desenho**, e nenhum lead do funil Rateio ocupa etapa `won`. As populações não convergem — não há mecanismo que as faça convergir. A passagem venda → carteira foi desenhada (o funil "Clientes ativos - Assinatura" existe, criado no mesmo dia do funil Rateio) e **nunca foi operacionalizada**.

→ A cláusula de revisão do ADR-0002 ("reavaliar se em três competências as populações não convergirem") aguarda um evento impossível e deve ser removida.
→ A **conclusão** de schema do ADR-0002 sobrevive e sai reforçada: `cliente` continua sendo uma entidade só, e os estados passam a ser participação em funil — medida direta, em vez de inferência sobre `stage_type`.

### 3.3 O dado monetário existe e está completo

| População | Leads | `consumo_reais` | `valor_venda` | `valor_investimento` |
|---|--:|--:|--:|--:|
| Funil Rateio | 38 | **38** | 0 | 0 |
| `won` em Vendas - Assinatura | 38 | **38** | 0 | 0 |

`funnels.valor_mode = 'consumo_solar'` em todos os funis explica o resto: o CRM deriva o valor exibido a partir do consumo, então `valor_venda` e `valor_investimento` nunca são preenchidos. Estão mortos **por desenho, não por negligência**.

→ A hipótese de que o dado monetário estaria em custom field do tipo `moeda` fica sem objeto. O passo 1 dos próximos passos está respondido.
→ PRD §8 ("valor de contrato raro nas colunas nativas") está errado e precisa de correção.

---

## 4. O funil de destino

**Clientes ativos - Assinatura**, criado em 29/06/2026, zero leads.

| # | Etapa | Tipo |
|--:|---|---|
| 0 | ATIVOS | normal |
| 1 | INADIMPLENTES | normal |
| 2 | CANCELADOS | lost |

É funil de ciclo de vida, não de venda — não tem etapa `won`, e não deveria ter. O recorte corresponde ao que o financeiro precisa.

**Nenhuma automação está configurada.** Nos três funis inspecionados (Clientes ativos, Rateio, Vendas - Assinatura), todas as etapas têm `auto_enter_rules = []` e `auto_exit_rules = []`; os funis têm `entry_sources = []` e `auto_enroll_new_leads = false`.

---

## 5. Questões abertas

| ID | Pergunta | Bloqueia |
|---|---|---|
| F-01 | A carteira legada (36 leads) é migrada para ATIVOS antes do go-live? Automação disparada por `won` não a alcança — esses leads nunca passaram por etapa ganha. Sem migração, o conector lê zero | piloto sombra, F2 |
| F-02 | Quais funis contam como "conversão final" para a automação? Hoje há `won` em Vendas - Assinatura, Vendas - Integração e Parceiros. Sem lista explícita, o funil de clientes ativos recebe parceiro e obra | SPEC-CONECTOR-CRM |
| F-03 | Quem mantém a etapa INADIMPLENTES? O estado é conhecido pelo financeiro, e a regra 6 do CLAUDE.md torna o CRM read-only absoluto. Alternativas: etapa desatualizada por desenho, atualização manual, ou exceção estreita de write-back | forma do conector, SPEC-CONECTOR-CRM |
| F-04 | O conector lê **participação** no funil ou **etapa** dentro dele? A etapa terminal do funil Rateio está vazia com 38 leads dentro — a disciplina de posição não sustenta gatilho de faturamento | SPEC-CONECTOR-CRM, gatilho F2 |
| F-05 | Vendas - Integração entra na mesma carteira? É outro negócio (obra), com economia distinta da assinatura de crédito | modelo de faturamento |

---

## 6. Impacto nos documentos

| Documento | O que muda |
|---|---|
| `ADR-0002` Decisão 2 | Premissa de backfill cai; conclusão de schema permanece. Remover a cláusula de revisão por convergência |
| `GLOSSARIO.md` verbete `won` | Deixa de ser critério de carteira. `won` é venda fechada **dentro de um funil de venda**; carteira é participação em "Clientes ativos - Assinatura" |
| `VIEWS-PROPOSTAS.sql` | `vendas_ganhas` ganha filtro de funil; avaliar view nova de carteira |
| `PRD` §7.5 e §8 | Dado monetário resolvido: `leads.consumo_reais`, 100% preenchido |
| `PRD` §11 | A pergunta prioritária sobre origem do valor está respondida |
| `QUESTOES.md` | Absorver F-01 a F-05 |
