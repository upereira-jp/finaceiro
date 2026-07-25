# QUESTOES.md — registro único de questões abertas

| Campo | Valor |
|---|---|
| **Versão** | 1.0 |
| **Data** | 24/07/2026 |
| **Regra de origem** | `CLAUDE.md` regra 10 — contradição ou lacuna vira entrada aqui, nunca improviso |

> **Este arquivo é novo, e é uma consolidação — não uma fusão.**
>
> O `QUESTOES.md` original, com a faixa `Q-001 … Q-023`, **nunca chegou a nenhuma sessão** e não está no repositório. Não foi reconstruído: paráfrase de memória viraria canônico por acidente.
>
> O que está abaixo foi **recuperado por varredura do corpus** — `PRD-v2.2` §11, `SPEC-001` §10, `ADR-0002` r2, `ADR-0003`, `P7` §5, `P8`, `RESUMO-SESSAO-2` §4 e o `QUESTOES-bloco-para-fusao.md`. Onde o bloco de fusão registrava o mapeamento `Q-nnn → AUD-nn`, ele está preservado na coluna *Era*.
>
> **Lacuna conhecida:** questões do registro original que não foram citadas em nenhum documento sobrevivente estão perdidas. Não há como saber quantas. Se o arquivo original aparecer, funde por ID.
>
> **Duas séries de numeração, e elas colidem.** A auditoria numerou as suas questões `Q1 … Q12`; o registro do projeto usa `Q-001 … Q-023`. **`Q5` da auditoria (comissão) não é `Q-005` do registro.** A sessão 2 contornava isso com o sufixo "aud.", que resolve na conversa e falha em documento. Neste arquivo as questões da auditoria aparecem como `AUD-nn` e as do registro como `Q-nnn`, e a coluna *Era* preserva o mapeamento. — *Nota herdada do `QUESTOES-bloco-para-fusao.md`, que sai do repositório com esta absorção: era a única informação daquele arquivo que a consolidação de 24/07 não havia trazido.*

---

## 1. Taxonomia de severidade

O critério de saída da F0 no `PRD-v2.2` §10 exige *"`QUESTOES.md` sem bloqueio vermelho"*. **A classificação nunca foi definida** — a palavra "vermelho" aparecia uma única vez em todo o corpus, dentro do próprio critério. Definida aqui:

| Nível | Significado | Efeito |
|---|---|---|
| 🔴 **Vermelho** | Sem esta resposta, código escrito agora **será jogado fora** ou entrará em produção errado. Bloqueia a fase em que está | Impede o avanço de fase. É o que o critério de saída mede |
| 🟡 **Amarelo** | Bloqueia uma entrega específica, não a fase. Dá para avançar em paralelo e absorver depois | Não impede o avanço de fase; impede o *merge* da entrega que depende dela |
| 🟢 **Verde** | Precisa de resposta antes do go-live, mas não altera desenho. Preenchimento, parâmetro, conteúdo | Nenhum |

**Regra de classificação:** é vermelha se a resposta errada obriga a **reescrever schema, policy ou contrato de integração**. É amarela se obriga a reescrever uma tela, um relatório ou um cálculo. É verde se só muda um valor.

Uma questão sem dono nomeado é automaticamente vermelha, por não ter caminho de resolução.

---

## 2. Placar por fase

| Fase | 🔴 | 🟡 | 🟢 | Situação |
|---|--:|--:|--:|---|
| **F0** | **3** | 1 | 0 | **aberta** — ver §3 |
| F1 | 2 | 4 | 1 | aguarda F0 |
| F2 | 2 | 3 | 2 | — |
| F3 | 2 | 1 | 0 | — |
| F6 | 0 | 1 | 1 | — |

---

## 3. F0 — o que falta para fechar

Entregas da F0 conforme `PRD-v2.2` §10:

| Entrega | Situação |
|---|---|
| Auditoria do CRM | ✅ concluída (P0–P6), reverificada em 24/07 (P8), sem deriva |
| Spike Prisma + RLS | ✅ **executado em 24/07** — `ADR-0003`, 21 testes. Ressalva de cobertura na §"Cobertura" do ADR |
| Decisões fiscais e de comissão | 🔴 **abertas** — 3 fiscais + 4 de comissão |
| Provisionamento de infra | 🔴 **aberto** |

| ID | Nível | Pergunta | Quem responde |
|---|:--:|---|---|
| **Q-011** | 🔴 | Retenção sobre comissão a PF — incide, e como? | contador |
| **Q-002 C** | 🔴 | Escrituração sem emissão de documento fiscal | contador |
| **Q-003 C** | 🔴 | Crédito de IBS/CBS na operação | contador |
| **AUD-05** | 🔴 | Comissão: tabela do CRM (2 tiers flat) ou do PRD (escalonada)? | Vinicius |
| **AUD-05a** | 🟡 | O que `PADRAO` significa — 303 de 335 leads | Vinicius |
| **AUD-05b** | 🟡 | De onde vem o `30%` — 3 leads apenas | Vinicius |
| **AUD-06** | 🟡 | Onde mora a senioridade do parceiro | Vinicius / dev CRM |
| **Q-SPEC001-06** | 🔴 | Projeto Supabase do financeiro na mesma organização do PRO ou separado? | Vinicius |
| **PRD §2.3** | 🔴 | Provisionamento: projeto, domínio, host da aplicação | Vinicius |

**Três vermelhas restantes, todas de decisão — nenhuma de engenharia.** Uma reunião com o contador fecha as três primeiras; uma sessão sua fecha AUD-05 e as duas de infra.

---

## 4. F1 — fundação

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| **F-02** | 🔴 | Quais funis contam como conversão final? Hoje `won` inclui 7 parceiros | Vinicius |
| **F-03** | 🔴 | Quem mantém `INADIMPLENTES`? Write-back colide com `PRD` §7.8 | Vinicius |
| MT-06 | 🟡 | Auth próprio ou SSO com o CRM? | Vinicius |
| MT-01 | 🟡 | Usuário pode pertencer a mais de um tenant? Custo de errar: uma constraint | Vinicius |
| MT-07 | 🟡 | Quem informa o `crm_tenant_id` ao ativar um conector, e como se valida | Vinicius |
| AUD-09 | 🟡 | CPF/CNPJ: CRM exige ou o financeiro coleta? | Vinicius |
| Q-SPEC001-03 | 🟢 | Endereço da UC: coleta local obrigatória ou opcional? | Vinicius |

## 5. F2 — faturamento

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| **F-01** | 🔴 | Migrar a carteira legada (36 clientes) para o funil de ativos antes do go-live. **Sem isso o conector lê zero** | Vinicius + operação |
| **Q-021 / AUD-03** | 🔴 | Faturar pela geração nominal ou pela série real? | Vinicius + dev CRM |
| F-04 | 🟡 | Conector lê participação no funil ou etapa dentro dele? | Vinicius |
| AUD-04 | 🟡 | Como o financeiro sabe que a competência está fechada? | Vinicius + operação |
| Q-SPEC001-02 | 🟡 | `data_vencimento` 100% vazia no CRM. Quem preenche, por UC ou por contrato? | operação |
| O-02 | 🟢 | Quando um cliente novo começa a ser faturado | operação |
| AUD-11 | 🟢 | Sync de 30 min é requisito ou pode relaxar? | Vinicius |

## 6. F3 — split e comissão

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| **Q-022** | 🔴 | Como o contrato é atribuído ao originador, com `partner_id` em 3%? Medir antes o custom field `Comissionamento` | Vinicius |
| **Q-SPEC001-04** | 🔴 | `percentual_repasse` vive na usina ou só em `regra_split` versionada? Duplicar cria duas verdades | Vinicius |
| AUD-08 | 🟡 | Quem preenche `usinas.dono_lead_id`? Nulo em 3 de 3 — bloqueia repasse | operação |

## 7. F6 e além

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| AUD-02 | 🟡 | Rateio incompleto (91,20% e 99,78%) é intencional? | operação |
| AUD-10 | 🟡 | Regra dos 25%: de onde vem, sobre o que incide, bloqueia ou alerta? | Vinicius |
| O-01 | 🟢 | Parâmetros da lista de rateio | operação |
| F-05 | 🟢 | Vendas - Integração entra na mesma carteira? | Vinicius |

## 8. Fora do financeiro — dev do CRM

| ID | Nível | Pergunta |
|---|:--:|---|
| **MT-08** | 🟡 | Parametrizar as views `financeiro.*` — hoje o UUID da G3 é literal em 14 pontos. Bloqueia no segundo tenant |
| AUD-07 | 🟡 | Merge de leads duplicados apaga fisicamente um `id`? Afeta a reconciliação por diferença de conjunto |
| — | 🟡 | Aplicar o `VIEWS-PROPOSTAS-r2.sql`, com a correção do `LIMIT 1` sem `ORDER BY` na linha 92 |
| — | 🟡 | 49 tabelas de backup em `public`, 21 com `tenant_id`, nenhuma com policy. Retenção e destino (`P8` §3) |
| — | 🔴 | Segredos em `text` puro na tabela `tenants` (`P8` §4) |

---

## 9. Resolvidas

| ID | Era | Resolução |
|---|---|---|
| AUD-01 | Q1 | `ADR-0002` r2 — mesma entidade em funis diferentes; disjunção estrutural, não backfill |
| AUD-12 | Q12 | `Q-023` — consumir `financeiro.*` direto; não criar o schema `integracao` |
| Dado monetário | — | `PRD` §7.5 — `leads.consumo_reais`, 100% preenchido. `valor_venda` morto por desenho |
| `auditoria_ro` | — | Role removida em 24/07 (`P8` §6). Único item com prazo, encerrado |
| **ADR-0003** | — | **Spike executado em 24/07 — `SET LOCAL` por transação** |
| `CLAUDE.md` | — | Nunca existiu. `CLAUDE.md` v1.0 escrito em 24/07; 18 citações reapontadas |
| "bloqueio vermelho" | — | Taxonomia definida na §1 deste arquivo |
