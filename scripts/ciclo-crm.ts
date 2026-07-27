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
// falha errado. No ensaio o trabalho inteiro roda dentro da transacao e leva
// ROLLBACK no fim - a leitura do CRM acontece de verdade, os contadores sao
// reais, e nada e gravado. E como toda prova de escrita deste projeto rodou.

import { iniciar, encerrarApp } from '../src/app.ts';
import { crmDoAmbiente, conferirRoleDeLeitura } from '../src/crm/conexao.ts';
import { criarLeitorCrm } from '../src/crm/leitura.ts';
import { executarCiclo } from '../src/crm/sincronizacao.ts';

class EnsaioConcluido extends Error {
  readonly resultado: unknown;
  constructor(resultado: unknown) { super('ensaio'); this.name = 'EnsaioConcluido'; this.resultado = resultado; }
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

  // 4. O ciclo, dentro da transacao do contexto.
  let resultado: any;
  try {
    resultado = await a.withTenant(sessao, tenantProposto, async () => {
      const r = await executarCiclo(leitor);
      // ENSAIO: lancar aqui reverte a transacao inteira - inclusive
      // conector_execucao. A leitura do CRM ja aconteceu e os numeros sao
      // reais; o que nao acontece e a gravacao.
      if (ensaio) throw new EnsaioConcluido(r);
      return r;
    });
  } catch (e) {
    if (e instanceof EnsaioConcluido) resultado = e.resultado;
    else { console.error('\nCICLO FALHOU:', e); await poolCrm.end(); await encerrarApp(); process.exit(1); }
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
  if (resultado.filaDeRevisao?.length) {
    console.log(`  fila de revisao humana (§4.3): ${resultado.filaDeRevisao.join(', ')}`);
  }
  console.log(`  garantia de tenant degradada: ${resultado.garantiaDeTenantDegradada}`);

  console.log(ensaio
    ? '\n== ROLLBACK (--ensaio). Nada foi gravado. =='
    : '\n== COMMIT. O espelho esta atualizado. ==');

  await poolCrm.end();
  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
