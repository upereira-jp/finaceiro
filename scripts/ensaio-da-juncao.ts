// ENSAIO DA JUNCAO: a conta unificada lida virando fatura, contra o schema REAL,
// dentro de uma transacao que SEMPRE termina em ROLLBACK.
//
//   npm run ensaio-juncao -- --auth-user <uuid> --tenant <uuid> [--competencia AAAA-MM-01]
//
// ============================================================================
// POR QUE ELE EXISTE, e por que nao e um teste comum
//
// `tests/repos.sh` prova os repositorios contra PostgreSQL real, e e onde isto
// deveria morar. So que ele exige um Postgres LOCAL, e o host de producao nao tem
// um - entao a juncao construida em 21/08/2026 nasceria com a triagem provada
// (42 verificacoes puras) e a GRAVACAO nao provada: o `INSERT ... SELECT`, os
// tres JOINs, os CHECKs da tabela e a coluna gerada do total.
//
// E ela tambem nao pode ser exercitada com o dado de producao como ele esta: ha
// ZERO contratos, e `fatura.contrato_id` e NOT NULL. Entao o originador, o
// contrato e a conta lida sao FIXTURE - criada aqui, usada aqui, desfeita aqui.
//
// ============================================================================
// NAO HA `--valendo`, E ISSO E O DESENHO
//
// Todo outro script deste projeto exige `--ensaio` ou `--valendo` sem default,
// porque escrever por esquecimento e o modo de falha errado. Aqui a escolha nao
// existe: o unico caminho termina em ROLLBACK, por excecao, que e o unico
// ROLLBACK que o Prisma expoe. Um `--valendo` gravaria um originador chamado
// "ENSAIO" e um contrato falso na carteira de um cliente real.
//
// A ultima verificacao (`E12`) conta as quatro tabelas DEPOIS da transacao e
// falha se qualquer uma tiver linha. Ela e o que torna a promessa verificavel em
// vez de declarada.

import { iniciar, encerrarApp } from '../src/app.ts';
import { db } from '../src/db/contexto.ts';
import { faturarRegistro, ensaiarRegistro } from '../src/repos/fatura-do-registro.ts';
import * as registro from '../src/repos/registro-unificado.ts';

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Obrigatorio sem default. O ensaio roda DENTRO de contexto de tenant, pelo
 *  mesmo caminho da aplicacao: excecao de isolamento e ausencia de isolamento. */
const exigirArg = (nome: string): string => {
  const v = arg(nome);
  if (!v) {
    console.error(`ERRO: --${nome} <uuid> e obrigatorio.`);
    process.exit(2);
  }
  return v;
};

const AUTH = exigirArg('auth-user');
const TENANT = exigirArg('tenant');
const COMP = arg('competencia') ?? '2026-06-01';

class Rollback extends Error { constructor() { super('ensaio'); this.name = 'Rollback'; } }

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

async function main() {
  const a = await iniciar();
  const s = await a.login(AUTH);

  try {
    await a.withTenant(s, TENANT, async () => {
      // --------------------------------------------------- escolher uma UC real
      const alvo: any[] = await db().$queryRaw`
        SELECT uc.id, uc.numero_uc, uc.cliente_id, uc.usina_id,
               uc.percentual_rateio::text AS pct, u.codigo_geradora, g.geracao_kwh::text AS geracao
          FROM unidade_consumidora uc
          JOIN usina u          ON u.id = uc.usina_id
          JOIN usina_geracao g  ON g.usina_id = uc.usina_id AND g.competencia = ${COMP}::date
          JOIN cliente c        ON c.id = uc.cliente_id
         WHERE uc.status = 'ativa' AND uc.rateio_situacao = 'ativado'
           AND c.documento_validado
         ORDER BY uc.numero_uc LIMIT 1`;
      const uc = alvo[0];
      if (!uc) { console.log('sem UC elegivel para o ensaio'); throw new Rollback(); }
      console.log(`\nUC ${uc.numero_uc} · usina ${uc.codigo_geradora} · rateio ${uc.pct}% · geracao ${uc.geracao} kWh\n`);

      // ----------------------------------------------------------- fixture
      const orig: any[] = await db().$queryRaw`
        INSERT INTO originador (tenant_id, nome, natureza, documento, documento_tipo, tipo)
        VALUES (${TENANT}::uuid, 'ENSAIO - apagar', 'pf', '52998224725', 'cpf', 'vendedor_g3')
        RETURNING id`;
      const contrato: any[] = await db().$queryRaw`
        INSERT INTO contrato (tenant_id, cliente_id, unidade_consumidora_id, usina_id,
                              originador_id, data_fechamento, valor_referencia_centavos,
                              valor_referencia_origem, status, originador_tipo_no_fechamento)
        VALUES (${TENANT}::uuid, ${uc.cliente_id}::uuid, ${uc.id}::uuid, ${uc.usina_id}::uuid,
                ${orig[0].id}::uuid, '2026-03-15'::date, 50000, 'local', 'ativo', 'vendedor_g3')
        RETURNING id`;

      /* A conta lida: os numeros sao os de uma fatura da Equatorial de verdade -
       * 480 kWh compensados a 1,185396, 20% de desconto, e a parte da Equatorial
       * quebrada nas quatro linhas que os CHECKs conferem. */
      const reg: any[] = await db().$queryRaw`
        INSERT INTO registro_de_fatura_unificada (
          tenant_id, numero_uc, competencia, unidade_consumidora_id, vencimento,
          compensada_kwh, nao_compensado_kwh, tarifa_kwh, percentual_desconto, fator_emissao,
          integral_centavos, desconto_centavos, energia_g3_centavos,
          nao_compensado_centavos, iluminacao_publica_centavos, bandeira_centavos, demais_centavos,
          total_equatorial_centavos, total_centavos)
        VALUES (${TENANT}::uuid, ${uc.numero_uc}, ${COMP}::date, ${uc.id}::uuid, '2026-07-15'::date,
                480.000, 0.000, 1.185396, 20.00, 0.029000,
                56899, 11380, 45519,
                0, 3500, 1200, 8050,
                12750, 58269)
        RETURNING id`;
      const registroId = reg[0].id as string;

      // ------------------------------------------------------------ o ensaio
      const previa = await ensaiarRegistro(registroId);
      chk('E1', previa.faturar === true, 'a triagem aprova a conta contra o cadastro REAL');
      if (previa.faturar) {
        console.log(`     alocado ${previa.conferencia.alocado_kwh} kWh · compensado `
                  + `${previa.conferencia.compensado_kwh} · diferenca ${previa.conferencia.diferenca_kwh}`);
        chk('E2', previa.vencimento_de === 'conta', 'o vencimento veio da conta lida, e nao do cadastro');
      }

      // ------------------------------------------------------------ valendo
      const r = await faturarRegistro(registroId);
      chk('E3', Boolean(r.fatura_id), 'a fatura foi criada');

      const f: any[] = await db().$queryRaw`
        SELECT valor_consumo_centavos, valor_tarifas_concessionaria_centavos, valor_total_centavos,
               consumo_kwh::text AS consumo, tarifa_reais_por_kwh::text AS tarifa,
               geracao_kwh_competencia::text AS geracao, percentual_rateio_aplicado::text AS pct,
               status::text, flag_fatura_cheia, vencimento::text
          FROM fatura WHERE id = ${r.fatura_id}::uuid`;
      const linha = f[0];
      console.log('\n  fatura gravada:', JSON.stringify(linha, null, 2).replace(/\n/g, '\n  '));

      chk('E4', linha.valor_consumo_centavos === 45519,
          'valor_consumo_centavos = energia_g3_centavos da conta (base da comissao e do repasse)');
      chk('E5', linha.valor_tarifas_concessionaria_centavos === 12750,
          'valor_tarifas_concessionaria_centavos = total_equatorial_centavos (repasse puro)');
      chk('E6', linha.valor_total_centavos === 58269,
          'o total GERADO pelo banco bate com o total do registro - a folha e o boleto dizem o mesmo numero');
      chk('E7', linha.status === 'rascunho', 'nasce em RASCUNHO: compor e emitir sao dois atos');
      chk('E8', linha.vencimento === '2026-07-15', 'o vencimento gravado e o da conta lida');
      chk('E9', String(linha.tarifa) === '1.185396', 'a tarifa manteve as SEIS casas ate o banco');

      const volta: any[] = await db().$queryRaw`
        SELECT fatura_id FROM registro_de_fatura_unificada WHERE id = ${registroId}::uuid`;
      chk('E10', volta[0].fatura_id === r.fatura_id,
          'a conta lida passou a apontar para a fatura - a ligacao dos dois lados, na mesma transacao');

      // ------------------------------------------------- a segunda via
      /* A volta: a linha gravada vira campos de tela outra vez, e a conta e
       * RECALCULADA e conferida contra os nove centavos gravados. Se divergir,
       * `segundaVia` levanta - entao chegar aqui ja e parte da prova. */
      const via = await registro.segundaVia(registroId);
      chk('E13', via.conta.total_centavos === 58269 && via.conta.energia_g3_centavos === 45519,
          'a 2a via recalcula os MESMOS centavos da 1a - o cliente recebe o mesmo papel');
      chk('E14', via.campos.unidade_consumidora === uc.numero_uc && via.campos.mes_referencia === '06/2026',
          'a 2a via volta com a unidade e o mes que a tela espera');
      chk('E15', via.parametros.percentual_desconto === '20.00',
          'os parametros voltam CONGELADOS da linha, e nao do modelo de hoje');

      // ------------------------------------------- a segunda tentativa recusa
      try {
        await faturarRegistro(registroId);
        chk('E11', false, 'a segunda tentativa deveria recusar');
      } catch (e: any) {
        chk('E11', e.name === 'RegistroNaoFaturavel' && e.motivo === 'registro_ja_faturado',
            'a segunda tentativa recusa NOMEANDO - o clique duplo nao cobra o cliente duas vezes');
      }

      throw new Rollback();
    });
  } catch (e: any) {
    if (e.name !== 'Rollback') throw e;
  }

  // ------------------------------------------- provar que nada ficou gravado
  await a.withTenant(s, TENANT, async () => {
    const r: any[] = await db().$queryRaw`
      SELECT (SELECT count(*) FROM fatura) AS faturas,
             (SELECT count(*) FROM registro_de_fatura_unificada) AS contas,
             (SELECT count(*) FROM contrato) AS contratos,
             (SELECT count(*) FROM originador) AS originadores`;
    console.log('\ndepois do ROLLBACK:', JSON.stringify(r[0], (_k, x) => (typeof x === 'bigint' ? Number(x) : x)));
    const l = r[0];
    chk('E12', Number(l.faturas) === 0 && Number(l.contas) === 0
            && Number(l.contratos) === 0 && Number(l.originadores) === 0,
        'NADA ficou gravado - producao esta como estava antes do ensaio');
  });

  await encerrarApp();
  console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
