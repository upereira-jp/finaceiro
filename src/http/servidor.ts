// O servidor HTTP. node:http puro - nenhuma dependencia nova.
//
// AUTENTICACAO NAO E DECIDIDA AQUI, e a omissao e deliberada. `MT-06` (Auth
// proprio ou SSO com o CRM?) esta ABERTA em QUESTOES.md, e a regra 10 diz que
// lacuna vira questao, nao default escolhido "porque parecia razoavel". Entao o
// servidor recebe um Autenticador por parametro e nao tem implementacao padrao:
// quem montar o processo decide, e a decisao fica visivel na chamada em vez de
// enterrada aqui dentro.
//
// O que o Autenticador devolve e o `auth_user_id` - o id do provedor de
// identidade, NAO o usuario_id do financeiro. Quem traduz um no outro e
// app.login(), por app.resolver_login(), que e a unica consulta do sistema feita
// fora de contexto de tenant (R1-c).

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App, Sessao } from '../app.ts';
import { ROTAS, type Requisicao, type Resultado } from './rotas.ts';
import { traduzir, ehInesperado } from './erros.ts';

/** Devolve o auth_user_id de quem chamou, ou lanca com status 401. */
export type Autenticador = (req: IncomingMessage) => Promise<string>;

export type OpcoesDoServidor = {
  app: App;
  autenticador: Autenticador;
  /** Teto do corpo. Requisicao maior e recusada com 413 ANTES de acumular. */
  maxCorpoBytes?: number;
  /** Onde vai o detalhe do 500. Nunca na resposta. */
  log?: (mensagem: string, erro: unknown) => void;
  /**
   * Prefixo da API. Tudo fora dele vai para os estaticos.
   *
   * O PREFIXO EXISTE PARA A SPA E A API DIVIDIREM UMA ORIGEM SO, e isso nao e
   * arrumacao: com origens diferentes aparece CORS, e CORS num sistema onde a
   * credencial e um Bearer significa decidir `Access-Control-Allow-Origin` e
   * `credentials` - superficie nova, num caminho onde errar vaza sessao. Mesma
   * origem nao tem esse problema porque nao ha o que permitir.
   *
   * De brinde, e um artefato so para versionar, hospedar e apontar o subdominio.
   */
  prefixoApi?: string;
  /**
   * Diretorio da SPA construida. Ausente, o servidor e so API - que e como as
   * suites de teste o usam, e como ele roda em desenvolvimento com o Vite
   * servindo o front na porta dele.
   */
  estaticos?: string;
};

/**
 * Config PUBLICA para o front subir: a URL do Supabase e a chave publicavel.
 *
 * NAO VIOLA A REGRA 5, e vale dizer por que: a `anon key` do Supabase e
 * publica por desenho - ela vai no browser de qualquer jeito, e quem protege o
 * dado atras dela e a RLS, nao o segredo da chave. O que a regra 5 proibe e
 * segredo POR TENANT em coluna ou em variavel de ambiente; isto e config de
 * PLATAFORMA, que a propria regra manda ficar em variavel de ambiente.
 *
 * Servida pela API em vez de embutida no build por um motivo pratico: um build
 * so serve qualquer ambiente, e trocar de projeto Supabase nao exige recompilar
 * o front.
 */
function configPublica(): Resultado {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    return { status: 503, corpo: {
      erro: 'ConfigAusente',
      mensagem: 'SUPABASE_URL e SUPABASE_ANON_KEY nao estao no ambiente. Sem elas o front nao ' +
        'consegue autenticar, e o servidor prefere dizer isso a servir uma tela que nao loga.',
    } };
  }
  return { status: 200, corpo: { supabaseUrl: url, supabaseAnonKey: chave } };
}

/** Tipos por extensao. Lista fechada: extensao desconhecida sai como octet-stream
 *  em vez de ganhar um tipo adivinhado que o browser vai interpretar. */
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/**
 * Serve a SPA. Caminho que nao existe cai no index.html - e roteamento de
 * cliente, nao 404: `/contratos` e uma tela, nao um arquivo.
 *
 * A TRAVESSIA E BARRADA POR RESOLUCAO, nao por inspecao da string. `path.resolve`
 * normaliza `..`, `%2e%2e` ja veio decodificado pela URL, e o que sobra e
 * comparar o caminho ABSOLUTO resolvido com a raiz. Filtrar ".." no texto e o
 * jeito que falha - sempre falta uma codificacao.
 */
async function servirEstatico(raiz: string, caminho: string, res: ServerResponse): Promise<void> {
  const pedido = path.resolve(raiz, '.' + decodeURIComponent(caminho));
  const dentro = pedido === raiz || pedido.startsWith(raiz + path.sep);

  const alvo = dentro && path.extname(pedido) ? pedido : path.join(raiz, 'index.html');
  try {
    const conteudo = await fs.readFile(alvo);
    const tipo = TIPOS[path.extname(alvo).toLowerCase()] ?? 'application/octet-stream';
    // Os arquivos com hash no nome sao imutaveis; o index.html nunca, ou o
    // deploy novo nao chega ao browser que ja tem o antigo em cache.
    const cache = alvo.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'content-type': tipo, 'cache-control': cache });
    res.end(conteudo);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('nao encontrado');
  }
}

type RotaCompilada = {
  metodo: string;
  segmentos: string[];
  nomes: (string | null)[];
  handler: (req: Requisicao, app: App) => Promise<Resultado>;
};

const compilar = (): RotaCompilada[] => ROTAS.map((r) => {
  const segmentos = r.padrao.split('/').filter(Boolean);
  return {
    metodo: r.metodo,
    segmentos: segmentos.map((s) => (s.startsWith(':') ? '*' : s)),
    nomes: segmentos.map((s) => (s.startsWith(':') ? s.slice(1) : null)),
    handler: r.handler,
  };
});

const COMPILADAS = compilar();

function casar(metodo: string, caminho: string): { rota: RotaCompilada; params: Record<string, string> } | null {
  const partes = caminho.split('/').filter(Boolean);
  for (const r of COMPILADAS) {
    if (r.metodo !== metodo || r.segmentos.length !== partes.length) continue;
    const params: Record<string, string> = {};
    let bate = true;
    for (let i = 0; i < partes.length; i++) {
      if (r.segmentos[i] === '*') params[r.nomes[i]!] = decodeURIComponent(partes[i]);
      else if (r.segmentos[i] !== partes[i]) { bate = false; break; }
    }
    if (bate) return { rota: r, params };
  }
  return null;
}

/** Existe caminho igual em OUTRO metodo? Separa 404 de 405. */
function caminhoExisteEmOutroMetodo(caminho: string): boolean {
  return COMPILADAS.some((r) => casar(r.metodo, caminho) !== null);
}

async function lerCorpo(req: IncomingMessage, max: number): Promise<any> {
  const pedacos: Buffer[] = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > max) throw Object.assign(new Error(`Corpo maior que ${max} bytes.`), { status: 413, name: 'CorpoGrandeDemais' });
    pedacos.push(p as Buffer);
  }
  if (total === 0) return undefined;
  const texto = Buffer.concat(pedacos).toString('utf8');
  try {
    return JSON.parse(texto);
  } catch {
    throw Object.assign(new Error('Corpo nao e JSON valido.'), { status: 400, name: 'JsonInvalido' });
  }
}

/**
 * CONEXAO FECHADA NO 413, e nao e educacao com o cliente - e correcao de um bug
 * medido no CI em 28/07.
 *
 * `lerCorpo` lanca NO MEIO do stream, assim que o acumulado passa do teto: e o
 * certo, porque acumular para depois recusar seria aceitar o ataque que o teto
 * existe para impedir. A consequencia e que o corpo da requisicao NAO e drenado.
 * O Node responde e destroi o socket, porque nao pode reusar uma conexao com
 * bytes nao lidos pendurados - e o cliente, que mantem keep-alive, so descobre
 * isso na requisicao SEGUINTE, que morre com ECONNRESET.
 *
 * O sintoma foi exatamente esse: o teste do 413 passava e o teste seguinte, de
 * outra rota, falhava com `TypeError: fetch failed / read ECONNRESET`. Passava
 * localmente e falhava no CI, que e a assinatura de corrida de timing.
 *
 * `Connection: close` transforma o encerramento em contrato: o cliente sabe que
 * aquela conexao acabou e abre outra. Nao ha como drenar um corpo de tamanho
 * arbitrario com seguranca, entao fechar e a resposta certa - e agora ela e
 * declarada em vez de ser um efeito colateral do socket morrendo.
 */
function responder(res: ServerResponse, r: Resultado): void {
  if (r.status === 413) res.setHeader('connection', 'close');
  if (r.status === 204 || r.corpo === undefined) { res.writeHead(r.status); res.end(); return; }
  // BigInt aparece em count do Postgres e quebra JSON.stringify sem replacer.
  // Decimal do Prisma tem toJSON proprio e sai como string - o que e o certo:
  // numero de ponto flutuante em JSON e exatamente o que a regra 1 proibe.
  const corpo = JSON.stringify(r.corpo, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(corpo);
}

export function criarServidor(o: OpcoesDoServidor): http.Server {
  const max = o.maxCorpoBytes ?? 1_000_000;
  const log = o.log ?? ((m, e) => console.error(m, e));
  const prefixo = o.prefixoApi ?? '/api';
  const raizEstatica = o.estaticos ? path.resolve(o.estaticos) : null;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://interno');
    const metodo = (req.method ?? 'GET').toUpperCase();

    // A API mora sob o prefixo; todo o resto e a SPA. Sem estaticos configurados
    // o servidor e so API, que e como as suites o usam.
    const naApi = url.pathname === prefixo || url.pathname.startsWith(prefixo + '/');
    if (!naApi) {
      if (raizEstatica) return servirEstatico(raizEstatica, url.pathname, res);
      return responder(res, { status: 404, corpo: {
        erro: 'RotaNaoEncontrada',
        mensagem: `${metodo} ${url.pathname} - a API responde sob ${prefixo}`,
      } });
    }
    const caminho = url.pathname.slice(prefixo.length) || '/';

    try {
      // Publica: e o que o front precisa ANTES de ter credencial. Fica antes do
      // autenticador de proposito - pedir token para descobrir como autenticar
      // seria circular.
      if (metodo === 'GET' && caminho === '/publico/config') return responder(res, configPublica());

      const achou = casar(metodo, caminho);
      if (!achou) {
        const status = caminhoExisteEmOutroMetodo(caminho) ? 405 : 404;
        return responder(res, { status, corpo: {
          erro: status === 405 ? 'MetodoNaoPermitido' : 'RotaNaoEncontrada',
          mensagem: `${metodo} ${caminho}`,
        } });
      }

      const authUserId = await o.autenticador(req);
      const corpo = await lerCorpo(req, max);

      // A traducao auth_user_id -> sessao. Fora de contexto de tenant, por
      // desenho: a policy de `usuario` exige app.current_usuario_id(), que e
      // justamente o que se esta descobrindo.
      const sessao: Sessao = await o.app.login(authUserId);

      const cabecalho = req.headers['x-tenant-id'];
      const tenantProposto = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;

      const requisicao: Requisicao = {
        metodo, caminho, params: achou.params, query: url.searchParams,
        corpo, sessao, tenantProposto: tenantProposto || undefined,
      };

      responder(res, await achou.rota.handler(requisicao, o.app));
    } catch (e: any) {
      if (ehInesperado(e)) log(`[financeiro] ${metodo} ${caminho} falhou:`, e);
      responder(res, traduzir(e));
    }
  });
}

/**
 * Sobe o servidor DEPOIS de conferir a role de runtime.
 *
 * A ordem importa: subir primeiro e conferir depois deixaria uma janela em que o
 * processo aceita requisicao conectado por uma role com BYPASSRLS.
 */
export async function iniciarServidor(o: OpcoesDoServidor & { porta?: number }): Promise<http.Server> {
  const { usuario } = await o.app.conferirRoleDeRuntime();
  const s = criarServidor(o);
  const porta = o.porta ?? Number(process.env.PORT ?? 3000);
  await new Promise<void>((resolve) => s.listen(porta, resolve));
  console.log(`[financeiro] ouvindo na ${porta}, conectado como "${usuario}"`);
  return s;
}
