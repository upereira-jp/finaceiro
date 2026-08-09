# PRÓXIMOS PASSOS — 09/08/2026

| Campo | Valor |
|---|---|
| **Para quem** | quem for executar. **Duas frentes, isoladas**: cada seção se lê sozinha, sem depender da outra |
| **Base** | `README.md`, `RESUMO-SESSAO-24.md`, `RETOMADA-2026-08-08.md` — e, para não responder pelo índice, `PLANO-leitura-fatura-equatorial-2026-08-07.md` (bloco de 08/08), `SICOOB-portal-2026-08-06.md`, `SICOOB-contrato-medido-2026-08-05.md` e `adr/ADR-0006` |
| **Não substitui** | a `RETOMADA-2026-08-08.md`. Ela continua sendo onde tudo parou; este arquivo é só o que vem **depois**, por frente |
| **O que este arquivo NÃO cobre** | a fila da **primeira fatura** (`RETOMADA` §1) — quatro planilhas e três decisões. **Nenhuma das duas frentes a move**, e ela é a que produz receita |
| **Estado do repositório** | árvore **limpa** em `e563b59`; o trabalho de 07–08/08 está em `main`. Nada publicado — ver a correção abaixo |

> **Correção de registro.** A `RETOMADA-2026-08-08` §7 e §8 dizem que há trabalho *"por comitar"*. **Não há** — está tudo comitado (`978b2b6` → `e563b59`). Continua verdade que **nada foi publicado**, e publicar é ato do dono.

> **Regra 10 aplicada aqui:** nada neste arquivo decide o que tem dono. Onde há escolha, ela aparece com o ID da questão e o nome de quem decide.

---

# FRENTE A — Equatorial: leitura automática da fatura

## A.0 Onde ela está

| | |
|---|---|
| ✅ **canal** | **e-mail**, decidido pelo dono em 08/08 (`Q-EQTL-CANAL-01`). O Playwright sai da coleta de rotina |
| ✅ **fase B1** | `src/dominio/fatura-concessionaria.ts`, `src/concessionaria/{porta,falso}.ts`, **44 verificações** no `npm test`. **Intacta pela decisão do canal** — `PortaDeColetaDeFatura` nunca soube se o PDF vem de navegador ou de caixa de entrada |
| 🔴 **o que a parou** | **duas coisas, e nenhuma é código**: falta uma fatura **com geração distribuída**, e a data de nascimento do login **não existe no CRM** (medido em três níveis, `RETOMADA` §3.3) |

## A.1 O que fazer, e não é código

Os três primeiros são **independentes entre si** e podem correr em paralelo.

| # | Passo | Dono | O que destrava |
|:--:|---|---|---|
| **A1** | **Baixar a fatura de UMA das 29 UCs** que faturam — todas têm rateio ativado, logo têm compensação. Qualquer uma serve | **dono** | é o único passo que destrava **código**: `Q-EQTL-CAMPOS-01`, a fase B2 e o extrator |
| **A2** | **Pedir a fatura por e-mail de UMA UC** e olhar o que chega: **anexo ou link** | **dono** | `Q-EQTL-CAIXA-01` — endereço, protocolo, e a única coisa que pode **reabrir a decisão do canal** |
| **A3** | **Mandar o `PROMPT-dev-crm-rodada7-2026-08-08.md`** — o CRM tem data de nascimento? | dev do CRM | a configuração das 29 UCs no portal (D″), e **só ela** |
| **A4** | **`Q-EQTL-ESCOPO-01`** — as **41** UCs ativas ou as **29** que faturam? | **dono** | a migration 26 |
| **A5** | **`Q-EQTL-CRED-01`** — onde moram UC + CPF/CNPJ + nascimento. O `ADR-0005` já decidiu o cofre; esta frente é o **segundo consumidor** dele, não um cofre novo | **dono** | a migration 26, junto com A4 |
| **A6** | **`Q-EQTL-AUTORIZACAO-01`** — consentimento do cliente para redirecionar a fatura **dele**, e achar os **termos de uso** (o que veio do portal foi a *política de privacidade*; são documentos diferentes) | **dono** | a configuração das 29 UCs |

**Por que A1 primeiro.** É o único ponto da frente inteira em que a espera é nossa e não de terceiro. Enquanto a amostra for a residencial convencional, `CamposDaFatura` continua desenhado contra o `PRD` e não contra um documento real.

## A.2 O que é código, na ordem em que se torna escrevível

| # | O quê | Bloqueado por |
|:--:|---|---|
| **B2** | ajustar `CamposDaFatura` ao layout de **GD** | A1 |
| **E** | o **extrator determinístico** — o PDF tem camada de texto, então é custo zero por documento e o modelo de visão vira caminho de exceção. Escrever contra **os bytes do PDF real**, escolhendo a biblioteca de extração **antes** | A1 + B2 |
| **D′** | o **leitor de caixa de entrada** | A2 |
| **C** | **migration 26** — e **com deploy em seguida**, sempre | A4 + A5 |
| **D″** | configurar as **29 UCs** no portal, uma vez cada (é aqui que a data de nascimento é necessária, e **só aqui**) | A3 + A6 + o item 1.1 da fila |
| **F–H** | script, aplicar na competência, agenda. `Q-EQTL-DIVERG-01` só importa em *aplicar* | C + E |

## A.3 O que já está medido e não se re-decide

- a identidade estável da fatura é a **chave de acesso NF3e** (44 dígitos), **não o `sha256`** — o PDF carrega data de emissão e protocolo, e reemitir gera bytes novos para a mesma fatura;
- o **total a pagar** entra como **conferência e nunca como fonte** de `valor_tarifas_concessionaria`. A soma é explícita por componente, e `F2c` afirma que os dois são diferentes de propósito;
- a competência sai como **`FEV/2026`**, e a UC sai **sem zeros à esquerda** (8 dígitos significativos, contra 15 na nossa base) — o padding de `F4a` é mais necessário do que parecia;
- a **iluminação pública** do `PRD` §5.1 é a linha `CONTRIB. ILUM. PÚBLICA - MUNICIPAL`, sob `ITENS FINANCEIROS`;
- **não existe linha chamada "encargos"** — eles vão embutidos na tarifa;
- os **tributos vêm destacados mas embutidos**. Somá-los cobra tributo duas vezes.

## A.4 O que NÃO fazer nesta frente

- **não redesenhar `CamposDaFatura` contra a fatura convencional** — ela não tem fio B, e ajustar o conjunto de campos a ela é a mesma adivinhação de antes, com mais confiança;
- **não escrever o extrator contra o texto já lido** — aquele dump veio do conversor do Google Drive, e cada extrator achata o layout de um jeito diferente. Um parser ajustado ao achatamento estaria ajustado ao **instrumento**, não ao documento;
- **não supor que a data de nascimento está no CRM.** Está medido que não está — nas 10 views, no catálogo inteiro e na nossa base;
- **não aplicar a migration 26 sem o deploy em seguida.** A guarda de arranque recusa subir com tabela em `public` sem modelo no client, e um restart derruba o site.

---

# FRENTE B — Sicoob: conexão de cobrança

## B.0 Onde ela está

| | |
|---|---|
| ⏸️ **por que parou** | **pedido do dono** — última etapa. Não é bloqueio técnico |
| ✅ **decidido** | `ADR-0005` (cofre do segredo) e `ADR-0006` (as **quatro** decisões do webhook: mTLS + faixa de IP · tenant pela credencial · usuário de serviço por tenant · a rota **declara** o modo de auth) |
| ✅ **medido** | os três verbos da porta, com caminho, corpo, resposta e erro — `SICOOB-contrato-medido-2026-08-05.md`. **Nunca exercido contra a API real** |
| 🔴 **não existe** | `src/sicoob/http.ts`. O que existe é `porta.ts` e `falso.ts` |
| 🔴 **externo** | certificado A1 e credencial (`Q-SICOOB-01`) |

**E o que nada disto move:** a primeira fatura. O meio de pagamento de hoje é o **Pix estático**, já no ar com a chave cadastrada, e a triagem não recusa por ausência de boleto.

## B.1 O que fazer, e não é código

| # | Passo | Dono | O que destrava |
|:--:|---|---|---|
| **B1** | **Cadastro em `developers.sicoob.com.br` e credencial de *sandbox*** — uma passada só, com a folha `SICOOB-portal-2026-08-06.md` preenchida enquanto navega | **dono** | transforma o contrato medido em código **exercitável no mesmo dia**. É a coisa mais barata das duas frentes |
| **B2** | **Confirmar se existe `client_secret`** (item 2 da folha) | **dono**, no mesmo acesso | em Keycloak sobre mTLS o certificado *é* a credencial — muda **o que a resolvedora do `ADR-0005` devolve** |
| **B3** | **Decidir boleto, Pix `cob`, ou os dois** | **dono** | se der para marcar `cob`, a cobrança ganha `txid` e **concilia sozinha** — reordena a fila inteira |
| **B4** | **`numeroCliente`, `numeroContratoCobranca`, `codigoModalidade`** — se não estiverem no portal, é pergunta à **cooperativa** | **dono** | são a identidade do cooperado e **não se derivam** de `conector_cobranca` |
| **B5** | **Conta PJ na singular + certificado A1 ICP Brasil** por CNPJ | **dono** / externo | **produção**. Corre em paralelo e **não bloqueia o sandbox** |

## B.2 O que é código, na ordem em que se torna escrevível

| # | O quê | Bloqueado por |
|:--:|---|---|
| **1** | **a resolvedora do `ADR-0005`**, povoada | B2 (e é o **ponto de encontro com a Frente A** — `Q-EQTL-CRED-01` usa o mesmo cofre) |
| **2** | **`src/sicoob/http.ts`** — os três verbos já medidos | B1 + B4 + item 1 |
| **3** | **o webhook do `ADR-0006`** | item 2 + a verificação empírica do sandbox |
| **4** | **TLS chegando ao Node**, ou proxy repassando o certificado de cliente | infraestrutura — ver abaixo |
| **5** | **endereço** (`npm run enderecos`, item 2.5 da fila) e **documento** do pagador (`Q-PAGADOR-01`) | operação — só o boleto depende deles |

**As armadilhas do item 2, todas já medidas:**

- **`valor` é decimal, não centavos.** A conversão é **por texto**, nos dois sentidos — e **falta a volta**: `src/dominio/centavos.ts` tem `reaisParaCentavos`, e `emReais` é **apresentação** (`R$ 1.234,56`, com separador de milhar), não serve para o JSON. `centavosParaReaisDecimal` precisa nascer com o adaptador;
- **`situacaoBoleto` é texto livre em português.** O que não casar cai em `desconhecida` — nunca em `em_aberto`, senão o sistema acha que ninguém pagou;
- **`endereco` é UMA string** lá, e três campos aqui. Quem concatena é o adaptador;
- **`pdfBoleto` e o `email` do pagador** — campos deles que não temos. Ignorados **de propósito**, não esquecidos. `pixTxid` não vem na resposta: ou sai de dentro do BR Code, ou fica nulo.

**O que o item 3 acarreta, e está escrito antes de alguém codar:**

- `auth: 'webhook'` **não** significa "sem autenticação" — significa autenticado por outro mecanismo, que é o mTLS. Rota marcada `webhook` sem verificação de certificado é um buraco com nome bonito;
- **recusa por ausência**: sem certificado verificado, `404`. O modo de falha do proxy que não repassa o certificado é silencioso e indistinguível de uma requisição legítima;
- o **usuário de serviço por tenant** entra por `scripts/provisionar-tenant.sql` — provisionamento, não migration —, com o papel **mínimo** que faz `escrever_carteira` passar, e **sem caminho de login**;
- o item 4 é a **única mudança de infraestrutura** que o `ADR-0006` pede, e é no **mesmo VPS do CRM**: a verificação de certificado de cliente vale para o nosso `server`, e a promessa de não alterar uma linha da configuração dele precisa continuar verdadeira.

## B.3 O que NÃO fazer nesta frente

- **não escrever `src/sicoob/http.ts` antes do sandbox.** A razão está registrada em `SICOOB-contrato-medido` §5, e é a `Q-PECA-NAO-PLUGADA-01` com o agravante de parecer pronto: os campos de identidade entram por fora e o primeiro `POST` real vai corrigir alguma suposição;
- **não cadastrar a URL do webhook terminada em `/pix`.** O Sicoob **acrescenta `/pix`** ao final — `…/api/pix` vira `…/api/pix/pix`, e é 404 garantido. Anotar a URL exatamente como digitada;
- **não assumir que o `client_secret` existe** antes do item B2;
- **não tratar a ausência de webhook como emergência.** `GET /boletos/situacao` é a consulta ativa diária do `PRD` §6 e existe justamente para capturar liquidação cujo webhook falhou — o dinheiro chega no dia seguinte, e a baixa manual funciona hoje.

---

# O que as duas frentes têm em comum

Duas costuras, e só duas:

1. **O item 1.1 da fila** — CPF/CNPJ de **24 pessoas**, hoje em **0 de 29**. Destrava `contrato.ativar()` (R9) **e** o login do portal da Equatorial. É o primeiro item de duas filas;
2. **A resolvedora do `ADR-0005`** — o cofre é o mesmo para a credencial da Sicoob (`Q-SICOOB-01`) e para o par UC + CPF + nascimento (`Q-EQTL-CRED-01`). Quem escrever a primeira entrega a segunda quase pronta.

**Fora isso, elas não se tocam** — e nenhuma das duas produz a primeira fatura.

---

# Se a pergunta for "o que faço hoje"

Quatro coisas independentes, todas de navegador ou de e-mail, nenhuma delas código:

1. **baixar a fatura de uma das 29 UCs** (A1) — é o que destrava código;
2. **pedir a fatura por e-mail de uma UC** (A2) — e ver se vem anexo ou link;
3. **mandar a rodada 7 ao dev do CRM** (A3);
4. **abrir o portal do Sicoob com a folha na mão** (B1) — a coisa mais barata da fila.

Depois delas há código para escrever nas duas frentes. **Antes delas, quase nada** — e o pouco que dá para escrever é a `Q-PECA-NAO-PLUGADA-01` de novo.
