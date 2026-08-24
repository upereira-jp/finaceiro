// A PRONTIDAO MEDIDA CONTRA O SCHEMA REAL, dentro de uma transacao que SEMPRE
// termina em ROLLBACK.
//
// Uso: npm run ensaio-prontidao -- --auth-user <uuid> --tenant <uuid>
//
// ============================================================================
// POR QUE ESTE ENSAIO EXISTE
//
// `src/repos/prontidao.ts` e uma consulta CRUA de cem linhas, e o `tsc` nao le
// SQL. O que cobre a consulta e `tests/repos-carteira.ts`, que exige PostgreSQL
// local - e esta VPS nao tem um. A correcao de 24/08/2026 mexeu justamente nos
// predicados de duas camadas e acrescentou uma terceira, entao "compilou" nao e
// evidencia de nada aqui.
//
// A LEITURA CONTRA PRODUCAO PROVA SO METADE. Com zero contas lidas, as camadas
// novas devolvem `nao_medido 0 de 0` - o ramo vazio, que nao exercita nem o
// JOIN por `numero_uc`, nem o filtro de competencia, nem a segunda fonte do
// vencimento. Este ensaio prova a outra metade: ele CRIA uma conta lida, mede,
// mexe nela campo a campo e confere que cada camada se move do jeito que a
// regra diz - e desfaz tudo.
//
// O QUE ELE PRENDE, e cada um foi um jeito real de errar a consulta:
//
//   P2   a conta lida FECHA uma unidade da camada dela;
//   P3   e o universo das duas de baixo passa a ser a UC COM conta - o que era
//        `nao_medido` vira numero de verdade;
//   P5   tarifa zerada na conta e ACUSADA, porque a fatura recusa o zero;
//   P6   sem vencimento na conta e sem dia no cadastro, a camada acusa;
//   P7   com o dia no cadastro ela FECHA - e esta e a segunda fonte da
//        `Q-CICLO-01`, a metade que a consulta antiga nao tinha;
//   P8   conta de OUTRA competencia nao conta - uma consulta que ignorasse o mes
//        passaria em todas as outras verificacoes e mentiria a partir de julho.
//
// NAO HA `--valendo`, E ISSO E O DESENHO. O unico caminho termina em ROLLBACK,
// por excecao, que e o unico ROLLBACK que o Prisma expoe. A ultima verificacao
// conta a tabela DEPOIS da transacao e falha se sobrar linha - e o que torna a
// promessa verificavel em vez de declarada. Mesmo desenho do
// `scripts/ensaio-da-juncao.ts`.

import { iniciar, encerrarApp } from '../src/app.ts';
import { db } from '../src/db/contexto.ts';
import { prontidao, type Camada } from '../src/repos/prontidao.ts';

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const exigirArg = (nome: string): string => {
  const v = arg(nome);
  if (!v) { console.error(`ERRO: --${nome} <uuid> e obrigatorio.`); process.exit(2); }
  return v;
};

const AUTH = exigirArg('auth-user');
/** OPCIONAL, como no `faturar`: quem tem um vinculo so nao precisa dizer qual.
 *  O `tenant_id` das linhas do ensaio NAO sai daqui - ele sai da propria UC
 *  escolhida, que e a unica fonte que nao pode apontar para o tenant errado. */
const TENANT = arg('tenant');
/** `AAAA-MM` e `AAAA-MM-01` valem os dois. A normalizacao e a mesma do
 *  `scripts/faturar.ts`: `prontidao()` normaliza sozinha, mas o SQL cru do
 *  fixture nao - e um `date` recebendo "2026-06" e um 22007 no meio do ensaio. */
const comp = arg('competencia') ?? '2026-06-01';
const COMP = /^\d{4}-\d{2}$/.test(comp) ? `${comp}-01` : comp;
/** A competencia VIZINHA, para o P8. Primeiro dia do mes seguinte - o CHECK
 *  `registro_competencia_no_dia_1` recusa qualquer outro dia. */
const OUTRA = new Date(Date.UTC(
  new Date(`${COMP}T00:00:00Z`).getUTCFullYear(),
  new Date(`${COMP}T00:00:00Z`).getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

class Rollback extends Error { constructor() { super('ensaio'); this.name = 'Rollback'; } }

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const camada = (cs: readonly Camada[], nome: string): Camada => {
  const c = cs.find((x) => x.camada === nome);
  if (!c) throw new Error(`camada ${nome} sumiu do relatorio`);
  return c;
};

/** So para o log: a linha do relatorio como o script `faturar` a imprime. */
const linha = (c: Camada) => `${c.camada} ${c.situacao} ${c.faltam} de ${c.total}`;

async function main() {
  const a = await iniciar();
  const s = await a.login(AUTH);

  try {
    await a.withTenant(s, TENANT, async () => {
      // ------------------------------------------------- o retrato de antes
      const antes = (await prontidao(COMP)).camadas;
      const contaAntes = camada(antes, 'conta_lida_da_competencia');
      console.log(`\nantes:  ${linha(contaAntes)}`);
      console.log(`        ${linha(camada(antes, 'vencimento'))}`);
      console.log(`        ${linha(camada(antes, 'tarifa_na_conta'))}\n`);

      chk('P1', contaAntes.total > 0 && contaAntes.faltam === contaAntes.total
             && camada(antes, 'vencimento').situacao === 'nao_medido'
             && camada(antes, 'tarifa_na_conta').situacao === 'nao_medido',
          `sem conta lida nenhuma, a camada da conta acusa ${contaAntes.faltam} de ${contaAntes.total} `
          + 'e as duas de baixo dizem NAO MEDIDO - nao "ok", que autorizaria o que ninguem conferiu');

      // -------------------------------------------------- uma UC faturavel real
      const alvo: any[] = await db().$queryRaw`
        SELECT uc.id, uc.tenant_id, uc.numero_uc, uc.data_vencimento
          FROM unidade_consumidora uc
         WHERE uc.status = 'ativa'
           AND (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado')
         ORDER BY uc.numero_uc LIMIT 1`;
      const uc = alvo[0];
      if (!uc) { console.log('sem UC faturavel para o ensaio'); throw new Rollback(); }
      console.log(`UC do ensaio: ${uc.numero_uc} · dia de vencimento no cadastro: ${uc.data_vencimento ?? '(vazio)'}\n`);

      /* A conta lida. Os numeros sao os mesmos do ensaio da juncao - uma fatura
       * da Equatorial de verdade -, e o que importa aqui sao dois campos: o
       * `vencimento` e a `tarifa_kwh`. */
      const inserir = (numeroUc: string, competencia: string): Promise<any[]> => db().$queryRaw`
        INSERT INTO registro_de_fatura_unificada (
          tenant_id, numero_uc, competencia, unidade_consumidora_id, vencimento,
          compensada_kwh, nao_compensado_kwh, tarifa_kwh, percentual_desconto, fator_emissao,
          integral_centavos, desconto_centavos, energia_g3_centavos,
          nao_compensado_centavos, iluminacao_publica_centavos, bandeira_centavos, demais_centavos,
          total_equatorial_centavos, total_centavos)
        VALUES (${uc.tenant_id}::uuid, ${numeroUc}, ${competencia}::date, NULL, '2026-07-15'::date,
                480.000, 0.000, 1.185396, 20.00, 0.029000,
                56899, 11380, 45519,
                0, 3500, 1200, 8050,
                12750, 58269)
        RETURNING id`;

      const reg = await inserir(uc.numero_uc, COMP);
      const registroId = reg[0].id as string;

      const comConta = (await prontidao(COMP)).camadas;
      chk('P2', camada(comConta, 'conta_lida_da_competencia').faltam === contaAntes.faltam - 1,
          `a conta lida FECHA exatamente uma unidade da camada dela (${contaAntes.faltam} -> `
          + `${camada(comConta, 'conta_lida_da_competencia').faltam}) - e a juncao e por numero de `
          + 'unidade, o mesmo caminho pelo qual a fatura sai');

      /* O `unidade_consumidora_id` da linha foi gravado NULO de proposito: se a
       * consulta juntasse por ele em vez de por `numero_uc`, o P2 falharia aqui.
       * A tabela permite o nulo porque registrar uma conta nao exige cadastro. */
      chk('P2b', camada(comConta, 'conta_lida_da_competencia').situacao === 'pendente',
          'e a camada continua pendente enquanto sobrarem unidades sem conta - uma conta nao fecha o mes');

      chk('P3', camada(comConta, 'vencimento').total === 1
             && camada(comConta, 'vencimento').faltam === 0
             && camada(comConta, 'vencimento').situacao === 'ok',
          `o universo do vencimento passou a ser a UC COM conta (${camada(comConta, 'vencimento').total}), `
          + 'e a data impressa na conta FECHA a camada sem ninguem preencher nada');

      chk('P4', camada(comConta, 'tarifa_na_conta').total === 1
             && camada(comConta, 'tarifa_na_conta').faltam === 0
             && camada(comConta, 'tarifa_na_conta').situacao === 'ok',
          'e o preco lido na conta fecha a camada da tarifa - a coluna do cadastro nao foi consultada');

      // ------------------------------------------------ P5 a tarifa zerada acusa
      await db().$executeRaw`
        UPDATE registro_de_fatura_unificada SET tarifa_kwh = 0 WHERE id = ${registroId}::uuid`;
      const tarifaZero = (await prontidao(COMP)).camadas;
      chk('P5', camada(tarifaZero, 'tarifa_na_conta').faltam === 1
             && camada(tarifaZero, 'tarifa_na_conta').situacao === 'pendente',
          'tarifa ZERADA na conta e acusada: o registro aceita o zero e a fatura recusa, e a '
          + 'diferenca entre as duas faixas e exatamente o que esta camada conta');
      await db().$executeRaw`
        UPDATE registro_de_fatura_unificada SET tarifa_kwh = 1.185396 WHERE id = ${registroId}::uuid`;

      // ------------------------------- P6/P7 as DUAS fontes do vencimento
      await db().$executeRaw`
        UPDATE registro_de_fatura_unificada SET vencimento = NULL WHERE id = ${registroId}::uuid`;
      await db().$executeRaw`
        UPDATE unidade_consumidora SET data_vencimento = NULL WHERE id = ${uc.id}::uuid`;
      const semNenhum = (await prontidao(COMP)).camadas;
      chk('P6', camada(semNenhum, 'vencimento').faltam === 1
             && camada(semNenhum, 'vencimento').situacao === 'pendente',
          'sem data na conta E sem dia no cadastro, o vencimento e acusado - que e a unica '
          + 'situacao em que a cobranca de fato nao sai');

      await db().$executeRaw`
        UPDATE unidade_consumidora SET data_vencimento = '2026-07-10'::date WHERE id = ${uc.id}::uuid`;
      const soCadastro = (await prontidao(COMP)).camadas;
      chk('P7', camada(soCadastro, 'vencimento').faltam === 0
             && camada(soCadastro, 'vencimento').situacao === 'ok',
          'e o dia do CADASTRO fecha a camada quando a conta veio sem data - a segunda fonte, que e '
          + 'a metade da regra que a consulta antiga nao tinha');

      // ------------------------------------- P8 a competencia importa
      const depoisDoVenc = camada(soCadastro, 'conta_lida_da_competencia').faltam;
      const outraUc: any[] = await db().$queryRaw`
        SELECT uc.numero_uc FROM unidade_consumidora uc
         WHERE uc.status = 'ativa'
           AND (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado')
           AND uc.numero_uc <> ${uc.numero_uc}
         ORDER BY uc.numero_uc LIMIT 1`;
      if (outraUc[0]) {
        await inserir(outraUc[0].numero_uc, OUTRA);
        const outroMes = (await prontidao(COMP)).camadas;
        chk('P8', camada(outroMes, 'conta_lida_da_competencia').faltam === depoisDoVenc,
            `conta de ${OUTRA} NAO conta para ${COMP} (${depoisDoVenc} continua ${depoisDoVenc}) - `
            + 'uma consulta que ignorasse o mes passaria em tudo acima e mentiria na virada');
      } else {
        console.log('(P8 pulado: so ha uma UC faturavel)');
      }

      throw new Rollback();
    });
  } catch (e: any) {
    if (e.name !== 'Rollback') throw e;
  }

  // ------------------------------------------- provar que nada ficou gravado
  await a.withTenant(s, TENANT, async () => {
    const r: any[] = await db().$queryRaw`
      SELECT (SELECT count(*) FROM registro_de_fatura_unificada) AS contas,
             (SELECT count(*) FROM unidade_consumidora WHERE data_vencimento IS NOT NULL) AS com_dia`;
    const l = r[0];
    console.log(`\ndepois do ROLLBACK: contas=${Number(l.contas)} · unidades com dia de vencimento=${Number(l.com_dia)}`);
    chk('P9', Number(l.contas) === 0 && Number(l.com_dia) === 0,
        'NADA ficou gravado - nem a conta do ensaio, nem o dia de vencimento que ele escreveu');
  });

  await encerrarApp();
  console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
