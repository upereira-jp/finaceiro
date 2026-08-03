// O LANCAMENTO EM LOTE do DIA DE VENCIMENTO, com banco e pela role SEM
// BYPASSRLS. Uso: bash tests/repos.sh
//
// O QUE `tests/planilha-vencimentos.ts` NAO ALCANCA. Aquela suite prova a
// LEITURA do arquivo e o circuito aritmetico; esta prova o que so existe no
// banco, e sao quatro coisas:
//
//   1. O CASAMENTO E POR `numero_uc`. E o unico identificador que a operacao
//      tem na mao - o mesmo argumento do lancamento de tarifas.
//   2. "AUSENTE NAO E ZERO" tem de ser OBSERVAVEL: a UC que a planilha nao
//      cobriu fica como estava e aparece numa lista, em vez de ser zerada.
//   3. A SEGUNDA PASSADA E VAZIA. Reimportar o mesmo arquivo tem de sair com
//      `aplicadas` em zero - senao a tela de trilha encheria de escrita que nao
//      mudou nada, e a auditoria da regra 9 perderia o sinal no ruido.
//   4. O ISOLAMENTO: UC do tenant B e um numero desconhecido, nao um erro de
//      permissao - dizer "sem permissao" confirmaria que ela existe.
//
// E a quinta, que e a razao de esta suite existir hoje e nao depois: o valor
// gravado aqui tem de SOBREVIVER ao ciclo do conector. Isso e `N55`, em
// `tests/conector.ts`, e a ligacao esta anotada no V5 abaixo.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import { lerPlanilhaDeVencimentos } from '../src/dominio/planilha-vencimentos.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emALeitura = <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId: ULEI }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};

const DISTRIB = 'Equatorial';
const UCS = ['VNC-UC-1', 'VNC-UC-2', 'VNC-UC-3'];

/** O mapa que o script monta, pelo MESMO leitor que ele usa. Montar o mapa a mao
 *  aqui testaria o repositorio contra uma leitura que nao e a de producao. */
const mapaDe = (csv: string) => new Map<string, number>(
  lerPlanilhaDeVencimentos(csv).linhas.map((l) => [l.numero_uc, l.dia as number]));

/** O dia que a coluna guarda, lido como `faturamento.ts` o le. */
const diaDe = (d: Date | null): number | null => (d ? d.getUTCDate() : null);

const numeroDe = async (id: string): Promise<string> => {
  const r: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT numero_uc FROM unidade_consumidora WHERE id = $1::uuid`, id));
  return r[0]?.numero_uc;
};
const ucPorNumero = async (n: string): Promise<any> => {
  const r: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT id, numero_uc, data_vencimento, status::text FROM unidade_consumidora WHERE numero_uc = $1`, n));
  return r[0];
};

// ================================================================ fixture
{
  for (const numero of UCS) {
    await emA(() => ucRepo.criar({ cliente_id: CLI, numero_uc: numero, distribuidora: DISTRIB }));
  }
}

// ---------------------------------------------------- V1 o caminho inteiro, de uma vez
{
  // A planilha cobre DUAS das tres e traz uma UC que nao existe - as tres
  // situacoes numa importacao so, que e como um arquivo de verdade chega.
  const r = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe(
    'numero_uc;dia_vencimento\n'
    + 'VNC-UC-1;10\n'
    + 'VNC-UC-2;25\n'
    + 'NAO-EXISTE-AQUI;15\n')));

  chk('V1a', r.aplicadas.length === 2 && r.aplicadas.every((x) => x.antes === null),
      'duas UCs receberam o dia, casadas por `numero_uc`, e as duas vinham de `antes = null` - '
      + 'que e o estado das 39 em producao');

  chk('V1b', r.sem_uc.length === 1 && r.sem_uc[0]!.numero_uc === 'NAO-EXISTE-AQUI',
      'a UC que nao existe vira LINHA DE RELATORIO e nao excecao - um arquivo de 39 nao pode parar '
      + 'na oitava e deixar sete gravadas');

  const naoCoberta = r.nao_cobertas.find((x) => x.numero_uc === 'VNC-UC-3');
  chk('V1c', naoCoberta !== undefined && naoCoberta.dia_atual === null,
      'a UC que a planilha NAO cobriu aparece na lista com o que ela tem hoje - ausente nao e zero, '
      + 'e o lancamento nao apaga o que o arquivo omitiu');

  const u1 = await ucPorNumero('VNC-UC-1');
  const u2 = await ucPorNumero('VNC-UC-2');
  const u3 = await ucPorNumero('VNC-UC-3');
  chk('V1d', diaDe(u1.data_vencimento) === 10 && diaDe(u2.data_vencimento) === 25
        && u3.data_vencimento === null,
      `o dia chegou a coluna e a terceira segue vazia (${diaDe(u1.data_vencimento)}, `
      + `${diaDe(u2.data_vencimento)}, ${u3.data_vencimento === null ? 'NULL' : '?'})`);
}

// ---------------------------------------------------- V2 a segunda passada e vazia
//
// Nao e detalhe de eficiencia. A regra 9 manda gravar auditoria de toda escrita
// de dado de negocio: um lancamento que reescreve as 39 linhas toda vez enche a
// trilha de "antes = depois", e o sinal de uma mudanca de verdade se perde nisso.
{
  const csv = 'numero_uc;dia_vencimento\nVNC-UC-1;10\nVNC-UC-2;25\n';
  const r = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe(csv)));
  chk('V2a', r.aplicadas.length === 0 && r.inalteradas.length === 2,
      `reimportar o MESMO arquivo nao escreve nada (aplicadas=${r.aplicadas.length}, `
      + `inalteradas=${r.inalteradas.length})`);

  // E a mudanca de verdade continua passando - senao o V2a estaria provando que
  // a funcao parou de escrever, em vez de que ela nao reescreve o igual.
  const m = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe('VNC-UC-1;20\n')));
  chk('V2b', m.aplicadas.length === 1 && m.aplicadas[0]!.antes === 10 && m.aplicadas[0]!.dia === 20,
      'trocar o dia AINDA escreve, e o resultado carrega o antes e o depois (10 -> 20)');

  await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe('VNC-UC-1;10\n')));   // devolve o estado
}

// ---------------------------------------------------- V3 o dia 31 e a UC cancelada
{
  const r = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe('VNC-UC-3;31\n')));
  const u3 = await ucPorNumero('VNC-UC-3');
  chk('V3a', r.aplicadas.length === 1 && diaDe(u3.data_vencimento) === 31,
      'o dia 31 e gravavel - a coluna guarda um portador de 31 dias, e o mes curto e resolvido '
      + 'em `vencimentoDaFatura`, nao aqui');

  // Cancelada saiu do rateio e nao vai faturar. Lancar vencimento nela seria
  // escrita sem consequencia, e ela apareceria em `nao_cobertas` em todo lote
  // seguinte como se faltasse dado.
  await emA(() => ucRepo.cancelar(u3.id));
  const dep = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe('VNC-UC-3;5\n')));
  const u3d = await ucPorNumero('VNC-UC-3');
  chk('V3b', dep.sem_uc.length === 1 && dep.aplicadas.length === 0 && diaDe(u3d.data_vencimento) === 31,
      'UC CANCELADA nao recebe vencimento e nao entra em `nao_cobertas` - ela saiu do rateio, '
      + `e o valor que tinha fica intacto (dia=${diaDe(u3d.data_vencimento)})`);

  chk('V3c', !dep.nao_cobertas.some((x) => x.numero_uc === 'VNC-UC-3'),
      'e ela some da lista de "nao cobertas" - senao todo lote futuro pediria um dado que '
      + 'ninguem deve preencher');
}

// ---------------------------------------------------- V4 papel e isolamento
{
  const e = await lancou(() => emALeitura(() => ucRepo.lancarVencimentosPorUC(mapaDe('VNC-UC-1;12\n'))));
  chk('V4a', e !== null && /escrever_cadastro|permiss|papel/i.test(String(e?.message ?? e)),
      'papel `leitura` NAO lanca vencimento - a matriz e aplicada no repositorio por `exigir()`, '
      + 'entao o script passa por ela como a rota passaria');

  const r = await emA(() => ucRepo.lancarVencimentosPorUC(mapaDe('DOC-B-UC-1;12\n')));
  chk('V4b', r.aplicadas.length === 0 && r.sem_uc.length === 1,
      'UC do tenant B cai em `sem_uc` como qualquer numero desconhecido - dizer "sem permissao" '
      + 'confirmaria que ela existe em algum lugar');
}

// ---------------------------------------------------- V5 o dia invalido nao chega ao banco
//
// O leitor puro ja recusa, e esta verificacao existe porque o repositorio e
// chamavel sem ele: a rota, um script futuro ou um teste podem montar o mapa a
// mao. A guarda tem de estar dos DOIS lados, e esta e a que fica perto da coluna.
{
  const e = await lancou(() => emA(() => ucRepo.lancarVencimentosPorUC(new Map([['VNC-UC-1', 32]]))));
  chk('V5a', e !== null && /invalido/i.test(String(e?.message ?? e)) && (e as any).status === 422,
      'dia 32 montado a mao e recusado pelo REPOSITORIO, nao so pelo leitor de planilha (422)');

  const zero = await lancou(() => emA(() => ucRepo.lancarVencimentosPorUC(new Map([['VNC-UC-1', 0]]))));
  chk('V5b', zero !== null, 'dia 0 idem - e o valor que uma celula vazia produziria se alguem "ajudasse"');

  // E nada foi escrito: a validacao roda ANTES do primeiro update, como no
  // `lancarTarifasPorUC`. Um lote meio gravado exigiria saber quais entraram.
  const u1 = await ucPorNumero('VNC-UC-1');
  chk('V5c', diaDe(u1.data_vencimento) === 10,
      `a recusa nao deixou escrita pela metade - VNC-UC-1 segue no dia 10 (${diaDe(u1.data_vencimento)})`);
}

// ---------------------------------------------------- V6 a ligacao com o conector
//
// ESTA VERIFICACAO NAO E SOBRE ESTE MODULO, e e a mais importante do arquivo.
//
// Ate 03/08/2026 `src/crm/sincronizacao.ts` levava `data_vencimento` dentro do
// objeto `espelho`, e o CRM tem a coluna vazia em 41 de 41 linhas. Gravar aqui e
// rodar `npm run ciclo` APAGAVA o que foi gravado - sem erro, sem log e sem
// recusa. As 39 UCs de producao viveriam exatamente esse caminho.
//
// O `N55` de `tests/conector.ts` e quem prova o conserto, com o ciclo de verdade.
// O que se afirma AQUI e a outra metade: que o valor que este modulo grava e o
// mesmo que aquele teste protege - o dia, na coluna `data_vencimento` da UC.
// Sem esta linha, alguem poderia mudar o portador para outra coluna e os dois
// testes continuariam verdes, cada um sobre uma coisa diferente.
{
  const u1 = await ucPorNumero('VNC-UC-1');
  const bruto: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT data_vencimento::text AS d FROM unidade_consumidora WHERE id = $1::uuid`, u1.id));
  chk('V6a', /^\d{4}-\d{2}-10$/.test(bruto[0]?.d ?? ''),
      `o dia mora em unidade_consumidora.data_vencimento, que e a coluna que a R25 da SPEC-002 `
      + `protege do conector (veio ${bruto[0]?.d})`);

  chk('V6b', await numeroDe(u1.id) === 'VNC-UC-1',
      'e a UC e alcancavel pelo numero, que e a chave do casamento da planilha');
}

console.log(`\n${falhas === 0 ? 'vencimento por planilha: todas as verificacoes passaram'
                              : `vencimento por planilha: ${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
