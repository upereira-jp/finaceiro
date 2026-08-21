// O PERCENTUAL DE REPASSE das usinas, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run repasse -- --ensaio  --auth-user <uuid> --tenant <uuid> --inicio 2026-01-01
//   npm run repasse -- --valendo --auth-user <uuid> --tenant <uuid> --inicio 2026-01-01
//   ... [--percentual 70]
//
// ============================================================================
// A REGRA QUE ELE GRAVA, e ela e do dono (21/08/2026)
//
// *"Alem dos valores destinados a Equatorial, que sao as tarifas minimas, a
// divisao ocorre da seguinte maneira: 70% vai para o dono da usina e 30% fica na
// G3 para pagar as contas."* E, em 21/08: *"os 70% valem desde 01/01/2026"*.
//
// SO O PRIMEIRO NUMERO E GRAVADO. Os 30% da casa sao o que sobra depois de todos
// os destinos, apurados por subtracao - e assim que a reparticao garante que a
// soma feche no centavo. Guardar os dois seria guardar a mesma informacao duas
// vezes, e duas copias divergem.
//
// ============================================================================
// `--ensaio` E `--valendo` SAO OBRIGATORIOS e nao ha default, como no ciclo e no
// faturamento: uma escrita que acontece porque alguem esqueceu uma flag e o modo
// de falha errado. No ensaio o trabalho e o mesmo e a transacao termina em
// ROLLBACK - entao ele exercita exatamente o codigo do valendo.
//
// ============================================================================
// USINA QUE JA TEM VIGENCIA ABERTA E PULADA, e nao reaberta.
//
// `abrirVigenciaDeRepasse` FECHA a anterior e abre outra - e o caminho certo para
// uma RENEGOCIACAO, e o errado para um lote que roda duas vezes. Rodar este
// script de novo com a mesma data quebraria na guarda `VigenciaNoPassado` (a
// nova comecaria no mesmo dia da atual), mas com uma data adiante ele criaria uma
// vigencia nova identica a que ja existe, partindo o historico em duas linhas que
// dizem a mesma coisa. Pular e o que torna o script repetivel.

import { iniciar, encerrarApp } from '../src/app.ts';
import { db } from '../src/db/contexto.ts';
import { abrirVigenciaDeRepasse } from '../src/repos/regras.ts';

class RollbackDoEnsaio extends Error {
  constructor() { super('ensaio'); this.name = 'RollbackDoEnsaio'; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

const exigirArg = (nome: string): string => {
  const v = arg(nome);
  if (!v) { console.error(`ERRO: --${nome} e obrigatorio.`); process.exit(2); }
  return v;
};

async function main(): Promise<void> {
  const ensaio = tem('ensaio');
  const valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }

  const authUserId = exigirArg('auth-user');
  const tenant = exigirArg('tenant');
  const inicio = exigirArg('inicio');
  const percentual = arg('percentual') ?? '70.00';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    console.error(`ERRO: --inicio deve ser AAAA-MM-DD, veio ${JSON.stringify(inicio)}.`);
    process.exit(2);
  }

  console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==`);
  console.log(`== ${percentual}% para o dono da usina, a partir de ${inicio} ==\n`);

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`financeiro: ${sessao.nome} <${sessao.email}>\n`);

  try {
    await a.withTenant(sessao, tenant, async () => {
      const usinas: any[] = await db().$queryRaw`
        SELECT u.id, u.codigo_geradora,
               (SELECT count(*) FROM regra_repasse rr
                 WHERE rr.usina_id = u.id AND rr.vigencia_fim IS NULL) AS ja_tem
          FROM usina u
         WHERE u.status = 'ativa'
         ORDER BY u.codigo_geradora`;

      let abertas = 0;
      let puladas = 0;
      for (const u of usinas) {
        if (Number(u.ja_tem) > 0) {
          console.log(`  ${String(u.codigo_geradora).padEnd(6)} PULADA - ja tem vigencia aberta`);
          puladas++;
          continue;
        }
        await abrirVigenciaDeRepasse({
          usina_id: u.id,
          percentual,
          vigencia_inicio: new Date(`${inicio}T00:00:00Z`),
        });
        console.log(`  ${String(u.codigo_geradora).padEnd(6)} ${percentual}% desde ${inicio}`);
        abertas++;
      }

      console.log(`\n  abertas ... ${abertas}`);
      console.log(`  puladas ... ${puladas}`);

      /* A CONFERENCIA E DENTRO DA TRANSACAO, para o ensaio poder mostrar o
       * resultado que ele vai desfazer. Ler depois do rollback mostraria o
       * estado ANTES, que e o que confunde quem ensaia. */
      const conferencia: any[] = await db().$queryRaw`
        SELECT u.codigo_geradora, rr.percentual::text AS percentual,
               rr.vigencia_inicio::text AS inicio,
               coalesce(rr.vigencia_fim::text, '(em aberto)') AS fim
          FROM usina u
          LEFT JOIN regra_repasse rr ON rr.usina_id = u.id
         WHERE u.status = 'ativa'
         ORDER BY u.codigo_geradora, rr.vigencia_inicio`;
      console.log('\n  como ficou:');
      for (const c of conferencia) {
        console.log(`    ${String(c.codigo_geradora).padEnd(6)} ${c.percentual ?? '(nenhum)'}%  ${c.inicio ?? ''} -> ${c.fim}`);
      }

      if (ensaio) throw new RollbackDoEnsaio();
    });
  } catch (e: any) {
    if (e.name !== 'RollbackDoEnsaio') { await encerrarApp(); throw e; }
    console.log('\n== ENSAIO: ROLLBACK. Nada foi gravado. ==');
  }

  if (valendo) console.log('\n== COMMIT. O percentual esta gravado. ==');
  await encerrarApp();
}

main().catch((e) => { console.error('FALHOU:', e?.message ?? e); process.exit(1); });
