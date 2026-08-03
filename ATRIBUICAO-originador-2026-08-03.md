# ATRIBUIÇÃO DE ORIGINADOR — a carteira de 41 linhas, pelo eixo que o CRM declarou canônico

| Campo | Valor |
|---|---|
| **Eixo** | **o crédito congelado no momento do ganho** — `financeiro.vendas_creditadas.vendedor`, com `vigente = true`. Regra da G3, textual na migration de 01/08: *"a venda é de quem é o responsável do lead quando é dado ganho nos funis de vendas"* |
| **Substitui** | **`ATRIBUICAO-originador-2026-07-30.md`**, que usava `vendedor_origem` e está **errado em 12 das 41 UCs** |
| **Por que este documento existe** | o eixo deixou de ser escolha nossa. A `Q-EIXO-FUNCIONARIO-01` foi devolvida pelo dono ao dev do CRM, e o dev respondeu: **nenhuma das duas colunas que medíamos responde "quem vendeu"** |
| **Medido em** | 03/08/2026, pela role `financeiro_ro` (só as views — regra 4), contra `financeiro.vendas_creditadas`, `financeiro.rateio_clientes`, `financeiro.rateio_creditos` e `financeiro.rateio_situacao` |
| **Estado** | **nada foi escrito.** `originador` = 0 linhas, `contrato` = 0 linhas. Este documento é conferência, não execução |
| **Questões** | `Q-EIXO-FUNCIONARIO-01` (fecha) · `Q-ORIGVEND-01` (muda) · **`Q-PARCERIA-01`** (nova, 🔴) · **`Q-COMISPCT-01`** (nova, 🟡) |

---

## 1. A mudança que este documento faz, em uma tabela

O mapa de 30/07 é o que a operação usaria hoje. Ele paga por `vendedor_origem`.

| eixo | Renata | Out Sales | Kallina Tandara | sem origem |
|---|--:|--:|--:|--:|
| `vendedor_origem` — **mapa de 30/07** | 24 UCs · 22.173,8 kWh · **74,2%** | 16 UCs · 7.225,6 kWh · **24,2%** | — | 1 UC · 496,8 kWh |
| **crédito congelado — este mapa** | **33 UCs · 28.529,4 kWh · 95,4%** | **7 UCs · 1.366,8 kWh · 4,6%** | **1 UC · 0,0 kWh** | — |

**O Out Sales sai de 24,2% para 4,6% da carteira.** São **5.858,8 kWh/mês** que trocam de dono — 19,6% do total de 29.896,2 kWh/mês.

> **Isto não é uma correção de arredondamento nem uma diferença de leitura.** Digitar os contratos pelo mapa de 30/07 pagaria comissão à pessoa errada em 12 UCs, **sem erro e sem log** — e a **R20-b congela `originador_tipo_no_fechamento` no `rascunhar`**, sem caminho de edição. O conserto seria `encerrar` + `renovar`, que abre linha nova, zera `faturas_cheias_pagas` e deixa na trilha uma renovação que não houve comercialmente.

---

## 2. Por que `vendedor_origem` estava errado, e a prova é da própria G3

`vendedor_origem` **não é o vendedor**. É o palpite do *round-robin* no momento em que o lead foi criado — e a G3 já declarou esse palpite errado por escrito. Em **30/06/2026 18:30:28** rodou uma correção em 15 leads com esta descrição:

> *"Correção: lead criado pela Renata devolvido a ela (havia sido atribuído ao OutSales pelo round-robin na criação)."*

A correção arrumou o **responsável** e **não** o `vendedor_origem` — o campo estava travado por gatilho e só ganhou caminho de escrita em 29/07. Ele guarda até hoje o palpite que a G3 corrigiu.

Dois casos dizem o tamanho do problema sozinhos: `G3-0195` teve a Renata como dona do registro por **10 segundos**, e `G3-0386` teve o Out Sales por **14 segundos**, antes do round-robin ser desfeito. Pelo eixo velho, esses 10 e 14 segundos pagavam a venda.

**A terceira coluna que já medimos, `responsavel_atual`, também não serve** — é o dono da negociação *hoje*, e muda a cada transferência. Ela bate com o crédito em 12 das 13 UCs em que os dois eixos do CRM divergem, e erra justamente a que a G3 adjudicou à mão (`000055483901286`).

---

## 3. As 12 que mudam de dono

Ordenadas por kWh/mês, que é o que dimensiona o erro.

| UC | cliente | % | kWh/mês | mapa 30/07 | **CRÉDITO — usar este** |
|---|---|--:|--:|---|---|
| `000407359701237` | ATAIDE DE MELO OLIVEIRA - DANIELA/LOURIVAL | 18,4 | 1.987,2 | Out Sales | **Renata** |
| `000091272101239` | ATAIDE DE MELO OLIVEIRA - DANIELA/LOURIVAL | 14,0 | 1.400,0 | Out Sales | **Renata** |
| `000307301401201` | FERNANDO ALBINO - CARTEIRA LOURIVAL | 5,5 | 594,0 | Out Sales | **Renata** |
| `000322429201206` | LUDMILLA MARQUES DE SOUZA - LOURIVAL | 5,5 | 550,0 | Out Sales | **Renata** |
| `000009997201253` | OSVALDO ESTEVAM MARCELINO | 4,6 | 496,8 | **(?)** | **Renata** |
| `000059018301203` | ODILON BATISTA PINTO | 3,5 | 350,0 | Out Sales | **Renata** |
| `000300815901203` | JONATHAN ESTEVAM DE SOUZA | 2,8 | 302,4 | Out Sales | **Renata** |
| `000277455301256` | CARLOS GABRIEL SANTOS ALVES | 2,6 | 280,8 | Out Sales | **Renata** |
| `000427090701294` | THIAGO GONCALVES TAQUARY | 2,0 | 200,0 | Out Sales | **Renata** |
| `000389112301217` | NI3- NEGOCIOS IMOBILIARIOS INTELIGENTES EIRELI | 1,8 | 194,4 | Out Sales | **Renata** |
| `000136464401264` | Marli das Graças Leite | 3,0 | 0,0 | Out Sales | **Kallina Tandara** |
| `000241968901278` | Leandro Vieira de Sousa | 9,0 | 0,0 | Renata | **Out Sales** |

**A `000009997201253` deixou de ser pergunta.** Ela era a única UC que nenhum caminho de leitura entregava — o lead `G3-0154` está arquivado, e nem a view nem o conector de análise devolviam o `vendedor_origem` dela. O crédito congelado a entrega: **Renata**. A pergunta aberta desde 29/07 fecha por medição.

---

## 4. O mapa

⇄ marca as que mudaram em relação ao mapa de 30/07.

### Renata — 33 UCs · 28.529,4 kWh/mês · 95,4%

| UC | cliente | % | kWh/mês | lead | ganho em | origem | etapa no Rateio |
|---|---|--:|--:|---|---|:--:|---|
| `000417156401233` | ULISSES JOSE BARBOSA RAMOS | 100,0 | 10.000,0 | G3-0274 | 2026-07-10 | lead | Desconto Ativo |
| `000331083701240` | CARLA GONZAGA DE MORAIS SILVA - PANIFICADORA PLAZZA | 25,0 | 2.500,0 | G3-0221 | 2026-07-07 | lead | Troca de Titularidade |
| `000407359701237` ⇄ | ATAIDE DE MELO OLIVEIRA - DANIELA/LOURIVAL | 18,4 | 1.987,2 | G3-0078 | 2026-06-17 | lead | Desconto Ativo |
| `000091272101239` ⇄ | ATAIDE DE MELO OLIVEIRA - DANIELA/LOURIVAL | 14,0 | 1.400,0 | G3-0138 | 2026-07-12 | lead | Desconto Ativo |
| `000091584701207` | ATAIDE DE MELO OLIVEIRA - LOURIVAL | 12,0 | 1.296,0 | G3-0299 | 2026-07-12 | lead | Desconto Ativo |
| `000018428801244` | LUCAS SOUTO MELO DE CARVALHO | 9,5 | 1.026,0 | G3-0019 | 2026-06-05 | lead | Desconto Ativo |
| `000000100076075` | CARLA GONZAGA DE MORAIS SILVA - PANIFICADORA PLAZZA | 9,0 | 900,0 | G3-0229 | 2026-07-12 | lead | Troca de Titularidade |
| `000240664901209` | THIAGO GONCALVES TAQUARY | 6,0 | 600,0 | G3-0295 | 2026-07-12 | lead | Desconto Ativo |
| `000041446801282` | Renata Lucy Nogueira Drumond Teles Leaonilton | 5,5 | 594,0 | G3-0311 | 2026-07-12 | lead | Troca de Titularidade |
| `000288026201278` | CELIA REGINA DE JESUS/MINEIRO | 5,5 | 594,0 | G3-0055 | 2026-06-11 | lead | Troca de Titularidade |
| `000307301401201` ⇄ | FERNANDO ALBINO - CARTEIRA LOURIVAL | 5,5 | 594,0 | G3-0080 | 2026-06-16 | lead | Desconto Ativo |
| `000047571701292` | PERPETUA CARNEIRO DA COSTA | 5,5 | 550,0 | G3-0092 | 2026-06-19 | lead | Desconto Ativo |
| `000322429201206` ⇄ | LUDMILLA MARQUES DE SOUZA - LOURIVAL | 5,5 | 550,0 | G3-0110 | 2026-07-03 | lead | Troca de Titularidade |
| `000000013290060` | YAGO CANDIDO MACHADO | 5,0 | 500,0 | G3-0023 | 2026-06-24 | lead | Desconto Ativo |
| `000009997201253` ⇄ | OSVALDO ESTEVAM MARCELINO | 4,6 | 496,8 | G3-0024 | 2026-06-05 | lead | Desconto Ativo |
| `000059133001226` | THAIS EVARISTO SOUZA | 4,6 | 496,8 | G3-0021 | 2026-06-05 | lead | Desconto Ativo |
| `000030868101204` | RAMON DA SILVA ROCHA | 3,7 | 399,6 | G3-0025 | 2026-06-05 | lead | Desconto Ativo |
| `000059018301203` ⇄ | ODILON BATISTA PINTO | 3,5 | 350,0 | G3-0109 | 2026-07-01 | lead | Troca de Titularidade |
| `000091670201219` | PAULO DE OLIVEIRA PEREIRA - CARTEIRA LOURIVAL | 3,5 | 350,0 | G3-0083 | 2026-06-24 | lead | Desconto Ativo |
| `000361204101264` | GEOVANNA KARLA RODRIGUES DE MOURA - LOURIVAL | 3,5 | 350,0 | G3-0081 | 2026-06-19 | lead | Desconto Ativo |
| `000000014813865` | GABRIELLA VIEIRA DORNELAS DE MELO RODRIGUES | 3,2 | 345,6 | G3-0087 | 2026-06-17 | lead | Desconto Ativo |
| `000010038486340` | GABRIELLA VIEIRA DORNELAS DE MELO RODRIGUES | 3,2 | 345,6 | G3-0313 | 2026-07-12 | lead | Desconto Ativo |
| `000249057801299` | RENATA FERREIRA ESTEVAM | 2,8 | 302,4 | G3-0278 | 2026-07-10 | lead | Desconto Ativo |
| `000300815901203` ⇄ | JONATHAN ESTEVAM DE SOUZA | 2,8 | 302,4 | G3-0086 | 2026-06-17 | lead | Desconto Ativo |
| `000277455301256` ⇄ | CARLOS GABRIEL SANTOS ALVES | 2,6 | 280,8 | G3-0018 | 2026-06-10 | lead | Desconto Ativo |
| `000334999901223` | FABRICIO - CARTEIRA LOURIVAL | 2,3 | 248,4 | G3-0079 | 2026-06-16 | lead | Desconto Ativo |
| `000427090701294` ⇄ | THIAGO GONCALVES TAQUARY | 2,0 | 200,0 | G3-0091 | 2026-06-19 | lead | Desconto Ativo |
| `000056310801224` | RENATA LUCY NOGUEIRA DRUMOND TELES LEAO/MINEIRO | 1,8 | 194,4 | G3-0307 | 2026-07-12 | lead | Desconto Ativo |
| `000276862801233` | RENATA FERREIRA ESTEVAM | 1,8 | 194,4 | G3-0279 | 2026-07-10 | lead | Desconto Ativo |
| `000389112301217` ⇄ | NI3- NEGOCIOS IMOBILIARIOS INTELIGENTES EIRELI | 1,8 | 194,4 | G3-0084 | 2026-06-17 | lead | Desconto Ativo |
| `000389331401209` | NII3- NEGOCIOS IMOBILIARIOS INTELIGENTES EIRELI | 1,8 | 194,4 | G3-0306 | 2026-07-12 | lead | Desconto Ativo |
| `000055953601208` | RENATA LUCY NOGUEIRA DRUMOND TELES LEAO/MINEIRO | 1,78 | 192,2 | G3-0309 | 2026-07-12 | lead | Desconto Ativo |
| `000295713501257` | Marlon Estevam de Sousa | 3,0 | 0,0 | G3-0409 | 2026-07-28 | lead | Rateio Concluído |

### Out Sales — 7 UCs · 1.366,8 kWh/mês · 4,6%

| UC | cliente | % | kWh/mês | lead | ganho em | origem | parceiro | etapa no Rateio |
|---|---|--:|--:|---|---|:--:|---|---|
| `000055483901286` | EDIMAR - FERRAGISTA SOL NASCENTE | 5,0 | 500,0 | G3-0114 | 2026-07-03 | **posicao** | — | Troca de Titularidade |
| `000406456101252` | RHENAN HENRIQUE DAMASIO NASCIMENTO | 4,6 | 496,8 | G3-0020 | 2026-06-05 | lead | — | Desconto Ativo |
| `000036571501203` | Magda de Souza Oliveira Lima | 2,3 | 230,0 | G3-0102 | 2026-07-03 | lead | — | Desconto Ativo |
| `000381032001295` | Alice Ribeiro Franca | 1,4 | 140,0 | G3-0159 | 2026-07-03 | lead | — | Desconto Ativo |
| `000006990101222` | Hermani Soares de Araujo | 5,0 | 0,0 | G3-0377 | 2026-07-24 | lead | **EDIMAR - FERRAGISTA SOL NASCENTE** | Rateio Concluído |
| `000039416101210` | Hermani Soares de Araujo | 4,0 | 0,0 | G3-0272 | 2026-07-24 | lead | **EDIMAR - FERRAGISTA SOL NASCENTE** | Rateio Concluído |
| `000241968901278` ⇄ | Leandro Vieira de Sousa | 9,0 | 0,0 | G3-0195 | 2026-07-13 | lead | **EDIMAR - FERRAGISTA SOL NASCENTE** | Rateio Concluído |

**`000055483901286` é a única da carteira com `responsavel_origem = 'posicao'`** — o crédito vem do responsável do *card*, não do lead. A G3 adjudicou essa venda ao Out Sales em 30/07: ele escreveu a ficha à mão em 03/07, conduziu a venda e registrou o próprio telefone; o card ficou "Renata" por um carimbo em lote de 13/07. É a única UC em que `responsavel_atual` e o crédito discordam.

### Kallina Tandara — 1 UC · 0,0 kWh/mês

| UC | cliente | % | kWh/mês | lead | ganho em | origem | etapa no Rateio |
|---|---|--:|--:|---|---|:--:|---|
| `000136464401264` ⇄ | Marli das Graças Leite | 3,0 | 0,0 | G3-0386 | 2026-07-21 | lead | Rateio Concluído |

**A lista de originadores volta a ter três nomes.** Kallina Tandara é usuária do CRM desde 30/06/2026 (`vendas01@g3solar.com.br`) e conduziu essa venda inteira — o round-robin deu o lead ao Out Sales às 12:37:43 e ela assumiu 14 segundos depois; ligação, fatura, análise de crédito, simulação, contrato assinado e card em Negócios Ganhos são todos dela, em 20–21/07.

---

## 5. Duas coisas que este eixo trouxe junto, e as duas movem dinheiro

### 5.1 🔴 `Q-PARCERIA-01` — o crédito tem **dois** nomes, e o nosso contrato tem **um**

Três UCs vêm com vendedor **e** parceiro ao mesmo tempo:

| UC | cliente | % | vendedor creditado | parceiro | `parceria_tipo` | `comissao_pct` |
|---|---|--:|---|---|---|--:|
| `000241968901278` | Leandro Vieira de Sousa | 9,0 | Out Sales | EDIMAR - FERRAGISTA SOL NASCENTE | `indicador` | 25,00 |
| `000006990101222` | Hermani Soares de Araujo | 5,0 | Out Sales | EDIMAR - FERRAGISTA SOL NASCENTE | `indicador` | 25,00 |
| `000039416101210` | Hermani Soares de Araujo | 4,0 | Out Sales | EDIMAR - FERRAGISTA SOL NASCENTE | `indicador` | 25,00 |

`contrato` tem **um** `originador_id` e **um** `originador_tipo_no_fechamento`. Não há onde guardar os dois.

**E a escolha não é neutra**, porque as duas leituras caem em regras de comissão diferentes — medido em `regra_comissao`, 10 linhas em produção:

| se o originador for… | 1ª parcela | 2ª parcela |
|---|--:|--:|
| Out Sales, como `terceirizado` | 25% | **25%** |
| Edimar, como `parceiro_indicador` | 25% | **0%** |

A 1ª parcela é a mesma; **a 2ª é 25% contra zero**. Não custa nada hoje — as três estão na usina `407706301217`, que não tem geração cadastrada e portanto rende 0 kWh — mas **a R20-b congela o tipo no `rascunhar`**, então a decisão tem de ser tomada *antes* de digitar, não depois.

Isto **muda uma medição anterior**: a `Q-ORIGVEND-01` registrou que a `SPEC-002` R16 (atribuição vem de `leads.partner_id`) *"não colide hoje"*, porque nenhuma das linhas do rateio tinha `partner_id`. **Agora três têm.** Os dois eixos colidem pela primeira vez.

### 5.2 🟡 `Q-COMISPCT-01` — o CRM passou a ter percentual de comissão, em 3 de 41

`vendas_creditadas.comissao_pct` está **preenchido em 3 linhas e nulo em 38**. As três são exatamente as recreditadas do Edimar, com carimbo `recredito_parceria`.

Hoje os dois lados concordam — CRM diz 25,00 para `indicador`, e a nossa `regra_comissao` diz 25,00 para `parceiro_indicador` na 1ª parcela. **Concordar hoje não é o mesmo que ter uma fonte só.** O CRM congela o número *no dia do ganho*; nós resolvemos por vigência (`EXCLUDE USING gist`, sem sobreposição). No dia em que a G3 mudar a tabela dela, os dois divergem em silêncio, e o split usa o nosso.

Qual manda não está decidido, e não é decisão de implementador (regra 10).

---

## 6. O que a etapa do funil Rateio diz, e ela é nova para nós

`financeiro.rateio_situacao` não existia quando o mapa de 30/07 foi feito. Ela dá a situação que `rateio_clientes` nunca teve — e `troca_titularidade`, que vem **NULL em 41 de 41**, continua não servindo para nada.

| etapa | situação | UCs | kWh/mês |
|---|---|--:|--:|
| Desconto Ativo | `ativado` | **29** | 23.908,2 |
| Troca de Titularidade | `nao_ativado` | **7** | 5.988,0 |
| Rateio Concluído | `nao_ativado` | **5** | 0,0 |

**12 das 41 UCs não estão ativadas**, e elas carregam 5.988,0 kWh/mês. As 5 de "Rateio Concluído" são todas da usina `407706301217`, que **não tem geração cadastrada** — o percentual existe, o crédito em kWh é zero.

---

## 7. A ordem de uso

1. **Não digitar contrato pelo `ATRIBUICAO-originador-2026-07-30.md`.** Ele está errado em 12 UCs;
2. decidir a **`Q-PARCERIA-01`** — três UCs não têm originador definido até lá;
3. cadastrar os **três** originadores. Falta o insumo humano de sempre, e ele não está em view nenhuma: **CPF/CNPJ**, natureza `pf`/`pj` e confirmação do `tipo`. `Out Sales` é o único com cara de PJ, e isso é inferência, não medição;
4. destravar a `000041446801282` (`npm run destravar-uc`) e rodar o ciclo — ver a `Q-UCMUDOU-01`;
5. só então digitar.

**A consulta que reproduz este mapa**, para reconferir imediatamente antes de digitar — role `financeiro_ro`, só views:

```sql
select v.vendedor, r.uc, s.cliente, r.percentual_rateio,
       coalesce(cr.creditos_kwh_mes,0) kwh, v.parceiro_nome, v.parceria_tipo,
       v.comissao_pct, v.ganho_em::date, s.etapa_rateio
  from financeiro.rateio_clientes r
  left join financeiro.vendas_creditadas v on v.uc = r.uc and v.vigente
  left join financeiro.rateio_creditos  cr on cr.contrato_id = r.contrato_id
  left join financeiro.rateio_situacao  s  on s.contrato_id  = r.contrato_id
 order by v.vendedor, coalesce(cr.creditos_kwh_mes,0) desc;
```

> **Este mapa ainda é uma foto, e o motivo mudou.** Antes era porque a atribuição só existia em cards que as views não alcançavam. Agora ela está em view, é legível em 41 de 41, e **o conector não a lê** — `VIEWS_DO_CRM` em `src/crm/conexao.ts` lista oito views, e estas duas são a nona e a décima. Enquanto o conector não as ler, toda digitação sai de documento, e documento envelhece. É a lição da `Q-CRMCODIGO-01`, e desta vez o conserto é nosso.
