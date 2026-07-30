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
const ESPERADAS = ['#fff', '#111', '#eee'];
const achadas = literais(dentroDoDocumento);
chk('I1c', JSON.stringify(achadas) === JSON.stringify(ESPERADAS),
    `no documento impresso, exatamente ${ESPERADAS.join(' ')} — papel e preto sobre branco, `
    + `independente do tema da tela (achadas: ${achadas.join(' ') || 'nenhuma'})`);

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
chk('I6b', !new RegExp('(th|td)[^{]*\\{[^}]*border-(left|right):(?!\\s*(0|none))').test(REGRAS),
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

console.log();
if (falhas > 0) { console.log(`--- interface: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- interface (estilo, movimento e navegacao): ${feitas} verificacoes, 0 falhas`);
