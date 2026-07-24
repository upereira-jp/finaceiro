# ADR-0002 — Modelo de tenant e de cliente, pós-auditoria do CRM

| Campo | Valor |
|---|---|
| **Status** | Decisão 1 **aceita** · Decisão 2 aceita quanto ao schema; a definição dos estados aguarda F-01 a F-04 |
| **Data** | 23/07/2026 |
| **Decisor** | Vinicius Leal |
| **Revisa** | ADR-0001 (seções de schema e RBAC) |
| **Base factual** | Auditoria intreply de 23/07/2026, relatórios P0–P6 · **P7 — topologia de funis** |
| **Afeta** | PRD §2, §3, §4.1, §7 · schema da F1 · SPEC-CADASTROS · SPEC-CONECTOR-CRM |

| Revisão | Data | O que mudou |
|---|---|---|
| Original | 23/07/2026 | Decisão 1 propunha reusar os UUIDs de tenant do CRM. Decisão 2 explicava a disjunção de populações como artefato de backfill |
| **r2** | **23/07/2026** | **Decisão 1 invertida — tenant com UUID próprio e mapeamento opcional — e aceita. Decisão 2: premissa corrigida pelo P7, a disjunção é estrutural e não converge. Cláusula de revisão por convergência removida** |

---

## Contexto

O ADR-0001 decidiu multi-tenancy assumindo que o sistema financeiro inauguraria o padrão. A auditoria mostrou que ele já existe, em produção, no CRM da mesma casa. E revelou um fato sobre a base de clientes que muda a modelagem central.

**Duas premissas caíram entre a versão original e esta.**

A primeira: o financeiro não é um segundo produto da mesma plataforma. É um sistema separado, e os conjuntos de empresas atendidas pelos dois se **sobrepõem apenas em parte** — haverá tenant do financeiro que nunca existiu no CRM, e tenant do CRM que nunca usará o financeiro. Identificador compartilhado só se sustentaria se um conjunto contivesse o outro.

A segunda: a disjunção entre vendas ganhas e clientes com rateio não era artefato de backfill prestes a se resolver sozinho. O P7 mediu a topologia de funis e encontrou uma causa estrutural, que não se resolve com o tempo. A Decisão 2 mantém a conclusão e troca a explicação.

---

## Decisão 1 — Tenant com UUID próprio, mapeado opcionalmente para o CRM

### O que a auditoria encontrou

O intreply não é "o CRM da G3". É um Postgres único servindo três empresas:

| Tenant | `tenant_id` **no CRM** |
|---|---|
| G3 Solar | `d4640f4b-f833-4a80-a4db-ccced1956ae4` |
| Sonari | `8547828a-c3b8-4ea9-95e5-289d3941f520` |
| HausGo | `d2c3bfb4-34dc-49a5-9037-ae897202c120` |

Com: `tenant_id` em 109 tabelas · RLS habilitada nas 151 de `public` · tabela `tenants` · tabela `plans` com `preco_mensal_centavos` (inteiro em centavos, mesma convenção do nosso PRD) · `platform_admins` com tier (`proprietario`, `administrador`) · `tenant_users` com papéis (`diretoria`, `gerencia`, `usuario`, `terceirizado`) · `tenant_rbac_settings` por tenant.

### Decisão

O financeiro tem **tabela `tenant` própria, com UUIDs próprios**. Nenhum identificador de empresa é compartilhado com o CRM.

Onde a mesma empresa existir dos dois lados, a correspondência é **explícita e opcional**, e mora no conector — não na identidade:

- `conector_crm` é opcional, um por tenant, e carrega o `crm_tenant_id` (o UUID daquela empresa no CRM), o tipo, a referência da credencial e o status da última execução (PRD §4.1)
- Tenant sem conector é caso normal, não exceção: opera com cadastro inteiramente local
- Desligar ou remover o conector não afeta a identidade do tenant nem os dados já espelhados

Do CRM o financeiro herda a **estrutura** — `tenant_id` em toda entidade de negócio, RLS por tenant, dois níveis de permissão, dinheiro em centavos. Não herda a **identidade**.

### Consequências

**O conector traduz, sempre.** Toda consulta ao CRM filtra por `crm_tenant_id`, nunca pelo `tenant_id` do financeiro. Os dois são UUID, e trocar um pelo outro não falha em tempo de compilação: falha em silêncio, devolvendo zero linhas no melhor caso e dados de outra empresa no pior. Mitigações, todas obrigatórias:

- Nenhuma variável, parâmetro ou coluna que carregue identificador do CRM se chama `tenant_id`. O nome é sempre `crm_tenant_id`
- Tipos nominais distintos no TypeScript (`TenantId` e `CrmTenantId`), para que a troca vire erro de compilação em vez de bug de produção
- O filtro por `crm_tenant_id` é invariante com teste automatizado, como o PRD §7.3 já exige

**A camada de interface do CRM é hoje mono-tenant.** A `financeiro.vendas_ganhas`, lida em 23/07/2026, traz o UUID da G3 escrito como literal em três pontos do corpo da view — no filtro de `leads`, no de `funnels` e na subconsulta de custom field. O `crm_tenant_id` no conector é necessário e **não é suficiente**: enquanto as views do lado do CRM forem literais, um segundo tenant exige view nova, não configuração. Registrado como risco; a parametrização é trabalho do dev do CRM, não do financeiro.

**A criação de tenant é local.** Sem chave compartilhada, "sincronizar tenants a partir do CRM" deixa de existir como operação. Um tenant nasce aqui por cadastro administrativo; se aquela empresa também usa o intreply, alguém informa o `crm_tenant_id` ao configurar o conector.

**O que se perdeu, e por que compensa.** Perdeu-se a conveniência de um id só. Ganhou-se poder atender empresa que não existe no CRM — que é o caso real, não hipótese. Ao volume de tenants previsto, o custo da tradução é um campo e uma disciplina de nomenclatura.

### RBAC em dois níveis — vocabulários distintos, estrutura idêntica

O CRM usa `platform_admin_tier` + `tenant_user_role`. O PRD usa `admin`/`financeiro`/`cobranca`/`leitura`. São vocabulários diferentes para a mesma estrutura de dois níveis.

**Decisão:** o nível de **tenant** mantém o vocabulário do PRD — são funções financeiras (quem aprova pagamento, quem negocia inadimplência), não funções de CRM. O nível de **plataforma** espelha o conceito de `platform_admins`: quem administra tenants não acessa dado financeiro de tenant sem trilha de auditoria.

Como na Decisão 1: a estrutura é análoga, os dados não. Usuários, papéis e vínculos são inteiramente do financeiro — o sistema não lê `tenant_users` nem `platform_admins` do CRM. Se os dois logins virarem atrito real, a saída é SSO, não tabela compartilhada (MT-06).

### Lição de RLS que o ADR-0001 não tinha

No CRM, as policies avaliam `auth.uid()`. Uma role de serviço sem contexto de usuário lê **zero linhas** de qualquer tabela base — foi exatamente o que travou o P1/P2 da auditoria. Por isso existem as views `financeiro.*`, owned por `postgres`, que enxergam tudo pelo privilégio do dono.

Isso é evidência direta a favor do spike do ADR-0001: a interação entre pool de conexões, role de serviço e RLS é onde o desenho quebra na prática, e quebrou aqui. O spike deixa de ser precaução e passa a ser replicação de um problema já observado.

### Padrão de conector validado em produção

O CRM já opera schema de interface + role read-only dedicada: schema `reporting` (9 views) servido pela role `reporting_ai`, que alimenta um processo externo. É o mesmo desenho proposto para `financeiro_ro`. Não é hipótese — funciona lá há tempo.

### O que do ADR-0001 permanece

`tenant_id` em toda entidade desde a primeira migration · RLS com `FORCE ROW LEVEL SECURITY` · índices únicos compostos com `tenant_id` · `regra_split` versionada por tenant · segredos por tenant em armazenamento cifrado · construir tenant-ready sem a superfície comercial de SaaS.

---

## Decisão 2 — `cliente` espelha `leads`, não "venda ganha" nem "rateio"

### O que a auditoria encontrou

| Conjunto | Tamanho | Interseção |
|---|--:|---|
| Leads com `stage_type='won'` | 46 | — |
| Clientes em `usina_clientes` | 36 | **0** |
| Usinas com `dono_lead_id` preenchido | 0 de 3 | — |

O relatório concluiu que são entidades distintas e recomendou modelá-las separadamente.

### Por que os conjuntos são disjuntos

**Os dois conjuntos são linhas da mesma tabela.** `usina_clientes.lead_id` referencia `leads.id`; `vendas_ganhas.lead_id` referencia `leads.id`. Não são tipos diferentes de coisa — são o mesmo tipo em estados diferentes.

A versão original deste ADR atribuiu a disjunção a backfill: o módulo de rateio teria três semanas e teria sido carregado com a carteira existente, enquanto o funil registrava vendas novas em paralelo. A previsão era de convergência em poucas competências.

**O P7 mediu e a explicação não se sustenta.** A causa é estrutural:

- As vendas ganhas vivem no funil **Vendas - Assinatura** (38 em etapa `won`); a carteira vive no funil **Rateio** (38 leads), e a interseção entre os dois é zero
- **Nenhum lead do funil Rateio ocupa etapa `won`.** O funil tem etapa terminal ganha — "Desconto Ativo" — e ela está vazia
- Os 36 de `usina_clientes` estão **todos** dentro do funil Rateio: contenção exata, mais 2 ainda sem vínculo
- Existe um funil **Clientes ativos - Assinatura**, criado no mesmo dia do funil Rateio, com as etapas ATIVOS · INADIMPLENTES · CANCELADOS. Está **vazio**, e nenhuma automação está configurada em funil algum

Não há mecanismo que faça as populações convergirem. A passagem venda → carteira foi desenhada e nunca operacionalizada; o funil vazio é a assinatura disso.

Isso **reforça** a conclusão original em vez de enfraquecê-la. Modelar duas entidades congelaria no schema uma lacuna de processo — e obrigaria a um merge no dia em que a automação for ligada e os dois caminhos passarem a produzir a mesma pessoa.

### Decisão

O `cliente` do financeiro tem chave `crm_lead_id` e espelha `leads`, independentemente do caminho de entrada. Sobre ele, estados **independentes e derivados**, nenhum deles parte da identidade:

| Estado | Origem | Situação |
|---|---|---|
| `em_carteira` | participação no funil **Clientes ativos - Assinatura** | diretriz de 23/07/2026. **Bloqueado por F-01 e F-04** |
| `tem_venda_ganha` | `financeiro.vendas_ganhas`, dedup por `lead_id` | **Bloqueado por F-02** — a view não filtra funil e hoje inclui 7 parceiros |
| `tem_rateio_ativo` | `financeiro.rateio_clientes` | vigente |

As combinações são todas válidas e nenhuma é erro de dados. A disjunção vira **relatório operacional**, não decisão de schema:

- *Clientes com rateio e sem venda registrada* (hoje: 36) — a carteira que entrou por fora do funil
- *Vendas ganhas sem carteira ativa* (hoje: 38, descontados os parceiros) — vendido e nunca ativado

Esses dois painéis entregam valor no primeiro dia e transformam um problema invisível de processo em fila de trabalho.

### O CRM diz quem é cliente; o financeiro diz como o cliente está

O funil de destino tem uma etapa INADIMPLENTES. O estado de inadimplência é **produzido pelo financeiro** — é ele que emite, concilia e envelhece a fatura. Ler essa etapa do CRM seria ler de volta a própria saída, com atraso e sem garantia de que alguém a manteve.

**Decisão:** o conector lê **participação** no funil, nunca a etapa como fonte de estado financeiro. Se a etapa precisar refletir a realidade no CRM, isso é write-back — e write-back colide com a regra 6 do CLAUDE.md, que torna o CRM read-only absoluto. Enquanto F-03 não for resolvida, o financeiro não lê nem escreve etapa.

### Consequências para o schema

- `cliente.crm_lead_id` é único **por tenant**: `UNIQUE (tenant_id, crm_lead_id)`
- Dedup obrigatório na leitura de `vendas_ganhas` — a view devolve N linhas para um lead ganho em N funis. Agregar por `lead_id`, nunca assumir uma linha por cliente
- `unidade_consumidora` é entidade própria do financeiro. No CRM ela não existe como tabela — vive dentro de `usina_clientes` (`uc`, `percentual_rateio`, `data_cadastro`, `data_vencimento`) e não tem status
- Nunca usar `leads.status` para conversão. O critério é `stage_type='won'` **dentro de um funil de venda** — a divergência medida foi 6 contra 46, e os 46 ainda incluem 7 parceiros
- Posição de etapa não sustenta gatilho de faturamento: o funil Rateio tem 38 leads e a etapa terminal vazia

---

## Riscos aceitos

**Troca de identificador entre os dois sistemas.** `tenant_id` e `crm_tenant_id` são ambos UUID, e confundi-los não quebra nada de forma visível. Aceito porque a alternativa — id compartilhado — impede atender empresa que não está no CRM. Mitigado por nomenclatura, tipos nominais e teste de invariante no filtro do conector.

**Views de interface com tenant literal.** Enquanto o lado do CRM não parametrizar, o conector só serve a G3 na prática. Aceito para a F1, que tem um tenant só. Vira bloqueio no dia do segundo tenant com CRM.

**Herança da lacuna de processo.** O financeiro não conserta o fluxo do CRM; ele torna a lacuna visível e mensurável. Se a automação venda → carteira não for construída, alguém reconcilia à mão — mas com uma lista concreta, não com uma suspeita.

**Hard delete sem rastro.** O núcleo do CRM não tem soft delete nem log garantido de exclusão. O conector reconcilia por diferença de conjunto de `id`. Ao volume atual (334 leads, 36 rateios, 3 usinas) isso custa segundos; revisitar se a base crescer uma ordem de grandeza.

**`updated_at` não confiável nas tabelas de usina.** Sem trigger de banco, backfills e SQL administrativo não atualizam o campo. Decisão: **full-scan de todo o núcleo a cada ciclo**, não sincronização incremental. Mais simples e imune ao furo.

---

## Questões que esta decisão abre ou herda

| ID | Pergunta | Bloqueia |
|---|---|---|
| MT-06 | O financeiro usa Supabase Auth próprio (PRD §2) ou compartilha o do CRM? Se os usuários são as mesmas pessoas, dois logins são atrito real. Com tenant próprio, a saída é SSO, não tabela comum | SPEC-RBAC, F1 |
| MT-07 | *Reformulada na r2.* A criação do tenant é necessariamente local — não há mais chave para sincronizar. O que resta: quem informa o `crm_tenant_id` ao ativar um conector, e como se valida que ele aponta para a empresa certa. UUID errado devolve dados de outra empresa sem erro nenhum | SPEC-CONECTOR-CRM |
| MT-08 | *Nova na r2.* Quem parametriza as views `financeiro.*` para deixarem de conter o tenant literal, e quando | segundo tenant com CRM |
| F-01 a F-05 | Ver P7 §5 — migração da carteira legada, lista de funis de conversão, dono da etapa INADIMPLENTES, participação vs. etapa, escopo da integração | SPEC-CONECTOR-CRM, F2 |
| Q-021 | Faturar pela geração **nominal** (`usinas.geracao_kwh_mensal`, que o rateio do CRM usa) ou pela **série real** (`usina_geracao_mensal`)? | **fórmula de faturamento inteira** |
| Q-022 | Com `partner_id` preenchido em 3% dos leads, como o contrato é atribuído ao originador? A `vendas_ganhas` expõe um custom field `Comissionamento` ainda não medido — pode ser o portador real | motor de comissão, F3 |

---

## Revisão

A cláusula original — reavaliar se as populações não convergissem em três competências — foi **removida na r2**. Ela aguardava um evento sem mecanismo que o produzisse.

No lugar: reavaliar a Decisão 2 se a automação venda → carteira for construída e, três competências depois, `em_carteira` e `tem_venda_ganha` ainda divergirem de forma que exija tratamento manual recorrente. Aí a lacuna deixaria de ser de processo e passaria a ser de modelo.
