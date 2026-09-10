# RETOMADA — Financeiro G3, 10/09/2026 (varredura)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-10-noite.md` no §0. O corpo dela continua correto como registro |
| **O que esta sessão fez** | A **varredura completa** que o dono pediu antes de lançar a operação — e ela achou **sete atos de rotina que só existiam por fora da interface**, um deles deixando o boleto vivo no banco depois de a fatura ser cancelada. Os sete foram fechados |
| **O relatório para o dono** | 📄 **`VARREDURA-2026-09-10.md`** — retrato da produção, o que foi consertado, o que falta para a primeira fatura, e a ordem recomendada |
| **Suíte** | sem banco: `EXIT=0`, **2.873** verificações (eram 2.792) |
| **CI** | ✅ **verde nos cinco jobs** — run `34435585020`, incluindo as que só rodam lá (`N4b`..`N4f`, contra banco de verdade) |
| **Migrations** | **39**, nenhuma nova — a leva inteira é de leitura e de tela |
| **Repositório** | `main` em **`c82d777`**, `origin/main` junto |
| **Produção** | ⚠️ **NÃO subiu ainda** — ver §0 |

> ## A frase de uma linha
>
> **O sistema está construído e nunca emitiu uma fatura — e a varredura achou
> que cancelar uma fatura deixava o título vivo no banco, que a fila retentava um
> caso para sempre em silêncio, e que uma unidade estava travada há seis dias com
> a saída só no terminal. Nada disso tinha aparecido porque nada disso tinha sido
> exercido: é a hora certa de achar.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 ⚠️ O código está no `main` e NÃO está no ar

Quatro commits entraram hoje e o CI está verde nos cinco jobs. Falta subir, e a
ordem é a de sempre — a armadilha de ownership continua valendo:

```
# 1. do DONO, porque o classificador bloqueia daqui:
chown -R financeiro:financeiro /opt/financeiro/app

# 2. conferir que zerou (daqui mesmo):
find /opt/financeiro/app -user root -not -path "*/.git/*" | wc -l    # tem de dar 0

# 3. disparar o deploy:
gh workflow run deploy-financeiro.yml

# 4. conferir POR STEP, e nao pelo tique:
gh run view <id> --json jobs -q '.jobs[].steps[]|"\(.conclusion) \(.name)"'
```

**Medido agora: 59 arquivos `root:root`.** O build morre em `EACCES` sem o passo
1 — o `vite` limpa o `dist` e apagar arquivo exige escrita no diretório.

### 0.2 O que subir vai colocar no ar

| O quê | Onde aparece |
|---|---|
| «O que ainda não chegou ao banco» | aba **Emissão e cobrança**, acima da tabela do mês |
| A faixa que conta as faturas sem boleto | **Pendências**, abaixo das outras duas faixas |
| **«Cancelar o boleto no banco»** | painel da fatura, e a fatura passa a **recusar** cancelamento com título vivo |
| **«Vínculo com o outro sistema»** | linha da unidade, na aba **Unidades consumidoras** |
| **Cadastrar usina** | topo da aba **Usinas** |
| **Suspender / Reativar / Encerrar** contrato | coluna nova na aba **Contratos** |
| **Tarifa da distribuidora** | painel da fatura, enquanto ela é rascunho |

⚠️ **Nada disso foi visto por olho humano ainda.** A lição de ontem foi essa: o
painel das automações funcionava e chegava como texto solto. Vale abrir as quatro
telas depois do deploy.

### 0.3 O que ficou aberto, e de quem é

| # | O quê | De quem |
|:--:|---|---|
| **1** | 🔴 **As 29 contas da distribuidora de julho** — é a única coisa entre hoje e a primeira fatura. Julho é a competência mais perto: a geração dela já está lançada | operação |
| **2** | 🔴 **`Q-BACKUP-01`** — não há backup declarado do banco. É a única da lista sem conserto depois | dono |
| **3** | 🟠 **`dono_usina` vazia** — 4 de 4 usinas sem dono. Trava a divisão na primeira fatura paga | dono |
| **4** | 🟠 **A unidade renumerada** (`000000100076075` → `000091762801211`) — decisão de negócio, e ela tem 0 faturas e 0 contratos, então é barata agora | dono |
| **5** | 🟠 Os **10 endereços** e o **contrato «Out Sales»** | dono/operação |
| **6** | 🟠 **Cabeçalhos de segurança no nginx** — medido por `curl`: não vem nenhum. Comando pronto na varredura §8 | dono aplica |
| **7** | 🟡 **`Q-NOMEDOVENDEDOR-01`** — 27 dos 29 apontamentos por rodada são a mesma pessoa com nome curto no CRM | dono |
| **8** | 🟡 **`Q-EMISSAOTRAVADA-01`** — a folga de 24 h antes de cobrar gente. Volta só se ele quiser apertar | dono |
| **9** | 🟡 As quatro vermelhas do contador · `Q-ALERTA-EMAIL-01` · `Q-VENC3-01` (b) · `Q-RODADA-01` | dono/contador |
| **10** | 🟡 **A trilha de auditoria não tem leitor** (21.317 linhas) e **pagamentos de contas a pagar não são listados** | implementador |

### 0.4 As regras que continuam valendo depois de todo push

```
gh run list --workflow=isolamento --limit 2

# um run VERDE do migrate-financeiro NAO quer dizer "aplicada": confira os STEPS
gh run view <id> --json jobs -q '.jobs[].steps[]|"\(.conclusion) \(.name)"'
```

⚠️ E a desta sessão: **desfazer mutação é `replace` inverso, nunca
`git checkout`** — ele apaga junto o que não foi commitado.

---

## 1. Os quatro commits, e o que cada um custava

### 1.1 `f93bf5c` — a lista de quem ficou sem boleto

O §5.2 do levantamento pedia «lista de boletos travados». Ao medir para
escrevê-la apareceu o caso que a frase não via: **a fatura emitida em que ninguém
pediu o boleto.** `emitir()` não cria linha de boleto — é deliberado — e a fila só
enxerga linha que existe. Essa fatura não está em erro, não está atrasada e **não
está em fila nenhuma**.

Junto, um defeito de laço: a fila aceitava fatura `vencida` e `registrar()` recusa
tudo que não seja `emitida`, **antes de tocar qualquer coluna**. Sem escrita não
há recuo: a mesma linha voltava a cada 5 minutos, para sempre, somando um falho
por rodada.

### 1.2 `8d3943e` — o boleto que ficava vivo no banco

**O pior achado do dia.** `POST /faturas/:id/boleto/baixar` existia desde sempre e
nenhuma tela a chamava; `cancelar()` nunca olhou para o boleto. A fatura virava
`cancelada` aqui e o cliente ficava com linha digitável válida na mão — pago
depois, o dinheiro entrava e a baixa era **recusada**, porque fatura cancelada não
aceita liquidação.

Agora o servidor recusa cancelar com título vivo, nomeando o botão que resolve — e
o botão existe. A ordem inteira (recusa → baixa no banco → cancelamento passa) é
exercitada contra banco de verdade em `N4d`, `N4e`, `N4f`.

### 1.3 `977173f` — a unidade travada há seis dias

Journal: a mesma recusa **a cada 15 minutos desde 04/09 às 18h — 519 vezes**. A
saída existia só no terminal, e a tela de Pendências mandava corrigir *"no outro
sistema, que é o dono do dado"* — falso para esta recusa.

⚠️ **E a medição contra a produção mudou o texto da tela.** Exercitado o caminho
novo sem escrever nada, o caso real cai na **guarda 3**: o contrato passou a
servir `000091762801211` e nenhum contrato serve `000000100076075` — **o número da
unidade foi corrigido no CRM**. A frase genérica mandava esperar por um contrato
que já existe.

### 1.4 `c82d777` — três atos de rotina, e a varredura virando suíte

Cadastrar usina (a leitura automática **não cria usina**, e sem ela todas as
unidades daquela usina são recusadas), encerrar/suspender contrato (a própria tela
mandava fazer e não oferecia), e a tarifa da distribuidora (o pior modo de falha
dos três: coluna gerada, parcela ausente vale zero, **fatura sai menor sem erro,
sem log e sem recusa**).

E `web/tests/rotas-com-tela.ts`: toda rota de escrita tem tela ou **exceção com
motivo escrito**. `RT-3` recusa motivo curto demais — pegou quatro «mesmo motivo
do de cima» meus na primeira execução.

---

## 2. O retrato da produção, medido pelo próprio código

| O quê | Quanto |
|---|--:|
| Clientes · unidades · contratos ativos | 101 · 51 · 28 |
| Usinas · **donos de usina** | 4 · **0** |
| **Faturas emitidas, desde sempre** | **0** |
| Boletos · pagamentos | 0 · 0 |
| Linhas de auditoria | 21.317 |

**Julho/2026 é a competência mais perto de fechar** — a geração já está lançada, e
falta ler as 29 contas. Feito isso: 28 faturas, 18 com boleto, 10 esperando
endereço.

---

## 3. O que NÃO foi medido

1. **A lista com dados de verdade** — produção tem 0 faturas. A leitura roda e
   devolve vazio, que é a resposta certa e não exercita nenhum dos cinco níveis;
2. **O destrave escrevendo** — exigiria destravar a unidade de produção, e a
   decisão sobre ela é do dono;
3. **As sete telas novas com olho humano** — nada disso subiu ainda;
4. **A faixa vermelha da emissão** — exigiria fatura emitida sem boleto, e não há
   fatura nenhuma.

---

## 4. A lição desta sessão

**Furo de operação não aparece lendo código: aparece cruzando duas listas.** As
124 rotas contra o que a interface chama deram quatro achados em vinte minutos —
incluindo um que deixava dinheiro entrar sem título. Nenhum deles seria pego por
`tsc`, por revisão de PR ou por qualquer suíte existente, porque **cada metade
estava certa sozinha**: a rota funcionava, a tela funcionava, e o que faltava era
a linha entre as duas.

Por isso o cruzamento virou suíte no mesmo dia. Varredura manual acontece uma vez.
