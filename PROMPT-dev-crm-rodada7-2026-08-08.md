# Pedido ao dev do CRM — rodada 7

| Campo | Valor |
|---|---|
| **Data** | 08/08/2026 |
| **De** | Financeiro G3 |
| **Assunto** | **Data de nascimento do titular** — uma pergunta só, e ela é curta |
| **Rodada anterior** | `PROMPT-dev-crm-rodada5-2026-08-03.md` · respostas em `RESPOSTA-dev-crm-rodada5` e `-rodada6` |

---

## O contexto, em três linhas

O financeiro vai passar a receber a **fatura da Equatorial** automaticamente, para lançar a parcela de repasse à distribuidora em cada fatura nossa.

Para configurar isso é preciso entrar uma vez na agência virtual da Equatorial de cada UC. O login é **número da UC + CPF/CNPJ**, e a **validação é a data de nascimento do titular**.

**É o único dado que falta**, e ele não aparece de nenhum lado daqui.

---

## O que já foi medido deste lado, para não gastar o seu tempo

Antes de perguntar, procuramos — pelas três vias que temos:

| Onde | Como | Resultado |
|---|---|---|
| `financeiro.rateio_clientes` | listagem de colunas | `contrato_id, codigo_geradora, usina, lead_codigo, cliente, telefone, percentual_rateio, uc, troca_titularidade, numero_protocolo, data_cadastro, data_vencimento, observacoes, created_at, crm_tenant_id` — **sem data de nascimento** |
| as **10 views** de `financeiro.*` | idem | **nenhuma** expõe o campo |
| **catálogo inteiro** do banco | `column_name ~* 'nasc\|aniver\|birth\|dob\|natal'` em todos os schemas | **zero colunas**. As únicas `json/jsonb` do banco são `net._http_response.headers` e `net.http_request_queue.headers`, que são internas do `pg_net` |

**Não lemos tabela base** — a `financeiro_ro` alcança exatamente os 10 objetos de `financeiro.*`, e a busca acima foi só no catálogo (`information_schema`), que é metadado e não dado de negócio.

---

## A pergunta

**O CRM guarda a data de nascimento do titular da UC?**

Marque a que vale:

- ☐ **(a) Guarda, e está neste banco** — em que tabela e coluna? Dá para expor numa view de `financeiro.*`?
- ☐ **(b) Guarda, mas fora deste banco** — a tela mostra o campo e ele vem de outra fonte. Qual, e dá para alcançar?
- ☐ **(c) Não guarda.** O campo não existe em lugar nenhum do CRM.

**Se for (a) ou (b), duas perguntas curtas:**

| | |
|---|---|
| **Cobertura** | de quantos dos clientes ativos o campo está **preenchido**? (a afirmação que chegou aqui foi *"todos os clientes devem ter"*, e a diferença entre *deve ter* e *tem* é o que decide se isto vira planilha) |
| **Pessoa jurídica** | e quando o titular é **CNPJ**? Guarda data de abertura, ou nada? |

---

## Por que a resposta muda o trabalho, e não só a informação

| Se… | Então… |
|---|---|
| **(a)** | pedimos uma coluna na view e o assunto **acaba** — é o mesmo caminho que resolveu o eixo do originador em 03/08 |
| **(b)** | dependendo da fonte, vira integração nova ou vira exportação manual **uma vez** |
| **(c)** | vira **coleta da operação**: uma quarta planilha, 24 pessoas, e entra na fila que já tem CPF/CNPJ, vencimento e endereço |

**Nenhum dos três é problema** — o que atrapalha é decidir sem saber. Por isso a pergunta é uma só.

---

## O que NÃO estamos pedindo

- **Nada de escrita.** O financeiro não escreve no CRM, em nenhuma circunstância e por nenhum caminho;
- **Nada urgente.** Esta frente não bloqueia o faturamento — o que segura a primeira fatura é planilha e decisão do nosso lado, e nada disto depende de você;
- **Nenhuma mudança de modelo.** Se for (a), basta a coluna na view.

---

## Uma observação de segurança, que vale independentemente da resposta

Data de nascimento **combinada com CPF** é um par que autentica em vários sistemas — inclusive na agência virtual da Equatorial, que é exatamente por isso que estamos atrás dela.

Se ela for exposta numa view, vale tratá-la com o mesmo cuidado do documento: **sem log, sem payload gravado, e só para quem precisa.** Do nosso lado ela nasceria como credencial (`ADR-0005`, cofre cifrado com acesso por referência), e não como coluna em claro.

*(Continua valendo o apontamento das rodadas anteriores: a tabela `tenants` do CRM guarda `openai_api_key`, `whatsapp_access_token`, `instagram_access_token`, `meta_page_access_token` e `meta_verify_token` em `text` puro, e o repositório foi público até 25/07. Rotação, não só migração de coluna.)*
