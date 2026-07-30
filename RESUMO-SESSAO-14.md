# RESUMO-SESSAO-14 — 29–30/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Duas coisas que o dono trouxe: o **eixo do originador** (`vendedor_origem`) e a pergunta *"não ficou explícito como gerar boletos e relatórios"* |
| **Método** | Medir antes de construir, e medir o que o **próprio sistema** faz. A segunda pergunta virou uma varredura do caminho de cobrança ponta a ponta — e a resposta era que o backend estava inteiro e a tela parava no meio |
| **Resultado** | 2 migrations em produção · 3 telas novas + 1 aba de documento · 8 rotas (78 → 86) · **571 verificações** em 27 suítes · 3 questões novas, todas com dono |
| **Pendente desta sessão** | O **desenho do QR**, o **teste de integração do `repos/documento.ts`** e a **logo no payload do CRM**. As três estão nomeadas na `Q-DOCFATURA-01`, não escondidas |

> # ESTADO ATUAL — 30/07/2026
>
> | | |
> |---|---|
> | **No ar** | `https://financeiro.blackhaus.io` — **o bundle em produção é o de 29/07 (`index-DzZYJ0Ak.js`)**. Nada desta sessão foi publicado |
> | **Banco** | **20 migrations**, as duas últimas aplicadas hoje. Catálogo **8/8 contra produção**, duas vezes. Três tabelas novas, todas vazias |
> | **Suíte** | **571 verificações** em 27 suítes, `EXIT=0`. A contagem agora é `npm test \| grep -c '^ok '` — reproduzível, ao contrário das anteriores |
> | **O que segura a primeira fatura** | os 39 contratos, e agora com **três originadores nomeados** e o caminho de cobrança inteiro na tela |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **CPF/CNPJ dos três originadores** — e a natureza pf/pj | **insumo** | Vinicius + operação |
> | `contrato_ativo` — 39 de 39 | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` — o que é "fatura cheia" | 🔴 | Vinicius |
> | `Q-WEBHOOK-01` — autenticação do webhook Sicoob **e do CRM** | 🔴 | Vinicius |
> | `Q-SICOOB-01` — certificado A1 | 🔴 | Vinicius (externo) |
> | `ADR-0005` — onde mora o segredo | proposta | Vinicius |
> | **`Q-DOCFATURA-01`** — as 5 decididas; sobram QR, teste do repo e logo do CRM | 🟡 | Vinicius |
> | **`Q-ORIGVEND-01`** — o eixo decidido; falta o insumo humano | 🟡 | Vinicius + operação |
> | `Q-AGENDA-01` — nenhum processo periódico existe | 🟡 | Vinicius |
> | ~~`Q-PRISMA11B-01`~~ | ✅ | fechada hoje |

---

## 1. O originador é o `vendedor_origem`, e a medição sustentou o dono contra uma recomendação antiga

A decisão veio como *"o originador vai ser o `vendedor_origem` até segunda ordem"*. Medido antes de escrever qualquer coisa, pela role `financeiro_ro` (read-only, só as views — regra 4):

```
vendedor_origem em 80 ganhos ....... Renata 49 · Out Sales 29 · Jezielly 1 · 1 nulo
responsavel_atual, mesmo universo .. Renata 43 · Jezielly 28 · Out Sales 7 · Kallina 1
divergem no MESMO ganho ............ 43 de 80
```

O `RESUMO-SESSAO-3` §121 tinha registrado a recomendação **contrária** — *"`responsavel` paga, `vendedor_origem` só registra"*. O que decide não é a contagem, é o **porquê** da diferença: nos 15 cards do funil `Rateio`, o `responsavel` é `Jezielly Vieira` em **15 de 15**, com o `vendedor_origem` variando. Ali `responsavel` é dono operacional do card, não quem vendeu — pagar por aquele eixo pagaria 28 vendas a quem processou o cadastro.

**A recomendação da sessão 3 fica superada por medição, não por preferência.** E a `SPEC-002` R16 (atribuição por `partner_id`) foi conferida: das 28 linhas do rateio que casam com um ganho, **zero** têm `partner_id`. Os dois eixos nunca discordam sobre o dado de hoje.

### O que a decisão não resolve, e é o motivo da `Q-ORIGVEND-01`

Das 41 linhas do rateio, **28** têm a origem legível em `financeiro.vendas_ganhas`. As outras **12** só existem em cards do funil `Rateio` em etapa `normal` — e a view expõe apenas `won`. **A origem existe no CRM e é invisível às 8 views.**

Isso mata a ideia de derivar por código: um derivador acertaria 28, erraria 12 **em silêncio** e pareceria completo — o modo de falha exato que a sessão 12 corrigiu na tela de Contratos. Por isso o mapa é documento: **`ATRIBUICAO-originador-2026-07-29.md`** é o único portador daquelas 12.

Falta o que nenhuma consulta entrega: três CPF/CNPJ, a natureza pf/pj, a confirmação do `tipo` (que **congela** no contrato pela R20-b) e quem originou a G3-0154, cujo lead está arquivado.

**Achado de lado, registrado pela regra 10:** a `UC-DUP-01` mudou de estado. `000041446801282` aparece **uma vez só** hoje, e a `G3-0141` ficou com a `uc` **vazia** — a duplicidade acabou e o número certo continua faltando.

---

## 2. "Como eu gero boleto e relatório?" — a resposta era que a tela parava no meio

Medido, não respondido: as **78 rotas** tinham o ciclo do dinheiro completo — compor, emitir, boleto, consultar, baixar, split — e a SPA **parava em "compor rascunho"**. Emitir, boleto, baixa, repasses e comissões existiam como API e não tinham tela: o número saía por `curl` ou não saía.

E logo/layout de boleto **não existiam em camada nenhuma**: varredura em `src/`, `web/`, `prisma/` e `scripts/` deu **zero** ocorrência de PDF ou logo, e `tenant` tem 7 colunas, nenhuma de marca.

Três telas novas, nenhuma dependendo do certificado A1:

- **Cobrança** — o conector, pela `credencial_ref`. A trava contra segredo colado é o assunto da §3.
- **Faturas** — emitir (lote e unitária), pedir boleto, ver linha digitável e Pix, e a **baixa manual**, que é o único gatilho de split que funciona sem A1 — é ela que faz os relatórios deixarem de ser vazios.
- **Relatórios** — repasse por dono, comissão por originador e uso da usina, com **CSV** (separador `;`, BOM UTF-8, dinheiro por string).

---

## 3. A regra 5 no lugar onde ela cai

A aba de Cobrança pede a credencial de um banco, e o caminho natural de quem opera é colar ali o `client_secret` ou o conteúdo do `.pfx`. A coluna é `text` e o banco aceitaria — foi assim que a tabela `tenants` do CRM ficou com cinco tokens em claro, num repositório que foi público até 25/07.

A trava é pura, em `web/src/cobranca-regras.ts`, e nomeia o que reconheceu: PEM, JWT, `client_secret`, base64 longo, texto de 200+. Testada nos dois sentidos — referência opaca passa, segredo trava. **Não substitui o cofre:** o `ADR-0005` segue em proposta, e a `credencial_ref` aponta para um armazenamento que não existe. É detecção, como o `CAT-8` para o `rls_auto_enable`.

---

## 4. As cinco decisões do documento, duas contra a minha recomendação

| | Escolha | |
|---|---|---|
| 1 | Logo em `bytea` em tabela nossa | como recomendado |
| 2 | **Layout configurável por tenant** | contra a minha recomendação |
| 3 | HTML agora, gerador de PDF depois | como recomendado |
| 4 | Manual agora, **rota do CRM já preparada** | as duas |
| 5 | **QR Pix estático** | contra a minha recomendação |

As duas divergências ficam registradas **como divergências**, não como consenso.

Na (2), o custo que eu tinha nomeado era *"campo inexistente vira fatura errada"*. Resolvido no schema: a lista é **fechada por enum** (`campo_de_fatura`, 16 valores) — é o banco recusando, não código que alguém precisa lembrar de rodar.

Na (5), o que não muda com a escolha: sem `txid` por fatura, **o dinheiro chega sem dizer de quem é**. A conciliação segue manual, pela baixa da tela de Faturas — e é por isso que a baixa manual foi construída **antes**.

Na (4), a consequência de desenho é a razão de a rota vir antes da tela: a composição do documento **não pode nascer no `.tsx`**, senão publicá-la para o CRM depois é reescrever. Mediu-se o que fecha a escolha do canal: **84 clientes têm telefone, 10 têm e-mail** (12%).

---

## 5. Duas migrations, e os dois invariantes que recusaram o meu desenho

**Migration 19** — `identidade_de_cobranca`, `logo_de_cobranca`, `campo_do_documento`.

A divisão em duas tabelas saiu de medição: **`to_jsonb` sobre `bytea` ocupa exatamente 2,00×**. Auditar a logo na linha inteira poria 1,2 MB na trilha por troca de uma logo de 300 KB — e o pior nem é a trilha, é toda leitura da identidade arrastar o arquivo.

**O inv. 17 recusou a logo sem gatilho de auditoria.** Eu tinha *raciocinado* que era melhor deixá-la fora; o teste não aceita raciocínio. Virou **propagação** — um gatilho que carimba o `sha256` na tabela auditada. Ficou mais forte do que eu queria: o hash passou a ser **derivado pelo banco**, então o metadado não pode divergir do conteúdo, e a regra 9 se cumpre por construção.

**O `CAT-7` recusou uma FK simples** que eu justifiquei com *"essa obviamente não atravessa tenant"*. Virou composta, como as outras dez. O invariante está certo por classe: a exceção óbvia é como a próxima, que não é óbvia, entra sem ninguém olhar.

Aproveitei para fechar um furo que apareceu: o mime da logo sai da **assinatura do arquivo**, não do rótulo — um SVG mandado como `image/png` é recusado pelos bytes. Sem isso, "não aceitar SVG" seria uma etiqueta, e a logo é embutida no HTML do documento.

Invariante **17-b** novo: gatilho `auditar_*` tem de executar `app.auditar()`, com **uma** exceção nomeada. A segunda entrada nessa lista deve doer.

### Migration 20 — a regra 11 numa direção que ela não previa

`db pull` inferiu uma relação *to-one* correta, e o `prisma generate` **recusou o schema que a introspecção acabara de escrever**: `P1012`, *"a one-to-one relation must use unique fields on the defining side"*. O Prisma 7.9 exige que os campos **da relação** sejam únicos e não aceita que a unicidade venha de um subconjunto deles — mesmo o banco garantindo **mais** do que ele pede.

Escrever `@@unique` no arquivo funcionaria hoje e **desapareceria no próximo `db pull`**. Então foi para o banco: `UNIQUE (tenant_id, identidade_id)`, redundante para o Postgres e necessária para o gerador. Precedente: a regra 2 já manda um `UNIQUE (tenant_id, id)` redundante com a PK, pelo mesmo motivo — tornar a garantia *expressável*.

**Dois fatos operacionais que não estavam escritos em lugar nenhum:**

- o `db pull` **valida o `schema.prisma` existente antes de introspectar** — com o arquivo inválido ele não roda, e a saída é restaurar o último válido;
- **`generate` falhar deixa o client anterior intacto, e `tsc --noEmit` passa em cima dele.** Typecheck verde **não prova** que o client corresponde ao schema.

`Q-PRISMA11B-01`, fechada 🟢 — o mecanismo ficou no banco, não na memória de alguém.

---

## 6. O BR Code, o layout e a aba

**`src/dominio/brcode.ts`, 33 verificações.** Puro e testado antes de qualquer tela, porque os dois modos de falha não se parecem: CRC errado o aplicativo **recusa** e ninguém perde dinheiro; chave ou valor errados com CRC certo o aplicativo **aceita**, e o cliente paga para o lugar errado.

**`src/dominio/layout-do-documento.ts`, 22 verificações.** O padrão vive no código: `campo_do_documento` vazio significa *"usa o padrão"*, e semear um padrão na migration decidiria o layout de todo tenant futuro.

**`src/repos/documento.ts` + 8 rotas + a aba Documento.** A prévia **é** o documento: ela pinta o retorno de `GET /faturas/:id/documento`, a mesma rota que o CRM vai consumir. Se as duas divergissem, a prévia deixaria de ser conferência.

---

## 7. Quatro erros meus que o processo pegou — e o que cada um ensinou

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Citação inventada.** O teste do CRC afirmava um *"payload de exemplo do Manual do BACEN"* com CRC `2CA5`; eu tinha reconstruído os dois de memória | falhou na primeira execução | Ajustar o esperado para a saída do meu código teria virado **tautologia** — passaria com o algoritmo errado. Troquei por uma **segunda implementação, tabelada**, mais o vetor publicado `123456789` → `29B1`. É o mesmo erro da sessão 13 (a conciliação inventada), noutra roupa |
| **`valor_total_centavos` é nullable.** Eu havia escrito que todas as colunas de dinheiro eram `NOT NULL` e que *"zero ali é zero de verdade"* | `tsc` recusou o tipo | Medido: é `GENERATED ALWAYS` e **aceita nulo**. Um total desconhecido imprimia **"R$ 0,00"** — vazio virando número. Agora sai "—", e a faixa de pagamento **recusa** montar QR sem valor |
| **A contagem de testes do README não se reproduzia** | tentei somar 461 → 496 e não fechou | Só 15 das 27 suítes anunciam total próprio. Troquei por `npm test \| grep -c '^ok '` = **571**, com o método escrito ao lado do número |
| **Backticks num comentário de CSS** dentro de um template literal | o build quebrou | Trivial, e o registro é sobre método: quatro linhas de CSS derrubaram o `tsc` do `web/`, e foi o build que disse — não a leitura |

---

## 8. O que NÃO foi feito, e por quê

| O quê | Por quê |
|---|---|
| **Nada publicado em produção** | O bundle no ar é o de 29/07. O deploy é o ciclo do `RESUMO-SESSAO-11` §12, e é decisão de quando |
| **O desenho do QR** | O BR Code está completo e válido, e paga por copia-e-cola. Renderizar o quadrado exige um codificador (Reed-Solomon e máscaras) que não foi escrito, e desenhar um placeholder parecido com um QR seria **pior** que dizer que falta. A tela diz |
| **Teste de integração do `repos/documento.ts`** | Os módulos puros ganharam 55 verificações; o repositório tem **zero**. As suítes de repo rodam por harness próprio e este não entrou nele. Dívida nomeada, não coberta |
| **A logo no payload do CRM** | A tela a busca por `GET /cobranca/logo` com o Bearer. Um consumidor externo precisaria da mesma credencial ou da logo em base64 no payload — decide junto com a autenticação do CRM, que é a `Q-WEBHOOK-01` |
| **Nenhum originador cadastrado** | Falta o insumo humano: três documentos. `documento` é `NOT NULL` e o script aborta o lote inteiro se um dígito não fechar |
| **Nada mexido no CRM** | Regra 4. As leituras de hoje foram pela role read-only e pelo conector de análise |
| **`Q-AGENDA-01` não construída** | Mesma razão das sessões 12 e 13: só rodaria contra o adaptador falso |
| **Nenhuma tela renderizada de fato** | Não há browser neste ambiente. `tsc --noEmit`, `vite build` e as suítes puras passam; **as telas não foram abertas** |

---

## 9. O que muda para quem opera amanhã

1. **cadastrar os três originadores** — falta só o CPF/CNPJ de cada um. O mapa de quem originou cada UC está pronto e conferido;
2. **digitar os 39 contratos** — a tela exige o originador e diz por quê enquanto o campo estiver vazio;
3. **compor** na aba Carteira, **emitir e cobrar** na aba Faturas, **conferir** na aba Relatórios, com CSV para o contador;
4. **a logo e os campos** da fatura na aba Documento, e a prévia imprime pelo diálogo do sistema;
5. enquanto o A1 não chegar, a faixa de pagamento é **Pix copia e cola** e a baixa é **manual** — o dinheiro chega sem dizer de quem é.
