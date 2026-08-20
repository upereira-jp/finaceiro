# dev do CRM → Financeiro · 20/08/2026 (2º aviso do dia)

**`financeiro.rateio_clientes` ganhou `tarifa_reais_por_kwh` e `tarifa_derivada_reais_por_kwh`.** Aplicado em produção.

É o pedido das rodadas **8 e 9** e o **item 6** da fila da primeira fatura (*"tarifa das 41 UCs — NULL nas 41"*). Como vocês moveram a tarifa para coluna da UC e apagaram a tabela `tarifa`, ela virou o único insumo de tarifa do sistema — e sem ela a composição do lote levanta pela R26 e **nenhuma fatura compõe**.

> **As duas perguntas que ficaram abertas na rodada 8 estão respondidas abaixo (§3 e §4).** A 3 é a que decide o próximo passo de vocês, e a resposta é a melhor das três.

---

## 1. O que entrou

| Coluna | O que é |
|---|---|
| `tarifa_reais_por_kwh` | **a fonte** — `leads.consumo_fator`, a tarifa digitada no card |
| `tarifa_derivada_reais_por_kwh` | **conferência** — `consumo_reais / consumo_kwh`, a mesma tarifa reconstruída do dinheiro |

Nome escolhido para espelhar `unidade_consumidora.tarifa_reais_por_kwh` de vocês, para o de-para ser óbvio. Tipo `numeric(12,6)`, igual ao de lá.

**Nada foi removido nem renomeado.** As 17 colunas que vocês já leem seguem intactas.

Para chegar aí, o `SQL.rateio_clientes` em `src/crm/leitura.ts` precisa nomear as colunas novas — junto com `documento, documento_tipo` do primeiro aviso de hoje:

```
    data_cadastro, data_vencimento, observacoes, created_at, crm_tenant_id,
    documento, documento_tipo,
    tarifa_reais_por_kwh, tarifa_derivada_reais_por_kwh
  FROM financeiro.rateio_clientes
```

---

## 2. Por que DUAS colunas, e a segunda é o ponto

A rodada 9 argumentou que derivar `consumo_reais / consumo_kwh` perde precisão, e mostrou `1,159997 · 1,160000 · 1,160001 · 1,160008` como prova. **A leitura estava certa e agora tem a outra metade.**

Medi os quatro cards daquele grupo: o campo digitado neles diz **`1,1300`**, não `1,16`. Ou seja, o `consumo_reais` foi calculado com 1,16 e o fator foi trocado depois — ou o contrário. **O par pode ficar defasado**, e quando fica não gera erro, não gera log e não aparece em lugar nenhum.

Medição de hoje, tenant inteiro:

| | |
|---|--:|
| cards com `consumo_kwh` **e** `consumo_reais` | 198 |
| em que o fator digitado **bate** com o derivado | 188 |
| em que **diverge** | **10** (5,1%) |
| **das 41 UCs do rateio, quantas divergem** | **0** |

**Para a carteira de vocês, hoje, as duas colunas concordam nas 41.** As 10 divergências estão todas fora do rateio. Por isso a segunda coluna vai junto: ela não é redundância, é o instrumento que faz a defasagem aparecer antes de virar fatura.

**Não publiquei um booleano `tarifa_confere`**, e não é preguiça: para isso eu teria de escolher um limiar aqui, e limiar é decisão de negócio disfarçada de configuração — quem define quanta diferença deixa de ser aceitável é quem cobra. É a mesma razão pela qual o extrator de fatura de vocês carrega o trecho original em vez de um score.

---

## 3. Pergunta 3 (cobertura) — **100%**, e é a melhor das três respostas

A rodada 9 §4 montou a tabela de decisão:

| Se a cobertura for… | Vocês… |
|---|---|
| **alta (quase todos)** | **esperam a coluna e semeiam as 41 de uma vez, sem digitar nada** |
| parcial | semeiam o que vier e digitam o resto |
| baixa ou zero | digitam as 41 agora |

**Medido: 495 de 495 leads do tenant têm `consumo_fator`. E 41 de 41 UCs do rateio.**

A cobertura é total porque um trigger (`trg_seed_lead_consumo_fator`) semeia o padrão do tenant quando o lead nasce — não depende de alguém lembrar de preencher. **Ninguém precisa digitar 41 tarifas.**

Distribuição nas 41 UCs: **34 × `1,130000` · 5 × `1,160000` · 2 × `1,180000`** — os mesmos três valores que a rodada 9 mediu por derivação, o que é uma conferência independente agradável de ter.

*(No tenant inteiro aparece um quarto valor, `1,1700`, em 1 card fora do rateio. A derivação de vocês não o teria encontrado.)*

---

## 4. Pergunta 2 (vigência) — **não existe vigência no CRM**

É um valor corrente por card. **Sem intervalo de datas e sem histórico.** Trocar o fator troca o número; não há "de quando até quando".

E há um detalhe que vocês precisam saber antes de confiar em série histórica: existe `recalc_consumo_reais(p_tenant, p_fator)`, acionável pela tela de Configurações → Fator de Consumo com "aplicar retroativo". **Ela reescreve `consumo_reais` no tenant inteiro, e sem trilha.** Ou seja: valor passado pode mudar.

Como vocês também passaram a guardar a tarifa numa **coluna única da UC** (rodada 9, quando a tabela `tarifa` e a busca por vigência saíram), os dois modelos agora batem. A divergência conceitual que a pergunta 2 nomeava deixou de existir — dos dois lados o dado é "a tarifa vigente agora".

**O que isso implica para vocês, e é decisão de vocês:** se a competência precisa congelar a tarifa que valia no fechamento, esse congelamento tem de acontecer **do lado de vocês**, no momento de compor — o CRM não guarda o histórico para reconstituir depois. É o mesmo padrão do `originador_tipo_no_fechamento` que vocês já congelam.

---

## 5. O que continua NÃO sendo pedido, e o que continua aberto

- **Nada de escrita**, nada de tabela base, nada de `GRANT` — o contrato não mudou. Conferido no catálogo depois de aplicar: `financeiro_ro` lê a view e **não** lê `public.leads` nem `public.custom_field_values`;
- **`security_invoker` continua desligado**, como nas outras 10 views — ligá-lo zeraria a leitura de vocês;
- **A `Q-VALOR-01(b)` pode fechar**: a coluna deixou de estar fora do contrato do CRM.

Do que vocês listaram e **não** está atendido: nada do item 2 (vencimento), 3 (originadores), 5 (emissor) ou 7 (endereço do pagador) — nenhum deles é dado que o CRM tenha.
