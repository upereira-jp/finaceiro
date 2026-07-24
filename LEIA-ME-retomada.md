# LEIA-ME — pacote de retomada

> Gerado em 23–24/07/2026, ao fim da sessão 2. Para quem for retomar o projeto, seja uma nova sessão de chat ou o Claude Code.

---

## 1. O que veio desta sessão

Sete arquivos. Todos substituem versões anteriores — não conviva com as duas.

| Arquivo | Para que serve | Substitui |
|---|---|---|
| `RESUMO-SESSAO-2.md` | **Comece por aqui.** Documento de passagem: o que mudou, por quê, e o que ficou aberto | sucede o resumo de 23/07 |
| `PRD-v2.2.md` | Fonte de verdade do projeto | `PRD-v2.1` e anteriores |
| `GLOSSARIO.md` (rev. 3) | Vocabulário único de spec, código e conversa | rev. 1 e 2 |
| `ADR-0002-modelo-cliente-e-tenant.md` (r2) | Decisão de tenant e de modelo de cliente | a versão original e o rascunho de r2 |
| `auditoria/P7-TOPOLOGIA-DE-FUNIS.md` | Relatório novo. Corrige P2 e P4 da auditoria | — |
| `VIEWS-PROPOSTAS-r2.sql` | Proposta de DDL para o dev do CRM. **Não executada** | a versão original |
| `QUESTOES-bloco-para-fusao.md` | Bloco pronto para colar no `QUESTOES.md` | — |

---

## 2. O que falta, e só existe do seu lado

Estes quatro nunca chegaram a esta sessão. Sem eles, a próxima repete a arqueologia.

| Arquivo | Por que é necessário | O que trava sem ele |
|---|---|---|
| `_TEMPLATE-SPEC.md` | define a anatomia fixa das specs | **SPEC-001.** Escrever a primeira fora do formato cria precedente que as seis seguintes herdam |
| `QUESTOES.md` | registro original, Q-001 a Q-023 | a fusão com AUD-01…12 e F-01…05. O bloco está pronto, falta o destino |
| `CLAUDE.md` | as dez regras inegociáveis | qualquer geração de código. E a **regra 7 está errada** — segredos por tenant não cabem em variável de ambiente |
| `ADR-0001-multi-tenancy.md` | base que o ADR-0002 revisa | conferir se a r2 do ADR-0002 não contradiz algo que o 0001 fixou |

**Não peça reconstrução de memória.** Do `CLAUDE.md` só existe aqui uma forma condensada; dos outros três, menos que isso. Uma paráfrase viraria o arquivo canônico por acidente.

---

## 3. Ordem de leitura

1. `RESUMO-SESSAO-2.md` inteiro
2. `P7-TOPOLOGIA-DE-FUNIS.md` — é a origem de quase toda mudança recente
3. `PRD-v2.2.md` §7 e §8
4. `ADR-0002` r2, Decisão 2
5. `GLOSSARIO.md`, os quatro verbetes do topo

O resto se consulta sob demanda.

---

## 4. Mensagem de abertura sugerida

Para colar na primeira mensagem da próxima sessão, junto com os anexos:

> Retomando o Financeiro G3. Anexei o pacote da sessão 2 (`RESUMO-SESSAO-2.md`, `PRD-v2.2.md`, `GLOSSARIO.md`, `ADR-0002` r2, `P7`, `VIEWS-PROPOSTAS-r2.sql`, bloco de questões) e os quatro que faltavam: `_TEMPLATE-SPEC.md`, `QUESTOES.md`, `CLAUDE.md`, `ADR-0001`.
>
> Leia o resumo primeiro. Antes de propor qualquer coisa, me diga se o `ADR-0001` contradiz alguma decisão da r2 do `ADR-0002`.
>
> Depois disso, quero [ **escolha um**: fundir o `QUESTOES.md` · escrever a SPEC-001 · preparar o spike Prisma+RLS ].

---

## 5. Antes de escrever a próxima linha de documento

Três coisas valem mais, e nenhuma é minha:

1. **`DROP ROLE auditoria_ro`** — cinco minutos, expira em 23/08, único item com prazo
2. **Conversa única com a operação** — F-01, F-02, F-04, AUD-02, AUD-04, AUD-08, O-01, O-02
3. **Spike Prisma + RLS** — não depende de nenhum bloqueio aberto e trava o schema definitivo

A F-01 é a de maior risco: migrar 36 linhas é trivial, mas se ninguém migrar, o conector nasce lendo vazio e o defeito só aparece no piloto sombra.

---

## 6. Regra que esta sessão confirmou três vezes

Uma consulta ao banco derrubou uma premissa não testada em três ocasiões distintas — a explicação da disjunção, a ausência do dado monetário, e a inexistência do vendedor interno. Todas vinham de relatório de auditoria, não de suposição solta.

**Medir antes de escrever custa minutos e economiza revisões inteiras.**
