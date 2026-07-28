// Cadastro local das usinas, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run usinas -- --ensaio  --auth-user <uuid> [--tenant <uuid>]
//   npm run usinas -- --valendo --auth-user <uuid> [--tenant <uuid>]
//
// POR QUE ESTE SCRIPT EXISTE, e nao um INSERT no psql.
//
// A usina e a UNICA das quatro entidades da SPEC-002 §2 que o conector nao cria,
// e a razao esta na R19: `distribuidora` e campo LOCAL. O dev do CRM confirmou em
// 28/07 que nao existe tabela de referencia de distribuidoras do lado dele - o
// campo la e input de texto livre, vazio nas tres. Nao e dado deles faltando; e
// dado nosso. Logo alguem tem que cadastrar, e "alguem" precisa de um caminho.
//
// O caminho e o de sempre: `app.login()` resolve a identidade, `app.withTenant()`
// confere o tenant contra os vinculos do login, e a escrita passa por
// `repos/usina.criar()`, que chama `exigir('escrever_cadastro')`. Um INSERT por
// psql pularia a matriz de papeis, a policy WITH CHECK e o gatilho de auditoria -
// e a regra 9 manda gravar quem, quando, antes e depois.
//
// O CADASTRO E DELIBERADAMENTE MINIMO: so `codigo_geradora` e `distribuidora`.
// Tudo o mais - apelido, geracao nominal, `crm_usina_id`, status - e campo
// ESPELHO, e quem preenche e o proximo ciclo do conector. Preencher aqui seria
// digitar a mao o que a integracao busca sozinha, e criaria a duvida de qual dos
// dois vence quando divergirem.

import { iniciar, encerrarApp } from '../src/app.ts';
import { criar, porCodigo } from '../src/repos/usina.ts';

/** As tres da gestao de usinas do CRM, confirmadas pelo dono em 28/07. */
const USINAS = [
  { codigo_geradora: '0001', distribuidora: 'Equatorial' },
  { codigo_geradora: '0002', distribuidora: 'Equatorial' },
  { codigo_geradora: '0003', distribuidora: 'Equatorial' },
];

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

async function main(): Promise<void> {
  const ensaio = tem('ensaio'), valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }
  const authUserId = arg('auth-user');
  if (!authUserId) { console.error('ERRO: --auth-user <uuid> e obrigatorio.'); process.exit(2); }
  const tenantProposto = arg('tenant');

  console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`${sessao.nome} <${sessao.email}>, papel=${sessao.tenants.map((t) => t.papel).join(',')}\n`);

  const trabalho = async () => {
    const feitas: string[] = [];
    for (const u of USINAS) {
      // Idempotente de proposito: rodar duas vezes nao e erro, e o script pode ser
      // reexecutado depois de uma falha parcial sem ninguem precisar lembrar quais
      // ja entraram.
      const existente = await porCodigo(u.codigo_geradora);
      if (existente) { console.log(`  ${u.codigo_geradora}  ja existe (distribuidora=${existente.distribuidora})`); continue; }
      const nova = await criar(u);
      console.log(`  ${u.codigo_geradora}  criada  id=${nova.id}  distribuidora=${nova.distribuidora}`);
      feitas.push(u.codigo_geradora);
    }
    return feitas;
  };

  let feitas: string[] = [];
  try {
    feitas = await a.withTenant(sessao, tenantProposto, async () => {
      const f = await trabalho();
      if (ensaio) throw new RollbackDoEnsaio(f);
      return f;
    }) as string[];
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) feitas = e.valor as string[];
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${feitas.length} teriam sido criadas. Nada foi gravado. ==`
    : `\n== COMMIT. ${feitas.length} usina(s) criada(s). ==`);
  if (!ensaio && feitas.length > 0) {
    console.log('   Rode o ciclo em seguida: os campos de espelho (apelido, geracao');
    console.log('   nominal, crm_usina_id, status) sao preenchidos por ele, nao aqui.');
  }
  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
