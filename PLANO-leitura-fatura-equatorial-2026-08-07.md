# PLANO — leitura automática da fatura da Equatorial

| Campo | Valor |
|---|---|
| **Data** | 07/08/2026 |
| **Pedido** | *"criar um rasping para entrar no site da equatorial, baixar a fatura e ler automaticamente. Deve ser vinculado somente às UCs ativas"* |
| **Status** | **Plano.** A camada que não depende de ninguém **está construída e provada** (§7); o resto está faseado e tem pré-requisito nomeado |
| **Suíte** | `EXIT=0`, **1618 → 1660** verificações · **42 novas** · **0 migrations** · nada escrito em produção |
| **Sicoob** | **fora deste plano por pedido do dono.** Fica para a última etapa — ver §8 |

> **Este plano não decide nada que tenha dono.** Onde apareceu escolha, ela virou entrada no `QUESTOES.md` (regra 10) — são **seis**, e quatro delas têm prazo. O que foi construído hoje é o que sobra depois de tirar todas elas do caminho.

---

# ⚠️ 08/08/2026 — A FOLHA VOLTOU DO PORTAL, E ELA MUDA TRÊS COISAS

> **O corpo abaixo fica intacto**, porque é registro datado do que se sabia em 07/08. O que a medição de 08/08 mudou está aqui, e **prevalece**.
>
> A folha preenchida está em `EQUATORIAL-portal-2026-08-07.md`. O PDF de uma fatura real foi lido.

## A. O que a folha fechou — e é muito

| Item | Resposta medida | Efeito |
|---|---|---|
| **login** | `goias.equatorialenergia.com.br/LoginGO.aspx` — **UC + CPF/CNPJ**, sem conta cadastrada, sem CAPTCHA no login | não aparecem 29 cadastros. `Q-EQTL-CRED-01` encolhe — mas ver **§B** |
| **formato** | **PDF com camada de texto** | ✅ **o extrator é determinístico e de custo zero por documento.** O modelo de visão vira caminho de exceção, não o principal |
| **histórico** | **156 meses**, e dá para baixar competência passada | backfill é possível. A frente deixa de ser só "o mês que vem" |
| **fatura por e-mail** | **existe, e dá para apontar para um e-mail nosso** | ⚠️ **ver §D — é a mudança estratégica** |
| **procurador/parceiro** | **não existe** perfil | usaríamos a credencial do próprio cliente. Pesa na `Q-EQTL-AUTORIZACAO-01` |
| **API / EDI** | não identificado | confirma o `GLOSSARIO` |

## B. O insumo humano novo que não estava em lista nenhuma: **data de nascimento**

A folha diz, no item 1: *"a validação é a data de nascimento da pessoa que representa o CPF"*.

**`data_nascimento` não existe no nosso schema, não vem de nenhuma das 10 views do CRM, e não é o item 1.1.** É um terceiro dado por titular, e ele é obrigatório para entrar no portal.

E há um buraco dentro do buraco: **para CNPJ ninguém sabe qual é a validação.** Parte das 29 UCs é de pessoa jurídica.

> É a quinta vez que este projeto encontra um insumo humano percorrendo o caminho em vez de auditando spec — depois do documento do cliente (04/08), do vencimento, do endereço do pagador (05/08) e do `npm run tarifas` (06/08). Registrado como **`Q-EQTL-NASCIMENTO-01` 🔴**.

## C. A fatura que veio **não tem geração distribuída** — e isso importa

Lida em 08/08. **O documento é uma fatura residencial convencional**, e a folha marcou *"tem compensação"*:

| Evidência | O que diz |
|---|---|
| classificação | `B1 RESIDENCIAL - RESIDENCIAL NORMAL **CONVENCIONAL**` — não é geração distribuída |
| linhas cobráveis | **duas, só**: `FORNECIMENTO / CONSUMO kWh` (167,00 kWh × 1,126520 = 188,13) e `CONTRIB. ILUM. PÚBLICA - MUNICIPAL` (17,15) |
| a conta fecha | `TOTAL 205,28` = 188,13 + 17,15, **exato** — não sobra parcela nenhuma |
| o que **não** aparece | energia injetada, energia compensada, saldo de créditos, **e nenhuma linha de fio B / TUSD** |

**Consequência direta:** `Q-EQTL-CAMPOS-01` fica **meio respondida**. O que se sabe agora:

- ✅ a **iluminação pública** do `PRD` §5.1 é a linha `CONTRIB. ILUM. PÚBLICA - MUNICIPAL`, sob a seção `ITENS FINANCEIROS`;
- ⚠️ **não existe linha chamada "encargos"** nesta fatura — e a própria fatura explica por quê: *"Encontra-se disponível na área do usuário do site… informações mais detalhadas sobre os valores pagos relativos à energia, serviço de distribuição, serviço de transmissão, **encargos setoriais**, tributos"*. Ou seja: encargos setoriais estão **embutidos na tarifa**, não destacados como parcela;
- ⚠️ os **tributos vêm destacados mas embutidos** — ICMS 19% sobre 188,13 = 35,74; PIS 0,4016% e COFINS 1,8638% sobre 152,38 (que é 188,13 − 35,74). **Não são linhas somadas ao total.** Quem somá-las cobra o tributo duas vezes;
- 🔴 **o fio B continua desconhecido**, porque só aparece em fatura com compensação.

**O que isto faz com o código:** `CamposDaFatura` exige as três parcelas e recusa se faltar uma. Contra esta fatura, o módulo **recusaria** — corretamente, pela sua própria regra (`F1`), e por um motivo verdadeiro: o conjunto de campos foi desenhado a partir do `PRD` e ainda não foi confrontado com uma fatura de GD. **Não vou mexer nele antes de ver uma**, porque redesenhar contra uma fatura convencional é a mesma adivinhação de antes, só que com mais confiança.

**O que falta é uma coisa só: a fatura de uma das 29 UCs que faturam** — todas têm rateio ativado e portanto compensação.

## D. ⭐ O e-mail muda a recomendação, e a tabela da folha já dizia isso

A folha responde **sim** para *"existe fatura por e-mail"* e **sim** para *"dá para apontar para um e-mail nosso"*. A tabela *se X então Y* da própria folha antecipava a consequência:

> **não há scraping nenhum.** A Equatorial entrega, e a frente vira uma caixa de entrada.

**Por que isso é melhor do que raspar, e não é preferência:**

| | portal (raspagem) | e-mail |
|---|---|---|
| proteção de bot | 403 Imperva medido, e há reCAPTCHA no site | não se aplica |
| quebra quando… | o layout do `.aspx` muda, o WAF endurece, o reCAPTCHA pontua baixo | praticamente não |
| termos de uso | `Q-EQTL-AUTORIZACAO-01` aberta | é um recurso **oferecido** pela distribuidora |
| data de nascimento | obrigatória (§B) | **não precisa** |
| quando chega | a gente vai buscar, e a folha diz que o dia *"depende do cliente"* | a Equatorial empurra no dia certo de cada UC |
| custo por UC | uma sessão de navegador por mês | zero |
| custo de entrada | escrever e manter o coletor | **configurar 29 UCs uma vez** — pelo portal, com login |

**O que o e-mail NÃO resolve, e é honesto dizer:** a configuração inicial ainda passa pelo portal (login por UC, com data de nascimento), é mudança na entrega da fatura **do cliente** — precisa de consentimento —, e o histórico de 156 meses só sai pelo portal.

**A leitura que eu recomendo:** e-mail como **canal principal** e portal como **caminho de exceção e de backfill**. As duas portas do §3 já acomodam isso sem mudar uma linha — `PortaDeColetaDeFatura` não sabe se o PDF veio de navegador ou de caixa de entrada, e era para isso que ela existia.

**Mas a escolha não é minha:** `Q-EQTL-CANAL-01` 🔴.

## E. Duas correções ao que eu escrevi em 07/08

| O que eu escrevi | O que a medição diz |
|---|---|
| `competenciaDe` aceitava `MM/AAAA` e `AAAA-MM` | a fatura escreve **`FEV/2026`**. O módulo teria **recusado toda fatura da Equatorial**, com erro honesto e nomeado, e ninguém saberia por quê até abrir um PDF. **Corrigido**, com `F7c` e `F7d` |
| *"o `sha256` é o que torna a coleta idempotente"* | **não é.** O PDF traz `DATA DE EMISSÃO: 03/02/2026 12:32:12` e protocolo de autorização — reemitir a segunda via gera bytes diferentes para a mesma fatura. A identidade estável é a **chave de acesso NF3e**, 44 dígitos, que a fatura traz. O `sha256` continua servindo para *"o documento mudou"*, que é outra pergunta |

**E uma medição que corrige a minha de ontem:** eu disse *"15 dígitos, 41 de 41"*. Certo, mas incompleto — os **significativos** vão de **8 a 12**, e a fatura escreve a UC **sem zero nenhum** (8 dígitos). O padding de `F4a` está certo e é mais necessário do que eu tinha medido.

*(A UC da fatura de amostra **não está na nossa base** — conferido. É um documento de exemplo, não de cliente da carteira.)*

## F-bis. 08/08, mais tarde — O DONO DECIDIU, e a fase D foi substituída

**`Q-EQTL-CANAL-01` fechada: o canal é o e-mail.** As fases mudam assim — e note que **B1 não é tocada**, porque as portas nunca souberam de onde vem o PDF:

| Fase | Antes (07/08) | Agora |
|:--:|---|---|
| **A** | medir o portal | ✅ **feita** — folha preenchida e lida |
| **B1** | porta + falso + domínio puro | ✅ **feita, e intacta.** 44 verificações |
| **B2** | ajustar campos ao layout real | ⏸️ espera **uma fatura de GD** |
| **C** | migration 26 | ⏸️ espera `Q-EQTL-ESCOPO-01` e `Q-EQTL-CRED-01` |
| ~~**D**~~ | ~~coletor em Playwright~~ | ❌ **cai da coleta de rotina.** Vira **D′: leitor de caixa de entrada**, e espera `Q-EQTL-CAIXA-01` |
| **D″** | — | 🆕 **configurar as 29 UCs no portal**, uma vez cada. **É aqui que a data de nascimento é necessária** — e só aqui |
| **E** | extrator | ⏸️ o PDF tem camada de texto, então é determinístico. Espera B2 |
| **F–H** | script, aplicar, agenda | ⏸️ inalteradas |

**O backfill continua sendo raspagem.** Os 156 meses de histórico só saem pelo portal — se alguém quiser série histórica, a fase D volta como caminho de exceção. Por isso ela foi **substituída na rotina**, não apagada do desenho.

### A medição que derrubou uma premissa: a data de nascimento **não está no CRM**

O dono respondeu que o dado vem da *"aba clientes, dentro do CRM"* e que *"todos os clientes devem ter"*. **Conferido antes de obedecer** — que é o que a sessão 19 ensinou, quando três afirmações do dev estavam vencidas:

| Onde | Resultado |
|---|---|
| view `financeiro.rateio_clientes` — a "aba clientes" | 15 colunas, **nenhuma** de nascimento |
| as **10 views** de `financeiro.*` | **nenhuma** expõe |
| **catálogo inteiro** do CRM, `nasc\|aniver\|birth\|dob\|natal` | **zero colunas**; as únicas `jsonb` são internas do `pg_net` |
| a **nossa** base (`public`) | **zero colunas** |

Ou o dado está numa tela alimentada por outra fonte que não este banco, ou não existe. **Virou `PROMPT-dev-crm-rodada7-2026-08-08.md`** — três opções marcáveis, cada uma com o efeito nomeado, e nenhuma delas é problema: o que atrapalha é decidir sem saber.

### O que eu decidi NÃO construir agora, e a razão é de método

**O extrator de texto do PDF.** É tentador: o documento tem camada de texto e eu já li um. Mas o dump que eu li veio do **conversor do Google Drive**, e **cada extrator achata o layout de um jeito diferente** — um parser de rótulos ajustado àquele achatamento estaria ajustado ao **instrumento**, não ao documento, e passaria em todo teste que eu escrevesse.

É a mesma classe do harness que mentia sobre produção na sessão 23, e do comentário que citava uma medição que não reproduzia na sessão 15. **O que sobra de honesto do PDF lido são os rótulos e a estrutura** (§C), que valem para qualquer extrator — e esses estão registrados.

---

## F. O que a folha **não** fechou

1. **Os rótulos do item 6 vieram em branco** — a tabela rótulo→valor não foi preenchida. Eu li o PDF e preenchi o que dava (§C), e o que falta é o fio B;
2. **Os termos de uso não foram achados** — o que veio foi a **política de privacidade**. São documentos diferentes, e é o de uso que diz se robô pode. `Q-EQTL-AUTORIZACAO-01` **continua aberta**;
3. **reCAPTCHA existe no site** (*"eu vi um certificado de recaptcha"*), mesmo sem CAPTCHA visível no login. Um reCAPTCHA v3 invisível pontua a sessão, e navegador headless costuma pontuar baixo — é risco para a fase D, e mais um argumento para o §D.

---

## 0. A fila, revisada — e o que esta frente muda nela

A fila vigente é a `RETOMADA-2026-08-06` §3. Remedida hoje contra produção, **ela não mudou** — e continua sem uma linha de código:

| # | Pendência | Dono | Estado em 07/08 |
|:--:|---|---|---|
| 1.1 | CPF/CNPJ de **24 pessoas** — `npm run documentos` | operação | 🔴 **0 de 29** clientes faturáveis têm documento |
| 1.2 | Dia de vencimento de **29 UCs** — `npm run vencimentos` | operação | 🔴 aberta |
| 1.3 | CPF/CNPJ de **2 originadores** — `npm run originadores` | operação | 🔴 aberta |
| 1.4 | Digitar os **29 contratos** — depende de 1.1 e 1.3 | operação | 🔴 **0 contratos** |
| — | **`Q-FATCHEIA-01`** — decidir **antes** de importar contratos | **dono** | 🔴 tem prazo |
| — | **`Q-CLIENTEDUP-01`** — 5 das 29 UCs são duplicatas | **dono** | 🔴 aberta |
| 1.6 | Escolher a competência — 2026-06 sai com **28 de 29** | **dono** | 🔴 aberta |
| 3.1 | `npm run tarifas` **entre** compor e emitir | operação | 🟡 contado desde 06/08, não travado |
| 2.5 | Endereço do pagador de 29 UCs — só boleto | operação | 🔴 aberta |
| §2 | **Sicoob** — portal, `http.ts`, A1, webhook | **dono** | ⏸️ **adiado por pedido — última etapa** |

### O que esta frente muda, e é mais do que parece

**Ela é a resposta que faltava para a `Q-TARIFA-CONC-01`.** Aquela questão tem duas perguntas abertas desde 30/07, e a segunda é literalmente *"quem produz a planilha da Equatorial e até quando ela chega?"*. Hoje a resposta é *ninguém*, e o efeito medido em 06/08 é o pior formato possível: sem o lançamento, a fatura **compõe e emite sem erro nenhum**, cobrando só o crédito. Uma fatura menor, que o cliente paga.

A leitura automática não responde a pergunta (a) — *se* a competência leva tarifa é decisão com dono. Ela responde a (b): **de onde o número vem, e a que custo humano.** Hoje o custo é 29 leituras manuais por mês, que é exatamente o tipo de trabalho que ninguém faz na segunda vez.

**E ela compartilha o caminho crítico com a primeira fatura, o que ninguém tinha notado.** Medido hoje: o acesso à agência virtual da Equatorial é **número da UC + CPF/CNPJ do titular**. Esse CPF é o **item 1.1** — o mesmo insumo que já é o primeiro da fila, e que hoje está em **0 de 29**.

> **Consequência para a ordem do trabalho:** o item 1.1 deixou de destravar uma coisa e passou a destravar duas. Ele já era o primeiro da fila; agora é o primeiro de duas filas. Nada nesta frente anda sem ele, e nenhuma outra pendência precisa ser tocada para que ela ande.

---

## 1. O que foi medido em 07/08, antes de desenhar

Consulta ao banco e ao portal, não leitura de documento.

| # | O que | Medido |
|:--:|---|---|
| 1 | **UCs por estado** | **41** `ativa`, todas `Equatorial`. **29** com `rateio_situacao = 'ativado'`, **12** `nao_ativado` |
| 2 | **Formato do `numero_uc`** | **15 dígitos, 41 de 41**, só dígitos, **com zero à esquerda** (`000000013290060`) |
| 3 | **Documento do cliente** | **0 de 29** faturáveis têm `documento`; **0** têm `documento_validado` |
| 4 | **Distribuidoras** | **1** — `Equatorial`, ativa. Tarifa vigente `1,130000` R$/kWh, vigência aberta dos dois lados |
| 5 | **O portal** | `go.equatorialenergia.com.br`, `www.` e `goias.` respondem **HTTP 403** a cliente que não é navegador, com `set-cookie: visid_incap_*` e header `x-iinfo` — **proteção de bot (Imperva/Incapsula)** |
| 6 | **API pública** | **não existe.** O `GLOSSARIO.md` já registra: *"não tem API pública; os dados entram por digitação manual"* |
| 7 | **Base** | 25 migrations, 38 tabelas em `public`, **0 faturas, 0 contratos** |

**As três leituras que estas medições fecham:**

- **o 403 decide a tecnologia.** Cliente HTTP simples não passa. A coleta exige **navegador real** (Chromium via Playwright) — que o repositório já usa para fotografar a SPA, então não é dependência nova de conceito;
- **o zero à esquerda é o defeito silencioso mais barato de evitar e o mais caro de descobrir.** Todo caminho por planilha, OCR ou célula de Excel come zero à esquerda; uma UC que perde o zero não casa com nada e `lancarTarifasPorUC` devolve `sem_fatura` **e segue**. Já está tratado — verificação `F4a`;
- **a base está vazia de fatura**, então tudo aqui pode ser desenhado sem migration em tabela com dinheiro gravado. É a mesma janela que a `Q-PAGAMENTO-01` usou em 03/08, e ela fecha na primeira liquidação.

---

## 2. O achado que decide o desenho: **a coluna é estreita**

É o modo de falha mais caro desta frente inteira, e ele não produz erro nenhum.

O `PRD-v2.2` §5.1 define a coluna com precisão, e o `GLOSSARIO` repete:

> `valor_tarifas_concessionaria` — **fio B, iluminação pública, encargos.** Repasse puro à Equatorial. **Ninguém comissiona nem repassa sobre isso.**

Uma fatura da Equatorial tem pelo menos três números grandes na mesma página, e **os três parecem o valor certo**:

| O número | O que é | Vai para a coluna? |
|---|---|:--:|
| **total a pagar** | o que o cliente pagaria à Equatorial sem a G3 | **não** |
| **fio B + COSIP + encargos** | o repasse puro | **sim — e só ele** |
| **consumo compensado** | a energia que a G3 já cobra em `valor_consumo` | **não** |

Ler o primeiro no lugar do segundo **não gera exceção, não gera log e não gera recusa**. Gera:

- uma fatura da G3 com valor maior;
- um repasse ao dono da usina calculado sobre base errada — o `PRD` §5.2 diz que *"tarifas da concessionária ficam fora"* da base;
- uma comissão errada, pela mesma razão (§5.4);
- e um `liquido_g3` errado (§5.5), porque a fórmula **subtrai** esta parcela.

**Por isso a soma é explícita e por componente em todo o desenho, e `total_a_pagar` entra como conferência e nunca como fonte.** Não existe caminho no código escrito hoje em que o total vire o valor — e a verificação `F2c` afirma que os dois são **diferentes** de propósito: no dia em que alguém os igualar por construção, o teste cai aqui, e não na conta de um cliente.

---

## 3. A arquitetura — quatro camadas, e por que são quatro

```
  PORTAL                    ARQUIVO                  TEXTO CRU               VALOR
    │                          │                         │                     │
    ▼                          ▼                         ▼                     ▼
┌────────────────┐   ┌────────────────────┐   ┌─────────────────────┐   ┌──────────────┐
│ PortaDeColeta  │──▶│ DocumentoDaFatura  │──▶│ PortaDeLeitura      │──▶│ domínio puro │
│ DeFatura       │   │ bytes + sha256     │   │ DeFatura            │   │ (validação)  │
│                │   │ + procedência      │   │  → CamposDaFatura   │   │  → Centavos  │
│ Playwright     │   │                    │   │  (texto, como leu)  │   │              │
│ (não escrito)  │   │  guardado          │   │  Claude / PDF text  │   │  ✅ pronto   │
└────────────────┘   └────────────────────┘   └─────────────────────┘   └──────────────┘
       ▲                                              ▲                        │
   credencial_ref                                     │                        ▼
   (regra 5 — nunca                              ✅ falso pronto          ato SEPARADO:
    o segredo)                                                          aplicar à fatura
```

### 3.1 Por que a coleta e a leitura são **duas** portas, e não uma

Elas falham por motivos que não têm nada em comum, e juntá-las esconde qual metade quebrou:

| | falha por |
|---|---|
| **coleta** | credencial recusada, portal fora do ar, proteção de bot, UC sem fatura no mês |
| **leitura** | documento ilegível, layout que mudou, campo que o extrator não achou |

São dois donos, dois modos de retentativa e dois adaptadores falsos. Com a separação, **a fatura já baixada continua legível quando o portal cai**, e o mesmo PDF pode ser relido quando o extrator melhorar — sem tocar o portal de novo, que é a operação cara, a que tem limite e a que pode ser bloqueada.

### 3.2 Por que porta e não cliente direto

O precedente é duplo e os dois funcionaram: a `PortaDeLeitura` do CRM (`SPEC-002`, 57 verificações sem CRM de pé) e a `PortaDeCobranca` do Sicoob (F2 inteira testável sem certificado A1). Aqui o argumento é mais forte, porque a coleta depende de um portal de terceiro que **este repositório não controla** e que **já foi medido recusando cliente que não é navegador**.

### 3.3 Regra 5, e ela decide a forma das interfaces

Não há usuário, senha, CPF nem cookie em tipo nenhum de `src/concessionaria/porta.ts`: o que circula é `credencial_ref`, e quem resolve é o adaptador, no momento da chamada. **Um tipo que aceitasse o segredo faria a violação compilar** — foi assim que `src/sicoob/porta.ts` fechou a mesma porta.

O armazenamento é o do **`ADR-0005`**, já decidido em 05/08: Supabase Vault + resolvedora `SECURITY DEFINER` amarrada ao tenant. **Esta frente não reabre o ADR e não precisa de cofre novo** — ela é o segundo consumidor do primeiro.

> **E há uma pergunta de fronteira que não é minha:** o par (UC, CPF) é *dado de negócio* — o CPF já vai viver em `cliente.documento` para ativar contrato — **e** é *credencial de acesso a sistema de terceiro*. As duas coisas ao mesmo tempo. Ver `Q-EQTL-CRED-01`.

### 3.4 O texto cru chega inteiro ao domínio, e isso não é cerimônia

A porta de leitura devolve **texto**, exatamente como o extrator leu — `R$ `, milhar com ponto, zero perdido e tudo. Não devolve `Centavos`.

Se devolvesse número já convertido, a regra de `"1.234"` viveria dentro do adaptador: fora do alcance dos testes, **diferente da regra da planilha**, e impossível de conferir contra o original. O ensaio precisa imprimir a **interpretação ao lado do que estava escrito** — é a única forma de pegar `"1.234"` lido como R$ 1,23 antes de a fatura sair, e é a lição que o `importar-tarifas` já tinha aprendido.

A verificação **`F11a`** prende as duas leituras juntas: cinco formatos ambíguos dão o **mesmo centavo** pelos dois caminhos que alimentam a mesma coluna, comparado saída com saída e não contra constante escrita à mão.

### 3.5 O que a leitura **não** faz: aplicar

O coletor grava o que a fatura da distribuidora **disse**. Aplicar isso a `fatura.valor_tarifas_concessionaria_centavos` é **outro ato**, explícito, com trilha própria.

É a mesma separação que a sessão 23 fez entre *editar uma chave Pix* e *escolher qual é a padrão*, e pela mesma razão: juntar os dois faria uma coleta de rotina mudar o valor de uma fatura sem ninguém pedir. E `lancarTarifasPorUC` **só aceita rascunho** — depois de emitida, corrigir é cancelar e recompor, com motivo na trilha.

---

## 4. As fases, com pré-requisito nomeado

| Fase | O quê | Pré-requisito | Dono | Estado |
|:--:|---|---|---|---|
| **A** | **Medir o portal.** Uma sessão de navegação com a folha de campo | credencial de um cliente real | **dono** | 🔴 **bloqueia B2, C e D** |
| **B1** | Porta, adaptador falso, domínio puro, testes | — | — | ✅ **feito hoje, 42 verificações** |
| **B2** | Ajustar `CamposDaFatura` ao layout real | **A** | — | ⏸️ |
| **C** | **Migration 26** — `fatura_concessionaria`, `credencial_concessionaria`, `coleta_execucao` | **A** + `Q-EQTL-ESCOPO-01` | — | ⏸️ |
| **D** | Coletor real em Playwright | **A** + credenciais | — | ⏸️ |
| **E** | Extrator real (§6) | uma fatura real em mãos | — | ⏸️ |
| **F** | `npm run coletar -- --ensaio\|--valendo` | C, D, E | — | ⏸️ |
| **G** | Aplicar à fatura — ato separado, com trilha | F + `Q-TARIFA-CONC-01` (a) | **dono** | ⏸️ |
| **H** | Agenda periódica | G | — | ⏸️ |

**A fase A é a primeira e é do dono, pela mesma razão que o portal do Sicoob foi:** o que a tela *oferece* responde perguntas de projeto que nenhuma documentação responde. A folha está em **`EQUATORIAL-portal-2026-08-07.md`** — dez itens, lacunas para preencher enquanto navega, e uma tabela de *se vier X, então Y*.

**Nada aqui exige deploy** enquanto não houver rota nem SPA nova: os scripts rodam do Codespace contra a `DATABASE_URL` de produção, como `npm run tarifas` e `npm run contratos` já rodam.

---

## 5. O que NÃO foi decidido aqui — as seis questões (regra 10)

| ID | Sev. | A pergunta | Dono | Prazo |
|---|:--:|---|---|---|
| **`Q-EQTL-ESCOPO-01`** | 🔴 | *"UCs ativas"* são as **41** (`status='ativa'`) ou as **29** (`rateio_situacao='ativado'`)? As duas leituras são defensáveis e mudam quem é cobrado do quê | **dono** | antes da migration 26 |
| **`Q-EQTL-CAMPOS-01`** | 🔴 | **Qual rótulo da fatura é qual campo.** Ninguém deste lado viu uma fatura da Equatorial GO. "Encargos" inclui bandeira? ICMS? PIS/COFINS? multa da própria Equatorial? | **dono + contador** | bloqueia B2 |
| **`Q-EQTL-CRED-01`** | 🔴 | O par (UC, CPF) é dado de negócio **e** credencial de terceiro. Vai para o Vault do `ADR-0005`, ou o CPF de `cliente.documento` serve direto? | **dono** | antes da migration 26 |
| **`Q-EQTL-AUTORIZACAO-01`** | 🔴 | **Autorização e termos de uso.** Acessar o portal em nome do cliente exige mandato registrado; automatizar pode contrariar os termos da Equatorial. E a fatura carrega endereço, CPF e histórico — retenção é LGPD | **dono** | antes da fase D |
| **`Q-EQTL-DIVERG-01`** | 🟡 | Quando a leitura discorda do que já está na fatura da G3 — recusa, marca ou só conta? O precedente do projeto (`prontidao`, `conferirTarifas`) é **contar** | **dono** | antes da fase G |
| **`Q-EQTL-GLOSSARIO-01`** | 🟢 | O `GLOSSARIO.md` afirma que os dados da distribuidora *"entram por digitação manual"*. Deixa de ser verdade na fase F | autor do glossário | quando F entrar |

**As quatro vermelhas têm prazo porque a migration 26 congela escolha em schema** — e o projeto já mediu, na `Q-PAGAMENTO-01`, quanto vale decidir enquanto a tabela tem zero linhas.

---

## 6. O extrator — o que já está resolvido e o que custa

O projeto é TypeScript e não tem dependência de modelo hoje. A escolha natural é o SDK oficial da Anthropic (`@anthropic-ai/sdk`), com **`claude-opus-5`** e **saída estruturada** — `output_config.format` com JSON Schema, de forma que o modelo **não possa** devolver um campo fora do formato, em vez de o código torcer para que devolva.

**Dois caminhos, e eles não competem:**

| Documento | Caminho | Quando |
|---|---|---|
| **PDF com camada de texto** | extrair o texto e casar rótulos — determinístico, sem custo por documento, reproduzível | é o caso normal do portal |
| **imagem, ou PDF escaneado** | modelo de visão | foto de cliente, PDF sem texto |

**O custo, medido em preço de tabela:** uma página de fatura em alta resolução custa até ~4.784 tokens de imagem; com ~500 de saída, dá cerca de **US$ 0,04 por documento** em Opus 5 (US$ 5/MTok entrada, US$ 25/MTok saída). Para **29 UCs por mês: ~US$ 1,10/mês** — e o prompt de extração, sendo idêntico entre documentos, cai no cache de prompt (mínimo de 512 tokens no Opus 5), o que reduz mais.

> **Custo não é a objeção desta frente.** A objeção é a `Q-EQTL-CAMPOS-01`: o modelo lê muito bem o número que você pedir, e o risco inteiro está em pedir o número errado — que é o §2.

**E o extrator não recebe voto de confiança em porcentagem, de propósito.** `ExtracaoDaFatura` carrega o **trecho original** de cada campo, não um score. Um número de 0 a 1 convida a um limiar, e um limiar é decisão de negócio disfarçada de configuração: *abaixo de quanto a fatura deixa de ser cobrada?* Isso tem dono, e não é o extrator. O que serve para conferir é o texto original, que uma pessoa lê.

---

## 7. O que ficou pronto hoje — e o que isso **não** cobre

| Arquivo | O quê | Verificações |
|---|---|---|
| `src/dominio/fatura-concessionaria.ts` | leitura pura: valida, converte, recusa com nome, soma explícita, lote com soma fechada | — |
| `src/concessionaria/porta.ts` | as duas portas, cinco recusas nomeadas, os dois adaptadores que recusam sem credencial | — |
| `src/concessionaria/falso.ts` | portal e extrator falsos, deterministas, com relógio injetado | — |
| `tests/fatura-concessionaria.ts` | **42**, ligadas ao `npm test` | `F1`–`F11`, `P1`–`P4` |

**As sete invariantes que passam a ter teste** (regra 8):

1. **ausente não é zero** — parcela que o documento não mostrou recusa a leitura, não vira R$ 0,00 (`F1`);
2. **o total nunca é o valor** — e `F2c` afirma que os dois são diferentes de propósito;
3. **conferência conta e não decide** — total menor que a soma vira aviso, e o valor não muda (`F3`);
4. **o zero à esquerda volta**, e UC com dígito a mais é recusada em vez de truncada (`F4`);
5. **kWh não vira centavos** — regra 1, com o sentido perigoso afirmado (`F5b`);
6. **a soma do lote fecha** — `lidas + recusadas === entradas`, sempre (`F9a`);
7. **duplicata é nomeada, nunca somada** — somar produziria o dobro do repasse sem erro nenhum (`F10`).

### O que isto NÃO cobre, e a distinção é a mesma que o `401` ensinou

**Nenhum byte de rede foi trocado com a Equatorial, e nenhum documento real foi lido.** O que está provado é que, **dado** um conjunto de campos, o valor que chega na coluna está certo ou é recusado com nome. Qual rótulo da fatura produz qual campo continua sendo a `Q-EQTL-CAMPOS-01` — e é a fase A que a responde.

**Um erro meu desta sessão, e ele fica registrado.** A verificação `F4c` mandava `UC 132.900-60` e esperava que passasse: o rótulo "UC" é apresentação, afinal. Só que aceitá-lo exige decidir que *algumas* letras são rótulo e outras são dígito mal lido — e distinguir `"UC"` de `"O"` é exatamente a adivinhação que o módulo recusa em `F4d`. **O teste estava errado, não o código.** A regra ficou uma só e sem exceção: qualquer letra recusa.

---

## 8. Sicoob — por que não está aqui

**Adiado a pedido do dono, e fica para a última etapa.** O estado não mudou e nada nele apodrece por esperar:

- `src/sicoob/http.ts` **continua não escrito**, por decisão registrada — escrever adaptador que nada pode chamar é a `Q-PECA-NAO-PLUGADA-01`;
- o **portal developers** continua sendo a próxima ação daquela frente, e a folha `SICOOB-portal-2026-08-06.md` continua válida;
- o `ADR-0006` continua aceito, com as quatro decisões.

**E vale repetir o que a `RESUMO-SESSAO-23` já dizia: o portal do Sicoob não move a primeira fatura.** São duas cadeias. O meio de pagamento de hoje é o Pix estático, que já está no ar com a chave cadastrada — e esta frente da Equatorial não depende do Sicoob por caminho nenhum.

---

## 9. O que eu decidi NÃO fazer

1. **Não escrevi o coletor em Playwright.** É a `Q-PECA-NAO-PLUGADA-01` em forma pura: um scraper contra um portal que ninguém navegou, com proteção de bot medida e sem uma credencial para exercitar, é código que vai ser reescrito inteiro depois da fase A.
2. **Não escrevi a migration 26.** Duas questões vermelhas (`ESCOPO`, `CRED`) mudam colunas dela, e a `RETOMADA` §5 é explícita: *não aplique migration sem o deploy em seguida*.
3. **Não escolhi o escopo das UCs.** As 41 e as 29 são as duas leituras do que foi pedido. O script vai exigir `--escopo` **sem default**, no precedente do `bootstrap-plataforma-admin.sql`.
4. **Não decidi o mapa dos campos.** É a `Q-EQTL-CAMPOS-01`, e metade dela é do contador — a `PAUTA-contador.md` é o canal que já existe.
5. **Não toquei em nada do Sicoob**, por pedido.
6. **Não apliquei nada em produção.** Zero migrations, zero escritas; só leitura para medir.
