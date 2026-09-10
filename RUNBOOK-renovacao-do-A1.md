# RUNBOOK — renovar o certificado A1 da Sicoob

| Campo | Valor |
|---|---|
| **Quando** | ⚠️ **17/08/2027**, e o sistema avisa **30 dias antes** — a partir de 18/07/2027 a `financeiro-saude-cobranca` fica vermelha e a faixa aparece na tela de Pendências |
| **Quanto custa errar** | O A1 vencido **para a emissão sem erro óbvio** (`PRD` §6). Nenhum boleto novo é registrado, e a fila só enche |
| **Quem faz** | O dono. Dois dos cinco passos são **fora do sistema** e sempre serão |
| **Escrito em** | 10/09/2026, com o certificado atual em mãos — e o passo 0 existe para ensaiar tudo isto **antes** de precisar |

---

## Passo 0 — ensaiar agora, com o certificado que já está no cofre

**Não espere 2027 para descobrir o que morde.** Rode o workflow
**`cofre-sicoob`** com:

- `client_id` = **vazio** (não grava nada)
- `credencial_ref` = `sicoob-g3-a1`
- `validade` = **`conferir`**

Ele lê o certificado de dentro do cofre e imprime, no resumo do run: titular,
data de vencimento, **se o Node consegue abri-lo**, e se a coluna do banco bate.
Não escreve nada.

**O que a saída te diz de útil hoje:** se `o Node abre? = NAO`, o certificado que
está no cofre não emitiria boleto — e é melhor saber agora.

---

## Os cinco passos da renovação

### 1 · Comprar o A1 novo — **fora do sistema**

ICP-Brasil, PJ, CNPJ `66.714.022/0001-21`. Chega um `.pfx` com senha.

### 2 · Conferir o que veio — **e aqui mora a armadilha**

```bash
npm run certificado -- conferir /caminho/a1-novo.pfx
```

⚠️ **A armadilha foi medida em 27/08/2026 e vale de novo:** AC brasileira ainda
entrega `.pfx` com cifragem antiga (`pbeWithSHA1And40BitRC2-CBC`). O **Node
recusa** com `ERR_CRYPTO_UNSUPPORTED_OPERATION`, e o **`openssl` do sistema abre
sem reclamar** — porque tem o provider `legacy` ligado.

**A consequência é o pior formato de defeito:** o certificado "funciona" em todo
teste manual e falha exatamente no processo que emite boleto.

Se o `conferir` disser que o Node não abre:

```bash
npm run certificado -- normalizar /caminho/a1-novo.pfx /caminho/a1-ok.pfx
```

e siga com o normalizado.

### 3 · Subir a parte pública no Portal Developers — **fora do sistema**

```bash
npm run certificado -- publica /caminho/a1-ok.pfx
```

Gera um `.pem` — **a parte pública, o único arquivo que não é segredo**. Esse é
o que sobe no portal do banco, à mão. Confirmado por fonte primária em 13/08/2026:
*"somente a chave pública"*, em `.PEM`, `.CRT` ou `.CER`.

⚠️ **Este passo não tem como ser automatizado por nós** e é por isso que
"renovação sem desenvolvedor" nunca fica 100%: o portal é do banco.

### 4 · Guardar no cofre

```bash
npm run certificado -- guardar /caminho/a1-ok.pfx sicoob-g3-a1 <client_id>
```

Exige **`COFRE_DATABASE_URL`**, a conexão de **dono** — que **não existe na
VPS**, e não existir é o desenho: *quem emite boleto não pode escrever no cofre*
(`ADR-0005` opção A).

Depois:

```bash
shred -u /caminho/a1-novo.pfx /caminho/a1-ok.pfx
```

O lugar do certificado é o cofre. O `ADR-0005` recusou explicitamente "arquivo em
disco no VPS" — entre outras razões porque **a VPS é compartilhada com o CRM**.

### 5 · Carimbar a validade, e conferir que o alarme calou por verdade

Workflow **`cofre-sicoob`**, `validade` = **`carimbar`**.

É ele que escreve `conector_cobranca.certificado_expira_em` — **a coluna que o
alarme lê**. Sem este passo o certificado novo está no cofre e o sistema continua
avisando sobre o antigo.

**A conferência final** é a unidade dizendo a verdade sozinha:

```bash
systemctl start financeiro-saude-cobranca.service
systemctl status financeiro-saude-cobranca.service     # esperado: status=0
systemctl list-units --failed | grep saude             # esperado: nada
```

---

## Por que a data não se digita na tela

Até **10/09/2026** a aba Cobrança tinha um campo de data para o vencimento do A1,
e era essa coluna que o alarme lia. **Dava para calar o aviso digitando uma data
nova** — a faixa sumia, o certificado continuava o mesmo, e a conta chegava um
ano depois com a emissão parando sem erro óbvio.

Hoje o campo **mostra e não deixa editar**, e o único escritor é
`scripts/certificado.ts`, que lê o `notAfter` de dentro do próprio arquivo. A
validade deixou de ser opinião.

`N14c` em `tests/repos-agenda.ts` prende isso: salvar o conector com uma data
futura **não** move a coluna.

---

## O que sobra de terminal, e por que

| Passo | Por quê |
|---|---|
| 2 e 4 (`conferir`, `guardar`) | precisam do arquivo em mãos **e** da conexão de dono, que não vive na VPS |
| 3 (portal) | é do banco |
| 0 e 5 | ✅ **já são botão** no workflow `cofre-sicoob` |

Construir tela para os passos 2 e 4 exigiria dar à aplicação um caminho de
**escrita no cofre** — a superfície mais sensível do sistema — para economizar
dois comandos **uma vez por ano**, e ainda assim o passo 3 continuaria mandando
você ao portal. Registrado em `QUESTOES.md` §2.j como decisão consciente, não
como pendência esquecida.
