# RELATÓRIO DE HORAS — 10/08/2026

| Campo | Valor |
|---|---|
| **O que é** | as horas gastas em trabalho, e o que saiu de cada uma |
| **Base** | 38 transcripts em `~/.claude/projects/-workspaces-finaceiro/` e `git log --numstat` |
| **Período** | 24/07/2026 a 10/08/2026 — 18 dias corridos, **12 com atividade** |
| **Total registrado** | **~54 h** · faixa 47–60 h conforme o corte de ociosidade |
| **Total com planejamento** | **~110 h** · as **~55 h** de planejar e aprender **fora** do transcript estão em §6 `[estimado]` |
| **Escopo** | só o passado. Este arquivo **não estima** o que falta |

> **A distinção que governa este arquivo.** `[medido]` sai de registro — transcript, `git`, suíte. `[estimado]` é derivado por método declarado, e o método está escrito ao lado da conta. Nenhum número abaixo é lembrança.

---

## 1. O método

As sessões de Claude Code ficam gravadas em `~/.claude/projects/-workspaces-finaceiro/` — **38 arquivos `.jsonl`**, cada evento com carimbo de tempo. O tempo **ativo** é a soma dos intervalos entre eventos consecutivos da união de todos os transcripts, **descartando qualquer intervalo maior que 15 minutos**. Pausa longa não conta como trabalho, e sessões simultâneas não contam duas vezes.

| | | | |
|---|--:|---|--:|
| **ativas, com transcript** (27/07–10/08) | **44,3 h** | sessões de Claude Code | 32 |
| **reconstruídas, sem transcript** (24–26/07) | **~10 h** | dias com atividade | 12 |
| **TOTAL** | **~54 h** | dias corridos | 18 |

**O que estas horas NÃO incluem:** todo o tempo do dono fora do Claude Code — navegar o portal da Equatorial, preencher a folha do Sicoob, trocar e-mail com o dev do CRM, decidir. Não há registro disso em lugar nenhum, e ele é real. Também não inclui as **sessões 1 e 2**: o `PRD-v2.2`, o `GLOSSARIO` e as auditorias P7/P8 foram escritos **fora deste repositório** e entraram em 24/07 por upload — o volume delas está contado, o relógio não.

---

## 2. Hora a hora — o que saiu de cada dia

`Linhas` é o que entrou no repositório naquele dia, código e documentação juntos.

### 24/07 · 4,7 h `[estimado]` · 18 commits · 5.408 linhas

O dia em que o repositório virou repositório. `CLAUDE.md` **v1.0** — as onze regras inegociáveis, substituindo um arquivo que era citado em 10 dos 12 documentos e **nunca existiu**; a numeração antiga (6, 7, 10) foi descartada por não ter origem verificável e as dezoito citações foram reapontadas pelo `PATCH-citacoes-2026-07-24`. `QUESTOES.md` **v1.0**, consolidado por varredura do corpus. `P8-REVERIFICACAO` — a auditoria do CRM refeita, sem deriva. E a limpeza da raiz: o que era ZIP e upload solto virou árvore com `adr/`, `auditoria/` e `spike-adr0003/`.

### 25/07 · 0,7 h `[estimado]` · 13 commits · 1.421 linhas

O dia mais curto e um dos mais densos. `ADR-0003` **r2** fecha a lacuna do `$transaction` sobre RLS e passa a **Aceita**, com o `spike-transacao` — **12 testes reproduzíveis** — atrás dele. `SPEC-001` **v2.2**: contrato do middleware, FK composta nominal, comissão e tarifa. `CLAUDE.md` **v1.1**, em que a regra 2 ganha o **mecanismo** que faltava: FK composta `(tenant_id, id)` e `UNIQUE (tenant_id, id)` nas referenciadas — antes a regra afirmava que nenhuma FK atravessa tenant sem dizer o que a impedia, e o spike mediu o banco **aceitando** a violação. `ADR-0004` (provisionamento) e o `README` como documento de entrada.

### 26/07 · 5,0 h `[estimado]` · 16 commits · 6.969 linhas

O banco nasce. **Primeira migration**, suíte de isolamento e CI. Middleware de contexto de tenant por unidade de trabalho. RBAC dois níveis, trilha, seed, `ADR-0001` e `SPEC-002`. Camada de sessão. Migration 10 — auditoria e repasse versionado. Prisma 7 com schema introspectado (**17 modelos**). E **quatro furos achados e fechados no mesmo dia**: o invariante 13 (view sem `security_invoker` **anula a RLS inteira** — medido, 2 linhas de todos os tenants por uma view); a policy que exigia tenant e não vínculo, e por isso **qualquer usuário lia outra empresa**; a R20, que pagava a taxa de hoje em contrato de ontem; e o CNPJ alfanumérico, que quebraria a R7 em 31/07.

### 27/07 · 8,05 h `[medido]` · 13 commits · 8.233 linhas

**O dia mais longo, e são quatro sessões.** Repositórios tipados e o catálogo `CAT-1..7`. O **crash do GRANT**: `GRANT` para `CURRENT_USER` derrubava o Postgres do Supabase e chegava ao Prisma disfarçado de `P1017`. Role de runtime, composition root, **37 rotas** e auth próprio. O **conector do CRM** rodou contra o CRM real, duas vezes valendo — 41 clientes espelhados, 2ª passada `criados: 0, atualizados: 0`. `scripts/ciclo-crm.ts` e `scripts/provisionar-tenant.sql`, os dois passos que faltavam para a cadeia ser executável. `FECHAR-F1.md` como roteiro. `Q-VIEWS-01` fechada pelo dev no mesmo dia, `Q-VALOR-01` decidida e implementada, `Q-LOTE-01` aberta pelo primeiro ciclo real e fechada com a R13 em lotes.

### 28/07 · 8,52 h `[medido]` · 27 commits · 12.776 linhas

**O dia de maior volume, e o dia em que o sistema ganhou tela.** A carteira em três camadas: **três migrations** no banco, dois motores puros com seis repositórios e a porta de cobrança em código, e a **prontidão para faturar** com as nove camadas de uma vez — *"não medido" não é "ok"*. A **SPA em React + Vite**, servida pelo próprio servidor, com o entrypoint que faltava e a API mudando para `/api`. A paleta da G3. O `ADR-0005` do cofre. `unidade_consumidora` espelhada e as 3 usinas cadastradas, com a cascata destravando. A rodada 4 ao dev do CRM. **Ensaio contra produção** — migrations aplicadas, faturamento devolvendo zero — e o **primeiro deploy**. Consertos: o CI, que estava vermelho antes da sessão, e o 413, que deixava o socket morrer sozinho.

### 29/07 · 4,41 h `[medido]` · 7 commits · 1.674 linhas

O dia da revisão de UX: rotas por caminho, busca e ordenação, caixa de sentença. A tela de Contratos deixa de **confundir falha de leitura com ausência de contrato**. Caminho de cadastro dos originadores, com a conferência que o repositório não faz. `Q-ORIGINADOR-01` fechada: produção tinha **zero** originadores e o contrato não tinha caminho de edição, então os 39 que a operação ia digitar nasceriam sem comissão possível, em silêncio — o campo trava e a prontidão passa a acusar. Deploy conferido com **o mesmo hash dos dois lados** e o CRM intacto.

### 30/07 · 6,27 h `[medido]` · 11 commits · 15.786 linhas

**Maior volume do projeto.** O caminho de cobrança inteiro na tela — emitir, boleto, baixa, repasses, comissões —, que até então parava em *"compor rascunho"* e saía por `curl` ou não saía. O documento que o cliente recebe, com QR, logo no payload e teste do repositório de documento. O acabamento visual da SPA, com a regra 8 chegando à camada de apresentação: `web/tests/tema.ts` **recalcula todo par de contraste e falha quando um reprova** — foi o teste que escolheu os valores, não o olho. A agenda, o importador de tarifas e três defeitos que só apareceram com o sistema aberto. A sessão que vence passa a derrubar para o login, em vez de pintar erro em todo painel. E as **duas vertentes medidas**: a do cliente construída, a da empresa em zero — a F4 nunca tinha entrado no registro de questões, e a ausência foi o achado.

### 03/08 · 3,31 h `[medido]` · 9 commits · 9.103 linhas

O dia em que o dev do CRM respondeu e o eixo do originador **não era nenhuma das duas colunas que medíamos** — é o crédito congelado no momento do ganho. Consequência medida: o mapa de 30/07 estava errado em **12 das 41 UCs**, e 19,6% da carteira em kWh trocava de dono. Junto: o conector apagava o vencimento que ninguém tinha preenchido ainda; o split apurava e ninguém quitava, e agora **o banco impede pagar duas vezes**; as duas views existiam desde 01/08 e **nada nosso comparava a lista**. E o **layout da fatura deixou de ser lista e passou a ser posição** — papel, orientação, margens e cada elemento arrastável.

### 04/08 · 3,65 h `[medido]` · 13 commits · 3.167 linhas

O dia de arrumar o que a tela mostrava. As **86 linhas de cliente são quatro coisas, e só uma é defeito**. A tela abre em Ativos, e o resíduo dos inativos era mentira no dado. Só aparece como Ativa o que fatura. A rota `/clientes` passa a devolver a carteira ativa, e não o cadastro. O modelo de vencimentos diz quais **29** faturam e desce as 12 para o fim. A R9 pede o CPF do cliente — **e ninguém estava contando isso**. E o **deploy**: produção de 21 para **24 migrations**, `main` avançando 18 commits por fast-forward, catálogo 9/9 contra produção e dados intactos ponta a ponta. Duas armadilhas registradas no caminho: aplicar a migration sem o deploy deixa produção **viva mas não reiniciável**, e o uuid dos comandos prontos do `RESUMO-8` devolve 403.

### 05/08 · 1,58 h `[medido]` · 4 commits · 4.012 linhas

Importador dos **29 contratos**, tirando a `Q-PARCERIA-01` do caminho. `ADR-0005` fechado, importador de endereço do pagador e o webhook ganha desenho. As pendências viram lista (`PENDENCIAS-2026-08-05`). E o **contrato da Sicoob fica medido** — os três verbos com caminho, corpo, resposta e erro — com o adaptador ficando **NÃO escrito de propósito**: sem sandbox, o primeiro `POST` real corrigiria alguma suposição.

### 06/08 · 5,36 h `[medido]` · 16 commits · 4.056 linhas

**Duas levas publicadas no mesmo dia.** O documento passa a sair **em lote**, e com isso nenhum passo do caminho da primeira fatura é mais código. O pagador sem CPF para no financeiro, e não na Sicoob. A **paleta trocou inteira** — Navy e Creme, com o laranja saindo de identidade para **ação** —, e três das cores entregues não passavam AA onde foram pedidas: cada uma ganhou token derivado na mesma matiz, achado por busca. A fatura que sai menor passa a ser **contada**, e não emitida em silêncio. O Pix ganha banco de chaves e a chave passa a ser conferida contra o tipo. As **quatro decisões do webhook** tomadas, com duas opções saindo da mesa antes. A aba Documento deixa de ser suposição — renderizada em Chromium sobre o bundle **servido por produção**. E o quarto caso da `Q-PECA-NAO-PLUGADA-01`: o comando que a retomada dizia existir **não existia**, e passou a existir.

### 07/08 · 0,83 h · 08/08 · 1,61 h `[medido]` · 5 commits · 1.953 linhas

A frente nova — **leitura automática da fatura da Equatorial**. Construído o que não depende de ninguém: `src/dominio/fatura-concessionaria.ts` puro, `src/concessionaria/{porta,falso}.ts` e **44 verificações**. Regra 5 na forma do tipo: não há usuário, senha nem cookie em tipo nenhum — circula `credencial_ref`, e um tipo que aceitasse o segredo faria a violação **compilar**. Em 08/08 a fatura real foi lida e **corrigiu duas coisas que eu havia escrito**: `competenciaDe` recusaria **todas** as faturas, porque a real escreve `FEV/2026`, e o `sha256` **não é identidade estável** — a âncora é a chave NF3e. O total a pagar nunca vira o valor. A data de nascimento virou pergunta ao dev do CRM (rodada 7), e não quarta planilha presumida. *(O trabalho de 07/08 foi comitado em 08/08.)*

### 09/08 · 0,72 h `[medido]` · 1 commit · 149 linhas

`PROXIMOS-PASSOS-2026-08-09` — as duas frentes restantes ganham um documento só delas, **isolado por frente**: cada seção se lê sozinha, sem depender da outra.

### 10/08 · 0,02 h `[medido]` · este relatório

---

## 3. O total, somado

| Dia | Horas | Commits | Linhas |
|---|--:|--:|--:|
| 24/07 `[est]` | 4,7 | 18 | 5.408 |
| 25/07 `[est]` | 0,7 | 13 | 1.421 |
| 26/07 `[est]` | 5,0 | 16 | 6.969 |
| 27/07 | 8,05 | 13 | 8.233 |
| 28/07 | 8,52 | 27 | 12.776 |
| 29/07 | 4,41 | 7 | 1.674 |
| 30/07 | 6,27 | 11 | 15.786 |
| 03/08 | 3,31 | 9 | 9.103 |
| 04/08 | 3,65 | 13 | 3.167 |
| 05/08 | 1,58 | 4 | 4.012 |
| 06/08 | 5,36 | 16 | 4.056 |
| 07/08 | 0,83 | — | — |
| 08/08 | 1,61 | 5 | 1.953 |
| 09/08 | 0,72 | 1 | 149 |
| 10/08 | 0,02 | — | — |
| **TOTAL** | **54,7** | **153** | **74.707** |

A repartição de 24, 25 e 26/07 é aproximada — só o **total de ~10 h** se sustenta. Os três dias não têm transcript.

Estas 54,7 h são **trabalho registrado**. O tempo de planejar e aprender **fora** do Claude Code — que o §1 nomeia e não conta — está estimado no **§6**, e vale outras **~55 h**.

---

## 4. O que existe no fim das 54 horas

| | | | |
|---|--:|---|--:|
| commits | **153** | verificações na suíte (`EXIT=0`) | **1.662** |
| migrations (produção = repositório) | **25 = 25** | linhas de código versionadas | **~47 mil** |

| Onde | O quê | Linhas | Arquivos |
|---|---|--:|--:|
| `src/` | domínio, repositórios, rotas, conector do CRM | 15.693 | 52 |
| `tests/` | suíte e invariantes de catálogo | 13.793 | 50 |
| `web/src/` | a SPA em React + Vite | 8.083 | 37 |
| `prisma/` | schema e as 25 migrations | 5.885 | 27 |
| `scripts/` | importadores, ciclo, provisionamento | 3.635 | 17 |
| `*.md` | PRD, SPECs, ADRs, questões, 24 passagens de sessão | 15.607 | 67 |

A razão **teste : aplicação é 0,88 : 1** — consequência direta da regra 8 do `CLAUDE.md`, *"invariante sem teste é comentário"*. Boa parte das 54 h está aí, e é ela que faz cada deploy caber numa sessão.

Velocidade média: **~860 linhas de código por hora**, sem contar os 15.607 de documentação.

O sistema está **no ar** em `https://financeiro.blackhaus.io` desde 28/07 — systemd, Node 22 isolado, mesmo VPS do CRM e **sem alterar uma linha da configuração dele**.

---

## 5. Como as ~10 h sem registro foram reconstruídas

Dois métodos independentes, e eles convergem:

| Método | Como | Resultado |
|---|---|--:|
| **Janela de commits** | intervalo entre o primeiro e o último commit de cada bloco de trabalho (lacuna de 4 h separa blocos). É um **piso**: nada do que foi escrito antes do primeiro commit entra | **10,9 h** |
| **Volume produzido** | **13.798** linhas naqueles 3 dias, à taxa de **1.375 linhas/h** medida no período **com** transcript (60.909 linhas ÷ 44,3 h) | **10,0 h** |
| **Adotado** | | **~10 h** |

### Sensibilidade — quanto o corte de ociosidade muda a conta

"Hora trabalhada" depende de quanto silêncio ainda conta como trabalho. Os 44,3 h usam 15 minutos. A faixa inteira, para o número não parecer mais preciso do que é:

| Corte | Ativas | Com as ~10 h |
|---|--:|--:|
| 5 min — só digitação contínua | 37,0 h | 47 h |
| 10 min | 41,8 h | 52 h |
| **15 min — adotado** | **44,3 h** | **54 h** |
| 30 min — inclui ler e pensar | 50,2 h | 60 h |
| 60 min | 58,7 h | 69 h |

---

## 6. O que não está nas 54 h — planejar e aprender `[estimado]`

**Correção de premissa, primeiro.** As 54 h não são "só código": a escrita do `PRD`, dos **6 ADRs**, das **3 SPECs**, do `GLOSSARIO` e das **24 passagens de sessão** — **15.607 linhas** de `*.md` — aconteceu dentro do Claude Code e já está contada. Planejamento **com transcript já foi pago**.

O que falta é o que o §1 nomeia e não conta: **o tempo do dono fora do Claude Code**. Navegar o portal da Equatorial, ler a documentação dos três verbos da Sicoob sem sandbox, escrever e esperar o e-mail do dev do CRM, arrancar CPF e originador de planilha, e **decidir**. Nenhum desses momentos tem carimbo de tempo em lugar nenhum. Este capítulo os estima por método declarado — e nenhum número dele é `[medido]`.

### 6.1 O índice de dificuldade

A premissa é a do pedido: **quanto maior a dificuldade, mais planejamento**. Dificuldade aqui não é opinião — são quatro marcadores, cada um **0, 1 ou 2**, todos conferíveis contra o commit, o ADR ou a questão do dia.

| | Marcador | Vale 2 quando |
|---|---|---|
| **N** | **novidade externa** — sistema de terceiro que precisou ser lido fora do editor | há mais de um no dia, ou um com documentação própria |
| **D** | **decisão irreversível** — ADR aberto ou fechado, questão fechada com dono nomeado | há duas ou mais, ou uma que fixa norma no `CLAUDE.md` |
| **R** | **retrabalho por medição** — algo já escrito foi invalidado por um **número**, não por opinião | a invalidação atingiu **dado de produção** |
| **H** | **interlocução humana** — rodada com o dev do CRM, com o contador, com a operação, portal de terceiro | houve ida **e** volta no mesmo dia |

Índice de 0 a 8, e a razão planejamento ÷ horas ativas que cada faixa recebe:

| Índice | Faixa | Razão | Leitura |
|--:|---|--:|---|
| 0–1 | rotina | **0,15** | executar o que já estava decidido |
| 2–3 | média | **0,30** | uma coisa nova por dia |
| 4–5 | alta | **0,55** | decidir e aprender competem com escrever |
| 6–8 | muito alta | **0,85** | o teclado é a menor parte do dia |

### 6.2 Método A — multiplicador por dificuldade

| Dia | h ativas | N | D | R | H | Índice | Faixa | × | **Planejamento** |
|---|--:|--:|--:|--:|--:|--:|---|--:|--:|
| **24–26/07** `bloco` | 10,4 | 2 | 2 | 2 | 1 | **7** | muito alta | 0,85 | **8,8** |
| **27/07** | 8,05 | 2 | 1 | 1 | 2 | **6** | muito alta | 0,85 | **6,8** |
| **28/07** | 8,52 | 2 | 1 | 1 | 1 | **5** | alta | 0,55 | **4,7** |
| **29/07** | 4,41 | 0 | 1 | 2 | 2 | **5** | alta | 0,55 | **2,4** |
| **30/07** | 6,27 | 1 | 1 | 1 | 1 | **4** | alta | 0,55 | **3,4** |
| **03/08** | 3,31 | 1 | 1 | 2 | 2 | **6** | muito alta | 0,85 | **2,8** |
| **04/08** | 3,65 | 0 | 1 | 2 | 1 | **4** | alta | 0,55 | **2,0** |
| **05/08** | 1,58 | 2 | 2 | 0 | 1 | **5** | alta | 0,55 | **0,9** |
| **06/08** | 5,36 | 2 | 2 | 1 | 1 | **6** | muito alta | 0,85 | **4,6** |
| **07–08/08** | 2,44 | 2 | 1 | 2 | 2 | **7** | muito alta | 0,85 | **2,1** |
| **09–10/08** | 0,74 | 0 | 0 | 0 | 0 | **0** | rotina | 0,15 | **0,1** |
| **TOTAL** | **54,7** | | | | | | | | **38,6** |

O bloco 24–26/07 vai junto porque o §5 já diz que só o total dos três se sustenta — aplicar razão dia a dia ali seria precisão falsa.

**O defeito conhecido de A, e ele é grande.** O multiplicador ancora no relógio, e **o relógio é mais curto exatamente onde a dificuldade é maior**. Os dois casos que provam:

- **03/08 — 3,31 h de relógio, índice 6.** É o dia em que o eixo do originador se revelou **nenhuma das duas colunas que medíamos**, e o mapa de 30/07 estava errado em **12 das 41 UCs**, com 19,6% da carteira em kWh trocando de dono. Entender a resposta do dev, refazer o mapa e decidir não cabe em 2,8 h.
- **05/08 — 1,58 h de relógio, índice 5.** É o dia em que o **contrato da Sicoob ficou medido** — três verbos com caminho, corpo, resposta e erro — lido de documentação de banco, **sem sandbox**. A razão devolve **0,9 h** para ler a API de uma instituição financeira.

Por isso **A é piso**, não resposta.

### 6.3 Método B — contagem por artefato

Independente de A: enumerar o que exigiu tempo fora do editor e descontar a parte cuja escrita **já está** no relógio. Um `PROMPT-dev-crm` foi escrito em sessão; formular a pergunta, esperar e reconciliar a resposta com o schema, não.

| Item | Âncora medida no repositório | Bruto | Já no relógio | **Fora** |
|---|---|--:|--:|--:|
| **7 rodadas com o dev do CRM** | 6 `PROMPT-dev-crm-*` + 2 `RESPOSTA-*` | 10 | 5 | **5** |
| **Sicoob** | `SICOOB-portal` (81 l.) + `SICOOB-contrato-medido` (122 l.), 3 verbos, sem sandbox | 9 | 3 | **6** |
| **Equatorial** | `EQUATORIAL-portal` (142 l.) + `PLANO-leitura-fatura` (381 l.), fatura real, chave NF3e | 8 | 3 | **5** |
| **Coleta de dado da operação** | 41 UCs, 39 originadores, 29 contratos, 3 usinas, CPF da R9, tarifas | 8 | 0 | **8** |
| **Aprendizado técnico de terceiros** | RLS/`FORCE`/`security_invoker`, DMMF do Prisma 7, Pix/BR Code, React+Vite, contraste AA, systemd | 14 | 6 | **8** |
| **Decisões fora do teclado** | **60 IDs** em `QUESTOES.md`, 6 ADRs, as 4 do webhook, as 9 da frente nova, a paleta | 10 | 4 | **6** |
| **Contador** | `PAUTA-contador` (342 l.) | 4 | 1 | **3** |
| **Reler o próprio corpus** | 24 passagens de sessão, 4 `RETOMADA-*` | 6 | 3 | **3** |
| **TOTAL** | | **69** | **25** | **44** |

**A = 38,6 · B = 44.** Os dois métodos convergem dentro de 13%, e o §5 já mostrou que essa é a folga normal deste projeto. **Adotado para os 12 dias com relógio: ~41 h.**

### 6.4 O que nenhum dos dois alcança — as sessões 1 e 2

O §1 registra que `PRD-v2.2`, `GLOSSARIO` e as auditorias `P7`/`P8` foram escritos **fora deste repositório** e entraram em 24/07 por upload: *"o volume delas está contado, o relógio não"*. **Não há base de relógio**, então A não as alcança, e a taxa de volume do §5 também não serve — documento normativo não sai a 1.375 linhas/h.

Sobra estimar direto, contra o que essas sessões produziram:

| O quê | Medida | h |
|---|---|--:|
| `PRD-v2.2` | 416 linhas, e já é a **v2.2** | 6 |
| `GLOSSARIO` | **47 termos** e 4 seções que existem só para separar par confundível | 3 |
| `P7` + `P8` | auditoria de um CRM de **151 tabelas**; achou as **82** com RLS e nenhuma policy | 5 |
| Aprendizado do domínio de GD | compensação, UC, rateio, tarifa, crédito, dono de usina — precede a primeira linha | (dentro dos 14) |
| **TOTAL** | | **~14** |

**Este é o número menos ancorado do arquivo inteiro** — não há transcript, não há commit, não há taxa aplicável. Está aqui porque omiti-lo seria pior: fingiria que o projeto começou já sabendo o que é *split de repasse*.

### 6.5 O total

| | h | Base |
|---|--:|---|
| **Trabalho registrado** | **54,7** | §1 a §5 — transcript e `git` |
| **Planejamento, 12 dias com relógio** | **~41** | §6.2 e §6.3, dois métodos, faixa 38,6–44 |
| **Sessões 1 e 2 e o domínio** | **~14** | §6.4, sem relógio nenhum |
| **Planejar e aprender** | **~55** | faixa **48–61** |
| **PROJETO** | **~110 h** | faixa **103–116** |

**Não somar isto com os cortes de 30 ou 60 min do §5.** A tabela de sensibilidade mede **silêncio dentro da sessão** — ir de 15 para 60 min acrescenta 14,4 h, e boa parte disso é esta mesma leitura, com a aba do portal aberta ao lado. As ~55 h somam sobre o corte de **15 min** adotado. Contar as duas coisas conta a mesma hora duas vezes.

### 6.6 Por que a razão é ~1 : 1

Planejar : escrever deu **~55 : 55**. Isso não é um projeto mal planejado nem excesso de cerimônia — é consequência direta do §4: **~860 linhas de código por hora**. A essa velocidade **o código nunca foi o gargalo**. Saber o que escrever foi.

Os três dias em que isso é visível a olho nu:

| Dia | Relógio | O que o dia realmente custou |
|---|--:|---|
| **25/07** | **0,7 h** | `ADR-0003` r2 (12 testes), `SPEC-001` v2.2, `CLAUDE.md` **v1.1** e `ADR-0004`. O dia mais curto do projeto **fixou norma** |
| **03/08** | **3,3 h** | uma resposta de e-mail reescreveu o dono de **19,6% da carteira em kWh** |
| **05/08** | **1,6 h** | a API de um banco ficou medida, e o adaptador ficou **NÃO escrito de propósito** |

E o inverso confirma: **28/07**, o dia de maior volume — 27 commits, 12.776 linhas —, recebe razão **0,55**, a mais baixa dos dias densos. Foi o dia que mais **executou** decisão já tomada.

---

## Rodapé de método

| O quê | Fonte exata |
|---|---|
| horas ativas | 38 transcripts em `~/.claude/projects/-workspaces-finaceiro/`, união dos carimbos de tempo, corte de ociosidade de 15 min |
| commits e linhas | `git log --numstat` e `git ls-files`, excluindo `node_modules` e `package-lock.json` |
| o que saiu de cada dia | assunto dos 153 commits, conferido contra as passagens de sessão `RESUMO-SESSAO-2` a `RESUMO-SESSAO-24` |
| índice de dificuldade (§6.1) | quatro marcadores conferíveis contra ADR, questão e commit do dia — **nenhum medido em relógio** |
| planejamento fora do transcript (§6) | **`[estimado]`, sem exceção.** Dois métodos independentes: multiplicador por dificuldade e contagem por artefato. **Não há registro de tempo do dono fora do Claude Code, e não vai haver** |
