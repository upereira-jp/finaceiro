// O `prisma.config.ts`, exercitado pelo CLI DE VERDADE. Sem banco.
// Uso: node --experimental-strip-types tests/prisma-config.ts
//
// POR QUE ESTA SUITE EXISTE, e a data importa: em 30/07/2026 o conserto de um
// defeito de producao quebrou no meio, no servidor, com o dono esperando. O
// comando era `npx prisma generate` e a resposta foi
//
//     Failed to load config file "/opt/financeiro/app" as a TypeScript/JavaScript
//     module. Error: PrismaConfigEnvError: Cannot resolve environment variable:
//     DIRECT_URL.
//
// O `.env` do VPS tem `DATABASE_URL` e nao tem `DIRECT_URL` - e nao tinha por que
// ter: as migrations deste projeto sempre foram aplicadas de fora. Mas
// `env('DIRECT_URL')` do `prisma/config` LEVANTA na carga do arquivo, antes de o
// Prisma saber que o comando pedido nem discaria.
//
// O QUE ESTA SUITE AFIRMA, e as duas metades importam igualmente:
//
//   1. `generate` roda SEM `DIRECT_URL`. E o passo de conserto, e ele nao pode
//      exigir credencial de banco para escrever arquivo.
//   2. `migrate deploy` RECUSA sem ela, e com mensagem que diz o que fazer. Um
//      fallback silencioso para `DATABASE_URL` seria pior que o erro original:
//      aquela aponta para a role de runtime, sem DDL, e o `migrate deploy`
//      morreria no meio com "permission denied" numa tabela qualquer.
//
// E ELA CHAMA O CLI, nao importa o modulo. Importar `prisma.config.ts` daqui
// executaria o arquivo neste processo, com o `.env` desta maquina ja carregado -
// exatamente a condicao que NAO reproduz o servidor. O unico jeito de verificar
// e rodar o comando com o ambiente que o servidor tem.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

/*
 * O AMBIENTE DO SERVIDOR, reproduzido: um `.env` que existe e NAO tem
 * `DIRECT_URL`. `DOTENV_CONFIG_PATH` e o que faz o `dotenv/config` do
 * `prisma.config.ts` ler este arquivo em vez do da raiz - sem isso a suite leria
 * o `.env` de desenvolvimento e passaria por um motivo que nao e o testado.
 */
const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
const envVazio = join(dir, 'sem-direct-url.env');
writeFileSync(envVazio, 'DATABASE_URL=postgresql://runtime:x@127.0.0.1:5432/x\n');

function rodar(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_CONFIG_PATH: envVazio };
  delete env.DIRECT_URL;
  const r = spawnSync('npx', ['prisma', ...args], { encoding: 'utf8', env, timeout: 120_000 });
  return { status: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ---------------------------------------------------- PC1 generate nao precisa de banco
{
  const r = rodar(['generate']);
  chk('PC1a', r.status === 0 && /Generated Prisma Client/.test(r.saida),
      'com um .env SEM DIRECT_URL, `prisma generate` roda e escreve o client - e o passo que '
      + 'conserta o deploy, e ele nao pode exigir credencial de banco para escrever arquivo');
}

// ---------------------------------------------------- PC2 e nem disca de verdade
{
  const env = { ...process.env, DIRECT_URL: 'postgresql://x:x@127.0.0.1:9/nao-existe' };
  const r = spawnSync('npx', ['prisma', 'generate'], { encoding: 'utf8', env, timeout: 120_000 });
  chk('PC2a', r.status === 0,
      'e com DIRECT_URL apontando para a porta 9 de lugar nenhum ele TAMBEM roda - a prova de que '
      + '`generate` nao conecta, e nao so de que a nossa configuracao o deixa passar');
}

// ---------------------------------------------------- PC3 quem disca continua exigindo
{
  const r = rodar(['migrate', 'deploy']);
  chk('PC3a', r.status !== 0 && /DIRECT_URL ausente/.test(r.saida),
      '`migrate deploy` sem DIRECT_URL RECUSA - cair para DATABASE_URL seria pior que o erro: ela '
      + 'aponta para a role de runtime, sem DDL, e a migration morreria no meio');

  chk('PC3b', /session pooler na 5432/.test(r.saida) && /6543/.test(r.saida),
      'e a mensagem diz o que fazer - a porta certa, a errada e o motivo. Quem le esse erro esta '
      + 'num servidor, no meio de um deploy que ja deu errado uma vez');

  chk('PC3c', /generate` NAO precisa de banco/.test(r.saida),
      'e aponta a saida para quem so queria regenerar o client - que foi exatamente o caso de '
      + '30/07, e o erro antigo nao dizia isso');
}

// ---------------------------------------------------- PC4 db pull tambem
{
  const r = rodar(['db', 'pull']);
  chk('PC4a', r.status !== 0 && /DIRECT_URL ausente/.test(r.saida),
      '`db pull` idem - a lista de comandos que discam e por INCLUSAO, entao um subcomando novo do '
      + 'Prisma cai no lado seguro em vez de receber a URL de mentira em silencio');
}

console.log(`\n${falhas === 0 ? 'prisma.config: todas as verificacoes passaram'
                              : `prisma.config: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
