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
| **F1** | **0** | 4 | 1 | **em execução** — as duas vermelhas fecharam em 26/07: F-02 na §9, F-03 por decisão normativa |
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
| MT-06 | 🟡 | Auth próprio ou SSO com o CRM? | Vinicius |
| MT-01 | 🟡 | Usuário pode pertencer a mais de um tenant? Custo de errar: uma constraint | Vinicius |
| MT-07 | 🟡 | Quem informa o `crm_tenant_id` ao ativar um conector, e como se valida | Vinicius |
| AUD-09 | 🟡 | CPF/CNPJ: CRM exige ou o financeiro coleta? | Vinicius |
| Q-SPEC001-03 | 🟢 | Endereço da UC: coleta local obrigatória ou opcional? | Vinicius |

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

## 9. Resolvidas

| ID | Era | Resolução |
|---|---|---|
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
