# RESUMO-SESSAO-16 — 30/07/2026, tarde

| Campo | Valor |
|---|---|
| **Foco** | Construir o que **não dependia de decisão de ninguém** — a agenda de cobrança, o importador de tarifas e o mecanismo que faltava à regra 11 — e, no meio disso, atender o dono usando o sistema **pela primeira vez** |
| **Método** | O de sempre até as 15h: medir antes de construir. Depois disso o método mudou sozinho — **quatro dos seis defeitos da sessão vieram de uma pessoa abrindo a tela**, não de auditoria, não de teste, não de spec |
| **Resultado** | 3 questões fechadas · **136 verificações novas** em 9 suítes (854 → 990) · **6 defeitos do código existente**, 4 deles em produção · 1 migration aplicada em produção · 2 renomes do dono aplicados |
| **Não feito** | **Nenhuma fatura foi gerada, e não é por falta de código.** A §5 mede exatamente o que falta e em que ordem |

> # ESTADO ATUAL — 30/07/2026, fim da sessão 16
>
> | | |
> |---|---|
> | **No ar** | `https://financeiro.blackhaus.io` — bundle `index-BPNacouw.js` publicado. **Falta publicar `3fd7b22`** (o conserto da sessão expirada), bundle `index-CTi2cd4A.js` |
> | **Banco** | **21 migrations**, a 21ª aplicada em produção nesta sessão. Catálogo **9/9** contra produção |
> | **Suíte** | `EXIT=0`, **990** linhas `ok` — contadas na fonte e conferidas contra o delta, diferença zero |
> | **O que segura a primeira fatura** | continua sendo insumo humano, e a §5 nomeia os quatro em ordem |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **`data_vencimento` das 39 UCs** | 🔴 **destravável hoje** | Vinicius — ver §5.2 |
> | **CPF/CNPJ dos dois originadores** | **insumo** | Vinicius + operação |
> | `contrato_ativo` — 0 de 39 | 🔴 | Vinicius + operação |
> | **geração de 2026-07 só existe para 1 das 4 usinas** | 🟡 **novo, medido** | operação |
> | **nenhuma usina tem dono, e não há `regra_repasse`** | 🟡 **novo, medido** | Vinicius |
> | `Q-CRMCODIGO-01` — reconferir o mapa antes de digitar | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` · `Q-WEBHOOK-01` · `Q-SICOOB-01` | 🔴 | Vinicius |
> | ~~`Q-AGENDA-01`~~ · ~~`Q-TARIFA-CONC-01`~~ · ~~`Q-SPEC001-08`~~ | ✅ | fechadas hoje |

---

## 1. O que foi construído, e por que essas três

A fila de 30/07 de manhã tinha quatro itens marcados como *"dá para construir sem esperar ninguém"*. Foram os quatro.

**`Q-AGENDA-01` — os dois processos periódicos do `PRD` §6.** Não existia nenhum: varredura de `src/` e `scripts/` não achava `cron`, `setInterval` nem agendador, e `boleto.tentativas`/`ultimo_erro` existiam desde a migration 16 **sem nada que as consumisse**. A coluna contava uma tentativa que nada refazia.

Duas decisões que ficam registradas como decisões:

- **A fila não desiste sozinha.** Não há teto de tentativas; o teto é do **intervalo**. Um boleto que sai da fila por contagem para de ser cobrado sem que ninguém tenha decidido parar — e do ponto de vista do sistema a fila fica limpa. Era a falha silenciosa que a agenda existe para fechar, cometida pela agenda.
- **Não há agendador no código.** O `PRD` §3 lista Vercel-com-cron contra VPS-com-PM2 numa tabela de trade-off **sem decidir**. Escolher por quem decide seria improviso (regra 10), então o script roda uma vez e sai; quem o chama é o host.

E `agenda_execucao` existe porque **o modo de falha de um processo periódico é a ausência de execução** — que não produz erro, nem log, nem linha. Sem a tabela, *"a consulta ativa parou no dia 3"* não é uma pergunta que alguém consiga fazer.

**`Q-TARIFA-CONC-01` — o importador.** Havia coluna e havia rota, e a rota pede o **id da fatura**, que ninguém tem na mão. *"Por planilha"* (`PRD` §5.1) significava, na prática, abrir uma fatura por vez na tela. O modo de falha perseguido não é o arquivo ilegível — esse aparece — e sim **o arquivo que lê certo o número errado**: `"1.234"` é R$ 1.234,00 ou R$ 1,23, e as duas leituras produzem uma fatura plausível. Por isso o ensaio imprime a **interpretação** ao lado do texto original.

**`Q-CLAUDE11-01` — a opção (b).** A regra 11 afirma que *"o Prisma já exclui parcial das chaves de `findUnique`"*, e isso deixou de ser verdade em 27/07. Agora há invariante dos dois lados: `CAT-9` no banco (todo único parcial tem predicado `IS NOT NULL`) e `tests/regra11.ts` no código, com a lista saindo do próprio `schema.prisma`. O critério é o **par (modelo, chave)** — `tenant_id_documento` é parcial em `cliente` e **cheia** em `originador`, que a usa legitimamente. Um teste por nome de chave acusaria os dois usos certos, e teste que acusa errado treina o time a ignorá-lo.

---

## 2. Os seis defeitos, e de onde cada um veio

Nenhum foi encontrado por auditoria. Três apareceram ao construir em volta do código; **quatro apareceram com o dono usando o sistema** — e esses são de outra natureza.

| # | O defeito | Como apareceu |
|:--:|---|---|
| 1 | **`CicloJaEmAndamento` nunca era lançada.** No Prisma 7.9 sobre driver adapter o SQLSTATE mora em `meta.driverAdapterError.cause.code`; `e.code` é `P2039`. A condição do conector não alcançava nenhuma das duas — *"o segundo ciclo não inicia"* (`SPEC-002` §7) chegaria como **500** | o EXCLUDE da agenda tem a mesma forma, e o teste `N7a` acusou |
| 2 | **Um comentário do repositório citava medição que não reproduz.** `web/src/dinheiro.ts` afirmava desde 29/07 que `Number('1234,56'.replace(',','.')) * 100` dá `123455.99999999999` — dá **123456 exato**; e `Number('8,15')` é **`NaN`** | copiei a citação para o meu teste e ele ficou vermelho |
| 3 | **A migration nova dispensava o gatilho de auditoria** citando a migration 14 — cuja conclusão a **15 reverteu**: *"o custo de obedecer é uma linha; o custo de afrouxar é o precedente"* | o teste `G2` |
| 4 | **O deploy não rodava `prisma generate`**, e `src/generated/` é gitignored: a aba Documento quebrou em produção com `undefined.findFirst()` | **o dono, abrindo a tela** |
| 5 | **O próprio conserto quebrou:** `prisma.config.ts` exigia `DIRECT_URL` na carga do arquivo, e o `.env` do VPS não tem | **o dono, colando o comando** |
| 6 | **O 401 não ia para o log, e a sessão vencida não derrubava para o login** | **o dono: *"está destruindo a UX"*** |

### 2.1 A lição do nº 4, e ela é maior que o defeito

O deploy das 11:50 foi conferido dos dois lados e deu **tudo verde**: `index.html` certo, bytes dos assets iguais, rotas novas em `401 TokenInvalido`.

**Mas 401 prova que a rota existe e recusa credencial — ela nem chega ao banco.** As três rotas do documento estavam quebradas atrás daquele 401, e a conferência que parecia rigorosa não tocava a camada onde estava o defeito.

Consertado com **guarda de arranque**, não com passo no procedimento: `iniciar()` compara as tabelas de `public` com os modelos do client e **recusa subir**, nomeando as que faltam e imprimindo o comando. Mesma forma da guarda que já recusa role com `BYPASSRLS`. Um passo a mais dependeria de alguém lembrar, e a regra 11 já disse o que acha disso.

**Consequência operacional que precisa estar escrita:** a partir daqui, `git pull` + `restart` **sem** `prisma generate` derruba o site em vez de quebrar uma tela. É a troca deliberada — falhar alto no arranque é barulhento e o conserto é um comando; falhar baixo é o que aconteceu hoje.

### 2.2 O nº 6 é o único que não era invisível — era *ignorado*

`ErroDaApi.ehDeSessao` existia desde que a camada de API foi escrita, com o comentário *"401 e 403 pedem ação diferente de 422: reautenticar contra corrigir o dado"*. **Ninguém o chamava.**

O 401 descia como erro comum até `useDados`, e cada painel pintava `Credencial inválida.` — a mesma frase seis vezes numa tela de seis blocos, nenhuma dizendo o que fazer. E o estado **não tinha saída pela tela**: a sessão vencida vive no `localStorage`, então o `Ctrl+Shift+R` a lê de volta e o erro volta igual.

Havia um getter com a intenção certa e nenhuma ligação. É a mesma classe do `motivo` do 401, montado *"para o log"* e nunca logado, e da coluna `tentativas`, incrementada e nunca consumida: **peça pronta que ninguém plugou.** Três na mesma sessão, e vale como padrão a procurar.

---

## 3. Os dois renomes, e a linha que não foi cruzada

Decisão do dono, na primeira meia hora com o sistema aberto.

**"Prontidão" → "Pendências".** Rótulo e rota (`/pendencias`). O **domínio não mudou**: `src/repos/prontidao.ts` e as dez camadas seguem com o nome antigo, porque ali "prontidão" nomeia um **cálculo** — *o quanto esta competência está pronta* — e não um item de lista. O `/prontidao` antigo continua levando ao lugar certo, por consequência do `telaDoCaminho` e não de um redirecionamento escrito à mão — e isso virou verificação (`I4j`).

**"Competência" → "Mês de referência", só no rótulo.** Banco, rotas, tipos e a `PAUTA-contador` mantêm `competencia`, que é o **termo contábil** — é o que o contador usa, e a resposta 1 dele diz *"a competência governa a receita"*. Trocar em tudo exigiria migration e reescreveria um documento respondido.

O custo aceito é um termo na tela e outro no código. O que **não** se aceitou foi a frase de ajuda copiada em cinco telas: ela é um componente único (`AjudaDoMes`), porque o argumento contra o rename total foi justamente **não ter dois vocabulários divergindo** — e texto copiado diverge na primeira vez que alguém o ajusta.

---

## 4. O QR passou a ser testável, e o motivo é constrangedor

Produção tem **0 faturas**. A Prévia do documento precisa de uma, então **o único teste que nenhuma das 990 verificações substitui — ler o QR com uma câmera — estava atrás de três bloqueios que dependem de insumo humano que não chegou.**

A coisa mais barata de conferir era a que menos podia ser conferida.

A aba Documento ganhou **"Conferir o QR com a câmera"**: desenha a partir da chave Pix do tenant e de um valor digitado, sem fatura e sem gravar nada. Chama a **mesma** função pura que a fatura chama — um QR desenhado por caminho paralelo não provaria nada sobre o de verdade, e a verificação `W7c` prende isso comparando recebedor e cidade com a linha real do banco.

O aviso de que a chave é real viaja **no payload**, não só na tela: o CRM consome a mesma API.

---

## 5. O caminho para a primeira fatura, medido contra produção

Esta seção existe porque o pedido do dono ao fim da sessão foi *"quero resolver as pendências como contratos e vencimento de UC, para poder gerar as faturas"*.

### 5.1 O que produção tem hoje

| | |
|---|--:|
| clientes | 84 |
| UCs, todas com rateio definido | 39 |
| usinas | 4 |
| tarifa vigente (Equatorial, R$ 1,13/kWh, vigência aberta) | 1 |
| regras de comissão vigentes (5 tipos) | 10 |
| **contratos** | **0** |
| **originadores** | **0** |
| **UCs com `data_vencimento`** | **0** |
| **donos de usina** | **0** |
| **`regra_repasse` vigentes** | **0** |
| **identidade de cobrança** | **0** |

### 5.2 A `Q-SPEC001-02` é menor do que parece — e isso foi medido no código

A questão está registrada como *"quem preenche `data_vencimento`, por UC ou por contrato?"*, o que soa como decisão de modelagem. **Não é.** Lendo `src/dominio/faturamento.ts`:

```
if (!l.data_vencimento) return recusa('sem_vencimento');
...
vencimento: vencimentoDaFatura(c, l.data_vencimento.getUTCDate())
```

O sistema usa **apenas o dia do mês**, e o campo existe **só na UC** — não há equivalente no contrato. Então não há duas opções: é por UC, e a única informação que falta é **em que dia do mês cada UC vence**. `vencimentoDaFatura` põe esse dia no mês seguinte ao da competência, e trata mês curto.

Se o dia for o mesmo para todas, é um `UPDATE` só. Se variar por cliente, é uma coluna de planilha.

### 5.3 A ordem das recusas decide a ordem do trabalho

A triagem recusa **na ordem em que está escrita**, e só mostra o primeiro motivo:

```
1. sem_contrato_vigente     <- as 39 param aqui hoje
2. ja_faturada
3. sem_rateio
4. sem_geracao_lancada
5. sem_vencimento
```

**Consequência prática:** preencher `data_vencimento` hoje **não muda uma linha do resultado** — as 39 continuam parando na primeira recusa. E, ao contrário, digitar os 39 contratos sem a data faz todas caírem na quinta, e o trabalho volta para as 39 UCs.

### 5.4 E há um bloqueio que ninguém tinha nomeado: a geração

Medido por usina, sem o join que multiplicava:

| usina | UCs | rateio alocado | competências com geração | última |
|---|--:|--:|--:|---|
| `0001` | 20 | 94,28% | 1 | **2026-06** |
| `0002` | 14 | 91,20% | 7 | **2026-07** |
| `0003` | 1 | 100,00% | **0** | — |
| `04` | 4 | 21,00% | **0** | — |

**Em 2026-07 só 14 das 39 UCs teriam geração** — as da usina `0002`. As 20 da `0001` param em 2026-06, e as 5 de `0003` e `04` não têm geração nenhuma.

**A competência mais completa é 2026-06, com 34 UCs.** Faturar 2026-07 antes de lançar a geração da `0001` produziria um lote de 14 e 25 recusas — o que não é defeito, é o sistema recusando emitir receita sobre energia que ninguém registrou ter sido gerada (`PAUTA-contador` 9a).

### 5.5 A ordem que destrava, e o que cada passo custa

| # | O quê | Depende de | Por que nesta ordem |
|:--:|---|---|---|
| 1 | **Identidade de cobrança** (chave Pix, recebedor, cidade) | **só do dono** | destrava o teste do QR **hoje**, e é configuração real que o documento vai usar |
| 2 | **Decidir o dia de vencimento** e preencher as 39 UCs | ver §5.2 — é o dia, não o modelo | fazer isto **depois** dos contratos obriga a voltar nas 39 |
| 3 | **CPF/CNPJ de Renata e Out Sales** + natureza pf/pj | operação | destrava `npm run originadores` |
| 4 | **Reconferir o mapa de atribuição** | consulta na `Q-CRMCODIGO-01` | o CRM se moveu duas vezes em quatro dias |
| 5 | **Digitar os contratos** | 3 e 4 | **R20-b congela o tier no rascunho e não há edição** — digitar com o mapa errado paga a pessoa errada, sem erro e sem log |
| 6 | **Lançar a geração** da `0001`, `0003` e `04` na competência escolhida | operação | sem ela a UC é recusa contada, não fatura |
| 7 | **Compor e emitir** | 1–6 | aí o caminho do dinheiro passa a ter o que testar |
| 8 | **Dono de usina + `regra_repasse`** | Vinicius | **não bloqueia a fatura**, bloqueia o *repasse*: a baixa vale, o dinheiro entra, e o split fica pendente (R12) |

O passo 8 merece a distinção: ele **não** impede faturar. Impede repartir. A baixa entra, a fatura fica paga, e o repasse ao dono fica registrado como pendente com o motivo — porque recusar a entrada de dinheiro por falta de um cadastro deixaria o cliente pagante sem título baixado por um problema que não é dele.

---

## 6. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Citei a migration 14 como precedente para dispensar auditoria** — e ela foi *revertida* pela 15 | teste `G2` | Citar uma decisão pelo que ela **tentou** e não pelo que **concluiu** é a mesma classe da citação inventada da sessão 14 |
| **Copiei uma medição do repositório em vez de medir** — os dois exemplos de float de `dinheiro.ts` não reproduzem | meu próprio teste ficou vermelho | Varredura própria no lugar: 131.256 de 1.000.000, e `Math.round` salva todos. A conclusão honesta virou *certo hoje, e certo por sorte* |
| **Escrevi o `ROTEIRO-REVISAO.md` sem medir produção** — ele mandava compor um lote num sistema com 0 contratos, e o teste do QR era inalcançável | o dono tentou seguir e travou na parte 4 | Roteiro reescrito abrindo com o estado medido |
| **Duas suítes anunciavam total literal**, uma delas já errada | contei | Passaram a contar. O `README` já dizia o método e as suítes não seguiam |
| **Uma consulta minha se multiplicou pelo join** e deu 123 UCs onde há 39 | o total não fechou | Refeita antes de qualquer número entrar neste documento — e é a razão de a §5.4 existir com os números certos |
| **Não deixei claro que nada estava commitado** | o dono esperou o deploy chegar e ele não chegou | Estava no rodapé da mensagem; devia estar no alto |

---

## 7. O que muda para quem opera amanhã

1. **A tela chama-se Pendências**, e o campo de mês chama-se **Mês de referência**, com a explicação embaixo;
2. **sessão vencida agora leva ao login** com a frase escrita, em vez de pintar erro em cada painel. Se acontecer, é só entrar de novo;
3. **o QR já pode ser conferido com a câmera** pela aba Documento, sem esperar fatura — depois de cadastrar a chave Pix;
4. **deploy tem dois passos novos e a ordem importa**: `migrate deploy` → `generate` → `web:build` → `restart`. Sem o `generate`, o servidor agora **recusa subir**;
5. **a agenda existe e não roda sozinha** — não há agendador escolhido. Enquanto não houver A1, as duas tarefas recusam com `503` nomeado, que é o comportamento certo;
6. **a competência mais completa para a primeira fatura é 2026-06, com 34 UCs** — e não a corrente.
