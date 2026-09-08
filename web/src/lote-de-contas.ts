// O LOTE DE CONTAS DA DISTRIBUIDORA, como dado puro: o que entra na fila, o que
// impede uma linha de ser registrada, e em que ordem a pessoa deve olhar. Sem
// JSX, sem `fetch`, sem estado de React.
//
// ============================================================================
// POR QUE O LOTE EXISTE — `Q-CONTA-LOTE-01`, aberta em 21/08/2026
//
// O caminho oficial da fatura (`Q-CICLO-01`) e UMA UC POR VEZ: sobe um PDF,
// confere os 21 campos, registra. A carteira tem **29 UCs**, e a conta chega
// todo mes. Sao 29 uploads, 29 conferencias e 29 registros por competencia, e a
// propria questao registrou o prazo: *"a resposta muda de peso entre 29 clientes
// e 100"*.
//
// A camada `conta_lida_da_competencia` da prontidao conta exatamente esse
// trabalho, e ela marcava **0 de 29** — nao por falta de codigo no servidor, que
// esta inteiro (`POST /faturas/ler-fatura` + `POST /faturas/unificada/registros`),
// mas porque o unico jeito de exercita-lo era um arquivo de cada vez.
//
// ============================================================================
// O QUE ESTE ARQUIVO **NAO** FAZ, e a omissao e a decisao de projeto
//
// Ele NAO registra nada sozinho, e nao existe "registrar tudo". Cada linha so
// fica registravel quando tem UC e competencia legiveis, e o botao de bloco age
// sobre as linhas CONFERIDAS — nunca sobre as que tem pendencia. O motivo esta
// medido no proprio repositorio: `registrar()` e um `upsert` pela chave
// (UC, competencia), entao uma competencia lida errada nao levanta erro — ela
// grava no MES ERRADO, em silencio, e sobrescreve a conta que estava certa.
//
// Um lote que registra sem conferencia transforma um erro de leitura em 29.
//
// NAO LE JSX de proposito, como `abas-da-fatura.ts` e `contrato-regras.ts`: o
// runner do `web/` e `node --experimental-strip-types`, e o que mora num `.tsx`
// nao pode ser verificado (regra 8).

import { lerCompetencia, competenciaEmBr } from '../../src/dominio/competencia.ts';
import type { CamposDaFatura } from './api.ts';

/**
 * A REGRA DA COMPETENCIA VEM DO DOMINIO, e nao de uma copia daqui.
 *
 * Esta e a primeira vez que `web/src` importa de `src/dominio` — `web/tests` ja
 * fazia (`layout.ts` importa `qrcode.ts` e `brcode.ts`). O modulo e puro, nao
 * importa nada e nao toca banco nem rede, entao o bundler o carrega como
 * carregaria um arquivo daqui.
 *
 * A alternativa era reescrever a tabela dos doze meses nesta metade, e ela ja
 * custou uma vez: enquanto a regra viveu em dois arquivos, `MAI/2026` passava
 * num e era recusado no outro — e o recusado era o caminho que grava a conta
 * lida. Ver o bloco de abertura de `src/dominio/competencia.ts`.
 */

/** Onde cada arquivo esta. A fila inteira e uma lista destes. */
export type EstadoDoItem =
  | 'na_fila'      // escolhido, ainda nao foi ao modelo de visao
  | 'lendo'        // chamada paga em curso
  | 'lido'         // campos extraidos, esperando conferencia
  | 'falhou'       // a leitura nao voltou; a linha continua editavel a mao
  | 'registrando'
  | 'registrado';  // gravado em registro_de_fatura_unificada

export type ItemDoLote = {
  /** Chave estavel da linha. Nao e o nome do arquivo: dois arquivos podem ter
   *  o mesmo nome, e o `key` do React precisa sobreviver a reordenacao. */
  id: string;
  /** Como o arquivo se chama, ou `Digitada a mao` quando nao veio de arquivo. */
  nome: string;
  /** Bytes. `0` para a linha digitada. */
  tamanho: number;
  estado: EstadoDoItem;
  /** O que o modelo leu (ou o que a pessoa digitou). `null` ate a leitura voltar. */
  campos: CamposDaFatura | null;
  /** A mensagem da falha, quando `estado === 'falhou'`. */
  erro: string | null;
};

/**
 * O TETO DO ARQUIVO, espelhado de `src/http/rotas.ts` (`TETO_DO_ARQUIVO`).
 *
 * ESPELHO E NAO IMPORT porque o servidor o declara dentro de `rotas.ts`, que
 * arrasta banco, Prisma e sessao — nada disso pode entrar no bundle do browser.
 * A verificacao `L9` de `web/tests/lote-de-contas.ts` LE o arquivo do servidor e
 * compara os dois numeros, entao o espelho nao pode divergir em silencio.
 *
 * Conferir aqui e o que evita subir 29 arquivos para descobrir, um a um, que um
 * deles era grande demais — e a subida e a parte cara.
 */
export const TETO_DO_ARQUIVO = 8 * 1024 * 1024;

/**
 * Quantas leituras correm ao mesmo tempo.
 *
 * DOIS, e nao "todas": cada leitura e uma chamada PAGA ao modelo de visao, com
 * um PDF inteiro em base64 no corpo. Disparar 29 de uma vez poe 29 corpos na
 * rede do navegador, estoura o limite de conexoes por origem (6 no Chrome) e faz
 * o `LeitorSobrecarregado` (429) do servidor aparecer como "falhou" em arquivo
 * que nao tinha nada de errado — a pessoa reenviaria por engano.
 *
 * Com dois, a fila anda em ordem, cada falha e do arquivo dela, e a barra de
 * progresso significa alguma coisa.
 */
export const LEITURAS_SIMULTANEAS = 2;

/** Os tipos que o servidor aceita (`conferirAssinatura` decide pelos BYTES;
 *  isto aqui e so o filtro barato de antes de subir). */
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * A recusa ANTES de subir. `null` quando o arquivo pode ir.
 *
 * Devolve a frase que a linha vai mostrar — nao um codigo —, porque quem le e a
 * operacao e a frase precisa dizer o que fazer com o arquivo.
 */
export function recusaDoArquivo(a: { nome: string; tamanho: number; tipo: string }): string | null {
  if (a.tamanho === 0) return 'O arquivo está vazio (0 bytes).';
  if (a.tamanho > TETO_DO_ARQUIVO) {
    const mb = (a.tamanho / 1024 / 1024).toFixed(1).replace('.', ',');
    return `Tem ${mb} MB e o limite é ${TETO_DO_ARQUIVO / 1024 / 1024} MB. `
         + 'Uma conta em PDF tem centenas de KB — confira se o arquivo é o certo.';
  }
  const tipo = (a.tipo || '').toLowerCase();
  const pdfPeloNome = /\.pdf$/i.test(a.nome);
  if (tipo && !TIPOS_ACEITOS.includes(tipo) && !pdfPeloNome) {
    return `"${a.nome}" não é PDF nem imagem. Envie o PDF da conta ou uma foto legível dela.`;
  }
  return null;
}

/** Só os dígitos, com os zeros à esquerda que a Equatorial imprime. A UC do
 *  cadastro tem 15 dígitos (`DIGITOS_DA_UC`); um número mais curto é o mesmo
 *  número sem os zeros, e um mais longo é outro número — que não completamos. */
export function normalizarUc(bruto: string | null | undefined): string {
  const so = String(bruto ?? '').replace(/\D/g, '');
  if (!so) return '';
  return so.length <= 15 ? so.padStart(15, '0') : so;
}

/** A competência normalizada para `MM/AAAA`, ou `''` quando não é legível. */
export function competenciaDoItem(i: ItemDoLote): string {
  const c = lerCompetencia(i.campos?.mes_referencia);
  return c ? competenciaEmBr(c) : '';
}

/** A chave de negócio da linha, igual à do banco: `(UC, competência)`. `null`
 *  quando falta uma das metades — e é por isso que a linha não pode registrar. */
export function chaveDoItem(i: ItemDoLote): string | null {
  const uc = normalizarUc(i.campos?.unidade_consumidora);
  const comp = competenciaDoItem(i);
  return uc && comp ? `${uc}|${comp}` : null;
}

/**
 * POR QUE ESTA LINHA NAO PODE SER REGISTRADA. `null` quando ela pode.
 *
 * A ordem das perguntas e a ordem em que o servidor recusaria, para que a tela
 * nunca prometa um registro que a rota vai negar: primeiro a UC (`UcIlegivel`),
 * depois a competencia (`CompetenciaIlegivel`), e so entao o que e conferencia
 * nossa.
 */
export function pendenciaDoItem(
  i: ItemDoLote,
  ucsDoCadastro: ReadonlySet<string>,
  chavesRepetidas: ReadonlySet<string> = new Set(),
): string | null {
  if (i.estado === 'registrado') return null;
  if (i.estado === 'falhou') return i.erro ?? 'A leitura não voltou.';
  if (i.estado === 'na_fila' || i.estado === 'lendo') return 'Ainda não foi lida.';
  if (!i.campos) return 'Ainda não foi lida.';

  const uc = normalizarUc(i.campos.unidade_consumidora);
  if (!uc) return 'A conta não trouxe o número da unidade consumidora — digite-o antes de registrar.';
  if (!competenciaDoItem(i)) {
    return `Não consegui ler o mês "${i.campos.mes_referencia || '—'}". Use 05/2026, 2026-05 ou MAI/2026.`;
  }

  /* A UC FORA DO CADASTRO NAO IMPEDE — e a decisao esta no proprio servidor:
   * `registrar()` resolve `unidade_consumidora_id` por `numero_uc` e aceita
   * `null`, com o comentario dizendo por que ("travar a conferencia por cadastro
   * faltando e o tipo de exigencia que faz a pessoa registrar em outro lugar").
   * Aqui e AVISO, e por isso sai em `avisoDoItem` e nao aqui. */

  const chave = chaveDoItem(i);
  if (chave && chavesRepetidas.has(chave)) {
    return 'Outro arquivo desta fila traz a MESMA unidade no MESMO mês. '
         + 'Registrar os dois faria o segundo sobrescrever o primeiro — deixe só um.';
  }
  return null;
}

/**
 * O que merece atencao sem impedir o registro. `null` quando nao ha nada.
 *
 * Separado da pendencia de proposito: aviso que bloqueia vira pendencia
 * ignorada, e pendencia que so avisa vira dado errado gravado.
 */
export function avisoDoItem(i: ItemDoLote, ucsDoCadastro: ReadonlySet<string>): string | null {
  if (!i.campos || i.estado === 'na_fila' || i.estado === 'lendo') return null;
  const uc = normalizarUc(i.campos.unidade_consumidora);

  if (uc && ucsDoCadastro.size > 0 && !ucsDoCadastro.has(uc)) {
    return `A unidade ${uc} não está no cadastro. A conta é registrada assim mesmo, `
         + 'mas ela não vira fatura enquanto a unidade não existir.';
  }
  /* ZERO NAO E AUSENTE, e a distincao ja custou caro neste projeto: uma conta
   * que fecha em R$ 0,00 e um fato possivel (a compensacao cobriu tudo), e a
   * retomada de 08/09 registra uma real — a do Fernando Albino. Registrar e
   * decisao da operacao; a tela avisa e nao decide. */
  if (i.campos.valor_total_equatorial.trim() && Number(paraNumero(i.campos.valor_total_equatorial)) === 0) {
    return 'O total da conta fecha em R$ 0,00. Não é defeito — confira antes de registrar.';
  }
  return null;
}

/** Texto de dinheiro do extrator (`1234.56` ou `1.234,56`) para número. Só para
 *  COMPARAR com zero na tela: dinheiro de verdade é centavos no servidor (regra 1). */
function paraNumero(bruto: string): number {
  const t = String(bruto ?? '').trim();
  if (!t) return NaN;
  const semMilhar = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(semMilhar);
}

/**
 * As chaves que aparecem em mais de uma linha da fila.
 *
 * SO CONTA O QUE ESTA A CAMINHO DO BANCO — `lido` e `registrando`. As outras
 * tres exclusoes tem cada uma o seu motivo, e as tres foram medidas por uma
 * verificacao que falhou:
 *
 *   `na_fila` / `lendo`   ainda nao tem campos, e uma linha que NAO PODE ser
 *                         registrada nao pode impedir outra de ser. Deixa-las
 *                         contar fazia a fila acusar duplicata contra um arquivo
 *                         que o modelo nem tinha aberto;
 *   `falhou`              mesma coisa, e pior: a leitura que falhou nao tem
 *                         chave confiavel para comparar;
 *   `registrado`          reenviar a mesma conta para CORRIGIR e o caminho
 *                         normal do `upsert`. Bloquear isso trancaria a correcao.
 */
export function chavesRepetidas(itens: readonly ItemDoLote[]): ReadonlySet<string> {
  const vistas = new Map<string, number>();
  for (const i of itens) {
    if (i.estado !== 'lido' && i.estado !== 'registrando') continue;
    const c = chaveDoItem(i);
    if (c) vistas.set(c, (vistas.get(c) ?? 0) + 1);
  }
  return new Set([...vistas].filter(([, n]) => n > 1).map(([c]) => c));
}

export function podeRegistrar(
  i: ItemDoLote, ucs: ReadonlySet<string>, repetidas: ReadonlySet<string>,
): boolean {
  return i.estado === 'lido' && pendenciaDoItem(i, ucs, repetidas) === null;
}

export type ResumoDoLote = {
  total: number;
  lendo: number;
  prontos: number;
  comPendencia: number;
  registrados: number;
};

export function resumoDoLote(itens: readonly ItemDoLote[], ucs: ReadonlySet<string>): ResumoDoLote {
  const rep = chavesRepetidas(itens);
  let lendo = 0, prontos = 0, comPendencia = 0, registrados = 0;
  for (const i of itens) {
    if (i.estado === 'registrado') { registrados++; continue; }
    if (i.estado === 'na_fila' || i.estado === 'lendo' || i.estado === 'registrando') { lendo++; continue; }
    if (podeRegistrar(i, ucs, rep)) prontos++;
    else comPendencia++;
  }
  return { total: itens.length, lendo, prontos, comPendencia, registrados };
}

/**
 * A ORDEM DA FILA: primeiro o que precisa de gente, por ultimo o que ja acabou.
 *
 * O padrao "ordem de chegada" e o errado aqui. Com 29 linhas, a que precisa de
 * correcao nasce no meio da rolagem e some — e a tela fica dizendo "26 prontos"
 * enquanto tres pendencias esperam abaixo da dobra. Ordenar por necessidade poe
 * o trabalho no topo e deixa o resto como confirmacao.
 *
 * Dentro de cada grupo a ordem de chegada e preservada (`indice`), para que a
 * fila nao dance embaixo da mao de quem esta conferindo.
 */
export function ordemDaFila(
  itens: readonly ItemDoLote[], ucs: ReadonlySet<string>,
): ItemDoLote[] {
  const rep = chavesRepetidas(itens);
  const peso = (i: ItemDoLote): number => {
    if (i.estado === 'registrado') return 4;
    if (i.estado === 'na_fila' || i.estado === 'lendo' || i.estado === 'registrando') return 2;
    if (podeRegistrar(i, ucs, rep)) return 3;
    return 1; // pendencia: primeiro
  };
  return itens
    .map((i, indice) => ({ i, indice }))
    .sort((a, b) => peso(a.i) - peso(b.i) || a.indice - b.indice)
    .map(({ i }) => i);
}
