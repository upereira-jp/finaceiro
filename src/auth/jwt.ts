// Verificacao de JWT do Supabase Auth. node:crypto puro, nenhuma dependencia.
//
// MT-06 RESOLVIDA em 27/07: auth PROPRIO, no projeto Supabase do financeiro.
// Nao ha SSO com o CRM - de la o financeiro so le lead ativo, e leitura de dado
// nao e motivo para acoplar identidade. A consequencia de desenho e que o
// `auth_user_id` de `usuario` e o `sub` do JWT deste projeto, e de nenhum outro.
//
// O QUE ESTE ARQUIVO PROTEGE, e por que ele nao e "so um jwt.verify":
//
// 1. CONFUSAO DE ALGORITMO. O ataque classico contra verificador de JWT e mandar
//    `alg` no header e o verificador obedecer. Se o servico verifica com chave
//    publica RSA/EC e o atacante manda um token HS256 assinado usando essa chave
//    publica como segredo HMAC, um verificador ingenuo aceita - a chave publica e
//    publica. Aqui o algoritmo sai da CHAVE CONFIGURADA, nunca do header: com
//    segredo simetrico so HS256 roda; com JWKS so o alg da propria chave roda. O
//    header e conferido contra essa escolha e descartado se divergir.
// 2. `alg: none` e recusado explicitamente, antes de qualquer outra coisa.
// 3. Comparacao de HMAC em tempo constante.
// 4. `exp` e OBRIGATORIA. Token sem expiracao nao vale - a ausencia do campo nao
//    pode significar "nunca expira".
// 5. `sub` tem que ser UUID: ele vai para app.resolver_login(uuid) e para coluna
//    uuid. String arbitraria abortaria a query com 22P02 em vez de 401.

import crypto from 'node:crypto';

export class TokenInvalido extends Error {
  readonly status = 401;
  constructor(motivo: string) {
    // A mensagem que sai para o cliente e sempre a mesma; o motivo fica no
    // `motivo` para o log. Dizer "assinatura invalida" versus "expirado" ao
    // chamador entrega mais informacao do que ele precisa para tentar de novo.
    super('Credencial invalida.');
    this.name = 'TokenInvalido';
    (this as any).motivo = motivo;
  }
}

export type Payload = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp: number;
  iat?: number;
  nbf?: number;
  role?: string;
  email?: string;
  [k: string]: unknown;
};

type Jwk = { kid?: string; kty: string; alg?: string; crv?: string; [k: string]: unknown };

export type Chaveiro =
  | { tipo: 'hs256'; segredo: string }
  | { tipo: 'jwks'; obter: (kid: string | undefined) => Promise<{ chave: crypto.KeyObject; alg: string }> };

export type OpcoesDeVerificacao = {
  chaveiro: Chaveiro;
  /** `iss` esperado. No Supabase e `<SUPABASE_URL>/auth/v1`. */
  emissor: string;
  /** `aud` esperada. No Supabase e 'authenticated' para usuario logado. */
  audiencia: string;
  /** Folga de relogio, nos dois sentidos. 60 s e o usual. */
  toleranciaSegundos?: number;
  /** Injetavel para teste. Em producao e Date.now. */
  agora?: () => number;
  /** Teto de tamanho. Token gigante nao chega a ser decodificado. */
  maxBytes?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGS_ASSIMETRICOS = new Set(['RS256', 'ES256']);

/** base64url estrito: rejeita padding e caractere de base64 comum (+ /). */
function decodificar(parte: string, o: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(parte)) throw new TokenInvalido(`${o} nao e base64url`);
  return Buffer.from(parte, 'base64url');
}

function json(b: Buffer, o: string): any {
  let v: unknown;
  try { v = JSON.parse(b.toString('utf8')); } catch { throw new TokenInvalido(`${o} nao e JSON`); }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new TokenInvalido(`${o} nao e objeto`);
  return v;
}

function conferirAssinatura(
  alg: string, assinado: string, assinatura: Buffer, chaveiro: Chaveiro,
  chaveAssimetrica?: crypto.KeyObject,
): void {
  const dados = Buffer.from(assinado, 'utf8');

  if (alg === 'HS256') {
    if (chaveiro.tipo !== 'hs256') throw new TokenInvalido('HS256 com chaveiro assimetrico');
    const esperada = crypto.createHmac('sha256', chaveiro.segredo).update(dados).digest();
    // Comprimento diferente ja e invalido, e timingSafeEqual lanca se diferir.
    if (assinatura.length !== esperada.length) throw new TokenInvalido('assinatura de tamanho errado');
    if (!crypto.timingSafeEqual(assinatura, esperada)) throw new TokenInvalido('assinatura HMAC nao confere');
    return;
  }

  if (!chaveAssimetrica) throw new TokenInvalido('sem chave para algoritmo assimetrico');

  // ES256 no JOSE e r||s cru (P1363); o default do Node e DER. Sem
  // dsaEncoding a verificacao falharia em TODO token valido.
  const ok = alg === 'ES256'
    ? crypto.verify('sha256', dados, { key: chaveAssimetrica, dsaEncoding: 'ieee-p1363' }, assinatura)
    : crypto.verify('sha256', dados, chaveAssimetrica, assinatura);
  if (!ok) throw new TokenInvalido(`assinatura ${alg} nao confere`);
}

export async function verificarJwt(token: string, o: OpcoesDeVerificacao): Promise<Payload> {
  const max = o.maxBytes ?? 8192;
  if (typeof token !== 'string' || token.length === 0) throw new TokenInvalido('token vazio');
  if (Buffer.byteLength(token, 'utf8') > max) throw new TokenInvalido('token acima do teto');

  const partes = token.split('.');
  if (partes.length !== 3) throw new TokenInvalido(`esperava 3 partes, veio ${partes.length}`);

  const header = json(decodificar(partes[0], 'header'), 'header');
  const alg = header.alg;
  if (typeof alg !== 'string') throw new TokenInvalido('header sem alg');
  if (alg === 'none' || alg.toLowerCase() === 'none') throw new TokenInvalido('alg none');

  // O ALGORITMO SAI DA CHAVE, NAO DO HEADER. Ver o cabecalho deste arquivo.
  let chaveAssimetrica: crypto.KeyObject | undefined;
  let algEsperado: string;
  if (o.chaveiro.tipo === 'hs256') {
    algEsperado = 'HS256';
  } else {
    const kid = typeof header.kid === 'string' ? header.kid : undefined;
    const r = await o.chaveiro.obter(kid);
    chaveAssimetrica = r.chave;
    algEsperado = r.alg;
    if (!ALGS_ASSIMETRICOS.has(algEsperado)) throw new TokenInvalido(`alg de chave nao suportado: ${algEsperado}`);
  }
  if (alg !== algEsperado) throw new TokenInvalido(`alg ${alg} divergente da chave (${algEsperado})`);

  const assinatura = decodificar(partes[2], 'assinatura');
  conferirAssinatura(algEsperado, `${partes[0]}.${partes[1]}`, assinatura, o.chaveiro, chaveAssimetrica);

  // So depois da assinatura conferida o payload e tratado como dado.
  const p = json(decodificar(partes[1], 'payload'), 'payload') as Payload;

  const agora = Math.floor((o.agora?.() ?? Date.now()) / 1000);
  const folga = o.toleranciaSegundos ?? 60;

  if (typeof p.exp !== 'number') throw new TokenInvalido('sem exp');
  if (agora > p.exp + folga) throw new TokenInvalido('expirado');
  if (typeof p.nbf === 'number' && agora + folga < p.nbf) throw new TokenInvalido('nbf no futuro');
  if (typeof p.iat === 'number' && agora + folga < p.iat) throw new TokenInvalido('iat no futuro');

  if (p.iss !== o.emissor) throw new TokenInvalido(`iss ${String(p.iss)} != ${o.emissor}`);

  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(o.audiencia)) throw new TokenInvalido(`aud ${JSON.stringify(p.aud)} != ${o.audiencia}`);

  if (typeof p.sub !== 'string' || !UUID.test(p.sub)) throw new TokenInvalido('sub nao e UUID');

  return p;
}

// ------------------------------------------------------------------ JWKS

export type OpcoesDeJwks = {
  url: string;
  ttlMs?: number;
  /** Injetavel para teste. Em producao e o fetch global. */
  buscar?: typeof fetch;
  agora?: () => number;
};

/**
 * Chaveiro por JWKS, com cache.
 *
 * O cache tem duas regras que nao sao detalhe:
 *   - `kid` desconhecido forca UMA rebusca, e no maximo uma a cada `ttlMs`.
 *     Sem esse teto, token com kid aleatorio vira amplificador: cada requisicao
 *     invalida custaria uma ida ao provedor de identidade.
 *   - rotacao de chave e o caso NORMAL, nao excepcional: e por isso que kid
 *     desconhecido rebusca em vez de recusar de cara.
 */
export function chaveiroJwks(o: OpcoesDeJwks): Chaveiro & { tipo: 'jwks' } {
  const ttl = o.ttlMs ?? 5 * 60_000;
  const buscar = o.buscar ?? fetch;
  const agora = o.agora ?? Date.now;

  let cache = new Map<string, { chave: crypto.KeyObject; alg: string }>();
  let carregadoEm = 0;
  let emVoo: Promise<void> | null = null;

  async function recarregar(): Promise<void> {
    if (emVoo) return emVoo;
    emVoo = (async () => {
      const r = await buscar(o.url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new TokenInvalido(`JWKS respondeu ${r.status}`);
      const corpo: any = await r.json();
      const chaves = Array.isArray(corpo?.keys) ? (corpo.keys as Jwk[]) : [];
      const nova = new Map<string, { chave: crypto.KeyObject; alg: string }>();
      for (const jwk of chaves) {
        const alg = typeof jwk.alg === 'string'
          ? jwk.alg
          : jwk.kty === 'EC' ? 'ES256' : jwk.kty === 'RSA' ? 'RS256' : '';
        if (!ALGS_ASSIMETRICOS.has(alg)) continue;   // HS no JWKS nao entra: seria confusao de algoritmo
        try {
          nova.set(jwk.kid ?? '', { chave: crypto.createPublicKey({ key: jwk as any, format: 'jwk' }), alg });
        } catch { /* chave malformada no conjunto nao invalida as outras */ }
      }
      cache = nova;
      carregadoEm = agora();
    })().finally(() => { emVoo = null; });
    return emVoo;
  }

  return {
    tipo: 'jwks',
    async obter(kid) {
      const chave = () => (kid !== undefined ? cache.get(kid) : (cache.size === 1 ? [...cache.values()][0] : undefined));
      let achada = chave();
      if (!achada && agora() - carregadoEm > ttl) {
        await recarregar();
        achada = chave();
      }
      if (!achada) throw new TokenInvalido(`kid desconhecido: ${kid ?? '(ausente)'}`);
      return achada;
    },
  };
}
