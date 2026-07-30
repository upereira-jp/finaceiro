// A COMPOSICAO da agenda de cobranca. Roda UMA VEZ e sai.
//
// USO
//   npm run agenda -- --fila     --ensaio  --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --fila     --valendo --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --consulta --valendo --auth-user <uuid> [--tenant <uuid>]
//   npm run agenda -- --certificado --auth-user <uuid>      (so le, nao escreve)
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
// EXEMPLO para o VPS de hoje, e ele e sugestao e nao configuracao aplicada:
//   */15 * * * *  cd /opt/financeiro/app && npm run agenda -- --fila --valendo --auth-user ...
//   17   6 * * *  cd /opt/financeiro/app && npm run agenda -- --consulta --valendo --auth-user ...
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
  type AbrirTransacao, type ResultadoDaAgenda,
} from '../src/cobranca/agenda.ts';
import { POLITICA } from '../src/dominio/agenda.ts';

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
  const quantas = [fila, consulta, certificado].filter(Boolean).length;
  if (quantas !== 1) {
    console.error('ERRO: informe UMA tarefa: --fila, --consulta ou --certificado.');
    console.error('  --fila        retenta os boletos que falharam no registro (PRD §6)');
    console.error('  --consulta    pergunta ao banco a situacao dos boletos em aberto (PRD §6)');
    console.error('  --certificado so le a data de expiracao do A1 e classifica');
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

  let r: ResultadoDaAgenda;
  try {
    r = fila
      ? await executarFilaDeEmissao(a.cobranca, tx)
      : await executarConsultaAtiva(a.cobranca, tx);
  } catch (e: any) {
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
