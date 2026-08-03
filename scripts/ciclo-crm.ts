// A COMPOSICAO do ciclo: o unico lugar que liga pool do CRM, leitor e motor.
//
// Ate aqui as tres pecas existiam e eram testadas isoladamente, e nada as
// juntava - o mesmo buraco que a sessao 7 encontrou no financeiro (criarPools
// recebia a string por parametro e nenhum arquivo lia DATABASE_URL). Peca
// testada que ninguem consegue executar nao e sistema.
//
// USO
//   npm run ciclo -- --ensaio  --auth-user <uuid do Supabase Auth> [--tenant <uuid>]
//   npm run ciclo -- --valendo --auth-user <uuid do Supabase Auth> [--tenant <uuid>]
//
// A entrada e o `auth_user_id`, nao o usuario interno, porque este script usa o
// MESMO caminho da aplicacao: app.login() resolve a identidade e os vinculos, e
// app.withTenant() confere o tenant proposto contra a lista que o login
// devolveu. Um script que montasse contexto por fora seria um segundo caminho de
// isolamento - e a SPEC-001 §3.2 existe para nao haver um segundo.
//
// `--ensaio` e `--valendo` sao OBRIGATORIOS e nao ha default, pelo mesmo motivo
// do bootstrap: um ciclo que grava porque alguem esqueceu uma flag e o modo de
// falha errado. A leitura do CRM acontece de verdade nos dois, os contadores sao
// reais, e no ensaio nada e gravado. E como toda prova de escrita deste projeto
// rodou.
//
// O ENSAIO MUDOU DE FORMA COM A R13, e a diferenca e honesta em vez de escondida.
// Antes o ciclo inteiro era uma transacao e o ROLLBACK era um so. Agora cada LOTE
// tem transacao propria (Q-LOTE-01), entao o ensaio da ROLLBACK em cada uma - o
// que mantem a promessa ("nada e gravado") e o caminho ("o ensaio exercita
// exatamente o codigo do valendo", que era a licao da sessao 8).
//
// A consequencia esta impressa no rodape do relatorio: no ensaio nenhum lote
// enxerga o que o anterior escreveu, entao a reconciliacao so ve o que JA estava
// gravado antes do ciclo. Num banco sem espelho, `desativados` do ensaio e
// sempre 0. Nao e defeito do ensaio; e o preco de nao gravar.

import { iniciar, encerrarApp } from '../src/app.ts';
import { crmDoAmbiente, conferirRoleDeLeitura } from '../src/crm/conexao.ts';
import { criarLeitorCrm } from '../src/crm/leitura.ts';
import { executarCiclo, TAMANHO_DO_LOTE, type AbrirLote } from '../src/crm/sincronizacao.ts';

/** Sai da transacao do lote por excecao: e o unico ROLLBACK que o Prisma expoe. */
class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tem = (nome: string) => process.argv.includes(`--${nome}`);

async function main(): Promise<void> {
  const ensaio = tem('ensaio');
  const valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }
  const authUserId = arg('auth-user');
  const tenantProposto = arg('tenant');   // opcional: com um vinculo so, e inferido
  if (!authUserId) {
    console.error('ERRO: --auth-user <uuid> e obrigatorio (o `sub` do JWT do Supabase Auth).');
    console.error('O ciclo roda DENTRO de contexto de tenant (SPEC-002 R12): o conector');
    console.error('nao tem caminho privilegiado, e excecao de isolamento e ausencia de isolamento.');
    process.exit(2);
  }

  console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);

  // 1. O nosso lado. iniciar() recusa o arranque se a role tiver BYPASSRLS.
  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`financeiro: ${sessao.nome} <${sessao.email}>, tier=${sessao.tier ?? '(nenhum)'}, ` +
              `tenants=${sessao.tenants.map((t) => t.papel).join(',') || '(nenhum)'}`);

  // 2. O lado do CRM, com a guarda da regra 4 antes de qualquer leitura.
  const poolCrm = crmDoAmbiente();
  const diag = await conferirRoleDeLeitura(poolCrm);
  console.log(`CRM:        conectado como "${diag.usuario}"`);
  console.log(`            views legiveis: ${diag.viewsLegiveis.length} (${diag.viewsLegiveis.join(', ')})`);
  console.log(`            views com coluna de tenant: ${diag.viewsComColunaDeTenant.length}`);

  /*
   * NAO SILENCIAR. Privilegio de extensao concedido a PUBLIC nao derruba o
   * arranque - ver o comentario em conexao.ts -, mas some da vista se ninguem
   * imprimir. Medido no CRM em 27/07: pg_net concede arwdDxtm a PUBLIC.
   */
  if (diag.privilegiosDeInfraestrutura.length > 0) {
    console.log(`            privilegio de infraestrutura (Q-PGNET-01): ${diag.privilegiosDeInfraestrutura.join(', ')}`);
  }

  /*
   * VIEW NOVA E VIEW SUMIDA, e as duas sao gritadas porque o custo do silencio
   * ja foi pago. O dev do CRM criou `vendas_creditadas` e `rateio_situacao` em
   * 01/08/2026 e este script continuou imprimindo "views legiveis: 10" numa
   * linha que ninguem compara com nada - a lista fechada tinha oito, o conector
   * lia oito, e por dois dias o eixo do originador esteve a uma consulta de
   * distancia enquanto o projeto planejava digitacao por documento
   * (`Q-VIEWSCRED-01`). Contagem que ninguem confere nao e medicao.
   */
  if (diag.viewsNovasNoCrm.length > 0) {
    console.log(`\n  ATENCAO: o CRM expoe ${diag.viewsNovasNoCrm.length} view(s) que a lista FECHADA de`);
    console.log(`  src/crm/conexao.ts nao conhece: ${diag.viewsNovasNoCrm.join(', ')}`);
    console.log('  O conector NAO as le. Isto nao e falha - e trabalho novo disponivel, e');
    console.log('  descobrir tarde ja custou uma semana de planilha uma vez.\n');
  }
  if (diag.viewsAusentes.length > 0) {
    console.log(`\n  ATENCAO: ${diag.viewsAusentes.length} view(s) da lista fechada NAO estao legiveis:`);
    console.log(`  ${diag.viewsAusentes.join(', ')}`);
    console.log('  O contrato de integracao mudou do lado deles. O ciclo vai falhar ao');
    console.log('  consultar essas, e o erro chegaria longe da causa sem este aviso.\n');
  }

  if (diag.viewsComColunaDeTenant.length < diag.viewsLegiveis.length) {
    console.log('\n  ATENCAO: nem toda view expoe crm_tenant_id. A validacao por linha da');
    console.log('  SPEC-002 R1-b nao vai rodar nessas, e o ciclo vai registrar');
    console.log('  garantia_de_tenant_degradada. Ver Q-VIEWS-01.\n');
  }

  // 3. O crm_tenant_id vem do BANCO, nunca de argumento de linha de comando.
  //    Regra 6: os dois sao uuid, e trocar um pelo outro devolve dado de outra
  //    empresa. Quem manda e `conector_crm`, dentro do contexto do tenant.
  const conector = await a.withTenant(sessao, tenantProposto, async (tx: any) =>
    tx.conector_crm.findFirst({ select: { id: true, crm_tenant_id: true, ativo: true } }));

  if (!conector) {
    console.error('\nERRO: nenhum conector_crm para este tenant. Cadastre antes de rodar o ciclo.');
    await poolCrm.end(); await encerrarApp(); process.exit(1);
  }
  const crmTenantId = conector.crm_tenant_id;
  console.log(`conector:   crm_tenant_id ${crmTenantId}, ativo=${conector.ativo}\n`);

  const leitor = criarLeitorCrm({
    pool: poolCrm,
    crmTenantId,
    viewsComColunaDeTenant: diag.viewsComColunaDeTenant,
  });

  /*
   * 4. O ABRIDOR DE LOTE - a unica peca que este script contribui ao ciclo.
   *
   * O motor abre UMA transacao por lote (R13) e nao sabe montar contexto de
   * tenant: quem monta e `app.withTenant`, o mesmo caminho de qualquer
   * requisicao. Um script que emitisse contexto por fora seria um segundo
   * caminho de isolamento, e a SPEC-001 §3.2 existe para nao haver um segundo.
   */
  const valendoLote: AbrirLote = (trabalho) =>
    a.withTenant(sessao, tenantProposto, () => trabalho()) as any;

  const ensaioLote: AbrirLote = async (trabalho) => {
    try {
      return await a.withTenant(sessao, tenantProposto, async () => {
        throw new RollbackDoEnsaio(await trabalho());
      }) as any;
    } catch (e) {
      if (e instanceof RollbackDoEnsaio) return e.valor as any;
      throw e;
    }
  };

  let resultado: any;
  try {
    resultado = await executarCiclo(leitor, ensaio ? ensaioLote : valendoLote);
  } catch (e) {
    console.error('\nCICLO FALHOU:', e);
    console.error('\nO registro em conector_execucao foi fechado com o que ja havia sido');
    console.error('commitado por lote (SPEC-002 §7). O proximo ciclo e idempotente e recompoe.');
    await poolCrm.end(); await encerrarApp(); process.exit(1);
  }

  console.log('--- resultado ---');
  console.log(`  status ......... ${resultado.status}`);
  console.log(`  lidos .......... ${resultado.lidos}`);
  console.log(`  criados ........ ${resultado.criados}`);
  console.log(`  atualizados .... ${resultado.atualizados}`);
  console.log(`  desativados .... ${resultado.desativados}`);
  console.log(`  recusados ...... ${resultado.recusados}`);
  if (resultado.recusas?.length) {
    console.log('  recusas:');
    for (const r of resultado.recusas) console.log(`    ${r.codigo} (${r.lead_id}): ${r.motivo}`);
  }
  if (resultado.divergencias?.length) {
    // Nao muda o status e por isso PRECISA aparecer: sinal que nao interrompe
    // nada e o que mais facilmente vira silencio.
    console.log(`  divergencias (nao impedem a escrita, mas alguem precisa olhar): ${resultado.divergencias.length}`);
    for (const d of resultado.divergencias) console.log(`    ${d.entidade} ${d.chave}: ${d.sinal}`);
  }
  if (resultado.filaDeRevisao?.length) {
    console.log(`  fila de revisao humana (§4.3): ${resultado.filaDeRevisao.join(', ')}`);
  }
  console.log(`  garantia de tenant degradada: ${resultado.garantiaDeTenantDegradada}`);
  /*
   * R26. As duas linhas dizem coisas diferentes e as duas importam: a primeira e
   * se a conferencia do eixo do originador RODOU (view vazia = nao rodou, e
   * calar isso faria "zero divergencias" significar duas coisas opostas); a
   * segunda e a contagem que ate 03/08 nao existia em view nenhuma, e por isso
   * toda linha do rateio era lida como valida.
   */
  console.log(`  credito conferido (R26): ${resultado.creditoConferido}`);
  const s = resultado.situacaoDoRateio;
  console.log(`  situacao do rateio nas UCs espelhadas: ${s.ativado} ativado, ${s.nao_ativado} nao ativado `
            + `(${s.em_troca_titularidade} em troca de titularidade), ${s.sem_linha_na_view} sem linha na view`);
  // R13 visivel: se `maiorLote` empatar com `lidos`, o ciclo voltou a ser
  // transacao unica e o P2028 volta com o crescimento.
  console.log(`  lotes .......... ${resultado.transacoes} transacoes, maior lote ` +
              `${resultado.maiorLote} de ${TAMANHO_DO_LOTE}`);

  if (ensaio) {
    console.log('\n== ROLLBACK por LOTE (--ensaio). Nada foi gravado. ==');
    console.log('   Cada lote teve transacao propria e nenhuma commitou, entao a');
    console.log('   reconciliacao enxergou so o espelho que JA estava gravado antes');
    console.log('   do ciclo - `desativados` do ensaio nao antecipa o do valendo.');
  } else {
    console.log('\n== COMMIT por LOTE. O espelho esta atualizado. ==');
    if (!resultado.execucaoGravada) {
      console.error('   ATENCAO: o fechamento nao encontrou a linha de conector_execucao.');
      console.error('   Em modo valendo isso e defeito - o registro do ciclo nao existe.');
    }
  }

  await poolCrm.end();
  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
