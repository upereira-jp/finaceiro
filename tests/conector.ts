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
// O que o stub NAO cobre e coberto por outro caminho: que so as views
// financeiro.* sao alcancadas (N1/N2, por leitura do modulo) e que a credencial
// nao escreve (N3, por catalogo contra o CRM real).

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import {
  executarCiclo, deduplicarPorLead, motivoDeRecusa, classificarAusencia,
  CicloJaEmAndamento, type PortaDeLeitura,
} from '../src/crm/sincronizacao.ts';
import type { VendaGanha, LeadArquivado, LeadMerge } from '../src/crm/leitura.ts';

const CONN = process.env.TEST_DATABASE_URL!;
const A = process.env.TEST_TENANT_A!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;
const CRM_TENANT = process.env.TEST_CRM_TENANT!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
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

const porta = (
  vendas: VendaGanha[], arquivados: LeadArquivado[] = [], merges: LeadMerge[] = [],
  degradada = true,
): PortaDeLeitura => ({
  crmTenantId: CRM_TENANT,
  vendasGanhas:    async () => ({ linhas: vendas, garantiaDegradada: degradada }),
  leadsArquivados: async () => ({ linhas: arquivados, garantiaDegradada: degradada }),
  leadMerges:      async () => ({ linhas: merges, garantiaDegradada: degradada }),
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
  const ambigua = motivoDeRecusa(venda({ lead_id: L1, comissionamento_n_opcoes: '3' }));
  const semValor = motivoDeRecusa(venda({ lead_id: L1, valor_venda: null, valor_posicao: null }));
  const boa = motivoDeRecusa(venda({ lead_id: L1 }));
  chk('N5', ambigua !== null && semValor !== null && boa === null,
      'R8 aliquota ambigua e R9 valor nulo sao recusa; linha completa passa');
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
  const r = await emA(() => executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })])));
  chk('N9', r.status === 'ok' && r.criados === 2 && r.lidos === 2,
      `ciclo espelha dois leads (criados=${r.criados}, status=${r.status})`);
}

// ====================================================== N10 IDEMPOTENCIA (R3)
{
  const antes = await sql(`SELECT count(*)::int n, max(criado_em)::text t FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
  const r = await emA(() => executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })])));
  const depois = await sql(`SELECT count(*)::int n, max(criado_em)::text t FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL`, A);
  chk('N10', r.criados === 0 && r.atualizados === 0 && antes[0].n === depois[0].n && antes[0].t === depois[0].t,
      `R3 segunda passada: 0 criados, 0 atualizados, nem timestamp mexeu (c=${r.criados} a=${r.atualizados})`);
}

// ====================================================== N11 view vazia (§7)
{
  const antesAtivos = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL AND ativo`, A);
  const r = await emA(() => executarCiclo(porta([])));
  const depoisAtivos = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id IS NOT NULL AND ativo`, A);
  chk('N11', r.status === 'erro' && r.desativados === 0 && antesAtivos[0].n === depoisAtivos[0].n,
      `§7 view vazia termina em erro e NAO desativa ninguem - e o caso que apagaria a carteira (${r.status})`);
}

// ====================================================== N12 recusa visivel (inv. 8)
{
  const r = await emA(() => executarCiclo(porta([
    venda({ lead_id: L1 }), venda({ lead_id: L2 }),
    venda({ lead_id: L3, comissionamento_n_opcoes: '2' }),
  ])));
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
  const r = await emA(() => executarCiclo(porta([
    venda({ lead_id: L1 }), venda({ lead_id: L2 }),
    venda({ lead_id: L3, funil: 'Parceiros', valor_venda: null, valor_posicao: null,
            comissionamento: '50%' }),
  ])));
  const cli = await sql(`SELECT count(*)::int n FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L3);
  chk('N14', r.recusados === 0 && cli[0].n === 0,
      `R14 card de Parceiros sem valor NAO e recusa e NAO vira cliente (rec=${r.recusados}, cli=${cli[0].n})`);
}

// ====================================================== N15 desativa, nao deleta (R6)
{
  const r = await emA(() => executarCiclo(porta(
    [venda({ lead_id: L1 })],
    [{ crm_tenant_id: CRM_TENANT, lead_id: L2, codigo: null, nome: null, telefone: null,
       removido_do_funil_em: new Date(), tags: null, mesclado: false,
       ultimo_funil: 'Vendas - Assinatura', ultima_etapa: null, ultima_entrada_etapa: null }],
  )));
  const l2 = await sql(`SELECT ativo FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L2);
  chk('N15', r.desativados === 1 && l2.length === 1 && l2[0].ativo === false,
      `R6 arquivado vira ativo=false e a LINHA CONTINUA (linhas=${l2.length})`);
}

// ====================================================== N16 reaparecer reativa
{
  await emA(() => executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })])));
  const l2 = await sql(`SELECT ativo FROM cliente WHERE tenant_id=$1::uuid AND crm_lead_id=$2::uuid`, A, L2);
  chk('N16', l2[0]?.ativo === true, '§4.3 desativacao e reversivel: o id voltou, ativo = true');
}

// ====================================================== N17 papel (matriz)
{
  const e = await lancou(() => emA(() => executarCiclo(porta([venda({ lead_id: L1 })])), ULEI));
  chk('N17', e !== null && /papel|permiss|administrar/i.test(String(e?.message ?? '')),
      `rodar ciclo exige 'administrar' - papel leitura e recusado (${e?.name ?? 'nao lancou'})`);
}

// ====================================================== N18 tenant divergente (R1-b)
{
  const errada: PortaDeLeitura = { ...porta([venda({ lead_id: L1 })]), crmTenantId: 'ffffffff-0000-4000-8000-00000000dead' };
  const e = await lancou(() => emA(() => executarCiclo(errada)));
  chk('N18', e !== null && /crm_tenant_id/.test(String(e?.message ?? '')),
      `regra 6 porta apontada para outro crm_tenant_id nao executa (${e?.name ?? 'nao lancou'})`);
}

// ====================================================== N19 garantia degradada visivel
{
  const r = await emA(() => executarCiclo(porta([venda({ lead_id: L1 }), venda({ lead_id: L2 })])));
  const linha = await sql(`SELECT detalhe FROM conector_execucao WHERE tenant_id=$1::uuid AND ciclo_id=$2::uuid`, A, r.cicloId);
  chk('N19', r.garantiaDeTenantDegradada === true
       && JSON.stringify(linha[0]?.detalhe ?? {}).includes('garantia_de_tenant_degradada'),
      'SPEC-002 R1-b nao cumprida fica REGISTRADA em conector_execucao, nao escondida');
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
