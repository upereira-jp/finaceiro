# ADR-0004 — Provisionamento: organização, domínio e host

| Campo | Valor |
|---|---|
| **Status** | **Aceita** em 24/07/2026 (decisões A2 e A3) · escrita em 25/07/2026 |
| **Data** | 25/07/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | `SPEC-001` Q-SPEC001-06 · `PRD-v2.2` §2.3 |
| **Base factual** | Inventário do VPS do CRM (Ubuntu 24.04, 4 GB, 1 vCPU, 50 GB), folga confirmada por inspeção em 24/07 |
| **Afeta** | `SPEC-001` §2 e §3.2 (teto de pool) · pipeline de deploy · F1 inteira |

> **Este ADR não decide nada novo.** As três decisões abaixo foram tomadas em 24/07/2026 e viviam **apenas** no `RESUMO-SESSAO-3` §2 e §3 — um documento de passagem de sessão. Decisão que só mora numa ata não é encontrável: este projeto já perdeu um `QUESTOES.md` inteiro assim, e passou um dia inteiro caçando um `CLAUDE.md` que nunca existiu. Aqui elas ganham documento próprio, que é onde a `SPEC-001` pode citá-las.

---

## Decisão

**1. Organização Supabase separada da do CRM.** O projeto Supabase do financeiro não compartilha organização com o CRM.

**2. Domínio `financeiro.blackhaus.io`.**

**3. A aplicação roda no MESMO VPS do CRM** — sujeita às cinco condições da seção seguinte, que são parte da decisão e não recomendação.

---

## Por que organização separada

| Motivo | Consequência de não separar |
|---|---|
| Isola **billing** | Custo do financeiro indistinguível do custo do CRM; nenhum dos dois tem dono de conta claro |
| Isola **RBAC de plataforma** | Quem administra o CRM administra o financeiro por herança de organização. O `PRD-v2.2` §3 desenha dois níveis de acesso justamente para que isso não aconteça |
| Torna a fronteira read-only **estrutural** | O `CLAUDE.md` regra 4 diz que o CRM é read-only absoluto. Organização compartilhada mantém a regra como convenção; organização separada a apoia em fronteira de credencial |

O custo é real e aceito: dois lugares para administrar, e nenhuma federação de identidade entre eles. É por isso que o auth do financeiro é próprio e não SSO (`SPEC-001` §3.1, MT-06).

---

## As cinco condições do VPS compartilhado

O financeiro roda no mesmo KVM do CRM: **Ubuntu 24.04, 4 GB de RAM, 1 vCPU, 50 GB.** Com um vCPU e um banco de produção do lado, "sobra recurso" não é argumento — o que importa é o que acontece quando falta.

| # | Condição | O que ela impede |
|---|---|---|
| 1 | Usuário Linux `financeiro`, **sem sudo** | Escalada lateral do financeiro para o CRM |
| 2 | `chmod 600` nos dois `.env`, cada um do seu dono | **Derruba o risco da credencial de escrita do CRM.** É a condição que mais importa: sem ela, a fronteira read-only depende de o processo se comportar |
| 3 | Swap de 4 GB | OOM durante o build do Next |
| 4 | `systemd` com `MemoryMax=1536M` **e `OOMScoreAdjust=500`** | Se faltar memória, o kernel mata o **financeiro**, não o CRM. Sem o `OOMScoreAdjust`, o alvo do OOM killer é o processo maior — e o processo maior é o banco do CRM |
| 5 | Build fora da máquina (GitHub Actions), sobe artefato | 1 vCPU não compila em produção sem travar o CRM |

**Sem a condição 4, os dois não rodam juntos.** As outras quatro reduzem risco; a 4 é a que decide de quem é o prejuízo quando a memória acaba. Com as cinco, rodam sem desconforto.

---

## Obrigação que atravessa para a `SPEC-001`

O `ADR-0003` r2 converte todo acesso a dado de negócio em transação interativa, e cada transação **prende uma conexão física do pool** pelo bloco inteiro. Num host de 1 vCPU compartilhado com o banco do CRM, isso torna o teto de pool uma decisão de infraestrutura, não de aplicação:

> **O teto do pool do financeiro é declarado explicitamente e conferido contra o `max_connections` do PostgreSQL.** Medido no `ADR-0003` r2: com pool de 1 ocupado por uma transação longa, a requisição seguinte falha em 2.001 ms (`P2028`, `maxWait` default). Pool sem teto declarado é o modo de falha sob carga, não hipótese.

Está registrado na `SPEC-001` §3.2, na tabela do contrato do middleware.

---

## Riscos aceitos

**Host único é ponto único de falha para as duas aplicações.** Aceito porque a alternativa — segundo VPS — custa dinheiro recorrente antes de o financeiro ter um usuário. Reavaliar quando a F2 entrar em produção: faturamento parado por causa de um deploy do CRM é outro nível de dano.

**Sem isolamento de kernel entre as aplicações.** Não há contêiner nem cgroup além do `MemoryMax` da condição 4. As condições 1 e 2 são o isolamento, e são de sistema de arquivos e de usuário — suficientes contra acidente, não contra atacante já dentro da máquina.

**A condição 5 cria dependência do GitHub Actions** para publicar. Se o pipeline cair, o deploy para. O contorno manual — buildar em outra máquina e subir o artefato à mão — existe e é aceito.

---

## Consequências

| Documento | Ação |
|---|---|
| `SPEC-001` §2 | "Não entra: provisionamento" passa a citar este ADR em vez do `PRD-v2.2` §2.3 |
| `SPEC-001` §3.2 | teto de pool entra no contrato do middleware |
| `SPEC-001` §10 | **Q-SPEC001-06 fecha** |
| `PRD-v2.2` §2.3 | passa a apontar para cá em vez de descrever provisionamento |
| Deploy | as cinco condições são **pré-requisito de F1 em produção**, verificáveis uma a uma |

---

## Rodapé

| Versão | Data | O que mudou |
|---|---|---|
| 1.0 | 25/07/2026 | Primeira versão. Promove as decisões A2 e A3 de 24/07 e as cinco condições do VPS, que existiam só no `RESUMO-SESSAO-3` §2 e §3 |
