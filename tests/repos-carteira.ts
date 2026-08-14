// A CARTEIRA PONTA A PONTA, contra banco real, pela role SEM BYPASSRLS.
// Uso: bash tests/repos.sh
//
// O ciclo inteiro do dinheiro, pelos caminhos de producao e nao por INSERT:
//
//   compor lote -> emitir -> registrar boleto -> o banco paga -> baixa ->
//   split -> contador do contrato avanca -> 2a competencia paga a 2a parcela
//
// A COBRANCA E O ADAPTADOR FALSO, e e ele que torna isto possivel hoje: nao ha
// certificado A1 nem credencial de sandbox. Tudo o mais e real - as policies
// estao ligadas, a role nao tem BYPASSRLS, as constraints deferidas disparam no
// commit de cada transacao.
//
// AS TRANSACOES SAO SEPARADAS DE PROPOSITO. Cada `emA(...)` e uma unidade de
// trabalho, e portanto um COMMIT. E onde a constraint deferida do centavo
// dispara: um split que nao fechasse abortaria ali, e nao no INSERT.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as donoUsina from '../src/repos/dono_usina.ts';
import * as usinaRepo from '../src/repos/usina.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as originadorRepo from '../src/repos/originador.ts';
import * as clienteRepo from '../src/repos/cliente.ts';
import * as regras from '../src/repos/regras.ts';
import * as fatura from '../src/repos/fatura.ts';
import * as boleto from '../src/repos/boleto.ts';
import * as liquidacao from '../src/repos/liquidacao.ts';
import * as split from '../src/repos/split.ts';
import * as contaPagar from '../src/repos/conta_pagar.ts';
import { prontidao } from '../src/repos/prontidao.ts';
import { triar } from '../src/dominio/faturamento.ts';
import { CobrancaFalsa } from '../src/sicoob/falso.ts';
import { COBRANCA_NAO_CONFIGURADA, CobrancaNaoConfigurada } from '../src/sicoob/porta.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
// O TOTAL E CONTADO, e nao escrito no rodape. Ate 04/08/2026 a ultima linha
// dizia "40 verificacoes" enquanto a suite tinha 56 - um numero fixo medindo
// outra coisa, que e a mesma classe que a K2d, a W8h e a N58 pegaram dentro das
// proprias verificacoes.
let total = 0;
const chk = (id: string, cond: boolean, d: string) => {
  total++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));
const cobranca = new CobrancaFalsa('SICOOB-T');

// ================================================================ fixture
let usinaComDono: string; let usinaSemDono: string;
let ucOk: string; let ucSemGeracao: string; let ucSemVencimento: string; let ucNaoAtivada: string;
let contratoOk: string; let orgId: string;

{
  const dono = await emA(() => donoUsina.criar({
    nome: 'Dono da usina', natureza: 'pf', documento_bruto: '529.982.247-25', chave_pix: 'dono@pix',
  }));
  const u1 = await emA(() => usinaRepo.criar({
    codigo_geradora: 'CART-0001', distribuidora: 'Equatorial', dono_usina_id: dono.id,
  }));
  const u2 = await emA(() => usinaRepo.criar({ codigo_geradora: 'CART-0002', distribuidora: 'Equatorial' }));
  usinaComDono = u1.id; usinaSemDono = u2.id;

  const org = await emA(() => originadorRepo.criar({
    nome: 'Captador', natureza: 'pf', tipo: 'parceiro_captador', documento_bruto: '123.456.789-09',
  }));
  orgId = org.id;

  /* A TARIFA E DA UC desde a migration 30 - `criarUC` abaixo a carimba com
   * 1,130000, que e o valor que as verificacoes A2 e C2 conferem em centavos. */
  await emA(() => regras.abrirVigenciaDeComissao({
    originador_tipo: 'parceiro_captador', percentual_1a: '30.00', percentual_2a: '20.00',
    vigencia_inicio: mes(2020, 1),
  }));
  await emA(() => regras.abrirVigenciaDeRepasse({
    usina_id: usinaComDono, percentual: '70.00', vigencia_inicio: mes(2020, 1),
  }));

  // Tres UCs, e cada uma existe para exercitar um caminho da triagem.
  const criarUC = async (numero: string, usina: string | null, pct: string | null, venc: Date | null,
                         situacao: string | null = null) => {
    const uc = await emA(() => ucRepo.criar({
      cliente_id: CLI, numero_uc: numero, distribuidora: 'Equatorial', tarifa_reais_por_kwh: '1.130000', data_vencimento: venc,
    }));
    if (usina && pct) {
      await emA(() => rateio.definirRateio({
        unidade_consumidora_id: uc.id, usina_id: usina, percentual_rateio: pct,
      }));
    }
    /*
     * A SITUACAO SO E PLANTADA QUANDO O CENARIO PEDE, e o default e NAO plantar.
     *
     * `rateio_situacao` e `crm_usina_cliente_id` sao campos ESPELHO: so o
     * conector os escreve. UC criada por `ucRepo.criar` - o caminho da tela -
     * nao tem nenhum dos dois, e a triagem a FATURA, porque a regra da situacao
     * so vale sobre o que veio do rateio do CRM (F4m). Entao as tres UCs
     * originais continuam medindo o que sempre mediram, sem remendo.
     *
     * A quarta e a excecao, e por isso ela recebe os DOIS campos: e a unica que
     * precisa parecer espelhada para a K2d alcanca-la.
     */
    if (situacao) {
      await emA(() => db().$executeRaw`
        UPDATE unidade_consumidora
           SET rateio_situacao = ${situacao},
               crm_usina_cliente_id = gen_random_uuid(),
               rateio_situacao_lida_em = now()
         WHERE id = ${uc.id}::uuid`);
    }
    return uc.id;
  };
  ucOk           = await criarUC('CART-UC-1', usinaComDono, '50.0000', new Date(Date.UTC(2026, 0, 10)));
  ucSemGeracao   = await criarUC('CART-UC-2', usinaSemDono, '100.0000', new Date(Date.UTC(2026, 0, 10)));
  ucSemVencimento = await criarUC('CART-UC-3', usinaComDono, '25.0000', null);
  // A quarta existe so para a K2d: completa em tudo, e o CRM nao a da por ativada.
  ucNaoAtivada = await criarUC('CART-UC-4', usinaComDono, '5.0000',
                               new Date(Date.UTC(2026, 0, 10)), 'nao_ativado');

  for (const [uc, org2] of [[ucOk, orgId], [ucSemGeracao, null], [ucSemVencimento, null],
                            [ucNaoAtivada, null]] as const) {
    const k = await emA(() => contrato.rascunhar({
      cliente_id: CLI, unidade_consumidora_id: uc, usina_id: uc === ucSemGeracao ? usinaSemDono : usinaComDono,
      originador_id: org2, data_fechamento: new Date(Date.UTC(2026, 4, 1)),
      valor_referencia_centavos: 100_000, valor_referencia_origem: 'local',
    }));
    await emA(() => contrato.ativar(k.id));
    if (uc === ucOk) contratoOk = k.id;
  }

  // Geracao MEDIDA so na usina com dono. A outra fica sem, de proposito: e a
  // reproducao da usina 0003 - 100% alocado e zero geracao lancada.
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaComDono, competencia: mes(2026, 7), geracao_kwh: '10000.0000', origem: 'local',
  }));
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaComDono, competencia: mes(2026, 8), geracao_kwh: '10000.0000', origem: 'local',
  }));
}

// ---------------------------------------------------- K1 ensaio nao escreve
{
  const r = await emA(() => fatura.ensaiarLote('2026-07-01'));
  const antes = await emA(() => fatura.daCompetencia('2026-07-01'));
  chk('K1', r.criadas === 0 && antes.length === 0 && r.recusadas >= 2,
      `ensaio triou ${r.recusadas} recusa(s) e escreveu ZERO faturas - o mesmo desenho do --ensaio do ciclo`);
}

// ---------------------------------------------------- K2 os motivos da recusa
{
  const r = await emA(() => fatura.ensaiarLote('2026-07-01'));
  chk('K2a', r.recusas.sem_geracao_lancada === 1,
      'a UC da usina sem geracao lancada e RECUSA - e o caso da usina 0003, e faturar ali seria receita sobre energia que ninguem registrou');
  chk('K2b', r.recusas.sem_vencimento === 1,
      'a UC sem data de vencimento e recusa, nao um dia escolhido pelo programador (Q-SPEC001-02)');
  /*
   * K2d - `rateio_nao_ativado` ponta a ponta (Q-SITUACAO-01, decidida em 04/08).
   *
   * A `CART-UC-4` esta COMPLETA: usina, rateio, vencimento e contrato ativo. A
   * unica coisa que a separa da `ucOk` e a situacao no CRM - um campo de
   * diferenca -, e e por isso que esta verificacao mede a regra e nao o cenario.
   * Medido em producao no dia da decisao: 12 das 41 UCs estavam assim.
   */
  /*
   * A AFIRMACAO E SOBRE A LINHA, NAO SOBRE O TOTAL - e a primeira versao desta
   * verificacao dizia `=== 1` e ficou vermelha porque o tenant do teste carrega
   * UCs de outros blocos, e uma delas tambem cai aqui. Fixar o total mediria a
   * populacao do banco de teste em vez da regra. E a terceira vez que esta
   * mesma troca aparece hoje (ver W8h e N58): quando a regra e sobre UMA linha,
   * a verificacao tem de nomear a linha.
   */
  const uc4 = r.detalhe.find((d) => d.numero_uc === 'CART-UC-4');
  chk('K2d', uc4?.motivo === 'rateio_nao_ativado' && (r.recusas.rateio_nao_ativado ?? 0) >= 1,
      `UC completa em tudo - usina, rateio, vencimento e contrato ativo - mas nao ativada no CRM `
      + `e RECUSA nomeada, e nao fatura silenciosa (motivo=${uc4?.motivo})`);

  chk('K2c', r.detalhe.every((d) => d.explicacao.length > 40),
      'cada recusa carrega a explicacao e o ponteiro da questao que a destrava');
}

// ---------------------------------------------------- K3 o lote valendo
{
  const r = await emA(() => fatura.comporLote('2026-07-01', {
    tarifas_concessionaria_centavos: { [ucOk]: 12_000 },
  }));
  const fs = await emA(() => fatura.daCompetencia('2026-07-01'));
  const f = fs[0]!;
  chk('K3a', r.criadas === 1 && fs.length === 1, `uma fatura criada de QUATRO UCs candidatas (criadas=${r.criadas})`);
  chk('K3b', f.status === 'rascunho' && f.emitida_em === null,
      'nasce em RASCUNHO: compor e conferir sao dois atos (PRD 9)');
  // 10.000 kWh x 50% = 5.000 kWh; x 1,130000 = R$ 5.650,00
  chk('K3c', f.consumo_kwh.toString() === '5000' && f.valor_consumo_centavos === 565_000,
      `a base e a GERACAO MEDIDA x o rateio: ${f.consumo_kwh} kWh -> ${f.valor_consumo_centavos} centavos (PAUTA 9a=B)`);
  chk('K3d', f.geracao_kwh_competencia.toString() === '10000' && f.tarifa_reais_por_kwh.toString() === '1.13',
      'os cinco numeros ficam gravados: reajuste de tarifa nao reescreve o historico (R23)');
  chk('K3e', f.valor_total_centavos === 577_000,
      `o total e coluna gerada: 565.000 + 12.000 = ${f.valor_total_centavos}`);
  chk('K3f', f.flag_fatura_cheia === true,
      'contrato fechado em 01/05 cobre julho inteiro: fatura cheia');
  chk('K3g', f.vencimento.toISOString().slice(0, 10) === '2026-08-10',
      `vence no mes SEGUINTE ao da competencia: ${f.vencimento.toISOString().slice(0, 10)}`);
}

// ---------------------------------------------------- K4 o lote e idempotente
{
  const r = await emA(() => fatura.comporLote('2026-07-01'));
  const fs = await emA(() => fatura.daCompetencia('2026-07-01'));
  chk('K4', r.criadas === 0 && r.recusas.ja_faturada === 1 && fs.length === 1,
      'recompor a mesma competencia nao duplica: vira recusa contada `ja_faturada`');
}

// ---------------------------------------------------- K5 a porta que recusa
{
  const fs = await emA(() => fatura.daCompetencia('2026-07-01'));
  await emA(() => fatura.emitirLote('2026-07-01'));
  await emA(() => boleto.cadastrarConector({ credencial_ref: 'vault://sicoob/teste', ativo: true }));

  const e = await lancou(() => emA(() => boleto.registrar(fs[0]!.id, COBRANCA_NAO_CONFIGURADA)));
  chk('K5', e instanceof CobrancaNaoConfigurada && e.status === 503,
      `sem credencial, a porta padrao RECUSA alto em vez de emitir boleto de mentira (veio ${e?.name})`);
}

// ---------------------------------------------------- K6 boleto pelo adaptador falso
let faturaJulho: string; let nossoNumero: string;
{
  const fs = await emA(() => fatura.daCompetencia('2026-07-01'));
  faturaJulho = fs[0]!.id;
  const r6 = await emA(() => boleto.registrar(faturaJulho, cobranca));
  const b = r6.boleto!;
  nossoNumero = b.nosso_numero!;
  chk('K6a', r6.registrado && b.status === 'registrado' && b.valor_registrado_centavos === 577_000,
      `boleto registrado com o total congelado (${b.nosso_numero})`);
  chk('K6b', b.pix_copia_e_cola != null && b.codigo_barras != null,
      'hibrido: codigo de barras e QR Pix no mesmo documento (PRD 4.3)');

  const denovo = await emA(() => boleto.registrar(faturaJulho, cobranca));
  chk('K6c', denovo.boleto!.id === b.id && cobranca.chamadas.filter((c) => c.verbo === 'registrar').length === 1,
      'registrar de novo NAO sobe um segundo boleto: o cliente nao recebe dois documentos da mesma cobranca');
}

// ---------------------------------------------------- K7 o banco paga, e o split roda
let liquidacaoJulho: string;
{
  const pago = cobranca.pagar(nossoNumero, { juros: 2_000, multa: 1_000 });
  const r = await emA(() => liquidacao.baixar({
    fatura_id: faturaJulho,
    data_liquidacao: new Date(Date.UTC(2026, 7, 12)),
    valor_liquidado_centavos: pago.valor,
    juros_centavos: pago.juros, multa_centavos: pago.multa,
    origem: 'webhook_sicoob', id_externo: pago.idExterno,
  }));
  liquidacaoJulho = r.liquidacao_id;
  chk('K7a', r.split !== null && r.split.itens === 4,
      `a baixa rodou o split na mesma transacao: ${r.split?.itens} itens`);

  const s = await emA(() => split.porLiquidacao(liquidacaoJulho));
  const por = (t: string) => s!.split_item.find((i) => i.tipo === t)!;
  const soma = s!.split_item.reduce((a, i) => a + i.valor_centavos, 0);
  chk('K7b', soma === 580_000,
      `PRD 5.5 a soma dos itens e o liquidado, ao centavo: ${soma}`);
  // base do repasse = 565.000 + fatia proporcional do juro (3.000 x 565/577 = 2.938)
  chk('K7c', s!.base_repasse_centavos === 567_938 && por('repasse_usina').valor_centavos === 397_557,
      `o juro entra PROPORCIONALMENTE na base do repasse: ${s!.base_repasse_centavos}, e 70% dele e ${por('repasse_usina').valor_centavos}`);
  chk('K7d', por('comissao').base_calculo_centavos === 565_000 && por('comissao').valor_centavos === 169_500,
      'a comissao incide so sobre o consumo, a 30% - a 1a parcela do captador (PRD 5.4)');
  chk('K7e', por('repasse_concessionaria').valor_centavos === 12_000,
      'a tarifa da concessionaria volta como item proprio: e ela que faz a soma fechar');
  chk('K7f', s!.parcela_comissao === 1, 'a execucao registra QUAL parcela incidiu');

  const k = await emA(() => contrato.vigenteDaUC(ucOk));
  chk('K7g', k?.faturas_cheias_pagas === 1,
      'o contador do contrato avancou para 1 - pelo gatilho do banco, nao pela aplicacao');

  /*
   * K7h-K7l: AS DUAS ESCRITAS QUE FALTAVAM. PRD 5.5 itens 2 e 3, Q-PAGAMENTO-01.
   *
   * Ate 03/08/2026 a mesma transacao gravava `split_execucao` e `split_item` e
   * parava ali. O sistema sabia ao centavo quanto devia ao dono da usina e ao
   * originador, e nao tinha ONDE registrar que pagou.
   *
   * O que estas verificacoes prendem nao e "as contas existem" - e que elas
   * carregam EXATAMENTE os valores que K7c, K7d e K7e acabaram de conferir no
   * split. Afirmar constantes proprias aqui deixaria as duas metades divergirem
   * sem nenhuma delas parecer errada, que e o modo de falha da questao inteira.
   */
  chk('K7h', r.split!.contas_a_pagar === 3,
      `o split provisionou 3 contas a pagar na MESMA transacao - uma por item de despesa, `
      + `e nenhuma para liquido_g3, que e receita (veio ${r.split!.contas_a_pagar})`);

  const contas = await emA(() => contaPagar.listar({}));
  const porBenef = (t: string) => contas.find((c: any) => c.beneficiario_tipo === t)!;

  chk('K7i', porBenef('dono_usina')?.valor_centavos === por('repasse_usina').valor_centavos
        && porBenef('originador')?.valor_centavos === por('comissao').valor_centavos
        && porBenef('concessionaria')?.valor_centavos === por('repasse_concessionaria').valor_centavos,
      'cada conta carrega o valor do split_item que a gerou, ao centavo - apuracao e quitacao '
      + 'nao podem divergir sem que uma das duas pareca certa');

  chk('K7j', contas.every((c: any) => c.status === 'aberta' && c.valor_pago_centavos === 0),
      'as tres nascem ABERTAS e com zero pago - provisionar nao e pagar');

  // O vencimento do PRD 5.5: dia 10 do mes seguinte a COMPETENCIA, e nao a data
  // do caixa. A baixa foi em 12/08 e a competencia e julho -> 10/08.
  chk('K7k', contas.every((c: any) => c.vencimento.getUTCDate() === 10 && c.vencimento.getUTCMonth() === 7),
      `o vencimento sai da COMPETENCIA (julho -> 10/08), nao da data da baixa (12/08) - contar do `
      + `caixa faria o repasse de um dono vencer em datas diferentes por acidente de quando o `
      + `cliente pagou (veio ${contas[0]?.vencimento?.toISOString().slice(0, 10)})`);

  chk('K7l', (await emA(() => contaPagar.itensDeSplitSemConta())).length === 0,
      'e a conferencia entre apuracao e quitacao nao acha buraco: nenhum split_item de despesa '
      + 'ficou sem conta');
}

// ---------------------------------------------------- K8 webhook duplicado
{
  const antes = await emA(() => split.porLiquidacao(liquidacaoJulho));
  const r = await emA(() => liquidacao.baixar({
    fatura_id: faturaJulho,
    data_liquidacao: new Date(Date.UTC(2026, 7, 12)),
    valor_liquidado_centavos: 580_000, juros_centavos: 2_000, multa_centavos: 1_000,
    origem: 'webhook_sicoob', id_externo: `evt-${nossoNumero}`,
  }));
  const depois = await emA(() => split.porLiquidacao(liquidacaoJulho));
  chk('K8', r.ja_existia === true && r.liquidacao_id === liquidacaoJulho
        && antes!.split_item.length === depois!.split_item.length,
      'PRD 6: o mesmo evento chegando de novo devolve a baixa existente, sem 409 e sem repartir duas vezes');
}

// ---------------------------------------------------- K9 a 2a competencia paga a 2a parcela
{
  await emA(() => fatura.comporLote('2026-08-01'));
  await emA(() => fatura.emitirLote('2026-08-01'));
  const fs = await emA(() => fatura.daCompetencia('2026-08-01'));
  const f2 = fs[0]!;
  const b = (await emA(() => boleto.registrar(f2.id, cobranca))).boleto!;
  const pago = cobranca.pagar(b.nosso_numero!);
  const r = await emA(() => liquidacao.baixar({
    fatura_id: f2.id, data_liquidacao: new Date(Date.UTC(2026, 8, 10)),
    valor_liquidado_centavos: pago.valor, origem: 'webhook_sicoob', id_externo: pago.idExterno,
  }));
  const s = await emA(() => split.porLiquidacao(r.liquidacao_id));
  const com = s!.split_item.find((i) => i.tipo === 'comissao')!;
  chk('K9a', s!.parcela_comissao === 2 && com.percentual_aplicado!.toString() === '20',
      `a 2a fatura cheia paga a 2a parcela: ${com.percentual_aplicado}% (PRD 5.4 - captador 30 + 20)`);
  const k = await emA(() => contrato.vigenteDaUC(ucOk));
  chk('K9b', k?.faturas_cheias_pagas === 2, 'contador em 2');
}

// ---------------------------------------------------- K10 da 3a em diante, zero
{
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaComDono, competencia: mes(2026, 9), geracao_kwh: '10000.0000', origem: 'local',
  }));
  await emA(() => fatura.comporLote('2026-09-01'));
  await emA(() => fatura.emitirLote('2026-09-01'));
  const fs = await emA(() => fatura.daCompetencia('2026-09-01'));
  const b = (await emA(() => boleto.registrar(fs[0]!.id, cobranca))).boleto!;
  const pago = cobranca.pagar(b.nosso_numero!);
  const r = await emA(() => liquidacao.baixar({
    fatura_id: fs[0]!.id, data_liquidacao: new Date(Date.UTC(2026, 9, 10)),
    valor_liquidado_centavos: pago.valor, origem: 'webhook_sicoob', id_externo: pago.idExterno,
  }));
  const s = await emA(() => split.porLiquidacao(r.liquidacao_id));
  chk('K10a', s!.parcela_comissao === null && !s!.split_item.some((i) => i.tipo === 'comissao'),
      'da 3a fatura cheia em diante NAO ha item de comissao (PRD 5.4) - e o lucro real da G3 comeca aqui (5.6)');
  const soma = s!.split_item.reduce((a, i) => a + i.valor_centavos, 0);
  chk('K10b', soma === s!.valor_liquidado_centavos,
      'e a invariante do centavo continua fechando sem o item de comissao');
}

// ---------------------------------------------------- K11 R12: usina sem dono
{
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaSemDono, competencia: mes(2026, 7), geracao_kwh: '5000.0000', origem: 'local',
  }));
  await emA(() => regras.abrirVigenciaDeRepasse({
    usina_id: usinaSemDono, percentual: '70.00', vigencia_inicio: mes(2020, 1),
  }));
  const r = await emA(() => fatura.comporLote('2026-07-01'));
  chk('K11a', r.criadas === 1 && r.alertas.usina_sem_dono === 1,
      'a UC da usina sem dono FATURA e vira ALERTA, nao recusa: a cobranca ao cliente nao depende do cadastro do dono');

  const fs = await emA(() => fatura.daCompetencia('2026-07-01'));
  const nova = fs.find((f) => f.usina_id === usinaSemDono)!;
  await emA(() => fatura.emitir(nova.id));
  const baixa = await emA(() => liquidacao.baixar({
    fatura_id: nova.id, data_liquidacao: new Date(Date.UTC(2026, 7, 12)),
    valor_liquidado_centavos: nova.valor_total_centavos!, origem: 'manual',
  }));
  chk('K11b', baixa.split === null && /R12/.test(baixa.split_bloqueado ?? ''),
      'a baixa VALE e o split fica pendente: recusar a entrada de dinheiro por falta de cadastro puniria o cliente que pagou');

  const pendentes = await emA(() => liquidacao.pendentesDeSplit());
  chk('K11c', pendentes.length === 1 && pendentes[0]!.usina_sem_dono === true,
      'a pendencia e VISIVEL numa fila, em vez de ficar implicita numa ausencia de linha');

  // Cadastra o dono e reparte o pendente.
  const d2 = await emA(() => donoUsina.criar({
    nome: 'Dono tardio', natureza: 'pj', documento_bruto: '11.222.333/0001-81', chave_pix: 'tardio@pix',
  }));
  await emA(() => usinaRepo.editar(usinaSemDono, { dono_usina_id: d2.id }));
  const s = await emA(() => liquidacao.repartirPendente(baixa.liquidacao_id));
  chk('K11d', s.itens.length >= 2 && (await emA(() => liquidacao.pendentesDeSplit())).length === 0,
      'com o dono cadastrado, o pendente reparte pela MESMA funcao - nao ha segundo caminho de reparticao');
}

// ---------------------------------------------------- K12 split nao reparte duas vezes
{
  const e = await lancou(() => emA(() => liquidacao.repartirPendente(liquidacaoJulho)));
  chk('K12', e instanceof split.SplitJaExecutado,
      `repartir de novo a mesma liquidacao e recusado (veio ${e?.name})`);
}

// ---------------------------------------------------- K13 fatura liquidada nao cancela
{
  const e = await lancou(() => emA(() => fatura.cancelar(faturaJulho, 'tentativa')));
  chk('K13a', e?.name === 'TransicaoDeFaturaInvalida',
      'fatura liquidada nao cancela: desfazer o documento sem desfazer o caixa deixaria dinheiro sem titulo');
  const f = await lancou(() => emA(() => fatura.cancelar(faturaJulho, '   ')));
  chk('K13b', f instanceof TypeError || f?.status === 422,
      'cancelamento sem motivo e recusado: a regra 9 pede "o que", e motivo vazio nao responde');
}

// ---------------------------------------------------- K14 isolamento
{
  const doB = await emB(() => fatura.daCompetencia('2026-07-01'));
  const posicaoB = await emB(() => fatura.posicao('2026-07-01'));
  const repassesB = await emB(() => split.repassesPorDono());
  chk('K14', doB.length === 0 && posicaoB.length === 0 && repassesB.length === 0,
      'o tenant B nao ve fatura, posicao nem repasse do A - inclusive pelas VIEWS, que declaram security_invoker');
}

// ---------------------------------------------------- K15 os extratos
{
  const repasses = await emA(() => split.repassesPorDono());
  const comissoes = await emA(() => split.comissoesPorOriginador());
  chk('K15a', repasses.length > 0 && repasses.every((r: any) => r.valor_centavos > 0),
      `extrato de repasse por dono: ${repasses.length} linha(s) (PRD 9)`);
  chk('K15b', comissoes.length === 2 && comissoes.every((c: any) => [1, 2].includes(c.parcela_comissao)),
      'extrato de comissao por originador, com a parcela que incidiu em cada competencia');
}

// ---------------------------------------------------- K16 o uso da usina
{
  const uso = await emA(() => fatura.usoDasUsinas('2026-07-01'));
  const daComDono = uso.find((u: any) => u.codigo_geradora === 'CART-0001');
  chk('K16', Number(daComDono.saldo_kwh) >= 0,
      `RATEIO-USO-01: 10.000 gerados, ${daComDono.consumo_faturado_kwh} faturados, saldo ${daComDono.saldo_kwh} - nao negativo por construcao, com a base sendo a geracao medida`);
}

// ---------------------------------------------------- K17 a fila de retentativa
{
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaComDono, competencia: mes(2026, 10), geracao_kwh: '10000.0000', origem: 'local',
  }));
  await emA(() => fatura.comporLote('2026-10-01'));
  await emA(() => fatura.emitirLote('2026-10-01'));
  const fs = await emA(() => fatura.daCompetencia('2026-10-01'));
  const alvo = fs.find((f) => f.usina_id === usinaComDono)!;

  cobranca.falharProximoRegistro = 'timeout da Sicoob';
  const r17 = await emA(() => boleto.registrar(alvo.id, cobranca));
  // A leitura e em OUTRA transacao de proposito: e ela que prova que a gravacao
  // da falha COMMITOU. Na primeira versao deste repositorio o erro era relancado,
  // e o proprio throw revertia a linha - `tentativas` voltava a zero e a fila de
  // retentativa do PRD 6 ficava sem memoria nenhuma. Foi este teste que pegou.
  const b = await emA(() => boleto.porFatura(alvo.id));
  chk('K17a', r17.registrado === false && b?.status === 'erro' && b.tentativas === 1
        && /timeout/.test(b.ultimo_erro ?? ''),
      'a falha COMMITA: a linha guarda o que tentou, e quem devolve 502 e a rota - nao ha 200 para emissao que nao aconteceu');

  const ok2 = await emA(() => boleto.registrar(alvo.id, cobranca));
  chk('K17b', ok2.registrado && ok2.boleto!.id === b!.id,
      'a retentativa REAPROVEITA a linha em vez de criar um segundo boleto (PRD 6)');
}

// -------------------------------------- K17c-e o pagador sem documento (Q-PAGADOR-01)
/*
 * A METADE ABERTA DA `Q-PAGADOR-01`, fechada em 06/08/2026. Ate aqui
 * `boleto.ts` mandava `documento ?? ''` e a string vazia viajava: quem recusava
 * era a Sicoob, e a recusa voltava pelo `catch` traduzida em **502** - o codigo
 * que diz "o outro lado falhou", quando o que faltava era um CPF que ninguem
 * digitou.
 *
 * AS TRES VERIFICACOES MEDEM COISAS DIFERENTES, e a terceira e a que importa
 * mais e seria a mais facil de esquecer: a linha do boleto NAO pode nascer. Todo
 * o resto deste arquivo trabalha para que ela nasca antes da chamada - mas aqui
 * nada foi tentado, e uma linha `pendente` poria na fila do `PRD` 6 um boleto
 * que nao pode dar certo ate alguem digitar um documento. A fila, por decisao
 * registrada em `dominio/agenda.ts`, **nunca desiste sozinha**.
 */
{
  const semDocumento = await emA(() => clienteRepo.criar({ nome: 'K17 pagador sem CPF' }));
  const ucSemDoc = await emA(() => ucRepo.criar({
    cliente_id: semDocumento.id, numero_uc: 'K17-SEM-DOC', distribuidora: 'Equatorial', tarifa_reais_por_kwh: '1.130000',
    data_vencimento: new Date('2026-11-10T00:00:00Z'),
  }));
  await emA(() => rateio.definirRateio({
    unidade_consumidora_id: ucSemDoc.id, usina_id: usinaComDono, percentual_rateio: '5.0000',
  }));
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaComDono, competencia: mes(2026, 11), geracao_kwh: '10000.0000', origem: 'local',
  }));
  /*
   * O CLIENTE GANHA DOCUMENTO PARA O CONTRATO ATIVAR (R9) E O PERDE DEPOIS, e o
   * caminho torto e o ponto: sem ele nao ha fatura, e sem fatura nao ha boleto
   * para recusar. E ele NAO e artificial - `contrato.ativar()` confere o
   * documento uma vez, no ato; nada impede a linha de mudar depois, e a guarda
   * do boleto existe justamente porque a checagem da R9 e de OUTRO momento.
   */
  await emA(() => clienteRepo.lancarDocumentosPorCliente(new Map([[semDocumento.id, '55678901257']])));
  const ct = await emA(() => contrato.rascunhar({
    cliente_id: semDocumento.id, unidade_consumidora_id: ucSemDoc.id, usina_id: usinaComDono,
    originador_id: orgId, data_fechamento: new Date('2026-10-01T00:00:00Z'),
    valor_referencia_centavos: 100_000, valor_referencia_origem: 'local',
  }));
  await emA(() => contrato.ativar(ct.id));
  await emA(() => fatura.comporLote('2026-11-01'));
  await emA(() => fatura.emitirLote('2026-11-01'));
  const alvoSemDoc = (await emA(() => fatura.daCompetencia('2026-11-01')))
    .find((f) => f.unidade_consumidora_id === ucSemDoc.id)!;
  await emA(() => db().$executeRawUnsafe(
    `UPDATE cliente SET documento = NULL, documento_validado = false WHERE id = '${semDocumento.id}'`));

  let subiu: any = null;
  try { await emA(() => boleto.registrar(alvoSemDoc.id, cobranca)); }
  catch (e) { subiu = e; }

  chk('K17c', subiu?.name === 'PagadorSemDocumento' && subiu?.status === 422,
      'boleto de pagador sem CPF/CNPJ para AQUI, com erro nomeado e 422 - nao vira 502 da Sicoob, '
      + 'que mandaria procurar indisponibilidade de banco onde falta um campo');
  chk('K17d', /K17-SEM-DOC/.test(subiu?.message ?? '') && /npm run documentos/.test(subiu?.message ?? ''),
      'a mensagem diz QUAL UC e o que fazer - num lote de 28, "algum cliente" nao e acionavel');

  const nenhum = await emA(() => boleto.porFatura(alvoSemDoc.id));
  chk('K17e', nenhum == null,
      'e NENHUMA linha de boleto foi criada: nada foi tentado, e uma linha pendente poria na fila '
      + 'do PRD 6 um boleto que nao pode dar certo - e a fila nunca desiste sozinha');
}

// ---------------------------------------------------- K18 prontidao: nao medido nao e ok
{
  /*
   * O TESTE NASCEU DE UM DEFEITO ACHADO EM PRODUCAO, em 28/07. Tres camadas -
   * geracao da competencia, tarifa vigente e regra de comissao - tem por
   * universo as UCs CONTRATADAS. Num tenant sem contrato nenhum o universo e
   * vazio, e "0 de 0" saiu marcado como `ok`: o relatorio mostrava verde sobre
   * o que nao tinha medido, e verde autoriza.
   *
   * O tenant B da fixture nao tem nada, e por isso e o sujeito certo.
   */
  const pB = await emB(() => prontidao('2026-07-01'));
  /* `tarifa_vigente` VIROU `tarifa_da_uc` em 14/08 (migration 30): a camada
   * continua existindo, continua sendo derivada e continua bloqueando a fatura -
   * o que mudou e a UNIDADE de contagem, de distribuidora para UC. O nome mudou
   * junto porque um rotulo que aponta para uma tabela que nao existe mais e o
   * comeco de alguem procurar a tabela. */
  const derivadas = pB.camadas.filter((c) =>
    ['geracao_da_competencia', 'tarifa_da_uc', 'regra_de_comissao'].includes(c.camada));

  chk('K18a', derivadas.length === 3 && derivadas.every((c) => c.situacao === 'nao_medido' && c.total === 0),
      'camada de universo vazio volta NAO_MEDIDO, nunca ok - zero sobre nada nao e "pronto", e a mesma licao do "zero divergencias" do conector');
  chk('K18b', pB.pode_faturar === false && pB.pode_repartir === false,
      'e `pode_faturar` exige ok, nunca nao_medido: contar o nao medido como pronto seria o relatorio autorizando o que nao conferiu');

  const pA = await emA(() => prontidao('2026-07-01'));
  const porNome = (n: string) => pA.camadas.find((c) => c.camada === n)!;
  chk('K18c', porNome('geracao_da_competencia').situacao === 'ok' && porNome('geracao_da_competencia').total > 0,
      `com contrato e geracao lancada a mesma camada volta ok sobre universo real (${porNome('geracao_da_competencia').total} usina(s))`);
  chk('K18d', porNome('dono_da_usina').efeito === 'bloqueia_split' && porNome('contrato_ativo').efeito === 'bloqueia_fatura',
      'dono de usina bloqueia o SPLIT e contrato bloqueia a FATURA - a distincao e a mesma de recusa e alerta (R33)');
  chk('K18e', pA.camadas.filter((c) => c.situacao === 'pendente').every((c) => c.dono.length > 0),
      'toda camada pendente carrega dono nomeado - questao sem dono e automaticamente vermelha (QUESTOES 1)');

  /*
   * K18f a K18i - a camada `originador_do_contrato`, que a Q-PRONTIDAO-COMIS-01
   * pediu e a Q-ORIGINADOR-01 autorizou a escrever (decidida em 29/07: a
   * carteira LEVA originador, e nenhuma comissao foi paga ainda).
   *
   * A FIXTURE JA ERA O SUJEITO CERTO e ninguem tinha reparado: dos tres
   * contratos ativos do tenant A, so o de `ucOk` tem originador - os de
   * `ucSemGeracao` e `ucSemVencimento` nascem com `originador_id: null`. Antes
   * desta camada, esses dois atravessavam a prontidao inteira sem aparecer em
   * lugar nenhum, que e exatamente o defeito que se esta prendendo.
   */
  /*
   * O NUMERO NAO E FIXO AQUI, e a primeira versao deste teste errou por isso:
   * ela dizia "2 de 3" lendo a fixture, e a fixture nao e o estado - os testes
   * acima criam contrato (a renovacao, o caso da usina sem dono). Numero fixo
   * teria quebrado no dia em que alguem acrescentasse um caso acima, e o
   * culpado pareceria ser a camada.
   *
   * Entao a camada e conferida contra o BANCO, na mesma condicao: se ela contar
   * diferente do que a tabela tem, e a camada que esta errada.
   *
   * A CONDICAO GANHOU UMA METADE EM 04/08, e esta verificacao foi quem acusou.
   * O universo da prontidao passou a ser o FATURAVEL - `status = 'ativa'` e,
   * quando a UC e espelhada, rateio `ativado` no CRM (`Q-SITUACAO-01`). A
   * consulta daqui continuava com a condicao velha e as duas divergiram: a
   * camada disse 3 de 4 e a tabela 4 de 5, porque a `CART-UC-4` e espelhada e
   * nao ativada. Nao foi o teste que quebrou - foi o teste fazendo exatamente o
   * que existe para fazer, comparando dois caminhos independentes.
   *
   * `db()` E NAO `prisma`, e a primeira tentativa errou nisto: o contexto de
   * tenant e emitido DENTRO do `$transaction`, no client de transacao. Uma
   * consulta pelo client de fora corre sem `app.current_tenant_id` e a RLS
   * devolve zero linhas - e o teste diria "0 de 0" achando que mediu. E o mesmo
   * modo de falha da regra 3: resultado vazio, nao erro de permissao.
   */
  const [real]: any[] = await emA(() => db().$queryRaw`
    SELECT count(*) FILTER (WHERE k.originador_id IS NULL) AS sem,
           count(*)                                        AS total
      FROM contrato k
      JOIN unidade_consumidora uc
        ON uc.tenant_id = k.tenant_id AND uc.id = k.unidade_consumidora_id
     WHERE k.status = 'ativo' AND uc.status = 'ativa'
       AND (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado')`);
  const orig = porNome('originador_do_contrato');
  chk('K18f', orig.faltam === Number(real.sem) && orig.total === Number(real.total)
           && orig.faltam > 0 && orig.situacao === 'pendente',
      `contrato ativo sem originador e ACUSADO, e a contagem bate com a tabela: ${orig.faltam} de ${orig.total} (tabela: ${real.sem} de ${real.total}) - antes desta camada eles eram invisiveis`);
  chk('K18g', orig.efeito === 'bloqueia_split' && pA.pode_repartir === false,
      'e a marca e bloqueia_split: nao impede a fatura EXISTIR e derruba `pode_repartir` - o sistema nao se declara pronto para repartir o que vai fechar sem pagar comissao');

  /*
   * O SEGUNDO SENTIDO, e e ele que da valor ao primeiro. A Q-PRONTIDAO-COMIS-01
   * dizia que `regra_de_comissao` devolve `nao_medido` tanto para "nao ha
   * contratos" quanto para "ha contratos e nenhum tem originador", e que as duas
   * apareciam como o MESMO `?` na tela. Agora as duas continuam `nao_medido`
   * naquela camada - e a de cima as separa.
   */
  const origB = pB.camadas.find((c) => c.camada === 'originador_do_contrato')!;
  chk('K18h', origB.situacao === 'nao_medido' && origB.total === 0,
      'universo vazio (tenant sem contrato) continua NAO_MEDIDO nesta camada tambem - a licao do K18a vale para a nova');
  chk('K18i', orig.situacao !== origB.situacao,
      'e os dois casos que a Q-PRONTIDAO-COMIS-01 confundia agora sao DISTINGUIVEIS: "nenhum contrato" e nao_medido, "contrato sem originador" e pendente');

  /*
   * K18j - O ESPELHO, CONFERIDO CONTRA O ORIGINAL.
   *
   * `prontidao.ts` cita esta verificacao desde 04/08/2026 e ela NAO EXISTIA -
   * o comentario dizia "o K18j compara os dois lados um contra o outro" sobre
   * um id que nenhum arquivo definia. Fica registrado: e a mesma classe da
   * citacao inventada que a sessao 14 pegou, e a regra 8 e literal - invariante
   * sem teste e comentario.
   *
   * O QUE ELA PRENDE. O universo da prontidao e o predicado da triagem sao a
   * MESMA regra escrita duas vezes, em duas linguagens: um `WITH uc_ativa` em
   * SQL e um `if` em TypeScript. Espelho tem modo de falha proprio - divergir
   * sem que nenhum dos dois lados pareca errado -, e ja aconteceu: em 04/08 a
   * condicao tinha duas metades e so uma foi mudada.
   *
   * Entao a afirmacao nao e sobre um numero meu. E: **o universo da prontidao e
   * exatamente o conjunto de UCs ativas que a triagem NAO recusa por
   * `rateio_nao_ativado`**. Se um lado mudar sozinho, esta linha fica vermelha.
   */
  /*
   * NAO SE COMPARA CONTRA `ensaiarLote`, e a primeira versao desta verificacao
   * fazia isso e ficou vermelha - com razao. A triagem devolve UM motivo por UC,
   * o PRIMEIRO, entao UC sem contrato para em `sem_contrato_vigente` e nunca
   * chega a ser contada como `rateio_nao_ativado`. Contar pela saida mediria a
   * ORDEM das recusas, nao a regra.
   *
   * O que se compara sao as duas GRAFIAS da mesma regra. Cada UC ativa do banco
   * e passada por `triar()` com todo o resto COMPLETO - contrato, rateio,
   * geracao, vencimento -, de modo que a unica recusa possivel seja a situacao
   * do rateio. O que sobra e o universo, e ele tem de bater com o da prontidao.
   */
  const ucsAtivas: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT id::text, numero_uc, crm_usina_cliente_id::text, rateio_situacao
       FROM unidade_consumidora WHERE status = 'ativa'`));

  const recusadasPelaSituacao = ucsAtivas.filter((u) => {
    const t = triar({
      unidade_consumidora_id: u.id, numero_uc: u.numero_uc,
      contrato_id: 'contrato-ficticio', data_fechamento: mes(2020, 1),
      usina_id: 'usina-ficticia', percentual_rateio: '10.0000',
      geracao_kwh: '10000.0000', data_vencimento: new Date(Date.UTC(2000, 0, 10)),
      dono_usina_id: null, ja_tem_fatura: false,
      rateio_situacao: u.rateio_situacao, crm_usina_cliente_id: u.crm_usina_cliente_id,
    }, mes(2026, 7));
    return t.faturar === false && t.motivo === 'rateio_nao_ativado';
  }).length;

  chk('K18j', pA.ucs_ativas === ucsAtivas.length - recusadasPelaSituacao,
      `o universo da prontidao (${pA.ucs_ativas}) e exatamente o que a triagem NAO recusa pela situacao do `
      + `rateio (${ucsAtivas.length} ativas - ${recusadasPelaSituacao}) - a mesma regra escrita em SQL e em `
      + 'TypeScript, conferida uma contra a outra e nao contra um numero meu. Em 04/08 ela tinha duas '
      + 'metades e so uma foi mudada');
}

// ---------------------------------------------------- K19 a camada do documento do cliente
//
// A CAMADA QUE FALTAVA, e ela nao foi achada por auditoria: apareceu percorrendo
// o caminho para a primeira fatura em 04/08/2026. `documento_validado` era false
// em 45 de 45 clientes ativos de producao, e a R9 recusa levar contrato para
// `ativo` sem ele - entao os 29 contratos a digitar seriam 29 rascunhos.
//
// A prontidao contava dez camadas e NENHUMA media isso. O relatorio dizia "29
// sem contrato ativo" e mandava digitar; o efeito chegaria uma camada adiante e
// com o nome errado, porque rascunho nao ocupa a UC e a triagem recusa por
// `sem_contrato_vigente` - a PRIMEIRA da ordem, atras da qual nada e medido.
{
  const antes = await emA(() => prontidao('2026-07-01'));
  const doc = antes.camadas.find((c) => c.camada === 'documento_do_cliente')!;

  /*
   * AS AFIRMACOES SAO SOBRE O DELTA, e nao sobre o total. O banco de teste
   * acumula clientes das suites anteriores - a `repos-cliente` deixa dois sem
   * documento validado -, e prender um numero absoluto aqui mediria a ORDEM DE
   * EXECUCAO das suites em vez da regra. E a mesma troca que a K2d, a W8h e a
   * N58 ja fizeram, e e a quarta vez que ela aparece.
   */
  const base = doc.faltam;

  chk('K19a', doc !== undefined && doc.efeito === 'bloqueia_fatura',
      'a camada existe e bloqueia FATURA, nao split: sem contrato ativo nao ha o que cobrar, nem por Pix');
  chk('K19b', doc.total > 0 && doc.total <= antes.ucs_ativas,
      `o universo sao PESSOAS de UC faturavel (${doc.total}), e ele cabe dentro do de UCs (${antes.ucs_ativas}) - `
      + 'nunca o contrario, porque uma pessoa pode ter varias UCs e nenhuma UC tem dois clientes');
  chk('K19c', antes.camadas[0]!.camada === 'documento_do_cliente',
      'e ela vem PRIMEIRA, antes de `contrato_ativo`: a ordem do relatorio e a ordem em que o trabalho destrava o proximo, '
      + 'e digitar contrato antes disto produz rascunho, nao contrato');

  /*
   * O par mudo: um cliente novo SEM documento, com UC faturavel. Um campo de
   * diferenca em relacao ao da fixture, e ele mora na outra tabela.
   */
  const semDoc = await emA(() => clienteRepo.criar({ nome: 'K19 sem documento' }));
  await emA(() => ucRepo.criar({
    cliente_id: semDoc.id, numero_uc: 'K19-UC-1', distribuidora: 'Equatorial' }));

  const depois = await emA(() => prontidao('2026-07-01'));
  const doc2 = depois.camadas.find((c) => c.camada === 'documento_do_cliente')!;

  chk('K19d', doc2.faltam === base + 1 && doc2.situacao === 'pendente',
      `o cliente sem documento e ACUSADO: a camada sobe exatamente UM (${base} -> ${doc2.faltam}) - antes dela ele atravessava a prontidao inteira sem aparecer`);
  chk('K19e', depois.pode_faturar === false,
      'e `pode_faturar` cai, que e o que impede o relatorio de autorizar o que a R9 vai recusar');

  /*
   * CONTADA EM PESSOAS, NAO EM UCs - e a diferenca entre os dois totais nao e
   * ruido: e a Q-CLIENTEDUP-01 aparecendo de lado. Uma segunda UC para a MESMA
   * pessoa nao acrescenta trabalho, porque ela tem UM CPF.
   */
  await emA(() => ucRepo.criar({
    cliente_id: semDoc.id, numero_uc: 'K19-UC-2', distribuidora: 'Equatorial' }));
  const terceira = await emA(() => prontidao('2026-07-01'));
  const doc3 = terceira.camadas.find((c) => c.camada === 'documento_do_cliente')!;
  const contrato3 = terceira.camadas.find((c) => c.camada === 'contrato_ativo')!;

  chk('K19f', doc3.faltam === doc2.faltam && doc3.total === doc2.total,
      `a segunda UC da MESMA pessoa nao move a camada (${doc3.faltam} de ${doc3.total}) - o trabalho e um CPF, nao dois`);
  chk('K19g', contrato3.total > doc3.total,
      `e por isso o total desta camada (${doc3.total} pessoas) e MENOR que o da de baixo (${contrato3.total} UCs) - `
      + 'as duas contam universos diferentes de proposito, e a diferenca e quantas pessoas tem mais de uma UC');

  /*
   * E o fechamento: validar o documento fecha a camada, sem tocar em UC nenhuma.
   */
  await emA(() => clienteRepo.lancarDocumentosPorCliente(new Map([[semDoc.id, '55678901257']])));
  const quarta = await emA(() => prontidao('2026-07-01'));
  const doc4 = quarta.camadas.find((c) => c.camada === 'documento_do_cliente')!;
  chk('K19h', doc4.faltam === base,
      `e a camada VOLTA ao que era quando o documento e lancado (${doc3.faltam} -> ${doc4.faltam}, base ${base}) - `
      + 'uma escrita em `cliente`, e nada em UC nem em contrato');
}

console.log();
if (falhas > 0) { console.log(`--- carteira: ${falhas} FALHA(S)`); await pools.transacional.end(); await pools.relatorio.end(); process.exit(1); }
console.log(`--- carteira ponta a ponta: ${total} verificacoes, 0 falhas`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
