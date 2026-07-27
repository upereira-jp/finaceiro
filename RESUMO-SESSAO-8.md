# RESUMO-SESSAO-8 — 27/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Fechar a fila da sessão 7, evidenciar em que fase o projeto está, e construir o conector do CRM |
| **Método** | Nada afirmado sem medição; toda prova de escrita em `BEGIN … ROLLBACK`; teste novo verificado **nos dois sentidos**; contradição encontrada vira entrada em `QUESTOES.md`, nunca conserto silencioso |
| **Achados** | 10, todos medidos. Cinco viraram questão nova, cinco viraram correção com teste |
| **Resultado** | Auth fechado. Conector construído e ligado ao CRM real. **Passos 1 a 4 da §11 EXECUTADOS.** A F1 não fechou por **uma** razão, e ela é de código: a `Q-LOTE-01` |
| **Testes** | **285 verificações em 18 suítes**, `EXIT=0`. Os 8 invariantes de catálogo passam **também contra produção** |

> **Este documento contém o roteiro completo para fechar a F1 — §11.** Ele
> absorveu o `FECHAR-F1.md`, que existiu por algumas horas e foi removido: dois
> documentos com o mesmo roteiro divergem, e este projeto já removeu o
> `LEIA-ME-retomada.md` pelo mesmo motivo. Se você veio para terminar a fase, vá
> direto à §11.

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
| **5 — ciclo valendo, duas vezes** | 🔴 **BLOQUEADO pela `Q-LOTE-01`** |
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
| sync idempotente | 🔴 **bloqueado pela `Q-LOTE-01`** — o ciclo não completa contra volume real |
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
| **`Q-LOTE-01`** — R13 não implementada, ciclo estoura o `timeout` | 🔴 **bloqueia a F1. É o primeiro trabalho da próxima sessão** | — |
| Passo 5 da §11 — ciclo valendo, duas vezes | 🔴 depende da `Q-LOTE-01` | Vinicius |
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
