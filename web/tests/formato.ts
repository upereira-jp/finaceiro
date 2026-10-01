// OS FORMATOS DA TELA — dia, mes, hora, numero da unidade, plural, decimal e o
// erro do login. Etapa 4b do redesenho (30/09/2026).
// Uso: node --experimental-strip-types web/tests/formato.ts
//
// ============================================================================
// O QUE ESTA SUITE GUARDA
//
// `formato.ts` juntou seis funcoes que existiam espalhadas (`dataEmBr`, `dataBr`,
// `emBr`, `mesCurto`, `vencimentoEmBr`, e o recorte `iso.slice(11, 16)` do
// Historico), e cada uma tinha o seu esquecimento. As verificacoes F1 a F9 medem
// os casos de borda que os esquecimentos produziam: o dia anterior em fuso
// negativo, a hora UTC na tela, o zero a esquerda legitimo apagado, o «NaN» no
// lugar de um valor estranho.
//
// A REGRA 1 DO CLAUDE.md vale aqui tambem: dinheiro e inteiro em centavos, e o
// percentual, o kWh e a tarifa mantem a escala decimal. A F10 mede os
// formatadores de dinheiro e decimal nos casos em que o float erraria — e, como
// a regra proibe o float ate na exibicao, a F11 procura no codigo da tela o
// `c / 100` que ela proibe.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  diaEmBr, mesEmBr, mesPorExtenso, horaEmSP, diaEmSP, momentoEmBr, hojeEmSP, mesDeHojeEmSP,
  diaAnterior, quandoEmBr, datasDoTextoEmBr, numeroDaUcNaTela, mapaDoCadastro, contagem,
} from '../src/formato.ts';
import { mesPorExtenso as mesPorExtensoDoVocabulario } from '../src/vocabulario.ts';
import {
  decimalEmBr, kwhEmBr, decimalParaCampo, centavosParaCampo, percentualEmBr, decimalTexto, paraCentavos,
  campoParaDecimal, camposParaDecimais, decimaisParaCampos, decimalDoCadastro, emReais,
} from '../src/dinheiro.ts';
import { tecladoDoCampo } from '../src/teclado.ts';
// O PARSER DO SERVIDOR, importado e nao copiado: F13 compara o que ele grava com
// o texto que a tela mandava antes e com o que ela manda agora.
import {
  paraDecimal, decimalParaTexto, calcular, CAMPOS_VAZIOS, type CamposDaFaturaUnificada,
} from '../../src/dominio/fatura-unificada.ts';
import { reaisParaPlanilha } from '../src/csv.ts';
import { erroDeLogin, casoDoErro } from '../src/login-regras.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

// ============================================================================
// F1 — o dia do calendario, por texto
// ============================================================================

chk('F1', diaEmBr('2026-09-05') === '05/09/2026', 'o dia sai dd/mm/aaaa');
chk('F1b', diaEmBr('2026-09-05T00:00:00.000Z') === '05/09/2026',
    'e o dia que o JSON trouxe com meia-noite UTC continua sendo o dia 5 — por texto, sem `new Date`, que '
    + 'em fuso negativo diria 04/09');
chk('F1c', diaEmBr(null) === '—' && diaEmBr(undefined) === '—' && diaEmBr('  ') === '—',
    'vazio e travessao, nunca «undefined» nem uma data inventada');
chk('F1d', diaEmBr('amanhã') === 'amanhã' && diaEmBr('2026-9-5') === '2026-9-5',
    'o que nao e data volta como veio — um «NaN/NaN/NaN» seria a tela inventando');

// ============================================================================
// F2 — o mes: curto na coluna, por extenso na frase
// ============================================================================

chk('F2', mesEmBr('2026-09') === '09/2026' && mesEmBr('2026-09-01') === '09/2026'
        && mesEmBr('2026-09-01T00:00:00.000Z') === '09/2026',
    'a competencia na coluna e 09/2026, venha como mes, como dia 1 ou com o horario do JSON');
chk('F2b', mesPorExtenso('2026-07-01') === 'julho de 2026' && mesPorExtenso('2026-03') === 'março de 2026',
    'na frase e no titulo, por extenso e com acento');
chk('F2c', mesPorExtenso('2026-13-01') === '' && mesPorExtenso('') === '' && mesEmBr('2026-13') === '2026-13'
        && mesEmBr(null) === '—',
    'mes 13 nao e mes: o extenso devolve vazio (quem chama decide), a coluna devolve o texto');
chk('F2d', mesPorExtensoDoVocabulario === mesPorExtenso,
    '`vocabulario.ts` exporta a MESMA funcao — o formato do mes e um so no sistema');

// ============================================================================
// F3 — o instante, no fuso de Sao Paulo
// ============================================================================

chk('F3', horaEmSP('2026-09-10T13:24:40.000Z') === '10:24',
    'a hora e a de Sao Paulo: 13:24 UTC sao 10:24 em Goiania (o Historico mostrava 13:24)');
chk('F3b', diaEmSP('2026-09-10T01:30:00Z') === '2026-09-09' && horaEmSP('2026-09-10T01:30:00Z') === '22:30',
    '01h30 UTC do dia 10 e 22h30 do dia 9: o dia tambem e o de la');
chk('F3c', horaEmSP('2026-09-10T13:24:40.123+00:00') === '10:24'
        && horaEmSP('2026-09-10 13:24:40.123+00') === '10:24'
        && horaEmSP('2026-09-10T10:24:00-03:00') === '10:24',
    'o fuso vem declarado de tres jeitos (Z, +00:00 e o +00 curto do Postgres), e os tres sao lidos');
chk('F3d', horaEmSP('2026-09-10T13:24:40') === '2026-09-10T13:24:40' && diaEmSP('2026-09-10') === '',
    'sem fuso declarado a string e ambigua, e ambigua nao e convertida');
chk('F3e', horaEmSP('2026-09-10T03:00:00Z') === '00:00',
    'meia-noite e 00:00 — nunca o «24:00» que alguns motores escrevem');
chk('F3f', momentoEmBr('2026-09-10T13:24:40Z') === '10/09/2026 às 10:24' && momentoEmBr('2026-09-10') === '10/09/2026',
    'o instante inteiro com «às»; o dia sem hora continua sendo so o dia');

// ============================================================================
// F4 — hoje, ontem, e a virada
// ============================================================================

const agora = new Date('2026-10-01T01:30:00Z'); // 30/09 as 22h30 em Sao Paulo
chk('F4', hojeEmSP(agora) === '2026-09-30' && mesDeHojeEmSP(agora) === '2026-09',
    'as 22h30 do dia 30 o `toISOString` ja diz 01/10; hoje em Sao Paulo ainda e 30/09, e o mes e setembro');
chk('F4b', diaAnterior('2026-10-01') === '2026-09-30' && diaAnterior('2026-01-01') === '2025-12-31'
        && diaAnterior('2028-03-01') === '2028-02-29',
    'ontem e conta de calendario: vira o mes, vira o ano, e conhece o bissexto');
chk('F4c', quandoEmBr('2026-09-30T13:05:00Z', agora) === 'hoje às 10:05'
        && quandoEmBr('2026-09-29T23:40:00Z', agora) === 'ontem às 20:40'
        && quandoEmBr('2026-09-28T14:02:00Z', agora) === 'em 28/09/2026 às 11:02',
    'o resumo de uma linha diz o dia junto da hora — «às 10:24» sozinho fazia o velho parecer novo');

// ============================================================================
// F5 — a data dentro da frase do servidor
// ============================================================================

chk('F5', datasDoTextoEmBr('A conta da unidade 000401269001287 em 2026-09-01 ja virou fatura.')
          === 'A conta da unidade 000401269001287 em 09/2026 ja virou fatura.',
    'a competencia no meio da recusa vira 09/2026 — e nenhuma palavra do servidor muda');
chk('F5b', datasDoTextoEmBr('vence em 2026-10-01, pago em 2026-10-05') === 'vence em 01/10/2026, pago em 05/10/2026',
    'um dia que nao e competencia vira dd/mm/aaaa, mesmo no dia 1');
chk('F5c', datasDoTextoEmBr('registrado 2026-09-10T13:24:40Z') === 'registrado 10/09/2026 às 10:24'
        && datasDoTextoEmBr('sem data nenhuma') === 'sem data nenhuma',
    'o instante vira o de Sao Paulo, e frase sem data passa intacta');

// ============================================================================
// F6 — o numero da unidade, como o cadastro guarda
// ============================================================================

{
  const cadastro = mapaDoCadastro(['6732614380', '0215334585', null, '']);
  chk('F6', numeroDaUcNaTela('0215334585') === '0215334585' && numeroDaUcNaTela('0215334585', cadastro) === '0215334585',
      'o zero a esquerda do cadastro e legitimo e fica — a tela nao tira zero de nada por conta propria');
  chk('F6b', numeroDaUcNaTela('000006732614380', cadastro) === '6732614380',
      'o enchimento que a leitura da conta acrescenta sai QUANDO o cadastro tem a unidade: e a equivalencia '
      + 'que o sistema ja faz (`normalizarUc`, completar ate 15 digitos)');
  chk('F6c', numeroDaUcNaTela('000006732614380') === '000006732614380'
          && numeroDaUcNaTela('000009999999999', cadastro) === '000009999999999',
      'sem cadastro a mao, ou sem unidade que case, o numero sai como veio — nada de regra inventada');
  chk('F6d', numeroDaUcNaTela('1234567890123456', cadastro) === '1234567890123456' && numeroDaUcNaTela(null) === '—',
      'mais de 15 digitos e outro numero (nao e zero perdido), e vazio e travessao');
}

// ============================================================================
// F7 — o plural por inteiro
// ============================================================================

chk('F7', contagem(1, 'conta vencida', 'contas vencidas') === '1 conta vencida'
        && contagem(3, 'conta vencida', 'contas vencidas') === '3 contas vencidas'
        && contagem(0, 'conta vencida', 'contas vencidas') === '0 contas vencidas',
    'um no singular, zero e o resto no plural — os dois textos vem inteiros de quem chama');
chk('F7b', contagem(2, 'valor já apurado não virou', 'valores já apurados não viraram')
          === '2 valores já apurados não viraram',
    'e e por isso que eles vem inteiros: o portugues nao pluraliza por sufixo');

// ============================================================================
// F8 — a grandeza decimal (regra 1: escala decimal, nunca centavos)
// ============================================================================

chk('F8', decimalEmBr('9.7122') === '9,7122' && decimalEmBr('0.936986') === '0,936986'
        && decimalEmBr('33793.01') === '33.793,01' && decimalEmBr('-120.50') === '-120,50',
    'fatia, tarifa e kWh saem com virgula, milhar com ponto, na escala do banco — por texto');
chk('F8b', percentualEmBr('9.7122') === '9,7122%' && percentualEmBr(null) === '—' && kwhEmBr('2545.00') === '2.545',
    'o percentual leva o % e nao arredonda a fatia; o kWh sem casa decimal quando ela e toda zero');
chk('F8c', decimalParaCampo('9.7122') === '9,7122' && decimalParaCampo('0.936986') === '0,936986'
        && decimalParaCampo(null) === '' && decimalParaCampo('12') === '12',
    'no CAMPO a virgula do teclado brasileiro, sem ponto de milhar (a fatia abria «9.7122»)');
chk('F8d', decimalTexto(decimalParaCampo('9.7122'), 4) === '9.7122' && decimalTexto(decimalParaCampo('0.936986'), 6) === '0.936986',
    'e o que o campo mostra volta para o banco sem perder um digito');

// ============================================================================
// F9 — os centavos no campo, por texto
// ============================================================================

chk('F9', centavosParaCampo(12345) === '123,45' && centavosParaCampo(8) === '0,08'
        && centavosParaCampo(0) === '0,00' && centavosParaCampo(-150) === '-1,50' && centavosParaCampo(null) === '',
    'centavos viram «123,45» sem dividir por 100');
{
  // A varredura que justifica o «por texto»: o `(c / 100).toFixed(2)` que a
  // tela usava erra no arredondamento de meio centavo; aqui nao ha divisao.
  let erradas = 0;
  for (let c = 0; c <= 200_000; c++) {
    if (paraCentavos(centavosParaCampo(c)) !== c) erradas++;
  }
  chk('F9b', erradas === 0, `ida e volta exata em 200.001 valores de centavos (erradas: ${erradas})`);
  chk('F9c', centavosParaCampo(123456) === reaisParaPlanilha(123456),
      'o campo e a planilha escrevem o valor do mesmo jeito');
}

// ============================================================================
// F10 — o erro do login, em portugues
// ============================================================================

{
  const cred = erroDeLogin({ code: 'invalid_credentials', status: 400, name: 'AuthApiError', message: 'Invalid login credentials' });
  chk('F10', cred.caso === 'credencial' && /E-mail ou senha não conferem/.test(cred.frase)
          && !/Invalid/.test(cred.frase) && /Invalid login credentials/.test(cred.original)
          && /invalid_credentials/.test(cred.original),
      'credencial invalida vira frase em portugues que diz o que fazer; o original fica para o detalhe tecnico');
  chk('F10b', !/n[aã]o existe|n[aã]o cadastrad/i.test(cred.frase),
      'e a frase nao diz QUAL dos dois esta errado — isso entregaria quem tem conta');
  chk('F10c', casoDoErro({ message: 'Invalid login credentials' }) === 'credencial',
      'sem o codigo (versao velha do cliente), a frase em ingles ainda e reconhecida');
  chk('F10d', casoDoErro({ code: 'email_not_confirmed', message: 'Email not confirmed' }) === 'nao_confirmado'
          && /confirma/.test(erroDeLogin({ code: 'email_not_confirmed' }).frase),
      'e-mail nao confirmado diz onde esta a confirmacao');
  chk('F10e', casoDoErro({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }) === 'rede'
          && casoDoErro({ name: 'TypeError', message: 'NetworkError when attempting to fetch resource.' }) === 'rede'
          && /internet/.test(erroDeLogin({ message: 'Failed to fetch' }).frase),
      'rede fora (o fetch que cai antes da resposta) manda conferir a internet');
  chk('F10f', casoDoErro({ code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' }) === 'limite'
          && casoDoErro({ status: 429, message: 'x' }) === 'limite'
          && /Espere/.test(erroDeLogin({ status: 429 }).frase),
      'limite de tentativas manda esperar');
  chk('F10g', casoDoErro({ code: 'user_banned', message: 'User is banned' }) === 'desligado'
          && casoDoErro({ message: 'algo novo' }) === 'outro' && casoDoErro(null) === 'outro'
          && /detalhe técnico/.test(erroDeLogin({ message: 'algo novo' }).frase),
      'acesso desligado diz quem religa; o desconhecido pede para mostrar o detalhe tecnico');
}

// ============================================================================
// F11 — nenhuma data crua e nenhum float de dinheiro no codigo da tela
// ============================================================================
//
// Os formatadores so valem se forem USADOS. Estas tres marcas eram o sintoma de
// cada tela formatando a seu modo: o `split('-').reverse()` que virava a data a
// mao, o `toISOString()` que da o dia de Greenwich, e o `/ 100` que poe float
// no valor. O `formato.ts` e o unico lugar autorizado para o `toISOString`, e
// so na conta de calendario de `diaAnterior`.

{
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const semComentario = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/(?<!:)\/\/[^\n]*/g, '');
  const arquivos = (dir: string, base = ''): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(`${dir}${e.name}/`, `${base}${e.name}/`)
      : /\.(ts|tsx)$/.test(e.name) ? [`${base}${e.name}`] : []);
  const achar = (regra: RegExp, excecoes: string[] = []) => arquivos(SRC)
    .filter((a) => !excecoes.includes(a))
    .flatMap((a) => semComentario(readFileSync(SRC + a, 'utf8')).split('\n')
      .map((l, i) => (regra.test(l) ? `${a}:${i + 1}` : null)).filter((x): x is string => x !== null));

  const aMao = achar(/split\('-'\)\.reverse\(\)/, ['historico.ts']);
  chk('F11', aMao.length === 0,
      `nenhuma tela vira a data a mao com split('-').reverse()${aMao.length ? ` — ACHADO: ${aMao.join(', ')}` : ''}`);
  const utc = achar(/toISOString\(\)/, ['formato.ts']);
  chk('F11b', utc.length === 0,
      `nenhum «hoje» em UTC (toISOString) fora de formato.ts${utc.length ? ` — ACHADO: ${utc.join(', ')}` : ''}`);
  const float = achar(/_centavos\s*\/\s*100\b|\bsaldo\s*\/\s*100\b|\/\s*100\)\.toFixed/);
  chk('F11c', float.length === 0,
      `nenhum valor em centavos dividido por 100 na tela (regra 1)${float.length ? ` — ACHADO: ${float.join(', ')}` : ''}`);
}

// ============================================================================
// F12 a F14 — o numero decimal digitado (01/10/2026, etapa 5)
//
// O modelo da fatura (Contas de luz, aba 3) mostra desconto, fator, multa e
// juros com virgula, e devolve ao servidor o texto canonico. E DINHEIRO
// INDIRETO — a multa e os juros saem impressos em toda folha do mes —, entao as
// tres afirmacoes sao medidas contra o PROPRIO parser do servidor:
//
//   F12  o valor que o servidor mandou e que ninguem tocou volta IGUAL, letra
//        por letra (a tela ainda pula a conversao nesse caso, mas a funcao
//        sozinha ja garante);
//   F13  todo formato aceito e gravado pelo servidor exatamente como seria
//        gravado o texto cru que a tela mandava antes desta etapa;
//   F14  o ambiguo e recusado com uma frase que diz o que escrever.
// ============================================================================

/** O que o servidor grava: `paraDecimal` e o arredondamento das casas da coluna
 *  (2 no percentual, 6 no fator) — `camposDoModelo` em `src/repos/documento.ts`. */
const gravado = (texto: string, casas: number): string => decimalParaTexto(paraDecimal(texto, 'teste'), casas);

{
  // Como o servidor devolve: numeric do Postgres pelo Decimal do Prisma, sem
  // zero a direita («2», «0.029»), e tambem com («2.00», «1.50»), por garantia.
  const doServidor = ['20', '2', '1', '0', '0.029', '2.5', '0.33', '10.000', '1.234', '12.3456', '2.00', '1.50', '100'];
  const voltam = doServidor.filter((x) => {
    const r = campoParaDecimal(decimalParaCampo(x));
    return r.ok && r.valor === x;
  });
  chk('F12', voltam.length === doServidor.length,
      `o valor salvo, mostrado com virgula e devolvido, e o MESMO texto em ${voltam.length} de ${doServidor.length} `
      + `(${doServidor.filter((x) => !voltam.includes(x)).join(', ') || 'todos'})`);
  chk('F12b', decimalParaCampo('0.029') === '0,029' && decimalParaCampo('2.5') === '2,5' && decimalParaCampo('20') === '20',
      'a tela mostra com virgula: 0.029 -> 0,029, 2.5 -> 2,5, 20 -> 20');
}

{
  const casos: Array<[string, string]> = [
    ['2', '2'], ['2,5', '2.5'], ['2.5', '2.5'], ['0,33', '0.33'], ['10,000', '10.000'],
    ['0.029', '0.029'], ['0,029', '0.029'], [' 2,5 ', '2.5'], ['2%', '2'], ['1,5 %', '1.5'], ['', ''],
    ['1234', '1234'], ['1.2345', '1.2345'], ['007', '007'],
  ];
  const errados = casos.filter(([t, esperado]) => {
    const r = campoParaDecimal(t);
    return !r.ok || r.valor !== esperado;
  });
  chk('F13', errados.length === 0,
      `cada formato aceito vira o texto canonico esperado${errados.length ? ` — ERRADOS: ${errados.map(([t]) => `«${t}»`).join(', ')}` : ''}`);
  // O servidor grava o novo IGUAL ao velho — o texto cru que a tela mandava.
  const divergem: string[] = [];
  for (const [t] of casos) {
    const r = campoParaDecimal(t);
    if (!r.ok) continue;
    for (const casas of [2, 6]) {
      if (gravado(t, casas) !== gravado(r.valor, casas)) divergem.push(`«${t}»/${casas}`);
    }
  }
  chk('F13b', divergem.length === 0,
      `o servidor grava o texto novo exatamente como gravava o cru, com 2 e com 6 casas${divergem.length ? ` — DIVERGEM: ${divergem.join(', ')}` : ''}`);
  const canonico = (t: string): string => { const r = campoParaDecimal(t); return r.ok ? r.valor : `RECUSADO ${t}`; };
  chk('F13c', gravado(canonico('2,5'), 2) === '2.50'
        && gravado(canonico('0,029'), 6) === '0.029000'
        && gravado(canonico('10,000'), 2) === '10.00',
      'medido no parser do servidor: 2,5 -> 2.50 · 0,029 -> 0.029000 · 10,000 -> 10.00 (dez, e nao dez mil)');
}

{
  const recusados = ['1.234', '10.000', '12.345', '1.234,5', '1,234.5', '2,5,1', '1.2.3', '-2', '2a', 'vinte', ',5', '5,', '.5'];
  const passaram = recusados.filter((t) => campoParaDecimal(t).ok);
  chk('F14', passaram.length === 0,
      `o ambiguo e o invalido sao recusados, sem palpite${passaram.length ? ` — PASSARAM: ${passaram.join(', ')}` : ''}`);
  const r = campoParaDecimal('1.234');
  chk('F14b', !r.ok && r.erro.includes('1,234') && r.erro.includes('1234'),
      `a frase do ambiguo diz as duas leituras e como escrever cada uma: «${r.ok ? '' : r.erro}»`);
  // O que o servidor faria com eles se a tela nao recusasse — e o motivo de
  // recusar: «1.234» viraria 1,23% de multa para quem quis dizer mil e tantos,
  // e «1,234.5» viraria 1,2345.
  chk('F14c', gravado('1.234', 2) === '1.23' && gravado('1,234.5', 6) === '1.234500',
      'sem a recusa, o servidor leria «1.234» como 1,23 e «1,234.5» como 1,2345 — o palpite que a tela nao da mais');
  chk('F14d', campoParaDecimal('0.029').ok && campoParaDecimal('0.500').ok,
      'com zero na parte inteira nao ha milhar possivel: «0.029» e «0.500» passam');
}

// ============================================================================
// F15 — o teclado do celular sai do rotulo (01/10/2026, etapa 5)
// ============================================================================
{
  const t = tecladoDoCampo;
  chk('F15', t('Valor (R$)').inputMode === 'decimal' && t('Juros ao mês (%)').inputMode === 'decimal'
        && t('Fator CO₂ (kg/kWh)').inputMode === 'decimal' && t('Tarifa R$/kWh').inputMode === 'decimal',
      'valor, percentual, fator e tarifa abrem o teclado com virgula (decimal)');
  chk('F15b', t('CEP').inputMode === 'numeric' && t('Agência').inputMode === 'numeric'
        && t('Unidade consumidora').inputMode === 'numeric' && t('Leitura atual').inputMode === 'numeric'
        && t('Dias faturados').inputMode === 'numeric' && t('Vencimento').inputMode === undefined,
      'CEP, agencia, unidade, leitura e dias abrem o teclado so de algarismos; a data digitada (com barra) fica no comum');
  chk('F15c', t('CPF ou CNPJ').inputMode === 'text' && t('CPF ou CNPJ').autoCapitalize === 'characters'
        && t('Documento (CPF ou CNPJ)').inputMode === 'text' && t('CNPJ').spellCheck === false,
      'CPF ou CNPJ fica no teclado de TEXTO, em maiuscula e sem corretor — o CNPJ alfanumerico tem letra');
  chk('F15d', t('E-mail').inputMode === 'email' && t('x', 'email').inputMode === 'email' && t('Telefone').inputMode === 'tel',
      'e-mail e telefone abrem os teclados proprios');
  chk('F15e', t('Nome').inputMode === undefined && t('Nome').autoComplete === 'off' && t('CEP').autoComplete === 'off',
      'o resto fica no teclado comum, e nenhum campo oferece o preenchimento automatico de quem opera (dado de terceiro)');
  chk('F15f', t('Valor de referência (R$)').inputMode === 'decimal' && t('Chave Pix').inputMode === undefined,
      '«Valor de referência (R$)» e dinheiro; «Chave Pix» pode ser qualquer coisa e fica no teclado comum');
}

// A tela usa o par — e nao manda o texto cru como antes.
{
  const doc = readFileSync(fileURLToPath(new URL('../src/telas/documento.tsx', import.meta.url)), 'utf8');
  chk('F16', /campoParaDecimal\(texto\)/.test(doc) && /decimalParaCampo\(x\[k\]\)/.test(doc)
        && /texto === decimalParaCampo\(original\[k\]\)\) \{ valores\[k\] = original\[k\]/.test(doc),
      'o modelo da fatura mostra com virgula, manda o canonico, e o campo intocado volta com o valor do servidor sem conversao');
  chk('F16b', !/multa_percentual: m\.multa_percentual/.test(doc),
      'o PUT do modelo nao manda mais o texto do campo cru');
}

// ============================================================================
// F17 a F19 — os decimais que ficaram de fora da etapa 5 (01/10/2026, etapa 6)
//
//   F17  os PARAMETROS da conta aberta em Contas de luz (desconto e fator de
//        CO2). Ate aqui a tela mandava o texto do campo cru, e o servidor o
//        lia com `paraDecimal`. Agora manda o canonico de `camposParaDecimais`.
//        A prova e contra o `calcular` DO SERVIDOR (importado, nao copiado),
//        que e a funcao que a composicao e o registro chamam: para todo texto
//        que ele aceitava, o canonico produz a MESMA conta — desconto, tarifa
//        com desconto, total, CO2 — e o mesmo fator gravado com 6 casas;
//   F18  a FATIA (4 casas) e a TARIFA (6) de Unidades. Ate aqui iam por
//        `decimalTexto`. Agora por `decimalDoCadastro`, e o texto enviado e o
//        MESMO, letra por letra, para tudo o que `decimalTexto` aceitava e nao
//        era ambiguo; a tarifa e medida tambem no parser do servidor
//        (`paraDecimal` + 6 casas, `tarifa()` de `repos/unidade_consumidora.ts`)
//        e a fatia na regra do repositorio (`^\d{1,3}(\.\d{1,4})?$`);
//   F19  o ambiguo e recusado nos tres lugares, com a frase.
// ============================================================================
{
  const CAMPOS: CamposDaFaturaUnificada = {
    ...CAMPOS_VAZIOS,
    energia_compensada_kwh: '503.0', tarifa_kwh: '1.185396',
    consumo_nao_compensado_kwh: '30', consumo_nao_compensado_valor: '35.56',
    iluminacao_publica: '8.44', bandeira_valor: '0', outros_encargos: '0', valor_total_equatorial: '44.00',
  };
  /** O que o servidor faz com um par de parametros: a conta inteira, ou a recusa. */
  const servidor = (p: { percentual_desconto: string; fator_emissao: string }): string => {
    try {
      const c = calcular(CAMPOS, p);
      return JSON.stringify({ c, fator: decimalParaTexto(paraDecimal(p.fator_emissao), 6) });
    } catch (e) { return `RECUSA ${(e as Error).name}`; }
  };
  // O que a pessoa digita hoje, nos dois campos (o fator vai junto, fixo, e vice-versa).
  const digitados = ['20', '20,5', '20.5', '15', '0', '12,25', '2,5', ' 2,5 ', '7', '20.00', '20,00', '33.33'];
  const fatores = ['0,029', '0.029', '0.0290', '0,1', '0.5', '1', '0,03'];
  const divergem: string[] = [];
  let medidos = 0;
  for (const d of digitados) {
    for (const f of fatores) {
      const cru = { percentual_desconto: d, fator_emissao: f };
      const hoje = servidor(cru);
      if (hoje.startsWith('RECUSA')) continue; // o servidor ja recusava: nada a comparar
      const conv = camposParaDecimais(cru);
      if (!conv.ok) { divergem.push(`«${d}»/«${f}» RECUSADO na tela`); continue; }
      medidos++;
      if (servidor(conv.valor) !== hoje) divergem.push(`«${d}»/«${f}»`);
    }
  }
  chk('F17', divergem.length === 0 && medidos >= 70,
      `os parametros canonicos produzem no calcular do servidor a MESMA conta que o texto cru: ${medidos} pares medidos`
      + `${divergem.length ? ` — DIVERGEM: ${divergem.join(', ')}` : ''}`);

  // O valor que o servidor mandou e que ninguem tocou: mostrado com virgula, volta IGUAL.
  const doServidor = { percentual_desconto: '20.00', fator_emissao: '0.029000' };
  const naTela = decimaisParaCampos(doServidor);
  const volta = camposParaDecimais(naTela);
  chk('F17b', naTela.percentual_desconto === '20,00' && naTela.fator_emissao === '0,029000'
        && volta.ok && volta.valor.percentual_desconto === '20.00' && volta.valor.fator_emissao === '0.029000',
      'o padrao do cadastro aparece com virgula (20,00 · 0,029000) e volta ao servidor letra por letra igual');

  // O que o servidor fazia com o ambiguo, e o que a tela faz agora.
  const amb = camposParaDecimais({ percentual_desconto: '1.234', fator_emissao: '0,029' });
  chk('F17c', servidor({ percentual_desconto: '1.234', fator_emissao: '0,029' }) !== 'RECUSA DecimalInvalido'
        && !amb.ok && Boolean(amb.erros.percentual_desconto?.includes('1,234')) && amb.erros.fator_emissao === undefined,
      'sem a recusa da tela o servidor aceitava «1.234» de desconto (1,23%); agora a frase sai no campo do desconto, e so nele');
  const doisRuins = camposParaDecimais({ percentual_desconto: '2,5,1', fator_emissao: '0.0.2' });
  chk('F17d', !doisRuins.ok && Boolean(doisRuins.erros.percentual_desconto) && Boolean(doisRuins.erros.fator_emissao),
      'dois campos errados dao duas frases, cada uma no seu campo');
  chk('F17e', camposParaDecimais({ percentual_desconto: '2%', fator_emissao: '0,029' }).ok
        && servidor({ percentual_desconto: '2%', fator_emissao: '0,029' }).startsWith('RECUSA'),
      'o «%» do fim, que o servidor recusava, a tela tira: «2%» vai como «2»');
}

{
  /* O que cada caminho manda: o de antes (`decimalTexto`, que lanca) e o de agora. */
  const antes = (t: string, casas: number): string => { try { return decimalTexto(t, casas); } catch { return 'LANCA'; } };
  const agora = (t: string, casas: number): string => { const r = decimalDoCadastro(t, casas); return r.ok ? r.valor : 'RECUSA'; };
  const tarifaNoServidor = (t: string): string | null => {
    const s = t.trim(); if (!s) return null;
    const d = decimalParaTexto(paraDecimal(s, 'tarifa_reais_por_kwh'), 6);
    return Number(d) > 0 ? d : null;
  };
  const REGRA_DA_FATIA = /^\d{1,3}(\.\d{1,4})?$/;

  const tarifas = ['1,185396', '1.185396', '1,13', '1.13', '0,936986', '0.936986', '1,1', '2', ' 1,18 ', '0,5', '1,180000', '0.9'];
  const fatias = ['12,5', '12.5', '9,7122', '9.7122', '100', '33,3333', '0,5', '7', ' 12,5 ', '50.25'];
  const difTarifa = tarifas.filter((t) => antes(t, 6) !== agora(t, 6) || tarifaNoServidor(antes(t, 6)) !== tarifaNoServidor(agora(t, 6)));
  const difFatia = fatias.filter((t) => antes(t, 4) !== agora(t, 4) || !REGRA_DA_FATIA.test(agora(t, 4)));
  chk('F18', difTarifa.length === 0 && difFatia.length === 0,
      `a tarifa e a fatia saem LETRA POR LETRA como saiam (${tarifas.length} tarifas, ${fatias.length} fatias), `
      + 'e passam no parser do servidor e na regra do repositorio'
      + `${difTarifa.length + difFatia.length ? ` — DIVERGEM: ${[...difTarifa, ...difFatia].join(', ')}` : ''}`);
  chk('F18b', agora('1,1853961', 6) === 'RECUSA' && antes('1,1853961', 6) === 'LANCA'
        && agora('12,34567', 4) === 'RECUSA' && agora('', 6) === '',
      'casas demais continuam recusadas (7 na tarifa, 5 na fatia), e o vazio continua vazio (a tarifa vira nula)');
  chk('F18c', decimalParaCampo('1.185396') === '1,185396' && decimalParaCampo('9.7122') === '9,7122',
      'e aparecem com virgula, como desde a etapa 4b');

  // F19 — o ambiguo: antes passava em silencio, agora volta com a frase.
  const ambiguos: Array<[string, number]> = [['1.185', 6], ['1.130', 6], ['12.500', 4], ['1.234,5', 6], ['1,234.5', 4]];
  const passaram = ambiguos.filter(([t, c]) => agora(t, c) !== 'RECUSA');
  chk('F19', passaram.length === 0,
      `o ambiguo e recusado na tarifa e na fatia${passaram.length ? ` — PASSARAM: ${passaram.map(([t]) => t).join(', ')}` : ''}`);
  chk('F19b', antes('1.185', 6) === '1.185' && tarifaNoServidor('1.185') === '1.185000',
      'o que a recusa evita: «1.185» ia como R$ 1,185 por kWh sem pergunta — e podia ser «1.185,xx» com a virgula esquecida');
  const r = decimalDoCadastro('1.185', 6);
  chk('F19c', !r.ok && r.erro.includes('1,185') && r.erro.includes('1185'),
      `a frase diz as duas leituras: «${r.ok ? '' : r.erro}»`);
  chk('F19d', agora('0.936', 6) === '0.936' && agora('0,936', 6) === '0.936',
      'com zero na parte inteira nao ha milhar possivel: «0.936» passa');
}

// As telas usam o par — e nao mandam o texto cru.
{
  const fu = readFileSync(fileURLToPath(new URL('../src/telas/fatura-unificada.tsx', import.meta.url)), 'utf8');
  const un = readFileSync(fileURLToPath(new URL('../src/telas/unidades.tsx', import.meta.url)), 'utf8');
  chk('F20', /parametros: conv\.valor, boleto: b/.test(fu) && /parametros: conv\.valor, boleto, campos_personalizados/.test(fu)
        && !/campos: c, parametros: p, boleto: b/.test(fu) && /setParametros\(decimaisParaCampos\(v\.parametros\)\)/.test(fu),
      'Contas de luz compoe e registra com o canonico, e a 2a via abre os parametros com virgula');
  chk('F20b', (un.match(/decimalDoCadastro\(/g) ?? []).length === 2 && !/decimalTexto\(/.test(un),
      'Unidades grava fatia e tarifa por decimalDoCadastro, e nao mais pelo decimalTexto sozinho');
}

// F21 — o dinheiro nao quebra entre o «R$» e o numero (01/10/2026, etapa 6).
chk('F21', emReais(123456) === 'R$ 1.234,56' && emReais(-1) === '-R$ 0,01' && !/R\$ /.test(emReais(2467174)),
    'o espaco depois do R$ e o inseparavel: «R$ 24.671,74» nunca vira «R$» numa linha e o numero na outra');

console.log();
if (falhas > 0) { console.log(`--- formato: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- formato (dia, mes, hora, unidade, plural, decimal e login): ${feitas} verificacoes, 0 falhas`);
