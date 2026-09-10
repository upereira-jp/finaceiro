// A GUARDA DE COLUNA, EXERCITADA CONTRA UM BANCO DE VERDADE.
//
// Uso: npm run ensaio-guarda -- (com DATABASE_URL no ambiente)
//
// ============================================================================
// POR QUE ESTE ENSAIO EXISTE, e ele registra um incidente de 10/09/2026
//
// A migration 40 (`originador.crm_user_id`) foi escrita, o `schema.prisma`
// atualizado e `prisma generate` rodado ANTES de a migration ser aplicada. A
// ordem parecia segura porque o deploy ainda nao tinha acontecido.
//
// ⚠️ So que os TIMERS nao esperam deploy: eles rodam `scripts/*.ts` direto de
// /opt/financeiro/app. O ciclo das 15:45 pegou o codigo novo na primeira tique
// seguinte e morreu com `P2022 The column originador.crm_user_id does not exist`
// no MEIO da rodada, oito minutos antes de a migration entrar.
//
// A regra "migration primeiro, codigo depois" foi adotada pelo dono no mesmo
// dia — e a regra 11 deste projeto ja disse que isso nao basta: "invariante que
// depende de alguem lembrar nao e invariante". Dai a guarda, e dai este ensaio.
//
// POR QUE ENSAIO E NAO SUITE: `conferirClienteGerado` compara o client contra o
// CATALOGO do banco. Sem banco nao ha o que comparar, e esta VPS nao tem
// PostgreSQL local — o mesmo motivo dos outros `ensaio-*`.
//
// NAO ESCREVE NADA. A unica mutacao e no objeto de enum EM MEMORIA, dentro deste
// processo, e ela e desfeita no `finally`. O banco nao e tocado.

import { iniciar, encerrarApp, ColunaAusenteNoBanco } from '../src/app.ts';
import { Prisma } from '../src/generated/prisma/client.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

async function main() {
  // G1 - o estado normal: o arranque so termina se a guarda passar.
  const a = await iniciar();
  chk('G1', true,
      'o arranque passou contra o banco real - client e catalogo concordam. Esta e a '
      + 'verificacao que roda em TODO boot, e as duas abaixo provam que ela nao e decorativa');

  const alvo = (Prisma as unknown as Record<string, Record<string, string>>).OriginadorScalarFieldEnum;

  // G2 - a direcao FATAL: o client conhece uma coluna que o banco nao tem.
  //      E exatamente o estado que derrubou o ciclo das 15:45.
  const antes = { ...alvo };
  alvo.coluna_que_nao_existe = 'coluna_que_nao_existe';
  try {
    await a.conferirClienteGerado();
    chk('G2', false, 'a guarda DEIXOU PASSAR uma coluna que o banco nao tem - o P2022 voltaria '
        + 'a acontecer no meio de uma rodada');
  } catch (e) {
    const ok = e instanceof ColunaAusenteNoBanco;
    chk('G2', ok, `a guarda RECUSA no arranque, e nao no meio do trabalho (${e instanceof Error ? e.name : String(e)})`);
    if (ok) {
      const m = (e as Error).message;
      chk('G2b', m.includes('originador.coluna_que_nao_existe'),
          'e NOMEIA a coluna com a tabela junto - "alguma coluna" nao e ponteiro');
      chk('G2c', m.includes('aplique a migration'),
          'e diz o proximo passo NA ORDEM CERTA, que e a licao do incidente');
      chk('G2d', m.includes('TIMERS'),
          'e avisa que os timers nao esperam deploy - que e a metade da causa que ninguem espera');
    }
  } finally {
    for (const k of Object.keys(alvo)) if (!(k in antes)) delete alvo[k];
  }

  /*
   * G3 - A DIRECAO INOFENSIVA, e ela e metade do valor da guarda.
   *
   * Coluna no BANCO que o client nao conhece e o estado NORMAL de toda migration
   * aplicada antes do `db pull` - inclusive o estado certo durante um deploy em
   * andamento. Uma guarda que recusasse isso derrubaria o servico exatamente
   * quando ele acabou de ser consertado.
   */
  const completo = { ...alvo };
  delete alvo.telefone;
  try {
    await a.conferirClienteGerado();
    chk('G3', true, 'coluna no BANCO que o client nao conhece NAO recusa - o client so nao a seleciona');
  } catch (e) {
    chk('G3', false, `recusou a direcao inofensiva: ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
  } finally {
    Object.assign(alvo, completo);
  }

  await encerrarApp();
  console.log(falhas === 0 ? '\nEXIT=0' : `\nFALHAS: ${falhas}`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERRO', e instanceof Error ? e.message : e); process.exit(1); });
