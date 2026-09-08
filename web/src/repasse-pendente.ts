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

export const EXPLICACAO_DO_MOTIVO: Record<MotivoDaEspera, string> = {
  sem_dono:
    'O cliente pagou e o valor está guardado, mas a usina que gerou essa energia não tem dono '
    + 'cadastrado — não há para quem transferir. Cadastre o dono na tela de Usinas e volte aqui.',
  aguardando_banco:
    'O banco avisou que o pagamento foi feito, e esse aviso ainda não é a confirmação de que o '
    + 'dinheiro entrou de vez. O sistema pergunta ao banco todo dia e reparte sozinho assim que '
    + 'ele confirmar. Não há nada a fazer aqui.',
  pronto:
    'O pagamento está confirmado e o repasse pode ser feito agora.',
};

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
  if (c.pronto) partes.push(`${c.pronto} pronto(s) para repartir`);
  if (c.sem_dono) partes.push(`${c.sem_dono} esperando o cadastro do dono da usina`);
  if (c.aguardando_banco) partes.push(`${c.aguardando_banco} aguardando o banco confirmar`);
  return partes.join(' · ');
}
