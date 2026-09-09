// COMO CADA ROTA E AUTENTICADA, e a verificacao de origem do webhook. Sem banco.
// Uso: node --experimental-strip-types tests/rotas-auth.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE
//
// O `ADR-0006` decidiu que a rota DECLARA o modo de autenticacao, e o argumento
// que descartou a alternativa foi este: enquanto o escape da sessao era um `if`
// literal dentro do servidor, "duas condicoes viram cinco, e o dia em que alguem
// acrescentar a sexta sem querer e o dia em que uma rota fica publica sem que
// nada acuse".
//
// Virando dado, o INVERSO passa a ser afirmavel - e e o que a §1 faz: nao
// "estas rotas escapam", mas **exatamente estas e mais nenhuma**. Rota nova
// nasce `sessao` por ausencia; quem a tornar publica muda uma linha que esta
// suite le.
//
// A §2 e a outra metade do invariante, e a ADR e explicita sobre ela: `auth:
// 'webhook'` NAO significa "sem autenticacao", significa "autenticado por outro
// mecanismo". Uma rota marcada `webhook` que nao passe pela verificacao de
// origem e "um buraco com nome bonito". Entao ela verifica as duas direcoes:
// que a origem legitima passa, e que cada forma de origem ilegitima e recusada.
//
// LE `rotas.ts` E `servidor.ts` COMO TEXTO, e nao os importa. Mesmo desenho do
// `tests/prontidao-destino.ts` e pela mesma razao: importar a tabela de rotas
// arrasta os repositorios, e eles abrem conexao com o banco. A lista sai da
// FONTE e nao de uma copia escrita aqui, que envelheceria em silencio.

import { readFileSync } from 'node:fs';
import {
  verificarOrigem, lerConfig, ipCasa, normalizarIp, ehLoopback,
  type Evidencia, type ConfigDaOrigem,
} from '../src/http/origem-do-webhook.ts';
import { IPS_DO_SICOOB, BLOCOS_DECLARADOS, HOSTS_DECLARADOS, linhaDeAmbiente } from '../src/http/ips-do-sicoob.ts';
import { authUserIdDeServico, uuidV5, ehUuid, NAMESPACE_SERVICO } from '../src/auth/usuario-de-servico.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

// ============================================================================
// 1. A TABELA DE ROTAS - quem escapa da sessao
// ============================================================================

const fonteRotas = readFileSync(new URL('../src/http/rotas.ts', import.meta.url), 'utf8');
const fonteServidor = readFileSync(new URL('../src/http/servidor.ts', import.meta.url), 'utf8');

const ENTRADA = /metodo: '([A-Z]+)', padrao: '([^']+)'(?:, auth: '([a-z]+)')?/g;
const rotas = [...fonteRotas.matchAll(ENTRADA)]
  .map(([, metodo, padrao, auth]) => ({ metodo, padrao, auth: auth ?? 'sessao' }));

chk('RA0', rotas.length > 100,
    `a extracao achou a tabela inteira: ${rotas.length} rotas`);

/*
 * A LISTA FECHADA. Acrescentar uma linha aqui e um ato deliberado, com revisao -
 * que e exatamente o custo que a ADR quis criar. Se esta verificacao falhar,
 * NAO conserte a lista sem responder a pergunta que ela faz: por que esta rota
 * nao precisa de sessao?
 */
const ESCAPAM = [
  { metodo: 'GET', padrao: '/publico/config', auth: 'publica' },
  { metodo: 'POST', padrao: '/liquidacoes/webhook-sicoob/:tenant', auth: 'webhook' },
];

const escapando = rotas.filter((r) => r.auth !== 'sessao')
  .map((r) => `${r.metodo} ${r.padrao} [${r.auth}]`).sort();
const esperado = ESCAPAM.map((r) => `${r.metodo} ${r.padrao} [${r.auth}]`).sort();

chk('RA1', JSON.stringify(escapando) === JSON.stringify(esperado),
    'EXATAMENTE estas rotas escapam da sessao, e mais nenhuma'
    + (JSON.stringify(escapando) === JSON.stringify(esperado)
        ? '' : `\n       na tabela: ${escapando.join(' | ') || '(nenhuma)'}\n       esperado:  ${esperado.join(' | ')}`));

chk('RA2', rotas.every((r) => ['sessao', 'publica', 'webhook'].includes(r.auth)),
    'nenhuma rota declara um modo que o servidor nao conhece');

chk('RA3', rotas.filter((r) => r.auth === 'publica').every((r) => r.padrao.startsWith('/publico/')),
    'rota `publica` mora sob /publico/ - o prefixo diz na URL o que o modo diz no codigo');

chk('RA4', rotas.filter((r) => r.auth === 'webhook').length === 1,
    'ha UM webhook, e nao uma familia deles nascendo sem que ninguem note');

/*
 * O `if` LITERAL NAO PODE VOLTAR. Ele e o mecanismo que a Decisao 4 substituiu,
 * e a forma de ele voltar nao e alguem reverter o commit - e alguem precisar de
 * "so mais uma excecao" e achar mais rapido escreve-la ali.
 */
chk('RA5', !fonteServidor.includes("caminho === '/publico/config'"),
    'o escape da sessao NAO e mais uma condicao literal dentro do servidor');

chk('RA6', fonteServidor.includes("achou.rota.auth === 'publica'")
        && fonteServidor.includes("achou.rota.auth === 'webhook'"),
    'o servidor despacha pelo modo DECLARADO na rota que casou');

/* A outra metade do invariante da ADR: marcada `webhook` e sem verificacao e
 * buraco com nome bonito. */
const trechoWebhook = fonteServidor.slice(fonteServidor.indexOf("achou.rota.auth === 'webhook'"));
chk('RA7', trechoWebhook.slice(0, 1200).includes('verificarOrigem('),
    'o ramo `webhook` chama a verificacao de origem ANTES de qualquer outra coisa');

chk('RA8', trechoWebhook.slice(0, 2000).includes("erro: 'RotaNaoEncontrada'"),
    'origem nao verificada sai como o 404 GENERICO - 401 confirmaria que o endpoint existe');

// ============================================================================
// 2. A VERIFICACAO DE ORIGEM - as duas direcoes
// ============================================================================

const FAIXA: ConfigDaOrigem = { ips: ['200.201.160.0/20', '198.51.100.7'], viaProxy: false };
const evidencia = (e: Partial<Evidencia> = {}): Evidencia => ({
  ip: undefined, daLoopback: false, tlsAutorizado: false, tlsSujeito: undefined,
  cabecalhoVerificado: undefined, cabecalhoSujeito: undefined, cabecalhoIp: undefined, ...e,
});

// --- a direcao que PASSA
chk('OR1', verificarOrigem(
      evidencia({ ip: '200.201.160.9', tlsAutorizado: true, tlsSujeito: 'sicoob.com.br' }), FAIXA).verificada,
    'TLS no Node com peer autorizado + IP na faixa: PASSA');

chk('OR2', verificarOrigem(
      evidencia({ ip: '127.0.0.1', daLoopback: true, cabecalhoVerificado: 'SUCCESS',
                  cabecalhoSujeito: 'CN=sicoob.com.br', cabecalhoIp: '198.51.100.7' }),
      { ...FAIXA, viaProxy: true }).verificada,
    'proxy local que repassa SUCCESS + o IP real na faixa: PASSA');

// --- as direcoes que RECUSAM, uma por modo de falha
chk('OR3', !verificarOrigem(
      evidencia({ ip: '200.201.160.9', tlsAutorizado: true }), { ips: [], viaProxy: false }).verificada,
    'WEBHOOK_IPS vazio recusa MESMO com certificado verificado - a faixa entra sempre');

/*
 * ⚠️ OR4 MUDOU DE SINAL EM 08/09/2026, e a inversao e registro e nao conserto.
 *
 * Ela afirmava "a faixa nunca vale sozinha", que era a Decisao 1 da ADR-0006:
 * mTLS + IP. O suporte da Sicoob respondeu que a notificacao NAO usa mTLS, nem
 * cabecalho, nem assinatura - das quatro formas possiveis a outra ponta nao
 * oferece nenhuma. Exigir certificado passou a significar RECUSAR TODA
 * NOTIFICACAO, em silencio, atras do 404 generico.
 *
 * O que compensa a guarda mais fraca esta fora deste arquivo: o webhook deixou
 * de repartir dinheiro (`Q-BAIXAOPER-01`). Ver `adr/ADR-0006` §9.
 */
chk('OR4', verificarOrigem(evidencia({ ip: '200.201.160.9' }), FAIXA).verificada,
    'IP na faixa e sem certificado: PASSA - a faixa ficou sozinha porque a Sicoob nao apresenta '
    + 'certificado no envio, e uma guarda que recusa 100% das notificacoes nao guarda nada');

chk('OR4b', !verificarOrigem(evidencia({ ip: '200.201.160.9' }), { ...FAIXA, sujeitoEsperado: 'sicoob' }).verificada,
    'com WEBHOOK_MTLS_SUJEITO configurado o certificado volta a ser exigido: RECUSA - e o caminho '
    + 'de reativar a guarda antiga por configuracao, sem editar codigo, se a outra ponta mudar');

/* O MODO DE FALHA QUE A ADR NOMEIA: "proxy que nao repassa o certificado entrega
 * uma requisicao indistinguivel de uma autenticada". Aqui quem afirma o SUCCESS
 * e o proprio chamador, de fora. */
chk('OR5', !verificarOrigem(
      evidencia({ ip: '200.201.160.9', daLoopback: false, cabecalhoVerificado: 'SUCCESS',
                  cabecalhoSujeito: 'CN=quem-quiser' }),
      { ...FAIXA, viaProxy: true, sujeitoEsperado: 'sicoob' }).verificada,
    'ssl-client-verify: SUCCESS vindo de FORA da loopback continua nao valendo como certificado: '
    + 'RECUSA. A licao da ADR ("proxy que nao repassa o certificado entrega uma requisicao '
    + 'indistinguivel de uma autenticada") sobreviveu a queda do mTLS obrigatorio');

/* A OUTRA METADE, e ela ficou MAIS importante com o IP sozinho: se `X-Real-IP` de
 * fora da loopback valesse, qualquer um se declararia dentro da faixa e a unica
 * guarda que restou seria um cabecalho digitado pelo proprio chamador. */
chk('OR5b', !verificarOrigem(
      evidencia({ ip: '203.0.113.9', daLoopback: false, cabecalhoIp: '200.201.160.9' }),
      { ...FAIXA, viaProxy: true }).verificada,
    'X-Real-IP vindo de FORA da loopback nao substitui o IP do socket: RECUSA - com a faixa '
    + 'sozinha, aceitar esse cabecalho entregaria a autenticacao inteira a quem chama');

chk('OR6', !verificarOrigem(
      evidencia({ ip: '127.0.0.1', daLoopback: true, cabecalhoVerificado: 'SUCCESS',
                  cabecalhoIp: '198.51.100.7' }), FAIXA).verificada,
    'sem WEBHOOK_MTLS_VIA_PROXY o cabecalho nao vale nem da loopback: RECUSA');

chk('OR7', !verificarOrigem(
      evidencia({ ip: '203.0.113.9', tlsAutorizado: true, tlsSujeito: 'sicoob.com.br' }), FAIXA).verificada,
    'certificado verificado e IP fora da faixa: RECUSA');

chk('OR8', !verificarOrigem(
      evidencia({ ip: '200.201.160.9', tlsAutorizado: true, tlsSujeito: 'outro.com.br' }),
      { ...FAIXA, sujeitoEsperado: 'sicoob' }).verificada,
    'subject que nao contem o esperado: RECUSA');

/* Atras de proxy o `remoteAddress` e o PROPRIO PROXY. Conferir ele autorizaria a
 * loopback em vez do banco - e a loopback nunca esta na faixa, entao o erro
 * apareceria como recusa e alguem "consertaria" pondo 127.0.0.1 na lista. */
chk('OR9', !verificarOrigem(
      evidencia({ ip: '127.0.0.1', daLoopback: true, cabecalhoVerificado: 'SUCCESS',
                  cabecalhoIp: '203.0.113.9' }), { ...FAIXA, viaProxy: true }).verificada,
    'atras de proxy quem e conferido e o IP REPASSADO, nao o do socket: RECUSA');

// --- as bordas do casamento de IP
chk('IP1', ipCasa('200.201.175.254', '200.201.160.0/20'), 'CIDR /20 casa o ultimo endereco da faixa');
chk('IP2', !ipCasa('200.201.176.1', '200.201.160.0/20'), 'CIDR /20 NAO casa o primeiro de fora');
chk('IP3', ipCasa('::ffff:198.51.100.7', '198.51.100.7'), 'IPv4 mapeado em IPv6 e o mesmo endereco');
chk('IP4', ipCasa('198.51.100.7', '198.51.100.7/32'), '/32 casa exatamente um');
chk('IP5', !ipCasa('198.51.100.8', '198.51.100.7/32'), '/32 nao casa o vizinho');
chk('IP6', !ipCasa(undefined, '0.0.0.0/0'), 'IP desconhecido nao casa NEM /0 - ausencia nao e endereco');
chk('IP7', !ipCasa('198.51.100.7', '198.51.100.0/33'), 'mascara invalida nao casa nada, em vez de casar tudo');
chk('IP8', normalizarIp('::FFFF:1.2.3.4') === '1.2.3.4' && ehLoopback('::1'),
    'normalizacao e loopback reconhecem as duas formas');

// ============================================================================
// 2.b A LISTA REAL DA SICOOB (09/09/2026) - a transcricao contra a mensagem
// ============================================================================
//
// POR QUE ISTO E TESTE E NAO SO UM DOCUMENTO: a lista chegou como texto de
// WhatsApp, foi transcrita a mao para `src/http/ips-do-sicoob.ts`, e um digito
// trocado ali nao produz erro - produz notificacao de pagamento recusada com o
// 404 generico, que e indistinguivel de "a Sicoob nao chamou". Estas
// verificacoes refazem a aritmetica do banco contra os numeros que ELE
// imprimiu, e nao contra a nossa propria transcricao.

const inteiroV4 = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0) >>> 0;
const textoV4 = (x: number) => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
const redeE = (cidr: string) => {
  const [r, b] = cidr.split('/');
  const masc = (0xffffffff << (32 - Number(b))) >>> 0;
  const rede = (inteiroV4(r) & masc) >>> 0;
  return { rede, fim: (rede | (~masc >>> 0)) >>> 0 };
};

/* SIC1 e a verificacao central: para cada bloco, a mascara que gravamos tem de
 * produzir EXATAMENTE o primeiro host, o ultimo host e a contagem que o banco
 * escreveu. Mascara larga demais, estreita demais ou octeto trocado quebram
 * pelo menos uma das tres. */
let transcricaoOk = true;
let somaDeHosts = 0;
for (const b of BLOCOS_DECLARADOS) {
  const { rede, fim } = redeE(b.cidr);
  somaDeHosts += b.hosts;
  if (textoV4(rede + 1) !== b.primeiro) transcricaoOk = false;
  if (textoV4(fim - 1) !== b.ultimo) transcricaoOk = false;
  if (fim - rede - 1 !== b.hosts) transcricaoOk = false;
  // e o bloco tem de estar na lista que o ambiente vai receber
  if (!IPS_DO_SICOOB.includes(b.cidr as (typeof IPS_DO_SICOOB)[number])) transcricaoOk = false;
}
chk('SIC1', transcricaoOk,
    'os 9 blocos: a mascara gravada reproduz o primeiro host, o ultimo host e a contagem que '
    + 'o Sicoob declarou por escrito em cada um - e todos os 9 estao na lista publicada');

chk('SIC2', somaDeHosts === HOSTS_DECLARADOS && BLOCOS_DECLARADOS.length === IPS_DO_SICOOB.length,
    `a soma dos hosts da os ${HOSTS_DECLARADOS} do cabecalho da mensagem, e nao ha bloco a mais `
    + 'nem a menos entre o declarado e o publicado');

/* SIC3 - O ROTULO FORA DA FORMA NORMAL. O banco escreveu `177.53.253.0/23` para
 * o intervalo 177.53.252.1-177.53.253.254. Normalizamos para `177.53.252.0/23`,
 * e normalizar e mudar o TEXTO: esta verificacao prova que nao mudou o
 * CONJUNTO. Se algum dia alguem "consertar" a normalizacao de volta, os dois
 * lados continuam tendo de aceitar os mesmos enderecos. */
const foraDaForma = BLOCOS_DECLARADOS.find((b) => b.rotuloRecebido !== b.cidr)!;
chk('SIC3', foraDaForma !== undefined
        && ['177.53.252.0', '177.53.252.1', '177.53.253.254', '177.53.253.255']
             .every((ip) => ipCasa(ip, foraDaForma.cidr) === ipCasa(ip, foraDaForma.rotuloRecebido))
        && !ipCasa('177.53.251.255', foraDaForma.cidr) && !ipCasa('177.53.254.0', foraDaForma.cidr),
    'o rotulo recebido `177.53.253.0/23` e a forma normalizada `177.53.252.0/23` aceitam '
    + 'exatamente os mesmos enderecos: a normalizacao mexeu no texto e nao no conjunto');

/* SIC4 - AS BORDAS DE FORA. Quatro dos blocos sao contiguos (177.53.249.0 ate
 * 177.53.255.255 sem buraco), entao o vizinho de um bloco costuma ser OUTRO
 * bloco da lista. Os enderecos abaixo estao fora de TODOS os nove. */
const listaCasa = (ip: string) => IPS_DO_SICOOB.some((e) => ipCasa(ip, e));
chk('SIC4', ['177.53.248.255', '177.54.0.0', '187.4.128.127', '187.4.128.192',
             '187.72.5.127', '187.72.6.0', '189.74.157.191', '189.74.158.0',
             '200.186.0.95', '200.186.0.128', '201.45.121.79', '201.45.121.96']
            .every((ip) => !listaCasa(ip)),
    'o endereco imediatamente antes e imediatamente depois de cada faixa contigua e RECUSADO - '
    + 'e o que acusa mascara larga demais, que aceitaria vizinho de graca');

chk('SIC5', ['177.53.249.1', '177.53.255.254', '187.4.128.129', '187.72.5.200',
             '189.74.157.254', '200.186.0.126', '201.45.121.81']
            .every((ip) => listaCasa(ip)),
    'enderecos de dentro de blocos diferentes sao aceitos - a lista cobre os 9, e nao so o primeiro');

/*
 * ⚠️ SIC6 E A ARMADILHA QUE FARIA A LISTA INTEIRA NAO VALER NADA, e ela nao
 * esta na lista: esta na TOPOLOGIA.
 *
 * O `financeiro.service` escuta em 127.0.0.1:3000 e quem fala com a internet e
 * o nginx. Entao o `remoteAddress` de TODA notificacao da Sicoob e 127.0.0.1, e
 * o IP real chega no `X-Real-IP` - que o vhost ja repassa desde sempre.
 * `verificarOrigem` so olha esse cabecalho quando `viaProxy` esta ligado.
 *
 * COM `WEBHOOK_IPS` PREENCHIDO E `WEBHOOK_MTLS_VIA_PROXY` AUSENTE, o que e
 * conferido contra a lista e 127.0.0.1 - que nunca esta nela. Resultado: 100%
 * das notificacoes recusadas, com o 404 generico, sem erro visivel de nenhum
 * lado. E o mesmo modo de falha da §9.1 da ADR-0006, com outra causa.
 *
 * O nome da variavel diz `MTLS` por historia: ela nasceu para repassar o
 * resultado do certificado. Com o mTLS morto (§9), o que ela governa hoje e o
 * IP - e por isso ela deixou de ser opcional nesta topologia.
 */
const producao = (ipReal: string, viaProxy: boolean) => verificarOrigem(
  evidencia({ ip: '127.0.0.1', daLoopback: true, cabecalhoIp: ipReal }),
  { ips: [...IPS_DO_SICOOB], viaProxy });

chk('SIC6', producao('177.53.252.10', true).verificada && !producao('177.53.252.10', false).verificada,
    'ATRAS DO NGINX a mesma notificacao legitima PASSA com WEBHOOK_MTLS_VIA_PROXY=1 e RECUSA sem '
    + 'ele: com a lista certa e a flag ausente, 100% das notificacoes morrem no 404 generico');

chk('SIC7', !producao('203.0.113.9', true).verificada,
    'e a flag nao afrouxa nada: IP repassado de fora da lista continua RECUSADO');

/* SIC8 - A LINHA QUE O DONO COLA em /etc/financeiro.env e a lista que estas
 * verificacoes acabaram de conferir. Sem isto, o teste prova a lista do
 * repositorio e a producao recebe outra coisa. */
const doAmbiente = lerConfig({ WEBHOOK_IPS: linhaDeAmbiente().replace(/^WEBHOOK_IPS="|"$/g, '') });
chk('SIC8', JSON.stringify(doAmbiente.ips) === JSON.stringify([...IPS_DO_SICOOB]),
    'a linha pronta de ambiente atravessa `lerConfig` e volta exatamente a lista verificada acima');

// --- a configuracao
const cfg = lerConfig({ WEBHOOK_IPS: ' 1.2.3.0/24 , 4.5.6.7 ', WEBHOOK_MTLS_VIA_PROXY: '1', WEBHOOK_MTLS_SUJEITO: ' sicoob ' });
chk('CF1', JSON.stringify(cfg.ips) === JSON.stringify(['1.2.3.0/24', '4.5.6.7']),
    'a lista de IPs tolera espaco e ignora entrada vazia');
chk('CF2', cfg.viaProxy === true && cfg.sujeitoEsperado === 'sicoob', 'proxy e subject saem limpos');
chk('CF3', lerConfig({}).ips.length === 0 && lerConfig({}).viaProxy === false,
    'AMBIENTE VAZIO = recusa tudo. O default nao e permissivo em nenhum campo');

// A ROTA DO WEBHOOK CARREGA O TENANT, e o servidor le esse parametro. As duas
// metades moram em arquivos diferentes: a rota perder o `:tenant` num refactor
// deixaria o servidor lendo `undefined` e recusando tudo com 404 - falha
// fechada, mas indistinguivel de "a Sicoob nao chamou".
const doWebhook = rotas.find((r) => r.auth === 'webhook')!;
chk('RA9', doWebhook.padrao.endsWith('/:tenant'),
    'o padrao do webhook carrega o tenant no caminho (Q-WEBHOOK-TENANT-01)');
chk('RA10', trechoWebhook.slice(0, 3000).includes('achou.params.tenant'),
    'o servidor tira o tenant do caminho que casou, e nao do corpo');
chk('RA11', trechoWebhook.slice(0, 3000).includes('ehUuid(tenantDaRota)'),
    'tenant malformado nao chega ao banco - e sai como o mesmo 404 generico');

// ============================================================================
// 3. O USUARIO DE SERVICO - a identidade derivada (ADR-0006, Decisao 3)
// ============================================================================

/* O VETOR DA RFC 4122. Sem ele, os testes abaixo so provariam que a funcao
 * concorda consigo mesma - e uma v5 errada e estavel do mesmo jeito. Este uuid
 * e o exemplo canonico: uuidv5('www.example.com', namespace DNS). */
chk('SV1', uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')
             === '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    'a UUIDv5 bate com o vetor da RFC 4122 - e v5 de verdade, nao "um hash qualquer"');

const T1 = 'eac198c0-b0c1-4b13-9b4d-6ac1a6eb011d';
const T2 = 'd4640f4b-f833-4a80-a4db-ccced1956ae4';

chk('SV2', authUserIdDeServico(T1) === authUserIdDeServico(T1.toUpperCase()),
    'a derivacao e estavel e nao se importa com maiuscula: o mesmo tenant da o mesmo sujeito');
chk('SV3', authUserIdDeServico(T1) !== authUserIdDeServico(T2),
    'tenants diferentes dao servicos diferentes - nao ha sujeito compartilhado entre empresas');
chk('SV4', ehUuid(authUserIdDeServico(T1)) && authUserIdDeServico(T1)[14] === '5'
           && '89ab'.includes(authUserIdDeServico(T1)[19]),
    'o derivado e um uuid valido, versao 5 e variante RFC - o banco o aceita como uuid');
chk('SV5', (() => { try { authUserIdDeServico('nao-e-uuid'); return false; } catch { return true; } })(),
    'derivar de algo que nao e uuid LANCA, em vez de produzir um sujeito de lixo');
chk('SV6', ehUuid(NAMESPACE_SERVICO),
    'o namespace e fixo e valido - mudar este valor troca a identidade de todo servico ja provisionado');

/* O PROVISIONAMENTO E O CODIGO TEM DE CONCORDAR NO PAPEL. A ADR pede o MINIMO
 * que faz `escrever_carteira` passar, e a matriz de contexto.ts diz quais sao.
 * `admin` no script passaria em tudo e daria escrita de cadastro ao webhook. */
const sql = readFileSync(new URL('../scripts/provisionar-servico-de-cobranca.sql', import.meta.url), 'utf8');
const matriz = readFileSync(new URL('../src/db/contexto.ts', import.meta.url), 'utf8');
const podeEscreverCarteira = /escrever_carteira:\s*new Set\(\[([^\]]+)\]\)/.exec(matriz)?.[1] ?? '';
chk('SV7', podeEscreverCarteira.includes("'cobranca'"),
    'a matriz confirma: `cobranca` faz escrever_carteira passar');
chk('SV8', !podeEscreverCarteira.includes("'financeiro'") && !podeEscreverCarteira.includes("'leitura'"),
    'e nenhum papel MENOR serve - `cobranca` e mesmo o minimo, nao uma escolha comoda');
chk('SV9', /VALUES \(p_tenant, v_usuario, 'cobranca'\)/.test(sql),
    'o provisionamento cria o vinculo com `cobranca`, e nao com `admin`');
chk('SV10', !/'admin'/.test(sql.split('ETAPA 2')[1] ?? ''),
    'e nao ha `admin` nenhum na etapa do vinculo');


// ============================================================================
// HL — O LOG DA FRONTEIRA NAO PODE INVENTAR `undefined`
// ============================================================================
//
// O DEFEITO ACONTECEU, e o conserto errou o alvo na primeira tentativa.
//
// Em 09/09/2026 uma notificacao real da Sicoob saiu no journal assim:
//
//   IGNORADO: nosso_numero 0000000026 nao pertence a este tenant undefined
//
// A palavra final e o segundo argumento de `console.error(m, e)` com `e`
// ausente — e SEIS chamadas de `servidor.ts` passam `undefined` de proposito,
// por nao terem erro para anexar. Quem le conclui que o tenant chegou vazio: um
// defeito de ISOLAMENTO, que nao existe. E o journal do webhook e a unica trilha
// que temos deste lado, porque a aplicacao nao loga requisicao.
//
// ⚠️ E A PRIMEIRA CORRECAO NAO CONSERTOU NADA: arrumei o `log` DEFAULT de
// `servidor.ts` e declarei feito. Medido no journal depois do restart, a linha
// continuava igual — `scripts/servir.ts` injeta o PROPRIO `log`, entao o default
// nunca roda em producao. Duas implementacoes da mesma coisa, e a que rodava era
// a errada. Por isso as duas verificacoes abaixo: uma mede o COMPORTAMENTO, a
// outra mede que existe UMA implementacao so.

import { logPadrao } from '../src/http/servidor.ts';

{
  const capturado: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => { capturado.push(a); };
  try {
    logPadrao('[financeiro] linha sem erro anexado', undefined);
    logPadrao('[financeiro] linha com erro', 'o motivo');
  } finally {
    console.error = original;
  }

  chk('HL-1', capturado[0]?.length === 1,
      'sem erro para anexar, o log imprime UM argumento so - `console.error(m, undefined)` poe a '
      + 'palavra `undefined` no fim da linha, e o journal passa a acusar um defeito que nao existe');

  chk('HL-2', capturado[1]?.length === 2 && capturado[1]?.[1] === 'o motivo',
      'e com erro ele continua imprimindo os dois: a correcao nao pode custar o detalhe do 500, '
      + 'que e a unica coisa que o log tem e a resposta HTTP nunca tera');
}

{
  /* A SEGUNDA METADE, e ela e a que pega o defeito de verdade: `HL-1` mediria
   * verde com `servir.ts` mantendo a lambda propria, porque testaria uma funcao
   * que producao nao chama. Foi exatamente o que aconteceu. */
  const servir = readFileSync(new URL('../scripts/servir.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  chk('HL-3', /log:\s*logPadrao\b/.test(servir) && !/log:\s*\(.*\)\s*=>/.test(servir),
      'o composition root usa `logPadrao` e NAO uma lambda propria - duas implementacoes do '
      + 'mesmo log e uma delas errada, e a que roda em producao e a de `servir.ts`');
}

console.log();
if (falhas > 0) { console.log(`--- rotas/auth: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- rotas/auth (o modo de cada rota e a origem do webhook): ${feitas} verificacoes, 0 falhas`);
