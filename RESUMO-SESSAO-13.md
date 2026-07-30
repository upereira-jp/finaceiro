# RESUMO-SESSAO-13 — 29/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Decidir a `Q-ORIGINADOR-01`, que a sessão 12 abriu vermelha na frente dos 39 contratos |
| **Método** | Conferir a premissa da decisão **antes** de gravar. Foi o que mudou a pergunta — e o que pegou uma conciliação inventada por mim antes de ela virar registro |
| **Resultado** | 2 questões fechadas, uma vermelha · 13 verificações novas (448 → 461) · 1 suíte nova · 1 medição que destrava a `Q-ATIVOS-01` · **nenhuma migration, nenhuma escrita em produção** |
| **Pendente desta sessão** | A **lista de originadores**. É insumo de operação, não decisão |

> # ESTADO ATUAL — 29/07/2026, fim da sessão 13
>
> | | |
> |---|---|
> | **No ar** | `https://financeiro.blackhaus.io` — sem alteração nesta sessão. O bundle em produção continua `index-DzZYJ0Ak.js`; **as mudanças de hoje ainda não foram publicadas** |
> | **Suíte** | **461 verificações**, 23 suítes, `EXIT=0` |
> | **Banco** | intacto. Zero migration, zero escrita — nem em ensaio |
> | **O que segura a primeira fatura** | os 39 contratos, e agora com o caminho inteiro pronto para digitá-los |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **Lista de originadores** — nome, natureza, tipo, CPF/CNPJ, e quem originou cada UC | **insumo** | Vinicius + operação |
> | `contrato_ativo` — 39 de 39 | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` — o que é "fatura cheia" | 🔴 | Vinicius |
> | `Q-WEBHOOK-01` — autenticação do webhook Sicoob | 🔴 | Vinicius |
> | `Q-SICOOB-01` — certificado A1 | 🔴 | Vinicius (externo) |
> | `ADR-0005` — onde mora o segredo | proposta | Vinicius |
> | `Q-AGENDA-01` — nenhum processo periódico existe | 🟡 | Vinicius |
> | ~~`Q-ORIGINADOR-01`~~ | ✅ | fechada hoje |
> | ~~`Q-PRONTIDAO-COMIS-01`~~ | ✅ | fechada hoje |

---

## 1. A decisão, e por que ela quase foi a outra

A `Q-ORIGINADOR-01` oferecia três saídas. O dono escolheu a **(a)** — cadastrar os originadores e exigir o campo. Mas o caminho até lá passou por duas correções de rota, e as duas valem registro.

**A primeira: a pergunta estava errada.** A questão como escrita perguntava se os 39 contratos *levam* originador. Ao ler o código para responder, apareceu um fato que ela não continha: `NovoContrato` **não aceita `faturas_cheias_pagas`**, e a coluna nasce em 0 por default do banco. Como a comissão paga na 1ª e na 2ª fatura cheia e zero da 3ª em diante, um contrato digitado hoje paga o ciclo inteiro nas duas primeiras faturas que **este sistema** emitir — independentemente de quando a venda aconteceu.

Isso desloca a pergunta. Não é *"levam originador?"*, é *"a comissão dessas vendas já foi paga?"*. Se já tivesse sido, preencher o campo pagaria de novo — 25% a 30% do consumo, em silêncio, que é o espelho exato do defeito que a questão denunciava.

**A segunda: a premissa da resposta não fechava — e a conciliação que escrevi para ela era invenção minha.** A resposta veio como *"sim, todas — entretanto nenhuma venda foi efetivada ainda, verificável em clientes ativos, assinatura"*. Medido no CRM antes de gravar qualquer coisa (`as_of` 29/07 17:31Z):

```
Clientes ativos - Assinatura / ATIVOS ........ 29 cards, 29 leads unicos
Rateio / Desconto Ativo             (won) .... 28
Vendas - Assinatura / Negocios Ganhos (won) .. 44
Parceiros / Parceiro ativo          (won) ..... 7
```

São 29 em ATIVOS, não zero.

Devolvido ao dono, a resposta foi direta: **"erro meu, realmente existem os clientes ativos"**. A premissa caiu inteira.

**O que sobrou de pé é a outra metade da resposta, e é só ela que sustenta a decisão:** ninguém recebeu comissão ainda. Logo o contador em 0 é o valor **correto**, e a comissão está inteira pela frente.

### O erro que quase virou registro

Entre a medição e a correção do dono, eu escrevi — em cinco lugares, incluindo dois comentários de código — que as duas afirmações conviviam **porque *"efetivada"* ali significaria "faturada por nós"**.

**Ninguém disse isso.** Foi dedução minha para fazer duas frases incompatíveis caberem juntas, e ela ficou escrita com a mesma cara de um esclarecimento do dono. Se tivesse sobrevivido ao commit, o repositório passaria a afirmar como fato conciliado algo que era invenção — e a `Q-ORIGINADOR-01` apareceria na §9 apoiada numa medição que não a apoia.

O conserto não é só apagar a frase. **É dizer em que a decisão se apoia de verdade:**

| | |
|---|---|
| **Medido** | `fatura`, `boleto` e `liquidacao` em **0** — este sistema nunca cobrou ninguém |
| **Medido** | 29 clientes ativos no CRM, 28 com desconto ativo — e isso **não diz nada** sobre comissão: cliente ativo significa que ele recebe crédito, não que alguém foi comissionado pela venda dele |
| **Testemunho** | **ninguém recebeu comissão ainda** — e é isto, sozinho, que autoriza preencher o originador dos 39 |

Não há consulta que confirme ou desminta a terceira linha: nem o financeiro nem o CRM registram comissão paga por fora. **A decisão continua a mesma; a base dela encolheu** — era medição-mais-testemunho, é só testemunho. Está escrito assim nos dois comentários de código, para que quem mexer nisso saiba o que está apoiando o quê. Se o testemunho mudar, a regra muda junto: preencher o originador de uma venda já comissionada paga a mesma comissão **duas vezes**.

---

## 2. O que a decisão determinou, e o que ela deliberadamente não determinou

**Determinou** que o campo é obrigatório na tela. `web/src/contrato-regras.ts` — puro, sem React — porque o runner do `web/` é `node --experimental-strip-types`, que não lê JSX: regra dentro de um `.tsx` é inalcançável por teste, e a regra 8 diz que invariante sem teste é comentário. O botão trava, e a trava se **nomeia** (`motivoDaTrava`), para a tela poder dizer por quê em vez de só ficar cinza.

**Não determinou** que `originador_id` vire `NOT NULL`. Contrato sem comissão é estado legítimo do domínio, e a constraint decidiria por **todo tenant e todo contrato futuro** uma pergunta que foi respondida sobre 39 contratos desta carteira. No lugar da prevenção entrou detecção — a camada nova da prontidão —, que é a mesma escolha que o `CAT-8` fez para o `rls_auto_enable`.

A tela também ganhou o que faltava para o estado de hoje: **produção tem zero originadores**, e antes o select ficava em "—" sem explicação nenhuma. Agora diz que não há nenhum cadastrado e aponta o caminho. O erro de *leitura* tem aviso próprio e vem antes — lista vazia por falha não é lista vazia por ausência, que é a lição da sessão 12 aplicada em outra casa.

---

## 3. A décima camada da prontidão

A `Q-PRONTIDAO-COMIS-01` dizia: *"se a carteira legada não tem comissão, o `nao_medido` está certo e nada muda; se tem, falta uma contagem que acuse contrato ativo sem originador."* Tem. Era a contagem.

`originador_do_contrato` conta contrato ativo com `originador_id` nulo sobre o universo dos contratos ativos, com `efeito: bloqueia_split`. Entra **antes** da `regra_de_comissao` porque sem originador não há tier congelado, e sem tier aquela camada não tem o que medir — a ordem das camadas é a ordem em que o trabalho destrava o próximo.

Os dois estados que apareciam como o mesmo `?` agora se distinguem:

| Situação | `originador_do_contrato` | `regra_de_comissao` |
|---|---|---|
| nenhum contrato | `nao_medido` | `nao_medido` |
| contratos, nenhum com originador | **`pendente`** | `nao_medido` |

A `regra_de_comissao` **não mudou de cálculo** — mudou de explicação: quando o vazio dela é consequência da camada de cima, ela diz isso.

**Uma marca ficou desconfortável e está registrada como tal.** `bloqueia_split` é documentado como *"deixa faturar e trava a repartição"*, e aqui o split **não trava** — ele roda, fecha em zero de comissão e não levanta. A marca vale porque o efeito sobre `pode_repartir` é o mesmo, e porque a alternativa era uma marca nova cujo único conteúdo seria "é pior que as outras". O comentário do tipo agora diz isso em vez de deixar a imprecisão implícita.

---

## 4. O teste que estava errado, e o que ele ensinou

A primeira versão do `K18f` afirmava **"2 de 3"**, lido da fixture: dos três contratos que ela cria, só o de `ucOk` tem originador. Falhou com **"3 de 4"** — os testes que rodam antes criam contrato, e a fixture não é o estado.

Consertar o número não teria consertado o teste: ele quebraria de novo no dia em que alguém acrescentasse um caso acima, e **a camada pareceria a culpada**. A camada passou a ser conferida contra a **tabela**, na mesma condição — se ela contar diferente do que o banco tem, é ela que está errada.

E a segunda tentativa também falhou, por um motivo que vale mais que o primeiro: a consulta de conferência usava `prisma.$queryRaw` em vez de `db()`. O contexto de tenant é emitido **dentro** do `$transaction`, no client de transação; pelo client de fora não há `app.current_tenant_id` e a RLS devolve **zero linhas**. O teste disse *"0 de 0"* achando que tinha medido.

É a regra 3 acontecendo dentro do próprio teste que existe para prendê-la: **o modo de falha é resultado vazio, não erro de permissão.** Está escrito no código, ao lado da consulta.

---

## 5. O que NÃO foi feito, e por quê

| O quê | Por quê |
|---|---|
| **Nenhum originador cadastrado** | Falta o insumo. `documento` é `NOT NULL` e é CPF/CNPJ de pessoa real, `tipo` decide a alíquota, e o CRM não é fonte disto — `financeiro.parceiros` tem 9 linhas e nenhuma coluna de documento |
| **Nenhum contrato digitado** | Depende do acima. O caminho está pronto dos dois lados |
| **Nada publicado em produção** | O `web/` mudou e o bundle no ar ainda é o anterior. O deploy é o ciclo do `RESUMO-SESSAO-11` §12, e é decisão de quando |
| **`originador_id` não virou `NOT NULL`** | §2 — a decisão foi sobre 39 contratos, não sobre o domínio inteiro |
| **`Q-AGENDA-01` não construída** | Mesma razão da sessão 12: só rodaria contra o adaptador falso |
| **Nada mexido no CRM** | Regra 4. A leitura de hoje foi pelo conector de análise, read-only, e não pelo financeiro |
| **Nenhuma migration** | O schema não mudou. A decisão foi de tela e de relatório |

---

## 5b. O funil `Clientes ativos` não está mais vazio — e isso destrava uma medição

Efeito colateral de ter medido o CRM pela `Q-ORIGINADOR-01`, registrado pela regra 10.

A **`Q-ATIVOS-01`** está escrita sobre um zero: em 27/07 o funil `Clientes ativos - Assinatura` estava vazio porque a etapa-fonte do Rateio tinha `stage_type='normal'` e não disparava a automação. O argumento para não mexer no conector era esse — *"mudar o comportamento agora seria implementar contra um estado futuro, e desfazer sem teste possível a classificação que a medição do dev justificou"*.

**Medido hoje: 29 cards em ATIVOS.** A alternativa (a) da própria questão pedia *"corrigir o `stage_type` … e então medir o funil populado antes de mexer na §4.3"*. O funil está populado. O estado deixou de ser futuro, e o argumento de espera caducou.

**O que continua em aberto é o mérito, não o dado:** 29 cards não dizem se essa população é *fonte de verdade do cliente ativo* ou a *cópia derivada* que o dev descreveu em 26/07 como apagada rotineiramente pelo sync. A §4.3 do conector hoje a trata como cópia — ou seja, **ignora exatamente esses 29**. Se a leitura certa for a outra, o conector está ignorando a população que deveria ler.

Nada foi alterado no conector. A decisão (b) da `Q-ATIVOS-01` tem dono, e agora pode ser tomada contra dado em vez de contra ausência de dado.

---

## 6. Uma inconsistência achada e NÃO corrigida

O `QUESTOES.md` §3 lista o **Item 10** como 🔴 aberta — *"Comissão a sócia é despesa dedutível ou distribuição de lucro? Renata concentra 39 de 48 ganhos (83%)"* — e conta no placar da F0 como uma das quatro vermelhas do contador.

Mas a §9 registra que a **PAUTA 7** respondeu exatamente isso em 28/07: *"a comissão da sócia é COMISSÃO, despesa dedutível como a dos demais"*.

A linha da §3 é registro que não foi atualizado, não uma contradição de mérito. **Não foi editada** porque mexe no placar de uma fase, e o placar de fase tem dono. Fica aqui nomeada para quem for atualizar.

Apareceu porque a decisão de hoje encosta nela: se Renata é a originadora da maior parte das 39, cadastrá-la faz o split pagá-la — e é bom que a resposta fiscal já exista.

---

## 7. O que muda para quem digita os 39

Nada do que já estava planejado, mais uma exigência e um aviso:

1. **cadastrar os originadores primeiro** — `npm run --silent originadores -- --modelo > originadores.json`, preencher, `--ensaio`, conferir, `--valendo`;
2. **a tela agora exige o originador** em cada contrato, e diz por quê enquanto o campo estiver vazio;
3. se alguém abrir a tela antes do passo 1, ela diz que não há originador cadastrado e aponta o comando — em vez de um select vazio sem explicação;
4. a prontidão passa a acusar qualquer contrato ativo que tenha escapado sem originador.
