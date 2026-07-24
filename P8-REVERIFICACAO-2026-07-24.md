# P8 — Reverificação do CRM, 24/07/2026

| Campo | Valor |
|---|---|
| **Método** | Consulta direta ao Postgres de produção via conector Supabase, somente leitura |
| **Projeto** | `CRM` · Postgres 17.6 · ACTIVE_HEALTHY |
| **Conferido contra** | `PRD-v2.2`, `GLOSSARIO`, `ADR-0002` r2, `P7`, `RESUMO-SESSAO-2`, `QUESTOES-bloco`, `VIEWS-PROPOSTAS-r2.sql` |
| **Nenhuma escrita executada** | Nenhum DDL, nenhum DML |

> **Nota de método.** A primeira versão deste relatório foi escrita sem os documentos em mãos e apresentou como descoberta várias coisas que a auditoria de 23/07 já tinha registrado. Esta versão separa o que é **confirmação** do que é **achado novo**. A distinção importa: confirmação diz que o documento envelheceu bem; achado novo cria trabalho.

---

## 1. Confirmação — a auditoria de 23/07 se sustenta

Reexecutei as medições centrais. **Nenhuma divergiu.**

| Medição | 23/07 | 24/07 |
|---|---|---|
| Usinas da G3 | 3 | 3 |
| Vínculos em `usina_clientes` | 36 | 36 |
| `usinas.dono_lead_id` preenchido | 0% | **0 de 3** |
| Soma do rateio por usina | 91,2% · 99,78% | **91,20% · 99,78% · 100,00%** |
| `stage_type='won'` | 46 (38+1+7) | **46 (38+1+7+0)** |
| Funil "Clientes ativos - Assinatura" | vazio | **vazio, nas 3 etapas** |
| Tabelas em `public` / com `tenant_id` | 151 / 109 | **151 / 109** |

O `§7.5 Dado monetário — resolvido` do PRD está correto e **não precisa de revisão**: a hipótese do custom field `moeda` já constava como *sem objeto*, e a medição confirma — a G3 tem uma única definição `moeda`, rotulada "Salário", com zero valores. `financeiro_ro` e `reporting_ai` também já estavam documentados (PRD §271, ADR-0002 §87); não são roles órfãs.

### Única deriva encontrada

| Item | Documento | Hoje | Leitura |
|---|---|---|---|
| Leads da G3 | 334 | **340** | +6 em um dia; a base é viva |
| `leads.valor_venda` preenchido | 0 nas duas populações | **3 em 340** | Não contradiz: os 3 estão **fora** da carteira e dos ganhos de Vendas - Assinatura. A regra do §7.5 segue válida |

---

## 2. Achado novo — RLS habilitada não é RLS aplicada

O P0 registrou "RLS habilitada nas 151 tabelas de `public`". Verdadeiro. Incompleto.

| | Tabelas |
|---|---|
| Em `public` | 151 |
| Com RLS habilitada | 151 |
| **Com RLS e nenhuma policy** | **81** |

Quebrando as 81:

| Classe | Tabelas |
|---|---|
| Backup e pré-revert | 49 |
| **Operacionais** | **32** |

RLS ligada sem policy nega tudo para quem não tem BYPASSRLS — não é vazamento. Mas significa que **32 tabelas operacionais só são alcançáveis por credencial que ignora RLS**, hoje na prática `service_role`.

### Cruzamento executado — risco **não se materializa**

O desenho do conector é `financeiro_ro` sem BYPASSRLS lendo só views de interface. Se qualquer view do `VIEWS-PROPOSTAS-r2.sql` tocasse uma dessas 32, ela retornaria **vazio silencioso, não erro de permissão**.

Cruzei as 12 tabelas-fonte das views contra as 32. **Interseção vazia.** Todas as 12 têm RLS com pelo menos uma policy:

| Fonte | Policies | `tenant_id` |
|---|---|---|
| `leads` | 10 | ✅ |
| `custom_field_values` | 6 | ✅ |
| `funnels` · `custom_field_definitions` | 5 | ✅ |
| `funnel_stages` · `lead_funnel_position` · `custom_field_options` | 5 | ❌ |
| `users` · `partners` | 2 | ✅ |
| `usinas` · `usina_clientes` · `usina_geracao_mensal` | 1 | ✅ |

**O `VIEWS-PROPOSTAS-r2.sql` está liberado quanto a este risco.**

### Achado derivado — três fontes sem `tenant_id`

`funnel_stages`, `lead_funnel_position` e `custom_field_options` **não têm coluna `tenant_id`**. O isolamento delas é indireto, herdado do pai (`funnels`, `leads`, `custom_field_definitions`).

Consequência para as views: nenhuma delas pode ser filtrada por tenant diretamente. **O filtro tem que vir pelo join com o pai.** View que selecione dessas três sem amarrar o pai com filtro de tenant vaza entre empresas — e `lead_funnel_position` é justamente onde vive o sinal de conversão. Item de revisão obrigatória antes de aplicar o SQL.

Isto reforça o spike Prisma + RLS: o CRM é a prova de que "RLS habilitada" não é resposta suficiente.

---

## 3. Achado novo — 49 tabelas de backup com dado de lead no schema exposto

`bkp_funis_parceiros_20260715_leads` (77 colunas), `bkp_pa_leads_20260630` (74), `leads_backup_sonari_perfunnel_20260619` (71), `bkp_hausgo_cleanup_*`, e mais — 49 no total, contando as de pré-revert.

**21 delas carregam `tenant_id`**, nenhuma tem policy, e todas vivem em `public` — o schema publicado pela API. São cópias de base de lead de três empresas, sem política de retenção e sem dono declarado.

Nenhum documento do projeto menciona essas tabelas. Merece decisão explícita: mover para schema fora da API, ou descartar por data.

---

## 4. Achado novo — segredos em coluna de texto

A tabela `tenants` guarda, em `text` puro:

`openai_api_key` · `whatsapp_access_token` · `instagram_access_token` · `meta_page_access_token` · `meta_verify_token`

O `CLAUDE.md` regra 7 já estava marcada como errada. Aqui está a evidência de por quê, no próprio banco que serve de referência: **segredo por tenant não cabe em coluna comum.** A F1 do financeiro não deve herdar o padrão, e o ADR de segredos ganha um contraexemplo concreto para citar.

---

## 5. Achado novo — `data_vencimento` está 100% vazia

Nos 36 vínculos de `usina_clientes`, `data_vencimento` é nula em **todos**. A coluna aparece no `VIEWS-PROPOSTAS-r2.sql` (linha 139) e no `ADR-0002` como parte da UC, mas o preenchimento nunca foi medido.

Sem vencimento não há régua de cobrança, não há inadimplência, não há corte — os três dependem dela. É insumo da F2 e está zerado. Entra como questão de operação, ao lado das outras.

*(Complemento: `usinas.potencia_kwp` também é nula nas 3, e `usina_geracao_mensal` tem 8 linhas para 3 usinas.)*

---

## 6. `auditoria_ro` — **REMOVIDA em 24/07/2026** ✅

### O que foi executado

Autorizado pelo dono do projeto. Sequência real, que teve um passo a mais que o previsto:

```sql
-- 1. Falhou: postgres é membro com ADMIN, mas inherit_option = false
DROP OWNED BY auditoria_ro;
--    ERROR 42501: permission denied to drop objects

-- 2. Concessão do INHERIT a si mesmo, permitida pelo ADMIN OPTION
GRANT auditoria_ro TO postgres WITH INHERIT TRUE, SET TRUE;

-- 3. Remoção
DROP OWNED BY auditoria_ro;
DROP ROLE auditoria_ro;
```

### Verificação pós-execução

| Item | Resultado |
|---|---|
| Role existe | **0** |
| Grants residuais | **0** |
| Membros residuais | **0** |
| `financeiro_ro` e `reporting_ai` | **preservadas** |
| Restantes com BYPASSRLS + LOGIN | `postgres`, `supabase_admin`, `supabase_etl_admin`, `supabase_read_only_user` — todas geridas pela Supabase |

**Nota:** a concessão do passo 2 morreu junto com a role; não há privilégio residual a reverter. O aprendizado para o ADR de segurança: `pg_has_role(..., 'MEMBER')` retornar verdadeiro **não** significa poder usar os privilégios da role — em PG16+, `inherit_option` e `set_option` são independentes de `admin_option`. Vale como armadilha documentada para o RBAC do financeiro.

### Estado anterior, para registro



```
auditoria_ro | LOGIN | BYPASSRLS | válida até 2026-08-23 | sem limite de conexões
```

| Verificação | Resultado |
|---|---|
| Objetos que possui | **0** |
| Grants em tabelas | 156 |
| Pertence a grupos | 0 |
| Conexões ativas | **0** |

A remoção é limpa e não derruba nada em uso:

```sql
DROP OWNED BY auditoria_ro;   -- remove os 156 grants; não há objeto próprio
DROP ROLE auditoria_ro;
```

---

## 7. O que muda nos documentos

| Documento | Ação |
|---|---|
| `PRD-v2.2` §7.5 | **Nenhuma.** Está correto |
| `QUESTOES.md` | Somar: as 36 tabelas sem policy · retenção dos 45 backups · `data_vencimento` zerada |
| `VIEWS-PROPOSTAS-r2.sql` | Cruzar tabelas-fonte contra as 36 sem policy antes de aplicar |
| `CLAUDE.md` regra 7 | Citar `tenants.*_token` como contraexemplo |
| `ADR-0003` (spike) | Incluir o caso "RLS habilitada sem policy" na bateria de teste |
| `P8` (este) | Novo |

---

## 8. Estado real da F0 e da F1

| Item | Situação |
|---|---|
| Auditoria | ✅ concluída e reverificada, sem deriva |
| `DROP ROLE auditoria_ro` | ✅ **executada em 24/07** — único item com prazo, encerrado |
| Spike Prisma + RLS | **não iniciado** — precisa de repositório e ~2 dias |
| Decisões fiscais e de comissão | **abertas** — Vinicius, operação, contador |
| SPEC-001 | bloqueada: `_TEMPLATE-SPEC.md` **não está no repositório** |
| SPEC-002 | destravada quanto ao dado monetário; pendente das views e da F-02/F-03/F-04 |

Os quatro arquivos que faltavam — `_TEMPLATE-SPEC.md`, `QUESTOES.md`, `CLAUDE.md`, `ADR-0001` — **continuam ausentes**. O repositório tem os 8 da sessão anterior, e só.

---

## 9. A regra, corrigida por experiência própria

A sessão anterior fechou com *"medir antes de escrever custa minutos e economiza revisões inteiras"*. Hoje ela cobrou de mim: escrevi um relatório apresentando como descoberta o que já estava em quatro documentos, porque escrevi antes de ler.

**O corolário:** medir o banco não substitui ler o que já foi escrito sobre ele. As duas leituras são obrigatórias, e a barata vem primeiro.
