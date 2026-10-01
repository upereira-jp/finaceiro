// O TOM DE CADA ESTADO — um por estado, contra uma tabela escrita aqui.
// Uso: node --experimental-strip-types web/tests/tom-do-estado.ts
//
// ============================================================================
// O QUE ESTA SUITE PRENDE (01/10/2026, etapa 7b do redesenho)
//
// `web/src/tom-do-estado.ts` é o lugar único que diz a cor e o desenho de cada
// estado de negócio. Esta suíte prende três coisas, e as três vieram de um
// defeito medido pela crítica de 01/10 (P1 nº 2):
//
//   1. O TOM DE CADA ESTADO, um por um, contra a tabela `ESPERADO` abaixo. A
//      tabela é a ESPECIFICAÇÃO, escrita à mão e de propósito separada do mapa:
//      comparar o mapa com ele mesmo não mediria nada. Um estado novo no mapa
//      sem linha aqui falha (T0b), e uma linha aqui sem estado no mapa também;
//
//   2. AS CONTRADIÇÕES QUE A CRÍTICA ACHOU, cada uma com o seu nome: Rascunho e
//      Emitida no mesmo tom; a recusa do banco com três cores; «Vence em 5
//      dias» verde; o aviso de vencidas âmbar sobre selos vermelhos; «Alterou»
//      âmbar; a cancelada com a lixeira; a conta em aberto com o lápis;
//
//   3. QUE NENHUMA TELA DECIDE TOM: `Marca` só aceita um `Selo` (o compilador
//      prende), e esta suíte prende o resto — ninguém escreve `selo={{ … }}` à
//      mão, nem volta a passar `tom=` para um selo.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MAPA_DE_SELOS, SELO_DA_COBRANCA, SELO_DO_BOLETO_DA_COBRANCA, SELO_DO_BOLETO, SELO_DO_ATRASO,
  SELO_DA_FAIXA_VAZIA, SELO_DA_CONTA_A_PAGAR, SELO_DA_UNIDADE, SELO_DA_TRILHA, TENTANDO_DE_NOVO,
  seloDaFaixa, seloDoStatusDoBoleto, seloDoContrato, tipoDoAviso, pesoDoSelo, type Selo,
} from '../src/tom-do-estado.ts';
import { ICONE_DO_ESTADO, TONS_DO_SELO, type TomDoSelo } from '../src/iconografia.ts';
import { notaDaSituacao, notaDaRecusaCrua, seloDaRecusa, lerRecusa, recusaPrevista } from '../src/emissao-regras.ts';
import { FAIXAS } from '../src/receber-regras.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

/* ==========================================================================
 * A ESPECIFICAÇÃO — o tom de cada estado, escrito à mão
 * ==========================================================================
 *
 * A pergunta que decide cada linha é «o que isto pede de você?»: fechou (`ok`),
 * falhou (`erro`), é tarefa (`a_fazer`), não se sabe (`nao_medido`), ou nada a
 * fazer agora (`neutro`) — inclusive o que está em curso sem você.
 */
const ESPERADO: Readonly<Record<string, TomDoSelo>> = {
  // a cobrança
  'cobranca.rascunho': 'a_fazer',
  'cobranca.emitida': 'neutro',
  'cobranca.negociada': 'neutro',
  'cobranca.paga': 'ok',
  'cobranca.vencida': 'erro',
  'cobranca.cancelada': 'neutro',
  // o boleto da cobrança emitida (a segunda linha em Cobranças)
  'boleto_da_cobranca.nao_pedido': 'a_fazer',
  'boleto_da_cobranca.esquecido': 'a_fazer',
  'boleto_da_cobranca.recusa_prevista': 'a_fazer',
  'boleto_da_cobranca.recusado': 'erro',
  'boleto_da_cobranca.esperando': 'erro',
  'boleto_da_cobranca.insistindo': 'erro',
  'boleto_da_cobranca.parado': 'erro',
  // o boleto visto da carteira
  'boleto.sem_boleto': 'a_fazer',
  'boleto.boleto_a_caminho': 'neutro',
  'boleto.boleto_no_banco': 'ok',
  'boleto.boleto_importado': 'ok',
  'boleto.boleto_recusado': 'erro',
  'boleto.boleto_baixado': 'a_fazer',
  'boleto.boleto_pago': 'ok',
  'boleto.boleto_cancelado': 'neutro',
  'origem.emitido_no_banco': 'neutro',
  'origem.desconhecido': 'nao_medido',
  // o atraso
  'atraso.a_vencer': 'neutro',
  'atraso.ate_30': 'erro',
  'atraso.ate_60': 'erro',
  'atraso.ate_90': 'erro',
  'atraso.acima_90': 'erro',
  'atraso.faixa_vazia': 'neutro',
  // o dinheiro que sai
  'conta_a_pagar.aberta': 'a_fazer',
  'conta_a_pagar.parcial': 'a_fazer',
  'conta_a_pagar.paga': 'ok',
  'conta_a_pagar.cancelada': 'neutro',
  'conta_a_pagar.vencida': 'erro',
  'espera_do_repasse.sem_dono': 'a_fazer',
  'espera_do_repasse.aguardando_banco': 'neutro',
  'espera_do_repasse.pronto': 'a_fazer',
  // o cadastro
  'unidade.ativa': 'ok',
  'unidade.aguardando_ativacao': 'neutro',
  'unidade.em_troca_titularidade': 'neutro',
  'unidade.suspensa': 'neutro',
  'unidade.situacao_nao_lida': 'nao_medido',
  'unidade.cancelada': 'neutro',
  'endereco.vazio': 'a_fazer',
  'endereco.parcial': 'a_fazer',
  'endereco.completo': 'ok',
  'documento.sem_documento': 'a_fazer',
  'documento.digito_nao_confere': 'a_fazer',
  'documento.semente_do_crm': 'nao_medido',
  'documento.validado': 'ok',
  'contrato.ativo': 'ok',
  'contrato.rascunho': 'a_fazer',
  'contrato.suspenso': 'neutro',
  'contrato.encerrado': 'neutro',
  'cadastro.ativo': 'ok',
  'cadastro.inativo': 'neutro',
  'geracao.lancada': 'ok',
  'geracao.falta': 'a_fazer',
  'conferencia.ok': 'ok',
  'conferencia.pendente': 'a_fazer',
  'conferencia.nao_medido': 'nao_medido',
  'leitura_do_crm.recusa': 'erro',
  'leitura_do_crm.revisão': 'a_fazer',
  'leitura_do_crm.divergência': 'a_fazer',
  'degrau.pronto': 'ok',
  'pessoa.voce': 'neutro',
  'pessoa.conta_do_sistema': 'neutro',
  // a trilha
  'trilha.I': 'neutro',
  'trilha.U': 'neutro',
  'trilha.D': 'neutro',
  // os atos em série
  'vez.na_vez': 'neutro',
  'vez.andando': 'neutro',
  'vez.feita': 'ok',
  'vez.recusada': 'erro',
  'leitura.na_fila': 'neutro',
  'leitura.lendo': 'neutro',
  'leitura.registrando': 'neutro',
  'leitura.registrado': 'ok',
  'leitura.falhou': 'erro',
  'leitura.corrigir': 'a_fazer',
  'leitura.conferida': 'ok',
  'registro.gerando': 'neutro',
  'registro.gerada': 'ok',
  'registro.recusada': 'erro',
  'registro.na_vez': 'neutro',
  'registro.sem_ligacao': 'nao_medido',
  'registro.sem_cobranca': 'a_fazer',
  'registro.conferindo': 'neutro',
};

/* ==========================================================================
 * T0 — o mapa e a especificação têm os mesmos estados
 * ========================================================================== */

const NO_MAPA: Array<[string, Selo]> = Object.entries(MAPA_DE_SELOS)
  .flatMap(([grupo, selos]) => Object.entries(selos).map(([estado, s]): [string, Selo] => [`${grupo}.${estado}`, s]));

{
  const semEspecificacao = NO_MAPA.map(([k]) => k).filter((k) => !(k in ESPERADO));
  const semMapa = Object.keys(ESPERADO).filter((k) => !NO_MAPA.some(([m]) => m === k));
  chk('T0', NO_MAPA.length >= 80, `o mapa tem ${NO_MAPA.length} estados — a suíte não está olhando para um mapa vazio`);
  chk('T0b', semEspecificacao.length === 0 && semMapa.length === 0,
      'todo estado do mapa tem a sua linha na especificação, e toda linha da especificação existe no mapa'
      + `${semEspecificacao.length ? ` — SEM LINHA: ${semEspecificacao.join(', ')}` : ''}`
      + `${semMapa.length ? ` — SEM ESTADO: ${semMapa.join(', ')}` : ''}`);
}

/* ==========================================================================
 * T1 — um por estado
 * ========================================================================== */

for (const [estado, s] of NO_MAPA) {
  const esperado = ESPERADO[estado];
  chk('T1', esperado !== undefined && s.tom === esperado && TONS_DO_SELO.includes(s.tom) && Boolean(s.icone),
      `${estado} é «${s.tom}»${esperado && s.tom !== esperado ? ` — a especificação diz «${esperado}»` : ''}, com o desenho «${s.icone}»`);
}

/* ==========================================================================
 * T2 — as contradições que a crítica de 01/10 achou, cada uma pelo nome
 * ========================================================================== */

chk('T2a', SELO_DA_COBRANCA.rascunho.tom !== SELO_DA_COBRANCA.emitida.tom
        && SELO_DA_COBRANCA.rascunho.tom === 'a_fazer' && SELO_DA_COBRANCA.emitida.tom === 'neutro',
    'Rascunho (tarefa) e Emitida (feito, em curso) não dividem mais o tom — eram o mesmo âmbar, e 16 das '
    + '20 linhas de Cobranças ficavam iguais');

{
  /* A RECUSA DO BANCO É `erro` EM TODA TELA: no selo de Contas a receber, na
     segunda linha de Cobranças (com e sem o sistema retentando), no painel do
     boleto, na recusa crua e na revisão em série. */
  const endereco = lerRecusa({ nome: 'PagadorSemEndereco', numeroUc: '1', mes: '2026-09' });
  const tentando = notaDaSituacao('emitida', { nivel: 'esperando' }, null)!;
  const conhecidaTentando = notaDaSituacao('emitida', { nivel: 'esperando' }, endereco)!;
  const insistindo = notaDaSituacao('emitida', { nivel: 'insistindo' }, endereco)!;
  const recusas: Array<[string, TomDoSelo]> = [
    ['Contas a receber (selo)', SELO_DO_BOLETO.boleto_recusado.tom],
    ['Cobranças, sistema retentando', tentando.selo.tom],
    ['Cobranças, recusa conhecida retentando', conhecidaTentando.selo.tom],
    ['Cobranças, recusa conhecida', insistindo.selo.tom],
    ['Cobranças, recusa crua da sessão', notaDaRecusaCrua('Erro 500').selo.tom],
    ['painel do boleto (status erro)', seloDoStatusDoBoleto('erro').tom],
    ['recusa na tela', seloDaRecusa(endereco).tom],
    ['revisão em série', MAPA_DE_SELOS.vez!.recusada!.tom],
  ];
  const fora = recusas.filter(([, t]) => t !== 'erro');
  chk('T2b', fora.length === 0,
      `a recusa do banco é \`erro\` nos ${recusas.length} lugares que a mostram`
      + `${fora.length ? ` — FORA: ${fora.map(([n, t]) => `${n}=${t}`).join(', ')}` : ''}`);
  chk('T2c', tentando.depois === TENTANDO_DE_NOVO && conhecidaTentando.depois === TENTANDO_DE_NOVO
          && insistindo.depois === null,
      'quando o sistema já está tentando de novo, isso vem como SEGUNDA LINHA, e não como outra cor');
  const prevista = recusaPrevista({ numero_uc: '1', endereco_logradouro: 'Rua A' }, '2026-09');
  chk('T2d', seloDaRecusa(prevista).tom === 'a_fazer'
          && notaDaSituacao('emitida', { nivel: 'nao_pedido' }, prevista)!.selo.tom === 'a_fazer',
      'a recusa que o cadastro só ANUNCIA (ninguém pediu nada) é tarefa, e não falha');
}

chk('T2e', SELO_DO_ATRASO.a_vencer.tom === 'neutro' && SELO_DO_ATRASO.a_vencer.icone !== 'ok',
    '«A vencer» / «Vence em N dias» é neutro e sem o visto: o verde dizia «resolvido» sobre o que ninguém pagou');

chk('T2f', SELO_DA_FAIXA_VAZIA.tom === 'neutro' && SELO_DA_FAIXA_VAZIA.icone !== ICONE_DO_ESTADO.nao_medido
        && FAIXAS.every((f) => seloDaFaixa(f, 0) === SELO_DA_FAIXA_VAZIA),
    'a faixa de atraso zerada é neutra, e não a interrogação de «não se sabe»');

{
  /* «MAIS DE 90 DIAS» NUNCA MAIS LEVE QUE «ATÉ 30»: o peso de um tom é a ordem
     do que pede atenção. Com título, cada faixa de atraso pesa pelo menos o
     mesmo que a anterior. */
  const PESO: Record<TomDoSelo, number> = { erro: 4, a_fazer: 3, nao_medido: 2, ok: 1, neutro: 0 };
  const atrasos = FAIXAS.slice(1).map((f) => PESO[seloDaFaixa(f, 3).tom]);
  chk('T2g', atrasos.every((p, i) => i === 0 || p >= atrasos[i - 1]!) && atrasos.every((p) => p === PESO.erro),
      `com título, toda faixa de atraso tem o peso da falha, e nenhuma pesa menos que a anterior (${atrasos.join(' ≤ ')})`);
}

{
  const pagar = readFileSync(new URL('../src/telas/contas-a-pagar.tsx', import.meta.url), 'utf8');
  chk('T2h', tipoDoAviso(SELO_DA_CONTA_A_PAGAR.vencida) === 'erro'
          && /\{atrasadas\.length > 0 && \(\s*<Aviso tipo=\{tipoDoAviso\(SELO_DA_CONTA_A_PAGAR\.vencida\)\}>/.test(pagar),
      'o aviso «N contas vencidas» lê o tom do MESMO selo VENCIDA das linhas — `erro`; era âmbar');
  const app = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
  chk('T2m', /<Aviso tipo="alerta">\s*Escolha a empresa/.test(app) && !/<Aviso tipo="erro">\s*Escolha a empresa/.test(app),
      '«Escolha a empresa» é escolha pendente (âmbar), e não falha');
}

chk('T2i', Object.values(SELO_DA_TRILHA).every((s) => s.tom === 'neutro')
        && new Set(Object.values(SELO_DA_TRILHA).map((s) => s.icone)).size === 3
        && SELO_DA_TRILHA.U.icone !== ICONE_DO_ESTADO.a_fazer,
    'os verbos da trilha são neutros (um verbo de auditoria não é tarefa), distintos pelo desenho, e «Alterou» '
    + 'não usa o lápis da tarefa');

chk('T2j', [SELO_DA_UNIDADE.cancelada, SELO_DA_COBRANCA.cancelada, SELO_DA_CONTA_A_PAGAR.cancelada, SELO_DO_BOLETO.boleto_cancelado]
        .every((s) => s.icone === 'cancelado'),
    'toda cancelada tem o círculo cortado — e não a lixeira, que é o desenho do botão de apagar');

chk('T2k', SELO_DA_CONTA_A_PAGAR.aberta.icone !== ICONE_DO_ESTADO.a_fazer
        && SELO_DA_CONTA_A_PAGAR.parcial.icone !== ICONE_DO_ESTADO.a_fazer,
    '«Em aberto» em Contas a pagar não usa o lápis da lacuna de cadastro');

chk('T2l', seloDoContrato('ativo').tom === 'ok' && seloDoContrato('qualquer-outro').tom === 'neutro',
    'o status de contrato que a tela não conhece cai no neutro, e não numa cor que afirma algo');

/* ==========================================================================
 * T3 — as regras do DESIGN.md, sobre o mapa inteiro
 * ========================================================================== */

{
  /* RED IS FAILURE: o vermelho só para o que aconteceu e deu errado. A lista
     abaixo é a de estados de falha; nenhum outro estado pode ser `erro`. */
  const FALHAS = new Set([
    'cobranca.vencida', 'boleto_da_cobranca.recusado', 'boleto_da_cobranca.esperando',
    'boleto_da_cobranca.insistindo', 'boleto_da_cobranca.parado', 'boleto.boleto_recusado',
    'atraso.ate_30', 'atraso.ate_60', 'atraso.ate_90', 'atraso.acima_90', 'conta_a_pagar.vencida',
    'leitura_do_crm.recusa', 'vez.recusada', 'leitura.falhou', 'registro.recusada',
  ]);
  const vermelhosAMais = NO_MAPA.filter(([k, s]) => s.tom === 'erro' && !FALHAS.has(k)).map(([k]) => k);
  chk('T3a', vermelhosAMais.length === 0,
      `só a falha é vermelha (${FALHAS.size} estados)${vermelhosAMais.length ? ` — A MAIS: ${vermelhosAMais.join(', ')}` : ''}`);
  /* O LÁPIS É DA TAREFA: nenhum selo fora de `a_fazer` usa o desenho dele. */
  const lapisFora = NO_MAPA.filter(([, s]) => s.icone === ICONE_DO_ESTADO.a_fazer && s.tom !== 'a_fazer').map(([k]) => k);
  chk('T3b', lapisFora.length === 0,
      `o lápis só aparece em tarefa${lapisFora.length ? ` — FORA: ${lapisFora.join(', ')}` : ''}`);
  /* A INTERROGAÇÃO É DO «NÃO SE SABE»: nenhum selo fora de `nao_medido` a usa. */
  const interrogacaoFora = NO_MAPA.filter(([, s]) => s.icone === ICONE_DO_ESTADO.nao_medido && s.tom !== 'nao_medido').map(([k]) => k);
  chk('T3c', interrogacaoFora.length === 0,
      `a interrogação só aparece no «não se sabe»${interrogacaoFora.length ? ` — FORA: ${interrogacaoFora.join(', ')}` : ''}`);
  /* O VISTO É DO QUE FECHOU. */
  const vistoFora = NO_MAPA.filter(([, s]) => s.icone === ICONE_DO_ESTADO.ok && s.tom !== 'ok').map(([k]) => k);
  chk('T3d', vistoFora.length === 0,
      `o visto só aparece no que fechou${vistoFora.length ? ` — FORA: ${vistoFora.join(', ')}` : ''}`);
}

/* ==========================================================================
 * T4 — nenhuma tela decide tom
 * ========================================================================== */

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
function todosOsArquivos(dir: string, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? todosOsArquivos(`${dir}${e.name}/`, `${base}${e.name}/`)
      : /\.(ts|tsx)$/.test(e.name) ? [`${base}${e.name}`] : []);
}
const semComentario = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(?<!:)\/\/[^\n]*/g, '');
const FONTES = todosOsArquivos(SRC).map((f) => [f, semComentario(readFileSync(SRC + f, 'utf8'))] as const);

{
  const marcas = FONTES.flatMap(([f, t]) => [...t.matchAll(/<Marca\b[^>]*>/g)].map((m) => [f, m[0]] as const));
  const comTom = marcas.filter(([, m]) => /\btom=|\bicone=/.test(m) || !/\bselo=\{/.test(m));
  const aMao = marcas.filter(([, m]) => /\bselo=\{\{/.test(m));
  chk('T4a', marcas.length >= 40 && comTom.length === 0 && aMao.length === 0,
      `os ${marcas.length} selos das telas leem o tom de \`tom-do-estado.ts\` — nenhum passa \`tom=\`, `
      + `nenhum escreve o selo à mão${[...comTom, ...aMao].length ? ` — ACHADO: ${[...comTom, ...aMao].map(([f]) => f).join(', ')}` : ''}`);
  const tons = FONTES.filter(([f, t]) => f !== 'tom-do-estado.ts' && f !== 'iconografia.ts'
    && /(?:Record<[^>]*,\s*TomDoSelo>|:\s*TomDoSelo\s*=>)/.test(t)).map(([f]) => f);
  chk('T4b', tons.length === 0,
      `nenhum outro arquivo monta um mapa de estado para tom${tons.length ? ` — ACHADO: ${tons.join(', ')}` : ''}`);
}

/* ==========================================================================
 * T5 — a coluna de estado ordena pela pergunta do mapa (01/10/2026, etapa 7c)
 * ========================================================================== */
{
  const ordem = [...TONS_DO_SELO].sort((a, b) => pesoDoSelo({ tom: a }) - pesoDoSelo({ tom: b }));
  chk('T5a', ordem.join(',') === 'erro,a_fazer,nao_medido,neutro,ok',
      `«o que precisa de você primeiro» é a falha, a tarefa, o não sabido, o em curso e o fechado, nessa ordem (veio: ${ordem.join(',')})`);
  const pagar = SELO_DA_CONTA_A_PAGAR;
  chk('T5b', pesoDoSelo(pagar.vencida) < pesoDoSelo(pagar.aberta) && pesoDoSelo(pagar.aberta) < pesoDoSelo(pagar.cancelada)
          && pesoDoSelo(pagar.cancelada) < pesoDoSelo(pagar.paga)
          && pesoDoSelo(SELO_DO_BOLETO.boleto_recusado) < pesoDoSelo(SELO_DO_BOLETO.sem_boleto)
          && pesoDoSelo(SELO_DO_BOLETO.sem_boleto) < pesoDoSelo(SELO_DO_BOLETO.boleto_no_banco),
      'em Contas a pagar a vencida vem antes da em aberto, que vem antes da cancelada e da paga; em Contas a '
      + 'receber a recusa vem antes do boleto a pedir, que vem antes do que já está no banco');
  const telas = ['contas-a-pagar', 'contas-a-receber', 'contratos', 'unidades']
    .map((t) => [t, semComentario(readFileSync(new URL(`../src/telas/${t}.tsx`, import.meta.url), 'utf8'))] as const);
  const sem = telas.filter(([, t]) => !/pesoDoSelo\(/.test(t) || !/direcoes=\{DIRECOES_DA_SITUACAO\}/.test(t)).map(([n]) => n);
  chk('T5c', sem.length === 0,
      'as colunas de estado que dizem «o que precisa de você primeiro» ordenam pelo peso do tom — a palavra e a '
      + `ordem são a mesma coisa${sem.length ? ` — FALTA EM: ${sem.join(', ')}` : ''}`);
}

console.log();
if (falhas > 0) { console.log(`--- tom do estado: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- tom do estado (um por estado, e nenhuma tela decide cor): ${feitas} verificacoes, 0 falhas`);
