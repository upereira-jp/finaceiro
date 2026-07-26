# Tarefas no CRM — solicitadas pelo financeiro (25/07/2026)

## Contexto que você precisa antes de começar

Estamos construindo um sistema financeiro separado que **lê** o CRM e **nunca escreve nele**. Nenhuma tarefa abaixo é pedido de escrita a partir do financeiro: são correções e respostas **dentro do CRM**, que só você pode fazer.

Tenant em questão: `d4640f4b-f833-4a80-a4db-ccced1956ae4`.

Três dessas tarefas são bloqueio. Duas são perguntas cuja resposta muda desenho do nosso lado — responder "não sei" também serve, desde que seja explícito.

Ordem sugerida: 1 → 2 → 3 → 4 → 5. A 1 é a única que pode causar pagamento errado.

---

# TAREFA 1 🔴 — `Comissionamento` é lido de forma não determinística

## Onde

`VIEWS-PROPOSTAS-r2.sql`, view `financeiro.vendas_ganhas`, o `LEFT JOIN LATERAL` (linhas 92–101):

```sql
LEFT JOIN LATERAL (
    SELECT o.label
    FROM public.custom_field_values v
    JOIN public.custom_field_definitions d ON d.id = v.field_definition_id
    LEFT JOIN public.custom_field_options o ON o.id = ANY (v.valor_options)
    WHERE v.lead_id = l.id
      AND v.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
      AND d.label = 'Comissionamento'
    LIMIT 1
) com ON true
```

## O problema, exatamente

`LIMIT 1` **sem `ORDER BY`** não tem resultado definido. O PostgreSQL devolve a primeira linha que o plano produzir, e o plano muda com estatísticas, com volume e com versão. **Não é instabilidade teórica: é a mesma consulta devolvendo respostas diferentes em dias diferentes.**

E há duas fontes independentes de mais de uma linha aqui, não uma:

**Fonte A — mais de um `custom_field_values` para o mesmo lead e a mesma definição.** Se existir, `LIMIT 1` escolhe um dos valores.

**Fonte B, e essa é a que passa despercebida — `valor_options` é um ARRAY.** O `LEFT JOIN ... ON o.id = ANY (v.valor_options)` **multiplica a linha** por cada opção do array. Um campo multi-seleção com duas opções marcadas produz duas linhas a partir de **um único** `custom_field_values`, e o `LIMIT 1` devolve uma delas arbitrariamente. Ou seja: o defeito existe **mesmo com o dado perfeitamente limpo**, se o campo permitir múltipla escolha.

**Por que isso é grave e não é bug de relatório:** esse `label` é a **alíquota de comissão**. O mesmo lead pode ser lido como 25% hoje e 50% amanhã, sem nada ter mudado no CRM. Relatório errado se corrige; comissão paga errada se explica para uma pessoa.

## Antes de corrigir, meça

Rode isto e me devolva o resultado — a correção certa depende de qual fonte está ativa:

```sql
-- Quantos leads têm ambiguidade, e de qual tipo
SELECT
  count(*) FILTER (WHERE n_valores > 1)                    AS leads_com_multiplos_valores,
  count(*) FILTER (WHERE max_opcoes > 1)                   AS leads_com_multiplas_opcoes,
  count(*) FILTER (WHERE n_valores = 1 AND max_opcoes <= 1) AS leads_sem_ambiguidade,
  count(*)                                                  AS leads_com_o_campo
FROM (
  SELECT v.lead_id,
         count(*)                                   AS n_valores,
         max(coalesce(array_length(v.valor_options, 1), 0)) AS max_opcoes
  FROM public.custom_field_values v
  JOIN public.custom_field_definitions d ON d.id = v.field_definition_id
  WHERE v.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
    AND d.label = 'Comissionamento'
  GROUP BY v.lead_id
) x;
```

E isto, para saber se o campo é multi-seleção por definição:

```sql
SELECT d.id, d.label, d.field_type, d.tenant_id
FROM public.custom_field_definitions d
WHERE d.label = 'Comissionamento';
```

## A correção que eu recomendo

**Não** é só acrescentar `ORDER BY`. Tornar determinístico faz a consulta parar de oscilar, mas **continua escolhendo silenciosamente** quando há ambiguidade — e para uma alíquota, escolher em silêncio é o defeito, não a oscilação.

Torne a ambiguidade **visível** e deixe o consumidor decidir:

```sql
LEFT JOIN LATERAL (
    SELECT
      (array_agg(o.label ORDER BY o.label))[1] AS label,
      count(o.label)                           AS n_opcoes
    FROM public.custom_field_values v
    JOIN public.custom_field_definitions d
      ON d.id = v.field_definition_id
     AND d.tenant_id = v.tenant_id                     -- ver nota de higiene
    LEFT JOIN public.custom_field_options o
      ON o.id = ANY (v.valor_options)
     AND o.tenant_id = v.tenant_id                     -- idem
    WHERE v.lead_id   = l.id
      AND v.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
      AND d.label     = 'Comissionamento'
) com ON true
```

E exponha as duas colunas na view:

```sql
    com.label     AS comissionamento,
    com.n_opcoes  AS comissionamento_n_opcoes,
```

Com isso: o valor é **estável** (agregação ordenada, não `LIMIT` sem ordem) e a ambiguidade é **detectável** (`n_opcoes > 1`). O financeiro passa a recusar o cálculo automático nesses casos em vez de pagar um palpite.

**Nota de higiene, severidade baixa e honesta:** os dois predicados `tenant_id` que acrescentei nos joins de `custom_field_definitions` e `custom_field_options` **não corrigem um vazamento hoje** — o join é por `id`, que é único, e o `v.tenant_id` do `WHERE` já delimita. São defesa em profundidade e tornam a intenção explícita. Se você achar ruído, tire; só não tire o `array_agg` nem o `n_opcoes`.

## Terceiro ponto, menor, no mesmo lugar

A view faz `SELECT DISTINCT ON (l.id) ... ORDER BY l.id, lfp.entered_at DESC`. Isso é determinístico **só se `entered_at` for único por lead**. Em importação em lote, dois `lead_funnel_position` podem compartilhar o timestamp, e o empate é resolvido arbitrariamente. Acrescente um critério de desempate estável:

```sql
ORDER BY l.id, lfp.entered_at DESC, lfp.id DESC
```

## Critério de aceitação

- [ ] A mesma consulta, rodada dez vezes com `ANALYZE` entre as execuções, devolve o mesmo `comissionamento` para todos os leads
- [ ] `comissionamento_n_opcoes` aparece na view e é > 1 exatamente nos leads que a consulta de medição apontou
- [ ] `DISTINCT ON` com desempate por `lfp.id`
- [ ] Nenhum `LIMIT` sem `ORDER BY` sobrou no arquivo

---

# TAREFA 2 🔴 — Cruzar as tabelas-fonte das views contra as tabelas sem policy

## O problema

Auditoria de 24/07: das **151** tabelas do schema `public`, **151 têm RLS habilitada** e **81 não têm nenhuma policy**. Dessas 81: **49 são backup/pré-revert** e **32 são operacionais**.

RLS habilitada sem policy **nega tudo** para quem não tem `BYPASSRLS`. Isso não vaza dado — mas significa que 32 tabelas operacionais só são alcançáveis por credencial que ignora RLS, hoje na prática o `service_role`. **E o modo de falha é resultado vazio, não erro de permissão:** não aparece em log, não quebra teste de fumaça, e só é descoberto quando um relatório vem zerado.

O cruzamento das 12 tabelas-fonte das views atuais já foi feito e deu **interseção vazia** — nenhuma view depende de tabela sem policy. Mas isso vale para as views de hoje.

## O pedido

Antes de aplicar `VIEWS-PROPOSTAS-r2.sql`, e antes de **qualquer** view nova, rode:

```sql
WITH sem_policy AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
)
SELECT DISTINCT v.relname AS view_nome, sp.relname AS tabela_sem_policy
FROM pg_depend d
JOIN pg_rewrite r  ON r.oid = d.objid
JOIN pg_class   v  ON v.oid = r.ev_class AND v.relkind = 'v'
JOIN sem_policy sp ON sp.oid = d.refobjid
WHERE d.classid = 'pg_rewrite'::regclass
ORDER BY 1, 2;
```

**Resultado esperado: zero linhas.** Qualquer linha é uma view que vai devolver vazio para qualquer credencial sem `BYPASSRLS`.

## Divergência que você vai encontrar na documentação

O relatório `P8` diz **81** na §2, com a quebra por classe (49 + 32), e diz **36** duas vezes na §7 — inclusive numa instrução para você (*"cruzar tabelas-fonte contra as 36 sem policy"*). Os dois números não fecham. **Use 81.** O 36 é resíduo de rascunho, e seguir por ele deixaria 45 tabelas fora do cruzamento. Se a sua contagem der um terceiro número, esse é o que vale — me avise.

## Critério de aceitação

- [ ] A consulta acima devolve zero linhas depois de aplicar as views
- [ ] O número real de tabelas com RLS e sem policy está registrado, e é o que vale de agora em diante

---

# TAREFA 3 🟡 — 49 tabelas de backup com dado de lead no schema exposto

## O problema

Das 81 tabelas sem policy, **49 são backup e pré-revert**, no schema `public`, **21 delas com `tenant_id`**. Ou seja: dado de lead de múltiplos tenants, em tabelas que ninguém consulta, num schema exposto ao PostgREST, sem policy e sem política de retenção.

Não é vazamento hoje. É superfície que só cresce, e cada backup novo herda o mesmo desenho.

## O pedido

Duas coisas, e a segunda é uma decisão sua, não uma tarefa:

**1. Inventário.** Liste as 49 com nome, tamanho, data de criação e se têm `tenant_id`:

```sql
SELECT c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho,
       EXISTS (SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0) AS tem_tenant_id,
       obj_description(c.oid) AS comentario
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
ORDER BY pg_total_relation_size(c.oid) DESC;
```

**2. Destino, e a recomendação é sair do `public`.** Três saídas, em ordem de preferência:

| Saída | Quando |
|---|---|
| **Mover para schema `backup`**, fora do `search_path` e não exposto ao PostgREST | Se ainda houver valor de recuperação. É o caminho de menor risco e menor esforço |
| **`pg_dump` para armazenamento frio e `DROP`** | Se o valor é histórico, não operacional |
| Manter no `public` **com policy** | Só se algo consultar essas tabelas em produção — e nesse caso não são backup |

O que eu peço explicitamente: **não deixe no `public` sem policy e sem prazo.** Escolha uma das três e registre a data.

## Critério de aceitação

- [ ] Inventário das 49 entregue
- [ ] Cada uma com destino definido e, se for para ficar, com prazo de descarte

---

# TAREFA 4 🟡 — Merge de leads duplicados apaga fisicamente um `id`? (AUD-07)

## Por que eu preciso saber

O financeiro vai espelhar clientes do CRM e reconciliar por **diferença de conjunto**: o que estava no espelho e não vem mais no full-scan é marcado como inativo — nunca deletado.

Se o merge de duplicados do CRM **apagar fisicamente** um dos `lead_id`, o financeiro vê o `id` desaparecer e desativa um cliente que está **vivo**, só renomeado. Cliente ativo desativado por conta própria é o pior tipo de erro que esse sistema pode cometer: silencioso, e do lado do dinheiro.

## As perguntas

1. O merge faz `DELETE` no lead absorvido, ou marca (`merged_into_id`, `deleted_at`, `removido_do_funil_em`, algo)?
2. Se marca, **qual coluna** e a linha continua visível nas views?
3. Se apaga, existe registro de que o `id` X foi absorvido pelo `id` Y? Em qual tabela?
4. Com que frequência isso acontece na prática — nunca, raro, rotina?

## Como responder rápido

```sql
-- Existe alguma coluna de merge/soft-delete em leads?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
  AND (column_name ILIKE '%merge%' OR column_name ILIKE '%delet%'
       OR column_name ILIKE '%removid%' OR column_name ILIKE '%arquiv%');

-- Existe trilha de auditoria com DELETE em leads?
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name ILIKE '%audit%' OR table_name ILIKE '%log%';
```

**"Não sei, teria que olhar o código do merge" é resposta aceitável** — nesse caso me diga isso, e eu desenho o financeiro assumindo o pior caso (apaga sem rastro), que é mais caro mas seguro.

---

# TAREFA 5 🟡 — 7 dos 48 ganhos do funil Parceiros com `valor` NULL

## O problema

Na leitura de 24/07, **48 ganhos** no total e **7 deles vêm do funil Parceiros com `valor` NULL**. O financeiro calcula comissão sobre valor. Comissão sobre nulo não é zero: é indefinido.

Também: `leads.valor_venda` e `lead_funnel_position.valor` estão **100% NULL** no tenant, por desenho (`funnels.valor_mode = 'consumo_solar'`). O valor que vale é `leads.consumo_reais`. Preciso confirmar que isso vale também para os 7.

## As perguntas

1. Os 7 têm `consumo_reais` preenchido? Se sim, o problema é só de qual coluna ler, e eu resolvo do meu lado.
2. Se não têm nenhum valor em nenhuma coluna: **é dado faltando, ou o funil Parceiros legitimamente não tem valor** porque é onboarding e não venda?
3. Se é onboarding: o funil Parceiros deve estar **fora** da base de comissão? (É o que eu suspeito, e muda a regra.)

## Para responder

```sql
SELECT l.codigo, l.id, f.name AS funil, s.name AS etapa,
       l.consumo_kwh, l.consumo_reais, l.valor_venda, lfp.valor AS valor_posicao,
       l.parceria_tipo, lfp.entered_at
FROM public.leads l
JOIN public.lead_funnel_position lfp ON lfp.lead_id = l.id
JOIN public.funnel_stages s ON s.id = lfp.stage_id AND s.stage_type = 'won'
JOIN public.funnels f ON f.id = s.funnel_id
WHERE l.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
  AND l.removido_do_funil_em IS NULL
  AND coalesce(l.consumo_reais, lfp.valor, l.valor_venda) IS NULL
ORDER BY f.name, lfp.entered_at DESC;
```

---

# O que NÃO fazer

- **Nada de write-back do financeiro para o CRM.** Se algum dia o CRM precisar de estado do financeiro (inadimplência, por exemplo), o desenho é o CRM **consumir** um endpoint nosso — nunca o financeiro escrever aí.
- **Não aplique as views antes da Tarefa 2.**
- **Não altere `funnels.valor_mode`** nem a semântica de `consumo_reais` sem me avisar: o financeiro já derivou desse campo que a tarifa vigente é 1,13 R$/kWh, e uma mudança de significado ali reescreve nosso cálculo de faturamento.

---

# Formato de resposta que me serve

Por tarefa, três linhas:

1. **O que você encontrou** — o número, a coluna, o resultado da consulta
2. **O que você fez** — ou por que não fez
3. **O que ficou aberto** e de quem depende

Para as tarefas 4 e 5, o resultado das consultas já é a resposta. "Não sei" com o motivo vale mais do que um palpite — do meu lado, palpite entra em schema e sai caro.
