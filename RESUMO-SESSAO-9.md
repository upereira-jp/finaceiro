# RESUMO-SESSAO-9 — 28/07/2026

| Campo | Valor |
|---|---|
| **Foco** | Terminar o que a sessão 8 deixou meio-feito no disco: o **sinal da `Q-UC-DISTRIB-01`** |
| **Método** | Nada afirmado sem medição; teste novo verificado **nos dois sentidos** por plantio; o que faltava vira registro, não improviso |
| **Resultado** | `SPEC-002` **R21-b** e **invariante 13**. Quatro testes novos, um deles nascido de um buraco que só apareceu ao escrevê-lo |
| **Testes** | **318 verificações em 18 suítes**, `EXIT=0`. Os 8 invariantes de catálogo passam **também contra produção** |

> # ESTADO ATUAL — 28/07/2026
>
> | | |
> |---|---|
> | **F1** | **sem bloqueio vermelho.** Nada mudou de fase nesta sessão, e nada precisava |
> | **Conector** | as 4 entidades da `SPEC-002` §2 espelhadas, rodando contra o CRM real |
> | **Espelho em produção** | 76 clientes · 3 usinas · 35 UCs · 8 competências de geração |
> | **Idempotência** | ensaio de 28/07: `lidos 95, criados 0, atualizados 0`, 1 recusa (`UC-DUP-01`) |
> | **Divergências de distribuidora** | **0 nas 35 UCs** — ou seja, ninguém editou o campo. **Não** é evidência de que a herança está certa (§2) |
> | **Testes** | **318 verificações em 18 suítes**, `EXIT=0` · catálogo 8/8 contra produção |
>
> **O que falta continua não sendo código:**
>
> | Item | Quem |
> |---|---|
> | Reunião com o contador — **`PAUTA-contador.md`**, 10 perguntas fechadas | Vinicius + contador |
> | `RATEIO-USO-01` 🔴 — a usina tem duas medidas, o sistema controla uma | Vinicius + contador |
> | `Q-UC-DISTRIB-01` — a **pergunta normativa** segue aberta, e o sinal é cego para ela (§2). O que fechou hoje foi o risco vizinho: edição humana do campo local | Vinicius |
> | `UC-DUP-01` — conferir `000041446801282` contra o rateio oficial | operação |
>
> **Não executado, de propósito:** `npm run ciclo --valendo`. O ensaio mostrou
> `criados 0, atualizados 0` e zero divergências — um `valendo` gravaria só mais uma
> linha de `conector_execucao` em produção, sem nada a provar. É decisão do dono.

---

## 1. O que estava no disco quando a sessão abriu

Três arquivos modificados e não commitados, e dentro deles **um plantio ativo**:

```
scripts/ciclo-crm.ts     |  6 ++
src/crm/sincronizacao.ts | 54 ++++++--
tests/conector.ts        | 49 +++++++
```

O plantio estava marcado e era deliberado — `// PLANTIO` numa linha que
**sobrescrevia** a `distribuidora` da UC, dentro de um bloco cujo próprio
comentário dizia *"Nada foi sobrescrito: distribuidora é campo local"*. Código e
comentário se contradizendo é a assinatura de uma verificação de teste
interrompida no meio: falta rodar o sentido "acusa" e remover.

Foi o primeiro passo, e ele mediu o que precisava medir.

## 2. `Q-UC-DISTRIB-01` — a suposição parou de esperar resposta

A questão em si **continua aberta e continua sendo do Vinicius.** A `R21` deriva a
distribuidora da UC da usina vinculada, supondo que a compensação de crédito
acontece dentro da mesma área de concessão — e essa suposição **não foi verificada
contra a norma**. É o motivo da questão, e nada nesta sessão a responde.

O que mudou é outra coisa, e ela **independe da norma**:

> A herança da `R21` acontece só no `INSERT`. No `UPDATE`, `distribuidora` fica de
> fora porque é **campo local** e a `R5` diz que o usuário vence. Então alguém pode
> editar a UC amanhã, pôr outra concessionária, e **nada notaria** — o silêncio
> duraria até um relatório vir errado.

A suposição virou **sinal** em vez de ficar esperando confirmação. Divergiu, aparece
em `conector_execucao.detalhe` e na saída do `npm run ciclo`.

### Divergência não é recusa, e a distinção não é vocabulário

| | `Recusa` | `Divergencia` |
|---|---|---|
| Significa | **nada foi gravado** | **foi gravado, e alguém precisa olhar** |
| Muda o `status` do ciclo | sim, vira `parcial` | **não** |
| É contada pela invariante 8 | **sim** | não |

Misturar as duas faria a contagem de recusas — que é a invariante 8 — medir duas
coisas diferentes. O precedente já existia no projeto: `garantia_de_tenant_degradada`
vai para o `detalhe` e para a saída do script **sem** mexer no `status`.

E o sinal **não sobrescreve**, que seria a `R5` ao contrário: a linha é válida e o
campo é do usuário.

### O que o sinal NÃO cobre — e por isso a questão não some

A conferência roda só no `UPDATE`. Uma UC que **nasce** pela `R21` herda o valor da
usina por construção e **não pode divergir de si mesma**:

| Caso | O sinal pega? |
|---|---|
| Humano edita a UC e põe outra concessionária | ✅ sim — é o risco que esta sessão fechou |
| A `R21` está **errada de origem** | ❌ **não.** Nasce coerente e fica silenciosa para sempre |

O segundo caso é a `Q-UC-DISTRIB-01`, e ele **não é conferível internamente**: o CRM
não expõe distribuidora em `rateio_clientes`, então não há segunda fonte contra a
qual comparar. Comparar o valor derivado com ele mesmo não prova nada. Só a norma
responde.

**Corolário, e ele muda a leitura da §5:** as zero divergências medidas em produção
dizem que ninguém editou o campo — **não** que a herança está certa. Seriam zero do
mesmo jeito se as 35 UCs estivessem todas erradas.

Se a resposta normativa for *"pode haver UC de outra concessionária"*, a UC passa a
exigir cadastro local como a usina, e este sinal acusa cada caso **à medida que a
operação digitar o valor real** — ele não acha as erradas sozinho.

Virou `SPEC-002` **R21-b** e **invariante 13**, com linha nova na §7 e teste
obrigatório na §9. A spec foi para a **v1.4**.

## 3. Os dois sentidos, medidos

| Sentido | Como | Resultado |
|---|---|---|
| **Acusa** | plantio da sessão 8 no lugar: o conector **sobrescreve** a `distribuidora` | `FALHA N53` — *"R5 o sinal NAO sobrescreve o campo local (`"Equatorial GO"`)"*. N51 e N52 verdes |
| **Passa** | plantio removido | `N51`–`N53` verdes, `TODAS PASSARAM` |

O `N51` existe para que o `N52` signifique alguma coisa: ele fixa o **caminho
limpo** — UC e usina na mesma distribuidora, **zero** sinais. Sem ele, o `N52`
poderia estar acusando qualquer coisa em vez da divergência.

## 4. O `N54`, e o buraco que só apareceu porque tentei testá-lo

Escrevendo o teste do caminho de erro, a leitura do código mostrou o seguinte:
`divergencias` só chega ao `detalhe` pelo `fechar()` — e o `fechar()` do caminho de
**exceção** é outro trecho de código. Ele levava `recusas`, `fila_de_revisao` e
`garantia_de_tenant_degradada`. **Não levava `divergencias`.**

Não é hipótese: o lote da UC já está **commitado** quando a interrupção chega (é a
`R13`), então a divergência é fato gravado no banco. Perdê-la ali apagaria o sinal
**justamente no ciclo que deu errado** — onde alguém de fato vai olhar o `detalhe`.

Corrigido, e verificado nos dois sentidos como todo o resto:

| Sentido | Resultado |
|---|---|
| Com `divergencias` no `fechar()` do erro | `ok N54 … (status=erro)` |
| Sem — a correção removida de volta | `FALHA N54` |

O `N54` interrompe o ciclo por `leadMerges()`, que a §4.3 lê **depois** do espelho de
UC, e confere que o `detalhe` gravado tem as três coisas ao mesmo tempo: o erro
original, a chave `divergencias` e o número da UC.

*Este é o segundo achado desta natureza em duas sessões — a §5 do `RESUMO-SESSAO-8`
registrou o `test_vitima_de_merge_funde_espelho`, que não existia para código que
existia. O padrão é o mesmo: o caminho feliz é testado, o caminho de exceção carrega
menos informação, e ninguém percebe porque nada quebra.*

## 5. Contra produção, em ensaio

```
lidos 95   criados 0   atualizados 0   desativados 0   recusados 1
garantia de tenant degradada: false
lotes: 8 transacoes, maior lote 41 de 50
divergencias: nenhuma
```

A única recusa continua sendo a `UC-DUP-01` (`000041446801282` em dois contratos), e
ela segue sendo **o único ruído em 95 linhas lidas**.

**Zero divergências nas 35 UCs** é o resultado esperado, e é preciso ler o que ele
diz: as três usinas são `Equatorial` e as 35 UCs herdaram dela no `INSERT`, então o
zero significa **ninguém editou o campo**. Ele **não** é evidência de que a herança
da `R21` está certa — ver a §2. Vale como linha de base: se um dia acender, é porque
alguém mexeu, que é exatamente o caso que o sinal existe para não deixar passar.

Os 8 invariantes de catálogo foram rodados contra produção depois: `8 invariantes,
nenhuma falha`. Nenhuma migration nova nesta sessão — a rodada é conferência, não
verificação de mudança.

## 6. Testes

| | |
|---|--:|
| Verificações antes (medido no `HEAD`, não estimado) | **314** |
| Verificações depois | **318** |
| Novas | `N51`, `N52`, `N53`, `N54` |
| Suítes | 18 · `EXIT=0` |
| Catálogo contra produção | 8/8 |

**Nota de contagem:** o `RESUMO-SESSAO-8` fecha dizendo **313**. Rodando o `npm test`
no `HEAD` e contando as linhas `^ok` do log inteiro dá **314**. A diferença é de
contagem, não de suíte — nenhum teste foi perdido nem ganho entre uma coisa e outra.
Fica registrada aqui em vez de o número ser reafirmado sem conferência; o critério
reproduzível é `npm test 2>&1 | grep -cE '^ok'`.

## 7. A fila, e ela não encolheu por código

Nada nesta sessão mexeu na fase. O que a `Q-UC-DISTRIB-01` deixou de ser é
**bloqueio silencioso**; ela continua na lista como pergunta normativa em aberto.

| Item | Nível | Quem |
|---|:--:|---|
| Reunião com o contador — `PAUTA-contador.md`, 10 perguntas fechadas | — | Vinicius + contador |
| `RATEIO-USO-01` — quanto **será** usada vs. quanto **já foi** usada | 🔴 | Vinicius + contador |
| `Q-UC-DISTRIB-01` — a UC pode ser de outra concessionária? | 🟡 | Vinicius |
| `UC-DUP-01` — conferir a UC repetida contra o rateio oficial | 🟡 | operação |
| `Q-CICLO-ORFAO-01` — ciclo morto por `kill` trava o `EXCLUDE` | 🟡 | Vinicius |

**A F2 não começa sem o contador.** As quatro questões fiscais voltam a ser bloqueio
no dia em que ela abrir, e o schema que elas definem (`fatura`, `split_item`) ainda
não existe — que é o que torna a reunião barata agora e cara depois.

## 8. Nota de método

Duas coisas desta sessão são a mesma coisa vista de dois ângulos.

O plantio deixado no disco pela sessão 8 **funcionou**: a marca `// PLANTIO` e a
contradição entre código e comentário tornaram impossível confundir aquilo com
código pronto. Uma verificação interrompida no meio se retomou sem que ninguém
precisasse lembrar de nada.

E o buraco do `fechar()` de erro só apareceu porque a regra do projeto é *invariante
sem teste é comentário* (regra 8). O sinal funcionava no caminho feliz, o teste do
caminho feliz passava, e o `detalhe` do ciclo interrompido teria ficado
silenciosamente mais pobre — **do jeito que o próprio sinal existe para impedir.**
