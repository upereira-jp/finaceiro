# dev do CRM → Financeiro · 03/10/2026

**O usuário "Out Sales" do CRM agora se chama "Alice França" e entra com `alice@g3solar.com.br`.** Aplicado em produção, a pedido do dono.

É a mesma pessoa que vocês já cadastraram como **Alice Ribeiro Franca** (QUESTOES §2.o: *"Alice == OutSales"*). A chave não mudou: `vendedor_user_id` = **`d39e3453-303c-4c11-a2b6-1c0bd742e639`**.

> **Nenhuma ação obrigatória do lado de vocês.** O `ladoQueCasa` (`src/dominio/credito-originador.ts`) e o `resolverOriginadorDoModelo` (`src/dominio/planilha-contratos.ts`) resolvem pela chave antes do nome, e a Alice tem `crm_user_id` desde a migration 40. O nome só pesaria onde a chave falta, e não é o caso dela.

---

## 1. O que mudou no CRM

| Quando | O quê | Antes → depois |
|---|---|---|
| 02/10 | e-mail de login | `outsalesoficial@gmail.com` → `alice@g3solar.com.br` |
| 03/10 | nome exibido (`public.users.name` e o Auth) | `Out Sales` → `Alice França` |

A senha não mudou e ninguém foi deslogado. Os valores antigos estão guardados no banco do CRM, em `backup_outsales_email_20261002` e `backup_outsales_nome_20261003`.

---

## 2. O que muda nas views que vocês leem

O ponto é saber **qual coluna lê o nome ao vivo e qual guarda uma cópia congelada**:

| View · coluna | Tipo | Efeito, medido em 03/10 |
|---|---|---|
| `vendas_ganhas.vendedor_origem` | ao vivo (`users.name`) | **38 linhas** passaram a dizer `Alice França`, inclusive as antigas |
| `vendas_ganhas.responsavel_atual` | ao vivo (`users.name`) | **32 linhas** passaram a dizer `Alice França` |
| `vendas_creditadas.vendedor` | congelada no ganho | as **28 linhas** dela continuam `Out Sales`. Crédito novo sai com `Alice França` |
| `vendas_creditadas.vendedor_nome_ficha` | congelada (campo write-once) | não mudou |
| `vendas_creditadas.vendedor_user_id` | chave | não mudou (`d39e3453-…`) |

Nenhuma linha de `vendas_ganhas` ainda diz `Out Sales`.

---

## 3. Um efeito previsível: `divergencia_ficha`

No CRM, 304 leads da G3 têm "Nome do vendedor = Out Sales" na ficha. A ficha é write-once, então isso **não foi reescrito**. Desses, **281 ainda não foram creditados**. Quando um deles for creditado, o crédito sai com `vendedor = Alice França` e a ficha continua `Out Sales`, então `divergencia_ficha` vem **`true`**.

Hoje são 16 de 80 linhas com `divergencia_ficha = true`, e esse número tende a subir. Vocês já leem a coluna e, de propósito, não a transformam em sinal (`credito-originador.ts:40`, `leitura.ts:126`). **Nada a fazer.** O aviso é só para ninguém estranhar a coluna subindo.

Lead que entra a partir de agora já nasce com "Alice França" na ficha.

---

## 4. O que fica desatualizado, sem urgência

- **Textos do repositório que dizem "o CRM credita `Out Sales`".** Por exemplo, o comentário de `planilha-contratos.ts:476`, as QUESTOES §2.o e §2.s e o comentário da migration 40. Eles continuam verdadeiros para os créditos até 03/10. Dali em diante, o crédito diz `Alice França`.
- **A coluna `originador_crm` do modelo de contratos** (`scripts/importar-contratos.ts:239`) mostra o texto do crédito. Nas UCs antigas segue `Out Sales`; nas novas, `Alice França`. A coluna `originador_cadastro` continua `Alice Ribeiro Franca`, porque resolve pela chave.
- **Os fixtures dos testes** (`tests/credito-originador.ts`) usam `Out Sales` como dado histórico e seguem válidos.

---

## 5. Para registro: um tenant novo no CRM, invisível para vocês

Em 02/10 o CRM ganhou o tenant **NI3 PROPRIEDADES** (`53ce1277-…`), e a Alice é membro dele também. As duas views filtram o tenant da G3 (`d4640f4b-…`) no próprio SQL, então nada da NI3 aparece no Financeiro.
