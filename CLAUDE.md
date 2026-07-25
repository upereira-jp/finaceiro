# CLAUDE.md — regras inegociáveis do Financeiro G3

| Campo | Valor |
|---|---|
| **Versão** | 1.1 |
| **Data** | 24/07/2026 · rev. 1.1 em 25/07/2026 |
| **Status** | Vigente |
| **Autor** | Vinicius Leal |
| **Escopo** | Todo código, schema, migration e spec do projeto Financeiro |

> **Este arquivo é NOVO. Não é reconstrução.**
>
> Até 24/07/2026, dez documentos deste repositório citavam "a regra N do `CLAUDE.md`" — dezoito pontos de citação ao todo. **O arquivo nunca existiu.** A numeração citada (6, 7, 10) não tem origem verificável e foi descartada; a numeração abaixo é nova e começa do zero.
>
> As normas em si não se perderam: quase todas tinham fonte real no `PRD-v2.2`, que só não estava sendo citado. Onde a fonte existe, ela está marcada. Onde não existe, a regra está marcada como nova — e é decisão de 24/07/2026, não recuperação de nada.
>
> **Qualquer citação a "regra N do CLAUDE.md" anterior a esta data é anacrônica.** O patch de 24/07/2026 reapontou as dezoito.

---

## Como este arquivo é usado

É a camada mais alta do projeto. Em conflito, a ordem é: **este arquivo → `PRD-v2.2` → ADRs → SPECs**. Uma regra daqui não é flexibilizada por spec, por prazo ou por conveniência de implementação — é alterada aqui, com versão nova, ou não é alterada.

---

## As dez

### 1. Dinheiro é `Int` em centavos

Em toda camada: banco, API, UI, teste, fixture. **Float é proibido**, inclusive em cálculo intermediário. Coluna monetária carrega o sufixo `_centavos`.

Percentual, `kWh`, potência e geração **mantêm escala decimal e nunca convertem para centavos**. São grandezas físicas e proporções, não dinheiro.

`[derivada — PRD-v2.2 · SPEC-001 §3 e invariantes 5 e 6 · convenção já observada em plans.preco_mensal_centavos no CRM]`

### 2. `tenant_id` desde a primeira migration

`tenant_id uuid NOT NULL` em toda entidade de negócio. Índice único de negócio **sempre composto** com `tenant_id`.

**Nenhuma FK atravessa tenant — e a garantia é a FK composta `(tenant_id, id)`, não a frase.** Toda referência entre entidades de negócio é composta, e toda tabela referenciada carrega `UNIQUE (tenant_id, id)` redundante com a PK. Sem isso a regra é declaração: **medido em 24/07, o banco aceitou contrato do tenant A apontando para cliente do tenant B.** Com a composta, rejeita com `23503`.

Não existe "adiciono o tenant depois", nem "converto as FKs depois". Retrofit de multi-tenancy é reescrita de schema, de policy e de query ao mesmo tempo.

`[derivada — ADR-0002 r2, "o que do ADR-0001 permanece" · SPEC-001 §3, §3.4 e invariantes 1 e 2 · FK composta medida no ADR-0003, 24/07]`

### 3. RLS habilitada sem policy é falha, não configuração

Toda tabela com `tenant_id` recebe `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` **e ao menos uma policy**.

O motivo é medido, não teórico: no CRM ao lado, 81 das 151 tabelas de `public` têm RLS habilitada e nenhuma policy. Isso não vaza — nega tudo. E **o modo de falha é resultado vazio, não erro de permissão**, então não aparece em log, não quebra teste de fumaça e só é descoberto quando um relatório vem zerado.

Verificação por **consulta ao catálogo**, jamais por inspeção visual ou revisão de PR.

`[nova — evidência em P8 §2, 24/07/2026]`

### 4. O CRM é read-only absoluto

O financeiro **nunca** executa INSERT, UPDATE ou DELETE no CRM, em nenhuma circunstância, por nenhum caminho. E **nunca lê tabela base** — só as views do schema `financeiro.*`, pela role `financeiro_ro`, que não tem `BYPASSRLS`.

Necessidade inversa é **endpoint exposto pelo financeiro e consumido pelo CRM**, nunca o contrário. Write-back exige ADR próprio; não existe exceção pontual, atalho de sprint nem "só esse campo".

`[PRD-v2.2 §7.3 e §7.8]`

### 5. Segredo não mora em coluna nem em variável de ambiente

Segredo **por tenant** — certificado, `client_id`, token, chave de API — vive em armazenamento cifrado e é acessado por **referência** (`credencial_ref`). Nenhuma coluna do schema contém segredo em claro. Violação disto é falha de revisão, não de runtime.

Só segredo **de plataforma** vai para variável de ambiente.

O contraexemplo está no banco ao lado: a tabela `tenants` do CRM guarda `openai_api_key`, `whatsapp_access_token`, `instagram_access_token`, `meta_page_access_token` e `meta_verify_token` em `text` puro. Não herdamos esse padrão.

`[PRD-v2.2 §6 · contraexemplo medido em P8 §4]`

### 6. Identificador de sistema externo nunca se chama `tenant_id`

É `crm_tenant_id`, sempre, em variável, parâmetro, coluna e log. No TypeScript, **tipos nominais distintos** (`TenantId` e `CrmTenantId`).

Os dois são UUID. Trocar um pelo outro não falha em compilação e não estoura em runtime: devolve zero linhas no melhor caso e **dados de outra empresa no pior**. O tipo nominal existe para transformar esse silêncio em erro de compilação.

Toda consulta ao CRM filtra por `crm_tenant_id`, e esse filtro é **invariante com teste automatizado**, não convenção.

`[ADR-0002 r2, mitigações da Decisão 1 · PRD-v2.2 §7.3]`

### 7. Domínio em português, utilitário em inglês

Nome de entidade, coluna, enum e regra de negócio em português: `unidade_consumidora`, `percentual_rateio`, `dono_usina`. Código utilitário, infraestrutura e nomenclatura de framework em inglês.

O vocabulário do `GLOSSARIO.md` é único e vale para spec, código e conversa. Sinônimo em código é dívida de leitura.

`[GLOSSARIO.md, cabeçalho]`

### 8. Invariante sem teste é comentário

Todo invariante declarado em spec tem teste automatizado que falha quando o invariante é violado. Não vale asserção em code review, não vale comentário no schema, não vale confiança no implementador.

`[_TEMPLATE-SPEC §9]`

### 9. Escrita de dado de negócio grava auditoria

Quem, quando, o quê, **antes e depois**. Vale para cadastro, papel, vínculo, regra de split, beneficiário e baixa manual.

Acesso de nível plataforma a dado de tenant grava trilha **na mesma transação da leitura**; falha ao gravar a trilha aborta a leitura.

`[PRD-v2.2 §4.6 · SPEC-001 R2 e R18]`

### 10. Lacuna vira questão, nunca improviso

Contradição entre documentos, ambiguidade de regra ou decisão ausente vira **entrada em `QUESTOES.md`** e na seção de questões abertas da spec.

Não vira improviso do implementador. Não vira decisão autônoma do Claude Code. Não vira valor default escolhido "porque parecia razoável". Quem encontra a lacuna registra e para — a decisão tem dono nomeado.

`[nova — norma órfã: era citada como "regra 10" mas não tem fonte independente em nenhum documento não-reconstruído. Mantida porque é como o projeto já opera de fato]`

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| **1.0** | **24/07/2026** | Primeira versão real. Substitui um arquivo que nunca existiu e que era citado em 10 dos 12 documentos do repositório. Numeração nova; a antiga (6, 7, 10) foi descartada por não ter origem verificável |
| **1.1** | **25/07/2026** | Regra 2 ganha o **mecanismo**: FK composta `(tenant_id, id)` e `UNIQUE (tenant_id, id)` nas referenciadas. Antes a regra afirmava que nenhuma FK atravessa tenant sem dizer o que a impedia — e o spike do `ADR-0003` mediu o banco aceitando a violação |

---

## Tabela de-para — numeração antiga → v1.0

A numeração fantasma (anterior a 24/07/2026) aparece **no corpo intacto** dos relatórios `P7`, `P8` e `RESUMO-SESSAO-2`, por decisão registrada no `PATCH-citacoes-2026-07-24.md`: relatório é registro datado e reescrever o corpo falsificaria o registro. Consequência: quem procurar "regra N" nesses documentos acha a numeração velha. Esta tabela é o de-para.

| Citação antiga | Assunto | Regra vigente |
|---|---|---|
| "regra 6" | CRM read-only absoluto | **4** |
| "regra 7" | Segredo em variável de ambiente — *citada como **errada***. Na v1.0 o segredo por tenant não vai para variável de ambiente, e a norma está **corrigida** | **5** |
| "regra 10" | Lacuna vira questão | **10** (coincide) |

**Atenção à "regra 7":** na numeração vigente, a regra 7 é *domínio em português, utilitário em inglês* — e está **correta**. Toda citação a "a regra 7 está errada" é anacrônica e se refere à atual regra 5, que já foi corrigida.
