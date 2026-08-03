# RESUMO-SESSAO-18 — 03/08/2026

| Campo | Valor |
|---|---|
| **Foco** | As quatro perguntas que travavam trabalho caro foram feitas ao dono e **respondidas**. Três viraram construção no mesmo dia; a quarta virou pedido ao dev do CRM |
| **Método** | Medir antes de construir — e a medição achou **mais do que a pergunta pedia** nas duas vezes em que foi feita. A §1 e a §3 são isso |
| **Resultado** | 2 questões fechadas · 4 abertas · **1 defeito de produção** que apagaria dado que ninguém tinha preenchido ainda · migration 22 · **13ª tela** · 1043 → **1106 verificações** |
| **Não feito** | Migration 22 **não aplicada em produção**, e é decisão de quando. Nenhuma fatura gerada — continua sendo insumo humano |

> # ESTADO ATUAL — 03/08/2026
>
> | | |
> |---|---|
> | **Banco** | **22 migrations**; a 22 (`contas_a_pagar`) **só em banco de teste**. Produção segue com 21 |
> | **Suíte** | `EXIT=0`, **1106** linhas `ok`. Delta **63**, contado na fonte (`grep -c "chk('"`) e conferido contra o delta do `npm test`: diferença zero |
> | **No ar** | inalterado. Continua faltando publicar `3fd7b22`, e agora também esta sessão |
> | **O que segura a primeira fatura** | continua sendo insumo humano, e a ordem não mudou |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **Preencher o dia de vencimento das 39 UCs** | 🔴 **destravável hoje** — o importador existe | Vinicius + operação |
> | **Enviar `PROMPT-dev-crm-rodada5` ao dev do CRM** | 🔴 **destrava o eixo do originador** | Vinicius |
> | **CPF/CNPJ dos originadores** · `contrato_ativo` 0 de 39 | 🔴 | Vinicius + operação |
> | **`Q-CLIENTEDUP-01`** — 84 linhas de cliente para 41 pessoas | 🔴 **nova** | Vinicius + dev do CRM |
> | **`Q-PAGADOR-01`** — boleto sairia sem CPF e sem endereço | 🔴 **nova** | Vinicius + operação |
> | `Q-FATCHEIA-01` · `Q-WEBHOOK-01` · `Q-SICOOB-01` | 🔴 | Vinicius |
> | ~~`Q-SPEC001-02`~~ · ~~`Q-PAGAMENTO-01`~~ | ✅ | fechadas hoje |

---

## 1. O defeito que a pergunta encontrou sem procurar

O dono respondeu que o dia de vencimento **varia por cliente/UC**. Isso mandava construir um importador por planilha. Ao procurar **onde** o valor seria gravado, apareceu **quem o apaga**.

`src/crm/sincronizacao.ts` levava `data_vencimento` dentro do objeto `espelho`, e o `espelho` vai para o `updateMany`. Medido no dia: `financeiro.rateio_clientes` traz **41 linhas e `data_vencimento` NULL em 41**.

**Preencher os 39 vencimentos e rodar `npm run ciclo` apagaria os 39.** Sem erro, sem log e sem recusa — o `mudou` acusaria a diferença entre o valor local e o `NULL` do CRM, e o update gravaria `NULL` de volta.

**E o sintoma chegaria um passo adiante, apontando para o lugar errado:** a composição do lote recusaria tudo por `sem_vencimento`, e o motivo pareceria *"a operação não preencheu"*.

A `SPEC-001` §3.3 já registrava *"100% vazia no CRM"* desde o `P8` §5 — **registrava o fato e não tirava a consequência**. É a mesma classe da `Q-ESCOPO-01` da sessão 16: o corpo datado está certo, e ninguém fez a pergunta seguinte.

Conserto pela **R25 nova da `SPEC-002`**: campo local, o usuário vence (R5), e divergência vira sinal em `conector_execucao.detalhe` — a forma da R21-b, que já existia no mesmo arquivo para `distribuidora`. **O `N55` falha contra o código anterior**, e é o registro executável do defeito.

Duas diferenças em relação à R21-b, deliberadas: o sinal roda **também na criação** (a R21-b não confere no nascimento por não ter segunda fonte; aqui tem), e só dispara quando o CRM tem valor **e** ele difere — CRM vazio contra UC preenchida é o caso normal de hoje, 41 de 41, e anunciá-lo cuspiria 39 sinais por rodada.

---

## 2. As quatro respostas, e o que cada uma virou

| Pergunta | Resposta do dono | O que virou |
|---|---|---|
| Quem recebe comissão: quem vendeu ou o responsável do card? | *"O CRM foi alterado nesse sentido, peça uma pequena auditoria para o DEV do CRM"* | **`PROMPT-dev-crm-rodada5-2026-08-03.md`.** A questão **não fecha** — o eixo não se decide olhando o que as views dizem hoje |
| Onde mora o estado de pagamento do repasse? | **`conta_pagar` completa, como o PRD §4.4 desenha** | **Migration 22**, repo, 12 rotas, 13ª tela. §3 |
| Qual o dia de vencimento das 39 UCs? | *"não identifiquei essas 39 UCs, verifique isso corretamente. Mas a resposta seria que varia"* | A medição da §4 + o importador `npm run vencimentos` |
| Por onde construir agora? | Fatia de quitação + o que destrava a 1ª fatura | Foi o que se fez, nessa ordem |

---

## 3. `conta_pagar`, e o que o banco passou a impedir

O `PRD` §5.5 manda **quatro** escritas na transação do split; o código fazia **duas**. O sistema sabia ao centavo quanto devia ao dono da usina e ao originador, e **não tinha onde registrar que pagou**.

A janela fechava na primeira liquidação. `split_item` tem **0 linhas**, então ela ainda estava aberta.

**Quatro coisas passaram a ser impossíveis por construção, e nenhuma depende de alguém conferir:**

| O quê | O mecanismo |
|---|---|
| pagar a mais | `CHECK conta_pagar_nao_paga_demais` — exercitado por `INSERT` direto, não só pela aplicação |
| provisionar o mesmo `split_item` duas vezes | índice único **cheio** sobre coluna **gerada** `coalesce(origem_split_item_id, id)` |
| mudar o valor de uma conta nascida de split | gatilho — `CHECK` não vê o valor anterior |
| apagar a prova de que alguém foi pago | `DELETE` revogado em `pagamento` e `conta_pagar` |

**O segundo merece nota, porque é a regra 11 numa direção nova.** O caminho óbvio seria `UNIQUE (tenant_id, origem_split_item_id) WHERE ... IS NOT NULL`. Ele é **proibido**: cobre exatamente as colunas da FK, e o `db pull` do Prisma 7.9 ignora o predicado e infere uma relação **to-one** — a armadilha que devolveu um contrato de R$ 111,00 onde o vigente valia R$ 789,00. O `CAT-1` acusaria.

O conserto é o que a própria regra prescreve: *"coluna gerada e índice único cheio sobre um conjunto que não é o da FK"*. Conferido depois: a relação saiu **`conta_pagar[]`** no `schema.prisma`, e não `conta_pagar?`.

**A coluna `Corporativo` da matriz do PRD §3 passou a existir no código.** Até hoje não havia entidade dela para governar. Usar o `ler` global daria ao papel `cobrança` — que tem **traço** naquela coluna — a lista de quanto a empresa deve a cada dono de usina.

**O que não entrou, e a lista importa tanto quanto a do que entrou:** nove das treze entidades do PRD §4.4. `conta_receber` ficou de fora porque a **`fatura` já é** o título a receber, e uma segunda tabela criaria duas verdades sobre o mesmo fato. As outras oito são fluxo de caixa, conciliação e cartão — e o critério de corte foi um só: **entrou o que impede pagar duas vezes o mesmo repasse, porque só isso tinha prazo.**

---

## 4. As 39 UCs existem — e a medição achou três coisas que ninguém tinha nomeado

O dono não reconheceu o número. As 39 existem, todas ativas, todas com usina e rateio, **0 com vencimento**. A lista sai por `npm run vencimentos -- --modelo`.

Mas a mesma consulta trouxe três achados:

**1. Há 84 linhas de `cliente` para 41 pessoas — `Q-CLIENTEDUP-01` 🔴.** 84 `crm_lead_id` distintos, **41 nomes distintos**: cada pessoa aparece em 2 a 4 linhas, porque o CRM tem um lead por card e o espelho é fiel (R6). **O faturamento funciona** — as 39 UCs estão em 39 linhas distintas, e a UC carrega a identidade. O que quebra é o passo seguinte: `documento` é NULL nas 84, e `cliente_documento_unico` é único por tenant. **No dia em que a operação digitar o CPF do Ataíde na segunda linha dele, o banco recusa com `23505`** — no meio da digitação, sem caminho óbvio.

**2. O boleto sairia sem CPF e sem endereço do pagador — `Q-PAGADOR-01` 🔴.** `cliente.documento` é NULL nas 84 e os **seis** campos `endereco_*` da UC estão vazios nas 39. `src/repos/boleto.ts:164` manda `documento: uc.cliente.documento ?? ''` — **o `?? ''` é a questão**: sem guarda, a Sicoob recebe um pagador sem identificação e a recusa vem do outro lado, traduzida em 502, onde a mensagem útil já se perdeu.

**3. O CRM se moveu de novo, e desta vez para melhor em parte.** As 41 linhas do rateio agora **casam com um ganho** (eram 28 em 29/07 e 40 em 30/07). Mas os dois eixos divergem em **13 das 41 UCs**, que somam **6.855,6 kWh/mês dos 29.896,2** — 23% da carteira. E apareceu um nome novo, `Kallina Tandara`, só no eixo `responsavel_atual`. É o conteúdo da rodada 5.

---

## 5. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Pus `SECURITY DEFINER` num gatilho que escreve** | teste `G4` | O invariante 19 diz que todo `SECURITY DEFINER` do projeto é **leitura sem policy**. O meu **escreve** — e com ele o `UPDATE` contornaria a RLS de uma tabela de dinheiro a pagar. A lista branca não foi tocada: é o mesmo argumento da migration 15, *"o custo de obedecer é uma linha"* |
| **O `CASE` do gatilho resolvia para `text` contra coluna enum** | teste `P2b`, `42804` | Ramos `unknown` viram `text` no Postgres. Cast explícito |
| **Formatei dinheiro com `toFixed` fora do `emReais`** | teste `C4c` | Imprimia `1000,00` onde o resto do sistema diz `R$ 1.000,00`. Duas formatações na mesma tela é como duas telas passam a discordar — e aqui a discordância apareceria na frase que explica por que o botão travou |
| **Escrevi `/R$ 1.000,00/` como regex** | o mesmo `C4c`, de novo | `$` é âncora de fim de string e `.` casa qualquer caractere: a verificação ficou vermelha **depois** de eu já ter consertado o que ela existia para pegar |
| **O `--modelo` escrevia o CSV no stdout** | rodei e olhei o arquivo | `iniciar()` imprime duas linhas antes de qualquer consulta, e o CSV nascia com elas no topo — o próprio importador o recusaria depois, dizendo que falta `;` na linha 1. `--saida` passou a ser obrigatório |
| **Comparei `Date` com `String(d).slice(0,10)`** | `N55` | Dá `"Mon Aug 10"`, não `"2026-08-10"`. A verificação ficou vermelha por si mesma **depois** de o conserto do conector já estar certo — dois minutos perdidos achando que o conserto não pegara |

---

## 6. O que muda para quem opera amanhã

1. **O dia de vencimento das 39 UCs entra por planilha**, e o modelo sai preenchido:
   `npm run vencimentos -- --modelo --auth-user <uuid> --saida vencimentos.csv`, preencher a coluna `dia_vencimento`, depois `--ensaio` e `--valendo`. O ensaio imprime **antes → depois** de cada UC e avisa quais caem no dia 29–31;
2. **rodar `npm run ciclo` não apaga mais o vencimento** — e antes de hoje apagaria;
3. **existe a tela Contas a pagar**, a 13ª. Ela fica vazia até a primeira fatura ser liquidada, e isso é o estado certo — ela diz;
4. **o papel `cobrança` recebe 403 nessa tela.** Não é defeito: é a coluna `Corporativo` da matriz do PRD §3 funcionando pela primeira vez;
5. **a migration 22 não está em produção.** Aplicá-la é `npx prisma migrate deploy` pelo `DIRECT_URL`, e depois `db pull` + `generate` + `web:build` + `restart` — sem o `generate`, o servidor **recusa subir**, o que é a troca deliberada da sessão 16.
