// O motor do ciclo. SPEC-002 §4, §4.3 e R13.
//
// Roda DENTRO de contexto de tenant (R12, invariante 6): o conector nao tem
// caminho privilegiado, porque excecao de isolamento e ausencia de isolamento. Se
// ele pudesse ler sem contexto, a policy nao valeria para ele e a garantia inteira
// passaria a depender deste arquivo estar certo.
//
// O QUE MUDOU EM 27/07, E POR QUE E INVERSAO E NAO AJUSTE (Q-LOTE-01).
//
// A primeira versao rodava DENTRO de um withTenant do chamador: o ciclo inteiro
// numa transacao. Passou em 25 verificacoes com fixture de duas linhas e morreu no
// primeiro ciclo real, com P2028 aos 15.330 ms - 41 clientes, ~5 idas ao banco por
// cliente, ~205 viagens ate sa-east-1. A causa e LATENCIA, nao CPU, e por isso
// nenhum teste de logica a pegaria.
//
// A R13 sempre disse o que fazer: "um ciclo e uma unidade de trabalho POR LOTE,
// nao uma transacao gigante nem uma transacao por linha". Cumprir isso exige que o
// motor ABRA as transacoes, e nao seja passageiro de uma. Dai a inversao: o
// `AbrirLote` e injetado, pela mesma razao que a `PortaDeLeitura` e - o motor nao
// conhece `pg`, nao conhece o PrismaClient e nao emite contexto de tenant. Quem
// emite continua sendo `src/db/contexto.ts`, ponto unico, uma vez por lote.
//
// NAO FOI CONTORNADO SUBINDO O TIMEOUT. O criterio §8 e "ciclo com 1.000 linhas
// nao estoura o timeout de 15 s", e afrouxar o limite para caber 48 linhas
// entregaria um conector que quebra no primeiro mes de crescimento.
//
// A PORTA DE LEITURA E INJETADA, e nao e conveniencia de teste - e o que torna
// as invariantes 1 e 2 verificaveis. O motor nao conhece `pg`, nao monta SQL e
// nao sabe o nome de nenhuma tabela do CRM. Tudo que ele alcanca do outro lado
// passa por `PortaDeLeitura`, cuja unica implementacao real e leitura.ts, que so
// enxerga as oito views.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir, dentroDeUnidadeDeTrabalho } from '../db/contexto.ts';
import type {
  VendaGanha, LeadArquivado, LeadMerge, UsinaDoCrm, GeracaoMensal,
  RateioCliente, RateioCredito, ResultadoDeLeitura,
} from './leitura.ts';

/**
 * O que o ciclo precisa do CRM. Deliberadamente menor que `LeitorCrm`.
 *
 * SETE das oito views. A que falta e `parceiros`, que alimentaria `originador` -
 * F3, fora do escopo desta spec.
 *
 * `rateio_clientes` e `rateio_creditos` entraram em 28/07, com a decisao do dono
 * sobre a `F-01`: **espelho fiel**. Dos 36 `lead_id` do rateio, ZERO aparecem em
 * `vendas_ganhas`, e por nome os dois conjuntos coincidem em 24 pessoas - ou seja,
 * espelhar cria 24 clientes que sao a mesma pessoa que um ja espelhado.
 *
 * ISSO E DELIBERADO, e o argumento e que a duplicidade E FIEL: ela existe no CRM,
 * e o conector espelha, nao conserta a origem. Quando o dedup do CRM (em
 * desenvolvimento) mesclar os pares, `lead_merges` avisa e `fundirEspelho`
 * consolida sozinho - maquinaria que ja existe e e testada (N32-N34). E nao ha
 * risco de faturar duas vezes: a cobranca segue UC e contrato, e so o lead de
 * rateio tem UC.
 */
export type PortaDeLeitura = {
  crmTenantId: string;
  vendasGanhas():    Promise<ResultadoDeLeitura<VendaGanha>>;
  leadsArquivados(): Promise<ResultadoDeLeitura<LeadArquivado>>;
  leadMerges():      Promise<ResultadoDeLeitura<LeadMerge>>;
  usinas():          Promise<ResultadoDeLeitura<UsinaDoCrm>>;
  geracaoMensal():   Promise<ResultadoDeLeitura<GeracaoMensal>>;
  rateioClientes():  Promise<ResultadoDeLeitura<RateioCliente>>;
  rateioCreditos():  Promise<ResultadoDeLeitura<RateioCredito>>;
};

/**
 * UMA transacao com contexto de tenant emitido, por chamada. R13.
 *
 * A unica implementacao de producao e `app.withTenant(...)` - ver
 * `scripts/ciclo-crm.ts`. O motor nao sabe montar isto, e e proposital: um motor
 * que soubesse abrir contexto seria um segundo emissor, e a SPEC-001 §3.2 existe
 * para nao haver um segundo.
 */
export type AbrirLote = <T>(trabalho: () => Promise<T>) => Promise<T>;

/**
 * O tamanho declarado que a R13 pede. Nao e numero redondo por estetica.
 *
 * O que limita o lote e VIAGEM AO BANCO, nao linha. Com a leitura e a escrita em
 * bloco (um `findMany` por tabela, um `createMany` por tabela), o custo de um
 * lote nao cresce com o tamanho dele - EXCETO por uma viagem por cliente que
 * REALMENTE mudou, porque cada um muda para um valor diferente e nao ha update em
 * bloco possivel. E esse unico termo que fixa o numero.
 *
 * MEDIDO pelos N27, N29 e N30 (a extensao do Prisma conta toda operacao que sai
 * para o banco, inclusive o `set_config` do contexto):
 *
 *   lote de 50, nada mudou ......  4 viagens
 *   lote de 50, 50 criados ......  6 viagens
 *   lote de 50, 50 atualizados .. 54 viagens   <- o pior caso
 *
 * A 75 ms por viagem - a latencia ate `sa-east-1` que a Q-LOTE-01 registrou, 15.330
 * ms para ~205 viagens - o pior lote custa 4,05 s, com folga de 3,7x sobre o
 * timeout de 15 s do pool transacional. Um lote de 200 daria ~15,3 s no mesmo pior
 * caso, que e exatamente o penhasco em que a Q-LOTE-01 caiu.
 */
export const TAMANHO_DO_LOTE = 50;

/** O funil cujo `won` NAO e venda. R14 e R15. */
const FUNIL_PARCEIROS = 'Parceiros';
/**
 * Populacao volatil por desenho: some e volta a cada sync da G3. §4.3.
 *
 * ATENCAO - ESTE TRATAMENTO ESTA SOB REVISAO (`Q-ATIVOS-01`, aberta em 27/07).
 *
 * Classificar este funil como "copia derivada" (nao desativa, nao conta) veio da
 * resposta do dev em 26/07, e a medicao que a sustentou continua valida. Mas o
 * dono esclareceu em 27/07 que `Clientes ativos` e o **destino projetado do ganho
 * de rateio** - e a fonte de onde o financeiro deve puxar cliente ativo. Se isso
 * se confirmar depois de o CRM corrigir o `stage_type` da etapa de ganho, este
 * `continue` passa a IGNORAR exatamente a populacao que deveria ser lida.
 *
 * NAO FOI ALTERADO DE PROPOSITO: o funil esta vazio hoje, entao mudar agora seria
 * implementar contra um estado futuro, sem teste possivel e desfazendo por
 * deducao a classificacao que a medicao justificou. A regra 10 manda registrar e
 * parar - ver `Q-ATIVOS-01`.
 */
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

/**
 * A guarda da inversao. Chamar `executarCiclo` de dentro de um `withTenant` e o
 * erro natural de quem conhecia a assinatura antiga - e o sintoma seria
 * `ContextoAninhado` no primeiro lote, longe da causa. Aqui ele para na porta,
 * com o motivo.
 */
export class CicloDentroDeTransacao extends Error {
  constructor() {
    super(
      'executarCiclo() abre as PROPRIAS transacoes, uma por lote (SPEC-002 R13), e ' +
      'nao pode ser chamado de dentro de withTenant(). Chame-o fora e passe o ' +
      'abridor de lote: executarCiclo(porta, (t) => app.withTenant(sessao, tenantId, () => t())).'
    );
    this.name = 'CicloDentroDeTransacao';
  }
}

export type Recusa = { lead_id: string; codigo: string; motivo: string };

export type Entidade = 'cliente' | 'usina' | 'usina_geracao' | 'unidade_consumidora';
export type ContagemDeEntidade = { lidos: number; criados: number; atualizados: number; recusados: number };

/**
 * Por que os contadores de `conector_execucao` continuam sendo UM conjunto e a
 * quebra por entidade vai no `detalhe`.
 *
 * A alternativa era migration nova com cinco colunas por entidade. Nao vale: os
 * contadores da tabela existem para a invariante 8 - "`recusados > 0` e visivel
 * em tabela, nunca so em log" -, e essa pergunta ("alguem precisa olhar o CRM?")
 * e respondida pelo TOTAL. Quem quer saber *o que* foi recusado ja precisa abrir
 * o `detalhe`, onde o motivo de cada recusa esta desde a migration 14.
 *
 * O criterio da R3 tambem sobrevive inteiro: "segunda passada com 0 criados e 0
 * atualizados" vale para a soma exatamente como valeria para cada parcela.
 */
const zerado = (): ContagemDeEntidade => ({ lidos: 0, criados: 0, atualizados: 0, recusados: 0 });

export type ResultadoDoCiclo = {
  cicloId: string;
  status: 'ok' | 'parcial' | 'erro';
  lidos: number; criados: number; atualizados: number;
  desativados: number; recusados: number;
  recusas: Recusa[];
  /** Ausencias que exigem gente. §4.3, terceira classificacao. */
  filaDeRevisao: string[];
  garantiaDeTenantDegradada: boolean;
  /** A quebra dos contadores por entidade. Vai para `conector_execucao.detalhe`. */
  porEntidade: Record<Entidade, ContagemDeEntidade>;
  /** R13 - quantas transacoes o ciclo abriu. Uma delas gigante e o defeito. */
  transacoes: number;
  /** Maior numero de leads que uma unica transacao carregou. Nunca > tamanho do lote. */
  maiorLote: number;
  /**
   * `false` quando o fechamento nao encontrou a linha de `conector_execucao` -
   * o que e o normal do ensaio, onde cada lote leva ROLLBACK e a linha de
   * abertura nunca chegou a existir. Em modo valendo, `false` aqui e defeito.
   */
  execucaoGravada: boolean;
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

/** Fatia em lotes de tamanho declarado. R13. */
export function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new TypeError(`tamanho de lote invalido: ${JSON.stringify(tamanho)}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
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
 * O que faz uma usina do CRM ser recusada ANTES de procurar o espelho.
 *
 * Sobrou uma conferencia so - a chave de negocio existe? -, porque a
 * `distribuidora` SAIU deste teste em 28/07, e a saida dela e a parte interessante.
 *
 * O QUE MUDOU, E POR QUE E RECLASSIFICACAO E NAO AFROUXAMENTO. Em 27/07 a R19
 * nasceu como "usina sem distribuidora e recusa contada", supondo que o CRM
 * deveria preencher o campo e ainda nao preenchia. A resposta do dev em 28/07
 * mostrou que a PREMISSA estava errada: a view e projecao direta, o `''` esta na
 * coluna de origem, o campo e input de texto livre inicializado com `""` - e, o
 * que decide, NAO EXISTE TABELA DE REFERENCIA DE DISTRIBUIDORAS NO CRM.
 *
 * A distribuidora nao e um dado deles que esta faltando. E um dado NOSSO. Logo e
 * CAMPO LOCAL (`SPEC-001` §3.3), e campo local o usuario vence: o conector nunca
 * a escreve, nem na criacao. Como a coluna e `NOT NULL` com FK, segue que **o
 * conector nao cria usina** - ele espelha as que alguem cadastrou. Ver
 * `espelharUsinas`.
 *
 * A recusa continua existindo e continua contada; o que mudou foi de QUEM ela
 * cobra acao. Antes cobrava do dev do CRM, e era o endereco errado.
 */
export function motivoDeRecusaDeUsina(u: UsinaDoCrm): string | null {
  const codigo = texto(u.codigo_geradora);
  if (!codigo) return 'usina sem codigo_geradora - e a chave de negocio do espelho';
  return null;
}

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

export type OpcoesDoCiclo = {
  /** R13, lote declarado. O default e `TAMANHO_DO_LOTE`; o teste usa outros. */
  tamanhoDoLote?: number;
};

export async function executarCiclo(
  porta: PortaDeLeitura,
  abrirLote: AbrirLote,
  opcoes: OpcoesDoCiclo = {},
): Promise<ResultadoDoCiclo> {
  if (dentroDeUnidadeDeTrabalho()) throw new CicloDentroDeTransacao();
  const tamanho = opcoes.tamanhoDoLote ?? TAMANHO_DO_LOTE;

  const r: ResultadoDoCiclo = {
    cicloId: crypto.randomUUID(), status: 'ok',
    lidos: 0, criados: 0, atualizados: 0, desativados: 0, recusados: 0,
    recusas: [], filaDeRevisao: [], garantiaDeTenantDegradada: false,
    porEntidade: { cliente: zerado(), usina: zerado(), usina_geracao: zerado(),
                   unidade_consumidora: zerado() },
    transacoes: 0, maiorLote: 0, execucaoGravada: false,
  };

  /** Toda transacao do ciclo passa por aqui, e por isso `transacoes` e confiavel. */
  const lote = <T>(trabalho: () => Promise<T>): Promise<T> => {
    r.transacoes++;
    return abrirLote(trabalho);
  };

  // ---------------------------------------------------- transacao 1: abertura
  //
  // Curta de proposito: papel, conferencias e a linha de `conector_execucao`. E
  // ela que COMMITA o `em_andamento`, e so depois disso o EXCLUDE da migration
  // 14 passa a valer de verdade contra um segundo ciclo concorrente - na versao
  // de transacao unica a linha nascia e morria dentro da mesma transacao, e a
  // §7 ("o segundo nao inicia") era letra morta fora de um teste.
  const execucaoId = crypto.randomUUID();
  const abertura = await lote(async () => {
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

    try {
      await db.conector_execucao.create({
        data: { id: execucaoId, tenant_id: tenantId, conector_id: conector.id, ciclo_id: r.cicloId },
      });
    } catch (e: any) {
      // 23P01 do EXCLUDE da migration 14. O banco recusou o segundo ciclo, e a
      // traducao para erro de negocio e o que impede isso de virar 500.
      if (e?.code === 'P2010' || String(e?.meta?.code ?? e?.code) === '23P01') throw new CicloJaEmAndamento();
      throw e;
    }
    return { tenantId, conectorId: conector.id };
  });

  const { tenantId, conectorId } = abertura;

  /** Contadores ao fim de CADA lote. R13, e e o que sobrevive a um ciclo que morre. */
  const gravarContadores = async () => {
    await dbt().conector_execucao.updateMany({
      where: { tenant_id: tenantId, id: execucaoId },
      data: {
        lidos: r.lidos, criados: r.criados, atualizados: r.atualizados,
        desativados: r.desativados, recusados: r.recusados,
      },
    });
  };

  const fechar = async (detalhe: Record<string, unknown>) => {
    await lote(async () => {
      const db = dbt();
      const n = await db.conector_execucao.updateMany({
        where: { tenant_id: tenantId, id: execucaoId },
        data: {
          terminado_em: new Date(), status: r.status,
          lidos: r.lidos, criados: r.criados, atualizados: r.atualizados,
          desativados: r.desativados, recusados: r.recusados,
          detalhe: detalhe as any,
        },
      });
      r.execucaoGravada = n.count > 0;
      await db.conector_crm.updateMany({
        where: { tenant_id: tenantId, id: conectorId },
        data: {
          ultimo_ciclo_id: r.cicloId,
          ultima_leitura_em: new Date(),
          ultimo_status: r.status === 'ok' ? 'ok' : 'erro',
          ultima_execucao_em: new Date(),
          /*
           * `conector_status` so tem ok|erro|nunca_executou, entao 'parcial' cai em
           * 'erro' - e a mensagem tinha que parar de dizer "ciclo nao concluiu",
           * porque um ciclo parcial CONCLUIU: ele recusou linhas e registrou o
           * motivo. A distincao deixou de ser teorica em 27/07, quando o espelho de
           * usina entrou: com as 3 usinas sem distribuidora no CRM, TODO ciclo passa
           * a ser parcial ate o dev corrigir, e "nao concluiu" mandaria procurar uma
           * falha que nao existe.
           */
          ultimo_erro: r.status === 'ok' ? null
            : (detalhe.erro as string
               ?? `ciclo concluiu PARCIAL: ${r.recusados} recusa(s) e ${r.filaDeRevisao.length} em fila de revisao. `
                  + 'O motivo de cada uma esta em conector_execucao.detalhe.'),
        },
      });
    });
    return r;
  };

  try {
    return await processar(porta, r, tenantId, tamanho, lote, gravarContadores, fechar);
  } catch (e: any) {
    /*
     * §7, linha "ciclo morre no meio": o que ja foi processado esta COMMITADO por
     * lote, e o registro tem que dizer isso. Fechar aqui e o que impede a linha
     * de ficar `em_andamento` para sempre - e o EXCLUDE da migration 14 travaria
     * o conector no proximo ciclo, permanentemente.
     *
     * O erro original e RELANCADO: fechar o registro nao e tratar a falha. Se o
     * proprio fechamento falhar, o erro do fechamento nao pode esconder o
     * primeiro - dai o catch aninhado.
     */
    const houveTrabalho = r.criados + r.atualizados + r.desativados > 0;
    r.status = houveTrabalho ? 'parcial' : 'erro';
    try {
      await fechar({
        erro: `ciclo interrompido: ${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`,
        recusas: r.recusas,
        fila_de_revisao: r.filaDeRevisao,
        commitado_por_lote: houveTrabalho,
        garantia_de_tenant_degradada: r.garantiaDeTenantDegradada,
      });
    } catch (aoFechar: any) {
      e.aoFechar = aoFechar;
    }
    throw e;
  }
}

async function processar(
  porta: PortaDeLeitura,
  r: ResultadoDoCiclo,
  tenantId: string,
  tamanho: number,
  lote: AbrirLote,
  gravarContadores: () => Promise<void>,
  fechar: (detalhe: Record<string, unknown>) => Promise<ResultadoDoCiclo>,
): Promise<ResultadoDoCiclo> {
  // A leitura do CRM acontece FORA de transacao nossa, de proposito: e rede para
  // outro banco, e segurar a nossa conexao enquanto ela corre e o desperdicio que
  // a Q-LOTE-01 pagou. O pool transacional tem teto; conexao presa em espera de
  // rede alheia e conexao que falta para o resto do sistema.
  const vendas = await porta.vendasGanhas();
  r.garantiaDeTenantDegradada = vendas.garantiaDegradada;
  r.lidos = vendas.linhas.length;
  r.porEntidade.cliente.lidos = vendas.linhas.length;

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

  // A triagem e em memoria e nao custa viagem: separa o que vira cadastro do que
  // e recusa (R8/R9) e do que e card de Parceiros (R14/R15). So o primeiro grupo
  // entra em lote - recusa e card de parceiro nao tocam o banco.
  const vistosNoCrm = new Set<string>();
  const aEspelhar: VendaGanha[] = [];
  for (const l of unicos) {
    vistosNoCrm.add(l.lead_id);
    if (ehCardDeParceiro(l)) continue;
    const motivo = motivoDeRecusa(l);
    if (motivo) {
      r.recusados++;
      r.porEntidade.cliente.recusados++;
      r.recusas.push({ lead_id: l.lead_id, codigo: l.codigo, motivo });
      continue;   // R8/R9: sem valor gravado, nunca palpite
    }
    aEspelhar.push(l);
  }

  // ------------------------------------------------- os lotes de cadastro (R13)
  for (const bloco of emLotes(aEspelhar, tamanho)) {
    r.maiorLote = Math.max(r.maiorLote, bloco.length);
    await lote(async () => {
      await espelharLote(bloco, tenantId, r);
      await gravarContadores();
    });
  }

  // --------------------------------------- usina e usina_geracao (§2 "Entra")
  //
  // A ORDEM E OBRIGATORIA: `usina_geracao` tem FK composta para `usina`, entao a
  // usina precisa estar COMMITADA antes. Nao e preferencia - com os dois no mesmo
  // lote, uma geracao de usina recusada derrubaria o lote inteiro com 23503.
  await espelharUsinas(porta, r, tenantId, tamanho, lote, gravarContadores);
  await espelharGeracao(porta, r, tenantId, tamanho, lote, gravarContadores);
  // Depois das usinas pelo mesmo motivo da geracao: a UC herda a distribuidora
  // da usina e referencia ela por FK composta. E `vistosNoCrm` recebe os leads do
  // rateio para que a reconciliacao nao os classifique como ausentes.
  await espelharUnidades(porta, r, tenantId, tamanho, lote, gravarContadores, vistosNoCrm);

  // ------------------------------------------------- reconciliacao (§4.3)
  // Outra leitura fora de transacao, pelo mesmo motivo.
  const [merges, arquivados] = await Promise.all([porta.leadMerges(), porta.leadsArquivados()]);
  const mapaMerge = new Map(merges.linhas.map((m) => [m.vitima_id, m.sobrevivente_id]));
  const mapaArq   = new Map(arquivados.linhas.map((a) => [a.lead_id, a]));

  const espelhados: { id: string; crm_lead_id: string | null }[] = await lote(async () =>
    dbt().cliente.findMany({
      where: { tenant_id: tenantId, crm_lead_id: { not: null }, ativo: true },
      select: { id: true, crm_lead_id: true },
    }));

  type Ausente = { clienteId: string; leadId: string; sobreviventeLead?: string };
  const aDesativar: Ausente[] = [];
  for (const c of espelhados) {
    const leadId = c.crm_lead_id!;
    if (vistosNoCrm.has(leadId)) continue;

    const cls = classificarAusencia(leadId, mapaMerge, mapaArq);
    if (cls.classe === 'copia_derivada') continue;      // nao desativa e nao conta
    if (cls.classe === 'sumiu') { r.filaDeRevisao.push(leadId); continue; }

    aDesativar.push({
      clienteId: c.id, leadId,
      sobreviventeLead: cls.classe === 'mesclado' ? cls.sobreviventeId : undefined,
    });
  }

  for (const bloco of emLotes(aDesativar, tamanho)) {
    r.maiorLote = Math.max(r.maiorLote, bloco.length);
    await lote(async () => {
      await desativarLote(bloco, tenantId);
      r.desativados += bloco.length;
      await gravarContadores();
    });
  }

  if (r.recusados > 0 || r.filaDeRevisao.length > 0) r.status = 'parcial';

  return fechar({
    recusas: r.recusas,
    fila_de_revisao: r.filaDeRevisao,
    lotes: { tamanho, transacoes: r.transacoes, maior_lote: r.maiorLote },
    por_entidade: r.porEntidade,
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
 *
 * POR QUE EM BLOCO, e nao um cliente por vez (Q-LOTE-01). A versao anterior
 * gastava 5 viagens por cliente - `findFirst`, `create`, `findFirst` de novo
 * dentro de `escreverEstadoCrm`, `findFirst` do estado, `create` do estado - e a
 * terceira era pura ineficiencia: `escreverEstadoCrm` reconsultava o cliente por
 * `crm_lead_id` com o `id` ja em maos. Aqui sao DUAS leituras e ate QUATRO
 * escritas por lote inteiro, mais uma viagem por cliente que realmente mudou.
 * O `id` e gerado aqui, do nosso lado, exatamente para que `createMany` sirva:
 * sem ele nao ha como saber os ids recem-criados sem uma releitura.
 */
async function espelharLote(
  bloco: VendaGanha[], tenantId: string, r: ResultadoDoCiclo,
): Promise<void> {
  const db = dbt();
  const leadIds = bloco.map((l) => l.lead_id);

  const atuais = await db.cliente.findMany({
    where: { tenant_id: tenantId, crm_lead_id: { in: leadIds } },
    select: { id: true, crm_lead_id: true, nome: true, telefone: true, email: true,
              origem: true, consumo_kwh: true, ativo: true },
  });
  const porLead = new Map(atuais.map((c) => [c.crm_lead_id!, c]));

  const aCriar: any[] = [];
  const aAtualizar: { id: string; espelho: Record<string, unknown> }[] = [];
  const clientesDoLote: string[] = [];

  for (const l of bloco) {
    const espelho = {
      nome: l.nome,
      telefone: texto(l.telefone),
      email: texto(l.email),
      origem: texto(l.funil),
      consumo_kwh: l.consumo_kwh,   // string: Decimal nunca vira number (regra 1)
    };

    const atual = porLead.get(l.lead_id);
    if (!atual) {
      const id = crypto.randomUUID();
      aCriar.push({ id, tenant_id: tenantId, crm_lead_id: l.lead_id, ...espelho });
      clientesDoLote.push(id);
      continue;
    }
    clientesDoLote.push(atual.id);

    const mudou =
      atual.nome !== espelho.nome ||
      atual.telefone !== espelho.telefone ||
      atual.email !== espelho.email ||
      atual.origem !== espelho.origem ||
      !mesmoDecimal(atual.consumo_kwh, espelho.consumo_kwh) ||
      atual.ativo !== true;   // reaparecer no CRM reativa (§4.3, ultima linha)

    if (mudou) aAtualizar.push({ id: atual.id, espelho });
    // senao: R3, zero escritas, inclusive timestamp
  }

  if (aCriar.length) await db.cliente.createMany({ data: aCriar });
  for (const u of aAtualizar) {
    // Uma viagem por cliente que mudou, e nao ha como evitar: cada um muda para
    // um valor diferente. E o unico termo do custo que cresce com o lote, e o
    // que fixa `TAMANHO_DO_LOTE`.
    await db.cliente.updateMany({
      where: { tenant_id: tenantId, id: u.id },
      data: { ...u.espelho, ativo: true },
    });
  }

  r.criados += aCriar.length;
  r.atualizados += aAtualizar.length;
  r.porEntidade.cliente.criados += aCriar.length;
  r.porEntidade.cliente.atualizados += aAtualizar.length;

  await garantirEstadoCrm(clientesDoLote, tenantId);
}

/**
 * Espelho de `usina`. `SPEC-002` §2 "Entra", implementado em 27/07.
 *
 * A CHAVE E `codigo_geradora`, nao `crm_usina_id`, e a escolha e da regra 11:
 * `usina_codigo_unico` e um indice unico CHEIO sobre `(tenant_id,
 * codigo_geradora)`, enquanto `crm_usina_id` nao tem unicidade nenhuma. Navegar
 * por uma coluna sem unique seria pedir para o espelho duplicar em silencio.
 * `crm_usina_id` vai junto, como campo espelho, para a rastreabilidade.
 *
 * CAMPO ESPELHO x CAMPO LOCAL (`SPEC-001` §3.3), e a separacao aqui e por medicao:
 *
 *   espelho -> codigo_geradora, apelido, distribuidora, crm_usina_id,
 *              geracao_nominal_kwh (de `geracao_kwh_mensal`), potencia_kwp, status
 *   local   -> dono_usina_id, data_homologacao, regime_fio_b
 *
 * `dono_usina_id` fica LOCAL porque nao ha de onde vir: `dono_lead_codigo` e
 * `dono_lead_nome` vieram 0 de 3 na medicao de 27/07 - e a `C1-crm` ja registrava
 * que o par de funil `Vendas-Integracao -> Donos de Usina` nao existe. Espelhar
 * um campo que a origem nao tem e como o `potencia_kwp` viria: nulo, mas com a
 * aparencia de que alguem cuidou dele.
 */
async function espelharUsinas(
  porta: PortaDeLeitura, r: ResultadoDoCiclo, tenantId: string, tamanho: number,
  lote: AbrirLote, gravarContadores: () => Promise<void>,
): Promise<void> {
  const usinas = await porta.usinas();
  if (usinas.garantiaDegradada) r.garantiaDeTenantDegradada = true;
  r.lidos += usinas.linhas.length;
  r.porEntidade.usina.lidos = usinas.linhas.length;
  if (usinas.linhas.length === 0) return;   // §7 nao se aplica: usina nao reconcilia

  const boas: UsinaDoCrm[] = [];
  for (const u of usinas.linhas) {
    const motivo = motivoDeRecusaDeUsina(u);
    if (motivo) {
      r.recusados++;
      r.porEntidade.usina.recusados++;
      r.recusas.push({ lead_id: u.usina_id, codigo: texto(u.codigo_geradora) ?? '(sem codigo)', motivo });
      continue;
    }
    boas.push(u);
  }

  for (const bloco of emLotes(boas, tamanho)) {
    r.maiorLote = Math.max(r.maiorLote, bloco.length);
    await lote(async () => {
      const db = dbt();
      const codigos = bloco.map((u) => texto(u.codigo_geradora)!);
      const atuais = await db.usina.findMany({
        where: { tenant_id: tenantId, codigo_geradora: { in: codigos } },
        select: { id: true, codigo_geradora: true, apelido: true,
                  potencia_kwp: true, geracao_nominal_kwh: true, crm_usina_id: true, status: true },
      });
      const porCodigo = new Map(atuais.map((u) => [u.codigo_geradora, u]));

      for (const u of bloco) {
        const codigo = texto(u.codigo_geradora)!;
        // `distribuidora` NAO entra: campo local, o usuario vence (R5).
        const espelho = {
          apelido: texto(u.apelido),
          potencia_kwp: u.potencia_kwp,               // string|null: Decimal nunca vira number
          geracao_nominal_kwh: u.geracao_kwh_mensal,  // idem
          crm_usina_id: u.usina_id,
          status: (u.status === 'suspensa' || u.status === 'encerrada' ? u.status : 'ativa') as any,
        };
        const atual = porCodigo.get(codigo);
        if (!atual) {
          /*
           * NAO CRIA, E NAO E LIMITACAO - E A R19 DEPOIS DE 28/07.
           *
           * `distribuidora` e campo local, `NOT NULL` e com FK. Criar aqui exigiria
           * o conector ESCOLHER um valor - o improviso que a regra 10 proibe e que
           * a decisao do dono ja havia rejeitado na forma "default Equatorial". A
           * usina nasce de cadastro local; o conector mantem o espelho dela fresco.
           */
          r.recusados++;
          r.porEntidade.usina.recusados++;
          r.recusas.push({
            lead_id: u.usina_id, codigo,
            motivo: `usina ${codigo} nao esta cadastrada no financeiro. O conector nao cria usina: `
                  + 'distribuidora e cadastro local (o CRM nao tem tabela de referencia) e a coluna '
                  + 'e obrigatoria. Cadastre a usina e o proximo ciclo espelha o resto.',
          });
          continue;
        }

        const mudou =
          atual.apelido !== espelho.apelido ||
          !mesmoDecimal(atual.potencia_kwp, espelho.potencia_kwp) ||
          !mesmoDecimal(atual.geracao_nominal_kwh, espelho.geracao_nominal_kwh) ||
          atual.crm_usina_id !== espelho.crm_usina_id ||
          atual.status !== espelho.status;
        if (!mudou) continue;   // R3: zero escritas

        await db.usina.updateMany({ where: { tenant_id: tenantId, id: atual.id }, data: espelho });
        r.atualizados++; r.porEntidade.usina.atualizados++;
      }
      await gravarContadores();
    });
  }
}

/**
 * Espelho de `unidade_consumidora`. `SPEC-002` §2 "Entra", implementado em 28/07
 * depois da decisao da `F-01`: espelho fiel.
 *
 * A CHAVE E `numero_uc`, e a escolha e da REGRA 11. O candidato natural seria
 * `crm_usina_cliente_id`, que guarda o `contrato_id` do rateio - mas o unico
 * indice dele, `uc_crm_unico`, e PARCIAL (`WHERE crm_usina_cliente_id IS NOT
 * NULL`), e a regra 11 e explicita: "nenhum repositorio navega por indice
 * parcial". `uc_numero_unico` sobre `(tenant_id, numero_uc)` e cheio. O
 * `crm_usina_cliente_id` vai junto como campo espelho, para rastreabilidade.
 *
 * A DISTRIBUIDORA E HERDADA DA USINA, e este e o ponto que precisa de confirmacao
 * do dono - esta registrado como `Q-UC-DISTRIB-01`.
 *
 * O CRM nao expoe distribuidora em `rateio_clientes` (as colunas sao outras), e
 * do nosso lado a coluna e `NOT NULL` com FK, igual a da usina. Duas saidas
 * existiam: recusar toda UC - o que entregaria nada - ou derivar. Derivei da
 * usina vinculada, e a diferenca para um default e que o conector **nao escolhe
 * valor nenhum**: ele propaga o que o usuario ja cadastrou na usina. Se a usina
 * nao estiver espelhada, a UC e recusa contada, em cascata.
 *
 * A base para acreditar que a heranca vale: geracao compartilhada compensa
 * credito dentro da mesma area de concessao, entao UC e usina do mesmo rateio
 * estariam na mesma distribuidora. **Nao afirmo isso como fato verificado** - e o
 * motivo da questao. Se houver caso em que nao vale, a UC passa a exigir cadastro
 * local, como a usina.
 */
async function espelharUnidades(
  porta: PortaDeLeitura, r: ResultadoDoCiclo, tenantId: string, tamanho: number,
  lote: AbrirLote, gravarContadores: () => Promise<void>, vistosNoCrm: Set<string>,
): Promise<void> {
  const [clientes, creditos] = await Promise.all([porta.rateioClientes(), porta.rateioCreditos()]);
  if (clientes.garantiaDegradada || creditos.garantiaDegradada) r.garantiaDeTenantDegradada = true;
  r.lidos += clientes.linhas.length;
  r.porEntidade.unidade_consumidora.lidos = clientes.linhas.length;
  if (clientes.linhas.length === 0) return;

  // `rateio_creditos` e quem tem o `lead_id`; `rateio_clientes` tem a UC. A ponte
  // e `contrato_id`, e ela casou 36/36 na medicao de 27/07.
  const porContrato = new Map(creditos.linhas.map((c) => [c.contrato_id, c]));

  type Alvo = {
    leadId: string; numeroUc: string; nome: string | null; telefone: string | null;
    percentual: string | null; vencimento: Date | null; codigoGeradora: string | null;
    contratoId: string;
  };
  const alvos: Alvo[] = [];
  const vistosUc = new Set<string>();

  for (const rc of clientes.linhas) {
    const credito = porContrato.get(rc.contrato_id);
    const numeroUc = texto(rc.uc);
    const recusar = (motivo: string) => {
      r.recusados++;
      r.porEntidade.unidade_consumidora.recusados++;
      r.recusas.push({ lead_id: credito?.lead_id ?? rc.contrato_id, codigo: texto(rc.lead_codigo) ?? '(sem codigo)', motivo });
    };

    if (!credito) { recusar(`contrato ${rc.contrato_id} de rateio_clientes nao tem par em rateio_creditos - sem lead_id nao ha cliente`); continue; }
    if (!numeroUc) { recusar(`contrato ${rc.contrato_id}: numero de UC vazio`); continue; }

    /*
     * A UC REPETIDA VIRA RECUSA CONTADA, e nao um 23505 no meio do lote.
     *
     * Medido em 27/07 e confirmado pelo dev em 28/07: `000041446801282` aparece em
     * DOIS contratos de rateio, de leads diferentes, mesma usina, mesmo percentual,
     * digitados com 39 minutos de diferenca na carga manual de 14/07. A leitura do
     * dev e erro de digitacao de um dos dois numeros - e ele confirmou que o nosso
     * modelo de UC unica por tenant esta certo. Escolher qual das duas vale seria
     * exatamente o palpite que a R8 proibe. Ver `UC-DUP-01`.
     */
    if (vistosUc.has(numeroUc)) {
      recusar(`UC ${numeroUc} aparece em mais de um contrato de rateio no mesmo ciclo. `
            + 'O conector nao escolhe qual vale (UC-DUP-01): confira contra o rateio oficial da distribuidora.');
      continue;
    }
    vistosUc.add(numeroUc);

    alvos.push({
      leadId: credito.lead_id, numeroUc,
      nome: texto(rc.cliente), telefone: texto(rc.telefone),
      percentual: rc.percentual_rateio, vencimento: rc.data_vencimento,
      codigoGeradora: texto(rc.codigo_geradora), contratoId: rc.contrato_id,
    });
    // Lead de rateio conta como visto: sem isto a reconciliacao da §4.3 o trataria
    // como ausente do CRM e o mandaria para a fila de revisao humana no mesmo ciclo
    // em que ele foi criado.
    vistosNoCrm.add(credito.lead_id);
  }

  for (const bloco of emLotes(alvos, tamanho)) {
    r.maiorLote = Math.max(r.maiorLote, bloco.length);
    await lote(async () => {
      const db = dbt();

      // As usinas vinculadas, para herdar a distribuidora e o vinculo.
      const codigos = [...new Set(bloco.map((a) => a.codigoGeradora).filter(Boolean) as string[])];
      const usinas = codigos.length === 0 ? [] : await db.usina.findMany({
        where: { tenant_id: tenantId, codigo_geradora: { in: codigos } },
        select: { id: true, codigo_geradora: true, distribuidora: true },
      });
      const porCodigo = new Map(usinas.map((u) => [u.codigo_geradora, u]));

      // Os clientes que ja existem, por lead. Espelho fiel: quem nao existir nasce.
      const leads = [...new Set(bloco.map((a) => a.leadId))];
      const jaExistem = await db.cliente.findMany({
        where: { tenant_id: tenantId, crm_lead_id: { in: leads } },
        select: { id: true, crm_lead_id: true },
      });
      const clientePorLead = new Map(jaExistem.map((c) => [c.crm_lead_id!, c.id]));

      const clientesACriar: any[] = [];
      for (const a of bloco) {
        if (clientePorLead.has(a.leadId)) continue;
        const id = crypto.randomUUID();
        clientePorLead.set(a.leadId, id);
        // Minimo honesto: `origem` e `consumo_kwh` NAO existem em rateio_clientes,
        // e inventar rotulo para origem seria improviso. Ficam nulos ate o lead
        // aparecer em vendas_ganhas, e ai o espelho de venda completa.
        clientesACriar.push({ id, tenant_id: tenantId, crm_lead_id: a.leadId,
                              nome: a.nome ?? '(sem nome no CRM)', telefone: a.telefone });
      }
      if (clientesACriar.length) {
        await db.cliente.createMany({ data: clientesACriar });
        r.criados += clientesACriar.length;
        r.porEntidade.cliente.criados += clientesACriar.length;
      }

      const numeros = bloco.map((a) => a.numeroUc);
      const atuais = await db.unidade_consumidora.findMany({
        where: { tenant_id: tenantId, numero_uc: { in: numeros } },
        select: { id: true, numero_uc: true, cliente_id: true, usina_id: true,
                  percentual_rateio: true, data_vencimento: true, crm_usina_cliente_id: true },
      });
      const porNumero = new Map(atuais.map((u) => [u.numero_uc, u]));

      /*
       * O `uc_crm_unico` E PARCIAL, E MESMO ASSIM PRECISA SER RESPEITADO.
       *
       * A regra 11 proibe NAVEGAR por indice parcial - e por isso a chave do
       * espelho e `numero_uc`, que tem indice cheio. Mas o parcial existe no
       * banco e viola com 23505, e um 23505 no meio de um `createMany` derruba o
       * LOTE INTEIRO: um contrato que mudou de UC no CRM viraria falha de todas
       * as UCs do lote. Entao ele e conferido aqui, por `findMany` com predicado
       * explicito - que e o que a regra 11 manda usar -, e a violacao vira recusa
       * contada com o motivo. Mesmo desenho da distribuidora fora da tabela de
       * referencia: recusa nomeada e melhor que erro de integridade.
       */
      const contratos = bloco.map((a) => a.contratoId);
      const jaVinculados = await db.unidade_consumidora.findMany({
        where: { tenant_id: tenantId, crm_usina_cliente_id: { in: contratos } },
        select: { numero_uc: true, crm_usina_cliente_id: true },
      });
      const ucDoContrato = new Map(jaVinculados.map((u) => [u.crm_usina_cliente_id!, u.numero_uc]));

      const aCriar: any[] = [];
      for (const a of bloco) {
        const usina = a.codigoGeradora ? porCodigo.get(a.codigoGeradora) : undefined;
        if (!usina) {
          // Cascata da recusa da usina - mesmo desenho da geracao. Hoje e o caso
          // normal, porque as 3 usinas ainda nao foram cadastradas localmente.
          r.recusados++;
          r.porEntidade.unidade_consumidora.recusados++;
          r.recusas.push({
            lead_id: a.leadId, codigo: a.numeroUc,
            motivo: `UC ${a.numeroUc}: a usina ${a.codigoGeradora ?? '(sem codigo)'} nao esta espelhada no `
                  + 'financeiro. A UC herda a distribuidora dela (Q-UC-DISTRIB-01), entao nao ha o que herdar.',
          });
          continue;
        }
        const ucAnterior = ucDoContrato.get(a.contratoId);
        if (ucAnterior !== undefined && ucAnterior !== a.numeroUc) {
          r.recusados++;
          r.porEntidade.unidade_consumidora.recusados++;
          r.recusas.push({
            lead_id: a.leadId, codigo: a.numeroUc,
            motivo: `contrato de rateio ${a.contratoId} ja esta vinculado a UC ${ucAnterior} e agora aponta `
                  + `para ${a.numeroUc}. O conector nao move vinculo de contrato entre UCs: uma das duas `
                  + 'leituras esta errada, e escolher seria palpite.',
          });
          continue;
        }
        const clienteId = clientePorLead.get(a.leadId)!;
        const espelho = {
          cliente_id: clienteId,
          usina_id: usina.id,
          percentual_rateio: a.percentual,
          data_vencimento: a.vencimento,
          crm_usina_cliente_id: a.contratoId,
        };
        const atual = porNumero.get(a.numeroUc);
        if (!atual) {
          aCriar.push({ tenant_id: tenantId, numero_uc: a.numeroUc,
                        distribuidora: usina.distribuidora, ...espelho });
          continue;
        }
        const mudou =
          atual.cliente_id !== espelho.cliente_id ||
          atual.usina_id !== espelho.usina_id ||
          !mesmoDecimal(atual.percentual_rateio, espelho.percentual_rateio) ||
          String(atual.data_vencimento ?? '') !== String(espelho.data_vencimento ?? '') ||
          atual.crm_usina_cliente_id !== espelho.crm_usina_cliente_id;
        if (!mudou) continue;   // R3
        // `distribuidora` NAO entra no update: campo local, o usuario vence (R5).
        await db.unidade_consumidora.updateMany({
          where: { tenant_id: tenantId, id: atual.id }, data: espelho,
        });
        r.atualizados++; r.porEntidade.unidade_consumidora.atualizados++;
      }
      if (aCriar.length) {
        await db.unidade_consumidora.createMany({ data: aCriar });
        r.criados += aCriar.length;
        r.porEntidade.unidade_consumidora.criados += aCriar.length;
      }

      // R7: `tem_rateio_ativo` finalmente tem quem o escreva. Era a coluna que
      // nascia NULL desde a migration e nenhum caminho preenchia.
      await marcarRateioAtivo([...new Set(bloco.map((a) => clientePorLead.get(a.leadId)!))], tenantId);
      await gravarContadores();
    });
  }
}

/** R7 e invariante 5: so o conector escreve `cliente_estado_crm`. */
async function marcarRateioAtivo(clienteIds: string[], tenantId: string): Promise<void> {
  if (clienteIds.length === 0) return;
  const db = dbt();
  const existentes = await db.cliente_estado_crm.findMany({
    where: { tenant_id: tenantId, cliente_id: { in: clienteIds } },
    select: { cliente_id: true, tem_rateio_ativo: true },
  });
  const por = new Map(existentes.map((e) => [e.cliente_id, e]));

  const aCriar = clienteIds.filter((id) => !por.has(id)).map((cliente_id) => ({
    tenant_id: tenantId, cliente_id, tem_rateio_ativo: true,
    tem_venda_ganha: null, em_carteira: null, sincronizado_em: new Date(),
  }));
  const aMarcar = clienteIds.filter((id) => por.has(id) && por.get(id)!.tem_rateio_ativo !== true);

  if (aCriar.length) await db.cliente_estado_crm.createMany({ data: aCriar });
  if (aMarcar.length) {
    await db.cliente_estado_crm.updateMany({
      where: { tenant_id: tenantId, cliente_id: { in: aMarcar } },
      data: { tem_rateio_ativo: true, sincronizado_em: new Date() },
    });
  }
}

/**
 * Espelho de `usina_geracao`. `SPEC-002` §2 "Entra".
 *
 * `origem` nasce `'crm'` - o enum ja previa os dois valores, entao nao houve
 * decisao a tomar aqui. E o que separa a serie que veio do CRM da que alguem
 * digitou, que e a diferenca que a F2 vai precisar para conferir fatura.
 *
 * GERACAO DE USINA NAO ESPELHADA E RECUSA CONTADA, nao erro. Hoje isso e o caso
 * NORMAL e nao a excecao: as 3 usinas sao recusadas por distribuidora vazia,
 * entao as 8 linhas de geracao nao tem onde pousar. Gravar sem a usina e
 * impossivel (FK composta), e engolir em silencio esconderia justamente o efeito
 * em cascata da recusa anterior.
 */
async function espelharGeracao(
  porta: PortaDeLeitura, r: ResultadoDoCiclo, tenantId: string, tamanho: number,
  lote: AbrirLote, gravarContadores: () => Promise<void>,
): Promise<void> {
  const geracao = await porta.geracaoMensal();
  if (geracao.garantiaDegradada) r.garantiaDeTenantDegradada = true;
  r.lidos += geracao.linhas.length;
  r.porEntidade.usina_geracao.lidos = geracao.linhas.length;
  if (geracao.linhas.length === 0) return;

  const codigos = [...new Set(geracao.linhas.map((g) => texto(g.codigo_geradora)).filter(Boolean) as string[])];
  const usinas: { id: string; codigo_geradora: string }[] = codigos.length === 0 ? [] : await lote(async () =>
    dbt().usina.findMany({
      where: { tenant_id: tenantId, codigo_geradora: { in: codigos } },
      select: { id: true, codigo_geradora: true },
    }));
  const porCodigo = new Map(usinas.map((u) => [u.codigo_geradora, u.id]));

  const boas: { usinaId: string; competencia: Date; geracao_kwh: string }[] = [];
  for (const g of geracao.linhas) {
    const codigo = texto(g.codigo_geradora);
    const usinaId = codigo ? porCodigo.get(codigo) : undefined;
    if (!usinaId) {
      r.recusados++;
      r.porEntidade.usina_geracao.recusados++;
      r.recusas.push({
        lead_id: g.usina_id, codigo: codigo ?? '(sem codigo)',
        motivo: `geracao de ${g.competencia instanceof Date ? g.competencia.toISOString().slice(0, 10) : g.competencia}: ` +
                `a usina ${codigo ?? '(sem codigo)'} nao esta espelhada no financeiro`,
      });
      continue;
    }
    if (g.geracao_kwh == null) {
      r.recusados++;
      r.porEntidade.usina_geracao.recusados++;
      r.recusas.push({ lead_id: g.usina_id, codigo: codigo!, motivo: 'geracao_kwh nula - valor nulo nao e zero (R9)' });
      continue;
    }
    boas.push({ usinaId, competencia: new Date(g.competencia), geracao_kwh: g.geracao_kwh });   // nao-nulo: a recusa acima garante
  }

  for (const bloco of emLotes(boas, tamanho)) {
    r.maiorLote = Math.max(r.maiorLote, bloco.length);
    await lote(async () => {
      const db = dbt();
      const atuais = await db.usina_geracao.findMany({
        where: { tenant_id: tenantId, usina_id: { in: bloco.map((b) => b.usinaId) } },
        select: { id: true, usina_id: true, competencia: true, geracao_kwh: true },
      });
      const chave = (u: string, c: Date) => `${u}|${c.toISOString().slice(0, 10)}`;
      const por = new Map(atuais.map((a) => [chave(a.usina_id, a.competencia), a]));

      const aCriar: any[] = [];
      for (const b of bloco) {
        const atual = por.get(chave(b.usinaId, b.competencia));
        if (!atual) {
          aCriar.push({ tenant_id: tenantId, usina_id: b.usinaId, competencia: b.competencia,
                        geracao_kwh: b.geracao_kwh, origem: 'crm' });
          continue;
        }
        if (mesmoDecimal(atual.geracao_kwh, b.geracao_kwh)) continue;   // R3
        await db.usina_geracao.updateMany({
          where: { tenant_id: tenantId, id: atual.id },
          data: { geracao_kwh: b.geracao_kwh, origem: 'crm' },
        });
        r.atualizados++; r.porEntidade.usina_geracao.atualizados++;
      }
      if (aCriar.length) {
        await db.usina_geracao.createMany({ data: aCriar });
        r.criados += aCriar.length; r.porEntidade.usina_geracao.criados += aCriar.length;
      }
      await gravarContadores();
    });
  }
}

/**
 * R7 e invariante 5 - `cliente_estado_crm` e escrito SO pelo conector.
 *
 * `em_carteira` nasce e permanece NULL ate a decisao de F2: nenhuma etapa de
 * funil marca o cliente pagante hoje (F-01b), e inventar um default aqui seria
 * exatamente o improviso que a regra 10 proibe.
 *
 * CONVERGENTE, e essa e a diferenca para a versao anterior: antes o estado so era
 * escrito quando o cliente era criado ou atualizado, entao um cliente cujo
 * cadastro nao mudou e cujo estado faltava nunca ganhava um. Agora a pergunta e
 * "existe e diz a verdade?", que e a pergunta certa - e continua idempotente,
 * porque na segunda passada tudo existe e nada e escrito. `sincronizado_em`
 * acompanha a MUDANCA, nao o ciclo: senao toda passada "atualizaria" a linha.
 */
async function garantirEstadoCrm(clienteIds: string[], tenantId: string): Promise<void> {
  if (clienteIds.length === 0) return;
  const db = dbt();

  const existentes = await db.cliente_estado_crm.findMany({
    where: { tenant_id: tenantId, cliente_id: { in: clienteIds } },
    select: { cliente_id: true, tem_venda_ganha: true },
  });
  const por = new Map(existentes.map((e) => [e.cliente_id, e]));

  const aCriar = clienteIds
    .filter((id) => !por.has(id))
    .map((cliente_id) => ({
      tenant_id: tenantId, cliente_id,
      tem_venda_ganha: true, tem_rateio_ativo: null, em_carteira: null,
      sincronizado_em: new Date(),
    }));
  const aMarcar = clienteIds.filter((id) => por.get(id)?.tem_venda_ganha === false
                                         || por.get(id)?.tem_venda_ganha === null);

  if (aCriar.length) await db.cliente_estado_crm.createMany({ data: aCriar });
  if (aMarcar.length) {
    await db.cliente_estado_crm.updateMany({
      where: { tenant_id: tenantId, cliente_id: { in: aMarcar } },
      data: { tem_venda_ganha: true, sincronizado_em: new Date() },
    });
  }
}

/**
 * R6 - NUNCA deleta. Ausencia explicada vira `ativo = false`, e e reversivel: se
 * o id voltar a aparecer, o proximo ciclo reativa.
 *
 * R18 - vitima de merge FUNDE, nao apenas desativa. Sem isto, contrato e UC do
 * espelho da vitima ficam pendurados num cliente inativo: o dado nao some, mas
 * some do lugar onde alguem procuraria.
 *
 * Sobrevivente ainda nao espelhado: nao ha para onde mover. Desativa so, e o
 * proximo ciclo funde - o mapa de merge nao expira.
 */
async function desativarLote(
  bloco: { clienteId: string; leadId: string; sobreviventeLead?: string }[],
  tenantId: string,
): Promise<void> {
  const db = dbt();

  const vitimas = bloco.filter((a) => a.sobreviventeLead);
  if (vitimas.length) {
    const sobreviventes = await db.cliente.findMany({
      where: { tenant_id: tenantId, crm_lead_id: { in: vitimas.map((v) => v.sobreviventeLead!) } },
      select: { id: true, crm_lead_id: true },
    });
    const porLead = new Map(sobreviventes.map((c) => [c.crm_lead_id!, c.id]));

    for (const v of vitimas) {
      const destino = porLead.get(v.sobreviventeLead!);
      if (!destino) continue;
      await db.contrato.updateMany({
        where: { tenant_id: tenantId, cliente_id: v.clienteId },
        data: { cliente_id: destino },
      });
      await db.unidade_consumidora.updateMany({
        where: { tenant_id: tenantId, cliente_id: v.clienteId },
        data: { cliente_id: destino },
      });
    }
  }

  await db.cliente.updateMany({
    where: { tenant_id: tenantId, id: { in: bloco.map((a) => a.clienteId) } },
    data: { ativo: false },
  });
}
