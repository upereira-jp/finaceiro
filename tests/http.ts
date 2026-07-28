// A camada HTTP contra o servidor de verdade, banco de verdade, role sem BYPASSRLS.
// Uso: bash tests/repos.sh
//
// O que esta suite protege que as outras nao: a TRADUCAO. Um repositorio pode
// estar perfeito e a API devolver 500 onde o certo era 409, ou 403 onde o certo
// era 404 - e o 403 no lugar do 404 confirma a existencia de um tenant a quem
// perguntou (R1). Erro de traducao nao aparece em teste de repositorio.

import { criarServidor } from '../src/http/servidor.ts';
import { criarApp } from '../src/app.ts';
import type { AddressInfo } from 'node:net';

const CONN = process.env.TEST_DATABASE_URL!;
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const CLI = process.env.TEST_CLIENTE!;
const AUTH_ADM = process.env.TEST_AUTH_ADMIN!;
const AUTH_LEI = process.env.TEST_AUTH_LEITURA!;

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

const app = criarApp(CONN);
const erros: unknown[] = [];

/**
 * Autenticador de TESTE: le o auth_user_id de um header.
 *
 * Nao e proposta de desenho. MT-06 esta aberta e o servidor recebe o
 * autenticador de fora exatamente para que a decisao nao seja tomada por
 * conveniencia de teste.
 */
const servidor = criarServidor({
  app,
  autenticador: async (req) => {
    const h = req.headers['x-auth-user-id'];
    const v = Array.isArray(h) ? h[0] : h;
    if (!v) throw Object.assign(new Error('Sem credencial.'), { status: 401, name: 'NaoAutenticado' });
    return v;
  },
  log: (_m, e) => { erros.push(e); },
});

await new Promise<void>((r) => servidor.listen(0, r));
const porta = (servidor.address() as AddressInfo).port;

type Resposta = { status: number; corpo: any };
async function chamar(
  metodo: string, caminho: string,
  o: { auth?: string; tenant?: string; corpo?: unknown; corpoBruto?: string } = {},
): Promise<Resposta> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.auth !== undefined) headers['x-auth-user-id'] = o.auth;
  if (o.tenant !== undefined) headers['x-tenant-id'] = o.tenant;
  const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    method: metodo, headers,
    body: o.corpoBruto ?? (o.corpo === undefined ? undefined : JSON.stringify(o.corpo)),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : undefined };
}

const comoAdmin = (m: string, c: string, o: any = {}) => chamar(m, c, { auth: AUTH_ADM, tenant: A, ...o });
const comoLeitura = (m: string, c: string, o: any = {}) => chamar(m, c, { auth: AUTH_LEI, tenant: A, ...o });

// ------------------------------------------------- H1 rota inexistente = 404
{
  const r = await comoAdmin('GET', '/nao-existe');
  chk('H1', r.status === 404 && r.corpo.erro === 'RotaNaoEncontrada', `rota desconhecida da 404 (veio ${r.status})`);
}

// ------------------------------------------------- H2 metodo errado = 405, nao 404
{
  const r = await comoAdmin('DELETE', '/usinas');
  chk('H2', r.status === 405 && r.corpo.erro === 'MetodoNaoPermitido',
      `caminho que existe em outro metodo da 405, nao 404 (veio ${r.status})`);
}

// ------------------------------------------------- H3 sem credencial = 401
{
  const r = await chamar('GET', '/sessao');
  chk('H3', r.status === 401, `sem credencial da 401 (veio ${r.status})`);
}

// ------------------------------------------------- H4 sessao lista os vinculos
{
  const r = await chamar('GET', '/sessao', { auth: AUTH_ADM });
  const ids = (r.corpo?.tenants ?? []).map((t: any) => t.tenantId).sort();
  chk('H4', r.status === 200 && ids.length === 2 && ids.includes(A) && ids.includes(B),
      `GET /sessao devolve os dois vinculos do admin (veio ${ids.length})`);
}

// ------------------------------------------------- H5 dois tenants e nenhum escolhido = 409
{
  const r = await chamar('GET', '/clientes', { auth: AUTH_ADM });
  chk('H5', r.status === 409 && Array.isArray(r.corpo.tenants) && r.corpo.tenants.length === 2,
      `sem x-tenant-id e com dois vinculos: 409 COM a lista para escolher (veio ${r.status})`);
}

// ------------------------------------------------- H6 um vinculo so: nao precisa escolher
{
  const r = await chamar('GET', '/clientes', { auth: AUTH_LEI });
  chk('H6', r.status === 200, `com um vinculo so, o tenant e inferido (veio ${r.status})`);
}

// ------------------------------------------------- H7 R1: tenant sem vinculo e 404, NUNCA 403
{
  const semVinculo = '33330000-0000-4000-8000-00000000000c';
  const r = await chamar('GET', '/clientes', { auth: AUTH_LEI, tenant: semVinculo });
  chk('H7', r.status === 404,
      `tenant fora dos vinculos da 404 - 403 confirmaria que ele existe (veio ${r.status})`);
}

// ------------------------------------------------- H8 tenant de outro, mas com vinculo: entra
{
  const r = await chamar('GET', '/clientes', { auth: AUTH_ADM, tenant: B });
  chk('H8', r.status === 200, `o admin tem vinculo em B e entra em B (veio ${r.status})`);
}

// ------------------------------------------------- H9 matriz de papeis: leitura nao escreve
{
  const r = await comoLeitura('POST', '/clientes', { corpo: { nome: 'Nao deveria entrar' } });
  chk('H9', r.status === 403 && r.corpo.erro === 'PapelInsuficiente',
      `papel leitura recebe 403 no POST - a matriz e aplicada no repositorio (veio ${r.status})`);
}

// ------------------------------------------------- H10 admin escreve, e o tenant vem do contexto
let clienteCriado = '';
{
  const r = await comoAdmin('POST', '/clientes', { corpo: { nome: 'Cliente via HTTP' } });
  clienteCriado = r.corpo?.id ?? '';
  chk('H10', r.status === 201 && r.corpo.tenant_id === A,
      `POST /clientes cria com 201 e tenant do contexto (veio ${r.status})`);
}

// ------------------------------------------------- H11 JSON invalido = 400
{
  const r = await comoAdmin('POST', '/clientes', { corpoBruto: '{ isto nao e json' });
  chk('H11', r.status === 400 && r.corpo.erro === 'JsonInvalido', `corpo nao-JSON da 400 (veio ${r.status})`);
}

// ------------------------------------------------- H12 CLAUDE.md 1: float vira 422, nao 500
{
  const r = await comoAdmin('POST', '/clientes', {
    corpo: { nome: 'Float', consumo_referencia_centavos: 1234.56 },
  });
  chk('H12', r.status === 422 && r.corpo.erro === 'EntradaInvalida',
      `float em centavos vira 422 com mensagem, nao 500 (veio ${r.status})`);
}

// ------------------------------------------------- H13 FK inexistente = 422 nomeado
{
  const r = await comoAdmin('POST', '/unidades-consumidoras', {
    corpo: { cliente_id: '44440000-0000-4000-8000-00000000000d', numero_uc: 'UC-H13', distribuidora: 'Equatorial' },
  });
  chk('H13', r.status === 422 && r.corpo.erro === 'ReferenciaInvalida',
      `cliente_id inexistente vira 422 ReferenciaInvalida, nao 500 (veio ${r.status}/${r.corpo?.erro})`);
}

// ------------------------------------------------- H14 conflito de unicidade = 409
{
  await comoAdmin('POST', '/usinas', { corpo: { codigo_geradora: 'GER-H14', distribuidora: 'Equatorial' } });
  const r = await comoAdmin('POST', '/usinas', { corpo: { codigo_geradora: 'GER-H14', distribuidora: 'Equatorial' } });
  chk('H14', r.status === 409 && r.corpo.erro === 'CodigoDeGeradoraJaExiste',
      `codigo repetido da 409 com o nome do erro de negocio (veio ${r.status})`);
}

// ------------------------------------------------- H15 R11 pelo HTTP: teto vira 422 com autor
{
  const g = await comoAdmin('POST', '/usinas', { corpo: { codigo_geradora: 'GER-H15', distribuidora: 'Equatorial' } });
  const u1 = await comoAdmin('POST', '/unidades-consumidoras', {
    corpo: { cliente_id: CLI, numero_uc: 'UC-H15A', distribuidora: 'Equatorial' } });
  const u2 = await comoAdmin('POST', '/unidades-consumidoras', {
    corpo: { cliente_id: CLI, numero_uc: 'UC-H15B', distribuidora: 'Equatorial' } });

  const ok1 = await comoAdmin('PUT', `/unidades-consumidoras/${u1.corpo.id}/rateio`, {
    corpo: { usina_id: g.corpo.id, percentual_rateio: '70' } });
  const estouro = await comoAdmin('PUT', `/unidades-consumidoras/${u2.corpo.id}/rateio`, {
    corpo: { usina_id: g.corpo.id, percentual_rateio: '40' } });

  chk('H15', ok1.status === 200 && ok1.corpo.situacao === 'com_folga' &&
             estouro.status === 422 && /GER-H15/.test(estouro.corpo.mensagem),
      `110% pelo HTTP: 422 nomeando a usina, nao abort anonimo (veio ${estouro.status})`);
}

// ------------------------------------------------- H16 rateio nao entra por PATCH da UC
{
  const u = await comoAdmin('POST', '/unidades-consumidoras', {
    corpo: { cliente_id: CLI, numero_uc: 'UC-H16', distribuidora: 'Equatorial' } });
  await comoAdmin('PATCH', `/unidades-consumidoras/${u.corpo.id}`, {
    corpo: { endereco_uf: 'ma', percentual_rateio: '99', usina_id: '55550000-0000-4000-8000-00000000000e' } });
  const depois = await comoAdmin('GET', `/unidades-consumidoras/${u.corpo.id}`);
  chk('H16', depois.corpo.endereco_uf === 'MA' && depois.corpo.usina_id === null && depois.corpo.percentual_rateio === null,
      'PATCH da UC ignora campo de rateio: ha UM caminho de escrita do rateio, e ele confere o teto');
}

// ------------------------------------------------- H17 isolamento pelo HTTP
{
  const r = await chamar('GET', `/clientes/${clienteCriado}`, { auth: AUTH_ADM, tenant: B });
  chk('H17', r.status === 404,
      `cliente do tenant A consultado com x-tenant-id de B da 404 (veio ${r.status})`);
}

// ------------------------------------------------- H18 corpo grande demais = 413
{
  const r = await comoAdmin('POST', '/clientes', { corpoBruto: JSON.stringify({ nome: 'x'.repeat(1_100_000) }) });
  chk('H18', r.status === 413, `corpo acima do teto da 413 (veio ${r.status})`);

  /*
   * H18b nasceu de uma falha REAL do CI, em 28/07, e nao de uma hipotese.
   *
   * `lerCorpo` lanca no meio do stream, entao o corpo nao e drenado e o socket
   * nao pode ser reusado. Antes do `Connection: close`, o cliente com keep-alive
   * so descobria isso na requisicao SEGUINTE - o H20 morria com ECONNRESET e o
   * H18, o culpado, passava verde. Passava aqui e falhava no CI, que e a
   * assinatura de corrida de timing.
   *
   * Esta verificacao e o H20 deixarem de depender de sorte: a chamada logo apos
   * o 413 tem de responder.
   *
   * LIMITE HONESTO DESTA VERIFICACAO, medido: o PLANTIO NAO REPRODUZ AQUI.
   * Removido o `Connection: close` do servidor, o H18b continua passando na
   * maquina de desenvolvimento - o socket morre e o undici reabre rapido o
   * bastante. Entao ela NAO e uma verificacao nos dois sentidos como as demais
   * deste projeto: quem acusa e o CI, onde a corrida acontece. Fica aqui como
   * regressao - se o `Connection: close` sair, o vermelho volta la e nao aqui.
   */
  const depois = await comoAdmin('GET', '/clientes');
  chk('H18b', depois.status === 200,
      `a requisicao logo apos o 413 responde (veio ${depois.status}) - o 413 fecha a conexao com Connection: close em vez de deixar o socket morrer sozinho`);
}

// ------------------------------------------------- H19 500 nao vaza mensagem interna
{
  const antes = erros.length;
  // usina_id ausente no PUT de rateio: o repositorio recebe undefined e o erro
  // que sai NAO pode carregar detalhe de banco para o cliente.
  const r = await comoAdmin('PUT', `/unidades-consumidoras/${clienteCriado}/rateio`, { corpo: {} });
  const vazou = typeof r.corpo?.mensagem === 'string' &&
                /prisma|postgres|column|relation|select/i.test(r.corpo.mensagem);
  chk('H19', !vazou && (r.status === 422 || r.status === 500),
      `erro nao previsto nao vaza detalhe interno na resposta (status ${r.status}, logados ${erros.length - antes})`);
}

// ------------------------------------------------- H20 caminho de relatorio funciona
{
  const r = await comoAdmin('GET', '/rateio');
  chk('H20', r.status === 200 && Array.isArray(r.corpo),
      `GET /rateio responde pelo pool de RELATORIO, separado do transacional (veio ${r.status})`);
}

// ------------------------------------------------- H21 Decimal sai como string, nunca float
{
  const g = await comoAdmin('POST', '/usinas', {
    corpo: { codigo_geradora: 'GER-H21', distribuidora: 'Equatorial', potencia_kwp: '1234.5678' } });
  chk('H21', typeof g.corpo.potencia_kwp === 'string' && g.corpo.potencia_kwp === '1234.5678',
      `numeric sai do JSON como STRING - float em JSON e o que a regra 1 proibe (veio ${typeof g.corpo.potencia_kwp})`);
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await new Promise<void>((r) => servidor.close(() => r()));
await app.encerrar();
process.exit(falhas === 0 ? 0 : 1);
