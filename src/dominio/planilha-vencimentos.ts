// A PLANILHA DE VENCIMENTOS, lida. Puro: texto entra, linhas saem.
//
// DE ONDE ISTO VEM: `Q-SPEC001-02`, respondida pelo dono em 03/08/2026. A
// pergunta registrada era *"quem preenche `data_vencimento`, por UC ou por
// contrato?"* - e a medicao de 30/07 ja tinha mostrado que essa escolha nao
// existe: o campo so existe na UC e `src/dominio/faturamento.ts` usa **apenas o
// dia do mes** (`data_vencimento.getUTCDate()`). O que faltava era o dado.
//
// A resposta fechou a outra metade: **o dia varia por cliente/UC**. Nao e um
// `UPDATE` unico, e sim uma planilha - e planilha com 39 linhas de numero
// pequeno e onde "10" e "01" se digitam errado sem que nada pareca errado.
//
// POR QUE PURO E SEPARADO DO SCRIPT. Regra 8, e a mesma razao do
// `planilha-tarifas.ts`: o que decide um valor que vai para o banco tem de ser
// exercitavel sem banco, sem arquivo e sem `--valendo`.
//
// ============================================================================
// O MODO DE FALHA QUE ESTE MODULO PERSEGUE, e ele NAO e o mesmo do de tarifas
//
// Na planilha de tarifas o risco e ler CERTO o numero ERRADO - "1.234" vale
// R$ 1.234,00 ou R$ 1,23, e as duas leituras produzem uma fatura plausivel.
//
// Aqui o numero e pequeno e o intervalo e curto, entao o erro de escala nao
// existe. O que existe sao outros tres, e cada um tem tratamento nomeado:
//
//   "10/08/2026" em vez de "10"        a pessoa entende "vencimento" como DATA.
//                                      Aceito, e o dia e extraido - recusar
//                                      obrigaria a reeditar 39 linhas por uma
//                                      diferenca de interpretacao do rotulo
//   "31" numa UC qualquer              VALIDO, e nao e erro: `vencimentoDaFatura`
//                                      leva dia 29-31 para o ultimo dia do mes
//                                      curto, em vez de transbordar. Mas quem
//                                      digita precisa SABER disso, entao a
//                                      linha sai marcada e o ensaio imprime
//   "0", "32", "1,5", "" e "-"         recusa nomeada com o numero da linha
//
// E a regra que vale para as tres planilhas do projeto: **ausente nao e zero**.
// Celula vazia e erro, nunca "dia 1".

/** O dia do mes, ja validado. Nao e `number` solto de proposito: o tipo
 *  nominal impede passar um indice de array onde se espera um dia. */
export type DiaDoMes = number & { readonly __dia: unique symbol };

export type LinhaDeVencimento = {
  /** 1-based e contando a linha do cabecalho, para bater com o que a pessoa ve
   *  aberto no Excel. */
  linha: number;
  numero_uc: string;
  dia: DiaDoMes;
  /** O texto original da celula, para o relatorio do ensaio. */
  bruto: string;
  /** `true` para 29, 30 e 31. Nao e erro - e o que a pessoa precisa ver antes
   *  de gravar, porque em fevereiro esses tres viram o ultimo dia do mes. */
  mesCurtoAfeta: boolean;
};

export type ErroDeVencimento = { linha: number; motivo: string };

export type PlanilhaDeVencimentos = {
  linhas: LinhaDeVencimento[];
  erros: ErroDeVencimento[];
  vazias: number;
  cabecalho: boolean;
};

/** O separador e `;`, como em `planilha-tarifas.ts` e em `web/src/csv.ts`. */
const SEP = ';';

const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/**
 * Le a celula de vencimento e devolve o DIA DO MES.
 *
 * As tres formas aceitas, e a terceira e a que evita 39 reedicoes:
 *   "10"            -> 10
 *   "05"            -> 5
 *   "10/08/2026"    -> 10     (e tambem "2026-08-10")
 *
 * Levanta com a razao dita. Quem chama transforma em erro de linha.
 */
export function lerDiaDoVencimento(bruto: string): DiaDoMes {
  const t = bruto.trim();
  if (t === '') throw new Error('a celula do vencimento esta vazia. Ausente nao e "dia 1"');

  let candidato = t;

  /*
   * DATA COMPLETA. `dd/mm/aaaa` e `aaaa-mm-dd` sao as duas que o Excel produz
   * sozinho quando a coluna esta formatada como data - e a pessoa que digitou
   * "10" pode ver "10/08/2026" na tela sem ter feito nada.
   *
   * So o DIA e aproveitado, e isso e deliberado: o mes e o ano da celula nao
   * significam nada aqui, porque `vencimentoDaFatura` monta a data a partir da
   * COMPETENCIA. Guardar o mes digitado daria a impressao de que ele importa.
   */
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (br) candidato = br[1]!;
  else if (iso) candidato = iso[3]!;

  if (!/^\d{1,2}$/.test(candidato)) {
    throw new Error(
      `"${bruto}" nao e um dia do mes. Aceito: o dia sozinho ("10", "05") ou uma data ` +
      'completa ("10/08/2026", "2026-08-10"), da qual so o dia e usado');
  }

  const n = Number(candidato);
  if (n < 1 || n > 31) throw new Error(`dia ${n} nao existe - o dia do vencimento vai de 1 a 31`);
  return n as DiaDoMes;
}

/**
 * Le o conteudo de um CSV de duas colunas: UC e dia do vencimento.
 *
 * Colunas adicionais sao IGNORADAS de proposito. O modelo que o script imprime
 * ja sai com `cliente` e `usina` na terceira e quarta - servem para a pessoa
 * saber que linha esta preenchendo, e obriga-la a apaga-las antes de importar
 * seria pedir uma edicao a mais justamente no arquivo que nao pode ter erro.
 */
export function lerPlanilhaDeVencimentos(conteudo: string): PlanilhaDeVencimentos {
  // BOM UTF-8: o Excel o escreve, e sem tirar aqui o primeiro `numero_uc` viria
  // com um caractere invisivel na frente e nao casaria com UC nenhuma.
  const texto = conteudo.replace(/^﻿/, '');
  const cruas = texto.split(/\r\n|\n|\r/);

  const linhas: LinhaDeVencimento[] = [];
  const erros: ErroDeVencimento[] = [];
  const vistas = new Map<string, number>();
  let vazias = 0;
  let cabecalho = false;

  cruas.forEach((crua, i) => {
    const numeroDaLinha = i + 1;
    if (crua.trim() === '') { vazias++; return; }

    if (!crua.includes(SEP)) {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'nao ha ";" nesta linha - o arquivo precisa de duas colunas: numero da UC e dia do vencimento',
      });
      return;
    }

    const campos = crua.split(SEP).map(semAspas);
    const uc = campos[0] ?? '';
    const valor = campos[1] ?? '';

    /*
     * O CABECALHO SE RECONHECE PELA SEGUNDA COLUNA NAO SER UM DIA, e so na
     * PRIMEIRA linha util - mesmo criterio do `planilha-tarifas.ts`, e pela
     * mesma razao: reconhecer por texto ("uc", "dia") falharia com o rotulo que
     * a pessoa escolheu, e reconhecer em qualquer posicao faria uma linha de
     * dado ilegivel virar "cabecalho" e desaparecer sem erro.
     */
    if (linhas.length === 0 && erros.length === 0 && !cabecalho) {
      try { lerDiaDoVencimento(valor); } catch {
        cabecalho = true;
        return;
      }
    }

    if (!uc) {
      erros.push({ linha: numeroDaLinha, motivo: 'o numero da UC esta vazio' });
      return;
    }

    let dia: DiaDoMes;
    try {
      dia = lerDiaDoVencimento(valor);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    const antes = vistas.get(uc);
    if (antes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc} repetida - ja aparece na linha ${antes}. Escolher uma das duas seria ` +
                'escolher em silencio, e as duas produzem um vencimento plausivel',
      });
      return;
    }
    vistas.set(uc, numeroDaLinha);
    linhas.push({ linha: numeroDaLinha, numero_uc: uc, dia, bruto: valor, mesCurtoAfeta: dia >= 29 });
  });

  return { linhas, erros, vazias, cabecalho };
}

/**
 * O dia do mes vira a data que a coluna guarda.
 *
 * POR QUE UM MES DE 31 DIAS, E POR QUE ELE NAO SIGNIFICA NADA. A coluna e
 * `date` e o sistema le dela **so o dia** - `faturamento.ts` chama
 * `data_vencimento.getUTCDate()` e monta o vencimento real a partir da
 * competencia. Entao a data gravada e um PORTADOR do dia, e o mes precisa ter
 * 31 dias ou o dia 31 seria impossivel de representar.
 *
 * Janeiro de 2000 e escolhido por ser obviamente arbitrario: uma data no
 * passado distante nao se confunde com vencimento de verdade em nenhuma tela,
 * enquanto "agosto de 2026" pareceria significativa e alguem acabaria a lendo
 * como o mes em que a fatura vence.
 */
export function dataQuePortaODia(dia: DiaDoMes): Date {
  return new Date(Date.UTC(2000, 0, dia));
}

/** O modelo que o `--modelo` imprime quando nao ha banco a consultar. Com banco,
 *  `npm run vencimentos -- --modelo` sai preenchido com as UCs reais. */
export const MODELO_DE_VENCIMENTOS =
  'numero_uc;dia_vencimento;cliente;usina\n' +
  '000406456101252;10;FULANO DE TAL;0001\n' +
  '000407359701237;25;BELTRANA DA SILVA;0001\n';
