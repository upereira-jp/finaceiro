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
// O TOTAL E CONTADO, e nao escrito no rodape. Ate 06/08/2026 a ultima linha
// dizia "139 verificacoes" enquanto a suite ja tinha 147 - os tres tokens do
// topo entraram e o numero fixo nao acompanhou. E a mesma classe que a K2d, a
// W8h e a N58 pegaram, e que `tests/repos-carteira.ts` ja tinha corrigido do
// mesmo jeito: um numero fixo medindo outra coisa.
let total = 0;
const chk = (id: string, cond: boolean, d: string) => {
  total++;
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

// ------------------------------------------------------ T6 a faixa do topo
//
// A FAIXA NÃO ESTAVA COBERTA POR NADA. As `SUPERFICIES` da T1 são as quatro em
// que o CONTEÚDO pousa; a barra é uma quinta superfície, com tintas próprias
// (`--topo-texto`, `--topo-fraco`) e com a navegação ativa em `--acento` por
// cima. Nenhum desses três pares aparece na T1, e o motivo é estrutural: eles
// não pousam nas mesmas superfícies que o resto.
//
// E A T6c EXISTE POR UM DEFEITO QUE A FOTO PEGOU E NENHUM CÁLCULO PEGARIA. A
// primeira versão do tema escuro usou a variante `#1C2C4E` para a faixa — que é
// exatamente o valor de `--fundo2`, o cartão. Contraste de texto: perfeito, tudo
// passava. Na tela, barra e cartão viraram a mesma cor e a hierarquia que a
// mudança existia para criar não existia. Contraste de TEXTO não mede separação
// entre SUPERFÍCIES vizinhas — são duas perguntas diferentes.

for (const [nome, p] of [['claro', CLARO], ['escuro', ESCURO]] as Array<[string, Paleta]>) {
  chk('T6', contraste(p.topoTexto, p.topo) >= 4.5,
      `${nome}: --topo-texto sobre --topo = ${contraste(p.topoTexto, p.topo).toFixed(2)}:1`);
  chk('T6b', contraste(p.topoFraco, p.topo) >= 4.5,
      `${nome}: a navegação INATIVA (--topo-fraco) sobre --topo = ${contraste(p.topoFraco, p.topo).toFixed(2)}:1`);
  chk('T6c', contraste(p.acento, p.topo) >= 4.5,
      `${nome}: a navegação ATIVA (--acento) sobre --topo = ${contraste(p.acento, p.topo).toFixed(2)}:1 — ` +
      'e é por isso que ela não usa --acento-forte, que é o laranja para superfície CLARA');
  /*
   * A SEPARAÇÃO ENTRE A FAIXA E O CARTÃO. 1.2:1 é baixo de propósito: não é
   * contraste de leitura, é a diferença que o olho precisa para ver DUAS caixas.
   *
   * E É SÓ CONTRA O CARTÃO, não contra a página — a primeira versão desta
   * verificação exigia os dois e era uma regra que o meio não cumpre. Medido: no
   * tema escuro, com a página em `#14213D`, **nem o preto puro separa 1.2** dela
   * (o teto é 1.31:1). Exigir isso do tom seria pedir o impossível de uma
   * superfície e depois afrouxar o número até passar — que é medir o teste, não
   * o tema.
   *
   * Quem separa a faixa da página é a BORDA e a sombra, que já existem no
   * `estilo.ts`. Contra o cartão é diferente e é onde estava o defeito real: os
   * dois são caixas que aparecem juntas na mesma tela, e quando têm o mesmo tom
   * a hierarquia desaparece — foi o que a foto pegou no primeiro tema escuro,
   * com `--topo` e `--fundo2` no mesmo `#1C2C4E`.
   */
  {
    const r = contraste(p.topo, p.fundo2);
    chk('T6d', r >= 1.2,
        `${nome}: a faixa se separa do CARTÃO = ${r.toFixed(2)}:1 (o olho precisa de 1.2 para ver duas caixas)`);
  }
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

// -------------------------------------------- T7 as tintas do PAPEL, medidas
//
// POR QUE ELAS NAO ESTAVAM AQUI, e por que passaram a estar.
//
// Esta suite media a `Paleta` — os tokens dos dois temas. O documento IMPRESSO
// nao usa token nenhum, de proposito: ele e literal, porque a mesma fatura nao
// pode sair de duas cores conforme o tema de quem mandou imprimir. Consequencia
// nao intencional: as tintas do papel ficaram FORA de toda medicao, e o unico
// teste que as tocava (`I1c` de `interface.ts`) confere QUAIS existem, nunca se
// passam.
//
// O CUSTO DISSO APARECEU EM 14/08, medido. Duas das seis reprovavam AA na fatura
// que vai ao cliente, e as duas estavam justificadas por escrito com numeros que
// ninguem tinha recalculado:
//
//   `#8F939D` sobre branco   o comentario dizia 4,02:1   e sao 3,08:1
//   `#E8843C` como TEXTO     nunca foi medido            e sao 2,69:1
//
// O papel tem TRES fundos e nao um — branco, o creme dos blocos secundarios, e o
// Navy das barras cheias —, e a justificativa antiga so olhava o primeiro. Um
// rotulo cinza sobre o bloco creme do cliente estava a 2,75:1.
//
// AA E O CRITERIO AQUI TAMBEM, e nao um piso mais frouxo "porque e papel". O
// argumento e o contrario: a tela tem zoom, tem tema e tem monitor bom; o papel
// e o que sai numa impressora domestica com toner economico, e nao tem nenhum
// dos tres.

/** As tintas e as superficies do `.g3`. Escritas aqui a mao, e nao lidas do CSS,
 *  pelo mesmo motivo da calculadora: quem confere nao compartilha fonte com quem
 *  e conferido. `interface.ts` (I1c) e que garante que a lista do CSS e esta. */
const PAPEL = {
  fundos: { branco: '#FFFFFF', creme: '#F6F2EA', navy: '#14213D', laranja: '#E8843C' },
  /** tinta -> os fundos em que ela de fato pousa no `estilo.ts`. */
  tintas: {
    /** Navy: texto corrido, rotulo de tabela, telefone do rodape. */
    '#14213D': ['branco', 'creme', 'laranja'],
    /** O cinza dos rotulos caixa-alta — o `--fraco` derivado, nao o Gray puro. */
    '#66686F': ['branco', 'creme'],
    /** O laranja QUANDO E TEXTO — o `--acento-forte` derivado. */
    '#995728': ['branco', 'creme'],
    /** Branco: so sobre as barras cheias. */
    '#FFFFFF': ['navy'],
    /** A linha da paleta, como TINTA, so sobre o cartao navy. */
    '#E4DFD4': ['navy'],
  } as Record<string, string[]>,
};

for (const [tinta, fundos] of Object.entries(PAPEL.tintas)) {
  for (const nome of fundos) {
    const fundo = PAPEL.fundos[nome as keyof typeof PAPEL.fundos];
    const r = contraste(tinta, fundo);
    chk('T7', r >= 4.5, `papel: ${tinta} sobre ${nome} (${fundo}) = ${r.toFixed(2)}:1 (AA pede 4.5)`);
  }
}

// O GRAY PURO DA G3 NAO PODE VOLTAR AO PAPEL, e a verificacao afirma o numero que
// o derruba em vez de so proibir o valor: se um dia alguem trouxer o `#8F939D` de
// volta "porque e a cor da marca", a linha que cai diz por que ele saiu.
// (so os dois fundos CLAROS: e neles que os rotulos caixa-alta pousam. Sobre o
//  Navy o Gray puro passaria — e sobre o Navy o papel usa branco e `#E4DFD4`.)
for (const nome of ['branco', 'creme'] as const) {
  const fundo = PAPEL.fundos[nome];
  chk('T7b', contraste('#8F939D', fundo) < 4.5,
      `papel: o Gray puro #8F939D sobre ${nome} da ${contraste('#8F939D', fundo).toFixed(2)}:1 — `
      + 'e por isso que o derivado #66686F ocupa o lugar dele');
}

// E O ORANGE CONTINUA VALENDO COMO SUPERFICIE. Ele saiu de tinta e ficou de
// fundo — a faixa do aviso, o cartao do desconto, a barra do mes atual. O par que
// importa e o Navy por cima dele, que e o mesmo do botao primario da interface.
chk('T7c', contraste('#14213D', '#E8843C') >= 4.5,
    `papel: Navy sobre o Orange = ${contraste('#14213D', '#E8843C').toFixed(2)}:1 — `
    + 'o Orange fica como SUPERFICIE, e o que pousa nele e o Navy');

// AS TINTAS DO PAPEL SAO OS DERIVADOS DO TEMA CLARO, e isso e afirmacao e nao
// coincidencia: as duas vieram do mesmo par da G3 pelo mesmo criterio de busca.
// Se um dia o tema mudar o degrau dele, esta linha cai e obriga a decidir se o
// papel acompanha — em vez de os dois divergirem em silencio.
chk('T7d', CLARO.fraco === '#66686F' && CLARO.acentoForte === '#995728',
    'as duas tintas derivadas do papel sao exatamente --fraco e --acento-forte do tema claro '
    + `(hoje ${CLARO.fraco} e ${CLARO.acentoForte}) — mesma origem, mesmo criterio`);

console.log();
if (falhas > 0) { console.log(`--- tema: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- tema (contraste e tokens): ${total} verificacoes, 0 falhas`);
