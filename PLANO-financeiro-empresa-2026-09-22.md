# PLANO — o Financeiro Empresa completo: caixa, bancos, cartões, fornecedores, pessoas, DRE

| Campo | Valor |
|---|---|
| **Para quem** | O dono (decide a ordem e responde as referências) e o analista financeiro (vai operar) |
| **O que é** | O planejamento do que **deve e pode** entrar no funil Empresa depois de Contas a receber: cartões de crédito e gastos, funcionários e salários, fornecedores, contas bancárias, caixa, conciliação, DRE, aprovação, impostos. Em ondas, com modelo de dados, telas, o que decido sozinho e o que precisa de você |
| **Data** | 22/09/2026 |
| **Responde** | `Q-CORPORATIVO-01` (*"a ordem em que as treze entidades entram não está decidida"*) — este plano PROPÕE a ordem; o dono confirma ou troca |
| **Base normativa** | `PRD-v2.2` §4.4 (corporativo), §4.5 (fiscal desligado), §9 (telas mínimas), §10 (F4 → F5 → F6) · `CLAUDE.md` (as onze) · `PAUTA-contador` (Simples; sem retenção sobre comissão e repasse — `Q-011`; comissão da sócia é comissão) |

---

## 0. Em uma tela

Hoje a Empresa tem **quatro telas**: Contas a receber (entrou em 22/09), Contas a pagar, Conector Sicoob e Histórico. É o suficiente para *saber o que entra e registrar o que sai* — e é pouco para uma empresa que vai escalar: não há onde ver o **saldo**, não há **cartão**, não há **pessoa**, não há **fornecedor**, o plano de contas está **vazio**, e o DRE não existe.

O plano é **quatro ondas**, cada uma fechando uma pergunta que o analista faz:

| Onda | A pergunta que fecha | O que entra | Precisa de você? |
|:-:|---|---|---|
| **1 — O chão** | *«Quanto temos, e para onde vai o dinheiro?»* | Plano de contas com tela · Contas bancárias e saldo · Caixa (realizado) · Despesas recorrentes · **Pendências da empresa** | só o **plano de contas atual** e a **lista de bancos** |
| **2 — Gastos** | *«Onde estamos gastando, e com quem?»* | Fornecedores e compras · **Cartões de crédito**, lançamentos, fatura e conciliação do cartão · comprovantes anexados | a **lista de cartões** (final, fechamento, vencimento) |
| **3 — Pessoas** | *«Quanto custa a equipe, e pagamos certo?»* | **Funcionários** (CLT, PJ, sócio) · **Folha** por competência, importada do contador · encargos como contas a pagar · reembolsos · quem pode ver salário | **regime, quem calcula a folha e o formato**, datas de pagamento |
| **4 — Controle** | *«Bate com o banco? Deu lucro? Vai faltar caixa?»* | Conciliação bancária (extrato OFX/API) · **DRE gerencial** · **Fluxo de caixa projetado** (onde a projeção de recebíveis entra) · Fila de aprovação com alçada · Calendário de impostos · Pacote mensal para o contador | **extrato real**, **alçada**, e o **formato que o contador quer** |

**Ao fim das quatro, a barra da Empresa fica com nove telas — as mesmas nove do Rateio, de propósito:**

`Pendências da empresa · Contas a receber · Contas a pagar · Caixa · Cartões · Pessoas ‖ Cadastros · Conector Sicoob · Histórico`

**Quatro princípios que valem para tudo o que está abaixo** (e que decido sozinho, por serem técnicos):

1. **`conta_pagar` é a unidade de tudo o que sai.** Fatura de cartão, salário, encargo, compra, recorrente — tudo vira conta a pagar no vencimento, e só `pagamento` quita. Um caixa com dois tipos de saída é um caixa que não fecha.
2. **Competência ≠ caixa**, como a `PAUTA 1` já decidiu para a receita: o gasto do cartão é despesa no DIA DA COMPRA e caixa no DIA DO PAGAMENTO DA FATURA; o salário é custo no MÊS TRABALHADO e caixa no 5º dia útil. O DRE lê competência; o Caixa lê pagamento.
3. **Nada duplica o que a divisão do dinheiro já provisiona.** Repasse e comissão continuam nascendo só do split. Um vendedor interno que também é `originador` recebe comissão pelo split e salário pela folha — o cadastro liga os dois para que ninguém pague a mesma coisa duas vezes.
4. **Dado de pessoa é sensível.** CPF mascarado na tela, salário visível só para quem a matriz permitir (proposta: `admin`; o analista vê a folha AGREGADA por centro de custo — `Q-FOLHA-RBAC-01`), tudo na trilha de auditoria, e nenhuma chave bancária fora do padrão que `dono_usina` já usa.

---

## 1. O que já existe e serve de base (não se reconstrói)

| Já existe | Onde | O que o plano reaproveita |
|---|---|---|
| `conta_pagar` com status DERIVADO por gatilho, `CHECK` contra pagar a mais, valor imutável quando nasce do split, `DELETE` revogado | migration 22 · `src/repos/conta_pagar.ts` | é a **espinha** de tudo: cartão, folha, compra e recorrente só CRIAM contas a pagar; nenhuma delas inventa outro jeito de sair dinheiro |
| `pagamento` (data, valor, forma, `referencia_externa` única) | idem | ganha `conta_bancaria_id` (onda 1) e vira o lado «saída» do Caixa e da conciliação |
| `categoria` e `centro_custo` — tabelas prontas, **vazias**, sem tela | idem | onda 1 dá tela e um `tipo` (receita / custo / despesa / pessoal / imposto) para o DRE agrupar |
| `liquidacao` (entrada de dinheiro, por fatura) | migration 16 | é o lado «entrada» do Caixa e da conciliação — já existe, já é conferido pelo webhook |
| `split_item` → `conta_pagar` na mesma transação | `src/repos/split.ts` | o custo do rateio (repasse ao dono, à concessionária) e a comissão já chegam ao DRE por aqui |
| Matriz de papéis com coluna Corporativo (`ler_corporativo` / `escrever_corporativo`) | `src/db/contexto.ts` | folha e aprovação acrescentam DUAS ações novas à matriz, não um sistema de permissão novo |
| Cofre cifrado por referência (`credencial_ref`) | `src/sicoob/cofre.ts` | se algum dia houver credencial de cartão/banco para importar extrato por API, ela mora ali (regra 5) |
| Agenda de tarefas com timers (`financeiro-agenda-*`) | `src/cobranca/agenda.ts` | provisionar recorrentes e fechar fatura de cartão são tarefas da MESMA agenda, não um cron novo |
| Trilha de auditoria em 16 tabelas + tela Histórico | migration 3, 13 · `/historico` | toda tabela nova entra na lista das auditadas (invariante 17 confere por catálogo) |
| Leitura e anexo de imagem/PDF (leitor de fatura, logo em `bytea`) | `src/concessionaria/leitor-visao.ts` · `logo_de_cobranca` | o mesmo leitor por visão pode ler **nota de fornecedor** e **comprovante de cartão** — o plano não depende disso, mas é o atalho óbvio |

---

## 2. Onda 1 — o chão: plano de contas, bancos, caixa, recorrentes, pendências

### 2.1 Plano de contas com tela («Cadastros» → Categorias e Centros de custo)

- **Por quê primeiro:** tudo o que vem depois classifica gasto; sem categoria o DRE é uma linha só. A `Q-CONTAPAGAR-01`(c) decidiu não semear na migration porque semear decide a estrutura de todo tenant — então **o plano da G3 entra por importação, aprovado por você**.
- **Modelo:** `categoria` ganha `tipo` (`receita` · `custo_do_rateio` · `despesa` · `pessoal` · `imposto` · `financeira`), `pai_id` (dois níveis bastam) e `ordem`. `centro_custo` fica como está (ex.: Administrativo, Comercial, Operação/Usinas, Diretoria).
- **Tela:** lista editável, arrastar ordem, desativar (nunca apagar — há conta classificada). Classificação em lote das contas sem categoria (as que nascem do split entram sem — é decisão registrada).
- **Você:** a **planilha de despesas atual**, ou a lista de categorias que já usa. Proponho um plano inicial de ~25 categorias na §7 para você riscar.
- **Tamanho:** P (migration pequena + 1 tela).

### 2.2 Contas bancárias e saldo

- **Modelo:** `conta_bancaria` (apelido, banco, agência, conta, tipo corrente/poupança/pagamento, `saldo_inicial_centavos` + `saldo_inicial_em`, ativa, `padrao_para_boleto`). `pagamento.conta_bancaria_id` e `liquidacao.conta_bancaria_id` (nullable; a do boleto Sicoob é preenchida sozinha pela conta do conector).
- **Saldo é DERIVADO:** inicial + entradas − saídas, por conta e por dia. Nunca escrito à mão; quem o corrige é a conciliação (onda 4), lançando ajuste nomeado.
- **Tela:** dentro de «Cadastros»; o saldo aparece no Caixa.
- **Você:** a lista de contas (banco, agência, final) e o **saldo de partida** de cada uma numa data.
- **Tamanho:** P.

### 2.3 Caixa (realizado)

- **O que é:** entradas (liquidações) e saídas (pagamentos) por dia, semana e mês; saldo acumulado por conta e total; filtro por categoria e centro de custo; exportação. **Derivado, sem tabela nova** — o `movimento_caixa` do PRD §4.4 é uma VIEW com `security_invoker`, não uma tabela, porque uma tabela seria a segunda verdade do mesmo dinheiro.
- **Tela «Caixa»:** três cartões (saldo hoje, entrou no mês, saiu no mês), gráfico de barras por semana, lista de movimentos com origem clicável (fatura ou conta a pagar).
- **Tamanho:** M. Sem dependência sua.

### 2.4 Despesas recorrentes

- **O que é:** aluguel, internet, contador, software, energia do escritório, seguro — o que se repete todo mês com valor conhecido.
- **Modelo:** `despesa_recorrente` (descrição, fornecedor, categoria, centro, `valor_centavos`, periodicidade mensal/anual, `dia_do_vencimento`, vigência início/fim, ativa). Uma tarefa da agenda **provisiona a `conta_pagar` da competência** no início do mês, idempotente por `(recorrente_id, competencia)` — índice único CHEIO, não parcial (regra 11).
- **Regra:** o valor da conta provisionada pode ser ajustado (a conta de luz varia) sem tocar a recorrente; a recorrente é o MOLDE.
- **Tamanho:** M.

### 2.5 Pendências da empresa (a primeira tela do funil, espelho da do Rateio)

- **O que é:** *o que vence esta semana, o que está atrasado, fatura de cartão a fechar, folha a fechar, extrato a conciliar, conta sem categoria, saldo projetado negativo.* Cada linha com o número ao vivo e o botão para a tela certa — a mesma disciplina do roteiro do mês (`RM12`/`RM13`: todo destino é aba da barra, nome letra por letra).
- **Cresce com as ondas:** nasce com 3 linhas (vence esta semana, atrasadas, sem categoria) e ganha uma linha por módulo.
- **Tamanho:** M na onda 1; P a cada onda seguinte.

---

## 3. Onda 2 — gastos: fornecedores, compras, cartões de crédito

### 3.1 Fornecedores e compras

- **Modelo:** `fornecedor` (nome, documento CPF/CNPJ, tipo PF/PJ, contato, chave PIX **no mesmo padrão de `dono_usina`**, categoria padrão, centro padrão, ativo). `conta_pagar.fornecedor_id` e o enum `tipo_beneficiario` ganha `fornecedor`, `funcionario`, `cartao` e `fisco` (hoje: dono_usina · originador · concessionaria · outro).
- **Compra:** `compra` (fornecedor, data, número do documento/nota, descrição, `valor_total_centavos`, categoria, centro, **parcelas**) → gera N `conta_pagar` (uma por parcela, vencimentos calculados; soma bate ao centavo — o resíduo vai na última). Compra não é obrigatória: a conta avulsa de hoje continua existindo para o que não tem nota.
- **Comprovante:** `anexo` (tabela) apontando para **Supabase Storage** do projeto do Financeiro, bucket por tenant, caminho `tenant/ano/mes/uuid.ext`; guarda hash e tamanho. Não em `bytea`: a logo cabe em `bytea`, mil notas por ano não. *Decisão técnica minha; registro em ADR.*
- **Tela:** «Cadastros» → Fornecedores; a compra se lança de Contas a pagar («Nova compra», com parcelas e anexo).
- **Tamanho:** M.

### 3.2 Cartões de crédito e gastos

**É o item mais pedido e o que mais confunde caixa com competência — por isso o desenho é explícito.**

- **Modelo:**
  - `cartao_credito` — apelido, bandeira, **final** (4 dígitos, nunca o número), `dia_de_fechamento`, `dia_de_vencimento`, `limite_centavos`, `conta_bancaria_id` (de onde a fatura é debitada), `portador_funcionario_id` (nullable — cartão corporativo na mão de alguém), ativo.
  - `lancamento_cartao` — cartão, `data_da_compra`, descrição, `fornecedor_id` (opcional), `valor_centavos`, categoria, centro, `parcela` e `total_de_parcelas`, `competencia_da_fatura` (**calculada** pelo fechamento: compra em 25/09 com fechamento dia 28 → fatura de setembro; em 29/09 → outubro), quem lançou, anexo, `origem` (digitado · importado do extrato do cartão).
  - `fatura_cartao` — cartão, competência, `fechada_em`, vencimento, `total_centavos` (= soma dos lançamentos, conferida por gatilho), status aberta/fechada/paga, `conta_pagar_id`.
- **Regras:**
  1. **Parcelamento** gera N lançamentos, um por fatura futura, com `parcela k/N` e soma ao centavo.
  2. **Fechar a fatura** (tarefa da agenda no dia do fechamento, ou botão) congela os lançamentos daquela competência e cria **UMA `conta_pagar`** para o banco emissor (`tipo_beneficiario = cartao`), vencendo no `dia_de_vencimento`. Compra lançada depois do fechamento cai na fatura seguinte — como no banco.
  3. **Conciliação do cartão** (critério da F5 no PRD: *"fatura de cartão concilia"*): importar o CSV/OFX da fatura do banco e casar com o que foi digitado (data + valor + parcela); o que só está no banco vira lançamento «importado» para classificar; o que só está digitado é alerta. Diferença zero é o que autoriza pagar.
  4. **DRE** lê `data_da_compra` (competência); **Caixa** lê o pagamento da fatura. É a regra 2 da §0 na prática.
  5. **Gasto de funcionário com cartão pessoal** (reembolso) NÃO é lançamento de cartão — é `conta_pagar` ao funcionário (`tipo_beneficiario = funcionario`), com anexo, criada pela onda 3.
- **Tela «Cartões»:** cartões em cartões (limite usado, fatura atual, próximo fechamento); abas: Lançamentos (lançar, importar, classificar em lote), Faturas (fechar, conciliar, pagar → leva a Contas a pagar), Cadastro.
- **Você:** a **lista dos cartões** (banco, final, dia de fechamento, dia de vencimento, de qual conta é debitado, quem porta) e **um extrato/fatura real** em CSV ou OFX para eu ver o formato — como no extrato bancário.
- **Tamanho:** G (3 tabelas, agenda, importador, 1 tela com 3 abas).

---

## 4. Onda 3 — pessoas: funcionários, folha, encargos, reembolsos

**Aqui há duas escolhas que não são minhas, e a onda não começa sem elas.**

### 4.1 O que preciso de você antes de desenhar (`Q-FOLHA-01`)

1. **Regime de cada pessoa:** CLT, PJ (nota mensal), estagiário, sócio com pró-labore. Muda o que é encargo e o que é só uma conta a pagar.
2. **Quem calcula a folha hoje** — o contador? A resposta decide o desenho inteiro: o PRD §10 fala em **"folha importada"**, e é o que recomendo: **o sistema NÃO calcula INSS, IRRF e FGTS** (tabelas que mudam todo ano e são responsabilidade do contador); ele **importa** a planilha da folha e transforma em contas a pagar e custo por centro de custo. Se ninguém calcula (equipe só PJ e pró-labore), é mais simples ainda.
3. **O formato da planilha** que o contador manda (ou o que ele consegue exportar).
4. **Datas:** dia do pagamento do salário (5º dia útil?), do adiantamento (dia 20?), dos encargos (FGTS até dia 20; INSS/DAS dia 20).
5. **Quem pode ver salário** (`Q-FOLHA-RBAC-01`): só `admin`? O analista (`financeiro`) vê nome a nome ou só o total por centro de custo? Recomendo a segunda até que haja motivo.
6. **Benefícios** praticados: VT, VR/VA, plano de saúde — cada um é uma linha da folha e, quando é fornecedor (Alelo, Unimed), também uma conta a pagar.

### 4.2 Modelo (desenhado para a resposta mais provável: folha importada, mista CLT/PJ/pró-labore)

- `funcionario` — nome, CPF (armazenado, **mascarado na tela**), cargo, `regime`, `centro_custo_id`, `data_admissao`, `data_desligamento`, `salario_base_centavos`, chave PIX / conta (padrão de `dono_usina`), `originador_id` (nullable — **o elo que impede pagar comissão duas vezes**), `usuario_id` (nullable — quem lança gasto e porta cartão), ativo.
- `folha` — competência, status rascunho/fechada/paga, `fechada_em`, `importada_de` (nome do arquivo, hash).
- `evento_folha` — folha, funcionário, `tipo` (salário · adiantamento · hora extra · bônus · VT · VR · plano de saúde · desconto · pró-labore · 13º · férias · rescisão · INSS empregado · IRRF · FGTS · INSS patronal), `natureza` (provento · desconto · encargo do empregador), `valor_centavos`, observação.
- **Ao fechar a folha:** uma `conta_pagar` por funcionário com o **líquido** (proventos − descontos), `tipo_beneficiario = funcionario`; uma `conta_pagar` por **encargo** ao `fisco` (FGTS, INSS, IRRF), com os vencimentos legais; e uma por **benefício com fornecedor**. Soma dos encargos + líquidos = custo total da folha, ao centavo, conferido por gatilho como o split faz.
- **Recorrência:** o rascunho da folha do mês nasce sozinho com o salário base de cada ativo (tarefa da agenda); a importação do contador sobrescreve o rascunho, nunca a folha fechada.
- **Reembolso:** botão em Pessoas → `conta_pagar` ao funcionário com anexo do comprovante e categoria do gasto.

### 4.3 Tela «Pessoas»

Abas: **Equipe** (lista com cargo, regime, centro; ficha com dados mascarados e o elo com originador), **Folha** (competência; importar; conferir linha a linha; fechar; ver as contas geradas), **Reembolsos**.

- **Permissão:** duas ações novas na matriz — `ler_folha` e `escrever_folha`. Proposta inicial: `admin` para ambas; `financeiro` lê só o **agregado** (custo por centro de custo, sem nome). Muda com a sua resposta à `Q-FOLHA-RBAC-01`.
- **Tamanho:** G (3 tabelas, importador, agenda, 1 tela com 3 abas, 2 permissões).

---

## 5. Onda 4 — controle: conciliação, DRE, projeção, aprovação, impostos, contador

### 5.1 Conciliação bancária (`Q-EXTRATO-01`)

- **Modelo:** `extrato_importado` (conta bancária, arquivo, período, hash, importado por), `movimento_extrato` (data, valor, descrição do banco, identificador do banco — FITID no OFX —, tipo crédito/débito), `conciliacao` (movimento ↔ `liquidacao` | `pagamento` | `lancamento_ajuste`, quem, quando, regra que casou).
- **Regras de casamento, em ordem:** nosso número / txid do boleto → `referencia_externa` do pagamento → valor + data ± 1 dia útil → sugestão para a pessoa. O que sobra nos dois lados é a lista de trabalho. Saldo do extrato − saldo derivado = zero é o que fecha o mês.
- **API depois do OFX:** o PRD chama a API de primária; hoje os escopos são só de boleto. O importador de OFX não depende de ninguém; a API depende do gerente incluir escopo de conta corrente.
- **Tela:** dentro de «Caixa» → aba Conciliação.
- **Tamanho:** G. **Depende do extrato real.**

### 5.2 DRE gerencial

- **Estrutura (competência):** Receita bruta (faturas emitidas no mês) → (−) custo do rateio (repasse à usina, repasse à concessionária — vêm do split) → (−) comissões → **margem do rateio** → (−) despesas por categoria e centro (recorrentes, compras, cartões pela data da compra) → (−) pessoal (folha) → (−) impostos (DAS do Simples) → **resultado**. Ao lado, a coluna **caixa** (o que de fato entrou e saiu no mês) — as duas colunas divergem, e a divergência é informação, não erro.
- **Critério do PRD F4 — *"DRE fecha ao centavo"*:** toda linha é soma de tabela (view com `security_invoker`), nenhuma é conta feita na tela; a receita do mês é igual à soma das faturas; o custo do rateio é igual à soma dos itens do split das liquidações — as invariantes já existem, o DRE só as lê.
- **Tela:** «Relatórios» ganha uma aba DRE? Não — Relatórios é do Rateio. O DRE mora em **«Caixa» → aba Resultado**, mês a mês, com exportação. Se crescer, vira tela própria.
- **Tamanho:** M (views + 1 aba). Sem dependência sua, exceto o plano de contas (onda 1).

### 5.3 Fluxo de caixa projetado (onde a projeção de recebíveis entra — `Q-PROJECAO-01`)

- **O que é:** saldo por dia nos próximos 90 dias = saldo hoje + contas a receber a vencer + faturas previstas (contratos vigentes × geração média × tarifa, quando você decidir a projeção) − contas a pagar abertas − faturas de cartão em aberto − folha prevista − recorrentes ainda não provisionadas. Linha vermelha onde o saldo cruza zero; a Pendências da empresa avisa.
- **Tamanho:** M depois das ondas 1–3 (é leitura do que elas gravam). **Depende do seu áudio** para a parte de receita futura.

### 5.4 Fila de aprovação com alçada (`Q-ALCADA-01`)

- **O que é:** o PRD §9 pede *"contas a pagar com fila de aprovação"*. `conta_pagar` ganha `aprovacao` (não exige · pendente · aprovada · recusada), `aprovada_por`, `aprovada_em`; `pagamento` só é aceito em conta aprovada ou que não exige. A **alçada** (valor acima do qual exige `admin`) é configuração do tenant.
- **Você:** a alçada (R$ 500? R$ 2.000?) e se conta nascida do split (repasse) exige aprovação ou é automática. Recomendo: split não exige (já é conferido pelo dinheiro que entrou); avulsa e compra acima da alçada exigem.
- **Tamanho:** P/M.

### 5.5 Impostos e obrigações

- **O que é:** DAS do Simples (mensal, dia 20), FGTS/INSS (da folha), taxas anuais — tudo como **recorrente** de categoria `imposto` com beneficiário `fisco`, mais um **calendário** na Pendências da empresa. Sem cálculo de imposto: o valor do DAS vem do contador (é importado ou digitado). O módulo fiscal do PRD §4.5 continua desligado.
- **Tamanho:** P (é uso da onda 1).

### 5.6 Pacote mensal para o contador

- **O que é:** um botão que gera o ZIP do mês: faturas emitidas, liquidações, contas pagas com comprovantes, folha, extrato conciliado, DRE — nos formatos que **o contador pedir** (`Q-CONTADOR-FORMATO-01`). Substitui o «mandar planilha por WhatsApp».
- **Tamanho:** M.

### 5.7 Pagamento em lote (F6 do PRD, fica para depois)

Selecionar contas aprovadas → gerar lote. A versão que não depende de ninguém exporta um CSV para o internet banking; a que paga sozinha exige escopo Pix de **pagamento** na API do Sicoob (não contratado) e uma decisão sua sobre deixar o sistema mover dinheiro. **Não entra neste plano**; fica nomeado.

---

## 6. Ordem, dependências e tamanho

| # | Entrega | Onda | Depende de | Tam. | Decisão |
|:-:|---|:-:|---|:-:|---|
| 1 | Plano de contas com tela + `categoria.tipo` | 1 | sua planilha (ou o plano da §7) | P | você aprova o plano |
| 2 | Contas bancárias e saldo | 1 | lista de bancos + saldo inicial | P | técnica |
| 3 | Caixa realizado (view + tela) | 1 | 2 | M | técnica |
| 4 | Despesas recorrentes | 1 | 1 | M | técnica |
| 5 | Pendências da empresa (3 linhas) | 1 | 3, 4 | M | técnica |
| 6 | Fornecedores, compras, anexos (Storage) | 2 | 1 | M | técnica (ADR do anexo) |
| 7 | **Cartões**: cadastro, lançamentos, fatura, conciliação do cartão | 2 | 2, 6 · lista de cartões · um extrato de cartão | G | técnica |
| 8 | **Pessoas**: funcionários, folha importada, encargos, reembolsos, `ler_folha` | 3 | 1 · **`Q-FOLHA-01` e `Q-FOLHA-RBAC-01`** | G | **sua** (regime, quem calcula, quem vê) |
| 9 | Conciliação bancária (OFX; API depois) | 4 | 2 · **extrato real** | G | técnica após o extrato |
| 10 | DRE gerencial (aba Resultado) | 4 | 1, 3, 7, 8 | M | técnica |
| 11 | Fluxo de caixa projetado | 4 | 3, 4, 7, 8 · **áudio da projeção** | M | **sua** (o que projetar) |
| 12 | Fila de aprovação com alçada | 4 | — · **alçada** | P/M | **sua** (valor) |
| 13 | Impostos e calendário | 4 | 4, 5 | P | técnica |
| 14 | Pacote mensal para o contador | 4 | 9, 10 · **formato** | M | **sua** (o contador) |

**Onde a ordem do PRD é respeitada, e onde não:** o PRD põe cartão e folha na F5, depois da conciliação (F4). Este plano **inverte cartão e folha com a conciliação**, por uma razão medida: conciliação depende de um insumo externo (o extrato) que ainda não veio, e cartão e folha dependem só de você — e são o que você pediu. A ordem das entidades era exatamente a lacuna da `Q-CORPORATIVO-01`; se você confirmar este plano, ela fecha.

**Disciplina que não muda:** migration ANTES do código (os timers rodam da árvore de trabalho); toda tabela com `tenant_id`, FK composta, RLS com policy, gatilho de auditoria, `DELETE` revogado onde é prova de dinheiro; dinheiro `Int` em centavos; invariante com teste nos dois sentidos; paginação no servidor desde o primeiro dia em `lancamento_cartao`, `evento_folha` e `movimento_extrato` — são as tabelas que crescem com a empresa.

---

## 7. Proposta de plano de contas inicial (para você riscar)

| Tipo | Categorias |
|---|---|
| **Receita** | Receita do rateio (faturas) · Outras receitas · Rendimentos financeiros |
| **Custo do rateio** | Repasse ao dono da usina · Repasse à concessionária · Comissão de originador |
| **Despesa** | Aluguel e condomínio · Energia, água e internet · Software e assinaturas · Contabilidade e jurídico · Marketing e anúncios · Viagens e deslocamento · Alimentação e representação · Material e equipamentos · Manutenção de usinas · Seguros · Tarifas bancárias · Outras despesas |
| **Pessoal** | Salários · Pró-labore · Encargos (INSS, FGTS) · Benefícios (VT, VR, saúde) · Comissões internas (fora do split) · Reembolsos |
| **Imposto** | DAS (Simples) · Taxas e licenças |
| **Centros de custo** | Administrativo · Comercial · Operação (usinas) · Diretoria |

---

## 8. As questões que este plano abre (vão para o `QUESTOES.md`)

| ID | Nível | Pergunta | Quem |
|---|:-:|---|---|
| `Q-PLANO-CONTAS-01` | 🟢 | Aprovar (ou substituir) o plano da §7 — é o que estrutura o DRE de agora em diante | você |
| `Q-CARTOES-01` | 🟢 | Lista dos cartões (banco, final, fechamento, vencimento, conta de débito, portador) e um extrato/fatura real em CSV ou OFX | você |
| `Q-FOLHA-01` | 🟡 | Regime das pessoas; quem calcula a folha; formato da planilha do contador; datas de pagamento; benefícios | você + contador |
| `Q-FOLHA-RBAC-01` | 🟡 | Quem vê salário nome a nome: só `admin`, ou também o analista (`financeiro`)? | você |
| `Q-ALCADA-01` | 🟢 | Acima de que valor uma conta a pagar exige sua aprovação; conta nascida do split exige? | você |
| `Q-CONTADOR-FORMATO-01` | 🟢 | O que o contador quer receber todo mês, e em que formato | contador |
| `Q-ANEXO-01` | técnica | Comprovantes em Supabase Storage (bucket por tenant) e não em `bytea` — decisão minha, vira ADR na onda 2 | implementador |

As já abertas que este plano usa: `Q-EXTRATO-01` (extrato real), `Q-PROJECAO-01` (áudio), `Q-CORPORATIVO-01` (a ordem — fecha se você confirmar a §6).

---

## 9. O que NÃO está neste plano, e por quê

- **Cálculo de folha (INSS, IRRF, FGTS pelas tabelas oficiais).** É trabalho do contador, muda todo ano e errar custa multa; o sistema importa e confere, não calcula.
- **Emissão fiscal (NF-e/NFS-e).** `PAUTA 5` decidiu: cobrança por boleto, sem nota; o módulo fiscal do PRD §4.5 segue desligado.
- **Pagamento automático pela API do banco.** Exige escopo não contratado e uma decisão sua sobre o sistema mover dinheiro sozinho (§5.7).
- **Orçamento (previsto × realizado por categoria).** Faz sentido depois de seis meses de DRE real para ter base de comparação.
- **Integração com sistema contábil (Omie, Conta Azul, Domínio).** O pacote mensal (§5.6) cobre a necessidade; integração é decisão com o contador.
