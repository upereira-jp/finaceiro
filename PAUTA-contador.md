# PAUTA — reunião com o contador

| Campo | Valor |
|---|---|
| **Data** | 28/07/2026 |
| **Para** | contador da G3 Solar |
| **De** | Vinicius Leal |
| **Bloqueia** | **F2** (faturamento) e **F3** (split e comissão) |

> **Como responder:** cada pergunta tem **opções fechadas**. Marque uma. Se
> nenhuma servir, use a linha *"outra"* e descreva. **Não preciso de parecer
> fundamentado** — preciso da escolha, porque cada uma corresponde a um desenho
> diferente de tabela. Onde a escolha depender de informação que só você tem,
> diga qual informação falta.
>
> **Tempo estimado:** 10 perguntas, todas de múltipla escolha.

---

## Por que agora

O sistema tem **20 tabelas, todas de cadastro**, rodando contra o CRM real: cliente, unidade consumidora, usina, geração, contrato.

**As tabelas `fatura` e `split_item` — as que carregam dinheiro faturado e dinheiro repartido — ainda não foram escritas.** Cada resposta abaixo define colunas dessas duas.

Respondidas agora: uma conversa. Respondidas depois: migração de schema, reescrita de regra e reprocessamento de dado financeiro já emitido.

## O negócio, em um parágrafo

A G3 opera **geração compartilhada de energia solar**. Três usinas geram crédito; o crédito é rateado entre unidades consumidoras de clientes, que passam a pagar menos na conta da distribuidora. A G3 fatura o cliente pelo crédito repassado. Há três fluxos de dinheiro: **receita** (cliente → G3), **comissão** (G3 → vendedor/parceiro) e **repasse** (G3 → dono da usina).

---

# As perguntas

## 1. Reconhecimento da receita

**A receita da venda de crédito de energia é reconhecida quando?**

- [ ] **A — Competência.** Na emissão da cobrança, no mês de referência do crédito.
- [ ] **B — Caixa.** No recebimento efetivo.
- [ ] Outra: ____________________

| Se A | Se B |
|---|---|
| O sistema já está desenhado assim. Nada muda. | O evento que cria a receita passa a ser a **confirmação de pagamento vinda do banco**, não a nossa emissão. Muda o modelo de eventos inteiro do faturamento. |

---

## 2. Retenção sobre comissão a **pessoa física**

**Sobre a comissão paga a PF, incide retenção?**

- [ ] **A — Não incide nenhuma.**
- [ ] **B — Incide.** Marque quais: ☐ IRRF ☐ INSS ☐ ISS ☐ outra: ______

**Se B, preciso de três coisas por tributo:** alíquota ______ · base de cálculo ______ · quem recolhe ☐ G3 ☐ o prestador

| Se A | Se B |
|---|---|
| A tabela de repartição guarda **um** valor por item. | A tabela precisa de **valor bruto**, **retenção** e **valor líquido**, com quebra por tributo. |

> **Por que esta é a mais estrutural de todas:** o sistema tem hoje a regra *"a soma dos itens de repartição é igual ao valor liquidado, ao centavo"*. **Com retenção essa regra fica falsa** — a soma dos líquidos não fecha o total, porque parte foi para o fisco. A regra teria de virar *"bruto = liquidado"* e *"líquido + retenções = bruto"*. **Sem sua resposta eu não sei quantas colunas essa tabela tem.**

---

## 3. Comissão a **pessoa jurídica**

**3a. Incide retenção?**
- [ ] Não · [ ] Sim — quais: ______________

**3b. A nota fiscal do prestador é exigida ANTES do pagamento?**
- [ ] **A — Não.** Paga-se e a nota vem depois.
- [ ] **B — Sim.** Sem nota, não se paga.

| Se A | Se B |
|---|---|
| O motor de repartição liquida direto. | O pagamento ganha o estado **"bloqueado aguardando nota"** — uma máquina de estados a mais no fluxo. |

---

## 4. Repasse ao dono da usina

**O dinheiro que vai ao dono da usina é, contabilmente:**

- [ ] **A — Repasse de terceiros.** Nunca foi receita da G3; só transitou.
- [ ] **B — Custo.** Compõe o custo da energia vendida.
- [ ] **C — Despesa operacional.** Fica abaixo da linha.
- [ ] Outra: ____________________

| A | B | C |
|---|---|---|
| O valor **não entra na receita** em momento nenhum. A receita bruta da G3 cai, e pode ser preciso segregar conta. | Entra na formação da **margem por usina**. | Não afeta margem. |

**4b. Há retenção na fonte sobre o repasse?** ☐ PF: ______ ☐ PJ: ______ ☐ Não incide

---

## 5. Documento fiscal

**Hoje a G3 cobra sem emitir nota. Isso é sustentável?**

- [ ] **A — Sim**, com a escrituração atual.
- [ ] **B — Não.** Passa a ser exigido: ☐ NFS-e ☐ NF-e ☐ outro: ______
  Momento da emissão: ☐ na cobrança ☐ no recebimento ☐ mensal consolidada

| Se A | Se B |
|---|---|
| O boleto é o instrumento. O faturamento fica no escopo previsto. | O sistema precisa de **integração com prefeitura ou SEFAZ**. É a maior variável de escopo da fase — semanas de diferença. |

---

## 6. Natureza da receita e tributos da reforma

**6a. A receita da venda de crédito de energia é:**
- [ ] Energia · [ ] Serviço · [ ] Locação de ativo · [ ] Outra: ______

**6b. Há crédito de IBS/CBS a apropriar nessa operação?**
- [ ] Não · [ ] Sim — base: ____________________

**6c. Regime tributário da operação:**
- [ ] Simples · [ ] Lucro Presumido · [ ] Lucro Real

**Consequência:** 6a define CNAE e retenção; 6b define se a fatura carrega colunas de tributo recuperável e se aparece uma conta a receber de crédito que hoje não existe no modelo; 6c define quais tabelas de alíquota o sistema versiona por vigência.

---

## 7. Comissão à sócia

**Dado medido, não estimado: a Renata é responsável por 39 dos 48 ganhos — 83 %.**

**A comissão paga a ela é:**

- [ ] **A — Comissão**, despesa dedutível como a dos demais.
- [ ] **B — Distribuição de lucro.**
- [ ] **C — Depende** de ____________________

| Se A | Se B |
|---|---|
| Nada muda — entra no motor de comissão como qualquer outro. | Esses 39 ganhos **não geram item de comissão**. Saem do motor de comissão para o de distribuição: outra entidade, outro momento, outra base tributável. |

> Com 83 % de concentração, essa escolha move o resultado da empresa.

---

## 8. Arredondamento e o centavo da sobra

O sistema proíbe número de ponto flutuante em **todo** cálculo de dinheiro — valores são inteiros, em centavos. E há a regra de que a soma dos itens de repartição fecha com o valor liquidado **ao centavo**. **As duas não coexistem sem uma regra de arredondamento declarada.**

**8a. Onde se arredonda?**
- [ ] **A — No total**, distribuindo o resíduo entre as parcelas.
- [ ] **B — Por parcela**, e alguém absorve a diferença.

**8b. Se B, quem absorve o resíduo?**
- [ ] A G3 · [ ] O originador · [ ] O dono da usina · [ ] A maior parcela · [ ] Outra: ______

> Sem esta resposta, ou a regra do centavo cai, ou o programador escolhe sozinho — e escolher sozinho em cálculo de dinheiro é o que este projeto proíbe.

---

## 9. Faturar pelo alocado ou pelo gerado

A usina tem **duas medidas diferentes**, e hoje o sistema só controla a primeira:

| Medida | O que é | Controlado? |
|---|---|---|
| Quanto a usina **será** usada | soma dos percentuais de rateio contratados | ✅ trava rejeita acima de 100 % |
| Quanto a usina **já foi** usada | crédito consumido contra a geração do mês | ❌ **sem controle** |

**9a. A base de faturamento do mês é:**
- [ ] **A — O percentual alocado** no contrato.
- [ ] **B — A geração efetivamente medida** no mês.
- [ ] **C — O menor dos dois.**

**9b. Se faturou pelo alocado e a geração veio menor, o ajuste é:**
- [ ] Nota de crédito · [ ] Abatimento na competência seguinte · [ ] Estorno de receita · [ ] Não se ajusta

> **Atenção à circularidade:** se a resposta de 9b for **estorno**, ela volta à pergunta 1 — estornar receita já reconhecida depende de qual regime está em vigor.

> **O caso concreto já está no banco:** a usina `0003` tem **um único cliente com 100 % do rateio** e **zero geração lançada**. Se houver faturamento sobre ela, é receita sobre energia que ninguém registrou ter sido gerada.

---

## 10. Uma pergunta aberta, e é a única

**Há algo no desenho acima que te preocupa e que eu não perguntei?**

____________________________________________

---

# Dados medidos, para a conversa ser concreta

Tudo abaixo saiu do banco em 28/07.

| | |
|---|--:|
| Clientes espelhados do CRM | 76 |
| Ganhos de venda | 41 |
| **Concentração da Renata** | **39 de 48 — 83 %** |
| Clientes da carteira de rateio | 36 |
| Unidades consumidoras | 35 |
| Usinas | 3 |
| Ganhos com consumo em kWh (base de faturamento) | 40 de 41 |

**Rateio alocado por usina, contra geração lançada:**

| Usina | UCs | Alocado | Geração lançada |
|---|--:|--:|---|
| `0001` | 20 | 94,28 % | 1 mês (jun/2026) |
| `0002` | 14 | 91,20 % | 7 meses (jan–jul/2026) |
| `0003` | 1 | **100,00 %** | **nenhuma** |

**Duas anomalias que valem a pena levantar:**

1. **A `0003`** — capacidade toda alocada, geração nenhuma lançada.
2. **Uma unidade consumidora aparece em dois contratos de rateio** (`000041446801282`). O desenvolvedor do CRM verificou o modelo e concluiu que é erro de digitação na carga manual de 14/07. Precisa de conferência contra o rateio oficial da distribuidora.

---

# Resumo em uma tabela

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Caixa ou competência | |
| 2 | Retenção sobre comissão PF | |
| 3 | Retenção PJ · nota antes do pagamento | |
| 4 | Repasse ao dono: terceiros, custo ou despesa | |
| 5 | Documento fiscal exigido | |
| 6 | Natureza da receita · IBS/CBS · regime | |
| 7 | Comissão à sócia: despesa ou lucro | |
| 8 | Arredondamento e quem absorve o resíduo | |
| 9 | Faturar pelo alocado ou pelo gerado · ajuste | |
| 10 | O que eu não perguntei | |

---

## Nota sobre urgência

Estas questões foram **aceitas como risco** em 24/07 e rebaixadas de bloqueio da fase de fundação para bloqueio das fases de faturamento e comissão. **Aquilo funcionou** — a fundação correu inteira sem tocá-las e está pronta e testada.

Mas a fundação **acabou de ficar sem nenhum bloqueio**. No dia em que o faturamento começar, estas voltam a ser bloqueio — agora sem folga de calendário, e com o schema que elas definem prestes a ser escrito.
