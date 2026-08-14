# PENDÊNCIAS — Financeiro G3

| Campo | Valor |
|---|---|
| **Para quem** | Quem quiser, em uma tela, a lista viva do que falta — e de quem é cada item |
| **O que é** | O **índice único** das pendências. Consolida e substitui os dois trackers datados que existiam soltos |
| **Substitui e apaga** | `PENDENCIAS-2026-08-05.md` e `PROXIMOS-PASSOS-2026-08-09.md` — vencidos, e agora removidos do repo |
| **NÃO substitui** | `QUESTOES.md` (registro datado, dono por entrada — regra 10) · `RETOMADA-2026-08-15.md` (onde tudo parou) · os `RESUMO-SESSAO-*` (memória datada). Estes continuam sendo a fonte; aqui é o **apontador** |
| **Data** | 14/08/2026 |
| **Estado da suíte** | `npm test` **`EXIT=0`**, **~1.911** verificações |
| **Produção** | `financeiro.blackhaus.io` · `origin/main` em `ecdddcb` · **31 migrations = 31** · Pix estático no ar |

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
compõe, emite, imprime e **cobra por Pix estático** — o que não existe é boleto registrado.

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

| # | Pendência | Estado hoje | Como entra | Dono |
|:--:|---|---|---|---|
| 1 | **CPF/CNPJ de 24 pessoas** (29 linhas de cliente) | **0 de 29** | `npm run documentos` | operação |
| 2 | **Dia de vencimento de 29 UCs** | **0 de 29** | `npm run vencimentos` | operação |
| 3 | **CPF/CNPJ de 2 originadores** + natureza | 0 | `npm run originadores` | operação |
| 4 | **Digitar os 29 contratos** | 0 | `npm run contratos` (depende de 1 e 3) | operação |
| 5 | **Emissor** — razão social, CNPJ, contato | vazio em produção | aba Documento `/documento#cadastro` | dono |
| 6 | **Tarifa das 41 UCs** (`tarifa_reais_por_kwh`) | **NULL nas 41** | aba Unidades (o conector não semeia — a coluna não está no contrato do CRM, `Q-VALOR-01(b)`) | dono/operação |
| 7 | **Endereço do pagador de 29 UCs** | **0 de 29** | `npm run enderecos` — **só o boleto depende** | operação |

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
