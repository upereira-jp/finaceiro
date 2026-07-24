# _TEMPLATE-SPEC — anatomia fixa das specs

> **Reconstrução de 24/07/2026.** O original se perdeu. Este template foi remontado a partir das convenções já fixadas em `PRD-v2.2`, `GLOSSARIO`, `ADR-0001`, `ADR-0002` r2 e das regras inegociáveis do `CLAUDE.md`.
>
> **Adote deliberadamente antes de escrever a SPEC-001.** Toda spec seguinte herda esta anatomia; mudar depois custa reescrita em cascata.

---

## Como usar

Copie este arquivo para `specs/SPEC-XXX-nome-curto.md`. Preencha **todas** as seções. Seção sem conteúdo escreve `Não se aplica` e diz por quê — seção apagada vira lacuna invisível.

Uma spec está pronta quando **um implementador que nunca participou das conversas consegue executá-la sem perguntar nada**. Se ele precisaria perguntar, falta seção 4, 7 ou 8.

---

# SPEC-XXX — [Nome]

| Campo | Valor |
|---|---|
| **Status** | Rascunho · Em revisão · **Aceita** · Superada |
| **Versão** | 1.0 |
| **Data** | DD/MM/AAAA |
| **Autor** | |
| **Fase** | F0 · F1 · … · F7 |
| **Depende de** | specs, ADRs ou questões que precisam estar fechados antes |
| **Bloqueia** | o que não começa sem esta |
| **Documentos-fonte** | seções específicas do PRD, ADRs, verbetes do glossário |
| **Questões abertas** | IDs do `QUESTOES.md` que ainda tocam esta spec |

---

## 1. Objetivo

Um parágrafo. O **que** entrega e **por que** existe, em linguagem de negócio. Sem solução técnica aqui.

## 2. Escopo

### Entra
- Lista fechada.

### Não entra
- Lista igualmente explícita, com destino: *"fica para a SPEC-YYY"* ou *"decidido fora de escopo em ADR-ZZZZ"*.

O "não entra" é a seção que mais evita retrabalho. Escreva-a com o mesmo cuidado do "entra".

## 3. Modelo de dados

Tabelas, colunas, tipos, chaves, índices e constraints.

**Obrigatório em toda tabela:**
- `tenant_id uuid not null` — sem exceção, desde a primeira migration (ADR-0001)
- RLS habilitada **e com policy** — habilitar sem policy é o antipadrão medido no CRM (P8 §2)
- Dinheiro em `Int`, em **centavos**, nome do campo terminando em `_centavos`
- `kWh`, potência e percentual mantêm escala decimal e **não** viram centavos
- Timestamps em `timestamptz`; toda lógica de competência, vencimento e corte em `America/Sao_Paulo`

Marque cada campo com sua origem: **CRM** (espelho, read-only), **financeiro** (system-of-record) ou **derivado** (calculado, nunca persistido sem justificativa).

## 4. Regras de negócio

Numeradas, uma por linha, **testáveis**. Cada regra vira ao menos um teste na seção 9.

> R1. Quando [condição], o sistema [ação], porque [razão de negócio].

Regra que não dá para escrever nesse formato ainda não está entendida — vira questão na seção 10, não vira código.

## 5. Invariantes

As do `CLAUDE.md` que esta spec toca, mais as próprias. Invariante é o que **nunca** pode ser falso, em nenhum caminho de execução.

Herdadas, quando aplicáveis:
- Soma dos `split_item` = valor liquidado, ao centavo
- Nenhum `split_item` referencia beneficiário de outro tenant
- Regra de split nunca sofre `UPDATE` — versiona
- Conta a pagar nascida de split é imutável em valor e beneficiário
- O CRM é read-only absoluto: só views de interface, nunca tabela base, sempre com filtro de tenant

## 6. Interfaces

Contratos de entrada e saída: endpoints, payloads, telas, jobs, webhooks. Para cada um: quem chama, com que frequência, o que acontece em falha, e se é idempotente.

## 7. Casos de borda

Lista explícita. No mínimo, considere:

| Categoria | Pergunta a responder |
|---|---|
| Vazio | Primeira execução, tabela sem linha, tenant novo |
| Duplicidade | Reentrada, reprocessamento, webhook repetido |
| Parcial | Metade dos dados presente — falha ou segue? |
| Fronteira | Virada de competência, fuso, arredondamento do centavo |
| Concorrência | Duas execuções simultâneas |
| Origem ausente | Tenant sem conector CRM |

## 8. Critérios de aceitação

Verificáveis por quem não escreveu a spec. Formato de checklist, cada item derivado de uma regra da seção 4.

- [ ] `migrate reset` roda limpo em banco vazio
- [ ] Tenant A não lê linha do tenant B, nem forçando a query
- [ ] …

## 9. Testes obrigatórios

Nomeie os testes que provam as regras e os invariantes. Todo invariante da seção 5 tem teste automatizado — invariante sem teste é comentário.

## 10. Questões abertas

| ID | Pergunta | Bloqueia o quê | Quem responde |
|---|---|---|---|

**Regra 10 do `CLAUDE.md`:** contradição ou lacuna vira entrada aqui e em `QUESTOES.md`. Não vira improviso do implementador, e não vira decisão do Claude Code.

## 11. Fora de escopo / evolução futura

O que foi considerado e deliberadamente adiado, com o motivo. Evita que a mesma discussão volte daqui a três meses sem memória.

---

## Rodapé de revisão

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | | Original |
