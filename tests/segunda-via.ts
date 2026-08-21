/*
 * A SEGUNDA VIA da fatura unificada: a linha gravada de volta em campos de tela.
 *
 * O QUE ESTA SUITE PRENDE, e e uma propriedade e nao um valor:
 *
 *     campos -> calcular() -> linha gravada -> campos -> calcular()
 *
 * tem de fechar nos MESMOS nove centavos. Se fechar, a segunda via imprime o
 * mesmo papel que o cliente tem na mao; se nao fechar, ela imprime outro - e o
 * cliente confere.
 *
 * PURO E SEM BANCO, e aqui isso e o unico caminho: `tests/repos.sh` exige
 * PostgreSQL local e esta VPS nao tem um.
 *
 * Rodar: node --experimental-strip-types tests/segunda-via.ts
 */
import {
  segundaViaDoRegistro, divergenciasDaSegundaVia,
  centavosParaTexto, competenciaParaMesReferencia,
  type LinhaGravada,
} from '../src/dominio/segunda-via.ts';
import { calcular, type CamposDaFaturaUnificada, type ParametrosDaEmissao } from '../src/dominio/fatura-unificada.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ===========================================================================
// V1 - centavos de volta para texto, sem float
// ===========================================================================

chk('V1a', centavosParaTexto(12750) === '127.50', '12.750 centavos viram "127.50"');
chk('V1b', centavosParaTexto(5) === '0.05', 'cinco centavos viram "0.05" e nao "0.5"');
chk('V1c', centavosParaTexto(0) === '0.00', 'zero vira "0.00" - e nao string vazia');
chk('V1d', centavosParaTexto(100) === '1.00', 'um real fecha nas duas casas');
chk('V1e', centavosParaTexto(-350) === '-3.50', 'negativo mantem o sinal antes do inteiro');
/* 2^53 nao chega perto de um valor de fatura, mas a conversao e por STRING e nao
 * por divisao - entao um numero grande nao perde o ultimo centavo. */
chk('V1f', centavosParaTexto(2100000000) === '21000000.00',
    'R$ 21 milhoes - o valor que ja estourou um sum(int) neste projeto - volta exato');

chk('V2a', competenciaParaMesReferencia('2026-06-01') === '06/2026',
    'a competencia do banco vira o MM/AAAA que o extrator devolve');
chk('V2b', competenciaParaMesReferencia('') === '',
    'competencia ilegivel devolve vazio em vez de inventar um mes');

// ===========================================================================
// V3 - A VOLTA COMPLETA. A propriedade que importa.
// ===========================================================================

const parametros: ParametrosDaEmissao = { percentual_desconto: '20', fator_emissao: '0.029' };

/** Os campos como a pessoa os conferiu na tela, com os numeros de uma fatura
 *  real da Equatorial. */
const originais: CamposDaFaturaUnificada = {
  cliente: 'YAGO CANDIDO MACHADO',
  documento: '529.982.247-25',
  endereco: 'RUA DAS FLORES, 100 - CENTRO',
  unidade_consumidora: '3001234',
  classificacao: 'RESIDENCIAL',
  mes_referencia: '06/2026',
  data_emissao: '2026-07-02',
  leitura_anterior: '2026-06-01',
  leitura_atual: '2026-06-30',
  dias_faturados: '29',
  vencimento: '2026-07-15',
  energia_compensada_kwh: '480.000',
  tarifa_kwh: '1.185396',
  consumo_nao_compensado_kwh: '30.000',
  consumo_nao_compensado_valor: '35.56',
  iluminacao_publica: '35.00',
  bandeira_tarifaria: 'VERDE',
  bandeira_valor: '12.00',
  /* DISCORDA DE PROPOSITO do residuo (127,00 - 35,56 - 35,00 - 12,00 = 44,44):
   * e o cenario em que a guarda da primeira via ACUSA, e e contra ele que a V4b
   * mede o silencio honesto da segunda. */
  outros_encargos: '40.00',
  valor_total_equatorial: '127.00',
  historico_consumo: [{ mes: '05/2026', kwh: '470' }, { mes: '04/2026', kwh: '512' }, { mes: '03/2026', kwh: '498' }],
};

const contaOriginal = calcular(originais, parametros);

/** A linha como a migration 29 a grava: os nove centavos, as grandezas em
 *  escala decimal, e o que a distribuidora dizia. */
const gravada: LinhaGravada = {
  numero_uc: originais.unidade_consumidora,
  competencia: '2026-06-01',
  cliente_nome: originais.cliente,
  cliente_documento: originais.documento,
  endereco: originais.endereco,
  classificacao: originais.classificacao,
  data_emissao: originais.data_emissao,
  leitura_anterior: originais.leitura_anterior,
  leitura_atual: originais.leitura_atual,
  dias_faturados: 29,
  vencimento: originais.vencimento,
  bandeira_tarifaria: originais.bandeira_tarifaria,

  compensada_kwh: '480.000',
  nao_compensado_kwh: '30.000',
  tarifa_kwh: '1.185396',
  percentual_desconto: '20.00',
  fator_emissao: '0.029000',

  integral_centavos: contaOriginal.integral_centavos,
  desconto_centavos: contaOriginal.desconto_centavos,
  energia_g3_centavos: contaOriginal.energia_g3_centavos,
  nao_compensado_centavos: contaOriginal.nao_compensado_centavos,
  iluminacao_publica_centavos: contaOriginal.iluminacao_publica_centavos,
  bandeira_centavos: contaOriginal.bandeira_centavos,
  demais_centavos: contaOriginal.demais_centavos,
  total_equatorial_centavos: contaOriginal.total_equatorial_centavos,
  total_centavos: contaOriginal.total_centavos,

  linha_digitavel: '75691.23456 78901.234567 89012.345678 9 12340000012700',
  pix_copia_e_cola: '00020126...6304ABCD',
  nosso_numero: '000000012',
  instrucoes: ['Nao receber apos 30 dias do vencimento'],
  historico_consumo: originais.historico_consumo,
};

const volta = segundaViaDoRegistro(gravada);
const contaDaVolta = calcular(volta.campos, volta.parametros);

chk('V3a', divergenciasDaSegundaVia(contaDaVolta, gravada).length === 0,
    'A VOLTA FECHA: os nove centavos recalculados batem com os nove gravados');

chk('V3b', contaDaVolta.total_centavos === contaOriginal.total_centavos
        && contaDaVolta.energia_g3_centavos === contaOriginal.energia_g3_centavos,
    'o total e a energia da G3 sao os mesmos da primeira emissao - o papel nao muda');

chk('V3c', volta.campos.unidade_consumidora === '3001234'
        && volta.campos.mes_referencia === '06/2026',
    'a chave do registro volta como a tela a espera (unidade e MM/AAAA)');

chk('V3d', volta.campos.tarifa_kwh === '1.185396',
    'a tarifa volta com as SEIS casas - truncar em duas ja custou R$ 2,90 numa unidade');

chk('V3e', volta.campos.iluminacao_publica === '35.00' && volta.campos.bandeira_valor === '12.00',
    'as parcelas da distribuidora voltam de centavos para reais sem passar por float');

chk('V3f', volta.campos.historico_consumo.length === 3
        && volta.campos.historico_consumo[0]!.mes === '05/2026',
    'o historico de consumo volta inteiro - e ele desenha o grafico da folha 2');

chk('V3g', volta.boleto.linha_digitavel === gravada.linha_digitavel
        && volta.boleto.nosso_numero === '000000012'
        && volta.boleto.instrucoes.length === 1,
    'a faixa de pagamento volta igual: linha, nosso numero e instrucoes');

/* OS PARAMETROS SAO OS DA LINHA, e nao os do modelo de hoje. E a diferenca entre
 * reimprimir o passado e reprecifica-lo. */
chk('V3h', volta.parametros.percentual_desconto === '20.00'
        && volta.parametros.fator_emissao === '0.029000',
    'os parametros voltam CONGELADOS da linha - trocar o padrao do modelo nao reimprime o passado com outro numero');

// ===========================================================================
// V4 - O CAMPO QUE NAO VOLTA, e ele nao e fingido
// ===========================================================================

chk('V4a', volta.campos.outros_encargos === '',
    '`outros_encargos` volta VAZIO: a migration 29 nao o guarda, e ele e o que o extrator LEU');

/* Vazio significa "nao conferido aqui", e nao "conferido e bate". `calcular()`
 * so acusa quando a string nao e vazia - preencher com o residuo faria os dois
 * concordarem por construcao e a folha afirmaria uma conferencia que ninguem
 * fez. Q-SEGVIA-01. */
chk('V4b', contaOriginal.residuo_discorda === true && contaDaVolta.residuo_discorda === false,
    'a PRIMEIRA via ACUSOU o residuo (leu 40,00 contra 44,44 calculado); a segunda NAO acusa e tambem NAO afirma que bate');

chk('V4c', contaDaVolta.demais_centavos === contaOriginal.demais_centavos,
    'e mesmo sem o campo lido, o RESIDUO calculado e o mesmo - ele nao depende dele');

// ===========================================================================
// V5 - A DIVERGENCIA, quando ela existe, e nomeada
// ===========================================================================

const adulterada: LinhaGravada = { ...gravada, energia_g3_centavos: gravada.energia_g3_centavos + 1 };
const d = divergenciasDaSegundaVia(contaDaVolta, adulterada);
chk('V5a', d.length === 1 && d[0]!.includes('energia da G3'),
    'um centavo de diferenca na energia da G3 e acusado, e a mensagem diz QUAL parcela');
chk('V5b', d[0]!.includes('gravado') && d[0]!.includes('recalculado'),
    'e diz os DOIS numeros - quem le precisa saber de que lado esta o erro');

const tudoErrado = divergenciasDaSegundaVia(contaDaVolta, {
  ...gravada, integral_centavos: 1, desconto_centavos: 2, total_centavos: 3,
});
chk('V5c', tudoErrado.length === 3,
    'varias divergencias saem TODAS na mesma mensagem - consertar uma por vez seria tres viagens');

// ===========================================================================
// V6 - campos ausentes na linha nao viram "null" impresso
// ===========================================================================

const vazia = segundaViaDoRegistro({
  ...gravada,
  cliente_nome: null, cliente_documento: null, endereco: null, classificacao: null,
  data_emissao: null, leitura_anterior: null, leitura_atual: null,
  dias_faturados: null, vencimento: null, bandeira_tarifaria: null,
  linha_digitavel: null, pix_copia_e_cola: null, nosso_numero: null,
  instrucoes: [], historico_consumo: null,
});
chk('V6a', vazia.campos.cliente === '' && vazia.campos.endereco === '' && vazia.campos.vencimento === '',
    'coluna nula vira string VAZIA, e nao a palavra "null" impressa na folha do cliente');
chk('V6b', vazia.campos.dias_faturados === '' && vazia.campos.historico_consumo.length === 0,
    'numero nulo e historico ausente tambem - o grafico some em vez de desenhar vazio');
chk('V6c', vazia.boleto.linha_digitavel === '' && vazia.boleto.instrucoes.length === 0,
    'sem boleto gravado, a faixa volta vazia e a folha cai no Pix, como na primeira via');

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
