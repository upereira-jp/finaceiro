# Plano — o ciclo de vida do cliente, ponta a ponta

| Campo | Valor |
|---|---|
| **Para quem** | Quem precisa saber, em uma leitura, **onde o cliente entra, o que acontece com ele em cada passo, o que já funciona e o que falta** |
| **O que é** | Verificação medida das 12 fases do processo do cliente — do recebimento da conta da distribuidora até o repasse do dinheiro — e o plano em ondas para fechar cada uma |
| **Data** | 21/08/2026 |
| **Como foi medido** | Contra **produção**, pelo mesmo caminho da aplicação (`iniciar` → `login` → `withTenant`), porque a RLS é `FORCE` e consulta direta devolve zero. O lado do CRM foi lido como `financeiro_ro`, só pelas views `financeiro.*` (regra 4). Nada foi escrito |
| **Não substitui** | `PARTIDA.md` (a fila de cadastro, sempre atual) · `PENDENCIAS.md` (o índice de pendências) · `QUESTOES.md` (o registro com dono, regra 10). Este documento é o **mapa do processo**; aqueles são a lista do que falta |
| **Estado da suíte** | `typecheck` + `test:documento` + `test:brcode` + `test:dominio` + `test:web` → **`EXIT=0`**. `test:repos` e `test:isolamento` **não rodaram**: exigem PostgreSQL local, que esta VPS não tem. Dívida aberta e registrada |

---

## 0. O achado que governa o resto — **e a decisão já foi tomada**

> ## ✅ 21/08/2026, fim do dia — o dono decidiu: **o caminho oficial é o UNIFICADO.**
>
> Verbatim: *"vamos com o caminho da fatura unificada"*. A `Q-CICLO-01` está
> **resolvida e construída no mesmo dia**, e o motivo de não esperar é de custo: as
> duas tabelas tinham **zero linhas**, e ligar duas tabelas vazias é uma coluna.
> Depois do primeiro dinheiro seria migration com valor gravado dentro.
>
> **O que a construção mostrou, e não era esperado:** o motor de repartição **já
> tinha a forma exata** da conta unificada. Ele lê da fatura duas parcelas, e a
> conta unificada produz exatamente essas duas — o que o cliente paga à G3 pela
> energia, e o que é repasse puro à distribuidora. **Nenhuma linha do motor mudou.**
>
> **O ganho de operação, medido:** a exigência de dia de vencimento — **46 de 46
> vazias** — deixa de bloquear, porque a conta da distribuidora traz a data. Não é
> um dia inventado pelo sistema: é o que o cliente já tem no papel.
>
> **O que a decisão não removeu:** contrato, usina, rateio e geração continuam
> obrigatórios. Não para calcular o valor — a conta dá o valor — mas porque é da
> usina que sai o repasse e do contrato que sai a regra da comissão. Mudou **de
> onde vem o valor**, não **quem recebe**.
>
> O diagnóstico original fica abaixo, intacto, porque é o registro de por que a
> decisão precisou ser tomada.

> ### Existem DOIS caminhos de fatura neste sistema, e eles não se encontram.

Não é suposição: está escrito no próprio código, em `src/dominio/folha-unificada.ts` —
*"As duas convivem enquanto a aba nova não substitui a Prévia. É redundância, e está
datada: some quando o fluxo antigo sair."* O que nunca aconteceu foi a **decisão** de
qual dos dois sai.

| | **Caminho A — a fatura contratual** | **Caminho B — a fatura unificada** |
|---|---|---|
| De onde vem o valor | geração medida × percentual de rateio × tarifa | **da conta da Equatorial**, lida do PDF |
| Onde grava | tabela `fatura` | tabela `registro_de_fatura_unificada` |
| Como se opera | **em lote**, o mês inteiro (`ensaiar` → `compor` → `emitir`) | **uma UC por vez**, upload a upload |
| Documento impresso | folha G3 com **5 faixas** — faltam os três cartões de economia e a quebra do repasse | folha G3 com **as 7 faixas** |
| Gera boleto conciliável | **sim** (`boleto`, com nosso número) | não — linha digitável e Pix entram como **texto** |
| Gera liquidação | **sim** | **não** |
| Gera repartição (split) | **sim** | **não** |
| Alimenta contas a pagar | **sim** | **não** |

**A consequência é dura e vale dizer sem rodeio:** o documento que o cliente
efetivamente recebe — o de 7 faixas, o que o dono construiu e pediu que substituísse
o processo inteiro — é o único dos dois que **não consegue pagar o dono da usina**.
Ele não vira `fatura`, então não vira liquidação, então não vira split, então não
vira repasse nem comissão. O dinheiro entra e não tem por onde ser repartido.

Enquanto essa decisão não for tomada, qualquer código escrito da fase 6 em diante
pode ser jogado fora. Ela é a **`Q-CICLO-01`**, e é do dono.

---

## 1. As 12 fases, em uma tela

Semáforo: 🟢 funciona e está provado · 🟡 existe e está bloqueado por insumo ·
🔴 não existe, ou existe e não liga no resto.

| # | Fase | Estado | O que trava |
|:--:|---|:--:|---|
| 0 | O cliente chega do CRM | 🟢 | nada — roda sozinho de 15 em 15 min |
| 1 | Identificar o cliente (CPF/CNPJ) | 🟡 | **11 de 29** sem documento confirmado |
| 2 | A unidade consumidora | 🟡 | endereço **0 de 46** · o vencimento **deixou de bloquear**: a conta traz a data |
| 3 | Contrato e quem trouxe o cliente | 🔴 | **0 originadores** → **0 contratos** possíveis |
| 4 | Usina, rateio e geração | 🟡 | rateio ✅ · **0 de 4** usinas com dono · **2 de 4** sem geração nenhuma |
| 5 | **Receber a conta da distribuidora** | 🔴 | a leitura está **desligada em produção** |
| 6 | Compor a fatura | 🟢 | **decidida, construída, aplicada e provada** em 21/08 |
| 7 | Emitir e entregar o documento | 🟡 | emissor **em branco**: sem razão social, sem CNPJ, sem logo |
| 8 | Cobrar | 🟡 | Pix ✅ · boleto só importado à mão · falta o certificado A1 |
| 9 | Receber e dar baixa | 🟡 | pronto, nunca exercitado — 0 liquidações |
| 10 | **Repartir (a partição)** | 🟡 | motor pronto e provado · **0 donos**, **0 regras de repasse**, **0 originadores** |
| 11 | Pagar o dono e o originador | 🟡 | pronto; só tem linha depois da primeira liquidação |
| 12 | Conferir (relatórios) | 🟢 | funciona; tabelas vazias porque não há dado ainda |

**Nenhuma das 12 fases está quebrada por defeito de código.** A bifurcação da fase 6
foi decidida e construída em 21/08; o que resta em todas as outras é insumo que
ninguém digitou — cadastro, credencial e certificado.

---

## 2. Fase a fase — o que foi medido

### Fase 0 · O cliente chega do CRM 🟢

O conector lê **10 views** de `financeiro.*` como `financeiro_ro`, espelha cliente,
usina, geração e unidade consumidora, e roda sozinho pelo `financeiro-ciclo.timer`
a cada 15 minutos. Provado por calendário em 21/08: disparo às 03:45:01, três ciclos,
`Result=success`, **117 lidos · 0 recusados**.

Medido hoje: **92 clientes** espelhados (50 ativos), **46 UCs**, **4 usinas**.
Nenhuma view nova do lado deles sem ser lida, nenhuma view da lista fechada ausente.

**Nada a fazer aqui.** É a única fase que trabalha sem ninguém.

### Fase 1 · Identificar o cliente 🟡

O CPF/CNPJ é o que a **R9** exige para um contrato poder ser ativado, e a **R8**
diz que número vindo do CRM **não vale por decreto** — entra como semente, com
dígito conferido e mesmo assim não validado, porque lá o campo é livre e dígito
certo não prova que o documento é daquela pessoa.

| | |
|---|--:|
| clientes com documento preenchido | 36 |
| **confirmados (valem para o contrato)** | **18** |
| ainda como semente do CRM | 18 |
| faltam, entre os 29 faturáveis | **11** |

Dos 11: **10 não têm anexo nenhum** no CRM — alguém precisa pedir ao cliente — e
**1 é o G3-0092 (Perpétua)**, que tem anexos, mas todos citam uma UC diferente da
que está no card. Decidir qual UC é a certa vem antes.

> **Antes de ligar para o cliente, procure o nome na aba Clientes.** Uma pessoa com
> duas unidades tem duas linhas, e o documento pode já estar na outra — desde a
> migration 33 o mesmo CPF pode repetir legitimamente.

### Fase 2 · A unidade consumidora 🟡

| | |
|---|--:|
| UCs ativas | 46 |
| com usina e percentual de rateio | **46** ✅ |
| com preço do kWh | **46** ✅ |
| **com dia de vencimento** | **0** |
| **com endereço completo** | **0** |

A tarifa fechou sozinha — o conector semeia do card e nunca apaga o que foi digitado.
O vencimento **não tem padrão e não vai ter**: o sistema prefere recusar a cobrança a
escolher uma data por você, e escolher um dia no código seria o improviso que a
regra 10 proíbe. O endereço **não impede cobrar** — só o boleto depende dele.

### Fase 3 · Contrato e quem trouxe o cliente 🔴

**Este é o bloqueio que trava todos os outros.**

| | |
|---|--:|
| originadores cadastrados | **0** |
| contratos | **0** |
| regras de comissão | 10 — 5 tipos × 2 parcelas, todas vigentes ✅ |

O originador é obrigatório no contrato e **não é editável depois** (a R20-b congela o
tipo no rascunho). Sem ele, os 29 contratos nasceriam sem comissão possível — e o modo
de falha é o pior que existe neste sistema: a repartição **roda até o fim, fecha em
zero e não levanta**. Sem erro, sem registro, sem recusa.

Não há tela para esse cadastro; o caminho é um arquivo JSON e o `npm run originadores`.
As regras de comissão já estão todas no lugar, então **o insumo que falta são nomes,
documentos e o tipo de cada um** — e o tipo é decisão comercial, não técnica.

### Fase 4 · Usina, rateio e geração 🟡

**A gestão de rateio funciona e está provada.** Um só caminho de escrita, com o teto
de 100% conferido logo depois de gravar — a trava do banco é adiada até o `COMMIT`, e
sem essa conferência o erro sairia longe da linha que o causou, sem o número da UC.

| Usina | UCs | ativadas no CRM | alocado | situação | dono | repasse | meses de geração |
|---|--:|--:|--:|---|:--:|:--:|--:|
| 0001 | 21 | 19 | 99,78% | com folga | ❌ | ❌ | **1** (só 06/2026) |
| 0002 | 13 | 9 | 82,20% | com folga | ❌ | ❌ | **7** (01 a 07/2026) |
| 0003 | 1 | 1 | 100,00% | completo | ❌ | ❌ | **0** |
| 04 | 11 | **0** | 67,30% | com folga | ❌ | ❌ | **0** |

Três coisas que essa tabela diz e que valem ser ditas em voz alta:

1. **Nenhuma usina passa do teto.** O rateio, sozinho, está saudável.
2. **As 11 UCs da usina 04 não faturam de jeito nenhum hoje** — nenhuma está ativada
   no CRM *e* a usina nunca teve geração medida. São dois bloqueios sobrepostos.
3. **A geração que falta, falta do lado de lá.** Conferi as duas pontas: o CRM tem
   exatamente a mesma cobertura, e o espelho está fiel. Não é defeito de sincronia —
   é medição que ninguém lançou. Fica como **`Q-GERACAO-USINA-01`**.

**Consequência direta na escolha do mês.** A base de faturamento é a geração *medida*,
não a nominal. Então:

| Mês de referência | UCs que fechariam | kWh | valor estimado |
|---|--:|--:|--:|
| **06/2026** | **28** de 29 | 13.595,64 | **R$ 15.367,38** |
| 07/2026 | 9 | 4.459,97 | R$ 5.044,10 |

*(Aritmética feita pela `app.consumo_centavos()`, a única implementação da fórmula.
É estimativa do que sairia com as camadas fechadas — nenhuma fatura foi criada.)*

A 29ª de junho é a UC única da usina 0003, que nunca teve geração.

### Fase 5 · Receber a conta da distribuidora 🔴

É aqui que o processo do cliente **realmente começa** todo mês, e é a fase mais frágil
das doze.

O leitor existe e é bom: sobe o PDF da Equatorial, extrai **21 campos** por modelo de
visão, pela nossa rota autenticada — ao contrário da referência, que expõe um proxy
aberto. Mas:

- ❌ **Está desligado em produção.** `ANTHROPIC_API_KEY` não está em
  `/etc/financeiro.env`. Conferido hoje: a variável não existe, e as duas rotas de
  leitura respondem **503 nomeando o que falta** — que é o comportamento certo, e
  ainda assim é 503.
- ❌ **Nunca houve uma chamada real contra um PDF de verdade** (`Q-LEITOR-01`). O
  contrato está preso por verificações; que funciona no ar **não está provado**.
- ❌ **A conta lida não é arquivada.** O registro guarda os campos extraídos, não o
  arquivo. Se o cliente contestar um número, não há original a conferir. Nova
  **`Q-CONTA-ORIG-01`**.
- ❌ **Uma conta por vez.** 29 clientes = 29 uploads, 29 conferências, 29 registros,
  todo mês, à mão. Não existe lote. Nova **`Q-CONTA-LOTE-01`**.

Medido: **0 registros de fatura unificada** em produção. A fase nunca rodou.

### Fase 6 · Compor a fatura 🔴

É a bifurcação da §0. Os dois motores existem, os dois são puros, os dois são
testados, e os dois calculam coisas diferentes a partir de fontes diferentes.

O que **não** está em dúvida, e é bom que não esteja: a aritmética. Toda ela é em
centavo inteiro, com uma única implementação por fórmula, e o caminho em ponto
flutuante da referência foi medido divergindo — tirando um centavo de quem recebe,
abaixo de 1%, sem erro e sem registro.

O que está em dúvida é **qual das duas contas é a fatura da G3**.

### Fase 7 · Emitir e entregar 🟡

| | |
|---|---|
| identidade do emissor | existe a linha, **razão social e CNPJ em branco** |
| logotipo | **nenhum** |
| chave Pix | ✅ CNPJ, ativa |
| modelo do documento | ✅ "Padrão" — desconto 20%, fator 0,029, multa 2%, juros 1% a.m. |

**A folha sai sem a linha do emissor e sem o Beneficiário do boleto** — que é
exatamente o nome ao qual o aviso contra o golpe se amarra. O documento diz "não pague
a conta da Equatorial" sem dizer quem está mandando cobrar.

O formulário existe e é alcançável em `/documento#cadastro` — a aba está oculta da
barra por decisão do dono, não removida, e é o único caminho de tela para esses campos.

### Fase 8 · Cobrar 🟡

Três meios, em ordem de prontidão:

1. **Pix estático** — ✅ funciona. Chave cadastrada, QR desenhado pelo servidor.
   Não concilia sozinho.
2. **Boleto emitido à mão no portal do banco** — ✅ entra no sistema pela aba
   *Emissão e cobrança*, com os quatro dígitos verificadores conferidos e o valor e o
   vencimento lidos de dentro dos 44 dígitos. Fica **fora da consulta ativa**, de
   propósito.
3. **Boleto registrado pela API** — ❌ falta o **certificado A1** e-CNPJ. É a única
   pendência de código que resta no repositório inteiro: `src/sicoob/http.ts` não
   existe, e não deve existir antes do sandbox — escrever adaptador contra suposição
   é reescrevê-lo inteiro depois.

Medido: **0 boletos**, **nenhum conector de cobrança cadastrado**.

### Fase 9 · Receber e dar baixa 🟡

Webhook, conciliação por arquivo e baixa manual: as três existem, com trilha. Medido:
**0 liquidações**. A autenticação do webhook segue sem resposta (`Q-WEBHOOK-01`).

### Fase 10 · Repartir — a partição 🟡

O motor está pronto, é **puro** e é o pedaço mais bem provado do sistema. Reparte o
valor liquidado em quatro itens, nesta ordem, porque a ordem é a do cálculo:

| Item | Base |
|---|---|
| repasse ao dono da usina | consumo **+ a fatia proporcional do juro** |
| comissão do originador | somente o consumo |
| repasse à concessionária | valor puro, sem percentual |
| **líquido G3** | **não se calcula — se apura**, por subtração |

O líquido é o último de propósito: é o que garante que a soma feche no centavo, e é
onde o resíduo de arredondamento cai. Ele **pode ser negativo**, e o projeto sabe
disso — com captador sênior, repasse e comissão consomem o consumo inteiro nas duas
primeiras faturas. Recusar ali esconderia o custo de aquisição concentrado que o
próprio PRD manda mostrar sem suavização.

**Está bloqueado por três cadastros vazios, não por código:** 0 donos de usina,
0 regras de repasse vigentes, 0 originadores. Medido: **0 execuções, 0 itens**.

> A visualização da partição existe — por liquidação, por dono e por originador, com
> exportação — e hoje mostra tabelas vazias porque não há o que mostrar.

### Fase 11 · Pagar o dono e o originador 🟡

A repartição provisiona; contas a pagar quita. Existe, com categoria, centro de custo
e pagamento parcial. **0 linhas**, e é o esperado: só nasce depois da primeira
liquidação.

### Fase 12 · Conferir 🟢

Repasse por dono, comissão por originador e uso da usina mês a mês, os três com CSV,
todos pelo pool de relatório. Funciona; está vazio.

**O que não existe:** o registro de **tratativas de inadimplência**. O sistema responde
*"quem não pagou"* e não tem onde gravar *"o que já se fez a respeito"*
(`Q-INADIMPLENCIA-01`).

---

## 3. As lacunas que viram questão, não improviso

Pela regra 10, quem encontra a lacuna registra e para — a decisão tem dono nomeado.
Cinco entradas novas, transcritas para o `QUESTOES.md` §5:

| ID | Nível | A pergunta | Dono |
|---|:--:|---|---|
| ~~**Q-CICLO-01**~~ | ✅ | ~~Qual dos dois caminhos de fatura é o oficial?~~ **Resolvida em 21/08: o unificado** — e construída no mesmo dia, ver a onda 3 | Vinicius |
| **Q-CICLO-02** | 🟡 | **Duas das três respondidas e construídas.** Sobra a decomposição da parte da distribuidora que alimenta o repasse — é a `Q-DOCG3-11`, e é aval fiscal | Vinicius + contador |
| **Q-GERACAO-USINA-01** | 🔴 | **Duas das quatro usinas nunca tiveram geração medida** (0003 e 04), e a 0001 só tem 06/2026. Medido nas duas pontas: falta no CRM, o espelho está fiel. De onde vem esse número, e quem lança? | operação + dev do CRM |
| **Q-CONTA-ORIG-01** | 🟡 | **A conta lida não é arquivada.** Guardar o PDF original — onde, por quanto tempo, quem pode abrir? | Vinicius |
| **Q-CONTA-LOTE-01** | 🟡 | **29 contas por mês, uma por vez.** Vale um caminho de lote, ou a conferência individual é o ponto? | Vinicius + operação |

---

## 4. O plano, em ondas

A ordem não é de importância — é de **dependência**. Fechar uma destrava a seguinte.

### ✅ Onda 0 · A decisão que precede o código — **FEITA em 21/08**

**`Q-CICLO-01` resolvida: o caminho oficial é o unificado.** E a onda 3, que
dependia dela, foi construída no mesmo dia — ver abaixo.

### Onda 1 · Os seis cadastros — *não é código, e não muda com a onda 0*

Esta onda vale igual nos dois caminhos, e por isso pode começar **agora**, em paralelo
com a decisão. É o `PARTIDA.md`, e a ordem é a que destrava:

| | O quê | Quanto falta | Onde |
|:--:|---|---|---|
| 1 | **Originadores** | 0 cadastrados | `npm run originadores` |
| 2 | CPF/CNPJ dos clientes | 11 de 29 | aba **Clientes** |
| 3 | Contratos | 29 de 29 | aba **Contratos** |
| 4 | Dia de vencimento | 46 de 46 | aba **Unidades consumidoras** |
| 5 | Dono de cada usina | 4 de 4 | **Donos de usina** → **Usinas** |
| 6 | Percentual de repasse | 4 de 4 | **Usinas**, por vigência |

Fechada a onda 1, o mês **06/2026 pode ser faturado pelo caminho A** — 28 UCs,
R$ 15.367,38 estimados — e a repartição pode rodar de verdade pela primeira vez.

### Onda 2 · Ligar a fase 5 — *pequena, e destrava a fase mais frágil*

1. `ANTHROPIC_API_KEY` em `/etc/financeiro.env` + `systemctl restart`.
   **Girar a chave antes** se ela for a mesma da referência na Vercel — o proxy aberto
   de lá é `Q-REF-SEGREDO-01`.
2. Subir **uma conta real** e conferir campo a campo. Fecha a `Q-LEITOR-01`, que hoje
   é a única coisa do leitor que não está provada.
3. Decidir `Q-CONTA-ORIG-01` (arquivar o PDF) e `Q-CONTA-LOTE-01` (lote).

### ✅ Onda 3 · A junção — **CONSTRUÍDA em 21/08**

O caminho B venceu, e o registro unificado ganhou `fatura_id`. O que entrou:

| | |
|---|---|
| **migration 34** | a coluna, a FK composta e o índice **cheio** — parcial sobre exatamente as colunas de uma FK é o único caso que a regra 11 proíbe pelo nome |
| **a triagem** | `src/dominio/fatura-do-registro.ts`, pura, **42 verificações**. Nove recusas nomeadas, cada uma dizendo a saída |
| **a gravação** | `INSERT ... SELECT` que copia os centavos **de dentro do banco** — nenhum valor de dinheiro passa pelo Node, e não há segunda implementação de nada |
| **duas rotas** | ensaiar (não escreve) e faturar (escreve). O par é o mesmo do lote, pela mesma razão: o primeiro ato que cobra um cliente deve poder ser olhado antes de existir |
| **o botão** | *"gerar cobrança"*, na lista de contas registradas. Um ato que só o `curl` alcança não é um ato — este projeto já pagou por esse erro uma vez |

**A conferência da alocação é capacidade nova, e caiu de graça.** O caminho
unificado põe lado a lado dois números que nunca tinham se encontrado: quanto a
usina **alocou** para a unidade (geração × rateio) e quanto a distribuidora
**compensou** de fato na conta. Não vira alerta — são grandezas diferentes e quase
nunca são iguais, então um sinal seria ruído. Vira três números para quem confere:
alocado, compensado, diferença. *"Aloquei 500 e o cliente compensou 480"* é
pergunta de negócio legítima, e antes não tinha onde ser feita.

**O que sobrou aberto:** a decomposição da parte da distribuidora que alimenta o
repasse (`Q-DOCG3-11`) espera o aval do contador. Enquanto não vier, a repartição
trata essa parte como repasse puro — que é o que o `PRD` §5.1 manda.

**Aplicada e no ar em 21/08.** A migration passou pela guarda de identidade antes
de discar, foi conferida **no catálogo** — coluna, FK composta e índice, os três
presentes — e o deploy saiu na sequência.

**E foi provada ponta a ponta**, o que o dado de produção não permitia: há zero
contratos, e a fatura exige um. O `npm run ensaio-juncao` monta originador,
contrato e conta lida como fixture, fatura contra o schema real, confere doze
coisas e termina em **rollback** — a última verificação conta as tabelas depois da
transação e falha se sobrar linha. **12 de 12, produção intacta.** O que ele
provou e a suíte pura não podia: o `INSERT ... SELECT`, os três `JOIN`, os
`CHECK` da tabela, a coluna gerada do total e a recusa do segundo clique.

### Onda 4 · Cobrar de verdade

1. Preencher o emissor em `/documento#cadastro` — razão social, CNPJ, contato, logo.
   Sem isso o documento cobra sem dizer quem cobra.
2. Endereço do pagador das UCs que vão receber boleto.
3. Certificado **A1**, e só então `src/sicoob/http.ts`.
4. `Q-WEBHOOK-01` — a autenticação do aviso de pagamento.

### Onda 5 · O que só existe depois do primeiro dinheiro

Repartir → provisionar → pagar → conferir. Não há nada a construir; há a **primeira
execução real**, que é o único teste que ainda não foi feito.

### Onda 6 · O que fica explicitamente de fora

O registro de tratativas de inadimplência (`Q-INADIMPLENCIA-01`). Não bloqueia a
primeira fatura e não deve entrar antes dela.

---

## 4b. A fila do ciclo completo — quem faz o quê, em ordem

Medida em 21/08, depois da decisão da `Q-CICLO-01` e da junção construída. **Ordem
por dependência, não por importância** — e a coluna que mais importa é a última.

### Trava o ciclo inteiro — sem isto, nada começa

| # | Demanda | Por que trava | De quem |
|:--:|---|---|---|
| **1** | **Ligar a leitura da conta** — `ANTHROPIC_API_KEY` no `/etc/financeiro.env` + `restart` | O ciclo **começa** na conta da distribuidora. Sem a chave, as duas rotas respondem 503 e não há o que conferir, registrar ou cobrar. **Girar a chave antes** se for a mesma exposta pelo proxy aberto da referência (`Q-REF-SEGREDO-01`) | dono |
| **2** | **Uma leitura real** contra um PDF de verdade | Que o extrator funciona no ar **não está provado** (`Q-LEITOR-01`). É subir um arquivo | dono |
| **3** | **Preencher o emissor** — razão social, CNPJ, contato, logo, em `/documento#cadastro` | A folha sai **sem dizer quem está cobrando** — e é a esse nome que o aviso contra o golpe se amarra | dono |

### Trava o contrato, e por consequência a repartição

| # | Demanda | Por que trava | De quem |
|:--:|---|---|---|
| **4** | **Documento e natureza dos dois originadores** | O CRM **não tem nenhuma coluna de CPF/CNPJ** — medido no `information_schema` em 21/08. O número não existe em sistema nenhum. **Tipo já decidido**: `vendedor_g3` para os dois | dono |
| **4b** | **Quem é "Out Sales"** | É equipe, e equipe não tem CPF. Ou há um CNPJ, ou há uma pessoa. **Sem isso os 3 contratos dele não nascem — os 26 da Renata nascem** | dono |
| **5** | **Dono de cada usina e percentual de repasse** — 4 de 4 | Não impede cobrar; impede repartir. O dinheiro entra e acumula sem destino | operação |

### Trava parte da carteira

| # | Demanda | Quanto custa | De quem |
|:--:|---|---|---|
| **6** | **Geração medida das usinas `0003` e `04`** (`Q-GERACAO-USINA-01`) | **12 das 46 unidades** não faturam em mês nenhum. Medido nas duas pontas: falta no CRM, o espelho está fiel | operação + CRM |
| **7** | **Endereço do pagador** — 0 de 46 | Só o boleto depende. Pix e a folha saem sem ele | operação |
| **8** | **Certificado A1** | Sem ele o boleto existe (importado à mão) e o Pix cobra. O que falta é o sistema emitir sozinho | dono |

### Decisões com dono nomeado — não são de implementação

| # | Questão | O que decide | De quem |
|:--:|---|---|---|
| **9** | `Q-DOCG3-11` | A quebra da parte da distribuidora que alimenta o repasse. **É a última peça de dinheiro sem aval** | contador |
| **10** | `Q-CONTA-ORIG-01` | Guardar ou não o PDF da conta lida | dono |
| **11** | `Q-CONTA-LOTE-01` | Um caminho em lote para as 29 contas do mês, ou conferência uma a uma | dono + operação |
| **12** | `Q-SEGVIA-01` | Guardar `outros_encargos`, para a 2ª via poder repetir a conferência do resíduo | dono |
| **13** | `Item 10` (fiscal) | Comissão a sócia é despesa dedutível ou distribuição de lucro. **Vale sobre 26 das 29** | contador |

### Código que resta, e é pouco

| # | Demanda | Estado |
|:--:|---|---|
| **14** | `db pull` + `generate` depois da migration 34 | Dívida técnica. O código funciona sem isso — a junção usa SQL cru de propósito —, mas o cliente gerado ainda não conhece `fatura_id` |
| **15** | `GET /faturas/:id/documento` ainda compõe a folha de **5 faixas** | Para uma fatura vinda de conta lida, o documento certo é a **2ª via**. Decidir se aquela rota passa a apontar para cá, ou se ela sai |
| **16** | `src/sicoob/http.ts` | **Não escrever antes do sandbox.** É a peça que espera o A1 |
| **17** | `Q-INADIMPLENCIA-01` — registro de tratativas | Fora do caminho da primeira fatura, de propósito |

---

## 5. O que este plano não faz, e por quê

**Não preenche nenhum dos seis cadastros.** Nenhum é derivável: são documentos de
pessoas reais e decisões comerciais. Inventar um originador ou escolher um dia de
vencimento seria o improviso que a regra 10 proíbe — e, no caso do originador, seria
gravado num campo que não tem caminho de edição.

**Não escolhe entre os dois caminhos de fatura.** A escolha muda o que o cliente
recebe e como o dono da usina é pago. Tem dono, e não é o implementador.

**Não liga a chave da Anthropic.** Ligá-la é ato de plataforma, com custo por leitura,
e a chave pode ser a mesma que está exposta na referência.
