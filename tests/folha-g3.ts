// A FOLHA 1 DO MODELO G3. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/folha-g3.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. A folha 1 e o documento que vai ao cliente, e
// tres coisas dela sao do tipo que passa despercebido ate chegar impresso:
//
//   - VAZIO VIRANDO NUMERO. `valor_total_centavos` e GENERATED ALWAYS e aceita
//     nulo. "R$ 0,00" no lugar de um total desconhecido e o defeito que este
//     projeto persegue desde 30/07.
//   - O EMISSOR AUSENTE VIRANDO TRAVESSAO. E ao nome do emissor que o aviso
//     anti-golpe amarra. "Beneficiario: -" treina o comportamento oposto ao que
//     o aviso pede, entao a ausencia tem de ser AUSENCIA e nao um risco.
//   - FAIXA QUE FALTA PARECENDO FAIXA QUE NAO EXISTE. Duas das sete faixas nao
//     entraram por falta de dado. Se a folha nao disser isso, ela parece pronta.

import {
  folha1, mascararDocumento, cnpjFormatado, linhaDoEmissor,
  type DadosDaFolha, type EmissorDaFatura,
} from '../src/dominio/folha-g3.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const G3: EmissorDaFatura = { razao_social: 'Consórcio G3 Gestão de Energia Solar', cnpj: '66714022000121' };
const SEM: EmissorDaFatura = { razao_social: null, cnpj: null };

const dados: DadosDaFolha = {
  cliente_nome: 'Maria da Conceição', cliente_documento: '52998224725',
  numero_uc: '000406456101252', endereco: 'Rua T-55, 930 — Setor Bueno, Goiânia/GO',
  competencia: '2026-07-01', vencimento: '2026-08-17',
  valor_total_centavos: 59669, numero_da_fatura: '000406456101252-202607',
};

// ------------------------------------------------------------- G1 o emissor
{
  chk('G1', cnpjFormatado('66714022000121') === '66.714.022/0001-21',
      'o CNPJ sai mascarado como se le, e nao como se guarda');
  chk('G1b', cnpjFormatado(null) === null && cnpjFormatado('123') === '123',
      'CNPJ nulo continua nulo, e um que nao tem 14 digitos sai como veio - sem mascara inventada');

  chk('G1c', linhaDoEmissor(G3) === 'Consórcio G3 Gestão de Energia Solar · CNPJ 66.714.022/0001-21',
      'razao social e CNPJ numa linha so, que e como o cabecalho e o rodape a imprimem');

  chk('G1d', linhaDoEmissor(SEM) === null,
      'EMISSOR NAO CADASTRADO E `null`, NAO "—": e a ele que o aviso anti-golpe amarra, '
      + 'e um travessao ali treina o comportamento que o aviso quer impedir');

  chk('G1e', linhaDoEmissor({ razao_social: 'G3 Solar', cnpj: null }) === 'G3 Solar',
      'razao social sem CNPJ sai sozinha - meia identidade e melhor que nenhuma, e nao inventa numero');

  const f = folha1(dados, SEM);
  chk('G1f', f.cabecalho.emissor === null && f.rodape.emissor === null,
      'a ausencia atravessa cabecalho E rodape - os dois imprimem o mesmo nome, e sao os dois que somem');
}

// ------------------------------------------------------- G2 o total, e o nulo
{
  const f = folha1(dados, G3);
  chk('G2', f.total.valor === 'R$ 596,69' && f.total.ausente === false,
      'o total sai em reais a partir de centavos inteiros');

  const nulo = folha1({ ...dados, valor_total_centavos: null }, G3);
  chk('G2b', nulo.total.valor === '—' && nulo.total.ausente === true,
      'TOTAL NULO SAI "—" E NUNCA "R$ 0,00": a coluna e GENERATED ALWAYS e aceita nulo (medido em 30/07)');

  chk('G2c', folha1({ ...dados, valor_total_centavos: 0 }, G3).total.valor === 'R$ 0,00',
      'e ZERO DE VERDADE continua "R$ 0,00" - zero e informacao, nao ausencia');

  chk('G2d', f.total.detalhe === 'Consumo G3 Solar + tarifas Equatorial',
      'a barra do total diz DO QUE ele e feito - e a mudanca que a referencia fez em 13/08');
}

// ------------------------------------------------------ G3 o CPF mascarado
{
  const f = folha1(dados, G3);
  chk('G3', f.cliente.documento === '52998******',
      `CPF sai mascarado do sexto digito em diante (${f.cliente.documento}) - a fatura circula`);

  chk('G3b', mascararDocumento('66.714.022/0001-21') === '66.71*.***/****-**',
      'PONTUACAO SOBREVIVE a mascara: ponto e barra nao identificam ninguem, e sem eles o campo '
      + 'perde a forma de documento');

  chk('G3c', mascararDocumento(null) === '—' && mascararDocumento('') === '—',
      'documento ausente e travessao - aqui sim, porque nao ha aviso amarrado nele');

  chk('G3d', !/\d/.test(mascararDocumento('52998224725').slice(5)),
      'nenhum digito sobrevive depois do quinto caractere - a verificacao e sobre a PROPRIEDADE, '
      + 'nao sobre a string esperada');
}

// ------------------------------------------------------------ G4 os metadados
{
  const f = folha1(dados, G3);
  const de = (r: string) => f.cliente.meta.find((m) => m.rotulo === r)?.valor;

  chk('G4', de('Mês de referência') === '07/2026' && de('Vencimento') === '17/08/2026',
      'data e competencia por RECORTE de string, pelos mesmos formatadores do resto do documento');

  chk('G4b', de('Unidade consumidora') === '000406456101252',
      'a UC sai INTEIRA, com os zeros a esquerda - e por ela que se acha a fatura na distribuidora');

  const vazio = folha1({ ...dados, endereco: '   ', numero_uc: null, cliente_nome: '' }, G3);
  chk('G4c', vazio.cliente.meta.find((m) => m.rotulo === 'Endereço')?.valor === '—'
          && vazio.cliente.nome === '—',
      'campo em branco e campo nulo dao o MESMO travessao - "   " impresso pareceria campo esquecido');

  chk('G4d', f.cliente.meta.length === 5 && de('Fatura nº') === '000406456101252-202607',
      'cinco metadados, e o numero da fatura entre eles');
}

// ------------------------------------------------- G5 o aviso, que e fixo
{
  const f = folha1(dados, G3);
  chk('G5', f.aviso.titulo === 'Não pague a conta da Equatorial'
         && f.aviso.corpo.includes('duplicidade'),
      'o aviso da conta unificada e FIXO e nao configuravel - e a faixa que mais trabalha na folha');
}

// -------------------------------------- G6 o que NAO entrou, e esta dito
{
  const f = folha1(dados, G3);
  chk('G6', f.faixas_ausentes.length === 2,
      'a folha DIZ que esta incompleta: duas das sete faixas nao entraram');

  chk('G6b', f.faixas_ausentes.every((a) => a.motivo.length > 40 && a.questao.startsWith('Q-')),
      'cada ausencia carrega o MOTIVO e a QUESTAO que a destrava - nao so o nome da faixa');

  chk('G6c', f.faixas_ausentes.some((a) => a.questao.includes('Q-DOCG3-11'))
          && f.faixas_ausentes.some((a) => a.questao.includes('Q-DOCG3-02')),
      'as duas questoes que travam sao as nomeadas, e nao um "em construcao" generico');

  /*
   * A LISTA E CONSTANTE, e esta verificacao existe para que ela nao vire
   * condicional sem que alguem note. Hoje as duas faltam para TODA fatura, porque
   * falta a coluna e nao o valor de uma fatura especifica. No dia em que uma
   * delas entrar, esta verificacao quebra - que e o aviso certo na hora certa.
   */
  const outra = folha1({ ...dados, valor_total_centavos: 1, numero_uc: 'X' }, SEM);
  chk('G6d', outra.faixas_ausentes.length === 2
          && outra.faixas_ausentes[0].faixa === f.faixas_ausentes[0].faixa,
      'a ausencia nao depende da fatura: falta a COLUNA, e nao o dado de uma fatura');
}

console.log();
if (falhas > 0) { console.log(`--- folha G3: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- folha 1 do modelo G3: 23 verificacoes, 0 falhas');
