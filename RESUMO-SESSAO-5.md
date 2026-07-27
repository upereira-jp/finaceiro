# RESUMO-SESSAO-5 — 26/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Fechar a F1: destravar o `prisma generate`, corrigir a R14, e os dois primeiros repositórios |
| **Método** | Postgres 17 local com as migrations aplicadas do zero, validador WASM do Prisma 7.9, DMMF inspecionado |
| **Achados** | 6, todos medidos |

---

## 1. A F1 não estava sem vermelhas: o `prisma generate` nunca rodou

O `schema.prisma` commitado em `f3d91ff` **não valida**. `cliente_estado_crm` tem `PRIMARY KEY (cliente_id)` e nenhum `UNIQUE (tenant_id, cliente_id)`; a introspecção infere 1-1 pelo `cliente_id` e emite a relação pelo par composto, e o Prisma recusa o schema inteiro:

```
P1012  A one-to-one relation must use unique fields on the defining side.
```

A tabela escapou da regra 2 porque a PK dela **se chama `cliente_id`, não `id`** — o padrão foi conferido por nome de coluna, não por papel. Sem client gerado não havia repositório que não fosse escrito contra `any`, que era exatamente o motivo de a sessão 4 ter parado aqui.

Migration `20260726160000_cec_unique_composto`.

## 2. A R14 do banco e a R14 do comentário eram regras diferentes

O índice era `WHERE status = 'ativo'`; o enum tem quatro estados. Medido em PG 17.6: **o banco aceitava um ativo e um suspenso na mesma UC.** A regra que o negócio quer é *um contrato vigente por UC*, vigente = `ativo` ou `suspenso`. Rascunho segue livre.

Migration `20260726170000_r14_vigente_unico`. Pré-checagem na base real: nenhuma violação, aplica direto.

## 3. O índice parcial tipava a relação como 1-1, e a relação devolvia o contrato errado

O `db pull` do 7.9 ignora o predicado ao inferir cardinalidade. Como o unique cobria exatamente as colunas de `contrato_uc_fk`, `unidade_consumidora.contrato` virou to-one. Reproduzido:

```
contrato ATIVO de verdade:   0f00000a…  R$ 789,00
o que a relacao devolveu:    0f000003…  suspenso, R$ 111,00
plano: Bitmap Heap Scan, sem ORDER BY
```

Sem erro e sem log, no primeiro mês em que uma UC tiver duas linhas — ou seja, na primeira renovação.

**Editar o `schema.prisma` compila** — o validador aceita a lista mesmo com o parcial presente, ao contrário da introspecção — mas todo `db pull` reverte em silêncio. Por isso a correção é coluna gerada e unique **cheio** sobre `(tenant_id, uc_vigente)`, conjunto que não é o da FK. De brinde, `findUnique(tenant_id_uc_vigente)` = "o contrato vigente desta UC", garantido pelo banco.

Confirmado nos tipos gerados: `ContratoListRelationFilter`, `contratoCreateNestedManyWithoutUnidade_consumidoraInput`, e a chave composta nova em `"id" | "tenant_id_uc_vigente" | "tenant_id_id"`.

Virou **regra 11 do `CLAUDE.md`** e `CAT-1`/`CAT-2` em `tests/catalogo.sql`.

## 4. Índice único não é DEFERRABLE: a renovação tem ordem obrigatória

Medido: inserir o novo contrato ativo **antes** de encerrar o velho dá `23505` na mesma transação, mesmo que ela fosse terminar consistente. Com UC limpa o teste passa dos dois jeitos — por isso a ordem está escrita em `src/repos/contrato.ts` e coberta por `K8` e `K9`, em vez de virar convenção que alguém lembra.

## 5. O projeto não tinha nenhuma verificação de tipo

`node --experimental-strip-types` **apaga** anotação de tipo, não confere, e `package.json` não tinha `typescript`. Somado ao `[modelo: string]: any` de `ClientTx`, um nome de coluna errado compilava antes e depois do `generate`.

`src/db/tipado.ts` devolve os 17 modelos aos repositórios sem obrigar `contexto.ts` a conhecê-los, e o job `tipos` do CI roda `tsc --noEmit`. O primeiro `typecheck` já pegou um erro escrito nesta sessão: `valor_referencia_origem` tem dois valores, não três. O repositório agora **importa o enum** em vez de reescrevê-lo.

## 6. O teste de catálogo imprimia a falha e devolvia exit 0

O `run.sh` conferia RLS+FORCE+policy com um `SELECT` que imprimia o nome da tabela em falta. `distribuidora` — lista de referência pública, sem `tenant_id` e sem RLS, deliberado — esteve nessa lista desde a migration 10 **sem quebrar o build**. Mesmo modo de falha que o projeto persegue nas policies: sinal que não interrompe.

Agora é `tests/catalogo.sql`, suíte com `RAISE WARNING`, 6 invariantes, critério por **ter `tenant_id`** e não por nome. Verificado nos dois sentidos: contra o banco corrigido passa; contra o banco sem as migrations 11 e 12 acusa `CAT-1`, `CAT-2` e `CAT-6` nomeando os objetos.

---

## Estado dos testes

```
repos/cliente    13 checks   todas passaram
repos/contrato   10 checks   todas passaram
catalogo          6 invariantes, nenhuma falha
regras           R14, R14-b (nova) e encerrado coexistindo
tsc --noEmit     limpo
```

## Fila da próxima sessão

1. Recriar o projeto Supabase em **`sa-east-1`** e aplicar as 12 com `migrate deploy`. A migration 10 está pela metade no projeto atual (`us-west-2`): faltam `auditoria`, `distribuidora`, `app.auditar()`, os 16 triggers `auditar_*`, `acesso_plataforma_log.xact_id`, 3 FKs e 4 policies. Todo objeto ausente tem um `GRANT`/`OWNER TO` de role colado nele. Aplicar por SQL Editor foi a causa; `migrate deploy` é transacional por migration.
2. Provisionar a **role LOGIN de runtime**, membro de `app_financeiro`, sem `BYPASSRLS`. Ela não nasce em nenhuma migration, e sem ela a única opção de conexão é `postgres`, que tem `rolbypassrls = true` e anula as 24 policies.
3. Repositórios de UC, usina, originador e rateio; endpoints com a matriz de papéis.
4. Contador — o `originador_tipo` não distingue sócio, e `originador_tipo_no_fechamento` congela a classificação em cada contrato fechado.
5. POP-01 — o denominador é a base de contratos vigentes com UC homologada, não nenhum dos três números do CRM.

## Nota de método

Duas conclusões desta sessão foram retiradas depois de medidas: a de que a migration 10 tinha parado sequencialmente numa linha (`app.tarifa_vigente`, linha 404, existe; `app.auditar`, linha 195, não — não foi parada, foram blocos), e a de que as roles de aplicação não existiam (a consulta filtrava `rolbypassrls or rolsuper`, e as três são NOLOGIN sem bypassrls **por design** — nunca iam aparecer). As duas eram inferências plausíveis sobre evidência insuficiente. O padrão que se repetiu: o inventário por contagem fecha, a hipótese sobre a causa não.
