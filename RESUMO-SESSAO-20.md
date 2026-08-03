# RESUMO-SESSAO-20 — 03/08/2026

| Campo | Valor |
|---|---|
| **Foco** | Duas entregas. **O conector passou a ler as dez views do CRM e a conferir o eixo do originador**; e **o layout da fatura deixou de ser lista e passou a ser posição** — a pedido do dono |
| **Método** | Medir antes de construir, e **fotografar depois**. As duas coisas pagaram: a medição decidiu cada regra de sinal, e a fotografia pegou dois defeitos que a leitura de código não pegaria |
| **Resultado** | 1 questão fechada · 1 aberta · **1 migration** · 1123 → **1230 verificações** · `EXIT=0` · catálogo 9/9 |
| **Não feito** | **Nada foi escrito em produção.** As migrations 22 e 23 seguem só em banco de teste; o destrave `--valendo`, o deploy e a `Q-PARCERIA-01` continuam esperando decisão |

> # ESTADO ATUAL — 03/08/2026, fim da sessão 20
>
> | | |
> |---|---|
> | **Banco** | **23 migrations**; a 22 (`contas_a_pagar`) e a 23 (`layout_visual_do_documento`) **só em banco de teste**. Produção segue com 21 |
> | **Suíte** | `EXIT=0`, **1230** linhas `ok` em 47 suítes. Delta **107**, contado na fonte e conferido contra o `npm test`: diferença zero |
> | **Produção** | **inalterada.** Só `SELECT` |
> | **O eixo do originador** | ✅ decidido na sessão 19, e **agora legível por código** |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **`Q-PARCERIA-01`** — vendedor **e** parceiro na mesma venda, e o contrato guarda um | 🔴 **trava a digitação** | Vinicius + dev do CRM |
> | **CPF/CNPJ dos três originadores** | 🔴 | Vinicius + operação |
> | **`--valendo` do destrave + ciclo** | 🔴 **pronto, ensaiado, não executado** | Vinicius |
> | **Preencher o dia de vencimento das 39 UCs** | 🔴 | Vinicius + operação |
> | **Deploy: migrations 22 e 23 + bundle** | 🔴 | Vinicius |
> | **`Q-SITUACAO-01`** — 11 das 39 UCs `nao_ativado` no CRM | 🟡 **nova** | Vinicius + operação |
> | `Q-CLIENTEDUP-01` · `Q-PAGADOR-01` · `Q-FATCHEIA-01` · `Q-WEBHOOK-01` · `Q-SICOOB-01` | 🔴 | Vinicius |
> | ~~`Q-VIEWSCRED-01`~~ · ~~`Q-SPEC001-08`~~ | ✅ | fechadas |

---

## 1. O conector lê as dez views — e a causa raiz não era o conector

A `Q-VIEWSCRED-01` dizia: *"o CRM tem 10 views e o conector conhece 8, e as duas que faltam são justamente as que respondem quem vendeu e qual a situação."*

**Medido antes de construir**, pela `financeiro_ro`: **39 das 39 UCs espelhadas têm crédito vigente**. As 5 que sobram das 44 são as que o destrave e o atraso de um ciclo explicam. O eixo deixou de depender de documento — e documento envelhece, que era literalmente a lição da `Q-CRMCODIGO-01`.

A `SPEC-002` v1.6 ganha a **R26** e o **invariante 14**: o conector lê e **nunca escreve originador**. `originador_id` é campo local (R5) e a R20-b congela o tipo no `rascunhar` sem edição — gravar ali seria decidir sozinho, sem trilha de gente, quanto alguém recebe. Divergência vira **sinal**, na forma da R21-b e da R25.

**As cinco condições foram medidas contra o CRM real antes de escritas, e as cinco disparam zero vezes hoje.** Não é sorte: é o critério de ruído que a R25 fixou — *um sinal que dispara em toda rodada treina qualquer um a ignorar o `detalhe` inteiro*. As três UCs do Edimar, por exemplo, só viram sinal quando alguém digitar o contrato; antes disso não há escolha feita a acusar.

### 1.1 O que estava errado não era ler oito views. Era não contar.

As duas views existem **desde 01/08** e nós descobrimos em **03/08**, por acaso — conferindo, por outro motivo, uma afirmação de que elas não existiam.

O motivo é que **nada deste lado comparava o que o CRM expõe contra a nossa lista fechada**. `scripts/ciclo-crm.ts` imprimia `views legiveis: 10` numa linha que ninguém confronta com o 8 de `VIEWS_DO_CRM`. **Contagem que ninguém confere não é medição.**

`conferirRoleDeLeitura` passa a devolver `viewsNovasNoCrm` e `viewsAusentes`, e o script grita as duas — a segunda é mais grave (é o contrato de integração quebrando), a primeira é a que custou uma semana de planejamento por planilha.

### 1.2 🟡 `Q-SITUACAO-01`, que apareceu ao ler a segunda view

A §4 da `RESPOSTA-dev-crm-rodada5` pediu **coluna de situação** do contrato de rateio, porque sem ela toda linha de `rateio_clientes` era lida como válida. Eles entregaram. Lendo:

| sobre as **39 UCs espelhadas** | |
|---|--:|
| `ativado` | **28** |
| `nao_ativado` | **11** — destas, **7** em troca de titularidade |

Hoje não custa nada: `contrato` tem 0 linhas. **Recusar as 11, marcá-las na UC, ou só contar** são três caminhos diferentes, e os três mudam o que a operação vê. É decisão de negócio com dono (regra 10). O que foi construído é o terceiro — `situacao_do_rateio` como **contagem** no `detalhe`, porque 11 sinais por rodada seriam ruído —, mais um sinal que dispara quando um contrato **ativo** cobrir um rateio não ativado. **A decisão custa menos agora, com contrato em zero, do que depois de 41 digitados.**

---

## 2. O layout da fatura: de lista para posição

O pedido do dono: *"construir com base no tamanho de folha que eu escolher e colocar os elementos onde eu desejar, não apenas assinalar se o elemento aparece ou deixa de aparecer"*.

O que existia (`campo_do_documento`, migration 19) resolvia **quais** campos e em que **ordem** — uma lista linear, sem coordenada, sem largura e sem coluna: **duas informações nunca podiam ficar lado a lado.** E a moldura — logo, título, faixa de pagamento — nem configurável era: estava em JSX fixo.

Plano e execução completos em **`PLANO-layout-visual-2026-08-03.md`**. O essencial:

**Migration 23** — `layout_do_documento` (papel, orientação, quatro margens) e `bloco_do_documento` (seis tipos, geometria em **milímetro**). Milímetro porque papel é milímetro: pixel depende de DPI e porcentagem faria o mesmo layout mudar de proporção entre A4 e A5, que é o que escolher a folha deveria impedir.

**Nada foi migrado e nada se perde.** `campo_do_documento` continua sendo o conteúdo da tabela de valores, e o bloco `tabela_de_campos` a pinta. Layout vazio cai no padrão em código, que reproduz o documento de sempre — pela mesma razão que a migration 19 não semeou campos.

### 2.1 Três defeitos silenciosos consertados junto, e nenhum estava no pedido

| | |
|---|---|
| **`@page` não declarava `size`** | o papel era o padrão do **sistema operacional de quem imprime**. A mesma fatura saía com geometria diferente em duas máquinas, e nada registrava qual foi usada |
| **a prévia não era fiel ao papel** | na tela era `max-width: 800px` em pixel; no papel era `width: 100%` com margem em milímetro. **Duas geometrias:** a prévia conferia conteúdo, não forma |
| **o negrito do total vivia só no `.tsx`** | duas linhas de `documento.tsx`, e a decisão **não viajava no payload**. O CRM consome a mesma rota e não roda React: receberia a fatura sem ele, e **nenhum dos dois lados pareceria errado** |

O terceiro é o que decidiu o desenho: **apresentação virou dado**. Se o peso, o tamanho e o alinhamento estão no bloco, os dois consumidores recebem o mesmo documento.

Erro e sinal continuam distinguidos como na R21-b: bloco **fora do papel** é **recusa** (não há leitura em que o usuário esteja certo — ele simplesmente não imprime); **sobreposição** é **aviso** (pode ser intencional, e recusar decidiria pelo dono o que vai no papel dele).

---

## 3. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **`.map(naGrade)` produzia `NaN`** | ao escrever a `W1b` | `Array.map` passa `(valor, índice, array)`: o índice virava o `passo` da grade e o primeiro elemento dividia por zero. Um `NaN` dali viraria coordenada e **o bloco sumiria do papel sem erro em lugar nenhum**. A `W1b` continua chamando `.map(naGrade)` de propósito — é o registro executável |
| **As alças de redimensionar misturavam duas convenções** | ao reler o tipo | `'e'` era *esquerda* nas simples e podia ser lido como *este* nas diagonais (`'ne'`, `'se'`). É a confusão que faz a alça mover o lado errado, e isso é invisível em revisão de código. Renomeadas por extenso |
| **A prévia nunca se media** | **fotografando a tela** | O `useEffect` tinha `[dados]` na lista e nessa renderização o componente ainda fazia `return` cedo — a `ref` era `null` e a largura ficava em zero. **O sintoma não era erro:** `escalaDaPrevia(0, …)` devolve 1 de propósito, então a folha saía em tamanho natural dentro de uma coluna menor e era **cortada**, com o resto da tela perfeito. Trocado por `ResizeObserver` |
| **O filete se rotulava** | **fotografando a tela** | Um bloco de 1 mm com o texto *"Filete separador"* dentro, vazando por cima do bloco de baixo. Num bloco de 1 mm não há onde caber rótulo |
| **Duas verificações fixavam número onde a regra era relação** | as próprias verificações, vermelhas | A `W8h` afirmava "2 blocos" e o passo anterior legitimamente gravou outro número; a `N58` afirmava zero divergências no ciclo inteiro, e o tenant de teste acumula UCs dos blocos anteriores. Prender o total mede **ordem de execução**, não a regra |
| **A `I1c` prendia a sequência de cores, não o conjunto** | o bloco de impressão cresceu | Ela prendia duas coisas — *quais* cores e *quantas vezes* cada uma aparece — e só a primeira era a intenção declarada. Passou a comparar o conjunto; a propriedade que importa (a quarta cor de papel dói) segue inteira |

**As duas do meio só apareceram ao fotografar a tela.** É a mesma lição que o `INTERFACE-2026-07-30.md` já tinha registrado, e ela se pagou de novo: leitura de código não pegaria nenhuma das duas, porque nenhuma das duas produz erro.

---

## 4. Uma coisa pequena que é a terceira vez

O `README.md` listava a **`Q-SPEC001-08`** como 🟡 aberta. Ela **fechou em 30/07** — `QUESTOES.md` a marca RESOLVIDA e a `SPEC-001` §3.4 traz a nota desde então. O índice ficou vencido por quatro dias.

É exatamente o modo de falha que o `PATCH-citacoes` tratou e que a `Q-ESCOPO-01` repetiu: **o corpo datado está certo, o índice está errado, e quem lê só o índice decide errado.** Terceira vez, e vale como classe a procurar, não como descuido isolado.

---

## 5. O que muda para quem opera amanhã

1. **A digitação continua travada nas mesmas duas coisas:** a `Q-PARCERIA-01` e os três CPF/CNPJ. Nada do que foi construído hoje destrava isso — o que mudou é que **digitar errado agora aparece sozinho no ciclo seguinte**, em vez de ficar em silêncio. A R20-b continua sem caminho de edição;
2. **o mapa de atribuição deixou de ter prazo de validade.** O conector lê o crédito a cada ciclo; `ATRIBUICAO-originador-2026-08-03.md` continua sendo o registro, mas não é mais a única fonte;
3. **a aba Documento tem um painel novo** — *Onde cada coisa fica na folha*. Escolher papel, orientação, margens e arrastar os elementos. **A folha na tela tem o tamanho real do papel**;
4. **o papel agora é declarado.** Quem imprimir vai ver o diálogo já em A4, e não no padrão da máquina;
5. **a `RESPOSTA-dev-crm-rodada6` foi atualizada** e leva **três** perguntas: a comissão com parceiro indicador, o `documento` do cliente numa view, e se UC com rateio `nao_ativado` pode ser faturada;
6. **o deploy acumulou:** agora são **duas** migrations pendentes (22 e 23) mais o bundle. O procedimento é o mesmo do `RETOMADA` §2 — sem o `prisma generate` o servidor **recusa subir**, de propósito.
