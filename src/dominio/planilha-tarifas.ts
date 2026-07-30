// A PLANILHA DE TARIFAS DA CONCESSIONARIA, lida. Puro: texto entra, linhas saem.
//
// DE ONDE ISTO VEM. `Q-TARIFA-CONC-01`: o `PRD` §5.1 diz que na v1 os dados da
// Equatorial entram "por planilha ou lancamento manual" e que nao existe API
// publica da distribuidora. A coluna existe (`fatura.
// valor_tarifas_concessionaria_centavos`), a rota existe
// (`PUT /faturas/:id/tarifas-concessionaria`) - e nao havia importador. O
// caminho de "planilha" do PRD era, na pratica, uma pessoa abrindo uma fatura
// por vez e digitando, com o id da fatura na mao.
//
// POR QUE PURO E SEPARADO DO SCRIPT. Regra 8. O que decide o valor que vai para
// a coluna de dinheiro tem de ser exercitavel sem banco, sem arquivo e sem
// `--valendo`: e onde mora a chance de um erro de leitura virar uma fatura
// errada, e um teste que precisasse de banco limitaria quantos casos alguem
// escreve.
//
// ============================================================================
// A DECISAO QUE IMPORTA: ESTE MODULO NAO ADIVINHA
//
// Uma planilha vinda da concessionaria e um arquivo que ninguem controla, e as
// tres tentacoes sao todas erradas do mesmo jeito:
//
//   pular a linha que nao entende     o lote fica incompleto e ninguem sabe
//   somar UC repetida                 a distribuidora nao mandou uma soma
//   assumir zero para celula vazia    AUSENTE NAO E ZERO - e a mesma regra que
//                                     o `layout-do-documento.ts` ja carrega
//
// Entao aqui: toda linha vira sucesso OU erro nomeado com o numero da linha, e
// nunca as duas coisas nem nenhuma delas. Quem decide o que fazer com os erros e
// o chamador - e o script recusa o lote inteiro, como `cadastrar-originadores.ts`.

import { reaisParaCentavos, type Centavos } from './centavos.ts';

export type LinhaDaPlanilha = {
  /** 1-based e contando a linha do cabecalho, para bater com o que a pessoa ve
   *  aberto no Excel. Numerar a partir dos dados faria "linha 7" apontar para a
   *  8 na tela. */
  linha: number;
  numero_uc: string;
  centavos: Centavos;
  /** O texto original da celula. Vai para o relatorio do ensaio: e o que permite
   *  a pessoa conferir a INTERPRETACAO antes de gravar - "1.234" virou
   *  R$ 1.234,00 e nao R$ 1,23. */
  bruto: string;
};

export type ErroDaPlanilha = { linha: number; motivo: string };

export type Planilha = {
  linhas: LinhaDaPlanilha[];
  erros: ErroDaPlanilha[];
  /** Quantas linhas foram descartadas por serem vazias. Contado e devolvido em
   *  vez de ignorado calado: um arquivo com 40 linhas e 3 uteis nao pode ter a
   *  mesma saida de um com 3 linhas. */
  vazias: number;
  /** `true` quando a primeira linha foi entendida como cabecalho. */
  cabecalho: boolean;
};

/**
 * O separador e `;`, como na exportacao do `web/src/csv.ts`.
 *
 * Nao ha deteccao automatica de separador, e a ausencia e escolha: um arquivo
 * com `1234,56` e virgula como separador de campo e ambiguo de verdade - o
 * detector teria de escolher entre duas leituras validas, e escolher errado
 * produz valor errado sem erro. Vírgula como separador DE CAMPO e recusada com
 * a razao dita.
 */
const SEP = ';';

const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/**
 * Le o conteudo de um CSV de duas colunas: UC e valor em reais.
 *
 * Colunas adicionais sao IGNORADAS de proposito - a planilha da distribuidora
 * costuma trazer mais coisa, e exigir exatamente duas colunas faria a pessoa
 * editar o arquivo antes de importar, que e onde erros de digitacao entram.
 */
export function lerPlanilhaDeTarifas(conteudo: string): Planilha {
  // BOM UTF-8. O Excel o escreve, e sem tirar aqui o primeiro `numero_uc` viria
  // com um caractere invisivel na frente e nao casaria com nenhuma UC - erro
  // que so aparece na PRIMEIRA linha e que ninguem consegue ver no editor.
  const texto = conteudo.replace(/^﻿/, '');
  const cruas = texto.split(/\r\n|\n|\r/);

  const linhas: LinhaDaPlanilha[] = [];
  const erros: ErroDaPlanilha[] = [];
  const vistas = new Map<string, number>();
  let vazias = 0;
  let cabecalho = false;

  cruas.forEach((crua, i) => {
    const numeroDaLinha = i + 1;
    if (crua.trim() === '') { vazias++; return; }

    if (crua.includes(SEP) === false) {
      erros.push({
        linha: numeroDaLinha,
        motivo: /,/.test(crua)
          ? `nao ha ";" nesta linha, e ha virgula. O separador de CAMPO e ";" (Excel pt-BR) - `
            + 'com virgula nao da para distinguir separador de campo de separador decimal'
          : 'nao ha ";" nesta linha - o arquivo precisa de duas colunas: numero da UC e valor',
      });
      return;
    }

    const campos = crua.split(SEP).map(semAspas);
    const uc = campos[0] ?? '';
    const valor = campos[1] ?? '';

    /*
     * O CABECALHO SE RECONHECE PELA SEGUNDA COLUNA NAO SER DINHEIRO, e so na
     * PRIMEIRA linha util. Reconhecer por texto ("uc", "valor") falharia com o
     * rotulo que a concessionaria usa, que ninguem sabe qual e; e reconhecer em
     * qualquer posicao faria uma linha de dado ilegivel virar "cabecalho" e
     * desaparecer sem erro.
     */
    if (linhas.length === 0 && erros.length === 0 && !cabecalho) {
      try { reaisParaCentavos(valor); } catch {
        cabecalho = true;
        return;
      }
    }

    if (!uc) {
      erros.push({ linha: numeroDaLinha, motivo: 'o numero da UC esta vazio' });
      return;
    }

    let centavos: Centavos;
    try {
      centavos = reaisParaCentavos(valor);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    if (centavos < 0) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc}: valor negativo (${valor}). Tarifa da concessionaria e cobranca, nao credito - `
              + 'o que existisse de credito teria de ser decidido antes de virar coluna',
      });
      return;
    }

    const antes = vistas.get(uc);
    if (antes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc} repetida - ja aparece na linha ${antes}. Somar as duas seria inventar um `
              + 'total que a distribuidora nao mandou, e escolher uma seria escolher em silencio',
      });
      return;
    }
    vistas.set(uc, numeroDaLinha);
    linhas.push({ linha: numeroDaLinha, numero_uc: uc, centavos, bruto: valor });
  });

  return { linhas, erros, vazias, cabecalho };
}

/** O modelo que o `--modelo` imprime. Duas colunas e um cabecalho, porque e o
 *  que o Excel salva quando alguem "salva como CSV". */
export const MODELO_DE_PLANILHA =
  'numero_uc;valor_reais\n' +
  '000406456101252;123,45\n' +
  '000407359701237;1.987,20\n';
