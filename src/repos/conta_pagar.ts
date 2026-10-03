// Repositorio de CONTA A PAGAR e PAGAMENTO - a vertente da empresa (PRD 4.4),
// na fatia que tinha prazo.
//
// DE ONDE ISTO VEM: `Q-PAGAMENTO-01`, decidida pelo dono em 03/08/2026. O PRD
// 5.5 manda quatro escritas na mesma transacao do split e `src/repos/split.ts`
// fazia duas. O sistema sabia ao centavo QUANTO devia ao dono da usina e ao
// originador, e nao tinha onde registrar que pagou.
//
// A DIVISAO DE TRABALHO COM O BANCO, e ela e deliberada: quase nenhuma regra
// mora aqui. `valor_pago_centavos` e `status` sao DERIVADOS por gatilho, o teto
// de pagamento e um CHECK, a imutabilidade do valor que nasceu de split e outro
// gatilho, e a unicidade da origem e um indice. Este arquivo compoe e le.
//
// O motivo e o de sempre neste projeto: uma regra que vive so na aplicacao vale
// ate o dia em que um segundo caminho escrever na tabela - e o segundo caminho
// aqui e o proprio split, que roda sozinho, sem ninguem por perto.

import { Prisma } from '../generated/prisma/client.ts';
import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import {
  PESO_DA_SITUACAO, ACENTUADAS, SEM_ACENTO, padraoDeBusca, tamanhoDoBloco,
  type OrdemDaLista, type SituacaoDaLista,
} from '../dominio/lista-de-contas.ts';
import type {
  tipo_beneficiario as TipoBeneficiario,
  forma_de_pagamento as FormaDePagamento,
  status_conta_pagar as StatusContaPagar,
} from '../generated/prisma/enums.ts';

export class ContaJaPaga extends Error {
  readonly status = 409;
  constructor(id: string) {
    super(
      `A conta ${id} ja tem pagamento registrado e nao pode ser cancelada. Cancelar deixaria ` +
      'um pagamento apontando para um titulo que "nao existe" - o mesmo furo que a R46 fecha na ' +
      'fatura liquidada. O caminho de desfazer e o estorno, e ele tem decisao propria (Q-ESTORNO-01).'
    );
    this.name = 'ContaJaPaga';
  }
}

export class PagamentoExcedeSaldo extends Error {
  readonly status = 422;
  constructor(devido: number, pago: number, tentado: number) {
    super(
      `Pagamento de ${tentado} centavos excede o saldo: a conta e de ${devido} e ja tem ${pago} ` +
      `pago, logo restam ${devido - pago}. Pagar a mais e o modo de falha que a Q-PAGAMENTO-01 ` +
      'nomeia - o banco recusa pelo CHECK `conta_pagar_nao_paga_demais`, e esta mensagem existe ' +
      'para o erro chegar a tela dizendo o que fazer em vez de "23514".'
    );
    this.name = 'PagamentoExcedeSaldo';
  }
}

/**
 * O VENCIMENTO PADRAO DE UMA CONTA NASCIDA DE SPLIT.
 *
 * O `PRD` 5.5 diz "vencimento default dia 10 do mes seguinte (configuravel)". O
 * dia 10 e do PRD e nao e escolha minha; **o "configuravel" e que nao tem dono
 * nem lugar**, e por isso esta aqui num objeto so, como a `POLITICA` da agenda,
 * em vez de espalhado - `Q-CONTAPAGAR-01`.
 *
 * "Mes seguinte" e contado a partir da COMPETENCIA do split, nao da data em que
 * o pagamento entrou: duas liquidacoes da mesma competencia, uma no dia 2 e
 * outra no dia 28, tem de gerar contas com o mesmo vencimento. Contar do caixa
 * faria o repasse de um dono vencer em datas diferentes por acidente de quando o
 * cliente pagou.
 */
export const POLITICA_DE_VENCIMENTO = {
  diaDoMes: 10,
  mesesAdiante: 1,
} as const;

export function vencimentoPadrao(competencia: Date): Date {
  const ano = competencia.getUTCFullYear();
  const mes = competencia.getUTCMonth() + POLITICA_DE_VENCIMENTO.mesesAdiante;
  // O ultimo dia do mes alvo, para o dia 10 nunca transbordar. Hoje e sempre 10
  // e nunca transborda; a conta esta aqui porque o numero e configuravel, e um
  // "dia 31" configurado depois cairia no mes seguinte sem esta linha.
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(POLITICA_DE_VENCIMENTO.diaDoMes, ultimo)));
}

// ------------------------------------------------------ plano gerencial

export async function criarCategoria(nome: string) {
  await exigir('escrever_corporativo');
  return dbt().categoria.create({ data: { tenant_id: tenantCorrente(), nome: nome.trim() } });
}

export async function listarCategorias() {
  await exigir('ler_corporativo');
  return dbt().categoria.findMany({ orderBy: [{ nome: 'asc' }] });
}

export async function criarCentroDeCusto(nome: string) {
  await exigir('escrever_corporativo');
  return dbt().centro_custo.create({ data: { tenant_id: tenantCorrente(), nome: nome.trim() } });
}

export async function listarCentrosDeCusto() {
  await exigir('ler_corporativo');
  return dbt().centro_custo.findMany({ orderBy: [{ nome: 'asc' }] });
}

// ------------------------------------------------------ o que nasce do split

/** Um item do split que vira despesa. `liquido_g3` NAO entra - e receita. */
export type DespesaDoSplit = {
  split_item_id: string;
  tipo: 'repasse_usina' | 'comissao' | 'repasse_concessionaria';
  valor_centavos: number;
  dono_usina_id: string | null;
  originador_id: string | null;
};

const BENEFICIARIO_DO_TIPO: Record<DespesaDoSplit['tipo'], TipoBeneficiario> = {
  repasse_usina:          'dono_usina',
  comissao:               'originador',
  repasse_concessionaria: 'concessionaria',
};

/**
 * Provisiona as contas a pagar de uma execucao de split. PRD 5.5, itens 2 e 3.
 *
 * CHAMADA DE DENTRO DA TRANSACAO DO SPLIT, e nao por rota. O PRD e explicito -
 * "na mesma transacao do split" - e a razao e a mesma que faz o split so rodar
 * na liquidacao: se isto fosse chamavel de fora, existiria um caminho para
 * provisionar despesa que nao corresponde a dinheiro que entrou.
 *
 * O QUE ELA NAO FAZ, e sao tres coisas com dono:
 *
 *   - NAO agrupa o repasse da concessionaria por competencia. O PRD diz
 *     "agrupavel", e agrupar exige decidir por qual chave e o que acontece com o
 *     vinculo `origem_split_item_id`, que e obrigatorio e unico. Uma conta por
 *     item e o que preserva a rastreabilidade item a item; agrupar depois e
 *     possivel, desagrupar nao. `Q-CONTAPAGAR-01`.
 *   - NAO classifica em categoria nem centro de custo. As duas tabelas nascem
 *     vazias de proposito (ver migration 22), e escolher um nome de categoria
 *     aqui seria semear o plano de contas de todo tenant futuro.
 *   - NAO desconta retencao. O valor e o BRUTO, como o PRD 4.4 manda - a
 *     retencao sobre PF sai no pagamento (Q-011).
 */
export async function provisionarDoSplit(entrada: {
  competencia: Date;
  itens: readonly DespesaDoSplit[];
  /** Para a descricao ficar legivel numa lista de contas a pagar sem join. */
  rotulo: string;
}): Promise<{ criadas: number }> {
  /*
   * NAO HA `exigir()` AQUI, e a ausencia e deliberada - vale escrever porque
   * toda outra escrita deste projeto tem uma.
   *
   * Quem chama e `repos/split.ts`, que ja exigiu `escrever_carteira`, e o
   * chamador dele e a baixa. Pela matriz do PRD 3, o papel `cobranca` pode dar
   * baixa (Carteira: total) e NAO pode escrever no Corporativo (traco). Exigir
   * `escrever_corporativo` aqui faria a baixa de um usuario de cobranca falhar
   * no meio - e o PRD 5.5 manda provisionar "na mesma transacao do split".
   *
   * A leitura certa e que estas linhas nao sao um ATO do usuario: sao
   * consequencia obrigatoria de um ato que ele podia praticar, como
   * `split_execucao` e `split_item`, que tambem nao pedem permissao propria. O
   * usuario nao escolhe provisionar; ele escolhe dar baixa, e o PRD decide o
   * resto. Quem escolhe - criar conta a mao, pagar, cancelar - passa por
   * `escrever_corporativo`, e essas sao as funcoes abaixo.
   */
  const tenant = tenantCorrente();
  const vencimento = vencimentoPadrao(entrada.competencia);

  /*
   * Item de valor ZERO nao vira conta. Um repasse de zero centavos e um titulo
   * que ninguem vai pagar e que fica na lista de pendencias para sempre - e o
   * CHECK `conta_pagar_valor_positivo` recusaria de qualquer forma, derrubando o
   * split inteiro por causa de uma linha que nao e despesa.
   */
  const aCriar = entrada.itens
    .filter((i) => i.valor_centavos > 0)
    .map((i) => ({
      tenant_id: tenant,
      descricao: `${rotuloDoTipo(i.tipo)} - ${entrada.rotulo}`,
      beneficiario_tipo: BENEFICIARIO_DO_TIPO[i.tipo],
      dono_usina_id: i.tipo === 'repasse_usina' ? i.dono_usina_id : null,
      originador_id: i.tipo === 'comissao' ? i.originador_id : null,
      beneficiario_nome: i.tipo === 'repasse_concessionaria' ? 'Concessionaria' : null,
      valor_centavos: i.valor_centavos,
      competencia: entrada.competencia,
      vencimento,
      origem_split_item_id: i.split_item_id,
    }));

  if (aCriar.length === 0) return { criadas: 0 };
  await dbt().conta_pagar.createMany({ data: aCriar });
  return { criadas: aCriar.length };
}

const rotuloDoTipo = (t: DespesaDoSplit['tipo']): string =>
  t === 'repasse_usina' ? 'Repasse ao dono da usina'
  : t === 'comissao' ? 'Comissao do originador'
  : 'Repasse a concessionaria';

// ------------------------------------------------------ a conta digitada

export type NovaContaManual = {
  descricao: string;
  beneficiario_nome: string;
  valor_centavos: number;
  competencia: Date;
  vencimento: Date;
  categoria_id?: string | null;
  centro_custo_id?: string | null;
};

/**
 * A conta a pagar que NAO nasce de split - aluguel, servico, imposto.
 *
 * `beneficiario_tipo` e sempre `outro`: as contas de `dono_usina` e
 * `originador` nascem do split e so de la. Deixar a tela criar um repasse a mao
 * abriria um segundo caminho para provisionar despesa a um beneficiario que o
 * split tambem provisiona, e os dois se somariam sem ninguem notar.
 */
export async function criarManual(e: NovaContaManual) {
  await exigir('escrever_corporativo');
  return dbt().conta_pagar.create({
    data: {
      tenant_id: tenantCorrente(),
      descricao: e.descricao.trim(),
      beneficiario_tipo: 'outro' as TipoBeneficiario,
      beneficiario_nome: e.beneficiario_nome.trim(),
      valor_centavos: e.valor_centavos,
      competencia: e.competencia,
      vencimento: e.vencimento,
      categoria_id: e.categoria_id ?? null,
      centro_custo_id: e.centro_custo_id ?? null,
    },
  });
}

export async function cancelar(id: string) {
  await exigir('escrever_corporativo');

  const c = await dbt().conta_pagar.findFirst({ where: { id } });
  if (!c) throw Object.assign(new Error('Conta a pagar nao encontrada.'), { status: 404 });
  if (c.valor_pago_centavos > 0) throw new ContaJaPaga(id);

  const r = await dbt().conta_pagar.updateMany({
    where: { id, status: { in: ['aberta', 'parcial'] } },
    data: { status: 'cancelada', cancelada_em: new Date() },
  });
  if (r.count === 0) throw Object.assign(new Error('Conta a pagar nao esta em aberto.'), { status: 409 });
}

// ------------------------------------------------------ o pagamento

export type NovoPagamento = {
  data_pagamento: Date;
  valor_centavos: number;
  forma: FormaDePagamento;
  referencia_externa?: string | null;
  observacao?: string | null;
  /**
   * JUROS/MULTA E DESCONTO (02/10/2026, a planilha da empresa). Ficam FORA de
   * `valor_centavos`, que continua sendo o que ABATE do titulo - assim o CHECK
   * contra pagar a mais nao muda. O que saiu do banco e valor + acrescimo -
   * desconto. Sem os dois, o pagamento e o de sempre.
   */
  acrescimo_centavos?: number;
  desconto_centavos?: number;
  /** De onde saiu o dinheiro (Conta PJ, adiantamento de socio). */
  origem_pagamento_id?: string | null;
};

function centavosNaoNegativos(v: unknown, campo: string): number {
  if (v === undefined || v === null) return 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw Object.assign(new Error(`${campo} precisa ser um inteiro de centavos >= 0.`), { status: 422 });
  }
  return v;
}

/**
 * Registra que uma conta foi paga, no todo ou em parte.
 *
 * O QUE ESTA FUNCAO NAO CONFERE, e nao e esquecimento: ela nao soma os
 * pagamentos anteriores para ver se cabe. Quem faz isso e o CHECK
 * `conta_pagar_nao_paga_demais`, depois de o gatilho recalcular a soma - e essa
 * ordem importa, porque conferir aqui seria conferir contra uma leitura que
 * outra transacao pode ter invalidado entre o SELECT e o INSERT.
 *
 * A leitura previa existe so para a MENSAGEM: sem ela o usuario receberia
 * "23514" e teria de adivinhar. Se as duas discordarem, quem vence e o banco.
 */
export async function registrarPagamento(contaPagarId: string, p: NovoPagamento) {
  await exigir('escrever_corporativo');

  const c = await dbt().conta_pagar.findFirst({ where: { id: contaPagarId } });
  if (!c) throw Object.assign(new Error('Conta a pagar nao encontrada.'), { status: 404 });
  if (c.status === 'cancelada') {
    throw Object.assign(new Error('Conta a pagar cancelada nao recebe pagamento.'), { status: 409 });
  }
  if (c.valor_pago_centavos + p.valor_centavos > c.valor_centavos) {
    throw new PagamentoExcedeSaldo(c.valor_centavos, c.valor_pago_centavos, p.valor_centavos);
  }
  /*
   * O SOCIO QUE PAGOU DO BOLSO (decisao do dono, 02/10/2026 - Q-SOCIOS-01):
   * «quando paga do bolso e uma divida da empresa com ele». A origem `socio`
   * faz nascer, logo abaixo e na MESMA transacao, a conta a pagar AO socio.
   * A divida ao socio nao se paga do bolso de um socio: isso trocaria uma divida
   * por outra igual, e o reembolso nunca terminaria.
   */
  const origemId = p.origem_pagamento_id?.trim() || null;
  const origem = origemId ? await dbt().origem_pagamento.findFirst({ where: { id: origemId } }) : null;
  if (origemId && !origem) {
    throw Object.assign(new Error('A origem do pagamento nao foi encontrada.'), { status: 404 });
  }
  const socio = origem?.tipo === 'socio' ? origem : null;
  if (socio && c.reembolso_de_pagamento_id) {
    throw Object.assign(new Error(
      'O reembolso a um socio sai da conta da empresa, nao do bolso de um socio: escolha a conta da empresa em «Saiu de».'),
      { status: 422 });
  }

  const acrescimo = centavosNaoNegativos(p.acrescimo_centavos, 'acrescimo_centavos');
  const desconto = centavosNaoNegativos(p.desconto_centavos, 'desconto_centavos');
  if (desconto > p.valor_centavos) {
    throw Object.assign(new Error('O desconto nao pode ser maior que o valor abatido do titulo.'), { status: 422 });
  }

  const pagamento = await dbt().pagamento.create({
    data: {
      tenant_id: tenantCorrente(),
      conta_pagar_id: contaPagarId,
      data_pagamento: p.data_pagamento,
      valor_centavos: p.valor_centavos,
      forma: p.forma,
      referencia_externa: p.referencia_externa?.trim() || null,
      observacao: p.observacao?.trim() || null,
      acrescimo_centavos: acrescimo,
      desconto_centavos: desconto,
      origem_pagamento_id: origemId,
    },
  });

  /* A divida com o socio: o que saiu do bolso dele (valor + juros - desconto),
   * devida desde o dia em que ele pagou. E divida, nao despesa - a despesa e a
   * conta que ele quitou -, e por isso fica fora do Painel e da Projecao. */
  const saiu = p.valor_centavos + acrescimo - desconto;
  if (socio && saiu > 0) {
    const d = p.data_pagamento;
    await dbt().conta_pagar.create({
      data: {
        tenant_id: tenantCorrente(),
        descricao: `Reembolso a ${socio.nome} — ${c.descricao}`,
        beneficiario_tipo: 'outro' as TipoBeneficiario,
        beneficiario_nome: socio.nome,
        valor_centavos: saiu,
        competencia: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
        vencimento: d,
        reembolso_de_pagamento_id: pagamento.id,
      },
    });
  }
  return pagamento;
}

// ------------------------------------------------------ leitura

export async function porId(id: string) {
  await exigir('ler_corporativo');
  return dbt().conta_pagar.findFirst({
    where: { id },
    include: {
      pagamento: { orderBy: [{ data_pagamento: 'asc' }] },
      dono_usina: { select: { nome: true, chave_pix: true, tipo_chave_pix: true } },
      originador: { select: { nome: true, chave_pix: true, tipo_chave_pix: true } },
      categoria: { select: { nome: true } },
      centro_custo: { select: { nome: true } },
    },
  });
}

/**
 * O QUE CADA CONTA DA LISTA TRAZ JUNTO — o nome de quem recebe, a categoria e os
 * pagamentos.
 *
 * OS PAGAMENTOS VEM JUNTO desde 10/09/2026, e a ausencia deles era um furo
 * de operacao e nao um detalhe de tela.
 *
 * A tela de Contas a pagar REGISTRA pagamento (`POST .../pagamentos`) e
 * nao mostrava nenhum: depois de pagar, a unica coisa visivel era o saldo
 * mudar. Numa conta paga em duas vezes ninguem conseguia responder "quando
 * foi a primeira, e por qual chave?" sem abrir o banco - e a razao pela
 * qual esta tela existe (`Q-PAGAMENTO-01`) e justamente que o sistema
 * sabia o quanto e nao sabia o SE.
 *
 * VEM NA LISTA e nao numa segunda chamada por conta: sao poucas linhas por
 * conta (uma ou duas), e uma leitura por linha aberta transformaria a tela
 * num enxame de requisicoes. O bloco (`TETO_DO_BLOCO`) e o que limita o peso.
 */
const RELACOES_DA_LISTA = {
  dono_usina: { select: { nome: true } },
  originador: { select: { nome: true } },
  categoria: { select: { nome: true } },
  pagamento: {
    select: {
      id: true, data_pagamento: true, valor_centavos: true,
      forma: true, referencia_externa: true, observacao: true,
    },
    orderBy: [{ data_pagamento: 'asc' }],
  },
} satisfies Prisma.conta_pagarInclude;

export type FiltroDaLista = {
  /** Onde o bloco comeca: 0 e a primeira conta na ordem pedida. */
  inicio?: number;
  limite?: number;
  /** Pedaco do nome de quem recebe ou da descricao. Sem acento dos dois lados. */
  busca?: string;
  situacao?: SituacaoDaLista;
  ordem?: OrdemDaLista;
  desc?: boolean;
};

/** Contagem e saldo de um recorte. Dinheiro em centavos, inteiro (regra 1). */
export type Total = { qtd: number; saldo_centavos: number };

/*
 * AS EXPRESSOES DA LISTA, uma vez so. Cada uma e a regra da tela escrita em SQL:
 *
 *   NOME      `nomeDoBeneficiario` — dono da usina, senao originador, senao o
 *             nome escrito, senao «(sem nome)». Nunca nulo, entao a ordem por
 *             ele nao precisa decidir onde mora o nulo.
 *   SALDO     `saldoCentavos` — o que falta, nunca negativo.
 *   HOJE      O DIA DE GOIANIA, e nao `current_date`: a sessao do banco esta em
 *             UTC, e das 21h a meia-noite o «hoje» dela ja e amanha — uma conta
 *             que vence hoje sairia vencida a noite.
 *   SITUACAO  `estaAtrasada` + `pesoDoSelo`: a aberta ou parcial vencida antes
 *             de hoje pesa como vencida; o resto, pelo status.
 */
const NOME = Prisma.sql`COALESCE(d.nome, o.nome, cp.beneficiario_nome, '(sem nome)')`;
const SALDO = Prisma.sql`GREATEST(0, cp.valor_centavos - cp.valor_pago_centavos)`;
const HOJE = Prisma.sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
const EM_ABERTO = Prisma.sql`cp.status IN ('aberta', 'parcial')`;
const VENCIDA = Prisma.sql`(${EM_ABERTO} AND cp.vencimento < ${HOJE})`;
const PESO = Prisma.sql`CASE
  WHEN ${VENCIDA} THEN ${PESO_DA_SITUACAO.vencida}::int
  WHEN cp.status = 'aberta' THEN ${PESO_DA_SITUACAO.aberta}::int
  WHEN cp.status = 'parcial' THEN ${PESO_DA_SITUACAO.parcial}::int
  WHEN cp.status = 'paga' THEN ${PESO_DA_SITUACAO.paga}::int
  ELSE ${PESO_DA_SITUACAO.cancelada}::int END`;
/** `normalizar` da tela, em SQL: sem acento e minusculo. Ver `lista-de-contas.ts`. */
const semAcento = (expr: Prisma.Sql) => Prisma.sql`lower(translate(${expr}, ${ACENTUADAS}, ${SEM_ACENTO}))`;

const EXPRESSAO_DA_ORDEM: Readonly<Record<OrdemDaLista, Prisma.Sql>> = {
  vencimento: Prisma.sql`cp.vencimento`,
  beneficiario: semAcento(NOME),
  descricao: semAcento(Prisma.sql`cp.descricao`),
  valor: Prisma.sql`cp.valor_centavos`,
  saldo: SALDO,
  situacao: PESO,
};

const DE_ONDE = Prisma.sql`FROM conta_pagar cp
  LEFT JOIN dono_usina d ON d.tenant_id = cp.tenant_id AND d.id = cp.dono_usina_id
  LEFT JOIN originador o ON o.tenant_id = cp.tenant_id AND o.id = cp.originador_id`;

/**
 * UM BLOCO DA LISTA, na ordem pedida, e os numeros da tabela inteira.
 *
 * O FILTRO E A ORDEM SAO SQL, e a pagina de contas e lida depois pelo Prisma: o
 * SQL decide QUAIS ids e em que ordem (o nome do beneficiario vem de tres
 * lugares, e o Prisma nao ordena por `COALESCE`); o `findMany` traz as relacoes
 * desses ids, que e o que ele faz bem. A RLS vale nas duas leituras — mesma
 * transacao, mesmo contexto de tenant —, e o `LEFT JOIN` em dono e originador
 * tambem passa por ela.
 *
 * O DESEMPATE E O DA TELA ANTIGA: vencimento, criacao e id, sempre crescentes.
 * Era a ordem em que a lista chegava, e o `sort` estavel do navegador a
 * preservava entre iguais; trocar o desempate faria contas de mesmo valor
 * mudarem de lugar sem ninguem ter pedido.
 *
 * Os totais NAO obedecem a busca nem ao filtro, e e de proposito: sao o que a
 * tela sempre mostrou — o saldo em aberto da empresa e as vencidas —, e um aviso
 * de vencidas que encolhesse com a busca esconderia a divida de quem nao foi
 * buscado.
 */
export async function pagina(f: FiltroDaLista = {}) {
  await exigir('ler_corporativo');
  const db = dbt();
  const inicio = Math.max(f.inicio ?? 0, 0);
  const limite = tamanhoDoBloco(f.limite);
  const padrao = padraoDeBusca(f.busca);

  const condicoes: Prisma.Sql[] = [];
  if (f.situacao) condicoes.push(Prisma.sql`cp.status = ${f.situacao}::status_conta_pagar`);
  if (padrao) {
    condicoes.push(Prisma.sql`(${semAcento(Prisma.sql`cp.descricao`)} LIKE ${padrao} ESCAPE '\\'
      OR ${semAcento(NOME)} LIKE ${padrao} ESCAPE '\\')`);
  }
  const onde = condicoes.length ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}` : Prisma.empty;
  const direcao = f.desc ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const ordem = EXPRESSAO_DA_ORDEM[f.ordem ?? 'vencimento'];

  /* EM SERIE, uma depois da outra: a transacao tem UMA conexao, e o `pg` acusa
   * duas consultas dividindo-a (`db/conexao-em-serie.ts`, 26/09). */
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT cp.id::text AS id ${DE_ONDE} ${onde}
    ORDER BY ${ordem} ${direcao}, cp.vencimento ASC, cp.criado_em ASC, cp.id ASC
    LIMIT ${limite} OFFSET ${inicio}`;

  const [{ n }] = await db.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n ${DE_ONDE} ${onde}`;

  const [t] = await db.$queryRaw<Array<{
    geral: number; aberto_qtd: number; aberto_saldo: bigint; vencidas_qtd: number; vencidas_saldo: bigint; hoje: string;
  }>>`
    SELECT count(*)::int AS geral,
           count(*) FILTER (WHERE ${EM_ABERTO})::int AS aberto_qtd,
           COALESCE(sum(${SALDO}) FILTER (WHERE ${EM_ABERTO}), 0)::bigint AS aberto_saldo,
           count(*) FILTER (WHERE ${VENCIDA})::int AS vencidas_qtd,
           COALESCE(sum(${SALDO}) FILTER (WHERE ${VENCIDA}), 0)::bigint AS vencidas_saldo,
           ${HOJE}::text AS hoje
    FROM conta_pagar cp`;

  const linhas = ids.length === 0 ? [] : await db.conta_pagar.findMany({
    where: { id: { in: ids.map((x) => x.id) } },
    include: RELACOES_DA_LISTA,
  });
  const posicao = new Map(ids.map((x, i) => [x.id, i]));
  linhas.sort((a, b) => posicao.get(a.id)! - posicao.get(b.id)!);

  return {
    itens: linhas,
    /** Quantas casam com a busca e o filtro. */
    total: n,
    /** Quantas existem, sem busca nem filtro — o «de 1.340» da tela. */
    total_geral: t.geral,
    inicio,
    limite,
    /** O dia de Goiania que o servidor usou para «vencida». A tela usa o mesmo. */
    hoje: t.hoje,
    totais: {
      em_aberto: { qtd: t.aberto_qtd, saldo_centavos: Number(t.aberto_saldo) } as Total,
      vencidas: { qtd: t.vencidas_qtd, saldo_centavos: Number(t.vencidas_saldo) } as Total,
    },
  };
}

/**
 * O que a tela abre primeiro: quanto se deve, a quem, e o que ja venceu.
 *
 * Feito em SQL e nao por `groupBy` do Prisma porque o `atrasadas` depende de
 * comparar `vencimento` com a data do BANCO. Comparar com a data do processo
 * poria o vencimento a merce do fuso de quem chamou - e a diferenca aparece
 * exatamente no dia do vencimento, que e quando alguem olha.
 */
export async function resumo() {
  await exigir('ler_corporativo');
  const r: any[] = await dbt().$queryRaw`
    SELECT beneficiario_tipo::text AS tipo,
           coalesce(d.nome, o.nome, c.beneficiario_nome, '(sem nome)') AS beneficiario,
           count(*)                                        AS titulos,
           sum(c.valor_centavos)                            AS devido_centavos,
           sum(c.valor_pago_centavos)                       AS pago_centavos,
           sum(c.valor_centavos - c.valor_pago_centavos)     AS saldo_centavos,
           count(*) FILTER (WHERE c.vencimento < current_date) AS atrasados
      FROM conta_pagar c
      LEFT JOIN dono_usina d ON d.tenant_id = c.tenant_id AND d.id = c.dono_usina_id
      LEFT JOIN originador o ON o.tenant_id = c.tenant_id AND o.id = c.originador_id
     WHERE c.status IN ('aberta','parcial')
     GROUP BY c.beneficiario_tipo, coalesce(d.nome, o.nome, c.beneficiario_nome, '(sem nome)')
     ORDER BY 6 DESC`;
  /* Sem `::int` nas somas - `sum(integer)` devolve bigint e o downcast estourava
   * com 22003 acima de R$ 21.474.836,47 em aberto. Ver a nota em fatura.ts. */
  return r.map((l) => ({
    ...l,
    titulos: Number(l.titulos), devido_centavos: Number(l.devido_centavos),
    pago_centavos: Number(l.pago_centavos), saldo_centavos: Number(l.saldo_centavos),
    atrasados: Number(l.atrasados),
  }));
}

/**
 * A CONFERENCIA QUE LIGA APURACAO A QUITACAO, e ela existe porque as duas podem
 * divergir sem que nenhuma das duas pareca errada.
 *
 * Todo `split_item` que gera despesa tem de ter exatamente uma conta a pagar, e
 * com o mesmo valor. O indice `conta_pagar_origem_unica` impede a segunda; o
 * gatilho `conta_pagar_de_split_imutavel` impede o valor mudar. O que nenhum
 * dos dois impede e a conta NAO EXISTIR - um split executado antes da migration
 * 22, ou um caminho futuro que esqueca de provisionar.
 *
 * Devolve o que falta. Lista vazia e o estado correto.
 */
export async function itensDeSplitSemConta() {
  await exigir('ler_corporativo');
  const r: any[] = await dbt().$queryRaw`
    SELECT si.id AS split_item_id, si.tipo::text AS tipo, si.valor_centavos::int,
           se.competencia
      FROM split_item si
      JOIN split_execucao se ON se.tenant_id = si.tenant_id AND se.id = si.split_execucao_id
     WHERE si.tipo <> 'liquido_g3'
       AND si.valor_centavos > 0
       AND NOT EXISTS (SELECT 1 FROM conta_pagar c
                        WHERE c.tenant_id = si.tenant_id AND c.origem_split_item_id = si.id)
     ORDER BY se.competencia, si.tipo`;
  return r;
}
