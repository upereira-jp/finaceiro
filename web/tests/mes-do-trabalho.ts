// O MÊS DE TRABALHO — um mês para o Rateio, numa fonte só.
// Uso: node --experimental-strip-types web/tests/mes-do-trabalho.ts
//
// ============================================================================
// O QUE ESTA SUITE PRENDE (01/10/2026, etapa 8 do redesenho)
//
// O dono pediu um mês único, escolhido uma vez e válido para as telas do
// trabalho do mês — até aqui Mês, Contas de luz e Cobranças tinham, cada uma, o
// seu seletor e a sua regra de abertura. A regra nova mora em
// `web/src/mes-do-trabalho.ts`, e esta suíte prende:
//
//   MT1  a resolução, nas quatro fontes e na ordem decidida (link, lembrado,
//        trabalho, hoje), e o «procurando» entre elas;
//   MT2  a procura do trabalho, que passou a ver a conta por virar cobrança;
//   MT3  o que segue o mês e o que não segue — tela por tela do menu;
//   MT4  a sincronia com o endereço: o link que pede, o `replaceState` que
//        escreve, e o que não se toca;
//   MT5  o aviso de mês lembrado atrás do mês com trabalho;
//   MT6  o atalho `[` / `]` e o mês vizinho;
//   MT7  a conta de outro mês na fila de Contas de luz;
//   MT8  a lembrança, que não derruba a tela;
//   MT9  as telas: nenhum seletor de mês próprio sobrou, o título diz o mês, a
//        frase do porquê sai de um lugar só, e o anúncio do mês em tela saiu;
//   MT10 os links do funil levam o mês.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolverMes, fraseDaOrigem, notaDaOrigem, comoSegueOMes, ROTAS_QUE_SEGUEM_O_MES, COMO_SEGUE_O_MES,
  fraseDoAlcance, mesPedidoPeloEndereco, enderecoComOMes, enderecoSemOMes, mesComTrabalhoAFrente,
  mesVizinho, passoDoAtalho, mesDaConta, contasDeOutroMes, lerMesLembrado, lembrarMes,
  CHAVE_DO_MES_LEMBRADO, nomeDoMesDeTrabalho, mesDoEndereco, type EscolhaDoMes,
} from '../src/mes-do-trabalho.ts';
import { procurarMesComTrabalho, candidatosDoMes, mesSemTrabalho } from '../src/emissao-regras.ts';
import { TELAS } from '../src/navegacao.ts';
import { TELAS_QUE_LEEM_O_MES } from '../src/destino-da-camada.ts';
import { MOLDES, enderecoDoPasso } from '../src/roteiro-do-mes.ts';
import { mesAbreviado, mesCurtoDoAno } from '../src/formato.ts';
import { alvoRecebeLetra } from '../src/teclado.ts';
import { mesDaQuery } from '../src/dinheiro.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ler = (rel: string) => readFileSync(SRC + rel, 'utf8');
const semComentario = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const HOJE = '2026-10';
const TRABALHO: EscolhaDoMes = { mes: '2026-09', origem: 'trabalho', certo: true };

/* ==========================================================================
 * MT1 — a resolução: link, lembrado, trabalho, hoje
 * ========================================================================== */
{
  const r = (p: Partial<Parameters<typeof resolverMes>[0]>) => resolverMes({
    doEndereco: null, lembrado: null, procurado: null, procurando: false, hoje: HOJE, ...p,
  });
  chk('MT1a', JSON.stringify(r({ doEndereco: '2026-07', lembrado: '2026-08', procurado: TRABALHO }))
              === JSON.stringify({ mes: '2026-07', origem: 'endereco' }),
      'o `?mes=` do link vence tudo — o lembrado e o mês com trabalho');
  chk('MT1b', JSON.stringify(r({ lembrado: '2026-08', procurado: TRABALHO })) === JSON.stringify({ mes: '2026-08', origem: 'lembrado' }),
      'sem link, a escolha lembrada vem ANTES do trabalho (até 01/10 vinha depois, e escolher agosto numa tela '
      + 'abria setembro na seguinte)');
  chk('MT1c', JSON.stringify(r({ procurado: TRABALHO })) === JSON.stringify(TRABALHO)
              && r({ procurado: { mes: '2026-09', origem: 'recente' } })?.origem === 'recente',
      'sem link nem lembrança, vale a procura: o mês mais recente com trabalho, ou o mais recente com contas');
  chk('MT1d', JSON.stringify(r({})) === JSON.stringify({ mes: HOJE, origem: 'hoje' }),
      'sem nada — a procura falhou ou não achou mês nenhum —, o mês de hoje, e ele diz que é o de hoje');
  chk('MT1e', r({ procurando: true }) === null && r({ procurando: true, lembrado: '2026-08' })?.mes === '2026-08',
      'enquanto a procura anda e não há link nem lembrança, «procurando» (`null`) — e não o mês de hoje por um '
      + 'instante; com lembrança, a tela não espera a procura');
  chk('MT1f', r({ doEndereco: '2026-13', lembrado: 'lixo', procurado: TRABALHO })?.mes === '2026-09'
              && r({ doEndereco: '09/2026' })?.origem === 'hoje',
      'mês inválido no link ou na lembrança não vira mês: cai no degrau seguinte');
  const frases = (['endereco', 'lembrado', 'trabalho', 'recente', 'hoje', 'escolhido'] as const).map(fraseDaOrigem);
  chk('MT1g', frases.every((f) => f.length > 0 && /\.$/.test(f)) && new Set(frases).size === frases.length
              && /trabalho/.test(fraseDaOrigem('trabalho')) && /conta por virar cobrança/.test(fraseDaOrigem('trabalho'))
              && !/Nenhum mês/.test(fraseDaOrigem('lembrado')),
      'cada origem tem a sua frase do porquê — e a do lembrado não diz mais «nenhum mês tem trabalho» (o '
      + 'lembrado vem antes da procura agora)');
  chk('MT1h', notaDaOrigem('escolhido') === '' && notaDaOrigem(null) === ''
              && (['endereco', 'lembrado', 'trabalho', 'recente', 'hoje'] as const).every((o) => notaDaOrigem(o).split(' ').length <= 5),
      'a nota curta do menu tem no máximo cinco palavras, e some quando a pessoa acabou de escolher');
}

/* ==========================================================================
 * MT2 — a procura do trabalho vê os passos 2, 3 e 4
 * ========================================================================== */
{
  const carteira = [{ competencia: '2026-08-01', faturas: 33, emitidas: 0, liquidadas: 33 }];
  const registradas = [
    { competencia: '2026-09-01', fatura_id: null, cobranca_disponivel: true },
    { competencia: '2026-08-01', fatura_id: 'f1', cobranca_disponivel: true },
  ];
  const c = candidatosDoMes(carteira, [], registradas);
  chk('MT2a', c.length === 1 && c[0]!.mes === '2026-09' && c[0]!.certo,
      'a conta registrada por virar cobrança é trabalho CERTO: setembro, com seis contas por gerar e nenhuma '
      + 'cobrança ainda, é o mês do trabalho — sem isto, Contas de luz abriria em agosto');
  chk('MT2b', candidatosDoMes(carteira, [], [{ competencia: '2026-09-01', fatura_id: null, cobranca_disponivel: false }]).length === 0,
      'a conta que o banco ainda não deixa cobrar não é trabalho');
  chk('MT2c', JSON.stringify(mesSemTrabalho(null, carteira, HOJE, [{ competencia: '2026-09-01' }]))
              === JSON.stringify({ mes: '2026-09', origem: 'recente' }),
      'sem trabalho, o mais recente com conta OU cobrança — a conta lida de setembro vence a cobrança de agosto');
  const lidos: string[] = [];
  const achado = await procurarMesComTrabalho({
    travadas: [], carteira: async () => carteira,
    cobrancasDoMes: async (m) => { lidos.push(m); return []; },
    registradas: async () => registradas, lembrado: '2026-06', hoje: HOJE,
  });
  chk('MT2d', achado.mes === '2026-09' && achado.origem === 'trabalho' && achado.certo === true && lidos.length === 0,
      'a procura acha setembro pela conta por gerar sem ler mês nenhum');
  const semRede = await procurarMesComTrabalho({
    travadas: [], carteira: async () => { throw new Error('caiu'); },
    cobrancasDoMes: async () => { throw new Error('caiu'); },
    registradas: async () => { throw new Error('caiu'); }, lembrado: null, hoje: HOJE,
  });
  chk('MT2e', semRede.mes === HOJE && semRede.origem === 'hoje',
      'sem rede, a procura não derruba nada: responde o mês de hoje, e diz que é o de hoje');
}

/* ==========================================================================
 * MT3 — o que segue o mês, e o que não segue
 * ========================================================================== */
{
  const esperado: Record<string, 'segue' | 'recorta' | 'nao_segue'> = {
    '/pendencias': 'segue', '/documento': 'segue', '/faturas': 'segue', '/relatorios': 'recorta',
  };
  const errados = TELAS.filter((t) => comoSegueOMes(t.rota) !== (esperado[t.rota] ?? 'nao_segue'));
  chk('MT3a', errados.length === 0,
      'Mês, Contas de luz e Cobranças SEGUEM o mês; Relatórios RECORTA nele a pedido; todo o resto do menu — os '
      + `cadastros, o setor Empresa e a Administração — NÃO segue${errados.length ? ` (errado: ${errados.map((t) => t.rota).join(', ')})` : ''}`);
  const cadastros = TELAS.filter((t) => t.grupo === 'cadastro');
  const empresa = TELAS.filter((t) => t.funil === 'empresa');
  chk('MT3b', cadastros.length >= 5 && empresa.length >= 4
              && [...cadastros, ...empresa].every((t) => comoSegueOMes(t.rota) === 'nao_segue'),
      `os ${cadastros.length} cadastros e as ${empresa.length} telas do Empresa não mudam com o mês — Contas a `
      + 'receber e Contas a pagar têm os filtros de data deles');
  chk('MT3c', Object.keys(COMO_SEGUE_O_MES).every((r) => TELAS.some((t) => t.rota === r && t.funil === 'rateio')),
      'só telas do Rateio seguem o mês — ele é o mês do setor');
  chk('MT3d', JSON.stringify([...TELAS_QUE_LEEM_O_MES]) === JSON.stringify([...ROTAS_QUE_SEGUEM_O_MES]),
      'as telas que leem o `?mes=` dos links do funil são as mesmas que seguem o mês — uma lista só');
  const alcance = fraseDoAlcance();
  chk('MT3e', /Vale para Mês, Contas de luz e Cobranças, e para o recorte de Relatórios\./.test(alcance)
              && /cadastros e o setor Empresa não mudam/.test(alcance),
      `a frase do alcance nomeia as telas com as palavras do menu e diz o que NÃO muda — «${alcance}»`);
}

/* ==========================================================================
 * MT4 — o endereço: o link pede, o mês escreve
 * ========================================================================== */
{
  chk('MT4a', mesPedidoPeloEndereco('/faturas', '?mes=2026-08') === '2026-08'
              && mesPedidoPeloEndereco('/documento', '?pendencia=sem_conta&mes=2026-09') === '2026-09'
              && mesPedidoPeloEndereco('/relatorios', '?mes=2026-07') === '2026-07',
      'o `?mes=` de uma tela do mês PEDE o mês — «Ver em Cobranças», os botões do funil, o recorte de Relatórios');
  chk('MT4b', mesPedidoPeloEndereco('/unidades', '?uc=401269001287&mes=2026-08') === null
              && mesPedidoPeloEndereco('/contas-a-receber', '?mes=2026-08') === null,
      'em Unidades o `?mes=` é a volta para o mês de onde a pessoa veio, e não muda o mês de trabalho');
  const buscas = ['?mes=2026-08', '?x=1&mes=2026-12', '', '?mes=', '?mes=2026-13', '?mes=08/2026', '?mes=2026-08-01'];
  chk('MT4b2', buscas.every((b) => mesDoEndereco(b) === mesDaQuery(b)),
      'a casca lê o `?mes=` pela MESMA regra de `mesDaQuery` — mês inválido não vira mês nos dois');
  const lugar = (caminho: string, busca = '', fragmento = '') => ({ caminho, busca, fragmento });
  chk('MT4c', enderecoComOMes(lugar('/faturas'), '2026-09', 'segue') === '/faturas?mes=2026-09'
              && enderecoComOMes(lugar('/faturas', '?mes=2026-08'), '2026-09', 'segue') === '/faturas?mes=2026-09',
      'na tela que segue, o mês vai sempre para o endereço — o link copiado e o F5 ficam no mês da tela');
  chk('MT4d', enderecoComOMes(lugar('/documento', '?pendencia=sem_conta', '#cadastro'), '2026-09', 'segue')
                === '/documento?pendencia=sem_conta&mes=2026-09#cadastro',
      'os outros parâmetros e o fragmento (que abre a aba) ficam onde estavam');
  chk('MT4e', enderecoComOMes(lugar('/faturas', '?mes=2026-09'), '2026-09', 'segue') === null
              && enderecoComOMes(lugar('/clientes'), '2026-09', 'nao_segue') === null
              && enderecoComOMes(lugar('/faturas'), null, 'segue') === null,
      'nada a trocar não troca: o mesmo mês, a tela que não segue, e o mês ainda procurado');
  chk('MT4f', enderecoComOMes(lugar('/relatorios'), '2026-09', 'recorta') === null
              && enderecoComOMes(lugar('/relatorios', '?mes=2026-08'), '2026-09', 'recorta') === '/relatorios?mes=2026-09'
              && enderecoSemOMes(lugar('/relatorios', '?mes=2026-09&x=1')) === '/relatorios?x=1'
              && enderecoSemOMes(lugar('/relatorios', '?mes=2026-09')) === '/relatorios',
      'em Relatórios o `?mes=` é o recorte: sem ele (todos os meses) o mês não entra; com ele, segue o mês; '
      + 'desligar tira só ele');
  /* O `replaceState` e o ouvido da navegação moram no provedor; a fonte prova
     que é um efeito só, que o link não é lembrado e que a troca não empilha. */
  const prov = semComentario(ler('seletor-de-mes.tsx'));
  chk('MT4g', /history\.replaceState\(/.test(prov) && !/history\.pushState\(/.test(prov)
              && /useNavegacoes\(\)/.test(prov)
              && /setAberto\(\{ mes: pedidoPeloLink, origem: 'endereco' \}\)/.test(prov)
              && !/lembrarMes\([^)]*pedidoPeloLink/.test(prov),
      'o mês escreve o endereço com `replaceState` (sem empilhar histórico), cada navegação relê o `?mes=`, e o '
      + 'mês do link muda todas as telas SEM virar a escolha lembrada');
}

/* ==========================================================================
 * MT5 — o aviso: o mês lembrado atrás do mês com trabalho
 * ========================================================================== */
{
  const em = (mes: string, origem: EscolhaDoMes['origem']): EscolhaDoMes => ({ mes, origem });
  chk('MT5a', mesComTrabalhoAFrente(em('2026-08', 'lembrado'), TRABALHO) === '2026-09'
              && mesComTrabalhoAFrente(em('2026-07', 'endereco'), TRABALHO) === '2026-09',
      'o mês lembrado (ou o de um link velho) ATRÁS do mês com trabalho: a tela avisa «Há trabalho em setembro»');
  chk('MT5b', mesComTrabalhoAFrente(em('2026-08', 'escolhido'), TRABALHO) === null,
      'quem acabou de escolher agosto foi lá de propósito: sem aviso a cada tela');
  chk('MT5c', mesComTrabalhoAFrente(em('2026-10', 'lembrado'), TRABALHO) === null
              && mesComTrabalhoAFrente(em('2026-09', 'lembrado'), TRABALHO) === null,
      'à frente do trabalho, ou nele, não há aviso — andar para o mês seguinte é o curso normal');
  chk('MT5d', mesComTrabalhoAFrente(em('2026-08', 'lembrado'), { mes: '2026-09', origem: 'recente' }) === null
              && mesComTrabalhoAFrente(em('2026-08', 'lembrado'), null) === null
              && mesComTrabalhoAFrente(null, TRABALHO) === null,
      'sem trabalho achado (só o mais recente com contas), ou sem procura, não há para onde mandar');
  const prov = semComentario(ler('seletor-de-mes.tsx'));
  chk('MT5e', /Há trabalho em \{mesPorExtenso\(p\.aFrente\)\}/.test(prov) && /Ir para \{mesPorExtenso\(p\.aFrente\)\}/.test(prov)
              && /<Aviso tipo="alerta">/.test(prov),
      'o aviso diz «Há trabalho em …» e oferece «Ir para …», no âmbar de tarefa — nada falhou');
}

/* ==========================================================================
 * MT6 — o atalho e o mês vizinho
 * ========================================================================== */
{
  const ev = (key: string, target: unknown = { tagName: 'BODY' }, extra = {}) => ({ key, target, ...extra });
  chk('MT6a', passoDoAtalho(ev('[')) === -1 && passoDoAtalho(ev(']')) === 1 && passoDoAtalho(ev('p')) === 0,
      '`[` volta um mês e `]` avança um');
  chk('MT6b', passoDoAtalho(ev('[', { tagName: 'INPUT', type: 'text' })) === 0
              && passoDoAtalho(ev(']', { tagName: 'TEXTAREA' })) === 0
              && passoDoAtalho(ev(']', { tagName: 'SELECT' })) === 0
              && passoDoAtalho(ev(']', { tagName: 'DIV', isContentEditable: true })) === 0
              && passoDoAtalho(ev(']', { tagName: 'INPUT', type: 'checkbox' })) === 1
              && passoDoAtalho(ev(']', { tagName: 'BUTTON' })) === 1,
      'num campo de texto a tecla é LETRA e o mês não muda; numa caixa de marcar ou num botão, o atalho vale');
  chk('MT6c', passoDoAtalho(ev('[', undefined, { ctrlKey: true })) === 0 && passoDoAtalho(ev(']', undefined, { altKey: true })) === 0
              && passoDoAtalho(ev(']', undefined, { metaKey: true })) === 0 && passoDoAtalho(ev(']', undefined, { isComposing: true })) === 0,
      'com Ctrl, Alt ou ⌘ a tecla é de outra coisa, e durante a composição de um acento também');
  chk('MT6d', mesVizinho('2026-12', 1) === '2027-01' && mesVizinho('2026-01', -1) === '2025-12'
              && mesVizinho('2026-09', 12) === '2027-09' && mesVizinho('2026-09', -4) === '2026-05',
      'o mês vizinho atravessa o ano nos dois sentidos');
  chk('MT6e', /return !alvoRecebeLetra\(e\.target\);/.test(ler('ajuda-gatilho.tsx'))
              && alvoRecebeLetra({ tagName: 'INPUT', type: 'search' }) === true
              && alvoRecebeLetra({ tagName: 'INPUT', type: 'radio' }) === false
              && alvoRecebeLetra({ tagName: 'INPUT' }) === true && alvoRecebeLetra(null) === false,
      'a pergunta «a tecla é letra aqui?» é uma só (`teclado.ts`) para o `?` da ajuda e o `[ ]` do mês');
  chk('MT6f', mesAbreviado('2026-09') === 'set/26' && mesAbreviado('2027-01-01') === 'jan/27' && mesAbreviado('lixo') === ''
              && mesCurtoDoAno(3) === 'mar' && nomeDoMesDeTrabalho('2026-09') === 'Mês de trabalho: setembro de 2026',
      'no menu recolhido e na faixa o mês sai abreviado («set/26»), e o nome acessível é o inteiro');
}

/* ==========================================================================
 * MT7 — a conta de outro mês na fila
 * ========================================================================== */
{
  chk('MT7a', mesDaConta('10/2026') === '2026-10' && mesDaConta('13/2026') === null && mesDaConta('') === null
              && mesDaConta(null) === null,
      'o mês da conta, como a fila o mostra (`10/2026`), vira o mês do sistema');
  const fila = ['09/2026', '10/2026', '10/2026', '', '07/2026', null];
  const outros = contasDeOutroMes(fila, '2026-09');
  chk('MT7b', JSON.stringify(outros) === JSON.stringify([{ mes: '2026-10', quantas: 2 }, { mes: '2026-07', quantas: 1 }]),
      'as contas de outro mês, por mês e a mais numerosa primeiro; a do mês de trabalho e a ilegível ficam de fora');
  chk('MT7c', contasDeOutroMes(['09/2026'], '2026-09').length === 0 && contasDeOutroMes(['10/2026'], null).length === 0,
      'fila só do mês de trabalho, ou sem mês de trabalho ainda: sem aviso');
  const corpo = semComentario(ler('fatura-lote-corpo.tsx'));
  chk('MT7d', /Mudar o mês de trabalho para \{mesPorExtenso\(alvo\.mes\)\}/.test(corpo)
              && /Cada conta é registrada no mês dela/.test(corpo) && !/Fila deste mês/.test(corpo),
      'a fila avisa e oferece mudar o mês de trabalho — e ela aceita qualquer mês, então não se chama mais '
      + '«Fila deste mês»');
}

/* ==========================================================================
 * MT8 — a lembrança não derruba a tela
 * ========================================================================== */
{
  const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  let guardado = '';
  const bom = { getItem: (k: string) => (k === CHAVE_DO_MES_LEMBRADO ? guardado : null), setItem: (_k: string, v: string) => { guardado = v; } };
  lembrarMes(bom, '2026-08'); lembrarMes(bom, 'lixo');
  chk('MT8a', lerMesLembrado(quebrado) === null && (() => { lembrarMes(quebrado, '2026-08'); return true; })()
              && lerMesLembrado(bom) === '2026-08' && lerMesLembrado(null) === null,
      'o armazenamento que levanta não derruba a tela, e só mês válido é guardado');
  chk('MT8b', CHAVE_DO_MES_LEMBRADO === 'financeiro.emissao.mes',
      'a chave é a dos seletores velhos: quem escolheu um mês antes da troca não perde a escolha');
}

/* ==========================================================================
 * MT9 — as telas: um controle só, o mês no título, a frase num lugar
 * ========================================================================== */
{
  const telas = ['telas/prontidao.tsx', 'telas/faturas.tsx', 'telas/documento.tsx', 'telas/fatura-unificada.tsx',
    'telas/relatorios.tsx', 'contas-que-faltam.tsx', 'fatura-lote-corpo.tsx'];
  const comSeletor = telas.filter((f) => /<CampoData[^>]*\bmes\b/.test(semComentario(ler(f)))
    || /rotulo="Mês de referência"/.test(semComentario(ler(f))));
  chk('MT9a', comSeletor.length === 0,
      'nenhuma das telas do mês tem seletor de mês próprio — o campo de Mês e de Cobranças, o filtro de mês das '
      + `registradas e o campo de Relatórios saíram${comSeletor.length ? ` (sobrou em: ${comSeletor.join(', ')})` : ''}`);
  const usamOMes = telas.filter((f) => /useMesDoTrabalho\(\)/.test(ler(f)));
  chk('MT9b', ['telas/prontidao.tsx', 'telas/faturas.tsx', 'telas/documento.tsx', 'telas/fatura-unificada.tsx', 'telas/relatorios.tsx']
                .every((f) => usamOMes.includes(f)),
      'Mês, Cobranças, Contas de luz e Relatórios leem o MESMO mês, da casca');
  const titulos = [['telas/prontidao.tsx', 'Mês'], ['telas/faturas.tsx', 'Cobranças'], ['telas/documento.tsx', 'Contas de luz'],
    ['telas/relatorios.tsx', 'Relatórios']] as const;
  const semMes = titulos.filter(([f, t]) => !new RegExp(`<Pagina titulo="${t}" mes=\\{`).test(ler(f)));
  chk('MT9c', semMes.length === 0 && /titulo-do-mes"> de \{mes\}/.test(ler('ui.tsx')),
      'cada tela do mês diz o mês no título («Cobranças de setembro de 2026»), com o nome do menu primeiro e '
      + `intacto${semMes.length ? ` (sem mês: ${semMes.map(([f]) => f).join(', ')})` : ''}`);
  const comFrase = [...telas, 'emissao-regras.ts', 'leitura-do-mes.ts', 'ajuda-painel.tsx']
    .filter((f) => /fraseDaOrigem\(/.test(semComentario(ler(f))));
  chk('MT9d', comFrase.length === 0 && /fraseDaOrigem\(p\.origem\)/.test(ler('seletor-de-mes.tsx')),
      'a frase «Aberto no mês mais recente com trabalho…» sai de UM lugar só — o painel do controle'
      + `${comFrase.length ? ` (ainda em: ${comFrase.join(', ')})` : ''}`);
  const anunciam = ['telas/prontidao.tsx', 'telas/faturas.tsx', 'leitura-do-mes.ts', 'ajuda-painel.tsx']
    .filter((f) => /anunciarMesEmTela|mesQueATelaMostra/.test(semComentario(ler(f))));
  chk('MT9e', anunciam.length === 0 && /useMesDoTrabalho\(\)/.test(ler('ajuda-painel.tsx')),
      'a Central de Ajuda narra o mês de trabalho, da mesma fonte — o anúncio do mês em tela saiu');
  const app = semComentario(ler('app.tsx'));
  chk('MT9f', /<ProvedorDoMes /.test(app) && /mes=\{noRateio \? \(lugar\) => <SeletorDeMes lugar=\{lugar\} \/> : undefined\}/.test(app),
      'o controle é um só e mora na casca: desenhado no setor Rateio, no menu e na faixa do celular');
  const menu = semComentario(ler('menu-lateral.tsx'));
  const iSetor = menu.indexOf('<SeletorDeSetor');
  const iMes = menu.indexOf("p.mes?.('menu')");
  const iNav = menu.indexOf('<nav className="lateral-nav"');
  const iSetorFaixa = menu.indexOf('faixa-celular-setor');
  const iMesFaixa = menu.indexOf("p.mes?.('faixa')");
  const iAjudaFaixa = menu.indexOf("p.ajuda?.('faixa')");
  chk('MT9g', iSetor > 0 && iMes > iSetor && iNav > iMes && iMesFaixa > iSetorFaixa && iAjudaFaixa > iMesFaixa,
      'a ordem do Tab é a da vista: o setor, o mês logo abaixo, depois as telas; na faixa do celular, o setor, o '
      + 'mês e a ajuda');
  chk('MT9h', /\.mes-painel/.test(menu.slice(menu.indexOf("e.key !== 'Escape'"), menu.indexOf("e.key !== 'Escape'") + 300)),
      'na gaveta do celular, o primeiro Esc fecha a grade do mês, e o segundo, a gaveta');
}

/* ==========================================================================
 * MT10 — os links do funil levam o mês
 * ========================================================================== */
{
  const destinos = MOLDES.flatMap((m) => [m.destino, ...(m.destinoDoRisco ? [m.destinoDoRisco] : [])]);
  const doMes = destinos.filter((d) => comoSegueOMes(d.endereco) === 'segue');
  const semMes = doMes.filter((d) => !enderecoDoPasso(d, undefined, '2026-08').includes('mes=2026-08'));
  const foraComMes = destinos.filter((d) => comoSegueOMes(d.endereco) === 'nao_segue'
    && enderecoDoPasso(d, undefined, '2026-08').includes('mes='));
  chk('MT10', doMes.length >= 2 && semMes.length === 0 && foraComMes.length === 0,
      'todo botão do funil para uma tela do mês leva o `?mes=` — e quem abre por ele chega no mês do funil, '
      + 'mesmo numa aba nova; para tela que não segue o mês, o link não leva');
}

console.log();
if (falhas > 0) { console.log(`--- mes do trabalho: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- mes do trabalho (um mes para o Rateio, numa fonte so): ${feitas} verificacoes, 0 falhas`);
