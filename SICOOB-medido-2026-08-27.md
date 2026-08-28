# SICOOB — o que foi medido em 27/08/2026, e o adaptador que nasceu disso

| Campo | Valor |
|---|---|
| **Medido em** | 27/08/2026, da VPS de produção |
| **Fonte** | **Primária.** O `openid-configuration` do próprio realm e as respostas do sandbox da própria Sicoob. Não é documentação lida nem vídeo de terceiro |
| **Não substitui** | `SICOOB-contrato-medido-2026-08-05.md` — aquele é registro datado do que se sabia em 05/08, e reescrevê-lo falsificaria o registro. Este é o que mudou |
| **O que ele destravou** | `src/sicoob/http.ts` foi escrito, e passa 51 verificações + 6 contra a Sicoob de verdade |

> **O gatilho foi o certificado A1 chegar às mãos do dono.** Mas o que efetivamente
> destravou o código não foi o certificado — foi descobrir que **duas das três razões
> registradas para não escrever o adaptador tinham caído**, e que uma delas caiu por
> uma medição que ninguém tinha tentado fazer.

---

## 1. O que o realm declara — e a pergunta que fecha

`GET https://auth.sicoob.com.br/auth/realms/cooperado/.well-known/openid-configuration` → **200**.

| Campo | Valor medido |
|---|---|
| `token_endpoint` | `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token` |
| `token_endpoint_auth_methods_supported` | `private_key_jwt`, `client_secret_basic`, `client_secret_post`, **`tls_client_auth`**, `client_secret_jwt` |
| `tls_client_certificate_bound_access_tokens` | **`true`** |
| `grant_types_supported` | inclui `client_credentials` |
| `scopes_supported` | 96 escopos, **29** deles `cobranca_boletos_*` / `boletos_*` |

### O que isso fecha

O `SICOOB-contrato-medido` §1 dizia: *"O `client_secret` pode não existir. Em Keycloak
sobre mTLS o certificado é a credencial. Qual das duas formas a Sicoob usa **não está
medido**, e muda o que a resolvedora do `ADR-0005` precisa devolver."*

**Agora está medido, e é a primeira forma.** O realm suporta `tls_client_auth` e emite
token **atado ao certificado** (`certificate_bound`). Consequências que valem para o
código, e as três estão implementadas:

1. a resolvedora devolve **A1 + `client_id`**, e nada mais — não há campo de segredo
   compartilhado a guardar no cofre;
2. um `access_token` roubado **sem a chave privada não serve**, porque o servidor
   confere o vínculo com o certificado da conexão;
3. o `SICOOB-portal` §"O que cada resposta muda aqui dentro" marcava esta linha como
   📹 (só vídeo). Passa a 📄 **medido em fonte primária do banco**.

### Os 29 escopos, e os 4 que pedimos

Existem 29. O adaptador pede **quatro**:

```
cobranca_boletos_incluir · cobranca_boletos_consultar · cobranca_boletos_baixa · cobranca_boletos_pix
```

Pedir os 29 seria pedir protesto, negativação e rateio de crédito para um sistema que
não protesta ninguém. **Escopo a mais é dano a mais no dia em que o token vazar.**

---

## 2. O sandbox responde — e é mock estático

Isto é a medição que mais muda o trabalho, e ela tem duas metades opostas.

| Chamada | Resultado |
|---|---|
| `GET /boletos?numeroCliente=…&codigoModalidade=1&nossoNumero=1` | **200**, com o boleto de exemplo completo |
| `POST /boletos/{nn}/baixar` | **204**, sem corpo — exatamente como a documentação diz |
| `POST /boletos` com **corpo vazio** | **400** · `{"mensagens":[{"mensagem":"string","codigo":"string"}]}` |
| `POST /boletos` com **corpo bem formado** | **400** · **a mesma resposta, caractere por caractere** |
| qualquer chamada **sem `client_id`** | **401** · `Invalid client id or secret` |

**A metade boa:** existe alguém do outro lado. Endereço, TLS, gateway e formato de
cabeçalho estão exercidos.

**A metade que importa:** o `POST /boletos` devolve **sempre** o exemplo de erro do
próprio OpenAPI. Ele não valida corpo, não registra nada e **não tem caminho de
sucesso**. Um adaptador testado só contra ele estaria testado contra uma parede.

> ### Por que isso mudou o desenho do arquivo
>
> É por causa desta medição que `Transporte` é injetável em `src/sicoob/http.ts`. Sem
> ela, a tentação seria "testar contra o sandbox e confiar" — e o caminho que **emite
> dinheiro** nunca teria sido exercido. Com ela, a divisão é explícita:
>
> - `tests/sicoob-http.ts` (51 verificações) exerce o caminho de sucesso contra
>   transporte próprio: o que sobe, o que desce, e o que falha;
> - `npm run ensaio-sicoob` (6 verificações) exerce transporte, TLS, cabeçalho e
>   parsing contra a Sicoob **de verdade**, e afirma que o `POST` dá `400` — se um dia
>   passar, o ensaio **falha** e avisa que o sandbox começou a validar.

### O `client_id` vai em cabeçalho, além do `Bearer`

Medido: chamada com `Authorization: Bearer` válido e **sem** o cabeçalho `client_id`
volta `401 Invalid client id or secret`. São dois mecanismos empilhados — o OAuth do
realm e o gateway da Sicoob —, e faltar o segundo produz um erro que **parece** de
token. O adaptador manda os dois em toda chamada.

---

## 3. A armadilha do A1 brasileiro no Node 22 — e ela não estava em documento nenhum

Esta não veio da Sicoob. Veio de gerar certificado de teste e tentar carregar.

| Ambiente | OpenSSL |
|---|---|
| `openssl` do sistema (Debian) | **3.0.13**, com provider `legacy` **ativo** |
| Node 22.20 (`process.versions.openssl`) | **3.5.2**, sem provider legacy |

Medido com dois `.pfx` gerados lado a lado do mesmo par de chaves:

| `.pfx` | `tls.createSecureContext` |
|---|---|
| **legado** — `pbeWithSHA1And40BitRC2-CBC` + MAC SHA1 | **`ERR_CRYPTO_UNSUPPORTED_OPERATION: Unsupported PKCS12 PFX data`** |
| **moderno** — AES-256 + PBKDF2 | carrega |
| **legado, depois de re-exportado** | carrega |

### Por que isso é grave e por que é silencioso

AC do ICP-Brasil ainda entrega A1 com a cifragem antiga. Nesse caso o certificado
**abre em todo teste manual** — `openssl pkcs12 -info` funciona, o Windows importa, o
navegador aceita — e falha **exatamente** no processo que emite boleto. O sintoma não
aparece em conferência nenhuma que não seja feita pelo próprio Node.

**Conserto, e ele está no código:** `npm run certificado -- normalizar` re-exporta com
AES-256. E `src/sicoob/http.ts` reconhece o erro pelo código e levanta
`CertificadoRecusado`, que **diz o que fazer** em vez de vazar `ERR_CRYPTO_*`.

> **A chave privada não toca o disco nisso.** `openssl pkcs12 -export` exige entrada
> **buscável** — medido: por pipe e por `/dev/fd/63` ele recusa com *"Could not read any
> certificates"*. O intermediário em claro vai para `/dev/shm` (tmpfs, RAM), modo 600,
> sobrescrito e apagado em seguida. O `ADR-0005` §D recusou "certificado em disco no
> VPS"; RAM por um segundo não é isso, e a alternativa seria não poder usar A1 antigo.

---

## 4. O dinheiro atravessa a fronteira sem virar float

O `SICOOB-contrato-medido` §3.2 chamou isto de *"a armadilha que mais custa"*: a API
fala **reais decimais** e o sistema inteiro é `Int` em centavos (regra 1).

**Na ida** existia saída sem float e ela custou três linhas: o corpo é serializado com
uma marca no lugar do valor, e o texto exato dos centavos entra por substituição.
`113000` sobe como `"valor":1130.00` no corpo cru — dígito a dígito, sem divisão.

**Na volta** o problema é pior e não estava escrito em lugar nenhum: `JSON.parse` já
entrega float antes de qualquer código nosso rodar. Medido hoje:

```
JSON.parse('{"v":0.07}').v * 100  ->  7.000000000000001
```

Não adianta converter "por texto" depois do parse — o texto já se perdeu. **O Node
22.20 expõe o literal original no terceiro argumento do reviver** (`ctx.source`), e é
ele que alimenta `reaisDecimalParaCentavos`. Testado: ida e volta fecham em 28.572
valores seguidos, por construção.

E `reaisDecimalParaCentavos` **não reusa** `reaisParaCentavos`, que existe e parece
servir. A gramática é outra: `"1.234"` em português é mil duzentos e trinta e quatro;
no literal JSON é um real e pouco. A mesma string, dois significados — a diferença
apareceria numa fatura de R$ 1.234,00 cobrada como R$ 1,23. A nova recusa três casas
decimais nomeando o motivo.

---

## 5. O `pixTxid` fica nulo, e é decisão, não omissão

A resposta traz `qrCode` (o copia-e-cola) e **não** traz campo de txid. A porta tem
`pixTxid`. O `contrato-medido` §3.3 deixou a escolha para quem escrevesse o adaptador.

Medido no payload de exemplo do sandbox: o campo 62, subcampo 05, vem **`***`** — que
na especificação do BACEN significa *"não se aplica"*. É o normal em cobrança
**dinâmica**, que é o caso do boleto híbrido.

**Sai de dentro do BR Code quando existe, e é `null` quando vem `***`.** O que
deliberadamente **não** se faz é pegar o UUID da URL do campo 26: aquilo é a
*localização do payload*, não o txid — conceitos diferentes na especificação, que
coincidem em alguns PSPs e não em outros. Gravar um pelo outro poria em
`boleto.pix_txid` um valor que não casa com nada na conciliação, e **identificador
errado é pior que campo vazio: o vazio ninguém tenta usar**.

---

## 6. O que continua NÃO medido

A terceira razão do `contrato-medido` §5 — *"a primeira chamada real vai corrigir alguma
suposição"* — **continua inteira**. Toda decisão não medida do adaptador carrega um
comentário `SUPOSICAO:` no ponto exato, e virou entrada no `QUESTOES.md`:

| O quê | Questão | Nível |
|---|---|:--:|
| `identificacaoEmissaoBoleto` / `identificacaoDistribuicaoBoleto` = `2` e `2` | `Q-EMISSAO-01` | 🔴 |
| `codigoEspecieDocumento` = `DM` | `Q-ESPECIE-01` | 🟡 |
| Consulta ativa não sabe o valor liquidado | `Q-LIQUIDACAO-CONSULTA-01` | 🟡 |
| Tamanho máximo de `seuNumero` | `Q-SEUNUMERO-01` | 🟢 |
| Trilha de acesso ao cofre — implementada, não decidida | `Q-COFRE-01` | 🟢 |
| `numeroCliente`, `codigoModalidade`, `numeroContratoCobranca` | **pergunta à cooperativa** | 🔴 |
| Formato da data no `POST` (longa com fuso vs. `AAAA-MM-DD`) | dentro de `dataSicoob()`, um lugar só | — |
| Como a Sicoob autentica no **nosso** webhook | `ADR-0006` / `Q-WEBHOOK-01` | 🔴 |

**Os três campos de identidade são o bloqueio maior**, e o banco agora recusa por eles:
`conector_ativo_tem_identidade` (migration 35) impede ligar conector Sicoob sem os três,
e `CredencialIncompleta` nomeia qual falta em vez de mandar um corpo pela metade.

---

## 7. O que existe agora, e o que ainda não

| Peça | Estado |
|---|---|
| `src/sicoob/porta.ts` · `falso.ts` | já existiam |
| **`src/sicoob/http.ts`** | **escrito** — Cobrança v3 sobre mTLS, 3 verbos, cache de token |
| **`src/sicoob/cofre.ts`** | **escrito** — resolvedora do `ADR-0005` opção A |
| **migration 35** | **escrita, NÃO aplicada** — cofre, trilha e identidade do cooperado |
| **`scripts/certificado.ts`** | **escrito** — conferir · publica · normalizar · guardar |
| **`scripts/ensaio-sicoob.ts`** | **escrito e passando** contra o sandbox real |
| Composition root | **ligado** — o adaptador real é o padrão; `COBRANCA=desligada` volta ao que recusa |
| Aplicativo no Portal Developers | **não existe** — depende do `.pem` e de ação humana |
| `client_id` | **não existe** |
| Os três campos de identidade | **não existem** — pergunta à cooperativa |
| Webhook | **não desenhado** — `ADR-0006` |
