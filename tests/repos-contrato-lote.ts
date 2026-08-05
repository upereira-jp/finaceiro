// O LANCAMENTO EM LOTE DOS CONTRATOS, com banco e pela role SEM BYPASSRLS.
// Uso: bash tests/repos.sh
//
// O QUE `tests/planilha-contratos.ts` NAO ALCANCA. Aquela suite prova a LEITURA
// do arquivo - data, originador, valor, cabecalho. Esta prova o que so existe no
// banco, e o primeiro item e a razao de o repositorio decidir em duas passadas:
//
//   1. O RASCUNHO ORFAO QUE NAO ACONTECE. `rascunhar` aceita cliente sem
//      documento e `ativar` recusa (R9). A sequencia ingenua gravaria uma linha
//      que NAO ocupa a UC (`uc_vigente` e gerada e fica nula), nao fatura, nao
//      aparece em recusa nenhuma - e a rodada seguinte gravaria outra. Sem banco
//      isso e indistinguivel de "nao gravou".
//   2. A R14 PELO INDICE, nao pela intencao. UC com vigente sai em
//      `ja_tem_contrato` e nada e renovado - renovar zeraria
//      `faturas_cheias_pagas` e registraria na trilha uma renovacao que nao houve.
//   3. A R20-b CONGELANDO DE VERDADE: mudar o tipo do originador DEPOIS nao
//      reprecifica o contrato. E a regra que nao tem caminho de conserto, e a
//      unica prova possivel dela e temporal.
//   4. A SEGUNDA PASSADA E VAZIA. Reimportar o mesmo arquivo tem de sair com
//      `criados` em zero - e e isso que torna seguro reimportar depois de
//      destravar as linhas que a R9 barrou.
//   5. O ISOLAMENTO: UC do tenant B e uma UC desconhecida, nao um erro de
//      permissao - dizer "sem permissao" confirmaria que ela existe.
//
// E a SEXTA, que fecha o circuito: **a triagem para de recusar**. O `L9` mede
// `sem_contrato_vigente` antes e depois do lote, e e o unico lugar do projeto
// onde o importador e a primeira recusa da triagem se exercitam um contra o outro.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as clienteRepo from '../src/repos/cliente.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as originadorRepo from '../src/repos/originador.ts';
import * as rateio from '../src/repos/rateio.ts';
import { lerPlanilhaDeContratos } from '../src/dominio/planilha-contratos.ts';
import { triar, type LinhaCandidata } from '../src/dominio/faturamento.ts';

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

// Documentos de digito correto. Nenhum e inventado no meio do teste.
const CPF_OK  = '15350946056';
const CPF_ORI = '40364045809';
const CPF_OR2 = '18565095088';

const CAB = 'numero_uc;originador_id;data_fechamento;valor_referencia;origem\n';

/** As linhas que o script passa ao repositorio, pelo MESMO leitor que ele usa.
 *  Monta-las a mao aqui testaria o repositorio contra uma leitura que nao e a de
 *  producao - o mesmo cuidado de `tests/repos-documento-cliente.ts`. */
const daPlanilha = (csv: string) => lerPlanilhaDeContratos(csv).linhas.map((l) => ({
  numero_uc: l.numero_uc,
  originador_id: l.originador_id,
  data_fechamento: l.data_fechamento,
  valor_referencia_centavos: l.valor_referencia_centavos,
  valor_referencia_origem: l.valor_referencia_origem,
}));

const contratosDaUC = async (ucId: string): Promise<any[]> => emA(() => db().$queryRawUnsafe(
  `SELECT id, status::text AS status, uc_vigente, originador_id,
          originador_tipo_no_fechamento::text AS tier,
          valor_referencia_centavos, valor_referencia_origem::text AS origem,
          data_fechamento
     FROM contrato WHERE unidade_consumidora_id = $1::uuid
    ORDER BY data_fechamento`, ucId));

// ================================================================ fixture
//
// Quatro UCs do tenant A, e cada uma existe por uma razao:
//   LOTE-1  cliente COM documento validado    - o caminho normal
//   LOTE-2  cliente SEM documento (R9)        - o rascunho orfao que nao acontece
//   LOTE-3  sem usina vinculada               - a trava `uc_sem_usina`
//   LOTE-4  ja vai receber contrato a mao     - a R14 e a idempotencia
let UC1 = '', UC2 = '', UC3 = '', UC4 = '', UCB = '';
let ORI = '', ORI2 = '';
{
  const cOk = await emA(() => clienteRepo.criar({ nome: 'LOTE com documento', documento_bruto: CPF_OK }));
  await emA(() => clienteRepo.editar(cOk.id, { documento_bruto: CPF_OK, documento_origem: 'coleta_local' }));
  const cSem = await emA(() => clienteRepo.criar({ nome: 'LOTE sem documento' }));

  UC1 = (await emA(() => ucRepo.criar({ cliente_id: cOk.id, numero_uc: 'LOTE-1', distribuidora: 'Equatorial' }))).id;
  UC2 = (await emA(() => ucRepo.criar({ cliente_id: cSem.id, numero_uc: 'LOTE-2', distribuidora: 'Equatorial' }))).id;
  UC3 = (await emA(() => ucRepo.criar({ cliente_id: cOk.id, numero_uc: 'LOTE-3', distribuidora: 'Equatorial' }))).id;
  UC4 = (await emA(() => ucRepo.criar({ cliente_id: cOk.id, numero_uc: 'LOTE-4', distribuidora: 'Equatorial' }))).id;

  // A 1, a 2 e a 4 entram no rateio; a 3 fica DE FORA de proposito.
  for (const [uc, pct] of [[UC1, '1.0000'], [UC2, '1.0000'], [UC4, '1.0000']] as const) {
    await emA(() => rateio.definirRateio({ unidade_consumidora_id: uc, usina_id: USI, percentual_rateio: pct }));
  }

  ORI = (await emA(() => originadorRepo.criar({
    nome: 'Originador do lote', natureza: 'pf', tipo: 'terceirizado', documento_bruto: CPF_ORI }))).id;
  ORI2 = (await emA(() => originadorRepo.criar({
    nome: 'Originador inativo', natureza: 'pf', tipo: 'vendedor_g3', documento_bruto: CPF_OR2 }))).id;

  const cB = await emB(() => clienteRepo.criar({ nome: 'LOTE do outro tenant' }));
  UCB = (await emB(() => ucRepo.criar({ cliente_id: cB.id, numero_uc: 'LOTE-B', distribuidora: 'Equatorial' }))).id;
}

// ------------------------------------------------- L1 o caminho inteiro
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-1;${ORI};2026-06-05;1.130,00;crm_consumo_reais\n`)));

  chk('L1a', r.criados.length === 1 && r.criados[0]!.numero_uc === 'LOTE-1',
      `uma UC entra e vira contrato (criados=${r.criados.length})`);

  const cs = await contratosDaUC(UC1);
  chk('L1b', cs.length === 1 && cs[0]!.status === 'ativo',
      `o contrato nasce e e ATIVADO na mesma passada (status=${cs[0]?.status})`);
  chk('L1c', cs[0]!.uc_vigente === UC1,
      'e ocupa a UC: `uc_vigente` e a coluna GERADA que sustenta o indice da R14');
  chk('L1d', Number(cs[0]!.valor_referencia_centavos) === 113000,
      `o valor chega em CENTAVOS INTEIROS (${cs[0]?.valor_referencia_centavos})`);
  chk('L1e', cs[0]!.origem === 'crm_consumo_reais',
      'a origem do valor e a que o arquivo disse, nao um default');
  chk('L1f', new Date(cs[0]!.data_fechamento).toISOString().startsWith('2026-06-05'),
      `a data de fechamento e a do arquivo (${new Date(cs[0]!.data_fechamento).toISOString().slice(0, 10)})`);
  chk('L1g', cs[0]!.originador_id === ORI && cs[0]!.tier === 'terceirizado',
      `o tier do originador CONGELA no rascunhar - R20-b (tier=${cs[0]?.tier})`);
  chk('L1h', r.criados[0]!.originador_nome === 'Originador do lote' && r.criados[0]!.originador_tipo === 'terceirizado',
      'e o relatorio devolve NOME e TIER, nao uuid - uuid nao se confere lendo');
}

// ------------------------------------------------- L2 o rascunho orfao (R9)
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-2;${ORI};2026-06-05;565,00;local\n`)));

  chk('L2a', r.criados.length === 0 && r.sem_documento.length === 1,
      `cliente sem documento validado: nada criado, recusa nomeada (criados=${r.criados.length})`);
  chk('L2b', r.sem_documento[0]!.numero_uc === 'LOTE-2' && r.sem_documento[0]!.cliente_nome === 'LOTE sem documento',
      'e a recusa diz QUAL cliente - o efeito chegaria uma camada adiante com o nome errado');

  /*
   * O PONTO DA SUITE INTEIRA. Se a implementacao gravasse o rascunho e deixasse o
   * `ativar` recusar, haveria UMA linha aqui - em `rascunho`, com `uc_vigente`
   * nula, sem ocupar a UC e sem aparecer em recusa nenhuma da triagem. Zero e a
   * unica resposta certa.
   */
  const cs = await contratosDaUC(UC2);
  chk('L2c', cs.length === 0,
      `nenhum contrato foi gravado - nem RASCUNHO (linhas=${cs.length}). A pre-checagem usa `
      + '`podeAtivarContrato`, a MESMA funcao que `ativar` chama');

  // E depois de destravar a R9, o MESMO arquivo entra. E o fluxo real.
  const cli: any[] = await emA(() => db().$queryRawUnsafe(
    'SELECT cliente_id::text FROM unidade_consumidora WHERE id = $1::uuid', UC2));
  await emA(() => clienteRepo.editar(cli[0]!.cliente_id, {
    documento_bruto: '46251705086', documento_origem: 'coleta_local' }));

  const r2 = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-2;${ORI};2026-06-05;565,00;local\n`)));
  chk('L2d', r2.criados.length === 1 && r2.sem_documento.length === 0,
      'destravada a R9, o MESMO arquivo entra - e e por isso que a recusa por linha '
      + '(e nao por lote) e a escolha certa aqui');
}

// ------------------------------------------------- L3 sem usina e UC inexistente
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB
    + `LOTE-3;${ORI};2026-06-05;100,00;local\n`
    + `LOTE-NAO-EXISTE;${ORI};2026-06-05;100,00;local\n`)));

  chk('L3a', r.sem_usina.length === 1 && r.sem_usina[0]!.numero_uc === 'LOTE-3',
      'UC sem usina nao vira contrato - `contrato_usina_fk` e NOT NULL e nao ha de onde vir o credito');
  chk('L3b', (await contratosDaUC(UC3)).length === 0,
      'e nada foi gravado para ela');
  chk('L3c', r.sem_uc.length === 1 && r.sem_uc[0]!.numero_uc === 'LOTE-NAO-EXISTE',
      'UC que nao existe e recusa contada, nao excecao - planilha e banco discordando e caso de gente');
}

// ------------------------------------------------- L4 o originador
{
  await emA(() => db().$queryRawUnsafe('UPDATE originador SET ativo = false WHERE id = $1::uuid', ORI2));

  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB
    + `LOTE-4;${ORI2};2026-06-05;100,00;local\n`)));
  chk('L4a', r.sem_originador.length === 1 && r.sem_originador[0]!.motivo === 'inativo',
      'originador INATIVO nao serve - e a recusa distingue inativo de inexistente');

  const r2 = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-4;7f1c6d2e-9999-4000-8000-000000000099;2026-06-05;100,00;local\n`)));
  chk('L4b', r2.sem_originador.length === 1 && r2.sem_originador[0]!.motivo === 'nao_existe',
      'uuid que nao e originador deste tenant e recusa nomeada');
  chk('L4c', (await contratosDaUC(UC4)).length === 0,
      'e em nenhum dos dois casos ficou linha para tras');
}

// ------------------------------------------------- L5 a R20-b, no tempo
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-4;${ORI};2026-06-05;789,00;local\n`)));
  chk('L5a', r.criados.length === 1, 'a UC-4 recebe contrato com o tier `terceirizado`');

  /*
   * O CONGELAMENTO, provado no TEMPO e nao por leitura. Promover o originador
   * depois nao reprecifica o contrato de ontem - e a R20-b nao tem caminho de
   * conserto, entao a unica prova possivel e esta.
   */
  await emA(() => db().$queryRawUnsafe(
    "UPDATE originador SET tipo = 'parceiro_captador_senior' WHERE id = $1::uuid", ORI));

  const cs = await contratosDaUC(UC4);
  chk('L5b', cs[0]!.tier === 'terceirizado',
      `promovido o originador, o contrato mantem o tier do fechamento (tier=${cs[0]?.tier}) - R20-b`);

  const o: any[] = await emA(() => db().$queryRawUnsafe(
    'SELECT tipo::text AS tipo FROM originador WHERE id = $1::uuid', ORI));
  chk('L5c', o[0]!.tipo === 'parceiro_captador_senior',
      'e o cadastro mudou de verdade - o teste anterior nao passou por nao ter havido mudanca');

  await emA(() => db().$queryRawUnsafe(
    "UPDATE originador SET tipo = 'terceirizado' WHERE id = $1::uuid", ORI));
}

// ------------------------------------------------- L6 R14 e a idempotencia
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB
    + `LOTE-1;${ORI};2026-06-05;1.130,00;crm_consumo_reais\n`
    + `LOTE-4;${ORI};2026-07-01;999,00;local\n`)));

  chk('L6a', r.criados.length === 0 && r.ja_tem_contrato.length === 2,
      `a segunda passada do MESMO arquivo cria ZERO (criados=${r.criados.length}, ja=${r.ja_tem_contrato.length})`);
  chk('L6b', (await contratosDaUC(UC4)).length === 1,
      'a UC-4 continua com UM contrato - a linha de valor diferente NAO renovou nada');

  const cs = await contratosDaUC(UC4);
  chk('L6c', Number(cs[0]!.valor_referencia_centavos) === 78900,
      `e o valor do contrato existente nao foi tocado (${cs[0]?.valor_referencia_centavos}) - renovar `
      + 'zeraria `faturas_cheias_pagas` e registraria na trilha uma renovacao que nao houve');

  // E o suspenso tambem ocupa: a R14 conta vigente, nao ativo.
  await emA(() => contrato.suspender(cs[0]!.id));
  const r2 = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-4;${ORI};2026-07-01;999,00;local\n`)));
  chk('L6d', r2.criados.length === 0 && r2.ja_tem_contrato[0]!.status === 'suspenso',
      'contrato SUSPENSO tambem ocupa a UC (R14) - e o relatorio diz que ele esta suspenso');
}

// ------------------------------------------------- L7 o isolamento
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-B;${ORI};2026-06-05;100,00;local\n`)));
  chk('L7a', r.sem_uc.length === 1 && r.criados.length === 0,
      'UC do tenant B e uma UC DESCONHECIDA - nao um erro de permissao, que confirmaria que ela existe');

  const cs: any[] = await emB(() => db().$queryRawUnsafe(
    'SELECT count(*)::int AS n FROM contrato WHERE unidade_consumidora_id = $1::uuid', UCB));
  chk('L7b', cs[0]!.n === 0, 'e nada foi gravado do lado do tenant B');
}

// ------------------------------------------------- L8 ausente nao e zero
{
  const r = await emA(() => contrato.lancarContratosPorUC(daPlanilha(
    CAB + `LOTE-1;${ORI};2026-06-05;1.130,00;crm_consumo_reais\n`)));

  const naoCoberta = r.nao_cobertas.find((u) => u.numero_uc === 'LOTE-3');
  chk('L8a', naoCoberta !== undefined && naoCoberta.tem_contrato === false,
      'a UC ativa que a planilha nao cobriu aparece no relatorio, com o que ela tem hoje');
  chk('L8b', (await contratosDaUC(UC3)).length === 0 && (await contratosDaUC(UC4)).length === 1,
      'e nada foi encerrado nem criado para quem ficou de fora - ausente nao e zero');

  const daUC1 = r.nao_cobertas.find((u) => u.numero_uc === 'LOTE-1');
  chk('L8c', daUC1 === undefined,
      'quem veio no arquivo nao entra em `nao_cobertas` - a lista e do que FALTOU');
}

// ------------------------------------------------- L9 o circuito com a triagem
{
  /*
   * O ELO. A triagem recusa `sem_contrato_vigente` PRIMEIRO, entao enquanto o
   * contrato nao existe nada depois dele chega a ser medido. Aqui os dois lados
   * sao exercitados um contra o outro, com a MESMA funcao que o lote usa.
   */
  const linhaDe = async (ucId: string, numero: string): Promise<LinhaCandidata> => {
    const r: any[] = await emA(() => db().$queryRawUnsafe(
      `SELECT uc.id::text AS unidade_consumidora_id, uc.numero_uc,
              c.id::text AS contrato_id, uc.usina_id::text AS usina_id,
              uc.percentual_rateio::text AS percentual_rateio,
              uc.data_vencimento, c.data_fechamento,
              uc.crm_usina_cliente_id::text AS crm_usina_cliente_id,
              uc.rateio_situacao
         FROM unidade_consumidora uc
         LEFT JOIN contrato c ON c.uc_vigente = uc.id
        WHERE uc.id = $1::uuid`, ucId));
    const l = r[0]!;
    return {
      ...l,
      geracao_kwh: '1000', dono_usina_id: null, ja_tem_fatura: false,
      data_vencimento: new Date(Date.UTC(2000, 0, 10)),
    } as LinhaCandidata;
  };

  const antes = triar(await linhaDe(UC3, 'LOTE-3'), new Date(Date.UTC(2026, 5, 1)));
  chk('L9a', antes.faturar === false && antes.motivo === 'sem_contrato_vigente',
      'sem contrato, a triagem recusa por `sem_contrato_vigente` - a PRIMEIRA da ordem');

  const depois = triar(await linhaDe(UC1, 'LOTE-1'), new Date(Date.UTC(2026, 5, 1)));
  chk('L9b', depois.faturar === true,
      'com o contrato que o lote criou, a mesma UC PASSA na triagem - o circuito fecha');
  chk('L9c', depois.faturar === true && depois.flag_fatura_cheia === false,
      'e a fatura de junho sai PARCIAL, porque o fechamento foi 05/06 e nao dia 1 - '
      + 'e a celula da planilha decidindo quando a comissao comeca');
}

// ------------------------------------------------- L10 o valor e o Int
{
  let erro: unknown = null;
  try {
    await emA(() => contrato.lancarContratosPorUC([{
      numero_uc: 'LOTE-1', originador_id: ORI, data_fechamento: new Date(Date.UTC(2026, 5, 5)),
      valor_referencia_centavos: 1130.5 as any, valor_referencia_origem: 'local',
    }]));
  } catch (e) { erro = e; }
  chk('L10a', erro instanceof TypeError,
      'centavos nao inteiro e recusado ANTES de qualquer consulta - regra 1, e a mensagem nomeia a UC');
  chk('L10b', erro instanceof TypeError && (erro as Error).message.includes('LOTE-1'),
      `e diz QUAL linha (${erro instanceof Error ? erro.message.slice(0, 40) : ''}...)`);
}

console.log();
if (falhas > 0) { console.log(`--- contrato por planilha: ${falhas} FALHA(S)`); }
else { console.log('--- contrato por planilha: todas as verificacoes passaram'); }
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
