# SPEC-001 — Fundação: plataforma e cadastros

| Campo | Valor |
|---|---|
| **Status** | Rascunho — aguarda aceite |
| **Versão** | 2.6 |
| **Data** | 25/07/2026 (v2.3 no mesmo dia — ver rodapé) |
| **Autor** | Vinicius Leal |
| **Fase** | F1 |
| **Depende de** | **`ADR-0003` r2 — aceita.** O mecanismo de contexto de tenant está decidido e medido; o contrato do middleware e as obrigações de configuração estão na §3.2 |
| **Bloqueia** | SPEC-002 (conector), faturamento (F2), split (F3) — tudo |
| **Documentos-fonte** | `PRD-v2.2` §2, §3, §4.1, §4.2, §7.7, §7.8, §8 · `ADR-0002` r2 · **`ADR-0003` r2** · `ADR-0004` · `GLOSSARIO` · `P8` §2, §4, §5, §6 · `RESUMO-SESSAO-3` §4.3 e §4.3b |
| **Questões abertas** | MT-06, AUD-09, AUD-10 e as cinco de Q-SPEC001 na §10 |

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

- **A escolha do mecanismo de contexto de tenant** — decidida no `ADR-0003` r2. Esta spec absorve o contrato resultante (§3.2), não o rediscute
- **A lógica de sincronização** e o preenchimento de `cliente_estado_crm` — SPEC-002
- **Fatura, boleto, liquidação, split, inadimplência** — F2 e F3
- **Cadastros corporativos** (fornecedor, categoria, centro de custo, conta bancária) — F4
- **Migração da carteira legada** (F-01) — ação de operação dentro do CRM, não código do financeiro
- **Provisionamento** do projeto Supabase, domínio e host — `ADR-0004`

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

**Decidido pelo `ADR-0003` r2, aceito em 24/07 e medido em 25/07:** a função lê um GUC de sessão que a aplicação define no início de cada transação.

```sql
CREATE FUNCTION app.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
```

Toda policy invoca essa função e nada mais. O contrato existe para que a implementação troque uma definição, não quarenta policies.

#### O contrato do middleware

Isto não é orientação de implementação — é norma desta spec, com teste na §9. Cada linha corresponde a uma medição do `ADR-0003` r2.

| Regra | Por quê |
|---|---|
| `SET LOCAL`, **nunca `SET`** | `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool. Medido: pool de 1, transação com `SET`, requisição seguinte sem contexto **leu 2 linhas** |
| Todo acesso a dado de negócio dentro de transação explícita | Fora de transação o `SET LOCAL` é descartado no fim do statement. Medido: 0 linhas com pool de 5 **e** com pool de 1 — a causa é o `LOCAL`, não o pool |
| **Ponto único de emissão.** Nenhum repositório, serviço ou script emite contexto | Um único lugar para errar, um único lugar para testar |
| **O contexto é por UNIDADE DE TRABALHO, não por operação.** Uma transação por requisição, contexto emitido uma vez, o client de transação propagado por `AsyncLocalStorage` | Um `$extends` por operação isola corretamente e **destrói a atomicidade**: medido, duas operações seguidas caem em `txid` diferentes, e uma escrita seguida de falha do handler **persiste**. Ver a correção de desenho abaixo |
| **`set_config('app.tenant_id', $1, true)`, não `SET LOCAL app.tenant_id = '<valor>'`** | Semântica idêntica — escopo de transação — mas **aceita parâmetro ligado**. `SET LOCAL` não aceita, e obrigaria interpolar o `tenantId` no SQL. Com `tenantId` vindo de requisição, isso é superfície de injeção |
| O acesso fora de unidade de trabalho **lança**, não devolve vazio | `db()` sem escopo lança `SemContextoDeTenant`; o client base recebe guarda que lança. Transforma "leu zero e ninguém percebeu" em exceção imediata |
| **Unidade de trabalho não aninha** | Reabrir dentro de uma aberta toma conexão nova e **não herda o contexto**: leitura devolveria zero, sem erro. Lança `ContextoAninhado` |
| `timeout` e `maxWait` **explícitos** — recomendado 15.000 ms e 5.000 ms | Os defaults são 5.000 e 2.000 ms. Medido: query de 6 s falha com `P2028` em 6.036 ms, ou seja o banco **conclui o trabalho** e o cliente recusa o commit; e com pool de 1 ocupado, a segunda requisição falha em 2.001 ms |
| **Dois pools, não um:** transacional (teto 8, `timeout` 15 s) e relatório (teto 2, `timeout` 60 s), separados | Pool único faz relatório lento consumir os slots, e as requisições seguintes **não entram em fila** — falham com `P2028` em `maxWait`. Não é degradação, é penhasco. Medido: com o pool de relatório saturado, o transacional responde em 3 ms |
| Teto declarado por variável de ambiente, conferido contra `max_connections` | Regra de ajuste: `teto ≤ (max_connections − reservado_pelo_provedor − 5) / n_instâncias`, limitado a 8 — acima disso não compra nada nesta carga. **No deploy com sobreposição de instâncias o total dobra**; dimensione para o pico |

#### Correção de desenho — 25/07/2026, medida

A primeira redação desta seção prescrevia um `$extends` **por operação**, que abria uma transação para cada chamada e reconstruía a operação no client de transação. Isso **isola corretamente** — foi medido — e **destrói a atomicidade**:

| Medição | Resultado |
|---|---|
| Duas operações seguidas pelo extension por operação | **`txid` diferentes** — duas transações distintas |
| Escrita seguida de falha do handler | **a linha PERSISTIU** |

Para um sistema que calcula comissão e repasse, um handler que lê, decide e escreve sem atomicidade é defeito estrutural, não detalhe. **O padrão primário é a unidade de trabalho**; o `$extends` fica apenas como **guarda que lança**, nunca como emissor de contexto.

**Custo aceito:** um round trip vira quatro (`BEGIN` · `set_config` · query · `COMMIT`). Medido em localhost: 1,8x só do `BEGIN`/`COMMIT`, 2,2x a 3,0x no total. Em rede real a régua é a contagem de round trips, não o milissegundo de localhost.

#### PgBouncer — fechado em 25/07 por dedução, não por teste

A questão era 🔴 porque um pooler em modo *transaction* muda o escopo de sessão e pode invalidar o `SET LOCAL`. A resposta sai do `ADR-0004` e não precisava de reunião:

**A aplicação roda como processo Node de vida longa num VPS** (`ADR-0004`, decisão 3), não em função serverless. Processo de vida longa mantém o seu próprio pool e **não tem motivo para atravessar um pooler externo em modo transaction** — o pooler existe para clientes efêmeros que abrem e fecham conexão a cada requisição.

**Decisão: conexão direta (porta 5432), não o pooler em modo *transaction* (6543).** Consequências que passam a ser obrigação:

- a *connection string* de produção aponta para a porta direta, e isso é item verificável de deploy, não convenção
- o teto de pool da aplicação é conferido contra o `max_connections` da instância — sem pooler, cada conexão do pool é uma conexão real do PostgreSQL
- se algum dia parte do sistema for para execução efêmera, **o `ADR-0003` reabre antes** dessa mudança, não depois

**O que continua sem cobertura de teste:** o comportamento sob pooler em modo *transaction*, caso a decisão acima seja revertida. Não foi medido, e a reversão é o gatilho para medir.

**Migration de tabela e migration de policy seguem separadas**, mas agora por ordem de execução e não por pendência: a de policy vem depois do teste de vazamento da §9 passar.

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

`cliente_id PK/FK` · `tenant_id` · `tem_rateio_ativo` (**vigente**) · `tem_venda_ganha` (**bloqueado por F-02**) · `em_carteira` (**ver abaixo**) · `sincronizado_em`.

> **`em_carteira` — reclassificado em 25/07.** A v2.1 registrava "bloqueado por F-01 e F-04". A decisão **C1-b** de 24/07 matou o F-01: as 28 de 36 pessoas em rateio estão homologadas com a assinatura **não iniciada**, logo não existe carteira legada a migrar. O bloqueio remanescente é o **F-04** (o conector lê participação no funil ou etapa dentro dele?) e, mais grave, a sucessora do F-01 registrada no `RESUMO-SESSAO-3` §4.4: **nenhuma etapa do funil marca o cliente pagante.** O estado "desconto na fatura" vive fora do CRM, e o gatilho real é a primeira fatura com desconto da distribuidora — decisão de F2. Enquanto isso, `em_carteira` existe no schema e **nasce e permanece nulo**; nenhum cálculo desta spec o lê.

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

`originador` acrescenta `tipo enum vendedor_g3|terceirizado|parceiro_indicador|parceiro_captador|parceiro_captador_senior` (**local — não existe no CRM**) e `crm_partner_id uuid NULL` (semente; preenchido em 3% lá).

> **`terceirizado` entra em 25/07.** A tabela de comissão do `RESUMO-SESSAO-3` §4.3 tem cinco linhas de taxa e o enum da v2.1 tinha quatro valores: faltava `terceirizado` (50%). Sem ele, o terceirizado cairia no PADRAO por ausência de categoria, não por decisão.

`UNIQUE (tenant_id, documento)` nas duas.

#### `contrato`

`cliente_id` · `unidade_consumidora_id` · `usina_id` · `originador_id NULL` · **`originador_tipo_no_fechamento originador_tipo NULL`** (congelado — R20-b; nulo só quando não há originador) · `data_fechamento` · **`valor_referencia_centavos int NOT NULL`** · `valor_referencia_origem enum crm_consumo_reais|local` · `status enum rascunho|ativo|suspenso|encerrado` · `faturas_cheias_pagas int default 0`.

```sql
UNIQUE (tenant_id, unidade_consumidora_id) WHERE status = 'ativo'
```

#### `regra_comissao`

Percentual de comissão por tipo de originador, versionado por vigência. **Eixo único** — a origem do lead não entra (decisão D3-final, 24/07).

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- exigido pelo EXCLUDE abaixo

CREATE TABLE regra_comissao (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  originador_tipo  originador_tipo NOT NULL,        -- o MESMO enum de originador.tipo
  percentual       numeric(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  vigencia_inicio  date NOT NULL,
  vigencia_fim     date NULL,
  CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio),
  CONSTRAINT regra_comissao_sem_sobreposicao EXCLUDE USING gist (
    tenant_id       WITH =,
    originador_tipo WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
  ),
  UNIQUE (tenant_id, id)
);
```

Taxas de partida (`RESUMO-SESSAO-3` §4.3):

| `originador_tipo` | % |
|---|--:|
| `vendedor_g3` | 50 |
| `terceirizado` | 50 |
| `parceiro_indicador` | 25 |
| `parceiro_captador` | 50 |
| `parceiro_captador_senior` | 60 |

#### `tarifa`

Tarifa da distribuidora em R$/kWh, versionada por vigência. **É um preço por unidade, não um valor monetário** — ver R22.

```sql
CREATE TABLE tarifa (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  distribuidora         text NOT NULL,
  tarifa_reais_por_kwh  numeric(12,6) NOT NULL CHECK (tarifa_reais_por_kwh > 0),
  vigencia_inicio       date NOT NULL,
  vigencia_fim          date NULL,
  CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio),
  CONSTRAINT tarifa_sem_sobreposicao EXCLUDE USING gist (
    tenant_id     WITH =,
    distribuidora WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
  ),
  UNIQUE (tenant_id, id)
);
```

Valor de partida: **1,130000** para a distribuidora vigente — derivado de `consumo_reais / valor` exato em 5 de 5 ganhos medidos (`RESUMO-SESSAO-3` §4.3b).

**As duas tabelas usam o mesmo mecanismo:** um só padrão de "valor com data" no projeto. Quem entender uma entende a outra.

### 3.4 FK composta — a lista nominal

O `ADR-0003` mediu: **FK simples atravessa tenant e o banco aceita.** Contrato do tenant A apontando para cliente do B foi aceito; com FK composta, rejeitado com `23503`.

Toda referência entre entidades de negócio é `(tenant_id, id)`. São **nove** conversões:

| # | FK | Aponta para |
|---|---|---|
| 1 | `cliente_estado_crm (tenant_id, cliente_id)` | `cliente` |
| 2 | `unidade_consumidora (tenant_id, cliente_id)` | `cliente` |
| 3 | `unidade_consumidora (tenant_id, usina_id)` | `usina` |
| 4 | `usina (tenant_id, dono_usina_id)` | `dono_usina` |
| 5 | `usina_geracao (tenant_id, usina_id)` | `usina` |
| 6 | `contrato (tenant_id, cliente_id)` | `cliente` |
| 7 | `contrato (tenant_id, unidade_consumidora_id)` | `unidade_consumidora` |
| 8 | `contrato (tenant_id, usina_id)` | `usina` |
| 9 | `contrato (tenant_id, originador_id)` | `originador` |

> **O `ADR-0003` r2 dizia "sete".** A contagem saiu de estimativa, não de leitura. A varredura nominal da §3.3 rende **nove** — o ADR foi corrigido em 25/07. Duas FKs a menos na conta seriam **dois caminhos cross-tenant abertos**, e o defeito só se manifesta com dado de dois tenants em produção. Estimativa não serve aqui; a lista serve.

`UNIQUE (tenant_id, id)` nas **cinco** tabelas referenciadas: `cliente`, `unidade_consumidora`, `usina`, `dono_usina`, `originador`. Redundante com a PK por desenho — é o preço da composta.

**Fora da regra, e por quê:** `tenant_id → tenant(id)` aponta para a tabela raiz, que não tem `tenant_id`. `usuario_tenant.usuario_id → usuario` aponta para entidade de plataforma, também sem `tenant_id`. Nenhuma das duas atravessa nada.

---

## 4. Regras de negócio

### Plataforma

> **R1.** Todo acesso a dado de tenant passa por vínculo ativo em `usuario_tenant`, **e a exigência é da policy, não da aplicação**. Ausência de vínculo é indistinguível de tenant inexistente — 404, nunca 403, para não vazar existência.

> **R1-b. Por que a policy e não só a aplicação — furo medido em 26/07.** As treze policies diziam `tenant_id = app.current_tenant_id()`. Isso confere o **tenant**, não o **vínculo**. Medido, mesma transação:
>
> | Sessão | Clientes lidos |
> |---|--:|
> | usuário **com** vínculo no tenant A | 1 |
> | usuário **sem vínculo nenhum**, mesmo contexto | **1** |
>
> A verificação de vínculo existia só na aplicação, e **nada obrigava um handler a chamá-la**: `db().cliente.findMany()` direto lia dado financeiro de outra empresa com a sessão de qualquer usuário autenticado, bastando o `tenantId` errado chegar ao middleware. Defesa em uma camada não é defesa. As policies passam a exigir `app.tem_vinculo_no_tenant()`, e o teste `V1` da suíte de RBAC falha se isso for revertido.

> **R1-c. O login é a única chamada sem contexto, e é uma função só.** A policy de `usuario` exige `app.current_usuario_id()` — que é exatamente o que o login está tentando descobrir. Circular, e portanto impossível: medido, `SELECT ... WHERE auth_user_id = ?` devolvia zero. `app.resolver_login(auth_user_id)` quebra o ciclo e é a **única** função do sistema chamada fora de contexto de tenant. Devolve identidade, tier e a lista de tenants a que a pessoa pertence — nenhum dado de negócio.

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

### Comissão e tarifa

> **R20.** A comissao e chaveada pelo **tier congelado no fechamento**, nao pela classificacao corrente do originador. Precedencia: **override do card -> `contrato.originador_tipo_no_fechamento` -> PADRAO.** PADRAO e 50%, igual a `vendedor_g3`, e sempre foi: os 303 leads em `PADRAO` ja eram 50%.

> **R20-b. Por que congelado - o furo que a v2.4 tinha.** A redacao anterior lia `originador.tipo`, que e a classificacao **de hoje**. Consequencia: um captador promovido a senior em junho faria **todo contrato de marco recalcular a 60%**, porque a busca acharia o tier novo. A vigencia de `regra_comissao` nao cobre isso - ela versiona o *percentual de um tier*, nao o *tier de uma pessoa*.
>
> O tier vive no contrato porque e um **fato do fechamento**, como a data e o valor. Promocao de parceiro nao reprecifica o passado. O CRM ja carimba esse tier no lead na criacao (campo `Comissionamento`, via `app_settings.g3_partner_rules`) - ele e a semente natural do congelamento, e e a unica coisa daquela configuracao que o financeiro consome.
>
> Correcao de tier por **erro de classificacao** e diferente de promocao: e edicao de `admin` com auditoria (R18), e recalcula de proposito.

> **R21.** `regra_comissao` e `tarifa` **nunca têm vigência sobreposta para a mesma chave**, e a garantia é do banco (`EXCLUDE USING gist`), não da aplicação. O motivo é medido no CRM ao lado: o `Comissionamento` das views usa `LIMIT 1` sem `ORDER BY` no LATERAL, e por isso o mesmo lead pode pagar 25% hoje e 50% amanhã. **É alíquota, não relatório** — não pode depender de qual linha o planejador devolveu primeiro.

> **R22.** **Tarifa é `numeric(12,6)` em R$/kWh, não `Int` em centavos.** A regra 1 do `CLAUDE.md` manda dinheiro em centavos e mantém grandeza física e proporção em escala decimal. Tarifa é **preço por unidade** — dimensionalmente uma taxa, como `percentual_rateio`, não um valor monetário.
>
> Medido em PostgreSQL 16.14, com uma tarifa reajustada realista de **1,187650 R$/kWh** sobre **1.234,567 kWh**:
>
> | Forma de guardar a tarifa | Valor faturado |
> |---|--:|
> | `numeric(12,6)` | **R$ 1.466,23** |
> | `Int` centavos (119) | R$ 1.469,13 |
>
> **R$ 2,90 de divergência numa UC, num mês** — 0,20%, e sempre a favor de cobrar mais. Multiplicado pela carteira e por doze meses, é diferença que o cliente encontra antes de nós. O erro não vem do faturamento: vem de truncar a tarifa na hora de guardar, e nenhum arredondamento posterior recupera o dígito perdido.

> **R23.** O **dinheiro** derivado da tarifa é `Int` em centavos, e o arredondamento acontece **uma vez, no último passo**: `round(consumo_kwh × tarifa_reais_por_kwh × 100)`. Nunca em cálculo intermediário. Os três valores são persistidos — `consumo_kwh`, a `tarifa` da competência e o derivado — porque guardar só o valor em reais faz o histórico divergir do faturado no primeiro reajuste da distribuidora.

> **R24.** `cliente.consumo_referencia_centavos` e `contrato.valor_referencia_centavos` são **semente e valor de referência, não base de faturamento**. O `consumo_reais` do CRM é `consumo_kwh × 1,13`, ou seja já é o produto de uma tarifa que muda. A base de faturamento é sempre `consumo_kwh × tarifa` da competência (R23). Congelar reais como base é herdar uma tarifa velha sem saber.

## 5. Invariantes

1. Toda entidade de negócio tem `tenant_id` não nulo.
2. **Nenhuma FK atravessa tenant.** Vale para as **treze** tabelas com `tenant_id` — as onze da v2.1 mais `regra_comissao` e `tarifa`. As três sem `tenant_id` são `tenant` (raiz), `usuario` e `plataforma_admin` (plataforma), e estão fora da regra por desenho.
3. RLS habilitada, **forçada** e com ≥1 policy em toda tabela com `tenant_id`.
4. Toda policy invoca `app.current_tenant_id()` e nada mais.
5. Dinheiro é `Int` em centavos. Float proibido.
6. `percentual_*`, `consumo_kwh`, `potencia_kwp`, `geracao_kwh` **não** convertem para centavos.
7. `cliente_estado_crm` nunca é escrito por ação de usuário.
8. Nenhuma coluna do sistema contém credencial em claro.
9. Nenhuma linha do CRM é modificada por esta spec.
10. **`$transaction` não aninha.** Transação aberta de dentro de transação não herda o contexto e lê zero — sem erro. *(I-7 do `ADR-0003` r2.)*
11. **O contexto é por unidade de trabalho, não por operação.** Uma transação por requisição; o client de transação é propagado, nunca reaberto. Acesso fora de escopo **lança**. *(I-8 do `ADR-0003` r2, revista na v2.3 — a redação anterior prescrevia o padrão por operação, que quebra atomicidade.)*
12. **Nenhuma chave de `regra_comissao` ou `tarifa` tem vigencia sobreposta**, e a recusa e do banco.
14. **Toda policy de tabela de negócio exige vínculo, não apenas tenant.** `tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant()`. Sem a segunda metade, apontar o contexto para um tenant alheio basta para ler (R1-b).
15. **`app.resolver_login()` é a única função chamada sem contexto de tenant.** Qualquer outra que dispense contexto é violação.
13. **Toda view em `public` ou `app` declara `WITH (security_invoker = true)`.** Sem isso a RLS das tabelas base e avaliada contra o dono da view e nao contra quem consulta: view owned por superusuario le todos os tenants. Medido, mesma sessao sem contexto - tabela direta 0 linhas, view sem a opcao **2 linhas**, view com a opcao 0 linhas.

> **Sobre a invariante 2.** "Nenhuma FK atravessa tenant" deixou de ser afirmação e passou a ter mecanismo: as nove FKs compostas da §3.4. Antes disso a invariante era uma frase — o `ADR-0003` mediu o banco aceitando a violação.

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
- [ ] As **nove** FKs da §3.4 são compostas, e cada uma rejeita a referência cross-tenant com `23503`
- [ ] Requisição sem contexto, logo após uma requisição com contexto na mesma conexão de pool, lê **zero**
- [ ] `regra_comissao` e `tarifa` recusam vigência sobreposta **pelo banco**, não pela aplicação
- [ ] Nenhum `round()` em cálculo intermediário de valor derivado de tarifa

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
| `test_vazamento_contexto_no_pool` | Pool de tamanho 1: requisição com contexto seguida de requisição sem contexto tem que ler **zero**. É o teste que pega alguém apagando o `LOCAL` |
| `test_fk_composta_rejeita_cross_tenant` | §3.4 · Inv. 2 — as nove FKs, uma a uma. Espera `23503` |
| `test_transacao_nao_aninha` | Inv. 10 — tem que **falhar em desenvolvimento**, não devolver vazio |
| `test_contexto_por_unidade_de_trabalho` | Inv. 11 — três pontos de medição na mesma unidade devem dar **um** `txid` |
| `test_atomicidade_entre_operacoes` | Escrita seguida de falha do handler tem que ser **revertida**. É o teste que pegou o desenho errado |
| `test_acesso_fora_de_escopo_lanca` | `db()` sem escopo e client base guardado lançam, em vez de devolver vazio |
| `test_tenant_id_nao_interpolado` | `tenantId` não-UUID lança antes de tocar o banco; `set_config` com parâmetro ligado |
| `test_relatorio_nao_esgota_pool_transacional` | Pool de relatório saturado, transacional responde normal |
| `test_vigencia_nao_sobrepoe` | Inv. 12 · R21 — em `regra_comissao` e em `tarifa` |
| `test_tarifa_nao_e_centavos` | R22 — falha se a coluna de tarifa for inteira |
| `test_arredondamento_uma_vez` | R23 — nenhum `round()` em intermediário |
| `test_tier_congelado_no_fechamento` | R20-b — reclassificar o originador **nao** muda a comissao de contrato antigo. E o teste que pega a promocao reprecificando o passado |
| `test_policy_exige_vinculo` | Inv. 14 · R1-b — usuário sem vínculo, contexto apontado para o tenant alheio, tem que ler **zero**. É o teste que pega o furo de 26/07 reabrindo |
| `test_controle_vinculo_valido_le` | Inv. 14 — e o contrário: com vínculo, lê. Impede que o aperto vire nega-tudo sem ninguém notar |
| `test_bootstrap_login_sem_contexto` | Inv. 15 · R1-c — `resolver_login` responde sem contexto, e devolve vazio para `auth_user_id` inexistente |
| `test_toda_view_com_security_invoker` | Inv. 13 — consulta de catalogo, e a suite **reproduz o furo**: cria uma view sem a opcao e mede que ela le sem contexto |

**A verificação da invariante 3 é por consulta ao catálogo** (`pg_class.relrowsecurity`, `relforcerowsecurity` e `pg_policy`), nunca por inspeção visual ou revisão de PR. O modo de falha de RLS sem policy é resultado vazio, não erro: não aparece em log, não quebra teste de fumaça, e só é descoberto quando um relatório vem zerado.

## 10. Questões abertas

| ID | Pergunta | Bloqueia o quê | Quem responde |
|---|---|---|---|
| ~~**ADR-0003**~~ | ~~Como `app.current_tenant_id()` obtém o tenant~~ | — | **FECHADA em 24/07, r2 em 25/07.** `SET LOCAL` por transação. Contrato na §3.2 |
| **Q-SPEC001-02** | `data_vencimento` 100% vazia no CRM. Quem preenche, e é por UC ou por contrato? | régua de cobrança da F2 | operação |
| **Q-SPEC001-03** | Endereço da UC não existe no CRM. Coleta local obrigatória ou opcional? | tela de cadastro | Vinicius |
| **Q-SPEC001-04** | `percentual_repasse` vive na usina ou só em `regra_split` versionada? Duplicar cria duas verdades | modelo do split (F3) | Vinicius |
| **Q-SPEC001-05** | Conector sobrescreve `nome`/`telefone` editados localmente? | política de espelho | Vinicius |
| ~~**Q-SPEC001-06**~~ | ~~Projeto Supabase na mesma organização ou separado?~~ | — | **FECHADA em 24/07** (decisão A2): organização **separada**. Ver `ADR-0004` |
| **PgBouncer** | O caminho de conexão vai passar por PgBouncer em modo *transaction*? | **reabre o `ADR-0003` inteiro** se sim | Vinicius / infra |
| **Q-SPEC001-07** | O CRM vai quebrar `vendedor_tipo` em cinco valores? | **nada nesta spec** — R20 tornou isso semente, não chave. Melhora o preenchimento, não desbloqueia | dev do CRM |
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
| **2.6** | **26/07/2026** | **Dois furos entre auth e middleware, medidos antes da primeira linha da camada de aplicação.** (1) As policies conferiam tenant e **não vínculo**: usuário sem vínculo, com o contexto apontado para o tenant alheio, **lia o dado financeiro**. A checagem existia só na aplicação e nada obrigava um handler a chamá-la. (2) O bootstrap do login era **circular** — a policy de `usuario` exige `app.current_usuario_id()`, que é o que o login procura. Migration 6: `app.tem_vinculo_no_tenant()` nas treze policies e `app.resolver_login()` como única função sem contexto. Invariantes 14 e 15, quatro testes. E o `tests/run.sh` foi corrigido: ele engolia falha de migration em pipeline — o mesmo modo de falha silenciosa que este projeto persegue nas policies, dentro do próprio runner |
| **2.5** | **26/07/2026** | **R20 estava errada, e o retorno do dev mostrou como.** O `app_settings.g3_partner_rules` do CRM nao e segunda engine de calculo — carimba **tier** no lead na criacao, e o financeiro e quem transforma em R$. Isso expos que a R20 lia a classificacao **corrente** do originador: um captador promovido a senior fazia todo contrato antigo recalcular a 60%. `contrato.originador_tipo_no_fechamento` congela o tier no fechamento, e o campo `Comissionamento` do CRM e a semente. Novo teste; migration 5 |
| **2.4** | **26/07/2026** | **Invariante 13 e migration 4.** O dev do CRM corrigiu uma premissa nossa: "RLS sem policy nega tudo, e o modo de falha e resultado vazio" vale para acesso direto e e **falso atraves de view** - a RLS das bases e avaliada contra o dono da view. Medido no nosso schema: view sem `security_invoker` le **todos os tenants** sem contexto, anulando `FORCE` e as treze policies. O financeiro nao tinha view nenhuma, entao a regra existe antes da primeira |
| **2.3** | **25/07/2026** | **§3.2 corrigida por medição no mesmo dia.** O contrato prescrevia `$extends` por operação; medido, isso **quebra atomicidade** (duas operações em `txid` distintos; escrita seguida de falha do handler persiste). O padrão primário passa a ser **unidade de trabalho** com `AsyncLocalStorage`, e o `$extends` vira guarda que lança. Também: `set_config` com parâmetro ligado em vez de `SET LOCAL` interpolado (superfície de injeção quando o `tenantId` vem de requisição); **dois pools** em vez de um, com o medido de que relatório saturado não afeta o transacional. Invariante 11 reescrita, cinco testes no lugar de um |
| **2.2** | **25/07/2026** | **`ADR-0003` r2 absorvido: §3.2 deixa de declarar contrato pendente e passa a fixar o contrato do middleware com nove regras medidas. Nova §3.4 com a lista nominal das FKs compostas — **nove**, não sete como o ADR estimava. Novas tabelas `regra_comissao` e `tarifa`, versionadas por vigência com recusa de sobreposição no banco. `originador.tipo` ganha `terceirizado`. `em_carteira` reclassificado (C1-b matou o F-01). Novas R20 a R24, invariantes 10 a 12 e sete testes. Q-SPEC001-01 e -06 e o ADR-0003 fecham; PgBouncer e Q-SPEC001-07 abrem.** |
