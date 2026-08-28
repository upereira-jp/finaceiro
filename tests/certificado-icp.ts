// O TITULAR DE UM CERTIFICADO ICP-BRASIL, lido do subject.
// Uso: node --experimental-strip-types tests/certificado-icp.ts
//
// ESTA SUITE E UM REGISTRO DE BUG, e a verificacao C1 e o bug inteiro.
//
// Em 27/08/2026 o A1 de verdade da G3 passou pela conferencia pela primeira vez
// e ela ACUSOU o certificado certo de ser de outra empresa. A leitura pegava os
// primeiros catorze digitos do subject, e o primeiro CNPJ de um subject do
// ICP-Brasil e o da AUTORIDADE que emitiu, nao o do titular.
//
// O subject de C1 e o real, copiado da saida do `openssl x509 -subject` daquele
// certificado - com o CNPJ da AR na frente e o do titular no fim. Enquanto C1
// passar, aquele defeito nao volta.

import { titularDoSubject } from '../src/dominio/certificado-icp.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

/** O subject REAL do A1 da G3, medido em 27/08/2026. Nao editar: o valor deste
 *  teste esta em ele ser o caso que quebrou. */
const SUBJECT_G3 =
  'C = BR, ST = GO, L = GOIANIA, O = ICP-Brasil, OU = videoconferencia, ' +
  'OU = 32888787000166, OU = Pessoa Juridica A1, OU = ARPROTEGECD, ' +
  'OU = Autoridade Certificadora DIGITAL CERTY, ' +
  'CN = CONSORCIO G3 GESTAO DE ENERGIA SOLAR:66714022000121';

{
  const t = titularDoSubject(SUBJECT_G3);
  chk('C1a', t.documento === '66714022000121',
      'o CNPJ e o do CN (a G3), e NAO o 32888787000166 do OU - que e a AR emissora e vem ANTES no subject');
  chk('C1b', t.nome === 'CONSORCIO G3 GESTAO DE ENERGIA SOLAR',
      'o nome sai limpo, sem o documento grudado e sem o resto do subject');
  chk('C1c', t.tipo === 'cnpj' && t.valido,
      'tipo reconhecido e digitos verificadores fechando');
  chk('C1d', !SUBJECT_G3.slice(0, SUBJECT_G3.indexOf('CN =')).includes(t.documento!),
      'e a prova de que o caso e armadilha mesmo: o documento do titular NAO aparece em nenhum lugar antes do CN');
}

{
  // e-CPF: mesma gramatica, 11 digitos.
  const t = titularDoSubject('O = ICP-Brasil, OU = Pessoa Fisica A1, CN = JOAO DA SILVA:11144477735');
  chk('C2a', t.tipo === 'cpf' && t.documento === '11144477735' && t.valido,
      'e-CPF tambem e lido - 11 digitos viram cpf');
  chk('C2b', t.nome === 'JOAO DA SILVA', 'e o nome da pessoa sai sem o CPF');
}

{
  // Razao social COM virgula. O corte e no proximo campo de verdade
  // (", SIGLA = "), nunca em qualquer virgula - senao o nome vem truncado.
  const t = titularDoSubject('O = ICP-Brasil, CN = ALFA COMERCIO, IMPORTACAO E LTDA:66714022000121');
  chk('C3a', t.nome === 'ALFA COMERCIO, IMPORTACAO E LTDA',
      'virgula DENTRO da razao social nao corta o nome ao meio');
  chk('C3b', t.documento === '66714022000121', 'e o documento continua sendo achado depois dela');
}

{
  const t = titularDoSubject('O = ICP-Brasil, CN = SEM DOCUMENTO NENHUM');
  chk('C4a', t.documento === null && t.tipo === null,
      'CN sem dois-pontos nao inventa documento');
  chk('C4b', t.nome === 'SEM DOCUMENTO NENHUM', 'e devolve o CN inteiro como nome');

  const vazio = titularDoSubject('O = ICP-Brasil, OU = 32888787000166');
  chk('C4c', vazio.documento === null && vazio.nome === '',
      'subject SEM CN devolve vazio - e nao o CNPJ da autoridade, que e o erro que originou este arquivo');

  chk('C4d', titularDoSubject(null).documento === null && titularDoSubject('').documento === null,
      'nulo e vazio nao estouram');
}

{
  // CNPJ alfanumerico (2026). `replace(/\D/g,'')` teria destruido isto calado.
  const t = titularDoSubject('CN = EMPRESA NOVA:12ABC34501DE35');
  chk('C5a', t.documento === '12ABC34501DE35' && t.tipo === 'cnpj',
      'CNPJ alfanumerico sobrevive: a normalizacao tira mascara, nao letra');

  const errado = titularDoSubject('CN = EMPRESA X:66714022000199');
  chk('C5b', errado.documento === '66714022000199' && !errado.valido,
      'digito verificador que nao fecha e REPORTADO como invalido, e nao descartado - quem le decide');
}

console.log(falhas === 0 ? '\nTODAS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
