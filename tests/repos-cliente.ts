// SPEC-001 R7-R9 + CLAUDE.md 1, 2 e 11 - repositorio de cliente contra banco real.
// Uso: bash tests/repos.sh   (nao rode solto: depende do banco que o .sh monta)

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, SemContextoDeTenant, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as cliente from '../src/repos/cliente.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const L = process.env.TEST_USUARIO_LEITURA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>, usuarioId = U) =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId }, () => f());
const emB = <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

// ------------------------------------------------- C1 sem contexto nao escreve
{
  const e = await lancou(() => cliente.criar({ nome: 'Fora de contexto' }));
  chk('C1', e instanceof SemContextoDeTenant,
      `criar() fora de withTenant lanca SemContextoDeTenant (veio ${e?.constructor?.name ?? 'nada'})`);
}

// ------------------------------------------------- C2 tenant vem do contexto
{
  const c = await emA(() => cliente.criar({ nome: 'Tenant do contexto' }));
  chk('C2', c.tenant_id === A, `linha nasce com tenant_id do escopo, nao de parametro (${c.tenant_id === A})`);
}

// ------------------------------------------------- C3 R8: semente do CRM
{
  const c = await emA(() => cliente.criar({
    nome: 'Semente CRM', documento_bruto: '529.982.247-25', documento_origem: 'crm_semente',
  }));
  chk('C3', c.documento === '52998224725' && c.documento_validado === false,
      'R8 documento do CRM com DV valido entra normalizado e NAO validado');
}

// ------------------------------------------------- C4 R9: invalido nao bloqueia
{
  const c = await emA(() => cliente.criar({
    nome: 'Documento ruim', documento_bruto: '11111111111', documento_origem: 'coleta_local',
  }));
  chk('C4', c.documento === '11111111111' && c.documento_validado === false,
      'R9 documento invalido NAO impede o cadastro - so a ativacao do contrato');
}

// ------------------------------------------------- C5 R33: o documento PODE repetir
//
// ESTE TESTE AFIRMAVA O CONTRARIO ATE 01/09/2026, e ele e a razao de o CI estar
// vermelho desde 20/08: a migration 33 derrubou `cliente_documento_unico` naquele
// dia, por regra do dono - "os documentos podem se repetir, pois nas negociacoes
// mais de uma pessoa pode ser responsavel por uma UC" -, e o teste nao foi
// atualizado junto. Os quatro casos que a Q-CLIENTEDUP-01 chamava de duplicata
// eram mesma pessoa com imoveis diferentes.
//
// O QUE ELE PRENDE AGORA e o que sobrou de garantia: repetir e permitido, mas a
// NORMALIZACAO continua - as duas linhas guardam so digitos, venha o documento
// com pontuacao ou sem. Perder isso faria o mesmo CNPJ virar dois valores
// distintos no banco, e ai nem quem olha a lista acha a duplicata de verdade.
//
// O QUE NAO MUDOU, e vale dizer para nao parecer que a unicidade acabou:
// `uc_numero_unico` fica (uma UC so pode ser cobrada uma vez) e
// `cliente_crm_lead_unico` fica (o mesmo card do CRM nunca vira dois clientes).
{
  const primeiro = await emA(() => cliente.criar({ nome: 'Primeiro', documento_bruto: '00000000000191' }));
  const segundo = await emA(() => cliente.criar({ nome: 'Segundo', documento_bruto: '00.000.000/0001-91' }));
  chk('C5', primeiro.documento === '00000000000191' && segundo.documento === '00000000000191',
      `R33 o mesmo documento repete no tenant e as DUAS linhas ficam normalizadas (${primeiro.documento}/${segundo.documento})`);
}

// ------------------------------------------------- C6 e o indice nao volta
{
  await emA(() => cliente.criar({ nome: 'Sem doc 1' }));
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Sem doc 2' })));
  chk('C6', e === null,
      'DOIS clientes sem documento coexistem - se falhar, alguem recriou um unique sobre documento e proibiu o caso legitimo da R33');
}

// ------------------------------------------------- C7 isolamento por tenant
{
  const e = await lancou(() => emB(() => cliente.criar({ nome: 'Mesmo doc, outro tenant', documento_bruto: '00000000000191' })));
  chk('C7', e === null, 'mesmo documento no tenant B e aceito: a unicidade e por tenant, nao global');
}

// ------------------------------------------------- C8 RBAC no repositorio
{
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Nao deveria entrar' }), L));
  chk('C8', e?.name === 'PapelInsuficiente' && e?.status === 403,
      `papel 'leitura' nao cria cadastro (${e?.name ?? 'passou'})`);
}

// ------------------------------------------------- C9 CLAUDE.md 11
{
  const r = await emA(() => cliente.porDocumento(null));
  const r2 = await emA(() => cliente.porDocumento('   '));
  chk('C9', r === null && r2 === null,
      'porDocumento(null) e ("") devolvem null sem consultar - o indice parcial nao e caminho de navegacao');
}

// ------------------------------------------------- C10 normalizacao na busca
{
  const achado = await emA(() => cliente.porDocumento('00.000.000/0001-91'));
  chk('C10', achado?.documento === '00000000000191',
      'busca com documento formatado acha o normalizado');
}

// ------------------------------------------------- C11 centavos e Int
{
  const e = await lancou(() => emA(() => cliente.criar({ nome: 'Float', consumo_referencia_centavos: 100.5 })));
  chk('C11', e instanceof TypeError, `CLAUDE.md 1: float em centavos morre no repositorio (${e?.constructor?.name})`);
}

// ------------------------------------------------- C12 baixa e logica
{
  const c = await emA(() => cliente.criar({ nome: 'Para desativar' }));
  await emA(() => cliente.desativar(c.id));
  const depois = await emA(() => cliente.porId(c.id));
  chk('C12', depois !== null && depois.ativo === false, 'desativar faz baixa logica, nunca DELETE');
}

// ------------------------------------------------- C13 404 atravessa tenant
{
  const c = await emA(() => cliente.criar({ nome: 'Do tenant A' }));
  const e = await lancou(() => emB(() => cliente.desativar(c.id)));
  chk('C13', e?.status === 404,
      'editar cliente de outro tenant e 404, nunca 403: ausencia de vinculo e indistinguivel de inexistencia');
}

// ============ C14-C17: a rota /clientes devolve a CARTEIRA ATIVA, nao o cadastro
//
// Decisao do dono em 04/08/2026, e ela veio de uma frase: "apenas,
// exclusivamente, unicamente, os clientes da etapa Ativos".
//
// A palavra "ativo" ja significou TRES coisas neste sistema no mesmo dia:
// `cliente.ativo` (45 linhas), `unidade_consumidora.status` (41) e a etapa do
// CRM (29). Esta rota devolvia a mais larga das tres, e o dono via 86.
//
// A ETAPA E `Desconto Ativo` do funil `Rateio` (`stage_type = 'won'`), medida
// no CRM em 04/08 - e ela chega ate nos como `rateio_situacao = 'ativado'` no
// espelho da UC. Por isso o filtro e pela UC e nao pelo cliente: a etapa e do
// contrato de rateio, e `cliente` nao tem - nem deve ter - coluna de funil.
{
  const semUc = await emA(() => cliente.criar({ nome: 'ZZ sem UC nenhuma' }));

  const comUcAtivada = await emA(() => cliente.criar({ nome: 'ZZ com UC ativada' }));
  const comUcParada  = await emA(() => cliente.criar({ nome: 'ZZ com UC nao ativada' }));

  const criarUc = async (clienteId: string, numero: string, situacao: string | null) => {
    const u = await emA(() => ucRepo.criar({
      cliente_id: clienteId, numero_uc: numero, distribuidora: 'Equatorial',
    }));
    if (situacao) {
      await emA(() => db().$executeRaw`
        UPDATE unidade_consumidora
           SET rateio_situacao = ${situacao},
               crm_usina_cliente_id = gen_random_uuid(),
               rateio_situacao_lida_em = now()
         WHERE id = ${u.id}::uuid`);
    }
    return u.id;
  };
  await criarUc(comUcAtivada.id, 'CLI-UC-ATIVA', 'ativado');
  await criarUc(comUcParada.id,  'CLI-UC-PARADA', 'nao_ativado');

  const carteira = await emA(() => cliente.listar({ limite: 500 }));
  const nomes = new Set(carteira.map((c: any) => c.nome));

  chk('C14', nomes.has('ZZ com UC ativada'),
      'cliente com UC na etapa ativada ENTRA na carteira - e o par mudo dos dois abaixo');
  chk('C15', !nomes.has('ZZ com UC nao ativada') && !nomes.has('ZZ sem UC nenhuma'),
      'cliente com UC NAO ativada e cliente SEM UC ficam de fora: "apenas, exclusivamente, unicamente"');

  /*
   * O ESCOPO EXPLICITO, e ele NAO contradiz o pedido - ele o torna seguro.
   *
   * Sem `escopo=todos`, um cliente criado a mao por `POST /clientes` - que
   * nunca vai ter UC do CRM - ficaria invisivel PARA SEMPRE, e nao ha outro
   * caminho de busca no sistema: a tela lista, e o que nao esta na lista nao
   * existe para quem opera. O padrao e o que o dono pediu; a saida existe e a
   * tela a nomeia.
   */
  const tudo = await emA(() => cliente.listar({ escopo: 'todos', limite: 500 }));
  const nomesTudo = new Set(tudo.map((c: any) => c.nome));
  chk('C16', nomesTudo.has('ZZ sem UC nenhuma') && nomesTudo.has('ZZ com UC nao ativada')
       && tudo.length > carteira.length,
      `escopo=todos alcanca quem a carteira esconde - senao cliente criado a mao seria `
      + `inalcancavel (${carteira.length} na carteira, ${tudo.length} no cadastro)`);

  /*
   * UM CLIENTE COM DUAS UCs NAO DUPLICA. `some` vira EXISTS, e nao JOIN - um
   * JOIN traria a linha uma vez por UC, e a lista mostraria a mesma pessoa
   * duas vezes sem nada parecer errado.
   */
  await criarUc(comUcAtivada.id, 'CLI-UC-ATIVA-2', 'ativado');
  const dedup = await emA(() => cliente.listar({ limite: 500 }));
  chk('C17', dedup.filter((c: any) => c.nome === 'ZZ com UC ativada').length === 1,
      `cliente com DUAS UCs ativadas aparece UMA vez - `
      + `${dedup.filter((c: any) => c.nome === 'ZZ com UC ativada').length} linha(s)`);
}

await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
console.log(falhas === 0 ? '\nrepos/cliente: todas passaram' : `\nrepos/cliente: ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
