# RETOMADA — Financeiro G3, 09/09/2026 (noite, segunda leva)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-09-noite.md` para efeito de "onde estamos". O corpo dela continua correto; o que venceu é o §0 — ele manda conferir um deploy que já saiu |
| **O que esta leva fez** | Fechou o último item de **código** que a leva anterior deixou aberto: o webhook desligado deixou de ser silencioso. E achou, medindo, uma assimetria de papel que estava lá desde 09/09 de manhã |
| **Suíte** | sem banco: `EXIT=0`, **2.678** verificações (eram 2.663) |
| **CI** | ✅ **verde nos cinco jobs** — mas só no *re-run*: a primeira passada caiu por causa do **repositório do Google Chrome**, e a fragilidade continua lá (§5) |
| **Repositório** | `main` = **`cf9164d`**, `origin/main` junto, árvore limpa, zero arquivos `root:root` |
| **Produção** | serviço subiu **16:49:38** em `1245149`. O que veio depois (`cf9164d`) é `scripts/agenda.ts` + testes — **o processo não carrega nenhum dos dois**, então não há deriva que importe (§2) |

> ## A frase de uma linha
>
> **A Sicoob desliga o webhook quando a entrega falha e não conta a ninguém.
> Agora o sistema percebe sozinho — e a leitura que percebe é feita pelo próprio
> usuário de serviço do webhook, o que até hoje o papel dele não permitia.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 Uma coisa que se fecha em um segundo, e é sua

**Abra a tela de Cobrança.** Se a faixa âmbar *"não deu para perguntar ao banco"*
**não** aparecer, a cadeia inteira está provada — é a única ponta que não deu para
medir daqui (§7).

### 0.2 As seis pendências novas — duas são código, e as duas são minhas

| # | O quê | De quem |
|:--:|---|---|
| **1** | **O alerta diagnostica e não avisa ninguém** — é o maior buraco desta entrega, e está detalhado logo abaixo | implementador |
| **2** | A janela cega é de **até 24 h** — limite declarado, não coisa resolvida | ninguém (é consequência) |
| **3** | **Nada religa o webhook sozinho**, e automatizar tem risco de laço | dono |
| **4** | A rota autenticada não foi medida daqui | §0.1 fecha |
| **5** | A pergunta ao suporte Sicoob **mudou de natureza** | dono |
| **6** | **O CI depende de fontes `apt` de terceiro** e cai sem que nada nosso mude (§5) | implementador |

#### ⚠️ A pendência 1, por extenso, porque ela é o preço desta entrega

O nível chega a **dois** lugares: o journal do systemd e a tela de Cobrança.
**Nenhum dos dois procura ninguém.** E `systemctl list-units --failed` — que o
`deploy/README` chama de única superfície de alarme desta máquina — **não pega**,
de propósito: o alerta não derruba a rodada, porque derrubar mentiria sobre *qual*
coisa quebrou (a consulta não falhou; o webhook é que morreu).

**O que se ganhou foi menos do que parece, e vale dizer com todas as letras:**
trocou-se *"ninguém sabe"* por *"quem abrir a tela sabe"*. É melhor, e não é aviso.
Falta escolher um canal — e-mail, uma unidade de diagnóstico própria que possa
ficar vermelha sem mentir, ou a fila de pendências da tela inicial.

#### A pendência 3, e por que ela não virou código junto

O alerta manda um humano recadastrar, e **esse caminho funciona** — conferido, não
suposto: a guarda do `--cadastrar` filtra por `!webhookInativo`, então um webhook
morto **não** bloqueia o recadastro. O `PATCH /webhooks/{id}/reativar` continua não
construído.

**Automatizar tem um risco real e é por isso que é decisão:** a Sicoob desliga
porque o **nosso** endpoint falhou. Religar sozinho sem saber o motivo é um laço —
religa, falha de novo, desliga de novo.

#### A pendência 5 mudou de natureza, e isso é novo

Continuam as quatro perguntas ao suporte. A do webhook — *quantas falhas bastam
para inativar, e ela avisa antes?* — deixou de ser curiosidade: hoje nós
**detectamos depois do fato**, e a resposta dela é o que permitiria **prevenir**.

### 0.3 O que não mudou, e continua com o dono

1. os **10 endereços** e o **tipo do originador do Rhenan**;
2. **`dono_usina`** — adiada em 09/09. Não bloqueia faturar nem emitir; bloqueia o
   split na primeira fatura paga;
3. as **quatro vermelhas do contador**, que voltam a ser bloqueio na F2;
4. **`Q-VENC3-01` (b)**, a borda que piorou dois dias;
5. **a conta lida da competência + a geração** — ⚠️ **é isto que trava a primeira
   fatura**, e nada disso é webhook.

---

## 1. O que entrou: o aviso de pagamento deixa de ser silencioso

A leva anterior descobriu, lendo o contrato do `GET /webhooks`, que **a Sicoob
INATIVA o webhook quando a entrega falha** — `dataHoraInativacao` e
`descricaoMotivoInativacao`, com o exemplo do próprio banco preenchendo o segundo
com *«Erro ao enviar notificação»*. Era o último item da lista que ainda era código.

**Por que ele merecia código:** um webhook desligado é silencioso do nosso lado.
Não chega erro, não chega nada — *"nenhuma notificação"* é indistinguível de
*"ninguém pagou"*. É o mesmo formato de dano do A1 vencido (*"a emissão para sem
erro óbvio"*, PRD §6), **uma camada adiante**: aqui o dinheiro já entrou na conta e
o sistema nunca fica sabendo.

### Os quatro níveis, e nenhum colapsa no outro

`ativo` · `inativado` · `ausente` · `nao_verificavel`.

- **`ausente` não é `inativado`.** Nunca ter ligado é o estado de quem ainda não
  ligou; ser desligado pelo banco é o de quem ligou e perdeu. Pedem a mesma ação e
  contam histórias opostas sobre o que aconteceu.
- **`nao_verificavel` não é `ativo`**, e é a lição que o `sem_certificado` já tinha
  ensinado: **não ter perguntado não autoriza dizer que está bem.**
- **Um inativo contamina a lista.** Com dois cadastrados e um desligado não dá para
  saber qual o banco usaria, e a resposta otimista seria aposta sobre dinheiro.
  Verificado **por exaustão** nas 62 listas de 1 a 5 avisos, não por exemplo
  escolhido a mão.

### As decisões de forma, e as duas que custaram algo

| Decisão | Por quê, em uma linha |
|---|---|
| **Sai junto da rodada, não vira tarefa nova** | Cópia do alerta do certificado. **Nenhum timer novo** — a `agenda-consulta.timer` já roda diária |
| **NÃO derruba a rodada nem muda o código de saída** | Um aviso morto não quebra a consulta ativa. Pôr o timer em `failed` mentiria sobre qual coisa quebrou, e vermelho que mente custa mais que alarme nenhum |
| **Erro de rede vira `nao_verificavel`, não exceção** | A Sicoob fora do ar não pode impedir a fila de emitir nem a consulta de baixar. **Diagnóstico que derruba o caminho do dinheiro é pior que a doença.** `TypeError`/`RangeError` continuam passando por cima |
| **`avisoDePagamento` é OPCIONAL na porta** | Os três verbos são o caminho do dinheiro; este é diagnóstico. Exigi-lo obrigaria o falso e o não-configurado a inventar resposta sobre um webhook que não existe no mundo deles — e **ausente responde `nao_verificavel`, nunca silêncio** |
| **A porta recebe 4 campos, não os 11 do banco** | `WebhookCadastrado` fala a língua da Sicoob; `AvisoDePagamento` responde a única pergunta que a agenda faz. E o `codigoSituacao` **fica de fora**, porque a produção já devolveu **2** onde o exemplo do banco mostrava **3**, com a mesma descrição |
| **Só o tipo 7 (pagamento)** | Webhook de outro tipo pode estar inativo sem efeito nenhum sobre baixa. Gritar por ele é o «vermelho permanente é alarme desligado» do `deploy/README` |

---

## 2. ⚠️ O defeito que eu mesmo introduzi, e a cadência que o denunciou

**A primeira versão pendurou o diagnóstico no caminho COMUM das duas tarefas que
escrevem.** E `financeiro-agenda-fila.timer` é `OnCalendar=*:02/5` — **a cada cinco
minutos**.

Seriam **288 chamadas por dia** à Sicoob, cada uma com handshake mTLS **e pedido de
token novo** — porque o script roda uma vez e sai, então o cache de token morre com
o processo — para observar um estado que muda talvez uma vez por ano.

**A assimetria com o alerta do certificado é o que decide, e ela não é arbitrária:**
o A1 sai nas **duas** porque quebra a **emissão**, que é o trabalho da fila. O aviso
de pagamento não afeta emitir — afeta **baixar**. Alertar a fila sobre ele é avisar
quem não pode fazer nada a respeito, 288 vezes por dia.

**O que prende isso agora:** `AG8k` (a cadência) e `AG8l` (a assimetria). As duas
foram conferidas **por mutação** — reintroduzido o defeito, ficam vermelhas —, que é
a única forma honesta de validar verificação que lê fonte.

⚠️ **E o próprio teste nasceu errado duas vezes, o que vale registrar:** a âncora
`'as que escrevem'` casa **antes**, no comentário do cabeçalho (*"as duas tarefas
que escrevem"*), e jogava a busca inteira para a metade errada do arquivo. A âncora
que vale é a da seção, com os traços.

**Este conserto não precisa de deploy:** os timers rodam `scripts/agenda.ts` direto
do disco (`ExecStart=… node --experimental-strip-types scripts/agenda.ts`), então
ele vale na próxima passada.

---

## 3. A assimetria de papel — um absurdo que só apareceu medindo

A primeira execução contra produção falhou com `PapelInsuficiente`.

**A causa é uma assimetria que ninguém tinha visto:** o usuário de serviço que
**RECEBE** o aviso de pagamento não podia perguntar se o aviso ainda existe. Ele tem
papel `cobranca` — o mínimo que faz `escrever_carteira` passar, escolhido de
propósito em 09/09 para que a notificação não ganhasse escrita de cadastro — e
`conectorAtual()` exige `administrar`.

**O conserto não foi subir o papel dele.** Foi `credencialDeCobranca()`, que exige
**`escrever_carteira`**, pelo argumento da autoridade: *quem já pode registrar e
baixar título naquele banco pode perguntar àquele mesmo banco se o canal de aviso
está vivo* — é estritamente **menos** do que ele já faz, com a mesma contraparte.

- `ler` seria largo demais: daria a referência ao papel `leitura`;
- `administrar` já se mostrou estreito demais;
- e ela devolve **2 campos, não 13** — `conectorAtual` traz agência, conta e número
  do cooperado, que são dado corporativo e não têm por que atravessar um
  diagnóstico de webhook.

---

## 4. O que a tela ganhou

Rota `GET /conector-cobranca/aviso-pagamento`, irmã da do certificado — as duas
respondem a mesma classe de pergunta (*"o que faz o dinheiro andar ainda está de
pé?"*); a diferença é onde mora a resposta: a validade do A1 está no nosso banco, e
esta só existe na Sicoob.

Na tela de Cobrança, uma faixa por nível, **e ela fala de operação e não de
integração**: quando o aviso está morto, o texto diz *«o dinheiro não se perde: a
consulta diária continua dando baixa, o que muda é o atraso»*. Sem essa frase o
alerta parece perda de dinheiro e vira pânico.

⚠️ **A leitura da tela nunca deixa erro subir** — nem os 412, como faz a vizinha.
A Sicoob fora do ar não pode derrubar a tela **que cadastra o conector**, ou a
pessoa ficaria sem conseguir corrigir justamente o que talvez esteja errado. Falha
vira `nao_verificavel`, que é o que ela é.

---

## 5. O CI ficou vermelho, e não foi o nosso código

O push do `cf9164d` derrubou **quatro dos cinco jobs** — e os quatro morrem no
**mesmo passo**, antes de qualquer coisa nossa rodar:

```
E: Failed to fetch https://dl.google.com/linux/chrome-stable/…/Packages.gz  Hash Sum mismatch
##[error]Process completed with exit code 100
```

**É o `apt-get update` do cliente `psql`.** Ele atualiza **todas** as fontes
configuradas na imagem do runner — inclusive a do Google Chrome, que não é nossa e
naquele momento servia um índice corrompido. O job `tipos`, único que não precisa de
psql, passou.

**✅ O re-run passou nos cinco** (`gh run rerun --failed`, run `34386094120`), o que
confirma que era transiente. **E é exatamente por isso que ele merece um parágrafo:**
um vermelho que some sozinho no re-run é o tipo de coisa que ensina a próxima pessoa
a re-rodar sem ler — e no dia em que o vermelho for de verdade, ela vai re-rodar
também.

⚠️ **A fragilidade continua lá, e não é sorte:** são **quatro** `apt-get update` no
`isolamento.yml` (linhas 31, 55, 80 e 177), e **qualquer** fonte de terceiro quebrada
na imagem do runner derruba o nosso CI inteiro — sem que uma linha nossa tenha mudado.
O conserto é pequeno (restringir o update às listas que a gente de fato usa) e
**não foi feito nesta leva**: é a pendência técnica **6**, e a candidata natural da
próxima. Enquanto isso, a leitura certa de um vermelho é **abrir o log antes de
re-rodar** — se os jobs morrem todos no mesmo passo de `apt`, é isto.

**A regra que continua valendo depois de todo push**, e que existe porque um
vermelho já durou 24 horas sem ninguém tropeçar:

```
gh run list --workflow=isolamento --limit 2
```

---

## 6. O que entrou no repositório

| Arquivo | O quê |
|---|---|
| `src/sicoob/porta.ts` | **`AvisoDePagamento`** (4 campos) e `avisoDePagamento?()` opcional na porta |
| `src/sicoob/http.ts` | `CobrancaSicoob.avisoDePagamento` — a mesma leitura na língua da porta, filtrando o tipo 7 |
| `src/dominio/agenda.ts` | **`nivelDoAviso`** — o irmão puro de `nivelDoCertificado`, com os quatro níveis |
| `src/cobranca/agenda.ts` | **§4 novo:** `conferirAvisoDePagamento` e `alertaDoAviso` (as frases num lugar só, porque a tela quer as mesmas palavras) |
| `src/repos/boleto.ts` | **`credencialDeCobranca()`** — o §3 |
| `src/http/rotas.ts` | `GET /conector-cobranca/aviso-pagamento` |
| `web/src/telas/cobranca.tsx` | a faixa por nível, e a leitura que não deixa erro subir |
| `scripts/agenda.ts` | tarefa **`--webhook`** (só lê) e o alerta na consulta — **só nela** (§2) |
| `tests/agenda.ts` | `AG8a`…`AG8l` — 12 verificações, com a exaustão das 62 listas e o par conferido por mutação |
| `tests/sicoob-http.ts` | `WC7b`…`WC7d` — o filtro do tipo 7 e o vocabulário do banco parando na porta |
| `QUESTOES.md` §2.g | as seis decisões, com o porquê de cada uma |

O índice vivo continua sendo `PENDENCIAS.md`; o registro com dono por entrada é
`QUESTOES.md`.

---

## 7. O que foi medido, e o que NÃO foi

| Afirmação | Como se sabe |
|---|---|
| O webhook está vivo | `GET /webhooks` contra a Sicoob de produção: **`id 13407 · ativo · situacao 2`** |
| O diagnóstico funciona como o usuário de serviço | `npm run agenda -- --webhook --auth-user c7cd8e8f-…` → **`nivel ativo`**, rodando com papel `cobranca` |
| A rota existe e está guardada | **`404 → 401`** depois do restart das 16:49:38 |
| A cadência está certa | `AG8k`/`AG8l`, conferidos por mutação |
| A suíte | `EXIT=0`, **2.678** verificações sem banco |

⚠️ **O que NÃO foi medido, e não dá para medir daqui:** o corpo da resposta
**autenticada**. Cunhar um JWT local não funciona — `SUPABASE_JWT_SECRET` não está
na env e o autenticador valida contra o Supabase. O que sobra sem prova é a cola do
handler, três linhas que passam no typecheck sobre uma função já provada contra
produção. **O §0.1 fecha isso em um segundo.**
