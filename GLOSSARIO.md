# GLOSSARIO.md — Linguagem do projeto

> Vocabulário único do Financeiro G3. Se um termo está aqui, é assim que ele se chama em spec, em código e em conversa.
> Nomes de domínio em português; código utilitário em inglês (`CLAUDE.md` regra 7).
> Atualizado em 23/07/2026 · **rev. 3** — absorve o P7 (topologia de funis) e o ADR-0002 r2. Mudaram `cliente`, `won`, `inadimplência`, `view de interface` e `upsert`; entraram `carteira`, `funil` e `valor de referência`.

---

## Termos que já causaram confusão

Estes quatro estão no topo porque cada um deles já produziu um mal-entendido real neste projeto.

### split de repasse
A distribuição do valor liquidado de uma fatura entre dono de usina, originadores e G3. É o motor central do sistema.

**Nunca escrever apenas "split".** A reforma tributária introduziu o *split payment* — recolhimento do tributo no momento do pagamento da transação. São conceitos diferentes com o mesmo apelido.

No código: `splitDeRepasse`, `split_execucao`, `split_item`. O tributário, se um dia entrar, é `splitPaymentTributario`.

O **percentual** desse repasse não é atributo da usina: vive em `regra_repasse`, versionado por vigência (`SPEC-001` R25). Escrever `usina.percentual_repasse` é citar uma coluna que não existe mais.

### geração nominal ≠ geração real
Duas fontes de geração convivem no CRM e produzem números diferentes.

| Termo | Origem | O que é |
|---|---|---|
| **geração nominal** | `usinas.geracao_kwh_mensal` | valor único cadastrado na usina; é o que o rateio do CRM usa para calcular crédito |
| **geração real** | `usina_geracao_mensal.geracao_kwh` | série mensal digitada por competência |

Faturar pela nominal é faturar uma projeção. Faturar pela real faz o painel do CRM e o financeiro discordarem. **Decisão pendente (Q-021).** Até lá, nenhuma spec assume uma das duas.

### cliente — e por que "venda ganha" não é "carteira"
Uma pessoa ou empresa espelhada de `leads` do CRM, com chave `crm_lead_id`. **Uma entidade só.** Sobre ela, três estados independentes e derivados:

| Estado | De onde vem | Hoje |
|---|---|---|
| **tem venda ganha** | `stage_type='won'` em funil de venda | 38 |
| **está na carteira** | participação no funil `Clientes ativos - Assinatura` | **0** |
| **tem rateio ativo** | `usina_clientes` | 36 |

Os conjuntos são disjuntos, e **não por acidente**: vendas fechadas e carteira vivem em funis diferentes, e nenhum lead do funil de carteira passou por etapa ganha. Não convergem sozinhos — a passagem venda → carteira foi desenhada e nunca ligada (P7, ADR-0002 r2).

**Não existe "cliente de venda" e "cliente de rateio" como entidades separadas.** Modelar dois congelaria no schema uma lacuna de processo.

### tenant do financeiro ≠ tenant do CRM
Dois espaços de identificadores distintos, ambos UUID, nenhum compartilhado.

| Termo | O que é |
|---|---|
| `tenant_id` | o id da empresa **no financeiro**. UUID próprio, gerado aqui |
| `crm_tenant_id` | o id da mesma empresa **no CRM**. Vive no `conector_crm`, é nullable |

As empresas atendidas pelos dois sistemas se sobrepõem **apenas em parte** — há tenant do financeiro que nunca existiu no CRM. Por isso a correspondência é um campo opcional, não uma chave comum.

Regra de escrita: nada que carregue identificador do CRM se chama `tenant_id`. Consulta ao CRM filtra por `crm_tenant_id`; consulta ao financeiro, por `tenant_id`. Ver ADR-0002 (r2) e PRD §4.1.

---

## Domínio Carteira

**carteira** — o conjunto de clientes que o financeiro fatura. Sai da **participação** no funil `Clientes ativos - Assinatura` do CRM (diretriz de 23/07/2026). Não deriva de "venda ganha" automaticamente: a automação que levaria os ganhos para lá ainda não existe. Hoje o funil está vazio e a carteira real (36 clientes com rateio) está no funil `Rateio` — migrá-la é a F-01.

**valor de referência** — a base mensal da fatura do cliente. Lido de `leads.consumo_reais` quando o cliente vem do CRM, originado no financeiro quando faltar. Nas populações medidas está 100% preenchido. `valor_venda` e `valor_investimento` do CRM são 100% nulos e estão **mortos por desenho**: `funnels.valor_mode = 'consumo_solar'` faz o CRM derivar o valor exibido a partir do consumo, então ninguém preenche aquelas colunas. Nunca construir cima delas.

**fatura** — cobrança de uma UC numa competência. Componentes separados em centavos: `valor_consumo`, `valor_tarifas_concessionaria`, `valor_juros_multa`.

**fatura cheia** (`flag_fatura_cheia`) — fatura de mês completo, sem pro-rata nem acordo. Só ela avança o contador de escalonamento de comissão e só ela gera comissão.

**competência** — mês de referência, formato `YYYY-MM`, sempre em America/Sao_Paulo. No CRM aparece como `ano_mes`, tipo `date` no dia 1º do mês.

**liquidação** — o evento de pagamento de uma fatura. Único gatilho do split. Vem por webhook Sicoob ou por baixa na conciliação. Nunca ocorre na emissão.

**boleto** — 1:1 com a fatura. Na G3 é **híbrido**: mesma cobrança paga por código de barras ou QR Code Pix, à escolha do cliente. As duas formas creditam em datas diferentes.

**repasse** — a parte do dono da usina. Percentual da usina sobre `valor_consumo` mais juros e multa proporcionais. Tarifa da concessionária fica fora da base.

**comissão** — a parte do originador. Incide **só** sobre `valor_consumo`, sem juros, multa ou tarifas.

**líquido G3** — o que resta após repasse, comissões e tarifas. Absorve toda diferença de arredondamento do split.

**inadimplência** — visão derivada de faturas vencidas mais o registro de tratativas. **Produzida aqui.** O funil de clientes ativos do CRM tem uma etapa INADIMPLENTES, e ela **não é fonte**: lê-la seria ler a própria saída do financeiro, com atraso e sem garantia de manutenção. Se essa etapa precisar refletir a realidade, é write-back, e write-back colide com o PRD §7.8 (`CLAUDE.md` regra 4) — ver F-03.

---

## Domínio Corporativo

**conta a pagar / conta a receber** — obrigação com beneficiário, competência, vencimento e valor.

**conta a pagar nascida de split** — tem `origem_split_item_id` obrigatório e é **imutável em valor e beneficiário**. Registra a despesa **bruta**. Se houver retenção no pagamento, ela é evento posterior, não alteração desta conta.

**movimento de caixa** — o livro-razão. Toda entrada e saída real, com data, conta bancária e vínculo de origem.

**categoria** e **centro de custo** — plano gerencial que estrutura o DRE.

**conciliação** — batimento entre extrato bancário e lançamentos do sistema. Extrato vem por API Sicoob ou import OFX.

---

## Domínio Energia

**rateio** — a divisão do crédito gerado por uma usina entre suas UCs. **É sempre em kWh e percentual, nunca em reais.** O CRM é o system-of-record: só ele valida o teto de 100% e o teto de kWh alocável.

**percentual de rateio** (`percentual_rateio`) — fatia da geração destinada a uma UC. Hoje, em 2 das 3 usinas, a soma não fecha 100% (91,2% e 99,78%).

**crédito** — energia compensada, em kWh. `percentual_rateio ÷ 100 × geração`.

**percentual de repasse** (`regra_repasse.percentual`) — fatia do valor liquidado que vai ao dono da usina. **Versionado por vigência e por usina**, nunca coluna na `usina`: o valor que importa é o vigente na **competência**, não o de hoje. Cada dono negocia o seu; 70% é o mais comum, não uma constante.

**distribuidora** — concessionária, hoje só Equatorial Goiás. É **tabela de referência** com FK a partir de `tarifa`, `usina` e `unidade_consumidora`, não texto livre: `'Equatorial'` e `'Equatorial GO'` digitados em UCs diferentes seriam duas concessionárias, e a segunda não tem tarifa.

**teto alocável** — geração menos margem de segurança (padrão 5%, configurável em `rateio_margem_seguranca_pct`). O CRM impede vincular UC que estoure esse teto **no momento do vínculo**; depois disso, estouro é detectado, não prevenido.

**lista de rateio** — documento enviado periodicamente à distribuidora informando o percentual de cada UC. Hoje montado e enviado à mão por uma pessoa. Tem prazo de corte no mês.

**UC / unidade consumidora** — o ponto de consumo na distribuidora. **É entidade própria do financeiro.** No CRM não tem tabela: vive dentro de `usina_clientes` e não tem status.

**usina** — a geradora. Espelhada do CRM em identidade e dados técnicos; `dono_usina_id` e `percentual_repasse` são exclusivos do financeiro.

**dono de usina** — quem recebe o repasse. **Cadastro exclusivo do financeiro.** No CRM, `usinas.dono_lead_id` existe e está 100% vazio.

**Fio B** — parcela da tarifa de distribuição que o consumidor de geração distribuída paga. Cresce por cronograma legal: 60% em 2026, 75% em 2027, 90% em 2028, integral a partir de 2029. Todas as usinas da G3 estão nesse regime.

**parecer de acesso** — documento da distribuidora aprovando a conexão da usina. A data dele define o regime de Fio B.

**distribuidora** — a concessionária. Na G3, Equatorial. Não tem API pública; os dados entram por digitação manual.

---

## Originadores e comissão

**originador** — quem recebe comissão pela venda. Quatro tipos no financeiro: `vendedor_g3`, `parceiro_indicador`, `parceiro_captador`, `parceiro_captador_senior`. Pode ser PF ou PJ.

**Não confundir com `partner` do CRM.** Lá a comissão aparece em três lugares que não concordam entre si: `app_settings.g3_partner_rules` tem dois tiers flat (`captacao` 50%, `indicacao` 25%); o custom field `Comissionamento` cobre 335 leads, mas 303 com o valor `PADRAO` — o sinal real são 32, em `25%`, `50%` e um **`30%` que nenhuma regra documenta**; e `partner_id` está em 3% dos leads.

**Vendedor interno existe no CRM** — custom field `Nome do vendedor`, texto livre, 286 leads. A auditoria registrou que não existia. É semente de conciliação, nunca chave: texto livre não tem integridade referencial. **Senioridade** continua sem lugar no CRM (AUD-06).

**escalonamento** — a comissão se distribui entre a 1ª e a 2ª fatura cheia paga do contrato. Da 3ª em diante, comissão zero. O contador vive no contrato.

**contador de faturas cheias** — quantas faturas cheias do contrato já foram pagas. Só avança com `flag_fatura_cheia = true` e status pago.

**regra de split versionada** — nunca editada no lugar. Cada mudança cria versão nova com vigência, por tenant. Todo split registra qual versão usou.

---

## Plataforma e integração

**tenant** — uma empresa dentro do sistema financeiro. **UUID próprio**, gerado aqui, sem relação com o do CRM. Razão social, CNPJ, status, data de ativação.

**`crm_tenant_id`** — o UUID da mesma empresa no CRM. Mora no `conector_crm`, é nullable e só existe para tenant que também usa o intreply. É o **único ponto de tradução** entre os dois sistemas. No CRM, G3 Solar é `d4640f4b-f833-4a80-a4db-ccced1956ae4` — esse valor é do CRM, nunca do financeiro.

**auditoria** (`auditoria`) — imagem de linha **antes e depois** de toda escrita de negócio ou de papel, gravada pelo gatilho `app.auditar()` na própria escrita. Implementa a regra 9 do `CLAUDE.md`. Não confundir com **trilha de acesso**.

**trilha de acesso** (`acesso_plataforma_log`) — registro de que um tier de plataforma **entrou** num tenant, com ação e recurso declarados pela aplicação. Responde *por que olhou*; a auditoria responde *o que mudou*. As duas são append-only por privilégio, não por convenção.

**`auditor_financeiro`** — role dona da `auditoria` e das duas funções `SECURITY DEFINER` que a escrevem e a conferem. Existe para que append-only valha sob `FORCE ROW LEVEL SECURITY` sem depender de `BYPASSRLS`. Não é role de aplicação e não faz login.

**funil** — pipeline do CRM. A G3 tem cinco, e eles **não são intercambiáveis**:

| Funil | Papel | Etapa `won` |
|---|---|--:|
| Vendas - Assinatura | venda de assinatura de crédito | 38 |
| Vendas - Integração | obra de integração — outro negócio (F-05) | 1 |
| Parceiros | onboarding de parceiro, **não é venda** | 7 |
| Rateio | operação de vínculo de UC; onde a carteira está hoje | 0 |
| Clientes ativos - Assinatura | ciclo de vida: ATIVOS · INADIMPLENTES · CANCELADOS | — |

**nível plataforma × nível tenant** — dois planos de permissão. Plataforma administra tenants; tenant administra suas próprias finanças. Um papel de plataforma não lê dado financeiro de tenant sem trilha de auditoria.

**conector CRM** — o componente que lê o intreply. **Opcional por tenant, um por tenant, desligado por padrão** — mesma forma do módulo fiscal. Read-only absoluto, via role `financeiro_ro`, lendo **só views de interface**, nunca tabelas base. Guarda o `crm_tenant_id`, o tipo, a referência da credencial (nunca a credencial) e o status da última execução. Lê **participação** em funil, nunca a etapa como fonte de estado financeiro. Tenant sem conector opera com cadastro inteiramente local.

**view de interface** — view no schema `financeiro` do CRM, owned por `postgres`, que expõe um recorte estável. Existe porque as tabelas base têm RLS por `auth.uid()` e devolvem zero linhas para uma role de serviço. Hoje **todas carregam o UUID do tenant como literal no corpo**: a camada é mono-tenant na prática, e um segundo tenant exige view nova, não configuração (MT-08).

**full-scan** — a estratégia de sincronização adotada: ler o conjunto inteiro a cada ciclo, em vez de buscar só o que mudou. Escolhida porque `updated_at` não é confiável nas tabelas de usina e porque o volume é ínfimo.

**upsert** — inserir ou atualizar pela chave do CRM. A chave é sempre o `id` uuid da origem — nunca `codigo`, nunca telefone, nunca nome. As views `rateio_clientes` e `usinas` **não expõem esses uuid hoje**; a correção está proposta no `VIEWS-PROPOSTAS.sql` r2 e é pré-requisito da SPEC-002.

**reconciliação de conjunto** — comparar o conjunto de ids do CRM com o do espelho para detectar exclusões. Necessária porque o CRM usa hard delete sem log garantido.

**won** — venda fechada **dentro de um funil de venda**: `funnel_stages.stage_type = 'won'` com o funil restrito. O `stage_type` sozinho não serve: os 46 medidos na auditoria incluem 7 do funil Parceiros, que é onboarding. **Não é critério de carteira** — ver `carteira`. E **nunca usar `leads.status`**, que mede 6 onde `stage_type='won'` mede 46, dos quais 38 são venda de assinatura.

---

## Fiscal

**documento fiscal** — entidade do financeiro, com módulo de emissão **plugável e desligado para a G3** (ver QUESTOES Q-002). Existe para outros tenants.

**DPS** — Declaração de Prestação de Serviços, o documento que substituiu o RPS no fluxo de emissão da NFS-e de padrão nacional.

**IBS / CBS** — os tributos da reforma. Não se aplicam à emissão da G3 (que não emite), mas chegam destacados nos documentos de fornecedores e precisam de campo no módulo de compras.

**retenção** — INSS e IRRF descontados no pagamento a beneficiário PF. Reduz o valor que sai da conta, **não** o valor da despesa registrada pelo split.

---

## Convenções de escrita

**dinheiro** — `Int` em centavos, sempre. Nunca float, nunca decimal em runtime. Formatação em reais só na borda da UI. O CRM usa `numeric` sem escala em alguns campos: converter com `round(valor * 100)`.

**kWh e percentual não são dinheiro** — mantêm escala decimal e não passam pela conversão para centavos.

**datas** — America/Sao_Paulo em toda lógica de competência, vencimento e corte. O CRM já usa `timestamptz` no núcleo, então a normalização é de apresentação.
