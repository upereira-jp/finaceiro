# ADR-0003 — Como `app.current_tenant_id()` obtém o tenant

| Campo | Valor |
|---|---|
| **Status** | **Aceita** em 24/07/2026 (decisão B1) · **revisada em 25/07/2026 — r2** |
| **Data** | 24/07/2026 · r2 em 25/07/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | Questão bloqueante da `SPEC-001` §3.2 e §10 · exigência do `PRD-v2.2` §2.4 |
| **Base factual** | Spike executado em 24/07/2026 — 21 testes, PostgreSQL 16.14, `pg.Pool`<br>Teste de `$transaction` executado em 25/07/2026 — 12 testes, Prisma 7.9.0 + `@prisma/adapter-pg`, PostgreSQL 16.14, role sem `BYPASSRLS` |
| **Afeta** | `SPEC-001` (invariante 2 e critério 4 — **mudam**; invariantes I-7 e I-8 — **novas**) · migration de policies · configuração do client · F1 inteira |
| **Artefatos** | `spike-adr0003/` — `01-schema.sql`, `02-variantes.sql`, `spike.mjs`, `run.sh`<br>`spike-transacao/` — testes de `$transaction`, `$extends`, timeout, `maxWait` e custo |
| **Decisão associada** | **B2** (24/07/2026): a FK composta entra na `SPEC-001` agora — 7 conversões |

---

## Decisão

**V1 — `SET LOCAL` por transação.** A função lê um GUC de sessão que a aplicação define no início de cada transação:

```sql
CREATE FUNCTION app.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
```

Escolhida porque **isolou em todos os testes** e é a única cujo modo de falha é *fechado*: sem contexto, lê zero. As outras duas ou falham de forma enganosa ou não isolam.

---

## O que o spike mediu

21 testes, três variantes, banco descartável com dois tenants, duas tabelas de negócio e uma tabela de controle com RLS sem policy. Reproduzível por `./run.sh`.

### V1 — `SET LOCAL` por transação

| Teste | Resultado |
|---|---|
| Isolamento por tenant | ✅ A lê 2, B lê 1 |
| Forçar `tenant_id` do outro na cláusula `WHERE` | ✅ 0 linhas |
| Role de serviço sem contexto | ✅ 0 linhas, **sem erro** — replica o defeito do CRM |
| `INSERT` com `tenant_id` do outro | ✅ bloqueado, `SQLSTATE 42501` |
| `SET LOCAL` fora de transação | ✅ 0 linhas — o GUC é descartado, **falha fechada** |
| **`SET` sem `LOCAL`** | ❌ **VAZA.** A conexão devolvida ao pool manteve o GUC; a requisição seguinte, sem contexto nenhum, leu 2 linhas do tenant A |

### V2a — `auth.uid()` + join em `usuario_tenant`, forma ingênua

❌ **`SQLSTATE 54001 — stack depth limit exceeded`** em qualquer leitura.

A função lê `usuario_tenant`; `usuario_tenant` tem `tenant_id`, logo tem policy; a policy chama a função. Recursão.

> **Correção de uma previsão minha.** Eu havia previsto `42P17 — infinite recursion detected in policy`. O erro real é `54001`, estouro de pilha. **É pior**: `42P17` nomeia o defeito de desenho; `54001` parece problema de tuning, e alguém pode "resolver" aumentando `max_stack_depth` — o que mascara a recursão em vez de eliminá-la.

### V2b — a mesma, com `SECURITY DEFINER`

| Teste | Resultado |
|---|---|
| Leitura com `auth_uid` do A | ✅ 2 linhas |
| Isolamento com `auth_uid` do B | ✅ 1 linha |
| Recursão | ✅ não ocorre |

**Funciona, e é a razão de não ser a escolhida.** `SECURITY DEFINER` faz a função ler `usuario_tenant` **ignorando a policy daquela tabela**. O privilégio que a RLS existe para eliminar não desaparece — muda de endereço, sai da role e entra numa função. É o mesmo padrão que o `P8` §2 aponta no CRM (32 tabelas alcançáveis só por credencial que ignora RLS), miniaturizado. Some-se a isso um join por avaliação de policy, em toda query.

### V3 — conexão por tenant

| Teste | Resultado |
|---|---|
| Isolamento por role | ✅ A lê 2, B lê 1 |
| Aplicação não emite `SET` | ✅ |
| **Role do tenant A emite `SET app.tenant_id` para o B** | ❌ **conseguiu, e leu a linha do B** |

**V3 não isola.** `ALTER ROLE … SET` define apenas o *default* de sessão. GUC customizado não é privilegiado: qualquer role sobrescreve o seu na própria sessão. O isolamento de V3 depende de a aplicação nunca emitir `SET` — garantia de código, não de banco. É exatamente a propriedade que se está tentando comprar com RLS.

### Achados independentes de variante

| Teste | Resultado |
|---|---|
| Ler tabela com RLS habilitada e **nenhuma policy** | **0 linhas, sem erro** — confirma o `P8` §2 no laboratório |
| Sem `FORCE`, o dono da tabela ignora a própria policy | leu **as 3 linhas**, de ambos os tenants — confirma que `FORCE` não é redundante |
| **FK simples apontando para linha de outro tenant** | ❌ **o banco ACEITOU** |

---

## O achado que muda a SPEC-001

A `SPEC-001` declara:

> **Invariante 2.** Nenhuma FK atravessa tenant. Vale para as onze tabelas com `tenant_id`.
> **Critério 4.** Nenhuma FK entre tenants distintos é aceita pelo banco.

**As duas são falsas com o schema como está.** `contrato.cliente_id REFERENCES cliente(id)` valida que o cliente existe — não que ele pertence ao mesmo tenant. O spike inseriu um contrato do tenant A apontando para um cliente do tenant B e o banco aceitou sem reclamar.

RLS não cobre isso: a policy filtra o que a *sessão* enxerga, e a verificação de FK roda **por dentro**, com privilégio de sistema.

### Correção, testada e funcionando

```sql
ALTER TABLE cliente  ADD CONSTRAINT cliente_tenant_id_uk UNIQUE (tenant_id, id);
ALTER TABLE contrato DROP CONSTRAINT contrato_cliente_id_fkey;
ALTER TABLE contrato ADD CONSTRAINT contrato_cliente_mesmo_tenant
  FOREIGN KEY (tenant_id, cliente_id) REFERENCES cliente (tenant_id, id);
```

Reexecutado o mesmo insert: **rejeitado, `SQLSTATE 23503`.**

**Custo:** toda tabela referenciada ganha `UNIQUE (tenant_id, id)` redundante com a PK, e toda FK entre entidades de negócio vira composta. **São nove FKs a converter**, e `UNIQUE (tenant_id, id)` em cinco tabelas referenciadas. Não é opcional — sem isso o invariante 2 é uma frase.

> **Correção de 25/07/2026.** A r1 deste ADR dizia **sete**. O número era estimativa, não contagem: a varredura nominal da `SPEC-001` §3.3 rende **nove**. As duas que faltavam eram `unidade_consumidora → usina` e `contrato → originador`. Duas FKs fora da conta são **dois caminhos cross-tenant abertos**, e o defeito só se manifesta com dado de dois tenants em produção. A lista nominal, que é o que serve, está na `SPEC-001` §3.4.

---

## Obrigações que a decisão impõe

1. **`SET LOCAL`, nunca `SET`.** Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte. É o único vazamento real que o spike produziu, e ele veio de uma palavra.
2. **Toda query dentro de transação explícita.** Fora de transação o `SET LOCAL` é descartado e a leitura devolve zero — falha fechada, mas silenciosa. Query fora de transação é bug de disponibilidade, não de segurança.
3. **Um único ponto emite o `SET LOCAL`.** Middleware ou extensão do client. Nenhum repositório, serviço ou script emite contexto à mão.
4. **Teste de vazamento no CI**, com pool de tamanho 1: requisição com contexto, seguida de requisição sem contexto, tem que ler zero. É o teste que pega o item 1 se alguém apagar o `LOCAL`.
5. **FKs compostas**, conforme acima.
6. **O middleware reconstrói a operação no client de transação** — `tx[model][operation](args)`, nunca `query(args)`. Medido: a segunda forma devolve zero linhas em silêncio.
7. **`$transaction` não aninha.** Transação aberta de dentro de transação toma conexão nova e não herda o contexto.

---

## Obrigações de configuração (r2)

A decisão V1 converte **todo acesso a dado de negócio em transação interativa**. Isso tem dois tetos de tempo em valor default e um custo de round trip, todos medidos. Nenhum deles fica em default.

1. **`timeout: 15000` e `maxWait: 5000` explícitos** em toda `$transaction`. Os defaults são 5.000 ms e 2.000 ms.
   Justificativa medida: uma leitura de 6 s falhou com `P2028` em **6.106 ms** — ou seja, o banco concluiu o trabalho e só então o cliente recusou o commit. **O timeout não cancela a query, recusa o commit.** Para escrita isso significa trabalho feito e desfeito; para leitura, custo pago e erro na mão.
2. **Pool com teto declarado**, conferido contra o `max_connections` do PostgreSQL compartilhado com o CRM. Medido: com `maxWait` default e pool de 1, uma segunda requisição concorrente falhou em **2.002 ms** com `P2028 — Unable to start a transaction in the given time`. Num VPS de 1 vCPU esse é o modo de falha sob carga, não hipótese.
3. **Leitura de relatório não usa o middleware genérico.** Caminho próprio: contexto emitido uma vez por bloco e timeout dimensionado ao relatório. Relatório financeiro que passe de 5 s morre no caminho genérico.
4. **Custo aceito e registrado: 1 round trip vira 4.** Mesma query, 500 iterações, localhost, pool 5, três execuções:

   | Forma | ms/op (faixa) | Fator |
   |---|--:|--:|
   | query direta, sem transação | 0,49 – 0,75 | 1,0x |
   | transação + query, sem `SET LOCAL` | 0,89 – 1,38 | **1,8x** (estável nas três) |
   | transação + `SET LOCAL` + query | 1,47 – 1,68 | **2,2x – 3,0x** |

   O `BEGIN`/`COMMIT` responde por 1,8x de forma estável; o `SET LOCAL` acrescenta o restante e é o componente que varia. **O número absoluto de localhost não é a régua** — a grandeza que governa é a contagem de round trips, que sai de 1 para 4. Em rede real, multiplique por RTT, não por este ms.

---

## Invariantes que este ADR cria

Vão para a `SPEC-001` §9 com teste automatizado, conforme a regra 8 do `CLAUDE.md`.

| Ref | Invariante | Teste |
|---|---|---|
| **I-7** | `$transaction` não aninha | Transação aberta de dentro de transação deve **falhar em desenvolvimento**, não devolver vazio. Medido: pega conexão nova, não herda o contexto e lê zero linhas sem erro — o mesmo modo de falha que a regra 3 do `CLAUDE.md` manda perseguir por catálogo, porque resultado vazio não aparece em log |
| **I-8** | O middleware reconstrói a operação no client de transação | Teste que quebra se `tx[model][operation](args)` for trocado por `query(args)` |

---

## Riscos aceitos

**O contexto é responsabilidade da aplicação.** V1 move a garantia para o middleware. Aceito porque a alternativa que tira a garantia da aplicação (V3) **não isola**, e a que fica no banco (V2b) reintroduz leitura sem policy. Mitigado pelo teste do item 4.

**Falha silenciosa por ausência de contexto.** Sem `SET LOCAL`, tudo lê zero — sem erro. É o mesmo modo de falha do CRM, e a razão de o item 4 ser obrigatório e não recomendado.

**PgBouncer em modo *transaction* (r2).** Não testado. Muda o escopo de sessão e pode invalidar a variante inteira. Fora do escopo da F1 por decisão; se o PgBouncer entrar no caminho de conexão, **este ADR reabre** antes de qualquer outra coisa.

**A omissão do `LOCAL` não é impedível pelo banco (r2).** Medido sob Prisma: `SET` sem `LOCAL` numa transação, pool de 1, e a requisição seguinte sem contexto leu 2 linhas. O `LOCAL` é a única barreira e o PostgreSQL não tem como exigi-lo. É isso que torna o ponto único de emissão (obrigação 3) e o teste de vazamento (obrigação 4) **obrigatórios, não recomendados**.

---

## Cobertura — o que o teste de `$transaction` fechou (r2)

O spike de 24/07 rodou sobre `pg.Pool`, porque o binário do engine do Prisma (`binaries.prisma.sh`) está fora da allowlist de rede do ambiente. Isso foi suficiente para tudo que está acima: vazamento de GUC no pool, escopo de `SET LOCAL`, semântica de policy, `FORCE`, recursão e FK são propriedades do PostgreSQL e do protocolo de conexão, não do ORM.

As três lacunas declaradas em 24/07 foram atacadas em 25/07 com o Prisma 7.9.0 sobre o adapter `@prisma/adapter-pg` — que não usa engine Rust e por isso dispensa o binário bloqueado.

| Hipótese registrada em 24/07 | Veredito em 25/07 |
|---|---|
| `prisma.$transaction()` interativo fixa a mesma conexão física para todas as queries do bloco | **Confirmada.** Quatro queries no mesmo bloco, pool de 5, um único `pg_backend_pid`. Mecanismo verificado no código do adapter: `startTransaction()` chama `pool.connect()` e entrega esse client à transação inteira; `commit()` e `rollback()` chamam `release()` |
| `$extends` / middleware consegue injetar o `SET LOCAL` antes de cada operação | **Refutada na forma descrita.** Um hook `$allOperations` que emite o `SET LOCAL` e depois chama `query(args)` devolve **zero linhas**: o hook não consegue rebindar a operação para uma transação que ele próprio abriu. A forma que funciona **reconstrói** a operação no client de transação — `tx[model][operation](args)` — e isola corretamente (2 linhas para o tenant A, 1 para o B, em execuções concorrentes) |
| Comportamento sob PgBouncer em modo *transaction* | **Continua não testado.** Segue como risco aceito, agora explicitamente fora do escopo da F1 |

Medições auxiliares que sustentam a seção seguinte:

| Medida | Valor |
|---|---|
| `SET LOCAL` fora de transação, pool de 5 e de 1 | 0 linhas em ambos — a causa é o `LOCAL`, não o pool |
| `SET` sem `LOCAL` dentro de transação, pool 1, requisição seguinte sem contexto | **2 linhas.** Vazamento do spike reproduzido sob Prisma |
| `SET LOCAL` no mesmo cenário | 0 linhas |
| `INSERT` com `tenant_id` de outro tenant sob contexto válido | rejeitado, `SQLSTATE 42501` |
| Seis transações concorrentes alternando dois tenants, pool 4 | isolamento correto em todas |
| `$transaction([...])` em lote | também fixa a conexão |
| `$transaction` aberta de dentro de outra `$transaction` | conexão nova, **contexto não herdado**, 0 linhas, sem erro |

---

## Consequências

| Documento | Ação |
|---|---|
| `SPEC-001` | → v2.2: invariante 2 e critério 4 reescritos com FK composta; §3.3 ganha `UNIQUE (tenant_id, id)` nas tabelas referenciadas; **§3.2 ganha o contrato do middleware** (obrigação 6) e as invariantes I-7 e I-8 |
| `SPEC-001` §9 | quatro testes novos: `test_vazamento_contexto_no_pool`, `test_fk_composta_rejeita_cross_tenant`, `test_transacao_nao_aninha`, `test_middleware_recria_operacao_no_tx` |
| `PRD-v2.2` §2.4 | critério "isolamento provado por teste" — **atendido**, sem ressalva de cobertura para `$transaction`; a ressalva restante é PgBouncer |
| `CLAUDE.md` | regra 2 ganha a FK composta; regra 3 fica como está |
| Configuração do client | `timeout`, `maxWait` e teto de pool explícitos, conforme "Obrigações de configuração" |

---

## Rodapé

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 24/07/2026 | Original. Spike executado, 21 testes, três variantes |
| **r2** | **25/07/2026** | Contagem de FKs corrigida de sete para **nove** (lista nominal na `SPEC-001` §3.4). Status → Aceita (B1). Lacuna do `$transaction` fechada com 12 testes: fixação de conexão **confirmada**, hipótese do `$extends` **refutada na forma descrita** e substituída pela reconstrução da operação no `tx`. Novas: seção de obrigações de configuração (`timeout` 5.000 e `maxWait` 2.000 são default e não servem), invariantes I-7 e I-8, dois riscos aceitos. PgBouncer segue sem cobertura |
