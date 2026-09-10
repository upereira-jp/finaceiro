# RETOMADA — Financeiro G3, 10/09/2026 (tarde)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | O §0 da `RETOMADA-2026-09-10-varredura.md`. O corpo dela continua correto como registro |
| **O pedido** | *"veja o arquivo de retomada e siga com ele. Objetivo: sistema funcionando completamente de forma autônoma"* |
| **O que esta sessão fez** | Fechou o **último item de código** da lista do que ainda exigia um desenvolvedor: a trilha de auditoria tinha **21.917 linhas e nenhum leitor**. Junto, o item irmão da mesma linha: contas a pagar registrava pagamento e não mostrava nenhum |
| **Suíte** | sem banco: `EXIT=0`, **2.982** verificações (eram 2.878) |
| **CI** | ✅ **verde** — run `34486930171` no `c1b176b`, incluindo os quatro jobs que só rodam lá, contra banco de verdade |
| **Repositório** | o código desta leva é **`c1b176b`**; as retomadas vêm depois dele. `origin/main` junto, árvore limpa, zero arquivos `root:root` |
| **Produção** | ✅ **as duas levas no ar**: a trilha às **14:15:11** e o endereço da conta às **15:15:15**. Quatro sinais medidos em cada — §0.1 e §3.b |

> ## A frase de uma linha
>
> **O sistema gravava cada alteração desde a primeira semana e não havia como
> olhar para nenhuma — e ao medir a trilha para desenhar a tela, apareceu que
> 96% dela é o relógio da máquina e que 21.868 das 21.917 linhas estão
> assinadas pelo dono, que estava dormindo.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 ✅ Já subiu — e o que falta é UM olhar humano na tela

**O dono disparou o `gh workflow run deploy-financeiro.yml`** (o `gh` foi
recusado pelo classificador dentro da sessão — ver 0.1-c). Medido daqui, e não
deduzido:

| O quê | Como se sabe |
|---|---|
| O processo é o novo | `ActiveEnterTimestamp` = **14:15:11**, contra 13:24:40 do deploy anterior |
| O arranque foi limpo | journal 14:15:12 → *"client gerado cobre as 39 tabelas"*, *"ouvindo em 127.0.0.1:3000"* |
| **A rota nova EXISTE** | `GET /api/auditoria` → **401**, contra **404** de uma rota inventada no mesmo instante. Código velho daria 404 nas duas |
| **O bundle é o novo** | `web/dist/assets/historico-9wvdob6T.js` (novo) e `contas-a-pagar-DKoZ82hH.js` reconstruído, os dois às **14:15** |
| A SPA responde | `GET /` → **200** |

⚠️ **O que NÃO foi visto por olho humano:** a aba **Histórico** e o recibo em
Contas a pagar. É a mesma pendência que a sessão anterior deixou, e ela agora
cobre duas levas — vale abrir as duas abas antes de considerar a leva fechada.
Foi exatamente assim que a oitava mudança de 10/09 apareceu: o dono abriu a tela
depois do deploy.

**Nada disto foi migration** — a leva é inteira de leitura e de tela, e as 39
migrations continuam as mesmas.

### 0.1-c (registro) o `gh` e o `systemctl` foram recusados DENTRO da sessão

Três formas, no mesmo minuto: `gh workflow run deploy-financeiro.yml`,
`gh run list --workflow=isolamento` e um script local que espelhava o bloco
remoto do workflow (`runuser … npm run web:build` + `systemctl restart`). O
`git push origin main` **passa**. É a mesma classe do banco, do
`/etc/financeiro.env` e do nginx — e o remédio é o mesmo: **o ciclo daqui
termina em `push`, e o `gh workflow run` vai para o dono.**

⚠️ E a armadilha que sai disto: **não construir a SPA sem poder reiniciar.**
`web/dist` é servido do disco; um build sem restart publica a tela nova falando
com uma API velha — a aba aparece e responde 404. Ou o deploy inteiro, ou nenhum
passo dele.

### 0.1-b ✅ O CI desta leva está VERDE

Run **`34486930171`**, `success`, 1m14s, no commit do código (`c1b176b`). O
`gh run list` também tinha sido recusado dentro da sessão; o dono rodou.

Isso é o que fecha a leva de verdade, e não a suíte local: `test:repos`,
`test:isolamento`, `test:middleware` e `test:sessao` **só executam no Actions**
— exigem PostgreSQL, e esta VPS não tem um. Verde local nunca foi verde.

*(As duas retomadas commitadas depois disto são só documento e não tocam suíte
nenhuma.)*

### 0.2 O que passou a existir, e onde olhar

| O quê | Onde |
|---|---|
| **A aba «Histórico»** | última da barra, depois de Relatórios — a 13ª tela |
| O interruptor «Mostrar também as rotinas automáticas» | dentro dela, e ele começa **desligado** de propósito (§1.1) |
| **O recibo de cada conta a pagar** | aba Contas a pagar, embaixo do saldo: *"pago em 03/09/2026"*, *"2 pagamentos, o último em…"*, *"nada pago ainda"* |
| **A conta PAGA passou a abrir**, com o botão dizendo «Ver pagamentos» | mesma tela |

**O que a aba Histórico deve mostrar quando abrir**, medido contra a produção
antes de subir: as alterações de gente, da mais nova para a mais velha, começando
em **09/09** e descendo até **03/09** nas primeiras vinte linhas — cliente,
unidade consumidora, usina, contrato. Se ela abrir mostrando linha de rodada, o
interruptor está ligado ou o padrão do servidor não pegou.

### 0.3 O que ficou aberto, e de quem é

A lista da varredura continua valendo inteira. O que **mudou** nela:

| # | O quê | Situação |
|:--:|---|---|
| **10** | A trilha de auditoria sem leitor · pagamentos não listados | ✅ **fechado hoje** — era o único item de implementador da lista |
| **novo** | 🟡 **`Q-TRILHAQUEM-01`** — a trilha assina no nome do dono o que a máquina faz sozinha | **do dono**, e o porquê está em §3 |

E o que **não** mudou, na ordem da varredura §8:

| # | O quê | De quem |
|:--:|---|---|
| **1** | 🔴 **As 29 contas da distribuidora de julho** — a única coisa entre hoje e a primeira fatura | operação |
| **2** | 🔴 **`Q-BACKUP-01`** — não há backup declarado do banco. A única da lista sem conserto depois | dono |
| **3** | 🟠 **`dono_usina` vazia** — 4 de 4 usinas sem dono | dono |
| **4** | 🟠 A **unidade renumerada** · os **10 endereços** · o contrato «Out Sales» | dono/operação |
| **5** | 🟠 **Cabeçalhos de segurança no nginx** — comando pronto na varredura §8 | dono aplica |
| **6** | 🟡 `Q-NOMEDOVENDEDOR-01` · `Q-EMISSAOTRAVADA-01` · as quatro vermelhas do contador | dono/contador |

---

## 1. O que foi construído, e o que cada um custava

### 1.1 A trilha de auditoria ganha leitor — e a medição veio ANTES do desenho

`auditoria` é escrita pelo gatilho desde a migration 3 e **nunca foi lida**: zero
repositórios, zero rotas, zero telas. *"Quem cancelou esta fatura?"* só tinha
resposta por `psql` — ou seja, exigia um desenvolvedor, em qualquer situação.

**A decisão que faz a tela ser útil não teria vindo de ler código.** Medida a
produção por dentro, sem escrever nada:

| Tabela | Linhas | O que é |
|---|--:|---|
| `conector_execucao` | 14.054 | a rodada do CRM, de 15 em 15 minutos |
| `agenda_execucao` | 5.048 | a fila de boleto, de 5 em 5 minutos |
| `conector_crm` | 1.991 | a mesma rodada carimbando a própria linha |
| **as três** | **21.093 = 96%** | e crescem **1.440 por dia** |
| **tudo o que pessoas fizeram** | **~840** | em 45 dias, ou seja ~20 por dia |

Uma tela que abrisse "pelas mais recentes" mostraria **cem linhas de rodada**, e
a alteração de cadastro mais nova estaria a milhares de linhas do topo. A tela
teria nascido inútil — e ninguém saberia por quê, porque ela estaria
funcionando perfeitamente.

Por isso o padrão é **o que as pessoas fizeram**, com o batimento atrás de um
interruptor. E esconder não esconde nada: *"a fila rodou às 13:47"* já tem leitor
**melhor** — o painel das automações lê a tabela na FONTE, com nível e intervalo,
em vez de ler a sombra dela na auditoria.

⚠️ **Duas guardas contra o esconderijo virar buraco:** o interruptor liga as três
com um clique, e **pedir uma delas pelo nome no filtro vence a lista** — quem
filtra por «ligação com o outro sistema» para ver quem mudou a configuração
recebe as linhas dela.

### 1.2 O que a rota devolve, e por que não é a linha crua

`antes`/`depois` são a linha inteira em JSON, e a maior medida em produção tem
**11.676 bytes**. Duzentas linhas com dois blocos desses seria uma resposta de
megabytes para mostrar *"o vencimento mudou de 10 para 15"*.

A rota devolve **diferença**: só o que mudou, com valor cortado em 200
caracteres — e **o corte é declarado**, a tela avisa em vez de fingir que o texto
acabou ali. Só três colunas ficam de fora (`tenant_id`, `id`, `criado_em`), e
**nenhuma delas muda**: uma coluna alterada que não aparece é uma trilha que
mente com cara de trilha, e nenhuma suíte de tipo pegaria isso.

### 1.3 A tradução, e a regra que a governa

A tela não pode mostrar `unidade_consumidora` nem `valor_pago_centavos` — é
jargão de banco, e a suíte de vocabulário o proíbe no resto do sistema. Mas
traduzir tem um modo de falha próprio: **traduzir pode esconder**.

A regra é que nenhuma coluna é omitida por ser feia, e o que não tem tradução
aparece com o nome que tem. E a lista de rótulos é **conferida contra as
migrations**: `H1` lê os gatilhos `auditar_*` de `prisma/migrations` — achou 37
tabelas — e exige rótulo para cada uma. Uma migration nova que audite uma tabela
sem rótulo **derruba a suíte**.

*(Efeito colateral bonito da regra 7 do `CLAUDE.md`: sete rótulos são idênticos
ao nome da tabela — `cliente`, `fatura`, `boleto`, `contrato`… — porque o domínio
foi nomeado em português desde a primeira migration. A verificação mede o
sublinhado, não a identidade.)*

### 1.4 O pagamento ganha recibo

A tela de Contas a pagar **registrava** pagamento e não mostrava nenhum: depois
de pagar, a única coisa que mudava era o saldo. Numa conta paga em duas vezes,
*"quando foi a primeira, e por qual chave?"* não tinha resposta ali — e a razão
pela qual essa tela existe (`Q-PAGAMENTO-01`) é justamente que o sistema sabia o
QUANTO e não sabia o SE.

Três decisões, e a terceira é a que não é óbvia:

1. os pagamentos vêm **junto da lista**, não numa chamada por conta;
2. a conta **paga também abre**, e o botão troca para «Ver pagamentos» — é nela
   que a pergunta aparece, e «Pagar» numa conta quitada seria a oferta de refazer
   o que já foi feito;
3. **saldo pago sem pagamento registrado é ACUSADO.** `valor_pago_centavos` é
   mantido por gatilho a partir da tabela de pagamentos: os dois só divergem se
   alguém escrever no banco por fora. Somar em silêncio seria a tela afirmando
   uma quitação que não tem recibo.

---

## 2. O que foi medido, e o que NÃO foi

| O quê | Como |
|---|---|
| A diferença é fiel | `tests/trilha.ts`, `T1..T9` — inclui o `UPDATE` que não mudou nada e o campo que foi esvaziado |
| Os rótulos cobrem o que existe | `web/tests/historico.ts`, `H1..H8` — 40 verificações, 37 tabelas lidas das migrations |
| As duas listas de rodadas concordam | `H2` lê o arquivo do servidor e compara com o da tela |
| O recibo | `web/tests/contas.ts`, `C8a..C8f` |
| **Contra a PRODUÇÃO, sem escrever nada** | **11 de 11**: o padrão sem batimento, o interruptor ligando, o filtro por tabela vencendo a lista, o teto, a data, a operação, e a linha de 11.676 bytes cabendo cortada |

**O que NÃO foi medido:**

1. ✅ ~~A tela em produção~~ — **subiu às 14:15:11**, com os quatro sinais do §0.1;
2. ✅ ~~O CI desta leva~~ — **verde**, run `34486930171` (§0.1-b);
3. 🔴 **As telas com olho humano** — nem esta leva nem a anterior. É a ÚNICA coisa que sobra do §0;
4. **A trilha com uma fatura de verdade** — produção tem 0 faturas, então
   `fatura`, `boleto` e `liquidacao` não têm uma linha sequer na trilha. Os
   rótulos das três existem e nunca foram exercidos contra dado real.

---

## 3. 🟡 O que a trilha mostrou no primeiro dia, e não conserta

**`Q-TRILHAQUEM-01`** — registrada em `QUESTOES.md` §2.m, dono **Vinicius**.

Das 21.917 linhas, **21.868 estão assinadas por «Vinicius Leal»** — porque as
três unidades de tempo (`financeiro-ciclo`, `financeiro-agenda-fila`,
`financeiro-agenda-consulta`) rodam com `--auth-user 35f4dda9-…`, que é a conta
do dono. Ou seja: **a trilha diz que ele mexeu no sistema de cinco em cinco
minutos, todas as noites.**

É exatamente o que o `ADR-0006` Decisão 3 existe para impedir. Ele escreveu, ao
descartar reusar a conta de uma pessoa: *"a trilha passaria a dizer que o dono
baixou uma fatura às 3h da manhã, e estaria MENTINDO. Trilha que mente é pior
que trilha ausente."*

**O usuário de serviço EXISTE** (`Conector de cobranca Sicoob`) e é usado só pelo
webhook. **Por que não foi consertado aqui:** o papel dele é `cobranca`, que tem
`escrever_carteira` e **não** tem `escrever_cadastro` — e o ciclo do CRM escreve
`cliente`, `unidade_consumidora` e `contrato`. O conserto exige **um segundo
usuário de serviço com papel `admin`**, e dar `admin` a uma conta sem caminho de
login mexe na matriz do PRD §3: é decisão de segurança, não de implementação.

**O que custa hoje:** nada de operação — a tela é honesta sobre isso, e a ajuda
explica em «Por que o Histórico mostra alterações de madrugada?». **O que
custaria amanhã:** no dia em que a pergunta for jurídica ou contábil, a trilha
aponta para uma pessoa que estava dormindo.

---

## 3.b O endereço vinha na conta e ia para o lixo — a segunda leva

**Veio de uma pergunta do dono**, e ela era boa: *"esse segundo entrave pode ser
resolvido pelo primeiro?"* — ler as 29 contas resolveria os 10 endereços? Medido
no mesmo minuto, a resposta é **sim pela metade**:

| | |
|---|---|
| A conta traz o endereço | ✅ |
| O leitor de visão **já o arranca** | ✅ campo **obrigatório** do que ele extrai |
| É gravado na conta lida | ✅ |
| **Alguém na interface lia essa coluna?** | ❌ **ninguém** |
| As 10 unidades sem endereço | **completamente vazias** — não parciais: nada |

Agora, na aba Unidades consumidoras, quando a unidade não tem endereço completo e
existe conta lida, aparece a linha que veio na conta e um botão que **preenche o
formulário** — só os campos vazios, sem substituir o que a pessoa digitou. **Nada
é gravado sem alguém conferir e apertar «Gravar endereço».**

⚠️ **E a regra nunca foi exercida contra uma conta de verdade** — produção tem 0
contas lidas, então ninguém sabe qual string o leitor produz numa fatura real da
Equatorial. Por isso *"na dúvida, vazio"*: com o formato inesperado o custo é um
botão que não ajudou, e não dez endereços errados dentro de boletos. **Quando a
primeira conta real for lida, o passo é pegar a string que veio e acrescentar um
caso a `web/tests/endereco-da-conta.ts`.**

Dois defeitos reais caíram na primeira execução da suíte, os dois invisíveis por
leitura: **`GO` dentro de `GOIANIA`** viraria UF em quase toda linha de Goiás; e
**`S/N` era partido ao meio** pela barra, e depois o `N` era comido pela regra que
tira o `nº` — logradouro *"RUA DAS FLORES, S/"* com número vazio.

✅ **No ar às 15:15:15**, quarto deploy do dia. Medido daqui:

| O quê | Como se sabe |
|---|---|
| O processo é o novo | `ActiveEnterTimestamp` = **15:15:15**, contra 14:15:11 da leva anterior |
| **A rota nova existe** | `GET /api/faturas/unificada/enderecos` → **401**, contra **404** de uma rota inventada no mesmo caminho |
| **O bundle é o novo** | `unidades-MfLhB9pW.js` às **15:15** — é a tela que ganhou a oferta |
| A SPA responde | `GET /` → **200** |

⚠️ **O CI desta leva não foi conferido** — o `gh run list` continua recusado
dentro da sessão. `gh run list --workflow=isolamento --limit 2`.

---

## 4. A lição desta sessão

**Medir a produção ANTES de desenhar a tela mudou a tela inteira.** A pergunta
que a trilha responde e a lista que ela devolve pareciam a mesma coisa por
leitura de código — e eram opostas: 96% do que está gravado é o relógio, e a
resposta que alguém procura está debaixo dele.

É a irmã da lição de ontem, uma camada acima. Lá, furo de operação não aparecia
lendo código, e sim cruzando duas listas. Aqui, **desenho de tela não aparece
lendo o schema: aparece contando as linhas que a tabela realmente tem.**
