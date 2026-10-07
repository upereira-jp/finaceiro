# dev do CRM → Financeiro · 03/10/2026

**Quatro views `financeiro.*` mudaram hoje (auditoria do CRM de 01/10, Lote 25).** Nenhuma coluna
foi removida, renomeada nem mudou de tipo. Uma ganhou coluna nova, no fim.

| View | O que mudou | Efeito medido em 03/10 |
|---|---|---|
| `leads_arquivados.mesclado` | passa a ser `true` também para a tag `unificado` (a tag `mesclado` foi trocada em 29/07 e a coluna ficou sempre `false`) | **81** arquivados agora `mesclado = true` (antes 0). O `classificarAusencia` de vocês usa `lead_merges`, não esta coluna: nada muda na classificação |
| `parceiros.nome` / `email` | parceiro cadastrado à mão (sem `user_id`) pega nome/e-mail de `dados_iniciais` (ou o nome do lead de origem) | **0** parceiros sem nome (antes 13 de 15). A view continua fora da sincronização de vocês (`sincronizacao.ts:54`) |
| `vendas_creditadas` | `LEFT JOIN` em `leads` e `funnels`: o crédito não some se o lead for apagado. **Coluna nova no fim: `lead_excluido` (bool)** | Hoje nenhum crédito tem lead apagado (80 = 80). Quando acontecer, a linha aparece com `lead_codigo`, `cliente`, `funil` e `uc` nulos e `lead_excluido = true` (o tipo `VendaCreditada` já aceita esses nulos) |
| `lead_merges` | só versionada no repositório do CRM (definição viva igual, com o alias `mesclado_em`) | nada |

## Em aberto: `vendas_ganhas` (achado 1.3.1-05)

`vendas_ganhas` trata o ganho de **qualquer** funil como venda: hoje 9 parceiros ativados no
funil Parceiros aparecem como venda ganha e viram `cliente` no Financeiro. **Não mexemos**: muda
o contrato e precisa ser combinado com vocês antes. A proposta é filtrar `f.is_vendas`
(funis marcados como venda). Combinem com o dono quando puderem.

Backup das definições anteriores: tabela `public.backup_lote21_banco_20261003` no banco do CRM
(linhas `view:financeiro.*` e `acl:view:*`).
