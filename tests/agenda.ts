// A AGENDA DE COBRANCA, na parte pura. SEM BANCO e SEM REDE.
// Uso: node --experimental-strip-types tests/agenda.ts
//
// COMO ESTAS VERIFICACOES SE VERIFICAM, que e o assunto principal do arquivo.
//
// A licao da sessao 15 foi cara e vale aqui inteira: "ajustar o esperado para a
// saida do meu codigo teria virado tautologia - passaria com o algoritmo
// errado". Uma tabela de intervalos esperados - 300, 600, 1200... - e exatamente
// isso: ela passa com QUALQUER progressao, desde que eu copie a saida para a
// tabela. E a progressao errada mais provavel (dobrar ja na primeira tentativa)
// produziria uma tabela igualmente plausivel.
//
// Entao o que se afirma aqui sao PROPRIEDADES da progressao, e nao valores dela:
//
//   monotonia      nunca diminui, para todo n
//   duplicacao     enquanto nao satura, f(n+1) = 2 f(n) - e a definicao de
//                  "exponencial", checada como RELACAO entre saidas vizinhas
//   teto           nunca passa, e ALCANCA - as duas metades, porque um teto
//                  inalcancavel passa em "nunca passa" e nao e teto
//   ancoragem      f(1) = base, e nao 2 x base. E o unico ponto em que uma
//                  constante aparece, e ela e a que o chamador escolhe
//   sem estouro    n grande nao vira Infinity nem NaN
//
// A unica coisa que compara contra numero fixo e o que o proprio chamador
// define: a politica que entra na funcao.

import {
  POLITICA, intervaloSegundos, proximaTentativaEm, vencido,
  decidir, chaveDaConsultaAtiva, nivelDoCertificado, type Politica,
} from '../src/dominio/agenda.ts';
import type { SituacaoDoBoleto } from '../src/sicoob/porta.ts';
import { readFileSync } from 'node:fs';
import { ehConfirmacao } from '../src/repos/liquidacao.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };

/** Politica ARTIFICIAL, nao a de producao. Duas razoes: os testes de propriedade
 *  ficam independentes de Q-AGENDA-02 - o dono pode mudar os quatro numeros sem
 *  quebrar teste nenhum -, e uma base pequena com teto pequeno satura rapido, o
 *  que torna a saturacao observavel em poucos passos. */
const P: Politica = {
  baseSegundos: 10, tetoSegundos: 1_280,
  diasDeAvisoDoCertificado: 7, examinadosPorRodada: 5,
};

// ================================================================ AG1 progressao

// ---------------------------------------------------- AG1a ancoragem na base
{
  chk('AG1a', intervaloSegundos(1, P) === P.baseSegundos,
      `a PRIMEIRA retentativa espera a base (${P.baseSegundos}s) e nao o dobro dela - o erro de
       indice mais provavel aqui e contar a falha que ja aconteceu como se fosse a proxima,
       e ele faria a retentativa mais rapida possivel ser 2x a politica`);
}

// ---------------------------------------------------- AG1b monotonia
{
  let sempreCresceOuEmpata = true;
  for (let n = 1; n < 200; n++) {
    if (intervaloSegundos(n + 1, P) < intervaloSegundos(n, P)) sempreCresceOuEmpata = false;
  }
  chk('AG1b', sempreCresceOuEmpata,
      'o intervalo NUNCA diminui em 200 passos - uma fila que acelera com o numero de falhas '
      + 'martelaria o banco justamente durante a indisponibilidade dele');
}

// ---------------------------------------------------- AG1c duplicacao
{
  // A propriedade que define "exponencial", afirmada entre saidas VIZINHAS. Nao
  // ha 2^n calculado aqui: se houvesse, eu estaria conferindo a formula contra
  // ela mesma escrita duas vezes.
  let dobraAteSaturar = true;
  let pares = 0;
  for (let n = 1; n < 40; n++) {
    const a = intervaloSegundos(n, P);
    const b = intervaloSegundos(n + 1, P);
    if (b < P.tetoSegundos) { pares++; if (b !== 2 * a) dobraAteSaturar = false; }
  }
  chk('AG1c', dobraAteSaturar && pares >= 2,
      `enquanto nao satura, f(n+1) = 2 f(n) - conferido em ${pares} par(es) vizinho(s), e nao contra
       uma tabela de valores que eu teria copiado da propria saida`);
}

// ---------------------------------------------------- AG1d o teto, as duas metades
{
  const todos = Array.from({ length: 300 }, (_, i) => intervaloSegundos(i + 1, P));
  const nenhumPassa = todos.every((s) => s <= P.tetoSegundos);
  const algumAlcanca = todos.some((s) => s === P.tetoSegundos);
  chk('AG1d', nenhumPassa && algumAlcanca,
      'o teto nunca e ultrapassado E e alcancado - a segunda metade importa: um teto inalcancavel '
      + 'passa na primeira e nao e teto, e a fila cresceria sem limite pratico');
}

// ---------------------------------------------------- AG1e saturacao estavel
{
  const grandes = [50, 100, 1000, 100_000].map((n) => intervaloSegundos(n, P));
  chk('AG1e', grandes.every((s) => s === P.tetoSegundos) && grandes.every(Number.isFinite),
      'depois de saturar o valor NAO se move e continua finito - 2^100000 em float seria Infinity, '
      + 'e Infinity * 1000 numa data produz Invalid Date sem erro');
}

// ---------------------------------------------------- AG1f a politica de producao tambem satura
{
  const p = POLITICA;
  const serie = Array.from({ length: 64 }, (_, i) => intervaloSegundos(i + 1, p));
  chk('AG1f', serie[0] === p.baseSegundos && serie.every((s) => s <= p.tetoSegundos)
        && serie.some((s) => s === p.tetoSegundos),
      `a politica de PRODUCAO obedece as mesmas propriedades: comeca em ${p.baseSegundos}s,
       satura em ${p.tetoSegundos}s e nunca passa disso`);
}

// ---------------------------------------------------- AG1g recusa entrada sem sentido
{
  const zero = lancou(() => intervaloSegundos(0, P));
  const meio = lancou(() => intervaloSegundos(1.5, P));
  const neg  = lancou(() => intervaloSegundos(-3, P));
  chk('AG1g', zero instanceof RangeError && meio instanceof RangeError && neg instanceof RangeError,
      'zero, fracionario e negativo LEVANTAM - chamar com zero significa que quem chamou acha que '
      + 'houve uma falha e nao houve, e devolver "tente agora" poria um laco em producao');
}

// ================================================================ AG2 a data

// ---------------------------------------------------- AG2a a diferenca e o intervalo
{
  const desde = new Date('2026-07-30T12:00:00.000Z');
  let bate = true;
  for (const n of [1, 2, 3, 7, 40]) {
    const p = proximaTentativaEm(n, desde, P);
    if (p.getTime() - desde.getTime() !== intervaloSegundos(n, P) * 1000) bate = false;
  }
  chk('AG2a', bate,
      'a data devolvida esta exatamente `intervalo` segundos depois de `desde`, para toda tentativa');
}

// ---------------------------------------------------- AG2b nao muta a entrada
{
  const desde = new Date('2026-07-30T12:00:00.000Z');
  const antes = desde.getTime();
  proximaTentativaEm(3, desde, P);
  chk('AG2b', desde.getTime() === antes,
      'a Date de entrada nao e mutada - Date e mutavel em JS, e uma funcao que a movesse '
      + 'deslocaria o carimbo que o chamador ainda vai gravar na mesma linha');
}

// ---------------------------------------------------- AG2c data invalida levanta
{
  const e = lancou(() => proximaTentativaEm(1, new Date('nao e data'), P));
  chk('AG2c', e instanceof RangeError,
      'Date invalida LEVANTA em vez de produzir Invalid Date - NaN atravessaria ate a coluna '
      + 'timestamptz e viraria NULL, que a fila le como "vencido agora", em laco');
}

// ================================================================ AG3 quem vence

// ---------------------------------------------------- AG3a nulo e vencido
{
  const agora = new Date('2026-07-30T12:00:00.000Z');
  chk('AG3a', vencido({ proxima_tentativa_em: null }, agora) === true,
      'proxima_tentativa_em NULO conta como vencido - e o estado das linhas que ja existiam quando '
      + 'a migration 21 entrou, e das `pendente` cuja chamada morreu antes de carimbar. Tratar '
      + 'nulo como "nunca" as deixaria fora da fila para sempre');
}

// ---------------------------------------------------- AG3b a borda e inclusiva nos dois sentidos
{
  const agora = new Date('2026-07-30T12:00:00.000Z');
  const exato = vencido({ proxima_tentativa_em: new Date(agora) }, agora);
  const umMsAntes = vencido({ proxima_tentativa_em: new Date(agora.getTime() - 1) }, agora);
  const umMsDepois = vencido({ proxima_tentativa_em: new Date(agora.getTime() + 1) }, agora);
  chk('AG3b', exato === true && umMsAntes === true && umMsDepois === false,
      'no instante exato VENCE, 1 ms antes vence, 1 ms depois NAO - a borda testada nos dois '
      + 'sentidos, porque so o lado que vence deixaria passar um `<` trocado por `<=`');
}

// ================================================================ AG4 a decisao

const situacao = (s: Partial<SituacaoDoBoleto>): SituacaoDoBoleto => ({
  nossoNumero: 'T-0001', situacao: 'em_aberto', valorLiquidadoCentavos: null,
  jurosCentavos: 0, multaCentavos: 0, dataLiquidacao: null, idExterno: null, ...s,
});
const QUANDO = new Date('2026-08-03T15:42:00.000Z');

// ---------------------------------------------------- AG4a em aberto nao faz nada
{
  chk('AG4a', decidir(situacao({ situacao: 'em_aberto' })).acao === 'nada',
      'em aberto no banco: nada a fazer, e isso NAO conta como problema em contador nenhum');
}

// ---------------------------------------------------- AG4b liquidado vira baixa
{
  const d = decidir(situacao({
    situacao: 'liquidado', dataLiquidacao: QUANDO, valorLiquidadoCentavos: 78_900,
  }));
  chk('AG4b', d.acao === 'baixar' && d.acao === 'baixar' && d.valorCentavos === 78_900
        && d.dataLiquidacao.getTime() === QUANDO.getTime(),
      'liquidado com data e valor vira BAIXAR, carregando os dois - a conferencia contra o total '
      + 'do titulo e de liquidacao.baixar(), que e o unico caminho de baixa');
}

// ---------------------------------------------------- AG4c liquidado incompleto e divergencia
{
  const semData = decidir(situacao({ situacao: 'liquidado', valorLiquidadoCentavos: 100 }));
  const semValor = decidir(situacao({ situacao: 'liquidado', dataLiquidacao: QUANDO }));
  chk('AG4c', semData.acao === 'divergencia' && semValor.acao === 'divergencia',
      '"liquidado" sem data ou sem valor e DIVERGENCIA, nao baixa com default - inventar a data de '
      + 'hoje poria a receita na competencia errada, e inventar o valor e inventar dinheiro');
}

// ---------------------------------------------------- AG4d desconhecida NAO e silencio
{
  const d = decidir(situacao({ situacao: 'desconhecida' }));
  chk('AG4d', d.acao === 'divergencia' && /nunca ter chegado/.test(d.motivo),
      'o banco nao reconhecer o nosso numero e DIVERGENCIA e nao "nada a fazer": a hipotese ruim '
      + 'e que o registro nunca chegou e o cliente esta com um boleto que o banco vai recusar');
}

// ---------------------------------------------------- AG4e baixado no banco alinha o estado
{
  const d = decidir(situacao({ situacao: 'baixado' }));
  chk('AG4e', d.acao === 'marcar_baixado',
      'baixado no banco e titulo CANCELADO, nao pago: alinha o nosso estado e NAO gera liquidacao - '
      + 'sem dinheiro nao ha split');
}

// ---------------------------------------------------- AG4f os quatro casos estao cobertos
{
  const todas: Array<SituacaoDoBoleto['situacao']> = ['em_aberto', 'liquidado', 'baixado', 'desconhecida'];
  const decididas = todas.map((s) => decidir(situacao({
    situacao: s, dataLiquidacao: QUANDO, valorLiquidadoCentavos: 1,
  })).acao);
  chk('AG4f', new Set(decididas).size === 4,
      'as quatro situacoes do enum produzem quatro acoes DISTINTAS - duas situacoes caindo na mesma '
      + 'acao seria o sinal de que uma delas foi esquecida no switch');
}

// ================================================================ AG5 a chave

// ---------------------------------------------------- AG5a deterministica
{
  const a = chaveDaConsultaAtiva('SIC-42', QUANDO);
  const b = chaveDaConsultaAtiva('SIC-42', QUANDO);
  chk('AG5a', a === b && a.includes('SIC-42'),
      'a mesma situacao produz a MESMA chave - sem isso, duas rodadas da consulta ativa sobre o '
      + 'mesmo boleto liquidado gerariam duas chaves e a idempotencia dependeria de outra coisa');
}

// ---------------------------------------------------- AG5b nao depende da hora da rodada
{
  const manha = chaveDaConsultaAtiva('SIC-42', new Date('2026-08-03T09:00:00.000Z'));
  const tarde = chaveDaConsultaAtiva('SIC-42', new Date('2026-08-03T21:30:00.000Z'));
  chk('AG5b', manha === tarde,
      'o mesmo dia de liquidacao da a mesma chave, qualquer que seja a HORA que o banco reportou - '
      + 'um banco que re-serializa o horario a cada consulta nao pode produzir baixa nova');
}

// ---------------------------------------------------- AG5c dias diferentes, chaves diferentes
{
  const d1 = chaveDaConsultaAtiva('SIC-42', new Date('2026-08-03T12:00:00.000Z'));
  const d2 = chaveDaConsultaAtiva('SIC-42', new Date('2026-08-04T12:00:00.000Z'));
  const outro = chaveDaConsultaAtiva('SIC-43', new Date('2026-08-03T12:00:00.000Z'));
  chk('AG5c', d1 !== d2 && d1 !== outro,
      'data diferente ou boleto diferente dao chaves diferentes - colidir esconderia uma liquidacao '
      + 'atras de outra, e o unico por fatura nem chegaria a ser consultado');
}

// ---------------------------------------------------- AG5d o prefixo distingue o canal
{
  chk('AG5d', chaveDaConsultaAtiva('SIC-42', QUANDO).startsWith('consulta:'),
      'a chave se declara como vinda da consulta ativa - a liquidacao_externa_unica e por '
      + '(tenant_id, ORIGEM, id_externo), e quem impede a dupla contagem entre canais e o unico '
      + 'por fatura, nao a chave');
}

// ================================================================ AG6 certificado

// ---------------------------------------------------- AG6a os quatro niveis, nas bordas
{
  const p = P;   // aviso em 7 dias
  const casos: Array<[number | null, string]> = [
    [null, 'sem_certificado'],
    [-1, 'vencido'],
    [0, 'vence_em_breve'],
    [p.diasDeAvisoDoCertificado, 'vence_em_breve'],
    [p.diasDeAvisoDoCertificado + 1, 'ok'],
  ];
  const todosBatem = casos.every(([dias, esperado]) => nivelDoCertificado(dias, p) === esperado);
  chk('AG6a', todosBatem,
      'nulo, -1, 0, exatamente no limite e limite+1 caem nos quatro niveis certos - a borda em zero '
      + 'e a que importa: "vence hoje" ainda nao venceu');
}

// ---------------------------------------------------- AG6b ausencia nao e "ok"
{
  chk('AG6b', nivelDoCertificado(null, P) === 'sem_certificado' && nivelDoCertificado(999, P) === 'ok',
      'sem data cadastrada o sistema diz sem_certificado e NAO diz ok - afirmar "ok" seria garantir '
      + 'o que ele nao sabe, e o PRD 6 avisa que o A1 vencido para a emissao SEM erro obvio');
}

// ============================================================================
// 7. A CONFIRMACAO DA LIQUIDACAO - o split saiu do webhook em 08/09/2026
// ============================================================================
//
// O QUE ESTAS VERIFICACOES PRENDEM, e por que elas leem CODIGO-FONTE em vez de
// chamar funcao: a regra vive na fiacao entre tres arquivos e um banco, e o que
// importa nela e uma AUSENCIA - `baixar()` NAO reparte quando a origem e o
// webhook. Ausencia nao se prova chamando a funcao sem banco, e o teste com
// banco (`tests/repos-carteira.ts`) nao roda nesta maquina. Ler a fonte prende a
// unica coisa que um refator distraido desfaria em silencio: alguem "consertar"
// o webhook para repartir de novo, e o sistema voltar a repartir intencao de
// pagamento sem nenhum teste ficar vermelho.

const fonteLiquidacao = readFileSync(new URL('../src/repos/liquidacao.ts', import.meta.url), 'utf8');
const fonteAgenda = readFileSync(new URL('../src/cobranca/agenda.ts', import.meta.url), 'utf8');

// ---------------------------------------------------- AG7a a regra do dinheiro
{
  chk('AG7a', ehConfirmacao('webhook_sicoob') === false
        && ehConfirmacao('conciliacao') === true
        && ehConfirmacao('manual') === true,
      'so o webhook NAO confirma: ele avisa intencao de pagamento (palavra da Sicoob, 08/09/2026). '
      + 'A consulta ativa leu `liquidado` no proprio banco e a baixa manual teve uma pessoa olhando '
      + 'o extrato - as duas provam entrada de dinheiro, o aviso nao');
}

// ---------------------------------------------------- AG7b o webhook nao reparte
{
  const corpoDoBaixar = fonteLiquidacao.slice(
    fonteLiquidacao.indexOf('export async function baixar('),
    fonteLiquidacao.indexOf('export function ehConfirmacao('),
  );
  chk('AG7b', corpoDoBaixar.includes('ehConfirmacao(e.origem)')
        && !corpoDoBaixar.includes('split.executar('),
      'baixar() nao chama split.executar em lugar nenhum e decide por ehConfirmacao - se esta '
      + 'linha ficar vermelha, o sistema voltou a repartir dinheiro sobre intencao de pagamento');
}

// ---------------------------------------------------- AG7c o titulo fica na fila
{
  const corpoDoBaixar = fonteLiquidacao.slice(
    fonteLiquidacao.indexOf('export async function baixar('),
    fonteLiquidacao.indexOf('export function ehConfirmacao('),
  );
  const corpoDoRepartir = fonteLiquidacao.slice(
    fonteLiquidacao.indexOf('async function repartir('),
    fonteLiquidacao.indexOf('export type Confirmacao'),
  );
  chk('AG7c', !corpoDoBaixar.includes("status: 'liquidado'") && corpoDoRepartir.includes("status: 'liquidado'"),
      'quem marca o boleto como liquidado e repartir(), nunca baixar() - o titulo fica `registrado` '
      + 'ate o banco confirmar, e e isso que o mantem em boleto.emAberto() para a consulta de amanha. '
      + 'Marcar na baixa o tiraria da fila e o split nunca rodaria');
}

// ---------------------------------------------------- AG7d a confirmacao vem antes de decidir()
{
  const iConsulta = fonteAgenda.indexOf('await cobranca.consultar(');
  const iConfirma = fonteAgenda.indexOf('confirmarLiquidacao(', iConsulta);
  const iDecide = fonteAgenda.indexOf('decidir(situacao)', iConsulta);
  chk('AG7d', iConsulta > 0 && iConfirma > iConsulta && iConfirma < iDecide,
      'a consulta ativa confirma a liquidacao ANTES de chamar decidir() - e a ordem e o mecanismo: '
      + 'decidir() so sabe virar BAIXA e exige data e valor, que o GET /boletos da Sicoob nao '
      + 'devolve (Q-LIQUIDACAO-CONSULTA-01). Depois de decidir(), o titulo ja baixado pelo webhook '
      + 'viraria DIVERGENCIA - uma por dia, para sempre, porque ele fica na fila ate confirmar');
}

// ---------------------------------------------------- AG7d2 a guarda so vale com liquidacao nossa
{
  const trecho = fonteAgenda.slice(fonteAgenda.indexOf("if (situacao.situacao === 'liquidado')"));
  chk('AG7d2', trecho.slice(0, 700).includes('porFatura(') && trecho.slice(0, 700).includes('if (l)'),
      'a guarda confirma a liquidacao QUE EXISTE, e cai fora quando nao ha nenhuma - `liquidado` no '
      + 'banco sem baixa nossa e o caminho normal da consulta ativa, e ele segue por decidir()');
}

// ---------------------------------------------------- AG7e a confirmacao e idempotente
{
  const corpo = fonteLiquidacao.slice(fonteLiquidacao.indexOf('export async function confirmarLiquidacao('));
  chk('AG7e', corpo.indexOf('split.porLiquidacao(') < corpo.indexOf('repartir('),
      'confirmarLiquidacao confere se ja ha split ANTES de repartir - a consulta roda todo dia e '
      + 'reencontraria a mesma liquidacao para sempre');
}

console.log(`\n${falhas === 0 ? 'agenda (puro): todas as verificacoes passaram'
                              : `agenda (puro): ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
