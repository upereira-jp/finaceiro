# Retorno — CRM, rodada 3 (27/07/2026)

As oito views estão no ar e eu construí o conector inteiro em cima delas. Funciona.

Esta rodada tem **um pedido só**, e ele nasce de uma promessa que eu te fiz na rodada 2 e não consigo cumprir. Antes dele, duas correções minhas — uma que muda o que você ouviu de mim, e uma que evita que você faça trabalho errado.

---

## 1. Eu te prometi uma coisa que não dá para fazer

Na rodada 2 eu escrevi, sobre o isolamento vir dos literais e não da RLS:

> *"Consequência que eu implementei: o conector valida `crm_tenant_id` em **toda linha recebida** e aborta o ciclo na primeira divergência. Nada gravado, nada reconciliado. Uma comparação por linha, e é a única defesa que não depende de a view estar certa."*

**Não implementei, porque não dá.** Nenhuma das oito views expõe `crm_tenant_id`. Conferido coluna a coluna em 27/07:

| View | Tem coluna de tenant? |
|---|---|
| `vendas_ganhas`, `usinas`, `rateio_clientes`, `rateio_creditos` | não |
| `geracao_mensal`, `parceiros`, `leads_arquivados`, `lead_merges` | não |

Eu escrevi aquela frase sem ter olhado o contrato das views — na época elas ainda não existiam, e eu supus que o identificador viria junto. Não veio, e a defesa que eu declarei como implementada é hoje uma linha de documentação sem código atrás.

O que o conector faz **de fato**, e está no código: exige `crm_tenant_id` configurado no nosso lado, confere contra a nossa tabela `conector_crm`, aborta se divergir — e **grava `garantia_de_tenant_degradada: true`** no registro de cada execução, para que a ausência da garantia apareça em tabela e não só na minha cabeça. Isso declara a lacuna. Não a fecha.

## 2. E eu quase te pedi a coisa errada

A primeira versão deste retorno pedia que você recriasse as oito views com `WITH (security_invoker = true)`.

**Não faça. Teria quebrado a integração inteira.**

Com `security_invoker = true`, privilégios *e* RLS passam a ser avaliados contra quem consulta. O `financeiro_ro` precisaria de `SELECT` nas tabelas base — que é exatamente o acesso que a regra 4 do nosso lado proíbe, e que eu conferi que ele **não tem**:

```
financeiro_ro: NOSUPERUSER, NOBYPASSRLS
  privilegios de escrita ............ 0
  objetos fora do schema financeiro . 0
  acesso a tabela base de public .... 0
```

O desenho atual — view *owned* por `postgres`, filtro por literal — é justamente o que permite ao `financeiro_ro` enxergar as views **e nada mais**. Você já tinha me explicado isso na rodada 2; fui eu que reabri por engano ao reler o catálogo sem reler a conversa.

**A role está impecável e o desenho das views está certo.** Nada a mudar aí.

---

## 3. O pedido: `crm_tenant_id` como coluna nas oito views

É a única coisa que eu preciso, e é aditivo — nenhuma view muda de semântica, nada do que já consumo se altera.

```sql
-- Em cada uma das oito, acrescentar a coluna no SELECT.
-- O valor e o MESMO literal que ja filtra o corpo da view; so deixa de ser
-- invisivel para quem consome.
--
-- Exemplo, vendas_ganhas:
CREATE OR REPLACE VIEW financeiro.vendas_ganhas AS
SELECT
  'd4640f4b-...'::uuid AS crm_tenant_id,   -- <-- so isto
  codigo, lead_id, nome, telefone, email, funil, etapa, ganho_em,
  ...                                       -- resto igual, sem mexer
FROM ...
WHERE ...;                                  -- predicado igual, sem mexer
```

**Duas observações de forma, e você conhece as duas melhor que eu:**

- `CREATE OR REPLACE VIEW` exige que as colunas existentes mantenham nome, tipo e ordem — foi o que te obrigou a pôr `comissionamento_n_opcoes` no fim, na rodada 1. Acrescentar coluna **no começo** não passa por `REPLACE`. Se for mais simples, põe **no fim** de cada lista, como você fez lá; a posição não me afeta em nada, eu leio por nome.
- Se o literal já vier de algum lugar centralizado no seu lado, melhor ainda — prefiro a mesma fonte que alimenta o `WHERE`, não uma segunda cópia. Duas cópias do mesmo UUID podem divergir, e uma divergência aí é exatamente o cenário que a coluna existe para pegar.

### Por que isso importa mais do que parece

Hoje vocês têm um tenant, e o literal está certo. A coluna não muda nada hoje.

Ela muda o dia em que **uma view nova nascer sem o literal, ou com o literal errado**. Nesse dia, sem a coluna, o conector ingere leads de outra empresa como se fossem da G3 — cria cliente, cria contrato, e o erro só aparece quando alguém estranhar um nome na carteira. Com a coluna, a primeira linha divergente aborta o ciclo: nada gravado, nada reconciliado, e o registro de execução diz o que aconteceu.

Não é desconfiança do seu trabalho. É que o custo de errar aqui é dado de uma empresa aparecendo na de outra, e nesse tipo de risco eu prefiro não depender de ninguém acertar — inclusive de mim.

---

## 4. Duas coisas antigas que continuam abertas do seu lado

Não são desta rodada, e nenhuma bloqueia o conector. Repito porque seguem no meu registro com o seu nome:

**a) `LIMIT 1` sem `ORDER BY`** — `VIEWS-PROPOSTAS-r2.sql` §100. Sem `ORDER BY`, o planejador devolve a linha que quiser, e pode devolver outra amanhã com os mesmos dados. **É alíquota, não relatório**: a linha que ele escolher vira o percentual que alguém recebe.

**b) Segredos em `text` puro na tabela `tenants`** — `openai_api_key`, `whatsapp_access_token`, `instagram_access_token`, `meta_page_access_token`, `meta_verify_token`. O agravante é que o repositório foi público até 25/07 **e nomeia as colunas**. Isso faz o caminho ser **rotação**, não só migração para armazenamento cifrado: o que vazou, vazou, e mover a coluna depois não invalida a chave.

---

## 5. Do meu lado, para você calibrar o que confiar

Em 27/07: conector construído e testado (16 verificações), auditoria e isolamento fechados, 276 verificações no total, e os invariantes de catálogo passando **contra produção** e não só contra banco de teste.

E, na mesma linha das duas correções acima: um teste meu pegou que eu comparava `consumo_kwh` como texto — `'850.0000'` que vem de vocês contra `850` que volta do meu banco. Nunca são iguais, então o conector reescreveria todo cliente espelhado em todo ciclo, para sempre, e o contador diria "atualizados: N" sem ninguém desconfiar, porque atualizar é o que um sincronizador faz. Corrigido antes de rodar contra vocês.

Menciono porque é o tipo de coisa que eu ia jurar que estava certa.

---

**Resumo do que eu preciso:** `crm_tenant_id` como coluna nas oito views `financeiro.*`. Nada mais. As views e a role estão certas.
