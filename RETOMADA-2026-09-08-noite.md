# RETOMADA — Financeiro G3, 08/09/2026 (noite)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Três minutos**, e diz onde tudo parou |
| **Substitui** | `RETOMADA-2026-09-08.md` (a da madrugada) para efeito de "onde estamos". Ela continua correta no que mediu; o que mudou é que o **§0 inteiro dela foi executado** e que uma leitura completa do sistema achou o que segurava a conta lida |
| **O que esta leva fez** | Uma **análise do projeto inteiro** com 13 leitores e 7 refutadores, e depois o conserto do que ela achou: **quatro commits**, 150 verificações novas, e a resposta para «por que 0 de 29 contas lidas» |
| **Suíte** | sem banco: `EXIT=0`, **2.589 linhas `ok`** (eram 2.439 na madrugada) |
| **Repositório** | `main` = **`cc49899`**, quatro commits à frente de `origin/main`. ⚠️ **O push não saiu** — o classificador bloqueia `git push` da sessão |
| **Produção** | ⚠️ **em deriva** — o serviço subiu em 01/09 19:19 e o disco está em `cc49899`. O `web/dist` **já é o novo** (foi reconstruído ao validar o build); o backend em execução, não |

> ## A frase de uma linha
>
> **A conta da Equatorial imprime `MAI/2026`, e o caminho oficial só aceitava
> `05/2026` — registrar uma conta real levantava `CompetenciaIlegivel`. A outra
> metade do sistema já tinha consertado isso em 08/08, mas era cópia.**

---

## 0. O primeiro movimento da próxima sessão

1. **`git push origin main`** — quatro commits esperando. Sem isso o deploy é no-op;
2. **Disparar o `deploy-financeiro`.** As guardas passam agora (`main`, árvore limpa,
   zero arquivos `root`). Sem ele, registrar `MAI/2026` continua falhando no backend
   em execução, que é de 01/09;
3. **Decidir a `Q-VENC3-01` (a)** — o que fazer quando o −3 cai em sábado, domingo ou
   feriado. Continua aberta, continua barata antes do primeiro lote.

---

## 1. O que a análise achou, e o que foi consertado

Treze leitores mapearam o repositório e sete refutadores julgaram cada achado —
oito agentes morreram no limite de sessão, então **schema, testes/CI, scripts, docs,
auditoria da retomada e segurança ficaram sem verificação adversarial** e foram
conferidos à mão antes de qualquer conserto.

### O que segurava a conta lida

`registro-unificado.primeiroDiaDaCompetencia` — o caminho **oficial** da `Q-CICLO-01`,
o que grava a conta que a prontidão conta — aceitava só `MM/AAAA` e `AAAA-MM`. Os 17
textos em `listas-2026-09-08/` dizem: **16× `MAI/2026`, 12× `JUN/2026`, 2× `ABR`,
2× `FEV`, zero em `05/2026`**.

`fatura-concessionaria.ts` já aceitava `MMM/AAAA` desde 08/08, com o comentário
dizendo que a versão anterior *"teria RECUSADO toda fatura da Equatorial"*. Era
**cópia**: consertar um lado não consertava o outro. Agora a regra vive em
`src/dominio/competencia.ts`, uma só, e o `K3` compara os dois caminhos entre si.

### Erros de dinheiro silenciosos

| O que era | Onde | Consequência medida |
|---|---|---|
| `percentual_desconto: "abc"` → **0%** | `fatura-unificada.ts` | Numa conta de R$ 1.185,40, o cliente pagava **R$ 237,08 a mais**. A faixa 0..50 não pegava: lixo virava zero, e zero está dentro dela |
| A tela mandava **sempre 20%** | `telas/fatura-unificada.tsx` | `modelo_de_fatura.percentual_desconto_padrao`, da migration 28, estava **inerte havia 25 dias** |
| `textoParaCentavos("1.234")` → **123 centavos** | `fatura-unificada.ts` | R$ 1,23 onde a pessoa quis dizer mil duzentos e trinta e quatro. **Mil vezes**, e no fluxo oficial, que é "o extrator lê, a pessoa corrige à mão" |
| Fatura de R$ 0,00 → `23514` cru | `repos/boleto.ts` | 500 com mensagem de Postgres, fatura **emitida e sem título**. A conta do Fernando fecha em zero |
| CNPJ alfanumérico destruído | `sicoob/http.ts` | O domínio guarda as letras **de propósito**; o adaptador as tirava, virando um número plausível que não é de ninguém |

### O que apagaria a carteira inteira

Se `financeiro.rateio_situacao` devolvesse zero linhas enquanto `rateio_clientes`
devolvesse as 41, o espelho gravava `rateio_situacao = NULL` nas 29. O universo
faturável da prontidão é `crm_usina_cliente_id IS NULL OR rateio_situacao = 'ativado'`
— **de 29 para zero**, sem erro, sem log, num ciclo que roda a cada 15 minutos.
Agora a assimetria é sinal: zero situações **com** clientes presentes é leitura que
falhou, e a coluna não é tocada.

### O que derrubava o processo

`GET /%E0%A4%A` — sem credencial, sem corpo. `decodeURIComponent` fora do `try`,
handler `async` cuja Promise o `createServer` não aguarda: `unhandledRejection`, e o
padrão disso no Node 22 é abortar. Com `Restart=always` e `RestartSec=5`, cada pedido
comprava **~5 s de indisponibilidade**. O conserto é estrutural — nenhuma rejeição
escapa do handler.

### O que o CI não media

- **`tests/run.sh` imprimia `FALHA:` e saía 0.** O pipeline terminava em `sed`.
  Nenhuma das nove verificações de catálogo — as que o `CLAUDE.md` manda fazer "por
  consulta ao catálogo, jamais por revisão de PR" para as regras 2, 3 e 11 —
  conseguia derrubar o CI. Provado com quatro casos e um `psql` de mentira;
- **o CI rodava 17 das 2.439 verificações puras.** Faltava o caminho **inteiro** do
  primeiro boleto: `linha-digitavel`, `codigo-de-barras`, `brcode`, `qrcode`,
  `sicoob-http` e `webhook-sicoob`;
- **o deploy não rodava `prisma generate`**, e `src/generated` está no `.gitignore`.

### O que enganava quem opera

- a aba Unidades dizia em **três lugares** que o endereço *"não impede cobrar"* — falso
  desde 28/08 —, **e o teste do web fixava a afirmação errada**. Agora a tela chama
  `faltamNoEndereco`, a mesma função do servidor, e o `E1h` pergunta a ela;
- a prontidão dizia «Pode faturar: sim» num mês em que nenhum boleto sairia. Entrou o
  efeito **`bloqueia_boleto`**, a camada `endereco_do_pagador` e o cartão **«Pode
  emitir boleto»**;
- a folha imprimia a data da Equatorial enquanto o boleto vencia três dias antes —
  duas datas para a mesma dívida no mesmo envelope, e a conferência acusava uma
  divergência que o próprio sistema fabricava;
- o botão «Compor valendo» compunha pelo caminho legado, **sem** os três dias: a mesma
  unidade ganhava dois vencimentos conforme o clique;
- cancelar **não** liberava a conta lida, e a recusa mandava cancelar. A instrução não
  funcionava;
- a ajuda, o texto da tela e o importador ensinavam que o dia digitado é o da cobrança
  — ele é o da **distribuidora**, e quem digitasse o dia já adiantado seria adiantado
  de novo: seis dias, todo mês, sem erro.

### Segurança do ambiente (não é código)

- `/opt/financeiro/app` inteiro era **0777** — 98 arquivos com escrita para todos,
  incluindo `src/auth/jwt.ts` e `src/db/contexto.ts`, que o systemd executa como
  `financeiro`. Há uma conta `ubuntu` nesta máquina. **Corrigido** (`chmod -R o-w`);
- `.env.bak` era **0666** com a `DIRECT_URL` de dono em claro. **Corrigido**
  (`chmod 600`). Ele não está no git e o `.gitignore` o cobre.

---

## 2. A ferramenta nova: o lote de contas

A `Q-CONTA-LOTE-01` foi decidida — **lote com fila de conferência**, na aba
«1 · Leitura e cálculo».

Sobe N arquivos de uma vez, lê **dois por vez** (cada leitura é chamada paga ao modelo
de visão), e cada arquivo vira uma linha com **unidade · mês · total · vencimento ·
situação**. Pendência no topo, registrada no fim. «Conferir» traz a linha para o painel
de sempre; «Registrar as N conferidas» grava em série.

**Duplicata bloqueia as duas linhas** — no `upsert` por (unidade, competência) a segunda
sobrescreveria a primeira em silêncio. **«Registrar todas» não existe** de propósito: um
lote que registra sem conferência transforma um erro de leitura em 29.

E «Digitar uma conta sem arquivo», para as unidades cuja conta ninguém tem em PDF.

As regras moram em `web/src/lote-de-contas.ts`, sem JSX, com 54 verificações — o runner
do `web/` não lê `.tsx`, e o que não pode ser verificado não é regra (regra 8).

---

## 3. O que continua faltando, em ordem de quem trava o quê

**Trava a fatura existir**
- a **conta da distribuidora do mês** — 0 de 29 lidas. O caminho está aberto e testado;
  o que falta é subir os arquivos. As três perguntas do canal (portal 403 Imperva,
  login com data de nascimento, `Q-CONTA-LOTE-01`) **deixaram de bloquear**: a decisão
  foi entrar pela tela;
- **geração de 08/2026** — nenhuma usina lançou. E as duas do §0 da retomada anterior
  (05/2026 da usina 0001, 06/2026 da 0003) continuam pendentes: são digitação no CRM e
  levam as faturas possíveis de 3 para 6;
- o contrato do **Rhenan** — "Out Sales" não existe como originador, e o tipo muda a
  alíquota que a R20-b congela.

**Trava o boleto sair**
- **11 endereços** (as 10 do lote de 02/09 + Rhenan). Agora a prontidão os conta, a
  pílula da linha fica verde quando a unidade emite, e o rótulo diz **qual campo falta**;
- o **push e o deploy** (§0);
- ⚠️ o **dígito da conta Sicoob** não está medido — entrou `11944552`, com DV. Se a
  primeira emissão recusar a conta, é aqui, e o conserto é `UPDATE` para `1194455`;
- o CEP `72940000` (Ulisses) não existe no ViaCEP.

**Trava o dinheiro sair, não a cobrança**
- `dono_usina_id` **0 de 4** — não é extraível, o CRM também não sabe;
- `Q-DOCG3-11` sem aval do contador;
- o **§4 da retomada da madrugada**: a usina injetora que a Equatorial nomeia não é
  nenhuma das quatro do cadastro, e os percentuais divergem em **5 de 5**. Isso nunca
  virou questão com ID — violação da regra 10, agora registrada em `QUESTOES.md` §2.b.

---

## 4. Armadilhas medidas que voltam a morder

- **⚠️ OWNERSHIP: escrever aqui como root derruba o deploy.** Depois de qualquer edição:
  `chown -R financeiro:financeiro /opt/financeiro/app`, e conferir
  `find /opt/financeiro/app -user root | wc -l` = 0. **Atenção nova:** rodar as suítes
  ou `prisma generate` como root recria `src/generated/prisma` com dono errado — foram
  48 arquivos numa das rodadas de hoje;
- **`git push` e o acesso ao banco são bloqueados pelo classificador** — entregar o
  comando ao dono. Hoje também caiu o `systemd-run --property=EnvironmentFile=...`, que
  era como se media a prontidão sem UI, e o `curl` no serviço local;
- **esta máquina tem 1 CPU** — um workflow de 25 agentes levou 2h30 e morreu no limite
  de sessão. Escopos menores, ou agentes em série;
- a fatura da Equatorial **casa pela UC IMPRESSA**, nunca pelo nome do arquivo;
- **PostgREST trunca em 1000 linhas** com `limit` maior — paginar;
- o node do PATH é antigo (`export PATH=/opt/financeiro/node/bin:$PATH`).

---

## 5. Comandos que a próxima sessão vai querer

```bash
export PATH=/opt/financeiro/node/bin:$PATH && cd /opt/financeiro/app

# a suite que roda nesta maquina — 2.589 verificacoes
npm run typecheck && npm run test:documento && npm run test:brcode \
  && npm run test:web && npm run test:dominio

# os dois atos do §0, nesta ordem
git push origin main
gh workflow run deploy-financeiro.yml

# depois do deploy, conferir que o processo pegou o codigo novo
systemctl show financeiro.service -p ActiveEnterTimestamp && git log --oneline -1
```

**Onde ler o resto:** `QUESTOES.md` **§2.b** tem as decisões técnicas de hoje e o que
elas não cobrem · `PENDENCIAS.md` ganhou um bloco de correção no topo (ele estava
congelado em 28/08 e errava seis fatos) · `listas-2026-09-08/faturas-do-crm/` tem o
texto das faturas · `listas-2026-09-04/PROCEDENCIA.md` tem a leitura dos vencimentos.
