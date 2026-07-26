// SPEC-001 3.2 - o PONTO UNICO de emissao do contexto de tenant.
//
// Nenhum outro arquivo do sistema emite 'app.tenant_id'. Um lugar para errar,
// um lugar para testar. As invariantes 10 e 11 da SPEC-001 sao sobre este arquivo.
//
// CORRECAO DE DESENHO, 25/07/2026 - medido, nao suposto:
// a primeira versao da 3.2 descrevia um $extends POR OPERACAO, que abria uma
// transacao para cada chamada. Isso ISOLA corretamente mas DESTROI atomicidade:
// duas operacoes seguidas caem em txid diferentes, e uma escrita seguida de
// falha do handler PERSISTE. Para sistema financeiro isso desqualifica o desenho.
// O contexto e por UNIDADE DE TRABALHO, nao por operacao.

import { AsyncLocalStorage } from 'node:async_hooks';

/** Client de transacao do Prisma. Tipado como unknown-ish de proposito: este
 *  modulo nao conhece os modelos, so o ciclo de vida da transacao. */
export type ClientTx = {
  $queryRaw: (...a: any[]) => Promise<any>;
  [modelo: string]: any;
};

type Escopo = { tenantId: string; tx: ClientTx; tipo: 'transacional' | 'relatorio' };

const als = new AsyncLocalStorage<Escopo>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SemContextoDeTenant extends Error {
  constructor() {
    super(
      'Acesso a dado de negocio fora de withTenant(). O contexto de tenant nao ' +
      'existe, e sem ele toda leitura devolve ZERO sem erro. Envolva a unidade ' +
      'de trabalho em withTenant(tenantId, async () => { ... }).'
    );
    this.name = 'SemContextoDeTenant';
  }
}

export class ContextoAninhado extends Error {
  constructor(externo: string, interno: string) {
    super(
      `withTenant aninhado (${externo} -> ${interno}). Transacao aberta dentro de ` +
      'transacao toma conexao NOVA e nao herda o contexto: a leitura devolveria ' +
      'zero linhas sem erro. Invariante 10 da SPEC-001. Passe o escopo adiante ' +
      'em vez de reabrir.'
    );
    this.name = 'ContextoAninhado';
  }
}

/**
 * Emite o contexto. UNICO lugar do sistema que faz isso.
 *
 * Usa set_config(_, _, true) e nao "SET LOCAL": e semanticamente identico -
 * escopo de transacao - mas ACEITA PARAMETRO LIGADO. "SET LOCAL app.tenant_id =
 * '<valor>'" nao aceita, e obrigaria interpolar string no SQL. Com tenantId
 * vindo de requisicao, interpolar e superficie de injecao. Aqui nao existe.
 */
async function emitirContexto(tx: ClientTx, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

function validar(tenantId: string): void {
  if (!UUID.test(tenantId)) throw new TypeError(`tenantId nao e UUID: ${JSON.stringify(tenantId)}`);
}

/** O escopo corrente, ou erro. Nunca devolve undefined em silencio. */
export function db(): ClientTx {
  const e = als.getStore();
  if (!e) throw new SemContextoDeTenant();
  return e.tx;
}

export function tenantCorrente(): string {
  const e = als.getStore();
  if (!e) throw new SemContextoDeTenant();
  return e.tenantId;
}

export function dentroDeUnidadeDeTrabalho(): boolean {
  return als.getStore() !== undefined;
}

type Executor = {
  $transaction: (fn: (tx: any) => Promise<any>, opcoes?: any) => Promise<any>;
};

function fabricar(tipo: 'transacional' | 'relatorio', opcoesTx: object) {
  return async function withTenantEscopado<T>(
    executor: Executor,
    tenantId: string,
    trabalho: (tx: ClientTx) => Promise<T>,
  ): Promise<T> {
    validar(tenantId);
    const externo = als.getStore();
    if (externo) throw new ContextoAninhado(externo.tenantId, tenantId);

    return executor.$transaction(async (tx: ClientTx) => {
      await emitirContexto(tx, tenantId);
      return als.run({ tenantId, tx, tipo }, () => trabalho(tx));
    }, opcoesTx);
  };
}

/** Uma transacao por unidade de trabalho. Atomicidade preservada. */
export const withTenantEm = fabricar('transacional', { timeout: 15_000, maxWait: 5_000 });

/** Caminho proprio de relatorio: pool separado, timeout maior. SPEC-001 3.2. */
export const withTenantRelatorioEm = fabricar('relatorio', { timeout: 60_000, maxWait: 10_000 });

/**
 * Guarda contra uso acidental do client BASE. Aplicada ao client fora de
 * transacao, transforma "leu zero e ninguem percebeu" em excecao imediata.
 * E a metade defensiva da invariante 11.
 */
export function comGuarda<C extends { $extends: (ext: any) => any }>(base: C): C {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }: any) {
          if (!dentroDeUnidadeDeTrabalho()) throw new SemContextoDeTenant();
          // Dentro de unidade de trabalho, o codigo deve usar db(), nao o base.
          // Se chegou aqui, alguem pegou o client errado: falha alto.
          throw new Error(
            `${model}.${operation} chamado no client base dentro de withTenant. ` +
            'Use db() - o client de transacao - ou o contexto nao se aplica a esta query.'
          );
        },
      },
    },
  });
}
