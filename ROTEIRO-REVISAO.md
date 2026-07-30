# Roteiro de revisão funcional — Financeiro G3

| Campo | Valor |
|---|---|
| **Para quem** | Vinicius, com o sistema aberto no navegador e um celular na mão |
| **Data** | 30/07/2026 |
| **Por que existe** | Todo o resto deste repositório é medição por comando. **Nenhuma tela deste sistema foi aberta por uma pessoa** e **o QR nunca foi lido por uma câmera** — está dito no `RESUMO-SESSAO-15.md` §7 e nenhuma das 964 verificações substitui isso |
| **Quanto tempo** | ~40 min para o caminho inteiro; a **parte 5 (QR) leva 2 min e é a mais importante** |

> ## ⚠️ Leia antes: produção está vazia, e uma parte dela está quebrada
>
> **Este roteiro foi escrito antes de alguém abrir o sistema, e a primeira tentativa encontrou duas coisas que ele não previa.** Corrigido em 30/07, à tarde, com produção medida:
>
> ### (a) A aba Documento está quebrada agora — conserto de uma linha
>
> `Cannot read properties of undefined (reading 'findFirst')`. O deploy das 11:50 aplicou as migrations 19 e 20 mas **não regenerou o client do Prisma**, então o servidor não conhece as tabelas do documento.
>
> **Cole isto no VPS** — o `DIRECT_URL` de mentira é de propósito, ver abaixo:
>
> ```bash
> cd /opt/financeiro/app
> sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH \
>   DIRECT_URL="postgresql://nao-conecta:nao-conecta@invalido.local:1/nao-disca" \
>   npx prisma generate
> sudo systemctl restart financeiro
> ```
>
> **Por que a URL falsa.** A primeira tentativa deste comando falhou com `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL` — o `.env` do servidor tem `DATABASE_URL` e não tem `DIRECT_URL`, e nunca precisou ter: as migrations sempre foram aplicadas de fora. O nosso `prisma.config.ts` exigia a variável **na carga do arquivo**, antes de o Prisma saber que o comando pedido nem discaria.
>
> **`prisma generate` não conecta a banco nenhum** — medido: roda em 711 ms com a URL apontando para uma porta morta. Ele lê o `schema.prisma` e escreve arquivos. Então a URL falsa é segura, e a exigência é que era o defeito.
>
> **Já consertado no repositório** (ainda não no VPS): `generate` passa a rodar sem `DIRECT_URL`, e `migrate deploy` e `db pull` continuam exigindo — agora com mensagem que diz a porta certa, a errada e o porquê. Suíte `tests/prisma-config.ts`, que roda o CLI de verdade com um `.env` sem a variável.
>
> Depois do restart, o servidor **ainda não** vai imprimir a nova linha de arranque — ela vem no próximo deploy. A partir dele, `iniciar()` imprime `client gerado cobre as N tabelas de public` e **recusa subir** se voltar a divergir.
>
> ### (b) Produção não tem contrato nenhum — medido em 30/07
>
> ```
> clientes .......... 84     contratos ............... 0
> UCs (c/ rateio) ... 39     originadores ............ 0
> usinas ............ 4      identidade de cobrança .. 0
> tarifa vigente .... 1      UCs com data_vencimento . 0 de 39
> ```
>
> **São quatro bloqueios empilhados, e três dependem de insumo humano que não chegou:** os CPF/CNPJ dos originadores, os 39 contratos e a `data_vencimento` (`Q-SPEC001-02`, sem ela a triagem recusa a UC). Sem contrato não há fatura; sem fatura não há boleto, baixa nem prévia.
>
> **O que isso muda neste roteiro:** as partes **4.1, 4.2 e a prévia impressa ficam esperando os contratos**. Mas o teste que mais importa — **ler o QR com a câmera** — foi destravado: a aba Documento ganhou o painel **"Conferir o QR com a câmera"**, que desenha a partir da sua chave Pix e de um valor que você digita, **sem precisar de fatura**. É a **parte 5**, e ela vale hoje.
>
> | | |
> |---|---|
> | **Publicado** | as 12 telas, o documento, os relatórios |
> | **NÃO publicado** | a **agenda**, o **importador de tarifas**, o **painel do QR**, a guarda de arranque e os renomes. Produção tem 20 migrations; o repositório tem 21 |
>
> **Nada aqui escreve em produção sem você mandar.** Os passos que gravam estão marcados com **✍️**. Os demais são leitura.

---

## Como usar

Cada item tem três linhas: **Faça**, **Espere ver** e **Se vier diferente**. A terceira é a que importa — ela diz se o que você encontrou é defeito, é dado faltando, ou é o sistema recusando de propósito.

**As três coisas que este sistema faz de propósito e parecem erro:**

1. **Recusar com o motivo escrito** em vez de seguir com um valor razoável. Botão travado com uma frase embaixo **é a regra funcionando**, não a tela quebrada.
2. **Dizer "não medido" em vez de "zero".** Ausência não é zero em lugar nenhum deste sistema.
3. **Responder `503` na cobrança.** Não há certificado A1; o adaptador padrão **recusa com o motivo nomeado** em vez de fingir que emitiu.

---

## 1. Entrar

**Faça:** abra `https://financeiro.blackhaus.io` e entre com o seu e-mail.

**Espere ver:** a barra lateral com **12 telas em dois grupos** — sete de cadastro (Pendências, Clientes, Unidades, Contratos, Usinas, Donos, Tarifas), uma divisória fina, e cinco do dinheiro (Carteira, Faturas, Cobrança, Documento, Relatórios). A ordem **não é alfabética**: é a ordem em que o trabalho destrava o próximo passo.

**Se vier diferente:**
- **tela de login recusando** → o e-mail pode não estar confirmado no Supabase Auth. É a segunda guarda do `provisionar-usuario.sql`, e o sintoma é exatamente esse: a linha existe, o papel está certo, e a pessoa não entra.
- **cai numa tela que você não pediu** → caminho desconhecido cai em **Pendências** de propósito. É a tela que diz o que falta, e é o lugar certo para se perder.

**Repare na fonte.** O texto usa Inter, servida pela nossa origem (não pelo Google). Se piscar com outra fonte antes de assentar, é o `font-display: swap` funcionando — é escolha, não defeito.

---

## 2. Pendências — comece por ela, é o mapa

**Faça:** abra **Pendências** e leia as **dez camadas** de cima a baixo.

> *A tela se chamava "Prontidão" e o nome mudou por decisão sua. O link antigo `/prontidao` continua funcionando — caminho desconhecido cai na primeira tela, que é esta.*

**Espere ver:** cada camada com um dos três estados. E os três são diferentes:

| Estado | Significa |
|---|---|
| **ok** | está pronto |
| **pendente** | falta coisa, e o sistema **sabe o que** |
| **não medido** | não há o que medir ainda — **e isto não é "ok"** |

**O que conferir com atenção:** a camada `originador_do_contrato`. *"Nenhum contrato"* aparece como **não medido**; *"contrato sem originador"* aparece como **pendente**. Eram o mesmo `?` até 29/07, e separá-los foi a `Q-PRONTIDAO-COMIS-01`.

**O que você vai ver hoje, e é o estado certo:** quase tudo **pendente** — 0 contratos, 0 originadores, 0 donos de usina, e 39 UCs sem data de vencimento. **Tarifa vigente** deve estar **ok** (há 1). É esta tela que explica por que as partes 4.1, 4.2 e a prévia impressa não têm o que testar ainda.

**Se vier diferente:** se uma camada disser **ok** e você souber que falta cadastro, isso **é defeito** e vale anotar a camada e o número. Esta tela conta e **não decide** — ela não deveria conseguir dizer ok sobre algo vazio.

---

## 3. Os cadastros, na ordem da barra

**Faça:** percorra **Clientes → Unidades → Contratos → Usinas → Donos → Tarifas**, sem gravar nada. Só olhe as listas, a busca e a ordenação.

**Espere ver:** listas com busca e ordenação por coluna; valores em reais no formato `R$ 1.234,56`.

**Se vier diferente:**
- **lista vazia onde deveria haver dado** → não confunda com erro: só o 404 de `contrato-vigente` vira *"sem contrato"* na tela. **Nenhuma tela engole erro** — qualquer outra falha aparece como falha.
- **valor com mais ou menos de 2 casas** → é defeito e vale anotar. Dinheiro é inteiro em centavos em toda camada, e a formatação é de saída.

### 3.1 A trava do originador — ✍️ **vale provocar de propósito**

**Faça:** em **Contratos**, comece um contrato novo e **deixe o Originador em branco**.

**Espere ver:** o botão de salvar **travado**, com a razão escrita embaixo.

**Se vier diferente:** se o botão liberar sem originador, **pare e anote** — é o defeito mais caro que este sistema tem hoje. A regra R20-b **congela** o tipo do originador no momento em que o contrato é rascunhado, e **não há caminho de edição**: um contrato gravado sem originador não tem conserto pelo uso normal. É a `Q-ORIGINADOR-01`.

> **Antes de digitar os 39 contratos de verdade:** reconfira o mapa de atribuição. O `ATRIBUICAO-originador-2026-07-30.md` é o vigente, ordenado por **UC** (a chave estável), e o CRM se moveu duas vezes em quatro dias — `Q-CRMCODIGO-01`. **Jogue fora o mapa de 29/07.**

---

## 4. Carteira e Faturas — o caminho do dinheiro

> **Hoje esta parte para no primeiro passo, e o motivo é dado e não defeito.** Compor o lote exige **contrato ativo**, e produção tem **0**. O que você deve ver é uma composição que devolve **0 criadas** e as recusas contadas com motivo — e isso já é uma informação útil: confira se as recusas nomeiam *contrato* e não outra coisa.
>
> As UCs também estão **sem `data_vencimento`** (0 de 39), então mesmo com contrato elas seriam recusadas por isso. É a `Q-SPEC001-02`: *quem preenche a data de vencimento, por UC ou por contrato?* — e ela **não tem dono decidido**. Vale responder antes de digitar os 39 contratos, senão eles nascem e o faturamento continua parado.

**Faça:** abra **Carteira**, escolha um **mês de referência** e **componha o lote**. ✍️

**Espere ver:** um resumo com **criadas** e **recusadas**, e cada recusa **com motivo nomeado**. O lote não perde UC em silêncio: cada uma vira fatura **ou** vira recusa contada, nunca as duas nem nenhuma.

**Se vier diferente:** se criadas + recusadas não fechar com o total de UCs do mês, é defeito. Anote os três números.

**Faça:** vá em **Faturas**, no mesmo mês. Confira o total de uma fatura contra a conta: `geração × percentual de rateio × tarifa` + tarifas da concessionária.

**Espere ver:** o total batendo. **A conta é feita no servidor** (R23) — a tela só mostra.

**Faça:** ✍️ **emita** uma fatura (ou o lote).

**Espere ver:** o status virar `emitida`. **Isto é o fato gerador da receita** — a competência governa a receita, e `emitida_em` é carimbado aqui e em lugar nenhum mais.

**Se vier diferente:** rascunho que não emite deve dizer por quê. Emitir uma fatura já emitida deve ser recusado, não repetido.

### 4.1 O boleto, e o 503 que é resposta e não falha

**Faça:** peça o **boleto** de uma fatura emitida. ✍️

**Espere ver:** uma recusa **com o motivo escrito** — não há certificado A1, e o adaptador padrão levanta `503` nomeando o que falta. **Isto é o comportamento certo.**

**Se vier diferente:**
- **se aparecer uma linha digitável** → **pare e anote.** Significa que alguma coisa fingiu emitir um boleto, e um número de boleto que o banco não conhece é pior que nenhum.
- **se der erro genérico sem explicação** → é defeito de tradução: o `503` deveria chegar à tela com o motivo.

### 4.2 A baixa manual — é o único caminho que fecha o ciclo hoje

**Faça:** ✍️ dê **baixa manual** numa fatura emitida, pelo valor cheio.

**Espere ver:** a fatura vira `paga` **e o split roda na mesma transação**. Confira em **Relatórios** que comissão e repasse apareceram.

**Se vier diferente:**
- **valor parcial recusado** → correto. Boleto registrado liquida pelo valor cheio; se houve juro ou multa, eles entram em campos próprios.
- **fatura paga e Relatórios vazios** → pode ser **repasse bloqueado** (usina sem dono, R12). Nesse caso a baixa vale — o dinheiro entrou — e o motivo volta na resposta. Confira se a usina tem dono em **Donos**.

---

## 5. ⭐ O QR Code — o teste que nenhum comando faz

**Este é o item mais importante do roteiro, e leva dois minutos.**

As 45 verificações do `tests/qrcode.ts` provam que a matriz é um QR válido pelo padrão ISO/IEC 18004 e que o texto volta inteiro. **Elas não provam que o aplicativo do seu banco aceita.** Isso é teste de campo.

> **Este é o caminho novo, e ele existe porque o antigo estava bloqueado.** A Prévia precisa de uma fatura, e não há nenhuma. O painel **"Conferir o QR com a câmera"** desenha a partir da sua chave Pix e de um valor que você digita — **sem fatura, sem gravar nada**. Ele chama a **mesma** função que a fatura chamaria; um QR desenhado por caminho paralelo não provaria nada sobre o de verdade.

**Faça:**
1. Abra a aba **Documento**.
2. **Cadastre a identidade de cobrança** ✍️ — chave Pix, nome e cidade do recebedor. Produção tem **0** hoje, e é daí que o QR sai. *(Isto não é dado de teste: é a configuração de cobrança da G3, que você vai precisar de qualquer jeito.)*
3. Role até **"Conferir o QR com a câmera"**, digite um valor e clique em **Desenhar o QR**.
4. **Aponte a câmera do celular** (ou o app do banco, em "Pagar com Pix").

> ⚠️ **O QR aponta para a sua chave Pix REAL.** Serve para conferir se a câmera lê e se recebedor e valor aparecem certos — **não confirme o pagamento**. A tela avisa isso também.

**Espere ver:** o app **reconhecer o código** e mostrar **o nome do recebedor e o valor**.

**Confira os três, um a um:**

| O quê | Contra o quê |
|---|---|
| o **nome do recebedor** | a tabela que o painel mostra ao lado do QR |
| o **valor** | o que você digitou |
| a **chave Pix** | a que você cadastrou |

**Se vier diferente — e cada caso significa uma coisa distinta:**

- **A câmera não reconhece nada** → a matriz está malformada. É **barulhento e ninguém perde dinheiro**. Anote a versão e o tamanho que a tela mostra ao lado do QR.
- **O app lê, mas o valor está errado** → ⚠️ **pare tudo e anote.** Este é o modo de falha caro: um QR legível apontando para um valor errado é dinheiro indo errado sem erro e sem log.
- **O app lê outro nome de recebedor** → mesma gravidade. Anote a string inteira que o app mostrou.
- **O app diz "QR inválido"** → provavelmente o BR Code, não o desenho. Anote se a tela mostrou "Pix estático" ou "Pix do boleto".

> **O que não muda com o QR, e a tela diz isso:** Pix **estático** não carrega `txid` por fatura. **A conciliação continua manual** — o dinheiro chega sem dizer de quem é, e a baixa é dada à mão na aba Faturas. Desenhar o quadrado não mudou isso.

**Faça também:** teste o **copia-e-cola** — o painel imprime o BR Code embaixo do QR. Cole no app do banco. É o outro caminho, e um pode funcionar sem o outro.

**Quando houver fatura**, repita pela **Prévia**: é o mesmo desenho, agora com o valor vindo da coluna gerada da fatura em vez de digitado. Se o painel funciona e a Prévia não, o problema está na composição do documento e não no QR.

---

## 6. O documento impresso

**Faça:** na aba **Documento**, suba uma **logo** (PNG ou JPEG) e clique em **imprimir**. ✍️

**Espere ver:**
- a logo aparecendo na prévia;
- ao imprimir, **preto sobre branco**, independente de a tela estar em tema claro ou escuro. As três cores literais do documento impresso são exceção **nomeada**;
- as linhas do documento **na ordem**, formatadas pelo servidor.

**Se vier diferente:**
- **SVG recusado** → correto e deliberado: o mime sai da **assinatura do arquivo**, não do rótulo, e SVG executa script dentro do HTML do documento. GIF também é recusado.
- **PNG recusado** → aí é defeito. Anote o tamanho do arquivo.
- **impressão saindo com as cores do tema escuro** → é defeito do CSS de impressão.

**Faça:** mexa nos **campos** — esconda um, reordene.

**Espere ver:** a prévia acompanhar. Lista vazia significa **"usa o padrão"**, e o padrão vive no código, não no banco.

---

## 7. Cobrança — o que falta para um boleto ser pagável

**Faça:** abra **Cobrança**.

**Espere ver:** a tela dizendo o que falta, **com o ID da questão**. Sem conector cadastrado, o servidor responde `412` e a tela trata isso como **resposta** ("não há conector"), não como falha de leitura.

**Faça:** ✍️ no campo de credencial, **cole de propósito** algo que pareça um segredo — um `-----BEGIN`, um JWT longo, um base64 grande.

**Espere ver:** o botão **travar**, com o sinal nomeado. É a **regra 5** chegando ao formulário: o campo pede uma **referência** ao cofre, nunca o segredo.

**Se vier diferente:** se aceitar, **anote** — o banco tem um `CHECK` que também recusa, mas a tela deveria pegar antes.

---

## 8. Relatórios e CSV

**Faça:** abra **Relatórios** e exporte o CSV das três visões (repasse por dono, comissão por originador, uso da usina).

**Espere ver:** o arquivo abrindo no Excel **em português**: separador `;`, acentos corretos.

**Se vier diferente:**
- **tudo numa coluna só** → o Excel está esperando outro separador. Anote a versão do Excel.
- **acentos quebrados** → o BOM UTF-8 não chegou.
- **valor com ponto onde deveria ter vírgula** → é defeito. O dinheiro sai por texto a partir dos centavos, e a regra 1 vale na **saída** também, que é onde ninguém procura.

---

## 9. Depois do deploy da agenda — só quando a migration 21 estiver aplicada

**Faça primeiro:**

```bash
psql "$DIRECT_URL" -f tests/catalogo.sql
```

**Espere ver:** `catalogo: 9 invariantes, nenhuma falha`. É leitura pura — não escreve nada.

**Faça:** o alerta do certificado, que é a única tarefa que funciona sem A1:

```bash
npm run agenda -- --certificado --auth-user <seu uuid>
```

**Espere ver:** `nivel: sem_certificado`, porque não há data cadastrada. **Repare que ele não diz "ok"** — afirmar ok seria garantir o que o sistema não sabe.

**Faça:** a fila e a consulta, em ensaio:

```bash
npm run agenda -- --fila     --ensaio --auth-user <seu uuid>
npm run agenda -- --consulta --ensaio --auth-user <seu uuid>
```

**Espere ver:** `examinados 0` e uma linha dizendo que **a rodada aconteceu** e está em `agenda_execucao`. Silêncio não é sucesso: uma rodada que não achou nada e uma que não rodou teriam a mesma cara sem essa linha.

> ⚠️ **A armadilha do `--ensaio`, e ela é real:** no ensaio **a porta é chamada de verdade**. Contra o adaptador falso e contra o sandbox, é o que se quer. **Contra a Sicoob de produção, `--fila --ensaio` registraria boleto lá e daria rollback aqui**, deixando os dois lados divergentes. O script avisa na saída. Enquanto não houver A1 isso é teórico — as duas tarefas recusam com `503`.

**Faça:** o importador de tarifas, em ensaio:

```bash
npm run --silent tarifas -- --modelo > /tmp/tarifas.csv   # e edite
npm run tarifas -- --ensaio --auth-user <seu uuid> --competencia 2026-08 --arquivo /tmp/tarifas.csv
```

**Espere ver:** **uma linha por valor, com a interpretação ao lado do texto original**:

```
linha 2   000406456101252   "1.234,56"   -> R$ 1.234,56
linha 3   000407359701237   "1.987,20"   -> R$ 1.987,20
```

**Confira essa coluna antes de rodar com `--valendo`.** É o único ponto do sistema em que um valor pode estar **certo pela leitura errada**: `"1.234"` é R$ 1.234,00 ou R$ 1,23, e as duas leituras produzem uma fatura plausível. Depois de a fatura ser emitida, corrigir passa por cancelá-la.

---

## O que este roteiro **não** cobre, e por quê

| O quê | Por quê |
|---|---|
| **Boleto registrado de verdade** | não há certificado A1 (`Q-SICOOB-01`). O ciclo inteiro está provado contra o adaptador falso; o critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura"*, e o sandbox não existe ainda |
| **Webhook de liquidação** | falta decidir como a Sicoob se autentica e como o tenant é resolvido (`Q-WEBHOOK-01`). A rota existe e hoje exige Bearer como todas as outras |
| **Comissão paga** | ninguém recebeu nada ainda, e `faturas_cheias_pagas` nascer em 0 é o valor **certo** |
| **O CRM consumindo o documento** | a rota está pronta e o payload leva a logo embutida sob demanda; falta a autenticação, que é a mesma `Q-WEBHOOK-01` |
| **Segundo tenant** | o isolamento é testado em suíte com dois tenants pela role sem `BYPASSRLS`, mas produção tem um só. O modo de falha da RLS é **resultado vazio**, não erro — não aparece em log nem quebra teste de fumaça |
| **Faturar de verdade** | falta **contrato**, e antes dele o **originador** (CPF/CNPJ) e a **`data_vencimento`** das 39 UCs. São três insumos humanos, não três defeitos |

---

## O caminho crítico, se você quiser destravar o faturamento

A ordem importa, e o item 1 é o único que não depende de mais ninguém.

| # | O quê | Depende de | Por que nesta ordem |
|:--:|---|---|---|
| 1 | **Identidade de cobrança** (chave Pix, recebedor, cidade) | **só de você** | destrava a parte 5 hoje, e é configuração real que o documento vai usar |
| 2 | **`data_vencimento` das 39 UCs** | decisão: por UC ou por contrato? (`Q-SPEC001-02`) | **sem ela a triagem recusa a UC mesmo com contrato**. Decidir isto depois de digitar os 39 contratos significa mexer nas 39 de novo |
| 3 | **CPF/CNPJ de Renata e Out Sales** + natureza pf/pj | operação | destrava `npm run originadores`; hoje a tabela tem 0 linhas |
| 4 | **Reconferir o mapa de atribuição** | consulta em `Q-CRMCODIGO-01` | o CRM se moveu duas vezes em quatro dias; o mapa de 30/07 tem meio dia |
| 5 | **Digitar os 39 contratos** | 3 e 4 | **R20-b congela o tier no rascunho e não há edição** — digitar com o mapa errado paga a pessoa errada, sem erro e sem log |
| 6 | **Compor e emitir** | 1 a 5 | aí as partes 4.1, 4.2 e a Prévia passam a ter o que testar |

**O 2 é o que costuma ser esquecido**, porque não aparece em nenhuma tela até a composição recusar.

---

## Onde anotar o que você encontrar

Pela **regra 10**, lacuna vira entrada em `QUESTOES.md` — não vira improviso, nem valor default escolhido porque parecia razoável, nem decisão de quem estiver implementando.

Para cada achado, três linhas bastam:

1. **onde** — a tela e o passo deste roteiro;
2. **o que veio** — o número, a mensagem ou a foto da tela;
3. **o que você esperava** — e, se souber, contra o que estava comparando.

**A terceira é a que vale mais**, e é a que este projeto tem aprendido do jeito caro: três sessões seguidas tiveram uma contagem que não se reproduziu, e uma citação que não existia. **Número lido da tela não é medição** — se puder, copie e cole em vez de transcrever.
