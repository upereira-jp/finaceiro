/*
 * As duas sementes que o conector passou a receber do CRM em 20/08/2026:
 * o DOCUMENTO do cliente e a TARIFA digitada no card.
 *
 * PURO E SEM BANCO, de proposito. `tests/conector.ts` cobre o ciclo com
 * PostgreSQL real, e continua sendo onde a integracao se prova. O que esta aqui
 * sao as duas decisoes que nao dependem de linha nenhuma: o que vira semente e o
 * que e recusado. Regra 8 - invariante sem teste e comentario.
 *
 * Rodar: node --experimental-strip-types tests/crm-semente.ts
 */
import { sementeDeDocumento, tarifaDaSemente } from '../src/crm/sincronizacao.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ===========================================================================
// S1 - a semente do documento
// ===========================================================================

const cpf = sementeDeDocumento('529.982.247-25');
chk('S1a', cpf?.documento === '52998224725' && cpf?.documento_tipo === 'cpf',
    'CPF mascarado do CRM vira semente sem mascara, tipo cpf');

const cnpj = sementeDeDocumento('11.222.333/0001-81');
chk('S1b', cnpj?.documento === '11222333000181' && cnpj?.documento_tipo === 'cnpj',
    'CNPJ vira semente com 14 posicoes, tipo cnpj');

/* O CNPJ ALFANUMERICO e o caso que um validador so-digitos recusaria, e ele e
 * emitido desde 31/07/2026. Se esta cair, o conector voltou a rejeitar cadastro
 * legitimo de pessoa juridica. */
const alfa = sementeDeDocumento('12ABC34501DE35');
chk('S1c', alfa?.documento === '12ABC34501DE35' && alfa?.documento_tipo === 'cnpj',
    'CNPJ ALFANUMERICO (RFB desde 31/07/2026) vira semente com as letras intactas');

chk('S1d', sementeDeDocumento('12abc34501de35')?.documento === '12ABC34501DE35',
    'minuscula do CRM e maiusculizada aqui (a Receita emite em maiuscula)');

/* R9 - documento invalido NAO bloqueia cadastro, bloqueia ativacao de contrato.
 * A semente entra mesmo com o digito errado, porque a aba Clientes precisa
 * mostrar `digito_nao_confere` para alguem corrigir. Recusar aqui esconderia
 * que existe um numero para conferir. */
const dvErrado = sementeDeDocumento('52998224726');
chk('S1e', dvErrado?.documento === '52998224726',
    'R9: documento com DIGITO ERRADO ainda vira semente (quem recusa e a R9, no contrato)');

/* O que NAO tem forma de documento nao entra: gravar viraria lixo inconferivel e
 * ocuparia o indice unico a toa. */
chk('S1f', sementeDeDocumento('1133853') === null,
    'comprimento que nao e 11 nem 14 NAO vira semente');
chk('S1g', sementeDeDocumento(null) === null && sementeDeDocumento('') === null
        && sementeDeDocumento('   ') === null,
    'vazio/nulo nao vira semente');
chk('S1h', sementeDeDocumento('---.---.---/--') === null,
    'so pontuacao nao vira semente');

/* O tipo e RECALCULADO daqui, nunca copiado: um `documento_tipo` que discorde do
 * proprio `documento` nao tem como existir. */
const tipoMentiroso = sementeDeDocumento('52998224725', 'cnpj');
chk('S1i', tipoMentiroso?.documento_tipo === 'cpf',
    'tipo vindo errado do CRM e IGNORADO: 11 posicoes e cpf, ponto');

// ===========================================================================
// S2 - qual das duas tarifas vira semente
// ===========================================================================

chk('S2a', tarifaDaSemente('1.160000', '1.159997') === '1.160000',
    'a DIGITADA vence a derivada — e este e o caso da rodada 9 (o residuo perde)');

chk('S2b', tarifaDaSemente(null, '1.130000') === '1.130000',
    'sem digitada, a derivada ainda serve (nao regride quem ja funcionava)');

chk('S2c', tarifaDaSemente(null, null) === null && tarifaDaSemente('', '') === null,
    'sem nenhuma das duas, nao ha semente');

chk('S2d', tarifaDaSemente('  1.180000  ', null) === '1.180000',
    'espaco em volta nao vira tarifa diferente');

/* O CHECK `uc_tarifa_na_ordem_de_grandeza` recusa acima de 10 com 23514, e um
 * 23514 no meio de um `createMany` derruba o LOTE inteiro. Uma tarifa absurda
 * digitada no CRM tem de cair na derivada, nao explodir o ciclo. */
chk('S2e', tarifaDaSemente('1130.000000', '1.130000') === '1.130000',
    'tarifa digitada fora da ordem de grandeza (>10) CAI NA DERIVADA em vez de derrubar o lote');
chk('S2f', tarifaDaSemente('1130.000000', null) === null,
    'digitada absurda e sem derivada = sem semente (nunca um 23514)');
chk('S2g', tarifaDaSemente('0', '1.130000') === '1.130000' && tarifaDaSemente('-1', null) === null,
    'zero e negativo nao sao tarifa');

/* A tarifa e texto do inicio ao fim: virar `number` aqui perderia casa decimal
 * num numero que multiplica todo kWh de toda fatura (regra 1). */
chk('S2h', typeof tarifaDaSemente('1.160000', null) === 'string'
        && tarifaDaSemente('1.160000', null) === '1.160000',
    'a tarifa atravessa como TEXTO, com as seis casas preservadas (regra 1)');

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
