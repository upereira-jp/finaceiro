# PAUTA — reunião com o contador

| Campo | Valor |
|---|---|
| **Data do documento** | 28/07/2026 |
| **Para** | contador da G3 Solar |
| **Preparado por** | Vinicius Leal |
| **Bloqueia** | **F2** (faturamento) e **F3** (split e comissão) |
| **Status das questões** | 4 vermelhas, aceitas como risco em 24/07 e rebaixadas para bloqueio de F2/F3 |

---

## Por que esta reunião é agora, e não depois

O sistema financeiro tem hoje **20 tabelas, todas da fase de fundação**. Cliente, unidade consumidora, usina, geração, contrato, regras de comissão e repasse — tudo isso existe e está rodando contra o CRM real.

**O que ainda não existe: `fatura` e `split_item`.** As tabelas que carregam dinheiro faturado e dinheiro repartido não foram escritas.

É por isso que a reunião vale agora. As respostas abaixo **definem colunas dessas duas tabelas**. Respondidas hoje, custam uma conversa. Respondidas depois de a fase de faturamento estar escrita, custam migração de schema, reescrita de regra e reprocessamento de dado financeiro já emitido.

O critério que este projeto usa para classificar uma questão como bloqueante é literal: *"é vermelha se a resposta errada obriga a reescrever schema, policy ou contrato de integração"*. Seis das onze perguntas abaixo se enquadram.

---

## Contexto do negócio, em uma página

A G3 Solar opera **geração compartilhada de energia solar**. Três usinas geram crédito; esse crédito é rateado entre unidades consumidoras de clientes, que passam a pagar menos na conta da distribuidora. A G3 fatura o cliente pelo crédito repassado.

Há três fluxos de dinheiro:

1. **Receita** — o cliente paga a G3 pelo crédito de energia.
2. **Comissão** — o vendedor ou parceiro que trouxe o cliente recebe percentual.
3. **Repasse** — o dono da usina recebe pela energia que a usina dele gerou.

As perguntas abaixo tratam dos três.

---

## Bloco 1 — Respostas que definem **coluna**

### 1. Regime de caixa ou competência para reconhecer a receita
*(`Q9` da lista de 24/07)*

**O que se pergunta:** a receita da venda de crédito de energia é reconhecida na **emissão** da cobrança ou no **recebimento**?

**Por que trava:** define *quando* a receita passa a existir.

**Consequência no sistema:** hoje toda a modelagem gira em torno de **competência** — o mês de referência do crédito. Se a resposta for **caixa**, o evento que cria a receita deixa de ser a nossa emissão e passa a ser a **confirmação de pagamento vinda do banco**. Isso não muda uma coluna: muda o modelo de eventos inteiro do faturamento, e o momento em que o sistema pode dizer "esta receita existe".

### 2. Retenções sobre comissão e repasse — PF e PJ
*(`Q-011`, `Q5`, `Q6`, `Q8`)*

**O que se pergunta:** sobre comissão paga a **pessoa física**, incide IRRF, INSS, ISS? Com que alíquota, sobre que base, e **quem recolhe**? E sobre **pessoa jurídica** — quais retenções, e a nota é exigida antes do pagamento?

**Por que trava:** se há retenção, quem recebe não recebe o bruto — e o sistema precisa saber disso antes de gravar o primeiro pagamento.

**Consequência no sistema, e é a mais estrutural de todas:** o sistema tem uma regra que hoje diz *"a soma dos itens de repartição é igual ao valor liquidado, ao centavo"*. **Com retenção, essa regra fica falsa** — a soma dos líquidos não fecha o total, porque uma parte foi para o fisco.

A tabela de repartição passa a precisar de **valor bruto**, **retenção** e **valor líquido**, com a quebra por tributo, e a regra vira: *bruto = liquidado* e *líquido + retenções = bruto*.

**Sem esta resposta, eu não sei quantas colunas essa tabela tem.**

### 3. Repasse ao dono da usina: despesa, custo ou repasse de terceiros?
*(`Q7`)*

**O que se pergunta:** o dinheiro que vai ao dono da usina é despesa da G3, custo da operação, ou repasse de valor que nunca foi da G3?

**Por que trava:** muda se o dinheiro **chega a ser receita** nossa.

**Consequência no sistema:** três desenhos diferentes de DRE e três leituras diferentes de "quanto a G3 fatura".

- **Repasse de terceiros** → o valor não transita como receita em momento nenhum. A receita bruta da G3 cai, e pode ser preciso segregar conta.
- **Custo** → entra na formação da margem por usina.
- **Despesa** → fica abaixo da linha e não afeta margem.

### 4. Crédito de IBS/CBS e natureza da receita
*(`Q-003 C`, `Q4`)*

**O que se pergunta:** na comercialização de crédito de energia há crédito de IBS/CBS a apropriar, e sobre que base? E a natureza da receita é **energia**, **serviço** ou **locação de ativo**?

**Por que trava:** 2026 é ano de transição da reforma tributária, e a natureza define CNAE e retenção.

**Consequência no sistema:** determina se a fatura carrega colunas de tributo recuperável e se a linha de fatura precisa de um campo de natureza. Se houver crédito a apropriar, aparece uma conta a receber que hoje não existe no modelo.

---

## Bloco 2 — Respostas que definem **fluxo**

### 5. Escriturar receita sem emissão de documento fiscal
*(`Q-002 C`)*

**O que se pergunta:** hoje a G3 cobra sem emitir nota. Isso é sustentável? Se não, que documento passa a ser exigido, e em que momento?

**Por que trava:** é a maior variável de **escopo** da fase de faturamento.

**Consequência no sistema:** define se o faturamento precisa de **integração de nota fiscal** — com prefeitura ou SEFAZ — ou se o boleto é o instrumento. A diferença entre as duas respostas é de semanas de trabalho.

### 6. Nota do prestador PJ antes do pagamento da comissão

**Consequência no sistema:** se for exigida, o pagamento ganha um estado **"bloqueado aguardando nota"**, e o motor de repartição não pode liquidar direto. É uma máquina de estados a mais no fluxo.

---

## Bloco 3 — Respostas que definem **classificação**

### 7. Regime tributário de cada operação
*(`Q1`)*

Simples, Presumido ou Real. **Consequência:** a empresa ganha um campo de regime, e as tabelas de alíquota passam a ser versionadas por vigência — como as tabelas de tarifa e de comissão já são.

### 8. Comissão à sócia: despesa dedutível ou distribuição de lucro?
*(`Item 10`)*

**O dado, medido e não estimado: a Renata é responsável por 39 dos 48 ganhos — 83 %.**

**Por que trava:** com essa concentração, a classificação move o resultado da empresa.

**Consequência no sistema:** se for **distribuição de lucro**, esses 39 ganhos **não geram item de comissão** — saem do motor de comissão para o de distribuição. Não é ajuste de alíquota: é outra entidade, outro momento e outra base tributável.

---

## Bloco 4 — Duas perguntas que a estrutura do sistema obriga, e que não estavam na lista de 24/07

### 9. Onde o arredondamento acontece, e quem fica com o centavo da sobra

O sistema proíbe número de ponto flutuante em **todo** cálculo de dinheiro, inclusive intermediário — dinheiro é inteiro, em centavos. E há a regra de que a soma dos itens de repartição fecha com o valor liquidado **ao centavo**.

**As duas coisas não coexistem sem uma regra de arredondamento declarada.** Se cada parcela for arredondada isoladamente, sobra ou falta centavo.

**Preciso da regra:** arredonda-se no total e distribui-se o resíduo, ou arredonda-se por parcela e alguém absorve a diferença? E **quem** absorve — a G3, o originador ou o dono da usina?

Sem essa resposta, ou a regra do centavo cai, ou o programador escolhe sozinho — e escolher sozinho é exatamente o que este projeto proíbe em decisão de dinheiro.

### 10. Faturar pelo **alocado** ou pelo **gerado**?

Esta é a que a operação levantou em 28/07, e ela tem duas medidas diferentes que hoje o sistema **não separa**:

| Medida | O que é | O sistema controla? |
|---|---|---|
| **Quanto a usina *será* usada** | soma dos percentuais de rateio contratados com os clientes | ✅ sim — há trava que rejeita acima de 100 % |
| **Quanto a usina *já foi* usada** | crédito efetivamente consumido contra a geração do mês | ❌ **não existe controle** |

**As duas juntas é que evitam overbooking.** Hoje só a primeira existe.

**A pergunta fiscal:** se a alocação diz 100 % mas a geração do mês foi menor, fatura-se pelo **alocado** ou pelo **gerado**? E se já se faturou pelo alocado e a geração não veio, o ajuste é **nota de crédito**, **abatimento na competência seguinte** ou **estorno de receita**?

**Consequência no sistema:** define se a base de faturamento é o contrato ou a medição — e, no caso do estorno, se a receita reconhecida pode ser desfeita, o que volta à pergunta 1 (caixa ou competência).

> **O caso concreto já está no banco:** a usina `0003` tem **um único cliente com 100 % do rateio** e **zero geração lançada**. Se houver faturamento sobre ela, é receita sobre energia que ninguém registrou ter sido gerada.

---

## Dados medidos, para a conversa ser concreta

Tudo abaixo saiu do banco em 28/07, não de estimativa.

| | |
|---|--:|
| Clientes espelhados do CRM | 76 |
| Ganhos de venda | 41 |
| **Concentração da Renata** | **39 de 48 — 83 %** |
| Clientes da carteira de rateio | 36 |
| Unidades consumidoras | 35 |
| Usinas | 3 |
| Ganhos com consumo em kWh (base de faturamento) | 40 de 41 |

**Rateio alocado por usina:**

| Usina | UCs | Alocado | Geração lançada |
|---|--:|--:|---|
| `0001` | 20 | 94,28 % | 1 mês (jun/2026) |
| `0002` | 14 | 91,20 % | 7 meses (jan–jul/2026) |
| `0003` | 1 | **100,00 %** | **nenhuma** |

Duas anomalias que valem a pena levantar na reunião:

1. **A `0003`** — capacidade toda alocada, geração nenhuma lançada.
2. **Uma unidade consumidora aparece em dois contratos de rateio** (`000041446801282`). O desenvolvedor do CRM verificou o modelo e concluiu que é erro de digitação na carga manual de 14/07 — precisa de conferência contra o rateio oficial da distribuidora.

---

## Checklist de resposta

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Caixa ou competência | |
| 2 | Retenções sobre comissão PF (IRRF/INSS/ISS): incide, alíquota, base, quem recolhe | |
| 2b | Retenções sobre comissão PJ, e nota exigida antes do pagamento | |
| 3 | Repasse ao dono da usina: despesa, custo ou repasse de terceiros | |
| 4 | Crédito de IBS/CBS, base, e natureza da receita | |
| 5 | Escriturar sem documento fiscal: sustentável? Se não, qual documento | |
| 6 | Regime tributário de cada operação | |
| 7 | Comissão à sócia: despesa dedutível ou distribuição de lucro | |
| 8 | Regra de arredondamento e quem absorve o resíduo do centavo | |
| 9 | Faturar pelo alocado ou pelo gerado; e o ajuste quando divergir | |

---

## Uma observação de método, para calibrar a urgência

Estas quatro questões fiscais foram **aceitas como risco** em 24/07 e rebaixadas de bloqueio da fase de fundação para bloqueio das fases de faturamento e comissão. **Aquilo funcionou** — a fundação correu inteira sem tocá-las e está pronta.

Mas a fundação **acabou de ficar sem nenhum bloqueio vermelho**. No dia em que o faturamento começar, as quatro voltam a ser bloqueio — agora sem folga de calendário, e com a diferença de que o schema que elas definem estará prestes a ser escrito.
