// BR CODE - o Pix copia e cola e o conteudo do QR estatico. Puro, sem banco.
// Uso: node --experimental-strip-types tests/brcode.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e por que elas existem antes de qualquer tela.
//
// Um BR Code com CRC errado e RECUSADO pelo aplicativo do banco: barulhento, o
// cliente reclama, ninguem perde dinheiro. Um BR Code com a chave ou o valor
// errados e o CRC certo e ACEITO: o cliente paga, e o dinheiro vai para o lugar
// errado. O segundo e silencioso, e num Pix ESTATICO nao ha `txid` por fatura
// para conciliar depois - a `Q-DOCFATURA-01` decidiu isso com o custo declarado.
//
// O VETOR CONHECIDO E O TESTE QUE IMPORTA MAIS. `crc16` da familia CCITT tem meia
// duzia de variantes que diferem por reflexao e XOR final, e todas produzem
// numeros plausiveis. Sem um valor de referencia externo, este arquivo provaria
// apenas que a implementacao concorda consigo mesma - e a hora de descobrir que
// e a variante errada seria no celular de quem ia pagar.

import {
  crc16, campo, valorParaBrCode, apenasAscii, pixEstatico, crcConfere, normalizarBrCode, BrCodeInvalido,
} from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ------------------------------------- P1 o CRC, contra referencias EXTERNAS
{
  // Vetor canonico do CRC16/CCITT-FALSE, publicado e independente desta
  // implementacao: "123456789" -> 0x29B1.
  chk('P1', crc16('123456789') === '29B1',
      'vetor canonico CCITT-FALSE: "123456789" -> 29B1 (poli 0x1021, inicial 0xFFFF, sem reflexao)');

  /*
   * SEGUNDA IMPLEMENTACAO, INDEPENDENTE, e por que ela esta aqui.
   *
   * A primeira versao deste teste afirmava um "payload de exemplo do Manual do
   * BACEN" com o CRC `2CA5`. Eu tinha reconstruido as duas coisas de memoria, e
   * falhou. Ajustar o esperado para o que o codigo devolve teria transformado a
   * verificacao em tautologia - ela passaria com o algoritmo errado.
   *
   * O que substitui e mais forte que a citacao que eu nao tinha: uma segunda
   * implementacao, TABELADA em vez de bit a bit, escrita a partir da definicao e
   * nao a partir do outro codigo. Duas formulacoes diferentes concordando pegam
   * erro de implementacao; o vetor publicado do P1 (0x29B1) e o que prende a
   * VARIANTE. As duas coisas juntas cobrem os dois modos de errar.
   */
  const crcTabelado = (s: string): string => {
    const tabela = Array.from({ length: 256 }, (_, n) => {
      let c = n << 8;
      for (let k = 0; k < 8; k++) c = (c & 0x8000) !== 0 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
      return c;
    });
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc = (tabela[((crc >> 8) ^ s.charCodeAt(i)) & 0xff] ^ ((crc << 8) & 0xffff)) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  };

  const amostras = [
    '123456789', '', '0',
    '00020101021126360014br.gov.bcb.pix0114financeiro@g3.com52040000',
    '5303986540610.005802BR5908G3 SOLAR6007GOIANIA62070503***6304',
    'A'.repeat(200), 'aA*0 .@-',
  ];
  chk('P1b', amostras.every((s) => crc16(s) === crcTabelado(s)),
      'duas implementacoes independentes (bit a bit e TABELADA) concordam em 7 amostras, inclusive vazia e de 200 caracteres');

  chk('P1c', crc16('') === 'FFFF',
      'string vazia devolve o valor inicial - prende que nao ha XOR final escondido');
}

// ------------------------------------------- P2 o TLV: `IITTvalor`, e os limites
{
  chk('P2', campo('00', '01') === '000201',
      'campo simples: id 00, tamanho 02, valor 01');
  chk('P2b', campo('59', 'G3 SOLAR') === '5908G3 SOLAR',
      'o tamanho conta CARACTERES do valor, com dois digitos');
  chk('P2c', campo('05', '***') === '0503***',
      'o txid "sem identificador" do padrao');

  let levantou = false;
  try { campo('5', 'x'); } catch (e) { levantou = e instanceof BrCodeInvalido; }
  chk('P2d', levantou, 'id de um digito LEVANTA - um id torto desloca a leitura do resto do payload');

  levantou = false;
  try { campo('59', 'x'.repeat(100)); } catch (e) { levantou = e instanceof BrCodeInvalido; }
  chk('P2e', levantou,
      'valor de 100 caracteres LEVANTA: o tamanho tem dois digitos, e "100" seria lido como 10 + o caractere 0');
}

// ------------------------------------------ P3 o valor, por texto (regra 1)
{
  chk('P3', valorParaBrCode(123456) === '1234.56',
      'centavos viram reais com PONTO, que e o que o padrao pede');
  chk('P3b', valorParaBrCode(8) === '0.08' && valorParaBrCode(0) === '0.00',
      'oito centavos e "0.08" - nao perde o zero e nao vira "0.8"');
  chk('P3c', valorParaBrCode(815) === '8.15' && valorParaBrCode(2299999) === '22999.99',
      'os valores onde `c / 100` sujaria em float saem exatos: a conversao e por STRING');

  let levantou = false;
  try { valorParaBrCode(-1); } catch (e) { levantou = e instanceof BrCodeInvalido; }
  chk('P3d', levantou, 'valor negativo LEVANTA - nao existe cobranca de valor negativo');

  levantou = false;
  try { valorParaBrCode(10.5); } catch (e) { levantou = e instanceof BrCodeInvalido; }
  chk('P3e', levantou,
      'valor NAO inteiro LEVANTA: quem passou 10.5 pensou em reais, e o contrato aqui e centavos');
}

// --------------------------------------------- P4 normalizacao de nome e cidade
{
  chk('P4', apenasAscii('João Conceição', 25) === 'JOAO CONCEICAO',
      'acento sai por decomposicao, nao por tabela de substituicao');
  chk('P4b', apenasAscii('Aparecida de Goiânia', 15) === 'APARECIDA DE GO',
      'cidade e cortada em 15, que e o limite do campo 60');
  chk('P4c', apenasAscii('  G3 Solar  ', 25) === 'G3 SOLAR',
      'espaco nas pontas sai');
  chk('P4d', apenasAscii('G3 ☀ Solar', 25) === 'G3  SOLAR',
      'emoji e simbolo fora do ASCII imprimivel saem - eles quebrariam o CRC por byte');
}

// ------------------------------------------- P5 o payload inteiro, com valor
{
  const brc = pixEstatico({
    chave: 'financeiro@g3solar.com.br',
    recebedorNome: 'G3 Solar',
    recebedorCidade: 'Goiania',
    valorCentavos: 81244,
  });

  chk('P5', brc.startsWith('000201010211'),
      'comeca com versao 01 e "estatico" (010211) - um QR de uso unico num documento que a pessoa guarda seria pior que nenhum');
  chk('P5b', brc.includes('0014br.gov.bcb.pix'),
      'o GUI obrigatorio esta no campo 26 aninhado');
  chk('P5c', brc.includes('5303986'),
      'moeda 986 (BRL)');
  // 81244 centavos e R$ 812,44 - a primeira versao deste teste esperava
  // "8124.44", que e a mesma cifra com a virgula no lugar errado. O codigo estava
  // certo; a expectativa, nao. Por isso o tamanho (06) entra na verificacao: ele
  // muda quando a casa decimal escorrega.
  chk('P5d', brc.includes('5406812.44'),
      'o valor entra como "812.44" com tamanho 06 - 81244 centavos, sem arredondar');
  chk('P5e', brc.includes('5802BR') && brc.includes('5908G3 SOLAR') && brc.includes('6007GOIANIA'),
      'pais, nome e cidade nos campos 58, 59 e 60');
  chk('P5f', crcConfere(brc),
      'e o CRC do payload montado fecha - conferido pela funcao que le, nao pela que escreve');
  chk('P5g', brc.slice(-8, -4) === '6304',
      'o CRC vem no fim, precedido por 6304, e e sobre a string JA com esse literal');
}

// ----------------------------------- P6 o QR sem valor NAO e o QR com valor zero
{
  const semValor = pixEstatico({
    chave: '52998224725', recebedorNome: 'G3 Solar', recebedorCidade: 'Goiania', valorCentavos: null,
  });
  chk('P6', !semValor.includes('5400') && !/54\d\d0\.00/.test(semValor),
      'sem valor o campo 54 e OMITIDO - mandar "0.00" faria o aplicativo cobrar zero em vez de perguntar');
  chk('P6b', crcConfere(semValor),
      'e o CRC fecha igual: omitir campo muda a string inteira, entao o CRC tem de ser recalculado');
}

// ------------------------------ P7 o que muda o dinheiro TEM de mudar o codigo
{
  const base = { recebedorNome: 'G3 Solar', recebedorCidade: 'Goiania', valorCentavos: 10000 };
  const a = pixEstatico({ ...base, chave: 'a@g3.com' });
  const b = pixEstatico({ ...base, chave: 'b@g3.com' });
  const c = pixEstatico({ ...base, chave: 'a@g3.com', valorCentavos: 10001 });

  chk('P7', a !== b, 'trocar a CHAVE muda o payload - o destino do dinheiro esta dentro dele');
  chk('P7b', a !== c, 'um centavo de diferenca muda o payload');
  chk('P7c', a.slice(-4) !== c.slice(-4),
      'e muda o CRC: o codigo nao pode ficar valido para dois valores diferentes');
  chk('P7d', pixEstatico({ ...base, chave: 'a@g3.com' }) === a,
      'e a montagem e DETERMINISTA - mesma entrada, mesmo codigo, sem timestamp nem aleatorio dentro');
}

// --------------------------------------- P8 o que nao pode gerar codigo nenhum
{
  const base = { recebedorNome: 'G3 Solar', recebedorCidade: 'Goiania', valorCentavos: 100 };
  const levanta = (f: () => unknown) => {
    try { f(); return false; } catch (e) { return e instanceof BrCodeInvalido; }
  };
  chk('P8', levanta(() => pixEstatico({ ...base, chave: '   ' })),
      'chave vazia LEVANTA em vez de gerar um QR que ninguem consegue pagar');
  chk('P8b', levanta(() => pixEstatico({ ...base, chave: 'x'.repeat(78) })),
      'chave acima de 77 caracteres LEVANTA - e o limite do padrao');
  chk('P8c', levanta(() => pixEstatico({ ...base, chave: 'a@g3.com', recebedorNome: '☀☀' })),
      'nome que fica VAZIO depois de normalizar LEVANTA - o campo 59 e obrigatorio');
  chk('P8d', levanta(() => pixEstatico({ ...base, chave: 'a@g3.com', recebedorCidade: '' })),
      'cidade vazia LEVANTA - o campo 60 e obrigatorio');
}

// --------------------------------------------- P9 o `crcConfere`, nos dois lados
{
  const brc = pixEstatico({
    chave: 'a@g3.com', recebedorNome: 'G3', recebedorCidade: 'Goiania', valorCentavos: 100,
  });
  chk('P9', crcConfere(brc) === true, 'codigo bom confere');
  chk('P9b', crcConfere(`${brc.slice(0, -1)}0`) === false,
      'trocar um digito do CRC e detectado');
  chk('P9c', crcConfere(brc.replace('5303986', '5303840')) === false,
      'trocar a MOEDA no meio do payload e detectado pelo CRC do fim');
  chk('P9d', crcConfere('lixo') === false,
      'texto que nao e BR Code nao confere, e nao levanta');
}

// ------------------------------ P10 o payload COLADO DE FORA, e o defeito de 17/08
//
// Tres lugares do sistema limpavam BR Code vindo de fora com
// `.replace(/\s+/g, '')`. O nome do beneficiario (campo 59) e a cidade (60) tem
// espaco de verdade dentro: `5910G3 SOLAR` virava `5910G3SOLAR`, um campo que
// declara 10 caracteres e entrega 9. O CRC quebrava junto, e ninguem via - o QR
// era desenhado assim mesmo e so o aplicativo do banco recusava, na mao do
// cliente. `normalizarBrCode` poe o CRC para decidir em vez do palpite.
{
  const comEspaco = pixEstatico({
    chave: 'a@g3.com', recebedorNome: 'G3 SOLAR ENERGIA', recebedorCidade: 'RIO VERDE',
    valorCentavos: 59669,
  });
  chk('P10', crcConfere(comEspaco) && comEspaco.includes('G3 SOLAR ENERGIA'),
      'PRE-CONDICAO: um beneficiario de nome composto produz payload integro COM espaco dentro');
  chk('P10b', crcConfere(comEspaco.replace(/\s+/g, '')) === false,
      'e a limpeza antiga o QUEBRAVA - e este e o defeito, medido');

  chk('P10c', normalizarBrCode(comEspaco) === comEspaco,
      'o payload que ja confere volta INTACTO: nada a normalizar');
  chk('P10d', normalizarBrCode(`  ${comEspaco}\n`) === comEspaco,
      'espaco das pontas sai - e o que sobra do "selecionar tudo"');
  chk('P10e', normalizarBrCode(`${comEspaco.slice(0, 40)}\n${comEspaco.slice(40)}`) === comEspaco,
      'quebra de linha no meio e desfeita, e o espaco do nome sobrevive');
  chk('P10f', normalizarBrCode(`${comEspaco.slice(0, 40)}\n    ${comEspaco.slice(40)}`) === comEspaco,
      'quebra COM indentacao tambem - e o formato de quem copia de um PDF de duas colunas');

  const semEspaco = pixEstatico({
    chave: 'a@g3.com', recebedorNome: 'G3SOLAR', recebedorCidade: 'GOIANIA', valorCentavos: 1,
  });
  const sujo = semEspaco.split('').join(' ');
  chk('P10g', normalizarBrCode(sujo) === semEspaco,
      'e o caso legado ainda funciona: payload sem espaco legitimo, sujo de espacos, e recuperado');

  const roto = `${comEspaco.slice(0, -4)}0000`;
  chk('P10h', normalizarBrCode(roto) === roto,
      'o que nao fecha em NENHUM candidato volta como veio - nao se inventa um sexto texto');
  chk('P10i', normalizarBrCode('') === '' && normalizarBrCode(null) === '',
      'vazio e nulo viram string vazia, e nao passam pelo CRC');
}

console.log();
if (falhas > 0) { console.log(`--- brcode: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- brcode (Pix estatico): 44 verificacoes, 0 falhas');
