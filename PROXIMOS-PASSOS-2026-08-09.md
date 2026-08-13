# PRÓXIMOS PASSOS — 09/08/2026

| Campo | Valor |
|---|---|
| **Para quem** | quem for executar. **Duas frentes, isoladas**: cada seção se lê sozinha, sem depender da outra |
| **Base** | `README.md`, `RESUMO-SESSAO-24.md`, `RETOMADA-2026-08-08.md` — e, para não responder pelo índice, `PLANO-leitura-fatura-equatorial-2026-08-07.md` (bloco de 08/08), `SICOOB-portal-2026-08-06.md`, `SICOOB-contrato-medido-2026-08-05.md` e `adr/ADR-0006` |
| **Não substitui** | a `RETOMADA-2026-08-08.md`. Ela continua sendo onde tudo parou; este arquivo é só o que vem **depois**, por frente |
| **O que este arquivo NÃO cobre** | a fila da **primeira fatura** (`RETOMADA` §1) — quatro planilhas e três decisões. **Nenhuma das duas frentes a move**, e ela é a que produz receita |
| **Estado do repositório** | árvore **limpa** em `e563b59`; o trabalho de 07–08/08 está em `main`. Nada publicado — ver a correção abaixo |

> **Correção de registro.** A `RETOMADA-2026-08-08` §7 e §8 dizem que há trabalho *"por comitar"*. **Não há** — está tudo comitado (`978b2b6` → `e563b59`). Continua verdade que **nada foi publicado**, e publicar é ato do dono.

> **Regra 10 aplicada aqui:** nada neste arquivo decide o que tem dono. Onde há escolha, ela aparece com o ID da questão e o nome de quem decide.

---

# FRENTE A — Equatorial: leitura automática da fatura

## A.0 Onde ela está

| | |
|---|---|
| ✅ **canal** | **e-mail**, decidido pelo dono em 08/08 (`Q-EQTL-CANAL-01`). O Playwright sai da coleta de rotina |
| ✅ **fase B1** | `src/dominio/fatura-concessionaria.ts`, `src/concessionaria/{porta,falso}.ts`, **44 verificações** no `npm test`. **Intacta pela decisão do canal** — `PortaDeColetaDeFatura` nunca soube se o PDF vem de navegador ou de caixa de entrada |
| 🔴 **o que a parou** | **duas coisas, e nenhuma é código**: falta uma fatura **com geração distribuída**, e a data de nascimento do login **não existe no CRM** (medido em três níveis, `RETOMADA` §3.3) |

## A.1 O que fazer, e não é código

Os três primeiros são **independentes entre si** e podem correr em paralelo.

| # | Passo | Dono | O que destrava |
|:--:|---|---|---|
| **A1** | **Baixar a fatura de UMA das 29 UCs** que faturam — todas têm rateio ativado, logo têm compensação. Qualquer uma serve | **dono** | é o único passo que destrava **código**: `Q-EQTL-CAMPOS-01`, a fase B2 e o extrator |
| **A2** | **Pedir a fatura por e-mail de UMA UC** e olhar o que chega: **anexo ou link** | **dono** | `Q-EQTL-CAIXA-01` — endereço, protocolo, e a única coisa que pode **reabrir a decisão do canal** |
| **A3** | **Mandar o `PROMPT-dev-crm-rodada7-2026-08-08.md`** — o CRM tem data de nascimento? | dev do CRM | a configuração das 29 UCs no portal (D″), e **só ela** |
| **A4** | **`Q-EQTL-ESCOPO-01`** — as **41** UCs ativas ou as **29** que faturam? | **dono** | a migration 26 |
| **A5** | **`Q-EQTL-CRED-01`** — onde moram UC + CPF/CNPJ + nascimento. O `ADR-0005` já decidiu o cofre; esta frente é o **segundo consumidor** dele, não um cofre novo | **dono** | a migration 26, junto com A4 |
| **A6** | **`Q-EQTL-AUTORIZACAO-01`** — consentimento do cliente para redirecionar a fatura **dele**, e achar os **termos de uso** (o que veio do portal foi a *política de privacidade*; são documentos diferentes) | **dono** | a configuração das 29 UCs |

**Por que A1 primeiro.** É o único ponto da frente inteira em que a espera é nossa e não de terceiro. Enquanto a amostra for a residencial convencional, `CamposDaFatura` continua desenhado contra o `PRD` e não contra um documento real.

## A.2 O que é código, na ordem em que se torna escrevível

| # | O quê | Bloqueado por |
|:--:|---|---|
| **B2** | ajustar `CamposDaFatura` ao layout de **GD** | A1 |
| **E** | o **extrator determinístico** — o PDF tem camada de texto, então é custo zero por documento e o modelo de visão vira caminho de exceção. Escrever contra **os bytes do PDF real**, escolhendo a biblioteca de extração **antes** | A1 + B2 |
| **D′** | o **leitor de caixa de entrada** | A2 |
| **C** | **migration 26** — e **com deploy em seguida**, sempre | A4 + A5 |
| **D″** | configurar as **29 UCs** no portal, uma vez cada (é aqui que a data de nascimento é necessária, e **só aqui**) | A3 + A6 + o item 1.1 da fila |
| **F–H** | script, aplicar na competência, agenda. `Q-EQTL-DIVERG-01` só importa em *aplicar* | C + E |

## A.3 O que já está medido e não se re-decide

- a identidade estável da fatura é a **chave de acesso NF3e** (44 dígitos), **não o `sha256`** — o PDF carrega data de emissão e protocolo, e reemitir gera bytes novos para a mesma fatura;
- o **total a pagar** entra como **conferência e nunca como fonte** de `valor_tarifas_concessionaria`. A soma é explícita por componente, e `F2c` afirma que os dois são diferentes de propósito;
- a competência sai como **`FEV/2026`**, e a UC sai **sem zeros à esquerda** (8 dígitos significativos, contra 15 na nossa base) — o padding de `F4a` é mais necessário do que parecia;
- a **iluminação pública** do `PRD` §5.1 é a linha `CONTRIB. ILUM. PÚBLICA - MUNICIPAL`, sob `ITENS FINANCEIROS`;
- **não existe linha chamada "encargos"** — eles vão embutidos na tarifa;
- os **tributos vêm destacados mas embutidos**. Somá-los cobra tributo duas vezes.

## A.4 O que NÃO fazer nesta frente

- **não redesenhar `CamposDaFatura` contra a fatura convencional** — ela não tem fio B, e ajustar o conjunto de campos a ela é a mesma adivinhação de antes, com mais confiança;
- **não escrever o extrator contra o texto já lido** — aquele dump veio do conversor do Google Drive, e cada extrator achata o layout de um jeito diferente. Um parser ajustado ao achatamento estaria ajustado ao **instrumento**, não ao documento;
- **não supor que a data de nascimento está no CRM.** Está medido que não está — nas 10 views, no catálogo inteiro e na nossa base;
- **não aplicar a migration 26 sem o deploy em seguida.** A guarda de arranque recusa subir com tabela em `public` sem modelo no client, e um restart derruba o site.

---

# FRENTE B — Sicoob: conexão de cobrança

> ## ⚠️ CORREÇÃO DE 13/08/2026 — o portal foi aberto, e duas coisas desta seção estão erradas
>
> A folha `SICOOB-portal-2026-08-06.md` está **preenchida**, com proveniência marcada linha a linha. O que ela derruba:
>
> 1. **O paralelismo não existe.** Esta seção afirma, em `B5` e em §B.5, que a conta PJ e o A1 *"correm em paralelo e **não bloqueiam o sandbox**"*. **Falso** — a aba *Segurança* da criação de aplicativo **exige o certificado**, e a de *Informações* confirma conta e cooperado. Sem os dois não há aplicativo, logo não há `client_id`;
> 2. **A conta PJ já existe** e o portal a reconhece — a metade cara do `B5` estava resolvida sem ninguém ter medido. Por isso a queda da premissa custou pouco.
>
> **O que sobra é UM item externo: o A1 e-CNPJ** (A1 e não A3, `.pfx` com senha, CNPJ `66714022000121`), de AC ICP-Brasil e **não do Sicoob** — comprável sem depender de mais ninguém. Decidido em 13/08: **comprar**.
>
> **E o `B2` está respondido: não há `client_secret`.** O certificado *é* a credencial, e a resolvedora do `ADR-0005` devolve **dois** campos. Ver `Q-SICOOB-01`, e as duas questões novas — `Q-SICOOB-PIXCHAVE-01` e `Q-SICOOB-PARCEIRA-01`.
>
> **O bloco 1 abaixo continua válido como roteiro do que ainda não foi visto** — os itens 4 (webhook) e 5 (contrato de cobrança) seguem em branco, e é neles que a folha ainda tem lacuna.
>
> ### 13/08, à tarde — o gerente respondeu, e a resposta foi um manual de portal
>
> Registro em `RESPOSTA-gerente-sicoob-2026-08-13.md`. O documento é do **próprio Sicoob** (22/11/2024) e responde **3 das 7 perguntas** — as três do certificado:
>
> - **A1 ICP-Brasil** para o CNPJ do cooperado, confirmado por fonte primária e não mais por vídeo;
> - **sobe somente a chave pública**, em `.PEM`, `.CRT` **ou** `.CER`. O risco que motivou a pergunta — o formulário pedir o `.pfx` — **não existe**, e o `ADR-0005` sai **confirmado, não emendado**;
> - qualquer AC do ICP-Brasil serve.
>
> **A compra do A1 deixou de ter pergunta em aberto.** É o que esta resposta destrava, e é só isso: **nenhuma linha de código passou a ser escrevível.**
>
> **As quatro que não vieram são as quatro que travam** — sandbox (`1d`), os três campos do contrato (`B4`), a chave Pix (`Q-SICOOB-PIXCHAVE-01`) e a autenticação do webhook (`Q-WEBHOOK-01`). **A lição é de destinatário, e ela vale para a repergunta:** três delas nunca foram de gerente de conta. A repartição está na §6 do registro.
>
> **E o manual trouxe três coisas que ninguém tinha perguntado:** há um **terceiro login** no meio da criação do aplicativo (App Sicoob Mobile Banking, que não é a senha do portal nem o token da API), o **segundo fator trava o fluxo** e depende de notificação ativa no celular, e a **ativação do PJ** tem caminho exato — mais um segundo caminho, o **Sicoobnet Empresarial**. Do plural em *"os **responsáveis** pela conta"* nasceu a **`Q-SICOOB-AUTORIZA-01`**: dois minutos de conferência que vêm **antes** de comprar o A1, porque descobrir que falta um segundo autorizador depois do desembolso custa a espera mais o dinheiro já gasto.

## B.0 Onde ela está

| | |
|---|---|
| ⏸️ **por que parou** | **pedido do dono** — última etapa. Não é bloqueio técnico |
| ✅ **decidido** | `ADR-0005` (cofre do segredo) e `ADR-0006` (as **quatro** decisões do webhook: mTLS + faixa de IP · tenant pela credencial · usuário de serviço por tenant · a rota **declara** o modo de auth) |
| ✅ **medido** | os três verbos da porta, com caminho, corpo, resposta e erro — `SICOOB-contrato-medido-2026-08-05.md`. **Nunca exercido contra a API real** |
| ✅ **13/08** | **portal aberto, conta PJ reconhecida, `B2` respondido** — folha preenchida |
| ✅ **13/08, tarde** | **manual do Sicoob recebido do gerente** — o certificado deixou de depender de vídeo de terceiro, e **a compra do A1 não tem mais pergunta em aberto**. Não destrava código |
| 🔴 **não existe** | `src/sicoob/http.ts`. O que existe é `porta.ts` e `falso.ts` |
| 🔴 **externo** | **o A1 e-CNPJ, e só ele** (`Q-SICOOB-01`). A credencial deixou de ser incógnita: é o próprio certificado mais o `client_id` |
| 🔴 **sem dono certo** | **três perguntas foram para o gerente e não eram dele** — sandbox e webhook são do suporte técnico, os três campos do contrato são da cooperativa. Reperguntar tudo a ele não traz resposta |

**E o que nada disto move:** a primeira fatura. O meio de pagamento de hoje é o **Pix estático**, já no ar com a chave cadastrada, e a triagem não recusa por ausência de boleto.

## B.1 O que fazer, e não é código

**As cinco ações, em resumo** — e três delas (`B1`, `B2`, `B4`) são **o mesmo acesso ao portal**, não três tarefas:

| # | Passo | Dono | O que destrava |
|:--:|---|---|---|
| **B1** | **Cadastro em `developers.sicoob.com.br` e credencial de *sandbox*** — uma passada só, com a folha `SICOOB-portal-2026-08-06.md` preenchida enquanto navega | **dono** | transforma o contrato medido em código **exercitável no mesmo dia**. É a coisa mais barata das duas frentes |
| **B2** | **Confirmar se existe `client_secret`** (item 2 da folha) | **dono**, no mesmo acesso | em Keycloak sobre mTLS o certificado *é* a credencial — muda **o que a resolvedora do `ADR-0005` devolve** |
| **B3** | **Decidir boleto, Pix `cob`, ou os dois** | **dono** | se der para marcar `cob`, a cobrança ganha `txid` e **concilia sozinha** — reordena a fila inteira |
| **B4** | **`numeroCliente`, `numeroContratoCobranca`, `codigoModalidade`** — se não estiverem no portal, é pergunta à **cooperativa** | **dono** | são a identidade do cooperado e **não se derivam** de `conector_cobranca` |
| **B5** | ~~Conta PJ na singular~~ ✅ **já existe** + **certificado A1 e-CNPJ** (A1, **não A3**) | **dono** / externo | **TUDO.** 13/08: não corre em paralelo — o certificado é exigido para criar o aplicativo. É o **único** item externo que sobrou |

Abaixo, cada uma em passo executável. **Os nomes de tela vêm da folha `SICOOB-portal-2026-08-06`, que foi escrita a partir de documentação e não de navegação.** Se o portal estiver diferente, **isso é achado — anote o que apareceu e siga**; não adivinhe o equivalente.

---

### Bloco 1 — uma sessão de navegador, de uma vez só

Abre `SICOOB-portal-2026-08-06.md` numa aba e o portal na outra. **Preencher enquanto navega, não depois** — voltar custa mais que anotar.

Os seis passos abaixo são **`P1`–`P6`**, e não se confundem com as ações `B1`–`B5` da tabela: os passos são a navegação, as ações são o que ela responde.

#### P1 · Criar a conta e chegar ao Dashboard

1. Abrir **`https://developers.sicoob.com.br`**;
2. criar conta / entrar;
3. chegar ao **Dashboard**.

> **Se o cadastro exigir vínculo de cooperado, conta ou contrato que ainda não existe: pare e anote o que ele pediu.** Esse é o achado mais caro da sessão inteira — ele derruba a premissa de que o sandbox corre **em paralelo** à abertura da conta PJ (`B5`), e reordena as duas frentes. Não é motivo para abandonar a sessão; é motivo para escrever exatamente o que a tela exigiu.

#### P2 · Anotar o que o Dashboard mostra → **item 2 da folha** · responde o `B2`

Quatro campos, e **o segundo é o `B2`** — a resposta mais importante da sessão:

| Anotar | Por que, e contra o que conferir |
|---|---|
| `client_id` de sandbox | entra no cabeçalho `client_id` de **toda** chamada (`contrato-medido` §1) |
| **Existe `client_secret`?** ☐ sim ☐ não | **é o `B2`.** Se **não** existir, o certificado *é* a credencial e a resolvedora do `ADR-0005` devolve **A1 + `client_id`**, sem terceiro campo. Muda o que se escreve, não só o que se guarda |
| URL base de sandbox | **conferir contra** `https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3` |
| Endpoint de token | **conferir contra** `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token` |

**Baixar a coleção Postman / OpenAPI**, guardar o arquivo e **anotar na folha onde ele ficou**. É a única fonte que dá para reler depois sem voltar ao portal.

> **Divergência nas duas URLs é barata agora e cara depois.** Elas nascem dentro do `src/sicoob/http.ts`; achá-las erradas no primeiro `POST` custa uma sessão de depuração contra uma API que ninguém nunca exercitou.

#### P3 · Abrir a tela de cadastro de aplicativo — **e não concluir** → **item 3 da folha**

É para **olhar o formulário**, não para criar o aplicativo. Quatro respostas:

| Anotar | O que a resposta muda |
|---|---|
| Dá para marcar **Cobrança Bancária v3**? | é a API dos três verbos já medidos |
| Dá para marcar **Pix (`cob`)**? ☐ sim ☐ não ☐ é outro aplicativo | **alimenta o `B3`** — é o dado que falta para decidir |
| Certificado pedido é **`.PFX` com senha + `.CER` Base-64**? | se divergir, **o `ADR-0005` precisa saber antes de alguém comprar o A1** (`B5`) |
| Exige **dados da conta bancária** já aqui? | se sim, o sandbox deixa de ser paralelo à conta PJ — mesma consequência do aviso em **`P1`** |

#### P4 · Abrir a tela de configuração de webhook — **e não cadastrar nada** → **item 4 da folha**

| Anotar | O que a resposta muda |
|---|---|
| Além da URL, o que o campo aceita? ☐ só URL ☐ cabeçalho ☐ segredo ☐ outro | se aceitar **cabeçalho**, contradiz a medição de 06/08 (`ADR-0006` §2.3) — e as opções A e B voltam à mesa |
| Menciona **mTLS / certificado de cliente / faixa de IP**? | é a confirmação da **Decisão 1** do `ADR-0006`. Ausência das três aciona o **plano B nomeado** (§3), que é revisão prevista, não reabertura |

**Por que não cadastrar a URL hoje:** a rota existe desde a migration 16, mas hoje ela passa pelo autenticador de sessão e **o `ADR-0006` ainda não foi implementado** — uma chamada da Sicoob não entraria de qualquer forma. Cadastrar agora é registrar um endereço que ainda recusa, e depois esquecer que registrou.

**Quando for cadastrar** (depois do item **3** da §`B.2`, que é o webhook do `ADR-0006`), a URL é:

```
https://financeiro.blackhaus.io/api/liquidacoes/webhook-sicoob
```

e **anota-se exatamente como foi digitada** — o Sicoob acrescenta `/pix` ao final (medido no manual da API Pix, `ADR-0006` §2.3), e uma URL terminada em `/pix` vira `…/pix/pix`: 404 silencioso.

#### P5 · Procurar o contrato de cobrança → **item 5 da folha** · responde o `B4`

`numeroCliente` · `numeroContratoCobranca` · `codigoModalidade`.

**Pode não estar no portal.** Se não estiver, **é ligação para a cooperativa singular** — e é pergunta, não dedução. `conector_cobranca` tem `numero_contrato`, `numero_convenio`, `agencia` e `conta`, e **qual mapeia para qual não está medido**. Preencher esses três por semelhança de nome é o modo de falha que o `contrato-medido` §4 nomeia.

#### P6 · Fechar a sessão

1. **preencher as lacunas da folha e pôr a data** — o que foi *visto* e o que foi *suposto* não podem ficar iguais depois;
2. **comitar a folha preenchida.** Ela é o registro medido da sessão; sem commit, ela vira memória.

**Pronto quando** — a folha não tem mais nenhum `________` nem `☐` em branco, ou tem, e ao lado está escrito *por que* ficou em branco.

---

### Bloco 2 — fora do portal

#### B3 · Decidir boleto, Pix `cob`, ou os dois

**Depois do bloco 1**, com o item 3 da folha respondido. É decisão sua, e é a que reordena a fila:

| Caminho | O que ele custa | O que ele dá |
|---|---|---|
| **só boleto** | depende do `B4` (identidade do cooperado) e da conciliação por webhook + consulta ativa diária | o documento que o `PRD` §4.3 descreve, e o `layout-visual` já desenha |
| **Pix `cob`** | pode ser **outro aplicativo** no portal — o item 3 da folha diz | a cobrança ganha `txid` e **concilia sozinha**; não depende do contrato de cobrança |
| **os dois** | duas integrações | é o híbrido do `PRD` §4.3 — e o `POST /boletos` já traz o BR Code na resposta com `"codigoCadastrarPIX": 1` |

**Esta decisão não tem prazo da primeira fatura.** O meio de pagamento no ar hoje é o **Pix estático**, com a chave cadastrada, e a triagem não recusa por ausência de boleto.

> **Esta escolha ainda não tem ID em `QUESTOES.md`** — hoje ela existe só aqui. Quando for tomada, entra lá com decisor e data, como as outras (regra 10).

#### B5 · Conta PJ e certificado A1 — ~~corre em paralelo, não bloqueia nada do bloco 1~~

> **13/08: este título estava errado, e o corpo abaixo fica com as correções em linha.** Não corre em paralelo — o certificado é exigido para **criar o aplicativo**. Ver a correção no topo desta frente.

1. ~~**conta PJ na cooperativa singular** que atende a G3~~ — ✅ **ela já existe**, medido em 13/08: o portal confirma número da conta e nome do cooperado na criação do aplicativo;
2. **certificado A1 e-CNPJ ICP-Brasil** pelo CNPJ da G3 (`66714022000121`) — ✅ **formato confirmado em 13/08: `.pfx`/`.p12` com senha, A1 e NÃO A3.** O que sobe no portal é o **`.pem`** derivado dele (parte pública), não o `.cer` que esta linha supunha — mesma coisa, outra extensão. **Decidido: comprar**;
3. **o A1 não vai para o disco do VPS.** O `ADR-0005` descartou isso por decisão: ele entra em **base64 no cofre** e é resolvido para memória na hora da chamada — o TLS do Node aceita `pfx` como `Buffer`;
4. **o A1 vence.** `conector_cobranca.certificado_expira_em` alerta, mas **o procedimento de troca não existe** — é questão aberta do `ADR-0005` §6, e vira problema quando a data chegar, não antes.

## B.2 O que é código, na ordem em que se torna escrevível

**Nada desta tabela é ação sua — com duas exceções, marcadas.** É o que passa a ser escrevível *depois* do bloco 1.

| # | O quê | Bloqueado por | Sua ação? |
|:--:|---|---|---|
| **1** | **a resolvedora do `ADR-0005`**, povoada | B2 (e é o **ponto de encontro com a Frente A** — `Q-EQTL-CRED-01` usa o mesmo cofre) | **sim, em parte** — *quem escreve no cofre* é questão aberta do `ADR-0005` §6, e a role de runtime não pode ter `INSERT` em `vault.secrets`. Povoar o cofre é provisionamento, e é seu |
| **2** | **`src/sicoob/http.ts`** — os três verbos já medidos | B1 + B4 + item 1 | não |
| **3** | **o webhook do `ADR-0006`** | item 2 + a verificação empírica do sandbox | não — mas é ele que precisa existir **antes** de você cadastrar a URL (`P4`) |
| **4** | **TLS chegando ao Node**, ou proxy repassando o certificado de cliente | infraestrutura — ver abaixo | **a autorização é sua, a execução não.** Roda por SSH do Codespace, e mexe no proxy do **VPS compartilhado com o CRM** |
| **5** | **endereço** (`npm run enderecos`, item 2.5 da fila) e **documento** do pagador (`Q-PAGADOR-01`) | operação — só o boleto depende deles | **sim** — é planilha, e cai na mesma fila da primeira fatura |

**As armadilhas do item 2, todas já medidas:**

- **`valor` é decimal, não centavos.** A conversão é **por texto**, nos dois sentidos — e **falta a volta**: `src/dominio/centavos.ts` tem `reaisParaCentavos`, e `emReais` é **apresentação** (`R$ 1.234,56`, com separador de milhar), não serve para o JSON. `centavosParaReaisDecimal` precisa nascer com o adaptador;
- **`situacaoBoleto` é texto livre em português.** O que não casar cai em `desconhecida` — nunca em `em_aberto`, senão o sistema acha que ninguém pagou;
- **`endereco` é UMA string** lá, e três campos aqui. Quem concatena é o adaptador;
- **`pdfBoleto` e o `email` do pagador** — campos deles que não temos. Ignorados **de propósito**, não esquecidos. `pixTxid` não vem na resposta: ou sai de dentro do BR Code, ou fica nulo.

**O que o item 3 acarreta, e está escrito antes de alguém codar:**

- `auth: 'webhook'` **não** significa "sem autenticação" — significa autenticado por outro mecanismo, que é o mTLS. Rota marcada `webhook` sem verificação de certificado é um buraco com nome bonito;
- **recusa por ausência**: sem certificado verificado, `404`. O modo de falha do proxy que não repassa o certificado é silencioso e indistinguível de uma requisição legítima;
- o **usuário de serviço por tenant** entra por `scripts/provisionar-tenant.sql` — provisionamento, não migration —, com o papel **mínimo** que faz `escrever_carteira` passar, e **sem caminho de login**;
- o item 4 é a **única mudança de infraestrutura** que o `ADR-0006` pede, e é no **mesmo VPS do CRM**: a verificação de certificado de cliente vale para o nosso `server`, e a promessa de não alterar uma linha da configuração dele precisa continuar verdadeira.

## B.3 O que NÃO fazer nesta frente

- **não escrever `src/sicoob/http.ts` antes do sandbox.** A razão está registrada em `SICOOB-contrato-medido` §5, e é a `Q-PECA-NAO-PLUGADA-01` com o agravante de parecer pronto: os campos de identidade entram por fora e o primeiro `POST` real vai corrigir alguma suposição;
- **não cadastrar a URL do webhook terminada em `/pix`** — e, hoje, **não cadastrar URL nenhuma** (o porquê está no `P4`). O Sicoob **acrescenta `/pix`** ao final: `…/api/pix` vira `…/api/pix/pix`, e é 404 garantido. Anotar a URL exatamente como digitada;
- ~~**não assumir que o `client_secret` existe** antes do `B2`~~ — **respondido em 13/08: ele NÃO existe.** O certificado *é* a credencial, e a resolvedora do `ADR-0005` devolve **A1 + `client_id`**, sem terceiro campo. O que continua valendo é a proveniência: isso veio de vídeo de terceiro, e vira medição nossa quando o painel do aplicativo criado mostrar (ou não) um segundo campo;
- **não gerar o `.key` do procedimento de terceiro.** Ele sai com `-nodes`, que **remove a senha da chave privada** — e chave privada em claro é exatamente o que o `ADR-0005` §110 descartou ao recusar o certificado em disco. O Node aceita `pfx` como `Buffer`, então o `.pfx` do cofre basta;
- **não tratar a ausência de webhook como emergência.** `GET /boletos/situacao` é a consulta ativa diária do `PRD` §6 e existe justamente para capturar liquidação cujo webhook falhou — o dinheiro chega no dia seguinte, e a baixa manual funciona hoje.

---

# O que as duas frentes têm em comum

Duas costuras, e só duas:

1. **O item 1.1 da fila** — CPF/CNPJ de **24 pessoas**, hoje em **0 de 29**. Destrava `contrato.ativar()` (R9) **e** o login do portal da Equatorial. É o primeiro item de duas filas;
2. **A resolvedora do `ADR-0005`** — o cofre é o mesmo para a credencial da Sicoob (`Q-SICOOB-01`) e para o par UC + CPF + nascimento (`Q-EQTL-CRED-01`). Quem escrever a primeira entrega a segunda quase pronta.

**Fora isso, elas não se tocam** — e nenhuma das duas produz a primeira fatura.

---

# Se a pergunta for "o que faço hoje"

Quatro coisas independentes, todas de navegador ou de e-mail, nenhuma delas código:

1. **baixar a fatura de uma das 29 UCs** (A1) — é o que destrava código;
2. **pedir a fatura por e-mail de uma UC** (A2) — e ver se vem anexo ou link;
3. **mandar a rodada 7 ao dev do CRM** (A3);
4. **abrir o portal do Sicoob com a folha na mão** — §`B.1`, bloco 1, passos `P1` a `P6`. É a coisa mais barata da fila e a única das quatro com roteiro passo a passo escrito: responde `B1`, `B2` e `B4` **no mesmo acesso**, e entrega o dado que falta para o `B3`.

Depois delas há código para escrever nas duas frentes. **Antes delas, quase nada** — e o pouco que dá para escrever é a `Q-PECA-NAO-PLUGADA-01` de novo.
