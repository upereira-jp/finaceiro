// O ACESSO DE UMA PESSOA — papel, setores e o cadastro — e a conta de login no
// Supabase Auth. Sem banco e sem rede.
// Uso: node --experimental-strip-types tests/acesso.ts
//
// DUAS METADES, e a segunda e a que so este arquivo cobre:
//
//   1. as regras de `src/dominio/acesso.ts` — o que a tela de Administracao
//      recusa antes de gravar. A mais importante e a que o BANCO NAO PEGA:
//      quem administra tirando de si mesmo a Administracao (AC12–AC14);
//   2. o cliente da API administrativa do Supabase Auth, com um `fetch` falso:
//      os caminhos de "e-mail ja existe", a chave que NUNCA aparece numa
//      mensagem de erro, e o processo que sobe sem a chave.

import {
  normalizarSetores, setoresDoLogin, conferirCombinacao, conferirMudanca, lerPessoaNova,
  ehContaDeServico, SETORES, SETORES_PADRAO, SENHA_MINIMA,
} from '../src/dominio/acesso.ts';
import { emailDoServico } from '../src/auth/usuario-de-servico.ts';
import {
  contasSupabase, contasDoAmbiente, FalhaNoSupabaseAuth, CadastroDeLoginIndisponivel,
} from '../src/auth/contas-de-acesso.ts';
import { traduzir } from '../src/http/erros.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const lanca = (f: () => unknown, tipo: Function = TypeError): boolean => {
  try { f(); return false; } catch (e) { return e instanceof tipo; }
};
const mesma = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);

// ============================================================ 1. as regras

chk('AC1', mesma(SETORES, ['rateio', 'empresa', 'administracao']),
    'tres setores, na ordem do menu — e a lista do CHECK da migration 41');
chk('AC2', mesma(normalizarSetores(['administracao', 'rateio', 'rateio']), ['rateio', 'administracao']),
    'setores normalizados: sem repeticao e na ordem canonica, venha como vier');
chk('AC3', lanca(() => normalizarSetores(['rateio', 'diretoria'])),
    'setor que a tela nao conhece: recusado antes do banco');
chk('AC4', lanca(() => normalizarSetores([])) && lanca(() => normalizarSetores('rateio')),
    'lista vazia ou que nao e lista: recusada — tirar acesso e desligar, nao desmarcar tudo');

chk('AC5', mesma(setoresDoLogin(undefined), SETORES_PADRAO) && mesma(setoresDoLogin(null), SETORES_PADRAO),
    'login contra o banco ANTES da migration 41 (sem a coluna): os dois setores financeiros, sem erro');
chk('AC6', mesma(setoresDoLogin(['empresa', 'lixo']), ['empresa'])
        && mesma(setoresDoLogin([]), SETORES_PADRAO),
    'login le com tolerancia: descarta o desconhecido, e nunca desenha a barra vazia');

chk('AC7', conferirCombinacao('financeiro', ['rateio', 'administracao'])?.erro === 'AdministracaoExigeAdmin'
        && conferirCombinacao('admin', ['administracao']) === null,
    'a Administracao so com o perfil Administrador — o mesmo CHECK do banco, com a frase para quem opera');

// A mudanca de acesso de OUTRA pessoa: o que o banco aceita, aceita.
chk('AC8', conferirMudanca({ ehVoceMesmo: false, papel: 'admin', setores: ['rateio'], ativo: false }) === null,
    'desligar outra pessoa, ou tirar a Administracao dela: permitido');
chk('AC9', conferirMudanca({ ehVoceMesmo: false, papel: 'leitura', setores: ['administracao'], ativo: true })
          ?.erro === 'AdministracaoExigeAdmin',
    'dar a Administracao a quem nao e Administrador: recusado');

// A mudanca no PROPRIO acesso: o que o banco aceitaria e trancaria a pessoa para fora.
chk('AC10', conferirMudanca({ ehVoceMesmo: true, papel: 'admin', setores: ['empresa', 'administracao'], ativo: true })
          === null,
    'mudar os proprios setores financeiros, mantendo a Administracao: permitido');
chk('AC11', conferirMudanca({ ehVoceMesmo: true, papel: 'admin', setores: ['rateio', 'empresa'], ativo: true })
          ?.erro === 'NaoPodeTirarAPropriaAdministracao',
    'tirar de si mesmo a Administracao: recusado — a pasta sumiria no proximo clique');
chk('AC12', conferirMudanca({ ehVoceMesmo: true, papel: 'financeiro', setores: ['rateio'], ativo: true })
          ?.erro === 'NaoPodeTirarAPropriaAdministracao',
    'rebaixar o proprio perfil (e com ele a Administracao): recusado');
chk('AC13', conferirMudanca({ ehVoceMesmo: true, papel: 'admin', setores: ['rateio', 'administracao'], ativo: false })
          ?.erro === 'NaoPodeSeDesligar',
    'desligar o proprio acesso: recusado');

// O corpo do cadastro.
const base = { nome: '  Ana   Souza ', email: ' Ana@G3Solar.com.BR ', senha: 'x'.repeat(SENHA_MINIMA),
               papel: 'financeiro', setores: ['empresa'] };
{
  const p = lerPessoaNova(base);
  chk('AC14', p.nome === 'Ana Souza' && p.email === 'ana@g3solar.com.br' && mesma(p.setores, ['empresa']),
      'cadastro: nome sem espaco sobrando, e-mail minusculo — e o e-mail que casa com o login');
}
chk('AC15', lanca(() => lerPessoaNova({ ...base, email: 'ana.g3solar.com.br' }))
         && lanca(() => lerPessoaNova({ ...base, nome: ' ' })),
    'e-mail sem @ e nome vazio: recusados');
chk('AC16', lanca(() => lerPessoaNova({ ...base, senha: 'curta' }))
         && lanca(() => lerPessoaNova({ ...base, senha: ` ${'x'.repeat(SENHA_MINIMA)}` })),
    `senha provisoria com menos de ${SENHA_MINIMA} caracteres, ou com espaco na ponta: recusada`);
chk('AC17', lanca(() => lerPessoaNova({ ...base, papel: 'dono' }))
         && lanca(() => lerPessoaNova({ ...base, setores: ['administracao'] })),
    'perfil desconhecido, e Administracao com perfil que nao e Administrador: recusados');
chk('AC17b', ehContaDeServico(emailDoServico('eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d'))
          && !ehContaDeServico('financeiro@g3solar.com.br')
          && lanca(() => lerPessoaNova({ ...base, email: 'x@servico.invalido' })),
    'a conta de servico do conector Sicoob e reconhecida pelo e-mail que o provisionamento grava — e '
    + 'ninguem cadastra pessoa com esse dominio');
{
  let e: unknown;
  try { lerPessoaNova({}); } catch (x) { e = x; }
  chk('AC18', traduzir(e).status === 422,
      'a recusa do cadastro chega a tela como 422 com a frase, e nao 500');
}

// ============================================================ 2. o Supabase Auth

type Chamada = { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: any };
const CHAVE = 'sb_secret_NUNCA_NUMA_MENSAGEM_123';

function falso(respostas: Array<(c: Chamada) => { status: number; corpo?: unknown }>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, init: any) => {
    const c: Chamada = {
      url, metodo: init?.method ?? 'GET', cabecalhos: init?.headers ?? {},
      corpo: init?.body ? JSON.parse(init.body) : undefined,
    };
    chamadas.push(c);
    const r = respostas.shift()?.(c) ?? { status: 500, corpo: {} };
    return new Response(r.corpo === undefined ? '' : JSON.stringify(r.corpo), { status: r.status });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

{
  const f = falso([() => ({ status: 200, corpo: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } })]);
  const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co/', chave: CHAVE, buscar: f.buscar });
  const r = await p.criarOuAchar({ email: 'ana@x.com', senha: 's3nha-longa!', nome: 'Ana' });
  const c = f.chamadas[0]!;
  chk('AC19', r.authUserId === 'aaaaaaaa-0000-4000-8000-000000000001' && r.jaExistia === false,
      'conta nova: devolve o id que o Auth criou');
  chk('AC20', c.url === 'https://x.supabase.co/auth/v1/admin/users' && c.metodo === 'POST'
           && c.corpo?.email_confirm === true && c.corpo?.password === 's3nha-longa!',
      'POST na API administrativa com e-mail JA confirmado — o projeto tem autoconfirm desligado, e sem '
      + 'isso a pessoa nao entra');
  chk('AC21', c.cabecalhos.apikey === CHAVE && c.cabecalhos.authorization === `Bearer ${CHAVE}`,
      'a chave vai igual nos dois cabecalhos — o formato que o gateway aceita para a chave nova e a antiga');
}

{
  const f = falso([
    () => ({ status: 422, corpo: { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' } }),
    () => ({ status: 200, corpo: { users: [{ id: 'u1', email: 'outro@x.com' }, { id: 'u2', email: 'outro2@x.com' }] } }),
    () => ({ status: 200, corpo: { users: [{ id: 'u3', email: 'ANA@x.com' }] } }),
  ]);
  const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co', chave: CHAVE, buscar: f.buscar, porPagina: 2 });
  const r = await p.criarOuAchar({ email: 'ana@x.com', senha: 's3nha-longa!', nome: 'Ana' });
  chk('AC22', r.authUserId === 'u3' && r.jaExistia === true && f.chamadas.length === 3,
      'e-mail que ja tem conta: acha a conta existente, paginando, sem diferenciar maiuscula');
  chk('AC23', !f.chamadas.some((c) => c.metodo === 'PUT'),
      '...e NAO mexe na senha dela — quem decide isso e a rota, conferindo o nosso banco');
}

{
  const f = falso([() => ({ status: 422, corpo: { msg: 'A user with this email address has already been registered' } }),
                   () => ({ status: 200, corpo: { users: [{ id: 'u9', email: 'ana@x.com' }] } })]);
  const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co', chave: CHAVE, buscar: f.buscar });
  const r = await p.criarOuAchar({ email: 'ana@x.com', senha: 's3nha-longa!', nome: 'Ana' });
  chk('AC24', r.authUserId === 'u9' && r.jaExistia,
      'GoTrue antigo (so a frase, sem `error_code`): o mesmo caminho');
}

{
  const erros: unknown[] = [];
  for (const resp of [
    { status: 401, corpo: { msg: 'invalid JWT' } },
    { status: 500, corpo: { msg: `boom ${CHAVE}` } },
    { status: 422, corpo: { error_code: 'weak_password', msg: 'weak' } },
  ]) {
    const f = falso([() => resp]);
    const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co', chave: CHAVE, buscar: f.buscar });
    try { await p.criarOuAchar({ email: 'a@x.com', senha: 's3nha-longa!', nome: 'A' }); } catch (e) { erros.push(e); }
  }
  chk('AC25', erros.length === 3 && erros.every((e) => e instanceof FalhaNoSupabaseAuth),
      'toda recusa do Auth vira erro NOSSO, com status escolhido por nos');
  chk('AC26', erros.every((e) => !String((e as Error).message).includes(CHAVE)),
      'a chave NUNCA aparece na mensagem — nem quando o Auth a devolve no corpo');
  chk('AC27', (erros[2] as FalhaNoSupabaseAuth).status === 422 && traduzir(erros[0]).status === 502,
      'senha fraca chega como 422 (corrigivel na tela); o resto, 502 — nunca 401, que deslogaria quem opera');
}

{
  const f = falso([() => { throw new TypeError('fetch failed'); }]);
  const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co', chave: CHAVE, buscar: f.buscar });
  let e: unknown;
  try { await p.criarOuAchar({ email: 'a@x.com', senha: 's3nha-longa!', nome: 'A' }); } catch (x) { e = x; }
  chk('AC28', e instanceof FalhaNoSupabaseAuth && /Nada foi criado/.test((e as Error).message),
      'rede fora: erro nomeado dizendo que nada foi criado');
}

{
  const f = falso([() => ({ status: 200, corpo: {} })]);
  const p = contasSupabase({ supabaseUrl: 'https://x.supabase.co', chave: CHAVE, buscar: f.buscar });
  await p.redefinirSenha('u 1', 'nova-senha-123');
  const c = f.chamadas[0]!;
  chk('AC29', c.metodo === 'PUT' && c.url.endsWith('/admin/users/u%201') && c.corpo?.email_confirm === true,
      'redefinir: PUT na conta, com o id escapado e o e-mail confirmado junto');
}

{
  const antes = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY, s: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  const sem = contasDoAmbiente();
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE;
  const com = contasDoAmbiente();
  for (const [k, v] of [['SUPABASE_URL', antes.u], ['SUPABASE_SERVICE_ROLE_KEY', antes.k], ['SUPABASE_SECRET_KEY', antes.s]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  chk('AC30', sem === null && com !== null,
      'sem a chave o processo SOBE (porta nula) — a chave e de um botao, nao do faturamento');
  const e = new CadastroDeLoginIndisponivel();
  chk('AC31', traduzir(e).status === 503 && !/SUPABASE/.test(e.message),
      'sem a chave o botao responde 503 nomeado, com frase para quem opera e sem nome de variavel');
}

console.log(`--- acesso e conta de login: ${feitas} verificacoes, ${falhas} falhas`);
if (falhas > 0) process.exit(1);
