# PLANO — a planilha `G3Solar_Financeiro.xlsx` vira telas do setor Empresa

| Campo | Valor |
|---|---|
| **Pedido** | 02/10/2026: *«Esse processo que funciona atualmente em planilhas deve funcionar dentro do sistema a partir de agora»* — o controle financeiro da **EMPRESA**, não do rateio |
| **Fonte** | `G3Solar_Financeiro.xlsx` (commit `9ea5752`), 5 abas, 4.446 células, 4.293 fórmulas |
| **Responde** | as duas referências que a onda 1 do `PLANO-financeiro-empresa-2026-09-22` esperava: o **plano de contas atual** e a **lista de origens** (§2.1 e §2.2) |
| **Branch** | `empresa-planilha` (worktree `/opt/financeiro/redesenho`), sobre `origin/main` |

---

## 1. O que a planilha é, aba por aba

A planilha é um **modelo pronto**, com um lançamento só (o aluguel da sala, R$ 4.319,00, vence 10/10/2026). Não há
histórico para importar: o que se leva para o sistema é a **forma de trabalhar**, não dados.

| Aba | O que faz | Entradas (células azuis/amarelas) | Derivado (fórmula) |
|---|---|---|---|
| **Cadastros** | as listas dos menus | plano de contas (12 itens, cabem 15) · tipo (Fixa/Variável) · recorrência (Avulsa, Mensal, Trimestral, Semestral, Anual, Parcelada) · forma (PIX, Boleto, TED, Cartão de crédito, Débito automático, Dinheiro) · conta/origem (Conta PJ G3 Solar, Adiantamento Sócio 1 e 2) | — |
| **Lançamentos** | um título a pagar por linha (500 linhas) | histórico, fornecedor, plano, tipo, recorrência, parcela n/total, competência, vencimento, valor original, data e valor do pagamento, forma, origem, nº do documento, link do comprovante, observações, «recorrente até» | acréscimo/desconto = pago − original · situação (PAGO / VENCIDO / VENCE HOJE / A VENCER) · dias para vencer ou de atraso · as três colunas auxiliares da série |
| **Painel** | o mês escolhido | ano e mês (vêm do Dashboard) | previsto, pago, em aberto, vencido acumulado, a vencer em 7 dias, % liquidado · por plano de contas (previsto, pago, em aberto, % do total) · previsto × realizado nos 12 meses do ano, com fixas e variáveis |
| **Dashboard** | a vitrine dos sócios | ano e mês | os 6 indicadores · dois gráficos: situação dos títulos (pago, a vencer, vencido) e fixas × variáveis no ano |
| **Projeção** | 24 meses para a frente | mês de início · período de análise (de, até) | por mês: títulos lançados + **recorrências projetadas** + total + acumulado · total, média, maior mês no período, 12 e 24 meses · por plano de contas no período |

**A regra da recorrência** (a parte não óbvia, lida das colunas auxiliares V, W e X):
- uma série é o conjunto de títulos com o **mesmo texto no Histórico**;
- o **último** título da série (maior vencimento) é o molde: o valor dele se repete a cada 1, 3, 6 ou 12 meses;
- a repetição acaba no mês de «recorrente até», se houver;
- **Avulsa e Parcelada não projetam**: a parcelada já tem cada parcela lançada.
- O mês que já tem título lançado da série **não** recebe projeção, porque o último título é sempre o mais novo.

**Os critérios de mês da planilha** (mantidos de propósito, para os números baterem com o que os sócios viam):
- previsto, pago e em aberto do mês são contados pelo **vencimento**, não pela data do pagamento;
- «vencido» é acumulado, de qualquer mês;
- «a vencer em 7 dias» vai de hoje a hoje+7, só do que não está pago.

## 2. O que o sistema já tem, e o que falta

| A planilha | O sistema hoje | Falta |
|---|---|---|
| plano de contas | `categoria` existe, **vazia e sem tela** | tela, ordem, desativar · começar pelos 12 da planilha com um clique |
| conta/origem | não existe | tabela `origem_pagamento` (Conta PJ, adiantamento de sócio, outra) e a tela |
| título a pagar | `conta_pagar` manual (`beneficiario_tipo = outro`), com «Nova despesa avulsa» em Contas a pagar | natureza fixa/variável, recorrência, «recorrente até», série, parcela n/total, forma prevista, origem, nº do documento, link do comprovante, observações · **editar** um título |
| baixa | `pagamento` (data, valor, forma, referência) | **acréscimo e desconto** (hoje o banco recusa pagar acima do título), a origem de onde saiu, e as formas Cartão de crédito e Débito automático |
| situação | status derivado por gatilho (aberta, parcial, paga, cancelada) | a situação por DATA (vencido, vence hoje, a vencer), que já é a regra da casa: «vencido é a data, não o status» |
| Painel, Dashboard e Projeção | não existem | três leituras puras sobre a mesma lista |

## 3. As decisões (técnicas, minhas — registradas no `QUESTOES.md` §2.w)

1. **Uma tabela só para o que sai.** Todo lançamento da planilha vira uma `conta_pagar` manual. Nada de tabela
   paralela de despesas, porque o princípio 1 do plano de 22/09 vale aqui («`conta_pagar` é a unidade de tudo o que
   sai»).
2. **A série é um `serie_id`, e não o texto do Histórico.** Na planilha, mudar uma vírgula no histórico quebra a
   recorrência sem aviso. No sistema, a série nasce no primeiro lançamento recorrente ou parcelado, e «Lançar o
   próximo» copia o último título dela. A regra de projeção é a da planilha, com a série no lugar do texto.
3. **O acréscimo e o desconto ficam no pagamento, fora do valor do título.** `pagamento.valor_centavos` continua
   sendo o que abate do título, e o gatilho e o `CHECK` contra pagar a mais não mudam. O que saiu do banco é
   `valor + acréscimo − desconto`. A tela pede «quanto saiu do banco» e pergunta o que é a diferença: juros/multa,
   desconto ou pagamento parcial.
4. **Painel e Projeção são leituras puras no navegador** (`web/src/despesas-regras.ts`), sobre a lista de títulos
   que o servidor devolve com o `hoje` do banco. É o padrão de `receber-regras.ts`. A suíte roda sem banco, e o
   volume (até 500 títulos por ano) cabe.
5. **Empresa é o que nasce à mão.** Painel, Projeção e Despesas leem só `origem_split_item_id IS NULL`. Repasses e
   comissões do rateio continuam em Contas a pagar (passo 5) e não entram duas vezes.
6. **Nada é semeado na migration** (`Q-CONTAPAGAR-01`c). Plano de contas e origens vazios oferecem «Começar com o
   plano da planilha», que grava os 12 itens e a Conta PJ G3 Solar com um clique. Os nomes dos sócios o dono
   escreve na tela, como a própria planilha pedia.
7. **As formas novas entram no enum** `forma_de_pagamento` (`cartao_credito`, `debito_automatico`). Tipo e
   recorrência são enums fixos e não cadastros, porque a projeção depende do significado de cada valor.

## 4. As telas (setor Empresa)

| Tela | Rota | De onde vem | O que faz |
|---|---|---|---|
| **Painel** | `/empresa` | Dashboard + Painel | mês escolhido · 6 indicadores · situação dos títulos · por plano de contas · previsto × realizado no ano, com fixas e variáveis |
| **Despesas** | `/despesas` | Lançamentos | lista por vencimento com situação, filtros (mês, situação, plano, busca) · Nova despesa (avulsa, recorrente ou parcelada) · editar · baixa com acréscimo/desconto · lançar o próximo da série · encerrar recorrência · cancelar · CSV |
| **Projeção** | `/projecao` | Projeção | 24 meses a partir do mês escolhido · lançado × projetado × acumulado · período de análise · por plano de contas |
| **Plano de contas** | `/plano-de-contas` | Cadastros | plano de contas (criar, renomear, ordenar, desativar) · origens do pagamento · as listas fixas mostradas como referência |

Contas a pagar continua sendo a tela dos repasses do rateio (passo 5). A «Nova despesa avulsa» sai de lá e passa
a ser a «Nova despesa» de Despesas, para não haver dois caminhos.

## 4.1 Brief de disposição (impeccable `shape`, 02/10/2026)

Modo **Operate** dentro do mundo g3ref que já existe (`DESIGN.md`): nada de identidade nova, os componentes são os de
`ui.tsx` (Pagina, Kpi, Tabela, PainelDeCriar, Campo, Escolha, Menu). *Suposições, porque a entrevista não houve: o dono
delegou UI/UX ([[autonomia-tecnica-e-foco-ui]]) e o pedido era seguir sem parar.*

- **Quem chega:** o analista financeiro e os sócios. O analista LANÇA e DÁ BAIXA (Despesas); os sócios OLHAM (Painel). A
  pergunta do Painel é *«quanto sai este mês, quanto já saiu, o que está atrasado»*; a de Despesas, *«o que eu pago
  hoje»*.
- **Painel:** o mês no título, com ‹ › para andar. Seis cartões (previsto, pago com a barra do % liquidado, em aberto,
  vencido acumulado em vermelho, vence em 7 dias, próximos 12 meses com link para a Projeção). Embaixo, duas colunas:
  por plano de contas (tabela com barra de % do total) e situação dos títulos (uma barra empilhada pago · a vencer ·
  vencido no lugar da pizza da planilha). Por fim, o ano: 12 pares de barras previsto × pago, e a tabela do ano com
  fixas e variáveis. O vazio leva ao Plano de contas ou à primeira despesa.
- **Despesas:** a tela de trabalho. «Nova despesa» é o primário. Três atalhos no alto (vencido, vence em 7 dias, este
  mês), que são filtros de um clique, como as faixas de Contas a receber. Padrão: «a pagar», todas as datas, por
  vencimento, com o vencido primeiro. Linha: vencimento e dias · histórico com o fornecedor embaixo · plano · série
  («Mensal», «3/10») · valor · situação · «Dar baixa» e o menu ⋯ (editar, lançar o próximo, encerrar recorrência,
  cancelar). A linha abre o detalhe (forma, origem, documento, link do comprovante, pagamentos com juros/desconto).
  - Nova despesa em grupos: o quê, quando e quanto, repetição (Avulsa | Repete | Parcelada) e o resto atrás de «Mais
    detalhes».
  - A baixa pergunta «quanto saiu do banco» e, se diferir do saldo, o que é a diferença.
- **Projeção:** «a partir de» com ‹ ›. Cartões de 12 e 24 meses e do período (de, até, total, média, maior mês). As 24
  colunas empilham lançado (navy) e projetado (laranja-suave), com a tabela mês a mês e o acumulado; o período
  aparece realçado. Por plano de contas no período, e a lista das séries que projetam, para o número ter de onde vir.
- **Plano de contas:** dois cartões, o plano ordenável (↑ ↓, renomear, desativar) e as origens. O vazio oferece
  «Começar com o plano da planilha». As listas fixas (tipo, recorrência, forma) aparecem como referência.
- **Anti-objetivos:** nenhum gráfico decorativo, nenhum número que a planilha não tinha sem dizer de onde vem, e nada
  de apagar (desativa-se). No celular, as colunas viram pilha e a tabela vira cartão (`Tabela` já faz isso).

## 5. Ordem de construção

1. migration 42 + `schema.prisma` + conferência `migration-42` + default do workflow;
2. repositório, rotas e tipos da API;
3. regras puras e a suíte delas;
4. Plano de contas → Despesas → Painel → Projeção;
5. menu, ajuda, `QUESTOES.md` §2.w, verificação (typecheck, suítes, build no scratchpad) e o impeccable sobre a
   disposição das telas;
6. commits locais. O push, a migration e o deploy ficam com o dono, nessa ordem:
   `migrate-financeiro` com `conferencia=migration-42`, depois o merge em `main` e o deploy.
