# Bloco para fusão em QUESTOES.md

> Preparado em 23/07/2026. Pronto para colar. Não substitui o `QUESTOES.md` — o arquivo não foi enviado, então as questões Q-001 a Q-023 do registro original não estão aqui.

---

## ⚠️ Antes de colar: colisão de numeração

A auditoria numerou suas questões **Q1 a Q12**. O registro do projeto usa **Q-001 a Q-023**. São séries diferentes, e `Q5` da auditoria (comissão) **não é** `Q-005` do registro. A sessão vinha contornando isso com o sufixo "aud.", que resolve na conversa e falha em documento.

**Proposta:** prefixo por origem, sem renumerar nada.

| Prefixo | Origem | Faixa |
|---|---|---|
| `Q-nnn` | registro original do projeto | Q-001 … Q-023 |
| `AUD-nn` | auditoria do CRM de 23/07 (era Q1…Q12) | AUD-01 … AUD-12 |
| `F-nn` | relatório P7, topologia de funis | F-01 … F-05 |
| `MT-nn` | multi-tenancy, abertas pelos ADRs | MT-06 … MT-08 |
| `O-nn` | operação | O-01, O-02 |

---

## Questões da auditoria — estado atualizado

Duas das doze foram respondidas desde que a tabela foi escrita.

| ID | Era | Pergunta | Quem responde | Bloqueia | Estado |
|---|---|---|---|---|---|
| **AUD-01** | Q1 | Lead `won` e cliente de rateio são a mesma pessoa? (46 × 36, sem interseção) | — | modelagem de cliente | ✅ **Respondida.** Mesma entidade — ambos são linhas de `leads`. A interseção é zero porque vivem em **funis diferentes**, e nenhum lead do funil Rateio ocupa etapa `won`. Não é backfill e não converge sozinho. Ver P7 e ADR-0002 r2 |
| AUD-02 | Q2 | Rateio que não fecha 100% é intencional? (91,2% e 99,78%) | operação G3 / dev CRM | cálculo de crédito; alerta | aberta |
| AUD-03 | Q3 | Geração: nominal ou série mensal? | Vinicius / dev CRM | fórmula de crédito e faturamento | aberta — **é a mesma que Q-021**, consolidar num id só |
| AUD-04 | Q4 | Como saber que uma competência está COMPLETA? | Vinicius / operação | gatilho de faturamento | aberta |
| AUD-05 | Q5 | Comissão: CRM (2 tiers flat) ou PRD (escalonamento)? | Vinicius | motor de comissão | aberta — ver nota abaixo |
| AUD-06 | Q6 | Onde mora a senioridade do parceiro? | Vinicius / dev CRM | tier sênior | aberta — ver nota abaixo |
| AUD-07 | Q7 | Merge de leads duplicados apaga fisicamente um `id`? | dev CRM | reconciliação de deleção no conector | aberta |
| AUD-08 | Q8 | Quem preenche `usinas.dono_lead_id`? | operação G3 | entidade dono de usina | aberta |
| AUD-09 | Q9 | CPF/CNPJ: CRM exige ou financeiro coleta? | Vinicius | cadastro bancário | aberta |
| AUD-10 | Q10 | Regra dos 25%: bloqueia ou alerta? | Vinicius | validação de rateio | aberta |
| AUD-11 | Q11 | Sync de 30 min é requisito ou pode relaxar? | Vinicius / time | nada agora | aberta, sem urgência |
| **AUD-12** | Q12 | Schema de interface: `financeiro` ou `integracao` (`vw_*`)? | — | aplicação do `VIEWS-PROPOSTAS.sql` | ✅ **Respondida.** `financeiro.*` direto, sem aliases. É a Q-023. A seção (C) do `VIEWS-PROPOSTAS.sql` foi removida na r2 |

**Nota sobre AUD-05 e AUD-06 — medido em 23/07/2026.**

O custom field `Comissionamento` (`selecao`) cobre 335 leads, mas a cobertura engana:

| Opção | Leads |
|---|--:|
| `PADRAO` | 303 |
| `25%` | 20 |
| `50%` | 9 |
| **`30%`** | **3** |

Noventa por cento é `PADRAO`, que não diz qual regra se aplica. O sinal real são 32 leads. E o valor **`30%` não existe nem nos dois tiers de `app_settings.g3_partner_rules` nem nos quatro tipos do PRD** — é uma terceira taxa em produção que nenhuma regra documenta.

Isso divide a AUD-05 em duas perguntas:
- **AUD-05a** — `PADRAO` significa "vale a taxa padrão" (qual?) ou "ainda não classificado"?
- **AUD-05b** — de onde vem o `30%`, e ele continua valendo?

**Sobre a AUD-06:** o custom field `Nome do vendedor` (texto curto) está preenchido em **286 leads**. Ou seja, **vendedor interno existe no CRM** — a auditoria registrou que não. É texto livre, sem chave estrangeira, sujeito a variação de grafia: serve como semente de conciliação, nunca como chave. **Senioridade** continua sem lugar nenhum.

**Encerrado de vez:** o único custom field de tipo `moeda` com preenchimento é `Valor médio conta (R$)`, em 15 leads. A hipótese de que o dado monetário viveria em custom field está morta — o valor está em `leads.consumo_reais`, 100%.

---

## Questões novas — P7, topologia de funis

| ID | Pergunta | Quem responde | Bloqueia |
|---|---|---|---|
| **F-01** | A carteira legada (36 clientes com rateio) é migrada para o funil `Clientes ativos - Assinatura` antes do go-live? Esses leads nunca passaram por etapa `won`, então automação disparada por `won` não os alcança. **Sem migração, o conector lê zero e o financeiro fatura ninguém** | Vinicius + operação | piloto sombra, F2 |
| **F-02** | Quais funis contam como "conversão final" para a automação? Hoje há `won` em Vendas - Assinatura (38), Vendas - Integração (1) e Parceiros (7). Sem lista explícita, o funil de carteira recebe parceiro e obra | Vinicius | SPEC-CONECTOR-CRM |
| **F-03** | Quem mantém a etapa `INADIMPLENTES`? O estado é produzido pelo financeiro, e a regra 6 do `CLAUDE.md` torna o CRM read-only absoluto. Três saídas: etapa desatualizada por desenho, atualização manual, ou exceção estreita de write-back | Vinicius | forma do conector, F1 |
| **F-04** | O conector lê **participação** no funil ou **etapa** dentro dele? A etapa terminal do funil Rateio está vazia com 38 leads dentro — a disciplina de posição não sustenta gatilho | Vinicius + operação | gatilho de faturamento, F2 |
| **F-05** | Vendas - Integração entra na mesma carteira? É obra, com economia distinta da assinatura de crédito | Vinicius | modelo de faturamento |

---

## Questões de multi-tenancy

| ID | Pergunta | Quem responde | Bloqueia |
|---|---|---|---|
| MT-06 | Supabase Auth próprio ou compartilhado com o CRM? Com tenant próprio, a saída é SSO, não tabela comum | Vinicius | SPEC-RBAC, F1 |
| MT-07 | *Reformulada.* A criação de tenant é local — não há chave para sincronizar. Resta: quem informa o `crm_tenant_id` ao ativar um conector, e como se valida que aponta para a empresa certa. UUID errado devolve dados de outra empresa sem erro nenhum | Vinicius | SPEC-CONECTOR-CRM |
| **MT-08** | *Nova.* Quem parametriza as views `financeiro.*` para deixarem de conter o UUID do tenant como literal, e quando? Hoje a camada de interface é mono-tenant na prática | dev CRM | segundo tenant com CRM |

---

## Agrupamento sugerido para as conversas

Cada bloco é uma conversa só, não uma pergunta por vez.

**Com a operação G3** — F-01, F-02, F-04, AUD-02, AUD-04, AUD-08, O-01, O-02.
A F-01 é a de maior risco de cronograma: o trabalho é mover 36 linhas, mas se ninguém mover, o defeito só aparece no piloto sombra.

**Com Vinicius, decisão de produto** — AUD-03/Q-021, AUD-05, AUD-06, AUD-09, AUD-10, F-03, F-05, MT-06.
Medir o custom field `Comissionamento` **antes** de AUD-05 e AUD-06.

**Com o dev do CRM** — AUD-07, MT-08, aplicação do `VIEWS-PROPOSTAS.sql` r2, e as seis ações de segurança. O `DROP ROLE auditoria_ro` tem prazo: a role expira em 23/08.

**Com o contador** — Q-011, Q-002 C, Q-003 C.
