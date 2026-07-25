# RESUMO-SESSAO-3 — 24/07/2026

> **Nota de correção — 25/07/2026.** Este documento nasceu como texto de passagem de sessão, não como arquivo do repositório: por isso a abertura fala de si mesmo como "arquivo definitivo além deste". Ele foi commitado em 25/07/2026, e o **corpo abaixo fica intacto** como registro do que foi apurado em 24/07. Três coisas mudaram desde então e estão registradas nos documentos próprios, não aqui:
>
> 1. O `ADR-0003` foi **aceito** (decisão B1) e revisado para **r2** em 25/07/2026. A lacuna do `$transaction` da §9.3 foi **fechada** — 12 testes, Prisma 7.9.0 sobre `@prisma/adapter-pg`. A hipótese do `$extends` registrada em 24/07 foi **refutada na forma descrita**. Ver `ADR-0003` r2.
> 2. As decisões da §2 deste resumo foram **promovidas** para documento normativo. Decisão que só vive num resumo de passagem não é encontrável: ver `ADR-0004-provisionamento` (A2, A3, §3), `QUESTOES.md` (D3-final, PADRAO, Senioridade, §4.4) e `SPEC-001` v2.2 (§4.3, §4.3b).
> 3. O §9.5 dizia que o primeiro passo concreto era fechar o `$transaction` "num ambiente com `binaries.prisma.sh` liberado". **Não foi necessário:** o Prisma 7 dispensa o engine Rust quando roda sobre driver adapter, e o teste correu sem o domínio bloqueado.

---

Para verificação. Nada abaixo foi commitado no GitHub nem gerou arquivo definitivo além deste, do `CLAUDE.md`, do `ADR-0003`, do `QUESTOES.md` e do `PATCH` — todos aguardando seu aceite.

---

## 1. O que foi resolvido nesta sessão

### 1.1 O fantasma `CLAUDE.md`
Nunca existiu. Era citado em 10 dos 12 arquivos do repo (18 pontos), com numeração (6, 7, 10) de origem não verificável. As normas atribuídas a ele tinham fonte real no `PRD-v2.2` §7.3/§7.8 — só não era ele.

**Feito:** `CLAUDE.md` v1.0 escrito como documento NOVO, numeração 1–10, cada regra com proveniência marcada. 17 citações reapontadas via `PATCH-citacoes-2026-07-24.md`. Documentos normativos editados no corpo; relatórios (P7, P8, RESUMO-2, LEIA-ME) com nota no topo e corpo intacto.

### 1.2 Contradição PRD §2.4 × SPEC-001 §3.2
O PRD dizia "spike antes do schema definitivo"; a SPEC-001 dizia "schema agora, policies depois". **Feito:** PRD §2.4 emendado — spike antes das *policies*; schema base sobrevive às três saídas do spike. SPEC-001 → v2.1 com a ressalva.

### 1.3 Spike Prisma + RLS (ADR-0003)
Executado de verdade: PostgreSQL 16.14, 21 testes, três variantes. Reproduzível por `spike-adr0003/run.sh`.

**Decisão: V1 — `SET LOCAL` por transação.** Resultados que importam:
- V3 (conexão por tenant) **não isola** — role do tenant A emite `SET` e lê o B
- V2a (auth.uid + join) **estoura a pilha** — recursão (eu previ `42P17`, o erro real é `54001`)
- V2b (SECURITY DEFINER) funciona mas reintroduz leitura sem policy
- V1 isola em tudo, com UM vazamento: `SET` sem `LOCAL` contamina a próxima requisição do pool
- **Achado que muda a SPEC-001:** FK simples atravessa tenant. O banco aceitou contrato do tenant A apontando para cliente do B. Correção testada: FK composta `(tenant_id, id)`, rejeita com `23503`. Custo: 7 FKs a converter, `UNIQUE (tenant_id, id)` nas tabelas referenciadas.

### 1.4 Taxonomia de "bloqueio vermelho"
O critério de saída da F0 exigia "QUESTOES.md sem bloqueio vermelho", e a palavra aparecia uma única vez em todo o corpus, sem definição. **Feito:** definida no `QUESTOES.md` §1 (🔴 reescreve schema/policy/contrato · 🟡 reescreve tela/relatório/cálculo · 🟢 muda um valor).

### 1.5 QUESTOES.md consolidado
O registro original `Q-001…Q-023` nunca chegou. **Feito:** consolidação por varredura do corpus, não reconstrução. O que não foi citado em documento sobrevivente está perdido — assumido.

---

## 2. Decisões que você tomou nesta sessão

| Ref | Decisão | Efeito |
|---|---|---|
| A1 | Comissão pela tabela do PRD (escalonada), não a flat do CRM | `PADRAO` é a taxa da casa, não vazio |
| A2 | Supabase do financeiro em organização SEPARADA do CRM | isola billing e RBAC de plataforma |
| A3 | Domínio `financeiro.blackhaus.io`, app no MESMO VPS do CRM | provisionamento resolvido |
| B1 | ADR-0003 aceito (V1) | destrava schema definitivo |
| B2 | FK composta entra na SPEC-001 agora | 7 FKs, custo baixo pré-dados |
| C1 | Estado ativo lido do funil `Clientes ativos - Assinatura`, com par `Vendas-Integração → Donos de Usina` (a criar) | conector com uma regra para os dois produtos |
| C1-b | As 28/36 pessoas em rateio: homologadas, assinatura NÃO iniciada | **mata o F-01** — não há carteira legada a migrar |
| D3 | *(revisto abaixo — ver D3-final)* | — |
| A4 | Reunião com contador — adiada, campos entregues (§5) | — |
| D3-final | **Comissão por `vendedor_tipo`, EIXO ÚNICO.** Origem do lead NÃO entra | `regra_comissao` é tabela de uma chave |
| PADRAO | **50%, sempre foi.** Os 303 leads em PADRAO já eram 50% | versão por vigência deixa de ser obrigatória pelo PADRAO — mantida pela tarifa |
| Senioridade | Captador Sênior é `vendedor_tipo` NOVO (60%) | **exige migration no CRM** — bloqueia motor de comissão |

---

## 3. Provisionamento — as 5 condições do VPS compartilhado

Como o financeiro roda no mesmo KVM do CRM (Ubuntu 24.04, 4 GB, 1 vCPU, 50 GB — folga confirmada por print):

1. Usuário Linux `financeiro` sem sudo
2. `chmod 600` nos dois `.env`, cada um do seu dono — **derruba o risco da credencial de escrita do CRM**
3. Swap de 4 GB — elimina OOM no build do Next
4. `systemd` com `MemoryMax=1536M` **e `OOMScoreAdjust=500`** — se faltar memória, o kernel mata o financeiro, não o CRM
5. Build fora da máquina (GitHub Actions), sobe artefato — 1 vCPU não builda em produção sem travar o CRM

Sem o item 4, eu não rodaria os dois juntos. Com os cinco, rodaria sem desconforto.

---

## 4. O que continua ABERTO

### 4.1 F0 — FECHADA em 24/07/2026
Quatro entregas: auditoria ✅, spike ✅, provisionamento ✅, decisões fiscais-e-comissão ✅ (comissão resolvida; **fiscal movido para risco aceito** — ver §8). Detalhe do fechamento e da pendência residual na §8, ao final.

**A F1 está autorizada a iniciar.** Kickoff na §9.

### 4.2 Vermelhas novas desta sessão — dev do CRM
| Item | Por quê |
|---|---|
| `Comissionamento`: `LIMIT 1` sem `ORDER BY` no LATERAL (VIEWS §100) | mesmo lead pode pagar 25% hoje, 50% amanhã. É alíquota, não relatório |
| **Gatilho de faturamento não é evento do CRM** | ver §4.4 — o card sai do `won` à mão; o início real do desconto vem da fatura da Equatorial, não do funil |
| Query origem × Comissionamento (não pude rodar — expõe dado pessoal) | valida se a `regra_comissao` chaveia por origem. Query pronta na §6 |

### 4.3 Comissão — FECHADA, eixo único `vendedor_tipo`

A regra é uma tabela de **uma chave** (`vendedor_tipo`). Origem do lead não entra. O campo `Comissionamento` do card vira **override manual** para exceção pontual, não regra.

**`regra_comissao`** — versionada por `vigencia_inicio`/`vigencia_fim`:

| chave (`vendedor_tipo`) | % | depende de |
|---|--:|---|
| `proprio` (Vendedor G3) | 50 | existe no CRM |
| `terceirizado` | 50 | existe no CRM |
| `parceiro_indicador` | 25 | **migration no CRM** |
| `parceiro_captador` | 50 | **migration no CRM** |
| `parceiro_captador_senior` | 60 | **migration no CRM** |
| PADRAO | 50 (= `proprio`) | fallback |
| *(qualquer card)* | override | `Comissionamento` do lead |

**Dependência que atravessa a fronteira read-only:** hoje o CRM tem só `parceiro` genérico como `vendedor_tipo`. As três linhas de parceiro (indicador/captador/sênior) exigem que o **dev do CRM** quebre esse tipo em quatro. O financeiro não pode fazer isso (regra 4). Até a coluna existir e estar preenchida, todo parceiro cai no PADRAO ou no override. **Isso é bloqueio de F3, e é item do dev do CRM, não do financeiro.**

Precedência: **override do card → `vendedor_tipo` → PADRAO.** Sem eixo de origem, não há colisão a resolver — a resposta do Vinicius eliminou a segunda dimensão.

### 4.3b Tarifa — mudança de schema, ainda pendente de aceite
`consumo_reais = valor × 1,13`, exato em 5 de 5 ganhos. O connector marca `valor` como **kWh** e `consumo_reais` é o mesmo consumo em BRL. Logo **1,13 é TARIFA (R$/kWh), não "fator de consumo"**.

`consumo_reais` é derivado e muda quando a Equatorial reajusta. O financeiro precisa guardar `consumo_kwh` + `tarifa_centavos` da competência + o derivado — tabela `tarifa` versionada por vigência. Guardar só o valor em reais (como a SPEC-001 faz hoje) faz o histórico divergir do faturado no primeiro reajuste. **`regra_comissao` e `tarifa` usam o mesmo mecanismo de versão por vigência — um só padrão de "valor com data".**

### 4.4 O processo que você revelou agora
Você tira o card de `Desconto Ativo` (won) à mão porque o rateio concluiu mas o desconto ainda não ativou. Isso significa: **nenhuma etapa do funil marca o cliente pagante.** O estado "desconto na fatura" vive fora do CRM. O gatilho "cria cliente no won do Rateio" faturaria cedo demais. O gatilho real é a 1ª fatura com desconto (Equatorial, F2). Decisão fica para a F2 — registrada 🔴.

### 4.5 Ainda aberto de sessões anteriores
- **AUD-05a** — número do PADRAO (mesmo item da F0)
- **D3-r4** — "captação" = `Prospecção Ativa`? E os `30%` (3 leads) = o quê? Sem categoria correspondente
- **`responsavel` vs `vendedor_origem`** — dois nomes no mesmo ganho (G3-0386, G3-0195). Comissão precisa nomear qual. Recomendação: `responsavel` paga, `vendedor_origem` só registra
- **7 dos 48 ganhos são do funil Parceiros com valor NULL** — comissão sobre nulo

---

## 5. Campos para o contador (você pediu)

**Tributação**
1. Regime de cada operação (Simples/Presumido/Real)
2. Q-003 C — crédito de IBS/CBS na comercialização de crédito de energia, e base
3. Q-002 C — escriturar receita sem emissão de documento fiscal
4. Natureza da receita: energia, serviço ou locação de ativo? (define CNAE e retenção)

**Comissão e repasse**
5. Q-011 — retenção sobre comissão a PF: IRRF, INSS, ISS (alíquota, base, quem recolhe)
6. Comissão a PJ: retenções e nota exigida
7. Repasse ao dono da usina: despesa, custo ou repasse de terceiros? (muda o DRE)
8. Retenção na fonte sobre repasse PF × PJ
9. Regime de caixa ou competência para reconhecer a receita de crédito

**Novo desta sessão**
10. Renata é diretoria/sócia e concentra 39 de 48 ganhos (83%) como responsável. Comissão a sócia é comissão (despesa dedutível) ou distribuição de lucro? Muda tributação e DRE

---

## 6. Query para o dev do CRM validar a regra de comissão

```sql
SELECT l.origem, o.label AS comissionamento, count(*)
FROM leads l
JOIN lead_funnel_position lfp ON lfp.lead_id = l.id
JOIN funnel_stages s ON s.id = lfp.stage_id AND s.stage_type = 'won'
LEFT JOIN custom_field_values v ON v.lead_id = l.id
LEFT JOIN custom_field_definitions d ON d.id = v.field_definition_id AND d.label = 'Comissionamento'
LEFT JOIN custom_field_options o ON o.id = ANY (v.valor_options)
WHERE l.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'
GROUP BY 1, 2 ORDER BY 3 DESC;
```
Se `Indicação`→`25%` e `Prospecção Ativa`→`50%` concentram, a `regra_comissao` chaveia por origem. Se espalha, o campo é preenchido a olho e só o override manual serve.

---

## 7. Arquivos desta sessão — status GitHub (aguardando seu OK)

**ADICIONAR:** `CLAUDE.md` · `QUESTOES.md` · `ADR-0003-contexto-de-tenant.md` · `PATCH-citacoes-2026-07-24.md` · `reparo-citacoes-2026-07-24.patch` · `spike-adr0003/` (01-schema.sql, 02-variantes.sql, spike.mjs, run.sh, RESULTADOS.txt, package.json) · este `RESUMO-SESSAO-3.md`

**SUBSTITUIR:** `PRD-v2.2.md` · `SPEC-001-fundacao.md` (→v2.1) · `ADR-0002-modelo-cliente-e-tenant.md` (a r2 do repo, NÃO o anexo r1) · `GLOSSARIO.md` · `_TEMPLATE-SPEC.md` · `QUESTOES-bloco-para-fusao.md` · `P7` · `P8` · `RESUMO-SESSAO-2` · `LEIA-ME-retomada`

**NÃO TOCAR:** `VIEWS-PROPOSTAS-r2.sql` (correção do `ORDER BY` é do dev do CRM) · `gitignore.txt`

**Pendente de aceite antes de eu escrever:** SPEC-001 → v2.2 (tabelas `regra_comissao` e `tarifa` versionadas, FK composta, nota sobre `tem_rateio_ativo`). PADRAO e eixo de comissão agora resolvidos — falta só seu OK para eu escrever.

---

## 8. Fechamento da F0 — e a pendência que sobra

**F0 fechada em 24/07/2026.** Três entregas concluídas de fato (auditoria, spike, provisionamento). A quarta — decisões fiscais-e-comissão — fecha com **assimetria que precisa ficar registrada, não escondida:**

- **Comissão: resolvida.** Eixo único `vendedor_tipo`, PADRAO 50%, tabela `regra_comissao` desenhada. Fim.
- **Fiscal: risco aceito, não resolvido.** A reunião com o contador não aconteceu. Você optou por não segurar o calendário esperando por ela — decisão legítima, e a recomendação foi a favor. Mas as quatro questões fiscais **não foram respondidas**; foram *aceitas como risco* e **rebaixadas de bloqueio de F0 para bloqueio de F2/F3**.

**A pendência viva, carregada para dentro da F1:**

| Questão | Se o contador responder "não é o que você assumiu"… | Bloqueia |
|---|---|---|
| Q-011 — retenção sobre comissão a PF | muda o cálculo líquido do repasse | F3 |
| Q-002 C — escriturar receita sem doc fiscal | muda como a fatura reconhece receita | F2 |
| Q-003 C — crédito de IBS/CBS | muda a base tributável do faturamento | F2 |
| Item 10 — comissão a sócia (Renata, 83%) é despesa ou distribuição | muda o DRE e a dedutibilidade | F2/F3 |

**O que isso significa na prática:** a F1 (fundação — tenant, auth, RBAC, cadastros) **não toca nada disso** e pode correr inteira sem risco. Mas o dia em que a F2 (faturamento) começar, essas quatro **voltam a ser vermelhas** e a reunião com o contador vira pré-requisito de novo — agora sem folga de calendário. **Marcar o contador durante a F1 é o caminho de menor dor:** resolve em paralelo o que senão trava a F2 no primeiro dia.

Os 10 campos para levar ao contador estão na §5. Nada além disso trava a F0.

---

## 9. Kickoff da F1 — fundação

**Autorizada em 24/07/2026.** A spec já existe: `SPEC-001-fundacao.md` v2.1 (vira v2.2 com as tabelas de comissão/tarifa e FK composta, pendente do seu OK).

### 9.1 O que a F1 entrega
Duas camadas, conforme SPEC-001 §2:
- **Plataforma:** `tenant`, `usuario`, vínculo usuário↔tenant↔papel, RBAC dois níveis, `conector_crm` (schema, não sync), trilha de acesso
- **Cadastros:** `cliente`, `unidade_consumidora`, `usina`, `usina_geracao`, `dono_usina`, `originador`, `contrato`
- O **contrato de isolamento** — forma das policies + a função de contexto (implementação já decidida no ADR-0003: `SET LOCAL` por transação)

### 9.2 Primeira migration — o que o ADR-0003 obriga
- `tenant_id uuid NOT NULL` em toda entidade de negócio, desde a migration 1
- **FK composta** `(tenant_id, id)` em toda referência entre entidades de negócio — 7 conversões, `UNIQUE (tenant_id, id)` nas tabelas referenciadas. Sem isso a invariante 2 é uma frase (medido no spike: FK simples atravessa tenant)
- RLS `ENABLE` + `FORCE` + policy `USING (tenant_id = app.current_tenant_id())` em todas
- `app.current_tenant_id()` lê GUC de sessão via `SET LOCAL` — middleware único, nunca `SET` sem `LOCAL`
- Teste de vazamento no CI (pool tamanho 1) desde o primeiro dia

### 9.3 O que a F1 NÃO espera
- **Não espera o fiscal** (§8) — fundação não toca faturamento
- **Não espera a migration do CRM** (§4.3) — os subtipos de parceiro são F3
- **Não espera o `$transaction` do Prisma** (§4.3 do ADR-0003) — mas isso precisa fechar ANTES da primeira migration de *policy*. Meia hora em ambiente com rede aberta. **É o primeiro item técnico da F1.**

### 9.4 Questões que a F1 abre e precisam de você
| Questão | Nível | O que decide |
|---|---|---|
| MT-06 | 🟡 | auth próprio ou SSO com CRM (recomendado: próprio) |
| MT-01 | 🟡 | usuário em mais de um tenant (recomendado: sim, N:N) |
| AUD-09 | 🟡 | origem canônica de CPF/CNPJ (recomendado: financeiro coleta) |
| Sucessora F-01 | 🔴 | **§4.4** — o gatilho de faturamento não é evento do CRM. Decisão de F2, mas registrada agora |

### 9.5 Primeiro passo concreto
Fechar o `$transaction` do Prisma (§9.3) num ambiente com `binaries.prisma.sh` liberado, e então escrever a primeira migration de schema — as duas camadas da §9.1, com as obrigações da §9.2. A migration de *policy* vem depois do teste de `$transaction` passar.

---

## 10. Pendência de F0 (registro final, conforme pedido)

**A F0 está fechada, com UMA pendência aceita como risco:** a reunião com o contador não ocorreu. As quatro questões fiscais (Q-011, Q-002 C, Q-003 C, e a comissão a sócia — item 10 da §5) não foram respondidas — foram **rebaixadas de bloqueio de F0 para bloqueio de F2/F3**.

Consequência: a F1 corre livre, mas a F2 não começa sem essa reunião. **Recomendação: marcar o contador durante a F1**, para não travar a F2 no primeiro dia. Os campos a levar estão na §5 (10 itens).

Nada mais trava a F0. F1 autorizada.
