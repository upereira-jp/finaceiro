# RESUMO-SESSAO-8 — 27/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Abrir o bootstrap, medir o auth contra o Supabase real e — depois de evidenciar a fase — construir o conector do CRM |
| **Método** | Nada afirmado sem medição; toda prova de escrita em `BEGIN … ROLLBACK`; teste novo verificado **nos dois sentidos**; contradição encontrada vira entrada em `QUESTOES.md`, nunca conserto silencioso |
| **Achados** | 5, todos medidos. Três viraram questão nova, dois viraram correção com teste |
| **Resultado** | Auth fechado ponta a ponta. Conector construído e testado. **A F1 NÃO fechou** — dois dos três critérios de saída dependem de terceiros |

---

## 1. O auth fechou, e as três perguntas foram respondidas

A fila da sessão 7 pedia `SUPABASE_URL` e um login real. As três perguntas em aberto, medidas:

| Pergunta | Medido |
|---|---|
| O `iss` real bate com o que `autenticador.ts` monta? | ✅ `https://jblijwhayqphcrlmnmiw.supabase.co/auth/v1` |
| Chave legada HS256 ou JWT signing keys? | ✅ **signing keys ES256** — `SUPABASE_JWT_SECRET` fica ausente, que é o caminho preferido |
| O JWKS responde onde o código monta? | ✅ 200, uma chave, `kid` batendo com o do token |

`scripts/verificar-auth-real.ts` reproduz. Sem token no stdin ele faz só o preflight do JWKS, que **não pede credencial nenhuma** — dá para rodar em qualquer máquina.

**O que isso destravou de verdade:** o ramo `dsaEncoding: 'ieee-p1363'` do ES256 nunca tinha rodado contra um token real. As 23 verificações de `auth-jwt.ts` provam a *lógica* do verificador contra um JWKS local; nenhuma provava suposição alguma sobre o Supabase. Agora um token emitido pelo projeto passa pelo caminho de produção inteiro, até `app.resolver_login` pela role de runtime.

## 2. O bootstrap: script pronto, provado nos dois sentidos, e não commitado

`scripts/bootstrap-plataforma-admin.sql`. Conta criada no Supabase Auth (`efcc8e11-…`).

Exige `-v modo=ensaio|valendo`, **sem default** — script de provisionamento que escreve porque alguém esqueceu uma flag é o modo de falha errado. As guardas erram em SQL e não com `\quit`, que sairia com código **zero**: script de provisionamento devolvendo sucesso sem ter feito nada é exatamente o que este projeto persegue.

Verificado nos dois sentidos:
- `modo` ausente, `modo` inválido e `auth_user_id` fora de `auth.users` → todos **exit 3**
- caminho positivo rodado com **o script real**, não uma cópia: `AUTOCOMMIT off` fez o `ROLLBACK` dele desfazer até a conta sintética. `app.resolver_login` devolveu `tier = plataforma_admin`, 2 linhas de trilha, tudo de volta a zero

**O `COMMIT` continua pendente** — o classificador bloqueou a escrita em produção e não foi contornado. Comando na fila.

## 3. `Q-AUDIT-01` — a trilha da escrita mais privilegiada não dizia a quem

Achado **no ensaio do bootstrap**, não por teste: o `INSERT` em `plataforma_admin` gravou auditoria com `registro_id` **NULL**.

`app.auditar()` monta o `registro_id` por `coalesce(id, cliente_id)`, e das dezesseis tabelas auditadas `plataforma_admin` é a **única** sem nenhuma das duas — a PK dela é `usuario_id`. O dado sobrevive no `depois` jsonb; o índice `auditoria_registro_idx` não alcança. Conceder tier é a escrita mais privilegiada do sistema, e era a única cuja trilha não se consultava pelo caminho indexado.

**Decisão do dono:** `usuario_id` entra no `coalesce`, **por último**. A ordem é o que torna a correção cirúrgica — onde existe `id`, `id` continua vencendo. Migration 13.

**G6 e G7, verificados nos dois sentidos.** Replantado o `coalesce` antigo num banco novo, o G6 acusa (`achou 0`) e a suíte aborta. O G7 fixa que `usuario_tenant` — que tem **as duas** colunas — segue identificada pelo próprio `id`: ele é quem pega alguém reordenando o `coalesce` depois.

## 4. `Q-DISTRIB-01` — o `MT-09` deixou de ser hipótese

Medido contra produção: `distribuidora` estava com **RLS habilitada, sem `FORCE` e com zero policies** — apesar de a migration 10 tê-la criado declarando *"sem tenant_id e sem RLS"*. Ninguém escreveu aquele `ENABLE`; foi o event trigger `rls_auto_enable` da plataforma.

Efeito medido: `postgres` (BYPASSRLS) via 1 linha; `app_financeiro_login` via **0**. O `GRANT SELECT ... TO app_financeiro` da migration 10 era letra morta.

**Não é vermelho, e o motivo foi medido em reprodução local antes de classificar:** integridade referencial *sempre* ignora row security, então as três FKs seguiam funcionando nos dois sentidos — `'Equatorial'` aceita, `'Equatorial GO'` recusada com `23503`. O desenho da migration 10 §6 continuava de pé. O que quebrava era a leitura da lista.

**O achado de fundo é maior que a tabela.** O `CAT-3` filtra por *ter `tenant_id`*, e o comentário dele **nomeava `distribuidora`** como exemplo do que ignorar — a premissa que justificava o filtro era falsa em produção. Pior: a suíte roda em PG16 local **sem o event trigger da plataforma**, então o `CAT-3` verde localmente não dizia nada sobre produção. **Os dois bancos divergiam estruturalmente.**

**Decisão do dono:** policy explícita + `CAT-8`, que acusa **qualquer** tabela com RLS e zero policies, com lista branca nominal. Verificado nos dois sentidos e **rodado contra produção**, onde os 8 invariantes passam. O `catalogo.sql` é leitura pura e passou a ser documentado como algo que se roda **também lá**.

## 5. A evidência de fase, e o que ela mudou

Medido contra o `PRD` §10, não estimado: **a F1 tem duas metades em estados opostos.** A fundação estava pronta e provada; o conector, entrega nomeada da mesma fase, estava em zero — e **dois dos três critérios de saída dependem dele**.

Duas notas do que apareceu de passagem:
- as 2 migrations "não terminadas" no `_prisma_migrations` são as duas tentativas falhas da migration 10 (o crash do `GRANT` da sessão 6), ambas com `rolled_back_at`. **Cicatriz de histórico, não estado quebrado.**
- o `README` afirmava que o `VIEWS-PROPOSTAS-r2.sql` não fora executado. **Foi** — ver §7.

## 6. O conector

`src/crm/`, três módulos, nenhuma dependência nova.

**`conexao.ts`** — pool próprio e a conferência de arranque que transforma a regra 4 em condição de boot: recusa se a role for SUPERUSER, tiver `BYPASSRLS`, tiver **qualquer** privilégio de escrita ou alcançar objeto fora do schema `financeiro`. A sessão ainda é declarada `default_transaction_read_only=on` — segunda tranca, custo zero, fecha a janela entre um `GRANT` errado e a próxima conferência.

**`leitura.ts`** — ponto único. O SQL de cada view é constante do arquivo; não há função que aceite nome de tabela, de schema ou fragmento. Existe pela mesma razão que `contexto.ts`: garantia que depende de todo mundo lembrar não é garantia.

**`sincronizacao.ts`** — a porta de leitura é **injetada**, e isso não é conveniência de teste: o motor não conhece `pg`, não monta SQL e não sabe o nome de nenhuma tabela do CRM.

Coberto: R3 idempotência, R4 dedup antes do upsert, R6 nunca deleta, R8/R9 recusas contadas, R13 lote, R14/R15 funil `Parceiros` fora da base de valor, R18 fusão de vítima de merge, §4.3 classificação em três na ordem `lead_merges → leads_arquivados → funil`, §7 view vazia termina em `erro` e **não reconcilia**.

### O erro que o teste `N10` pegou, e ele valia a sessão

Segunda passada reportou `atualizados: 2` onde devia reportar 0.

`consumo_kwh` chega do CRM como `'850.0000'` e volta do nosso banco como `Decimal` que imprime `850`. Comparados como texto são **sempre diferentes** — o conector reescreveria todo cliente espelhado em todo ciclo, para sempre. E a R3 cairia **sem nunca dar erro**: os contadores diriam "atualizados: N", e ninguém desconfiaria, porque atualizar é o que um sincronizador faz.

A correção compara sem passar por IEEE 754, porque a regra 1 proíbe float até em cálculo intermediário — e comparação é cálculo.

### Três correções na migration 14, todas vindas de invariante existente

- **`CAT-2` recusou** o índice único parcial que eu usara para "um ciclo em andamento por conector". Estava certo: pela regra 11 o `db pull` ignora o predicado, `conector_id` viraria único-sozinho e o Prisma recusaria o schema com `P1012`. Trocado por **`EXCLUDE`**, que não cria índice único — o mesmo mecanismo que a R21 já usa para vigência.
- **`G2` acusou** a falta do gatilho de auditoria. Eu havia justificado a ausência com "encheria a auditoria de imagem de contador"; a conta real é **~48 linhas por dia por tenant**. Era estimativa sem número. Migration 15 faz o código obedecer ao invariante, em vez de afrouxar a lista branca — que é como, antes da migration 10, a cobertura de trilha era de 4 tabelas em 13 e as 4 não incluíam onde moram as chaves PIX.
- **Editei a migration 14 depois de aplicada**, que é exatamente o que a 15 diz para não fazer: o `_prisma_migrations` guarda checksum e o `deploy` seguinte acusaria drift. Revertido antes de causar dano; o `deploy` seguinte passou limpo.

## 7. `Q-VIEWS-01` — as views existem, e não cumprem o que a `SPEC-002` pressupõe

O achado que mais muda o plano. Schema `financeiro` no CRM com **8 views**, role `financeiro_ro` existindo.

**A boa notícia, medida:** `financeiro_ro` está impecável — `NOSUPERUSER`, `NOBYPASSRLS`, **0** privilégio de escrita, **0** objeto fora do schema `financeiro`, **0** acesso a tabela base de `public`. A regra 4 está satisfeita no nível de GRANT.

**A ruim, e é uma só:** nenhuma view expõe coluna de tenant. Todas carregam de 1 a 3 **UUIDs literais** no corpo — o `MT-08`. A `SPEC-002` R1-b manda validar `crm_tenant_id` em toda linha recebida, e **não há coluna para validar**. O invariante 9 não tem como ser cumprido.

**Correção do mesmo dia, registrada porque o erro era meu e quase virou pedido errado ao dev.** A primeira redação desta seção e da `Q-VIEWS-01` acusava também as views de não declararem `security_invoker = true`, tratando isso como o furo da regra 3. **Está errado neste contexto.** Com `security_invoker = true`, privilégios e RLS passam a ser avaliados contra quem consulta — e `financeiro_ro` precisaria de `SELECT` nas **tabelas base** do CRM, que é exatamente o acesso que a regra 4 proíbe e que a medição acima celebra não existir. A view *owned* por `postgres` com filtro literal é **o que permite** ao `financeiro_ro` ler as views e nada mais. A rodada 2 com o dev já havia concluído isso; eu reabri por ter relido o catálogo sem reler a conversa. O `CAT-4` e a regra 3 falam das views do **nosso** schema — não há conflito. O pedido ao dev ficou sendo **um só**: expor `crm_tenant_id`. Ver `PROMPT-dev-crm-rodada3-2026-07-27.md`.

O conector faz o máximo verificável do nosso lado — exige `crm_tenant_id` configurado, confere contra `conector_crm`, aborta se divergir — e **registra `garantia_de_tenant_degradada` em `conector_execucao.detalhe`** (teste `N19`). Isso declara a lacuna; não a fecha. A diferença entre uma garantia e a ausência dela tem que aparecer no registro da execução.

---

## Estado dos testes

```
documento              17      isolamento             20
RBAC                   15      regras                 12
auditoria              31      catalogo                8 invariantes (CAT-1..8)
middleware             12      sessao                 15
matriz de papeis       18      composition root        8
repos/cliente          13      repos/contrato         10
repos/uc               12      repos/usina+originador 15
rateio                 10      HTTP                   21
auth JWT               23      conector               16   NOVA
tsc --noEmit           limpo
```

`npm test` sai com `EXIT=0`. **276 verificações em 18 suítes** — 19 novas nesta sessão (2 de auditoria, 1 de catálogo, 16 do conector).

Os 8 invariantes de catálogo passam **também contra produção**, o que nenhuma sessão anterior havia feito.

---

## Fila da próxima sessão

**1. 🔴 O `COMMIT` do bootstrap.** Bloqueado pelo classificador nesta sessão. O script está provado; falta rodar com `modo=valendo`:

```
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v modo=valendo \
  -v auth_user_id='efcc8e11-e2cf-4079-a649-92798fefdfc7' \
  -v nome='Vinicius Leal' -v email='lealvbl@gmail.com' \
  -f scripts/bootstrap-plataforma-admin.sql
```

**2. 🔴 `Q-VIEWS-01` — o pedido ao dev do CRM.** Uma coisa só: expor `crm_tenant_id` como coluna nas 8 views. Sem ela o invariante 9 da `SPEC-002` fica sem como ser cumprido, e uma view futura sem o literal certo entrega linha de outra empresa sem nada impedir. Prompt pronto em `PROMPT-dev-crm-rodada3-2026-07-27.md`.

**3. 🔴 `CRM_DATABASE_URL` e o primeiro ciclo real.** O conector está provado contra stub — que é mais forte para dedup, merge e view vazia, porque produz sob demanda o que o CRM real não produziria. O que falta é a outra metade: um ciclo de verdade. Formato no `.env.example`.

**4. 🟡 Os dois testes da `SPEC-002` §9 que ficaram fora da suíte.** `test_conector_nao_escreve_no_crm` e `test_conector_so_le_views_financeiro` foram **medidos por catálogo contra o CRM real nesta sessão**, mas não estão automatizados. Enquanto não estiverem, valem como medição datada, não como invariante (regra 8).

**5. 🟡 As rotas do conector.** `SPEC-002` §6: `POST /conectores/:id/ciclo` e `GET /conectores/:id/execucoes`.

**6. 🟡 Os cinco repositórios que faltam:** `dono_usina`, `regra_comissao`, `regra_repasse`, `tarifa`, `cliente_estado_crm`. Os três de vigência traduzem `23P01` do `EXCLUDE` em erro de negócio, como o de rateio faz com o teto.

**7. 🟡 `Q-FASE-01`.** O `PRD` §10 põe o conector na F1; a `SPEC-002` diz F2. A decisão ficou para depois de ver o conector pronto — ele está.

**8. 🔴 Reunião com o contador.** Não ocorreu. Quatro questões fiscais seguem aceitas como risco e rebaixadas para bloqueio de F2/F3.

---

## Onde a F1 está

| Critério de saída (`PRD` §10) | Estado |
|---|---|
| `migrate reset` limpo | ✅ 15 migrations em banco vazio a cada `npm test` |
| sync idempotente | ⚠️ provado contra stub (`N10`), **nunca contra o CRM real** |
| escrita no CRM falha por permissão | ✅ medido por catálogo; ⚠️ **não automatizado** (item 4 da fila) |

**A F1 não está fechada, e não fecha só com código nosso.** A fundação está pronta e provada. O conector existe e é testado. O que falta é `CRM_DATABASE_URL`, a resposta do dev do CRM sobre as views, e a decisão de fase.

---

## Pendências gerais

| Item | Estado | Dono |
|---|---|---|
| `COMMIT` do bootstrap | 🔴 script provado, falta rodar | Vinicius |
| `Q-VIEWS-01` — views sem coluna de tenant | 🔴 **bloqueia o invariante 9 da `SPEC-002`**. Prompt pronto para o dev | dev do CRM |
| `CRM_DATABASE_URL` e o primeiro ciclo real | 🔴 | Vinicius |
| Rotação da `service_role` do Supabase | 🔴 exposta nesta sessão | Vinicius |
| Reunião com o contador | 🔴 não ocorreu | Vinicius |
| Os dois testes da §9 não automatizados | 🟡 medidos, não invariantes | — |
| Rotas do conector (`SPEC-002` §6) | 🟡 | — |
| Cinco repositórios de cadastro/configuração | 🟡 | — |
| `Q-FASE-01` — conector é F1 ou F2 | 🟡 | Vinicius |
| `Q-CLAUDE11-01` — a regra 11 sem mecanismo | 🟡 três opções | Vinicius |
| `MT-09` — `rls_auto_enable` | 🟡 coberto pelo `CAT-8`, que é detecção e não prevenção | Vinicius |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 | Vinicius |
| PgBouncer em modo *transaction* | 🔴 sem cobertura | — |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 | dev do CRM |
| Dev do CRM — segredos em `text` puro | 🔴 rotação, não migração de coluna | dev do CRM |
| **`MT-06` / auth ponta a ponta** | ✅ **fechado hoje** | — |
| **`Q-AUDIT-01`** | ✅ **fechada hoje** — migration 13, G6/G7 | — |
| **`Q-DISTRIB-01`** | ✅ **fechada hoje** — migration 13, `CAT-8` | — |
| **Conector do CRM** | ✅ **construído hoje** — 16 verificações | — |

---

## Nota de método

**O padrão das sessões 6 e 7 se repetiu, e agora com uma variação que vale nomear.** Continuou valendo que contradição aparece por leitura, não por teste: a `Q-DISTRIB-01` e a `Q-VIEWS-01` saíram de ler catálogo contra documento. Mas **duas das correções desta sessão vieram de invariantes existentes acusando código novo** — o `CAT-2` recusou o índice parcial e o `G2` recusou a falta de gatilho. É a primeira sessão em que a rede pegou o autor em vez de o autor pegar a rede.

**E a tentação, nas duas vezes, foi afrouxar o invariante.** No `CAT-2` teria bastado mudar as colunas do índice; no `G2`, acrescentar um nome à lista branca. Nos dois casos o custo de obedecer era uma linha, e o custo de afrouxar era o precedente — a mesma lista branca que, antes da migration 10, deixava `dono_usina` e `originador` fora da trilha com as chaves PIX dentro.

**O `N10` é o argumento mais forte a favor de testar idempotência com dados reais de formato.** O defeito não era lógica: era `'850.0000'` contra `850`. Nenhuma revisão de PR pegaria, nenhum log acusaria, e o sintoma em produção seria um contador dizendo exatamente o que se espera de um sincronizador.

**O que se manteve:** toda prova de escrita em `BEGIN … ROLLBACK`, e todo teste novo verificado nos dois sentidos — passa contra o código correto e **acusa contra a violação plantada**. Um invariante que só sabe passar não é invariante.
