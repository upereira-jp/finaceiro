// OS FORMATOS DA TELA — dia, mês, hora, número da unidade e plural, num lugar só.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU (30/09/2026, etapa 4b do redesenho)
//
// A mesma data aparecia de quatro jeitos. Contas a pagar mostrava o vencimento
// como "2026-09-05", Contratos o fechamento como "2025-12-17", Relatórios o mês
// como "2026-09", o Histórico dizia "13:24" para o que aconteceu às 10:24 em
// Goiânia (a hora do servidor, em UTC), e em cinco arquivos havia uma função
// própria de "virar a data" — `dataEmBr`, `dataBr`, `emBr`, `mesCurto`,
// `vencimentoEmBr` —, cada uma com o seu cuidado e o seu esquecimento.
//
// A REGRA, dita uma vez para o sistema inteiro:
//
//   DIA          sempre `dd/mm/aaaa`.
//   MÊS          por extenso («setembro de 2026») em TÍTULO, FRASE e SELETOR,
//                onde se lê; `09/2026` em COLUNA DE TABELA e no metadado curto
//                de uma linha, onde se compara de cima a baixo. É a convenção
//                que a fila da Fatura unificada e a folha já usavam.
//   HORA         no fuso de São Paulo (`America/Sao_Paulo`), por `Intl`.
//   NÚMERO DA UC como o cadastro guarda (ver `numeroDaUcNaTela`).
//   PLURAL       singular e plural escritos por inteiro — nunca «conta(s)».
//
// OS NÚMEROS DECIMAIS (percentual, kWh, tarifa) e o dinheiro ficam em
// `dinheiro.ts`, ao lado da regra 1 que os governa.
//
// ============================================================================
// DUAS ESPÉCIES DE DATA, e confundir as duas é o defeito que este arquivo evita
//
//   O DIA DO CALENDÁRIO (coluna `date`: vencimento, competência, fechamento).
//   Ele chega como "2026-09-05" ou, pelo JSON, "2026-09-05T00:00:00.000Z" — que
//   NÃO é meia-noite de verdade, é o jeito de o driver escrever um dia. Aqui ele
//   é lido POR TEXTO, sem `new Date`: em fuso negativo, `new Date('2026-09-05')`
//   é 04/09 às 21h, e a tela diria o dia anterior com convicção.
//
//   O INSTANTE (coluna `timestamptz`: quando algo aconteceu). Ele é um ponto no
//   tempo, e a hora que a pessoa reconhece é a do relógio da parede dela. Aqui
//   ele passa por `Intl.DateTimeFormat` com o fuso de São Paulo — e é só aqui
//   que a tela converte fuso.
//
// ISTO É `.ts` PURO pelo motivo de sempre: o runner do `web/` não lê JSX, e a
// suíte `web/tests/formato.ts` mede cada caso de borda.

import { normalizarUc } from './lote-de-contas.ts';

/** O fuso de quem opera. Goiânia e São Paulo marcam a mesma hora desde 2019. */
export const FUSO = 'America/Sao_Paulo';

const VAZIO = '—';

const vazio = (v: unknown): boolean => v == null || String(v).trim() === '';

/* ============================================================== o dia */

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?![\d])/;

/**
 * O DIA DO CALENDÁRIO: `2026-09-05` (ou `2026-09-05T00:00:00.000Z`) ->
 * `05/09/2026`. Por texto, sem fuso — ver o cabeçalho.
 *
 * O que não for data volta como veio: um valor estranho na tela é informação,
 * e «NaN/NaN/NaN» no lugar dele seria a tela inventando.
 */
export function diaEmBr(v: string | null | undefined): string {
  if (vazio(v)) return VAZIO;
  const s = String(v).trim();
  const m = DIA_ISO.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/* ============================================================== o mês */

const MES_ISO = /^(\d{4})-(\d{2})(?:-\d{2})?(?![\d])/;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** `AAAA` e `MM` de uma competência (`2026-09`, `2026-09-01`, com ou sem
 *  horário do JSON), ou `null` quando não é um mês de verdade. */
function lerMes(v: string | null | undefined): { ano: string; mes: string } | null {
  const m = MES_ISO.exec(String(v ?? '').trim());
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 && n <= 12 ? { ano: m[1]!, mes: m[2]! } : null;
}

/** A COMPETÊNCIA NA COLUNA: `2026-09-01` -> `09/2026`. Travessão quando vazia;
 *  o texto como veio quando não é mês. */
export function mesEmBr(v: string | null | undefined): string {
  if (vazio(v)) return VAZIO;
  const m = lerMes(v);
  return m ? `${m.mes}/${m.ano}` : String(v).trim();
}

/**
 * A COMPETÊNCIA NA FRASE: `2026-07-01` -> `julho de 2026`. String VAZIA quando
 * não dá para ler — quem chama decide o que mostrar no lugar (é o contrato que
 * `vocabulario.ts` já tinha, e que os títulos usam com `||`).
 *
 * SEM `new Date`, DE PROPÓSITO: `new Date('2026-07-01')` é meia-noite UTC, e em
 * fuso negativo `getMonth()` devolve JUNHO.
 */
export function mesPorExtenso(v: string | null | undefined): string {
  const m = lerMes(v);
  return m ? `${MESES[Number(m.mes) - 1]} de ${m.ano}` : '';
}

/** O nome do mês em três letras, `1` -> `jan` — a grade do seletor do mês de
 *  trabalho (01/10/2026, etapa 8). */
export const mesCurtoDoAno = (n: number): string => (MESES[n - 1] ?? '').slice(0, 3);

/**
 * O MÊS ABREVIADO, `2026-09` -> `set/26`. É a forma do lugar estreito: o menu
 * recolhido e a faixa do topo do celular, onde «setembro de 2026» não cabe
 * (01/10/2026, etapa 8). O nome inteiro continua no nome acessível de quem a
 * mostra. String VAZIA quando não é mês, como `mesPorExtenso`.
 */
export function mesAbreviado(v: string | null | undefined): string {
  const m = lerMes(v);
  return m ? `${mesCurtoDoAno(Number(m.mes))}/${m.ano.slice(2)}` : '';
}

/* ======================================================= o instante */

type Partes = { ano: string; mes: string; dia: string; hora: string; minuto: string };

/* UM formatador, criado uma vez: `Intl.DateTimeFormat` é caro de construir, e
 * o Histórico chama isto duzentas vezes por tela. `hourCycle: 'h23'` porque
 * alguns motores escrevem meia-noite como «24:00» com `hour12: false`. */
let formatador: Intl.DateTimeFormat | null = null;
const noFuso = (): Intl.DateTimeFormat => (formatador ??= new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}));

/** Um INSTANTE com fuso declarado (`Z`, `±hh:mm`, `±hhmm` ou o `±hh` curto que
 *  o Postgres escreve). Sem fuso, a string é ambígua — o navegador a leria no
 *  fuso dele —, e ambíguo não é convertido. */
const INSTANTE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}(?::?\d{2})?)$/;

/** O instante num formato que todo motor lê: `T` no meio e fuso `±hh:mm`. */
function lerInstante(v: string): Date | null {
  const m = INSTANTE.exec(v.trim());
  if (!m) return null;
  const fuso = m[3] === 'Z' ? 'Z' : m[3]!.length === 3 ? `${m[3]}:00` : m[3]!.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(`${m[1]}T${m[2]}${fuso}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function partesEmSP(v: string | Date): Partes | null {
  const d = v instanceof Date ? v : lerInstante(String(v));
  if (!d || Number.isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of noFuso().formatToParts(d)) p[x.type] = x.value;
  return { ano: p.year!, mes: p.month!, dia: p.day!, hora: p.hour!, minuto: p.minute! };
}

/** O DIA em São Paulo de um instante: `2026-09-10T01:30:00Z` -> `2026-09-09`
 *  (eram 22h30 do dia 9 lá). `''` quando não é instante. É a chave para agrupar
 *  por dia — o dia da parede, e não o do servidor. */
export function diaEmSP(v: string | Date): string {
  const p = partesEmSP(v);
  return p ? `${p.ano}-${p.mes}-${p.dia}` : '';
}

/** A HORA em São Paulo: `2026-09-10T13:24:40Z` -> `10:24`. */
export function horaEmSP(v: string | null | undefined): string {
  if (vazio(v)) return VAZIO;
  const p = partesEmSP(String(v));
  return p ? `${p.hora}:${p.minuto}` : String(v).trim();
}

/** O INSTANTE inteiro: `2026-09-10T13:24:40Z` -> `10/09/2026 às 10:24`. O que
 *  não é instante com fuso cai em `diaEmBr` — é um dia, e dia não tem hora. */
export function momentoEmBr(v: string | null | undefined): string {
  if (vazio(v)) return VAZIO;
  const p = partesEmSP(String(v));
  return p ? `${p.dia}/${p.mes}/${p.ano} às ${p.hora}:${p.minuto}` : diaEmBr(v);
}

/** Hoje, em São Paulo, como `AAAA-MM-DD`. `toISOString()` é UTC: das 21h à
 *  meia-noite ele já diz amanhã, e o campo de data nasceria no dia errado. */
export const hojeEmSP = (agora: Date = new Date()): string => diaEmSP(agora);

/** O mês de hoje, em São Paulo, como `AAAA-MM`. */
export const mesDeHojeEmSP = (agora: Date = new Date()): string => hojeEmSP(agora).slice(0, 7);

/** `AAAA-MM-DD` menos um dia, por calendário (a virada do mês e do ano contam). */
export function diaAnterior(dia: string): string {
  const m = DIA_ISO.exec(dia);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * QUANDO, NUMA FRASE: «hoje às 10:24», «ontem às 21:40» ou «em 28/09/2026 às
 * 11:02». É o que um resumo de uma linha precisa — «às 10:24» sozinho, sem o
 * dia, fazia uma leitura de três dias atrás parecer de agora há pouco.
 */
export function quandoEmBr(v: string | null | undefined, agora: Date = new Date()): string {
  if (vazio(v)) return VAZIO;
  const p = partesEmSP(String(v));
  if (!p) return diaEmBr(v);
  const dia = `${p.ano}-${p.mes}-${p.dia}`;
  const hora = `${p.hora}:${p.minuto}`;
  const hoje = hojeEmSP(agora);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === diaAnterior(hoje)) return `ontem às ${hora}`;
  return `em ${p.dia}/${p.mes}/${p.ano} às ${hora}`;
}

/**
 * AS DATAS DENTRO DE UMA FRASE DO SERVIDOR. As mensagens de recusa são escritas
 * para quem opera e a tela as mostra como vêm — mas algumas interpolam a data
 * crua («A conta da unidade 123 em 2026-09-01 já virou fatura»). O servidor não
 * muda nesta etapa; a tela conserta o formato na chegada.
 *
 * O dia 1 depois de «competência», de «mês» ou de «unidade N em» é uma
 * COMPETÊNCIA, e vira `09/2026`; todo o resto vira `dd/mm/aaaa`. Um instante com hora vira o
 * instante em São Paulo. Palavra nenhuma é trocada — só o formato da data.
 */
export function datasDoTextoEmBr(texto: string): string {
  return texto
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)/g, (m) => momentoEmBr(m))
    .replace(/(\bunidade\s+\S+\s+em\s+|\bcompet[eê]ncia\s+(?:de\s+)?|\bm[eê]s\s+(?:de\s+)?)(\d{4})-(\d{2})-01\b/gi,
      (_m, antes: string, a: string, mm: string) => `${antes}${mm}/${a}`)
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, a: string, mm: string, d: string) => `${d}/${mm}/${a}`);
}

/* ================================================= o número da unidade */

/**
 * O NÚMERO DA UNIDADE CONSUMIDORA NA TELA — como o CADASTRO o guarda.
 *
 * O número do cadastro é a chave canônica, e o zero à esquerda dele pode ser
 * legítimo («0215334585» é um número de dez dígitos que começa com zero). Então
 * a tela NÃO tira zero de nada por conta própria.
 *
 * O ÚNICO PREENCHIMENTO QUE SE DESFAZ é o que o sistema já trata como o mesmo
 * número: `normalizarUc` (`lote-de-contas.ts`, com a irmã no servidor em
 * `src/dominio/fatura-concessionaria.ts`) completa com zeros até 15 dígitos, e é
 * assim que a conta lida casa com o cadastro. Se esse número completado bate com
 * uma unidade do cadastro, a tela mostra a do cadastro — «000006732614380» vira
 * «6732614380» porque o cadastro diz «6732614380». Sem o cadastro à mão, ou sem
 * unidade que case, o número sai como veio.
 */
export function numeroDaUcNaTela(
  bruto: string | null | undefined,
  cadastro?: ReadonlyMap<string, string> | null,
): string {
  if (vazio(bruto)) return VAZIO;
  const s = String(bruto).trim();
  const doCadastro = cadastro?.get(normalizarUc(s));
  return doCadastro ?? s;
}

/** O mapa «número completado -> número como o cadastro guarda», para
 *  `numeroDaUcNaTela`. Monta-se uma vez por lista de unidades. */
export function mapaDoCadastro(numeros: Iterable<string | null | undefined>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const n of numeros) {
    if (vazio(n)) continue;
    const chave = normalizarUc(n);
    if (chave && !mapa.has(chave)) mapa.set(chave, String(n).trim());
  }
  return mapa;
}

/* ============================================================ o plural */

/**
 * `3 contas vencidas`, `1 conta vencida`, `0 contas vencidas`. Os dois textos
 * vêm INTEIROS de quem chama — o português não pluraliza por sufixo («valor» ->
 * «valores», «já apurado» -> «já apurados»), e «conta(s) vencida(s)» era o
 * sintoma de um sistema que não sabia contar.
 */
export function contagem(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}
