// O BOLETO QUE JA EXISTE E ENTRA NO SISTEMA. Funcao pura: entra o que uma pessoa
// leu ou digitou de um boleto emitido FORA daqui, sai o que pode ser gravado - ou
// a recusa, nomeada.
//
// ============================================================================
// POR QUE ISTO EXISTE, e a razao esta medida no proprio repositorio
//
// Hoje ha UM caminho para um boleto nascer: `repos/boleto.ts` -> `registrar()`,
// que chama a `PortaDeCobranca`. Essa porta depende do certificado A1, que e a
// unica pendencia do projeto (`PENDENCIAS.md` §1) e e compra externa. Enquanto
// ela nao existe, `COBRANCA_NAO_CONFIGURADA` recusa com 503 nomeado - o que esta
// certo, e nao muda aqui.
//
// So que a operacao NAO PARA por isso: quem cobra emite o boleto no internet
// banking da cooperativa e manda o PDF ao cliente. Esse boleto e real, e pagavel,
// e o sistema nao sabe que ele existe. Consequencias medidas na leitura do
// codigo, e as tres sao silenciosas:
//
//   - `GET /faturas/:id/boleto` devolve 404, e a aba `Emissao e cobranca` diz
//     "esta fatura nao tem boleto" para uma fatura que TEM;
//   - `documento.paraFatura` cai no ramo do Pix estatico (`faixaDePagamento`), e
//     o documento sai cobrando por um meio que NAO concilia - o dinheiro chega
//     sem dizer de quem e - enquanto existe um boleto com nosso numero;
//   - a conferencia aritmetica do `linha-digitavel.ts` (valor e vencimento
//     dentro dos 44 digitos) nunca roda contra esse boleto, porque ela so olha o
//     que esta na tabela.
//
// Este modulo e a metade PURA do caminho que fecha isso. A metade que grava e
// `repos/boleto.ts` -> `importar()`.
//
// ============================================================================
// ISTO NAO E EMISSAO DE BOLETO, E A DISTINCAO IMPORTA TANTO QUANTO EM
// `montarLinhaDigitavel`
//
// Nada aqui inventa titulo. O boleto ja foi registrado - por uma pessoa, no
// portal do banco - e o que entra e a TRANSCRICAO dele. O sistema nao fala com a
// Sicoob em nenhum ponto deste caminho, e por isso a linha gravada carrega
// `origem = 'importado'`: um boleto que nos registramos e um boleto que alguem
// nos contou sao fatos diferentes, e colapsa-los faria a consulta ativa do
// `PRD` 6 perguntar ao banco por um `nosso_numero` que foi lido de um PDF.
//
// ============================================================================
// AS TRES RECUSAS, E POR QUE NENHUMA DELAS E "AVISO"
//
// `linha-digitavel.ts` CONTA e nao decide, de proposito, e isso continua certo
// para o boleto que a Sicoob devolveu: ali a linha veio de quem a emitiu. Aqui a
// origem e outra - alguem digitou, ou um modelo de visao transcreveu de uma
// imagem -, e o modo de falha de uma transcricao errada nao e erro: e um boleto
// impresso que o banco recusa no caixa ou, no pior caso, que paga OUTRO titulo.
//
//   linha que nao confere      recusa. Os quatro digitos verificadores existem
//                              para isto e custam microssegundos
//   valor ou vencimento que    recusa. `documento.paraFatura` ja levanta
//   discordam da fatura        `BoletoNaoConfere` (409) nesse caso - gravar aqui
//                              produziria uma fatura que nao consegue imprimir
//                              documento nenhum, e a pessoa descobriria isso
//                              tres telas depois
//   Pix com CRC quebrado       recusa. Um BR Code corrompido vira um QR que o
//                              aplicativo do banco nao le, impresso ao lado de
//                              um boleto valido. O campo e opcional: apagar
//                              resolve, e a mensagem diz isso

import {
  conferirLinhaDigitavel, codigoDeBarrasDaLinha, dadosDoCodigoDeBarras,
  conferirBoleto, explicarDivergencia, digitosDaLinha,
  type FalhaDaLinha, type DivergenciaDoBoleto,
} from './linha-digitavel.ts';
import { crcConfere, normalizarBrCode } from './brcode.ts';
import type { Centavos } from './centavos.ts';

/** O que a pessoa transcreveu do boleto - da mao ou do leitor por visao. */
export type TranscricaoDoBoleto = {
  /** Como esta impressa, com ponto e espaco. O modulo normaliza. */
  linha_digitavel: string;
  /** O campo "Nosso Numero" do boleto. Opcional: a linha ja o carrega dentro do
   *  campo livre, e o rotulo impresso e do banco, nao nosso. */
  nosso_numero?: string | null;
  /** O payload EMV do Pix do proprio boleto, quando ha. Opcional. */
  pix_copia_e_cola?: string | null;
};

/** O que a fatura diz. Em centavo inteiro e ISO - nunca texto ja formatado. */
export type FaturaDoBoleto = {
  valor_total_centavos: number | null;
  /** `AAAA-MM-DD`. */
  vencimento_iso: string;
};

export type RecusaDaImportacao =
  | { tipo: 'sem_linha' }
  | { tipo: 'linha_invalida'; falhas: FalhaDaLinha[] }
  | { tipo: 'divergencia'; divergencias: DivergenciaDoBoleto[] }
  | { tipo: 'pix_nao_confere' };

/**
 * O que o boleto transcrito E, depois de conferido.
 *
 * `aceita` e a unica pergunta que o repositorio faz. O resto existe para a tela
 * poder mostrar o que ela mostraria de qualquer jeito - e para a recusa poder
 * dizer o numero, e nao so o nome do problema.
 */
export type ConferenciaDaImportacao = {
  aceita: boolean;
  recusa: RecusaDaImportacao | null;
  /** Uma frase por problema, ja escrita para quem opera. Vazia quando aceita. */
  frases: string[];
  /** Os 47 digitos, sem pontuacao. String vazia quando nao havia linha. */
  digitos: string;
  /** Os 44 digitos, REMONTADOS da linha - nunca digitados. `null` se a linha nao
   *  confere, pela mesma razao de `codigoDeBarrasDaLinha`. */
  codigo_barras: string | null;
  /**
   * O valor e o vencimento que o CODIGO DE BARRAS carrega, e nao o que o leitor
   * transcreveu dos rotulos impressos.
   *
   * A distincao decide dinheiro: o que o banco cobra sao os 44 digitos. O texto
   * "R$ 596,69" impresso ao lado e informativo, e ja foi visto discordar - e a
   * `valor_discorda` do `linha-digitavel.ts`, escrita depois da fotografia de
   * 15/08 em que as duas afirmacoes apareciam com a mesma voz.
   */
  valor_centavos: Centavos | null;
  /** ISO, do fator de vencimento. `null` no fator 0000 ("sem vencimento"). */
  vencimento: string | null;
  /** Normalizados: sem espaco, vazio vira `null`. Prontos para a coluna. */
  nosso_numero: string | null;
  pix_copia_e_cola: string | null;
};

const limpar = (v: string | null | undefined): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

const VAZIA: Omit<ConferenciaDaImportacao, 'aceita' | 'recusa' | 'frases'> = {
  digitos: '', codigo_barras: null, valor_centavos: null, vencimento: null,
  nosso_numero: null, pix_copia_e_cola: null,
};

/**
 * A CONFERENCIA COMPLETA, e ela e a mesma nos dois caminhos: o botao "Conferir"
 * da tela e o `importar()` do repositorio chamam ESTA funcao.
 *
 * Uma so, e nao duas, porque duas divergiriam no dia em que uma regra mudar - e
 * a que divergiria em silencio seria a da tela, que e onde a pessoa decide.
 */
export function conferirImportacao(
  t: TranscricaoDoBoleto,
  f: FaturaDoBoleto,
): ConferenciaDaImportacao {
  const digitos = digitosDaLinha(t.linha_digitavel);
  const nosso_numero = limpar(t.nosso_numero);
  /* QUEM DECIDE O QUE E ESPACO SOBRANDO E O CRC, e nao esta funcao - ver
   * `normalizarBrCode`. A primeira versao deste arquivo tirava TODO espaco em
   * branco, como os outros dois lugares do sistema faziam, e isso quebrava o
   * campo 59 de todo beneficiario com nome composto. O teste `B7b` pegou. */
  const pix_copia_e_cola = limpar(normalizarBrCode(t.pix_copia_e_cola));

  if (digitos.length === 0) {
    return { aceita: false, recusa: { tipo: 'sem_linha' }, frases: [FRASE_SEM_LINHA], ...VAZIA };
  }

  const conf = conferirLinhaDigitavel(digitos);
  if (!conf.valida) {
    return {
      aceita: false,
      recusa: { tipo: 'linha_invalida', falhas: conf.falhas },
      frases: [explicarDivergencia({ tipo: 'linha_invalida', falhas: conf.falhas })],
      ...VAZIA, digitos, nosso_numero, pix_copia_e_cola,
    };
  }

  const codigo_barras = codigoDeBarrasDaLinha(digitos)!;
  const dados = dadosDoCodigoDeBarras(codigo_barras)!;
  const base = {
    digitos, codigo_barras,
    valor_centavos: dados.valor_centavos, vencimento: dados.vencimento,
    nosso_numero, pix_copia_e_cola,
  };

  /*
   * A COMPARACAO CONTRA A FATURA E A DE `conferirBoleto`, e nao uma segunda.
   * `codigo_barras` entra nos dois campos de proposito: ele FOI remontado da
   * linha, entao `codigo_de_barras_discorda` nao pode disparar aqui - nao ha
   * codigo "do banco" para discordar. O que sobra sao as duas comparacoes que
   * importam, valor e vencimento, e elas saem da mesma funcao que a composicao
   * do documento usa. Uma fonte, duas saidas.
   */
  const c = conferirBoleto({
    linha_digitavel: digitos,
    codigo_barras,
    valor_total_centavos: f.valor_total_centavos,
    vencimento_iso: f.vencimento_iso,
  });
  if (c.divergencias.length > 0) {
    return {
      aceita: false,
      recusa: { tipo: 'divergencia', divergencias: c.divergencias },
      frases: c.divergencias.map(explicarDivergencia),
      ...base,
    };
  }

  if (pix_copia_e_cola && !crcConfere(pix_copia_e_cola)) {
    return {
      aceita: false, recusa: { tipo: 'pix_nao_confere' }, frases: [FRASE_PIX], ...base,
    };
  }

  return { aceita: true, recusa: null, frases: [], ...base };
}

/*
 * AS DUAS FRASES QUE NAO VEM DE `explicarDivergencia`, e elas moram aqui pelo
 * mesmo motivo que as de la moram no dominio: a rota, a tela e o teste tem de
 * dizer a MESMA coisa sobre o mesmo problema.
 */
export const FRASE_SEM_LINHA =
  'Sem linha digitavel nao ha boleto a importar. Ela e o unico campo obrigatorio: '
  + 'o codigo de barras, o valor e o vencimento sao DERIVADOS dela, e nao digitados.';

export const FRASE_PIX =
  'O Pix copia e cola nao passa na conferencia de CRC - o texto colado esta incompleto ou '
  + 'corrompido. Ele e OPCIONAL: apague o campo e importe so o boleto, ou copie o payload '
  + 'inteiro de novo. Um BR Code quebrado viraria um QR impresso que o aplicativo do banco '
  + 'nao le, ao lado de um boleto que estava certo.';

/** A frase da recusa, uma so, para quem precisa de uma linha em vez de lista. */
export function explicarRecusa(r: RecusaDaImportacao): string {
  switch (r.tipo) {
    case 'sem_linha': return FRASE_SEM_LINHA;
    case 'pix_nao_confere': return FRASE_PIX;
    case 'linha_invalida': return explicarDivergencia({ tipo: 'linha_invalida', falhas: r.falhas });
    case 'divergencia': return r.divergencias.map(explicarDivergencia).join(' ');
  }
}
