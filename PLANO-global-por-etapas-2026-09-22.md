# PLANO GLOBAL — o Financeiro G3 por etapas, do mês que ainda não rodou à empresa que escala

| Campo | Valor |
|---|---|
| **Para quem** | O dono, para amadurecer a ideia com calma; depois, o analista financeiro |
| **O que é** | O mapa inteiro, em etapas, dos dois funis e da plataforma por baixo deles. **Não é ordem de construção nem compromisso de prazo** — é o desenho para decidir sobre. Onde um módulo já tem plano próprio, este aponta e não repete |
| **Data** | 22/09/2026 |
| **Onde estamos** | Rateio inteiro construído e medido em produção, com **zero faturas emitidas**; Empresa com quatro telas (Contas a receber entrou hoje); dois funis na barra desde o deploy das 03:01 |
| **Planos filhos** | `REVISAO-dois-funis-2026-09-22.md` (o que existe, item por item) · `PLANO-financeiro-empresa-2026-09-22.md` (as quatro ondas da Empresa, com modelo de dados) |

---

## 0. A visão em um parágrafo

**Um sistema, dois funis, uma disciplina.** O **Rateio** transforma energia gerada em dinheiro que entra: usina → unidade → contrato → conta lida → fatura → boleto → baixa → divisão. A **Empresa** transforma esse dinheiro, mais o que a G3 gasta, em caixa que fecha: a receber → a pagar → cartões → pessoas → banco → DRE. A **plataforma** por baixo garante que isso continue verdade com 30 unidades ou com 3.000: isolamento por tenant, dinheiro em centavos, trilha de tudo, teste de todo invariante, backup, alerta.

**A regra que ordena as etapas:** primeiro o que faz o mês rodar de verdade, depois o que faz o mês rodar sem gente, depois o que faz a empresa se enxergar, depois o que faz tudo isso aguentar escala. Cada etapa tem um **critério de saída** medível, como o PRD §10 faz — e nenhuma etapa fecha por opinião.

---

## 1. O mapa

| Etapa | Nome | A pergunta que fecha | Critério de saída | Depende de você |
|:-:|---|---|---|---|
| **0** | **O mês roda** | *Uma competência inteira sai deste sistema, e bate com o controle manual?* | duas competências faturadas, cobradas e recebidas aqui, com divergência **zero ao centavo** contra a planilha (o «piloto sombra» do PRD §10) | 3 atos de operação (§2) |
| **1** | **Rateio sem gente** | *O mês roda sem alguém lembrar de cada passo?* | régua de cobrança automática, inadimplência com tratativa registrada, projeção de recebíveis, tarifa mínima controlada; a Pendências do Rateio acusa TUDO o que trava o mês | 4 referências (§3) |
| **2** | **Empresa — o chão** | *Quanto temos, e para onde vai o dinheiro?* | saldo por conta bancária bate com o banco no fim do mês; toda conta a pagar tem categoria; recorrentes nascem sozinhas | plano de contas, lista de bancos |
| **3** | **Empresa — gastos e pessoas** | *Onde gastamos, com quem, e quanto custa a equipe?* | fatura de cartão concilia com o extrato do cartão; folha importada vira contas a pagar e aparece no DRE (critérios da F5 do PRD) | lista de cartões, regime e folha das pessoas |
| **4** | **Empresa — controle** | *Bate com o banco? Deu lucro? Vai faltar caixa?* | conciliação bate o extrato real; DRE fecha ao centavo (F4 do PRD); caixa projetado a 90 dias com alerta; conta acima da alçada exige aprovação | extrato real, alçada, formato do contador |
| **5** | **Escala e plataforma** | *Aguenta 100× a carteira, dois analistas e um segundo tenant?* | listas paginadas no servidor; log de requisição; backup declarado e restaurado num ensaio; alerta chega no celular; segundo tenant isolado por teste | decisões de infraestrutura (§7) |
| **6** | **Além** (F6/F7 do PRD) | *O cliente se serve sozinho? O banco paga sozinho?* | portal do cliente com 2ª via e histórico; pagamento em lote pela API; fiscal plugável ligado se um tenant precisar | contratos com terceiros |

**Etapas 2, 3 e 4 são as ondas 1, 2+3 e 4 do `PLANO-financeiro-empresa`** — o modelo de dados, as telas e o tamanho de cada peça estão lá. Aqui elas entram só como posição no mapa.

**Ordem não é fila rígida.** A etapa 0 é operação e pode correr em paralelo com qualquer outra; a 5 é contínua (cada etapa deixa um pedaço dela); a 1 e a 2 são independentes entre si e podem trocar de lugar conforme o que você responder primeiro.

---

## 2. Etapa 0 — o mês roda (operação, quase nada de código)

**Por que é a primeira, mesmo sem ser código:** tudo o que está desenhado foi medido com fixture e suíte, não com carteira viva. A primeira competência real é o teste que nenhuma suíte substitui — e as decisões que faltam na Empresa (agrupar repasse, plano de contas) se tomam melhor olhando o primeiro lote de verdade (`Q-CORPORATIVO-01`, razão 2).

| # | O ato | Quem | Estado em 22/09 |
|:-:|---|---|---|
| 1 | Rodar o `--valendo` dos **9 endereços** já extraídos e conferidos (`/opt/financeiro/enderecos-2026-09-21.csv`) | você | pronto para rodar desde 21/09 |
| 2 | Cadastrar os **donos das usinas** (quem recebe o repasse) e a **geração** das usinas do mês | você / operação | `dono_usina` vazia desde sempre — é a parede que trava a divisão do dinheiro |
| 3 | Ler as **29 contas** da competência na Fatura unificada, gerar, emitir, pedir boleto — o roteiro do mês na tela de Pendências | operação | zero faturas até hoje |
| 4 | **Piloto sombra**: duas competências em paralelo ao controle manual, comparando ao centavo | você + operação | não iniciado |
| 5 | O CRM voltar a sincronizar (o *overenergy* da usina, que você disse mitigar em 24 h) | dev do CRM | ciclo morrendo desde 16/09 |

**O que eu faço nesta etapa:** acompanho a primeira competência tela a tela, corrijo o que a carteira real mostrar, e registro cada divergência. É a etapa em que mais se aprende por real gasto.

---

## 3. Etapa 1 — Rateio sem gente

O funil 1 está construído; o que falta é o que faz ele **rodar sem alguém lembrar**. Quatro peças, e três dependem de referência sua (pedidas em `REVISAO-dois-funis` §5).

| Peça | O que é | Depende de | Tam. |
|---|---|---|:-:|
| **Régua de cobrança** | aviso D−3, lembrete D+1 e D+7 com 2ª via, por e-mail/WhatsApp; a fila da agenda já existe | a régua que a G3 pratica (`Q-INADIMPLENCIA-01`) | G |
| **Tratativas de inadimplência** | registrar contato, canal, resultado, próxima ação, dentro de Contas a receber; a Pendências acusa título vencido sem tratativa | a mesma régua | M |
| **Projeção de recebíveis** | por vencimento (caixa) e/ou por competência futura (contratos × geração × tarifa) | **o áudio** (`Q-PROJECAO-01`) | M |
| **Tarifas mínimas da Equatorial** | custo de disponibilidade por unidade × competência: devido, pago, comprovado; camada na Pendências | conta real + quem paga + onde é controlado (`Q-TARIFA-MINIMA-01`) | M |
| **Encerramentos do Rateio** | decidir o destino do motor aposentado (`Q-CICLO-02`, aval fiscal) e fechar o aviso do `pg` da tela Contas a pagar | aval do contador · medição | P |

**Critério de saída:** um mês inteiro em que ninguém precisou abrir uma tela para o dinheiro entrar — só para conferir.

---

## 4. Etapas 2, 3 e 4 — a Empresa (resumo; o detalhe está no plano dela)

| Etapa | Onda do plano da Empresa | Entra | Sai da barra da Empresa |
|:-:|:-:|---|---|
| **2** | 1 — o chão | plano de contas com tela · contas bancárias e saldo · Caixa realizado · despesas recorrentes · Pendências da empresa | `Pendências da empresa · Contas a receber · Contas a pagar · Caixa ‖ Cadastros · Conector Sicoob · Histórico` |
| **3** | 2 e 3 — gastos e pessoas | fornecedores e compras com comprovante · **cartões** (lançamentos, parcelas, fatura, conciliação do cartão) · **funcionários e folha importada**, encargos, reembolsos, permissão própria para salário | `+ Cartões · Pessoas` (nove telas, espelho do Rateio) |
| **4** | 4 — controle | conciliação bancária por extrato (API depois) · **DRE gerencial** · fluxo de caixa projetado · fila de aprovação com alçada · calendário de impostos · pacote mensal para o contador | abas novas em Caixa (Conciliação, Resultado, Projeção) |

**Os quatro princípios da Empresa** (de `PLANO-financeiro-empresa` §0), que valem para as três etapas: `conta_pagar` é a unidade de tudo o que sai · competência ≠ caixa · nada duplica o que o split provisiona · dado de pessoa é sensível.

---

## 5. Etapa 5 — escala e plataforma (contínua)

O que uma empresa que *"vai escalar rapidamente"* precisa e que **hoje não existe** — medido, não suposto:

| Peça | Hoje | Para onde vai | Tam. |
|---|---|---|:-:|
| **Paginação e busca no servidor** | listas pedem `limite=500`; Contas a receber tem teto 500 e diz quando trunca | toda lista que cresce com a carteira (unidades, faturas, títulos, lançamentos, trilha) paginada e filtrada no servidor; índices já parcialmente prontos | M |
| **Log de requisição** | a aplicação não loga request; o nginx é a única fonte | log estruturado por requisição (rota, tenant, papel, duração, status) — é o que responde «o que a tela fez» sem `grep` no nginx | P |
| **Backup declarado e ensaiado** | **não há backup declarado** (`Q-BACKUP-01`) — só o que o Supabase faz por padrão | política escrita (frequência, retenção, quem restaura), e um **ensaio de restauração** por trimestre; sem ensaio, backup é esperança | P (decisão) + M |
| **Alerta que chega** | `financeiro-saude-cobranca` avisa no journal e na tela de Pendências | canal externo (e-mail/WhatsApp) para ciclo morto, A1 vencendo, aviso de pagamento caído, caixa projetado negativo | M |
| **Dois analistas, papéis certos** | matriz do PRD §3 (admin, financeiro, cobranca, leitura) implementada; folha pede ação própria | revisar a matriz com a operação real: o analista é `financeiro`; quem cobra é `cobranca`; salário só `admin` (`Q-FOLHA-RBAC-01`) | P |
| **Segundo tenant** | tudo nasceu multi-tenant (regra 2, RLS forçada, FK composta) e nunca teve um segundo | provisionar um segundo tenant de ensaio e rodar a suíte de isolamento contra os dois — é o que prova que «multi-tenant» não é só declaração | M |
| **Pool e concorrência** | pool transacional `max: 8`; o aviso do `pg` reproduz em uma tela | medir com carga real da etapa 0 antes de mexer; telas novas fazem UMA requisição, como Contas a receber | P |
| **Observabilidade do dinheiro** | a Pendências do Rateio e a saúde da cobrança | um painel único de saúde (ciclo, fila, webhook, A1, backup, caixa) na primeira tela de cada funil | M |

**Critério de saída:** a suíte de isolamento roda contra dois tenants; uma restauração de backup foi feita e documentada; nenhuma lista de tela carrega a tabela inteira.

---

## 6. Etapa 6 — além (só nomeado)

- **Portal do cliente** (F7): 2ª via, histórico de faturas, comprovante — consome os endpoints que já existem; é o que tira a operação do WhatsApp.
- **Pagamento em lote pela API** (F6): exige escopo Pix de pagamento no Sicoob e a sua decisão sobre o sistema mover dinheiro sozinho.
- **Fiscal plugável** (PRD §4.5): desligado para a G3 por decisão do contador; liga se um tenant precisar de nota.
- **Integração contábil**: só se o pacote mensal (etapa 4) não bastar ao contador.
- **Orçamento previsto × realizado**: depois de seis meses de DRE real.

---

## 7. Tudo o que depende de você, num lugar só

| Etapa | O que preciso receber | Questão |
|:-:|---|---|
| 0 | rodar o `--valendo` dos endereços; cadastrar donos de usina e geração; começar o piloto sombra | operação |
| 1 | o **áudio** da projeção | `Q-PROJECAO-01` |
| 1 | uma **conta real** com o custo de disponibilidade; **quem paga**; onde é controlado hoje | `Q-TARIFA-MINIMA-01` |
| 1 | a **régua de cobrança** (quando avisa, por qual canal, quando sinaliza corte) | `Q-INADIMPLENCIA-01` |
| 1 | o **aval do contador** sobre o motor aposentado | `Q-CICLO-02` |
| 2 | o **plano de contas** (ou aprovar o proposto); a **lista de bancos** com saldo de partida | `Q-PLANO-CONTAS-01` |
| 3 | a **lista de cartões** e um extrato de cartão real | `Q-CARTOES-01` |
| 3 | **regime** das pessoas, **quem calcula a folha**, formato da planilha, datas; **quem vê salário** | `Q-FOLHA-01` · `Q-FOLHA-RBAC-01` |
| 4 | um **extrato bancário real** (OFX/CSV); ou o gerente liberar escopo de conta corrente na API | `Q-EXTRATO-01` |
| 4 | a **alçada** de aprovação | `Q-ALCADA-01` |
| 4 | o que o **contador** quer receber e em que formato | `Q-CONTADOR-FORMATO-01` |
| 5 | política de **backup** (frequência, retenção, quem restaura); canal de **alerta** | `Q-BACKUP-01` |

**Tudo o mais é técnico e decido sozinho**, registrando em `QUESTOES.md` — como delegado em 08/09.

---

## 8. Tamanho e ritmo (para você calibrar, não para cobrar)

| Etapa | Tamanho total | Em sessões de trabalho (ordem de grandeza) | Observação |
|:-:|:-:|:-:|---|
| 0 | operação | 2–3 (acompanhamento) | o tempo é o do calendário: duas competências = dois meses |
| 1 | G | 4–6 | começa assim que as referências chegarem; a régua é a maior peça |
| 2 | M | 3–4 | pode começar antes da etapa 1 — só precisa do plano de contas e dos bancos |
| 3 | GG | 6–8 | cartões e pessoas são os dois maiores módulos do plano inteiro |
| 4 | G | 5–6 | conciliação e DRE; a projeção de caixa é leitura do que as etapas 2–3 gravam |
| 5 | M (contínua) | 1 por etapa + 2 no fim | backup e segundo tenant são os dois que não podem esperar a etapa 5 chegar |

**Uma sessão** aqui é um bloco de trabalho como o de hoje: mede, decide, constrói, testa, registra, entrega para deploy.

---

## 9. O que NÃO muda em nenhuma etapa

- **As onze do `CLAUDE.md`**: centavos `Int`, `tenant_id` desde a primeira migration com FK composta, RLS forçada com policy, CRM só leitura, segredo no cofre, domínio em português, invariante com teste, escrita grava auditoria, lacuna vira questão, índice parcial não navega.
- **Migration antes do código**, porque os timers rodam da árvore de trabalho.
- **Rótulo é o que a pessoa lê; domínio é o que o sistema é.** Toda tela nova nasce com vocabulário limpo (a suíte cobra), com verbete na ajuda, e com o roteiro apontando para ela quando for passo do mês.
- **UI/UX é prioridade declarada** (08/09): tela nova só entra com o vazio explicado, o erro nomeado e o próximo passo clicável.
- **Nada se afirma pronto sem medida.** Cada etapa fecha pelo critério de saída, não por sensação.
