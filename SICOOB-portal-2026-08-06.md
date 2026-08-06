# SICOOB — a folha da passada no portal

| Campo | Valor |
|---|---|
| **Para quem** | O dono, na hora de abrir `developers.sicoob.com.br`. **É para ficar aberta ao lado do navegador** |
| **Por que existe** | A `RETOMADA-2026-08-06` §1 lista o que colher. Esta folha diz **o que cada resposta muda aqui dentro** — que é a parte que não dá para reconstruir depois, olhando a anotação |
| **Escrito em** | 06/08/2026, **antes** do cadastro. Nada nele é medição: é o que perguntar e o que fazer com a resposta |
| **Precede** | `SICOOB-contrato-medido-2026-08-05.md`, que é o contrato lido na documentação pública. Esta folha é o que **falta** naquele |

> **O ponto todo é a passada ser uma só.** Voltar ao portal custa mais do que anotar tudo de uma vez, e cada item abaixo já tem um consumidor esperando no repositório. Item que volta sem resposta **continua sendo pergunta** — vira entrada no `QUESTOES.md` (regra 10), não palpite de implementação.

---

## 0. Antes de abrir o navegador — o que já está resolvido

Para não gastar a passada perguntando o que já se sabe:

| | |
|---|---|
| **Onde mora o segredo** | ✅ `ADR-0005` aceito em 05/08 — Supabase Vault + resolvedora `SECURITY DEFINER`. **Não pergunte onde guardar a credencial**: está decidido |
| **Como a Sicoob entra no webhook** | ✅ `ADR-0006` aceito em 06/08 — mTLS + faixa de IP, tenant pela credencial, usuário de serviço por tenant, a rota declara o modo |
| **As URLs, os três verbos, o corpo do boleto** | ✅ medidos em 05/08, em `SICOOB-contrato-medido` |
| **Que `valor` é decimal e não centavos** | ✅ medido. É a armadilha mais cara e já está nomeada |

---

## 1. Os nove, com o consumidor de cada um

### Do Dashboard — é o que destrava código

| # | Anotar | Quem consome aqui | O que muda conforme a resposta |
|:--:|---|---|---|
| **1** | `client_id` de sandbox, **e se existe `client_secret`** | `ADR-0005`, a função resolvedora | **Se houver `client_secret`:** a resolvedora devolve um par, e o Vault guarda dois campos. **Se não houver** (Keycloak sobre mTLS, o certificado *é* a credencial): ela devolve a referência do certificado e só. Não são a mesma função |
| **2** | As **URLs base** de sandbox e o **endpoint de token**, do painel | `src/sicoob/http.ts` | Confirma ou corrige a §1 do `SICOOB-contrato-medido`. Ler documentação e ver no painel **não são a mesma medição** — foi essa distinção que a `Q-VIEWSCRED-01` cobrou caro |
| **3** | **Coleção Postman / spec OpenAPI** para download | fixture do adaptador | Vira o que a suíte exercita. Hoje o adaptador falso (`src/sicoob/falso.ts`) é determinista e não conhece o formato real |

### Do cadastro de aplicativo

| # | Anotar | Quem consome aqui | O que muda conforme a resposta |
|:--:|---|---|---|
| **4** | Quais **APIs/escopos** a tela deixa marcar — em especial se **Cobrança Bancária v3** e **Pix (`cob`)** são aplicativos separados | a §2 da fila inteira | **Se `cob` estiver disponível**: a cobrança ganha `txid` e **concilia sozinha**, sem depender de contrato de cobrança bancária — e o item 9 desta folha pode deixar de bloquear. Ver §2 abaixo |
| **5** | Confirmar o certificado: **`.PFX` com senha + `.CER` Base-64** | `ADR-0005` · `Q-SICOOB-01` | Se divergir do que a documentação de terceiro diz, o ADR precisa saber **antes** de alguém comprar o A1 |
| **6** | Se a tela exige **dados da conta bancária** já no cadastro | o cronograma | Decide se dá para adiantar o sandbox **antes** de a conta PJ existir. Se exigir, sandbox e conta deixam de ser paralelos |

### Da tela de configuração de webhook — e ela responde uma decisão já tomada

| # | Anotar | Quem consome aqui | O que muda conforme a resposta |
|:--:|---|---|---|
| **7** | **O que o campo aceita além da URL**: cabeçalho customizado? segredo? só a URL? | `ADR-0006`, Decisão 1 | É a **evidência empírica** que falta. A decisão já foi tomada (mTLS + faixa de IP) e tem plano B nomeado dentro dela — o que a tela mostrar **confirma ou aciona o plano B**, e não reabre a decisão |
| **8** | Menção a **mTLS, certificado de cliente ou faixa de IP** na entrada | idem | Idem. Se não houver **nenhuma** das três, o pré-requisito de *ligar* a rota falhou e é o plano B que vale |

### Do contrato de cobrança — pode não estar no portal

| # | Anotar | Quem consome aqui | O que muda conforme a resposta |
|:--:|---|---|---|
| **9** | `numeroCliente`, `numeroContratoCobranca`, `codigoModalidade` | `conector_cobranca` | São a **identidade do cooperado** e **não se derivam de nada** que o sistema tenha. A tabela tem `numero_contrato`, `numero_convenio`, `agencia` e `conta`, e **qual mapeia para qual é pergunta, não código**. Se não estiverem no portal, é pergunta para a cooperativa |

---

## 2. A pergunta do item 4 é a que pode encurtar tudo

**São duas APIs, e a distinção não é detalhe.**

| | O que é | O que resolve |
|---|---|---|
| **Cobrança Bancária v3** | boleto — é o que o `SICOOB-contrato-medido` mediu | boleto registrado, linha digitável, baixa |
| **API Pix** (padrão BACEN) | `cob`, `cobv`, `loc`, `webhook` | **`txid` por cobrança e webhook de recebimento** |

O projeto vinha aceitando que *"Pix estático não concilia, por isso boleto é preferido"*. Isso vale para o **estático** — que é o que está no ar hoje e o que a aba Documento desenha. Com `cob`, a cobrança tem `txid` e concilia sozinha, e **não depende do contrato de cobrança bancária** (o item 9).

**Não é decisão tomada, e não é para decidir no portal.** É opção que ninguém tinha visto, e ela só se pesa com as credenciais na mão. O que a passada precisa produzir é a **resposta factual**: a tela deixa marcar Pix, ou não.

---

## 3. Uma armadilha para quem for implementar, e ela é 404 garantido

O Sicoob **acrescenta `/pix` ao final da URL cadastrada**. Registrar `https://financeiro.blackhaus.io/api/pix` faz o POST chegar em `…/api/pix/pix`.

Quem cadastrar o webhook: **anote a URL exatamente como foi digitada no campo**, porque o que a rota precisa casar é o caminho *depois* do acréscimo.

---

## 4. O que o portal NÃO resolve

**A conta PJ numa cooperativa singular.** É ela que destrava **produção**, corre em paralelo e **não bloqueia o sandbox**.

Para PJ, a jornada de adesão da API Pix passa pela cooperativa, que abre chamado no **Top Desk**, e a credencial volta por e-mail — só que **isso é a versão de 2021 do manual**, e o portal pode ter substituído o fluxo. É o item 6.

---

## 5. No dia em que a credencial de sandbox chegar

Nesta ordem, e o primeiro passo não é escrever código.

1. **Anotar as nove respostas neste arquivo**, com data. Quem ler daqui a duas semanas precisa saber o que foi *visto* e o que foi *suposto* — é a diferença que o `SICOOB-contrato-medido` marca no cabeçalho;
2. **Reconferir a §1 do `SICOOB-contrato-medido` contra o painel.** Divergência aqui é barata agora e cara depois;
3. **Decidir o item 4** (boleto, `cob`, ou os dois) — é decisão com dono, e ela reordena a §2 da fila;
4. **Aí sim, `src/sicoob/http.ts`.** As três razões da `RESUMO-SESSAO-21` §5 param de valer no momento em que existe uma credencial que o adaptador possa exercitar — e nem antes, nem um dia depois.

**O que continua NÃO destravado pela credencial de sandbox:** emitir boleto de verdade, que espera o **A1 de produção** e a conta PJ. Sandbox destrava **escrever e exercitar** o adaptador, que é o maior código que falta.
