# RETOMADA — Financeiro G3, 10/09/2026 (noite)

| Campo | Valor |
|---|---|
| **Para quem** | Quem abrir a próxima sessão. **Dois minutos** |
| **Substitui** | `RETOMADA-2026-09-10.md` no §0 e no §5.1. O corpo dela continua correto e vale como registro: o que venceu é **a pendência de código**, que fechou |
| **O que esta sessão fez** | Fechou o **§5.1** — a única coisa de código que a retomada da manhã deixou aberta: *"ninguém vê se a automação parou de rodar"*. E achou, fechando, **um buraco no filtro do CI** que deixava dois diretórios sem rede |
| **Suíte** | sem banco: `EXIT=0`, **2.792** verificações (eram 2.746) |
| **Migrations** | **39**, nenhuma nova — a mudança inteira é de leitura |
| **CI** | ✅ verde · ⚠️ **vermelho na primeira passada, e a culpa era do teste** (§3) |
| **Repositório** | último commit de **código**: **`3672cde`** (o que veio depois é documentação). `origin/main` junto, árvore limpa, zero arquivos `root:root` |
| **Produção** | ✅ **no ar** — funcionalidade às 02:43:29 UTC (`34430521100`), o conserto do desenho às 03:01:43 (bundle `prontidao-BUoQIaIs.js`) |

> ## A frase de uma linha
>
> **A tabela que guardava "a agenda rodou" era escrita a cada rodada e nunca
> lida por ninguém; agora a primeira tela AFIRMA que o sistema está
> trabalhando — e afirma mesmo quando está tudo bem, porque aqui o silêncio
> é o defeito, e não a boa notícia.**

---

## 0. O primeiro movimento da próxima sessão

### 0.1 ✅ Já está no ar — e o que falta é UM olhar humano na tela

O dono rodou o `chown` (57 arquivos `root:root`, a armadilha de 01/09) e o
`deploy-financeiro` subiu na sequência. Medido, e não deduzido:

| O quê | Como se sabe |
|---|---|
| O deploy passou | run `34430521100`, os quatro passos `success` — conferidos por **step**, não pelo tique |
| O processo é o novo | journal 02:43:29 → *"client gerado cobre as 39 tabelas"*, *"ouvindo em 127.0.0.1:3000"* |
| A rota EXISTE | `GET /api/automacoes` → **401** (*"sem header Authorization"* no journal), igual à vizinha `/conector-execucao`. Código velho daria 404 |
| O bundle é o novo | «O que o sistema fez sozinho» está em `web/dist/assets/prontidao-XOivZWeU.js` |

### ✅ O olho humano conferiu — e achou o que nenhuma suíte acharia

O dono abriu a tela e trouxe a frase que fecha e abre ao mesmo tempo:

> *"tela está apenas com o texto solto embaixo das pendências, **mas existe**"*

**As duas metades importam.** «Existe» é o caminho inteiro provado por fora — a
rota autenticada responde, a leitura volta, o componente monta e o texto chega.
Nada disso era mensurável daqui: cunhar JWT local não funciona nesta VPS
(`SUPABASE_JWT_SECRET` não está na env, §4.3 da retomada da manhã).

«Texto solto» é um **defeito de desenho, e ele era meu**: nesta tela **dado mora
sobre superfície** — os cartões do topo, a tabela das camadas e a do conector têm
borda, fundo e sombra. O único texto solto legítimo é o «Como ler esta tela», que
é prosa e se comporta como prosa. Uma lista de **estado** desenhada como parágrafo
lê como legenda de rodapé, e o painel que existe para ser conferido todo dia vira
nota de rodapé.

**Consertado no mesmo dia, e já no ar:** o painel passou a desenhar sobre
`.cartao secao` — a superfície que oito telas já usam —, com régua fina entre as
três linhas e o ritmo saindo do token em vez de um `marginBottom` escrito à mão.
Deploy às **03:01:43 UTC**, bundle `prontidao-BUoQIaIs.js`, os quatro passos
`success` conferidos por step e o restart no journal.

⚠️ **E ficou prendido em `R13k`**, porque nenhuma outra verificação pegaria isso:
`AU-*` mede as frases, `R13a` mede que o texto chega ao HTML, e **as duas passam
verdes sobre um painel que ninguém enxerga como painel**. A lição é a mesma da
sessão inteira, um degrau adiante: *funcionar* e *ser visto* são coisas
diferentes, e só a segunda vale para quem opera.

### 0.2 O que continua aberto, e nada disto é código novo obrigatório

| # | O quê | De quem |
|:--:|---|---|
| **1** | ⚠️ **A conta lida da competência + a geração** — é isto que trava a primeira fatura | dono |
| **2** | **`dono_usina`** — tabela vazia; 70% do dinheiro com percentual e nenhum destinatário | dono |
| **3** | Os **10 endereços** e o **tipo do originador do Rhenan** | dono |
| **4** | As **quatro vermelhas do contador** | contador |
| **5** | **`Q-ALERTA-EMAIL-01`** — os três canais são de *puxar*; o que empurra é e‑mail, e é contratar terceiro | dono |
| **6** | **`Q-VENC3-01` (b)** — a borda do vencimento | dono |
| **7** | 🟡 **`Q-RODADA-01`** — a folga de **30 h** antes de acusar a diária. Só volta se ele quiser apertar, e o preço de apertar é falso positivo em dia de reinício | dono |
| **8** | 🟡 **§5.2 e §5.3 da retomada da manhã** — não há lista de boletos travados, e `destravar-uc` continua sem tela | implementador |

### 0.3 As regras que continuam valendo depois de todo push

```
gh run list --workflow=isolamento --limit 2

# um run VERDE do migrate-financeiro NAO quer dizer "aplicada": confira os STEPS
gh run view <id> --json jobs -q '.jobs[].steps[]|"\(.conclusion) \(.name)"'
```

⚠️ **E uma que esta sessão pagou:** `git checkout <arquivo>` para desfazer uma
mutação de teste **apaga também o que ainda não foi commitado naquele arquivo**.
Aconteceu com `src/dominio/agenda.ts` e `prontidao.tsx` no meio da conferência
por mutação, e as duas tiveram de ser reescritas. Desfazer mutação é
`replace` inverso, ou commit antes.

---

## 1. O que entrou, e por que a regra de exibição é INVERTIDA

### 1.1 O defeito era de ausência, e ele não deixava rastro

Três rodadas acontecem sem ninguém pedir: a **consulta ativa** (diária), a
**fila de emissão** (5 em 5 min) e o **ciclo do CRM** (15 em 15). As três gravam
o que fizeram. `agenda_execucao` existe desde **30/07/2026** — e a varredura de
hoje achou **zero leituras** dela em `src/repos/`, em `rotas.ts` e em `web/`.

O próprio `scripts/agenda.ts` tinha escrito por que a tabela existia: *"sem esse
registro, «a agenda não roda desde o dia 3» volta a ser impossível de
perguntar"*. **Escrevia-se a resposta e nunca se perguntava.**

⚠️ E a consulta ativa é a **única porta automática de baixa** enquanto o
`ADR-0006` não existir. Parada, boleto pago não vira baixa e a cobrança segue
acusando quem já pagou — **sem erro, sem log e sem linha**, porque ausência de
execução não produz nenhuma das três coisas.

### 1.2 A inversão, que é o coração da leva

A faixa do caminho do dinheiro **cala** quando está tudo bem (`SD-1`): lá o
silêncio é a resposta boa, e a tela não ganha um verde a mais para conferir todo
dia.

**Aqui o silêncio é o defeito.** "Nenhum alerta" é, letra por letra, a mesma cara
de "o alarme também parou". Por isso o rodapé de Pendências **afirma mesmo em
dia**:

> **A conferência de pagamentos no banco** rodou há 4 minutos — *12 em aberto
> conferidos, 3 com pagamento encontrado*

É a mesma escolha da unidade `financeiro-saude-cobranca`, e pelo mesmo motivo
que está escrito lá: quando o trabalho de uma coisa **é** a afirmação, ela pode
ficar vermelha sem mentir.

### 1.3 O que cada peça faz

| Camada | O quê |
|---|---|
| `src/dominio/agenda.ts` | `nivelDaRodada` (6 níveis), `atrasoAceitoSegundos`, `CADENCIA`, `pedeGente` |
| `src/repos/automacoes.ts` | **só lê** — as três automações num lugar só, com os contadores traduzidos |
| `GET /automacoes` | caminho de relatório. **Sem histórico**: a pergunta é "está vivo?", e uma lista de rodadas antigas seria auditoria |
| `web/src/automacoes.ts` | as frases, puras, com suíte própria |
| `web/src/automacoes-corpo.tsx` | **duas** metades: `FaixasDasAutomacoes` (alarme, no alto) e `PainelDasAutomacoes` (afirmação, no rodapé) |
| `financeiro-saude-cobranca` | as **duas rodadas de dinheiro** entram no código de saída 4 |

**`travada` é nível próprio e vem ANTES de `atrasada`.** Uma linha
`em_andamento` órfã trava o EXCLUDE `agenda_uma_execucao_por_tarefa` e recusa
**toda** rodada nova — dizer só "atrasada" mandaria procurar o timer quando o
conserto é encerrar a rodada parada. A migration 21 previu o caso por escrito e
**nenhum código olhava para ele**.

**O ciclo do CRM aparece na tela e NÃO entra no código de saída.** Ele atrasa
cadastro, não dinheiro; por ele, o vermelho de uma unidade chamada "saúde do
caminho do dinheiro" passaria a querer dizer duas coisas.

---

## 2. ⚠️ O achado do caminho: dois diretórios sem rede no CI

`AG11k` confere que os três números de `CADENCIA` batem com o `OnCalendar` dos
três timers, **lidos do arquivo** — sem isso, mudar o timer da fila de 5 para 30
minutos deixaria o alarme calado por meia hora achando que está tudo em dia.

Só que `deploy/**` e `scripts/**` **não estavam no filtro de `push`** do
`isolamento`. Ou seja: o único commit em que aquela verificação importa — o que
muda um timer — **não dispararia CI nenhum**.

É a **terceira** falta do mesmo filtro em dois dias (`.github/**` e `web/**`
foram 09/09). Por isso a correção não foi acrescentar duas linhas e seguir:
**`CI-9` deriva a lista.** Ela varre as suítes procurando `new URL('../<pasta>/`
e exige que toda pasta lida como fonte esteja no filtro — a pasta que uma suíte
passar a ler amanhã já nasce coberta. Ela **acusou as duas na primeira
execução**.

---

## 3. O que foi medido, e o que NÃO foi

| Afirmação | Como se sabe |
|---|---|
| As regras da tela | `AU-1..AU-17`, com os 18 pares (3 automações × 6 níveis) por exaustão |
| A tela **mostra** | `R13a..R13j` montam os dois componentes com `renderToStaticMarkup`; `AU-16`/`AU-17` leem a fonte da tela, **com o comentário removido antes** (a armadilha do `SD-12`) |
| O domínio | `AG11a..AG11n` — **propriedades** da fronteira (nunca antes da hora, sempre depois, monotonia, precedência), não uma tabela copiada da minha própria saída |
| As verificações **falham quando devem** | Por mutação: comentar `<PainelDasAutomacoes />` derruba `AU-16/17`; `nivelDaRodada` que nunca acusa atraso derruba `AG11c`; painel devolvendo vazio derruba `AU-1`, `R13a` e `R13c` |
| A leitura pela role **sem `BYPASSRLS`** | `N16a..N16f` — e elas **só rodam no Actions** |
| A tela **desenha como painel**, e não como prosa | `R13k` — a superfície `cartao secao` no HTML. Nasceu do que o dono viu, não de auditoria |

⚠️ **O que NÃO foi medido:**

1. **A faixa vermelha contra produção** — exigiria uma automação realmente
   parada. O que rodou foi o caminho contrário: as três em dia produzindo a
   afirmação;
2. **O código de saída 4 por rodada parada, na máquina** — provado na suíte
   (`AG11l`), não no `systemctl`;
3. **O painel novo com olho humano** — o de antes foi conferido pelo dono e
   rendeu o `R13k`; o desenho corrigido subiu depois disso e **ninguém abriu a
   tela desde então**. O HTML tem a superfície (provado em suíte) e o bundle no
   ar a carrega (provado por `grep`), mas *parecer certo* é a metade que só um
   olho fecha — foi essa a lição do dia.

### A lição desta sessão, e ela é do teste e não do código

**`N16d` media um estado que o banco não consegue produzir.** Ela inseria a linha
órfã com data de dois dias atrás e deixava as rodadas dos testes anteriores com a
hora de agora — a leitura pega a **mais recente**, que era uma fechada, e o nível
saía `em_dia`. O CI ficou vermelho na primeira passada.

O código estava certo: com o EXCLUDE, uma linha `em_andamento` **impede** que
qualquer rodada nova daquela tarefa comece, então **na produção a órfã é sempre a
mais nova**. Um estado que o banco recusa produzir não é cenário — é uma
verificação medindo coisa que não existe.

É a terceira vez em dois dias que a mesma família de erro aparece: **verificação
que passa (ou falha) sobre um mundo que não é o real.** As outras duas foram
comentário não removido antes da busca e conferência de estrutura no lugar de
comportamento.
