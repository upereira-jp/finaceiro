# QUESTOES.md — registro único de questões abertas

| Campo | Valor |
|---|---|
| **Versão** | 1.0 |
| **Data** | 24/07/2026 |
| **Regra de origem** | `CLAUDE.md` regra 10 — contradição ou lacuna vira entrada aqui, nunca improviso |

> **Este arquivo é novo, e é uma consolidação — não uma fusão.**
>
> O `QUESTOES.md` original, com a faixa `Q-001 … Q-023`, **nunca chegou a nenhuma sessão** e não está no repositório. Não foi reconstruído: paráfrase de memória viraria canônico por acidente.
>
> O que está abaixo foi **recuperado por varredura do corpus** — `PRD-v2.2` §11, `SPEC-001` §10, `ADR-0002` r2, `ADR-0003`, `P7` §5, `P8`, `RESUMO-SESSAO-2` §4 e o `QUESTOES-bloco-para-fusao.md`. Onde o bloco de fusão registrava o mapeamento `Q-nnn → AUD-nn`, ele está preservado na coluna *Era*.
>
> **Lacuna conhecida:** questões do registro original que não foram citadas em nenhum documento sobrevivente estão perdidas. Não há como saber quantas. Se o arquivo original aparecer, funde por ID.
>
> **Duas séries de numeração, e elas colidem.** A auditoria numerou as suas questões `Q1 … Q12`; o registro do projeto usa `Q-001 … Q-023`. **`Q5` da auditoria (comissão) não é `Q-005` do registro.** A sessão 2 contornava isso com o sufixo "aud.", que resolve na conversa e falha em documento. Neste arquivo as questões da auditoria aparecem como `AUD-nn` e as do registro como `Q-nnn`, e a coluna *Era* preserva o mapeamento. — *Nota herdada do `QUESTOES-bloco-para-fusao.md`, que sai do repositório com esta absorção: era a única informação daquele arquivo que a consolidação de 24/07 não havia trazido.*

---

## 1. Taxonomia de severidade

O critério de saída da F0 no `PRD-v2.2` §10 exige *"`QUESTOES.md` sem bloqueio vermelho"*. **A classificação nunca foi definida** — a palavra "vermelho" aparecia uma única vez em todo o corpus, dentro do próprio critério. Definida aqui:

| Nível | Significado | Efeito |
|---|---|---|
| 🔴 **Vermelho** | Sem esta resposta, código escrito agora **será jogado fora** ou entrará em produção errado. Bloqueia a fase em que está | Impede o avanço de fase. É o que o critério de saída mede |
| 🟡 **Amarelo** | Bloqueia uma entrega específica, não a fase. Dá para avançar em paralelo e absorver depois | Não impede o avanço de fase; impede o *merge* da entrega que depende dela |
| 🟢 **Verde** | Precisa de resposta antes do go-live, mas não altera desenho. Preenchimento, parâmetro, conteúdo | Nenhum |

**Regra de classificação:** é vermelha se a resposta errada obriga a **reescrever schema, policy ou contrato de integração**. É amarela se obriga a reescrever uma tela, um relatório ou um cálculo. É verde se só muda um valor.

Uma questão sem dono nomeado é automaticamente vermelha, por não ter caminho de resolução.

---

## 2. Placar por fase

| Fase | 🔴 | 🟡 | 🟢 | Situação |
|---|--:|--:|--:|---|
| **F0** | **3** | 1 | 0 | **aberta** — ver §3 |
| **F1** | **1** | 8 | 1 | **em execução** — as duas vermelhas fecharam em 26/07: F-02 na §9, F-03 por decisão normativa. Em 27/07: `Q-SPEC001-08`, `MT-09` e `Q-CLAUDE11-01` abertas; `MT-06`, `Q-RBAC-01`, `Q-AUDIT-01` e `Q-DISTRIB-01` resolvidas (§9). **O conector foi construído em 27/07** (`src/crm/`, 19 verificações) mas **não rodou contra o CRM real**: falta `CRM_DATABASE_URL`. E a `Q-VIEWS-01` abriu **vermelha** — as views existem e não cumprem as duas condições que a `SPEC-002` pressupõe. A `SPEC-002` segue em rascunho e a fase do conector é a `Q-FASE-01` |
| F2 | 2 | 3 | 2 | — |
| F3 | 2 | 1 | 0 | — |
| F6 | 0 | 1 | 1 | — |

---

## 3. F0 — o que falta para fechar

Entregas da F0 conforme `PRD-v2.2` §10:

| Entrega | Situação |
|---|---|
| Auditoria do CRM | ✅ concluída (P0–P6), reverificada em 24/07 (P8), sem deriva |
| Spike Prisma + RLS | ✅ **fechado.** `ADR-0003` **r2**, 21 + 12 testes. Só o PgBouncer segue sem cobertura, e está fora do escopo da F1 |
| Decisões de comissão | ✅ **fechadas em 24/07** — eixo único, PADRAO 50%, tabela desenhada na `SPEC-001` §3.3 |
| Decisões fiscais | 🔴 **risco aceito, não resolvido.** Rebaixadas de bloqueio de F0 para bloqueio de F2/F3. A reunião com o contador não ocorreu |
| Provisionamento de infra | ✅ **fechado em 24/07** — `ADR-0004` |

| ID | Nível | Pergunta | Quem responde |
|---|:--:|---|---|
| **Q-011** | 🔴 | Retenção sobre comissão a PF — incide, e como? | contador |
| **Q-002 C** | 🔴 | Escrituração sem emissão de documento fiscal | contador |
| **Q-003 C** | 🔴 | Crédito de IBS/CBS na operação | contador |
| **AUD-05b** | 🟡 | De onde vem o `30%` — 3 leads apenas. Sem categoria correspondente na tabela de taxas | Vinicius |
| **Item 10** | 🔴 | Comissão a sócia é despesa dedutível ou distribuição de lucro? Renata concentra 39 de 48 ganhos (83%) | contador |

**Quatro vermelhas restantes, todas do contador.** As de engenharia e as de decisão fecharam em 24–25/07.

**A assimetria do fechamento da F0, registrada e não escondida:** a comissão foi **resolvida**; o fiscal foi **aceito como risco**. As quatro questões acima não foram respondidas — foram rebaixadas para bloqueio de F2/F3. A F1 não toca nenhuma delas e corre inteira. Mas no dia em que a F2 começar, as quatro voltam a ser vermelhas e a reunião vira pré-requisito outra vez, agora sem folga de calendário. **Marcar o contador durante a F1 é o caminho de menor dor.**

---

## 4. F1 — fundação

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| ~~**F-02**~~ | — | ~~Quais funis contam como conversão final?~~ **Resolvida — ver §9.** Estava contada em duplicidade no placar até 26/07 |
| ~~**F-03**~~ | — | ~~Quem mantém `INADIMPLENTES`?~~ **Resolvida por decisão normativa — ver §9** |
| MT-01 | 🟡 | Usuário pode pertencer a mais de um tenant? Custo de errar: uma constraint | Vinicius |
| MT-07 | 🟡 | Quem informa o `crm_tenant_id` ao ativar um conector, e como se valida | Vinicius |
| AUD-09 | 🟡 | CPF/CNPJ: CRM exige ou o financeiro coleta? | Vinicius |
| Q-SPEC001-03 | 🟢 | Endereço da UC: coleta local obrigatória ou opcional? | Vinicius |
| MT-09 | 🟡 | **O Supabase habilita RLS sozinho, e habilita do jeito que a regra 3 chama de falha.** O projeto traz o event trigger `ensure_rls` (`ddl_command_end`) e a funcao `SECURITY DEFINER` `public.rls_auto_enable`, que roda `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em toda tabela nova de `public`. Ela **nao cria policy e nao poe FORCE** — exatamente o estado das 82 de 151 tabelas do CRM, que nega tudo em silencio. Consequencia: uma tabela futura que esqueca a RLS nao fica *sem* RLS, fica com **RLS sem policy**, por default da plataforma e nao por desenho nosso. Entrou na lista branca do invariante 19 em 27/07 porque nao controlamos nem podemos remover a funcao. **ATUALIZADO em 27/07, e a atualizacao muda a pergunta: isto deixou de ser risco previsto e virou fato medido no nosso schema** — ver `Q-DISTRIB-01` na §9. O event trigger habilitou RLS em `distribuidora`, sem policy e sem FORCE, e a role de runtime passou a ler **zero** linhas dela. A mitigacao que esta entrada declarava — *"coberto pelo CAT-3"* — **nao existia**: o CAT-3 filtra por `ter tenant_id`, e o comentario dele nomeava `distribuidora` como exemplo do que ignorar. Coberto agora pelo **CAT-8**, que acusa qualquer tabela com RLS e zero policies e roda tambem contra producao. **O que resta decidir e menor, mas segue aberto:** tratar no provisionamento (`ADR-0004`) — desabilitar ou neutralizar o event trigger para o nosso schema —, ou conviver com ele e confiar no CAT-8 como rede. Note que o CAT-8 e *deteccao*, nao prevencao: ele acusa depois que a tabela nasceu errada | Vinicius |
| Q-SPEC001-08 | 🟡 | **A `SPEC-001` se contradiz na contagem de FKs compostas.** A §3.4 linha 320 registra que *"**A décima** entrou na v2.9 com `regra_repasse`"*, mas duas linhas adiante o documento continua na contagem antiga: linha 536 — *"As **nove** FKs da §3.4 são compostas, e cada uma rejeita a referência cross-tenant com `23503`"* — e linha 565 — *"`test_fk_composta_rejeita_cross_tenant` \| §3.4 · Inv. 2 — as **nove** FKs, uma a uma"*. Medido em 27/07 contra o banco com as 12 migrations: são **dez**, e dez é o correto. A décima é `regra_repasse_usina_fk`. Consequência pela regra 8: o checklist e a tabela de testes cobrem nove, então a décima é invariante sem teste nomeado. **Correção é do autor da SPEC — não editar** | Vinicius |
| Q-CLAUDE11-01 | 🟡 | **O mecanismo que a regra 11 declara como automático deixou de valer, e ninguém foi avisado porque nada falhou.** A regra 11 afirma: *"O Prisma já exclui parcial das chaves de `findUnique` — verificado no DMMF"*, e `src/repos/cliente.ts` repete a afirmação em comentário. Medido em 27/07 nos tipos gerados: **é falso hoje**. Com `previewFeatures = ["partialIndexes"]` ligado no generator (`prisma/schema.prisma` linha 4), o `db pull` passou a emitir `where: raw(...)` nos `@@unique` parciais, e as chaves **aparecem** em `findUnique`. Conferido: `clienteWhereUniqueInput` expõe `tenant_id_documento` (índice `cliente_documento_unico`, parcial `WHERE documento IS NOT NULL`) e `unidade_consumidoraWhereUniqueInput` expõe `tenant_id_crm_usina_cliente_id` (`uc_crm_unico`, parcial). **Consequência:** o `findUnique` por chave parcial agora *compila*, e para um predicado que não seja `IS NOT NULL` — o caso do `contrato_ativo_unico_por_uc` que originou a regra — várias linhas podem compartilhar a chave e o Prisma devolve uma arbitrária. É exatamente o modo de falha dos R$ 111,00 contra R$ 789,00, com a proteção que a regra supunha existir removida. **O `CAT-1` não cobre isto:** ele acusa índice parcial que cobre exatamente as colunas de uma **FK**, que é outro caso. Não há invariante para "parcial virou chave de `findUnique`". Os repositórios escritos em 27/07 usam `findFirst` com predicado explícito e não dependem da proteção automática — o furo é para quem escrever o próximo. **Decidir:** (a) reescrever o mecanismo declarado na regra 11 e a fonte do comentário em `cliente.ts`; (b) acrescentar `CAT-8` que compare os índices parciais do catálogo com as chaves do DMMF; (c) avaliar se `partialIndexes` deve continuar ligado. **Alteração da regra é do autor do `CLAUDE.md` — não editar** | Vinicius |


| Q-FASE-01 | 🟡 | **O `PRD` §10 põe o conector na F1; o cabeçalho da `SPEC-002` diz "Fase: F2 (parcial em F1)".** A hierarquia normativa do `CLAUDE.md` (`PRD → SPECs`) faria o PRD vencer, e então a F1 só fecha com o conector — dois dos três critérios de saída da fase dependem dele (*sync idempotente*, *escrita no CRM falha por permissão*). Levado ao dono em 27/07, que optou por **decidir depois de ver o conector pronto**; o conector foi construído na mesma sessão. Enquanto não houver decisão, **a F1 não é declarada fechada**. Decidir: (a) PRD vence, conector é F1 e a fase fecha quando ele rodar contra o CRM real; (b) alterar o `PRD` §10 para mover o conector e os dois critérios para a F2 — alteração do PRD é do dono | Vinicius |

| Q-PROV-01 | 🟡 | **O `RESUMO-SESSAO-7` afirma que "daí em diante o próprio app cria tenant e vínculo, com auditoria" — e esse caminho não existe.** Medido em 27/07: não há repositório nem rota que crie `tenant`, e o caminho não é trivial de abrir. A policy `tenant_por_tier` exige `app.current_tier() = 'plataforma_admin'` no `WITH CHECK`, e o único emissor de contexto com tier é `abrirComoPlataforma()`, que recebe um `tenantId` **já existente** para atravessar. Criar o **primeiro** tenant não tem tenant onde se apoiar — é o mesmo ovo-e-galinha do primeiro `plataforma_admin`. **Não foi improvisado:** inventar contexto para uma linha que ainda não existe abriria uma segunda porta de emissão de contexto, e a `SPEC-001` §3.2 existe para não haver uma segunda. O provisionamento ficou em `scripts/provisionar-tenant.sql`, na mesma faixa do bootstrap e da role de runtime, com `modo=ensaio\|valendo` e três guardas verificadas. **Decidir:** (a) aceitar que criar tenant é provisionamento por `psql`, e corrigir a frase do `RESUMO-SESSAO-7`; (b) abrir um caminho de aplicação — exigiria repositório, rota e uma forma de emitir contexto de plataforma **sem** tenant alvo, que é desenho novo e provavelmente ADR; (c) permitir só a partir do segundo tenant, com o primeiro nascendo por script. A (c) é o meio-termo honesto: o primeiro de qualquer coisa é sempre provisionamento | Vinicius |

| Q-VALOR-01 | 🟡 | **A `SPEC-002` R14 afirma que "os funis de venda têm zero ganhos sem valor". Medido no primeiro ciclo real, 27/07: é falso.** Contagem na origem: `Vendas - Assinatura` 40 ganhos, **0** com `valor_venda`, **0** com `valor_posicao`, **40** com `consumo_kwh`; `Vendas - Integração` 1 ganho com valor; `Parceiros` 7 sem nada. O conector recusou os 40 — fez o certo, recusar em vez de adivinhar — e a **contagem de recusas foi o que trouxe o problema à tona**, que é exatamente o papel da invariante 8. **Leitura do negócio, e já estava na própria spec:** assinatura de crédito de energia não tem "valor da venda", tem consumo mensal, e a R10 manda faturar por `consumo_kwh × tarifa` tratando valor do CRM como semente. Exigir `valor_venda` num funil de assinatura é cobrar o campo errado. **Decisão do dono, 27/07:** `consumo_kwh` conta como valor; a recusa passa a exigir ausência dos três. Implementado, com testes `N5b`/`N5c` nos dois sentidos. **Fica pendente:** (a) atualizar a redação de R9 e R14 na `SPEC-002` — texto de spec é do autor; (b) a R10 também manda gravar `consumo_referencia_centavos` como semente a partir de `consumo_reais`, e **não foi implementado** porque converter reais em centavos exige decidir arredondamento e a R23 proíbe `round()` em intermediário | Vinicius |
| Q-LOTE-01 | 🔴 | **A R13 não está implementada, e o primeiro ciclo real com volume estourou o `timeout`.** A `SPEC-002` R13 diz: *"Um ciclo é uma unidade de trabalho por **lote**, não uma transação gigante nem uma transação por linha. Transação gigante estoura o `timeout` de 15 s e prende conexão do pool"*. `executarCiclo()` foi escrito com o ciclo inteiro numa transação. Medido em 27/07 contra produção: com 1 cliente espelhado passava; assim que a `Q-VALOR-01` liberou os 41, o ciclo morreu com `P2028` — *"15330 ms passed since the start of the transaction"*. **A causa é latência, não CPU:** cada cliente faz ~5 idas ao banco (`findFirst` cliente, `create`, `findFirst` de novo dentro de `escreverEstadoCrm`, `findFirst` estado, `create` estado) × 41 clientes ≈ 205 viagens até `sa-east-1`. **Há uma ineficiência óbvia junto, e ela é minha:** `escreverEstadoCrm()` reconsulta o cliente por `crm_lead_id` embora `espelharCliente()` já tenha o `id` em mãos — uma viagem desperdiçada por cliente. **Não foi contornado subindo o `timeout`:** o critério §8 é *"ciclo com 1.000 linhas não estoura o timeout de 15 s"*, e afrouxar o limite para caber 48 linhas entregaria um conector que quebra no primeiro mês de crescimento. **Bloqueia o fechamento da F1**, porque o critério de saída *sync idempotente* exige duas execuções completas. **A fazer:** lotes com transação própria, `conector_execucao` atualizado ao fim de cada, e o teste obrigatório `test_lote_respeita_timeout` da §9 | — |

## 5. F2 — faturamento

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| **POP-01** | 🟡 | **Tres populacoes, tres numeros, e o faturamento precisa de um denominador.** 29 leads em `Rateio Concluido` · 36 vinculos em `usina_clientes` · 28 de 36 homologadas (sessao 3). Qual e a base de cobranca? | Vinicius + operacao |
| **F-01b** | 🔴 | **Sucessora do F-01.** Nenhuma etapa do funil marca o cliente pagante — o card sai do `won` à mão, e o estado "desconto na fatura" vive fora do CRM. O gatilho real é a 1ª fatura com desconto da distribuidora. Faturar no `won` do Rateio fatura cedo demais | Vinicius + operação |
| **Q-021 / AUD-03** | 🔴 | Faturar pela geração nominal ou pela série real? | Vinicius + dev CRM |
| F-04 | 🟡 | Conector lê participação no funil ou etapa dentro dele? | Vinicius |
| AUD-04 | 🟡 | Como o financeiro sabe que a competência está fechada? | Vinicius + operação |
| Q-SPEC001-02 | 🟡 | `data_vencimento` 100% vazia no CRM. Quem preenche, por UC ou por contrato? | operação |
| O-02 | 🟢 | Quando um cliente novo começa a ser faturado | operação |
| AUD-11 | 🟢 | Sync de 30 min é requisito ou pode relaxar? | Vinicius |

## 6. F3 — split e comissão

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| **Q-022** | 🔴 | Como o contrato é atribuído ao originador, com `partner_id` em 3%? Medir antes o custom field `Comissionamento` | Vinicius |
| ~~**Q-SPEC001-04**~~ | — | ~~`percentual_repasse` vive na usina ou só em `regra_split` versionada?~~ **Resolvida em 26/07 — ver §9** |
| AUD-08 | 🟡 | Quem preenche `usinas.dono_lead_id`? Nulo em 3 de 3 — bloqueia repasse | operação |

## 7. F6 e além

| ID | Nível | Pergunta | Quem |
|---|:--:|---|---|
| AUD-02 | 🟡 | Rateio incompleto (91,20% e 99,78%) é intencional? | operação |
| AUD-10 | 🟡 | Regra dos 25%: de onde vem, sobre o que incide, bloqueia ou alerta? | Vinicius |
| O-01 | 🟢 | Parâmetros da lista de rateio | operação |
| F-05 | 🟢 | Vendas - Integração entra na mesma carteira? | Vinicius |

## 8. Fora do financeiro — dev do CRM

| ID | Nível | Pergunta |
|---|:--:|---|
| **MT-08** | 🟡 | Parametrizar as views `financeiro.*` — hoje o UUID da G3 é literal em 14 pontos. Bloqueia no segundo tenant |
| AUD-07 | 🟡 | Merge de leads duplicados apaga fisicamente um `id`? Afeta a reconciliação por diferença de conjunto |
| Q-SPEC001-07 | 🟢 | O CRM vai quebrar `vendedor_tipo` em cinco valores? **Deixou de bloquear** — a `SPEC-001` R20 chaveia a comissão por `originador.tipo`, que é local. Melhora a semente, não desbloqueia nada |
| — | 🟡 | Aplicar o `VIEWS-PROPOSTAS-r2.sql`, com a correção do `LIMIT 1` sem `ORDER BY` na linha 92 |
| — | 🟡 | 49 tabelas de backup em `public`, 21 com `tenant_id`, nenhuma com policy. Retenção e destino (`P8` §3) |
| — | 🔴 | Segredos em `text` puro na tabela `tenants` (`P8` §4) |

---

| Q-PGNET-01 | 🟡 | **A extensão `pg_net` concede `arwdDxtm` a `PUBLIC` no CRM, e isso dá escrita a toda role do banco — inclusive `financeiro_ro` e `anon`.** Medido em 27/07 ao endurecer a guarda de arranque do conector: `net.http_request_queue` e `net._http_response` têm ACL `=arwdDxtm/supabase_admin`, ou seja, o grant vazio (PUBLIC) com todos os privilégios. Também `extensions.pg_stat_statements` e `..._info` com `SELECT` a PUBLIC. **Nada disso é concessão do dev** — é default da extensão. **Consequência:** quem alcança qualquer credencial daquele banco pode enfileirar requisição HTTP saindo do Postgres do CRM. Não é dado de negócio e não viola a regra 4 no sentido estrito (o financeiro não modifica o CRM), mas também não é nada. **Do nosso lado já está tratado:** o pool do conector abre a sessão com `default_transaction_read_only=on` (teste N25 prova que o INSERT falha), e `conferirRoleDeLeitura()` devolve esses privilégios em `privilegiosDeInfraestrutura` em vez de silenciá-los. **Do lado do CRM, é decisão do dev:** `REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC` é o endurecimento usual, e precisa ser conferido contra quem hoje usa `pg_net` lá. **Corrige uma afirmação minha:** o `PROMPT-dev-crm-rodada3` dizia que `financeiro_ro` tinha "0 privilégio de escrita" — a medição que produziu esse zero filtrava `information_schema.table_privileges` por `grantee = current_user`, que **não enxerga grant a PUBLIC nem privilégio herdado por participação em role** | dev do CRM |

## 9. Resolvidas

| ID | Era | Resolução |
|---|---|---|
| **Q-VIEWS-01** | — | **Resolvida em 27/07, no mesmo dia, pelo dev do CRM.** As 8 views `financeiro.*` passaram a expor `crm_tenant_id uuid`. Conferido contra o CRM: **1** valor distinto e **0** nulos em cada, e o **mesmo** valor nas oito (`d4640f4b-f833-…`). Coluna no **fim** de cada lista, respeitando a restrição do `CREATE OR REPLACE VIEW`. E — o que mais importa — **`security_invoker` não foi ligado**, o que teria quebrado a leitura inteira. A validação por linha da `SPEC-002` R1-b passou a rodar de verdade: `src/crm/leitura.ts` compara toda linha recebida e aborta o ciclo na primeira divergência. **Teste N23** (`test_tenant_divergente_aborta_ciclo` da §9) prova contra um schema `financeiro` local com uma linha plantada de outro tenant; **N24** prova o outro sentido, que o caminho legítimo segue passando. `garantia_de_tenant_degradada` deixou de ser o estado normal e virou o sinal de que alguém removeu a coluna | — |
| **Q-AUDIT-01** | — | **Resolvida em 27/07 por decisão do dono: `usuario_id` entra no `coalesce` de `app.auditar()`, por último.** Migration 13. A ordem é o que torna a correção segura — onde existe `id`, `id` continua vencendo, então as outras quinze tabelas auditadas não mudam de comportamento. `plataforma_admin` era a única das dezesseis sem `id` e sem `cliente_id`, e gravava `registro_id` NULL: a escrita mais privilegiada do sistema era a única cuja trilha não se consultava pelo índice `auditoria_registro_idx`. Descartada a opção de dar `id` próprio à tabela, por mexer em PK, `db pull` e tipos gerados para um ganho que uma linha entrega. **Testes G6 e G7 em `tests/auditoria.sql`, verificados nos dois sentidos:** replantado o `coalesce` antigo, o G6 acusa (`achou 0`) e a suíte aborta; o G7 fixa que `usuario_tenant` — que tem as **duas** colunas — segue identificada pelo próprio `id`, e é ele que pega alguém reordenando o `coalesce` depois |
| **Q-DISTRIB-01** | — | **Resolvida em 27/07 por decisão do dono: policy explícita + `CAT-8`.** Migration 13 dá a `distribuidora` a policy `distribuidora_leitura_publica FOR SELECT USING (true)`, tornando declarada uma intenção que era suposta em comentário. Medido depois de aplicar: a role de runtime passou de **0 para 1** linha visível. O `CAT-8` é a parte que importa mais — ele acusa **qualquer** tabela de `public` com RLS e zero policies, sem o filtro por `tenant_id` que fazia o `CAT-3` olhar para o outro lado, com lista branca nominal para `_prisma_migrations`. Verificado nos dois sentidos em banco local: acusa tabela plantada com RLS sem policy, e respeita a lista branca. **E rodado contra produção**, onde os 8 invariantes passam — o `CAT-8` estava vermelho lá antes da migration, e nenhuma suíte local teria mostrado isso, porque o PG16 de teste não tem o event trigger da plataforma. Fica registrado que o `catalogo.sql` é leitura pura e **deve** ser rodado contra produção: `psql "$DIRECT_URL" -f tests/catalogo.sql`. Reclassifica o `MT-09`, que seguia aberto como risco *previsto* coberto pelo `CAT-3` — a cobertura não existia |
| **MT-06** | — | **Auth PRÓPRIO, decidido em 27/07 pelo dono do projeto.** Sem SSO com o CRM: de lá o financeiro só lê lead ativo, e leitura de dado não é motivo para acoplar identidade. Acoplar significaria que o ciclo de vida da conta no CRM — desativação, rotação de segredo, mudança de provedor — passaria a governar o acesso ao financeiro, que é o sistema de dinheiro. Implementado em `src/auth/jwt.ts` e `src/auth/autenticador.ts`: JWT do Supabase Auth **do projeto do financeiro**, verificado com `node:crypto`, sem dependência nova. `usuario.auth_user_id` é o `sub` desse emissor e de nenhum outro — e o teste J9 recusa token cujo `iss` seja o do CRM. Preferência declarada pelo **JWKS assimétrico** sobre o segredo HS256 legado: com o segredo simétrico o servidor também consegue assinar, e quem o lê forja token de qualquer usuário |
| **Q-RBAC-01** | — | **Alinhada ao PRD em 27/07: `escrever_cadastro` passa a ser `['admin']`.** A implementação dava a `financeiro` escrita em Cadastros, onde o `PRD-v2.2` §3 dá apenas leitura. Critério da decisão: a hierarquia normativa do `CLAUDE.md` é `PRD → ADRs → SPECs` e o código não está nessa lista — ele implementa —, então divergência entre código e PRD é defeito do código. A divergência era **permissiva**, que é a direção perigosa: restringir é reversível, descobrir excesso de permissão em produção não. Descartado um meio-termo que separaria "cadastro operacional" de "cadastro que define dinheiro", por inventar vocabulário ausente de todo documento — que foi exatamente como `escrever_cadastro` nasceu divergente. **Consequência operacional:** só `admin` cadastra cliente, UC, usina, originador e contrato. Se a operação mostrar que isso trava, o conserto é a §3 do PRD, nunca o `contexto.ts` |
| **F-03** | — | **Resolvida por decisão normativa, não por escolha nova.** A regra 4 do `CLAUDE.md` e o `PRD` §7.8 proíbem write-back: inadimplência é dado do **financeiro**, e o CRM consome endpoint exposto por ele se quiser exibir. Ficou vermelha por sessões sem que houvesse decisão a tomar — a hierarquia já a tinha respondido |
| **Q-SPEC001-04** | — | **`regra_repasse` versionada por usina e por vigência**, com `EXCLUDE` no banco; `usina.percentual_repasse` removida. Por usina e não por tenant porque cada dono negocia o seu; por vigência e não congelada no contrato porque o eixo de tempo do repasse é a **competência** — o contrato é com o consumidor, o repasse é com o dono da usina. Migration 10, `SPEC-001` R25 |
| **Autopromoção a plataforma** | — | **Furo medido em 26/07.** `plataforma_admin_self` era policy `FOR ALL` sem `WITH CHECK`, e o `USING` vale como check de escrita: papel `leitura` inseria a própria linha com tier `plataforma_admin` e passava a ler todos os tenants. Policy virou `FOR SELECT`, escrita revogada da role da aplicação. Invariante 16 pega a **classe** — qualquer policy `FOR ALL` sem `WITH CHECK` em tabela gravável |
| **Trilha da R2 burlável** | — | **Furo medido em 26/07.** O gatilho lia `app.current_tier()` no COMMIT e quem escreve controla o GUC: apagar `app.tier` antes de commitar dispensava a trilha. Reancorado no `tier` gravado em `auditoria` **na escrita**, com `xact_id` em vez de `xmin` — que quebraria em subtransação. Um gatilho em `auditoria` no lugar de treze |
| **Cobertura da trilha** | — | **Quatro tabelas de treze, e as quatro erradas.** Sem gatilho ficavam `dono_usina` e `originador`, que guardam chave PIX e conta bancária. Medido: PIX do dono de usina de outro tenant trocado sob tier, sem rastro. Agora dezesseis tabelas, e a invariante 17 confere por catálogo |
| **Regra 9 sem implementação** | — | **A regra exigia *antes e depois* e não havia tabela nenhuma.** `acesso_plataforma_log` é trilha de acesso, não auditoria, e era apagável pela própria role que a escrevia. `auditoria` com imagem de linha, append-only por privilégio (invariante 18) |
| **Preço ausente devolvia NULL** | — | `tarifa_vigente` e `percentual_comissao` devolviam NULL na ausência, e `consumo_centavos(x, NULL)` é NULL: base de faturamento que soma como nada e `coalesce` como zero. As três funções levantam `no_data_found`. `distribuidora` virou tabela de referência com FK — o risco que a própria seed havia nomeado e escolhido aceitar |
| AUD-01 | Q1 | `ADR-0002` r2 — mesma entidade em funis diferentes; disjunção estrutural, não backfill |
| AUD-12 | Q12 | `Q-023` — consumir `financeiro.*` direto; não criar o schema `integracao` |
| Dado monetário | — | `PRD` §7.5 — `leads.consumo_reais`, 100% preenchido. `valor_venda` morto por desenho |
| `auditoria_ro` | — | Role removida em 24/07 (`P8` §6). Único item com prazo, encerrado |
| **ADR-0003** | — | **`SET LOCAL` por transação.** Spike em 24/07 (21 testes), lacuna do `$transaction` fechada em 25/07 (12 testes) — r2. Contrato do middleware na `SPEC-001` §3.2 |
| **AUD-05** | Q5 aud. | Tabela do PRD, escalonada — decisão A1 de 24/07 |
| **AUD-05a** | — | **`PADRAO` é 50%, e sempre foi.** Os 303 leads em `PADRAO` já eram 50% |
| **AUD-06** | — | Senioridade é **local**, em `originador.tipo` (`SPEC-001` R20 e R15). Não depende do CRM |
| **F-01** | — | **Morto pela decisão C1-b.** As 28/36 pessoas em rateio estão homologadas com assinatura não iniciada: não há carteira legada a migrar. Sucessora: F-01b na §5 |
| **Q-SPEC001-06** | — | Organização Supabase **separada** — decisão A2, `ADR-0004` |
| **PRD §2.3** | — | Provisionamento decidido — `ADR-0004`: organização separada, `financeiro.blackhaus.io`, mesmo VPS sob cinco condições |
| Contagem de FKs | — | Sete era estimativa; a varredura nominal rende **nove**. Lista fechada na `SPEC-001` §3.4 |
| **AUD-07** | — | **Merge nao apaga** (marca `removido_do_funil_em` + tag). Mas ha dois caminhos de DELETE fisico fora do merge, um **rotineiro** (sync "Clientes Ativos"). `SPEC-002` §4.3 classifica ausencia em tres |
| **MERGE-01** | — | **Resolvida pelo dev em 26/07.** `public.lead_merges` criada, **sem FK para `leads` de proposito** (a trilha sobrevive a DELETE fisico), com backfill e o codigo gravando antes de arquivar. O par de 10/07 foi recuperado do log pm2, e **os dois lados estao arquivados** — nao ha cliente ativo pendurado. `SPEC-002` R18 funde o espelho em vez de so desativar |
| **ATIVO-01** | — | **Resolvida por fato, nao por opiniao.** O funil `Clientes ativos - Assinatura` esta **vazio**, e a etapa-fonte (`Desconto Ativo`, won do Rateio) tambem: os 29 concluidos param em `Rateio Concluido`, `stage_type='normal'`, que **nao dispara** a automacao. C1 leria vazio nao por volatilidade, mas porque a operacao nao estaciona ninguem na fonte. **Fonte troca para `financeiro.rateio_clientes`** (36 vinculos), que e o estado real |
| **COMISSAO-02** | — | **Nao existe segunda engine.** O CRM **nao calcula** comissao: `app_settings.g3_partner_rules` **carimba tier** no lead na criacao, via RPC. A verdade por lead e o campo `Comissionamento`, e quem transforma em R$ e so o financeiro. Uma verdade por lead. **Mas a investigacao expos um furo real na R20** — ver linha seguinte |
| **R20 lia o tier corrente** | — | **Furo achado em 26/07 pela resposta do dev.** A R20 chaveava a comissao por `originador.tipo`, que e a classificacao de **hoje**: captador promovido a senior faria **todo contrato antigo recalcular a 60%**. Vigencia nao cobre — ela versiona o percentual de um tier, nao o tier de uma pessoa. Corrigido: `contrato.originador_tipo_no_fechamento` congela no fechamento (`SPEC-001` R20-b, migration 5, teste) |
| Atribuicao de originador | — | `leads.partner_id`, **nunca** a tag `indicado_por` — ela e display e editavel, e ha 1 lead com tag sem `partner_id` (`SPEC-002` R16) |
| Schema `integracao` | — | **Nao criar.** Os aliases `vw_*` do PRD sao redundantes: consumir `financeiro.*` direto dispensa, e era o que a AUD-12 ja tinha decidido. O `PRD-v2.2` precisa perder a mencao |
| Senioridade no CRM | — | Aplicada em 25/07 (`+captacao_senior` 60%, `+vendedor_tipos`). **Nao valeu para nada ainda:** 0 leads com a opcao de 60%, e `vendedor_tipos` so carimba lead novo — nada retroativo |
| **F-02** | — | Funil `Parceiros` fica **fora** da base de comissao: `won` ali e "parceiro ativado", nao venda. 48 ganhos = 40 + 1 + 7 (`SPEC-002` R14) |
| Tabelas de backup | — | 50, movidas para schema `backup` pelo dev em 26/07: fora do PostgREST, fora do `search_path`, sem grants. Revisao em 26/10/2026 |
| "RLS sem policy nega tudo" | — | **Premissa corrigida pelo dev em 26/07.** Vale para acesso direto; **falso atraves de view** - a RLS das bases e avaliada contra o dono da view. Virou a invariante 13 da `SPEC-001`, com o furo reproduzido em teste |
| Tarifa | — | `1,13` é **tarifa em R$/kWh**, não fator de consumo. `numeric(12,6)`, não centavos (`SPEC-001` R22) |
| PgBouncer | — | **Conexão direta (5432), não pooler em modo *transaction*.** Deduzido do `ADR-0004`: processo Node de vida longa não precisa de pooler externo. Reverter a decisão reabre o `ADR-0003` (`SPEC-001` §3.2) |
| `CLAUDE.md` | — | Nunca existiu. `CLAUDE.md` v1.0 escrito em 24/07; 18 citações reapontadas |
| `ADR-0001` | — | **Nunca chegou ao repositório**, e a regra 2 do `CLAUDE.md` derivava dele. Escrito retroativamente em 25/07: não reconstrói o original perdido, registra a decisão que o corpus pressupõe, com proveniência por parte. Última citação órfã do corpus |
| Vazamento em `usuario_tenant` | — | A policy da migration 2 deixava qualquer sessão enumerar **a equipe de qualquer tenant** só apontando o contexto. Corrigido na migration 3: só vê a composição quem pertence |
| "bloqueio vermelho" | — | Taxonomia definida na §1 deste arquivo |
