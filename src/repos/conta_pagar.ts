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

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
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
};

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

  return dbt().pagamento.create({
    data: {
      tenant_id: tenantCorrente(),
      conta_pagar_id: contaPagarId,
      data_pagamento: p.data_pagamento,
      valor_centavos: p.valor_centavos,
      forma: p.forma,
      referencia_externa: p.referencia_externa?.trim() || null,
      observacao: p.observacao?.trim() || null,
    },
  });
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

export async function listar(opcoes: {
  status?: StatusContaPagar;
  competencia?: Date;
  limite?: number;
} = {}) {
  await exigir('ler_corporativo');
  return dbt().conta_pagar.findMany({
    where: {
      ...(opcoes.status === undefined ? {} : { status: opcoes.status }),
      ...(opcoes.competencia === undefined ? {} : { competencia: opcoes.competencia }),
    },
    include: {
      dono_usina: { select: { nome: true } },
      originador: { select: { nome: true } },
      categoria: { select: { nome: true } },
    },
    orderBy: [{ vencimento: 'asc' }, { criado_em: 'asc' }],
    take: Math.min(opcoes.limite ?? 500, 2000),
  });
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
