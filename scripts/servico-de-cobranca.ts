// IMPRIME o auth_user_id do usuario de servico de um tenant, e o comando que o
// provisiona. NAO TOCA NO BANCO - nao abre conexao, nao le `.env`, nao escreve.
//
// POR QUE ELE EXISTE: o `auth_user_id` do servico e derivado do tenant por
// UUIDv5, e digitar uuid a mao e como o modo de falha comeca. Aqui ele sai
// pronto para copiar, junto com a linha do `psql`.
//
// USO
//   npm run servico-de-cobranca -- --tenant <uuid do tenant>

import { authUserIdDeServico, ehUuid, nomeDoServico, emailDoServico } from '../src/auth/usuario-de-servico.ts';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tenant = arg('tenant');

if (!ehUuid(tenant)) {
  console.error('ERRO: --tenant <uuid> e obrigatorio.');
  console.error('  O tenant do financeiro esta no financeiro-ciclo.service.');
  process.exit(2);
}

const auth = authUserIdDeServico(tenant!);

console.log(`
  tenant ............ ${tenant}
  auth_user_id ...... ${auth}   <- DERIVADO, nao escolhido
  nome .............. ${nomeDoServico}
  email ............. ${emailDoServico(tenant!)}
  papel ............. cobranca (o minimo que faz escrever_carteira passar)

  A URL que se cadastra no Portal Developers do Sicoob:

      https://financeiro.blackhaus.io/api/liquidacoes/webhook-sicoob/${tenant}

  Provisionar (ensaio primeiro - ele da ROLLBACK e mostra o que faria):

      psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \\
        -v modo=ensaio \\
        -v tenant_id='${tenant}' \\
        -v auth_user_id='${auth}' \\
        -f scripts/provisionar-servico-de-cobranca.sql

  Depois, o mesmo comando com -v modo=valendo.
`);
