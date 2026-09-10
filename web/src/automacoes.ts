// O SISTEMA AINDA ESTÁ TRABALHANDO SOZINHO? — puro, sem JSX, com suíte própria.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE, e ele é o irmão invertido do `saude-do-dinheiro`
//
// Aquele alarma sobre o que quebra ENQUANTO o sistema trabalha: o certificado do
// banco e o aviso de pagamento. Este alarma sobre o sistema ter **parado de
// trabalhar** — o serviço desligado por engano, a máquina que reiniciou sem ele,
// a rodada que morreu no meio e deixou a próxima trancada.
//
// ⚠️ E A REGRA DE EXIBIÇÃO É O CONTRÁRIO DA DE LÁ, de propósito.
//
// Em `saude-do-dinheiro.ts` o silêncio é a resposta boa: com tudo de pé,
// `faixasDaSaude` devolve vazio, e a tela não ganha um verde a mais para
// conferir todo dia. **Aqui o silêncio é o próprio defeito.** "Nenhum alerta" é,
// letra por letra, a mesma cara de "o alarme também parou" — e a coisa que se
// quer perceber é justamente uma AUSÊNCIA: a rodada que não aconteceu não
// produz erro, não produz linha e não produz alerta nenhum.
//
// Por isso este arquivo produz DUAS coisas, e não uma:
//
//   `faixasDasAutomacoes`   o alarme, quando há o que gritar. Como a vizinha;
//   `linhasDasAutomacoes`   a AFIRMAÇÃO, que aparece mesmo com tudo em dia —
//                           "rodou hoje às 06:17, baixou 3". É ela que faz a
//                           diferença entre um sistema vivo e um sistema parado
//                           ser visível sem ninguém abrir terminal.
//
// É a mesma escolha da unidade `financeiro-saude-cobranca`, que AFIRMA em vez de
// calar — e pelo mesmo motivo escrito lá: quando o trabalho de uma coisa é
// dizer que está tudo de pé, ela pode ficar vermelha sem mentir.
//
// AS FRASES SÃO DE OPERAÇÃO E NÃO DE INFRAESTRUTURA. Quem lê não sabe o que é
// timer, não sabe o que é serviço e não precisa saber: precisa saber que boleto
// pago pode estar aparecendo em aberto, e que o dinheiro não sumiu. O comando de
// terminal existe — mas dentro do `<DetalheTecnico>`, que é o único lugar
// suportado para ele (`web/tests/vocabulario-das-telas.ts`).
//
// E É PURO PELO MOTIVO DE SEMPRE (regra 8): o runner do `web/` não lê JSX, então
// regra dentro de `.tsx` não tem como ser verificada.

/** O espelho de `NivelDaRodada` do servidor (`src/dominio/agenda.ts`). Os seis
 *  chegam inteiros até aqui — colapsar `sem_conector` em `nunca_rodou` na borda
 *  seria a tela acusando de parada uma automação que ninguém ligou. */
export type NivelDaRodada =
  | 'em_dia' | 'terminou_mal' | 'atrasada' | 'travada' | 'nunca_rodou' | 'sem_conector';

export type ChaveDaAutomacao = 'consulta_ativa' | 'fila_de_emissao' | 'ciclo_do_crm';

export type RodadaNaTela = {
  chave: ChaveDaAutomacao;
  nivel: NivelDaRodada;
  intervalo_segundos: number;
  ultima: {
    iniciado_em: string;
    status: string;
    examinados: number;
    feitos: number;
    falhos: number;
  } | null;
  /** Contado NO SERVIDOR: "há 4 dias" é afirmação sobre o sistema, e não pode
   *  depender do relógio da máquina de quem abriu a tela. */
  ha_quanto_tempo_segundos: number | null;
};

/* ==========================================================================
 * O QUE CADA UMA É, PARA QUEM OPERA
 * ==========================================================================
 *
 * `nome` é sujeito de frase ("a conferência de pagamentos no banco não roda
 * desde ontem"), e por isso vem em minúscula e com artigo. `consequencia` é a
 * parte que impede o pânico e que impede a indiferença ao mesmo tempo: ela diz
 * o que ACONTECE com o dinheiro enquanto aquilo está parado, sem prometer que
 * está tudo bem e sem sugerir que sumiu.
 */
const AUTOMACAO: Record<ChaveDaAutomacao, {
  nome: string;
  /** Maiúscula inicial, para começar frase. */
  Nome: string;
  consequencia: string;
  /** O que quem administra o servidor confere. Fica atrás do `<DetalheTecnico>`. */
  comando: string;
}> = {
  consulta_ativa: {
    nome: 'a conferência de pagamentos no banco',
    Nome: 'A conferência de pagamentos no banco',
    consequencia:
      'É ela que percebe sozinha quem pagou. Parada, um boleto já pago continua aparecendo em '
      + 'aberto aqui, e a cobrança acaba acusando quem não deve nada. O dinheiro não se perde — '
      + 'ele está na conta —, mas a baixa precisa ser dada à mão na aba Faturas até a rodada voltar.',
    comando: 'systemctl status financeiro-agenda-consulta.timer',
  },
  fila_de_emissao: {
    nome: 'o envio de boletos ao banco',
    Nome: 'O envio de boletos ao banco',
    consequencia:
      'É por ele que a fatura emitida vira boleto no banco. Parado, o cliente não recebe nada '
      + 'para pagar: as faturas ficam esperando na fila. Nada se perde e nada é cobrado em '
      + 'dobro quando voltar — mas enquanto isso nenhuma cobrança nova sai.',
    comando: 'systemctl status financeiro-agenda-fila.timer',
  },
  ciclo_do_crm: {
    nome: 'a leitura do outro sistema',
    Nome: 'A leitura do outro sistema',
    consequencia:
      'É por ela que cliente, unidade e contrato novos chegam aqui. Parada, o cadastro daqui '
      + 'envelhece — o que foi criado ou alterado do outro lado não aparece nestas telas. Não '
      + 'mexe no que já foi cobrado.',
    comando: 'systemctl status financeiro-ciclo.timer',
  },
};

/**
 * "há 4 minutos", "há 3 horas", "há 2 dias".
 *
 * A ESCALA MUDA COM O TAMANHO porque a precisão que interessa muda junto: numa
 * automação de 5 em 5 minutos, "há 7 minutos" é a informação; numa diária,
 * "há 30 horas" faz o leitor dividir de cabeça, e "há 1 dia" é o que ele quer
 * saber. Abaixo de 90 segundos não há número nenhum: "agora há pouco" é mais
 * honesto que "há 1 minuto" quando o relógio arredonda.
 *
 * ⚠️ A PRIMEIRA VERSÃO DESTA FUNÇÃO DIZIA UMA COISA NO COMENTÁRIO E FAZIA OUTRA:
 * o texto acima prometia dias a partir de um dia, e o código só trocava de
 * escala em 36 horas — então "há 30 horas", o exemplo que o próprio comentário
 * dá como ruim, era o que ela produzia. Quem pegou foi `AU-9`, e é a razão de a
 * escala ser medida em vez de descrita.
 */
export function faz(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 90) return 'agora há pouco';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} minutos`;
  const h = Math.round(s / 3600);
  if (h < 24) return h === 1 ? 'há 1 hora' : `há ${h} horas`;
  const d = Math.round(s / 86_400);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

/** "a cada 5 minutos" / "a cada 15 minutos" / "uma vez por dia". Sai da cadência
 *  que o servidor manda, e não de um número repetido aqui: o dia em que o
 *  intervalo mudar, a frase muda junto. */
export function cadencia(intervaloSegundos: number): string {
  if (intervaloSegundos >= 86_400) return 'uma vez por dia';
  if (intervaloSegundos >= 3_600) {
    const h = Math.round(intervaloSegundos / 3_600);
    return h === 1 ? 'a cada hora' : `a cada ${h} horas`;
  }
  return `a cada ${Math.max(1, Math.round(intervaloSegundos / 60))} minutos`;
}

/**
 * O QUE A RODADA FEZ, em números que significam alguma coisa para quem lê.
 *
 * ⚠️ ZERO É UM FATO E ELE É DITO. "Não havia nada a fazer" e "não rodou" são
 * historias opostas com a mesma cara quando a tela cala — e essa confusão é o
 * arquivo inteiro. A rodada que examinou zero boletos APARECE, dizendo que
 * examinou zero.
 */
export function oQueFez(r: RodadaNaTela): string {
  const u = r.ultima;
  if (!u) return '';
  switch (r.chave) {
    case 'consulta_ativa':
      if (u.examinados === 0) return 'não havia boleto em aberto para conferir';
      return `${u.examinados} em aberto conferidos, ${u.feitos} com pagamento encontrado`
           + (u.falhos > 0 ? `, ${u.falhos} com valor que não fecha` : '');
    case 'fila_de_emissao':
      if (u.examinados === 0) return 'não havia fatura esperando boleto';
      return `${u.examinados} na fila, ${u.feitos} registrados no banco`
           + (u.falhos > 0 ? `, ${u.falhos} que falharam de novo` : '');
    case 'ciclo_do_crm':
      if (u.examinados === 0) return 'não veio registro nenhum do outro lado';
      return `${u.examinados} registros lidos, ${u.feitos} criados ou atualizados`
           + (u.falhos > 0 ? `, ${u.falhos} recusados` : '');
  }
}

// ============================================================================
// A AFIRMAÇÃO — o que aparece MESMO COM TUDO EM DIA
// ============================================================================

export type LinhaDaAutomacao = {
  chave: ChaveDaAutomacao;
  /** "A conferência de pagamentos no banco" */
  nome: string;
  /** "rodou há 4 minutos" · "nunca rodou" */
  quando: string;
  /** "12 em aberto conferidos, 3 com pagamento encontrado". Vazio quando não há
   *  rodada nenhuma — e aí a linha inteira é a ausência. */
  fez: string;
  /** `false` quando esta linha está contando uma coisa ruim. A tela usa isto
   *  para o peso do texto; a cor sozinha nunca é o sinal (restrição 3 do tema). */
  saudavel: boolean;
};

/**
 * Uma linha por automação, SEMPRE — e o "sempre" é a decisão.
 *
 * `sem_conector` é a única que some: uma instalação que ainda não ligou o banco
 * não tem rodada a esperar, e listar "nunca rodou" ali seria acusar de parado o
 * que ninguém ligou. É o mesmo silêncio que `faixasDaSaude` guarda para o
 * mesmo caso.
 */
export function linhasDasAutomacoes(rodadas: readonly RodadaNaTela[]): LinhaDaAutomacao[] {
  return rodadas
    .filter((r) => r.nivel !== 'sem_conector')
    .map((r) => ({
      chave: r.chave,
      nome: AUTOMACAO[r.chave].Nome,
      quando: r.ultima === null || r.ha_quanto_tempo_segundos === null
        ? 'ainda não rodou nenhuma vez'
        : `rodou ${faz(r.ha_quanto_tempo_segundos)}`,
      fez: oQueFez(r),
      saudavel: r.nivel === 'em_dia',
    }));
}

// ============================================================================
// O ALARME — quando há o que gritar
// ============================================================================

export type FaixaDaAutomacao = {
  /** `erro` quando a automação parou; `alerta` quando ela rodou e terminou mal —
   *  a mesma fronteira de lá: "está quebrado" não é "tropeçou uma vez". */
  tom: 'erro' | 'alerta';
  titulo: string;
  corpo: string;
  /** O que quem administra o servidor confere. Vai atrás do `<DetalheTecnico>`,
   *  porque quem abre a tela não tem terminal — e quem tem precisa do ponteiro. */
  comando: string;
};

/**
 * VAZIO É A RESPOSTA quando não há nada parado — a mesma disciplina de
 * `faixasDaSaude`: quem exibe não precisa saber quais níveis merecem faixa.
 *
 * ⚠️ E É POR ISSO QUE ESTA FUNÇÃO SOZINHA NÃO BASTA. Se a tela mostrasse só as
 * faixas, o dia em que esta função quebrasse seria indistinguível do dia em que
 * está tudo bem — que é exatamente o defeito que ela existe para pegar, cometido
 * por ela mesma. Quem fecha esse laço é `linhasDasAutomacoes`, que fala mesmo
 * quando não há alarme.
 */
export function faixasDasAutomacoes(rodadas: readonly RodadaNaTela[]): FaixaDaAutomacao[] {
  const f: FaixaDaAutomacao[] = [];

  for (const r of rodadas) {
    const a = AUTOMACAO[r.chave];
    const quando = r.ha_quanto_tempo_segundos === null ? '' : faz(r.ha_quanto_tempo_segundos);

    switch (r.nivel) {
      case 'atrasada':
        f.push({
          tom: 'erro',
          titulo: `${a.Nome} parou de rodar.`,
          corpo: `Ela roda ${cadencia(r.intervalo_segundos)}, e a última vez foi ${quando}. `
               + `${a.consequencia} `
               + 'Isso não se conserta por esta tela: quem administra o servidor precisa religar.',
          comando: a.comando,
        });
        break;

      case 'travada':
        f.push({
          tom: 'erro',
          titulo: `${a.Nome} travou no meio de uma rodada.`,
          corpo: `A rodada começou ${quando} e nunca terminou — e, enquanto ela não for `
               + 'encerrada, nenhuma nova acontece. '
               + `${a.consequencia} `
               + 'Quem administra o servidor precisa encerrar a rodada parada.',
          comando: a.comando,
        });
        break;

      case 'nunca_rodou':
        f.push({
          tom: 'erro',
          titulo: `${a.Nome} nunca rodou.`,
          corpo: `Deveria acontecer ${cadencia(r.intervalo_segundos)}, e não há registro de `
               + 'nenhuma vez. '
               + `${a.consequencia} `
               + 'É uma etapa da instalação que falta — quem administra o servidor liga.',
          comando: a.comando,
        });
        break;

      case 'terminou_mal':
        f.push({
          tom: 'alerta',
          titulo: `${a.Nome} rodou e terminou com erro.`,
          corpo: `A rodada de ${quando} não chegou ao fim. A próxima acontece `
               + `${cadencia(r.intervalo_segundos)} e costuma resolver sozinha; `
               + 'se o erro se repetir, ele é a causa e precisa ser olhado.',
          comando: a.comando,
        });
        break;

      case 'em_dia':
      case 'sem_conector':
        break;
    }
  }

  return f;
}
