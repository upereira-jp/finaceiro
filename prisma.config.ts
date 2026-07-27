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
// carregado e env('DIRECT_URL') volta vazio.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DIRECT_URL') },
});
