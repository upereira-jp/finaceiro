# SPEC-003 — Carteira: faturamento, cobrança e split

| Campo | Valor |
|---|---|
| **Versão** | 1.0 |
| **Data** | 28/07/2026 |
| **Status** | Vigente |
| **Autor** | Vinicius Leal |
| **Fase** | F2 (faturamento) e F3 (split e comissão) |
| **Depende de** | `SPEC-001` v2.9 (fundação), `SPEC-002` v1.4 (conector), `PRD-v2.2` §4.3, §5 e §6 |
| **Migrations** | 16 `carteira` · 17 `split` · 18 `conector_cobranca` |

> **Esta spec só pôde ser escrita em 28/07 porque as respostas da `PAUTA-contador.md` chegaram.** Cada uma delas define coluna, e onde a resposta não veio a coluna **não existe** — virou questão aberta, não valor default (regra 10). O rastro de qual resposta produziu o quê está na §3 e no cabeçalho de cada migration.

---

## 1. Objetivo

Transformar geração medida em cobrança, cobrança em recebimento e recebimento em repartição — com a soma dos itens repartidos igual ao valor liquidado, **ao centavo**, garantida pelo banco.

---

## 2. Escopo

### Entra

- Composição da fatura por UC e competência, **pela geração efetivamente medida**
- Boleto híbrido por **porta injetada**, com adaptador falso e o adaptador que recusa
- Liquidação por webhook, conciliação e baixa manual — idempotentes
- Motor de split: repasse ao dono da usina, comissão escalonada, repasse à concessionária e líquido G3
- Os quatro cadastros que faltavam da F1: `dono_usina`, `tarifa`, `regra_comissao`, `regra_repasse`

### Não entra

- **Adaptador HTTP real da Sicoob.** Exige certificado A1 e credencial de sandbox, que não existem. A porta está pronta e o composition root liga `COBRANCA_NAO_CONFIGURADA` por padrão — que recusa alto, com o motivo nomeado, em vez de emitir boleto de mentira
- **`inadimplencia` como tabela.** A visão derivada sai por consulta de `fatura`; o registro de tratativa é entidade própria e entra com a tela que a usa. Criar agora seria schema sem escritor
- **Corporativo (F4):** `conta_pagar`, `movimento_caixa`, DRE. O split produz os itens; a ponte contábil do PRD §5.5 passos 1 a 4 é a fase seguinte
- **Estorno de liquidação.** Não existe, e a ausência é registrada: `Q-ESTORNO-01`

---

## 3. Modelo de dados

### 3.1 `fatura` — por UC e competência

Cinco números descrevem a origem do valor, e os cinco são persistidos:

```
geracao_kwh_competencia   × percentual_rateio_aplicado / 100
= consumo_kwh             × tarifa_reais_por_kwh
= valor_consumo_centavos                          (um round(), no último passo — R23)
```

Guardar só o derivado faz o histórico divergir do faturado no primeiro reajuste; guardar só os insumos obriga a recalcular para exibir, e recalcular com a regra de hoje um documento de março é o furo que a R20-b fechou.

| Coluna | Origem da decisão |
|---|---|
| `geracao_kwh_competencia` | **PAUTA 9a = B** — a base é a geração medida, não o percentual alocado |
| `valor_tarifas_concessionaria_centavos` | PRD §5.1 — repasse puro; ninguém comissiona nem repassa sobre isso |
| `valor_juros_multa_centavos` | PRD §4.3 — apurado na liquidação, gravado aqui; zero até lá |
| `valor_total_centavos` | Coluna **GERADA**. Duas fórmulas do total seriam duas respostas |
| `flag_fatura_cheia` | PRD §5.4. **`NOT NULL` sem default** — o critério não está declarado em documento nenhum (`Q-FATCHEIA-01`) |
| `emitida_em` | **PAUTA 1** — competência governa a receita; é aqui que ela nasce |
| `competencia_faturada` | Coluna **GERADA**, regra 11: permite o único ser **cheio** em vez de parcial |

**Nenhuma coluna de tributo recuperável**, porque a PAUTA 6b respondeu que não há crédito de IBS/CBS a apropriar. **Nenhuma tabela de alíquota por regime**, porque a 6c disse Simples.

### 3.2 `boleto` — 1:1 com a fatura

O único instrumento de cobrança do sistema: a PAUTA 5 = A respondeu que não há nota fiscal a emitir, e por isso **não há integração com prefeitura nem com SEFAZ** e nenhuma coluna reservada para uma.

`valor_registrado_centavos` congela o que subiu ao banco. A fatura pode ganhar juros depois; o documento registrado não muda por isso.

**A regra 5 é aplicada pelo banco**: `boleto_payload_sem_segredo` recusa a linha se o payload de ida ou de volta trouxer `access_token`, `client_secret`, `private_key` e afins. O caminho real de vazamento é gravar a resposta do OAuth junto com a do boleto, e revisão humana não roda em toda escrita.

### 3.3 `liquidacao` — o evento de caixa

Duas idempotências, e elas são diferentes:

| Constraint | O que impede |
|---|---|
| `liquidacao_fatura_unica` | Dois webhooks da mesma fatura rodando o split duas vezes e pagando o dono da usina em dobro |
| `liquidacao_externa_unica` | O mesmo evento externo entrando por dois canais. Índice **cheio** de três colunas: `id_externo` nulo não conflita com nulo, então a baixa manual não precisa de predicado e a regra 11 não é tocada |

`app.exigir_liquidacao_pelo_total()` recusa pagamento parcial (PRD §5.2). Sem ela, uma baixa digitada a menos passaria, o split repartiria o valor digitado, **e a invariante do centavo fecharia certo sobre um número errado** — invariante que fecha sobre entrada errada é pior do que invariante nenhuma, porque produz confiança.

### 3.4 `split_execucao` e `split_item`

**Quatro tipos de item, e o quarto é o que faz a conta fechar.** O PRD §4.3 nomeia três; com três, a soma dá `liquidado − tarifas`, e a invariante inegociável do §5.5 é falsa toda vez que houver conta da distribuidora — que é sempre. O `repasse_concessionaria` já era tratado como saída no §5.5 passo 3; só não estava na lista de tipos.

**Um valor por item, sem quebra por tributo** — consequência direta das respostas 2, 3a e 4b: não há retenção sobre comissão PF, comissão PJ nem repasse. Se qualquer uma virar "incide", esta tabela ganha três colunas e a invariante passa a ser *"bruto = liquidado"* e *"líquido + retenções = bruto"*.

`regra_repasse_id` e `regra_comissao_id` gravam **qual versão** produziu o número, e `percentual_aplicado` grava o valor por extenso: a regra pode ser fechada e reaberta, e o extrato de julho tem de continuar dizendo o que foi aplicado em julho.

### 3.5 `regra_comissao` ganha `parcela`

O PRD §5.4 escalona a comissão pela 1ª e pela 2ª fatura cheia paga. A tabela guardava só o **total** — aplicá-lo em toda fatura pagaria a comissão inteira todo mês, para sempre. A dimensão que faltava é a parcela.

Não virou tabela nova (dois lugares diriam quanto se paga) nem lógica em código (a taxa deixaria de ser versionada por vigência, e a R21 existe porque alíquota que depende de qual linha o planejador devolveu primeiro já deu problema no CRM ao lado).

O backfill **assere**: se algum tenant tiver renegociado o total, a soma da quebra do PRD não bate e a migration **recusa** em vez de reprecificar em silêncio.

### 3.6 `conector_cobranca`

A **referência** ao segredo da Sicoob, por tenant — regra 5. Cobrança é por tenant sem exceção possível (PRD §6: "cada empresa tem sua conta, seu certificado, seu `client_id`"); no `.env` funcionaria com um tenant e quebraria no segundo, emitindo boleto de uma empresa na conta de outra.

`certificado_expira_em` **não é segredo** e mora aqui de propósito: o PRD §6 pede alerta de expiração do A1, e o alerta não pode depender de abrir o cofre.

### 3.7 FKs compostas novas

Onze, todas `(tenant_id, <alvo>)` contra `UNIQUE (tenant_id, id)`: `fatura` → uc, contrato, usina · `boleto` → fatura · `liquidacao` → fatura · `split_execucao` → liquidacao, fatura, contrato · `split_item` → split_execucao, dono_usina, originador, regra_repasse, regra_comissao. **É a FK composta, não a frase, que garante a segunda invariante do PRD §5.5** — nenhum `split_item` referencia beneficiário de outro tenant.

---

## 4. Regras de negócio

> **R30.** A base de faturamento é a **geração efetivamente medida** na competência, rateada pelo percentual contratado da UC. Sem linha em `usina_geracao`, a fatura **não nasce** — a coluna é `NOT NULL`. *(PAUTA 9a = B; fecha a `Q-021` do PRD §11)*

> **R31.** Composição e emissão são **atos separados**. A fatura nasce em `rascunho`, sem boleto, fora do a receber. *(PRD §9: import → conferência → emissão em lote)*

> **R32.** Falta de insumo vira **recusa contada com motivo**, nunca valor escolhido. Os **seis** motivos, na ordem da triagem: `sem_contrato_vigente`, `ja_faturada`, **`rateio_nao_ativado`**, `sem_rateio`, `sem_geracao_lancada`, `sem_vencimento`. A ordem é a ordem de utilidade do diagnóstico. *(regra 10; padrão da `SPEC-002` invariante 8)*
>
> **`rateio_nao_ativado` entrou em 04/08/2026** com a migration 24 (`Q-SITUACAO-01`). Até 03/08 **não havia coluna que dissesse a situação** do contrato de rateio, e por isso toda linha de `financeiro.rateio_clientes` era lida como válida — o pedido está na §4 da `RESPOSTA-dev-crm-rodada5` e o CRM o atendeu. Lendo: **das 41 UCs espelhadas, 29 estão `ativado` e 12 não**, sete delas em troca de titularidade. O dono decidiu que **o financeiro fatura as ativadas**.
>
> **A posição na ordem foi escolhida, não herdada.** Vem depois de `sem_contrato_vigente` e `ja_faturada` — sem contrato não há nada a faturar de qualquer jeito, e numa UC já faturada a informação útil é essa — e **antes** de `sem_rateio`: dizer *"falta geração"* ou *"falta vencimento"* mandaria a operação trabalhar numa UC que não é para ser faturada, e a R20-b congela o tier no `rascunhar` sem caminho de volta.
>
> **`NULL` não é "não ativado", e cai na mesma recusa por decisão.** Coluna vazia significa que o conector ainda não leu aquela UC — ausência de medição não é medição de ausência, a mesma separação entre `nao_medido` e `pendente` na prontidão. As duas não faturam, porque o lado seguro para dinheiro é não cobrar o que não se confirmou; o que as separa é a **explicação**, porque a ação é diferente: uma pede rodar o ciclo, a outra pede falar com o CRM. Testes `F4h`–`F4l` (puros) e **`K2d`** (com banco, UC completa em tudo menos a situação).
>
> **A coluna é `text` e não enum**, ao contrário de `campo_de_fatura`: aquela lista é nossa, esta é vocabulário do CRM. Um estado novo do lado deles quebraria um enum no meio do ciclo; em `text` ele é espelhado e a triagem o trata como não faturável, que é o lado seguro (`F4k`).
>
> **A regra só alcança UC ESPELHADA (`crm_usina_cliente_id` preenchido), e essa condição impediu um defeito de entrar.** `POST /unidades-consumidoras` cria UC à mão, e essa UC **nunca** terá situação no CRM — porque o CRM não sabe dela. Sem a condição ela ficaria **não faturável para sempre, sem erro e sem log**: uma regra de fonte externa aplicada a quem não vem daquela fonte. O buraco existiu na primeira versão e apareceu porque **quatro suítes quebraram de uma vez** — todas criam UC pelo caminho da aplicação, que é o mesmo caminho da tela. `F4m` é o par mudo da `F4h`, com **um** campo de diferença. Em produção as 41 são espelhadas, então a regra alcança todas.

> **R33.** **Alerta não é recusa.** Usina sem dono **fatura** e alerta: a cobrança ao cliente não depende daquele cadastro. Recusa significa "nada foi gravado"; alerta significa "foi gravado, e alguém precisa olhar". *(precedente: `RESUMO-SESSAO-9` §2)*

> **R34.** O vencimento sai do dia cadastrado na UC e cai no **mês seguinte** ao da competência — a competência só fecha quando a geração é medida, e a medição chega depois do mês virar. Dia 29 a 31 em mês curto cai no último dia, nunca transborda. UC sem `data_vencimento` é recusa, não um dia escolhido. *(`Q-SPEC001-02`)*

> **R35.** Fatura **cheia** é a competência que o contrato cobre do primeiro ao último dia. É a única regra derivável do dado que existe, e está declarada porque o critério **não existe em documento nenhum**. *(`Q-FATCHEIA-01`)*

> **R36.** O split roda **exclusivamente na liquidação**, na mesma transação da baixa. Não há caminho de aplicação que reparta dinheiro que não entrou. *(PRD §5.2; **PAUTA 1** confirmou o eixo — competência governa a receita, caixa governa a repartição)*

> **R37.** Ordem obrigatória da baixa: **(1)** juros e multa na fatura, **(2)** a liquidação, **(3)** título pago e split. Inverter 1 e 2 faz a baixa com juros ser recusada pela própria constraint que protege a baixa sem juros.

> **R38.** O juro entra na base do repasse **proporcionalmente** ao consumo, não inteiro: o juro incidiu sobre o título todo, e parte do título é a conta da distribuidora, que não gera repasse. O resto do juro cai no residual. *(PRD §5.3)*

> **R39.** O **líquido G3 é apurado por subtração**, nunca calculado. Daí a invariante do centavo sai por construção aritmética, e a resposta 8a — "arredonda-se no total, distribuindo o resíduo" — coincide com o PRD §5.5 — "diferenças de arredondamento vão sempre para o líquido G3".

> **R40.** O líquido G3 **pode ser negativo**, e o `CHECK` abre exceção só para este tipo. Com captador sênior, o PRD §5.6 prevê líquido zero nas duas primeiras faturas; um centavo de resíduo cruza o zero. Recusar esconderia o CAC concentrado que o PRD manda mostrar "sem suavização".

> **R41.** **R12 bloqueia o split inteiro**, não só o item de repasse: sem ele, os 70% do dono cairiam no líquido G3 e a empresa apareceria lucrando o que deve a terceiro. **Mas não reverte a baixa** — recusar a entrada de dinheiro por falta de cadastro puniria o cliente que pagou. A liquidação fica em fila visível.

> **R42.** O contador `faturas_cheias_pagas` avança **no banco**, por gatilho, e só em fatura cheia. No repositório, um caminho de baixa esquecido pagaria a 1ª parcela de comissão para sempre — todo mês, sem erro, sem log.

> **R43.** Da **3ª fatura cheia em diante a comissão é zero por regra**, e `app.percentual_comissao` devolve `0` em vez de levantar. Ausência de **preço** é erro (R26); ausência de **parcela 3** é a regra do PRD §5.4. Levantar transformaria regra de negócio em incidente operacional mensal, a partir do terceiro mês de todo contrato.

> **R44.** Valor com data **nunca é editado no lugar**. A única escrita é abrir vigência nova, que **fecha a anterior antes de inserir** — o `EXCLUDE` não é deferível, e a ordem invertida dá `23P01`. *(PRD §4.6; R21; mesma lição da renovação de contrato, R14)*

> **R45.** A falha ao registrar boleto **é gravada e commitada**, e quem a traduz em `502` é a rota. Relançar desfaria a própria gravação, porque a unidade de trabalho é uma transação — e a fila de retentativa do PRD §6 ficaria sem memória. *(medido em 28/07: foi o teste `K17` que pegou)*

> **R46.** Fatura **liquidada não cancela**. Desfazer o documento sem desfazer o caixa deixaria dinheiro sem título. Reverter liquidação é outro ato e não existe: `Q-ESTORNO-01`.

---

## 5. Invariantes

| # | Invariante | Mecanismo |
|---|---|---|
| 1 | Soma dos `split_item` = valor liquidado, ao centavo | `split_fecha_ao_centavo`, constraint trigger **deferida** |
| 2 | Execução de split sem item nenhum é impossível | `split_execucao_fecha_ao_centavo`, deferida |
| 3 | Nenhum `split_item` referencia beneficiário de outro tenant | FK composta, `23503` |
| 4 | Liquidação é sempre pelo valor cheio do título | `app.exigir_liquidacao_pelo_total()`, imediata |
| 5 | Uma UC não tem duas faturas não-canceladas da mesma competência | `fatura_competencia_unica_por_uc` sobre coluna **gerada** (regra 11) |
| 6 | Um item por tipo em cada split | `split_item_um_por_tipo` — dupla contagem **não** seria pega pela soma |
| 7 | Beneficiário coerente com o tipo do item | `split_item_beneficiario_coerente` |
| 8 | Só o residual pode ser negativo | `split_item_valor_coerente` |
| 9 | Payload de boleto não carrega segredo | `boleto_payload_sem_segredo` (regra 5, pelo banco) |
| 10 | `credencial_ref` não é o segredo | `CHECK` de forma em `conector_cobranca` |
| 11 | Boleto é 1:1 com a fatura | `boleto_fatura_unico` |
| 12 | O mesmo evento externo não liquida duas vezes | `liquidacao_externa_unica` |
| 13 | Toda view da carteira declara `security_invoker` | `CAT-4`, e a conferência da própria migration |
| 14 | Competência é o primeiro dia do mês | `fatura_competencia_e_primeiro_dia` |
| 15 | Uma vigência de `regra_comissao` tem as duas parcelas | conferência da migration 17 |

---

## 6. Interfaces

`PortaDeCobranca` — três verbos: `registrar`, `consultar`, `baixar`. **A consulta ativa é requisito** (PRD §6): webhook perdido sem consulta ativa é dinheiro recebido que o sistema nunca baixa, e a inadimplência passa a acusar quem pagou.

Nenhum tipo da porta aceita segredo — o que circula é `credencial_ref`. Um tipo que aceitasse o segredo faria a violação da regra 5 **compilar**.

**28 rotas novas** em `src/http/rotas.ts`. A matriz de papéis continua sendo aplicada no repositório, por `exigir()`, não no handler.

---

## 7. Casos de borda

| Caso | Comportamento |
|---|---|
| Usina com 100% alocado e **zero geração** (a `0003` real) | Recusa `sem_geracao_lancada`. A fatura não nasce |
| Geração lançada **igual a zero** | Fatura de R$ 0,00. O CRM não distingue "zero" de "não lançado" (`GERACAO-01`) — do nosso lado a distinção existe: sem linha recusa, com linha zerada fatura zero |
| Fatura cancelada e reemitida na mesma competência | Permitido — a coluna gerada libera a chave |
| Webhook duplicado | Devolve a baixa existente, `ja_existia: true`. Não é 409: fila de webhook reprocessa por erro |
| Usina sem dono na hora da baixa | Baixa vale, split pendente, fila visível (R41) |
| Contrato sem originador | Split sem item de comissão. A soma continua fechando |
| `parceiro_indicador` na 2ª parcela | Item de comissão **de zero declarado** — a regra foi consultada e não havia o que pagar |
| Contrato suspenso | Não fatura. Ocupa a UC (R14-b), mas o rateio está pausado |
| Tier sem regra de comissão vigente | Levanta `no_data_found` (R26) — aí é cadastro faltando |

---

## 8. Critérios de aceitação

| Critério | Estado em 28/07 |
|---|---|
| `migrate deploy` limpo com as 18 migrations | ✅ `tests/run.sh`, banco vazio, a cada `npm test` |
| Invariante do centavo verificada nos dois sentidos | ✅ `C1`/`C2` em `tests/carteira.sql`; 2.000 combinações em `S5` |
| Ciclo completo sem Sicoob real | ✅ `tests/repos-carteira.ts`, 31 verificações |
| Isolamento entre tenants na carteira, inclusive por view | ✅ `K14` |
| Boleto liquidado baixa a fatura automaticamente | ⚠️ **provado contra o adaptador falso**, não contra o sandbox Sicoob. É o critério de saída da F2 no PRD §10 e ele **não está cumprido** até haver certificado |

---

## 9. Testes obrigatórios

| Teste | Regra / invariante |
|---|---|
| `S5` — 2.000 combinações | Inv. 1 · R39 — a soma fecha em todas, e **22 casos deram líquido negativo** |
| `C1` / `C2` | Inv. 1 — recusa pelo banco no commit, e os quatro tipos fechando |
| `C3` | Inv. 6 — dupla contagem |
| `D1` | Inv. 3 — beneficiário cross-tenant, `23503` |
| `B1` / `B2` | Inv. 4 · R37 — parcial recusado, cheio com juro na ordem certa |
| `A3` / `A4` | Inv. 5 — o único morde, e cancelar libera |
| `E1` / `E2` | R42 — o contador avança em cheia e **não** avança em não-cheia |
| `F1`–`F4` | R43 · R26 — 30, 20, zero na 3ª, e levanta sem regra |
| `G1`–`G5` | Inv. 9 e 10 — regra 5 pelo banco, nos dois sentidos |
| `K7` / `K9` / `K10` | R38 · PRD §5.4 — juro proporcional, 2ª parcela, e a 3ª sem comissão |
| `K11` | R41 — bloqueio do repasse não reverte a baixa, e a fila é visível |
| `K17` | R45 — a falha commita e a retentativa reaproveita a linha |
| `C1a`/`C1b` | Regra 1 — a divergência do float existe **abaixo de 1%**, e não nas taxas de hoje |

**Total: 102 verificações novas** — 45 em `tests/dominio-carteira.ts`, 26 em `tests/carteira.sql`, 31 em `tests/repos-carteira.ts`.

---

## 10. Questões abertas

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| `Q-FATCHEIA-01` | 🔴 | O que é "fatura cheia"? Define em que mês começa a comissão de todo contrato novo | Vinicius |
| `Q-ESTORNO-01` | 🟡 | Como se reverte uma liquidação? Depende do regime (PAUTA 1) | Vinicius + contador |
| `Q-COMIS-TERC-01` | 🟡 | Como o total de 50% do `terceirizado` se reparte entre a 1ª e a 2ª? | Vinicius |
| `Q-PAUTA-6A-01` | 🟡 | Natureza da receita — a 6a voltou "não compreendido" | contador |
| `Q-SICOOB-01` | 🔴 | Certificado A1 e credencial de sandbox. Sem eles o critério de saída da F2 não fecha | Vinicius |
| `Q-TARIFA-CONC-01` | 🟡 | Quem lança as tarifas da concessionária por competência, e em que formato? | operação |

---

## 11. Fora de escopo / evolução futura

Adaptador HTTP da Sicoob · ponte contábil do PRD §5.5 (F4) · `inadimplencia` com tratativas · pagamento em lote com retenção (F6) · nota de crédito da resposta 9b — que com a base sendo a geração medida (9a) deixa de ter gatilho normal, e por isso não foi implementada.

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| **1.0** | **28/07/2026** | Primeira versão. Três migrations, dois motores puros, seis repositórios, a porta de cobrança e 102 verificações novas. Escrita depois das respostas da `PAUTA-contador.md`, e não antes: quatro respostas definiram colunas desta spec e duas ausências viraram questão em vez de default |
