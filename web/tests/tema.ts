// O TEMA, verificado por cálculo. Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/tema.ts
//
// POR QUE ESTA SUITE EXISTE, e por que ela não existia antes. O cabeçalho do
// `tema.ts` declara quatro restrições — a primeira é contraste AA em todo par de
// texto sobre superfície — e até 30/07/2026 as razões estavam escritas ali como
// COMENTÁRIO, medidas à mão por mim numa calculadora que ninguém mais rodou. Isso
// é exatamente o que a regra 8 chama de invariante que é comentário.
//
// O CUSTO DE NÃO TER ISTO FICOU CLARO NO PEDIDO DE ACABAMENTO DE 30/07: entraram
// duas superfícies novas (`--fundo-recuo`, `--fundo-hover`) e um fundo de pílula
// novo (`--ok-fundo`). São dez pares novos. Conferir dez pares à mão uma vez é
// viável; conferir de novo no próximo ajuste de paleta é o que não acontece — e
// o modo de falha é silencioso, porque texto com 3.9:1 parece perfeitamente legível
// para quem tem a tela boa e o olho descansado.
//
// AS QUATRO COISAS QUE ESTA SUITE PRENDE:
//
//   T1  contraste de TEXTO — 4.5:1, WCAG AA, nos dois temas (restrição 1)
//   T2  contraste de NÃO-TEXTO — 3:1 para o anel de foco, WCAG 1.4.11
//   T3  os três estados continuam DISTINGUÍVEIS por matiz (restrição 2): o âmbar
//       do `nao_medido` nunca pode chegar perto do verde do `ok`
//   T4  toda cor da `Paleta` chega ao CSS como custom property, nos DOIS temas —
//       `variaveis()` é escrita à mão, e um campo novo no tipo não obriga
//       ninguém a emiti-lo. O `tsc` não pega isto; esta verificação pega.

import { CLARO, ESCURO, VARIAVEIS_CSS, TIPOGRAFIA, FONTE_CSS, type Paleta } from '../src/tema.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

// --------------------------------------------------------------- a aritmética
//
// WCAG 2.1, relative luminance e contrast ratio. Implementado aqui e não
// importado de `tema.ts` de propósito: o tema declara VALORES, e quem confere
// não deve compartilhar código com quem é conferido.

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function luminancia(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** A razão de contraste entre duas cores opacas. Simétrica, por definição. */
function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Matiz em graus. Serve à restrição 2: o que separa âmbar de verde é a matiz,
 *  e comparar razão de contraste entre os dois não diria nada — duas cores de
 *  luminância parecida têm contraste baixo entre si sendo opostas na roda. */
function matiz(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** Distância angular na roda de cores — 350° e 10° estão a 20°, não a 340°. */
const distanciaDeMatiz = (a: string, b: string) => {
  const d = Math.abs(matiz(a) - matiz(b)) % 360;
  return d > 180 ? 360 - d : d;
};

// A verificação da própria calculadora, antes de ela julgar a paleta. Sem isto
// um erro na fórmula aprovaria a paleta inteira em silêncio — é o mesmo cuidado
// do `brcode.ts`, onde ajustar o esperado à minha saída viraria tautologia. Os
// dois valores são de definição, não de medição: preto contra branco é 21:1
// exatos e uma cor contra si mesma é 1:1.
chk('T0', Math.abs(contraste('#000000', '#FFFFFF') - 21) < 0.01,
    'a calculadora está certa: preto sobre branco é 21:1, o máximo da escala');
chk('T0b', contraste('#F39200', '#F39200') === 1,
    'e uma cor contra si mesma é 1:1 — o mínimo');
chk('T0c', Math.abs(contraste('#FFFFFF', '#F39200') - 2.35) < 0.02,
    'reproduz os 2.35:1 que reprovaram branco sobre o laranja da G3 em 28/07');

// ----------------------------------------------------------- T1 texto, 4.5:1
//
// TODO PAR QUE PODE APARECER NA TELA, não só os que eu lembrei de anotar. As
// quatro superfícies são as quatro em que texto de fato pousa; o `--acento-suave`
// entra porque a navegação ativa e a linha em destaque o usam como fundo.

const SUPERFICIES = ['fundo', 'fundo2', 'fundoRecuo', 'fundoHover', 'acentoSuave'] as const;
const TINTAS = ['texto', 'fraco', 'acentoForte', 'erro', 'ok', 'alerta'] as const;

for (const [nome, p] of [['claro', CLARO], ['escuro', ESCURO]] as Array<[string, Paleta]>) {
  for (const tinta of TINTAS) {
    for (const fundo of SUPERFICIES) {
      const r = contraste(p[tinta], p[fundo]);
      chk(`T1`, r >= 4.5,
          `${nome}: --${tinta} sobre --${fundo} = ${r.toFixed(2)}:1 (AA pede 4.5)`);
    }
  }

  // A PÍLULA DE ESTADO PREENCHIDA, que é o que mudou em 30/07: cada estado sobre
  // o SEU fundo. Antes a pílula era contornada e o par não existia.
  for (const [tinta, fundo] of [['ok', 'okFundo'], ['erro', 'erroFundo'], ['alerta', 'alertaFundo']] as const) {
    const r = contraste(p[tinta], p[fundo]);
    chk('T1b', r >= 4.5, `${nome}: pílula --${tinta} sobre --${fundo} = ${r.toFixed(2)}:1`);
  }

  // O texto SOBRE O ACENTO — o botão primário e o seu hover. É o par que
  // reprovou em 28/07 com branco, e o motivo de `acentoTexto` existir.
  for (const acento of ['acento', 'acentoHover'] as const) {
    const r = contraste(p.acentoTexto, p[acento]);
    chk('T1c', r >= 4.5, `${nome}: --acento-texto sobre --${acento} = ${r.toFixed(2)}:1`);
  }
}

// ------------------------------------------------------- T2 não-texto, 3:1
//
// WCAG 1.4.11. O anel de foco de teclado é a única coisa que diz onde o cursor
// está para quem navega sem mouse: se ele não se destaca da superfície embaixo,
// a informação não existe. Foi por um fio que `#D97A00` saiu em 29/07 (2.98:1).

for (const [nome, p] of [['claro', CLARO], ['escuro', ESCURO]] as Array<[string, Paleta]>) {
  for (const fundo of SUPERFICIES) {
    const r = contraste(p.foco, p[fundo]);
    chk('T2', r >= 3, `${nome}: --foco contra --${fundo} = ${r.toFixed(2)}:1 (1.4.11 pede 3)`);
  }
}

// ------------------------------------------- T3 os três estados, distinguíveis
//
// RESTRIÇÃO 2 DO TEMA, e ela é sobre o âmbar. `nao_medido` existe porque "zero
// sobre universo vazio" não é pronto, e pintá-lo de verde faz a tela autorizar o
// que não conferiu — foi defeito real, achado contra produção em 28/07. O tema
// diz: "se a marca não tiver um âmbar, ele precisa de outra forma de se
// distinguir do verde — NUNCA de virar verde".
//
// 60° é o critério, e ele é frouxo de propósito: verde e âmbar estão hoje a 132°
// (claro) e 96° (escuro). O teste não existe para aprovar a escolha atual, e sim
// para acusar o dia em que alguém aproximar as duas ajustando a paleta.

for (const [nome, p] of [['claro', CLARO], ['escuro', ESCURO]] as Array<[string, Paleta]>) {
  const d = distanciaDeMatiz(p.ok, p.alerta);
  chk('T3', d >= 60,
      `${nome}: --ok e --alerta estão a ${d.toFixed(0)}° de matiz (mínimo 60) — âmbar não vira verde`);
  const de = distanciaDeMatiz(p.erro, p.ok);
  chk('T3b', de >= 60, `${nome}: --erro e --ok estão a ${de.toFixed(0)}° — vermelho não vira verde`);
}

// A ADJACÊNCIA REGISTRADA, verificada como tal. Âmbar e o laranja da marca SÃO
// vizinhos, e o tema diz que nenhuma escolha de matiz separa os dois — a
// separação vem da forma. Este teste não exige distância; ele prende a
// afirmação: se algum dia o âmbar se afastar do acento, a nota de adjacência do
// `tema.ts` virou obsoleta e alguém precisa reescrevê-la.
chk('T3c', distanciaDeMatiz(CLARO.alerta, CLARO.acento) < 60,
    'claro: --alerta e --acento continuam vizinhos de matiz — a nota de adjacência segue valendo');

// --------------------------------------- T4 toda cor chega ao CSS, nos dois
//
// `variaveis()` no `tema.ts` é uma template string escrita à mão. Acrescentar um
// campo em `Paleta` obriga os dois objetos a preenchê-lo — isso o `tsc` garante
// —, mas NÃO obriga ninguém a emiti-lo como custom property. O sintoma de
// esquecer é um `var(--x)` que resolve para nada: a regra CSS inteira é
// descartada e o elemento fica sem cor, sem erro em lugar nenhum.

const kebab = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const [blocoClaro, blocoEscuro] = (() => {
  const i = VARIAVEIS_CSS.indexOf(':root[data-tema="escuro"]');
  return [VARIAVEIS_CSS.slice(0, i), VARIAVEIS_CSS.slice(i)];
})();

for (const chave of Object.keys(CLARO) as Array<keyof Paleta>) {
  const nome = `--${kebab(String(chave))}`;
  chk('T4', blocoClaro.includes(`${nome}: ${CLARO[chave]}`),
      `${nome} sai no bloco claro com o valor da Paleta`);
  chk('T4b', blocoEscuro.includes(`${nome}: ${ESCURO[chave]}`),
      `${nome} sai no bloco escuro com o valor da Paleta`);
}

// ------------------------------------------------- T5 a fonte não pode travar
//
// O `tema.ts` prometia desde o início que a tela não espera webfont, e em 30/07
// a Inter entrou. A promessa passou a depender de duas coisas verificáveis, e as
// duas são de UMA PALAVRA cada — o tipo de coisa que um ajuste de CSS apaga sem
// ninguém notar, e cujo efeito só aparece em conexão ruim.

chk('T5', /font-display:\s*swap/.test(FONTE_CSS),
    '@font-face declara font-display: swap — o texto aparece antes da fonte chegar');
chk('T5b', !/font-display:\s*(block|auto)/.test(FONTE_CSS),
    'e não `block` nem `auto`, que são os dois que escondem o texto esperando');
chk('T5c', TIPOGRAFIA.familia.startsWith("'Inter'"),
    'a Inter é a primeira da pilha — é ela que se vê quando o arquivo chega');
chk('T5d', TIPOGRAFIA.familia.includes('ui-sans-serif') && TIPOGRAFIA.familia.includes('system-ui'),
    'e a pilha de sistema continua ATRÁS: sem o arquivo, a tela é a de ontem, não uma tela quebrada');
chk('T5e', FONTE_CSS.includes('/fontes/') && !/https?:\/\//.test(FONTE_CSS),
    'servida pela nossa origem, de /fontes/ — nenhuma URL externa no @font-face');

console.log();
if (falhas > 0) { console.log(`--- tema: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- tema (contraste e tokens): 139 verificacoes, 0 falhas');
