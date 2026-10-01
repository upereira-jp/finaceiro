// O MÊS DE TRABALHO DO RATEIO — escolhido uma vez, valendo para as telas do mês.
//
// ============================================================================
// O PEDIDO (dono, 01/10/2026 — etapa 8 do redesenho)
//
// Até aqui três telas tinham, cada uma, o próprio seletor de mês: Mês
// (`telas/prontidao.tsx`), Contas de luz (a lista das registradas e o «Faltam N
// contas», em `telas/fatura-unificada.tsx` e `contas-que-faltam.tsx`) e
// Cobranças (`telas/faturas.tsx`). Cada um com a sua regra de abertura — o Mês e
// Cobranças pela procura do trabalho, as registradas pelo mês com conta por
// gerar, o «Faltam» pelo mês lembrado —, e a crítica de 01/10 perguntou por que
// (pergunta 2: «por que cada tela tem seu seletor de mês?»). O dono decidiu:
// **um mês único, escolhido uma vez e válido para todas as telas do trabalho do
// mês**. O mês é a unidade do trabalho; três seletores eram três chances de
// olhar o mês errado — escolher agosto em Mês e abrir Cobranças em setembro.
//
// ============================================================================
// O QUE MORA AQUI, e por que é `.ts` puro
//
// A REGRA — de onde vem o mês, em que ordem, o que o segue, como ele vai para o
// endereço, quando a tela avisa que há trabalho mais à frente, o atalho do
// teclado e a conta de outro mês na fila. Sem JSX, sem efeito, sem rede: o
// runner do `web/` não lê JSX, e o que não pode ser verificado não é regra
// (regra 8). Quem guarda o estado e desenha o controle é `seletor-de-mes.tsx`;
// quem procura o mês com trabalho na API é `procurarMesComTrabalho`
// (`emissao-regras.ts`), ligado à rede por `leitura-do-mes.ts`.
//
// A suíte é `web/tests/mes-do-trabalho.ts`.

import { mesPorExtenso } from './formato.ts';
import { alvoRecebeLetra } from './teclado.ts';
import { TELAS } from './navegacao.ts';

/** `AAAA-MM` de um mês de verdade. */
export const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ehMes = (m: unknown): m is string => typeof m === 'string' && MES_VALIDO.test(m);

/* ==========================================================================
 * 1. DE ONDE VEIO O MÊS
 * ========================================================================== */

/**
 * A ORIGEM do mês aberto. `trabalho`, `recente` e `hoje` são as respostas da
 * procura (`procurarMesComTrabalho`); `endereco` é o `?mes=` de um link;
 * `lembrado` é a última escolha da pessoa neste navegador; `escolhido` é a
 * escolha feita agora, no controle ou no teclado.
 */
export type OrigemDoMes = 'endereco' | 'trabalho' | 'lembrado' | 'recente' | 'hoje' | 'escolhido';

/** O mês em que a tela abre, e por quê. `certo` é da procura: `true` quando o
 *  trabalho é sabido sem ler o mês (há emitida sem boleto, ou conta por virar
 *  cobrança), `false` quando foi preciso ler o mês para achar o rascunho. */
export type EscolhaDoMes = { mes: string; origem: OrigemDoMes; certo?: boolean };

/**
 * O MÊS DE TRABALHO, NESTA ORDEM (decisão do dono, 01/10/2026):
 *
 *   1. o `?mes=` do endereço — quem chega por um link (o funil do Mês, «Ver em
 *      Cobranças» de Contas a receber, os recortes da etapa 7a) chega no mês do
 *      link, e esse mês passa a ser o de todas as telas;
 *   2. o mês que a pessoa escolheu e o navegador lembrou;
 *   3. o mês mais recente com trabalho (a procura), ou, sem trabalho em mês
 *      nenhum, o mais recente com conta ou cobrança;
 *   4. o mês de hoje, em São Paulo.
 *
 * ATÉ 01/10/2026 O LEMBRADO VINHA DEPOIS DO TRABALHO, nas telas Mês e
 * Cobranças: elas abriam sempre no trabalho e só lembravam a escolha quando não
 * havia trabalho nenhum. Com um mês só para o sistema, a escolha da pessoa vem
 * antes — escolher setembro e ver a tela seguinte abrir em outubro era
 * exatamente o defeito que o dono pediu para acabar. O risco de ficar preso num
 * mês velho é coberto pelo aviso (`mesComTrabalhoAFrente`, seção 4).
 *
 * `null` é «ainda procurando»: sem endereço nem lembrança, o mês depende da
 * procura, e a tela diz que procura em vez de mostrar o mês de hoje por um
 * instante. A procura que FALHOU inteira não segura a tela: `procurando:
 * false` e nenhum resultado caem no mês de hoje.
 */
export function resolverMes(p: {
  doEndereco: string | null;
  lembrado: string | null;
  procurado: EscolhaDoMes | null;
  procurando: boolean;
  hoje: string;
}): EscolhaDoMes | null {
  if (ehMes(p.doEndereco)) return { mes: p.doEndereco, origem: 'endereco' };
  if (ehMes(p.lembrado)) return { mes: p.lembrado, origem: 'lembrado' };
  if (p.procurado && ehMes(p.procurado.mes)) return { ...p.procurado };
  if (p.procurando) return null;
  return { mes: p.hoje, origem: 'hoje' };
}

/**
 * A FRASE DO PORQUÊ, inteira — no painel do controle. Era escrita ao lado do
 * seletor de Mês e de Cobranças (`fraseDaOrigem`, em `emissao-regras.ts`), uma
 * cópia por tela; desde a etapa 8 ela sai daqui, e só o controle a mostra.
 * Sem ela, abrir em agosto com outubro no calendário parece defeito.
 */
export function fraseDaOrigem(origem: OrigemDoMes): string {
  switch (origem) {
    case 'endereco': return 'Aberto no mês pedido pelo link.';
    case 'lembrado': return 'Aberto no último mês que você escolheu neste computador.';
    /* UMA FRASE para os três trabalhos: o mês com conta por virar cobrança
       quase sempre tem rascunho também, e dizer só um soaria como se o outro
       não estivesse lá. */
    case 'trabalho': return 'Aberto no mês mais recente com trabalho: conta por virar cobrança, cobrança por emitir ou sem boleto no banco.';
    case 'recente': return 'Nenhum mês tem trabalho por fazer. Aberto no mês mais recente com contas ou cobranças.';
    case 'hoje': return 'Nenhum mês tem conta nem cobrança ainda. Aberto no mês corrente.';
    case 'escolhido': return 'Escolhido por você.';
  }
}

/** A MESMA RAZÃO EM QUATRO PALAVRAS — a terceira linha do controle, no menu,
 *  onde a frase inteira não cabe. Vazia quando a pessoa acabou de escolher: ela
 *  sabe por quê. */
export function notaDaOrigem(origem: OrigemDoMes | null): string {
  switch (origem) {
    case 'endereco': return 'aberto pelo link';
    case 'lembrado': return 'o último que você escolheu';
    case 'trabalho': return 'o mais recente com trabalho';
    case 'recente': return 'o mais recente com contas';
    case 'hoje': return 'o mês corrente';
    default: return '';
  }
}

/* ==========================================================================
 * 2. O QUE SEGUE O MÊS, e o que não segue
 * ========================================================================== */

/**
 * `segue`     a tela MOSTRA o mês de trabalho: o funil e as conferências do
 *             Mês, as registradas e o «Faltam N contas» de Contas de luz, as
 *             cobranças de Cobranças. O endereço leva sempre o `?mes=`.
 * `recorta`   Relatórios. O padrão dele é «todos os meses», e continua sendo:
 *             é a série que o contador pede (o repasse devido se acumula, a
 *             comissão vem em parcelas). Recortar num mês só usa o MÊS DE
 *             TRABALHO — não há um quarto seletor —, e o `?mes=` no endereço é
 *             o recorte ligado.
 * `nao_segue` os cadastros (cliente, unidade, contrato, usina e dono não têm
 *             mês), o setor Empresa (Contas a receber e Contas a pagar têm os
 *             filtros de data deles) e a Administração. Nelas o `?mes=` não é o
 *             mês de trabalho: em Unidades ele é «o mês de onde a pessoa veio»,
 *             para a volta (`destinoDoEndereco`).
 */
export type ComoSegue = 'segue' | 'recorta' | 'nao_segue';

export const COMO_SEGUE_O_MES: Readonly<Record<string, ComoSegue>> = {
  '/pendencias': 'segue',
  '/documento': 'segue',
  '/faturas': 'segue',
  '/relatorios': 'recorta',
};

export const comoSegueOMes = (rota: string): ComoSegue => COMO_SEGUE_O_MES[rota] ?? 'nao_segue';

/** As rotas que mostram o mês de trabalho — e que o recebem pelo link. */
export const ROTAS_QUE_SEGUEM_O_MES: readonly string[] =
  Object.keys(COMO_SEGUE_O_MES).filter((r) => COMO_SEGUE_O_MES[r] === 'segue');

const nomeDaTela = (rota: string): string => TELAS.find((t) => t.rota === rota)?.titulo ?? rota;

/** «A, B e C». */
const emLista = (nomes: readonly string[]): string =>
  nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;

/**
 * A FRASE DO ALCANCE, para ninguém achar que o mês filtra o que não filtra. Os
 * nomes saem do MENU (`navegacao.ts`), letra por letra: renomear uma tela
 * renomeia aqui.
 */
export function fraseDoAlcance(): string {
  const seguem = ROTAS_QUE_SEGUEM_O_MES.map(nomeDaTela);
  const recortam = Object.keys(COMO_SEGUE_O_MES).filter((r) => COMO_SEGUE_O_MES[r] === 'recorta').map(nomeDaTela);
  return `Vale para ${emLista(seguem)}${recortam.length ? `, e para o recorte de ${emLista(recortam)}` : ''}. `
    + 'Os cadastros e o setor Empresa não mudam com ele.';
}

/* ==========================================================================
 * 3. O ENDEREÇO
 * ========================================================================== */

/**
 * O `?mes=` DO ENDEREÇO, `AAAA-MM`, ou `null`. É a mesma regra de `mesDaQuery`
 * (`dinheiro.ts`) — a suíte prende as duas juntas —, escrita aqui para a casca
 * não carregar o módulo do dinheiro inteiro no pedaço de entrada.
 */
export const mesDoEndereco = (busca: string): string | null => {
  const m = new URLSearchParams(busca).get('mes');
  return ehMes(m) ? m : null;
};

/**
 * O MÊS QUE O ENDEREÇO PEDE PARA O TRABALHO — só nas telas que seguem o mês.
 * Em Unidades o `?mes=` é a volta, e em Contas a receber não existe: lá ele
 * não muda o mês de ninguém.
 */
export function mesPedidoPeloEndereco(rota: string, busca: string): string | null {
  return comoSegueOMes(rota) === 'nao_segue' ? null : mesDoEndereco(busca);
}

/**
 * O ENDEREÇO COM O MÊS, para o `replaceState` — ou `null` quando nada muda.
 *
 * Trocar o mês reescreve o endereço sem empilhar histórico: o link copiado e o
 * F5 continuam no mês que está na tela, e o «voltar» não vira uma lista de
 * meses visitados. Os outros parâmetros (`?pendencia=`, `?uc=`) e o fragmento
 * (`#cadastro`, que abre a aba de Contas de luz) ficam onde estavam.
 *
 *   `segue`     o `?mes=` está sempre no endereço;
 *   `recorta`   só troca o que já está lá — sem `?mes=`, Relatórios está em
 *               «todos os meses», e é a tela que liga o recorte;
 *   `nao_segue` não toca.
 */
export function enderecoComOMes(
  lugar: { caminho: string; busca: string; fragmento: string },
  mes: string | null,
  como: ComoSegue,
): string | null {
  if (!ehMes(mes) || como === 'nao_segue') return null;
  const q = new URLSearchParams(lugar.busca);
  if (q.get('mes') === mes) return null;
  if (como === 'recorta' && !q.has('mes')) return null;
  q.set('mes', mes);
  return `${lugar.caminho}?${q.toString()}${lugar.fragmento}`;
}

/** O endereço sem o `?mes=` — o recorte de Relatórios desligado. */
export function enderecoSemOMes(lugar: { caminho: string; busca: string; fragmento: string }): string {
  const q = new URLSearchParams(lugar.busca);
  q.delete('mes');
  const resto = q.toString();
  return `${lugar.caminho}${resto ? `?${resto}` : ''}${lugar.fragmento}`;
}

/* ==========================================================================
 * 4. O AVISO DO MÊS VELHO
 * ========================================================================== */

/**
 * HÁ TRABALHO MAIS À FRENTE? — o mês com trabalho, quando a tela deve avisar.
 *
 * A lembrança tem um custo: quem escolheu agosto na semana passada abre hoje em
 * agosto, com setembro inteiro por cobrar. A tela avisa — «Há trabalho em
 * setembro de 2026 → ir» — quando o mês aberto veio de uma LEMBRANÇA ou de um
 * LINK e está ATRÁS do mês mais recente com trabalho.
 *
 * NÃO AVISA quando a pessoa acabou de escolher (`escolhido`): ela foi lá de
 * propósito, e um aviso repetido a cada tela é o aviso que se aprende a não
 * ler. Nem quando o mês aberto está à frente do trabalho: andar para o mês
 * seguinte é o curso normal (é nele que as contas novas chegam), e o trabalho
 * de meses anteriores já tem lugar em Cobranças («N de outros meses»). Nem
 * quando a procura não achou trabalho (`recente`, `hoje`): sem trabalho, não há
 * para onde mandar.
 */
export function mesComTrabalhoAFrente(
  aberto: EscolhaDoMes | null,
  procurado: EscolhaDoMes | null,
): string | null {
  if (!aberto || !procurado || procurado.origem !== 'trabalho') return null;
  if (aberto.origem !== 'lembrado' && aberto.origem !== 'endereco') return null;
  return aberto.mes < procurado.mes ? procurado.mes : null;
}

/* ==========================================================================
 * 5. ANDAR UM MÊS — o controle e o teclado
 * ========================================================================== */

/** O mês `passo` meses depois (ou antes, negativo): `2026-12` + 1 = `2027-01`. */
export function mesVizinho(mes: string, passo: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const t = a * 12 + (m - 1) + passo;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** As teclas do atalho: `[` volta um mês, `]` avança um. */
export const TECLAS_DO_MES = { anterior: '[', seguinte: ']' } as const;

/**
 * O PASSO DO ATALHO — `-1`, `1`, ou `0` quando a tecla não é dele.
 *
 * `[` e `]` porque são uma tecla só nos dois teclados em uso (o ABNT2 e o
 * americano), ficam lado a lado e não são de nenhum atalho do navegador. Setas
 * foram descartadas: elas rolam a página e andam dentro de listas e grades — o
 * próprio painel do mês as usa. Com Ctrl, Alt ou ⌘ a tecla é de outra coisa,
 * e com o foco num campo de texto ela é uma letra (`alvoRecebeLetra`).
 */
export function passoDoAtalho(e: {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  isComposing?: boolean; defaultPrevented?: boolean; target: unknown;
}): -1 | 0 | 1 {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return 0;
  if (e.key !== TECLAS_DO_MES.anterior && e.key !== TECLAS_DO_MES.seguinte) return 0;
  if (alvoRecebeLetra(e.target)) return 0;
  return e.key === TECLAS_DO_MES.anterior ? -1 : 1;
}

/* ==========================================================================
 * 6. A CONTA DE OUTRO MÊS NA FILA DE CONTAS DE LUZ
 * ========================================================================== */

/** `09/2026` (a forma da fila e da folha) -> `2026-09`; `null` se não for mês. */
export function mesDaConta(mmAaaa: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{4})$/.exec(String(mmAaaa ?? '').trim());
  const mes = m ? `${m[2]}-${m[1]}` : null;
  return ehMes(mes) ? mes : null;
}

/**
 * AS CONTAS DA FILA QUE SÃO DE OUTRO MÊS, por mês — a mais numerosa primeiro.
 *
 * A FILA ACEITA CONTA DE QUALQUER MÊS, e isso não muda: o mês da conta vem da
 * própria conta (a distribuidora imprime), e é nele que ela é registrada,
 * qualquer que seja o mês de trabalho. O que muda é que a tela AVISA — quem
 * envia as contas de outubro olhando para a lista de setembro não vê as dela
 * aparecerem —, e oferece levar o mês de trabalho até elas.
 *
 * Recebe a competência de cada item como a fila a mostra (`MM/AAAA`); a ilegível
 * fica de fora (ela já tem a pendência própria, «Não consegui ler o mês»).
 */
export function contasDeOutroMes(
  competencias: ReadonlyArray<string | null | undefined>,
  mes: string | null,
): Array<{ mes: string; quantas: number }> {
  if (!ehMes(mes)) return [];
  const porMes = new Map<string, number>();
  for (const c of competencias) {
    const m = mesDaConta(c);
    if (m && m !== mes) porMes.set(m, (porMes.get(m) ?? 0) + 1);
  }
  return [...porMes].map(([m, quantas]) => ({ mes: m, quantas }))
    .sort((a, b) => b.quantas - a.quantas || b.mes.localeCompare(a.mes));
}

/* ==========================================================================
 * 7. A LEMBRANÇA — uma por navegador
 * ========================================================================== */

/**
 * A CHAVE DO MÊS LEMBRADO. O nome é o de 30/09 (`financeiro.emissao.mes`), de
 * propósito: quem escolheu um mês no seletor velho de Mês ou de Cobranças não
 * perde a escolha na troca. É conveniência de quem opera, e não dado do
 * sistema — outra pessoa, noutra máquina, abre no trabalho dela.
 */
export const CHAVE_DO_MES_LEMBRADO = 'financeiro.emissao.mes';

/**
 * LER E GUARDAR NUNCA DERRUBAM A TELA. `localStorage` levanta em janela privada
 * de alguns navegadores e com o armazenamento bloqueado; aí a tela só não
 * lembra. O armazém vem por parâmetro para a suíte poder passar um falso.
 */
export function lerMesLembrado(armazem: Pick<Storage, 'getItem'> | null | undefined): string | null {
  try {
    const v = armazem?.getItem(CHAVE_DO_MES_LEMBRADO) ?? null;
    return ehMes(v) ? v : null;
  } catch { return null; }
}

export function lembrarMes(armazem: Pick<Storage, 'setItem'> | null | undefined, mes: string): void {
  if (!ehMes(mes)) return;
  try { armazem?.setItem(CHAVE_DO_MES_LEMBRADO, mes); } catch { /* sem armazenamento, sem lembrança */ }
}

/** O armazenamento do navegador, ou nada. Acessar `localStorage` levanta em
 *  alguns navegadores com o armazenamento bloqueado. */
export function armazemDoNavegador(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** «Mês de trabalho: setembro de 2026» — o nome acessível do controle e o que
 *  a região viva anuncia quando o mês muda pelo teclado. */
export const nomeDoMesDeTrabalho = (mes: string | null): string =>
  mes ? `Mês de trabalho: ${mesPorExtenso(mes)}` : 'Mês de trabalho: procurando o mês com trabalho';
