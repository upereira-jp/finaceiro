# RESUMO-SESSAO-15 — 30/07/2026

| Campo | Valor |
|---|---|
| **Foco** | As **três pendências** que a sessão 14 deixou nomeadas na `Q-DOCFATURA-01` — o desenho do QR, o teste de integração do `repos/documento.ts` e a logo no payload do CRM — e, antes delas, **conferir o estado dos vendedores e das negociações no CRM** |
| **Método** | Medir antes de construir, e **medir de novo o que já tinha sido medido**. Foi a segunda medição que produziu o achado mais importante da sessão: o CRM mudou em quatro dias, e o mapa de atribuição de originador ficou errado em duas linhas |
| **Resultado** | 3 pendências fechadas · 1 módulo puro novo (codificador de QR) · **90 verificações novas** em 2 suítes · **1 questão vermelha nova** · 1 mapa de atribuição refeito |
| **Não feito** | **o deploy não foi executado** — o VPS não é alcançável deste ambiente (§7). O código está commitado e o bundle foi construído e provado; o `git pull` do servidor é passo de quem tem acesso |

> # ESTADO ATUAL — 30/07/2026, fim da sessão 15
>
> | | |
> |---|---|
> | **No ar** | `https://financeiro.blackhaus.io` — **continua o bundle de 29/07 (`index-DzZYJ0Ak.js`)**. Nada desta sessão nem da 14 está publicado |
> | **Bundle novo, provado** | duas medições, e a segunda é a que vale. Isolada no meu commit: `index-Cpc05c79.js`, 449,82 kB. **Na árvore final, já com o `web/` da sessão de UX: 3 pedaços — `index-hNcReSCk.js` 117,99 kB (34,81 gzip), `icones-DGYYwgme.js` 161,25 kB (37,72), `plataforma-vWw_Z3Y-.js` 352,75 kB (99,99).** O servidor **subiu e respondeu** com o primeiro (§7) |
> | **Banco** | **20 migrations**, sem migration nova hoje. Nada escrito em produção |
> | **Suíte** | `EXIT=0`. **854** linhas `ok` medidas por `npm test \| grep -c '^ok '` — e o número **não é comparável** ao 571 da sessão 14 (§8) |
> | **O que segura a primeira fatura** | continua sendo insumo humano: **dois** CPF/CNPJ (eram três) e os 39 contratos |
>
> **A fila, atualizada:**
>
> | Item | Nível | Quem |
> |---|:--:|---|
> | **`Q-CRMCODIGO-01`** — `lead.codigo` não é estável; o mapa de originador mudou | 🔴 **nova** | Vinicius + operação |
> | **CPF/CNPJ dos originadores — agora DOIS** — e a natureza pf/pj | **insumo** | Vinicius + operação |
> | `contrato_ativo` — 39 de 39 | 🔴 | Vinicius + operação |
> | `Q-FATCHEIA-01` — o que é "fatura cheia" | 🔴 | Vinicius |
> | `Q-WEBHOOK-01` — autenticação do webhook Sicoob **e do CRM** | 🔴 | Vinicius |
> | `Q-SICOOB-01` — certificado A1 | 🔴 | Vinicius (externo) |
> | **deploy** — `git pull` + `web:build` + `restart` no VPS | **operacional** | Vinicius (§7) |
> | `ADR-0005` — onde mora o segredo | proposta | Vinicius |
> | `Q-ORIGVEND-01` — o eixo decidido; falta o insumo humano | 🟡 | Vinicius + operação |
> | `Q-AGENDA-01` — nenhum processo periódico existe | 🟡 | Vinicius |
> | ~~`Q-DOCFATURA-01`~~ — as 5 decisões e as 3 pendências | ✅ | fechada hoje |

---

## 1. O achado: o CRM mudou, e o mapa de ontem pagaria a pessoa errada

Isto não estava na lista de tarefas. Apareceu porque a primeira coisa que fiz foi **remedir** o que a sessão 14 tinha medido 5 horas antes — e os números não bateram.

```
vendedores (conector de analise), g3-solar, 30/07 03:25Z
  Renata ............ 43 ganhos como responsavel · 41 cards como vendedor_origem
  Out Sales .......... 6                          · 122
  Kallina Tandara .... 1                          ·  67
  Jezielly Vieira .... 0                          ·   0     <-- era 28 e 1 em 29/07
```

A causa está medida, não inferida: **`financeiro.lead_merges` registra 76 merges em 30/07**, origem `merge_leads`. Um merge escolhe um lead sobrevivente, e três coisas saem disso.

### (a) `lead.codigo` não é estável

De 7 códigos conferidos por amostra do mapa de 29/07, **5 não existem mais** (`G3-0139`, `G3-0141`, `G3-0155`, `G3-0301`, `G3-0412`). Das 41 linhas do rateio, **39 têm código diferente**, com a mesma UC e o mesmo cliente. E `financeiro.vendas_ganhas` caiu de **80 para 51** linhas, porque o `DISTINCT ON (l.id)` da view conta lead distinto e os merges colapsaram duplicatas.

**O que isso não quebrou, e foi conferido no código:** a sincronização não usa `codigo` como chave. `src/crm/sincronizacao.ts` casa `rateio_clientes` com `rateio_creditos` por **`contrato_id`** e espelha cliente por **`crm_lead_id`** — os dois UUID. `lead_codigo` aparece só na mensagem de uma recusa. Um `npm run ciclo` depois do merge não duplica nem perde nada. Isso é desenho, não sorte.

### (b) A lista de originadores caiu de três nomes para dois, e duas atribuições trocaram de dono

| UC | cliente | % | kWh/mês | 29/07 | 30/07 |
|---|---|--:|--:|---|---|
| `000406456101252` | RHENAN HENRIQUE DAMASIO | 4.60 | 496,8 | Jezielly Vieira | **Out Sales** |
| `000407359701237` | ATAIDE DE MELO OLIVEIRA | 18.40 | **1.987,2** | **Renata** | **Out Sales** |

O peso da carteira: Renata **80,8% → 74,2%** (25 → 24 UCs), Out Sales **15,9% → 24,2%** (14 → 16). O total **não** mudou — 29.896,2 kWh/mês nas duas medições. A carteira é a mesma; o que se moveu foi de quem ela é.

**Por que isso é vermelho e não amarelo:** digitar contrato pelo mapa de 29/07 pagaria comissão à pessoa errada, **sem erro e sem log**, e não há conserto — a R20-b congela o tier no `rascunhar` e `contrato` não tem caminho de edição.

### (c) O lado bom, e ele é uma verificação cruzada que eu não podia fabricar

A sessão 14 disse que **12 das 41** atribuições existiam no CRM e eram **invisíveis às 8 views** — cards em etapa `normal` do funil `Rateio`, e a view expõe só `won`. Foram obtidas pelo conector de análise, e o documento era o único portador delas.

**Hoje 40 das 41 são legíveis pela view, e as 12 batem uma a uma.**

O funil não mudou — `Rateio` segue com 15 cards em `normal` e 28 em `Desconto Ativo` (`won`), igual a 29/07. Foi o merge: a linha do rateio passou a apontar para um sobrevivente **com** posição `won`, e o `DISTINCT ON` a alcança.

Então a atribuição foi obtida por um caminho e confirmada por outro, com quatro dias e 76 merges no meio. **E as duas que mudaram eram de fonte `view`, não `card`:** não foi o método de 29/07 que errou, foi o dado que se moveu.

**Consequência de método, e é o argumento mais forte contra derivar isto por código:** um derivador rodado em 29/07 teria gravado duas atribuições que hoje estão erradas, e ninguém saberia. Mapa novo em **`ATRIBUICAO-originador-2026-07-30.md`**, ordenado por **UC** — a chave estável. O de 29/07 ficou com cabeçalho de SUPERADO e corpo intacto, que é a decisão do `PATCH-citacoes-2026-07-24.md`.

---

## 2. O desenho do QR, e o que a verificação teve de provar sem se autoconfirmar

`src/dominio/qrcode.ts`: modo byte, Reed-Solomon sobre GF(256), oito máscaras com as quatro regras de penalidade, versões 1 a 12 nos quatro níveis. **45 verificações.**

O modo de falha aqui é pior que o do BR Code, e é o que ditou o desenho do teste:

- matriz malformada → a câmera **não lê**. Barulhento, ninguém perde dinheiro;
- Reed-Solomon errado → a câmera **corrige o que não devia** e lê **outra string**. A capacidade de consertar sujeira no papel vira invenção silenciosa de dado.

A sessão 14 pegou uma citação que eu havia inventado no teste do CRC, e o registro dela diz: *"ajustar o esperado para a saída do meu código teria virado tautologia — passaria com o algoritmo errado."* Então nada aqui compara a saída com constante minha. As verificações são de três tipos:

| Tipo | O que é |
|---|---|
| **Propriedade matemática** | síndrome nula usando a **tabela do corpo**, não a divisão polinomial que gerou a paridade; divisibilidade do BCH conferida por rotina de bits escrita de outro jeito; distância de Hamming mínima do código (formato **7**, versão **8**) |
| **Âncora publicada e derivável** | total de codewords **derivado da geometria** contra v1=26, v2=44, v7=196; a paridade publicada do exemplo do ISO/IEC 18004 (`"01234567"`, v1-M), com os codewords de dado **derivados à mão no comentário** antes de eu escrever a linha |
| **Ida e volta independente** | decodificador escrito na suíte que redescobre os módulos de função por **predicado geométrico**, em vez de repetir os laços de marcação do módulo |

### Os dois defeitos que isso pegou, e nenhum apareceria em revisão

**O primeiro apagava uma âncora do código.** A informação de formato repartia **8 + 7** bits em vez de **7 + 8**, e o bit 7 caía sobre o **módulo escuro fixo** em `(n-8, 8)` — apagando-o em metade das máscaras. Sintoma: leitor que não encontra o código, porque aquele módulo é uma das âncoras que ele procura. Quem acusou foi o `Q10d`, que testa o módulo escuro nos 32 pares nível × máscara.

**O segundo era da própria suíte, e é o mais instrutivo: a síndrome nula NÃO identifica a contagem de paridade, só a limita por baixo.** O gerador de grau 18 é múltiplo do de grau 11 — as raízes de um são subconjunto das do outro —, então um bloco com 18 símbolos de paridade passa na verificação de 11. E pior: o fluxo **inteiro** de um código de dois blocos também é codeword. Se `B0` e `B1` somem em `a^0..a^17`, o intercalado `S(x) = B0(x²)·x^a + B1(x²)·x^b` satisfaz `S(a^i) = 0` para `i ≤ 8`, porque `2i` ainda está na faixa das raízes. Resultado: `blocos=1, par=9` tinha síndrome nula num código de `blocos=2, par=18`, cortava os dados no lugar errado e devolvia **texto errado com síndrome nula**.

Isto é exatamente o modo de falha que este projeto persegue no resto do sistema — silencioso e plausível — cometido dentro do instrumento de medida. A correção foi coletar todos os candidatos e escolher o **maior** `par`: acima do verdadeiro exige mais raízes do que existem e falha de fato.

### Duas escolhas que ficam registradas como escolhas

**O SVG sai do servidor**, e entra no payload de `GET /faturas/:id/documento`. É a decisão 4 valendo para o desenho: o CRM consome a mesma rota e não roda React. Um QR que só o navegador desenha obrigaria o CRM a portar este arquivo. O `d` do caminho é montado **só de índices da matriz** — nenhum dado de fatura, cliente ou chave Pix atravessa a string —, e o `Q13c` prende isso recusando qualquer caractere fora de `[Mhvz0-9 -]`. É o que torna seguro o consumidor pintar o SVG direto.

**O teto de versão 12 é nomeado e levanta.** O pior BR Code que o `brcode.ts` consegue montar tem **243 bytes** e cabe na versão **11**. Acima do teto a função **recusa com o limite escrito**, em vez de truncar — truncar daria um QR legível apontando para um Pix incompleto.

O QR do Pix **do boleto** também vem desenhado: ele tem `txid` e concilia sozinho, então desenhar só o pior dos dois seria estranho. **O que não muda com o desenho, e a tela continua dizendo:** Pix estático não carrega `txid` por fatura, e a conciliação segue manual.

---

## 3. O teste do repositório, e dois erros meus que ele pegou enquanto era escrito

`tests/repos-documento.ts`, **45 verificações** no harness `tests/repos.sh`, pela role **sem `BYPASSRLS`**. Cobre o que não mora no código e sim no banco — e que um teste puro daria verde com tudo quebrado:

- o **mime derivado da assinatura do arquivo**: SVG e GIF recusados pelos bytes. Importa porque a logo é embutida no HTML do documento;
- o **`sha256` derivado pelo gatilho**, conferido contra `node:crypto`. É a regra 9 verificada, não declarada — o metadado não *pode* divergir do conteúdo;
- a **lista de campos fechada pelo enum**: era o custo que eu havia nomeado ao recomendar layout fixo, e *"o banco recusa"* precisava de teste;
- o **isolamento das seis leituras** de `paraFatura`: fatura do tenant B é **404**, não documento do vizinho.

**Erro meu nº 1, e é o que o `ADR-0003` nomeia:** usei `prisma.$queryRaw` dentro de `withTenantEm`. Isso roda **fora** da transação, portanto sem `SET LOCAL`, portanto a RLS devolveu **zero** linhas — a contagem disse que não havia vigência de tarifa e o `abrirVigencia` seguinte falhou dizendo que havia. Cometi, no teste do isolamento, o erro que o isolamento documenta.

**Erro meu nº 2:** peguei a fatura por **índice posicional** (`[0]`), e ela apontou para a fatura de outra suíte — `repos.sh` roda todas no mesmo banco e no mesmo tenant. O total veio de outra carteira. O conserto não foi só passar a filtrar pela UC: a suíte passou a afirmar a **relação** em vez de uma constante —

> o documento **repete** a coluna gerada da fatura, e o campo 54 do BR Code é **esse** total formatado em reais por texto

— porque a distribuidora é FK e só existe `'Equatorial'`, então a tarifa vigente vem de quem abriu a vigência primeiro. **Fixar 85.000 ali seria fixar uma dependência de ordem de execução com cara de conta conferida.**

---

## 4. A logo no payload

`GET /faturas/:id/documento?embutir_logo=1` devolve `logo.data_uri`. **Opt-in de propósito:** base64 custa 33% a mais e a tela já busca o binário por rota própria com o Bearer dela. Quem precisa do embutido é o consumidor que **não pode** fazer a segunda chamada autenticada — e esse é o CRM.

O que continua em aberto **não é disto**: a autenticação do CRM, que é a `Q-WEBHOOK-01`.

---

## 5. A sessão paralela de UX, e por que isso mudou o meu commit — e depois convergiu

Havia uma sessão paralela editando `web/` durante esta. Medido no `git status`, não suposto: `app.tsx`, `ui.tsx`, `tema.ts`, cinco telas e quatro arquivos novos, mais `web/src/estilo.ts` — que estava **sintaticamente inválido** no meio da escrita, com 18 erros de parse, e é importado pelo `ui.tsx`.

Consequência: **o commit desta sessão deixou o `web/` de fora, menos `web/src/api.ts`**, que é só tipo e é inteiramente meu. O `web/src/telas/documento.tsx` — onde mora o componente que pinta o QR — ficou **na árvore de trabalho, não no commit**: commitá-lo arrastaria a dependência dele no `ui.tsx` novo, que arrastaria o `estilo.ts` quebrado, e `main` deixaria de construir.

O `package.json` foi commitado **com uma linha só das duas**: a minha (`test:brcode` ganhando o `qrcode.ts`). A da outra sessão (`test:web` apontando para `tema.ts` e `interface.ts`, ainda não rastreados) ficou fora, senão um clone novo falharia no `npm test`.

**Efeito prático de publicar assim:** o backend gera o QR e a rota o serve; a SPA ignoraria o campo `qr` até a tela ser publicada. Nada quebra — é campo novo num JSON.

### E então a árvore convergiu, ainda dentro desta sessão

A sessão de UX **commitou** (`b1710f5`) em cima do meu commit, e levou junto o que eu havia deixado pronto e não commitado — o `ATRIBUICAO-originador-2026-07-30.md`, a `Q-CRMCODIGO-01` e o ajuste do `tests/repos-documento.ts`. O commit dela diz isso explicitamente, e o trabalho **não colidiu**: a única alteração dela no meu arquivo de teste foi a correção da linha `ok` com `\n` embutido, que eu já havia escrito.

**Reverificado na árvore final, e é o que corrige a ressalva que eu tinha escrito duas horas antes:**

```
web/src/telas/documento.tsx  ->  o componente `Qr` e o `dangerouslySetInnerHTML`
                                 estao em HEAD, com o `QrDoDocumento` importado
npm run web:build ............... tsc --noEmit + vite build OK, 206 modulos
npm test ........................ EXIT=0, 854 linhas `ok`
```

Ou seja: **o caminho inteiro do QR está commitado — backend, rota, tipo e tela** —, e o `web/src/estilo.ts` que estava inválido às 03:50 é código válido em `HEAD`. A ressalva *"não rode `web:build` no VPS"* **deixou de valer**, e está corrigida no §7.

---

## 6. Erros meus desta sessão, reunidos

| O erro | Como apareceu | O que ficou |
|---|---|---|
| **Repartição 8+7 da informação de formato**, apagando o módulo escuro fixo | `Q10d`, nos 32 pares nível × máscara | O defeito era invisível em revisão e não impedia o texto de voltar — só tirava uma âncora que o leitor procura |
| **Síndrome nula tratada como identificadora de `par`** | `Q9a` deu 33/48 | Duas propriedades algébricas que eu não tinha em conta: o aninhamento dos geradores e o fluxo intercalado ser codeword. O instrumento de medida tinha o modo de falha que ele existia para pegar |
| **`prisma.$queryRaw` dentro de `withTenantEm`** | contagem 0 com o dado existindo | Cometi no teste do isolamento o erro que o `ADR-0003` documenta. `db()`, sempre |
| **Fatura por índice posicional** | total de outra suíte | Virou afirmação de **relação** em vez de constante — e a constante teria escondido uma dependência de ordem de execução |
| **Contei 46 verificações onde havia 45** | conferido por `grep -c "chk('W"` | Eu havia contado da listagem na tela, não da fonte. É a terceira sessão seguida em que uma contagem minha não se reproduz; a lição repetida é que contagem se **mede**, não se lê |
| **Linha `ok` com `\n` embutido** | a contagem da suíte dava 46 sozinha e 45 dentro do `npm test` | Mensagem do Prisma tem quebra de linha. Uma verificação que imprime duas linhas quebra o método `grep -c '^ok '` que o README documenta. Passou a colapsar espaço |

---

## 7. O deploy: o que foi provado e o que não foi executado

**Não foi executado, e o motivo não é escolha:** o VPS **não é alcançável deste ambiente**. Medido — TCP 443 e TCP 22 para `financeiro.blackhaus.io` (`2.24.203.201`) não abrem, com timeout; e não é bloqueio geral de saída, porque o Supabase do CRM e o do financeiro responderam durante toda a sessão, e o GitHub também.

> **CORREÇÃO de 30/07/2026 11:36 — a inalcançabilidade era do momento, não do ambiente.** Remedido: **TCP 443 e TCP 22 abrem**, `GET /` devolve **200**, `GET /api/publico/config` devolve **200**, e o host e o IP estão no `known_hosts` deste Codespace. O que **continua verdade** é o parágrafo seguinte inteiro — o `index.html` servido ainda aponta `assets/index-DzZYJ0Ak.js` e não traz o `preload` da fonte, então **nada das sessões 14 e 15 está publicado**. O que caiu foi só o motivo: o deploy é executável daqui, e o que falta é credencial de acesso ao servidor, não rota de rede.

**O que foi provado, em árvore isolada no commit desta sessão** (worktree em `HEAD` limpo, sem os arquivos da sessão de UX):

```
npm test ..................... EXIT=0
npm --prefix web run build ... tsc --noEmit + vite build OK
                              dist/assets/index-Cpc05c79.js  449,82 kB (127,38 kB gzip)
node scripts/servir.ts ....... [financeiro] conectado como "app_financeiro_login"
                                          - sem BYPASSRLS, sem SUPERUSER
GET /api/publico/config ...... 200
GET /  ....................... 200, e serve assets/index-Cpc05c79.js
GET /api/faturas/x/documento . 401 {"erro":"TokenInvalido"}
```

E **reverificado na árvore final**, depois de a sessão de UX commitar:

```
npm test ..................... EXIT=0, 854 linhas `ok`
npm run web:build ............ OK, 206 modulos -> index-hNcReSCk.js 117,99 kB
                                                 icones-DGYYwgme.js 161,25 kB
                                                 plataforma-vWw_Z3Y-.js 352,75 kB
```

Ou seja: o artefato construído a partir deste commit **sobe, serve o bundle novo e recusa credencial inválida**. O que falta é o passo de quem tem acesso ao servidor:

```bash
cd /opt/financeiro/app
sudo -u financeiro git pull
sudo -u financeiro env PATH=/opt/financeiro/node/bin:$PATH npm run web:build
systemctl restart financeiro
systemctl status financeiro && journalctl -u financeiro -n 30
```

**Duas coisas para saber antes de rodar isso:**

1. ~~**`main` ainda não tem nada.** O trabalho das sessões 14 e 15 está no branch `sessao-14-cobranca-e-documento`. O `git pull` do VPS puxa `main` — então o deploy exige **merge para `main` primeiro**, e isso publica as duas sessões de uma vez.~~ **Corrigido em 30/07 11:36: essa ressalva também caiu, e ela já estava vencida quando eu a escrevi.** A sessão de UX commitou `b1710f5` às 04:19 **em cima** do meu commit e **empurrou `main`** — `main` = `origin/main` = `b1710f5` contém as duas sessões inteiras, e a árvore de trabalho está limpa. **O `git pull` do VPS basta; não há merge a fazer.** O único commit fora de `main` é `62e2f25`, que é este documento.
2. ~~**Não rode `web:build` no VPS enquanto a sessão de UX não tiver publicado.**~~ **Corrigido: essa ressalva caiu.** Ela era verdadeira quando eu a escrevi — `web/src/estilo.ts` tinha 18 erros de parse às 03:50 e o `tsc --noEmit` do build falhava. A sessão de UX commitou às 04:19 e **`npm run web:build` passa na árvore final**, com 206 módulos e o bundle em 3 pedaços. **O `web:build` é obrigatório neste deploy**, e não opcional: a SPA mudou inteira, e o `index.html` passou a carregar a fonte servida por nós.

**O que não foi verificado, e nenhuma verificação desta sessão substitui:** **nenhuma tela foi aberta** — não há browser neste ambiente —, e **o QR não foi lido por câmera de celular**. As 45 verificações provam que a matriz é um QR válido pelo padrão e que o texto volta inteiro; não provam que o aplicativo do banco o aceita. Isso é teste de campo, e é o primeiro que vale fazer quando o documento chegar a alguém.

Olhei o desenho em caractere de meio-bloco antes de fechar, e ele tem a forma certa: três localizadores nos cantos de cima e no de baixo-esquerda, **nenhum** no de baixo-direita, alinhamentos no interior, zona de silêncio. Um BR Code de 130 bytes deu **versão 8-M, 49×49 módulos**.

---

## 8. Por que a contagem de verificações não é comparável à da sessão 14

`npm test | grep -c '^ok '` deu **854**, `EXIT=0`. A sessão 14 registrou **571** pelo mesmo comando. **A diferença não é 283 de trabalho meu, e somar não fecha:**

| Origem | `ok` |
|---|--:|
| `tests/qrcode.ts` — desta sessão | 45 |
| `tests/repos-documento.ts` — desta sessão | 45 |
| `web/tests/tema.ts` — **da sessão de UX** | 141 |
| `web/tests/interface.ts` — **da sessão de UX** | 52 |

E o total se moveu **de 846 para 854 entre duas execuções minhas**, porque a outra sessão estava editando as suítes dela no intervalo. **Desta sessão são 90 verificações**, medidas contando `chk(` na fonte de cada suíte — não lidas da tela, que foi como eu errei antes.

Fica registrado como limitação do número, não como número: enquanto duas sessões editam a mesma árvore, o total do `npm test` é uma foto e não um marco.

---

## 9. O que muda para quem opera amanhã

1. **jogue fora o mapa de 29/07.** Use `ATRIBUICAO-originador-2026-07-30.md`, e **reconfira imediatamente antes de digitar** — a consulta está na `Q-CRMCODIGO-01`. O CRM se moveu duas vezes em quatro dias;
2. **são dois CPF/CNPJ, não três.** Renata e Out Sales. Se a `Jezielly Vieira` deve ser cadastrada mesmo com zero UCs é pergunta do dono — cadastrar não paga nada, e eu não escolhi;
3. o resto do caminho não mudou: **compor** na Carteira, **emitir e cobrar** nas Faturas, **conferir** nos Relatórios com CSV, **logo e campos** no Documento;
4. **a faixa de pagamento agora tem o quadrado.** Enquanto o A1 não chegar é Pix estático: o cliente aponta a câmera ou copia o código, e **a baixa continua manual** — o dinheiro chega sem dizer de quem é;
5. **o sistema no ar ainda é o de 29/07.** Publicar é decisão de quando, e o §7 tem os comandos e as duas ressalvas.
