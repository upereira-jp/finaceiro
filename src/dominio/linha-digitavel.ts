// A LINHA DIGITAVEL DO BOLETO, CONFERIDA. Funcao pura: entram 47 digitos, sai o
// que confere e o que nao confere. Sem rede, sem banco, sem Sicoob.
//
// DE ONDE ISTO VEM. Da medicao de `g3_fatura_unificada@36e964e` em 13/08/2026
// (`REFERENCIA-fatura-unificada-2026-08-13.md` §6). A referencia entrou com os
// quatro digitos verificadores e passou a so desenhar o codigo de barras sobre
// linha conferida. Deste lado a `Q-DOCG3-06` perguntava se escreviamos um
// codificador Interleaved 2 of 5; a medicao mostrou que a pergunta era outra -
// a parte que faltava nao e desenhar, e SABER SE A LINHA ESTA CERTA. Hoje
// `documento.tsx` imprime `pagamento.linha_digitavel` sem conferir nada.
//
// ============================================================================
// POR QUE ISTO IMPORTA MESMO TENDO O CODIGO DE BARRAS DO BANCO
//
// Medido no schema: `boleto.linha_digitavel` E `boleto.codigo_barras` sao
// gravados os DOIS, direto do que a Sicoob devolve ao registrar. Entao nao
// precisamos derivar um do outro - e e exatamente por isso que a conferencia
// vale: os dois tem de ser a MESMA informacao em duas formas, e nada no sistema
// comparava uma com a outra.
//
// Se o adaptador da Sicoob trocar um campo de lugar, truncar um grupo ou perder
// o digito isolado do quarto grupo - que foi o defeito que a propria referencia
// consertou no prompt de extracao, ver §4 do documento de referencia -, o
// resultado nao e erro: e um boleto impresso que o banco recusa, ou pior, um que
// paga OUTRO titulo. Os quatro verificadores pegam a corrupcao dentro da linha;
// a remontagem comparada com `codigo_barras` pega a discordancia entre as duas.
//
// ============================================================================
// E O CODIGO DE BARRAS CARREGA DINHEIRO E DATA, e essa e a conferencia que a
// referencia NAO faz.
//
// As posicoes 9..18 do codigo de 44 sao o valor em CENTAVOS INTEIROS - a regra 1
// no formato do proprio FEBRABAN -, e as 5..8 sao o fator de vencimento. Os dois
// sao compraveis contra `fatura.valor_total_centavos` e `fatura.vencimento`, que
// ja existem. Um boleto registrado com valor diferente do da fatura e hoje
// invisivel deste lado; passa a ser um numero que nao bate.
//
// ============================================================================
// O QUE ESTE ARQUIVO NAO FAZ: nao recusa nada. Devolve o que falhou, com nome, e
// quem decide e o chamador. E o precedente do projeto - `prontidao` conta e nao
// decide, `conferirTarifas` conta e nao decide - e aqui ele e obrigatorio por um
// motivo concreto: o adaptador falso (`src/sicoob/falso.ts`) produz linha que
// NAO e de 47 digitos de proposito, e uma recusa dura quebraria a suite inteira
// sem que nada de producao estivesse errado.

import { exigirCentavos, type Centavos } from './centavos.ts';

/** So os digitos. A linha vem impressa com pontos e espacos, e eles nao contam. */
export const digitosDaLinha = (bruta: string): string => String(bruta ?? '').replace(/\D/g, '');

/**
 * Modulo 10, os campos 1 a 3.
 *
 * Pesos 2 e 1 alternados da DIREITA para a esquerda; produto maior que 9 soma os
 * dois algarismos - que e o mesmo que subtrair 9, e e assim que esta escrito.
 */
export function modulo10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let p = Number(bloco[i]) * peso;
    if (p > 9) p -= 9;
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * Modulo 11 FEBRABAN, o digito verificador GERAL.
 *
 * Pesos de 2 a 9 ciclicos da direita. Resto 0, 10 ou 11 vira **1** - e essa e a
 * pegadinha da especificacao: nao e "vira 0" nem "vira o resto".
 */
export function modulo11(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    soma += Number(bloco[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return (dv === 0 || dv > 9) ? 1 : dv;
}

export type FalhaDaLinha =
  | 'comprimento'
  | 'nao_numerica'
  | 'campo 1'
  | 'campo 2'
  | 'campo 3'
  | 'digito verificador geral';

export type ConferenciaDaLinha = {
  /** Os 47 digitos, ja sem pontuacao. String vazia se a entrada era vazia. */
  digitos: string;
  /** Verdadeiro so quando as quatro verificacoes passam. */
  valida: boolean;
  /** O que falhou, nomeado. Vazio quando `valida`. */
  falhas: FalhaDaLinha[];
};

/**
 * As quatro verificacoes de uma linha digitavel de cobranca.
 *
 * O mapa de posicoes, que e o unico jeito de ler o resto deste arquivo:
 *
 *     0        9 10       20 21       31 32 33          46
 *     |--campo1-|  |--campo2-|  |--campo3-|  |  |--campo5--|
 *      9 dig + DV   10 dig + DV   10 dig + DV  DV  fator+valor
 *                                              ^
 *                                              digito verificador GERAL
 */
export function conferirLinhaDigitavel(bruta: string): ConferenciaDaLinha {
  const digitos = digitosDaLinha(bruta);
  const falhas: FalhaDaLinha[] = [];

  if (digitos.length !== 47) {
    return { digitos, valida: false, falhas: ['comprimento'] };
  }

  if (modulo10(digitos.slice(0, 9)) !== Number(digitos[9])) falhas.push('campo 1');
  if (modulo10(digitos.slice(10, 20)) !== Number(digitos[20])) falhas.push('campo 2');
  if (modulo10(digitos.slice(21, 31)) !== Number(digitos[31])) falhas.push('campo 3');

  // O DV geral e calculado sobre o codigo de barras SEM ele - 43 digitos.
  const semDv = digitos.slice(0, 4) + digitos.slice(33, 47)
              + digitos.slice(4, 9) + digitos.slice(10, 20) + digitos.slice(21, 31);
  if (modulo11(semDv) !== Number(digitos[32])) falhas.push('digito verificador geral');

  return { digitos, valida: falhas.length === 0, falhas };
}

/**
 * Os 44 digitos do codigo de barras, remontados a partir da linha.
 *
 * `null` quando a linha nao passa nas quatro verificacoes: remontar sobre linha
 * corrompida produz um codigo de barras plausivel e errado, que e pior do que
 * nao ter codigo de barras nenhum. E a mesma decisao que ja esta escrita em
 * `documento.tsx` sobre nao desenhar retangulo listrado por aproximacao.
 */
export function codigoDeBarrasDaLinha(bruta: string): string | null {
  const { digitos, valida } = conferirLinhaDigitavel(bruta);
  if (!valida) return null;
  return digitos.slice(0, 4) + digitos.slice(32, 33) + digitos.slice(33, 47)
       + digitos.slice(4, 9) + digitos.slice(10, 20) + digitos.slice(21, 31);
}

/** `47...` -> `75691.50043  01727.686907  00000.130013  1  15410000059669`. */
export function linhaDigitavelFormatada(bruta: string): string | null {
  const d = digitosDaLinha(bruta);
  if (d.length !== 47) return null;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} `
       + `${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33, 47)}`;
}

/**
 * O DIA ZERO DO FATOR DE VENCIMENTO, e ele MUDOU - por isso a constante e
 * nomeada e comentada em vez de estar embutida numa conta.
 *
 * O fator original contava dias desde 07/10/1997, e esgotou em 21/02/2025 no
 * fator 9999. A partir de 22/02/2025 o FEBRABAN reiniciou a contagem: **fator
 * 1000 = 22/02/2025**.
 *
 * CONSEQUENCIA QUE VALE REGISTRAR: um fator entre 1000 e 9999 e AMBIGUO entre as
 * duas eras. Este modulo usa a era nova sem hesitar, e a justificativa e
 * datada - o sistema emite boleto a partir de 2026, e nao existe titulo nosso da
 * era antiga. Se um dia houver leitura de boleto de terceiro anterior a
 * 22/02/2025, esta funcao devolve a data errada por 27 anos e nao avisa; a hora
 * de decidir isso e quando esse caso existir, nao agora.
 */
const FATOR_BASE = { fator: 1000, iso: '2025-02-22' } as const;

/**
 * Fator de vencimento -> data ISO `AAAA-MM-DD`.
 *
 * Aritmetica em UTC de ponta a ponta: `Date.UTC` entra e `toISOString` sai, e
 * nenhum dos dois olha fuso. E o mesmo cuidado que `dataBr` documenta em
 * `layout-do-documento.ts` - `new Date('2026-07-01')` em fuso negativo devolve
 * 30/06.
 *
 * `null` para fator 0000, que a especificacao define como "sem vencimento".
 */
export function vencimentoDoFator(fator: number): string | null {
  if (!Number.isInteger(fator) || fator <= 0) return null;
  const [a, m, d] = FATOR_BASE.iso.split('-').map(Number);
  const base = Date.UTC(a, m - 1, d);
  const ms = base + (fator - FATOR_BASE.fator) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export type DadosDoCodigoDeBarras = {
  /** `756` e a Sicoob. */
  banco: string;
  /** `9` e real. */
  moeda: string;
  fator: number;
  /** Inteiro, em centavos - o proprio FEBRABAN guarda assim (regra 1). */
  valor_centavos: Centavos;
  /** ISO `AAAA-MM-DD`, ou `null` quando o fator e 0000. */
  vencimento: string | null;
};

/**
 * O que o codigo de barras de 44 digitos DIZ - banco, moeda, vencimento e valor.
 *
 * E a peca que torna a conferencia util em vez de decorativa: o valor sai daqui
 * em centavos inteiros e e comparavel com `fatura.valor_total_centavos` sem
 * passar por float em lugar nenhum.
 */
export function dadosDoCodigoDeBarras(barras: string): DadosDoCodigoDeBarras | null {
  const d = digitosDaLinha(barras);
  if (d.length !== 44) return null;
  const fator = Number(d.slice(5, 9));
  return {
    banco: d.slice(0, 3),
    moeda: d.slice(3, 4),
    fator,
    valor_centavos: exigirCentavos(Number(d.slice(9, 19)), 'valor do codigo de barras'),
    vencimento: vencimentoDoFator(fator),
  };
}

/** ISO `AAAA-MM-DD` -> fator de vencimento. O inverso de `vencimentoDoFator`. */
export function fatorDoVencimento(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const [ba, bm, bd] = FATOR_BASE.iso.split('-').map(Number);
  const dias = (Date.UTC(a, m - 1, d) - Date.UTC(ba, bm - 1, bd)) / 86_400_000;
  return FATOR_BASE.fator + dias;
}

/**
 * MONTA uma linha digitavel valida. E o inverso de `codigoDeBarrasDaLinha`.
 *
 * =========================================================================
 * ISTO NAO E EMISSAO DE BOLETO, E A DISTINCAO E IMPORTANTE O BASTANTE PARA
 * ESTAR EM CAIXA ALTA. O financeiro NAO emite titulo: quem registra e a Sicoob,
 * pela `PortaDeCobranca`, e a linha digitavel de producao vem de la pronta.
 * Nada em `src/repos/` chama esta funcao, e se um dia chamar, a revisao tem de
 * parar nela.
 *
 * POR QUE ELA EXISTE ENTAO. Por causa do adaptador FALSO. Ate 14/08 ele devolvia
 * uma linha de formato posicional inventado - `1-3.0000059669` -, com o
 * comentario honesto de que "o adaptador falso nao finge ser o Febraban". Isso
 * era inofensivo enquanto ninguem conferia a linha. Deixou de ser no momento em
 * que a conferencia passou a RECUSAR a emissao do documento (`Q-DOCG3-13`,
 * decidida em 14/08): um falso que produz linha estruturalmente invalida
 * obrigaria a conferencia a ter uma excecao para teste - e excecao em regra de
 * recusa e o buraco por onde a regra vaza.
 *
 * A alternativa era duplicar `modulo10` e `modulo11` dentro de `falso.ts`, que e
 * exatamente a redundancia que este ciclo esta removendo.
 *
 * `campoLivre` sao os 25 digitos que cada banco preenche do seu jeito - para a
 * Sicoob e carteira, cliente e nosso numero. Aqui ele e so preenchido: o falso
 * nao precisa acertar o leiaute interno da Sicoob, precisa produzir 47 digitos
 * que passem nas quatro verificacoes, que e o que a conferencia olha.
 */
export function montarLinhaDigitavel(e: {
  banco?: string;
  moeda?: string;
  vencimento_iso: string;
  valor_centavos: Centavos;
  campoLivre: string;
}): { linha: string; codigo_barras: string } {
  const banco = (e.banco ?? '756').padStart(3, '0').slice(0, 3);
  const moeda = (e.moeda ?? '9').slice(0, 1);
  const fator = String(fatorDoVencimento(e.vencimento_iso)).padStart(4, '0').slice(-4);
  const valor = String(exigirCentavos(e.valor_centavos, 'valor_centavos')).padStart(10, '0').slice(-10);
  const livre = digitosDaLinha(e.campoLivre).padEnd(25, '0').slice(0, 25);

  // O DV geral sai dos 43 digitos - o codigo de barras sem a posicao 4.
  const semDv = banco + moeda + fator + valor + livre;
  const dv = String(modulo11(semDv));
  const codigo_barras = banco + moeda + dv + fator + valor + livre;

  // E os tres campos da linha se montam do codigo de barras, cada um com o seu
  // modulo 10. E a mesma reparticao que `codigoDeBarrasDaLinha` desfaz.
  const c1 = banco + moeda + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  const linha = c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + dv + fator + valor;

  return { linha, codigo_barras };
}

export type DivergenciaDoBoleto =
  | { tipo: 'linha_invalida'; falhas: FalhaDaLinha[] }
  | { tipo: 'codigo_de_barras_discorda'; do_banco: string; da_linha: string }
  | { tipo: 'valor_discorda'; no_boleto: Centavos; na_fatura: Centavos }
  | { tipo: 'vencimento_discorda'; no_boleto: string; na_fatura: string };

/**
 * A CONFERENCIA COMPLETA DO BOLETO REGISTRADO, e ela e a contraparte do que a
 * referencia faz lendo PDF com modelo de visao (§4.1 do documento de
 * referencia): mesmas tres perguntas - a linha esta certa, o valor bate, o
 * vencimento bate -, respondidas por aritmetica em vez de por IA.
 *
 * Tudo opcional de proposito. Boleto ainda nao registrado tem os campos nulos, e
 * "nao da para conferir" nao e "conferencia falhou": nesse caso a lista sai
 * vazia. Quem quiser saber se houve conferencia olha `conferida`.
 */
export function conferirBoleto(entrada: {
  linha_digitavel: string | null;
  codigo_barras: string | null;
  valor_total_centavos: number | null;
  vencimento_iso: string | null;
}): { conferida: boolean; divergencias: DivergenciaDoBoleto[] } {
  const divergencias: DivergenciaDoBoleto[] = [];

  if (!entrada.linha_digitavel) return { conferida: false, divergencias };

  const conf = conferirLinhaDigitavel(entrada.linha_digitavel);
  if (!conf.valida) {
    return { conferida: true, divergencias: [{ tipo: 'linha_invalida', falhas: conf.falhas }] };
  }

  const daLinha = codigoDeBarrasDaLinha(entrada.linha_digitavel)!;
  const doBanco = entrada.codigo_barras ? digitosDaLinha(entrada.codigo_barras) : null;
  if (doBanco && doBanco.length === 44 && doBanco !== daLinha) {
    divergencias.push({ tipo: 'codigo_de_barras_discorda', do_banco: doBanco, da_linha: daLinha });
  }

  const dados = dadosDoCodigoDeBarras(daLinha)!;

  if (entrada.valor_total_centavos != null && dados.valor_centavos !== entrada.valor_total_centavos) {
    divergencias.push({
      tipo: 'valor_discorda',
      no_boleto: dados.valor_centavos,
      na_fatura: exigirCentavos(entrada.valor_total_centavos, 'valor_total_centavos'),
    });
  }

  const naFatura = entrada.vencimento_iso ? entrada.vencimento_iso.slice(0, 10) : null;
  if (naFatura && dados.vencimento && dados.vencimento !== naFatura) {
    divergencias.push({ tipo: 'vencimento_discorda', no_boleto: dados.vencimento, na_fatura: naFatura });
  }

  return { conferida: true, divergencias };
}
