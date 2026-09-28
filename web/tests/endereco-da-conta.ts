// O ENDERECO DA CONTA VIRANDO OS SETE CAMPOS. Puro, sem DOM e sem banco.
// Uso: node --experimental-strip-types web/tests/endereco-da-conta.ts
//
// ============================================================================
// O QUE ESTA SUITE PERSEGUE, e ela persegue o ERRO e nao o acerto
//
// A regra que ela mede nunca foi exercida contra uma conta de verdade: em
// 10/09/2026 a producao tinha ZERO contas lidas gravadas, entao ninguem sabe
// qual string o leitor de visao produz numa fatura real da Equatorial.
//
// Por isso o valor destas verificacoes nao esta em "acertou o endereco": esta em
// **nunca preencher errado**. Um bairro em branco alguem ve e digita; um bairro
// ERRADO vai impresso no boleto do cliente, e ninguem confere um campo que
// parece preenchido. Metade das verificacoes abaixo afirma um VAZIO.
//
// Quando a primeira conta real for lida, o jeito de fechar isto e pegar a string
// que veio e acrescentar um caso aqui.

import {
  separarEndereco, separarBlocoDaEquatorial, avisoDoCepDaConta,
  completarVazios, acharCep, acharUf, faltamNaProposta, VAZIO,
} from '../src/endereco-da-conta.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

// ============================================================ E1 o CEP

chk('E1', acharCep('RUA X, 930, SETOR BUENO, GOIANIA - GO, 74210-030') === '74210-030',
    'o CEP com hifen sai como veio');
chk('E1b', acharCep('... GOIANIA GO 74210030') === '74210-030',
    'e o CEP sem hifen ganha o hifen — e o formato que a Sicoob recebe');
chk('E1c', acharCep('CEP: 74.210-030') === '74210-030',
    'com ponto e com a palavra CEP na frente tambem');
chk('E1d', acharCep('RUA 25 DE MARCO, 1200, CENTRO') === '',
    'e uma linha SEM CEP devolve vazio — nao ha CEP para inventar a partir de "1200"');

// ============================================================ E2 a UF

chk('E2', acharUf('GOIANIA - GO') === 'GO', 'a UF isolada e reconhecida');
chk('E2b', acharUf('GOIANIA') === '',
    '⚠️ e "GO" DENTRO de "GOIANIA" nao vira UF — sem a fronteira de palavra, quase toda '
    + 'linha de Goias produziria uma UF por acidente, e ela iria impressa no boleto');
chk('E2c', acharUf('SAO LUIS DO MARANHAO') === '',
    'nem "MA" dentro de "MARANHAO"');
chk('E2d', acharUf('RUA DAS ACACIAS, 148, SETOR BUENO, GOIANIA/GO') === 'GO',
    'a barra tambem separa');

// ============================================================ E3 o caso completo

{
  const e = separarEndereco('RUA T-55, 930, SETOR BUENO, GOIANIA - GO, 74210-030');
  chk('E3', e.endereco_logradouro === 'RUA T-55', `logradouro (veio "${e.endereco_logradouro}")`);
  chk('E3b', e.endereco_numero === '930', `numero (veio "${e.endereco_numero}")`);
  chk('E3c', e.endereco_bairro === 'SETOR BUENO', `bairro (veio "${e.endereco_bairro}")`);
  chk('E3d', e.endereco_municipio === 'GOIANIA', `municipio (veio "${e.endereco_municipio}")`);
  chk('E3e', e.endereco_uf === 'GO' && e.endereco_cep === '74210-030', 'UF e CEP');
  chk('E3f', faltamNaProposta(e).length === 0,
      'e os cinco que a Sicoob exige saem preenchidos — este e o caso que faz o botao valer');
}

{
  /* O numero colado no logradouro, sem virgula, e com "nº". Os dois sao comuns
   * em conta de distribuidora. */
  const e = separarEndereco('AV. ANHANGUERA Nº 1200 - CENTRO - ANAPOLIS - GO - 75000-000');
  chk('E3g', e.endereco_logradouro === 'AV. ANHANGUERA' && e.endereco_numero === '1200',
      `"Nº" e o hifen como separador (veio "${e.endereco_logradouro}" / "${e.endereco_numero}")`);
  chk('E3h', e.endereco_bairro === 'CENTRO' && e.endereco_municipio === 'ANAPOLIS',
      `bairro e municipio (veio "${e.endereco_bairro}" / "${e.endereco_municipio}")`);
}

chk('E3i', separarEndereco('RUA DAS FLORES, S/N, JARDIM AMERICA, GOIANIA-GO').endereco_numero === 'S/N',
    '"S/N" conta como numero informado — e o que a propria tela manda digitar quando nao ha');

// ============================================================ E4 o que NAO se chuta
//
// A metade que importa. Cada uma destas afirma um VAZIO, e cada vazio e um campo
// que alguem vai olhar e preencher — em vez de um campo errado que ninguem
// confere porque parece pronto.

{
  const e = separarEndereco('RUA X, 100, CENTRO');
  chk('E4', e.endereco_bairro === 'CENTRO' && e.endereco_municipio === '',
      '⚠️ com UM pedaco depois do logradouro, so o bairro e preenchido: nada na linha diz se '
      + '"CENTRO" e bairro ou municipio, e por o bairro no lugar do municipio manda o boleto '
      + 'para a cidade errada');
  chk('E4b', faltamNaProposta(e).join(', ') === 'município, UF, CEP',
      `e a tela consegue DIZER o que faltou (veio: ${faltamNaProposta(e).join(', ')})`);
}

chk('E4c', separarEndereco('').endereco_logradouro === ''
        && separarEndereco(null).endereco_cep === ''
        && separarEndereco(undefined).endereco_uf === '',
    'linha vazia, nula ou ausente devolve os sete campos vazios, e nao um estouro');

{
  const e = separarEndereco('ENDERECO NAO INFORMADO');
  chk('E4d', e.endereco_cep === '' && e.endereco_uf === '' && e.endereco_municipio === '',
      'uma linha que nao e endereco nenhum nao produz CEP, UF nem municipio');
}

chk('E4e', separarEndereco('RUA X, 100, BAIRRO Y, CIDADE Z').endereco_complemento === '',
    'o complemento NUNCA e adivinhado: ele e opcional para o boleto, entao errar nele nao '
    + 'paga o risco de tirar um pedaco que era o bairro');

// ============================================================ E6 a conta da Equatorial
//
// 28/09/2026: a primeira medicao contra conta de verdade. O bloco de endereco
// de 18 contas da Equatorial em PDF passou por `separarEndereco`, e a leitura
// posicional errou nas 18 - `Q. 91` virava bairro, `GOIANIA BRASIL` virava
// municipio, o `S/N` se perdia e "RUA 1044" virava "RUA" numero "1044".
//
// Os enderecos abaixo sao INVENTADOS. A FORMA e copiada das contas: tres linhas,
// quadra e lote depois da rua, traco solto no lugar de campo vazio, e o rabo
// `CEP: <oito digitos> <MUNICIPIO> <UF> BRASIL`.

const EQ_APTO = [
  'RUA 1010, Q. 12, L. 3/4, S/N, APART - 201, COND - ED EXEMPLO, - - 16',
  'SETOR PEDRO LUDOVICO',
  'CEP: 74825110 GOIANIA GO BRASIL',
];
const EQ_CASA = ['RUA T-99, Q. 22, L. 6, S/N, - CASA 1', 'VILA ALVORADA', 'CEP: 74315610 GOIANIA GO BRASIL'];
const EQ_SIMPLES = ['RUA JAVAES, Q. 5, L. 16, S/N', 'CONJUNTO ANHANGUERA', 'CEP: 74850600 GOIANIA GO BRASIL'];

{
  const e = separarEndereco(EQ_APTO.join('\n'));
  chk('E6', e.endereco_logradouro === 'RUA 1010' && e.endereco_numero === 'S/N',
      `⚠️ "RUA 1010" continua inteiro e o S/N e o numero (veio "${e.endereco_logradouro}" / "${e.endereco_numero}")`);
  chk('E6b', e.endereco_bairro === 'SETOR PEDRO LUDOVICO',
      `⚠️ o bairro e a linha do meio, e NAO a quadra (veio "${e.endereco_bairro}")`);
  chk('E6c', e.endereco_municipio === 'GOIANIA' && e.endereco_uf === 'GO' && e.endereco_cep === '74825-110',
      `municipio, UF e CEP saem do rabo, sem o "BRASIL" (veio "${e.endereco_municipio}" ${e.endereco_uf} ${e.endereco_cep})`);
  chk('E6d', e.endereco_complemento === 'Q. 12, L. 3/4, APART 201, COND ED EXEMPLO, 16',
      `a quadra, o lote e o apartamento vao para o complemento, sem os tracos soltos (veio "${e.endereco_complemento}")`);
  chk('E6e', faltamNaProposta(e).length === 0, 'e os cinco que a Sicoob exige saem preenchidos');
}

{
  const e = separarEndereco(EQ_CASA.join(', '));
  chk('E6f', e.endereco_bairro === 'VILA ALVORADA' && e.endereco_municipio === 'GOIANIA'
              && e.endereco_complemento === 'Q. 22, L. 6, CASA 1',
      `com as linhas juntadas por VIRGULA a fronteira do bairro continua existindo (veio "${e.endereco_bairro}")`);
}

{
  /* O CASO QUE NAO SE CHUTA: juntadas por ESPACO, "- CASA 1 VILA ALVORADA" nao
   * diz onde acaba o complemento e comeca o bairro. */
  const e = separarEndereco(EQ_CASA.join(' '));
  chk('E6g', e.endereco_bairro === '' && e.endereco_municipio === 'GOIANIA' && e.endereco_cep === '74315-610',
      `⚠️ juntada por espaco com complemento, o bairro fica VAZIO - e o resto continua certo (veio "${e.endereco_bairro}")`);
  chk('E6h', faltamNaProposta(e).join(', ') === 'bairro',
      `e a tela diz que falta o bairro (veio: ${faltamNaProposta(e).join(', ')})`);

  const s = separarEndereco(EQ_SIMPLES.join(' '));
  chk('E6i', s.endereco_bairro === 'CONJUNTO ANHANGUERA' && s.endereco_numero === 'S/N',
      `mas sem complemento o S/N marca a fronteira, e o bairro sai (veio "${s.endereco_bairro}")`);
}

{
  /* A primeira linha longa quebra em duas na conta. */
  const e = separarEndereco([
    'RUA FULANO DE TAL, Q. 19, L. 15, S/N, APART - 102 BLOCO G, - COND.',
    'RESIDENCIAL EXEMPLO', 'SOLANGE PARK', 'CEP: 74484180 GOIANIA GO BRASIL',
  ].join('\n'));
  chk('E6j', e.endereco_bairro === 'SOLANGE PARK'
              && e.endereco_complemento === 'Q. 19, L. 15, APART 102 BLOCO G, COND. RESIDENCIAL EXEMPLO',
      `a linha partida volta a ser uma, e o bairro continua sendo a ultima (veio "${e.endereco_bairro}" / "${e.endereco_complemento}")`);
}

{
  const e = separarEndereco(['RUA 09, Q. 5, L. 15, N. 315, - CASA 1', 'VILA DONA AUTA', 'CEP: 75902030 RIO VERDE GO BRASIL'].join('\n'));
  chk('E6k', e.endereco_numero === '315' && e.endereco_municipio === 'RIO VERDE',
      `"N. 315" e o numero, e municipio de duas palavras sai inteiro (veio "${e.endereco_numero}" / "${e.endereco_municipio}")`);

  const semPais = separarBlocoDaEquatorial(EQ_SIMPLES.join('\n').replace(' BRASIL', ''));
  chk('E6l', semPais?.endereco_bairro === 'CONJUNTO ANHANGUERA' && semPais.endereco_municipio === 'GOIANIA',
      'sem o "BRASIL" no fim a forma continua reconhecida - o que a identifica e o CEP ANTES da cidade');
  chk('E6m', separarBlocoDaEquatorial('RUA T-55, 930, SETOR BUENO, GOIANIA - GO, 74210-030') === null,
      'e a linha no formato generico (CEP no fim) NAO e tomada por bloco da Equatorial');
}

// ============================================================ E7 o CEP de outro estado
//
// Medido na mesma leva: uma conta de Indiara (GO) imprime "CEP: 76995000", e
// 76995000 e de Rondonia.

{
  const linha = ['RUA BEIJA-FLOR, Q. 14, L. 3, S/N', 'SITIOS DE RECREIO', 'CEP: 76995000 INDIARA GO BRASIL'].join('\n');
  const e = separarEndereco(linha);
  chk('E7', e.endereco_cep === '' && e.endereco_municipio === 'INDIARA' && e.endereco_bairro === 'SITIOS DE RECREIO',
      `⚠️ o CEP de Rondonia numa conta de Goias sai em BRANCO, e o resto do endereco sai (veio cep "${e.endereco_cep}")`);
  chk('E7b', faltamNaProposta(e).join(', ') === 'CEP',
      'e a tela diz que falta o CEP, em vez de oferecer um boleto com dois estados');
  const aviso = avisoDoCepDaConta(linha) ?? '';
  chk('E7c', aviso.includes('76995-000') && aviso.includes('RO') && aviso.includes('GO'),
      `e diz por que: o CEP, o estado dele e o da cidade (veio: ${aviso.slice(0, 60)}...)`);
  chk('E7d', avisoDoCepDaConta(EQ_APTO.join('\n')) === null && avisoDoCepDaConta('') === null,
      'a conta com CEP certo, ou sem nada, nao gera aviso');
  chk('E7e', separarEndereco('RUA X, 100, CENTRO, INDIARA - GO, 76995-000').endereco_cep === '',
      'a mesma conferencia vale na leitura generica');
}

// ============================================================ E8 quadra e lote nunca sao bairro

{
  const e = separarEndereco('RUA X, Q. 5, L. 16, S/N, SETOR BUENO, GOIANIA - GO, 74210-030');
  chk('E8', e.endereco_bairro === 'SETOR BUENO' && e.endereco_municipio === 'GOIANIA',
      `na leitura generica, quadra e lote saem da conta posicional (veio "${e.endereco_bairro}" / "${e.endereco_municipio}")`);
  chk('E8b', e.endereco_numero === 'S/N',
      `e o S/N que estava depois deles ainda e o numero (veio "${e.endereco_numero}")`);
  const so = separarEndereco('RUA X, Q. 5, L. 16');
  chk('E8c', so.endereco_bairro === '' && so.endereco_municipio === '',
      '⚠️ sem nada alem de quadra e lote, bairro e municipio ficam VAZIOS - e nao "Q. 5"');
}

// ============================================================ E5 completar sem substituir

{
  const atual = { endereco_bairro: 'BAIRRO DIGITADO A MAO', endereco_logradouro: '' };
  const proposta = separarEndereco('RUA T-55, 930, SETOR BUENO, GOIANIA - GO, 74210-030');
  const j = completarVazios(atual, proposta);
  chk('E5', j.endereco_bairro === 'BAIRRO DIGITADO A MAO',
      '⚠️ o que a pessoa digitou NAO e substituido — quem abriu a linha para preencher endereco '
      + 'costuma ja ter comecado, e ver o proprio trabalho sumir num clique e o pior desfecho');
  chk('E5b', j.endereco_logradouro === 'RUA T-55' && j.endereco_cep === '74210-030',
      'e o que estava vazio e preenchido');
  chk('E5c', completarVazios({}, { ...VAZIO }).endereco_municipio === '',
      'completar com nada nao inventa nada');
}

console.log();
if (falhas > 0) { console.log(`--- endereco da conta: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- endereco da conta (o que veio na conta virando os sete campos): ${feitas} verificacoes, 0 falhas`);
