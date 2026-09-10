// A COMPOSICAO da agenda de cobranca. Roda UMA VEZ e sai.
//
// USO
//   npm run agenda -- --fila     --ensaio  --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --fila     --valendo --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --consulta --valendo --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --certificado --auth-user <uuid>      (so le, nao escreve)
//   npm run agenda -- --webhook     --auth-user <uuid>      (so le, nao escreve)
//   npm run agenda -- --saude       --auth-user <uuid>      (so le; SAI COM CODIGO)
//
// POR QUE ELE RODA UMA VEZ E SAI, em vez de ficar de pe com um `setInterval`.
//
// O PRD §3 diz que "agendamento de jobs (webhook Sicoob, retries, reconciliacao,
// sync do CRM) segue a escolha do host", e lista Vercel-com-cron contra
// VPS-com-PM2 numa tabela de trade-off SEM decidir. A decisao nao foi tomada, e
// pela regra 10 lacuna nao vira default escolhido por quem implementa. Um
// processo residente escolheria por todo mundo: ele teria que ser supervisionado,
// reiniciado, e teria a propria nocao de horario.
//
// Rodando uma vez e saindo, quem agenda e o host - systemd timer, cron do VPS,
// ou uma pessoa digitando. O codigo fica igual nos tres, e a escolha continua
// sendo de quem tem que fazer.
//
// QUEM AGENDA, DESDE 28/08/2026: o systemd desta VPS. O dono escolheu o host, que
// era a lacuna aberta - as tres unidades estao em `deploy/` e o README de la diz
// a cadencia de cada uma e por que. Este arquivo continua sem agendador dentro.
//
// `--ensaio` e `--valendo` sao OBRIGATORIOS para as duas tarefas que escrevem,
// pelo mesmo motivo do ciclo do CRM e do bootstrap: um processo periodico que
// grava porque alguem esqueceu uma flag e o modo de falha errado. No ensaio a
// PORTA E CHAMADA DE VERDADE - o boleto sobe ao banco, a consulta pergunta - e
// nada e gravado do nosso lado. Isso e honesto e e preciso saber: contra a
// Sicoob de verdade, `--fila --ensaio` REGISTRA boletos la e da ROLLBACK aqui,
// deixando os dois lados divergentes. Use ensaio contra o adaptador falso, ou
// contra o sandbox.

import { iniciar, encerrarApp } from '../src/app.ts';
import {
  executarFilaDeEmissao, executarConsultaAtiva, conferirCertificado,
  conferirAvisoDePagamento, alertaDoAviso,
  SemConectorDeCobranca,
  type AbrirTransacao, type ResultadoDaAgenda,
} from '../src/cobranca/agenda.ts';
import { credencialDeCobranca } from '../src/repos/boleto.ts';
import { comoVaoAsAutomacoes, type Automacao } from '../src/repos/automacoes.ts';
import { POLITICA, saudeDoCaminhoDoDinheiro, pedeGente } from '../src/dominio/agenda.ts';
/* O endereco que este sistema atende, para conferir contra o que o banco tem
 * cadastrado. Mesma funcao que a rota de religar usa para CADASTRAR. */
import { urlDoWebhook } from '../src/sicoob/webhook.ts';
import { tenantCorrente } from '../src/db/contexto.ts';

/**
 * A FRASE DE UMA RODADA PARADA - para o journal e para a ultima linha do
 * `systemctl status`.
 *
 * ⚠️ SO A FILA E A CONSULTA ENTRAM NO CODIGO DE SAIDA. O ciclo do CRM tambem
 * para em silencio e a tela de Pendencias o mostra, mas o espelho velho atrasa
 * CADASTRO e nao dinheiro - por uma unidade chamada "saude do caminho do
 * dinheiro" ficar vermelha por causa dele, o vermelho passaria a querer dizer
 * duas coisas. Ver o comentario de `saudeDoCaminhoDoDinheiro`.
 *
 * AS PALAVRAS SAO AS DA TELA, na medida do possivel: quem le o journal depois de
 * ver a faixa em Pendencias tem de reconhecer o mesmo texto. Mesma razao de
 * `alertaDoAviso` existir.
 */
const NOME_DA_RODADA: Record<string, string> = {
  consulta_ativa: 'a conferencia de pagamentos no banco (consulta ativa)',
  fila_de_emissao: 'o envio de boletos ao banco (fila de emissao)',
  ciclo_do_crm: 'a leitura do outro sistema (ciclo do CRM)',
};

const horas = (s: number | null) => (s === null ? '?' : `${Math.round(s / 3600)} h`);

function fraseDaRodadaParada(a: Automacao): string {
  const nome = NOME_DA_RODADA[a.chave] ?? a.chave;
  switch (a.nivel) {
    case 'nunca_rodou': return `${nome} NUNCA rodou`;
    case 'travada':     return `${nome} TRAVOU numa rodada aberta ha ${horas(a.ha_quanto_tempo_segundos)} - `
                              + 'enquanto ela nao for encerrada, nenhuma nova acontece';
    case 'atrasada':    return `${nome} nao roda ha ${horas(a.ha_quanto_tempo_segundos)}`;
    default:            return `${nome}: ${a.nivel}`;
  }
}

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

function imprimir(r: ResultadoDaAgenda): void {
  console.log('--- resultado ---');
  console.log(`  tarefa ............... ${r.tarefa}`);
  console.log(`  status ............... ${r.status}`);
  console.log(`  examinados ........... ${r.examinados}`);
  if (r.tarefa === 'fila_de_emissao') {
    console.log(`  registrados .......... ${r.registrados}`);
    console.log(`  falhos ............... ${r.falhos}`);
  } else {
    console.log(`  liquidados ........... ${r.liquidados}`);
    console.log(`  falhos ............... ${r.falhos}`);
  }
  console.log(`  divergentes .......... ${r.divergentes}`);
  /*
   * IMPRESSO SEMPRE, inclusive em zero. Uma rodada que cobre 200 de 1.400 e uma
   * rodada que cobre tudo tem a mesma cara sem esta linha, e "cobri tudo" e a
   * conclusao que alguem tiraria. Teto silencioso e o que o RESUMO-SESSAO-15
   * chama de truncar calado.
   */
  console.log(`  deixados para tras ... ${r.deixados_para_tras}` +
              (r.deixados_para_tras > 0 ? '  <- saem na proxima rodada' : ''));
  if (r.ocorrencias.length > 0) {
    console.log('  ocorrencias (nao interrompem a rodada, e alguem precisa olhar):');
    for (const o of r.ocorrencias) console.log(`    boleto ${o.boleto_id}: ${o.sinal}`);
  }
  if (!r.execucaoGravada) {
    console.error('  ATENCAO: o fechamento nao encontrou a linha de agenda_execucao.');
    console.error('  Em modo valendo isso e defeito - o registro da rodada nao existe,');
    console.error('  e "a agenda nao roda desde o dia 3" volta a ser impossivel de perguntar.');
  }
}

async function main(): Promise<void> {
  const fila = tem('fila'), consulta = tem('consulta'), certificado = tem('certificado');
  const webhook = tem('webhook'), saude = tem('saude');
  const quantas = [fila, consulta, certificado, webhook, saude].filter(Boolean).length;
  if (quantas !== 1) {
    console.error('ERRO: informe UMA tarefa: --fila, --consulta, --certificado, --webhook ou --saude.');
    console.error('  --fila        retenta os boletos que falharam no registro (PRD §6)');
    console.error('  --consulta    pergunta ao banco a situacao dos boletos em aberto (PRD §6)');
    console.error('  --certificado so le a data de expiracao do A1 e classifica');
    console.error('  --webhook     so pergunta ao banco se o aviso de pagamento ainda esta ligado');
    console.error('  --saude       os dois acima juntos MAIS as rodadas terem acontecido, e SAI COM');
    console.error('                CODIGO: 0 de pe, 3 sem conector, 4 precisa de acao humana,');
    console.error('                5 nao deu para perguntar');
    process.exit(2);
  }

  const authUserId = arg('auth-user');
  if (!authUserId) {
    console.error('ERRO: --auth-user <uuid> e obrigatorio (o `sub` do JWT do Supabase Auth).');
    console.error('A agenda roda DENTRO de contexto de tenant: nao ha caminho privilegiado,');
    console.error('e excecao de isolamento e ausencia de isolamento.');
    process.exit(2);
  }
  const tenantProposto = arg('tenant');

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`\n${sessao.nome} <${sessao.email}>, tenants=${sessao.tenants.map((t) => t.papel).join(',') || '(nenhum)'}`);

  // ---------------------------------------------------------- so leitura
  if (certificado) {
    const c = await a.withTenant(sessao, tenantProposto, () => conferirCertificado()) as any;
    console.log('\n--- certificado A1 (PRD §6, ultima linha) ---');
    console.log(`  nivel ...... ${c.nivel}`);
    console.log(`  expira em .. ${c.expira_em ? c.expira_em.toISOString().slice(0, 10) : '(nao cadastrado)'}`);
    console.log(`  dias ....... ${c.dias ?? '—'}`);
    if (c.nivel === 'vencido') {
      console.error('\n  O A1 ESTA VENCIDO. "Vencido, a emissao para sem erro obvio" (PRD §6).');
    } else if (c.nivel === 'vence_em_breve') {
      console.log(`\n  Vence dentro de ${POLITICA.diasDeAvisoDoCertificado} dias. Renovar A1 tem processo, nao e um clique.`);
    } else if (c.nivel === 'sem_certificado') {
      console.log('\n  Sem data cadastrada: o sistema NAO sabe se ha problema, e por isso');
      console.log('  nao diz que esta ok. Ver Q-SICOOB-01.');
    }
    await encerrarApp();
    return;
  }

  if (webhook) {
    const c = await a.withTenant(sessao, tenantProposto, async () => {
      const conector = await credencialDeCobranca();
      if (!conector) return null;
      return conferirAvisoDePagamento(a.cobranca, conector.credencial_ref, urlDoWebhook(tenantCorrente()));
    }) as any;

    console.log('\n--- aviso de pagamento (o webhook de liquidacao) ---');
    if (!c) {
      console.log('  nao ha conector de cobranca cadastrado neste tenant.');
      await encerrarApp();
      return;
    }
    console.log(`  nivel ...... ${c.nivel}`);
    for (const w of c.avisos) {
      console.log(`  ${w.inativado_em ? '☠️ INATIVO' : '✅ ativo  '}  id ${w.id}  ${w.url ?? '(sem url)'}`);
    }
    for (const l of alertaDoAviso(c)) console.log(`\n  ${l}`);
    /* Sai 0 mesmo desligado, como o `--certificado` sai 0 mesmo vencido. E um
     * RELATORIO que alguem pediu, e nao uma guarda: quem pergunta esta olhando a
     * resposta. Quem precisa de alarme e a rodada periodica, e la o alerta sai
     * junto do trabalho, abaixo. */
    await encerrarApp();
    return;
  }

  /*
   * ======================================================================
   * --saude: OS DOIS ALERTAS E AS DUAS RODADAS, E O UNICO QUE SAI COM CODIGO
   * ======================================================================
   *
   * ⚠️ AS RODADAS ENTRARAM EM 10/09/2026, e a falta estava escrita: a retomada
   * daquele dia registrou que esta unidade *"afirma sobre o A1 e o aviso, nao
   * sobre a rodada ter acontecido"* - e a rodada que nao acontece e a mais
   * silenciosa das tres coisas, porque nao produz erro, nem log, nem linha.
   * Agora a afirmacao e completa: o A1 esta valido, o banco avisa quando ha
   * pagamento, E o sistema esta indo buscar.
   *
   * ELE E O CANAL, e ate 09/09/2026 nao havia canal nenhum. Os dois alertas
   * desta agenda chegavam ao journal e a uma tela, e NENHUM DOS DOIS PROCURA
   * NINGUEM - o `deploy/README` chama `systemctl list-units --failed` de "a
   * unica superficie de alarme desta maquina", e nenhum deles aparecia la. O
   * comentario do proprio `financeiro-agenda-certificado.service` registrava a
   * falta desde 28/08: *"nao notifica ninguem. O aviso cai no journal"*.
   *
   * POR QUE UMA TAREFA SEPARADA, E NAO O CODIGO DE SAIDA DAS OUTRAS. Por a
   * consulta em `failed` porque o WEBHOOK morreu mentiria sobre qual coisa
   * quebrou: a consulta funcionou. Foi essa objecao - correta - que manteve o
   * alerta fora do alarme. Uma unidade cujo trabalho INTEIRO e afirmar que o
   * caminho do dinheiro esta de pe nao tem esse problema: quando ela fica
   * vermelha, o que falhou e exatamente a afirmacao que ela faz.
   *
   * NAO E TIMER NOVO. Ela SUBSTITUI a `financeiro-agenda-certificado`, que ja
   * rodava diaria e so olhava metade do problema - ver `deploy/README.md`.
   *
   * A CADENCIA CONTINUA SENDO A DO §2: uma vez por dia. Este e o mesmo
   * diagnostico que nao pode morar na fila de 5 minutos, e ele nao mora.
   */
  if (saude) {
    const e = await a.withTenant(sessao, tenantProposto, async () => {
      const conector = await credencialDeCobranca();
      if (!conector) return null;
      const [cert, aviso] = [
        await conferirCertificado(),
        await conferirAvisoDePagamento(a.cobranca, conector.credencial_ref, urlDoWebhook(tenantCorrente())),
      ];
      return { cert, aviso };
    }) as any;

    /*
     * AS RODADAS, E ELAS SAO LEITURA DO NOSSO BANCO - nao discam a Sicoob.
     *
     * ⚠️ TRANSACAO SEPARADA da de cima, e de proposito: se a Sicoob estiver fora
     * do ar, `conferirAvisoDePagamento` ja resolveu isso devolvendo
     * `nao_verificavel` - mas qualquer surpresa naquele bloco nao pode levar
     * junto a unica pergunta desta unidade que NAO depende de rede. "Nao deu
     * para falar com o banco" e "a consulta ativa parou ha 4 dias" sao
     * independentes, e a segunda e a mais grave das duas.
     */
    const rodadas: Automacao[] = await a.withTenant(sessao, tenantProposto,
      async () => comoVaoAsAutomacoes()) as any;
    const paradas = rodadas
      .filter((r) => r.chave !== 'ciclo_do_crm' && pedeGente(r.nivel))
      .map(fraseDaRodadaParada);

    const veredito = saudeDoCaminhoDoDinheiro({
      certificado: e ? e.cert.nivel : null,
      aviso: e ? e.aviso.nivel : null,
      rodadasParadas: paradas,
    });

    console.log('\n--- saude do caminho do dinheiro ---');
    if (e) {
      console.log(`  certificado A1 ....... ${e.cert.nivel}` +
                  (e.cert.dias === null ? '' : ` (${e.cert.dias} dia(s))`));
      console.log(`  aviso de pagamento ... ${e.aviso.nivel}`);
    }
    /* AS TRES SAO IMPRESSAS SEMPRE, inclusive as que estao em dia - e o mesmo
     * motivo do painel no rodape da tela: a rodada que nao aconteceu nao produz
     * linha nenhuma, entao um journal silencioso sobre elas tem a mesma cara de
     * um journal que diz que esta tudo bem. */
    for (const r of rodadas) {
      const q = r.ha_quanto_tempo_segundos === null ? 'nunca' : `ha ${horas(r.ha_quanto_tempo_segundos)}`;
      console.log(`  ${r.chave.padEnd(16)} ... ${String(r.nivel).padEnd(13)} (ultima: ${q})`);
    }

    /* AS FRASES SAO AS MESMAS DA TELA E DO `--webhook`, e de proposito: quem le
     * o journal depois de ver a faixa na tela precisa reconhecer o mesmo texto.
     * `alertaDoAviso` existe para isso. */
    if (e) for (const l of alertaDoAviso(e.aviso)) console.log(`  ${l}`);

    /* A ULTIMA LINHA E A QUE O `systemctl status` MOSTRA, entao ela carrega o
     * codigo E o resumo. Sem o codigo escrito por extenso, quem olha o status de
     * uma unidade vermelha ve "exit-code" e um numero sem dicionario. */
    console.log(`\n  => ${veredito.codigo} ${
      veredito.codigo === 0 ? 'DE PE' : veredito.codigo === 3 ? 'SEM CONECTOR (nao e falha)'
      : veredito.codigo === 4 ? 'PRECISA DE ACAO HUMANA' : 'NAO DEU PARA PERGUNTAR'
    }: ${veredito.resumo}`);
    if (veredito.codigo === 4 || veredito.codigo === 5) {
      console.error(`  Esta unidade fica em \`systemctl list-units --failed\` ate a proxima rodada`);
      console.error('  diaria encontrar tudo de pe. Ela nao interrompe nada: a fila continua');
      console.error('  emitindo e a consulta continua baixando.');
    }

    await encerrarApp();
    process.exit(veredito.codigo);
  }

  // ---------------------------------------------------------- as que escrevem
  const ensaio = tem('ensaio'), valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }
  console.log(`== modo: ${ensaio ? 'ENSAIO (ROLLBACK por transacao)' : 'VALENDO (COMMIT)'} ==`);
  if (ensaio) {
    console.log('   ATENCAO: no ensaio a PORTA e chamada de verdade. Contra a Sicoob real,');
    console.log('   isso registra boleto LA e da rollback AQUI - os dois lados divergem.');
    console.log('   Ensaio serve contra o adaptador falso ou contra o sandbox.\n');
  }

  const valendoTx: AbrirTransacao = (trabalho) => a.withTenant(sessao, tenantProposto, () => trabalho()) as any;
  const ensaioTx: AbrirTransacao = async (trabalho) => {
    try {
      return await a.withTenant(sessao, tenantProposto, async () => {
        throw new RollbackDoEnsaio(await trabalho());
      }) as any;
    } catch (e) {
      if (e instanceof RollbackDoEnsaio) return e.valor as any;
      throw e;
    }
  };
  const tx = ensaio ? ensaioTx : valendoTx;

  // O certificado sai junto das duas: o sintoma de um A1 vencido e a fila
  // enchendo de falhas sem causa nomeada, e nomear a causa aqui e barato.
  const cert = await a.withTenant(sessao, tenantProposto, () => conferirCertificado()) as any;
  if (cert.nivel === 'vencido' || cert.nivel === 'vence_em_breve') {
    console.log(`\n  certificado A1: ${cert.nivel} (${cert.dias} dia(s))\n`);
  }

  /*
   * O AVISO DE PAGAMENTO SAI JUNTO PELO MESMO ARGUMENTO DO CERTIFICADO, uma
   * camada adiante. O A1 vencido para a emissao sem erro obvio; o aviso
   * desligado para a BAIXA sem erro obvio - e a Sicoob desliga sozinha quando a
   * entrega falha. Do nosso lado nao chega sinal nenhum: "nenhuma notificacao" e
   * indistinguivel de "ninguem pagou".
   *
   * ⚠️ SO NA CONSULTA, E NAO NA FILA - e a diferenca e de CADENCIA, medida e nao
   * suposta. `financeiro-agenda-fila.timer` e `OnCalendar=*:02/5`: a cada CINCO
   * MINUTOS. A primeira versao disto pendurou o diagnostico no caminho comum das
   * duas tarefas e teria discado a Sicoob 288 vezes por dia - com handshake mTLS
   * e pedido de token a cada uma, porque o script roda uma vez e sai e o cache de
   * token morre com o processo - para observar um estado que muda talvez uma vez
   * por ano.
   *
   * A ASSIMETRIA COM O CERTIFICADO E O QUE JUSTIFICA: o A1 sai nas DUAS porque
   * ele quebra a EMISSAO, que e o trabalho da fila. O aviso de pagamento nao tem
   * efeito nenhum sobre emitir - ele quebra a BAIXA. Alertar a fila sobre ele
   * seria avisar quem nao pode fazer nada a respeito, 288 vezes por dia.
   *
   * E A CONSULTA E QUEM MAIS PRECISA SABER: ela EXISTE para compensar webhook
   * perdido (PRD §6). Quando o aviso cai, ela deixa de ser rede de seguranca e
   * passa a ser a unica fonte de baixa - o dinheiro nao se perde, ele atrasa ate
   * a proxima rodada diaria. Quem opera tem direito de saber que trocou de
   * regime. A cadencia dela, uma vez por dia, e a mesma do atraso que ela impoe.
   *
   * NAO INTERROMPE E NAO MUDA O CODIGO DE SAIDA. Ver `conferirAvisoDePagamento`.
   */
  if (consulta) {
    const aviso = await a.withTenant(sessao, tenantProposto, async () => {
      const conector = await credencialDeCobranca();
      return conector
        ? conferirAvisoDePagamento(a.cobranca, conector.credencial_ref, urlDoWebhook(tenantCorrente()))
        : null;
    }) as any;
    if (aviso && aviso.nivel !== 'ativo') {
      console.log('');
      for (const l of alertaDoAviso(aviso)) console.log(`  ${l}`);
      console.log('');
    }
  }

  let r: ResultadoDaAgenda;
  try {
    r = fila
      ? await executarFilaDeEmissao(a.cobranca, tx)
      : await executarConsultaAtiva(a.cobranca, tx);
  } catch (e: any) {
    /*
     * SEM CONECTOR ATIVO NAO E FALHA DA RODADA - e ausencia de trabalho, e a
     * distincao existe por causa do systemd. Enquanto o Sicoob nao tiver
     * aplicativo, `client_id` e os tres numeros da cooperativa,
     * `conector_cobranca.ativo` e false, e `abrir()` recusa ANTES de criar a
     * linha de `agenda_execucao` ou de tocar em qualquer boleto.
     *
     * Se isso saisse como 1, os dois timers ficariam em `failed` todo dia ate o
     * Sicoob entrar - e `systemctl list-units --failed` e a unica superficie de
     * alarme desta maquina (deploy/README.md). Vermelho permanente e alarme
     * desligado: a primeira falha DE VERDADE chegaria numa lista que ja e
     * vermelha ha meses.
     *
     * Sai como 3, e o unit declara `SuccessExitStatus=3`. Um codigo proprio, e
     * nao um `|| true`, para que 1 continue significando exatamente o que
     * significava - e para que a rodada continue IMPRIMINDO o motivo.
     */
    if (e instanceof SemConectorDeCobranca) {
      console.log(`\n${e.message}`);
      console.log('Nada a fazer nesta rodada, e isso nao e defeito. Quando o conector for');
      console.log('ativado, ela passa a ter - sem tocar em unit nem em timer.');
      await encerrarApp();
      process.exit(3);
    }
    console.error('\nA AGENDA FALHOU:', e?.message ?? e);
    console.error('\nA linha de agenda_execucao foi fechada com o que ja havia sido feito.');
    console.error('A proxima rodada recompoe: a fila e por estado, nao por posicao.');
    await encerrarApp();
    process.exit(1);
  }

  console.log('');
  imprimir(r);

  if (ensaio) {
    console.log('\n== ROLLBACK por transacao (--ensaio). Nada foi gravado do nosso lado. ==');
  } else if (r.tarefa === 'consulta_ativa' && r.liquidados > 0) {
    console.log(`\n== COMMIT. ${r.liquidados} fatura(s) baixada(s) pela consulta ativa. ==`);
    console.log('   Cada baixa rodou o split na MESMA transacao (PRD §5.2): comissao e');
    console.log('   repasse ja estao calculados. Conferir em Relatorios.');
  } else {
    console.log('\n== COMMIT. ==');
  }

  // Silencio nao e sucesso: uma rodada que nao achou nada e uma rodada que nao
  // rodou tem a mesma saida sem esta linha.
  if (r.examinados === 0) {
    console.log(`   Nenhum boleto ${fila ? 'vencido na fila' : 'em aberto'}. A rodada aconteceu e esta em agenda_execucao.`);
  }

  await encerrarApp();
  process.exit(r.status === 'erro' ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
