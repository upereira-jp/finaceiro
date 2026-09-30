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
import type { EmissaoTravadaNaTela } from './emissao-travada.ts';
import { LIMITE_DA_LISTA, listaParcial } from './registradas-regras.ts';
import type { LeituraDoMes } from './roteiro-do-mes.ts';

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

/** `mes` é `'AAAA-MM'`. */
export function useLeiturasDoMes(mes: string): LeiturasDoMes {
  const comp = competenciaISO(mes);
  const prontidao = useDados<Prontidao>(() => api.get(`/faturamento/${comp}/prontidao`), [mes]);
  /* `/carteira` devolve uma LISTA; com o filtro ela volta com zero ou uma linha,
   * e zero é a resposta legítima do mês em que nada foi gerado. */
  const carteira = useDados<PosicaoDaCarteira[]>(() => api.get(`/carteira?competencia=${comp}`), [mes]);
  /* A MESMA LISTA da tela Cobranças, com o mesmo teto — o «5 a emitir» daqui é
   * o «Emitir 5 cobranças» de lá. */
  const cobrancas = useDados<Fatura[]>(() => api.get(`/faturamento/${comp}`), [mes]);
  /* A MESMA LISTA da tela Contas de luz, com o mesmo teto — o «6 a gerar» daqui
   * é o «Gerar 6 cobranças» de lá. Atravessa meses, e por isso não depende do
   * seletor: o recorte é feito em `mesNoFunil`. */
  const registradas = useDados<RegistroDeFatura[]>(
    () => api.get(`/faturas/unificada/registros?limite=${LIMITE_DA_LISTA}`));
  const semBoleto = useDados<EmissaoTravadaNaTela>(() => api.get('/emissao/travada'));

  const leitura: LeituraDoMes | null = prontidao.dado ? {
    mes,
    camadas: prontidao.dado.camadas,
    posicao: carteira.dado ? (carteira.dado[0] ?? { vencidas_em_aberto: 0 }) : null,
    cobrancas: cobrancas.dado,
    registradas: registradas.dado ? { lista: registradas.dado, parcial: listaParcial(registradas.dado) } : null,
    semBoleto: semBoleto.dado,
  } : null;

  return { prontidao, carteira, cobrancas, registradas, semBoleto, leitura };
}
