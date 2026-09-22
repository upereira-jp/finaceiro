// O OUVINTE DO CRM — a comunicacao passa a ser em tempo real. ADR-0008.
//
// Uso (em producao e a unidade `deploy/financeiro-escuta-crm.service`):
//   node --experimental-strip-types scripts/escuta-crm.ts --auth-user <uuid> --tenant <uuid>
//
// ============================================================================
// O QUE ELE FAZ, e e so isto
//
// Mantem um `LISTEN financeiro_crm` aberto no banco do CRM. Um gatilho de la
// (migration `2026_09_22_financeiro_aviso_tempo_real.sql` do CRM) avisa sempre que
// uma tabela-base das views `financeiro.*` muda para a G3. A cada aviso, espera
// JUNTAR_MS para juntar a rajada e roda o MESMO ciclo do timer - o mesmo script,
// com os mesmos argumentos, num processo filho. Nenhuma logica de espelho mora
// aqui: o ciclo ja e idempotente (R3) e compara o conjunto inteiro, entao rodar
// mais vezes nao cria nada duplicado.
//
// Ouvir e leitura. A regra 4 continua inteira: a credencial e a `financeiro_ro`,
// conferida por `conferirRoleDeLeitura` antes do LISTEN, e a sessao e read-only.
//
// ============================================================================
// O QUE ELE NAO SUBSTITUI: o timer de 15 minutos
//
// Aviso emitido com este processo fora do ar se perde - NOTIFY nao tem fila para
// quem nao esta ouvindo. Por isso: (1) ao conectar e ao reconectar ele roda um
// ciclo, que recupera o que passou; (2) o `financeiro-ciclo.timer` continua,
// como a SPEC-002 §11 exige de qualquer mecanismo de empurrar. O pior caso deixa
// de ser "15 minutos sempre" e passa a ser "15 minutos se o ouvinte cair".
//
// ============================================================================
// AS TRES ESPERAS, e por que cada uma existe
//
//   JUNTAR_MS      um card salvo gera avisos de varias tabelas em milissegundos;
//                  2 s juntam a rajada num ciclo so.
//   OCUPADO_MS     o timer pode estar rodando quando o aviso chega. O ciclo filho
//                  sai com 75 (`CicloJaEmAndamento`) e este processo tenta de novo
//                  depois: o ciclo do timer pode ter lido ANTES da mudanca.
//   apos falha     ciclo que falha por dado (a R11 de 16/09 falhava em todas) nao
//                  pode virar um laco de uma falha por aviso. Espera 1 min, dobra
//                  ate 15 min, e volta a zero no primeiro sucesso.

import { spawn } from 'node:child_process';
import type { PoolClient } from 'pg';
import { crmDoAmbiente, conferirRoleDeLeitura } from '../src/crm/conexao.ts';

export const CANAL = 'financeiro_crm';
export const CODIGO_OCUPADO = 75;
const JUNTAR_MS = 2_000;
const OCUPADO_MS = 15_000;
const PRIMEIRA_ESPERA_APOS_FALHA_MS = 60_000;
const TETO_APOS_FALHA_MS = 15 * 60_000;
const PULSO_MS = 60_000;

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const authUser = arg('auth-user');
const tenant = arg('tenant');
if (!authUser || !tenant) {
  console.error('ERRO: --auth-user <uuid> e --tenant <uuid> sao obrigatorios - os mesmos do financeiro-ciclo.service.');
  process.exit(2);
}

const log = (msg: string) => console.log(`[escuta-crm] ${msg}`);

// ---------------------------------------------------------------- o agendador
let rodando = false;
let pendente = false;
let relogio: NodeJS.Timeout | null = null;
let esperaAposFalha = 0;
let naoAntesDe = 0;
let motivos = new Set<string>();
let filhoAtual: ReturnType<typeof spawn> | null = null;

function agendar(motivo: string, emMs = JUNTAR_MS): void {
  pendente = true;
  motivos.add(motivo);
  if (rodando || relogio) return;
  const quando = Math.max(emMs, naoAntesDe - Date.now());
  relogio = setTimeout(rodarCiclo, quando);
}

function rodarCiclo(): void {
  relogio = null;
  if (rodando) return;
  rodando = true;
  pendente = false;
  const porque = [...motivos].join(', ');
  motivos = new Set();
  const inicio = Date.now();

  const filho = spawn(process.execPath, [
    '--experimental-strip-types', 'scripts/ciclo-crm.ts',
    '--valendo', '--auth-user', authUser!, '--tenant', tenant!,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  filhoAtual = filho;

  /* O relatorio inteiro do ciclo vai para o journal DESTE servico - e o mesmo
   * texto que o timer escreve no dele, entao quem investiga le os dois igual. */
  let status = '';
  filho.stdout.on('data', (b: Buffer) => {
    const t = b.toString();
    process.stdout.write(t);
    const m = /status \.+ (\w+)/.exec(t);
    if (m) status = m[1];
  });
  filho.stderr.on('data', (b: Buffer) => process.stderr.write(b));

  filho.on('exit', (codigo) => {
    rodando = false;
    filhoAtual = null;
    if (encerrando) return;
    const s = ((Date.now() - inicio) / 1000).toFixed(1);
    if (codigo === 0) {
      esperaAposFalha = 0;
      naoAntesDe = 0;
      log(`ciclo ${status || 'ok'} em ${s} s (aviso: ${porque})`);
    } else if (codigo === CODIGO_OCUPADO) {
      log(`outro ciclo ja estava rodando; tento de novo em ${OCUPADO_MS / 1000} s (aviso: ${porque})`);
      agendar(porque, OCUPADO_MS);
      return;
    } else {
      esperaAposFalha = esperaAposFalha === 0
        ? PRIMEIRA_ESPERA_APOS_FALHA_MS
        : Math.min(esperaAposFalha * 2, TETO_APOS_FALHA_MS);
      naoAntesDe = Date.now() + esperaAposFalha;
      log(`ciclo FALHOU (codigo ${codigo}) em ${s} s; o proximo espera pelo menos `
        + `${esperaAposFalha / 1000} s (aviso: ${porque})`);
    }
    if (pendente) agendar('aviso durante o ciclo');
  });
}

// ---------------------------------------------------------------- a conexao
const pool = crmDoAmbiente();
let cliente: PoolClient | null = null;
let pulso: NodeJS.Timeout | null = null;
let tentativas = 0;
let encerrando = false;

async function conectar(): Promise<void> {
  try {
    await conferirRoleDeLeitura(pool);   // regra 4, antes de qualquer leitura
    const c = await pool.connect();
    c.on('notification', (n) => { if (n.channel === CANAL) agendar(n.payload || '?'); });
    // Erro e pulso podem acusar a MESMA queda; so a conexao corrente derruba.
    c.on('error', (e) => { if (cliente === c) cair(`erro na conexao: ${e.message}`); });
    await c.query(`LISTEN ${CANAL}`);
    cliente = c;
    tentativas = 0;
    log(`ouvindo "${CANAL}" no CRM`);
    /* O pulso descobre a conexao morta que nao avisou (pooler reiniciado, rede
     * caida sem RST). Sem ele o processo ficaria "ouvindo" um socket que nunca
     * mais vai entregar nada - e so o timer notaria, 15 minutos depois. */
    pulso = setInterval(() => {
      c.query('SELECT 1').catch((e) => { if (cliente === c) cair(`pulso falhou: ${e.message}`); });
    }, PULSO_MS);
    agendar('conectou');   // recupera o que mudou enquanto nao havia ouvinte
  } catch (e: any) {
    cair(`nao conectou: ${e?.message ?? e}`);
  }
}

function cair(motivo: string): void {
  if (encerrando) return;
  if (pulso) { clearInterval(pulso); pulso = null; }
  const c = cliente;
  cliente = null;
  if (c) { try { c.release(true); } catch { /* ja estava morta */ } }
  tentativas++;
  const espera = Math.min(1000 * 2 ** Math.min(tentativas, 5), 30_000);
  log(`${motivo} - reconecto em ${espera / 1000} s`);
  setTimeout(() => { void conectar(); }, espera);
}

/*
 * ⚠️ O CICLO EM ANDAMENTO TERMINA ANTES DE O PROCESSO SAIR, e isto nao e cortesia.
 * Ciclo morto por kill deixa `conector_execucao` em `em_andamento`, e o EXCLUDE
 * da migration 14 trava o conector ate alguem fechar a linha a mao
 * (`Q-CICLO-ORFAO-01`). A unidade usa `KillMode=mixed`: o SIGTERM chega so a este
 * processo, que espera o filho; o SIGKILL no grupo inteiro so vem se o
 * `TimeoutStopSec` estourar.
 */
async function encerrar(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  log(`${sinal}: encerrando`);
  if (relogio) clearTimeout(relogio);
  if (pulso) clearInterval(pulso);
  if (filhoAtual) {
    log('esperando o ciclo em andamento terminar');
    await new Promise<void>((ok) => filhoAtual!.once('exit', () => ok()));
  }
  try { cliente?.release(true); } catch { /* nada */ }
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));

await conectar();
