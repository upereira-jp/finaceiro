# RESPOSTA — gerente Sicoob · 13/08/2026

| Campo | Valor |
|---|---|
| **O que é** | *"Manual para criação de aplicativo no portal Developers"* — documento do **próprio Sicoob**, Brasília/DF, **22 de novembro de 2024** |
| **Como chegou** | resposta do gerente da conta PJ ao `PROMPT-gerente-sicoob-2026-08-13.md` |
| **O que responde** | **3 das 7 perguntas** — as três do certificado (`1a`, `1b`, `1c`) |
| **O que NÃO responde** | **as outras 4** — e são exatamente as quatro que travam alguma coisa: sandbox (`1d`), os três campos do contrato (`2`), a chave Pix (`3`) e o webhook (`4`) |
| **O que ele destrava** | **a compra do A1**, e só ela. Nenhuma linha de código passa a ser escrevível |

> **O gerente respondeu com um manual de portal, não com as respostas.** Isso não é falha dele — três das quatro perguntas não são de gerente de conta: o webhook é do time técnico, os três campos são do contrato de cobrança, e só a chave Pix era realmente dele. **A repergunta está na §6, e ela se divide por destinatário.**
>
> **O que o manual entrega é caro e é pouco:** ele converte a decisão de comprar o A1 de *"baseada em vídeo de terceiro"* para *"baseada no manual do próprio banco"*, e acrescenta a linha que faltava — **sobe só a chave pública**. A `Q-SICOOB-01` continua vermelha, e continua vermelha pela mesma razão de sempre.

---

## Uma marca nova de proveniência

A folha `SICOOB-portal-2026-08-06.md` trabalha com três marcas. Esta é a quarta, e ela entra **entre** as duas primeiras:

| Marca | Significa | Força |
|:--:|---|---|
| 👁 | visto por nós no portal, 13/08/2026 | medição nossa |
| 📄 | **manual do Sicoob**, 22/11/2024, entregue pelo gerente | **documento do próprio banco** — primária, mas **de 21 meses atrás** |
| 📹 | vídeo de terceiro (revenda de ERP), 05/07/2025 | secundária |
| ❓ | em branco | — |

**O 📄 é mais forte que o 📹 e mais fraco que o 👁**, e a razão é a data: é um documento de novembro de 2024 descrevendo telas navegadas em agosto de 2026. **Onde os dois se cruzam, ele confere** — conta que aparece, interruptor de empresa parceira, certificado naquele passo, seleção de APIs, PJ nascendo pendente. Nada divergiu. Mas *"confere onde foi conferido"* não é *"está atual em tudo"*.

---

## 1. O documento, como veio

Transcrito do que o gerente enviou, sem interpretação:

**Cadastro** — `developers.sicoob.com.br/portal/cadastro`, escolher Pessoa Jurídica ou Física, preencher. Chega e-mail com link para criar a senha. Quem já tem cadastro entra por `/portal/login`.

**Criação do aplicativo**, os onze passos:

| # | O que o manual diz |
|:--:|---|
| 1 | Clicar em **"Gerar aplicativo"** |
| 2 | **"Ok, continuar"** |
| 3 | Selecionar o **Tipo de Pessoa** e **fazer login com dados da cooperativa, conta corrente ou chave de acesso e senha do Aplicativo Sicoob Mobile Banking** |
| 4 | **Segundo fator** enviado no aplicativo Sicoob. Se o código não chegar: App Sicoob → Menu → Notificações, ativar; se já ativadas, **desativar e ativar de novo** |
| 5 | **Nome do Aplicativo, Descrição, Conta corrente** → "Prosseguir" |
| 6 | **Empresa Parceira?** *Sim* → seleciona a parceira. *Não* → **certificado digital válido do tipo A1 emitido pela ICP Brasil para o CNPJ/CPF do cooperado**.<br>**Obs.: "Insira somente a chave pública do certificado no formato .PEM, .CRT ou .CER."**<br>Instruções de extração em `portal/documentacao` → Segurança → Certificado Digital → *"Como eu exporto o certificado para gerar o aplicativo?"* |
| 7 | Selecionar as **APIs desejadas**.<br>Obs.: com empresa parceira, **ficam disponíveis (em cores) apenas as APIs que a parceira oferece** |
| 8 | Confirmar os dados → **"Criar aplicativo"** |
| 9 | Conta **PF**: credencial em "Meus aplicativos", **já ativa** |
| 10 | Conta **PJ**: aplicativo nasce **"Pendente"**. **Os responsáveis pela conta** autorizam no **App Sicoob** ou no **Sicoobnet Empresarial** — App Sicoob → ícone de pesquisa → **"Transações Pendentes / Detalhamento"** → **"Autorização para Uso de APIs"** → senha → autorizar |
| 11 | Feito isso, **"a credencial (client id)"** está pronta. Documentação técnica em `portal/documentacao` |

---

## 2. O que ele responde

### 2.1 O certificado — as três perguntas do bloco 1, fechadas

| Pergunta | Resposta do manual | Estado |
|---|---|---|
| **`1a`** A1 ou A3? | *"certificado digital válido do **tipo A1** emitido pela ICP Brasil para o CNPJ/CPF do cooperado"* | 📄 **A1** |
| **`1b`** qual arquivo subir? | *"Insira **somente a chave pública** do certificado no formato **.PEM, .CRT ou .CER**"* | 📄 **os três servem** |
| **`1c`** alguma AC específica? | *"emitido pela ICP Brasil"*, sem nomear autoridade | 📄 **qualquer uma do ICP-Brasil** |

**Sobre o `1a`, a honestidade da leitura:** o manual **nomeia A1 e só A1**, e nunca menciona A3. Isso é confirmação por nomeação exclusiva, não negativa explícita — ele não escreve *"A3 não funciona"*. Para efeito de compra dá no mesmo: o que o formulário pede está escrito, e é A1.

**Sobre o `1b`, que era a pergunta de risco:** a nota interna do `PROMPT` dizia que responder **`.pfx`** seria *"achado sério — significaria subir a chave privada num formulário web, e o `ADR-0005` precisa saber"*. **Ele responde o oposto, e com a palavra que faltava:** ***somente a chave pública***. O banco escreve, no próprio manual, que a chave privada não vai. **O `ADR-0005` sai desta confirmado, não emendado.**

### 2.2 E uma correção: o `.CER` nunca foi divergência

A folha de 13/08 registrou, como achado, que *"o que sobe é `.PEM` em vez de `.CER` — mesma parte pública, outra extensão"*, tratando a suposição original (`.CER`) como corrigida pelo vídeo.

**Os dois estavam certos.** O formulário aceita **`.PEM`, `.CRT` e `.CER`**. A suposição original não era erro, e o vídeo não a corrigiu — mostrou uma das três. A linha da tabela de arquivos que dizia do `.crt` *"não precisamos"* também muda de sentido: ele **serve para subir**, e continua não sendo necessário só porque o `.pem` já resolve.

Isto é correção de registro, não mudança de procedimento: **continua saindo um arquivo público do `.pfx`, e continua sendo um só.**

### 2.3 O `client_secret` — corroborado, não medido

O passo 11 diz **"a credencial (client id)"**, no singular, e nenhum passo do manual menciona segredo, senha de aplicativo ou segundo campo.

Isso **corrobora o `B2`** por fonte primária — antes ele se apoiava só no 📹. Mas **não o fecha**: o manual descreve o que fazer, não enumera o que o painel devolve. A promoção final continua sendo a mesma que já estava escrita — **vira 👁 no dia em que o aplicativo existir e o painel mostrar, ou não, um segundo campo.**

> **Uma pendência de documento que isto expõe:** o `ADR-0005` §38 ainda descreve a resolvedora devolvendo **três** coisas — *"o certificado A1, o `client_id` e o `client_secret` daquele tenant"*. Duas fontes independentes agora dizem que são duas. **Não editei o ADR**: ele é decisão registrada, e a emenda é `r2` quando a medição for 👁 — não por corroboração documental. Está anotado na `Q-SICOOB-01`.

---

## 3. O que ele NÃO responde — e as quatro continuam abertas

| Pergunta | O que o manual diz | Consequência |
|---|---|---|
| **`1d`** existe sandbox sem certificado? | **nada.** A palavra sandbox não aparece; há **um** fluxo de criação, e nele o certificado é exigido | **a premissa do paralelismo continua caída.** Nada a restaura — e ausência de menção não é prova de ausência de sandbox. `Q-SICOOB-01` |
| **`2`** `numeroCliente`, `numeroContratoCobranca`, `codigoModalidade` | **nada.** É manual de portal, e esses três são do **contrato de cobrança** | **o `B4` continua aberto**, e continua sendo o que impede `src/sicoob/http.ts` de nascer sem campo de identidade entrando por fora |
| **`3`** chave Pix aleatória vinculada ao contrato | **nada** | `Q-SICOOB-PIXCHAVE-01` aberta. O `B3` segue sem custo conhecido |
| **`4`** como a Sicoob se autentica no **nosso** webhook | **nada** | `Q-WEBHOOK-01` aberta desde 28/07. O manual reforça o diagnóstico de 05/08: **não é público, e não é pergunta de gerente** |

**Sobre a `4`, o que o silêncio ensina:** a nota interna do `PROMPT` já a marcava como *"a mais valiosa e a menos provável de ser respondida por ele"*, e encaminhável. **Foi exatamente isso que aconteceu.** O `ADR-0006` não muda por causa disto — ele foi desenhado para acomodar as três formas justamente porque esta resposta não vinha. **Nenhuma opção volta à mesa, e o plano B não é acionado**: acionar exige saber que não há mTLS nem faixa de IP, e continuamos sem saber.

---

## 4. O que ele traz que ninguém tinha perguntado

Três achados, e nenhum estava em documento nenhum do repositório — conferido: `Mobile Banking`, `Sicoobnet Empresarial` e `Transações Pendentes` têm **zero** ocorrências em todo o corpus.

### 4.1 Há um TERCEIRO login, e ele não é nenhum dos dois já mapeados

A folha tem um aviso dedicado a não confundir dois endereços:

```
sso.sicoob.com.br/auth/realms/sicoob      ← login do PORTAL
auth.sicoob.com.br/auth/realms/cooperado  ← token da API
```

**O manual acrescenta um terceiro, e ele não é URL — é credencial de outro sistema.** O passo 3 exige, *dentro* do fluxo de criação, **login com cooperativa + conta corrente (ou chave de acesso) e a senha do App Sicoob Mobile Banking**. Não é a senha do portal, criada por e-mail no cadastro.

São **três coisas chamadas "login"**, e o aviso da folha existe porque essa confusão é barata de cometer e cara de depurar. Agora ele tem três linhas.

### 4.2 O segundo fator pode travar a criação, e o conserto é uma configuração de celular

Passo 4: o código do 2FA chega **no app**, e o manual já traz o procedimento para quando não chega — ativar notificações, ou desativar e reativar.

**Um manual que traz o próprio contorno está dizendo que a falha é frequente.** Vale ter as notificações do App Sicoob conferidas **antes** de começar, e não no meio do fluxo, com o certificado já comprado.

### 4.3 A ativação do PJ tem caminho exato — e um segundo caminho que o vídeo não mostrou

A folha registrava, por 📹, apenas que o titular *"confirma o uso da API no aplicativo do banco, no celular"*. O manual dá o percurso:

**App Sicoob → ícone de pesquisa → "Transações Pendentes / Detalhamento" → "Autorização para Uso de APIs" → senha → autorizar**

E acrescenta uma alternativa que não estava em lugar nenhum: **o Sicoobnet Empresarial**. Quem não conseguir pelo celular tem web.

> **E aqui nasce uma pergunta que ninguém tinha feito.** O manual diz que *"será necessário que **os responsáveis pela conta** autorizem"* — **no plural**. Se a conta PJ da G3 tiver mais de um responsável cadastrado, ou exigir autorização conjunta, a ativação depende de mais de uma pessoa.
>
> **Isso é barato de conferir hoje e caro de descobrir depois** — o momento errado é com o A1 já comprado e o aplicativo parado em `Pendente`. Entra como **`Q-SICOOB-AUTORIZA-01`** 🟢: não muda desenho nenhum, e está no caminho crítico.

### 4.4 Empresa parceira — um dado a mais, e a pergunta principal continua aberta

Passo 7: com integração por empresa parceira, **só ficam disponíveis as APIs que a parceira oferece**.

Isso alimenta a `Q-SICOOB-PARCEIRA-01`: o catálogo da parceira **limita** o do cooperado. Para a G3 hoje é indiferente — a resposta é *não é parceira*. **O que continua sem resposta é o que a questão realmente pergunta:** se um certificado de parceira atende **vários cooperados**, que é o oposto da `credencial_ref` por tenant do `ADR-0005`, e que importa no dia em que a G3 rodar o financeiro para outra empresa solar.

---

## 5. O que muda no código

**Nada.** E vale escrever por extenso por que, para ninguém confundir *"chegou documento do banco"* com *"destravou"*:

| O que | Continua bloqueado por |
|---|---|
| `src/sicoob/http.ts` | o `B4` (os três campos) **e** a credencial. O manual não move nenhum dos dois |
| `centavosParaReaisDecimal` | nasce com o adaptador — mesma fila |
| o webhook do `ADR-0006` | `Q-WEBHOOK-01`, intacta |
| a resolvedora do `ADR-0005` | povoar o cofre exige o A1, que ainda não foi comprado |

**O que muda é o risco da única compra que estava para ser feita.** A decisão de 13/08 — comprar o A1 — estava apoiada em vídeo de terceiro quanto ao formato. Agora está apoiada no manual do banco, **e com a garantia explícita de que só a parte pública sobe**. Comprar deixou de ter pergunta em aberto.

**A ordem de "o que falta" da folha continua valendo inteira**, com um ajuste no passo 2: o arquivo público pode ser `.pem`, `.crt` **ou** `.cer` — o `.pem` continua sendo o escolhido, e o `.key` continua não sendo gerado.

> **A instrução oficial de exportação não foi lida.** O manual aponta `portal/documentacao` → Segurança → Certificado Digital → *"Como eu exporto o certificado para gerar o aplicativo?"*. **Tentei buscar em 13/08 e o portal é SPA — não devolve conteúdo sem navegação autenticada.** Fica como ponteiro, não como medição: quando o A1 existir, é a fonte 📄 que substitui os comandos OpenSSL do vídeo. Até lá, o comando do vídeo é o que temos, e ele confere com o que o manual pede.

---

## 6. A repergunta — e ela se divide por destinatário

**O erro a não cometer é reperguntar tudo ao gerente.** Ele respondeu o que era dele com um documento do banco; as outras três têm dono diferente, e insistir com ele gasta boa vontade sem trazer resposta.

| Pergunta | Para quem | Por quê |
|---|---|---|
| **os três campos** do contrato de cobrança | **cooperativa singular** — quem administra o contrato de cobrança | não é portal, é contrato. E **não se deriva** de `conector_cobranca` por semelhança de nome (`contrato-medido` §4) |
| **chave Pix aleatória** vinculada ao contrato | **o gerente** — continua sendo ato dele | é a única das quatro que era mesmo dele, e ele não respondeu. Vale insistir |
| **autenticação do webhook** | **suporte técnico / canal de desenvolvedor** | `Q-WEBHOOK-01`. O `PROMPT` já a marcava como encaminhável, e o manual confirma que o gerente não a alcança |
| **existe sandbox sem certificado?** | **suporte técnico** | o manual descreve um fluxo só. Se houver sandbox sem A1, o `http.ts` fica exercitável antes da compra |

**Sugestão de sequência, e ela não é a ordem da tabela:** as duas primeiras podem sair hoje, na mesma conversa com o gerente — ele passa os três campos ou diz com quem falar, e a chave Pix é dele. As duas técnicas viram um chamado só.

**E uma que não é pergunta, é conferência de dois minutos:** quantos responsáveis a conta PJ da G3 tem, e se a autorização de API exige mais de um (`Q-SICOOB-AUTORIZA-01`). Se exigir, é a diferença entre ativar o aplicativo no mesmo dia e descobrir na segunda-feira que falta assinatura.

---

## O que esta resposta muda no registro

| Documento | O que mudou |
|---|---|
| `SICOOB-portal-2026-08-06.md` | marca 📄 nova; certificado com os três formatos e a chave pública explícita; o terceiro login; o 2FA; o caminho exato de ativação PJ e o Sicoobnet Empresarial |
| `QUESTOES.md` | `Q-SICOOB-01`, `Q-SICOOB-PIXCHAVE-01`, `Q-SICOOB-PARCEIRA-01` e `Q-WEBHOOK-01` atualizadas · **`Q-SICOOB-AUTORIZA-01` aberta** |
| `PROXIMOS-PASSOS-2026-08-09.md` | a correção de 13/08 da Frente B ganha o que o manual confirmou e o que ele não respondeu |
| `adr/ADR-0005` | **não editado, de propósito** — a emenda dos três campos para dois é `r2`, e espera medição 👁 |
| `adr/ADR-0006` | **não editado** — nenhuma opção voltou à mesa, e o plano B não foi acionado |
