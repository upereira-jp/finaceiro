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
  CADENCIA, atrasoAceitoSegundos, nivelDaRodada, pedeGente,
  type NivelDaRodada, type RodadaVista,
} from '../src/dominio/agenda.ts';
import type { SituacaoDoBoleto } from '../src/sicoob/porta.ts';
import { readFileSync, existsSync } from 'node:fs';
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

// ============================================================================
// AG8 — O AVISO DE PAGAMENTO. `nivelDoAviso` e o que se imprime a partir dele.
//
// O QUE ESTAS VERIFICACOES AFIRMAM, e por que nao sao a tabela de novo.
//
// Um teste com quatro linhas - null, [], [morto], [vivo] - passaria com uma
// funcao que devolvesse qualquer coisa, desde que eu copiasse a saida. O que
// importa aqui sao tres propriedades, e as tres tem consequencia em dinheiro:
//
//   nao colapsar   `ausente`, `nao_verificavel` e `ativo` sao estados
//                  diferentes do mundo, e o unico erro caro e responder `ativo`
//                  para qualquer um dos outros dois - seria o sistema garantindo
//                  que o banco avisa quando ninguem perguntou
//   contaminar     um inativo na lista basta, seja qual for o tamanho dela. E
//                  verificado por EXAUSTAO sobre todas as combinacoes ate 5
//                  elementos (63 listas), e nao por exemplo escolhido
//   nao silenciar  todo nivel que nao seja `ativo` produz texto. Nivel novo sem
//                  frase e alerta que nao alerta

import { nivelDoAviso } from '../src/dominio/agenda.ts';
import { conferirAvisoDePagamento, alertaDoAviso } from '../src/cobranca/agenda.ts';

const vivo = { inativado_em: null };
const morto = { inativado_em: '2026-09-20T10:00:00' };

// ---------------------------------------------------- AG8a os tres "nao sei" nao viram "ok"
chk('AG8a', nivelDoAviso(null) === 'nao_verificavel' && nivelDoAviso(undefined) === 'nao_verificavel',
    'nao ter perguntado devolve `nao_verificavel`, e nao `ativo` - a mesma distincao do '
    + '`sem_certificado` do vizinho: o sistema nao afirma o que nao sabe');

chk('AG8b', nivelDoAviso([]) === 'ausente',
    'lista vazia e `ausente` e nao `inativado` - nunca ter cadastrado e ter sido DESLIGADO pelo '
    + 'banco pedem a mesma acao e contam historias opostas sobre o que aconteceu');

chk('AG8c', nivelDoAviso([vivo]) === 'ativo' && nivelDoAviso([morto]) === 'inativado',
    'o carimbo de inativacao e o que decide, e so ele');

// ---------------------------------------------------- AG8d contaminacao, por exaustao
{
  let erradas = 0, listas = 0;
  for (let n = 1; n <= 5; n++) {
    for (let mascara = 0; mascara < (1 << n); mascara++) {
      const lista = Array.from({ length: n }, (_, i) => ((mascara >> i) & 1 ? morto : vivo));
      const temMorto = lista.some((a) => a.inativado_em !== null);
      const nivel = nivelDoAviso(lista);
      listas++;
      if (nivel !== (temMorto ? 'inativado' : 'ativo')) erradas++;
    }
  }
  chk('AG8d', erradas === 0 && listas === 62,
      `todas as ${listas} listas de 1 a 5 avisos: UM inativo basta para o nivel ser `
      + '`inativado`. Com dois cadastrados e um desligado nao da para saber qual o banco usaria, '
      + 'e a resposta otimista seria aposta sobre dinheiro');
}

// ---------------------------------------------------- AG8e nenhum nivel fica calado, exceto o bom
{
  const niveis = ['ativo', 'inativado', 'ausente', 'nao_verificavel'] as const;
  const linhas = niveis.map((nivel) => alertaDoAviso({
    nivel, avisos: nivel === 'inativado' ? [{ id: '1', url: null, inativado_em: 'x', motivo_da_inativacao: null }] : [],
    motivo: nivel === 'nao_verificavel' ? 'a rede caiu' : null,
  }));
  chk('AG8e', linhas[0]!.length === 0 && linhas.slice(1).every((l) => l.length > 0),
      '`ativo` nao imprime nada e os outros TRES imprimem - inclusive `nao_verificavel`, que e o '
      + 'que separa "olhei e esta bem" de "nao olhei"');

  chk('AG8f', linhas[3]!.join(' ').toLowerCase().includes('nao quer dizer que esta tudo bem'),
      'o texto de `nao_verificavel` DIZ que nao e garantia - a linha existe porque quem le um '
      + 'diagnostico sem alarme conclui que passou');

  chk('AG8g', linhas[1]!.some((l) => l.includes('consulta ativa')),
      'o alerta de desligado nomeia a consulta ativa: o dinheiro nao se perde, ele ATRASA ate a '
      + 'rodada diaria - sem isso o alerta parece perda de dinheiro e vira panico');
}

// ---------------------------------------------------- AG8h o diagnostico nao pode derrubar a rodada
{
  const portaSemAviso = { async registrar() { throw 0; }, async consultar() { throw 0; }, async baixar() {} } as any;
  const portaQueExplode = {
    ...portaSemAviso,
    async avisoDePagamento() { throw Object.assign(new Error('ECONNRESET'), { status: 502 }); },
  } as any;

  const semSuporte = await conferirAvisoDePagamento(portaSemAviso, 'ref');
  const comFalha = await conferirAvisoDePagamento(portaQueExplode, 'ref');

  chk('AG8h', semSuporte.nivel === 'nao_verificavel' && comFalha.nivel === 'nao_verificavel',
      'adaptador que nao sabe perguntar e Sicoob fora do ar dao os DOIS em `nao_verificavel`, sem '
      + 'lancar: um diagnostico que derruba a fila de emissao e pior que a doenca que diagnostica');

  chk('AG8i', semSuporte.motivo !== null && comFalha.motivo !== null
              && comFalha.motivo!.includes('ECONNRESET'),
      'e o motivo vem SEMPRE preenchido, com a mensagem original dentro - "nao sei" sem motivo e '
      + 'indistinguivel de "esqueci de olhar"');

  let vazou: unknown = null;
  const portaComBug = { ...portaSemAviso, async avisoDePagamento() { throw new TypeError('bug meu'); } } as any;
  try { await conferirAvisoDePagamento(portaComBug, 'ref'); } catch (e) { vazou = e; }
  chk('AG8j', vazou instanceof TypeError,
      'TypeError e RangeError PASSAM por cima do catch, como no laco da rodada: defeito de '
      + 'programacao virando "nao verificavel" e o bug se escondendo atras do proprio diagnostico');
}

// ---------------------------------------------------- AG8k a cadencia do diagnostico
{
  /*
   * O DEFEITO QUE ESTA LINHA PRENDE JA EXISTIU, por algumas horas em 09/09/2026.
   * A primeira versao do alerta ficou no caminho COMUM das duas tarefas que
   * escrevem - e `financeiro-agenda-fila.timer` e `OnCalendar=*:02/5`, a cada
   * cinco minutos. Seriam 288 chamadas por dia a Sicoob, cada uma com handshake
   * mTLS e pedido de token (o script roda uma vez e sai, entao o cache morre com
   * o processo), para observar um estado que muda talvez uma vez por ano.
   *
   * A assimetria com o certificado e o que decide, e ela nao e arbitraria: o A1
   * sai nas DUAS porque quebra a EMISSAO, que e o trabalho da fila. O aviso de
   * pagamento nao afeta emitir - afeta BAIXAR. Alertar a fila sobre ele e avisar
   * quem nao pode fazer nada a respeito.
   */
  /* ANCORADO DEPOIS DE «as que escrevem», e a ancora e o proprio teste: antes
   * dela mora a tarefa `--webhook` avulsa, que TAMBEM chama
   * `conferirAvisoDePagamento` e nao tem nada a ver com cadencia de timer.
   * Medir a primeira ocorrencia do arquivo mediria a tarefa errada - foi o que
   * esta verificacao fez na primeira tentativa, e ela falhou por isso. */
  const fonteScript = readFileSync(new URL('../scripts/agenda.ts', import.meta.url), 'utf8');
  /* A marca da SECAO, com os tracos - `as que escrevem` cru casa antes, no
   * comentario do cabecalho ("as duas tarefas que escrevem"), e a busca inteira
   * sai deslocada para a metade errada do arquivo. Aconteceu aqui. */
  const escrevem = fonteScript.indexOf('-- as que escrevem');
  const i = fonteScript.indexOf('conferirAvisoDePagamento(a.cobranca', escrevem);
  const guarda = fonteScript.lastIndexOf('if (consulta) {', i);
  const cert = fonteScript.indexOf('conferirCertificado()', escrevem);
  const roda = fonteScript.indexOf('executarFilaDeEmissao(a.cobranca');

  chk('AG8k', escrevem > 0 && guarda > escrevem && guarda < i && i < roda,
      'o alerta do aviso de pagamento roda SO na consulta diaria, dentro de `if (consulta)` - na '
      + 'fila ele discaria a Sicoob a cada 5 minutos para observar um estado que muda uma vez por ano');

  chk('AG8l', cert > escrevem && cert < guarda,
      'e o certificado continua saindo nas DUAS, ANTES dessa guarda - ele quebra a EMISSAO, que e o '
      + 'trabalho da fila, e a assimetria entre os dois alertas e deliberada');
}

// ============================================================================
// AG9 — A SAUDE DO CAMINHO DO DINHEIRO, e o canal que ela finalmente tem
// ============================================================================
//
// O QUE ESTAS LINHAS PRENDEM, e a pendencia tinha nome e dono. Ate 09/09/2026 os
// dois alertas desta agenda chegavam ao journal e a uma tela, e NENHUM DOS DOIS
// PROCURA NINGUEM - o `deploy/README` chama `systemctl list-units --failed` de
// "a unica superficie de alarme desta maquina", e nenhum dos dois aparecia la.
// O texto do `financeiro-agenda-certificado.service` registrava a falta com
// todas as letras desde 28/08.
//
// A METADE DELICADA E O CODIGO 5. E tentador fazer `nao_verificavel` sair 0 para
// que uma queda da Sicoob nao pinte a maquina de vermelho - e seria refazer, no
// alarme, exatamente o erro que `nivelDoAviso` existe para nao cometer: nao ter
// perguntado nao autoriza dizer que esta bem. O que o 5 custa e um vermelho de
// um dia numa queda transiente; o que ele compra e a queda que dura um mes.

import {
  saudeDoCaminhoDoDinheiro,
  type NivelDoCertificado, type NivelDoAviso as NivelDoAvisoDominio,
} from '../src/dominio/agenda.ts';

const cod = (certificado: NivelDoCertificado | null, aviso: NivelDoAvisoDominio | null) =>
  saudeDoCaminhoDoDinheiro({ certificado, aviso }).codigo;

console.log('\n-- AG9 a saude do caminho do dinheiro --');

chk('AG9a', cod('ok', 'ativo') === 0,
    'A1 em dia e aviso ligado saem 0 - a unidade fica verde e nao ha o que fazer');

chk('AG9b', cod(null, null) === 3,
    'sem conector de cobranca sai 3, o mesmo 3 da fila e da consulta: nada a conferir, e NAO e '
    + 'falha. Sem isso, uma maquina que ainda nao ligou o banco ficaria vermelha todo dia, e '
    + 'vermelho permanente e alarme desligado');

chk('AG9c', cod('vencido', 'ativo') === 4, 'A1 vencido pede acao humana (4)');
chk('AG9d', cod('vence_em_breve', 'ativo') === 4,
    'e A1 vencendo tambem, porque renovar tem processo e assinatura - avisar no dia do '
    + 'vencimento seria avisar tarde');
chk('AG9e', cod('ok', 'inativado') === 4, 'o banco ter desligado o aviso pede acao humana (4)');
chk('AG9f', cod('ok', 'ausente') === 4, 'e nunca ter havido aviso tambem - a acao e a mesma');

chk('AG9g', cod('sem_certificado', 'ativo') === 5,
    'A1 sem data cadastrada sai 5 e nao 4: ninguem sabe se ha problema, e o 5 diz isso');
chk('AG9h', cod('ok', 'nao_verificavel') === 5,
    'e a Sicoob fora do ar tambem sai 5 - VERMELHO, pelo mesmo motivo que faz `nao_verificavel` '
    + 'nao colapsar em `ativo`. Some sozinho na proxima rodada se era transiente; insiste, dia '
    + 'apos dia, se nao era');

chk('AG9i', cod('vencido', 'nao_verificavel') === 4,
    'com A1 vencido E Sicoob muda, o codigo e 4 e nao 5: o que da para fazer hoje e renovar o '
    + 'A1. A precedencia aponta o que tem dono, nao o que apareceu primeiro');

// ------------------------------------------- AG9j a exaustao dos 16 pares
{
  const certs: NivelDoCertificado[] = ['ok', 'sem_certificado', 'vencido', 'vence_em_breve'];
  const avisos: NivelDoAvisoDominio[] = ['ativo', 'inativado', 'ausente', 'nao_verificavel'];
  let verdes = 0, todosConhecidos = true;
  for (const c of certs) {
    for (const a of avisos) {
      const k = cod(c, a);
      if (![0, 4, 5].includes(k)) todosConhecidos = false;
      if (k === 0) verdes++;
    }
  }
  /* POR EXAUSTAO E NAO POR EXEMPLO ESCOLHIDO A MAO: a unica combinacao verde dos
   * dezesseis pares e `ok` + `ativo`. Um `if` a mais em qualquer um dos dois
   * `switch` faria um estado ruim sair 0, e nenhum caso avulso pegaria isso. */
  chk('AG9j', verdes === 1 && todosConhecidos,
      `dos 16 pares possiveis, exatamente UM sai 0 (achados ${verdes}), e nenhum sai codigo `
      + 'fora de {0,4,5}');
}

// ------------------------------- AG9k..AG9n o canal, do lado do systemd
{
  const unit = readFileSync(new URL('../deploy/financeiro-saude-cobranca.service', import.meta.url), 'utf8');
  const timer = readFileSync(new URL('../deploy/financeiro-saude-cobranca.timer', import.meta.url), 'utf8');

  chk('AG9k', /^ExecStart=.*\n?.*--saude/m.test(unit.replace(/\\\n\s*/g, ' ')),
      'a unidade chama a tarefa `--saude`, que e a unica que sai com codigo');

  /* A MUTACAO QUE ESTA LINHA PEGA E A QUE APAGA O ALARME SEM DELETAR NADA:
   * acrescentar 4 e 5 ao `SuccessExitStatus` deixa a unidade sempre verde e o
   * arquivo continua parecendo certo. Foi assim que o alerta ficou dois dias sem
   * canal - por parecer que tinha um. */
  const sucesso = (unit.match(/^SuccessExitStatus=(.*)$/m)?.[1] ?? '').split(/\s+/);
  chk('AG9l', sucesso.includes('3') && !sucesso.includes('4') && !sucesso.includes('5'),
      '3 e sucesso (sem conector nao e falha) e 4 e 5 NAO sao - eles existem exatamente para '
      + `ficar em \`systemctl list-units --failed\` (declarado: ${sucesso.join(' ') || '(nada)'})`);

  chk('AG9m', /OnCalendar=\*-\*-\* 06:3\d:00/.test(timer) && /Persistent=true/.test(timer),
      'ela roda uma vez por dia, DEPOIS da consulta das 06:17 - ela afirma sobre o estado em que '
      + 'o dia terminou, e afirmacao feita antes do trabalho seria sobre ontem');

  /* A UNIDADE VELHA PRECISA TER SUMIDO DO REPOSITORIO, e nao e limpeza: o
   * `install` do README copia `deploy/financeiro-*`, entao um arquivo esquecido
   * aqui volta a instalar a unidade que nao avisa ninguem - e as duas passam a
   * cair no mesmo journal, com quem le achando que a velha e a nova. */
  chk('AG9n', !existsSync(new URL('../deploy/financeiro-agenda-certificado.service', import.meta.url)),
      'a unidade antiga (`financeiro-agenda-certificado`) saiu do repositorio - o `install` do '
      + 'README copia `deploy/financeiro-*`, e um arquivo esquecido aqui reinstalaria o alerta '
      + 'que nao avisa ninguem');
}

// ------------------------------------- AG9o o script sai com o codigo
{
  const fonteScript = readFileSync(new URL('../scripts/agenda.ts', import.meta.url), 'utf8');
  const i = fonteScript.indexOf('if (saude) {');
  const fim = fonteScript.indexOf('-- as que escrevem');
  const trecho = i >= 0 && fim > i ? fonteScript.slice(i, fim) : '';
  chk('AG9o', trecho.includes('process.exit(veredito.codigo)'),
      'a tarefa `--saude` sai com o codigo do dominio - sem isto ela imprime o diagnostico e '
      + 'sai 0, que e o estado que esta entrega existe para acabar');

  /* A CADENCIA DO §2 CONTINUA VALENDO, e por isto ela e medida aqui tambem: o
   * `--saude` disca a Sicoob, e se ele escorregar para o caminho comum das duas
   * tarefas que escrevem, volta a discar a cada 5 minutos pela fila. */
  chk('AG9p', i > 0 && i < fim,
      'e o bloco do `--saude` fica ANTES de «as que escrevem» - ele e tarefa avulsa de leitura, '
      + 'e nao um alerta pendurado na fila de 5 minutos');
}

// ============================================================================
// AG10 — RELIGAR O AVISO: a guarda que existe porque nao ha inverso
// ============================================================================
//
// O QUE ESTAS LINHAS PROTEGEM E DINHEIRO EM DOBRO. `POST /webhooks` da Sicoob
// NAO e idempotente: cadastrar duas vezes cria dois webhooks e o banco passa a
// notificar EM DOBRO o mesmo pagamento. Nao ha rota nossa que desfaca — o
// conserto seria no banco, a mao.
//
// A guarda ja existia dentro do script `webhook-sicoob`, onde era protegida
// pelo fato de que quem digita um comando com `--valendo` leu o cabecalho. Ela
// virou dominio porque agora ha um BOTAO na tela, e botao e apertado por quem
// nao leu nada.

import { podeReligarOAviso } from '../src/dominio/agenda.ts';
import {
  religarAvisoDePagamento, NaoDaParaReligar, AdaptadorNaoReliga,
} from '../src/cobranca/agenda.ts';
import { registrarDesfecho } from '../src/repos/ato-externo.ts';

console.log('\n-- AG10 religar o aviso de pagamento --');

chk('AG10a', podeReligarOAviso('inativado').pode === true,
    'com o aviso DESLIGADO pelo banco, religar e o conserto — pode');
chk('AG10b', podeReligarOAviso('ausente').pode === true,
    'e sem aviso nenhum tambem: e o primeiro cadastro');

chk('AG10c', podeReligarOAviso('ativo').pode === false,
    'com um ATIVO, NAO — um segundo webhook faz o banco notificar em dobro o mesmo pagamento, '
    + 'e nao ha caminho neste sistema que desfaca');

chk('AG10d', podeReligarOAviso('nao_verificavel').pode === false,
    'e "nao deu para perguntar" tambem e NAO, que e a metade delicada: nao saber se ja existe '
    + 'um nao autoriza cadastrar. E a mesma disciplina do diagnostico, do lado da ESCRITA — la '
    + 'nao saber nao autoriza dizer que esta bem; aqui nao autoriza agir');

// -------------------------------------- AG10e o motivo nunca vem vazio
{
  const recusas = (['ativo', 'nao_verificavel'] as const).map((n) => podeReligarOAviso(n));
  chk('AG10e', recusas.every((r) => !r.pode && r.motivo.length > 60 && /dobro|nao saber|nao autoriza/i.test(r.motivo)),
      'toda recusa carrega o motivo por extenso, e ele diz a CONSEQUENCIA — a mensagem do '
      + 'servidor vai inteira para a tela, e "nao pode" sem porque manda a pessoa tentar de novo');
}

// ---------------------------- AG10f..AG10i a orquestracao, com porta de mentira
{
  const REF = 'ref-de-mentira';
  const P = { url: 'https://exemplo.com.br/w', email: 'a@b.com' };
  const base = {
    async registrar() { throw new Error('nao usado'); },
    async consultar() { throw new Error('nao usado'); },
    async baixar() { throw new Error('nao usado'); },
  } as any;

  /* ⚠️ `registrou` E A MESMA LISTA DA TRILHA, e a primeira versao disto NAO
   * fazia isso — a chamada ao banco nao aparecia na sequencia, entao `AG10j`
   * media `pedido > feito` e passava verde mesmo com o `pedido` movido para
   * DEPOIS de discar. Pegou por mutacao. Ordem so e observavel se os dois
   * eventos caem na mesma linha do tempo. */
  const porta = (avisos: any[] | null, aoReligar?: () => void, registrou?: string[]) => ({
    ...base,
    avisoDePagamento: async () => {
      if (avisos === null) throw new Error('a Sicoob nao respondeu');
      return avisos;
    },
    religarAvisoDePagamento: async () => {
      registrou?.push('discou');
      aoReligar?.(); return { id: '999' };
    },
  });

  const pegar = async (f: () => Promise<unknown>) => {
    try { await f(); return null; } catch (e: any) { return e; }
  };

  /* A TRILHA DE MENTIRA GRAVA A ORDEM, e e por isso que ela e uma lista e nao um
   * contador: o invariante que importa aqui nao e "gravou", e "gravou o `pedido`
   * ANTES de discar". Ver AG10j. */
  const trilhaFalsa = () => {
    const linhas: string[] = [];
    return {
      linhas,
      trilha: {
        async registrar(e: any) { linhas.push(`pedido:${e.detalhe?.nivel_antes}`); return 'p1'; },
        async desfecho(e: any) { linhas.push(`${e.fase}:${e.detalhe?.id_webhook ?? e.detalhe?.erro}`); },
      },
    };
  };

  // um webhook morto -> religa
  {
    let chamou = false;
    const t = trilhaFalsa();
    const r = await religarAvisoDePagamento(
      porta([{ id: '1', url: null, inativado_em: '2026-09-09', motivo_da_inativacao: 'x' }],
            () => { chamou = true; }, t.linhas),
      REF, P, { trilha: t.trilha }) as any;
    chk('AG10f', chamou && r.id === '999' && r.nivelAntes === 'inativado',
        'com o webhook morto ele CONSULTA, decide e escreve — e devolve o nivel de ANTES, para '
        + 'quem chamou poder dizer o que foi consertado');

    /* ============================================================
     * AG10j — A ORDEM DA TRILHA, e ela e o invariante do `Q-AUDIT-EXTERNO-01`.
     *
     * Chamada a terceiro nao e transacional. Gravar so DEPOIS perde a trilha se
     * o processo morrer no meio — e ai o ato ja aconteceu no mundo, de forma
     * irreversivel, e ninguem sabe quem mandou. Por isso `pedido` ANTES e
     * desfecho DEPOIS: um `pedido` orfao e uma pergunta que se pode fazer; um
     * ato sem linha nenhuma nao e.
     * ============================================================ */
    chk('AG10j', t.linhas.join(' > ') === 'pedido:inativado > discou > feito:999',
        'a trilha grava `pedido` ANTES de discar e o desfecho DEPOIS, nessa ordem — chamada a '
        + 'terceiro nao e transacional, e gravar so no fim perde o rastro de quem mandou se o '
        + `processo morrer no meio (foi: ${t.linhas.join(' > ') || '(nada)'})`);
  }

  // o banco recusa -> a trilha fecha com `falhou`
  {
    const t = trilhaFalsa();
    const quebrada = {
      ...porta([{ id: '1', url: null, inativado_em: '2026-09-09', motivo_da_inativacao: 'x' }]),
      religarAvisoDePagamento: async () => { throw new Error('a Sicoob recusou'); },
    };
    const e = await pegar(() => religarAvisoDePagamento(quebrada as any, REF, P, { trilha: t.trilha }));
    chk('AG10k', e?.message === 'a Sicoob recusou'
             && t.linhas.join(' > ') === 'pedido:inativado > falhou:a Sicoob recusou',
        'quando o banco recusa, o erro SOBE e a trilha fecha com `falhou` — um `pedido` seguido '
        + 'de `falhou` conta uma historia fechada; um `pedido` sozinho obriga a adivinhar se '
        + 'chegou a sair');
  }

  // a trilha do DESFECHO falha -> o ato NAO falha
  {
    let avisou = '';
    const trilhaQueQuebraNoFim = {
      async registrar() { return 'p1'; },
      async desfecho(_e: any, aoFalhar: (m: string) => void) { aoFalhar('nao gravou'); },
    };
    const r = await religarAvisoDePagamento(
      porta([{ id: '1', url: null, inativado_em: '2026-09-09', motivo_da_inativacao: 'x' }]),
      REF, P, { trilha: trilhaQueQuebraNoFim, aoFalharATrilha: (m) => { avisou = m; } }) as any;
    chk('AG10l', r.id === '999' && avisou === 'nao gravou',
        'e se a trilha do DESFECHO nao gravar, o ato NAO falha — nesse ponto o webhook ja existe '
        + 'no banco, e devolver erro faria a pessoa apertar de novo e criar o SEGUNDO. A guarda '
        + 'inteira derrotada por um erro de log. A falha vira aviso, e nao silencio');
  }

  // um vivo -> recusa, NAO ESCREVE e NAO deixa trilha
  {
    let chamou = false;
    const t = trilhaFalsa();
    const e = await pegar(() => religarAvisoDePagamento(
      porta([{ id: '1', url: null, inativado_em: null, motivo_da_inativacao: null }], () => { chamou = true; }),
      REF, P, { trilha: t.trilha }));
    chk('AG10g', e instanceof NaoDaParaReligar && e.status === 409 && !chamou && t.linhas.length === 0,
        'com um vivo ele recusa com 409, NAO CHAMA o banco e nao deixa trilha: nada aconteceu, e '
        + 'uma linha de `pedido` aqui poluiria a trilha com tentativas que a guarda barrou');
  }

  // Sicoob muda -> recusa E NAO ESCREVE
  {
    let chamou = false;
    const t = trilhaFalsa();
    const e = await pegar(() => religarAvisoDePagamento(
      porta(null, () => { chamou = true; }), REF, P, { trilha: t.trilha }));
    chk('AG10h', e instanceof NaoDaParaReligar && !chamou && t.linhas.length === 0,
        'e com a Sicoob fora do ar tambem NAO escreve — a consulta passa por '
        + '`conferirAvisoDePagamento`, que traduz rede caida em `nao_verificavel` em vez de '
        + 'estourar 500 no botao');
  }

  // a engolida do `registrarDesfecho`, exercitada de verdade
  {
    let avisou = '';
    let subiu = false;
    try {
      await registrarDesfecho(
        { ...{ ato: 'x', contraparte: 'y' }, fase: 'feito' },
        (m) => { avisou = m; },
        (async () => { throw new Error('banco fora'); }) as any,
      );
    } catch { subiu = true; }
    chk('AG10m', !subiu && avisou.includes('banco fora') && avisou.includes('ficou sem par'),
        '`registrarDesfecho` ENGOLE a falha e avisa — e o aviso nomeia o `pedido` orfao, que e '
        + 'por onde se reconstroi. Deixar subir faria a rota devolver erro para um ato que deu '
        + 'certo, e a pessoa apertaria de novo');
  }

  // adaptador que nao sabe -> 503 nomeado
  {
    const e = await pegar(() => religarAvisoDePagamento(base, REF, P));
    chk('AG10i', e instanceof AdaptadorNaoReliga && e.status === 503,
        'e um adaptador que nao sabe religar diz isso com nome e 503, em vez de estourar '
        + '`undefined is not a function` tres camadas adiante');
  }
}


// ============================================================================
// AG11 - A RODADA ACONTECEU? o alarme sobre a AUSENCIA
// ============================================================================
//
// O QUE ESTAS LINHAS PRENDEM, e o defeito nao e de calculo: e de OMISSAO, e ele
// e o unico modo de falha deste sistema que nao produz nada. Boleto que falha
// deixa `ultimo_erro`; webhook desligado deixa `dataHoraInativacao`; A1 vencido
// deixa uma data no passado. **Rodada que nao acontece nao deixa coisa nenhuma**
// - e por isso o que se afirma aqui e a forma da funcao, e nao uma tabela de
// niveis que eu poderia ter copiado da saida do meu proprio codigo.
//
// As propriedades, e elas sao as mesmas cinco da progressao la de cima:
//
//   nunca antes da hora   em `ultima + intervalo` NAO ha alarme. Alarmar antes
//                         de a proxima rodada vencer e alarmar sobre o relogio
//   e sempre depois       existe um instante em que vira `atrasada`. Um limiar
//                         inalcancavel passa em "nunca alarma antes" e nao e
//                         limiar - o mesmo argumento do teto de `intervaloSegundos`
//   monotonia             o tempo so PIORA o nivel. Um alarme que se apaga
//                         sozinho com o passar das horas seria pior que nenhum
//   precedencia           `travada` nao vira `atrasada` quando envelhece: a
//                         linha orfa tranca o EXCLUDE, e nomear so o atraso
//                         mandaria consertar a coisa errada
//   o silencio autorizado `sem_conector` cala TUDO, e e o unico que cala

{
  const T0 = new Date('2026-09-10T06:17:00Z');
  const mais = (d: Date, seg: number) => new Date(d.getTime() + seg * 1000);
  const rodada = (status: string, iniciado: Date): RodadaVista =>
    ({ iniciado_em: iniciado, terminado_em: status === 'em_andamento' ? null : iniciado, status });

  const nivel = (e: {
    temConector?: boolean; ultima?: RodadaVista | null; desde?: Date | null;
    agora: Date; intervalo?: number;
  }): NivelDaRodada => nivelDaRodada({
    temConector: e.temConector ?? true,
    ultima: e.ultima === undefined ? rodada('ok', T0) : e.ultima,
    desde: e.desde === undefined ? new Date('2026-01-01T00:00:00Z') : e.desde,
    agora: e.agora,
    intervaloSegundos: e.intervalo ?? CADENCIA.consulta_ativa,
  });

  const CADENCIAS = [CADENCIA.fila_de_emissao, CADENCIA.consulta_ativa, CADENCIA.ciclo_do_crm];

  // ------------------------------------------------- AG11a o silencio autorizado
  {
    const todos = [
      nivel({ temConector: false, agora: T0 }),
      nivel({ temConector: false, ultima: null, agora: mais(T0, 999_999) }),
      nivel({ temConector: false, ultima: rodada('em_andamento', T0), agora: mais(T0, 999_999) }),
    ];
    chk('AG11a', todos.every((n) => n === 'sem_conector'),
        'sem conector NADA vira alarme, nem a ausencia de rodada nem a rodada travada - a mesma '
        + 'disciplina do codigo de saida 3: vermelho permanente numa instalacao que nunca ligou '
        + 'banco e alarme desligado');
  }

  // -------------------------------------- AG11b nunca antes da hora, nas tres
  {
    const cedo = CADENCIAS.filter((i) => nivel({ agora: mais(T0, i), intervalo: i }) !== 'em_dia');
    chk('AG11b', cedo.length === 0,
        'em `ultima + intervalo` exato nao ha alarme em nenhuma das tres cadencias - a rodada '
        + `seguinte acabou de vencer, e o systemd ainda tem a folga dele${cedo.length ? ` (falhou em ${cedo.join(', ')})` : ''}`);
  }

  // ------------------------------------------ AG11c e sempre depois: o limiar existe
  {
    const nunca = CADENCIAS.filter((i) => nivel({ agora: mais(T0, i * 3 + 7200), intervalo: i }) !== 'atrasada');
    chk('AG11c', nunca.length === 0,
        'e em tres intervalos + 2 h TODAS acusam atraso - um limiar que nunca e alcancado passaria '
        + `no teste de cima e nao seria limiar${nunca.length ? ` (falhou em ${nunca.join(', ')})` : ''}`);
  }

  // --------------------------------------------------- AG11d monotonia no tempo
  {
    const ordem: Record<string, number> = { em_dia: 0, terminou_mal: 1, atrasada: 2 };
    let regressoes = 0;
    for (const i of CADENCIAS) {
      let pior = 0;
      for (let t = 0; t <= i * 4; t += Math.max(60, Math.floor(i / 20))) {
        const n = ordem[nivel({ agora: mais(T0, t), intervalo: i })] ?? 0;
        if (n < pior) regressoes++;
        pior = Math.max(pior, n);
      }
    }
    chk('AG11d', regressoes === 0,
        `o tempo so PIORA o nivel de uma mesma rodada (${regressoes} regressoes) - um alarme que `
        + 'se apaga sozinho enquanto o defeito continua e pior que alarme nenhum');
  }

  // ------------------------------------------- AG11e a precedencia da travada
  {
    const velha = rodada('em_andamento', T0);
    const daqui = [1, 3, 10, 100].map((k) =>
      nivel({ ultima: velha, agora: mais(T0, CADENCIA.consulta_ativa * k + 90_000) }));
    chk('AG11e', daqui.every((n) => n === 'travada'),
        'a linha `em_andamento` envelhecida sai `travada` e NUNCA `atrasada`, por mais tempo que '
        + 'passe - e ela tranca o EXCLUDE da migration 21, entao dizer so "atrasada" mandaria '
        + 'procurar o timer quando o conserto e encerrar a rodada orfa');

    chk('AG11f', nivel({ ultima: rodada('em_andamento', T0), agora: mais(T0, 60), intervalo: 300 }) === 'em_dia',
        'e a rodada que comecou agora NAO e travada: uma execucao em andamento e o estado normal '
        + 'de quem acabou de ser disparado');
  }

  // ----------------------------------------- AG11g nunca rodou x recem-ligado
  {
    chk('AG11g', nivel({ ultima: null, desde: T0, agora: mais(T0, 600), intervalo: 86_400 }) === 'em_dia'
              && nivel({ ultima: null, desde: T0, agora: mais(T0, 999_999), intervalo: 86_400 }) === 'nunca_rodou'
              && nivel({ ultima: null, desde: null, agora: T0 }) === 'nunca_rodou',
        'ligar a cobranca as 9h nao faz a tela acusar "nunca rodou" as 9h01 - o conector recem '
        + 'cadastrado ganha a folga de uma cadencia; passada ela, a ausencia de linha e ausencia '
        + 'mesmo, e sem data de cadastro nao ha folga a conceder');
  }

  // ---------------------------- AG11h `parcial` nao e alarme, e o desconhecido tambem nao
  {
    chk('AG11h', nivel({ ultima: rodada('erro', T0), agora: mais(T0, 60) }) === 'terminou_mal'
              && nivel({ ultima: rodada('parcial', T0), agora: mais(T0, 60) }) === 'em_dia'
              && nivel({ ultima: rodada('inventado_amanha', T0), agora: mais(T0, 60) }) === 'em_dia',
        '`erro` acusa, `parcial` NAO (a rodada concluiu e registrou o motivo de cada item, e o que '
        + 'falhou tem lugar proprio para aparecer) e um status que o enum ganhe amanha cai no '
        + 'silencio em vez de virar alarme falso');
  }

  // --------------------------------------------- AG11i a folga tem forma e piso
  {
    const cresce = CADENCIAS.every((i) => atrasoAceitoSegundos(i) > i);
    const piso = atrasoAceitoSegundos(60) >= 60 + 600;
    const recusa = lancou(() => atrasoAceitoSegundos(0)) instanceof RangeError
                && lancou(() => atrasoAceitoSegundos(-1)) instanceof RangeError;
    chk('AG11i', cresce && piso && recusa,
        'a folga e sempre MAIOR que a cadencia, tem piso de 10 minutos para cadencia curta (uma '
        + 'rodada perdida entre 288 por dia nao e noticia; duas sao) e recusa cadencia <= 0 em vez '
        + 'de devolver um numero que alarmaria para sempre');
  }

  // ------------------------------------------------- AG11j quem pede gente
  {
    const todos: NivelDaRodada[] =
      ['em_dia', 'terminou_mal', 'atrasada', 'travada', 'nunca_rodou', 'sem_conector'];
    const pedem = todos.filter(pedeGente);
    chk('AG11j', pedem.join(',') === 'atrasada,travada,nunca_rodou',
        `exatamente tres niveis pedem gente (${pedem.join(', ')}) - \`terminou_mal\` fica de fora `
        + 'de proposito: a rodada aconteceu, a proxima retenta, e por a unidade em vermelho por '
        + 'isso a deixaria vermelha por coisas que se resolvem sozinhas');
  }

  // ------------------------- AG11k a cadencia declarada bate com os timers de verdade
  {
    /* ⚠️ A COPIA E O RISCO, E ESTA LINHA E O QUE O PRENDE. `CADENCIA` repete, em
     * segundos, o que o `OnCalendar` de cada unidade diz. Sem esta verificacao,
     * mudar o timer da fila de 5 para 30 minutos deixaria o alarme calado por
     * meia hora achando que esta tudo em dia - e o alarme mentiria com a mesma
     * cara de estar certo, que e o formato de dano que a secao inteira combate. */
    const ler = (u: string) => readFileSync(new URL(`../deploy/${u}`, import.meta.url), 'utf8');
    const doCalendario = (unidade: string): number | null => {
      const t = ler(unidade);
      const cada = /^OnCalendar=\*:\d+\/(\d+)\s*$/m.exec(t);
      if (cada) return Number(cada[1]) * 60;
      if (/^OnCalendar=\*-\*-\* \d\d:\d\d:\d\d\s*$/m.test(t)) return 86_400;
      return null;
    };
    const medido = {
      fila_de_emissao: doCalendario('financeiro-agenda-fila.timer'),
      consulta_ativa: doCalendario('financeiro-agenda-consulta.timer'),
      ciclo_do_crm: doCalendario('financeiro-ciclo.timer'),
    };
    const fora = (Object.keys(medido) as Array<keyof typeof medido>)
      .filter((k) => medido[k] !== CADENCIA[k]);
    chk('AG11k', fora.length === 0,
        'os tres numeros de `CADENCIA` sao os `OnCalendar` dos tres timers, lidos do arquivo'
        + `${fora.length ? ` - DIVERGEM: ${fora.map((k) => `${k}: declarado ${CADENCIA[k]}, unidade ${medido[k]}`).join(' · ')}` : ''}`);
  }

  // ---------------- AG11l as rodadas paradas entram no codigo de saida da unidade
  {
    const semRodadas = saudeDoCaminhoDoDinheiro({ certificado: 'ok', aviso: 'ativo' });
    const comRodadas = saudeDoCaminhoDoDinheiro({
      certificado: 'ok', aviso: 'ativo',
      rodadasParadas: ['a conferencia de pagamentos no banco nao roda ha 96 h'],
    });
    chk('AG11l', semRodadas.codigo === 0 && comRodadas.codigo === 4
              && comRodadas.resumo.includes('96 h'),
        'com o A1 valido e o aviso ligado, uma rodada parada sozinha JA poe a unidade em vermelho '
        + '(4) e a frase inteira sai no resumo - antes de 10/09/2026 este caso saia 0, e a unidade '
        + 'afirmava "de pe" sobre um sistema que tinha parado de buscar dinheiro');

    const vazio = saudeDoCaminhoDoDinheiro({ certificado: 'ok', aviso: 'ativo', rodadasParadas: [] });
    chk('AG11m', vazio.codigo === 0 && vazio.resumo === semRodadas.resumo,
        'e lista vazia nao muda nada: o campo novo nao pode alterar o veredito de quem nao o passa');

    const semConector = saudeDoCaminhoDoDinheiro({
      certificado: null, aviso: null, rodadasParadas: ['seja o que for'],
    });
    chk('AG11n', semConector.codigo === 3,
        'e sem conector continua 3 mesmo com rodada na lista - a precedencia 3 > 4 nao muda, e '
        + 'sem conector nao ha rodada a esperar de qualquer forma');
  }
}

console.log(`\n${falhas === 0 ? 'agenda (puro): todas as verificacoes passaram'
                              : `agenda (puro): ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
