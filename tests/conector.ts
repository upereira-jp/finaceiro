// SPEC-002 §9 - o conector contra banco real, com a porta de leitura injetada.
// Uso: bash tests/repos.sh   (nao rode solto: depende do banco que o .sh monta)
//
// A PORTA E UM STUB, E ISSO NAO ENFRAQUECE O TESTE - e o que o fortalece. As
// invariantes que importam aqui (idempotencia, dedup, recusa, reconciliacao) sao
// sobre o COMPORTAMENTO do motor diante de uma resposta do CRM. Com o CRM real
// eu nao consigo produzir "lead ganho em dois funis" nem "vitima de merge" sob
// demanda; com o stub, produzo os dois e mais os casos que ninguem quer esperar
// acontecer em producao.
//
// O que o stub NAO cobre e coberto por outro caminho:
//   inv. 2 - so as views financeiro.* sao alcancadas -> N35/N36, por LOG DE QUERY
//   inv. 1 - a credencial nao escreve                -> N21/N21b (guarda) e N25 (sessao)
//   inv. 5 - so o conector escreve cliente_estado_crm -> N37, por varredura de src/
//
// CORRECAO DE 27/07, e ela e sobre este proprio comentario: ate hoje ele afirmava
// que o invariante 2 estava coberto por "N1/N2, por leitura do modulo". **Os
// testes N1, N2 e N3 nunca existiram.** A afirmacao convivia com um
// `LeituraForaDoContrato` importado e nunca asserido - um invariante que a suite
// declarava cobrir e nao cobria, que e pior do que um invariante sem teste,
// porque quem le o cabecalho para de procurar. O criterio §8 pede o invariante 2
// "verificado por LOG DE QUERY, nao por revisao", e e o que o N35 passou a fazer:
// interpoe o pool, grava tudo que sai para o CRM e confere objeto por objeto.

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import {
  executarCiclo, deduplicarPorLead, motivoDeRecusa, classificarAusencia, emLotes,
  CicloDentroDeTransacao, TAMANHO_DO_LOTE,
  type PortaDeLeitura, type AbrirLote,
} from '../src/crm/sincronizacao.ts';
import type { VendaGanha, LeadArquivado, LeadMerge, UsinaDoCrm, GeracaoMensal,
              RateioCliente, RateioCredito, VendaCreditada, RateioSituacao } from '../src/crm/leitura.ts';

const CONN = process.env.TEST_DATABASE_URL!;
const A = process.env.TEST_TENANT_A!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;
const CRM_TENANT = process.env.TEST_CRM_TENANT!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });

/*
 * O ABRIDOR DE LOTE do teste. Desde a R13 o motor abre as PROPRIAS transacoes -
 * uma por lote - e recebe o abridor injetado, como recebe a porta de leitura.
 * Aqui ele e `withTenantEm`, o mesmo emissor de contexto de sempre: o teste nao
 * monta um segundo caminho de isolamento, ele usa o unico que existe.
 */
const loteEmA = (usuarioId = U): AbrirLote =>
  ((trabalho) =>
    withTenantEm(prisma as any, { tenantId: A, usuarioId }, () => trabalho())) as AbrirLote;
const emA = <T>(f: () => Promise<T>, usuarioId = U): Promise<T> =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId }, () => f()) as Promise<T>;

/*
 * VERIFICACAO por conexao separada, e o motivo e o mesmo defeito que esta suite
 * quase cometeu: dentro de withTenantEm o contexto vive na TRANSACAO (SET LOCAL).
 * Consultar pelo client externo nao ve o contexto - a policy devolveria zero e o
 * teste passaria por engano. Aqui a conferencia e feita por fora, sem RLS, para
 * medir o que REALMENTE ficou gravado, e nao o que a policy deixa enxergar.
 */
const verificador = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL_SUPERUSER!, max: 2 });
const sql = async (q: string, ...p: unknown[]): Promise<any[]> =>
  (await verificador.query(q, p)).rows;

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

// ------------------------------------------------------------- fixtures
const venda = (o: Partial<VendaGanha> & { lead_id: string }): VendaGanha => ({
  crm_tenant_id: CRM_TENANT,
  codigo: 'V-' + o.lead_id.slice(0, 4), nome: 'Cliente ' + o.lead_id.slice(0, 4),
  telefone: null, email: null, funil: 'Vendas - Assinatura', etapa: 'GANHO',
  ganho_em: new Date('2026-06-01T12:00:00Z'),
  valor_venda: '1000.00', valor_posicao: null, parceria_tipo: null,
  comissionamento: 'PADRAO', partner_id: null, parceiro_nome: null,
  vendedor_origem: null, responsavel_atual: null,
  consumo_kwh: '850.0000', consumo_reais: null,
  created_at: new Date('2026-05-01T12:00:00Z'), comissionamento_n_opcoes: '1',
  ...o,
});

/*
 * As duas ultimas - `creditos` e `situacoes` - entraram em 03/08 com a R26, e o
 * DEFAULT VAZIO e deliberado: com `vendas_creditadas` vazia a conferencia do eixo
 * do originador declara que NAO RODOU e nao acusa ninguem. E o que mantem as
 * dezenas de verificacoes anteriores medindo o que sempre mediram - se a view
 * vazia acusasse UC por UC, cada teste antigo passaria a carregar divergencias
 * que nao tem nada a ver com o que ele afirma. Ver `N57`.
 */
const porta = (
  vendas: VendaGanha[], arquivados: LeadArquivado[] = [], merges: LeadMerge[] = [],
  degradada = true, usinas: UsinaDoCrm[] = [], geracao: GeracaoMensal[] = [],
  rateioCli: RateioCliente[] = [], rateioCre: RateioCredito[] = [],
  creditos: VendaCreditada[] = [], situacoes: RateioSituacao[] = [],
): PortaDeLeitura => ({
  crmTenantId: CRM_TENANT,
  vendasGanhas:    async () => ({ linhas: vendas, garantiaDegradada: degradada }),
  leadsArquivados: async () => ({ linhas: arquivados, garantiaDegradada: degradada }),
  leadMerges:      async () => ({ linhas: merges, garantiaDegradada: degradada }),
  usinas:          async () => ({ linhas: usinas, garantiaDegradada: degradada }),
  geracaoMensal:   async () => ({ linhas: geracao, garantiaDegradada: degradada }),
  rateioClientes:  async () => ({ linhas: rateioCli, garantiaDegradada: degradada }),
  rateioCreditos:  async () => ({ linhas: rateioCre, garantiaDegradada: degradada }),
  vendasCreditadas: async () => ({ linhas: creditos, garantiaDegradada: degradada }),
  rateioSituacao:   async () => ({ linhas: situacoes, garantiaDegradada: degradada }),
});

/* Fixtures das duas views novas, com a FORMA REAL medida em 03/08/2026 pela
 * `financeiro_ro`: `vendedor` como nome curto, `parceiro_id`/`parceiro_nome`
 * nulos em 45 de 48, e `uc` como a ponte com o nosso espelho - 39 das nossas 39
 * casaram. */
const creditoCrm = (o: Partial<VendaCreditada> & { uc: string }): VendaCreditada => ({
  crm_tenant_id: CRM_TENANT, credito_id: 'cccc1111-0000-4000-8000-0000000000c1',
  crm_lead_id: 'aaaa8001-0000-4000-8000-00000000cc01', lead_codigo: 'G3-0001',
  cliente: 'Cliente do rateio', telefone: null,
  funil: 'Vendas - Assinatura', etapa: 'GANHO', vendedor: 'Renata',
  vendedor_user_id: 'eeee1111-0000-4000-8000-0000000000f1', responsavel_origem: 'Renata',
  parceiro_id: null, parceiro_nome: null, parceria_tipo: null, parceria_categoria: null,
  comissao_pct: null, comissao_label: null, vendedor_nome_ficha: null, divergencia_ficha: false,
  valor: null, ganho_em: new Date('2026-06-01T12:00:00Z'), origem_carimbo: 'backfill',
  vigente: true, revogado_em: null, revogado_motivo: null,
  created_at: new Date('2026-08-01T03:53:00Z'), ...o,
});
const situacaoCrm = (o: Partial<RateioSituacao> & { uc: string }): RateioSituacao => ({
  crm_tenant_id: CRM_TENANT, contrato_id: 'bbbb8001-0000-4000-8000-00000000cc81',
  crm_lead_id: 'aaaa8001-0000-4000-8000-00000000cc01', lead_codigo: 'G3-0001',
  cliente: 'Cliente do rateio', etapa_rateio: 'Rateio Concluido', stage_type: 'won',
  situacao: 'ativado', em_troca_titularidade: false,
  na_etapa_desde: new Date('2026-07-14T12:00:00Z'), ...o,
});

/* Fixtures do rateio, com a forma real: `data_vencimento`, `troca_titularidade` e
 * `numero_protocolo` nulos em 36 de 36 (o dev confirmou: campos disponiveis, a
 * operacao nunca digitou). A ponte entre as duas views e `contrato_id`. */
const rateioCliCrm = (o: Partial<RateioCliente> & { contrato_id: string }): RateioCliente => ({
  crm_tenant_id: CRM_TENANT, codigo_geradora: 'GER-CRM-01', usina: 'Usina de teste',
  lead_codigo: 'G3-0001', cliente: 'Cliente do rateio', telefone: null,
  percentual_rateio: '5.5000', uc: '000000000000001', troca_titularidade: null,
  numero_protocolo: null, data_cadastro: null, data_vencimento: null,
  observacoes: null, created_at: new Date('2026-07-14'), ...o,
});
const rateioCreCrm = (o: Partial<RateioCredito> & { contrato_id: string; lead_id: string }): RateioCredito => ({
  crm_tenant_id: CRM_TENANT, usina_id: 'dddd1111-0000-4000-8000-00000000aa01',
  percentual_rateio: '5.5000', geracao_nominal_kwh: '10800.0000', creditos_kwh_mes: '594.0000',
  ...o,
});

/* Fixture de usina do CRM, com a FORMA REAL medida em 27/07: `potencia_kwp`,
 * `data_instalacao`, `dono_lead_codigo` e `dono_lead_nome` nulos nas tres, e
 * `distribuidora` como STRING VAZIA - que e o que motivou a recusa contada. */
const usinaCrm = (o: Partial<UsinaDoCrm> & { usina_id: string }): UsinaDoCrm => ({
  crm_tenant_id: CRM_TENANT,
  codigo_geradora: '0001', apelido: 'Usina de teste', localizacao: null,
  potencia_kwp: null, geracao_kwh_mensal: '10800.0000', distribuidora: 'Equatorial',
  status: 'ativa', data_instalacao: null, dono_lead_codigo: null, dono_lead_nome: null,
  ...o,
});

const geracaoCrm = (o: Partial<GeracaoMensal> & { usina_id: string }): GeracaoMensal => ({
  crm_tenant_id: CRM_TENANT, id: o.usina_id, codigo_geradora: '0001', usina: 'Usina de teste',
  competencia: new Date('2026-06-01'), geracao_kwh: '10299.0000',
  created_at: new Date('2026-06-02'), updated_at: new Date('2026-06-02'),
  ...o,
});

const L1 = 'aaaa1111-0000-4000-8000-00000000cc01';
const L2 = 'aaaa2222-0000-4000-8000-00000000cc02';
const L3 = 'aaaa3333-0000-4000-8000-00000000cc03';


// ====================================================== N4 dedup (R4)
{
  const d = deduplicarPorLead([
    venda({ lead_id: L1, codigo: 'V-a', ganho_em: new Date('2026-06-01') }),
    venda({ lead_id: L1, codigo: 'V-b', ganho_em: new Date('2026-06-10') }),
    venda({ lead_id: L2 }),
  ]);
  chk('N4', d.length === 2 && d.find((x) => x.lead_id === L1)?.codigo === 'V-b',
      `R4 lead ganho em dois funis vira UMA linha, e vence o ganho_em mais recente (${d.length})`);
}

// ====================================================== N5 recusas (R8/R9)
{
  // R8 sozinha: aliquota ambigua e recusa mesmo com valor e consumo presentes.
  // O eixo do VALOR ficou nos N5b/N5c, depois da decisao de 27/07.
  const ambigua = motivoDeRecusa(venda({ lead_id: L1, comissionamento_n_opcoes: '3' }));
  const boa = motivoDeRecusa(venda({ lead_id: L1 }));
  chk('N5', ambigua !== null && /ambiguo/.test(ambigua) && boa === null,
      'R8 aliquota ambigua e recusa; linha completa passa');
}

// ====================================================== N5b valor por consumo
{
  // Medido no primeiro ciclo real (27/07): 40 dos 41 ganhos de funil de venda
  // nao tem valor_venda nem valor_posicao, e TODOS tem consumo_kwh. Assinatura
  // de credito de energia nao tem "valor da venda" - tem consumo mensal, e a
  // R10 ja mandava faturar por consumo_kwh x tarifa.
  const soConsumo = motivoDeRecusa(venda({
    lead_id: L1, valor_venda: null, valor_posicao: null, consumo_kwh: '850.0000',
  }));
  chk('N5b', soConsumo === null,
      'ganho de assinatura sem valor mas COM consumo_kwh passa (decisao de 27/07)');

  // O outro sentido: sem nenhum dos tres continua sendo recusa. Sem isto a
  // correcao viraria "aceita tudo", que e o defeito que a R9 existe para evitar.
  const nada = motivoDeRecusa(venda({
    lead_id: L1, valor_venda: null, valor_posicao: null, consumo_kwh: null,
  }));
  chk('N5c', nada !== null && /consumo/.test(nada),
      `sem valor E sem consumo continua recusado (${nada ?? 'NAO recusou'})`);
}

// ====================================================== N6 ordem da ausencia (R18)
{
  // Vitima de merge tem ultimo_funil NULL. Se a ordem fosse funil primeiro, ela
  // cairia em "sumiu de verdade" e iria para fila humana - o unico caso que o
  // sistema resolve sozinho viraria trabalho de gente.
  const merges = new Map([[L1, L2]]);
  const arq = new Map<string, LeadArquivado>([[L1, {
    crm_tenant_id: CRM_TENANT, lead_id: L1, codigo: null, nome: null, telefone: null,
    removido_do_funil_em: new Date(), tags: ['mesclado'], mesclado: true,
    ultimo_funil: null, ultima_etapa: null, ultima_entrada_etapa: null,
  }]]);
  const c = classificarAusencia(L1, merges, arq);
  chk('N6', c.classe === 'mesclado' && (c as any).sobreviventeId === L2,
      `R18 lead_merges vem ANTES de leads_arquivados (veio ${c.classe})`);
}

// ====================================================== N7 copia derivada
{
  const arq = new Map<string, LeadArquivado>([[L3, {
    crm_tenant_id: CRM_TENANT, lead_id: L3, codigo: null, nome: null, telefone: null,
    removido_do_funil_em: new Date(), tags: null, mesclado: false,
    ultimo_funil: 'Clientes ativos - Assinatura', ultima_etapa: null, ultima_entrada_etapa: null,
  }]]);
  const c = classificarAusencia(L3, new Map(), arq);
  chk('N7', c.classe === 'copia_derivada',
      `§4.3 funil volatil da G3 nao desativa e nao conta (veio ${c.classe})`);
  const s = classificarAusencia('ffff0000-0000-4000-8000-00000000cc09', new Map(), new Map());
  chk('N8', s.classe === 'sumiu', `§4.3 ausencia sem explicacao vai para fila humana (veio ${s.classe})`);
}

// ====================================================== N9 ciclo cria
{
  const r = await executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })]), loteEmA());
  chk('N9', r.status === 'ok' && r.criados === 2 && r.lidos === 2,
      `ciclo espelha dois leads (criados=${r.criados}, status=${r.status})`);
}

// ====================================================== N10 IDEMPOTENCIA (R3)
{
  const antes = await sql(`SELECT count(*)::int n, max(criado_em)::text t FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
  const r = await executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })]), loteEmA());
  const depois = await sql(`SELECT count(*)::int n, max(criado_em)::text t FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
  chk('N10', r.criados === 0 && r.atualizados === 0 && antes[0].n === depois[0].n && antes[0].t === depois[0].t,
      `R3 segunda passada: 0 criados, 0 atualizados, nem timestamp mexeu (c=${r.criados} a=${r.atualizados})`);
}

// ====================================================== N11 view vazia (§7)
{
  const antesAtivos = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL AND ativo`, A);
  const r = await executarCiclo(porta([]), loteEmA());
  const depoisAtivos = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL AND ativo`, A);
  chk('N11', r.status === 'erro' && r.desativados === 0 && antesAtivos[0].n === depoisAtivos[0].n,
      `§7 view vazia termina em erro e NAO desativa ninguem - e o caso que apagaria a carteira (${r.status})`);
}

// ====================================================== N12 recusa visivel (inv. 8)
{
  const r = await executarCiclo(porta([
    venda({ lead_id: L1 }), venda({ lead_id: L2 }),
    venda({ lead_id: L3, comissionamento_n_opcoes: '2' }),
  ]), loteEmA());
  const linha = await sql(`SELECT recusados, status::text, detalhe FROM conector_execucao
      WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`, A, r.cicloId);
  const semCliente = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L3);
  chk('N12', linha[0]?.recusados === 1 && linha[0]?.status === 'parcial' && semCliente[0].n === 0,
      `inv.8 recusa aparece em conector_execucao (nao so em log) e NAO gera cliente (rec=${linha[0]?.recusados})`);
  chk('N13', JSON.stringify(linha[0]?.detalhe ?? {}).includes('ambiguo'),
      'o motivo da recusa fica no detalhe - e o que alguem le para consertar no CRM');
}

// ====================================================== N14 Parceiros (R14/R15)
{
  // Card de Parceiros com valor NULO: sem a R14 isso seria recusa toda vez, e a
  // contagem de recusas viraria ruido permanente em vez de sinal.
  const r = await executarCiclo(porta([
    venda({ lead_id: L1 }), venda({ lead_id: L2 }),
    venda({ lead_id: L3, funil: 'Parceiros', valor_venda: null, valor_posicao: null,
            comissionamento: '50%' }),
  ]), loteEmA());
  const cli = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L3);
  chk('N14', r.recusados === 0 && cli[0].n === 0,
      `R14 card de Parceiros sem valor NAO e recusa e NAO vira cliente (rec=${r.recusados}, cli=${cli[0].n})`);
}

// ====================================================== N15 desativa, nao deleta (R6)
{
  const r = await executarCiclo(porta(
    [venda({ lead_id: L1 })],
    [{ crm_tenant_id: CRM_TENANT, lead_id: L2, codigo: null, nome: null, telefone: null,
       removido_do_funil_em: new Date(), tags: null, mesclado: false,
       ultimo_funil: 'Vendas - Assinatura', ultima_etapa: null, ultima_entrada_etapa: null }],
  ), loteEmA());
  const l2 = await sql(`SELECT ativo FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L2);
  chk('N15', r.desativados === 1 && l2.length === 1 && l2[0].ativo === false,
      `R6 arquivado vira ativo=false e a LINHA CONTINUA (linhas=${l2.length})`);
}

// ====================================================== N16 reaparecer reativa
{
  await executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })]), loteEmA());
  const l2 = await sql(`SELECT ativo FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L2);
  chk('N16', l2[0]?.ativo === true, '§4.3 desativacao e reversivel: o id voltou, ativo = true');
}

// ====================================================== N17 papel (matriz)
{
  const e = await lancou(() => executarCiclo(porta([venda({ lead_id: L1 })]), loteEmA(ULEI)));
  chk('N17', e !== null && /papel|permiss|administrar/i.test(String(e?.message ?? '')),
      `rodar ciclo exige 'administrar' - papel leitura e recusado (${e?.name ?? 'nao lancou'})`);
}

// ====================================================== N18 tenant divergente (R1-b)
{
  const errada: PortaDeLeitura = { ...porta([venda({ lead_id: L1 })]), crmTenantId: 'ffffffff-0000-4000-8000-00000000dead' };
  const e = await lancou(() => executarCiclo(errada, loteEmA()));
  chk('N18', e !== null && /crm_tenant_id/.test(String(e?.message ?? '')),
      `regra 6 porta apontada para outro crm_tenant_id nao executa (${e?.name ?? 'nao lancou'})`);
}

// ====================================================== N19 garantia degradada visivel
{
  const r = await executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })]), loteEmA());
  const linha = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`, A, r.cicloId);
  chk('N19', r.garantiaDeTenantDegradada === true
       && JSON.stringify(linha[0]?.detalhe ?? {}).includes('garantia_de_tenant_degradada'),
      'SPEC-002 R1-b nao cumprida fica REGISTRADA em conector_execucao, nao escondida');
}

// ====================================================== N19b R12 sob a nova forma
{
  /*
   * O ciclo passou a abrir as proprias transacoes, e a invariante 6 tinha que
   * sobreviver a inversao: "ciclo sem contexto de tenant FALHA, nao le zero".
   *
   * O abridor abaixo e o pior abridor possivel - roda o trabalho sem transacao e
   * sem contexto. Se o motor tivesse qualquer caminho proprio ate o banco, ele
   * leria zero em silencio e o ciclo terminaria "ok" com tudo vazio. Ele nao tem:
   * a primeira coisa que toca o banco e `exigir('administrar')`, dentro do lote.
   */
  const semContexto: AbrirLote = ((trabalho) => trabalho()) as AbrirLote;
  const e = await lancou(() => executarCiclo(porta([venda({ lead_id: L1 })]), semContexto));
  chk('N19b', e !== null && /SemContextoDeTenant|contexto/i.test(String(e?.name ?? '') + String(e?.message ?? '')),
      `inv.6 abridor sem contexto de tenant FALHA, nao le zero (${e?.name ?? 'NAO lancou'})`);

  // E o erro simetrico - chamar o ciclo de DENTRO de um withTenant, que e o que
  // a assinatura antiga pedia - para na porta, com o motivo, em vez de virar
  // ContextoAninhado no primeiro lote, longe da causa.
  const eDentro = await lancou(() => emA(() => executarCiclo(porta([venda({ lead_id: L1 })]), loteEmA())));
  chk('N19c', eDentro instanceof CicloDentroDeTransacao,
      `R13 ciclo dentro de withTenant e recusado na porta (${eDentro?.name ?? 'NAO lancou'})`);
}

// ============ N32-N34: test_vitima_de_merge_funde_espelho (SPEC-002 §9 · R18 · inv. 12)
//
// O TESTE QUE FALTAVA, E ELE COBRIA CODIGO QUE JA EXISTIA. `fundirEspelho` estava
// implementada desde 27/07 e a suite provava so a ORDEM da classificacao (N6) -
// que vitima de merge e reconhecida antes de `leads_arquivados`. Que a fusao
// ACONTECE, ninguem provava. Pela regra 8, o invariante 12 era comentario.
//
// Por que importa: sem a fusao, contrato e UC do espelho da vitima ficam
// pendurados num cliente `ativo = false`. O dado nao some - some do lugar onde
// alguem procuraria, que e pior, porque nao ha erro para investigar.
{
  const VITIMA      = 'aaaa4444-0000-4000-8000-00000000cc04';
  const SOBREVIVENTE = 'aaaa5555-0000-4000-8000-00000000cc05';

  // 1. Os dois nascem espelhados pelo caminho normal.
  await executarCiclo(porta([venda({ lead_id: VITIMA }), venda({ lead_id: SOBREVIVENTE })]), loteEmA());
  const [v] = await sql(`SELECT id FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, VITIMA);
  const [s] = await sql(`SELECT id FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, SOBREVIVENTE);

  // 2. A vitima ganha contrato e UC - e o que a R18 existe para nao perder.
  //    Fixture pelo verificador (superuser) de proposito: e montagem de cenario,
  //    nao prova de escrita. A prova roda pelo caminho da aplicacao, abaixo.
  const UC_V = 'eeee9001-0000-4000-8000-00000000ee01';
  const CT_V = 'ffff9001-0000-4000-8000-00000000ff01';
  await sql(`INSERT INTO unidade_consumidora (id, tenant_id, cliente_id, numero_uc, distribuidora)
             VALUES ($1::uuid,$2::uuid,$3::uuid,'UC-VITIMA','Equatorial')`, UC_V, A, v.id);
  await sql(`INSERT INTO contrato (id, tenant_id, cliente_id, unidade_consumidora_id, usina_id,
                                   data_fechamento, valor_referencia_centavos, valor_referencia_origem, status)
             VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'2026-06-01',12345,'local','ativo')`,
           CT_V, A, v.id, UC_V, process.env.TEST_USINA!);

  // 3. O ciclo em que a vitima SAIU do CRM e `lead_merges` explica para onde.
  const r = await executarCiclo(porta(
    [venda({ lead_id: SOBREVIVENTE })],
    [],
    [{ crm_tenant_id: CRM_TENANT, vitima_id: VITIMA, sobrevivente_id: SOBREVIVENTE,
       mesclado_em: new Date(), origem: 'merge' }],
  ), loteEmA());

  const [ct] = await sql(`SELECT cliente_id FROM contrato WHERE id=$1::uuid`, CT_V);
  const [uc] = await sql(`SELECT cliente_id FROM unidade_consumidora WHERE id=$1::uuid`, UC_V);
  chk('N32', ct?.cliente_id === s.id && uc?.cliente_id === s.id,
      `R18 contrato e UC da vitima migram para o espelho do sobrevivente ` +
      `(contrato->${ct?.cliente_id === s.id ? 'sobrevivente' : ct?.cliente_id} , uc->${uc?.cliente_id === s.id ? 'sobrevivente' : uc?.cliente_id})`);

  const [linhaV] = await sql(`SELECT ativo FROM cliente WHERE id=$1::uuid`, v.id);
  chk('N33', r.desativados === 1 && linhaV !== undefined && linhaV.ativo === false,
      `R6 a vitima e DESATIVADA e a linha continua - fusao nao e delecao (linhas=${linhaV ? 1 : 0}, ativo=${linhaV?.ativo})`);

  // 4. O OUTRO SENTIDO, e ele e o que impede a "correcao" de virar perda de dado:
  //    sobrevivente que o financeiro ainda NAO espelhou nao tem para onde mover.
  //    Desativa so, e o contrato fica onde estava ate o proximo ciclo fundir - o
  //    mapa de merge nao expira. Mover para lugar nenhum seria orfanar o contrato.
  const ORFAO = 'aaaa6666-0000-4000-8000-00000000cc06';
  const NUNCA_VISTO = 'aaaa7777-0000-4000-8000-00000000cc07';
  await executarCiclo(porta([venda({ lead_id: ORFAO }), venda({ lead_id: SOBREVIVENTE })]), loteEmA());
  const [o] = await sql(`SELECT id FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, ORFAO);
  const UC_O = 'eeee9002-0000-4000-8000-00000000ee02';
  await sql(`INSERT INTO unidade_consumidora (id, tenant_id, cliente_id, numero_uc, distribuidora)
             VALUES ($1::uuid,$2::uuid,$3::uuid,'UC-ORFAO','Equatorial')`, UC_O, A, o.id);

  await executarCiclo(porta(
    [venda({ lead_id: SOBREVIVENTE })],
    [],
    [{ crm_tenant_id: CRM_TENANT, vitima_id: ORFAO, sobrevivente_id: NUNCA_VISTO,
       mesclado_em: new Date(), origem: 'merge' }],
  ), loteEmA());
  const [ucO] = await sql(`SELECT cliente_id FROM unidade_consumidora WHERE id=$1::uuid`, UC_O);
  const [linhaO] = await sql(`SELECT ativo FROM cliente WHERE id=$1::uuid`, o.id);
  chk('N34', ucO?.cliente_id === o.id && linhaO?.ativo === false,
      'R18 sobrevivente ainda nao espelhado: desativa sem orfanar a UC, e o proximo ciclo funde');
}

// ============ N35-N36: test_conector_so_le_views_financeiro (§9 · inv. 2 · R1)
//
// O criterio §8 pede isto "verificado por LOG DE QUERY, nao por revisao", e ate
// hoje nao havia nem uma coisa nem outra: o cabecalho desta suite afirmava que os
// testes `N1`/`N2` cobriam o invariante 2, e eles NUNCA EXISTIRAM. A afirmacao
// vinha junto de um `LeituraForaDoContrato` importado e nunca asserido.
{
  const { criarLeitorCrm } = await import('../src/crm/leitura.ts');
  const { criarPoolCrm } = await import('../src/crm/conexao.ts');
  const poolReal = criarPoolCrm(process.env.TEST_CRM_URL!, 2);

  // O LOG DE QUERY: um pool interposto que grava tudo que o conector manda ao CRM.
  const enviadas: string[] = [];
  const poolEspiao: any = {
    query: (texto: any, params?: any) => { enviadas.push(String(texto)); return poolReal.query(texto, params); },
  };

  const leitor = criarLeitorCrm({ pool: poolEspiao, crmTenantId: CRM_TENANT });
  await leitor.vendasGanhas();

  // Toda referencia a objeto no SQL enviado. Se aparecer schema que nao seja
  // `financeiro`, ou nome fora das oito views, o invariante 2 caiu.
  const referencias = enviadas.flatMap((q) =>
    [...q.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)].map((m) => m[1]!.toLowerCase()));
  const oito = new Set(leitor.viewsDisponiveis.map((v) => `financeiro.${v}`));
  const forasteiras = referencias.filter((r) => !oito.has(r));

  chk('N35', enviadas.length > 0 && referencias.length > 0 && forasteiras.length === 0,
      `inv.2 log de query: ${enviadas.length} consulta(s) ao CRM, ${referencias.length} referencia(s), ` +
      `todas em financeiro.* (forasteiras: ${forasteiras.join(', ') || 'nenhuma'})`);

  // O outro sentido, e sem ele o N35 e vacuo: o mesmo detector aplicado a uma
  // consulta a TABELA BASE - que e exatamente o que a regra 4 proibe - acusa.
  const plantada = ['SELECT * FROM public.leads JOIN financeiro.vendas_ganhas ON true'];
  const refsPlantadas = plantada.flatMap((q) =>
    [...q.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/gi)].map((m) => m[1]!.toLowerCase()));
  chk('N36', refsPlantadas.filter((r) => !oito.has(r)).length === 1,
      'o detector do N35 ACUSA leitura de tabela base do CRM (public.leads) - senao ele nao detecta nada');

  await poolReal.end();
}

// ============ N37: test_estado_crm_so_conector (§9 · inv. 5 · R7)
//
// "cliente_estado_crm nao e escrito por acao de usuario." Nao ha o que o BANCO
// imponha aqui - `app_financeiro` tem DML na tabela, e precisa ter, porque e o
// conector que escreve pela MESMA role. A garantia e ESTRUTURAL: existe um unico
// escritor no codigo. Garantia estrutural que ninguem verifica e garantia que
// dura ate o proximo PR - entao ela vira teste de catalogo do proprio codigo.
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');

  const varrer = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? varrer(join(dir, e.name))
                  : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);

  const fontes = varrer('src').filter((f) => !f.includes('generated'));
  const escritores = fontes.filter((f) =>
    /cliente_estado_crm\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)/.test(readFileSync(f, 'utf8')));

  chk('N37', escritores.length === 1 && escritores[0]!.endsWith('sincronizacao.ts'),
      `inv.5 um unico escritor de cliente_estado_crm em src/: ${escritores.join(', ') || 'NENHUM'}`);
}

// ============ N38-N44: espelho de `usina` e `usina_geracao` (SPEC-002 §2 "Entra")
//
// REESCRITOS EM 28/07, depois da resposta do dev do CRM, e a reescrita e o ponto.
//
// A primeira versao testava "usina sem distribuidora e recusa ate o CRM
// preencher". O dev respondeu que **nao existe tabela de referencia de
// distribuidoras no CRM** e que tratar como cadastro local nosso esta correto -
// entao a distribuidora nunca vai vir de la, e a R19 estava cobrando de quem nao
// tem o dado. Reclassificada para CAMPO LOCAL, e daí segue que o conector nao
// cria usina: ele espelha as que alguem cadastrou.
{
  const U1 = 'dddd1111-0000-4000-8000-00000000aa01';
  const U2 = 'dddd2222-0000-4000-8000-00000000aa02';

  /*
   * A usina nasce por CADASTRO LOCAL, com a distribuidora que so nos temos.
   *
   * O VALOR LOCAL E DIFERENTE DO QUE O CRM MANDA, DE PROPOSITO, e isso e correcao
   * de um teste fraco: na primeira versao o local era 'Equatorial' e o plantio da
   * sobrescrita tambem gravava 'Equatorial' - o teste passava com a violacao
   * plantada, porque escrever o mesmo valor e indistinguivel de nao escrever.
   * Com valores distintos, qualquer escrita do conector no campo local aparece.
   */
  const USINA_LOCAL = 'dddd9001-0000-4000-8000-00000000dd91';
  await sql(`INSERT INTO distribuidora (nome) VALUES ('Equatorial GO') ON CONFLICT DO NOTHING`);
  await sql(`INSERT INTO usina (id, tenant_id, codigo_geradora, distribuidora, apelido)
             VALUES ($1::uuid,$2::uuid,'GER-CRM-01','Equatorial GO','apelido antigo')`, USINA_LOCAL, A);

  // ---- N38: o conector espelha os campos de espelho da usina ja cadastrada.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', apelido: 'Solar 1', distribuidora: 'Equatorial' })]), loteEmA());
    const [u] = await sql(`SELECT apelido, distribuidora, potencia_kwp, geracao_nominal_kwh,
                                  crm_usina_id, status::text, dono_usina_id
                             FROM usina WHERE id=$1::uuid`, USINA_LOCAL);
    chk('N38', u?.apelido === 'Solar 1' && u?.crm_usina_id === U1
         && String(u?.geracao_nominal_kwh) === '10800.0000' && r.porEntidade.usina.atualizados === 1,
        `§2 usina cadastrada localmente recebe o espelho do CRM (apelido=${u?.apelido}, atualizados=${r.porEntidade.usina.atualizados})`);

    // O TESTE QUE A RESPOSTA DO DEV TORNOU NECESSARIO, e ele e a R5 pura: o CRM
    // mandou `distribuidora = ''` - que e o que ele manda de verdade, nas tres -
    // e o valor LOCAL tem que sobreviver intacto. Sem isto, o primeiro ciclo
    // apagaria a distribuidora de toda usina cadastrada, e a FK recusaria a
    // escrita ou pior: gravaria vazio onde havia dado bom.
    // O CRM mandou 'Equatorial' - um nome VALIDO, que existe na tabela de
    // referencia - e o local e 'Equatorial GO'. Campo local vence mesmo quando a
    // origem tem dado bom: e isso que separa "campo local" de "fallback".
    chk('N39', u?.distribuidora === 'Equatorial GO' && u?.dono_usina_id === null && u?.potencia_kwp === null,
        `R5 campo LOCAL vence: distribuidora segue "${u?.distribuidora}" com o CRM mandando "Equatorial"`);
  }

  // ---- N40: R3 em usina - segunda passada nao escreve.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', apelido: 'Solar 1', distribuidora: '' })]), loteEmA());
    chk('N40', r.porEntidade.usina.criados === 0 && r.porEntidade.usina.atualizados === 0,
        `R3 usina: segunda passada 0 criados, 0 atualizados (c=${r.porEntidade.usina.criados} a=${r.porEntidade.usina.atualizados})`);
  }

  // ---- N41: usina do CRM SEM cadastro local vira recusa contada, e o conector
  // NUNCA cria. Hoje este e o caso real das tres usinas de producao.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: U2, codigo_geradora: 'GER-NAO-CADASTRADA' })]), loteEmA());
    const n = await sql(`SELECT count(*)::int n FROM usina WHERE tenant_id=$1::uuid AND codigo_geradora='GER-NAO-CADASTRADA'`, A);
    const [linha] = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`, A, r.cicloId);
    chk('N41', r.porEntidade.usina.recusados === 1 && r.porEntidade.usina.criados === 0 && n[0].n === 0
         && /nao esta cadastrada no financeiro/.test(JSON.stringify(linha?.detalhe ?? {})),
        `R19 usina sem cadastro local: recusa contada, ZERO criadas (rec=${r.porEntidade.usina.recusados}, criadas=${n[0].n})`);
    chk('N42', r.status === 'parcial',
        `recusa de usina marca o ciclo como parcial, nao como ok (veio ${r.status})`);
  }

  // ---- N43/N44: usina_geracao, e a cascata da recusa.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', apelido: 'Solar 1', distribuidora: '' })],
      [ geracaoCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', competencia: new Date('2026-06-01'), geracao_kwh: '10299.0000' }),
        geracaoCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', competencia: new Date('2026-07-01'), geracao_kwh: '10324.0000' }),
        geracaoCrm({ usina_id: U2, codigo_geradora: 'GER-INEXISTENTE', competencia: new Date('2026-06-01') }),
      ]), loteEmA());

    const g = await sql(`SELECT ug.competencia::text, ug.geracao_kwh::text, ug.origem::text
                           FROM usina_geracao ug WHERE ug.tenant_id=$1::uuid AND ug.usina_id=$2::uuid
                          ORDER BY ug.competencia`, A, USINA_LOCAL);
    chk('N43', g.length === 2 && g[0].origem === 'crm' && g[0].geracao_kwh === '10299.0000'
         && r.porEntidade.usina_geracao.criados === 2 && r.porEntidade.usina_geracao.recusados === 1,
        `§2 geracao espelhada com origem='crm' (${g.length} linhas), e a orfa vira recusa contada ` +
        `(rec=${r.porEntidade.usina_geracao.recusados})`);

    const r2 = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', apelido: 'Solar 1', distribuidora: '' })],
      [ geracaoCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', competencia: new Date('2026-06-01'), geracao_kwh: '10299.0000' }),
        geracaoCrm({ usina_id: U1, codigo_geradora: 'GER-CRM-01', competencia: new Date('2026-07-01'), geracao_kwh: '10324.0000' }),
      ]), loteEmA());
    chk('N44', r2.porEntidade.usina_geracao.criados === 0 && r2.porEntidade.usina_geracao.atualizados === 0,
        `R3 usina_geracao: segunda passada nao escreve (c=${r2.porEntidade.usina_geracao.criados} a=${r2.porEntidade.usina_geracao.atualizados})`);
  }
}

// ============ N45-N50: espelho de `unidade_consumidora` (SPEC-002 §2 · F-01)
//
// Decisao do dono em 28/07, depois da resposta do dev: ESPELHO FIEL. Dos 36 leads
// de rateio, zero aparecem em `vendas_ganhas`, e por nome 24 sao a mesma pessoa
// que um lead ja espelhado. Espelhar cria essas duplicatas - e isso e deliberado,
// porque a duplicidade EXISTE no CRM e o conector espelha em vez de consertar a
// origem. Quando o dedup do CRM mesclar, `lead_merges` avisa e a fusao ja testada
// nos N32-N34 consolida sozinha.
{
  const LR1 = 'aaaa8001-0000-4000-8000-00000000rr01'.replace('rr','cc');
  const LR2 = 'aaaa8002-0000-4000-8000-00000000rr02'.replace('rr','cc');
  const CT1 = 'bbbb8001-0000-4000-8000-00000000cc81';
  const CT2 = 'bbbb8002-0000-4000-8000-00000000cc82';
  const CT3 = 'bbbb8003-0000-4000-8000-00000000cc83';
  const UC_A = '000000000000801';
  const UC_B = '000000000000802';

  // ---- N45: a UC nasce, o cliente do rateio nasce junto, e a distribuidora e
  // HERDADA da usina cadastrada localmente ('Equatorial GO', nao 'Equatorial').
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio', percentual_rateio: '5.5000' })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());

    const [uc] = await sql(`SELECT u.numero_uc, u.distribuidora, u.percentual_rateio::text, u.crm_usina_cliente_id,
                                   c.nome AS cliente_nome, c.crm_lead_id, us.codigo_geradora
                              FROM unidade_consumidora u
                              JOIN cliente c ON c.id = u.cliente_id
                              LEFT JOIN usina us ON us.id = u.usina_id
                             WHERE u.tenant_id=$1::uuid AND u.numero_uc=$2`, A, UC_A);
    chk('N45', uc?.cliente_nome === 'Fulano do Rateio' && uc?.crm_lead_id === LR1
         && uc?.codigo_geradora === 'GER-CRM-01' && uc?.crm_usina_cliente_id === CT1,
        `§2 UC espelhada com cliente criado do rateio e vinculo de usina (cliente=${uc?.cliente_nome})`);

    // A HERANCA, que e o ponto que precisa de confirmacao (Q-UC-DISTRIB-01): a
    // distribuidora nao vem do CRM - ele nem a expoe em rateio_clientes - e nao e
    // escolhida pelo conector. Ela e PROPAGADA da usina que alguem cadastrou.
    chk('N46', uc?.distribuidora === 'Equatorial GO',
        `Q-UC-DISTRIB-01 a UC herda a distribuidora da usina vinculada, nao um default (veio "${uc?.distribuidora}")`);

    // R7: `tem_rateio_ativo` era a coluna que nascia NULL e ninguem preenchia.
    const [est] = await sql(`SELECT e.tem_rateio_ativo, e.tem_venda_ganha FROM cliente_estado_crm e
                               JOIN cliente c ON c.id = e.cliente_id
                              WHERE c.tenant_id=$1::uuid AND c.crm_lead_id=$2::uuid`, A, LR1);
    chk('N47', est?.tem_rateio_ativo === true,
        `R7 cliente de rateio ganha tem_rateio_ativo = true (veio ${est?.tem_rateio_ativo})`);
  }

  // ---- N48: R3 na UC.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio', percentual_rateio: '5.5000' })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());
    chk('N48', r.porEntidade.unidade_consumidora.criados === 0 && r.porEntidade.unidade_consumidora.atualizados === 0
         && r.porEntidade.cliente.criados === 0,
        `R3 UC: segunda passada nao cria nem atualiza (uc c=${r.porEntidade.unidade_consumidora.criados} a=${r.porEntidade.unidade_consumidora.atualizados})`);
  }

  // ---- N49: A UC REPETIDA - o caso real medido em producao (UC-DUP-01).
  // Duas linhas de rateio, leads diferentes, MESMA UC. O conector nao escolhe
  // qual vale: recusa contada, e a primeira sobrevive sem 23505 no meio do lote.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [ rateioCliCrm({ contrato_id: CT3, uc: UC_B, cliente: 'Primeiro' }),
        rateioCliCrm({ contrato_id: CT2, uc: UC_B, cliente: 'Segundo' }) ],
      [ rateioCreCrm({ contrato_id: CT3, lead_id: LR1 }),
        rateioCreCrm({ contrato_id: CT2, lead_id: LR2 }) ]), loteEmA());
    const n = await sql(`SELECT count(*)::int n FROM unidade_consumidora WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_B);
    const [linha] = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`, A, r.cicloId);
    chk('N49', n[0].n === 1 && r.porEntidade.unidade_consumidora.recusados === 1
         && /UC-DUP-01/.test(JSON.stringify(linha?.detalhe ?? {})),
        `UC-DUP-01 mesma UC em dois contratos: UMA gravada, a outra recusada com o motivo (gravadas=${n[0].n}, rec=${r.porEntidade.unidade_consumidora.recusados})`);
  }

  // ---- N51/N52: o SINAL da Q-UC-DISTRIB-01.
  //
  // A R21 supoe que UC e usina estao sempre na mesma distribuidora. A suposicao
  // NAO foi verificada contra a norma - e o motivo da questao. Mas ha um risco
  // que independe da norma: `distribuidora` e campo LOCAL e o conector nao o toca
  // no update (R5), entao um humano pode edita-lo e ate aqui nada notaria.
  //
  // O sinal nao recusa e nao sobrescreve. Ele so impede o silencio.
  {
    // Caminho limpo primeiro: sem divergencia, zero sinais. Sem este, o N51
    // poderia estar acusando qualquer coisa em vez da divergencia.
    const semDiv = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio' })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());
    chk('N51', semDiv.divergencias.length === 0,
        `Q-UC-DISTRIB-01 UC e usina na mesma distribuidora: zero sinais (${semDiv.divergencias.length})`);

    // Agora a edicao humana: alguem troca a distribuidora da UC no cadastro local.
    // O `Equatorial` existe na tabela de referencia, entao a FK aceita - e e por
    // isso que a divergencia e possivel e nao e pega por constraint.
    await sql(`UPDATE unidade_consumidora SET distribuidora='Equatorial'
                WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);

    const comDiv = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio' })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());

    const [depois] = await sql(`SELECT distribuidora FROM unidade_consumidora
                                 WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);
    const [linha] = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`,
                              A, comDiv.cicloId);
    const d = comDiv.divergencias[0];
    chk('N52', comDiv.divergencias.length === 1 && d?.entidade === 'unidade_consumidora'
         && d?.chave === UC_A && /Q-UC-DISTRIB-01/.test(d?.sinal ?? '')
         && /divergencias/.test(JSON.stringify(linha?.detalhe ?? {})),
        `Q-UC-DISTRIB-01 divergencia entre UC e usina vira SINAL em conector_execucao (${comDiv.divergencias.length})`);

    // As duas metades que separam sinal de recusa e de sobrescrita:
    chk('N53', depois?.distribuidora === 'Equatorial' && comDiv.porEntidade.unidade_consumidora.recusados === 0
         && comDiv.status !== 'erro',
        `R5 o sinal NAO sobrescreve o campo local ("${depois?.distribuidora}") e NAO vira recusa (rec=${comDiv.porEntidade.unidade_consumidora.recusados})`);

    // ---- N54: o sinal SOBREVIVE ao ciclo que morre depois de te-lo visto.
    //
    // `divergencias` so chega ao `detalhe` pelo `fechar()`, e o `fechar()` do
    // caminho de ERRO e outro trecho de codigo - ele levava `recusas` e nao levava
    // `divergencias`. O lote da UC ja esta COMMITADO quando a interrupcao chega,
    // entao a divergencia e fato gravado no banco; perde-la aqui apagaria o sinal
    // exatamente no ciclo em que alguem vai olhar.
    //
    // A interrupcao entra por `leadMerges()`, que a §4.3 le DEPOIS do espelho de UC.
    {
      const p = porta([venda({ lead_id: L1 })], [], [], true,
        [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
        [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio' })],
        [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]);
      p.leadMerges = async () => { throw new Error('queda simulada na reconciliacao'); };

      let caiu = false;
      try { await executarCiclo(p, loteEmA()); } catch { caiu = true; }

      const [linha] = await sql(`SELECT status, detalhe FROM conector_execucao
                                   WHERE tenant_id=$1::uuid ORDER BY terminado_em DESC NULLS LAST LIMIT 1`, A);
      const det = JSON.stringify(linha?.detalhe ?? {});
      chk('N54', caiu && /queda simulada/.test(det) && /divergencias/.test(det) && new RegExp(UC_A).test(det),
          `o ciclo interrompido ainda grava a divergencia ja vista (status=${linha?.status})`);
    }

    // Devolve o estado para nao contaminar os testes seguintes.
    await sql(`UPDATE unidade_consumidora SET distribuidora='Equatorial GO'
                WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);
  }

  // ---- N55/N56: `data_vencimento` e CAMPO LOCAL (SPEC-002 R25).
  //
  // O DEFEITO QUE ESTES DOIS REGISTRAM, medido em 03/08/2026: `data_vencimento`
  // viajava dentro do objeto `espelho` e ia para o `updateMany`. O CRM tem a
  // coluna e a tem VAZIA - 41 de 41 linhas de `financeiro.rateio_clientes` com
  // NULL, medido no dia -, entao a UC preenchida pelo financeiro divergia do
  // NULL do CRM, o `mudou` acusava, e o update gravava NULL de volta.
  //
  // Preencher os 39 vencimentos e rodar `npm run ciclo` apagaria os 39. Sem
  // erro, sem log e sem recusa: a proxima composicao de lote recusaria tudo por
  // `sem_vencimento` e o motivo pareceria "ninguem preencheu".
  //
  // O N55 e o registro EXECUTAVEL do defeito - ele falha contra o codigo antigo.
  {
    // O financeiro preenche. E o que a operacao vai fazer com as 39.
    await sql(`UPDATE unidade_consumidora SET data_vencimento='2026-08-10'
                WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);

    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      // `data_vencimento: null` e o default da fixture, e e a forma REAL do CRM.
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio' })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());

    /* O driver devolve `date` como Date de MEIA-NOITE LOCAL. `String(d)` da
     * "Mon Aug 10 2026 ..." e `toISOString()` pode recuar um dia em fuso a oeste
     * de Greenwich - as duas comparariam errado, e a primeira ja comparou: esta
     * verificacao ficou vermelha por causa dela mesma antes de o conserto entrar.
     * Os getters locais casam com o que o driver montou. */
    const dia10 = (d: any): string | null => {
      if (!d) return null;
      const x = new Date(d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };

    const [dep] = await sql(`SELECT data_vencimento FROM unidade_consumidora
                              WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);
    chk('N55', dia10(dep?.data_vencimento) === '2026-08-10' && r.divergencias.length === 0,
        `SPEC-002 R25 o vencimento preenchido pelo financeiro SOBREVIVE ao ciclo com CRM vazio `
        + `(ficou=${dia10(dep?.data_vencimento) ?? 'NULL'}, div=${r.divergencias.length})`);

    // Agora o CRM manda um valor, e DIFERENTE. Campo local: o usuario vence (R5),
    // e a divergencia vira SINAL - mesma forma da R21-b, e pelo mesmo motivo:
    // sobrescrever seria a R5 ao contrario, e calar deixaria as duas fontes
    // divergindo sem que ninguem soubesse.
    const comDiv = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true,
      [usinaCrm({ usina_id: 'dddd1111-0000-4000-8000-00000000aa01', codigo_geradora: 'GER-CRM-01' })], [],
      [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio',
                      data_vencimento: new Date('2026-08-25') })],
      [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })]), loteEmA());

    const [dep2] = await sql(`SELECT data_vencimento FROM unidade_consumidora
                               WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);
    const [linha] = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`,
                              A, comDiv.cicloId);
    const d = comDiv.divergencias.find((x: any) => /vencimento/i.test(x.sinal ?? ''));
    chk('N56', dia10(dep2?.data_vencimento) === '2026-08-10'
         && d?.entidade === 'unidade_consumidora' && d?.chave === UC_A
         && comDiv.porEntidade.unidade_consumidora.recusados === 0 && comDiv.status !== 'erro'
         && /divergencias/.test(JSON.stringify(linha?.detalhe ?? {})),
        `SPEC-002 R25 CRM com vencimento diferente vira SINAL e NAO sobrescreve `
        + `(ficou=${dia10(dep2?.data_vencimento) ?? 'NULL'}, rec=${comDiv.porEntidade.unidade_consumidora.recusados})`);

    await sql(`UPDATE unidade_consumidora SET data_vencimento=NULL
                WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);
  }

  // ---- N50: cascata - UC de usina nao espelhada nao tem de quem herdar.
  {
    const r = await executarCiclo(porta([venda({ lead_id: L1 })], [], [], true, [], [],
      [rateioCliCrm({ contrato_id: 'bbbb8009-0000-4000-8000-00000000cc89', uc: '000000000000899',
                      codigo_geradora: 'GER-INEXISTENTE' })],
      [rateioCreCrm({ contrato_id: 'bbbb8009-0000-4000-8000-00000000cc89', lead_id: LR2 })]), loteEmA());
    const n = await sql(`SELECT count(*)::int n FROM unidade_consumidora WHERE tenant_id=$1::uuid AND numero_uc='000000000000899'`, A);
    chk('N50', n[0].n === 0 && r.porEntidade.unidade_consumidora.recusados === 1,
        `cascata: UC de usina nao espelhada e recusa contada, nao UC sem distribuidora (rec=${r.porEntidade.unidade_consumidora.recusados})`);
  }

  // ---- N57-N62: O EIXO DO ORIGINADOR CONFERIDO CONTRA O CREDITO (R26).
  //
  // A decisao esta em `src/dominio/credito-originador.ts` e tem 28 verificacoes
  // PURAS em `tests/credito-originador.ts`. O que estes seis provam e o que
  // aquelas nao alcancam, e e outra coisa:
  //
  //   N57  a view vazia declara que a conferencia NAO RODOU, e isso CHEGA AO BANCO
  //   N58  o caminho limpo, contra UC de verdade lida do nosso schema
  //   N59  o sinal chega ao `conector_execucao.detalhe` e NAO vira recusa
  //   N60  o resumo de situacao chega ao `detalhe` como CONTAGEM
  //   N61  invariante 14 - a conferencia nao escreve NADA, medido campo a campo
  //   N62  o contrato digitado sobrevive ao ciclo com o originador divergente
  //
  // O par mudo/falante e sempre montado com UM campo de diferenca, para que a
  // verificacao esteja medindo a condicao e nao o cenario.
  {
    const USINA_ID = 'dddd1111-0000-4000-8000-00000000aa01';
    const cenario = (creditos: VendaCreditada[] = [], situacoes: RateioSituacao[] = []) =>
      porta([venda({ lead_id: L1 })], [], [], true,
        [usinaCrm({ usina_id: USINA_ID, codigo_geradora: 'GER-CRM-01' })], [],
        [rateioCliCrm({ contrato_id: CT1, uc: UC_A, cliente: 'Fulano do Rateio' })],
        [rateioCreCrm({ contrato_id: CT1, lead_id: LR1 })], creditos, situacoes);
    const detalheDe = async (cicloId: string) => {
      const [l] = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`,
                            A, cicloId);
      return (l?.detalhe ?? {}) as any;
    };

    // ---- N57: view vazia = conferencia nao rodou. E o estado de todos os
    // testes acima, e por isso nenhum deles carrega divergencia de credito.
    {
      const r = await executarCiclo(cenario(), loteEmA());
      const det = await detalheDe(r.cicloId);
      chk('N57', r.creditoConferido === false && r.divergencias.length === 0
           && det.credito_conferido === false && typeof det.nota_credito === 'string',
          `R26 vendas_creditadas vazia: NAO acusa nenhuma UC e o detalhe DIZ que nao rodou `
          + `(conferido=${r.creditoConferido}, div=${r.divergencias.length})`);
    }

    /*
     * A CONTAGEM E POR UC, NUNCA O TOTAL DO CICLO - e a primeira versao destas
     * duas verificacoes usava o total e ficou vermelha por isso.
     *
     * O tenant do teste acumula as UCs dos blocos anteriores (N45-N50), e so a
     * UC_A recebe credito nas fixtures daqui: o total legitimamente traz ~37
     * sinais de "sem credito vigente" que nao tem nada a ver com o que estas
     * verificacoes afirmam. Prender o total seria prender ORDEM DE EXECUCAO,
     * que e o mesmo criterio que `tests/repos-documento.ts` ja registrou:
     * afirmar a RELACAO, nao a constante.
     */
    const naUc = (r: { divergencias: { chave: string; sinal: string }[] }, uc = UC_A) =>
      r.divergencias.filter((d) => d.chave === uc);

    // ---- N58: o caminho limpo. Sem ele o N59 poderia estar acusando qualquer coisa.
    {
      const r = await executarCiclo(cenario([creditoCrm({ uc: UC_A })], [situacaoCrm({ uc: UC_A })]), loteEmA());
      chk('N58', r.creditoConferido === true && naUc(r).length === 0,
          `R26 UC espelhada com credito vigente unico: conferido e ZERO sinais NELA (${naUc(r).length})`);
    }

    // ---- N59: um campo de diferenca - o credito da UC vem REVOGADO e sem
    // substituto. O sinal aparece, e nao vira recusa nem derruba o status.
    {
      const r = await executarCiclo(cenario(
        [creditoCrm({ uc: UC_A, vigente: false, revogado_motivo: 'venda cancelada pelo cliente' }),
         creditoCrm({ uc: '000000000000899' })],   // outra UC: a view nao esta vazia
        [situacaoCrm({ uc: UC_A })]), loteEmA());
      const det = await detalheDe(r.cicloId);
      const d = r.divergencias.find((x) => x.chave === UC_A && /REVOGADO/.test(x.sinal));
      chk('N59', d !== undefined && r.porEntidade.unidade_consumidora.recusados === 0
           && r.status !== 'erro' && /venda cancelada pelo cliente/.test(JSON.stringify(det.divergencias ?? [])),
          `R26 credito revogado sem substituto vira SINAL com o motivo do CRM, sem recusa `
          + `(rec=${r.porEntidade.unidade_consumidora.recusados}, status=${r.status})`);
    }

    // ---- N60: o resumo e CONTAGEM, e conta as ESPELHADAS.
    //
    // A view leva tres UCs e so uma esta espelhada neste tenant. Contar a view
    // daria 3 e responderia a pergunta errada: o numero existe para dizer
    // quantas das MINHAS estao nao ativadas (11 de 39 em producao, 03/08).
    {
      const r = await executarCiclo(cenario(
        [creditoCrm({ uc: UC_A })],
        [situacaoCrm({ uc: UC_A, situacao: 'nao_ativado', em_troca_titularidade: true }),
         situacaoCrm({ uc: '000000000000898', situacao: 'nao_ativado' }),
         situacaoCrm({ uc: '000000000000899' })]), loteEmA());
      const det = await detalheDe(r.cicloId);
      const s = det.situacao_do_rateio ?? {};
      chk('N60', s.nao_ativado === 1 && s.em_troca_titularidade === 1 && s.ativado === 0
           && naUc(r).length === 0,
          `R26 situacao do rateio chega ao detalhe como contagem das ESPELHADAS, e sem contrato `
          + `nao vira sinal (nao_ativado=${s.nao_ativado}, ativado=${s.ativado}, div_na_uc=${naUc(r).length})`);
    }

    // ---- N61/N62: INVARIANTE 14 - a conferencia nao escreve nada.
    //
    // Este e o par que importa mais, porque o modo de falha e silencioso: um
    // conector que "corrigisse" o originador a partir do credito pagaria outra
    // pessoa sem erro e sem log, e a R20-b congela o tipo no rascunhar sem
    // caminho de edicao. Aqui o contrato e PLANTADO com o originador ERRADO de
    // proposito, e a afirmacao e que ele continua errado depois do ciclo.
    {
      const ORIG = 'aaaa7001-0000-4000-8000-00000000dd01';
      const CTR  = 'bbbb7001-0000-4000-8000-00000000dd02';
      const [ucLinha] = await sql(`SELECT id, cliente_id, percentual_rateio::text, crm_usina_cliente_id
                                     FROM unidade_consumidora WHERE tenant_id=$1::uuid AND numero_uc=$2`, A, UC_A);

      await sql(`INSERT INTO originador (id, tenant_id, nome, natureza, tipo, documento, documento_tipo)
                 VALUES ($1::uuid,$2::uuid,'Out Sales','pj','terceirizado','19131243000197','cnpj')
                 ON CONFLICT DO NOTHING`, ORIG, A);
      await sql(`INSERT INTO contrato (id, tenant_id, cliente_id, unidade_consumidora_id, usina_id,
                                       originador_id, originador_tipo_no_fechamento, data_fechamento,
                                       valor_referencia_centavos, valor_referencia_origem, status)
                 VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'terceirizado','2026-06-01',
                         12345,'local','ativo')
                 ON CONFLICT DO NOTHING`,
               CTR, A, ucLinha.cliente_id, ucLinha.id, process.env.TEST_USINA!, ORIG);

      // O credito diz Renata; o contrato congelou Out Sales. C3 dispara.
      const r = await executarCiclo(cenario(
        [creditoCrm({ uc: UC_A, vendedor: 'Renata' })],
        [situacaoCrm({ uc: UC_A, situacao: 'nao_ativado' })]), loteEmA());

      const d = r.divergencias.find((x) => x.chave === UC_A && /Out Sales/.test(x.sinal) && /Renata/.test(x.sinal));
      // C5 tambem dispara aqui, e de proposito: o contrato esta ATIVO sobre um
      // rateio que o CRM nao da por ativado. Sao dois fatos, dois sinais.
      const c5 = r.divergencias.find((x) => x.chave === UC_A && /Q-SITUACAO-01/.test(x.sinal));
      chk('N61', d !== undefined && c5 !== undefined && r.porEntidade.unidade_consumidora.recusados === 0,
          `R26 contrato com originador divergente do credito vira SINAL, e o rateio nao ativado `
          + `sob contrato ATIVO vira outro (sinais na UC=${r.divergencias.filter((x) => x.chave === UC_A).length})`);

      const [ct] = await sql(`SELECT originador_id, originador_tipo_no_fechamento, status FROM contrato WHERE id=$1::uuid`, CTR);
      const [uc2] = await sql(`SELECT cliente_id, percentual_rateio::text, crm_usina_cliente_id
                                 FROM unidade_consumidora WHERE id=$1::uuid`, ucLinha.id);
      chk('N62', ct?.originador_id === ORIG && ct?.originador_tipo_no_fechamento === 'terceirizado'
           && ct?.status === 'ativo' && uc2?.cliente_id === ucLinha.cliente_id
           && uc2?.percentual_rateio === ucLinha.percentual_rateio
           && uc2?.crm_usina_cliente_id === ucLinha.crm_usina_cliente_id,
          `invariante 14 a conferencia NAO ESCREVE: originador, tipo congelado, status e a UC `
          + `inteiros depois do ciclo (originador=${ct?.originador_id === ORIG ? 'intacto' : ct?.originador_id})`);

      // Devolve o estado: o contrato plantado atrapalharia os testes seguintes,
      // que contam UCs e clientes sem esperar contrato nenhum.
      await sql(`DELETE FROM contrato WHERE id=$1::uuid`, CTR);
      await sql(`DELETE FROM originador WHERE id=$1::uuid`, ORIG);
    }
  }
}

// ============ N26-N29: test_lote_respeita_timeout (SPEC-002 §9 · R13 · criterio 9)
//
// O TESTE QUE FALTAVA, E O QUE ELE TEM QUE PROVAR NAO E TEMPO LOCAL.
//
// A Q-LOTE-01 morreu com P2028 aos 15.330 ms contra `sa-east-1`, e a causa foi
// LATENCIA: ~205 viagens ao banco numa transacao so. Localmente essas mesmas 205
// viagens levam menos de um segundo - medir relogio aqui daria verde para o
// codigo que morreu em producao. Entao o que se mede e o que GENERALIZA:
//
//   1. quantas VIAGENS ao banco a maior transacao do ciclo faz;
//   2. quantos leads a maior transacao carrega;
//   3. e o produto (viagens x latencia medida em producao) contra os 15 s.
//
// A latencia abaixo nao e chute: e a que a Q-LOTE-01 registrou - 15.330 ms para
// ~205 viagens da ~75 ms por viagem contra sa-east-1.
{
  const LATENCIA_SA_EAST_1_MS = 75;
  const TIMEOUT_MS = 15_000;     // o mesmo de withTenantEm, em contexto.ts

  let viagensNoLote = 0;
  // A instrumentacao e uma extensao do Prisma, e nao um contador dentro do motor:
  // contador no motor mede o que o autor lembrou de contar. Aqui toda operacao
  // que sai para o banco passa por este gancho, inclusive as que eu esquecer.
  const contando = prisma.$extends({
    query: { async $allOperations({ args, query }: any) { viagensNoLote++; return query(args); } },
  });

  let transacoes = 0, piorLote = 0;
  const loteMedido = (tamanhoDoLote?: number) => {
    transacoes = 0; piorLote = 0;
    const abridor: AbrirLote = ((trabalho) => {
      transacoes++;
      viagensNoLote = 0;
      return withTenantEm(contando as any, { tenantId: A, usuarioId: U }, () => trabalho())
        .then((v: any) => { piorLote = Math.max(piorLote, viagensNoLote); return v; });
    }) as AbrirLote;
    return { abridor, opcoes: tamanhoDoLote ? { tamanhoDoLote } : {} };
  };

  const MIL = Array.from({ length: 1000 }, (_, i) => venda({
    lead_id: `bbbb${String(i).padStart(4, '0')}-0000-4000-8000-00000000dd00`,
    nome: `Volume ${i}`,
  }));
  chk('N26a', emLotes(MIL, TAMANHO_DO_LOTE).length === Math.ceil(1000 / TAMANHO_DO_LOTE),
      `R13 1.000 linhas cabem em ${Math.ceil(1000 / TAMANHO_DO_LOTE)} lotes de ${TAMANHO_DO_LOTE}`);

  // ---- N26: as 1.000 entram, e nenhuma transacao fica gigante.
  {
    const m = loteMedido();
    const r = await executarCiclo(porta(MIL), m.abridor, m.opcoes);
    const custoDoPiorLote = piorLote * LATENCIA_SA_EAST_1_MS;
    chk('N26', r.criados === 1000 && r.maiorLote <= TAMANHO_DO_LOTE && transacoes >= 20,
        `1.000 leads espelhados em ${transacoes} transacoes, maior lote ${r.maiorLote} (criados=${r.criados})`);
    chk('N27', custoDoPiorLote < TIMEOUT_MS,
        `criterio §8: pior lote fez ${piorLote} viagens = ${custoDoPiorLote} ms a ${LATENCIA_SA_EAST_1_MS} ms/viagem, ` +
        `contra o timeout de ${TIMEOUT_MS} ms`);
    // LIMITE HONESTO DO N27, medido com o plantio: com o lote em 1.000 ele
    // CONTINUA passando, porque criar em massa e barato - 1.000 clientes saem em
    // 20 `createMany`. Quem acusa a transacao gigante e o N29, onde a carga e de
    // ATUALIZACAO, que e a unica que nao tem forma em bloco. O N27 sozinho daria
    // verde para o codigo que morreu em producao.
  }

  // ---- N28: O OUTRO SENTIDO, e e ele que da valor ao N27.
  // Mesmo motor, mesmos 1.000, mas com o lote em 1.000 - que e a transacao unica
  // que morreu em producao. A medicao tem que ACUSAR: uma so transacao de
  // trabalho, carregando as 1.000, e um custo projetado ACIMA do timeout.
  // Os 1.000 mudam de nome de proposito: e a escrita por linha - a unica que nao
  // tem forma em bloco - que faz o custo explodir.
  {
    const MUDADOS = MIL.map((l) => ({ ...l, nome: l.nome + ' v2' }));
    const m = loteMedido(1000);
    const r = await executarCiclo(porta(MUDADOS), m.abridor, m.opcoes);
    const custoDoPiorLote = piorLote * LATENCIA_SA_EAST_1_MS;
    chk('N28', r.atualizados === 1000 && r.maiorLote === 1000 && custoDoPiorLote > TIMEOUT_MS,
        `a medicao ACUSA a transacao unica: 1 lote de ${r.maiorLote}, ${piorLote} viagens = ` +
        `${custoDoPiorLote} ms > ${TIMEOUT_MS} ms - e a Q-LOTE-01 reproduzida`);
  }

  // ---- N29: a MESMA mudanca em massa, com o lote declarado, cabe.
  // Sem este, o N28 poderia estar acusando "1.000 updates sao caros" em vez de
  // "1.000 updates NUMA TRANSACAO sao caros", e a correcao nao estaria provada.
  {
    const MUDADOS = MIL.map((l) => ({ ...l, nome: l.nome + ' v3' }));
    const m = loteMedido();
    const r = await executarCiclo(porta(MUDADOS), m.abridor, m.opcoes);
    const custoDoPiorLote = piorLote * LATENCIA_SA_EAST_1_MS;
    chk('N29', r.atualizados === 1000 && custoDoPiorLote < TIMEOUT_MS,
        `a mesma carga em lotes de ${TAMANHO_DO_LOTE}: pior lote ${piorLote} viagens = ` +
        `${custoDoPiorLote} ms, cabe nos ${TIMEOUT_MS} ms (${transacoes} transacoes)`);
  }

  // ---- N30: R3 EM ESCALA. A idempotencia foi provada com duas linhas (N10); o
  // que a segunda passada de 1.000 acrescenta e que ela e BARATA - o lote que nao
  // muda nada custa leitura, nao escrita. E o criterio de saida "sync idempotente"
  // do passo 5, no volume em que ele vai rodar.
  {
    const MUDADOS = MIL.map((l) => ({ ...l, nome: l.nome + ' v3' }));
    const antes = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
    const m = loteMedido();
    const r = await executarCiclo(porta(MUDADOS), m.abridor, m.opcoes);
    const depois = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
    chk('N30', r.criados === 0 && r.atualizados === 0 && antes[0].n === depois[0].n && piorLote <= 8,
        `R3 em 1.000 linhas: 0 criados, 0 atualizados, e o lote sem mudanca custa ` +
        `${piorLote} viagens (c=${r.criados} a=${r.atualizados})`);
  }

  // ---- N31: os contadores chegam a `conector_execucao` AO FIM DE CADA LOTE, que
  // e a metade da R13 que ninguem ve. Sem isto, um ciclo que morre no lote 15
  // deixa um registro dizendo zero, e o operador nao tem como saber o que entrou.
  {
    const MUDADOS = MIL.slice(0, 200).map((l) => ({ ...l, nome: l.nome + ' v4' }));
    let contadoresNoMeio: any[] = [];
    const abridor: AbrirLote = ((trabalho) =>
      withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => trabalho())
        .then(async (v: any) => {
          // Lido por FORA da transacao do lote: e o que um operador enxergaria
          // com o ciclo ainda correndo. Se os contadores so fossem gravados no
          // fim, todas estas leituras veriam zero.
          const l = await sql(`SELECT criados, atualizados, status::text FROM conector_execucao
                                 WHERE tenant_id=$1::uuid AND status='em_andamento'`, A);
          if (l[0]) contadoresNoMeio.push(l[0]);
          return v;
        })) as AbrirLote;
    const r = await executarCiclo(porta(MUDADOS), abridor);
    const parciais = contadoresNoMeio.map((c) => c.atualizados);
    // O que prova a R13: uma contagem PARCIAL - maior que zero e menor que o
    // total - ja gravada e visivel de fora enquanto o ciclo ainda corria.
    const parcialVisivel = parciais.some((p: number) => p > 0 && p < 200);
    chk('N31', r.atualizados === 200 && parcialVisivel,
        `R13 conector_execucao atualizado ao fim de CADA lote - visto de fora: ${parciais.join(' -> ')}`);
  }
}

// ============================ N20-N24: a PORTA DE LEITURA de verdade
// Ate aqui a porta era stub. Estes cinco exercitam src/crm/leitura.ts e
// src/crm/conexao.ts contra um schema `financeiro` real (falso no conteudo, com
// a forma das views do CRM) e pela role somente-leitura crm_ro_teste.
{
  const { criarLeitorCrm, TenantDivergenteNoCrm, LeituraForaDoContrato } =
    await import('../src/crm/leitura.ts');
  const { conferirRoleDeLeitura, RoleDoCrmInsegura, criarPoolCrm } =
    await import('../src/crm/conexao.ts');

  const poolCrm = criarPoolCrm(process.env.TEST_CRM_URL!, 2);

  // N20 - a guarda de arranque ACEITA a role limpa, e diz quais views tem tenant.
  const diag = await conferirRoleDeLeitura(poolCrm);
  chk('N20', diag.usuario === 'crm_ro_teste' && diag.viewsComColunaDeTenant.includes('vendas_ganhas'),
      `conferirRoleDeLeitura aceita role somente-leitura e detecta a coluna de tenant (${diag.usuario})`);

  // N21 - e RECUSA a role com poder de escrita. O outro sentido, que e o que
  // importa: uma guarda que so sabe aceitar nao guarda nada.
  const poolGordo = criarPoolCrm(process.env.TEST_DATABASE_URL!, 1);
  const eGordo = await lancou(() => conferirRoleDeLeitura(poolGordo));
  chk('N21', eGordo instanceof RoleDoCrmInsegura && /ESCREVER/.test(String(eGordo.message)),
      `regra 4 credencial com escrita em schema de negocio nao arranca (${eGordo?.name ?? 'NAO recusou'})`);
  // A guarda tem que enxergar privilegio HERDADO por participacao em role, que
  // e como app_financeiro_login tem escrita: por ser membro de app_financeiro.
  // A primeira versao filtrava information_schema por grantee = current_user e
  // nao via nada disso - passava a credencial errada.
  chk('N21b', eGordo instanceof RoleDoCrmInsegura && /public\./.test(String(eGordo.message)),
      'a recusa NOMEIA o objeto de negocio alcancavel, e o privilegio e herdado por role');
  await poolGordo.end();

  // N22 - leitura real: o SQL constante roda e devolve as colunas nomeadas.
  const semValidar = criarLeitorCrm({ pool: poolCrm, crmTenantId: CRM_TENANT });
  const r0 = await semValidar.vendasGanhas();
  chk('N22', r0.linhas.length === 2 && r0.garantiaDegradada === true,
      `sem a view na lista de validacao, le e marca garantia DEGRADADA (${r0.linhas.length} linhas)`);

  // N23 - INVARIANTE 9: com a validacao ligada, a linha de outra empresa aborta.
  // E o test_tenant_divergente_aborta_ciclo da SPEC-002 §9.
  const validando = criarLeitorCrm({
    pool: poolCrm, crmTenantId: CRM_TENANT, viewsComColunaDeTenant: ['vendas_ganhas'],
  });
  const eDiv = await lancou(() => validando.vendasGanhas());
  chk('N23', eDiv instanceof TenantDivergenteNoCrm && /ffffffff/.test(String(eDiv.message)),
      `inv.9 linha com crm_tenant_id de outra empresa ABORTA a leitura (${eDiv?.name ?? 'NAO abortou'})`);

  // N24 - e o caminho legitimo continua passando. Aperto que quebra o caminho
  // bom nao e correcao, e outro defeito.
  await verificador.query(`DELETE FROM financeiro._vg WHERE crm_tenant_id <> $1`, [CRM_TENANT]);
  const r1 = await validando.vendasGanhas();
  chk('N24', r1.linhas.length === 1 && r1.garantiaDegradada === false,
      `so linhas do tenant certo: le normal e a garantia NAO e degradada (${r1.linhas.length})`);

  // Regra 4 em runtime: a sessao e read-only, entao nem um INSERT direto passa.
  const eEscrita = await lancou(() => poolCrm.query(`INSERT INTO financeiro._vg (codigo) VALUES ('X')`));
  chk('N25', eEscrita !== null && /read-only|permission|permissao/i.test(String(eEscrita?.message)),
      `inv.1 escrita no CRM falha (${String(eEscrita?.message ?? 'NAO falhou').slice(0, 40)})`);

  await poolCrm.end();
}

await verificador.end();
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
