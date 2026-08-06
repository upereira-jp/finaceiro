# RESUMO-SESSAO-22 — 06/08/2026

| Campo | Valor |
|---|---|
| **Foco** | **A última milha da fatura: o documento passou a sair em LOTE.** Era o único passo do caminho da primeira fatura que ainda era código, e ele estava na ponta que ninguém tinha olhado — a entrega. Depois dele, a **guarda do pagador** da `Q-PAGADOR-01`, que era a outra pendência de código com opção já nomeada |
| **Método** | Percorrer o caminho **inteiro** contra o código, não contra o índice. E medir a **linha de base** antes de atribuir defeito: dois dos três achados desta sessão são anteriores ao que eu escrevi, e só dá para dizer isso porque a base foi medida |
| **Resultado** | **1531 → 1549 verificações** · `EXIT=0` · **0 migrations** · nada escrito em produção · **nada publicado** |
| **Não feito** | Os cinco insumos humanos, que continuam humanos. E o `src/sicoob/http.ts`, pelas três razões da `RESUMO-SESSAO-21` §5, que não mudaram |

> # ESTADO ATUAL — 06/08/2026, fim da sessão
>
> | | |
> |---|---|
> | **Banco** | **24 migrations em produção = 24 no repositório.** Nenhuma pendente, e esta sessão não abriu nenhuma |
> | **Suíte** | `EXIT=0`, **1549** linhas `ok`. Delta **18** — 15 na aba Documento, 3 na guarda do pagador |
> | **Produção** | intocada |
> | **Publicação** | **10 commits fora do `origin/main`** — 7 herdados das sessões 21 e anteriores, **3 desta**. Contado, não estimado: a `RESUMO-SESSAO-21` dizia 6 e eram 7. Pela primeira vez desde 04/08 há mudança que **toca a SPA** — ou seja, o deploy voltou a ser necessário para que isto chegue a quem opera |
>
> **A fila continua em `PENDENCIAS-2026-08-05.md`.** Nada nela foi resolvido hoje: os cinco insumos são humanos.

---

## 1. O que faltava não era compor a fatura — era entregá-la

`GET /faturas/:id/documento` é **por fatura**, e o único consumidor na SPA era a prévia da aba Documento: um seletor com **uma** fatura e `window.print()`. Com 28 faturas na competência de 2026-06, isso são **28 seleções e 28 impressões à mão**.

**E o modo de falha de um trabalho manual repetido 28 vezes não é o erro — é a omissão.** Ninguém percebe a fatura que ficou sem imprimir, porque nada conta. É a mesma classe que a recusa contada do conector e da triagem fecham do lado de dentro, e que ficava aberta na saída.

Agora: **`web/src/lote-de-documentos.ts`** (puro, 15 verificações) e o modo *"imprimir o mês inteiro"* na prévia. Três coisas deliberadas, e as três são sobre contar:

- **compor é ato separado de imprimir.** São N requisições; dispará-las ao trocar de aba faria o lote acontecer sem ninguém pedir. Mesmo desenho do `--ensaio`/`--valendo`;
- **uma falha não derruba as outras e não some.** O `emLotes` rejeita o conjunto quando um item rejeita — e ali isso é o certo, a tela de Contratos precisa do mapa completo ou de um erro. Aqui é o contrário: 27 papéis de uma competência de 28 é exatamente a omissão que este trabalho existe para impedir. Cada composição é capturada, e a que falha aparece **nomeada por UC**, fora da pilha;
- **o que fica de fora aparece, com motivo e com um clique para incluir.** A soma `imprimir + fora = total` é a invariante do arquivo (`D3`), inclusive para status que a tela não conhece (`D6`).

**A decisão que eu NÃO tomei, e a regra 10 é o motivo.** `documento.paraFatura` **não tem guarda de status** — compõe o documento de qualquer fatura, inclusive cancelada. O servidor não tem opinião, então descartar status em silêncio seria a tela inventando regra de negócio. O padrão é o conjunto que o próprio servidor já nomeia como *"a fatura que espera dinheiro"* (`liquidacao.baixar` → `emitida`, `vencida`), **citado em vez de escolhido** — e a `D7` prende os dois juntos, para que o padrão do lote e a regra de baixa não possam divergir em silêncio.

---

## 2. Os dois defeitos que só o PDF pega — e o maior deles é anterior a mim

Nenhum dos dois aparece em `tsc`, em revisão de PR ou em qualquer verificação desta suíte: são seletores dentro de uma string de CSS. Apareceram porque a conferência foi feita **em Chromium, por `page.pdf()`** — o mesmo caminho do diálogo de imprimir.

### 2.1 Imprimir UMA fatura produzia um PDF de CINCO páginas

**Medido na linha de base, com o código original recompilado:** uma fatura → **5 páginas**, sendo **4 em branco**.

A causa é que **`visibility: hidden` esconde mas não desocupa**. A aba Documento inteira — logo, campos, editor de layout, painel do QR — continuava ocupando a altura dela, e **altura é o que o navegador pagina**. O documento nem entrava na conta: ele é `position: absolute` e flutua por cima.

| | páginas |
|---|--:|
| código original, 1 fatura | **5** |
| depois do conserto, 1 fatura | **1** |
| depois do conserto, 3 faturas | **3** |

O conserto tira do **layout** — e não só da vista — tudo que não é o documento nem caminho até ele. E ele falha na direção certa: navegador sem `:has()` descarta a regra inteira e volta ao comportamento de antes — páginas em branco, **nunca fatura faltando**.

**Por que isso importa mais do que parece:** o dono ia imprimir *uma* fatura para conferir antes de mandar 28. O primeiro contato com a saída do sistema seria um PDF com quatro páginas em branco.

### 2.2 O recorte da tela viajaria para o papel

Este eu **teria introduzido**, e ele não chegou a existir — mas vale registrado porque a classe é a que este repositório mais paga. A prévia guarda a folha dentro de uma caixa de altura **escalada** com `overflow: hidden`, só para o zoom não deixar um vão branco embaixo. Impresso, a folha volta ao tamanho real e a caixa **a cortaria**.

Antes isso não acontecia **por acidente**: a folha *era* o `#documento` com `position: absolute` e escapava do pai que a cortava. Ao transformar `#documento` em recipiente, o acidente acabaria — e o sintoma seria uma fatura cortada em ~30% da altura, sem erro nenhum.

---

## 3. A lacuna que o caminho ponta a ponta achou: a fatura sai com o valor incompleto, e em silêncio

`valor_total_centavos` é coluna **gerada**: `valor_consumo + valor_tarifas_concessionaria + valor_juros_multa` (`schema.prisma:485`). O segundo tem **default 0**, e `comporLote` usa zero quando ninguém informa (`fatura.ts:174`).

Consequência medida: **o lote de 28 compõe e emite sem erro nenhum, cobrando só o crédito** — sem as tarifas da distribuidora. E `lancarTarifasPorUC` **só aceita rascunho**, o que fixa a sequência em **três** passos e não dois:

```
compor  →  npm run tarifas  →  emitir em lote
```

Emitir antes obriga a **cancelar a fatura** para corrigir — e cancelamento exige motivo e fica na trilha.

**Nem a fila de `PENDENCIAS-2026-08-05` nem o "caminho mais curto" da `RESUMO-SESSAO-21` §7 têm esse passo**: os dois vão de *"compor o lote"* direto para a competência. `Q-TARIFA-CONC-01` **reaberta na parte operacional**, 🟡, com as duas perguntas que faltam.

---

## 4. E uma medição sobre a `Q-FATCHEIA-01` que muda o custo dela

Feita ao percorrer o caminho, e ela não estava em documento nenhum. `ehFaturaCheia` (`faturamento.ts:148`) é `data_fechamento <= primeiro dia da competência`. As datas que o próprio `contratos-modelo-20260805.csv` sugere — `ganho_em` do CRM — vão de **2026-06-05 a 2026-07-12**. Então, pelas 29 marcadas `sim`:

| competência | faturas no lote | **cheias** |
|---|--:|--:|
| **2026-06** | 28 | **0 de 29** |
| **2026-07** | 9 (só a `0002`) | 5 daquelas 9 |

Faturar junho hoje produz **28 faturas válidas e cobráveis, nenhuma cheia** — o contador `faturas_cheias_pagas` não avança e a liquidação **não gera comissão nenhuma**. Isso pode estar certo (contrato fechado em 17/06 cobre junho pela metade), mas é a `Q-FATCHEIA-01` sendo respondida **por omissão** sobre a carteira inteira.

**A janela para decidir sem custo fecha na primeira liquidação:** dá para cancelar e recompor enquanto não houver baixa; depois não há volta (`Q-ESTORNO-01`). E `data_fechamento` é editável **no CSV, antes de importar** — depois a R20-b congela.

---

## 4.1 A `Q-PAGADOR-01` fechou a metade que era código — e cai de 🔴 para 🟡

A questão nomeava três opções, e dizia da primeira que era *"barata, independe das outras duas, e é o que impede a falha de aparecer como erro de integração"*. Ela foi executada.

`boleto.registrar()` agora recusa com **`PagadorSemDocumento` (422)**, nomeando **qual UC**, qual cliente e o comando que resolve. O `?? ''` de `boleto.ts` saiu.

**Duas decisões dentro da guarda, e nenhuma é de estilo:**

- **a recusa é nossa e não da Sicoob.** Sem ela quem recusava era o banco, e a recusa voltava pelo `catch` traduzida em **502** — o código que manda procurar indisponibilidade de banco onde o que falta é um CPF que ninguém digitou;
- **ela vem ANTES de criar a linha do boleto**, ao contrário de todo o resto daquele arquivo. Lá a linha nasce antes da chamada porque a rede pode cair no meio e o boleto existir só do lado do banco. Aqui **nada foi tentado**, e uma linha `pendente` poria na fila do `PRD` §6 um boleto que não pode dar certo até alguém digitar um documento — e a fila, por decisão registrada em `dominio/agenda.ts`, **nunca desiste sozinha**. Seria uma tentativa a cada `tetoSegundos`, para sempre, contra a mesma ausência.

**O endereço não entrou na guarda, de propósito:** o que a Sicoob exige de fato de endereço **não está medido** — é o item (c) da questão, e recusar por um campo que talvez seja opcional bloquearia boleto que sairia.

**E a `Y5c` encolheu em vez de sumir.** Ela era o registro executável de que o `?? ''` seguia sem guarda; com a guarda, a segunda metade da afirmação virou mentira. Passou a medir só o **dado**, que continua ausente. Apagar teria perdido a medição; deixar como estava seria a classe do índice vencido que este repositório já pagou quatro vezes.

---

## 5. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Usei o ícone `mais`, que não existe** | conferir o vocabulário fechado antes de compilar | `iconografia.ts` tem `acrescentar`. O vocabulário ser fechado é o que transforma isso em erro em vez de um ícone faltando na tela |
| **Nomeei uma prop `rotulo`, sombreando o `rotulo` do `ui.tsx`** | o `tsc` | Barato. Registrado porque foi copiar a forma da tela vizinha sem olhar o que o nome já significava ali |
| **A primeira `D12` caiu — e o teste estava certo** | a própria verificação | Ela nega a existência de `#documento.folha`, e o **comentário** do `estilo.ts` cita essa forma para explicar o que mudou. Casar contra comentário faz o teste medir a documentação em vez da regra. O conserto foi tirar os comentários antes de casar, não afrouxar a asserção |
| **Quase atribuí a mim um defeito anterior** | medir a linha de base | O PDF de uma fatura tinha 4 páginas com o meu código, e eu ia consertar como se fosse meu. Recompilar o original mostrou **5** — o defeito era anterior e o meu já o tinha reduzido. Sem a base medida, o registro desta sessão diria a coisa errada |

---

## 6. Para quem abrir a próxima sessão

**O caminho da primeira fatura não mudou de tamanho, mas mudou de forma:** o último passo que era código deixou de ser. O que falta é, todo ele, insumo humano ou decisão com dono.

1. **chave Pix** (identidade de cobrança) — o dono disse que envia;
2. **CPF/CNPJ de 24 pessoas** + **dia de vencimento de 29 UCs** + **CPF/CNPJ de 2 originadores** — os três modelos já gerados;
3. **decidir a `Q-FATCHEIA-01`** e, se for o caso, ajustar `data_fechamento` no CSV **antes** de importar — §4;
4. `npm run contratos -- --ensaio`, conferir linha a linha, depois `--valendo`;
5. compor → **`npm run tarifas`** → emitir — a §3 é o passo que faltava na lista;
6. imprimir o mês inteiro na aba Documento.

**Uma coisa a fazer que não é insumo: o deploy.** Esta sessão é a primeira desde 04/08 que **toca a SPA**, e sem publicar o lote não existe para quem opera. O ciclo é o de sempre, e o `generate` não é opcional: `git pull` → `migrate deploy` → **`prisma generate`** → `web:build` → `restart`.

**Duas coisas para não fazer**, e as duas continuam da sessão 21: não escreva o `src/sicoob/http.ts` antes da credencial de sandbox, e não digite contrato para as três UCs do Edimar antes da `Q-PARCERIA-01`.
