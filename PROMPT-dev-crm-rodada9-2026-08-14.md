# Pedido ao dev do CRM — rodada 9

| Campo | Valor |
|---|---|
| **Data** | 14/08/2026, fim da manhã |
| **De** | Financeiro G3 |
| **Assunto** | **A mesma coluna da rodada 8** — o pedido não mudou. Mudaram a urgência e uma das três perguntas, que agora está respondida deste lado |
| **Rodada anterior** | `PROMPT-dev-crm-rodada8-2026-08-14.md` — **mesmo dia, 00:49, sem resposta até agora** |

---

## Leia isto primeiro: não é um pedido novo

**A rodada 8 continua valendo inteira e não precisa ser relida agora.** Ela pede
uma coluna de tarifa numa view de `financeiro.*` e faz três perguntas. O pedido é
o mesmo, a coluna é a mesma, e nada do que está lá foi retirado.

Esta rodada existe por três motivos, todos medidos nas onze horas seguintes:

1. **A pergunta 1 da rodada 8 está respondida — e a resposta é a que ela chamava
   de cara.** Nós já fizemos a mudança.
2. **A frase *"nada urgente hoje"* da rodada 8 caducou.** A tarifa passou a ser o
   que segura a primeira fatura.
3. **Apareceu prova de que derivar a tarifa perde precisão**, e ela vem dos seus
   próprios dados. É o argumento que faltava para a coluna.

---

## 1. A pergunta 1 está respondida, e a resposta é (a)

A rodada 8 perguntava se a tarifa é **por card** ou **a mesma para todo mundo**, e
apostava em (b) com base em quatro linhas de uma planilha de 12/08 que concordavam
até a quinta casa.

**A aposta estava errada.** Medido hoje sobre `financeiro.vendas_ganhas`, os
**45 cards** que têm `consumo_kwh` e `consumo_reais` preenchidos, derivando
`consumo_reais / consumo_kwh`:

| Tarifa derivada | Cards |
|---|--:|
| `1,130000` | **37** |
| `1,180000` | **4** |
| `1,16` (ver a §3 — os quatro não são idênticos) | **4** |

**São três valores distintos convivendo hoje**, não um. Uma tarifa por
distribuidora obrigaria os 45 a compartilharem um número que 8 deles contradizem.

**E nós já mudamos de lado**, antes de ter a sua resposta — o que a rodada 8
descrevia como *"migration, mudança na composição da fatura e na R26; não é
difícil, mas não é uma coluna"*. Feito hoje de madrugada: a tarifa deixou de
pendurar em distribuidora, virou **coluna da unidade consumidora**
(`unidade_consumidora.tarifa_reais_por_kwh`, `numeric(12,6)`), a tabela `tarifa` e
a tela de digitar tarifa **saíram**, e a busca por vigência saiu junto.

**Consequência para você: a pergunta 1 não precisa mais de resposta.** As
perguntas **2 (vigência)** e **3 (cobertura)** continuam de pé e continuam
decidindo trabalho — a 3 mais do que nunca, e a §4 diz por quê.

---

## 2. O que mudou de urgência, e é uma correção nossa

A rodada 8 diz, com todas as letras: *"**Nada urgente hoje.** O que segura a
primeira fatura é decisão do nosso lado."*

**Isso deixou de ser verdade nove horas depois**, e por uma mudança nossa, não sua.
Ao mover a tarifa para a UC e apagar a tabela `tarifa`, nós transformamos a coluna
que você ainda não expôs no **único** insumo de tarifa que existe no sistema.

Medido hoje, contra produção, depois de rodar o ciclo do conector **valendo**:

| | |
|---|--:|
| ciclo: status | `ok` — 108 lidos, 0 recusados |
| UCs no financeiro | **41** |
| **UCs com tarifa** | **0** |

Sem tarifa, a composição do lote **levanta de propósito** (é a nossa regra R26:
base nula não vira zero em silêncio). Nenhuma fatura compõe. **A tarifa é hoje o
item do caminho crítico da primeira fatura.**

Não estamos empurrando isso para você — a saída de curto prazo é nossa e está na
§5. Mas a rodada 8 afirmou que não era urgente, e nós não deixamos afirmação
datada errada de pé sem corrigir.

---

## 3. A prova de que derivar não substitui ler o campo — e ela é dos seus dados

Este é o achado que vale a rodada, e ele **inverte** a evidência que a rodada 8
apresentou.

A rodada 8 argumentava que derivar `consumo_reais / consumo_kwh` era quase tão bom
quanto ler o campo, porque quatro linhas medidas em 12/08 deram
`1,185397 · 1,185405 · 1,185394 · 1,185418` — concordância até a quinta casa.

**Olhe o que a mesma conta faz no grupo do `1,16`, hoje, nos 45 cards:**

```
1,159997        1,160000        1,160001        1,160008
```

**Quatro cards, quatro números diferentes, para o que é evidentemente a mesma
tarifa.** Os grupos do `1,13` e do `1,18` saem redondos porque os valores
envolvidos fecham na divisão; o do `1,16` não fecha, e o resíduo aparece.

**A leitura, e ela é a favor da sua coluna:**

- **Existe um campo digitado.** Ninguém digita `consumo_reais` de modo a produzir
  `1,159997` por acaso quatro vezes. O que existe é alguém digitando **`1,16`** em
  algum lugar, e `consumo_reais` sendo gravado como `consumo_kwh × 1,16`
  **arredondado em duas casas**. Dividir de volta não devolve o `1,16` — devolve o
  arredondamento.
- **Derivar é uma volta a mais numa conta que já perdeu casas.** O erro é pequeno
  (8 na sexta casa), e a tarifa **multiplica todo kWh de toda fatura, todo mês**.
- **E o erro é invisível.** `1,159997` não parece defeito, não dispara alarme e não
  aparece em log. Ele só existe como diferença contra um número que nós não temos.

**É exatamente o caso da coluna:** o campo que a operação digita é a verdade, e
tudo que fizermos para reconstruí-lo a partir de outros números vai chegar perto e
errado.

*(Ressalva honesta, para você não decidir com meia informação: os 45 são
`vendas_ganhas`. As nossas 41 UCs casam com um subconjunto deles, então a
distribuição por UC pode diferir um pouco da tabela da §1. O que não muda é o
achado: três valores distintos, e um deles com resíduo de derivação.)*

---

## 4. Por que a pergunta 3 (cobertura) virou a mais importante

A rodada 8 pergunta de quantos clientes ativos o campo está preenchido. Ela agora
decide o nosso próximo passo, e não só a nossa informação:

| Se a cobertura for… | Nós… |
|---|---|
| **alta** (quase todos) | esperamos a coluna e semeamos as 41 de uma vez, sem digitar nada |
| **parcial** | semeamos o que vier e digitamos o resto à mão, com o alerta de pendência que já existe na tela |
| **baixa ou zero** | digitamos as 41 agora e a coluna vira melhoria, não desbloqueio |

**Um número aproximado já serve**, e serve hoje. Ele vale mais para nós agora do
que a coluna pronta na semana que vem — porque é ele que diz se vale a pena
esperar.

---

## 5. O que nós vamos fazer enquanto isso, para você não ficar com a bola

**A saída de curto prazo é nossa e não depende de você:** a aba Unidades ganhou
hoje o campo de tarifa por UC, com filtro de pendência e alerta de quantas faltam.
Se a resposta da §4 demorar, a operação digita as 41 e a primeira fatura sai.

**Isso não cancela o pedido**, e é justamente a §3 que explica por quê: digitar 41
números à mão é um insumo humano que se repete a cada mudança de tarifa da
distribuidora, e a origem do número continua sendo o card. O que a coluna compra
não é a primeira fatura — é as próximas.

---

## O que continua NÃO sendo pedido

Igual à rodada 8, e sem afrouxar:

- **Nada de escrita.** O financeiro não escreve no CRM, em nenhuma circunstância e
  por nenhum caminho;
- **Nada de tabela base.** Sem `GRANT` em `public`, sem `BYPASSRLS`, sem exceção.
  Uma coluna numa view resolve;
- **Nada de urgência para hoje** — o que mudou é que agora existe uma **fila**
  atrás disso, e ela não estava lá ontem.

*(Continuam valendo os dois apontamentos de contrato da rodada 8: a coluna
`unificado_em` que apareceu em `financeiro.lead_merges` e que o nosso `SELECT` não
lê — avise se ela era para nós —, e a rotação das chaves em `text` puro na tabela
`tenants`.)*
