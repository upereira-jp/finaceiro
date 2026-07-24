# PATCH — reparo das citações ao `CLAUDE.md`

| Campo | Valor |
|---|---|
| **Data** | 24/07/2026 |
| **Autorizado por** | Vinicius Leal |
| **Escopo** | 17 edições em 10 arquivos · 2 arquivos novos |
| **Arquivos novos** | `CLAUDE.md` v1.0 · este documento |
| **Patch git** | `reparo-citacoes-2026-07-24.patch` |

---

## 1. O que aconteceu

Dez dos doze arquivos do repositório citavam "a regra N do `CLAUDE.md`" — dezoito pontos de citação, acumulados em duas sessões. Escapavam só o `VIEWS-PROPOSTAS-r2.sql` e o `gitignore.txt`.

**O arquivo nunca existiu.** Confirmado pelo dono do projeto em 24/07/2026, depois de busca sem resultado no repositório, no Google Drive e no Notion.

A numeração — 6, 7 e 10 — não tem origem verificável. Foi descartada inteira.

## 2. O que se perdeu, e o que não

Verificação executada em todas as referências cruzadas do corpus, para saber se havia mais fantasma:

| Referência | Situação |
|---|---|
| `ADR-0002` §79 e §87 | ✅ apontam para as linhas certas, conteúdo certo |
| `PRD-v2.2` §2.4, §7.3, §7.5, §7.7, §7.8, §4.1, §4.2 | ✅ todas existem, com o conteúdo alegado |
| `CLAUDE.md` regras N | ❌ o único fantasma |

**As normas atribuídas ao arquivo tinham fonte real** — só não era ele:

| Citada como | Fonte real |
|---|---|
| "regra 6" — CRM read-only | `PRD-v2.2` §7.8 (*"O financeiro nunca escreve no CRM"*) e §7.3 (*"Jamais INSERT, UPDATE ou DELETE"*) |
| "regra 7" — segredos | `PRD-v2.2` §6, já na forma corrigida |
| "regra 10" — lacuna vira questão | **nenhuma.** Só aparece em documentos reconstruídos. Norma órfã, mantida no `CLAUDE.md` v1.0 como regra nova por ser como o projeto opera de fato |

Perdeu-se o continente, não o conteúdo.

## 3. Política editorial aplicada

Dois tratamentos distintos, deliberadamente:

**Documentos normativos** — `PRD-v2.2`, `SPEC-001`, `ADR-0002` r2, `GLOSSARIO`, `_TEMPLATE-SPEC`, `QUESTOES-bloco`: **editados no corpo**. São norma vigente; norma com citação quebrada é norma quebrada.

**Relatórios e documentos de passagem** — `P7`, `P8`, `RESUMO-SESSAO-2`, `LEIA-ME-retomada`: **corpo intacto**, nota de correção inserida no topo. São registro datado do que foi apurado naquele dia. Reescrever o corpo para remover uma afirmação que o relatório de fato fez é falsificar o registro — e este projeto já pagou uma vez pelo custo de escrever antes de verificar (`P8` §9).

## 4. Edições — mapa completo

### 4.1 Troca de citação (13)

| Arquivo | Antes | Depois |
|---|---|---|
| `PRD-v2.2` §6 | revisão da regra 7 do `CLAUDE.md` | `CLAUDE.md` regra 5 |
| `PRD-v2.2` §11 F-03 | colide com a regra 6 | colide com o §7.8 (`CLAUDE.md` regra 4) |
| `SPEC-001` R19 | PRD §7.8, regra 6 do `CLAUDE.md` | PRD §7.3 e §7.8 · `CLAUDE.md` regra 4 |
| `SPEC-001` §10 | regra 10 do `CLAUDE.md` | `CLAUDE.md` regra 10 |
| `SPEC-001` §11 | colide com a regra 6 | colide com o PRD §7.8 (`CLAUDE.md` regra 4) |
| `ADR-0002` r2, Decisão 2 | regra 6 do CLAUDE.md | PRD §7.8 (`CLAUDE.md` regra 4) |
| `GLOSSARIO` cabeçalho | (CLAUDE.md) | (`CLAUDE.md` regra 7) |
| `GLOSSARIO` verbete *inadimplência* | regra 6 do CLAUDE.md | PRD §7.8 (`CLAUDE.md` regra 4) |
| `_TEMPLATE-SPEC` cabeçalho | remontado a partir de … `ADR-0001` … regras inegociáveis do `CLAUDE.md` | proveniência corrigida, com nota |
| `_TEMPLATE-SPEC` §10 | Regra 10 do `CLAUDE.md` | `CLAUDE.md` regra 10 |
| `QUESTOES-bloco` F-03 | regra 6 do `CLAUDE.md` | PRD §7.8 (`CLAUDE.md` regra 4) |
| `P7`, `P8`, `RESUMO-SESSAO-2`, `LEIA-ME` | — | nota de correção no topo, corpo intacto (4 arquivos) |

### 4.2 Mudanças de conteúdo, não de citação (2)

Estas **não** são troca de referência. São correção de norma, e merecem leitura própria.

#### `PRD-v2.2` §2.4 — emenda da ordem spike/schema

A redação anterior dizia **"spike obrigatório antes do schema definitivo"** e atribuía a exigência ao `ADR-0001`. Contradizia frontalmente a `SPEC-001` §3.2, que separa migration de tabela de migration de policy e declara o schema implementável hoje. Os dois documentos conviviam em contradição direta, e a SPEC-001 chegava a citar o §2.4 sem citar a cláusula que a contradizia.

Nova redação: **spike obrigatório antes das *policies* definitivas.** O schema base — `tenant_id`, índices únicos compostos, `FORCE ROW LEVEL SECURITY` — sobrevive às três saídas candidatas do spike. Se nenhuma das três se sustentar, a estratégia muda inteira e o schema é revisto junto.

#### `SPEC-001` §3.2 — ressalva das três saídas · versão 2.0 → **2.1**

A §3.2 afirmava que o schema é implementável hoje, sem qualificar. A afirmação é verdadeira para as **três** saídas enumeradas (`SET LOCAL` por transação, `auth.uid()` com join, conexão por tenant), porque nenhuma delas remove `tenant_id` da tabela. É **falsa** para o cenário em que nenhuma das três se sustenta: schema por tenant ou banco por tenant apagariam a coluna e reescreveriam a spec inteira.

A ressalva foi acrescentada, com referência cruzada para o §2.4 emendado.

## 5. O que ficou de fora

Fora do escopo autorizado. Registrado para não se perder:

| Item | Situação |
|---|---|
| **`P8` §7 — números inconsistentes** | O §2 mede 81 tabelas sem policy (49 backup + 32 operacionais). O §7 manda somar "as **36** tabelas sem policy" e "retenção dos **45** backups". 36+45=81: são os números de uma revisão anterior, não atualizados. Além disso, o §7 pede um cruzamento que o próprio §2 já executou (interseção vazia). Corpo de relatório — precisa de decisão sobre editar ou anotar |
| **`ADR-0001`** | Citado como vigente em `ADR-0002` ("Revisa"), `_TEMPLATE-SPEC` e `RESUMO-SESSAO-2` ("válido, sem alteração"). **Não se confirmou se existe como arquivo.** Se não existir, é o mesmo padrão do `CLAUDE.md` e precisa do mesmo tratamento — provavelmente aposentadoria, já que a seção "o que do `ADR-0001` permanece" do `ADR-0002` r2 preserva os seis itens que sobreviveram |
| **`QUESTOES.md`** | Continua ausente. O `QUESTOES-bloco-para-fusao.md` está pronto e sem destino |
| **`VIEWS-PROPOSTAS-r2.sql`** | LATERAL da linha 92: `LIMIT 1` sem `ORDER BY`. Lead com mais de um valor em "Comissionamento" devolve linha não-determinística. Não é vazamento de tenant — é não-determinismo silencioso |
| **Anexo `ADR-0002` r1** | Um `ADR-0002` na versão **original** foi anexado em 24/07 por engano. Descartado. O repositório mantém a **r2**, que é a aceita. Não substituir |

## 6. Verificação

- 17 substituições aplicadas, cada uma com checagem de ocorrência única antes da escrita — nenhuma silenciosa
- Nenhuma citação a "regra N do `CLAUDE.md`" sobrevive em documento normativo
- As menções remanescentes estão só nos quatro relatórios, sob nota de correção, por desenho
