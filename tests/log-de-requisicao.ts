// O LOG POR REQUISICAO (`src/http/log-de-requisicao.ts`). Sem banco.
// Uso: node --experimental-strip-types tests/log-de-requisicao.ts
//
// Sobe o servidor DE VERDADE numa porta efemera, com um `App` falso cujo `login`
// devolve uma sessao fixa. A rota exercida e `GET /sessao`, que responde so com
// a sessao e nao toca o banco — o que deixa a suite medir o caminho inteiro
// (casamento da rota, autenticacao, resposta, evento `finish`) sem PostgreSQL.
//
// O que ela prende, alem de "sai uma linha":
//   - a query string NUNCA chega ao log (LR4, LR7): a busca no servidor manda
//     nome de cliente por ela;
//   - o tenant do log e o que a sessao de fato escolheu, nunca o cabecalho cru
//     (LR3): um uuid forjado em `X-Tenant-ID` nao vira linha de "trabalhou no
//     tenant X";
//   - uma falha do log nao derruba o pedido (LR9);
//   - o composition root nao troca o log real por um no-op (LR12).

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { criarServidor } from '../src/http/servidor.ts';
import {
  montarLinha, logDeRequisicaoPadrao, type LinhaDeRequisicao, type ContextoDaRequisicao,
} from '../src/http/log-de-requisicao.ts';
import type { Sessao } from '../src/auth/sessao.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const FORJADO = '99999999-9999-4999-8999-999999999999';
const USUARIO = '33333333-3333-4333-8333-333333333333';

const sessaoDe = (tenants: Sessao['tenants'], tier: Sessao['tier'] = null): Sessao => ({
  usuarioId: USUARIO, nome: 'Pessoa de Teste', email: 'teste@exemplo.invalid', tier, tenants,
});
const UM_TENANT = sessaoDe([{ tenantId: TENANT_A, razaoSocial: 'A', papel: 'financeiro', setores: [] as any }]);
const DOIS_TENANTS = sessaoDe([
  { tenantId: TENANT_A, razaoSocial: 'A', papel: 'financeiro', setores: [] as any },
  { tenantId: TENANT_B, razaoSocial: 'B', papel: 'leitura', setores: [] as any },
]);

let sessaoAtual: Sessao = UM_TENANT;
const appFalso = { login: async (_authUserId: string) => sessaoAtual } as any;

/* Autenticador de teste: sem o cabecalho, recusa como o real recusa — com o
 * `TokenInvalido` de status 401 que `traduzir` conhece. */
const autenticador = async (req: any): Promise<string> => {
  const h = req.headers['x-teste-auth'];
  if (!h) throw Object.assign(new Error('Credencial invalida.'), { status: 401, name: 'TokenInvalido', motivo: 'sem token' });
  return String(h);
};

const linhas: LinhaDeRequisicao[] = [];
let logQuebrado = false;
const servidor = criarServidor({
  app: appFalso,
  autenticador,
  log: () => {},
  logRequisicao: (l) => {
    if (logQuebrado) throw new Error('o destino do log caiu');
    linhas.push(l);
  },
});
await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

/** Faz o pedido e espera a linha correspondente (o `finish` vem depois do corpo). */
async function pedir(caminho: string, cab: Record<string, string> = {}): Promise<{ status: number; linhasNovas: LinhaDeRequisicao[] }> {
  const antes = linhas.length;
  const r = await fetch(base + caminho, { headers: cab });
  await r.arrayBuffer();
  await new Promise((ok) => setTimeout(ok, 20));
  return { status: r.status, linhasNovas: linhas.slice(antes) };
}

try {
  // ------------------------------------------------------------------ o caso comum
  {
    sessaoAtual = UM_TENANT;
    const { status, linhasNovas } = await pedir('/api/sessao', { 'x-teste-auth': 'u1', 'x-tenant-id': TENANT_A });
    const l = linhasNovas[0];
    chk('LR1', status === 200 && linhasNovas.length === 1,
        `um pedido, UMA linha — \`finish\` e \`close\` disparam os dois numa resposta normal (${linhasNovas.length})`);
    chk('LR2', l?.rota === '/sessao' && l.status === 200 && l.modo === 'sessao' && l.metodo === 'GET'
        && l.tenant === TENANT_A && l.papel === 'financeiro' && l.usuario === USUARIO
        && typeof l.ms === 'number' && l.ms >= 0 && l.caminho === undefined && l.tier === undefined,
        `a linha tem rota (padrao), status, modo, tenant, papel, usuario e duracao: ${JSON.stringify(l)}`);
  }

  // ------------------------------------------------- o tenant e o escolhido, nao o pedido
  {
    sessaoAtual = UM_TENANT;
    const { linhasNovas } = await pedir('/api/sessao', { 'x-teste-auth': 'u1', 'x-tenant-id': FORJADO });
    const l = linhasNovas[0];
    chk('LR3', l?.tenant === null && l.papel === null && !JSON.stringify(l).includes(FORJADO),
        'X-Tenant-ID fora da sessao NAO vai para o log: a linha sai sem tenant, e o uuid forjado nao aparece');
  }

  // ----------------------------------------------------------- a query nunca entra
  {
    sessaoAtual = UM_TENANT;
    const { linhasNovas } = await pedir('/api/sessao?busca=Fulano%20da%20Silva&cpf=12345678900',
      { 'x-teste-auth': 'u1' });
    const txt = JSON.stringify(linhasNovas);
    chk('LR4', linhasNovas.length === 1 && !txt.includes('Fulano') && !txt.includes('12345678900') && !txt.includes('busca'),
        'a query string (nome, documento) nao chega ao log — sai o padrao da rota, nao o caminho pedido');
    chk('LR5', linhasNovas[0]?.tenant === TENANT_A,
        'sem X-Tenant-ID e com UM vinculo, o tenant e o unico — a mesma regra de selecionarTenant');
  }

  // ------------------------------------------------- dois vinculos e escolha pendente
  {
    sessaoAtual = DOIS_TENANTS;
    const { linhasNovas } = await pedir('/api/sessao', { 'x-teste-auth': 'u1' });
    chk('LR6', linhasNovas[0]?.tenant === null && linhasNovas[0]?.usuario === USUARIO,
        'com dois vinculos e sem escolha, o log nao adivinha o tenant (mas sabe quem pediu)');
    const b = await pedir('/api/sessao', { 'x-teste-auth': 'u1', 'x-tenant-id': TENANT_B });
    chk('LR6b', b.linhasNovas[0]?.tenant === TENANT_B && b.linhasNovas[0]?.papel === 'leitura',
        'com a escolha feita, sai o papel DAQUELE vinculo — o papel e por tenant, nao por pessoa');
  }

  // ------------------------------------------------------------ rota que nao existe
  {
    const { status, linhasNovas } = await pedir('/api/nao-existe/abc?cpf=12345678900');
    const l = linhasNovas[0];
    chk('LR7', status === 404 && l?.rota === null && l.caminho === '/nao-existe/abc'
        && !JSON.stringify(l).includes('12345678900') && l.usuario === null && l.modo === null,
        `nenhuma rota casou: sai o caminho pedido, SEM a query, e sem usuario: ${JSON.stringify(l)}`);
    const longo = '/x'.repeat(200);
    const lg = await pedir(`/api${longo}`);
    chk('LR7b', lg.linhasNovas[0]?.caminho?.length === 120,
        'o caminho de rota inexistente sai cortado em 120 caracteres');
  }

  // --------------------------------------------------------------------- o 401
  {
    const { status, linhasNovas } = await pedir('/api/sessao');
    const l = linhasNovas[0];
    chk('LR8', status === 401 && l?.status === 401 && l.rota === '/sessao' && l.usuario === null && l.tenant === null,
        'sem credencial: a linha registra o 401 na rota certa, sem usuario');
  }

  // ------------------------------------------------- o log nao derruba o pedido
  {
    sessaoAtual = UM_TENANT;
    logQuebrado = true;
    const r = await fetch(base + '/api/sessao', { headers: { 'x-teste-auth': 'u1' } });
    const corpo = await r.json() as any;
    logQuebrado = false;
    chk('LR9', r.status === 200 && corpo?.usuarioId === USUARIO,
        'o destino do log levantando NAO muda a resposta: o log roda depois dela e morre calado');
  }

  // -------------------------------------------------- os estaticos nao geram linha
  {
    const { linhasNovas } = await pedir('/contratos');
    chk('LR10', linhasNovas.length === 0,
        'fora do prefixo da API (a SPA) nao ha linha — a tela puxa uma duzia de arquivos por carga');
  }
} finally {
  await new Promise<void>((r) => servidor.close(() => r()));
}

// ------------------------------------------------------------ montarLinha, pura
{
  const ctx: ContextoDaRequisicao = {
    inicio: 0n, metodo: 'POST', naApi: true, caminho: '/liquidacoes/webhook-sicoob/x',
    rota: '/liquidacoes/webhook-sicoob/:tenant', modo: 'webhook',
    sessao: sessaoDe([{ tenantId: TENANT_A, razaoSocial: 'A', papel: 'cobranca', setores: [] as any }]),
    tenantProposto: TENANT_A,
  };
  const l = montarLinha(ctx, 200, 12.6);
  chk('LR11', l.modo === 'webhook' && l.tenant === TENANT_A && l.papel === 'cobranca' && l.ms === 13 && l.abortado === undefined,
      'webhook: o tenant vem do caminho e o papel e o do usuario de servico; ms arredonda');
  const a = montarLinha({ ...ctx, sessao: sessaoDe(UM_TENANT.tenants, 'plataforma_admin') }, 200, -3, true);
  chk('LR11b', a.abortado === true && a.ms === 0 && a.tier === 'plataforma_admin',
      'cliente que desistiu sai marcado `abortado`; duracao nunca negativa; o tier de plataforma aparece');
}

// ---------------------------------------------- uma linha no journal e uma linha so
{
  const capturado: string[] = [];
  const original = console.log;
  console.log = (...a: unknown[]) => { capturado.push(a.map(String).join(' ')); };
  try {
    logDeRequisicaoPadrao(montarLinha({ inicio: 0n, metodo: 'GET', naApi: true, caminho: '/a\nFALSO {"status":200}' }, 404, 1));
  } finally {
    console.log = original;
  }
  const linha = capturado[0] ?? '';
  const json = linha.replace(/^\[financeiro\] requisicao /, '');
  let parseou = false;
  try { parseou = JSON.parse(json).status === 404; } catch { parseou = false; }
  chk('LR12', capturado.length === 1 && !linha.includes('\n') && linha.startsWith('[financeiro] requisicao ') && parseou,
      'o destino padrao imprime UMA linha, com prefixo e JSON que o jq le — quebra de linha no caminho nao forja outra');
}

// ------------------------------------------------ o composition root usa o log real
{
  const servir = readFileSync(new URL('../scripts/servir.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  chk('LR13', !/logRequisicao\s*:/.test(servir) || /logRequisicao:\s*logDeRequisicaoPadrao\b/.test(servir),
      '`scripts/servir.ts` nao troca o log de requisicao por uma lambda propria (a licao do HL-3)');
}

console.log();
if (falhas > 0) { console.log(`--- log de requisicao: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- log de requisicao (rota, tenant, papel, duracao, status; sem query, sem corpo): ${feitas} verificacoes, 0 falhas`);
