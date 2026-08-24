# RETOMADA — Financeiro G3, 21/08/2026

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Três minutos**, e diz onde tudo parou |
| **Substitui** | `RETOMADA-2026-08-15.md` para efeito de "onde estamos"; as anteriores continuam sendo a linha do tempo |
| **O que esta leva fez** | A **central de ajuda** entrou em toda tela · o **conector passou a rodar sozinho** · as **12 fases do cliente** foram medidas e acharam uma bifurcação · o dono **decidiu** e a **junção foi construída, aplicada e provada** · a **2ª via** nasceu · a **divisão 70/30** ficou visível e foi gravada |
| **Suíte** | sem banco: `typecheck` + `documento` + `brcode` + `dominio` + `web` → **`EXIT=0`, 2.110 verificações**. ⚠️ `test:repos` e `test:isolamento` **não rodam nesta VPS** — ver §5 |
| **Repositório** | **16 commits**, `main`, nada por comitar. Do `7dfe064` ao `5066c94` |
| **Produção** | **34 migrations no ar** (a 34 aplicada hoje) · build e restart feitos · `financeiro.blackhaus.io` em 200 |

> ## A frase de uma linha
>
> **O caminho da fatura é a unificada, a ligação com a cobrança existe e está
> provada, e o que falta para a primeira fatura sair não é código — são quatro
> insumos, e três deles são do dono.**

---

## 0. O estado, em números — medido hoje, contra produção

| | | | |
|---|--:|---|--:|
| clientes espelhados | **92** | contratos | **0** |
| com documento **confirmado** | **18** | originadores | **0** |
| unidades consumidoras | **46** | donos de usina | **0** |
| usinas ativas | **4** | **percentuais de repasse** | **4** ✅ |
| faturas | **0** | contas lidas | **0** |
| boletos · pagamentos · repartições | **0** | verificações na suíte | **2.110** |

### A prontidão de 06/2026 — a competência que fecharia com mais unidades

```
faturáveis 29 · pode_faturar false · pode_repartir false

  pendente   documento_do_cliente      11/29   bloqueia fatura
  pendente   contrato_ativo            29/29   bloqueia fatura
  ok         rateio                     0/29
  não medido geracao_da_competencia     0/0
  pendente   vencimento                29/29   bloqueia fatura   ⚠️ ver §4.4
  não medido tarifa_da_uc               0/0                      ⚠️ ver §4.4
  pendente   dono_da_usina              4/4    bloqueia repartir  ⬅️ o último
  ok         regra_de_repasse           0/4                       ✅ fechou hoje
  não medido originador_do_contrato     0/0
  não medido regra_de_comissao          0/0
  pendente   cobranca_sicoob            1/1
```

Se tudo fechasse, **junho sairia com 28 de 29 unidades e ~R$ 15.367,38**
(estimado pela mesma fórmula que o sistema usa). Julho sairia com 9, porque só a
usina `0002` tem geração de julho.

---

## 1. As quatro decisões do dono nesta sessão

Todas registradas no `QUESTOES.md` com o verbatim.

| Decisão | O que fechou |
|---|---|
| *"vamos com o caminho da fatura unificada"* | **`Q-CICLO-01`** — o documento oficial é o de **7 faixas**, montado da conta da distribuidora lida |
| *"Renata e Out Sales são tipo próprio"* | o `tipo` dos originadores: **`vendedor_g3`**, 25% na 1ª e 25% na 2ª cobrança cheia |
| *"os valores destinados à Equatorial, que são as tarifas mínimas"* | **`Q-DOCG3-10`**, aberta desde 12/08 — o que a planilha chamava de "tarifa mínima" é a parte da distribuidora, exatamente o que a medição suspeitava |
| *"70% para o dono da usina, 30% fica na G3, desde 01/01/2026"* | o percentual de repasse, **gravado nas 4 usinas** |

---

## 2. O que foi construído

### 2.1 A junção — a conta lida vira cobrança

Era o achado que governava tudo: existiam **dois caminhos de fatura e eles não se
encontravam**, e o documento que o cliente efetivamente recebe era o único dos
dois que **não conseguia pagar o dono da usina**.

| | |
|---|---|
| **migration 34** | `registro_de_fatura_unificada.fatura_id`, FK composta, índice **cheio** — parcial sobre exatamente as colunas de uma FK é o único caso que a regra 11 proíbe pelo nome |
| `src/dominio/fatura-do-registro.ts` | a triagem, pura, 9 recusas nomeadas · **42 verificações** |
| `src/repos/fatura-do-registro.ts` | `INSERT ... SELECT` que copia os centavos **de dentro do banco** — nenhum valor de dinheiro passa pelo Node |
| rotas | `GET .../registros/:id/ensaio` (não escreve) e `POST .../registros/:id/faturar` |
| tela | botão **"gerar cobrança"** na lista de contas registradas |

**O achado que tornou isso barato, e ele foi medido antes de escrever:** o motor
de repartição **já tinha a forma exata** da conta unificada. Ele lê da fatura
`valor_consumo_centavos` e `valor_tarifas_concessionaria_centavos`; a conta
unificada produz `energia_g3_centavos` e `total_equatorial_centavos`. Mapeamento
de um para um. **Nenhuma linha de `src/dominio/split.ts` mudou.**

### 2.2 A segunda via

Era o segundo propósito que a migration 29 declarou para aquela tabela — *"a
economia acumulada e a segunda via"* — e o único nunca construído. Virou urgente
com a decisão: a folha de 7 faixas só existia enquanto os campos estivessem na
tela.

Botão **"2ª via"** por linha. A conta é **recalculada com os parâmetros
congelados daquele mês e conferida** contra os nove centavos gravados —
divergência levanta com nome, em vez de virar um papel diferente do que o cliente
tem na mão. `src/dominio/segunda-via.ts` + **25 verificações**.

### 2.3 A divisão 70/30, visível

A tela pedia um percentual e não dizia que o resto é da casa. Agora mostra
**"70% para o dono da usina · 30,00% fica na G3"** ao vivo, mais a coluna *"Fica
na casa"* no histórico, mais o aviso de que **nas duas primeiras cobranças cheias
sobram 5%, não 30%** — a comissão sai da mesma parte.

**Só um número é gravado.** Os 30% são apurados por subtração; guardar os dois
seria guardar a mesma informação duas vezes, e bastaria salvar 70 e 25 para o
dinheiro deixar de fechar sem erro em lugar nenhum.

### 2.4 Antes disso, no mesmo dia

A **central de ajuda** em toda tela (busca por palavras leigas, prontidão ao
vivo, invariante de que toda resposta termina numa rota clicável), a **varredura
de vocabulário** das 12 telas, e o **conector rodando sozinho** a cada 15 minutos
pelo `financeiro-ciclo.timer` — provado por calendário.

---

## 3. Como provar que funciona sem PostgreSQL local

Esta VPS não tem um, e `tests/repos.sh` exige. Duas ferramentas nasceram disso:

> **⚠️ O `npm run` destes comandos NÃO funciona nesta VPS, e a correção é de
> 24/08.** Os scripts do `package.json` carregam `--env-file=.env`, e **não existe
> `.env` no diretório da aplicação** — só `.env.bak`, que guarda a credencial de
> dono. O serviço lê `/etc/financeiro.env`, e é esse arquivo que se passa à mão.
> Sem isso o comando morre em `node: .env: not found` antes de conectar.

```bash
cd /opt/financeiro/app && export PATH=/opt/financeiro/node/bin:$PATH
E=/etc/financeiro.env   # o env do serviço; `npm run` procuraria um .env que não há

node --experimental-strip-types --env-file=$E scripts/ensaio-da-juncao.ts \
  --auth-user <uuid> [--tenant <uuid>]
#   monta originador, contrato e conta lida como FIXTURE, fatura de verdade
#   contra o schema real, confere 15 coisas e termina em ROLLBACK.
#   A última verificação conta as tabelas depois e falha se sobrar linha.
#   NÃO tem --valendo, e isso é o desenho.

node --experimental-strip-types --env-file=$E scripts/ensaio-da-prontidao.ts \
  --auth-user <uuid> --competencia 2026-06
#   NOVO em 24/08. Cria uma conta lida, mexe nela campo a campo e confere que
#   cada camada do relatório se move pela regra — 9 verificações, ROLLBACK no
#   fim. É o que cobre a consulta crua da prontidão sem PostgreSQL local.

node --experimental-strip-types --env-file=$E scripts/faturar.ts \
  --prontidao --auth-user <uuid> --competencia 2026-06
#   leitura PURA contra produção: o que falta, camada a camada, com dono.

node --experimental-strip-types --env-file=$E scripts/cadastrar-repasse.ts \
  --ensaio --auth-user <uuid> --inicio 2026-01-01
#   idem para o percentual. Repetível: usina com vigência aberta é PULADA.
```

> `--tenant` é **opcional** para quem tem um vínculo só — os scripts caem no
> vínculo único da sessão, como o `faturar` sempre fez. Um `--auth-user` que
> funciona: `35f4dda9-5265-434e-8097-5d41c384a9ba`.

---

## 4. Onde parou — o que fazer a seguir

A fila completa, com dono, está no **`PLANO-ciclo-do-cliente-2026-08-21.md` §4b**
(17 demandas). O topo:

### 4.1 Travam o ciclo inteiro — e as três são do dono

1. **`ANTHROPIC_API_KEY` no `/etc/financeiro.env`** + `systemctl restart`. Sem
   ela o ciclo **não começa**: as duas rotas de leitura respondem 503. **Girar a
   chave antes** se for a mesma exposta pelo proxy aberto da referência na Vercel
   (`Q-REF-SEGREDO-01`).
2. **Uma leitura real** contra um PDF de verdade — `Q-LEITOR-01`. Que o extrator
   funciona no ar **não está provado**.
3. **Preencher o emissor** em `/documento#cadastro` — razão social, CNPJ,
   contato, logo. Hoje a folha **cobra sem dizer quem cobra**, e é a esse nome
   que o aviso contra o golpe se amarra.

### 4.2 Travam o contrato

4. **CPF da Renata** (natureza `pf`) e **o documento do "Out Sales"** — e aqui há
   uma pergunta antes do número: *equipe não tem CPF*. Ou há um CNPJ, ou há uma
   pessoa que responde pelos 3 contratos. **Sem isso os 3 dele não nascem; os 26
   da Renata nascem.**
   O CRM **não tem nenhuma coluna de CPF/CNPJ** — varri o `information_schema`
   hoje. O número não existe em sistema nenhum, e o importador aborta o lote
   inteiro num dígito errado, de propósito.

### 4.3 Trava a repartição — e agora é só um

5. **Dono de cada usina — 4 de 4.** Com o percentual fechado hoje, **este é o
   último cadastro entre o dinheiro entrar e ele poder ser dividido.** Exige
   chave Pix ou conta completa, conferida no cadastro porque no pagamento já é
   tarde.

### 4.4 ✅ RESOLVIDO em 24/08/2026 — a consequência foi absorvida

> **A prontidão passou a medir o caminho oficial.** As duas camadas foram
> remedidas e nasceu uma terceira, que é a que faltava:
>
> | | antes (21/08) | agora (24/08) |
> |---|---|---|
> | `conta_lida_da_competencia` | *não existia* | **pendente 29 de 29** ⬅️ o trabalho real |
> | `vencimento` | pendente 29/29 | **não medido 0/0** — o universo virou a UC *com* conta |
> | `tarifa_da_uc` → **`tarifa_na_conta`** | não medido 0/0 | **não medido 0/0**, e agora pela razão certa |
>
> O `vencimento` passou a rodar o mesmo predicado de `vencimentoEscolhido` — a
> conta primeiro, o cadastro como segunda fonte — e a tarifa deixou de olhar o
> cadastro, porque no caminho oficial ele **não é fonte de nada**: `triarRegistro`
> recusa por `sem_tarifa_na_conta` olhando só o registro. Uma camada verde sobre
> o preço do cadastro autorizaria uma cobrança que a triagem recusaria em seguida.
>
> **Provado sem PostgreSQL local**, pelo mesmo desenho do ensaio da junção:
> `npm run ensaio-prontidao` cria uma conta lida contra o schema real, mexe nela
> campo a campo — tarifa zerada, vencimento apagado, dia do cadastro preenchido,
> conta de outro mês — confere **9 coisas** e termina em `ROLLBACK`, com a última
> contando as tabelas para provar que nada ficou. O ramo vazio (o que produção
> mostra hoje) não exercita nem a junção por número de unidade, nem o filtro de
> competência, nem a segunda fonte do vencimento; este ensaio exercita os três.
>
> **E uma frase que passou a mentir foi corrigida junto:** o relatório de linha de
> comando dizia *"NÃO MEDIDO — o universo depende de contrato, e não há contrato"*
> para toda camada não medida. Virou verdade pela metade no instante em que
> `vencimento` e `tarifa` passaram a depender da **conta lida** — um diagnóstico
> errado com cara de diagnóstico. O texto agora é genérico, e qual é a camada de
> cima está na ordem da lista.
>
> Sobrou uma pendência de operação, e ela é a de sempre: **as 29 contas do mês
> ainda entram uma a uma** (`Q-CONTA-LOTE-01`), e agora a tela diz isso.

**O diagnóstico original fica abaixo, intacto:**

**A tela de Pendências continua medindo o caminho antigo em duas camadas.**

- `vencimento` acusa **29/29** — mas no caminho unificado o vencimento **vem da
  conta da distribuidora**, e o cadastro é a segunda fonte. Já está assim no
  código da junção (`vencimentoEscolhido`), e a prontidão não sabe.
- `tarifa_da_uc` idem: a tarifa oficial agora é a **lida da conta**, com seis
  casas; a da UC deixou de ser a fonte no caminho oficial.

Hoje as duas aparecem como `pendente 29/29` e `não medido 0/0`, então **ninguém
foi enganado ainda** — mas assim que existir contrato, a prontidão vai mandar
preencher 29 vencimentos que o caminho oficial não usa. **É a primeira coisa a
olhar na próxima sessão.**

*(Foi. Ver o bloco no topo desta seção.)*

---

## 5. Armadilhas — o que morde

| | |
|---|---|
| **`test:repos` e `test:isolamento` não rodam aqui** | Exigem PostgreSQL local. Tudo o que eles cobririam da junção está no `npm run ensaio-juncao`, e o da prontidão no `npm run ensaio-prontidao` (24/08). **Dívida aberta**, e a próxima sessão num ambiente com Postgres deve rodá-los |
| **O cliente do Prisma não conhece `fatura_id`** | A migration 34 foi aplicada e o `db pull` **não** rodou. A junção usa SQL cru de propósito, e a guarda de catálogo (`juncaoDaFaturaUnificadaExiste`) evita o `42703`. Rodar `db pull` + `generate` é dívida, não urgência — e cuidado: ele **reverte** edições feitas à mão no `schema.prisma` |
| **`GET /faturas/:id/documento` ainda compõe a folha de 5 faixas** | Para uma fatura vinda de conta lida, o documento certo é a **2ª via**. Decidir se aquela rota aponta para cá ou sai — item 15 do `PLANO` §4b |
| **A credencial de dono está em `.env.bak`** | `DIRECT_URL`, usada para aplicar migration. **Nunca imprimir a senha.** Sempre rodar `conferir-banco-alvo identidade` antes: `migrate deploy` contra o banco errado não recusa — ele **cria** |
| **Renegociar repasse não é editar** | Abrir vigência nova fecha a anterior. E uma vigência que **comece antes** da atual é recusada — uma data tardia demais só se conserta fechando a atual à mão |
| **`vazio=` carrega texto visível** | Entrou na varredura de jargão hoje, depois de três frases passarem despercebidas. Se acrescentar propriedade de texto nova, acrescente à lista de `PROPS` também |

---

## 6. O que eu não fiz, e por quê

- **Não cadastrei os originadores.** O documento não existe em sistema nenhum —
  medido. Inventar um CPF poria um número falso no caminho que vira pagamento, e
  o próprio script diz por quê: *"um CPF com um dígito trocado entra, fica ativo,
  e a comissão dele sai calculada para um documento que não existe."*
- **Não escolhi a data de vigência do repasse** — esperei o dono dizer, porque
  errar para a frente é assimetricamente caro.
- **Não escrevi `src/sicoob/http.ts`.** Não antes do sandbox: o primeiro `POST`
  real vai corrigir alguma suposição de identidade do cooperado, e código escrito
  contra suposição é reescrito inteiro.
- **Não reescrevi a base do repasse** para a decomposição da referência
  (`Q-DOCG3-11`) — falta o aval do contador e uma fatura de geração distribuída
  real. Mover a base do split muda comissão e repasse **sem erro visível**.

---

## 7. Documentos vivos

| Arquivo | Para quê |
|---|---|
| `PLANO-ciclo-do-cliente-2026-08-21.md` | **o mapa das 12 fases** e a fila de 17 demandas com dono (§4b) |
| `PARTIDA.md` | a fila de cadastro, item a item, com o que já fechou |
| `PENDENCIAS.md` | o índice único das pendências |
| `QUESTOES.md` | o registro com dono por entrada — regra 10 |
| Este arquivo | onde tudo parou em 21/08 |
