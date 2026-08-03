// DESTRAVAR UMA UC QUE O CONECTOR RECUSA POR TROCA DE VINCULO. Q-UCMUDOU-01.
//
// O QUE ESTE SCRIPT FAZ, E E UMA COISA SO:
//
//   apaga `unidade_consumidora.crm_usina_cliente_id` de UMA UC nomeada.
//
// Nao escreve o vinculo novo. Nao mexe em `cliente_id`, `usina_id` nem
// `percentual_rateio`. Quem escreve campo espelhado e o conector (R6), e este
// script existe para DESTRAVA-LO, nao para substitui-lo.
//
// ---------------------------------------------------------------------------
// POR QUE UM SCRIPT, E POR QUE NAO E CONSERTO NO CONECTOR
//
// A R23 da SPEC-002 manda o conector RECUSAR quando um contrato de rateio muda
// de UC no CRM: das duas leituras uma esta errada, e escolher seria palpite. A
// recusa esta certa e continua valendo - nao ha nada a consertar la.
//
// O que o conector nao tem e a informacao que resolve o empate: QUAL das duas
// leituras vale. Essa informacao e externa - vem de quem opera o CRM, por
// adjudicacao. Em 03/08/2026 ela veio: a UC 000041446801282 tinha sido digitada
// errada no cadastro do Fernando Albino em 14/07, e o CRM corrigiu em 29/07.
//
// Entao o desenho e: o humano registra a adjudicacao apagando o ponteiro velho,
// e o conector - que continua sendo o unico escritor de campo espelhado - grava
// o vinculo novo no ciclo seguinte, pelo caminho normal, com contagem e trilha.
//
// ---------------------------------------------------------------------------
// AS QUATRO GUARDAS, E POR QUE CADA UMA
//
// O script LE O CRM antes de escrever, e recusa se o CRM nao confirmar a troca.
// Um UPDATE cego aqui apagaria um vinculo bom por digitacao errada de UC, e o
// sintoma so apareceria no ciclo seguinte, como uma UC criada em duplicidade.
//
//   1. a UC existe no espelho e TEM `crm_usina_cliente_id`. Sem ponteiro nao ha
//      o que destravar, e o pedido provavelmente e sobre outra coisa;
//   2. no CRM, o contrato que nos temos aponta para OUTRA UC. E a prova de que
//      ele se moveu. Se ainda apontar para esta, nao ha troca e o script recusa;
//   3. no CRM, esta UC e servida por OUTRO contrato. E a prova de que existe
//      substituto - sem ele, apagar deixaria a linha orfa no ciclo seguinte;
//   4. esse contrato substituto nao esta vinculado a nenhuma outra UC nossa.
//      Se estiver, ha um segundo conflito atras deste, e apagar um ponteiro so
//      trocaria uma recusa por outra - com uma escrita no meio.
//
// ---------------------------------------------------------------------------
// USO
//
//   npm run destravar-uc -- --ensaio  --auth-user <uuid> --uc <numero>
//   npm run destravar-uc -- --valendo --auth-user <uuid> --uc <numero>
//
// `--ensaio` e `--valendo` sao OBRIGATORIOS e nao ha default, pelo mesmo motivo
// do ciclo e do bootstrap: escrita que acontece porque alguem esqueceu uma flag
// e o modo de falha errado. No ensaio a leitura do CRM acontece de verdade, as
// quatro guardas rodam de verdade, e o UPDATE leva ROLLBACK.
//
// Roda DENTRO de contexto de tenant, pelo mesmo `app.withTenant` de qualquer
// requisicao (SPEC-001 §3.2), entao o gatilho de auditoria da invariante 17
// grava quem/quando/antes/depois sem que este script precise saber disso.

import { iniciar, encerrarApp } from '../src/app.ts';
import { crmDoAmbiente, conferirRoleDeLeitura } from '../src/crm/conexao.ts';
import { decidirDestrave, type LinhaDoRateio } from '../src/dominio/destrave-uc.ts';

/** Sai da transacao por excecao: e o unico ROLLBACK que o Prisma expoe. */
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
  const numeroUc = arg('uc');
  const tenantProposto = arg('tenant');
  if (!authUserId || !numeroUc) {
    console.error('ERRO: --auth-user <uuid> e --uc <numero> sao obrigatorios.');
    process.exit(2);
  }

  console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`financeiro: ${sessao.nome} <${sessao.email}>`);

  const poolCrm = crmDoAmbiente();
  await conferirRoleDeLeitura(poolCrm);   // regra 4: a guarda antes de qualquer leitura

  const conector = await a.withTenant(sessao, tenantProposto, async (tx: any) =>
    tx.conector_crm.findFirst({ select: { crm_tenant_id: true } }));
  if (!conector) {
    console.error('\nERRO: nenhum conector_crm para este tenant.');
    await poolCrm.end(); await encerrarApp(); process.exit(1);
  }
  // Regra 6: o identificador do sistema externo se chama crm_tenant_id, vem do
  // banco, e todo SELECT no CRM filtra por ele.
  const crmTenantId: string = conector.crm_tenant_id;

  const sair = async (codigo: number): Promise<never> => {
    await poolCrm.end(); await encerrarApp(); process.exit(codigo);
  };
  const recusa = async (motivo: string): Promise<never> => {
    console.error(`\nRECUSADO: ${motivo}`);
    console.error('Nada foi escrito.');
    return sair(1);
  };

  // ---- as quatro leituras que a decisao usa -------------------------------
  const atual = await a.withTenant(sessao, tenantProposto, async (tx: any) =>
    tx.unidade_consumidora.findFirst({
      where: { numero_uc: numeroUc },
      select: { id: true, numero_uc: true, crm_usina_cliente_id: true,
                cliente: { select: { nome: true, crm_lead_id: true } } },
    }));
  // A UC inexistente nao e guarda: nao ha o que decidir sobre uma linha ausente.
  if (!atual) await recusa(`a UC ${numeroUc} nao existe no espelho.`);

  console.log('ESPELHO, hoje');
  console.log(`  UC        ${atual.numero_uc}`);
  console.log(`  cliente   ${atual.cliente.nome}  (lead ${atual.cliente.crm_lead_id})`);
  console.log(`  contrato  ${atual.crm_usina_cliente_id ?? '(nenhum)'}\n`);

  // O CRM, sempre filtrado por crm_tenant_id (regra 6).
  const q = async (sql: string, params: unknown[]): Promise<LinhaDoRateio[]> =>
    (await poolCrm.query(sql, params)).rows as LinhaDoRateio[];

  const [porContrato] = atual.crm_usina_cliente_id
    ? await q(`select uc, contrato_id, lead_codigo, cliente from financeiro.rateio_clientes
                where crm_tenant_id = $1 and contrato_id = $2`,
              [crmTenantId, atual.crm_usina_cliente_id])
    : [];
  const [porUc] = await q(
    `select uc, contrato_id, lead_codigo, cliente from financeiro.rateio_clientes
      where crm_tenant_id = $1 and uc = $2`, [crmTenantId, numeroUc]);

  const presoEmOutra = porUc
    ? await a.withTenant(sessao, tenantProposto, async (tx: any) =>
        tx.unidade_consumidora.findFirst({
          where: { crm_usina_cliente_id: porUc.contrato_id },
          select: { numero_uc: true },
        }))
    : null;

  // ---- a decisao, que e pura e tem suite propria (tests/destrave-uc.ts) ----
  const d = decidirDestrave({
    numeroUc,
    contratoNoEspelho: atual.crm_usina_cliente_id ?? null,
    crmPorContrato: porContrato ?? null,
    crmPorUc: porUc ?? null,
    ucPresaAoSubstituto: presoEmOutra?.numero_uc ?? null,
  });
  if (!d.pode) return recusa(`guarda ${d.guarda} — ${d.motivo}`);

  const contratoNosso = d.contratoASoltar;
  console.log('CRM, hoje');
  console.log(`  o contrato ${contratoNosso}`);
  console.log(`    passou a servir a UC ${porContrato.uc}  (${porContrato.lead_codigo} · ${porContrato.cliente})`);
  console.log(`  a UC ${numeroUc}`);
  console.log(`    passou a ser servida pelo contrato ${porUc.contrato_id}  (${porUc.lead_codigo} · ${porUc.cliente})\n`);
  console.log('As quatro guardas passaram: o CRM confirma a troca nos dois sentidos.\n');

  // ---- a escrita: UMA coluna, para NULL -----------------------------------
  const escrever = async () => a.withTenant(sessao, tenantProposto, async (tx: any) => {
    await tx.unidade_consumidora.updateMany({
      where: { id: atual.id }, data: { crm_usina_cliente_id: null },
    });
    const depois = await tx.unidade_consumidora.findFirst({
      where: { id: atual.id }, select: { numero_uc: true, crm_usina_cliente_id: true },
    });
    return depois;
  });

  let depois: any;
  if (ensaio) {
    try {
      await a.withTenant(sessao, tenantProposto, async (tx: any) => {
        await tx.unidade_consumidora.updateMany({
          where: { id: atual.id }, data: { crm_usina_cliente_id: null },
        });
        throw new RollbackDoEnsaio(await tx.unidade_consumidora.findFirst({
          where: { id: atual.id }, select: { numero_uc: true, crm_usina_cliente_id: true },
        }));
      });
    } catch (e) {
      if (e instanceof RollbackDoEnsaio) depois = e.valor; else throw e;
    }
  } else {
    depois = await escrever();
  }

  console.log('ANTES  -> DEPOIS');
  console.log(`  crm_usina_cliente_id: ${contratoNosso} -> ${depois?.crm_usina_cliente_id ?? '(nulo)'}\n`);

  console.log('O QUE O PROXIMO `npm run ciclo` VAI FAZER, e nada disso e escrito aqui:');
  console.log(`  - atualiza  a UC ${numeroUc}: contrato ${porUc.contrato_id}, e o cliente do`);
  console.log(`              lead ${porUc.lead_codigo} (${porUc.cliente});`);
  console.log(`  - cria      a UC ${porContrato.uc}, com o contrato ${contratoNosso};`);
  console.log('  - a recusa da R23 desaparece, porque o empate deixou de existir.\n');

  if (ensaio) console.log('ENSAIO: ROLLBACK dado, nada foi gravado. Rode com --valendo para valer.\n');
  else        console.log('VALENDO: gravado. Rode `npm run ciclo -- --ensaio` para conferir antes do ciclo valendo.\n');

  await sair(0);
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
