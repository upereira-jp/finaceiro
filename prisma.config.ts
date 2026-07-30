// O CLI e o RUNTIME nao usam a mesma conexao, e confundir as duas custa caro.
//
// Este arquivo e lido SO pelo CLI: `migrate deploy`, `db pull`, `generate`. Ele
// precisa de conexao DIRETA. O pooler em modo transacao (porta 6543) nao suporta
// os prepared statements que o Migrate exige - o comando nao falha com mensagem
// util, ele PENDURA por minutos e desiste.
//
// O runtime nao passa por aqui: src/db/pools.ts monta os dois pools e o client
// recebe a connection string via PrismaPg. A role de runtime tem que ser membro
// de app_financeiro e NAO pode ter BYPASSRLS, ou as 24 policies viram enfeite.
//
// `import 'dotenv/config'` nao e opcional no Prisma 7: sem ele o .env nao e
// carregado e DIRECT_URL volta vazio.
//
// ============================================================================
// POR QUE `generate` NAO EXIGE MAIS `DIRECT_URL` — corrigido em 30/07/2026
//
// O deploy da correcao do client quebrou no VPS, e o erro nao ajudava:
//
//     Failed to load config file "/opt/financeiro/app" as a TypeScript/JavaScript
//     module. Error: PrismaConfigEnvError: Cannot resolve environment variable:
//     DIRECT_URL.
//
// A causa: `env('DIRECT_URL')` do `prisma/config` LEVANTA quando a variavel nao
// existe, e isso acontecia ANTES de o Prisma saber qual comando fora pedido. O
// `.env` do servidor tem `DATABASE_URL` (o runtime precisa) e nao tem
// `DIRECT_URL` - e nao tinha por que ter: as migrations deste projeto sempre
// foram aplicadas de fora, nunca do VPS.
//
// MEDIDO ANTES DE CONSERTAR, e o resultado e o que decide o desenho:
//
//     DIRECT_URL="postgresql://naoexiste:naoexiste@127.0.0.1:9999/naoexiste" \
//       npx prisma generate     ->  "Generated Prisma Client (7.9.0)"  em 769 ms
//
// `generate` **nao disca**. Ele le o `schema.prisma` e escreve arquivos; a
// datasource so precisa existir como campo. Exigir uma URL real para ele era
// exigir credencial de banco para uma operacao de arquivo - e o efeito pratico
// foi transformar o passo de conserto num segundo erro, no servidor, as pressas.
//
// O QUE ESTE ARQUIVO NAO FAZ, e a distincao e a parte importante: ele **nao**
// inventa uma URL para quem precisa de banco. `migrate deploy`, `db pull` e
// `db execute` continuam exigindo `DIRECT_URL`, e agora com mensagem que diz o
// que fazer. Cair para `DATABASE_URL` "para funcionar" seria pior que o erro
// original: aquela aponta para o session pooler com a role de runtime, que nao
// tem DDL - o `migrate deploy` falharia no meio, com metade aplicada, dizendo
// "permission denied" numa tabela qualquer.

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * O comando pedido, sem as flags. `npx prisma generate --watch` -> "generate".
 * Vazio quando alguem chama o CLI sem subcomando, e nesse caso a lista abaixo
 * nao casa e o comportamento e o conservador (exige a URL).
 */
const comando = process.argv.slice(2).filter((a) => !a.startsWith('-')).join(' ');

/**
 * Os comandos que DISCAM. Lista por inclusao e nao por exclusao, de proposito:
 * um subcomando novo do Prisma que precise de banco vai cair no lado seguro -
 * exigir a URL - em vez de silenciosamente receber a de mentira.
 */
const DISCAM = ['migrate', 'db', 'studio', 'debug'];
const precisaDeBanco = DISCAM.some((c) => comando === c || comando.startsWith(`${c} `));

const direta = process.env.DIRECT_URL;

if (!direta && precisaDeBanco) {
  throw new Error(
    `DIRECT_URL ausente, e "prisma ${comando}" precisa dela para conectar.\n\n` +
    'Ela e a conexao DIRETA do CLI, e nao e a mesma do runtime:\n' +
    '  DATABASE_URL  runtime, session pooler na 5432, role app_financeiro_login\n' +
    '  DIRECT_URL    CLI, session pooler na 5432 - NUNCA a 6543 (transaction\n' +
    '                pooler; nao falha com mensagem util, PENDURA e desiste)\n\n' +
    'Formato no .env.example. Se voce so quer regenerar o client, `prisma generate` ' +
    'NAO precisa de banco nenhum e roda sem ela.'
  );
}

/**
 * A URL de mentira para `generate`, e ela e propositalmente ridicula: porta 1,
 * host `invalido.local`, credencial `nao-conecta`. Se algum dia um comando
 * passar por aqui e TENTAR discar, a falha vai nomear este arquivo em vez de
 * parecer indisponibilidade do banco de verdade.
 */
const NAO_DISCA = 'postgresql://nao-conecta:nao-conecta@invalido.local:1/nao-disca';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: direta ?? NAO_DISCA },
});
