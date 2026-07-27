# Como fechar a F1 — roteiro executável

| Campo | Valor |
|---|---|
| **Escrito em** | 27/07/2026, fim da sessão 8 |
| **Para quem** | Vinicius (todos os passos exigem credencial que o Claude Code não tem) |
| **Depois disto** | os três critérios de saída da F1 no `PRD-v2.2` §10 fecham |

> **Vocabulário, porque é onde a regra 6 se paga.** O `tenant` criado no passo 2 é a
> empresa dentro do **financeiro**. Não tem relação com o tenant do CRM. O
> identificador deles, `crm_tenant_id`, aparece em **uma** coluna de **uma**
> tabela (`conector_crm`) e é usado por **um** módulo (o conector).

---

## Antes de começar

Todo script de provisionamento desta lista exige `modo=ensaio` ou `modo=valendo`,
sem default. **Rode sempre o ensaio primeiro** — ele executa tudo, mostra o
resultado e dá `ROLLBACK`. É como toda prova de escrita deste projeto rodou desde
a sessão 6.

```bash
cd /workspaces/finaceiro
set -a && . ./.env && set +a     # carrega DIRECT_URL e DATABASE_URL
```

---

## Passo 1 — o primeiro `plataforma_admin`

Nasce por `psql` porque `app_financeiro` **não tem `INSERT`** em `plataforma_admin`
(revogado na migration 10, seção 4, depois do furo de autopromoção). Criar tenant
exige o tier; o tier exige uma linha que a aplicação não alcança.

A conta no Supabase Auth já existe: `efcc8e11-e2cf-4079-a649-92798fefdfc7`.

```bash
# ENSAIO
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v modo=ensaio \
  -v auth_user_id='efcc8e11-e2cf-4079-a649-92798fefdfc7' \
  -v nome='Vinicius Leal' -v email='lealvbl@gmail.com' \
  -f scripts/bootstrap-plataforma-admin.sql

# VALENDO — só depois de o ensaio sair limpo
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v modo=valendo \
  -v auth_user_id='efcc8e11-e2cf-4079-a649-92798fefdfc7' \
  -v nome='Vinicius Leal' -v email='lealvbl@gmail.com' \
  -f scripts/bootstrap-plataforma-admin.sql
```

**O que confirma que deu certo:** o script imprime `app.resolver_login()` com
`tier = plataforma_admin` e duas linhas de trilha.

---

## Passo 2 — o tenant do financeiro, o vínculo e o conector

**Confira o CNPJ antes de rodar** — ele tem `UNIQUE` e é o que identifica a
empresa. Só dígitos, sem máscara.

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v modo=ensaio \
  -v auth_user_id='efcc8e11-e2cf-4079-a649-92798fefdfc7' \
  -v razao_social='G3 Solar' \
  -v cnpj='<14 digitos, sem mascara>' \
  -v crm_tenant_id='d4640f4b-f833-4a80-a4db-ccced1956ae4' \
  -v credencial_ref='vault://crm/financeiro_ro' \
  -f scripts/provisionar-tenant.sql
```

Depois o mesmo com `modo=valendo`.

**O que confirma:** `resolver_login` passa a devolver `tier=plataforma_admin`
**e** uma linha com `papel = admin` no tenant. É por esse vínculo que o ciclo abre
contexto — sem ele, `policy_exige_vinculo` recusa e a leitura devolve zero.

> `credencial_ref` é **referência**, não segredo (regra 5). A senha do
> `financeiro_ro` vai para o `.env` no passo 3, nunca para coluna.

---

## Passo 3 — a credencial de leitura do CRM

**Não cole a senha em conversa nenhuma.** Escreva direto no `.env`:

```bash
printf '\nCRM_DATABASE_URL="postgresql://financeiro_ro:SENHA@HOST.pooler.supabase.com:5432/postgres"\nPOOL_CRM=2\n' >> .env
```

Host e porta saem do botão Connect do dashboard do CRM — **session pooler na
5432**, pelo mesmo motivo do `DIRECT_URL`: a 6543 é transaction pooler.

---

## Passo 4 — o primeiro ciclo, em ensaio

```bash
npm run ciclo -- --ensaio --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7
```

**A leitura do CRM acontece de verdade e os contadores são reais.** O `ROLLBACK`
no fim desfaz só a gravação. Espere ver algo próximo de:

```
CRM:  conectado como "financeiro_ro"
      views legiveis: 8
      views com coluna de tenant: 8          <- invariante 9 vai rodar
      privilegio de infraestrutura (Q-PGNET-01): net.http_request_queue (ESCRITA), ...
--- resultado ---
  status ......... ok
  lidos .......... 48
  criados ........ 41                        <- 48 menos os 7 de Parceiros
  recusados ...... 0
  garantia de tenant degradada: false        <- tem que ser false
```

**O que olhar, em ordem de importância:**

| Sinal | O que significa |
|---|---|
| `garantia de tenant degradada: true` | alguma view perdeu `crm_tenant_id`. **Pare** e fale com o dev do CRM |
| `status: erro` com "zero linhas" | a view devolveu vazio. **Não reconciliou nada, de propósito** (§7) — é o caso que apagaria a carteira |
| `recusados > 0` | alíquota ambígua ou ganho sem valor. O motivo vem impresso; conserta-se no CRM, não aqui |
| `fila de revisao humana` | ausência que não é arquivo nem cópia derivada. Exige olhar |

---

## Passo 5 — o ciclo valendo, e a prova de idempotência

```bash
npm run ciclo -- --valendo --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7
npm run ciclo -- --valendo --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7   # de novo
```

**A segunda execução é o critério de saída da F1**, não uma conferência extra.
Ela tem que sair com:

```
criados ........ 0
atualizados .... 0
```

Qualquer número diferente de zero na segunda passada significa que a
idempotência (R3) não vale contra dados reais — e o modo de falha é silencioso:
o contador diria "atualizados: N" e ninguém desconfiaria, porque atualizar é o
que um sincronizador faz. Foi assim que o teste `N10` pegou a comparação de
`Decimal` como texto.

---

## Passo 6 — fechar a verificação

```bash
npm test                                          # 284 verificacoes, EXIT=0
psql "$DIRECT_URL" -f tests/catalogo.sql          # os 8 invariantes CONTRA PRODUCAO
```

O segundo comando é leitura pura e **não** roda no `npm test`: a suíte usa
PostgreSQL local, que não tem o event trigger da plataforma Supabase. Foi
exatamente essa divergência que escondeu a `Q-DISTRIB-01`.

---

## Onde a F1 fica depois disso

| Critério de saída (`PRD` §10) | Fecha com |
|---|---|
| `migrate reset` limpo | ✅ já fechado — 15 migrations em banco vazio a cada `npm test` |
| sync idempotente | **passo 5**, segunda passada com 0 criados e 0 atualizados |
| escrita no CRM falha por permissão | ✅ já fechado — `N21` (guarda de arranque) e `N25` (sessão read-only) |

**Restam duas coisas que não são critério de saída, e você decide se seguram a fase:**

1. **`Q-FASE-01`** — o `PRD` §10 põe o conector na F1; a `SPEC-002` diz F2. A
   decisão é sua, e agora dá para tomá-la vendo o conector pronto.
2. **`dono_usina` sem repositório** — é cadastro, e `usina.dono_usina_id` já
   aponta para lá. `regra_comissao`, `regra_repasse` e `tarifa` também não têm
   repositório, mas são consumidos por F2/F3, não por F1.

---

## Depois de fechar, três itens de higiene

- **Rotacione a `service_role` do Supabase do financeiro.** Ela foi colada na
  conversa da sessão 8 e tem poder total no projeto.
- **`git rm --cached financeiro-sessao-5.patch`** — está versionado na raiz desde
  antes do `.gitignore` cobrir `*.patch`.
- **Apagar o projeto Supabase antigo** (`us-west-2`).

---

## O que fica em aberto, com dono

Lista completa em `QUESTOES.md`. As que nasceram na sessão 8:

| ID | Dono | Uma linha |
|---|---|---|
| `Q-PGNET-01` | dev do CRM | `pg_net` concede `arwdDxtm` a `PUBLIC`; tratado do nosso lado, endurecimento é opcional lá |
| `Q-PROV-01` | Vinicius | criar tenant não tem caminho de aplicação, e abrir um exige desenho novo |
| `Q-FASE-01` | Vinicius | conector é F1 ou F2 |
