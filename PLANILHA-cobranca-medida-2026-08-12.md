# PLANILHA DE BENEFICIÁRIAS — o que ela responde e o que ela contradiz

| Campo | Valor |
|---|---|
| **Data** | 12/08/2026 |
| **Fonte** | *"G3 Solar — Planilha de Beneficiárias e Cobrança"*, entregue pelo dono como **referência**, com a ressalva *"podem estar desatualizados em algumas partes"* |
| **Escopo** | 4 abas (usinas), **43 linhas de beneficiária**, **32 titulares distintos** |
| **Status** | **Medição. Nada foi construído a partir dela** — ver §6 |

> **A ressalva do dono é levada a sério e muda o que este documento faz.** Um dado marcado como possivelmente desatualizado não vira default em código (regra 10). O que ele pode fazer — e faz — é **responder perguntas abertas** e **acusar contradição**. Cada número abaixo foi reproduzido a partir dos insumos da própria planilha e comparado com o resultado que ela imprime; nada aqui é leitura de legenda.

---

## 1. ⭐ A conta da fatura, derivada — e ela fecha

A `Q-DOCG3-02` estava 🔴 por uma pergunta só: *o que o cliente pagaria sem a G3.* A planilha responde, e o modelo é mais simples do que o do `g3_fatura_unificada`.

| Grandeza | Valor medido |
|---|---|
| **Tarifa Equatorial** | **R$ 1,185396/kWh** |
| **Desconto negociado** | **20,0%**, igual em **todas** as 43 linhas |

A tarifa não foi lida de uma célula — ela foi **derivada de quatro linhas independentes**, por `Valor Sem G3 ÷ Energia Consumida`, e as quatro concordam até a quinta casa: `1,185397 · 1,185405 · 1,185394 · 1,185418`.

As três fórmulas, verificadas contra os valores impressos (**4 de 4 linhas exatas ao centavo** em cada uma):

```
Valor Sem G3 Solar   = Energia Consumida × Tarifa
Valor com Desconto G3 = Energia Consumida × (1 − Desconto) × Tarifa     <- o BOLETO
Valor a Cobrar        = Valor com Desconto G3 + Valor Tarifa Mínima
```

**Isto reduz o modelo G3 de forma importante:** não existem duas tarifas. O desconto incide sobre o **kWh**, e a "tarifa G3" que o modelo do GitHub exibe tachada (`tarifaG3 = tarifa × (1−perc)`) é derivação de apresentação, não dado. Uma tarifa, um percentual.

---

## 2. 🔴 A legenda e os números discordam — e a diferença é dinheiro

A legenda da planilha define:

> **kWh Cliente Equatorial** — *Menor valor entre energia injetada e energia consumida = energia efetivamente compensada na fatura.*

**Os números não fazem isso.** Testadas as duas hipóteses contra as 4 linhas completas:

| Hipótese | Resultado |
|---|---|
| (a) `Consumida × (1−desc) × tarifa` | **4 de 4 batem** |
| (b) `MIN(injetada, consumida) × (1−desc) × tarifa` | 3 de 4 |

A linha que separa as duas é **Carla Gonzaga (Panificadora Plazza)**:

| | kWh |
|---|--:|
| injetada (crédito disponível) | 2.396,25 |
| consumida | 2.476,42 |
| **não compensados** | **80,17** |
| saldo declarado | 0,00 |

Os 80,17 kWh **não tinham crédito solar para compensar** — o saldo da própria planilha diz isso, está zerado. Mesmo assim receberam o desconto de 20%: **R$ 2.348,43 cobrados onde a regra da legenda daria R$ 2.272,40**.

**A G3 concedeu desconto sobre energia que não gerou — R$ 76,03 numa cliente, num mês.** O modo de falha é o que este projeto persegue: silencioso, plausível, e só aparece quando alguém refaz a conta. Ele **só se manifesta quando o consumo passa a injeção**, que é exatamente o caso que a regra `MIN()` existe para cobrir — e foi 1 em 4 nesta amostra.

### ⚠️ Mas isto NÃO é um defeito do sistema — e a primeira versão desta seção dizia que era

**Nada no repositório produz esse número.** Medido em `src/repos/fatura.ts` (`comporLote`) e na migration 16:

```sql
consumo_kwh            = g.geracao_kwh * uc.percentual_rateio / 100
valor_consumo_centavos = app.consumo_centavos(mesma coisa, tarifa_vigente)
```

**O financeiro fatura a COTA DE GERAÇÃO; a planilha fatura CONSUMO.** São bases diferentes, e a diferença entre elas não é um `MIN()` esquecido. O `MIN(injetada, consumida)` nem sequer é expressável aqui: **o segundo operando não existe no schema** — quem traz consumo real é o `fatura-concessionaria.ts`, ainda não ligado à fatura.

E atenção ao nome: a coluna se chama `consumo_kwh` e **não é consumo**. O documento já a rotula honestamente como *"Crédito injetado (kWh)"*.

Então os R$ 76,03 são **defeito do processo manual que fatura hoje**, e somem no dia em que a composição do financeiro assumir essas UCs. Valem como aviso sobre o processo, não como bug a corrigir no código.

### O espelho: faturando por cota, o financeiro erra para o outro lado

Cobrando `geração × %` **independentemente de o cliente ter consumido**, com a cota acima do consumo o cliente paga a G3 por crédito que não usou — a diferença vira saldo na Equatorial.

A planilha tem coluna `Saldo` e a marca *"considerar essa coluna para ajuste do próximo rateio"*. **O financeiro não tem essa coluna nem esse ajuste.**

Trocar a base reabre a **`Q-021 / AUD-03`**, fechada em 28/07 pela resposta 9a do contador — *"a base é a série REAL por competência, e não a alocada em contrato nem o menor dos dois"*. Aquele "menor dos dois" é do eixo da **geração** (alocado × gerado), não do consumo, então **não resolve esta**; o que ele mostra é que a base já foi decidida uma vez, com parecer contábil.

Registrado como **`Q-DOCG3-09` 🟡**, com dono **Vinicius + contador**.

---

## 3. A "Tarifa Mínima" não é uma tarifa mínima

A legenda diz *"valor fixo da tarifa mínima… independentemente da geração solar"*, e o topo de cada aba pede **um** valor por usina. Convertida em kWh equivalente (`mínima ÷ tarifa`), ela **varia por cliente**:

| Cliente | R$ | kWh equivalente |
|---|--:|--:|
| Thiago | 65,87 | 55,57 |
| Ludmilla | 88,14 | 74,35 |
| Carla (2ª UC) | 128,22 | 108,17 |
| Carla (Plazza) | 393,18 | **331,69** |

Custo de disponibilidade no Brasil é **30 / 50 / 100 kWh** (mono / bi / trifásico). Nenhum dos quatro é um desses, e 331,69 kWh não é mínimo de nada. **A coluna carrega outra coisa** — provavelmente o resto real da fatura da Equatorial (iluminação pública, bandeira, tributos, não compensado). Enquanto não se souber **o quê**, ela não pode ser modelada: é a mesma armadilha do `demais` residual do `g3_fatura_unificada`, que absorve erro de leitura e continua fechando a conta.

Registrado como **`Q-DOCG3-10` 🟡**.

---

## 4. O rateio não fecha em nenhuma das quatro usinas

| Usina | Benef. | Soma % | kWh contratado | Geração | Relação |
|---|--:|--:|--:|--:|---|
| `000170785201259-2` | 21 | **104%** | 10.850 | 12.653 | folga 1.803 |
| `000401269001287-2` | 14 | **93%** | 11.015 | 10.324 | 🔴 **overbooking +691** |
| `4.077.023.012-90` | 1 | 100% | 10.000 | 12.047 | folga 2.047 |
| `407706301217` | 7 | **30%** | 2.925 | 2.925 | exato |

**Duas colunas dizem a mesma coisa e discordam.** Se `%` fosse `kWh do cliente ÷ total contratado`, elas casariam; a concordância medida é **20/21**, **1/14**, **1/1** e **0/7**. Em três das quatro abas, `%` e `kWh contratado` são grandezas independentes que ninguém reconcilia.

O **overbooking** da `000401269001287-2` é a `RATEIO-USO-01` com número: 691 kWh contratados a mais do que a usina gerou. A decisão de 28/07 (*a base de faturamento é a geração medida*) faz esse excesso sumir por construção no faturamento — mas ele continua existindo no **contrato**, e é lá que o cliente lê quanto comprou.

---

## 5. O cadastro — e ele responde a `Q-EQTL-NASCIMENTO-01`

**A data de nascimento existe, e está aqui.** A folha do portal de 08/08 dizia que a validação da Equatorial é a data de nascimento do titular e que ela *"não existe no nosso schema e não vem de nenhuma das 10 views do CRM"*. A planilha tem a coluna `DATA NASC` preenchida para **31 dos 32** titulares.

**Os 32 CPFs passam no dígito verificador** — nenhum inválido. O que há é isto:

| Achado | Quantos | Detalhe |
|---|--:|---|
| Ano de nascimento **futuro** | 2 | Rhenan `27/01/**2991**` · Renata Ferreira `26/01/**2990**` — dígito trocado em 1991/1990 |
| CPF sem formatação | 1 | Osvaldo `26262835172` |
| **CNPJ sem data** | 1 | NII3 — **confirma o buraco**: para PJ ninguém sabe qual é a validação do portal |
| Idade improvável | 1 | Hermani, 98 anos |

**E o achado que vale mais, para a `Q-CLIENTEDUP-01`:** `RENATA LUCY NOGUEIRA DRUMOND TELES LEAO` aparece em 4 UCs com **3 CPFs distintos e 3 datas de nascimento distintas**. Ou são homônimas de uma mesma família, ou é erro. De qualquer modo: **nome não identifica pessoa**, e o par `(nome, CPF)` não identifica UC — **9 dos 32 titulares têm mais de uma UC** (Ataíde 3, Carlos Gabriel 3, Renata Lucy 4).

---

## 6. O que NÃO foi feito com esta planilha, e por quê

**Nada foi construído.** A tarifa de R$ 1,185396 e o desconto de 20% não viraram valor em código, e o motivo é a própria ressalva do dono somada à regra 10: dado marcado como *"pode estar desatualizado"* que vira default é a definição de improviso — e este sairia **impresso na fatura do cliente**, no campo que o modelo G3 usa para provar a economia.

O que mudou é o **estado das perguntas**:

| Questão | Antes | Agora |
|---|---|---|
| `Q-DOCG3-02` tarifa cheia | 🔴 sem nenhuma fonte | 🟡 **modelo conhecido e conta fechada**; falta a fonte de verdade da tarifa vigente |
| `Q-EQTL-NASCIMENTO-01` | 🔴 insumo inexistente | 🟡 **o insumo existe**, com 4 correções de cadastro; o buraco de **PJ** continua 🔴 |
| `Q-DOCG3-09` base de faturamento | — | 🟡 **nova**, com R$ 76,03 medidos — mas **no processo manual**, não no sistema (§2) |
| `Q-DOCG3-10` tarifa mínima | — | 🟡 **nova** |

**A pergunta que decide a `Q-DOCG3-02` deixou de ser "qual é a tarifa" e passou a ser "de onde ela vem todo mês":** da fatura lida pelo leitor da Equatorial (`Q-EQTL-CAMPOS-01`), da tabela de tarifas com vigência (`Q-TARIFA-CONC-01`, e o `npm run tarifas` já existe), ou digitada por competência. As três dão o mesmo número **neste mês** e envelhecem de formas muito diferentes.
