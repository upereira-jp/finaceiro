# Pedido ao dev do CRM — rodada 8

| Campo | Valor |
|---|---|
| **Data** | 14/08/2026 |
| **De** | Financeiro G3 |
| **Assunto** | **A tarifa (R$/kWh) do card** — uma coluna numa view, e três perguntas curtas sobre o que ela significa |
| **Rodada anterior** | `PROMPT-dev-crm-rodada7-2026-08-08.md` (data de nascimento) |

---

## O contexto, em três linhas

A decisão do dono em 14/08 foi: **a tarifa deixa de ser digitada no financeiro e passa a vir do card do CRM**, que — segundo ele — *"agora tem exatamente esse campo"*.

Hoje o financeiro tem uma tela onde alguém digita R$/kWh e abre uma vigência. Ela sai. O que entra no lugar depende de você.

**Não achamos o campo pelo caminho que temos**, e é por isso que este pedido existe.

---

## O que já foi medido deste lado, para não gastar o seu tempo

Medido em 14/08/2026, conectado como `financeiro_ro`:

| Onde | Como | Resultado |
|---|---|---|
| as **10 views** de `financeiro.*` | listagem de colunas do catálogo | **nenhuma** tem coluna com "tarifa" no nome |
| **qualquer schema visível** | `column_name ilike '%tarifa%'` | **zero colunas** |
| `public` | contagem de colunas visíveis a esta role | **0** — a role não enxerga tabela base, e é assim que tem de ser |

Ou seja: **não é que não procuramos — é que a nossa role não alcança.** A regra 4 do nosso `CLAUDE.md` proíbe o financeiro de ler tabela base do CRM em qualquer circunstância; só as views de `financeiro.*`, pela `financeiro_ro`, que não tem `BYPASSRLS`. Então mesmo que o campo exista na tabela do card, ele **não existe para nós** enquanto não estiver numa view.

O mais perto que chegamos é `financeiro.vendas_ganhas`, que expõe `consumo_kwh` e `consumo_reais`. Dá para derivar uma tarifa dividindo um pelo outro — e nós já fizemos isso uma vez, em 12/08, sobre a planilha de beneficiárias: **quatro linhas independentes deram `1,185397 · 1,185405 · 1,185394 · 1,185418`**, que concordam até a quinta casa. Mas derivar não é ler o campo, e a diferença aparece no dia em que os dois discordarem.

---

## O pedido

**Expor a tarifa do card numa view de `financeiro.*`.**

Se ela pertence ao contrato/rateio, o lugar natural é `financeiro.rateio_clientes`, que já traz `contrato_id`, `uc` e `percentual_rateio`. Se pertence à venda, é `financeiro.vendas_ganhas`. Você sabe melhor do que nós.

O que pedimos da coluna:

| | |
|---|---|
| **Tipo** | `numeric` com **6 casas decimais**, não `float` e não centavos. Do nosso lado tarifa é `numeric(12,6)` e viaja como **string** — medido: truncar `1,187650` em centavos cobra **R$ 2,90 a mais** numa UC, num mês, e sempre a mais |
| **Nome** | qualquer um que contenha `tarifa`, para ser achável no catálogo |
| **`crm_tenant_id`** | como todas as outras — é por ele que filtramos, e é invariante com teste |

---

## As três perguntas, e elas decidem mais do que a coluna

### 1. A tarifa é **por card** ou é a mesma para todo mundo?

É a pergunta que muda o nosso schema, não só a origem do número.

Hoje, do nosso lado, tarifa é **uma por distribuidora, versionada por vigência** — um número serve todos os clientes da Equatorial, e muda no dia em que a distribuidora muda. Um campo no card é **um número por cliente**.

- ☐ **(a) É por card, e clientes diferentes têm valores diferentes** — então o nosso modelo muda: a tarifa deixa de pendurar em distribuidora e passa a pendurar em contrato/UC. É migration, é mudança na composição da fatura, e é a regra R26 reescrita.
- ☐ **(b) É por card, mas na prática é o mesmo número para todos** — é a tarifa da distribuidora, copiada em cada card. Então o campo é a **fonte**, e o nosso modelo continua por distribuidora.

**A medição de 12/08 aponta para (b)**: se fosse (a), aquelas quatro linhas não concordariam até a quinta casa. Mas medição de quatro linhas não é resposta, e quem sabe é você.

### 2. Ela tem **vigência**?

O nosso lado versiona: cada tarifa tem `vigencia_inicio` e `vigencia_fim`, e a composição da fatura busca a que valia **na competência**. Uma fatura de julho refaturada em setembro usa a tarifa de julho.

- ☐ **Tem histórico** — em que coluna, e dá para expor?
- ☐ **É um valor só, sobrescrito quando muda** — então o histórico se perde no CRM, e nós teríamos de carimbar a tarifa na fatura no momento da emissão para não reescrever o passado.

**Se for a segunda, não é problema seu** — é decisão nossa, e nós a tomamos. Só precisamos saber qual das duas é.

### 3. Qual a **cobertura**?

De quantos dos clientes ativos o campo está **preenchido** hoje?

A pergunta tem história neste projeto: em 08/08 a afirmação que chegou aqui foi *"todos os clientes devem ter"* e a diferença entre **deve ter** e **tem** foi o que decidiu se aquilo virava planilha. Aqui é pior: **tarifa ausente não pode virar zero.** Uma fatura com tarifa zero sai com valor zero, sem erro nenhum, e o cliente recebe.

---

## Por que a resposta muda o trabalho, e não só a informação

| Se… | Então… |
|---|---|
| **(b) + tem vigência** | pedimos a coluna, trocamos a fonte, e a tela de digitar tarifa **sai**. É o caminho curto |
| **(b) + sem vigência** | o mesmo, mais um carimbo da tarifa na fatura no momento da emissão — nosso lado, nossa decisão |
| **(a)** | migration, mudança na composição da fatura e na R26. Não é difícil, mas não é uma coluna |
| **campo não existe na base** | volta a ser decisão do dono: derivar de `consumo_reais / consumo_kwh`, ou continuar digitando |

**Nenhum dos quatro é problema** — o que atrapalha é construir sem saber qual.

---

## O que NÃO estamos pedindo

- **Nada de escrita.** O financeiro não escreve no CRM, em nenhuma circunstância e por nenhum caminho. Se algum dia precisar do inverso, é endpoint nosso que vocês consomem;
- **Nada de tabela base.** Não queremos `GRANT` em `public`, não queremos `BYPASSRLS`, não queremos exceção. Uma coluna numa view resolve;
- **Nada urgente hoje.** O que segura a primeira fatura é decisão do nosso lado. Mas isto **bloqueia** a tela nova de tarifa, então quanto antes soubermos qual dos quatro cenários é, melhor.

---

## Uma observação de contrato que vale independentemente da resposta

Medimos hoje que `financeiro.lead_merges` ganhou uma coluna — **`unificado_em`** — que o nosso `SELECT` não lê, porque ele nomeia coluna por coluna em vez de usar `SELECT *`.

**Isso funcionou como projetado e não quebrou nada**, e é o motivo de nomearmos: `SELECT *` deixaria o contrato mudar sozinho. Mas o nosso conector hoje detecta **view** nova ou ausente e **não** detecta **coluna** nova. Se `unificado_em` era para nós, ela passou despercebida — avise, que a gente lê.

*(Continua valendo o apontamento das rodadas anteriores: a tabela `tenants` do CRM guarda `openai_api_key`, `whatsapp_access_token`, `instagram_access_token`, `meta_page_access_token` e `meta_verify_token` em `text` puro, e o repositório foi público até 25/07. **Rotação, não só migração de coluna.**)*
