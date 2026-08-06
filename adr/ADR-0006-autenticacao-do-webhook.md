# ADR-0006 — Como a Sicoob entra no webhook de liquidação

| Campo | Valor |
|---|---|
| **Status** | ✅ **ACEITA em 06/08/2026** por Vinicius Leal — as **quatro** decisões respondidas. A 1 foi decidida **depois** de a medição de 06/08 tirar duas opções da mesa; ver a §2.3 |
| **Data** | 05/08/2026 · decidida em 06/08/2026 |
| **Decisor** | Vinicius Leal |
| **Resolve** | `Q-WEBHOOK-01` · o critério de saída da F2 no `PRD` §10 |
| **Base factual** | Código medido em 05/08/2026 — `src/http/servidor.ts`, `src/http/rotas.ts`, `src/db/contexto.ts`, `src/repos/liquidacao.ts` |
| **Afeta** | `src/http/servidor.ts` · a tabela de rotas · `conector_cobranca` · provisionamento de tenant |
| **Depende de** | `ADR-0005` ✅ (aceito em 05/08) — o cofre é onde o segredo do webhook vai morar |

> **A `Q-WEBHOOK-01` nomeia três decisões acopladas. São quatro.** A quarta apareceu ao percorrer o caminho de escrita em vez de ler a rota: **um webhook não tem usuário**, e tanto a trilha da regra 9 quanto o RBAC exigem um. Ela está na §5, e é a que muda o provisionamento.

---

## 1. O problema, medido

`POST /api/liquidacoes/webhook-sicoob` existe desde a migration 16 e **não tem como ser chamado pela Sicoob.** Medido no código em 05/08:

| Onde | O quê |
|---|---|
| `src/http/servidor.ts` | **Toda** rota exceto `GET /publico/config` passa por `o.autenticador(req)` → `auth_user_id`, e em seguida por `o.app.login(authUserId)`. A exceção é uma condição literal, escrita antes do autenticador |
| `src/http/servidor.ts` | O tenant sai do cabeçalho `x-tenant-id` |
| `src/http/rotas.ts:581` | O handler chama `emTenant(app, req, …)`, que é `app.withTenant(req.sessao, req.tenantProposto, …)` |
| `src/db/contexto.ts:79` | O contexto **exige `usuarioId` em forma de UUID** e o emite em `app.usuario_id` |
| `src/repos/liquidacao.ts:96` | `baixar()` exige `escrever_carteira` — papel, não presença |

A Sicoob não emite JWT do Supabase, não conhece o nosso `tenant_id` e não tem `usuario_id`. **Os quatro pontos acima barram, e cada um por uma razão diferente.**

O que já está resolvido e não se reabre: **a idempotência.** `liquidacao.baixar` é idempotente por `(tenant, origem, id_externo)`, e o mesmo evento chegando duas vezes devolve a baixa que já existe em vez de 409 — porque fila de webhook reprocessa por erro, e transformar repetição em erro faria a fila reprocessar para sempre.

---

## 2. O que a Sicoob suporta — e é isso que governa a decisão

**As opções da §3 não são todas exercíveis.** HMAC sobre o corpo exige que o emissor assine; mTLS exige que ele apresente certificado de cliente *e* que o TLS chegue até o Node; cabeçalho fixo exige que a configuração do webhook deixe adicionar um. Se a Sicoob só oferecer um dos três, **a decisão está tomada pela outra ponta**.

**Esta é a lição da `Q-VIEWSCRED-01`, e ela custou uma semana:** as duas views que respondiam quem vendeu existiam havia dois dias e ninguém comparava o que o outro lado expõe contra a nossa suposição. Então este ADR **não escolhe o mecanismo antes de saber o que existe** — ele escolhe a *forma* que acomoda os três.

> **Esta seção foi reescrita em 05/08, no mesmo dia.** A primeira versão dizia *"não sabemos o que a Sicoob suporta — nenhuma linha da documentação foi lida contra este problema"*, e foi verdade por algumas horas. A §2.1 é a leitura, e deixar o parágrafo antigo intacto acima dela seria a mesma classe que o `PATCH-citacoes` tratou e a `Q-ESCOPO-01` repetiu: **o corpo datado certo, o índice errado, e quem lê só o topo decide errado.**
>
> **O que a leitura mudou:** metade da pergunta foi respondida — o lado de saída está documentado. **A outra metade não é "não medida", é "não pública"**, e a diferença é de destinatário, não de esforço.

### 2.1 O que foi medido em 05/08, e o que a medição NÃO encontrou

A §2 foi escrita dizendo *"ninguém leu a documentação"*. **Lida no mesmo dia**, na documentação pública da Cobrança Bancária v3. O resultado divide em três.

**O que ficou sabido — o lado de SAÍDA, que é o `src/sicoob/http.ts`:**

| | |
|---|---|
| Produção | `https://api.sicoob.com.br/cobranca-bancaria/v3` |
| Sandbox | `https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3` |
| Autenticação | OAuth2 em **Keycloak** — `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token` |
| Cabeçalhos, em toda chamada | `Authorization: Bearer <token>` **e** `client_id: <client_id>` |
| Certificado | **ICP Brasil**, emitido para o **CNPJ do cooperado** quando PJ |

Isso confirma a premissa do `ADR-0005` sem mudá-la: a `credencial_ref` precisa resolver para **A1 + `client_id`**, e o `client_secret` pode nem existir — em Keycloak com mTLS o certificado *é* a credencial. Qual das duas formas a Sicoob usa é detalhe a confirmar contra o sandbox, não decisão nossa.

**O que a medição NÃO encontrou, e é o que esta ADR precisa:** **nada sobre como a Sicoob autentica a chamada ao NOSSO endpoint.** O material público descreve o cadastro da URL no portal e o escopo de webhook da aplicação, e não descreve cabeçalho, assinatura, certificado de cliente nem faixa de IP na direção de entrada.

**Isso não é "não tem" — é "não é público".** A diferença importa: a §3 continua sem poder ser fechada, e o pré-requisito deixou de ser *"ler a documentação"* e passou a ser **perguntar ao suporte da Sicoob ou abrir a aplicação no portal e ver o que a configuração de webhook oferece**. É uma pergunta com destinatário, não uma leitura pendente.

**A recomendação da §3 não muda por causa disto** — ela já estava desenhada para acomodar as três formas, e é exatamente para este resultado que ela foi desenhada assim.

### 2.2 Um achado de lado, que não é desta ADR mas nasceu da mesma leitura

O objeto `pagador` da inclusão de boleto é:

```
numeroCpfCnpj · nome · endereco · bairro · cidade · cep · uf · email
```

Três consequências, todas registradas em `src/dominio/planilha-enderecos.ts`:

1. **`endereco` é UMA string** — "Rua 87 Quadra 1 Lote 1 casa 1". Nós temos `logradouro`, `numero` e `complemento` separados, e quem concatena é o adaptador. Exigir logradouro **e** número no importador continua certo, e por um motivo melhor do que o que estava escrito: os dois alimentam a mesma string;
2. **`cep` sem máscara e `uf` de duas letras** batem exatamente com o que o importador já normaliza;
3. **`email` existe no payload e não existe no nosso tipo `Pagador`** (`src/sicoob/porta.ts`). Medido: **3 de 29** clientes faturáveis têm e-mail, e **29 de 29** têm telefone. Não é bloqueio — é lacuna nomeada para quando o adaptador for escrito.

### 2.3 — 06/08: a metade que faltava foi medida, e ela DECIDE a §3

A §2.1 dizia que o lado de entrada *"não é público"* e que o pré-requisito virava **perguntar**. Medido em 06/08 em fonte de terceiro — biblioteca de integração em produção contra a API real, não documentação do banco. **Duas coisas, e as duas fecham opções:**

| O que foi medido | Consequência |
|---|---|
| *"O POST não possui cabeçalhos especiais"*, `Content-Type: application/json` | **A opção A (cabeçalho com segredo) e a B (HMAC) deixam de ser exercíveis.** Não há o que comparar. A recomendação original — A como alvo, B se eles assinassem — **não pode ser implementada**, e teria sido descoberta na primeira chamada real |
| O manual oficial da API Pix: *"as notificações oriundas do Sicoob ao usuário recebedor trafegarão utilizando um canal **mTLS**"* | **A opção C é a que a outra ponta oferece.** A §2 previa exatamente isto: *"se a Sicoob só oferecer um dos três, a decisão está tomada pela outra ponta"* |

**E um terceiro achado, que não é de autenticação mas é de rota, e custa um 404 silencioso:** o Sicoob **acrescenta `/pix` ao final da URL cadastrada**. Registrar `…/api/pix` faz o POST chegar em `…/api/pix/pix`. Quem implementar a Decisão 4 precisa saber disso antes de declarar o padrão da rota.

> **Ressalva que fica no registro:** a documentação pública do Sicoob é reconhecidamente incompleta — *"em alguns tópicos é completamente ausente"* —, e a requisição de entrada continua **sem documentação do próprio banco**. O que sustenta a §2.3 é medição de terceiro mais o manual do BACEN. **Não é resposta recebida da Sicoob**, e a confirmação continua sendo contra o sandbox.

---

## 3. Decisão 1 — o que autentica

| | Como é | Custo | Depende da Sicoob? |
|---|---|---|---|
| **A. Cabeçalho com segredo por tenant** | Um token de alta entropia, emitido por nós, guardado no cofre (`ADR-0005`), comparado em **tempo constante** | Baixo. Nada a calcular do lado deles | **Sim** — a configuração do webhook precisa aceitar cabeçalho customizado |
| **B. HMAC sobre o corpo cru + carimbo de tempo** | Assinatura sobre os **bytes recebidos**, com janela de tolerância | Médio, e é o padrão da indústria | **Sim** — só existe se eles assinarem |
| **C. mTLS** | O certificado de cliente da própria Sicoob | Alto. Exige que o TLS chegue ao Node, ou que o proxy repasse o certificado | **Sim**, e também da topologia do VPS |
| **D. Segredo no caminho da URL** | `/liquidacoes/webhook-sicoob/<segredo>` | Baixíssimo | **Não** — funciona com qualquer emissor |
| **E. Lista de IPs** | Faixa de origem | Baixo | Não |

> ### ✅ DECIDIDO em 06/08: **C (mTLS) + E (faixa de IP)**
>
> A recomendação abaixo — *A como alvo, D como plano B* — **está superada pela §2.3 e o corpo dela fica intacto de propósito**: ele registra o que se sabia em 05/08, e reescrevê-lo apagaria a razão pela qual a medição do dia seguinte valeu a pena. **A e B não são exercíveis** (não há cabeçalho); **D foi preterida** por segredo em URL vazar em `access.log`, `Referer` e histórico de intermediário — o argumento que este ADR já fazia contra ela, e que continua valendo mesmo com ela tendo ficado mais fácil.
>
> **O que a decisão acarreta, e precisa estar escrito antes de alguém codar:**
>
> - **o TLS tem de chegar ao Node, ou o proxy tem de repassar o certificado.** É a única mudança de infraestrutura que este ADR pede, e ela é no **mesmo VPS do CRM** — o `README` afirma que ele roda *"sem alterar uma linha da configuração dele"*, e essa promessa precisa continuar verdadeira: a verificação de certificado de cliente vale para o nosso `server`, não para o dele;
> - **o modo de falha é silencioso e é o pior possível.** Proxy que não repassa o certificado entrega uma requisição indistinguível de uma autenticada. Então a rota **recusa por ausência**: sem certificado verificado, `404` — e há teste que afirma isso nos dois sentidos;
> - **não está medido que a Sicoob apresenta certificado de cliente de fato.** O manual do BACEN declara o canal; a biblioteca de terceiro fala de cabeçalhos e não de TLS. **A verificação é o primeiro webhook do sandbox**, e ela é pré-requisito de ligar a rota em produção — não de escrevê-la;
> - **a faixa de IP entra sempre e nunca sozinha**, como já dizia a recomendação original.
>
> **O plano B, se o sandbox mostrar que não há certificado de cliente:** este ADR ganha revisão e a escolha volta a ser entre D e E, com a evidência na mão. Não é reabertura — é a condição que a própria decisão nomeia.

**Recomendação original (05/08): A como alvo, D como plano B declarado, E sempre — e nunca E sozinha.**

**Por que não D como primeira escolha, mesmo sendo a que funciona com qualquer emissor:** segredo em URL vaza por caminhos que ninguém controla — log de acesso do proxy, `Referer`, histórico de qualquer intermediário. Um segredo em cabeçalho não aparece em `access.log` por padrão; um no caminho aparece **sempre**.

**Por que B não é a recomendação apesar de ser o padrão:** ela é estritamente melhor que A — resiste a replay e prova integridade do corpo — e **só existe se a Sicoob assinar**. Recomendar o que talvez não exista empurraria a decisão para depois da leitura da documentação sem dizer o que fazer se a resposta for não. Se eles assinarem, **B substitui A** e este ADR ganha revisão; a forma da §5 não muda.

**E há uma consequência de implementação que precisa estar escrita antes de alguém codar:** se for B, a verificação é sobre os **bytes crus**, não sobre o JSON reserializado. Hoje `lerCorpo(req, max)` já entrega o corpo parseado. Assinar o que o `JSON.stringify` devolve compara uma coisa com outra e o modo de falha é dos ruins: falha sempre (visível) **ou** passa sobre uma sequência de bytes diferente da que chegou (invisível).

---

## 4. Decisão 2 — como o tenant é resolvido

Duas formas, e a diferença entre elas é **em que ordem se descobre o tenant e se autentica**.

**(i) Pelo payload.** O corpo traz o identificador do boleto, e `boleto` tem `tenant_id` — dá para resolver. **Mas o custo é uma leitura não autenticada**: para descobrir o tenant é preciso ler antes de verificar credencial, o que é um oráculo de enumeração (dá para descobrir se um `nosso_numero` existe pela diferença de resposta) e obriga toda falha a responder igual, em tempo igual.

**(ii) Pela credencial.** O segredo é **por tenant** e emitido por nós quando o `conector_cobranca` é configurado. Segredo → tenant é **uma** busca, e ela *é* a autenticação. O identificador do payload passa a ser resolvido **dentro** do contexto daquele tenant, pela RLS, como todo o resto do sistema.

> ### ✅ DECIDIDO em 06/08: **(ii), pela credencial.**

**Recomendação: (ii).** Ela não tem leitura fora de contexto, não tem oráculo, e — o que decide — **fecha a confusão entre tenants por construção**: com (i), quem tivesse o segredo de um tenant poderia baixar fatura de outro se a ordem "verifica e depois resolve" fosse invertida por alguém que não conhecesse a armadilha. Com (ii) essa inversão não é expressável: não existe tenant antes da credencial.

---

## 5. Decisão 3 — quem é o "quem" da trilha, e do RBAC

**Esta é a que a `Q-WEBHOOK-01` não nomeava, e ela é a que muda o provisionamento.**

O contexto exige `usuarioId` em forma de UUID (`contexto.ts:79`), `liquidacao.baixar` exige o papel `escrever_carteira`, e a regra 9 exige *quem, quando, o quê, antes e depois* para escrita de dado de negócio. **A Sicoob não é ninguém dessas três coisas.**

| | |
|---|---|
| **A. Reusar o `auth_user_id` de uma pessoa** | É o que os scripts fazem hoje (`--auth-user`). **Descartar:** a trilha passaria a dizer que o Vinicius baixou uma fatura às 3h da manhã, e ela estaria mentindo. Trilha que mente é pior que trilha ausente |
| **B. Afrouxar o contexto para aceitar usuário nulo** | **Descartar:** abre a exceção no ponto único de emissão de contexto, que é a peça que o `ADR-0003` existe para manter sem exceção |
| **C. Usuário de serviço por tenant** | Uma linha de `usuario` que representa o conector, com vínculo de papel suficiente para `escrever_carteira`. **Recomendada** |

> ### ✅ DECIDIDO em 06/08: **C — usuário de serviço por tenant, sem caminho de login.**
>
> Acarreta **provisionamento novo por tenant**, na forma do `scripts/provisionar-tenant.sql`: script, não migration, e o papel é o *mínimo* que faz `escrever_carteira` passar — não `admin`.

**Recomendação: C.** A trilha passa a dizer a verdade — *o conector de cobrança da Sicoob baixou esta fatura* —, o RBAC continua sendo RBAC, e não há exceção no contexto. Há precedente no projeto: `scripts/provisionar-tenant.sql` já cria o vínculo admin e o `conector_crm` como provisionamento, não como migration.

**O que isso acarreta, e precisa ser dito:** o usuário de serviço **não pode ter caminho de login**. Ele existe como sujeito de trilha e de policy, não como conta. E o papel dele é o *mínimo* que faz `escrever_carteira` passar — não `admin`.

---

## 6. Decisão 4 — como a rota escapa da exigência de Bearer

Hoje o escape é uma condição literal em `servidor.ts`:

```
if (metodo === 'GET' && caminho === '/publico/config') return responder(res, configPublica());
```

| | |
|---|---|
| **A. Mais uma condição literal** | **Descartar.** Duas viram cinco, e o dia em que alguém acrescentar a sexta sem querer é o dia em que uma rota fica pública sem que nada acuse |
| **B. A rota DECLARA o modo** | Cada entrada da tabela diz `auth: 'sessao' \| 'publica' \| 'webhook'`, e o servidor despacha pelo que está declarado. **Recomendada** |

> ### ✅ DECIDIDO em 06/08: **B — a rota declara o modo.**
>
> E o invariante que nasce junto vale para a implementação: **`auth: 'webhook'` não significa "sem autenticação"**, significa "autenticado por outro mecanismo" — que agora é nomeado, é o mTLS da Decisão 1. Rota marcada `webhook` que não passe pela verificação de certificado é um buraco com nome bonito.
>
> **E a armadilha da §2.3 aterrissa aqui:** o Sicoob acrescenta `/pix` à URL cadastrada, então o padrão declarado tem de casar com o caminho que **chega**, não com o que se registrou.

**Recomendação: B**, e o argumento é o mesmo que este projeto já aplicou à navegação, à iconografia e à matriz de papéis: **vira dado, e dado tem teste**.

O que B torna possível e A não:

- **o inverso é afirmável.** Um teste percorre a tabela e afirma *"exatamente estas rotas escapam da sessão"*. Rota nova nasce `sessao` por ausência, e quem a tornar pública muda uma linha que a suíte lê;
- **o modo é legível onde a rota mora**, não a 300 linhas de distância, num `if`.

**E há um invariante que precisa nascer junto**, porque é o modo de falha desta mudança: `auth: 'webhook'` **não** significa "sem autenticação" — significa "autenticado por outro mecanismo". Uma rota marcada `webhook` que não passe pela verificação da §3 é um buraco com nome bonito, e o teste tem de afirmar as duas metades.

---

## 7. O que esta decisão destrava, e o que não

**Destrava:** o webhook real entrar. E, com ele, o critério de saída da F2 do `PRD` §10 — *"boleto liquidado no sandbox baixa a fatura automaticamente"* — passa a ser **testável**, que hoje não é.

**Não destrava:** boleto nenhum. Continuam faltando o certificado A1 e a credencial (`Q-SICOOB-01`, externo) e o `src/sicoob/http.ts`.

> **Este parágrafo dizia que a Decisão 1 estava "escolhida pela metade" enquanto a documentação não fosse lida.** Ela foi lida em 05/08 e **medida por outra fonte em 06/08** (§2.3), e a Decisão 1 está tomada. O que resta não é leitura nem escolha: é **uma verificação empírica** — que a Sicoob de fato apresenta certificado de cliente. Ela é pré-requisito de **ligar** a rota, não de escrevê-la, e acontece no primeiro webhook do sandbox.

**A consulta ativa diária já cobre o buraco enquanto isso**, e é por isso que nada disto é emergência: `GET /boletos/situacao` existe justamente para capturar liquidação cujo webhook falhou (`PRD` §6). Sem webhook o dinheiro não se perde — ele chega **no dia seguinte**, e a baixa manual continua funcionando hoje.

---

## 8. Questões que ficam abertas depois desta decisão

| Questão | Por quê |
|---|---|
| ~~**O que a Sicoob suporta na ENTRADA**~~ | ✅ **respondido em 06/08 pela §2.3**, e não pelo suporte: sem cabeçalho especial, e canal mTLS pelo manual do BACEN. **Fica aberto só o que nenhuma leitura resolve** — se a Sicoob apresenta certificado de cliente **de fato**. Verificação, não pergunta |
| **O TLS do VPS** | A Decisão 1 exige o certificado de cliente chegando ao Node ou repassado pelo proxy, **no mesmo VPS do CRM**. Quem configura, e como se prova que a verificação está ligada, é trabalho nomeado e não feito |
| **O `/pix` que a Sicoob acrescenta** | §2.3. O padrão da rota tem de casar com o caminho que **chega**, não com o registrado |
| `client_secret` existe? | §2.1. Em Keycloak com mTLS o certificado pode ser a credencial inteira. Confirma-se contra o sandbox, e muda o que a resolvedora do `ADR-0005` devolve |
| `email` no pagador | §2.2. Está no payload deles e não no nosso tipo `Pagador`. 3 de 29 clientes têm |
| Rotação do segredo do webhook | Mesma classe da rotação do A1, que o `ADR-0005` §6 já deixou aberta |
| O corpo cru, se for HMAC | `lerCorpo` entrega parseado. Preservar os bytes muda o servidor, não só a rota |
| Quem provisiona o usuário de serviço | Como o `bootstrap-plataforma-admin.sql`: provisionamento, não migration — e sem caminho de login |
| O que responder a uma chamada recusada | `401` diz "existe e você errou a credencial"; `404` não confirma nada. Para endpoint que recebe dinheiro, a segunda tem argumento |
