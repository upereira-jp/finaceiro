# ADR-0008 — O CRM avisa, e o ciclo roda em tempo real

| Campo | Valor |
|---|---|
| **Status** | ✅ **ACEITA em 22/09/2026** por Vinicius Leal — *"quero que elas ocorram sempre em tempo real"* |
| **Data** | 22/09/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | `AUD-11` da `SPEC-002` (*"Sync de 30 min é requisito ou pode relaxar?"*) |
| **Base factual** | teste de `LISTEN`/`NOTIFY` pela `financeiro_ro` no pooler de sessão do CRM em 22/09/2026 17:25 UTC: aviso recebido em **21 ms** · ciclo medido em ~8 s · `conector_execucao` de 01/09 a 22/09 |
| **Afeta** | CRM: migration `backend/migrations/2026_09_22_financeiro_aviso_tempo_real.sql` (gatilhos + `ALTER ROLE financeiro_ro`) · aqui: `scripts/escuta-crm.ts`, `deploy/financeiro-escuta-crm.service`, `scripts/ciclo-crm.ts` (saída 75), `deploy/financeiro-ciclo.service` (`SuccessExitStatus=75`) |
| **Não afeta** | o motor do ciclo (`src/crm/sincronizacao.ts`), as views `financeiro.*`, nenhuma tabela deste banco. A regra 4 continua inteira |

---

## 1. O problema

Até 22/09 o espelho do CRM era atualizado por um timer de 15 minutos. O dado
digitado no CRM levava **até 15 minutos** para chegar aqui — e a Central de Ajuda,
que lê a prontidão ao vivo, respondia com confiança sobre um espelho que podia
estar um quarto de hora atrás.

## 2. A decisão — o CRM avisa, o financeiro ouve, e o ciclo é o mesmo

```
CRM: gatilho AFTER nas 14 tabelas-base das views ─ pg_notify('financeiro_crm', tabela) ─┐
                                                                                         │ ~20 ms
financeiro: financeiro-escuta-crm (LISTEN permanente) ◄───────────────────────────────────┘
            └─ junta a rajada (2 s) ─► scripts/ciclo-crm.ts --valendo  (o MESMO do timer)
financeiro: financeiro-ciclo.timer, a cada 15 min ─► o mesmo script  (rede de segurança)
```

**Por que `NOTIFY` e não webhook do backend do CRM.** O gatilho vê **todo**
escritor: backend, workers, Edge Functions, a tela via Supabase JS e SQL manual.
Um webhook na aplicação perderia metade deles, e em silêncio.

**Por que o ciclo não muda.** Ele já é idempotente (R3) e reconcilia pelo conjunto
inteiro (§4.3). Um aviso diz só *"a tabela X mudou"* — o ciclo relê tudo. Ciclo
incremental seria troca de desenho, e a `SPEC-002` §11 já registrou por quê.

**Por que a regra 4 continua inteira.** Ouvir é leitura. A credencial é a mesma
`financeiro_ro`, conferida por `conferirRoleDeLeitura` antes do `LISTEN`. Nada
neste desenho escreve no CRM: quem criou os gatilhos foi o dev do CRM, lá.

## 3. O que o desenho garante, e o que não garante

| Situação | O que acontece |
|---|---|
| Card salvo no CRM | aviso em ~20 ms, ciclo 2 s depois, espelho em ~10 s |
| Rajada (card com 20 campos, ou importação) | avisos iguais numa transação chegam **uma vez**; avisos durante o ciclo produzem **um** ciclo a mais, não um por aviso |
| Timer e ouvinte ao mesmo tempo | o `EXCLUDE` recusa o segundo, que sai com **75**; o ouvinte tenta de novo em 15 s; o timer trata 75 como sucesso |
| Ciclo falhando por dado (como a R11 de 16/09) | o ouvinte espera 1 min, dobra até 15 min, zera no primeiro sucesso — não vira laço |
| Ouvinte fora do ar | avisos daquele intervalo **se perdem** (NOTIFY não tem fila). O ouvinte roda um ciclo ao reconectar, e o timer cobre o resto: **pior caso, 15 minutos** — o de antes |
| Conexão morta sem aviso | pulso `SELECT 1` a cada 60 s derruba e reconecta |
| `systemctl stop/restart` | `KillMode=mixed`: o ciclo em andamento termina antes de o processo sair. Sem isso a linha ficaria `em_andamento` e o conector travaria (`Q-CICLO-ORFAO-01`) |

## 4. Achado no caminho — a segunda tranca da regra 4 não existia em produção

`criarPoolCrm` abre a sessão com `options: -c default_transaction_read_only=on`.
**Pelo pooler de sessão do Supabase esse parâmetro é descartado**: medido em
22/09, a sessão da `financeiro_ro` abria com `off`. Contra Postgres direto — a
suíte — ele vale, e por isso o `N25` sempre passou. A primeira tranca (a role
sem privilégio de escrita, conferida no arranque) nunca dependeu dela.

A correção foi no CRM, na role: `ALTER ROLE financeiro_ro SET
default_transaction_read_only = on` — o mesmo padrão da `reporting_ai`. Vale em
qualquer caminho de conexão, e `LISTEN` continua permitido em sessão read-only.
O `options` do pool fica: não custa nada e vale fora do pooler.

## 5. Como desfazer

Parar e desabilitar `financeiro-escuta-crm`; o timer segue sozinho, como antes.
Do lado do CRM, o rollback está no cabeçalho da migration e não tem efeito
colateral: sem ouvinte, o aviso some.
