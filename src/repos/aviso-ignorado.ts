// O AVISO DE PAGAMENTO QUE O SISTEMA IGNOROU (migration 43, 03/10/2026).
//
// O webhook da Sicoob responde 200 a todo aviso que nao baixa — o titulo nao e de
// boleto deste tenant, ou o evento nao e pagamento —, porque 4xx/5xx fariam o
// banco reprocessar para sempre. Ate esta data o motivo ia SO para o journal, e em
// 03/10 havia seis avisos assim, todos de boletos emitidos a mao no portal:
// dinheiro entrando que o Financeiro nao registra. Aqui o aviso fica guardado com o
// que trazia, e o painel de saude o mostra.
//
// NAO E BAIXA. Nada aqui liquida fatura, nada entra em relatorio de dinheiro. E a
// prova de que o banco avisou, para alguem conferir.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';

export type MotivoDoAviso = 'titulo_desconhecido' | 'evento_ignorado';

export type AvisoIgnorado = {
  motivo: MotivoDoAviso;
  nosso_numero?: string | null;
  valor_centavos?: number | null;
  data_liquidacao?: Date | null;
  id_externo?: string | null;
  detalhe?: string | null;
};

/** O teto do texto do motivo, igual ao CHECK da migration. */
const TETO_DO_DETALHE = 500;

/**
 * Guarda o aviso. Chamada de dentro da rota do webhook, com o usuario de servico
 * (papel `cobranca`) — a mesma permissao da baixa, porque e o mesmo ato de receber
 * o aviso do banco.
 *
 * O MESMO PAGAMENTO NAO ENTRA DUAS VEZES: com `id_externo`, o indice unico parcial
 * da migration e o `skipDuplicates` (`ON CONFLICT DO NOTHING`) fazem uma repeticao
 * da Sicoob nao virar segunda linha.
 */
export async function registrar(a: AvisoIgnorado): Promise<void> {
  await exigir('escrever_carteira');
  await dbt().aviso_pagamento_ignorado.createMany({
    data: [{
      tenant_id: tenantCorrente(),
      motivo: a.motivo,
      nosso_numero: a.nosso_numero ?? null,
      valor_centavos: a.valor_centavos ?? null,
      data_liquidacao: a.data_liquidacao ?? null,
      id_externo: a.id_externo ?? null,
      detalhe: a.detalhe ? a.detalhe.slice(0, TETO_DO_DETALHE) : null,
    }],
    skipDuplicates: true,
  });
}

/** Quantos dias para tras o painel olha. */
export const JANELA_EM_DIAS = 30;
/** Quantos avisos a resposta lista. A contagem e a soma sao de todos. */
export const TETO_DA_LISTA = 50;

/**
 * Os avisos da janela, do mais novo ao mais antigo, com a contagem e a soma de
 * TODOS — a lista e cortada, os numeros nao. `ler`: o aviso nao traz dado pessoal
 * (nosso numero, valor, data), e quem opera a cobranca precisa ve-lo.
 *
 * CONTADOS POR MOTIVO, e nao numa soma so: «titulo que nao e deste sistema» e
 * dinheiro que entrou sem registro aqui; «evento que nao e pagamento» (um
 * cancelamento de baixa, uma baixa sem valor) nao e dinheiro nenhum. Somar os dois
 * numa frase faria um cancelamento parecer pagamento.
 */
export async function recentes(agora: Date = new Date()) {
  await exigir('ler');
  const db = dbt();
  const desde = new Date(agora.getTime() - JANELA_EM_DIAS * 24 * 60 * 60 * 1000);
  const onde = { recebido_em: { gte: desde } };

  const avisos = await db.aviso_pagamento_ignorado.findMany({
    where: onde,
    orderBy: [{ recebido_em: 'desc' }, { id: 'desc' }],
    take: TETO_DA_LISTA,
    select: {
      id: true, recebido_em: true, motivo: true, nosso_numero: true,
      valor_centavos: true, data_liquidacao: true, detalhe: true,
    },
  });
  const grupos = await db.aviso_pagamento_ignorado.groupBy({
    by: ['motivo'],
    where: onde,
    _count: { _all: true },
    _sum: { valor_centavos: true },
  });
  const de = (m: MotivoDoAviso) => grupos.find((g) => g.motivo === m);

  return {
    desde,
    janela_em_dias: JANELA_EM_DIAS,
    /** Pagamento de boleto que nao e deste sistema: o dinheiro entrou, o registro nao. */
    titulo_desconhecido: {
      total: de('titulo_desconhecido')?._count._all ?? 0,
      valor_centavos: de('titulo_desconhecido')?._sum.valor_centavos ?? 0,
    },
    /** Aviso que nao e pagamento — nao soma valor. */
    evento_ignorado: { total: de('evento_ignorado')?._count._all ?? 0 },
    avisos,
  };
}
