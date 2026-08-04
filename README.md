# Financeiro G3 Solar

Sistema financeiro multi-tenant da G3 Solar: faturamento de crédito de energia, comissão de originadores e repasse a donos de usina. O CRM ao lado é **fonte de leitura e nada mais** — nenhuma linha dele é modificada por este sistema.

| Campo | Valor |
|---|---|
| **Dono** | Vinicius Leal |
| **Fase atual** | F0 fechada · F1 com os tres criterios formais e a entrega nomeada cumpridos · **F2 e F3 construidas em 28/07** · **30/07:** os dois processos periodicos do `PRD` §6 · **03/08: a primeira entidade da F4 existe** — `conta_pagar` e `pagamento`, decididos pelo dono, fecham a `Q-PAGAMENTO-01`, e o `PRD` §5.5 passa a gravar as quatro escritas na transacao do split em vez de duas. **22 migrations, 21 aplicadas em producao** e **1123 verificacoes em 44 suites**. O que segura a F2 continua sendo **um certificado A1**, nao codigo |
| **Atualizado** | 03/08/2026, sessao 20 · **duas entregas.** (1) **O LAYOUT DA FATURA VIROU POSICAO**, a pedido do dono: escolher o papel (A4, A5, Carta, Oficio), a orientacao, as margens, e **arrastar cada elemento para onde se quer** — migration **23**, `src/dominio/layout-visual.ts` puro e o editor na aba Documento. Tres defeitos silenciosos consertados junto: o `@page` **nao declarava `size`** (o papel era o do sistema de quem imprime), a previa tinha geometria diferente da do papel, e o negrito do total **nao viajava no payload** — o CRM receberia a fatura sem ele. Plano e execucao em `PLANO-layout-visual-2026-08-03.md`. (2) **`Q-VIEWSCRED-01` FECHADA: o conector le as DEZ views e confere o eixo do originador** — `SPEC-002` R26 e invariante 14, **1262 verificacoes** (`EXIT=0`, delta **33** no conector, **74** no layout e **7** na situacao do rateio contado na fonte e conferido contra o `npm test`, diferenca zero). Medido antes de construir: **39 das 39 UCs espelhadas tem credito vigente**, e o conector **nao escreve originador** — divergencia vira sinal, com as cinco condicoes mudas contra o estado de hoje. A causa raiz foi consertada junto: nada comparava as views do CRM contra a nossa lista fechada, e agora `viewsNovasNoCrm`/`viewsAusentes` gritam as duas direcoes. Nova 🟡 `Q-SITUACAO-01`: **11 das 39 UCs estao `nao_ativado` no CRM**, 7 em troca de titularidade · sessao 19: **`RESUMO-SESSAO-19.md`** · **1123 verificacoes**, delta de **17** · **o dev do CRM respondeu, e o eixo do originador nao era nenhuma das duas colunas que mediamos**: e o **credito congelado no momento do ganho**. Consequencia medida: o mapa de 30/07 esta errado em **12 das 41 UCs**, e **19,6% da carteira em kWh** troca de dono · **tres afirmacoes do dev estavam vencidas**, inclusive a de que nao alcancavamos o dado — as duas views existem e sao legiveis · nova 🔴 `Q-PARCERIA-01`: o credito traz **vendedor E parceiro** e o `contrato` guarda um so · migration 22 (`contas_a_pagar`) **so em banco de teste** · nada escrito em producao |
| **No ar** | **`https://financeiro.blackhaus.io`** — systemd, Node 22 isolado, TLS ate 26/10. Mesmo VPS do CRM, **sem alterar uma linha da configuracao dele**. **04/08/2026 02:37 — DEPLOY FEITO.** Producao passou de 21 para **24 migrations** e o bundle e o `index-MNjOhM7U.js`, byte-identico ao compilado no Codespace. `main` avancou **18 commits por fast-forward** (as sessoes 17 a 20; ela estava parada na 16). A guarda de arranque passou dizendo *"client gerado cobre as 36 tabelas de public"* — eram 30. Os **9 invariantes de catalogo passam contra producao**, e o ciclo rodou em seguida preenchendo a coluna nova: **29 `ativado` e 12 `nao_ativado`** (7 em troca de titularidade), com **0 criados, 0 desativados e 0 recusados**. Dados intactos ponta a ponta: **86 clientes, 41 UCs, 0 contratos, 0 faturas** antes e depois |

---

## O caminho para a primeira fatura

**Remedido contra produção em 04/08**, depois do deploy e do ciclo — e o universo mudou: são **29 UCs**, não 39. **O que segura o faturamento não é código** — é insumo humano, e a ordem importa mais do que parece.

### O estado hoje — 04/08, pela `prontidao` e por consulta direta

| | | | |
|---|--:|---|--:|
| clientes (linhas · ativos) | 86 · 45 | **contratos** | **0** |
| UCs ativas | 41 | **originadores** | **0** |
| **UCs que FATURAM** (rateio `ativado`) | **29** | **UCs com `data_vencimento`** | **0 de 29** |
| usinas | 4 | **donos de usina** | **0 de 4** |
| tarifa vigente (Equatorial, 1,130000) | 1 | **regra de repasse** | **0 de 4** |
| regras de comissão (5 tiers × 2 parcelas) | 10 | **identidade de cobrança** | **0** |

**As duas camadas que já estão fechadas** e que ninguém precisa tocar: a **tarifa** cobre as 29 (todas são Equatorial, e a vigência é aberta dos dois lados — `-infinity`), e as **regras de comissão** cobrem os cinco tiers nas duas parcelas do `PRD` §5.4. Nenhuma das duas aparece na prontidão porque o universo delas depende de contrato — elas dizem `nao_medido`, que **não é `ok`**, e é por isso que foram conferidas por consulta direta.

### A ordem que destrava

| # | O quê | Depende de |
|:--:|---|---|
| 1 | **Identidade de cobrança** (chave Pix, recebedor, cidade) | **só do dono** — sem ela o documento sai **sem QR**, e é o único meio de pagamento que não espera o A1 |
| 2 | **Dia de vencimento das 29 UCs** | **o modelo está pronto e marcado**: `vencimentos-modelo-20260804.csv`, 29 `sim` primeiro e 12 `NAO` no fim |
| 3 | **CPF/CNPJ dos três originadores** + natureza | operação — nenhuma das 10 views do CRM entrega documento |
| 4 | **Decidir a `Q-PARCERIA-01`** | dono + dev do CRM — **trava a digitação**, e a 2ª parcela é 25% contra zero |
| 5 | **Digitar os 29 contratos** | 3 e 4 — **R20-b congela o tier e não há edição** |
| 6 | **Lançar a geração** que falta na competência escolhida | operação — ver o quadro abaixo |
| 7 | **Compor e emitir** | 1–6 |
| 8 | **Dono de usina + `regra_repasse`** | **não bloqueia a fatura**, bloqueia o *repasse* |

**O boleto não está nesta lista, e é de propósito.** A prontidão marca `cobranca_sicoob` como `bloqueia_fatura`, mas a **triagem não tem esse motivo de recusa**: sem o A1 o lote compõe, a fatura existe e o documento sai — com o **Pix estático**, que é o item 1. O que não sai é boleto (`Q-SICOOB-01`).

### Três coisas que a medição mudou

**A `Q-SPEC001-02` era menor do que parecia — e ✅ fechou em 03/08.** Ela perguntava *"quem preenche `data_vencimento`, por UC ou por contrato?"*, o que soa como decisão de modelagem. Lendo `src/dominio/faturamento.ts`, o sistema usa **apenas o dia do mês** (`data_vencimento.getUTCDate()`) e o campo existe **só na UC** — não havia duas opções, faltava o dado. **O dono respondeu que o dia varia por cliente/UC**: não é um `UPDATE`, é planilha, e o importador (`npm run vencimentos`) existe desde então. Desde 04/08 o modelo sai **marcado**: a coluna `fatura` diz quais 29 valem e as 12 que não faturam descem para o fim — pedir 41 dias para cobrar 29 era o mesmo defeito que a tela de Unidades teve no dia anterior.

**A ordem das recusas decide a ordem do trabalho.** A triagem recusa na ordem em que está escrita e mostra só o primeiro motivo: `sem_contrato_vigente` → `ja_faturada` → **`rateio_nao_ativado`** → `sem_rateio` → `sem_geracao_lancada` → `sem_vencimento`. *(O terceiro entrou em 04/08 com a migration 24 — o CRM passou a dizer a situação do rateio, e **12 das 41 UCs não estão ativadas**. Ver `Q-SITUACAO-01`.)* Preencher o vencimento **hoje não muda nada** — as 29 param na primeira. E digitar os contratos **sem** a data faz todas caírem na sexta, e o trabalho volta para as 29 UCs.

**A geração é um bloqueio que ninguém tinha nomeado**, e remedido em 04/08 sobre o universo certo ele ficou **pior do que parecia**:

| usina | UCs que faturam | rateio faturável | competências com geração | última |
|---|--:|--:|--:|---|
| `0001` | **19** | 88,78% | 1 | **2026-06** |
| `0002` | **9** | 43,20% | 7 (01 a 07) | **2026-07** |
| `0003` | **1** | 100,00% | **0** | — |
| `04` | **0** | — | **0** | — |

**A competência mais completa é 2026-06, com 28 das 29** — falta só a UC única da `0003`, que **nunca teve geração lançada**. Em **2026-07 seriam 9**, porque a `0001` só tem junho. Faturar 2026-07 antes de lançar a geração da `0001` produz um lote de 9 e 20 recusas — que não é defeito: é o sistema recusando emitir receita sobre energia que ninguém registrou ter sido gerada (`PAUTA-contador` 9a).

Duas leituras que a remedição corrigiu: a usina `04` **não bloqueia mais nada** — as 5 UCs dela estão todas com rateio não ativado, então a geração que falta lá não impede fatura nenhuma; e a `0003` deixou de ser um caso de borda, porque **é a única UC que separa 28 de 29**.

---

## As duas vertentes, e quanto de cada uma existe

Revisão de 30/07, medida contra produção — **`REVISAO-VERTENTES-2026-07-30.md`**. O dono descreveu o sistema em duas vertentes, e as duas já têm nome no `PRD`:

| Vertente | Nome no `PRD-v2.2` | Fase | Situação |
|---|---|:--:|---|
| **do cliente** — fatura, pagamento, quem pagou e quem não pagou | §4.3 Carteira | F2 · F3 | **construída**, parada por insumo humano |
| **da empresa** — contas a pagar e a receber, pagamento de fornecedor e de funcionário, comissão, compras, cartão | §4.4 Corporativo | F4 · F5 | **4 de 13 entidades · 12 rotas · 1 tela** — desde 03/08. As quatro são as que **quitam**; as nove que faltam são fluxo de caixa, conciliação e cartão |

**Não há escopo novo nisso** — está no PRD desde a v2.2. O que a revisão acrescentou são três coisas:

**1. ~~O ponto de encontro das duas está pela metade~~ — `Q-PAGAMENTO-01` ✅ FECHADA em 03/08.** O dono decidiu por `conta_pagar` completa, e a migration 22 a construiu **enquanto `split_item` ainda tinha 0 linhas** — a janela não chegou a fechar. O `split.ts` grava as quatro escritas do `PRD` §5.5, e pagar duas vezes o mesmo repasse deixou de ser possível **pelo banco**, não por conferência. Ver `RESUMO-SESSAO-18.md` §3. O texto original: O `PRD` §5.5 manda **quatro** escritas na mesma transação do split; `src/repos/split.ts` grava **duas** — `split_execucao` e `split_item`. E `split_item` **não tem coluna de pagamento**. No dia em que a primeira fatura for paga, o sistema saberá ao centavo **quanto** o dono da usina e o originador têm a receber, e **não terá onde registrar que foram pagos** — os relatórios são extrato de *apuração*, não de *quitação*, e nada impede pagar duas vezes. **A janela para decidir sem migration fecha na primeira liquidação**, enquanto `split_item` tem 0 linhas.

**2. ~~"Responsáveis dos leads" não é o eixo decidido~~ — `Q-EIXO-FUNCIONARIO-01` ✅ FECHADA em 03/08, e a resposta foi "nenhuma das duas".** O dev do CRM respondeu: o eixo não é `vendedor_origem` nem `responsavel_atual`, e sim o **crédito congelado no momento do ganho** — regra da G3 desde 01/08, imutável por gatilho. `vendedor_origem` é o palpite do *round-robin* na criação do lead, e a própria G3 já o declarou errado por escrito em 30/06. **Medido no dia: o mapa de 30/07 está errado em 12 das 41 UCs, e o Out Sales sai de 24,2% para 4,6% da carteira — 5.858,8 kWh/mês, 19,6%.** Mapa refeito em `ATRIBUICAO-originador-2026-08-03.md`; o de 30/07 está SUPERADO. **A correção do próprio dev abriu a `Q-PARCERIA-01` 🔴**: três vendas passaram a ter vendedor **e** parceiro, e `contrato` guarda um originador só — a escolha muda a 2ª parcela de 25% para zero. Ver `RESUMO-SESSAO-19.md`. O texto original: **`Q-EIXO-FUNCIONARIO-01` 🔴, e em 03/08 ela mudou de endereço.** Perguntado ao dono, a resposta foi *"o CRM foi alterado nesse sentido, peça uma pequena auditoria para o DEV do CRM"* — então o eixo **não** se decide olhando o que as views dizem hoje. Pedido em `PROMPT-dev-crm-rodada5-2026-08-03.md`; remedido no dia, os dois eixos divergem em **13 das 41 UCs**, 23% da carteira em kWh. O texto original: O eixo em vigor é o `vendedor_origem` (29/07); os dois **divergem em 43 dos 80 ganhos**, e nos 15 cards do funil `Rateio` o `responsavel` é a mesma pessoa em 15 de 15. Confirmar custa uma frase; não confirmar custa uma reescrita, porque a **R20-b congela o tipo no rascunho e não há edição**.

**3. A inadimplência existe como visão e não como registro — `Q-INADIMPLENCIA-01` 🟡.** *"Quem não pagou"* o sistema responde; *"o que já se fez a respeito"* não tem onde ser gravado, e o `PRD` §4.3 proíbe usar a etapa `INADIMPLENTES` do CRM como fonte.

**E um sinal que vale mais que a contagem:** o placar por fase do `QUESTOES.md` **não tinha linha para F4 nem para F5**. Não estavam atrasadas — nunca entraram no registro. Corrigido.

---

## Os seis defeitos de 30/07, e de onde cada um veio

Nenhum foi achado por auditoria. Três apareceram ao **construir em volta do código**; **três apareceram com o dono usando o sistema pela primeira vez** — e essa mudança de origem é o achado da sessão. Nenhum aparecia em revisão, e nenhum tinha teste.

> **Um padrão que apareceu três vezes na mesma tarde: peça pronta que ninguém plugou.** `ErroDaApi.ehDeSessao`, um getter com a intenção certa e nenhuma chamada. O `motivo` do 401, montado *"para o log"* e nunca logado. A coluna `boleto.tentativas`, incrementada desde a migration 16 e nunca consumida. Vale como classe a procurar: o comentário descreve a intenção, o código a implementa pela metade, e nada falha.

| O que estava errado | Como apareceu | O que ficou |
|---|---|---|
| **`CicloJaEmAndamento` nunca era lançada.** `src/crm/sincronizacao.ts` traduzia o `23P01` do EXCLUDE por `e.code === 'P2010' \|\| e.meta?.code === '23P01'`. No Prisma 7.9 sobre driver adapter, `e.code` é **`P2039`** e `e.meta.code` é **`undefined`** — o SQLSTATE mora em `e.meta.driverAdapterError.cause.code`. Nenhuma das metades alcançava: *"o segundo ciclo não inicia"* (`SPEC-002` §7) chegaria como **500** em vez de 409 | O EXCLUDE da agenda tem a mesma forma, e o teste `N7a` acusou | `src/db/sqlstate.ts`, com a forma real do erro **copiada da saída** como fixture (`tests/sqlstate.ts`, 10 verificações). A verificação `S2a` afirma que a condição **antiga falha** — é o registro executável do defeito |
| **Um comentário do repositório cita uma medição que não reproduz.** `web/src/dinheiro.ts` afirmava desde 29/07 que `Number('1234,56'.replace(',','.')) * 100` dá `123455.99999999999` e que `Number('8,15') * 100` dá `814.9999999999999`. Medido: o primeiro dá **123456 exato**; o segundo é **`NaN`** (falta o `.replace`) | Copiei a citação para o meu teste e ele ficou vermelho | Varredura própria: o produto **não é inteiro em 131.256 de 1.000.000** de centavos, e `Math.round` **salva todos** — 0 erros em 20.000.000. A conclusão honesta virou a mesma que o projeto já fazia sobre o percentual: *o caminho ingênuo está certo hoje, e está certo por sorte*. Comentário corrigido nos dois lados |
| **O deploy não rodava `prisma generate`**, e `src/generated/` é gitignored: a aba Documento quebrou em produção com `undefined.findFirst()`. **O deploy tinha sido conferido dos dois lados e dado verde** porque as rotas responderam `401` — e **401 prova que a rota existe e recusa credencial, não que ela funciona** | **o dono, abrindo a tela** | Guarda de arranque: `iniciar()` compara as tabelas de `public` com os modelos do client e **recusa subir** (`tests/app.ts` `A9a`–`A9c`). Consequência: `git pull` + `restart` sem `generate` agora **derruba o site** em vez de quebrar uma tela — troca deliberada |
| **O conserto quebrou:** `prisma.config.ts` exigia `DIRECT_URL` na carga do arquivo, e o `.env` do VPS não tem — nunca precisou ter, as migrations sempre foram aplicadas de fora | **o dono, colando o comando** | Medido: `generate` roda em 711 ms com a URL apontando para porta morta. Agora só `migrate`/`db`/`studio` exigem, com mensagem que diz a porta certa e a errada (`tests/prisma-config.ts`, roda o CLI de verdade) |
| **A sessão vencida não derrubava para o login** — `ErroDaApi.ehDeSessao` existia e **ninguém o chamava**; o 401 virava `Credencial inválida.` em cada painel, e o `Ctrl+Shift+R` relia a sessão morta do `localStorage` | **o dono: *"está destruindo a UX"*** | O 401 leva ao login com *"Sua sessão expirou"*, uma vez por sessão e não por requisição. **403 e 422 não derrubam** (`web/tests/sessao-perdida.ts`) |
| **A migration nova dispensava o gatilho de auditoria** citando a migration 14 como precedente — e a **15 concluiu o contrário** em 27/07: *"o custo de obedecer é uma linha; o custo de afrouxar é o precedente"* | O teste `G2` de `tests/auditoria.sql`: `inv.17 sem gatilho: agenda_execucao` | Gatilho criado. O erro fica registrado no corpo da migration 21: citar uma decisão pelo que ela **tentou** e não pelo que **concluiu** é a mesma classe da citação inventada que a sessão 14 pegou |

### Sobre a `Q-ESCOPO-01` — a contradição era do README, não do código

Este arquivo a descrevia em dois lugares como *"o conector entrega 1 das 4 entidades"* e como o bloqueio real da F2, enquanto a tabela de entregas da F1, três parágrafos abaixo, já dizia **4 de 4 ✅**.

**Quem estava certo era a tabela, e a questão já estava fechada desde 28/07** — `QUESTOES.md` linha 114: *"RESOLVIDA em 28/07: as quatro entidades da §2 estão implementadas"*. Reconferido em 30/07 antes de mexer no texto: `src/crm/sincronizacao.ts` processa as quatro (`espelharLote`, `espelharUsinas`, `espelharGeracao`, `espelharUnidades`), a `SPEC-002` §3.1 desceu ao nível de coluna para as três que faltavam na v1.3, e `tests/conector.ts` cobre `N38`–`N47`.

Ou seja: **nenhuma descoberta, só um cabeçalho que não acompanhou o registro por dois dias** — e por dois dias o resumo do topo apontou um bloqueio de fase que não existia. É o mesmo modo de falha que o `PATCH-citacoes` tratou: o corpo datado está certo, o índice está errado, e quem lê só o índice decide errado.

---

## Comece por aqui

Nesta ordem. Cada documento pressupõe o anterior.

0. **`RETOMADA-2026-08-03.md`** — **se você está retomando o trabalho, leia este primeiro: dois minutos, e diz onde tudo parou.** Substitui o de 30/07. Traz o que está por commitar, as duas perguntas que travam trabalho caro e o que **não** fazer em seguida
0. **`ROTEIRO-REVISAO.md`** — **se o que você quer é usar o sistema e conferir, comece aqui e não no resto.** Passo a passo do que abrir, o que esperar ver e **o que significa se vier diferente** — incluindo o teste que nenhum comando faz: **ler o QR com a câmera do celular**
1. **`REVISAO-VERTENTES-2026-07-30.md`** — **se a pergunta é "o sistema cobre o financeiro da empresa também?", comece aqui.** A revisão das duas vertentes contra produção: o que existe da carteira do cliente, o zero do módulo corporativo, e o `PRD` §5.5 implementado pela metade entre as duas
1. **`RESUMO-SESSAO-20.md`** — **comece por aqui.** Duas entregas: o conector passou a ler as **dez** views e a conferir o eixo do originador sozinho (a §1.1 e o assunto — a causa raiz nao era ler oito, era **nao contar**), e o **layout da fatura virou posicao** (a §2.1 sao os tres defeitos silenciosos que o pedido do dono desenterrou). A §3 lista **seis erros meus**, e **dois deles so apareceram ao FOTOGRAFAR a tela**
1. **`PLANO-layout-visual-2026-08-03.md`** — se a pergunta e *"como o documento da fatura e montado?"*, comece aqui. A §2 sao os **oito pontos de melhoria** do processo anterior, tres deles defeito e nao limitacao; o bloco EXECUTADO traz o que apareceu ao construir
1. **`RESUMO-SESSAO-19.md`** — A sessao em que o eixo do originador foi **respondido pelo dev do CRM** — e nao era nenhuma das duas colunas que mediamos. A §1 e o custo do eixo velho (12 UCs, 19,6% da carteira); a §2 sao as **tres afirmacoes do dev que ja nao eram verdade**, e por que conferir a resposta valeu mais que obedece-la; a §3 e a `Q-PARCERIA-01`, que a correcao do proprio dev abriu. Mapa vigente: **`ATRIBUICAO-originador-2026-08-03.md`**
1. **`RESUMO-SESSAO-18.md`** — A sessao em que as quatro perguntas foram respondidas pelo dono. A §1 e o defeito que a pergunta encontrou sem procurar — o conector apagava o vencimento que ninguem tinha preenchido ainda; a §3 e a `conta_pagar`, com o que o banco passou a IMPEDIR; a §4 sao as 39 UCs medidas e as tres coisas que a medicao achou sem ser pedida
1. **`RESUMO-SESSAO-16.md`** — A sessão em que o sistema foi **usado por uma pessoa pela primeira vez**, e quatro dos seis defeitos vieram daí. Traz a agenda de cobrança, o importador de tarifas, os dois renomes do dono — e a §5, que mede o caminho para a primeira fatura contra produção
2. **`RESUMO-SESSAO-15.md`** As três pendências do documento de cobrança fechadas, e o achado que apareceu ao **remedir** o CRM antes de construir: 76 merges de lead em 30/07 tornaram `lead.codigo` instável, tiraram um nome da lista de originadores e moveram duas atribuições de comissão. A §2 conta os dois defeitos que a verificação do QR pegou — um deles dentro do próprio instrumento de medida
2. **`RESUMO-SESSAO-14.md`** — A sessão do caminho de cobrança: o eixo do originador decidido e medido, as três telas que faltavam, as duas migrations e as cinco decisões do documento. Traz também os quatro erros meus que o processo pegou, com o que cada um ensinou
2. **`RESUMO-SESSAO-13.md`** — Estado atual e a fila com dono nomeado. A sessão em que a `Q-ORIGINADOR-01` foi decidida — e em que conferir a premissa contra o CRM antes de gravar mudou o que precisava ser perguntado
2. **`RESUMO-SESSAO-12.md`** — a sessão da verificação: produção conferida ponta a ponta, o defeito silencioso da tela de Contratos medido nos dois sentidos, e a vermelha que abriu **antes** dos 39 contratos
2. **`RESUMO-SESSAO-11.md`** — a sessão do deploy: a paleta da G3, o sistema em produção, dois logins e duas questões novas
2. **`MAPA-UX-2026-07-29.md`** — a revisão de UX da SPA, na manhã do mesmo 29/07: rotas por caminho, busca e ordenação, caixa de sentença
2. **`RESUMO-SESSAO-10.md`** — a sessão em que a `PAUTA-contador.md` voltou e a carteira foi construída
2. **`SPEC-003-carteira.md`** — a spec da F2 e da F3. A §3 rastreia qual resposta do contador produziu qual coluna
3. **`RESUMO-SESSAO-9.md`** — a sessão anterior. O roteiro que fechou a F1 está na **§11 do `RESUMO-SESSAO-8.md`**, e ele já foi executado por inteiro
2. **`CLAUDE.md`** — as onze regras inegociáveis. Antes de qualquer linha de código
3. **`PRD-v2.2.md`** §7 e §8 — fronteira com o CRM
4. **`adr/ADR-0003-contexto-de-tenant.md`** (r2) — como o isolamento funciona de fato, e a que preço
5. **`SPEC-001-fundacao.md`** (v2.9) — a spec da F1. §3.2 é o contrato do middleware; §3.4 é a lista das **dez** FKs compostas. A `Q-SPEC001-08` (duas linhas da §9 diziam nove) **fechou em 30/07**, e a §3.4 ganhou a nota de que a lista é **da F1**: o banco hoje tem **26** FKs compostas, e quem não envelhece é o `CAT-7`, que afirma a regra em vez de contar
6. **`GLOSSARIO.md`** — se um termo está lá, é assim que ele se chama em spec, em código e em conversa

`QUESTOES.md` se consulta sob demanda, e é onde toda lacuna vira entrada (regra 10). Os `RESUMO-SESSAO-2` a `-8` são a trilha datada: cada um diz o que foi medido, **o que foi retirado depois de medido**, e o que ficou na fila.

---

## Hierarquia normativa

Em conflito, a ordem é:

```
CLAUDE.md  →  PRD-v2.2  →  ADRs  →  SPECs
```

Uma regra do `CLAUDE.md` não é flexibilizada por spec, por prazo ou por conveniência de implementação. É alterada lá, com versão nova, ou não é alterada.

---

## Estrutura

```
CLAUDE.md                    regras inegociaveis — camada mais alta
PRD-v2.2.md                  fonte de verdade do produto
GLOSSARIO.md                 vocabulario unico (rev. 3)
QUESTOES.md                  registro unico de questoes abertas, com taxonomia de severidade
SPEC-001-fundacao.md         spec da F1 (v2.9)
SPEC-002-conector.md         spec do conector (v1.4)
SPEC-003-carteira.md         spec da F2 e F3 — faturamento, cobranca e split.
                             Escrita DEPOIS das respostas do contador, e a 3
                             diz qual resposta virou qual coluna
_TEMPLATE-SPEC.md            anatomia fixa das specs
REVISAO-VERTENTES-2026-07-30.md
                             As DUAS VERTENTES medidas contra producao: a do
                             cliente (PRD 4.3, construida) e a da empresa
                             (PRD 4.4, ZERO de 13 entidades). A 3 e o achado:
                             o PRD 5.5 manda quatro escritas na transacao do
                             split e o codigo faz duas - ninguem tem onde
                             registrar que um repasse foi PAGO, e a janela
                             para decidir isso fecha na primeira liquidacao
RESUMO-SESSAO-2.md           passagem da sessao 2
RESUMO-SESSAO-3.md           passagem da sessao 3
RESUMO-SESSAO-4.md           passagem da sessao 4
RESUMO-SESSAO-5.md           passagem da sessao 5 — generate destravado, R14 e os repos
RESUMO-SESSAO-6.md           passagem da sessao 6 — as 12 migrations e o crash do GRANT
RESUMO-SESSAO-7.md           passagem da sessao 7 — role de runtime, 37 rotas, auth
RESUMO-SESSAO-8.md           passagem da sessao 8 — a §11 e o roteiro que fechou
                             a F1, ja executado por inteiro
RESUMO-SESSAO-9.md           passagem da sessao 9 — o sinal da Q-UC-DISTRIB-01
RESUMO-SESSAO-10.md          passagem da sessao 10 — a PAUTA respondida e a
                             carteira inteira
RESUMO-SESSAO-11.md          passagem da sessao 11 — COMECE POR AQUI. A paleta
                             da G3, o deploy em producao ao lado do CRM sem
                             tocar nele, os dois logins e as duas questoes que
                             o caminho da Sicoob fez aparecer
RESUMO-SESSAO-12.md          passagem da sessao 12 — Producao conferida, o
                             defeito silencioso da tela de Contratos medido
                             antes e depois, e as duas questoes que aparecem
                             ANTES dos 39 contratos
RETOMADA-2026-08-03.md       ONDE TUDO PAROU. O que falta publicar (e agora tem
                             MIGRATION), as tres proximas acoes - nenhuma delas
                             codigo - e o que NAO fazer em seguida
RESUMO-SESSAO-20.md          passagem da sessao 20 - COMECE POR AQUI. Duas
                             entregas. A 1 e o conector lendo as DEZ views e
                             conferindo o eixo do originador sozinho - e a 1.1 e
                             o assunto: a causa raiz nao era ler oito, era NAO
                             CONTAR. As views existiam desde 01/08 e o script
                             imprimia "views legiveis: 10" numa linha que ninguem
                             confrontava com o 8. A 2 e o layout da fatura virando
                             POSICAO, e a 2.1 sao os TRES defeitos silenciosos que
                             o pedido do dono desenterrou - entre eles o `@page`
                             sem `size`, que fazia a mesma fatura sair diferente
                             em duas maquinas. A 3 lista SEIS erros meus, e DOIS
                             so apareceram ao FOTOGRAFAR a tela
PLANO-layout-visual-2026-08-03.md
                             O PLANO e a EXECUCAO do layout por posicao. A 2 sao
                             os OITO pontos de melhoria do processo anterior,
                             tres deles DEFEITO e nao limitacao; a 3 e o desenho
                             (milimetro, papel por enum, seis tipos de bloco) e o
                             bloco EXECUTADO traz as CINCO coisas que apareceram
                             ao construir e nao estavam no plano
RESUMO-SESSAO-18.md          passagem da sessao 18 - COMECE POR AQUI. As quatro
                             perguntas respondidas pelo dono. A 1 e o defeito que
                             a pergunta ACHOU SEM PROCURAR: o conector levava
                             data_vencimento no espelho e o CRM a tem vazia em 41
                             de 41 - preencher as 39 UCs e rodar o ciclo apagaria
                             as 39, sem erro, sem log e sem recusa. A 3 e a
                             conta_pagar (PRD 4.4) e as QUATRO coisas que o banco
                             passou a impedir, entre elas provisionar o mesmo
                             split_item duas vezes - por coluna GERADA, que e o
                             conserto que a regra 11 prescreve. A 4 mede as 39 UCs
                             que o dono nao reconheceu: existem, e a medicao achou
                             84 linhas de cliente para 41 PESSOAS e um boleto que
                             sairia sem CPF do pagador
RESPOSTA-dev-crm-rodada5-... A RESPOSTA ao retorno do dev, a ENVIAR. Ele supos que
                             as 39 vinham de planilha da operacao; medido: as 39
                             tem crm_usina_cliente_id em 39 de 39 - sao o
                             contrato_id DELE. A 3 e o achado que vale mais que a
                             contagem: um contrato MUDOU DE UC no CRM e a nossa
                             linha credita a pessoa errada agora. A 4 lista as
                             tres coisas que as views NAO EXPOEM, e e por isso que
                             a conta dele da 44 e a minha da 41
PROMPT-dev-crm-rodada5-...   O pedido original ao dev do CRM (03/08), ja
                             respondido. UMA
                             pergunta: o que mudou sobre "quem vendeu". As 41 UCs
                             do rateio agora casam com um ganho (eram 28 em 29/07),
                             os dois eixos divergem em 13 delas - 6.855,6 kWh/mes,
                             23% da carteira - e um nome NOVO aparece so num deles
RESUMO-SESSAO-16.md          passagem da sessao 16 - A agenda
                             de cobranca, o importador de tarifas e a regra 11 com
                             mecanismo de novo. A 2 reune SEIS defeitos, quatro
                             deles achados pelo DONO usando o sistema - e a 2.1
                             explica por que um deploy conferido dos dois lados
                             deu verde com tres rotas quebradas. A 5 mede o
                             caminho para a primeira fatura contra producao: a
                             ordem das recusas, o dia de vencimento e a geracao
                             que falta em 3 das 4 usinas
RESUMO-SESSAO-15.md          passagem da sessao 15 - COMECE POR AQUI. As tres
                             pendencias da Q-DOCFATURA-01 fechadas (desenho do QR,
                             teste do repo, logo no payload) e a vermelha nova
                             Q-CRMCODIGO-01, achada ao REMEDIR o CRM antes de
                             construir. A 6 reune seis erros meus, dois deles
                             dentro do proprio instrumento de medida; a 7 diz o
                             do deploy foi provado, e o bloco EXECUTADO que
                             registra a publicacao das 11:50 do dia seguinte; a 8
                             explica por que a contagem de verificacoes NAO e
                             comparavel a da sessao 14
RESUMO-SESSAO-14.md          passagem da sessao 14 — COMECE POR AQUI. O eixo do
                             originador (vendedor_origem) medido contra o CRM, as
                             tres telas que faltavam (Cobranca, Faturas,
                             Relatorios) mais a aba Documento, as migrations 19 e
                             20 e as cinco decisoes do documento de cobranca. A 7
                             lista quatro erros meus que os testes e o catalogo
                             pegaram - inclusive uma citacao que eu inventei
RESUMO-SESSAO-13.md          passagem da sessao 13 — A
                             Q-ORIGINADOR-01 decidida, a premissa conferida
                             contra o CRM antes de gravar, o campo obrigatorio
                             na tela e a decima camada da prontidao
ATRIBUICAO-originador-2026-07-30.md
                             O MAPA VIGENTE, remedido em 30/07 e ordenado por UC -
                             a chave ESTAVEL. Substitui o de 29/07: 76 merges de
                             lead renumeraram 39 dos 41 codigos, tiraram a Jezielly
                             Vieira da lista (zero cards hoje) e moveram duas
                             atribuicoes para o Out Sales, uma delas de 1.987,2
                             kWh/mes. A lista de originadores e de DOIS nomes.
                             40 das 41 origens agora sao LEGIVEIS pelas views, e as
                             12 que eram invisiveis bateram uma a uma - Q-CRMCODIGO-01
ATRIBUICAO-originador-2026-07-29.md
                             O MAPA DAS 41 linhas do rateio -> originador, depois
                             de o dono decidir que o originador e o vendedor_origem
                             ate segunda ordem. Tres nomes. A coluna `fonte` e o
                             que importa: 28 atribuicoes o financeiro LE nas views,
                             12 existem no CRM e sao INVISIVEIS a elas (card em
                             etapa normal; a view expoe so `won`) e 1 e
                             desconhecida (lead arquivado). Este documento e o
                             unico portador das 12 - Q-ORIGVEND-01
MAPA-UX-2026-07-29.md        a revisao de UX da SPA: caixa de sentenca, rotas
                             por caminho, busca/filtro/ordenacao, tema claro
                             como padrao. O que ficou de fora esta la, com nivel
INTERFACE-2026-07-30.md      O REGISTRO DO ACABAMENTO VISUAL: o que mudou, o que
                             foi medido (contraste, bundle), o que a conferencia
                             VISUAL pegou - tres defeitos que a leitura de codigo
                             nao pegaria, um deles um icone de "nao sei" numa
                             fatura emitida com sucesso - e a divergencia do
                             Lottie, que virou Q-LOTTIE-01. As 12 telas foram
                             RENDERIZADAS em Chromium nos dois temas: e a primeira
                             vez que a interface deste projeto e conferida por
                             imagem, e nao por leitura
ROTEIRO-REVISAO.md           O ROTEIRO DE REVISAO FUNCIONAL, para quem vai USAR o
                             sistema. Nove partes, cada passo com "faca", "espere
                             ver" e "se vier diferente" - e e a terceira que vale,
                             porque ela diz se o que apareceu e defeito, e dado
                             faltando, ou e o sistema recusando de proposito. A
                             parte 5 e o QR lido por CAMERA: as 45 verificacoes
                             provam que a matriz e valida pelo padrao e NAO provam
                             que o app do banco aceita
PAUTA-contador.md            as 10 perguntas fechadas, RESPONDIDAS em 28/07. O
                             corpo fica intacto; a tabela do fim e o de-para
VIEWS-PROPOSTAS-r2.sql       DDL proposta ao dev do CRM. EXECUTADA - as 8 views
                             existem e expoem crm_tenant_id desde 27/07 (Q-VIEWS-01)
PROMPT-dev-crm-rodada3-...   o pedido em aberto ao dev do CRM (27/07)
.env.example                 formato do .env. Le os comentarios: a porta importa

adr/
  ADR-0002-...               modelo de tenant e de cliente, pos-auditoria
  ADR-0001-...               estrategia de multi-tenancy: banco unico, RLS por linha (retroativa)
  ADR-0003-...               contexto de tenant: SET LOCAL por transacao (r2, aceita)
  ADR-0004-...               provisionamento: organizacao, dominio e host (aceita)
  ADR-0005-...               onde mora o segredo do tenant (PROPOSTA, aguarda
                             decisao). Pre-requisito do adaptador Sicoob real:
                             a credencial_ref aponta para um cofre que nao existe

auditoria/
  P7-...                     topologia de funis do CRM
  P8-...                     reverificacao de 24/07
  PATCH-citacoes-...         reaponta as 18 citacoes ao CLAUDE.md que nunca existiu
  reparo-citacoes-....patch

spike-adr0003/               21 testes, tres variantes de contexto de tenant. ./run.sh
spike-transacao/             12 testes de $transaction/$extends do Prisma sobre RLS. ./run.sh

src/app.ts                   COMPOSITION ROOT - o unico lugar que instancia client,
                             pool e adapter. Recusa o arranque se a role tiver BYPASSRLS
src/db/pools.ts              os dois pools: transacional 8/15s, relatorio 2/60s
src/db/contexto.ts           ponto UNICO de emissao do contexto. RBAC e trilha
src/db/tipado.ts             devolve os 19 modelos aos repos sem contexto.ts conhece-los
src/auth/sessao.ts           login, escolha de tenant validada, caminho de plataforma
src/repos/cliente.ts         cadastro, busca por documento, baixa logica
src/repos/contrato.ts        R14 e a ORDEM da renovacao: encerra o velho antes de inserir
src/repos/unidade_consumidora.ts  cadastro da UC. NAO edita rateio - ver rateio.ts
src/repos/usina.ts           usina e geracao mensal. Decimal entra como STRING
src/repos/originador.ts      documento OBRIGATORIO aqui; R20 congela no contrato
src/repos/prontidao.ts       o que FALTA para uma competencia poder ser faturada.
                             DEZ camadas de uma vez, com dono nomeado. Conta e
                             NAO decide. `nao_medido` nao e `ok`
src/repos/rateio.ts          R11, o teto de 100% por usina. Unico caminho de escrita
src/repos/dono_usina.ts      para quem vai o repasse. Exige PIX ou conta completa
src/repos/regras.ts          tarifa, regra_comissao e regra_repasse. NAO ha editar:
                             a unica escrita e abrir vigencia, que fecha a anterior
src/repos/fatura.ts          compoe o lote pela GERACAO MEDIDA. A conta fica no
                             SERVIDOR - R23, uma implementacao da formula
src/repos/boleto.ts          fala com a PORTA, nunca com a Sicoob. A falha de
                             registro COMMITA e a rota traduz em 502
src/repos/liquidacao.ts      o evento de caixa, e o unico gatilho do split
src/repos/conta_pagar.ts     A VERTENTE DA EMPRESA, na fatia que tinha prazo.
                             Quase nenhuma regra mora aqui: valor_pago e status
                             sao DERIVADOS por gatilho, o teto e um CHECK, a
                             imutabilidade do valor que nasceu de split e outro
                             gatilho, e a unicidade da origem e um indice. O
                             arquivo compoe e le - porque o segundo caminho de
                             escrita e o proprio split, que roda sozinho
src/repos/split.ts           junta insumo, chama o motor puro, persiste - e desde
                             03/08 PROVISIONA a despesa na mesma transacao (PRD
                             5.5 itens 2 e 3). Eram duas escritas das quatro
src/dominio/centavos.ts      aritmetica de dinheiro em BigInt. A divergencia do
                             float foi MEDIDA: aparece abaixo de 1%, nao nas taxas de hoje
src/dominio/faturamento.ts   quem entra no lote e quem e recusa contada
src/dominio/split.ts         PRD 5.3 a 5.5, funcao PURA. O liquido G3 e subtracao
src/sicoob/porta.ts          a interface. Nenhum tipo aceita segredo - so credencial_ref
src/sicoob/falso.ts          adaptador determinista, com memoria. Sem rede
src/http/rotas.ts            as 78 rotas (contadas em 29/07; eram 37 quando a
                             matriz fechou, em 27/07). A matriz de papeis NAO e
                             aplicada aqui
src/http/servidor.ts         node:http puro. O Autenticador vem de FORA, por injecao.
                             A API mora sob /api; todo o resto e a SPA. Travessia
                             barrada por RESOLUCAO de caminho, nao por filtro de ".."
scripts/servir.ts            O ENTRYPOINT. `npm start` (producao) / `npm run servir`
                             (local). Sobe a API e serve web/dist se existir
web/                         A SPA: React + Vite, tsconfig proprio. `npm run web:dev`
                             (5173, com proxy para a 3000) e `npm run web:build`.
                             ONZE telas: as quatro de cadastro na ORDEM das
                             camadas da prontidao, e depois a ordem dos ATOS do
                             dinheiro - Carteira (compor), Faturas (emitir,
                             boleto, baixa), Cobranca (o conector) e Relatorios
web/src/tema.ts              CORES E TIPOGRAFIA, num lugar so. A paleta e a DA G3
                             desde 28/07; o que esta marcado [derivado] (estados
                             semanticos, tema escuro, hover) segue sendo escolha
                             de quem escreveu o codigo. Nenhuma tela tem cor
                             literal, e todo par tem o contraste AA medido - e
                             desde 30/07 isso e TESTE e nao comentario. A fonte
                             (Inter) e SERVIDA POR NOS: o argumento antigo contra
                             webfont continua no arquivo, e o que o resolve e
                             `font-display: swap` com a pilha de sistema atras
web/tests/tema.ts            as 139 verificacoes da paleta. Confere a propria
                             calculadora antes de julgar as cores (preto sobre
                             branco e 21:1 por definicao), e a T4 pega a classe
                             que o tsc NAO pega: token novo em `Paleta` que
                             ninguem emitiu como custom property - o sintoma e um
                             `var(--x)` que resolve para nada e descarta a regra
                             CSS inteira, sem erro. JA PAGOU: `--fundo-suave`
                             nunca existiu e estava em uso na tela de Faturas
web/src/estilo.ts            O CSS INTEIRO, numa string e num modulo PURO - saiu
                             do ui.tsx em 30/07 justamente para poder ser lido por
                             teste. As tres cores literais do documento impresso
                             sao excecao NOMEADA, e a lista e fechada: papel e
                             preto sobre branco independente do tema da tela
web/src/iconografia.ts       o vocabulario FECHADO de icones: os tres estados, os
                             tres avisos, os seis status de fatura e a lista do que
                             se MOVE. Nenhuma tela escolhe desenho - ela pede um
                             nome semantico
web/src/icones.tsx           os desenhos do Phosphor. `Record<NomeDeIcone, Icon>`
                             exaustivo: nome sem desenho NAO COMPILA. Import
                             profundo por icone, e o custo esta MEDIDO - 37,7 KB
                             gzip para 54 icones, num pedaco proprio do bundle.
                             O logotipo e a UNICA excecao: marca e identidade,
                             nao iconografia
web/src/navegacao.ts         rota, titulo, icone e grupo das 12 telas, como DADO.
                             A ordem e decisao documentada (as camadas da
                             prontidao, depois os atos do dinheiro) e agora tem
                             teste - inclusive o "caminho desconhecido cai na
                             Prontidao", que estava so em comentario
web/tests/interface.ts       as 52 verificacoes da apresentacao: cor literal,
                             movimento nos DOIS sentidos (nada anima por acidente),
                             prefers-reduced-motion, unicidade da navegacao e a
                             forma da tabela
web/public/fontes/           a Inter variavel (48 KB, latino) e a licenca OFL. O
                             nome carrega a VERSAO porque o servirEstatico manda
                             `immutable` por um ano e o public/ do Vite nao recebe
                             hash no nome
web/src/dinheiro.ts          a regra 1 no browser: reais viram centavos por TEXTO,
                             sem multiplicar por 100 e sem float
web/src/dados.ts             `useDados`/`useAcao` e o `emLotes`. NENHUMA tela
                             engole erro: so o 404 de `contrato-vigente` vira
                             "sem contrato". O teto de 6 e do pool transacional,
                             e precisa ser NOSSO - producao e h2, e la o browser
                             nao limita nada
web/tests/lotes.ts           a primeira suite do web/. Prende o teto nos dois
                             sentidos: respeitado E atingido
web/src/contrato-regras.ts   as condicoes de criacao de contrato, PURAS e fora
                             do .tsx - o runner do web/ nao le JSX, entao regra
                             dentro do componente e inalcancavel por teste
                             (regra 8). E aqui que mora a Q-ORIGINADOR-01: sem
                             originador o botao TRAVA
web/src/contas-regras.ts     as regras da tela de contas a pagar, PURAS. Espelham
                             as travas do servidor, e espelho tem modo de falha
                             proprio: divergir sem que nenhum dos dois lados
                             pareca errado. Cada trava cita a linha que manda, e
                             o teste as exercita NOS DOIS SENTIDOS
web/src/cobranca-regras.ts   as regras da cobranca, PURAS e fora do .tsx. Duas
                             coisas: a REGRA 5 no formulario - o campo pede uma
                             referencia, e colar PEM, JWT, client_secret ou
                             base64 longo TRAVA o botao com o sinal nomeado -, e
                             o espelho das transicoes do servidor (so rascunho
                             emite, so emitida ganha boleto, baixa so em emitida
                             ou vencida), cada uma citando a linha que manda
web/tests/cobranca.ts        as 19 verificacoes dessas regras, nos dois sentidos.
                             Inclui o total da baixa ao CENTAVO, soma de inteiros
web/src/csv.ts               a exportacao, pura: separador `;` (Excel pt-BR), BOM
                             UTF-8, escape das aspas e do `;`, e dinheiro por
                             STRING a partir dos centavos - a regra 1 vale na
                             SAIDA tambem, que e onde ninguem procura
web/tests/csv.ts             as 16 verificacoes do CSV. `paraCsv` e testavel
                             porque o download mora em `baixar.ts`, separado
web/src/baixar.ts            o clique que baixa o arquivo. Toca `document` e
                             `URL`, que o runner do web/ nao tem - e por isso
                             esta FORA do csv.ts
web/src/telas/faturas.tsx    o caminho que faltava: emitir (lote e unitaria),
                             pedir o boleto, ver linha digitavel e Pix, e a BAIXA
                             MANUAL - que e o unico gatilho de split que funciona
                             sem certificado A1. Exporta CSV da competencia
web/src/telas/cobranca.tsx   o conector da Sicoob e o estado do A1. O 412 do
                             servidor e RESPOSTA ("nao ha conector"), nao falha
                             de leitura, e a tela distingue os dois. Diz o que
                             falta para um boleto ser pagavel, com o ID da questao
web/src/telas/relatorios.tsx repasse por dono, comissao por originador e uso da
                             usina - as tres views do banco, que ja respondiam e
                             nao tinham tela. Cada uma com CSV
web/src/telas/documento.tsx  a aba da logo, dos campos e da PREVIA imprimivel. A
                             previa E o documento: ela pinta o retorno de
                             `GET /faturas/:id/documento`, a mesma rota que o CRM
                             vai consumir. `window.print()` gera o PDF, e o CSS de
                             impressao esta no ui.tsx
web/tests/contrato.ts        as 9 verificacoes dessas regras. A do originador nos
                             DOIS sentidos - trava sem, destrava com
src/http/erros.ts            erro de dominio -> HTTP. 500 nao vaza mensagem interna
src/auth/jwt.ts              JWT do Supabase por node:crypto. O alg sai da CHAVE, nao do header
src/auth/autenticador.ts     Bearer -> auth_user_id. Auth PROPRIO (MT-06 resolvida)
src/dominio/documento.ts     CPF e CNPJ, inclusive alfanumerico (31/07/2026)
src/dominio/brcode.ts        O BR CODE do Pix estatico - EMV TLV + CRC16/CCITT-FALSE.
                             PURO e com 33 verificacoes, porque os dois modos de
                             falha nao se parecem: CRC errado o app RECUSA (ninguem
                             perde dinheiro); chave ou valor errados com CRC certo
                             o app ACEITA, e num Pix estatico nao ha txid por
                             fatura para conciliar depois. Valor entra em CENTAVOS
src/dominio/qrcode.ts        O DESENHO do QR - modo byte, Reed-Solomon sobre
                             GF(256), oito mascaras com as quatro regras de
                             penalidade, versoes 1 a 12 nos quatro niveis. O SVG
                             sai do SERVIDOR e vai no payload do documento: o CRM
                             consome a mesma rota e nao roda React. O `d` do
                             caminho e montado SO de indices da matriz, entao
                             nenhum dado de fatura atravessa a string - e o que
                             torna seguro o consumidor pinta-lo direto. Teto na
                             versao 12 e LEVANTA com o limite nomeado: o pior BR
                             Code possivel tem 243 bytes e cabe na 11, e truncar
                             daria um QR legivel apontando para um Pix incompleto
src/dominio/agenda.ts        A DECISAO dos dois processos periodicos do PRD 6,
                             sem banco e sem rede: quando retentar (exponencial,
                             com TETO DE INTERVALO e nao de contagem - a fila
                             NUNCA desiste sozinha, porque parar de cobrar um
                             cliente e decisao de negocio com dono) e o que fazer
                             com o que o banco respondeu. Os quatro numeros que o
                             PRD nao da estao num objeto so, marcados como
                             escolha - Q-AGENDA-02
src/cobranca/agenda.ts       O MOTOR das duas tarefas, com a forma copiada de
                             src/crm/sincronizacao.ts: porta INJETADA, transacao
                             POR ITEM aberta por um AbrirTransacao que vem de
                             fora, e a linha de registro que COMMITA antes do
                             trabalho para o EXCLUDE valer. NAO agenda (o PRD 3
                             deixou a escolha do host em aberto), NAO liquida (a
                             baixa e de repos/liquidacao, o unico gatilho do
                             split) e NAO desiste
src/dominio/planilha-tarifas.ts
                             A planilha da concessionaria, lida. PURO. O modo de
                             falha que ele persegue nao e o arquivo ilegivel - e
                             "1.234" lido CERTO como o numero ERRADO. Nao pula
                             linha, nao soma UC repetida e nao assume zero para
                             celula vazia: cada linha vira sucesso OU erro com o
                             numero da linha DO ARQUIVO
src/db/sqlstate.ts           O SQLSTATE de um erro do Prisma, achado ONDE ELE
                             ESTA. Existe porque em 7.9 sobre driver adapter o
                             codigo mora em meta.driverAdapterError.cause.code, e
                             a condicao que sincronizacao.ts usava nunca
                             alcancava - CicloJaEmAndamento nao era lancada
src/dominio/layout-do-documento.ts
                             As linhas do documento, na ordem e formatadas. O
                             PADRAO vive aqui, nao no banco: `campo_do_documento`
                             vazio significa "usa o padrao", e semear um padrao na
                             migration decidiria o layout de todo tenant futuro.
                             AUSENTE NAO E ZERO, e vale para dinheiro tambem -
                             `valor_total_centavos` e GENERATED e aceita nulo
src/repos/documento.ts       identidade, logo, campos e `paraFatura` - a composicao
                             do documento. Esta no SERVIDOR de proposito: a
                             decisao 4 pediu a rota do CRM preparada, e o CRM nao
                             roda React. A tela e um dos dois consumidores, nao a
                             dona do formato
src/crm/conexao.ts           pool do CRM. RECUSA o arranque se a credencial tiver
                             escrita, BYPASSRLS ou alcance fora de financeiro.*
src/crm/leitura.ts           PONTO UNICO de leitura. SQL constante, lista fechada
                             das 8 views. Nao ha funcao que aceite nome de tabela
src/crm/sincronizacao.ts     o ciclo: dedup, idempotencia, recusas contadas e a
                             reconciliacao em tres classes. Porta INJETADA
prisma/migrations/           VINTE E QUATRO, em ordem - e a 22, a 23 e a 24 NAO
                             estao em producao. A 24 traz a SITUACAO DO RATEIO na
                             UC: tres colunas espelho que so o conector escreve, e
                             com elas o lote passa a recusar por
                             `rateio_nao_ativado` - 12 das 41 UCs nao estao
                             ativadas no CRM (Q-SITUACAO-01, decidida pelo dono). A 23 traz `layout_do_documento` e
                             `bloco_do_documento`: a folha e os elementos
                             POSICIONADOS. Ela nao migra dado nenhum e nao semeia
                             nada - layout vazio significa "usa o padrao", que
                             vive em codigo e reproduz o documento de sempre.
                             A 22 traz `conta_pagar`, `pagamento`,
                             `categoria` e `centro_custo`: o lado que QUITA, que
                             nao existia. O vinculo unico ao split_item e indice
                             CHEIO sobre COLUNA GERADA - o parcial obvio cobriria
                             exatamente as colunas da FK e o CAT-1 o recusaria,
                             que e a regra 11 numa direcao nova. O gatilho nasceu
                             SECURITY DEFINER e o teste G4 acusou: invariante 19,
                             todo SECURITY DEFINER do projeto e LEITURA sem policy,
                             e este ESCREVE.
                             A 21 traz a agenda de cobranca: Ela traz a agenda de cobranca: os dois
                             carimbos que faltavam em `boleto`
                             (ultima_tentativa_em e proxima_tentativa_em, sem os
                             quais "esperar 2^n" so poderia ser contado do
                             nascimento da linha) e `agenda_execucao`, porque o
                             modo de falha de um processo periodico e a AUSENCIA
                             de execucao - que nao produz erro, nem log, nem
                             linha. O indice da fila e parcial e NAO-UNICO, e a
                             distincao e a regra 11 inteira. O EXCLUDE por
                             (conector, TAREFA) impede duas rodadas simultaneas.
                             O gatilho de auditoria dela nasceu de um erro meu
                             que o teste G2 pegou - ver o corpo da migration.
                             A 19 traz o documento de
                             cobranca: identidade (Pix recebedor + metadado da
                             logo), o binario em tabela propria e o layout por
                             tenant com a lista de campos FECHADA POR ENUM. A
                             logo audita por PROPAGACAO - bytea em to_jsonb custa
                             2,00x (medido), entao o gatilho carimba o sha256 na
                             tabela auditada em vez de jogar o arquivo na trilha.
                             O mime sai da ASSINATURA do arquivo, nao do rotulo:
                             SVG e recusado porque a logo e embutida no HTML.
                             A 20 acrescenta UNIQUE (tenant_id, identidade_id),
                             redundante para o banco e NECESSARIA para o gerador:
                             sem ela o db pull produz uma relacao to-one que o
                             prisma generate recusa com P1012. E a regra 11 numa
                             direcao nova - ver Q-PRISMA11B-01.
                             16 traz a carteira, 17 o split e a
                             parcela da comissao, 18 o conector de cobranca. As
                             quinze primeiras: 13 fecha Q-AUDIT-01 e Q-DISTRIB-01;
                             14 traz conector_execucao; 15 corrige o gatilho de
                             auditoria que a 14 esqueceu (o teste G2 acusou)
src/dominio/layout-visual.ts O LAYOUT DA FATURA POR POSICAO (migration 23).
                             Puro: recebe a folha, os blocos e os dados e
                             devolve o documento com cada elemento JA
                             POSICIONADO e JA formatado. NAO desenha - devolve
                             DADO, porque o CRM consome a mesma rota e nao roda
                             React. Milimetro, nao pixel: pixel depende de DPI e
                             porcentagem mudaria a proporcao entre A4 e A5, que
                             e o que escolher a folha deveria impedir. As cinco
                             conferencias distinguem ERRO de SINAL: bloco fora
                             do papel e recusa (nao ha leitura em que o usuario
                             esteja certo), sobreposicao e aviso (pode ser
                             intencional)
web/src/layout-regras.ts     AS REGRAS DO EDITOR, puras e fora do .tsx: arrastar,
                             redimensionar, prender na grade e escalar. As
                             MEDIDAS DOS PAPEIS nao estao aqui - vem do servidor,
                             porque duas verdades sobre o tamanho da folha
                             sairiam como previa desenhando uma coisa e
                             impressora saindo com outra. A alca oposta e PONTO
                             FIXO, e e isso que a W5 afirma: "a alca muda a
                             largura" e satisfeito por uma implementacao que move
                             o bloco inteiro
web/src/telas/layout-editor.tsx
                             O EDITOR: papel, orientacao, margens, os seis tipos
                             de bloco e o arrasto. A folha na tela tem o TAMANHO
                             REAL do papel, so escalada - o que se ve e o que sai
prisma/schema.prisma         vem do `db pull`. NAO editar a mao - ver regra 11
prisma.config.ts             lido SO pelo CLI. NAO exige DIRECT_URL para
                             `generate` - medido: generate roda com a URL
                             apontando para porta morta, porque le o schema e
                             escreve arquivo, nao conecta. Exigi-la na carga do
                             arquivo transformou o conserto de um defeito de
                             producao num segundo erro, no servidor, com o dono
                             esperando. `migrate`, `db` e `studio` continuam
                             exigindo, com mensagem que diz a porta certa e a
                             errada. tests/prisma-config.ts roda o CLI de verdade
prisma/seed/                 regra_comissao e tarifa, idempotente
scripts/bootstrap-plataforma-admin.sql
                             PROVISIONAMENTO, nao migration. O primeiro admin de
                             plataforma. Exige -v modo=ensaio ou -v modo=valendo
scripts/provisionar-tenant.sql
                             PROVISIONAMENTO do primeiro tenant DO FINANCEIRO
                             (nao do CRM), o vinculo admin e o conector_crm
scripts/provisionar-usuario.sql
                             PROVISIONAMENTO do SEGUNDO usuario em diante, num
                             tenant que ja existe. Nao havia caminho: os outros
                             dois scripts cobrem so o primeiro, e nao ha rota de
                             gestao de usuario. Guarda o e-mail CONFIRMADO -
                             sem isso a linha nasce certa e a pessoa nao loga
scripts/cadastrar-originadores.ts
                             CADASTRO dos originadores, pelo caminho da
                             aplicacao. A lista vem de ARQUIVO, nao do corpo do
                             script: `documento` e NOT NULL e e CPF/CNPJ de
                             pessoa real, e `tipo` decide quanto ela recebe.
                             Medido em 29/07: `financeiro.parceiros` tem 9 linhas
                             e NAO expoe documento nenhum - o CRM nao e fonte
                             disto. Confere o lote INTEIRO antes de escrever, e
                             digito que nao fecha aborta tudo: `classificar()`
                             gravaria com documento_validado=false e nao ha R9
                             para originador. `npm run originadores`
scripts/ciclo-crm.ts         COMPOSICAO do ciclo: liga pool do CRM, leitor e
                             motor. Exige --ensaio ou --valendo. `npm run ciclo`
scripts/agenda.ts            O ENTRYPOINT da agenda. Roda UMA VEZ e sai, e isso e
                             a decisao: o PRD 3 diz que "agendamento de jobs segue
                             a escolha do host" e a escolha NAO foi feita - um
                             processo residente escolheria por todo mundo. Quem
                             agenda e o systemd timer, o cron ou uma pessoa.
                             `npm run agenda -- --fila|--consulta|--certificado`.
                             ATENCAO ao --ensaio: a PORTA e chamada de verdade,
                             entao contra a Sicoob real ele registra boleto LA e
                             da rollback AQUI
scripts/importar-vencimentos.ts
                             IMPORTACAO do DIA de vencimento das UCs por planilha
                             (Q-SPEC001-02, decidida em 03/08: varia por UC). O
                             --modelo sai PREENCHIDO com as UCs reais, e --saida e
                             OBRIGATORIO: `iniciar()` imprime duas linhas no
                             stdout, e o CSV feito por redirecionamento nascia com
                             elas no topo - o proprio importador o recusava depois
scripts/importar-tarifas.ts  IMPORTACAO das tarifas da concessionaria por
                             planilha (PRD 5.1). O casamento e por numero_uc,
                             porque ninguem tem id de fatura na mao. O ensaio
                             imprime a INTERPRETACAO de cada valor ao lado do
                             texto original - e a unica forma de pegar "1.234"
                             lido como R$ 1,23 antes de a fatura sair.
                             `npm run tarifas`
scripts/faturar.ts           COMPOSICAO do lote de faturamento. Exige --ensaio ou
                             --valendo E --competencia: nao ha "mes corrente" por
                             default. `npm run faturar`
scripts/verificar-auth-real.ts
                             auth ponta a ponta contra o Supabase real. Sem token
                             no stdin faz so o preflight do JWKS, que nao pede
                             credencial. `npm run auth:verificar`
tests/qrcode.ts              as 45 verificacoes do QR, e o assunto principal do
                             arquivo e COMO elas se verificam: nenhuma compara a
                             saida com constante minha. Sindrome nula (usa a tabela
                             do corpo, NAO a divisao que gerou a paridade),
                             divisibilidade do BCH por rotina de bits escrita de
                             outro jeito, distancia de Hamming do codigo, total de
                             codewords DERIVADO da geometria contra as ancoras
                             publicadas, a paridade publicada do exemplo do ISO
                             18004 com os codewords de dado derivados a mao, e
                             ida-e-volta por decodificador separado que redescobre
                             os modulos de funcao por PREDICADO. Pegou dois
                             defeitos - ver RESUMO-SESSAO-15 2
tests/repos-documento.ts     as 45 verificacoes do repo de documento, com BANCO e
                             pela role sem BYPASSRLS. Cobre o que NAO mora no
                             codigo: o mime pela ASSINATURA do arquivo (SVG e GIF
                             recusados pelos bytes), o sha256 derivado pelo GATILHO
                             e conferido contra node:crypto, a lista de campos
                             fechada pelo ENUM, e o isolamento das seis leituras de
                             paraFatura. Afirma a RELACAO, nao constante: fixar um
                             total seria fixar dependencia de ordem de execucao
tests/agenda.ts              as 24 verificacoes da agenda, e o assunto do arquivo e
                             COMO elas se verificam: nao ha tabela de intervalos
                             esperados (que passaria com qualquer progressao que
                             eu copiasse para a tabela). Sao PROPRIEDADES -
                             monotonia, f(n+1)=2f(n) enquanto nao satura, o teto
                             nunca passado E alcancado, e f(1)=base
tests/sqlstate.ts            as 10 verificacoes do extrator, com a forma REAL do
                             erro do Prisma 7.9 COPIADA DA SAIDA como fixture. A
                             S2a afirma que a condicao ANTIGA falha - e o registro
                             executavel do defeito, e nao um comentario
tests/planilha-tarifas.ts    as 23 verificacoes da leitura de dinheiro. A V4
                             compara a saida do servidor com a do BROWSER, uma
                             contra a outra e nao cada uma contra uma tabela
                             minha: o risco real e as duas divergirem
tests/regra11.ts             as 8 verificacoes da regra 11 NO CODIGO. A lista de
                             chaves parciais sai do proprio schema.prisma, e o
                             criterio e o PAR (modelo, chave): tenant_id_documento
                             e PARCIAL em cliente e CHEIA em originador, e um
                             teste por nome acusaria os dois usos legitimos
tests/repos-agenda.ts        as 31 verificacoes da agenda COM BANCO: o carimbo
                             chegando a coluna, o predicado da fila em SQL, o
                             EXCLUDE recusando a segunda rodada, e a idempotencia
                             vindo do liquidacao_fatura_unica e nao da chave
tests/repos-tarifas.ts       as 13 verificacoes do lancamento em lote: casamento
                             por numero_uc, o total como coluna GERADA, e
                             "ausente nao e zero" observavel
tests/catalogo.sql           CAT-1 a CAT-9: as regras 1, 2, 3 e 11 por catalogo.
                             Leitura pura - RODE TAMBEM contra producao:
                             psql "$DIRECT_URL" -f tests/catalogo.sql
tests/carteira.sql           as invariantes da carteira que sao DO BANCO, cada
                             uma nos dois sentidos
tests/dominio-carteira.ts    os dois motores SEM banco. A invariante do centavo
                             em 2.000 combinacoes
tests/repos-carteira.ts      o ciclo do dinheiro ponta a ponta, pela role sem
                             BYPASSRLS e pelo adaptador falso
tests/                       1262 verificacoes em 48 suites. `npm test` roda todas.
                             A CONTAGEM E `npm test | grep -c '^ok '`, e o metodo
                             esta escrito aqui porque os numeros anteriores (461,
                             496) vinham de uma soma que nao se reproduzia: so
                             parte das suites anuncia total proprio.
                             As 110 de 30/07 foram contadas na FONTE
                             (`grep -c "chk('"`) e conferidas contra o delta do
                             npm test: 854 -> 990, diferenca ZERO. E a terceira
                             sessao em que uma contagem lida da tela nao se
                             reproduziu, e a primeira em que as duas medicoes
                             foram feitas de proposito
tsconfig.json                `npm run typecheck` = tsc --noEmit. Roda no CI
```

Os dois spikes são **reproduzíveis**, não relatos. `RESULTADOS.txt` em cada um é saída de execução real.

---

## O que a F1 tem que respeitar

Decidido e medido, não opinado. Detalhe em `adr/ADR-0003` r2.

- `tenant_id uuid NOT NULL` em toda entidade de negócio, **desde a migration 1**
- **FK composta `(tenant_id, id)`** em toda referência entre entidades de negócio, com `UNIQUE (tenant_id, id)` nas referenciadas. Medido: FK simples atravessa tenant e o banco aceita
- RLS `ENABLE` + `FORCE` + ao menos uma policy em toda tabela com `tenant_id`. RLS sem policy nega tudo em silêncio — **82** das 151 tabelas do CRM estão nesse estado
- **A role de runtime não pode ter `BYPASSRLS`.** Medido em 27/07: a role `postgres` do Supabase tem `rolbypassrls = true`, e conectar com ela anula as 24 policies e o `FORCE` de uma vez. Ela não nasce em migration nenhuma, de propósito — é provisionamento, e sem ela o isolamento é enfeite
- `SET LOCAL`, **nunca `SET`**. Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte
- Ponto único de emissão do contexto, dentro de `$transaction`, reconstruindo a operação no client de transação
- `timeout` e `maxWait` explícitos. Os defaults do Prisma são 5.000 ms e 2.000 ms, e nenhum dos dois serve
- Vigência de `regra_comissao` e `tarifa` sem sobreposição, **recusada pelo banco** (`EXCLUDE USING gist`, exige `btree_gist`). Alíquota não pode depender de qual linha o planejador devolveu primeiro
- Tarifa em `numeric(12,6)` R$/kWh. Dinheiro em centavos; **taxa não é dinheiro**, e centavos truncariam a tarifa
- Teste de vazamento no CI, pool de tamanho 1, desde o primeiro dia

---

## Como aplicar as migrations

As migrations são **SQL puro**, não geradas por `prisma migrate dev`. São **vinte e quatro**. **Vinte e uma estão aplicadas em produção** — a 21 entrou em 30/07 — e a **22 (`contas_a_pagar`), a 23 (`layout_visual_do_documento`) e a 24 (`situacao_do_rateio`) não estão**: as três são parte do deploy pendente. A ordem importa. As três primeiras montam a fundação, conforme a `SPEC-001` §3.2:

```
prisma/migrations/20260725120000_fundacao_schema/   tabelas, enums, as 10 FKs compostas
prisma/migrations/20260725120100_isolamento_rls/    app.current_tenant_id(), RLS FORCE, policies
prisma/migrations/20260725120200_rbac_e_trilha/     RBAC dois níveis, RLS de plataforma, trilha da R2
```

Aplicar — **só `migrate deploy`**, nunca `migrate dev`, `db push` ou `migrate reset`:

```bash
npx prisma migrate deploy    # transacional POR MIGRATION. E o que salva de meia-aplicacao
```

Validar num banco limpo:

```bash
npm test          # typecheck + as 48 suites, 1262 verificacoes (linhas `ok`)
npm run typecheck # sozinho, tsc --noEmit
```

As suítes precisam de PostgreSQL em `127.0.0.1:5432`. Se não houver:

```bash
docker run -d --name pg16 -e POSTGRES_PASSWORD=spike -p 5432:5432 postgres:16
```

O mesmo roda no CI (`.github/workflows/isolamento.yml`), com PostgreSQL 16 de serviço — `ADR-0004` condição 5 e `SPEC-001` §9 exigem que o teste de vazamento corra fora da máquina de produção desde o primeiro dia.

**Quatro coisas para saber antes de mexer:**

0. **Migration nova exige `db pull` + `generate` depois de aplicar.** O `schema.prisma` e o client de `src/generated/` vêm do banco, e o `generate` que falha **deixa o client anterior intacto** — `tsc --noEmit` passa em cima dele e **typecheck verde não prova que o client corresponde ao schema** (`Q-PRISMA11B-01`). Medido em 30/07: `db pull` contra um PostgreSQL 16 local com as 21 migrations reproduz o `schema.prisma` commitado **byte a byte**, então dá para fazer o ciclo inteiro sem tocar em produção.
1. **`prisma/schema.prisma` vem do `db pull` e não se edita à mão.** O schema declarado é derivado do real, nunca o contrário. Editar compila e o `db pull` seguinte reverte em silêncio — é a regra 11, e o custo dela foi medido: uma relação tipada errado devolveu um contrato de R$ 111,00 onde o vigente valia R$ 789,00.
2. **A conexão do CLI é `DIRECT_URL`, e ela tem que ser o *session pooler* na 5432.** O host direto `db.<ref>.supabase.co` é **IPv6-only** sem o add-on de IPv4 e não conecta de Codespaces nem de CI. A porta 6543 é *transaction pooler* e não serve para migration — não falha com mensagem útil, pendura. Detalhe no `.env.example`.
3. **Nunca use rolespec por palavra-chave em `GRANT`/`REVOKE` de role.** Medido em 27/07 contra Supabase, PG 17.6: `GRANT <role> TO CURRENT_USER` **derruba o backend do Postgres** e chega ao Prisma disfarçado de `P1017`. Vale para `CURRENT_ROLE` e `SESSION_USER`. A forma segura é `EXECUTE format('GRANT … TO %I', current_user)`. Foi a causa raiz da migration 10 aplicada pela metade — `RESUMO-SESSAO-6` §1 e §2.
4. **`prisma migrate` precisa do `binaries.prisma.sh`.** O Prisma 7 dispensa o engine Rust em *runtime* sobre driver adapter, mas a CLI ainda baixa o `schema-engine` para migrar.

---

## Como publicar a agenda

O deploy de 30/07 de manhã não tinha migration. **Este tem**, e o passo extra vem **antes** do restart — sem ele o servidor sobe e a agenda falha na primeira chamada, porque `agenda_execucao` não existe.

```bash
cd /opt/financeiro/app
sudo -u financeiro git pull

# 1. O SCHEMA. Transacional POR MIGRATION - e o que salva de meia-aplicacao.
sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH npx prisma migrate deploy

# 2. O CLIENT. `src/generated/` esta no .gitignore, entao o `git pull` NAO o traz
#    e uma migration nova nao chega ao client sozinha. Ver o quadro abaixo.
sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH npx prisma generate

sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH npm run web:build
systemctl restart financeiro
systemctl status financeiro && journalctl -u financeiro -n 30
```

> ### ⚠️ O passo 2 foi esquecido no deploy de 30/07 11:50, e derrubou a aba Documento em produção
>
> *(Num servidor ainda no estado antigo, o passo 2 precisa de `DIRECT_URL="postgresql://nao-conecta:nao-conecta@invalido.local:1/nao-disca"` na frente. Depois deste deploy, não precisa mais — ver o parágrafo do `prisma.config.ts` abaixo.)*
>
> O sintoma chegou pela tela, do próprio dono: **`Cannot read properties of undefined (reading 'findFirst')`**. A cadeia:
>
> 1. `src/generated/` está no `.gitignore` — o `git pull` do VPS não o traz;
> 2. **nada no caminho de deploy rodava `prisma generate`** (só o CI e as suítes — e `tests/repos.sh` só gerava quando o diretório *não existia*, então nunca atualizava um obsoleto);
> 3. as migrations 19 e 20 entraram em produção e trouxeram `identidade_de_cobranca`, `logo_de_cobranca` e `campo_do_documento`;
> 4. o client do servidor continuou o de 28/07, sem esses três modelos.
>
> `dbt().identidade_de_cobranca` era `undefined`, e `undefined.findFirst()` foi o que o usuário viu.
>
> **A parte que ensina: o deploy foi conferido dos dois lados e deu tudo verde.** `index.html` certo, bytes dos assets iguais, rotas novas em **`401 TokenInvalido`**. Mas **`401` prova que a rota existe e recusa credencial — ela nem chega ao banco.** As três rotas do documento estavam quebradas atrás daquele 401, e a conferência que parecia rigorosa não tocava a camada onde estava o defeito.
>
> **E o próprio conserto quebrou na primeira tentativa, no servidor.** `npx prisma generate` respondeu `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL` — o `.env` do VPS tem `DATABASE_URL` e não tem `DIRECT_URL`, e **nunca precisou ter**: as migrations sempre foram aplicadas de fora. O `prisma.config.ts` exigia a variável na **carga do arquivo**, antes de o Prisma saber que `generate` nem discaria. Medido: `generate` roda em **711 ms com a URL apontando para uma porta morta** — ele lê o schema e escreve arquivos, não conecta. Corrigido: `generate` dispensa a variável; `migrate`, `db` e `studio` continuam exigindo, com mensagem que diz a porta certa (5432, *session pooler*), a errada (6543) e o porquê. Suíte `tests/prisma-config.ts`, que roda o **CLI de verdade** com um `.env` sem a variável — importar o módulo daqui o executaria com o `.env` desta máquina, que é justamente a condição que não reproduz o servidor.
>
> **O conserto estrutural já está no código, e não é o passo 2:** `iniciar()` passou a comparar as tabelas de `public` com os modelos do client e **recusa o arranque** com o nome das que faltam e o comando que conserta — a mesma forma da guarda que já recusa role com `BYPASSRLS`. Um passo a mais no procedimento dependeria de alguém lembrar, e a regra 11 deste projeto já disse o que acha disso. Suíte `A9a`–`A9c` em `tests/app.ts`, com plantio que prova que a guarda morde.

Conferir depois, e é leitura pura:

```bash
psql "$DIRECT_URL" -f tests/catalogo.sql     # tem de dizer "9 invariantes, nenhuma falha"
```

**O `web:build` agora é obrigatório**: a SPA mudou nesta rodada — a tela "Prontidão" virou **"Pendências"**, "Competência" virou **"Mês de referência"** nos rótulos, e a aba Documento ganhou o painel *Conferir o QR com a câmera*. O bundle saiu como `index-BPNacouw.js`, 206 módulos.

**A agenda não roda sozinha depois disso, e é de propósito.** O `PRD` §3 diz que *"agendamento de jobs segue a escolha do host"* e lista Vercel-com-cron contra VPS-com-PM2 numa tabela de trade-off **sem decidir**. Escolher por quem decide seria improviso (regra 10), então o script roda **uma vez e sai**, e quem o chama é o host. Para o VPS de hoje, a forma seria — e isto é **sugestão, não configuração aplicada**:

```cron
*/15 * * * *  cd /opt/financeiro/app && npm run agenda -- --fila     --valendo --auth-user <uuid>
17   6 * * *  cd /opt/financeiro/app && npm run agenda -- --consulta --valendo --auth-user <uuid>
```

**Enquanto não houver certificado A1, as duas tarefas recusam com `503` nomeado** — o adaptador padrão é o que recusa, não um que finge. Isso é o comportamento certo e não um erro a investigar: a agenda existe pronta para o dia em que a credencial chegar. O que já funciona hoje, sem A1, é `--certificado`, que só lê.

**Uma armadilha do `--ensaio`, e ela é real:** no ensaio a **porta é chamada de verdade**. Contra o adaptador falso e contra o sandbox isso é o que se quer. Contra a Sicoob de produção, `--fila --ensaio` **registraria boleto lá e daria rollback aqui**, deixando os dois lados divergentes. O script avisa na saída.

---

## Onde a F1 está, contra os critérios formais

Medido em 27/07 contra o `PRD-v2.2` §10, não estimado. **Os três critérios de saída da F1:**

| Critério de saída | Evidência | |
|---|---|---|
| `migrate reset` limpo | `tests/run.sh` aplica as 24 migrations em banco vazio a cada `npm test`; `EXIT=0` | ✅ |
| sync idempotente | ✅ **cumprido contra o CRM real em 27/07.** Duas execuções valendo: 48 lidos, 41 criados na 1ª, **0 criados e 0 atualizados na 2ª**, com um único instante de `criado_em` nas 41 linhas. Também provado em 1.000 linhas pelo `N30` | ✅ |
| escrita no CRM falha por permissão | automatizado em 27/07: `N21`/`N21b` (a guarda de arranque recusa credencial com escrita, inclusive privilégio **herdado por role**) e `N25` (a sessão é read-only). A medição por catálogo que dizia "0 privilégio de escrita" veio de método fraco — ver `Q-PGNET-01` | ✅ |

**As entregas nomeadas da F1:**

| Entrega | Estado |
|---|---|
| projeto, auth, RBAC dois níveis | ✅ auth medido contra o Supabase real; RBAC com as 16 células do PRD §3 |
| schema completo com `tenant_id` | ✅ 13 migrations, 20 tabelas com RLS, 24 policies, **zero** tabela com `tenant_id` sem policy |
| cadastros | ⚠️ 6 repositórios para 11 modelos de negócio — faltam `dono_usina`, `regra_comissao`, `regra_repasse`, `tarifa`, `cliente_estado_crm` |
| **conector CRM read-only** | ✅ **as 4 entidades da `SPEC-002` §2 espelhadas** — `cliente`, `usina`, `usina_geracao` e `unidade_consumidora`, com a `PortaDeLeitura` em 7 das 8 views. Rodado valendo contra o CRM real: 76 clientes, 3 usinas, 35 UCs, 8 competências de geração, e 2ª passada em 0/0. **57 verificações** — as quatro últimas (`N51`–`N54`) são o sinal da `R21-b`: divergência entre campo derivado e campo local vira registro em `conector_execucao.detalhe`, sem recusar e sem sobrescrever |

**A leitura honesta, atualizada em 30/07:** **os três critérios formais de saída da F1 estão cumpridos** — o ciclo rodou valendo, duas vezes, contra o CRM real — **e a entrega nomeada também**. O parágrafo que estava aqui dizia que a `Q-ESCOPO-01` (*"o conector entrega 1 de 4 entidades"*) era o bloqueio real da F2; **ela fechou em 28/07 e este texto não acompanhou**: as quatro entidades são espelhadas e testadas. Ver "Sobre a `Q-ESCOPO-01`" no alto. O que resta da F1 é a linha de **cadastros** acima, e ela não é bloqueio de fase.

Essa vermelha só apareceu porque a `SPEC-002` foi reconciliada com o medido (v1.3) e cada teste obrigatório teve que ser nomeado ao lado da sua regra — uma linha não teve como ser preenchida. **É o método funcionando, não uma surpresa:** a spec estava atrás do código, e é a spec que manda.

---

## Pendente

A lista completa, com dono nomeado, está em `RESUMO-SESSAO-7` §Pendências gerais. O essencial:

| Item | Estado |
|---|---|
| **Deploy das sessoes 18, 19 e 20 (migrations 22 e 23)** | 🔴 **Pendente, e agora sao DUAS migrations mais o bundle.** A 23 (`layout_visual_do_documento`) entrou na sessao 20 e a SPA mudou, entao o `web:build` nao e opcional. **E ha uma ordem que mudou:** aplicar a migration de fora SEM o deploy em seguida deixa producao viva mas **nao reiniciavel** - a guarda de arranque recusa subir com tabela em `public` sem modelo no client, e um restart por qualquer motivo derruba o site ate alguem rodar `prisma generate` la. Ou o ciclo inteiro de uma vez, ou a migration espera. Ver o quadro na `RETOMADA` §2. Corpo original: **Pendente, e tem migration.** `contas_a_pagar` traz `conta_pagar`, `pagamento`, `categoria` e `centro_custo`. Ordem: `git pull` → **`npx prisma migrate deploy`** → `prisma generate` → `web:build` → `restart`. **Sem o `generate` o servidor recusa subir** — a guarda de arranque da sessao 16 compara as tabelas de `public` com os modelos do client. Conferir depois: `psql "$DIRECT_URL" -f tests/catalogo.sql`, que tem de dizer 9/9. **Junto vai o `3fd7b22`**, que estava pendente desde 30/07 |
| ~~**Deploy da agenda (migration 21)**~~ | ✅ **Aplicada em produção em 30/07**, pelo `DIRECT_URL`, como as 20 anteriores. Conferido depois: `agenda_execucao` com RLS+FORCE+policy+gatilho+EXCLUDE, os dois carimbos em `boleto`, o CHECK, o índice da fila, `DELETE` revogado, e o catálogo **9/9 contra produção**. Nenhum dado de negócio tocado. O histórico tinha 2 registros sem `finished_at` do `auditoria_repasse_e_furos` — conferidos antes: os dois estão **marcados como rolled back** desde 27/07, resquício do crash do `GRANT`, e a terceira linha é a aplicação bem-sucedida. ~~Produção tem **20** migrations e o repositório tem **21** — medido em `_prisma_migrations` em 30/07. Este deploy tem **um passo a mais** que o de manhã, e ele vem **antes** do restart: `npx prisma migrate deploy`. Sem ele o servidor sobe e a agenda falha na primeira chamada, porque `agenda_execucao` não existe. Ciclo completo em **"Como publicar a agenda"**, abaixo. **O que já foi provado:** `npm test` EXIT=0 com 964 verificações, os **9** invariantes de catálogo **contra produção**, e `db pull` reproduzindo o `schema.prisma` commitado byte a byte |
| **`Q-AGENDA-02`** | 🟢 **Nova, e é confirmação e não decisão de projeto.** O `PRD` §6 diz "retry exponencial" e "consulta ativa diária" e **não dá os números**: base, teto, prazo de aviso do A1 e teto de itens por rodada. Os quatro estão num objeto só (`POLITICA`, em `src/dominio/agenda.ts`), com o raciocínio ao lado, e **nenhum teste depende deles** — as suítes usam política artificial de propósito. Trocar os quatro é editar quatro números. **O que não é escolha:** a fila **não desiste sozinha** — o teto é do *intervalo*, não da contagem, porque parar de cobrar um cliente é decisão de negócio com dono |
| **`Q-CRMCODIGO-01`** | 🔴 **Nova em 30/07, e achada ao REMEDIR o CRM antes de a operação digitar os contratos.** `financeiro.lead_merges` registra **76 merges em 30/07**: `lead.codigo` **não é estável** — 39 dos 41 códigos do rateio mudaram, com a mesma UC e o mesmo cliente —, `financeiro.vendas_ganhas` caiu de **80 para 51** linhas (o `DISTINCT ON (l.id)` conta lead distinto e os merges colapsaram duplicatas), a **lista de originadores caiu de três nomes para dois** (`Jezielly Vieira` tem **zero** cards hoje) e **duas atribuições trocaram de dono**, uma delas de **1.987,2 kWh/mês**. É vermelha porque digitar contrato pelo mapa de 29/07 pagaria comissão à pessoa errada **sem erro e sem log**, e a R20-b congela o tier no `rascunhar` — não há caminho de conserto. **O que está bem, e foi conferido:** a sincronização casa por `contrato_id` e `crm_lead_id`, os dois UUID, então o espelho não quebra. **O lado bom:** as **12** atribuições que eram invisíveis às views ficaram legíveis (40 de 41), e **as 12 bateram** com o que o conector de análise havia dito — duas medições por caminhos diferentes concordando. Mapa vigente em `ATRIBUICAO-originador-2026-07-30.md`, ordenado por **UC** |
| **`Q-ORIGINADOR-01`** | ✅ **Fechada em 29/07 na opção (a)** — as UCs da carteira **levam** originador, e a comissão está inteira pela frente: ninguém recebeu nada ainda, então `faturas_cheias_pagas` nascer em 0 é o valor **certo** e não a armadilha que parecia. A premissa que acompanhava a resposta (*"nenhuma venda foi efetivada"*) foi conferida contra o CRM antes de gravar, **não fechou** — `Clientes ativos - Assinatura`/ATIVOS tem 29 cards — e foi retirada pelo dono. A decisão não muda; a **base** dela sim: sustenta-se em **testemunho**, não em medição. Nada nos dois sistemas registra comissão paga por fora — ver `QUESTOES` §9. O campo é **obrigatório na tela**; `originador_id` segue nullable no banco de propósito. ~~**Falta o insumo, não a decisão: a lista de originadores**~~ — **29/07, noite: o eixo foi decidido e o insumo encolheu.** *"O originador vai ser o `vendedor_origem` até segunda ordem"*: a lista fechou em **três nomes** (Renata 49 ganhos, Out Sales 29, Jezielly Vieira 1) e a atribuição por UC ficou medida para 40 das 41 — **12 delas por um caminho que o financeiro não consegue ler**. Ver **`Q-ORIGVEND-01`** e `ATRIBUICAO-originador-2026-07-29.md`. Falta o que nenhuma consulta entrega: **três CPF/CNPJ**, a natureza, a confirmação do tipo e uma UC arquivada |
| **`Q-PRONTIDAO-COMIS-01`** | ✅ **Fechada em 29/07** — era a contagem que faltava, e a `Q-ORIGINADOR-01` disse qual das duas direções valia. Décima camada da prontidão, `originador_do_contrato`: *"nenhum contrato"* segue `nao_medido` e *"contrato sem originador"* é `pendente`. Os dois `?` que eram o mesmo agora se distinguem. `K18f`–`K18i`, com a contagem conferida **contra a tabela** e não contra número fixo |
| **Bootstrap — o primeiro `plataforma_admin`** | 🟡 **Script pronto e provado; falta o `COMMIT`.** **04/08: essa pendencia tem uma consequencia que ninguem tinha ligado.** O `RESUMO-SESSAO-8` traz o `auth_user_id` dele (`efcc8e11-…`) dentro de **linhas de comando prontas para copiar**, e quem copiar leva `UsuarioNaoProvisionado` **403** — porque o bootstrap rodou em ensaio com `ROLLBACK` e a conta nunca existiu no banco. Os dois usuarios reais de producao sao `35f4dda9-…` (Vinicius) e `152281e7-…` (Joao Pedro), e vale para TODO script que pede `--auth-user`. Registrado na `RETOMADA` §4. Corpo original: `scripts/bootstrap-plataforma-admin.sql`, com `-v modo=ensaio\|valendo` — sem default, porque script de provisionamento que escreve por esquecimento é o modo de falha errado. Conta criada no Supabase Auth (`efcc8e11-…`) e ensaio rodado contra ela: `usuario` + tier criados, `app.resolver_login` devolveu `tier = plataforma_admin`, 2 linhas de trilha, `ROLLBACK` deixou tudo em zero. `app_financeiro` continua sem `INSERT` nessa tabela, de propósito |
| **Role LOGIN de runtime + `DATABASE_URL`** | ✅ **Fechado em 27/07** — `app_financeiro_login`, `NOSUPERUSER NOBYPASSRLS`. Isolamento provado conectado por ela: usuário de A apontando o contexto para o tenant B lê **0 linhas** e tem a escrita recusada. O composition root recusa o arranque se a role tiver `BYPASSRLS` |
| **Reunião com o contador** | ✅ **Fechada em 28/07.** As dez voltaram respondidas; três lacunas (a 1 com duas marcas, a 3b questionada, a 4b em branco) fechadas por decisão do dono no mesmo dia; a 6a virou `Q-PAUTA-6A-01`. Fecharam a `Q-021` e a `Q-011`, e a `RATEIO-USO-01` caiu de 🔴 para 🟡. De-para na tabela final da `PAUTA-contador.md`, efeito de cada uma em `QUESTOES.md` §9 |
| ~~**Deploy das sessões 14 e 15**~~ | ✅ **Executado em 30/07 11:50.** A linha anterior dizia "não executado, o VPS não é alcançável" e ficou vencida no mesmo dia: a inalcançabilidade era **do momento**, não do ambiente — remedido às 11:36, TCP 443 e 22 abrem. `git pull` fez fast-forward para `8050a41`, `web:build` transformou 206 módulos e imprimiu os três hashes idênticos aos daqui, e as rotas novas responderam **401 `TokenInvalido`** de fora. Medições dos dois lados em `RESUMO-SESSAO-15.md` §7. **O que segue sem prova, e nenhum comando substitui: nenhuma tela foi aberta e o QR não foi lido por câmera** — é o `ROTEIRO-REVISAO.md` |
| **Certificado A1 e credencial Sicoob** | 🔴 **`Q-SICOOB-01`, e é o que segura a F2.** O critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura automaticamente"*, e o ciclo está provado **contra o adaptador falso**, não contra o sandbox. Do nosso lado está pronto: porta injetada, `conector_cobranca` com a referência por tenant (regra 5), e o adaptador padrão que **recusa com 503 nomeado** em vez de fingir |
| **`Q-FATCHEIA-01`** | 🔴 O `PRD` §5.4 usa "fatura cheia" quatro vezes e **não define o termo** em lugar nenhum. Define em que mês começa a comissão de todo contrato novo. `fatura.flag_fatura_cheia` é `NOT NULL` **sem default**, de propósito |
| **PgBouncer em modo *transaction*** | 🔴 Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` **reabre inteiro**. O `.env.example` manda o runtime para *session mode* por isso |
| **F-01b** | 🔴 Nenhuma etapa do funil marca o cliente pagante. O gatilho de faturamento não é evento do CRM — decisão de F2 |
| Repositórios de UC, usina, originador e rateio | ✅ **Fechados em 27/07** — 45 verificações novas em 4 suítes |
| `Q-CLAUDE11-01` — a regra 11 perdeu o mecanismo | 🟡 → **a opção (b) foi executada em 30/07; sobram (a) e (c), que são do autor do `CLAUDE.md`.** O furo continua real — com `previewFeatures = ["partialIndexes"]` o índice parcial **voltou** a ser chave de `findUnique` — mas deixou de ser invisível: **`CAT-9`** (banco) exige que todo único parcial tenha predicado `IS NOT NULL`, e **`tests/regra11.ts`** (código) proíbe navegar por chave parcial, tirando a lista do próprio `schema.prisma`. O par `(modelo, chave)` é o critério: `tenant_id_documento` é parcial em `cliente` e **cheia** em `originador`. Provado nos dois sentidos — a violação plantada acusa. **O comentário falso de `src/repos/cliente.ts`**, que repetia a proteção inexistente, foi corrigido |
| `Q-TARIFA-CONC-01` — não havia importador | ✅ **Fechada em 30/07.** `src/dominio/planilha-tarifas.ts` (puro) + `fatura.lancarTarifasPorUC` + `npm run tarifas`. O casamento é por **`numero_uc`**, porque a rota unitária pede o id da fatura e ninguém tem isso na mão. **36 verificações.** O ensaio imprime a **interpretação** de cada valor ao lado do texto original — é o único jeito de pegar `"1.234"` lido como R$ 1,23 antes de a fatura sair |
| `Q-AGENDA-01` — nenhum processo periódico existia | ✅ **Fechada em 30/07.** Os dois do `PRD` §6: fila de emissão com retry exponencial e consulta ativa diária, mais o alerta do A1. **55 verificações** (24 puras + 31 com banco). Migration 21 traz os carimbos e `agenda_execucao` — porque o modo de falha de um processo periódico é a **ausência** de execução, que não produz erro nem log. **Não inventa agendador:** o `PRD` §3 deixou a escolha do host em aberto, então o script roda uma vez e sai |
| Endpoints com a matriz de papéis | ✅ **Fechados em 27/07** — 37 rotas, 21 verificações. A matriz é aplicada no **repositório**, por `exigir()`, não no handler |
| `Q-RBAC-01` — matriz implementada ≠ PRD §3 | ✅ **Fechada em 27/07** — `escrever_cadastro` alinhada ao PRD: só `admin`. A matriz agora é fixada célula a célula, e o teste foi verificado nos dois sentidos |
| **Autenticação (`MT-06`)** | ✅ **Fechada em 27/07 — auth próprio, e agora medida contra o Supabase real.** `SUPABASE_URL` preenchida. Token emitido pelo projeto e verificado pelo caminho de produção: `iss` confere, projeto em **JWT signing keys ES256** (não HS256 legado — `SUPABASE_JWT_SECRET` fica ausente de propósito), JWKS responde no caminho que o código monta. `npm run auth:verificar` reproduz |
| `Q-AUDIT-01` — trilha da concessão de tier sem `registro_id` | ✅ **Fechada em 27/07** — migration 13. `usuario_id` entra no `coalesce` de `app.auditar()` **por último**, então as outras 15 tabelas não mudam. G6 e G7 verificados nos dois sentidos |
| `Q-DISTRIB-01` — RLS sem policy em `distribuidora` | ✅ **Fechada em 27/07** — migration 13. O `rls_auto_enable` do Supabase havia habilitado RLS na tabela, sem policy: a role de runtime lia **0** linhas. Agora lê 1. `CAT-8` acusa a classe inteira |
| `MT-09` — `rls_auto_enable` do Supabase | 🟡 **Reclassificado em 27/07: já aconteceu.** A cobertura pelo `CAT-3` que esta linha alegava **não existia** — ele filtra por `tenant_id`. Coberto agora pelo `CAT-8`, que é detecção e não prevenção. Resta decidir se o event trigger é tratado no provisionamento |
| ~~`Q-SPEC001-08` — `SPEC-001` diz nove e dez~~ | ✅ **Fechada em 30/07**, e esta linha ficou vencida por quatro dias — `QUESTOES.md` a marca RESOLVIDA e a `SPEC-001` §3.4 traz a nota desde então. É o mesmo modo de falha que o `PATCH-citacoes` tratou e que a `Q-ESCOPO-01` repetiu: **o corpo datado está certo, o índice está errado, e quem lê só o índice decide errado.** Terceira vez |
| Bug do `GRANT` no Supabase | 🟡 Reportar. Derruba todas as sessões da instância |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna |
| **Banco no Supabase `sa-east-1`** | ✅ **Fechado em 27/07** — 13 migrations. Os 8 invariantes de catálogo passam **contra produção**, não só contra o banco de teste |
| **`prisma generate` e os dois primeiros repos** | ✅ **Fechado em 27/07** — cardinalidade LISTA confirmada nos tipos |
| Verificação de tipo | ✅ Fechada — `tsconfig.json`, `npm run typecheck`, job no CI |
| `$transaction` do Prisma | ✅ Fechado em 25/07 — `ADR-0003` r2, `spike-transacao/` |
| Contagem de FKs | ✅ Fechada — **dez**, lista nominal em `SPEC-001` §3.4 |
| `ADR-0004` | ✅ Escrito em 25/07 |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
