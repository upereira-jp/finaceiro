// PONTO UNICO DE LEITURA DO CRM. SPEC-002 R1, R1-b, R2 e invariantes 1, 2 e 9.
//
// Existe pela mesma razao que `src/db/contexto.ts` e o ponto unico de emissao do
// contexto de tenant: a garantia que depende de "todo mundo lembrar" nao e
// garantia. Se houver dois caminhos ate o CRM, a invariante 2 ("nenhuma tabela
// base do CRM e consultada") vale para o caminho que alguem revisou.
//
// COMO A GARANTIA E CONSTRUIDA, e nao apenas afirmada:
//   - o SQL de cada view e uma CONSTANTE deste arquivo. Nao ha funcao que aceite
//     nome de tabela, nome de schema ou fragmento de SQL vindo de fora.
//   - `consultar()` e privado. O que sai daqui sao oito leitores nomeados.
//   - o teste percorre o modulo e falha se aparecer um nono SQL, ou se algum
//     mencionar schema que nao seja `financeiro`.
//
// ------------------------------------------------------------------------
// A INVARIANTE 9 ESTA CUMPRIDA DESDE 27/07 - E QUASE NAO ESTEVE.
//
// A `SPEC-002` R1-b manda validar `crm_tenant_id` em TODA LINHA recebida, porque
// o isolamento das views nao vem da RLS do CRM - vem de literais UUID no corpo
// das views, e uma view nova sem o literal, ou com o literal errado, entrega
// linhas de outro tenant sem que nenhuma policy impeca.
//
// Medido em 27/07, PRIMEIRA leitura: nenhuma das oito views expunha coluna de
// tenant, e a validacao por linha era impossivel. O conector rodou nesse estado
// registrando `garantia_de_tenant_degradada` em `conector_execucao.detalhe` -
// declarando a lacuna em vez de escondendo.
//
// Medido no MESMO dia, depois do ajuste do dev do CRM: as oito expoem
// `crm_tenant_id uuid`, com UM valor distinto e ZERO nulos em cada, e o mesmo
// valor nas oito. A validacao por linha abaixo passou a rodar de verdade.
//
// O QUE NAO SE PEDIU, e vale registrar porque quase se pediu: `security_invoker
// = true` nas views. Teria quebrado a leitura inteira - com ele os privilegios
// passam a ser avaliados contra quem consulta, e `financeiro_ro` precisaria de
// SELECT nas TABELAS BASE do CRM, que e o acesso que a regra 4 proibe. A view
// owned por `postgres` com filtro literal e o que permite ao `financeiro_ro`
// ler as views e NADA MAIS.

import type { Pool } from 'pg';
import type { ViewDoCrm } from './conexao.ts';

export class LeituraForaDoContrato extends Error {
  constructor(o: string) {
    super(`Leitura do CRM fora do contrato: ${o}. So as views financeiro.* sao acessiveis (regra 4).`);
    this.name = 'LeituraForaDoContrato';
  }
}

export class TenantDivergenteNoCrm extends Error {
  readonly aborta = true;
  constructor(view: string, esperado: string, veio: string) {
    super(
      `A view financeiro.${view} devolveu linha do crm_tenant_id ${veio}, e o conector ` +
      `esperava ${esperado}. O ciclo aborta inteiro: nada e gravado e nada e reconciliado ` +
      '(SPEC-002 R1-b, invariante 9).'
    );
    this.name = 'TenantDivergenteNoCrm';
  }
}

/**
 * O SQL, por view. CONSTANTE, sem interpolacao de identificador em lugar nenhum.
 * Cada entrada nomeia as colunas: `SELECT *` deixaria o contrato mudar sozinho
 * quando o dev do CRM alterasse a view, e mudanca silenciosa de contrato de
 * integracao e como se descobre em producao.
 */
const SQL: Record<ViewDoCrm, string> = {
  vendas_ganhas: `
    SELECT codigo, lead_id, nome, telefone, email, funil, etapa, ganho_em,
           valor_venda, valor_posicao, parceria_tipo, comissionamento,
           partner_id, parceiro_nome, vendedor_origem, responsavel_atual,
           consumo_kwh, consumo_reais, created_at, comissionamento_n_opcoes, crm_tenant_id
      FROM financeiro.vendas_ganhas`,
  usinas: `
    SELECT usina_id, codigo_geradora, apelido, localizacao, potencia_kwp,
           geracao_kwh_mensal, distribuidora, status, data_instalacao,
           dono_lead_codigo, dono_lead_nome, crm_tenant_id
      FROM financeiro.usinas`,
  rateio_clientes: `
    SELECT contrato_id, codigo_geradora, usina, lead_codigo, cliente, telefone,
           percentual_rateio, uc, troca_titularidade, numero_protocolo,
           data_cadastro, data_vencimento, observacoes, created_at, crm_tenant_id
      FROM financeiro.rateio_clientes`,
  rateio_creditos: `
    SELECT contrato_id, usina_id, lead_id, percentual_rateio,
           geracao_nominal_kwh, creditos_kwh_mes, crm_tenant_id
      FROM financeiro.rateio_creditos`,
  geracao_mensal: `
    SELECT id, usina_id, codigo_geradora, usina, competencia, geracao_kwh,
           created_at, updated_at, crm_tenant_id
      FROM financeiro.geracao_mensal`,
  parceiros: `
    SELECT partner_id, nome, email, status, aprovado_em, revogado_em,
           lead_origem_id, lead_origem_codigo, created_at, crm_tenant_id
      FROM financeiro.parceiros`,
  leads_arquivados: `
    SELECT lead_id, codigo, nome, telefone, removido_do_funil_em, tags,
           mesclado, ultimo_funil, ultima_etapa, ultima_entrada_etapa, crm_tenant_id
      FROM financeiro.leads_arquivados`,
  lead_merges: `
    SELECT vitima_id, sobrevivente_id, mesclado_em, origem, crm_tenant_id
      FROM financeiro.lead_merges`,
};

export type OpcoesDoLeitor = {
  pool: Pool;
  /** De `conector_crm.crm_tenant_id`. NUNCA `tenant_id` - regra 6. */
  crmTenantId: string;
  /** De `conferirRoleDeLeitura()`. Desde 27/07 sao as oito - ver cabecalho. */
  viewsComColunaDeTenant?: readonly string[];
  /** Teto de linhas por leitura. R13 - lote declarado, nao transacao gigante. */
  lote?: number;
};

export type ResultadoDeLeitura<T> = {
  linhas: T[];
  /** true quando a view nao expoe coluna de tenant e a validacao por linha nao rodou. */
  garantiaDegradada: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarLeitorCrm(o: OpcoesDoLeitor) {
  // O crm_tenant_id vai para comparacao, nunca para dentro de SQL montado -
  // mas validar o formato aqui e o que impede que um valor de configuracao
  // errado vire comparacao que nunca casa e ciclo que aborta sem explicacao.
  if (!UUID.test(o.crmTenantId)) {
    throw new LeituraForaDoContrato(`crm_tenant_id "${o.crmTenantId}" nao e UUID`);
  }
  const comTenant = new Set(o.viewsComColunaDeTenant ?? []);
  const lote = o.lote ?? 1000;

  async function consultar<T>(view: ViewDoCrm): Promise<ResultadoDeLeitura<T>> {
    const sql = SQL[view];
    if (!sql) throw new LeituraForaDoContrato(`view desconhecida "${view}"`);

    // LIMIT por parametro ligado, nunca concatenado. O valor e nosso e nao vem
    // do CRM, mas a forma importa: e a forma que alguem copia na proxima query.
    const r = await o.pool.query(`${sql} LIMIT $1`, [lote]);
    const linhas = r.rows as T[];

    // INVARIANTE 9. Uma comparacao por linha, e e a unica defesa que nao
    // depende de a view estar certa. Divergiu, aborta o ciclo INTEIRO: nada
    // gravado, nada reconciliado (R1-b).
    if (comTenant.has(view)) {
      for (const l of linhas) {
        const veio = (l as any).crm_tenant_id ?? (l as any).tenant_id;
        if (veio !== o.crmTenantId) {
          throw new TenantDivergenteNoCrm(view, o.crmTenantId, String(veio));
        }
      }
      return { linhas, garantiaDegradada: false };
    }
    return { linhas, garantiaDegradada: true };
  }

  return {
    crmTenantId: o.crmTenantId,
    /** Para o teste da invariante 2: a lista fechada, sem outro caminho. */
    viewsDisponiveis: Object.keys(SQL) as ViewDoCrm[],

    vendasGanhas:    () => consultar<VendaGanha>('vendas_ganhas'),
    usinas:          () => consultar<UsinaDoCrm>('usinas'),
    rateioClientes:  () => consultar<RateioCliente>('rateio_clientes'),
    rateioCreditos:  () => consultar<RateioCredito>('rateio_creditos'),
    geracaoMensal:   () => consultar<GeracaoMensal>('geracao_mensal'),
    parceiros:       () => consultar<ParceiroDoCrm>('parceiros'),
    leadsArquivados: () => consultar<LeadArquivado>('leads_arquivados'),
    leadMerges:      () => consultar<LeadMerge>('lead_merges'),
  };
}

export type LeitorCrm = ReturnType<typeof criarLeitorCrm>;

// ------------------------------------------------------------------ tipos
// `numeric` do Postgres chega como STRING pelo driver, de proposito: converter
// para number aqui perderia precisao e a regra 1 proibe float em dinheiro.
// Quem transforma em centavos e o motor do ciclo, uma vez, no fim.

export type VendaGanha = {
  crm_tenant_id: string;
  codigo: string; lead_id: string; nome: string;
  telefone: string | null; email: string | null;
  funil: string; etapa: string; ganho_em: Date;
  valor_venda: string | null; valor_posicao: string | null;
  parceria_tipo: string | null; comissionamento: string | null;
  partner_id: string | null; parceiro_nome: string | null;
  vendedor_origem: string | null; responsavel_atual: string | null;
  consumo_kwh: string | null; consumo_reais: string | null;
  created_at: Date; comissionamento_n_opcoes: string;
};

export type UsinaDoCrm = {
  crm_tenant_id: string;
  usina_id: string; codigo_geradora: string | null; apelido: string | null;
  localizacao: string | null; potencia_kwp: string | null;
  geracao_kwh_mensal: string | null; distribuidora: string | null;
  status: string | null; data_instalacao: Date | null;
  dono_lead_codigo: string | null; dono_lead_nome: string | null;
};

export type RateioCliente = {
  crm_tenant_id: string;
  contrato_id: string; codigo_geradora: string | null; usina: string | null;
  lead_codigo: string | null; cliente: string | null; telefone: string | null;
  percentual_rateio: string | null; uc: string | null;
  troca_titularidade: string | null; numero_protocolo: string | null;
  data_cadastro: Date | null; data_vencimento: Date | null;
  observacoes: string | null; created_at: Date;
};

export type RateioCredito = {
  crm_tenant_id: string;
  contrato_id: string; usina_id: string; lead_id: string;
  percentual_rateio: string | null; geracao_nominal_kwh: string | null;
  creditos_kwh_mes: string | null;
};

export type GeracaoMensal = {
  crm_tenant_id: string;
  id: string; usina_id: string; codigo_geradora: string | null;
  usina: string | null; competencia: Date; geracao_kwh: string | null;
  created_at: Date; updated_at: Date;
};

export type ParceiroDoCrm = {
  crm_tenant_id: string;
  partner_id: string; nome: string | null; email: string | null;
  status: string | null; aprovado_em: Date | null; revogado_em: Date | null;
  lead_origem_id: string | null; lead_origem_codigo: string | null; created_at: Date;
};

export type LeadArquivado = {
  crm_tenant_id: string;
  lead_id: string; codigo: string | null; nome: string | null;
  telefone: string | null; removido_do_funil_em: Date | null;
  tags: string[] | null; mesclado: boolean | null;
  ultimo_funil: string | null; ultima_etapa: string | null;
  ultima_entrada_etapa: Date | null;
};

export type LeadMerge = {
  crm_tenant_id: string;
  vitima_id: string; sobrevivente_id: string; mesclado_em: Date; origem: string | null;
};
