// AS LEITURAS DO PAINEL DE SAÚDE, e o painel pronto para montar numa tela (03/10/2026).
//
// Quatro leituras, cada uma com `useDados` próprio — a lenta (o aviso de
// pagamento disca a Sicoob) não segura as outras, e cada uma falha sozinha:
//
//   /automacoes                          as três rodadas automáticas
//   /conector-cobranca/certificado       a validade do certificado do banco
//   /conector-cobranca/aviso-pagamento   o aviso de pagamento, perguntado AO BANCO
//   /conector-cobranca/avisos-ignorados  os pagamentos avisados que não entraram
//
// As duas do meio moravam em `telas/prontidao.tsx` desde 09/09; vieram para cá
// para o Mês e o Painel da empresa lerem do mesmo lugar. O Mês usa as MESMAS
// cargas para as faixas do alto e para o painel — duas chamadas dariam duas
// respostas possíveis para a mesma pergunta na mesma tela.

import { api, ErroDaApi, type Automacao } from './api.ts';
import { useDados, type Carga } from './dados.ts';
import type { NivelDoAviso } from './saude-do-dinheiro.ts';
import type { AvisosIgnoradosNaTela, LeituraDaSaude } from './painel-de-saude.ts';
import { CorpoDoPainelDeSaude } from './painel-de-saude-corpo.tsx';

export type CertificadoNaTela = { dias: number | null; expira_em: string | null } | null;

/**
 * NENHUM ERRO SOBE: a Sicoob fora do ar não pode derrubar a primeira tela do
 * sistema. O 412 («não há conector») e a falha de leitura caem no mesmo `null`,
 * e `null` não gera faixa — o que esta tela não pode é inventar alarme sobre um
 * banco que ninguém ligou. (Texto original em `telas/prontidao.tsx`, 09/09/2026.)
 */
const certificadoOuNada = async (): Promise<CertificadoNaTela> => {
  try {
    return await api.get<{ dias: number | null; expira_em: string | null }>('/conector-cobranca/certificado');
  } catch (e) {
    void (e instanceof ErroDaApi);
    return null;
  }
};

/** `sem_conector` vem do servidor como campo próprio. Falha de leitura vira
 *  `sem_conector: false` + `nao_verificavel`: a tela PERGUNTOU e não soube.
 *
 *  O 403 É OUTRA COISA (03/10/2026). Perguntar ao banco exige `escrever_carteira`,
 *  que o papel `leitura` não tem; até aqui o 403 caía no mesmo `catch` da rede
 *  caída, e o Mês mostrava a quem só lê a faixa «Não deu para perguntar ao banco»
 *  — um alarme sobre o banco que era, na verdade, o papel da pessoa. Agora ele
 *  vem marcado (`sem_permissao`): sem faixa, e o painel diz por quê. */
export type LeituraDoAviso = { sem_conector: boolean; nivel: NivelDoAviso; sem_permissao?: true };

const avisoOuNaoVerificavel = async (): Promise<LeituraDoAviso> => {
  try {
    return await api.get<LeituraDoAviso>('/conector-cobranca/aviso-pagamento');
  } catch (e) {
    if (e instanceof ErroDaApi && e.status === 403) {
      return { sem_conector: false, nivel: 'nao_verificavel', sem_permissao: true };
    }
    return { sem_conector: false, nivel: 'nao_verificavel' };
  }
};

export type CargasDaSaude = {
  certificado: Carga<CertificadoNaTela>;
  aviso: Carga<LeituraDoAviso>;
  automacoes: Carga<Automacao[]>;
  ignorados: Carga<AvisosIgnoradosNaTela>;
};

export function useSaudeDoSistema(): CargasDaSaude {
  return {
    certificado: useDados<CertificadoNaTela>(certificadoOuNada),
    aviso: useDados<LeituraDoAviso>(avisoOuNaoVerificavel),
    automacoes: useDados<Automacao[]>(() => api.get('/automacoes')),
    ignorados: useDados<AvisosIgnoradosNaTela>(() => api.get('/conector-cobranca/avisos-ignorados')),
  };
}

/** As cargas como o painel as lê: `null`/`undefined` é «ainda lendo». */
export function leituraDaSaude(c: CargasDaSaude): LeituraDaSaude {
  return {
    rodadas: c.automacoes.dado,
    erroDasRodadas: c.automacoes.erro,
    semConector: c.aviso.dado ? c.aviso.dado.sem_conector : null,
    diasDoCertificado: c.certificado.carregando ? undefined : (c.certificado.dado?.dias ?? null),
    aviso: c.aviso.dado ? c.aviso.dado.nivel : null,
    avisoSemPermissao: c.aviso.dado?.sem_permissao === true,
    ignorados: c.ignorados.dado,
    erroDosIgnorados: c.ignorados.erro !== null,
  };
}

/** O painel com as próprias leituras — para a tela que não tem faixas a dividir com ele. */
export function PainelDeSaude() {
  const cargas = useSaudeDoSistema();
  return <CorpoDoPainelDeSaude leitura={leituraDaSaude(cargas)} />;
}
