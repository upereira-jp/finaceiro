// O MOTOR DA AGENDA. Os dois processos periodicos do PRD 6, compostos.
//
// A FORMA E COPIADA DE `src/crm/sincronizacao.ts`, de proposito. Aquele motor ja
// resolveu este problema: porta INJETADA, transacao por item aberta por um
// `AbrirTransacao` que vem de fora, e uma linha de registro que COMMITA antes do
// trabalho para o EXCLUDE do banco valer contra uma segunda execucao concorrente.
// Duas formas diferentes para o mesmo problema dariam duas revisoes diferentes
// sobre o que acontece quando o processo morre no meio.
//
// O QUE ESTE ARQUIVO NAO FAZ, e a lista importa:
//
//   nao agenda        nao ha `cron` nem `setInterval` aqui dentro. O PRD 3 diz
//                     que "agendamento de jobs segue a escolha do host", e a
//                     escolha do host nao foi feita. Inventar um agendador seria
//                     decidir por quem decide (regra 10). O que existe e uma
//                     funcao que roda uma vez; quem a chama de hora em hora e o
//                     systemd timer, o cron do VPS ou uma pessoa.
//
//   nao liquida       a baixa e de `repos/liquidacao.baixar()`, que e o unico
//                     gatilho do split. Um segundo caminho de baixa dentro da
//                     agenda seria um segundo lugar onde dinheiro se reparte.
//
//   nao desiste       nao ha teto de tentativas. Ver `src/dominio/agenda.ts`.
//
// POR QUE UMA TRANSACAO POR ITEM, e nao uma pela rodada: uma rodada de 200
// boletos numa transacao so segura conexao do pool transacional por minutos - e o
// pool tem teto 8 (`src/db/pools.ts`). E, pior, um item que falhasse no fim
// desfaria o registro dos 199 anteriores, que ja subiram ao banco de verdade. O
// que aconteceu no mundo nao se desfaz por ROLLBACK.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { ehSqlstate, SQLSTATE } from '../db/sqlstate.ts';
import * as boletos from '../repos/boleto.ts';
import * as liquidacoes from '../repos/liquidacao.ts';
import { CobrancaNaoConfigurada, type PortaDeCobranca } from '../sicoob/porta.ts';
import { decidir, nivelDoCertificado, POLITICA, type Politica } from '../dominio/agenda.ts';

/** Igual ao `AbrirLote` do conector: o motor nao sabe montar contexto de tenant,
 *  e quem monta e `app.withTenant` - o mesmo caminho de qualquer requisicao. */
export type AbrirTransacao = <T>(trabalho: () => Promise<T>) => Promise<T>;

export type Tarefa = 'fila_de_emissao' | 'consulta_ativa';

export type Ocorrencia = { boleto_id: string; fatura_id: string; sinal: string };

export type ResultadoDaAgenda = {
  tarefa: Tarefa;
  ciclo_id: string;
  status: 'ok' | 'parcial' | 'erro';
  examinados: number;
  registrados: number;
  falhos: number;
  liquidados: number;
  /** Baixas que o banco CONFIRMOU nesta rodada, e cujo split rodou agora. Nao
   *  soma com `liquidados`: aquele conta baixa nova, este conta reparticao - e
   *  desde 08/09/2026 as duas coisas acontecem em dias diferentes quando o
   *  webhook chega primeiro. Vive so no resultado e no `detalhe`: coluna nova em
   *  `agenda_execucao` seria migration, e o numero nao vale uma. */
  confirmados: number;
  divergentes: number;
  /** O que a rodada NAO alcancou por causa do teto. Zero e um fato; e por isso
   *  que ele e impresso mesmo quando e zero. */
  deixados_para_tras: number;
  ocorrencias: Ocorrencia[];
  execucaoGravada: boolean;
};

export class AgendaJaEmAndamento extends Error {
  readonly status = 409;
  constructor(tarefa: Tarefa) {
    super(
      `Ja ha uma execucao de "${tarefa}" em andamento para este conector. O banco recusou a ` +
      'segunda pelo EXCLUDE `agenda_uma_execucao_por_tarefa` (migration 21). Duas rodadas ' +
      'simultaneas leriam os mesmos boletos e chamariam o banco duas vezes pelo mesmo titulo.'
    );
    this.name = 'AgendaJaEmAndamento';
  }
}

export class SemConectorDeCobranca extends Error {
  readonly status = 412;
  constructor() {
    super(
      'Nenhum conector de cobranca ativo neste tenant. A agenda nao tem o que fazer: sem ' +
      'conector nao ha boleto para registrar nem situacao para consultar.'
    );
    this.name = 'SemConectorDeCobranca';
  }
}

type Contexto = { tenantId: string; conectorId: string; execucaoId: string };

/**
 * Abre a linha de `agenda_execucao` EM TRANSACAO PROPRIA.
 *
 * A separacao e o mecanismo, nao arrumacao: e o COMMIT desta transacao que faz o
 * `em_andamento` existir para as outras sessoes, e so a partir dai o EXCLUDE da
 * migration 21 recusa uma segunda rodada. Numa transacao unica a linha nasceria
 * e morreria dentro dela, e "uma execucao por tarefa" seria letra morta fora de
 * um teste - foi a licao da migration 14, §7 da SPEC-002.
 */
async function abrir(tarefa: Tarefa, cicloId: string): Promise<Contexto> {
  await exigir('administrar');
  const db = dbt();
  const tenantId = tenantCorrente();

  const conector = await db.conector_cobranca.findFirst({ where: { ativo: true } });
  if (!conector) throw new SemConectorDeCobranca();

  const execucaoId = crypto.randomUUID();
  try {
    await db.agenda_execucao.create({
      data: { id: execucaoId, tenant_id: tenantId, conector_id: conector.id, tarefa, ciclo_id: cicloId },
    });
  } catch (e: any) {
    // 23P01 do EXCLUDE. Traduzir aqui e o que impede isso de virar 500 - e o
    // codigo mora em `meta.driverAdapterError.cause.code`, nao em `e.code`. Ver
    // `src/db/sqlstate.ts`, que existe por causa desta linha.
    if (ehSqlstate(e, SQLSTATE.violacaoDeExclusao)) throw new AgendaJaEmAndamento(tarefa);
    throw e;
  }
  return { tenantId, conectorId: conector.id, execucaoId };
}

async function fechar(c: Contexto, r: ResultadoDaAgenda, detalhe: Record<string, unknown>) {
  const n = await dbt().agenda_execucao.updateMany({
    where: { tenant_id: c.tenantId, id: c.execucaoId },
    data: {
      terminado_em: new Date(),
      status: r.status,
      examinados: r.examinados,
      registrados: r.registrados,
      falhos: r.falhos,
      liquidados: r.liquidados,
      divergentes: r.divergentes,
      detalhe: detalhe as any,
    },
  });
  r.execucaoGravada = n.count > 0;
}

const vazio = (tarefa: Tarefa, cicloId: string): ResultadoDaAgenda => ({
  tarefa, ciclo_id: cicloId, status: 'ok',
  examinados: 0, registrados: 0, falhos: 0, liquidados: 0, confirmados: 0, divergentes: 0,
  deixados_para_tras: 0, ocorrencias: [], execucaoGravada: false,
});

/** `parcial` quando a rodada terminou com trabalho que nao passou. Nao e `erro`:
 *  a rodada CONCLUIU e registrou o motivo de cada um - a mesma distincao que o
 *  conector do CRM precisou fazer em 27/07. */
const concluir = (r: ResultadoDaAgenda) => {
  r.status = r.falhos > 0 || r.divergentes > 0 ? 'parcial' : 'ok';
};

// ============================================================================
// 1. A FILA DE EMISSAO
// ============================================================================

export async function executarFilaDeEmissao(
  cobranca: PortaDeCobranca,
  transacao: AbrirTransacao,
  opcoes: { agora?: Date; politica?: Politica } = {},
): Promise<ResultadoDaAgenda> {
  const agora = opcoes.agora ?? new Date();
  const p = opcoes.politica ?? POLITICA;
  const cicloId = crypto.randomUUID();
  const r = vazio('fila_de_emissao', cicloId);

  const c = await transacao(() => abrir('fila_de_emissao', cicloId));

  try {
    const { fila, total } = await transacao(async () => ({
      fila: await boletos.filaDeEmissao(agora, p.examinadosPorRodada),
      total: await boletos.tamanhoDaFila(agora),
    }));
    r.examinados = fila.length;
    r.deixados_para_tras = Math.max(0, total - fila.length);

    for (const item of fila) {
      /*
       * UMA TRANSACAO POR BOLETO. `registrar` grava a falha e COMMITA - ver o
       * comentario de `ResultadoDoRegistro` -, entao envolver a rodada inteira
       * numa transacao so desfaria justamente a memoria que a fila precisa ter.
       */
      try {
        const resultado = await transacao(() => boletos.registrar(item.fatura_id, cobranca));
        if (resultado.registrado) {
          r.registrados += 1;
        } else {
          r.falhos += 1;
          r.ocorrencias.push({ boleto_id: item.boleto_id, fatura_id: item.fatura_id, sinal: resultado.erro });
        }
      } catch (err: any) {
        /*
         * Falta de credencial ABORTA A RODADA, e nao vira 200 falhas. Retentar
         * 199 boletos contra um cofre que nao responde gasta 199 chamadas para
         * descobrir o que a primeira ja disse, e encheria a fila de itens cuja
         * unica cura e cadastrar a credencial. Mesma distincao que
         * `repos/boleto.ts` faz ao deixar `CobrancaNaoConfigurada` subir.
         */
        if (err instanceof CobrancaNaoConfigurada) {
          r.status = 'erro';
          await transacao(() => fechar(c, r, { erro: err.message, abortou_em: item.boleto_id }));
          return r;
        }
        if (err instanceof TypeError || err instanceof RangeError) throw err;
        r.falhos += 1;
        r.ocorrencias.push({
          boleto_id: item.boleto_id, fatura_id: item.fatura_id,
          sinal: String(err?.message ?? err),
        });
      }
    }

    concluir(r);
    await transacao(() => fechar(c, r, {
      deixados_para_tras: r.deixados_para_tras,
      politica: { baseSegundos: p.baseSegundos, tetoSegundos: p.tetoSegundos },
      ocorrencias: r.ocorrencias,
    }));
    return r;
  } catch (e: any) {
    r.status = 'erro';
    await transacao(() => fechar(c, r, { erro: String(e?.message ?? e) })).catch(() => {});
    throw e;
  }
}

// ============================================================================
// 2. A CONSULTA ATIVA
// ============================================================================

/**
 * PRD 6: "consulta ativa diaria dos boletos em aberto para capturar liquidacoes
 * cujo webhook falhou".
 *
 * O QUE ACONTECE QUANDO OS DOIS CANAIS TRAZEM O MESMO EVENTO, que e o caso
 * normal e nao a borda: o webhook baixou de manha, a consulta ativa acha o mesmo
 * boleto liquidado a noite, e a baixa e recusada com `FaturaNaoLiquidavel`
 * porque a fatura ja esta `paga`.
 *
 * ⚠️ 08/09/2026 - ESSA RECUSA VIROU O CAMINHO PRINCIPAL, e ate hoje ela era o
 * fim do caminho. O comentario anterior dizia que a recusa "e a prova de que o
 * outro canal funcionou" e que nao ha nada a fazer. Isso valia enquanto o
 * webhook fosse a liquidacao; a Sicoob respondeu que ele e INTENCAO de
 * pagamento, entao o webhook baixou e NAO repartiu. Quem prova que o dinheiro
 * entrou e esta consulta, que acabou de ler `liquidado` no proprio banco - e por
 * isso a recusa passou a disparar `confirmarLiquidacao`, que e onde o split roda
 * agora. Ver `Q-BAIXAOPER-01` e o cabecalho de `src/repos/liquidacao.ts`.
 */
export async function executarConsultaAtiva(
  cobranca: PortaDeCobranca,
  transacao: AbrirTransacao,
  opcoes: { politica?: Politica } = {},
): Promise<ResultadoDaAgenda> {
  const p = opcoes.politica ?? POLITICA;
  const cicloId = crypto.randomUUID();
  const r = vazio('consulta_ativa', cicloId);

  const c = await transacao(() => abrir('consulta_ativa', cicloId));

  try {
    const { abertos, credencialRef, total } = await transacao(async () => {
      const conector = await dbt().conector_cobranca.findFirst({ where: { ativo: true } });
      if (!conector) throw new SemConectorDeCobranca();
      return {
        abertos: await boletos.emAberto(p.examinadosPorRodada),
        credencialRef: conector.credencial_ref,
        /* O UNIVERSO, para a rodada poder dizer que truncou. A fila de emissao
         * ja fazia isso desde sempre; a consulta ativa reportava `0` sempre. */
        total: await boletos.tamanhoDosEmAberto(),
      };
    });
    r.examinados = abertos.length;
    r.deixados_para_tras = Math.max(0, total - abertos.length);

    for (const b of abertos) {
      const nossoNumero = b.nosso_numero!;
      try {
        // A CHAMADA FICA FORA DE TRANSACAO. Segurar uma conexao do pool
        // transacional durante a viagem ate a Sicoob e o caminho para o P2028
        // em maxWait com a carteira crescendo - o teto do pool e 8.
        const situacao = await cobranca.consultar(credencialRef, nossoNumero);

        /*
         * A CONFIRMACAO VEM ANTES DA DECISAO, e a ordem aqui e o mecanismo - nao
         * arrumacao.
         *
         * `decidir()` so sabe transformar `liquidado` em BAIXA, e para isso exige
         * data e valor. A `Q-LIQUIDACAO-CONSULTA-01` mediu que o `GET /boletos`
         * da Sicoob NAO devolve nenhum dos dois: devolve `situacaoBoleto`. Entao
         * um titulo que o webhook ja baixou de manha chega aqui como `liquidado`
         * sem data e sem valor, e `decidir()` responde DIVERGENCIA - a resposta
         * certa para "baixar sem saber o valor", e a errada para o que este caso
         * e de verdade.
         *
         * Porque aqui nao falta nada: a baixa ja existe, com o valor que o
         * webhook trouxe. O que a consulta acrescenta e a UNICA coisa que
         * faltava - o banco dizendo `liquidado`, que e a confirmacao que o split
         * espera desde 08/09/2026.
         *
         * Sem esta guarda o efeito seria pior que perder a confirmacao: o titulo
         * fica `registrado` ate confirmar, entao ele voltaria a esta fila TODO
         * DIA, gerando uma divergencia nova a cada rodada, para sempre.
         */
        if (situacao.situacao === 'liquidado') {
          const l = await transacao(() => liquidacoes.porFatura(b.fatura_id));
          if (l) {
            const c = await transacao(() => liquidacoes.confirmarLiquidacao(l.id));
            if (!c.ja_confirmada && c.split) r.confirmados += 1;
            if (c.split_bloqueado) {
              r.divergentes += 1;
              r.ocorrencias.push({ boleto_id: b.id, fatura_id: b.fatura_id, sinal: c.split_bloqueado });
            }
            continue;
          }
        }

        const decisao = decidir(situacao);

        switch (decisao.acao) {
          case 'nada':
            break;

          case 'marcar_baixado':
            await transacao(() => boletos.marcarBaixadoNoBanco(b.id, decisao.motivo));
            break;

          case 'divergencia':
            r.divergentes += 1;
            r.ocorrencias.push({ boleto_id: b.id, fatura_id: b.fatura_id, sinal: decisao.motivo });
            await transacao(() => boletos.registrarDivergencia(b.id, decisao.motivo));
            break;

          case 'baixar': {
            try {
              const baixa = await transacao(() => liquidacoes.baixar({
                fatura_id: b.fatura_id,
                data_liquidacao: decisao.dataLiquidacao,
                valor_liquidado_centavos: decisao.valorCentavos,
                juros_centavos: situacao.jurosCentavos,
                multa_centavos: situacao.multaCentavos,
                origem: 'conciliacao',
                id_externo: situacao.idExterno ?? decisao.chave,
                observacao: 'consulta ativa (PRD §6)',
              }));
              if (!baixa.ja_existia) r.liquidados += 1;
              /* Nao ha ramo de "aguardando" aqui: `origem: conciliacao` E
               * confirmacao - o `situacaoBoleto` veio do proprio banco -, entao
               * `baixar()` ja repartiu. Ver `ehConfirmacao`. */
              if (baixa.split_bloqueado) {
                // A baixa VALEU e o dinheiro entrou; o que nao rodou foi o
                // repasse (R12, usina sem dono). Divergencia, nao falha.
                r.divergentes += 1;
                r.ocorrencias.push({ boleto_id: b.id, fatura_id: b.fatura_id, sinal: baixa.split_bloqueado });
              }
            } catch (err: any) {
              if (err instanceof liquidacoes.FaturaNaoLiquidavel) {
                /* A fatura ja esta `paga` e a liquidacao dela nao foi achada pela
                 * guarda de confirmacao la em cima - entao nao ha o que confirmar
                 * nem o que baixar. Continua sendo o fim do caminho, e continua
                 * nao sendo falha. O caso do webhook-que-chegou-antes NAO passa
                 * mais por aqui: ele e resolvido antes de `decidir()`. */
                break;
              }
              if (err instanceof liquidacoes.ValorNaoConfere) {
                r.divergentes += 1;
                r.ocorrencias.push({ boleto_id: b.id, fatura_id: b.fatura_id, sinal: err.message });
                await transacao(() => boletos.registrarDivergencia(b.id, err.message));
                break;
              }
              throw err;
            }
            break;
          }
        }
      } catch (err: any) {
        if (err instanceof CobrancaNaoConfigurada) {
          r.status = 'erro';
          await transacao(() => fechar(c, r, { erro: err.message, abortou_em: b.id }));
          return r;
        }
        if (err instanceof TypeError || err instanceof RangeError) throw err;
        r.falhos += 1;
        r.ocorrencias.push({ boleto_id: b.id, fatura_id: b.fatura_id, sinal: String(err?.message ?? err) });
      }
    }

    concluir(r);
    await transacao(() => fechar(c, r, { ocorrencias: r.ocorrencias, confirmados: r.confirmados }));
    return r;
  } catch (e: any) {
    r.status = 'erro';
    await transacao(() => fechar(c, r, { erro: String(e?.message ?? e) })).catch(() => {});
    throw e;
  }
}

// ============================================================================
// 3. O ALERTA DO CERTIFICADO
// ============================================================================

/**
 * PRD 6, ultima linha. Nao e uma tarefa periodica propria: sai junto com as
 * duas, porque o sintoma que ele previne - "a emissao para sem erro obvio" - e
 * exatamente o que a fila de emissao encontraria como falha sem causa nomeada.
 */
export async function conferirCertificado(p: Politica = POLITICA) {
  const { dias, expira_em } = await boletos.certificadoVenceEm();
  return { nivel: nivelDoCertificado(dias, p), dias, expira_em };
}
