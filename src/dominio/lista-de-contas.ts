// A LISTA DE CONTAS A PAGAR NO SERVIDOR — as regras puras (sem banco).
//
// Ate 03/10/2026 a tela pedia `GET /contas-a-pagar` e recebia a tabela inteira
// ate um teto de 500, ORDENADA POR VENCIMENTO CRESCENTE. Passando do teto, as
// contas MAIS NOVAS sumiam sem aviso — justamente as que ainda vao ser pagas —,
// e o «saldo em aberto» e o aviso de vencidas eram somados sobre o que tinha
// chegado, nao sobre o que existe. Com o faturamento ligado nascem duas contas
// por cobranca paga (repasse e comissao), e o teto chegaria em poucos meses.
//
// O que mudou de lugar, e por que cada coisa precisa ser IGUAL nos dois lados:
//   - a busca, o filtro e a ordem foram para o servidor (o SQL esta em
//     `repos/conta_pagar.ts`); a tela so mostra o que ele devolve;
//   - os totais (em aberto, vencidas) sao contados sobre a tabela inteira;
//   - a tela carrega em blocos e diz quantas ha («200 de 1.340»), com «Mostrar
//     mais» no fim — e nao paginas de «Anterior/Proxima», que o DESIGN.md recusa
//     («tabelas inteiras, sem paginacao escondida»). Decisao em QUESTOES §2.x.
//
// O que mora AQUI e o que a suite sem banco consegue prender: os nomes das
// ordens, o peso de cada situacao (que tem de bater com o `pesoDoSelo` da tela,
// `web/tests/contas.ts`), a busca sem acento e a validacao dos parametros.

export const ORDENS_DA_LISTA = ['vencimento', 'beneficiario', 'descricao', 'valor', 'saldo', 'situacao'] as const;
export type OrdemDaLista = typeof ORDENS_DA_LISTA[number];

export const SITUACOES_DA_LISTA = ['aberta', 'parcial', 'paga', 'cancelada'] as const;
export type SituacaoDaLista = typeof SITUACOES_DA_LISTA[number];

/** O bloco que a tela pede quando nao pede nada, e o maximo que ela pode pedir. */
export const BLOCO_PADRAO = 200;
export const TETO_DO_BLOCO = 500;

/**
 * O PESO DE CADA SITUACAO na ordem «o que precisa de voce primeiro» — menor vem
 * antes. E o `pesoDoSelo(SELO_DA_CONTA_A_PAGAR[x])` da tela, copiado para o
 * servidor porque o `web/` e outro pacote e o SQL nao alcanca `tom-do-estado.ts`.
 * Copia sem guarda deriva: `web/tests/contas.ts` importa as duas e exige que
 * concordem nas cinco situacoes.
 *
 * `vencida` nao e status do banco — e a aberta ou parcial com vencimento antes
 * de hoje, a mesma regra de `estaAtrasada` na tela.
 */
export const PESO_DA_SITUACAO: Readonly<Record<SituacaoDaLista | 'vencida', number>> = {
  vencida: 0,
  aberta: 1,
  parcial: 1,
  cancelada: 3,
  paga: 4,
};

/**
 * A BUSCA SEM ACENTO, e a MESMA da tela (`normalizar` em `web/src/ui.tsx`):
 * minusculo, sem marca diacritica. Quem digita "joao" acha "João" — e a busca
 * no servidor nao pode ser mais exigente que a que existia no navegador.
 *
 * Do lado do banco a coluna passa por `translate` com `ACENTUADAS`/`SEM_ACENTO`
 * (sem a extensao `unaccent`, que o banco nao tem e cuja instalacao seria
 * migration nova); do lado de ca, o termo passa por esta funcao.
 */
export function normalizarBusca(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** As letras acentuadas do portugues (e vizinhas), maiusculas e minusculas. */
export const ACENTUADAS = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ';
/**
 * O QUE CADA UMA VIRA, DERIVADO e nao escrito. `translate` casa posicao a
 * posicao, e uma letra a mais de um lado desloca todas as seguintes: a primeira
 * versao, escrita a mao, tinha um «o» sobrando e transformava «Ú» em «o» e «Ç» em
 * «u» (medido antes do commit). Derivar pela mesma funcao que normaliza o termo
 * torna as duas pontas iguais por construcao.
 */
export const SEM_ACENTO = [...ACENTUADAS].map((c) => normalizarBusca(c)).join('');

/** O teto do termo. Busca e um nome ou um pedaco de descricao, nao um texto. */
export const TETO_DA_BUSCA = 100;

/**
 * O termo como padrao de `LIKE`: normalizado, com `%`, `_` e `\` escapados — sem
 * isso, buscar "50%" casaria tudo que tem "50" seguido de qualquer coisa. Vazio
 * (ou so espaco) e «sem busca», e devolve `null`.
 */
export function padraoDeBusca(bruto: string | null | undefined): string | null {
  const t = normalizarBusca((bruto ?? '').trim()).slice(0, TETO_DA_BUSCA);
  if (!t) return null;
  return `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ------------------------------------------------- os parametros da rota

export function ordemDaLista(v: string | null | undefined): OrdemDaLista {
  if (v == null || v === '') return 'vencimento';
  if (!(ORDENS_DA_LISTA as readonly string[]).includes(v)) {
    throw new TypeError(`ordem deve ser uma de ${ORDENS_DA_LISTA.join(', ')}, recebeu ${JSON.stringify(v)}`);
  }
  return v as OrdemDaLista;
}

export function situacaoDaLista(v: string | null | undefined): SituacaoDaLista | undefined {
  if (v == null || v === '') return undefined;
  if (!(SITUACOES_DA_LISTA as readonly string[]).includes(v)) {
    throw new TypeError(`situacao deve ser uma de ${SITUACOES_DA_LISTA.join(', ')}, recebeu ${JSON.stringify(v)}`);
  }
  return v as SituacaoDaLista;
}

/** Onde o bloco comeca (0 = a primeira conta). Negativo ou quebrado e pedido malformado. */
export function inicioDoBloco(v: string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`inicio deve ser inteiro >= 0, recebeu ${JSON.stringify(v)}`);
  return n;
}

/** O tamanho do bloco, entre 1 e o teto. Acima do teto vale o teto — o teto do
 *  servidor vence o pedido da tela, como na trilha. */
export function tamanhoDoBloco(pedido: number | undefined): number {
  return Math.min(Math.max(pedido ?? BLOCO_PADRAO, 1), TETO_DO_BLOCO);
}
