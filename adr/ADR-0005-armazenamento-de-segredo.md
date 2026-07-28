# ADR-0005 — Onde mora o segredo do tenant, e quem o resolve

| Campo | Valor |
|---|---|
| **Status** | **Proposta** — aguarda decisão de Vinicius Leal (`CLAUDE.md` regra 10) |
| **Data** | 28/07/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | O pré-requisito da `Q-SICOOB-01` · `CLAUDE.md` regra 5 · `PRD-v2.2` §6 |
| **Base factual** | Catálogo do banco de produção medido em 28/07/2026 — PostgreSQL 17.6, extensões e grants na §2 |
| **Afeta** | `src/sicoob/http.ts` (não escrito) · `conector_cobranca.credencial_ref` · toda credencial por tenant que vier depois |

> **O que este ADR decide não é implementação, é escolha.** A regra 5 diz que segredo por tenant *"vive em armazenamento cifrado e é acessado por referência"*. A migration 18 criou a referência — `conector_cobranca.credencial_ref` — e **o armazenamento para onde ela aponta não existe.** Não há cofre e não há resolvedor. Enquanto não houver, `src/sicoob/http.ts` não tem como ser escrito: não se sabe de onde ele lê o certificado A1.
>
> Isto foi registrado como pendência no `RESUMO-SESSAO-10` e é o segundo bloqueio da F2 — o primeiro é o certificado, que é externo. **Este não é externo.**

---

## 1. O problema, em uma frase

O adaptador da Sicoob recebe uma `credencial_ref` e precisa devolver, em memória e no momento da chamada, **o certificado A1, o `client_id` e o `client_secret` daquele tenant** — sem que nenhum desses valores exista em coluna, em log, em variável de ambiente ou em payload gravado.

Três restrições já estão fixadas e não são reabertas aqui:

1. **Regra 5** — segredo por tenant em armazenamento cifrado, acessado por referência. Só segredo *de plataforma* vai para variável de ambiente.
2. **A porta não aceita segredo.** `src/sicoob/porta.ts` não tem `clientSecret` nem caminho de certificado em tipo nenhum, de propósito: um tipo que aceitasse faria a violação compilar.
3. **A constraint `boleto_payload_sem_segredo`** (migration 16) recusa a linha se o payload gravado trouxer token. Gravar a resposta do OAuth junto com a do boleto é o caminho óbvio de vazamento, e o banco morde.

---

## 2. O que foi medido, em 28/07

Contra o banco de produção, `sa-east-1`, PostgreSQL **17.6**:

| Extensão | Versão | Instalada? |
|---|---|---|
| `supabase_vault` | 0.3.1 | **sim** — o schema `vault` existe |
| `pgsodium` | 3.1.8 | disponível, **não** instalada |
| `pgcrypto` | 1.3 | sim |

O schema `vault` tem a tabela `secrets` e a view `decrypted_secrets`. Colunas de `vault.secrets`: `id`, `name`, `description`, `secret` (text, cifrado), `key_id`, `nonce`, `created_at`, `updated_at`. **Há zero segredos guardados** — é terreno limpo.

**O grant é o dado mais importante desta seção:**

| Role | `vault.secrets` | `vault.decrypted_secrets` |
|---|---|---|
| `postgres` | SELECT, DELETE, … | SELECT, DELETE, … |
| `service_role` | SELECT, DELETE | SELECT, DELETE |
| **`app_financeiro`** | **nenhum** | **nenhum** |

Ou seja: **hoje, quem tiver a `DATABASE_URL` de runtime não alcança o cofre.** Isso não é acidente feliz que se deva desfazer — é uma propriedade a preservar, e ela elimina de saída qualquer desenho que dê `SELECT` direto em `decrypted_secrets` à role de runtime.

A chave de cifragem do Vault 0.3 é gerenciada **fora do banco**, pelo Supabase. Consequência prática: um `pg_dump` do banco inteiro **não revela os segredos**. Esse é o ganho central sobre guardar em coluna própria com `pgcrypto`, onde a chave acabaria no mesmo lugar que o dado.

---

## 3. As quatro opções

### A. Supabase Vault + função resolvedora amarrada ao tenant

O segredo vai para `vault.secrets` com `name = credencial_ref`. A role de runtime **continua sem acesso ao schema `vault`**. Quem resolve é uma função `SECURITY DEFINER` em `app`, que:

1. lê `app.current_tenant_id()` — o contexto que o `ADR-0003` já emite por transação;
2. confere que a `credencial_ref` pedida é a do `conector_cobranca` **daquele** tenant;
3. devolve só aquele segredo;
4. grava trilha na mesma transação (regra 9 — acesso a segredo é escrita de auditoria).

| | |
|---|---|
| **Custo de adoção** | Baixo. Já está instalado, nenhuma dependência nova, nenhuma conta nova |
| **Raio de dano** | Segredo e dado compartilham o banco. Quem virar `postgres` leva os dois — **mas já levava os dados** |
| **`pg_dump` vaza?** | Não. A chave está fora do banco |
| **Encaixe no projeto** | Alto. `SECURITY DEFINER` + `app.current_tenant_id()` + trilha é exatamente o padrão que as 18 migrations já usam |
| **Atrito** | O A1 é binário e a coluna é `text` — entra em base64. Um A1 tem poucos KB; não é problema de tamanho |

### B. `pgsodium` direto

Instalar a extensão e gerenciar as chaves nós mesmos.

Dá mais controle e **cobra por ele**: a gestão de chave passa a ser nossa, e é o tipo de código onde errar não dá erro — dá cifra fraca. O Vault 0.3 já é uma camada fina sobre esse problema, resolvida por quem mantém o banco. Não encontrei ganho que justifique o custo para este caso.

### C. Gerenciador externo — AWS Secrets Manager, HashiCorp Vault, Infisical, Doppler

| | |
|---|---|
| **Raio de dano** | **O melhor das quatro.** Comprometer o banco não entrega os segredos: são sistemas diferentes, credenciais diferentes |
| **Custo de adoção** | Alto. Conta nova, fatura nova, rotação nova, e uma dependência de rede **no caminho do dinheiro** |
| **Ovo e galinha** | Precisa de uma credencial de bootstrap no VPS. Isso é legítimo — é segredo *de plataforma*, e a regra 5 manda esse para variável de ambiente |
| **Latência** | Uma viagem a mais por emissão. Mitigável com cache em memória, que por sua vez traz "por quanto tempo guardo segredo em RAM" |

### D. Arquivo em disco no VPS

É o caminho tentador, e o `RESUMO-SESSAO-10` chegou a supor que seria assim (*"mais tarde, o certificado A1 em disco"*). **Recomendo descartar**, por três motivos concretos:

1. Contraria a regra 5 — arquivo com permissão restrita não é "armazenamento cifrado".
2. Não escala por tenant sem virar um diretório de certificados e uma convenção de nomes, que é um cofre caseiro mal feito.
3. **O VPS é compartilhado com o CRM** — e o CRM é o sistema que guarda cinco tokens em `text` puro (`P8` §4). Pôr o A1 da G3 nesse disco é aumentar o valor de um alvo que já tem um problema conhecido.

**E ele nem é necessário.** O TLS do Node aceita `pfx` como `Buffer`: resolvendo do cofre para a memória, **o certificado nunca toca o disco do servidor**. Isso corrige a suposição do `RESUMO-SESSAO-10`.

---

## 4. Recomendação

**Opção A**, e o argumento decisivo não é ela ser a melhor em isolamento — é a **C** não ser urgente.

A `credencial_ref` é indireção. O código do financeiro **nunca** vê o segredo: vê uma referência opaca, e quem a resolve é o adaptador. Trocar o cofre depois é trocar a implementação do resolvedor — não muda a porta, não muda `conector_cobranca`, não muda migration, não muda repositório. **Escolher A hoje não fecha a porta para C amanhã**, e essa é exatamente a propriedade que a porta injetada foi desenhada para dar.

Então a recomendação é: **A agora, para destravar `src/sicoob/http.ts`**, com a migração para C reavaliada quando (a) houver mais de um tenant com credencial real, ou (b) alguém de fora da G3 precisar operar o sistema.

Se a decisão for **C desde já**, é decisão legítima e o custo é conhecido — só não deveria ser tomada por inércia, porque ela empilha uma integração nova em cima de uma integração que ainda não tem certificado.

---

## 5. O que a decisão destrava, e o que ela não destrava

**Destrava:** escrever `src/sicoob/http.ts` — o adaptador real da Cobrança v3, com OAuth2 sobre mTLS.

**Não destrava:** a F2. O critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura automaticamente"*, e para isso ainda faltam o certificado A1 (`Q-SICOOB-01`, externo) e o desenho da autenticação do webhook (`Q-WEBHOOK-01`, aberta em 28/07).

Os três são independentes e podem correr em paralelo. Este ADR é o único dos três que **não depende de ninguém de fora**.

---

## 6. Questões que ficam abertas depois desta decisão

| Questão | Por quê |
|---|---|
| Quem escreve no cofre, e por qual caminho | A role de runtime não deve ter `INSERT` em `vault.secrets`. Provisionamento, como o `bootstrap-plataforma-admin.sql` — não migration |
| Rotação do A1 | O certificado vence. `conector_cobranca.certificado_expira_em` já alerta (`PRD` §6), mas o procedimento de troca não existe |
| Cache em memória do segredo resolvido | Se houver, por quanto tempo, e o que o invalida. Sem cache, é uma consulta por emissão |
| Trilha de acesso a segredo | A regra 9 exige trilha na mesma transação da leitura para acesso de plataforma a dado de tenant. Vale para leitura de credencial? Minha leitura é que sim — mas é leitura, não decisão registrada |
