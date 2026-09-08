// O QUE O CONECTOR ACHOU — a leitura do que ele grava a cada 15 minutos.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 08/09/2026, e a resposta e uma contagem
//
// `conector_execucao` existe desde a migration 14 (27/07/2026) e recebe, a cada
// rodada do `financeiro-ciclo.timer`, os contadores do ciclo mais um `detalhe`
// com as **divergencias**, as **recusas**, a **fila de revisao**, a
// `garantia_de_tenant_degradada`, o `credito_conferido` e as views novas ou
// ausentes no CRM.
//
// Varredura feita em 08/09/2026, e ela e o motivo deste arquivo:
//
//     conector_execucao em src/http/rotas.ts .... 0 ocorrencias
//     conector_execucao em src/repos/ ........... 0
//     conector_execucao em web/ ................. 0
//
// **Toda a arquitetura de sinal do conector era gravada e nunca lida.** A
// `SPEC-002` R25 escolheu a dedo quais condicoes viram sinal, e a invariante 8
// diz que *"`recusados > 0` e visivel em tabela, nunca so em log"* — e a tabela
// nao tinha leitor, entao "visivel" queria dizer visivel para quem abrisse o
// `psql`.
//
// O QUE ISSO CUSTAVA, medido na mesma varredura: o ciclo grava **29 divergencias
// e 1 recusa** a cada rodada. As 29 dizem que o originador do contrato nao bate
// com o vendedor congelado no CRM — *"conferir antes de faturar"*, R26. E o
// originador errado e o pior modo de falha deste sistema: `split.ts` so monta o
// item de comissao quando ha `originador_id` E tier congelado, entao a
// reparticao **roda, fecha e nao paga** — sem erro, sem log e sem recusa. Trinta
// linhas invisiveis apontando para dinheiro que nao sai.
//
// SO LE. Nao ha escrita aqui e nao vai haver: quem escreve e o conector, dentro
// do ciclo, e um segundo escritor criaria duas versoes da mesma historia.

import { dbt } from '../db/tipado.ts';
import { exigir } from '../db/contexto.ts';

/** Uma linha do que o conector achou e ninguem tinha onde ver. */
export type SinalDoConector = {
  entidade: string;
  chave: string;
  sinal: string;
};

export type ExecucaoDoConector = {
  id: string;
  ciclo_id: string;
  iniciado_em: Date;
  terminado_em: Date | null;
  status: string;
  lidos: number;
  criados: number;
  atualizados: number;
  desativados: number;
  recusados: number;
  /** As divergencias do ciclo — o que mudou de um lado e nao do outro. */
  divergencias: SinalDoConector[];
  /** O que o conector RECUSOU escrever, com o motivo. */
  recusas: SinalDoConector[];
  /** O que precisa de gente: espelho que nao casou por um caminho automatico. */
  fila_de_revisao: SinalDoConector[];
  /** Presente so quando o ciclo terminou mal. */
  erro: string | null;
  /** `false` quando o conector nao conseguiu conferir o credito congelado. */
  credito_conferido: boolean | null;
  /** `true` quando o filtro por tenant caiu para o caminho degradado. */
  garantia_de_tenant_degradada: boolean | null;
  /** Views que o CRM passou a expor e que o conector nao conhece, e o inverso. */
  views_novas_no_crm: string[];
  views_ausentes: string[];
};

/** O `detalhe` e `Json` e vem sem forma. Ler campo a campo, tolerando ausencia,
 *  e o que impede um ciclo antigo — gravado antes de um campo existir — de
 *  derrubar a leitura inteira. */
function sinais(v: unknown): SinalDoConector[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      entidade: String(x.entidade ?? '—'),
      chave: String(x.chave ?? '—'),
      sinal: String(x.sinal ?? ''),
    }))
    .filter((x) => x.sinal !== '');
}

const textos = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

const booleano = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/**
 * As ultimas rodadas do conector, da mais nova para a mais velha.
 *
 * O TETO E BAIXO DE PROPOSITO. O ciclo roda a cada 15 minutos — sao 96 linhas por
 * dia —, e a pergunta que esta leitura responde e "o que o conector esta achando
 * AGORA", nao "o historico do mes". Um teto alto convidaria a tela a virar
 * relatorio de auditoria, que e outra ferramenta e tem outro dono.
 */
export async function ultimasExecucoes(limite = 10): Promise<ExecucaoDoConector[]> {
  await exigir('ler');
  const linhas = await dbt().conector_execucao.findMany({
    orderBy: [{ iniciado_em: 'desc' }],
    take: Math.min(Math.max(limite, 1), 50),
  });

  return linhas.map((l: any) => {
    const d = (l.detalhe ?? {}) as Record<string, unknown>;
    return {
      id: l.id,
      ciclo_id: l.ciclo_id,
      iniciado_em: l.iniciado_em,
      terminado_em: l.terminado_em,
      status: l.status,
      lidos: l.lidos,
      criados: l.criados,
      atualizados: l.atualizados,
      desativados: l.desativados,
      recusados: l.recusados,
      divergencias: sinais(d.divergencias),
      recusas: sinais(d.recusas),
      fila_de_revisao: sinais(d.fila_de_revisao),
      erro: typeof d.erro === 'string' ? d.erro : null,
      credito_conferido: booleano(d.credito_conferido),
      garantia_de_tenant_degradada: booleano(d.garantia_de_tenant_degradada),
      views_novas_no_crm: textos(d.views_novas_no_crm),
      views_ausentes: textos(d.views_ausentes),
    };
  });
}
