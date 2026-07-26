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

/** Tier de plataforma. NULL para usuario comum de tenant. SPEC-001 R2 e R3. */
export type Tier = 'plataforma_admin' | 'plataforma_suporte' | null;

export type Identidade = { tenantId: string; usuarioId: string; tier?: Tier };

type Escopo = Identidade & { tx: ClientTx; tipo: 'transacional' | 'relatorio' };

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
async function emitirContexto(tx: ClientTx, id: Identidade): Promise<void> {
  await tx.$queryRaw`
    SELECT set_config('app.tenant_id',  ${id.tenantId},      true),
           set_config('app.usuario_id', ${id.usuarioId},     true),
           set_config('app.tier',       ${id.tier ?? ''},    true)`;
}

function validar(id: Identidade): void {
  if (!UUID.test(id.tenantId))  throw new TypeError(`tenantId nao e UUID: ${JSON.stringify(id.tenantId)}`);
  if (!UUID.test(id.usuarioId)) throw new TypeError(`usuarioId nao e UUID: ${JSON.stringify(id.usuarioId)}`);
  if (id.tier != null && id.tier !== 'plataforma_admin' && id.tier !== 'plataforma_suporte') {
    throw new TypeError(`tier invalido: ${JSON.stringify(id.tier)}`);
  }
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

export function usuarioCorrente(): string {
  const e = als.getStore();
  if (!e) throw new SemContextoDeTenant();
  return e.usuarioId;
}

export function tierCorrente(): Tier {
  const e = als.getStore();
  if (!e) throw new SemContextoDeTenant();
  return e.tier ?? null;
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
    identidade: Identidade,
    trabalho: (tx: ClientTx) => Promise<T>,
  ): Promise<T> {
    validar(identidade);
    const externo = als.getStore();
    if (externo) throw new ContextoAninhado(externo.tenantId, identidade.tenantId);

    return executor.$transaction(async (tx: ClientTx) => {
      await emitirContexto(tx, identidade);
      return als.run({ ...identidade, tx, tipo }, () => trabalho(tx));
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

/**
 * SPEC-001 R2 - registra a passagem de tier de plataforma por dado de tenant.
 *
 * Chame ANTES de ler. Nao e educacao: a constraint trigger
 * app.exigir_trilha_de_plataforma() confere no COMMIT e ABORTA a transacao se a
 * linha nao existir. A trilha nao depende de alguem lembrar - depende do banco.
 */
export async function registrarAcessoDePlataforma(acao: string, recurso: string): Promise<void> {
  const e = als.getStore();
  if (!e) throw new SemContextoDeTenant();
  if (!e.tier) return;   // usuario de tenant nao gera trilha de plataforma
  await e.tx.$queryRaw`
    INSERT INTO acesso_plataforma_log (id, tenant_id, usuario_id, acao, recurso)
    VALUES (gen_random_uuid(), ${e.tenantId}::uuid, ${e.usuarioId}::uuid, ${acao}, ${recurso})`;
}

/** SPEC-001 R1 - ausencia de vinculo e indistinguivel de tenant inexistente. */
export class TenantNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super('Tenant nao encontrado.');   // deliberadamente sem detalhe: 404, nunca 403
    this.name = 'TenantNaoEncontrado';
  }
}

/**
 * R1 + R3. Confere o vinculo DENTRO do contexto, que e o unico lugar onde a
 * pergunta faz sentido: sem vinculo, a RLS de usuario_tenant devolve zero, e
 * zero e indistinguivel de tenant inexistente. A regra sai da RLS, nao de um if.
 *
 * R3: tier de plataforma NAO ganha papel por ser plataforma. Precisa de vinculo
 * explicito, e a passagem fica na trilha.
 */
export async function papelNoTenantCorrente(): Promise<string> {
  const tx = db();
  const r: any = await tx.$queryRaw`
    SELECT papel FROM usuario_tenant
    WHERE usuario_id = app.current_usuario_id()
      AND tenant_id  = app.current_tenant_id()
      AND ativo
    LIMIT 1`;
  if (!r?.[0]?.papel) throw new TenantNaoEncontrado();
  return r[0].papel as string;
}

const PODE: Record<string, ReadonlySet<string>> = {
  ler:              new Set(['admin', 'financeiro', 'cobranca', 'leitura']),
  escrever_cadastro:new Set(['admin', 'financeiro']),
  escrever_carteira:new Set(['admin', 'cobranca']),
  administrar:      new Set(['admin']),
};

/** Matriz do PRD 3. Lanca se o papel do vinculo nao cobre a acao. */
export async function exigir(acao: keyof typeof PODE): Promise<string> {
  const papel = await papelNoTenantCorrente();
  if (!PODE[acao].has(papel)) {
    const e: any = new Error(`Papel "${papel}" nao pode "${acao}".`);
    e.status = 403; e.name = 'PapelInsuficiente';
    throw e;
  }
  return papel;
}
