// SPEC-001 R7, R8, R9 - testes de documento. Puro, sem banco.
// Uso: node --experimental-strip-types tests/documento.ts

import {
  normalizar, validar, validarCPF, validarCNPJ, detectarTipo,
  ehAlfanumerico, classificar, podeAtivarContrato,
} from '../src/dominio/documento.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

// ---------------------------------------------------------------- D1 CNPJ real
// CNPJs publicos e conhecidos: se o caminho numerico estiver errado, cai aqui.
const REAIS = [
  ['00000000000191', 'Banco do Brasil 00.000.000/0001-91'],
  ['33000167000101', 'Petrobras 33.000.167/0001-01'],
  ['60746948000112', 'Bradesco 60.746.948/0001-12'],
] as const;
{
  const ruins = REAIS.filter(([d]) => !validarCNPJ(d)).map(([, n]) => n);
  chk('D1', ruins.length === 0, `CNPJs reais aceitos: ${REAIS.length - ruins.length}/${REAIS.length}${ruins.length ? ' — rejeitou ' + ruins.join(', ') : ''}`);
}

// ---------------------------------------------------------------- D2 DV errado
{
  const errado = '00000000000192';   // ultimo digito trocado
  chk('D2', !validarCNPJ(errado), `CNPJ com DV trocado rejeitado (${errado})`);
}

// ---------------------------------------------------------------- D3 equivalencia
// A GARANTIA que importa: o algoritmo alfanumerico REDUZ ao numerico quando
// todos os caracteres sao digitos. Se isso falhar, os CNPJs que ja existem
// param de validar em 31/07.
{
  const classico = (doc: string): boolean => {
    if (!/^\d{14}$/.test(doc)) return false;
    const dv = (base: string, pesos: number[]) => {
      const s = base.split('').reduce((a, c, i) => a + Number(c) * pesos[i], 0);
      const r = s % 11; return r < 2 ? 0 : 11 - r;
    };
    return Number(doc[12]) === dv(doc.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2])
        && Number(doc[13]) === dv(doc.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  };
  let divergencias = 0, testados = 0;
  for (let i = 0; i < 20000; i++) {
    const base = String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
    for (const dvs of [String(i % 100).padStart(2, '0')]) {
      const doc = base + dvs; testados++;
      if (validarCNPJ(doc) !== classico(doc)) divergencias++;
    }
  }
  chk('D3', divergencias === 0, `equivalencia com o algoritmo classico: ${testados} casos, ${divergencias} divergencia(s)`);
}

// ---------------------------------------------------------------- D4 alfanumerico
// Gera CNPJ alfanumerico calculando o DV pela regra da Receita e confere que o
// validador aceita. Ida e volta: se o calculo estiver errado, isto falha.
{
  const valorDe = (c: string) => c.charCodeAt(0) - 48;
  const dv = (chars: string, pesos: number[]) => {
    const s = chars.split('').reduce((a, c, i) => a + valorDe(c) * pesos[i], 0);
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  const alfabeto = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const gerados: string[] = [];
  for (let i = 0; i < 500; i++) {
    let base = '';
    for (let j = 0; j < 12; j++) base += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    const d1 = dv(base, [5,4,3,2,9,8,7,6,5,4,3,2]);
    const d2 = dv(base + String(d1), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
    gerados.push(base + String(d1) + String(d2));
  }
  const comLetra = gerados.filter(ehAlfanumerico);
  const aceitos = gerados.filter(validarCNPJ).length;
  chk('D4', aceitos === gerados.length,
      `CNPJ alfanumerico gerado pela regra da Receita: ${aceitos}/${gerados.length} aceitos (${comLetra.length} com letra)`);

  const corrompidos = gerados.map(d => d.slice(0, 13) + String((Number(d[13]) + 1) % 10));
  const passaram = corrompidos.filter(validarCNPJ).length;
  chk('D5', passaram === 0, `alfanumericos com DV corrompido: ${passaram} passaram (esp. 0)`);
}

// ---------------------------------------------------------------- D6 normalizacao
chk('D6', normalizar('12.ABC.345/01DE-35') === '12ABC34501DE35',
    `mascara removida e letras PRESERVADAS: ${normalizar('12.ABC.345/01DE-35')}`);
chk('D7', normalizar('12abc34501de35') === '12ABC34501DE35', 'minuscula vira maiuscula');
chk('D8', normalizar(null) === '' && normalizar(undefined) === '', 'nulo e undefined viram string vazia');

// ---------------------------------------------------------------- D9 CPF
chk('D9',  validarCPF('52998224725') && !validarCPF('52998224726'), 'CPF valido aceito e DV trocado rejeitado');
chk('D10', !validarCPF('11111111111') && !validarCPF('00000000000'),
    'CPF de digitos repetidos rejeitado (passa no modulo 11 e e placeholder)');
chk('D11', detectarTipo('52998224725') === 'cpf' && detectarTipo('00000000000191') === 'cnpj'
        && detectarTipo('123') === null, 'tipo por comprimento: 11=cpf, 14=cnpj, resto=null');
chk('D12', !validar('12ABC34501DE35'.slice(0, 11)), 'CPF nao aceita letra');

// ---------------------------------------------------------------- D13 R8
{
  const doCRM   = classificar('00.000.000/0001-91', 'crm_semente');
  const doLocal = classificar('00.000.000/0001-91', 'coleta_local');
  chk('D13', doCRM.digito_confere && doCRM.documento_validado === false,
      `R8: vindo do CRM, digito confere (${doCRM.digito_confere}) mas validado=${doCRM.documento_validado}. Semente nao e confirmacao`);
  chk('D14', doLocal.documento_validado === true, `R8: coleta local com digito correto -> validado=${doLocal.documento_validado}`);
}

// ---------------------------------------------------------------- D15 R9
{
  const invalido = classificar('00000000000192', 'coleta_local');
  chk('D15', invalido.documento === '00000000000192' && invalido.documento_validado === false,
      'R9: documento invalido e GRAVADO (nao bloqueia cadastro), com validado=false');
  chk('D16', !podeAtivarContrato(invalido) && podeAtivarContrato({ documento_validado: true }),
      'R9: invalido bloqueia contrato ativo; validado libera');
}

// ---------------------------------------------------------------- D17 vazio
{
  const v = classificar('   ', 'coleta_local');
  chk('D17', v.documento === null && v.documento_tipo === null && v.documento_origem === null,
      'documento em branco: tudo nulo, sem inventar origem');
}

console.log(`\n--- documento: 17 verificacoes, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
