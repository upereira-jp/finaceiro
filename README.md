# Financeiro G3 Solar

Sistema financeiro multi-tenant da G3 Solar: faturamento de crédito de energia, comissão de originadores e repasse a donos de usina. O CRM ao lado é **fonte de leitura e nada mais** — nenhuma linha dele é modificada por este sistema.

| Campo | Valor |
|---|---|
| **Dono** | Vinicius Leal |
| **Fase atual** | F0 fechada · F1 com os três critérios formais cumpridos · **F2 e F3 construídas em 28/07, depois de a `PAUTA-contador.md` voltar respondida.** 20 migrations, `fatura`, `boleto`, `liquidacao`, `split_execucao` e `split_item` no banco, dois motores puros, a `PortaDeCobranca` injetada e **571 verificações** em 27 suítes. O que segura a F2 agora é **um certificado A1**, não código: o critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura"*, e o ciclo inteiro está provado contra o adaptador falso. Ver `RESUMO-SESSAO-10.md`. Histórico da F1 preservado abaixo: **F1 em execução, e não fecha só com código nosso.** 15 migrations no Supabase `sa-east-1`, role de runtime, composition root, seis repositórios, 37 rotas, auth próprio medido ponta a ponta contra o Supabase real, conector do CRM construído e testado, e os 8 invariantes de catálogo verdes **contra produção**. A `Q-VIEWS-01` fechou no mesmo dia e o **invariante 9 está cumprido**. O ciclo rodou **valendo, duas vezes**, contra o CRM real e os três critérios formais fecharam; a `Q-ESCOPO-01` (conector entrega 1 de 4 entidades) é a vermelha que resta. Ver a tabela de critérios abaixo |
| **Atualizado** | 30/07/2026 · fim da sessão 14 — o eixo do originador, o caminho de cobrança inteiro na tela e o documento de cobrança. Ver `RESUMO-SESSAO-14.md`. **No mesmo dia, o acabamento visual da SPA:** tipografia própria, Phosphor exclusivo, tabela e input não-nativos, e as **191 verificações** que passaram a prender contraste, movimento e navegação — a regra 8 chegando à camada de apresentação. Ver `INTERFACE-2026-07-30.md` |
| **No ar** | **`https://financeiro.blackhaus.io`** — systemd, Node 22 isolado, TLS até 26/10. Mesmo VPS do CRM, **sem alterar uma linha da configuração dele**. **O bundle em produção é o de 29/07 (`index-DzZYJ0Ak.js`)** — as sessões 14 e 15 não foram publicadas, e o `main` ainda não as tem. Comandos e as duas ressalvas do deploy em `RESUMO-SESSAO-15.md` §7 |

---

## Comece por aqui

Nesta ordem. Cada documento pressupõe o anterior.

1. **`RESUMO-SESSAO-15.md`** — **comece por aqui.** As três pendências do documento de cobrança fechadas, e o achado que apareceu ao **remedir** o CRM antes de construir: 76 merges de lead em 30/07 tornaram `lead.codigo` instável, tiraram um nome da lista de originadores e moveram duas atribuições de comissão. A §2 conta os dois defeitos que a verificação do QR pegou — um deles dentro do próprio instrumento de medida
2. **`RESUMO-SESSAO-14.md`** — A sessão do caminho de cobrança: o eixo do originador decidido e medido, as três telas que faltavam, as duas migrations e as cinco decisões do documento. Traz também os quatro erros meus que o processo pegou, com o que cada um ensinou
2. **`RESUMO-SESSAO-13.md`** — Estado atual e a fila com dono nomeado. A sessão em que a `Q-ORIGINADOR-01` foi decidida — e em que conferir a premissa contra o CRM antes de gravar mudou o que precisava ser perguntado
2. **`RESUMO-SESSAO-12.md`** — a sessão da verificação: produção conferida ponta a ponta, o defeito silencioso da tela de Contratos medido nos dois sentidos, e a vermelha que abriu **antes** dos 39 contratos
2. **`RESUMO-SESSAO-11.md`** — a sessão do deploy: a paleta da G3, o sistema em produção, dois logins e duas questões novas
2. **`MAPA-UX-2026-07-29.md`** — a revisão de UX da SPA, na manhã do mesmo 29/07: rotas por caminho, busca e ordenação, caixa de sentença
2. **`RESUMO-SESSAO-10.md`** — a sessão em que a `PAUTA-contador.md` voltou e a carteira foi construída
2. **`SPEC-003-carteira.md`** — a spec da F2 e da F3. A §3 rastreia qual resposta do contador produziu qual coluna
3. **`RESUMO-SESSAO-9.md`** — a sessão anterior. O roteiro que fechou a F1 está na **§11 do `RESUMO-SESSAO-8.md`**, e ele já foi executado por inteiro
2. **`CLAUDE.md`** — as onze regras inegociáveis. Antes de qualquer linha de código
3. **`PRD-v2.2.md`** §7 e §8 — fronteira com o CRM
4. **`adr/ADR-0003-contexto-de-tenant.md`** (r2) — como o isolamento funciona de fato, e a que preço
5. **`SPEC-001-fundacao.md`** (v2.9) — a spec da F1. §3.2 é o contrato do middleware; §3.4 é a lista das **dez** FKs compostas — as linhas 536 e 565 ainda dizem nove, e é a `Q-SPEC001-08`
6. **`GLOSSARIO.md`** — se um termo está lá, é assim que ele se chama em spec, em código e em conversa

`QUESTOES.md` se consulta sob demanda, e é onde toda lacuna vira entrada (regra 10). Os `RESUMO-SESSAO-2` a `-8` são a trilha datada: cada um diz o que foi medido, **o que foi retirado depois de medido**, e o que ficou na fila.

---

## Hierarquia normativa

Em conflito, a ordem é:

```
CLAUDE.md  →  PRD-v2.2  →  ADRs  →  SPECs
```

Uma regra do `CLAUDE.md` não é flexibilizada por spec, por prazo ou por conveniência de implementação. É alterada lá, com versão nova, ou não é alterada.

---

## Estrutura

```
CLAUDE.md                    regras inegociaveis — camada mais alta
PRD-v2.2.md                  fonte de verdade do produto
GLOSSARIO.md                 vocabulario unico (rev. 3)
QUESTOES.md                  registro unico de questoes abertas, com taxonomia de severidade
SPEC-001-fundacao.md         spec da F1 (v2.9)
SPEC-002-conector.md         spec do conector (v1.4)
SPEC-003-carteira.md         spec da F2 e F3 — faturamento, cobranca e split.
                             Escrita DEPOIS das respostas do contador, e a 3
                             diz qual resposta virou qual coluna
_TEMPLATE-SPEC.md            anatomia fixa das specs
RESUMO-SESSAO-2.md           passagem da sessao 2
RESUMO-SESSAO-3.md           passagem da sessao 3
RESUMO-SESSAO-4.md           passagem da sessao 4
RESUMO-SESSAO-5.md           passagem da sessao 5 — generate destravado, R14 e os repos
RESUMO-SESSAO-6.md           passagem da sessao 6 — as 12 migrations e o crash do GRANT
RESUMO-SESSAO-7.md           passagem da sessao 7 — role de runtime, 37 rotas, auth
RESUMO-SESSAO-8.md           passagem da sessao 8 — a §11 e o roteiro que fechou
                             a F1, ja executado por inteiro
RESUMO-SESSAO-9.md           passagem da sessao 9 — o sinal da Q-UC-DISTRIB-01
RESUMO-SESSAO-10.md          passagem da sessao 10 — a PAUTA respondida e a
                             carteira inteira
RESUMO-SESSAO-11.md          passagem da sessao 11 — COMECE POR AQUI. A paleta
                             da G3, o deploy em producao ao lado do CRM sem
                             tocar nele, os dois logins e as duas questoes que
                             o caminho da Sicoob fez aparecer
RESUMO-SESSAO-12.md          passagem da sessao 12 — Producao conferida, o
                             defeito silencioso da tela de Contratos medido
                             antes e depois, e as duas questoes que aparecem
                             ANTES dos 39 contratos
RESUMO-SESSAO-15.md          passagem da sessao 15 - COMECE POR AQUI. As tres
                             pendencias da Q-DOCFATURA-01 fechadas (desenho do QR,
                             teste do repo, logo no payload) e a vermelha nova
                             Q-CRMCODIGO-01, achada ao REMEDIR o CRM antes de
                             construir. A 6 reune seis erros meus, dois deles
                             dentro do proprio instrumento de medida; a 7 diz o
                             que do deploy foi provado e o que nao foi executado,
                             e por que; a 8 explica por que a contagem de
                             verificacoes NAO e comparavel a da sessao 14
RESUMO-SESSAO-14.md          passagem da sessao 14 — COMECE POR AQUI. O eixo do
                             originador (vendedor_origem) medido contra o CRM, as
                             tres telas que faltavam (Cobranca, Faturas,
                             Relatorios) mais a aba Documento, as migrations 19 e
                             20 e as cinco decisoes do documento de cobranca. A 7
                             lista quatro erros meus que os testes e o catalogo
                             pegaram - inclusive uma citacao que eu inventei
RESUMO-SESSAO-13.md          passagem da sessao 13 — A
                             Q-ORIGINADOR-01 decidida, a premissa conferida
                             contra o CRM antes de gravar, o campo obrigatorio
                             na tela e a decima camada da prontidao
ATRIBUICAO-originador-2026-07-30.md
                             O MAPA VIGENTE, remedido em 30/07 e ordenado por UC -
                             a chave ESTAVEL. Substitui o de 29/07: 76 merges de
                             lead renumeraram 39 dos 41 codigos, tiraram a Jezielly
                             Vieira da lista (zero cards hoje) e moveram duas
                             atribuicoes para o Out Sales, uma delas de 1.987,2
                             kWh/mes. A lista de originadores e de DOIS nomes.
                             40 das 41 origens agora sao LEGIVEIS pelas views, e as
                             12 que eram invisiveis bateram uma a uma - Q-CRMCODIGO-01
ATRIBUICAO-originador-2026-07-29.md
                             O MAPA DAS 41 linhas do rateio -> originador, depois
                             de o dono decidir que o originador e o vendedor_origem
                             ate segunda ordem. Tres nomes. A coluna `fonte` e o
                             que importa: 28 atribuicoes o financeiro LE nas views,
                             12 existem no CRM e sao INVISIVEIS a elas (card em
                             etapa normal; a view expoe so `won`) e 1 e
                             desconhecida (lead arquivado). Este documento e o
                             unico portador das 12 - Q-ORIGVEND-01
MAPA-UX-2026-07-29.md        a revisao de UX da SPA: caixa de sentenca, rotas
                             por caminho, busca/filtro/ordenacao, tema claro
                             como padrao. O que ficou de fora esta la, com nivel
INTERFACE-2026-07-30.md      O REGISTRO DO ACABAMENTO VISUAL: o que mudou, o que
                             foi medido (contraste, bundle), o que a conferencia
                             VISUAL pegou - tres defeitos que a leitura de codigo
                             nao pegaria, um deles um icone de "nao sei" numa
                             fatura emitida com sucesso - e a divergencia do
                             Lottie, que virou Q-LOTTIE-01. As 12 telas foram
                             RENDERIZADAS em Chromium nos dois temas: e a primeira
                             vez que a interface deste projeto e conferida por
                             imagem, e nao por leitura
PAUTA-contador.md            as 10 perguntas fechadas, RESPONDIDAS em 28/07. O
                             corpo fica intacto; a tabela do fim e o de-para
VIEWS-PROPOSTAS-r2.sql       DDL proposta ao dev do CRM. EXECUTADA - as 8 views
                             existem e expoem crm_tenant_id desde 27/07 (Q-VIEWS-01)
PROMPT-dev-crm-rodada3-...   o pedido em aberto ao dev do CRM (27/07)
.env.example                 formato do .env. Le os comentarios: a porta importa

adr/
  ADR-0002-...               modelo de tenant e de cliente, pos-auditoria
  ADR-0001-...               estrategia de multi-tenancy: banco unico, RLS por linha (retroativa)
  ADR-0003-...               contexto de tenant: SET LOCAL por transacao (r2, aceita)
  ADR-0004-...               provisionamento: organizacao, dominio e host (aceita)
  ADR-0005-...               onde mora o segredo do tenant (PROPOSTA, aguarda
                             decisao). Pre-requisito do adaptador Sicoob real:
                             a credencial_ref aponta para um cofre que nao existe

auditoria/
  P7-...                     topologia de funis do CRM
  P8-...                     reverificacao de 24/07
  PATCH-citacoes-...         reaponta as 18 citacoes ao CLAUDE.md que nunca existiu
  reparo-citacoes-....patch

spike-adr0003/               21 testes, tres variantes de contexto de tenant. ./run.sh
spike-transacao/             12 testes de $transaction/$extends do Prisma sobre RLS. ./run.sh

src/app.ts                   COMPOSITION ROOT - o unico lugar que instancia client,
                             pool e adapter. Recusa o arranque se a role tiver BYPASSRLS
src/db/pools.ts              os dois pools: transacional 8/15s, relatorio 2/60s
src/db/contexto.ts           ponto UNICO de emissao do contexto. RBAC e trilha
src/db/tipado.ts             devolve os 19 modelos aos repos sem contexto.ts conhece-los
src/auth/sessao.ts           login, escolha de tenant validada, caminho de plataforma
src/repos/cliente.ts         cadastro, busca por documento, baixa logica
src/repos/contrato.ts        R14 e a ORDEM da renovacao: encerra o velho antes de inserir
src/repos/unidade_consumidora.ts  cadastro da UC. NAO edita rateio - ver rateio.ts
src/repos/usina.ts           usina e geracao mensal. Decimal entra como STRING
src/repos/originador.ts      documento OBRIGATORIO aqui; R20 congela no contrato
src/repos/prontidao.ts       o que FALTA para uma competencia poder ser faturada.
                             DEZ camadas de uma vez, com dono nomeado. Conta e
                             NAO decide. `nao_medido` nao e `ok`
src/repos/rateio.ts          R11, o teto de 100% por usina. Unico caminho de escrita
src/repos/dono_usina.ts      para quem vai o repasse. Exige PIX ou conta completa
src/repos/regras.ts          tarifa, regra_comissao e regra_repasse. NAO ha editar:
                             a unica escrita e abrir vigencia, que fecha a anterior
src/repos/fatura.ts          compoe o lote pela GERACAO MEDIDA. A conta fica no
                             SERVIDOR - R23, uma implementacao da formula
src/repos/boleto.ts          fala com a PORTA, nunca com a Sicoob. A falha de
                             registro COMMITA e a rota traduz em 502
src/repos/liquidacao.ts      o evento de caixa, e o unico gatilho do split
src/repos/split.ts           junta insumo, chama o motor puro, persiste
src/dominio/centavos.ts      aritmetica de dinheiro em BigInt. A divergencia do
                             float foi MEDIDA: aparece abaixo de 1%, nao nas taxas de hoje
src/dominio/faturamento.ts   quem entra no lote e quem e recusa contada
src/dominio/split.ts         PRD 5.3 a 5.5, funcao PURA. O liquido G3 e subtracao
src/sicoob/porta.ts          a interface. Nenhum tipo aceita segredo - so credencial_ref
src/sicoob/falso.ts          adaptador determinista, com memoria. Sem rede
src/http/rotas.ts            as 78 rotas (contadas em 29/07; eram 37 quando a
                             matriz fechou, em 27/07). A matriz de papeis NAO e
                             aplicada aqui
src/http/servidor.ts         node:http puro. O Autenticador vem de FORA, por injecao.
                             A API mora sob /api; todo o resto e a SPA. Travessia
                             barrada por RESOLUCAO de caminho, nao por filtro de ".."
scripts/servir.ts            O ENTRYPOINT. `npm start` (producao) / `npm run servir`
                             (local). Sobe a API e serve web/dist se existir
web/                         A SPA: React + Vite, tsconfig proprio. `npm run web:dev`
                             (5173, com proxy para a 3000) e `npm run web:build`.
                             ONZE telas: as quatro de cadastro na ORDEM das
                             camadas da prontidao, e depois a ordem dos ATOS do
                             dinheiro - Carteira (compor), Faturas (emitir,
                             boleto, baixa), Cobranca (o conector) e Relatorios
web/src/tema.ts              CORES E TIPOGRAFIA, num lugar so. A paleta e a DA G3
                             desde 28/07; o que esta marcado [derivado] (estados
                             semanticos, tema escuro, hover) segue sendo escolha
                             de quem escreveu o codigo. Nenhuma tela tem cor
                             literal, e todo par tem o contraste AA medido - e
                             desde 30/07 isso e TESTE e nao comentario. A fonte
                             (Inter) e SERVIDA POR NOS: o argumento antigo contra
                             webfont continua no arquivo, e o que o resolve e
                             `font-display: swap` com a pilha de sistema atras
web/tests/tema.ts            as 139 verificacoes da paleta. Confere a propria
                             calculadora antes de julgar as cores (preto sobre
                             branco e 21:1 por definicao), e a T4 pega a classe
                             que o tsc NAO pega: token novo em `Paleta` que
                             ninguem emitiu como custom property - o sintoma e um
                             `var(--x)` que resolve para nada e descarta a regra
                             CSS inteira, sem erro. JA PAGOU: `--fundo-suave`
                             nunca existiu e estava em uso na tela de Faturas
web/src/estilo.ts            O CSS INTEIRO, numa string e num modulo PURO - saiu
                             do ui.tsx em 30/07 justamente para poder ser lido por
                             teste. As tres cores literais do documento impresso
                             sao excecao NOMEADA, e a lista e fechada: papel e
                             preto sobre branco independente do tema da tela
web/src/iconografia.ts       o vocabulario FECHADO de icones: os tres estados, os
                             tres avisos, os seis status de fatura e a lista do que
                             se MOVE. Nenhuma tela escolhe desenho - ela pede um
                             nome semantico
web/src/icones.tsx           os desenhos do Phosphor. `Record<NomeDeIcone, Icon>`
                             exaustivo: nome sem desenho NAO COMPILA. Import
                             profundo por icone, e o custo esta MEDIDO - 37,7 KB
                             gzip para 54 icones, num pedaco proprio do bundle.
                             O logotipo e a UNICA excecao: marca e identidade,
                             nao iconografia
web/src/navegacao.ts         rota, titulo, icone e grupo das 12 telas, como DADO.
                             A ordem e decisao documentada (as camadas da
                             prontidao, depois os atos do dinheiro) e agora tem
                             teste - inclusive o "caminho desconhecido cai na
                             Prontidao", que estava so em comentario
web/tests/interface.ts       as 52 verificacoes da apresentacao: cor literal,
                             movimento nos DOIS sentidos (nada anima por acidente),
                             prefers-reduced-motion, unicidade da navegacao e a
                             forma da tabela
web/public/fontes/           a Inter variavel (48 KB, latino) e a licenca OFL. O
                             nome carrega a VERSAO porque o servirEstatico manda
                             `immutable` por um ano e o public/ do Vite nao recebe
                             hash no nome
web/src/dinheiro.ts          a regra 1 no browser: reais viram centavos por TEXTO,
                             sem multiplicar por 100 e sem float
web/src/dados.ts             `useDados`/`useAcao` e o `emLotes`. NENHUMA tela
                             engole erro: so o 404 de `contrato-vigente` vira
                             "sem contrato". O teto de 6 e do pool transacional,
                             e precisa ser NOSSO - producao e h2, e la o browser
                             nao limita nada
web/tests/lotes.ts           a primeira suite do web/. Prende o teto nos dois
                             sentidos: respeitado E atingido
web/src/contrato-regras.ts   as condicoes de criacao de contrato, PURAS e fora
                             do .tsx - o runner do web/ nao le JSX, entao regra
                             dentro do componente e inalcancavel por teste
                             (regra 8). E aqui que mora a Q-ORIGINADOR-01: sem
                             originador o botao TRAVA
web/src/cobranca-regras.ts   as regras da cobranca, PURAS e fora do .tsx. Duas
                             coisas: a REGRA 5 no formulario - o campo pede uma
                             referencia, e colar PEM, JWT, client_secret ou
                             base64 longo TRAVA o botao com o sinal nomeado -, e
                             o espelho das transicoes do servidor (so rascunho
                             emite, so emitida ganha boleto, baixa so em emitida
                             ou vencida), cada uma citando a linha que manda
web/tests/cobranca.ts        as 19 verificacoes dessas regras, nos dois sentidos.
                             Inclui o total da baixa ao CENTAVO, soma de inteiros
web/src/csv.ts               a exportacao, pura: separador `;` (Excel pt-BR), BOM
                             UTF-8, escape das aspas e do `;`, e dinheiro por
                             STRING a partir dos centavos - a regra 1 vale na
                             SAIDA tambem, que e onde ninguem procura
web/tests/csv.ts             as 16 verificacoes do CSV. `paraCsv` e testavel
                             porque o download mora em `baixar.ts`, separado
web/src/baixar.ts            o clique que baixa o arquivo. Toca `document` e
                             `URL`, que o runner do web/ nao tem - e por isso
                             esta FORA do csv.ts
web/src/telas/faturas.tsx    o caminho que faltava: emitir (lote e unitaria),
                             pedir o boleto, ver linha digitavel e Pix, e a BAIXA
                             MANUAL - que e o unico gatilho de split que funciona
                             sem certificado A1. Exporta CSV da competencia
web/src/telas/cobranca.tsx   o conector da Sicoob e o estado do A1. O 412 do
                             servidor e RESPOSTA ("nao ha conector"), nao falha
                             de leitura, e a tela distingue os dois. Diz o que
                             falta para um boleto ser pagavel, com o ID da questao
web/src/telas/relatorios.tsx repasse por dono, comissao por originador e uso da
                             usina - as tres views do banco, que ja respondiam e
                             nao tinham tela. Cada uma com CSV
web/src/telas/documento.tsx  a aba da logo, dos campos e da PREVIA imprimivel. A
                             previa E o documento: ela pinta o retorno de
                             `GET /faturas/:id/documento`, a mesma rota que o CRM
                             vai consumir. `window.print()` gera o PDF, e o CSS de
                             impressao esta no ui.tsx
web/tests/contrato.ts        as 9 verificacoes dessas regras. A do originador nos
                             DOIS sentidos - trava sem, destrava com
src/http/erros.ts            erro de dominio -> HTTP. 500 nao vaza mensagem interna
src/auth/jwt.ts              JWT do Supabase por node:crypto. O alg sai da CHAVE, nao do header
src/auth/autenticador.ts     Bearer -> auth_user_id. Auth PROPRIO (MT-06 resolvida)
src/dominio/documento.ts     CPF e CNPJ, inclusive alfanumerico (31/07/2026)
src/dominio/brcode.ts        O BR CODE do Pix estatico - EMV TLV + CRC16/CCITT-FALSE.
                             PURO e com 33 verificacoes, porque os dois modos de
                             falha nao se parecem: CRC errado o app RECUSA (ninguem
                             perde dinheiro); chave ou valor errados com CRC certo
                             o app ACEITA, e num Pix estatico nao ha txid por
                             fatura para conciliar depois. Valor entra em CENTAVOS
src/dominio/qrcode.ts        O DESENHO do QR - modo byte, Reed-Solomon sobre
                             GF(256), oito mascaras com as quatro regras de
                             penalidade, versoes 1 a 12 nos quatro niveis. O SVG
                             sai do SERVIDOR e vai no payload do documento: o CRM
                             consome a mesma rota e nao roda React. O `d` do
                             caminho e montado SO de indices da matriz, entao
                             nenhum dado de fatura atravessa a string - e o que
                             torna seguro o consumidor pinta-lo direto. Teto na
                             versao 12 e LEVANTA com o limite nomeado: o pior BR
                             Code possivel tem 243 bytes e cabe na 11, e truncar
                             daria um QR legivel apontando para um Pix incompleto
src/dominio/layout-do-documento.ts
                             As linhas do documento, na ordem e formatadas. O
                             PADRAO vive aqui, nao no banco: `campo_do_documento`
                             vazio significa "usa o padrao", e semear um padrao na
                             migration decidiria o layout de todo tenant futuro.
                             AUSENTE NAO E ZERO, e vale para dinheiro tambem -
                             `valor_total_centavos` e GENERATED e aceita nulo
src/repos/documento.ts       identidade, logo, campos e `paraFatura` - a composicao
                             do documento. Esta no SERVIDOR de proposito: a
                             decisao 4 pediu a rota do CRM preparada, e o CRM nao
                             roda React. A tela e um dos dois consumidores, nao a
                             dona do formato
src/crm/conexao.ts           pool do CRM. RECUSA o arranque se a credencial tiver
                             escrita, BYPASSRLS ou alcance fora de financeiro.*
src/crm/leitura.ts           PONTO UNICO de leitura. SQL constante, lista fechada
                             das 8 views. Nao ha funcao que aceite nome de tabela
src/crm/sincronizacao.ts     o ciclo: dedup, idempotencia, recusas contadas e a
                             reconciliacao em tres classes. Porta INJETADA
prisma/migrations/           VINTE, em ordem. A 19 traz o documento de
                             cobranca: identidade (Pix recebedor + metadado da
                             logo), o binario em tabela propria e o layout por
                             tenant com a lista de campos FECHADA POR ENUM. A
                             logo audita por PROPAGACAO - bytea em to_jsonb custa
                             2,00x (medido), entao o gatilho carimba o sha256 na
                             tabela auditada em vez de jogar o arquivo na trilha.
                             O mime sai da ASSINATURA do arquivo, nao do rotulo:
                             SVG e recusado porque a logo e embutida no HTML.
                             A 20 acrescenta UNIQUE (tenant_id, identidade_id),
                             redundante para o banco e NECESSARIA para o gerador:
                             sem ela o db pull produz uma relacao to-one que o
                             prisma generate recusa com P1012. E a regra 11 numa
                             direcao nova - ver Q-PRISMA11B-01.
                             16 traz a carteira, 17 o split e a
                             parcela da comissao, 18 o conector de cobranca. As
                             quinze primeiras: 13 fecha Q-AUDIT-01 e Q-DISTRIB-01;
                             14 traz conector_execucao; 15 corrige o gatilho de
                             auditoria que a 14 esqueceu (o teste G2 acusou)
prisma/schema.prisma         vem do `db pull`. NAO editar a mao - ver regra 11
prisma/seed/                 regra_comissao e tarifa, idempotente
scripts/bootstrap-plataforma-admin.sql
                             PROVISIONAMENTO, nao migration. O primeiro admin de
                             plataforma. Exige -v modo=ensaio ou -v modo=valendo
scripts/provisionar-tenant.sql
                             PROVISIONAMENTO do primeiro tenant DO FINANCEIRO
                             (nao do CRM), o vinculo admin e o conector_crm
scripts/provisionar-usuario.sql
                             PROVISIONAMENTO do SEGUNDO usuario em diante, num
                             tenant que ja existe. Nao havia caminho: os outros
                             dois scripts cobrem so o primeiro, e nao ha rota de
                             gestao de usuario. Guarda o e-mail CONFIRMADO -
                             sem isso a linha nasce certa e a pessoa nao loga
scripts/cadastrar-originadores.ts
                             CADASTRO dos originadores, pelo caminho da
                             aplicacao. A lista vem de ARQUIVO, nao do corpo do
                             script: `documento` e NOT NULL e e CPF/CNPJ de
                             pessoa real, e `tipo` decide quanto ela recebe.
                             Medido em 29/07: `financeiro.parceiros` tem 9 linhas
                             e NAO expoe documento nenhum - o CRM nao e fonte
                             disto. Confere o lote INTEIRO antes de escrever, e
                             digito que nao fecha aborta tudo: `classificar()`
                             gravaria com documento_validado=false e nao ha R9
                             para originador. `npm run originadores`
scripts/ciclo-crm.ts         COMPOSICAO do ciclo: liga pool do CRM, leitor e
                             motor. Exige --ensaio ou --valendo. `npm run ciclo`
scripts/faturar.ts           COMPOSICAO do lote de faturamento. Exige --ensaio ou
                             --valendo E --competencia: nao ha "mes corrente" por
                             default. `npm run faturar`
scripts/verificar-auth-real.ts
                             auth ponta a ponta contra o Supabase real. Sem token
                             no stdin faz so o preflight do JWKS, que nao pede
                             credencial. `npm run auth:verificar`
tests/qrcode.ts              as 45 verificacoes do QR, e o assunto principal do
                             arquivo e COMO elas se verificam: nenhuma compara a
                             saida com constante minha. Sindrome nula (usa a tabela
                             do corpo, NAO a divisao que gerou a paridade),
                             divisibilidade do BCH por rotina de bits escrita de
                             outro jeito, distancia de Hamming do codigo, total de
                             codewords DERIVADO da geometria contra as ancoras
                             publicadas, a paridade publicada do exemplo do ISO
                             18004 com os codewords de dado derivados a mao, e
                             ida-e-volta por decodificador separado que redescobre
                             os modulos de funcao por PREDICADO. Pegou dois
                             defeitos - ver RESUMO-SESSAO-15 2
tests/repos-documento.ts     as 45 verificacoes do repo de documento, com BANCO e
                             pela role sem BYPASSRLS. Cobre o que NAO mora no
                             codigo: o mime pela ASSINATURA do arquivo (SVG e GIF
                             recusados pelos bytes), o sha256 derivado pelo GATILHO
                             e conferido contra node:crypto, a lista de campos
                             fechada pelo ENUM, e o isolamento das seis leituras de
                             paraFatura. Afirma a RELACAO, nao constante: fixar um
                             total seria fixar dependencia de ordem de execucao
tests/catalogo.sql           CAT-1 a CAT-8: as regras 1, 2, 3 e 11 por catalogo.
                             Leitura pura - RODE TAMBEM contra producao:
                             psql "$DIRECT_URL" -f tests/catalogo.sql
tests/carteira.sql           as invariantes da carteira que sao DO BANCO, cada
                             uma nos dois sentidos
tests/dominio-carteira.ts    os dois motores SEM banco. A invariante do centavo
                             em 2.000 combinacoes
tests/repos-carteira.ts      o ciclo do dinheiro ponta a ponta, pela role sem
                             BYPASSRLS e pelo adaptador falso
tests/                       854 verificacoes em 30 suites. `npm test` roda todas.
                             A CONTAGEM E `npm test | grep -c '^ok '`, e o metodo
                             esta escrito aqui porque os numeros anteriores (461,
                             496) vinham de uma soma que nao se reproduzia: so 15
                             das 30 suites anunciam total proprio
tsconfig.json                `npm run typecheck` = tsc --noEmit. Roda no CI
```

Os dois spikes são **reproduzíveis**, não relatos. `RESULTADOS.txt` em cada um é saída de execução real.

---

## O que a F1 tem que respeitar

Decidido e medido, não opinado. Detalhe em `adr/ADR-0003` r2.

- `tenant_id uuid NOT NULL` em toda entidade de negócio, **desde a migration 1**
- **FK composta `(tenant_id, id)`** em toda referência entre entidades de negócio, com `UNIQUE (tenant_id, id)` nas referenciadas. Medido: FK simples atravessa tenant e o banco aceita
- RLS `ENABLE` + `FORCE` + ao menos uma policy em toda tabela com `tenant_id`. RLS sem policy nega tudo em silêncio — **82** das 151 tabelas do CRM estão nesse estado
- **A role de runtime não pode ter `BYPASSRLS`.** Medido em 27/07: a role `postgres` do Supabase tem `rolbypassrls = true`, e conectar com ela anula as 24 policies e o `FORCE` de uma vez. Ela não nasce em migration nenhuma, de propósito — é provisionamento, e sem ela o isolamento é enfeite
- `SET LOCAL`, **nunca `SET`**. Medido: `SET` sem `LOCAL` sobrevive à devolução da conexão ao pool e contamina a requisição seguinte
- Ponto único de emissão do contexto, dentro de `$transaction`, reconstruindo a operação no client de transação
- `timeout` e `maxWait` explícitos. Os defaults do Prisma são 5.000 ms e 2.000 ms, e nenhum dos dois serve
- Vigência de `regra_comissao` e `tarifa` sem sobreposição, **recusada pelo banco** (`EXCLUDE USING gist`, exige `btree_gist`). Alíquota não pode depender de qual linha o planejador devolveu primeiro
- Tarifa em `numeric(12,6)` R$/kWh. Dinheiro em centavos; **taxa não é dinheiro**, e centavos truncariam a tarifa
- Teste de vazamento no CI, pool de tamanho 1, desde o primeiro dia

---

## Como aplicar as migrations

As migrations são **SQL puro**, não geradas por `prisma migrate dev`. São **vinte**, todas aplicadas em produção (as duas últimas em 30/07). A ordem importa. As três primeiras montam a fundação, conforme a `SPEC-001` §3.2:

```
prisma/migrations/20260725120000_fundacao_schema/   tabelas, enums, as 10 FKs compostas
prisma/migrations/20260725120100_isolamento_rls/    app.current_tenant_id(), RLS FORCE, policies
prisma/migrations/20260725120200_rbac_e_trilha/     RBAC dois níveis, RLS de plataforma, trilha da R2
```

Aplicar — **só `migrate deploy`**, nunca `migrate dev`, `db push` ou `migrate reset`:

```bash
npx prisma migrate deploy    # transacional POR MIGRATION. E o que salva de meia-aplicacao
```

Validar num banco limpo:

```bash
npm test          # typecheck + as 30 suites, 854 verificacoes (linhas `ok`)
npm run typecheck # sozinho, tsc --noEmit
```

As suítes precisam de PostgreSQL em `127.0.0.1:5432`. Se não houver:

```bash
docker run -d --name pg16 -e POSTGRES_PASSWORD=spike -p 5432:5432 postgres:16
```

O mesmo roda no CI (`.github/workflows/isolamento.yml`), com PostgreSQL 16 de serviço — `ADR-0004` condição 5 e `SPEC-001` §9 exigem que o teste de vazamento corra fora da máquina de produção desde o primeiro dia.

**Quatro coisas para saber antes de mexer:**

1. **`prisma/schema.prisma` vem do `db pull` e não se edita à mão.** O schema declarado é derivado do real, nunca o contrário. Editar compila e o `db pull` seguinte reverte em silêncio — é a regra 11, e o custo dela foi medido: uma relação tipada errado devolveu um contrato de R$ 111,00 onde o vigente valia R$ 789,00.
2. **A conexão do CLI é `DIRECT_URL`, e ela tem que ser o *session pooler* na 5432.** O host direto `db.<ref>.supabase.co` é **IPv6-only** sem o add-on de IPv4 e não conecta de Codespaces nem de CI. A porta 6543 é *transaction pooler* e não serve para migration — não falha com mensagem útil, pendura. Detalhe no `.env.example`.
3. **Nunca use rolespec por palavra-chave em `GRANT`/`REVOKE` de role.** Medido em 27/07 contra Supabase, PG 17.6: `GRANT <role> TO CURRENT_USER` **derruba o backend do Postgres** e chega ao Prisma disfarçado de `P1017`. Vale para `CURRENT_ROLE` e `SESSION_USER`. A forma segura é `EXECUTE format('GRANT … TO %I', current_user)`. Foi a causa raiz da migration 10 aplicada pela metade — `RESUMO-SESSAO-6` §1 e §2.
4. **`prisma migrate` precisa do `binaries.prisma.sh`.** O Prisma 7 dispensa o engine Rust em *runtime* sobre driver adapter, mas a CLI ainda baixa o `schema-engine` para migrar.

---

## Onde a F1 está, contra os critérios formais

Medido em 27/07 contra o `PRD-v2.2` §10, não estimado. **Os três critérios de saída da F1:**

| Critério de saída | Evidência | |
|---|---|---|
| `migrate reset` limpo | `tests/run.sh` aplica as 15 migrations em banco vazio a cada `npm test`; `EXIT=0` | ✅ |
| sync idempotente | ✅ **cumprido contra o CRM real em 27/07.** Duas execuções valendo: 48 lidos, 41 criados na 1ª, **0 criados e 0 atualizados na 2ª**, com um único instante de `criado_em` nas 41 linhas. Também provado em 1.000 linhas pelo `N30` | ✅ |
| escrita no CRM falha por permissão | automatizado em 27/07: `N21`/`N21b` (a guarda de arranque recusa credencial com escrita, inclusive privilégio **herdado por role**) e `N25` (a sessão é read-only). A medição por catálogo que dizia "0 privilégio de escrita" veio de método fraco — ver `Q-PGNET-01` | ✅ |

**As entregas nomeadas da F1:**

| Entrega | Estado |
|---|---|
| projeto, auth, RBAC dois níveis | ✅ auth medido contra o Supabase real; RBAC com as 16 células do PRD §3 |
| schema completo com `tenant_id` | ✅ 13 migrations, 20 tabelas com RLS, 24 policies, **zero** tabela com `tenant_id` sem policy |
| cadastros | ⚠️ 6 repositórios para 11 modelos de negócio — faltam `dono_usina`, `regra_comissao`, `regra_repasse`, `tarifa`, `cliente_estado_crm` |
| **conector CRM read-only** | ✅ **as 4 entidades da `SPEC-002` §2 espelhadas** — `cliente`, `usina`, `usina_geracao` e `unidade_consumidora`, com a `PortaDeLeitura` em 7 das 8 views. Rodado valendo contra o CRM real: 76 clientes, 3 usinas, 35 UCs, 8 competências de geração, e 2ª passada em 0/0. **57 verificações** — as quatro últimas (`N51`–`N54`) são o sinal da `R21-b`: divergência entre campo derivado e campo local vira registro em `conector_execucao.detalhe`, sem recusar e sem sobrescrever |

**A leitura honesta, atualizada no fim de 27/07:** **os três critérios formais de saída da F1 estão cumpridos** — o ciclo rodou valendo, duas vezes, contra o CRM real. O que segura a fase não é critério do `PRD` §10; é a **entrega nomeada** *"conector CRM read-only"* estar a um quarto do que a própria `SPEC-002` §2 declara (**`Q-ESCOPO-01`**, vermelha) e a `Q-FASE-01` sem decisão.

Essa vermelha só apareceu porque a `SPEC-002` foi reconciliada com o medido (v1.3) e cada teste obrigatório teve que ser nomeado ao lado da sua regra — uma linha não teve como ser preenchida. **É o método funcionando, não uma surpresa:** a spec estava atrás do código, e é a spec que manda.

---

## Pendente

A lista completa, com dono nomeado, está em `RESUMO-SESSAO-7` §Pendências gerais. O essencial:

| Item | Estado |
|---|---|
| **`Q-CRMCODIGO-01`** | 🔴 **Nova em 30/07, e achada ao REMEDIR o CRM antes de a operação digitar os contratos.** `financeiro.lead_merges` registra **76 merges em 30/07**: `lead.codigo` **não é estável** — 39 dos 41 códigos do rateio mudaram, com a mesma UC e o mesmo cliente —, `financeiro.vendas_ganhas` caiu de **80 para 51** linhas (o `DISTINCT ON (l.id)` conta lead distinto e os merges colapsaram duplicatas), a **lista de originadores caiu de três nomes para dois** (`Jezielly Vieira` tem **zero** cards hoje) e **duas atribuições trocaram de dono**, uma delas de **1.987,2 kWh/mês**. É vermelha porque digitar contrato pelo mapa de 29/07 pagaria comissão à pessoa errada **sem erro e sem log**, e a R20-b congela o tier no `rascunhar` — não há caminho de conserto. **O que está bem, e foi conferido:** a sincronização casa por `contrato_id` e `crm_lead_id`, os dois UUID, então o espelho não quebra. **O lado bom:** as **12** atribuições que eram invisíveis às views ficaram legíveis (40 de 41), e **as 12 bateram** com o que o conector de análise havia dito — duas medições por caminhos diferentes concordando. Mapa vigente em `ATRIBUICAO-originador-2026-07-30.md`, ordenado por **UC** |
| **`Q-ORIGINADOR-01`** | ✅ **Fechada em 29/07 na opção (a)** — as UCs da carteira **levam** originador, e a comissão está inteira pela frente: ninguém recebeu nada ainda, então `faturas_cheias_pagas` nascer em 0 é o valor **certo** e não a armadilha que parecia. A premissa que acompanhava a resposta (*"nenhuma venda foi efetivada"*) foi conferida contra o CRM antes de gravar, **não fechou** — `Clientes ativos - Assinatura`/ATIVOS tem 29 cards — e foi retirada pelo dono. A decisão não muda; a **base** dela sim: sustenta-se em **testemunho**, não em medição. Nada nos dois sistemas registra comissão paga por fora — ver `QUESTOES` §9. O campo é **obrigatório na tela**; `originador_id` segue nullable no banco de propósito. ~~**Falta o insumo, não a decisão: a lista de originadores**~~ — **29/07, noite: o eixo foi decidido e o insumo encolheu.** *"O originador vai ser o `vendedor_origem` até segunda ordem"*: a lista fechou em **três nomes** (Renata 49 ganhos, Out Sales 29, Jezielly Vieira 1) e a atribuição por UC ficou medida para 40 das 41 — **12 delas por um caminho que o financeiro não consegue ler**. Ver **`Q-ORIGVEND-01`** e `ATRIBUICAO-originador-2026-07-29.md`. Falta o que nenhuma consulta entrega: **três CPF/CNPJ**, a natureza, a confirmação do tipo e uma UC arquivada |
| **`Q-PRONTIDAO-COMIS-01`** | ✅ **Fechada em 29/07** — era a contagem que faltava, e a `Q-ORIGINADOR-01` disse qual das duas direções valia. Décima camada da prontidão, `originador_do_contrato`: *"nenhum contrato"* segue `nao_medido` e *"contrato sem originador"* é `pendente`. Os dois `?` que eram o mesmo agora se distinguem. `K18f`–`K18i`, com a contagem conferida **contra a tabela** e não contra número fixo |
| **Bootstrap — o primeiro `plataforma_admin`** | 🟡 **Script pronto e provado; falta o `COMMIT`.** `scripts/bootstrap-plataforma-admin.sql`, com `-v modo=ensaio\|valendo` — sem default, porque script de provisionamento que escreve por esquecimento é o modo de falha errado. Conta criada no Supabase Auth (`efcc8e11-…`) e ensaio rodado contra ela: `usuario` + tier criados, `app.resolver_login` devolveu `tier = plataforma_admin`, 2 linhas de trilha, `ROLLBACK` deixou tudo em zero. `app_financeiro` continua sem `INSERT` nessa tabela, de propósito |
| **Role LOGIN de runtime + `DATABASE_URL`** | ✅ **Fechado em 27/07** — `app_financeiro_login`, `NOSUPERUSER NOBYPASSRLS`. Isolamento provado conectado por ela: usuário de A apontando o contexto para o tenant B lê **0 linhas** e tem a escrita recusada. O composition root recusa o arranque se a role tiver `BYPASSRLS` |
| **Reunião com o contador** | ✅ **Fechada em 28/07.** As dez voltaram respondidas; três lacunas (a 1 com duas marcas, a 3b questionada, a 4b em branco) fechadas por decisão do dono no mesmo dia; a 6a virou `Q-PAUTA-6A-01`. Fecharam a `Q-021` e a `Q-011`, e a `RATEIO-USO-01` caiu de 🔴 para 🟡. De-para na tabela final da `PAUTA-contador.md`, efeito de cada uma em `QUESTOES.md` §9 |
| **Deploy das sessões 14 e 15** | 🟡 **Operacional, e não foi executado: o VPS não é alcançável do ambiente de desenvolvimento** — TCP 443 e 22 para `2.24.203.201` não abrem, e não é bloqueio geral (Supabase e GitHub respondem). O artefato foi **provado em árvore isolada**: `npm test` EXIT=0, `vite build` OK (`index-Cpc05c79.js`, 449,82 kB), o servidor sobe recusando role com `BYPASSRLS`, `/api/publico/config` 200, a SPA serve o bundle novo e a rota do documento devolve 401 sem Bearer. Faltam dois passos de quem tem acesso: **merge para `main`** (o VPS puxa `main`, e ele ainda não tem as duas sessões) e o ciclo do `RESUMO-SESSAO-11` §12. **A ressalva sobre o `web:build` caiu:** ela valia às 03:50, quando `web/src/estilo.ts` tinha 18 erros de parse; a sessão de UX commitou e `npm run web:build` **passa** na árvore final (206 módulos, bundle em 3 pedaços). O `web:build` é **obrigatório** neste deploy — a SPA mudou inteira |
| **Certificado A1 e credencial Sicoob** | 🔴 **`Q-SICOOB-01`, e é o que segura a F2.** O critério do `PRD` §10 é *"boleto liquidado no sandbox baixa a fatura automaticamente"*, e o ciclo está provado **contra o adaptador falso**, não contra o sandbox. Do nosso lado está pronto: porta injetada, `conector_cobranca` com a referência por tenant (regra 5), e o adaptador padrão que **recusa com 503 nomeado** em vez de fingir |
| **`Q-FATCHEIA-01`** | 🔴 O `PRD` §5.4 usa "fatura cheia" quatro vezes e **não define o termo** em lugar nenhum. Define em que mês começa a comissão de todo contrato novo. `fatura.flag_fatura_cheia` é `NOT NULL` **sem default**, de propósito |
| **PgBouncer em modo *transaction*** | 🔴 Sem cobertura. Se entrar no caminho de conexão, o `ADR-0003` **reabre inteiro**. O `.env.example` manda o runtime para *session mode* por isso |
| **F-01b** | 🔴 Nenhuma etapa do funil marca o cliente pagante. O gatilho de faturamento não é evento do CRM — decisão de F2 |
| Repositórios de UC, usina, originador e rateio | ✅ **Fechados em 27/07** — 45 verificações novas em 4 suítes |
| `Q-CLAUDE11-01` — a regra 11 perdeu o mecanismo | 🟡 Com `previewFeatures = ["partialIndexes"]`, o índice parcial **voltou** a ser chave de `findUnique`. A proteção automática que a regra supõe não existe mais, e o `CAT-1` não cobre este caso |
| Endpoints com a matriz de papéis | ✅ **Fechados em 27/07** — 37 rotas, 21 verificações. A matriz é aplicada no **repositório**, por `exigir()`, não no handler |
| `Q-RBAC-01` — matriz implementada ≠ PRD §3 | ✅ **Fechada em 27/07** — `escrever_cadastro` alinhada ao PRD: só `admin`. A matriz agora é fixada célula a célula, e o teste foi verificado nos dois sentidos |
| **Autenticação (`MT-06`)** | ✅ **Fechada em 27/07 — auth próprio, e agora medida contra o Supabase real.** `SUPABASE_URL` preenchida. Token emitido pelo projeto e verificado pelo caminho de produção: `iss` confere, projeto em **JWT signing keys ES256** (não HS256 legado — `SUPABASE_JWT_SECRET` fica ausente de propósito), JWKS responde no caminho que o código monta. `npm run auth:verificar` reproduz |
| `Q-AUDIT-01` — trilha da concessão de tier sem `registro_id` | ✅ **Fechada em 27/07** — migration 13. `usuario_id` entra no `coalesce` de `app.auditar()` **por último**, então as outras 15 tabelas não mudam. G6 e G7 verificados nos dois sentidos |
| `Q-DISTRIB-01` — RLS sem policy em `distribuidora` | ✅ **Fechada em 27/07** — migration 13. O `rls_auto_enable` do Supabase havia habilitado RLS na tabela, sem policy: a role de runtime lia **0** linhas. Agora lê 1. `CAT-8` acusa a classe inteira |
| `MT-09` — `rls_auto_enable` do Supabase | 🟡 **Reclassificado em 27/07: já aconteceu.** A cobertura pelo `CAT-3` que esta linha alegava **não existia** — ele filtra por `tenant_id`. Coberto agora pelo `CAT-8`, que é detecção e não prevenção. Resta decidir se o event trigger é tratado no provisionamento |
| `Q-SPEC001-08` — `SPEC-001` diz nove e dez | 🟡 Linhas 536 e 565 contra a §3.4. São **dez** |
| Bug do `GRANT` no Supabase | 🟡 Reportar. Derruba todas as sessões da instância |
| Dev do CRM — `LIMIT 1` sem `ORDER BY` | 🔴 `VIEWS-PROPOSTAS-r2.sql` §100. É alíquota, não relatório |
| Dev do CRM — segredos em `text` puro | 🔴 `P8` §4. O repositório foi público até 25/07 e **nomeia as colunas** — rotação, não só migração de coluna |
| **Banco no Supabase `sa-east-1`** | ✅ **Fechado em 27/07** — 13 migrations. Os 8 invariantes de catálogo passam **contra produção**, não só contra o banco de teste |
| **`prisma generate` e os dois primeiros repos** | ✅ **Fechado em 27/07** — cardinalidade LISTA confirmada nos tipos |
| Verificação de tipo | ✅ Fechada — `tsconfig.json`, `npm run typecheck`, job no CI |
| `$transaction` do Prisma | ✅ Fechado em 25/07 — `ADR-0003` r2, `spike-transacao/` |
| Contagem de FKs | ✅ Fechada — **dez**, lista nominal em `SPEC-001` §3.4 |
| `ADR-0004` | ✅ Escrito em 25/07 |

---

## Nota sobre o histórico

Os commits anteriores a 25/07/2026 são todos `Add files via upload` e `Delete X`, feitos pela interface web. Não têm proveniência: não se sabe qual upload corresponde a qual decisão. A regra 9 deste projeto exige *quem, quando, o quê, antes e depois* para dado de negócio — o versionamento passa a valer o mesmo daqui em diante.

O `LEIA-ME-retomada.md` e o `QUESTOES-bloco-para-fusao.md` foram removidos em 25/07: o primeiro estava errado em três das quatro linhas da sua tabela principal e este `README.md` faz o seu trabalho; o segundo teve o conteúdo absorvido pelo `QUESTOES.md`. Ambos seguem recuperáveis pelo histórico.
