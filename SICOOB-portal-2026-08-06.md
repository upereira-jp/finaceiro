# SICOOB — o que fazer no portal

**Uma passada só.** Voltar custa mais que anotar tudo agora. Preencha as lacunas neste arquivo enquanto navega.

**Não pergunte, já está decidido:** onde mora o segredo (`ADR-0005`), como a Sicoob entra no webhook (`ADR-0006`), as URLs e o corpo do boleto (`SICOOB-contrato-medido-2026-08-05`).

---

## 1. Cadastre-se

`developers.sicoob.com.br` → abra o **Dashboard**.

## 2. No Dashboard, anote

| | Anote aqui |
|---|---|
| `client_id` de sandbox | `________________` |
| **Existe `client_secret`?** | ☐ sim, é `________` ☐ não |
| URL base de sandbox | `________________` |
| Endpoint de token | `________________` |
| **Baixe** a coleção Postman / OpenAPI | ☐ baixado |

## 3. Abra a tela de cadastro de aplicativo (não precisa concluir)

| | Anote aqui |
|---|---|
| Dá para marcar **Cobrança Bancária v3**? | ☐ sim ☐ não |
| Dá para marcar **Pix (`cob`)**? | ☐ sim ☐ não ☐ é outro aplicativo |
| Certificado pedido é **`.PFX` com senha + `.CER` Base-64**? | ☐ sim ☐ outro: `________` |
| Exige **dados da conta bancária** já aqui? | ☐ sim ☐ não |

## 4. Abra a tela de configuração de webhook (não precisa concluir)

| | Anote aqui |
|---|---|
| Além da URL, o que o campo aceita? | ☐ só a URL ☐ cabeçalho ☐ segredo ☐ outro: `______` |
| Menciona **mTLS / certificado de cliente / faixa de IP**? | ☐ sim, qual: `______` ☐ não |

## 5. Procure o contrato de cobrança

Pode não estar no portal. Se não estiver, **é pergunta para a cooperativa** — não invente.

| | Anote aqui |
|---|---|
| `numeroCliente` | `________` |
| `numeroContratoCobranca` | `________` |
| `codigoModalidade` | `________` |

---

## O que cada resposta muda aqui dentro

| Se… | Então… |
|---|---|
| **não houver `client_secret`** | o certificado *é* a credencial, e a resolvedora do `ADR-0005` devolve outra coisa |
| **der para marcar Pix (`cob`)** | a cobrança ganha `txid` e **concilia sozinha**, sem depender do contrato de cobrança. Pode encurtar a fila inteira — é decisão a pesar depois, não no portal |
| **o certificado divergir** do `.PFX` + `.CER` | o `ADR-0005` precisa saber **antes** de alguém comprar o A1 |
| **exigir conta bancária no cadastro** | sandbox deixa de ser paralelo à abertura da conta PJ |
| **o webhook não oferecer mTLS, cert nem IP** | vale o **plano B** já nomeado no `ADR-0006`. A decisão não reabre |
| **os três campos do item 5 não estiverem lá** | pergunta para a cooperativa |

---

## ⚠️ Ao cadastrar o webhook

O Sicoob **acrescenta `/pix` ao final da URL**. Registrar `…/api/pix` faz o POST chegar em `…/api/pix/pix` — 404 garantido. **Anote a URL exatamente como digitou.**

---

## Quando voltar

1. **Preencha as lacunas acima e ponha a data.** O que foi *visto* e o que foi *suposto* não podem ficar iguais depois;
2. **Confira as URLs contra o `SICOOB-contrato-medido-2026-08-05` §1.** Divergência é barata agora;
3. **Decida boleto, `cob`, ou os dois** — é sua, e reordena a fila;
4. **Aí sim** o `src/sicoob/http.ts` pode ser escrito. Nem antes, nem depois.

## O que o portal NÃO resolve

- **A conta PJ na cooperativa singular** — é ela que destrava **produção**, corre em paralelo e **não bloqueia o sandbox**. Pode ser chamado no Top Desk pela cooperativa, mas isso é o manual de 2021 e o portal pode ter mudado (item 3);
- **O certificado A1 de produção**;
- **A primeira fatura** — ela não depende de nada disto. O que a segura é planilha e decisão sua, não a Sicoob.
