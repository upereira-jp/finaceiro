# RETOMADA — Financeiro G3, 09/09/2026 (madrugada, terceira leva)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-09-noite2.md` para efeito de "onde estamos". O corpo dela continua correto; o que venceu é o §0 — **as duas pendências que eram do implementador foram fechadas** |
| **O que esta leva fez** | Fechou as duas: o alerta **ganhou canal** (pendência 1, "o maior buraco desta entrega") e o **CI parou de depender de fonte `apt` de terceiro** (pendência 6). O que sobrou do alerta é uma decisão de contratar, e ela é do dono |
| **Suíte** | sem banco: `EXIT=0`, **2.713** verificações (eram 2.678) |
| **CI** | ✅ **verde nos cinco jobs, na PRIMEIRA passada** — e é a primeira vez que isso acontece com o `apt` restrito. Run `34395903575` |
| **Repositório** | `main` = **`b92d5d6`** + esta leva, `origin/main` junto |
| **Produção** | serviço subiu **16:49:38** em `1245149`. ⚠️ **Esta leva mexeu em `.tsx` e em `rotas.ts`** — o bundle já foi construído, o backend **não** foi reiniciado (§0.1) |

> ## A frase de uma linha
>
> **O alerta que diagnosticava e não avisava ninguém agora tem dois canais: uma
> unidade do systemd que fica vermelha sem mentir, e uma faixa na primeira tela.
> Falta o terceiro — o único que EMPURRA —, e ele é contratar.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 ⚠️ O deploy que esta leva deixou pronto e NÃO aplicou

São três passos, e o **primeiro é do dono** porque este ambiente não faz `chown`
nem instala unit:

```bash
# 1. o chown, que o classificador recusa daqui — sem ele o deploy morre no build
chown -R financeiro:financeiro /opt/financeiro/app
find /opt/financeiro/app -user root | wc -l        # tem de dar 0

# 2. o backend, porque `src/http/rotas.ts` mudou (o campo `sem_conector`)
systemctl restart financeiro.service

# 3. a unidade nova, que É o canal — e o `disable` da velha NÃO é opcional
install -m 644 deploy/financeiro-*.service deploy/financeiro-*.timer /etc/systemd/system/
systemctl disable --now financeiro-agenda-certificado.timer
rm -f /etc/systemd/system/financeiro-agenda-certificado.{service,timer}
systemctl daemon-reload
systemctl enable --now financeiro-saude-cobranca.timer
systemctl start financeiro-saude-cobranca.service
systemctl status financeiro-saude-cobranca.service    # esperado: exited, status=0
```

O bundle do frontend **já foi construído** (`npm run web:build`, nginx serve na
hora), então a faixa nova só depende do passo 2 para ter o que ler.

### 0.2 Uma coisa que se fecha em um segundo, e continua sua

**Abra a tela de Pendências.** Se **nenhuma faixa** aparecer no alto, está certo —
hoje o A1 tem 341 dias e o aviso está ativo. A faixa só existe quando há o que
dizer, e ela **substitui** o hábito de abrir Cobrança para conferir.

⚠️ E a §0.1 da leva anterior **continua aberta**: a rota autenticada
`/conector-cobranca/aviso-pagamento` nunca foi medida daqui. Agora ela tem um
consumidor a mais.

### 0.3 O que sobrou, e de quem é

| # | O quê | De quem |
|:--:|---|---|
| **1** | **`Q-ALERTA-EMAIL-01`** — os dois canais novos são de **puxar**; o único que empurra é e-mail, e é contratar terceiro | **dono** |
| **2** | A janela cega continua sendo de **até 24 h** — a unidade é diária | ninguém (é consequência) |
| **3** | **Nada religa o webhook sozinho**, e automatizar tem risco de laço | dono |
| **4** | A pergunta ao suporte Sicoob (*quantas falhas inativam?*) — permitiria **prevenir** em vez de detectar | dono |
| **5** | Os **10 endereços** e o **tipo do originador do Rhenan** | dono |
| **6** | **`dono_usina`** — adiada em 09/09. Bloqueia o split na primeira fatura paga | dono |
| **7** | As **quatro vermelhas do contador** (bloqueio na F2) e a **`Q-VENC3-01` (b)** | dono |
| **8** | ⚠️ **A conta lida da competência + a geração** — **é isto que trava a primeira fatura**, e nada disso é webhook | dono |

**Não há mais pendência de código aberta desta linha.** As duas que eram do
implementador em 09/09 foram fechadas nesta leva.

---

## 1. O canal, e por que ele são DOIS

A leva anterior fechou o diagnóstico e deixou o preço por escrito: o nível chegava
ao journal do systemd e à tela de Cobrança, e **nenhum dos dois procura ninguém**.
A falta era mais velha do que ela — o próprio
`financeiro-agenda-certificado.service` registrava desde **28/08**: *«não notifica
ninguém. O aviso cai no journal.»*

**Um canal só cobriria metade das horas do dia**, e é por isso que são dois.

### 1.1 `financeiro-saude-cobranca` — para quando NINGUÉM está olhando

Uma unidade própria, diária, que **fica vermelha** em
`systemctl list-units --failed` — a superfície que o `deploy/README` chama de
"a única superfície de alarme desta máquina", e onde nenhum dos dois alertas
aparecia.

**Por que ela pode ficar vermelha sem mentir, e este é o argumento inteiro.** A
objeção que manteve o alerta fora do alarme estava certa: pôr o timer da
**consulta** em `failed` porque o webhook morreu mente sobre *qual* coisa quebrou.
Esta unidade não tem esse problema porque **o trabalho dela É a afirmação** — ela
afirma *"o caminho do dinheiro está de pé"*, e quando fica vermelha o que falhou é
exatamente isso. E ela **não carrega dinheiro nenhum**: a fila continua emitindo e
a consulta continua baixando com ela em `failed`.

| Código | Significa | Vermelho? |
|:--:|---|:--:|
| **0** | de pé | não |
| **3** | não há conector de cobrança — mesmo 3 da fila e da consulta | **não** (`SuccessExitStatus=3`) |
| **4** | precisa de ação humana: A1 vencido / vencendo / sem data, ou o banco desligou o aviso, ou nunca houve | **sim** |
| **5** | não deu para perguntar ao banco | **sim** |

**O 5 é a decisão que mais custou.** É tentador fazer a Sicoob fora do ar sair 0
para não pintar a máquina de vermelho — e seria refazer, no alarme, o erro que
`nivelDoAviso` existe para não cometer: *não ter perguntado não autoriza dizer que
está bem*. O 5 custa um vermelho de um dia numa queda transiente; compra a queda
que dura um mês.

**E ela se apaga sozinha.** `failed` de um `oneshot` dura até a próxima execução
passar — o dia em que o A1 for renovado ou o webhook recadastrado, a lista fica
limpa sem ninguém digitar `reset-failed`. Alarme que exige gesto manual para
desligar é alarme que fica ligado.

**Ela SUBSTITUI a `financeiro-agenda-certificado`, e o `disable` não é opcional.**
Aquela lia metade do problema e saía sempre 0. Manter as duas põe dois relatórios
no mesmo journal e quem ler acha que a velha é a nova. **Nenhum timer novo no
saldo:** eram quatro, continuam quatro.

### 1.2 A faixa em Pendências — para quando ALGUÉM está

O alerta morava na tela de **Cobrança**, e essa é a pior das telas para ele: é a de
*configurar* o banco, aberta uma vez por trimestre. **Pendências é a primeira da
barra e a que a operação abre todo dia.** A de Cobrança fica — é lá que se
conserta.

Três coisas que a faixa faz e que valem o teste que as prende:

- **`sem_conector` não gera faixa nenhuma.** Uma instalação que nunca ligou banco
  veria âmbar na primeira tela, todo dia, para sempre. Foi preciso um campo novo
  na rota (`sem_conector`, e **não** um quinto nível) para o servidor conseguir
  dizer a diferença entre *"não há banco"* e *"não deu para perguntar"*;
- **nenhuma faixa usa jargão de integração** — quem lê não sabe o que é webhook e
  não precisa saber;
- **a frase do atraso está prendida por teste.** Sem *«o dinheiro não se perde: a
  consulta diária continua dando baixa, o que muda é o atraso»*, o alerta parece
  perda de dinheiro e vira pânico.

**Não há cache, e a pergunta é legítima depois do §2 da leva anterior.** Lá o
diagnóstico foi tirado da fila de 5 minutos por discar a Sicoob 288 vezes ao dia.
A diferença é a natureza de quem chama: lá era um **timer**, aqui é uma **pessoa**
abrindo tela, e `useDados` não faz polling. Se um dia deixar de ser verdade, o
lugar do cache é o servidor — não a tela.

### 1.3 O que ainda falta, e é do dono

**`Q-ALERTA-EMAIL-01` 🟡.** Os dois canais construídos são de **puxar**: esperam
alguém olhar. O único que **procura a pessoa** é e-mail, e ele não é decisão
técnica — **não há MTA nesta máquina** (verificado: nem `postfix`, nem `exim`, nem
`msmtp`, nem `sendmail`), um relay é contratar terceiro, e enviar direto de VPS
para Gmail sem SPF/DKIM cai em spam — *um canal que parece existir e não entrega*.

**O pior caso hoje:** o webhook cai numa sexta e ninguém abre Pendências até
segunda. Três dias em que a baixa acontece uma vez por dia. **Não perde dinheiro;
atrasa.**

---

## 2. O CI parou de depender de fonte `apt` de terceiro

Eram **seis** `apt-get update` em dois workflows, e cada um atualizava **todas** as
fontes da imagem do runner. Em 09/09 o índice do **Google Chrome** — que não é
nosso — derrubou quatro dos cinco jobs sem que uma linha nossa tivesse mudado.

Agora há **um script só**, `.github/instalar-psql.sh`, com **lista de permissão**:
só a fonte do Ubuntu e a do PostgreSQL. Apagar a do Chrome resolveria hoje; a
próxima imagem do runner traz outra. **Lista de negação envelhece; lista de
permissão não.**

Três coisas que a primeira execução verde ensinou, e que estão no arquivo:

1. **o runner é 24.04 e usa `sources.list.d/ubuntu.sources`** (deb822), não
   `/etc/apt/sources.list` — os dois caminhos entram, e o que não existe não casa;
2. **as fontes de terceiro da imagem são exatamente duas**, e o log agora as
   nomeia: `google-chrome.sources` e `microsoft-prod.list`. A que derrubou quatro
   jobs em 09/09 está ali, do lado certo da linha;
3. **o log imprime as duas listas** — as que entraram e as **ignoradas**. Sem a
   segunda, o mecanismo é invisível: quem investigar um vermelho daqui a um ano vê
   o que entrou e não vê que havia mais.

⚠️ **Uma coisa que eu afirmei errado e a medição desmentiu**, e fica registrada
porque a conclusão mudou: eu disse que os três jobs sem versão resolviam
`postgresql-client` pelo **índice em cache** da imagem, e que por isso o
`List-Cleanup=0` era load-bearing. A execução seguinte mostrou que **não há fonte
pgdg em `sources.list.d`** — só Chrome e Microsoft —, então o cliente
`16.15-1.pgdg24.04+2` vem do próprio `/etc/apt/sources.list`, que **está** na lista
de permissão. Os curingas `*pgdg*` e `*postgresql*` não casaram com nada nesta
imagem; ficam para o dia em que casarem. O `List-Cleanup=0` continua certo — ele
impede que o update restrito apague o índice de tudo o que ficou de fora —, mas
**não** é ele que faz estes três jobs funcionarem.

**O filtro de `push` passou a `.github/**`.** Os cinco jobs dependem do script e
ele não mora em `workflows/` — com o filtro antigo, uma mudança só nele não
rodaria CI nenhum, e o script é justamente o passo que já derrubou quatro jobs.

**A regra que continua valendo depois de todo push:**

```
gh run list --workflow=isolamento --limit 2
```

E a leitura certa de um vermelho continua sendo **abrir o log antes de re-rodar**.
O que mudou é que a causa mais comum dele deixou de existir.

---

## 3. O que entrou no repositório

| Arquivo | O quê |
|---|---|
| `src/dominio/agenda.ts` | **`saudeDoCaminhoDoDinheiro`** — puro, os quatro códigos e a precedência `3 > 4 > 5` |
| `scripts/agenda.ts` | tarefa **`--saude`**, a única que sai com código |
| `deploy/financeiro-saude-cobranca.{service,timer}` | a unidade que fica vermelha. **Substitui** a `financeiro-agenda-certificado`, removida |
| `deploy/README.md` | o bloco de migração, os códigos 4 e 5, e a nova ordem (06:37, **depois** da consulta) |
| `src/http/rotas.ts` | `sem_conector` na resposta do aviso — campo próprio, não um quinto nível |
| `web/src/saude-do-dinheiro.ts` | **`faixasDaSaude`** — puro, as frases num lugar só |
| `web/src/telas/prontidao.tsx` | a faixa no alto da primeira tela, e a leitura que não deixa erro subir |
| `.github/instalar-psql.sh` | o único `apt-get update` do repositório, com lista de permissão |
| `.github/workflows/{isolamento,provisionar-cobranca}.yml` | os seis pontos de cópia viraram uma chamada; filtro `.github/**` |
| `tests/agenda.ts` | `AG9a`…`AG9p` — os 16 pares por exaustão, o contrato do unit, e o par crítico por mutação |
| `web/tests/saude-do-dinheiro.ts` | `SD-1`…`SD-11` — os 25 pares, o jargão e a frase do atraso |
| `tests/ci-apt.ts` | `CI-1`…`CI-8` — nenhum `apt-get update` cru volta a existir |
| `QUESTOES.md` §2.h | as doze decisões, e a que volta para o dono |

---

## 4. O que foi medido, e o que NÃO foi

| Afirmação | Como se sabe |
|---|---|
| O `--saude` funciona contra produção | `A1 ok (341 dias)`, `aviso ativo`, **`=> 0 DE PE`, `EXIT=0`** |
| O caminho **vermelho** também | forçado o nível a `vencido` por mutação: **`=> 4 PRECISA DE AÇÃO HUMANA`, `EXIT=4`** |
| O `apt` restrito instala de verdade | CI verde nos cinco, **primeira passada**, e o log lista as fontes que entraram: `ubuntu.sources` + `pgdg.list` |
| Os quatro códigos não colapsam | `AG9j`: dos 16 pares, exatamente **um** sai 0 |
| O alarme não pode ser apagado em silêncio | `AG9l`, por mutação: pôr `4` ou `5` no `SuccessExitStatus` fica vermelho |
| A suíte | `EXIT=0`, **2.713** verificações sem banco |

⚠️ **O que NÃO foi medido, e o §0.1 fecha:**

1. **a unidade em `systemctl list-units --failed` de verdade** — instalá-la é
   passo do dono, e este ambiente não instala unit;
2. **a faixa na tela** — o backend não foi reiniciado, então o campo `sem_conector`
   ainda não existe na resposta de produção. Isso **não quebra nada agora**:
   `undefined` é falsy, então a tela lê `temConector = true` e mostra a faixa pelo
   nível, que é o certo **porque produção tem conector**. O que só passa a valer
   depois do restart é o silêncio de quem *não* tem;
3. **a rota autenticada**, que a leva anterior já listava: cunhar um JWT local não
   funciona aqui (`SUPABASE_JWT_SECRET` não está na env).
