// A INTERFACE, verificada por leitura do proprio CSS e dos proprios dados.
// Uso: node --experimental-strip-types web/tests/interface.ts
//
// POR QUE ESTA SUITE EXISTE. O acabamento de 30/07/2026 trouxe quatro promessas
// que estavam escritas em comentario e nenhuma delas se sustentava sozinha:
//
//   1. "nenhuma cor literal no estilo" — e havia tres, no bloco do documento
//      impresso. Elas estao CERTAS: papel e preto sobre branco independente do
//      tema. O que faltava era a lista ser fechada, para a quarta doer;
//   2. "so estas seis se movem, e todo movimento para sob prefers-reduced-motion"
//      — promessa de acessibilidade (WCAG 2.3.3) que um ajuste de CSS apaga sem
//      ninguem notar, e cujo efeito so aparece na maquina de quem precisa dela;
//   3. "toda tela tem icone, rota e titulo unicos" — a barra de navegacao com
//      dois itens do mesmo desenho e uma barra em que a pessoa clica no errado;
//   4. "cor nunca e o unico sinal de estado" — a restricao 3 do tema, que agora
//      depende de tres coisas casarem: cor, icone e texto.
//
// TUDO ISTO E LEGIVEL DE MODULO PURO porque o CSS, a iconografia e a navegacao
// sairam do `.tsx` no mesmo dia. Era a condicao para a regra 8 alcancar a camada
// de apresentacao, que e onde ela nunca tinha chegado neste projeto.

import { ESTILO } from '../src/estilo.ts';
import { VARIAVEIS_CSS } from '../src/tema.ts';
import {
  ICONES_QUE_SE_MOVEM, ICONE_DO_ESTADO, ICONE_DO_AVISO, ICONE_DO_STATUS_DA_FATURA,
} from '../src/iconografia.ts';
import { TELAS, telaDoCaminho, inicioDoGrupoDinheiro } from '../src/navegacao.ts';

let falhas = 0;
/*
 * O TOTAL E CONTADO, e nao escrito. A versao anterior fechava com o literal
 * "52 verificacoes" e ele ja estava errado quando esta linha foi escrita — a
 * suite cresceu e o numero nao. E a terceira vez que este projeto encontra uma
 * contagem que nao se reproduz, e o `README` ja diz o metodo: a contagem oficial
 * e `npm test | grep -c '^ok '`. Aqui o proprio `chk` conta.
 */
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

// O CSS SEM O BLOCO DE VARIAVEIS. As custom properties sao justamente onde as
// cores da paleta moram, e `tema.ts` ja as verifica uma a uma (T4 da suite do
// tema). O que interessa aqui e o resto: as REGRAS.
const REGRAS = ESTILO.replace(VARIAVEIS_CSS, '');

// ------------------------------------------------- I1 cor literal, lista fechada

const MARCA_INICIO = 'INICIO-DOCUMENTO-IMPRESSO';
const MARCA_FIM = 'FIM-DOCUMENTO-IMPRESSO';
const iIni = REGRAS.indexOf(MARCA_INICIO);
const iFim = REGRAS.indexOf(MARCA_FIM);

chk('I1', iIni > 0 && iFim > iIni,
    'o bloco do documento impresso continua delimitado — sem os marcadores esta suite nao sabe onde a excecao vale');

const foraDoDocumento = REGRAS.slice(0, iIni) + REGRAS.slice(iFim);
const dentroDoDocumento = REGRAS.slice(iIni, iFim);

/** Cor escrita a mao: hexadecimal, `rgb(...)` ou `hsl(...)`. Nome de cor CSS
 *  (`transparent`, `currentColor`, `none`) nao conta — nenhum deles carrega
 *  valor de paleta, e `transparent` e estrutural: e o que mantem o layout parado
 *  quando a borda aparece. */
const literais = (css: string): string[] =>
  css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g) ?? [];

chk('I1b', literais(foraDoDocumento).length === 0,
    `fora do documento impresso, zero cor literal — achadas: ${literais(foraDoDocumento).join(', ') || 'nenhuma'}`);

// AS TRES EXCECOES, NOMEADAS UMA A UMA. Nao e "no maximo tres": e exatamente
// estas. Uma quarta cor de papel — ou trocar #fff por #fefefe — para esta linha e
// obriga quem mexeu a dizer por que. E o mesmo desenho do invariante 17-b da
// migration 19: "a segunda entrada nessa lista deve doer".
//
// AJUSTADO EM 03/08 com a migration 23, e o ajuste vale ser explicado porque ele
// AFROUXA a comparacao: antes era a SEQUENCIA de ocorrencias, e o bloco cresceu
// (a folha em mm, os blocos posicionados, borda e fundo). A sequencia prendia
// duas coisas ao mesmo tempo — quais cores e quantas vezes cada uma aparece — e
// so a primeira era a intencao declarada. Escrever `#eee` numa regra nova nao e
// excecao nova; escrever `#f2f2f2` e. Agora a comparacao e o CONJUNTO, na ordem
// da primeira aparicao, e a propriedade que importa continua inteira: a quarta
// cor de papel para esta linha, e trocar `#fff` por `#fefefe` tambem.
// EM 06/08 AS TRES VIRARAM QUATRO, e esta linha existe para essa entrada doer.
//
// A QUARTA E `#E4DFD4`, a cor de LINHA da paleta nova. Ela entrou porque o papel
// tinha uma divisoria interna de tabela em `#eee` - um cinza neutro que, ao lado
// de um documento agora inteiro em Navy sobre Creme, e a unica coisa que continua
// pertencendo a outra paleta. As duas alternativas eram piores: reusar o `#F6F2EA`
// do bloco secundario faria a divisoria quase sumir contra o papel branco, e
// manter o `#eee` guardaria uma cor orfa no unico lugar do sistema onde cor e
// escrita a mao.
//
// E A TROCA DE VALOR DAS OUTRAS TRES: A paleta nova pos
// Navy no texto e nas bordas de destaque do papel, e Creme no bloco secundario -
// "#111" virou "#14213D" e "#eee" virou "#F6F2EA". O branco do papel nao se mexe.
//
// E A REGRA QUE GOVERNA O BLOCO NAO MUDOU: sao LITERAIS, nao `var(--texto)`. O
// motivo esta escrito no `estilo.ts` e vale igual com Navy - o documento e
// IMPRESSO, e puxar token de tema faria a mesma fatura sair de duas cores
// dependendo de quem imprime. Trocar o VALOR de uma excecao nomeada e barato;
// trocar a NATUREZA dela, de literal para token, nao passaria daqui.
//
// EM 12/08 AS QUATRO VIRARAM SEIS, e esta linha existe para essa entrada doer. As
// duas novas chegaram com a faixa de pagamento do modelo G3 — o primeiro pedaco
// daquele desenho a entrar, e o unico que nao depende do leitor da Equatorial
// (`PLANO-documento-modelo-g3-2026-08-12.md` §6): `#E8843C` e `#8F939D`.
//
// ============================================================================
// EM 14/08 AS SEIS CONTINUARAM SEIS, E DUAS TROCARAM DE VALOR — POR MEDICAO.
//
// A entrada de 12/08 justificava as duas afirmando numeros. Os dois numeros
// estavam errados, e a mesma calculadora WCAG de `web/tests/tema.ts` os derruba:
//
//   `#8F939D` sobre branco   dizia 4,02:1   MEDIDO 3,08:1   reprova (AA pede 4,5)
//   `#E8843C` sobre branco   nao foi medido MEDIDO 2,69:1   reprova, e ele era
//                                                           TEXTO (o valor a pagar)
//
// A justificativa de 12/08 para o `#8F939D` era literalmente *"no papel o par e
// outro: cinza sobre BRANCO, 4,02:1, que passa AA"*. O par de fato e outro; o
// numero e que nao era. E o `#E8843C` como TEXTO nunca teve numero nenhum: a nota
// argumentava por que ele nao podia ser `var(--acento)` e nao perguntava se ele
// podia ser tinta.
//
// AS DUAS QUE ENTRARAM NAO SAO CORES NOVAS — sao os dois tokens que o `tema.ts`
// JA tinha derivado, em 28/07 e em 06/08, dos mesmos dois valores da G3 e pelo
// mesmo criterio (escalar os tres canais, que e o que preserva a matiz, ate o
// fator mais alto que ainda passa 4,5:1):
//
//   #66686F  o `--fraco` do tema claro, derivado do Gray `#8F939D`.
//            5,10:1 no branco e 4,57:1 no creme — os DOIS fundos do papel
//   #995728  o `--acento-forte` do tema claro, derivado do Orange `#E8843C`.
//            5,60:1 no branco e 5,02:1 no creme
//
// E O `#E8843C` FICOU, com o papel reduzido: SUPERFICIE cheia, nunca tinta. A
// faixa do aviso, o cartao do desconto e a barra do mes atual. Sobre ele pousa o
// Navy, 5,93:1 — que e o mesmo par do botao primario da interface.
//
// A REGRA NAO MUDOU: sao LITERAIS, nao `var()`. Coincidirem com dois tokens do
// tema claro e consequencia de virem do mesmo lugar pelo mesmo criterio, e nao
// uma ligacao — o `.g3` nao pode variar com o tema de quem imprime.
//
// A T7 de `web/tests/tema.ts` mede cada um destes pares. Esta lista diz QUAIS
// tintas existem; a T7 diz se elas passam.
const ESPERADAS = ['#fff', '#14213D', '#E4DFD4', '#66686F', '#F6F2EA', '#E8843C', '#995728'];
const achadas = [...new Set(literais(dentroDoDocumento))];
chk('I1c', JSON.stringify(achadas) === JSON.stringify(ESPERADAS),
    `no documento impresso, exatamente ${ESPERADAS.join(' ')} — Navy sobre branco, `
    + `independente do tema da tela (achadas: ${achadas.join(' ') || 'nenhuma'})`);

// E O `#8F939D` NAO PODE VOLTAR. Ele e um valor da paleta entregue pela G3, entao
// a tentacao de reusa-lo "porque e a cor da marca" e permanente — foi assim que
// ele chegou aqui. Ele reprova AA nos TRES fundos do papel (3,08:1 no branco,
// 2,75:1 no creme, 2,31:1 na linha). A lista fechada acima ja o barraria; esta
// linha existe para o erro ter NOME quando alguem tentar.
chk('I1d', !ESTILO.includes('#8F939D'),
    'o Gray #8F939D nao aparece em lugar nenhum do estilo — reprova AA nos tres fundos do papel, '
    + 'e o derivado #66686F e quem ocupa o lugar dele');

// ------------------------------------------------------- I2 o movimento, fechado

/** Toda regra que ANIMA um icone, pelo nome do icone. Casa `.ic-<nome>` seguido,
 *  em algum ponto do bloco, de `animation:`. */
const iconesAnimados = new Set<string>();
for (const bloco of REGRAS.split('}')) {
  if (!/animation:/.test(bloco)) continue;
  for (const m of bloco.matchAll(/\.ic-([a-z_]+)/g)) iconesAnimados.add(m[1]!);
}

for (const nome of ICONES_QUE_SE_MOVEM) {
  chk('I2', iconesAnimados.has(nome),
      `${nome} esta na lista dos que se movem E tem regra de animacao no CSS`);
}
for (const nome of iconesAnimados) {
  chk('I2b', (ICONES_QUE_SE_MOVEM as readonly string[]).includes(nome),
      `${nome} anima no CSS E esta declarado em ICONES_QUE_SE_MOVEM — nada se move por acidente`);
}

// O `@media (prefers-reduced-motion: reduce)` E A SAIDA DE EMERGENCIA, e ela tem
// de neutralizar as DUAS coisas: animacao e transicao. Anular so a animacao
// deixaria de pe todo o hover deste arquivo, que e transicao.
const bloqueio = REGRAS.slice(REGRAS.indexOf('prefers-reduced-motion'));
chk('I3', REGRAS.includes('@media (prefers-reduced-motion: reduce)'),
    'existe bloco @media prefers-reduced-motion: reduce (WCAG 2.3.3)');
chk('I3b', /animation-duration:\s*\.?0*1?m?s\s*!important/.test(bloqueio)
        && /animation-iteration-count:\s*1\s*!important/.test(bloqueio),
    'ele zera animation-duration E fixa iteration-count em 1 — loop infinito nao sobrevive');
chk('I3c', /transition-duration:\s*\.?0*1?m?s\s*!important/.test(bloqueio),
    'e zera transition-duration tambem: o hover deste arquivo e transicao, nao animacao');
chk('I3d', /\*,\s*\*::before,\s*\*::after/.test(bloqueio),
    'e alcanca `*` com os dois pseudo-elementos — o brilho e a ondulacao do botao vivem em ::after e ::before');

// ------------------------------------------------------- I4 a barra de navegacao

/* DOZE desde 14/08/2026 - "Tarifas" SAIU, por decisao do dono ("ela ja nao
 * possui finalidade e apenas gera redundancia"). A tarifa passou a ser coluna da
 * UC (migration 30), porque a granularidade real e por cliente e nao por
 * distribuidora - medido: 35 UCs a 1,130000, 4 a 1,16 e 2 a 1,180000.
 *
 * O numero e literal de proposito: uma tela a mais e decisao de produto, e uma
 * contagem que se atualiza sozinha (`TELAS.length === TELAS.length`) nao
 * acusaria uma tela acrescentada por engano num merge. */
chk('I4', TELAS.length === 12, `sao 12 telas (contadas: ${TELAS.length})`);
chk('I4b', new Set(TELAS.map((t) => t.rota)).size === TELAS.length,
    'nenhuma rota repetida — rota repetida faz a segunda tela ser inalcancavel');
chk('I4c', new Set(TELAS.map((t) => t.titulo)).size === TELAS.length,
    'nenhum titulo repetido');
chk('I4d', new Set(TELAS.map((t) => t.icone)).size === TELAS.length,
    'nenhum ICONE repetido: dois itens com o mesmo desenho e uma barra em que se clica no errado');
chk('I4e', TELAS.every((t) => t.rota.startsWith('/') && !t.rota.includes(' ')),
    'toda rota comeca com / e nao tem espaco');

// A ORDEM E DECISAO DOCUMENTADA, nao gosto: cadastro primeiro, na ordem em que
// uma camada destrava a proxima; dinheiro depois, na ordem dos ATOS. Este teste
// prende a FORMA da decisao — os dois grupos sao contiguos, e a tela que diz o
// que falta e a primeira.
//
// A ROTA MUDOU EM 30/07 (`/prontidao` -> `/pendencias`, decisao do dono: o nome
// era pouco claro). O teste afirma a POSICAO e o GRUPO, e nao o nome — se
// afirmasse o nome, ele quebraria a cada troca de rotulo sem que nada de fato
// tivesse mudado, e teste que quebra por cosmetica treina o time a ignora-lo.
chk('I4f', TELAS[0]!.grupo === 'cadastro' && TELAS[0]!.rota === '/pendencias',
    'a primeira tela e a que diz o que falta — e onde cai quem se perde');
chk('I4g', TELAS.slice(0, inicioDoGrupoDinheiro).every((t) => t.grupo === 'cadastro')
        && TELAS.slice(inicioDoGrupoDinheiro).every((t) => t.grupo === 'dinheiro'),
    'os dois grupos sao contiguos — a divisoria da barra e um lugar so, nao dois');
chk('I4h', inicioDoGrupoDinheiro > 0 && inicioDoGrupoDinheiro < TELAS.length,
    'e a divisoria cai DENTRO da lista: nem no inicio nem depois do fim');

// Caminho desconhecido cai na primeira tela. E o comportamento que o `app.tsx`
// documenta desde 29/07 e que nunca teve teste.
const primeira = TELAS[0]!.rota;
chk('I4i', telaDoCaminho('/nao-existe').rota === primeira
        && telaDoCaminho('/').rota === primeira
        && telaDoCaminho('/faturas').rota === '/faturas',
    'caminho desconhecido e / caem na primeira tela; caminho conhecido resolve para ele mesmo');

/*
 * E O `/prontidao` ANTIGO CONTINUA LEVANDO AO LUGAR CERTO, por consequencia da
 * regra acima e nao por um redirecionamento escrito a mao. Vale como verificacao
 * porque e o unico link que pode existir em favorito de alguem: a rota viveu de
 * 29/07 a 30/07.
 */
chk('I4j', telaDoCaminho('/prontidao').rota === TELAS[0]!.rota,
    'a rota antiga /prontidao cai na tela de Pendencias — caminho desconhecido resolve para a '
    + 'primeira, e a primeira e ela');

// ----------------------------------------- I5 cor nunca e o unico sinal (rest. 3)

const TONS = ['ok', 'pendente', 'nao_medido'] as const;
for (const tom of TONS) {
  chk('I5', Boolean(ICONE_DO_ESTADO[tom]),
      `o estado ${tom} tem icone proprio — cor nao e o unico sinal`);
  chk('I5b', new RegExp(`\\.marca\\.${tom}\\s*\\{[^}]*background:`).test(REGRAS),
      `e tem fundo proprio na pilula .marca.${tom}`);
}
chk('I5c', new Set(TONS.map((t) => ICONE_DO_ESTADO[t])).size === 3,
    'os tres icones de estado sao DIFERENTES entre si: um segundo sinal igual nos tres nao e sinal');
chk('I5d', new Set(Object.values(ICONE_DO_AVISO)).size === 3,
    'e os tres icones de aviso tambem sao diferentes');

// A PILULA NAO PODE VOLTAR A DEPENDER DE `currentColor` NA BORDA. Ate 29/07 ela
// era contornada com `border: 1px solid currentColor`, e o desenho de 30/07 e
// preenchido. Se as duas formas convivessem, metade das telas teria uma e metade
// a outra — que e o estado em que este arquivo estava antes de existir `.marca`.
chk('I5e', /\.marca\s*\{[^}]*border:\s*1px solid transparent/.test(REGRAS),
    'a borda da pilula e transparente e existe: ela reserva o espaco sem desenhar contorno');

// OS SEIS STATUS DA FATURA, cada um com o icone do SIGNIFICADO e nao do tom. O
// mapa existe por causa de um defeito real: "Emitida" cai no tom `nao_medido` e
// exibia a interrogacao de "nao sei". Ver `ICONE_DO_STATUS_DA_FATURA`.
const STATUS_DA_FATURA = ['rascunho', 'emitida', 'paga', 'vencida', 'cancelada', 'negociada'];
for (const s of STATUS_DA_FATURA) {
  chk('I5f', Boolean(ICONE_DO_STATUS_DA_FATURA[s]), `o status ${s} tem icone proprio`);
}
chk('I5g', new Set(Object.values(ICONE_DO_STATUS_DA_FATURA)).size === STATUS_DA_FATURA.length,
    'os seis sao diferentes entre si — o icone existe para distinguir dentro do mesmo tom');
chk('I5h', Object.values(ICONE_DO_STATUS_DA_FATURA)
        .every((i) => !(ICONES_QUE_SE_MOVEM as readonly string[]).includes(i)),
    'e nenhum deles se move: uma competencia de 39 faturas desenharia 39 icones animados');

// ------------------------------------------------- I6 o que o acabamento promete

chk('I6', !/border-collapse:\s*separate/.test(REGRAS) && /border-collapse:\s*collapse/.test(REGRAS),
    'a tabela colapsa a borda — e o que permite UMA linha entre celulas, nao duas');
// O PADRAO FOI APERTADO EM 12/08, e ele estava FROUXO nos dois sentidos - a
// mensagem sempre disse "th ou td" e o regex dizia outra coisa:
//
//   1. `(th|td)` SEM FRONTEIRA casava o "th" de `width`. Entao `min-width: 0` numa
//      regra e um `border-left` na regra SEGUINTE bastavam para reprovar, e nenhum
//      dos dois tem a ver com tabela. Foi o que a faixa de pagamento encostou;
//   2. `[^{]*` NAO EXCLUI `}`, entao a busca atravessava o fim da regra e colava um
//      seletor de tabela numa declaracao de outro seletor qualquer, varias regras
//      abaixo.
//
// O que a verificacao existe para prender continua preso, e agora e so isso:
// `td`/`th` como SELETOR, e a borda dentro da PROPRIA regra dele.
chk('I6b', !new RegExp('\\b(th|td)\\b[^{}]*\\{[^}]*border-(left|right):(?!\\s*(0|none))').test(REGRAS),
    'nenhuma borda vertical em th ou td: era o pedido de "remover linhas verticais entre celulas"');
chk('I6c', /tbody td\s*\{[^}]*border-bottom: 1px solid var\(--borda-suave\)/.test(REGRAS),
    'a divisoria entre linhas e a --borda-suave (1.16:1), nao a --borda do contorno');
chk('I6d', /thead th\s*\{[^}]*background: var\(--fundo-recuo\)/.test(REGRAS),
    'o cabecalho recua por SUPERFICIE, com a terceira cor da paleta da G3');
chk('I6e', /tbody td\s*\{[^}]*padding: 13px/.test(REGRAS),
    'o respiro da linha subiu para 13px (era 9px) — o pedido de "aumentar o espacamento interno"');
chk('I6f', /\.inline input\s*,\s*\.inline select\s*\{[^}]*border-color: transparent/.test(REGRAS),
    'o input de dentro da tabela nasce sem borda visivel: parece texto ate receber atencao');
chk('I6g', /--sombra-1|--sombra-2|--sombra-3/.test(REGRAS)
        && !/box-shadow:\s*0 \d/.test(REGRAS.replace(/box-shadow: 0 0 0 3px var\(--acento-suave\)/g, '')),
    'toda sombra sai da escala de tres degraus — a unica excecao e o anel de foco, que e cor e nao profundidade');

// ------------------------------------------- I7 os estados dos elementos clicaveis
//
// POR QUE ESTA SECAO EXISTE, e ela nasce de um defeito medido em 14/08.
//
// A aba da tela de fatura unificada escrevia `.fu-aba:hover { color: var(--texto) }`
// — e essa regra NUNCA VALEU UM DIA. O seletor generico `button:hover:not(:disabled)`
// tem especificidade (0,2,1) e `.fu-aba:hover` tem (0,2,0): quem ganhava era o
// botao. Na pratica a aba pegava o laranja de link, a sombra do segundo degrau e o
// `translateY(-1px)` — passar o mouse por uma ABA a fazia FLUTUAR.
//
// O modo de falha e o pior tipo: o CSS estava escrito, a intencao estava escrita
// no comentario, e nada na tela obedecia. Nenhuma revisao de codigo pega isso —
// so quem abre a tela e olha, ou uma verificacao que compare especificidade.
//
// O QUE ESTA SECAO PRENDE, e ela e sobre a CLASSE do defeito e nao sobre esta aba:
// todo elemento que se pinta por cima do botao generico tem de vencer o seletor
// generico. A regra pratica e simples e verificavel: quem sobrescreve o hover do
// botao escreve `:hover:not(:disabled)`, igual ao generico, e assim ganha pela
// classe a mais.

/** As declaracoes de uma regra, pelo seletor exato. `''` quando a regra nao existe. */
function regraDe(seletor: string): string {
  const i = REGRAS.indexOf(`\n  ${seletor} {`);
  if (i < 0) return '';
  const j = REGRAS.indexOf('}', i);
  return j < 0 ? '' : REGRAS.slice(i, j);
}

/** Todo seletor de hover que pinta um `button` do sistema por cima do generico. */
const HOVERS_DE_BOTAO = ['.fu-aba', 'button.primario', 'button.discreto', '.interruptor'];
for (const base of HOVERS_DE_BOTAO) {
  chk('I7', regraDe(`${base}:hover:not(:disabled)`) !== '',
      `${base} sobrescreve o hover com ":hover:not(:disabled)" — mesma forma do seletor generico, `
      + 'e por isso ganha dele. Sem o ":not(:disabled)" a regra existe e nao vale');
}

// E A ABA NAO PODE FLUTUAR. As tres propriedades que o botao generico injeta no
// hover — sombra do segundo degrau, subida de 1px e a tinta de acento — precisam
// ser desfeitas explicitamente, porque `.fu-aba` e um `<button>` de verdade (e
// tem de ser: e o que da teclado e foco de graca).
{
  const h = regraDe('.fu-aba:hover:not(:disabled)');
  chk('I7b', /box-shadow:\s*none/.test(h) && /transform:\s*none/.test(h),
      'o hover da aba desfaz a sombra e a subida do botao generico — aba nao flutua');
  chk('I7c', /background:\s*var\(--fundo-hover\)/.test(h),
      'e sinaliza com FUNDO, como a barra de navegacao e a linha de tabela — o sistema inteiro '
      + 'diz "clicavel" por superficie, e so esta area dizia por cor de texto');
}

// O ANEL DE FOCO E SEMPRE `--foco`. Ele e o unico token medido contra 3:1 em toda
// superficie (T2 da suite do tema); qualquer outra cor num `outline` e um anel
// que ninguem mediu. `.fu-solta` desenhava o dela com `--acento`, que da 2,41:1
// sobre o cartao e reprova a WCAG 1.4.11.
{
  const outlines = [...REGRAS.matchAll(/outline:\s*[^;]*var\(--([a-z-]+)\)/g)].map((m) => m[1]);
  chk('I7d', outlines.length > 0 && outlines.every((t) => t === 'foco'),
      `todo "outline" do sistema usa var(--foco) — achados: ${[...new Set(outlines)].join(', ') || 'nenhum'}`);
}

// E TODO ELEMENTO FOCAVEL POR TECLADO TEM ANEL. `summary` nao e `a`, nao e
// `button` e nao e `.interruptor` — a regra geral de foco nao o alcancava, e
// quem navega por Tab chegava nele sem sinal nenhum na tela.
chk('I7e', /summary:focus-visible\s*\{[^}]*outline:/.test(REGRAS),
    'o <summary> do cadastro tem anel de foco proprio — a regra geral so alcanca a/button/th/.interruptor');

console.log();
if (falhas > 0) { console.log(`--- interface: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- interface (estilo, movimento e navegacao): ${feitas} verificacoes, 0 falhas`);
