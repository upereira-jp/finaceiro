// O WEBHOOK DE LIQUIDACAO NA SICOOB - consultar, cadastrar e diagnosticar.
//
// ============================================================================
// POR QUE ISTO E CODIGO, e a razao so ficou conhecida em 09/09/2026
//
// Ate esta data o projeto registrava, em dois lugares, que *"o cadastro e feito
// no portal, a mao"*. Era suposicao herdada de material publico. O dono abriu o
// aplicativo do Portal Developers e conferiu campo a campo: a pagina lista dados
// do cooperado, `client_id`, o token endpoint e os escopos das quatro APIs, e
// NADA MAIS. **Nao ha configuracao de webhook.** Ou estes endpoints existem, ou
// o banco nunca notifica - e o dinheiro entra na conta sem o sistema saber.
//
// ============================================================================
// USO
//
//   npm run webhook-sicoob -- --auth-user <uuid>                        (CONSULTA)
//   npm run webhook-sicoob -- --auth-user <uuid> --cadastrar --email <e>  (ENSAIO)
//   npm run webhook-sicoob -- --auth-user <uuid> --cadastrar --email <e> --valendo
//   npm run webhook-sicoob -- --auth-user <uuid> --solicitacoes --data 2026-09-10
//
//   opcionais: --tenant · --ref · --url · --id <idWebhook> · --situacao <2|3|6>
//              --nosso-numero <n> · --pagina <n> · --mesmo-assim
//
// A CONSULTA E O PADRAO, e isso e desenho: e a unica das tres acoes que nao
// muda nada, e e a que responde as duas perguntas que aparecem primeiro - "ja
// existe um?" e "ele ainda esta vivo?".
//
// O CADASTRO NAO TEM INVERSO NESTE SCRIPT. `POST /webhooks` nao e idempotente:
// cadastrar duas vezes cria dois webhooks e o banco notifica em DOBRO. Por isso
// o `--cadastrar` CONSULTA ANTES e recusa quando ja ha um do mesmo tipo, e por
// isso o padrao dele e ensaio.
//
// RODA NA VPS com a env de producao - quem resolve o certificado e `cofreDoVault`,
// a funcao SECURITY DEFINER da migration 35, que a role de runtime alcanca sem
// enxergar o `vault`:
//
//   systemd-run --wait --pipe --collect --quiet \
//     --property=EnvironmentFile=/etc/financeiro.env \
//     --working-directory=/opt/financeiro/app \
//     /opt/financeiro/node/bin/node --experimental-strip-types \
//     scripts/webhook-sicoob.ts --auth-user <uuid>

import { iniciar, encerrarApp } from '../src/app.ts';
import {
  CobrancaSicoob, ErroDaSicoob, ESCOPOS_DE_WEBHOOK, ehUrlDeWebhook, webhookInativo,
  TIPO_MOVIMENTO_PAGAMENTO, PERIODO_MOVIMENTO_ATUAL,
  SOLICITACAO_ENVIADA, SOLICITACAO_COM_ERRO,
  type WebhookCadastrado,
} from '../src/sicoob/http.ts';
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
const REF = arg('ref') ?? 'sicoob-g3-a1';
const CADASTRAR = tem('cadastrar');
const SOLICITACOES = tem('solicitacoes');
const VALENDO = tem('valendo');

if (!AUTH) morrer('--auth-user <uuid> e obrigatorio (e quem assina a leitura do cofre).');
if (CADASTRAR && SOLICITACOES) morrer('--cadastrar e --solicitacoes sao acoes diferentes; rode uma por vez.');

/** Uma linha por webhook, e a INATIVACAO grita. Ver `consultarWebhooks`: o banco
 *  inativa o webhook quando a entrega falha, e um webhook inativo nao avisa. */
function mostrar(w: WebhookCadastrado) {
  const morto = webhookInativo(w);
  console.log(`    ${morto ? '☠️ INATIVO' : '✅ ativo  '}  id ${w.idWebhook}  tipo ${w.codigoTipoMovimento}  ${w.url}`);
  console.log(`                  situacao ${w.codigoSituacao} (${w.descricaoSituacao ?? '-'}) · e-mail ${w.email ?? '-'}`);
  if (morto) {
    console.log(`                  ⚠️ inativado em ${w.dataHoraInativacao}: ${w.descricaoMotivoInativacao ?? 'sem motivo'}`);
    console.log('                  ENQUANTO ESTIVER ASSIM, NENHUM PAGAMENTO E AVISADO.');
  }
}

const a = await iniciar();
const sessao = await a.login(AUTH);

try {
  await a.withTenant(sessao, TENANT, async () => {
    /* O tenant sai do CONTEXTO e nao da sessao. A primeira versao lia
     * `sessao.tenant_id`, que nao existe: a URL saiu com "undefined" no lugar do
     * uuid, no ensaio, antes de qualquer chamada. */
    const tenant = tenantCorrente();
    const porta = new CobrancaSicoob({ resolver: cofreDoVault });

    // ------------------------------------------------------- solicitacoes
    if (SOLICITACOES) {
      const data = arg('data');
      if (!data) morrer('--data yyyy-MM-dd e obrigatorio: o banco filtra as solicitacoes por dia.');
      const id = arg('id');
      if (!id) {
        const todos = await porta.consultarWebhooks(REF, { codigoTipoMovimento: TIPO_MOVIMENTO_PAGAMENTO });
        if (todos.length !== 1) {
          morrer(`ha ${todos.length} webhook(s) do tipo ${TIPO_MOVIMENTO_PAGAMENTO}; informe --id <idWebhook>.`);
        }
        console.log(`\n  (usando o unico webhook cadastrado: id ${todos[0]!.idWebhook})`);
      }
      const idUsado = id ?? (await porta.consultarWebhooks(REF, { codigoTipoMovimento: TIPO_MOVIMENTO_PAGAMENTO }))[0]!.idWebhook;

      const p = await porta.solicitacoesDoWebhook(REF, idUsado, {
        dataSolicitacao: data,
        pagina: arg('pagina') ? Number(arg('pagina')) : undefined,
        codigoSolicitacaoSituacao: arg('situacao') ? Number(arg('situacao')) : undefined,
        nossoNumero: arg('nosso-numero'),
        codigoBarras: arg('codigo-barras'),
      });

      console.log(`\n  SOLICITACOES DE ${data} — webhook ${idUsado}`);
      console.log(`  pagina ${p.paginaAtual} de ${p.totalPaginas} · ${p.totalRegistros} registro(s)\n`);
      if (!p.solicitacoes.length) {
        console.log('  NENHUMA. O banco nao tentou notificar neste dia - o que, num dia com pagamento,');
        console.log('  aponta para o cadastro do webhook e nao para o nosso endpoint.\n');
        return;
      }
      for (const s of p.solicitacoes) {
        const rotulo = s.validacaoWebhook ? 'VALIDACAO DA URL' : `titulo ${s.nossoNumero ?? '-'}`;
        const marca = s.codigoSolicitacaoSituacao === SOLICITACAO_ENVIADA ? '✅'
          : s.codigoSolicitacaoSituacao === SOLICITACAO_COM_ERRO ? '❌' : '⏳';
        console.log(`    ${marca} ${rotulo} — ${s.descricaoSolicitacaoSituacao ?? s.codigoSolicitacaoSituacao} · ${s.dataHoraCadastro ?? ''}`);
        if (s.descricaoErroProcessamento) console.log(`       erro: ${s.descricaoErroProcessamento}`);
        for (const n of s.notificacoes) {
          console.log(`       -> ${n.codigoStatusRequisicao} em ${n.tempoComunicao ?? '?'}s · ${n.url ?? ''}`);
          if (n.descricaoCodigoStatusRequisicao) {
            console.log(`          nossa resposta: ${n.descricaoCodigoStatusRequisicao.slice(0, 160)}`);
          }
        }
      }
      console.log('');
      return;
    }

    // ------------------------------------------------ consulta (o padrao)
    const existentes = await porta.consultarWebhooks(REF);
    console.log(`\n  WEBHOOKS CADASTRADOS — tenant ${tenant}, credencial ${REF}\n`);
    if (!existentes.length) console.log('    (nenhum)\n');
    else { existentes.forEach(mostrar); console.log(''); }

    if (!CADASTRAR) {
      console.log('  Para cadastrar:  --cadastrar --email <endereco>   (ensaio; some --valendo para gravar)\n');
      return;
    }

    // -------------------------------------------------------- cadastrar
    const EMAIL = arg('email');
    if (!EMAIL) {
      morrer(
        '--email <endereco> e obrigatorio, e ele NAO e burocracia: e para onde a Sicoob avisa\n'
        + '  que a notificacao esta FALHANDO - e o proprio contrato mostra que ela INATIVA o\n'
        + '  webhook quando a entrega falha. Sem alguem lendo esse endereco, o aviso de que o\n'
        + '  dinheiro parou de ser avisado nao chega a ninguem.');
    }

    /* A GUARDA QUE O `GET` DESTRAVOU. Ate ela existir, isto era um aviso em
     * maiusculas e a duplicata dependia de alguem ler. */
    const doMesmoTipo = existentes.filter((w) => w.codigoTipoMovimento === TIPO_MOVIMENTO_PAGAMENTO && !webhookInativo(w));
    if (doMesmoTipo.length && !tem('mesmo-assim')) {
      morrer(
        `ja existe webhook ATIVO do tipo ${TIPO_MOVIMENTO_PAGAMENTO} (id ${doMesmoTipo.map((w) => w.idWebhook).join(', ')}).\n`
        + '  Cadastrar outro faz o banco notificar em DOBRO o mesmo pagamento, e este script nao\n'
        + '  desfaz. Se a URL mudou, o caminho e o PATCH e nao um segundo cadastro.\n'
        + '  Para insistir mesmo assim: --mesmo-assim');
    }

    const url = arg('url') ?? urlDoWebhook(tenant);
    if (!ehUrlDeWebhook(url)) morrer(`a URL ${JSON.stringify(url)} nao e https na porta 443 - a Sicoob a recusaria na validacao.`);

    const corpo = { url, codigoTipoMovimento: TIPO_MOVIMENTO_PAGAMENTO, codigoPeriodoMovimento: PERIODO_MOVIMENTO_ATUAL, email: EMAIL };
    console.log(`  CADASTRO — ${VALENDO ? 'VALENDO' : 'ENSAIO (nada e enviado)'}
    escopo do token . ${ESCOPOS_DE_WEBHOOK.join(' ')}   <- so este; o de boleto nao entra
    POST ............ <base da cobranca v3>/webhooks
    corpo ........... ${JSON.stringify(corpo)}
`);

    if (!VALENDO) {
      console.log('  Nada foi enviado. Confira a URL e o e-mail acima e repita com --valendo.\n');
      return;
    }

    try {
      const r = await porta.cadastrarWebhook(REF, { url, email: EMAIL });
      console.log(`  ✅ CADASTRADO. idWebhook = ${r.idWebhook}

  A Sicoob manda agora uma NOTIFICACAO DE VALIDACAO para a URL, e o nosso endpoint
  responde 200 - um dos tres codigos que ela aceita. Conferir dos dois lados:

    grep webhook-sicoob /var/log/nginx/access.log
    npm run webhook-sicoob -- --auth-user ${AUTH} --solicitacoes --data ${new Date().toISOString().slice(0, 10)}
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
