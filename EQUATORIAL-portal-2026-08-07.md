# EQUATORIAL — o que fazer no portal

> ## ✅ PREENCHIDA E LIDA EM 08/08/2026 — e falta **uma** coisa
>
> **As respostas abaixo ficam intactas**, porque são o registro datado da navegação. **A leitura do que elas mudam está no `PLANO-leitura-fatura-equatorial-2026-08-07.md`, bloco de 08/08** — e ela prevalece sobre o corpo do plano.
>
> **O que a folha fechou:** login é UC + CPF **sem conta cadastrada** · o PDF **tem camada de texto** (o extrator vira determinístico e de custo zero) · **156 meses** de histórico com competência passada · **fatura por e-mail existe e aponta para e-mail nosso**.
>
> **Três coisas apareceram, e duas são grandes:**
>
> 1. **A validação do login é a data de nascimento** — insumo humano que não estava em lista nenhuma, e para CNPJ ninguém sabe qual é (`Q-EQTL-NASCIMENTO-01` 🔴);
> 2. **O e-mail pode apagar a raspagem inteira** — é o caminho mais barato e o mais estável, e a tabela *se X então Y* desta folha já dizia isso (`Q-EQTL-CANAL-01` 🔴);
> 3. **Os termos de uso não foram achados** — o que veio foi a *política de privacidade*, e são documentos diferentes. `Q-EQTL-AUTORIZACAO-01` continua aberta.
>
> ### ⭐ O QUE FALTA, E É UMA COISA SÓ: **uma fatura de UMA DAS 29 UCs QUE FATURAM**
>
> A fatura que veio foi lida inteira, e ela é **`B1 RESIDENCIAL — RESIDENCIAL NORMAL CONVENCIONAL`, sem geração distribuída**: duas linhas cobráveis (fornecimento + iluminação pública) somando o total exato, **sem energia compensada e sem nenhuma linha de fio B**. O item 6 estava marcado *"tem compensação"* — medido, não tem. *(Conferido: a UC dela também não está na nossa base.)*
>
> Sem uma fatura **com compensação**, a `Q-EQTL-CAMPOS-01` não fecha — é justamente o fio B que falta, e é ele que decide o valor da coluna. **Qualquer uma das 29 serve: todas têm rateio ativado.**
>
> *(Os rótulos do item 6 vieram em branco; eu os extraí do PDF. O que já se sabe: a iluminação pública é a linha `CONTRIB. ILUM. PÚBLICA - MUNICIPAL`, sob `ITENS FINANCEIROS`; **não existe linha chamada "encargos"**; e os tributos vêm **destacados mas embutidos** — somá-los cobra tributo duas vezes.)*

**Uma passada só, com UMA UC real na mão.** Voltar custa mais que anotar tudo agora. Preencha as lacunas neste arquivo enquanto navega.

**Não pergunte, já está decidido:** onde mora o segredo (`ADR-0005`), qual é a coluna que a fatura alimenta (`PRD` §5.1 — **fio B + iluminação pública + encargos**, e **não** o total a pagar), e que a soma vai por componente (`PLANO-leitura-fatura-equatorial-2026-08-07` §2).

**Leve também:** uma fatura da Equatorial **em PDF, baixada** — é o item 6, e é o que destrava a metade cara do trabalho.

---

## 0. Antes de abrir o navegador

| | |
|---|---|
| UC que você vai usar | `_______________` (15 dígitos) |
| CPF/CNPJ do titular dela | `____________` |
| **Você tem autorização registrada desse cliente?** | ☐ sim ☐ não — se não, **pare aqui** (`Q-EQTL-AUTORIZACAO-01`) |

## 1. Entre

`equatorialenergia.com.br` → **Goiás** → agência virtual / segunda via.

| | Anote aqui |
|---|---|
| URL exata da tela de login | `https://goias.equatorialenergia.com.br/LoginGO.aspx?envia-dados=Entrar` |
| O login pede o quê? | [x] UC + CPF(ou cnpj) ☐ CPF + senha ☐ e-mail + senha ☐ outro: `______` | - a Validação é a data de nascimento da pessoa que representa o CPF, não sei o que é com o cnpj
| **Precisa de conta cadastrada** (com senha), ou UC+CPF já entra? | ☐ conta ☐ UC+CPF direto | - Não precisa
| Tem CAPTCHA? | ☐ não ☐ sim, qual: `____________` | - não
| Tem 2º fator (SMS / e-mail)? | ☐ não ☐ sim: `____________` | - para login não

## 2. Uma conta serve para várias UCs?

| | sim, sequer precisei cadastrar uma conta |
|---|---|
| Dá para vincular **mais de uma UC** à mesma conta? | [x] sim, dá para consultar ☐ não |
| Existe perfil de **procurador / representante / parceiro**? | ☐ sim: `__________` [x] não |

## 3. A segunda via

| | Anote aqui |
|---|---|
| Formato do arquivo | [x] PDF ☐ imagem ☐ só HTML na tela |
| **É PDF com texto** (dá para selecionar com o mouse) ou imagem escaneada? | [x] texto ☐ imagem |
| Quantos meses de histórico aparecem? | `156` meses |
| Dá para baixar competência **passada**? | [x] sim ☐ só a atual|
| Em que dia do mês a fatura do mês fica disponível? | dia `depende do cliente` |

## 4. Os canais que dispensam navegar

| | Anote aqui |
|---|---|
| Existe **"fatura por e-mail" / conta por e-mail**? | [x] sim ☐ não |
| Se sim, dá para apontar para **um e-mail nosso** (não o do cliente)? | [x] sim,  ☐ não |
| Existe **WhatsApp** que devolve a fatura? | ☐ sim: `__________` [x] não identifiquei, mas há uma aba em que eles pedem o número do cliente|
| A Equatorial menciona **API, EDI ou portal de parceiro/integrador**? | ☐ sim: `__________` [x] não identificado|

## 5. Os termos de uso

| | Anote aqui |
|---|---|
| Achou os **termos de uso** do portal? | ☐ sim, URL: `https://go.equatorialenergia.com.br/compliance/politica-privacidade/` ☐ não achei |
| Eles proíbem acesso automatizado / robô / scraping? | ☐ proíbem ☐ silenciam ☐ permitem com condição: `______` - eu vi um certificado de recaphta, mas nada mais |

## 6. ⭐ BAIXE UMA FATURA E GUARDE

**É o item mais importante desta folha.** Sem um documento real, `Q-EQTL-CAMPOS-01` não fecha e o extrator não pode ser escrito.

| | |
|---|---|
| Arquivo salvo em | `https://drive.google.com/file/d/1haSMavOGFFoNQhsJ0-klu--1GYoHN4U_/view?usp=sharing`atua |
| **Prefira uma UC que já tenha compensação de energia** — a fatura de uma UC sem crédito não mostra as linhas que interessam | x tem compensação ☐ não tem |

**Copie da fatura, exatamente como está escrito na página** — o rótulo *e* o valor:

| O que procuramos | Rótulo na fatura | Valor |
|---|---|---|
| **fio B** (TUSD sobre a energia compensada) | `________________` | `________` |
| **iluminação pública** (COSIP / CIP) | `________________` | `________` |
| **encargos** | `________________` | `________` |
| bandeira tarifária | `________________` | `________` |
| **total a pagar** | `________________` | `________` |
| consumo em kWh | `________________` | `________` |
| energia compensada em kWh | `________________` | `________` |
| tributos (ICMS / PIS / COFINS) — vêm destacados? | `________________` | `________` |

---

## O que cada resposta muda aqui dentro

| Se… | Então… |
|---|---|
| **UC + CPF entrar direto**, sem conta | a credencial do portal **é o item 1.1 da fila**, e não há insumo humano novo nenhum nesta frente |
| **exigir conta com senha** | aparece um insumo que não estava em lista nenhuma: 29 cadastros. Reordena o plano inteiro |
| **houver CAPTCHA ou 2º fator** | a coleta deixa de ser desassistida. Vira assistida, ou vira o canal do item 4 |
| **uma conta servir para várias UCs** | 29 coletas viram poucas sessões — muda o desenho da fase D e o custo de bloqueio |
| **o PDF tiver camada de texto** | o extrator é **determinístico e de custo zero por documento**. O modelo de visão vira só o caminho de exceção |
| **for imagem escaneada** | o modelo de visão é o caminho principal (~US$ 0,04/documento, ~US$ 1,10/mês para 29) |
| **existir fatura por e-mail apontável para nós** | **não há scraping nenhum.** A Equatorial entrega, e a frente vira uma caixa de entrada. É o caminho mais barato e o mais estável — e é por isso que o item 4 está nesta folha |
| **os termos proibirem automação** | `Q-EQTL-AUTORIZACAO-01` deixa de ser formalidade e vira decisão sua, antes da fase D |
| **os rótulos do item 6 não baterem** com fio B / COSIP / encargos | `Q-EQTL-CAMPOS-01` vira pergunta para o **contador**, e a `PAUTA-contador.md` é o canal que já existe |

---

## ⚠️ Duas coisas medidas em 07/08 que vão aparecer

1. **O portal responde `403` a quem não é navegador.** Medido nos três hosts (`go.`, `www.`, `goias.`), com `set-cookie: visid_incap_*` e header `x-iinfo` — é proteção de bot (Imperva/Incapsula). **Consequência:** `curl` e cliente HTTP simples não servem; a coleta exige Chromium de verdade. **E o modo de falha dela é devolver uma página válida**, não um erro — quem não distinguir vai extrair campos de um aviso de bloqueio.
2. **As 41 UCs têm zero à esquerda** (`000000013290060`). Se o portal mostrar a UC sem os zeros, **não é uma UC diferente** — o código já restaura (`F4a`). Anote como o portal escreve: `_______________`

---

## Quando voltar

1. **Preencha as lacunas e ponha a data.** O que foi *visto* e o que foi *suposto* não podem ficar iguais depois;
2. **Traga o PDF do item 6.** É ele que fecha a `Q-EQTL-CAMPOS-01`;
3. **Decida `Q-EQTL-ESCOPO-01`** — as 41 UCs ativas ou as 29 que faturam. É sua, e muda a migration 26;
4. **Aí sim** o coletor e o extrator podem ser escritos. Nem antes, nem depois.

## O que o portal NÃO resolve

- **A primeira fatura.** Ela não depende disto por caminho nenhum — o que a segura são as sete linhas da `RETOMADA-2026-08-06` §3;
- **O Sicoob.** Outra cadeia, adiada a pedido, e sem interseção com esta;
- **A pergunta (a) da `Q-TARIFA-CONC-01`** — *se* a competência 2026-06 leva tarifa da concessionária ou sai só com o crédito. Isso é decisão sua, e nenhuma leitura automática a responde.
