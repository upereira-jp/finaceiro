// A AGENDA DE COBRANCA, na parte que nao toca banco nem rede.
//
// PRD 6 pede dois processos periodicos, e os dois existem porque um caminho
// feliz que falha uma vez fica falhado para sempre:
//
//   "fila de emissao com retry exponencial"
//   "consulta ativa diaria dos boletos em aberto para capturar liquidacoes cujo
//    webhook falhou"
//
// Este arquivo e a DECISAO dos dois - quando retentar, e o que fazer com o que o
// banco respondeu. Nada aqui abre conexao, le tabela ou chama a Sicoob, e a razao
// e a regra 8: invariante sem teste e comentario. A decisao de retentar um boleto
// as 3h da manha nao pode depender de esperar 3h para observar.
//
// ============================================================================
// OS QUATRO NUMEROS QUE O PRD NAO DA, E POR QUE ELES ESTAO TODOS AQUI
//
// O PRD diz "exponencial" e "diaria". Nao diz base, nao diz teto, nao diz quando
// desistir e nao diz com quantos dias avisar do certificado. Pela regra 10 isso
// e lacuna, e lacuna nao vira valor default escolhido "porque parecia razoavel"
// sem dono nomeado - entao os quatro estao num objeto so, marcados como escolha
// de quem escreveu o codigo, e registrados em Q-AGENDA-02 para o dono confirmar.
//
// O mesmo padrao do `web/src/tema.ts`, onde o que e da G3 e o que e [derivado]
// estao separados no arquivo em vez de misturados na cabeca de alguem.
//
// ============================================================================
// A DECISAO QUE NAO E ARBITRARIA: A FILA NUNCA DESISTE SOZINHA
//
// Nao ha "maximo de tentativas" aqui, e a ausencia e a parte pensada. Um boleto
// que sai da fila por contagem para de ser cobrado sem que ninguem tenha
// decidido parar de cobrar - a fatura fica emitida, o cliente nao recebe nada, e
// o sistema nao acusa porque, do ponto de vista dele, a fila esta limpa. E a
// falha silenciosa que esta agenda existe para fechar, cometida pela agenda.
//
// O teto e do INTERVALO. A fila desacelera ate uma tentativa a cada
// `tetoSegundos` e fica ali, visivel e contada, ate alguem consertar a causa ou
// decidir - com nome e data - que aquele boleto nao se cobra mais.

import type { Centavos } from './centavos.ts';
import type { SituacaoDoBoleto } from '../sicoob/porta.ts';

/**
 * Os quatro numeros escolhidos. Q-AGENDA-02: o PRD nao os da.
 *
 * Por que estes, e o raciocinio fica escrito para poder ser contestado:
 *
 *   baseSegundos 300 (5 min)  - falha de transporte que se resolve sozinha se
 *                               resolve em minutos. Menos que isso e martelar o
 *                               banco durante uma indisponibilidade dele.
 *   tetoSegundos 21600 (6 h)  - quatro tentativas por dia no regime lento, que e
 *                               a mesma ordem de grandeza da consulta ativa
 *                               diaria. Passar disso faria a fila parecer parada.
 *   diasDeAvisoDoCertificado 30 - A1 se renova com processo e assinatura, nao com
 *                               um clique. Trinta dias e prazo de agenda, nao de
 *                               emergencia.
 *   examinadosPorRodada 200   - teto de trabalho por execucao, para uma rodada
 *                               nao virar uma janela de horas. O que sobra fica
 *                               na fila e sai na proxima - e a rodada CONTA o
 *                               que deixou para tras, em vez de truncar calada.
 *
 * Com base 5 min e teto 6 h a progressao e 5, 10, 20, 40, 80, 160, 320 min e
 * dai 6 h fixas: a oitava tentativa cai por volta de 16 h depois da primeira.
 */
export type Politica = {
  readonly baseSegundos: number;
  readonly tetoSegundos: number;
  readonly diasDeAvisoDoCertificado: number;
  readonly examinadosPorRodada: number;
};

/*
 * Tipo declarado ANTES e nao `as const` depois. Com `as const` o tipo de
 * `Politica` viraria os literais 300/21600/30/200, e toda politica de teste - que
 * existe justamente para nao depender destes numeros - deixaria de compilar. Foi
 * o que aconteceu na primeira versao: o teste de propriedade nao entrava no tipo
 * da coisa cuja propriedade ele testa.
 */
export const POLITICA: Politica = {
  baseSegundos: 300,
  tetoSegundos: 21_600,
  diasDeAvisoDoCertificado: 30,
  examinadosPorRodada: 200,
};

/**
 * O intervalo ate a proxima tentativa, em segundos.
 *
 * `tentativas` e quantas JA falharam - depois da primeira falha o intervalo e a
 * base, e nao a base dobrada. Dobrar na primeira faria a retentativa mais rapida
 * possivel ser o dobro do que a politica diz.
 *
 * Recusa tentativas < 1 em vez de devolver zero: chamar isto com zero significa
 * que quem chamou acha que houve uma falha e nao houve, e devolver "tente agora"
 * poria em producao um laco que retenta o que nunca falhou.
 */
export function intervaloSegundos(tentativas: number, p: Politica = POLITICA): number {
  if (!Number.isInteger(tentativas) || tentativas < 1) {
    throw new RangeError(
      `intervaloSegundos espera o numero de tentativas JA FALHADAS (>= 1), recebeu ${tentativas}`,
    );
  }
  // 2^(n-1) sem Math.pow em float: deslocamento de inteiro, e saturado antes de
  // estourar. Com n grande o produto passaria de Number.MAX_SAFE_INTEGER e o teto
  // deixaria de ser alcancavel pelo caminho normal - o `min` de baixo nunca
  // veria um numero comparavel.
  const expoente = Math.min(tentativas - 1, 31);
  const fator = 2 ** expoente;
  return Math.min(p.baseSegundos * fator, p.tetoSegundos);
}

/** Quando a fila pode pegar esta linha de novo, contado a partir da tentativa
 *  que acabou de falhar. */
export function proximaTentativaEm(tentativas: number, desde: Date, p: Politica = POLITICA): Date {
  const t = desde.getTime();
  if (!Number.isFinite(t)) throw new RangeError('proximaTentativaEm: "desde" nao e uma data valida');
  return new Date(t + intervaloSegundos(tentativas, p) * 1000);
}

/**
 * A linha esta vencida, isto e, a fila pode pega-la?
 *
 * `proxima_tentativa_em` nulo e VENCIDO, e nao "nunca". E o estado das linhas que
 * ja existiam quando a migration 21 entrou - falharam e nunca foram retentadas -
 * e tambem o de um boleto `pendente` que nasceu e cuja chamada morreu antes de
 * carimbar qualquer coisa. Tratar nulo como "nao vence" deixaria os dois casos
 * fora da fila para sempre, que e exatamente o buraco que a fila veio fechar.
 */
export function vencido(
  linha: { proxima_tentativa_em: Date | null },
  agora: Date,
): boolean {
  if (linha.proxima_tentativa_em === null) return true;
  return linha.proxima_tentativa_em.getTime() <= agora.getTime();
}

// ============================================================ consulta ativa

/**
 * O que fazer com o que o banco respondeu.
 *
 * `divergencia` NAO e erro de programa e nao aborta a rodada: e um fato sobre o
 * mundo que precisa chegar a uma pessoa. O sistema registra e segue, porque uma
 * divergencia que derruba a rodada impede as outras 199 de serem verificadas.
 */
export type Acao =
  | { acao: 'nada'; motivo: string }
  | { acao: 'baixar'; motivo: string; dataLiquidacao: Date; valorCentavos: Centavos; chave: string }
  | { acao: 'marcar_baixado'; motivo: string }
  | { acao: 'divergencia'; motivo: string };

/**
 * A chave de idempotencia da baixa por consulta ativa.
 *
 * DETERMINISTICA de proposito: a mesma situacao no banco produz a mesma chave em
 * toda rodada. Sem isso, duas execucoes da consulta ativa sobre o mesmo boleto
 * liquidado produziriam duas chaves e dependeriam de outra coisa para nao
 * duplicar a baixa.
 *
 * A outra coisa existe e vale - `liquidacao_fatura_unica UNIQUE (tenant_id,
 * fatura_id)` da migration 16 -, mas depender dela transformaria o caso normal
 * "ja baixamos ontem" em violacao de constraint. Erro esperado no caminho feliz
 * treina o time a ignorar erro.
 *
 * O prefixo distingue a origem: um evento visto por consulta ativa e o mesmo
 * evento visto por webhook tem chaves diferentes, e e isso que se quer - a
 * `liquidacao_externa_unica` e por (tenant_id, ORIGEM, id_externo), e o que
 * impede a dupla contagem entre canais e o unico por fatura, nao a chave.
 */
export function chaveDaConsultaAtiva(nossoNumero: string, dataLiquidacao: Date): string {
  return `consulta:${nossoNumero}:${dataLiquidacao.toISOString().slice(0, 10)}`;
}

export function decidir(s: SituacaoDoBoleto): Acao {
  switch (s.situacao) {
    case 'em_aberto':
      return { acao: 'nada', motivo: 'o banco diz em aberto' };

    case 'baixado':
      // Baixado no banco e nao liquidado: o titulo foi cancelado la. Nao ha
      // dinheiro, entao nao ha split - so o nosso estado a alinhar.
      return { acao: 'marcar_baixado', motivo: 'o banco diz baixado - titulo cancelado, sem liquidacao' };

    case 'desconhecida':
      /*
       * O banco nao reconhece o nosso numero. Isto NAO e "nada a fazer": a
       * hipotese ruim e que o registro nunca chegou de fato e o cliente esta com
       * um boleto que o banco nao vai aceitar. Vale gente olhando.
       */
      return {
        acao: 'divergencia',
        motivo: `o banco nao reconhece o nosso numero "${s.nossoNumero}" - o registro pode nunca ter chegado`,
      };

    case 'liquidado': {
      if (s.dataLiquidacao === null) {
        return { acao: 'divergencia', motivo: 'o banco diz liquidado e nao informa a data - baixa sem data nao entra' };
      }
      if (s.valorLiquidadoCentavos === null) {
        return { acao: 'divergencia', motivo: 'o banco diz liquidado e nao informa o valor - nao ha o que conferir contra o titulo' };
      }
      return {
        acao: 'baixar',
        motivo: 'o banco diz liquidado',
        dataLiquidacao: s.dataLiquidacao,
        valorCentavos: s.valorLiquidadoCentavos,
        chave: chaveDaConsultaAtiva(s.nossoNumero, s.dataLiquidacao),
      };
    }
  }
}

// ============================================================ certificado A1

export type NivelDoCertificado = 'sem_certificado' | 'vencido' | 'vence_em_breve' | 'ok';

/**
 * PRD 6, ultima linha: "alerta de expiracao do certificado A1 - vencido, a
 * emissao para sem erro obvio".
 *
 * `sem_certificado` e `vencido` sao coisas diferentes e a distincao nao e
 * formal: sem data cadastrada nao se sabe se ha problema, e afirmar "ok" nesse
 * caso seria o sistema garantindo o que ele nao sabe.
 */
export function nivelDoCertificado(dias: number | null, p: Politica = POLITICA): NivelDoCertificado {
  if (dias === null) return 'sem_certificado';
  if (dias < 0) return 'vencido';
  if (dias <= p.diasDeAvisoDoCertificado) return 'vence_em_breve';
  return 'ok';
}

// ====================================================== o aviso de pagamento

export type NivelDoAviso =
  | 'ativo'           // ha aviso e o banco nao o desligou
  | 'inativado'       // o banco DESLIGOU. Nenhum pagamento e avisado
  | 'ausente'         // o banco respondeu, e nao ha aviso nenhum cadastrado
  | 'nao_verificavel'; // ninguem perguntou, ou o adaptador nao sabe perguntar

/**
 * O IRMAO DE `nivelDoCertificado`, e existe pelo mesmo motivo dele.
 *
 * A Sicoob INATIVA o webhook quando a entrega falha - o modelo do `GET /webhooks`
 * traz `dataHoraInativacao` e `descricaoMotivoInativacao`, e o exemplo do proprio
 * banco preenche o segundo com "Erro ao enviar notificacao". Isso foi descoberto
 * em 09/09/2026, ao ler o contrato, e nao estava no projeto.
 *
 * POR QUE ELE PRECISA EXISTIR: um aviso desligado e SILENCIOSO do nosso lado. Nao
 * chega erro, nao chega nada - e "nenhuma notificacao" e indistinguivel de
 * "ninguem pagou". E o mesmo formato de dano do A1 vencido ("a emissao para sem
 * erro obvio"), uma camada adiante: aqui o dinheiro ENTRA na conta e o sistema
 * nunca fica sabendo.
 *
 * As quatro respostas sao quatro estados do mundo e nenhuma delas colapsa nas
 * outras:
 *
 *   `ausente` NAO e `inativado`. Nunca ter cadastrado e o estado de quem ainda
 *   nao ligou; ser desligado pelo banco e o estado de quem ligou e perdeu. As
 *   duas pedem a mesma acao e contam historias opostas sobre o que aconteceu.
 *
 *   `nao_verificavel` NAO e `ativo`, e esta e a distincao que o
 *   `sem_certificado` do vizinho ja ensinou: nao ter perguntado nao autoriza
 *   ninguem a dizer que esta bem. Um adaptador sem `avisoDePagamento` - o falso,
 *   o nao-configurado - responde isto, e nao silencio.
 *
 * UM SO INATIVO CONTAMINA A LISTA. Se ha dois avisos do mesmo tipo e um esta
 * desligado, o nivel e `inativado`: nao da para saber qual dos dois o banco
 * usaria, e a resposta otimista seria uma aposta sobre dinheiro.
 */
export function nivelDoAviso(avisos: readonly Aviso[] | null | undefined): NivelDoAviso {
  if (avisos == null) return 'nao_verificavel';
  if (avisos.length === 0) return 'ausente';
  return avisos.some((a) => a.inativado_em != null) ? 'inativado' : 'ativo';
}

/** So o que o nivel le. Estrutural de proposito: o dominio nao importa a porta,
 *  e um tipo com um campo nao merece uma dependencia de modulo. */
type Aviso = { inativado_em: string | null };

// ============================================================================
// A SAUDE DO CAMINHO DO DINHEIRO, num numero que o systemd entende
// ============================================================================

/**
 * O QUE ESTA FUNCAO FECHA, e ela e a resposta a uma pendencia nomeada.
 *
 * Ate 09/09/2026 os dois alertas desta agenda - o do A1 e o do aviso de
 * pagamento - chegavam a dois lugares, o journal e uma tela, e NENHUM DOS DOIS
 * PROCURA NINGUEM. O `deploy/README` chama `systemctl list-units --failed` de
 * "a unica superficie de alarme desta maquina", e nenhum dos dois aparecia la.
 * O texto do proprio `financeiro-agenda-certificado.service` dizia isso com
 * todas as letras desde 28/08: *"nao notifica ninguem. O aviso cai no journal"*.
 *
 * A TROCA QUE TINHA SIDO FEITA ERA "ninguem sabe" -> "quem abrir a tela sabe".
 * E melhor, e nao e aviso.
 *
 * POR QUE UM CODIGO DE SAIDA E NAO UMA EXCECAO. Quem consome isto e uma unidade
 * do systemd cujo trabalho INTEIRO e afirmar que o caminho do dinheiro esta de
 * pe. Quando a afirmacao e falsa, a unidade fica `failed` - e isso NAO mente,
 * que era a objecao que manteve o alerta fora do alarme ate hoje. Por o timer da
 * CONSULTA em `failed` mentiria: a consulta funcionou, quem morreu foi o
 * webhook. Uma unidade cuja unica tarefa e conferir nao tem esse problema, e por
 * isso ela e separada.
 *
 * OS QUATRO CODIGOS, e a fronteira entre 4 e 5 e a mesma que separa `inativado`
 * de `nao_verificavel` - "esta quebrado" nao e "ninguem sabe":
 *
 *   0  de pe. Nada a fazer.
 *   3  NAO HA CONECTOR DE COBRANCA. Nada a conferir, e nao e falha - mesmo 3 da
 *      fila e da consulta, mesmo `SuccessExitStatus=3` no unit. Sem ele, uma
 *      maquina que ainda nao ligou o banco ficaria VERMELHA todo dia, e vermelho
 *      permanente e alarme desligado.
 *   4  PRECISA DE ACAO HUMANA. O A1 venceu, esta para vencer ou nao tem data; o
 *      banco desligou o aviso, ou nunca houve aviso. Vermelho.
 *   5  NAO DEU PARA PERGUNTAR. Vermelho tambem, e a razao e a mesma que faz
 *      `nao_verificavel` nao colapsar em `ativo`: nao ter perguntado nao
 *      autoriza dizer que esta bem. Some sozinho na proxima rodada diaria se era
 *      a Sicoob fora do ar - e insiste, dia apos dia, se nao era.
 *
 * A PRECEDENCIA E 3 > 4 > 5, e ela nao e arbitraria: com o A1 vencido E a Sicoob
 * fora do ar, o que da para fazer hoje e renovar o A1. O codigo aponta o que tem
 * dono, nao o que apareceu primeiro.
 */
export type CodigoDeSaude = 0 | 3 | 4 | 5;

export type Saude = {
  codigo: CodigoDeSaude;
  /** Uma linha, para o journal e para o `systemctl status`. */
  resumo: string;
};

export function saudeDoCaminhoDoDinheiro(e: {
  /** `null` quando nao ha conector de cobranca - nao ha o que conferir. */
  certificado: NivelDoCertificado | null;
  /** `null` pelo mesmo motivo. */
  aviso: NivelDoAviso | null;
  /**
   * AS RODADAS QUE PARARAM, ja em uma frase cada - entrou em 10/09/2026.
   *
   * POR QUE ELAS CABEM NESTA UNIDADE, e a pergunta e legitima: ate hoje ela
   * afirmava sobre o A1 e sobre o aviso, e a retomada de 10/09 registrou que
   * ela **nao** cobria a rodada ter acontecido. Cabem porque a afirmacao que
   * esta unidade faz e "o caminho do dinheiro esta de pe", e uma consulta ativa
   * parada quebra esse caminho tao literalmente quanto um A1 vencido: com ela
   * parada, boleto pago nao vira baixa. A unidade nao ganhou assunto novo -
   * ela deixou de ter um buraco no assunto que ja tinha.
   *
   * E O QUE FICOU DE FORA E DELIBERADO: so a fila de emissao e a consulta ativa
   * entram. O ciclo do CRM tambem para em silencio, e a tela o mostra - mas o
   * espelho velho atrasa CADASTRO, nao dinheiro, e por uma unidade chamada
   * "saude do caminho do dinheiro" em `failed` por causa dele o vermelho
   * comecaria a querer dizer duas coisas.
   *
   * A frase vem pronta de quem chamou porque ela precisa dizer HA QUANTO TEMPO,
   * e isso e leitura de banco - que nao entra neste arquivo (regra 8: o que
   * decide tem de ser observavel sem esperar um dia para observar).
   */
  rodadasParadas?: readonly string[];
}): Saude {
  if (e.certificado === null && e.aviso === null) {
    return { codigo: 3, resumo: 'nao ha conector de cobranca neste tenant - nada a conferir' };
  }

  const quebrado: string[] = [];
  if (e.certificado === 'vencido') quebrado.push('o certificado A1 esta VENCIDO');
  if (e.certificado === 'vence_em_breve') quebrado.push('o certificado A1 vence em breve');
  if (e.aviso === 'inativado') quebrado.push('o banco DESLIGOU o aviso de pagamento');
  if (e.aviso === 'ausente') quebrado.push('nao ha aviso de pagamento cadastrado no banco');
  for (const r of e.rodadasParadas ?? []) quebrado.push(r);
  if (quebrado.length > 0) return { codigo: 4, resumo: quebrado.join('; ') };

  const semSaber: string[] = [];
  if (e.certificado === 'sem_certificado') semSaber.push('nao ha data de validade do A1 cadastrada');
  if (e.aviso === 'nao_verificavel') semSaber.push('nao deu para perguntar ao banco sobre o aviso de pagamento');
  if (semSaber.length > 0) return { codigo: 5, resumo: semSaber.join('; ') };

  return { codigo: 0, resumo: 'o caminho do dinheiro esta de pe' };
}

// ============================================================================
// RELIGAR O AVISO DE PAGAMENTO: quando pode, e quando NAO pode
// ============================================================================

/**
 * A GUARDA QUE EXISTE PORQUE O CADASTRO NAO TEM INVERSO.
 *
 * `POST /webhooks` da Sicoob NAO e idempotente: cadastrar duas vezes cria dois
 * webhooks, e o banco passa a notificar EM DOBRO o mesmo pagamento. Nao ha rota
 * nossa que desfaca isso - o conserto seria no banco, a mao.
 *
 * O script `webhook-sicoob --cadastrar` ja tinha esta guarda; ela vem para o
 * dominio porque agora ha um BOTAO, e botao e apertado por quem nao leu o
 * cabecalho do script. Regra 8: a guarda que protege dinheiro tem teste.
 *
 * AS QUATRO RESPOSTAS, e a que surpreende e a ultima:
 *
 *   `inativado`       PODE. O banco desligou; recadastrar e o conserto, e o
 *                     inativo nao conta como duplicata para o proprio banco;
 *   `ausente`         PODE. Nunca houve. E o primeiro cadastro;
 *   `ativo`           NAO. Ja ha um vivo, e um segundo faz notificar em dobro;
 *   `nao_verificavel` NAO, e este e o ponto delicado. Nao saber se ja existe um
 *                     NAO autoriza cadastrar - a aposta otimista aqui cria a
 *                     duplicata que nao se desfaz. E a mesma disciplina que faz
 *                     `nao_verificavel` nao virar `ativo` no diagnostico, agora
 *                     do lado da ESCRITA: la, nao saber nao autoriza dizer que
 *                     esta bem; aqui, nao saber nao autoriza agir.
 */
export type PermissaoDeReligar =
  | { pode: true }
  | { pode: false; motivo: string };

export function podeReligarOAviso(nivel: NivelDoAviso): PermissaoDeReligar {
  switch (nivel) {
    case 'inativado':
    case 'ausente':
      return { pode: true };
    case 'ativo':
      return {
        pode: false,
        motivo:
          'ja ha um aviso de pagamento ATIVO no banco. Cadastrar um segundo faz a Sicoob '
          + 'notificar EM DOBRO o mesmo pagamento, e nao ha caminho neste sistema que desfaca - '
          + 'o conserto seria no banco, a mao. Nada foi enviado.',
      };
    case 'nao_verificavel':
      return {
        pode: false,
        motivo:
          'nao deu para perguntar ao banco quais avisos existem, entao nao da para saber se '
          + 'cadastrar criaria um segundo. Nao saber NAO autoriza agir: a aposta otimista aqui '
          + 'cria a notificacao em dobro, que nao se desfaz. Tente de novo em alguns minutos.',
      };
  }
}

// ============================================================================
// A RODADA ACONTECEU? - o modo de falha que nao produz erro nenhum
// ============================================================================

/**
 * O QUE ESTA SECAO FECHA, e ela e a irma mais velha de tudo o que esta acima.
 *
 * As duas secoes anteriores alarmam sobre o A1 e sobre o aviso de pagamento -
 * duas coisas que quebram enquanto o sistema TRABALHA. Esta alarma sobre o
 * sistema ter PARADO DE TRABALHAR, que e uma camada acima: um timer desabilitado
 * por engano, uma maquina que reiniciou sem o servico, uma rodada que morreu no
 * meio e deixou a proxima trancada.
 *
 * ⚠️ O DADO SEMPRE EXISTIU E NUNCA FOI LIDO. `agenda_execucao` esta no banco
 * desde a migration 21 (30/07/2026) e recebe uma linha por rodada; o proprio
 * `scripts/agenda.ts` escreveu por que ela existe: *"sem esse registro, «a agenda
 * nao roda desde o dia 3» volta a ser impossivel de perguntar"*. Varredura de
 * 10/09/2026: ZERO leituras em `src/repos/`, em `rotas.ts` e em `web/`. A
 * resposta era escrita todo dia e a pergunta nunca era feita.
 *
 * POR QUE ELE E O MAIS PERIGOSO DOS TRES ALARMES: a consulta ativa e a UNICA
 * porta automatica de baixa enquanto o `ADR-0006` nao existir (`PRD` §6). Se ela
 * parar, boleto pago para de virar baixa - e o sintoma e a inadimplencia
 * acusando quem ja pagou, sem um erro em lugar nenhum. A ausencia de execucao
 * nao produz excecao, nao produz log e nao produz linha: ela e invisivel por
 * construcao, e por isso precisa de uma AFIRMACAO para ser vista.
 *
 * E A DIFERENCA COM A FAIXA DO CAMINHO DO DINHEIRO E JUSTAMENTE ESSA. La, o
 * silencio e a resposta boa - `faixasDaSaude` devolve vazio quando esta tudo de
 * pe, e a tela nao ganha um verde a mais para conferir todo dia. Aqui o silencio
 * E O DEFEITO: "nao ha alerta" e exatamente a cara de "o alarme tambem parou".
 * Por isso a tela mostra a rodada mesmo quando ela esta em dia - o que se exibe
 * nao e um alerta, e uma afirmacao, pelo mesmo motivo que a unidade
 * `financeiro-saude-cobranca` afirma em vez de calar.
 */

export type NivelDaRodada =
  /** Nao ha atraso a apontar. NAO quer dizer "rodou": uma automacao recem-ligada,
   *  que ainda nao teve a primeira rodada, tambem cai aqui - quem diz "nunca
   *  rodou ainda" e a ausencia de `ultima`, e nao o nivel. */
  | 'em_dia'
  /** A ultima rodada terminou com `erro`. Ela ACONTECEU - o alarme e sobre o
   *  desfecho, nao sobre a ausencia. */
  | 'terminou_mal'
  /** Passou da hora e a rodada nao veio. E o alarme principal desta secao. */
  | 'atrasada'
  /** A ultima linha ficou `em_andamento` alem do aceitavel: a rodada morreu no
   *  meio. ⚠️ Isto nao e so uma rodada perdida - o EXCLUDE
   *  `agenda_uma_execucao_por_tarefa` (migration 21) recusa TODA rodada seguinte
   *  enquanto a linha orfa existir. A automacao esta trancada, e nada a destranca
   *  sozinho. O proprio comentario da migration previu o caso e nenhum codigo
   *  olhava para ele. */
  | 'travada'
  /** Nao ha uma linha sequer, e ja deu tempo de haver. O timer nunca foi ligado,
   *  ou foi desligado ha muito. */
  | 'nunca_rodou'
  /** Nao ha conector, entao nao ha rodada a esperar. NAO e alarme, e a mesma
   *  disciplina do codigo de saida 3 e do `sem_conector` da faixa: vermelho
   *  permanente numa instalacao que nunca ligou banco nenhum e alarme
   *  desligado. */
  | 'sem_conector';

/** So o que o nivel le de uma rodada. Estrutural de proposito, como `Aviso`
 *  acima: o dominio nao importa repositorio nem cliente de banco. */
export type RodadaVista = {
  iniciado_em: Date;
  terminado_em: Date | null;
  /** `em_andamento` | `ok` | `parcial` | `erro` - o enum `execucao_status`. Texto
   *  e nao uniao fechada porque quem le vem do banco, e um valor novo la nao
   *  pode quebrar a leitura aqui: ele cai no `default` e nao vira alarme falso. */
  status: string;
};

/**
 * QUANTO ATRASO E ATRASO, e o numero nao e gosto: ele e derivado da cadencia.
 *
 * `intervalo + max(intervalo/4, 10 min)`, e as duas metades tem razao propria:
 *
 *   o intervalo    porque uma rodada que acabou de acontecer nao esta atrasada
 *                  ate a PROXIMA vencer. Alarmar antes disso e alarmar sobre o
 *                  relogio, nao sobre o sistema;
 *   o quarto       porque `AccuracySec` e a fila do systemd atrasam a rodada em
 *                  segundos a minutos, e um alarme que dispara na borda exata
 *                  toca todo dia sem nada estar errado;
 *   o piso de 10   porque em cadencia curta (a fila e de 5 minutos) um quarto
 *   minutos        seriam 75 segundos, e uma rodada perdida no meio de 288 por
 *                  dia nao e noticia. Duas seguidas ja sao.
 *
 * O QUE ISSO CUSTA, e o custo esta declarado: a consulta ativa e DIARIA, entao
 * o atraso so vira alarme 30 horas depois da ultima rodada - a rodada perdida
 * das 06:17 aparece por volta do meio-dia do dia seguinte. E deliberado. Um
 * alarme mais apertado dispararia toda vez que a maquina reiniciasse fora de
 * hora, e `Persistent=true` ja recupera a rodada sozinho nesse caso. Alarme que
 * toca sem motivo e alarme que se aprende a ignorar - a mesma razao pela qual
 * `sem_conector` nao gera faixa.
 *
 * Registrado como `Q-RODADA-01` para o dono confirmar a folga; a decisao tecnica
 * e de quem escreve o codigo, e o numero esta aqui e nao espalhado.
 */
export function atrasoAceitoSegundos(intervaloSegundos: number): number {
  if (!Number.isFinite(intervaloSegundos) || intervaloSegundos <= 0) {
    throw new RangeError(
      `atrasoAceitoSegundos espera a cadencia em segundos (> 0), recebeu ${intervaloSegundos}`,
    );
  }
  return intervaloSegundos + Math.max(intervaloSegundos / 4, 600);
}

/**
 * A CADENCIA DE CADA AUTOMACAO, em segundos - e ela E COPIA DOS TIMERS.
 *
 * ⚠️ A copia e o risco, e ele esta prendido: `AG11k` le os tres arquivos de
 * `deploy/` e exige que estes tres numeros concordem com o `OnCalendar` de cada
 * um. Sem essa linha, mudar o timer de 5 para 30 minutos deixaria o alarme
 * calado por meia hora achando que esta tudo em dia - o alarme mentiria com a
 * mesma cara de estar certo, que e o formato de dano que esta secao inteira
 * existe para fechar.
 *
 * O `ciclo_do_crm` nao e da agenda de cobranca e mora aqui do mesmo jeito: a
 * pergunta "o sistema esta trabalhando sozinho?" nao se divide por qual tabela
 * guarda a resposta, e quem opera nao sabe que sao dois motores.
 */
export const CADENCIA = {
  /** `deploy/financeiro-agenda-fila.timer`: `OnCalendar=*:02/5`. */
  fila_de_emissao: 300,
  /** `deploy/financeiro-agenda-consulta.timer`: `OnCalendar=*-*-* 06:17:00`. */
  consulta_ativa: 86_400,
  /** `deploy/financeiro-ciclo.timer`: `OnCalendar=*:0/15`. */
  ciclo_do_crm: 900,
} as const;

/**
 * O nivel de UMA automacao.
 *
 * A PRECEDENCIA E `sem_conector` > `nunca_rodou` > `travada` > `atrasada` >
 * `terminou_mal` > `em_dia`, e ela e a mesma disciplina do `3 > 4 > 5` de
 * `saudeDoCaminhoDoDinheiro`: o nivel aponta o que TEM DONO, e nao o que
 * apareceu primeiro.
 *
 *   `travada` antes de `atrasada` porque uma linha orfa esta atrasada TAMBEM, e
 *   dizer so "atrasada" mandaria a pessoa procurar o timer - quando o conserto e
 *   fechar a linha que tranca o EXCLUDE. Nomear o atraso sem nomear a tranca
 *   manda consertar a coisa errada;
 *
 *   `atrasada` antes de `terminou_mal` porque uma rodada que errou ontem e nao
 *   voltou hoje tem duas noticias, e "parou de rodar" e a maior das duas: a
 *   falha de uma rodada se resolve na proxima, e a proxima nao veio.
 *
 * `desde` E A DATA A PARTIR DA QUAL FAZ SENTIDO ESPERAR RODADA - o cadastro do
 * conector, quando o banco a guarda. Sem ela, ligar a cobranca as 09h faria a
 * tela acusar `nunca_rodou` as 09h01 sobre uma automacao que ainda nao teve a
 * primeira vez. `null` quer dizer "nao da para saber", e ai a ausencia de linha
 * e tratada como ausencia mesmo.
 */
export function nivelDaRodada(e: {
  /** `false` quando nao ha conector - nao ha rodada a esperar. */
  temConector: boolean;
  /** A rodada mais recente desta automacao, ou `null` se nao ha nenhuma. */
  ultima: RodadaVista | null;
  desde: Date | null;
  agora: Date;
  intervaloSegundos: number;
}): NivelDaRodada {
  if (!e.temConector) return 'sem_conector';

  const folgaMs = atrasoAceitoSegundos(e.intervaloSegundos) * 1000;
  const agoraMs = e.agora.getTime();

  if (e.ultima === null) {
    // Recem-ligado ainda nao deve rodada a ninguem.
    if (e.desde !== null && agoraMs - e.desde.getTime() <= folgaMs) return 'em_dia';
    return 'nunca_rodou';
  }

  const desdeAUltima = agoraMs - e.ultima.iniciado_em.getTime();

  if (e.ultima.status === 'em_andamento') {
    /* Uma rodada em andamento AGORA e o estado normal de quem foi disparado
     * neste minuto - so vira `travada` depois da folga. E ela nao e "atrasada"
     * nunca: a linha existe, e o que ela tranca e o futuro. */
    return desdeAUltima > folgaMs ? 'travada' : 'em_dia';
  }

  if (desdeAUltima > folgaMs) return 'atrasada';
  if (e.ultima.status === 'erro') return 'terminou_mal';
  /* `parcial` NAO e alarme desta secao, e a distincao vem do motor: parcial quer
   * dizer que a rodada CONCLUIU e registrou o motivo de cada item que nao passou
   * - o que falhou tem lugar proprio para aparecer (o erro por fatura), e
   * chamar a rodada de quebrada esconderia a diferenca entre "o sistema parou" e
   * "o banco recusou tres boletos". */
  return 'em_dia';
}

/** As tres que precisam de gente. Existe para a tela e a unidade do systemd nao
 *  reimplementarem a mesma lista - e uma lista repetida em dois lugares e uma
 *  lista que diverge. */
export function pedeGente(nivel: NivelDaRodada): boolean {
  return nivel === 'atrasada' || nivel === 'travada' || nivel === 'nunca_rodou';
}

// ============================================================================
// 6. A COBRANCA QUE NAO CHEGOU AO BANCO
// ============================================================================
//
// A secao 5 pergunta se a RODADA aconteceu. Esta pergunta o degrau seguinte, e
// ele e o que o cliente sente: **a rodada pode estar em dia e a cobranca nao
// sair mesmo assim**. Um boleto recusado pelo banco fica na fila retentando,
// desacelerando ate 6 h entre tentativas, e - por decisao registrada no
// cabecalho deste arquivo - a fila NUNCA DESISTE SOZINHA. Isso e o certo: sair
// da fila por contagem seria parar de cobrar sem ninguem ter decidido parar.
//
// So que "fica na fila para sempre" tem um preco que ate 10/09/2026 ninguem
// pagava conscientemente: **nada olhava para a fila.** O erro existia por
// fatura, uma de cada vez, dentro do painel que abre na aba de emissao - com 29
// unidades, descobrir que 4 estao retentando exigia abrir 29 paineis. O
// levantamento de 10/09 escreveu a frase: *"um boleto pode retentar por semanas
// sem ninguem notar"*.
//
// ⚠️ E HA UM CASO PIOR QUE O DA FILA, e ele foi achado ao medir para escrever
// isto: a fatura EMITIDA cujo boleto nunca foi pedido. `emitir()` nao cria linha
// de boleto - esta escrito la, e e deliberado ("emitir e reservar o numero da
// cobranca sao atos separaveis"). Quem cria a linha e `registrar()`, chamado
// pelo botao de uma fatura. E `filaDeEmissao` so enxerga linha que EXISTE.
// Entao a fatura emitida que ninguem clicou nao esta atrasada, nao esta em erro
// e **nao esta em fila nenhuma**: ela simplesmente nao vira cobranca, e o unico
// sinal disso e um painel fechado numa linha de tabela.
//
// As duas ausencias tem a mesma cara para quem opera - o cliente nao recebeu
// nada - e por isso as duas entram na MESMA lista, com niveis diferentes. Uma
// lista que so mostrasse a fila esconderia justamente o caso que a fila nao
// cobre.

/**
 * ONDE ESTA A COBRANCA DESTA FATURA, do ponto de vista de quem espera o dinheiro.
 *
 * A ordem dos cinco e de CONSEQUENCIA, e ela e a ordem em que a tela mostra:
 * quanto mais alto, mais tempo o cliente esta sem receber nada.
 */
export type NivelDaEmissao =
  /** Fatura emitida agora ha pouco, boleto ainda nao pedido. NAO e alarme: e o
   *  estado normal de quem acabou de emitir o mes e ainda esta trabalhando. */
  | 'nao_pedido'
  /** Ninguem pediu o boleto e ja passou a folga. Ninguem vai pedir sozinho -
   *  nao ha linha para a fila enxergar. E o caso invisivel por construcao. */
  | 'esquecido'
  /** Pedido, falhou, e a fila retenta sozinha. Aparece na lista sem gritar: o
   *  desfecho normal de uma falha de transporte e a proxima tentativa dar certo. */
  | 'esperando'
  /** Retentando ha mais de um dia. A fila continua tentando e vai continuar para
   *  sempre - o que esta dito aqui e que a CAUSA nao passou sozinha, e nao vai. */
  | 'insistindo'
  /** A fila nao pega mais esta linha, e ninguem vai tentar de novo sem uma
   *  pessoa. Hoje ha um caminho para ca: a fatura deixou de estar `emitida`
   *  depois de o boleto falhar - `registrar()` recusa qualquer outro estado. */
  | 'parado';

/**
 * A FOLGA ANTES DE COBRAR GENTE, e ela e uma escolha - Q-EMISSAOTRAVADA-01.
 *
 * 24 h, e o raciocinio fica escrito para poder ser contestado: o mes inteiro e
 * emitido de uma vez e os boletos sao pedidos na sequencia, entao qualquer folga
 * curta acusaria a operacao normal de esquecimento no meio do proprio trabalho.
 * Um dia inteiro sem a cobranca sair, por outro lado, ja e um dia de atraso no
 * dinheiro - e ninguem escolheu esse atraso.
 *
 * A mesma folga vale para os dois lados da lista (o nao pedido e o que retenta),
 * de proposito: a pergunta que ela responde e uma so - *"faz tempo demais que
 * este cliente esta sem cobranca?"* -, e dois numeros diferentes para a mesma
 * pergunta seriam duas respostas para explicar a quem opera.
 */
export const FOLGA_DA_EMISSAO_SEGUNDOS = 24 * 60 * 60;

/** So o que o nivel le. Estrutural, como `RodadaVista`: o dominio nao importa
 *  repositorio nem cliente de banco. */
export type EmissaoVista = {
  /**
   * O status da fatura, como texto - `emitida` | `vencida` | ... Texto e nao
   * uniao fechada pela mesma razao de `RodadaVista.status`: um valor novo no
   * banco nao pode quebrar a leitura aqui.
   */
  statusDaFatura: string;
  /** Quando a fatura foi emitida. E o relogio do `nao_pedido`, e nao ha outro:
   *  antes de existir linha de boleto, nao ha nada mais recente a contar. */
  emitidaEm: Date | null;
  /** `null` quando NINGUEM PEDIU o boleto - a linha nao existe. */
  boleto: {
    /** `pendente` | `erro`. Os outros nao entram na lista: ver o repositorio. */
    status: string;
    tentativas: number;
    /** Nasce imediatamente antes da PRIMEIRA chamada ao banco (ver
     *  `repos/boleto.ts`), entao ele e a hora da primeira tentativa. */
    criado_em: Date;
  } | null;
  agora: Date;
};

/**
 * ⚠️ `parado` VEM ANTES DE TUDO, e a precedencia e a parte pensada.
 *
 * `filaDeEmissao` aceita fatura `emitida` OU `vencida`, e `registrar()` recusa
 * tudo que nao seja `emitida` - as duas frases estao a 200 linhas uma da outra e
 * discordam. O efeito, medido em 10/09/2026: a fila pega a linha a cada 5
 * minutos, `registrar` levanta `FaturaSemBoleto` antes de tocar qualquer coluna,
 * o motor conta um falho e **nada e escrito** - nem `ultimo_erro`, nem
 * `tentativas`, nem `proxima_tentativa_em`. Sem escrita nao ha recuo: a mesma
 * linha volta na rodada seguinte, para sempre, sem nunca acumular a memoria que
 * faria a espera crescer.
 *
 * A fila deixou de aceitar `vencida` no mesmo dia - alinhada com quem escreve -,
 * e e por isso que o nivel existe: sair da fila em silencio seria trocar um laco
 * invisivel por uma ausencia invisivel. O caso agora SAI da fila e VIRA LINHA.
 */
export function nivelDaEmissao(e: EmissaoVista): NivelDaEmissao {
  const folgaMs = FOLGA_DA_EMISSAO_SEGUNDOS * 1000;
  const agoraMs = e.agora.getTime();

  /* Quem escreve o boleto exige `emitida`. Qualquer outro estado e uma linha que
   * ninguem vai tentar de novo sozinho - inclusive a que ainda esta na fila
   * porque a fila foi consertada depois dela. */
  if (e.statusDaFatura !== 'emitida') return 'parado';

  if (e.boleto === null) {
    /* Sem `emitida_em` nao da para saber ha quanto tempo, e o lado seguro e o
     * que NAO acusa: uma fatura sem carimbo e um dado estranho, e transformar
     * dado estranho em alarme treina a ignorar o alarme. */
    if (e.emitidaEm === null) return 'nao_pedido';
    return agoraMs - e.emitidaEm.getTime() > folgaMs ? 'esquecido' : 'nao_pedido';
  }

  return agoraMs - e.boleto.criado_em.getTime() > folgaMs ? 'insistindo' : 'esperando';
}

/** Os tres que precisam de gente. Existe pela mesma razao de `pedeGente`: uma
 *  lista repetida na tela e no alarme e uma lista que diverge. */
export function emissaoPedeGente(nivel: NivelDaEmissao): boolean {
  return nivel === 'esquecido' || nivel === 'insistindo' || nivel === 'parado';
}
