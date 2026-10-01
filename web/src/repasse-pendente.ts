// DINHEIRO RECEBIDO QUE AINDA NÃO FOI REPARTIDO — as regras, sem JSX.
//
// POR QUE ESTE ARQUIVO NASCEU EM 08/09/2026. Até esta data a fila de liquidações
// sem repasse tinha um morador só — usina sem dono (R12) — e nenhuma tela: era
// uma rota de relatório que só respondia a `curl`. Enquanto ela tinha um morador
// e zero linhas, isso passava.
//
// No mesmo dia o repasse deixou de rodar no aviso do banco e passou a esperar a
// confirmação (`Q-BAIXAOPER-01`), e a fila ganhou o segundo morador: **toda**
// baixa por webhook entra aqui até o banco confirmar. Uma fila onde o dinheiro
// espera, sem tela, é dinheiro parado que ninguém vê.
//
// A DISTINÇÃO QUE ESTE ARQUIVO EXISTE PARA FAZER, e ela governa a tela inteira:
// as duas esperas parecem iguais na tabela e são opostas para quem opera.
//
//   sem dono            é TRABALHO DE ALGUÉM. Falta cadastro, e o dinheiro fica
//                       parado até alguém agir;
//   aguardando o banco   NÃO é trabalho de ninguém. A conferência diária resolve
//                       sozinha, e oferecer um botão de "repartir agora" ali
//                       seria oferecer repartir sobre uma intenção de pagamento —
//                       exatamente o que a espera existe para impedir.
//
// Por isso `podeRepartirAgora` é falso para a segunda, e não por prudência: o
// botão que não existe é a regra.

export type OrigemDaBaixa = 'webhook_sicoob' | 'conciliacao' | 'manual';

export type RepassePendente = {
  liquidacao_id: string;
  data_liquidacao: string;
  valor_liquidado_centavos: number;
  competencia: string;
  codigo_geradora: string;
  usina_sem_dono: boolean;
  origem: OrigemDaBaixa;
};

export type MotivoDaEspera = 'sem_dono' | 'aguardando_banco' | 'pronto';

/**
 * SEM DONO VENCE, e a precedência não é estética. Uma baixa por webhook numa
 * usina sem dono espera as duas coisas — e mesmo depois de o banco confirmar ela
 * continuaria parada, porque não há a quem pagar. Mostrar "aguardando o banco"
 * nesse caso mandaria a pessoa esperar por algo que não destrava nada.
 */
export function motivoDaEspera(l: RepassePendente): MotivoDaEspera {
  if (l.usina_sem_dono) return 'sem_dono';
  if (l.origem === 'webhook_sicoob') return 'aguardando_banco';
  return 'pronto';
}

export const ROTULO_DO_MOTIVO: Record<MotivoDaEspera, string> = {
  sem_dono: 'Falta o dono da usina',
  aguardando_banco: 'Aguardando o banco confirmar',
  pronto: 'Pronto para repartir',
};

/**
 * O RÓTULO CURTO, o da linha. [30/09/2026, etapa 4a] A explicação de três
 * linhas se repetia em cada uma das dezesseis linhas da tabela; agora ela é dita
 * uma vez, no cabeçalho do grupo, e a linha fica com o estado curto e a ação.
 */
export const ROTULO_CURTO_DO_MOTIVO: Record<MotivoDaEspera, string> = {
  sem_dono: 'Sem dono',
  aguardando_banco: 'Aguardando o banco',
  pronto: 'Pronto',
};

/**
 * A EXPLICAÇÃO, uma por grupo.
 *
 * [30/09/2026, etapa 4a] A DE `sem_dono` ESTAVA INCOMPLETA: mandava «cadastre o
 * dono na tela de Usinas», e na tela de Usinas não se cadastra dono — ali ele
 * só se ESCOLHE numa lista. O caminho real tem dois passos, em duas telas, e a
 * frase agora nomeia os dois; os links saem de `COMO_DESTRAVAR`, logo abaixo.
 */
export const EXPLICACAO_DO_MOTIVO: Record<MotivoDaEspera, string> = {
  sem_dono:
    'O cliente pagou e o valor está guardado, mas a usina que gerou essa energia não tem dono '
    + 'cadastrado — não há para quem transferir. Depois dos dois passos abaixo, volte aqui para '
    + 'repartir.',
  aguardando_banco:
    'O banco avisou que o pagamento foi feito, e esse aviso ainda não é a confirmação de que o '
    + 'dinheiro entrou de vez. O sistema pergunta ao banco todo dia e reparte sozinho assim que '
    + 'ele confirmar. Não há nada a fazer aqui.',
  pronto:
    'O pagamento está confirmado e o repasse pode ser feito agora.',
};

/** Um passo do caminho que destrava a espera, com a tela onde ele se faz. */
export type PassoParaDestravar = { ato: string; destino: { rotulo: string; endereco: string } };

/**
 * O CAMINHO QUE DESTRAVA, passo a passo e com o endereço de cada um — só para a
 * espera que é trabalho de alguém. Os rótulos são os do menu, letra por letra, e
 * a suíte prende que as duas rotas existem.
 *
 * O DONO VEM PRIMEIRO porque a lista de Usinas só oferece quem já existe: tentar
 * vincular antes de cadastrar é abrir um `<select>` sem a pessoa certa nele.
 */
export const COMO_DESTRAVAR: Partial<Record<MotivoDaEspera, readonly PassoParaDestravar[]>> = {
  sem_dono: [
    { ato: 'Cadastre o dono', destino: { rotulo: 'Donos de usina', endereco: '/donos' } },
    { ato: 'Vincule o dono à usina', destino: { rotulo: 'Usinas', endereco: '/usinas?pendencia=sem_dono' } },
  ],
};

/** A ordem dos grupos na tela: quem exige ação primeiro — a mesma de `PESO`. */
export const ORDEM_DOS_MOTIVOS: readonly MotivoDaEspera[] = ['pronto', 'sem_dono', 'aguardando_banco'];

/** O botão só existe onde clicar resolve. Ver o cabeçalho: em
 *  `aguardando_banco` a ausência do botão É a regra. */
export function podeRepartirAgora(l: RepassePendente): boolean {
  return motivoDaEspera(l) === 'pronto';
}

export function totalCentavos(ls: readonly RepassePendente[]): number {
  return ls.reduce((a, l) => a + l.valor_liquidado_centavos, 0);
}

export function contarPorMotivo(ls: readonly RepassePendente[]): Record<MotivoDaEspera, number> {
  const c: Record<MotivoDaEspera, number> = { sem_dono: 0, aguardando_banco: 0, pronto: 0 };
  for (const l of ls) c[motivoDaEspera(l)] += 1;
  return c;
}

/** Quem exige ação vem primeiro, e dentro de cada grupo o dinheiro que espera há
 *  mais tempo. Ordenar por data sozinha misturaria o que alguém precisa resolver
 *  com o que o sistema resolve amanhã. */
const PESO: Record<MotivoDaEspera, number> = { pronto: 0, sem_dono: 1, aguardando_banco: 2 };

export function ordenarPelaEspera(ls: readonly RepassePendente[]): RepassePendente[] {
  return [...ls].sort((a, b) => {
    const p = PESO[motivoDaEspera(a)] - PESO[motivoDaEspera(b)];
    return p !== 0 ? p : String(a.data_liquidacao).localeCompare(String(b.data_liquidacao));
  });
}

/** A frase do cartão quando há espera. Some quando a lista está vazia — e vazia
 *  é o estado normal, não uma ausência a explicar. */
export function resumoDaEspera(ls: readonly RepassePendente[]): string {
  const c = contarPorMotivo(ls);
  const partes: string[] = [];
  if (c.pronto) partes.push(`${c.pronto} ${c.pronto === 1 ? 'pronto' : 'prontos'} para repartir`);
  if (c.sem_dono) partes.push(`${c.sem_dono} esperando o cadastro do dono da usina`);
  if (c.aguardando_banco) partes.push(`${c.aguardando_banco} aguardando o banco confirmar`);
  /* Com «e» e vírgula, e não «·», desde 30/09/2026 (etapa 4a): é uma frase. */
  return partes.length <= 1 ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/* ==========================================================================
 * UMA LINHA POR USINA (01/10/2026, etapa 7c)
 * ==========================================================================
 *
 * A LINHA ERA O PAGAMENTO, e o trabalho é a USINA. Com 16 pagamentos de duas
 * usinas sem dono, a tabela tinha 16 linhas «Sem dono · Vincular em Usinas» —
 * o mesmo ato, oferecido 16 vezes, para destravar duas coisas. No celular
 * eram 16 cartões, milhares de pixels antes da lista do que pagar. Agora cada
 * usina é uma linha, com quantos pagamentos esperam, de quando a quando, a soma
 * e o ato UMA vez; os pagamentos ficam num expansor da linha, para quem quer
 * conferir um a um.
 *
 * A CHAVE É MOTIVO + USINA, e não só a usina: o motivo «sem dono» é da usina
 * (todos os pagamentos dela esperam juntos), mas «aguardando o banco» e
 * «pronto» são de cada pagamento — uma usina com dono pode ter um de cada, e
 * aí ela aparece nos dois grupos, porque os dois pedem coisas diferentes.
 */
export type UsinaQueEspera = {
  codigo_geradora: string;
  motivo: MotivoDaEspera;
  /** Do mais antigo ao mais recente — a ordem em que o dinheiro entrou. */
  pagamentos: RepassePendente[];
  totalCentavos: number;
  /** A data do primeiro e do último pagamento que esperam. */
  desde: string;
  ate: string;
  /** Os meses de referência, sem repetir, do mais antigo ao mais recente. */
  meses: string[];
};

export function agruparPorUsina(ls: readonly RepassePendente[]): UsinaQueEspera[] {
  const grupos = new Map<string, RepassePendente[]>();
  for (const l of ls) {
    const chave = `${motivoDaEspera(l)}|${l.codigo_geradora}`;
    const g = grupos.get(chave);
    if (g) g.push(l); else grupos.set(chave, [l]);
  }
  return [...grupos.values()]
    .map((g) => {
      const pagamentos = [...g].sort((a, b) => String(a.data_liquidacao).localeCompare(String(b.data_liquidacao)));
      return {
        codigo_geradora: pagamentos[0]!.codigo_geradora,
        motivo: motivoDaEspera(pagamentos[0]!),
        pagamentos,
        totalCentavos: totalCentavos(pagamentos),
        desde: pagamentos[0]!.data_liquidacao,
        ate: pagamentos[pagamentos.length - 1]!.data_liquidacao,
        meses: [...new Set(pagamentos.map((p) => String(p.competencia).slice(0, 7)))].sort(),
      };
    })
    /* Quem exige ação primeiro (`PESO`), e dentro do mesmo motivo a usina com
       o dinheiro parado há mais tempo. */
    .sort((a, b) => (PESO[a.motivo] - PESO[b.motivo]) || a.desde.localeCompare(b.desde)
      || a.codigo_geradora.localeCompare(b.codigo_geradora));
}
