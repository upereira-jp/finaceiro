// O LANCAMENTO EM LOTE do CPF/CNPJ DOS CLIENTES, com banco e pela role SEM
// BYPASSRLS. Uso: bash tests/repos.sh
//
// O QUE `tests/planilha-documentos.ts` NAO ALCANCA. Aquela suite prova a LEITURA
// do arquivo - digito, colisao dentro do arquivo, chave, cabecalho. Esta prova o
// que so existe no banco, e sao cinco coisas:
//
//   1. A COLISAO CONTRA O QUE JA ESTA GRAVADO, inclusive contra cliente
//      INATIVO - `cliente_documento_unico` nao olha a coluna `ativo`, e as 41
//      vitimas de merge de 30/07 continuam na tabela.
//   2. "COLIDIU ALGUMA, NAO ESCREVE NENHUMA". E a razao de o repositorio decidir
//      em duas passadas, e sem banco nao ha como distinguir isso de "escreveu e
//      deu certo".
//   3. A R8 NA PRATICA: o mesmo documento ja podia estar la vindo do CRM, com
//      `documento_validado = false`. Regravar com origem local NAO e escrita a
//      toa - e a unica coisa que destrava a R9.
//   4. A SEGUNDA PASSADA E VAZIA. Reimportar o mesmo arquivo tem de sair com
//      `aplicados` em zero.
//   5. O ISOLAMENTO: cliente do tenant B e um id desconhecido, nao um erro de
//      permissao - dizer "sem permissao" confirmaria que ele existe.
//
// E a SEXTA, que e a razao de este arquivo existir e nao uma conveniencia de
// cadastro: **o contrato passa a ativar**. O `D7` fecha o circuito da R9 nos
// dois sentidos, e ele e o unico lugar do projeto onde os dois lados - a coluna
// e a porta que ela abre - sao exercitados um contra o outro.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as clienteRepo from '../src/repos/cliente.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import { lerPlanilhaDeDocumentos } from '../src/dominio/planilha-documentos.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const USI = process.env.TEST_USINA!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

// Documentos de digito correto. Nenhum e inventado no meio do teste.
const CPF_A = '71234567857';
const CPF_B = '82345678968';
const CPF_C = '93456789050';
const CPF_D = '64567890108';
const CNPJ  = '11222333000181';

/** O mapa que o script monta, pelo MESMO leitor que ele usa. Monta-lo a mao aqui
 *  testaria o repositorio contra uma leitura que nao e a de producao. */
const mapaDe = (csv: string) => new Map<string, string>(
  lerPlanilhaDeDocumentos(csv).linhas.map((l) => [l.cliente_id, l.documento]));

const docDe = async (id: string): Promise<any> => {
  const r: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT documento, documento_validado, documento_origem::text AS origem, ativo
       FROM cliente WHERE id = $1::uuid`, id));
  return r[0];
};

// ================================================================ fixture
//
// Cinco clientes do tenant A, e cada um existe por uma razao:
//   CPF-1  fatura (UC ativa)              - o caso normal
//   CPF-2  NAO fatura (UC nao ativada)    - a marca do relatorio
//   CPF-3  ja tem documento do CRM        - a R8, e SO ela mexe nele
//   CPF-4  INATIVO, e vai segurar um CPF  - a colisao que o indice enxerga
//   CPF-5  recebe CNPJ                    - pessoa juridica no mesmo lote
let C1 = '', C2 = '', C3 = '', C4 = '', C5 = '', CB = '';
{
  C1 = (await emA(() => clienteRepo.criar({ nome: 'CPF-1 fatura' }))).id;
  C2 = (await emA(() => clienteRepo.criar({ nome: 'CPF-2 nao fatura' }))).id;
  C3 = (await emA(() => clienteRepo.criar({
    nome: 'CPF-3 semente do CRM', documento_bruto: CPF_C, documento_origem: 'crm_semente' }))).id;
  C4 = (await emA(() => clienteRepo.criar({ nome: 'CPF-4 inativo', documento_bruto: CPF_D }))).id;
  await emA(() => clienteRepo.desativar(C4));
  C5 = (await emA(() => clienteRepo.criar({ nome: 'CPF-5 pessoa juridica' }))).id;

  CB = (await emB(() => clienteRepo.criar({ nome: 'CPF-B do outro tenant' }))).id;

  // A UC do C1 fatura; a do C2 e espelhada do CRM com o rateio NAO ativado.
  await emA(() => ucRepo.criar({ cliente_id: C1, numero_uc: 'CPF-UC-1', distribuidora: 'Equatorial' }));
  const uc2 = await emA(() => ucRepo.criar({ cliente_id: C2, numero_uc: 'CPF-UC-2', distribuidora: 'Equatorial' }));
  await emA(() => db().$queryRawUnsafe(
    `UPDATE unidade_consumidora
        SET crm_usina_cliente_id = gen_random_uuid(), rateio_situacao = 'nao_ativado'
      WHERE id = $1::uuid`, uc2.id));
}

// ---------------------------------------------------- D1 o caminho inteiro
{
  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    'cliente_id;documento\n'
    + `${C1};712.345.678-57\n`
    + `${C5};${CNPJ}\n`
    + `7f1c6d2e-9999-4000-8000-000000000099;${CPF_B}\n`)));

  chk('D1a', r.aplicados.length === 2 && r.sem_cliente.length === 1,
      `dois clientes receberam documento e um id desconhecido virou recusa contada (a=${r.aplicados.length} s=${r.sem_cliente.length})`);
  chk('D1b', r.sem_cliente[0]!.motivo === 'nao_existe',
      'o id que nao existe e NOMEADO como tal - a planilha e o banco discordando sobre quem existe nao e erro de arquivo');

  const c1 = await docDe(C1);
  chk('D1c', c1.documento === CPF_A && c1.documento_validado === true && c1.origem === 'coleta_local',
      'o documento entra normalizado, com origem `coleta_local` e VALIDADO - e a origem que a R8 exige para valer');

  const c5 = await docDe(C5);
  chk('D1e', c5.documento === CNPJ && c5.documento_validado === true,
      'CPF e CNPJ entram no MESMO lote - o tipo sai do comprimento e nao de uma coluna que a planilha teria de trazer');

  chk('D1d', r.aplicados.find((x) => x.cliente_id === C1)!.antes === null,
      'e o relatorio guarda o que havia ANTES, para a segunda passada ser obviamente vazia');
}

// ---------------------------------------------------- D2 R8: o mesmo documento, e nao e escrita a toa
//
// O C3 ja tinha CPF_C vindo do CRM. Pela R8 ele esta la com
// `documento_validado = false`, e o contrato dele NAO ativa. Reenviar o MESMO
// numero por planilha e o ato que confirma - e sem a marca `so_validou` isso
// pareceria uma escrita que nao mudou nada.
{
  const antes = await docDe(C3);
  chk('D2a', antes.documento === CPF_C && antes.documento_validado === false,
      'a semente do CRM esta na coluna e NAO vale (R8) - digito certo nao prova que o documento e daquela pessoa');

  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${C3};${CPF_C}\n`)));
  const depois = await docDe(C3);

  chk('D2b', r.aplicados.length === 1 && r.inalterados.length === 0,
      'reenviar o MESMO numero conta como aplicado, nao como inalterado - o que mudou nao foi o numero, foi a origem');
  chk('D2c', r.aplicados[0]!.so_validou === true,
      'e vem marcado `so_validou`, para o ensaio poder dizer "mesmo documento: so passou a VALER" em vez de parecer ruido');
  chk('D2d', depois.documento_validado === true && depois.origem === 'coleta_local',
      'e depois ele vale - que e a unica coisa que destrava a R9 para este cliente');
}

// ---------------------------------------------------- D3 a segunda passada e vazia
{
  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${C1};${CPF_A}\n${C3};${CPF_C}\n`)));
  chk('D3a', r.aplicados.length === 0 && r.inalterados.length === 2,
      `reimportar o mesmo arquivo grava ZERO (a=${r.aplicados.length} i=${r.inalterados.length}) - senao a trilha da regra 9 enche de escrita que nao mudou nada`);
}

// ---------------------------------------------------- D4 a colisao, e ela para o lote INTEIRO
//
// A `Q-CLIENTEDUP-01` medida: 45 linhas ativas para 36 nomes distintos. O erro
// de verdade nao e a colisao - e a colisao chegando no MEIO de um lote gravado
// linha a linha, com metade escrita e sem o arquivo no banco para saber qual.
{
  const antesDoC2 = await docDe(C2);
  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    'cliente_id;documento\n'
    + `${C2};${CPF_B}\n`      // linha boa, e vem ANTES da colisao de proposito
    + `${C1};${CPF_C}\n`)));  // CPF_C ja e do C3

  chk('D4a', r.colisoes.length === 1 && r.colisoes[0]!.dono_atual_id === C3,
      'o documento que ja pertence a outro cliente vira colisao NOMEADA, com o dono atual - isso o banco sabe e o arquivo nao');
  chk('D4b', r.aplicados.length === 0,
      'e NADA foi gravado, nem a linha boa que vinha antes: colidiu alguma, nao escreve nenhuma');

  const c2 = await docDe(C2);
  chk('D4c', c2.documento === antesDoC2.documento && c2.documento === null,
      'a linha boa continua exatamente como estava no banco - a prova de que a decisao aconteceu ANTES da escrita');

  /*
   * A COLISAO CONTRA UM INATIVO. `cliente_documento_unico` e UNIQUE (tenant_id,
   * documento) WHERE documento IS NOT NULL - nao ha `AND ativo` nele. As 41
   * vitimas de merge de 30/07 continuam na tabela, e um CPF preso numa delas
   * recusaria a escrita sem que nada na tela explicasse por que.
   */
  const r2 = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${C1};${CPF_D}\n`)));
  chk('D4d', r2.colisoes.length === 1 && r2.colisoes[0]!.dono_atual_id === C4
        && r2.colisoes[0]!.dono_atual_ativo === false,
      'documento preso num cliente INATIVO tambem colide, e o relatorio diz que o dono esta inativo - '
      + 'o indice unico nao olha a coluna `ativo`, e sem esta linha a recusa pareceria vir do nada');

  // E o cliente inativo nao recebe, nem como alvo.
  const r3 = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${C4};${CPF_B}\n`)));
  chk('D4e', r3.aplicados.length === 0 && r3.sem_cliente[0]?.motivo === 'inativo',
      'e cliente inativo na planilha e recusa contada, distinta de "nao existe" - as duas pedem acoes diferentes');
}

// ---------------------------------------------------- D5 nao coberto tem DOIS significados
//
// O mesmo defeito que o modelo de vencimentos tinha ate 04/08: contar junto quem
// nao fatura hoje faz o relatorio mandar procurar CPF que nao destrava nada.
{
  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${C1};${CPF_A}\n`)));

  const c2 = r.nao_cobertos.find((x) => x.cliente_id === C2);
  chk('D5a', c2 !== undefined && c2.fatura === false && c2.documento_atual === null,
      'o cliente cuja unica UC tem o rateio NAO ativado no CRM sai marcado como nao faturavel - '
      + 'o CPF dele nao e trabalho pendente hoje, porque a UC para na recusa `rateio_nao_ativado`');

  const c3 = r.nao_cobertos.find((x) => x.cliente_id === C3);
  chk('D5b', c3 !== undefined && c3.validado === true,
      'quem ja destrava a R9 continua aparecendo, marcado - o relatorio conta os dois, e so um deles e o trabalho');

  chk('D5c', r.nao_cobertos.every((x) => x.cliente_id !== C4),
      'e o cliente INATIVO fica fora da lista de pendencia: documento de quem foi desativado nao e trabalho');

  /*
   * AUSENTE NAO E ZERO. O C3 nao veio nesta planilha e continua com o documento
   * dele - o lancamento nao apaga o que nao veio.
   */
  const depois = await docDe(C3);
  chk('D5d', depois.documento === CPF_C && depois.documento_validado === true,
      'e quem a planilha nao cobriu fica como estava: o lancamento nao apaga documento nenhum');
}

// ---------------------------------------------------- D6 isolamento
{
  const r = await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${CB};${CPF_B}\n`)));
  chk('D6a', r.aplicados.length === 0 && r.sem_cliente.length === 1
        && r.sem_cliente[0]!.motivo === 'nao_existe',
      'cliente do tenant B e um id DESCONHECIDO, nao um erro de permissao - dizer "sem permissao" confirmaria que ele existe');

  const doB = await emB(() => db().$queryRawUnsafe(
    `SELECT documento FROM cliente WHERE id = $1::uuid`, CB)) as any[];
  chk('D6b', doB[0]?.documento === null,
      'e a linha do outro tenant continua intacta - a RLS decide o universo, e nao um WHERE escrito no repositorio');
}

// ---------------------------------------------------- D7 o circuito da R9, nos DOIS sentidos
//
// A RAZAO DE TUDO ISTO EXISTIR, e ate 04/08/2026 nenhuma suite a exercitava:
// `contrato.ativar()` chama `podeAtivarContrato()`, e sem documento validado o
// contrato fica em RASCUNHO. Rascunho nao ocupa a UC, entao `uc_vigente` e nulo,
// entao a triagem recusa por `sem_contrato_vigente` - que e a PRIMEIRA da ordem.
//
// O efeito chega uma camada adiante e com o nome errado: quem le "29
// sem_contrato_vigente" depois de digitar 29 contratos procura o defeito no
// contrato, e ele esta no cliente.
{
  const c5 = await emA(() => clienteRepo.criar({ nome: 'CPF-5 sem documento' }));
  const uc5 = await emA(() => ucRepo.criar({
    cliente_id: c5.id, numero_uc: 'CPF-UC-5', distribuidora: 'Equatorial' }));

  const rascunho = await emA(() => contrato.rascunhar({
    cliente_id: c5.id, unidade_consumidora_id: uc5.id, usina_id: USI,
    data_fechamento: new Date('2026-06-01T00:00:00Z'),
    valor_referencia_centavos: 10_000, valor_referencia_origem: 'local',
  }));

  const e = await lancou(() => emA(() => contrato.ativar(rascunho.id)));
  chk('D7a', e?.name === 'DocumentoNaoValidado' && e?.status === 422,
      'SEM documento validado o contrato NAO ativa (R9) - o rascunho existe, e rascunho nao ocupa a UC');

  const vig = await emA(() => contrato.vigenteDaUC(uc5.id));
  chk('D7b', vig === null,
      'e por isso a UC segue sem contrato VIGENTE - e o que a triagem le, e ela recusa por `sem_contrato_vigente`, '
      + 'que aponta para o contrato quando o que falta e o CPF do cliente');

  await emA(() => clienteRepo.lancarDocumentosPorCliente(mapaDe(
    `cliente_id;documento\n${c5.id};${CPF_B}\n`)));

  const e2 = await lancou(() => emA(() => contrato.ativar(rascunho.id)));
  const vig2 = await emA(() => contrato.vigenteDaUC(uc5.id));
  chk('D7c', e2 === null && vig2?.id === rascunho.id,
      'e o MESMO rascunho ativa depois do lancamento, sem tocar em nada do contrato - um campo de diferenca, '
      + 'e ele mora na outra tabela');
}

console.log();
if (falhas > 0) { console.log(`--- documento por planilha: ${falhas} FALHA(S)`); }
else { console.log('--- documento por planilha: todas as verificacoes passaram'); }
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
