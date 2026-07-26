// SPEC-001 R1, R1-b, R1-c, R2, R3 - a camada de sessao.
//
// E AQUI que os dois furos de 26/07 se materializam ou nao. O middleware recebe
// uma Identidade e confia nela; quem decide o que vai nessa Identidade e este
// arquivo. Se o tenantId da requisicao chegar ao middleware sem passar por aqui,
// as tres camadas de defesa viram uma.
//
// AS TRES CAMADAS, e nenhuma substitui as outras:
//   1. aqui       - o tenant proposto pelo cliente e aceito SO se estiver na
//                   lista que o login resolveu. Proposta, nunca ordem.
//   2. na policy  - tenant_id = current_tenant_id() AND tem_vinculo_no_tenant()
//                   (invariante 14). Pega handler que esqueceu de checar.
//   3. em exigir()- o papel do vinculo cobre a acao? (matriz do PRD 3)

import {
  withTenantEm, withTenantRelatorioEm, registrarAcessoDePlataforma,
  TenantNaoEncontrado, type Identidade, type Tier, type ClientTx,
} from '../db/contexto.ts';

export type VinculoDaSessao = { tenantId: string; razaoSocial: string; papel: string };

export type Sessao = {
  usuarioId: string;
  nome: string;
  email: string;
  tier: Tier;
  tenants: VinculoDaSessao[];
};

export class SemAcessoANenhumTenant extends Error {
  readonly status = 403;
  constructor(usuarioId: string) {
    super('Usuario autenticado, sem vinculo ativo em nenhum tenant.');
    this.name = 'SemAcessoANenhumTenant';
    (this as any).usuarioId = usuarioId;
  }
}

export class UsuarioNaoProvisionado extends Error {
  readonly status = 403;
  constructor() {
    // Autenticou no Supabase Auth mas nao existe linha em `usuario`, ou esta
    // inativo. Deliberadamente sem detalhe: nao confirma se o auth_user_id existe.
    super('Sem acesso.');
    this.name = 'UsuarioNaoProvisionado';
  }
}

type Executor = { $queryRaw: (...a: any[]) => Promise<any> } & Record<string, any>;

/**
 * R1-c - a UNICA chamada do sistema feita fora de contexto de tenant.
 *
 * Nao pode ser uma query em `usuario`: a policy daquela tabela exige
 * app.current_usuario_id(), que e justamente o que estamos descobrindo.
 * Medido em 26/07: a forma ingenua devolvia zero linhas, e o login era impossivel.
 */
export async function resolverLogin(executor: Executor, authUserId: string): Promise<Sessao> {
  const linhas: any[] = await executor.$queryRaw`
    SELECT usuario_id, nome, email, tier, tenant_id, tenant_razao_social, papel
    FROM app.resolver_login(${authUserId}::uuid)`;

  if (linhas.length === 0) throw new UsuarioNaoProvisionado();

  const p = linhas[0];
  const tenants: VinculoDaSessao[] = linhas
    .filter((l) => l.tenant_id != null && l.papel != null)
    .map((l) => ({ tenantId: l.tenant_id, razaoSocial: l.tenant_razao_social, papel: l.papel }));

  return {
    usuarioId: p.usuario_id,
    nome: p.nome,
    email: p.email,
    tier: (p.tier ?? null) as Tier,
    tenants,
  };
}

/**
 * CAMADA 1. O cliente PROPOE um tenant; aqui ele e conferido contra a lista que
 * o login resolveu. Nunca o inverso.
 *
 * - proposta ausente e um vinculo so  -> escolhe aquele
 * - proposta ausente e varios         -> obriga escolher (409), nao adivinha
 * - proposta fora da lista            -> 404, indistinguivel de tenant inexistente (R1)
 *
 * Tier de plataforma NAO ganha tenant por aqui (R3). Para isso existe a funcao
 * separada abaixo, que emite trilha e tem nome que diz o que faz.
 */
export function selecionarTenant(sessao: Sessao, tenantIdProposto?: string): VinculoDaSessao {
  if (sessao.tenants.length === 0) throw new SemAcessoANenhumTenant(sessao.usuarioId);

  if (tenantIdProposto == null) {
    if (sessao.tenants.length === 1) return sessao.tenants[0];
    const e: any = new Error('Mais de um tenant disponivel: informe qual.');
    e.status = 409; e.name = 'EscolhaDeTenantNecessaria';
    e.tenants = sessao.tenants.map((t) => ({ tenantId: t.tenantId, razaoSocial: t.razaoSocial }));
    throw e;
  }

  const escolhido = sessao.tenants.find((t) => t.tenantId === tenantIdProposto);
  if (!escolhido) throw new TenantNaoEncontrado();   // 404, nunca 403
  return escolhido;
}

/** Caminho normal. Uma transacao por unidade de trabalho, contexto do vinculo conferido. */
export function abrirUnidadeDeTrabalho<T>(
  executor: any, sessao: Sessao, tenantIdProposto: string | undefined,
  trabalho: (tx: ClientTx, vinculo: VinculoDaSessao) => Promise<T>,
): Promise<T> {
  const vinculo = selecionarTenant(sessao, tenantIdProposto);
  const identidade: Identidade = { tenantId: vinculo.tenantId, usuarioId: sessao.usuarioId, tier: null };
  //                                                                              ^ tier NULL de proposito:
  // no caminho normal a pessoa entra pelo VINCULO, nunca pelo tier. R3 - ser
  // plataforma nao da papel dentro do tenant.
  return withTenantEm(executor, identidade, (tx) => trabalho(tx, vinculo));
}

/** Relatorio: pool e timeout proprios, mesma conferencia de vinculo. */
export function abrirRelatorio<T>(
  executor: any, sessao: Sessao, tenantIdProposto: string | undefined,
  trabalho: (tx: ClientTx, vinculo: VinculoDaSessao) => Promise<T>,
): Promise<T> {
  const vinculo = selecionarTenant(sessao, tenantIdProposto);
  const identidade: Identidade = { tenantId: vinculo.tenantId, usuarioId: sessao.usuarioId, tier: null };
  return withTenantRelatorioEm(executor, identidade, (tx) => trabalho(tx, vinculo));
}

/**
 * R2 e R3 - o unico caminho que alcanca tenant SEM vinculo, e ele custa trilha.
 *
 * O nome e longo de proposito: quem chama isto esta atravessando a fronteira de
 * um cliente, e a chamada tem que parecer com o que e. A trilha e emitida ANTES
 * do trabalho, e para ESCRITA a constraint trigger da R2 aborta o commit se a
 * linha nao existir - o banco confere.
 *
 * LIMITE HONESTO: PostgreSQL nao tem trigger de SELECT. Para LEITURA a trilha e
 * garantida estruturalmente e nao pelo banco - por esta funcao ser o unico
 * caminho sem vinculo e emitir a linha antes de ceder o controle. Se alguem
 * montar um segundo caminho, a garantia cai. Invariante 15 existe para isso.
 */
export async function abrirComoPlataforma<T>(
  executor: any, sessao: Sessao, tenantId: string,
  acao: string, recurso: string,
  trabalho: (tx: ClientTx) => Promise<T>,
): Promise<T> {
  if (!sessao.tier) {
    const e: any = new Error('Requer tier de plataforma.');
    e.status = 403; e.name = 'RequerTierDePlataforma';
    throw e;
  }
  const identidade: Identidade = { tenantId, usuarioId: sessao.usuarioId, tier: sessao.tier };
  return withTenantEm(executor, identidade, async (tx) => {
    await registrarAcessoDePlataforma(acao, recurso);   // antes do trabalho, sempre
    return trabalho(tx);
  });
}
