// Repositorio de contrato. A R14 mora aqui do lado de fora e no indice
// contrato_vigente_unico_por_uc do lado de dentro - o banco recusa, este arquivo
// so garante que a ordem das operacoes nao provoque a recusa a toa.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { podeAtivarContrato } from '../dominio/documento.ts';
import type { valor_referencia_origem as ValorReferenciaOrigem } from '../generated/prisma/enums.ts';

export type NovoContrato = {
  cliente_id: string;
  unidade_consumidora_id: string;
  usina_id: string;
  originador_id?: string | null;
  data_fechamento: Date;
  valor_referencia_centavos: number;
  valor_referencia_origem: ValorReferenciaOrigem;
};

export class ContratoVigenteJaExiste extends Error {
  readonly status = 409;
  constructor(ucId: string) {
    super(
      `A unidade consumidora ${ucId} ja tem contrato vigente. R14: uma UC tem no ` +
      'maximo um contrato vigente, e vigente inclui suspenso. Encerre o atual antes.'
    );
    this.name = 'ContratoVigenteJaExiste';
  }
}

export class DocumentoNaoValidado extends Error {
  readonly status = 422;
  constructor() {
    super('R9: contrato so ativa com documento validado do cliente.');
    this.name = 'DocumentoNaoValidado';
  }
}

/**
 * O contrato que ocupa a UC hoje, ou null.
 *
 * findUnique de verdade, garantido pelo banco: (tenant_id, uc_vigente) e unique
 * CHEIO desde a migration r14_vigente_unico. Antes dela isto era um findFirst
 * sobre status='ativo' e a resposta dependia da ordem do heap.
 */
export async function vigenteDaUC(unidadeConsumidoraId: string) {
  await exigir('ler');
  return dbt().contrato.findUnique({
    where: {
      tenant_id_uc_vigente: {
        tenant_id: tenantCorrente(),
        uc_vigente: unidadeConsumidoraId,
      },
    },
  });
}

/** Historico completo da UC: rascunhos, encerrados e o vigente. */
export async function historicoDaUC(unidadeConsumidoraId: string) {
  await exigir('ler');
  return dbt().contrato.findMany({
    where: { unidade_consumidora_id: unidadeConsumidoraId },
    orderBy: [{ data_fechamento: 'desc' }],
  });
}

/** Nasce em rascunho. Rascunho nao ocupa a UC, entao nao disputa a R14. */
export async function rascunhar(e: NovoContrato) {
  await exigir('escrever_cadastro');
  if (!Number.isInteger(e.valor_referencia_centavos)) {
    throw new TypeError(`valor_referencia_centavos deve ser Int, recebeu ${e.valor_referencia_centavos}`);
  }

  const originador = e.originador_id
    ? await dbt().originador.findFirst({ where: { id: e.originador_id } })
    : null;

  return dbt().contrato.create({
    data: {
      tenant_id: tenantCorrente(),
      cliente_id: e.cliente_id,
      unidade_consumidora_id: e.unidade_consumidora_id,
      usina_id: e.usina_id,
      originador_id: e.originador_id ?? null,
      // R20: o tipo do originador CONGELA no fechamento. Ler depois de mudar o
      // cadastro pagaria a taxa de hoje num contrato de ontem.
      originador_tipo_no_fechamento: originador?.tipo ?? null,
      data_fechamento: e.data_fechamento,
      valor_referencia_centavos: e.valor_referencia_centavos,
      valor_referencia_origem: e.valor_referencia_origem,
      status: 'rascunho',
    },
  });
}

/**
 * Rascunho -> ativo. Aqui a UC passa a ser ocupada e a R14 vale.
 *
 * O 23505 do indice e traduzido para erro de negocio: violacao de constraint
 * chegando na API como 500 e o mesmo problema que este projeto persegue nas
 * policies - o modo de falha nao conta o que aconteceu.
 */
export async function ativar(contratoId: string) {
  await exigir('escrever_cadastro');
  const tx = dbt();

  const c = await tx.contrato.findFirst({
    where: { id: contratoId },
    include: { cliente: true },
  });
  if (!c) throw Object.assign(new Error('Contrato nao encontrado.'), { status: 404 });
  if (!podeAtivarContrato(c.cliente)) throw new DocumentoNaoValidado();   // R9

  try {
    await tx.contrato.update({ where: { id: contratoId }, data: { status: 'ativo' } });
  } catch (err: any) {
    if (err?.code === 'P2002') throw new ContratoVigenteJaExiste(c.unidade_consumidora_id);
    throw err;
  }
}

/**
 * Renovacao: encerra o vigente e assina o novo na MESMA unidade de trabalho.
 *
 * A ORDEM E OBRIGATORIA e foi medida em PG 17. Indice unico nao e DEFERRABLE:
 * inserir o novo ativo antes de encerrar o velho da 23505 no INSERT, mesmo que a
 * transacao fosse terminar consistente. Com UC limpa o teste passa dos dois
 * jeitos - por isso a ordem esta escrita aqui e coberta por teste proprio, em vez
 * de virar convencao que alguem lembra.
 *
 * O chamador ja esta dentro de withTenant(), entao isto E atomico.
 */
export async function renovar(e: NovoContrato) {
  await exigir('escrever_cadastro');
  const tx = dbt();

  const atual = await tx.contrato.findUnique({
    where: {
      tenant_id_uc_vigente: {
        tenant_id: tenantCorrente(),
        uc_vigente: e.unidade_consumidora_id,
      },
    },
  });

  // 1. LIBERA a UC. Antes do insert, sempre.
  if (atual) {
    await tx.contrato.update({ where: { id: atual.id }, data: { status: 'encerrado' } });
  }

  // 2. So agora ocupa.
  const novo = await rascunhar(e);
  await ativar(novo.id);
  return novo;
}

/** Suspenso continua ocupando a UC: rateio pausado, vinculo de pe. */
export async function suspender(contratoId: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().contrato.updateMany({
    where: { id: contratoId, status: 'ativo' },
    data: { status: 'suspenso' },
  });
  if (r.count === 0) throw Object.assign(new Error('Contrato ativo nao encontrado.'), { status: 404 });
}

/** Encerrar LIBERA a UC: uc_vigente vira NULL sozinha, e a coluna e gerada. */
export async function encerrar(contratoId: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().contrato.updateMany({
    where: { id: contratoId, status: { in: ['ativo', 'suspenso'] } },
    data: { status: 'encerrado' },
  });
  if (r.count === 0) throw Object.assign(new Error('Contrato vigente nao encontrado.'), { status: 404 });
}
