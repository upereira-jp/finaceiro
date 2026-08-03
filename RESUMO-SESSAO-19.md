# RESUMO-SESSAO-19 — 03/08/2026

| Campo | Valor |
|---|---|
| **Foco** | O dev do CRM respondeu a rodada 5. **A pergunta que travava a digitação desde 29/07 foi respondida — e a resposta foi "nenhuma das duas colunas que vocês mediam"** |
| **Método** | Conferir a resposta antes de obedecê-la. **Três afirmações do dev estavam vencidas, e as três para melhor** — inclusive a que dizia que não alcançávamos o dado |
| **Resultado** | 1 questão fechada · 1 rebaixada · **3 abertas** · **mapa de atribuição refeito: 12 das 41 UCs mudam de dono, 19,6% da carteira em kWh** · 1 script novo · 1106 → **1123 verificações** |
| **Não feito** | **Nada foi escrito em produção.** O `--valendo` do destrave e o ciclo estão prontos e não foram executados — é decisão de quando. Nenhum contrato digitado |

> # ESTADO ATUAL — 03/08/2026, fim da sessão 19
>
> | | |
> |---|---|
> | **Banco** | **22 migrations**; a 22 (`contas_a_pagar`) **só em banco de teste**. Produção segue com 21. **Nenhuma migration nesta sessão** |
> | **Suíte** | `EXIT=0`, **1123** linhas `ok`. Delta **17**, contado na fonte (`grep -c "chk('"`) e conferido contra o `npm test`: diferença zero |
> | **Produção** | **inalterada.** Só `SELECT` e dois `--ensaio` com ROLLBACK conferido |
> | **O eixo do originador** | ✅ **decidido, e não por nós** |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **`Q-PARCERIA-01`** — vendedor **e** parceiro na mesma venda, e o contrato guarda um | 🔴 **nova, e trava a digitação** | Vinicius + dev do CRM |
> | **CPF/CNPJ dos originadores** — agora são **três** nomes, não dois | 🔴 | Vinicius + operação |
> | **`--valendo` do destrave + ciclo** | 🔴 **pronto, ensaiado, não executado** | Vinicius |
> | **`Q-VIEWSCRED-01`** — o CRM tem 10 views e o conector conhece 8 | 🔴 **nova** | Vinicius |
> | **Preencher o dia de vencimento das 39 UCs** | 🔴 | Vinicius + operação |
> | `Q-CLIENTEDUP-01` · `Q-PAGADOR-01` · `Q-FATCHEIA-01` · `Q-WEBHOOK-01` · `Q-SICOOB-01` | 🔴 | Vinicius |
> | ~~`Q-EIXO-FUNCIONARIO-01`~~ · ~~`Q-UCMUDOU-01`~~ 🔴→🟡 | ✅ | fechadas/rebaixadas hoje |

---

## 1. A resposta, e por que ela custou 19,6% da carteira

O dono devolveu a pergunta ao dev do CRM em 03/08. O dev respondeu no mesmo dia, e a resposta é curta:

> **Nenhuma das duas colunas responde "quem vendeu".**

Não é `vendedor_origem` (o eixo em vigor desde 29/07) nem `responsavel_atual` (a alternativa que o `RESUMO-SESSAO-3` recomendara). É o **crédito congelado no momento do ganho**, numa tabela criada em 01/08, imutável por gatilho.

**`vendedor_origem` é o palpite do round-robin na criação do lead** — e a G3 já o havia declarado errado por escrito. Em 30/06/2026 18:30:28 rodou uma correção em 15 leads: *"lead criado pela Renata devolvido a ela (havia sido atribuído ao OutSales pelo round-robin na criação)"*. A correção arrumou o **responsável** e não o `vendedor_origem`, que estava travado por gatilho. Ele guarda até hoje o palpite corrigido.

Em dois casos o palpite durou **10 e 14 segundos**.

**O custo, medido:**

| eixo | Renata | Out Sales | Kallina Tandara |
|---|--:|--:|--:|
| `vendedor_origem` — mapa de 30/07 | 24 UCs · **74,2%** | 16 UCs · **24,2%** | — |
| **crédito congelado** | 33 UCs · **95,4%** | 7 UCs · **4,6%** | 1 UC · 0,0% |

**12 das 41 UCs mudam de dono. 5.858,8 kWh/mês — 19,6% da carteira.** Digitar pelo mapa de 30/07 pagaria a pessoa errada, sem erro e sem log, e a R20-b congela no `rascunhar` sem caminho de edição.

Mapa novo: **`ATRIBUICAO-originador-2026-08-03.md`**. O de 30/07 recebeu cabeçalho de SUPERADO, corpo intacto — mesma decisão do `PATCH-citacoes`.

**E uma pergunta de 29/07 fechou de graça:** a `000009997201253` (OSVALDO, lead arquivado) era a única UC que nenhum caminho de leitura entregava. O crédito a entrega: **Renata**.

---

## 2. Três coisas que o dev afirmou e que já não eram verdade

Esta é a parte que justifica medir a resposta em vez de obedecê-la.

### 2.1 *"Não está em view nenhuma"* — está, e nós lemos

O dev respondeu (Q4b) que o crédito não estava exposto e que *"mesmo com o nome, leriam 0 linhas"*. Medido no dia, pela `financeiro_ro`:

| view | linhas |
|---|--:|
| `financeiro.vendas_creditadas` | **48** — 45 vigentes, 3 revogadas |
| `financeiro.rateio_situacao` | **41** |

O schema tem **10 views**, não 8. As duas novas são exatamente o que a Parte 8 da carta prometia como trabalho futuro. **Eles entregaram e a resposta não acompanhou** — e a frase *"vocês não alcançam"* nos manteria digitando por planilha.

**O mecanismo pelo qual a leitura funciona é a regra 3 deste projeto, do outro lado.** A tabela base tem RLS e zero grant, como o dev disse. Mas a RLS das tabelas base é avaliada contra o **dono da view**, não contra quem consulta — e nenhuma das 10 declara `security_invoker` (`pg_class.reloptions` vem `(sem opções)` nas 10). É o mesmo mecanismo que a regra 3 mede como anulador de `FORCE ROW LEVEL SECURITY`. Para nós é seguro — as três conferidas devolvem **1 tenant só** —, e está avisado na resposta.

### 2.2 *"Não digitem as 3 do Edimar até corrigirmos"* — já estava corrigido

As três já tinham sido revogadas e recreditadas, com carimbo `recredito_parceria`, `comissao_pct = 25,00`, o parceiro vinculado e **`ganho_em` preservado**, exatamente como prometido. O `revogado_motivo` nomeia a causa inteira.

### 2.3 A usina `407706301217` — **aqui o errado era eu**

A `RETOMADA` de ontem dizia que ela não estava entre os códigos de `financeiro.usinas`. Está exposta o tempo todo, na coluna **`usina`** de `rateio_clientes`, que é o **apelido** e não o código. Procurei na coluna errada e escrevi a conclusão como se fosse ausência de dado.

---

## 3. 🔴 O que a correção do dev abriu, e ninguém tinha nomeado

**Depois do recrédito, três UCs passaram a ter vendedor E parceiro ao mesmo tempo:** `000241968901278`, `000006990101222` e `000039416101210` — vendedor **Out Sales**, parceiro **EDIMAR - FERRAGISTA SOL NASCENTE**, `parceria_tipo = indicador`.

**`contrato` tem um `originador_id` e um `originador_tipo_no_fechamento`.** Não há onde guardar os dois. E a escolha muda o valor, medido nas 10 linhas de `regra_comissao`:

| se o originador for… | 1ª parcela | 2ª parcela |
|---|--:|--:|
| Out Sales, como `terceirizado` | 25% | **25%** |
| Edimar, como `parceiro_indicador` | 25% | **0%** |

A 1ª empata; **a 2ª é 25% contra zero**. Não custa nada hoje — as três estão na usina sem geração, 0 kWh —, mas a **R20-b congela no `rascunhar`**: é decisão de antes de digitar.

**E isto desmente uma medição nossa.** A `Q-ORIGVEND-01` registrou que a `SPEC-002` R16 *"não colide hoje"* porque **zero** linhas do rateio tinham `partner_id`. **Agora três têm.** Não foi o método que errou — foi o dado que se moveu, que é a mesma classe da `Q-CRMCODIGO-01`.

`Q-PARCERIA-01` 🔴. Junto veio a `Q-COMISPCT-01` 🟡: o CRM passou a ter `comissao_pct` próprio em 3 de 41. Hoje os dois lados concordam em 25,00 — mas o CRM congela no ganho e nós resolvemos por vigência, e **concordar hoje não é ter fonte única**.

---

## 4. `Q-UCMUDOU-01` — a resposta veio, e o conserto é uma coluna

O dev confirmou a opção (a): **foi correção de digitação**, uma coisa só. Em 14/07 dois contratos nasceram com a mesma UC; o certo é o da Renata Lucy, e o do Fernando recebeu a UC dela por engano. Corrigido em 29/07, com backup do estado anterior do lado deles.

Conferido daqui nos dois sentidos, e bate. **E apareceu um detalhe que o dev não mencionou:** o cliente da nossa linha é o lead `251ec351-…`, que é **vítima de merge** — absorvido pelo `3478ec41-…` em 30/07.

**O conserto não é ensinar o conector a mover vínculos.** A R23 continua certa: a informação que desempata é externa. O que se construiu é `npm run destravar-uc`, que **apaga uma coluna só** — o `crm_usina_cliente_id` da UC nomeada — e deixa o conector gravar o vínculo novo no ciclo seguinte, pelo caminho normal, com contagem e trilha. R6 intacta: o conector continua sendo o único escritor de campo espelhado.

**As quatro guardas, e elas leem o CRM antes de escrever:** o ponteiro existe; o contrato se moveu; há substituto para a UC; o substituto não está preso a outra UC nossa. Um `UPDATE` cego aqui apagaria um vínculo **bom** por digitação errada de UC, e o sintoma só apareceria no ciclo seguinte, longe da causa.

Provado nos dois sentidos contra produção: ensaio na `000041446801282` passa e nomeia as duas pontas; ensaio na `000059133001226` (sadia) **recusa na guarda 2**.

A decisão mora em `src/dominio/destrave-uc.ts`, pura, com **17 verificações** — e o caso feliz usa como fixture as leituras reais de produção.

---

## 5. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Procurei a usina em `codigo_geradora` e concluí que ela não estava exposta** | o dev apontou | Ela está em `usina`, que é o **apelido**. Escrevi "não está exposta" quando o medido era "não está *nessa coluna*" — a conclusão foi mais larga que a medição, e virou pedido a terceiro por dado que já tínhamos |
| **Ia obedecer o *"não está em view nenhuma"* sem conferir** | listei as colunas do schema por outro motivo, e apareceram 10 views | Duas delas eram as que eu ia pedir. **Uma afirmação de terceiro sobre o estado do banco é medível em uma consulta**, e o custo de não medir era uma semana de digitação por planilha |
| **O `decidirDestrave` nasceu dentro do script**, sem teste | a regra 8 | Guarda que escreve em produção e não tem suíte é comentário. Extraída para módulo puro; as 17 verificações rodam sem banco |
| **Tipei `recusa` como `Promise<void>`** | `tsc`, `TS2339` | Função que sempre sai por `process.exit` precisa de `Promise<never>` **e** de `return`, senão o TypeScript não estreita e o código depois dela parece alcançável |

---

## 6. O que muda para quem opera amanhã

1. **Não digite contrato pelo `ATRIBUICAO-originador-2026-07-30.md`.** Ele está errado em 12 UCs. O vigente é o de **03/08**;
2. **são três originadores, não dois** — Kallina Tandara voltou à lista, e faltam **três** CPF/CNPJ;
3. **a `Q-PARCERIA-01` trava três UCs** até alguém dizer se a comissão é do vendedor, do parceiro ou repartida;
4. **o destrave está pronto e não foi executado.** `npm run destravar-uc -- --valendo …` e depois o ciclo — uma rodada resolve a `000041446801282`, a `000307301401201` e a `000295713501257`;
5. **o conector ainda não lê as duas views novas** (`Q-VIEWSCRED-01`). Enquanto não ler, toda digitação sai de documento — e documento envelhece.
