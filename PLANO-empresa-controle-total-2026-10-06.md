# PLANO — a Empresa com controle total: o que a planilha deixou para trás, cartões, pessoas e todo gasto

| Campo | Valor |
|---|---|
| **Pedido** | 06/10/2026: *«verifique quais funcionalidades podem ser implementadas no sistema financeiro na parte de empresas, se falta alguma funcionalidade que estava dentro do xlsx de controle financeiro da g3 e não foi para a interface, e vamos planejar a inserção de novas funcionalidades que visam o controle máximo como: controle de cartões (sem expor nenhum cartão, apenas ter o cadastro de cada cartão e monitorar os gastos desses), e controle de gastos com funcionários, … tudo que uma empresa pode gastar»* |
| **Aprovado** | 06/10/2026, com «gravar o plano e construir a 1ª etapa» |
| **Base** | auditoria célula a célula de `G3Solar_Financeiro.xlsx` contra o código (`main` = `31d72f7`, migration 43) · `PLANO-financeiro-empresa-2026-09-22.md` (as quatro ondas, que este plano reordena e detalha) · `PLANO-planilha-empresa-2026-10-02.md` |
| **Respostas do dono** | folha: *ainda não há funcionários* · salário: *sócios veem tudo, analista vê só totais* · cartões: *crédito corporativo, débito da conta PJ e cartão pessoal usado pela empresa* (pré-pago fora) — registradas no `QUESTOES.md` §2.y |
| **Etapa 1** | construída no branch `empresa-controle` (worktree `/opt/financeiro/redesenho`), migration 44 `20261006120000_empresa_chao` |

**Princípio que não muda (plano de 22/09):** `conta_pagar` é a unidade de tudo o que sai. Cartão, folha, reembolso e
imposto só **criam** contas a pagar, e só `pagamento` quita. Competência é diferente de caixa: a compra no cartão é
gasto no dia da compra e caixa no dia em que a fatura é paga.

---

## A. A planilha × o sistema: 16 lacunas

**Mudam número ou o uso diário (entram na etapa 1):**

| # | Lacuna | Evidência |
|:-:|---|---|
| 1 | O «hoje» de Despesas, Painel e Projeção é `current_date` em **UTC**. Das 21h à meia-noite, «vence hoje» aparece como vencido. A baixa aceita a data de amanhã | `src/repos/despesa.ts:444`. O `conta_pagar.ts:442` já usa o dia de Goiânia (`HOJE`) |
| 2 | A «situação dos títulos» da planilha soma a **carteira inteira**. O sistema só mostra o mês | `web/src/despesas-regras.ts:169` `situacaoDoMes` |
| 3 | O «recorrente até» corta pela **competência**. A planilha corta pelo **mês de vencimento** | `despesas-regras.ts:333`, `despesa.ts:391` |
| 4 | O fornecedor é obrigatório no sistema e opcional na planilha (o aluguel de exemplo não tem). É texto livre, sem cadastro | `despesa.ts:229`, `telas/despesas.tsx:584` |
| 5 | Não dá para lançar um parcelamento **já em andamento** (por exemplo, a partir da 4/10) | `despesa.ts:270-285` |
| 6 | Não há como **desfazer uma baixa**. Na planilha bastava apagar K e L | não existe rota; `conta_pagar.ts:31-40` |

**Faltam na tela (etapa 1):**
- **7.** Projeção por plano de contas mês a mês (a matriz D:AA). O dado existe em `despesas-regras.ts:316`.
- **8.** O acumulado no gráfico de 24 meses.
- **9.** Renomear e reordenar as origens (a planilha pedia «troque Sócio 1/2 pelos nomes»).
- **10.** Filtros por tipo, recorrência, forma, origem e competência. Busca nas observações. Ordenar por coluna.
- **11.** «Vence hoje» (âmbar) separado de «a vencer» (azul) (`tom-do-estado.ts:202`).
- **13.** Ano e mês digitáveis, guardados na URL.
- **14.** Nº do lançamento e «dias a vencer/atraso» como número, inclusive no CSV.
- **15.** Imprimir ou exportar o Painel e a Projeção.

**Mantida de propósito:**
- **12.** A forma de pagamento continua enum. O cartão de crédito e o de débito passam a ter significado (ligam ao cartão), e um enum protege isso.

**Depende do dono:**
- **16.** Importar histórico (`Q-PLANILHA-HISTORICO-01`). Só vale se existir histórico; vai para a etapa 5.

O sistema já faz **mais** que a planilha nestes pontos, que não serão refeitos: baixa parcial com juros e desconto, sócio que paga do bolso vira dívida, série por id com «Lançar o próximo», cancelar sem apagar, atalhos de vencidas e próximos 7 dias, e a trava contra pagar a mais.

---

## B. Tudo o que uma empresa pode gastar, e por onde cada gasto entra

Os **12 grupos** que o dono aprovou continuam sendo o 1º nível. O plano de contas ganha um **2º nível** (subcategorias sugeridas, criadas com um clique, que o dono risca ou desativa) e a **natureza** de cada item, para separar despesa do que não é despesa.

| Grupo (o da planilha) | Subcategorias sugeridas | Por onde entra |
|---|---|---|
| Despesas Administrativas | aluguel e condomínio, IPTU, energia e água, internet e telefone, material de escritório, limpeza e copa, correios, manutenção predial, seguro do imóvel | Despesa recorrente · cartão |
| Despesas com Pessoal | salários, pró-labore, 13º, férias, rescisões, FGTS, INSS, benefícios (VT, VR/VA, saúde, odonto, seguro de vida), exames ocupacionais, treinamento, uniforme e EPI, bônus, bolsa de estágio | **Folha** · reembolso |
| Tributos e Taxas | DAS (Simples), taxas municipais e alvará, CREA/ART, certidões, multas | Despesa recorrente (beneficiário fisco) |
| Custos Operacionais – O&M Usinas | limpeza de módulos, manutenção preventiva e corretiva, peças e inversores, monitoramento, seguro das usinas, arrendamento de terreno, vigilância | Despesa · cartão |
| Comissões e Repasses | só o que está **fora** do split (o split continua em Contas a pagar, sem duplicar) | Despesa |
| Despesas Comerciais e Marketing | anúncios (Meta, Google), agência, material gráfico, brindes, eventos | **Cartão** · despesa |
| Tecnologia e Software | assinaturas (CRM, servidor, domínio, e-mail, IA), certificado digital A1, suporte | **Cartão** (assinatura) · recorrente |
| Serviços de Terceiros | consultoria, PJ eventual, despachante, cartório, engenharia | Despesa |
| Despesas Financeiras | tarifas bancárias, tarifa de boleto, IOF, juros e multas, anuidade e encargos de cartão | Despesa · fatura do cartão |
| Veículos e Deslocamento | combustível, pedágio, estacionamento, manutenção, IPVA e licenciamento, seguro, aplicativo de transporte, passagem, hospedagem, alimentação em viagem | **Cartão** · reembolso |
| Honorários Contábeis e Jurídicos | contador mensal, advogado, custas | Despesa recorrente |
| Outras Despesas | associações, doações, diversos | Despesa |

**O que sai do caixa mas não é despesa** (proposta: dois grupos novos fora do resultado, que o dono pode desativar):

| Grupo novo | O que entra |
|---|---|
| **Investimentos** | equipamentos, construção de usina, veículos |
| **Retiradas dos sócios** | distribuição de lucro |

O pró-labore é Pessoal. O que o sócio pagou do bolso já é dívida (`Q-SOCIOS-01`). Transferência entre contas próprias não é gasto (etapa 4).

**As cinco portas de saída,** todas terminando em `conta_pagar` e `pagamento`:
1. **Despesa** (existe)
2. **Cartão** (etapa 2)
3. **Folha** (etapa 3)
4. **Reembolso** (sócio já existe; funcionário na etapa 3)
5. **Imposto e obrigação** (etapa 4)

---

## C. Etapas

| Etapa | Pergunta que fecha | Depende do dono? |
|:-:|---|---|
| **1 — A planilha inteira e o chão** | «Tudo o que eu fazia na planilha está aqui, e cada gasto tem fornecedor, centro e comprovante» | não |
| **2 — Cartões** | «Quanto cada cartão e cada portador gastou, com o quê, e a fatura bate?» | não (os cartões são cadastrados na tela) |
| **3 — Pessoas** | «Quanto custa cada pessoa e a equipe, sem expor salário a quem não deve?» | não para construir; o primeiro contratado define o formato do contador |
| **4 — Caixa e controle** | «Quanto temos, deu lucro, estourou o orçamento, vai faltar?» | só o saldo de partida (digitado na tela) e a alçada (configuração) |
| **5 — Insumo externo** | conciliação OFX, importar a fatura do cartão, pacote do contador, receita projetada, histórico | **sim**: extrato, formato do contador, áudio da projeção |

A ordem põe o chão antes dos cartões por dependência real: a compra no cartão precisa de fornecedor, centro de custo, comprovante e conta de débito, e nenhum dos quatro existe hoje.

### Etapa 1 — a planilha inteira e o chão (construída depois da aprovação)

**Migration 44** (`2026100612xxxx_empresa_chao`) segue a disciplina de sempre: `tenant_id`, FK composta, RLS com policy, gatilho `app.auditar()`, `DELETE` revogado onde a linha é prova, e bloco de conferência no fim.

- **`fornecedor`:**
  - campos: nome, documento CPF/CNPJ opcional com dígito verificador conferido, PF/PJ, contato, categoria e centro padrão, dados de pagamento no padrão do `dono_usina`, validados por `conferirChavePix` (`src/dominio/chave-pix.ts:102`), e ativo;
  - é único por documento dentro do tenant.
- **`conta_pagar.fornecedor_id`** (FK composta). `beneficiario_nome` continua como o nome no momento do lançamento e deixa de ser obrigatório para a despesa manual (lacuna 4).
- **`categoria.pai_id`** (dois níveis, garantidos por gatilho) e **`categoria.natureza`** (`despesa`, `investimento` ou `retirada_socio`, com padrão `despesa`). **`centro_custo.ordem`**.
- **`origem_pagamento`** ganha banco, agência e **final da conta** (só os 4 últimos dígitos, com CHECK). É o cadastro de conta bancária que a etapa 2 usa como «conta de débito».
- **`anexo` + `anexo_conteudo`** (o arquivo fica numa tabela à parte, para a lista não carregar bytes):
  - PDF ou imagem de até 8 MB, com tipo conferido pelos bytes (reaproveita `arquivoDoCorpo`, `rotas.ts:213`);
  - sha256 único por tenant; a imagem é reduzida no navegador;
  - ligado a `conta_pagar` agora, e à compra de cartão e ao reembolso depois;
  - nunca é apagado, só desvinculado.
  - **Decisão técnica, no ADR-0009:** o arquivo fica no próprio Postgres e não no Storage. A `SUPABASE_SERVICE_ROLE_KEY` não está no ambiente, e o banco dá RLS e auditoria de graça. O ADR registra o volume em que se muda para o Storage. Isso fecha `Q-ANEXO-01`.
- **Estorno de baixa, só da despesa manual** (lacuna 6): `pagamento.estornado_em`, `estornado_por` e `motivo_estorno`.
  - O gatilho de recálculo ignora pagamento estornado, e nada é apagado.
  - Se a baixa tinha gerado dívida com sócio ainda em aberto, a dívida é cancelada junto. Se essa dívida já foi paga, o estorno é recusado e a tela explica por quê.
  - A `Q-ESTORNO-01` (estorno no Rateio, que toca o split) continua aberta e intocada.
- **Conferência `migration-44`** no `scripts/conferir-banco-alvo.ts`, que passa a ser o default do `migrate-financeiro`. As invariantes vão para `tests/despesas.sql` e para um `tests/fornecedor.sql` novo, testadas nos dois sentidos.

**Servidor:**
- `src/repos/fornecedor.ts` novo, com a busca para autocompletar.
- `src/repos/anexo.ts` novo.
- `src/repos/despesa.ts`:
  - o «hoje» passa a ser o `HOJE` de Goiânia, tirado de `conta_pagar.ts`;
  - o corte do «recorrente até» passa a ser pelo vencimento;
  - parcelamento que começa na parcela k;
  - estorno e anexos.
- Centro de custo ganha `PATCH` e ordem.
- Rotas novas em `src/http/rotas.ts`, perto da 1859.

**Regras e telas:**
- `web/src/despesas-regras.ts`:
  - situação da carteira inteira, além da do mês;
  - corte pelo vencimento;
  - matriz plano × 24 meses e série do acumulado.
- **Despesas** (`telas/despesas.tsx`):
  - fornecedor com autocompletar («cadastrar este» na hora), centro de custo e anexos (arrastar o arquivo);
  - «Desfazer a baixa» no menu ⋯;
  - parcelamento em andamento;
  - filtros completos, ordenação por coluna, busca nas observações;
  - colunas Nº e Dias, também no CSV.
- **Fornecedores** (`/fornecedores`, tela nova no grupo cadastro): lista com o gasto em 12 meses e a última despesa; a ficha mostra o histórico de pagamentos.
- **Plano de contas** (`telas/plano-de-contas.tsx`):
  - dois níveis e a natureza;
  - «Ampliar com subcategorias sugeridas» (as da seção B);
  - seção Centros de custo;
  - origens e contas renomeáveis e ordenáveis, com banco, agência e final.
- **Painel** (`telas/painel-empresa.tsx`): situação da carteira inteira ao lado da do mês, ano e mês digitáveis e na URL, versão para imprimir.
- **Projeção** (`telas/projecao.tsx`): matriz por plano mês a mês, acumulado no gráfico, CSV, mês na URL.
- `tom-do-estado.ts`: «vence hoje» com tom próprio.
- `navegacao.ts` ganha Fornecedores. `ajuda.ts` ganha os assuntos novos.
- `web/src/historico.ts` ganha o rótulo das tabelas novas (o teste H1 exige).
- **Nº do lançamento:** `conta_pagar.numero`, sequencial por tenant, atribuído por gatilho sobre um contador por tenant. Índice único cheio `(tenant_id, numero)`.

### Etapa 2 — Cartões (planejada; construída depois que a 1 subir)

**Sem expor nenhum cartão. Garantido pelo banco e por teste, não por cuidado de quem usa:**
- Não existe coluna para número completo, CVV, validade ou CPF do titular.
- `cartao.final` tem `CHECK (final ~ '^[0-9]{4}$')`.
- O apelido tem um CHECK que recusa 12 ou mais dígitos seguidos.
- Todo texto livre das tabelas de cartão e de despesa (descrição, observação, apelido) passa por `pareceNumeroDeCartao`, em `src/dominio/`: 13 a 19 dígitos com espaço ou traço que passam no Luhn. Se passar, a escrita é recusada com «guarde só os 4 últimos dígitos». O teste cobre os dois sentidos.
- O log por requisição já não leva o corpo da requisição.
- Na tela aparece só «Sicoob PJ •••• 1234 · Vinicius».

**Modelo:**
- **`cartao`:**
  - apelido, modalidade (crédito ou débito), banco emissor, bandeira, final;
  - portador (usuário ou nome; vira `colaborador_id` na etapa 3);
  - conta de débito (`origem_pagamento`);
  - limite, dia de fechamento e de vencimento (só crédito);
  - **limite mensal interno do portador**;
  - situação: ativo, bloqueado ou cancelado.
- **`compra_cartao`:**
  - cartão, data da compra, fornecedor, descrição, valor;
  - tipo: compra, estorno ou encargo (IOF, anuidade, juros);
  - categoria, centro, parcela k/N com grupo de parcelamento;
  - **competência da fatura calculada pelo fechamento** (compra depois do fechamento cai na fatura seguinte);
  - anexo, situação do comprovante, quem lançou.
  - A lista é paginada no servidor desde o primeiro dia.
- **`fatura_cartao`:**
  - cartão e competência, fechamento e vencimento;
  - total derivado por gatilho;
  - valor informado pelo banco, para conferir;
  - situação: aberta, fechada ou paga.
  - **Fechar** congela as compras e cria **uma** `conta_pagar` ao emissor, que aparece em Despesas.
  - No Painel e na Projeção, o «por plano de contas» abre a fatura nas categorias das compras, para a fatura não virar uma categoria só.
- **Débito:** a compra cria na mesma transação a `conta_pagar` e o `pagamento` já quitado, com a forma nova `cartao_debito` e saindo da conta do cartão. Não há fatura.
- **Cartão pessoal:** o botão «Gasto pago com cartão pessoal» lança a despesa já paga com origem sócio, e o mecanismo da `Q-SOCIOS-01` gera a dívida. Na etapa 3, o mesmo vale para funcionário (reembolso).

**Tela «Cartões»** (`/cartoes`, setor Empresa):
- cada cartão como um cartão visual: limite usado em barra, fatura aberta, «fecha em N dias», vencimento, gasto do mês, portador;
- abas **Compras** (lançar, parcelar, estornar, «sem comprovante», classificar em lote), **Faturas** (fechar, conferir com o banco, ir para o pagamento) e **Cadastro**.

**Monitoramento.** Os alertas aparecem no Painel da empresa e na própria tela:
- limite do cartão em 80% ou mais;
- limite interno do portador estourado;
- compra sem comprovante há mais de N dias;
- compra sem categoria;
- possível duplicidade (mesmo cartão, mesmo valor, data com ±1 dia);
- assinatura detectada (mesmo fornecedor em 3 meses seguidos);
- fatura que passou do fechamento sem ser fechada;
- fatura que difere do valor do banco;
- cartão sem uso há 90 dias;
- cartão de pessoa desligada (etapa 3).

**Fechar a fatura é manual na etapa 2, com alerta.** O automático exigiria um tipo novo de tarefa na agenda (`agenda_execucao` hoje está presa ao conector de cobrança) e fica para quando o volume pedir.

### Etapa 3 — Pessoas (planejada)

- **`colaborador`:**
  - nome, CPF mascarado na tela e com dígito verificador conferido;
  - regime (CLT, PJ, estágio, sócio com pró-labore, autônomo), cargo, centro de custo;
  - admissão e desligamento, dados de pagamento, usuário ligado;
  - **`originador_id`**, que impede pagar comissão duas vezes: o split paga a comissão e a folha paga o salário.
- **Sigilo no banco, não só na tela** (lição da `Q-SETOR-DADO-01`):
  - `remuneracao` e `lancamento_folha` têm policy de RLS que exige o papel `admin`, testada nos dois sentidos (o papel `financeiro` lê 0 linhas);
  - o analista vê os totais por centro e por competência por uma função `SECURITY DEFINER` que só devolve agregados. É o mesmo padrão de `usuarios_do_tenant`.
- **Folha por competência:**
  - o rascunho nasce com o salário base;
  - o admin digita ou importa os valores do holerite do contador; **o sistema não calcula INSS, IRRF nem FGTS**;
  - fechar gera:
    - **uma** conta a pagar «Folha líquida MM/AAAA» com o total, para o nome e o valor de cada pessoa não aparecerem em Despesas;
    - as guias de encargos ao fisco;
    - os benefícios aos fornecedores.
  - A provisão mensal de 13º e férias (1/12 + 1/3) entra no custo, como informação.
- **Reembolsos:** o funcionário pagou, o pedido sobe com comprovante, alguém aprova e nasce a conta a pagar ao colaborador. É o mecanismo do sócio, generalizado.
- **«Quanto custa esta pessoa»:**
  - o admin vê remuneração, encargos, benefícios, cartão e reembolsos;
  - o analista vê só o gasto operacional (cartão, reembolsos), porque isso não é salário.
- No desligamento, aparecem os alertas de cartão do portador e de acesso ao sistema.
- Ações novas na matriz (`src/db/contexto.ts:220`): `ler_remuneracao` e `escrever_remuneracao`, só `admin`.

### Etapa 4 — Caixa e controle (planejada)

- **Caixa realizado e saldo por conta:**
  - a liquidação do Sicoob cai sozinha na conta do conector;
  - o pagamento sai pela origem;
  - transferência entre contas próprias não é gasto;
  - o saldo de partida é digitado na tela;
  - o painel de saúde troca «caixa: não existe» pelo saldo.
- **Orçamento** por plano × centro × mês, com alerta em 80% e em 100%.
- **Aprovação com alçada:** é configuração na tela e começa desligada. Com isso a `Q-ALCADA-01` deixa de bloquear e vira ajuste do dono.
- **Impostos e obrigações:** calendário (DAS, FGTS, alvará, renovação do A1) e beneficiário `fisco`.
- **Contratos e assinaturas de fornecedor:** data de reajuste, de renovação e de aviso prévio, com alerta.
- **DRE gerencial por competência**, com a coluna caixa ao lado. Investimentos e retiradas ficam fora do resultado.
- **Fluxo de caixa projetado para 90 dias:** contas a receber, menos despesas, faturas, folha e projeção.
- **«O que pede atenção»** consolidado no Painel da empresa. Nasce na etapa 2 e cresce a cada etapa.

### Etapa 5 — depende de insumo externo

| Entrega | O que falta |
|---|---|
| Conciliação bancária por OFX | extrato real (`Q-EXTRATO-01`) |
| Importar a fatura do cartão em CSV/OFX | um arquivo real (`Q-CARTOES-01`) |
| Pacote mensal do contador | formato pedido pelo contador (`Q-CONTADOR-FORMATO-01`) |
| Receita projetada | o áudio (`Q-PROJECAO-01`) |
| Importar o histórico da planilha | se houver histórico (`Q-PLANILHA-HISTORICO-01`) |
| Empréstimos, financiamentos e bens | — |
| Portador lançando a própria compra pelo celular | um papel novo |

---

## D. O que vai para o `QUESTOES.md`

**Fechadas hoje pelo dono:**
- `Q-FOLHA-01`: não há funcionários. O formato do contador fica para quando entrar o primeiro CLT.
- `Q-FOLHA-RBAC-01`: o admin vê nome a nome; o analista vê agregados.
- `Q-CARTOES-01` (parte): os tipos de cartão e o cadastro pela tela. Fica aberto só o arquivo real para importação.

**Fechadas por mim, com registro na §2.y** (decisões técnicas): anexo no Postgres (ADR-0009), estorno de baixa da despesa manual, sigilo por RLS com função agregada, fatura de cartão como uma conta a pagar aberta por categoria, guarda contra número de cartão, e fechamento da fatura manual com alerta.

**Novas:**

| Questão | Pergunta |
|---|---|
| `Q-FOLHA-PAGADOR-01` | Quem faz o PIX do salário? Se for o analista, ele vê o valor no banco, e o sistema não tem como esconder isso |
| `Q-PLANO-NATUREZA-01` | Os grupos «Investimentos» e «Retiradas dos sócios» ficam fora das despesas? (proposta; dá para desativar) |

---

---

## E. A disposição das telas da etapa 1 (impeccable `shape`, 06/10/2026)

Modo **Operate** no mundo g3ref que já existe (`DESIGN.md`); os componentes são os de `ui.tsx`. *Suposições, porque
a entrevista do shape não houve: o dono delegou UI/UX (08/09/2026) e aprovou, no plano, o conteúdo de cada tela.*

- **Despesas** continua sendo a tela de trabalho («o que eu pago hoje»). A lista ganha a coluna **Nº** e a ordem por
  coluna no cabeçalho (`ThOrd`); o plano aparece como subcategoria com o grupo embaixo; o clipe com a contagem diz
  quais têm comprovante. Os filtros da planilha que não cabem na barra ficam atrás de **«Filtros (n)»**, num painel
  de um clique, com «Limpar estes filtros». O detalhe da linha ganha o Nº, o centro, o fornecedor (com link), os
  **comprovantes** (abrir, anexar, tirar) e a baixa **desfeita riscada com o motivo**. «Desfazer a última baixa…» mora
  no menu ⋯, e a pergunta pede o motivo e diz o que acontece com a dívida do sócio.
- **Nova despesa:** o **Fornecedor** é um campo de texto com a lista do cadastro (sugestão nativa); a nota embaixo
  diz «Do cadastro», ou «Só o nome, sem cadastro» com **«Cadastrar»** ao lado. Escolher um fornecedor traz o plano e
  o centro de costume, só no que estiver vazio. O comprovante vai em «Mais detalhes» e sobe depois que a despesa
  existe. A parcelada pergunta **«Começa na parcela»**.
- **Fornecedores** (tela nova, cadastro): a lista diz de cada um o pago em 12 meses, o em aberto e a última despesa;
  a linha abre a **ficha** (dados para pagar, plano e centro de costume, as despesas recentes, «Ver todas em
  Despesas»). «Novo fornecedor» é o ato da tela; nada se apaga, desativa-se.
- **Plano de contas:** três cartões **empilhados na largura inteira** — o plano (grupos e, recuadas, as
  subcategorias, com a natureza no grupo), os **centros de custo** e as **origens** (o banco, a agência e o final na
  segunda linha). Lado a lado, na primeira rodada do espelho, a situação e o interruptor ficavam cortados.
- **Painel:** o mês se digita entre as setas e vai para a URL; a **situação dos títulos** aparece duas vezes, do mês
  e da carteira inteira; o plano mostra a subcategoria recuada e marca o grupo fora do resultado; **Imprimir**.
- **Projeção:** a linha do **acumulado** sobre as colunas (escala própria, dita na legenda); a matriz **por plano,
  mês a mês** nos meses do período de análise (o CSV leva os 24); **Baixar CSV** e **Imprimir**.
- **Anti-objetivos:** nenhum número sem origem, nenhum segundo laranja novo, nada apagado, nenhuma rolagem lateral
  da página (só a matriz rola dentro da caixa dela). Conferido no espelho a 1280 e a 390 px.

## F. O que a etapa 1 deixa para o dono, nesta ordem (migration antes do código)

1. `! git -C /opt/financeiro/redesenho -c safe.directory='*' push origin empresa-controle` — o worktree é do usuário
   `financeiro`, e o git como root recusa a pasta sem o `safe.directory`. Depois do push,
   `! chown financeiro:financeiro /opt/financeiro/app/.git/refs/remotes/origin/empresa-controle` (o `.git` é o de produção).
2. `! gh workflow run migrate-financeiro.yml -R upereira-jp/finaceiro --ref empresa-controle -f confirmar=aplicar -f conferencia=migration-44`
   — e conferir «migration 44 OK» no run. Entre a migration e o deploy a guarda `ClienteGeradoDesatualizado` dos
   timers dispara (esperado; some com o deploy).
3. `! runuser -u financeiro -- git -C /opt/financeiro/app merge --ff-only empresa-controle`, depois
   `! git -C /opt/financeiro/app push origin main` e `! gh workflow run deploy-financeiro.yml -R upereira-jp/finaceiro`.
4. Reaplicar `services/relatorio-mcp/sql/03-espelho-movimento.sql` no banco do Financeiro (a view `v_pagamento`
   passa a ignorar a baixa desfeita) — só depois do passo 2.
5. Conferir o CI `isolamento` do `main` (os cinco jobs).
