// AS LEITURAS DO MÊS, feitas num lugar só — para a tela Mês e para a Central de
// Ajuda contarem o mesmo mês com os mesmos números.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU (30/09/2026, etapa 3 do redesenho)
//
// O estado do mês era narrado em três lugares com três frases diferentes: o
// roteiro («os cinco passos fecharam»), o vazio da tabela de conferências
// («Nada falta para este mês») e a ajuda («Nada pendente. Este mês pode ser
// cobrado»). A terceira era a mais perigosa — ela olhava SÓ o cadastro, e dizia
// «pode ser cobrado» num mês com cinco boletos recusados.
//
// A frase agora é uma só (`mesNoFunil(...).frase`), e para ela ser a mesma nos
// três lugares as LEITURAS também têm de ser: este gancho faz as cinco, e quem
// desenha recebe a `LeituraDoMes` pronta. Nenhuma rota nova no servidor — são
// as leituras que a tela Mês, Contas de luz e Cobranças já fazem.
//
// CADA LEITURA FALHA SOZINHA. Uma que não chegou vira `null` no campo dela, e o
// passo que dependia dela diz «não medido» — as outras quatro continuam valendo.

import { api, type Prontidao, type PosicaoDaCarteira, type Fatura, type RegistroDeFatura } from './api.ts';
import { useDados, type Carga } from './dados.ts';
import { competenciaISO } from './dinheiro.ts';
import { mesDeHojeEmSP } from './formato.ts';
import type { EmissaoTravadaNaTela } from './emissao-travada.ts';
import { LIMITE_DA_LISTA, listaParcial } from './registradas-regras.ts';
import type { LeituraDoMes } from './roteiro-do-mes.ts';
import { procurarMesComTrabalho, type EscolhaDoMes } from './emissao-regras.ts';

export type LeiturasDoMes = {
  prontidao: Carga<Prontidao>;
  carteira: Carga<PosicaoDaCarteira[]>;
  cobrancas: Carga<Fatura[]>;
  registradas: Carga<RegistroDeFatura[]>;
  /** DA CARTEIRA INTEIRA, e não do mês: não depende do seletor. */
  semBoleto: Carga<EmissaoTravadaNaTela>;
  /** Pronta quando a prontidão chegou — sem ela não há universo nem cadastro. */
  leitura: LeituraDoMes | null;
};

/**
 * `mes` é `'AAAA-MM'`, ou `null` enquanto a tela ainda PROCURA o mês com
 * trabalho (30/09/2026, etapa 4a). Com `null`, as três leituras do mês esperam
 * — não há mês para ler — e as duas que atravessam meses (contas registradas e
 * cobranças sem boleto) já saem: a segunda é justamente o que a procura lê.
 */
export function useLeiturasDoMes(mes: string | null): LeiturasDoMes {
  const comp = mes ? competenciaISO(mes) : null;
  /* Sem mês, a leitura devolve «nada» — e `leitura` abaixo continua `null`,
   * porque sem a prontidão não há universo nem cadastro. */
  const nada = <T,>(): Promise<T> => Promise.resolve(null as T);
  const prontidao = useDados<Prontidao>(
    () => (comp ? api.get(`/faturamento/${comp}/prontidao`) : nada()), [mes]);
  /* `/carteira` devolve uma LISTA; com o filtro ela volta com zero ou uma linha,
   * e zero é a resposta legítima do mês em que nada foi gerado. */
  const carteira = useDados<PosicaoDaCarteira[]>(
    () => (comp ? api.get(`/carteira?competencia=${comp}`) : nada()), [mes]);
  /* A MESMA LISTA da tela Cobranças, com o mesmo teto — o «5 a emitir» daqui é
   * o «Emitir 5 cobranças» de lá. */
  const cobrancas = useDados<Fatura[]>(() => (comp ? api.get(`/faturamento/${comp}`) : nada()), [mes]);
  /* A MESMA LISTA da tela Contas de luz, com o mesmo teto — o «6 a gerar» daqui
   * é o «Gerar 6 cobranças» de lá. Atravessa meses, e por isso não depende do
   * seletor: o recorte é feito em `mesNoFunil`. */
  const registradas = useDados<RegistroDeFatura[]>(
    () => api.get(`/faturas/unificada/registros?limite=${LIMITE_DA_LISTA}`));
  const semBoleto = useDados<EmissaoTravadaNaTela>(() => api.get('/emissao/travada'));

  const leitura: LeituraDoMes | null = mes && prontidao.dado ? {
    mes,
    camadas: prontidao.dado.camadas,
    posicao: carteira.dado ? (carteira.dado[0] ?? { vencidas_em_aberto: 0 }) : null,
    cobrancas: cobrancas.dado,
    registradas: registradas.dado ? { lista: registradas.dado, parcial: listaParcial(registradas.dado) } : null,
    semBoleto: semBoleto.dado,
  } : null;

  return { prontidao, carteira, cobrancas, registradas, semBoleto, leitura };
}

/** O mês de hoje EM SÃO PAULO (`toISOString` é UTC: na noite do último dia do
 *  mês, em Goiânia, já seria o mês seguinte). [30/09/2026, etapa 4b] Era o
 *  relógio do navegador; passou a ser o fuso de quem opera, por `formato.ts`. */
export function mesDeHoje(): string {
  return mesDeHojeEmSP();
}

/*
 * O MÊS QUE A TELA ESTÁ MOSTRANDO — `anunciarMesEmTela` e `mesQueATelaMostra`
 * SAÍRAM em 01/10/2026 (etapa 8). Eram uma variável de módulo em que Mês e
 * Cobranças avisavam o mês à vista, para a Central de Ajuda narrar o mesmo; a
 * ajuda aberta de outra tela refazia a procura. Com UM mês de trabalho para o
 * Rateio (`seletor-de-mes.tsx`), a ajuda lê a mesma fonte que as telas, e não
 * há o que anunciar.
 */

/* O armazém do navegador desceu para `mes-do-trabalho.ts` (etapa 8), com a
 * lembrança que o usa; segue exportado daqui para quem o lia deste lugar. */
export { armazemDoNavegador } from './mes-do-trabalho.ts';

/**
 * O MÊS MAIS RECENTE COM TRABALHO — a procura de `emissao-regras.ts` ligada à
 * API. Uma só para o sistema desde a etapa 8: quem a chama é a casca
 * (`seletor-de-mes.tsx`), e por ela as três telas do mês.
 *
 * `lembrado: null` DE PROPÓSITO: no mês de trabalho, a lembrança vem ANTES da
 * procura (`resolverMes`), e a procura responde só «onde está o trabalho» —
 * que é também o que o aviso de mês velho precisa saber.
 */
export function procurarMesDoTrabalho(
  travadas: ReadonlyArray<{ competencia: string }>,
): Promise<EscolhaDoMes> {
  return procurarMesComTrabalho({
    travadas,
    carteira: () => api.get<PosicaoDaCarteira[]>('/carteira'),
    cobrancasDoMes: (m) => api.get<Fatura[]>(`/faturamento/${competenciaISO(m)}`),
    registradas: () => api.get<RegistroDeFatura[]>(`/faturas/unificada/registros?limite=${LIMITE_DA_LISTA}`),
    lembrado: null,
    hoje: mesDeHoje(),
  });
}

/** A procura inteira, a partir do nada: lê as cobranças sem boleto e procura.
 *  É o que a casca chama — sob demanda, para este arquivo e a regra da
 *  emissão não entrarem no pedaço de entrada. */
export async function procurarDoZero(): Promise<EscolhaDoMes> {
  let travadas: ReadonlyArray<{ competencia: string }> = [];
  try { travadas = (await api.get<EmissaoTravadaNaTela>('/emissao/travada')).linhas ?? []; } catch { /* sem a lista do banco */ }
  return procurarMesDoTrabalho(travadas);
}
