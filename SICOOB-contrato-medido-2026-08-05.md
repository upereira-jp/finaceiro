# Sicoob Cobrança Bancária v3 — o contrato, medido

| Campo | Valor |
|---|---|
| **Medido em** | 05/08/2026 |
| **Fonte** | Documentação **pública** da Cobrança Bancária v3 — coleção Postman publicada e material de integração de terceiros |
| **Status** | ⚠️ **Nunca exercido contra a API real.** Não há certificado A1 nem credencial de sandbox (`Q-SICOOB-01`) |
| **Serve para** | escrever `src/sicoob/http.ts` sem re-derivar nem adivinhar |
| **Não serve para** | afirmar que a API se comporta assim. É documentação lida, não resposta recebida |

> **Por que este arquivo existe, e por que ele não é código.** Os três verbos da `PortaDeCobranca` — `registrar`, `consultar`, `baixar` — estão todos medidos, e o adaptador é escrevível. Ele **não foi escrito**, e a razão está na §5.

---

## 1. Base e autenticação

| | |
|---|---|
| **Produção** | `https://api.sicoob.com.br/cobranca-bancaria/v3` |
| **Sandbox** | `https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3` |
| **Token** | `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token` — **Keycloak**, OpenID Connect |
| **Cabeçalhos, em toda chamada** | `Authorization: Bearer <access_token>` **e** `client_id: <client_id>` |
| **Transporte** | **mTLS** com certificado **ICP Brasil**, emitido para o **CNPJ do cooperado** quando PJ |

**O `client_secret` pode não existir.** Em Keycloak sobre mTLS o certificado *é* a credencial. Qual das duas formas a Sicoob usa **não está medido**, e muda o que a resolvedora do `ADR-0005` precisa devolver.

---

## 2. Os três verbos da porta

| Verbo da porta | Método e caminho | Resposta |
|---|---|---|
| `registrar` | **`POST /boletos`** — um boleto por requisição | `200` · `{ "resultado": { … } }` |
| `consultar` | **`GET /boletos`** — por nosso número, linha digitável ou código de barras | `200` · `{ "resultado": { … } }` |
| `baixar` | **`POST /boletos/{nossoNumero}/baixar`** · corpo `{ "numeroCliente", "codigoModalidade" }` | **`204`**, sem corpo |

**Erro, e o padrão é o mesmo em `400`, `406` e `500`:**

```json
{ "mensagens": [ { "mensagem": "string", "codigo": "string" } ] }
```

`400` erro de negócio · `406` inconsistência nos dados · `500` erro interno.

Outros serviços existentes e **não** usados pela porta: `GET /boletos/segunda-via`, `GET /pagadores/{numeroCpfCnpj}/boletos`, `GET /boletos/faixas-nosso-numero`, `PUT /pagadores`, e os três de protesto.

---

## 3. O corpo, e as três armadilhas dentro dele

### 3.1 O `pagador`

```json
"pagador": {
  "numeroCpfCnpj": "98765432185",
  "nome": "Marcelo dos Santos",
  "endereco": "Rua 87 Quadra 1 Lote 1 casa 1",
  "bairro": "Santa Rosa",
  "cidade": "Luziânia",
  "cep": "72320000",
  "uf": "DF",
  "email": "pagador@dominio.com.br"
}
```

| Consequência | |
|---|---|
| **`endereco` é UMA string** | Nós temos `logradouro`, `numero` e `complemento` separados. **Quem concatena é o adaptador.** É por isso que o importador exige logradouro **e** número: os dois alimentam a mesma string |
| **`cep` sem máscara, `uf` de duas letras** | Exatamente o que `npm run enderecos` já normaliza |
| **`cidade` lá é `municipio` aqui** | Renome de adaptador. O `GLOSSARIO` manda o domínio em português |
| **`email` existe lá e não existe no nosso `Pagador`** | `src/sicoob/porta.ts` não tem o campo. Medido: **3 de 29** clientes faturáveis têm e-mail, **29 de 29** têm telefone |

### 3.2 ⚠️ `valor` é DECIMAL, não centavos

```json
"valor": 156.23
```

**Esta é a armadilha que mais custa.** Todo o sistema é `Int` em centavos — regra 1, a primeira do `CLAUDE.md`, *"float é proibido, inclusive em cálculo intermediário"*. A API da Sicoob recebe e devolve **reais com casas decimais, como número JSON**.

A conversão é **fronteira de adaptador** e tem de ser **por texto**, nos dois sentidos:

- `113000` → `"1130.00"`, e nunca `centavos / 100`;
- `156.23` que volta → `15623`, e nunca `Number(v) * 100`.

O projeto já mediu esse caminho em 30/07: `Number(s) * 100` difere do inteiro em **131.256 de 1.000.000** de valores. O `src/dominio/centavos.ts` tem `reaisParaCentavos` por texto — **e não tem a volta**, `centavosParaReaisDecimal`, porque até hoje nada precisava dela.

### 3.3 O `qrCode` da resposta é o Pix copia-e-cola

A resposta traz `"qrCode": "00020101021226950014br.gov.bcb.pix…"` — é o **BR Code**, e mapeia direto para `pixCopiaECola` da porta. O request pede o híbrido com `"codigoCadastrarPIX": 1`.

**Não há campo `pixTxid` na resposta**, e a porta tem um. Ou ele sai de dentro do BR Code, ou fica nulo — decisão de quem escrever o adaptador.

A resposta também traz **`pdfBoleto` em base64**. Não temos coluna para isso e o documento de cobrança é nosso (`layout-visual.ts`) — então é campo a ignorar de propósito, não a esquecer.

### 3.4 `situacaoBoleto` é texto livre em português

Visto: `"Em Aberto"`, `"Liquidado"`. A porta tem enum fechado — `em_aberto | liquidado | baixado | desconhecida`. **A lista completa dos valores possíveis não está medida**, e é por isso que `desconhecida` existe no enum: o que não casar cai nela, em vez de virar `em_aberto` por engano e o sistema achar que ninguém pagou.

---

## 4. O que NÃO está medido

| O quê | Por quê importa |
|---|---|
| **`numeroCliente`, `numeroContratoCobranca`, `codigoModalidade`** | São a **identidade do cooperado** e vêm com o contrato. **Não se derivam** de `conector_cobranca` — a tabela tem `numero_contrato`, `numero_convenio`, `agencia` e `conta`, e qual mapeia para qual é pergunta para quem abrir a conta, não para código |
| **Se há `client_secret`** | §1. Muda a resolvedora do `ADR-0005` |
| **Os valores de `situacaoBoleto`** | §3.4 |
| **Quais campos a API RECUSA por ausência** | A documentação traz o exemplo completo e não marca obrigatoriedade campo a campo. Sem sandbox não dá para provocar a recusa |
| **Como a Sicoob autentica no NOSSO webhook** | Não é público. `ADR-0006` §2.1 — deixou de ser leitura pendente e virou **pergunta ao suporte** |

---

## 5. Por que o adaptador não foi escrito, tendo o contrato

Três razões, e a primeira é do próprio repositório.

1. **`Q-PECA-NAO-PLUGADA-01`.** *"Peça pronta que ninguém plugou"* é um padrão que este projeto registrou como classe a procurar, depois de encontrá-lo três vezes numa tarde. Um adaptador completo que **nada pode chamar** — não há credencial, não há cofre povoado, não há resolvedora — é exatamente isso, com a agravante de parecer pronto.
2. **A §4 garante edição na primeira chamada real.** Os campos de identidade entram por fora, e o primeiro `POST` contra o sandbox vai corrigir alguma suposição. Escrever agora é escrever duas vezes.
3. **Não há como exercitá-lo.** O valor deste projeto está em medir, e um adaptador testado só contra fixture copiada de documentação de terceiro prova que o código faz o que eu li — não que a Sicoob aceita.

**O que destrava o item 2.2 da `PENDENCIAS`:** a credencial de **sandbox**. Ela é mais barata que o A1 de produção e é o que transforma este arquivo em código exercitável no mesmo dia.
