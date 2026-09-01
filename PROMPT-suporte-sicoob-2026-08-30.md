# PROMPT — Sicoob · 30/08/2026

| Campo | Valor |
|---|---|
| **Para quem** | **duas mensagens, dois destinatários.** A §1 é para a **cooperativa** (gerente / atendimento PJ); a §2 é para o **suporte técnico / canal de desenvolvedor**. Separadas de propósito — ver a nota abaixo |
| **Por que agora** | o contrato oficial da API chegou em 28/08 e três perguntas ficaram **medidas e sem resposta**. Nenhuma delas se responde lendo documentação: duas não são públicas e uma é dado da cooperativa |
| **O que ele fecha** | `Q-BAIXAOPER-01` 🔴 · `Q-RATEIO-SICOOB-01` 🔴 · `Q-ENDERECO-BLOQUEIO-01` 🔴 · e o `numeroCliente`, que é o **último campo de identidade** que falta para emitir |
| **Formato** | §1 e §2 são para **copiar e enviar**. A §3 é interna — não mandar |

> **O destinatário é metade da pergunta, e isto é lição medida.** O
> `PROMPT-gerente-sicoob-2026-08-13.md` mandou a pergunta de webhook ao gerente de conta e
> voltou **um manual de criação de aplicativo** — a `Q-WEBHOOK-01` registra que *"isto não é
> resposta negativa, é destinatário errado"*. Por isso as três técnicas vão juntas ao canal
> técnico, e a cooperativa recebe **uma pergunta só**, que é a única que é dela.

> **Todas as três técnicas têm a mesma forma:** o modelo da API declara o campo, e **não declara
> o comportamento**. Não é documentação mal lida — é documentação que não desce a esse nível.

---

## 1. Mensagem para a cooperativa — copiar daqui

Olá! Tudo bem?

Sou Vinicius Leal, da **G3 Gestão Energia Solar** (CNPJ 66.714.022/0001-21).

Estamos finalizando a integração com a **API de Cobrança Bancária v3** para emitir os boletos dos nossos clientes. Já temos o certificado digital e o aplicativo criado no portal de desenvolvedores. Falta **um único dado**, que é da cooperativa:

**Qual é o nosso `numeroCliente`?**

É o número que identifica o nosso contrato de beneficiário no Sisbr. Pelo que entendemos da documentação, **não** é a agência nem a conta corrente — é um identificador próprio do contrato de cobrança.

Os outros dois campos de identidade que a API pede nós já resolvemos: o `codigoModalidade` é `1`, e o `numeroContaCorrente` é a nossa própria conta.

Muito obrigado!

---

## 2. Mensagem para o suporte técnico — copiar daqui

Olá! Tudo bem?

Sou Vinicius Leal, da **G3 Gestão Energia Solar** (CNPJ 66.714.022/0001-21). Estamos integrando a **API de Cobrança Bancária v3** ao nosso próprio sistema de faturamento — emissão de boletos, webhook de movimentação e consulta ativa.

Já lemos a documentação da API e os modelos de dados. As três perguntas abaixo são sobre **comportamento**, que é o que os modelos não descrevem. Elas mudam decisões de arquitetura do nosso lado, por isso o cuidado em perguntar antes de supor.

### 1. `situacaoBoleto` — a baixa operacional aparece diferente da liquidação final?

A documentação da API é explícita ao dizer que *"a baixa operacional não se refere à liquidação final, mas sim do registro da intenção de pagamento realizada"*, e o webhook nos manda `codigoTipoMovimento 7 – Pagamento (baixa operacional)`.

Do nosso lado isso importa muito, porque é a partir desse aviso que repartimos o valor recebido entre os beneficiários. Repartir sobre uma intenção de pagamento é diferente de repartir sobre uma liquidação confirmada.

- **a)** No `GET` de consulta de boletos, o campo **`situacaoBoleto`** distingue os dois momentos? Ou seja: um título que sofreu **baixa operacional** mas **ainda não teve liquidação final** aparece com qual valor nesse campo?
- **b)** Qual é a **lista completa de valores possíveis** de `situacaoBoleto`? Até hoje só observamos `"Em Aberto"` e `"Liquidado"`, e estamos tratando qualquer outro valor como desconhecido, de propósito.
- **c)** Existe **algum campo ou consulta** que informe explicitamente a **liquidação final**, e não a baixa operacional?
- **d)** Tipicamente, **quanto tempo separa** os dois momentos? É D0 → D+1, ou pode ser mais?

### 2. `rateioCreditos` — quatro perguntas sobre os limites

Estamos avaliando usar o `rateioCreditos` para que o crédito já chegue repartido entre os beneficiários, em vez de fazermos a repartição depois.

- **a)** É possível **misturar** o `codigoTipoValorRateio` **dentro do mesmo boleto** — um destino por **percentual** (`1`) e outro por **valor** (`2`)? Ou todos os destinos de um boleto precisam ser do mesmo tipo?
- **b)** O rateio pode somar **100%** do valor, deixando **zero** para a conta principal? Existe percentual máximo rateável?
- **c)** Quantos **destinos** um boleto aceita na lista `rateioCreditos`?
- **d)** Com `codigoTipoCalculoRateio 1 – Valor Cobrado`: quando o título é pago **com juros e multa por atraso**, o percentual incide sobre o valor **efetivamente pago** (já com os acréscimos) ou sobre o valor **original** do título?

### 3. Endereço do pagador — a obrigatoriedade é mesmo dura?

No modelo do `POST /boletos`, dentro de `pagador`, os campos **`endereco`, `bairro`, `cidade`, `cep` e `uf`** aparecem todos como obrigatórios (só `email` é opcional).

- **a)** Confirmam que a inclusão é **recusada** quando esses campos não vêm?
- **b)** Nós faturamos energia por unidade consumidora, e para parte da nossa base temos o **endereço da unidade consumidora** mas não um endereço cadastral do pagador. **O endereço da unidade consumidora é aceitável** nesses campos, ou vocês exigem o endereço de cadastro da pessoa?
- **c)** O endereço do pagador é usado para **algo além do registro** — cobrança física, protesto, envio de correspondência? Pergunto para saber o tamanho da consequência de preenchê-lo com o endereço da instalação.

Obrigado pela ajuda!

---

## 3. Notas internas — NÃO mandar

### O que cada resposta muda aqui dentro

| Pergunta | Se a resposta for… | Então… |
|---|---|---|
| **1a/1c** distingue os dois momentos | **sim, distingue** | a **`Q-BAIXAOPER-01` (b) fica barata**, e esse é o achado de 30/08: `dominio/agenda.ts:174` já mapeia `liquidado → baixar` e `baixado → marcar_baixado`, e `cobranca/agenda.ts:270` já roda diário pelo `financeiro-agenda-consulta.timer`. **Não é integração nova — é inverter a prioridade da corrida** entre webhook e consulta ativa. Sem arquivo `LIQUI`, sem ZIP em base64 |
| | **não distingue** (as duas dizem `"Liquidado"`) | a (b) **não compra nada** — troca um gatilho pelo mesmo gatilho com um dia de atraso. Aí a decisão real vira (a) com a `Q-WEBHOOK-ESTORNO-01` subindo para 🔴 |
| **1b** lista fechada | vier | `situacaoDoTexto` (`http.ts:243`) deixa de ter `desconhecida` como rede e passa a ter cobertura medida. A assimetria atual — o que não casa **não** baixa a fatura — está certa e continua |
| **1d** o intervalo | **D+1** | com o número na mão, a (a) pode virar **risco aceitável declarado** em vez de risco desconhecido |
| **2a** misturar tipos | **sim** | é o **único arranjo que reproduz o nosso split**: medido em 30/08, o `repasse_usina` é fração **constante** do cobrado (54,042940% em dia vs 54,043667% atrasado) e vai por **percentual**; a comissão **não** é constante (23,160448% vs 22,367819%) mas o **valor** é fixo e conhecido na emissão, e vai por **valor** |
| | **não** | a (b) da `Q-RATEIO-SICOOB-01` morre por aqui, e a recomendação (a) fica sem alternativa |
| **2b** 100% | **não permite** | confirma a impossibilidade já medida por outro caminho: com repasse 70% + comissão 30%, o líquido G3 é **zero em 53.101 casos e negativo em 5.900** de 59.001 varridos, e **positivo em nenhum** |
| **2d** base do percentual | **valor pago, com acréscimos** | é o que faz o repasse por percentual bater exato, porque a regra *"proporcionalmente"* do `PRD` 5.3 foi desenhada assim |
| | **valor original** | o repasse por percentual passa a errar quando há atraso, e o rateio na origem perde a única parte que funcionava |
| **3a/3b** endereço | **aceita o da unidade consumidora** | é a **única saída que não é digitar 29** endereços à mão, e tira a `Q-ENDERECO-BLOQUEIO-01` do caminho crítico |
| | **exige o cadastral** | os 29 continuam sendo caminho crítico, e o CSV de `/opt/financeiro/listas-2026-08-30/` é o instrumento |
| **3c** para que serve | **protesto / correspondência** | endereço da instalação passa a ter consequência real e a resposta de 3b perde valor mesmo se for "sim" |

### O que NÃO perguntar, e por quê

- **`numeroContratoCobranca`** — **decidido, e a retomada de 30/08 §2 manda não perguntar.** A página da API é mais forte que a coleção Postman: ele *"não é necessário no corpo"*, preenchido **incorretamente** faz a API recusar, e *"só deve ser preenchido em casos muito específicos, quando houver orientação expressa"*. `NULL` **é o caso normal**, e perguntar convida a uma orientação que não precisamos;
- **`codigoModalidade`** — medido, é `1`;
- **os escopos da v3** — `Q-ESCOPO-V3-01` resolve-se por **medição**, não por pergunta: o `client_credentials` devolve o campo `scope` com o que foi **concedido**. É o `npm run escopos -- sicoob-g3-a1`, e roda em dez segundos assim que houver `client_id`;
- **se existe `client_secret`** — o realm usa `tls_client_auth`. Vira medição nossa quando o aplicativo for autorizado;
- **autenticação do webhook na direção de entrada** — é a `Q-WEBHOOK-01`, já perguntada em 13/08 ao destinatário errado. **Vale remandar a este canal**, mas não junto: são três perguntas já, e a lição do `ADR-0006` é que ela é a mais fácil de ficar sem resposta e não deve arrastar as outras.

### O que continua em branco depois desta conversa

**A autorização do aplicativo.** Nenhuma destas três perguntas destrava a emissão — quem destrava é o Sicoobnet Empresarial → *Transações Pendentes / Detalhamento* → *Autorização para Uso de APIs*. O texto do banco diz *"os responsáveis"*, no plural: assinatura conjunta exige que **cada um** repita.

E o lembrete que sobrevive de 13/08: **o Sicoob acrescenta `/pix` ao final da URL do webhook.** Uma URL terminada em `/pix` vira `…/pix/pix` — 404 silencioso.
