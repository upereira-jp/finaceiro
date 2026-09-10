// O VÍNCULO COM O OUTRO SISTEMA, em frases. Puro, sem JSX, com suíte própria.
//
// ============================================================================
// O QUE ESTA TELA RESOLVE, e ela nasceu de uma medição
//
// Quando um contrato de rateio muda de unidade no outro sistema, o sistema aqui
// **recusa** copiar a mudança — das duas leituras uma está errada, e escolher
// seria palpite. A recusa está certa: mover o vínculo sozinho pagaria comissão e
// repasse na unidade errada.
//
// O que faltava era a saída. Quem opera sabe qual das duas leituras vale — essa
// informação é externa, vem de quem cuida do cadastro — e não tinha onde dizer
// isso. A única saída era um comando de terminal.
//
// ⚠️ E O PREÇO FOI MEDIDO: em 10/09/2026 havia uma unidade recusada **desde o dia
// 4**, uma vez a cada 15 minutos, 519 vezes. Seis dias fora do espelho — e o que
// fica fora do espelho fica fora do faturamento.
//
// ============================================================================
// AS FRASES NÃO PODEM PARECER UM BOTÃO DE "CONSERTAR"
//
// O que o botão faz é ESTREITO: apaga o vínculo velho desta unidade. Ele não
// escreve o vínculo novo, não move cliente e não move usina — quem faz isso é a
// leitura automática, no próximo ciclo. Uma frase que prometesse "corrigir o
// cadastro" faria alguém clicar esperando outra coisa, e o que acontece depois
// (a unidade some da recusa e reaparece já vinculada) pareceria efeito colateral
// em vez de o desenho.
//
// Por isso cada estado diz TRÊS coisas: o que está acontecendo, o que o clique
// faz, e o que o sistema faz sozinho depois.

/** O espelho de `LinhaDoRateio` do servidor. */
export type LinhaDoRateio = {
  uc: string;
  contrato_id: string;
  lead_codigo: string;
  cliente: string;
};

export type DecisaoNaTela =
  | { pode: true; contratoASoltar: string; ucQueVaiNascer: string; contratoQueVaiEntrar: string }
  | { pode: false; guarda: 1 | 2 | 3 | 4; motivo: string };

export type VinculoNaTela = {
  numero_uc: string;
  cliente: string;
  contrato_no_espelho: string | null;
  crm_por_contrato: LinhaDoRateio | null;
  crm_por_uc: LinhaDoRateio | null;
  uc_presa_ao_substituto: string | null;
  decisao: DecisaoNaTela;
};

export type FraseDoVinculo = {
  /** «Esta unidade está travada» · «Nada a destravar aqui» */
  titulo: string;
  /** O que está acontecendo, em português de operação. */
  corpo: string;
  /** O que o clique faz, e o que acontece depois dele. Vazio quando não há
   *  clique a fazer — e aí o botão também não é desenhado. */
  oQueOBotaoFaz: string;
  /** `true` só quando o servidor aceita destravar. A tela não decide isto: ela
   *  repete o que as quatro guardas responderam. */
  podeDestravar: boolean;
  /** `true` quando esta unidade está travando a leitura automática — é o que
   *  merece atenção, e é diferente de «não há nada a fazer». */
  travada: boolean;
};

/**
 * AS QUATRO GUARDAS, TRADUZIDAS — e a tradução é a razão deste arquivo existir.
 *
 * O servidor devolve o motivo técnico inteiro («o contrato X nao esta mais em
 * financeiro.rateio_clientes»), que é a frase certa para quem lê o registro e a
 * frase errada para quem abriu a tela. Cada guarda vira aqui uma frase que diz o
 * que aconteceu no vocabulário de quem cuida do cadastro.
 *
 * ⚠️ O MOTIVO ORIGINAL NÃO SE PERDE: a tela o guarda atrás do «ver detalhe
 * técnico», que é o único lugar suportado para nome de coluna e identificador.
 */
const GUARDA: Record<1 | 2 | 3 | 4, { titulo: string; corpo: (v: VinculoNaTela) => string }> = {
  1: {
    titulo: 'Esta unidade não está presa a nenhum contrato do outro sistema.',
    corpo: () =>
      'Não há vínculo velho para soltar. Se a leitura automática está recusando alguma coisa '
      + 'nesta unidade, é por outro motivo — o aviso em Pendências diz qual.',
  },
  2: {
    titulo: 'Não há troca a destravar.',
    corpo: (v) =>
      v.crm_por_contrato === null
        ? 'O contrato que esta unidade carrega não aparece mais no outro sistema. Isso não é '
          + 'troca de unidade: é contrato que sumiu de lá, e a decisão é outra — quem cuida do '
          + 'cadastro precisa dizer o que aconteceu com ele.'
        : 'No outro sistema, o contrato desta unidade continua sendo o mesmo. Apagar o vínculo '
          + 'aqui só faria a leitura automática escrevê-lo de volta igual no próximo ciclo.',
  },
  3: {
    titulo: 'Falta o contrato que entra no lugar.',
    /*
     * ⚠️ ESTA FRASE TEM DUAS VERSÕES, e a segunda nasceu de uma medição contra a
     * produção em 10/09/2026. O caso real que estava travado há seis dias caiu
     * aqui, e a frase genérica («falta o contrato novo lá») mandava esperar por
     * uma coisa que já tinha acontecido: o contrato existe, está com o MESMO
     * cliente, e o que mudou foi o NÚMERO da unidade.
     *
     * Quando o contrato desta unidade aparece servindo OUTRA unidade lá, e
     * nenhum contrato serve esta aqui, o retrato é quase sempre esse — número
     * corrigido do outro lado. Dizer isso muda o próximo passo de «esperar» para
     * «conferir se é a mesma unidade com número novo», que é uma pergunta que
     * quem cuida do cadastro responde em um minuto.
     */
    corpo: (v) =>
      v.crm_por_contrato
        ? `No outro sistema, o contrato desta unidade passou a servir a unidade `
          + `${v.crm_por_contrato.uc} (${v.crm_por_contrato.cliente}), e nenhum contrato serve `
          + 'esta aqui. O retrato mais comum disso é o número da unidade ter sido corrigido lá: '
          + 'confira se é a mesma unidade com número novo. Soltar o vínculo agora deixaria esta '
          + 'linha órfã — no próximo ciclo não haveria nada para gravar nela.'
        : 'No outro sistema, nenhum contrato serve esta unidade hoje. Soltar o vínculo agora '
          + 'deixaria a unidade órfã: no próximo ciclo não haveria nada para gravar no lugar. '
          + 'Primeiro o contrato novo precisa existir lá.',
  },
  4: {
    titulo: 'Há um segundo conflito atrás deste.',
    corpo: (v) =>
      `O contrato que entraria já está preso à unidade ${v.uc_presa_ao_substituto ?? 'outra'} `
      + 'aqui dentro. Soltar um vínculo agora só trocaria uma recusa por outra — com uma '
      + 'escrita no meio. As duas unidades precisam ser resolvidas juntas, e a de cima é a outra.',
  },
};

export function fraseDoVinculo(v: VinculoNaTela): FraseDoVinculo {
  if (v.decisao.pode) {
    const d = v.decisao;
    return {
      titulo: 'Esta unidade está travada por uma troca de contrato.',
      corpo:
        `No outro sistema o contrato desta unidade passou a servir a unidade ${d.ucQueVaiNascer}, `
        + `e esta unidade passou a ser servida por outro contrato (${v.crm_por_uc?.cliente ?? 'sem nome'}`
        + `${v.crm_por_uc?.lead_codigo ? `, ${v.crm_por_uc.lead_codigo}` : ''}). `
        + 'Enquanto os dois não forem separados, a leitura automática recusa esta unidade a cada '
        + '15 minutos — e o que fica de fora do espelho fica de fora do faturamento.',
      oQueOBotaoFaz:
        'O botão faz uma coisa só: solta o vínculo velho desta unidade. Ele não escreve o vínculo '
        + 'novo e não mexe em cliente, usina nem percentual — quem faz isso é a leitura automática, '
        + `no próximo ciclo (até 15 minutos), que também vai criar a unidade ${d.ucQueVaiNascer}. `
        + 'Depois disso a recusa desaparece porque o empate deixou de existir.',
      podeDestravar: true,
      travada: true,
    };
  }

  const g = GUARDA[v.decisao.guarda];
  return {
    titulo: g.titulo,
    corpo: g.corpo(v),
    oQueOBotaoFaz: '',
    podeDestravar: false,
    /* A guarda 4 É travamento: há conflito, e ele continua recusando a cada
     * ciclo. As outras três são "não há o que fazer aqui" — e chamar as duas
     * coisas de travado faria a tela pedir atenção onde não há nada a decidir. */
    travada: v.decisao.guarda === 4,
  };
}

/** «solto» · «000000100076075» — o que a linha mostra sem abrir o painel. */
export function resumoDoVinculo(v: VinculoNaTela): string {
  if (!v.contrato_no_espelho) return 'sem vínculo';
  return v.decisao.pode || (!v.decisao.pode && v.decisao.guarda === 4) ? 'travado' : 'vinculado';
}
