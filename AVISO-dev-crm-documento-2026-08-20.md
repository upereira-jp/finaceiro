# dev do CRM → Financeiro · 20/08/2026

**`financeiro.rateio_clientes` ganhou `documento` e `documento_tipo`. Aplicado hoje em produção.**

É o item **1.1** da fila — *"CPF/CNPJ de 24 pessoas, 0 de 29"*. O `web/src/clientes-regras.ts` de vocês registra que *"nenhuma das 10 views do CRM expõe documento — o dado entra por aqui, ou não entra"*. Passou a entrar.

> **Nada foi pedido de volta.** Este aviso existe porque a coluna é inútil até vocês a lerem — ver §2.

---

## 1. O que mudou, e o que NÃO mudou

| | |
|---|---|
| View | `financeiro.rateio_clientes` — a mesma, `CREATE OR REPLACE` |
| Colunas novas | `documento` (text), `documento_tipo` (text: `'cpf'` \| `'cnpj'` \| null) |
| Colunas removidas ou renomeadas | **nenhuma** — as 15 que vocês já leem estão intactas, na mesma ordem |
| `reloptions` | `null`, inalterado — **`security_invoker` continua desligado** |
| `GRANT` novo | **nenhum** |

Conferido no catálogo **depois** de aplicar:

```
has_table_privilege('financeiro_ro','financeiro.rateio_clientes','SELECT')  →  true
has_table_privilege('financeiro_ro','public.custom_field_values','SELECT')  →  false
```

A regra 4 está intacta: a coluna sai da view, e a role continua sem enxergar tabela base.

**Medição de hoje, logo após aplicar: 41 linhas, 16 com `documento`.** O número está subindo — ver §3.

---

## 2. ⚠️ Vocês precisam mexer em uma linha, senão isto não chega aí

O `SQL.rateio_clientes` em `src/crm/leitura.ts` nomeia as colunas uma a uma — e o comentário logo acima diz por quê: *"`SELECT *` deixaria o contrato mudar sozinho quando o dev do CRM alterasse a view"*. Concordo com a regra, e é justamente ela que faz este aviso ser necessário: **enquanto os dois nomes não entrarem naquele SELECT, a coluna existe e vocês não a veem.**

```
    data_cadastro, data_vencimento, observacoes, created_at, crm_tenant_id,
    documento, documento_tipo
  FROM financeiro.rateio_clientes
```

Nada mais muda de nomenclatura.

---

## 3. O que a coluna É — e o que ela NÃO é

**É uma semente. Não é validação.** A R8 de vocês está respeitada e eu não tentei contorná-la: o documento vem de campo livre do CRM, então tem de entrar com `documento_validado = FALSE` **mesmo passando no dígito**. O ganho não é ativar contrato — é a camada `documento_do_cliente` sair de `sem_documento` (não há o que conferir) para `semente_do_crm` (há o que conferir). De *digitar 29 do zero* para *conferir 29 preenchidos*.

**Como o número chega lá.** Além da digitação normal, hoje entrou um leitor automático dos documentos anexados no card (fatura da Equatorial, CNH/RG, contrato social). Ele preenche **só campo vazio**; onde o documento discorda do que já está no card, **não escreve** — vira pendência para uma pessoa. E onde documentos do mesmo card discordam **entre si**, também não escreve.

Isso último não é zelo teórico. O primeiro card medido tinha quatro anexos nomeando **três pessoas**: duas faturas no nome da titular da conta, um contrato de locação de uma empresa (CNPJ) e a CNH do cliente. Vale vocês saberem porque tem consequência do lado de vocês: **o CPF da fatura frequentemente não é o CPF do cliente** — é do proprietário do imóvel, do cônjuge ou do pai. Para entrar no portal da Equatorial (UC + CPF/CNPJ do titular) o documento certo é o **da fatura**; para o contrato e o boleto, é o **do cliente**. São perguntas diferentes e podem ter respostas diferentes no mesmo card.

---

## 4. CNPJ alfanumérico: os dois lados já concordam

O validador do CRM foi escrito como espelho de `src/dominio/documento.ts` de vocês — inclusive o módulo 11 com valor posicional `ASCII − 48` e a redução ao algoritmo numérico quando tudo é dígito.

Conferi um contra o outro em **2 500 casos** (1 500 aleatórios + 1 000 gerados com DV válido, numéricos e alfanuméricos), passando pelas três implementações — a de vocês compilada com `tsc` e executada. **Zero divergências.** Um documento aceito no CRM não é recusado aí.

A normalização na borda da view espelha a de vocês: sem máscara, maiúsculo, **letras preservadas**. `documento_tipo` é derivado do comprimento (11/14), igual ao `detectarTipo`.

*(O primeiro CNPJ real já entrou: um cliente PJ cujo documento, até hoje de manhã, não tinha onde ser gravado — o campo era só CPF e a máscara cortava em 11.)*

---

## 5. O que continua com vocês

- **A rodada 9 (tarifa por UC numa view) não foi atendida** — é outra frente e segue aberta;
- `Q-EQTL-NASCIMENTO-01`: o leitor extrai **data de nascimento** da CNH/RG anexada, mas ela vive hoje só no CRM, e **não** está nesta view. Se ela for mesmo o insumo do portal, digam e eu exponho — não expus por conta própria porque ninguém pediu.
