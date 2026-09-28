// A UF DE UM CEP, pela faixa dos Correios. Puro, sem rede.
// Uso: node --experimental-strip-types tests/cep.ts
//
// O QUE ESTA SUITE PERSEGUE: o falso positivo. A tabela so serve se nunca acusar
// um CEP certo - uma guarda que recusa endereco bom ensina a pessoa a contornar
// a guarda. Por isso metade das verificacoes afirma que NAO ha divergencia, e as
// fronteiras entre faixas vizinhas sao conferidas dos dois lados.

import { FAIXAS_DE_CEP, ufDoCep, cepDeOutraUf } from '../src/dominio/cep.ts';
import { UFS } from '../src/dominio/planilha-enderecos.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

// ============================================================ C1 a tabela

{
  const ufs = Object.keys(FAIXAS_DE_CEP);
  chk('C1a', ufs.length === 27 && UFS.every((u) => ufs.includes(u)),
      `as 27 UFs tem faixa (${ufs.length})`);

  const todas = Object.values(FAIXAS_DE_CEP).flat().slice().sort((a, b) => a[0] - b[0]);
  const semSobreposicao = todas.every((f, i) => i === 0 || f[0] > todas[i - 1]![1]);
  chk('C1b', semSobreposicao, 'nenhuma faixa se sobrepoe a outra - um CEP nunca e de duas UFs');
  chk('C1c', todas.every(([de, ate]) => de <= ate && ate <= 99999999),
      'toda faixa tem inicio antes do fim, e cabe em oito digitos');
}

// ============================================================ C2 CEPs conhecidos

const conhecidos: Array<[string, string, string]> = [
  ['74825-110', 'GO', 'Goiania'],
  ['75955-000', 'GO', 'Indiara'],
  ['76360-000', 'GO', 'Itapaci'],
  ['76600-000', 'GO', 'Goias (a cidade)'],
  ['75698-899', 'GO', 'Caldas Novas, zona rural'],
  ['72870-000', 'GO', 'Valparaiso de Goias - o Entorno, no meio das faixas do DF'],
  ['73800-000', 'GO', 'Formosa - a segunda faixa de GO'],
  ['70040-000', 'DF', 'Brasilia'],
  ['73000-000', 'DF', 'a segunda faixa do DF'],
  ['76995-000', 'RO', 'Corumbiara - o CEP que a conta de Indiara imprimiu'],
  ['01001-000', 'SP', 'Sao Paulo, o zero a esquerda conta'],
  ['69300-000', 'RR', 'Boa Vista, entre as duas faixas do AM'],
  ['69400-000', 'AM', 'a segunda faixa do AM'],
  ['77000-000', 'TO', 'a fronteira de baixo do TO'],
];
for (const [cep, uf, onde] of conhecidos) {
  chk('C2', ufDoCep(cep) === uf, `${cep} e ${uf} - ${onde} (veio ${ufDoCep(cep)})`);
}

// ============================================================ C3 as fronteiras

chk('C3a', ufDoCep('72799999') === 'DF' && ufDoCep('72800000') === 'GO',
    'o ultimo CEP do DF e o primeiro do Entorno ficam cada um do seu lado');
chk('C3b', ufDoCep('76799999') === 'GO' && ufDoCep('76800000') === 'RO',
    'o ultimo de GO e o primeiro de RO tambem');

// ============================================================ C4 o que nao se acusa

chk('C4a', ufDoCep('78950000') === null,
    'um CEP fora de toda faixa (78900000-78999999, que ja foi de RO) devolve null - nao se chuta');
chk('C4b', ufDoCep('7482511') === null && ufDoCep('') === null && ufDoCep(null) === null,
    'CEP incompleto, vazio ou nulo devolve null');
chk('C4c', cepDeOutraUf('74825-110', 'GO') === null && cepDeOutraUf('74825110', 'go') === null,
    'CEP e UF que batem nao sao acusados - com mascara ou sem, UF em qualquer caixa');
chk('C4d', cepDeOutraUf('78950000', 'GO') === null,
    '⚠️ o CEP fora de toda faixa NAO e acusado: so se recusa o que e, com certeza, de outro estado');
chk('C4e', cepDeOutraUf('74825110', '') === null && cepDeOutraUf('74825110', null) === null,
    'sem UF nao ha com o que comparar - quem acusa a falta da UF e outra guarda');

// ============================================================ C5 o que se acusa

chk('C5a', cepDeOutraUf('76995-000', 'GO') === 'RO',
    'o CEP de Rondonia numa linha de Goias devolve "RO" - a UF a que ele pertence');
chk('C5b', cepDeOutraUf('70040000', 'GO') === 'DF',
    'e o de Brasilia numa linha de Goias devolve "DF"');

console.log();
if (falhas > 0) { console.log(`--- cep: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- cep (a UF de cada CEP, pela faixa dos Correios): ${feitas} verificacoes, 0 falhas`);
