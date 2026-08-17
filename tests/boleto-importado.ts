// O BOLETO EMITIDO NO BANCO, CONFERIDO ANTES DE ENTRAR. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/boleto-importado.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. Ate 17/08/2026 nao havia caminho nenhum para
// um boleto ja emitido entrar no sistema: `repos/boleto.ts` -> `registrar()` era o
// unico, e ele chama a `PortaDeCobranca`, que depende do certificado A1. Com o
// caminho novo, o dado que entra e uma TRANSCRICAO - alguem digitou, ou um modelo
// de visao leu de uma imagem -, e transcricao erra em silencio.
//
// A REGRA QUE ESTAS VERIFICACOES EXPRESSAM e a diferenca entre este modulo e o
// `linha-digitavel.ts`: la o modulo CONTA e quem decide e o chamador, porque a
// linha veio de quem a emitiu. Aqui ele RECUSA, porque ninguem conferiu antes -
// e o modo de falha de uma linha corrompida nao e erro, e um boleto impresso que
// paga OUTRO titulo.
//
// A LINHA DE REFERENCIA E A MESMA DO `tests/linha-digitavel.ts`, e continua sendo
// real: `75691.50043 01727.686907 00000.130013 1 15410000059669` esta escrita no
// prompt de extracao de `g3_fatura_unificada@36e964e` como o formato esperado de
// um boleto Sicoob. Ela decodifica para banco 756, R$ 596,69 e 17/08/2026.

import {
  conferirImportacao, explicarRecusa, FRASE_SEM_LINHA, FRASE_PIX,
  type FaturaDoBoleto, type RecusaDaImportacao,
} from '../src/dominio/boleto-importado.ts';
import { montarLinhaDigitavel, digitosDaLinha } from '../src/dominio/linha-digitavel.ts';
import { pixEstatico, crcConfere } from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

/** Sicoob, R$ 596,69, vencimento 17/08/2026. Impressa como sai no boleto. */
const IMPRESSA = '75691.50043 01727.686907 00000.130013 1 15410000059669';
const DIGITOS = digitosDaLinha(IMPRESSA);
const BARRAS = '75691154100000596691500401727686900000013001';

/** A fatura que casa com ela: mesmo centavo, mesmo dia. */
const FATURA: FaturaDoBoleto = { valor_total_centavos: 59669, vencimento_iso: '2026-08-17' };

// ------------------------------------------------------- B1 o caminho que passa
{
  const c = conferirImportacao({ linha_digitavel: IMPRESSA }, FATURA);
  chk('B1', c.aceita && c.recusa === null && c.frases.length === 0,
      'boleto real, fatura que casa: aceita, sem recusa e sem frase');
  chk('B1b', c.digitos === DIGITOS && c.digitos.length === 47,
      'a pontuacao impressa some e sobram os 47 digitos');
  chk('B1c', c.codigo_barras === BARRAS,
      'o codigo de barras e REMONTADO da linha - nao ha campo para digita-lo');
  chk('B1d', c.valor_centavos === 59669,
      'o valor sai dos 44 digitos, em centavo inteiro (regra 1)');
  chk('B1e', c.vencimento === '2026-08-17',
      'o vencimento sai do fator 1541 na era nova do FEBRABAN');
  chk('B1f', c.nosso_numero === null && c.pix_copia_e_cola === null,
      'os dois campos opcionais ausentes viram NULO, e nao string vazia');
}

// ---------------------------------------------- B2 a linha que nao esta inteira
{
  /* Um digito trocado no campo 1. O modulo 10 daquele campo passa a nao fechar,
   * e o DV geral tambem nao - porque ele e calculado sobre os mesmos digitos. */
  const corrompida = `85691.50043 01727.686907 00000.130013 1 15410000059669`;
  const c = conferirImportacao({ linha_digitavel: corrompida }, FATURA);
  chk('B2', !c.aceita && c.recusa?.tipo === 'linha_invalida',
      'um digito trocado RECUSA - e nao vira aviso, como no linha-digitavel.ts');
  chk('B2b', c.recusa?.tipo === 'linha_invalida' && c.recusa.falhas.includes('campo 1'),
      'a recusa NOMEIA qual verificacao falhou, e nao so que falhou');
  chk('B2c', c.codigo_barras === null && c.valor_centavos === null,
      'linha que nao confere NAO remonta codigo de barras: um plausivel e errado e pior que nenhum');
  chk('B2d', c.frases.length === 1 && c.frases[0]!.includes('campo 1'),
      'a frase da recusa cita a verificacao, para quem opera saber onde olhar');

  const curta = conferirImportacao({ linha_digitavel: '7569150043' }, FATURA);
  chk('B2e', !curta.aceita && curta.recusa?.tipo === 'linha_invalida'
       && curta.recusa.falhas.includes('comprimento'),
      'linha truncada e recusada por comprimento antes de qualquer aritmetica');
}

// ------------------------------------------------------------ B3 sem linha
{
  for (const vazia of ['', '   ', 'sem digito nenhum']) {
    const c = conferirImportacao({ linha_digitavel: vazia }, FATURA);
    chk('B3', !c.aceita && c.recusa?.tipo === 'sem_linha' && c.frases[0] === FRASE_SEM_LINHA,
        `"${vazia.slice(0, 12)}" nao tem digito: recusa nomeada, e nao "linha invalida"`);
  }
}

// -------------------------------------------- B4 o valor que discorda da fatura
{
  const c = conferirImportacao({ linha_digitavel: IMPRESSA },
    { valor_total_centavos: 59670, vencimento_iso: '2026-08-17' });
  chk('B4', !c.aceita && c.recusa?.tipo === 'divergencia',
      'UM CENTAVO de diferenca entre o boleto e a fatura recusa a importacao');
  chk('B4b', c.recusa?.tipo === 'divergencia'
       && c.recusa.divergencias.some((d) => d.tipo === 'valor_discorda'),
      'a divergencia e nomeada `valor_discorda`, a mesma do documento composto');
  chk('B4c', c.frases[0]!.includes('596,69') && c.frases[0]!.includes('596,70'),
      'a frase diz OS DOIS numeros - "nao confere" sozinho manda a pessoa adivinhar');
  chk('B4d', c.codigo_barras === BARRAS && c.valor_centavos === 59669,
      'a recusa por divergencia ainda entrega o que leu: a tela mostra os dois lados');
}

// -------------------------------------- B5 o vencimento que discorda da fatura
{
  const c = conferirImportacao({ linha_digitavel: IMPRESSA },
    { valor_total_centavos: 59669, vencimento_iso: '2026-08-20' });
  chk('B5', !c.aceita && c.recusa?.tipo === 'divergencia'
       && c.recusa.divergencias.some((d) => d.tipo === 'vencimento_discorda'),
      'vencimento diferente do da fatura recusa - o boleto cobraria noutro dia');
  chk('B5b', c.frases[0]!.includes('17/08/2026') && c.frases[0]!.includes('20/08/2026'),
      'a frase traz as duas datas em formato brasileiro');
}

// ------------------------------------------ B6 a fatura sem valor total apurado
{
  /* `valor_total_centavos` e GENERATED ALWAYS e aceita nulo - medido em 30/07. Um
   * nulo nao e uma discordancia: e a ausencia da comparacao. */
  const c = conferirImportacao({ linha_digitavel: IMPRESSA },
    { valor_total_centavos: null, vencimento_iso: '2026-08-17' });
  chk('B6', c.aceita && c.valor_centavos === 59669,
      'fatura sem total apurado nao inventa divergencia - nao ha o que comparar');
}

// ------------------------------------------------------- B7 o Pix que vem junto
{
  const brcode = pixEstatico({
    chave: 'financeiro@g3solar.com.br', recebedorNome: 'G3 SOLAR',
    recebedorCidade: 'GOIANIA', valorCentavos: 59669,
  });
  chk('B7', crcConfere(brcode), 'o BR Code de referencia do teste e integro (pre-condicao)');

  const c = conferirImportacao({ linha_digitavel: IMPRESSA, pix_copia_e_cola: brcode }, FATURA);
  chk('B7b', c.aceita && c.pix_copia_e_cola === brcode,
      'Pix integro entra junto com o boleto');

  /* Colado de um PDF, o payload vem com quebra de linha no meio. Ele estava
   * INTEIRO: o que quebra o CRC e o espaco em branco, nao o conteudo. */
  const quebrado = `${brcode.slice(0, 40)}\n  ${brcode.slice(40)}`;
  const d = conferirImportacao({ linha_digitavel: IMPRESSA, pix_copia_e_cola: quebrado }, FATURA);
  chk('B7c', d.aceita && d.pix_copia_e_cola === brcode,
      'quebra de linha de quem copiou do PDF e limpa antes do CRC, e nao vira recusa');

  const corrompido = `${brcode.slice(0, -6)}00${brcode.slice(-4)}`;
  const e = conferirImportacao({ linha_digitavel: IMPRESSA, pix_copia_e_cola: corrompido }, FATURA);
  chk('B7d', !e.aceita && e.recusa?.tipo === 'pix_nao_confere' && e.frases[0] === FRASE_PIX,
      'Pix com CRC quebrado recusa: um QR ilegivel impresso ao lado de um boleto bom');
  chk('B7e', e.codigo_barras === BARRAS,
      'e a recusa do Pix nao apaga o boleto ja conferido - a tela pode mostrar o que salvou');
  chk('B7f', FRASE_PIX.includes('OPCIONAL') || FRASE_PIX.includes('apague'),
      'e a frase diz a saida: o campo e opcional');
}

// ------------------------------------------- B8 o fator 0000, "sem vencimento"
{
  /* A especificacao define fator 0000 como "sem vencimento", e `vencimentoDoFator`
   * devolve null. Isso NAO e divergencia - nao ha data no papel para discordar da
   * fatura -, e quem grava resolve o nulo com a data da propria fatura. */
  const isoFator0 = new Date(Date.UTC(2025, 1, 22) - 1000 * 86_400_000).toISOString().slice(0, 10);
  const { linha } = montarLinhaDigitavel({
    vencimento_iso: isoFator0, valor_centavos: 59669, campoLivre: '1500401727686900000013001',
  });
  const c = conferirImportacao({ linha_digitavel: linha }, FATURA);
  chk('B8', c.aceita && c.vencimento === null && c.valor_centavos === 59669,
      'fator 0000 e "sem vencimento", nao divergencia: aceita com a data nula');
}

// ------------------------------------------------ B9 os opcionais, normalizados
{
  const c = conferirImportacao(
    { linha_digitavel: IMPRESSA, nosso_numero: '  1-3  ', pix_copia_e_cola: '   ' }, FATURA);
  chk('B9', c.nosso_numero === '1-3', 'o nosso numero perde o espaco das pontas');
  chk('B9b', c.pix_copia_e_cola === null,
      'Pix so com espaco vira NULO e nao chega ao CRC - vazio nao e conteudo corrompido');
}

// ------------------------------------------------------ B10 a funcao e uma so
{
  const a = conferirImportacao({ linha_digitavel: IMPRESSA, nosso_numero: '1-3' }, FATURA);
  const b = conferirImportacao({ linha_digitavel: DIGITOS, nosso_numero: '1-3' }, FATURA);
  chk('B10', JSON.stringify(a) === JSON.stringify(b),
      'a linha impressa com pontuacao e os 47 digitos crus produzem o MESMO resultado');

  const c = conferirImportacao({ linha_digitavel: IMPRESSA, nosso_numero: '1-3' }, FATURA);
  chk('B10b', JSON.stringify(a) === JSON.stringify(c),
      'chamar duas vezes com a mesma entrada devolve o mesmo objeto: nao ha estado');
}

// ------------------------------------- B11 toda recusa tem frase, e nenhuma vazia
{
  const todas: RecusaDaImportacao[] = [
    { tipo: 'sem_linha' },
    { tipo: 'linha_invalida', falhas: ['campo 2'] },
    { tipo: 'divergencia', divergencias: [{ tipo: 'valor_discorda', no_boleto: 1, na_fatura: 2 }] },
    { tipo: 'pix_nao_confere' },
  ];
  const todasComFrase = todas.every((r) => explicarRecusa(r).trim().length > 20);
  chk('B11', todasComFrase,
      'os quatro tipos de recusa tem frase propria - nenhum cai num "erro" generico');
}

console.log(falhas === 0 ? '\nTODAS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
