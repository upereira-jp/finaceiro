# PLANO — o documento passa a ser o modelo G3 fixo

| Campo | Valor |
|---|---|
| **Data** | 12/08/2026 |
| **Pedido** | *"preciso que edite a página de documento. Quero o design exatamente como está nesse github. Adapte o que for necessário para manter o padrão que está no github, não quero redundâncias"* |
| **Fonte** | `github.com/lealvbl-stack/g3_fatura_unificada` · commit `ec1e71b` · dois arquivos (`index.html`, `api/ler-fatura.js`) |
| **⚠️ Supersedido em parte** | **13/08/2026.** A referência andou **quatro commits** depois de `ec1e71b` e três mudanças **invertem** o que os §2 e §3 abaixo descrevem. O que a referência diz hoje está em **`REFERENCIA-fatura-unificada-2026-08-13.md`** |
| **Status** | **Plano + a primeira peça construída.** A faixa de pagamento entrou (§6); o resto espera o portão do §1. **Nada foi apagado** |
| **Suíte** | `EXIT=0` · **3 verificações novas** (W4o/W4p/W4q) · **0 migrations** · nada escrito em produção |
| **Decide** | a terceira volta da `Q-DOCFATURA-01`: o layout deixa de ser configurável e passa a ser fixo |

> **Este plano registra uma reversão, e é por isso que ele existe.** O dono decidiu duas vezes pelo layout configurável — 30/07 (*"layout configurável por tenant"*, contra a minha recomendação de fixo) e 03/08 (*"colocar os elementos onde eu desejar"*, que virou a migration 23). Em 12/08 a decisão inverteu. Reverter em silêncio é o que faz um projeto perder o porquê, então a reversão vira entrada em `QUESTOES.md` (regra 10) e este plano é o corpo dela.

---

## 1. Por que nada foi construído hoje

Duas decisões foram tomadas em 12/08, e elas são **destino** e **portão**, não contradição:

| Pergunta | Decisão |
|---|---|
| O que acontece com o editor de blocos? | **Substitui — o editor sai.** O documento passa a ser o modelo G3 fixo |
| Os painéis sem dado (economia, desconto, CO₂, histórico, quebra da Equatorial)? | **Esperar o leitor da Equatorial.** A folha só entra com a quebra real |

Executadas juntas **hoje**, as duas deixariam o sistema **sem documento nenhum**: o editor sairia antes de existir o que o substitui. Então a leitura é sequencial —

- o **destino** está decidido e não se rediscute: o modelo G3 fixo é o documento;
- o **portão** é o leitor da Equatorial entregando a quebra real;
- o **editor de blocos continua vivo até a virada**, porque até lá ele é o único documento que existe.

**Consequência prática:** `src/dominio/layout-visual.ts`, `web/src/telas/layout-editor.tsx` e o `EditorDeLayout` na tela **não foram tocados**. Eles saem no dia da virada, de uma vez, com o modelo pronto do outro lado.

---

## 2. O que a fonte é, medido

> **⚠️ Este §2 e o §3 medem `ec1e71b`, e a referência avançou em 13/08.** O corpo fica intacto porque é registro datado — reescrevê-lo falsificaria o que foi decidido em 12/08 e com base em quê. **O que mudou está em `REFERENCIA-fatura-unificada-2026-08-13.md` §2**, e o resumo é: os três cartões da folha 1 trocaram de significado (passaram a comparar energia contra energia), entrou leitura do boleto por IA com conferência, e entraram os quatro dígitos verificadores da linha digitável. O histórico são **13** meses, não 12.

O repositório não é um projeto React legível: é **um HTML de 929 KB** com o app empacotado em `<script type="__bundler/*">` — manifesto gzipado em base64 + um template. Desempacotado, são 36 recursos: três bibliotecas (`pdf.js`, `JsBarcode v3.11.6`, `qrcode`), React 18.3.1 por UMD, **15 arquivos woff2 de Barlow** e o template com o app.

O app tem duas abas — *1 · Leitura e cálculo* (upload da fatura da Equatorial e do boleto Sicoob, extração por modelo de visão via `api/ler-fatura.js`) e *2 · Emissão* (a folha imprimível). **É a aba 2 que interessa aqui**: duas folhas A4.

### A paleta já é a nossa — e é o achado que encolhe o trabalho

`web/src/tema.ts` roda exatamente os mesmos valores de marca:

| Papel | Referência | `tema.ts` (CLARO) |
|---|---|---|
| Navy | `#14213D` | `texto`, `topo` ✅ |
| Cream | `#F6F2EA` | `fundo`, `topoTexto` ✅ |
| Orange | `#E8843C` | `acento` ✅ |
| Gold | `#F4A65A` | acento do escuro ✅ |
| Gray | `#8F939D` | ⚠️ ver abaixo |

**Não há trabalho de cor.** Há três divergências, e as três são decisões e não descuido:

1. **O cinza dos rótulos.** A referência escreve rótulo em `#8F939D` sobre o creme. `tema.ts` mediu isso em **2,75:1** e derivou `fraco: #66686F` porque AA de texto pede 4,5. Adotar o valor da referência **reverte uma decisão de acessibilidade medida**, e `web/tests/tema.ts` falha na hora — regra 8. *No papel* o argumento WCAG é mais fraco (não é tela), mas o mesmo `#8F939D` aparece no cromo de tela da referência, onde ele vale inteiro. **Proposta: manter `--fraco` na tela e usar o cinza da referência só dentro da folha**, onde ele é tinta de impressão.
2. **A divisória.** Referência `#E4DED2`, nosso `bordaSuave: #E4DFD4`. Um dígito. Fica o nosso — é o que os testes de contraste conhecem.
3. **A fonte.** A referência é **Barlow** (300/400/500/600/700 + itálico) e **Barlow Semi Condensed** (400/500/600/700) — a semi-condensada carrega todo número grande, todo rótulo caixa-alta e todo título. O sistema é **Inter**. São duas famílias novas, e `tema.ts` tem posição registrada sobre isto: fonte é **servida por nós**, de `web/public/fontes/`, com versão no nome e licença ao lado. Os 15 woff2 estão no bundle e são reaproveitáveis; o subconjunto latino de cada família é o que basta. **A identidade tipográfica da referência é a semi-condensada — sem ela o desenho não é o desenho.**

---

## 3. A folha, extraída

Geometria comum às duas: `width: 210mm; min-height: 297mm`, `display: flex; flex-direction: column`, `@page { size: A4; margin: 0 }`, rodapé presa por `margin-top: auto`, `[data-noprint]` some na impressão, `.g3-sheet` com `break-after: page` (e `:last-child` com `auto`). Padding **13mm 15mm** na folha 1, **11mm 15mm** na folha 2. Todo tamanho de texto em **pt**, não px.

### Folha 1 — a conta

| # | Faixa | Desenho |
|---|---|---|
| 1 | Cabeçalho | logo 30pt + *"Energia Solar por Assinatura"* (9pt, `letter-spacing: .26em`); à direita razão social e CNPJ. Régua inferior **2px `#14213D`** |
| 2 | Cliente | bloco creme. Nome em 15pt semi-condensada; CPF/CNPJ **mascarado** (5 primeiros dígitos, resto `*`); abaixo, grade de 4 colunas com 7 metadados |
| 3 | Três cartões | *Sem a G3 você pagaria* (24pt, tachado, cinza) · *Sua economia neste mês* (borda `#F4A65A`, fundo `#FEFAF3`, tinta `#C88A2E`) · *Seu desconto* (fundo `#E8843C` sólido, branco) |
| 4 | Total | barra navy cheia. Rótulo 13pt caixa-alta à esquerda, valor **26pt** à direita |
| 5 | Aviso | barra **laranja** com ícone de triângulo: *"Não pague a conta da Equatorial"* |
| 6 | Detalhamento | grade `1fr 58pt 104pt 116pt` com **`grid-template-columns: subgrid`** nas linhas. Duas seções (*Energia G3 Solar*, *Repasses obrigatórios Equatorial*), tarifa e valor com o cheio **tachado** acima do com-desconto. Fecha em barra navy *TOTAL A PAGAR* |
| 7 | Rodapé | CNPJ à esquerda, `Fatura nº · página 1 de 2` à direita |

### Folha 2 — consumo e pagamento

| # | Faixa | Desenho |
|---|---|---|
| 1 | Cabeçalho curto | logo 17pt + `cliente · UC · mês`, régua 1px |
| 2 | Histórico | 12 barras em flex, altura 100pt, rótulo kWh em cima e mês embaixo, cor por barra |
| 3 | Três indicadores | *Você já economizou* (27pt laranja, com ícone) · *Consumo do mês* · *CO₂ evitado* (com nota do fator MCTI/SIRENE) |
| 4 | Pagamento | caixa com borda navy 1px. Cabeçalho navy com logo + *PAGAMENTO*; linha de 4 campos (beneficiário, nosso número, vencimento, **valor em laranja**); instruções; e duas colunas — **QR Pix 120×120** e **código de barras** (`JsBarcode`, 55px) com linha digitável monoespaçada. Rodapé legal do Bancoob/Sicoob em 7px |
| 5 | Rodapé | telefone em caixa creme com ícone; endereço; e *Informações importantes* (bandeira, multa 2% + juros 1% a.m., aviso de golpe do boleto) |

---

## 4. O mapeamento — o que temos, o que falta

| Painel | Origem no financeiro | Situação |
|---|---|---|
| Cliente, CPF/CNPJ, UC, competência, vencimento | `DadosDaFatura` | ✅ existe |
| Endereço | `unidade_consumidora` (`logradouro`…) | ✅ existe |
| Total a pagar | `valor_total_centavos` | ✅ existe (nullable — ver `formatar`) |
| Beneficiário, nosso número, linha digitável, PIX | `src/repos/boleto.ts` | ✅ existe |
| QR Pix | `src/dominio/qrcode.ts` (SVG do servidor) | ✅ existe |
| Instruções do boleto | `PedidoDeBoleto.mensagens` | ✅ existe |
| Código de barras | — | ⚠️ **não existe** · exigiria codificador Interleaved 2 of 5, como o QR foi feito |
| Quebra Equatorial (ilum. pública, bandeira, encargos, não compensado) | `fatura-concessionaria.ts` | 🔴 **o leitor existe, não está ligado à fatura.** A fatura tem **um** `valor_tarifas_concessionaria_centavos` somado |
| Sem a G3 / economia / desconto % | — | 🔴 **não existe tarifa cheia** para comparar contra a nossa |
| Economia acumulada | — | 🔴 exige série histórica por UC |
| Histórico 12 meses | — | 🔴 nada |
| CO₂ evitado | — | 🔴 exige fator de emissão |
| Bandeira tarifária | `fatura-concessionaria.ts` | 🔴 mesmo portão |

**Os quatro últimos são ~40% do peso visual da folha.** É por isso que o portão do §1 existe.

### O cálculo da referência não pode ser portado — regra 1

A referência faz aritmética de dinheiro em **float**:

```js
const integral = kwh * tarifa;
const desconto = integral * (perc / 100);
const demais   = Math.round((totalEq - ncomp - ip - band) * 100) / 100;
```

`toNum()` é `parseFloat`. Isso é exatamente o que a **regra 1** proíbe — *"Float é proibido, inclusive em cálculo intermediário"*. O **desenho** se adota; a **conta** se reescreve em centavos inteiros.

Duas observações que sobrevivem à reescrita:

- `demais` é um **resíduo** (`total − não-compensado − iluminação − bandeira`). Resíduo absorve em silêncio todo erro de leitura das outras três — se o leitor errar a bandeira, a diferença reaparece como "demais encargos" e a folha continua fechando. **Ou o leitor entrega as quatro parcelas, ou a linha some.** Não pode ser derivada.
- `co2 = kwh * fator` e o percentual **não** viram centavos: são grandeza física e proporção, e a regra 1 manda manter escala decimal.

---

## 5. O que sai na virada

| Sai | Por quê |
|---|---|
| `src/dominio/layout-visual.ts` | composição por bloco posicionado — substituída por composição fixa |
| `web/src/telas/layout-editor.tsx` | o editor de arrastar |
| `EditorDeLayout` em `documento.tsx` | idem |
| `web/src/layout-regras.ts` (parte) | `naGrade`, `arrastar`, `redimensionar`, `blocoNovo` perdem uso; `escalaDaPrevia`, `regraDaPagina` e `ladoDoQr` **ficam** |
| Tabelas `layout_do_documento` e `bloco_do_documento` | migration 23 — **migration de remoção, não `DROP` a quente** |

| Fica | Por quê |
|---|---|
| `campo_do_documento` + `layout-do-documento.ts` | continua sendo o **conteúdo** da tabela de valores: ordem, rótulo, visibilidade |
| `identidade_de_cobranca`, `logo_de_cobranca` | a logo é da folha |
| `chave_pix`, BR Code, QR | a faixa de pagamento |
| Impressão em lote (`Lote`, `lote-de-documentos.ts`) | ortogonal ao modelo |

**A rota não muda.** `GET /faturas/:id/documento` continua devolvendo o documento composto pelo servidor — o CRM consome a mesma rota e não roda React (decisão 4 da `Q-DOCFATURA-01`, intacta). O que muda é a **forma** do payload: hoje `blocos[]` com `x_mm`/`y_mm`; depois, seções nomeadas. **Isso quebra o contrato do payload** — e como o CRM ainda não consome nada (`Q-WEBHOOK-01` aberta), a hora de quebrar é agora.

---

## 6. A faixa de pagamento — CONSTRUÍDA em 12/08

**Ela não depende do leitor da Equatorial**, e por isso foi a peça liberada primeiro. A faixa antiga era um filete tracejado com dois códigos empilhados; a nova é a caixa do modelo G3 — cabeçalho navy, linha de campos, duas vias lado a lado e rodapé.

| Onde | O que mudou |
|---|---|
| `src/repos/documento.ts` | `nosso_numero` (boleto) e `recebedor_nome` (Pix) passaram a viajar no payload — os dois já existiam no banco e não chegavam ao papel. E `vencimento_br` / `valor_br`, **formatados no servidor** |
| `web/src/api.ts` | os mesmos campos do lado do consumidor |
| `web/src/estilo.ts` | a caixa, dentro da exceção nomeada de cor de papel |
| `web/src/telas/documento.tsx` | `FaixaDePagamento` reescrita + `QrDaFaixa` |
| `web/tests/interface.ts` | a lista de cores literais vai a **seis**, com o porquê escrito |
| `tests/repos-documento.ts` | **W4o/W4p/W4q** |

**Por que `vencimento_br` e `valor_br` vêm prontos do servidor:** a faixa passou a imprimir vencimento e valor dentro dela, e a alternativa era a tela formatá-los. `documento.tsx` proíbe isso na primeira tela do arquivo, e o motivo é concreto — `emReais` existe nos **dois** lados, então formatar na tela poria o mesmo total na tabela e na faixa por dois caminhos que podem divergir. **W4p compara a faixa com a linha da tabela** em vez de com uma constante: se o formatador mudar, os dois mudam juntos ou a verificação cai.

**Medido no browser**, com `media: print` sobre o bundle real: a faixa ocupa **355 px** dentro do bloco de **363 px** (96 mm) e termina em **269 mm**, dentro dos 281 da área imprimível do A4. Uma folha, sem página em branco. Era a medição que faltava — o defeito de 09/08 foi exatamente um conteúdo que não cabia no bloco e saía cortado.

### O que não entrou, e é decisão e não esquecimento

- **código de barras** (`Q-DOCG3-06`) — não há codificador; a coluna do boleto sai com a linha digitável, que paga em qualquer banco. Um retângulo listrado no lugar seria pior que a ausência;
- **Barlow Semi Condensed** (`Q-DOCG3-05`) — a estrutura, a hierarquia e as cores são as do modelo; a fonte é a do sistema;
- **beneficiário no boleto** (`Q-DOCG3-08`) — **achado construindo:** `identidade_de_cobranca` não tem razão social nem CNPJ, e no caminho do boleto não há nome de quem recebe em lugar nenhum do schema. O campo é **omitido** em vez de sair com travessão: é a ele que o modelo amarra o aviso anti-golpe, e "Beneficiário: —" treina o comportamento oposto ao que o aviso pede.

---

## 7. As questões que isto abre

| Questão | Nível | O que é |
|---|---|---|
| `Q-DOCG3-01` | 🟡 | **A reversão em si.** Layout fixo substitui configurável, revertendo 30/07 e 03/08. Registrada; o corpo é este plano |
| `Q-DOCG3-02` | 🔴 | **A tarifa cheia.** Três cartões e duas colunas tachadas da folha 1 dependem de saber o que o cliente pagaria **sem** a G3. Não temos. Vem do leitor, de `Q-TARIFA-CONC-01`, ou é parâmetro digitado? |
| `Q-DOCG3-03` | 🟡 | **Fator de emissão de CO₂.** A referência usa 0,029 kg/kWh como *default de prop*. Valor MCTI/SIRENE muda por ano e por mês — parâmetro de tenant, tabela, ou sai da folha? |
| `Q-DOCG3-04` | 🟡 | **Série histórica.** Barras de 12 meses e economia acumulada exigem histórico por UC que não é gravado hoje |
| `Q-DOCG3-05` | 🟢 | **Barlow entra?** Duas famílias novas auto-hospedadas. Sem a semi-condensada o desenho não é o desenho |
| `Q-DOCG3-06` | 🟢 | **Código de barras.** Interleaved 2 of 5 próprio (como o QR) ou a faixa sai só com linha digitável e PIX — **13/08: a pergunta mudou.** A referência mostrou que a parte que falta não é o codificador, e sim **conferir os quatro dígitos verificadores antes de desenhar**. Ver `REFERENCIA-fatura-unificada-2026-08-13.md` §6 |
| `Q-DOCG3-07` | 🟡 | **O cinza dos rótulos.** `#8F939D` reprova AA em tela (2,75:1, medido). Vale na folha impressa, não vale no cromo |

---

## 8. A ordem, quando o portão abrir

1. Ligar `fatura-concessionaria.ts` à fatura — a quebra em quatro parcelas, **sem resíduo**
2. Fechar `Q-DOCG3-02` (tarifa cheia) — sem ela, três cartões da folha 1 não existem
3. Barlow + Barlow Semi Condensed em `web/public/fontes/`, com versão no nome e licença
4. Composição fixa no servidor, em centavos, substituindo `documentoPosicionado`
5. As duas folhas em `documento.tsx`, pintando o que o servidor compõe
6. Faixa de pagamento nova (§6) + código de barras, se `Q-DOCG3-06` fechar
7. **Só então** retirar o editor, e a migration de remoção da 23
8. Suíte: as verificações de `web/tests/layout.ts` que falam de bloco saem junto; entram as da composição fixa
