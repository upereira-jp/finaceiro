# ATRIBUIÇÃO DE ORIGINADOR — a carteira de 41 linhas

> ## ⚠️ SUPERADO EM 30/07/2026 — NÃO USE ESTE MAPA PARA CADASTRAR
>
> **Use `ATRIBUICAO-originador-2026-07-30.md`.** Este arquivo fica como registro datado, com o corpo intacto — reescrevê-lo falsificaria o registro, que é a mesma decisão do `PATCH-citacoes-2026-07-24.md`.
>
> O CRM mudou entre a medição deste documento (29/07 22:53Z) e 30/07 03:30Z: **76 merges de lead**, registrados em `financeiro.lead_merges` com origem `merge_leads`. Três consequências, todas medidas:
>
> | O que | Neste documento | Em 30/07 |
> |---|---|---|
> | **Lista de originadores** | três nomes | **dois** — `Jezielly Vieira` ficou com **zero** cards no CRM |
> | UC `000406456101252` (RHENAN) — 4.60%, 496,8 kWh | Jezielly Vieira | **Out Sales** |
> | UC `000407359701237` (ATAIDE) — 18.40%, **1.987,2 kWh** | **Renata** | **Out Sales** |
> | Peso da Renata | 25 UCs · 80,8% | 24 UCs · **74,2%** |
> | Peso do Out Sales | 14 UCs · 15,9% | 16 UCs · **24,2%** |
> | `lead` (a coluna `lead` das tabelas da §4) | os códigos de 29/07 | **39 dos 41 códigos não existem mais** — o merge renumera |
>
> **O que este documento acertou e ficou provado:** as **12** atribuições que a §4 marca como fonte `card` — invisíveis às views em 29/07 — ficaram legíveis pela view em 30/07, e **as 12 batem**. As duas que mudaram eram de fonte `view`, não `card`. Não foi o método daqui que errou; foi o dado que se moveu.
>
> Ver `Q-CRMCODIGO-01` no `QUESTOES.md`.

| Campo | Valor |
|---|---|
| **Decisão** | *"O originador vai ser o `vendedor_origem` até segunda ordem"* — Vinicius, 29/07/2026 |
| **Para que serve** | é o insumo que a `Q-ORIGINADOR-01` deixou pendente. A tela **exige** originador em cada contrato, e produção tem **zero** cadastrados |
| **Medido em** | 29/07/2026, 22:50–22:56Z, contra o CRM real pela role `financeiro_ro` (read-only, só as views — regra 4) e contra o banco do financeiro |
| **Estado** | **nada foi escrito.** `originador` = 0 linhas, `contrato` = 0 linhas. Este documento é conferência, não execução |
| **Questão** | `Q-ORIGVEND-01` no `QUESTOES.md` §5 |

---

## 1. O que a decisão resolve

O insumo era *"a lista de originadores"* — aberta, sem tamanho conhecido. Com o eixo escolhido ela fecha em **três nomes**, e não em três nomes prováveis: `vendedor_origem` é `users.name` alcançado por `leads.vendedor_origem_user_id`, ou seja **tem chave estrangeira**. Não é o custom field *"Nome do vendedor"* em texto livre que o `PRD` §7 registra como semente frágil.

Medido nos 80 ganhos que a view expõe:

| `vendedor_origem` | ganhos |
|---|--:|
| Renata | 49 |
| Out Sales | 29 |
| Jezielly Vieira | 1 |
| *(nulo)* | 1 |

---

## 2. A escolha do eixo move dinheiro, e a medição sustenta a do dono

O `RESUMO-SESSAO-3` §121 tinha registrado uma **recomendação contrária**: *"`responsavel` paga, `vendedor_origem` só registra"*. Era recomendação, não decisão — e a medição de hoje diz que ela estava errada para esta carteira.

Os dois eixos **divergem em 43 dos 80 ganhos**:

| Eixo | Renata | Out Sales | Jezielly | Kallina | nulo |
|---|--:|--:|--:|--:|--:|
| `vendedor_origem` | 49 | 29 | **1** | 0 | 1 |
| `responsavel_atual` | 43 | 7 | **28** | 1 | 1 |

O que decide é o **porquê** da diferença: nos **15 cards do funil `Rateio`**, o `responsavel` é `Jezielly Vieira` em **15 de 15**, com `vendedor_origem` variando entre Renata e Out Sales. Ou seja, `responsavel` ali é **dono operacional do card**, não quem vendeu. Pagar comissão por esse eixo pagaria 28 vendas a quem processou o cadastro.

**A recomendação da sessão 3 fica superada por esta medição**, e a decisão do dono é a que corresponde ao dado.

---

## 3. O `tipo`, e por que ele não muda o total

`originador.tipo` é **local** (`SPEC-001` R20 — não é o `vendedor_tipo` do CRM). O CRM oferece uma semente, em `tenant_users`:

| Pessoa | `vendedor_tipo` no CRM | papel | `originador_tipo` sugerido | total |
|---|---|---|---|--:|
| Renata | `proprio` | diretoria | `vendedor_g3` | 50% |
| Out Sales | `terceirizado` | terceirizado | `terceirizado` | 50% |
| Jezielly Vieira | `terceirizado` | usuario | `terceirizado` | 50% |

**Os dois tipos totalizam 50% e estão repartidos 25 + 25** — `vendedor_g3` pelo `PRD` §5.4, `terceirizado` pelo backfill da migration 17. Então a escolha entre eles **não altera valor nenhum hoje**; altera só qual linha de `regra_comissao` é lida. A repartição 25+25 do `terceirizado` continua sendo suposição registrada — `Q-COMIS-TERC-01`.

**Isto é semente, não chave.** O `tipo` precisa de confirmação do dono antes do cadastro: ele **congela no contrato** (R20-b) e promover a pessoa depois não reprecifica o que já foi fechado.

**Renata é sócia** e concentra **80,8% do peso da carteira** (abaixo). A pergunta fiscal já tem resposta — `PAUTA` 7, 28/07: a comissão da sócia **é comissão**, despesa dedutível como a dos demais.

---

## 4. O mapa: as 41 linhas do rateio

`fonte` é o que importa operacionalmente:

- **`view`** — o financeiro **consegue** ler: o ganho está em `financeiro.vendas_ganhas`;
- **`card`** — o financeiro **NÃO consegue** ler: o card está em etapa `normal` do funil `Rateio` (`Troca de Titularidade` ou `Rateio Concluído`) e a view expõe só `won`. A origem **existe no CRM** e é invisível às 8 views. **Como eu a obtive:** pelo **conector de análise** do CRM, read-only, que é outro caminho e não o do financeiro — as 12 estão nos 15 cards `normal` do funil `Rateio`, medidos em 29/07 22:53Z. Nada disso é alcançável pelo `src/crm/leitura.ts`, e por isso este documento é o único portador delas;
- **`?`** — desconhecida.

### Renata — 25 UCs

| lead | UC | cliente | % | kWh/mês | fonte |
|---|---|---|--:|--:|:--:|
| G3-0139 | 000018428801244 | LUCAS SOUTO MELO DE CARVALHO | 9.5 | 1026.0 | view |
| G3-0143 | 000047571701292 | PERPETUA CARNEIRO DA COSTA | 5.5 | 550.0 | view |
| G3-0144 | 000091670201219 | PAULO DE OLIVEIRA PEREIRA | 3.5 | 350.0 | view |
| G3-0145 | 000030868101204 | RAMON DA SILVA ROCHA | 3.7 | 399.6 | view |
| G3-0146 | 000361204101264 | GEOVANNA KARLA RODRIGUES | 3.5 | 350.0 | view |
| G3-0147 | 000059133001226 | THAIS EVARISTO SOUZA | 4.6 | 496.8 | view |
| G3-0148 | 000334999901223 | FABRICIO — CARTEIRA LOURIVAL | 2.3 | 248.4 | view |
| G3-0149 | 000000013290060 | YAGO CANDIDO MACHADO | 5.0 | 500.0 | view |
| G3-0152 | 000000014813865 | GABRIELLA VIEIRA DORNELAS | 3.2 | 345.6 | view |
| G3-0275 | 000417156401233 | ULISSES JOSE BARBOSA RAMOS | 100.0 | 10000.0 | view |
| G3-0280 | 000276862801233 | RENATA FERREIRA ESTEVAM | 1.8 | 194.4 | view |
| G3-0281 | 000249057801299 | RENATA FERREIRA ESTEVAM | 2.8 | 302.4 | view |
| G3-0296 | 000240664901209 | THIAGO GONCALVES TAQUARY | 6.0 | 600.0 | view |
| G3-0301 | 000407359701237 | ATAIDE DE MELO OLIVEIRA | 18.4 | 1987.2 | view |
| G3-0302 | 000091584701207 | ATAIDE DE MELO OLIVEIRA | 12.0 | 1296.0 | view |
| G3-0306 | 000389331401209 | NII3 — NEGOCIOS IMOBILIARIOS | 1.8 | 194.4 | view |
| G3-0308 | 000056310801224 | RENATA LUCY NOGUEIRA DRUMOND | 1.8 | 194.4 | view |
| G3-0310 | 000055953601208 | RENATA LUCY NOGUEIRA DRUMOND | 1.78 | 192.2 | view |
| G3-0314 | 000010038486340 | GABRIELLA VIEIRA DORNELAS | 3.2 | 345.6 | view |
| G3-0229 | 000000100076075 | CARLA GONZAGA DE MORAIS | 9.0 | 900.0 | **card** |
| G3-0285 | 000288026201278 | CELIA REGINA DE JESUS/MINEIRO | 5.5 | 594.0 | **card** |
| G3-0304 | 000331083701240 | CARLA GONZAGA DE MORAIS | 25.0 | 2500.0 | **card** |
| G3-0312 | 000041446801282 | NILTON RODRIGUES DOS REIS | 5.5 | 594.0 | **card** |
| G3-0335 | 000241968901278 | Leandro Vieira | 9.0 | 0.0 | **card** |
| G3-0412 | 000295713501257 | Marlon Estevam de Sousa | 3.0 | 0.0 | **card** |

### Out Sales — 14 UCs

| lead | UC | cliente | % | kWh/mês | fonte |
|---|---|---|--:|--:|:--:|
| G3-0138 | 000091272101239 | ATAIDE DE MELO OLIVEIRA | 14.0 | 1400.0 | view |
| G3-0140 | 000300815901203 | JONATHAN ESTEVAM DE SOUZA | 2.8 | 302.4 | view |
| G3-0141 | **(UC vazia)** | FERNANDO ALBINO — CARTEIRA | 5.5 | 594.0 | view |
| G3-0142 | 000427090701294 | THIAGO GONCALVES TAQUARY | 2.0 | 200.0 | view |
| G3-0150 | 000389112301217 | NII3 — NEGOCIOS IMOBILIARIOS | 1.8 | 194.4 | view |
| G3-0153 | 000277455301256 | CARLOS GABRIEL SANTOS ALVES | 2.6 | 280.8 | view |
| G3-0192 | 000036571501203 | Magda Oliveira | 2.3 | 230.0 | view |
| G3-0196 | 000381032001295 | Alice Ribeiro Franca | 1.4 | 140.0 | view |
| G3-0176 | 000059018301203 | ODILON/PRICILLA | 3.5 | 350.0 | **card** |
| G3-0191 | 000322429201206 | LUDMILLA MARQUES DE SOUZA | 5.5 | 550.0 | **card** |
| G3-0217 | 000055483901286 | Edimar Fernando Junior | 5.0 | 500.0 | **card** |
| G3-0392 | 000136464401264 | Marli das Graças Leite | 3.0 | 0.0 | **card** |
| G3-0407 | 000039416101210 | Hermani Soares de Araujo | 4.0 | 0.0 | **card** |
| G3-0408 | 000006990101222 | Hermani Soares de Araujo | 5.0 | 0.0 | **card** |

### Jezielly Vieira — 1 UC

| lead | UC | cliente | % | kWh/mês | fonte |
|---|---|---|--:|--:|:--:|
| G3-0155 | 000406456101252 | RHENAN HENRIQUE DAMASIO | 4.6 | 496.8 | view |

### Sem origem — 1 UC, e ela precisa de resposta

| lead | UC | cliente | % | kWh/mês | fonte |
|---|---|---|--:|--:|:--:|
| G3-0154 | 000009997201253 | OSVALDO ESTEVAM MARCELINO | 4.6 | 496.8 | **?** |

O lead está **arquivado** (`leads_arquivados`: `Rateio / Desconto Ativo`, `mesclado = false`), e card arquivado sai de toda consulta de card. Nem a view nem o conector de análise entregam o `vendedor_origem` dele. **Quem originou essa UC é pergunta para a operação** — não há caminho de leitura.

---

## 5. O peso, para saber o tamanho da decisão

`percentual_rateio` é por usina e não soma 100 no total; o que aproxima dinheiro é o crédito mensal. A comissão incide sobre o **consumo faturado**, então isto é **proxy de peso, não valor**.

| Originador | UCs | crédito kWh/mês | peso |
|---|--:|--:|--:|
| **Renata** | 25 | 24.161,0 | **80,8%** |
| **Out Sales** | 14 | 4.741,6 | 15,9% |
| Jezielly Vieira | 1 | 496,8 | 1,7% |
| *sem origem* (G3-0154) | 1 | 496,8 | 1,7% |
| **total** | **41** | **29.896,2** | |

O total cobre as **41 linhas do rateio**, e duas delas não são digitáveis hoje (§6). Sobre as **39** que são, a única que muda é o Out Sales — perde os 594,0 da G3-0141 e fica em **4.147,6 (14,2%)**; a Renata sobe para **82,4%** porque a G3-0412 vale 0,0.

Cinco linhas cadastradas em 28/07 têm `creditos_kwh_mes = 0,0` (G3-0335, G3-0392, G3-0407, G3-0408, G3-0412) — todas na usina `407706301217`, que não tem geração nominal. Isso **subestima** o peso do Out Sales e da Renata, e é a mesma classe da `GERACAO-01`: ausência de série não é zero. Não afeta o faturamento, que pela `SPEC-003` R30 é sobre **geração medida**, não sobre esse campo.

---

## 6. Duas linhas do rateio não estão nas 39 UCs do financeiro

| lead | por quê |
|---|---|
| **G3-0141** | a `uc` está **vazia** no CRM, e `unidade_consumidora.numero_uc` não aceita vazio. Recusa em cascata. **E isto mudou desde 27/07:** era esta a linha que duplicava `000041446801282` com a G3-0312 (`UC-DUP-01`). Hoje aquele número aparece **uma vez só**, na G3-0312, e a G3-0141 ficou **sem UC nenhuma**. A duplicidade acabou; o número certo da G3-0141 continua faltando |
| **G3-0412** | tem UC (`000295713501257`) e **não está** entre as 39. Cadastrada no rateio em **28/07**; o último `conector_execucao` foi **28/07 22:57**, com status `parcial`. Não diagnostiquei qual das duas coisas explica — **confirmar no próximo ciclo** |

Consequência prática: hoje há **39 UCs digitáveis**, e o mapa cobre as 39 (mais essas duas, quando entrarem).

---

## 7. O que AINDA falta, e é insumo humano

O `scripts/cadastrar-originadores.ts` confere o lote inteiro antes de escrever e **aborta tudo** se um dígito verificador não fechar — de propósito: `classificar()` gravaria com `documento_validado = false` e não há R9 para originador.

**Faltam, para os três:**

1. **CPF ou CNPJ** — `documento` é `NOT NULL`, sem default, e o dígito é conferido. **Não há de onde derivar:** `financeiro.parceiros` tem 9 linhas, **nenhuma com coluna de documento**, e nenhum dos 9 nomes é um dos três (`Leal` e `Mushreds` são os dois com nome). Nenhuma das 8 views expõe documento de usuário do CRM;
2. **natureza `pf` ou `pj`** — "Out Sales" tem cara de PJ e as outras duas de PF, **mas isso é inferência minha, não medição.** O script recusa `pf` com CNPJ e `pj` com CPF, então o par tem de estar certo;
3. **confirmação do `tipo`** — §3. A semente do CRM sugere `vendedor_g3` para Renata e `terceirizado` para as outras duas;
4. **quem originou a G3-0154** — §4.

Dados bancários e PIX são opcionais no cadastro do originador, mas o repasse da comissão vai precisar deles.

### O arquivo, pronto menos o que falta

Copiar para `originadores.json` (fora do git — ver §8) e preencher os `<…>`:

```json
[
  { "nome": "Renata <sobrenome completo, como no documento>",
    "natureza": "pf", "tipo": "vendedor_g3",
    "documento": "<CPF>", "email": null, "telefone": null,
    "crm_partner_id": null, "chave_pix": null, "tipo_chave_pix": null,
    "banco": null, "agencia": null, "conta": null, "tipo_conta": null },

  { "nome": "Out Sales <razao social, se PJ>",
    "natureza": "<pf ou pj>", "tipo": "terceirizado",
    "documento": "<CPF ou CNPJ>", "email": null, "telefone": null,
    "crm_partner_id": null, "chave_pix": null, "tipo_chave_pix": null,
    "banco": null, "agencia": null, "conta": null, "tipo_conta": null },

  { "nome": "Jezielly Vieira <sobrenome completo>",
    "natureza": "pf", "tipo": "terceirizado",
    "documento": "<CPF>", "email": null, "telefone": null,
    "crm_partner_id": null, "chave_pix": null, "tipo_chave_pix": null,
    "banco": null, "agencia": null, "conta": null, "tipo_conta": null }
]
```

```bash
npm run originadores -- --ensaio  --auth-user <uuid> --arquivo originadores.json   # ROLLBACK, confere
npm run originadores -- --valendo --auth-user <uuid> --arquivo originadores.json   # COMMIT
```

---

## 8. Notas de execução

- **`originadores.json` vai conter CPF/CNPJ de pessoa real.** Foi acrescentado ao `.gitignore` em 29/07 — ele não estava coberto por nenhuma regra existente, e o repositório foi público até 25/07.
- **A `SPEC-002` R16 não colide com esta decisão hoje, e foi conferido:** a R16 manda a atribuição vir de `leads.partner_id`. Medido — das 28 linhas do rateio que casam com um ganho, **zero** têm `partner_id`; nos 80 ganhos, **um** tem, e é card do funil `Parceiros`, que a R14 já exclui, e ele **não tem `vendedor_origem`**. Os dois eixos nunca discordam sobre o dado de hoje. A R16 segue valendo para o dia em que um parceiro indicar uma venda.
- **Nada disto está no código, de propósito.** A regra *"originador = `vendedor_origem`"* é atribuição de operação sobre uma carteira nomeada, e 12 das 41 linhas **não são legíveis** pelas views — um derivador automático acertaria 28, erraria 12 em silêncio e pareceria completo. É o modo de falha que a sessão 12 corrigiu na tela de Contratos.
- **O eixo é reversível para contrato futuro e não para contrato fechado:** a R20-b congela o tier no `rascunhar`, e `contrato` não tem caminho de edição. "Até segunda ordem" vale para o que ainda não foi digitado.
