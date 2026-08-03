# Financeiro → dev do CRM · rodada 6 · 03/08/2026

**A resposta da rodada 5 fechou a pergunta que travava tudo. Obrigado — o eixo está adotado e o mapa foi refeito hoje.**

Três coisas antes de qualquer outra: **o que vocês dizem que ainda não existe, já existe e nós já lemos**; os cinco pedidos estão respondidos abaixo; e há **uma coisa nova que mexe em dinheiro** e que nem vocês nem nós tínhamos nomeado.

Tudo aqui foi medido hoje pela role `financeiro_ro`, só pelas views, sem `BYPASSRLS`.

---

## PARTE 1 — Três respostas de vocês já estão vencidas, e as três para melhor

### ❌ 1.1 A Q4b está errada: as duas views existem e nós lemos as duas

Vocês responderam que o crédito **"não está em view nenhuma"** e que *"mesmo com o nome, leriam 0 linhas"*.

Medido hoje, pela `financeiro_ro`:

| view | linhas que devolveu |
|---|--:|
| **`financeiro.vendas_creditadas`** | **48** — 45 vigentes, 3 revogadas |
| **`financeiro.rateio_situacao`** | **41** |

O schema `financeiro` tem **10 views**, não 8. As duas novas trazem exatamente o que a Parte 8 item 2 prometia como trabalho futuro: `vendedor`, `responsavel_origem`, `parceiro_*`, `parceria_tipo`, `comissao_pct`, `vendedor_nome_ficha`, `divergencia_ficha`, `ganho_em`, `origem_carimbo`, `vigente`, `revogado_em`, `revogado_motivo` — e, na outra, `etapa_rateio`, `stage_type`, `situacao`, `em_troca_titularidade`, `na_etapa_desde`.

**Vocês entregaram e a resposta não acompanhou.** Não é reclamação — é aviso, porque a frase *"vocês não alcançam"* ia nos fazer digitar por planilha por mais uma semana.

**Por que a leitura funciona, e isto vale como alerta do lado de vocês.** A tabela base tem RLS e zero grant, como vocês disseram. Mas a leitura passa: **por padrão o PostgreSQL avalia a RLS das tabelas base contra o *dono da view*, não contra quem consulta.** Nenhuma das 10 views de `financeiro` declara `security_invoker = true` — conferido em `pg_class.reloptions`, as 10 vêm `(sem opções)`.

Para nós está tudo certo: as 10 filtram por `crm_tenant_id` e conferimos que **todas devolvem 1 tenant só**. Mas o mecanismo merece a atenção de vocês, porque é o mesmo que mediu, no CRM, **82 tabelas com RLS habilitada e nenhuma policy**: uma view sem `security_invoker` anula `FORCE ROW LEVEL SECURITY` e todas as policies de uma vez. Se algum dia uma dessas views deixar de filtrar por tenant no corpo, ela vaza tudo — e não vai dar erro.

### ✅ 1.2 As 3 vendas do Edimar já foram recreditadas, e ficaram certas

A Parte 7 item 1 pedia que não digitássemos as três até vocês corrigirem. **Já está feito** — medido hoje:

| UC | lead | revogado | recredito | `comissao_pct` | parceiro | `ganho_em` |
|---|---|---|---|--:|---|---|
| `000241968901278` | G3-0195 | 03/08 | `recredito_parceria` | 25,00 | EDIMAR - FERRAGISTA SOL NASCENTE (`indicador`) | **2026-07-13** |
| `000006990101222` | G3-0377 | 03/08 | `recredito_parceria` | 25,00 | EDIMAR - FERRAGISTA SOL NASCENTE (`indicador`) | **2026-07-24** |
| `000039416101210` | G3-0272 | 03/08 | `recredito_parceria` | 25,00 | EDIMAR - FERRAGISTA SOL NASCENTE (`indicador`) | **2026-07-24** |

O `revogado_motivo` nomeia a causa inteira (*"backfill de 01/08 03:53 rodou antes do vínculo do parceiro (01/08 12:34)"*), e **o `ganho_em` foi preservado**, como vocês disseram que seria. As três revogadas continuam legíveis com `vigente = false`.

**Isso destrava as três — mas abre outra coisa, e é a Parte 3 desta carta.**

### ⚠️ 1.3 A usina `407706301217`: vocês estavam certos, e nós estávamos errados

Procuramos em `codigo_geradora` e dissemos que ela não estava exposta. **Ela está**, na coluna `usina` de `rateio_clientes`, que é o apelido. O erro foi nosso, e as 5 UCs batem uma a uma.

Confirmamos também o que vocês avisaram: `geracao_kwh_mensal` é nulo nessa usina, e `rateio_creditos` devolve **0 kWh** para as 5. Percentual existe, crédito não.

---

## PARTE 2 — Os cinco pedidos de vocês, respondidos

| # | O pedido | Resposta |
|:--:|---|---|
| 1 | Reatribuam `000041446801282` à Renata Lucy | **Ferramenta pronta e ensaiada hoje**, ver §2.1. Falta só o `--valendo` |
| 2 | Rodem o ciclo para trazer `000295713501257` | **Depende do 1** — sai na mesma rodada, ver §2.1 |
| 3 | "Renata Estevam" existe no cadastro de originadores de vocês? | **Não. E nenhum outro nome existe** — a tabela `originador` tem **0 linhas** |
| 4 | Renata, Out Sales (CNPJ) e Kallina Tandara estão cadastrados? | **Não, os três faltam.** Ver §2.2 |
| 5 | Não digitem as 3 UCs do Edimar | **Nada foi digitado** — `contrato` tem **0 linhas**. E vocês já corrigiram, §1.2 |

### 2.1 A `000041446801282` — a correção é uma coluna, e o resto é o conector

Confirmamos a leitura de vocês nos dois sentidos. Do nosso lado a linha aponta para o lead `251ec351-…`, que é **vítima de merge**: `financeiro.lead_merges` mostra que ele foi absorvido pelo `3478ec41-…` (G3-0080) em 30/07.

Fizemos uma ferramenta (`npm run destravar-uc`) que **apaga um campo só** — o `crm_usina_cliente_id` da UC — e deixa o conector escrever o vínculo novo no ciclo seguinte, pelo caminho normal, com contagem e trilha. Ela **lê o CRM antes de escrever** e recusa se vocês não confirmarem a troca nos dois sentidos. O ensaio de hoje:

```
CRM, hoje
  o contrato 524a4866-…  passou a servir a UC 000307301401201  (G3-0080 · FERNANDO ALBINO)
  a UC 000041446801282   passou a ser servida pelo contrato 74bb7b2d-…  (G3-0311 · Renata Lucy)
As quatro guardas passaram: o CRM confirma a troca nos dois sentidos.
```

Depois disso o ciclo **atualiza** a `000041446801282` para a Renata Lucy e **cria** a `000307301401201` e a `000295713501257`. Uma rodada resolve as três.

**Uma nota de leitura, e ela é sobre o merge, não sobre vocês:** no nosso espelho o lead `53877652-…` (G3-0311) está gravado como **"NILTON RODRIGUES DOS REIS/MINEIRO"**, e hoje vocês o chamam de **"Renata Lucy Nogueira Drumond Teles Leaonilton"**. O ciclo corrige sozinho. Registramos porque, se o nome de um lead muda depois de um merge, **todo documento nosso que cite nome de cliente tem prazo de validade** — a mesma lição de `lead.codigo`.

### 2.2 Os três originadores — o insumo que nenhuma view entrega

Nossa tabela `originador` tem `documento` **NOT NULL com dígito conferido**, e natureza `pf`/`pj`. Precisamos de:

| nome | vendas creditadas | falta |
|---|--:|---|
| Renata | 33 das 41 do rateio | **CPF** |
| Out Sales | 7 | **CNPJ** (é inferência nossa — confirmem) |
| Kallina Tandara | 1 | **CPF** |

**Nenhuma das 10 views expõe documento de pessoa** — nem de usuário, nem de cliente. Este é insumo humano, e trava a digitação antes de tudo.

**E aqui vocês nos deram uma pista sem querer:** a Parte 6 cita o CPF do Carlos Gabriel (`00506706117`). Então **o CRM tem CPF de cliente**, e ele não está em view nenhuma. Isso não é sobre originador — é sobre o boleto, e está na Parte 4.

---

## PARTE 3 — 🔴 O que ninguém tinha nomeado: o crédito tem dois nomes e o nosso contrato tem um

Esta é a parte importante desta carta, e ela **nasceu da correção de vocês**, não apesar dela.

Depois do recrédito, três UCs passaram a ter **vendedor e parceiro ao mesmo tempo**:

> `000241968901278`, `000006990101222`, `000039416101210` — vendedor **Out Sales**, parceiro **EDIMAR - FERRAGISTA SOL NASCENTE**, `parceria_tipo = indicador`, `comissao_pct = 25,00`.

Nossa tabela `contrato` tem **um** `originador_id` e **um** `originador_tipo_no_fechamento`. Não há onde guardar os dois — e a escolha muda o valor:

| se o originador for… | 1ª parcela | 2ª parcela |
|---|--:|--:|
| Out Sales, como `terceirizado` | 25% | **25%** |
| Edimar, como `parceiro_indicador` | 25% | **0%** |

A 1ª parcela empata; **a 2ª é 25% contra zero**. E o nosso contrato **congela o tipo no rascunho, sem caminho de edição** — então isto tem de ser decidido antes de digitar, não depois.

**A pergunta para vocês, e é uma só:**

> No modelo da G3, quando existe parceiro indicador, quem recebe a comissão da venda — **o vendedor, o parceiro, ou os dois repartindo**?

Se for "os dois", precisamos saber a repartição, e o nosso schema muda (é migration, e preferimos fazê-la antes dos 41 contratos do que depois).

**Junto disso, uma menor.** `comissao_pct` está preenchido em **3 linhas e nulo em 38**. Hoje o número de vocês (25,00 para `indicador`) e o nosso (25% para `parceiro_indicador`, 1ª parcela) **coincidem**. Mas vocês congelam no dia do ganho e nós resolvemos por vigência: no dia em que a G3 mudar a tabela, os dois divergem em silêncio. **Qual manda?** Não precisa ser hoje, mas precisa ter dono.

---

## PARTE 4 — Dois pedidos nossos, e o primeiro é pequeno

### 4.1 🔴 Exponham `documento` do cliente numa view

O nosso boleto sai com **pagador sem CPF e sem endereço**: `cliente.documento` é NULL nas 84 linhas que espelhamos, e os seis campos de endereço da UC estão vazios nas 39. A Sicoob recusa um pagador sem identificação, e a recusa chega até nós traduzida em 502, num ponto onde a mensagem útil já se perdeu.

A Parte 6 de vocês mostra que o CPF existe no CRM. **Se ele entrar numa view, o problema acaba.** Endereço também, se existir.

### 4.2 🟡 Sim, queremos o sinal de revogação — e ele já está pronto do lado de vocês

Vocês perguntaram se queríamos ser avisados quando um ganho for reaberto. **Sim.** E a resposta é mais simples do que vocês ofereceram: `vendas_creditadas` **já tem** `vigente`, `revogado_em` e `revogado_motivo`, e nós já os lemos. Não precisamos de nada novo.

~~O que falta é do nosso lado: fazer o conector ler essa view a cada ciclo e **acusar**. Vamos construir.~~ — **construído no mesmo dia, e já está no repositório.** O conector passou a ler as duas views a cada ciclo (a lista fechada foi de 8 para 10) e a conferir o crédito vigente contra o originador que estiver digitado. É o mesmo desenho da divergência de distribuidora: **não recusa, não sobrescreve, registra** em `conector_execucao.detalhe`.

Cinco coisas viram sinal, e **as cinco estão mudas hoje** — medimos cada uma antes de escrever, porque um alerta que dispara toda rodada treina qualquer um a ignorar o registro inteiro:

| dispara quando | hoje |
|---|--:|
| UC espelhada sem crédito **vigente** (com a redação mudando se houve revogação sem substituto) | 39 de 39 têm · **0** |
| dois créditos vigentes na mesma UC — o eixo fica ambíguo e não escolhemos | nenhuma repetida · **0** |
| o originador digitado não é nenhuma das duas pontas do crédito | 0 contratos · **0** |
| o digitado casa uma ponta e o crédito nomeia a outra — a Parte 3 desta carta | 3 UCs, sem contrato · **0** |
| contrato **ativo** sobre rateio que vocês não dão por ativado | ver §4.3 · **0** |

**O que continua sendo pergunta para vocês:** o `revogado_em` de hoje veio de um recrédito, que é conserto. **Reabrir ganho é rotina de operação, ou foi excepcional?** Se for rotina, o sinal precisa virar tela; se for excepcional, o registro basta.

**E uma nota que é sobre nós, não sobre vocês.** As duas views existiam desde 01/08 e nós só descobrimos em 03/08, por acaso. O motivo é que **nada do nosso lado comparava o que o schema `financeiro` expõe contra a lista que o conector conhece** — o script imprimia *"views legíveis: 10"* numa linha que ninguém confrontava com o 8. Corrigido: agora ele grita quando aparece view nova e quando some view conhecida. Se vocês publicarem outra, nós vemos no ciclo seguinte.

### 4.3 🟡 A `situacao` chegou, nós lemos — e ela diz uma coisa que muda o faturamento

A §4 da carta anterior pediu **coluna de situação do contrato de rateio**, porque sem ela toda linha de `rateio_clientes` era lida como válida. Vocês entregaram em `rateio_situacao`, e agora que lemos:

| sobre as **39 UCs que espelhamos** | |
|---|--:|
| `ativado` | **28** |
| `nao_ativado` | **11** — destas, **7** em `em_troca_titularidade` |

*(Sobre as 41 linhas da view: 29 `ativado`/`won` e 12 `nao_ativado`/`normal`.)*

Hoje isto não custa nada — `contrato` tem 0 linhas, então nada foi faturado. Mas quando os contratos forem digitados, a pergunta fica de pé:

> **Uma UC com rateio `nao_ativado` pode ser faturada?** E `em_troca_titularidade` — o crédito continua indo para o mesmo titular durante a troca, ou para no meio?

Do nosso lado a decisão está registrada e **não foi improvisada** (`Q-SITUACAO-01`): o conector **continua espelhando as 39** e apenas **conta** por situação no registro de cada ciclo. Recusar as 11 ou marcá-las na UC são as outras duas opções, e as duas mudam o que a operação vê — é decisão de negócio, e ela custa menos agora, com contrato em zero, do que depois de 41 digitados.

---

## PARTE 5 — Duas contas de conferência

**Quarenta e cinco créditos, quarenta e quatro no CSV.** O anexo de vocês trouxe 44 linhas e a view tem 45 vigentes. A que falta é o lead **`G3-0030`**, com **UC vazia** — creditada à Renata em 11/06. Não é problema nosso hoje (sem UC, não entra em rateio), mas se ela tiver UC e ainda não foi alocada, é uma 45ª venda a acompanhar.

**As 3 do Carlos Gabriel, entendidas.** `000287800501262`, `000010011126408` e `000359808001273` estão fora de `rateio_clientes` por não terem usina e percentual, e vocês avisarão quando a alocação sair. Combinado. Só um alerta: **o Carlos Gabriel já tem 5 linhas de cliente do nosso lado**, em duas grafias (`Carlos Gabriel Santos Alves` e `CARLOS GABRIEL SANTOS ALVES`), porque espelhamos um cliente por lead. Quando as 3 UCs chegarem, viram 3 linhas novas — e o dia em que alguém digitar o CPF dele na segunda linha, **o nosso banco recusa**, porque documento é único por tenant. É o mesmo assunto da §4.1, por outro caminho.

---

## Em uma linha

**O eixo foi adotado, o mapa foi refeito hoje (12 UCs mudaram de dono, 19,6% da carteira em kWh), o conector já lê as dez views e confere sozinho — e o que trava agora não é mais leitura: são três CPF/CNPJ e a pergunta da Parte 3.**

**As três perguntas desta carta, juntas:** (1) com parceiro indicador, a comissão é do vendedor, do parceiro ou repartida? — Parte 3; (2) `documento` do cliente numa view? — §4.1; (3) UC com rateio `nao_ativado` ou em troca de titularidade pode ser faturada? — §4.3.

**O conector continua sem escrever no CRM, e nada aqui muda isso.**
