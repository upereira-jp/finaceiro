# RESUMO-SESSAO-10 — 28/07/2026

| Campo | Valor |
|---|---|
| **Foco** | A `PAUTA-contador.md` voltou respondida. **A F2 e a F3 foram construídas com as respostas na mão** |
| **Método** | Nada afirmado sem medição; lacuna vira questão, nunca default (regra 10); invariante nos dois sentidos. **Uma afirmação minha foi corrigida por medição, e um defeito meu foi pego por teste** |
| **Resultado** | `SPEC-003-carteira.md`, migrations 16 a 18, dois motores puros, seis repositórios, a porta de cobrança e 28 rotas |
| **Testes** | **431 verificações em 21 suítes**, `EXIT=0`. Eram 318. Catálogo 8/8 |

> # ESTADO ATUAL — 28/07/2026
>
> | | |
> |---|---|
> | **F1** | três critérios formais cumpridos. Os quatro cadastros que faltavam entraram hoje: `dono_usina`, `tarifa`, `regra_comissao`, `regra_repasse` |
> | **F2 e F3** | **construídas.** Compor → emitir → boleto → o banco pagar → baixar → repartir, ponta a ponta, contra banco real e pela role sem `BYPASSRLS` |
> | **O que segura a F2** | **um certificado A1**, não código. O critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura automaticamente"*, e o ciclo está provado contra o **adaptador falso** — `Q-SICOOB-01` |
> | **Invariante do centavo** | constraint deferida no banco + 2.000 combinações no motor. 22 delas deram líquido G3 **negativo**, que é o que o `PRD` §5.6 prevê |
> | **Contra produção** | as **18 migrations aplicadas**, catálogo **8/8**, e o ensaio de faturamento rodado. **Zero faturas a criar em qualquer competência, e o motivo não é código** — ver §11 |
>
> **A fila, e ela mudou de forma:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | `Q-SICOOB-01` — certificado A1 e credencial de sandbox | 🔴 | Vinicius |
> | `Q-FATCHEIA-01` — o `PRD` usa "fatura cheia" 4 vezes e não define o termo | 🔴 | Vinicius |
> | `Q-022` — como o contrato chega ao originador, com `partner_id` em 3% | 🔴 | Vinicius |
> | `Q-TARIFA-CONC-01` — quem lança a conta da distribuidora, e em que formato | 🟡 | operação |
> | `Q-ESTORNO-01` — como se reverte uma liquidação | 🟡 | Vinicius + contador |
> | `Q-COMIS-TERC-01` — a quebra do `terceirizado` entre 1ª e 2ª parcela | 🟡 | Vinicius |
> | `Q-PAUTA-6A-01` — natureza da receita, a única da pauta sem resposta | 🟡 | contador |
> | `RATEIO-USO-01` | 🟡 | rebaixada — ver §2 |
> | `UC-DUP-01`, `Q-UC-DISTRIB-01`, `Q-CICLO-ORFAO-01` | 🟡 | herdadas, intactas |

---

## 1. A pauta voltou, e três das dez não estavam respondidas

O arquivo veio com sete respostas limpas e três buracos, e os três eram do tipo que não se resolve lendo com boa vontade:

| # | O que veio | Por que não dava para seguir |
|---|---|---|
| **1** | **A e B marcadas** — competência *e* caixa | A própria pauta dizia que B *"muda o modelo de eventos inteiro do faturamento"*. As duas juntas não são uma resposta |
| **3b** | em branco, com *"o que seria exatamente?"* escrito ao lado | A pergunta foi **questionada**, não respondida. Seguir seria responder por quem perguntou |
| **4b** | em branco | Retenção sobre o repasse — o maior fluxo de dinheiro do sistema, 70% do consumo |

Foram fechadas por decisão do dono antes de a primeira migration existir. **A 6a continuou sem resposta** (*"não compreendido"*) e virou `Q-PAUTA-6A-01`: com Simples, sem crédito de IBS/CBS e sem nota, o efeito dela sobre o schema é nulo hoje, e por isso não bloqueou.

**O que as respostas mudaram no que foi construído** — e este é o ponto de ter perguntado antes:

- **Sem retenção em nada** (2, 3a, 4b) → `split_item` guarda **um** valor por item, e a invariante *"a soma dos itens é o valor liquidado, ao centavo"* sobrevive intacta. Com retenção seriam três colunas a mais e a invariante viraria *"bruto = liquidado"* + *"líquido + retenções = bruto"*
- **Sem nota fiscal** (5) → **zero** integração com prefeitura ou SEFAZ. A pauta chamava isso de *"a maior variável de escopo da fase — semanas de diferença"*
- **Sem crédito de IBS/CBS + Simples** (6b, 6c) → a `fatura` não tem coluna de tributo recuperável e nenhuma tabela de alíquota por regime é versionada
- **Paga direto** (3b) → `split_item` **não tem máquina de estados**

Se qualquer uma dessas virar o contrário, é migration de schema em tabela com dinheiro já gravado. É exatamente o custo que a pauta existia para evitar.

## 2. A resposta 9a fechou uma vermelha da F0 — e desarmou outra sozinha

**9a = B: a base de faturamento é a geração efetivamente medida.** Fecha a `Q-021`, que estava aberta desde a F0 e que o `PRD` §5.1 marcava com ⛔ — *"nenhuma spec de faturamento avança sem essa decisão"*. Era ela que impedia a F2 de começar.

O efeito colateral não estava na pergunta e é o mais interessante da sessão. A `RATEIO-USO-01` dizia que a usina tem duas medidas e o sistema só controla uma — quanto **será** usada (Σ percentuais, com trava) e quanto **já foi** usada (crédito consumido, sem controle nenhum). Com a base sendo a geração medida:

```
Σ kWh faturados da usina na competência  =  geração × Σ percentuais / 100
```

e a R11 já garante `Σ percentuais ≤ 100`. **O faturado não passa da geração por construção, não por vigilância.** O overbooking de crédito — que era o medo declarado — some com a escolha de 9a, sem invariante nova. A view `uso_da_usina_por_competencia` existe para tornar isso *olhável*: se `saldo_kwh` ficar negativo um dia, a composição foi contornada por outro caminho.

A questão **não fechou**, e a parte que sobra é honesta: falta decidir o que fazer quando a geração **não foi lançada**. Hoje é recusa contada, o que é seguro e para o faturamento daquela UC — e o dev já confirmou que o CRM não distingue "não lançada" de "zero".

**O caso concreto da pauta se resolve por recusa e não por silêncio:** a usina `0003`, com 100% alocado e zero geração, não gera fatura nenhuma. `geracao_kwh_competencia` é `NOT NULL`.

## 3. O quarto tipo de item, e por que sem ele a invariante "inegociável" era falsa

O `PRD` §4.3 lista três tipos de `split_item`: `repasse_usina`, `comissao`, `liquido_g3`. Com três, a conta é:

```
liquidado  = consumo + tarifas_da_concessionária + juros + multa
itens      = repasse + comissão + líquido_G3
líquido_G3 = liquidado − repasse − comissões − tarifas      (PRD §5.5)
⇒ soma dos itens = liquidado − tarifas   ≠   liquidado
```

Falta exatamente a parcela da distribuidora. O `PRD` já a trata como saída no §5.5 passo 3 — *"`conta_pagar` do repasse à Equatorial"* — só não a listou entre os tipos. **Sem o quarto tipo, a invariante que o PRD chama de INEGOCIÁVEL é falsa toda vez que houver conta da distribuidora na fatura, que é sempre.**

Com `repasse_concessionaria` na lista, a soma fecha e a invariante passa a ser verificável. É acréscimo ao `PRD`, e está registrado como tal.

## 4. Onde se arredonda: as duas respostas eram a mesma

A pauta 8a escolheu *"no total, distribuindo o resíduo entre as parcelas"*. O `PRD` §5.5 diz *"diferenças de arredondamento vão sempre para o líquido G3"*. Parecem duas regras e são uma, desde que o líquido G3 seja **apurado por subtração** em vez de calculado:

| item | como sai |
|---|---|
| `repasse_usina` | `round(% × base_repasse)` — arredonda |
| `comissao` | `round(% × consumo)` — arredonda |
| `repasse_concessionaria` | o valor da fatura — exato |
| `liquido_g3` | **`liquidado − os três acima`** — não arredonda, é a diferença |

A soma dos quatro é o liquidado ao centavo **por construção aritmética**. Não há um quinto lugar onde o centavo possa se perder, e não há caso em que a invariante dependa da ordem de cálculo.

**Verificado em 2.000 combinações** de consumo, tarifa, juro e percentual, com gerador determinista. Todas fecham. **22 delas produziram líquido G3 negativo** — e o teste só vale porque esse caso apareceu: o `PRD` §5.6 prevê líquido zero nas duas primeiras faturas com captador sênior, e um centavo de resíduo cruza o zero. O `CHECK` abre exceção de sinal **só para esse tipo**.

## 5. Uma afirmação minha, corrigida por medição

Escrevi em `src/dominio/centavos.ts` que o caminho ingênuo em `number` erra, e pus um exemplo. **O exemplo estava errado** — `78900 × 70 / 100` dá exatamente `55230` em float. Em vez de trocar por outro número escolhido a dedo, varri a faixa:

| percentual | divergência entre float e exato, base de 1 centavo a R$ 50.000,00 |
|---|---|
| 70, 65, 60, 50, 30, 25, 20, 33,33 — **as taxas de hoje** | **zero** |
| 0,29% · 0,35% · 0,57% — e `numeric(5,2)` aceita | **erra 1 centavo**, sempre para baixo |

Ou seja: **o float está certo hoje, e está certo por sorte.** Uma implementação em `number` passaria em qualquer teste escrito com as taxas atuais, e passaria a errar no dia em que alguém declarasse uma taxa abaixo de 1% — sem erro, sem log, e sempre contra quem recebe, porque a invariante do centavo continuaria fechando com o líquido G3 absorvendo a diferença.

A regra 1 já bastava — float é proibido, e o *"inclusive em cálculo intermediário"* é sobre exatamente essa linha. Mas o comentário agora diz o que foi medido em vez do que eu supus, e o teste `C1a`/`C1b` fixa as duas metades: que a divergência existe, e que ela **não** está onde eu tinha dito.

## 6. O defeito que o teste `K17` pegou, e ele é da mesma família dos anteriores

`boleto.registrar()` gravava a falha na linha do boleto — `status = 'erro'`, `tentativas + 1`, `ultimo_erro` — e **relançava** o erro, para que a rota não devolvesse 200 para uma emissão que não aconteceu. O comentário dizia, com todas as letras, *"a falha não reverte a linha"*.

**Reverte.** A unidade de trabalho é **uma transação** (`SPEC-001` §3.2), então o `throw` desfaz a própria gravação. O resultado era o pior dos dois mundos: a rota devolvia erro **e** a fila de retentativa do `PRD` §6 ficava sem memória — `tentativas` voltava a zero, `ultimo_erro` sumia, e a fatura ficava indistinguível de uma que ninguém tentou emitir.

Gravar em transação separada não é caminho: transação dentro de transação toma conexão nova, não herda o contexto de tenant, e a escrita cairia na policy — é a invariante 10, e o `ContextoAninhado` existe para não deixar nem tentar.

O conserto foi mudar o **contrato**: `registrar()` devolve `{ registrado: false, boleto, erro }` em vez de lançar, o fato *"tentamos e falhou"* commita junto com o resto, e **quem traduz em `502` é a rota**. Erro de programação (`TypeError`, `RangeError`) e ausência de credencial continuam subindo — falha de transporte é para retentar, credencial faltando não é, e enchê-la na fila esconderia o único conserto possível.

*É o terceiro achado desta natureza em três sessões — o `test_vitima_de_merge` na 8, o `fechar()` do caminho de erro na 9, e este. O padrão continua o mesmo: o caminho feliz é testado, o caminho de exceção perde informação, e nada quebra.*

## 7. O que entrou no banco

| Migration | O que traz |
|---|---|
| **16** `carteira` | `fatura`, `boleto`, `liquidacao`; a conferência do valor cheio; as views `posicao_da_carteira` e `uso_da_usina_por_competencia` |
| **17** `split` | `split_execucao`, `split_item`, a constraint deferida do centavo, o gatilho do contador, e a **`parcela`** em `regra_comissao` |
| **18** `conector_cobranca` | a **referência** ao segredo da Sicoob, por tenant (regra 5) |

**A `parcela` merece nota.** O `PRD` §5.4 escalona a comissão pela 1ª e pela 2ª fatura cheia paga; `regra_comissao` guardava só o **total**, e aplicá-lo em toda fatura pagaria a comissão inteira todo mês, para sempre. Não virou tabela nova (dois lugares diriam quanto se paga) nem lógica em código (a taxa deixaria de ser versionada por vigência). **O backfill assere:** se algum tenant tiver renegociado o total, a quebra do `PRD` não soma e a migration **recusa** em vez de reprecificar em silêncio.

Duas coisas foram aplicadas pelo banco e não por revisão, e as duas são a regra 5:

- `boleto_payload_sem_segredo` — o payload de ida ou volta com `access_token`, `client_secret` ou `private_key` é recusado. O caminho real de vazamento é gravar a resposta do OAuth junto com a do boleto
- o `CHECK` de forma em `credencial_ref` — chave PEM colada no lugar da referência é recusada

## 8. Testes

| | |
|---|--:|
| Verificações antes (`npm test` no `HEAD`) | **318** |
| Verificações depois | **431** |
| Novas | **113** — 45 em `dominio-carteira.ts`, 26 em `carteira.sql`, 31 em `repos-carteira.ts`, 11 nas suítes existentes que a `parcela` tocou |
| Suítes | **21** · `EXIT=0` · catálogo 8/8 |

O critério de contagem continua sendo `npm test 2>&1 | grep -cE '^ok'`.

**As três suítes novas cobrem camadas diferentes de propósito.** A de domínio roda **sem banco**, e é o que permite varrer 2.000 combinações em vez de escolher três que parecem difíceis. A `.sql` cobre o que vale para quem escrever por `psql`, por script de correção ou por um repositório novo que ninguém reviu. A de repositório roda o ciclo do dinheiro inteiro, pela role **sem `BYPASSRLS`** — a única configuração em que as policies são de fato avaliadas.

## 9. O que NÃO foi feito, e por quê

| Item | Por quê |
|---|---|
| **Adaptador HTTP real da Sicoob** | Não há certificado A1 nem credencial de sandbox. Escrever o cliente contra endpoints que não posso exercitar produziria código que parece pronto e nunca foi executado. A porta está pronta e o adaptador padrão **recusa com 503 nomeado** |
| **`inadimplencia` como tabela** | A visão derivada sai por consulta de `fatura`; o registro de tratativa entra com a tela que o usa. Criar agora seria schema sem escritor |
| **Ponte contábil do `PRD` §5.5 passos 1 a 4** | `conta_pagar`, `movimento_caixa`, DRE — é a F4. O split produz os itens; quem os transforma em lançamento é a fase seguinte |
| **Nota de crédito (resposta 9b)** | Com 9a = B a situação que a 9b resolve — faturar pelo alocado e a geração vir menor — **não tem gatilho normal**. Implementar um caminho sem entrada é código que ninguém exercita |
| **Rodar contra produção** | Nenhuma migration nova foi aplicada em `sa-east-1` e nenhuma fatura foi composta lá. Compor lote é ato que emite cobrança; é decisão do dono, e o `--ensaio` existe para ser o primeiro passo |

## 10. Nota de método

As três coisas boas desta sessão têm a mesma origem, e ela não é diligência: é **ordem**.

A pauta foi respondida **antes** de a primeira migration existir, e por isso quatro respostas viraram colunas em vez de virarem migração de schema em tabela com dinheiro gravado. As três lacunas foram fechadas **antes** também — e a que não foi fechada virou questão com dono nomeado, em vez de virar um default escolhido "porque parecia razoável".

E as duas correções — o exemplo errado no comentário e o `throw` que desfazia a própria gravação — apareceram porque **escrever o teste veio antes de acreditar no código**. Nenhuma das duas quebraria nada hoje: a primeira só erraria com uma taxa abaixo de 1%, a segunda só apareceria quando alguém fosse consultar a fila de retentativa e a encontrasse vazia. As duas são exatamente o modo de falha que este projeto persegue desde a regra 3 — **o silêncio que só aparece no relatório.**

## 11. O ensaio contra produção, e o que ele achou

As migrations 16 a 18 foram aplicadas em `sa-east-1` por autorização do dono. Puramente aditivas: `regra_comissao` estava **vazia** lá, então o backfill da 17 — a única parte que tocaria dado existente — não reescreveu linha nenhuma. Os 8 invariantes de catálogo passam contra produção **com as tabelas novas**.

O ciclo do CRM em ensaio, antes: `lidos 96, criados 1, recusados 1`. A recusa continua sendo a `UC-DUP-01`, único ruído em 96 linhas.

**O ensaio de faturamento devolveu zero em todas as competências com geração lançada** — 2026-06 e 2026-07, e o mesmo valeria para as outras seis:

```
faturas a criar . 0
recusadas ....... 35
   35  sem_contrato_vigente
```

**Isso não é defeito, e a triagem está fazendo exatamente o que foi desenhada para fazer.** Medido no banco em seguida:

| | |
|---|--:|
| unidades consumidoras espelhadas | **35** |
| com rateio (usina + percentual) | **35** |
| **contratos** | **0** |
| UCs com `data_vencimento` | **0** |
| tarifas cadastradas | **0** |
| donos de usina | **0** |
| regras de repasse | **0** |

**São quatro camadas ausentes, e nenhuma delas é código.** O `contrato` é entidade **local** — a `SPEC-002` §2 espelha `cliente`, `usina`, `usina_geracao` e `unidade_consumidora`, e contrato não está na lista, por desenho: ele carrega o tier congelado do originador (R20-b) e o contador de faturas cheias, que são decisões do financeiro e não do CRM.

Se os contratos existissem, as 35 cairiam na camada seguinte: `data_vencimento` está **100% vazia**, que é a `Q-SPEC001-02`, e a triagem recusaria por `sem_vencimento` em vez de escolher um dia. Se o vencimento existisse, a composição levantaria por falta de tarifa (R26). E se a fatura nascesse e fosse paga, o split pararia na R12 — zero donos de usina, que é a `AUD-08`.

**A ordem em que as camadas aparecem é a da §4 da `SPEC-003` (R32), e ela é a ordem de utilidade do diagnóstico:** devolver `sem_geracao_lancada` mandaria a operação lançar geração para descobrir depois que faltava o contrato. O ensaio devolve o problema de verdade, que é o primeiro.

**O que isso muda na leitura da fase:** a F2 não está esperando código. Está esperando **quatro cadastros operacionais** — contratos, dia de vencimento, tarifa e dono de usina — e um **certificado A1**. O ensaio é barato e repetível: `npm run faturar -- --ensaio --competencia AAAA-MM --auth-user <uuid>` roda a triagem contra o dado real sem escrever nada, e é o instrumento para acompanhar essas quatro camadas fechando.

## 12. O instrumento que o ensaio pediu, e o defeito que ele tinha

O ensaio devolveu `35 sem_contrato_vigente` e **isso é tudo o que ele podia dizer**. A R32 manda a triagem parar no primeiro motivo que impede de existir, e está certa — devolver `sem_geracao_lancada` mandaria a operação lançar geração para descobrir depois que faltava o contrato. Mas atrás dos 35 contratos ausentes havia mais camadas vazias, e elas só apareceriam **uma a uma, um ensaio por vez**, cada uma depois de dias de trabalho da operação.

Daí `src/repos/prontidao.ts`, e ele responde outra pergunta:

| | |
|---|---|
| `ensaiarLote()` | *"esta UC entra?"* — por UC, primeiro motivo |
| `prontidao()` | *"o que falta ao todo?"* — por **camada**, todas de uma vez |

Nove camadas, cada uma com contagem, universo, efeito (`bloqueia_fatura` ou `bloqueia_split`), **dono nomeado** e a questão que a destrava. Ele conta e não decide nada: vencimento, tarifa e dono da usina têm dono de decisão, e nenhum deles é o programador.

**Rodado contra produção, ele mostrou um defeito nele mesmo.** Três camadas — geração da competência, tarifa vigente e regra de comissão — têm por universo as UCs **contratadas**. Com zero contratos, o universo é vazio, e `0 de 0` saía marcado como **`ok`**:

```
  ?      geracao_da_competencia     0 de    0     <- era "ok"
  ?      tarifa_vigente             0 de    0     <- era "ok"
  ?      regra_de_comissao          0 de    0     <- era "ok"
```

Não é `ok`: ninguém mediu nada. É exatamente o que o `RESUMO-SESSAO-9` §2 registrou no conector — *"zero divergências significa que ninguém editou o campo, **não** que a herança está certa"* — e é pior aqui, porque **um relatório de prontidão que mostra verde sobre universo vazio autoriza**. Virou terceiro estado, `nao_medido`, e `pode_faturar` passou a exigir `ok` em vez de "sem pendência". Testes `K18a`–`K18e`, nos dois sentidos: tenant sem contrato devolve `nao_medido`, tenant com contrato e geração devolve `ok` sobre universo real.

**A leitura de produção, com o instrumento certo:**

| camada | estado | dono |
|---|---|---|
| `contrato_ativo` | **35 de 35 faltam** | Vinicius + operação · `Q-022` |
| `rateio` | ok, 0 de 35 | — |
| `vencimento` | **35 de 35 faltam** | operação · `Q-SPEC001-02` |
| `dono_da_usina` | 3 de 3 — trava o **split**, não a fatura | operação · `AUD-08` |
| `regra_de_repasse` | 3 de 3 — trava o split | Vinicius |
| `cobranca_sicoob` | 1 de 1 | Vinicius · `Q-SICOOB-01` |
| geração · tarifa · comissão | **não medido** — o universo depende de contrato | — |

**Nada disso é código.** E o caminho é sequencial: fechar `contrato_ativo` faz as três não-medidas passarem a ser mensuráveis, e só então se sabe o tamanho real do que resta.

## 13. O CI estava vermelho, e não era desta sessão

O PR #2 abriu com dois jobs falhando — `middleware` e `repositorios`. **O PR #1 falha nos mesmos dois**, então não foi a carteira que quebrou: já estava assim.

Duas causas, e as duas são de configuração:

**1. `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL`.** `src/generated/` está no `.gitignore`, então `tests/repos.sh`, `middleware.sh` e `sessao.sh` chamam `prisma generate` quando o client não existe — e o `prisma.config.ts` resolve `env('DIRECT_URL')` no carregamento e **aborta** se a variável não existir, mesmo que o `generate` não conecte. O job `tipos` já sabia disso e já passava a variável com valor descartável, com o comentário explicando; os outros dois nunca receberam. Os três jobs agora passam.

**2. `tests/repos.sh: line 41: financeiro: command not found`.** O heredoc da fixture é **não citado** de propósito — ele precisa expandir `$A`, `$CLI` e os demais UUIDs. O preço é que o bash também expande crase ali dentro, e um comentário SQL dizia *"Schema \`financeiro\` FALSO"*: a crase virou execução de comando. Trocado por aspas, com a armadilha registrada acima do bloco.

**Reproduzido antes de dar como resolvido:** apagando `src/generated/` e rodando com a variável descartável, o mesmo caminho do CI passa inteiro.

*Vale como nota de método: os dois jobs estavam vermelhos e o trabalho seguiu por duas sessões sem que isso aparecesse, porque a suíte local passa — o `src/generated/` já existe aqui e o `.env` também. **Verde local não é verde no CI**, e a diferença entre os dois é exatamente o que o CI existe para pegar.*

**E consertar isso destravou uma terceira falha, que estava escondida atrás das duas.** Com os jobs voltando a rodar, o `repositorios` foi mais longe e morreu em `tests/http.ts` com `TypeError: fetch failed / read ECONNRESET` — no **H20**, logo depois do H18, que é o teste do corpo grande demais.

Não é flake. `lerCorpo` lança **no meio do stream**, assim que o acumulado passa do teto — o que é o certo, porque acumular para depois recusar seria aceitar o ataque que o teto existe para impedir. A consequência é que o corpo **não é drenado**: o Node responde e destrói o socket, porque não pode reusar conexão com bytes pendurados, e o cliente com *keep-alive* só descobre isso **na requisição seguinte**. O teste do 413 passava verde e o teste de outra rota é que morria.

`Connection: close` no 413 transforma o encerramento em contrato. Não há como drenar um corpo de tamanho arbitrário com segurança, então fechar é a resposta certa — a diferença é que agora ela é declarada em vez de ser efeito colateral do socket morrendo.

**Limite honesto do `H18b`, e ele fica escrito no próprio teste:** o plantio **não reproduz** na máquina de desenvolvimento. Removido o `Connection: close`, o H18b continua passando aqui — o socket morre e o undici reabre rápido o bastante. Não é, portanto, verificação nos dois sentidos como as demais deste projeto. **Quem acusa é o CI**, onde a corrida acontece de fato.

## 14. O entrypoint que não existia, e as telas

**`iniciarServidor()` existia, era coberto por 22 verificações, e ninguém o chamava.** As 78 rotas nunca tinham rodado como processo — só dentro da suíte, que sobe o servidor com autenticador falso na porta 0. É o mesmo buraco que o cabeçalho do `ciclo-crm.ts` registrou em 27/07 sobre o conector: *"peça testada que ninguém consegue executar não é sistema"*. Terceira vez que o padrão aparece.

`scripts/servir.ts` decide três coisas e só: **quem** autentica (o JWT do Supabase do financeiro, MT-06), **onde** estão os estáticos (`web/dist`, se existir — sem o build sobe como API pura, em vez de obrigar a buildar o front para mexer no back) e **como morre** (SIGTERM fecha o servidor e devolve o pool; sem isso cada deploy deixa transação aberta segurando linha até o timeout).

**A API passou a morar sob `/api`.** Não é arrumação: com origens diferentes aparece CORS, e CORS onde a credencial é um Bearer significa decidir `Access-Control-Allow-Origin` e `credentials` — superfície nova, num caminho onde errar vaza sessão. Mesma origem não tem o que permitir, e é um artefato só para versionar, hospedar e apontar o subdomínio.

**A SPA** é React + Vite em `web/`, oito telas **na ordem das camadas da prontidão** — porque quem abre o sistema hoje precisa fechar quatro camadas de cadastro para a primeira fatura existir, e a barra de navegação é a ordem em que o trabalho destrava o próximo passo. A regra 1 vale nela também: `web/src/dinheiro.ts` converte reais para centavos **por texto**, sem multiplicar por 100 — `Number('8,15'.replace(',','.')) * 100` dá `814.9999999999999`, e o arredondamento salva *quase* sempre.

**E o servidor de estáticos é controle de segurança, então ganhou teste.** Chegar ao caso que *discrimina* custou duas tentativas, e as duas ficam registradas no próprio teste porque enganam: `/..%2f..%2f` não discrimina (a string ainda tem `..` literal, o filtro ingênuo também barra), e `%2e%2e%2f%2e%2e%2f` não discrimina (dois níveis resolvem para `/`, e o 404 vem de arquivo inexistente, não de contenção). O que discrimina é **um** nível com ponto e barra codificados: não há `..` nenhum no texto, o `new URL` não decodifica isso no pathname, o arquivo existe — e só a resolução de caminho absoluto pega. **Com o filtro por texto plantado, o `H24` falha e o segredo sai na resposta.**

**443 verificações**, `EXIT=0`.
