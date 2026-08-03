# Retorno — CRM, rodada 5 (03/08/2026)

> ## Esta rodada tem UMA pergunta, e ela é curta.
>
> **Alguma coisa mudou no CRM sobre "quem é o responsável / quem vendeu" — e eu
> preciso saber o quê, para não pagar comissão à pessoa errada.**
>
> O dono do financeiro me disse: *"o CRM foi alterado nesse sentido"*. Eu medi as
> oito views hoje e **vi o efeito**, mas não sei a causa nem o desenho de vocês.
>
> **Não há pedido de correção nesta rodada.** Se a resposta for *"mudou X, e o
> lugar certo de ler continua sendo a coluna Y"*, isso fecha tudo. Há uma
> checklist no fim, e marcar uma linha por resposta já é resposta completa.

Contexto de uma frase: o financeiro vai **digitar 39 contratos** nos próximos
dias, e cada contrato **congela** quem recebe comissão no momento em que é
criado — não existe edição depois. Se eu ler o eixo errado agora, o conserto é
encerrar e recriar contrato, com trilha de uma renovação que não houve.

Tudo abaixo saiu de leitura nas views `financeiro.*`, pela role `financeiro_ro`,
em **03/08/2026**. Reproduzo o SQL para você conferir sem depender de eu ter
medido direito.

---

## 1. O que eu vejo mudou desde 30/07, e é para melhor

```sql
SELECT count(*) AS ucs_do_rateio,
       count(g.codigo) AS casam_com_um_ganho
  FROM financeiro.rateio_clientes r
  LEFT JOIN financeiro.vendas_ganhas g ON g.codigo = r.lead_codigo;
```

| medição | 29/07 | 30/07 | **03/08** |
|---|--:|--:|--:|
| UCs do rateio que casam com um ganho legível | 28 de 41 | 40 de 41 | **41 de 41** |
| linhas em `financeiro.vendas_ganhas` | 80 | 51 | **51** |
| linhas em `financeiro.lead_merges` | 3 | 79 | **81** |

**As 41 ficaram legíveis.** Em 29/07 treze atribuições existiam no CRM e eram
invisíveis às views (card em etapa `normal`, e a view expõe só `won`); hoje não
há nenhuma. Isso é bom para nós e é o oposto de um problema — só quero confirmar
que foi **mudança intencional de vocês**, e não efeito colateral dos merges.

**Pergunta 1:** o que mudou entre 30/07 e hoje que fez as 41 ficarem legíveis?
Foi movimentação de cards, mudança na view, mudança de `stage_type`, ou os
merges?

## 2. Os dois eixos discordam em 13 das 41 UCs, e é aqui que muda dinheiro

```sql
SELECT r.uc, r.cliente, r.percentual_rateio,
       g.vendedor_origem, g.responsavel_atual
  FROM financeiro.rateio_clientes r
  JOIN financeiro.vendas_ganhas g ON g.codigo = r.lead_codigo
 WHERE g.vendedor_origem IS DISTINCT FROM g.responsavel_atual
 ORDER BY r.percentual_rateio DESC;
```

| UC | cliente | rateio | `vendedor_origem` | `responsavel_atual` |
|---|---|--:|---|---|
| `000407359701237` | ATAIDE DE MELO OLIVEIRA - DANI… | 18,4% | Out Sales | **Renata** |
| `000091272101239` | ATAIDE DE MELO OLIVEIRA - DANI… | 14,0% | Out Sales | **Renata** |
| `000241968901278` | Leandro Vieira de Sousa | 9,0% | Renata | **Out Sales** |
| `000322429201206` | LUDMILLA MARQUES DE SOUZA - LO… | 5,5% | Out Sales | **Renata** |
| `000307301401201` | FERNANDO ALBINO - CARTEIRA LOU… | 5,5% | Out Sales | **Renata** |
| `000055483901286` | EDIMAR - FERRAGISTA SOL NASCEN… | 5,0% | Out Sales | **Renata** |
| `000009997201253` | OSVALDO ESTEVAM MARCELINO | 4,6% | Out Sales | **Renata** |
| `000059018301203` | ODILON BATISTA PINTO | 3,5% | Out Sales | **Renata** |
| `000136464401264` | Marli das Graças Leite | 3,0% | Out Sales | **Kallina Tandara** |
| `000300815901203` | JONATHAN ESTEVAM DE SOUZA | 2,8% | Out Sales | **Renata** |
| `000277455301256` | CARLOS GABRIEL SANTOS ALVES | 2,6% | Out Sales | **Renata** |
| `000427090701294` | THIAGO GONCALVES TAQUARY | 2,0% | Out Sales | **Renata** |
| `000389112301217` | NI3- NEGOCIOS IMOBILIARIOS INT… | 1,8% | Out Sales | **Renata** |

**São 6.855,6 kWh/mês dos 29.896,2 da carteira — 23%.** A escolha do eixo move
essa fatia inteira de uma pessoa para outra.

Os totais por eixo:

| eixo | Renata | Out Sales | Kallina Tandara |
|---|--:|--:|--:|
| `vendedor_origem` | 24 UCs | 17 UCs | — |
| `responsavel_atual` | **34 UCs** | **6 UCs** | **1 UC** |

**Pergunta 2:** para vocês, qual das duas colunas responde *"quem vendeu este
cliente"*? A outra responde o quê — quem cuida do card hoje?

Contexto do meu lado, para você saber por que eu não escolho sozinho: em 29/07 o
dono decidiu usar `vendedor_origem`, e a razão medida foi que nos 15 cards do
funil `Rateio` o `responsavel` era **a mesma pessoa em 15 de 15** — parecia dono
operacional, não vendedor. Se isso mudou, a decisão precisa mudar junto.

## 3. Um nome novo apareceu, e só num dos eixos

`Kallina Tandara` aparece como `responsavel_atual` de **1 UC** e **não aparece**
em `vendedor_origem` de nenhuma. Nas medições de 29 e 30/07 esse nome não existia
em lugar nenhum.

**Pergunta 3:** é pessoa nova na operação? E ela **vendeu** aquele cliente, ou
apenas assumiu o card?

Isso importa porque a lista de originadores do financeiro é cadastro com
CPF/CNPJ obrigatório — cada nome a mais é uma pessoa a mais para cadastrar antes
de qualquer contrato ser digitado.

## 4. Existe algum lugar NOVO onde a atribuição mora?

As oito views que eu leio hoje, com a contagem de colunas de cada uma:

```sql
SELECT table_name, count(*) AS colunas FROM information_schema.columns
 WHERE table_schema = 'financeiro' GROUP BY table_name ORDER BY table_name;
```

`geracao_mensal` (9) · `lead_merges` (6) · `leads_arquivados` (11) ·
`parceiros` (10) · `rateio_clientes` (15) · `rateio_creditos` (7) ·
`usinas` (12) · `vendas_ganhas` (21).

**Pergunta 4:** a alteração criou **coluna, tabela, etapa ou funil novo** que
carregue atribuição de venda?

Isto é o mais importante da rodada, e a razão é uma regra nossa: **o financeiro
lê exclusivamente as views `financeiro.*` e nunca tabela base.** Se a informação
certa passou a morar num lugar que as views não expõem, ela **não existe** do
meu lado — e eu continuaria lendo o dado antigo achando que está completo. Foi
exatamente o que aconteceu em 29/07 com as 13 invisíveis.

Se for o caso, o pedido da próxima rodada seria expor isso numa view. **Não
estou pedindo agora** — primeiro quero saber se existe.

## 5. `merge_leads` é rotina?

```sql
SELECT count(*) FROM financeiro.lead_merges;   -- 81
```

Foram **3** em 29/07, **79** em 30/07 e **81** hoje. O merge troca o
`lead.codigo`, e em 30/07 isso renumerou 39 dos 41 códigos do rateio.

**Do nosso lado está tudo bem, e vale dizer:** o conector casa por
`contrato_id` e `crm_lead_id`, os dois UUID — nenhum merge quebra o espelho.
`lead_codigo` só aparece em mensagem de recusa e nos meus documentos de análise.

**Pergunta 5:** merge é operação **rotineira** ou foi mutirão pontual de
limpeza? A resposta decide se todo documento nosso que cite `lead.codigo` tem
prazo de validade — se for rotina, eu paro de usar `codigo` como chave em
qualquer análise.

---

## Checklist de resposta

Marcar uma opção por linha já é resposta completa.

| # | Pergunta | Resposta |
|:--:|---|---|
| 1 | O que fez as 41 UCs ficarem legíveis entre 30/07 e 03/08? | ( ) movimentação de cards · ( ) mudança na view · ( ) merges · ( ) outro: ______ |
| 2 | Qual coluna responde *"quem vendeu"*? | ( ) `vendedor_origem` · ( ) `responsavel_atual` · ( ) nenhuma das duas: ______ |
| 2b | E a outra responde o quê? | ______ |
| 3 | `Kallina Tandara` **vendeu** a UC `000136464401264`? | ( ) sim, vendeu · ( ) não, só assumiu o card · ( ) não sei |
| 4 | Há coluna/tabela/etapa **nova** com atribuição de venda? | ( ) não · ( ) sim: ______ |
| 4b | Se sim, ela está em alguma view `financeiro.*`? | ( ) sim · ( ) não |
| 5 | `merge_leads` é rotina? | ( ) sim, rotineira · ( ) foi mutirão pontual |

**Obrigado.** As três rodadas anteriores fecharam nove questões nossas, e a
rodada 3 evitou que eu pedisse um `security_invoker` que teria quebrado a
integração de vocês. Continua valendo: o conector **não escreve uma linha** no
CRM, por nenhum caminho.
