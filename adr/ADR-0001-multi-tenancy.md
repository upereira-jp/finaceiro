# ADR-0001 — Estratégia de multi-tenancy

| Campo | Valor |
|---|---|
| **Status** | **Aceita** · escrita retroativamente em 25/07/2026 |
| **Data** | 25/07/2026, cobrindo decisão tomada antes de 23/07/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | A última citação órfã do corpus |
| **Revisada por** | `ADR-0002` r2 (modelo de tenant e de cliente) · `ADR-0003` r2 (mecanismo de contexto) |

> **Por que este documento existe, e por que ele é honesto sobre isso.**
>
> O `ADR-0002` declara `Revisa: ADR-0001` e o `CLAUDE.md` regra 2 deriva dessa cadeia. O `ADR-0001` **nunca chegou** ao repositório. Ou seja: a regra mais alta do projeto ancorava num documento que ninguém tinha — a mesma classe de defeito que o `CLAUDE.md` fantasma, e que custou uma sessão inteira em 24/07.
>
> **Não estou reconstruindo o original.** O original está perdido. Este documento registra a decisão que **todo o corpus sobrevivente pressupõe**, com a proveniência de onde cada parte foi lida. Onde a inferência é minha e não há fonte, está marcado.

---

## Contexto

O financeiro atende mais de uma empresa do grupo no mesmo sistema, e o dado de uma não pode alcançar a outra em nenhuma circunstância. Isolamento é requisito de produto, não de infraestrutura: uma falha aqui não degrada, ela vaza para fora da empresa.

O CRM ao lado é multi-tenant no mesmo padrão, e serviu de laboratório — inclusive dos erros.

## Decisão

**Banco único, schema único, isolamento por linha.**

| Dimensão | Decisão |
|---|---|
| Bancos | **Um** para todos os tenants |
| Schemas | **Um** (`public`) para dado de negócio |
| Discriminador | Coluna `tenant_id uuid NOT NULL` em toda entidade de negócio |
| Aplicação do isolamento | **Row Level Security do PostgreSQL**, não filtro na aplicação |
| Identidade do tenant | UUID **próprio do financeiro**, não o UUID do CRM — `ADR-0002` r2 Decisão 1 |

### Proveniência de cada parte

| Parte | Fonte |
|---|---|
| `tenant_id` em toda entidade | `PRD-v2.2` §2 · `SPEC-001` §3 e invariante 1 |
| Índice único de negócio composto com `tenant_id` | `SPEC-001` §3 |
| RLS como mecanismo, não filtro de aplicação | `SPEC-001` §3.2 e invariante 3 |
| UUID próprio, não o do CRM | `ADR-0002` r2 Decisão 1 |
| Banco e schema únicos | *[inferência]* — nenhum documento afirma isso literalmente, mas todo o corpus pressupõe: a `SPEC-001` §3.2 discute policies e função de contexto, que só fazem sentido com schema compartilhado; e a própria §3.2 registra que schema-por-tenant ou banco-por-tenant "apagariam a coluna" |

## Alternativas descartadas

**Banco por tenant.** Isola por construção e não precisa de RLS. Descartada: migration passa a ser N migrations, `max_connections` multiplica por tenant — e o `ADR-0004` põe o app num host de 1 vCPU —, e relatório consolidado do grupo vira federação. O custo operacional aparece no primeiro tenant novo, não no décimo.

**Schema por tenant.** Meio-termo aparente. Descartada pelo mesmo motivo multiplicado por menos: continua N migrations, e o Prisma não modela schema dinâmico sem gerar client por tenant.

**Filtro na aplicação, sem RLS.** Descartada, e é a mais importante das três. O filtro depende de **toda query lembrar**. RLS depende de **uma policy existir**. A diferença não é estilo: é onde mora a falha. *[inferência minha, não de documento]* — mas com apoio medido: o `ADR-0003` mediu que **FK simples atravessa tenant e o banco aceita**, ou seja, mesmo com todas as queries corretas o schema permitia referência cruzada. Filtro na aplicação nunca teria pego isso.

## Consequências, e como foram pagas

Um ADR de 23/07 não podia saber o preço. O corpus posterior descobriu, e o registro fica aqui para que a cadeia de derivação feche:

| Consequência | Onde foi resolvida |
|---|---|
| RLS habilitada **não é** RLS aplicada — sem policy, nega tudo em silêncio | `SPEC-001` invariante 3 e teste de catálogo. Medido no CRM: **81 das 151** tabelas nesse estado, 49 de backup e 32 operacionais (`P8` §2) |
| O dono da tabela **ignora** RLS, e migration roda como dono | `FORCE ROW LEVEL SECURITY` obrigatório — `SPEC-001` §3.2 |
| `tenant_id` na coluna **não impede** FK cruzando tenant | **FK composta `(tenant_id, id)`** — `ADR-0003`, `SPEC-001` §3.4, nove conversões |
| Pool com role única não carrega contexto de usuário | `SET LOCAL`/`set_config` por transação — `ADR-0003` r2 |
| Todo acesso vira transação interativa, com custo e dois tetos de tempo | `SPEC-001` §3.2, obrigações de configuração e dois pools |
| Tabelas **sem** `tenant_id` (`tenant`, `usuario`, `plataforma_admin`) ficam fora do discriminador e vazam existência | Policies próprias na migration 3 — `SPEC-001` R1 |

## Riscos aceitos

**Uma policy errada vaza tudo.** É o preço de centralizar o isolamento num mecanismo. Mitigação: policy única por tabela, invocando **apenas** `app.current_tenant_id()` (`SPEC-001` invariante 4), verificação por catálogo no CI, e teste de vazamento com pool de tamanho 1.

**Dado de dois tenants no mesmo backup e no mesmo `pg_dump`.** Aceito. Consequência prática: nenhum dump é entregável a um tenant sem filtro.

**Deduplicação de cliente por documento entre tenants é impossível por desenho.** Registrado como escolha, não limitação — cruzar documento entre tenants violaria o isolamento que o sistema existe para garantir (`SPEC-001` §11).

---

## Rodapé

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 25/07/2026 | Escrita retroativa. Não reconstrói o original perdido: registra a decisão que o corpus sobrevivente pressupõe, com proveniência por parte e as inferências marcadas. Fecha a última citação órfã do repositório |
