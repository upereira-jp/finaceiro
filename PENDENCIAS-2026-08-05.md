# PENDÊNCIAS — 05/08/2026

> ## ⚠️ VENCIDA EM QUATRO PONTOS — remedido em 06/08
>
> **O corpo abaixo fica intacto**, porque é registro datado e reescrevê-lo falsificaria a medição de 05/08. O que mudou está aqui, e **a fila vigente é a `RETOMADA-2026-08-06.md` §3**.
>
> | Item do corpo | Dizia em 05/08 | Está em 06/08 |
> |---|---|---|
> | **1.5** identidade de cobrança | 🔴 pendente, dono | ✅ **fechada.** Chave `66714022000121`, recebedor `G3 GESTAO ENERGIA SOLAR`, cidade `GOIANIA`, migrada para a tabela `chave_pix` pela migration 25 |
> | **2.4** `Q-WEBHOOK-01` | 🟡 proposta, aguarda decisão | ✅ **`ADR-0006` aceito em 06/08**, com as quatro decisões |
> | **2.6** o `?? ''` de `boleto.ts:164` | 🔴 sem guarda | ✅ **consertado na sessão 22.** `boleto.registrar()` recusa pagador sem CPF/CNPJ com `PagadorSemDocumento` (422), nomeando a UC, **antes** de criar a linha |
> | **§5** publicação | 5 commits fora do `origin/main`, 24 migrations | **25 migrations em produção = 25 no repositório**, `origin/main` em `32e8b92`, deploy concluído em 06/08 às 20:45 |
>
> **E um passo que esta lista não tinha, e nenhuma outra tinha:** entre *compor o lote* e *emitir* existe um terceiro ato — **`npm run tarifas`**. Sem ele a fatura sai cobrando só o crédito, **sem erro e sem recusa** (`Q-TARIFA-CONC-01`). O "caminho mais curto" do fim deste arquivo vai de compor direto para a competência, e está errado por omissão. Desde 06/08 a tela de Faturas e o `npm run faturar` **contam** quantas sairiam assim.

| Campo | Valor |
|---|---|
| **Medido em** | 05/08/2026, contra **produção** e contra o **CRM real**, pela `financeiro_ro` |
| **Método** | Consulta, não leitura de documento. Onde a fonte é testemunho ou documento, está dito na linha |
| **Estado da suíte** | `EXIT=0`, **1531** verificações |
| **Banco** | **24 migrations em produção = 24 no repositório.** Nenhuma migration pendente |
| **Publicação** | **5 commits locais fora do `origin/main`.** Nenhum traz migration, nenhum toca rota ou SPA |

> **Como ler esta lista.** Ela é ordenada por **o que destrava o quê**, não por severidade — a fila do `QUESTOES.md` é por severidade e continua sendo a fonte. Aqui o critério é: *se isto for resolvido hoje, o que passa a ser possível amanhã?*
>
> **Três coisas que esta lista NÃO é:** não é a lista de tudo que falta no produto (isso é o `PRD`), não substitui o `QUESTOES.md` (que é o registro datado, com dono nomeado por entrada), e **não decide nada** — onde há escolha, ela aparece como escolha.

---

## O estado, em números

| | | | |
|---|--:|---|--:|
| clientes ativos | 45 | **contratos** | **0** |
| UCs ativas | 41 | **originadores cadastrados** | **0** |
| **UCs que FATURAM** (rateio `ativado`) | **29** | **faturas** | **0** |
| pessoas por trás das 29 UCs | **24** | **boletos** | **0** |
| clientes com documento validado | **0 de 45** | **identidade de cobrança** | **0** |
| UCs com dia de vencimento | **0 de 41** | **conector de cobrança ativo** | **0** |
| UCs com endereço completo | **0 de 29** | usinas · donos de usina | 4 · **0** |
| tarifa vigente (Equatorial) | 1 | regras de comissão (5 tiers × 2) | 10 |

**As duas camadas fechadas**, que ninguém precisa tocar: a **tarifa** cobre as 29 (todas Equatorial, vigência aberta dos dois lados) e as **regras de comissão** cobrem os cinco tiers nas duas parcelas do `PRD` §5.4.

---

## 1. O que trava a PRIMEIRA FATURA

**Nenhum destes é código.** Os quatro são insumo humano, e a ordem entre eles importa menos do que parecia — só o item 1.4 depende de outro.

| # | Pendência | Dono | Como entra | Bloqueia porque |
|:--:|---|---|---|---|
| **1.1** | **CPF/CNPJ de 24 pessoas** | operação | `npm run documentos` · `documentos-modelo-20260804.csv` | R9: `contrato.ativar()` recusa sem `documento_validado`, e a UC vira recusa `sem_contrato_vigente` — a **primeira** da triagem, atrás da qual nada é medido |
| **1.2** | **Dia de vencimento de 29 UCs** | operação | `npm run vencimentos` · `vencimentos-modelo-20260804.csv` | recusa `sem_vencimento`. Não há default: escolher um dia seria o improviso que a regra 10 proíbe |
| **1.3** | **CPF/CNPJ de 2 originadores** + natureza `pf`/`pj` + confirmação do tipo | operação | `npm run originadores` | `originador.documento` é `NOT NULL`. **Remedido em 05/08: são DOIS** para as 29 — Renata 26, Out Sales 3 |
| **1.4** | **Digitar os 29 contratos** | operação | `npm run contratos` · `contratos-modelo-20260805.csv` | depende de 1.1 e 1.3. **O modelo já sai preenchido** pelo crédito congelado do CRM: `ganho_em` → data de fechamento, `consumo_reais` → valor, 41 de 41 |
| **1.5** | **Identidade de cobrança** (chave Pix, recebedor, cidade) | **dono** | tela · aba Documento | sem ela o documento sai **sem QR**, e o Pix estático é o único meio de pagamento que não espera o A1 |

**Os cinco são independentes entre si, exceto 1.4, que espera 1.1 e 1.3.**

### 1.6 A competência, que é decisão e não insumo

| usina | UCs que faturam | competências com geração | última |
|---|--:|--:|---|
| `0001` | **19** | 1 | **2026-06** |
| `0002` | **9** | 7 (01 a 07) | **2026-07** |
| `0003` | **1** | **0** | — |
| `04` | 0 | 0 | — |

- **2026-06 sai com 28 das 29** sem lançar nada. A única recusa seria a UC da `0003`, que nunca teve geração.
- **2026-07 sairia com 9**, porque a `0001` só tem junho. Faturar julho antes de lançar a geração dela produz um lote de 9 e 20 recusas — que **não é defeito**: é o sistema recusando emitir receita sobre energia que ninguém registrou ter sido gerada (`PAUTA-contador` 9a).

**Pendente:** escolher a competência, e — se for 2026-07 — o kWh medido de julho da `0001`. `Q-GERACAO-01` 🟡.

---

## 2. O que trava o BOLETO

É **outra cadeia**, e nenhum dos quatro é insumo da operação. O endereço (2.5) é o único que é coleta.

| # | Pendência | Dono | Estado |
|:--:|---|---|---|
| **2.1** | **`ADR-0005`** — onde mora o segredo do tenant | Vinicius | ✅ **decidido em 05/08: Opção A**, Supabase Vault + resolvedora `SECURITY DEFINER` amarrada ao tenant. Era o único bloqueio da F2 que não dependia de ninguém de fora |
| **2.2** | **`src/sicoob/http.ts`** — adaptador real da Cobrança v3 | — | 🔴 **não existe.** Estava travado por 2.1 e **agora pode ser escrito.** É o maior código que falta no projeto |
| **2.3** | **Certificado A1 + credencial de sandbox** | Vinicius | 🔴 **externo.** `Q-SICOOB-01` |
| **2.4** | **`Q-WEBHOOK-01`** — como a Sicoob entra no webhook | Vinicius | 🟡 **desenhada em 05/08: `ADR-0006`**, Proposta, aguarda decisão. **Quatro** decisões, não três |
| **2.5** | **Endereço do pagador de 29 UCs** | operação | 🔴 `npm run enderecos` · `enderecos-modelo-20260805.csv`. **0 de 29** nos seis campos, e nenhuma das 10 views do CRM expõe endereço |
| **2.6** | **O `?? ''` de `boleto.ts:164`** — documento do pagador sem guarda | Vinicius | 🔴 metade aberta da `Q-PAGADOR-01`. Sem guarda, a Sicoob recebe pagador sem identificação e a recusa volta traduzida em **502**, longe da causa |

### 2.7 O que a leitura da documentação da Sicoob respondeu — e o que não

Lida em 05/08, na documentação pública da Cobrança Bancária v3. **Metade da pergunta caiu.**

**Sabido, e é o que o `src/sicoob/http.ts` (2.2) precisa:** produção em `https://api.sicoob.com.br/cobranca-bancaria/v3`, sandbox em `https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3`, OAuth2 em **Keycloak** (`auth.sicoob.com.br/auth/realms/cooperado/...`), `Authorization: Bearer` **mais** `client_id` em toda chamada, e certificado **ICP Brasil emitido para o CNPJ**. Isso confirma o `ADR-0005` sem mudá-lo — e levanta um detalhe novo: **o `client_secret` pode nem existir**, porque em Keycloak com mTLS o certificado é a credencial.

**NÃO sabido, e é o que a 2.4 precisa:** **nada** sobre como a Sicoob autentica a chamada ao *nosso* endpoint. O material público descreve o cadastro da URL e o escopo da aplicação, e não descreve cabeçalho, assinatura, certificado de cliente nem faixa de IP na direção de entrada.

**A diferença é de destinatário, não de esforço:** deixou de ser *"ler a documentação"* e passou a ser **perguntar ao suporte da Sicoob**, ou abrir a aplicação no portal e ver o que a configuração de webhook oferece. É pergunta com endereço.

**E um achado de lado, que valida a 2.5:** o objeto `pagador` da inclusão de boleto é `numeroCpfCnpj · nome · endereco · bairro · cidade · cep · uf · email`. O `endereco` é **uma string só** — nós temos logradouro, número e complemento separados, e quem concatena é o adaptador —, o `cep` é sem máscara e a `uf` de duas letras, que é exatamente o que o importador já normaliza. **`email` está no payload deles e não está no nosso tipo `Pagador`**: medido, 3 de 29 clientes faturáveis têm e-mail e 29 de 29 têm telefone.

**Nada disto é emergência, e a razão está no `PRD` §6:** `GET /boletos/situacao` é a consulta ativa diária e existe justamente para capturar liquidação cujo webhook falhou. Sem webhook o dinheiro não se perde — chega no dia seguinte, e a **baixa manual funciona hoje**, sem A1.

---

## 3. Decisões sem dono resolvido — as que movem dinheiro

Estas não têm caminho de volta depois de gravadas, e é por isso que estão separadas.

| Questão | Sev. | O que decide | Por que não pode esperar a digitação |
|---|:--:|---|---|
| **`Q-FATCHEIA-01`** | 🔴 | **o que é "fatura cheia"** — o `PRD` §5.4 usa o termo quatro vezes e **não o define em documento nenhum** | decide **em que mês a comissão de todo contrato novo começa**. `fatura.flag_fatura_cheia` é `NOT NULL` sem default, de propósito. A regra em vigor é derivada e está escrita em `faturamento.ts`, não escondida |
| **`Q-CLIENTEDUP-01`** | 🔴 | **45 linhas ativas para 36 nomes** — e cinco das 29 UCs faturáveis são duplicatas com nome e telefone idênticos | `cliente_documento_unico` aceita o CPF em **uma** das duas linhas. O lote de documentos sai com **24**, e as outras 5 esperam. Não é incômodo de digitação: custa 5 das 29 |
| **`Q-PARCERIA-01`** | 🔴 | vendedor **e** parceiro na mesma venda, e `contrato` guarda um | **05/08: saiu do caminho crítico das 29** — as três UCs do Edimar estão `nao_ativado`, e os 29 créditos vigentes têm `parceiro_id` nulo em 29 de 29. **Volta a travar** quando o CRM ativar aquelas três. A 2ª parcela é 25% contra zero |
| **`Q-022`** | 🔴 | como o contrato é atribuído ao originador | fechada na prática pelo eixo do crédito congelado; a entrada segue aberta |
| **`Q-011`** | 🔴 | retenção sobre comissão a PF — incide, e como? | **contador**, não Vinicius |
| **`Q-COMISPCT-01`** | 🟡 | o `comissao_pct` do CRM contra a nossa `regra_comissao` | concordam **hoje**. Não têm dono para quando divergirem |
| **`Q-COMIS-TERC-01`** | 🟡 | o `terceirizado` não está na tabela de comissão do `PRD` §5.4 | é o tier de 3 das 29 |

---

## 4. Dívida nomeada — código e registro

Nenhuma destas bloqueia a primeira fatura nem o boleto.

| Questão | Sev. | O quê |
|---|:--:|---|
| **`Q-ESTORNO-01`** | 🟡 | **não existe caminho para reverter uma liquidação.** O split roda na baixa e não há desfazer — e a primeira liquidação é quando isso passa a importar |
| **`Q-INADIMPLENCIA-01`** | 🟡 | *"quem não pagou"* o sistema responde; *"o que já se fez a respeito"* não tem onde ser gravado, e o `PRD` §4.3 proíbe usar a etapa do CRM como fonte |
| **`Q-CORPORATIVO-01`** | 🟡 | **9 das 13 entidades do `PRD` §4.4 não existem** — fluxo de caixa, conciliação e cartão. As 4 que existem são as que **quitam** |
| **`Q-SPEC004-01`** | 🟢 | a F4 ganhou entidade e **não ganhou spec** |
| **`Q-CRMCODIGO-01`** | 🔴 | `lead.codigo` do CRM **não é estável** — 76 merges em 30/07 renumeraram 39 de 41. Mitigado: nada nosso casa por ele |
| **`Q-ORIGVEND-01`** | 🟡 | o insumo humano dos originadores — é o mesmo item **1.3** |
| **`Q-UCMUDOU-01`** | 🟡 | respondida pelo dev do CRM; a entrada segue aberta por confirmação |
| **`Q-DOCFATURA-01`** | 🟡 | o layout por posição entregue em 03/08; sobra acabamento |
| **`Q-AGENDA-02`** · **`Q-CONTAPAGAR-01`** · **`Q-PRISMA11B-01`** · **`Q-LOTTIE-01`** · **`Q-PECA-NAO-PLUGADA-01`** | 🟢 | confirmações e padrões a procurar, não decisões de projeto |

---

## 5. Publicação

| | |
|---|---|
| **Migration** | **Nenhuma pendente.** Produção tem 24, o repositório tem 24 |
| **Commits** | **5 fora do `origin/main`.** Nenhum traz migration, **nenhum toca rota ou SPA** — são módulos puros, funções novas de repositório, testes e documento |
| **Consequência** | **Os importadores não precisam de deploy para rodar**: eles executam do Codespace contra a `DATABASE_URL` de produção, pelo caminho da aplicação. O `--modelo` de contratos e o de endereços já rodaram assim em 05/08 |
| **Quando o deploy passa a ser necessário** | quando alguma rota ou a SPA mudar — ou seja, ainda não. Se for feito, o ciclo é o de sempre: `git pull` → `migrate deploy` → **`prisma generate`** → `web:build` → `restart`, e o `generate` não é opcional (a guarda de arranque recusa subir sem ele) |

---

## O caminho mais curto, se a pergunta for "o que faço primeiro"

1. **1.5** (chave Pix) — é só sua, e é o único meio de pagamento que não espera o A1;
2. **1.1** + **1.2** + **1.3** em paralelo — três planilhas, três donos na operação, os três modelos já gerados;
3. **1.4** — `npm run contratos --ensaio`, conferir linha a linha, depois `--valendo`;
4. escolher a competência (**1.6**) e compor o lote;
5. o boleto (**§2**) corre em paralelo o tempo todo, e a **§2.4** é a que depende de você.
