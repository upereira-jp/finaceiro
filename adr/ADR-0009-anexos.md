# ADR-0009 — O comprovante mora no próprio Postgres

| Campo | Valor |
|---|---|
| **Status** | ✅ **ACEITA em 06/10/2026** pelo implementador (decisão técnica delegada — memória «autonomia técnica», 08/09/2026) |
| **Data** | 06/10/2026 |
| **Decisor** | o implementador, dentro do plano aprovado pelo dono em 06/10/2026 (`PLANO-empresa-controle-total-2026-10-06.md`) |
| **Resolve** | `Q-ANEXO-01` (*«comprovantes em Supabase Storage e não em `bytea` — decisão do implementador, vira ADR na onda 2»*) — e resolve no sentido CONTRÁRIO ao que a questão anunciava, pelos motivos da §2 |
| **Afeta** | migration 44 (`anexo`, `anexo_conteudo`, `app.carimbar_anexo_conteudo`, `app.auditar_sem_conteudo`) · `src/repos/anexo.ts` · `POST /contas-a-pagar/:id/anexos`, `GET /anexos/:id`, `POST /anexos/:id/desvincular` · `web/src/anexo-arquivo.ts` · `tests/auditoria.sql` (17-b e inv.19) |
| **Não afeta** | `conta_pagar.comprovante_url` (o link da planilha continua aceito ao lado) · a logo do documento (`logo_de_cobranca`, `bytea` desde a migration 19) |

---

## 1. O problema

A planilha `G3Solar_Financeiro.xlsx` tinha «COMPROVANTE (link)», e o sistema copiou o link em 02/10. Link quebra:
a pasta muda de dono, o arquivo é apagado, e o comprovante some sem ninguém saber. O controle pedido pelo dono em
06/10 precisa do arquivo — e as etapas 2 (cartão: a nota de cada compra) e 3 (reembolso de funcionário: o recibo)
tornam o comprovante obrigatório em escala.

## 2. A decisão — `bytea` em tabela própria, e não o Storage

**O arquivo fica no banco, em duas tabelas:**

- `anexo_conteudo` — os bytes, **um por sha256 no tenant** (o mesmo PDF anexado a duas despesas é guardado uma
  vez). O sha256, o tamanho e o **tipo pelos primeiros bytes** são carimbados por gatilho
  (`app.carimbar_anexo_conteudo`), como a logo desde a migration 19 — a aplicação não tem como mentir o tipo.
  Teto de **8 MB** por CHECK (o mesmo `TETO_DO_ARQUIVO` da leitura de fatura). **Append-only por privilégio:**
  `app_financeiro` só tem `SELECT` e `INSERT`.
- `anexo` — o vínculo: a qual conta, com que nome, quem mandou e quando. **Nunca se apaga:** desvincular marca
  `desvinculado_em`/`desvinculado_por`, e o `GRANT UPDATE` é só dessas duas colunas.

**Por que não o Supabase Storage, como a `Q-ANEXO-01` previa:**

1. **A chave não está no ambiente.** Subir pelo servidor exige a `SUPABASE_SERVICE_ROLE_KEY`, que em 30/09 ainda
   não estava em `/etc/financeiro.env` (memória «Administração da plataforma»). Subir pelo navegador exigiria
   policies de Storage por tenant — um segundo sistema de isolamento ao lado da RLS, com o mesmo modo de falha
   silencioso que a regra 3 descreve.
2. **O banco dá de graça o que o Storage obrigaria a reconstruir:** a RLS por tenant, a FK composta para a
   conta (regra 2), a trilha (regra 9) e a TRANSAÇÃO — o anexo e a despesa nascem ou falham juntos.
3. **O volume cabe.** A G3 lança dezenas de despesas por mês; a foto do celular é reduzida no navegador a 2.000 px
   em JPEG (centenas de KB). Mil comprovantes de 300 KB são 300 MB — dentro do plano do projeto por anos.

**A trilha não leva os bytes.** `to_jsonb` de `bytea` ocupa o dobro (medido na logo, 30/07): um PDF de 2 MB poria
4 MB na `auditoria` a cada anexo. `anexo_conteudo` é auditada por `app.auditar_sem_conteudo()`, cópia de
`app.auditar()` menos a coluna `conteudo` — o sha256, o tipo e o tamanho ficam na trilha. É a segunda entrada
nomeada das listas do 17-b e do inv.19 (`tests/auditoria.sql`), e o D16e de `tests/despesas.sql` prova o que chega lá.

## 3. Quando mudar para o Storage

A troca é por medida, não por gosto. Revisar esta decisão quando **qualquer** destas acontecer:

- o `pg_total_relation_size('anexo_conteudo')` passar de **2 GB**;
- o plano do banco do Financeiro ficar com **menos de 30%** de espaço livre;
- um tipo de anexo precisar de mais de 8 MB (vídeo, planta de usina).

A migração seria: `anexo_conteudo` ganha `storage_ref` (nulo para os que ficam), um script copia os bytes por lote e
anula `conteudo`, e `baixar()` passa a resolver pela referência. O vínculo (`anexo`) não muda — por isso as duas
tabelas existem separadas desde o primeiro dia.

## 4. Consequências

- O backup do banco passa a carregar os comprovantes (bom: um backup só; custo: o backup cresce com eles).
- `GET /anexos/:id` serve os bytes com o sha256 como ETag — nunca muda, então o navegador revalida com 304.
- Os tipos aceitos são PDF, PNG, JPEG e WEBP. GIF e HEIC ficam de fora (HEIC é o padrão do iPhone: o seletor
  de arquivo do iOS converte para JPEG ao anexar em formulário web, então o caso real chega como JPEG).
