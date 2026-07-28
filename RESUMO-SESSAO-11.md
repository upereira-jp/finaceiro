# RESUMO-SESSAO-11 — 28/07/2026

| Campo | Valor |
|---|---|
| **Foco** | A paleta da G3 substituiu a provisória, e **o sistema foi para produção** — `https://financeiro.blackhaus.io`, no mesmo VPS do CRM, sem tocar no CRM |
| **Método** | Nada afirmado sem medição. **Duas hipóteses minhas foram derrubadas por medição durante a sessão**, e as duas mudaram o que eu ia fazer |
| **Resultado** | Deploy completo com TLS · 2 questões novas · `ADR-0005` proposto · 2 logins provisionados · CRM sincronizado · tarifa e comissão carregadas |
| **Commits** | `712507b`, `c5e10a2`, `e0f1db0`, `1996e89` — empurrados para `main` |

> # ESTADO ATUAL — fim de 28/07/2026
>
> | | |
> |---|---|
> | **No ar** | **`https://financeiro.blackhaus.io`** — SPA + API na mesma origem, TLS válido até 26/10, renovação automática testada |
> | **Isolamento do CRM** | medido antes e depois: `app.blackhaus.io` 200, servidor padrão :80 ainda 404, 9 processos PM2 intactos. **Nenhuma linha da configuração do CRM foi alterada** |
> | **Processo** | `financeiro.service` (systemd), usuário `financeiro` sem shell, **não roda como root** — o CRM roda |
> | **Node** | 22.20.0 **isolado** em `/opt/financeiro/node`. O `/usr/bin/node` v20 do CRM não foi tocado |
> | **Superusuário** | **não existe no VPS.** `DIRECT_URL` ficou de fora do `/etc/financeiro.env` de propósito |
> | **Logins** | **dois**, ambos `admin` (as quatro capacidades). Testados ponta a ponta contra produção |
> | **Dados** | 39 UCs, 4 usinas, tarifa e 10 regras de comissão carregadas. Conector idempotente em 3 passadas |
> | **O que segura a primeira fatura** | **39 contratos**, e não é código. Nunca foi o deploy |
>
> **A fila:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | `contrato_ativo` — 39 de 39 | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` — o que é "fatura cheia" | 🔴 | Vinicius |
> | `Q-WEBHOOK-01` — autenticação do webhook Sicoob | 🔴 | Vinicius |
> | `Q-SICOOB-01` — certificado A1 | 🔴 | Vinicius (externo) |
> | **`ADR-0005`** — onde mora o segredo | proposta | Vinicius |
> | `Q-AGENDA-01` — nenhum processo periódico existe | 🟡 | Vinicius |
> | Senha de root do VPS + chave SSH | — | Vinicius |

---

## 1. A paleta da G3, e os dois tokens que pagaram por si

A paleta provisória saiu; a da G3 entrou. **Nenhuma tela foi tocada** — a troca coube em um arquivo, que era exatamente o que o desenho prometia.

Duas medições mudaram decisão, e as duas são a restrição 1 do `tema.ts` (contraste ≥ 4.5:1):

```
branco sobre o #F39200 da marca ... 2.35:1  reprova
--ink  sobre o #F39200 ........... 8.09:1  passa   -> acentoTexto
#F39200 como texto de link ....... 2.35:1  reprova
#D97A00 como texto de link ....... 3.12:1  reprova
#A56300 (o mesmo laranja a 68%) .. 4.79:1  passa   -> acentoForte
```

O `acentoTexto` **já existia** esperando este caso: o comentário dele dizia que um `#fff` cravado no CSS seria "justamente o valor que ninguém lembra de trocar junto". Foi o que a marca da G3 provocou, na primeira troca de paleta da vida do projeto.

O `acentoForte` é novo. A paleta da G3 atribui o `#F39200` a *"botões, dot do tag, checkbox, hover de links"* — tudo preenchido ou transitório. **Nenhum deles é texto em repouso**, então o valor escurecido cobre um caso que a marca não endereçou, na mesma matiz.

**O que continua derivado está marcado `[derivado]` no arquivo:** os três estados semânticos (a paleta não traz cor semântica alguma) e o tema escuro quase inteiro — a única âncora entregue é o `--ink` como superfície escura.

Fica registrada uma adjacência para a G3 ver em tela: **a identidade é laranja e o âmbar do `nao_medido` é laranja.** São vizinhos por natureza. A restrição exige separação do **verde**, e essa está cumprida com folga; a separação do acento vem da forma — acento só aparece preenchido, estado só como pílula contornada com o texto dentro.

---

## 2. O bind em `0.0.0.0`, achado ao preparar o deploy

`src/http/servidor.ts` chamava `s.listen(porta)` sem host — o que em Node significa **toda interface**. Em VPS público isso publica a porta ao lado do proxy, e quem chega por ela chega **sem TLS**: a credencial daqui é um Bearer no cabeçalho, que viajaria aberto.

Passou a ser `127.0.0.1` por padrão, com `HOST` para quem precisar do contrário. Verificado em produção: `http://2.24.203.201:3000` **recusa conexão**.

O precedente estava ao lado e serviu de argumento: **o backend do CRM escuta em `0.0.0.0:8000` e é alcançável da internet.** Não herdamos o padrão — e isso foi comunicado para quem mantém o `intreply`.

---

## 3. O deploy, e a armadilha que quase peguei

O VPS é compartilhado com o CRM em produção. Fiz reconhecimento **somente leitura** antes de mudar qualquer coisa, e ele achou três coisas que mudaram o plano:

**O Node do servidor é v20.20.2 e o projeto exige ≥ 22.18.** O `--experimental-strip-types` só existe a partir do 22.6 — e o CRM roda nesse mesmo Node 20. Atualizar o Node do sistema seria mexer no CRM. Instalei o **22.20.0 isolado** em `/opt/financeiro/node`, referenciado por caminho absoluto no systemd. Nenhum PATH global mudou.

**O vhost do CRM declara `server_name app.blackhaus.io _;`.** Aquele `_`, combinado com a ordem de carga, faz dele o servidor padrão.

**E aqui estava a armadilha.** O `nginx.conf` faz `include sites-enabled/*`, e o glob expande em **ordem alfabética** — o primeiro bloco de cada porta vira o padrão. Um arquivo chamado `financeiro.blackhaus.io` carregaria **antes** de `intreply` (f < i) e tomaria esse papel **em silêncio**: host desconhecido passaria a cair no financeiro em vez do 404 do CRM.

Medi o comportamento **antes** (`HTTP 404`) e nomeei o arquivo **`zz-financeiro.blackhaus.io`**, para carregar depois. Medi de novo ao fim, inclusive após o certbot acrescentar o bloco 443: ainda `404`. O motivo está escrito dentro do próprio vhost.

**A escolha por systemd ficou mais certa do que quando eu a recomendei.** Eu tinha dado um argumento genérico; a medição deu um específico: **o CRM é 100% PM2**, com 9 processos. Um `pm2 restart all` ou `pm2 kill` de quem mantém o CRM não encosta num serviço systemd.

---

## 4. O superusuário não foi para o servidor, e não precisou ir

`src/generated/` está no `.gitignore`, então o deploy precisa rodar `prisma generate` — e o `prisma.config.ts` aborta se `DIRECT_URL` faltar. O `DIRECT_URL` deste projeto usa a role `postgres`, que **tem `BYPASSRLS`**: é o superusuário, e com ele todo o isolamento por tenant deixa de valer.

O próprio `.env.example` registrava que `prisma generate` **não conecta em banco nenhum** e que um valor descartável resolve. Usei um descartável.

**Consequência medida:** o `/etc/financeiro.env` (0600, root:root) tem 9 chaves e nenhuma delas é superusuário. Quem invadir o VPS encontra uma credencial que **respeita RLS**. É a diferença entre um incidente contido a um tenant e um incidente que expõe todos.

Migrations continuam saindo da máquina do dev, que é de onde já saíam.

---

## 5. O DNS, e duas hipóteses minhas derrubadas por medição

O registro `financeiro` levou horas para aparecer. Durante a espera eu errei duas vezes, e as duas foram corrigidas por medida, não por opinião.

**Primeira: "você está editando a zona errada".** Quando o painel foi colado, comparei as **TTLs** do painel com as do autoritativo — `app` 3600/3600, `relatorio` 300/300, inclusive o 300 incomum. Batiam exatamente. **A zona era a certa**, e minha hipótese caiu. Retirei a orientação.

**Segunda: "`relatorio` deve ser resquício abandonado".** Ao olhar só pelo IPv6 eu havia concluído que estava em hospedagem compartilhada. Está no VPS, pelos dois caminhos. E não é resquício: backend `intreply-reporting-mcp` na 8787, PM2 online há 4 dias com **0 restarts**, cert válido, e — o que mais convence — `proxy_buffering off` com timeout de 3600s, que é ajuste deliberado para conexão de longa duração. Ninguém configura isso por acidente.

O diagnóstico final do DNS foi por consulta **direta aos autoritativos**, sem cache: NXDOMAIN nos dois, com o controle `app` respondendo na mesma consulta. Depois o serial do SOA subiu de `2026072801` para `...02` **sem o registro aparecer** — o que provou que a regeneração acontecia e o registro não entrava. Em `...04` ele entrou.

Lição de método: **a impressão digital de uma zona são as TTLs.** Foi o que separou "painel errado" de "painel certo, publicação atrasada".

---

## 6. O que entrou em produção nesta sessão

| O quê | Como |
|---|---|
| **Usina `04`** | pelo caminho da aplicação — `app.login`, `withTenant`, `exigir('escrever_cadastro')`, policy e gatilho de auditoria. Ensaio, depois valendo |
| **Sincronização do CRM** | 3 passadas: 8+28, depois 4+1, depois **0+0**. Recusas caíram de **7 para 2** |
| **Tarifa e comissão** | seed idempotente, ensaio com `ROLLBACK` primeiro. 1 tarifa (1,130000 R$/kWh) + 10 regras |
| **Dois logins** | contas no Supabase Auth + provisionamento, testados ponta a ponta por HTTPS |

**O código `04` foi cadastrado literalmente, e não normalizado para `0004`.** Lido da view do CRM, a coluna traz `0001`, `0002`, `0003` e `04`. Como `codigo_geradora` é a chave pela qual o conector casa o espelho, normalizar faria o cadastro *parecer* certo e o ciclo seguinte recusar a usina de novo. **A inconsistência é do CRM e o conserto é lá** — enquanto não for, o espelho copia.

As 2 recusas que restam são `UC-DUP-01`: as UCs `000041446801282` e `000136464401264` em dois contratos de rateio cada. O conector se recusa a escolher, e está certo — é conferência contra o rateio oficial da distribuidora.

---

## 7. A prontidão contra produção, e por que o seed não a mudou

```
pode faturar ... NAO          pode repartir .. NAO

FALTA  contrato_ativo     39 de 39   [Vinicius + operacao]
ok     rateio              0 de 39
?      geracao_competencia 0 de  0
FALTA  vencimento         39 de 39   [operacao · Q-SPEC001-02]
?      tarifa_vigente      0 de  0
split  dono_da_usina       4 de  4   [operacao]
split  regra_de_repasse    4 de  4   [Vinicius]
?      regra_de_comissao   0 de  0
FALTA  cobranca_sicoob     1 de  1   [Q-SICOOB-01]
```

**Os números do `RESUMO-SESSAO-10` mudaram:** são **39 UCs, não 35**, e **4 usinas, não 3**. Não editei aquele relatório — é registro datado, e reescrever o corpo o falsificaria.

O `tarifa_vigente` continua `?` **depois** do seed, e isso não é falha: a camada conta *"distribuidora de UC contratada sem tarifa vigente"*, e não há contrato — universo zero. **Zero sobre universo vazio não é pronto.**

É a distinção que a paleta teve que preservar de manhã, aparecendo em produção à noite. Se esse `?` fosse verde, a tela diria "tarifa conferida" quando nada foi conferido. **As três camadas âmbar destravam juntas no instante em que o primeiro contrato existir** — e é por isso que contrato é o caminho crítico.

---

## 8. Os logins, e o buraco que eles revelaram

Havia **um** usuário. Agora há dois, ambos `admin` — o único papel que cobre as quatro capacidades (`ler`, `escrever_cadastro`, `escrever_carteira`, `administrar`).

| Nome | E-mail | Papel | Tier |
|---|---|---|---|
| Vinicius Leal | `leal@blackhaus.io` | `admin` | `plataforma_admin` |
| João Pedro | `jppereiraworkspace@gmail.com` | `admin` | — |

**O Vinicius trocou de e-mail sem perder autoria.** Ele já tinha conta (`lealvbl@gmail.com`) com **370 linhas de trilha** no nome dele. Como `auditoria.usuario_id` referencia a nossa tabela e não o `auth_user_id`, repontei o `usuario` existente para a conta nova: `usuario.id` intacto, 370 linhas preservadas, vínculo e tier preservados. A conta antiga não resolve mais para usuário nenhum — falha fechada.

**Verificado por código: nenhuma rota ou repositório exige o tier de plataforma.** O tier só liga a trilha de acesso de plataforma. Então `admin` é literalmente todas as funcionalidades; o tier é outro eixo — acesso entre tenants —, não uma funcionalidade a mais.

### O buraco: não havia caminho para o segundo usuário

O `bootstrap-plataforma-admin.sql` cria o **primeiro** admin de plataforma e afirma no cabeçalho que *"daí em diante o próprio app cria, com auditoria e com a matriz de papéis valendo"*. O `provisionar-tenant.sql` cria o tenant e o vínculo do primeiro admin.

**Nenhum dos dois cobre adicionar a segunda pessoa — e o app também não: zero rotas de gestão de usuário.** A frase do bootstrap descrevia uma intenção que nunca foi construída.

A consequência aparece exatamente agora, com a operação entrando para digitar 39 contratos: sem caminho, todo mundo usa a conta de uma pessoa só, e a regra 9 passa a gravar o nome errado em toda linha. **A trilha continua existindo e para de servir para o que existe.**

Daí o `scripts/provisionar-usuario.sql`, com **duas guardas**. A primeira é a do bootstrap: o `auth_user_id` tem que existir em `auth.users`. A segunda foi paga hoje: **o e-mail tem que estar confirmado.** O projeto tem `mailer_autoconfirm: false`, então conta criada por signup nasce com `email_confirmed_at` nulo e o GoTrue **recusa o login** — o provisionamento terminaria com sucesso, a linha existiria, o papel estaria certo, e a pessoa não entraria, com o erro aparecendo na tela de login sem nada apontando para a causa.

---

## 9. Duas questões novas, achadas percorrendo o caminho e não auditando spec

**`Q-WEBHOOK-01` 🔴** — `POST /api/liquidacoes/webhook-sicoob` está atrás da autenticação de usuário: toda rota exceto `/publico/config` exige Bearer resolvido para `auth_user_id`, mais o cabeçalho `x-tenant-id`. **A Sicoob não emite nem conhece nenhum dos dois.** Do jeito que está, o webhook real não entra. Três decisões acopladas: o que autentica, de onde sai o tenant, e se a rota sai de trás do autenticador. Vermelha pela taxonomia da §1 do `QUESTOES.md`: reescreve contrato de integração.

**`Q-AGENDA-01` 🟡** — **não existe processo periódico no sistema**, e o `PRD` §6 pede dois. As colunas da retentativa existem (`boleto.tentativas`, `ultimo_erro`) e ninguém as consome; a rota da consulta ativa existe e ninguém a chama. Webhook perdido sem consulta ativa é dinheiro recebido que o sistema nunca baixa — e a inadimplência passa a acusar quem pagou.

Placar da F2: **2🔴/5🟡 → 3🔴/6🟡**. Subiu, e é o método funcionando: as duas eram invisíveis até alguém percorrer o caminho da Sicoob ponta a ponta.

---

## 10. O `ADR-0005`, escrito como proposta

A `credencial_ref` da migration 18 aponta para um armazenamento cifrado que **não existe**. Sem ele, `src/sicoob/http.ts` não tem como ser escrito — não se sabe de onde ele lê o A1.

Medido no banco de produção, e **o grant é o dado que decide**:

```
supabase_vault 0.3.1 ... INSTALADO, schema vault existe, 0 segredos
pgsodium 3.1.8 ........ disponivel, nao instalado
vault.secrets ......... SELECT so para postgres e service_role
app_financeiro ........ NENHUM acesso
```

A última linha é propriedade a preservar: **quem tem a `DATABASE_URL` de runtime hoje não alcança o cofre.** Isso descarta de saída qualquer desenho que dê `SELECT` direto em `decrypted_secrets` ao runtime — que é o atalho mais documentado.

Recomendação: Vault + função `SECURITY DEFINER` amarrada a `app.current_tenant_id()`. **O argumento não é ela ser a melhor em isolamento** — gerenciador externo tem raio de dano menor. É que a `credencial_ref` é indireção: trocar o cofre depois não muda porta, migration nem repositório.

De quebra corrige uma suposição do `RESUMO-SESSAO-10`: **o A1 não precisa ir para o disco do VPS.** O TLS do Node aceita `pfx` como `Buffer` — e aquele disco é compartilhado com o CRM, o sistema que guarda cinco tokens em `text` puro.

**Não decidi.** Regra 10: a decisão tem dono nomeado.

---

## 11. O que NÃO foi feito, e por quê

| O quê | Por quê |
|---|---|
| **`/opt/financeiro/app` não é checkout git** | A conversão foi bloqueada por guarda de segurança (`git reset --hard` é destrutivo). Precisa da sua aprovação — sem ela, o deploy continua sendo transferência de árvore |
| **Senha de root não trocada** | É sua. Ela circulou nesta sessão e a do login do Vinicius é variação dela |
| **Nenhuma decisão de questão aberta** | Regra 10 |
| **Nada mexido no CRM** | Regra 4. O que achei foi comunicado, não corrigido |

---

# PARA A PRÓXIMA SESSÃO

## O caminho crítico é digitação, e ela já pode começar

O sistema está no ar e **não emite fatura** — pelo mesmo motivo de ontem, que nunca foi o deploy.

| O que falta | Quantos | Onde |
|---|---|---|
| **Contratos** | 39 | tela *Contratos* |
| **Dia de vencimento** | 39 | tela *Unidades* |
| **Dono de usina** | 4 | tela *Donos* |
| **Regra de repasse** | 4 | tela *Usinas* |

**A ordem importa:** fechar `contrato_ativo` é o que torna as três camadas âmbar mensuráveis.

Duas travas de decisão em cima disso: o **dia de vencimento** depende da `Q-SPEC001-02` (por UC ou por contrato?), e a **comissão** depende da `Q-FATCHEIA-01` — `fatura.flag_fatura_cheia` é `NOT NULL` **sem default**, de propósito.

## Três decisões suas, e nenhuma depende de terceiros

1. **`ADR-0005`** — o cofre. Destrava `src/sicoob/http.ts`
2. **`Q-WEBHOOK-01`** — como a Sicoob se autentica e como o tenant é resolvido
3. **`Q-FATCHEIA-01`** — em que mês começa a comissão de todo contrato novo

## Operação

- Trocar a senha de root do VPS e migrar para chave SSH
- Aprovar a conversão de `/opt/financeiro/app` em checkout git — depois disso o deploy vira `git pull && npm ci && npm run web:build && systemctl restart financeiro`
- Provisionar um login por pessoa **antes** de a digitação começar, senão a trilha nasce inútil

## Para o dev do CRM

- `codigo_geradora` inconsistente: `0001`, `0002`, `0003` e **`04`**
- `financeiro_ro` tem **escrita** em `net._http_response` e `net.http_request_queue` (`Q-PGNET-01`)
- O backend escuta em **`0.0.0.0:8000`**, alcançável da internet sem TLS
- Segredos em `text` puro na tabela `tenants` (`P8` §4) — pendente desde 24/07

## Como operar hoje

```bash
# na sua maquina
npm test                    # 443 verificacoes, 21 suites
git pull

# no VPS
systemctl status financeiro
journalctl -u financeiro -f
systemctl restart financeiro
nginx -t && systemctl reload nginx   # SEMPRE o -t antes: o CRM esta nessa config
```

**O `nginx -t` não é formalidade.** Um erro de sintaxe no reload derruba `app.blackhaus.io` junto.
