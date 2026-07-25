# ADR-0003 — Como `app.current_tenant_id()` obtém o tenant

| Campo | Valor |
|---|---|
| **Status** | Proposta — aguarda aceite |
| **Data** | 24/07/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | Questão bloqueante da `SPEC-001` §3.2 e §10 · exigência do `PRD-v2.2` §2.4 |
| **Base factual** | Spike executado em 24/07/2026 — 21 testes, PostgreSQL 16.14, `pg.Pool` |
| **Afeta** | `SPEC-001` (invariante 2 e critério 4 — **mudam**) · migration de policies · F1 inteira |
| **Artefatos** | `spike-adr0003/` — `01-schema.sql`, `02-variantes.sql`, `spike.mjs`, `run.sh` |

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

**Custo:** toda tabela referenciada ganha `UNIQUE (tenant_id, id)` redundante com a PK, e toda FK entre entidades de negócio vira composta. Nas onze tabelas da `SPEC-001`, são sete FKs a converter. Não é opcional — sem isso o invariante 2 é uma frase.

---

## Obrigações que a decisão impõe

1. **`SET LOCAL`, nunca `SET`.** Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte. É o único vazamento real que o spike produziu, e ele veio de uma palavra.
2. **Toda query dentro de transação explícita.** Fora de transação o `SET LOCAL` é descartado e a leitura devolve zero — falha fechada, mas silenciosa. Query fora de transação é bug de disponibilidade, não de segurança.
3. **Um único ponto emite o `SET LOCAL`.** Middleware ou extensão do client. Nenhum repositório, serviço ou script emite contexto à mão.
4. **Teste de vazamento no CI**, com pool de tamanho 1: requisição com contexto, seguida de requisição sem contexto, tem que ler zero. É o teste que pega o item 1 se alguém apagar o `LOCAL`.
5. **FKs compostas**, conforme acima.

---

## Riscos aceitos

**O contexto é responsabilidade da aplicação.** V1 move a garantia para o middleware. Aceito porque a alternativa que tira a garantia da aplicação (V3) **não isola**, e a que fica no banco (V2b) reintroduz leitura sem policy. Mitigado pelo teste do item 4.

**Falha silenciosa por ausência de contexto.** Sem `SET LOCAL`, tudo lê zero — sem erro. É o mesmo modo de falha do CRM, e a razão de o item 4 ser obrigatório e não recomendado.

---

## Cobertura do spike — o que não foi testado

O binário do engine do Prisma (`binaries.prisma.sh`) está fora da allowlist de rede do ambiente. O spike rodou sobre `pg.Pool`.

**Isso é suficiente para tudo que está acima:** vazamento de GUC no pool, escopo de `SET LOCAL`, semântica de policy, `FORCE`, recursão e FK são propriedades do PostgreSQL e do protocolo de conexão, não do ORM.

**Fica sem cobertura, e precisa de meia hora num ambiente com rede aberta:**

| Item | Por que importa |
|---|---|
| `prisma.$transaction()` interativo fixa a mesma conexão física para todas as queries do bloco | Se não fixar, o `SET LOCAL` roda numa conexão e a query em outra — e o resultado é **zero linhas**, não erro |
| `$extends` / middleware do Prisma consegue injetar o `SET LOCAL` antes de cada operação | É o mecanismo do item 3 |
| Comportamento sob PgBouncer em modo *transaction* | Muda o escopo de sessão e pode invalidar a variante inteira |

Nenhum desses três altera a **decisão** — alteram a implementação do middleware. Mas o primeiro é bloqueante para a F1 e deve ser fechado antes da primeira migration de policy.

---

## Consequências

| Documento | Ação |
|---|---|
| `SPEC-001` | → v2.2: invariante 2 e critério 4 reescritos com FK composta; §3.3 ganha `UNIQUE (tenant_id, id)` nas tabelas referenciadas |
| `SPEC-001` §9 | dois testes novos: `test_vazamento_contexto_no_pool`, `test_fk_composta_rejeita_cross_tenant` |
| `PRD-v2.2` §2.4 | critério "isolamento provado por teste" — **atendido**, com a ressalva de cobertura acima |
| `CLAUDE.md` | regra 2 ganha a FK composta; regra 3 fica como está |

---

## Rodapé

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 24/07/2026 | Original. Spike executado, 21 testes, três variantes |
