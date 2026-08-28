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
import * as contaPagar from '../repos/conta_pagar.ts';
import * as documento from '../repos/documento.ts';
import * as registro from '../repos/registro-unificado.ts';
import * as faturaDoRegistro from '../repos/fatura-do-registro.ts';
import * as leitor from '../concessionaria/leitor-visao.ts';
import { calcular, CAMPOS_VAZIOS, PARAMETROS_PADRAO,
  type CamposDaFaturaUnificada, type ParametrosDaEmissao } from '../dominio/fatura-unificada.ts';
import { comporFolhas, BOLETO_VAZIO, TEXTOS_PADRAO,
  type DadosDoBoleto, type TextosDoModelo } from '../dominio/folha-unificada.ts';
import type { TranscricaoDoBoleto } from '../dominio/boleto-importado.ts';
import { prontidao } from '../repos/prontidao.ts';

/** O que existe ANTES de haver sessao. Rota `publica` recebe so isto - nao ha
 *  `req.sessao` para ela ler por engano, e o tipo e que garante. */
export type RequisicaoPublica = {
  metodo: string;
  caminho: string;
  params: Record<string, string>;
  query: URLSearchParams;
  corpo: any;
};

export type Requisicao = RequisicaoPublica & {
  sessao: Sessao;
  /** Vem do header x-tenant-id. PROPOSTA: selecionarTenant() confere contra os
   *  vinculos que o login resolveu, e 404 se nao estiver la (R1). */
  tenantProposto: string | undefined;
};

export type Resultado = {
  status: number;
  corpo?: unknown;
  /**
   * `content-type` explicito. Quando presente, o corpo vai CRU - sem
   * `JSON.stringify`.
   *
   * Existe por uma rota so: a logo do documento de cobranca, que e `bytea` e
   * precisa sair como imagem. A alternativa era base64 dentro de JSON, e ela
   * infla 33% em toda leitura - o mesmo tipo de custo que fez a logo morar em
   * tabela separada (`to_jsonb` de bytea custa 2,00x, medido).
   */
  tipo?: string;
  /**
   * VALIDADOR DE CACHE, so para o corpo cru. Quando presente, o servidor
   * responde **304** se o `If-None-Match` bater, e manda `private, no-cache`.
   *
   * A logo e o unico uso hoje, e o validador dela e o `logo_sha256` que o gatilho
   * do banco ja calcula - um ETag que E o hash do conteudo nao pode discordar do
   * conteudo. Ate 14/08 a rota mandava `no-store` e a imagem inteira voltava a
   * cada render da aba Documento, que a desenha em tres lugares.
   */
  etag?: string;
};

type Handler = (req: Requisicao, app: App) => Promise<Resultado>;
type HandlerPublico = (req: RequisicaoPublica) => Promise<Resultado>;

/**
 * COMO A ROTA E AUTENTICADA, declarado NA LINHA DA ROTA. `ADR-0006`, Decisao 4.
 *
 * Ate 28/08/2026 o unico escape da sessao era uma condicao literal dentro de
 * `servidor.ts`, 300 linhas longe da tabela: `if (metodo === 'GET' && caminho
 * === '/publico/config')`. A ADR descartou acrescentar a segunda condicao com o
 * argumento que decide: "duas viram cinco, e o dia em que alguem acrescentar a
 * sexta sem querer e o dia em que uma rota fica publica sem que nada acuse".
 *
 * Virando dado, o inverso passa a ser AFIRMAVEL: `tests/rotas-auth.ts` percorre
 * a tabela e diz "exatamente estas rotas escapam da sessao". Rota nova nasce
 * `sessao` **por ausencia**, e quem a tornar publica muda uma linha que a suite
 * le.
 *
 *   sessao   o padrao. Bearer -> auth_user_id -> app.login().
 *   publica  nao ha o que autenticar: e o que o front precisa ANTES de ter
 *            credencial. Pedir token para descobrir como autenticar e circular.
 *   webhook  **NAO e "sem autenticacao"** - e "autenticado por OUTRO
 *            mecanismo", que a Decisao 1 nomeia: mTLS mais faixa de IP. Rota
 *            marcada assim que nao passe pela verificacao de origem e, nas
 *            palavras da ADR, "um buraco com nome bonito". O invariante vale
 *            nos dois sentidos e esta na suite.
 */
export type ModoDeAutenticacao = 'sessao' | 'publica' | 'webhook';

export type Rota =
  | { metodo: string; padrao: string; auth?: 'sessao' | 'webhook'; handler: Handler }
  | { metodo: string; padrao: string; auth: 'publica'; handler: HandlerPublico };

const ok = (corpo: unknown): Resultado => ({ status: 200, corpo });
const criado = (corpo: unknown): Resultado => ({ status: 201, corpo });
const semConteudo = (): Resultado => ({ status: 204 });

/** JSON nao tem data. Converte, e recusa string que nao e data - passar
 *  "Invalid Date" adiante viraria NULL no banco sem ninguem perceber. */
/** Um inteiro positivo de query string, com padrao. `?limite=abc` cai no padrao
 *  em vez de virar `NaN` num `take`, que e o modo de falha que a lista inteira
 *  do tenant produziria. */
function numero(v: string | null, padrao: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

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
/**
 * O TETO DO ARQUIVO DE LEITURA, e ele e a metade de um par que precisa fechar.
 *
 * ============================================================================
 * ATE 14/08 O TETO ESCRITO AQUI ERA CODIGO MORTO. Ele dizia 32 MB - o teto da
 * API da Anthropic -, e o servidor recusava o corpo em **1 MB**
 * (`servidor.ts`: `o.maxCorpoBytes ?? 1_000_000`), porque `scripts/servir.ts`, o
 * unico entrypoint de producao, nao passava o valor.
 *
 * Consequencia medida: base64 infla 4/3, entao o teto REAL de PDF era ~732 KB - e
 * a recusa vinha de `lerCorpo`, no meio do stream, ANTES de o handler existir.
 * Quem subisse uma fatura de 1 MB recebia "corpo grande demais" falando de bytes
 * de requisicao, e a comparacao de 32 MB nunca podia ser verdadeira.
 *
 * Agora o numero e UM SO e os dois lados o conhecem: este arquivo confere o
 * ARQUIVO e `scripts/servir.ts` dimensiona o CORPO a partir dele, com a folga do
 * base64 e do envelope JSON.
 *
 * 8 MB e o valor, e nao os 32 da API: uma fatura da Equatorial em PDF tem
 * centenas de KB e um scan colorido de duas paginas nao passa de 3 MB. Aceitar
 * 32 MB seria pagar a subida de trinta e dois megabytes para descobrir, do outro
 * lado, que o arquivo nao era o certo.
 */
export const TETO_DO_ARQUIVO = 8 * 1024 * 1024;

/**
 * O ARQUIVO QUE O CLIENTE MANDOU, validado antes de sair para a API paga.
 *
 * Conferir AQUI e o que transforma "o upload falhou" num erro que diz o tamanho
 * - e evita pagar a subida de um arquivo que ja se sabe que sera recusado.
 */
function arquivoDoCorpo(corpo: any): { conteudo: Uint8Array; tipo: string } {
  const b64 = corpo?.conteudo_base64;
  const tipo = corpo?.tipo;
  if (typeof b64 !== 'string' || !b64.trim()) {
    throw new TypeError('conteudo_base64 e obrigatorio (o arquivo em base64, sem prefixo data:)');
  }
  if (typeof tipo !== 'string' || !tipo.trim()) {
    throw new TypeError('tipo e obrigatorio (application/pdf, image/png, image/jpeg, image/webp ou image/gif)');
  }
  const bytes = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.length === 0) throw new TypeError('conteudo_base64 nao decodificou para bytes');
  if (bytes.length > TETO_DO_ARQUIVO) {
    throw Object.assign(new TypeError(
      `O arquivo tem ${Math.round(bytes.length / 1024 / 1024)} MB e o teto da leitura e `
      + `${Math.round(TETO_DO_ARQUIVO / 1024 / 1024)} MB. Uma fatura em PDF tem centenas de KB `
      + '- confira se o arquivo e o certo.'
    ), { status: 413, name: 'ArquivoGrandeDemais' });
  }
  return { conteudo: bytes, tipo: conferirAssinatura(bytes, tipo.trim()) };
}

/**
 * OS PRIMEIROS BYTES DECIDEM O TIPO, e nao o rotulo que o cliente mandou.
 *
 * A LOGO JA FAZ ISSO DESDE A MIGRATION 19, num gatilho do banco, e o comentario
 * de la explica por que: *"o tipo e reconhecido pelos BYTES do arquivo, nao pela
 * extensao - um SVG renomeado nao passa"*. A leitura por modelo de visao nao
 * fazia, e a SPA piorava: `mimeDo` devolve `image/jpeg` para todo arquivo sem
 * mime que nao termine em `.pdf`.
 *
 * O sintoma nao e seguranca - a API de terceiro nao executa o arquivo -, e
 * DESPERDICIO NOMEADO ERRADO: um `.docx` renomeado subia inteiro, era pago, e
 * voltava como erro da API falando de `media_type`. Agora a recusa e aqui, com
 * os dois valores na mensagem.
 */
const ASSINATURAS: ReadonlyArray<{ tipo: string; casa: (b: Uint8Array) => boolean }> = [
  { tipo: 'application/pdf', casa: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { tipo: 'image/png', casa: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { tipo: 'image/jpeg', casa: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: 'image/gif', casa: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    tipo: 'image/webp',
    casa: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
              && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

function conferirAssinatura(bytes: Uint8Array, declarado: string): string {
  const real = ASSINATURAS.find((a) => a.casa(bytes))?.tipo;
  if (!real) {
    throw Object.assign(new TypeError(
      `Os primeiros bytes do arquivo nao sao de PDF nem de imagem (declarado "${declarado}"). `
      + 'A leitura aceita PDF, PNG, JPEG, WebP e GIF, e o tipo e reconhecido pelo CONTEUDO - '
      + 'renomear a extensao nao passa, pelo mesmo motivo que ja vale para a logo.'
    ), { status: 415, name: 'ArquivoNaoSuportado' });
  }
  /* O DECLARADO NAO MANDA, MAS DIVERGENCIA E DITA: quem sobe um PNG rotulado
   * como PDF quase sempre subiu a coisa certa com o nome errado, e recusar seria
   * pior que corrigir. O que nao acontece e mandar o rotulo do cliente adiante. */
  return real;
}

/**
 * ============================================================================
 * O CORPO DA COMPOSICAO, CONFERIDO NA FRONTEIRA.
 *
 * Ate 14/08 o handler fazia `{ ...CAMPOS_VAZIOS, ...(req.corpo?.campos ?? {}) }
 * as CamposDaFaturaUnificada` — um `as` sem checagem nenhuma. `erros.ts` traduz
 * qualquer `TypeError` em 422 com a mensagem CRUA, entao corpo hostil produzia
 * mensagem interna de JavaScript. Medido:
 *
 *     {campos:{historico_consumo:'abc'}}  -> 422 "historico.map is not a function"
 *     {campos:{tarifa_kwh: 5}}            -> passava, e `String(5)` compunha
 *
 * E `historico_consumo` nao tinha TETO: uma lista de 100.000 pares passava por
 * `serieNaMesmaEscala` e por `historicoPlausivel` antes de a folha usar treze.
 *
 * O molde e o de `arquivoDoCorpo`: conferir aqui, nomear o campo, e nao deixar a
 * mensagem de erro ser um detalhe de implementacao.
 */
const TETO_DO_HISTORICO = 60;

function camposDoCorpo(bruto: unknown): CamposDaFaturaUnificada {
  if (bruto == null) return { ...CAMPOS_VAZIOS };
  if (typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new TypeError('campos deve ser um objeto com os campos lidos da fatura.');
  }
  const e = bruto as Record<string, unknown>;
  const saida: Record<string, unknown> = { ...CAMPOS_VAZIOS };

  for (const chave of Object.keys(CAMPOS_VAZIOS) as Array<keyof CamposDaFaturaUnificada>) {
    if (chave === 'historico_consumo') continue;
    const v = e[chave];
    if (v === undefined || v === null) continue;
    /* NUMERO E ACEITO E VIRA TEXTO. O extrator devolve string, mas um consumidor
     * externo - o CRM - manda JSON montado a mao, e recusar `1.185396` por ser
     * numero seria rigor sem ganho. O que NAO passa e objeto ou lista, que
     * viraria "[object Object]" impresso na fatura. */
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw new TypeError(`campos.${chave} deve ser texto (recebeu ${typeof v}).`);
    }
    saida[chave] = String(v);
  }

  const h = e.historico_consumo;
  if (h !== undefined && h !== null) {
    if (!Array.isArray(h)) throw new TypeError('campos.historico_consumo deve ser uma LISTA de {mes, kwh}.');
    if (h.length > TETO_DO_HISTORICO) {
      throw new TypeError(
        `campos.historico_consumo tem ${h.length} meses e o teto e ${TETO_DO_HISTORICO}. `
        + 'A folha desenha os ultimos 13; o teto e folga para quem manda a serie inteira.');
    }
    saida.historico_consumo = h.map((x, i) => {
      if (x == null || typeof x !== 'object') {
        throw new TypeError(`campos.historico_consumo[${i}] deve ser {mes, kwh}.`);
      }
      const p = x as Record<string, unknown>;
      return { mes: String(p.mes ?? ''), kwh: String(p.kwh ?? '') };
    });
  }
  return saida as unknown as CamposDaFaturaUnificada;
}

function boletoDoCorpo(bruto: unknown): DadosDoBoleto {
  if (bruto == null) return { ...BOLETO_VAZIO };
  if (typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new TypeError('boleto deve ser um objeto.');
  }
  const e = bruto as Record<string, unknown>;
  const texto = (k: keyof DadosDoBoleto) => {
    const v = e[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw new TypeError(`boleto.${k} deve ser texto (recebeu ${typeof v}).`);
    }
    return String(v);
  };
  const instrucoes = e.instrucoes;
  if (instrucoes !== undefined && instrucoes !== null && !Array.isArray(instrucoes)) {
    throw new TypeError('boleto.instrucoes deve ser uma LISTA de linhas.');
  }
  return {
    linha_digitavel: texto('linha_digitavel'),
    pix_copia_e_cola: texto('pix_copia_e_cola'),
    nosso_numero: texto('nosso_numero'),
    beneficiario: texto('beneficiario'),
    vencimento: texto('vencimento'),
    valor: texto('valor'),
    instrucoes: ((instrucoes ?? []) as unknown[]).slice(0, 40).map((t) => String(t ?? '')),
  };
}

/**
 * A TRANSCRICAO DE UM BOLETO EMITIDO NO BANCO. Tres campos, e nao os sete de
 * `boletoDoCorpo`.
 *
 * A diferenca nao e economia de digitacao, e ela decide o que vai para a coluna:
 * `beneficiario`, `vencimento` e `valor` do outro tipo sao TEXTO LIDO dos rotulos
 * impressos, e servem para a folha imprimir e para a pessoa conferir. Aqui o
 * vencimento e o valor saem dos 44 digitos do codigo de barras - e o que o banco
 * cobra -, entao aceita-los do corpo seria deixar quem chama contradizer a linha
 * digitavel que ele mesmo mandou.
 */
function transcricaoDoCorpo(bruto: unknown): TranscricaoDoBoleto {
  if (bruto == null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new TypeError('o corpo deve ser um objeto com pelo menos `linha_digitavel`.');
  }
  const e = bruto as Record<string, unknown>;
  const texto = (k: string): string => {
    const v = e[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw new TypeError(`${k} deve ser texto (recebeu ${typeof v}).`);
    }
    return String(v);
  };
  return {
    linha_digitavel: texto('linha_digitavel'),
    nosso_numero: texto('nosso_numero'),
    pix_copia_e_cola: texto('pix_copia_e_cola'),
  };
}

/** Os valores dos campos personalizados de origem `variavel`: chave -> texto. */
function personalizadosDoCorpo(bruto: unknown): Record<string, string> {
  if (bruto == null) return {};
  if (typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new TypeError('campos_personalizados deve ser um objeto {chave: valor}.');
  }
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw new TypeError(`campos_personalizados.${k} deve ser texto.`);
    }
    saida[k] = String(v);
  }
  return saida;
}

const emTenant = (app: App, req: Requisicao, f: (tx: ClientTx, v: VinculoDaSessao) => Promise<Resultado>) =>
  app.withTenant(req.sessao, req.tenantProposto, f);

/**
 * ============================================================================
 * A LEITURA PAGA ACONTECE **FORA** DE QUALQUER TRANSACAO — e isto e conserto
 * de 14/08.
 *
 * As duas rotas do modelo de visao usavam `emTenant`, e `emTenant` abre uma
 * transacao Postgres com `timeout: 15_000`. A chamada ao Opus com um PDF inteiro
 * em base64 e `max_tokens: 16000` acontecia **com a transacao aberta**.
 * Reproduzido com 18 s de trabalho nao-SQL dentro de `$transaction`: o Prisma
 * aborta com **P2028**, o cliente recebe 500, e a chamada — que ja foi paga —
 * tem o resultado descartado.
 *
 * Segurar uma conexao do pool transacional por dez, vinte segundos enquanto se
 * espera uma API de terceiro e a definicao de transacao longa. Com oito slots,
 * oito leituras simultaneas param o faturamento inteiro.
 *
 * A PERMISSAO CONTINUA SENDO CONFERIDA, e agora de verdade. O cabecalho das duas
 * rotas afirmava desde 14/08 que elas passam por `exigir('ler')` — e nao
 * passavam: os handlers chamavam o leitor direto, e `leitor-visao.ts` nao importa
 * `contexto.ts`. A conferencia acontece numa transacao CURTA que fecha ANTES da
 * chamada, o que torna o comentario verdadeiro sem trazer o problema de volta.
 */
const comPermissaoDeLer = async (app: App, req: Requisicao, f: () => Promise<Resultado>) => {
  await app.withTenant(req.sessao, req.tenantProposto, async () => {
    const { exigir } = await import('../db/contexto.ts');
    await exigir('ler');
    return ok(null);
  });
  return f();
};

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
  // ----------------------------------------------------------------- publica
  {
    /*
     * Config PUBLICA para o front subir: a URL do Supabase e a chave publicavel.
     *
     * ATE 28/08/2026 ELA NAO ESTAVA NESTA TABELA - era um `if` literal dentro de
     * `servidor.ts`, antes do autenticador. Mudou de lugar pela Decisao 4 do
     * `ADR-0006`, e o ganho nao e arrumacao: enquanto o escape era um `if`, nada
     * conseguia afirmar QUANTAS rotas escapavam da sessao.
     *
     * NAO VIOLA A REGRA 5, e vale dizer por que: a `anon key` do Supabase e
     * publica por desenho - ela vai no browser de qualquer jeito, e quem protege
     * o dado atras dela e a RLS, nao o segredo da chave. O que a regra 5 proibe e
     * segredo POR TENANT em coluna ou em variavel de ambiente; isto e config de
     * PLATAFORMA, que a propria regra manda ficar em variavel de ambiente.
     *
     * Servida pela API em vez de embutida no build por um motivo pratico: um
     * build so serve qualquer ambiente, e trocar de projeto Supabase nao exige
     * recompilar o front.
     */
    metodo: 'GET', padrao: '/publico/config', auth: 'publica',
    handler: async () => {
      const url = process.env.SUPABASE_URL;
      const chave = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!url || !chave) {
        return { status: 503, corpo: {
          erro: 'ConfigAusente',
          mensagem: 'SUPABASE_URL e SUPABASE_ANON_KEY nao estao no ambiente. Sem elas o front nao ' +
            'consegue autenticar, e o servidor prefere dizer isso a servir uma tela que nao loga.',
        } };
      }
      return ok({ supabaseUrl: url, supabaseAnonKey: chave });
    },
  },

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
    /*
     * A CARTEIRA ATIVA, e nao o cadastro inteiro (decisao do dono, 04/08/2026).
     *
     * Por padrao devolve so quem tem UC na etapa `Desconto Ativo` do funil
     * `Rateio` - 29 linhas em producao, contra 86 do cadastro. O motivo esta em
     * `src/repos/cliente.ts`: "ativo" significava tres coisas diferentes, e esta
     * rota devolvia a mais larga das tres.
     *
     * `?escopo=todos` e a saida explicita, e ela existe para que cliente criado
     * a mao nao fique invisivel - sem lista nao ha outro caminho de busca.
     */
    metodo: 'GET', padrao: '/clientes',
    handler: (req, app) => emTenant(app, req, async () => ok(await cliente.listar({
      ativo: req.query.has('ativo') ? req.query.get('ativo') === 'true' : undefined,
      escopo: req.query.get('escopo') === 'todos' ? 'todos' : 'carteira_ativa',
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
    /*
     * OS VIGENTES DE TODAS AS UCs, numa consulta. Substitui o N+1 da tela de
     * Contratos, que fazia uma requisicao HTTP por UC - 42 hoje, 501 no teto
     * atual de listagem. Ver `vigentesPorUC`.
     */
    metodo: 'GET', padrao: '/contratos-vigentes',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await contrato.vigentesPorUC())),
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
  // As DUAS tabelas versionadas - eram tres ate 14/08. As rotas de `/tarifas`
  // sairam com a migration 30: a tarifa deixou de ser "preco por distribuidora
  // com vigencia" e passou a ser coluna da UC, porque a granularidade REAL e por
  // cliente (medido: 41 de 41 UCs com tarifa propria, e ela varia). Quem a edita
  // e a aba Unidades; quem a le na composicao e `app.tarifa_da_uc`.
  //
  // As duas que ficam sao REGRA e nao PRECO, e por isso continuam versionadas: a
  // comissao de um contrato fechado em marco e a de marco, para sempre (R20-b).
  //
  // NAO ha rota de edicao, e a ausencia e o desenho: o PRD 4.6 manda "nunca
  // editada no lugar". A unica escrita e abrir vigencia nova, que fecha a
  // anterior na mesma transacao.
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
    // O que FALTA para a competencia poder ser faturada, todas as camadas de uma
    // vez. Responde outra pergunta que a do ensaio: aquele diz se uma UC entra,
    // este diz onde esta o trabalho. Leitura pesada de nove subconsultas:
    // caminho de relatorio.
    metodo: 'GET', padrao: '/faturamento/:competencia/prontidao',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await prontidao(req.params.competencia))),
  },
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
  /*
   * AS DUAS ROTAS DO BOLETO EMITIDO NO BANCO (17/08/2026).
   *
   * O QUE ELAS RESOLVEM esta medido em `src/dominio/boleto-importado.ts`: o
   * unico caminho para um boleto existir passava pela `PortaDeCobranca`, que
   * depende do certificado A1 - a unica pendencia do projeto, e compra externa.
   * Enquanto ele nao chega, a operacao emite o boleto a mao no portal da
   * cooperativa e o sistema nao sabe que ele existe: a fatura diz "sem boleto", o
   * documento sai cobrando por Pix estatico (que nao concilia) e a conferencia
   * aritmetica nunca roda.
   *
   * NENHUMA DAS DUAS FALA COM A SICOOB. Nao ha porta injetada aqui, e nao ha
   * `app.cobranca` no handler - de proposito: um handler que nao recebe a porta
   * nao tem como chama-la. E o mesmo desenho que faz `POST /faturas/:id/boleto`
   * receber a porta e este par nao.
   *
   * A CONFERENCIA E ROTA SEPARADA DA IMPORTACAO pela mesma razao que a escolha da
   * chave Pix e separada da edicao dela: conferir mostra, importar decide. A tela
   * confere a cada linha colada - e leitura, e roda no caminho de relatorio -, e
   * so escreve quando alguem aperta o botao.
   */
  {
    metodo: 'POST', padrao: '/faturas/:id/boleto/conferir',
    handler: (req, app) => emRelatorio(app, req, async () =>
      ok(await boleto.conferirParaImportar(req.params.id, transcricaoDoCorpo(req.corpo)))),
  },
  {
    metodo: 'POST', padrao: '/faturas/:id/boleto/importar',
    handler: (req, app) => emTenant(app, req, async () =>
      criado(await boleto.importar(req.params.id, transcricaoDoCorpo(req.corpo)))),
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
    /*
     * A UNICA ROTA `webhook` DO SISTEMA. O que a autentica esta em
     * `src/http/origem-do-webhook.ts` e nao aqui - e sem ela nao ha entrada:
     * origem nao verificada sai como o **404 generico**, identico ao de rota
     * inexistente, porque 401 confirmaria a existencia do endpoint para quem
     * esta tentando.
     *
     * O TENANT VAI NO CAMINHO, e e a resposta da `Q-WEBHOOK-TENANT-01` (decidida
     * em 28/08/2026). A Decisao 2 da ADR mandava resolver o tenant "pela
     * credencial", e isso deixou de existir quando a Decisao 1 virou mTLS: o
     * certificado do Sicoob e UM para todos os nossos tenants.
     *
     * O `:tenant` NAO E CREDENCIAL - e identificador. O argumento que derrubou a
     * opcao D da Decisao 1 (segredo em URL vaza em `access.log`, `Referer` e
     * historico de intermediario) nao se aplica a um uuid que nao autoriza nada
     * sozinho: quem autoriza e o certificado, e depois dele a R1 confere se o
     * tenant proposto esta entre os vinculos do usuario de servico.
     *
     * SUPOSICAO (ADR-0006 §2.3): o Sicoob acrescenta `/pix` ao fim da URL
     * cadastrada no portal. Foi medido na API **Pix**, e nao esta medido para a
     * Cobranca Bancaria. O padrao aqui e o caminho que ESPERAMOS receber; se o
     * primeiro webhook do sandbox chegar com o sufixo, e este padrao que muda -
     * nao a autenticacao.
     */
    metodo: 'POST', padrao: '/liquidacoes/webhook-sicoob/:tenant', auth: 'webhook',
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
  // ------------------------------------ contas a pagar (PRD 4.4 · Q-PAGAMENTO-01)
  /*
   * A VERTENTE DA EMPRESA, na fatia que tinha prazo. Estas rotas sao as unicas
   * do sistema que passam por `ler_corporativo`/`escrever_corporativo` - a
   * coluna `Corporativo` da matriz do PRD 3, que ate 03/08 nao tinha entidade
   * para governar. Consequencia visivel: o papel `cobranca` recebe 403 aqui,
   * enquanto ve tudo da carteira.
   *
   * NAO HA rota que CRIE conta de repasse ou de comissao. Elas nascem do split,
   * na transacao da baixa, e so de la - um segundo caminho provisionaria a mesma
   * despesa duas vezes ao mesmo beneficiario.
   */
  {
    metodo: 'GET', padrao: '/contas-a-pagar',
    handler: (req, app) => emTenant(app, req, async () => ok(await contaPagar.listar({
      status: (req.query.get('status') ?? undefined) as any,
      competencia: req.query.get('competencia')
        ? data(req.query.get('competencia'), 'competencia') : undefined,
      limite: limite(req.query),
    }))),
  },
  {
    metodo: 'GET', padrao: '/contas-a-pagar/resumo',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await contaPagar.resumo())),
  },
  {
    /* A conferencia entre APURACAO e QUITACAO. Lista vazia e o estado correto -
     * a rota existe para que "nenhuma conta foi provisionada" seja uma pergunta
     * que alguem consiga fazer, e nao um silencio. */
    metodo: 'GET', padrao: '/contas-a-pagar/sem-provisao',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await contaPagar.itensDeSplitSemConta())),
  },
  {
    metodo: 'GET', padrao: '/contas-a-pagar/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      const c = await contaPagar.porId(req.params.id);
      return c ? ok(c) : { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Conta a pagar nao encontrada.' } };
    }),
  },
  {
    metodo: 'POST', padrao: '/contas-a-pagar',
    handler: (req, app) => emTenant(app, req, async () => criado(await contaPagar.criarManual({
      ...req.corpo,
      competencia: data(req.corpo?.competencia, 'competencia'),
      vencimento: data(req.corpo?.vencimento, 'vencimento'),
    }))),
  },
  {
    metodo: 'POST', padrao: '/contas-a-pagar/:id/cancelar',
    handler: (req, app) => emTenant(app, req, async () => {
      await contaPagar.cancelar(req.params.id);
      return semConteudo();
    }),
  },
  {
    metodo: 'POST', padrao: '/contas-a-pagar/:id/pagamentos',
    handler: (req, app) => emTenant(app, req, async () => criado(await contaPagar.registrarPagamento(
      req.params.id, { ...req.corpo, data_pagamento: data(req.corpo?.data_pagamento, 'data_pagamento') }))),
  },
  {
    metodo: 'GET', padrao: '/categorias',
    handler: (req, app) => emTenant(app, req, async () => ok(await contaPagar.listarCategorias())),
  },
  {
    metodo: 'POST', padrao: '/categorias',
    handler: (req, app) => emTenant(app, req, async () => criado(await contaPagar.criarCategoria(req.corpo?.nome))),
  },
  {
    metodo: 'GET', padrao: '/centros-de-custo',
    handler: (req, app) => emTenant(app, req, async () => ok(await contaPagar.listarCentrosDeCusto())),
  },
  {
    metodo: 'POST', padrao: '/centros-de-custo',
    handler: (req, app) => emTenant(app, req, async () => criado(await contaPagar.criarCentroDeCusto(req.corpo?.nome))),
  },

  // ------------------------------------------- documento de cobranca (Q-DOCFATURA-01)
  /*
   * A IDENTIDADE, A LOGO E O LAYOUT. Tres coisas que o cliente ve, e nenhuma
   * delas e segredo: chave Pix identifica DESTINO e sai impressa no documento.
   * O que e segredo continua em `conector_cobranca.credencial_ref` (regra 5), e
   * nenhuma rota daqui o toca.
   */
  {
    metodo: 'GET', padrao: '/cobranca/identidade',
    handler: (req, app) => emTenant(app, req, async () => ok(await documento.identidade())),
  },
  {
    metodo: 'POST', padrao: '/cobranca/identidade',
    handler: (req, app) => emTenant(app, req, async () => criado(await documento.salvarIdentidade(req.corpo ?? {}))),
  },
  /*
   * O BANCO DE CHAVES (migration 25). Ate 06/08 a chave morava em quatro colunas
   * da identidade, o que comportava exatamente uma - sem apelido, sem titular e
   * sem historia. Agora ela e uma LINHA, e a identidade so aponta para a padrao.
   *
   * NAO HA DELETE, e isso e do banco e nao desta tabela de rotas: chave que ja
   * pagou fatura e referenciada por ela, e apagar reescreveria o destino de um
   * documento que circulou. Tirar de uso e `ativa: false`, pelo PUT.
   */
  {
    metodo: 'GET', padrao: '/cobranca/chaves-pix',
    handler: (req, app) => emTenant(app, req, async () => ok(await documento.chavesPix())),
  },
  {
    metodo: 'POST', padrao: '/cobranca/chaves-pix',
    handler: (req, app) => emTenant(app, req, async () => criado(await documento.criarChavePix(req.corpo ?? {}))),
  },
  {
    metodo: 'PUT', padrao: '/cobranca/chaves-pix/:id',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await documento.editarChavePix(req.params.id!, req.corpo ?? {}))),
  },
  {
    /*
     * O QR DE CONFERENCIA, e ele existe por uma medicao de 30/07: producao tinha
     * 0 contratos, 0 faturas e 39 UCs sem `data_vencimento`, entao o unico teste
     * que nenhuma verificacao automatica substitui - ler o QR com uma camera -
     * estava atras de bloqueios que dependem de insumo humano que nao chegou.
     *
     * GET e nao POST: nao escreve nada. E leitura, com `exigir('ler')` no
     * repositorio como qualquer outra.
     */
    metodo: 'GET', padrao: '/cobranca/qr-de-conferencia',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await documento.qrDeConferencia(Number(req.query.get('valor_centavos'))))),
  },
  {
    /*
     * A LOGO SOBE EM BASE64 DENTRO DE JSON, e o teto de dois lados tem de fechar:
     * o banco recusa acima de 512 KB (`logo_de_cobranca`), e base64 disso da
     * ~699 KB, abaixo do `maxCorpoBytes` de 1.000.000 do servidor. Subir o teto
     * do banco sem subir o do servidor trocaria um erro nomeado por um 413.
     *
     * O mime NAO vem daqui: o gatilho do banco o deriva da ASSINATURA do arquivo
     * e recusa o que nao for PNG ou JPEG. Um SVG rotulado como `image/png` nao
     * passa, e isso importa porque a logo e embutida no HTML do documento.
     */
    metodo: 'PUT', padrao: '/cobranca/logo',
    handler: (req, app) => emTenant(app, req, async () => {
      const b64 = req.corpo?.conteudo_base64;
      if (typeof b64 !== 'string' || !b64.trim()) {
        throw new TypeError('conteudo_base64 e obrigatorio (a imagem em base64, sem prefixo data:)');
      }
      const bytes = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      if (bytes.length === 0) throw new TypeError('conteudo_base64 nao decodificou para bytes');
      return ok(await documento.salvarLogo(bytes));
    }),
  },
  {
    metodo: 'GET', padrao: '/cobranca/logo',
    handler: (req, app) => emTenant(app, req, async () => {
      const [l, id] = await Promise.all([documento.logo(), documento.identidade()]);
      if (!l || !id?.logo_mime) {
        return { status: 404, corpo: { erro: 'NaoEncontrado', mensagem: 'Este tenant nao tem logo.' } };
      }
      // Corpo CRU com o mime que o GATILHO derivou do arquivo - nao um mime que
      // a aplicacao guardou e pode ter divergido do conteudo.
      //
      // O ETAG E O `logo_sha256`, que o mesmo gatilho calcula. Um validador que
      // E o hash do conteudo nao pode discordar do conteudo - e e por isso que
      // ele nao e inventado aqui.
      return {
        status: 200, corpo: l.conteudo as Uint8Array, tipo: id.logo_mime,
        ...(id.logo_sha256 ? { etag: `"${id.logo_sha256}"` } : {}),
      };
    }),
  },
  {
    metodo: 'DELETE', padrao: '/cobranca/logo',
    handler: (req, app) => emTenant(app, req, async () => { await documento.removerLogo(); return semConteudo(); }),
  },
  {
    metodo: 'GET', padrao: '/cobranca/campos',
    handler: (req, app) => emTenant(app, req, async () => ok(await documento.campos())),
  },
  {
    // A LISTA INTEIRA, sempre. Nao ha PATCH de um campo: um diff perdido deixaria
    // o documento com dois campos na mesma posicao. Lista vazia volta ao PADRAO.
    metodo: 'PUT', padrao: '/cobranca/campos',
    handler: (req, app) => emTenant(app, req, async () => {
      const campos = req.corpo?.campos;
      if (!Array.isArray(campos)) throw new TypeError('campos deve ser uma LISTA (vazia volta ao padrao)');
      return ok({ definidos: await documento.definirCampos(campos) });
    }),
  },
  /*
   * O MODELO DE FATURA (migration 28) - o TEMPLATE.
   *
   * Ele guarda COMO a folha le: assinatura do topo, texto do aviso laranja,
   * parametros padrao de emissao, multa, juros e o rodape legal do banco. Ate
   * 14/08 os cinco eram literais em `folha-unificada.ts`, e dois deles nomeavam
   * uma cooperativa bancaria especifica com o codigo dela - o mesmo defeito que a
   * migration 26 tirou do emissor, agora com o banco de outro tenant.
   *
   * A ESCOLHA DO PADRAO E ROTA SEPARADA da edicao, pelo mesmo motivo da chave
   * Pix: editar muda o texto, escolher muda o que a proxima fatura imprime.
   */
  {
    metodo: 'GET', padrao: '/cobranca/modelos',
    handler: (req, app) => emTenant(app, req, async () => ok(await documento.modelos())),
  },
  {
    metodo: 'POST', padrao: '/cobranca/modelos',
    handler: (req, app) => emTenant(app, req, async () => criado(await documento.criarModelo(req.corpo ?? {}))),
  },
  {
    metodo: 'PUT', padrao: '/cobranca/modelos/:id',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await documento.salvarModelo(req.params.id!, req.corpo ?? {}))),
  },
  {
    metodo: 'POST', padrao: '/cobranca/modelos/:id/padrao',
    handler: (req, app) => emTenant(app, req, async () =>
      ok(await documento.escolherModeloPadrao(req.params.id!))),
  },
  /*
   * OS CAMPOS PERSONALIZADOS. Ao lado dos 16 do enum `campo_de_fatura`, que
   * nomeiam colunas da fatura e por isso sao fechados. Estes nomeiam dados do
   * tenant que nao existem em coluna nenhuma nossa - "Contrato n", "Vendedor",
   * "Placa da usina" - e por isso sao linha e nao valor de enum.
   */
  {
    metodo: 'GET', padrao: '/cobranca/campos-personalizados',
    handler: (req, app) => emTenant(app, req, async () => ok(await documento.camposPersonalizados())),
  },
  {
    // A LISTA INTEIRA, sempre - mesma decisao de `/cobranca/campos`.
    metodo: 'PUT', padrao: '/cobranca/campos-personalizados',
    handler: (req, app) => emTenant(app, req, async () => {
      const campos = req.corpo?.campos;
      if (!Array.isArray(campos)) throw new TypeError('campos deve ser uma LISTA (vazia apaga todos)');
      return ok({ definidos: await documento.definirCamposPersonalizados(campos) });
    }),
  },
  /*
   * A LEITURA POR MODELO DE VISAO (14/08/2026) - as duas rotas que substituem o
   * `/api/ler-fatura` da referencia.
   *
   * TRES DIFERENCAS EM RELACAO A ELE, e as tres sao de seguranca:
   *
   *   1. AUTENTICADA. O `/api/ler-fatura` da Vercel e proxy aberto - quem tem a
   *      URL gasta na conta de quem hospeda (`Q-REF-SEGREDO-01`, medido no ar).
   *      Aqui passa por sessao e por `exigir('ler')`, como toda rota do sistema;
   *   2. CORPO FECHADO. La o corpo do cliente vai INTEIRO para a API - modelo,
   *      `max_tokens`, mensagens, tudo. Aqui o cliente manda ARQUIVO, e quem monta
   *      a requisicao e o adaptador. Nao ha como pedir outro modelo por aqui;
   *   3. NAO DEVOLVE METADADO DA CHAVE. Nem prefixo, nem tamanho, nem nada.
   *
   * O TETO DE 32 MB E DA API e esta escrito aqui porque a mensagem importa: um
   * PDF de fatura tem centenas de KB, e quem sobe 40 MB subiu a coisa errada.
   */
  /*
   * A COMPOSICAO DA FOLHA UNIFICADA. E o coracao da aba nova: entra o que a
   * pessoa tem na tela - campos lidos, ja corrigidos a mao, mais os parametros -
   * e saem as duas folhas prontas.
   *
   * POR QUE NO SERVIDOR, se a referencia calcula no navegador. Duas razoes, e as
   * duas ja estao escritas noutro lugar deste sistema:
   *
   *   - a regra 1. A conta e em centavo inteiro, e o modulo que a faz e
   *     `fatura-unificada.ts`. Recalcular na tela seria a SEGUNDA implementacao
   *     da mesma conta, em float, e as duas divergiriam no dia em que alguem
   *     declarasse 0,35%;
   *   - o CRM consome as mesmas rotas e nao roda React (decisao 4 da
   *     `Q-DOCFATURA-01`). Se a composicao morasse na tela, publicar seria
   *     reescrever.
   *
   * NAO ESCREVE NADA. E `exigir('ler')` por dentro, como toda composicao de
   * documento - a pessoa esta conferindo, nao emitindo.
   */
  {
    metodo: 'POST', padrao: '/faturas/unificada/compor',
    handler: (req, app) => emRelatorio(app, req, async () => {
      const campos = camposDoCorpo(req.corpo?.campos);
      const boleto = boletoDoCorpo(req.corpo?.boleto);
      const personalizados = personalizadosDoCorpo(req.corpo?.campos_personalizados);

      /*
       * SEIS LEITURAS EM PARALELO, e nao seis idas em fila. Todas sao SELECT do
       * mesmo tenant na mesma unidade de trabalho, e a composicao acontece a cada
       * 400 ms de digitacao - encadea-las custaria seis viagens sequenciais por
       * tecla parada.
       */
      const [ident, modelo, campos_personalizados] = await Promise.all([
        documento.identidade(),
        documento.modeloVigente(),
        documento.camposPersonalizadosResolvidos(personalizados),
      ]);

      /*
       * OS PARAMETROS PADRAO SAO DO MODELO, e nao mais constantes do codigo.
       *
       * Ate 14/08 a tela oferecia desconto e fator de CO2 editaveis sem lugar
       * nenhum para GRAVAR a escolha: quem opera redigitava 20 em toda fatura, ou
       * esquecia e faturava com o numero errado. Agora o modelo carrega os dois, e
       * o que a tela manda so sobrepoe quando ela manda de fato.
       */
      const parametros = {
        percentual_desconto: modelo?.percentual_desconto_padrao ?? PARAMETROS_PADRAO.percentual_desconto,
        fator_emissao: modelo?.fator_emissao_padrao ?? PARAMETROS_PADRAO.fator_emissao,
        ...(req.corpo?.parametros ?? {}),
      } as ParametrosDaEmissao;

      const conta = calcular(campos, parametros);

      /*
       * A ECONOMIA ACUMULADA (migration 29). So consulta quando ha UC e
       * competencia legiveis - sem os dois nao ha serie, e a folha cai em
       * "Primeira fatura com a G3 Solar", que e o que a referencia faz.
       *
       * A competencia ilegivel NAO derruba a composicao: quem esta digitando o
       * mes ainda nao terminou de digita-lo, e uma composicao que falha a cada
       * tecla e uma tela que pisca erro enquanto a pessoa trabalha.
       */
      let economia: registro.EconomiaAcumulada | null = null;
      if (campos.unidade_consumidora.trim() && campos.mes_referencia.trim()) {
        try {
          economia = await registro.economiaAcumulada(
            campos.unidade_consumidora,
            registro.primeiroDiaDaCompetencia(campos.mes_referencia),
          );
        } catch { economia = null; }
      }

      const folhas = comporFolhas(
        campos, conta,
        { razao_social: ident?.razao_social ?? null, cnpj: ident?.cnpj ?? null },
        boleto,
        {
          contato: {
            telefone: ident?.telefone ?? null, endereco: ident?.endereco ?? null,
            email: ident?.email ?? null, site: ident?.site ?? null,
          },
          modelo: (modelo ?? TEXTOS_PADRAO) as TextosDoModelo,
          campos_personalizados,
          /* SO PASSA A SOMA QUANDO HA MAIS DE UMA FATURA. Com uma so, a soma E o
           * desconto desta - e a folha ja diz isso por outro caminho, sem a nota
           * "desde", que com uma fatura so nao informa nada. */
          ...(economia && economia.faturas > 1
            ? { economia_acumulada_centavos: economia.centavos, desde: economia.desde ?? undefined }
            : {}),
        },
      );
      /* A CONTA VIAJA JUNTO com as folhas, e nao so o que esta impresso: o painel
       * da aba 1 mostra total, energia G3 e repasses ANTES de a folha existir, e
       * ele nao pode recalcular do lado de la. */
      return ok({ conta, ...folhas, economia, modelo });
    }),
  },
  /*
   * O REGISTRO DA FATURA (migration 29) - a `fatura:{uc}:{AAAA-MM}` da
   * referencia, com tenant, policy e trilha.
   *
   * `emTenant` e nao `emRelatorio`: aqui ESCREVE. A composicao acima e leitura e
   * por isso mudou para o caminho de relatorio - ela roda a cada 400 ms de
   * digitacao e nao pode disputar slot transacional com a emissao.
   */
  {
    metodo: 'POST', padrao: '/faturas/unificada/registros',
    handler: (req, app) => emTenant(app, req, async () => {
      const campos = camposDoCorpo(req.corpo?.campos);
      const boleto = boletoDoCorpo(req.corpo?.boleto);
      const modelo = await documento.modeloVigente();
      const parametros = {
        percentual_desconto: modelo?.percentual_desconto_padrao ?? PARAMETROS_PADRAO.percentual_desconto,
        fator_emissao: modelo?.fator_emissao_padrao ?? PARAMETROS_PADRAO.fator_emissao,
        ...(req.corpo?.parametros ?? {}),
      } as ParametrosDaEmissao;
      /* A CONTA E RECALCULADA AQUI, do que chegou, e nao aceita do corpo. Aceitar
       * os nove valores em centavos do cliente seria deixar quem chama decidir a
       * economia que a folha do proximo mes vai imprimir. */
      const conta = calcular(campos, parametros);
      return criado(await registro.registrar({
        campos, parametros, conta, boleto,
        campos_personalizados: personalizadosDoCorpo(req.corpo?.campos_personalizados),
      }));
    }),
  },
  {
    metodo: 'GET', padrao: '/faturas/unificada/registros',
    handler: (req, app) => emRelatorio(app, req, async () => {
      const uc = req.query.get('unidade_consumidora');
      const lista = uc
        ? await registro.daUnidade(uc)
        : await registro.recentes(numero(req.query.get('limite'), 50));
      /* `fatura_id` vem por fora da leitura porque o cliente gerado do Prisma so
       * conhece a coluna depois da migration 34 - ver `comFatura`. Sem isto a
       * tela nao teria como distinguir a conta ja cobrada da que ainda nao foi. */
      return ok(await faturaDoRegistro.comFatura(lista));
    }),
  },
  {
    metodo: 'DELETE', padrao: '/faturas/unificada/registros/:id',
    handler: (req, app) => emTenant(app, req, async () => {
      await registro.apagar(req.params.id!);
      return semConteudo();
    }),
  },
  /*
   * ============================================================================
   * A JUNCAO (migration 34) - a conta lida virando fatura cobravel.
   *
   * `Q-CICLO-01`, decidida pelo dono em 21/08/2026: o caminho oficial e o
   * UNIFICADO. Ate aqui as duas metades do sistema nao se encontravam, e o
   * documento que o cliente EFETIVAMENTE recebe era o unico dos dois caminhos
   * que nao conseguia pagar o dono da usina - sem `fatura` nao ha boleto, sem
   * boleto nao ha liquidacao, sem liquidacao nao ha split.
   *
   * SAO DUAS ROTAS E NAO UMA, e o par e o mesmo do lote: ensaiar responde "esta
   * conta viraria fatura?" sem escrever nada, e faturar escreve. O primeiro ato
   * que cobra um cliente deve poder ser olhado antes de existir - e a mesma razao
   * de `--ensaio` e `--valendo` serem obrigatorios nos scripts.
   */
  {
    metodo: 'GET', padrao: '/faturas/unificada/registros/:id/ensaio',
    handler: (req, app) => emRelatorio(app, req, async () =>
      ok(await faturaDoRegistro.ensaiarRegistro(req.params.id!))),
  },
  /*
   * A SEGUNDA VIA (21/08/2026) - o segundo proposito que a migration 29 declarou
   * para `registro_de_fatura_unificada` e que nunca tinha sido construido.
   *
   * Ele passou a valer mais com a `Q-CICLO-01`: a folha de sete faixas virou o
   * documento oficial, e ate aqui ela so existia enquanto os campos estivessem na
   * tela. Fechar a aba perdia o documento, e reabrir exigia subir o PDF da
   * distribuidora outra vez.
   *
   * DEVOLVE OS CAMPOS, E NAO A FOLHA MONTADA, de proposito: a tela ja sabe compor
   * a partir dos campos - e o que ela faz a cada 400 ms de digitacao -, entao
   * montar aqui seria um SEGUNDO caminho de composicao, que divergiria do
   * primeiro no dia em que um dos dois mudasse. A segunda via recarrega a tela; a
   * folha sai por onde ja saia.
   */
  {
    metodo: 'GET', padrao: '/faturas/unificada/registros/:id/segunda-via',
    handler: (req, app) => emRelatorio(app, req, async () =>
      ok(await registro.segundaVia(req.params.id!))),
  },
  {
    /* `emTenant` e nao `emRelatorio`: aqui ESCREVE, e as duas escritas - criar a
     * fatura e apontar a linha para ela - acontecem na transacao deste caminho.
     * Uma fatura criada sem a linha apontando para ela faria a conta parecer nao
     * faturada, e a segunda tentativa cobraria o cliente duas vezes. */
    metodo: 'POST', padrao: '/faturas/unificada/registros/:id/faturar',
    handler: (req, app) => emTenant(app, req, async () =>
      criado(await faturaDoRegistro.faturarRegistro(req.params.id!))),
  },
  {
    metodo: 'POST', padrao: '/faturas/ler-fatura',
    handler: (req, app) => comPermissaoDeLer(app, req, async () => {
      const d = arquivoDoCorpo(req.corpo);
      return ok(await leitor.lerFaturaDaEquatorial(d));
    }),
  },
  {
    metodo: 'POST', padrao: '/faturas/ler-boleto',
    handler: (req, app) => comPermissaoDeLer(app, req, async () => {
      const d = arquivoDoCorpo(req.corpo);
      return ok(await leitor.lerBoletoSicoob(d));
    }),
  },
  {
    /*
     * O DOCUMENTO DA FATURA - e esta e a rota que o CRM vai consumir.
     *
     * A decisao 4 da `Q-DOCFATURA-01` foi "entrega manual agora, com a primeira
     * opcao ja preparada", e a primeira opcao e o `PRD` §7.8: endpoint exposto
     * pelo financeiro, consumido pelo CRM. Por isso a composicao esta no
     * repositorio e nao na tela - o CRM nao roda React, e a tela e um dos dois
     * consumidores, nao o dono do formato.
     *
     * Caminho de RELATORIO: leitura pesada (fatura + UC + cliente + usina +
     * layout + boleto) nao disputa slot com a emissao. E so LEITURA - `exigir('ler')`
     * no repositorio -, entao expo-la a um consumidor externo nao abre superficie
     * de escrita. O que falta para o CRM chamar de fato e a autenticacao dele,
     * que e a mesma pergunta em aberto da `Q-WEBHOOK-01`.
     *
     * `?embutir_logo=1` FECHA A PENDENCIA (c) DA `Q-DOCFATURA-01`. A tela busca o
     * binario por `GET /cobranca/logo`, com o Bearer dela; um consumidor externo
     * que nao possa fazer a segunda chamada pede a logo em base64 aqui e monta o
     * documento numa requisicao. E OPT-IN de proposito: base64 custa 33% a mais, e
     * cobrar isso de quem nao precisa encareceria o caminho comum.
     *
     * O QR do Pix vem SEMPRE, como SVG pronto - ver `src/dominio/qrcode.ts`. O
     * consumidor externo nao precisa de codificador nenhum, que e o que a
     * decisao 4 pediu.
     */
    metodo: 'GET', padrao: '/faturas/:id/documento',
    handler: (req, app) => emRelatorio(app, req, async () => ok(await documento.paraFatura(req.params.id, {
      embutirLogo: ['1', 'true', 'sim'].includes((req.query.get('embutir_logo') ?? '').toLowerCase()),
    }))),
  },
];
