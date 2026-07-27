// As rotas. Uma tabela, nao um framework.
//
// ONDE A MATRIZ DE PAPEIS E APLICADA: no REPOSITORIO, por exigir(), e nao aqui.
// A decisao e do contexto.ts e esta escrita la: "um repositorio chamavel sem
// checagem e o furo". Consequencia pratica para este arquivo: um handler novo
// que esqueca de checar papel NAO abre buraco, porque a checagem nao mora nele.
// O que este arquivo faz e escolher a unidade de trabalho certa - transacional
// ou de relatorio - e traduzir corpo de requisicao em argumento de repositorio.
//
// ATENCAO, DIVERGENCIA REGISTRADA: a matriz implementada em contexto.ts da
// escrita de cadastro a `financeiro`, e o PRD-v2.2 3 da a esse papel apenas
// leitura em Cadastros. A divergencia esta em QUESTOES.md como Q-RBAC-01 e NAO
// foi resolvida aqui - alterar a matriz e decisao normativa, nao de implementacao.

import type { App, Sessao, VinculoDaSessao, ClientTx } from '../app.ts';
import * as cliente from '../repos/cliente.ts';
import * as uc from '../repos/unidade_consumidora.ts';
import * as usina from '../repos/usina.ts';
import * as originador from '../repos/originador.ts';
import * as rateio from '../repos/rateio.ts';
import * as contrato from '../repos/contrato.ts';

export type Requisicao = {
  metodo: string;
  caminho: string;
  params: Record<string, string>;
  query: URLSearchParams;
  corpo: any;
  sessao: Sessao;
  /** Vem do header x-tenant-id. PROPOSTA: selecionarTenant() confere contra os
   *  vinculos que o login resolveu, e 404 se nao estiver la (R1). */
  tenantProposto: string | undefined;
};

export type Resultado = { status: number; corpo?: unknown };

type Handler = (req: Requisicao, app: App) => Promise<Resultado>;

export type Rota = { metodo: string; padrao: string; handler: Handler };

const ok = (corpo: unknown): Resultado => ({ status: 200, corpo });
const criado = (corpo: unknown): Resultado => ({ status: 201, corpo });
const semConteudo = (): Resultado => ({ status: 204 });

/** JSON nao tem data. Converte, e recusa string que nao e data - passar
 *  "Invalid Date" adiante viraria NULL no banco sem ninguem perceber. */
function data(v: unknown, campo: string): Date {
  if (typeof v !== 'string' && !(v instanceof Date)) {
    throw new TypeError(`${campo} e obrigatorio e deve ser data ISO`);
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new TypeError(`${campo} nao e data valida: ${JSON.stringify(v)}`);
  return d;
}

function dataOuNull(v: unknown, campo: string): Date | null {
  if (v == null || v === '') return null;
  return data(v, campo);
}

/** Unidade de trabalho transacional. Uma transacao por requisicao. */
const emTenant = (app: App, req: Requisicao, f: (tx: ClientTx, v: VinculoDaSessao) => Promise<Resultado>) =>
  app.withTenant(req.sessao, req.tenantProposto, f);

/** Caminho de relatorio: pool e timeout proprios. Leitura pesada nao disputa
 *  slot com o caminho transacional - o motivo esta em src/db/pools.ts. */
const emRelatorio = (app: App, req: Requisicao, f: (tx: ClientTx, v: VinculoDaSessao) => Promise<Resultado>) =>
  app.withRelatorio(req.sessao, req.tenantProposto, f);

const limite = (q: URLSearchParams) => {
  const v = q.get('limite');
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new TypeError(`limite deve ser inteiro positivo, recebeu ${v}`);
  return n;
};

export const ROTAS: Rota[] = [
  // ------------------------------------------------------------------ sessao
  {
    metodo: 'GET', padrao: '/sessao',
    // Fora de contexto de tenant de proposito: e a R1-c. A lista de tenants e o
    // que o cliente usa para escolher, e ela ja veio resolvida no login.
    handler: async (req) => ok({
      usuarioId: req.sessao.usuarioId, nome: req.sessao.nome, email: req.sessao.email,
      tier: req.sessao.tier,
      tenants: req.sessao.tenants.map((t) => ({ tenantId: t.tenantId, razaoSocial: t.razaoSocial, papel: t.papel })),
    }),
  },

  // ----------------------------------------------------------------- clientes
  {
    metodo: 'GET', padrao: '/clientes',
    handler: (req, app) => emTenant(app, req, async () => ok(await cliente.listar({
      ativo: req.query.has('ativo') ? req.query.get('ativo') === 'true' : undefined,
      limite: limite(req.query),
    }))),
  },
  {
    metodo: 'POST', padrao: '/clientes',
    handler: (req, app) => emTenant(app, req, async () => criado(await cliente.criar(req.corpo))),
  },
  {
    metodo: 'GET', padrao: '/clientes/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const c = await cliente.porId(req.params.id);
      return c ? ok(c) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Cliente nao encontrado.' } };
    }),
  },
  {
    metodo: 'PATCH', padrao: '/clientes/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      await cliente.editar(req.params.id, req.corpo);
      return ok(await cliente.porId(req.params.id));
    }),
  },
  {
    metodo: 'DELETE', padrao: '/clientes/:id',
    // Baixa logica. DELETE no verbo, UPDATE no banco: contrato e UC apontam para ca.
    handler: (req, app) => emTenant(app, req, async () => {
      await cliente.desativar(req.params.id);
      return semConteudo();
    }),
  },

  // ------------------------------------------------------ unidades consumidoras
  {
    metodo: 'GET', padrao: '/unidades-consumidoras',
    handler: (req, app) => emTenant(app, req, async () => {
      const cli = req.query.get('cliente_id');
      if (cli) return ok(await uc.listarDoCliente(cli));
      return ok(await uc.listar({ status: (req.query.get('status') as any) ?? undefined, limite: limite(req.query) }));
    }),
  },
  {
    metodo: 'POST', padrao: '/unidades-consumidoras',
    handler: (req, app) => emTenant(app, req, async () => criado(await uc.criar({
      ...req.corpo, data_vencimento: dataOuNull(req.corpo?.data_vencimento, 'data_vencimento'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/unidades-consumidoras/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const u = await uc.porId(req.params.id);
      return u ? ok(u) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Unidade consumidora nao encontrada.' } };
    }),
  },
  {
    metodo: 'PATCH', padrao: '/unidades-consumidoras/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const corpo = { ...req.corpo };
      if ('data_vencimento' in corpo) corpo.data_vencimento = dataOuNull(corpo.data_vencimento, 'data_vencimento');
      await uc.editar(req.params.id, corpo);
      return ok(await uc.porId(req.params.id));
    }),
  },
  {
    metodo: 'POST', padrao: '/unidades-consumidoras/:id/suspender',
    handler: (req, app) => emTenant(app, req, async () => { await uc.suspender(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'POST', padrao: '/unidades-consumidoras/:id/reativar',
    handler: (req, app) => emTenant(app, req, async () => { await uc.reativar(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'POST', padrao: '/unidades-consumidoras/:id/cancelar',
    handler: (req, app) => emTenant(app, req, async () => { await uc.cancelar(req.params.id); return semConteudo(); }),
  },

  // -------------------------------------------------------------------- rateio
  {
    metodo: 'PUT', padrao: '/unidades-consumidoras/:id/rateio',
    // PUT e nao PATCH: define o vinculo inteiro (usina + percentual). Os dois
    // campos andam juntos - percentual orfao sumiria da conta do teto.
    handler: (req, app) => emTenant(app, req, async () => ok(await rateio.definirRateio({
      unidade_consumidora_id: req.params.id,
      usina_id: req.corpo?.usina_id,
      percentual_rateio: req.corpo?.percentual_rateio,
    }))),
  },
  {
    metodo: 'DELETE', padrao: '/unidades-consumidoras/:id/rateio',
    handler: (req, app) => emTenant(app, req, async () => {
      await rateio.removerDoRateio(req.params.id);
      return semConteudo();
    }),
  },
  {
    metodo: 'GET', padrao: '/usinas/:id/rateio',
    handler: (req, app) => emTenant(app, req, async () => {
      const s = await rateio.situacaoDaUsina(req.params.id);
      return s ? ok(s) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Usina nao encontrada.' } };
    }),
  },
  {
    metodo: 'GET', padrao: '/rateio',
    // Varredura de todas as usinas: caminho de RELATORIO, pool separado.
    handler: (req, app) => emRelatorio(app, req, async () => ok(await rateio.situacaoDeTodas())),
  },

  // -------------------------------------------------------------------- usinas
  {
    metodo: 'GET', padrao: '/usinas',
    handler: (req, app) => emTenant(app, req, async () => ok(await usina.listar({
      status: (req.query.get('status') as any) ?? undefined, limite: limite(req.query),
    }))),
  },
  {
    metodo: 'POST', padrao: '/usinas',
    handler: (req, app) => emTenant(app, req, async () => criado(await usina.criar({
      ...req.corpo, data_homologacao: dataOuNull(req.corpo?.data_homologacao, 'data_homologacao'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/usinas/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const g = await usina.porId(req.params.id);
      return g ? ok(g) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Usina nao encontrada.' } };
    }),
  },
  {
    metodo: 'PATCH', padrao: '/usinas/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const corpo = { ...req.corpo };
      if ('data_homologacao' in corpo) corpo.data_homologacao = dataOuNull(corpo.data_homologacao, 'data_homologacao');
      await usina.editar(req.params.id, corpo);
      return ok(await usina.porId(req.params.id));
    }),
  },
  {
    metodo: 'POST', padrao: '/usinas/:id/suspender',
    handler: (req, app) => emTenant(app, req, async () => { await usina.suspender(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'POST', padrao: '/usinas/:id/encerrar',
    handler: (req, app) => emTenant(app, req, async () => { await usina.encerrar(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'PUT', padrao: '/usinas/:id/geracao',
    // PUT: a competencia identifica a linha e o registro e idempotente. POST
    // criaria a expectativa de duplicar, e o unique cheio recusaria.
    handler: (req, app) => emTenant(app, req, async () => ok(await usina.registrarGeracao({
      usina_id: req.params.id,
      competencia: data(req.corpo?.competencia, 'competencia'),
      geracao_kwh: req.corpo?.geracao_kwh,
      origem: req.corpo?.origem,
    }))),
  },
  {
    metodo: 'GET', padrao: '/usinas/:id/geracao',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await usina.historicoDeGeracao(req.params.id, limite(req.query) ?? 24))),
  },

  // -------------------------------------------------------------- originadores
  {
    metodo: 'GET', padrao: '/originadores',
    handler: (req, app) => emTenant(app, req, async () => ok(await originador.listar({
      ativo: req.query.has('ativo') ? req.query.get('ativo') === 'true' : undefined,
      tipo: (req.query.get('tipo') as any) ?? undefined,
      limite: limite(req.query),
    }))),
  },
  {
    metodo: 'POST', padrao: '/originadores',
    handler: (req, app) => emTenant(app, req, async () => criado(await originador.criar(req.corpo))),
  },
  {
    metodo: 'GET', padrao: '/originadores/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const o = await originador.porId(req.params.id);
      return o ? ok(o) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Originador nao encontrado.' } };
    }),
  },
  {
    metodo: 'PATCH', padrao: '/originadores/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      await originador.editar(req.params.id, req.corpo);
      return ok(await originador.porId(req.params.id));
    }),
  },
  {
    metodo: 'DELETE', padrao: '/originadores/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      await originador.desativar(req.params.id);
      return semConteudo();
    }),
  },

  // ----------------------------------------------------------------- contratos
  {
    metodo: 'POST', padrao: '/contratos',
    handler: (req, app) => emTenant(app, req, async () => criado(await contrato.rascunhar({
      ...req.corpo, data_fechamento: data(req.corpo?.data_fechamento, 'data_fechamento'),
    }))),
  },
  {
    metodo: 'POST', padrao: '/contratos/:id/ativar',
    handler: (req, app) => emTenant(app, req, async () => { await contrato.ativar(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'POST', padrao: '/contratos/:id/suspender',
    handler: (req, app) => emTenant(app, req, async () => { await contrato.suspender(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'POST', padrao: '/contratos/:id/encerrar',
    handler: (req, app) => emTenant(app, req, async () => { await contrato.encerrar(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'GET', padrao: '/unidades-consumidoras/:id/contratos',
    handler: (req, app) => emTenant(app, req, async () => ok(await contrato.historicoDaUC(req.params.id))),
  },
  {
    metodo: 'GET', padrao: '/unidades-consumidoras/:id/contrato-vigente',
    handler: (req, app) => emTenant(app, req, async () => {
      const c = await contrato.vigenteDaUC(req.params.id);
      return c ? ok(c) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'A UC nao tem contrato vigente.' } };
    }),
  },
  {
    metodo: 'POST', padrao: '/unidades-consumidoras/:id/renovar-contrato',
    // Encerra o vigente e assina o novo na MESMA transacao. A ordem esta em
    // contrato.renovar() e e requisito medido, nao estilo.
    handler: (req, app) => emTenant(app, req, async () => criado(await contrato.renovar({
      ...req.corpo,
      unidade_consumidora_id: req.params.id,
      data_fechamento: data(req.corpo?.data_fechamento, 'data_fechamento'),
    }))),
  },
];
