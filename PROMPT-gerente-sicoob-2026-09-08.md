# PROMPT — gerente Sicoob · 08/09/2026

| Campo | Valor |
|---|---|
| **Para quem** | o gerente da conta PJ da G3 na cooperativa singular |
| **Por que agora** | as duas últimas pendências que só a cooperativa resolve, e as duas travam o **boleto** (a fatura sai e é pagável pelo Pix estático que já está no ar) |
| **O que ele fecha** | `Q-SICOOB-PIXCHAVE-01` (chave aleatória vinculada ao contrato) e o dígito da conta em `conector_cobranca.numero_conta_corrente` |
| **Formato** | a §1 é para **copiar e enviar**. A §2 é interna — não mandar |

> **A lição de 13/08 está aplicada: são DUAS perguntas, não sete.** A mensagem
> anterior levava certificado, contrato, Pix e webhook juntos, e a resposta foi um
> manual de portal que não tocava em nenhuma das quatro que travavam. As duas daqui
> são as únicas cujo destinatário é ele — as demais já fecharam ou são de time
> técnico.

---

## 1. A mensagem — copiar daqui

Olá, [nome]! Tudo bem?

Aqui é o Vinicius, da **G3 Gestão Energia Solar** (CNPJ 66.714.022/0001-21) — agência **5004**, conta **1.194.455-2**.

Nossa integração com a **API de Cobrança Bancária v3** está pronta e vamos emitir os primeiros boletos nos próximos dias. Ficaram só **duas coisas** que dependem de vocês, e as duas são rápidas:

**1) Chave Pix aleatória vinculada ao contrato de cobrança**

Nossos boletos vão sair com o QR Code do Pix junto (o sistema já envia o indicador de Pix na emissão). Pelo que entendi da documentação da v3, para isso é preciso ter uma **chave Pix aleatória vinculada ao nosso contrato de cobrança**, e esse vínculo é feito por vocês.

- Eu gero a chave aleatória no Sicoob Empresarial e te envio, ou vocês geram do lado de vocês?
- Depois de vinculada, você me confirma? Assim eu só ligo o Pix no boleto depois da sua confirmação.

(Já temos uma chave Pix no CNPJ, mas entendi que é outra coisa — essa é a estática, e a do boleto precisa ser a aleatória amarrada ao contrato.)

**2) O número da conta com ou sem o dígito**

A API tem um campo chamado `numeroContaCorrente`, que é a conta onde vocês creditam a liquidação dos boletos. **O modelo não tem campo separado para o dígito verificador**, então preciso confirmar o que mandar:

- **`1194455`** (só o número), ou
- **`11944552`** (com o dígito no fim)?

Hoje está cadastrado com o dígito. É um campo só, e se estiver errado a primeira emissão vai recusar — por isso prefiro confirmar com você antes de rodar.

Obrigado!

---

## 2. Notas internas — NÃO mandar

- **O que está gravado hoje** (`conector_cobranca`, medido em 01/09): agência `5004`,
  conta `1.194.455-2`, `numero_cliente 7276869`, `codigo_modalidade 1`,
  `numero_conta_corrente` = **`11944552`**, `numero_contrato_cobranca` NULL.
- **`numeroContratoCobranca` não entra na mensagem de propósito:** o contrato oficial
  da API, lido em 30/08, manda **omitir** o campo. Perguntar de novo reabriria algo já
  fechado e diluiria as duas perguntas que importam.
- **Se a resposta do dígito for "sem o dígito"**, o conserto é um `UPDATE` de um campo
  para `1194455` — não há migration nem deploy no caminho.
- **A pergunta do webhook (`Q-WEBHOOK-01`) ficou de fora**: ela é de time técnico, não
  de gerente, e misturá-la foi parte do que afundou a rodada de 13/08.
