# RESUMO-SESSAO-7 — 27/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Abrir o portão da sessão 6 (role de runtime) e subir a camada de aplicação em cima dele |
| **Método** | Isolamento provado **conectado pela role de runtime**, não pela `postgres`; toda prova de escrita dentro de `BEGIN … ROLLBACK`; contradição encontrada vira entrada em `QUESTOES.md`, nunca conserto silencioso |
| **Achados** | 4, todos medidos. Dois viraram questão nova, dois viraram decisão do dono |
| **Resultado** | **Portão aberto.** Role de runtime, composition root, 4 repositórios, 37 rotas e auth próprio. `npm test` = **257 verificações em 17 suítes**, `EXIT=0` |

---

## 1. A role de runtime existe, e o isolamento foi provado por ela

Era o item 1 da fila da sessão 6 e bloqueava todo o resto.

`app_financeiro_login` criada no Supabase `sa-east-1`: `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `INHERIT`, membro de `app_financeiro`. `DATABASE_URL` aponta para ela em session mode na 5432.

**O que importa não é a role ter sido criada, é a prova ter rodado por ela.** Tudo dentro de uma transação com `ROLLBACK` — o banco voltou a zero:

| Cenário | Resultado |
|---|--:|
| usuário A no tenant A | 1 linha ✅ |
| usuário B no tenant B | 1 linha ✅ |
| sem contexto nenhum | 0 linhas ✅ |
| **usuário A apontando o contexto para o tenant B** | **0 linhas** ✅ |
| **usuário A tentando escrever no tenant B** | **recusado** ✅ |

As duas últimas são o cenário da regra 6: trocar um `tenant_id` por outro não falha em compilação nem em runtime, devolve dado de outra empresa. Devolveu nada.

A prova gerou **6 linhas de auditoria** enquanto rodava, o que fecha uma dúvida que valia a pena ter: a trilha da regra 9 funciona sob uma role **sem** `BYPASSRLS`. O mecanismo é `app.auditar()` ser `SECURITY DEFINER` com owner `auditor_financeiro` — escreve sob a policy `auditoria_escrita_do_gatilho`, e a role de runtime não precisa ser membro de `auditor_financeiro`. `app_financeiro` tem `SELECT` em `auditoria` e não tem `UPDATE` nem `DELETE`: o append-only continua de pé.

**Erro meu no caminho, registrado porque a correção é informativa.** A primeira execução falhou: montei o fixture criando cliente com contexto de tenant mas **sem usuário vinculado**, e a `policy_exige_vinculo` recusou. A policy de `cliente` é `tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant()` — contexto de tenant sozinho não basta. Refeito pelo caminho real (usuário + `usuario_tenant` + `app.usuario_id`), que de quebra é o que tornou possível o teste de ataque acima. A recusa estava certa; o fixture é que estava errado.

## 2. Não havia composition root — e a `DATABASE_URL` não era lida por ninguém

`criarPools()` recebia a connection string por parâmetro e **nenhum arquivo de `src/` lia `DATABASE_URL`**. Cada suíte montava o seu próprio client. Isso funciona em teste e não existe em produção.

`src/app.ts` resolve, com duas decisões que valem o registro:

**O `PrismaClient` cru não é exportado.** Quem tem o client cru lê fora de contexto de tenant, e leitura fora de contexto devolve zero sem erro. Sai de lá `withTenant`, `withRelatorio`, `comoPlataforma`, `login` e o client **protegido** por `comGuarda` — onde `$queryRaw` passa (o login precisa) e operação de modelo lança. Teste A7 confere a lista de exportados, para que a garantia não dependa de disciplina.

**`conferirRoleDeRuntime()` recusa o arranque** se a role tiver `BYPASSRLS` ou for `SUPERUSER`. Transforma o pior modo de falha do projeto — conectar como `postgres`, passar em todos os testes, vazar meses depois — em falha de boot. O teste A2 conecta de propósito como superusuário e exige a recusa.

## 3. A regra 11 perdeu o mecanismo que declara — e ninguém foi avisado porque nada falhou

O achado mais desconfortável da sessão.

A regra 11 do `CLAUDE.md` afirma: *"O Prisma já exclui parcial das chaves de `findUnique` — verificado no DMMF"*, e `src/repos/cliente.ts` repete a afirmação em comentário. **Medido em 27/07 nos tipos gerados: é falso hoje.**

Com `previewFeatures = ["partialIndexes"]` ligado no generator (`prisma/schema.prisma` linha 4), o `db pull` passou a emitir `where: raw(...)` nos `@@unique` parciais, e as chaves **aparecem** em `findUnique`:

| Índice | Predicado | Chave em `findUnique` |
|---|---|---|
| `cliente_documento_unico` | `WHERE documento IS NOT NULL` | `tenant_id_documento` — **presente** |
| `uc_crm_unico` | `WHERE crm_usina_cliente_id IS NOT NULL` | `tenant_id_crm_usina_cliente_id` — **presente** |

A proteção automática que a regra supunha existir **não existe mais**, e o `findUnique` errado agora compila. Para um predicado que não seja `IS NOT NULL` — o caso do `contrato_ativo_unico_por_uc`, que originou a regra — várias linhas compartilham a chave e o Prisma devolve uma arbitrária. É exatamente o modo de falha dos R$ 111,00 contra R$ 789,00, com a rede removida.

**E o `CAT-1` não cobre isto.** Ele acusa índice parcial que cobre exatamente as colunas de uma **FK**, que é outro caso. Não há invariante para "parcial virou chave de `findUnique`".

Os repositórios escritos hoje usam `findFirst` com predicado explícito e não dependem da proteção automática. O furo é para quem escrever o próximo. Registrado como **`Q-CLAUDE11-01`**. **A regra não foi editada** — alteração de norma tem dono.

## 4. A matriz de papéis implementada contradizia o PRD, e a contradição era permissiva

`src/db/contexto.ts` declarava `escrever_cadastro: ['admin', 'financeiro']`. O `PRD-v2.2` §3, nível tenant, dá ao papel `financeiro` apenas **leitura** na coluna *Cadastros*. Os outros três eixos conferiam.

Ou seja: o sistema **concedia mais do que a especificação**, e o teste de RBAC não pegava porque conferia a matriz implementada contra ela mesma.

**Decisão do dono, tomada nesta sessão:** alinhar ao PRD — `escrever_cadastro: ['admin']`. O critério foi a hierarquia normativa do `CLAUDE.md` (`PRD → ADRs → SPECs`): código não está nessa lista, ele implementa, então divergência entre código e PRD é defeito do código. E a direção da divergência decidiu o resto — restringir é reversível, descobrir excesso de permissão em produção não.

Descartado um meio-termo que separaria "cadastro operacional" de "cadastro que define dinheiro": inventaria vocabulário ausente de todo documento, que foi exatamente como `escrever_cadastro` nasceu divergente.

**Consequência operacional, registrada para não surpreender:** só `admin` cadastra cliente, UC, usina, originador e contrato. Se travar a operação, o conserto é a §3 do PRD, nunca o `contexto.ts`.

## 5. O achado dentro do achado: a mudança de matriz não quebrou nenhum teste

Restringir `escrever_cadastro` passou com `EXIT=0` na primeira tentativa. Isso não foi tranquilizador — foi diagnóstico.

**Provou que a matriz nunca esteve coberta.** As suítes usavam `admin` para escrever e `leitura` para ser negada; os dois papéis do meio não apareciam em teste nenhum. Foi por isso que a divergência sobreviveu até ser encontrada por leitura, e não por CI.

`tests/matriz-papeis.ts` fixa as **16 células** (4 papéis × 4 eixos) como transcrição literal da tabela do PRD, com os quatro papéis existindo na fixture. Verificado nos dois sentidos, como o `CAT-7` da sessão anterior: replantada a matriz antiga, o teste **acusa** em P6 e P17 — as duas células certas. Invariante que não sabe falhar não vale nada.

## 6. Auth próprio, e o ataque que o verificador precisa impedir

**`MT-06` resolvida pelo dono:** auth próprio, sem SSO com o CRM. De lá o financeiro só lê lead ativo, e leitura de dado não é motivo para acoplar identidade — acoplar faria o ciclo de vida da conta no CRM governar o acesso ao sistema de dinheiro.

`src/auth/jwt.ts` verifica JWT do Supabase Auth **do projeto do financeiro** com `node:crypto`, **sem dependência nova**. `usuario.auth_user_id` é o `sub` desse emissor e de nenhum outro — o teste J9 recusa token cujo `iss` seja o do CRM, que é a decisão virando mecanismo em vez de convenção.

A proteção que justifica não usar um `jwt.verify` qualquer é a **confusão de algoritmo**: o atacante assina HS256 usando a chave **pública** como segredo HMAC e manda `alg: HS256`; chave pública é pública, e o verificador que obedece o header aceita. Aqui o algoritmo sai da **chave configurada**, nunca do header. O teste J15 monta o ataque e exige a recusa.

Também coberto: `alg: none` recusado, HMAC comparado em tempo constante, **`exp` obrigatória** (ausência não pode significar "nunca expira"), `sub` validado como UUID antes de virar `uuid` no banco, JWKS com cache e teto de rebusca, e o motivo da recusa ficando no log — o cliente recebe sempre `Credencial invalida.` (J23).

**Recomendação registrada no `.env.example`:** prefira o JWKS assimétrico ao `SUPABASE_JWT_SECRET`. Com o segredo simétrico o servidor não só verifica, ele consegue **assinar** — quem o ler forja token de qualquer usuário.

## 7. A camada HTTP: 37 rotas, e a matriz não é aplicada nelas

`node:http` puro, nenhuma dependência nova. Cobrem cliente, UC, usina, originador, contrato e rateio.

**A matriz de papéis não é aplicada no handler.** Ela mora no repositório, em `exigir()`, pelo motivo que o `contexto.ts` já registrava: *"um repositório chamável sem checagem é o furo"*. A consequência é boa — um handler novo que esqueça de checar papel não abre buraco, porque a checagem não está nele. As rotas escolhem a unidade de trabalho (transacional ou relatório) e traduzem corpo em argumento.

`src/http/erros.ts` existe pela mesma queixa que o projeto faz das policies sem policy: **o modo de falha tem que contar o que aconteceu.** `P2003` vira 422 `ReferenciaInvalida`; o teto da R11 vira 422 **nomeando a usina**; float em centavos vira 422. E o inverso — erro não previsto sai 500 genérico, com o detalhe no log. O teste H19 confere que a resposta não contém `prisma`, `postgres`, `column` nem `relation`.

O teste que mais importa é o **H7**: tenant fora dos vínculos devolve **404, nunca 403** — 403 confirmaria que aquele tenant existe. É a R1 chegando intacta até o HTTP.

---

## Estado dos testes

```
documento              17 verificacoes      0 falhas
isolamento             20 verificacoes      0 falhas
RBAC                   15 verificacoes      0 falhas
regras                 12 verificacoes      0 falhas
auditoria              29 verificacoes      0 falhas
catalogo                7 invariantes       CAT-1 a CAT-7, nenhuma falha
middleware             12 verificacoes      0 falhas
sessao                 15 verificacoes      0 falhas
matriz de papeis       18 checks            NOVA - as 16 celulas do PRD 3
composition root        8 checks            NOVA
repos/cliente          13 checks
repos/contrato         10 checks
repos/uc               12 checks            NOVA
repos/usina+originador 15 checks            NOVA
rateio                 10 checks            NOVA
HTTP                   21 checks            NOVA
auth JWT               23 checks            NOVA
tsc --noEmit           limpo
```

`npm test` sai com `EXIT=0`. **257 verificações em 17 suítes** — 130 novas nesta sessão.

**As sete suítes novas já rodam no CI sem alteração de workflow:** o job `repositorios` chama `bash tests/repos.sh`, e foi lá que elas foram penduradas.

**Correção de número, registrada porque o erro era meu.** Escrevi "199 verificações" no `README` e o total não fechava. Contando suíte a suíte o conjunto anterior dá **150**, não os 154 que o `README` afirmava desde a sessão 6 — a diferença está em `repos/cliente`, que tem 13 `chk()` e era contado como 17. O número histórico dos resumos anteriores **não foi alterado**; fica o de-para aqui.

---

## Fila da próxima sessão

**1. 🔴 O bootstrap. Ninguém consegue entrar, e o app não pode se resolver sozinho.**

Medido hoje contra o banco de produção: **0 tenants, 0 usuários, 0 `plataforma_admin`**. E `app_financeiro` **não tem `INSERT` em `plataforma_admin`** (`has_table_privilege` = `f`, revogado de propósito na migration 10).

A cadeia trava assim: criar tenant exige tier `plataforma_admin`; o tier vem de uma linha em `plataforma_admin`; e essa linha **não pode ser criada pela aplicação**. É o mesmo padrão da role de runtime — provisionamento, não migration, e de propósito. O primeiro admin de plataforma nasce por `psql`, com trilha.

Ordem sugerida, e nenhum passo é dispensável:

```sql
-- 1. o usuario, com o auth_user_id que o Supabase Auth emitir
INSERT INTO usuario (id, auth_user_id, nome, email) VALUES (…);
-- 2. o tier de plataforma. So por aqui - a aplicacao nao alcanca esta tabela
INSERT INTO plataforma_admin (usuario_id, tier) VALUES (…, 'plataforma_admin');
-- 3. dai em diante o proprio app cria tenant e vinculo, com auditoria
```

**2. 🔴 `SUPABASE_URL` no `.env` e o login ponta a ponta contra o Supabase real.**

Hoje o auth está provado contra um servidor local com segredo de teste e um JWKS local — 23 verificações, todas passando. **Nenhum token emitido pelo Supabase de verdade foi verificado ainda.** O que falta medir: o `iss` real (`https://<ref>.supabase.co/auth/v1`), se o projeto está em chave legada HS256 ou em JWT signing keys, e se o JWKS responde no caminho que o código monta. É uma sessão curta e não deve ser pulada — foi exatamente esse tipo de suposição que custou um ciclo com o IPv6.

**3. 🟡 Os repositórios que ficaram de fora.** `dono_usina` não tem repositório — `usina.dono_usina_id` já aponta para lá e o cadastro é exclusivo do financeiro (nasce vazio, `dono_lead_id` 100% nulo no CRM). Também sem repositório: `regra_comissao`, `regra_repasse`, `tarifa`, `conector_crm` e `cliente_estado_crm`. Os três primeiros têm `EXCLUDE USING gist` de vigência atrás, então o repositório tem que traduzir `23P01` em erro de negócio, como o de rateio faz com o teto.

**4. 🟡 `Q-CLAUDE11-01` — decidir entre (a) reescrever o mecanismo da regra 11 e o comentário de `cliente.ts`, (b) acrescentar `CAT-8` comparando índices parciais do catálogo com as chaves do DMMF, (c) avaliar se `partialIndexes` deve continuar ligado.** Enquanto não houver decisão, a única defesa é convenção — e a regra 11 existe justamente porque convenção não é invariante.

**5. 🟡 Deploy conforme o `ADR-0004`** — `financeiro.blackhaus.io`, mesmo VPS sob as cinco condições. O servidor sobe com `iniciarServidor()`, que confere a role antes de ouvir na porta.

**6. 🔴 Reunião com o contador.** Não ocorreu. Quatro questões fiscais seguem aceitas como risco e rebaixadas para bloqueio de F2/F3. A F1 corre livre; a F2 não começa sem isso. Os 10 campos a levar estão no `RESUMO-SESSAO-3` §5.

---

## Pendências gerais

| Item | Estado | Dono |
|---|---|---|
| Bootstrap: primeiro `plataforma_admin` por `psql` | 🔴 **bloqueia o primeiro login** | Vinicius |
| `SUPABASE_URL` + login real ponta a ponta | 🔴 nada de produção sobe antes | Vinicius |
| Reunião com o contador | 🔴 não ocorreu. Risco aceito, bloqueio de F2/F3 | Vinicius |
| `originador_tipo` não distingue sócio | 🔴 depende do contador | Vinicius |
| POP-01 — o denominador | 🔴 base de contratos vigentes com UC homologada | Vinicius |
| PgBouncer em modo *transaction* | 🔴 sem cobertura. Se entrar no caminho, o `ADR-0003` reabre inteiro | — |
| F-01b | 🔴 nenhuma etapa do funil marca o cliente pagante. Decisão de F2 | Vinicius |
| `Q-CLAUDE11-01` — a regra 11 sem mecanismo | 🟡 três opções na §3 | Vinicius |
| `MT-09` — `rls_auto_enable` do Supabase | 🟡 aceitar como risco coberto pelo `CAT-3`, ou tratar no provisionamento | Vinicius |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 corrigir linhas 536 e 565 | Vinicius |
| Repositórios de `dono_usina` e dos cadastros de configuração | 🟡 próximo trabalho de código | — |
| Bug do `GRANT` no Supabase | 🟡 reportar. Derruba todas as sessões da instância | Vinicius |
| `financeiro-sessao-5.patch` versionado na raiz | 🟡 `git rm --cached` resolve | Vinicius |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório | dev do CRM |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. Rotação, não só migração de coluna | dev do CRM |
| Apagar o projeto Supabase antigo (`us-west-2`) | 🟡 | Vinicius |
| **Role LOGIN de runtime + `DATABASE_URL`** | ✅ **fechado hoje** — isolamento provado por ela | — |
| **Composition root** | ✅ **fechado hoje** — recusa arranque com `BYPASSRLS` | — |
| **Repositórios de UC, usina, originador e rateio** | ✅ **fechados hoje** | — |
| **Endpoints com a matriz de papéis** | ✅ **fechados hoje** — 37 rotas | — |
| **`MT-06` — autenticação** | ✅ **fechada hoje** — auth próprio | — |
| **`Q-RBAC-01` — matriz vs. PRD** | ✅ **fechada hoje** — alinhada ao PRD | — |

---

## Nota de método

**O padrão da sessão 6 se repetiu, e vale nomear de novo: contradição encontrada por leitura, não por teste.** As duas questões novas — a regra 11 sem mecanismo e a matriz divergente do PRD — foram achadas lendo documento contra código. Nenhum teste as teria pego, e os dois casos têm a mesma forma: **um invariante que se acreditava garantido por mecanismo automático, e o mecanismo tinha saído de baixo sem aviso.** Na regra 11 foi um preview feature do Prisma mudando o `db pull`; na matriz foi vocabulário de implementação que nunca teve fonte em documento.

**A lição operacional é a §5.** Quando uma mudança de comportamento passa em toda a suíte de primeira, a pergunta certa não é "ótimo, posso seguir" — é "o que essa suíte estava medindo, então?". Foi o que revelou que a matriz de autorização nunca tinha sido testada célula a célula, num sistema cujo dono do problema é isolamento entre empresas.

**O que se manteve da sessão anterior:** toda prova de escrita rodou dentro de `BEGIN … ROLLBACK`, contra o banco de produção, sem deixar fixture. E o teste novo foi verificado **nos dois sentidos** — passa contra o código correto e acusa contra a violação plantada. Um invariante que só sabe passar não é invariante.
