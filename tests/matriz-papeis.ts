// A matriz do PRD-v2.2 3, nivel tenant, fixada CELULA A CELULA.
// Uso: bash tests/repos.sh
//
// POR QUE ESTA SUITE EXISTE. Em 27/07 `escrever_cadastro` foi restringida de
// ['admin','financeiro'] para ['admin'], alinhando ao PRD (Q-RBAC-01). A
// mudanca NAO quebrou nenhum teste - o que provou que a matriz nunca esteve
// coberta: as suites usavam `admin` para escrever e `leitura` para ser negada,
// e os dois papeis do meio nao apareciam. Uma tabela de autorizacao sem teste
// celula a celula e um comentario (CLAUDE.md 8), e foi assim que a divergencia
// sobreviveu ate ser encontrada por leitura.
//
// Se o PRD 3 mudar, esta tabela muda JUNTO e de proposito - ela e a traducao
// literal da tabela de la, nao uma re-derivacao.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, exigir } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';

const CONN = process.env.TEST_DATABASE_URL!;
const A = process.env.TEST_TENANT_A!;

const USUARIO: Record<string, string> = {
  admin:      process.env.TEST_USUARIO_ADMIN!,
  financeiro: process.env.TEST_USUARIO_FINANCEIRO!,
  cobranca:   process.env.TEST_USUARIO_COBRANCA!,
  leitura:    process.env.TEST_USUARIO_LEITURA!,
};

/**
 * PRD-v2.2 3, transcrita:
 *
 *   | papel      | Carteira | Corporativo | Cadastros | Configuracao |
 *   | admin      | total    | total       | total     | total        |
 *   | financeiro | leitura  | total       | leitura   | -            |
 *   | cobranca   | total    | -           | leitura   | -            |
 *   | leitura    | leitura  | leitura     | leitura   | -            |
 *
 * `ler` cobre as colunas onde o papel tem ao menos leitura - e as quatro tem.
 * `escrever_carteira` e a coluna Carteira em "total".
 * `escrever_cadastro` e a coluna Cadastros em "total": SO admin.
 * `administrar` e a coluna Configuracao: SO admin.
 */
const ESPERADO: Record<string, Record<string, boolean>> = {
  admin:      { ler: true, escrever_cadastro: true,  escrever_carteira: true,  administrar: true  },
  financeiro: { ler: true, escrever_cadastro: false, escrever_carteira: false, administrar: false },
  cobranca:   { ler: true, escrever_cadastro: false, escrever_carteira: true,  administrar: false },
  leitura:    { ler: true, escrever_cadastro: false, escrever_carteira: false, administrar: false },
};

const ACOES = ['ler', 'escrever_cadastro', 'escrever_carteira', 'administrar'] as const;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

/** Roda exigir() dentro de uma unidade de trabalho real: o papel sai do vinculo
 *  no banco, sob RLS, e nao de um objeto montado no teste. */
async function podeFazer(papel: string, acao: string): Promise<boolean> {
  try {
    await withTenantEm(prisma as any, { tenantId: A, usuarioId: USUARIO[papel] }, () => exigir(acao as any));
    return true;
  } catch (e: any) {
    if (e?.name === 'PapelInsuficiente') return false;
    throw e;
  }
}

let n = 0;
for (const papel of Object.keys(ESPERADO)) {
  for (const acao of ACOES) {
    n++;
    const esperado = ESPERADO[papel][acao];
    const obtido = await podeFazer(papel, acao);
    chk(`P${n}`, obtido === esperado,
        `${papel.padEnd(10)} ${acao.padEnd(17)} ${esperado ? 'PODE' : 'nao pode'}` +
        (obtido === esperado ? '' : `  <- veio ${obtido ? 'PODE' : 'nao pode'}`));
  }
}

// ---------------------------------------- a celula que mudou em 27/07
{
  const pode = await podeFazer('financeiro', 'escrever_cadastro');
  chk('P17', pode === false,
      'Q-RBAC-01: `financeiro` NAO escreve cadastro. Era a divergencia permissiva contra o PRD 3');
}

// ---------------------------------------- papel desconhecido nao ganha nada
{
  const acoesInvalidas = await podeFazer('admin', 'acao_que_nao_existe').catch(() => 'lancou');
  chk('P18', acoesInvalidas === 'lancou' || acoesInvalidas === false,
      'acao fora da matriz nao e autorizada por omissao');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
