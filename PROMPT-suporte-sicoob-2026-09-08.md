# PROMPT — suporte técnico Sicoob · 08/09/2026

| Campo | Valor |
|---|---|
| **Para quem** | suporte técnico / canal de desenvolvedor da Cobrança Bancária v3 — **não** o gerente de conta |
| **Por que este destinatário** | medido em 13/08: as duas perguntas daqui foram ao gerente e voltaram um manual de criação de aplicativo. Não foi resposta negativa, foi **destinatário errado** |
| **O que ele fecha** | `Q-WEBHOOK-01` (autenticação na direção de entrada) e `Q-BAIXAOPER-01` (baixa operacional × liquidação final) |
| **Formato** | a §1 é para **copiar e enviar**. A §2 é interna — não mandar |

> **A pergunta 2 é a que move dinheiro.** Hoje `liquidacao.baixar()` roda o split na
> mesma transação da baixa, e a página da API diz que a baixa operacional é
> **intenção de pagamento**, não liquidação. O número que o suporte der — quanto tempo
> separa as duas — decide entre manter o comportamento atual e fazer o split esperar.

---

## 1. A mensagem — copiar daqui

Assunto: **Cobrança Bancária v3 — autenticação do webhook e baixa operacional × liquidação final**

Olá!

Sou Vinicius Leal, da **G3 Gestão Energia Solar** — CNPJ 66.714.022/0001-21, agência **5004**, conta **1.194.455-2**, número do cliente **7276869**. Nosso aplicativo no Portal Developers está ativo (`client_id` `fa04780a-eac0-4ac4-98cd-3da0d2445ea1`) e integramos a **API de Cobrança Bancária v3** ao nosso sistema de faturamento.

Estamos prestes a emitir os primeiros boletos e ficaram **duas dúvidas técnicas** que não encontrei na documentação pública. São perguntas de integração, não de conta.

**1) Como o Sicoob se autentica ao chamar o nosso webhook**

A documentação descreve como cadastrar a URL de notificação e o escopo do aplicativo, mas não descreve a direção de **entrada** — ou seja, como o nosso servidor confirma que quem está chamando é mesmo o Sicoob. Precisamos disso para não aceitar uma notificação de pagamento forjada.

- **a)** A chamada ao nosso endpoint usa **mTLS**? O manual da API Pix diz que as notificações trafegam por canal mTLS; **isso vale igual para o webhook da Cobrança v3?**
- **b)** Se usa, **qual Autoridade Certificadora emite o certificado que vocês apresentam, e qual é o DN/CN dele**? Precisamos configurar a validação contra a CA certa.
- **c)** Existe **faixa de IP fixa** de origem das notificações, para liberarmos no firewall?
- **d)** O POST leva **algum cabeçalho próprio ou assinatura do corpo** (HMAC)? A documentação diz que não há cabeçalhos especiais — gostaria só de confirmar.

**2) Baixa operacional × liquidação final**

A documentação registra que *"a baixa operacional não se refere à liquidação final, mas sim ao registro da intenção de pagamento realizada"*, e o `tipoMovimento 7` é *"Pagamento (baixa operacional)"*.

Isso é decisivo para nós porque, ao receber a confirmação de pagamento, nosso sistema **reparte o valor automaticamente** entre os beneficiários. Se repartirmos sobre uma intenção de pagamento que depois não se confirma, pagamos dinheiro que não entrou.

- **a)** Na prática, **quanto tempo separa a baixa operacional da liquidação final**? É no mesmo dia, em D+1?
- **b)** Existe **notificação da liquidação final**, ou o caminho correto é a **consulta ativa** da situação do boleto / o arquivo de movimentação?
- **c)** Em que situações uma baixa já notificada é **cancelada depois**? Vi o campo `cancelamentoBaixa` e a lista de `codigoMotivoCancelamento` (51 — liquidado por valor a maior ou menor, 69 — liquidados em duplicidade no mesmo dia, 72 — devolução de pagamento fraudado, 88 — devolução de recurso financeiro). **Esse cancelamento também é notificado por webhook?**
- **d)** Em resumo: **qual é o evento que vocês recomendam usar como "o dinheiro entrou e não volta"?**

Se alguma dessas perguntas for de outra área, pode encaminhar — e me avise para eu acompanhar por lá.

Obrigado!

---

## 2. Notas internas — NÃO mandar

- **A 1(a) existe porque a evidência é indireta.** A frase sobre mTLS está no manual da
  API **Pix**, não no da Cobrança. O `ADR-0006` decidiu **mTLS + faixa de IP** com base
  nela; a confirmação para a Cobrança v3 é o que falta. Ver `adr/ADR-0006` §7,
  *"verificação empírica, pré-requisito de LIGAR a rota"*.
- **A 1(d) é confirmação, não pergunta aberta:** a documentação já diz *"o POST não
  possui cabeçalhos especiais"*, o que tirou da mesa as opções A (cabeçalho) e B (HMAC).
  Se a resposta contradisser, as duas voltam.
- **Sem resposta, nada trava hoje:** a rota do webhook **recusa por padrão** (404
  genérico, igual ao de rota inexistente), a consulta ativa diária existe e a baixa
  manual funciona. O webhook é conveniência.
- **A resposta de 2(a) decide a `Q-BAIXAOPER-01`:** intervalo curto sustenta manter o
  split na baixa; intervalo longo (ou cancelamento frequente) manda separar os dois
  momentos, e aí a `Q-WEBHOOK-ESTORNO-01` muda de cor junto.
- **Não perguntar aqui:** certificado A1, chave Pix vinculada e dígito da conta. As duas
  últimas são do gerente (`PROMPT-gerente-sicoob-2026-09-08.md`) e a primeira já fechou.

---

## 3. RESPONDIDO em 08/09/2026 — e as duas perguntas de retorno

O suporte respondeu **no mesmo dia**, e as respostas estão em `QUESTOES.md` §2.d e
`adr/ADR-0006` §9. Ficaram **duas coisas para a próxima mensagem no mesmo canal** —
as duas são consequência direta do que ele respondeu, não perguntas novas.

### A mensagem de retorno — copiar daqui

Olá! Obrigado pelas respostas de ontem — já ajustamos a integração com base nelas. Ficaram duas coisas para fechar:

**1)** Você mencionou que enviaria a **lista dos IPs de origem das notificações**. Pode me mandar? Como o envio não usa mTLS, essa faixa passou a ser o que autoriza a chamada no nosso firewall, e sem ela mantemos o webhook desligado.

**2)** Sobre o **endpoint de movimentação** que você indicou como o lugar onde aparece a liquidação: qual é o caminho dele e como se consulta? Entendi que se solicita por período e depois se baixa o resultado. Preciso de:

- o caminho (path) e o método de cada passo — solicitação e download;
- o **escopo** que a aplicação precisa ter para acessá-lo (o nosso hoje tem `boletos_*` e `webhooks_*`);
- o formato do retorno — vi menção a arquivo compactado em base64; é isso mesmo?
- se dá para pedir **apenas os títulos liquidados** de um dia, ou se vem a movimentação inteira e a filtragem é nossa.

Obrigado!

### Por que a 2 importa, e por que ela NÃO trava nada hoje

A confirmação da liquidação já funciona sem esse endpoint: a consulta ativa lê
`situacaoBoleto` no `GET /boletos`, e `liquidado` é a confirmação que o split espera.
O que o endpoint de movimentação acrescenta são duas coisas medidas:

1. **o valor e a data da liquidação** — a `Q-LIQUIDACAO-CONSULTA-01` mediu que o
   `GET /boletos` não devolve nenhum dos dois. Hoje isso só afeta o caso em que o
   webhook **não** avisou (webhook desligado): a consulta detecta o título liquidado e
   não consegue baixá-lo sozinha, porque baixar sem valor seria inventar dinheiro. Sai
   como divergência, e alguém resolve com baixa manual;
2. **uma chamada por dia** em vez de uma por título.

**Enquanto o contrato do endpoint não chegar, o cliente dele não é escrito** — inventar
caminho e formato para depois "ajustar" é o improviso que a regra 10 proíbe, e neste
caso o improviso ficaria no caminho do dinheiro.
