# PLANO — o layout da fatura por POSIÇÃO, e não por lista

| Campo | Valor |
|---|---|
| **Data** | 03/08/2026 |
| **Pedido** | *"construir com base no tamanho de folha que eu escolher e colocar os elementos onde eu desejar, não apenas assinalar se o elemento aparece ou deixa de aparecer"* |
| **Fonte** | `Q-DOCFATURA-01` decisão 2 (layout configurável por tenant, 30/07) — isto é a **segunda volta** dela |
| **Escopo** | Migration 23 · `src/dominio/layout-visual.ts` · `src/repos/documento.ts` · rotas · aba Documento · CSS de impressão |

---

## 1. O que existe hoje, medido no código

| Peça | Onde | O que faz |
|---|---|---|
| `campo_do_documento` | migration 19 | 16 campos fechados por enum · `rotulo`, `ordem` (`SmallInt`), `visivel` |
| `linhasDoDocumento()` | `src/dominio/layout-do-documento.ts` | devolve uma **lista linear** ordenada, já formatada |
| `paraFatura()` | `src/repos/documento.ts:346` | compõe no **servidor** e devolve **dados** — o CRM consome a mesma rota e não roda React |
| `<Documento>` | `web/src/telas/documento.tsx:424` | pinta uma estrutura **fixa** em JSX |
| impressão | `web/src/estilo.ts:539` | `@page { margin: 16mm }` |

---

## 2. Os oito pontos de melhoria, e três deles são defeito e não limitação

**1. A configuração ordena, não posiciona.** `ordem` é um inteiro numa lista linear. Não há coordenada, largura nem coluna: **duas informações nunca podem ficar lado a lado**, e é isso que o pedido nomeia.

**2. A moldura é código, não configuração.** Logo, o título `FATURA`, a competência e a faixa de pagamento estão em JSX fixo (`documento.tsx:426-453`). O tenant que configurou os 16 campos ainda **não escolhe onde a logo aparece** — a parte configurável é o miolo, e a moldura, que é o que se vê primeiro, não é.

**3. 🔴 Não há tamanho de papel — e isso é defeito.** `@page { margin: 16mm }` não declara `size`. O navegador usa o padrão do sistema operacional de **quem imprime**. A mesma fatura sai com geometria diferente em duas máquinas, e nada no sistema registra qual foi usada. É a classe de falha que este projeto persegue: divergência silenciosa entre dois lados, nenhum dos dois parecendo errado.

**4. 🔴 A prévia não é fiel ao papel.** Na tela o documento é `max-width: 800px; padding: 32px`; no papel é `width: 100%` com margem de 16mm. **São duas geometrias diferentes**, então a prévia não responde à única pergunta que ela deveria responder — *"é assim que vai sair?"*. Hoje ela confere conteúdo, não forma.

**5. 🔴 O estilo do total existe só na tela.** `documento.tsx:440-441` põe o `valor_total_centavos` em negrito 18px. Essa decisão **não está no dado** que `paraFatura` devolve — logo **o CRM, consumindo a mesma rota, não terá o negrito**. É o modo de falha do espelho que a `web/src/contas-regras.ts` já registrou: dois lados, nenhum parece errado. É também a prova de que apresentação precisa ser dado.

**6. Não há texto livre.** Endereço da empresa, instruções de pagamento, telefone de suporte, aviso legal: nada disso cabe num enum de **campos da fatura** — e o enum fechado está certo para dados, porque é ele que impede campo inexistente virar fatura errada. O que falta é outro tipo de bloco, não um enum maior.

**7. Não há como saber se estourou a página.** Com muitos campos mais o QR, o conteúdo pode passar de uma folha, e o único jeito de descobrir hoje é imprimir.

**8. Não há como voltar atrás nem comparar.** `campo_do_documento` é o estado corrente; a trilha da regra 9 registra o antes e o depois, mas não há "pré-visualizar sem salvar".

---

## 3. O desenho

### 3.1 A restrição que manda em tudo

**A composição continua no servidor e continua sendo DADO.** A decisão 4 da `Q-DOCFATURA-01` é *"entrega manual agora, com a rota do CRM já preparada"*, e o CRM não roda React. Então o editor não desenha o documento — ele **grava um layout**, e `paraFatura` passa a devolver blocos **já posicionados e já formatados**. Quem pinta (nossa SPA, o CRM, um gerador de PDF amanhã) só faz posicionamento absoluto.

Isso resolve o ponto 5 por construção: se o negrito é dado, os dois consumidores o têm.

### 3.2 Unidade: milímetro

Papel é milímetro. `numeric(6,1)` — grandeza física, escala decimal preservada, **nunca centavos** (regra 1), e chega como string do driver como toda `numeric` deste projeto. Um décimo de milímetro está abaixo da tolerância de qualquer impressora: a precisão sobra.

Pixel seria errado — depende de DPI. Percentual seria errado — o mesmo layout em A4 e A5 mudaria de proporção, e o pedido é escolher a folha.

### 3.3 Duas tabelas (migration 23)

```
layout_do_documento   um por tenant — a FOLHA
  tenant_id · papel enum · orientacao enum
  margem_topo_mm · margem_direita_mm · margem_baixo_mm · margem_esquerda_mm

bloco_do_documento    N por tenant — os ELEMENTOS
  tenant_id · id · tipo enum · campo (campo_de_fatura, NULL fora de tipo='campo')
  texto · x_mm · y_mm · largura_mm · altura_mm
  alinhamento enum · tamanho_pt · peso enum · borda bool · fundo bool · z
```

**Papel como enum fechado** (`a4`, `a5`, `carta`, `oficio`), não largura/altura livres: o mesmo argumento do `campo_de_fatura` — validação no banco, e um papel inventado vira fatura que não imprime. As medidas de cada um vivem em **código**, como o `PADRAO` já vive, pela mesma razão registrada na migration 19: semear no banco decidiria por todo tenant futuro.

**Seis tipos de bloco:**

| tipo | pinta | por quê |
|---|---|---|
| `tabela_de_campos` | a lista de `campo_do_documento` | **preserva o documento de hoje inteiro num bloco** — nenhuma configuração existente se perde |
| `campo` | um campo isolado, rótulo + valor | é o que permite pôr o TOTAL num quadro grande no canto |
| `texto` | texto livre do tenant | o ponto 6 |
| `logo` | a logo da identidade | o ponto 2 |
| `pagamento` | a faixa (QR, linha digitável) | o ponto 2 |
| `linha` | um filete horizontal | separador, que hoje não existe |

### 3.4 Compatibilidade: layout vazio = o documento de hoje

`bloco_do_documento` vazio devolve o **layout padrão em código** — logo em cima à esquerda, título e competência à direita, tabela no meio, pagamento embaixo —, que reproduz o que `documento.tsx` pinta hoje. Mesmo argumento do `PADRAO` de campos: **ausência de configuração não é documento vazio**, e semear na migration decidiria o layout de todo tenant futuro a partir do gosto de hoje.

Consequência prática: **a migration não migra dado nenhum e nada quebra.** Quem nunca abrir o editor continua com a fatura que já tinha.

### 3.5 O que o motor puro decide (`src/dominio/layout-visual.ts`)

Sem banco, sem React, testável sem os dois:

- as medidas de cada papel e o **retângulo imprimível** (papel − margens), com orientação aplicada;
- **`fora_da_pagina`** — bloco que não cabe. É erro, e o repositório recusa: um bloco fora do papel não é ambíguo;
- **`sobreposicao`** — dois blocos ocupando a mesma área. É **sinal, não recusa**: sobrepor pode ser intencional (marca-d'água, fundo), e recusar decidiria pelo usuário. Mesma forma da R21-b;
- a **composição final**: junta layout + blocos + dados da fatura e devolve o documento posicionado.

### 3.6 Impressão fiel (pontos 3 e 4)

`@page { size: <papel>; margin: 0 }` emitido **a partir do layout gravado**, e o documento vira `position: relative` com a largura e a altura exatas do papel; os blocos são `position: absolute` em mm. **A prévia na tela usa a mesma geometria**, apenas escalada por `transform: scale()` — então o que se vê é o que sai, que é o ponto 4.

### 3.7 As regras do `CLAUDE.md` que isto tem de respeitar

| Regra | Como |
|---|---|
| **1** | mm é grandeza física em `numeric(6,1)`; nenhum valor monetário novo |
| **2** | `tenant_id NOT NULL`, FK composta `(tenant_id, id)`, `UNIQUE (tenant_id, id)` nas duas |
| **3** | `ENABLE` + `FORCE` + policy nas duas, com a conferência `DO $$` no fim da migration |
| **7** | domínio em português: `bloco`, `papel`, `orientacao`, `alinhamento`, `largura_mm` |
| **8** | cada invariante com teste que falha quando violado |
| **9** | gatilho `app.auditar()` nas duas — a lição da migration 21, que quase dispensou |
| **10** | o que não for decidível vira questão, não default |
| **11** | nenhum índice único parcial cobrindo exatamente as colunas de uma FK |

---

## 4. Ordem de construção

1. `src/dominio/layout-visual.ts` puro + suíte sem banco
2. migration 23, aplicada **em banco de teste** · `db pull` + `generate`
3. `src/repos/documento.ts`: ler/gravar layout e blocos; `paraFatura` devolve posicionado
4. rotas `GET`/`PUT /cobranca/layout`
5. o editor na aba Documento: régua em mm, arrastar, redimensionar, painel do bloco
6. CSS de impressão com `@page size` dinâmico
7. testes com banco + testes do `web/`
8. registro: `SPEC-003`/`QUESTOES`/README

---

---

## EXECUTADO — 03/08/2026

Os oito passos da §4, na ordem. **`npm test` `EXIT=0`, 1156 → 1230 verificações**, delta de **74** contado nas duas pontas — 29 em `tests/layout-visual.ts`, 31 em `web/tests/layout.ts`, 14 em `tests/repos-documento.ts` (`W8a`–`W8n`) — e conferido contra o `npm test`: **diferença zero**. Catálogo **9/9** contra o banco de teste com a migration 23 aplicada.

| Passo | Onde |
|---|---|
| motor puro | `src/dominio/layout-visual.ts` · `tests/layout-visual.ts` |
| migration 23 | `prisma/migrations/20260803140000_layout_visual_do_documento/` · `db pull` + `generate` feitos |
| repositório | `layout()`, `blocos()`, `salvarLayout()` e `paraFatura().layout` em `src/repos/documento.ts` |
| rotas | `GET`/`PUT /cobranca/layout` |
| editor | `web/src/telas/layout-editor.tsx` · regras puras em `web/src/layout-regras.ts` |
| impressão | `.folha` em mm no `estilo.ts` · `@page size` injetado por `regraDaPagina` |

**Três coisas que apareceram ao construir, e nenhuma estava no plano:**

**1. `.map(naGrade)` produzia `NaN`.** `Array.map` passa `(valor, índice, array)`, então o índice virava o `passo` da grade: o primeiro elemento dividia por zero. Um `NaN` dali viajaria até a coluna `numeric` como coordenada e o bloco sumiria do papel sem erro em lugar nenhum. Achado ao escrever a `W1b`, que **continua chamando `.map(naGrade)` de propósito** — é o registro executável do defeito.

**2. As alças de redimensionar misturavam duas convenções.** `'e'` significava *esquerda* nas simples e podia ser lido como *este* nas diagonais (`'ne'`, `'se'`). É a classe exata de confusão que faz a alça mover o lado errado, e isso é invisível em revisão de código. Renomeadas para `'esquerda' | 'topo-direita' | …`.

**3. Duas verificações fixavam número onde a regra é relação.** A `W8h` afirmava "2 blocos" e ficou vermelha porque a verificação anterior legitimamente gravou outro número; a `I1c` de `web/tests/interface.ts` comparava a **sequência** de cores literais e não o conjunto, então o bloco de impressão crescer a derrubava sem que nenhuma cor nova tivesse entrado. As duas passaram a afirmar a relação — e a `I1c` mantém inteira a propriedade que importa: a quarta cor de papel dói.

---

## 5. O que este plano NÃO resolve, e fica declarado

- **Não gera PDF no servidor.** Continua sendo `window.print()` — decisão 3 da `Q-DOCFATURA-01`, e ela não mudou. O que muda é que agora o papel é **declarado**, então o PDF sai igual em qualquer máquina.
- **Não há múltiplas páginas.** Um layout, uma folha. Conteúdo que não couber é sinal, não paginação automática.
- **Não há layout por tipo de documento.** Um layout por tenant, como hoje.
- **Não há fonte configurável.** A tipografia continua sendo a de `web/src/tema.ts`; o que o bloco escolhe é tamanho, peso e alinhamento.
