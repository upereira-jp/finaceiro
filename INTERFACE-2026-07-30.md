# INTERFACE — o acabamento de 30/07/2026

| Campo | Valor |
|---|---|
| **Pedido** | Vinicius Leal, 30/07/2026 — *"elevar o nível visual, eliminando o visual genérico e datado das tabelas e inputs nativos. Profissional, limpo, transmitindo precisão, mantendo a estrutura lógica para familiaridade do usuário"* |
| **Escopo** | Só a SPA (`web/`). Nenhuma rota, nenhuma migration, nenhuma regra de negócio |
| **Método** | Medir o que dá para medir e **fotografar o resto**. As 12 telas foram renderizadas em Chromium nos dois temas — é a primeira vez neste projeto que a interface é conferida por imagem e não por leitura de código |
| **Resultado** | 4 arquivos novos em `web/src/`, 2 suítes novas com **191 verificações**, 12 telas tocadas, `EXIT=0` em `npm test` (854 verificações no total) |

> **O que NÃO mudou, e é deliberado: a estrutura.** Mesmas doze telas, mesma
> ordem, mesma tabela nos mesmos lugares, mesmos textos de erro. O pedido falava
> de acabamento e de *"familiaridade do usuário"* — trocar a estrutura junto teria
> cobrado exatamente essa familiaridade de quem vai digitar 39 contratos.

---

## 1. As quatro coisas que saíram do `.tsx`, e por que isso é o centro

O `ui.tsx` de 29/07 tinha 352 linhas e afirmava duas coisas em comentário:
*"nenhuma cor literal daqui para baixo"* e, implicitamente, que os componentes
seguiam as quatro restrições do `tema.ts`. **Nenhuma das duas era verificável**,
porque o runner do `web/` é `node --experimental-strip-types` e ele não lê JSX —
o mesmo motivo que fez `contrato-regras.ts` e `cobranca-regras.ts` existirem.

Era regra 8 não cumprida na camada de apresentação. O acabamento seria a terceira
rodada de mudança visual sem rede nenhuma embaixo, então a primeira coisa foi a
rede:

| Arquivo novo | O que é | O que ficou testável |
|---|---|---|
| `web/src/estilo.ts` | o CSS inteiro, numa string | cor literal, movimento, forma da tabela |
| `web/src/iconografia.ts` | vocabulário fechado de nomes de ícone | estado ↔ ícone, status ↔ ícone, o que anima |
| `web/src/icones.tsx` | os desenhos do Phosphor | *completude, pelo `tsc`* — ver §3 |
| `web/src/navegacao.ts` | rota, título, ícone e grupo das 12 telas | unicidade, ordem, grupos, fallback |

E a afirmação "nenhuma cor literal" **estava errada**: havia três (`#fff`,
`#111`, `#eee`), no bloco do documento impresso. Elas estão **certas** — papel é
preto sobre branco independente do tema da tela, e puxar `--texto`/`--fundo2` ali
imprimiria branco sobre preto para quem opera no tema escuro, gastando o toner de
um cliente por causa de uma preferência de tela. O que faltava era a lista ser
**fechada**: `I1c` exige exatamente aquelas três, e uma quarta para o teste.

---

## 2. A paleta: nada de marca mudou, e três tokens novos entraram medidos

Os valores `[G3]` estão intactos. O que entrou:

| Token | Papel | Medido |
|---|---|---|
| `--fundo-recuo` | cabeçalho de tabela e barra de filtros | `--texto` 16.84:1 · `--fraco` 5.75:1 |
| `--fundo-hover` | a linha sob o mouse | `--foco` sobre ele 3.17:1 |
| `--borda-suave` | a divisória **interna** entre linhas | 1.16:1 contra o branco |
| `--ok-fundo` | fundo da pílula verde | `--ok` sobre ele 5.40:1 |
| `--sombra-forte` | menu suspenso | não-texto |
| `--brilho` | a luz que atravessa o botão primário | não-texto |

**`--fundo-recuo` não é cor nova: é a cor entregue que passou a ser usada.** O
`tema.ts` registrava desde 28/07 que o `--bg-soft #F2F1EC` da G3 tinha sobrado
(*"este layout tem dois níveis de superfície, não três"*). O pedido de limpeza
visual é exatamente o que pede o terceiro nível — o cabeçalho recua por
**superfície** em vez de se separar por linha.

**`--brilho` existe por um erro que a medição pegou.** A faixa de luz do hover
usava `--fundo2`. No tema escuro o `--fundo2` é escuro, e a faixa de luz virava
uma faixa de **sombra** atravessando o botão laranja.

### O contraste virou teste, não comentário

`web/tests/tema.ts`, **139 verificações**. Até 30/07 as razões estavam escritas
como comentário, medidas à mão numa calculadora que ninguém mais rodou. Conferir
dez pares novos à mão uma vez é viável; conferir de novo no próximo ajuste é o que
não acontece — e o modo de falha é silencioso, porque texto com 3.9:1 parece
perfeitamente legível para quem tem a tela boa e o olho descansado.

A suíte confere a própria calculadora antes de julgar a paleta (`T0`: preto sobre
branco é 21:1 por definição, e reproduz os 2.35:1 que reprovaram branco sobre o
laranja da G3 em 28/07). Sem isso, um erro na fórmula aprovaria a paleta inteira
em silêncio — o mesmo cuidado do `brcode.ts`, onde ajustar o esperado à minha
própria saída viraria tautologia.

**`T4` pega uma classe de defeito que o `tsc` não pega:** `variaveis()` é uma
template string escrita à mão. Um campo novo em `Paleta` obriga os dois temas a
preenchê-lo — isso o compilador garante —, mas **não** obriga ninguém a emiti-lo
como custom property. O sintoma de esquecer é um `var(--x)` que resolve para
nada: a regra CSS inteira é descartada e o elemento fica sem cor, sem erro em
lugar nenhum.

E o teste **já pagou**: `web/src/telas/faturas.tsx` usava
`var(--fundo-suave, transparent)` desde 29/07 — um token que **nunca existiu**. O
painel de boleto e baixa vinha sem fundo desde então, e o fallback escondia isso.

---

## 3. Phosphor, exclusivamente — e o mecanismo do "exclusivamente"

A iconografia é Phosphor por decisão do dono, e o `@phosphor-icons/react` é
dependência nova num projeto que escreveu o próprio roteador em 30 linhas. As duas
razões:

1. **desenhar aproximações à mão** daria ícones que *se parecem* com Phosphor e
   não são — o pior dos dois mundos: o trabalho de manter desenho próprio sem a
   consistência da família;
2. **ela não entra inteira.** Import profundo por ícone
   (`@phosphor-icons/react/Gear`) e `sideEffects: false` no pacote.

O "exclusivamente" tem mecanismo, e não é disciplina de quem escreve: nenhuma tela
escolhe desenho. Ela pede um **nome semântico** da união fechada `NomeDeIcone`, e
`icones.tsx` tem um `Record<NomeDeIcone, Icon>` exaustivo — **nome novo sem
desenho não compila.** É a mesma forma de garantia que a migration 19 usa para os
campos do documento: o mecanismo recusa.

**A única exceção nomeada é o logotipo.** Marca é identidade, não iconografia: um
`Sun` da biblioteca faria o sistema da G3 abrir com o mesmo sol de qualquer outro
produto que use Phosphor. Ele foi refeito (12 raios alternando comprimento, traço
de 1.5px igual ao Phosphor `regular`, vazado no centro) e continua desenhado com
`var(--acento)`, então segue a paleta.

### O custo, medido em vez de afirmado

`vite.config.ts` agora quebra o bundle em três, e o motivo é medição antes de
cache: *"tree-shaking resolve"* era afirmação minha sem número.

| Antes (HEAD de 30/07) | Depois | Delta |
|---|---|---|
| 449,82 KB · **gzip 127,38 KB** | 631,06 KB · **gzip 172,24 KB** | **+44,9 KB gzip** |

Dos quais **37,7 KB gzip são os 54 ícones** — cada `def` do Phosphor carrega os
seis pesos (thin a duotone) e isso não é removível por tree-shaking. O resto
(~7 KB) são os componentes e o CSS novos. A fonte é +48 KB, num arquivo separado,
com `immutable` de um ano.

O ganho de cache vem de graça e é real: `nossa` muda a cada deploy, `icones` muda
quando um ícone entra ou sai, e `plataforma` (React + supabase-js) fica meses
igual. Com um arquivo único, trocar uma palavra numa tela invalidava os 630 KB
inteiros no browser de quem opera.

---

## 4. A fonte: o argumento antigo contra webfont continua válido

O `tema.ts` dizia, desde o primeiro dia, que *"uma tela de operação que trava
esperando webfont é uma tela que pisca em toda navegação"*. **O comentário não foi
apagado, porque ele está certo.** O que o resolve são três coisas, e nenhuma é
abrir mão da fonte:

1. **servida pela nossa origem**, de `web/public/fontes/` — sem CDN de terceiro:
   uma origem só, sem DNS nem TLS extra, e sem mandar o IP de quem opera para fora;
2. **`font-display: swap`** — o texto aparece imediatamente na fonte de sistema e
   troca quando a Inter chega. O pisca que o comentário descrevia é o do
   `font-display: block`, que **esconde** o texto esperando;
3. **a pilha de sistema inteira continua atrás.** Se o arquivo não chegar, a tela
   é exatamente a de ontem — não é uma tela quebrada.

`T5a`–`T5e` prendem as três: `swap` presente, `block`/`auto` ausentes, Inter
primeira, `ui-sans-serif` e `system-ui` atrás, e **nenhuma URL externa** no
`@font-face`.

Entrou **Inter** e não Poppins, e a escolha é de uso: Inter foi desenhada para
interface densa — altura de x grande, `1`/`l`/`I` distinguíveis e algarismo
tabular de verdade, que é o que uma coluna de dinheiro precisa. Poppins é
geométrica e de caixa alta larga: bonita em título, cansativa em tabela de 39
linhas.

Um arquivo, 48 KB, `wght` variável 100–900, subconjunto latino. **Itálico não
entrou:** `<em>` aparece em quatro lugares no sistema inteiro, e um segundo
arquivo de 52 KB para quatro palavras não se paga. O nome carrega a versão
(`v5.3.0`) porque o `servirEstatico` manda `immutable, max-age=31536000` e o
`public/` do Vite não recebe hash — sem a versão no nome, trocar a fonte deixaria
um ano de browsers com a antiga. A licença OFL 1.1 viaja ao lado.

---

## 5. A divergência: **Lottie não entrou, e o efeito entrou**

O pedido nomeava Lottie sete vezes. **O que foi entregue são as micro-interações,
em CSS e SVG.** A divergência fica registrada como divergência, não como consenso
— e é a `Q-LOTTIE-01`.

O que existe hoje, e é o efeito que o pedido descreve:

| Pedido | Entregue |
|---|---|
| pulse no ícone de alerta | `@keyframes pulsar`, **duas vezes e para** |
| ícone girando no hover da navegação | `transform` no `:hover`, 160 ms |
| brilho no hover do botão primário | faixa de luz atravessando, 700 ms, uma passada |
| ripple/expansão no clique | anel crescendo do centro, 450 ms |
| checkmark verde / X vermelho animados | o par `sim`/`nao` desenhando-se ao aparecer |
| spinner de carregamento com o sol da G3 | **a engrenagem gira, o sol fica parado no centro** |
| switch animado no lugar do checkbox | `Interruptor`, `role="switch"`, pino com 200 ms |

**Por que não Lottie, em três razões e nesta ordem:**

1. **não há asset.** Lottie é formato de *entrega* de animação feita em After
   Effects. Sem `.json` de designer, "usar Lottie" significaria eu escrever
   bodymovin à mão — e JSON de Lottie malformado **não renderiza nada e não
   levanta erro**. Seriam seis animações que ninguém consegue afirmar que
   funcionam;
2. **o custo é desproporcional ao que ele entrega aqui.** `lottie-web` são
   ~60 KB gzip de runtime para desenhar um check que o Phosphor já desenha e o CSS
   já anima em três linhas. Num sistema cujo README se orgulha de o servidor ser
   `node:http` puro, isso pede justificativa que eu não tenho;
3. **`prefers-reduced-motion` é mais barato de honrar em CSS.** Uma linha desliga
   tudo, e há teste provando que desliga (`I3a`–`I3d`).

**O que a `Q-LOTTIE-01` decide:** se o dono quiser Lottie de verdade — porque um
designer vai produzir os assets, ou porque a marca quer animação própria —, a
troca é local: os pontos de movimento estão todos nomeados em
`ICONES_QUE_SE_MOVEM` e nas seis `@keyframes` de `estilo.ts`. Não há decisão de
arquitetura presa nisso.

### O movimento é lista fechada, e isso é testado

Movimento é ferramenta de **atenção**: quando tudo se move, nada chama atenção, e
uma tela de operação que se agita o dia inteiro cansa quem lê 39 linhas de
dinheiro. Seis ícones se movem, e `I2`/`I2b` falham **nos dois sentidos** — um
ícone que anima sem estar na lista, ou um na lista que não anima.

`I5h` prende um caso concreto: nenhum ícone de status de fatura pode estar na
lista. Uma competência de 39 faturas desenharia 39 ícones animados a cada render.

---

## 6. O que a conferência visual pegou, e a leitura não

As 12 telas foram renderizadas em Chromium, nos dois temas, 1440×1000, com um
servidor de mock (`/api/publico/config` falso e sessão semeada em
`localStorage`). **Zero `pageerror`, zero 5xx, `document.fonts.check('1em Inter')`
verdadeiro nas 24 fotos.** Três coisas apareceram na imagem e nenhuma delas
aparecia no código:

| O que | Por que a leitura não pegaria |
|---|---|
| **"Emitida" com uma interrogação.** A pílula deriva a cor de três tons e a fatura tem seis status: `emitida` cai em `nao_medido` porque não é nem bom nem ruim. Enquanto o único sinal era a cor, funcionava; com ícone, virou o desenho de *"não sei"* numa fatura emitida com sucesso | o mapeamento status→tom estava certo e testado. O defeito nasceu de o **terceiro sinal herdar o significado do tom** em vez do significado do domínio. Corrigido com `ICONE_DO_STATUS_DA_FATURA` |
| **Crase literal na tela.** `EXPLICACAO.sem_credencial_ref` é uma string de `Record`, não passa por JSX, e exibia <code>&#96;credencial_ref&#96;</code> com as craseas visíveis | parece igual a todos os outros textos do arquivo, que estão em JSX e usam `<code>` |
| **"Nove camadas"** no subtítulo da Prontidão, com dez camadas na tabela logo abaixo | a décima entrou em 29/07 (`Q-PRONTIDAO-COMIS-01`) e o subtítulo não foi junto. O número certo estava no README e na tabela ao lado |

E uma quarta, que o **build** pegou antes da imagem: **crase dentro do template
literal do CSS.** É o mesmo defeito registrado no `RESUMO-SESSAO-14` §7 — quatro
linhas de comentário derrubando o `tsc` do `web/` —, agora em 26 lugares de uma
vez. Regra que ficou: **dentro de `ESTILO`, crase não entra**; o comentário usa
apóstrofo.

---

## 7. Acessibilidade: o que o acabamento não podia custar

O tema tem quatro restrições, e a terceira é *"cor não pode ser o único sinal"*.
Ela **ganhou um sinal, não um substituto**: cada pílula leva cor de fundo, ícone
próprio e a palavra. `I5a`–`I5e` conferem que os três existem e que os três ícones
de estado são **diferentes entre si** — um segundo sinal igual nos três não é
sinal.

O resto, e nenhum é opcional:

- **`role="switch"` de verdade** no `Interruptor`, com `aria-checked`. Um `<div>`
  com aparência de switch é um controle que existe para quem vê e não existe para
  quem usa leitor de tela — e nesta tela os dois interruptores decidem `sandbox` e
  `ativo` do conector de cobrança, que é onde um clique errado emite cobrança de
  verdade;
- **`rotulo` obrigatório no tipo do `BotaoDeIcone`.** Um botão cujo único conteúdo
  é um `<svg aria-hidden>` não tem nome nenhum, e a tabela de Unidades tem 39
  deles: sem `aria-label` a pessoa ouviria "botão, botão, botão" trinta e nove
  vezes;
- **ícone decorativo é `aria-hidden` por padrão.** Ao lado de um texto que já diz
  a mesma coisa, um ícone com rótulo faz o leitor de tela ler tudo duas vezes;
- **o indicador de carga tem texto ao lado.** Sob `prefers-reduced-motion` a
  engrenagem para de girar, e aí o único sinal de "estou trabalhando" é a frase;
- **anel de foco em tudo que recebe foco**, medido contra as cinco superfícies
  (`T2`, 3:1 da WCAG 1.4.11).

---

## 8. O que ficou de fora, e por quê

| O quê | Por quê |
|---|---|
| **Lottie** | `Q-LOTTIE-01` — §5. O efeito está entregue; o formato não |
| **Itálico da Inter** | 52 KB para quatro `<em>` no sistema inteiro. O browser inclina a upright |
| **O indicador nativo de data no Firefox** | `::-webkit-calendar-picker-indicator` não existe lá, e o Firefox mantém o dele visível — aparecem dois. Registrado em comentário no `estilo.ts` em vez de escondido; o navegador da operação é Chrome |
| **O texto do botão de arquivo** | "Choose File" vem do browser e não há como trocá-lo por CSS. A **caixa** já é nossa |
| **Esqueleto de carga nas tabelas** | a classe existe (`.esqueleto`) e só o indicador com texto foi usado. Tabela com esqueleto de 39 linhas fingindo dado é pior que uma frase dizendo que está carregando |
| **Nada publicado ainda quando isto foi escrito** | o deploy é o ciclo do `RESUMO-SESSAO-11` §12, e é decisão de quando |

---

## 9. Como conferir

```bash
npm test                                    # 854 verificacoes, EXIT=0
node --experimental-strip-types web/tests/tema.ts       # 139, contraste e tokens
node --experimental-strip-types web/tests/interface.ts  # 52, estilo e navegacao
npm run web:build                           # tsc do web/ + vite, imprime os 3 pedacos
```

Para **fotografar** de novo: a receita está na memória do projeto
(`spa-screenshot-sem-api`) — mock de `/api/publico/config`, sessão falsa em
`localStorage` e Playwright com Chromium. Os scripts daquela sessão ficam no
diretório temporário do job; se sumirem, a receita basta.
