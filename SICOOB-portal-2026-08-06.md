# SICOOB — o que fazer no portal

| Campo | Valor |
|---|---|
| **Escrita em** | 06/08/2026, a partir de **documentação** — não de navegação |
| **Preenchida em** | **13/08/2026**, pelo dono, no portal, e completada por vídeo de terceiro |
| **Conferida em** | **13/08/2026, à tarde**, contra o **manual do próprio Sicoob** (22/11/2024), entregue pelo gerente — `RESPOSTA-gerente-sicoob-2026-08-13.md` |
| **Status** | **Itens 1, 2 e 3 respondidos. Itens 4 e 5 continuam em branco** — e o porquê está escrito ao lado de cada um. **O manual não mexeu nos itens 4 e 5** |
| **O que ela destrava** | `B1`, `B2` e `B4` do `PROXIMOS-PASSOS-2026-08-09.md` §B.1 |

> **A regra desta folha é a proveniência, e ela vale mais que o conteúdo.** Cada linha preenchida abaixo carrega de onde veio. O que foi *visto* e o que foi *suposto* não podem ficar iguais depois — e agora há uma terceira categoria, que é **vídeo de terceiro**: específica demais para ser invenção, secundária demais para ser medição nossa.

| Marca | Significa |
|:--:|---|
| 👁 | **VISTO por nós** no portal, em 13/08/2026 |
| 📄 | **MANUAL DO SICOOB** — *"Manual para criação de aplicativo no portal Developers"*, Brasília/DF, **22/11/2024**, entregue pelo **gerente da conta** em 13/08/2026. Fonte **primária**, e **de 21 meses atrás**: confere com o 👁 em todos os pontos onde os dois se cruzam |
| 📹 | **VÍDEO DE TERCEIRO** — *"Configurando a API de Boletos/PIX do Sicoob (Bancoob) em nosso sistema"*, canal **Código UP Sistemas**, publicado em **05/07/2025**, 8m19s. Revenda de ERP, **não** o Sicoob. Confere com o que foi visto, e vai além dele |
| ❓ | **continua em branco**, com o motivo ao lado |

> **A ordem de força é 👁 → 📄 → 📹, e o 📄 não promove o 📹 a medição.** Onde o manual confirma o vídeo, a linha ganha fonte primária. Onde ele **silencia**, o vídeo continua sendo vídeo — silêncio de manual não é confirmação.

**Não pergunte, já está decidido:** onde mora o segredo (`ADR-0005`), como a Sicoob entra no webhook (`ADR-0006`), as URLs e o corpo do boleto (`SICOOB-contrato-medido-2026-08-05`).

---

## 1. Cadastre-se

`developers.sicoob.com.br` → abra o **Dashboard**.

👁 **Entrou, e o cadastro NÃO exigiu vínculo que ainda não existisse.** Era o achado mais caro previsto no `P1` do `PROXIMOS-PASSOS`, e ele não aconteceu — nesta direção. A premissa caiu por outro caminho, no item 3.

👁 **O login do portal é por SSO próprio, e ele NÃO é o endpoint de token da API:**

```
sso.sicoob.com.br/auth/realms/sicoob      ← login do PORTAL   (rhsso_type=pj)
auth.sicoob.com.br/auth/realms/cooperado  ← token da API      (contrato-medido §1)
```

**Os dois estão certos e são coisas diferentes** — um autentica *a pessoa* no portal, o outro autentica *o aplicativo* nas chamadas da Cobrança v3. Está escrito aqui porque a confusão é barata de cometer e cara de depurar: quem vir a URL do SSO e "consertar" o `http.ts` para o realm `sicoob` não recebe token, e a causa fica longe do sintoma.

📄 **E são TRÊS, não dois.** O manual acrescenta um terceiro, que não é URL — é credencial de outro sistema:

| # | O que é | Com o que se entra |
|:--:|---|---|
| 1 | **login do portal** (`sso…/realms/sicoob`) | e-mail e a senha criada no cadastro |
| 2 | **login dentro da criação do aplicativo** | 📄 **cooperativa + conta corrente (ou chave de acesso) e a senha do App Sicoob Mobile Banking** — **não** é a senha do portal |
| 3 | **token da API** (`auth…/realms/cooperado`) | `client_id` + certificado, por mTLS |

O nº 2 é novo e não estava em documento nenhum. Ele aparece **no meio do fluxo**, depois de "Gerar aplicativo", e quem chegar lá esperando continuar com a senha do portal para.

URL exata do login, como veio:

```
https://sso.sicoob.com.br/auth/realms/sicoob/protocol/openid-connect/auth
  ?client_id=portal-developers&response_type=code&scope=openid
  &redirect_uri=https://developers.sicoob.com.br/portal/aplicativo&rhsso_type=pj
```

## 2. No Dashboard, anote

| | Resposta |
|---|---|
| `client_id` de sandbox | ❓ **só existe depois do aplicativo criado**, e o aplicativo exige o certificado (item 3). Ver 📹 abaixo |
| **Existe `client_secret`?** | 📹 **NÃO.** O vídeo copia **só o `client_id`** e diz *"o scope é em branco no caso da API COB"*. Nenhum secret aparece em passo nenhum do fluxo.<br>📄 **corrobora:** o passo 11 do manual diz *"a credencial **(client id)**"*, no singular, e nenhum passo menciona segredo ou senha de aplicativo |
| URL base de sandbox | ❓ o vídeo vai **direto a produção** e não menciona sandbox. Não conferida |
| Endpoint de token | ❓ idem — mas ver o aviso do item 1 sobre os dois realms |
| **Baixe** a coleção Postman / OpenAPI | ❓ não baixada |

> **O `B2` está respondido, e ele confirma a hipótese do `ADR-0005`.** Sem `client_secret`, **o certificado É a credencial**, e a resolvedora do cofre devolve **A1 + `client_id`** — dois campos, não três. É a forma que o `P2` previa como possível e que muda o que se escreve, não só o que se guarda.
>
> **Proveniência honesta:** isto é 📹 **e 📄**, não 👁. **Duas fontes independentes, e nenhuma delas é o painel.** O manual descreve o que fazer, não enumera o que o painel devolve — então ele corrobora e não fecha. Vira 👁 no dia em que o aplicativo for criado e o painel mostrar (ou não) um segundo campo.
>
> ⚠️ **O `ADR-0005` §38 ainda diz três.** A frase lá é *"o certificado A1, o `client_id` e o `client_secret` daquele tenant"*. **O ADR não foi editado de propósito** — é decisão registrada, e emenda de decisão é `r2` com medição 👁, não com corroboração documental. Anotado na `Q-SICOOB-01`.

## 3. Abra a tela de cadastro de aplicativo

👁 **A tela foi alcançada.** 📹 **O fluxo tem três abas, e o certificado é exigido na segunda:**

| Aba | O que pede |
|---|---|
| **Informações** | nome do aplicativo + descrição (opcional) → **confirma número da conta e nome do cooperado** |
| **Segurança** | marcar que **não** é integração de **empresa parceira** → o `+` recebe o certificado |
| **APIs** | **Cobrança Bancária V3** |

📄 **O manual confirma as três, e mostra que elas são o MEIO do fluxo — há dois portões antes:**

| # | Passo, como o manual numera | O que é |
|:--:|---|---|
| 1–2 | "Gerar aplicativo" → "Ok, continuar" | entrada |
| **3** | **Tipo de Pessoa + login do App Sicoob Mobile Banking** | ⚠️ **portão novo** — o terceiro login do item 1 |
| **4** | **segundo fator no app Sicoob** | ⚠️ **portão novo** — ver o aviso abaixo |
| 5 | nome, descrição, **conta corrente** | = aba *Informações* |
| 6 | empresa parceira? → certificado | = aba *Segurança* |
| 7 | APIs desejadas | = aba *APIs* |
| 8 | confirmar → **"Criar aplicativo"** | tela de confirmação, que o 📹 não mostrava |

> ⚠️ **O 2FA do passo 4 trava o fluxo, e o próprio manual já traz o contorno:** se o código não chegar, **App Sicoob → Menu → Notificações**, ativar; se já estiverem ativadas, **desativar e ativar de novo**.
>
> **Manual que traz o próprio contorno está dizendo que a falha é frequente.** Conferir as notificações **antes** de começar — não no meio, com o A1 já comprado.

📹 **Depois de criado, o aplicativo nasce `pendente`** e só vira `ativo` quando o titular **confirma o uso da API no aplicativo do banco, no celular**. O `client_id` sai daí.

📄 **E o manual dá o caminho exato, mais um segundo caminho que o vídeo não mostrou:**

```
App Sicoob → ícone de pesquisa → "Transações Pendentes / Detalhamento"
           → "Autorização para Uso de APIs" → senha → autorizar
```

**ou** pelo **Sicoobnet Empresarial** — quem não conseguir pelo celular tem web.

📄 **Só PJ nasce `pendente`.** Conta PF sai ativa direto de "Meus aplicativos". A G3 é PJ, então é o caminho de cima.

> ### ⚠️ "Os responsáveis pela conta" — no plural
>
> 📄 O manual escreve que *"será necessário que **os responsáveis pela conta** autorizem"*. **Se a conta PJ da G3 tiver mais de um responsável, ou exigir autorização conjunta, a ativação depende de mais de uma pessoa.**
>
> É **conferência de dois minutos hoje** e descoberta cara depois: o momento errado de saber disso é com o A1 comprado e o aplicativo parado em `pendente`. Entra como **`Q-SICOOB-AUTORIZA-01`**.

| | Resposta |
|---|---|
| Dá para marcar **Cobrança Bancária v3**? | 📹 **sim** — é uma aba própria do fluxo |
| Dá para marcar **Pix (`cob`)**? | ❓ não visto. 📹 mostra outra coisa, e ela é mais importante — ver o aviso do Pix abaixo |
| Certificado pedido é **`.PFX` com senha + `.CER` Base-64**? | 👁 **a tela diz só "certificado digital"**, sem qualificar ICP-Brasil. O `+` abre o seletor de arquivos do sistema; o filtro aceito **não foi lido**. 📹 **o que se sobe é o `.PEM`**, gerado do `.PFX` por OpenSSL.<br>📄 **RESPONDIDO, e com a palavra que faltava:** *"certificado digital válido do **tipo A1** emitido pela **ICP Brasil** para o CNPJ/CPF do cooperado"*, e *"insira **somente a chave pública** do certificado no formato **`.PEM`, `.CRT` ou `.CER`**"* |
| Exige **dados da conta bancária** já aqui? | 👁 **SIM — e a conta da G3 JÁ APARECE.** A aba Informações confirma número da conta e nome do cooperado |

> ### ⚠️ A premissa do paralelismo CAIU, e ela estava escrita em dois documentos
>
> `PROXIMOS-PASSOS-2026-08-09.md` §B.1 (`B5`) e §B.5 afirmam que a conta PJ e o A1 *"correm em paralelo e **não bloqueiam o sandbox**"*. **Falso.** Não há aplicativo — nem de sandbox, até prova em contrário — sem **conta confirmada** e **certificado subido**.
>
> **O que isso custa à G3, hoje: quase nada.** A metade cara já estava resolvida sem ninguém perceber — 👁 **a conta PJ existe e o portal a reconhece.** Sobra o A1, que **não é emitido pelo Sicoob** e por isso continua comprável sem esperar mais ninguém.

> ### ⚠️ O Pix do boleto exige uma chave que a G3 não tem
>
> 📹 *"é necessário que o cliente crie uma chave Pix **aleatória** e mande para o **gerente vincular ao contrato** dele. Depois que essa chave Pix aleatória é vinculada ao contrato, a gente pode marcar o indicador de Pix."*
>
> A chave de produção da G3 hoje é **tipo `cnpj`** (`66714022000121`), e ela é a do **Pix estático** do documento. **São duas chaves diferentes**, com propósitos diferentes, e a segunda depende de um **ato do gerente da cooperativa** — não de tela nenhuma do portal.
>
> Isto não estava em lista nenhuma e entra como **`Q-SICOOB-PIXCHAVE-01`**.

## 4. Abra a tela de configuração de webhook

❓ **Não aberta.** O `P4` do `PROXIMOS-PASSOS` manda **não cadastrar nada** hoje — a rota existe desde a migration 16 mas ainda passa pelo autenticador de sessão, e o `ADR-0006` não foi implementado. Uma chamada da Sicoob não entraria.

| | Anote quando abrir |
|---|---|
| Além da URL, o que o campo aceita? | ☐ só a URL ☐ cabeçalho ☐ segredo ☐ outro: `______` |
| Menciona **mTLS / certificado de cliente / faixa de IP**? | ☐ sim, qual: `______` ☐ não |

## 5. Procure o contrato de cobrança

❓ **Não encontrados.** 📹 o vídeo mostra a confirmação de **número da conta e nome do cooperado** na criação do aplicativo, e **isso não é o contrato de cobrança** — são coisas distintas, e trocá-las é o modo de falha que o `contrato-medido` §4 nomeia.

Se não estiverem no portal, **é pergunta para a cooperativa** — não invente.

| | Anote aqui |
|---|---|
| `numeroCliente` | `________` |
| `numeroContratoCobranca` | `________` |
| `codigoModalidade` | `________` |

---

## O certificado: os três arquivos, e qual vai para onde

📹 O vídeo gera três arquivos a partir do `.pfx`, por OpenSSL:

```bash
openssl pkcs12 -in g3.pfx -nokeys          -out g3.pem   # SOBE NO PORTAL
openssl pkcs12 -in g3.pfx -clcerts -nokeys -out g3.crt   # nao precisamos
openssl pkcs12 -in g3.pfx -nocerts -nodes  -out g3.key   # NAO GERAR
```

**Ele gera os três porque o ERP dele consome `.crt` + `.key` separados. Nós não** — o `ADR-0005` decidiu que o A1 vai em base64 no cofre e o TLS do Node aceita `pfx` como `Buffer`.

| Arquivo | Destino | Por quê |
|---|---|---|
| **`.pem`** | **sobe no portal, uma vez, à mão** | é a parte **pública**. **Não é segredo, não entra no cofre**, e não tem nada a ver com a `credencial_ref` |
| **`.pfx` + senha** | **cofre**, resolvido para memória na chamada | `ADR-0005` decisão 5, intacta |
| **`.crt`** | 📄 **também serve para subir** | o manual aceita `.PEM`, `.CRT` **ou** `.CER`. Continua não sendo necessário, porque o `.pem` já resolve — e continua sendo alternativa ao `.pfx` para cliente HTTP que não aceita PKCS#12. O Node aceita |
| **`.key`** | **não gerar** | o `-nodes` **remove a senha da chave privada**. Chave privada em claro é exatamente o que o `ADR-0005` §110 descartou ao recusar o certificado em disco. Se for gerado por engano, apagar |

**A decisão do `ADR-0005` sobrevive inteira.** O que ela ganha é uma distinção que não estava escrita: existe um artefato **público** que é subido manualmente e **não** é segredo, e confundi-lo com o `.pfx` poria a chave privada num formulário web.

> 📄 **E o banco escreve isso com todas as letras:** *"insira **somente a chave pública** do certificado"*. **A distinção deixou de ser dedução nossa e virou instrução dele.** O risco que valia a pergunta — o formulário pedir o `.pfx`, e a chave privada subir num campo web — **não existe**.

> ### 📄 O `.CER` nunca foi divergência — correção de registro
>
> Esta folha registrou, em 13/08, que *"o que sobe é `.PEM` em vez de `.CER` — mesma parte pública, outra extensão"*, tratando a suposição original como corrigida pelo vídeo.
>
> **Os dois estavam certos.** O formulário aceita **as três extensões**. A suposição original (`.CER`) não era erro, e o vídeo não a corrigiu — mostrou **uma das três**.
>
> **Não muda o procedimento:** continua saindo **um** arquivo público do `.pfx`, e continua sendo o `.pem`. Muda só o que se acreditava ter sido descoberto.

> ### 📄 A instrução oficial de exportação existe, e NÃO foi lida
>
> O manual aponta: `portal/documentacao` → **Segurança** → **Certificado Digital** → *"Como eu exporto o certificado para gerar o aplicativo?"*.
>
> **Tentado em 13/08: o portal de documentação é SPA e não devolve conteúdo sem navegação autenticada.** Fica **ponteiro, não medição**. Quando o A1 existir, é essa página que substitui os comandos do vídeo por 📄 — e é ela que se abre **antes** de rodar o OpenSSL. Até lá o comando do 📹 é o que temos, e ele confere com o que o manual pede.

## A empresa parceira — o interruptor da aba Segurança

📹 O vídeo manda marcar que a integração **não** é de empresa parceira, porque quem integra é o titular da conta. **É o caso da G3**, e a recomendação de 13/08 é essa.

📄 **O manual confirma o interruptor e a bifurcação:** *Sim* → escolhe-se a parceira numa lista; *Não* → **é aí que o certificado A1 é exigido**. Ou seja, **quem marca "sim" não sobe certificado nenhum** — quem responde pela identidade é a parceira.

📄 **E acrescenta um efeito que ninguém tinha perguntado:** *"nos casos de integração com empresa parceira, ficarão disponíveis (em cores) apenas as APIs que a empresa oferece"*. **O catálogo da parceira limita o do cooperado** — quem integra por terceiro só alcança o que o terceiro já oferece.

O que é **certo**, independente da semântica exata do Sicoob:

- o certificado carrega um CNPJ, e **quem tem a chave privada autentica como aquele CNPJ**;
- com certificado de terceiro, **a G3 não revoga sozinha** — vira conversa com o Sicoob;
- a **renovação anual** passa a depender do calendário do terceiro, e o vencimento derruba a emissão;
- o cofre da G3 guardaria **chave privada de outra empresa**: custódia sem controle.

O que **não** está medido — **e o manual não respondeu nada disto**: se a parceira precisa ser homologada antes, se o interruptor muda o contrato da API, e **se um certificado de parceira atende vários cooperados** — esta última importa para nós, porque no dia em que a G3 rodar o financeiro para outra empresa solar **a G3 vira a parceira**, e um certificado para vários cooperados é o oposto da credencial por tenant do `ADR-0005`. Registrado como **`Q-SICOOB-PARCEIRA-01`**.

---

## O que cada resposta muda aqui dentro

| Se… | Então… | Estado |
|---|---|---|
| **não houver `client_secret`** | o certificado *é* a credencial, e a resolvedora do `ADR-0005` devolve **A1 + `client_id`** | 📹 **é este o caso** |
| **der para marcar Pix (`cob`)** | a cobrança ganha `txid` e concilia sozinha | ❓ e agora tem pré-requisito: **chave aleatória vinculada pelo gerente** |
| **o certificado divergir** do `.PFX` + `.CER` | o `ADR-0005` precisa saber **antes** de alguém comprar o A1 | 📄 **NÃO DIVERGIU, e nem na extensão**: é A1 ICP-Brasil, e sobem **`.PEM`, `.CRT` ou `.CER`** — a suposição original estava certa. E o manual diz *"somente a chave pública"*, que é a garantia que faltava |
| **exigir conta bancária no cadastro** | sandbox deixa de ser paralelo à abertura da conta PJ | 👁 **exige — e a conta da G3 já existe**, então o efeito é nulo para nós |
| **o webhook não oferecer mTLS, cert nem IP** | vale o **plano B** já nomeado no `ADR-0006` | ❓ tela não aberta |
| **os três campos do item 5 não estiverem lá** | pergunta para a cooperativa | ❓ **não estavam** |

---

## ⚠️ Ao cadastrar o webhook

O Sicoob **acrescenta `/pix` ao final da URL**. Registrar `…/api/pix` faz o POST chegar em `…/api/pix/pix` — 404 garantido. **Anote a URL exatamente como digitou.**

---

## O que falta, em ordem

**Dois preparos de dois minutos, antes de gastar dinheiro** — 📄 os dois saíram do manual, e os dois falham tarde demais se não forem feitos agora:

- **0a.** conferir **quantos responsáveis** a conta PJ tem e se a autorização de API exige mais de um (`Q-SICOOB-AUTORIZA-01`);
- **0b.** conferir que as **notificações do App Sicoob estão ativas** — é por elas que chega o segundo fator do passo 4.

1. **Comprar o A1 e-CNPJ** ICP-Brasil pelo CNPJ **66.714.022/0001-21** — A1, **não A3**, arquivo `.pfx`/`.p12` com senha. É o **único** item externo restante. 📄 **confirmado pelo manual do banco**, e não mais só por vídeo;
2. **abrir a instrução oficial de exportação** (`portal/documentacao` → Segurança → Certificado Digital) e gerar o **`.pem`** — o comando do 📹 confere, mas a fonte 📄 é preferível e existe;
3. criar o aplicativo. 📄 **e há dois portões antes do formulário**: login do **App Sicoob Mobile Banking** e o **segundo fator**. Depois: nome, **não é empresa parceira**, `.pem` no `+` (📄 `.crt` e `.cer` também serviriam), **Cobrança Bancária V3**, confirmar;
4. **autorizar** — 📄 App Sicoob → pesquisa → **"Transações Pendentes / Detalhamento"** → **"Autorização para Uso de APIs"** → senha; **ou** pelo **Sicoobnet Empresarial**. Sem isso o aplicativo fica `pendente` e o `client_id` não serve;
5. anotar o `client_id` e **conferir se aparece algum segundo campo** — é o que transforma o `B2` de 📹/📄 em 👁, **e é o que autoriza a emenda `r2` do `ADR-0005` §38**;
6. perguntar à cooperativa os três campos do item 5, e a **chave Pix aleatória vinculada ao contrato** se o Pix no boleto for adotado. 📄 **o manual não trouxe nenhum dos dois** — ver a repartição por destinatário em `RESPOSTA-gerente-sicoob-2026-08-13.md` §6;
7. **aí sim** o `src/sicoob/http.ts` pode ser escrito.

## O que o portal NÃO resolve

- ~~**A conta PJ na cooperativa singular**~~ — 👁 **já existe**, e o portal a reconhece;
- **O certificado A1** — é de AC ICP-Brasil, **não do Sicoob**, e não depende de mais ninguém;
- **A primeira fatura** — ela não depende de nada disto. O que a segura é planilha e decisão sua, não a Sicoob.
