# ADR-0007 — Como a IA lê o financeiro

| Campo | Valor |
|---|---|
| **Status** | ✅ **ACEITA em 21/09/2026** por Vinicius Leal — as três decisões respondidas antes de existir código |
| **Data** | 21/09/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | "conectar o financeiro ao Claude como o CRM já está" |
| **Base factual** | `intreply-reporting-mcp` em produção desde 21/07/2026 (`/opt/intreply-wt-reporting-mcp`) · `prisma/schema.prisma` (39 tabelas) · `tests/catalogo.sql` CAT-3 e CAT-4 · `src/crm/conexao.ts` |
| **Afeta** | schema novo `relatorio` no banco do financeiro · role nova `relatorio_ai` · `services/relatorio-mcp/` · `deploy/financeiro-relatorio-mcp.service` |
| **Não afeta** | nenhuma tabela, policy, migration ou rota do app. A camada é aditiva e removível por `drop schema ... cascade` |

---

## 1. O problema

O CRM ao lado responde pergunta por chat desde 21/07: um serviço MCP lê views
agregadas por uma role que só enxerga o schema de relatório. O financeiro não
tinha equivalente — **toda pergunta sobre dinheiro virava consulta à mão ou
planilha exportada**, e a resposta chegava sem qualquer marca de quão confiável
era o número.

Copiar o desenho do CRM resolve a parte de infraestrutura. Não resolve três
escolhas que são **deste** domínio, e as três foram decididas antes de haver
código.

## 2. Decisão 1 — a superfície é o espelho inteiro, não um conjunto de relatórios

O conector do CRM expõe dezesseis relatórios fechados. Aqui a escolha foi
**uma view por tabela** (todas as 39 cobertas) **mais** seis agregados e a
metaview de cobertura.

**Por quê:** pergunta financeira não tem grão único. "Quanto entrou em agosto",
"quem não pagou", "quanto devo ao dono da usina" e "essa usina está
sobrevendida" não cabem no mesmo relatório, e um conjunto fechado envelhece para
o lado errado: o que não está na view **não existe** para quem pergunta, e a
falta não aparece — a resposta vem vazia, não vem erro.

**O que se paga por isso:** superfície maior. Mitigado por (a) `contar`, que
agrega no banco em vez de paginar milhares de linhas no chat, e (b) agregados
nomeados, para a pergunta comum não depender de o modelo montar a soma certa.

## 3. Decisão 2 — PII atrás de porta, meio de pagamento fora da casa

Três camadas, e a do meio é a que costuma faltar:

| Dado | Onde aparece |
|---|---|
| Documento, telefone, e-mail, endereço de rua | **mascarado** nas views (3 últimos dígitos, município/UF) |
| O mesmo, inteiro | só em `relatorio.fn_ficha_cliente`, com gate `pii` na identidade e linha própria na trilha com o `cliente_id` |
| Chave PIX, banco/agência/conta, `credencial_ref`, linha digitável, código de barras, PIX copia-e-cola, payload de integração | **em lugar nenhum**, nem com `pii=true` |

**Por quê a terceira linha:** quem tem esses campos **recebe no lugar da empresa
ou paga em nome dela**. Não é dado sensível: é instrumento. Relatório não precisa
dele para nada, e "só para conferir" é como ele acaba num log de chat. A regra 5
já dizia que segredo mora em cofre e é acessado por referência; aqui a referência
também não sai — sai truncada em `v_cofre_acesso_log`, porque ela aponta para
segredo.

A lista de campos da ficha é **enumerada** no SQL: coluna nova no banco não entra
na ficha sem alguém editar `sql/04` de propósito. Falha fechada.

## 4. Decisão 3 — subdomínio próprio

`relatorio-financeiro.blackhaus.io`, serviço próprio em `127.0.0.1:8788`,
certificado próprio. A alternativa era pendurar num caminho do vhost do conector
do CRM — sem DNS novo, mas com descoberta de OAuth por caminho (frágil no
connector) e com os dois serviços dividindo vhost e rate-limit. Isolamento venceu:
derrubar um não pode derrubar o outro.

Pelo mesmo motivo a unidade é **systemd**, não PM2: o CRM roda inteiro no PM2 como
root, e `pm2 restart all` de quem mantém o CRM não pode alcançar isto — é a mesma
razão que separou o `financeiro.service` em 28/07.

## 5. A exceção à CLAUDE.md 3, declarada

As views de `relatorio.*` **não levam `security_invoker = true`**, e isso é o
mecanismo, não esquecimento.

A regra 3 fala de view em `public`/`app`, que é **caminho do app**: lá, view sem a
opção avalia a RLS contra o dono e anula `FORCE ROW LEVEL SECURITY` e as policies
de uma vez — medido em 26/07, 2 linhas de todos os tenants por uma view, 0 pela
tabela. Aqui a role `relatorio_ai` **não representa usuário de tenant**: não é
membro de `app_financeiro`, não tem policy e não deve ter. Direito do dono é o que
permite ler vários tenants **sem dar `BYPASSRLS` a ninguém**.

A trava desta camada, portanto, não é RLS — é **privilégio**:

- a role só tem `USAGE` em `relatorio` e `SELECT` nas views de lá;
- não alcança `public`, não escreve em nada, e a sessão é `read only`;
- o serviço **confere isso no arranque** e recusa subir se mudou (mesma forma de
  `conferirRoleDeLeitura` em `src/crm/conexao.ts`, virada para dentro).

`CAT-4` varre `public` e `app`, então este schema não a faz falhar. **Isso é
consequência, não licença:** view nova em `public`/`app` continua obrigada.

## 6. O que fica em aberto (e quando passa a doer)

**O corte por tenant é aplicado pelo SERVIÇO** (`identity.tenants`), não por
predicado no banco: as views carregam todos os tenants. Hoje é inócuo — há uma
identidade, a do dono, e ela abrange tudo. Passa a importar **no dia em que
existir identidade de tenant único**: quem tiver a credencial do banco por fora
contorna o corte. Nesse dia o caminho é RLS nas views ou função de listagem que
receba o escopo — e a decisão é **antes** de emitir a primeira identidade externa,
não depois.

Mesma nota para `pii`: identidade de terceiro nasce `pii=false` e só vira `true`
depois de DPA / disclosure de sub-processador. Rotear dado pessoal de cliente de
outra empresa por LLM externa é decisão jurídica cara de desfazer.

## 7. Reverter

```sql
begin;
reassign owned by relatorio_ai to postgres;
drop owned by relatorio_ai;
drop role if exists relatorio_ai;
drop schema if exists relatorio cascade;
commit;
```

Mais `systemctl disable --now financeiro-relatorio-mcp` e o symlink do nginx. Nada
fora da camada depende dela.
