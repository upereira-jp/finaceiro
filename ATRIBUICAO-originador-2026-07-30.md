> # ⛔ SUPERADO EM 03/08/2026 — NÃO DIGITE CONTRATO POR ESTE MAPA
>
> **O eixo mudou, e não por preferência: o dev do CRM respondeu que nem `vendedor_origem` nem `responsavel_atual` respondem "quem vendeu".** A resposta canônica é o **crédito congelado no momento do ganho** (`financeiro.vendas_creditadas`), e por ele **este mapa está errado em 12 das 41 UCs — 5.858,8 kWh/mês, 19,6% da carteira**. O Out Sales sai de 24,2% para 4,6%.
>
> **Mapa vigente: `ATRIBUICAO-originador-2026-08-03.md`.**
>
> O corpo abaixo fica **intacto**, como registro datado — é a mesma decisão do `PATCH-citacoes-2026-07-24.md`. O que ele mediu em 30/07 estava certo *para o eixo daquele dia*; o que mudou foi qual eixo vale. As 12 estão listadas na §3 do mapa novo.

# ATRIBUIÇÃO DE ORIGINADOR — a carteira de 41 linhas, remedida em 30/07

| Campo | Valor |
|---|---|
| **Decisão que continua valendo** | *"O originador vai ser o `vendedor_origem` até segunda ordem"* — Vinicius, 29/07/2026 |
| **Por que este documento existe** | **o CRM mudou entre 29/07 22:53Z e 30/07 03:30Z, e o mapa anterior ficou errado em dois lugares que movem dinheiro.** 76 merges de lead foram executados em 30/07 |
| **Medido em** | 30/07/2026, 03:25–03:40Z, pela role `financeiro_ro` (read-only, só as views — regra 4) e pelo conector de análise |
| **Substitui** | `ATRIBUICAO-originador-2026-07-29.md`, que fica no repositório como registro datado |
| **Estado** | **nada foi escrito.** `originador` = 0 linhas, `contrato` = 0 linhas. Este documento é conferência, não execução |
| **Questão** | `Q-CRMCODIGO-01` (nova) e `Q-ORIGVEND-01` no `QUESTOES.md` |

---

## 1. O que mudou, e é o motivo de não usar o mapa de ontem

Três coisas, todas medidas:

### (a) A lista de originadores caiu de três nomes para **dois**

`Jezielly Vieira` tinha 1 UC no mapa de 29/07 (a `G3-0155`, `000406456101252`). Hoje ela tem **zero** — `cards_como_responsavel = 0` e `cards_como_vendedor_origem = 0` no CRM inteiro. A UC dela passou para o **Out Sales**.

A conta do insumo humano muda com isso: eram **três** CPF/CNPJ a pedir, são **dois**.

### (b) Duas atribuições trocaram de dono, e uma delas é grande

| UC | cliente | % | kWh/mês | 29/07 | **30/07** |
|---|---|--:|--:|---|---|
| `000406456101252` | RHENAN HENRIQUE DAMASIO NASCIMENTO | 4.60 | 496,8 | Jezielly Vieira | **Out Sales** |
| `000407359701237` | ATAIDE DE MELO OLIVEIRA — DANIELA/LOURIVAL | 18.40 | 1.987,2 | **Renata** | **Out Sales** |

A segunda vale **1.987,2 kWh/mês** — é a segunda maior linha do Out Sales hoje, e sai da Renata. Cadastrar contrato por aquele mapa pagaria a comissão dela à pessoa errada, sem erro e sem log.

### (c) `lead.codigo` **não é estável**, e isso é o achado estrutural

Dos 7 códigos que eu conferi por amostra do mapa de ontem, **5 não existem mais**: `G3-0139`, `G3-0141`, `G3-0155`, `G3-0301` e `G3-0412`. Sobreviveram `G3-0138` e `G3-0154`. Das 41 linhas do rateio, **39 têm código diferente** do de ontem, com a **mesma UC e o mesmo cliente**.

A causa está medida: `financeiro.lead_merges` registra **76 merges em 30/07** (mais 2 em 29/07 e 1 de backfill em 10/07), origem `merge_leads`. Um merge escolhe um sobrevivente e o código do lead acompanha o sobrevivente.

**O que isso NÃO quebrou, e foi conferido:** a sincronização do financeiro não usa `codigo` como chave. `src/crm/sincronizacao.ts` casa `rateio_clientes` com `rateio_creditos` por **`contrato_id`**, e espelha cliente por **`crm_lead_id`** — os dois UUID. `lead_codigo` aparece só na *mensagem* de uma recusa. Um `npm run ciclo` depois do merge não duplica nem perde nada por causa disto.

**Onde o `codigo` ainda aparece como critério:** o desempate do dedup da R4 (`sincronizacao.ts`, *"empate resolve por `codigo`"*), e ele só decide qual de N posições do **mesmo** `lead_id` vence quando `ganho_em` empata exatamente. Determinístico dentro de uma execução; muda de execução para execução se os códigos mudarem. Não afeta cadastro — está registrado na `Q-CRMCODIGO-01` para não ficar por descobrir.

**A chave estável para operação é a UC.** Este documento é ordenado por ela, e não pelo código do lead.

---

## 2. O ganho: as 12 atribuições invisíveis ficaram legíveis, e as 12 estavam certas

O mapa de 29/07 disse que **12 das 41** atribuições existiam no CRM e eram **invisíveis às 8 views** — os cards estavam em etapa `normal` do funil `Rateio`, e `financeiro.vendas_ganhas` expõe só `won`. Elas foram obtidas pelo conector de análise, que é outro caminho, e o documento era o único portador delas.

**Hoje 40 das 41 são legíveis pela view.** O que mudou não foi o funil — `Rateio` continua com 15 cards em etapa `normal` (10 em `Troca de Titularidade`, 5 em `Rateio Concluído`) e 28 em `Desconto Ativo` (`won`), igual a 29/07. O que mudou foi o **merge**: a linha do rateio agora aponta para um lead sobrevivente que **tem** posição `won`, então o `DISTINCT ON (l.id)` da view a alcança.

**E as 12 foram conferidas uma a uma contra o valor que a view devolve hoje: as 12 batem.**

| UC | cliente | mapa 29/07 (fonte `card`) | view 30/07 | |
|---|---|---|---|:--:|
| `000000100076075` | CARLA GONZAGA DE MORAIS SILVA | Renata | Renata | ✅ |
| `000288026201278` | CELIA REGINA DE JESUS/MINEIRO | Renata | Renata | ✅ |
| `000331083701240` | CARLA GONZAGA DE MORAIS SILVA | Renata | Renata | ✅ |
| `000041446801282` | NILTON RODRIGUES DOS REIS/MINEIRO | Renata | Renata | ✅ |
| `000241968901278` | Leandro Vieira de Sousa | Renata | Renata | ✅ |
| `000295713501257` | Marlon Estevam de Sousa | Renata | Renata | ✅ |
| `000059018301203` | ODILON BATISTA PINTO | Out Sales | Out Sales | ✅ |
| `000322429201206` | LUDMILLA MARQUES DE SOUZA | Out Sales | Out Sales | ✅ |
| `000055483901286` | EDIMAR — FERRAGISTA SOL NASCENTE | Out Sales | Out Sales | ✅ |
| `000136464401264` | Marli das Graças Leite | Out Sales | Out Sales | ✅ |
| `000039416101210` | Hermani Soares de Araujo | Out Sales | Out Sales | ✅ |
| `000006990101222` | Hermani Soares de Araujo | Out Sales | Out Sales | ✅ |

Isto é o mais próximo de verificação independente que a carteira permite: a atribuição foi obtida por um caminho (conector de análise, card em etapa `normal`) e confirmada por outro (view, card `won`), com quatro dias e um merge de 76 leads no meio. **As duas que mudaram eram de fonte `view`, não `card`** — ou seja, não foi o método de ontem que errou; foi o dado que se moveu.

---

## 3. O `tipo`, com um nome a menos

`originador.tipo` é **local** (`SPEC-001` R20 — não é o `vendedor_tipo` do CRM). A semente do CRM, em `tenant_users`, medida hoje:

| Pessoa | `vendedor_tipo` no CRM | papel | `originador_tipo` sugerido | total |
|---|---|---|---|--:|
| Renata | `proprio` | diretoria | `vendedor_g3` | 50% |
| Out Sales | `terceirizado` | terceirizado | `terceirizado` | 50% |

**Os dois tipos totalizam 50% e estão repartidos 25 + 25**, então a escolha entre eles **não altera valor nenhum hoje**; altera só qual linha de `regra_comissao` é lida. A repartição 25+25 do `terceirizado` continua suposição registrada — `Q-COMIS-TERC-01`.

**Isto é semente, não chave.** O `tipo` precisa de confirmação do dono antes do cadastro: ele **congela no contrato** (R20-b) e promover a pessoa depois não reprecifica o que já foi fechado.

**Renata é sócia** e concentra **74,2%** do peso da carteira (§5, contra 80,8% ontem). A pergunta fiscal já tem resposta — `PAUTA` 7, 28/07: a comissão da sócia **é comissão**, despesa dedutível como a dos demais.

---

## 4. O mapa: as 41 linhas do rateio, por UC

`fonte` hoje é quase toda `view` — o financeiro **consegue** ler 40 das 41 pelas 8 views.

### Renata — 24 UCs

| UC | cliente | % | kWh/mês | lead hoje | fonte |
|---|---|--:|--:|---|:--:|
| `000018428801244` | LUCAS SOUTO MELO DE CARVALHO | 9.50 | 1.026,0 | G3-0019 | view |
| `000030868101204` | RAMON DA SILVA ROCHA | 3.70 | 399,6 | G3-0025 | view |
| `000047571701292` | PERPETUA CARNEIRO DA COSTA | 5.50 | 550,0 | G3-0092 | view |
| `000059133001226` | THAIS EVARISTO SOUZA | 4.60 | 496,8 | G3-0021 | view |
| `000000013290060` | YAGO CANDIDO MACHADO | 5.00 | 500,0 | G3-0023 | view |
| `000091670201219` | PAULO DE OLIVEIRA PEREIRA — CARTEIRA LOURIVAL | 3.50 | 350,0 | G3-0083 | view |
| `000334999901223` | FABRICIO — CARTEIRA LOURIVAL | 2.30 | 248,4 | G3-0079 | view |
| `000361204101264` | GEOVANNA KARLA RODRIGUES DE MOURA — LOURIVAL | 3.50 | 350,0 | G3-0081 | view |
| `000000014813865` | GABRIELLA VIEIRA DORNELAS DE MELO RODRIGUES | 3.20 | 345,6 | G3-0087 | view |
| `000010038486340` | GABRIELLA VIEIRA DORNELAS DE MELO RODRIGUES | 3.20 | 345,6 | G3-0313 | view |
| `000288026201278` | CELIA REGINA DE JESUS/MINEIRO | 5.50 | 594,0 | G3-0055 | view |
| `000041446801282` | NILTON RODRIGUES DOS REIS/MINEIRO | 5.50 | 594,0 | G3-0311 | view |
| `000056310801224` | RENATA LUCY NOGUEIRA DRUMOND TELES LEAO/MINEIRO | 1.80 | 194,4 | G3-0307 | view |
| `000055953601208` | RENATA LUCY NOGUEIRA DRUMOND TELES LEAO/MINEIRO | 1.78 | 192,2 | G3-0309 | view |
| `000249057801299` | RENATA FERREIRA ESTEVAM | 2.80 | 302,4 | G3-0278 | view |
| `000276862801233` | RENATA FERREIRA ESTEVAM | 1.80 | 194,4 | G3-0279 | view |
| `000240664901209` | THIAGO GONCALVES TAQUARY | 6.00 | 600,0 | G3-0295 | view |
| `000091584701207` | ATAIDE DE MELO OLIVEIRA — LOURIVAL | 12.00 | 1.296,0 | G3-0299 | view |
| `000389331401209` | NII3 — NEGOCIOS IMOBILIARIOS INTELIGENTES EIRELI | 1.80 | 194,4 | G3-0306 | view |
| `000417156401233` | ULISSES JOSE BARBOSA RAMOS | 100.00 | 10.000,0 | G3-0274 | view |
| `000000100076075` | CARLA GONZAGA DE MORAIS SILVA — PANIFICADORA PLAZZA | 9.00 | 900,0 | G3-0229 | view |
| `000331083701240` | CARLA GONZAGA DE MORAIS SILVA — PANIFICADORA PLAZZA | 25.00 | 2.500,0 | G3-0221 | view |
| `000241968901278` | Leandro Vieira de Sousa | 9.00 | 0,0 | G3-0195 | view |
| `000295713501257` | Marlon Estevam de Sousa | 3.00 | 0,0 | G3-0409 | view |

### Out Sales — 16 UCs

| UC | cliente | % | kWh/mês | lead hoje | fonte | |
|---|---|--:|--:|---|:--:|---|
| `000091272101239` | ATAIDE DE MELO OLIVEIRA — DANIELA/LOURIVAL | 14.00 | 1.400,0 | G3-0138 | view | |
| `000407359701237` | ATAIDE DE MELO OLIVEIRA — DANIELA/LOURIVAL | 18.40 | 1.987,2 | G3-0078 | view | **era Renata** |
| `000406456101252` | RHENAN HENRIQUE DAMASIO NASCIMENTO | 4.60 | 496,8 | G3-0020 | view | **era Jezielly** |
| `000300815901203` | JONATHAN ESTEVAM DE SOUZA | 2.80 | 302,4 | G3-0086 | view | |
| **(UC vazia)** | FERNANDO ALBINO — CARTEIRA LOURIVAL | 5.50 | 594,0 | G3-0080 | view | §6 |
| `000427090701294` | THIAGO GONCALVES TAQUARY | 2.00 | 200,0 | G3-0091 | view | |
| `000389112301217` | NI3 — NEGOCIOS IMOBILIARIOS INTELIGENTES EIRELI | 1.80 | 194,4 | G3-0084 | view | |
| `000277455301256` | CARLOS GABRIEL SANTOS ALVES | 2.60 | 280,8 | G3-0018 | view | |
| `000036571501203` | Magda de Souza Oliveira Lima | 2.30 | 230,0 | G3-0102 | view | |
| `000381032001295` | Alice Ribeiro Franca | 1.40 | 140,0 | G3-0159 | view | |
| `000059018301203` | ODILON BATISTA PINTO | 3.50 | 350,0 | G3-0109 | view | |
| `000322429201206` | LUDMILLA MARQUES DE SOUZA — LOURIVAL | 5.50 | 550,0 | G3-0110 | view | |
| `000055483901286` | EDIMAR — FERRAGISTA SOL NASCENTE | 5.00 | 500,0 | G3-0114 | view | |
| `000136464401264` | Marli das Graças Leite | 3.00 | 0,0 | G3-0386 | view | |
| `000039416101210` | Hermani Soares de Araujo | 4.00 | 0,0 | G3-0272 | view | |
| `000006990101222` | Hermani Soares de Araujo | 5.00 | 0,0 | G3-0377 | view | |

### Sem origem — 1 UC, e ela continua precisando de resposta

| UC | cliente | % | kWh/mês | lead hoje | fonte |
|---|---|--:|--:|---|:--:|
| `000009997201253` | OSVALDO ESTEVAM MARCELINO | 4.60 | 496,8 | G3-0154 | **?** |

O lead está **arquivado** e manteve o código através do merge. Nem a view nem o conector de análise entregam o `vendedor_origem` dele. **Quem originou essa UC é pergunta para a operação** — não há caminho de leitura, quatro dias depois.

---

## 5. O peso, e como ele se moveu

`percentual_rateio` é por usina e não soma 100 no total; o que aproxima dinheiro é o crédito mensal. A comissão incide sobre o **consumo faturado**, então isto é **proxy de peso, não valor**.

| Originador | UCs | crédito kWh/mês | peso | 29/07 |
|---|--:|--:|--:|--:|
| **Renata** | 24 | 22.173,8 | **74,2%** | *25 UCs · 80,8%* |
| **Out Sales** | 16 | 7.225,6 | **24,2%** | *14 UCs · 15,9%* |
| ~~Jezielly Vieira~~ | 0 | 0,0 | — | *1 UC · 1,7%* |
| *sem origem* (`000009997201253`) | 1 | 496,8 | 1,7% | *1,7%* |
| **total** | **41** | **29.896,2** | | *29.896,2* |

**O total não mudou** — 29.896,2 kWh/mês nas duas medições. A carteira é a mesma; o que se moveu foi de quem ela é. O Out Sales ganhou 2.484,0 kWh/mês (+52% do que tinha), e a Renata perdeu 1.987,2.

Cinco linhas têm `creditos_kwh_mes = 0,0` (`000241968901278`, `000136464401264`, `000039416101210`, `000006990101222`, `000295713501257`) — todas na usina `407706301217`, que não tem geração nominal. Isso **subestima** o peso dos dois, e é a mesma classe da `GERACAO-01`: ausência de série não é zero. Não afeta o faturamento, que pela `SPEC-003` R30 é sobre **geração medida**, não sobre esse campo.

---

## 6. Duas linhas do rateio continuam fora das 39 UCs digitáveis

| UC / lead | por quê |
|---|---|
| **(UC vazia)** — `G3-0080` (era `G3-0141`) | a `uc` está **vazia** no CRM, e `unidade_consumidora.numero_uc` não aceita vazio. Recusa em cascata. **Terceiro dia com o número faltando.** Era esta a linha que duplicava `000041446801282` (`UC-DUP-01`); a duplicidade acabou e o número certo não apareceu |
| `000295713501257` — `G3-0409` (era `G3-0412`) | **entrou.** Estava fora das 39 em 29/07; hoje está no rateio e o financeiro tem **39 UCs** e **84 clientes** espelhados. A pergunta de 29/07 (*"qual das duas coisas explica"*) fica sem diagnóstico — o estado mudou antes de eu medir a causa, e isso é registro, não conclusão |

Consequência prática: hoje há **39 UCs digitáveis** contra 41 linhas de rateio, e o mapa cobre as 39.

---

## 7. O que AINDA falta, e é insumo humano — agora para **dois**

O `scripts/cadastrar-originadores.ts` confere o lote inteiro antes de escrever e **aborta tudo** se um dígito verificador não fechar — de propósito: `classificar()` gravaria com `documento_validado = false` e não há R9 para originador.

**Faltam, para os dois:**

1. **CPF ou CNPJ** — `documento` é `NOT NULL`, sem default, e o dígito é conferido. **Não há de onde derivar:** `financeiro.parceiros` tem 9 linhas, **nenhuma com coluna de documento**, e nenhum dos 9 nomes é um dos dois. Nenhuma das 8 views expõe documento de usuário do CRM;
2. **natureza `pf` ou `pj`** — "Out Sales" tem cara de PJ e "Renata" de PF, **mas isso é inferência minha, não medição.** O script recusa `pf` com CNPJ e `pj` com CPF, então o par tem de estar certo;
3. **confirmação do `tipo`** — §3;
4. **quem originou a UC `000009997201253`** — §4.

**E uma pergunta nova, que é do dono e não minha:** a `Jezielly Vieira` deve ser cadastrada como originadora mesmo com **zero** UCs hoje? Cadastrar não custa nada e não paga nada — `originador` sem contrato não entra em split. Não cadastrar é o estado mínimo. **Não escolhi** (regra 10).

### O arquivo, pronto menos o que falta

Copiar para `originadores.json` (fora do git — ver §8) e preencher os `<…>`:

```json
[
  { "nome": "Renata <sobrenome completo, como no documento>",
    "natureza": "pf", "tipo": "vendedor_g3",
    "documento": "<CPF>", "email": null, "telefone": null,
    "crm_partner_id": null, "chave_pix": null, "tipo_chave_pix": null,
    "banco": null, "agencia": null, "conta": null, "tipo_conta": null },

  { "nome": "Out Sales <razao social, se PJ>",
    "natureza": "<pf ou pj>", "tipo": "terceirizado",
    "documento": "<CPF ou CNPJ>", "email": null, "telefone": null,
    "crm_partner_id": null, "chave_pix": null, "tipo_chave_pix": null,
    "banco": null, "agencia": null, "conta": null, "tipo_conta": null }
]
```

```bash
npm run originadores -- --ensaio  --auth-user <uuid> --arquivo originadores.json   # ROLLBACK, confere
npm run originadores -- --valendo --auth-user <uuid> --arquivo originadores.json   # COMMIT
```

---

## 8. Notas de execução

- **`originadores.json` vai conter CPF/CNPJ de pessoa real.** Está no `.gitignore` desde 29/07 — o repositório foi público até 25/07.
- **A `SPEC-002` R16 continua não colidindo, e foi reconferido hoje:** a R16 manda a atribuição vir de `leads.partner_id`. Nos 51 ganhos que a view expõe hoje, o único com `partner_id` é card do funil `Parceiros`, que a R14 já exclui. Os dois eixos seguem sem discordar sobre o dado de hoje.
- **Nada disto está no código, de propósito.** E o motivo ficou **mais forte** com esta medição: um derivador automático rodado em 29/07 teria gravado duas atribuições que hoje estão erradas, e ninguém saberia — não há caminho no sistema que reavalie originador de contrato fechado (R20-b congela, e `contrato` não tem edição). A atribuição é ato de operação sobre uma carteira nomeada, e por isso passa por documento e por gente.
- **O mapa tem prazo.** Ele é uma foto de 30/07 03:40Z de um CRM que se moveu duas vezes em quatro dias. **Reconferir imediatamente antes de digitar os contratos** — a consulta que reproduz esta §4 está na `Q-CRMCODIGO-01`.
