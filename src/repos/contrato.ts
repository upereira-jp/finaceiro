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

// ------------------------------------------------- lancamento em lote

export type ResultadoDosContratos = {
  criados: Array<{
    numero_uc: string;
    unidade_consumidora_id: string;
    contrato_id: string;
    cliente_nome: string;
    originador_nome: string;
    /** O tier CONGELADO neste contrato (R20-b). Sai no relatorio porque ele
     *  decide quanto aquela pessoa recebe e nao ha caminho de edicao depois. */
    originador_tipo: string;
    usina: string;
    data_fechamento: Date;
    valor_referencia_centavos: number;
    /** Faturavel hoje - mesmo predicado da triagem. Um contrato numa UC nao
     *  faturavel e valido e nao e erro: o rateio e do CRM e volta a ser ativado. */
    fatura: boolean;
  }>;
  /** Ja havia contrato vigente (ativo ou suspenso) na UC. NAO e erro: e a R14
   *  fazendo o que deve, e e o que torna a segunda passada do mesmo arquivo
   *  inofensiva - reimportar tem de sair com `criados` em zero. */
  ja_tem_contrato: Array<{ numero_uc: string; contrato_id: string; status: string }>;
  /** UC da planilha que nao existe no cadastro. Nao e erro do arquivo - e a
   *  planilha e o banco discordando sobre quais UCs existem. */
  sem_uc: Array<{ numero_uc: string }>;
  /** UC cancelada ou suspensa. Cancelada saiu do rateio; suspensa nao fatura
   *  (R14), e assinar contrato numa UC suspensa e decisao de gente. */
  uc_nao_ativa: Array<{ numero_uc: string; status: string }>;
  /** Sem usina vinculada. `contrato_usina_fk` e NOT NULL e nao ha de onde vir o
   *  credito - e a mesma trava `uc_sem_usina` do botao da tela. */
  sem_usina: Array<{ numero_uc: string }>;
  /**
   * A R9 chegando ANTES de escrever, e e por isso que esta lista existe.
   *
   * `ativar()` recusa sem documento validado, e `rascunhar()` nao recusa. Um
   * lote que gravasse primeiro e ativasse depois deixaria um RASCUNHO ORFAO por
   * UC: rascunho nao ocupa a UC (a `uc_vigente` e gerada e fica nula), entao a
   * R14 nao o impede, a triagem continua dizendo `sem_contrato_vigente`, e a
   * rodada seguinte criaria outro. A pre-checagem usa `podeAtivarContrato`, a
   * MESMA funcao que `ativar` chama - duas condicoes seriam duas regras.
   */
  sem_documento: Array<{ numero_uc: string; cliente_nome: string; cliente_id: string }>;
  /** O uuid da planilha nao e um originador deste tenant, ou esta inativo. */
  sem_originador: Array<{ numero_uc: string; originador_id: string; motivo: 'nao_existe' | 'inativo' }>;
  /** UC ativa que a planilha nao cobriu, com o que ela tem hoje. Ausente nao e
   *  zero: o lancamento nao encerra contrato de quem nao veio no arquivo. */
  nao_cobertas: Array<{ numero_uc: string; tem_contrato: boolean; fatura: boolean }>;
};

/** O que uma linha da planilha manda gravar. Vem do leitor puro, ja validada
 *  quanto a FORMA - o que este modulo confere e a EXISTENCIA. */
export type ContratoDaPlanilha = {
  numero_uc: string;
  originador_id: string;
  data_fechamento: Date;
  valor_referencia_centavos: number;
  valor_referencia_origem: ValorReferenciaOrigem;
};

/**
 * Cria e ATIVA varios contratos de uma vez, casando por `numero_uc`.
 *
 * POR QUE ISTO EXISTE. O passo 6 do caminho para a primeira fatura sao 29
 * contratos, e ate 05/08/2026 o unico caminho era a tela, uma UC por vez. Nao e
 * questao de digitacao: `contrato` NAO TEM EDICAO. `rascunhar` congela o tier do
 * originador (R20-b), e nem originador, nem data de fechamento, nem valor se
 * alteram depois - o conserto e `encerrar` + `renovar`, que abre linha nova,
 * zera `faturas_cheias_pagas` e registra na trilha uma renovacao que nao houve.
 * Vinte e nove atos irreversiveis precisam de um ponto em que sejam revisaveis
 * de uma vez, e esse ponto e o arquivo.
 *
 * DECIDE TUDO ANTES DE ESCREVER QUALQUER COISA, e a razao aqui e diferente da do
 * `lancarDocumentosPorCliente`. La a conferencia de lote existe porque o indice
 * unico recusaria no MEIO, deixando metade escrita. Aqui o perigo e o RASCUNHO
 * ORFAO: `rascunhar` aceita sem documento e `ativar` recusa, entao a sequencia
 * ingenua grava uma linha que nao ocupa a UC, nao fatura e nao aparece em recusa
 * nenhuma - e a rodada seguinte grava outra. Ver `sem_documento`.
 *
 * E A EXCLUSAO E POR LINHA, NAO POR LOTE - tambem por escolha. Documentos aborta
 * o lote inteiro numa colisao porque uma escrita parcial la e irreconstruivel.
 * Aqui nao e: as UCs que passam viram contrato, as que nao passam ficam
 * exatamente como estavam, e reimportar o mesmo arquivo depois de destravar as
 * que faltavam grava so o que falta (`ja_tem_contrato` cobre o resto). Abortar
 * tudo por uma linha faria os 24 esperarem a `Q-CLIENTEDUP-01`.
 *
 * O QUE ESTA FUNCAO NAO FAZ, e os quatro sao deliberados:
 *   - nao encerra contrato de UC que a planilha nao trouxe (ausente nao e zero);
 *   - nao renova: UC com contrato vigente sai em `ja_tem_contrato`, intacta. A
 *     renovacao muda quem recebe comissao e zera o contador de faturas cheias -
 *     e ato de gente, uma UC por vez, nao efeito colateral de reimportar;
 *   - nao decide originador nem data - chegam do arquivo, conferidos por pessoa;
 *   - nao exige que a UC seja faturavel hoje: o rateio e do CRM e volta a ser
 *     ativado, e o contrato e nosso. Sai marcado, so isso.
 */
export async function lancarContratosPorUC(
  daPlanilha: readonly ContratoDaPlanilha[],
): Promise<ResultadoDosContratos> {
  await exigir('escrever_cadastro');
  const tx = dbt();

  for (const c of daPlanilha) {
    if (!Number.isInteger(c.valor_referencia_centavos)) {
      throw new TypeError(
        `UC ${c.numero_uc}: valor_referencia_centavos deve ser Int, recebeu ${c.valor_referencia_centavos}`);
    }
  }

  const ucs = await tx.unidade_consumidora.findMany({
    select: {
      id: true, numero_uc: true, status: true, usina_id: true, cliente_id: true,
      crm_usina_cliente_id: true, rateio_situacao: true,
      cliente: { select: { id: true, nome: true, documento_validado: true } },
      usina: { select: { codigo_geradora: true } },
    },
  });
  const porNumero = new Map(ucs.map((u) => [u.numero_uc, u]));

  const originadores = await tx.originador.findMany({
    select: { id: true, nome: true, tipo: true, ativo: true },
  });
  const porId = new Map(originadores.map((o) => [o.id, o]));

  /*
   * OS VIGENTES DE UMA VEZ, por `uc_vigente`. E a coluna GERADA que carrega o id
   * da UC so quando o contrato esta ativo ou suspenso - a mesma que sustenta o
   * indice da R14. Consultar por ela e ler exatamente o que o indice recusaria,
   * em vez de reimplementar "vigente" com uma lista de status que pode divergir.
   */
  const vigentes = await tx.contrato.findMany({
    where: { uc_vigente: { not: null } },
    select: { id: true, uc_vigente: true, status: true },
  });
  const vigentePorUC = new Map(vigentes.map((c) => [c.uc_vigente!, c]));

  const r: ResultadoDosContratos = {
    criados: [], ja_tem_contrato: [], sem_uc: [], uc_nao_ativa: [],
    sem_usina: [], sem_documento: [], sem_originador: [], nao_cobertas: [],
  };

  /*
   * PRIMEIRA PASSADA: so decide. Nada e escrito aqui, e e por isso que nenhuma
   * das recusas acima deixa rascunho para tras.
   */
  const aEscrever: Array<{
    uc: typeof ucs[number];
    originador: NonNullable<ReturnType<typeof porId.get>>;
    linha: ContratoDaPlanilha;
  }> = [];

  for (const linha of daPlanilha) {
    const uc = porNumero.get(linha.numero_uc);
    if (!uc) { r.sem_uc.push({ numero_uc: linha.numero_uc }); continue; }

    if (uc.status !== 'ativa') {
      r.uc_nao_ativa.push({ numero_uc: uc.numero_uc, status: uc.status });
      continue;
    }

    const vigente = vigentePorUC.get(uc.id);
    if (vigente) {
      r.ja_tem_contrato.push({
        numero_uc: uc.numero_uc, contrato_id: vigente.id, status: vigente.status,
      });
      continue;
    }

    if (!uc.usina_id) { r.sem_usina.push({ numero_uc: uc.numero_uc }); continue; }

    const o = porId.get(linha.originador_id);
    if (!o) {
      r.sem_originador.push({
        numero_uc: uc.numero_uc, originador_id: linha.originador_id, motivo: 'nao_existe',
      });
      continue;
    }
    if (!o.ativo) {
      r.sem_originador.push({
        numero_uc: uc.numero_uc, originador_id: linha.originador_id, motivo: 'inativo',
      });
      continue;
    }

    // R9, pela MESMA funcao que `ativar` chama. Ver `sem_documento`.
    if (!podeAtivarContrato(uc.cliente)) {
      r.sem_documento.push({
        numero_uc: uc.numero_uc, cliente_nome: uc.cliente.nome, cliente_id: uc.cliente.id,
      });
      continue;
    }

    aEscrever.push({ uc, originador: o, linha });
  }

  const cobertas = new Set(daPlanilha.map((c) => c.numero_uc));
  for (const u of ucs) {
    if (u.status !== 'ativa' || cobertas.has(u.numero_uc)) continue;
    r.nao_cobertas.push({
      numero_uc: u.numero_uc,
      tem_contrato: vigentePorUC.has(u.id),
      // O predicado da triagem, e nao "status = ativa". UC criada a mao
      // (`crm_usina_cliente_id` nulo) continua contando - o CRM nao sabe dela.
      fatura: u.crm_usina_cliente_id === null || u.rateio_situacao === 'ativado',
    });
  }

  /*
   * SEGUNDA PASSADA: escreve, e pelos MESMOS `rascunhar` e `ativar` que a rota e
   * a tela usam. Um INSERT direto aqui seria um segundo caminho de escrita de
   * contrato - e o tier congelado da R20-b e montado dentro do `rascunhar`.
   */
  for (const { uc, originador, linha } of aEscrever) {
    const novo = await rascunhar({
      cliente_id: uc.cliente_id,
      unidade_consumidora_id: uc.id,
      usina_id: uc.usina_id!,
      originador_id: originador.id,
      data_fechamento: linha.data_fechamento,
      valor_referencia_centavos: linha.valor_referencia_centavos,
      valor_referencia_origem: linha.valor_referencia_origem,
    });
    await ativar(novo.id);

    r.criados.push({
      numero_uc: uc.numero_uc,
      unidade_consumidora_id: uc.id,
      contrato_id: novo.id,
      cliente_nome: uc.cliente.nome,
      originador_nome: originador.nome,
      originador_tipo: originador.tipo,
      usina: uc.usina?.codigo_geradora ?? '',
      data_fechamento: linha.data_fechamento,
      valor_referencia_centavos: linha.valor_referencia_centavos,
      fatura: uc.crm_usina_cliente_id === null || uc.rateio_situacao === 'ativado',
    });
  }

  return r;
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
