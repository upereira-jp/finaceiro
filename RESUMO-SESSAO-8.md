# RESUMO-SESSAO-8 — 27/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Fechar a fila da sessão 7, evidenciar em que fase o projeto está, e construir o conector do CRM |
| **Método** | Nada afirmado sem medição; toda prova de escrita em `BEGIN … ROLLBACK`; teste novo verificado **nos dois sentidos**; contradição encontrada vira entrada em `QUESTOES.md`, nunca conserto silencioso |
| **Achados** | 10, todos medidos. Cinco viraram questão nova, cinco viraram correção com teste |
| **Resultado** | Auth fechado. Conector construído e ligado ao CRM real. **Passos 1 a 4 da §11 EXECUTADOS.** A F1 não fechou por **uma** razão, e ela é de código: a `Q-LOTE-01` |
| **Testes** | **285 verificações em 18 suítes**, `EXIT=0`. Os 8 invariantes de catálogo passam **também contra produção** |

> # ESTADO ATUAL — 28/07/2026, fim da sessão
>
> > **SUPERADA pelo `RESUMO-SESSAO-9.md`.** Esta caixa foi o estado corrente até o
> > fim da sessão 8 e fica como registro datado. O que mudou depois: `SPEC-002`
> > v1.4 (R21-b, invariante 13) e 318 verificações. **A fila abaixo continua
> > válida** — nenhum item dela foi fechado na sessão 9.
>
> **Leia esta caixa e pule para a §11 só se precisar do histórico.** O corpo deste
> documento é registro datado e não foi reescrito; as §16–§24 são adendos que
> corrigem partes dele. Se você chegou agora, o que vale é o que está aqui.
>
> | | |
> |---|---|
> | **F1** | **sem bloqueio vermelho.** Os três critérios do `PRD` §10 cumpridos |
> | **Conector** | as **4 entidades** da `SPEC-002` §2 espelhadas, rodando valendo contra o CRM real |
> | **Espelho em produção** | 76 clientes · 3 usinas · 35 UCs · 8 competências de geração |
> | **Idempotência** | 2ª passada: `criados 0, atualizados 0` |
> | **Testes** | **313 verificações em 18 suítes**, `EXIT=0`. Os 8 invariantes de catálogo passam **contra produção** |
> | **Banco** | `sa-east-1`, PG 17.6, 15 migrations, 16 tabelas com `tenant_id` **todas** com RLS+FORCE+policy |
>
> **O que falta não é código:**
>
> | Item | Quem |
> |---|---|
> | Reunião com o contador — **`PAUTA-contador.md`**, 10 perguntas fechadas | Vinicius + contador |
> | `RATEIO-USO-01` 🔴 — a usina tem duas medidas, o sistema controla uma | Vinicius + contador |
> | `Q-UC-DISTRIB-01` — confirmar que a UC herda a distribuidora da usina | Vinicius |
> | `UC-DUP-01` — conferir `000041446801282` contra o rateio oficial | operação |
>
> **Encerrado em 28/07:** PR **#1** aberto · projeto Supabase antigo apagado, com os
> 8 invariantes de catálogo reverificados contra produção depois · senha antiga do
> `financeiro_ro` confirmada como não guardada por ninguém · `Q-ATIVOS-01` decidida
> (não mover os cards) e rebaixada para 🟡, porque o espelho de UC tornou o funil
> `Clientes ativos` desnecessário como fonte de estado ativo.
>
> **Próxima fase:** a F2 não começa sem o contador. As quatro questões fiscais
> voltam a ser bloqueio no dia em que ela abrir, e o schema que elas definem
> (`fatura`, `split_item`) ainda não existe — que é o que torna a reunião barata
> agora e cara depois.

---

> **Este documento contém o roteiro completo para fechar a F1 — §11.** Ele
> absorveu o `FECHAR-F1.md`, que existiu por algumas horas e foi removido: dois
> documentos com o mesmo roteiro divergem, e este projeto já removeu o
> `LEIA-ME-retomada.md` pelo mesmo motivo. Se você veio para terminar a fase, vá
> direto à §11.

> ## ADENDO de 27/07, depois do fechamento acima — a `Q-LOTE-01` fechou
>
> **O corpo abaixo é registro datado e não foi reescrito** — ele descreve o estado
> em que a sessão foi fechada, e reescrevê-lo falsificaria o registro (mesma
> decisão do `PATCH-citacoes-2026-07-24.md`). O que mudou desde então está na
> **§16**, e as três linhas de estado que ficariam ativamente erradas — §11 passo
> 5, §12 e §14 — estão marcadas *in loco* com "**ATUALIZADO**".
>
> Em uma frase: **a R13 foi implementada em lotes, o `test_lote_respeita_timeout`
> existe e a F1 não tem mais bloqueio vermelho.** O passo 5 está desbloqueado e
> **não foi executado** — ele grava em produção e é decisão do dono.

---

## 1. O auth fechou, e as três perguntas foram respondidas

A fila da sessão 7 pedia `SUPABASE_URL` e um login real contra o Supabase.

| Pergunta | Medido |
|---|---|
| O `iss` real bate com o que `autenticador.ts` monta? | ✅ `https://jblijwhayqphcrlmnmiw.supabase.co/auth/v1` |
| Chave legada HS256 ou JWT signing keys? | ✅ **signing keys ES256** — `SUPABASE_JWT_SECRET` fica ausente, que é o caminho preferido |
| O JWKS responde onde o código monta? | ✅ 200, uma chave, `kid` batendo com o do token |

`scripts/verificar-auth-real.ts` reproduz. **Sem token no stdin ele faz só o
preflight do JWKS, que não pede credencial nenhuma** — roda em qualquer máquina.

**O que isso destravou de verdade:** o ramo `dsaEncoding: 'ieee-p1363'` do ES256
nunca tinha rodado contra um token real. As 23 verificações de `auth-jwt.ts`
provam a *lógica* do verificador contra um JWKS local; nenhuma provava suposição
alguma sobre o Supabase. Agora um token emitido pelo projeto atravessa o caminho
de produção inteiro, até `app.resolver_login` pela role de runtime.

## 2. `Q-AUDIT-01` — a trilha da escrita mais privilegiada não dizia a quem

Achado **no ensaio do bootstrap**, não por teste: o `INSERT` em `plataforma_admin`
gravou auditoria com `registro_id` **NULL**.

`app.auditar()` monta o `registro_id` por `coalesce(id, cliente_id)`, e das
dezesseis tabelas auditadas `plataforma_admin` é a **única** sem nenhuma das duas
— a PK dela é `usuario_id`. O dado sobrevive no `depois` jsonb; o índice
`auditoria_registro_idx` não alcança.

**Decisão do dono:** `usuario_id` entra no `coalesce`, **por último**. A ordem é o
que torna a correção cirúrgica — onde existe `id`, `id` continua vencendo.
Migration 13.

**G6 e G7, nos dois sentidos.** Replantado o `coalesce` antigo num banco novo, o
G6 acusa (`achou 0`) e a suíte aborta. O G7 fixa que `usuario_tenant` — que tem
**as duas** colunas — segue identificada pelo próprio `id`: é ele que pega alguém
reordenando o `coalesce` depois.

## 3. `Q-DISTRIB-01` — o `MT-09` deixou de ser hipótese

Medido contra produção: `distribuidora` estava com **RLS habilitada, sem `FORCE` e
com zero policies** — apesar de a migration 10 tê-la criado declarando *"sem
tenant_id e sem RLS"*. Ninguém escreveu aquele `ENABLE`; foi o event trigger
`rls_auto_enable` da plataforma.

Efeito medido: `postgres` (BYPASSRLS) via 1 linha; `app_financeiro_login` via
**0**. O `GRANT SELECT ... TO app_financeiro` da migration 10 era letra morta.

**Não é vermelho, e o motivo foi medido em reprodução local antes de
classificar:** integridade referencial *sempre* ignora row security, então as três
FKs seguiam funcionando nos dois sentidos — `'Equatorial'` aceita, `'Equatorial
GO'` recusada com `23503`.

**O achado de fundo é maior que a tabela.** O `CAT-3` filtra por *ter `tenant_id`*,
e o comentário dele **nomeava `distribuidora`** como exemplo do que ignorar — a
premissa que justificava o filtro era falsa em produção. Pior: a suíte roda em
PG16 local **sem o event trigger da plataforma**, então o `CAT-3` verde localmente
não dizia nada sobre produção. **Os dois bancos divergiam estruturalmente.**

**Decisão do dono:** policy explícita + `CAT-8`, que acusa **qualquer** tabela com
RLS e zero policies, com lista branca nominal. Verificado nos dois sentidos e
rodado contra produção, onde os 8 invariantes passam.

## 4. A evidência de fase

Medido contra o `PRD` §10, não estimado: a F1 tinha **duas metades em estados
opostos**. A fundação pronta e provada; o conector, entrega nomeada da mesma fase,
em zero — e **dois dos três critérios de saída dependiam dele**.

Duas notas do que apareceu de passagem:
- as 2 migrations "não terminadas" no `_prisma_migrations` são as duas tentativas
  falhas da migration 10 (o crash do `GRANT` da sessão 6), ambas com
  `rolled_back_at`. **Cicatriz de histórico, não estado quebrado.**
- o `README` afirmava que o `VIEWS-PROPOSTAS-r2.sql` não fora executado. **Foi.**

## 5. O conector

`src/crm/`, três módulos, nenhuma dependência nova.

**`conexao.ts`** — pool próprio e a conferência de arranque que transforma a regra
4 em condição de boot. A sessão é declarada `default_transaction_read_only=on` —
segunda tranca, custo zero.

**`leitura.ts`** — ponto único. O SQL de cada view é constante do arquivo; não há
função que aceite nome de tabela, de schema ou fragmento. Existe pela mesma razão
que `contexto.ts`: garantia que depende de todo mundo lembrar não é garantia.

**`sincronizacao.ts`** — a porta de leitura é **injetada**, e isso não é
conveniência de teste: o motor não conhece `pg`, não monta SQL e não sabe o nome
de nenhuma tabela do CRM.

Coberto: R3 idempotência, R4 dedup antes do upsert, R6 nunca deleta, R8/R9 recusas
contadas, R14/R15 funil `Parceiros` fora da base de valor, R18 fusão de vítima de
merge, §4.3 classificação em três na ordem `lead_merges → leads_arquivados →
funil`, §7 view vazia termina em `erro` e **não reconcilia**.

**NÃO coberto, e o primeiro ciclo real cobrou:** a **R13** (lote). Ver a
`Q-LOTE-01` na §11 — é o que bloqueia a F1.

### O erro que o teste `N10` pegou, e ele valia a sessão

Segunda passada reportou `atualizados: 2` onde devia reportar 0.

`consumo_kwh` chega do CRM como `'850.0000'` e volta do nosso banco como `Decimal`
que imprime `850`. Comparados como texto são **sempre diferentes** — o conector
reescreveria todo cliente espelhado em todo ciclo, para sempre. E a R3 cairia
**sem nunca dar erro**: os contadores diriam "atualizados: N", e ninguém
desconfiaria, porque atualizar é o que um sincronizador faz.

A correção compara sem passar por IEEE 754, porque a regra 1 proíbe float até em
cálculo intermediário — e comparação é cálculo.

### Três correções na migration 14, todas de invariante existente

- **`CAT-2` recusou** o índice único parcial para "um ciclo em andamento por
  conector". Estava certo: pela regra 11 o `db pull` ignora o predicado,
  `conector_id` viraria único-sozinho e o Prisma recusaria o schema com `P1012`.
  Trocado por **`EXCLUDE`**, que não cria índice único — o mesmo mecanismo que a
  R21 já usa para vigência.
- **`G2` acusou** a falta do gatilho de auditoria. Eu havia justificado a ausência
  com "encheria a auditoria"; a conta real é **~48 linhas por dia por tenant**.
  Era estimativa sem número. Migration 15 faz o código obedecer ao invariante em
  vez de afrouxar a lista branca.
- **Editei a migration 14 depois de aplicada**, que é o que a 15 diz para não
  fazer: o `_prisma_migrations` guarda checksum e o `deploy` seguinte acusaria
  drift. Revertido antes de causar dano.

## 6. `Q-VIEWS-01` — aberta e fechada no mesmo dia

As 8 views `financeiro.*` **já estavam executadas** (o `README` dizia que não), e
`financeiro_ro` existia. Mas nenhuma expunha coluna de tenant — só UUIDs literais
no corpo. A `SPEC-002` R1-b manda validar `crm_tenant_id` em toda linha, e **não
havia coluna para validar**: o invariante 9 não tinha como ser cumprido.

**A correção que evitou um pedido errado ao dev.** A primeira redação acusava
também as views de não declararem `security_invoker = true`. **Está errado neste
contexto, e teria quebrado a integração.** Com `security_invoker = true`
privilégios e RLS passam a ser avaliados contra quem consulta, e `financeiro_ro`
precisaria de `SELECT` nas **tabelas base** do CRM — exatamente o acesso que a
regra 4 proíbe. A view *owned* por `postgres` com filtro literal é **o que
permite** ao `financeiro_ro` ler as views e nada mais. A rodada 2 com o dev já
havia concluído isso; eu reabri por reler o catálogo sem reler a conversa.

**O dev entregou no mesmo dia.** Conferido, não aceito de palavra: as 8 views
expõem `crm_tenant_id uuid`, com **1** valor distinto e **0** nulos em cada, o
**mesmo** valor nas oito (`d4640f4b-f833-4a80-a4db-ccced1956ae4`), coluna no fim
da lista — e `security_invoker` não foi ligado. Testes `N23` (o
`test_tenant_divergente_aborta_ciclo` da §9) e `N24`, nos dois sentidos.

## 7. `Q-PGNET-01` — o furo na guarda que eu mesmo escrevi

Ligar a validação obrigou a testar a guarda de arranque de verdade, e o `N21`
pegou: `conferirRoleDeLeitura()` filtrava `information_schema.table_privileges`
por `grantee = current_user`, e essa view **não enxerga privilégio herdado por
participação em role**. Uma credencial que ganhasse escrita por `GRANT papel TO
financeiro_ro` passaria pela guarda inteira.

Refeito com `has_table_privilege()`, a medição contra o CRM mudou: `financeiro_ro`
tem **escrita efetiva em 2 objetos** e leitura em 4 fora de `financeiro`. Nenhum é
concessão do dev — são grants a `PUBLIC` da extensão `pg_net`
(`net.http_request_queue`, `net._http_response`) e do `pg_stat_statements`.

**Isso obrigou a repensar o critério, e a lição é sobre guarda que morre.** "Zero
privilégio" recusaria o arranque para sempre, e guarda que impede o sistema de
subir é removida na primeira pressa. O critério passou a ser **onde**: escrita em
schema de negócio derruba o arranque; privilégio de extensão em schema de
infraestrutura é **devolvido no diagnóstico** para quem chama registrar — nunca
silenciado.

**Corrige um número que eu já tinha escrito ao dev** na carta da rodada 3: o "0
privilégios de escrita" veio do método fraco. O prompt ganhou §6 com a correção.

## 8. `Q-PROV-01` — criar tenant não tem caminho de aplicação

O `RESUMO-SESSAO-7` afirmava que *"daí em diante o próprio app cria tenant e
vínculo, com auditoria"*. Medido: **não existe**, e não é trivial. A policy
`tenant_por_tier` exige `app.current_tier() = 'plataforma_admin'` no `WITH CHECK`,
e o único emissor de contexto com tier é `abrirComoPlataforma()`, que recebe um
`tenantId` **já existente** para atravessar. Criar o **primeiro** tenant não tem
tenant onde se apoiar — mesmo ovo-e-galinha do primeiro `plataforma_admin`.

**Não improvisei.** Inventar contexto para uma linha que ainda não existe abriria
uma segunda porta de emissão de contexto, e a `SPEC-001` §3.2 existe para não
haver uma segunda. Virou `scripts/provisionar-tenant.sql`, na mesma faixa do
bootstrap e da role de runtime, com três opções registradas para o dono.

## 9. A composição que faltava

As três peças do conector existiam e eram testadas isoladamente, e **nada as
juntava** — não dava para rodar um ciclo nem com a credencial na mão. É o mesmo
buraco que a sessão 7 encontrou no financeiro. Peça testada que ninguém consegue
executar não é sistema.

`scripts/ciclo-crm.ts` usa o **caminho da aplicação**, não um atalho: entra por
`app.login()`, roda dentro de `app.withTenant()` — que confere o tenant proposto
contra a lista do login — e lê o `crm_tenant_id` do **banco**, nunca de argumento
de linha de comando (regra 6).

---

## 10. Estado dos testes

```
documento              17      isolamento             20
RBAC                   15      regras                 12
auditoria              31      catalogo                8 invariantes (CAT-1..8)
middleware             12      sessao                 15
matriz de papeis       18      composition root        8
repos/cliente          13      repos/contrato         10
repos/uc               12      repos/usina+originador 15
rateio                 10      HTTP                   21
auth JWT               23      conector               25   NOVA
tsc --noEmit           limpo
```

**285 verificações em 18 suítes**, `EXIT=0` — 28 novas nesta sessão (2 de
auditoria, 1 de catálogo, 25 do conector). Contagem pela convenção do projeto:
chamadas a `chk()` e invariantes de catálogo.

Os 8 invariantes de catálogo passam **também contra produção**, o que nenhuma
sessão anterior havia feito.

---

## 11. O roteiro, e o que foi EXECUTADO em 27/07

> **Vocabulário, porque é onde a regra 6 se paga.** O `tenant` do passo 2 é a
> empresa dentro do **financeiro**. Não tem relação com o tenant do CRM. O
> identificador deles, `crm_tenant_id`, aparece em **uma** coluna de **uma**
> tabela (`conector_crm`) e é usado por **um** módulo.

| Passo | Estado |
|---|---|
| 1 — primeiro `plataforma_admin` | ✅ **feito**, com `COMMIT` |
| 2 — tenant, vínculo e conector | ✅ **feito**, com `COMMIT` |
| 3 — `CRM_DATABASE_URL` | ✅ **feito** — conectou como `financeiro_ro` |
| 4 — ciclo em ensaio | ✅ **rodou**, e achou a `Q-VALOR-01` e a `Q-LOTE-01` |
| **5 — ciclo valendo, duas vezes** | 🟢 **ATUALIZADO — desbloqueado.** A `Q-LOTE-01` fechou (§16). Não executado: grava em produção |
| 6 — verificação final | ⏳ depois do 5 |

### Estado do banco de produção ao fim da sessão

```
usuarios=1  admins=1  tenants=1  vinculos=1  conectores=1
clientes=0  execucoes=0
```

Nenhum cliente espelhado ainda: o passo 5 nunca rodou, e o ensaio do passo 4
sempre terminou em `ROLLBACK`.

### Identificadores que a próxima sessão vai precisar

| O quê | Valor |
|---|---|
| `auth_user_id` (Supabase Auth do financeiro) | `efcc8e11-e2cf-4079-a649-92798fefdfc7` |
| `tenant_id` (**nosso**, G3 Solar) | `eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d` |
| `crm_tenant_id` (**deles**) | `d4640f4b-f833-4a80-a4db-ccced1956ae4` |
| CNPJ da G3 Solar | `66714022000121` |

### O que o primeiro ciclo real mediu

```
lidos .......... 48        (40 Vendas-Assinatura + 1 Vendas-Integracao + 7 Parceiros)
criados ........ 1         ANTES da Q-VALOR-01
recusados ...... 40        ANTES da Q-VALOR-01
garantia de tenant degradada: false     <- invariante 9 rodando
```

Depois da `Q-VALOR-01` os 41 ganhos de venda passaram a ser aceitos — e foi aí
que a `Q-LOTE-01` apareceu, porque 41 clientes não cabem numa transação de 15 s.

### O que falta para o passo 5 — é código, e não depende de ninguém de fora

**`Q-LOTE-01`, vermelha.** A `SPEC-002` R13 manda processar **por lote**, cada um
em transação própria, com `conector_execucao` atualizado ao fim de cada.
`executarCiclo()` foi escrito com o ciclo inteiro numa transação, e morreu com
`P2028` aos 15.330 ms.

A causa é **latência, não CPU**: ~5 idas ao banco por cliente × 41 ≈ 205 viagens
até `sa-east-1`. Junto disso há uma ineficiência que é minha:
`escreverEstadoCrm()` reconsulta o cliente por `crm_lead_id` embora
`espelharCliente()` já tenha o `id` em mãos — uma viagem desperdiçada por cliente.

**Não foi contornado subindo o `timeout`.** O critério §8 da `SPEC-002` é *"ciclo
com 1.000 linhas não estoura o timeout de 15 s"*, e afrouxar o limite para caber
48 linhas entregaria um conector que quebra no primeiro mês de crescimento.

Falta também o teste obrigatório `test_lote_respeita_timeout` da §9.

### Depois que a `Q-LOTE-01` fechar

```bash
set -a && . ./.env && set +a

# ensaio primeiro, sempre
npm run ciclo -- --ensaio  --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7

# valendo, DUAS vezes - a segunda e o criterio de saida
npm run ciclo -- --valendo --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7
npm run ciclo -- --valendo --auth-user efcc8e11-e2cf-4079-a649-92798fefdfc7

# verificacao final
npm test
psql "$DIRECT_URL" -f tests/catalogo.sql
```

**A segunda execução tem que sair com `criados: 0` e `atualizados: 0`.** É o
critério de saída *sync idempotente*, não conferência extra.

| Sinal no ciclo | O que significa |
|---|---|
| `garantia de tenant degradada: true` | alguma view perdeu `crm_tenant_id`. **Pare** e fale com o dev |
| `status: erro` com "zero linhas" | view veio vazia. **Não reconciliou nada, de propósito** (§7) |
| `recusados > 0` | o motivo vem impresso; conserta-se no CRM |
| `fila de revisao humana` | ausência que não é arquivo nem cópia derivada |

---

## 12. Onde a F1 fica depois do roteiro

| Critério de saída (`PRD` §10) | Estado |
|---|---|
| `migrate reset` limpo | ✅ já fechado — 15 migrations em banco vazio a cada `npm test` |
| sync idempotente | 🟡 **ATUALIZADO — desbloqueado.** Provado em 1.000 linhas pelo `N30`; falta rodar contra o CRM real (passo 5) |
| escrita no CRM falha por permissão | ✅ já fechado — `N21` (guarda de arranque) e `N25` (sessão read-only) |

**Duas coisas que não são critério de saída, e o dono decide se seguram a fase:**

1. **`Q-FASE-01`** — o `PRD` §10 põe o conector na F1; a `SPEC-002` diz F2. Agora
   dá para decidir vendo o conector pronto.
2. **`dono_usina` sem repositório** — é cadastro, e `usina.dono_usina_id` já aponta
   para lá. `regra_comissao`, `regra_repasse` e `tarifa` também não têm, mas são
   consumidos por F2/F3.

---

## 13. Higiene, depois de fechar

- ~~Rotacionar a `service_role` do Supabase do financeiro~~ — ✅ **feito em 27/07**.
- **A senha do `financeiro_ro` foi trocada duas vezes** durante a sessão, e uma
  versão dela chegou a aparecer no histórico da conversa. A que está no `.env`
  hoje é posterior a isso, mas vale conferir com o dev do CRM que ninguém guardou
  a antiga em lugar nenhum.
- `git rm --cached financeiro-sessao-5.patch` — versionado na raiz desde antes de
  o `.gitignore` cobrir `*.patch`.
- Apagar o projeto Supabase antigo (`us-west-2`).
- Decidir o push / PR do branch `sessao-8-conector` (7 commits, nada em `main`).

---

## 14. Pendências gerais

| Item | Estado | Dono |
|---|---|---|
| ~~**`Q-LOTE-01`** — R13 não implementada~~ | ✅ **ATUALIZADO — fechada em 27/07.** Lotes com transação própria, `N26`–`N31`, três plantios. Ver §16 | — |
| Passo 5 da §11 — ciclo valendo, duas vezes | 🟡 **ATUALIZADO — desbloqueado**, aguardando o dono | Vinicius |
| `Q-VALOR-01` — redação de R9/R14 na `SPEC-002` e o `consumo_referencia_centavos` | 🟡 decidida e implementada; falta o texto da spec | Vinicius |
| ~~Rotação da `service_role`~~ | ✅ feita em 27/07 | — |
| `Q-FASE-01` — conector é F1 ou F2 | 🟡 | Vinicius |
| `Q-PROV-01` — criar tenant sem caminho de aplicação | 🟡 três opções | Vinicius |
| `Q-PGNET-01` — `pg_net` concede `arwdDxtm` a PUBLIC | 🟡 tratado do nosso lado | dev do CRM |
| Rotas do conector (`SPEC-002` §6) | 🟡 `POST /conectores/:id/ciclo` | — |
| Repositórios: `dono_usina`, `regra_comissao`, `regra_repasse`, `tarifa` | 🟡 os três de vigência traduzem `23P01` | — |
| `Q-CLAUDE11-01` — a regra 11 sem mecanismo | 🟡 três opções | Vinicius |
| `MT-09` — `rls_auto_enable` | 🟡 `CAT-8` é detecção, não prevenção | Vinicius |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 | Vinicius |
| Reunião com o contador | 🔴 bloqueia F2/F3 | Vinicius |
| PgBouncer em modo *transaction* | 🔴 sem cobertura | — |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 é alíquota, não relatório | dev do CRM |
| Dev do CRM — segredos em `text` puro | 🔴 rotação, não migração de coluna | dev do CRM |
| **`MT-06` / auth ponta a ponta** | ✅ fechado hoje | — |
| **`Q-AUDIT-01`** | ✅ fechada hoje — migration 13, G6/G7 | — |
| **`Q-DISTRIB-01`** | ✅ fechada hoje — migration 13, `CAT-8` | — |
| **`Q-VIEWS-01`** | ✅ fechada hoje pelo dev — invariante 9 cumprido | — |
| **Conector do CRM** | ✅ construído hoje — 23 verificações | — |

---

## 15. Nota de método

**Esta foi a primeira sessão em que os invariantes pegaram o autor.** O `CAT-2`
recusou o índice parcial, o `G2` recusou a falta de gatilho, e o `N21` recusou a
guarda que eu mesmo tinha escrito. Nas três vezes a saída fácil era afrouxar a
regra — mudar as colunas do índice, acrescentar um nome à lista branca, baixar o
critério da guarda. O custo de obedecer foi uma linha em cada caso; o custo de
afrouxar seria o precedente, e este projeto já tem o dele: antes da migration 10 a
cobertura de trilha era de 4 tabelas em 13, e as 4 escolhidas não incluíam
`dono_usina` nem `originador`, onde moram as chaves PIX.

**Três correções foram de afirmações minhas, não de código.** A promessa ao dev do
CRM na rodada 2 (validar `crm_tenant_id` por linha) não tinha implementação; o
pedido de `security_invoker = true` teria quebrado a integração; o "0 privilégios
de escrita" veio de um método de medição que não enxerga grant a `PUBLIC` nem
privilégio herdado. As três foram para a carta do dev, em vez de sumirem.

**O `N10` é o argumento mais forte a favor de testar idempotência com dados de
formato real.** O defeito não era lógica: era `'850.0000'` contra `850`. Nenhuma
revisão de PR pegaria, nenhum log acusaria, e o sintoma em produção seria um
contador dizendo exatamente o que se espera de um sincronizador.

**E a lição da última hora vale por si: fixture de duas linhas não é volume.** A
suíte do conector passava inteira, com 25 verificações e os dois sentidos, e as
duas coisas que o primeiro ciclo real achou — a `Q-VALOR-01` e a `Q-LOTE-01` —
eram invisíveis para ela. Uma exigia os dados de verdade (40 ganhos sem
`valor_venda`); a outra exigia a **quantidade** de verdade (41 clientes não cabem
numa transação de 15 s). Nenhuma das duas é bug de lógica, e nenhuma apareceria
em revisão de PR.

**O que se manteve:** toda prova de escrita em `BEGIN … ROLLBACK`, e todo teste
novo verificado nos dois sentidos — passa contra o código correto e **acusa contra
a violação plantada**. Um invariante que só sabe passar não é invariante.

---

## 16. ADENDO — a `Q-LOTE-01`, fechada em 27/07

> Escrito depois do fechamento do corpo acima, na continuação da mesma sessão. O
> corpo não foi reescrito; só a §11 passo 5, a §12 e a §14 ganharam marca de
> **ATUALIZADO** nas linhas que ficariam ativamente erradas.

### O que mudou é uma inversão, não um ajuste

A R13 sempre disse o que fazer — *"um ciclo é uma unidade de trabalho por **lote**,
não uma transação gigante nem uma transação por linha"*. Cumprir isso exige que o
motor **abra** as transações, e não seja passageiro de uma. `executarCiclo()`
rodava dentro de um `withTenant` do chamador; agora recebe um `AbrirLote`
injetado, **pela mesma razão que já recebia a `PortaDeLeitura`**: o motor não
conhece `pg`, não conhece o `PrismaClient` e não emite contexto de tenant. Quem
emite continua sendo `src/db/contexto.ts`, ponto único, **uma vez por lote**.

A forma do ciclo passou a ser: abertura (papel, conferências, linha de
`conector_execucao`) → lotes de cadastro → reconciliação → fechamento. **A leitura
do CRM saiu de dentro da transação** — era rede para outro banco segurando conexão
do nosso pool, que tem teto.

### O tamanho do lote é 50, e o número saiu de medição

O que limita o lote é **viagem ao banco**, não linha. Com leitura e escrita em
bloco (`findMany`/`createMany`), medido pela extensão do Prisma nos `N27`/`N29`/`N30`:

| Lote de 50 | Viagens |
|---|--:|
| nada mudou (a segunda passada) | **4** |
| 50 criados | **6** |
| 50 atualizados — o pior caso | **54** |

A 75 ms por viagem — a latência que a própria `Q-LOTE-01` registrou, 15.330 ms
para ~205 viagens até `sa-east-1` — o pior lote custa **4,05 s**, folga de 3,7×
sobre os 15 s. **Um lote de 200 daria ~15,3 s no mesmo pior caso**, que é o
penhasco de onde a questão veio.

As ~5 viagens por cliente viraram ~0. A reconsulta desperdiçada em
`escreverEstadoCrm()` **desapareceu junto com a função**: o `id` do cliente passou
a ser gerado do nosso lado, exatamente para que `createMany` sirva.

### O teste mede viagens, não relógio — e é esse o ponto

`test_lote_respeita_timeout` (`SPEC-002` §9) são os `N26`–`N31`. **Cronômetro local
daria verde para o código que morreu em produção**: as mesmas 205 viagens que
levaram 15.330 ms contra `sa-east-1` levam menos de um segundo contra o
`127.0.0.1`. O que se mede é o que generaliza — **viagens por transação**, contadas
por uma extensão do Prisma (que pega inclusive o que o autor esqueceu de contar) e
projetadas contra a latência medida.

**Três plantios, porque um invariante que só sabe passar não é invariante:**

| Plantio | Quem acusa |
|---|---|
| lote em 1.000 (a transação única que morreu) | `N29` falha; o `N28` mede 1.004 viagens = **75.300 ms** projetados |
| contadores gravados só no fim | `N31` acusa: `0 → 0 → 0` em vez de `0 → 50 → 100 → 150 → 200` |
| guarda de reentrância removida | `N19c` acusa (`ContextoAninhado` no lugar de `CicloDentroDeTransacao`) |

**Limite honesto do `N27`, registrado porque quase passou batido:** sozinho ele
passa **mesmo com o lote em 1.000**, porque criar em massa é barato — 1.000
clientes saem em 20 `createMany`. Quem acusa a transação gigante é o `N29`, onde a
carga é de **atualização**, a única que não tem forma em bloco. Um teste de volume
que só exercita criação daria verde para a `Q-LOTE-01`.

### O que a correção criou, e virou questão em vez de improviso

A abertura agora **commita** `em_andamento` antes dos lotes — é o que a R13 exige,
e é o que finalmente faz o `EXCLUDE` da migration 14 valer contra um segundo ciclo
concorrente de verdade. O preço: um ciclo morto por `kill` deixa o registro preso,
e o `EXCLUDE` trava o conector. **O caminho normal está coberto** — exceção em
qualquer fase fecha o registro em `parcial` (§7) ou `erro`, na transação seguinte,
e o erro original é relançado. **A morte que não passa por `catch` não está**, e
escolher um prazo de expiração seria decidir no código quanto tempo um ciclo
legítimo pode demorar. Virou **`Q-CICLO-ORFAO-01`** (🟡, três opções), não default
escolhido "porque parecia razoável".

### O ensaio mudou de forma, e a diferença está impressa

`--ensaio` dá **ROLLBACK por lote**, não um ROLLBACK só. Mantém a promessa (nada é
gravado) e o caminho (o ensaio exercita o código do valendo — a lição desta
sessão). A consequência é honesta e vai no rodapé do relatório do script: no
ensaio nenhum lote enxerga o que o anterior escreveu, então a reconciliação só vê
o espelho que **já estava gravado**, e `desativados` do ensaio não antecipa o do
valendo.

### Estado dos testes

```
conector               35   (eram 25: +N19b/N19c, +N26a/N26..N31)
294 verificações em 18 suítes, EXIT=0
```

### O que falta para a F1 — e não é mais código

A `Q-LOTE-01` era a única vermelha da F1. **Passo 5 da §11 está desbloqueado e não
foi executado**: ele grava em produção, e a decisão é do dono. Os comandos estão
na §11, inalterados.

---

## 17. ADENDO — o passo 5 rodou, e a spec foi reconciliada

### O banco novo, verificado antes de qualquer coisa

O antigo (`us-west-2`) só sai depois de o novo provar que está inteiro. Medido em
`sa-east-1`, PostgreSQL **17.6**:

| Verificação | Medido |
|---|--:|
| Migrations aplicadas / presas | **15 / 0** (2 revertidas são as tentativas falhas da 10) |
| Tabelas com `tenant_id` | **16 — todas** com RLS **e** `FORCE` **e** policy |
| Policies | **26**, em 20 tabelas |
| RLS com zero policies | só `_prisma_migrations` — lista branca do `CAT-8` |
| Role de runtime | `app_financeiro_login`, `rolsuper=f`, `rolbypassrls=f` |
| Gatilhos `auditar_*` | **17** |
| `CAT-1` … `CAT-8` contra produção | **8/8** |

E o isolamento medido, não afirmado: **sem contexto → 0** linhas; **contexto certo
→ 1**; **contexto de outro tenant, com usuário válido → 0**.

CRM: `financeiro_ro`, sem `BYPASSRLS`, **8 views legíveis, 8 com `crm_tenant_id`,
0 privilégio de escrita em objeto de negócio**.

### O passo 5 — o critério de saída, contra o CRM real

```
ensaio    lidos 48   criados 41   recusados 0   garantia degradada: false
valendo 1 lidos 48   criados 41   recusados 0   4 transacoes, maior lote 41 de 50   5,7 s
valendo 2 lidos 48   criados  0   atualizados 0                                     5,2 s
```

**`criados: 0, atualizados: 0` na segunda passada** — *sync idempotente* cumprido.
E conferido no banco, não aceito do contador: 41 clientes, 41 `cliente_estado_crm`,
e **um único instante distinto de `criado_em`** nas 41 linhas, o que prova que a
segunda passada não tocou timestamp. `em_carteira` NULL nas 41, como a R7 manda.

Onde a `Q-LOTE-01` morria com `P2028` aos 15.330 ms, o ciclo agora fecha em **5,7 s**.

A trilha da regra 9, por consulta: 41 `INSERT` em `cliente` e 41 em
`cliente_estado_crm`, todos com `registro_id`, `usuario_id` e `depois`. E **4
`UPDATE` em `conector_execucao` para 2 ciclos** — a gravação de contadores por
lote da R13, visível na auditoria.

### Três testes obrigatórios que não existiam

| Teste | O que se descobriu |
|---|---|
| `test_vitima_de_merge_funde_espelho` → **`N32`–`N34`** | o código da fusão **existia desde a construção e nada provava que ela acontece**. O `N6` provava só a ordem da classificação |
| `test_conector_so_le_views_financeiro` → **`N35`/`N36`** | o cabeçalho da suíte **afirmava** que os testes `N1`/`N2` cobriam o invariante 2. **Eles nunca existiram** — e o `LeituraForaDoContrato` estava importado e nunca asserido |
| `test_estado_crm_so_conector` → **`N37`** | não há o que o banco imponha; a garantia é estrutural, e agora é verificada: **um único escritor em `src/`** |

O `N35` atende o critério §8 na forma que ele pede — *"verificado por **log de
query**, não por revisão"*: um pool interposto grava tudo que sai para o CRM e
confere objeto por objeto. Três plantios, todos acusando: fusão removida →
`N32`; consulta que **executa** e referencia `pg_catalog` → `N35`; segundo
escritor de `cliente_estado_crm` → `N37`.

> Vale registrar o plantio que **não** serviu: apontar a leitura para a tabela
> base `financeiro._vg` morreu por **permissão negada** antes de chegar ao
> detector. É a regra 4 funcionando — mas prova de guarda não é prova de teste, e
> o plantio teve que ser refeito com um objeto que a role consegue ler.

### A `SPEC-002` foi para a v1.3 — a spec estava atrás do código

Em SDD isso é a inversão que não se tolera: três fatos medidos viviam só em
comentário de código e em `QUESTOES.md`.

- **R9** ganha a redação da `Q-VALOR-01` — `consumo_kwh` conta como valor.
- **R14** perde a frase *"os funis de venda têm zero ganhos sem valor"*, **medida
  falsa**: eram 40 de 41. Ela ficou tachada, não apagada.
- **R13** ganha o **tamanho declarado (50)** e a conta de viagens que o fixa.
- **§8** sai de 9 critérios em aberto para **9 marcados com o teste nomeado**.
- **§9** ganha o teste de cada linha — e é onde a coisa fica desconfortável.

### O que a reconciliação expôs: `Q-ESCOPO-01`, vermelha

Ao nomear o teste de cada regra, uma linha não teve como ser preenchida. O
`test_atribuicao_por_partner_id` (R16) **não é teste faltando — é funcionalidade
faltando**, e puxar esse fio deu no seguinte, medido:

> A **§2 "Entra"** declara upsert em `cliente`, `unidade_consumidora`, `usina` e
> `usina_geracao`. O conector espelha **só `cliente`**. Das 8 views que
> `leitura.ts` sabe ler, o ciclo chama **3**.

Não é dívida cosmética: a R16 não tem onde acontecer porque o conector não cria
`contrato`, e **é este o bloqueio real da F2** — a base de faturamento é
`consumo_kwh × tarifa` por UC, e sem espelho de usina e de geração não há o que
faturar. Três opções registradas, nenhuma escolhida por mim.

### Onde a F1 está, de verdade

| Critério de saída (`PRD` §10) | Estado |
|---|---|
| `migrate reset` limpo | ✅ 15 migrations em banco vazio a cada `npm test` |
| sync idempotente | ✅ **contra o CRM real, duas execuções** |
| escrita no CRM falha por permissão | ✅ `N21`/`N21b`/`N25` + 0 privilégio medido |

**Os três critérios formais estão cumpridos.** O que segura a fase agora não é
critério do PRD — é a entrega nomeada *"conector CRM read-only"* estar a 1/4 do
que a própria spec declara (`Q-ESCOPO-01`) e a `Q-FASE-01` sem decisão.

### Testes

```
conector               41   (eram 25 no fim da sessao 8)
300 verificacoes em 18 suites (292 chk + 8 de catalogo), EXIT=0
```

---

## 18. ADENDO — as duas decisões, e o muro que a medição encontrou

### As decisões do dono, 27/07

**`Q-FASE-01` → o `PRD` §10 vence: o conector é entrega da F1.** O critério foi a
hierarquia do `CLAUDE.md`: a `SPEC-002` está *abaixo* do PRD, então era o cabeçalho
dela que divergia. A alternativa fecharia a F1 no mesmo dia — e teria sido
**alterar o PRD para acomodar o estado do código**, o precedente que esta sessão
já havia recusado três vezes (`CAT-2`, `G2`, `N21`). Resolvida.

**`Q-ESCOPO-01` → completar o escopo declarado da §2.** É a opção que não deixa a
spec mentindo. E foi ao medir para implementar que o chão cedeu.

### O que a medição das quatro views achou

Volume: `usinas` **3**, `rateio_clientes` **36**, `rateio_creditos` **36**,
`geracao_mensal` **8**, `parceiros` **9**.

| Entidade | Estado |
|---|---|
| `usina_geracao` | 🟢 **pronta.** 8 linhas, junção por `codigo_geradora`, e o enum `origem_geracao` já tem o valor `crm`. Depende só de `usina` |
| `usina` | 🟡 **uma decisão.** `distribuidora` vem **string vazia** nas 3 (`length = 0`), e `usina.distribuidora` é `NOT NULL` com FK para a tabela de referência, que tem **uma** linha. Também: `potencia_kwp` 0/3, `data_instalacao` 0/3, `dono_lead_codigo` 0/3 — este último confirma a `C1-crm` |
| `unidade_consumidora` | 🔴 **bloqueada, e não por pouco** |

### O muro: a carteira legada e o funil de vendas não se tocam

> Dos **36** `lead_id` de `rateio_creditos`, **ZERO** aparecem em `vendas_ganhas`.
> Por **nome**, os dois conjuntos coincidem em **42 pares, 24 pessoas distintas**.

A mesma pessoa é **dois leads** no CRM — um na carteira de rateio, outro no funil
de vendas. `RENATA LUCY…`, `THIAGO GONCALVES TAQUARY`, `ATAIDE DE MELO OLIVEIRA`
e mais 21.

A UC pendura em `cliente`. Espelhar `unidade_consumidora` a partir de
`rateio_clientes` criaria 36 clientes, **24 deles duplicatas de gente já
espelhada** — e o dedup da R4 **não pega**, porque ele é por `crm_lead_id` e os
ids são genuinamente diferentes. Não há improviso seguro aqui: casar por nome é
heurística sobre dado de dinheiro.

**Isto é a `F-01` do `PRD` §11 — que era pergunta de planejamento — virando
pré-requisito medido.** Registrada em `QUESTOES.md` como `F-01 (medida)`,
vermelha, com o número.

Dois achados menores do mesmo levantamento: **`data_vencimento` 0 de 36** (a §7 já
previa) e **uma UC repetida** — `000041446801282` em dois contratos (`G3-0141` e
`G3-0312`), na mesma usina. E um bom: a soma de `percentual_rateio` por usina é
**100,0 · 99,78 · 91,2** — a R11 está satisfeita nos dados de hoje.

### Por que parei aqui em vez de implementar

Duas das três entidades dependem de decisão que não é minha, e a terceira depende
de operação no CRM. Escrever o espelho de UC hoje significaria escolher entre
criar 24 duplicatas ou inventar um casamento por nome — e a regra 10 existe
exatamente para este momento. **Nada foi improvisado; a lacuna virou questão com
dono nomeado.**

---

## 19. ADENDO — `usina` e `usina_geracao` espelhadas, e a recusa que virou o produto

Decisão do dono, 27/07: **usina sem distribuidora é recusa contada, nunca default.**
Não é regra nova — é o **invariante 7** aplicado a outra entidade. A alternativa
(assumir `Equatorial`, a única cadastrada) teria acertado na prática e seria o
mesmo formato do erro que a `Q-VALOR-01` pegou: um default que parecia razoável.

### O que entrou

`espelharUsinas` e `espelharGeracao`, nos mesmos lotes da R13. A `PortaDeLeitura`
passou de 3 para **5 das 8 views**. As 3 que faltam alimentariam
`unidade_consumidora`, bloqueada pela `F-01 (medida)`.

**A ordem entre as duas é obrigatória, não preferência:** `usina_geracao` tem FK
composta para `usina`, então a usina precisa estar **commitada** antes. No mesmo
lote, uma geração órfã derrubaria o lote inteiro com `23503`.

A chave do espelho de usina é **`codigo_geradora`**, não `crm_usina_id` — regra 11:
`usina_codigo_unico` é índice único **cheio**, e `crm_usina_id` não tem unicidade
nenhuma. Navegar por coluna sem unique é pedir para o espelho duplicar em silêncio.

A `SPEC-002` ganhou a **§3.1** — campo espelho x campo local por entidade, com as
regras **R19** e **R20**. Era exatamente a lacuna que a `Q-ESCOPO-01` nomeava:
"completar o escopo" era inexecutável enquanto a spec não descesse ao nível de
coluna.

### O ciclo real, com as entidades novas

```
lidos 59 (48 vendas + 3 usinas + 8 geracoes)   criados 0   atualizados 0
recusados 11   status parcial   6 transacoes, maior lote 41 de 50

  0001 · 0002 · 0003   distribuidora vazia no CRM, e a coluna e obrigatoria
  8 linhas de geracao  a usina nao esta espelhada no financeiro   <- cascata
```

**As 11 recusas são o produto, não o defeito.** Foi exatamente essa contagem que
fez o dev do CRM corrigir as views no mesmo dia na `Q-VALOR-01`. O motivo de cada
uma está em `conector_execucao.detalhe`, com a quebra por entidade:

```json
{"cliente":       {"lidos":48,"criados":0,"atualizados":0,"recusados":0},
 "usina":         {"lidos":3, "criados":0,"atualizados":0,"recusados":3},
 "usina_geracao": {"lidos":8, "criados":0,"atualizados":0,"recusados":8}}
```

**A quebra vai no `detalhe`, não em colunas novas**, e a escolha tem motivo: os
contadores da tabela existem para a invariante 8 — *"`recusados > 0` é visível em
tabela"* —, e essa pergunta é respondida pelo **total**. Quem quer saber *o quê* já
precisa abrir o `detalhe`. Uma migration com cinco colunas por entidade não
compraria nada.

**E a idempotência sobreviveu:** segunda passada com as entidades novas ainda sai
`criados: 0, atualizados: 0`.

### Uma imprecisão que só apareceu porque o ciclo passou a ser parcial

`conector_status` só tem `ok|erro|nunca_executou`, então `parcial` cai em `erro` —
e a mensagem dizia *"ciclo nao concluiu"*. **Um ciclo parcial concluiu:** ele
recusou linhas e registrou o motivo. Era teórico até hoje; com as 3 usinas sem
distribuidora, **todo** ciclo passa a ser parcial até o dev corrigir, e "não
concluiu" mandaria procurar uma falha que não existe. Mensagem trocada por
*"concluiu PARCIAL: N recusa(s)… o motivo está em `conector_execucao.detalhe`"*.

### Testes

`N38`–`N44`, sete novos, **três plantios verificados**:

| Plantio | Quem acusa |
|---|---|
| default `Equatorial` em vez de recusar — o improviso que a decisão rejeitou | `N41` (`rec=1` em vez de 2, e a usina gravada) |
| geração órfã engolida em silêncio | `N43` (`rec=0`) |
| `potencia_kwp` nula virando `'0'` | `N39` |

> Registro de um plantio que **não** serviu: remover só a guarda, deixando o
> espelho intacto, **estoura no Prisma** (`Argument distribuidora is missing`) em
> vez de acusar limpo. Informativo — mostra que a remoção parcial não grava lixo
> em silêncio — mas não prova o teste. Teve que ser refeito com o improviso
> **completo**, que é o que a decisão de fato rejeitou.

**307 verificações em 18 suítes** (299 `chk()` + 8 de catálogo), `EXIT=0`.

### Para a próxima carta ao dev do CRM

1. **`financeiro.usinas.distribuidora` vem `''` nas 3** — string vazia, não NULL. É o que bloqueia o espelho de usina e, em cascata, o de geração.
2. **`dono_lead_codigo` e `dono_lead_nome` vêm nulos nas 3** — confirma a `C1-crm`; sem eles não há como ligar `usina.dono_usina_id`.
3. **UC repetida:** `000041446801282` em dois contratos (`G3-0141` e `G3-0312`), mesma usina.
4. **A `F-01`, com número** — 36 leads de rateio, **zero** em `vendas_ganhas`, e **24 pessoas** duplicadas entre os dois conjuntos. Esta é de operação, não do dev.

---

## 20. ADENDO — a `ATIVO-01` foi encerrada por um sintoma

Esclarecimento do dono, no fim de 27/07, e ele corrige uma conclusão minha e do
registro da sessão anterior.

**A ausência de `vendas_ganhas` para os 36 do rateio não é defeito nem dado
faltando.** A carteira legada nunca passou pelo funil de vendas como ganho — era
esperado que fosse assim. O que não existe é um **vínculo ainda não criado**, e o
dono nomeou onde ele nasce:

> *"quando dar ganho em rateio vai para clientes ativos"*

Ou seja: o caminho de ligação **não** é casar rateio com `vendas_ganhas`. É o funil
`Clientes ativos`, e é de lá que o financeiro deve puxar cliente ativo.

### O que isso reabre

A **`ATIVO-01`** foi fechada em 26/07 "por fato": o funil `Clientes ativos -
Assinatura` estava **vazio**, logo a fonte de estado ativo trocaria para
`financeiro.rateio_clientes`. **A medição estava certa; a conclusão, não.** O
funil está vazio porque a etapa-fonte (`Rateio Concluido`) tem
`stage_type='normal'` e **não dispara a automação** — isso é configuração do CRM,
não desenho. Encerrar a questão pelo estado vazio foi **tomar ausência de dado
como resposta de desenho**.

### A consequência está no código, e ela é uma inversão

A §4.3 classifica `Clientes ativos - Assinatura` como **cópia derivada** — *não
desativa e não conta*. Se o funil vira **fonte de verdade do cliente ativo**, esse
`continue` passa a **ignorar exatamente a população que deveria ser lida**.

As duas coisas podem ser verdadeiras ao mesmo tempo — população mantida por sync
*e* fonte de estado —, e é por isso que não dá para decidir por dedução.

**Nada foi alterado no código.** O funil está vazio hoje; mudar agora seria
implementar contra um estado futuro, sem teste possível, desfazendo por dedução a
classificação que a medição do dev justificou. Virou **`Q-ATIVOS-01`** (🔴), com
comentário de aviso na própria constante `FUNIL_COPIA_DERIVADA`, e a ordem das
ações registrada: **primeiro o dev corrige o `stage_type`**, depois se mede o
funil populado, e só então se reescreve a §4.3.

### Nota de método

Esta é a segunda vez na sessão em que **uma questão fechada "por fato" estava
fechada cedo demais** — a primeira foi o `CAT-3`, cujo comentário nomeava
`distribuidora` como exemplo do que ignorar, com a premissa falsa em produção. O
padrão é o mesmo: **medir o estado atual e concluir sobre o desenho.** Estado vazio
não distingue "não é aqui que o dado mora" de "o dado ainda não chegou aqui" — e a
diferença entre as duas é a diferença entre trocar de fonte e consertar o CRM.

---

## 21. ADENDO — a resposta do dev do CRM (rodada 4), e o que ela mudou de desenho

Nove itens perguntados, nove respondidos, e a resposta foi melhor que a pergunta:
em vários pontos o dev **leu o modelo dele antes de opinar** e descartou hipóteses
por evidência, não por impressão.

### O item que mudou código: `distribuidora` não é dado deles

> *"A view é projeção direta, sem `coalesce` — o `''` está em `public.usinas.distribuidora`
> mesmo. (…) **Não há tabela de referência de distribuidoras do nosso lado.**
> Tratar como cadastro local de vocês está correto."*

**A R19 nasceu de uma premissa errada minha.** Em 27/07 ela dizia *"usina sem
distribuidora é recusa contada"*, supondo que o CRM deveria preencher e ainda não
preenchia. **Não deveria.** A distribuidora é dado **nosso** — logo é **campo
local** (`SPEC-001` §3.3), e campo local o usuário vence.

E daí segue, necessariamente: como a coluna é `NOT NULL` com FK e o conector nunca
a escreve, **o conector não cria usina**. Ele espelha as que alguém cadastrou.

A recusa continua existindo e continua contada. O que mudou foi **de quem ela
cobra ação** — antes cobrava do dev, que é o endereço errado. Agora diz *"cadastre
a usina e o próximo ciclo espelha o resto"*.

**O `N39` quase não valeu nada, e vale registrar.** Ele prova que o campo local
sobrevive ao ciclo. Na primeira versão o valor local era `Equatorial` e o plantio
da sobrescrita gravava `Equatorial` — **o teste passou com a violação plantada**,
porque escrever o mesmo valor é indistinguível de não escrever. Corrigido para
valores distintos (`Equatorial GO` local, `Equatorial` vindo do CRM), e aí o
plantio acusa. *Um teste que não distingue os dois lados não é teste — é um
`assert true` com nome bonito.*

### O item 6: o dev corrigiu a própria premissa dele, e eu tinha construído em cima

O funil Rateio tem **duas** etapas coexistindo desde 29/06:

| Etapa | Tipo | Cards | Posição |
|---|---|--:|--:|
| `Rateio Concluído` | `normal` | **28** | 7 |
| `Desconto Ativo` | **`won`** | **0** | 8 |

**A automação "Rateio → Clientes Ativos" está habilitada** e dispara na entrada em
`Desconto Ativo`. O histórico registra **zero entradas em `Desconto Ativo` na vida
do funil**.

Ninguém parou a automação: **ela está armada e nunca disparou**, porque a operação
trata `Rateio Concluído` como terminal e não move o card. O desenho — etapa `won`
separada, automação ligada apontando para ela — **diz que a expectativa era
avançar**. A prática nunca acompanhou.

Classificação do dev, e é a honesta: **drift operacional, não decisão.** Isso
confirma o que o dono já havia dito e fecha a metade da `Q-ATIVOS-01` que era do
CRM. Resta decisão do dono: (a) a operação passa a mover os cards, ou (b) a
automação passa a escutar `Rateio Concluído`. **Até uma das duas acontecer, a §4.3
não se mexe** — medir o funil populado vem antes.

### Três achados novos que vieram de brinde

**`UC-DUP-01`** — a UC repetida é **provável erro de digitação**, e o dev descartou
as alternativas por leitura do modelo: não é troca de titularidade (não há status
nem data-fim em `usina_clientes`; as duas linhas estão vivas) e não é "dois
beneficiários por UC" (a unicidade lá é `(tenant_id, lead_id)`). Dois leads
distintos, mesmo percentual (5,5 %), **39 minutos de diferença em 14/07** — o dia
da carga manual de 28 dos 36 contratos, pelo mesmo usuário. **Ele confirmou que o
nosso modelo de UC única por tenant está certo.**

**`GERACAO-01`** — a série é digitação manual da fatura, sem sinal de "competência
completa": o sistema deles **não distingue "não gerou" de "não foi lançado"**. E o
cruzamento é dele: **a `0003` é justamente a usina com um cliente a 100 % do
rateio** — crédito prometido sobre geração nenhuma lançada. Para a F2 isso vira
regra: **ausência de série não é zero**, mesmo modo de falha da R9 numa entidade
nova.

**`RATEIO-TETO-01`** — o percentual é digitado à mão lá, então 99,78 % e 91,20 %
são transcrição, não resíduo do sistema. E o CRM **deliberadamente não força fechar
100**: política anti-overbooking com margem default de 5 %. **A nossa R11 é teto
duro em 100.** Hoje não colide, mas a margem deles pode em tese admitir soma que a
nossa constraint recusaria. Recomendação do dev, adotada: **a F2 trata a sobra como
"não alocado" e não a classifica** até a operação dizer se é capacidade a vender ou
erro de transcrição.

### Nota de método

**Duas premissas erradas caíram nesta rodada, e nenhuma era de código** — eram de
leitura. A minha (distribuidora é dado do CRM) e a do próprio dev (a automação
estaria parada). As duas sobreviveram semanas porque ninguém tinha perguntado
diretamente; caíram em uma carta.

Vale contra o instinto de "perguntar depois, implementar agora": eu já tinha
implementado a R19 na leitura errada, com teste e plantio, e o teste **passava**.
Um invariante bem testado sobre uma premissa falsa é exatamente tão errado quanto
um sem teste — e mais caro de desfazer, porque parece verificado.

---

## 22. ADENDO — `unidade_consumidora` espelhada, e a F1 sem vermelhas

Decisão do dono, 28/07, e ela só ficou possível **depois** da resposta do dev:
**espelho fiel**. Os 36 leads de rateio são espelhados pelo próprio `crm_lead_id`.

A duplicidade — 24 pessoas que existem como dois leads — **passa a ser fiel**: ela
está no CRM, e o conector espelha em vez de consertar a origem. Quando o dedup do
CRM mesclar os pares, `lead_merges` avisa e `fundirEspelho` consolida sozinho, com
a maquinaria já testada nos `N32`–`N34`. **E não há risco de faturar duas vezes:**
a cobrança segue UC e contrato, e só o lead de rateio tem UC.

### Quatro regras novas, e três delas nasceram de um erro de integridade evitado

| | |
|---|---|
| **R21** | A UC **herda a distribuidora da usina** vinculada. O conector não escolhe valor — propaga o que o usuário cadastrou. **Precisa de confirmação:** `Q-UC-DISTRIB-01` |
| **R22** | UC repetida entre contratos é recusa contada. **Sem a guarda, o `23505` derruba o lote inteiro** — foi o que o plantio mostrou |
| **R23** | Contrato de rateio que muda de UC é recusa contada. O `uc_crm_unico` é parcial e a regra 11 proíbe navegar por ele, **mas ele existe no banco e viola** |
| **R24** | `cliente_estado_crm.tem_rateio_ativo` finalmente tem quem o escreva — nascia `NULL` desde a migration e nenhum caminho preenchia |

**A chave do espelho é `numero_uc`, não `crm_usina_cliente_id`**, e a escolha é da
regra 11: o índice do segundo é **parcial**. Foi a regra pagando de novo.

**A R23 apareceu porque a suíte morreu.** O teste reutilizou um `contrato_id` e o
`uc_crm_unico` violou — eu ia corrigir só a fixture, mas o mesmo caminho existe em
produção: um contrato que mude de UC no CRM derrubaria o lote inteiro. Corrigi os
dois. *Bug de teste que denuncia bug de código é o teste ganhando duas vezes.*

### O ciclo real

```
lidos 95   criados 35   atualizados 0   recusados 47   7 transacoes

cliente ............ lidos 48   criados 35   recusados  0
usina .............. lidos  3   criados  0   recusados  3
usina_geracao ...... lidos  8   criados  0   recusados  8
unidade_consumidora  lidos 36   criados  0   recusados 36
```

Segunda passada: **`criados: 0, atualizados: 0`** — idempotente com as quatro
entidades. Estado em produção: **76 clientes espelhados**, 35 com
`tem_rateio_ativo`, 41 com `tem_venda_ganha`.

**As 47 recusas são uma cascata com uma única raiz:** as 3 usinas não estão
cadastradas localmente. Sem usina, não há distribuidora para a UC herdar (R21) nem
onde pousar a geração. **Um cadastro de 3 linhas destrava 35 UCs e 8 competências
de geração.**

### Onde a F1 está

**A `Q-ESCOPO-01` fechou:** as quatro entidades da §2 estão implementadas, e a
`PortaDeLeitura` foi de 3 para **7 das 8 views** (falta `parceiros`, que alimenta
`originador` — F3).

**A F1 não tem mais nenhuma vermelha.** O que resta é dado e cadastro, não código:

| | Quem |
|---|---|
| Cadastrar as 3 usinas com a distribuidora | operação (3 linhas) |
| `Q-UC-DISTRIB-01` — confirmar a herança da distribuidora | Vinicius |
| `Q-ATIVOS-01` — mover cards ou mudar o gatilho da automação | Vinicius + operação |
| `UC-DUP-01` — conferir a UC repetida contra o rateio oficial | operação |

**313 verificações em 18 suítes** (305 `chk()` + 8 de catálogo), `EXIT=0`.

---

## 23. ADENDO — as 3 usinas cadastradas, e o espelho fecha

O dono confirmou em 28/07 que as três usinas existem na gestão de usinas do CRM e
autorizou o cadastro local. **Era o único ponto que segurava a cascata inteira.**

### Feito pelo caminho da aplicação, não por `psql`

`scripts/cadastrar-usinas.ts` (`npm run usinas`), com `--ensaio`/`--valendo` como
todo script de escrita deste projeto. Entra por `app.login()`, roda dentro de
`app.withTenant()` e escreve por `repos/usina.criar()`, que chama
`exigir('escrever_cadastro')`. **Um `INSERT` por `psql` pularia a matriz de papéis,
a policy `WITH CHECK` e o gatilho de auditoria** — e a regra 9 manda gravar quem,
quando, antes e depois.

**O cadastro é deliberadamente mínimo: só `codigo_geradora` e `distribuidora`.**
Tudo o mais é campo espelho, e quem preenche é o ciclo. Digitar aqui o que a
integração busca sozinha criaria a dúvida de qual dos dois vence na divergência.

O resultado é a separação espelho/local visível numa linha só:

| `codigo_geradora` | `distribuidora` | `apelido` | `geracao_nominal_kwh` | `crm_usina_id` |
|---|---|---|--:|---|
| `0001` | **Equatorial** *(local)* | 1.707.852.012-59 | 10800,0000 | ✅ |
| `0002` | **Equatorial** *(local)* | 401269001287 | 10000,0000 | ✅ |
| `0003` | **Equatorial** *(local)* | 4.077.023.012-90 | 10000,0000 | ✅ |

*(o `apelido` vindo do CRM é um documento, não um nome — é o que está lá)*

### O ciclo depois do cadastro

```
lidos 95   criados 43   atualizados 3   recusados 1     <- eram 47
```

**De 47 recusas para 1.** As 43 criações são 35 UCs + 8 competências de geração; os
3 atualizados são as usinas recebendo os campos de espelho. Segunda passada:
**`criados: 0, atualizados: 0`**.

### O espelho, completo

| | |
|---|--:|
| clientes espelhados | **76** |
| usinas | **3** |
| unidades consumidoras | **35** |
| competências de geração | **8** |
| `tem_rateio_ativo` | **35** |

**Rateio por usina, com a R11 satisfeita:**

| usina | UCs | soma |
|---|--:|--:|
| `0001` | 20 | 94,28 % |
| `0002` | 14 | 91,20 % |
| `0003` | 1 | 100,00 % |

A `0001` tem **20** UCs e 94,28 %, não as 21 e 99,78 % medidas no CRM — a diferença
é exatamente a UC recusada (5,50 %). **Os números fecham**, e o que falta é o dado
que o dev já apontou como provável erro de digitação.

### A única recusa que restou

> `UC 000041446801282 aparece em mais de um contrato de rateio no mesmo ciclo. O
> conector nao escolhe qual vale (UC-DUP-01): confira contra o rateio oficial da
> distribuidora.`

É a `UC-DUP-01`, e ela agora é **o único ruído em 95 linhas lidas**. Antes estava
enterrada em 47 recusas; agora é a coisa que sobra na tela. *Contagem de recusas
que cai até virar sinal é o que a invariante 8 existe para produzir.*

### Nota: a geração da `0003` continua vazia, e agora isso importa mais

A `0003` tem **um cliente a 100 % do rateio** e **zero competências de geração**
espelhadas — o `GERACAO-01`, que o dev levantou. Com o espelho completo, isso
deixou de ser observação e virou **linha visível no banco**: há crédito prometido
sobre geração que ninguém lançou. A F2 não pode tratar essa ausência como zero.

---

## 24. ADENDO — a usina tem duas medidas, e o sistema controla uma

Esclarecimento do dono, 28/07:

> *"existem dois fatores diferentes: o quanto ela será usada e o quanto ela já foi
> usada, funcionando para evitar overbooking"*

Traduzido para o que existe hoje:

| Medida | O que é | Controlado? |
|---|---|---|
| **Quanto SERÁ usada** | Σ `percentual_rateio` das UCs contratadas | ✅ `SPEC-001` R11 — trigger deferido rejeita acima de 100 %, e `rateio_por_usina` classifica |
| **Quanto JÁ FOI usada** | crédito consumido contra a geração da competência | 🔴 **não existe controle nenhum** |

**As duas juntas é que evitam overbooking. Hoje só a primeira existe.**

E há um sintoma dessa confusão **dentro do código**: a mensagem de erro da R11 em
`repos/rateio.ts` diz *"isso alocaria credito que a usina nao gera"* — misturando
**alocação** com **geração**, que é exatamente a distinção que o dono acaba de
separar. A frase estava lá desde a migration e ninguém tinha percebido que ela
descreve duas coisas como se fossem uma.

**O caso concreto já está no banco, e ele só ficou visível hoje** porque o espelho
fechou: a usina `0003` tem **1 UC com 100 % alocado** e **zero geração lançada**.
Pela R11 ela está `completo` e passa — não há invariante que note que não há nada
atrás. Antes desta sessão isso era invisível; agora é uma linha consultável.

Registrado como **`RATEIO-USO-01`**, vermelha, bloqueando a F2 — porque sem a
decisão a base de faturamento é ambígua entre **contrato** e **medição**. Três
opções registradas, nenhuma escolhida por mim; a terceira é a `Q-021` do `PRD` §11
e tem dimensão fiscal, que entrou na `PAUTA-contador.md` §10.

**Nota:** o `GERACAO-01` fica mais pesado com isso. O dev confirmou que o CRM **não
distingue "não gerou" de "não foi lançado"** — então o segundo invariante, se for
escolhido, precisa decidir o que fazer com ausência de série antes de poder
comparar consumo com geração.
