// A CONEXAO QUE MANDA UMA CONSULTA POR VEZ, provada sem banco.
// Uso: node --experimental-strip-types tests/conexao-em-serie.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, e por que a `consulta-em-serie` nao bastou
//
// A `consulta-em-serie` (CS1-CS5) le a FONTE e prende a forma: nenhum
// `Promise.all` nosso dentro da transacao. Ela estava verde, e o aviso do `pg`
// voltou em 10/09 21:48, 21/09 15:54 e 22/09 03:06 - sempre na tela «Contas a
// pagar». Quem dispara as consultas juntas e o PRISMA, ao carregar as relacoes
// de um `include` (`src/db/conexao-em-serie.ts` tem a linha do runtime). Nao ha
// fonte nossa para ler.
//
// Entao esta suite prova o COMPORTAMENTO, com o Prisma de verdade, o adaptador
// de verdade, o pool de verdade e a funcao de verdade (`contaPagar.listar`) - e
// so a conexao falsa. A conexao falsa conta quantas consultas estao em voo ao
// mesmo tempo nela, que e exatamente o que o `pg` avisa.
//
// CE5 E A REPRODUCAO DO DEFEITO, e ela fica na suite de proposito: se um dia o
// Prisma passar a serializar sozinho, CE5 fica vermelha e diz que esta camada
// pode sair - em vez de ficar aqui para sempre sem ninguem saber por que.
//
// Precisa do client gerado em `src/generated/` (como a `regra11`), e de nada
// mais: nenhuma conexao de rede e aberta.

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { emSerieNaConexao, ConexaoEmSerie } from '../src/db/conexao-em-serie.ts';
import { criarPools } from '../src/db/pools.ts';
import { withTenantEm } from '../src/db/contexto.ts';
import * as contaPagar from '../src/repos/conta_pagar.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ a medida
/** Quantas consultas em voo ao mesmo tempo, na pior hora. Por conexao. */
type Medida = { maxEmVoo: number; sobrepostas: number; ordem: string[] };

// ============================================================================
// PARTE 1 - a fila, sobre uma base minima (sem `pg`, sem Prisma)

class BaseFalsa {
  emVoo = 0;
  medida: Medida = { maxEmVoo: 0, sobrepostas: 0, ordem: [] };
  query(config: any, values?: any, callback?: any): any {
    const texto = typeof config === 'string' ? config : config.text;
    if (this.emVoo > 0) this.medida.sobrepostas++;
    this.emVoo++;
    this.medida.maxEmVoo = Math.max(this.medida.maxEmVoo, this.emVoo);
    this.medida.ordem.push(texto);
    const cb = typeof values === 'function' ? values : callback;
    const p = pausa(3).then(() => {
      this.emVoo--;
      if (texto.startsWith('FALHA')) throw new Error(`falhou: ${texto}`);
      return { rows: [texto] };
    });
    if (cb) { p.then((r) => cb(null, r), (e) => cb(e)); return undefined; }
    return p;
  }
}
const Enfileirada = emSerieNaConexao(BaseFalsa as any);

{
  const c: any = new Enfileirada();
  const r = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((t) => c.query({ text: t })));
  chk('CE1', c.medida.maxEmVoo === 1 && c.medida.sobrepostas === 0,
      `cinco consultas pedidas juntas chegam a conexao UMA por vez (max em voo: ${c.medida.maxEmVoo}) - `
      + 'e o que o `pg` pede na mensagem de descontinuacao');
  chk('CE2', c.medida.ordem.join('') === 'ABCDE' && r.map((x: any) => x.rows[0]).join('') === 'ABCDE',
      'na ordem em que foram pedidas, e cada uma devolve o SEU resultado');
}

{
  const c: any = new Enfileirada();
  const a = c.query({ text: 'FALHA-1' });
  const b = c.query({ text: 'B' });
  const erro = await a.then(() => null, (e: Error) => e.message);
  const depois = await b;
  chk('CE3', erro === 'falhou: FALHA-1' && depois.rows[0] === 'B',
      'uma consulta que falha rejeita para QUEM A PEDIU e nao trava a fila: a seguinte roda. '
      + 'Numa transacao o Postgres ja recusa o resto sozinho (25P02) - a fila nao pode inventar outra regra');
}

{
  const c: any = new Enfileirada();
  const a = c.query({ text: 'A' });
  await pausa(0);   // a da fila parte no microtick seguinte - espera ela estar em voo
  let comCallback = false;
  c.query('B', [], () => { comCallback = true; });
  const emVooJuntas = c.emVoo;
  await a; await pausa(10);
  chk('CE4', emVooJuntas === 2 && comCallback,
      'a forma com CALLBACK passa direto: e a que o `pool.query()` usa, com a conexao exclusiva da '
      + 'consulta. Serializar o que nao tem o defeito so esconderia o caminho');
}

// ============================================================================
// PARTE 2 - o defeito reproduzido com o Prisma de verdade, e o conserto

/** Uma conexao `pg` que nao abre socket: responde o que o Prisma pergunta. */
class ConexaoFalsa extends pg.Client {
  emVoo = 0;
  medida: Medida = { maxEmVoo: 0, sobrepostas: 0, ordem: [] };

  connect(cb?: any): any {
    if (cb) { process.nextTick(() => cb(null)); return undefined; }
    return Promise.resolve();
  }
  end(cb?: any): any {
    if (cb) { process.nextTick(cb); return undefined; }
    return Promise.resolve();
  }
  query(config: any, values?: any, callback?: any): any {
    const texto: string = typeof config === 'string' ? config : config.text;
    if (this.emVoo > 0) this.medida.sobrepostas++;
    this.emVoo++;
    this.medida.maxEmVoo = Math.max(this.medida.maxEmVoo, this.emVoo);
    this.medida.ordem.push(texto.slice(0, 40));

    // O vinculo tem de existir, ou `exigir('ler_corporativo')` recusa antes
    // de chegar ao `findMany`. O resto volta vazio: a medida e de CONCORRENCIA.
    const resposta = /FROM usuario_tenant/.test(texto)
      ? { fields: [{ name: 'papel', dataTypeID: 25 }], rows: [['admin']], rowCount: 1 }
      : { fields: [], rows: [], rowCount: 0 };

    const cb = typeof values === 'function' ? values : callback;
    const p = pausa(2).then(() => { this.emVoo--; return resposta; });
    if (cb) { p.then((r) => cb(null, r), (e) => cb(e)); return undefined; }
    return p;
  }
}

async function medirListar(Conexao: new () => pg.Client): Promise<Medida[]> {
  const conexoes: ConexaoFalsa[] = [];
  class Registrada extends (Conexao as any) {
    constructor(...a: any[]) { super(...a); conexoes.push(this as any); }
  }
  const pool = new pg.Pool({ max: 2, Client: Registrada as any });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await withTenantEm(prisma as any, {
      tenantId: '00000000-0000-4000-8000-000000000001',
      usuarioId: '00000000-0000-4000-8000-000000000002',
    }, () => contaPagar.listar());
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
  return conexoes.map((c) => c.medida);
}

{
  const antes = await medirListar(ConexaoFalsa);
  const pior = Math.max(0, ...antes.map((m) => m.maxEmVoo));
  chk('CE5', pior >= 3,
      `SEM a fila, \`contaPagar.listar()\` dentro de uma transacao poe ${pior} consultas em voo na MESMA `
      + 'conexao - e o Prisma carregando as quatro relacoes do `include` em paralelo. E o defeito de '
      + 'producao, reproduzido: o `pg` avisa a partir da terceira. Se esta linha ficar vermelha, o '
      + 'Prisma passou a serializar sozinho e `db/conexao-em-serie.ts` pode sair');

  const depois = await medirListar(emSerieNaConexao(ConexaoFalsa));
  const piorDepois = Math.max(0, ...depois.map((m) => m.maxEmVoo));
  const consultas = depois.reduce((s, m) => s + m.ordem.length, 0);
  chk('CE6', piorDepois === 1 && consultas >= 5,
      `COM a fila, a mesma chamada faz ${consultas} consultas e nunca mais de UMA em voo por conexao`);
}

// ============================================================================
// PARTE 3 - e e ela que o sistema usa

{
  const pools = criarPools('postgres://ninguem@127.0.0.1:1/nada');
  const t: any = pools.transacional, r: any = pools.relatorio;
  chk('CE7', t.Client === ConexaoEmSerie && r.Client === ConexaoEmSerie,
      'os DOIS pools de `criarPools` constroem `ConexaoEmSerie` - nos dois a unidade de trabalho e '
      + 'transacao interativa, e a tela de Contas a pagar usa os dois ao abrir');
  await Promise.all([pools.transacional.end(), pools.relatorio.end()]);
}

console.log(`\n${falhas === 0 ? 'conexao-em-serie: todas as verificacoes passaram'
                              : `conexao-em-serie: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
