// CONTAS A RECEBER — a suite das regras puras.
// Uso: node --experimental-strip-types web/tests/receber.ts
//
// O que se prende aqui e o que a tela afirma sem poder provar sozinha: em que
// faixa de atraso um titulo cai, se ele tem como ser pago hoje, quem mais deve e
// o que a frase de truncagem diz. Datas SEMPRE como texto `AAAA-MM-DD`, porque e
// assim que o servidor as manda e assim que a tela as le - um `new Date()` aqui
// faria o teste depender do fuso da maquina.

import {
  diasDeAtraso, faixaDeAtraso, fraseDoAtraso, FAIXAS, ROTULO_DA_FAIXA, TOM_DA_FAIXA,
  situacaoDaCobranca, SITUACOES, ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, podeSerPaga,
  porFaixa, porCliente, totalCentavos, avisoDeTruncagem,
  type TituloAReceber,
} from '../src/receber-regras.ts';
import { mesDaQuery } from '../src/dinheiro.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

const HOJE = '2026-09-22';

const titulo = (p: Partial<TituloAReceber>): TituloAReceber => ({
  fatura_id: 'f', unidade: '000170785201', cliente: 'Ana', cliente_id: 'c1',
  competencia: '2026-08-01', vencimento: '2026-09-10', emitida_em: '2026-09-01T12:00:00.000Z',
  valor_total_centavos: 10_000, status_fatura: 'emitida', boleto: null, ...p,
});

// ------------------------------------------------------------ RC1 os dias

chk('RC1', diasDeAtraso('2026-09-22', HOJE) === 0, 'vence hoje = 0 dias');
chk('RC1b', diasDeAtraso('2026-09-19', HOJE) === 3, 'venceu ha tres dias = 3');
chk('RC1c', diasDeAtraso('2026-09-25', HOJE) === -3, 'vence em tres dias = -3');
chk('RC1d', diasDeAtraso('2026-08-22', HOJE) === 31, 'atravessa o mes: 22/08 -> 22/09 sao 31 dias');
chk('RC1e', diasDeAtraso('2026-09-10T00:00:00.000Z', HOJE) === 12,
    'aceita a data com horario, como o JSON do servidor manda, e le so o dia');

// ---------------------------------------------------------- RC2 as faixas

chk('RC2', faixaDeAtraso('2026-09-22', HOJE) === 'a_vencer', 'vence hoje ainda e A VENCER - o boleto vale o dia inteiro');
chk('RC2b', faixaDeAtraso('2026-10-01', HOJE) === 'a_vencer', 'futuro e a vencer');
chk('RC2c', faixaDeAtraso('2026-09-21', HOJE) === 'ate_30', '1 dia -> ate 30');
chk('RC2d', faixaDeAtraso('2026-08-23', HOJE) === 'ate_30', '30 dias -> ate 30 (inclusivo)');
chk('RC2e', faixaDeAtraso('2026-08-22', HOJE) === 'ate_60', '31 dias -> 31 a 60');
chk('RC2f', faixaDeAtraso('2026-07-24', HOJE) === 'ate_60', '60 dias -> 31 a 60 (inclusivo)');
chk('RC2g', faixaDeAtraso('2026-07-23', HOJE) === 'ate_90', '61 dias -> 61 a 90');
chk('RC2h', faixaDeAtraso('2026-06-24', HOJE) === 'ate_90', '90 dias -> 61 a 90 (inclusivo)');
chk('RC2i', faixaDeAtraso('2026-06-23', HOJE) === 'acima_90', '91 dias -> mais de 90');
chk('RC2j', FAIXAS.every((f) => ROTULO_DA_FAIXA[f] && TOM_DA_FAIXA[f]),
    'toda faixa tem rotulo e tom');
chk('RC2k', TOM_DA_FAIXA.a_vencer === 'ok' && FAIXAS.slice(1).every((f) => TOM_DA_FAIXA[f] === 'pendente'),
    'a vencer e ok; qualquer atraso e pendente - ha trabalho a fazer');

// ---------------------------------------------------------- RC3 a frase

chk('RC3', fraseDoAtraso(0) === 'vence hoje', 'zero');
chk('RC3b', fraseDoAtraso(-1) === 'vence amanhã' && fraseDoAtraso(-5) === 'vence em 5 dias', 'futuro');
chk('RC3c', fraseDoAtraso(1) === '1 dia de atraso' && fraseDoAtraso(12) === '12 dias de atraso',
    'singular e plural certos');

// ------------------------------------------------ RC4 a situacao da cobranca

const b = (status: string, origem = 'api_sicoob') => ({ status, origem, nosso_numero: null });
chk('RC4', situacaoDaCobranca(null) === 'sem_boleto', 'sem linha de boleto = sem boleto');
chk('RC4b', situacaoDaCobranca(b('pendente')) === 'boleto_a_caminho', 'pendente = a caminho');
chk('RC4c', situacaoDaCobranca(b('registrado')) === 'boleto_no_banco', 'registrado pela nossa porta = no banco');
chk('RC4d', situacaoDaCobranca(b('registrado', 'importado')) === 'boleto_importado',
    'registrado com origem importado = importado - a tela precisa dizer POR QUEM');
chk('RC4e', situacaoDaCobranca(b('erro')) === 'boleto_recusado', 'erro = recusado pelo banco');
chk('RC4f', situacaoDaCobranca(b('baixado')) === 'boleto_baixado'
         && situacaoDaCobranca(b('cancelado')) === 'boleto_baixado',
    'baixado e cancelado = nao pagavel');
chk('RC4g', SITUACOES.every((s) => ROTULO_DA_SITUACAO[s] && TOM_DA_SITUACAO[s]),
    'toda situacao tem rotulo e tom');
chk('RC4h', podeSerPaga('boleto_no_banco') && podeSerPaga('boleto_importado')
         && !podeSerPaga('sem_boleto') && !podeSerPaga('boleto_baixado') && !podeSerPaga('boleto_recusado'),
    'so boleto vivo no banco pode ser pago hoje');
chk('RC4i', TOM_DA_SITUACAO.sem_boleto === 'pendente' && TOM_DA_SITUACAO.boleto_baixado === 'pendente',
    'sem boleto e baixado sao PENDENTES: cobranca que nao saiu e trabalho, nao espera');

// ------------------------------------------------------ RC5 as somas por faixa

const carteira: TituloAReceber[] = [
  titulo({ fatura_id: 'a', vencimento: '2026-09-30', valor_total_centavos: 1_000 }),                 // a vencer
  titulo({ fatura_id: 'b', vencimento: '2026-09-20', valor_total_centavos: 2_000 }),                 // 2 dias
  titulo({ fatura_id: 'c', vencimento: '2026-08-01', valor_total_centavos: 4_000, cliente_id: 'c2', cliente: 'Bruno' }), // 52 dias
  titulo({ fatura_id: 'd', vencimento: '2026-05-01', valor_total_centavos: 8_000, cliente_id: 'c2', cliente: 'Bruno' }), // 144 dias
  titulo({ fatura_id: 'e', vencimento: '2026-09-25', valor_total_centavos: null, cliente_id: 'c3', cliente: 'Caio' }),   // a vencer, sem total
];

const faixas = porFaixa(carteira, HOJE);
chk('RC5', faixas.length === 5 && faixas.map((f) => f.faixa).join() === FAIXAS.join(),
    'sempre as cinco faixas, na ordem, inclusive as zeradas');
chk('RC5b', faixas[0]!.titulos === 2 && faixas[0]!.centavos === 1_000,
    'a vencer: dois titulos, e o total nulo conta como zero em vez de derrubar a soma');
chk('RC5c', faixas[1]!.titulos === 1 && faixas[1]!.centavos === 2_000, 'ate 30: um');
chk('RC5d', faixas[2]!.titulos === 1 && faixas[2]!.centavos === 4_000, '31 a 60: um');
chk('RC5e', faixas[3]!.titulos === 0 && faixas[3]!.centavos === 0, '61 a 90: vazio, e presente');
chk('RC5f', faixas[4]!.titulos === 1 && faixas[4]!.centavos === 8_000, 'mais de 90: um');
chk('RC5g', faixas.reduce((a, f) => a + f.centavos, 0) === totalCentavos(carteira),
    'a soma das faixas e o total da carteira, ao centavo');

// -------------------------------------------------------- RC6 quem mais deve

const devedores = porCliente(carteira, HOJE);
chk('RC6', devedores.length === 3, 'tres clientes distintos - agrupa por pessoa, nao por unidade');
chk('RC6b', devedores[0]!.cliente === 'Bruno' && devedores[0]!.vencido_centavos === 12_000
         && devedores[0]!.titulos === 2 && devedores[0]!.maior_atraso_dias === 144,
    'quem tem mais VENCIDO vem primeiro, com o atraso do titulo mais antigo');
chk('RC6c', devedores[1]!.cliente === 'Ana' && devedores[1]!.vencido_centavos === 2_000
         && devedores[1]!.centavos === 3_000,
    'Ana: um vencido de 20, e 30 em aberto no total');
chk('RC6d', devedores[2]!.cliente === 'Caio' && devedores[2]!.vencido_centavos === 0
         && devedores[2]!.maior_atraso_dias === 0,
    'quem nao tem nada vencido fica por ultimo, com atraso zero');

// ----------------------------------------------------------- RC7 a truncagem

chk('RC7', avisoDeTruncagem(120, 120) === null && avisoDeTruncagem(5, 500) === null,
    'lista inteira: sem aviso');
chk('RC7b', /500 títulos mais antigos de 812/.test(avisoDeTruncagem(812, 500) ?? ''),
    'truncou: diz quantos mostrou e quantos ha');

// ----------------------------------------------------- RC8 o mes do endereco

chk('RC8', mesDaQuery('?mes=2026-08') === '2026-08', 'le o mes do endereco');
chk('RC8b', mesDaQuery('?x=1&mes=2026-12&y=2') === '2026-12', 'no meio de outros parametros');
chk('RC8c', mesDaQuery('') === null && mesDaQuery('?mes=') === null, 'ausente ou vazio: null');
chk('RC8d', mesDaQuery('?mes=2026-13') === null && mesDaQuery('?mes=08/2026') === null
         && mesDaQuery('?mes=2026-08-01') === null,
    'formato que nao e o do seletor de mes e ignorado, nao corrigido');

// ---------------------------------------------- RC9 o vocabulario dos rotulos

const rotulos = [...Object.values(ROTULO_DA_FAIXA), ...Object.values(ROTULO_DA_SITUACAO)];
chk('RC9', rotulos.every((r) => !/[a-z]_[a-z]/.test(r) && !/\bUC\b/.test(r)),
    'nenhum rotulo mostra nome de coluna nem sigla - e o que a suite de vocabulario cobra das telas');

console.log(`\n${falhas === 0 ? `contas a receber: ${feitas} verificacoes, 0 falhas`
                              : `contas a receber: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
