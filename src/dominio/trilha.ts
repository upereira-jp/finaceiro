// O QUE MUDOU NUMA LINHA — a regra pura que transforma `antes`/`depois` em
// diferenca, e ela e a metade do servidor da trilha de auditoria.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 10/09/2026
//
// `auditoria` tem 21.317 linhas em producao e NUNCA teve leitor: zero
// repositorios, zero rotas, zero telas. O gatilho grava desde a migration 3 e a
// unica forma de ler era `psql` — ou seja, a pergunta "quem mudou isto, e
// quando?" exigia um desenvolvedor, em qualquer situacao. Era o ultimo item de
// codigo da lista do `PLANO-sem-desenvolvedor`.
//
// ============================================================================
// POR QUE A DIFERENCA E CALCULADA AQUI, e nao na tela
//
// Duas razoes, e a segunda e a que decide:
//
//   1. E regra, e regra tem suite. O runner do `web/` nao le JSX, e o do
//      servidor nao monta componente — entao o lugar de uma regra que os dois
//      lados usam e `src/dominio/`, com verificacao propria (regra 8);
//
//   2. **O PESO.** `antes` e `depois` sao a LINHA INTEIRA em JSON, e ha tabelas
//      cujas linhas sao grandes: `registro_de_fatura_unificada` guarda a conta
//      lida, `layout_do_documento` guarda o desenho da fatura, `modelo_de_fatura`
//      guarda os textos. Duzentas linhas de trilha com dois blobs cada seria uma
//      resposta de megabytes para mostrar "o vencimento mudou de 10 para 15".
//      Mandar a linha inteira e deixar a tela escolher seria pagar a rede toda
//      para jogar fora 99% dela.
//
// Consequencia declarada: a rota NAO devolve a linha crua. Quem precisa do JSON
// inteiro — e isso e forense, nao operacao — le no banco. A trilha continua
// intacta la; o que esta arquivo reduz e a RESPOSTA, nunca o registro.
//
// ============================================================================
// O QUE ELE NAO FAZ: TRADUZIR
//
// `valor_centavos` continua `valor_centavos` na saida daqui. O nome legivel e o
// formato do valor sao decisao de TELA e moram em `web/src/historico.ts`, com a
// suite de la. Misturar as duas coisas poria rotulo em portugues dentro de uma
// resposta de API — e no dia em que a mesma trilha alimentasse um relatorio em
// CSV, o rotulo viria junto sem ninguem ter pedido.

/** As tres operacoes que o gatilho grava. `char(1)` no banco. */
export type OperacaoDaTrilha = 'I' | 'U' | 'D';

export type Mudanca = {
  coluna: string;
  /** `null` num `I`: nao havia valor antes. */
  de: string | null;
  /** `null` num `D`: nao ha valor depois. */
  para: string | null;
  /** O valor foi CORTADO por tamanho — a tela avisa, em vez de mentir que o
   *  texto acabou ali. */
  cortado?: true;
};

/**
 * O TETO DE CADA VALOR, em caracteres.
 *
 * Duzentos porque e mais do que qualquer campo que alguem le de relance (nome,
 * documento, chave Pix, motivo de cancelamento cabem inteiros) e muito menos do
 * que qualquer campo que alguem NAO le de relance (o desenho da fatura, a conta
 * lida em JSON). O corte e visivel: quem precisa do valor inteiro sabe que ele
 * existe.
 */
export const TETO_DO_VALOR = 200;

/**
 * AS COLUNAS QUE NAO ENTRAM NA DIFERENCA, e as tres tem motivo diferente.
 *
 * `tenant_id`   e sempre o mesmo em toda a trilha visivel — a policy de leitura
 *               ja garante que so aparecem linhas deste tenant. Mostra-lo seria
 *               repetir a mesma resposta em toda linha;
 * `id`          o identificador do registro ja vai na propria linha da trilha
 *               (`registro_id`), e num `I` ele apareceria duas vezes;
 * `criado_em`   num `I` e igual ao `ocorrido_em` da propria linha da trilha, que
 *               a tela ja mostra; num `U` ele nao muda. Nunca e a resposta.
 *
 * ⚠️ NAO E UMA LISTA DE "COLUNAS CHATAS", e a diferenca importa: uma coluna que
 * MUDOU e sempre digna de aparecer. As tres acima ou nao mudam nunca, ou repetem
 * algo que ja esta na linha. Acrescentar aqui uma coluna que muda seria esconder
 * uma alteracao de dado — que e exatamente o que a trilha existe para impedir.
 */
export const FORA_DA_DIFERENCA: readonly string[] = ['tenant_id', 'id', 'criado_em'];

/** O JSON que o gatilho grava: `to_jsonb(NEW)`, ou seja, objeto de uma linha. */
export type LinhaEmJson = Record<string, unknown> | null | undefined;

/**
 * O valor de uma coluna virando texto, SEM interpretar.
 *
 * `null` do banco vira `null` daqui e nao a string "null": a tela precisa
 * distinguir "o campo ficou vazio" de "o campo passou a conter a palavra null",
 * e as duas coisas acontecem em sistema que le planilha.
 *
 * Objeto e lista viram JSON compacto. Nao ha caso em que a tela precise navegar
 * por dentro deles — se precisar um dia, e outra ferramenta.
 */
export function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return JSON.stringify(v);
}

function cortar(v: string | null): { valor: string | null; cortado: boolean } {
  if (v === null || v.length <= TETO_DO_VALOR) return { valor: v, cortado: false };
  return { valor: v.slice(0, TETO_DO_VALOR), cortado: true };
}

/**
 * A DIFERENCA, e ela e diferente nas tres operacoes.
 *
 *   `U`  so o que MUDOU. Uma alteracao que tocou uma coluna de trinta produz uma
 *        linha de diferenca, e nao trinta — e essa e a leitura que se quer;
 *   `I`  o que a linha NASCEU tendo, pulando o que nasceu vazio. Coluna nula num
 *        registro novo nao e informacao: e o valor padrao de um campo que
 *        ninguem preencheu, e mostrar quinze delas esconde as tres que importam;
 *   `D`  o que a linha TINHA quando foi apagada, tambem sem os vazios. Aqui o
 *        valor vai em `de` e `para` fica `null`, que e literalmente o que
 *        aconteceu.
 *
 * A ORDEM E A DO BANCO, e nao alfabetica: `to_jsonb` preserva a ordem das
 * colunas da tabela, que e a ordem em que a migration as declarou — ou seja, a
 * ordem em que quem desenhou a tabela agrupou o que e da mesma familia. Ordenar
 * por nome separaria `agencia` de `conta` e juntaria `ativo` com `agencia`.
 */
export function mudancas(
  operacao: OperacaoDaTrilha,
  antes: LinhaEmJson,
  depois: LinhaEmJson,
): Mudanca[] {
  const a = antes ?? {};
  const d = depois ?? {};
  const saida: Mudanca[] = [];

  const colunas = operacao === 'D' ? Object.keys(a) : Object.keys(d);

  for (const coluna of colunas) {
    if (FORA_DA_DIFERENCA.includes(coluna)) continue;

    const de = comoTexto(a[coluna]);
    const para = operacao === 'D' ? null : comoTexto(d[coluna]);

    if (operacao === 'U' && de === para) continue;
    if (operacao === 'I' && para === null) continue;
    if (operacao === 'D' && de === null) continue;

    const cDe = cortar(de);
    const cPara = cortar(para);
    saida.push({
      coluna,
      de: cDe.valor,
      para: cPara.valor,
      ...(cDe.cortado || cPara.cortado ? { cortado: true as const } : {}),
    });
  }

  return saida;
}

/**
 * UM `U` QUE NAO MUDOU NADA EXISTE, e ele nao e defeito de quem le.
 *
 * O gatilho grava todo `UPDATE`, inclusive o que reescreve os mesmos valores —
 * e isso e proposital: "alguem mandou salvar as 14h" e um fato, mesmo que nada
 * tenha mudado de valor. A tela precisa poder dizer isso em vez de mostrar uma
 * lista vazia, que pareceria defeito.
 */
export const naoMudouNada = (operacao: OperacaoDaTrilha, m: readonly Mudanca[]): boolean =>
  operacao === 'U' && m.length === 0;
