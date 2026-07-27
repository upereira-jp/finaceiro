// O motor do ciclo. SPEC-002 §4 e §4.3.
//
// Roda DENTRO de withTenant (R12, invariante 6): o conector nao tem caminho
// privilegiado, porque excecao de isolamento e ausencia de isolamento. Se ele
// pudesse ler sem contexto, a policy nao valeria para ele e a garantia inteira
// passaria a depender deste arquivo estar certo.
//
// A PORTA DE LEITURA E INJETADA, e nao e conveniencia de teste - e o que torna
// as invariantes 1 e 2 verificaveis. O motor nao conhece `pg`, nao monta SQL e
// nao sabe o nome de nenhuma tabela do CRM. Tudo que ele alcanca do outro lado
// passa por `PortaDeLeitura`, cuja unica implementacao real e leitura.ts, que so
// enxerga as oito views.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import type {
  VendaGanha, LeadArquivado, LeadMerge, ResultadoDeLeitura,
} from './leitura.ts';

/** O que o ciclo precisa do CRM. Deliberadamente menor que `LeitorCrm`. */
export type PortaDeLeitura = {
  crmTenantId: string;
  vendasGanhas():    Promise<ResultadoDeLeitura<VendaGanha>>;
  leadsArquivados(): Promise<ResultadoDeLeitura<LeadArquivado>>;
  leadMerges():      Promise<ResultadoDeLeitura<LeadMerge>>;
};

/** O funil cujo `won` NAO e venda. R14 e R15. */
const FUNIL_PARCEIROS = 'Parceiros';
/** Populacao volatil por desenho: some e volta a cada sync da G3. §4.3. */
const FUNIL_COPIA_DERIVADA = 'Clientes ativos - Assinatura';

export class CicloJaEmAndamento extends Error {
  readonly status = 409;
  constructor() {
    super('Ja ha um ciclo em andamento para este conector. O segundo nao inicia (SPEC-002 §7).');
    this.name = 'CicloJaEmAndamento';
  }
}

export class ConectorInativo extends Error {
  readonly status = 409;
  constructor(motivo: string) {
    super(`Conector nao pode executar: ${motivo}.`);
    this.name = 'ConectorInativo';
  }
}

export type Recusa = { lead_id: string; codigo: string; motivo: string };

export type ResultadoDoCiclo = {
  cicloId: string;
  status: 'ok' | 'parcial' | 'erro';
  lidos: number; criados: number; atualizados: number;
  desativados: number; recusados: number;
  recusas: Recusa[];
  /** Ausencias que exigem gente. §4.3, terceira classificacao. */
  filaDeRevisao: string[];
  garantiaDeTenantDegradada: boolean;
};

const texto = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

/**
 * Comparacao de Decimal SEM converter para number - a regra 1 proibe float ate em
 * calculo intermediario, e comparacao e calculo.
 *
 * NAO E PRECIOSISMO, e o teste N10 pegou: o `consumo_kwh` chega do CRM como
 * '850.0000' (numeric(14,4) serializado) e volta do nosso banco como Decimal que
 * imprime '850'. Comparados como texto, sao SEMPRE diferentes - e o conector
 * reescreveria todo cliente espelhado em todo ciclo, para sempre. A R3 cairia
 * sem nunca dar erro: os contadores diriam "atualizados: N" e ninguem
 * desconfiaria, porque atualizar e o que um sincronizador faz.
 *
 * A normalizacao e textual de proposito: corta zeros a direita da parte decimal
 * e o ponto orfao. '850.0000' e '850' viram '850'; '850.5000' e '850.50' viram
 * '850.5'. Nenhum passo passa por IEEE 754.
 */
function mesmoDecimal(a: unknown, b: unknown): boolean {
  const n = (v: unknown): string | null => {
    if (v == null) return null;
    const t = String(v).trim();
    if (!t) return null;
    return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  };
  return n(a) === n(b);
}

/**
 * R4 - dedup por `lead_id` ANTES de tocar cadastro.
 *
 * A ordem nao e estilo. `vendas_ganhas` devolve N linhas para um lead ganho em N
 * funis (P7). Deduplicar DEPOIS do upsert criaria a linha e a desfaria - e no
 * meio disso o `criado_em` ja teria sido gravado, o gatilho de auditoria ja
 * teria disparado duas vezes, e a segunda passada deixaria de ser idempotente.
 *
 * Qual das N vence: a de `ganho_em` mais recente. Empate resolve por `codigo`,
 * que e estavel - sem criterio de desempate deterministico, duas execucoes com
 * os mesmos dados poderiam gravar valores diferentes, e a R3 cairia.
 */
export function deduplicarPorLead(linhas: VendaGanha[]): VendaGanha[] {
  const por = new Map<string, VendaGanha>();
  for (const l of linhas) {
    const atual = por.get(l.lead_id);
    if (!atual) { por.set(l.lead_id, l); continue; }
    const t = new Date(l.ganho_em).getTime();
    const ta = new Date(atual.ganho_em).getTime();
    if (t > ta || (t === ta && l.codigo > atual.codigo)) por.set(l.lead_id, l);
  }
  return [...por.values()];
}

/**
 * R8, R9, R14 e R15 - o que o conector RECUSA em vez de adivinhar.
 *
 * Devolve `null` quando a linha e boa. O texto do motivo vai para
 * `conector_execucao.detalhe` e e o que alguem le para ir consertar no CRM.
 */
export function motivoDeRecusa(l: VendaGanha): string | null {
  // R8 - aliquota ambigua e recusada, NAO escolhida. Escolher em silencio e o
  // defeito que a correcao no CRM existe para eliminar; repeti-lo aqui anularia
  // a correcao. Vale so para card de venda: card de Parceiros nem le o campo.
  if (Number(l.comissionamento_n_opcoes ?? 0) > 1) {
    return `comissionamento ambiguo: ${l.comissionamento_n_opcoes} opcoes`;
  }
  /*
   * R9 - valor nulo nao e zero. Mas O QUE CONTA COMO VALOR depende do funil, e
   * isso foi medido no primeiro ciclo real, em 27/07:
   *
   *   Vendas - Assinatura   40 ganhos   0 com valor_venda   40 com consumo_kwh
   *   Vendas - Integracao    1 ganho    1 com valor_venda    0 com consumo_kwh
   *   Parceiros              7 ganhos   0 com valor_venda    0 com consumo_kwh
   *
   * A SPEC-002 R14 afirmava que "os funis de venda tem ZERO ganhos sem valor".
   * Era falso: 40 dos 41 ganhos de venda nao tem valor_venda nem valor_posicao.
   * O conector recusou os 40 - fez o certo, recusar em vez de adivinhar -, e a
   * contagem de recusas foi o que trouxe o problema a tona, que e exatamente o
   * que a invariante 8 existe para fazer.
   *
   * A LEITURA DO NEGOCIO, e ela ja estava na propria spec: assinatura de credito
   * de energia nao tem "valor da venda", tem CONSUMO MENSAL. A R10 manda faturar
   * por `consumo_kwh x tarifa` e trata valor do CRM como semente, nao verdade.
   * Exigir valor_venda num funil de assinatura e cobrar o campo errado.
   *
   * Decisao do dono, 27/07: `consumo_kwh` conta como valor. A recusa exige
   * ausencia dos TRES. Os 7 de Parceiros seguem fora pela R14, acima.
   *
   * PENDENTE, e nao foi improvisado aqui: a R10 tambem manda gravar
   * `consumo_referencia_centavos` como semente a partir de `consumo_reais`. Nao
   * implementei porque converter reais em centavos exige decidir arredondamento,
   * e a R23 proibe round() em intermediario. Registrado na Q-VALOR-01.
   */
  const temConsumo = l.consumo_kwh != null && String(l.consumo_kwh).trim() !== '';
  if (l.valor_venda == null && l.valor_posicao == null && !temConsumo) {
    return 'ganho sem valor e sem consumo_kwh';
  }
  return null;
}

/** R14/R15: card de Parceiros nao e venda e nao tem aliquota lida. */
export const ehCardDeParceiro = (l: VendaGanha) => l.funil === FUNIL_PARCEIROS;

/**
 * §4.3 - a classificacao da ausencia, e A ORDEM IMPORTA (R18).
 *
 * `lead_merges` PRIMEIRO, `leads_arquivados` depois, funil por ultimo. Vitima de
 * merge tem `ultimo_funil` NULL em `leads_arquivados`, porque as posicoes de
 * funil migram para o sobrevivente - testar funil antes classificaria vitima de
 * merge como "sumiu de verdade" e mandaria para fila humana o unico caso que o
 * sistema sabe resolver sozinho.
 */
export type ClasseDeAusencia =
  | { classe: 'mesclado'; sobreviventeId: string }
  | { classe: 'arquivado' }
  | { classe: 'copia_derivada' }
  | { classe: 'sumiu' };

export function classificarAusencia(
  leadId: string,
  merges: Map<string, string>,
  arquivados: Map<string, LeadArquivado>,
): ClasseDeAusencia {
  const sobrevivente = merges.get(leadId);
  if (sobrevivente) return { classe: 'mesclado', sobreviventeId: sobrevivente };

  const a = arquivados.get(leadId);
  if (a) {
    if (a.ultimo_funil === FUNIL_COPIA_DERIVADA) return { classe: 'copia_derivada' };
    return { classe: 'arquivado' };
  }
  return { classe: 'sumiu' };
}

// --------------------------------------------------------------- o ciclo

export async function executarCiclo(porta: PortaDeLeitura): Promise<ResultadoDoCiclo> {
  await exigir('administrar');
  const db = dbt();
  const tenantId = tenantCorrente();

  const conector = await db.conector_crm.findFirst({ where: { tenant_id: tenantId } });
  if (!conector) throw new ConectorInativo('nenhum conector cadastrado para este tenant');
  if (!conector.ativo) throw new ConectorInativo('conector marcado como inativo');
  if (!conector.credencial_ref) throw new ConectorInativo('credencial_ref vazia (SPEC-001 R5)');

  // Regra 6, e e o ponto em que ela deixa de ser convenção: o identificador do
  // CRM confere com o que o leitor foi construido para exigir. Se divergir, a
  // porta esta apontada para outro tenant do CRM.
  if (porta.crmTenantId !== conector.crm_tenant_id) {
    throw new ConectorInativo(
      `a porta de leitura esta em crm_tenant_id ${porta.crmTenantId} e o conector espera ${conector.crm_tenant_id}`
    );
  }

  const cicloId = crypto.randomUUID();
  let execucao;
  try {
    execucao = await db.conector_execucao.create({
      data: { tenant_id: tenantId, conector_id: conector.id, ciclo_id: cicloId },
    });
  } catch (e: any) {
    // 23P01 do EXCLUDE da migration 14. O banco recusou o segundo ciclo, e a
    // traducao para erro de negocio e o que impede isso de virar 500.
    if (e?.code === 'P2010' || String(e?.meta?.code ?? e?.code) === '23P01') throw new CicloJaEmAndamento();
    throw e;
  }

  const r: ResultadoDoCiclo = {
    cicloId, status: 'ok', lidos: 0, criados: 0, atualizados: 0,
    desativados: 0, recusados: 0, recusas: [], filaDeRevisao: [],
    garantiaDeTenantDegradada: false,
  };

  const fechar = async (detalhe: Record<string, unknown>) => {
    await db.conector_execucao.update({
      where: { id: execucao.id },
      data: {
        terminado_em: new Date(), status: r.status,
        lidos: r.lidos, criados: r.criados, atualizados: r.atualizados,
        desativados: r.desativados, recusados: r.recusados,
        detalhe: detalhe as any,
      },
    });
    await db.conector_crm.update({
      where: { id: conector.id },
      data: {
        ultimo_ciclo_id: cicloId,
        ultima_leitura_em: new Date(),
        ultimo_status: r.status === 'ok' ? 'ok' : 'erro',
        ultima_execucao_em: new Date(),
        ultimo_erro: r.status === 'ok' ? null : (detalhe.erro as string ?? 'ciclo nao concluiu'),
      },
    });
    return r;
  };

  const vendas = await porta.vendasGanhas();
  r.garantiaDeTenantDegradada = vendas.garantiaDegradada;
  r.lidos = vendas.linhas.length;

  /*
   * §7 - VIEW VAZIA NAO RECONCILIA, e este e o teste que impede o conector de
   * apagar a carteira inteira.
   *
   * Zero linhas e ambiguo: pode ser "nada mudou", pode ser "a view quebrou".
   * Tratar como full-scan valido desativaria todo cliente espelhado de uma vez,
   * e a desativacao em massa so seria notada quando alguem abrisse um relatorio.
   * Ambiguidade nao reconcilia - o ciclo morre em `erro` e nao toca em nada.
   */
  if (vendas.linhas.length === 0) {
    r.status = 'erro';
    return fechar({
      erro: 'vendas_ganhas devolveu zero linhas: ambiguo entre "nada mudou" e "view quebrou". Nada foi reconciliado.',
      garantia_de_tenant_degradada: r.garantiaDeTenantDegradada,
    });
  }

  // R4 - dedup ANTES do upsert.
  const unicos = deduplicarPorLead(vendas.linhas);

  const vistosNoCrm = new Set<string>();
  for (const l of unicos) {
    vistosNoCrm.add(l.lead_id);

    // R14/R15: card de Parceiros nao entra na base de valor e nao tem
    // `comissionamento` lido. Nao e recusa - e outra natureza de card.
    if (ehCardDeParceiro(l)) continue;

    const motivo = motivoDeRecusa(l);
    if (motivo) {
      r.recusados++;
      r.recusas.push({ lead_id: l.lead_id, codigo: l.codigo, motivo });
      continue;   // R8/R9: sem valor gravado, nunca palpite
    }

    const efeito = await espelharCliente(l, tenantId);
    if (efeito === 'criado') r.criados++;
    else if (efeito === 'atualizado') r.atualizados++;
  }

  // ------------------------------------------------- reconciliacao (§4.3)
  const [merges, arquivados] = await Promise.all([porta.leadMerges(), porta.leadsArquivados()]);
  const mapaMerge = new Map(merges.linhas.map((m) => [m.vitima_id, m.sobrevivente_id]));
  const mapaArq   = new Map(arquivados.linhas.map((a) => [a.lead_id, a]));

  const espelhados = await db.cliente.findMany({
    where: { tenant_id: tenantId, crm_lead_id: { not: null }, ativo: true },
    select: { id: true, crm_lead_id: true },
  });

  for (const c of espelhados) {
    const leadId = c.crm_lead_id!;
    if (vistosNoCrm.has(leadId)) continue;

    const cls = classificarAusencia(leadId, mapaMerge, mapaArq);
    if (cls.classe === 'copia_derivada') continue;      // nao desativa e nao conta
    if (cls.classe === 'sumiu') { r.filaDeRevisao.push(leadId); continue; }

    if (cls.classe === 'mesclado') {
      await fundirEspelho(c.id, leadId, cls.sobreviventeId, tenantId);
    }
    // R6 - NUNCA deleta. Ausencia explicada vira ativo = false, e e reversivel:
    // se o id voltar a aparecer, o upsert reativa.
    await db.cliente.update({ where: { id: c.id }, data: { ativo: false } });
    r.desativados++;
  }

  if (r.recusados > 0 || r.filaDeRevisao.length > 0) r.status = 'parcial';

  return fechar({
    recusas: r.recusas,
    fila_de_revisao: r.filaDeRevisao,
    garantia_de_tenant_degradada: r.garantiaDeTenantDegradada,
    ...(r.garantiaDeTenantDegradada ? {
      nota: 'Nenhuma view do CRM expoe coluna de tenant: a validacao por linha da ' +
            'SPEC-002 R1-b nao rodou. O isolamento depende do literal no corpo da ' +
            'view, do lado do CRM. Ver Q-VIEWS-01.',
    } : {}),
  });
}

/**
 * R3 - IDEMPOTENTE, e "sem tocar timestamp" e a parte dificil.
 *
 * Um upsert ingenuo grava sempre e mexe em `atualizado_em`; a segunda passada
 * ficaria indistinguivel da primeira, e "nada mudou" deixaria de ser observavel.
 * Por isso o caminho e: le, compara campo a campo, e so escreve se algo diferir.
 *
 * R5 - campo espelho o conector vence, campo local o usuario vence. A separacao
 * e por COLUNA e esta na SPEC-001 §3.3: aqui so entram colunas de espelho.
 * `documento` fica de fora de proposito - o CRM e semente, e sobrescrever
 * documento validado localmente com o do CRM seria o conector vencendo campo
 * local.
 */
async function espelharCliente(l: VendaGanha, tenantId: string): Promise<'criado' | 'atualizado' | 'igual'> {
  const db = dbt();
  const espelho = {
    nome: l.nome,
    telefone: texto(l.telefone),
    email: texto(l.email),
    origem: texto(l.funil),
    consumo_kwh: l.consumo_kwh,   // string: Decimal nunca vira number (regra 1)
  };

  const atual = await db.cliente.findFirst({
    where: { tenant_id: tenantId, crm_lead_id: l.lead_id },
    select: { id: true, nome: true, telefone: true, email: true, origem: true,
              consumo_kwh: true, ativo: true },
  });

  if (!atual) {
    await db.cliente.create({
      data: { tenant_id: tenantId, crm_lead_id: l.lead_id, ...espelho },
    });
    await escreverEstadoCrm(l.lead_id, tenantId);
    return 'criado';
  }

  const mudou =
    atual.nome !== espelho.nome ||
    atual.telefone !== espelho.telefone ||
    atual.email !== espelho.email ||
    atual.origem !== espelho.origem ||
    !mesmoDecimal(atual.consumo_kwh, espelho.consumo_kwh) ||
    atual.ativo !== true;   // reaparecer no CRM reativa (§4.3, ultima linha)

  if (!mudou) return 'igual';   // R3: zero escritas, inclusive timestamp

  await db.cliente.update({
    where: { id: atual.id },
    data: { ...espelho, ativo: true },
  });
  await escreverEstadoCrm(l.lead_id, tenantId);
  return 'atualizado';
}

/**
 * R7 e invariante 5 - `cliente_estado_crm` e escrito SO pelo conector.
 *
 * `em_carteira` nasce e permanece NULL ate a decisao de F2: nenhuma etapa de
 * funil marca o cliente pagante hoje (F-01b), e inventar um default aqui seria
 * exatamente o improviso que a regra 10 proibe.
 */
async function escreverEstadoCrm(leadId: string, tenantId: string): Promise<void> {
  const db = dbt();
  const cliente = await db.cliente.findFirst({
    where: { tenant_id: tenantId, crm_lead_id: leadId },
    select: { id: true },
  });
  if (!cliente) return;

  const atual = await db.cliente_estado_crm.findFirst({
    where: { tenant_id: tenantId, cliente_id: cliente.id },
  });

  if (!atual) {
    await db.cliente_estado_crm.create({
      data: {
        tenant_id: tenantId, cliente_id: cliente.id,
        tem_venda_ganha: true, tem_rateio_ativo: null, em_carteira: null,
        sincronizado_em: new Date(),
      },
    });
    return;
  }
  // R3 outra vez: so mexe se o booleano mudou. `sincronizado_em` acompanha a
  // mudanca, nao o ciclo - senao toda passada "atualizaria" a linha.
  if (atual.tem_venda_ganha !== true) {
    await db.cliente_estado_crm.update({
      where: { cliente_id: cliente.id },
      data: { tem_venda_ganha: true, sincronizado_em: new Date() },
    });
  }
}

/**
 * R18 - vitima de merge FUNDE, nao apenas desativa.
 *
 * Sem isto, contrato e UC do espelho da vitima ficam pendurados num cliente
 * inativo: o dado nao some, mas some do lugar onde alguem procuraria. A fusao
 * move os vinculos para o espelho do sobrevivente quando ele existe.
 */
async function fundirEspelho(
  clienteVitimaId: string, _leadVitima: string, leadSobrevivente: string, tenantId: string,
): Promise<void> {
  const db = dbt();
  const sobrevivente = await db.cliente.findFirst({
    where: { tenant_id: tenantId, crm_lead_id: leadSobrevivente },
    select: { id: true },
  });
  // Sobrevivente ainda nao espelhado: nao ha para onde mover. Desativa so, e o
  // proximo ciclo funde - o mapa de merge nao expira.
  if (!sobrevivente) return;

  await db.contrato.updateMany({
    where: { tenant_id: tenantId, cliente_id: clienteVitimaId },
    data: { cliente_id: sobrevivente.id },
  });
  await db.unidade_consumidora.updateMany({
    where: { tenant_id: tenantId, cliente_id: clienteVitimaId },
    data: { cliente_id: sobrevivente.id },
  });
}
