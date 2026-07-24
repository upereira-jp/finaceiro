# PRD — Sistema Financeiro G3 Solar

> Fonte de verdade do projeto. Toda decisão de implementação deriva deste documento.
> **Versão 2.2 — 23/07/2026.** Dono: Vinicius Leal.
> Leia junto com: `GLOSSARIO.md` · `QUESTOES.md` · `adr/` · `auditoria/`

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 16/07/2026 | Original |
| 2.0 | 23/07/2026 | Pós-auditoria do CRM: multi-tenancy, CRM como fundação, modelo de cliente |
| 2.1 | 23/07/2026 | Correção da relação com o CRM (sistema independente), do dado monetário (existe) e da infraestrutura real |
| **2.2** | **23/07/2026** | **Pós-P7 (topologia de funis): origem da carteira, dado monetário resolvido, correções em §4.2, §7.4, §7.5, §8 e §11** |

---

## 0. O que mudou da v1.0

| # | Mudança | Origem |
|---|---|---|
| 1 | O sistema é **multi-tenant** desde a primeira migration, com **tenants próprios** e mapeamento opcional para o CRM | ADR-0001 · correção v2.1 |
| 2 | O CRM sai da F5 e vira **fundação da F1**. Ele já contém rateio, geração por competência e classificação de parceiros | Auditoria P1–P4 |
| 3 | O CRM **tem campos monetários**, pouco preenchidos nas colunas nativas. O financeiro **lê onde houver e origina onde faltar** | Correção v2.1 |
| 4 | `cliente` é espelho de `leads` com **três** estados independentes — não duas entidades | ADR-0002 r2 |
| 5 | A G3 **não emite documento fiscal**; o módulo existe plugável e desligado | Q-002 |
| 6 | Folha de pagamento sai do escopo de cálculo: entra como resultado importado | Q-014 |
| 7 | Cinco fases viram **sete** | §10 |

---

## 1. Contexto e propósito

A G3 Solar é microempresa constituída em ~abril/2026, gestora e comercializadora de créditos de energia solar por geração compartilhada, e integradora. Clientes finais recebem energia compensada de usinas parceiras; a G3 fatura mensalmente cada cliente com **boleto unificado** (parcela da Equatorial + valor G3), recebe via Sicoob e distribui o dinheiro entre dono da usina, originadores comissionados e caixa próprio.

> **Correção da v1.0:** "consórcio gestor" era designação comercial. A G3 é pessoa jurídica única, não consórcio empresarial. Não há apuração proporcional por consorciada (Q-003).

Este sistema é a **única fonte de verdade sobre dinheiro**: faturamento, recebimento, inadimplência, split de repasse e financeiro corporativo.

**Princípio arquitetural central:** um sistema, dois domínios isolados, um livro-razão comum.

- **Domínio Carteira** — dinheiro dos clientes: faturamento, emissão Sicoob, recebimento, inadimplência, split de repasse.
- **Domínio Corporativo** — dinheiro da empresa: contas a pagar/receber, fluxo de caixa, DRE gerencial, conciliação, compras, cartão, folha importada.
- **Ponte = lançamento contábil automático.** Toda liquidação gera, no mesmo instante, receita no corporativo e contas a pagar provisionadas com beneficiário e vencimento. Nenhuma redigitação.

### 1.1 Sistema independente, multi-tenant, com leitura opcional do CRM

Este é um **sistema separado**. Não é módulo, extensão nem segundo produto da plataforma do CRM intreply. Tem projeto Supabase próprio, domínio próprio, tabela de tenants própria e ciclo de release próprio.

A única relação com o CRM é de **leitura**: o financeiro puxa dados de lá quando o tenant também usa o CRM.

**Os conjuntos de empresas se sobrepõem apenas em parte.** Algumas usam os dois sistemas; outras usarão só o financeiro; outras só o CRM. Três consequências diretas de modelagem:

1. O financeiro tem **UUIDs de tenant próprios**. Não reusa os do CRM.
2. Tenants que também usam o CRM ganham um registro de **conector**, com o `crm_tenant_id` correspondente. É um mapeamento opcional, não uma chave compartilhada.
3. O **conector CRM é opcional e configurável por tenant** — mesma forma do módulo fiscal: interface definida, implementação plugável, desligada por padrão.

Escopo da v1: **tenant-ready, não SaaS completo.** `tenant_id` e RLS desde o início, com um tenant semeado (G3). A superfície comercial — cadastro self-service, planos, cobrança da plataforma — fica para quando existir a segunda empresa. A parte irreversível (schema) se paga agora; a reversível (produto) espera.

---

## 2. Stack e infraestrutura

### 2.1 Decisões técnicas

| Item | Decisão | Racional |
|---|---|---|
| Frontend + backend | Next.js 15 (App Router) + TypeScript estrito | Full-stack coeso |
| Banco + Auth | Supabase (Postgres + Auth) em **projeto novo e exclusivo** | Padrão já operado pela casa |
| Isolamento | `tenant_id` em toda entidade + RLS com `FORCE ROW LEVEL SECURITY` | ADR-0001 |
| ORM | Prisma | Migrations versionadas, schema como contrato |
| UI | Tailwind + shadcn/ui, em pt-BR | Velocidade e consistência |
| Testes | Vitest (motor de split obrigatório) + Playwright | O split paga gente |
| Moeda | **Int em centavos**. Float proibido para dinheiro | Precisão |
| Arredondamento | Meio-para-cima por beneficiário; diferença vai para o líquido G3 | Soma dos splits = valor liquidado |
| Timezone | America/Sao_Paulo em toda lógica de datas | Competências e vencimentos |

### 2.2 Infraestrutura disponível hoje

| Recurso | Estado | Uso pelo financeiro |
|---|---|---|
| Plano Hostinger | ativo, com domínios disponíveis | domínio próprio do financeiro |
| Projeto Supabase PRO | **exclusivo do CRM e do site da G3** | não usar — o financeiro precisa de projeto próprio |
| VPS `srv1591367` | rodando o backend do CRM com 9 processos PM2 | possível host, com ressalvas |

### 2.3 A provisionar

- **Projeto Supabase novo** para o financeiro. Decidir se entra na mesma organização do projeto PRO (compartilha faturamento e cotas de organização) ou em organização separada (isolamento contratual maior).
- **Domínio** no plano Hostinger.
- **Host da aplicação** — decisão em aberto:

| Opção | A favor | Contra |
|---|---|---|
| Vercel | nativo para App Router, cron incluso, deploy trivial | custo adicional |
| VPS existente | custo zero marginal, cron por PM2 como já se faz | mistura dois sistemas de produção no mesmo host; incidente em um afeta o outro |

Agendamento de jobs (webhook Sicoob, retries, reconciliação, sync do CRM) segue a escolha do host. O CRM **não tem `pg_cron`** — todo trabalho periódico lá é polling por worker, e o financeiro herda essa realidade no conector.

### 2.4 Risco técnico aberto

Prisma usa pool com uma role única; a RLS avalia contra o contexto de sessão. **No CRM esse conflito é observável hoje:** uma role de serviço sem contexto de usuário lê zero linhas de qualquer tabela base, e é exatamente por isso que existem views owned-by-postgres lá.

**Spike obrigatório antes do schema definitivo** (ADR-0001): duas tabelas, dois tenants, teste automatizado provando que o tenant A não lê linha do tenant B nem forçando a query. Resultado vira ADR-0003. Se o spike falhar, a estratégia de acesso a dados muda inteira.

---

## 3. Papéis e permissões

Dois níveis, ambos **do financeiro** — sem relação com os papéis do CRM.

### Nível plataforma

| Papel | Pode |
|---|---|
| `plataforma_admin` | criar, suspender e configurar tenants |
| `plataforma_suporte` | diagnóstico; **nunca** lê dado financeiro de tenant sem trilha de auditoria |

### Nível tenant

| Papel | Carteira | Corporativo | Cadastros | Configuração |
|---|---|---|---|---|
| `admin` | total | total | total | total (regras de split, usuários, conector) |
| `financeiro` | leitura | total (aprovar e baixar pagamentos) | leitura | — |
| `cobranca` | total (faturar, emitir, negociar) | — | leitura | — |
| `leitura` | leitura | leitura | leitura | — |

Quem opera cobrança não mexe no DRE; quem paga contas não altera regra de comissão. Mudança em regra de split exige `admin` e gera auditoria.

**Pendente:** um usuário pode pertencer a mais de um tenant? (MT-01). Como as mesmas pessoas usarão os dois sistemas, vale avaliar SSO entre os projetos Supabase — mas o padrão é Auth próprio (MT-06).

---

## 4. Modelo de dados

Dinheiro em centavos (`Int`). Toda entidade de negócio tem `tenant_id` não-nulo. Todo índice único de negócio é composto com `tenant_id`.

### 4.1 Plataforma

- **tenant** — razão social, CNPJ, status, data de ativação. **UUID próprio do financeiro.**
- **usuario** e vínculo usuário ↔ tenant ↔ papel.
- **conector_crm** — configuração opcional, um por tenant: tipo (ex.: `intreply`), `crm_tenant_id` (o UUID daquela empresa no CRM), referência da credencial (nunca a credencial em si), status, última execução. É o que materializa a sobreposição parcial descrita em §1.1.

### 4.2 Cadastros

- **cliente** — espelho de `leads` do CRM quando o conector está ativo; cadastro local quando não. Chave `UNIQUE (tenant_id, crm_lead_id)` quando espelhado. Nome, telefone, e-mail, origem, consumo em kWh. Três estados derivados e **independentes**: *tem venda ganha*, *está na carteira* e *tem rateio ativo* (ADR-0002 r2).
  - CPF/CNPJ: no CRM existe só como custom field em texto livre, preenchido em 8–20%. O financeiro **coleta e valida o seu**, usando o do CRM como semente.
- **unidade_consumidora (UC)** — **entidade própria do financeiro**; no CRM não tem tabela nem status. Número da UC, distribuidora, endereço, titularidade, `usina_id`, percentual de rateio (lido do CRM), status (ativa, suspensa, cancelada), `crm_usina_cliente_id`.
- **usina** — espelho parcial: código da geradora, apelido, potência, distribuidora, geração nominal, série de geração por competência. Campos exclusivos do financeiro: **`dono_usina_id`**, `percentual_repasse` (default 70,00%), `data_homologacao`, flag de regime de Fio B.
- **dono_usina** — cadastro exclusivo do financeiro: nome/razão social, CPF/CNPJ, dados bancários/PIX, contato. **Nasce vazio** — no CRM, `usinas.dono_lead_id` está 100% nulo.
- **originador** — tipo (`vendedor_g3`, `parceiro_indicador`, `parceiro_captador`, `parceiro_captador_senior`), natureza PF/PJ, CPF/CNPJ, dados bancários, `crm_partner_id`.
  - O CRM conhece dois tipos em `g3_partner_rules`, três valores explícitos no custom field `Comissionamento` (25%, 30%, 50%) e nenhuma coluna de senioridade. **Tipo e senioridade são cadastro local, não espelho.**
- **contrato** — vincula cliente + UC + originador + usina. Data de fechamento, valor de referência, status, **contador de faturas cheias pagas**.
  - Valor de referência: lido de **`leads.consumo_reais`** quando o cliente vem do CRM — 100% preenchido nas populações medidas — e originado no financeiro quando faltar (ver §7.5).

### 4.3 Carteira

- **fatura** — por UC/competência. Componentes em centavos: `valor_consumo`, `valor_tarifas_concessionaria`, `valor_juros_multa`, `valor_total`. Status (`rascunho`, `emitida`, `paga`, `vencida`, `cancelada`, `negociada`), vencimento, `flag_fatura_cheia`.
- **boleto** — 1:1 com fatura, **híbrido** (código de barras + QR Pix). Nosso número, linha digitável, ids Sicoob, status no banco, payloads de ida e volta.
- **liquidacao** — fatura, data, valor liquidado, origem (webhook / conciliação), juros e multa apurados.
- **split_execucao** + **split_item** — um item por beneficiário: tipo (`repasse_usina`, `comissao`, `liquido_g3`), beneficiário, base de cálculo, percentual aplicado, valor, versão da regra usada.
- **inadimplencia** — visão derivada + registro de tratativas, acordos e histórico de contato. **Produzida aqui.** O funil de clientes ativos do CRM tem etapa `INADIMPLENTES`, que **não é fonte**: lê-la seria ler a própria saída do financeiro com atraso (F-03).

### 4.4 Corporativo

- **conta_pagar / conta_receber** — descrição, categoria, centro de custo, beneficiário, competência, vencimento, valor, status, `origem_split_item_id` (nullable). Quando nasce de split, o vínculo é obrigatório, o valor é **imutável** e registra a despesa **bruta**.
- **pagamento** — evento separado da conta a pagar. Gera saída líquida ao beneficiário mais contas a recolher quando houver retenção. É aqui que a retenção sobre PF mora, sem violar a imutabilidade (Q-011).
- **conta_bancaria** — multi-conta, com transferência entre contas.
- **categoria** e **centro_custo** — plano gerencial do DRE.
- **movimento_caixa** — livro-razão: data, conta, valor, vínculo de origem.
- **extrato_importado / conciliacao** — extrato por API Sicoob (primário) ou OFX (fallback).
- **cartao_credito** e **fatura_cartao** — competência ≠ caixa.
- **fornecedor** e **compra**.

### 4.5 Fiscal (plugável, desligado para a G3)

- **documento_fiscal** — entidade e gancho de emissão existem no schema desde a F1. A implementação concreta entra quando um tenant precisar. Campos de IBS/CBS aplicam-se ao módulo de **compras** mesmo com a emissão desligada, porque chegam destacados nos documentos de fornecedores.

### 4.6 Configuração e auditoria

- **regra_split (versionada por tenant)** — nunca editada no lugar. Cada mudança cria versão com vigência. Percentual de repasse default e tabela de comissão.
- **auditoria** — quem, quando, o quê, antes/depois — para regras, beneficiários, papéis e baixas manuais.

---

## 5. Regras de negócio — motor de split

### 5.1 Composição da fatura

`valor_total = valor_consumo + valor_tarifas_concessionaria (+ valor_juros_multa)`

- `valor_consumo` — energia compensada cobrada pela G3. **Base de todo o split.**
- `valor_tarifas_concessionaria` — fio B, iluminação pública, encargos. Repasse puro à Equatorial. **Ninguém comissiona nem repassa sobre isso.**
- Na v1, os dados da Equatorial entram por planilha ou lançamento manual por competência. Não existe API pública da distribuidora.

> ⛔ **Bloqueado (Q-021).** A fórmula que converte geração em `valor_consumo` depende de decidir se a base é a **geração nominal** (`usinas.geracao_kwh_mensal`, que o rateio do CRM usa) ou a **série real por competência** (`usina_geracao_mensal`). Faturar pela nominal é faturar uma projeção; pela real, o painel do CRM e o financeiro divergem. Nenhuma spec de faturamento avança sem essa decisão.

### 5.2 Disparo

O split roda **exclusivamente na liquidação** (regime de caixa), por webhook Sicoob ou baixa via conciliação. **Nunca na emissão.** Boleto registrado não aceita pagamento parcial: liquidação é sempre pelo valor cheio.

### 5.3 Repasse ao dono da usina

`repasse = percentual_repasse_usina × (valor_consumo + juros_multa_proporcionais)`

Default 70,00%, configurável por usina. Juros e multa entram na base proporcionalmente. Tarifas da concessionária ficam fora.

### 5.4 Comissões

Base de incidência: **somente `valor_consumo`** — sem juros, multa ou tarifas. Escalonamento pela 1ª e 2ª fatura cheia paga do contrato.

| Tipo de originador | Total | 1ª cheia | 2ª cheia |
|---|---|---|---|
| Vendedor G3 | 50% | 25% | 25% |
| Parceiro indicador | 25% | 25% | — |
| Parceiro captador | 50% | 30% | 20% |
| Parceiro captador sênior | 60% | 30% | 30% |

- Fatura não-cheia não avança o contador nem gera comissão.
- Da 3ª cheia em diante, comissão zero. O contador vive no contrato.

> ⚠️ **Três modelos de comissão convivem hoje.** (1) `app_settings.g3_partner_rules`: dois tiers flat, `captacao` 50% e `indicacao` 25%. (2) Custom field `Comissionamento` (`selecao`), preenchido em 335 leads — mas 303 deles com o valor `PADRAO`, que não diz qual regra se aplica; o sinal real são 32 leads, distribuídos em `25%` (20), `50%` (9) e **`30%` (3)**. (3) Esta tabela do PRD, com quatro tipos e escalonamento. **O valor `30%` não existe em nenhum dos outros dois modelos.** Nada disso é herdado sem confirmação explícita antes da F3 (AUD-05).
>
> ⚠️ **Entrada frágil (Q-022).** `partner_id` está preenchido em 3% dos leads. Existe também o custom field `Nome do vendedor` (texto curto) em **286 leads** — ou seja, **vendedor interno existe no CRM**, ao contrário do que a auditoria registrou, só que como texto livre, sem chave estrangeira e sujeito a variação de grafia. A atribuição contrato → originador precisa de caminho próprio no financeiro, podendo usar esses 286 como semente de conciliação, nunca como chave.

### 5.5 Líquido G3 e ponte contábil

`liquido_g3 = valor_liquidado − repasse_usina − comissões − valor_tarifas_concessionaria`

Na mesma transação do split:
1. `movimento_caixa` de entrada (valor liquidado) na conta Sicoob
2. `conta_pagar` provisionada por beneficiário, valor **bruto**, vencimento default dia 10 do mês seguinte (configurável)
3. `conta_pagar` do repasse à Equatorial, agrupável por competência
4. Receita G3 refletida no fluxo e no DRE pela categoria correta

**Invariante inegociável:** soma dos `split_item` = valor liquidado, ao centavo. Diferenças de arredondamento vão sempre para o líquido G3. Falha em qualquer parte reverte tudo.

**Segunda invariante, de igual peso (ADR-0001):** nenhum `split_item` referencia beneficiário de outro tenant.

### 5.6 Consequência assumida

Com captador sênior, o líquido G3 sobre consumo é **zero** nas duas primeiras faturas de cada contrato (70% + 30%). Com vendedor interno, 5%. Lucro real começa na 3ª fatura. É CAC concentrado por design; o fluxo projetado mostra isso **sem suavização**.

**Fator novo:** o Fio B sobe de 60% (2026) para 75% (2027), 90% (2028) e integral em 2029. Todas as usinas da G3 estão nesse regime — nenhuma tem direito adquirido. A economia entregue ao cliente encolhe a cada janeiro. Se o contrato não tiver cláusula de reajuste, a margem absorve (Q-020).

---

## 6. Integração Sicoob

- OAuth2 com certificado A1 (mTLS). **Sandbox primeiro**; virada para produção é troca de credenciais e endpoint, sem código condicional por ambiente.
- **Segredos por tenant** em armazenamento cifrado — cada empresa tem sua conta, seu certificado, seu `client_id`. Segredos da plataforma seguem em variáveis de ambiente (revisão da regra 7 do `CLAUDE.md`).
- **Cobrança v3:** registrar boleto híbrido, consultar situação, webhook de liquidação, baixa e cancelamento. Payloads persistidos no boleto para auditoria.
- **Conta corrente:** saldo, extrato e transferências. Fonte primária de conciliação; OFX vira fallback.
- **Pagamentos:** Pix por chave, TED, pagamento de boletos. Habilita pagamento em lote de comissões e fornecedores.
- Resiliência: fila de emissão com retry exponencial; webhook idempotente (liquidação duplicada não roda split duas vezes); **consulta ativa diária** dos boletos em aberto para capturar liquidações cujo webhook falhou.
- Alerta de expiração do certificado A1 — vencido, a emissão para sem erro óbvio.

---

## 7. Integração CRM intreply

### 7.1 Natureza da relação

O financeiro é independente (§1.1). O CRM é uma **fonte de leitura opcional**, ativada por tenant através da entidade `conector_crm`. Um tenant sem conector opera com cadastro inteiramente local.

### 7.2 O que o CRM é

Postgres multi-tenant do SaaS intreply, servindo hoje três empresas. 151 tabelas em `public`, **todas com RLS** baseada em `auth.uid()`.

**Consequência inescapável:** uma role de serviço sem contexto de usuário lê **zero linhas** de qualquer tabela base. O conector lê **exclusivamente views de interface**, que são owned por `postgres` e enxergam tudo pelo privilégio do dono.

### 7.3 Acesso

Role `financeiro_ro` (já existe no CRM): read-only, sem `BYPASSRLS`, SELECT apenas nas views. Connection string referenciada pelo `conector_crm`, nunca embutida em código.

Toda consulta filtra o `crm_tenant_id` daquele tenant. Sem isso, agregados misturam empresas distintas. **Isso é invariante de código com teste automatizado, não convenção.**

**Jamais INSERT, UPDATE ou DELETE. Jamais leitura de tabela fora das views.**

### 7.4 Views de interface

Existem no schema `financeiro` do CRM, todas owned por `postgres` (verificado):

| View | Conteúdo | Estado |
|---|---|---|
| `vendas_ganhas` | leads com `stage_type='won'` | ⚠️ **sem filtro de funil** — inclui 7 do funil Parceiros e 1 de Integração. Exige filtro de funil **antes** do dedup por `lead_id` |
| `rateio_clientes` | vínculo UC ↔ usina, com `percentual_rateio` | ⚠️ **não expõe `lead_id`** — só `codigo`. Impede upsert por uuid |
| `usinas` | cadastro de usinas | ⚠️ não expõe `dono_lead_id` |
| `parceiros` | parceiros + usuários | ok — expõe `partner_id` e `lead_origem_id` |

Propostas e pendentes de aplicação pelo dev do CRM (`VIEWS-PROPOSTAS.sql` r2): `geracao_mensal` (série por competência), `rateio_creditos` (crédito em kWh, **bloqueada pela Q-021**) e **`carteira_ativa`** (participação no funil de clientes ativos — a view que o conector realmente consome).

**Decisão (Q-023):** consumir `financeiro.*` diretamente, sem aliases `integracao.vw_*`. Uma camada a menos para manter.

> ⚠️ **MT-08 — a camada de interface é mono-tenant.** Todas as views carregam o UUID da G3 como literal no corpo, em até três pontos. O `crm_tenant_id` no conector é necessário e não suficiente: enquanto o lado do CRM não parametrizar, um segundo tenant exige view nova, não configuração. Aceito para a F1; bloqueia no segundo tenant com CRM.

### 7.5 Dado monetário — resolvido

**O dado existe e está completo.** A verificação que a v2.1 marcava como prioritária foi executada em 23/07/2026:

| Campo | Tipo | Preenchimento medido |
|---|---|---|
| **`leads.consumo_reais`** | numeric | **38 de 38** na carteira · **38 de 38** nos ganhos de Vendas - Assinatura |
| `leads.valor_venda` | numeric sem escala | 0 nas duas populações |
| `leads.valor_investimento` | numeric(12,2) | 0 nas duas populações |
| `lead_funnel_position.valor` | numeric | 0 nas duas populações |

**Por que as colunas nativas estão vazias:** `funnels.valor_mode = 'consumo_solar'` em todos os cinco funis da G3. O CRM **deriva** o valor exibido a partir do consumo, então ninguém preenche `valor_venda` nem `valor_investimento`. Elas estão mortas **por desenho, não por negligência** — e nenhuma spec deve construir sobre elas nem tratá-las como lacuna a preencher.

A hipótese de que o dado viveria em custom field de tipo `moeda` ficou **sem objeto**. A `vendas_ganhas` já expõe `consumo_reais` e `consumo_kwh`.

**Regra vigente:** o valor de referência é lido de `leads.consumo_reais` quando o cliente vem do CRM, e originado no financeiro quando faltar — para tenant sem conector, ou cliente cadastrado localmente.

**Nota de conversão:** vários campos são `numeric` sem escala definida e permitem frações de centavo — a auditoria encontrou `28.941` em `valor_venda`. Toda leitura monetária converte com `round(valor × 100)` para `Int` em centavos. Nenhum campo do CRM usa `float`, o que elimina o risco clássico de imprecisão na origem.

**kWh e percentual não são dinheiro:** `geracao_kwh`, `consumo_kwh`, `potencia_kwp` e `percentual_rateio` mantêm escala decimal e não passam pela conversão.

### 7.6 Estratégia de sincronização

**Full-scan de todo o núcleo a cada ciclo**, com upsert pelo `id` uuid da origem e reconciliação de conjunto para detectar exclusões.

Por que não incremental: `updated_at` não tem trigger de banco nas tabelas de usina — backfills e SQL administrativo não o atualizam (83% de `usina_clientes` tem `updated_at < created_at`). E `lead_funnel_position`, onde vive o sinal de conversão, não tem timestamp nenhum. Somado a isso, o núcleo da G3 é minúsculo (334 leads, 9 parceiros, 3 usinas, 36 rateios): um ciclo completo custa segundos.

O CRM usa **hard delete** sem log garantido. Registro que some é detectado por diferença de conjunto, não por evento.

Ciclo: a cada 30 minutos, mais botão manual por entidade. Sem `pg_cron` no CRM — é polling do lado do financeiro. Push por trigger é evolução futura possível, não requisito.

### 7.7 Propriedade do dado

| Domínio | Dono |
|---|---|
| Identidade, funil, vínculos, cadastro técnico da usina | **CRM** — o financeiro espelha e não sobrescreve |
| Valores em R$ | **Financeiro** — lidos do CRM como semente quando existirem, mas o financeiro é system-of-record |
| `percentual_rateio` e geração em kWh | **CRM** — só ele valida o teto de 100% e o teto de kWh alocável |
| CPF/CNPJ e dados bancários | **Financeiro** completa e vence |
| Tipo de originador, senioridade, escalonamento | **Financeiro** — não existe no CRM |

Detalhe campo a campo em `auditoria/MATRIZ-PROPRIEDADE.md`.

### 7.8 Unidirecional absoluto

O financeiro nunca escreve no CRM. Necessidade inversa futura (ex.: bloquear cadência de inadimplente) será endpoint exposto pelo financeiro e consumido pelo CRM.

---

## 8. Qualidade de dados herdada

O sistema nasce sobre dados incompletos. Isto não é ressalva de rodapé — é **requisito de tela**.

| Situação hoje | O financeiro faz o quê |
|---|---|
| Vendas ganhas e clientes de rateio em funis diferentes, zero em comum, **sem mecanismo de convergência** | dois painéis de reconciliação, não duas entidades |
| **Funil de carteira vazio**, e nenhuma automação configurada em funil algum | a carteira legada precisa de migração pontual antes do piloto (F-01) |
| `vendas_ganhas` mistura 7 parceiros e 1 obra de integração nos 46 "ganhos" | filtro de funil na view, antes do dedup |
| Views de interface não expõem `lead_id` nem `dono_lead_id` | correção proposta; é pré-requisito do conector |
| Etapa `INADIMPLENTES` existe no CRM e só o financeiro sabe preenchê-la | não ler etapa; ler participação (F-03) |
| Rateio soma 91,2% e 99,78% em 2 de 3 usinas | alerta quando Σ% ≠ 100 |
| `dono_lead_id` 100% nulo | cadastro local obrigatório antes do primeiro repasse |
| CPF/CNPJ em 8–20%, em campo livre | coleta e validação próprias |
| `partner_id` em 3%; `Nome do vendedor` em texto livre em 286 leads; `Comissionamento` com 90% em `PADRAO` | atribuição própria de contrato → originador; os campos do CRM entram como semente, não como chave |
| Valor de referência **existe e está 100% preenchido** em `leads.consumo_reais`; `valor_venda` está morto por desenho | ler `consumo_reais`; nunca construir sobre `valor_venda` |
| Sem sinal de competência fechada | o financeiro cria o conceito; nunca faturar por ausência de linha |
| Regra dos 25% não implementada em lugar nenhum | alerta configurável (sugestão: 20%) |
| Posição de etapa abandonada no meio do funil (etapa terminal do Rateio vazia com 38 leads dentro) | gatilho de faturamento não depende de posição de etapa |
| `leads.status` mede 6 onde `stage_type='won'` mede 46 — dos quais só 38 são assinatura | **nunca** usar `status`; e `won` só com funil restrito |

---

## 9. Telas mínimas

**Carteira:** dashboard (a receber, recebido, inadimplência, próximos vencimentos) · geração de faturamento por competência (import → conferência → emissão em lote) · detalhe de fatura e boleto · inadimplência com tratativas · extrato de splits com drill-down (fatura → liquidação → itens) · repasses por dono de usina · comissões por originador · **reconciliação venda × rateio**.

**Corporativo:** contas a pagar/receber com fila de aprovação · pagamento em lote com retenções · fluxo de caixa realizado e projetado · DRE por categoria e centro de custo · conciliação · contas bancárias · cartão de crédito · compras e fornecedores.

**Config:** usuários e papéis (dois níveis) · regras de split versionadas · cadastros · **conector CRM** (status, última execução, fila de pendências).

---

## 10. Fases

| Fase | Entrega | Critério de saída |
|---|---|---|
| **F0** | Auditoria do CRM ✅ · spike Prisma+RLS · decisões fiscais e de comissão · provisionamento de infra | Isolamento provado por teste; `QUESTOES.md` sem bloqueio vermelho |
| **F1** | Fundação: projeto, auth, RBAC dois níveis, schema completo com `tenant_id`, cadastros, **conector CRM read-only** | `migrate reset` limpo; sync idempotente; teste de escrita no CRM falha por permissão |
| **F2** | Faturamento + Sicoob sandbox: composição, import Equatorial, boleto híbrido, webhook, inadimplência | Boleto liquidado no sandbox baixa a fatura automaticamente |
| **F3** | Motor de split + ponte contábil + painéis de repasse e comissão | Bateria de testes passando, incluindo invariante do centavo e isolamento entre tenants |
| **F4** | Corporativo: AP/AR, contas bancárias, fluxo de caixa, DRE, conciliação por API Sicoob | DRE fecha ao centavo; conciliação bate o extrato de teste |
| **F5** | Compras, fornecedores, cartão de crédito, folha importada | Fatura de cartão concilia; folha importada aparece no DRE |
| **F6** | Rateio, Fio B, lista de rateio, pagamento em lote com retenção | Cenário seed reproduz o §5.6 sem suavização |
| **F7** | Portais externos, módulo fiscal ligado, briefings | — |

Nenhuma fase avança sem os critérios da anterior verificados. Antes do go-live: **piloto sombra** — duas competências rodando em paralelo ao controle manual, com divergência zero ao centavo.

---

## 11. O que ainda bloqueia

**Resolvido desde a v2.1:** onde mora o dado monetário (§7.5) · schema de interface, `financeiro.*` direto (Q-023) · se venda ganha e cliente de rateio são a mesma entidade (ADR-0002 r2 — sim, mesma entidade em funis diferentes).

| ID | Pergunta | Bloqueia | Responde |
|---|---|---|---|
| F-01 | A carteira legada (36 clientes) é migrada para o funil de clientes ativos antes do go-live? Sem isso o conector lê zero | piloto sombra, F2 | Vinicius + operação |
| F-02 | Quais funis contam como conversão final para a automação? | conector, F1 | Vinicius |
| F-03 | Quem mantém a etapa `INADIMPLENTES`? Write-back colide com a regra 6 | forma do conector, F1 | Vinicius |
| F-04 | O conector lê participação no funil ou etapa dentro dele? | gatilho, F2 | Vinicius |
| F-05 | Vendas - Integração entra na mesma carteira? | modelo de faturamento | Vinicius |
| Q-021 | Faturar pela geração nominal ou pela série real? | fórmula de faturamento, F2 | Vinicius + dev CRM |
| Q-005 aud. | Vale a tabela de comissão do PRD ou a do CRM? | motor de comissão, F3 | Vinicius |
| Q-022 | Como o contrato é atribuído ao originador, com 3% de cobertura? Medir antes o custom field `Comissionamento` | motor de comissão, F3 | Vinicius |
| Q-004 aud. | Como o financeiro sabe que a competência está fechada? | gatilho de faturamento, F2 | Vinicius + operação |
| Q-002 aud. | Rateio incompleto é intencional? | cálculo de crédito, F6 | operação |
| Q-011 | Retenção sobre comissão a PF | pagamento, F6 | contador |
| MT-06 | Auth próprio ou SSO com o CRM? | RBAC, F1 | Vinicius |
| MT-08 | Quem parametriza as views para deixarem de conter o tenant literal? | segundo tenant | dev CRM |
| — | Host da aplicação: Vercel ou VPS existente? | F0, deploy | Vinicius |
