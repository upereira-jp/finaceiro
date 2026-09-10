// DESTRAVAR A UC QUE O CONECTOR RECUSA, pela tela — `Q-UCMUDOU-01`.
//
// ============================================================================
// O QUE ESTE ARQUIVO FAZ, E E UMA COISA SO
//
//   apaga `unidade_consumidora.crm_usina_cliente_id` de UMA UC nomeada.
//
// Nao escreve o vinculo novo. Nao mexe em `cliente_id`, `usina_id` nem
// `percentual_rateio`. Quem escreve campo espelhado e o conector (SPEC-002 R6),
// e isto existe para DESTRAVA-LO, nao para substitui-lo. E o mesmo desenho do
// `scripts/destravar-uc.ts`, que continua valendo e continua no lugar: o que
// mudou e que agora existe um caminho de TELA.
//
// ============================================================================
// POR QUE ISTO DEIXOU DE SER "EXCECAO RARA" EM 10/09/2026
//
// O `PLANO-sem-desenvolvedor` classificou o destrave como "excecao rara; so
// quando o resto estiver fechado". A medicao do journal desmentiu a raridade:
//
//     000091762801211: contrato de rateio d7d1758d-… ja esta vinculado a UC
//     000000100076075 e agora aponta para 000091762801211.
//
// **519 recusas, uma a cada 15 minutos, desde 04/09/2026 as 18h.** Seis dias com
// uma UC fora do espelho — e o que fica fora do espelho fica fora do
// faturamento. Enquanto a saida morar em `npm run destravar-uc`, "o sistema roda
// sozinho" e falso por essa UC, e ninguem sabe por quanto tempo.
//
// ============================================================================
// ⚠️ AS TRES PECAS SAO SEPARADAS POR CAUSA DA TRANSACAO, e a licao e de 14/08
//
// `rotas.ts` carrega o motivo por escrito: `emTenant` abre transacao Postgres com
// timeout de 15 s, e segurar uma conexao do pool transacional esperando um
// TERCEIRO e a definicao de transacao longa - com oito slots, oito esperas param
// o faturamento inteiro. Foi assim que a leitura paga da fatura saiu de dentro
// da transacao naquele dia.
//
// A leitura do CRM e exatamente isso: outro banco, outra rede, latencia que nao
// e nossa. Entao:
//
//   `lerEspelho`      dentro do contexto de leitura (curto)
//   `lerNoCrm`        FORA de qualquer transacao nossa
//   `apagarPonteiro`  dentro do contexto de escrita (curto, uma coluna)
//
// Quem costura as tres e a rota, do mesmo jeito que `comPermissaoDeLer` costura
// a permissao e a chamada paga.
//
// ============================================================================
// AS QUATRO GUARDAS SAO AS MESMAS, e elas nao moram aqui
//
// `src/dominio/destrave-uc.ts` decide, puro, com suite propria
// (`tests/destrave-uc.ts`). Este arquivo faz as leituras e obedece. A razao de a
// decisao ser separada esta escrita la: um UPDATE cego apagaria um vinculo BOM
// por digitacao errada de UC, e o sintoma so apareceria no ciclo seguinte, longe
// da causa.

import { dbt } from '../db/tipado.ts';
import { exigir } from '../db/contexto.ts';
import { poolDoCrm } from '../crm/pool-de-leitura.ts';
import { decidirDestrave, type DecisaoDoDestrave, type LinhaDoRateio } from '../dominio/destrave-uc.ts';

export class UcNaoEncontrada extends Error {
  readonly status = 404;
  constructor() { super('Unidade consumidora nao encontrada.'); this.name = 'UcNaoEncontrada'; }
}

export class SemConectorDoCrm extends Error {
  readonly status = 412;
  constructor() {
    super(
      'Este tenant nao tem conector com o outro sistema. Sem ele nao ha o que comparar: o ' +
      'vinculo que se quer destravar e justamente o que o conector escreveu.'
    );
    this.name = 'SemConectorDoCrm';
  }
}

export class DestraveRecusado extends Error {
  readonly status = 409;
  readonly guarda: number;
  constructor(guarda: number, motivo: string) {
    super(motivo);
    this.name = 'DestraveRecusado';
    this.guarda = guarda;
  }
}

/** O nosso lado, e so o que a decisao usa. */
export type EspelhoDaUc = {
  id: string;
  numero_uc: string;
  cliente: string;
  contrato_no_espelho: string | null;
  /** Regra 6: identificador do sistema externo NUNCA se chama `tenant_id`. */
  crm_tenant_id: string;
};

/** O outro lado, lido pelas views (regra 4: nunca tabela base). */
export type LadosDoCrm = {
  por_contrato: LinhaDoRateio | null;
  por_uc: LinhaDoRateio | null;
  uc_presa_ao_substituto: string | null;
};

/** O que a tela mostra ANTES de qualquer escrita. */
export type ConferenciaDoVinculo = EspelhoDaUc & LadosDoCrm & { decisao: DecisaoDoDestrave };

/** DENTRO do contexto de leitura. Curto: duas linhas do nosso banco. */
export async function lerEspelho(ucId: string): Promise<EspelhoDaUc> {
  await exigir('ler');
  const db = dbt();

  const uc = await db.unidade_consumidora.findFirst({
    where: { id: ucId },
    select: {
      id: true, numero_uc: true, crm_usina_cliente_id: true,
      cliente: { select: { nome: true } },
    },
  });
  if (!uc) throw new UcNaoEncontrada();

  const conector = await db.conector_crm.findFirst({ select: { crm_tenant_id: true } });
  if (!conector) throw new SemConectorDoCrm();

  return {
    id: uc.id,
    numero_uc: uc.numero_uc,
    cliente: uc.cliente.nome,
    contrato_no_espelho: uc.crm_usina_cliente_id ?? null,
    crm_tenant_id: conector.crm_tenant_id,
  };
}

/**
 * A terceira leitura do outro lado — «este contrato substituto ja esta preso a
 * outra UC nossa?» — e ela e do NOSSO banco, apesar de responder sobre o outro.
 *
 * Fica separada de `lerEspelho` porque depende do que o CRM respondeu: sem saber
 * qual e o contrato substituto, nao ha o que procurar. Duas idas curtas ao nosso
 * banco custam menos que uma ida longa segurando slot enquanto o CRM responde.
 */
export async function lerUcPresaAo(contratoId: string): Promise<string | null> {
  await exigir('ler');
  const presa = await dbt().unidade_consumidora.findFirst({
    where: { crm_usina_cliente_id: contratoId },
    select: { numero_uc: true },
  });
  return presa?.numero_uc ?? null;
}

/**
 * FORA DE QUALQUER TRANSACAO NOSSA. Duas leituras nas views do CRM.
 *
 * ⚠️ TODO SELECT FILTRA `crm_tenant_id` (regra 6). Sem ele, um contrato de outra
 * empresa do CRM responderia por esta UC — e o efeito nao seria erro, seria
 * decisao errada com cara de certa.
 */
export async function lerNoCrm(
  crmTenantId: string, numeroUc: string, contratoNoEspelho: string | null,
): Promise<{ por_contrato: LinhaDoRateio | null; por_uc: LinhaDoRateio | null }> {
  const pool = await poolDoCrm();
  const q = async (sql: string, params: unknown[]): Promise<LinhaDoRateio[]> =>
    (await pool.query(sql, params)).rows as LinhaDoRateio[];

  const [porContrato] = contratoNoEspelho
    ? await q(`select uc, contrato_id, lead_codigo, cliente from financeiro.rateio_clientes
                where crm_tenant_id = $1 and contrato_id = $2`,
              [crmTenantId, contratoNoEspelho])
    : [];
  const [porUc] = await q(
    `select uc, contrato_id, lead_codigo, cliente from financeiro.rateio_clientes
      where crm_tenant_id = $1 and uc = $2`, [crmTenantId, numeroUc]);

  return { por_contrato: porContrato ?? null, por_uc: porUc ?? null };
}

/** A decisao pura, montada com o que as tres leituras trouxeram. */
export function montarConferencia(espelho: EspelhoDaUc, lados: LadosDoCrm): ConferenciaDoVinculo {
  return {
    ...espelho,
    ...lados,
    decisao: decidirDestrave({
      numeroUc: espelho.numero_uc,
      contratoNoEspelho: espelho.contrato_no_espelho,
      crmPorContrato: lados.por_contrato,
      crmPorUc: lados.por_uc,
      ucPresaAoSubstituto: lados.uc_presa_ao_substituto,
    }),
  };
}

/**
 * A ESCRITA: UMA coluna, para NULL. DENTRO do contexto de escrita, e curta.
 *
 * ⚠️ ELA RECEBE A DECISAO E CONFERE DE NOVO. Nao por desconfianca de quem chamou,
 * mas porque a decisao e um valor e um valor viaja: aceitar `pode: true` sem
 * olhar seria deixar o estado do mundo ser afirmado por um objeto. A guarda aqui
 * e barata (um `if`) e fecha o caminho em que alguem, um dia, chame isto de
 * outro lugar.
 *
 * O QUE ACONTECE DEPOIS NAO E ESCRITO AQUI: o proximo ciclo (ate 15 minutos)
 * atualiza esta UC com o contrato substituto e CRIA a UC que o contrato antigo
 * passou a servir, pelo caminho normal, com contagem e trilha. A recusa da R23
 * desaparece porque o empate deixou de existir.
 *
 * A auditoria da invariante 17 grava sozinha: a escrita acontece dentro do
 * contexto de tenant, como qualquer requisicao, e o gatilho carimba
 * quem/quando/antes/depois.
 */
export async function apagarPonteiro(ucId: string, decisao: DecisaoDoDestrave): Promise<void> {
  if (!decisao.pode) throw new DestraveRecusado(decisao.guarda, decisao.motivo);
  await exigir('escrever_cadastro');
  await dbt().unidade_consumidora.updateMany({
    where: { id: ucId },
    data: { crm_usina_cliente_id: null },
  });
}
