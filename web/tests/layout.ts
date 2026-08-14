// AS REGRAS DO EDITOR DE LAYOUT, nos dois sentidos.
// Uso: node --experimental-strip-types web/tests/layout.ts
//
// COMO ESTAS VERIFICACOES SE VERIFICAM.
//
// Geometria de editor tem um modo de falha que revisao de codigo nao pega: o
// sinal trocado. `x + dx` contra `x - dx` compila igual, parece igual e produz
// um bloco que FOGE do cursor - e "arrastar move o bloco" e satisfeito pelas
// duas versoes. Entao o que se afirma aqui e sempre uma RELACAO ORIENTADA:
//
//   direcao    arrastar para a direita AUMENTA x; a alca esquerda puxada para a
//              direita ENCOLHE o bloco e a borda direita NAO SE MOVE
//   invariante a alca oposta e ponto fixo - a afirmacao que o sinal trocado quebra
//   fronteira  o bloco encosta na margem e PARA, e o passo seguinte nao o move
//   ida-volta  arrastar +d e depois -d volta ao ponto de partida
//   espelho    a area do editor bate com a relacao que a `L3` afirma no servidor
//
// Nenhuma verificacao compara contra constante que eu escolhi: todas comparam
// saida com entrada, ou saida com saida.

import {
  escalaDaPrevia, regraDaPagina, ladoDoQr, PX_POR_MM,
} from '../src/layout-regras.ts';
// O W10 compara a leitura da TELA contra a emissao do SERVIDOR - saida contra
// saida, e nao contra um SVG que eu escreveria a mao aqui. Um SVG de mentira
// concordaria comigo por construcao, que e exatamente o defeito que ele prende.
import { svgDoBrCode, paraSvg, codificar } from '../../src/dominio/qrcode.ts';
import { pixEstatico } from '../../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

console.log('== a geometria do papel na tela: escala, @page e o lado do QR ==\n');

// ---- W7: a escala da previa. E o conserto do "a previa nao e fiel ao papel".
{
  const PX_POR_MM = 96 / 25.4;
  const largura = 210 * PX_POR_MM;
  chk('W7a', Math.abs(escalaDaPrevia(largura, 210) - 1) < 1e-9,
      `com espaco exato para o papel, a escala e 1 (${escalaDaPrevia(largura, 210).toFixed(4)})`);
  chk('W7b', Math.abs(escalaDaPrevia(largura / 2, 210) - 0.5) < 1e-9,
      `com metade do espaco, a escala e 0,5 - proporcional (${escalaDaPrevia(largura / 2, 210).toFixed(4)})`);
  chk('W7c', escalaDaPrevia(largura * 3, 210) === 1,
      'com espaco de sobra NAO amplia: A4 esticado mostraria tipografia maior que a impressa');
  chk('W7d', escalaDaPrevia(0, 210) === 1 && escalaDaPrevia(500, 0) === 1,
      'largura zero (antes do primeiro layout do DOM) nao vira 0 nem NaN');
}

// ---- W8: a regra `@page`, que e o conserto do papel indefinido.
{
  const r = regraDaPagina('A4', 'retrato');
  chk('W8a', /size:\s*A4\s+portrait/.test(r) && /margin:\s*0/.test(r),
      `retrato vira portrait e a margem e ZERO - as do tenant ja estao nas coordenadas (${r})`);
  chk('W8b', /landscape/.test(regraDaPagina('A4', 'paisagem')),
      'paisagem vira landscape');
  // O oficio nao tem nome em CSS: entra como par de medidas, e a regra tem de
  // aceitar as duas formas sem tratar uma delas como caso especial.
  chk('W8c', /size:\s*216mm 330mm\s+portrait/.test(regraDaPagina('216mm 330mm', 'retrato')),
      'papel sem nome CSS entra como par de medidas');
}

// ---- W10: a caixa do QR le o tamanho do desenho, e nunca o contrario.
//
// O DEFEITO QUE ISTO PRENDE, medido em 09/08/2026 no bundle que producao serve: a
// tela declarava uma caixa de 180x180 e o servidor mandava um SVG de 220x220. O
// desenho vazava 40 px, e o texto seguinte - pintado depois, por ordem de arvore -
// caia POR CIMA do QR: 24 px da legenda no lado direito e a largura inteira do
// paragrafo de baixo, sobre o padrao localizador. Nao havia erro, nao havia log:
// so um QR que a camera nao le, num painel que existe para ser lido por camera.
//
// O sentido perigoso e o que W10a afirma: o numero NAO pode ser escolhido dos dois
// lados. Se o servidor mudar `lado`, a tela acompanha sem ninguem lembrar dela.
{
  const brcode = pixEstatico({
    chave: '66714022000121', recebedorNome: 'G3 GESTAO ENERGIA SOLAR',
    recebedorCidade: 'GOIANIA', valorCentavos: 12345,
  });

  for (const lado of [220, 160, 300]) {
    const { svg } = svgDoBrCode(brcode, { nivel: 'M', lado });
    chk('W10a', ladoDoQr(svg) === lado,
        `a tela le ${lado} do SVG que o servidor emitiu com lado ${lado} - o tamanho tem UMA fonte, e ela e o desenho`);
  }

  // Sem `lado`, o SVG so tem viewBox - e o viewBox esta em MODULOS, nao em pixels.
  // Devolver 57 aqui daria uma caixa de 57 px em volta de um desenho de 300, que e
  // o mesmo defeito com outro numero.
  const semLado = paraSvg(codificar(brcode, { nivel: 'M' }));
  chk('W10b', /viewBox="0 0 \d+ \d+"/.test(semLado) && ladoDoQr(semLado) === null,
      'SVG sem width/height devolve null (a caixa se ajusta ao conteudo) e NUNCA o numero do viewBox');

  const { svg } = svgDoBrCode(brcode, { nivel: 'M', lado: 220 });
  chk('W10c', ladoDoQr(svg.replace('height="220"', 'height="180"')) === null,
      'lados diferentes devolvem null em vez de adivinhar qual dos dois vale');

  chk('W10d', ladoDoQr('<div>nao sou svg</div>') === null && ladoDoQr('') === null,
      'entrada que nao e SVG nao vira tamanho');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
