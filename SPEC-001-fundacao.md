# SPEC-001 — Fundação: plataforma e cadastros

| Campo | Valor |
|---|---|
| **Status** | Rascunho — aguarda aceite |
| **Versão** | 2.1 |
| **Data** | 24/07/2026 |
| **Autor** | Vinicius Leal |
| **Fase** | F1 |
| **Depende de** | **ADR-0003** (spike Prisma + RLS) para o mecanismo de contexto de tenant — ver §3.2 |
| **Bloqueia** | SPEC-002 (conector), faturamento (F2), split (F3) — tudo |
| **Documentos-fonte** | `PRD-v2.2` §2, §3, §4.1, §4.2, §7.7, §7.8, §8 · `ADR-0001` · `ADR-0002` r2 · `GLOSSARIO` · `P8` §2, §4, §5, §6 |
| **Questões abertas** | MT-06, AUD-09, AUD-10 e as seis de Q-SPEC001 na §10 |

> **v2.0 — o §4.1 foi absorvido.** A v1.0 tratava só cadastros e declarava a plataforma como pré-requisito inexistente. Decisão de 24/07: esta spec cobre as duas camadas. Não haverá SPEC-000.

---

## 1. Objetivo

Erguer a fundação inteira do financeiro: a camada de plataforma que define **quem existe e quem pode o quê** (tenant, usuário, papéis, conector), e a camada de cadastro que define **sobre o que o sistema opera** (cliente, UC, usina, dono, originador, contrato).

É a spec que decide quem manda em cada campo e quem enxerga cada linha. Errar aqui propaga para faturamento, split e repasse — e, no caso do isolamento, propaga para fora da empresa.

## 2. Escopo

### Entra

- **Plataforma:** `tenant`, `usuario`, vínculo usuário↔tenant↔papel, RBAC de dois níveis, `conector_crm`, trilha de acesso da plataforma
- **Cadastros:** `cliente`, `unidade_consumidora`, `usina`, `usina_geracao`, `dono_usina`, `originador`, `contrato`
- `cliente_estado_crm` — **o schema**, não o preenchimento
- O **contrato de isolamento**: forma das policies e a função de contexto que elas invocam
- Validação de CPF/CNPJ, referência de credencial, auditoria de escrita

### Não entra

- **A implementação da função de contexto de tenant** — é saída do spike, vira `ADR-0003` (§3.2)
- **A lógica de sincronização** e o preenchimento de `cliente_estado_crm` — SPEC-002
- **Fatura, boleto, liquidação, split, inadimplência** — F2 e F3
- **Cadastros corporativos** (fornecedor, categoria, centro de custo, conta bancária) — F4
- **Migração da carteira legada** (F-01) — ação de operação dentro do CRM, não código do financeiro
- **Provisionamento** do projeto Supabase, domínio e host — infraestrutura, PRD §2.3

---

## 3. Modelo de dados

Convenções herdadas: dinheiro em `Int` centavos com sufixo `_centavos`; `kWh`, potência e percentual mantêm escala decimal; `timestamptz` em todo timestamp; `tenant_id uuid NOT NULL` em toda entidade de negócio; índice único de negócio sempre composto com `tenant_id`; **RLS com `FORCE ROW LEVEL SECURITY` e ao menos uma policy** em todas.

> **Por que "e com policy" é explícito:** o P8 §2 mediu 32 tabelas operacionais no CRM com RLS habilitada e nenhuma policy. Habilitar sem policiar nega tudo silenciosamente — o modo de falha é resultado vazio, não erro de permissão. Não herdamos esse padrão, e há teste para isso na §9.

### 3.1 Plataforma

#### `tenant`

`id uuid PK` (**UUID próprio do financeiro**, ADR-0002 r2 Decisão 1) · `razao_social` · `cnpj` · `status enum ativo|suspenso|encerrado` · `data_ativacao` · timestamps.

`UNIQUE (cnpj)` — aqui **sem** `tenant_id` composto: é a tabela raiz.

#### `usuario`

`id uuid PK` · `auth_user_id uuid NOT NULL UNIQUE` (referencia `auth.users` do Supabase Auth do projeto novo) · `nome` · `email` · `ativo bool`.

Auth **próprio**, não SSO com o CRM (PRD §3, MT-06 em aberto). O financeiro tem projeto Supabase exclusivo; SSO seria federação entre projetos e não é o padrão decidido.

#### `usuario_tenant`

`usuario_id` · `tenant_id` · `papel enum admin|financeiro|cobranca|leitura` · `ativo`.

`UNIQUE (usuario_id, tenant_id)`

**Modelado como N:N deliberadamente.** MT-01 (um usuário pode pertencer a mais de um tenant?) segue aberta, mas a forma N:N é o superconjunto: se a resposta for "não", acrescenta-se `UNIQUE (usuario_id)` — uma constraint. O caminho inverso, de 1:N para N:N, seria migração com reescrita de policy. Escolhe-se o lado barato do erro.

#### `plataforma_admin`

`usuario_id` · `tier enum plataforma_admin|plataforma_suporte`.

Nível plataforma, **sem** `tenant_id` — é justamente quem atravessa tenants.

#### `acesso_plataforma_log`

`usuario_id` · `tenant_id` · `acao` · `recurso` · `ocorrido_em`.

Existe porque o PRD §3 exige: `plataforma_suporte` faz diagnóstico e **nunca lê dado financeiro de tenant sem trilha**. Sem esta tabela, a regra é texto sem mecanismo.

#### `conector_crm`

| Campo | Tipo | Notas |
|---|---|---|
| `tenant_id` | uuid **UNIQUE** | um por tenant, opcional |
| `tipo` | enum `intreply` | extensível |
| `crm_tenant_id` | uuid NOT NULL | o UUID daquela empresa **no CRM** |
| `credencial_ref` | text NOT NULL | **referência, nunca a credencial** |
| `ativo` | bool NOT NULL default **false** | desligado por padrão |
| `ultima_execucao_em` | timestamptz NULL | |
| `ultimo_status` | enum `ok`\|`erro`\|`nunca_executou` | |

`credencial_ref` aponta para armazenamento cifrado. **Nunca uma coluna com o segredo.** O P8 §4 encontrou `openai_api_key`, `whatsapp_access_token`, `instagram_access_token`, `meta_page_access_token` e `meta_verify_token` em `text` puro na tabela `tenants` do CRM. É o contraexemplo, e ele está no banco ao lado.

### 3.2 O contrato de isolamento

Toda tabela com `tenant_id` recebe:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <t>
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
```

**`app.current_tenant_id()` é uma costura declarada, não uma implementação.** O PRD §2.4 e o ADR-0002 §79 registram o problema: Prisma usa pool com role única, a RLS avalia contexto de sessão, e no CRM **uma role de serviço sem contexto de usuário lê zero linhas de qualquer tabela base** — foi o que travou o P1/P2 da auditoria e a razão de existirem as views `financeiro.*` owned por `postgres`.

O spike (ADR-0003) decide **como** a função obtém o tenant: `SET LOCAL` por transação, `auth.uid()` com join, ou conexão por tenant. Esta spec fixa o **contrato** — toda policy invoca essa função e nada mais — para que a decisão do spike troque uma definição e não 40 policies.

**Consequência honesta:** o schema desta spec é implementável hoje; as policies só ficam definitivas depois do ADR-0003. Migration de tabela e migration de policy são separadas por isso.

**Ressalva, registrada em 24/07:** o schema sobrevive às **três** saídas candidatas acima, porque nenhuma delas remove `tenant_id` da tabela. Não sobrevive ao cenário em que nenhuma das três se sustenta e a estratégia de acesso a dados muda inteira — schema por tenant ou banco por tenant apagariam a coluna. O PRD §2.4 foi emendado na mesma data para registrar esta ordem; a redação anterior dizia "spike antes do schema definitivo" e contradizia esta seção.

### 3.3 Cadastros

#### `cliente`

| Campo | Tipo | Origem | Notas |
|---|---|---|---|
| `crm_lead_id` | uuid NULL | **CRM** | nulo em cadastro local |
| `nome`, `telefone`, `email`, `origem` | text | CRM (espelho) / local | |
| `consumo_kwh` | numeric | **CRM** | decimal, não é dinheiro |
| `consumo_referencia_centavos` | int NULL | **semente** | `round(leads.consumo_reais × 100)` |
| `documento` | text NULL | **financeiro** | só dígitos |
| `documento_tipo` | enum `cpf`\|`cnpj` | financeiro | |
| `documento_validado` | bool default false | financeiro | |
| `documento_origem` | enum `crm_semente`\|`coleta_local` | financeiro | |
| `ativo` | bool default true | financeiro | |

```sql
UNIQUE (tenant_id, crm_lead_id) WHERE crm_lead_id IS NOT NULL
UNIQUE (tenant_id, documento)   WHERE documento IS NOT NULL
```

**Os três estados do ADR-0002 r2 não são colunas desta tabela.** Identidade e estado são coisas diferentes.

#### `cliente_estado_crm`

`cliente_id PK/FK` · `tenant_id` · `tem_rateio_ativo` (**vigente**) · `tem_venda_ganha` (**bloqueado por F-02**) · `em_carteira` (**bloqueado por F-01 e F-04**) · `sincronizado_em`.

Escrito **apenas** pelo conector. Nenhuma tela edita. As oito combinações são válidas; nenhuma é erro.

#### `unidade_consumidora`

`cliente_id FK NOT NULL` · `numero_uc` · `distribuidora` · `endereco_*` (**local**, não existe no CRM) · `titularidade enum propria|terceiro|em_troca` (mapeia `usina_clientes.troca_titularidade`) · `usina_id FK NULL` · `percentual_rateio numeric(7,4) NULL` (**espelho do CRM**) · `data_vencimento date NULL` (**100% vazia no CRM**, P8 §5) · `status enum ativa|suspensa|cancelada` (**do financeiro** — não existe no CRM) · `crm_usina_cliente_id`.

```sql
UNIQUE (tenant_id, numero_uc)
UNIQUE (tenant_id, crm_usina_cliente_id) WHERE crm_usina_cliente_id IS NOT NULL
```

#### `usina`

`codigo_geradora` · `apelido` · `distribuidora` · `potencia_kwp numeric NULL` (**100% nula hoje**, P8 §5) · `geracao_nominal_kwh` · `crm_usina_id` · **`dono_usina_id FK NULL`** (local, nasce vazio) · **`percentual_repasse numeric(5,2) default 70.00`** · `data_homologacao` · `regime_fio_b bool default true` · `status`.

`UNIQUE (tenant_id, codigo_geradora)`

#### `usina_geracao`

`usina_id` · `competencia date` (dia 1) · `geracao_kwh numeric` · `origem enum crm|local`.
`UNIQUE (tenant_id, usina_id, competencia)`

#### `dono_usina` · `originador`

Ambos **exclusivamente locais**. Nome/razão social · `documento` + `documento_tipo` + `documento_validado` · natureza PF/PJ · dados bancários (`banco`, `agencia`, `conta`, `tipo_conta`, `chave_pix`, `tipo_chave_pix`) · contato · `ativo`.

`originador` acrescenta `tipo enum vendedor_g3|parceiro_indicador|parceiro_captador|parceiro_captador_senior` (**local — não existe no CRM**) e `crm_partner_id uuid NULL` (semente; preenchido em 3% lá).

`UNIQUE (tenant_id, documento)` nas duas.

#### `contrato`

`cliente_id` · `unidade_consumidora_id` · `usina_id` · `originador_id NULL` · `data_fechamento` · **`valor_referencia_centavos int NOT NULL`** · `valor_referencia_origem enum crm_consumo_reais|local` · `status enum rascunho|ativo|suspenso|encerrado` · `faturas_cheias_pagas int default 0`.

```sql
UNIQUE (tenant_id, unidade_consumidora_id) WHERE status = 'ativo'
```

---

## 4. Regras de negócio

### Plataforma

> **R1.** Todo acesso a dado de tenant passa por vínculo ativo em `usuario_tenant`. Ausência de vínculo é indistinguível de tenant inexistente — 404, nunca 403, para não vazar existência.

> **R2.** `plataforma_suporte` que leia dado financeiro de tenant **grava linha em `acesso_plataforma_log` na mesma transação**. Falha ao gravar a trilha aborta a leitura.

> **R3.** `plataforma_admin` cria, suspende e configura tenants; **não** ganha papel de tenant por isso. Para operar dentro de um tenant precisa de vínculo explícito, e o vínculo é auditado.

> **R4.** Mudança de papel em `usuario_tenant` exige `admin` do tenant e gera auditoria.

> **R5.** `conector_crm` nasce `ativo = false`. Ativação exige `admin` e `credencial_ref` preenchida.

> **R6.** Nenhuma credencial é gravada em coluna. Só `credencial_ref`. Violação disto é falha de revisão, não de runtime.

### Cadastros

> **R7.** Documento é armazenado **só com dígitos** e validado por dígito verificador na escrita.

> **R8.** Documento vindo do CRM entra com `documento_origem = 'crm_semente'` e `documento_validado = false`, **mesmo passando na validação**. Semente não é confirmação — lá ele vive em campo livre com 8–20% de preenchimento.

> **R9.** Documento inválido **não bloqueia o cadastro**, mas **bloqueia a transição do contrato para `ativo`**. O sistema nasce sobre dado incompleto; travar na porta impediria a própria migração.

> **R10.** `percentual_rateio` é **read-only** quando a UC tem `crm_usina_cliente_id`. Só o CRM valida o teto de 100% e o de kWh alocável (PRD §7.7).

> **R11.** Σ `percentual_rateio` por usina **acima de 100% é rejeitado**; **abaixo gera alerta e passa**. Hoje duas usinas somam 91,20% e 99,78% — bloquear pararia a operação real.

> **R12.** `dono_usina_id` nulo **não bloqueia** o cadastro da usina, mas **bloqueia a execução de repasse** (F3). Hoje é nulo em 3 de 3.

> **R13.** `valor_referencia_centavos` vem de `round(leads.consumo_reais × 100)` quando espelhado, e é originado localmente quando não. **Nunca de `valor_venda` nem `valor_investimento`** — mortos por desenho (`funnels.valor_mode = 'consumo_solar'`).

> **R14.** Uma UC tem **no máximo um contrato `ativo`**.

> **R15.** `tipo` e senioridade do originador são locais. `crm_partner_id` é semente e **nunca sobrescreve** o tipo — o `Comissionamento` do CRM está 90% em `PADRAO`.

> **R16.** Cliente com `crm_lead_id` **não é excluído** pela interface, apenas desativado. Excluir causaria ressurreição no próximo full-scan.

> **R17.** Cadastro local e espelhado coexistem no mesmo tenant. Tenant sem conector opera 100% local, sem perda de função.

> **R18.** Toda escrita de cadastro grava auditoria: quem, quando, o quê, antes e depois.

> **R19.** Nenhuma operação desta spec escreve no CRM, em nenhuma circunstância (PRD §7.3 e §7.8 · `CLAUDE.md` regra 4).

## 5. Invariantes

1. Toda entidade de negócio tem `tenant_id` não nulo.
2. **Nenhuma FK atravessa tenant.** Vale para as onze tabelas com `tenant_id`.
3. RLS habilitada, **forçada** e com ≥1 policy em toda tabela com `tenant_id`.
4. Toda policy invoca `app.current_tenant_id()` e nada mais.
5. Dinheiro é `Int` em centavos. Float proibido.
6. `percentual_*`, `consumo_kwh`, `potencia_kwp`, `geracao_kwh` **não** convertem para centavos.
7. `cliente_estado_crm` nunca é escrito por ação de usuário.
8. Nenhuma coluna do sistema contém credencial em claro.
9. Nenhuma linha do CRM é modificada por esta spec.

## 6. Interfaces

| Interface | Quem chama | Falha | Idempotente |
|---|---|---|---|
| Auth (login, sessão) | UI | Supabase Auth padrão | — |
| CRUD de tenant e vínculos | `plataforma_admin` / `admin` | 4xx por campo | PUT sim |
| CRUD das 7 entidades de cadastro | UI conforme matriz do PRD §3 | 4xx por campo | PUT sim |
| `POST /clientes/:id/validar-documento` | UI | retorna inválido sem gravar | sim |
| `GET /usinas/:id/rateio` | UI · alerta Σ% | — | sim |
| Upsert de cadastro espelhado | **conector (SPEC-002)** | log; não interrompe o ciclo | **sim, obrigatório** |
| Escrita em `cliente_estado_crm` | **conector (SPEC-002)** | mantém valor e envelhece `sincronizado_em` | sim |

Matriz de papéis: `admin` total; `financeiro` total em corporativo e leitura em cadastros; `cobranca` total em carteira e leitura em cadastros; `leitura` só lê.

## 7. Casos de borda

| Categoria | Situação | Comportamento |
|---|---|---|
| Vazio | Tenant recém-criado, sem usuário | Só `plataforma_admin` alcança; primeiro `admin` é criado por ele, com log |
| Vazio | Tenant sem conector | Cadastro 100% local; `cliente_estado_crm` sem linhas |
| Vazio | Usina sem dono | Cadastro aceito; repasse bloqueado (R12) |
| Duplicidade | Mesmo `crm_lead_id` em dois ciclos | Upsert pela chave; nunca segunda linha |
| Duplicidade | `vendas_ganhas` devolve N linhas por lead ganho em N funis | Dedup por `lead_id` **antes** de tocar cadastro |
| Parcial | CPF do CRM inválido | Grava com `documento_validado = false`; bloqueia contrato ativo |
| Parcial | `potencia_kwp` nula | Cadastro aceito; cálculo dependente falha explicitamente, **nunca assume zero** |
| Fronteira | Σ rateio = 100,0001 | Tolerância de 0,0001; acima disso rejeita |
| Fronteira | Competência no fim do mês | Normaliza para dia 1, `America/Sao_Paulo` |
| Concorrência | Conector e usuário no mesmo cliente | Campo espelho: conector vence. Campo local: usuário vence. Não há campo disputado |
| Concorrência | Duas sessões do mesmo usuário em tenants diferentes | Contexto é por transação; nunca por processo |
| Origem ausente | Cliente espelhado some do CRM | `ativo = false` por reconciliação de conjunto; **nunca deleta** |
| Segurança | Usuário sem vínculo pede tenant existente | 404, não 403 (R1) |

## 8. Critérios de aceitação

- [ ] `migrate reset` roda limpo em banco vazio, sem seed manual
- [ ] Toda tabela com `tenant_id` tem RLS habilitada, **forçada** e ≥1 policy — verificado por consulta ao catálogo, não por inspeção visual
- [ ] Tenant A não lê nenhuma linha do tenant B, **nem forçando a query**, nem por role de serviço sem contexto
- [ ] Nenhuma FK entre tenants distintos é aceita pelo banco
- [ ] `plataforma_suporte` não consegue ler dado de tenant sem gerar linha em `acesso_plataforma_log`
- [ ] Nenhuma coluna do schema armazena credencial em claro
- [ ] CPF/CNPJ inválidos são rejeitados na validação e aceitos no cadastro (R9)
- [ ] Contrato não transiciona para `ativo` com documento não validado
- [ ] Σ rateio 91,20% cadastra com alerta; 100,5% é rejeitado
- [ ] Segunda passada do upsert com o mesmo payload não altera linha alguma
- [ ] Escrita no CRM por qualquer caminho desta spec falha por permissão
- [ ] Tenant sem conector executa o ciclo completo de cadastro

## 9. Testes obrigatórios

| Teste | Prova |
|---|---|
| `test_isolamento_tenant` | Inv. 1, 2 · critérios 3 e 4 — **o teste do ADR-0003** |
| `test_rls_forcada_e_policy_presente` | Inv. 3 — falha se alguma tabela tiver RLS sem policy |
| `test_policy_usa_apenas_funcao_contexto` | Inv. 4 |
| `test_role_servico_sem_contexto_le_zero` | Replica o defeito observado no CRM |
| `test_suporte_gera_trilha` | R2 · critério 5 |
| `test_sem_credencial_em_coluna` | Inv. 8 · R6 |
| `test_dinheiro_em_centavos_int` | Inv. 5 |
| `test_percentual_nao_converte` | Inv. 6 |
| `test_documento_validacao` | R7, R8, R9 |
| `test_rateio_teto_e_alerta` | R11 · borda de arredondamento |
| `test_upsert_idempotente` | Interface do conector |
| `test_cliente_espelhado_nao_deleta` | R16 |
| `test_contrato_unico_ativo_por_uc` | R14 |
| `test_estado_crm_nao_editavel` | Inv. 7 |
| `test_crm_readonly` | Inv. 9 · R19 |

## 10. Questões abertas

| ID | Pergunta | Bloqueia o quê | Quem responde |
|---|---|---|---|
| **ADR-0003** | Como `app.current_tenant_id()` obtém o tenant | as **policies** — não o schema | spike, ~2 dias |
| **Q-SPEC001-02** | `data_vencimento` 100% vazia no CRM. Quem preenche, e é por UC ou por contrato? | régua de cobrança da F2 | operação |
| **Q-SPEC001-03** | Endereço da UC não existe no CRM. Coleta local obrigatória ou opcional? | tela de cadastro | Vinicius |
| **Q-SPEC001-04** | `percentual_repasse` vive na usina ou só em `regra_split` versionada? Duplicar cria duas verdades | modelo do split (F3) | Vinicius |
| **Q-SPEC001-05** | Conector sobrescreve `nome`/`telefone` editados localmente? | política de espelho | Vinicius |
| **Q-SPEC001-06** | Projeto Supabase do financeiro na mesma organização do PRO ou separado? | provisionamento | Vinicius |
| MT-01 | Usuário em mais de um tenant? | só uma constraint (§3.1) | Vinicius |
| MT-06 | Auth próprio confirmado, ou SSO com o CRM? | `usuario.auth_user_id` | Vinicius |
| AUD-09 | Origem canônica de CPF/CNPJ | R8 | Vinicius |
| AUD-10 | Regra dos 25% — de onde vem, sobre o que incide | `faturas_cheias_pagas` | Vinicius |

**Nenhuma vira improviso do implementador** (`CLAUDE.md` regra 10). Só o ADR-0003 é bloqueio duro, e bloqueia as policies, não o schema — as duas migrations são separadas por isso.

## 11. Fora de escopo / evolução futura

- **Histórico de titularidade da UC** — hoje só estado corrente. Vira necessidade em disputa de faturamento retroativo.
- **Versionamento de contrato** — reajuste anual provavelmente exigirá vigência por período. Adiado até a F2 mostrar a forma real.
- **Deduplicação de cliente por documento entre tenants** — deliberadamente não feita: cruzar documento entre tenants violaria o isolamento que a spec inteira existe para garantir.
- **SSO com o CRM** — MT-06. Federação entre dois projetos Supabase; só se a dor de duas senhas justificar.
- **Write-back de estado para o CRM** — colide com o PRD §7.8 (`CLAUDE.md` regra 4) e com F-03. Se for necessário, é endpoint do financeiro consumido pelo CRM, nunca o inverso.

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 24/07/2026 | Original — só cadastros; plataforma declarada como pré-requisito ausente |
| **2.0** | **24/07/2026** | **§4.1 absorvido: tenant, usuário, RBAC dois níveis, conector e o contrato de isolamento. Não haverá SPEC-000** |
| **2.1** | **24/07/2026** | **§3.2 ganha a ressalva das três saídas do spike. Citações a "regra N do `CLAUDE.md`" reapontadas para o `CLAUDE.md` v1.0 e para o PRD §7.3/§7.8 — ver `PATCH-citacoes-2026-07-24.md`** |
