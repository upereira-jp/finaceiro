# REFERÊNCIA — `g3_fatura_unificada`, medido em 13/08/2026

| Campo | Valor |
|---|---|
| **Data** | 13/08/2026 |
| **Pedido** | *"substitua tudo que está em documentos a diante pelo o que está em https://g3-fatura-unificada.vercel.app/ · verifique o que está no nosso sistema a ser atualizado"* |
| **Fonte** | `github.com/lealvbl-stack/g3_fatura_unificada` · commit **`36e964e`** (13/08/2026 17:18 −03) · público · `main` |
| **Publicado em** | `g3-fatura-unificada.vercel.app` — mesmo bundle, verificado |
| **Substitui** | a descrição da referência em `PLANO-documento-modelo-g3-2026-08-12.md` §2 e §3, que mediu o commit **`ec1e71b`** e está **quatro commits atrasada** |
| **Status** | **Medição. Nada foi construído, nada foi apagado, nenhuma migration.** |

> **Por que este arquivo existe em vez de uma edição no plano de 12/08.** O plano de 12/08 é um registro datado de uma decisão — ele mediu `ec1e71b` e disse a verdade sobre `ec1e71b`. A referência andou depois disso, e três das mudanças **invertem** o que aquele plano descreve. Reescrever o corpo dele falsificaria o registro, que é a mesma decisão do `PATCH-citacoes-2026-07-24.md`. Então o plano ganha um aviso de supersessão no topo e **este** arquivo passa a ser o que a referência diz hoje.

---

## 0. Como isto foi medido

O repositório não é código legível: `index.html` tem **956 KB em 384 linhas**, com o app inteiro empacotado em base64 gzipado dentro de um manifesto `__bundler`. A medição foi feita desempacotando o manifesto e o template — 36 recursos (3 bibliotecas, React 18.3.1 UMD, 15 `woff2` de Barlow, o template) — e depois diferenciando o template desempacotado de `ec1e71b` contra o de `36e964e`.

**Nenhuma afirmação abaixo vem de olhar a página renderizada.** Todas vêm do template e do `renderVals()` desempacotados. Onde a fonte é a página no ar, está dito.

O repositório inteiro são **dois arquivos**: `index.html` e `api/ler-fatura.js`.

---

## 1. Os quatro commits depois de `ec1e71b`

| Commit | Hora (13/08) | O que entrou |
|---|---|---|
| `fefe073` | 16:02 | os três cartões da folha 1 trocam de significado (§2.1) |
| `7c7fe73` | 17:07 | leitura do boleto por IA, conferência e alertas (§4) |
| `d565577` | 17:13 | — (mesmo template de `7c7fe73`) |
| `36e964e` | 17:18 | dígitos verificadores da linha digitável (§6) |

---

## 2. O que mudou, e as três primeiras invertem o plano de 12/08

### 2.1 Os três cartões da folha 1 comparam **energia contra energia**, não conta contra conta

Era o achado mais importante do dia, e ele muda o que a folha **afirma**:

| | `ec1e71b` (o que o plano descreve) | `36e964e` (o que vale) |
|---|---|---|
| Cartão 1 | *"Sem a G3 você pagaria"* · `semG3` = **energia + repasses Equatorial** | *"Seu consumo sem a G3 Solar"* · `integral` = **só a energia** |
| Cartão 2 | *"Sua economia neste mês"* | *"Seu desconto"* — `%` e valor |
| Cartão 3 | *"Seu desconto"* | *"Seu consumo com a G3 Solar"* · `energiaG3` |
| Nota de rodapé | não existia | **"Desconto aplicado sobre a energia compensada. Encargos e tarifas da distribuidora não têm desconto."** |
| Barra do total | *"Valor a pagar com a G3 Solar"* | *"Valor total a pagar"* + subtítulo **"Consumo G3 Solar + tarifas Equatorial"** |

**Por que isso importa mais do que parece rótulo.** Na versão antiga, o cartão comparava a **conta inteira** com e sem a G3, e o desconto de 20% aparecia diluído contra um total que inclui repasses onde não há desconto nenhum. A versão nova compara **a mesma grandeza dos dois lados** — a energia compensada — e diz em letra pequena que o resto não tem desconto. É a diferença entre um número defensável e um número que o cliente contesta na primeira conferência.

### 2.2 "Limpar dados" virou "Nova fatura", e ela **preserva** o que foi registrado

`novaFatura()` pede confirmação, apaga só o rascunho (`fatura:rascunho`), limpa os `input[type=file]`, o código de barras e o QR — e **não toca** nos registros `fatura:{uc}:{AAAA-MM}`. A versão antiga (`limpar`) apagava o rascunho sem confirmar.

### 2.3 A linha digitável passou a ser **conferida**, não só contada

Ver §6. Antes: 47 dígitos ⇒ desenha o código de barras. Agora: 47 dígitos **e** os quatro dígitos verificadores conferem ⇒ desenha.

### 2.4 Duas mudanças menores

- `colunasPagamento` com Pix passou de `1fr 1fr` para **`0.82fr 1.18fr`** — o QR cede espaço para o código de barras;
- `desenharBarcode` reaplica `width/height/imageRendering/shapeRendering` **depois** do `JsBarcode`, com o comentário de que a biblioteca reescreve o atributo `style`.

---

## 3. O contrato de extração da fatura da Equatorial — **o mapa de rótulos existe**

Este é o achado que vale mais para nós, e ele não é sobre desenho.

`pedirExtracao()` manda a fatura (PDF ou imagem) a `claude-sonnet-4-6` com um prompt que **nomeia os rótulos reais de uma fatura da Equatorial Goiás**. Vinte e um campos:

```json
{"cliente":"","documento":"","endereco":"","unidade_consumidora":"","classificacao":"",
 "mes_referencia":"MM/AAAA","data_emissao":"DD/MM/AAAA","leitura_anterior":"DD/MM/AAAA",
 "leitura_atual":"DD/MM/AAAA","dias_faturados":0,"vencimento":"DD/MM/AAAA",
 "energia_compensada_kwh":0,"tarifa_kwh":0,"consumo_nao_compensado_kwh":0,
 "consumo_nao_compensado_valor":0,"iluminacao_publica":0,"bandeira_tarifaria":"",
 "bandeira_valor":0,"outros_encargos":0,"valor_total_equatorial":0,
 "historico_consumo":[{"mes":"JUL/26","kwh":0}]}
```

E as regras, que são o mapa:

| Campo | Rótulo na fatura, conforme o prompt |
|---|---|
| `energia_compensada_kwh` | coluna **"Quant."** da linha **`CONSUMO SCEE`**, tabela *Itens da Fatura*. **Ignorar** `INJEÇÃO SCEE` e `PARC INJET S/DESC`. Somar se houver mais de uma |
| `tarifa_kwh` | coluna **"Preço unit (R$) com tributos"** da linha **`CONSUMO NÃO COMPENSADO`**, com todas as casas. **Se a linha não existir, `0`** |
| `consumo_nao_compensado_kwh` / `_valor` | quantidade e valor da **mesma** linha |
| `iluminacao_publica` | linha **`CONTRIB. ILUM. PÚBLICA - MUNICIPAL`** |
| `bandeira_tarifaria` / `bandeira_valor` | linha **`ADC BANDEIRA …`**. Se não houver: `"Verde"` e `0` |
| `outros_encargos` | *"soma dos demais itens que compõem o total da Equatorial e não foram capturados acima, para que o detalhamento feche com `valor_total_equatorial`"* |
| `historico_consumo` | tabela lateral **`CONSUMO (kWh)`**, **13 meses reais**. Ignorar a linha **`MÉDIA`** e as colunas de dias e de tipo (`LIDA`). A fatura vem decrescente: **inverter** para ordem cronológica crescente |

**O que isto responde e o que não responde.** A `Q-EQTL-CAMPOS-01` está registrada como *"ninguém deste lado viu uma fatura da Equatorial GO"* — e em 08/08 ela já tinha sido meio respondida por um PDF real que o dono trouxe. Este prompt é a **segunda** fonte, independente, e concorda com a primeira no ponto que já estava sabido: a iluminação pública é a linha `CONTRIB. ILUM. PÚBLICA - MUNICIPAL`. Ele acrescenta cinco rótulos que não estavam registrados: `CONSUMO SCEE`, `INJEÇÃO SCEE`, `PARC INJET S/DESC`, `CONSUMO NÃO COMPENSADO` e `ADC BANDEIRA`.

**A ressalva é de natureza da evidência, e ela é séria:** isto é o **texto de um prompt**, não uma fatura medida. Ele registra o que quem o escreveu viu numa fatura. Nada aqui prova que os rótulos estão certos, que estão completos, ou que valem para outra classe tarifária. É insumo forte para fechar a `Q-EQTL-CAMPOS-01`; **não é o fechamento dela**, e o contador continua sendo metade da resposta.

### 3.1 E o mapa **não tem fio B**

`PRD-v2.2` §5.1 define `valor_tarifas_concessionaria` como **fio B + iluminação pública + encargos**, e `src/dominio/fatura-concessionaria.ts` implementa exatamente essas três parcelas. A referência decompõe o repasse de outro jeito — **consumo não compensado + iluminação pública + bandeira + demais** — e a expressão "fio B" **não aparece em lugar nenhum** dos dois arquivos.

As duas decomposições não são traduzíveis uma na outra por inspeção. Ou uma delas está errada, ou elas nomeiam recortes diferentes da mesma fatura. Isso é lacuna, e vai para `QUESTOES.md` (regra 10) em vez de virar suposição minha.

---

## 4. O contrato de extração do boleto Sicoob — **novo em `7c7fe73`**

Segundo caminho de IA, ao lado do da fatura. Mesma rota `/api/ler-fatura`, mesmo modelo, `max_tokens: 1200`:

```json
{"linha_digitavel":"","pix_copia_e_cola":"","beneficiario":"",
 "vencimento":"DD/MM/AAAA","valor":0,"instrucoes":[],"nosso_numero":""}
```

Duas regras do prompt merecem registro porque são **conserto de defeito medido**:

- **`linha_digitavel`** — em `ec1e71b` o prompt pedia *"SOMENTE os dígitos, sem pontos, espaços ou qualquer separador"*. Em `36e964e` ele pede o oposto: transcrever **exatamente como impresso**, com os cinco grupos separados por espaço, e avisa que **"o quarto grupo é um único dígito isolado — não o omita"**. O código faz `.replace(/\D/g,'')` depois. A troca só faz sentido se o modelo estava perdendo o dígito isolado quando lhe pediam a sequência limpa — pedir a transcrição literal e limpar do lado de cá é mais confiável do que pedir a limpeza ao modelo.
- **`instrucoes`** — array com cada linha do campo *"Instruções (texto de responsabilidade do beneficiário)"*, na ordem, sem reformular. **Ignorando** as linhas fixas da cooperativa contratante e do Bancoob.

### 4.1 A conferência do boleto — três alertas

Comparação entre o boleto lido e a fatura calculada, no painel:

| Alerta | Condição |
|---|---|
| Vencimento divergente | `boletoVencimento ≠ d.vencimento`, ambos preenchidos |
| Valor divergente | `abs(boletoValor − total) > 0,01` |
| Beneficiário suspeito | o nome lido **não casa** `/g3/i` |

O terceiro é a contraparte operacional do aviso anti-golpe impresso na folha 2.

---

## 5. A conta

```js
integral  = kwh × tarifa                     // energia compensada × tarifa cheia
desconto  = integral × (perc / 100)
energiaG3 = integral − desconto
tarifaG3  = tarifa × (1 − perc/100)          // apresentação, não dado
demais    = round((totalEq − ncomp − ip − band) × 100) / 100
total     = energiaG3 + totalEq
semG3     = integral + totalEq               // calculado, e não mais exibido (§2.1)
co2       = kwh × fator
```

Parâmetros: **desconto 20%** (`min 0, max 50, step 0.5`) e **fator de emissão 0,029 kg/kWh** — *"fator médio da margem de operação do SIN — MCTI/SIRENE"*. Os dois são editáveis na tela e persistem no rascunho.

Três observações que sobrevivem:

1. **`demais` continua sendo resíduo.** `total − não-compensado − iluminação − bandeira`. Resíduo absorve em silêncio erro de leitura das outras três: se o leitor errar a bandeira, a diferença reaparece como "Demais encargos e tributos" e a folha continua fechando. Isto já estava dito no plano de 12/08 §4 e **não mudou**.
2. **E agora há um campo morto que prova o ponto.** `outros_encargos` é extraído, entra em `CAMPOS_NUM`, entra em `VAZIO` — e **não é exibido em campo nenhum, nem usado no `calc()`**. A referência pede ao modelo a soma dos demais itens e depois calcula o resíduo por conta própria, ignorando o que pediu. Se o campo extraído fosse usado, a linha fecharia por medição em vez de por subtração.
3. **Três valores calculados nunca são desenhados:** `barrasComparativo`, `temComparativo` e `colunasGraficos`. O gráfico comparativo *sem a G3 × com a G3* por mês **é computado e não existe na folha**. A folha 2 tem só o histórico de kWh.

---

## 6. A linha digitável, os dígitos verificadores e o código de barras

Entrou em `36e964e` e é a peça mais reaproveitável do arquivo inteiro.

| Verificador | Algoritmo | Sobre |
|---|---|---|
| campo 1 | módulo 10 (pesos 2,1 da direita; dígito > 9 subtrai 9) | posições 0–8, DV na 9 |
| campo 2 | módulo 10 | posições 10–19, DV na 20 |
| campo 3 | módulo 10 | posições 21–30, DV na 31 |
| geral | **módulo 11 FEBRABAN** (pesos 2..9 cíclicos da direita; resto 0, 10 ou 11 ⇒ **1**) | o código de barras remontado, DV na 32 |

A remontagem 47 → 44 dígitos:

```
barras = l[0..4] + l[32] + l[33..47] + l[4..9] + l[10..20] + l[21..31]
```

E o portão: `codigoBarras()` devolve `''` se **qualquer** verificador falhar — o `JsBarcode` (formato **ITF**, `width 1.6`, `height 55`, sem `displayValue`) só desenha sobre linha conferida. O status na tela nomeia **qual** campo falhou.

**Isto responde a `Q-DOCG3-06` de um jeito que a pergunta não previa.** A questão era *"escrever um codificador Interleaved 2 of 5 ou sair sem código de barras"*. O que a referência mostra é que **a parte difícil não é o codificador** — é saber que a linha está certa antes de desenhar. Os quatro verificadores são ~30 linhas de aritmética inteira, sem dependência, e valem **mesmo se o código de barras nunca for desenhado**: hoje o nosso documento imprime `pagamento.linha_digitavel` sem conferir nada.

---

## 7. As duas folhas, na versão de hoje

Geometria inalterada desde `ec1e71b`: `210mm × min-height 297mm`, `@page { size: A4; margin: 0 }`, `.g3-sheet { break-after: page }`, `[data-noprint]` fora da impressão, rodapé preso por `margin-top: auto`, tudo em **pt**. Padding **13mm 15mm** na folha 1, **11mm 15mm** na folha 2.

### Folha 1 — a conta

1. **Cabeçalho** — logo + *"Energia Solar por Assinatura"* (9pt, `letter-spacing .26em`); à direita `Consórcio G3 Gestão de Energia Solar · CNPJ 66.714.022/0001-21`. Régua 2px `#14213D`
2. **Cliente** — bloco creme; nome 15pt; **CPF/CNPJ mascarado** (5 primeiros caracteres, o resto vira `*`); grade de 4 colunas com 7 metadados, incluindo `Fatura nº` = `{UC}-{AAAAMM}`
3. **Três cartões** — na semântica nova do §2.1, mais a nota de rodapé em 6,5pt
4. **Barra navy** — *Valor total a pagar* / *Consumo G3 Solar + tarifas Equatorial* · 26pt · vencimento · *Pagável em qualquer banco*
5. **Aviso laranja** — triângulo + **"Não pague a conta da Equatorial"** / *"Sua conta é unificada… Pagar a conta da Equatorial gera duplicidade."*
6. **Detalhamento** — grade `1fr 58pt 104pt 116pt` com `subgrid` por linha. Seção *Energia G3 Solar* (tarifa cheia e valor integral **tachados** acima dos com desconto) e seção *Repasses obrigatórios Equatorial (quitados pela G3)* com quatro linhas — não compensado, iluminação pública, bandeira, **demais** — subtotal, e barra navy *TOTAL A PAGAR*
7. **Rodapé** — CNPJ · `Fatura nº · página 1 de 2`

### Folha 2 — consumo e pagamento

1. **Cabeçalho curto** — logo 17pt + `cliente · UC · mês`
2. **Histórico de consumo** — barras em flex, altura 100pt, rótulo kWh em cima e mês embaixo, **última barra em laranja**. Mostra os últimos **13**, não 12
3. **Três indicadores** — *Você já economizou* (27pt laranja; *"com a G3 Solar desde …"* ou *"Primeira fatura com a G3 Solar"*) · *Consumo do mês* (compensado **+** não compensado) · *CO₂ evitado* com a nota do fator
4. **Pagamento** — caixa borda navy; cabeçalho navy com logo + *PAGAMENTO*; quatro campos (beneficiário fixo em texto, nosso número, vencimento, **valor em laranja**); instruções, se houver; duas colunas — **QR Pix 120×120** e **código de barras** com a linha digitável monoespaçada; rodapé em 7px: `EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB` / `COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR`
5. **Rodapé** — telefone **62 3190-2020** em caixa creme; endereço `Rua T-55, nº 930, Sala 910, Ed. Walk Bueno, Setor Bueno, Goiânia/GO`; `sac@g3solar.com.br`; e *Informações importantes*: bandeira do mês, **multa 2% e juros 1% ao mês**, e o aviso de golpe do boleto amarrado ao CNPJ

### 7.1 O guarda contra dado inventado

O gráfico de histórico **some** se a série não parecer consumo real:

```js
histPlausivel = valores.length >= 3
             && max(valores) > min(valores)
             && abs(max(passos) − min(passos)) > 1
```

com a mensagem *"os valores não oscilam como um consumo real — o gráfico fica oculto para não exibir dado inventado"*. É a mesma preocupação que o prompt de extração já carrega (*"não invente progressão regular nem repita valores"*), desta vez do lado de cá. **Vale copiar o princípio inteiro**: o modelo de visão que não acha a tabela inventa uma plausível, e a folha do cliente é o pior lugar do sistema para descobrir isso.

---

## 8. Armazenamento — `localStorage`, por UC e competência

| Chave | Conteúdo |
|---|---|
| `fatura:rascunho` | a fatura em edição, salva a cada digitação |
| `fatura:{uc}:{AAAA-MM}` | fatura registrada: os 21 campos + `percentual`, `fator`, `valor_integral`, `desconto`, `energia_g3`, `total_a_pagar`, `sem_a_g3`, `co2_evitado_kg`, `linha_digitavel`, `pix_payload` |
| `fatura:index` | lista das chaves acima |

A **economia acumulada** e o *"desde …"* saem da soma dos `desconto` dessa série. É a `Q-DOCG3-04` respondida em escopo de app de mesa: histórico por UC, com a competência na chave.

---

## 9. O que **não** se porta

| O quê | Por quê |
|---|---|
| **A aritmética** | `toNum()` é `parseFloat`; `integral`, `desconto`, `demais` e `total` são float. **Regra 1** proíbe, inclusive em intermediário. O desenho se adota, a conta se reescreve em centavos inteiros |
| **`demais` como resíduo** | §5, observação 1. Ou o leitor entrega as quatro parcelas, ou a linha some |
| **`percentual` e `co2`** | não viram centavos — proporção e grandeza física mantêm escala decimal (regra 1, 2º parágrafo) |
| **A chave por UC sem tenant** | `fatura:{uc}:{AAAA-MM}` não tem `tenant_id`. Do lado de cá, índice de negócio é **sempre** composto com `tenant_id` (regra 2) |
| **`api/ler-fatura.js` como está** | §10 |

---

## 10. Achado de segurança no `api/ler-fatura.js` — **medido no ar hoje**

O arquivo tem 38 linhas e faz duas coisas. As duas são problema.

**`GET /api/ler-fatura` publica metadado da chave da API.** Medido em 13/08/2026 contra `https://g3-fatura-unificada.vercel.app/api/ler-fatura`, sem autenticação nenhuma:

```json
{"existe":true,"tamanho":108,"comeca":"sk-ant-api03","termina":"JAAA","temEspaco":false}
```

`comeca: raw.slice(0, 12)` e `termina: raw.slice(-4)` são a chave `ANTHROPIC_API_KEY` em claro, em pedaços. O prefixo é público por natureza; **os quatro últimos caracteres e o comprimento exato não são** — eles transformam a chave num alvo verificável.

**`POST /api/ler-fatura` é um proxy aberto.** O corpo do cliente vai **inteiro** para `api.anthropic.com/v1/messages` com `x-api-key` do servidor, sem autenticação, sem verificação de origem, sem limite de taxa e sem restrição de modelo ou de `max_tokens`. Qualquer pessoa com a URL usa a conta Anthropic do dono para o que quiser, e o consumo aparece como se fosse do app.

**O que isso vale para nós.** É a **regra 5** no concreto: *"segredo por tenant vive em armazenamento cifrado e é acessado por referência"*. Aqui o segredo é de plataforma — variável de ambiente está certo pela regra 5 — mas o endpoint **reexporta** o segredo por outro caminho. A regra cobre a coluna e a variável; não cobria "rota que devolve pedaço da chave", e agora há um exemplo medido de que essa rota existe.

**Recomendação, e ela é do dono, não minha:** girar a `ANTHROPIC_API_KEY`, apagar o ramo `GET` (é diagnóstico de depuração que ficou), e pôr autenticação e teto de gasto no `POST` antes de qualquer coisa deste lado consumir o mesmo desenho. **Nada disto foi feito** — o repositório é de outra conta e mexer nele não estava no pedido.

---

## 11. O que isto muda no nosso sistema

### 11.1 O que a referência **entrega pronto** e nós não temos

| Peça | Nosso estado, medido | Custo |
|---|---|---|
| **Verificadores da linha digitável** (§6) | **não existe.** Nenhum `mod10`/`mod11` em `src/` ou `web/src/`. `documento.tsx:963` imprime `pagamento.linha_digitavel ?? '—'` sem conferir | ~30 linhas puras, sem dependência. **É a de melhor razão valor/custo da lista** |
| **Mapa de rótulos da fatura** (§3) | `Q-EQTL-CAMPOS-01` 🔴 desde 07/08 | insumo, não código |
| **Origem da tarifa cheia** (§3) | `Q-DOCG3-02` 🟡 — a `PLANILHA-cobranca` derivou **R$ 1,185396/kWh** de quatro linhas, e faltava saber *de onde ela vem todo mês*. A referência responde: **coluna "Preço unit (R$) com tributos" da linha `CONSUMO NÃO COMPENSADO`** — e trata o caso em que a linha não existe com aviso explícito na tela | fecha meia questão |
| **Guarda de plausibilidade** (§7.1) | não existe | ~5 linhas, e evita imprimir dado inventado |
| **Conferência boleto × fatura** (§4.1) | não existe. `SICOOB-portal` e `boleto.ts` não comparam nada | 3 comparações |
| **Fator de emissão** | `Q-DOCG3-03` 🟡. `co2` aparece **uma vez** em `web/src/telas/documento.tsx:846`, como prosa dizendo que não existe | a referência usa 0,029 como *default de prop* editável — não resolve a vigência por ano |

### 11.2 O que **contradiz** o que temos

| Contradição | Onde |
|---|---|
| **Fio B não existe no mapa da referência** (§3.1) | `PRD-v2.2` §5.1 e `src/dominio/fatura-concessionaria.ts` decompõem em fio B + iluminação + encargos; a referência, em não compensado + iluminação + bandeira + demais |
| **Os três cartões invertidos** (§2.1) | `PLANO-documento-modelo-g3` §3, folha 1, faixa 3 — descreve `ec1e71b` |
| **12 barras × 13 meses** | o mesmo §3, folha 2 — o prompt pede 13 e a folha mostra `slice(-13)` |

### 11.3 O que continua bloqueado, e o portão não mudou

`PLANO-documento-modelo-g3` §1 estabeleceu que o modelo G3 fixo espera o leitor da Equatorial entregar a quebra real, e **isso continua valendo**. Medido hoje no nosso schema:

| Conceito da referência | Arquivos nossos que o citam |
|---|---|
| `nao_compensado` | **0** |
| `bandeira` (como dado) | **0** — as 2 ocorrências são comentário |
| `historico_consumo` | **0** |
| `fator_emissao` | **0** |
| `tarifa_cheia` | **0** |
| `dias_faturados`, `leitura_anterior` | **0** |

Seis dos vinte e um campos da extração **não têm coluna, tipo nem nome** deste lado. A folha 1 inteira depende dos quatro primeiros.

---

## 12. O que isto abre em `QUESTOES.md`

| Questão | Nível | O que é |
|---|---|---|
| `Q-DOCG3-11` | 🔴 | **A decomposição do repasse não bate.** Fio B (`PRD` §5.1) × não compensado + bandeira (referência). Cruza com `Q-EQTL-CAMPOS-01` e com `Q-DOCG3-10` |
| `Q-DOCG3-12` | 🟡 | **A referência mudou depois do plano.** Os três cartões comparam energia contra energia. Adotamos a semântica nova — que é a defensável — ou a de `ec1e71b`? |
| `Q-REF-SEGREDO-01` | 🔴 | **`api/ler-fatura.js` publica metadado da chave e é proxy aberto** (§10). Fora do nosso repositório e dentro do nosso desenho |

E move duas que já existiam: `Q-DOCG3-02` (a tarifa tem origem nomeada na fatura) e `Q-DOCG3-06` (o problema era conferir, não codificar).

---

## 13. Redundância no sistema — inventário medido em 13/08

> **Pedido de 13/08:** *"verifique se há alguma redundância no sistema, quero que haja o mínimo de redundâncias… quero que a referência substitua o que existia anteriormente na parte em que se propõe a fazer"*.
>
> O que segue é **medição, não proposta executada**. Nada foi removido.

### 13.1 A redundância grande: **dois sistemas de composição do mesmo documento**

O documento de cobrança tem hoje **duas superfícies de configuração**, e elas resolvem o mesmo problema por caminhos que não se falam:

| | Superfície A — **conteúdo** | Superfície B — **posição** |
|---|---|---|
| Rota | `GET`/`PUT /cobranca/campos` | `GET`/`PUT /cobranca/layout` |
| Domínio | `src/dominio/layout-do-documento.ts` (195) | `src/dominio/layout-visual.ts` (349) |
| Tabela | `campo_do_documento` | `layout_do_documento` + `bloco_do_documento` (migration 23) |
| O que configura | ordem, rótulo e visibilidade das linhas | bloco posicionado em milímetro, arrastável |
| Tela | lista de campos | `web/src/telas/layout-editor.tsx` (344) |

**A referência propõe fazer exatamente o que a superfície B faz — e propõe fazer sem configuração nenhuma.** As duas folhas A4 do modelo G3 são composição **fixa**: não há bloco, não há milímetro, não há arrastar. Se o modelo fixo entra, a superfície B não fica menor — ela deixa de ter função.

**A superfície A não é redundante com ela** e continua: rótulo e ordem da tabela de valores são conteúdo, e o modelo G3 tem uma tabela de valores.

**A conta do que sai, medida por arquivo:**

| O que sai | Linhas |
|---|--:|
| `src/dominio/layout-visual.ts` | 349 |
| `web/src/telas/layout-editor.tsx` | 344 |
| `tests/layout-visual.ts` | 255 |
| `src/repos/documento.ts` — `layout()`, `blocos()`, `salvarLayout()`, `BlocoForaDaPagina` (≈ 423–533) | ≈ 110 |
| `web/src/layout-regras.ts` — `naGrade`, `arrastar`, `redimensionar`, `blocoNovo`, `PASSO_MM`, `MINIMO_MM` | ≈ 90 |
| `src/http/rotas.ts` — as duas rotas de `/cobranca/layout` | ≈ 18 |
| `web/src/telas/documento.tsx` — o `import` e o `<EditorDeLayout />` | 2 |
| **Total** | **≈ 1.170 linhas** + 2 tabelas |

**Medido, e é o que autoriza cortar sem caçar referência:** `naGrade`, `redimensionar` e `blocoNovo` são usados **por um arquivo só** — o próprio `layout-editor.tsx`. A única ocorrência de `arrastar` fora dele é a palavra num comentário de `src/repos/documento.ts:226`. Já `escalaDaPrevia`, `regraDaPagina` e `ladoDoQr` são usados por cinco, três e quatro arquivos: **ficam**, e é por isso que o corte é em `layout-regras.ts`, não do arquivo.

**A trava de sequência continua de pé, e ela não é opinião.** O `PLANO-documento-modelo-g3-2026-08-12` §1 já tinha estabelecido: as duas coisas executadas juntas deixam o sistema **sem documento nenhum**, porque o editor é o único documento que existe até o modelo fixo estar pronto do outro lado — e o modelo fixo depende do leitor da Equatorial entregar a quebra real (§11.3: seis dos vinte e um campos não têm coluna nem nome deste lado). **O destino não se rediscute; a ordem é que importa.** Remover a superfície B é o **último** passo, não o primeiro.

### 13.2 A redundância pequena, e essa é removível hoje: **três `emReais`**

| Onde | Implementação | Nulo |
|---|---|---|
| `src/dominio/centavos.ts:208` | `Math.trunc(c/100).toLocaleString('pt-BR')` | **lança** (`exigirCentavos`) |
| `src/dominio/layout-do-documento.ts:106` | por **texto**, sem divisão — *"(regra 1)"* | não trata |
| `web/src/dinheiro.ts:88` | `Math.trunc`/`toLocaleString` | devolve `—` |

**As duas do servidor foram executadas lado a lado hoje** — `0, 1, 5, 99, 100, 999, 1000, 123456, 100000000, 999999999999` e os negativos: **saída idêntica nos 16 casos**. A de `layout-do-documento` é duplicata comportamental da de `centavos`, e a diferença que resta é que ela **não valida** o que recebe — aceita `number` cru onde a outra exige `Centavos`.

**Isso não é detalhe de estilo:** é a função que imprime dinheiro **na fatura do cliente**, e ela é a cópia sem validação. A de `web/src/dinheiro.ts` é duplicação **justificada e já registrada** em `centavos.ts:155` — servidor e browser são runtimes diferentes. A terceira não tem justificativa escrita.

**Remoção:** `layout-do-documento.ts` importa `emReais` de `centavos.ts` e reexporta, se o nome precisar continuar no lugar. Uma linha, dentro da regra 1, sem tocar em rota nem em tabela — e a única coisa a decidir é o que fazer com `flag_fatura_cheia` e outros campos que hoje chegam como `number` cru.

### 13.3 O que **parece** redundante e não é

| Par | Por que fica |
|---|---|
| `Qr` × `QrDaFaixa` em `documento.tsx` | resolvem problemas opostos — o de conferência lê o desenho (`ladoDoQr`), o da faixa é milímetro de folha. O motivo está escrito no arquivo |
| `src/concessionaria/porta.ts` × o `api/ler-fatura.js` da referência | a porta é o **encaixe**, não o concorrente: `PortaDeLeitura` é exatamente onde um extrator por modelo de visão entra. Medido: os dois arquivos de `src/concessionaria/` são usados **só por teste** hoje — não há consumidor de produção, e portanto não há duplicação em produção |
| `src/dominio/qrcode.ts` × `src/dominio/brcode.ts` | matriz do QR × payload do Pix. Coisas diferentes |
| `src/dominio/fatura-concessionaria.ts` × o prompt de extração | validação × extração. O plano de 07/08 separou os dois de propósito: *"trocar o extrator não toca uma linha daqui"*. **O que conflita não é o código, é o conjunto de campos** — ver `Q-DOCG3-11` |

### 13.4 A ordem, para redundância mínima sem ficar sem documento

1. ✅ **construído em 14/08** — colapsar os três `emReais` em dois (§13.2, §14.1)
2. ✅ **construído em 14/08** — os quatro dígitos verificadores da linha digitável (§6, §14.2)
3. abrir o portão: `fatura-concessionaria.ts` ligado à fatura, com a quebra em quatro parcelas e **sem resíduo** — depende de `Q-DOCG3-11`
4. ✅ **construído em 14/08** — composição fixa no servidor, em centavos, ao lado da posicionada (§15)
5. ✅ **construído em 14/08** — a folha 1 em `documento.tsx`, e ela é o padrão da tela. A folha 2 espera o passo 3
6. ✅ **construído em 14/08** — retirada a superfície B inteira (§13.1) e a migration 27 de remoção (§16)

---

## 15. A folha 1, construída em 14/08

| | |
|---|---|
| **Suíte** | `npm test` · **`EXIT=0`** · `web:build` ✅ |
| **Migration** | **26** — `identidade_de_cobranca` ganha `razao_social` e `cnpj`. **Aplicada em produção em 14/08**, `applied_steps_count = 1`, sem rollback. Conferido pela `DIRECT_URL`: as duas colunas, os dois CHECKs, o gatilho `auditar_identidade_de_cobranca` e a policy `tenant_isolation` — os dois últimos **herdados**, sem uma linha de SQL |
| **Novo** | `src/dominio/folha-g3.ts`, `tests/folha-g3.ts` (23 verificações) |
| **Tocado** | `repos/documento.ts`, `web/src/api.ts`, `web/src/estilo.ts`, `web/src/telas/documento.tsx`, `prisma/schema.prisma` |

### 15.1 O que entrou

Cinco das sete faixas da folha 1: cabeçalho com a assinatura e o emissor, bloco do cliente em creme com **CPF/CNPJ mascarado**, a grade de metadados, a barra navy do total, o aviso laranja *"Não pague a conta da Equatorial"*, a faixa de pagamento (que já existia desde 12/08) e o rodapé.

**Composta no servidor**, em centavos, pelos mesmos formatadores do resto do documento. A tela não decide rótulo, não formata dinheiro e não mascara documento — o CRM consome a mesma rota e não roda React.

**É o padrão da tela** desde hoje. O layout configurável continua alcançável por um interruptor, e o motivo é o de sempre: retirá-lo antes de a folha G3 estar completa deixaria o sistema sem documento. Mas um destino que nasce escondido atrás de um interruptor desligado não é destino.

### 15.2 O que não entrou, e a folha diz

Os **três cartões** e o **detalhamento dos repasses**. Os dois dependem de dado que não existe aqui — tarifa cheia (`Q-DOCG3-02`, `Q-TARIFA-CRM-01`) e a quebra em quatro parcelas (`Q-DOCG3-11`).

`folha.faixas_ausentes` carrega **faixa, motivo e a questão que destrava**, e aparece na tela — nunca no papel. Imprimir a lista entregaria ao cliente as nossas pendências; escondê-la faria a folha parecer pronta.

Desenhar as duas com o que há seria pior que omiti-las: um cartão de desconto calculado sobre tarifa suposta é um número errado no campo que prova a economia ao cliente — e o cliente confere.

### 15.3 O que a fotografia pegou, e a leitura de código não pegaria

Fotografada contra a SPA real (`web/dist` + mock com payload gerado pelos **próprios módulos** do projeto, não escrito à mão):

| Achado | Conserto |
|---|---|
| Sem logo, o nome do emissor saía **duas vezes** no cabeçalho — uma como reserva da logo, outra à direita | o espaço da logo fica vazio. Ausência de logo é ausência de logo; a marca continua dita, uma vez |
| A linha digitável saía com os **47 dígitos corridos** | `linhaDigitavelFormatada` já existia desde a manhã e não estava ligada. Agora viaja como `pagamento.linha_digitavel_br`, formatada no servidor |
| `Nome / razao social` sem o til | `razão` |

E a medição que fecha: `page.pdf({preferCSSPageSize:true})` — o mesmo caminho do diálogo de imprimir — devolve **1 página**. Era a medição que faltava em 09/08, quando um conteúdo maior que o bloco saía cortado.

### 15.4 A migration sem onde preencher, e o conserto

Aplicar a 26 expôs um buraco meu: **a coluna existia e não havia formulário.** Um campo que só o `psql` alcança não é um campo — é uma coluna.

Entrou o cartão **"Quem emite a fatura"** na aba Documento, com razão social e CNPJ. O CNPJ é conferido pelo **dígito verificador** na aplicação (`CnpjDoEmissorInvalido`, 422), não só pelo formato do CHECK — mesma divisão da chave Pix, e o motivo é que este número sai impresso ao lado do aviso que manda o cliente conferir antes de pagar.

E com a coluna existindo, o **Beneficiário do boleto** deixou de faltar — era o pedido original da `Q-DOCG3-08`, omitido em 12/08 por não haver de onde tirá-lo. Continua **omitido quando ausente**, nunca com travessão: um `—` sob o rótulo do aviso anti-golpe ensina o cliente a aceitar fatura sem beneficiário. Medido em `W5k`.

**Produção tem 1 linha em `identidade_de_cobranca` e `razao_social` vazia.** Até alguém preencher pelo cartão novo, a folha sai sem a linha do emissor — que é o comportamento correto, e não o desejado.

---

## 14. O que foi construído em 14/08

| | |
|---|---|
| **Suíte** | `npm test` · **`EXIT=0`** · 0 migrations · nada escrito em produção |
| **Novo** | `src/dominio/linha-digitavel.ts`, `tests/linha-digitavel.ts` (**30 verificações**) |
| **Tocado** | `src/dominio/centavos.ts`, `src/dominio/layout-do-documento.ts`, `src/repos/documento.ts`, `tests/layout-do-documento.ts` (+2 verificações), `package.json` |
| **Não tocado** | o editor de layout, a superfície B inteira, o schema |

### 14.1 As três `emReais` viraram duas

A que morreu era a de `layout-do-documento.ts` — e ela era **a que imprimia dinheiro no documento que vai ao cliente**, e a única das três **sem validação**: aceitava `number` cru onde as outras exigem `Centavos`.

**Medido antes de colapsar:** as duas do servidor executadas lado a lado em **4.042 casos** — toda a fronteira do inteiro seguro (`10^n ± 1` para n de 3 a 15, `MAX_SAFE_INTEGER`) e 4.000 sorteados. **Saída idêntica em todos.** Não havia divergência a corrigir; havia uma superfície a menos para divergir amanhã.

**A que sobreviveu é a "por texto"**, e a escolha não é de gosto. A de `centavos.ts` fazia `Math.trunc(a / 100)` — dividir dinheiro por 100 é passar por float. A medição mostrou que é exata para todo inteiro seguro, mas **exata por medição, não por construção**; recortar a string não tem cálculo nenhum. Então a implementação de `layout-do-documento` subiu para `centavos.ts` e ganhou o `exigirCentavos` que não tinha.

E **não há reexportação**: reexportar não duplica código, mas duplica o caminho, e dois `import` legítimos do mesmo símbolo é o começo de alguém achar que são dois. Os consumidores (`repos/documento.ts`, `tests/layout-do-documento.ts`) foram reapontados.

`web/src/dinheiro.ts` **fica** — é duplicação justificada e já registrada em `centavos.ts`: o browser não importa de `src/`.

**O que isso mudou de comportamento**, e é o ganho real: um valor que não é centavo inteiro chegando ao documento agora é **recusado com nome** em vez de formatado em silêncio. Verificado em `D1e`/`D1f`.

### 14.2 Os quatro dígitos verificadores

`src/dominio/linha-digitavel.ts` — puro, sem rede e sem banco: `modulo10`, `modulo11`, `conferirLinhaDigitavel`, `codigoDeBarrasDaLinha`, `linhaDigitavelFormatada`, `vencimentoDoFator`, `dadosDoCodigoDeBarras` e `conferirBoleto`.

**A linha de teste é real.** `75691.50043 01727.686907 00000.130013 1 15410000059669`, do prompt de extração da referência, **passa nas quatro verificações** — coincidência de 1 em 10.000 — e decodifica para banco **756** (Sicoob), moeda 9, **R$ 596,69**, fator 1541 = **17/08/2026**. Tudo coerente com um boleto emitido nesta semana.

**Fizemos duas coisas que a referência não faz.**

A primeira: a referência *deriva* o código de barras da linha. Nós **recebemos os dois** do banco (`boleto.linha_digitavel` e `boleto.codigo_barras`) e **nada os comparava**. Agora a linha é remontada e conferida contra o que o banco gravou.

A segunda, e é a que vale mais: **o código de barras carrega o valor em centavos inteiros e o vencimento**, e os dois são compráveis contra `fatura.valor_total_centavos` e `fatura.vencimento`. Um boleto registrado com valor diferente do da fatura era invisível deste lado; passa a ser um número que não bate. É a mesma conferência que a referência faz lendo PDF com modelo de visão (§4.1) — por aritmética, em centavos, sem IA.

#### O buraco que a medição exaustiva achou

As 47 posições × 9 dígitos alternativos dão **423** corrupções de um dígito. Medido:

| Posições | Variantes | Passam despercebidas |
|---|--:|--:|
| 0–31 — campos 1, 2 e 3 | 297 | **0** |
| 33–46 — fator + valor | 126 | **26** |

**O campo que os verificadores protegem pior é justamente o que carrega o dinheiro.** A causa é a regra de colapso do módulo 11 — resto 0, 10 ou 11 viram DV 1, e o DV desta linha *é* 1, então várias somas diferentes chegam nele. Os campos 1 a 3 não têm o buraco porque são protegidos duas vezes, pelo módulo 10 do próprio campo e pelo módulo 11 geral.

Um erro de um dígito no valor tem **~1 chance em 5** de não ser pego pelos verificadores. Quem fecha esse buraco é exatamente a comparação com `valor_total_centavos` — o que torna a segunda conferência do §14.2 requisito, e não enfeite.

#### Onde isso aparece

`pagamento.conferencia` no payload de `GET /faturas/:id/documento`. **Não vai para o papel** — o CRM consome a mesma rota e precisa saber tanto quanto a nossa tela, mas dizer ao cliente que o boleto dele pode estar corrompido não ajuda o cliente.

**Ela conta e nomeia; não recusa nada.** É o precedente do projeto, e havia motivo concreto: `src/sicoob/falso.ts` produz linha fora do padrão de propósito, e recusa dura quebraria a suíte sem que nada de produção estivesse errado. **O que fazer quando diverge é decisão de dono e não minha — `Q-DOCG3-13`.**


---

## 16. A superfície B saiu — 14/08, fim do dia

`1.914 linhas` removidas, `50` acrescentadas. Três arquivos apagados inteiros — `src/dominio/layout-visual.ts`, `web/src/telas/layout-editor.tsx`, `tests/layout-visual.ts` —, duas rotas, dois modelos do Prisma, cinco enums e as duas tabelas da migration 23.

### 16.1 O que autorizou

O custo chegou a **zero**, e isso foi medido, não estimado. O layout posicionado tinha **cinco** tipos de bloco: `logo`, `texto`, `linha`, `pagamento` e `tabela_de_campos`. A folha G3 cobria quatro; a tabela de valores entrou na mesma tarde e fechou o quinto. Não existe documento que só o editor soubesse desenhar.

Até esse ponto a resposta era o contrário, e está escrita em três documentos: o editor era o **único** documento que existia. Não era teimosia, era ordem.

### 16.2 A medição que fecha o argumento

Contra produção, pela `DIRECT_URL`, antes de escrever a migration:

| Tabela | Linhas |
|---|--:|
| `layout_do_documento` | **0** |
| `bloco_do_documento` | **0** |
| `campo_do_documento` | **15** |

**As duas superfícies pareciam gêmeas e não eram.** A de conteúdo foi usada; a de posição nunca recebeu um registro em onze dias. É a confirmação mais direta de que a que fica é a certa — e `campo_do_documento` fica inteira, porque responde outra pergunta: *quais* campos, com que rótulo e em que ordem. O modelo G3 substituiu a **posição**, não o **conteúdo**.

### 16.3 O que ficou, e por quê

De `web/src/layout-regras.ts` sobraram quatro de doze exportações — `escalaDaPrevia`, `PX_POR_MM`, `regraDaPagina`, `ladoDoQr`. Não eram do editor: são do **papel**, e continuam servindo a folha G3. As oito que saíram (`naGrade`, `arrastar`, `redimensionar`, `blocoNovo`, `areaDaFolha`, `medidasComOrientacao`, `PASSO_MM`, `MINIMO_MM`) não tinham consumidor fora do editor e do teste dele — medido antes de remover.

De `web/tests/layout.ts` sobraram três seções de dez: W7 (escala), W8 (`@page`) e W10 (o lado do QR).

### 16.4 O que um teste pegou, e a revisão de código não pegaria

`D12` afirma que o tamanho real é aplicado a `#documento .folha` **descendente** e nunca a `#documento.folha` composto — o seletor de que o lote inteiro depende. A classe virou `.g3` e o teste caiu na hora. **O invariante não mudou; o nome mudou**, e sem essa verificação a troca incompleta teria ido para produção imprimindo a primeira folha do lote e mais nada.

### 16.5 O guarda de arranque acompanhou

`[financeiro] client gerado cobre as 35 tabelas de public` — eram 37. A guarda compara o catálogo com os modelos do client e recusa subir se divergirem; ela seguiu a remoção sem ninguém atualizar número nenhum, que é o que se espera de uma conferência que lê o catálogo em vez de uma constante.
---

## 17. A INTERFACE virou a referência — 14/08, fim do dia

| | |
|---|---|
| **Pedido** | *"quero ajustar o layout da interface da aba documentos. A referência exata deve ser `https://g3-fatura-unificada.vercel.app/`, sem tirar nem por, deve ser exatamente igual, com bordas iguais, sistema de cores, tipografia"* |
| **Suíte** | `npm test` · **`EXIT=0`** · **1.904** verificações (linha de base medida em `eb1710d`: **1.893**; as 11 novas são desta leva) · `web:build` ✅ |
| **Migration** | **nenhuma.** Nada de schema, nada escrito em produção |
| **Novo** | 16 `woff2` de Barlow em `web/public/fontes/` + `LICENSE-barlow.txt` |
| **Tocado** | `web/src/tema.ts`, `web/src/estilo.ts`, `web/src/telas/documento.tsx`, `web/src/telas/fatura-unificada.tsx`, `web/tests/interface.ts` |

Até 14/08 a paridade era de **folha**: as duas A4 já saíam iguais às da referência (§15, §16). A **interface** — a esteira de conferência, que é onde quem opera passa o dia — continuava sendo o desenho da casa: Inter, cantos de 12px, sombra em três degraus, a tinta apagada nos derivados AA.

### 17.1 As três decisões do dono, e as três foram consultadas com o número na mão

| Pergunta | Resposta | O que ela custa |
|---|---|---|
| A tinta apagada e o laranja-texto da referência reprovam AA (3,08:1 e 2,69:1) e este repo os tinha trocado na **manhã do mesmo dia**. Adotar? | **Exato** | `Q-DOCG3-15`, e a exceção está cercada por três invariantes |
| A referência não tem tema escuro. A aba fica clara sempre? | **Acompanha o tema** | cada token da ilha remapeia para o equivalente medido da casa |
| Replicar a barra navy dela (logo + abas de etapa)? | **Só o conteúdo** | o sistema já tem faixa navy no topo; duas empilhadas seriam a referência copiada e a tela piorada |

### 17.2 A ilha `.g3ref`, e por que ela é uma classe só

`documento.tsx` põe `<div className="g3ref">` **uma vez**, em volta da aba inteira. Dentro dela valem outra fonte, outra paleta, raio zero e sombra nenhuma; fora, nada muda. A fronteira é explícita e verificável — e se um dia a referência virar o padrão do sistema, tira-se a classe e sobem-se os tokens para o `:root`.

| | casa | ilha |
|---|---|---|
| fonte | Inter | **Barlow** (corpo) + **Barlow Semi Condensed** (todo rótulo, botão e número grande) |
| raio | 12 / 8 / 6px | **0** |
| sombra | três degraus | **nenhuma** |
| entrelinha | 1,5 | **`normal`** (~1,2 na Barlow) — a referência não declara nenhuma |
| tinta apagada | `#66686F` | `#8F939D` |

### 17.3 A tipografia veio dos bytes da própria referência

Os 16 `woff2` foram **desempacotados do manifesto `__bundler` de `36e964e`** — não baixados de novo do Google. Conferido contra o que o Google serve hoje (`/s/barlow/v13`, `/s/barlowsemicondensed/v16`): **mesma versão 1.408, mesmos 272 glifos, mesmas larguras** em `A a M m 0 R $` e espaço. Os arquivos daqui são ~30% menores porque o empacotador recomprimiu o `woff2`; o contorno é o mesmo, logo a linha quebra no mesmo lugar.

**O `vietnamese` não veio** — 47 KB que nenhuma fatura em português alcança, e `unicode-range` faz o browser baixar só o subconjunto que a página pinta. **As URLs do `fonts.gstatic.com` não vieram**: a fonte é servida pela nossa origem, como a Inter desde 30/07.

### 17.4 A prova: 62 propriedades computadas contra os valores medidos

Fotografada contra a SPA real (`web/dist` + mock com o payload de composição gerado pelos **próprios módulos** do projeto — `calcular` e `comporFolhas` —, não escrito à mão). O que o browser **calculou**, comparado ao que o template desempacotado **declara**: **62 de 62 batem**. Entre elas:

| | |
|---|---|
| cartão da esquerda | `1px solid #E4DED2` · `padding 22px` · `border-radius 0` |
| cartão da direita | `padding 26px` |
| grade | `380px 1fr` · `gap 24px` · coluna esquerda `gap 18px` |
| rótulo caixa alta | Barlow Semi Condensed · 12px · `letter-spacing .14em` · `#8F939D` |
| área de envio | `1px dashed #C9C1B1` sobre `#F6F2EA` · `24px 18px` · título 19px/600 |
| painel navy | `#14213D` · `padding 24px` · total **52px/700** · rótulo `#F4A65A` · régua `#2C3A56` |
| campo | `1px solid #DDD6C8` sobre `#FBF9F5` · 15px · `8px 10px` |
| parâmetros | a borda forte `#C9C1B1` sobre creme — os dois únicos campos assim na referência |
| aviso | `#FBF1E4` · filete de 3px `#E8843C` · `9px 11px` · 13px/1,45 |
| botão primário | `#E8843C` · `13px 22px` · 16px/600 caixa alta condensada |
| botão comum | contorno `#DDD6C8`, **caixa baixa**, Barlow 14px — o de repouso dela é o mais discreto dos quatro |

E a diferença que o teste **preservou** em vez de aplainar: o bloco de conferência do boleto usa `1fr 1fr`, `gap 12px` e rótulo de **13px com margem 3px** — os outros valores da referência, e o único lugar dela em que eles aparecem.

### 17.5 O cartão que faltava, e ele não custou rota

**"Faturas registradas nesta UC"** é o quinto cartão da coluna da esquerda na referência, e não existia aqui. Mês, total, um `excluir` por linha e o botão de registrar embaixo. As três rotas já existiam desde a migration 29 — e **`GET` e `DELETE` não tinham um chamador de produção sequer**. A lacuna era de tela, não de sistema.

**Registrar desceu para dentro dele**, e a mudança não é de lugar: registrar e imprimir eram dois botões do mesmo tamanho no mesmo canto, e são atos de natureza diferente — imprimir é conferência e não escreve nada; registrar escreve no banco e muda o que a folha do **mês que vem** afirma. Junto da lista do que já foi registrado, o botão mostra o efeito antes do clique.

### 17.6 O que **não** veio, e são quatro, todas nomeadas

1. **O ícone do `.fu-status` e do `.aviso` fica.** A referência diz sucesso e falha com 13px de texto colorido e nada mais; quem não separa laranja de verde lê as duas iguais. É a restrição 3 do tema, e ela não é sobre borda, cor nem tipografia.
2. **O anel de foco de botão fica.** A referência desenha foco só em `input` e `textarea`. O anel daqui usa o laranja **dela**, então não introduz cor nova.
3. **`display: none` no input de arquivo não veio.** É como a referência esconde o input dentro do `<label>`, e tira o controle da ordem de tabulação e da árvore de acessibilidade — as duas áreas de envio ficariam inalcançáveis sem mouse. Aqui ele é invisível **e** focável.
4. **A barra navy** — §17.1.

E a medida de linha (`max-width: 82ch`) ficou nos parágrafos de ajuda: a referência não tem `max-width` porque a única prosa dela é a nota de uma linha dos parâmetros; a aba 3 tem parágrafos de cinco linhas, e 12px correndo por 1.120px é o texto que ninguém lê. **Onde a referência tem opinião vale a dela; onde ela não tem, vale a nossa.**

### 17.7 O que a foto pegou, e a leitura de código não pegaria

**Os dois botões de contorno ficavam creme sobre creme no tema escuro.** Eles invertem no hover — o fundo vira a tinta —, e os dois escreviam `--g3ref-navy-tinta` onde precisavam de "a tinta que pousa sobre `--g3ref-tinta`". No claro dava certo por coincidência (as duas são o mesmo creme); no escuro `--g3ref-tinta` é o creme e o rótulo **sumia ao passar o mouse**. Nenhum invariante pegaria: os dois tokens existem nos dois temas, só significam coisas diferentes. Entrou `--g3ref-tinta-invertida`; medido depois: **14,31:1 nos dois temas**.

E a medição que fecha: `page.pdf({preferCSSPageSize: true})` — o mesmo caminho do diálogo de imprimir — devolve **2 páginas** para as duas folhas A4. A ilha não vazou para a impressão.

### 17.8 Os invariantes novos, e um buraco que eles expuseram

Nove verificações entraram em `web/tests/interface.ts` (62 → 73). Elas não medem "está igual" — isso é foto. Medem a **erosão**: a ilha é feita de escolhas que contrariam o resto do sistema, e escolha assim volta sozinha na próxima edição distraída.

| | |
|---|---|
| `I1d` `I1e` `I1f` | o Gray não pinta nada nas **regras**; no bloco de variáveis ele só aparece dentro de `.g3ref`; e só ocupa token `--g3ref-*` |
| `I8a` | a ilha tem bloco de tokens e ≥ 40 regras |
| `I8b` | **todo token do claro tem contraparte no escuro** — sem ela o escuro herda o literal claro em silêncio, e um `--g3ref-papel` esquecido pinta um cartão branco dentro da tela escura |
| `I8c` | nenhuma regra da ilha tem raio ou sombra |
| `I8d`–`I8g` | as duas famílias, os quatro pesos, `swap` em todas, **zero URL externa**, e a pilha de sistema atrás |
| `I8h` | dentro da ilha só entram tokens `--g3ref-*` — mais os três estados (`erro`, `ok`, `alerta`) que a referência não tem |

**E a `I7d` tinha um buraco que só apareceu agora.** Ela afirmava *"todo outline do sistema usa `var(--foco)`"* com o padrão `var\(--([a-z-]+)\)`, e `[a-z-]` não casa o `3` de `--g3ref-`: um `outline: 2px solid var(--g3ref-laranja)` **simplesmente não era visto**. Não era exceção passando de propósito — era o teste não medindo o que dizia medir. Agora ele lê regra a regra, e a fronteira é explícita: fora da ilha `--foco`, dentro dela o laranja da referência (`I7f`).

**E a lição de método que o mesmo dia deu duas vezes:** `border-radius:\s*(?!0\b)` parece dizer "raio diferente de zero" e não diz — `\s*` casa **vazio**, o lookahead cai sobre o espaço depois dos dois-pontos, e `border-radius: 0` era acusado como raio. Todo teste "propriedade com valor diferente de X" escrito por regex tem essa armadilha. As declarações agora são **parseadas**, não casadas.
