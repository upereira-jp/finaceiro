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
import * as donoUsina from '../repos/dono_usina.ts';
import * as regras from '../repos/regras.ts';
import * as fatura from '../repos/fatura.ts';
import * as boleto from '../repos/boleto.ts';
import * as liquidacao from '../repos/liquidacao.ts';
import * as split from '../repos/split.ts';

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

  // ------------------------------------------------------------ donos de usina
  // Para quem vai o repasse. Entra agora porque a R12 - "dono nulo bloqueia a
  // execucao de repasse" - deixou de ser hipotetica quando o split passou a
  // existir. AUD-08: nulo em 3 de 3 usinas em 28/07.
  {
    metodo: 'GET', padrao: '/donos-usina',
    handler: (req, app) => emTenant(app, req, async () => ok(await donoUsina.listar({
      ativo: req.query.get('ativo') == null ? undefined : req.query.get('ativo') === 'true',
      limite: limite(req.query),
    }))),
  },
  {
    metodo: 'POST', padrao: '/donos-usina',
    handler: (req, app) => emTenant(app, req, async () => criado(await donoUsina.criar(req.corpo))),
  },
  {
    metodo: 'GET', padrao: '/donos-usina/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const d = await donoUsina.porId(req.params.id);
      return d ? ok(d) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Dono de usina nao encontrado.' } };
    }),
  },
  {
    metodo: 'PATCH', padrao: '/donos-usina/:id',
    handler: (req, app) => emTenant(app, req, async () => ok(await donoUsina.editar(req.params.id, req.corpo))),
  },
  {
    metodo: 'DELETE', padrao: '/donos-usina/:id',
    handler: (req, app) => emTenant(app, req, async () => { await donoUsina.desativar(req.params.id); return semConteudo(); }),
  },
  {
    metodo: 'GET', padrao: '/usinas-sem-dono',
    handler: (req, app) => emTenant(app, req, async () => ok(await donoUsina.usinasSemDono())),
  },

  // -------------------------------------------------------- valores com data
  // As tres tabelas versionadas. NAO ha rota de edicao, e a ausencia e o
  // desenho: o PRD 4.6 manda "nunca editada no lugar". A unica escrita e abrir
  // vigencia nova, que fecha a anterior na mesma transacao.
  {
    metodo: 'GET', padrao: '/tarifas/:distribuidora',
    handler: (req, app) => emTenant(app, req, async () => ok(await regras.tarifasDe(req.params.distribuidora))),
  },
  {
    metodo: 'POST', padrao: '/tarifas',
    handler: (req, app) => emTenant(app, req, async () => criado(await regras.abrirVigenciaDeTarifa({
      ...req.corpo, vigencia_inicio: data(req.corpo?.vigencia_inicio, 'vigencia_inicio'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/regras-comissao/:tipo',
    handler: (req, app) => emTenant(app, req, async () => ok(await regras.comissoesDe(req.params.tipo as any))),
  },
  {
    metodo: 'POST', padrao: '/regras-comissao',
    handler: (req, app) => emTenant(app, req, async () => criado(await regras.abrirVigenciaDeComissao({
      ...req.corpo, vigencia_inicio: data(req.corpo?.vigencia_inicio, 'vigencia_inicio'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/usinas/:id/repasse',
    handler: (req, app) => emTenant(app, req, async () => ok(await regras.repassesDa(req.params.id))),
  },
  {
    metodo: 'POST', padrao: '/usinas/:id/repasse',
    handler: (req, app) => emTenant(app, req, async () => criado(await regras.abrirVigenciaDeRepasse({
      usina_id: req.params.id,
      percentual: req.corpo?.percentual,
      vigencia_inicio: data(req.corpo?.vigencia_inicio, 'vigencia_inicio'),
    }))),
  },

  // ------------------------------------------------------------- faturamento
  /*
   * ENSAIO E VALENDO SAO ROTAS DIFERENTES, e nao um parametro booleano.
   *
   * O precedente e o `npm run ciclo`, que exige `--ensaio` ou `--valendo` sem
   * default: um lote de faturamento toca a carteira inteira, e um flag com
   * default errado emite cobranca para 35 clientes. Caminhos separados nao tem
   * default para errar.
   */
  {
    metodo: 'POST', padrao: '/faturamento/:competencia/ensaio',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.ensaiarLote(req.params.competencia))),
  },
  {
    metodo: 'POST', padrao: '/faturamento/:competencia/compor',
    handler: (req, app) => emTenant(app, req, async () => criado(await fatura.comporLote(req.params.competencia, {
      tarifas_concessionaria_centavos: req.corpo?.tarifas_concessionaria_centavos,
    }))),
  },
  {
    metodo: 'POST', padrao: '/faturamento/:competencia/emitir',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.emitirLote(req.params.competencia))),
  },
  {
    metodo: 'GET', padrao: '/faturamento/:competencia',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.daCompetencia(req.params.competencia, {
      limite: limite(req.query),
    }))),
  },
  {
    // Varredura da carteira inteira: caminho de RELATORIO, pool e timeout
    // proprios. Leitura pesada nao disputa slot com a emissao.
    metodo: 'GET', padrao: '/carteira',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await fatura.posicao(req.query.get('competencia') ?? undefined))),
  },
  {
    metodo: 'GET', padrao: '/carteira/uso-das-usinas',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await fatura.usoDasUsinas(req.query.get('competencia') ?? undefined))),
  },
  {
    metodo: 'POST', padrao: '/carteira/marcar-vencidas',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.marcarVencidas())),
  },

  // ----------------------------------------------------------------- faturas
  {
    metodo: 'GET', padrao: '/faturas/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const f = await fatura.porId(req.params.id);
      return f ? ok(f) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Fatura nao encontrada.' } };
    }),
  },
  {
    metodo: 'POST', padrao: '/faturas/:id/emitir',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.emitir(req.params.id))),
  },
  {
    metodo: 'PUT', padrao: '/faturas/:id/tarifas-concessionaria',
    handler: (req, app) => emTenant(app, req, async () => {
      await fatura.lancarTarifasDaConcessionaria(req.params.id, req.corpo?.valor_centavos);
      return semConteudo();
    }),
  },
  {
    metodo: 'POST', padrao: '/faturas/:id/cancelar',
    handler: (req, app) => emTenant(app, req, async () => {
      await fatura.cancelar(req.params.id, req.corpo?.motivo);
      return semConteudo();
    }),
  },
  {
    metodo: 'GET', padrao: '/unidades-consumidoras/:id/faturas',
    handler: (req, app) => emTenant(app, req, async () => ok(await fatura.daUnidadeConsumidora(req.params.id, limite(req.query)))),
  },

  // ----------------------------------------------------------------- boletos
  {
    metodo: 'POST', padrao: '/conector-cobranca',
    handler: (req, app) => emTenant(app, req, async () => criado(await boleto.cadastrarConector({
      ...req.corpo,
      certificado_expira_em: dataOuNull(req.corpo?.certificado_expira_em, 'certificado_expira_em'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/conector-cobranca/certificado',
    handler: (req, app) => emTenant(app, req, async () => ok(await boleto.certificadoVenceEm())),
  },
  {
    // A porta vem do composition root. O handler nao sabe se atras dela ha
    // Sicoob, adaptador falso ou o que recusa por falta de credencial.
    metodo: 'POST', padrao: '/faturas/:id/boleto',
    handler: (req, app) => emTenant(app, req, async () => {
      /*
       * O registro NAO levanta quando a Sicoob recusa - ele devolve o resultado,
       * porque a gravacao da falha precisa commitar junto (ver
       * ResultadoDoRegistro em src/repos/boleto.ts). E aqui que isso vira status
       * HTTP: 502, e nao 201. Sem esta traducao, a rota devolveria sucesso para
       * uma emissao que nao aconteceu.
       */
      const r = await boleto.registrar(req.params.id, app.cobranca);
      return r.registrado
        ? criado(r.boleto)
        : { status: 502, corpo: { erro: 'CobrancaFalhou', mensagem: r.erro, boleto: r.boleto } };
    }),
  },
  {
    metodo: 'GET', padrao: '/faturas/:id/boleto',
    handler: (req, app) => emTenant(app, req, async () => {
      const b = await boleto.porFatura(req.params.id);
      return b ? ok(b) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Fatura sem boleto.' } };
    }),
  },
  {
    metodo: 'POST', padrao: '/faturas/:id/boleto/baixar',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await boleto.baixarNoBanco(req.params.id, req.corpo?.motivo ?? 'baixa solicitada', app.cobranca))),
  },
  {
    // PRD 6: consulta ativa diaria dos boletos em aberto, para capturar
    // liquidacao cujo webhook falhou. Leitura de todos os abertos: relatorio.
    metodo: 'GET', padrao: '/boletos/situacao',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await boleto.situacaoDosEmAberto(app.cobranca, limite(req.query)))),
  },

  // ------------------------------------------------------------- liquidacoes
  /*
   * O UNICO GATILHO DO SPLIT (PRD 5.2). As tres rotas abaixo entram todas em
   * liquidacao.baixar(), que roda a reparticao na mesma transacao - nao ha rota
   * que reparta dinheiro sem que ele tenha entrado.
   *
   * O webhook e idempotente por `id_externo`: o mesmo evento chegando duas vezes
   * devolve a baixa que ja existe, em vez de 409. Fila de webhook reprocessa por
   * erro, e transformar repeticao em erro faria a fila reprocessar para sempre.
   */
  {
    metodo: 'POST', padrao: '/liquidacoes/webhook-sicoob',
    handler: (req, app) => emTenant(app, req, async () => ok(await liquidacao.baixar({
      ...req.corpo,
      origem: 'webhook_sicoob',
      data_liquidacao: data(req.corpo?.data_liquidacao, 'data_liquidacao'),
    }))),
  },
  {
    metodo: 'POST', padrao: '/liquidacoes/conciliacao',
    handler: (req, app) => emTenant(app, req, async () => ok(await liquidacao.baixar({
      ...req.corpo,
      origem: 'conciliacao',
      data_liquidacao: data(req.corpo?.data_liquidacao, 'data_liquidacao'),
    }))),
  },
  {
    // Baixa manual. Sem `id_externo` - nao ha evento externo -, e o unico
    // (tenant, origem, id_externo) nao conflita porque NULL nao conflita com
    // NULL. Quem baixou fica na trilha da regra 9.
    metodo: 'POST', padrao: '/faturas/:id/baixa-manual',
    handler: (req, app) => emTenant(app, req, async () => ok(await liquidacao.baixar({
      fatura_id: req.params.id,
      valor_liquidado_centavos: req.corpo?.valor_liquidado_centavos,
      juros_centavos: req.corpo?.juros_centavos,
      multa_centavos: req.corpo?.multa_centavos,
      observacao: req.corpo?.observacao,
      origem: 'manual',
      data_liquidacao: data(req.corpo?.data_liquidacao, 'data_liquidacao'),
    }))),
  },
  {
    metodo: 'GET', padrao: '/liquidacoes/pendentes-de-split',
    handler: (req, app) => emTenant(app, req, async () => ok(await liquidacao.pendentesDeSplit())),
  },
  {
    // A fila da R12: a usina ganhou dono, o split pendente pode rodar. Mesma
    // funcao do caminho normal - o unico por liquidacao impede repartir duas vezes.
    metodo: 'POST', padrao: '/liquidacoes/:id/repartir',
    handler: (req, app) => emTenant(app, req, async () => ok(await liquidacao.repartirPendente(req.params.id))),
  },

  // ------------------------------------------------------------------- split
  {
    metodo: 'GET', padrao: '/liquidacoes/:id/split',
    handler: (req, app) => emTenant(app, req, async () => {
      const s = await split.porLiquidacao(req.params.id);
      return s ? ok(s) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Esta liquidacao ainda nao foi repartida.' } };
    }),
  },
  {
    metodo: 'GET', padrao: '/repasses',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await split.repassesPorDono(
      req.query.get('competencia') ? data(req.query.get('competencia'), 'competencia') : undefined))),
  },
  {
    metodo: 'GET', padrao: '/comissoes',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await split.comissoesPorOriginador(
      req.query.get('competencia') ? data(req.query.get('competencia'), 'competencia') : undefined))),
  },
];
