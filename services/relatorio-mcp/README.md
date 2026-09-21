# financeiro-relatorio-mcp

Camada de **leitura do Financeiro para IA**. Conecta ao Postgres do financeiro
**exclusivamente como a role `relatorio_ai`** — que só enxerga o schema
`relatorio` (espelho das tabelas + agregados + uma ficha com PII). Nenhuma outra
credencial mora aqui: sem `postgres`, sem `app_financeiro_login`, sem certificado
A1, sem token Sicoob.

É o irmão do `intreply-reporting-mcp` (conector do CRM, que roda no PM2 do root,
em `/opt/intreply-wt-reporting-mcp`). Mesmo desenho, outro banco, outro usuário,
outro ciclo de vida — **de propósito**: `pm2 restart all` de quem mantém o CRM
não pode derrubar isto, e vice-versa.

## 0. O que este serviço NÃO resolve (de propósito)

- **Não escreve.** A role é read-only por privilégio *e* por
  `default_transaction_read_only`. "IA que emite boleto" não é um patch aqui: é
  outro projeto, com aprovação humana no meio e ADR próprio.
- **Não entrega meio de pagamento nem segredo.** Chave PIX, banco/agência/conta,
  `credencial_ref`, linha digitável, código de barras, PIX copia-e-cola e os
  payloads de integração **não existem nas views** — nem com `pii=true`. Quem
  tem esses campos recebe no lugar da empresa ou paga em nome dela; relatório
  não precisa deles.
- **Não converte dinheiro para reais.** `CLAUDE.md` 1: centavos em toda camada.
  Toda resposta carimba `meta.unidade_monetaria = "centavos"`.
- **O corte por tenant é do SERVIÇO, não do banco.** As views carregam todos os
  tenants; quem recorta é `identity.tenants`. Hoje isso é inócuo (uma identidade,
  o dono). Passa a importar **no dia em que existir identidade de tenant único**:
  aí quem tiver a credencial do banco por fora contorna o corte. Se isso
  acontecer, o caminho é RLS nas views ou função de listagem com escopo —
  decidir *antes* de emitir a primeira identidade externa.

## 1. As duas faces

| Face | Rota | Consumidor |
|---|---|---|
| **MCP** (Streamable HTTP) | `POST/GET/DELETE /mcp` | connector do claude.ai (OAuth) |
| **REST** | `POST /v1/report` `{name, params}` · `GET /v1/reports` | backend, outra LLM (bearer estático) |

`GET /health` é a única rota sem auth. As duas faces passam pelo mesmo runner:
mesma identidade, mesma trava de tenant, mesmo gate de PII, mesma trilha.

## 2. Superfície de dados

Três camadas, todas em `relatorio.*` (SQL em `sql/`, fonte da verdade):

1. **Espelho** — uma view por tabela do financeiro. É o "ler todos os dados":
   `fatura`, `boleto`, `liquidacao`, `split_execucao`, `split_item`,
   `conta_pagar`, `pagamento`, `contrato`, `cliente`, `unidade_consumidora`,
   `usina`, `usina_geracao`, `dono_usina`, `originador`, `regra_*`,
   `registro_fatura_unificada`, `conector_*`, `agenda_execucao`, `auditoria`,
   trilhas de acesso, e o cadastro de cobrança.
2. **Agregados** — `faturamento_mes`, `recebimento_mes`, `inadimplencia`,
   `repasse_comissao_mes`, `geracao_x_consumo_mes`, `carteira`. A consistência do
   número mora no SQL, uma vez, e não na cabeça do modelo a cada pergunta.
3. **`cobertura_dados`** — a metaview: onde o número é confiável e por quê
   (frescor, UC sem tarifa, cliente sem documento, rateio acima de 100%,
   certificado A1 vencendo, espelho do CRM parado). Os relatórios que dependem
   dessas métricas já trazem `meta.confiabilidade` embutido.

### Tools

| Tool | Para quê |
|---|---|
| `tenants` | empresas no escopo desta identidade — todo `tenant_id` sai daqui |
| `tabelas` | catálogo: o que existe, o que significa, quais colunas, se aceita período |
| `consultar` | linhas de qualquer tabela, com filtro, período, ordenação e paginação |
| `contar` | agrupa e soma **no banco** (até 4 colunas) — é o caminho de "quanto/quantos" |
| `faturamento_mes` · `recebimento_mes` · `inadimplencia` · `repasses_comissoes` · `geracao_x_consumo` · `carteira` · `cobertura_dados` | atalhos nomeados para os agregados |
| `ficha_cliente` | **única** superfície de PII. Exige `pii=true` e sai destacada na trilha |

O catálogo é lido **do banco** no arranque (`comment on view` + colunas do
`pg_attribute`). Consequências: coluna nova aparece sem tocar no TypeScript; e a
lista de colunas vira *allowlist* de filtro e ordenação — é o que permite montar
SQL com nome de coluna sem abrir injeção (valor vai sempre por bind).

### PII e mascaramento

Consulta de rotina vê `documento_mascarado` (3 últimos dígitos),
`telefone_mascarado`, `email_mascarado` e endereço no grão **município/UF**. O
dado inteiro só sai por `relatorio.fn_ficha_cliente(tenant, cliente)` —
`SECURITY DEFINER` com trava lógica de tenant (par que não casa devolve vazio),
lista de campos **enumerada** (coluna nova não entra na ficha sem edição
deliberada do SQL) e linha própria na trilha com o `cliente_id`.

## 3. Identidades

```json
[{"token":"<openssl rand -hex 32>","label":"dono","tenants":["*"],"pii":true}]
```

- `tenants`: UUIDs de tenant do financeiro. O literal `"*"` significa "todos os
  do banco", **resolvido no arranque** — conveniência consciente para o dono,
  com o preço declarado: tenant novo entra no escopo no próximo restart, sem ato
  deliberado. Identidade de terceiro **nunca** usa `"*"`.
- `pii`: libera `ficha_cliente`. Terceiro entra com `pii=false` até existir DPA.

## 4. Deploy — a ordem é porta-antes-da-senha

### 4.0 Banco (primeiro de tudo)

Com credencial de **owner** (`postgres`), no SQL Editor do painel Supabase do
projeto **do financeiro**, nesta ordem:

```
sql/01-fundacao.sql            schema relatorio, role relatorio_ai (NOLOGIN), máscaras
sql/02-espelho-cadastro.sql    views de cadastro
sql/03-espelho-movimento.sql   views de movimento e operação
sql/04-agregados-e-ficha.sql   agregados, cobertura_dados, fn_ficha_cliente
sql/05-grants-e-conferencia.sql grants + conferência de catálogo (rode por último)
sql/06-conferir.sql             conferência que DEVOLVE LINHAS (o painel engole `RAISE NOTICE`)
```

Tudo é idempotente (`create or replace`, `if not exists`) e transacional —
coluna errada aborta o arquivo inteiro, sem estado pela metade. **Rode o `05` de
novo a cada view nova**: não há `default privileges` aqui de propósito (view sem
grant é view invisível, que é a versão de banco do *fail-closed*).

### 4.1 Ordem de produção

1. **Fechar a porta primeiro.** O serviço escuta em `127.0.0.1:8788`. Só expor
   junto com nginx + TLS — o bearer viaja no header.
2. CA do Postgres em `/etc/financeiro/supabase-prod-ca.crt` (Supabase Root 2021
   CA; vale para qualquer projeto). O serviço **não sobe sem ele**: este canal
   carrega a saída da ficha, e TLS sem verificação cifra mas não autentica.
3. Subir com `.env` real, `DATABASE_URL` ainda com placeholder.
4. **Só então** ativar a credencial, no banco:
   `alter role relatorio_ai login password '<senha-forte>';`
5. Pôr a senha no `.env` e reiniciar.

### 4.2 systemd (não é PM2, ver o cabeçalho da unidade)

```bash
sudo install -m 644 /opt/financeiro/app/deploy/financeiro-relatorio-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-relatorio-mcp
journalctl -u financeiro-relatorio-mcp -f
```

O arranque **confere a role antes de escutar**: sem `SUPERUSER`, sem
`BYPASSRLS`, sem escrita em objeto nenhum, nada legível fora de `relatorio`.
Qualquer um desses falha e o processo sai com 1 — o systemd tenta de novo. É o
mesmo desenho de `src/crm/conexao.ts`, virado para dentro: o modo de falha que
isto impede não é alguém escrever de propósito, é a `DATABASE_URL` apontar um
dia para uma role com mais poder do que devia.

### 4.3 nginx + TLS

`nginx-relatorio-financeiro.conf` é a fonte; `/etc/nginx/sites-available/` é a
cópia. Precisa de **registro DNS** do subdomínio apontando para esta máquina
**antes** do certbot.

```bash
sudo install -m 644 /opt/financeiro/app/services/relatorio-mcp/nginx-relatorio-financeiro.conf \
                    /etc/nginx/sites-available/relatorio-financeiro.blackhaus.io
sudo ln -s /etc/nginx/sites-available/relatorio-financeiro.blackhaus.io /etc/nginx/sites-enabled/
sudo certbot certonly --webroot -w /var/www/certbot -d relatorio-financeiro.blackhaus.io
sudo nginx -t && sudo systemctl reload nginx
```

### 4.4 Trilha de auditoria

Toda chamada emite `[audit]` no journal: identidade (label, **nunca** o token),
tool, tenant, nº de linhas e duração. `ficha_cliente` sai destacada com o
`cliente_id` — é ela que reconstitui "quem abriu a ficha de quem". As decisões de
auth entram na mesma trilha (senha errada, IP travado, rotação de refresh, reuso
detectado, revogação).

## 5. Connector do claude.ai (OAuth)

O connector custom fala MCP por Streamable HTTP e, sem o beta de header estático,
só oferece **OAuth**. O serviço liga a face OAuth quando há `PUBLIC_BASE_URL` +
`OAUTH_LOGIN_PASSWORD`: DCR (`/register`) faz o connector se registrar sozinho —
os campos "Client ID/Secret" do formulário ficam **em branco** —, `/authorize`
devolve uma tela de senha (com balde de tentativas por IP), o PKCE é validado
pelo SDK, o access token vale 1h e o refresh tem **vida absoluta que a rotação
não reinicia**, rotação a cada uso e revogação da família inteira em caso de
replay.

Em **Settings → Connectors → Add custom connector**, URL:
`https://relatorio-financeiro.blackhaus.io/mcp`.

## 6. Reverter

- **Serviço**: `sudo systemctl disable --now financeiro-relatorio-mcp`. Kill
  switch sem desfazer nada: `systemctl stop`.
- **nginx**: remover o symlink de `sites-enabled` e recarregar.
- **Banco**:

```sql
begin;
reassign owned by relatorio_ai to postgres;
drop owned by relatorio_ai;
drop role if exists relatorio_ai;
drop schema if exists relatorio cascade;
commit;
```

Nada fora daqui depende disto: não há rota do app, job ou migration apontando
para o schema `relatorio`.

## 7. Isolamento no repositório

Pacote npm **independente**: `npm install` e `npm run build` rodam aqui dentro,
com o Node 22 próprio (`/opt/financeiro/node/bin/node`), sem tocar `src/`,
`prisma/` nem o `package.json` da raiz. O `.env` é próprio. A suíte
(`tests/run.sh`) não conhece este diretório — e as invariantes de catálogo
(`tests/catalogo.sql`, CAT-4) varrem só `public` e `app`, então as views deste
schema não as fazem falhar. **Isso não é licença**: view nova em `public`/`app`
continua exigindo `security_invoker = true`.
