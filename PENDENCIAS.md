# PENDÊNCIAS — Financeiro G3

| Campo | Valor |
|---|---|
| **Para quem** | Quem quiser, em uma tela, a lista viva do que falta — e de quem é cada item |
| **O que é** | O **índice único** das pendências. Consolida e substitui os dois trackers datados que existiam soltos |
| **Substitui e apaga** | `PENDENCIAS-2026-08-05.md` e `PROXIMOS-PASSOS-2026-08-09.md` — vencidos, e agora removidos do repo |
| **NÃO substitui** | `QUESTOES.md` (registro datado, dono por entrada — regra 10) · `RETOMADA-2026-08-28.md` (onde tudo parou — a mais nova) · os `RESUMO-SESSAO-*` (memória datada). Estes continuam sendo a fonte; aqui é o **apontador** |
| **Data** | 14/08/2026 · rev. 17/08 · rev. 19/08 · rev. 21/08 · rev. 27/08 · rev. **28/08/2026** (noite, e de novo na madrugada) |
| **Estado da suíte** | Sem banco: `typecheck` + `documento` + `brcode` + `dominio` + `web` → **`EXIT=0`, 2.420 linhas `ok`** (28/08, madrugada), e desde 27/08 com as verificações de `tests/sicoob-http.ts` — hoje **63** — dentro do `test:dominio`. Fora da suíte, contra a Sicoob de verdade: `npm run ensaio-sicoob` → **6 de 6**. `test:repos` e `test:isolamento` **não rodam nesta VPS** (exigem PostgreSQL local) |
| **Produção** | `financeiro.blackhaus.io` · **35 migrations no ar** (a 34 em 21/08, a **35 em 28/08**) · a **36 escrita e NÃO aplicada** · Pix estático e boleto importado no ar · central de ajuda em toda tela · **a conta unificada lida já vira cobrança** (migration 34) · o conector roda sozinho a cada 15 min pelo `financeiro-ciclo.timer`, e desde **28/08** a agenda de cobrança roda sozinha em três timers (`fila` 5 min · `consulta` e `certificado` diárias) |

> ## A única pendência do repositório é o certificado A1.
>
> **28/08/2026 — a frase voltou a ser verdadeira, depois de deixar de ser por algumas
> horas:** o `ADR-0006` era código nosso e estava por escrever. Foi escrito no dia, com
> as duas decisões que faltavam respondidas pelo dono na mesma tarde. O que resta dele é
> infraestrutura e um número que só o Sicoob informa. Ver o bloco de 28/08, fim da tarde.
>
> Medido e não afirmado: **o único código que falta é `src/sicoob/http.ts`, e ele é
> exatamente o que o A1 destrava.** Tudo o mais que era código a escrever foi escrito.
> O restante desta lista **não é pendência de código** — é insumo da operação e
> decisão com dono nomeado, e pela **regra 10** não é do implementador fechar.

> ### 21/08/2026 — a frase acima continua verdadeira, e agora há uma decisão do mesmo tamanho ao lado dela
>
> A verificação ponta a ponta do **ciclo do cliente** — as 12 fases, do recebimento da
> conta da distribuidora ao repasse — foi feita contra produção e está em
> **`PLANO-ciclo-do-cliente-2026-08-21.md`**. Ela confirma o parágrafo acima
> (**nenhuma das 12 fases está quebrada por defeito de código**) e acha uma bifurcação
> que nunca foi decidida: **existem dois caminhos de fatura e eles não se encontram**.
> O documento que o cliente recebe — o de 7 faixas — é o único dos dois que **não
> consegue pagar o dono da usina**, porque não vira `fatura`, não vira liquidação e não
> vira repartição.
>
> É decisão, não código, então pela regra 10 vale a mesma frase: não é do implementador
> fechar. Registrada como **`Q-CICLO-01` 🔴** e mais quatro no `QUESTOES.md` §5.
>
> **✅ Fim do mesmo dia — o dono decidiu e a junção foi construída.** *"vamos com o
> caminho da fatura unificada"*. Entrou a **migration 34** (a coluna que liga as duas
> metades), a triagem pura com 42 verificações, o `INSERT ... SELECT` que copia os
> centavos de dentro do banco, duas rotas e o botão *"gerar cobrança"* na tela. **O
> motor de repartição não mudou uma linha** — ele já tinha a forma exata da conta
> unificada, e isso foi medido antes de escrever.
>
> **✅ A migration 34 foi APLICADA em 21/08/2026**, com a `DIRECT_URL` de dono, depois
> da guarda de identidade (`conferir-banco-alvo identidade`) confirmar o banco. Conferida
> **no catálogo** e não na mensagem do comando: a coluna, a FK composta
> `(tenant_id, fatura_id) → fatura(tenant_id, id)` e o índice **cheio** estão os três
> presentes, e `migrate status` diz *"Database schema is up to date"*. Deploy feito na
> sequência — build do frontend e `systemctl restart`, com backup do bundle antes.
>
> **E a junção foi provada ponta a ponta**, o que não era possível com o dado de
> produção: há zero contratos, e `fatura.contrato_id` é `NOT NULL`. O
> `npm run ensaio-juncao` cria originador, contrato e conta lida como **fixture**,
> fatura de verdade contra o schema real, confere as doze coisas que importam e
> termina em **ROLLBACK** — a última verificação conta as quatro tabelas depois da
> transação e falha se qualquer uma tiver linha. **12 de 12, e produção intacta.**

> ### 27/08/2026 — o A1 chegou, e a frase do topo deixou de ser verdadeira em UM ponto
>
> **O código foi escrito.** `src/sicoob/http.ts` existe, e com ele o `cofre.ts` (a
> resolvedora do `ADR-0005`, que nunca tinha sido implementada), a **migration 35**, o
> `scripts/certificado.ts` e o `scripts/ensaio-sicoob.ts`. O composition root liga o
> adaptador **real** por padrão, com `COBRANCA=desligada` como interruptor de emergência.
>
> **Duas das três razões para não escrevê-lo caíram, e a segunda caiu por uma medição
> que ninguém tinha tentado:** o sandbox da Sicoob **responde**. `GET /boletos` devolve
> 200, `POST /boletos/{nn}/baixar` devolve 204 — e `POST /boletos` devolve **sempre**
> 400 com o exemplo de erro, para corpo vazio e para corpo bem formado. Ele é **mock
> estático**. Por isso o `Transporte` do adaptador é injetável: 51 verificações exercem
> o caminho de sucesso contra transporte próprio, e 6 exercem TLS, cabeçalho e parsing
> contra a Sicoob de verdade. **A terceira razão continua de pé** — a primeira chamada
> real vai corrigir alguma suposição —, e cada suposição virou `SUPOSICAO:` no código e
> entrada no `QUESTOES.md`.
>
> **A pergunta que estava aberta desde 05/08 fechou por fonte primária.** O realm
> `cooperado` declara `tls_client_auth` e `tls_client_certificate_bound_access_tokens:
> true`: **não há `client_secret`**, o certificado É a credencial, e o token nasce atado
> a ele.
>
> **E apareceu uma armadilha que não estava em documento nenhum.** O Node 22.20 embute
> OpenSSL 3.5 e **recusa** `.pfx` com cifragem antiga (RC2-40 + SHA1) — que AC brasileira
> ainda entrega — enquanto o `openssl` do sistema abre o mesmo arquivo sem reclamar. O
> certificado passaria em toda conferência manual e falharia **só** no processo que emite
> boleto. `npm run certificado -- normalizar` conserta, e o adaptador reconhece o erro
> pelo código em vez de vazar `ERR_CRYPTO_*`. Medido em `SICOOB-medido-2026-08-27.md`.
>
> **O que falta agora não é código, e não é do repositório fechar (regra 10):** o
> aplicativo no Portal Developers (precisa do `.pem`, e a ação é humana), o `client_id`
> autorizado no App Sicoob, e os **campos de identidade do cooperado** — que agora
> o banco cobra: `conector_ativo_tem_identidade` impede ligar conector Sicoob sem eles.
> *(rev. 28/08: são **dois**, `numeroCliente` e `codigoModalidade` — a migration 36 tirou o
> `numeroContratoCobranca` da exigência, porque a API o declara opcional.)*

> ### 28/08/2026 — está tudo no ar, e o cofre tem o certificado dentro
>
> **A migration 35 foi aplicada e conferida NO CATÁLOGO**, não na mensagem do comando:
> `4 colunas, 2 constraints, cofre_acesso_log com policy, e a resolvedora`. Junto veio a
> resposta da única pergunta que decidia se algum boleto sairia um dia —
> **`cofre OK — a resolvedora e de "postgres", que enxerga vault.decrypted_secrets`**.
> Um `SECURITY DEFINER` com dono cego para o cofre teria passado em tudo e falhado só na
> primeira emissão.
>
> **O certificado A1 está no cofre e fora do disco.** `segredos no cofre hoje: 1`, e os
> dois `.pfx` foram para o `shred`. Ele entrou **sem `client_id`**, de propósito e com
> opt-in explícito: entre meia credencial no cofre e o certificado inteiro no disco de
> uma VPS compartilhada com o CRM por semanas, a segunda é pior — e não há estado em
> que isso emita boleto pela metade, porque a resolvedora recusa nomeando o que falta.
> Quando o portal existir: `certificado -- client-id sicoob-g3-a1 <id>`, sem reenviar
> o certificado.
>
> **O isolamento foi exercido contra o banco real**, com `ROLLBACK` e sem deixar rastro:
> `npm run ensaio-cofre` fecha 8 de 8. O backend foi reiniciado e roda como
> `app_financeiro_login`, sem BYPASSRLS, com o client cobrindo **38** tabelas — eram 37,
> e a 38ª é a `cofre_acesso_log`.
>
> **Três defeitos apareceram só ao executar, e os três estão consertados com teste:** o
> A1 da G3 é do tipo antigo que o Node recusa (a armadilha medida em 27/08 não era
> hipótese); a conferência de CNPJ acusava o certificado CERTO, porque lia o CNPJ da AR
> emissora em vez do `CN`; e **o workflow de migration disse "aplicadas" tendo aplicado
> nada**, porque o runner clona o repositório e a 35 só existia no disco de quem a
> escreveu — com a conferência de catálogo presa numa migration de dez dias antes.
> Detalhe de cada um em `SICOOB-medido-2026-08-27.md` §8.
>
> **O que falta continua sendo o que depende de terceiros:** o aplicativo no portal, o
> `client_id` autorizado, os três números da cooperativa, e a autenticação do webhook
> (`ADR-0006`) — sem ela a liquidação não baixa sozinha.

> ### 28/08/2026, tarde — a agenda ganhou host, e a primeira rodada achou um campo vazio
>
> **O motor da agenda existe desde 30/07 e até hoje nada o chamava.** Não era lacuna
> esquecida: o `PRD` §3 deixou o agendamento *"à escolha do host"* e a regra 10 proíbe
> quem implementa de escolher por quem decide — por isso `scripts/agenda.ts` roda uma
> vez e sai, e o exemplo de cron dentro dele dizia, com todas as letras, que era
> *"sugestão e não configuração aplicada"*. **O dono escolheu em 28/08: o host é o
> systemd desta VPS.** Três unidades novas, versionadas em `deploy/` como as do ciclo:
>
> | Unidade | Cadência | De onde vem o número |
> |---|---|---|
> | `financeiro-agenda-fila` | **5 min**, em `:02/5` | é a `base` da política de retentativa (`Q-AGENDA-02`, 300 s). 15 min triplicaria calado uma base já decidida; `:02` evita disputar o pool com o ciclo do CRM |
> | `financeiro-agenda-consulta` | **diária**, 06:17 UTC | *"consulta ativa **diária**"* é palavra do `PRD` §6 |
> | `financeiro-agenda-certificado` | **diária**, 06:07 UTC | só lê. Dez minutos antes da consulta, para a causa aparecer antes do sintoma |
>
> **As três foram rodadas à mão antes de ligar o timer**, e é daí que sai o resto deste
> bloco. `list-units --failed` segue **vazio**.
>
> **`sem_conector` deixou de ser vermelho no systemd, e não com `|| true`.** Sem conector
> ativo — que é o estado de hoje e continua até o portal existir — a rodada recusa antes
> de criar linha em `agenda_execucao`. Isso saía como exit 1, e dois timers em `failed`
> por meses transformariam a única superfície de alarme da máquina em ruído. Agora sai
> como **3**, com `SuccessExitStatus=3` no unit: o **1** continua significando o que
> significava, e o motivo continua impresso no journal.
>
> **E a primeira conferência do certificado achou o que ninguém tinha olhado:**
> `nivel ...... sem_certificado`. O A1 está no cofre desde de manhã, mas
> **`conector_cobranca.certificado_expira_em` está nulo** — e o aviso dos 30 dias não
> tem de onde contar. Não é bug: a data é o quarto campo do mesmo `UPDATE` que os três
> números da cooperativa, e o `guardar` já a pedia. A diferença é que **esta pode ser
> preenchida hoje**, sem esperar o portal: `17/08/2027`, na aba **Conector Sicoob**
> (o campo existe na tela — `web/src/telas/cobranca.tsx`). Enquanto ela for nula o
> sistema **não diz que está ok**, e é o comportamento certo.
>
> **O que isto NÃO fecha:** a consulta ativa é, hoje, a única porta automática de baixa,
> e ela é diária. A porta que falta é o `ADR-0006` — e essa é código nosso, não insumo
> de terceiro.

> ### 28/08/2026, fim da tarde — a metade do `ADR-0006` que não dependia de ninguém foi construída
>
> **A Decisão 4 saiu inteira: a rota declara como é autenticada.** Até hoje o único
> escape da sessão era um `if` literal dentro de `servidor.ts`, e a ADR já dizia por que
> isso não escala — *"duas viram cinco, e o dia em que alguém acrescentar a sexta sem
> querer é o dia em que uma rota fica pública sem que nada acuse"*. Agora `auth` é campo
> da rota, `sessao` **por ausência**, e `GET /publico/config` deixou de ser condição para
> virar linha de tabela. O ganho é o inverso: `tests/rotas-auth.ts` afirma **exatamente
> estas duas rotas escapam da sessão, e mais nenhuma** — sobre as **116** da tabela.
>
> **A verificação de origem existe e recusa por ausência.** `src/http/origem-do-webhook.ts`
> é a Decisão 1 (mTLS + faixa de IP) em forma executável, e ela **não tem default
> permissivo em nenhum campo**: ambiente vazio recusa, IP sem certificado recusa,
> certificado sem IP recusa. O cabeçalho `ssl-client-verify` do proxy **só vale vindo da
> loopback** — é a linha que fecha o modo de falha que a própria ADR nomeia, *"proxy que
> não repassa o certificado entrega uma requisição indistinguível de uma autenticada"*.
> Recusa sai como o **404 genérico**, byte a byte igual ao de rota inexistente: medido no
> ar depois do deploy, e o motivo real fica no journal. **29 verificações**, dentro do
> `test:dominio`.
>
> **E a construção achou o que a leitura não tinha achado: a Decisão 2 tinha ficado sem
> mecanismo.** Ela resolve o tenant *"pela credencial"* — decidido na manhã de 06/08,
> quando a credencial era um segredo **nosso**, por tenant. Na mesma data a Decisão 1
> virou mTLS, e **o certificado do Sicoob é um só para todos os nossos tenants**: ele
> prova origem e não identifica tenant nenhum. Aberta como `Q-WEBHOOK-TENANT-01` 🔴 e
> **decidida pelo dono no mesmo dia** — o tenant vai no **caminho da rota**, que é
> identificador e não credencial. `POST /liquidacoes/webhook-sicoob/:tenant`.
>
> **Com ela respondida, a Decisão 3 também coube no dia.** O usuário de serviço tem
> `auth_user_id` **derivado do tenant** por UUIDv5 — nenhuma coluna nova, nenhuma
> migration, e nada para guardar: as duas pontas chegam ao mesmo número a partir do mesmo
> tenant. Ele **não tem caminho de login** porque o uuid existe na nossa tabela `usuario`
> e não existe no Supabase Auth, e o papel é `cobranca`, o **mínimo** que faz
> `escrever_carteira` passar — a suíte lê a matriz de `contexto.ts` e afirma que nenhum
> papel menor serve. `scripts/provisionar-servico-de-cobranca.sql` cria as duas linhas, e
> `npm run servico-de-cobranca -- --tenant <uuid>` imprime o comando pronto **e a URL a
> cadastrar no portal**. **42 verificações** no total, e a UUIDv5 é conferida contra o
> vetor da RFC 4122 — sem ele, o teste só provaria que a função concorda consigo mesma.
>
> **Nada disso abriu porta, e cada recusa diz uma coisa diferente:** origem não
> verificada → **404 genérico**; tenant malformado → o mesmo 404; usuário de serviço
> ausente → `503 ServicoDeCobrancaNaoProvisionado`. Medidos no ar depois do deploy.
>
> **O que falta do `ADR-0006` não é mais código nosso:** a faixa de IP que só o Sicoob
> informa (`WEBHOOK_IPS`), o TLS chegando ao Node ou repassado pelo proxy — as duas linhas
> de `nginx` estão no `.env.example` —, rodar o provisionamento, e a **verificação
> empírica** de que eles apresentam certificado de cliente, que a ADR §7 já dizia ser
> pré-requisito de **ligar** e não de escrever.

> ### 28/08/2026, noite — o CONTRATO chegou, e ele corrigiu dois defeitos e fechou uma vermelha
>
> O dono achou o payload do webhook na documentação do banco e a **coleção Postman oficial**
> da Cobrança v3. Em uma tarde isso valeu mais que o chamado inteiro que eu ia abrir.
>
> **O tradutor do webhook existe** (`src/sicoob/webhook.ts`, 25 verificações). A porta
> estava autenticada desde a tarde e o corpo não era compreendido: a rota entregava
> `req.corpo` direto para `liquidacao.baixar()`, que espera os NOSSOS nomes de campo.
> Agora `nossoNumero` acha a fatura, `numeroIdentificadorBaixa` é a idempotência,
> `valorPagamento` vira centavos e o excedente sobre `valorBoleto` vira juros.
>
> **E o dinheiro chega como float — o corpo do webhook passou a ir CRU até o tradutor.**
> `"valorPagamento": 407.41` é literal JSON, e `JSON.parse` entrega um double. O detalhe
> que quase passou: **`407.41 * 100` dá 40741 exato**. Não erra. Erram `0.07 * 100`
> (7.000000000000001) e `8.29 * 100` (828.9999999999999) — e é isso que torna o caminho
> ingênuo perigoso em vez de óbvio: ele acerta o número do exemplo e erra outro, meses
> depois. O `jsonComDinheiroEmTexto` que o adaptador já usava saiu do `http.ts` para um
> módulo próprio e agora serve os dois.
>
> **Dois defeitos reais do adaptador, dos que só apareceriam no primeiro boleto:**
>
> | O quê | Consequência |
> |---|---|
> | `pagadorSicoob` mandava `endereco: null`, `bairro: null`, `cep: null` | A coleção diz: *"não é permitido enviar um campo com valor nulo"*. Com **0 de 29** endereços de pagador preenchidos, o corpo com nulos era o caminho **garantido** |
> | Nenhum teto de tamanho nos campos do pagador | Deles: nome 50, endereço 40, bairro 30, cidade 40. Um endereço longo faria a API recusar o boleto inteiro |
>
> Os dois estão corrigidos, com 9 verificações novas em `tests/sicoob-http.ts`.
>
> **`Q-EMISSAO-01` 🔴 FECHOU sem uma linha mudar:** `identificacaoEmissaoBoleto`
> `1 - Banco Emite` / `2 - Cliente Emite`, distribuição idem. O `2` e `2` que o adaptador
> mandava era o par certo, e agora por fonte primária.
>
> **E três abriram, mais uma que virou escolha:**
>
> - **`Q-CONTRATOCOB-01` 🔴** — `numeroContratoCobranca` é **opcional**, *"somente para
>   cooperados que possuem mais de um contrato"*, e a nossa constraint exige os três. Um
>   cooperado de contrato único **não consegue ativar o conector**. Também encolhe a
>   pergunta à cooperativa: `codigoModalidade` já está medido (`1 - SIMPLES COM REGISTRO`),
>   então resta o `numeroCliente` e *"temos mais de um contrato?"*;
> - **`Q-WEBHOOK-MOVIMENTO-01` 🟡** — o `tipoMovimento: 7` do webhook não está no enum de
>   movimentação (1 a 6). São enums diferentes, e só o 7 vira baixa — o resto é ignorado
>   nomeando. A coleção sustenta a escolha: ali *Liquidação* e *Baixa* são movimentos
>   distintos, e baixa inclui decurso de prazo e pedido do cedente, que não são pagamento;
> - **`Q-WEBHOOK-ESTORNO-01` 🟡** — `cancelamentoBaixa` existe no payload e o sistema não
>   tem estorno. Ignorado e nomeado, para tratar à mão;
> - **`Q-ESPECIE-01`** deixou de ser suposição e virou escolha: a lista tem **`FAT - Fatura`**
>   ao lado do `DM - Duplicata Mercantil` que mandamos hoje. O papel da G3 é fatura de
>   energia. É decisão fiscal, e trocar depois do primeiro boleto deixa a carteira com duas
>   espécies.
>
> **O que a coleção NÃO mudou:** os escopos. Os nossos quatro saíram do `scopes_supported`
> do realm, medido em 27/08 — a coleção usa a outra família (`boletos_inclusao`), e as duas
> existem entre os 29. Fonte primária do servidor de autorização vence documento de exemplo.

> ### 28/08/2026, madrugada — a vermelha da noite fechou, e ela era maior que a migration
>
> **`Q-CONTRATOCOB-01` 🔴 FECHOU.** O dono escolheu **(a)**, que é o que a documentação
> sustenta: `numeroContratoCobranca` é **opcional** — *"somente para cooperados que
> possuem mais de um contrato"* —, e exigi-lo impedia **o cooperado de contrato único de
> LIGAR o conector**.
>
> **O que a medição mostrou, e é a razão de o conserto não ter sido uma linha de SQL:**
> o campo era obrigatório em **quatro** lugares, e a migration era só o primeiro.
>
> | Camada | O que era | O que é |
> |---|---|---|
> | `conector_ativo_tem_identidade` | exigia os três para ligar | **migration 36** — exige `numero_cliente` e `codigo_modalidade` |
> | `cofre.ts` (o tipo) | `numeroContratoCobranca: number` | `number \| null` |
> | `cofre.ts` (a recusa) | `CredencialIncompleta` cobrava o campo | saiu da lista, e a mensagem diz por quê |
> | `http.ts` (o corpo) | ia **sempre** | **spread condicional** — some quando é nulo |
>
> **A quarta é a que teria mordido.** Afrouxar só o banco e o tipo faria o adaptador
> mandar `numeroContratoCobranca: null` — e a coleção é literal: *"não é permitido enviar
> um campo com valor nulo"*. É o **mesmo defeito do `pagadorSicoob`** consertado horas
> antes, na mesma noite, pelo mesmo motivo. O idioma certo já estava três linhas abaixo,
> no `numeroContaCorrente`.
>
> **A migration 36 nasce `NOT VALID` pela mesma razão da 35** — e aqui isso não esconde
> risco novo: a constraint nova é **estritamente mais fraca** que a antiga, então não há
> linha que a antiga aceitava e a nova recusa.
>
> **Suíte: `EXIT=0`, 2.420 linhas `ok`** (eram 2.417). As três novas provam o corpo sem o
> campo, e uma delas **varre o corpo cru atrás de qualquer `null` sobrando** — é a que
> pega o próximo campo opcional que alguém esquecer de tornar condicional. E a **`K8`** no
> `ensaio-do-cofre` prova o mesmo contra o banco de verdade, para que ninguém recoloque a
> exigência sem perceber.
>
> ⚠️ **A migration 36 está ESCRITA e NÃO APLICADA** — o banco fica fora do alcance da
> sessão. O comando está no fim deste bloco de hoje, para o dono aplicar com a
> `DIRECT_URL`. Enquanto não for aplicada, o código já está certo e o banco ainda recusa
> ligar conector sem o contrato — a `K8` é exatamente o que grita isso.
>
> **O que sobra da questão não é código:** perguntar à cooperativa se a G3 tem mais de um
> contrato. A diferença é que agora *"um só"* deixou de ser um bloqueio.
>
> **O comando, para o dono rodar com `!` (a `DIRECT_URL` tem DDL; a `DATABASE_URL` não):**
>
> ```bash
> export PATH=/opt/financeiro/node/bin:$PATH && cd /opt/financeiro/app
> npm run db:migrate     # aplica só a 36 - a 35 já está no ar
> npm run ensaio-do-cofre   # a K8 é a que prova que ela pegou
> ```
>
> **`prisma generate` não é preciso**: a 36 mexe só numa CHECK, e `schema.prisma` não
> modela CHECK — `numero_contrato_cobranca` já era `Int?`. **Deploy também não**: nenhuma
> rota mudou e a SPA não foi tocada.
>
> ⚠️ **E o comando acima NÃO roda desta VPS — medido em 28/08, e a medição achou uma
> armadilha que vale mais que a migration.** Tentar aplicar daqui esbarra em duas coisas,
> e a segunda é a perigosa:
>
> 1. **não há `DIRECT_URL` em `/etc/financeiro.env`** — só `DATABASE_URL`, que é o
>    *session pooler* na 5432 com a role **`app_financeiro_login`**. Ela **não é dona** de
>    `conector_cobranca` (o dono é `postgres`), então `ALTER TABLE` é recusado. O
>    `prisma.config.ts` já dizia isso desde 30/07: *"as migrations deste projeto sempre
>    foram aplicadas de fora, nunca do VPS"*;
> 2. **`prisma migrate status` por essa conexão responde `36 migrations have not yet been
>    applied` — TODAS AS 36, inclusive as 35 que estão comprovadamente no ar.** A causa
>    está medida: `_prisma_migrations` tem **RLS ligada e ZERO policies**. A role tem
>    `SELECT` (`has_table_privilege` = true) e a tabela existe no catálogo — mas RLS sem
>    policy filtra **toda** linha para quem não é dono nem `BYPASSRLS`. O `postgres`
>    atravessa (`relforcerowsecurity = false`), e por isso do Codespace a leitura é
>    correta.
>
> **Por que isso é pior que um erro:** ele não falha, ele MENTE com uma resposta
> plausível. Quem rodasse `npm run db:migrate` daqui estaria mandando o Prisma **repetir a
> história inteira** contra produção. A falta de DDL faz isso morrer na primeira migration
> — mas a proteção é acidental, e é a role errada que a está dando.
>
> É o espelho exato do que o commit `1682386` consertou hoje: lá o workflow podia dizer
> *"aplicadas"* tendo aplicado nada; aqui a leitura diz *"nada aplicado"* tendo aplicado
> tudo.
>
> **O caminho certo continua sendo o documentado:** aplicar de onde existe a `DIRECT_URL`
> de dono — o Codespace —, e conferir **no catálogo**, nunca na mensagem do comando, que é
> a regra que a migration 34 e a 35 já seguiram.


---

## 1. A pendência: o certificado A1

| | |
|---|---|
| **O quê** | Certificado **A1** e-CNPJ, `.pfx`/`.p12` com senha, CNPJ `66714022000121` |
| **De quem** | **do dono** — é compra externa, decidida em 13/08 (*comprar*) |
| **De quem NÃO é** | do Sicoob. É emitido por **AC do ICP-Brasil**, logo não depende de mais ninguém |
| **O que destrava** | criar o aplicativo no Portal Developers → confirmar no app do banco → `src/sicoob/http.ts` torna-se escrivível → boleto registrado de verdade |
| **Já confirmado (fonte primária)** | A1 e **só** A1 (manual do Sicoob, 22/11/2024); sobe **somente a chave pública** (`.PEM`/`.CRT`/`.CER`) — a chave privada **não** sobe em campo web |
| **Conferência de 2 min, antes da compra** | quantos **responsáveis** a conta PJ exige para autorizar o aplicativo — `Q-SICOOB-AUTORIZA-01` |

**Enquanto ele não existe, nada para.** A `PortaDeCobranca` é injetada e o padrão é
`COBRANCA_NAO_CONFIGURADA`, que **recusa com 503 nomeado** em vez de fingir. A fatura
compõe, emite, imprime e **cobra por Pix estático** — o que não existe é boleto registrado
*por nós, pela API*.

> **17/08/2026 — e desde hoje a fatura também cobra por BOLETO, sem o A1.**
>
> O boleto emitido à mão no portal da cooperativa **entra no sistema**: aba
> **Emissão e cobrança** → *Importar boleto emitido no banco*. Ele não é uma segunda emissão —
> o título já existe no banco, e o que entra é a transcrição conferida dele
> (`origem = 'importado'`, migration 32). O sistema **não fala com a Sicoob em
> nenhum ponto desse caminho**.
>
> O que isso conserta são três silêncios que estavam medidos e sem dono: a aba
> dizia *"esta fatura não tem boleto"* para uma fatura que tinha; o documento
> composto caía no ramo do **Pix estático — que não concilia** — existindo um
> boleto com nosso número; e a conferência aritmética dos 44 dígitos nunca rodava
> contra esse título.
>
> **O A1 continua sendo a pendência, e o que ele destrava não mudou:** emissão
> automática, fila de retentativa, consulta ativa e baixa pela API. O importado
> fica **fora da consulta ativa** de propósito — `Q-BOLIMP-01`, com a razão medida.

### 1.1 ~~Por que é o único código que falta~~ — **escrito em 27/08/2026**

> **O quadro abaixo é de 14/08 e está mantido porque explica a decisão.** O que mudou:
> `src/sicoob/http.ts` **existe** desde 27/08, junto com o `cofre.ts` que o `ADR-0005`
> tinha decidido e ninguém tinha implementado. A `Q-PECA-NAO-PLUGADA-01` não se aplica
> mais — há cofre, há resolvedora, há quem o chame, e ele foi exercido contra o sandbox
> real. Ver `SICOOB-medido-2026-08-27.md` e o bloco de 27/08 no topo deste arquivo.

Medido no repositório em 14/08:

- **`src/sicoob/` tem `porta.ts` e `falso.ts`, e não tem `http.ts`.** A interface e o
  falso (exercitável sem rede) existem; o adaptador real da Cobrança v3 **não**, por
  decisão registrada — escrever um adaptador que nada pode chamar é a
  `Q-PECA-NAO-PLUGADA-01`, e todo documento recente repete: *não escreva antes do
  sandbox*. O primeiro `POST` real vai corrigir alguma suposição de identidade do
  cooperado (`numeroCliente`, `numeroContratoCobranca`, `codigoModalidade` — `B4`), e
  código escrito contra suposição é reescrito inteiro.
- **O extrator já existe.** `src/concessionaria/leitor-visao.ts` (14/08) preencheu a
  `PortaDeLeitura` que estava vazia desde 07/08 — leitura da fatura e do boleto por
  modelo de visão, com a rota **autenticada** (`comPermissaoDeLer`/`exigir('ler')`),
  ao contrário do proxy aberto da referência (ver §4c).
- **As demais portas de dinheiro são injetadas com padrão que recusa nomeando** — não
  há stub silencioso no caminho do dinheiro.

**Conclusão:** o `src/sicoob/http.ts` não é uma lacuna esquecida; é a peça que espera
o A1. Por isso "resta o A1" vale **também para o código**.

---

## 2. O que NÃO é pendência de código (regra 10)

Estes itens são reais e continuam abertos — mas **nenhum é do repositório fechar**.
São insumo da operação e decisão com dono. Ficam aqui para serem vistos de uma vez; a
fonte com dono e data é o `QUESTOES.md`.

### 2.a Fila da primeira fatura — insumo humano da operação

Nenhum é código. Os importadores já existem e rodam do Codespace contra produção.

> **17/08/2026 — os itens 1 e 7 deixaram de exigir Codespace.** Eles continuavam
> na fila por um motivo que não era de decisão nem de insumo: **não havia tela**.
> O dado só entrava por um script rodado de um Codespace, contra produção, por
> quem tem o repositório clonado e o `.env` na mão — e quem opera não tem nada
> disso. As colunas, as rotas (`PATCH /clientes/:id`, `PATCH /unidades-consumidoras/:id`)
> e os importadores em lote já existiam desde sempre. **Os importadores continuam
> sendo o caminho certo para 29 linhas de uma vez** — eles conferem colisão de
> documento antes de escrever qualquer coisa (`Q-CLIENTEDUP-01`), o que a
> digitação linha a linha não faz.

| # | Pendência | Estado hoje | Como entra | Dono |
|:--:|---|---|---|---|
| ~~1~~ | ~~**CPF/CNPJ de 24 pessoas**~~ | ✅ **FECHADO — medido em 24/08: 48 clientes com documento e os 48 VALIDADOS**, e a camada `documento_do_cliente` marca **0 de 29**. Era 26 semeados e 0 validados em 20/08; alguém reenviou pela aba Clientes, que é o ato que troca a origem para `coleta_local` | — nada a digitar | — |
| 2 | ~~**Dia de vencimento de 29 UCs**~~ | 🔽 **REBAIXADO em 24/08** — continua **0 de 29**, e deixou de ser bloqueio geral: no caminho oficial o vencimento vem **impresso na conta da distribuidora**, e o cadastro é a **segunda** fonte. Só importa para a conta que vier sem data ⬇️ | **aba Unidades consumidoras**, linha a linha · ou `npm run vencimentos` em lote | operação |
| ~~3~~ | ~~**CPF/CNPJ de 2 originadores** + natureza~~ | ✅ **FECHADO — 2 originadores cadastrados, os 2 com documento** (medido em 24/08; eram 0 em 21/08) | — | — |
| 4 | **Digitar os 29 contratos** | 🔽 **18 de 29 ATIVOS**, e os 18 com originador (eram 0 em 21/08). Faltam **11** — a camada `contrato_ativo` marca 11 de 29 | **aba Contratos** · ou `npm run contratos` em lote. As duas dependências (1 e 3) **fecharam** | operação |
| 5 | **Emissor** — razão social, CNPJ, contato | **vazio em produção**, e desde 24/08 **aparece na tela de Pendências** como a camada `emissor_da_fatura` — antes só existia nesta lista. Medido: razão social, CNPJ, telefone e endereço todos nulos; chave Pix padrão e modelo padrão ✅ | **Fatura unificada** → «3 · Cadastro da fatura» · ou `npm run identidade` | dono |
| ~~6~~ | ~~**Tarifa das 41 UCs**~~ | ✅ **RESOLVIDO em 20/08 — 41 de 41**, semeadas pelo ciclo (34 × `1,13` · 5 × `1,16` · 2 × `1,18`) | — nada a digitar. `Q-VALOR-01(b)` **fechada** | — |
| 7 | **Endereço do pagador de 29 UCs** | **0 de 29** | **aba Unidades consumidoras**, painel «Endereço do pagador» (17/08) · ou `npm run enderecos` em lote — **só o boleto depende** | operação |
| **8** | **A conta da distribuidora de cada unidade, no mês** ⬅️ **novo em 24/08** | **0 de 29** | **Fatura unificada** → «1 · Leitura e cálculo»: sobe o arquivo, confere o que foi lido, registra. Depois o botão **«gerar cobrança»** na lista de contas registradas. **Uma por vez** — se vale um caminho em lote é a `Q-CONTA-LOTE-01`, aberta | operação |

> ### ⬇️ 24/08/2026, fim do dia — o CICLO INTEIRO foi remedido, e a metade de cima quase fechou
>
> Verificação ponta a ponta da geração da fatura **e do recebimento**, contra
> produção, pelo mesmo caminho da aplicação (`iniciar` → `login` → `withRelatorio`).
> Nada foi escrito. O que ela achou, e o que ela mudou nesta lista:
>
> ```
>   ANTES (21/08)                        AGORA (24/08)
>   clientes com documento validado 18   ->  48        camada documento_do_cliente: ok
>   originadores .................... 0  ->   2        os dois com documento
>   contratos ativos ................ 0  ->  18        faltam 11 das 29
>   regras de comissão ............. 10  ->  10        5 tipos x 2 parcelas
>   percentuais de repasse .......... 4  ->   4        as 4 usinas
>   donos de usina .................. 0  ->   0        bloqueia REPARTIR
>   contas lidas .................... 0  ->   0        bloqueia FATURAR
>   faturas · boletos · liquidações . 0  ->   0        o recebimento nunca rodou
> ```
>
> **O achado novo é o EMISSOR, e ele não era medido por ninguém.** `razao_social` e
> `cnpj` estão vazios em produção, e **nada recusa por causa disso** — a folha de
> 7 faixas compõe e imprime igual. O que ela faz é sair sem dizer quem cobra:
> `linhaDoEmissor()` devolve nulo, o cabeçalho e o rodapé saem sem nome, o campo
> «Beneficiário» da faixa de pagamento sai vazio e a linha *«Atenção ao golpe do
> boleto: confira sempre se o beneficiário é X»* **não é impressa**, porque ela
> amarra no nome. Virou a camada **`emissor_da_fatura`** da tela de Pendências, com
> `bloqueia_fatura` pelo precedente da `originador_do_contrato` — «estragar não é
> sempre travar», e a marca vale porque o sistema não pode se declarar pronto para
> cobrar quando o papel que ele produz não nomeia quem recebe o dinheiro.
>
> **O recebimento não está quebrado, e nunca foi exercitado.** As três portas de
> baixa existem (`webhook-sicoob`, `conciliação`, `baixa manual`), o split roda na
> mesma transação da baixa e provisiona contas a pagar — e há **0 liquidações**,
> porque não há fatura. Sem o conector, a única porta viva é a **baixa manual** na
> aba Emissão e cobrança, e o Pix é `conciliacao: 'manual'` por construção: nada
> detecta o pagamento sozinho.
>
> **E uma questão nova saiu daqui: `Q-PODEFATURAR-01` 🟡.** O cartão «Pode faturar»
> nunca pode ficar verde, porque `cobranca_sicoob` é `bloqueia_fatura` e o A1 é uma
> compra que ninguém fez — mesmo com as outras doze camadas fechadas. É decisão de
> quem cobra (regra 10) e **nada no código foi mudado por conta dela**.

> ### ⬇️ 24/08/2026 — a prontidão passou a medir o caminho OFICIAL
>
> Não é insumo novo: é insumo que **sempre foi o primeiro** e que o relatório não
> contava. Decidida a `Q-CICLO-01` em 21/08, o valor da cobrança sai da conta lida
> — e a tela de Pendências continuava medindo o cadastro em duas camadas.
>
> **O que mudou, medido contra produção na mesma hora:**
>
> ```
>   FALTA  conta_lida_da_competencia    29 de 29   ⬅️ nasceu, e é o trabalho real
>   ?      vencimento                    0 de  0   (era: pendente 29 de 29)
>   ?      tarifa_na_conta               0 de  0   (era: tarifa_da_uc, não medido)
> ```
>
> O `vencimento` agora roda a **mesma regra da fatura**: a data da conta primeiro,
> o dia do cadastro como segunda fonte. A tarifa deixou de olhar o cadastro, e a
> troca de nome foi junto — a coluna «Tarifa R$/kWh» da aba Unidades consumidoras
> serve o **caminho antigo**, e o preço que a cobrança usa é o **lido na conta**,
> com seis casas. Mandar corrigir o preço na aba Unidades fecharia a coluna de lá
> e deixaria a cobrança recusada do mesmo jeito: o pior tipo de link, o que leva a
> algum lugar.
>
> **Sem contrato e sem conta, as duas dizem «ainda não dá para conferir»** — e não
> «pronto». Zero sobre nada não é pronto, e verde autoriza.

> ### ⬇️ 20/08/2026 — o ciclo RODOU, e os dois itens mudaram de forma diferente
>
> `npm run ciclo -- --valendo` executado: **112 lidos, 4 criados, 63 atualizados,
> 0 recusados, 4 divergências**. Ensaio antes, com o mesmo resultado.
>
> | | antes | depois |
> |---|--:|--:|
> | UCs ativas **com tarifa** | 0 de 41 | **41 de 41** ✅ |
> | Clientes **com documento** | 0 | **26** (todos `crm_semente`) |
> | Clientes com documento **validado** | 0 | **0** — e é o esperado (R8) |
>
> **O item 6 fechou. O item 1 não, e a distinção é a R8 em ação.** A camada
> `documento_do_cliente` conta `NOT documento_validado`, que são os TRÊS estados
> que não valem — então ela continua marcando **29 de 29** mesmo com 26 clientes
> preenchidos. Isso não é defeito: semente do CRM não vale por decreto, e o que
> valida é **reenviar o número pela aba Clientes**, o que troca a origem para
> `coleta_local`. O trabalho saiu de *descobrir e digitar 29 documentos* para
> *conferir e confirmar 26 já preenchidos* — que é um trabalho diferente e muito
> menor, mas ainda é trabalho de alguém.
>
> **4 colisões de documento viraram divergência, não 23505** — sem a guarda,
> cada uma teria derrubado o lote inteiro pelo índice `cliente_documento_unico`.
>
> ### 🔴 E ELAS NÃO ERAM DUPLICATAS — a `Q-CLIENTEDUP-01` estava errada
>
> **Regra do dono, 20/08:** *"os documentos podem se repetir, pois nas
> negociações mais de uma pessoa pode ser responsável por uma UC, entretanto,
> não podem existir mais de uma UC."*
>
> Medido no CRM, os quatro casos recusados:
>
> | Pessoa | Documento | UCs distintas |
> |---|---|--:|
> | Carlos Gabriel Santos Alves | 1 CPF | **3** |
> | Thiago Gonçalves Taquary | 1 CPF | 2 |
> | Renata Lucy N. D. Teles Leão | 1 CPF | 2 |
> | Renata Ferreira Estevam | 1 CPF | 2 |
>
> Mesma pessoa, imóveis diferentes. É o caso **normal** do negócio. E a outra
> metade da regra já é respeitada: **0 UCs repetidas** no CRM, 127 distintas.
>
> **✅ `migration 33` APLICADA em 20/08/2026** (`prisma migrate deploy`, com a DIRECT_URL de dono). `cliente_documento_unico` removido, `uc_numero_unico` mantido. O ciclo seguinte destravou sozinho — a guarda do conector consulta o catálogo — e criou os **5 clientes** que estavam bloqueados, com **0 divergências**. Documentos que agora repetem legitimamente: `51294590000143` (2 UCs), `00506706117`, `03571069110`, `03284734139`, `03275983105`.
> que remove `cliente_documento_unico` e mantém `uc_numero_unico`. Ela está
> escrita e versionada, mas **não pôde ser aplicada deste host**: a role de
> runtime `app_financeiro_login` não tem DDL (a tabela é do `postgres`), e o
> `DIRECT_URL` não está em `/etc/financeiro.env`. **Precisa rodar do Codespace.**
>
>
> **Item 6 — tarifa.** O CRM expôs `tarifa_reais_por_kwh` em
> `financeiro.rateio_clientes` e `vendas_ganhas`: é o campo **digitado** no card
> (`leads.consumo_fator`), não a divisão. **Cobertura medida: 41 de 41 UCs e 495
> de 495 leads** — um trigger do lado de lá semeia no nascimento do lead, então
> ninguém precisa digitar 41 tarifas. Pela tabela de decisão da rodada 9 §4, é o
> cenário "esperamos a coluna e semeamos as 41 de uma vez".
>
> `tarifaDoCliente` (a divisão) **não saiu**: virou segunda fonte e conferência,
> atrás de `tarifaDaSemente`. O motivo é que as duas podem discordar — os quatro
> cards do `1,159997` da rodada 9 têm o fator digitado em **`1,1300`**, não
> `1,16`. Medido pelo dev do CRM: divergem em 10 de 198 cards do tenant e em **0
> das 41 UCs**. Divergência agora vira sinal contado, não silêncio.
>
> **Item 1 — documento.** `espelharLote` passou a gravar `documento` quando, e só
> quando, `cliente.documento` está nulo — com `crm_semente` e
> `documento_validado = false`, **mesmo com o dígito fechando** (R8 intacta). Não
> é exceção à R5: campo vazio não tem valor local a ser vencido.
>
> **O que isso NÃO faz:** não ativa contrato. Continua sendo semente, e quem
> valida é a aba Clientes reenviando o número (o que troca a origem para
> `coleta_local`). O ganho é sair de *digitar 29 do zero* para *conferir 29 já
> preenchidos*. Do lado do CRM havia **105 documentos preenchidos** em 20/08,
> 34 deles extraídos automaticamente dos anexos naquele dia.
>
> **Colisão de documento vira divergência contada, não 23505.** O índice
> `cliente_documento_unico` derrubaria o `createMany` inteiro se dois leads
> trouxessem o mesmo número — que é o cenário da `Q-CLIENTEDUP-01`. O conector
> não escolhe qual dos dois é o dono.
>
> Testes: `tests/crm-semente.ts`, 17 verificações puras (sem banco), em
> `test:dominio`. Avisos técnicos do dev do CRM em
> `AVISO-dev-crm-documento-2026-08-20.md` e `AVISO-dev-crm-tarifa-2026-08-20.md`.

**A aba Clientes distingue o que a coluna sozinha esconde**, e é a R8: documento
vindo do CRM entra com `documento_validado = false` **mesmo passando no dígito
verificador**, porque lá o campo é livre e dígito certo não prova que o documento
é daquela pessoa. Um CPF preenchido na tela não significa contrato ativável —
quem destrava a R9 é a coluna *Vale para o contrato*. **Reenviar o mesmo número
pela aba é o ato que o valida**, porque troca a origem para `coleta_local`.

### 2.b Decisões do dono / contador — movem dinheiro, não têm volta

| Questão | Sev. | O que decide |
|---|:--:|---|
| **Q-FATCHEIA-01** | 🔴 | o que é "fatura cheia" — decide em que mês a comissão de todo contrato começa. **Tem prazo**: `data_fechamento` é editável só no CSV, antes de importar |
| **Q-CLIENTEDUP-01** | 🔴 | 5 das 29 UCs são clientes duplicados — custa 5 das 29 |
| **competência** | — | 2026-06 sai com **28 de 29**; 2026-07 sairia com 9 (falta a geração da usina `0001`) |
| **Q-DOCG3-11** | 🟡 | a decomposição do repasse — é a base do split. **14/08: o dono decidiu seguir a referência** (não compensado + iluminação + bandeira + demais). Falta o aval fiscal do contador, uma fatura de GD real para validar o mapa (a referência **não tem fio B**), e a reescrita da base — **não executada**, para não mover dinheiro sobre lógica nunca confrontada com compensação. Ver `QUESTOES.md` Q-DOCG3-11 |
| **Q-PARCERIA-01** | 🔴 | fora do caminho crítico das 29 hoje; **volta a travar** quando o CRM ativar as 3 UCs do Edimar |

### 2.c Ações de plataforma do dono

| # | Item | Sem isso |
|:--:|---|---|
| 1 | **`ANTHROPIC_API_KEY` em `/etc/financeiro.env`** + `systemctl restart` | as duas rotas de leitura respondem **503 com a mensagem certa** |
| 2 | **Girar a chave da Anthropic** — `Q-REF-SEGREDO-01` | o **proxy aberto** é o `/api/ler-fatura` da **referência (Vercel)**, não o nosso código; ele repassa o corpo com a chave do servidor **sem autenticação**. Girar **antes** de instalar a mesma chave em qualquer outro lugar. Não há código nosso a mudar |
| 3 | **Q-LEITOR-01** — uma chamada real ao modelo contra um PDF de verdade | o contrato está preso por verificações, mas que a chamada funciona no ar **não está provado** — é subir um arquivo |

---

## 3. Frentes de código já fechadas

Não estão mais abertas; a leitura por extenso é a `RETOMADA-2026-08-15`.

- **Cada camada da tela de Pendências diz ONDE se resolve** (19/08) — a tela dizia com
  precisão *o que* falta e *de quem* é, e deixava o **caminho** implícito: quem opera
  tinha de saber de cabeça que a tarifa é coluna da aba Unidades desde 14/08 (antes era a
  aba Tarifas, que saiu), que o CPF/CNPJ só ganhou tela em 17/08, e que geração **não tem
  tela** porque é espelhada do CRM. Agora cada linha carrega o link, e ele abre a aba **já
  filtrada na pendência** — `?pendencia=sem_tarifa`, `sem_vencimento`, `sem_usina`,
  `sem_dono`, `nao_validado`. O filtro do documento é um **agregado novo** (`nao_validado`)
  e não um dos quatro estados: a camada conta `NOT documento_validado`, que são três deles,
  e um link para `sem_documento` mostraria lista menor do que a que a prontidão acusa.
  **Duas camadas dizem «não há tela», e é verdade**: geração é espelho do CRM (regra 4) e
  regra de comissão é decisão com dono (`Q-COMIS-TERC-01`) — nas duas o caminho real vai
  escrito ao lado, porque recusa é ponteiro e não beco. O mapa é `.ts` puro
  (`web/src/destino-da-camada.ts`) com suíte própria — **65 verificações** entre
  `web/tests/destino.ts` e `tests/prontidao-destino.ts`, esta última lendo os **dois**
  fontes para que camada renomeada no servidor não deixe um destino órfão em silêncio.
- **Importar boleto emitido no banco** (17/08, migration 32) — a aba **Emissão e cobrança** passou a
  aceitar o título emitido à mão no portal: linha digitável conferida nos quatro dígitos
  verificadores, código de barras **remontado** dela, valor e vencimento lidos de dentro
  dos 44 dígitos e comparados com a fatura antes de gravar. Upload do PDF reaproveita o
  extrator por visão que já existia. Não fala com a Sicoob e não depende do A1.
- **O CPF/CNPJ do cliente e o endereço do pagador entram pela tela** (17/08) — eram os
  itens 1 e 7 da §2.a, e ficavam presos a um script de Codespace. A aba Clientes mostra a
  R8 (semente do CRM não vale) e a aba Unidades consumidoras ganhou o painel do endereço.
- **O Pix copia e cola parou de ser corrompido na limpeza** (17/08) — três lugares
  faziam `replace(/\s+/g, '')` num payload que tem espaço legítimo dentro do nome do
  beneficiário (`5908G3 SOLAR` → `5908G3SOLAR`): quebrava o comprimento do campo e o CRC,
  e o QR era **desenhado assim mesmo**. Agora quem decide o que é espaço sobrando é o
  próprio CRC, e payload que não fecha não vira QR impresso.
- **Os rótulos da barra passam a descrever a tela** (17/08) — cinco mudaram, e três
  diziam outra coisa que a tela faz: `Carteira` → **Faturamento** (é onde a fatura do mês
  nasce), `Cobrança` → **Conector Sicoob** (cobrar é na aba ao lado; ali é a credencial do
  banco), `Documento` → **Fatura unificada** (não dizia qual, com dois candidatos na
  mesma barra). Mais `Unidades` → **Unidades consumidoras** e `Donos` → **Donos de
  usina**, que eram dívida de vocabulário (regra 7 — os termos inteiros já estavam no
  `GLOSSARIO` e já eram o título da página). **As rotas não mudaram**, nem os nomes de
  domínio. A revisão achou de quebra uma mensagem anterior que mandava cadastrar a
  identidade *"na aba Cobrança"* — o formulário vive em `/documento#cadastro`.
- **E um sexto rótulo, que corrige o quinto** (17/08, fim do dia) — `Faturas` →
  **Emissão e cobrança**, por medição do dono: *"o nome faturas e fatura unificada está
  causando confusão"*. Rebatizar `Documento` de **Fatura unificada** tinha deixado duas
  abas vizinhas começando pela mesma palavra — a correção da manhã criou a confusão da
  tarde. Quem cedeu foi `Faturas`, porque **não nomeia nada**: era o plural da entidade,
  e a entidade aparece em todas as telas do grupo, enquanto `Fatura unificada` é nome de
  funcionalidade e está em quatro arquivos e numa tabela (mudá-lo criaria sinônimo —
  regra 7). O rótulo novo são os três botões da tela: emitir, boleto, baixa. **A rota
  `/faturas` não mudou.** E a lição virou teste em vez de comentário (regra 8): o `I4c`
  já proibia título repetido e passou verde nas duas rodadas, porque `Faturas` e
  `Fatura unificada` são strings diferentes — o **`I4k`** passou a proibir duas abas com
  o mesmo **substantivo-cabeça**, que é o que a pessoa lê primeiro. `Faturamento`
  convive, porque nomeia outra coisa: o processo, não o documento.
- **Cadastro de Fatura** — emissor, logotipo, chave Pix, campos personalizados, modelos (migrations 28–31).
- **Aba Documento = a referência, e passou dela** — conferência aritmética do boleto, teto de desconto, escala do decimal.
- **Aba Tarifas removida**, tarifa migrada para a UC (a coluna certa, medido em 41 de 41).
- **Extrator de fatura/boleto por visão** — `concessionaria/leitor-visao.ts`, rota autenticada.
- **Revisão geral** — o `sum(int)` que estourava em R$ 21 mi, o 401 da API que deslogava quem faturava, o CSV que partia endereço, o bundle de 227→98 KB.

### 3c. Nota de segurança que sobrevive a esta consolidação

O proxy aberto (`Q-REF-SEGREDO-01`) é da **referência hospedada na Vercel**, fora deste
repositório. O nosso equivalente (`/faturas/ler-fatura`, `/faturas/ler-boleto`,
`/faturas/unificada/compor`) é autenticado por sessão e `exigir('ler')` — documentado
em `src/http/rotas.ts` e `src/concessionaria/leitor-visao.ts`. A ação que resta é **do
dono**: girar a chave (item 2.c.2).

---

## 4. Procedência desta consolidação

- **Apagados** por serem resíduo datado e superado: `PENDENCIAS-2026-08-05.md`,
  `PROXIMOS-PASSOS-2026-08-09.md`. O conteúdo vivo deles está acima; o histórico
  datado permanece nos `RESUMO-SESSAO-*` e nas `RETOMADA-*`, que **não** foram tocados
  — relatório é registro datado e apagá-lo falsificaria a memória do projeto.
- **Não apagados, e por quê:** `QUESTOES.md` é o registro com dono por entrada
  (regra 10) e continua sendo a fonte das decisões da §2.b/§2.c; as retomadas e os
  resumos são a linha do tempo.

---

## 5. Como a migration 32 entrou em produção (17/08/2026)

**Está aplicada.** Registro do que aconteceu, porque o caminho é o que vale para a próxima.

| | |
|---|---|
| **Aplicada em** | 17/08/2026, 10:23 UTC |
| **Por onde** | workflow **`migrate-financeiro`**, `confirmar = aplicar` |
| **Alvo** | `aws-0-sa-east-1.pooler.supabase.com:5432` — session pooler |
| **Deploy** | `deploy-financeiro` logo depois: `cfa1fe5 -> f67b108`, `financeiro.service` ativo, **HTTP 200** |

Conferido **no catálogo**, não na mensagem do comando:

```
Applying migration `20260817120000_boleto_importado`
All migrations have been successfully applied.

migration 32 OK — enum origem_boleto, coluna boleto.origem e a constraint, os tres presentes.
boletos por origem: nenhum boleto na tabela (esperado — o A1 nunca existiu)
```

### O que o caminho exigiu, e fica valendo para a próxima

1. **O workflow tem de estar na `main`.** O GitHub só lista `workflow_dispatch` do
   branch padrão — enquanto o PR não entrou, o `migrate-financeiro` **não aparecia
   na aba Actions**. Não é defeito; é onde procurar quando "sumir".
2. **Secret `DIRECT_URL`** — session pooler na **5432**, nunca a 6543 (o Migrate
   exige prepared statements que o pooler de transação não suporta, e o modo de
   falha dele não é erro: ele *pendura*). A guarda barra a 6543 antes de discar.
3. **A ordem é migrar → implantar.** Migration aditiva com `DEFAULT` é compatível
   para trás; o inverso seria 500 em toda leitura de boleto.

### A sequência, para repetir

```
migrate-financeiro   confirmar = conferir   # identidade + o que falta, sem escrever
migrate-financeiro   confirmar = aplicar
deploy-financeiro
```

Ou, de onde já houver credencial:

```
DIRECT_URL="..." npx prisma migrate status
DIRECT_URL="..." node --experimental-strip-types scripts/conferir-banco-alvo.ts identidade
DIRECT_URL="..." npx prisma migrate deploy
DIRECT_URL="..." node --experimental-strip-types scripts/conferir-banco-alvo.ts migration-32
```

### O que foi ensaiado antes

Contra PostgreSQL real, antes de tocar produção:

| Ensaio | Resultado |
|---|---|
| as 32 do zero, pelo `prisma migrate deploy` | aplicadas, `migrate status` limpo |
| banco **em 31**, a 32 pendente, aplicada pelo CLI | a ordem exata da produção |
| a 32 sobre um banco em 31 **com linha de `boleto` dentro** | **~6 ms**; a linha que já existia ficou `origem = 'api_sicoob'` |
| `conferir-banco-alvo.ts identidade` contra um banco **que não é o nosso** | **recusa**, nomeando a regra 4 |

**A guarda de identidade é a regra 4 em forma executável.** `migrate deploy`
contra o banco errado não recusa — ele **cria**. A identidade conferida não é o
nome na URL: é a migration de fundação `20260725120000_fundacao_schema` estar
registrada como aplicada no alvo. Nenhum outro banco tem essa linha.
