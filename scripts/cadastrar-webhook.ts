// CADASTRA NA SICOOB A URL QUE RECEBE O AVISO DE PAGAMENTO. `POST /webhooks`.
//
// ============================================================================
// POR QUE ESTE SCRIPT EXISTE, e a razao mudou em 09/09/2026
//
// Ate esta data o projeto registrava, em dois lugares, que *"o cadastro e feito
// no portal, a mao"* - `src/sicoob/http.ts` e a `Q-WEBHOOK-CADASTRO-01`. Era
// suposicao herdada de material publico, e ninguem tinha aberto a tela.
//
// O dono abriu. **O aplicativo do Portal Developers NAO TEM configuracao de
// webhook**: a pagina lista dados do cooperado, `client_id`, o token endpoint e
// os escopos das quatro APIs, e nada mais. Nao ha caminho manual. Ou este
// `POST` existe, ou o banco nunca notifica - e sem notificacao o dinheiro entra
// na conta e o sistema nao sabe.
//
// ============================================================================
// USO
//
//   npm run webhook-sicoob -- --auth-user <uuid> --email <endereco>      (ENSAIO)
//   npm run webhook-sicoob -- --auth-user <uuid> --email <endereco> --valendo
//
//   opcionais: --tenant <uuid> · --ref <credencial> · --url <https://...>
//
// O PADRAO E ENSAIO, e ele nao chama a Sicoob: imprime a URL, o corpo exato e o
// escopo que subiriam. A razao e que este cadastro **nao tem inverso barato** -
// cadastrar duas vezes cria dois webhooks, e o banco passa a notificar duas
// vezes o mesmo pagamento. A idempotencia do nosso lado protege o dinheiro (a
// baixa repetida e silenciosa desde sempre), mas a duplicata continua sendo
// sujeira no cadastro do banco que so o suporte desfaz.
//
// ELE RODA NA VPS, com a env de producao - e isso e diferente do
// `escopos-sicoob.ts`, que exige a conexao de DONO. A diferenca e o caminho ate
// o certificado: aqui quem resolve e `cofreDoVault`, a funcao SECURITY DEFINER
// da migration 35, que a role de runtime alcanca sem enxergar o `vault`.
//
//   systemd-run --wait --pipe --collect --quiet \
//     --property=EnvironmentFile=/etc/financeiro.env \
//     --working-directory=/opt/financeiro/app \
//     /opt/financeiro/node/bin/node --experimental-strip-types \
//     scripts/cadastrar-webhook.ts --auth-user <uuid> --email <endereco>

import { iniciar, encerrarApp } from '../src/app.ts';
import { CobrancaSicoob, ErroDaSicoob, ESCOPOS_DE_WEBHOOK, ehUrlDeWebhook,
         TIPO_MOVIMENTO_PAGAMENTO, PERIODO_MOVIMENTO_ATUAL } from '../src/sicoob/http.ts';
import { cofreDoVault } from '../src/sicoob/cofre.ts';
import { urlDoWebhook } from '../src/sicoob/webhook.ts';
import { tenantCorrente } from '../src/db/contexto.ts';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tem = (n: string) => process.argv.includes(`--${n}`);

function morrer(msg: string): never {
  console.error(`\n  ERRO: ${msg}\n`);
  process.exit(2);
}

const AUTH = arg('auth-user');
const TENANT = arg('tenant');
const EMAIL = arg('email');
const REF = arg('ref') ?? 'sicoob-g3-a1';
const VALENDO = tem('valendo');

if (!AUTH) morrer('--auth-user <uuid> e obrigatorio (e quem assina a leitura do cofre).');
if (!EMAIL) {
  morrer(
    '--email <endereco> e obrigatorio, e ele NAO e burocracia: e para onde a Sicoob avisa\n'
    + '  que a notificacao esta FALHANDO. Sem alguem lendo esse endereco, "o dinheiro parou\n'
    + '  de ser avisado" nao chega a ninguem - do nosso lado a recusa e silenciosa por tras\n'
    + '  do 404 generico da guarda de origem.');
}

const a = await iniciar();
const sessao = await a.login(AUTH);

try {
  await a.withTenant(sessao, TENANT, async () => {
    /* O tenant sai do CONTEXTO e nao da sessao. A primeira versao lia
     * `sessao.tenant_id`, que nao existe: a URL saiu com "undefined" no lugar do
     * uuid, no ensaio, antes de qualquer chamada. E o motivo de o ensaio ser o
     * padrao - essa URL teria sido cadastrada no banco e nenhuma notificacao
     * jamais chegaria, com os dois lados achando que estava certo. */
    const tenant = tenantCorrente();
    const url = arg('url') ?? urlDoWebhook(tenant);

    if (!ehUrlDeWebhook(url)) {
      morrer(`a URL ${JSON.stringify(url)} nao e https na porta 443 - a Sicoob a recusaria na validacao.`);
    }

    const corpo = {
      url,
      codigoTipoMovimento: TIPO_MOVIMENTO_PAGAMENTO,
      codigoPeriodoMovimento: PERIODO_MOVIMENTO_ATUAL,
      email: EMAIL,
    };

    console.log(`
  CADASTRO DO WEBHOOK DE LIQUIDACAO — ${VALENDO ? 'VALENDO' : 'ENSAIO (nada e enviado)'}

    tenant .......... ${tenant}
    credencial ...... ${REF}
    escopo do token . ${ESCOPOS_DE_WEBHOOK.join(' ')}   <- so este; o de boleto nao entra
    POST ............ <base da cobranca v3>/webhooks

    corpo:
${JSON.stringify(corpo, null, 6).split('\n').map((l) => `      ${l}`).join('\n')}
`);

    if (!VALENDO) {
      console.log(
        '  Nada foi enviado. Confira a URL e o e-mail acima e repita com --valendo.\n'
        + '  ⚠️ Cadastrar duas vezes cria DOIS webhooks e o banco notifica em dobro.\n');
      return;
    }

    const porta = new CobrancaSicoob({ resolver: cofreDoVault });
    try {
      const r = await porta.cadastrarWebhook(REF, { url, email: EMAIL });
      console.log(`  ✅ CADASTRADO. idWebhook = ${r.idWebhook}

  GUARDE ESTE NUMERO: e o que identifica o webhook nas consultas e alteracoes.

  O que acontece agora, sem ninguem fazer nada: a Sicoob manda uma NOTIFICACAO DE
  VALIDACAO para a URL acima ({"idWebhook":N,"validacaoWebhook":true}). O nosso
  endpoint responde 200, que e um dos tres codigos que ela aceita.

  Conferir que ela chegou:  grep webhook-sicoob /var/log/nginx/access.log
`);
    } catch (err: any) {
      if (err instanceof ErroDaSicoob) {
        console.error(`\n  ❌ A SICOOB RECUSOU: ${err.message}`);
        console.error('     Nenhum webhook foi cadastrado. Os codigos acima sao do banco.\n');
        process.exit(1);
      }
      throw err;
    }
  });
} finally {
  await encerrarApp();
}
