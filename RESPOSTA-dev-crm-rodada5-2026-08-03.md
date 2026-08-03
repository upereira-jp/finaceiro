# Resposta ao dev do CRM — rodada 5 (03/08/2026)

> ## As suas duas perguntas têm resposta medida, e a primeira desfaz a hipótese.
>
> **A lista de 39 não veio de planilha da operação.** Ela veio de vocês — é o que
> o conector leu de `financeiro.rateio_clientes`, e cada uma das 39 carrega o
> `contrato_id` de origem. Nenhuma linha do nosso lado foi digitada à mão.
>
> **Então a diferença não é "contratos ainda não ativados".** É outra coisa, e
> ela é de duas naturezas — uma é atraso nosso e a outra é uma correção de vocês
> que o conector **recusa seguir de propósito**. As duas estão nomeadas abaixo,
> UC a UC.
>
> **A lista das 44 não chegou nesta mensagem.** Marquei as 41 que eu enxergo; a
> diferença para as suas 44 são **3 linhas que as views não expõem**, e a §4 diz
> por quê.

---

## 1. De onde veio a lista de 39, e quando

| | |
|---|---|
| **Fonte** | `financeiro.rateio_clientes` + `financeiro.rateio_creditos`, casadas por `contrato_id` |
| **Como** | conector automático (`npm run ciclo`), nunca digitação |
| **Prova por linha** | as 39 UCs têm `crm_usina_cliente_id` preenchido — **39 de 39**. É o `contrato_id` de vocês |
| **Último ciclo** | **28/07/2026, 22:57** — e não roda desde então |
| **Cliente** | 84 de 84 com `crm_lead_id`. Nada nosso é local |

**Conferência que fecha:** as 39 são um **subconjunto** das 41 linhas de
`rateio_clientes` de hoje. Não há uma única UC no nosso espelho que não esteja
na view de vocês.

```sql
-- o que rodei, pela role financeiro_ro
SELECT count(*), count(DISTINCT uc) FROM financeiro.rateio_clientes;   -- 41 | 41
```

**Nota que muda a leitura das duas medições anteriores:** em 28/07 a view tinha
**UC repetida em dois contratos** — `000041446801282` e `000136464401264` —, e o
conector recusou as duas (ele não escolhe qual vale). Hoje **não há repetição**:
41 linhas, 41 UCs distintas. Vocês corrigiram isso entre 28/07 e agora.

---

## 2. A diferença 39 → 41, UC a UC

São exatamente **duas**, e as causas são diferentes:

| UC | cliente | usina | rateio | por que não está nas 39 |
|---|---|:--:|--:|---|
| `000295713501257` | Marlon Estevam de Sousa | `04` | 3,0% | **atraso nosso.** Entrou na view depois do nosso último ciclo. Um `npm run ciclo` a traz |
| `000307301401201` | FERNANDO ALBINO - CARTEIRA LOURIVAL | `0001` | 5,5% | **bloqueio de propósito.** Ver §3 |

Rodei o ciclo em **ensaio** (rollback, nada gravado) para não afirmar de memória:

```
criados 3 · atualizados 66 · recusados 1
recusa: 000307301401201 — contrato de rateio 524a4866-be99-4803-a203-58691d506654
        ja esta vinculado a UC 000041446801282 e agora aponta para 000307301401201.
        O conector nao move vinculo de contrato entre UCs: uma das duas leituras
        esta errada, e escolher seria palpite.
```

---

## 3. 🔴 O achado que vale mais que a contagem: uma atribuição nossa está errada agora

O contrato `524a4866-be99-4803-a203-58691d506654` **mudou de UC** no CRM:

| | UC | cliente |
|---|---|---|
| **como estava** quando espelhamos (28/07) | `000041446801282` | FERNANDO ALBINO - CARTEIRA LOURIVAL |
| **como está no CRM hoje** | `000307301401201` | FERNANDO ALBINO - CARTEIRA LOURIVAL |

E a UC `000041446801282` passou a pertencer a **outro** contrato
(`74bb7b2d-…`, lead `G3-0311`, **Renata Lucy Nogueira Drumond Teles Leaonilton**).

**Consequência, e ela é hoje:** o nosso espelho tem a UC `000041446801282`
atribuída ao **FERNANDO ALBINO**, e o CRM diz que ela é da **Renata Lucy**.
Digitar contrato por essa linha creditaria a pessoa errada — e do nosso lado o
tipo do originador **congela na criação e não há edição**.

**O conector não corrige isso sozinho, e é decisão registrada:** mover vínculo de
contrato entre UCs seria escolher qual das duas leituras vale, e escolher em
silêncio é o que a nossa regra proíbe. Por isso vira **recusa contada** e fica
esperando resposta humana.

**A pergunta que devolvo, e é a única desta rodada que trava trabalho:**
essa troca foi **correção de digitação** (a UC do Fernando estava errada e vocês
consertaram) ou **duas coisas distintas** (o Fernando mudou de UC **e** a
`000041446801282` foi para a Renata)? A resposta decide se a nossa linha antiga
se corrige ou se ela vira duas.

---

## 4. As três coisas que eu não consigo ver — e é por isso que a minha conta dá 41 e a sua dá 44

Isto é o assunto da rodada 5 inteira: **o que não está nas views `financeiro.*`
não existe para o financeiro.** Não é preferência de arquitetura — é regra nossa,
e o conector não lê tabela base de vocês por nenhum caminho.

| O que vocês citam | O que a view devolve | Efeito |
|---|---|---|
| **10 em troca de titularidade** | `rateio_clientes.troca_titularidade` vem **NULL em 41 de 41** | as 39 estão todas como `propria` do nosso lado. **Não consigo distinguir nenhuma** |
| **5 na usina `407706301217`** | `financeiro.usinas` expõe **4** códigos: `0001`, `0002`, `0003`, `04`. Esse número não aparece em nenhum deles, nem em `rateio_clientes.uc` | essa usina e as UCs dela são **invisíveis** para nós |
| **"não ativados"** | a view não tem coluna de situação do contrato de rateio | **toda linha de `rateio_clientes` é lida como válida.** Não há como eu recusar as não ativadas — eu não sei quais são |

**O pedido concreto, e é pequeno:** expor em `financeiro.rateio_clientes` (a) o
`troca_titularidade` real em vez de `NULL`, e (b) alguma coluna de **situação**
do contrato de rateio — ativado / não ativado. Com essas duas, a diferença deixa
de precisar de conferência manual: o conector recusa sozinho o que não está
ativado, e **a recusa fica contada e visível para vocês também**.

---

## 5. A sua pergunta 2 — e a resposta é do nosso modelo, não uma escolha de processo

> *"vocês digitam o contrato só das UCs ativas, ou do cliente inteiro?"*

**Contrato é por UC. Não existe contrato de cliente no nosso schema** —
`contrato.unidade_consumidora_id` é obrigatório, e há índice único que garante
**um contrato vigente por UC**. Então a pergunta não chega a ter as duas opções:
o que se digita é uma linha por UC, e só para UC que tenha rateio (usina +
percentual). UC sem rateio não gera fatura — ela vira recusa contada.

Nos dois casos que você nomeou:

**CARLOS GABRIEL SANTOS ALVES** — o CRM tem **4 leads** para ele e **1** com
contrato de rateio (`000277455301256`, usina `0001`, 2,6%). Os outros 3 não
produziram UC nenhuma no nosso espelho: sem linha em `rateio_clientes`, não há o
que espelhar. **Um contrato, então.** Confere com o seu "1 ativa, 3 sem rateio".

**CELIA REGINA / RENATA LUCY (telefone `556284430053`)** — o CRM tem **4** linhas
de rateio nesse telefone, e nós espelhamos as 4:

| UC | cliente na view | rateio |
|---|---|--:|
| `000288026201278` | CELIA REGINA DE JESUS/MINEIRO | 5,5% |
| `000055953601208` | RENATA LUCY … LEAO | 1,78% |
| `000056310801224` | RENATA LUCY … LEAO | 1,8% |
| `000041446801282` | Renata Lucy … Leaonilton | 5,5% |

Você diz "2 ativas, 2 em troca". **Eu não consigo separar as duas metades** —
`troca_titularidade` vem NULL nas quatro (§4). E a quarta linha é justamente a do
conflito da §3. Marque quais duas são as em troca e eu as excluo do lote.

---

## 6. As 41 que eu enxergo, marcadas — bata contra as suas 44

`SIM` = está nas 39 espelhadas hoje. `!` = os dois eixos de vendedor **divergem**
nessa linha (13 delas, e é o assunto original da rodada 5).

| UC | cliente | usina | rateio | `vendedor_origem` | `responsavel_atual` | | nas 39 |
|---|---|:--:|--:|---|---|:-:|:--:|
| `000000013290060` | YAGO CANDIDO MACHADO | 0002 | 5.0% | **Renata** | Renata |  SIM |
| `000000014813865` | GABRIELLA VIEIRA DORNELAS DE MELO RODR | 0001 | 3.2% | **Renata** | Renata |  SIM |
| `000000100076075` | CARLA GONZAGA DE MORAIS SILVA - PANIFI | 0002 | 9.0% | **Renata** | Renata |  SIM |
| `000006990101222` | Hermani Soares de Araujo | 04 | 5.0% | **Out Sales** | Out Sales |  SIM |
| `000009997201253` | OSVALDO ESTEVAM MARCELINO | 0001 | 4.6% | **Out Sales** | Renata |! SIM |
| `000010038486340` | GABRIELLA VIEIRA DORNELAS DE MELO RODR | 0001 | 3.2% | **Renata** | Renata |  SIM |
| `000018428801244` | LUCAS SOUTO MELO DE CARVALHO | 0001 | 9.5% | **Renata** | Renata |  SIM |
| `000030868101204` | RAMON DA SILVA ROCHA | 0001 | 3.7% | **Renata** | Renata |  SIM |
| `000036571501203` | Magda de Souza Oliveira Lima | 0002 | 2.3% | **Out Sales** | Out Sales |  SIM |
| `000039416101210` | Hermani Soares de Araujo | 04 | 4.0% | **Out Sales** | Out Sales |  SIM |
| `000041446801282` | Renata Lucy Nogueira Drumond Teles Lea | 0001 | 5.5% | **Renata** | Renata |  SIM |
| `000047571701292` | PERPETUA CARNEIRO DA COSTA | 0002 | 5.5% | **Renata** | Renata |  SIM |
| `000055483901286` | EDIMAR - FERRAGISTA SOL NASCENTE | 0002 | 5.0% | **Out Sales** | Renata |! SIM |
| `000055953601208` | RENATA LUCY NOGUEIRA DRUMOND TELES LEA | 0001 | 1.78% | **Renata** | Renata |  SIM |
| `000056310801224` | RENATA LUCY NOGUEIRA DRUMOND TELES LEA | 0001 | 1.8% | **Renata** | Renata |  SIM |
| `000059018301203` | ODILON BATISTA PINTO | 0002 | 3.5% | **Out Sales** | Renata |! SIM |
| `000059133001226` | THAIS EVARISTO SOUZA | 0001 | 4.6% | **Renata** | Renata |  SIM |
| `000091272101239` | ATAIDE DE MELO OLIVEIRA - DANIELA/LOUR | 0002 | 14.0% | **Out Sales** | Renata |! SIM |
| `000091584701207` | ATAIDE DE MELO OLIVEIRA - LOURIVAL | 0001 | 12.0% | **Renata** | Renata |  SIM |
| `000091670201219` | PAULO DE OLIVEIRA PEREIRA - CARTEIRA L | 0002 | 3.5% | **Renata** | Renata |  SIM |
| `000136464401264` | Marli das Graças Leite | 04 | 3.0% | **Out Sales** | Kallina Tandara |! SIM |
| `000240664901209` | THIAGO GONCALVES TAQUARY | 0002 | 6.0% | **Renata** | Renata |  SIM |
| `000241968901278` | Leandro Vieira de Sousa | 04 | 9.0% | **Renata** | Out Sales |! SIM |
| `000249057801299` | RENATA FERREIRA ESTEVAM | 0001 | 2.8% | **Renata** | Renata |  SIM |
| `000276862801233` | RENATA FERREIRA ESTEVAM | 0001 | 1.8% | **Renata** | Renata |  SIM |
| `000277455301256` | CARLOS GABRIEL SANTOS ALVES | 0001 | 2.6% | **Out Sales** | Renata |! SIM |
| `000288026201278` | CELIA REGINA DE JESUS/MINEIRO | 0001 | 5.5% | **Renata** | Renata |  SIM |
| `000295713501257` | Marlon Estevam de Sousa | 04 | 3.0% | **Renata** | Renata |  NAO |
| `000300815901203` | JONATHAN ESTEVAM DE SOUZA | 0001 | 2.8% | **Out Sales** | Renata |! SIM |
| `000307301401201` | FERNANDO ALBINO - CARTEIRA LOURIVAL | 0001 | 5.5% | **Out Sales** | Renata |! NAO |
| `000322429201206` | LUDMILLA MARQUES DE SOUZA - LOURIVAL | 0002 | 5.5% | **Out Sales** | Renata |! SIM |
| `000331083701240` | CARLA GONZAGA DE MORAIS SILVA - PANIFI | 0002 | 25.0% | **Renata** | Renata |  SIM |
| `000334999901223` | FABRICIO - CARTEIRA LOURIVAL | 0001 | 2.3% | **Renata** | Renata |  SIM |
| `000361204101264` | GEOVANNA KARLA RODRIGUES DE MOURA - LO | 0002 | 3.5% | **Renata** | Renata |  SIM |
| `000381032001295` | Alice Ribeiro Franca  | 0002 | 1.4% | **Out Sales** | Out Sales |  SIM |
| `000389112301217` | NI3- NEGOCIOS IMOBILIARIOS INTELIGENTE | 0001 | 1.8% | **Out Sales** | Renata |! SIM |
| `000389331401209` | NII3- NEGOCIOS IMOBILIARIOS INTELIGENT | 0001 | 1.8% | **Renata** | Renata |  SIM |
| `000406456101252` | RHENAN HENRIQUE DAMASIO NASCIMENTO | 0001 | 4.6% | **Out Sales** | Out Sales |  SIM |
| `000407359701237` | ATAIDE DE MELO OLIVEIRA - DANIELA/LOUR | 0001 | 18.4% | **Out Sales** | Renata |! SIM |
| `000417156401233` | ULISSES JOSE BARBOSA RAMOS | 0003 | 100.0% | **Renata** | Renata |  SIM |
| `000427090701294` | THIAGO GONCALVES TAQUARY | 0002 | 2.0% | **Out Sales** | Renata |! SIM |

**Resumo da contagem:** 41 linhas · **39** espelhadas · **2** fora (§2) ·
**13** com os dois eixos divergindo.

---

## 7. O que continua valendo da rodada 5

A pergunta original **não foi respondida** e continua sendo a que trava a
digitação: **qual das duas colunas responde *"quem vendeu este cliente"***?

Os dois eixos divergem em **13 das 41 UCs**, que somam **6.855,6 kWh/mês dos
29.896,2** da carteira — **23%**. E `Kallina Tandara` aparece em
`responsavel_atual` de uma UC e em `vendedor_origem` de nenhuma.

Do nosso lado nada foi digitado: `contrato` e `originador` seguem em **0**.
