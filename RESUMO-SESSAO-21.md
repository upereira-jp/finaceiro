# RESUMO-SESSAO-21 — 05/08/2026

| Campo | Valor |
|---|---|
| **Foco** | **Os dois últimos insumos em massa ganharam importador** — contratos e endereço do pagador —, o **`ADR-0005` foi decidido** e a **`Q-WEBHOOK-01` ganhou desenho** |
| **Método** | Medir antes de construir, e **medir o que o outro lado expõe** antes de supor. As duas coisas pagaram: uma tirou uma questão vermelha do caminho crítico, a outra respondeu metade de um ADR |
| **Resultado** | **1343 → 1531 verificações** · `EXIT=0` · **0 migrations pendentes** · nada escrito em produção |
| **Não feito** | O `src/sicoob/http.ts`, **de propósito** — ver §5. E os cinco insumos humanos, que continuam sendo insumo humano |

> # ESTADO ATUAL — 05/08/2026, fim da sessão
>
> | | |
> |---|---|
> | **Banco** | **24 migrations em produção = 24 no repositório.** Nenhuma pendente |
> | **Suíte** | `EXIT=0`, **1531** linhas `ok`. Delta **188** na sessão, contado na fonte e conferido contra o `npm test`: diferença zero nas duas medições |
> | **Produção** | intocada. Nenhuma escrita nesta sessão |
> | **Publicação** | **6 commits fora do `origin/main`.** Nenhum traz migration, **nenhum toca rota ou SPA** |
>
> **A fila está em `PENDENCIAS-2026-08-05.md`** — é o arquivo a abrir primeiro, e ele é ordenado por *o que destrava o quê*.

---

## 1. Os dois importadores que faltavam

O projeto tinha importador para usina, originador, tarifa, vencimento e documento. **Faltavam os dois que estavam no caminho crítico.**

### 1.1 `npm run contratos` — e a razão não é velocidade

**`contrato` não tem edição.** A R20-b congela `originador_tipo_no_fechamento` no `rascunhar`, e nem originador, nem data de fechamento, nem valor mudam depois — o conserto é `encerrar` + `renovar`, que abre linha nova, zera `faturas_cheias_pagas` e deixa na trilha uma renovação que não houve comercialmente. **Vinte e nove atos irreversíveis precisam de um ponto em que sejam revisáveis de uma vez**, e esse ponto é o arquivo.

O modelo sai preenchido pelo **crédito congelado do CRM**, pelo leitor fechado da `SPEC-002` R1: `ganho_em` → data de fechamento, `consumo_reais` → valor, **41 de 41**. Rodado contra produção: 41 linhas, 29 marcadas `sim`, e **o arquivo é recusado inteiro** enquanto não houver originador cadastrado — que é o comportamento certo.

**O que ele impede, e não estava impedido em lugar nenhum: o rascunho órfão.** `rascunhar` aceita cliente sem documento e `ativar` recusa (R9). A sequência ingênua gravaria uma linha que **não ocupa a UC, não fatura e não aparece em recusa nenhuma** — e a rodada seguinte gravaria outra. A pré-checagem usa `podeAtivarContrato`, a **mesma** função que `ativar` chama: duas condições seriam duas regras.

**A conferência é por LINHA e não por lote**, ao contrário do importador de documentos. Lá a escrita parcial é irreconstruível; aqui não é — as que passam viram contrato, as que não passam ficam intactas, e reimportar depois grava só o que falta. Abortar tudo por uma linha faria os 24 esperarem a `Q-CLIENTEDUP-01`.

### 1.2 `npm run enderecos` — um insumo que não estava em lista nenhuma

Achado percorrendo a cadeia do **boleto**, que é outra que a da fatura. `boleto.ts` monta o pagador com os seis campos de endereço da UC: **vazios em 29 de 29**, e **nenhuma das 10 views do CRM expõe endereço** — mesma forma do documento do cliente.

**Conferido antes de construir, e o resultado foi negativo — que era o ponto:** o conector **não** escreve `endereco_*`. O objeto `espelho` de `espelharUnidades` tem `cliente_id`, `usina_id`, `percentual_rateio`, `crm_usina_cliente_id` e as três de `rateio_*`, e mais nada. Preencher e rodar o ciclo **não apaga** — que era exatamente o defeito que a R25 corrigiu para `data_vencimento` em 03/08.

**Endereço é o único insumo do projeto que pode estar pela metade** — cinco campos e um vazio —, e uma UC assim não é *pronta* nem *vazia*. Sem essa distinção o relatório mandaria procurar endereço que já existe.

---

## 2. Duas medições que encolheram o caminho crítico

**Nenhuma das duas foi decisão. As duas estavam no índice e não no corpo datado** — quarta vez que essa classe aparece.

**A `Q-PARCERIA-01` saiu do caminho das 29.** Ela travava a digitação porque três vendas trazem vendedor **e** parceiro, e o contrato guarda um. Medido: as três UCs do Edimar estão **as três `nao_ativado`**, na usina `04`. Conferido pelo outro lado, que é o que fecha: os **29** créditos vigentes das 29 UCs faturáveis têm **`parceiro_id` nulo em 29 de 29**. Ela **continua vermelha** e volta a travar quando o CRM ativar aquelas três.

**São dois originadores, não três.** Pelo crédito vigente das 29: **Renata 26, Out Sales 3**. A Kallina Tandara tem 1 UC, entre as 12 que não faturam.

---

## 3. `ADR-0005` decidido, `ADR-0006` escrito

**O `ADR-0005` foi aceito na Opção A** — Supabase Vault + resolvedora `SECURITY DEFINER` amarrada ao tenant, trilha na mesma transação, A1 em base64 que nunca toca o disco. Estava parado como Proposta desde 28/07, e era **o único bloqueio da F2 que não dependia de ninguém de fora**. Destrava *escrever* o `src/sicoob/http.ts`; não destrava a F2. Nada foi implementado.

**O `ADR-0006` desenha a `Q-WEBHOOK-01`, e ela nomeava três decisões acopladas — são quatro.** A quarta apareceu percorrendo o caminho de **escrita** em vez de reler a rota: **webhook não tem usuário**. `contexto.ts:79` exige `usuarioId` em UUID, `liquidacao.baixar` exige `escrever_carteira`, e a regra 9 exige *quem*. Reusar o `auth_user_id` de uma pessoa — que é o que os scripts fazem — faria a trilha dizer que o dono baixou uma fatura às 3h da manhã. **Trilha que mente é pior que trilha ausente.** A proposta é usuário de serviço por tenant, sem caminho de login.

**Não decidi nenhuma das quatro.** Têm dono nomeado.

---

## 4. A leitura que respondeu metade de um ADR

O `ADR-0006` §2 dizia que o que governa a decisão é o que a Sicoob suporta, e nomeava *ler a documentação* como pré-requisito. **Ler não dependia de ninguém.**

**Metade caiu.** O lado de saída ficou medido — base de produção e sandbox, OAuth2 em Keycloak, `Authorization: Bearer` mais `client_id`, certificado ICP Brasil por CNPJ — e os **três verbos da porta** têm caminho: `POST /boletos`, `GET /boletos`, `POST /boletos/{nossoNumero}/baixar`. Tudo em **`SICOOB-contrato-medido-2026-08-05.md`**.

**A outra metade não é "não medida", é "não pública":** sobre como a Sicoob autentica a chamada ao *nosso* endpoint não há nada. **A diferença é de destinatário** — deixou de ser leitura pendente e virou **pergunta ao suporte**.

**E a §2 do ADR foi reescrita no mesmo dia**, porque deixar o parágrafo *"nenhuma linha da documentação foi lida"* acima da medição seria a mesma classe que o `PATCH-citacoes` tratou.

**Dois achados de lado, e o segundo vale dinheiro:**

- o `pagador` deles tem **`endereco` em uma string só** (concatena o adaptador), `cep` sem máscara e `uf` de duas letras — que é exatamente o que o importador de 1.2 normaliza. E **`email` está no payload deles e não no nosso tipo `Pagador`**;
- **`valor` é decimal, não centavos.** A API recebe e devolve reais com casas como número JSON, e todo o sistema é `Int` em centavos pela regra 1. A conversão é fronteira de adaptador e tem de ser **por texto nos dois sentidos** — `centavos.ts` tem `reaisParaCentavos` e **não tem a volta**.

---

## 5. O que eu decidi NÃO fazer, e por quê

**O `src/sicoob/http.ts` é escrevível hoje** — os três verbos, o corpo, a resposta e os erros estão medidos. **Não o escrevi**, por três razões:

1. **`Q-PECA-NAO-PLUGADA-01`.** *"Peça pronta que ninguém plugou"* é padrão que este repositório registrou como classe a procurar. Um adaptador completo que **nada pode chamar** — sem credencial, sem cofre povoado, sem resolvedora — é isso, com o agravante de parecer pronto;
2. **os campos de identidade não estão medidos.** `numeroCliente`, `numeroContratoCobranca` e `codigoModalidade` vêm com o contrato do cooperado e **não se derivam** de `conector_cobranca`. A primeira chamada real corrige alguma suposição, e escrever agora é escrever duas vezes;
3. **não há como exercitá-lo.** Testado só contra fixture copiada de documentação de terceiro, ele prova que o código faz o que eu li — não que a Sicoob aceita.

**O que destrava:** a credencial de **sandbox**. É mais barata que o A1 de produção e transforma aquele arquivo em código exercitável no mesmo dia.

---

## 6. Erros meus desta sessão

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Deixei um resto de edição dentro do `MODELO_DE_ENDERECOS`** | reler antes de rodar | Um `.replace(/^.*$/, '')` sobre string com `\n` — que **não casa** em JS sem a flag `m`, então a linha lixo teria ficado no modelo. Removido |
| **`as any[]` fora do `)` do `withTenant`** | o `tsc` | Erro de sintaxe, barato. Registrado porque foi o mesmo descuido de copiar a forma do importador vizinho sem olhar o fecho |
| **Dois CPFs de fixture com dígito errado** | a verificação `L2d`, vermelha | `originadorRepo.criar` não exige dígito e aceitou; `editar` de cliente exige, e não validou. **A suíte pegou** — e o teste estava certo, não a fixture |
| **Contei 24 pessoas e depois 29 na mesma medição** | conferir os dois números | Os dois estão certos e medem coisas diferentes: **29 linhas de cliente** para **24 pessoas** (cinco duplicatas). A imprecisão era minha ao nomear |
| **Escrevi "o que a Sicoob exige não está medido" e medi horas depois** | a própria leitura | O comentário em `planilha-enderecos.ts` foi corrigido no mesmo dia. É a classe do índice vencido, cometida por mim em vez de herdada |

---

## 7. Para quem abrir a próxima sessão

**Abra `PENDENCIAS-2026-08-05.md` primeiro.** Ele tem o estado medido e a fila ordenada por dependência.

**O caminho mais curto para a primeira fatura**, e nenhum passo é código:

1. **chave Pix** (identidade de cobrança) — só do dono, e é o único meio de pagamento que não espera o A1;
2. **CPF/CNPJ de 24 pessoas** + **dia de vencimento de 29 UCs** + **CPF/CNPJ de 2 originadores** — em paralelo, os três modelos já gerados;
3. `npm run contratos -- --ensaio`, conferir linha a linha, depois `--valendo`;
4. escolher a competência: **2026-06 sai com 28 das 29 sem lançar nada**; 2026-07 sairia com 9.

**Para o boleto**, duas ações baratas e independentes: **pedir a credencial de sandbox** da Sicoob (destrava o `http.ts` no mesmo dia) e **perguntar ao suporte como o webhook autentica na entrada** (destrava a Decisão 1 do `ADR-0006`).

**Duas coisas para não fazer:** não escreva o `src/sicoob/http.ts` antes da credencial de sandbox — ver §5 —, e **não digite contrato para as três UCs do Edimar** antes da `Q-PARCERIA-01`, mesmo que elas sejam ativadas no CRM.
