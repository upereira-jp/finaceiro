# Revisão por vertente — o dinheiro da empresa e o dinheiro do cliente

| Campo | Valor |
|---|---|
| **Data** | 30/07/2026 |
| **Por que existe** | O dono descreveu o sistema em **duas vertentes** — o controle financeiro **da empresa** e o controle financeiro **do cliente** — e pediu a revisão contra elas. Este documento mede cada item das duas contra o banco, as rotas e as telas |
| **Método** | Medido em 30/07 contra **produção** (`DIRECT_URL`, leitura pura) e contra o código. **Nenhum número aqui foi copiado de outro documento** — a sessão 16 registra por que essa frase precisa estar escrita |
| **Em uma linha** | A vertente do **cliente** está construída e parada por insumo humano. A vertente da **empresa** não existe — **0 de 13 entidades, 0 de 85 rotas, 0 de 12 telas** — e o ponto onde as duas se encontram, o `PRD` §5.5, está implementado **pela metade** |

---

## 0. As duas vertentes já têm nome, e não é vocabulário novo

O que foi descrito está escrito no `PRD-v2.2` desde a v2.2. Vale fixar o de-para antes de qualquer número, porque metade das confusões deste repositório foram de índice e não de corpo:

| Como foi descrito | Nome no `PRD-v2.2` | Fase | Situação |
|---|---|---|---|
| **controle financeiro do cliente / negócio** — fatura, pagamento, inadimplência, quem pagou e quem não pagou | **§4.3 Carteira** + §9 *Telas mínimas · Carteira* | F2 · F3 | **construída** |
| **controle financeiro da empresa** — contas a pagar e a receber, pagamento de fornecedor e de funcionário, comissão, compras, cartão | **§4.4 Corporativo** + §9 *Telas mínimas · Corporativo* | F4 · F5 · F6 | **não iniciada** |

**Consequência que muda o tom desta revisão: não há escopo novo aqui.** Nada do que foi descrito está fora do PRD. O que esta revisão acrescenta são três coisas — quanto de cada vertente existe hoje, **um buraco entre as duas que nenhuma das fases reivindica**, e uma divergência de eixo que tem prazo.

---

## 1. Vertente do cliente — o que existe, item a item

Medido contra `src/http/rotas.ts` (85 rotas), `web/src/telas/` (12 telas) e o schema.

| O que foi pedido | Onde vive | Existe? |
|---|---|:--:|
| **Fatura do cliente** | `fatura`, composição por competência, emissão em lote, cancelamento, tarifas da concessionária, documento imprimível com QR Pix | ✅ |
| **Pagamento do cliente** | `boleto` (1:1), `liquidacao` por três origens — webhook Sicoob, conciliação, **baixa manual** | ✅ · o boleto registrado depende do A1 (`Q-SICOOB-01`) |
| **Quem pagou / quem não pagou** | `status_fatura` (`emitida`, `paga`, `vencida`…), `marcarVencidas()`, KPIs *Faturado · Recebido · A receber · Vencidas em aberto* na tela Carteira | ✅ |
| **Inadimplência** | **parcial** — ver §1.1 | ⚠️ |
| **Dados do cliente vindos do funil de ativos do CRM** | conector read-only, 4 de 4 entidades da `SPEC-002` §2 espelhadas | ✅ · com `F-01b` e `Q-CRMCODIGO-01` abertas |

### 1.1 Inadimplência é a única parcial desta vertente, e a diferença é de natureza

O `PRD` §4.3 define a entidade como *"visão derivada **+ registro de tratativas, acordos e histórico de contato**"*, e o §9 pede a tela como *"inadimplência **com tratativas**"*.

**Medido:** existe a **visão derivada** — `marcarVencidas()` (`src/repos/fatura.ts:296`) e o KPI `vencidas_em_aberto`. **Não existe tabela, rota nem tela de tratativa, acordo ou contato.** A palavra `inadimplencia` aparece no código uma única vez, num comentário de `src/sicoob/porta.ts:89`.

Traduzindo para a pergunta operacional: *"quem não pagou"* o sistema responde hoje. ***"O que já se fez a respeito"* não tem onde ser gravado** — e quando alguém ligar para o cliente, essa informação vai para um caderno ou para o WhatsApp.

E há uma trava normativa que precisa estar visível antes de alguém propor o atalho: o `PRD` §4.3 diz que a etapa `INADIMPLENTES` do funil do CRM **não é fonte** — *"lê-la seria ler a própria saída do financeiro com atraso"* (`F-03`) — e a regra 4 proíbe escrever lá. **A inadimplência é produzida aqui ou não é produzida.**

Registrado como **`Q-INADIMPLENCIA-01`**.

---

## 2. Vertente da empresa — a medição, e ela é um zero

Consulta ao catálogo de produção, 30/07:

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';
```

**30 tabelas.** Nenhuma das treze do `PRD` §4.4:

| Entidade do `PRD` §4.4 | Existe em produção? | Fase |
|---|:--:|:--:|
| `conta_pagar` · `conta_receber` | ❌ | F4 |
| `pagamento` | ❌ | F4 |
| `conta_bancaria` | ❌ | F4 |
| `categoria` · `centro_custo` | ❌ | F4 |
| `movimento_caixa` | ❌ | F4 |
| `extrato_importado` · `conciliacao` | ❌ | F4 |
| `cartao_credito` · `fatura_cartao` | ❌ | F5 |
| `fornecedor` · `compra` | ❌ | F5 |

**0 de 85 rotas** tocam qualquer uma delas. **0 de 12 telas.** As dez camadas da tela Pendências (`contrato_ativo`, `rateio`, `tarifa_vigente`, `geracao_da_competencia`, `vencimento`, `dono_da_usina`, `regra_de_repasse`, `regra_de_comissao`, `originador_do_contrato`, `cobranca_sicoob`) são **todas** da vertente do cliente — nenhuma mede nada da empresa.

E há um sinal que vale mais do que a contagem: **o placar por fase do `QUESTOES.md` §2 não tem linha para F4 nem para F5.** Não é que estejam atrasadas — é que **nunca entraram no registro**. Corrigido nesta revisão.

### 2.1 O de-para do que foi pedido

| Como foi descrito | Entidade do `PRD` | Fase | Hoje |
|---|---|:--:|---|
| **contas a pagar** | `conta_pagar` | F4 | não existe |
| **contas a receber** | `conta_receber` | F4 | não existe — **a do cliente é a `fatura`, que existe**; esta é a das *outras* receitas |
| **pagamento de fornecedor (dono de usina)** | `conta_pagar` com `origem_split_item_id` + `pagamento` | F4 | **não existe — e é o buraco da §3** |
| **pagamento de comissão** | idem, beneficiário `originador` | F4 | **idem** |
| **pagamento de funcionário** | comissão a `vendedor_g3` + folha importada | F4 · F5 | não existe · e há uma divergência de **eixo**, §4 |
| **compras** | `compra` + `fornecedor` | F5 | não existe |
| **controle de cartão de crédito** | `cartao_credito` + `fatura_cartao` | F5 | não existe |

---

## 3. O ponto de encontro das duas vertentes está implementado pela metade — e este é o achado

**Esta é a parte que não aparece em nenhuma das duas listas acima**, porque não é "a empresa" nem "o cliente": é a costura entre as duas, e o `PRD` a coloca dentro da transação do split.

`PRD` §5.5 — *"na mesma transação do split"*, quatro coisas:

| # | O que o `PRD` §5.5 manda | Existe? |
|:--:|---|:--:|
| 1 | `movimento_caixa` de entrada (valor liquidado) na conta Sicoob | ❌ |
| 2 | `conta_pagar` provisionada **por beneficiário**, valor bruto, vencimento default dia 10 | ❌ |
| 3 | `conta_pagar` do repasse à Equatorial, agrupável por competência | ❌ |
| 4 | Receita G3 refletida no fluxo e no DRE pela categoria correta | ❌ |

**Medido em `src/repos/split.ts`:** a função grava **duas** tabelas — `split_execucao.create()` (linha 191) e `split_item.createMany()` (linha 205). Mais nada.

E o schema fecha o diagnóstico: **`split_item` não tem coluna de pagamento.** Não há `pago_em`, não há status, não há vínculo com um pagamento. As colunas são tipo, beneficiário, base, percentual, valor e as duas regras aplicadas.

### 3.1 O que isso significa no dia em que a primeira fatura for paga

O sistema vai saber, ao centavo e com a invariante do `PRD` §5.5 verificada, **quanto** o dono da usina e o originador têm a receber.

**E não vai ter onde registrar que foram pagos.**

Três consequências, e nenhuma delas é teórica:

1. **Os relatórios `Repasse por dono de usina` e `Comissão por originador` são extrato de apuração, não de quitação.** A tela Relatórios responde *"quanto é devido"*. Ninguém consegue perguntar *"quanto já saiu"*, porque a resposta não existe em lugar nenhum do banco.
2. **Nada impede pagar duas vezes o mesmo repasse.** Não há barreira porque não há o conceito — não é uma trava faltando, é a entidade inteira.
3. **O caixa da empresa não existe.** O dinheiro do cliente entra, é repartido em quatro no papel, e o sistema não registra nem a entrada (item 1) nem as saídas.

### 3.2 Por que isto merece decisão agora, e não quando a F4 chegar

Porque a pergunta é **onde mora o estado de pagamento**, e as duas respostas têm custos muito diferentes:

- **(a) `conta_pagar` como o `PRD` §4.4 desenha**, com `origem_split_item_id` — o split continua imutável, o pagamento é evento separado. É o desenho do PRD e é mais trabalho.
- **(b) colunas de quitação em `split_item`** — mais barato hoje, e **é migration em tabela com dinheiro já gravado** no dia em que virar (a). É exatamente o custo que a `Q-011` evitou ao perguntar antes: lá, a resposta *"não incide retenção"* preservou `split_item` com **um** valor por item; aqui, a resposta errada acrescenta colunas depois.

**A janela é agora porque `split_item` tem 0 linhas em produção.** Depois da primeira liquidação, não tem mais.

> **Nota sobre a entidade `pagamento`:** o `PRD` §4.4 justifica sua existência dizendo que *"é aqui que a retenção sobre PF mora, sem violar a imutabilidade (Q-011)"*. **A `Q-011` foi resolvida em 28/07: não há retenção** sobre comissão PF, comissão PJ nem repasse ao dono. Ou seja, **a justificativa escrita no PRD para a entidade caducou** — mas a entidade continua necessária por outro motivo, que é registrar que o dinheiro saiu, de qual conta e quando. Isso precisa ficar escrito, e não assumido, senão alguém lê a `Q-011` resolvida e conclui que `pagamento` deixou de ser preciso.

Registrado como **`Q-PAGAMENTO-01`**, vermelha.

---

## 4. "Responsáveis dos leads" não é o eixo que está decidido — e isso tem prazo

A descrição diz *"pagamento de funcionário (**responsáveis dos leads**)"*.

**A decisão em vigor é outra.** Em 29/07: *"o originador vai ser o **`vendedor_origem`** até segunda ordem"* — registrada no `ATRIBUICAO-originador-2026-07-30.md` e na `Q-ORIGVEND-01`.

São duas colunas diferentes do CRM, e o repositório mediu as duas lado a lado. Da `Q-ORIGVEND-01`:

- os dois eixos **divergem em 43 dos 80 ganhos**;
- nos 15 cards do funil `Rateio`, o `responsavel` é a mesma pessoa em **15 de 15**, com o `vendedor_origem` variando — ali `responsavel` é **dono operacional do card**, não quem vendeu;
- por `responsavel_atual`, uma pessoa saltava de 1 para 28 atribuições.

Foi por essa medição que a recomendação anterior (`RESUMO-SESSAO-3`: *"`responsavel` paga, `vendedor_origem` só registra"*) foi **superada** — por medição, não por preferência.

**Por que tem prazo:** o passo 5 do caminho crítico é *digitar os 39 contratos*, e a **R20-b congela o tipo do originador no rascunho, sem caminho de edição**. Digitar pelo eixo errado paga a pessoa errada, sem erro e sem log, e o conserto é `encerrar` + `renovar` — que abre linha nova, zera `faturas_cheias_pagas` e deixa na trilha uma renovação que não houve comercialmente.

**O mais provável é que "responsáveis dos leads" tenha sido descrição informal de *quem vendeu*, e não um pedido de troca de eixo** — mas confirmar custa uma frase e não confirmar custa uma reescrita de contratos. Registrado como **`Q-EIXO-FUNCIONARIO-01`**, vermelha, pela mesma regra que classificou a `Q-ORIGINADOR-01`: *entra em produção errado e não tem caminho de volta*.

Um segundo ponto que a descrição encosta: **"funcionário" no sentido de folha de pagamento não é comissão.** A comissão ao `vendedor_g3` é `split_item` e roda na liquidação; salário, pró-labore e encargos são **folha importada**, F5, e não têm nada no sistema. Se a pergunta for *"o sistema controla o que a G3 paga aos seus funcionários?"*, a resposta é **não**, e a comissão é a única parte disso que existe — como apuração, não como pagamento (§3).

---

## 5. O que muda na fila

**Nada do que já estava na fila sai dela.** O caminho para a primeira fatura (`RESUMO-SESSAO-16` §5.5) continua sendo o trabalho de maior valor, e continua bloqueado por insumo humano. Esta revisão acrescenta quatro entradas e **uma** delas disputa prioridade com o que já está lá:

| # | Item | Nível | Quando |
|:--:|---|:--:|---|
| — | *(o caminho para a primeira fatura, 1 a 8, inalterado)* | 🔴 | agora |
| 1 | **`Q-EIXO-FUNCIONARIO-01`** — confirmar que o eixo é `vendedor_origem` | 🔴 | **antes do passo 5**, custa uma frase |
| 2 | **`Q-PAGAMENTO-01`** — onde mora o estado de pagamento do repasse e da comissão | 🔴 | **antes da primeira liquidação**, enquanto `split_item` tem 0 linhas |
| 3 | **`Q-INADIMPLENCIA-01`** — tratativas, acordos e histórico de contato | 🟡 | quando houver fatura vencida de verdade |
| 4 | **`Q-CORPORATIVO-01`** — as 13 entidades do §4.4 e a ordem em que entram | 🟡 | depois da F2 fechar |

---

## 6. O que eu **não** recomendo fazer agora, e o motivo

**Não recomendo começar a construir o módulo corporativo (F4/F5) nesta semana**, e há três razões independentes — qualquer uma bastaria:

1. **A regra de fase do `PRD` §10:** *"nenhuma fase avança sem os critérios da anterior verificados"*. O critério de saída da F2 é *"boleto liquidado no sandbox baixa a fatura automaticamente"*, e **não há certificado A1** (`Q-SICOOB-01`). A F2 não fechou.
2. **Construir AP/AR antes da primeira liquidação é desenhar contra zero dado real.** O sistema tem 0 faturas, 0 liquidações e 0 splits. As decisões de `conta_pagar` — agrupamento, vencimento, categoria — se tomam melhor olhando o primeiro lote de verdade do que a partir de uma tabela de PRD.
3. **A F4 inteira é grande, e a parte dela que dói é pequena.** O que a §3 descreve — registrar que um repasse e uma comissão foram pagos — é uma fração do módulo corporativo, e é a única parte com prazo. Construir essa fração cedo é defensável; construir DRE, conciliação de extrato e cartão de crédito antes de a primeira fatura existir, não.

**O que recomendo:** responder a `Q-EIXO-FUNCIONARIO-01` esta semana (uma frase), decidir a `Q-PAGAMENTO-01` antes da primeira liquidação (decisão de desenho, não de código), e manter o caminho da primeira fatura como o trabalho principal.

---

## 7. O que esta revisão **não** cobriu

| O quê | Por quê |
|---|---|
| **Se as telas da vertente do cliente funcionam** | não abri nenhuma — não há browser neste ambiente. Isso é o `ROTEIRO-REVISAO.md`, e ele é para ser executado por uma pessoa |
| **Fluxo de caixa e DRE projetados** | são F4 e dependem inteiramente das entidades que não existem. Não há o que medir |
| **O módulo fiscal** | `PRD` §4.5, plugável e desligado para a G3 — e a nota de que IBS/CBS chegam destacados nos documentos de **fornecedores**, o que o liga à F5 e não à F2 |
| **Se o CRM tem algo aproveitável para a vertente da empresa** | não medi. E a regra 4 limita o que seria aproveitável a leitura pelas views `financeiro.*` |
