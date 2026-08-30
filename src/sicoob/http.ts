// O ADAPTADOR REAL DA COBRANCA BANCARIA V3. A ultima peca de codigo do
// repositorio - a `PENDENCIAS` de 14/08 dizia, medido, que "o unico codigo que
// falta e src/sicoob/http.ts".
//
// ============================================================================
// POR QUE ELE SO NASCE AGORA, E O QUE MUDOU EM 27/08/2026
//
// O `SICOOB-contrato-medido` 5 listou tres razoes para NAO escreve-lo, e as
// tres eram boas. Duas cairam hoje, por medicao; a terceira continua de pe e
// esta escrita aqui dentro, campo a campo.
//
//   1. `Q-PECA-NAO-PLUGADA-01` - "adaptador que nada pode chamar". CAIU: o
//      certificado A1 existe, o cofre existe (migration 35) e a resolvedora
//      existe (`cofre.ts`). Este arquivo tem quem o chame e tem o que resolver.
//
//   2. "Nao ha como exercita-lo". CAIU PELA METADE, e a metade importa: o
//      sandbox responde. Medido hoje - `GET /boletos` devolve `200` com o
//      exemplo, `POST /boletos/{nn}/baixar` devolve `204`. Mas `POST /boletos`
//      devolve SEMPRE `400` com o exemplo de erro, para corpo vazio e para
//      corpo bem formado: o sandbox e MOCK ESTATICO, nao valida nada. Entao o
//      caminho de sucesso do registro nao e exercitavel la, e por isso o
//      `Transporte` deste arquivo e injetavel - o teste sobe um servidor local
//      e exerce o que o sandbox nao exerce.
//
//   3. "A primeira chamada real vai corrigir alguma suposicao". CONTINUA DE PE,
//      e nao ha o que fazer sobre isso a nao ser nomear as suposicoes onde elas
//      estao. Toda decisao nao medida deste arquivo carrega um comentario
//      `SUPOSICAO:` com o que muda se estiver errada.
//
// ============================================================================
// O QUE FOI MEDIDO HOJE, POR FONTE PRIMARIA
//
// Do `openid-configuration` do realm `cooperado`, lido direto do banco:
//
//   token_endpoint_auth_methods_supported  inclui `tls_client_auth`
//   tls_client_certificate_bound_access_tokens: true
//   grant_types_supported                  inclui `client_credentials`
//   scopes_supported                       29 escopos `cobranca_boletos_*`
//
// Consequencia, e ela fecha uma pergunta aberta desde 05/08: NAO HA
// `client_secret`. O certificado e a credencial, e o token nasce ATADO a ele -
// um token roubado sem a chave privada nao serve. Por isso a resolvedora do
// `ADR-0005` devolve A1 + `client_id`, e nada mais.

import https from 'node:https';
import { URL } from 'node:url';
import type {
  PortaDeCobranca, PedidoDeBoleto, BoletoRegistrado, SituacaoDoBoleto, CredencialRef, Pagador,
  faltamNoEndereco,
} from './porta.ts';
import type { Resolvedora, CredencialResolvida } from './cofre.ts';
import { centavosParaReaisDecimal, reaisDecimalParaCentavos, type Centavos } from '../dominio/centavos.ts';
import { jsonComDinheiroEmTexto } from './json-dinheiro.ts';
import { txidDoBrCode } from '../dominio/brcode.ts';

/** Os enderecos. O de token saiu do `openid-configuration`, nao de documentacao
 *  de terceiro - e por isso ele e o mesmo para sandbox e producao. */
export const SICOOB = {
  producao: 'https://api.sicoob.com.br/cobranca-bancaria/v3',
  sandbox: 'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  token: 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token',
} as const;

/**
 * Os escopos pedidos, e SO os tres verbos da porta mais o Pix do boleto
 * hibrido. Os 29 existem; pedir os 29 seria pedir protesto e negativacao para
 * um sistema que nao protesta ninguem, e escopo a mais e dano a mais no dia em
 * que o token vazar.
 */
export const ESCOPOS = [
  'cobranca_boletos_incluir',
  'cobranca_boletos_consultar',
  'cobranca_boletos_baixa',
  'cobranca_boletos_pix',
] as const;

// ============================================================ 1. O TRANSPORTE

export type PedidoHttp = {
  url: string;
  metodo: 'GET' | 'POST';
  cabecalhos: Record<string, string>;
  corpo?: string;
  pfx: Buffer;
  senha: string;
};
export type RespostaHttp = { status: number; texto: string };

/** Injetavel. Ver a razao 2 do cabecalho: o caminho de sucesso do registro so e
 *  testavel contra servidor proprio, porque o sandbox nao valida corpo. */
export type Transporte = (p: PedidoHttp) => Promise<RespostaHttp>;

export class CertificadoRecusado extends Error {
  readonly status = 500;
  constructor(causa: string) {
    super(
      `O Node nao conseguiu abrir o certificado A1: ${causa}. ` +
      'MEDIDO EM 27/08/2026: o Node 22.20 traz OpenSSL 3.5, que RECUSA .pfx cifrado com ' +
      'algoritmo antigo (RC2-40 + SHA1) - erro "Unsupported PKCS12 PFX data" - mesmo quando o ' +
      'openssl do sistema abre o mesmo arquivo. O conserto e normalizar o .pfx para AES-256 ' +
      'antes de guardar no cofre: `npm run certificado -- normalizar`. Nenhum boleto foi enviado.'
    );
    this.name = 'CertificadoRecusado';
  }
}

/**
 * O transporte de producao. `node:https` cru, e nao `fetch`.
 *
 * POR QUE NAO `fetch`: o fetch global do Node nao aceita certificado de cliente
 * sem um `dispatcher` do undici, e undici seria dependencia NOVA no caminho do
 * dinheiro. O `package.json` deste projeto tem quatro dependencias de producao;
 * `node:https` faz mTLS desde sempre e ja esta aqui.
 *
 * `keepAlive` ligado de proposito: o handshake mTLS e caro, e um lote de 28
 * boletos abriria 28 conexoes TLS completas.
 */
export const transporteHttps: Transporte = (p) => new Promise((resolve, reject) => {
  let agente: https.Agent;
  try {
    agente = new https.Agent(
      p.pfx.length ? { pfx: p.pfx, passphrase: p.senha, keepAlive: true } : { keepAlive: true },
    );
  } catch (err: any) {
    // O erro do OpenSSL chega AQUI, na construcao do contexto, e nao na rede.
    return reject(new CertificadoRecusado(err?.code ?? err?.message ?? 'erro desconhecido'));
  }

  const u = new URL(p.url);
  const req = https.request({
    hostname: u.hostname,
    port: u.port || 443,
    path: `${u.pathname}${u.search}`,
    method: p.metodo,
    headers: p.cabecalhos,
    agent: agente,
    // 30s. Boleto nao e interativo - quem espera e a fila do PRD 6, e ela tem
    // intervalo exponencial proprio. Timeout curto aqui viraria retentativa
    // contra uma chamada que talvez tenha REGISTRADO o boleto do outro lado.
    timeout: 30_000,
  }, (res) => {
    const partes: Buffer[] = [];
    res.on('data', (d) => partes.push(d));
    res.on('end', () => resolve({
      status: res.statusCode ?? 0,
      texto: Buffer.concat(partes).toString('utf8'),
    }));
  });

  req.on('timeout', () => req.destroy(new Error('timeout de 30s')));
  req.on('error', (err: any) => reject(
    err?.code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION' ? new CertificadoRecusado(err.code) : err,
  ));
  if (p.corpo) req.write(p.corpo);
  req.end();
});

// ============================================================ 2. O DINHEIRO

/**
 * A MARCA que faz o valor chegar na Sicoob como o texto exato dos centavos.
 *
 * O problema, e ele e da regra 1. A API recebe `"valor": 156.23` - numero JSON.
 * O caminho natural seria `Number(centavosParaReaisDecimal(v))`, e ele passa
 * por FLOAT. Na faixa de um boleto isso nao erra - foi medido em 30/07, zero
 * erro em 20 milhoes de valores com arredondamento - mas a regra 1 diz "float e
 * proibido, INCLUSIVE em calculo intermediario", e aqui existe uma saida sem
 * float que custa tres linhas.
 *
 * Entao o objeto carrega a marca no lugar do numero, e o texto do decimal entra
 * por substituicao depois do `JSON.stringify`. O valor que sobe e digito a
 * digito o que saiu dos centavos.
 */
const MARCA_VALOR = '@@VALOR@@';

function serializarComValor(objeto: unknown, decimal: string): string {
  const texto = JSON.stringify(objeto);
  const ocorrencias = texto.split(`"${MARCA_VALOR}"`).length - 1;
  if (ocorrencias !== 1) {
    // Uma mensagem do pagador com a marca dentro derrubaria a substituicao. E
    // improvavel e e barato conferir - e o modo de falha seria valor errado no
    // boleto, que e o pior modo de falha deste arquivo.
    throw new Error(
      `serializacao do valor: esperava 1 marca ${MARCA_VALOR}, achei ${ocorrencias}. ` +
      'Nenhum boleto foi enviado.'
    );
  }
  return texto.replace(`"${MARCA_VALOR}"`, decimal);
}

/** O que a API devolve em campo de dinheiro depois do reviver: texto. `null`
 *  quando o campo nao veio - e ausencia nao e zero. */
function centavosDe(v: unknown): Centavos | null {
  if (v == null || v === '') return null;
  return reaisDecimalParaCentavos(String(v));
}

// ============================================================ 3. AS DATAS

/**
 * `2026-09-10T00:00:00-03:00`.
 *
 * OS COMPONENTES SAEM DO UTC, e isto nao e detalhe. `vencimento` e coluna
 * `date` e o Prisma a entrega como meia-noite UTC. Se a formatacao usasse
 * `getFullYear/getMonth/getDate` - que leem o fuso do PROCESSO - um servidor em
 * UTC-3 leria 09/09 as 21h e mandaria o dia ERRADO. O boleto venceria um dia
 * antes, e o cliente pagaria juros por um bug de fuso.
 *
 * SUPOSICAO: que a API queira data-e-hora com deslocamento, e nao `2026-09-10`
 * puro. A documentacao do POST mostra a forma longa; o GET do sandbox devolve a
 * curta. Se a API recusar, e aqui que se muda - uma funcao, um lugar.
 */
function dataSicoob(d: Date): string {
  /*
   * `yyyy-MM-dd` E NADA MAIS, e isto deixou de ser suposicao em 28/08/2026.
   *
   * O modelo `Boleto` declara `dataEmissao`, `dataVencimento` e
   * `dataLimitePagamento` como `string($date)` com "Formato: yyyy-MM-dd", e os
   * exemplos sao `2025-09-01`. Ate hoje mandavamos a forma longa com fuso
   * (`...T00:00:00-03:00`), que era o item "formato da data no POST" que o
   * `SICOOB-medido-2026-08-27` listava como EM ABERTO.
   *
   * O `slice(0, 10)` sobre o ISO continua sendo o ponto importante e nao mudou:
   * ele le a data em UTC, que e como a coluna `date` do Postgres volta. Um
   * servidor em outro fuso, formatando local, mandaria o DIA ANTERIOR.
   */
  return d.toISOString().slice(0, 10);
}

// ============================================================ 4. A SITUACAO

/**
 * `situacaoBoleto` e TEXTO LIVRE em portugues, e a lista completa nao esta
 * medida - so `"Em Aberto"` e `"Liquidado"` foram vistos. Por isso o enum da
 * porta tem `desconhecida`, e por isso o que nao casa cai nela em vez de virar
 * `em_aberto`.
 *
 * A ASSIMETRIA E DELIBERADA: cair em `desconhecida` faz a consulta ativa nao
 * baixar a fatura - alguem olha. Cair em `em_aberto` por engano faria o sistema
 * afirmar que um cliente que pagou nao pagou, e a inadimplencia acusaria quem
 * esta em dia.
 */
export function situacaoDoTexto(bruto: unknown): SituacaoDoBoleto['situacao'] {
  const t = String(bruto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return 'desconhecida';
  if (t === 'em aberto') return 'em_aberto';
  if (t === 'liquidado') return 'liquidado';
  if (t.startsWith('baixado')) return 'baixado';   // "Baixado por decurso de prazo" e afins
  return 'desconhecida';
}

// ============================================================ 5. OS ERROS

export class ErroDaSicoob extends Error {
  readonly status: number;
  readonly httpStatus: number;
  readonly codigos: string[];
  constructor(httpStatus: number, mensagens: Array<{ mensagem?: string; codigo?: string }>, cru: string) {
    const lista = mensagens.length
      ? mensagens.map((m) => `${m.codigo ?? '?'}: ${m.mensagem ?? ''}`.trim()).join(' · ')
      : cru.slice(0, 300);
    super(`Sicoob recusou (HTTP ${httpStatus}) - ${lista}`);
    this.name = 'ErroDaSicoob';
    this.httpStatus = httpStatus;
    this.codigos = mensagens.map((m) => m.codigo ?? '').filter(Boolean);
    // 502 para o mundo: o outro lado falhou. `409` e o unico que atravessa
    // como ele mesmo, porque boleto ja registrado nao e indisponibilidade - e
    // estado, e a fila de retentativa NAO deve insistir nele.
    this.status = httpStatus === 409 ? 409 : 502;
  }
}

function erroDaResposta(r: RespostaHttp): ErroDaSicoob {
  let mensagens: Array<{ mensagem?: string; codigo?: string }> = [];
  try {
    const j = JSON.parse(r.texto);
    if (Array.isArray(j?.mensagens)) mensagens = j.mensagens;
  } catch { /* corpo nao-JSON entra cru, truncado */ }
  return new ErroDaSicoob(r.status, mensagens, r.texto);
}

// ============================================================ 6. O ADAPTADOR

type TokenEmMemoria = { token: string; expiraEm: number };

export type OpcoesDoAdaptador = {
  resolver: Resolvedora;
  transporte?: Transporte;
  /** Sobrescreve o endereco base. So teste usa - producao decide por
   *  `conector_cobranca.sandbox`. */
  baseUrl?: string;
  urlDoToken?: string;
  agora?: () => number;
};

export class CobrancaSicoob implements PortaDeCobranca {
  private readonly resolver: Resolvedora;
  private readonly transporte: Transporte;
  private readonly baseUrl?: string;
  private readonly urlDoToken: string;
  private readonly agora: () => number;

  /**
   * O CACHE DE TOKEN, e o `ADR-0005` 6 deixou o "por quanto tempo" em aberto.
   * A resposta aqui e: pelo tempo que o PROPRIO BANCO disser, menos 60s de
   * folga, e nunca alem do processo - `Map` em memoria, sem disco, sem Redis.
   *
   * A folga existe porque o token pode expirar entre a conferencia e a chegada
   * da requisicao do outro lado. Sessenta segundos e mais que o timeout de 30s
   * da chamada, entao um token aprovado aqui nao expira no meio dela.
   *
   * Chaveado por `credencial_ref`, que e referencia opaca e nao segredo: um
   * `Map` cuja CHAVE fosse o `client_id` poria credencial em heap dump por um
   * motivo sem necessidade.
   */
  private readonly tokens = new Map<CredencialRef, TokenEmMemoria>();

  constructor(o: OpcoesDoAdaptador) {
    this.resolver = o.resolver;
    this.transporte = o.transporte ?? transporteHttps;
    this.baseUrl = o.baseUrl;
    this.urlDoToken = o.urlDoToken ?? SICOOB.token;
    this.agora = o.agora ?? (() => Date.now());
  }

  private base(c: CredencialResolvida): string {
    return this.baseUrl ?? (c.sandbox ? SICOOB.sandbox : SICOOB.producao);
  }

  /**
   * `client_credentials` sobre mTLS. Sem `client_secret` - ver o cabecalho.
   *
   * O SANDBOX NAO PASSA POR AQUI: ele nao emite token, e a credencial guardada
   * para ele traz `token_fixo`. Isso e do sandbox e nao vaza para producao,
   * onde `tokenFixo` e sempre `null`.
   */
  private async token(ref: CredencialRef, c: CredencialResolvida): Promise<string> {
    if (c.tokenFixo) return c.tokenFixo;

    const guardado = this.tokens.get(ref);
    if (guardado && guardado.expiraEm > this.agora()) return guardado.token;

    const corpo = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.clientId,
      scope: ESCOPOS.join(' '),
    }).toString();

    const r = await this.transporte({
      url: this.urlDoToken,
      metodo: 'POST',
      cabecalhos: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(corpo)),
        Accept: 'application/json',
      },
      corpo,
      pfx: c.pfx,
      senha: c.senhaDoPfx,
    });

    if (r.status !== 200) {
      // O corpo do Keycloak pode trazer `error_description`. NAO entra na
      // mensagem sem filtro: resposta de OAuth e o lugar classico onde um token
      // aparece, e esta mensagem vai para `boleto.ultimo_erro`, que e coluna.
      let porque = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(r.texto);
        if (typeof j?.error === 'string') porque += ` (${j.error})`;
      } catch { /* silencio proposital */ }
      throw Object.assign(
        new Error(
          `A Sicoob nao emitiu o token: ${porque}. Confira se o aplicativo esta AUTORIZADO no ` +
          'App Sicoob (aplicativo pendente devolve client_id invalido) e se o certificado do ' +
          'cofre e o mesmo que subiu no Portal Developers. Nenhum boleto foi enviado.'
        ),
        { status: 502 },
      );
    }

    const j = JSON.parse(r.texto);
    const token = j?.access_token;
    if (!token) throw Object.assign(new Error('A Sicoob devolveu 200 sem access_token.'), { status: 502 });

    const segundos = Number(j?.expires_in);
    const folga = 60;
    this.tokens.set(ref, {
      token,
      // Sem `expires_in` utilizavel, o cache dura o minimo e a proxima chamada
      // pede de novo. Nunca "para sempre": um token eterno em memoria e o que
      // faz uma revogacao no banco levar horas para surtir efeito aqui.
      expiraEm: this.agora() + Math.max(0, (Number.isFinite(segundos) ? segundos : folga + 1) - folga) * 1000,
    });
    return token;
  }

  private async chamar(
    ref: CredencialRef, c: CredencialResolvida,
    metodo: 'GET' | 'POST', caminho: string, corpo?: string,
  ): Promise<RespostaHttp> {
    const token = await this.token(ref, c);
    const r = await this.transporte({
      url: `${this.base(c)}${caminho}`,
      metodo,
      cabecalhos: {
        Authorization: `Bearer ${token}`,
        // Os DOIS, em toda chamada. O `client_id` em cabecalho e do gateway da
        // Sicoob, nao do OAuth - sem ele volta 401 "Invalid client id or
        // secret" mesmo com Bearer valido. Medido no sandbox em 27/08.
        client_id: c.clientId,
        Accept: 'application/json',
        ...(corpo ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(corpo)) } : {}),
      },
      corpo,
      pfx: c.pfx,
      senha: c.senhaDoPfx,
    });

    // 401 = token morto antes da hora (revogacao, relogio, rotacao). Joga fora
    // o cache e DEIXA FALHAR: quem retenta e a fila do PRD 6, com intervalo
    // exponencial. Retentar aqui dentro esconderia do `tentativas` que houve
    // duas chamadas, e a fila e o unico lugar do sistema que conta isso.
    if (r.status === 401) this.tokens.delete(ref);
    return r;
  }

  // ---------------------------------------------------------------- registrar

  async registrar(p: PedidoDeBoleto): Promise<BoletoRegistrado> {
    const c = await this.resolver(p.credencialRef);
    const decimal = centavosParaReaisDecimal(p.valorCentavos);

    const corpoObjeto = {
      numeroCliente: c.identidade.numeroCliente,
      codigoModalidade: c.identidade.codigoModalidade,
      /*
       * OS DOIS OPCIONAIS SOMEM QUANDO NAO EXISTEM, e nao viram `null`.
       *
       * A colecao Postman e literal - "nao e permitido enviar um campo com
       * valor nulo" -, e o `numeroContratoCobranca` so existe para cooperado
       * com mais de um contrato. Mandar `numeroContratoCobranca: null` faria a
       * API recusar o boleto INTEIRO por causa de um campo que ela mesma
       * declara opcional.
       */
      ...(c.identidade.numeroContratoCobranca != null
        ? { numeroContratoCobranca: c.identidade.numeroContratoCobranca } : {}),

      /*
       * OBRIGATORIO, e ele estava saindo do corpo quando faltava - medido em
       * 28/08/2026 contra o modelo `Boleto`, que o marca com `*`:
       * "numeroContaCorrente: Numero da Conta Corrente onde sera realizado o
       * CREDITO DA LIQUIDACAO do boleto".
       *
       * O raciocinio antigo continua certo na metade que importa - mandar `0`
       * seria afirmar uma conta que ninguem informou -, mas a conclusao mudou:
       * se o campo e exigido e nao se pode inventar, entao ele e condicao de
       * ATIVAR o conector, e nao de montar o corpo. Quem recusa e o cofre, com
       * `CredencialIncompleta`, antes de qualquer chamada.
       */
      numeroContaCorrente: c.identidade.numeroContaCorrente,

      // SUPOSICAO: `DM` (duplicata mercantil), que e o do exemplo da propria
      // documentacao. Se a cooperativa disser que servico de energia e `DS`,
      // muda esta constante - e a `Q-ESPECIE-01` existe para essa pergunta.
      codigoEspecieDocumento: 'DM',

      dataEmissao: dataSicoob(new Date(this.agora())),
      dataVencimento: dataSicoob(p.vencimento),
      valor: MARCA_VALOR,
      seuNumero: seuNumeroDe(p.referencia),

      /*
       * QUEM EMITE E QUEM DISTRIBUI, e estes dois campos MOVEM DINHEIRO: se o
       * banco emitir e distribuir, ele imprime e posta o boleto, e cobra por
       * isso. `2` e `2` sao "cliente emite" e "cliente distribui".
       *
       * NAO E CHUTE, e decorrencia do resto do sistema: o documento que o
       * cliente recebe e NOSSO - `dominio/layout-do-documento.ts` desenha, a
       * conferencia dos 44 digitos recusa o que nao fecha, e a entrega e pelo
       * nosso canal. Pedir ao banco que emita produziria DOIS documentos para a
       * mesma divida.
       *
       * OS CODIGOS DEIXARAM DE SER SUPOSICAO EM 28/08/2026. A colecao Postman
       * oficial da Cobranca v3 enumera: emissao `1 - Banco Emite` / `2 - Cliente
       * Emite`, distribuicao `1 - Banco Distribui` / `2 - Cliente Distribui`. O
       * `2` e `2` que este arquivo ja mandava e o par certo, e agora por fonte
       * primaria - `Q-EMISSAO-01` fechada, sem uma linha de codigo mudar.
       */
      identificacaoEmissaoBoleto: 2,
      identificacaoDistribuicaoBoleto: 2,

      /*
       * OS QUATRO OBRIGATORIOS QUE NAO ESTAVAM INDO. Medidos em 28/08/2026: o
       * modelo `Boleto` marca `tipoDesconto`, `tipoMulta`, `tipoJurosMora` e
       * `numeroParcela` com `*`. Nenhum deles saia no corpo, e o primeiro
       * boleto real teria voltado 400 por campo ausente - nao por valor errado.
       *
       * OS VALORES SAO OS DE "NAO COBRAR NADA A MAIS", e isso e o que o sistema
       * ja faz: a fatura da G3 nao tem desconto por antecipacao, e juros e multa
       * de atraso entram pela LIQUIDACAO (o excedente que o webhook informa),
       * nunca por regra registrada no boleto. Registrar juros aqui faria o banco
       * cobrar por conta propria um valor que o nosso split nao conhece.
       *
       *   tipoDesconto  0 = Sem Desconto
       *   tipoMulta     0 = Isento
       *   tipoJurosMora 3 = Isento   (aqui o "isento" e 3, e nao 0 - os enums
       *                               NAO sao paralelos, e trocar os dois daria
       *                               "1 = valor por dia" sem valor informado)
       *   numeroParcela 1 = parcela unica (maximo permitido 99)
       */
      tipoDesconto: 0,
      tipoMulta: 0,
      tipoJurosMora: 3,
      numeroParcela: 1,

      // O hibrido do PRD 4.3: o mesmo documento carrega boleto e Pix.
      // O modelo confirma o enum: 0 Padrao, 1 Com Pix, 2 Sem Pix.
      codigoCadastrarPIX: 1,

      pagador: pagadorSicoob(p.pagador),
      // Cinco linhas no exemplo da documentacao. Cortar aqui, nomeando, e
      // melhor que a API cortar em silencio - ou recusar o boleto inteiro.
      ...(p.mensagens?.length ? { mensagensInstrucao: p.mensagens.slice(0, 5) } : {}),
    };

    const corpo = serializarComValor(corpoObjeto, decimal);
    const r = await this.chamar(p.credencialRef, c, 'POST', '/boletos', corpo);
    if (r.status < 200 || r.status >= 300) throw erroDaResposta(r);

    const j = jsonComDinheiroEmTexto(r.texto);
    const res = j?.resultado ?? j;

    const linhaDigitavel = String(res?.linhaDigitavel ?? '');
    const codigoBarras = String(res?.codigoBarras ?? '');
    const nossoNumero = res?.nossoNumero == null ? '' : String(res.nossoNumero);
    if (!nossoNumero || !linhaDigitavel || !codigoBarras) {
      // 200 sem os tres e resposta que nao serve para nada: nao da para
      // imprimir documento nem para conciliar. Falhar aqui poe o boleto na
      // fila; aceitar poria uma linha `registrado` sem numero no banco.
      throw Object.assign(
        new Error(
          'A Sicoob respondeu sucesso mas sem nossoNumero, linha digitavel ou codigo de barras. ' +
          'O boleto pode ter sido criado do lado do banco - confira no Sicoobnet antes de mandar ' +
          'de novo.'
        ),
        { status: 502 },
      );
    }

    const qr = res?.qrCode == null ? null : String(res.qrCode);
    return {
      nossoNumero,
      linhaDigitavel,
      codigoBarras,
      pixCopiaECola: qr || null,
      pixTxid: txidDoBrCode(qr),
      sicoobNumeroContrato: res?.numeroContratoCobranca == null ? null : String(res.numeroContratoCobranca),
      sicoobNossoNumero: nossoNumero,
      /*
       * O QUE VAI PARA AUDITORIA, e a constraint `boleto_payload_sem_segredo`
       * da migration 16 confere. Nao ha token aqui: ele viaja em CABECALHO, e
       * cabecalho nao entra nestes dois campos por construcao - o que se grava
       * e o corpo, e o corpo nunca teve credencial.
       *
       * `valor` vai como TEXTO ("1130.00"), nao como numero: gravar float na
       * trilha de dinheiro seria reintroduzir pela porta dos fundos o que a
       * regra 1 fecha na porta da frente.
       */
      payloadEnvio: { ...corpoObjeto, valor: decimal },
      // `pdfBoleto` fora de proposito (`SICOOB-contrato-medido` 3.3): sao
      // centenas de KB de base64 por boleto, e o documento e nosso.
      payloadRetorno: semPdf(res),
    };
  }

  // ---------------------------------------------------------------- consultar

  async consultar(ref: CredencialRef, nossoNumero: string): Promise<SituacaoDoBoleto> {
    const c = await this.resolver(ref);
    const q = new URLSearchParams({
      numeroCliente: String(c.identidade.numeroCliente),
      codigoModalidade: String(c.identidade.codigoModalidade),
      nossoNumero,
    });
    const r = await this.chamar(ref, c, 'GET', `/boletos?${q}`);

    // 404 nao e erro: e "o banco nao conhece este numero". Vira `desconhecida`,
    // que e exatamente o estado que a consulta ativa deve reportar sem baixar
    // nada.
    if (r.status === 404) return desconhecido(nossoNumero);
    if (r.status < 200 || r.status >= 300) throw erroDaResposta(r);

    const res = jsonComDinheiroEmTexto(r.texto)?.resultado ?? {};
    const situacao = situacaoDoTexto(res?.situacaoBoleto);

    /*
     * O QUE ESTA CONSULTA NAO SABE, e e melhor dizer do que preencher.
     *
     * A resposta do `GET /boletos` NAO traz valor liquidado, data de
     * liquidacao nem id de evento. Traz `valorMulta` e `valorJurosMora`, que
     * sao o que foi CONFIGURADO no titulo - nao o que foi pago. Preencher
     * `jurosCentavos` com eles seria afirmar que o cliente pagou juros que
     * talvez nem tenham corrido.
     *
     * Entao os quatro campos ficam vazios, e isso NAO quebra nada: quem baixa e
     * `repos/liquidacao.ts`, pelo webhook, e a consulta ativa do PRD 6 existe
     * para DETECTAR liquidacao cujo webhook falhou - e para isso `situacao`
     * basta. `Q-LIQUIDACAO-CONSULTA-01` registra o que medir na primeira
     * liquidacao real.
     */
    return {
      nossoNumero,
      situacao,
      valorLiquidadoCentavos: null,
      jurosCentavos: 0,
      multaCentavos: 0,
      dataLiquidacao: null,
      idExterno: null,
    };
  }

  // ------------------------------------------------------------------ baixar

  async baixar(ref: CredencialRef, nossoNumero: string, motivo: string): Promise<void> {
    const c = await this.resolver(ref);
    // `motivo` NAO vai para a Sicoob: o corpo documentado da baixa tem dois
    // campos, e nenhum e texto livre. Ele e nosso, e vive na trilha de
    // auditoria de quem mandou baixar. Manter o parametro na porta e certo -
    // quem baixa dinheiro tem de dizer por que, mesmo que o banco nao pergunte.
    void motivo;
    const corpo = JSON.stringify({
      numeroCliente: c.identidade.numeroCliente,
      codigoModalidade: c.identidade.codigoModalidade,
    });
    const r = await this.chamar(ref, c, 'POST', `/boletos/${encodeURIComponent(nossoNumero)}/baixar`, corpo);
    if (r.status !== 204 && (r.status < 200 || r.status >= 300)) throw erroDaResposta(r);
  }
}

// ============================================================ 7. AUXILIARES

function desconhecido(nossoNumero: string): SituacaoDoBoleto {
  return {
    nossoNumero, situacao: 'desconhecida', valorLiquidadoCentavos: null,
    jurosCentavos: 0, multaCentavos: 0, dataLiquidacao: null, idExterno: null,
  };
}

/** `pdfBoleto` fora: centenas de KB de base64 por linha de auditoria. */
function semPdf(res: any): unknown {
  if (!res || typeof res !== 'object') return res;
  const { pdfBoleto, ...resto } = res;
  return resto;
}

/**
 * O `seuNumero` - o campo que o EXTRATO do banco mostra ao lado do titulo.
 *
 * A referencia da porta e o `boleto.id`, um UUID de 36 caracteres. O tamanho
 * maximo do `seuNumero` NAO ESTA MEDIDO, e campo "uso da empresa" em padrao
 * bancario costuma ter menos que isso - mandar 36 arrisca `400` no primeiro
 * boleto.
 *
 * Entao vao 20 dos 32 digitos hexadecimais. NAO E CHAVE DE CONCILIACAO e nao
 * precisa ser: a conciliacao se faz por `nossoNumero` (que o banco devolve e a
 * gente grava) e por `boleto.id` (que e nosso). Este campo e para OLHO HUMANO
 * conferindo extrato. 20 hex sao 80 bits - colisao dentro de um tenant nao e
 * risco real.
 *
 * `Q-SEUNUMERO-01`: medir o limite na primeira emissao e, se couber, mandar o
 * UUID inteiro.
 */
/** O teto e 18, e nao 20: o modelo `Boleto` diz "Tamanho maximo 18" em
 *  `seuNumero` (medido em 28/08/2026). O 20 era estimativa, e um campo de
 *  tamanho estourado faz a API recusar o boleto INTEIRO. */
export const SEU_NUMERO_MAX = 18;

export function seuNumeroDe(referencia: string): string {
  const hex = String(referencia).replace(/[^0-9a-zA-Z]/g, '');
  return hex.slice(0, SEU_NUMERO_MAX) || 'SEMREFERENCIA';
}

/**
 * O pagador, e a concatenacao do endereco e o ponto sensivel.
 *
 * A API tem UMA string `endereco`; nos temos `logradouro` e `numero`
 * separados (`SICOOB-contrato-medido` 3.1). Quem junta e o adaptador, e junta
 * pulando vazio - "Rua 1, " com virgula solta e endereco que o carteiro
 * devolve.
 *
 * `email` existe la e nao existe no nosso `Pagador`: medido, 3 de 29 clientes
 * faturaveis tem e-mail. Um campo que 26 de 29 mandariam vazio nao entra.
 */
/*
 * CAMPO OPCIONAL AUSENTE SAI DO CORPO, e nao vai como `null`.
 *
 * A regra e do banco, e esta na coleção Postman oficial da Cobranca v3 (medida
 * em 28/08/2026): *"Se um campo opcional nao for utilizado, e necessario
 * remove-lo do corpo da solicitacao, pois **nao e permitido enviar um campo com
 * valor nulo**"*. Ate esta data este arquivo mandava `endereco: null`, `bairro:
 * null`, `cep: null` - e hoje sao 0 de 29 UCs com endereco do pagador, entao o
 * corpo com nulos era o caminho GARANTIDO no primeiro boleto.
 *
 * OS TETOS TAMBEM SAO DELES, e cortar aqui segue o precedente das
 * `mensagensInstrucao`: cortar nomeando e melhor que a API cortar em silencio -
 * ou recusar o boleto inteiro por um caractere.
 */
const TETO = { nome: 50, endereco: 40, bairro: 30, cidade: 40 } as const;
const ate = (v: string, n: number) => (v.length <= n ? v : v.slice(0, n));

export function pagadorSicoob(p: Pagador) {
  const e = p.endereco ?? {};
  const endereco = [e.logradouro, e.numero].filter((x) => x && String(x).trim()).join(', ');
  const bairro = (e.bairro ?? '').trim();
  const cidade = (e.municipio ?? '').trim();   // `cidade` la, `municipio` aqui (GLOSSARIO)
  const cep = (e.cep ?? '').replace(/\D/g, '');
  const uf = (e.uf ?? '').toUpperCase().trim();
  return {
    numeroCpfCnpj: p.documento.replace(/\D/g, ''),
    nome: ate(p.nome, TETO.nome),
    ...(endereco ? { endereco: ate(endereco, TETO.endereco) } : {}),
    ...(bairro ? { bairro: ate(bairro, TETO.bairro) } : {}),
    ...(cidade ? { cidade: ate(cidade, TETO.cidade) } : {}),
    ...(cep ? { cep } : {}),
    ...(uf ? { uf } : {}),
  };
}
