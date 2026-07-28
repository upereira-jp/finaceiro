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
import { withTenantEm } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as donoUsina from '../src/repos/dono_usina.ts';
import * as usinaRepo from '../src/repos/usina.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as originadorRepo from '../src/repos/originador.ts';
import * as regras from '../src/repos/regras.ts';
import * as fatura from '../src/repos/fatura.ts';
import * as boleto from '../src/repos/boleto.ts';
import * as liquidacao from '../src/repos/liquidacao.ts';
import * as split from '../src/repos/split.ts';
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
const chk = (id: string, cond: boolean, d: string) => {
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
let ucOk: string; let ucSemGeracao: string; let ucSemVencimento: string;
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

  await emA(() => regras.abrirVigenciaDeTarifa({
    distribuidora: 'Equatorial', tarifa_reais_por_kwh: '1.130000', vigencia_inicio: mes(2020, 1),
  }));
  await emA(() => regras.abrirVigenciaDeComissao({
    originador_tipo: 'parceiro_captador', percentual_1a: '30.00', percentual_2a: '20.00',
    vigencia_inicio: mes(2020, 1),
  }));
  await emA(() => regras.abrirVigenciaDeRepasse({
    usina_id: usinaComDono, percentual: '70.00', vigencia_inicio: mes(2020, 1),
  }));

  // Tres UCs, e cada uma existe para exercitar um caminho da triagem.
  const criarUC = async (numero: string, usina: string | null, pct: string | null, venc: Date | null) => {
    const uc = await emA(() => ucRepo.criar({
      cliente_id: CLI, numero_uc: numero, distribuidora: 'Equatorial', data_vencimento: venc,
    }));
    if (usina && pct) {
      await emA(() => rateio.definirRateio({
        unidade_consumidora_id: uc.id, usina_id: usina, percentual_rateio: pct,
      }));
    }
    return uc.id;
  };
  ucOk           = await criarUC('CART-UC-1', usinaComDono, '50.0000', new Date(Date.UTC(2026, 0, 10)));
  ucSemGeracao   = await criarUC('CART-UC-2', usinaSemDono, '100.0000', new Date(Date.UTC(2026, 0, 10)));
  ucSemVencimento = await criarUC('CART-UC-3', usinaComDono, '25.0000', null);

  for (const [uc, org2] of [[ucOk, orgId], [ucSemGeracao, null], [ucSemVencimento, null]] as const) {
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
  chk('K3a', r.criadas === 1 && fs.length === 1, `uma fatura criada de tres UCs candidatas (criadas=${r.criadas})`);
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

console.log();
if (falhas > 0) { console.log(`--- carteira: ${falhas} FALHA(S)`); await pools.transacional.end(); await pools.relatorio.end(); process.exit(1); }
console.log('--- carteira ponta a ponta: 31 verificacoes, 0 falhas');
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
