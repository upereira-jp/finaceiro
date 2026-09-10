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
  separarEndereco, completarVazios, acharCep, acharUf, faltamNaProposta, VAZIO,
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
