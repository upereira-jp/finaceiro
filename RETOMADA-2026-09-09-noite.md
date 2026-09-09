# RETOMADA — Financeiro G3, 09/09/2026 (noite)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-09.md` para efeito de "onde estamos". O corpo dela continua correto; o que venceu é o §0 |
| **O que esta leva fez** | Fechou as três decisões que o §0 anterior mandava decidir, consertou um CI vermelho havia 24h, e **ligou o webhook de liquidação de ponta a ponta** |
| **Suíte** | sem banco: `EXIT=0`, **2.663** verificações (eram 2.619) |
| **CI** | ✅ **verde nos cinco jobs** — o primeiro desde 27/08 (§7) |
| **Repositório** | `main` = **`6426f58`**, `origin/main` junto, árvore limpa, zero arquivos `root:root` |
| **Produção** | ⚠️ **HÁ DERIVA, e ela é nova** — o serviço é de 14:16:09, em `4d74603`. Depois disso entraram **mudanças de `src/sicoob/http.ts`** que o processo não carrega. Ver §0.1 |

> ## A frase de uma linha
>
> **O webhook de liquidação está no ar: o banco validou a URL às 15:18 e o
> `--solicitacoes` mostra, do lado dele, a nossa própria resposta — `200 em 1s`,
> corpo `OK`. Um boleto pago passa a avisar o sistema sozinho.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 Rodar o `deploy-financeiro` — e é a única coisa pendente de operação

O serviço em produção é de **14:16:09, no `4d74603`**. Depois dele entraram
`cadastrarWebhook`, as duas consultas e — o que importa — **o cache de token
chaveado por (credencial, escopos)**, em `src/sicoob/http.ts`.

**Isso não está quebrado hoje e não é urgente:** os scripts carregam o código do
disco, e foi por isso que o cadastro do webhook funcionou com o processo antigo
no ar. O caminho de emissão do serviço continua correto com o cache antigo,
porque ele só pede uma família de escopos. **Mas o disco e o processo divergem
em código do caminho do dinheiro**, que é exatamente a armadilha que já custou um
ciclo em 01/09.

### 0.2 O que continua com o dono, e nada disso é código

1. **`Q-VENC3-01` (b)** — a borda que sobrou, e ela **piorou dois dias** hoje: pelo
   cadastro, dia 1º com competência de junho agora vence **26/06** e não 28/06,
   porque 28/06 é domingo (§1);
2. **`dono_usina`** — adiada por decisão, não resolvida. Não bloqueia faturar nem
   emitir; bloqueia o split na primeira fatura paga (§3);
3. **os 10 endereços** e **o tipo do originador do Rhenan**;
4. **as quatro vermelhas do contador**, que voltam a ser bloqueio quando a F2 começar.

### 0.3 As perguntas ao suporte Sicoob, agora são quatro

As três do `/boletos/movimentacoes` (`PROMPT-suporte-sicoob-2026-09-08.md` §4) e
**uma nova, que o contrato do webhook criou**: *quantas falhas de entrega bastam
para a Sicoob inativar o webhook, e ela avisa antes?* Enquanto não houver resposta,
`PATCH /webhooks/{id}/reativar` fica sem escrever — ver §9.

---

## O roteiro desta leva, em ordem

| § | O quê |
|---|---|
| **1** | O calendário bancário — a `Q-VENC3-01` (a) decidida e construída |
| **2** | O prazo de crédito é D+1, e a decisão inclui **não** escrever código |
| **3** | `dono_usina` adiada, com o custo medido |
| **4–5** | O portão do `psql` virou workflow · push e deploy |
| **7** | O CI estava vermelho havia 24h, e ninguém tinha como ver |
| **8** | O usuário de serviço do webhook existe |
| **9** | Não existe cadastro de webhook «no portal» — e a suposição era nossa |
| **10** | **O webhook está LIGADO**, provado dos dois lados |

---

## 1. O calendário bancário — a decisão que virou código

**A pergunta estava aberta desde 07/09** e era a única das duas bordas da
`Q-VENC3-01` que atinge a carteira inteira. A resposta do dono, em 09/09:
*"antecipar até o dia útil anterior"*.

**A ordem das duas operações é o que importa, e ela não é comutativa:** subtrai-se
os 3 dias corridos primeiro, recua-se depois. Recuar antes deslocaria o ponto de
partida, e a conta dos 3 dias passaria a ser feita contra uma data que a
distribuidora nunca imprimiu.

### As três decisões técnicas dentro dela

Todas tomadas aqui, pela delegação de 08/09, e todas registradas em `QUESTOES.md`
§2.f em vez de escondidas no código:

| Decisão | Por quê, em uma linha |
|---|---|
| **O calendário é NACIONAL** | Quem liquida boleto é o SPB/STR, que roda no calendário nacional. Feriado municipal fecha a agência e não para a compensação — entraria como falso positivo |
| **Quarta-feira de Cinzas NÃO é feriado** | O banco abre ao meio-dia e o título que vence nela é pago nela. É a pegadinha da lista |
| **24/12 e 31/12 são dia útil** | São ponto facultativo de *atendimento*, não feriado. Tratá-los como não-útil anteciparia todo fim de ano sem que ninguém estivesse impedido de pagar |

**A Páscoa é uma função e não uma tabela**, e essa também é decisão: uma lista de
datas coladas venceria em silêncio. No ano seguinte ao último que alguém digitou, o
Carnaval simplesmente deixaria de ser feriado, e nenhum teste saberia.

### O que prova que funciona

`tests/calendario-bancario.ts`, **16 verificações**. As oito Páscoas conferidas
contra datas verificáveis fora deste repositório incluem **2038, a mais tardia que
o calendário gregoriano admite** (25/04). E a varredura de **40 anos** — cerca de
14.600 datas — prende as três invariantes que exemplo escolhido a mão não prova:

- o recuo **sempre** termina num dia útil bancário;
- e **nunca empurra para frente** (a regra do dono é "antes", não "perto");
- e nunca recua mais de 4 dias, que é o pior caso real do calendário nacional.

### Onde ela chegou, e por que tinha de chegar aos dois lugares juntos

`anteciparVencimento` é o único ponto que subtrai, então a mudança alcançou de uma
vez o **boleto** (`vencimentoEscolhido`), o **caminho em lote** (`triar()`) e a
**folha que o cliente recebe** (`nossoVencimento`). Se só o boleto recuasse,
`conferirBoleto` compararia os 44 dígitos contra a data impressa e **acusaria
divergência em toda fatura de borda** — uma acusação que o próprio sistema
fabricaria. O `V4b` prende isso.

**A tela também mudou**, porque a regra é da operação e não do código: a ajuda de
`/unidades`, o «por quê» do campo e o rodapé da aba agora dizem que os três dias
recuam até o dia útil anterior — *nunca* para o seguinte, que encurtaria a folga.

⚠️ **A (a) piorou a (b), e isso está registrado e não escondido.** O exemplo que o
`J4j` prendia — dia 1º pelo cadastro, competência de junho — dava 28/06 e agora dá
**26/06**, porque 28/06 é domingo. Mais fundo dentro da competência. O teste foi
atualizado e continua dizendo que aquele é o comportamento de hoje, sem afirmar que
está certo.

---

## 2. O prazo de crédito é D+1 — e a decisão inclui não escrever código

O dono escolheu seguir com o **padrão da cooperativa** em vez de segurar o assunto
(`D+0`, `D+1` ou `D+2`, ajustável no contrato de cobrança — resposta do Sicoob em
08/09).

**Onde ele NÃO entrou, e não entrar é a decisão:** não virou constante nem coluna,
porque **nada consome o número hoje**. O repasse não espera D+1 — ele espera a
*confirmação* do banco, que é fato observado e não prazo projetado. Uma constante
sem consumidor seria uma segunda fonte de verdade esperando divergir da primeira.
Ela entra quando existir projeção de caixa, e o lugar dela já tem nome.

---

## 3. `dono_usina` foi adiada — o que isso custa, medido

Não é estimativa: **não bloqueia faturar e não bloqueia emitir boleto**. Bloqueia o
**split**, e só quando a primeira fatura for paga.

Enquanto isso, o sistema já não deixa a espera invisível — e isso não é novo desta
leva, é o que torna o adiamento defensável:

- `triarRegistro` emite o alerta `usina_sem_dono` em **toda** fatura da usina;
- a camada `dono_da_usina` da prontidão mede **4 de 4** com efeito `bloqueia_split`;
- a fila de repasse pendente tem tela desde 08/09, e ela **separa** *"sem dono"*
  (trabalho de alguém) de *"aguardando o banco"* (trabalho de ninguém).

**Não falta código:** `/donos` cadastra e `/usinas` vincula. Falta o dado, e ele só
existe fora do sistema — o CRM traz `dono_lead_nome` NULL nas quatro.

---

## 4. O portão do webhook virou botão

A `RETOMADA-2026-09-09` §1 nomeou dois portões que *"não têm como ser medidos desta
sessão"*. O primeiro deixou de exigir terminal.

**`provisionar-cobranca`** (workflow novo, molde do `migrate-financeiro`): a
credencial não desce para a VPS, o `auth_user_id` é **derivado por UUIDv5 e nunca
digitado**, a identidade do banco alvo é conferida antes de qualquer escrita, o
**ensaio roda sempre** — inclusive quando se pediu para valer, porque ele custa um
segundo e é o que mostra o que seria feito — e o job **fica vermelho** se o papel
gravado não for `cobranca`, que é o mínimo que faz `escrever_carteira` passar.

Sem isso, a rota do webhook responde `503 ServicoDeCobrancaNaoProvisionado`: a
notificação chega e não há quem assine a trilha da baixa.

**O segundo portão continua humano e não tem automação possível** — a URL no Portal
Developers, cujas páginas são SPA. O resumo do run a imprime pronta:

```
https://financeiro.blackhaus.io/api/liquidacoes/webhook-sicoob/eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d
```

---

## 5. O que falta fazer, e é operação — não decisão

**✅ O push e o deploy saíram** — o serviço subiu 09/09 14:16:09 em `4d74603`, `GET /`
responde 200 e o bundle servido já carrega a regra do calendário na tela.
⚠️ **E um segundo deploy ficou devendo**, porque o resto da leva veio depois dele:
ver §0.1.

**✅ O `provisionar-cobranca` rodou nos dois modos, e o usuário de serviço EXISTE.**
Ver §8.

⚠️ **E o passo que sobrava não era humano — era código que faltava.** Ver §9.

---

## 6. O que entrou no repositório

| Arquivo | O quê |
|---|---|
| `src/dominio/calendario-bancario.ts` | **novo.** Páscoa por algoritmo (Meeus/Jones/Butcher, 1583–4099), os 12–13 feriados bancários nacionais do ano, `ehDiaUtilBancario` e `recuarParaDiaUtil`. Memorizado por ano |
| `src/dominio/faturamento.ts` | `anteciparVencimento` subtrai **e depois recua**. O recuo vale também com `dias = 0`: o vencimento do nosso título é sempre um dia útil, qualquer que seja o prazo |
| `tests/calendario-bancario.ts` | **novo.** `CAL1`…`CAL6`, 16 verificações, com a varredura de 40 anos |
| `tests/fatura-do-registro.ts` | `J4a`, `J4f` e `J4j` remedidos; **`J4k` novo** — os 336 vencimentos possíveis de 2026, nenhum em dia não-útil e nenhum empurrado |
| `tests/folha-unificada.ts` | `V4` remedido e **`V4b` novo**: a data da Equatorial continua impressa ao lado, intacta — o recuo é nosso, não dela |
| `web/src/ajuda.ts` · `web/src/porques.ts` · `web/src/telas/unidades.tsx` | a regra na tela de quem opera |
| `.github/workflows/provisionar-cobranca.yml` | **novo.** O §4 |
| `QUESTOES.md` §2.f · `PENDENCIAS.md` | o registro |

Onde parou é aqui; o índice vivo é `PENDENCIAS.md`; o registro com dono por entrada é
`QUESTOES.md`.

---

## 7. O CI estava vermelho havia 24 horas, e ninguém tinha como ver

**O push desta leva expôs o que já estava lá.** O workflow `isolamento` falhava desde
08/09 às 22:45 — e falhou de novo em 12:44 e em 14:14, sempre no **mesmo** job
(`repositorios`), sempre na **mesma** linha. Os outros quatro jobs estavam verdes.

**O defeito era do teste, não do código, e ele é instrutivo.** Em 08/09 a
`Q-BAIXAOPER-01` moveu o split de `baixar()` para `confirmarLiquidacao()`. O `K7a0`
foi escrito no mesmo commit e **afirma** que `r.split` é nulo depois da baixa por
webhook. Trinta linhas abaixo, o `K7h` continuou lendo `r.split!.contas_a_pagar` — e
o `!` calou o compilador exatamente sobre o campo que o teste vizinho garante ser
nulo. `TypeError: Cannot read properties of null`, em produção do CI, todo push.

O conserto é uma palavra: o número sai da **confirmação**, que é quem reparte agora.
**Conferido no Actions e não deduzido:** run `34363949451`, os cinco jobs verdes —
`repositorios`, `tipos`, `middleware`, `migrations-rls-rbac-e-seed` e
`vazamento-no-pool`.

⚠️ **Por que isso durou um dia inteiro sem ninguém tropeçar:** `test:repos` **não roda
nesta VPS** (exige PostgreSQL local) e não roda no `npm test` daqui. O único lugar do
mundo onde essa suíte executa é o Actions — então o vermelho existia num painel que
ninguém abre depois de um push que "passou" localmente. É o mesmo modo de falha que o
próprio `tests/run.sh` documenta duas vezes (*"em pipeline o status de saída é do
grep"*), na camada de fora: **verde local não é verde**, quando a suíte que importa
mora noutro lugar.

**A conferência que passa a valer depois de todo push**, porque o `gh` está instalado
e autenticado nesta máquina:

```
gh run list --workflow=isolamento --limit 2
```

---

## 8. O usuário de serviço existe — o `503` deixou de ser o portão

**Ensaio primeiro** (run `34364701262`) e **valendo depois** (run `34365052533`), os
dois verdes, com o `APLICAR` pulado no primeiro e o `COMMIT` no segundo.

| | |
|---|---|
| `tenant` | `eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d` |
| `auth_user_id` | `c7cd8e8f-886e-5345-99ca-28b156f8cc4a` — **derivado por UUIDv5**, nunca digitado |
| `usuario_id` | `ce404d8b-5e56-4e3c-8cb4-055f587f6876` |
| papel | `cobranca` — o **mínimo** que faz `escrever_carteira` passar |
| desfecho | `== COMMIT. O usuario de servico existe e o webhook tem quem assinar a trilha. ==` |

**A verificação que vale não é a linha ter entrado, e o SQL faz a certa:**
`app.resolver_login` devolveu `tenant_id` + `papel` dentro da mesma transação — e é
exatamente essa função que a rota do webhook chama. `admin` passaria em tudo e daria
ao webhook escrita de cadastro que ele nunca deve ter; o job fica **vermelho** se o
papel gravado não for `cobranca`.

⚠️ **O `usuario_id` do ensaio (`957d7f92-…`) NÃO é o que ficou, e isso é esperado:**
o ensaio deu ROLLBACK, então aquele uuid nunca existiu. O que é estável entre as duas
passagens é o `auth_user_id`, porque ele é derivado do tenant e não sorteado. Quem
comparar os dois logs vai ver a diferença — ela não é divergência.

**E o portão de origem continua bom depois do restart**, remedido agora contra a
produção: `npm run origem-webhook` → **`VEREDITO: ACEITA`**, as nove faixas `PASSA` e
os quatro controles negativos recusados, `EXIT=0`.

**Dos três portões do webhook, dois estão abertos e o terceiro é humano:** a URL no
Portal Developers. Nenhum workflow tem como saber se ela foi cadastrada — as páginas
do portal são SPA. Depois dela, a primeira notificação real é o que fecha o caminho.

---

## 9. Não existe cadastro de webhook «no portal» — e a suposição era nossa

**O dono abriu o aplicativo do Portal Developers e conferiu campo a campo.** A
página tem: dados do cooperado, descrição, `client_id`, o token endpoint e os
escopos das quatro APIs contratadas. **E nada mais.** Não há configuração de
webhook em lugar nenhum.

**A frase que estava errada estava escrita em dois lugares nossos** — em
`src/sicoob/http.ts` e na `Q-WEBHOOK-CADASTRO-01`: *"o cadastro é feito no
portal, à mão"*. Era suposição herdada de material público, escrita em 28/08 e
nunca medida. A `ADR-0006` §61 até registrava o inverso como ação pendente
(*"abrir a aplicação no portal e ver o que a configuração de webhook oferece"*) —
e ninguém tinha aberto.

**Então `POST /webhooks` não é uma alternativa mais elegante: é o único caminho.**
Ou ele existe, ou o banco nunca notifica, e o dinheiro entra na conta sem o
sistema saber.

### O que entrou

O contrato veio do Swagger do próprio endpoint, colado pelo dono — as páginas do
portal são SPA e não vêm por `WebFetch`, e é o mesmo caminho que corrigiu cinco
defeitos do `POST /boletos` em 28/08.

| Arquivo | O quê |
|---|---|
| `src/sicoob/http.ts` | `cadastrarWebhook` · `ESCOPOS_DE_WEBHOOK` · `ehUrlDeWebhook` · o cache de token chaveado por **(credencial, escopos)** |
| `src/sicoob/webhook.ts` | `urlDoWebhook(tenant)` — o endereço deixou de ser literal repetido em script |
| `scripts/cadastrar-webhook.ts` | `npm run webhook-sicoob`, **ensaio por padrão** |
| `tests/sicoob-http.ts` | `W1`…`W10`, 12 verificações |

### A decisão que contraria o que o próprio código planejava

O comentário de `ESCOPOS` dizia que, construído o cadastro, *"os dois primeiros
entram aqui junto com ele"*. **Não entraram, e o princípio que ele mesmo invoca é
a razão:** somar `webhooks_*` a `ESCOPOS` faria **todo** token de emissão de
boleto carregar permissão de trocar a URL de notificação — e trocar essa URL é
desviar o aviso de que o dinheiro entrou. Cadastro de webhook é ato
administrativo, roda uma vez por ambiente; emissão roda todo mês por processo
exposto. Dar a permissão rara ao caminho frequente é exatamente o que "escopo a
mais é dano a mais" existe para impedir.

**O custo disso foi o cache**, e ele é o achado da entrega: `tokens` era chaveado
só por `credencial_ref`. Um token pedido com `webhooks_inclusao` ficaria guardado
sob a mesma chave do token de emissão, e a **próxima emissão usaria um token sem
`boletos_inclusao`** — 403 no caminho do dinheiro, causado por um script
administrativo que rodou minutos antes. A chave passou a ser
**(credencial, escopos)**, e o `W5` prende isso.

### O que ele recusa antes de discar

`https` e porta 443 são exigência publicada do banco, e o e-mail é obrigatório
sem default. As três recusas saem **422 sem nenhuma chamada** (`W6a`…`W7`) — a
Sicoob aceitaria o cadastro e **reprovaria a URL depois**, na validação, e a
reprovação aparece no portal, dias depois e por outro canal.

⚠️ **Este cadastro não tem inverso conhecido hoje:** cadastrar duas vezes cria
dois webhooks e o banco notifica em dobro. Por isso o padrão é ensaio.

### O que falta, e é contrato que não temos

Dos seis endpoints da família, dois valem construir e nenhum é bloqueio:

- **`GET /webhooks`** — conferir se já existe um **antes** de criar o segundo, e
  recuperar o `idWebhook` de quem não anotou. Transforma o aviso acima em guarda;
- **`GET /webhooks/{id}/solicitacoes`** — o diagnóstico do dia em que uma
  liquidação não chegar (`codigoSolicitacaoSituacao` **3** = enviado com sucesso ·
  **6** = erro no envio).

`PATCH`, `DELETE` e `reativar` não estão no caminho da primeira notificação.

### ✅ Os dois foram construídos no mesmo dia — e um deles trouxe um modo de falha novo

O dono colou os dois contratos. Entraram `consultarWebhooks` e
`solicitacoesDoWebhook`, com escopo próprio (`webhooks_consulta` — ler quais
existem não precisa poder criar um), e o script virou três modos, com a
**consulta como padrão** por ser a única ação que não muda nada.

**A guarda existe agora:** `--cadastrar` consulta antes e **recusa** quando já há
webhook ativo do tipo 7. O aviso em maiúsculas virou código.

⚠️ **E o contrato do `GET /webhooks` respondeu uma pergunta que eu ia mandar ao
suporte.** O modelo traz `dataHoraInativacao` e `descricaoMotivoInativacao`, e o
exemplo do próprio banco preenche o segundo com **«Erro ao enviar notificação»**.
Ou seja: **a Sicoob INATIVA o webhook quando a entrega falha.** Isso não é
detalhe de campo — é um modo de falha inteiro que o projeto não conhecia, e ele é
silencioso do nosso lado: um webhook inativo não avisa, e "nenhuma notificação" é
indistinguível de "ninguém pagou". Por isso a consulta grita `☠️ INATIVO` com o
motivo e a data.

**Medido contra a Sicoob de produção**, e é a primeira chamada de leitura desta
família: `GET /webhooks` respondeu — **nenhum webhook cadastrado**. Prova junto
que `webhooks_consulta` é concedido de verdade, e não só anunciado.

**Uma recusa deliberada:** «ativo» **não** se deriva de `codigoSituacao`. O
contrato nomeia um código (3 = «Validado com sucesso») e não explica os outros;
derivar de um enum conhecido pela metade poria uma afirmação inventada dentro da
única ferramenta de diagnóstico do webhook. O que decide é o carimbo de
inativação, e o código cru viaja junto em toda leitura.

---

## 10. O webhook está LIGADO — e a prova veio dos dois lados

**Cadastrado em 09/09/2026, 15:18.** `idWebhook = 13407`, tipo 7, e-mail
`leal@g3solar.com.br`.

| Lado | O que disse |
|---|---|
| **Nosso** (nginx) | `177.53.249.36 - POST /api/liquidacoes/webhook-sicoob/eac198c0-… 200` às 15:19:01 — e `177.53.249.0/24` é o **primeiro** dos nove blocos da lista que chegou de manhã |
| **Do banco** (`--solicitacoes`) | `✅ VALIDACAO DA URL — Enviado com sucesso · 15:18:59` · `-> 200 em 1s` · **`nossa resposta: OK`** |
| **Situação hoje** | `✅ ativo · id 13407 · situacao 2 (Validado com sucesso)` |

**Os três portões estão abertos**, e cada um foi fechado por uma leva diferente:
a faixa de IP mais a flag `WEBHOOK_MTLS_VIA_PROXY` (de manhã), o usuário de
serviço (§8) e o cadastro da URL (agora).

### ⚠️ O `codigoSituacao` voltou 2, e o Swagger dizia 3

O exemplo do contrato mostra `codigoSituacao: 3` com a descrição *"Validado com
sucesso"*. **A produção devolveu `2` com a MESMA descrição.**

**Isso valida a recusa deliberada de algumas horas antes:** eu tinha decidido não
derivar «ativo» de `codigoSituacao`, porque o contrato nomeia um código e não
explica os outros. Se tivesse gravado `codigoSituacao === 3` como "validado" — que
é exatamente o que o exemplo do banco sugeria —, **este webhook, funcionando,
apareceria como não validado**, e alguém iria caçar defeito num caminho que está
certo. O que decide continua sendo o carimbo de inativação, e o código cru viaja
junto para quem quiser olhar.

É a mesma lição da `Q-ESCOPO-V3-01`, na terceira vez: **o exemplo da
documentação não é o comportamento.** Anunciar não é conceder; ilustrar não é
especificar.

### Medido de passagem, e vale registrar

`GET /webhooks` **não devolve o e-mail** que foi enviado no cadastro (sai vazio).
Não é bloqueio e não muda nada — mas quem for conferir o endereço cadastrado não
consegue por aqui.

### O que isso destrava

A partir de agora, **um boleto pago avisa o sistema sozinho**. O caminho do
dinheiro está completo até a baixa: notificação → guarda de origem → usuário de
serviço → `traduzirEvento` → `liquidacao.baixar()` — que **não reparte**, porque o
webhook é intenção de pagamento; quem confirma é a consulta ativa lendo
`liquidado` (`Q-BAIXAOPER-01`).

**O que ainda impede o primeiro boleto de existir não mudou:** a conta lida da
competência e a geração. Nada disso é webhook.
