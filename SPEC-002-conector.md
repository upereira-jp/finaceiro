# SPEC-002 — Conector: sincronização do CRM

| Campo | Valor |
|---|---|
| **Status** | Rascunho — **aguarda aceite do autor.** Reconciliada com o medido em 27/07 (v1.3); o aceite em si é decisão do dono, não de quem implementou |
| **Versão** | 1.4 |
| **Data** | 26/07/2026 · rev. 1.4 em 28/07/2026 |
| **Autor** | Vinicius Leal |
| **Fase** | **F1.** Resolvido em 27/07 pela `Q-FASE-01`: o `PRD-v2.2` §10 vence, porque a hierarquia do `CLAUDE.md` põe o PRD acima das SPECs. O cabeçalho anterior dizia *"F2 (parcial em F1)"* e era ele que divergia |
| **Depende de** | `SPEC-001` v2.3 (schema, isolamento, middleware) · `ADR-0001` · `ADR-0003` r2 |
| **Bloqueia** | Faturamento (F2) — sem espelho não há o que faturar |
| **Documentos-fonte** | `PRD-v2.2` §7 e §8 · `P7` (topologia de funis) · `P8` §5 · `VIEWS-PROPOSTAS-r2.sql` · `RESUMO-SESSAO-3` §4.3b e §4.4 |
| **Questões abertas** | **`Q-ESCOPO-01` é o bloqueio duro** (o conector entrega 1 das 4 entidades da §2) — ver §10. Também `Q-CICLO-ORFAO-01`, `Q-FASE-01`, F-04, AUD-11. ~~AUD-07~~ e ~~F-02~~ respondidas em 26/07 |

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

### 3.1 Campo espelho x campo local, por entidade

*Acrescentada em 27/07 (v1.3). Era a lacuna que a `Q-ESCOPO-01` nomeava: a §2 declarava quatro entidades e a spec não descia ao nível de coluna para três delas, o que tornava "completar o escopo" impossível de executar sem improviso. A separação abaixo é da `SPEC-001` §3.3 — **campo espelho o conector vence, campo local o usuário vence** — e cada linha marcada "local por ausência" foi **medida**, não suposta.*

**`usina`** — chave de espelho: **`codigo_geradora`**, não `crm_usina_id`. O motivo é a regra 11: `usina_codigo_unico` é índice único **cheio** sobre `(tenant_id, codigo_geradora)`, enquanto `crm_usina_id` não tem unicidade nenhuma — navegar por coluna sem unique é pedir para o espelho duplicar em silêncio.

| Coluna | Origem | Nota |
|---|---|---|
| `codigo_geradora` | **CRM** | chave de negócio do espelho |
| `apelido` | **CRM** | |
| `geracao_nominal_kwh` | **CRM** | de `usinas.geracao_kwh_mensal` |
| `potencia_kwp` | **CRM** | **0 de 3 preenchidos** (27/07). Nulo é gravado como nulo — nulo virando zero é a R9 ao contrário |
| `status` | **CRM** | `ativa` nas 3; valor fora do enum cai para `ativa` |
| `crm_usina_id` | **CRM** | rastreabilidade, não chave |
| `distribuidora` | **local** | **Reclassificado em 28/07 pela resposta do dev.** Não é dado do CRM faltando: **não existe tabela de referência de distribuidoras lá**, o campo é input de texto livre inicializado com `""`, e o dev confirmou que "tratar como cadastro local de vocês está correto" |
| `dono_usina_id` | **local por ausência** | `dono_lead_codigo` e `dono_lead_nome` vieram **0 de 3** porque `usinas.dono_lead_id` é NULL nas 3 e o `LEFT JOIN` produz os dois nulos juntos. O dev acrescentou uma nuance: o **mecanismo existe** (o formulário tem picker de dono, a rota cria e vincula lead-dono) e o funil `Vendas - Integração` existe — o que não existe é a **etapa** "Donos de Usina" e qualquer uso do campo. Segue como `C1-crm` |
| `data_homologacao`, `regime_fio_b` | **local** | o CRM não tem o conceito |

> **R19 (nova, e reescrita em 28/07).** **O conector não cria usina — ele espelha as que já existem. Usina do CRM sem cadastro local é recusa contada.**
>
> *Redação de 27/07, superada:* "usina sem distribuidora é recusa contada, nunca default", supondo que o CRM deveria preencher o campo e ainda não preenchia.
>
> **A premissa estava errada, e quem mostrou foi o dev em 28/07:** a view é projeção direta (o `''` está na coluna de origem), o campo é input de texto livre inicializado com `""`, e — o que decide — **não existe tabela de referência de distribuidoras no CRM**. A distribuidora não é um dado deles que está faltando; é um dado **nosso**. Logo é **campo local**, e campo local o usuário vence (R5). O conector nunca a escreve, nem na criação — e como a coluna é `NOT NULL` com FK, **segue que ele não cria usina**.
>
> A recusa continua existindo e continua contada. O que mudou foi **de quem ela cobra ação**: antes cobrava do dev do CRM, e era o endereço errado. Agora diz *"cadastre a usina e o próximo ciclo espelha o resto"*.
>
> Testes `N38` (espelha o que é espelho), **`N39` (o campo local vence mesmo quando o CRM manda um nome válido e diferente)**, `N41`/`N42` (recusa contada, zero criadas). Os dois plantios acusam: sobrescrever o campo local derruba o `N39`; criar a usina derruba o `N41`.
>
> **Nota sobre o `N39`, porque ele quase não valeu nada:** na primeira versão o valor local era `Equatorial` e o plantio da sobrescrita gravava `Equatorial` — o teste passava **com a violação plantada**, porque escrever o mesmo valor é indistinguível de não escrever. Corrigido para valores distintos (`Equatorial GO` local, `Equatorial` vindo do CRM).

**`usina_geracao`** — chave: `(tenant_id, usina_id, competencia)`, que já é única. Junção com o CRM por `codigo_geradora`.

| Coluna | Origem | Nota |
|---|---|---|
| `geracao_kwh` | **CRM** | nula é recusa contada (R9) |
| `origem` | **CRM** | sempre `'crm'`; o enum já previa os dois valores. É o que separa a série do CRM da digitada, e a F2 vai precisar disso para conferir fatura |

> **R20 (nova).** **Geração de usina não espelhada é recusa contada, não erro silencioso.** Gravar sem a usina é impossível (FK composta), e engolir esconderia o efeito **em cascata** da recusa anterior — que hoje é o caso normal, não a exceção: com as 3 usinas recusadas, as 8 linhas de geração não têm onde pousar. Teste `N43`; o plantio do silêncio acusa.

**`unidade_consumidora`** — especificada em 28/07, com a decisão da `F-01`: **espelho fiel**. Chave: **`numero_uc`**, e a escolha é da **regra 11** — o candidato natural seria `crm_usina_cliente_id`, mas o único índice dele (`uc_crm_unico`) é **parcial**, e "nenhum repositório navega por índice parcial". `uc_numero_unico` é cheio. Fonte: `rateio_clientes` × `rateio_creditos`, unidas por `contrato_id` (casou 36/36 na medição).

| Coluna | Origem | Nota |
|---|---|---|
| `numero_uc` | **CRM** | chave do espelho, de `rateio_clientes.uc` |
| `cliente_id` | **CRM** | via `rateio_creditos.lead_id`. **O cliente é criado se não existir** — é a decisão de espelho fiel |
| `usina_id` | **CRM** | via `codigo_geradora` |
| `percentual_rateio`, `data_vencimento` | **CRM** | `data_vencimento` veio **0 de 36**; o dev confirmou: campo disponível, a operação nunca digitou |
| `crm_usina_cliente_id` | **CRM** | rastreabilidade, **não** chave (índice parcial) |
| `distribuidora` | **derivada da usina** | ver `R21` |
| endereço, `titularidade`, `status` | **local** | o CRM não expõe |

> **R21 (nova).** **A UC herda a distribuidora da usina vinculada; sem usina espelhada, é recusa contada.** O CRM não expõe distribuidora em `rateio_clientes`, e a coluna é `NOT NULL` com FK. O conector **não escolhe valor**: ele propaga o que o usuário cadastrou na usina. **Precisa de confirmação** — `Q-UC-DISTRIB-01`. Teste `N46`; o plantio da distribuidora fixa acusa.

> **R21-b (nova, 28/07).** **A herança da R21 só vale no nascimento da UC. Depois disso, divergência entre a distribuidora da UC e a da usina é SINAL — não recusa e não sobrescrita.** A R21 propaga o valor da usina **no INSERT**; no UPDATE `distribuidora` fica de fora, porque é **campo local** e a R5 diz que o usuário vence. A consequência era silêncio: alguém edita a UC amanhã, põe outra concessionária, e nada notaria até um relatório vir errado. O sinal fecha esse buraco sem violar a R5 — a linha continua válida, o campo não é tocado, e a divergência vai para `conector_execucao.detalhe` e para a saída do script. **A diferença para `Recusa` é semântica e importa:** recusa significa "nada foi gravado" e é o que a invariante 8 conta; divergência significa "foi gravado, e alguém precisa olhar". Misturá-las faria a contagem de recusas medir duas coisas. O precedente é `garantia_de_tenant_degradada`, que também registra sem mudar o `status`. Testes `N51` (caminho limpo, zero sinais), `N52` (o sinal chega ao `detalhe`), `N53` (não sobrescreve e não recusa) e `N54` (o sinal sobrevive ao ciclo interrompido). **O que este sinal NÃO cobre, e é o motivo de a `Q-UC-DISTRIB-01` continuar aberta:** a conferência roda só no `UPDATE`. Uma UC que **nasce** pela R21 herda o valor da usina por construção e não pode divergir de si mesma — se a R21 estiver errada de origem, ela nasce silenciosa e assim permanece. Não é conferível internamente: o CRM não expõe distribuidora em `rateio_clientes`, então **não há segunda fonte** contra a qual comparar. Só a norma responde. Se a resposta for *"pode haver UC de outra concessionária"*, a UC passa a exigir cadastro local como a usina, e este sinal acusa cada divergência **à medida que a operação digitar o valor real** — ele não encontra as erradas sozinho.

> **R22 (nova).** **UC repetida entre contratos é recusa contada, e o conector não escolhe qual vale.** Medido: `000041446801282` em dois contratos, leads diferentes, mesma usina, mesmo percentual, digitados com 39 minutos de diferença na carga manual de 14/07 — o dev leu o modelo e concluiu que é erro de digitação, confirmando que **nosso modelo de UC única por tenant está certo**. Escolher qual das duas vale é o palpite que a R8 proíbe. Teste `N49`; sem a guarda, o `23505` derruba o lote inteiro — foi o que o plantio mostrou.

> **R23 (nova).** **Contrato de rateio que muda de UC é recusa contada.** `uc_crm_unico` é parcial e a regra 11 proíbe navegar por ele — mas ele **existe no banco e viola com `23505`**, e um `23505` no meio de um `createMany` derruba o lote inteiro. Conferido por `findMany` com predicado explícito, que é o que a regra 11 manda usar, e a violação vira recusa nomeada.

> **R24 (nova).** **`cliente_estado_crm.tem_rateio_ativo` é escrito pelo espelho de UC.** Era a coluna que nascia `NULL` desde a migration e que nenhum caminho preenchia. Teste `N47`.

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

> **R9.** **Valor nulo não é zero — e o que conta como valor depende do funil.** Ganho de funil de venda sem `valor_venda`, sem `valor_posicao` **e sem `consumo_kwh`** entra em `recusados`. A presença de **qualquer um dos três** basta.
>
> *Corrigida em 27/07 pela `Q-VALOR-01`, contra medição.* A redação anterior era *"ganho sem valor em nenhuma coluna"* e dizia que os únicos sem valor eram os 7 de Parceiros. **Falso:** o primeiro ciclo real mediu `Vendas - Assinatura` com **40 ganhos, 0 com `valor_venda`, 0 com `valor_posicao` e 40 com `consumo_kwh`**. O conector recusou os 40 — fez o certo, recusar em vez de adivinhar —, e foi a contagem de recusas que trouxe o erro da spec à tona, que é o papel da invariante 8. A leitura de negócio já estava na própria spec: assinatura de crédito de energia não tem "valor da venda", tem **consumo mensal**, e a R10 manda faturar por `consumo_kwh × tarifa`. Exigir `valor_venda` num funil de assinatura é cobrar o campo errado. Testes `N5b`/`N5c`, nos dois sentidos.

> **R10.** O conector **não deriva tarifa**. `consumo_reais` do CRM é `consumo_kwh × tarifa`, e a tarifa vive na tabela `tarifa` do financeiro, versionada. O conector espelha `consumo_kwh` e grava `consumo_referencia_centavos` como **semente**; a base de faturamento é sempre `consumo_kwh × tarifa` da competência (`SPEC-001` R23 e R24).

> **R11.** `percentual_rateio` é read-only no financeiro quando a UC tem `crm_usina_cliente_id`. Só o CRM valida o teto de 100% e o de kWh alocável (`PRD` §7.7).

> **R12.** Todo ciclo roda **dentro do contexto de um tenant**, pelo mesmo middleware da `SPEC-001` §3.2. O conector não tem caminho privilegiado: se ele pudesse ler sem contexto, o isolamento teria uma exceção — e exceção de isolamento é ausência de isolamento.

> **R16. Atribuicao de originador vem de `leads.partner_id`, nunca da tag.** Confirmado pelo dev em 26/07: `partner_id` e o campo primario e ja vem exposto em `vendas_ganhas` com `parceiro_nome`. A tag `indicado_por:<partner_id>` e **display e editavel na UI** — hoje sao 11 leads com `partner_id`, 6 com a tag, e **1 com tag sem `partner_id`**. Ler a tag importaria a inconsistencia. `contrato.originador_id` resolve por `partner_id`.

> **R17. O tier do contrato e semeado pelo campo `Comissionamento` do lead e congelado ali.** O `app_settings.g3_partner_rules` do CRM **nao calcula comissao** — carimba tier na criacao do lead, via RPC compartilhada entre backend e Edge Functions. A verdade por lead e o campo, e ele e a semente de `contrato.originador_tipo_no_fechamento` (`SPEC-001` R20-b). Uma verdade por lead; quem transforma em R$ e so o financeiro.

> **R18. Espelho de vitima de merge se funde pelo `lead_merges`, nao so desativa.** O CRM passou a manter `public.lead_merges` (vitima → sobrevivente), **sem FK para `leads` de proposito**, para a trilha sobreviver a DELETE fisico. Exposta em `financeiro.lead_merges`. Quando um `crm_lead_id` aparece como vitima, o financeiro **funde o espelho no sobrevivente**. Sem isso, contrato e UC ficam pendurados em cliente inativo.
>
> Ressalva medida: **vitima de merge tem `ultimo_funil` NULL** em `leads_arquivados`, porque as posicoes de funil migram no merge. Logo a classificacao "copia derivada" da §4.3 **nao pode usar `ultimo_funil` para vitima de merge** — a ordem de teste e `lead_merges` primeiro, `leads_arquivados` depois, funil por ultimo.


> **R14.** **Funil `Parceiros` fica FORA da base de comissao sobre valor.** Confirmado pelo dev em 26/07: `won` ali significa "parceiro ativado", nao venda, e os 7 ganhos nao tem valor em nenhuma coluna por natureza. Os 48 ganhos sao 40 `Vendas - Assinatura` + 1 `Vendas - Integracao` + 7 `Parceiros`. O filtro e por funil, e para eles a R9 nao dispara.
>
> ~~*"e os funis de venda tem **zero** ganhos sem valor"*~~ — **esta afirmacao era falsa e foi removida em 27/07** (`Q-VALOR-01`). Medido no primeiro ciclo real: 40 dos 41 ganhos de funil de venda nao tem `valor_venda` nem `valor_posicao`. O que os salva nao e o funil, e o `consumo_kwh` — ver a R9 corrigida. A redacao antiga fazia a R9 parecer inofensiva e ela recusou 40 linhas legitimas na primeira execucao real.

> **R15.** **O campo `Comissionamento` significa duas coisas diferentes dependendo do funil.** Em card de venda e aliquota. Em card do funil `Parceiros` e **tier do parceiro** - os 7 tem o campo preenchido (6 `PADRAO`, 1 `50%`) e nenhum deles e aliquota de venda alguma. O conector **nunca** le esse campo de card do funil `Parceiros`. Sobrecarga semantica de campo e como se paga o dobro sem ninguem mentir.

> **R13.** Um ciclo é **uma unidade de trabalho por lote**, não uma transação gigante nem uma transação por linha. Transação gigante estoura o `timeout` de 15 s e prende conexão do pool; transação por linha perde atomicidade do lote. Lote de tamanho declarado, com `conector_execucao` atualizado ao fim de cada um.
>
> **O tamanho declarado é 50**, e o número saiu de medição, não de estética (`Q-LOTE-01`, 27/07). O que limita o lote é **viagem ao banco**, não linha: com leitura e escrita em bloco o custo de um lote não cresce com o tamanho dele, exceto por **uma viagem por cliente que realmente mudou** — cada um muda para um valor diferente e não há update em bloco. Medido: lote de 50 custa **4** viagens quando nada mudou, **6** quando os 50 são criados e **54** no pior caso, quando os 50 mudam. A 75 ms por viagem — a latência até `sa-east-1` — o pior lote custa **4,05 s**, folga de 3,7× sobre os 15 s; um lote de 200 daria ~15,3 s, que é o penhasco.
>
> **A abertura do ciclo commita antes dos lotes**, e é isso que faz o `EXCLUDE` de `conector_execucao` valer contra um segundo ciclo concorrente. O preço é a `Q-CICLO-ORFAO-01`: ciclo morto por `kill` deixa o registro em `em_andamento`. O caminho normal fecha em `parcial` (§7) ou `erro`; a morte fora do `catch` segue aberta.

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
13. **Suposição não confirmada que o conector propaga vira sinal registrado, nunca silêncio** (R21-b). Divergência entre campo derivado e campo local aparece em `conector_execucao.detalhe` — e **não** é contada como recusa, porque a linha foi gravada.

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
| Concorrência | Usuário edita a `distribuidora` da UC para valor diferente do da usina | **Sinal, não recusa e não sobrescrita** (R21-b). A linha é gravada, o campo local é preservado, e a divergência vai para `conector_execucao.detalhe`. O `status` do ciclo **não** muda |
| Concorrência | Dois ciclos do mesmo conector se sobrepõem | Segundo não inicia. `conector_crm` guarda ciclo em andamento |
| Origem ausente | Cliente espelhado some do CRM | §4.3 — depende de AUD-07 |
| Falha | Ciclo morre no meio | `status = 'parcial'`; o que foi processado está commitado por lote (R13); próximo ciclo é idempotente e recompõe |

## 8. Critérios de aceitação

*Marcados em 27/07 com a evidência nomeada. Um critério sem o nome do teste ao lado é declaração, não aceitação.*

- [x] Segunda passada com o mesmo payload não altera nenhuma linha, nem timestamp — `N10` (2 linhas) e `N30` (1.000 linhas). **E contra o CRM real, 27/07: 2ª passada `criados: 0, atualizados: 0`, com um único instante de `criado_em` nas 41 linhas**
- [x] Nenhuma consulta do conector toca tabela fora de `financeiro.*` — **verificado por log de query**, `N35`; o detector é verificado no sentido inverso pelo `N36`
- [x] Escrita no CRM por qualquer caminho desta spec falha por permissão — `N21`/`N21b` (guarda de arranque, inclusive privilégio herdado por role) e `N25` (sessão `read-only`). Medido contra o CRM: **0 privilégio de escrita em objeto de negócio**
- [x] Lead ganho em dois funis produz **uma** linha de cliente — `N4`
- [x] View devolvendo zero linhas **não desativa nada** e marca o ciclo como `erro` — `N11`
- [x] Alíquota ambígua e valor nulo aparecem em `conector_execucao.recusados` e não geram valor gravado — `N12`/`N13`
- [x] Ciclo sem contexto de tenant falha, não lê zero — `N19b`
- [x] `conector_execucao` tem RLS habilitada, forçada e ≥1 policy — por consulta ao catálogo, `CAT-3`/`CAT-8`, **rodados também contra produção**
- [x] Ciclo com 1.000 linhas não estoura o `timeout` de 15 s do pool transacional — `N26`–`N31`. A medição é de **viagens por transação**, não de relógio: local, as 205 viagens que mataram a produção levam menos de um segundo

## 9. Testes obrigatórios

| Teste | Prova |
|---|---|
| `test_conector_idempotente` | Inv. 3 · R3 — `N10`, `N30` |
| `test_conector_nao_escreve_no_crm` | Inv. 1 · R2 — `N25` |
| `test_conector_so_le_views_financeiro` | Inv. 2 · R1 — **`N35`/`N36`**, por log de query |
| `test_dedup_por_lead_antes_do_upsert` | R4 — `N4` |
| `test_view_vazia_nao_reconcilia` | §7 — o caso que apagaria a carteira — `N11` |
| `test_espelhado_nao_deleta` | Inv. 4 · R6 — `N15`, `N33` |
| `test_estado_crm_so_conector` | Inv. 5 · R7 — **`N37`**, varredura de `src/`: um único escritor |
| `test_ciclo_sem_contexto_falha` | Inv. 6 · R12 — `N19b`; `N19c` pega o erro simétrico |
| `test_aliquota_ambigua_recusada` | Inv. 7 · R8 — `N5` |
| `test_valor_nulo_recusado` | Inv. 7 · R9 — `N5b`/`N5c`, com a R9 corrigida |
| `test_recusa_visivel_em_execucao` | Inv. 8 — `N12`/`N13` |
| `test_lote_respeita_timeout` | R13 · critério 9 — **`N26`–`N31`**, com três plantios |
| `test_conector_execucao_com_rls` | critério 8 — `CAT-3`/`CAT-8` |
| `test_tenant_divergente_aborta_ciclo` | Inv. 9 · R1-b — `N23`; `N24` prova o caminho legítimo; `N18` a porta apontada para outro tenant |
| `test_ausencia_classificada_em_tres` | §4.3 — `N6`/`N7`/`N8` |
| `test_parceiros_fora_da_comissao` | Inv. 10 · R14 e R15 — `N14` |
| `test_atribuicao_por_partner_id` | Inv. 11 · R16 — 🔴 **NÃO EXISTE, e não é teste faltando: é funcionalidade faltando.** O conector não cria `contrato`, então não há atribuição de originador para testar. Ver `Q-ESCOPO-01` na §10 |
| `test_vitima_de_merge_funde_espelho` | Inv. 12 · R18 — **`N32`/`N33`/`N34`**. Escrito em 27/07: o código existia desde a construção e **nenhum teste provava que a fusão acontece** — o `N6` provava só a ordem da classificação |
| `test_ordem_de_classificacao_de_ausencia` | R18 — `N6` |
| `test_divergencia_de_distribuidora_vira_sinal` | Inv. 13 · R21-b — **`N51`–`N54`**. O `N51` fixa o caminho limpo (sem ele o `N52` poderia estar acusando qualquer coisa); o `N53` separa sinal de recusa e de sobrescrita; o `N54` cobre o `fechar()` do caminho de **erro**, que é outro trecho de código e levava `recusas` sem levar `divergencias`. Os dois sentidos verificados por plantio |

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
| **Q-ESCOPO-01** | 🔴 **O conector entrega 1 das 4 entidades que a §2 declara.** A §2 "Entra" diz *"upsert idempotente em `cliente`, `unidade_consumidora`, `usina`, `usina_geracao`"*. Medido em 27/07: **só `cliente`** (mais `cliente_estado_crm`). Das 8 views que `leitura.ts` sabe ler, o motor chama **3** — `vendas_ganhas`, `leads_arquivados`, `lead_merges`; `usinas`, `rateio_clientes`, `rateio_creditos`, `geracao_mensal` e `parceiros` existem e nunca são consultadas. Consequências em cadeia: a R16 (originador por `partner_id`) não tem onde acontecer porque o conector não cria `contrato`, e o `test_atribuicao_por_partner_id` da §9 não é teste faltando, é **funcionalidade faltando**. **E isto é o que bloqueia a F2 de verdade:** sem espelho de usina e de geração não há base de faturamento. Decidir: (a) completar o escopo declarado antes de abrir a F2; (b) reduzir a §2 ao que existe e mover o resto para uma spec própria, com o custo declarado | **faturamento (F2)** | **Vinicius** |
| **Q-CICLO-ORFAO-01** | 🟡 Ciclo morto por `kill` deixa `conector_execucao` em `em_andamento` e o `EXCLUDE` trava o conector. Nasce da R13, que exige que a abertura commite antes dos lotes. Caminho normal coberto; morte fora do `catch` não. Três opções em `QUESTOES.md` — não improvisar prazo de expiração | agendamento não assistido | Vinicius |

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
| **1.4** | **28/07/2026** | **A suposição da R21 deixou de esperar confirmação e virou sinal.** Nova **R21-b**: divergência entre a `distribuidora` da UC (campo local, R5) e a da usina vinculada aparece em `conector_execucao.detalhe` — sem recusar e sem sobrescrever. Novo **invariante 13**, nova linha na §7, novo teste obrigatório (`N51`–`N54`). O `N54` nasceu de um buraco encontrado ao escrevê-lo: o `fechar()` do caminho de **erro** levava `recusas` e não levava `divergencias`, então o sinal se perderia justamente no ciclo interrompido. **Medido contra produção em 28/07: zero divergências nas 35 UCs** — o sinal nasce silencioso, que é o estado correto |
| **1.3** | **27/07/2026** | **Reconciliação com o medido — a spec estava atrás do código, e em SDD isso é a inversão que não se tolera.** A **R9** ganha a redação da `Q-VALOR-01`: `consumo_kwh` conta como valor, e a recusa exige ausência dos três. A **R14** perde a afirmação *"os funis de venda têm zero ganhos sem valor"*, **medida falsa** — eram 40 de 41. A **R13** ganha o **tamanho declarado (50)** e a conta de viagens que o fixa, que até aqui só existiam em comentário de código. A **§8** sai de 9 critérios em aberto para **9 marcados com o teste nomeado**, incluindo o "por log de query" que nunca fora atendido. A **§9** ganha o teste de cada linha — e expõe duas verdades desconfortáveis: `test_vitima_de_merge_funde_espelho` **não existia para código que existia**, e `test_atribuicao_por_partner_id` não é teste faltando, é a `Q-ESCOPO-01`. Duas questões novas: **`Q-ESCOPO-01`** (🔴, o conector entrega 1 de 4 entidades) e **`Q-CICLO-ORFAO-01`** (🟡) |
| **1.2** | **26/07/2026** | **Rodada 2 do dev absorvida, e ela resolveu duas vermelhas.** MERGE-01 fecha: o CRM criou `public.lead_merges` com backfill e o codigo gravando, e o par de 10/07 foi recuperado do log — nenhum cliente ativo pendurado. ATIVO-01 fecha por fato: o funil `Clientes ativos - Assinatura` esta **vazio**, e a etapa-fonte tambem, porque os 29 concluidos param em `Rateio Concluido` com `stage_type='normal'`, que nao dispara a automacao. Fonte de estado ativo troca para `financeiro.rateio_clientes`. COMISSAO-02 dissolve: o CRM **nao calcula** comissao, carimba tier — mas isso expos o furo da R20, corrigido na `SPEC-001` v2.5. Novas R16, R17, R18, invariantes 11 e 12, quatro testes |
| **1.1** | **26/07/2026** | **Retorno do dev absorvido.** AUD-07 e F-02 fecham. R1 ganha R1-b (o isolamento do caminho de leitura vem de 14 literais no corpo das views, nao da RLS - o conector valida `crm_tenant_id` por linha e aborta na divergencia) e R1-c (view vazia deixa de ser sintoma de RLS). 4.3 passa a redacao unica com ausencia classificada em tres. Novas R14 e R15, invariantes 9 e 10, tres testes. Duas vermelhas novas: MERGE-01 e ATIVO-01 |
| 1.0 | 25/07/2026 | Original. Escrita com a AUD-07 aberta e a §4.3 em duas redações declaradas, em vez de escolher a versão defensiva por precaução e criar trabalho manual permanente |
