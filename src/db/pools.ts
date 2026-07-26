// SPEC-001 3.2 + ADR-0004 - os DOIS pools.
//
// Por que dois: cada acesso a dado de negocio prende uma conexao fisica pelo
// bloco inteiro da transacao. Um relatorio lento num pool unico consome os
// slots e as requisicoes seguintes NAO entram em fila - falham com P2028 em
// maxWait. Nao e degradacao, e penhasco. Separar garante que relatorio lento
// nunca derrube o caminho transacional.

import pg from 'pg';

const n = (v: string | undefined, padrao: number) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : padrao;
};

/**
 * Tetos. Regra de ajuste, quando o max_connections da instancia for conhecido:
 *   POOL_TRANSACIONAL <= (max_connections - reservado_pelo_provedor - 5) / n_instancias
 * Acima de 8 nao compra nada nesta carga: com ~15 ms por transacao em rede real,
 * 8 slots sustentam ~530 transacoes/s. O gargalo nunca foi vazao.
 *
 * ATENCAO no deploy: se a instancia velha e a nova se sobrepoem no restart, o
 * total DOBRA por alguns segundos. Dimensione o max_connections para o pico.
 */
export const TETO_TRANSACIONAL = n(process.env.POOL_TRANSACIONAL, 8);
export const TETO_RELATORIO    = n(process.env.POOL_RELATORIO, 2);

/** SPEC-001 3.2: explicitos, nunca default. Os defaults do Prisma sao 5000/2000. */
export const TX_TRANSACIONAL = { timeout: 15_000, maxWait: 5_000 } as const;
export const TX_RELATORIO    = { timeout: 60_000, maxWait: 10_000 } as const;

export function criarPools(connectionString: string) {
  return {
    transacional: new pg.Pool({ connectionString, max: TETO_TRANSACIONAL, application_name: 'financeiro/tx' }),
    relatorio:    new pg.Pool({ connectionString, max: TETO_RELATORIO,    application_name: 'financeiro/relatorio' }),
  };
}
