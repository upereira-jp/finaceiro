# SPEC-002 — Conector: sincronização do CRM

| Campo | Valor |
|---|---|
| **Status** | Rascunho — aguarda aceite |
| **Versão** | 1.2 |
| **Data** | 26/07/2026 |
| **Autor** | Vinicius Leal |
| **Fase** | F2 (parcial em F1: o schema de `conector_crm` já existe) |
| **Depende de** | `SPEC-001` v2.3 (schema, isolamento, middleware) · `ADR-0001` · `ADR-0003` r2 |
| **Bloqueia** | Faturamento (F2) — sem espelho não há o que faturar |
| **Documentos-fonte** | `PRD-v2.2` §7 e §8 · `P7` (topologia de funis) · `P8` §5 · `VIEWS-PROPOSTAS-r2.sql` · `RESUMO-SESSAO-3` §4.3b e §4.4 |
| **Questões abertas** | **AUD-07 é bloqueio duro** — ver §10. F-02, F-04, AUD-11 |

> **A AUD-07 foi respondida em 26/07, e a resposta e a pior das duas hipoteses.** O merge nao apaga - marca `removido_do_funil_em` e migra o historico. Mas existem **dois caminhos de DELETE fisico fora do merge**, um deles ROTINEIRO. A secao 4.3 passa a ter uma redacao unica, a defensiva, e ela ficou mais barata do que eu previa por causa de uma view que o dev ofereceu. Detalhe na 4.3.

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

> **R1.** O conector le **exclusivamente** as views `financeiro.*`. Nenhuma tabela base do CRM e consultada, nem para conferencia.

> **R1-b. O isolamento do caminho de leitura NAO vem da RLS do CRM - vem de um literal no corpo da view, e o conector nao confia nele.** Medido e confirmado pelo dev em 26/07: as views `financeiro.*` sao owned por `postgres`, nao declaram `security_invoker`, e por isso a RLS das tabelas base e avaliada contra o dono - que tem `BYPASSRLS`. O que restringe o tenant sao **14 ocorrencias literais** do UUID `d4640f4b-...` espalhadas pelo corpo das views. Uma view nova sem o literal, ou com o literal errado, entrega linhas de outro tenant, e **nenhuma policy impede**.
>
> Consequencia operacional, obrigatoria: **o conector valida `crm_tenant_id` em toda linha recebida** contra `conector_crm.crm_tenant_id`, e **aborta o ciclo** na primeira divergencia - `status = 'erro'`, nada e gravado, nada e reconciliado. Custa uma comparacao por linha e e a unica defesa que nao depende de a view estar certa.

> **R1-c.** Consequencia boa da mesma descoberta: **view vazia nao e sintoma de RLS**. O modo de falha "resultado vazio porque a policy negou" nao existe nesse desenho. Zero linhas passa a significar "nada mudou" ou "a view quebrou" - e o caso de borda da secao 7 continua valendo por outro motivo: zero e ambiguo, e ambiguidade nao reconcilia.

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

> **R16. Atribuicao de originador vem de `leads.partner_id`, nunca da tag.** Confirmado pelo dev em 26/07: `partner_id` e o campo primario e ja vem exposto em `vendas_ganhas` com `parceiro_nome`. A tag `indicado_por:<partner_id>` e **display e editavel na UI** — hoje sao 11 leads com `partner_id`, 6 com a tag, e **1 com tag sem `partner_id`**. Ler a tag importaria a inconsistencia. `contrato.originador_id` resolve por `partner_id`.

> **R17. O tier do contrato e semeado pelo campo `Comissionamento` do lead e congelado ali.** O `app_settings.g3_partner_rules` do CRM **nao calcula comissao** — carimba tier na criacao do lead, via RPC compartilhada entre backend e Edge Functions. A verdade por lead e o campo, e ele e a semente de `contrato.originador_tipo_no_fechamento` (`SPEC-001` R20-b). Uma verdade por lead; quem transforma em R$ e so o financeiro.

> **R18. Espelho de vitima de merge se funde pelo `lead_merges`, nao so desativa.** O CRM passou a manter `public.lead_merges` (vitima → sobrevivente), **sem FK para `leads` de proposito**, para a trilha sobreviver a DELETE fisico. Exposta em `financeiro.lead_merges`. Quando um `crm_lead_id` aparece como vitima, o financeiro **funde o espelho no sobrevivente**. Sem isso, contrato e UC ficam pendurados em cliente inativo.
>
> Ressalva medida: **vitima de merge tem `ultimo_funil` NULL** em `leads_arquivados`, porque as posicoes de funil migram no merge. Logo a classificacao "copia derivada" da §4.3 **nao pode usar `ultimo_funil` para vitima de merge** — a ordem de teste e `lead_merges` primeiro, `leads_arquivados` depois, funil por ultimo.


> **R14.** **Funil `Parceiros` fica FORA da base de comissao sobre valor.** Confirmado pelo dev em 26/07: `won` ali significa "parceiro ativado", nao venda, e os 7 ganhos nao tem valor em nenhuma coluna por natureza. Os 48 ganhos sao 40 `Vendas - Assinatura` + 1 `Vendas - Integracao` + 7 `Parceiros`, e os funis de venda tem **zero** ganhos sem valor. O filtro e por funil, e a R9 deixa de disparar.

> **R15.** **O campo `Comissionamento` significa duas coisas diferentes dependendo do funil.** Em card de venda e aliquota. Em card do funil `Parceiros` e **tier do parceiro** - os 7 tem o campo preenchido (6 `PADRAO`, 1 `50%`) e nenhum deles e aliquota de venda alguma. O conector **nunca** le esse campo de card do funil `Parceiros`. Sobrecarga semantica de campo e como se paga o dobro sem ninguem mentir.

> **R13.** Um ciclo é **uma unidade de trabalho por lote**, não uma transação gigante nem uma transação por linha. Transação gigante estoura o `timeout` de 15 s e prende conexão do pool; transação por linha perde atomicidade do lote. Lote de tamanho declarado, com `conector_execucao` atualizado ao fim de cada um.

### 4.3 Reconciliacao - redacao unica, AUD-07 respondida em 26/07

**A resposta do dev, em tres partes:**

1. **O merge nao apaga.** Marca `leads.removido_do_funil_em = now()` e adiciona a tag `mesclado`, e migra
   todo o historico para o sobrevivente. A linha continua em `public.leads`, mas **sai de
   `financeiro.vendas_ganhas`**, porque a view filtra `removido_do_funil_em IS NULL`. Do nosso ponto de
   vista o `id` desaparece do full-scan **sem delete**. Frequencia: 1 na historia (10/07/2026).
2. **Nao existe ponteiro vitima -> sobrevivente em tabela nenhuma.** O mapeamento so vai para log de
   aplicacao, efemero. Ver a consequencia na secao 10, item MERGE-01: ela e maior que a reconciliacao.
3. **Existem dois caminhos de DELETE fisico fora do merge, e um deles e rotineiro:**

| Caminho | Natureza |
|---|---|
| `DELETE /api/leads/{id}` | gated por permissao (diretoria ou allowlist; hoje so o OutSales). **Sem tombstone e sem trilha em tabela** |
| Sync "Clientes Ativos" da G3 | **apaga rotineiramente** as copias de leads no funil `Clientes ativos - Assinatura` (`fc9f26a3-...`) quando o lead de origem sai de CONCLUIDOS no Rateio. Sao derivadas por desenho: vem e vao |

**Portanto: um `id` pode desaparecer fisicamente sem rastro, e o pior caso e o caso real.**

**A regra:**

> Ausencia no full-scan **nao desativa sozinha**. O conector classifica a ausencia em tres, e so uma
> delas exige gente:
>
> | Classificacao | Como se distingue | Acao |
> |---|---|---|
> | **Arquivado ou mesclado** | aparece em `financeiro.leads_arquivados` (view a ser exposta pelo dev - aceita, ver secao 10) | desativa no mesmo ciclo. E ausencia explicada |
> | **Copia derivada** | o `id` pertencia ao funil `Clientes ativos - Assinatura` | **nao desativa nada** e nao conta como ausencia. Aquele funil e populacao volatil por desenho |
> | **Sumiu de verdade** | nao esta em nenhuma das duas | exige **dois ciclos consecutivos** de ausencia, registra em `conector_execucao.detalhe` e entra em fila de revisao humana antes de desativar |
>
> Desativacao e sempre reversivel: se o `id` voltar a aparecer, `ativo = true`.

**Por que nao a versao simples.** Sem a classificacao, a rotina do sync "Clientes Ativos" faria o
conector desativar e reativar clientes a cada ciclo, em volume, e a fila de revisao encheria de ruido
ate ninguem mais olhar. A view `leads_arquivados` e o que reduz a fila ao que e genuinamente ambiguo -
os dois caminhos de delete fisico, que sao raros - em vez de tudo que sai da view.

## 5. Invariantes

1. Nenhuma linha do CRM é modificada, por nenhum caminho desta spec.
2. Nenhuma tabela base do CRM é consultada — só views `financeiro.*`.
3. Segunda passada idempotente: zero escritas, incluindo timestamps.
4. Nenhum cliente espelhado é deletado.
5. `cliente_estado_crm` não é escrito por ação de usuário.
6. Todo ciclo corre dentro de contexto de tenant, sem caminho privilegiado.
7. Ambiguidade de alíquota e valor nulo produzem **recusa contada**, nunca valor gravado.
8. `recusados > 0` é visível em `conector_execucao` — nunca só em log.
9. **Toda linha recebida tem o `crm_tenant_id` esperado.** Divergencia aborta o ciclo (R1-b). O isolamento do caminho de leitura nao vem da RLS do CRM.
10. Nenhum card do funil `Parceiros` entra na base de comissao sobre valor (R14), e nenhum `Comissionamento` de card `Parceiros` e lido (R15).
11. Atribuicao de originador vem de `partner_id`, nunca de tag (R16).
12. Vitima de merge **funde**, nao apenas desativa (R18).

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
| `test_tenant_divergente_aborta_ciclo` | Inv. 9 · R1-b — linha com `crm_tenant_id` inesperado para o ciclo inteiro |
| `test_ausencia_classificada_em_tres` | §4.3 — arquivado desativa, copia derivada nao conta, sumido de verdade vai para fila |
| `test_parceiros_fora_da_comissao` | Inv. 10 · R14 e R15 |
| `test_atribuicao_por_partner_id` | Inv. 11 · R16 — lead com tag e sem `partner_id` **nao** atribui originador |
| `test_vitima_de_merge_funde_espelho` | Inv. 12 · R18 — contrato do espelho da vitima migra para o sobrevivente, nao fica em cliente inativo |
| `test_ordem_de_classificacao_de_ausencia` | R18 — `lead_merges` antes de `leads_arquivados` antes de funil, porque vitima de merge tem `ultimo_funil` NULL |

## 10. Questões abertas

| ID | Pergunta | Bloqueia o quê | Quem responde |
|---|---|---|---|
| ~~AUD-07~~ | ~~Merge apaga fisicamente?~~ | — | **RESPONDIDA em 26/07.** Nao apaga, mas ha dois caminhos de delete fisico fora do merge, um rotineiro. Ver 4.3 |
| ~~F-02~~ | ~~Quais funis contam como conversao final?~~ | — | **RESPONDIDA em 26/07.** `Parceiros` fica fora: `won` ali e "parceiro ativado". Ver R14 |
| **MERGE-01** | **Merge no CRM orfana o cadastro do financeiro.** Nao existe ponteiro vitima -> sobrevivente em tabela nenhuma. Depois de um merge, o financeiro tem **dois clientes espelhados** para a mesma pessoa, desativa um, e o contrato eventualmente amarrado ao desativado fica apontando para cliente inativo. Nenhum mecanismo funde os dois lados | contrato e faturamento da vitima | **Vinicius + dev do CRM** |
| **ATIVO-01** | **A decisao C1 esta comprometida.** C1 (24/07) manda ler estado ativo do funil `Clientes ativos - Assinatura`. O dev revelou que os cards daquele funil sao **copias derivadas apagadas rotineiramente** pelo sync da G3. Ler estado de populacao volatil por desenho e ler ruido | `cliente_estado_crm` e o gatilho de faturamento | **Vinicius** |
| **COMISSAO-02** | **Existe um segundo motor de comissao dentro do CRM.** `app_settings.g3_partner_rules`, com atribuicao por tag `indicado_por:<id>` no lead. A `SPEC-001` R20 decidiu que a comissao e chaveada localmente por `originador.tipo`. Duas engines calculando a mesma coisa e duas verdades | motor de comissao (F3) | **Vinicius** |
| **F-01b** | O gatilho de faturamento nao e evento do CRM. Nenhuma etapa do funil marca o cliente pagante | `em_carteira` e inicio de faturamento | Vinicius + operacao |
| **ARQ-01** | **Aceito:** view `financeiro.leads_arquivados` (arquivados e mesclados, com a tag) para distinguir "sumiu da view mas existe marcado" de "sumiu de verdade". E o que reduz a fila de revisao da 4.3 ao genuinamente ambiguo | 4.3 sai de fila cheia para fila minima | dev do CRM - **pedido feito** |
| **F-04** | Conector le participacao no funil ou etapa dentro dele? | `cliente_estado_crm` | Vinicius |
| **AUD-11** | Sync de 30 min e requisito ou pode relaxar? | agendamento | Vinicius |
| **C1-crm** | Par de funil `Vendas-Integracao -> Donos de Usina` ainda nao existe | leitura de dono de usina | dev do CRM |

**Nenhuma vira improviso do implementador** (`CLAUDE.md` regra 10). As duas vermelhas novas - MERGE-01 e ATIVO-01 - nasceram da resposta do dev, nao da spec: sao consequencias do CRM que ninguem havia mapeado.

## 11. Fora de escopo / evolução futura

- **Sync incremental.** O desenho é full-scan porque reconciliação por diferença de conjunto exige o conjunto inteiro. Incremental só entra se o volume justificar, e aí a reconciliação precisa de outro mecanismo — não é otimização, é troca de desenho.
- **Webhook do CRM.** Empurrar em vez de puxar reduz latência e cria acoplamento: o financeiro passaria a depender de o CRM lembrar de avisar. Só com o full-scan mantido como rede.
- **Write-back de inadimplência.** Colide com o `PRD` §7.8 e com F-03. Se for necessário, é endpoint do financeiro consumido pelo CRM.
- **Espelho de histórico de titularidade da UC.** Hoje só estado corrente, como na `SPEC-001` §11.

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| **1.2** | **26/07/2026** | **Rodada 2 do dev absorvida, e ela resolveu duas vermelhas.** MERGE-01 fecha: o CRM criou `public.lead_merges` com backfill e o codigo gravando, e o par de 10/07 foi recuperado do log — nenhum cliente ativo pendurado. ATIVO-01 fecha por fato: o funil `Clientes ativos - Assinatura` esta **vazio**, e a etapa-fonte tambem, porque os 29 concluidos param em `Rateio Concluido` com `stage_type='normal'`, que nao dispara a automacao. Fonte de estado ativo troca para `financeiro.rateio_clientes`. COMISSAO-02 dissolve: o CRM **nao calcula** comissao, carimba tier — mas isso expos o furo da R20, corrigido na `SPEC-001` v2.5. Novas R16, R17, R18, invariantes 11 e 12, quatro testes |
| **1.1** | **26/07/2026** | **Retorno do dev absorvido.** AUD-07 e F-02 fecham. R1 ganha R1-b (o isolamento do caminho de leitura vem de 14 literais no corpo das views, nao da RLS - o conector valida `crm_tenant_id` por linha e aborta na divergencia) e R1-c (view vazia deixa de ser sintoma de RLS). 4.3 passa a redacao unica com ausencia classificada em tres. Novas R14 e R15, invariantes 9 e 10, tres testes. Duas vermelhas novas: MERGE-01 e ATIVO-01 |
| 1.0 | 25/07/2026 | Original. Escrita com a AUD-07 aberta e a §4.3 em duas redações declaradas, em vez de escolher a versão defensiva por precaução e criar trabalho manual permanente |
