# PENDÊNCIAS — Financeiro G3

| Campo | Valor |
|---|---|
| **Para quem** | Quem quiser, em uma tela, a lista viva do que falta — e de quem é cada item |
| **O que é** | O **índice único** das pendências. Consolida e substitui os dois trackers datados que existiam soltos |
| **Substitui e apaga** | `PENDENCIAS-2026-08-05.md` e `PROXIMOS-PASSOS-2026-08-09.md` — vencidos, e agora removidos do repo |
| **NÃO substitui** | `QUESTOES.md` (registro datado, dono por entrada — regra 10) · `RETOMADA-2026-08-15.md` (onde tudo parou) · os `RESUMO-SESSAO-*` (memória datada). Estes continuam sendo a fonte; aqui é o **apontador** |
| **Data** | 14/08/2026 · rev. 17/08/2026 · rev. 19/08/2026 |
| **Estado da suíte** | `npm test` **`EXIT=0`**, **2.057** verificações (eram ~1.911 em 14/08), com PostgreSQL real |
| **Produção** | `financeiro.blackhaus.io` · `origin/main` em **`6f8aa46`** (deploy de 17/08 10:59 UTC) · **32 migrations no ar** (a 32 aplicada em 17/08 10:23 UTC) · Pix estático **e boleto importado** no ar · rótulos da barra revistos no mesmo deploy |

> ## A única pendência do repositório é o certificado A1.
>
> Medido e não afirmado: **o único código que falta é `src/sicoob/http.ts`, e ele é
> exatamente o que o A1 destrava.** Tudo o mais que era código a escrever foi escrito.
> O restante desta lista **não é pendência de código** — é insumo da operação e
> decisão com dono nomeado, e pela **regra 10** não é do implementador fechar.

---

## 1. A pendência: o certificado A1

| | |
|---|---|
| **O quê** | Certificado **A1** e-CNPJ, `.pfx`/`.p12` com senha, CNPJ `66714022000121` |
| **De quem** | **do dono** — é compra externa, decidida em 13/08 (*comprar*) |
| **De quem NÃO é** | do Sicoob. É emitido por **AC do ICP-Brasil**, logo não depende de mais ninguém |
| **O que destrava** | criar o aplicativo no Portal Developers → confirmar no app do banco → `src/sicoob/http.ts` torna-se escrivível → boleto registrado de verdade |
| **Já confirmado (fonte primária)** | A1 e **só** A1 (manual do Sicoob, 22/11/2024); sobe **somente a chave pública** (`.PEM`/`.CRT`/`.CER`) — a chave privada **não** sobe em campo web |
| **Conferência de 2 min, antes da compra** | quantos **responsáveis** a conta PJ exige para autorizar o aplicativo — `Q-SICOOB-AUTORIZA-01` |

**Enquanto ele não existe, nada para.** A `PortaDeCobranca` é injetada e o padrão é
`COBRANCA_NAO_CONFIGURADA`, que **recusa com 503 nomeado** em vez de fingir. A fatura
compõe, emite, imprime e **cobra por Pix estático** — o que não existe é boleto registrado
*por nós, pela API*.

> **17/08/2026 — e desde hoje a fatura também cobra por BOLETO, sem o A1.**
>
> O boleto emitido à mão no portal da cooperativa **entra no sistema**: aba
> **Emissão e cobrança** → *Importar boleto emitido no banco*. Ele não é uma segunda emissão —
> o título já existe no banco, e o que entra é a transcrição conferida dele
> (`origem = 'importado'`, migration 32). O sistema **não fala com a Sicoob em
> nenhum ponto desse caminho**.
>
> O que isso conserta são três silêncios que estavam medidos e sem dono: a aba
> dizia *"esta fatura não tem boleto"* para uma fatura que tinha; o documento
> composto caía no ramo do **Pix estático — que não concilia** — existindo um
> boleto com nosso número; e a conferência aritmética dos 44 dígitos nunca rodava
> contra esse título.
>
> **O A1 continua sendo a pendência, e o que ele destrava não mudou:** emissão
> automática, fila de retentativa, consulta ativa e baixa pela API. O importado
> fica **fora da consulta ativa** de propósito — `Q-BOLIMP-01`, com a razão medida.

### 1.1 Por que é o único código que falta

Medido no repositório em 14/08:

- **`src/sicoob/` tem `porta.ts` e `falso.ts`, e não tem `http.ts`.** A interface e o
  falso (exercitável sem rede) existem; o adaptador real da Cobrança v3 **não**, por
  decisão registrada — escrever um adaptador que nada pode chamar é a
  `Q-PECA-NAO-PLUGADA-01`, e todo documento recente repete: *não escreva antes do
  sandbox*. O primeiro `POST` real vai corrigir alguma suposição de identidade do
  cooperado (`numeroCliente`, `numeroContratoCobranca`, `codigoModalidade` — `B4`), e
  código escrito contra suposição é reescrito inteiro.
- **O extrator já existe.** `src/concessionaria/leitor-visao.ts` (14/08) preencheu a
  `PortaDeLeitura` que estava vazia desde 07/08 — leitura da fatura e do boleto por
  modelo de visão, com a rota **autenticada** (`comPermissaoDeLer`/`exigir('ler')`),
  ao contrário do proxy aberto da referência (ver §4c).
- **As demais portas de dinheiro são injetadas com padrão que recusa nomeando** — não
  há stub silencioso no caminho do dinheiro.

**Conclusão:** o `src/sicoob/http.ts` não é uma lacuna esquecida; é a peça que espera
o A1. Por isso "resta o A1" vale **também para o código**.

---

## 2. O que NÃO é pendência de código (regra 10)

Estes itens são reais e continuam abertos — mas **nenhum é do repositório fechar**.
São insumo da operação e decisão com dono. Ficam aqui para serem vistos de uma vez; a
fonte com dono e data é o `QUESTOES.md`.

### 2.a Fila da primeira fatura — insumo humano da operação

Nenhum é código. Os importadores já existem e rodam do Codespace contra produção.

> **17/08/2026 — os itens 1 e 7 deixaram de exigir Codespace.** Eles continuavam
> na fila por um motivo que não era de decisão nem de insumo: **não havia tela**.
> O dado só entrava por um script rodado de um Codespace, contra produção, por
> quem tem o repositório clonado e o `.env` na mão — e quem opera não tem nada
> disso. As colunas, as rotas (`PATCH /clientes/:id`, `PATCH /unidades-consumidoras/:id`)
> e os importadores em lote já existiam desde sempre. **Os importadores continuam
> sendo o caminho certo para 29 linhas de uma vez** — eles conferem colisão de
> documento antes de escrever qualquer coisa (`Q-CLIENTEDUP-01`), o que a
> digitação linha a linha não faz.

| # | Pendência | Estado hoje | Como entra | Dono |
|:--:|---|---|---|---|
| 1 | **CPF/CNPJ de 24 pessoas** (29 linhas de cliente) | **26 clientes semeados** pelo ciclo de 20/08 (eram 0) — **0 validados**, e a camada conta `NOT documento_validado`, então ela **não se move** até alguém reenviar ⬇️ | **aba Clientes**: reenviar o número já preenchido (troca a origem para `coleta_local` e valida) | operação |
| 2 | **Dia de vencimento de 29 UCs** | **0 de 29** | **aba Unidades consumidoras**, linha a linha · ou `npm run vencimentos` em lote | operação |
| 3 | **CPF/CNPJ de 2 originadores** + natureza | 0 | `npm run originadores` | operação |
| 4 | **Digitar os 29 contratos** | 0 | `npm run contratos` (depende de 1 e 3) | operação |
| 5 | **Emissor** — razão social, CNPJ, contato | vazio em produção | **Fatura unificada** → «3 · Cadastro da fatura» (`/documento#cadastro`) | dono |
| ~~6~~ | ~~**Tarifa das 41 UCs**~~ | ✅ **RESOLVIDO em 20/08 — 41 de 41**, semeadas pelo ciclo (34 × `1,13` · 5 × `1,16` · 2 × `1,18`) | — nada a digitar. `Q-VALOR-01(b)` **fechada** | — |
| 7 | **Endereço do pagador de 29 UCs** | **0 de 29** | **aba Unidades consumidoras**, painel «Endereço do pagador» (17/08) · ou `npm run enderecos` em lote — **só o boleto depende** | operação |

> ### ⬇️ 20/08/2026 — o ciclo RODOU, e os dois itens mudaram de forma diferente
>
> `npm run ciclo -- --valendo` executado: **112 lidos, 4 criados, 63 atualizados,
> 0 recusados, 4 divergências**. Ensaio antes, com o mesmo resultado.
>
> | | antes | depois |
> |---|--:|--:|
> | UCs ativas **com tarifa** | 0 de 41 | **41 de 41** ✅ |
> | Clientes **com documento** | 0 | **26** (todos `crm_semente`) |
> | Clientes com documento **validado** | 0 | **0** — e é o esperado (R8) |
>
> **O item 6 fechou. O item 1 não, e a distinção é a R8 em ação.** A camada
> `documento_do_cliente` conta `NOT documento_validado`, que são os TRÊS estados
> que não valem — então ela continua marcando **29 de 29** mesmo com 26 clientes
> preenchidos. Isso não é defeito: semente do CRM não vale por decreto, e o que
> valida é **reenviar o número pela aba Clientes**, o que troca a origem para
> `coleta_local`. O trabalho saiu de *descobrir e digitar 29 documentos* para
> *conferir e confirmar 26 já preenchidos* — que é um trabalho diferente e muito
> menor, mas ainda é trabalho de alguém.
>
> **4 colisões de documento viraram divergência, não 23505** — leads `G3-0307`,
> `G3-0295`, `G3-0401` e `G3-0279` trazem documentos que já pertencem a outro
> cliente. É a `Q-CLIENTEDUP-01` aparecendo com nome e sobrenome. O conector não
> escolhe qual dos dois é o dono; sem essa guarda, cada uma teria derrubado o
> lote inteiro pelo índice `cliente_documento_unico`.
>
> **Item 6 — tarifa.** O CRM expôs `tarifa_reais_por_kwh` em
> `financeiro.rateio_clientes` e `vendas_ganhas`: é o campo **digitado** no card
> (`leads.consumo_fator`), não a divisão. **Cobertura medida: 41 de 41 UCs e 495
> de 495 leads** — um trigger do lado de lá semeia no nascimento do lead, então
> ninguém precisa digitar 41 tarifas. Pela tabela de decisão da rodada 9 §4, é o
> cenário "esperamos a coluna e semeamos as 41 de uma vez".
>
> `tarifaDoCliente` (a divisão) **não saiu**: virou segunda fonte e conferência,
> atrás de `tarifaDaSemente`. O motivo é que as duas podem discordar — os quatro
> cards do `1,159997` da rodada 9 têm o fator digitado em **`1,1300`**, não
> `1,16`. Medido pelo dev do CRM: divergem em 10 de 198 cards do tenant e em **0
> das 41 UCs**. Divergência agora vira sinal contado, não silêncio.
>
> **Item 1 — documento.** `espelharLote` passou a gravar `documento` quando, e só
> quando, `cliente.documento` está nulo — com `crm_semente` e
> `documento_validado = false`, **mesmo com o dígito fechando** (R8 intacta). Não
> é exceção à R5: campo vazio não tem valor local a ser vencido.
>
> **O que isso NÃO faz:** não ativa contrato. Continua sendo semente, e quem
> valida é a aba Clientes reenviando o número (o que troca a origem para
> `coleta_local`). O ganho é sair de *digitar 29 do zero* para *conferir 29 já
> preenchidos*. Do lado do CRM havia **105 documentos preenchidos** em 20/08,
> 34 deles extraídos automaticamente dos anexos naquele dia.
>
> **Colisão de documento vira divergência contada, não 23505.** O índice
> `cliente_documento_unico` derrubaria o `createMany` inteiro se dois leads
> trouxessem o mesmo número — que é o cenário da `Q-CLIENTEDUP-01`. O conector
> não escolhe qual dos dois é o dono.
>
> Testes: `tests/crm-semente.ts`, 17 verificações puras (sem banco), em
> `test:dominio`. Avisos técnicos do dev do CRM em
> `AVISO-dev-crm-documento-2026-08-20.md` e `AVISO-dev-crm-tarifa-2026-08-20.md`.

**A aba Clientes distingue o que a coluna sozinha esconde**, e é a R8: documento
vindo do CRM entra com `documento_validado = false` **mesmo passando no dígito
verificador**, porque lá o campo é livre e dígito certo não prova que o documento
é daquela pessoa. Um CPF preenchido na tela não significa contrato ativável —
quem destrava a R9 é a coluna *Vale para o contrato*. **Reenviar o mesmo número
pela aba é o ato que o valida**, porque troca a origem para `coleta_local`.

### 2.b Decisões do dono / contador — movem dinheiro, não têm volta

| Questão | Sev. | O que decide |
|---|:--:|---|
| **Q-FATCHEIA-01** | 🔴 | o que é "fatura cheia" — decide em que mês a comissão de todo contrato começa. **Tem prazo**: `data_fechamento` é editável só no CSV, antes de importar |
| **Q-CLIENTEDUP-01** | 🔴 | 5 das 29 UCs são clientes duplicados — custa 5 das 29 |
| **competência** | — | 2026-06 sai com **28 de 29**; 2026-07 sairia com 9 (falta a geração da usina `0001`) |
| **Q-DOCG3-11** | 🟡 | a decomposição do repasse — é a base do split. **14/08: o dono decidiu seguir a referência** (não compensado + iluminação + bandeira + demais). Falta o aval fiscal do contador, uma fatura de GD real para validar o mapa (a referência **não tem fio B**), e a reescrita da base — **não executada**, para não mover dinheiro sobre lógica nunca confrontada com compensação. Ver `QUESTOES.md` Q-DOCG3-11 |
| **Q-PARCERIA-01** | 🔴 | fora do caminho crítico das 29 hoje; **volta a travar** quando o CRM ativar as 3 UCs do Edimar |

### 2.c Ações de plataforma do dono

| # | Item | Sem isso |
|:--:|---|---|
| 1 | **`ANTHROPIC_API_KEY` em `/etc/financeiro.env`** + `systemctl restart` | as duas rotas de leitura respondem **503 com a mensagem certa** |
| 2 | **Girar a chave da Anthropic** — `Q-REF-SEGREDO-01` | o **proxy aberto** é o `/api/ler-fatura` da **referência (Vercel)**, não o nosso código; ele repassa o corpo com a chave do servidor **sem autenticação**. Girar **antes** de instalar a mesma chave em qualquer outro lugar. Não há código nosso a mudar |
| 3 | **Q-LEITOR-01** — uma chamada real ao modelo contra um PDF de verdade | o contrato está preso por verificações, mas que a chamada funciona no ar **não está provado** — é subir um arquivo |

---

## 3. Frentes de código já fechadas

Não estão mais abertas; a leitura por extenso é a `RETOMADA-2026-08-15`.

- **Cada camada da tela de Pendências diz ONDE se resolve** (19/08) — a tela dizia com
  precisão *o que* falta e *de quem* é, e deixava o **caminho** implícito: quem opera
  tinha de saber de cabeça que a tarifa é coluna da aba Unidades desde 14/08 (antes era a
  aba Tarifas, que saiu), que o CPF/CNPJ só ganhou tela em 17/08, e que geração **não tem
  tela** porque é espelhada do CRM. Agora cada linha carrega o link, e ele abre a aba **já
  filtrada na pendência** — `?pendencia=sem_tarifa`, `sem_vencimento`, `sem_usina`,
  `sem_dono`, `nao_validado`. O filtro do documento é um **agregado novo** (`nao_validado`)
  e não um dos quatro estados: a camada conta `NOT documento_validado`, que são três deles,
  e um link para `sem_documento` mostraria lista menor do que a que a prontidão acusa.
  **Duas camadas dizem «não há tela», e é verdade**: geração é espelho do CRM (regra 4) e
  regra de comissão é decisão com dono (`Q-COMIS-TERC-01`) — nas duas o caminho real vai
  escrito ao lado, porque recusa é ponteiro e não beco. O mapa é `.ts` puro
  (`web/src/destino-da-camada.ts`) com suíte própria — **65 verificações** entre
  `web/tests/destino.ts` e `tests/prontidao-destino.ts`, esta última lendo os **dois**
  fontes para que camada renomeada no servidor não deixe um destino órfão em silêncio.
- **Importar boleto emitido no banco** (17/08, migration 32) — a aba **Emissão e cobrança** passou a
  aceitar o título emitido à mão no portal: linha digitável conferida nos quatro dígitos
  verificadores, código de barras **remontado** dela, valor e vencimento lidos de dentro
  dos 44 dígitos e comparados com a fatura antes de gravar. Upload do PDF reaproveita o
  extrator por visão que já existia. Não fala com a Sicoob e não depende do A1.
- **O CPF/CNPJ do cliente e o endereço do pagador entram pela tela** (17/08) — eram os
  itens 1 e 7 da §2.a, e ficavam presos a um script de Codespace. A aba Clientes mostra a
  R8 (semente do CRM não vale) e a aba Unidades consumidoras ganhou o painel do endereço.
- **O Pix copia e cola parou de ser corrompido na limpeza** (17/08) — três lugares
  faziam `replace(/\s+/g, '')` num payload que tem espaço legítimo dentro do nome do
  beneficiário (`5908G3 SOLAR` → `5908G3SOLAR`): quebrava o comprimento do campo e o CRC,
  e o QR era **desenhado assim mesmo**. Agora quem decide o que é espaço sobrando é o
  próprio CRC, e payload que não fecha não vira QR impresso.
- **Os rótulos da barra passam a descrever a tela** (17/08) — cinco mudaram, e três
  diziam outra coisa que a tela faz: `Carteira` → **Faturamento** (é onde a fatura do mês
  nasce), `Cobrança` → **Conector Sicoob** (cobrar é na aba ao lado; ali é a credencial do
  banco), `Documento` → **Fatura unificada** (não dizia qual, com dois candidatos na
  mesma barra). Mais `Unidades` → **Unidades consumidoras** e `Donos` → **Donos de
  usina**, que eram dívida de vocabulário (regra 7 — os termos inteiros já estavam no
  `GLOSSARIO` e já eram o título da página). **As rotas não mudaram**, nem os nomes de
  domínio. A revisão achou de quebra uma mensagem anterior que mandava cadastrar a
  identidade *"na aba Cobrança"* — o formulário vive em `/documento#cadastro`.
- **E um sexto rótulo, que corrige o quinto** (17/08, fim do dia) — `Faturas` →
  **Emissão e cobrança**, por medição do dono: *"o nome faturas e fatura unificada está
  causando confusão"*. Rebatizar `Documento` de **Fatura unificada** tinha deixado duas
  abas vizinhas começando pela mesma palavra — a correção da manhã criou a confusão da
  tarde. Quem cedeu foi `Faturas`, porque **não nomeia nada**: era o plural da entidade,
  e a entidade aparece em todas as telas do grupo, enquanto `Fatura unificada` é nome de
  funcionalidade e está em quatro arquivos e numa tabela (mudá-lo criaria sinônimo —
  regra 7). O rótulo novo são os três botões da tela: emitir, boleto, baixa. **A rota
  `/faturas` não mudou.** E a lição virou teste em vez de comentário (regra 8): o `I4c`
  já proibia título repetido e passou verde nas duas rodadas, porque `Faturas` e
  `Fatura unificada` são strings diferentes — o **`I4k`** passou a proibir duas abas com
  o mesmo **substantivo-cabeça**, que é o que a pessoa lê primeiro. `Faturamento`
  convive, porque nomeia outra coisa: o processo, não o documento.
- **Cadastro de Fatura** — emissor, logotipo, chave Pix, campos personalizados, modelos (migrations 28–31).
- **Aba Documento = a referência, e passou dela** — conferência aritmética do boleto, teto de desconto, escala do decimal.
- **Aba Tarifas removida**, tarifa migrada para a UC (a coluna certa, medido em 41 de 41).
- **Extrator de fatura/boleto por visão** — `concessionaria/leitor-visao.ts`, rota autenticada.
- **Revisão geral** — o `sum(int)` que estourava em R$ 21 mi, o 401 da API que deslogava quem faturava, o CSV que partia endereço, o bundle de 227→98 KB.

### 3c. Nota de segurança que sobrevive a esta consolidação

O proxy aberto (`Q-REF-SEGREDO-01`) é da **referência hospedada na Vercel**, fora deste
repositório. O nosso equivalente (`/faturas/ler-fatura`, `/faturas/ler-boleto`,
`/faturas/unificada/compor`) é autenticado por sessão e `exigir('ler')` — documentado
em `src/http/rotas.ts` e `src/concessionaria/leitor-visao.ts`. A ação que resta é **do
dono**: girar a chave (item 2.c.2).

---

## 4. Procedência desta consolidação

- **Apagados** por serem resíduo datado e superado: `PENDENCIAS-2026-08-05.md`,
  `PROXIMOS-PASSOS-2026-08-09.md`. O conteúdo vivo deles está acima; o histórico
  datado permanece nos `RESUMO-SESSAO-*` e nas `RETOMADA-*`, que **não** foram tocados
  — relatório é registro datado e apagá-lo falsificaria a memória do projeto.
- **Não apagados, e por quê:** `QUESTOES.md` é o registro com dono por entrada
  (regra 10) e continua sendo a fonte das decisões da §2.b/§2.c; as retomadas e os
  resumos são a linha do tempo.

---

## 5. Como a migration 32 entrou em produção (17/08/2026)

**Está aplicada.** Registro do que aconteceu, porque o caminho é o que vale para a próxima.

| | |
|---|---|
| **Aplicada em** | 17/08/2026, 10:23 UTC |
| **Por onde** | workflow **`migrate-financeiro`**, `confirmar = aplicar` |
| **Alvo** | `aws-0-sa-east-1.pooler.supabase.com:5432` — session pooler |
| **Deploy** | `deploy-financeiro` logo depois: `cfa1fe5 -> f67b108`, `financeiro.service` ativo, **HTTP 200** |

Conferido **no catálogo**, não na mensagem do comando:

```
Applying migration `20260817120000_boleto_importado`
All migrations have been successfully applied.

migration 32 OK — enum origem_boleto, coluna boleto.origem e a constraint, os tres presentes.
boletos por origem: nenhum boleto na tabela (esperado — o A1 nunca existiu)
```

### O que o caminho exigiu, e fica valendo para a próxima

1. **O workflow tem de estar na `main`.** O GitHub só lista `workflow_dispatch` do
   branch padrão — enquanto o PR não entrou, o `migrate-financeiro` **não aparecia
   na aba Actions**. Não é defeito; é onde procurar quando "sumir".
2. **Secret `DIRECT_URL`** — session pooler na **5432**, nunca a 6543 (o Migrate
   exige prepared statements que o pooler de transação não suporta, e o modo de
   falha dele não é erro: ele *pendura*). A guarda barra a 6543 antes de discar.
3. **A ordem é migrar → implantar.** Migration aditiva com `DEFAULT` é compatível
   para trás; o inverso seria 500 em toda leitura de boleto.

### A sequência, para repetir

```
migrate-financeiro   confirmar = conferir   # identidade + o que falta, sem escrever
migrate-financeiro   confirmar = aplicar
deploy-financeiro
```

Ou, de onde já houver credencial:

```
DIRECT_URL="..." npx prisma migrate status
DIRECT_URL="..." node --experimental-strip-types scripts/conferir-banco-alvo.ts identidade
DIRECT_URL="..." npx prisma migrate deploy
DIRECT_URL="..." node --experimental-strip-types scripts/conferir-banco-alvo.ts migration-32
```

### O que foi ensaiado antes

Contra PostgreSQL real, antes de tocar produção:

| Ensaio | Resultado |
|---|---|
| as 32 do zero, pelo `prisma migrate deploy` | aplicadas, `migrate status` limpo |
| banco **em 31**, a 32 pendente, aplicada pelo CLI | a ordem exata da produção |
| a 32 sobre um banco em 31 **com linha de `boleto` dentro** | **~6 ms**; a linha que já existia ficou `origem = 'api_sicoob'` |
| `conferir-banco-alvo.ts identidade` contra um banco **que não é o nosso** | **recusa**, nomeando a regra 4 |

**A guarda de identidade é a regra 4 em forma executável.** `migrate deploy`
contra o banco errado não recusa — ele **cria**. A identidade conferida não é o
nome na URL: é a migration de fundação `20260725120000_fundacao_schema` estar
registrada como aplicada no alvo. Nenhum outro banco tem essa linha.
