// Verificacao de JWT: os casos validos e os ATAQUES que o modulo diz impedir.
// Uso: bash tests/repos.sh
//
// Invariante sem teste e comentario (CLAUDE.md 8). O cabecalho de src/auth/jwt.ts
// afirma cinco protecoes; cada uma tem um teste que falha se a protecao sair.

import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { verificarJwt, chaveiroJwks, TokenInvalido } from '../src/auth/jwt.ts';
import { autenticadorSupabase } from '../src/auth/autenticador.ts';
import { criarServidor } from '../src/http/servidor.ts';
import { criarApp } from '../src/app.ts';

const CONN = process.env.TEST_DATABASE_URL!;
const A = process.env.TEST_TENANT_A!;
const AUTH_ADM = process.env.TEST_AUTH_ADMIN!;

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EMISSOR = 'https://projeto.supabase.co/auth/v1';
const SEGREDO = 'segredo-do-projeto-que-e-longo-o-bastante';
const AGORA = 1_800_000_000_000;              // fixo: teste com relogio real envelhece
const agora = () => AGORA;
const seg = Math.floor(AGORA / 1000);
const SUB = '0a0a0001-0000-4000-8000-00000000000a';

const payloadBase = (extra: Record<string, unknown> = {}) => ({
  sub: SUB, iss: EMISSOR, aud: 'authenticated', iat: seg - 10, exp: seg + 3600, role: 'authenticated', ...extra,
});

function assinarHs256(payload: unknown, segredo = SEGREDO, header: Record<string, unknown> = {}) {
  const h = b64({ alg: 'HS256', typ: 'JWT', ...header });
  const p = b64(payload);
  const s = crypto.createHmac('sha256', segredo).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

const hs = { tipo: 'hs256' as const, segredo: SEGREDO };
const opcoes = { chaveiro: hs, emissor: EMISSOR, audiencia: 'authenticated', agora };

// ------------------------------------------------- J1 token valido
{
  const p = await verificarJwt(assinarHs256(payloadBase()), opcoes);
  chk('J1', p.sub === SUB, `HS256 valido devolve o sub (veio ${p.sub})`);
}

// ------------------------------------------------- J2 assinatura adulterada
{
  const t = assinarHs256(payloadBase());
  const [h, p] = t.split('.');
  const forjado = `${h}.${b64(payloadBase({ sub: '99999999-0000-4000-8000-00000000000f' }))}.${t.split('.')[2]}`;
  const e = await lancou(() => verificarJwt(forjado, opcoes));
  chk('J2', e instanceof TokenInvalido, `payload trocado com assinatura antiga e recusado (veio ${e?.name})`);
}

// ------------------------------------------------- J3 alg none
{
  const h = b64({ alg: 'none', typ: 'JWT' });
  const e = await lancou(() => verificarJwt(`${h}.${b64(payloadBase())}.`, opcoes));
  chk('J3', e instanceof TokenInvalido, `alg "none" recusado (veio ${e?.name})`);
}

// ------------------------------------------------- J4 segredo errado
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase(), 'outro-segredo-qualquer'), opcoes));
  chk('J4', e instanceof TokenInvalido, 'assinado com outro segredo e recusado');
}

// ------------------------------------------------- J5 expirado (alem da folga)
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase({ exp: seg - 120 })), opcoes));
  chk('J5', e instanceof TokenInvalido && /expirado/.test((e as any).motivo), 'token expirado e recusado');
}

// ------------------------------------------------- J6 recem-expirado passa na folga
{
  const p = await verificarJwt(assinarHs256(payloadBase({ exp: seg - 30 })), opcoes);
  chk('J6', p.sub === SUB, 'exp vencida ha 30 s passa na tolerancia de 60 s (relogio dessincronizado)');
}

// ------------------------------------------------- J7 sem exp
{
  const semExp: any = payloadBase(); delete semExp.exp;
  const e = await lancou(() => verificarJwt(assinarHs256(semExp), opcoes));
  chk('J7', e instanceof TokenInvalido && /sem exp/.test((e as any).motivo),
      'token SEM exp e recusado - ausencia nao pode significar "nunca expira"');
}

// ------------------------------------------------- J8 nbf no futuro
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase({ nbf: seg + 600 })), opcoes));
  chk('J8', e instanceof TokenInvalido, 'nbf no futuro e recusado');
}

// ------------------------------------------------- J9 emissor errado
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase({ iss: 'https://crm.supabase.co/auth/v1' })), opcoes));
  chk('J9', e instanceof TokenInvalido,
      'token do OUTRO projeto (o CRM) e recusado - auth proprio significa emissor proprio');
}

// ------------------------------------------------- J10 audiencia errada
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase({ aud: 'anon' })), opcoes));
  chk('J10', e instanceof TokenInvalido, 'aud "anon" e recusada - so "authenticated" entra');
}

// ------------------------------------------------- J11 sub nao-UUID
{
  const e = await lancou(() => verificarJwt(assinarHs256(payloadBase({ sub: 'nao-e-uuid' })), opcoes));
  chk('J11', e instanceof TokenInvalido && /UUID/.test((e as any).motivo),
      'sub fora do formato UUID e 401 aqui, nao 22P02 no banco depois');
}

// ------------------------------------------------- J12 formato quebrado
{
  const casos = ['', 'a.b', 'a.b.c.d', 'nao-e-jwt', 'a.b.c'];
  const todos = await Promise.all(casos.map((t) => lancou(() => verificarJwt(t, opcoes))));
  chk('J12', todos.every((e) => e instanceof TokenInvalido),
      `token malformado e recusado em ${casos.length} formas`);
}

// ------------------------------------------------- J13 teto de tamanho
{
  const gigante = assinarHs256(payloadBase({ lixo: 'x'.repeat(20_000) }));
  const e = await lancou(() => verificarJwt(gigante, opcoes));
  chk('J13', e instanceof TokenInvalido && /teto/.test((e as any).motivo),
      'token acima do teto morre antes de ser decodificado');
}

// ------------------------------------------------- JWKS assimetrico
const par = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwkPublica = { ...par.publicKey.export({ format: 'jwk' }), kid: 'chave-1', alg: 'ES256', use: 'sig' };
let buscas = 0;
const servidorJwks = http.createServer((_req, res) => {
  buscas++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [jwkPublica] }));
});
await new Promise<void>((r) => servidorJwks.listen(0, r));
const urlJwks = `http://127.0.0.1:${(servidorJwks.address() as AddressInfo).port}/jwks.json`;

function assinarEs256(payload: unknown, kid = 'chave-1') {
  const h = b64({ alg: 'ES256', typ: 'JWT', kid });
  const p = b64(payload);
  const s = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: par.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${s.toString('base64url')}`;
}

const jwks = chaveiroJwks({ url: urlJwks, agora });
const opcoesJwks = { chaveiro: jwks, emissor: EMISSOR, audiencia: 'authenticated', agora };

// ------------------------------------------------- J14 ES256 valido
{
  const p = await verificarJwt(assinarEs256(payloadBase()), opcoesJwks);
  chk('J14', p.sub === SUB, `ES256 por JWKS valida (veio ${p.sub})`);
}

// ------------------------------------------------- J15 CONFUSAO DE ALGORITMO
{
  // O ataque classico: a chave publica e publica. O atacante a usa como segredo
  // HMAC e manda alg=HS256. Verificador que obedece o header aceita.
  const publicaComoSegredo = par.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const forjado = assinarHs256(payloadBase({ sub: '99999999-0000-4000-8000-00000000000f' }), publicaComoSegredo);
  const e = await lancou(() => verificarJwt(forjado, opcoesJwks));
  chk('J15', e instanceof TokenInvalido && /divergente|assimetrico/.test((e as any).motivo),
      'HS256 assinado com a chave PUBLICA e recusado - o alg sai da chave, nao do header');
}

// ------------------------------------------------- J16 kid desconhecido
{
  const e = await lancou(() => verificarJwt(assinarEs256(payloadBase(), 'kid-que-nao-existe'), opcoesJwks));
  chk('J16', e instanceof TokenInvalido && /kid desconhecido/.test((e as any).motivo), 'kid fora do JWKS e recusado');
}

// ------------------------------------------------- J17 o JWKS e cacheado
{
  const antes = buscas;
  await verificarJwt(assinarEs256(payloadBase()), opcoesJwks);
  await verificarJwt(assinarEs256(payloadBase()), opcoesJwks);
  await lancou(() => verificarJwt(assinarEs256(payloadBase(), 'outro-kid'), opcoesJwks));
  chk('J17', buscas === antes,
      `dentro do TTL o JWKS nao e rebuscado, nem por kid desconhecido (${buscas - antes} buscas)`);
}

// ------------------------------------------------- J18 token ES256 num chaveiro HS256
{
  const e = await lancou(() => verificarJwt(assinarEs256(payloadBase()), opcoes));
  chk('J18', e instanceof TokenInvalido, 'ES256 apresentado a um chaveiro simetrico e recusado');
}

// ------------------------------------------------- ponta a ponta pelo HTTP
const app = criarApp(CONN);
const servidor = criarServidor({
  app,
  autenticador: autenticadorSupabase({
    supabaseUrl: 'https://projeto.supabase.co', jwtSecret: SEGREDO, agora,
  }),
  log: () => {},
});
await new Promise<void>((r) => servidor.listen(0, r));
const porta = (servidor.address() as AddressInfo).port;

const pedir = (headers: Record<string, string>): Promise<{ status: number; corpo: any }> =>
  // A API mora sob /api desde 28/07, para dividir origem com a SPA sem CORS.
  fetch(`http://127.0.0.1:${porta}/api/sessao`, { headers })
    .then(async (r) => ({ status: r.status, corpo: (await r.json()) as any }));

// ------------------------------------------------- J19 Bearer valido entra
{
  const t = assinarHs256(payloadBase({ sub: AUTH_ADM }));
  const r = await pedir({ authorization: `Bearer ${t}` });
  chk('J19', r.status === 200 && r.corpo.tenants.length === 2,
      `Bearer valido chega a sessao com os vinculos (veio ${r.status})`);
}

// ------------------------------------------------- J20 esquema case-insensitive
{
  const t = assinarHs256(payloadBase({ sub: AUTH_ADM }));
  const r = await pedir({ authorization: `bearer   ${t}` });
  chk('J20', r.status === 200, `"bearer" minusculo com espacos extras e aceito, como manda a RFC 7235 (veio ${r.status})`);
}

// ------------------------------------------------- J21 sem header = 401 sem detalhe
{
  const r = await pedir({});
  chk('J21', r.status === 401 && r.corpo.mensagem === 'Credencial invalida.',
      `sem Authorization da 401 com mensagem generica (veio ${r.status}: ${r.corpo?.mensagem})`);
}

// ------------------------------------------------- J22 sub valido mas nao provisionado
{
  const t = assinarHs256(payloadBase({ sub: '77770000-0000-4000-8000-00000000000f' }));
  const r = await pedir({ authorization: `Bearer ${t}` });
  chk('J22', r.status === 403 && r.corpo.erro === 'UsuarioNaoProvisionado',
      `token legitimo de quem nao tem linha em usuario da 403 sem confirmar o auth_user_id (veio ${r.status})`);
}

// ------------------------------------------------- J23 o motivo nao vaza
{
  const r = await pedir({ authorization: `Bearer ${assinarHs256(payloadBase({ exp: seg - 9999 }))}` });
  const texto = JSON.stringify(r.corpo);
  chk('J23', r.status === 401 && !/expirad|assinatura|iss|aud|kid/i.test(texto),
      `401 nao diz PORQUE o token e invalido (corpo: ${texto})`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await new Promise<void>((r) => servidor.close(() => r()));
await new Promise<void>((r) => servidorJwks.close(() => r()));
await app.encerrar();
process.exit(falhas === 0 ? 0 : 1);
