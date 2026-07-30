// A AGENDA DE COBRANCA COM BANCO, pela role SEM BYPASSRLS. Uso: bash tests/repos.sh
//
// O QUE SO SE VERIFICA AQUI, E QUE `tests/agenda.ts` NAO ALCANCA. A suite pura
// prova a progressao e a decisao; nada nela toca o que a Q-AGENDA-01 apontava
// como buraco de verdade - "as colunas existem e nada as consome". As cinco
// coisas abaixo passariam VERDES num teste sem banco, com tudo quebrado:
//
//   1. O CARIMBO CHEGA A COLUNA. `registrar` grava `ultima_tentativa_em` e
//      `proxima_tentativa_em`, e o CHECK `boleto_agendamento_coerente` da
//      migration 21 recusa a combinacao impossivel. Uma implementacao que
//      calculasse o intervalo e nao o gravasse passa em toda verificacao pura.
//
//   2. A FILA ENXERGA O QUE DEVE E SO ISSO. O predicado vive em SQL - status,
//      vencimento do agendamento, estado da FATURA. Boleto de fatura cancelada
//      fora da fila e um `AND` que so existe la.
//
//   3. O EXCLUDE MORDE. "Uma execucao por tarefa" e constraint do banco, e a
//      migration 14 registrou que ela e letra morta se a linha nao COMMITAR
//      antes do trabalho. Isso so se observa com duas transacoes de verdade.
//
//   4. A CONSULTA ATIVA E IDEMPOTENTE POR CONSTRUCAO. Rodar duas vezes sobre o
//      mesmo boleto liquidado nao pode produzir duas liquidacoes - e quem
//      garante e `liquidacao_fatura_unica`, no banco, nao a chave que a agenda
//      monta.
//
//   5. O ISOLAMENTO. A fila e o registro de execucao sao lidos pela role sem
//      BYPASSRLS: o tenant B nao pode ver boleto nem execucao do A. Sem policy
//      isso NAO da erro - da lista vazia, que e o modo de falha que este projeto
//      persegue.
//
// A COBRANCA E O ADAPTADOR FALSO, e o `falharProximoRegistro` dele existia desde
// 28/07 com o comentario "serve para exercitar a fila de retentativa do PRD 6".
// Ate hoje nao havia fila para exercitar.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as usinaRepo from '../src/repos/usina.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as regras from '../src/repos/regras.ts';
import * as fatura from '../src/repos/fatura.ts';
import * as boleto from '../src/repos/boleto.ts';
import * as donoUsina from '../src/repos/dono_usina.ts';
import {
  executarFilaDeEmissao, executarConsultaAtiva, conferirCertificado,
  AgendaJaEmAndamento, type AbrirTransacao,
} from '../src/cobranca/agenda.ts';
import { intervaloSegundos, POLITICA, type Politica } from '../src/dominio/agenda.ts';
import { CobrancaFalsa } from '../src/sicoob/falso.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

/** O `AbrirTransacao` que o motor recebe. E o mesmo desenho de producao: quem
 *  monta contexto e a camada de fora, nunca o motor. */
const txA: AbrirTransacao = (trabalho) => emA(() => trabalho());
const txB: AbrirTransacao = (trabalho) => emB(() => trabalho());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
// Uma linha por verificacao: a contagem oficial e `npm test | grep -c '^ok '`, e
// mensagem do Prisma tem `\n` no meio.
const resumo = (e: unknown, n = 70) => String(e).replace(/\s+/g, ' ').trim().slice(0, n);
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));

const DISTRIB = 'Equatorial';
const cobranca = new CobrancaFalsa('AGENDA');

/** Politica curta: base de 1 segundo torna o "ja venceu" observavel sem esperar
 *  cinco minutos, e o teto baixo faz a saturacao caber no teste. */
const RAPIDA: Politica = {
  baseSegundos: 1, tetoSegundos: 4, diasDeAvisoDoCertificado: 30, examinadosPorRodada: 200,
};

const garantirTarifa = async (emT: <T>(f: () => Promise<T>) => Promise<T>) => {
  const abertas: Array<{ n: bigint }> = await emT(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM tarifa WHERE distribuidora = $1 AND vigencia_fim IS NULL`, DISTRIB));
  if (Number(abertas[0].n) > 0) return;
  await emT(() => regras.abrirVigenciaDeTarifa({
    distribuidora: DISTRIB, tarifa_reais_por_kwh: '1.000000', vigencia_inicio: mes(2020, 1),
  }));
};

/**
 * UM dono por tenant, reaproveitado. `dono_usina` tem unique de documento por
 * tenant, e criar um por usina com o mesmo CPF levanta 409 - o que e a regra
 * certa e nao um estorvo do teste: dono de usina e pessoa, e a mesma pessoa pode
 * ser dona de varias usinas.
 */
async function donoDoTenant(emT: <T>(f: () => Promise<T>) => Promise<T>): Promise<string> {
  const existente = await emT(() => donoUsina.porDocumento('529.982.247-25'));
  if (existente) return (existente as any).id;
  const novo = await emT(() => donoUsina.criar({
    nome: 'Dono da agenda', natureza: 'pf', documento_bruto: '529.982.247-25', chave_pix: 'agenda@pix',
  }));
  return novo.id;
}

/** Uma fatura EMITIDA nova, pelo caminho de producao. Devolve o id. */
async function faturaEmitida(
  emT: <T>(f: () => Promise<T>) => Promise<T>,
  clienteId: string, sufixo: string, competencia: [number, number],
): Promise<string> {
  const donoId = await donoDoTenant(emT);
  const u = await emT(() => usinaRepo.criar({ codigo_geradora: `AGD-${sufixo}`, distribuidora: DISTRIB }));
  await emT(() => usinaRepo.editar(u.id, { dono_usina_id: donoId }));
  const uc = await emT(() => ucRepo.criar({
    cliente_id: clienteId, numero_uc: `AGD-UC-${sufixo}`, distribuidora: DISTRIB,
    data_vencimento: new Date(Date.UTC(2026, 0, 15)),
  }));
  await emT(() => rateio.definirRateio({
    unidade_consumidora_id: uc.id, usina_id: u.id, percentual_rateio: '10.0000',
  }));
  // Sem regra de repasse vigente o split e BLOQUEADO (R12) e a baixa entra sem
  // repartir - o que e o comportamento certo e nao o que esta sob teste aqui.
  await emT(() => regras.abrirVigenciaDeRepasse({
    usina_id: u.id, percentual: '70.00', vigencia_inicio: mes(2020, 1),
  }));
  const k = await emT(() => contrato.rascunhar({
    cliente_id: clienteId, unidade_consumidora_id: uc.id, usina_id: u.id, originador_id: null,
    data_fechamento: new Date(Date.UTC(2026, 0, 1)),
    valor_referencia_centavos: 50_000, valor_referencia_origem: 'local',
  }));
  await emT(() => contrato.ativar(k.id));
  await emT(() => usinaRepo.registrarGeracao({
    usina_id: u.id, competencia: mes(...competencia), geracao_kwh: '8000.0000', origem: 'local',
  }));
  const iso = `${competencia[0]}-${String(competencia[1]).padStart(2, '0')}-01`;
  await emT(() => fatura.comporLote(iso));
  const f = (await emT(() => fatura.daCompetencia(iso)))
    .find((x: any) => x.unidade_consumidora_id === uc.id)!;
  await emT(() => fatura.emitir(f.id));
  return f.id;
}

// ================================================================ fixture
let fFalha: string; let fPaga: string; let fCancelada: string; let fB: string;

{
  await garantirTarifa(emA);
  await emA(() => boleto.cadastrarConector({ credencial_ref: 'vault://sicoob/agenda', ativo: true }));

  fFalha = await faturaEmitida(emA, CLI, 'F1', [2028, 1]);
  fPaga = await faturaEmitida(emA, CLI, 'P1', [2028, 2]);
  fCancelada = await faturaEmitida(emA, CLI, 'C1', [2028, 3]);

  // O tenant B ganha conector e uma fatura emitida, para o isolamento ter alvo.
  await garantirTarifa(emB);
  await emB(() => boleto.cadastrarConector({ credencial_ref: 'vault://sicoob/agenda-b', ativo: true }));
  const clienteB = await emB(async () => {
    const { criar, porDocumento } = await import('../src/repos/cliente.ts');
    return (await porDocumento('529.982.247-25')) ?? criar({ nome: 'Cliente do B', documento_bruto: '529.982.247-25' });
  });
  fB = await faturaEmitida(emB, (clienteB as any).id, 'B1', [2028, 1]);
}

// ===================================================== N1 o carimbo chega a coluna
{
  // A porta falha uma vez. `registrar` grava a falha e COMMITA - e o desenho de
  // `ResultadoDoRegistro`, e e o que da memoria a fila.
  cobranca.falharProximoRegistro = 'timeout simulado';
  const r = await emA(() => boleto.registrar(fFalha, cobranca));
  chk('N1a', r.registrado === false,
      'a falha da porta NAO levanta: devolve resultado e grava - relancar desfaria a propria '
      + 'gravacao junto com a transacao, e a fila voltaria a nao ter memoria');

  const b = await emA(() => boleto.porFatura(fFalha));
  chk('N1b', b?.status === 'erro' && b?.tentativas === 1 && !!b?.ultimo_erro,
      'o boleto ficou em erro com tentativas=1 e o motivo gravado');
  chk('N1c', b?.ultima_tentativa_em instanceof Date && b?.proxima_tentativa_em instanceof Date,
      'as DUAS colunas da migration 21 foram carimbadas - era exatamente isto que a Q-AGENDA-01 '
      + 'dizia nao existir: "as colunas existem e nada as consome"');

  const distancia = (b!.proxima_tentativa_em!.getTime() - b!.ultima_tentativa_em!.getTime()) / 1000;
  chk('N1d', distancia === intervaloSegundos(1, POLITICA),
      `a distancia entre os dois carimbos e o intervalo da POLITICA para a 1a falha `
      + `(${intervaloSegundos(1, POLITICA)}s) - a conta e a mesma do modulo puro, aplicada ao banco`);
}

// ---------------------------------------------------- N2 o CHECK do banco morde
{
  const e = await lancou(() => emA(() => db().$executeRawUnsafe(
    `UPDATE boleto SET ultima_tentativa_em = NULL, proxima_tentativa_em = now()
      WHERE fatura_id = $1`, fFalha)));
  chk('N2a', e !== null && /boleto_agendamento_coerente|violates check/i.test(String(e)),
      `o banco RECUSA agendar a proxima tentativa sem ter feito uma: ${resumo(e, 40)} - a regra e `
      + 'do schema e nao da aplicacao, entao um caminho novo nao consegue furar');
}

// ===================================================== N3 a fila enxerga o certo
{
  const agora = new Date();
  const fila = await emA(() => boleto.filaDeEmissao(agora, 200));
  chk('N3a', fila.every((x) => x.fatura_id !== fFalha),
      'o boleto que acabou de falhar NAO esta vencido - a proxima tentativa foi agendada para o '
      + 'futuro, e uma fila que o pegasse agora seria um laco apertado contra o banco');

  const depois = new Date(agora.getTime() + (intervaloSegundos(1, POLITICA) + 1) * 1000);
  const filaDepois = await emA(() => boleto.filaDeEmissao(depois, 200));
  chk('N3b', filaDepois.some((x) => x.fatura_id === fFalha),
      'passado o intervalo, ele APARECE - a fila e por estado e relogio, e nao por uma lista em '
      + 'memoria que morre com o processo');
}

// ---------------------------------------------------- N4 fatura cancelada sai da fila
{
  await emA(() => boleto.registrar(fCancelada, cobranca));         // registra de verdade
  await emA(() => db().$executeRawUnsafe(
    `UPDATE boleto SET status='erro', tentativas=1, ultima_tentativa_em=now(),
            proxima_tentativa_em=now() - interval '1 hour' WHERE fatura_id = $1`, fCancelada));
  const antesDeCancelar = await emA(() => boleto.filaDeEmissao(new Date(), 200));
  const estava = antesDeCancelar.some((x) => x.fatura_id === fCancelada);

  await emA(() => fatura.cancelar(fCancelada, 'teste da agenda'));
  const depois = await emA(() => boleto.filaDeEmissao(new Date(), 200));
  chk('N4a', estava && depois.every((x) => x.fatura_id !== fCancelada),
      'boleto de fatura CANCELADA sai da fila - estava e saiu. Sem este filtro cada rodada gastaria '
      + 'uma chamada ao banco para receber o mesmo 409 de "so fatura emitida ganha boleto", '
      + 'para sempre');
}

// ===================================================== N5 a rodada da fila
{
  // Vencido de proposito: mexer no relogio do banco e o unico jeito de observar
  // a retentativa sem esperar o intervalo de producao.
  await emA(() => db().$executeRawUnsafe(
    `UPDATE boleto SET proxima_tentativa_em = now() - interval '1 second' WHERE fatura_id = $1`, fFalha));

  const r = await executarFilaDeEmissao(cobranca, txA, { politica: RAPIDA });
  chk('N5a', r.status === 'ok' && r.registrados >= 1 && r.falhos === 0,
      'a rodada RETENTOU e o boleto passou - e o ciclo inteiro que nao existia: falhar, esperar, '
      + 'voltar a tentar e conseguir');

  const b = await emA(() => boleto.porFatura(fFalha));
  chk('N5b', b?.status === 'registrado' && b?.nosso_numero !== null && b?.proxima_tentativa_em === null,
      'ao passar, o boleto SAI da fila: proxima_tentativa_em volta a NULL e ultima_tentativa_em '
      + 'fica - a ordem inversa e o que o CHECK do N2 recusaria');
  chk('N5c', b?.tentativas === 1,
      'a contagem de tentativas NAO e zerada pelo sucesso - ela e o historico do que custou, e '
      + 'zerar apagaria o unico sinal de um boleto problematico');
}

// ---------------------------------------------------- N6 a execucao fica registrada
{
  const linhas: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT tarefa::text, status::text, examinados, registrados, falhos, terminado_em
       FROM agenda_execucao WHERE tarefa = 'fila_de_emissao' ORDER BY iniciado_em DESC LIMIT 1`));
  const l = linhas[0];
  chk('N6a', !!l && l.status === 'ok' && l.terminado_em !== null && l.registrados >= 1,
      'a rodada deixou linha em agenda_execucao, FECHADA e com contadores - sem isso, "a agenda '
      + 'nao roda desde o dia 3" nao e uma pergunta que alguem consiga fazer');

  const emAndamento: Array<{ n: bigint }> = await emA(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM agenda_execucao WHERE status = 'em_andamento'`));
  chk('N6b', Number(emAndamento[0].n) === 0,
      'nenhuma execucao ficou "em_andamento" - uma que ficasse travaria a agenda para sempre pelo '
      + 'EXCLUDE, que e o modo de falha que a migration 14 documentou');
}

// ---------------------------------------------------- N7 o EXCLUDE morde
{
  /*
   * Uma execucao aberta A MAO e deixada em andamento, e entao a rodada de
   * verdade. Nao ha concorrencia real aqui: o que esta sob teste e a constraint,
   * e ela nao distingue "outro processo" de "linha que sobrou".
   */
  const conectorId: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT id FROM conector_cobranca WHERE ativo LIMIT 1`));
  await emA(() => db().$executeRawUnsafe(
    `INSERT INTO agenda_execucao (tenant_id, conector_id, tarefa, ciclo_id)
     VALUES ($1::uuid, $2::uuid, 'fila_de_emissao', gen_random_uuid())`, A, conectorId[0].id));

  const e = await lancou(() => executarFilaDeEmissao(cobranca, txA, { politica: RAPIDA }));
  chk('N7a', e instanceof AgendaJaEmAndamento,
      'a segunda rodada da MESMA tarefa e recusada com erro de negocio, traduzido do 23P01 - duas '
      + 'rodadas simultaneas leriam os mesmos boletos e chamariam o banco duas vezes pelo mesmo titulo');

  // A OUTRA tarefa passa: o EXCLUDE e por (conector, tarefa), e nao por conector.
  const r = await executarConsultaAtiva(cobranca, txA, { politica: RAPIDA });
  chk('N7b', r.status !== 'erro',
      'a consulta ativa roda mesmo com a fila em andamento - o EXCLUDE e por (conector, TAREFA), '
      + 'porque as duas nao disputam nada uma com a outra');

  await emA(() => db().$executeRawUnsafe(
    `UPDATE agenda_execucao SET status='erro', terminado_em=now() WHERE status='em_andamento'`));
}

// ===================================================== N8 a consulta ativa baixa
{
  await emA(() => boleto.registrar(fPaga, cobranca));
  const b = await emA(() => boleto.porFatura(fPaga));
  cobranca.pagar(b!.nosso_numero!, { data: new Date(Date.UTC(2028, 1, 20)) });

  const r = await executarConsultaAtiva(cobranca, txA, { politica: RAPIDA });
  /*
   * A AFIRMACAO E SOBRE ESTE BOLETO, e nao sobre o contador da rodada. O
   * `repos.sh` roda todas as suites no MESMO banco e no MESMO tenant, entao a
   * consulta ativa tambem enxerga os boletos que a suite da carteira registrou -
   * e eles sao `desconhecida` para o adaptador desta suite, que tem outro
   * prefixo. Um `divergentes === 1` aqui seria uma constante que depende da
   * ordem de execucao, com cara de conta conferida. E a licao do
   * RESUMO-SESSAO-15 §3, e ela custou uma fatura de outra carteira.
   */
  const meu = (id: string) => r.ocorrencias.filter((o) => o.fatura_id === id);
  chk('N8a', r.liquidados >= 1 && meu(fPaga).length === 0,
      'a consulta ativa achou o boleto liquidado no banco e BAIXOU, sem ocorrencia para ele - e o '
      + 'PRD 6 inteiro: webhook perdido e dinheiro recebido que o sistema nunca baixa');

  const f = await emA(() => fatura.porId(fPaga));
  chk('N8b', (f as any)?.status === 'paga',
      'a fatura virou paga pelo caminho de producao - liquidacao.baixar(), o unico gatilho do split');

  const itens: Array<{ n: bigint }> = await emA(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM split_item si
       JOIN split_execucao se ON se.tenant_id = si.tenant_id AND se.id = si.split_execucao_id
       JOIN liquidacao l ON l.tenant_id = se.tenant_id AND l.id = se.liquidacao_id
      WHERE l.fatura_id = $1::uuid`, fPaga));
  chk('N8c', Number(itens[0].n) > 0,
      'o SPLIT rodou na mesma transacao da baixa - a consulta ativa nao e um caminho paralelo de '
      + 'dinheiro, ela chama o mesmo repositorio que a baixa manual chama');
}

// ---------------------------------------------------- N9 rodar duas vezes nao duplica
{
  const r = await executarConsultaAtiva(cobranca, txA, { politica: RAPIDA });
  chk('N9a', r.liquidados === 0 && r.falhos === 0
        && r.ocorrencias.every((o) => o.fatura_id !== fPaga),
      'a segunda rodada sobre o mesmo boleto liquidado nao produz baixa nova, NEM falha, NEM '
      + 'ocorrencia - a fatura ja esta paga, e "o outro canal chegou antes" e prova de que '
      + 'funcionou, nao problema');

  const n: Array<{ n: bigint }> = await emA(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM liquidacao WHERE fatura_id = $1::uuid`, fPaga));
  chk('N9b', Number(n[0].n) === 1,
      'ha UMA liquidacao para a fatura, e quem garante e `liquidacao_fatura_unica` no banco - a '
      + 'chave que a agenda monta e conveniencia, o mecanismo e a constraint');
}

// ---------------------------------------------------- N10 divergencia e visivel
{
  // Nosso numero que o adaptador nao conhece: e o caso "o registro pode nunca
  // ter chegado", e ele NAO pode passar como silencio.
  await emA(() => db().$executeRawUnsafe(
    `UPDATE boleto SET status='registrado', nosso_numero='NAO-EXISTE-NO-BANCO'
      WHERE fatura_id = $1`, fFalha));

  const r = await executarConsultaAtiva(cobranca, txA, { politica: RAPIDA });
  const desteBoleto = r.ocorrencias.filter((o) => o.fatura_id === fFalha);
  chk('N10a', desteBoleto.length === 1 && /nao reconhece/.test(desteBoleto[0]!.sinal)
        && r.status === 'parcial',
      'boleto que o banco nao reconhece produz UMA ocorrencia para ELE e a rodada fecha "parcial" '
      + '- parcial e nao erro: a rodada concluiu e registrou o motivo de cada uma');

  const b = await emA(() => boleto.porFatura(fFalha));
  chk('N10b', /nao reconhece/.test(b?.ultimo_erro ?? ''),
      'a divergencia fica NA LINHA do boleto, e nao so no registro da execucao - quem abre a '
      + 'fatura precisa ver o que o banco disse sem saber que existe uma tabela de agenda');
}

// ===================================================== N11 isolamento
{
  const filaB = await emB(() => boleto.filaDeEmissao(new Date(Date.UTC(2030, 0, 1)), 200));
  const clienteAnoB = filaB.some((x) => [fFalha, fPaga, fCancelada].includes(x.fatura_id));
  chk('N11a', clienteAnoB === false,
      'a fila do tenant B nao contem NENHUM boleto do A, pela role sem BYPASSRLS - e o modo de '
      + 'falha que importa: sem policy isso nao daria erro, daria lista vazia ou lista do vizinho');

  const execB: Array<{ n: bigint }> = await emB(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM agenda_execucao`));
  const execA: Array<{ n: bigint }> = await emA(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM agenda_execucao`));
  chk('N11b', Number(execA[0].n) > 0 && Number(execB[0].n) === 0,
      `o A ve as proprias execucoes (${Number(execA[0].n)}) e o B ve zero - a mesma consulta, `
      + 'dois contextos, resultados diferentes: e a policy funcionando');

  // A rodada do B roda e nao alcanca nada do A.
  const rB = await executarConsultaAtiva(cobranca, txB, { politica: RAPIDA });
  chk('N11c', rB.status !== 'erro' && rB.liquidados === 0,
      'o B roda a propria agenda sem tocar em nada do A - o motor nao tem caminho privilegiado, '
      + 'e excecao de isolamento e ausencia de isolamento');
}

// ---------------------------------------------------- N12 o registro nao se apaga
{
  const e = await lancou(() => emA(() => db().$executeRawUnsafe(`DELETE FROM agenda_execucao`)));
  chk('N12a', e !== null && /permission denied|permissao/i.test(String(e)),
      `DELETE em agenda_execucao e negado a app_financeiro: ${resumo(e, 40)} - a prova de que a `
      + 'agenda rodou (ou nao rodou) nao se apaga por quem foi acusado por ela');
}

// ---------------------------------------------------- N13 o teto e DECLARADO
{
  /*
   * A FILA PRECISA DE ESTADO REAL, e a primeira versao desta verificacao nao
   * tinha: `deixados_para_tras === total - examinados` com os dois em ZERO e
   * verdadeiro por vacuidade, e passaria com a contagem inteira quebrada. Aqui
   * se plantam TRES boletos vencidos para o teto de 1 ter o que truncar.
   */
  const plantadas: string[] = [];
  for (const i of [1, 2, 3]) {
    const f = await faturaEmitida(emA, CLI, `T${i}`, [2029, i]);
    cobranca.falharProximoRegistro = `falha plantada ${i}`;
    await emA(() => boleto.registrar(f, cobranca));
    plantadas.push(f);
  }
  await emA(() => db().$executeRawUnsafe(
    `UPDATE boleto SET proxima_tentativa_em = now() - interval '1 hour'
      WHERE fatura_id = ANY($1::uuid[])`, plantadas));

  const agora = new Date();
  const total = await emA(() => boleto.tamanhoDaFila(agora));
  const r = await executarFilaDeEmissao(cobranca, txA, {
    agora, politica: { ...RAPIDA, examinadosPorRodada: 1 },
  });
  chk('N13a', total >= 3 && r.examinados === 1 && r.deixados_para_tras === total - 1,
      `com teto de 1 e ${total} vencidos, a rodada examina 1 e DIZ que ${r.deixados_para_tras} `
      + 'ficaram para tras - truncar em silencio faria "cobri 1 de 3" e "cobri tudo" terem a '
      + 'mesma saida, e a segunda e a conclusao que alguem tiraria');

  const r2 = await executarFilaDeEmissao(cobranca, txA, {
    agora, politica: { ...RAPIDA, examinadosPorRodada: 1 },
  });
  chk('N13b', r2.examinados === 1 && r2.deixados_para_tras === total - 2,
      'a rodada seguinte pega o PROXIMO e o resto encolhe de um - a fila drena, e nao fica '
      + 'reprocessando a mesma cabeca por causa da ordenacao');
}

// ---------------------------------------------------- N14 o certificado
{
  const semData = await emA(() => conferirCertificado());
  chk('N14a', semData.nivel === 'sem_certificado' && semData.dias === null,
      'sem `certificado_expira_em` cadastrado o sistema diz sem_certificado - e nao "ok", que '
      + 'seria garantir o que ele nao sabe');

  await emA(() => boleto.cadastrarConector({
    credencial_ref: 'vault://sicoob/agenda', ativo: true,
    certificado_expira_em: new Date(Date.now() - 86_400_000),
  }));
  const vencido = await emA(() => conferirCertificado());
  chk('N14b', vencido.nivel === 'vencido',
      'A1 com data no passado e "vencido" - PRD 6: vencido, a emissao para SEM erro obvio, e este '
      + 'e o erro obvio');

  await emA(() => boleto.cadastrarConector({
    credencial_ref: 'vault://sicoob/agenda', ativo: true, certificado_expira_em: null,
  }));
}

// ---------------------------------------------------- N15 sem conector nao ha agenda
{
  const e = await lancou(() => emA(() => db().$executeRawUnsafe(
    `UPDATE conector_cobranca SET ativo = false`)));
  const semConector = await lancou(() => executarFilaDeEmissao(cobranca, txA, { politica: RAPIDA }));
  chk('N15a', e === null && semConector !== null && (semConector as any).status === 412,
      'sem conector ativo a agenda RECUSA com 412 nomeado em vez de rodar em vazio e reportar '
      + '"nada a fazer" - as duas coisas tem a mesma cara em log, e so uma delas e verdade');
  await emA(() => db().$executeRawUnsafe(`UPDATE conector_cobranca SET ativo = true`));
}

console.log(`\n${falhas === 0 ? 'agenda (banco): todas as verificacoes passaram'
                              : `agenda (banco): ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
