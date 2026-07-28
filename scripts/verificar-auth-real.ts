// Verificacao do auth PONTA A PONTA contra o Supabase real.
// RESUMO-SESSAO-7 §Fila item 2.
//
// O QUE ESTE SCRIPT EXISTE PARA MEDIR, e por que as 23 verificacoes do
// tests/auth-jwt.ts nao bastam: elas rodam contra um servidor local, com segredo
// de teste e um JWKS local. Provam a LOGICA do verificador - confusao de
// algoritmo, alg none, exp obrigatoria, tempo constante. Nao provam nenhuma
// suposicao sobre o Supabase de verdade, e foi exatamente esse tipo de suposicao
// que custou um ciclo com o IPv6.
//
// As tres perguntas, e nenhuma se responde por leitura de documentacao:
//   1. o `iss` que o Supabase realmente emite e o que autenticador.ts monta?
//   2. o projeto esta em chave legada HS256 ou em JWT signing keys?
//   3. o JWKS responde no caminho que chaveiroJwks() monta?
//
// MODO PREFLIGHT (sem token): responde 2 e 3, e nao precisa de credencial.
//   node --experimental-strip-types --env-file=.env scripts/verificar-auth-real.ts
//
// MODO COMPLETO (token no stdin): responde tambem 1, e segue ate o banco -
// verifica o JWT pelo caminho de producao e resolve o login pela role de
// runtime, que e o que prova que app_financeiro_login executa resolver_login.
//   pbpaste | node --experimental-strip-types --env-file=.env scripts/verificar-auth-real.ts
//
// O token entra por STDIN de proposito: em argv ele fica no historico do shell e
// na tabela de processos. Ele e uma credencial viva ate o `exp`.

import { autenticadorDoAmbiente } from '../src/auth/autenticador.ts';
import { TokenInvalido } from '../src/auth/jwt.ts';

let falhas = 0;
const ok   = (m: string) => console.log(`  ok    ${m}`);
const erro = (m: string) => { falhas++; console.log(`  FALHA ${m}`); };
const nota = (m: string) => console.log(`        ${m}`);

async function lerStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const partes: Buffer[] = [];
  for await (const c of process.stdin) partes.push(c as Buffer);
  return Buffer.concat(partes).toString('utf8').trim();
}

/** Decodifica sem verificar, SO para diagnostico de divergencia. Nunca confie. */
function espiar(token: string): { header: any; payload: any } | null {
  const p = token.split('.');
  if (p.length !== 3) return null;
  try {
    return {
      header:  JSON.parse(Buffer.from(p[0], 'base64url').toString('utf8')),
      payload: JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')),
    };
  } catch { return null; }
}

async function main(): Promise<void> {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  console.log('\n== 1. configuracao ==');
  if (!base) {
    erro('SUPABASE_URL ausente no ambiente. Ver .env.example.');
    process.exit(1);
  }
  ok(`SUPABASE_URL = ${base}`);

  const emissorEsperado = `${base}/auth/v1`;
  const urlJwks = `${emissorEsperado}/.well-known/jwks.json`;
  nota(`iss esperado  = ${emissorEsperado}`);
  nota(`jwks esperado = ${urlJwks}`);

  if (process.env.SUPABASE_JWT_SECRET) {
    nota('SUPABASE_JWT_SECRET PRESENTE: a verificacao usara HS256 simetrico.');
    nota('Com ele o servidor tambem consegue ASSINAR - quem o ler forja token de');
    nota('qualquer usuario. Prefira o JWKS assimetrico e remova a variavel.');
  } else {
    ok('SUPABASE_JWT_SECRET ausente - caminho preferido, o servidor so VERIFICA');
  }

  console.log('\n== 2. JWKS do projeto (pergunta 2 e 3) ==');
  let temChaveAssimetrica = false;
  try {
    const r = await fetch(urlJwks, { headers: { accept: 'application/json' } });
    if (!r.ok) {
      erro(`JWKS respondeu ${r.status} - chaveiroJwks() lancaria TokenInvalido aqui`);
      if (r.status === 404) nota('404 costuma significar projeto ainda em chave legada HS256.');
    } else {
      const corpo: any = await r.json();
      const chaves: any[] = Array.isArray(corpo?.keys) ? corpo.keys : [];
      ok(`JWKS respondeu 200 com ${chaves.length} chave(s)`);
      for (const k of chaves) {
        const alg = k.alg ?? (k.kty === 'EC' ? 'ES256' : k.kty === 'RSA' ? 'RS256' : '?');
        const aceita = alg === 'ES256' || alg === 'RS256';
        (aceita ? ok : erro)(`kid=${k.kid ?? '(ausente)'} kty=${k.kty} alg=${alg}` +
          (aceita ? '' : ' - chaveiroJwks() DESCARTA esta chave'));
        if (aceita) temChaveAssimetrica = true;
      }
      if (temChaveAssimetrica) {
        nota('Projeto em JWT signing keys (assimetrico). E o caminho preferido.');
      } else {
        erro('Nenhuma chave assimetrica utilizavel no conjunto.');
      }
    }
  } catch (e: any) {
    erro(`falha de rede ao buscar o JWKS: ${e?.message ?? e}`);
  }

  const token = await lerStdin();
  if (!token) {
    console.log('\n== 3. token ==');
    nota('Nenhum token no stdin - preflight so. A pergunta 1 (o `iss` real) fica');
    nota('ABERTA: ela so se responde com um token emitido pelo Supabase.');
    nota('Emita um com um login real e repita mandando o access_token no stdin.');
    console.log(`\n${falhas === 0 ? 'PREFLIGHT OK' : `${falhas} FALHA(S)`}\n`);
    process.exit(falhas === 0 ? 0 : 1);
  }

  console.log('\n== 3. o que o token diz (NAO verificado - diagnostico) ==');
  const cru = espiar(token);
  if (!cru) {
    erro('token nao tem tres partes base64url decodificaveis');
  } else {
    nota(`alg = ${cru.header?.alg}   kid = ${cru.header?.kid ?? '(ausente)'}`);
    nota(`iss = ${cru.payload?.iss}`);
    nota(`aud = ${JSON.stringify(cru.payload?.aud)}`);
    nota(`sub = ${cru.payload?.sub}`);
    if (typeof cru.payload?.exp === 'number') {
      const restam = cru.payload.exp - Math.floor(Date.now() / 1000);
      nota(`exp em ${restam}s ${restam <= 0 ? '- JA EXPIRADO' : ''}`);
    }
    // A PERGUNTA 1, medida.
    if (cru.payload?.iss === emissorEsperado) {
      ok('o `iss` emitido bate com o que autenticador.ts monta');
    } else {
      erro(`iss divergente. emitido "${cru.payload?.iss}" != esperado "${emissorEsperado}"`);
      nota('Se o emitido for o do CRM, o SUPABASE_URL esta apontando para o');
      nota('projeto errado - e todo token do CRM viraria sessao valida aqui.');
    }
  }

  console.log('\n== 4. verificacao pelo caminho de PRODUCAO ==');
  let sub = '';
  try {
    const autenticar = autenticadorDoAmbiente();
    sub = await autenticar({ headers: { authorization: `Bearer ${token}` } } as any);
    ok(`token verificado. sub = ${sub}`);
  } catch (e: any) {
    if (e instanceof TokenInvalido) {
      erro(`recusado: ${(e as any).motivo}`);
      nota(`(o cliente receberia apenas "${e.message}" - J23)`);
    } else {
      erro(`${e?.name}: ${e?.message}`);
    }
    console.log(`\n${falhas} FALHA(S)\n`);
    process.exit(1);
  }

  console.log('\n== 5. login no banco, pela role de runtime ==');
  const { app, encerrarApp } = await import('../src/app.ts');
  try {
    const a = app();
    const { usuario } = await a.conferirRoleDeRuntime();
    ok(`conectado como "${usuario}" - sem BYPASSRLS, sem SUPERUSER`);

    const sessao = await a.login(sub);
    ok(`login resolvido: ${sessao.nome} <${sessao.email}>`);
    nota(`tier    = ${sessao.tier ?? '(nenhum)'}`);
    nota(`tenants = ${sessao.tenants.length === 0
      ? '(nenhum)'
      : sessao.tenants.map((t) => `${t.razaoSocial}:${t.papel}`).join(', ')}`);

    if (sessao.tenants.length === 0 && !sessao.tier) {
      erro('sem tier e sem vinculo: autenticado, mas sem alcance a nada');
    }
  } catch (e: any) {
    if (e?.name === 'UsuarioNaoProvisionado') {
      erro('UsuarioNaoProvisionado - o token e valido, mas nao ha linha em `usuario`');
      nota(`Rode o bootstrap com auth_user_id='${sub}'.`);
      nota('Ver scripts/bootstrap-plataforma-admin.sql.');
    } else {
      erro(`${e?.name}: ${e?.message}`);
    }
  } finally {
    await encerrarApp();
  }

  console.log(`\n${falhas === 0 ? 'PONTA A PONTA OK' : `${falhas} FALHA(S)`}\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
