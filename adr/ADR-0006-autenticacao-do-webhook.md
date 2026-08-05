# ADR-0006 — Como a Sicoob entra no webhook de liquidação

| Campo | Valor |
|---|---|
| **Status** | **Proposta** — aguarda decisão de Vinicius Leal (`CLAUDE.md` regra 10) |
| **Data** | 05/08/2026 |
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

## 2. O que NÃO está medido, e é o que governa a decisão

**Não sabemos o que a Sicoob suporta.** Não há certificado, não há credencial de sandbox e nenhuma linha da documentação da Cobrança v3 foi lida contra este problema — `Q-SICOOB-01`.

Isso não é detalhe de cronograma: **as opções da §3 não são todas exercíveis**. HMAC sobre o corpo exige que o emissor assine; mTLS exige que ele apresente certificado de cliente *e* que o TLS chegue até o Node; cabeçalho fixo exige que a configuração do webhook deixe adicionar um. Se a Sicoob só oferecer um dos três, a decisão está tomada pela outra ponta.

**Esta é a lição da `Q-VIEWSCRED-01`, e ela custou uma semana:** as duas views que respondiam quem vendeu existiam havia dois dias e ninguém comparava o que o outro lado expõe contra a nossa suposição. Então este ADR **não escolhe o mecanismo de autenticação antes de ler a documentação deles** — ele escolhe a *forma* que acomoda os três, e nomeia a leitura como pré-requisito.

---

## 3. Decisão 1 — o que autentica

| | Como é | Custo | Depende da Sicoob? |
|---|---|---|---|
| **A. Cabeçalho com segredo por tenant** | Um token de alta entropia, emitido por nós, guardado no cofre (`ADR-0005`), comparado em **tempo constante** | Baixo. Nada a calcular do lado deles | **Sim** — a configuração do webhook precisa aceitar cabeçalho customizado |
| **B. HMAC sobre o corpo cru + carimbo de tempo** | Assinatura sobre os **bytes recebidos**, com janela de tolerância | Médio, e é o padrão da indústria | **Sim** — só existe se eles assinarem |
| **C. mTLS** | O certificado de cliente da própria Sicoob | Alto. Exige que o TLS chegue ao Node, ou que o proxy repasse o certificado | **Sim**, e também da topologia do VPS |
| **D. Segredo no caminho da URL** | `/liquidacoes/webhook-sicoob/<segredo>` | Baixíssimo | **Não** — funciona com qualquer emissor |
| **E. Lista de IPs** | Faixa de origem | Baixo | Não |

**Recomendação: A como alvo, D como plano B declarado, E sempre — e nunca E sozinha.**

**Por que não D como primeira escolha, mesmo sendo a que funciona com qualquer emissor:** segredo em URL vaza por caminhos que ninguém controla — log de acesso do proxy, `Referer`, histórico de qualquer intermediário. Um segredo em cabeçalho não aparece em `access.log` por padrão; um no caminho aparece **sempre**.

**Por que B não é a recomendação apesar de ser o padrão:** ela é estritamente melhor que A — resiste a replay e prova integridade do corpo — e **só existe se a Sicoob assinar**. Recomendar o que talvez não exista empurraria a decisão para depois da leitura da documentação sem dizer o que fazer se a resposta for não. Se eles assinarem, **B substitui A** e este ADR ganha revisão; a forma da §5 não muda.

**E há uma consequência de implementação que precisa estar escrita antes de alguém codar:** se for B, a verificação é sobre os **bytes crus**, não sobre o JSON reserializado. Hoje `lerCorpo(req, max)` já entrega o corpo parseado. Assinar o que o `JSON.stringify` devolve compara uma coisa com outra e o modo de falha é dos ruins: falha sempre (visível) **ou** passa sobre uma sequência de bytes diferente da que chegou (invisível).

---

## 4. Decisão 2 — como o tenant é resolvido

Duas formas, e a diferença entre elas é **em que ordem se descobre o tenant e se autentica**.

**(i) Pelo payload.** O corpo traz o identificador do boleto, e `boleto` tem `tenant_id` — dá para resolver. **Mas o custo é uma leitura não autenticada**: para descobrir o tenant é preciso ler antes de verificar credencial, o que é um oráculo de enumeração (dá para descobrir se um `nosso_numero` existe pela diferença de resposta) e obriga toda falha a responder igual, em tempo igual.

**(ii) Pela credencial.** O segredo é **por tenant** e emitido por nós quando o `conector_cobranca` é configurado. Segredo → tenant é **uma** busca, e ela *é* a autenticação. O identificador do payload passa a ser resolvido **dentro** do contexto daquele tenant, pela RLS, como todo o resto do sistema.

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

**Recomendação: B**, e o argumento é o mesmo que este projeto já aplicou à navegação, à iconografia e à matriz de papéis: **vira dado, e dado tem teste**.

O que B torna possível e A não:

- **o inverso é afirmável.** Um teste percorre a tabela e afirma *"exatamente estas rotas escapam da sessão"*. Rota nova nasce `sessao` por ausência, e quem a tornar pública muda uma linha que a suíte lê;
- **o modo é legível onde a rota mora**, não a 300 linhas de distância, num `if`.

**E há um invariante que precisa nascer junto**, porque é o modo de falha desta mudança: `auth: 'webhook'` **não** significa "sem autenticação" — significa "autenticado por outro mecanismo". Uma rota marcada `webhook` que não passe pela verificação da §3 é um buraco com nome bonito, e o teste tem de afirmar as duas metades.

---

## 7. O que esta decisão destrava, e o que não

**Destrava:** o webhook real entrar. E, com ele, o critério de saída da F2 do `PRD` §10 — *"boleto liquidado no sandbox baixa a fatura automaticamente"* — passa a ser **testável**, que hoje não é.

**Não destrava:** boleto nenhum. Continuam faltando o certificado A1 e a credencial (`Q-SICOOB-01`, externo) e o `src/sicoob/http.ts` (que o `ADR-0005` acabou de permitir escrever). E **a §2 continua valendo**: enquanto a documentação da Cobrança v3 não for lida contra este problema, a Decisão 1 está escolhida pela metade.

**A consulta ativa diária já cobre o buraco enquanto isso**, e é por isso que nada disto é emergência: `GET /boletos/situacao` existe justamente para capturar liquidação cujo webhook falhou (`PRD` §6). Sem webhook o dinheiro não se perde — ele chega **no dia seguinte**, e a baixa manual continua funcionando hoje.

---

## 8. Questões que ficam abertas depois desta decisão

| Questão | Por quê |
|---|---|
| O que a Sicoob suporta de fato | §2. É pré-requisito da Decisão 1, e não depende de nós |
| Rotação do segredo do webhook | Mesma classe da rotação do A1, que o `ADR-0005` §6 já deixou aberta |
| O corpo cru, se for HMAC | `lerCorpo` entrega parseado. Preservar os bytes muda o servidor, não só a rota |
| Quem provisiona o usuário de serviço | Como o `bootstrap-plataforma-admin.sql`: provisionamento, não migration — e sem caminho de login |
| O que responder a uma chamada recusada | `401` diz "existe e você errou a credencial"; `404` não confirma nada. Para endpoint que recebe dinheiro, a segunda tem argumento |
