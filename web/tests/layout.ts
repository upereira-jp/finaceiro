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
  areaDaFolha, medidasComOrientacao, naGrade, arrastar, redimensionar,
  escalaDaPrevia, regraDaPagina, blocoNovo, ladoDoQr, PASSO_MM, MINIMO_MM,
  type FolhaDoEditor, type Retangulo,
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

// As medidas vem do SERVIDOR na vida real - aqui sao entrada do teste, que e a
// forma de provar que este modulo nao carrega uma segunda tabela de papeis.
const A4 = { largura_mm: 210, altura_mm: 297 };
const folha: FolhaDoEditor = {
  papel: 'a4', orientacao: 'retrato',
  margem_topo_mm: 16, margem_direita_mm: 16, margem_baixo_mm: 16, margem_esquerda_mm: 16,
};
const area: Retangulo = areaDaFolha(A4, folha);
const bloco = { x_mm: 50, y_mm: 50, largura_mm: 40, altura_mm: 30 };

console.log('== o editor de layout: arrastar, redimensionar, prender e escalar ==\n');

// ---- W1: a grade e o que o banco guarda.
{
  chk('W1a', naGrade(50.26) === 50.5 && naGrade(50.24) === 50 && naGrade(-0.1) === 0,
      `prende no passo de ${PASSO_MM}mm (50.26 -> ${naGrade(50.26)}, 50.24 -> ${naGrade(50.24)})`);
  /*
   * A razao de existir: `numeric(6,1)`. Um valor com duas casas voltaria do
   * banco diferente de onde a pessoa soltou o bloco.
   *
   * E O `.map(naGrade)` ABAIXO E DELIBERADO - e o registro executavel de um
   * defeito que esta linha achou ao ser escrita. `Array.map` passa
   * `(valor, indice, array)`, entao o indice vira `passo`: o primeiro elemento
   * dividia por ZERO e saia `NaN`, que viajaria ate a coluna como coordenada e
   * faria o bloco sumir do papel sem erro em lugar nenhum. Chamar com um
   * argumento so esconderia o buraco em vez de prende-lo.
   */
  const todos = [0.1, 12.34, 99.99, 210].map(naGrade);
  chk('W1b', todos.every((v) => Number.isFinite(v) && Number.isInteger(Math.round(v * 10))),
      `toda saida cabe em numeric(6,1), inclusive sob .map (passo=indice) (${todos.join(', ')})`);
}

// ---- W2: orientacao. Girar duas vezes volta ao original.
{
  const p = medidasComOrientacao(A4, 'paisagem');
  const voltou = medidasComOrientacao(p, 'paisagem');
  chk('W2', p.largura_mm === A4.altura_mm && voltou.largura_mm === A4.largura_mm
       && voltou.altura_mm === A4.altura_mm,
      `paisagem troca os lados e girar de volta restaura (${A4.largura_mm}x${A4.altura_mm} -> ${p.largura_mm}x${p.altura_mm} -> ${voltou.largura_mm}x${voltou.altura_mm})`);
}

// ---- W3: O ESPELHO. A area do editor tem de bater com a do servidor.
//
// Nao ha como importar `src/` daqui - o tsconfig do `web/` nao o inclui, de
// proposito. Entao o que se prende e a RELACAO, que e a mesma que a `L3` afirma
// do outro lado: area mais margens reconstroi o papel. As duas cairiam juntas se
// uma das implementacoes trocasse uma margem de lado.
{
  const f: FolhaDoEditor = { ...folha, margem_topo_mm: 10, margem_direita_mm: 15,
                             margem_baixo_mm: 20, margem_esquerda_mm: 25 };
  const a = areaDaFolha(A4, f);
  chk('W3a', a.x_mm + a.largura_mm + f.margem_direita_mm === A4.largura_mm
       && a.y_mm + a.altura_mm + f.margem_baixo_mm === A4.altura_mm
       && a.x_mm === f.margem_esquerda_mm && a.y_mm === f.margem_topo_mm,
      `area + margens reconstroi o papel, e as margens nao trocam de lado (${a.largura_mm}x${a.altura_mm})`);

  const p = areaDaFolha(A4, { ...f, orientacao: 'paisagem' });
  chk('W3b', p.largura_mm === A4.altura_mm - f.margem_esquerda_mm - f.margem_direita_mm,
      `a orientacao entra ANTES da subtracao das margens (${p.largura_mm}mm)`);
}

// ---- W4: arrastar. Direcao, ida-e-volta e a parede.
{
  const d = arrastar(bloco, 10, 5, area);
  chk('W4a', d.x_mm === bloco.x_mm + 10 && d.y_mm === bloco.y_mm + 5
       && d.largura_mm === bloco.largura_mm && d.altura_mm === bloco.altura_mm,
      `arrastar para a direita/baixo AUMENTA x e y, e nao mexe no tamanho (${d.x_mm},${d.y_mm})`);

  const volta = arrastar(d, -10, -5, area);
  chk('W4b', volta.x_mm === bloco.x_mm && volta.y_mm === bloco.y_mm,
      `ida e volta retorna ao ponto de partida (${volta.x_mm},${volta.y_mm})`);

  // A parede da esquerda/topo: empurrar muito para de mover, e nao passa.
  const canto = arrastar(bloco, -1000, -1000, area);
  chk('W4c', canto.x_mm === area.x_mm && canto.y_mm === area.y_mm,
      `empurrado contra o canto, PARA na margem (${canto.x_mm},${canto.y_mm} = ${area.x_mm},${area.y_mm})`);
  chk('W4d', arrastar(canto, -10, -10, area).x_mm === area.x_mm,
      'ja na parede, o passo seguinte nao o move mais - nao ha deriva');

  // A parede da direita/baixo respeita o TAMANHO do bloco.
  const fim = arrastar(bloco, 1000, 1000, area);
  chk('W4e', fim.x_mm + fim.largura_mm === area.x_mm + area.largura_mm
       && fim.y_mm + fim.altura_mm === area.y_mm + area.altura_mm,
      `contra a borda oposta, e a BORDA do bloco que encosta - nao o canto dele (${fim.x_mm}+${fim.largura_mm})`);

  // E o tamanho continua o mesmo: prender a posicao nunca encolhe o bloco.
  chk('W4f', fim.largura_mm === bloco.largura_mm && fim.altura_mm === bloco.altura_mm,
      'prender a posicao NAO encolhe o bloco - seria consertar o arrasto mudando outra coisa');
}

// ---- W5: redimensionar. A alca oposta e PONTO FIXO.
//
// E a verificacao que mais paga do arquivo: "a alca esquerda muda a largura" e
// satisfeito por uma implementacao que move o bloco inteiro. So a afirmacao de
// que a borda DIREITA nao se move distingue as duas.
{
  const esq = redimensionar(bloco, 'esquerda', 10, 0, area);
  chk('W5a', esq.x_mm === bloco.x_mm + 10 && esq.largura_mm === bloco.largura_mm - 10
       && esq.x_mm + esq.largura_mm === bloco.x_mm + bloco.largura_mm,
      `alca ESQUERDA puxada para a direita encolhe, e a borda direita NAO SE MOVE `
      + `(${esq.x_mm}+${esq.largura_mm} = ${bloco.x_mm + bloco.largura_mm})`);

  const dir = redimensionar(bloco, 'direita', 10, 0, area);
  chk('W5b', dir.x_mm === bloco.x_mm && dir.largura_mm === bloco.largura_mm + 10,
      `alca DIREITA cresce sem mover x (${dir.x_mm}, ${dir.largura_mm})`);

  const topo = redimensionar(bloco, 'topo', 0, 10, area);
  chk('W5c', topo.y_mm === bloco.y_mm + 10 && topo.altura_mm === bloco.altura_mm - 10
       && topo.y_mm + topo.altura_mm === bloco.y_mm + bloco.altura_mm,
      `alca TOPO puxada para baixo encolhe, e a base NAO SE MOVE (${topo.y_mm}+${topo.altura_mm})`);

  const base = redimensionar(bloco, 'base', 0, 10, area);
  chk('W5d', base.y_mm === bloco.y_mm && base.altura_mm === bloco.altura_mm + 10,
      `alca BASE cresce sem mover y (${base.y_mm}, ${base.altura_mm})`);

  // A diagonal mexe nos DOIS eixos - e o teste que pega uma alca que so trata um.
  const diag = redimensionar(bloco, 'topo-esquerda', 10, 10, area);
  chk('W5e', diag.x_mm === bloco.x_mm + 10 && diag.y_mm === bloco.y_mm + 10
       && diag.largura_mm === bloco.largura_mm - 10 && diag.altura_mm === bloco.altura_mm - 10,
      `a diagonal topo-esquerda mexe nos DOIS eixos (${diag.x_mm},${diag.y_mm} ${diag.largura_mm}x${diag.altura_mm})`);

  // E o canto oposto continua parado, que e a mesma invariante em duas dimensoes.
  chk('W5f', diag.x_mm + diag.largura_mm === bloco.x_mm + bloco.largura_mm
       && diag.y_mm + diag.altura_mm === bloco.y_mm + bloco.altura_mm,
      'na diagonal, o canto OPOSTO e ponto fixo nos dois eixos');
}

// ---- W6: o bloco nao inverte, e nao sai da area.
{
  // Puxar a alca esquerda para muito depois da direita inverteria a largura.
  const espremido = redimensionar(bloco, 'esquerda', 1000, 0, area);
  chk('W6a', espremido.largura_mm === MINIMO_MM
       && espremido.x_mm + espremido.largura_mm === bloco.x_mm + bloco.largura_mm,
      `a alca nao atravessa a oposta: para no minimo de ${MINIMO_MM}mm com a borda direita fixa `
      + `(${espremido.largura_mm}mm)`);

  const esticado = redimensionar(bloco, 'direita', 1000, 0, area);
  chk('W6b', esticado.x_mm + esticado.largura_mm === area.x_mm + area.largura_mm,
      `esticar sem limite para na margem (${esticado.x_mm}+${esticado.largura_mm} = ${area.x_mm + area.largura_mm})`);

  const alto = redimensionar(bloco, 'base', 0, 1000, area);
  chk('W6c', alto.y_mm + alto.altura_mm === area.y_mm + area.altura_mm,
      `o mesmo na vertical (${alto.y_mm}+${alto.altura_mm})`);

  const cima = redimensionar(bloco, 'topo', 0, -1000, area);
  chk('W6d', cima.y_mm === area.y_mm && cima.y_mm + cima.altura_mm === bloco.y_mm + bloco.altura_mm,
      'a alca do topo para na margem superior e a base continua parada');
}

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

// ---- W9: bloco novo nasce no canto, dentro da area, e nunca maior que ela.
{
  const b = blocoNovo('texto', area);
  chk('W9a', b.x_mm === area.x_mm && b.y_mm === area.y_mm,
      `nasce no canto da area util, nao no centro - no centro nasceria por cima do que ja esta la (${b.x_mm},${b.y_mm})`);

  const apertada: Retangulo = { x_mm: 5, y_mm: 5, largura_mm: 20, altura_mm: 10 };
  const c = blocoNovo('texto', apertada);
  chk('W9b', c.largura_mm <= apertada.largura_mm && c.altura_mm <= apertada.altura_mm,
      `numa area menor que o tamanho padrao, o bloco nasce CABENDO (${c.largura_mm}x${c.altura_mm} em ${apertada.largura_mm}x${apertada.altura_mm})`);

  chk('W9c', blocoNovo('linha', area).altura_mm === 1,
      'o filete nasce com 1mm de altura, nao com os 20 do bloco comum');
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
