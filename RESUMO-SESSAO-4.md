# RESUMO-SESSAO-4 — 25 e 26/07/2026

Sessão longa. Começou com um repositório público de 20 arquivos soltos na raiz e **zero linhas de código**; termina com repositório privado organizado, nove migrations, quatro módulos de aplicação e **91 verificações automatizadas** rodando em CI.

Doze achados de segurança. **Nove eram meus** — em código ou norma que eu mesmo havia escrito nesta sessão ou na anterior. Nenhum apareceu por inspeção: todos apareceram porque o teste foi escrito antes de o desenho ser acreditado.

---

## 1. Os achados de segurança, em ordem de gravidade

### 1.1 🔴 A policy conferia tenant, não vínculo — qualquer usuário lia outra empresa

O pior do projeto. As treze policies diziam `tenant_id = app.current_tenant_id()`. Isso confere o **tenant**, não o **vínculo**. Medido, mesma transação:

| Sessão | Clientes lidos |
|---|--:|
| usuário **com** vínculo no tenant A | 1 |
| usuário **sem vínculo nenhum**, mesmo contexto | **1** |

A verificação de vínculo existia **só na aplicação**, e nada obrigava um handler a chamá-la. Um `db().cliente.findMany()` direto lia dado financeiro de outra empresa com a sessão de qualquer usuário autenticado — bastava o `tenantId` errado chegar ao middleware.

**Não apareceria em teste nenhum**, porque todos os testes setavam o contexto certo. Apareceu quando fui perguntar *quem escolhe o tenant*.

Migration 6: `app.tem_vinculo_no_tenant()` nas treze policies. Os dois testes são um par — **V1 falha se o furo reabrir, V2 falha se o aperto virar nega-tudo.**

### 1.2 🔴 View sem `security_invoker` anula a RLS inteira

O dev do CRM corrigiu uma premissa que eu havia propagado por quatro documentos: *"RLS sem policy nega tudo, e o modo de falha é resultado vazio"*. Verdade para acesso **direto**; **falso através de view** — a RLS das tabelas base é avaliada contra o **dono** da view.

Medido no schema do financeiro, mesma sessão, role sem `BYPASSRLS`, sem contexto:

| Via | Linhas |
|---|--:|
| tabela direta | **0** |
| view **sem** `security_invoker` | **2** — todos os tenants |
| view **com** `security_invoker = true` | **0** |

Uma view sem essa opção **anula `FORCE ROW LEVEL SECURITY` e as treze policies de uma vez**. O financeiro não tinha view nenhuma — a regra passou a existir **antes da primeira**. E a primeira nasceu na migration 9 (`rateio_por_usina`), declarando a opção, com a suíte conferindo contra view real.

### 1.3 🔴 O contexto por operação destruía atomicidade

A `SPEC-001` v2.2, escrita nesta sessão, prescrevia `$extends` por operação — que vem do spike e **isola corretamente**. Medido:

| | |
|---|---|
| duas operações seguidas | `txid` **1170** e **1171** — transações distintas |
| escrita seguida de falha do handler | **a linha PERSISTIU** |

Num sistema que calcula comissão e repasse, handler que lê, decide e escreve sem atomicidade é defeito estrutural. Padrão primário virou **unidade de trabalho** com `AsyncLocalStorage`; o `$extends` ficou como **guarda que lança**.

### 1.4 🔴 A trilha da R2 era fungível entre transações

O gatilho conferia *"existe linha de trilha para este usuário e tenant nos últimos **60 segundos**"*. Um usuário de plataforma que registrasse **um** acesso legítimo podia escrever qualquer coisa naquele tenant pelo minuto seguinte, sem gerar linha.

Medido no teste S15: a escrita sem trilha **commitou**, satisfeita por uma linha de **outra transação** inserida segundos antes pelo teste anterior. *"A trilha prova este acesso"* era falso.

Migration 7: `l.xmin = pg_current_xact_id()::xid` — a linha tem que ter sido inserida **nesta** transação.

### 1.5 🔴 `SET LOCAL` interpolado era superfície de injeção

O spike emitia `` `SET LOCAL app.tenant_id = '${id}'` `` via template string. Com `tenantId` vindo de requisição, isso é injeção — e **`SET LOCAL` não aceita parâmetro ligado**. `set_config('app.tenant_id', $1, true)` aceita, com semântica idêntica.

### 1.6 🔴 O repositório era público e nomeava o mapa do CRM

Não havia credencial viva, mas estava exposto: o UUID do tenant de produção, o fato de 82 das 151 tabelas terem RLS sem policy, e **os nomes exatos das colunas que guardavam tokens em texto puro**. Deixou de ser dívida técnica e virou **rotação** — feita.

### 1.7 🟡 `tenant`, `usuario` e `plataforma_admin` vazavam existência

Ficaram fora da RLS na migration 2 porque não têm `tenant_id`. Mas a R1 exige que ausência de vínculo seja indistinguível de tenant inexistente — e com `tenant` legível, **qualquer sessão listava razão social e CNPJ de todos os clientes do SaaS**.

### 1.8 🟡 `usuario_tenant` permitia enumerar a equipe de qualquer cliente

Bastava apontar o contexto para um tenant para ver **quem tem acesso a ele, com papel**, sem vínculo nenhum. Não vaza dado financeiro — vaza a folha de quem opera o cliente. **Achado pela minha própria suíte**, quando escrevi o teste esperando zero e ele devolveu 1.

### 1.9 🟡 O login era impossível

A policy de `usuario` exige `app.current_usuario_id()`, que é **exatamente o que o login está tentando descobrir**. Circular. Medido: devolvia zero. `app.resolver_login()` quebra o ciclo e é a **única** função chamada fora de contexto — invariante 15 existe para que ninguém acrescente uma segunda.

### 1.10 🟡 A R20 pagava a taxa de hoje em contrato de ontem

Chaveava a comissão por `originador.tipo`, a classificação **corrente**. Um captador promovido a sênior em junho faria **todo contrato de março recalcular a 60%**.

E a vigência não cobria, que é a parte que engana: `regra_comissao` versiona o *percentual de um tier*, não o *tier de uma pessoa*. **Promoção não é reajuste de tabela.** `contrato.originador_tipo_no_fechamento` congela o tier.

### 1.11 🟡 A R7 quebraria em cinco dias

Dizia *"documento armazenado só com dígitos"*. O **CNPJ alfanumérico** começa em **31/07/2026** — letras nas 12 primeiras posições, dois formatos coexistindo. A regra rejeitaria cadastro legítimo.

O DV segue módulo 11 com uma adaptação de uma linha (`valor = ASCII − 48`). A garantia que importa está testada: **o algoritmo alfanumérico reduz ao numérico** quando todos os caracteres são dígitos — 20.000 casos comparados, zero divergências. Sem isso, todo CNPJ existente pararia de validar.

### 1.12 🟡 O meu próprio runner engolia falha em silêncio

`tests/run.sh` aplicava migration com pipe para `grep`, e **em pipeline o status de saída é do grep**. Migration que falhava passava calada — foi como a migration 6 "aplicou" sem aplicar, e eu quase concluí que o furo do vínculo não existia.

É o mesmo modo de falha que este projeto persegue nas policies, **dentro do runner que deveria pegá-lo.**

---

## 2. Contagens que estavam erradas

Três estimativas viraram contagens, e cada uma tinha consequência:

| Onde | Dizia | É | Consequência de manter |
|---|--:|--:|---|
| FKs a converter (`ADR-0003`) | 7 | **9** | duas FKs fora da conta são **dois caminhos cross-tenant abertos** |
| Tabelas com `tenant_id` (invariante 2) | 11 | **13** | a migration de RLS precisa da lista exata |
| Tabelas sem policy no CRM (`P8`) | 81 e 36 no mesmo documento | **82** | o `P8` §7 instruía o dev com o número errado, deixando 45 fora do cruzamento |

---

## 3. O que o dev do CRM entregou

Cinco tarefas na rodada 1, três pedidos na rodada 2, e um adendo com prazo. Tudo fechado do lado dele.

| Item | Resultado |
|---|---|
| `Comissionamento` não determinístico | Corrigido em produção. `array_agg` ordenado + `comissionamento_n_opcoes`. 10 execuções com `ANALYZE`, um único hash. **O defeito estava vivo em produção**, não só proposto |
| Views × tabelas sem policy | Cruzamento zero para `financeiro.*`. E a correção de premissa que gerou a nossa invariante 13 |
| 50 tabelas de backup | Movidas para schema `backup`, fora do PostgREST e do `search_path`, sem grants, com prazo em `COMMENT ON SCHEMA` |
| AUD-07 — merge apaga? | Não apaga, **mas há dois caminhos de DELETE físico fora do merge, um rotineiro** |
| 7 ganhos sem valor | `Parceiros` é onboarding, fora da base de comissão. Fecha a F-02 |
| `lead_merges` | Criada **sem FK para `leads` de propósito**, para a trilha sobreviver a DELETE físico. Backfill e código gravando. O par de 10/07 recuperado do log — **os dois lados arquivados**, nenhum cliente ativo pendurado |
| `leads_arquivados` | No ar. É o que reduz a fila de revisão ao genuinamente ambíguo |
| Sync "Clientes Ativos" | **O funil está vazio, e a etapa-fonte também** — os 29 concluídos param em `Rateio Concluído`, `stage_type='normal'`, que não dispara a automação |
| `g3_partner_rules` | **Não é segunda engine**: carimba tier, não calcula. Uma verdade por lead |
| CNPJ alfanumérico | O ponto de quebra estava **fora de onde eu apontei** — na Edge Function `submit_partner_indication`, que fazia `digits(cnpj).length === 14`. Corrigido na v8. E ele achou um segundo, que eu não pedi: `pii_mask.py` mascarava só CNPJ numérico, e alfanumérico **vazaria sem máscara** em transcrição de treino de IA |

**Onde eu errei apontando:** minhas três perguntas estavam certas em estrutura, e a minha hipótese sobre *onde* estava errada. Ele varreu mais largo do que o pedido e achou o real. O `pii_mask.py` foi achado só dele.

---

## 4. Decisões tomadas

| Ref | Decisão |
|---|---|
| PgBouncer | **Conexão direta na 5432**, sem pooler em modo *transaction*. Deduzido do `ADR-0004`: processo Node de vida longa mantém o próprio pool. Reverter reabre o `ADR-0003` **antes** da mudança |
| Teto de pool | **8 transacional / 2 relatório / 2 reservadas.** Dois pools, não um: pool único faz relatório lento consumir os slots e a requisição seguinte **falha** em `maxWait`, não espera. Medido: relatório saturado, transacional responde em 3 ms |
| Comissão | Chaveada pelo **tier congelado no fechamento**, semeado pelo campo `Comissionamento` do CRM |
| Atribuição de originador | `leads.partner_id`, **nunca** a tag `indicado_por` — ela é display e editável, e há 1 lead com tag sem `partner_id` |
| Tarifa | `numeric(12,6)` R$/kWh, **não** `Int` centavos. Medido: truncar cobra **R$ 2,90 a mais** numa UC num mês, sempre a favor de cobrar |
| Vigência do seed | `-infinity`. Se abrisse hoje, recálculo de março cairia no PADRAO **por ausência** — e como PADRAO é 50% e indicador é 25%, pagaria o dobro em silêncio |
| Schema `integracao` | **Não criar.** Os aliases `vw_*` do PRD são redundantes; a AUD-12 já decidira consumir `financeiro.*` direto |
| Fonte de estado ativo | `financeiro.rateio_clientes`, não o funil — decisão C1 substituída |
| `ADR-0001` | Escrito retroativamente. **Não reconstrói** o original perdido: registra o que o corpus pressupõe, com proveniência por parte e inferências marcadas |
| `LEIA-ME` e `bloco-para-fusão` | Removidos. O primeiro estava errado em 3 de 4 linhas; o segundo teve o conteúdo absorvido — menos **um aviso**, que foi movido antes |

---

## 5. O que existe agora

```
9 migrations   schema · isolamento · RBAC e trilha · security_invoker ·
               tier congelado · vínculo na policy · trilha por transação ·
               formato de documento · rateio e faturamento
4 módulos      src/db/pools.ts · src/db/contexto.ts · src/auth/sessao.ts ·
               src/dominio/documento.ts
5 suítes       91 verificações
1 seed         regra_comissao e tarifa, idempotente
CI             3 jobs, PostgreSQL 16 de serviço
4 ADRs         0001 · 0002 r2 · 0003 r2 · 0004
2 specs        SPEC-001 v2.8 · SPEC-002 v1.2
```

| Suíte | Verificações |
|---|--:|
| isolamento (FKs compostas, RLS, vigência, tier congelado, invariante 13) | 20 |
| RBAC e trilha (R1 a R4, bootstrap, vínculo na policy) | 15 |
| regras (R11, R14, R20-b, R22, R23) | 12 |
| middleware (invariantes 10 e 11, atomicidade, dois pools) | 12 |
| sessão (escolha de tenant, caminho de plataforma) | 15 |
| documento (CPF, CNPJ numérico e alfanumérico) | 17 |
| **total** | **91** |

---

## 6. O que continua aberto

### 6.1 Com prazo

| Item | Prazo | Dono |
|---|---|---|
| **Máscara client-side do formulário em `g3solar.com.br`** — o servidor está corrigido, mas se o input filtrar letras, o usuário **não consegue digitar** o CNPJ novo | **31/07/2026** | dono do site (repositório separado) |
| Revisão do schema `backup` do CRM | 26/10/2026 | dev do CRM |

### 6.2 Bloqueia a F2

| Item | Dono |
|---|---|
| **Sete questões fiscais.** Três delas são estritamente do contador — retenção sobre comissão a PF, escrituração sem documento fiscal, crédito de IBS/CBS. E a mais caras das sete: **comissão a sócia é despesa dedutível ou distribuição?** 83% dos ganhos concentrados numa sócia é o cenário clássico de re-caracterização | contador |
| **POP-01** — 29 em `Rateio Concluído` · 36 vínculos em `usina_clientes` · 28 de 36 homologadas. **Três populações, três números, e o faturamento precisa de um denominador** | Vinicius + operação |
| **F-01b** — o gatilho de faturamento não é evento do CRM. Com o estado ativo saindo de `rateio_clientes`, o gatilho provavelmente sai da fatura da distribuidora | Vinicius + operação |

### 6.3 Destrava a camada de aplicação

| Item | Dono |
|---|---|
| `prisma db pull` + `prisma generate` | Vinicius, um comando |

Sem os tipos gerados, repositório de sete entidades seria escrito contra `any` — nome de coluna adivinhado em camada de persistência é erro que aparece em produção, não em teste. Tudo que **não** dependia disso já foi feito: sessão, documento, e as três regras que o banco garante sozinho.

---

## 7. Fila da próxima sessão

1. `prisma db pull` (seu, um comando)
2. Repositórios das 7 entidades sobre `db()`
3. Endpoints da §6 com a matriz de papéis via `exigir()`
4. Telas de cadastro
5. Em paralelo, sem depender de ninguém: contador, POP-01

---

## 8. Uma observação sobre o método, porque ela se pagou

Doze achados, nove meus, e o padrão foi o mesmo em todos: **o teste foi escrito antes de o desenho ser acreditado.**

O caso mais claro é o §1.1. Todos os meus testes de isolamento passavam — porque todos setavam o contexto correto. O furo só apareceu quando a pergunta mudou de *"o contexto isola?"* para *"quem escolhe o contexto?"*. O segundo mais claro é o §1.12: o defeito estava na ferramenta que deveria encontrar defeitos, e ele mascarou um furo real por alguns minutos.

Nenhum dos doze teria aparecido em revisão de código. Vários passariam em produção por meses antes de alguém notar — e dois deles (§1.1 e §1.2) só seriam notados **por um cliente vendo dado de outro**.
