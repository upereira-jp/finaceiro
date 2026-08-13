# SICOOB — o que fazer no portal

| Campo | Valor |
|---|---|
| **Escrita em** | 06/08/2026, a partir de **documentação** — não de navegação |
| **Preenchida em** | **13/08/2026**, pelo dono, no portal, e completada por vídeo de terceiro |
| **Status** | **Itens 1, 2 e 3 respondidos. Itens 4 e 5 continuam em branco** — e o porquê está escrito ao lado de cada um |
| **O que ela destrava** | `B1`, `B2` e `B4` do `PROXIMOS-PASSOS-2026-08-09.md` §B.1 |

> **A regra desta folha é a proveniência, e ela vale mais que o conteúdo.** Cada linha preenchida abaixo carrega de onde veio. O que foi *visto* e o que foi *suposto* não podem ficar iguais depois — e agora há uma terceira categoria, que é **vídeo de terceiro**: específica demais para ser invenção, secundária demais para ser medição nossa.

| Marca | Significa |
|:--:|---|
| 👁 | **VISTO por nós** no portal, em 13/08/2026 |
| 📹 | **VÍDEO DE TERCEIRO** — *"Configurando a API de Boletos/PIX do Sicoob (Bancoob) em nosso sistema"*, canal **Código UP Sistemas**, publicado em **05/07/2025**, 8m19s. Revenda de ERP, **não** o Sicoob. Confere com o que foi visto, e vai além dele |
| ❓ | **continua em branco**, com o motivo ao lado |

**Não pergunte, já está decidido:** onde mora o segredo (`ADR-0005`), como a Sicoob entra no webhook (`ADR-0006`), as URLs e o corpo do boleto (`SICOOB-contrato-medido-2026-08-05`).

---

## 1. Cadastre-se

`developers.sicoob.com.br` → abra o **Dashboard**.

👁 **Entrou, e o cadastro NÃO exigiu vínculo que ainda não existisse.** Era o achado mais caro previsto no `P1` do `PROXIMOS-PASSOS`, e ele não aconteceu — nesta direção. A premissa caiu por outro caminho, no item 3.

👁 **O login do portal é por SSO próprio, e ele NÃO é o endpoint de token da API:**

```
sso.sicoob.com.br/auth/realms/sicoob      ← login do PORTAL   (rhsso_type=pj)
auth.sicoob.com.br/auth/realms/cooperado  ← token da API      (contrato-medido §1)
```

**Os dois estão certos e são coisas diferentes** — um autentica *a pessoa* no portal, o outro autentica *o aplicativo* nas chamadas da Cobrança v3. Está escrito aqui porque a confusão é barata de cometer e cara de depurar: quem vir a URL do SSO e "consertar" o `http.ts` para o realm `sicoob` não recebe token, e a causa fica longe do sintoma.

URL exata do login, como veio:

```
https://sso.sicoob.com.br/auth/realms/sicoob/protocol/openid-connect/auth
  ?client_id=portal-developers&response_type=code&scope=openid
  &redirect_uri=https://developers.sicoob.com.br/portal/aplicativo&rhsso_type=pj
```

## 2. No Dashboard, anote

| | Resposta |
|---|---|
| `client_id` de sandbox | ❓ **só existe depois do aplicativo criado**, e o aplicativo exige o certificado (item 3). Ver 📹 abaixo |
| **Existe `client_secret`?** | 📹 **NÃO.** O vídeo copia **só o `client_id`** e diz *"o scope é em branco no caso da API COB"*. Nenhum secret aparece em passo nenhum do fluxo |
| URL base de sandbox | ❓ o vídeo vai **direto a produção** e não menciona sandbox. Não conferida |
| Endpoint de token | ❓ idem — mas ver o aviso do item 1 sobre os dois realms |
| **Baixe** a coleção Postman / OpenAPI | ❓ não baixada |

> **O `B2` está respondido, e ele confirma a hipótese do `ADR-0005`.** Sem `client_secret`, **o certificado É a credencial**, e a resolvedora do cofre devolve **A1 + `client_id`** — dois campos, não três. É a forma que o `P2` previa como possível e que muda o que se escreve, não só o que se guarda.
>
> **Proveniência honesta:** isto é 📹, não 👁. Vira 👁 no dia em que o aplicativo for criado e o painel mostrar (ou não) um segundo campo.

## 3. Abra a tela de cadastro de aplicativo

👁 **A tela foi alcançada.** 📹 **O fluxo tem três abas, e o certificado é exigido na segunda:**

| Aba | O que pede |
|---|---|
| **Informações** | nome do aplicativo + descrição (opcional) → **confirma número da conta e nome do cooperado** |
| **Segurança** | marcar que **não** é integração de **empresa parceira** → o `+` recebe o certificado |
| **APIs** | **Cobrança Bancária V3** |

📹 **Depois de criado, o aplicativo nasce `pendente`** e só vira `ativo` quando o titular **confirma o uso da API no aplicativo do banco, no celular**. O `client_id` sai daí.

| | Resposta |
|---|---|
| Dá para marcar **Cobrança Bancária v3**? | 📹 **sim** — é uma aba própria do fluxo |
| Dá para marcar **Pix (`cob`)**? | ❓ não visto. 📹 mostra outra coisa, e ela é mais importante — ver o aviso do Pix abaixo |
| Certificado pedido é **`.PFX` com senha + `.CER` Base-64**? | 👁 **a tela diz só "certificado digital"**, sem qualificar ICP-Brasil. O `+` abre o seletor de arquivos do sistema; o filtro aceito **não foi lido**. 📹 **o que se sobe é o `.PEM`**, gerado do `.PFX` por OpenSSL |
| Exige **dados da conta bancária** já aqui? | 👁 **SIM — e a conta da G3 JÁ APARECE.** A aba Informações confirma número da conta e nome do cooperado |

> ### ⚠️ A premissa do paralelismo CAIU, e ela estava escrita em dois documentos
>
> `PROXIMOS-PASSOS-2026-08-09.md` §B.1 (`B5`) e §B.5 afirmam que a conta PJ e o A1 *"correm em paralelo e **não bloqueiam o sandbox**"*. **Falso.** Não há aplicativo — nem de sandbox, até prova em contrário — sem **conta confirmada** e **certificado subido**.
>
> **O que isso custa à G3, hoje: quase nada.** A metade cara já estava resolvida sem ninguém perceber — 👁 **a conta PJ existe e o portal a reconhece.** Sobra o A1, que **não é emitido pelo Sicoob** e por isso continua comprável sem esperar mais ninguém.

> ### ⚠️ O Pix do boleto exige uma chave que a G3 não tem
>
> 📹 *"é necessário que o cliente crie uma chave Pix **aleatória** e mande para o **gerente vincular ao contrato** dele. Depois que essa chave Pix aleatória é vinculada ao contrato, a gente pode marcar o indicador de Pix."*
>
> A chave de produção da G3 hoje é **tipo `cnpj`** (`66714022000121`), e ela é a do **Pix estático** do documento. **São duas chaves diferentes**, com propósitos diferentes, e a segunda depende de um **ato do gerente da cooperativa** — não de tela nenhuma do portal.
>
> Isto não estava em lista nenhuma e entra como **`Q-SICOOB-PIXCHAVE-01`**.

## 4. Abra a tela de configuração de webhook

❓ **Não aberta.** O `P4` do `PROXIMOS-PASSOS` manda **não cadastrar nada** hoje — a rota existe desde a migration 16 mas ainda passa pelo autenticador de sessão, e o `ADR-0006` não foi implementado. Uma chamada da Sicoob não entraria.

| | Anote quando abrir |
|---|---|
| Além da URL, o que o campo aceita? | ☐ só a URL ☐ cabeçalho ☐ segredo ☐ outro: `______` |
| Menciona **mTLS / certificado de cliente / faixa de IP**? | ☐ sim, qual: `______` ☐ não |

## 5. Procure o contrato de cobrança

❓ **Não encontrados.** 📹 o vídeo mostra a confirmação de **número da conta e nome do cooperado** na criação do aplicativo, e **isso não é o contrato de cobrança** — são coisas distintas, e trocá-las é o modo de falha que o `contrato-medido` §4 nomeia.

Se não estiverem no portal, **é pergunta para a cooperativa** — não invente.

| | Anote aqui |
|---|---|
| `numeroCliente` | `________` |
| `numeroContratoCobranca` | `________` |
| `codigoModalidade` | `________` |

---

## O certificado: os três arquivos, e qual vai para onde

📹 O vídeo gera três arquivos a partir do `.pfx`, por OpenSSL:

```bash
openssl pkcs12 -in g3.pfx -nokeys          -out g3.pem   # SOBE NO PORTAL
openssl pkcs12 -in g3.pfx -clcerts -nokeys -out g3.crt   # nao precisamos
openssl pkcs12 -in g3.pfx -nocerts -nodes  -out g3.key   # NAO GERAR
```

**Ele gera os três porque o ERP dele consome `.crt` + `.key` separados. Nós não** — o `ADR-0005` decidiu que o A1 vai em base64 no cofre e o TLS do Node aceita `pfx` como `Buffer`.

| Arquivo | Destino | Por quê |
|---|---|---|
| **`.pem`** | **sobe no portal, uma vez, à mão** | é a parte **pública**. **Não é segredo, não entra no cofre**, e não tem nada a ver com a `credencial_ref` |
| **`.pfx` + senha** | **cofre**, resolvido para memória na chamada | `ADR-0005` decisão 5, intacta |
| **`.crt`** | — | alternativa ao `.pfx` para cliente HTTP que não aceita PKCS#12. O Node aceita |
| **`.key`** | **não gerar** | o `-nodes` **remove a senha da chave privada**. Chave privada em claro é exatamente o que o `ADR-0005` §110 descartou ao recusar o certificado em disco. Se for gerado por engano, apagar |

**A decisão do `ADR-0005` sobrevive inteira.** O que ela ganha é uma distinção que não estava escrita: existe um artefato **público** que é subido manualmente e **não** é segredo, e confundi-lo com o `.pfx` poria a chave privada num formulário web.

## A empresa parceira — o interruptor da aba Segurança

📹 O vídeo manda marcar que a integração **não** é de empresa parceira, porque quem integra é o titular da conta. **É o caso da G3**, e a recomendação de 13/08 é essa.

O que é **certo**, independente da semântica exata do Sicoob:

- o certificado carrega um CNPJ, e **quem tem a chave privada autentica como aquele CNPJ**;
- com certificado de terceiro, **a G3 não revoga sozinha** — vira conversa com o Sicoob;
- a **renovação anual** passa a depender do calendário do terceiro, e o vencimento derruba a emissão;
- o cofre da G3 guardaria **chave privada de outra empresa**: custódia sem controle.

O que **não** está medido: se a parceira precisa ser homologada antes, se o interruptor muda o contrato da API, e **se um certificado de parceira atende vários cooperados** — esta última importa para nós, porque no dia em que a G3 rodar o financeiro para outra empresa solar **a G3 vira a parceira**, e um certificado para vários cooperados é o oposto da credencial por tenant do `ADR-0005`. Registrado como **`Q-SICOOB-PARCEIRA-01`**.

---

## O que cada resposta muda aqui dentro

| Se… | Então… | Estado |
|---|---|---|
| **não houver `client_secret`** | o certificado *é* a credencial, e a resolvedora do `ADR-0005` devolve **A1 + `client_id`** | 📹 **é este o caso** |
| **der para marcar Pix (`cob`)** | a cobrança ganha `txid` e concilia sozinha | ❓ e agora tem pré-requisito: **chave aleatória vinculada pelo gerente** |
| **o certificado divergir** do `.PFX` + `.CER` | o `ADR-0005` precisa saber **antes** de alguém comprar o A1 | 📹 **não divergiu no essencial**: é `.PFX` A1, e o que sobe é `.PEM` em vez de `.CER` — mesma parte pública, outra extensão |
| **exigir conta bancária no cadastro** | sandbox deixa de ser paralelo à abertura da conta PJ | 👁 **exige — e a conta da G3 já existe**, então o efeito é nulo para nós |
| **o webhook não oferecer mTLS, cert nem IP** | vale o **plano B** já nomeado no `ADR-0006` | ❓ tela não aberta |
| **os três campos do item 5 não estiverem lá** | pergunta para a cooperativa | ❓ **não estavam** |

---

## ⚠️ Ao cadastrar o webhook

O Sicoob **acrescenta `/pix` ao final da URL**. Registrar `…/api/pix` faz o POST chegar em `…/api/pix/pix` — 404 garantido. **Anote a URL exatamente como digitou.**

---

## O que falta, em ordem

1. **Comprar o A1 e-CNPJ** ICP-Brasil pelo CNPJ **66.714.022/0001-21** — A1, **não A3**, arquivo `.pfx`/`.p12` com senha. É o **único** item externo restante;
2. gerar o **`.pem`** pelo comando acima (só ele);
3. criar o aplicativo: nome, **não é empresa parceira**, `.pem` no `+`, **Cobrança Bancária V3**;
4. **confirmar no app do banco** — sem isso o aplicativo fica `pendente` e o `client_id` não serve;
5. anotar o `client_id` e **conferir se aparece algum segundo campo** (é o que transforma o `B2` de 📹 em 👁);
6. perguntar à cooperativa os três campos do item 5, e a **chave Pix aleatória vinculada ao contrato** se o Pix no boleto for adotado;
7. **aí sim** o `src/sicoob/http.ts` pode ser escrito.

## O que o portal NÃO resolve

- ~~**A conta PJ na cooperativa singular**~~ — 👁 **já existe**, e o portal a reconhece;
- **O certificado A1** — é de AC ICP-Brasil, **não do Sicoob**, e não depende de mais ninguém;
- **A primeira fatura** — ela não depende de nada disto. O que a segura é planilha e decisão sua, não a Sicoob.
