// O LANCAMENTO EM LOTE das tarifas da concessionaria, com banco e pela role SEM
// BYPASSRLS. Uso: bash tests/repos.sh
//
// O QUE `tests/planilha-tarifas.ts` NAO ALCANCA. Aquela suite prova a LEITURA do
// arquivo; esta prova o que acontece depois, e sao coisas que so existem no
// banco:
//
//   1. O CASAMENTO E POR `numero_uc`, e a fatura guarda `unidade_consumidora_id`.
//      O join e o modulo inteiro: a distribuidora conhece o numero da UC e nao
//      conhece id nenhum nosso.
//   2. O TOTAL E COLUNA GERADA. Lancar a tarifa muda `valor_total_centavos` sem
//      ninguem escrever nele - e o que faz o boleto sair com o valor certo.
//   3. "AUSENTE NAO E ZERO" tem de ser observavel: a fatura que a planilha nao
//      cobriu FICA como estava, e aparece numa lista.
//   4. O ISOLAMENTO: a planilha do tenant A nao alcanca UC do B, e a UC do B
//      cai em `sem_fatura` como qualquer numero desconhecido - nao em erro de
//      permissao, que confirmaria que ela existe.

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
import { lerPlanilhaDeTarifas } from '../src/dominio/planilha-tarifas.ts';
import type { Centavos } from '../src/dominio/centavos.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emALeitura = <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId: ULEI }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));
const DISTRIB = 'Equatorial';
const COMP = '2031-05-01';

// ================================================================ fixture
const UCS = ['TAR-UC-1', 'TAR-UC-2', 'TAR-UC-3'];

{
  const abertas: Array<{ n: bigint }> = await emA(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM tarifa WHERE distribuidora = $1 AND vigencia_fim IS NULL`, DISTRIB));
  if (Number(abertas[0].n) === 0) {
    await emA(() => regras.abrirVigenciaDeTarifa({
      distribuidora: DISTRIB, tarifa_reais_por_kwh: '1.000000', vigencia_inicio: mes(2020, 1),
    }));
  }

  const u = await emA(() => usinaRepo.criar({ codigo_geradora: 'TAR-USINA', distribuidora: DISTRIB }));
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: u.id, competencia: new Date(`${COMP}T00:00:00Z`), geracao_kwh: '9000.0000', origem: 'local',
  }));
  for (const numero of UCS) {
    const uc = await emA(() => ucRepo.criar({
      cliente_id: CLI, numero_uc: numero, distribuidora: DISTRIB,
      data_vencimento: new Date(Date.UTC(2026, 0, 15)),
    }));
    await emA(() => rateio.definirRateio({
      unidade_consumidora_id: uc.id, usina_id: u.id, percentual_rateio: '5.0000',
    }));
    const k = await emA(() => contrato.rascunhar({
      cliente_id: CLI, unidade_consumidora_id: uc.id, usina_id: u.id, originador_id: null,
      data_fechamento: new Date(Date.UTC(2026, 0, 1)),
      valor_referencia_centavos: 50_000, valor_referencia_origem: 'local',
    }));
    await emA(() => contrato.ativar(k.id));
  }
  await emA(() => fatura.comporLote(COMP));
}

const mapaDe = (csv: string) => new Map<string, Centavos>(
  lerPlanilhaDeTarifas(csv).linhas.map((l) => [l.numero_uc, l.centavos]));

// ---------------------------------------------------- T1 o caminho inteiro
{
  // A planilha cobre DUAS das tres, e traz uma UC que nao existe. As tres
  // situacoes numa importacao so, que e como um arquivo de verdade chega.
  const r = await emA(() => fatura.lancarTarifasPorUC(COMP, mapaDe(
    'numero_uc;valor_reais\n'
    + 'TAR-UC-1;1.234,56\n'
    + 'TAR-UC-2;7,07\n'
    + 'NAO-EXISTE-AQUI;99,00\n')));

  chk('T1a', r.aplicadas.length === 2 && r.aplicadas.every((a) => a.fatura_id.length === 36),
      'duas faturas receberam a tarifa, casadas por `numero_uc` - a distribuidora conhece o numero '
      + 'da UC e nao conhece id nenhum nosso, e o join e o modulo inteiro');

  chk('T1b', r.sem_fatura.length === 1 && r.sem_fatura[0]!.numero_uc === 'NAO-EXISTE-AQUI',
      'a UC que nao tem fatura na competencia vira LINHA DE RELATORIO e nao excecao - um lote de 40 '
      + 'nao pode parar na oitava e deixar sete gravadas');

  chk('T1c', r.sem_valor.length === 1 && r.sem_valor[0]!.numero_uc === 'TAR-UC-3'
        && r.sem_valor[0]!.centavos_atuais === 0,
      'a fatura que a planilha NAO cobriu aparece na lista e fica COMO ESTAVA - ausente nao e zero, '
      + 'e o script nao zera o que o arquivo omitiu');
}

// ---------------------------------------------------- T2 o total e recalculado pelo banco
{
  const fs = await emA(() => fatura.daCompetencia(COMP));
  const porUC: Record<string, any> = {};
  for (const f of fs as any[]) {
    const uc: any[] = await emA(() => db().$queryRawUnsafe(
      `SELECT numero_uc FROM unidade_consumidora WHERE id = $1::uuid`, f.unidade_consumidora_id));
    porUC[uc[0].numero_uc] = f;
  }

  const f1 = porUC['TAR-UC-1'];
  chk('T2a', f1.valor_tarifas_concessionaria_centavos === 123_456,
      'o "1.234,56" da planilha chegou a coluna como 123456 centavos, sem passar por float em '
      + 'ponto nenhum do caminho');

  chk('T2b', f1.valor_total_centavos === f1.valor_consumo_centavos + 123_456 + f1.valor_juros_multa_centavos,
      'o TOTAL e coluna GERADA e ja inclui a tarifa - ninguem escreveu nele, e e esse total que o '
      + 'boleto vai carregar. Afirmar a RELACAO e nao uma constante: a tarifa vigente depende de '
      + 'qual suite abriu a vigencia primeiro no mesmo banco');

  chk('T2c', porUC['TAR-UC-3'].valor_tarifas_concessionaria_centavos === 0,
      'e a nao coberta continua em zero - que e o valor com que ela nasceu, e nao um zero que '
      + 'alguem gravou por cima');
}

// ---------------------------------------------------- T3 so rascunho
{
  const fs = await emA(() => fatura.daCompetencia(COMP));
  const alvo: any = (fs as any[])[0];
  await emA(() => fatura.emitir(alvo.id));

  const uc: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT numero_uc FROM unidade_consumidora WHERE id = $1::uuid`, alvo.unidade_consumidora_id));
  const numero = uc[0].numero_uc;

  const r = await emA(() => fatura.lancarTarifasPorUC(COMP, mapaDe(`${numero};1,00\n`)));
  chk('T3a', r.aplicadas.length === 0 && r.sem_fatura.length === 1
        && /emitida/.test(r.sem_fatura[0]!.porque),
      'fatura JA EMITIDA nao recebe a tarifa e o relatorio DIZ por que - depois de emitida o boleto '
      + 'ja foi registrado com o total antigo, e mudar a coluna deixaria os dois divergentes');

  const depois: any = ((await emA(() => fatura.daCompetencia(COMP))) as any[]).find((f) => f.id === alvo.id);
  chk('T3b', depois.valor_tarifas_concessionaria_centavos === alvo.valor_tarifas_concessionaria_centavos,
      'e o valor dela NAO mudou - o relatorio nao e um aviso depois do fato, e uma recusa');
}

// ---------------------------------------------------- T4 a regra 1 na entrada
{
  const e = await lancou(() => emA(() => fatura.lancarTarifasPorUC(COMP,
    new Map<string, Centavos>([['TAR-UC-3', 12.5 as any]]))));
  chk('T4a', e !== null && e.name === 'ValorNaoInteiro',
      'centavo fracionario LEVANTA nomeando a UC, ANTES de qualquer escrita - um float que '
      + 'atravessasse a planilha derrubaria o lote no meio, com parte gravada');

  const neg = await lancou(() => emA(() => fatura.lancarTarifasPorUC(COMP,
    new Map<string, Centavos>([['TAR-UC-3', -100]]))));
  chk('T4b', neg !== null && neg instanceof RangeError,
      'e negativo tambem - a conferencia do lote INTEIRO acontece antes do primeiro UPDATE');

  const intacta: any = ((await emA(() => fatura.daCompetencia(COMP))) as any[])
    .find((f: any) => f.valor_tarifas_concessionaria_centavos === 0);
  chk('T4c', intacta !== undefined,
      'e depois das duas recusas ainda ha fatura em zero - a recusa aconteceu antes de escrever, e '
      + 'nao no meio');
}

// ---------------------------------------------------- T5 papel e isolamento
{
  const e = await lancou(() => emALeitura(() => fatura.lancarTarifasPorUC(COMP, mapaDe('TAR-UC-3;5,00\n'))));
  chk('T5a', e !== null && /escrever_carteira|permiss|papel/i.test(String(e.message ?? e)),
      'papel `leitura` NAO lanca tarifa - a matriz e aplicada no repositorio por `exigir()`, e nao '
      + 'no handler HTTP, entao o script tambem passa por ela');

  // UC de outro tenant e um numero desconhecido, e nao um erro de permissao: 404
  // e nao 403, pelo mesmo motivo que a rota de tenant usa - confirmar existencia
  // e vazamento.
  const r = await emA(() => fatura.lancarTarifasPorUC(COMP, mapaDe('DOC-B-UC-1;10,00\n')));
  chk('T5b', r.aplicadas.length === 0 && r.sem_fatura.length === 1,
      'UC do tenant B cai em `sem_fatura` como qualquer numero desconhecido - dizer "sem permissao" '
      + 'confirmaria que ela existe em algum lugar');
}

console.log(`\n${falhas === 0 ? 'tarifas da concessionaria: todas as verificacoes passaram'
                              : `tarifas da concessionaria: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
