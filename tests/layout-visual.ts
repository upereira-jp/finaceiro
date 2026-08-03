// O LAYOUT DA FATURA POR POSICAO, na parte pura. SEM BANCO e SEM DOM.
// Uso: node --experimental-strip-types tests/layout-visual.ts
// Migration 23 · `PLANO-layout-visual-2026-08-03.md`.
//
// COMO ESTAS VERIFICACOES SE VERIFICAM.
//
// O risco de um modulo de geometria e a tautologia por tabela: escrever
// "A4 tem 210x297" ao lado de uma constante que diz 210x297 nao prova nada -
// prova que eu copiei o mesmo numero duas vezes. Um erro de digitacao na
// constante seria copiado para o esperado com a mesma naturalidade.
//
// Entao o que se afirma aqui sao RELACOES e ANCORAS EXTERNAS:
//
//   ancora     A4 tem a razao sqrt(2) e A5 e METADE do A4 - as duas sao ISO 216,
//              nao escolha minha, e as duas pegam digito trocado na constante
//   relacao    girar duas vezes volta ao original; area imprimivel = papel menos
//              as quatro margens, conferida pela SOMA e nao pela subtracao
//   fronteira  o bloco que encosta exatamente no limite PASSA e o que passa 0,1mm
//              FALHA - as duas metades, porque so a primeira e satisfeita por uma
//              funcao que nunca acusa
//   silencio   cada acusacao tem o seu caso mudo, com um campo de diferenca
//   producao   o layout PADRAO cabe no A4 padrao com zero problemas, que e a
//              afirmacao de que quem nunca abrir o editor nao ve aviso nenhum

import {
  PAPEIS, FOLHA_PADRAO, medidasDaFolha, areaImprimivel, layoutPadrao,
  foraDaPagina, conferirLayout, documentoPosicionado,
  type Bloco, type Folha,
} from '../src/dominio/layout-visual.ts';
import type { DadosDaFatura } from '../src/dominio/layout-do-documento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const bloco = (o: Partial<Bloco> & { id: string }): Bloco => ({
  tipo: 'texto', campo: null, texto: 'x',
  x_mm: 20, y_mm: 20, largura_mm: 40, altura_mm: 20,
  alinhamento: 'esquerda', tamanho_pt: 10, peso: 'normal',
  borda: false, fundo: false, z: 0, ...o,
});
const folha = (o: Partial<Folha> = {}): Folha => ({ ...FOLHA_PADRAO, ...o });

const fatura: DadosDaFatura = {
  competencia: '2026-07-01', vencimento: '2026-08-10',
  numero_uc: '000041446801282', distribuidora: 'Equatorial GO',
  cliente_nome: 'Fulano de Tal', cliente_documento: '11144477735',
  usina_codigo_geradora: '0001',
  geracao_kwh_competencia: '10299.0000', percentual_rateio_aplicado: '5.5000',
  consumo_kwh: '566.4450', tarifa_reais_por_kwh: '0.856000',
  valor_consumo_centavos: 48487, valor_tarifas_concessionaria_centavos: 0,
  valor_juros_multa_centavos: 0, valor_total_centavos: 48487,
  flag_fatura_cheia: true,
};

console.log('== o layout da fatura por POSICAO: folha, blocos e composicao ==\n');

// ---- L1: as medidas dos papeis, contra ancora EXTERNA e nao contra si mesmas.
{
  // ISO 216: a razao entre lado maior e menor e sqrt(2), e e o que define a
  // serie. Tolerancia de 0,5% absorve o arredondamento para milimetro inteiro.
  const razao = (p: { largura_mm: number; altura_mm: number }) => p.altura_mm / p.largura_mm;
  const raiz2 = Math.SQRT2;
  chk('L1a', Math.abs(razao(PAPEIS.a4) - raiz2) / raiz2 < 0.005
       && Math.abs(razao(PAPEIS.a5) - raiz2) / raiz2 < 0.005,
      `ISO 216: A4 e A5 tem razao sqrt(2) (a4=${razao(PAPEIS.a4).toFixed(4)}, a5=${razao(PAPEIS.a5).toFixed(4)})`);

  // A outra propriedade da serie: A5 e o A4 dobrado ao meio.
  chk('L1b', PAPEIS.a5.largura_mm === Math.floor(PAPEIS.a4.altura_mm / 2)
       && PAPEIS.a5.altura_mm === PAPEIS.a4.largura_mm,
      `ISO 216: A5 e o A4 dobrado ao meio (${PAPEIS.a5.largura_mm}x${PAPEIS.a5.altura_mm})`);

  // O oficio BRASILEIRO nao e o Legal americano (216x356). A diferenca e 26 mm,
  // e ela apareceria como rodape cortado - por isso ha verificacao para ela.
  chk('L1c', PAPEIS.oficio.altura_mm === 330 && PAPEIS.oficio.largura_mm === PAPEIS.carta.largura_mm,
      `oficio brasileiro (216x330), nao o Legal americano de 356mm (${PAPEIS.oficio.altura_mm}mm)`);
}

// ---- L2: orientacao. Girar duas vezes volta ao original.
{
  const retrato = medidasDaFolha(folha({ orientacao: 'retrato' }));
  const paisagem = medidasDaFolha(folha({ orientacao: 'paisagem' }));
  chk('L2a', paisagem.largura_mm === retrato.altura_mm && paisagem.altura_mm === retrato.largura_mm,
      `paisagem troca os dois lados (${retrato.largura_mm}x${retrato.altura_mm} -> ${paisagem.largura_mm}x${paisagem.altura_mm})`);
  chk('L2b', paisagem.largura_mm > paisagem.altura_mm && retrato.altura_mm > retrato.largura_mm,
      'paisagem e mais larga que alta, retrato o contrario - a afirmacao que um swap invertido quebraria');
}

// ---- L3: area imprimivel, conferida pela SOMA.
//
// Somar de volta as quatro margens tem de reproduzir o papel. E a mesma
// conferencia por outro caminho: uma subtracao errada (margem trocada de lado,
// margem contada duas vezes) nao fecha a soma.
{
  for (const orientacao of ['retrato', 'paisagem'] as const) {
    const f = folha({ orientacao, margem_topo_mm: 10, margem_direita_mm: 15,
                      margem_baixo_mm: 20, margem_esquerda_mm: 25 });
    const m = medidasDaFolha(f);
    const a = areaImprimivel(f);
    chk(`L3${orientacao === 'retrato' ? 'a' : 'b'}`,
        a.x_mm + a.largura_mm + f.margem_direita_mm === m.largura_mm
        && a.y_mm + a.altura_mm + f.margem_baixo_mm === m.altura_mm
        && a.x_mm === f.margem_esquerda_mm && a.y_mm === f.margem_topo_mm,
        `${orientacao}: area + margens reconstroi o papel (${a.largura_mm}x${a.altura_mm} em ${m.largura_mm}x${m.altura_mm}), `
        + 'e as margens nao trocam de lado');
  }
}

// ---- L4: a FRONTEIRA, nos dois sentidos. E a verificacao que mais paga.
//
// So "o que passa falha" e satisfeito por uma funcao que acusa tudo; so "o que
// cabe passa" e satisfeito por uma que nunca acusa. As duas juntas prendem o
// limite no lugar exato.
{
  const f = folha();                       // A4 retrato, 16mm: area 178 x 265
  const a = areaImprimivel(f);

  const encosta = bloco({ id: 'encosta', x_mm: a.x_mm, y_mm: a.y_mm,
                          largura_mm: a.largura_mm, altura_mm: a.altura_mm });
  chk('L4a', foraDaPagina(encosta, f) === null,
      `bloco que ocupa a area imprimivel INTEIRA passa (${a.largura_mm}x${a.altura_mm}mm)`);

  for (const [nome, b] of [
    ['0,1mm a mais na largura', bloco({ id: 'w', x_mm: a.x_mm, y_mm: a.y_mm, largura_mm: a.largura_mm + 0.1, altura_mm: 10 })],
    ['0,1mm a mais na altura',  bloco({ id: 'h', x_mm: a.x_mm, y_mm: a.y_mm, largura_mm: 10, altura_mm: a.altura_mm + 0.1 })],
    ['0,1mm acima da margem',   bloco({ id: 'y', x_mm: a.x_mm, y_mm: a.y_mm - 0.1, largura_mm: 10, altura_mm: 10 })],
    ['0,1mm antes da margem',   bloco({ id: 'x', x_mm: a.x_mm - 0.1, y_mm: a.y_mm, largura_mm: 10, altura_mm: 10 })],
  ] as const) {
    chk('L4b', foraDaPagina(b, f)?.tipo === 'fora_da_pagina', `${nome}: FORA da pagina`);
  }

  // Largura zero: ocupa espaco nenhum e nao imprime nada.
  chk('L4c', foraDaPagina(bloco({ id: 'z', largura_mm: 0 }), f)?.tipo === 'fora_da_pagina',
      'bloco de largura zero e recusado');

  // E o mesmo bloco em papel MENOR passa a nao caber - a troca de papel e uma
  // mudanca que precisa ser vista, e nao silenciosamente reescalada.
  const emA5 = foraDaPagina(encosta, folha({ papel: 'a5' }));
  chk('L4d', emA5?.tipo === 'fora_da_pagina' && /a5/.test(emA5.detalhe),
      'o bloco que cabia no A4 acusa ao trocar para A5, e o motivo NOMEIA o papel');
}

// ---- L5: sobreposicao e SINAL, com o caso mudo ao lado.
{
  const f = folha();
  const a = bloco({ id: 'a', x_mm: 20, y_mm: 20, largura_mm: 40, altura_mm: 20 });

  // Encostados, nao sobrepostos: 20+40 = 60, e o vizinho comeca em 60.
  const vizinho = bloco({ id: 'b', x_mm: 60, y_mm: 20, largura_mm: 40, altura_mm: 20 });
  chk('L5a', conferirLayout(f, [a, vizinho]).length === 0,
      'blocos que se ENCOSTAM (x=60 logo apos 20+40) nao sao sobreposicao');

  // Um milimetro para tras e passam a se cobrir. Um campo de diferenca.
  const sobreposto = bloco({ id: 'b', x_mm: 59, y_mm: 20, largura_mm: 40, altura_mm: 20 });
  const p = conferirLayout(f, [a, sobreposto]);
  chk('L5b', p.length === 1 && p[0]!.tipo === 'sobreposicao',
      `1mm de invasao vira sinal de sobreposicao (${p.length})`);

  // `linha` atravessa por desenho: acusa-la seria ruido em todo layout que use
  // filete, e o criterio de ruido deste projeto ja esta escrito na R25.
  const filete = bloco({ id: 'f', tipo: 'linha', x_mm: 16, y_mm: 25, largura_mm: 178, altura_mm: 1 });
  chk('L5c', conferirLayout(f, [a, filete]).length === 0,
      'filete separador atravessando um bloco NAO vira sinal - seria ruido em todo layout');
}

// ---- L6: bloco que ocupa area e nao pinta nada.
{
  const f = folha();
  chk('L6a', conferirLayout(f, [bloco({ id: 't', tipo: 'texto', texto: '   ' })])
              .some((x) => x.tipo === 'sem_conteudo'),
      'bloco de texto com so espaco em branco e acusado');
  chk('L6b', conferirLayout(f, [bloco({ id: 'c', tipo: 'campo', campo: null })])
              .some((x) => x.tipo === 'sem_conteudo'),
      'bloco de campo sem campo escolhido e acusado');
  chk('L6c', conferirLayout(f, [bloco({ id: 'c', tipo: 'campo', campo: 'valor_total_centavos' })])
              .every((x) => x.tipo !== 'sem_conteudo'),
      'bloco de campo COM campo nao e acusado - o caso mudo da L6b');
}

// ---- L7: o LAYOUT PADRAO cabe, e essa e a afirmacao que protege quem nao configurou.
{
  const p = conferirLayout(FOLHA_PADRAO, layoutPadrao());
  chk('L7', p.length === 0,
      `o layout PADRAO no A4 padrao nao produz UM problema sequer - quem nunca abrir o editor `
      + `nao ve aviso (${p.length}: ${p.map((x) => `${x.tipo}/${x.blocoId}`).join(', ') || 'nenhum'})`);
}

// ---- L8: a composicao. Blocos vazios caem no padrao, e os dados chegam formatados.
{
  const d = documentoPosicionado(fatura, FOLHA_PADRAO, []);
  chk('L8a', d.blocos.length === layoutPadrao().length && d.problemas.length === 0,
      `blocos vazio cai no layoutPadrao (${d.blocos.length} blocos)`);

  const tabela = d.blocos.find((b) => b.tipo === 'tabela_de_campos');
  chk('L8b', tabela?.linhas?.length === 15
       && tabela.linhas.some((l) => l.campo === 'valor_total_centavos' && l.valor === 'R$ 484,87'),
      `o bloco de tabela carrega as linhas JA formatadas em reais por texto `
      + `(${tabela?.linhas?.length} linhas, total=${tabela?.linhas?.find((l) => l.campo === 'valor_total_centavos')?.valor})`);

  chk('L8c', d.medidas.largura_mm === 210 && d.area.largura_mm === 178,
      `a composicao leva a folha e a area junto (${d.medidas.largura_mm}mm papel, ${d.area.largura_mm}mm util)`);
}

// ---- L9: o bloco `campo` isolado - o que permite o TOTAL num quadro proprio.
{
  const total = bloco({ id: 'tot', tipo: 'campo', campo: 'valor_total_centavos',
                        x_mm: 120, y_mm: 200, largura_mm: 74, altura_mm: 24,
                        alinhamento: 'direita', tamanho_pt: 18, peso: 'forte', borda: true });
  const d = documentoPosicionado(fatura, FOLHA_PADRAO, [total]);
  const b = d.blocos[0]!;
  chk('L9a', b.valor === 'R$ 484,87' && b.rotulo === 'TOTAL A PAGAR' && b.ausente === false,
      `campo isolado traz rotulo e valor formatados (${b.rotulo}: ${b.valor})`);

  // O PONTO 5 DO PLANO: o estilo e DADO e nao decisao da tela. Ate hoje o
  // negrito do total vivia so no `.tsx`, entao o CRM - que consome a mesma rota
  // e nao roda React - receberia a fatura sem ele.
  chk('L9b', b.peso === 'forte' && b.tamanho_pt === 18 && b.alinhamento === 'direita' && b.borda === true,
      'peso, tamanho, alinhamento e borda viajam NO DADO - os dois consumidores recebem o mesmo');

  // Campo ESCONDIDO na configuracao continua escondido no bloco isolado.
  const escondido = documentoPosicionado(fatura, FOLHA_PADRAO, [total],
    [{ campo: 'valor_total_centavos', rotulo: null, ordem: 0, visivel: false }]);
  chk('L9c', escondido.blocos[0]!.ausente === true && escondido.blocos[0]!.valor === '—',
      'campo escondido na configuracao NAO ressuscita num bloco isolado - esconder vale para o documento inteiro');
}

// ---- L10: a ordem de pintura e o `z`, com desempate ESTAVEL.
//
// Sem desempate deterministico, duas composicoes dos mesmos dados poderiam sair
// em ordens diferentes - e a fatura do CRM divergiria da nossa sem ninguem mexer
// em nada. E o mesmo argumento do desempate por `codigo` no dedup do conector.
{
  const d = documentoPosicionado(fatura, FOLHA_PADRAO, [
    bloco({ id: 'zz', z: 5, x_mm: 20, y_mm: 20 }),
    bloco({ id: 'aa', z: 5, x_mm: 20, y_mm: 60 }),
    bloco({ id: 'mm', z: 1, x_mm: 20, y_mm: 100 }),
  ]);
  chk('L10', d.blocos.map((b) => b.id).join(',') === 'mm,aa,zz',
      `z menor pinta primeiro e o empate desempata pelo id (${d.blocos.map((b) => b.id).join(',')})`);
}

// ---- L11: os problemas VIAJAM COM O DOCUMENTO, nunca so em log.
//
// Mesma forma das `divergencias` do conector: sinal que nao interrompe nada e o
// que mais facilmente vira silencio.
{
  const d = documentoPosicionado(fatura, folha({ papel: 'a5' }), layoutPadrao());
  chk('L11', d.problemas.length > 0 && d.problemas.every((p) => p.tipo === 'fora_da_pagina'),
      `layout de A4 numa folha A5: ${d.problemas.length} blocos acusados, e a acusacao vem DENTRO do documento`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
