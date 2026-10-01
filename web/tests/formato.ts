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
} from '../src/dinheiro.ts';
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

console.log();
if (falhas > 0) { console.log(`--- formato: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- formato (dia, mes, hora, unidade, plural, decimal e login): ${feitas} verificacoes, 0 falhas`);
