# PROMPT — gerente Sicoob · 13/08/2026

| Campo | Valor |
|---|---|
| **Para quem** | o gerente da conta PJ da G3 na cooperativa singular |
| **Por que agora** | o portal foi aberto em 13/08 e sobrou **um item externo**: o certificado A1. A folha `SICOOB-portal-2026-08-06.md` está preenchida e diz o que ficou em branco |
| **O que ele fecha** | `Q-SICOOB-01` (o A1), o `B4` (contrato de cobrança), `Q-SICOOB-PIXCHAVE-01` (chave aleatória) e **possivelmente a `Q-WEBHOOK-01`**, que está travada há 8 dias esperando exatamente esta pergunta |
| **Formato** | a §1 é para **copiar e enviar**. A §2 é interna — não mandar |

> **A pergunta 4 é a mais valiosa e a menos provável de ser respondida por ele.** A `Q-WEBHOOK-01` está aberta desde 28/07, e o `README` registra que *"o pré-requisito deixou de ser ler a documentação e passou a ser **perguntar ao suporte**"* — porque como a Sicoob autentica a chamada ao **nosso** endpoint **não é público**. Ela vai por último e marcada como encaminhável, para não travar as três primeiras.

---

## 1. A mensagem — copiar daqui

Olá, [nome]! Tudo bem?

Sou Vinicius Leal, da **G3 Gestão Energia Solar** (CNPJ 66.714.022/0001-21), conta [agência / conta].

Estamos integrando a **API de Cobrança Bancária v3** ao nosso próprio sistema de faturamento, para emissão de boletos e baixa automática. Já acessei o `developers.sicoob.com.br`, cheguei à tela de cadastro de aplicativo e a nossa conta aparece corretamente lá. **O que falta é o certificado digital**, e é sobre ele que preciso da sua orientação.

### 1. Certificado

- **a)** Confirma que o exigido é um **e-CNPJ A1** (o de arquivo, validade de 1 ano) e que o **A3** (token ou cartão) **não** funciona para a API?
- **b)** No cadastro do aplicativo, na aba **Segurança**, **qual arquivo eu devo subir**: `.pem`, `.cer` ou `.crt`? Entendi que é a parte pública derivada do `.pfx`, mas queria confirmar antes de comprar.
- **c)** Há alguma **Autoridade Certificadora** específica que vocês recomendam, ou qualquer uma do ICP-Brasil serve?
- **d)** Existe **ambiente de sandbox / homologação** que eu consiga usar **antes** de ter o certificado, ou ele é necessário desde o primeiro aplicativo?

### 2. Contrato de cobrança

A API pede três dados que **não encontrei no portal**:

- `numeroCliente`
- `numeroContratoCobranca`
- `codigoModalidade`

Você consegue me passar esses números, ou me indicar com quem eu falo?

### 3. Pix no boleto

Entendi que, para o boleto sair com o **QR Code do Pix**, é preciso uma **chave Pix aleatória vinculada ao nosso contrato de cobrança**, e que esse vínculo é feito por vocês. **Como faço essa solicitação?**

(Hoje já temos uma chave Pix cadastrada no CNPJ, mas entendi que é outra coisa — a do boleto precisa ser a aleatória vinculada ao contrato.)

### 4. Webhook — pergunta técnica, pode encaminhar

Vamos receber o **aviso de liquidação por webhook**, numa URL nossa. Preciso saber **como o Sicoob se autentica ao chamar o nosso endereço**:

- certificado de cliente (**mTLS**)?
- **faixa de IP fixa** que eu possa liberar?
- **cabeçalho** combinado no cadastro?
- **assinatura** do corpo da requisição?

A documentação pública descreve como cadastrar a URL, mas não descreve esse lado. Se precisar encaminhar para o time técnico, sem problema.

Muito obrigado pela ajuda!

---

## 2. Notas internas — NÃO mandar

### O que cada resposta muda aqui dentro

| Pergunta | Se a resposta for… | Então… |
|---|---|---|
| **1a** A1 vs A3 | **A1** | confirma 📹 do vídeo de terceiro e libera a compra. Se ele disser que A3 serve, é divergência forte — o vídeo é explícito, e vale insistir |
| **1b** qual arquivo | **`.pem`** | confirma o procedimento. Se disser **`.pfx`**, é achado sério: significaria subir a **chave privada** num formulário web, e o `ADR-0005` precisa saber |
| **1c** qual AC | *"qualquer ICP-Brasil"* | esperado, e não muda nada |
| **1d** sandbox | **existe sem certificado** | reabre o paralelismo que caiu em 13/08 e permite exercitar o `http.ts` antes da compra |
| | **não existe** | confirma a queda da premissa e o A1 é caminho crítico único |
| **2** os três campos | vierem | fecha o `B4` e o `http.ts` deixa de ter campo de identidade entrando por fora |
| | *"não sei"* | é escalonamento, não dedução. **`conector_cobranca` tem `numero_contrato`, `numero_convenio`, `agencia` e `conta`, e qual mapeia para qual NÃO está medido** — preencher por semelhança de nome é o modo de falha do `contrato-medido` §4 |
| **3** chave Pix | procedimento | fecha a `Q-SICOOB-PIXCHAVE-01` e o `B3` passa a ter custo conhecido |
| **4** webhook | **mTLS ou faixa de IP** | confirma a **Decisão 1** do `ADR-0006`, que já está desenhada para isso |
| | **cabeçalho** | contradiz a medição de 06/08 (`ADR-0006` §2.3) e **as opções A e B voltam à mesa** |
| | **nada disso** | aciona o **plano B nomeado** do `ADR-0006` §3 — revisão prevista, não reabertura |

### O que NÃO perguntar, e por quê

- **onde mora o segredo** — `ADR-0005`, decidido. Não é pergunta para ele;
- **as URLs de produção, sandbox e token** — já medidas no `SICOOB-contrato-medido-2026-08-05` §1. Perguntar gastaria a boa vontade dele numa coisa que já sabemos;
- **se existe `client_secret`** — respondido em 13/08 (não existe). Vira medição nossa quando o aplicativo for criado, não por confirmação verbal;
- **preço ou prazo do A1** — não é com o Sicoob, é com a AC.

### O que fica em branco mesmo depois desta conversa

A **tela de configuração de webhook** do portal (item 4 da folha) continua não aberta, e é de propósito: a rota existe desde a migration 16 mas ainda passa pelo autenticador de sessão, e o `ADR-0006` não foi implementado. **Cadastrar URL hoje é registrar um endereço que recusa, e depois esquecer que registrou.**

E o lembrete que vale para quando for cadastrar: **o Sicoob acrescenta `/pix` ao final da URL**. Uma URL terminada em `/pix` vira `…/pix/pix` — 404 silencioso.
