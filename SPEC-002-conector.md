# SPEC-002 — Conector: sincronização do CRM

| Campo | Valor |
|---|---|
| **Status** | Rascunho — aguarda aceite |
| **Versão** | 1.0 |
| **Data** | 25/07/2026 |
| **Autor** | Vinicius Leal |
| **Fase** | F2 (parcial em F1: o schema de `conector_crm` já existe) |
| **Depende de** | `SPEC-001` v2.3 (schema, isolamento, middleware) · `ADR-0001` · `ADR-0003` r2 |
| **Bloqueia** | Faturamento (F2) — sem espelho não há o que faturar |
| **Documentos-fonte** | `PRD-v2.2` §7 e §8 · `P7` (topologia de funis) · `P8` §5 · `VIEWS-PROPOSTAS-r2.sql` · `RESUMO-SESSAO-3` §4.3b e §4.4 |
| **Questões abertas** | **AUD-07 é bloqueio duro** — ver §10. F-02, F-04, AUD-11 |

> **Uma dependência trava metade desta spec, e é honesto dizer qual.** A reconciliação da §4 assume que o CRM **não apaga fisicamente** um `lead_id` ao fazer merge de duplicados. Se apagar, a regra de "sumiu do conjunto ⇒ desativa" **desativa cliente vivo**. A pergunta está com o dev do CRM (AUD-07). Até a resposta chegar, a §4.3 tem duas redações e a spec **não é implementável na parte de reconciliação** — o resto é.

---

## 1. Objetivo

Manter no financeiro um espelho fiel e datado dos cadastros que nascem no CRM, sem escrever uma linha lá, e sem que o espelho vire uma segunda verdade. O conector é a única porta entre os dois sistemas.

## 2. Escopo

### Entra

- Leitura das views `financeiro.*` do CRM e upsert idempotente em `cliente`, `unidade_consumidora`, `usina`, `usina_geracao`
- Escrita de `cliente_estado_crm` — **a única coisa que escreve nessa tabela**
- Reconciliação por diferença de conjunto e desativação (nunca deleção)
- Ciclo, agendamento, registro de execução em `conector_crm`
- Dedup por `lead_id` antes de tocar cadastro
- Detecção e recusa de ambiguidade de alíquota (`comissionamento_n_opcoes`)

### Não entra

- **Qualquer escrita no CRM**, por qualquer caminho (`CLAUDE.md` regra 4)
- Leitura de **tabela base** do CRM — só as views `financeiro.*` (§4, R1)
- Criação ou alteração de views no CRM — é do dev do CRM
- Cálculo de comissão, fatura, split — F2 e F3
- O gatilho de "cliente passou a ser faturável" — **não é evento do CRM**, ver §10

## 3. Modelo de dados

Nenhuma tabela nova. O conector escreve em tabelas da `SPEC-001` e mantém o próprio estado em `conector_crm`, que já existe.

**Acrescenta a `conector_crm`:**

| Campo | Tipo | Notas |
|---|---|---|
| `ultimo_ciclo_id` | uuid NULL | correlaciona o log de uma execução inteira |
| `ultima_leitura_em` | timestamptz NULL | marca-d'água da leitura, não do processamento |
| `ultimo_erro` | text NULL | mensagem da última falha; limpa em ciclo bem-sucedido |

**Nova, e é registro, não cadastro:**

```
conector_execucao   id · tenant_id · ciclo_id · iniciado_em · terminado_em
                    lidos int · criados int · atualizados int · desativados int
                    recusados int · status enum ok|parcial|erro · detalhe jsonb
```

`recusados` existe porque **o conector recusa linha**, não conserta: alíquota ambígua e valor nulo entram como recusa contada, não como palpite gravado. Contagem em zero é sinal de saúde; contagem crescente é sinal de que alguém precisa olhar o CRM.

`conector_execucao` tem `tenant_id`, logo tem RLS `FORCE` e policy, como as outras treze. Passa a ser a décima quarta.

## 4. Regras de negócio

> **R1.** O conector lê **exclusivamente** as views `financeiro.*`. Nenhuma tabela base do CRM é consultada, nem para conferência. O motivo é medido: das 151 tabelas de `public` do CRM, **81 têm RLS habilitada e nenhuma policy** (`P8` §2) — e o modo de falha é **resultado vazio**, não erro. Ler tabela base é escolher entre depender de credencial que ignora RLS ou receber zero em silêncio.

> **R2.** **Nenhuma escrita no CRM, em nenhuma circunstância.** A credencial usada é de leitura. Se algum dia o CRM precisar de estado do financeiro, o desenho é o CRM **consumir** endpoint nosso — nunca o inverso (`PRD` §7.8).

> **R3.** Todo upsert é **idempotente**. Segunda passada com o mesmo payload não altera linha alguma, e isso inclui não mexer em `atualizado_em`. Sem isso, "nada mudou" é indistinguível de "mudou tudo".

> **R4.** **Dedup por `lead_id` antes de tocar cadastro.** A view `vendas_ganhas` pode devolver N linhas para um lead ganho em N funis (`P7`). Deduplicar depois do upsert cria linha e desfaz; deduplicar antes é a ordem correta.

> **R5.** Campo espelho: **o conector vence.** Campo local: **o usuário vence.** Não há campo disputado — a separação é por coluna, declarada na `SPEC-001` §3.3, e é o que permite as duas escritas coexistirem sem trava.

> **R6.** Cliente espelhado **nunca é deletado**. Ausência no full-scan resulta em `ativo = false`. Deletar causaria ressurreição no ciclo seguinte (`SPEC-001` R16).

> **R7.** `cliente_estado_crm` é escrito **só** pelo conector, e as oito combinações dos três booleanos são válidas. Nenhuma é erro. `em_carteira` **nasce e permanece nulo** até a decisão de F2 da §10.

> **R8.** **A alíquota ambígua é recusada, não escolhida.** Se a view expuser `comissionamento_n_opcoes > 1`, a linha entra em `recusados` e o cadastro **não recebe** valor de comissionamento. Escolher em silêncio é o defeito que a correção no CRM existe para eliminar; repeti-lo do lado do financeiro anularia a correção.

> **R9.** **Valor nulo não é zero.** Ganho sem valor em nenhuma coluna entra em `recusados`. Hoje são 7 de 48, todos do funil Parceiros (`RESUMO-SESSAO-3` §4.5).

> **R10.** O conector **não deriva tarifa**. `consumo_reais` do CRM é `consumo_kwh × tarifa`, e a tarifa vive na tabela `tarifa` do financeiro, versionada. O conector espelha `consumo_kwh` e grava `consumo_referencia_centavos` como **semente**; a base de faturamento é sempre `consumo_kwh × tarifa` da competência (`SPEC-001` R23 e R24).

> **R11.** `percentual_rateio` é read-only no financeiro quando a UC tem `crm_usina_cliente_id`. Só o CRM valida o teto de 100% e o de kWh alocável (`PRD` §7.7).

> **R12.** Todo ciclo roda **dentro do contexto de um tenant**, pelo mesmo middleware da `SPEC-001` §3.2. O conector não tem caminho privilegiado: se ele pudesse ler sem contexto, o isolamento teria uma exceção — e exceção de isolamento é ausência de isolamento.

> **R13.** Um ciclo é **uma unidade de trabalho por lote**, não uma transação gigante nem uma transação por linha. Transação gigante estoura o `timeout` de 15 s e prende conexão do pool; transação por linha perde atomicidade do lote. Lote de tamanho declarado, com `conector_execucao` atualizado ao fim de cada um.

### 4.3 Reconciliação — **duas redações, aguardando AUD-07**

**Se o CRM NÃO apaga fisicamente no merge** (redação preferida):

> Diferença de conjunto. O que está no espelho e não veio no full-scan recebe `ativo = false`. Reversível: se voltar a aparecer, `ativo = true`.

**Se o CRM APAGA fisicamente:**

> Diferença de conjunto **não pode desativar sozinha**. Ausência passa a exigir confirmação em segundo ciclo consecutivo **e** registro em `conector_execucao.detalhe` para revisão humana antes de desativar. Custa um ciclo de latência e uma fila de revisão — é o preço de não desativar cliente vivo.

**Não escolho a segunda por precaução.** Ela introduz trabalho manual permanente, e a resposta do dev é de um dia. Mas se a resposta não vier antes de a F2 começar, a segunda entra: latência é reversível, cliente ativo desativado por engano não é.

## 5. Invariantes

1. Nenhuma linha do CRM é modificada, por nenhum caminho desta spec.
2. Nenhuma tabela base do CRM é consultada — só views `financeiro.*`.
3. Segunda passada idempotente: zero escritas, incluindo timestamps.
4. Nenhum cliente espelhado é deletado.
5. `cliente_estado_crm` não é escrito por ação de usuário.
6. Todo ciclo corre dentro de contexto de tenant, sem caminho privilegiado.
7. Ambiguidade de alíquota e valor nulo produzem **recusa contada**, nunca valor gravado.
8. `recusados > 0` é visível em `conector_execucao` — nunca só em log.

## 6. Interfaces

| Interface | Quem chama | Falha | Idempotente |
|---|---|---|---|
| `POST /conectores/:id/ciclo` | agendador · `admin` | registra em `conector_execucao`, não interrompe o próximo ciclo | **sim, obrigatório** |
| `GET /conectores/:id/execucoes` | UI · `admin`, `financeiro` | — | sim |
| Upsert de cadastro espelhado | **este conector** | log; ciclo segue | **sim, obrigatório** |
| Escrita em `cliente_estado_crm` | **este conector** | mantém valor e envelhece `sincronizado_em` | sim |
| Ativação do conector | `admin` | exige `credencial_ref` preenchida (`SPEC-001` R5) | PUT sim |

## 7. Casos de borda

| Categoria | Situação | Comportamento |
|---|---|---|
| Vazio | Tenant sem conector | Cadastro 100% local; `conector_execucao` sem linhas |
| Vazio | View devolve zero linhas | **Não reconcilia.** Zero pode ser "nada mudou" ou "RLS negou tudo". Ciclo termina `erro`, e nada é desativado |
| Duplicidade | Mesmo `crm_lead_id` em dois ciclos | Upsert pela chave; nunca segunda linha |
| Duplicidade | Lead ganho em N funis | Dedup por `lead_id` **antes** do upsert (R4) |
| Parcial | CPF do CRM inválido | Grava com `documento_validado = false` e `documento_origem = 'crm_semente'` |
| Parcial | `potencia_kwp` nula (100% hoje) | Cadastro aceito; cálculo dependente falha explicitamente, **nunca assume zero** |
| Parcial | `data_vencimento` vazia (100% hoje) | Aceito; a régua de cobrança é da F2 |
| Ambiguidade | `comissionamento_n_opcoes > 1` | Recusa contada; sem valor gravado (R8) |
| Ambiguidade | Ganho com valor nulo | Recusa contada (R9) |
| Concorrência | Conector e usuário no mesmo cliente | Campo espelho: conector vence. Campo local: usuário vence (R5) |
| Concorrência | Dois ciclos do mesmo conector se sobrepõem | Segundo não inicia. `conector_crm` guarda ciclo em andamento |
| Origem ausente | Cliente espelhado some do CRM | §4.3 — depende de AUD-07 |
| Falha | Ciclo morre no meio | `status = 'parcial'`; o que foi processado está commitado por lote (R13); próximo ciclo é idempotente e recompõe |

## 8. Critérios de aceitação

- [ ] Segunda passada com o mesmo payload não altera nenhuma linha, nem timestamp
- [ ] Nenhuma consulta do conector toca tabela fora de `financeiro.*` — verificado por log de query, não por revisão
- [ ] Escrita no CRM por qualquer caminho desta spec falha por permissão
- [ ] Lead ganho em dois funis produz **uma** linha de cliente
- [ ] View devolvendo zero linhas **não desativa nada** e marca o ciclo como `erro`
- [ ] Alíquota ambígua e valor nulo aparecem em `conector_execucao.recusados` e não geram valor gravado
- [ ] Ciclo sem contexto de tenant falha, não lê zero
- [ ] `conector_execucao` tem RLS habilitada, forçada e ≥1 policy — por consulta ao catálogo
- [ ] Ciclo com 1.000 linhas não estoura o `timeout` de 15 s do pool transacional

## 9. Testes obrigatórios

| Teste | Prova |
|---|---|
| `test_conector_idempotente` | Inv. 3 · R3 |
| `test_conector_nao_escreve_no_crm` | Inv. 1 · R2 |
| `test_conector_so_le_views_financeiro` | Inv. 2 · R1 |
| `test_dedup_por_lead_antes_do_upsert` | R4 |
| `test_view_vazia_nao_reconcilia` | §7 — o caso que apagaria a carteira |
| `test_espelhado_nao_deleta` | Inv. 4 · R6 |
| `test_estado_crm_so_conector` | Inv. 5 · R7 |
| `test_ciclo_sem_contexto_falha` | Inv. 6 · R12 |
| `test_aliquota_ambigua_recusada` | Inv. 7 · R8 |
| `test_valor_nulo_recusado` | Inv. 7 · R9 |
| `test_recusa_visivel_em_execucao` | Inv. 8 |
| `test_lote_respeita_timeout` | R13 · critério 9 |
| `test_conector_execucao_com_rls` | critério 8 |

## 10. Questões abertas

| ID | Pergunta | Bloqueia o quê | Quem responde |
|---|---|---|---|
| **AUD-07** | Merge de duplicados apaga fisicamente um `lead_id`? | **a §4.3 inteira** — reconciliação | dev do CRM |
| **F-01b** | **O gatilho de faturamento não é evento do CRM.** Nenhuma etapa do funil marca o cliente pagante; o card sai do `won` à mão e o desconto ativa depois, fora do CRM. O gatilho real é a 1ª fatura com desconto da distribuidora | `em_carteira` e o início de faturamento | Vinicius + operação |
| **F-02** | Quais funis contam como conversão final? Hoje `won` inclui 7 parceiros | lista de funis da view | Vinicius |
| **F-04** | Conector lê participação no funil ou etapa dentro dele? | `cliente_estado_crm` | Vinicius |
| **AUD-11** | Sync de 30 min é requisito ou pode relaxar? | agendamento e custo de leitura | Vinicius |
| **C1** | O par de funil `Vendas-Integração → Donos de Usina` ainda não existe no CRM | leitura de dono de usina | dev do CRM |

**Nenhuma vira improviso do implementador** (`CLAUDE.md` regra 10). Só a AUD-07 é bloqueio duro, e bloqueia a §4.3 — não a spec inteira.

## 11. Fora de escopo / evolução futura

- **Sync incremental.** O desenho é full-scan porque reconciliação por diferença de conjunto exige o conjunto inteiro. Incremental só entra se o volume justificar, e aí a reconciliação precisa de outro mecanismo — não é otimização, é troca de desenho.
- **Webhook do CRM.** Empurrar em vez de puxar reduz latência e cria acoplamento: o financeiro passaria a depender de o CRM lembrar de avisar. Só com o full-scan mantido como rede.
- **Write-back de inadimplência.** Colide com o `PRD` §7.8 e com F-03. Se for necessário, é endpoint do financeiro consumido pelo CRM.
- **Espelho de histórico de titularidade da UC.** Hoje só estado corrente, como na `SPEC-001` §11.

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 25/07/2026 | Original. Escrita com a AUD-07 aberta e a §4.3 em duas redações declaradas, em vez de escolher a versão defensiva por precaução e criar trabalho manual permanente |
