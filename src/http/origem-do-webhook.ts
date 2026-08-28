// A VERIFICACAO DE ORIGEM DO WEBHOOK. `ADR-0006`, Decisao 1: **mTLS + faixa de
// IP**, e a faixa "entra sempre e nunca sozinha".
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DO SERVIDOR: para ser exercivel sem
// socket, sem rede e sem processo. A funcao que decide recebe EVIDENCIA - um
// registro de fatos ja extraidos - e nao a `IncomingMessage`. Quem le o socket e
// `evidenciaDaRequisicao`, que nao decide nada.
//
// O MODO DE FALHA QUE ESTE ARQUIVO EXISTE PARA FECHAR, e ele esta escrito na
// propria ADR: "proxy que nao repassa o certificado entrega uma requisicao
// indistinguivel de uma autenticada". Nao ha default permissivo aqui. Sem
// configuracao, sem certificado ou sem IP na lista, a resposta e RECUSA - e a
// rota devolve o **404 generico**, identico ao de rota inexistente, porque 401
// confirmaria que o endpoint existe para quem esta tentando.
//
// O QUE ESTE ARQUIVO NAO DECIDE, e nao pode: se a Sicoob de fato apresenta
// certificado de cliente. A ADR §7 diz que isso e "verificacao empirica",
// pre-requisito de LIGAR a rota e nao de escreve-la, e acontece no primeiro
// webhook do sandbox.

import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';

/** O veredito. `verificada: false` nunca diz ao chamador POR QUE - o motivo e
 *  para o log deste lado, como o `motivo` do 401 em `auth/jwt.ts`. */
export type Origem =
  | { verificada: true; sujeito: string; ip: string }
  | { verificada: false; motivo: string };

/** Os fatos, ja extraidos do socket. Tudo que a decisao precisa, e nada mais. */
export type Evidencia = {
  /** IP de quem abriu a conexao TCP. Atras de proxy local, e `127.0.0.1`. */
  ip: string | undefined;
  /** A conexao veio da propria maquina? So entao cabecalho de proxy vale algo. */
  daLoopback: boolean;
  /** TLS terminando no Node, com peer VERIFICADO contra a CA configurada. */
  tlsAutorizado: boolean;
  tlsSujeito: string | undefined;
  /** `$ssl_client_verify` do nginx. "SUCCESS" e o unico valor que serve. */
  cabecalhoVerificado: string | undefined;
  /** `$ssl_client_s_dn` do nginx. */
  cabecalhoSujeito: string | undefined;
  /** `$remote_addr` repassado pelo proxy (`X-Real-IP`). */
  cabecalhoIp: string | undefined;
};

export type ConfigDaOrigem = {
  /** Enderecos e faixas autorizados. **Vazio = recusa tudo**, de proposito. */
  ips: string[];
  /** O TLS termina no proxy e ele repassa o resultado por cabecalho? */
  viaProxy: boolean;
  /** Trecho que o subject do certificado precisa conter. Vazio = nao confere. */
  sujeitoEsperado?: string;
};

/*
 * A CONFIGURACAO E DE PLATAFORMA, entao mora em variavel de ambiente e nao no
 * cofre - e a regra 5 em vez de contra ela: o cofre e para segredo POR TENANT, e
 * nada aqui e segredo (uma faixa de IP e um DN nao autenticam ninguem sozinhos;
 * quem autentica e a chave privada que a outra ponta apresenta no handshake).
 *
 *   WEBHOOK_IPS            "200.201.160.0/20,200.201.176.10"   vazio = recusa
 *   WEBHOOK_MTLS_VIA_PROXY "1" quando o nginx termina o TLS e repassa
 *   WEBHOOK_MTLS_SUJEITO   trecho do DN esperado, opcional
 */
export function lerConfig(env: Record<string, string | undefined> = process.env): ConfigDaOrigem {
  const ips = (env.WEBHOOK_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ips,
    viaProxy: (env.WEBHOOK_MTLS_VIA_PROXY ?? '').trim() === '1',
    sujeitoEsperado: (env.WEBHOOK_MTLS_SUJEITO ?? '').trim() || undefined,
  };
}

const umCabecalho = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`) e o mesmo endereco, e o `remoteAddress`
 *  do Node entrega essa forma quando o socket e dual-stack. Comparar sem
 *  normalizar recusaria o IP certo. */
export function normalizarIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const limpo = ip.trim().toLowerCase();
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(limpo);
  return mapeado ? mapeado[1] : limpo;
}

export const ehLoopback = (ip: string | undefined): boolean => {
  const n = normalizarIp(ip);
  return n === '127.0.0.1' || n === '::1' || (n?.startsWith('127.') ?? false);
};

function paraInteiroV4(ip: string): number | null {
  const partes = ip.split('.');
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

/**
 * O IP esta na entrada da lista? Entrada e endereco exato ou CIDR IPv4.
 *
 * IPv6 so casa por igualdade, e a limitacao e deliberada: uma faixa IPv6 escrita
 * errada que "quase" casa e pior que nao suportar faixa nenhuma. Se a Sicoob
 * entregar faixa IPv6, isto vira trabalho nomeado e nao improviso.
 */
export function ipCasa(ip: string | undefined, entrada: string): boolean {
  const alvo = normalizarIp(ip);
  if (!alvo) return false;
  const e = entrada.trim().toLowerCase();
  if (!e.includes('/')) return alvo === normalizarIp(e);

  const [rede, bitsTexto] = e.split('/');
  const bits = Number(bitsTexto);
  const a = paraInteiroV4(alvo);
  const r = paraInteiroV4(normalizarIp(rede) ?? '');
  if (a === null || r === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mascara = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mascara) === (r & mascara);
}

/** So le o socket. Nao decide nada - a decisao e de `verificarOrigem`. */
export function evidenciaDaRequisicao(req: IncomingMessage): Evidencia {
  const socket = req.socket as TLSSocket;
  const tls = typeof socket?.getPeerCertificate === 'function';
  const cert = tls ? socket.getPeerCertificate() : undefined;
  return {
    ip: req.socket?.remoteAddress,
    daLoopback: ehLoopback(req.socket?.remoteAddress),
    tlsAutorizado: tls ? socket.authorized === true : false,
    tlsSujeito: cert && Object.keys(cert).length > 0 ? (cert.subject as any)?.CN ?? undefined : undefined,
    cabecalhoVerificado: umCabecalho(req.headers['ssl-client-verify']),
    cabecalhoSujeito: umCabecalho(req.headers['ssl-client-s-dn']),
    cabecalhoIp: umCabecalho(req.headers['x-real-ip']),
  };
}

/**
 * O VEREDITO. Ordem de recusa escolhida para o log ser util: primeiro o que e
 * configuracao nossa (e conserto nosso), depois o que e da chamada.
 */
export function verificarOrigem(e: Evidencia, c: ConfigDaOrigem): Origem {
  if (c.ips.length === 0) {
    return { verificada: false, motivo:
      'WEBHOOK_IPS vazio. A ADR-0006 exige faixa de IP SEMPRE, e "nunca sozinha" nao ' +
      'significa "as vezes ausente". Sem a lista nao ha o que autorizar.' };
  }

  /*
   * DE ONDE VEM A PROVA DO mTLS. Duas topologias, e a ADR permite as duas: o TLS
   * termina no Node, ou o proxy termina e repassa o resultado.
   *
   * O CABECALHO SO VALE VINDO DA LOOPBACK, e esta e a linha que impede o buraco:
   * `ssl-client-verify: SUCCESS` e texto que qualquer um digita. Se a requisicao
   * nao veio do proxy local, o cabecalho e afirmacao do proprio chamador sobre si
   * mesmo.
   */
  const porTls = e.tlsAutorizado;
  const porProxy = c.viaProxy && e.daLoopback && e.cabecalhoVerificado?.toUpperCase() === 'SUCCESS';

  if (!porTls && !porProxy) {
    const pista = e.cabecalhoVerificado && !e.daLoopback
      ? ' Chegou `ssl-client-verify` de fora da loopback, e cabecalho nao e prova: foi ignorado.'
      : '';
    return { verificada: false, motivo:
      'Sem certificado de cliente verificado. TLS no Node nao autorizou, e nao ha ' +
      `repasse confiavel do proxy (viaProxy=${c.viaProxy}, loopback=${e.daLoopback}).${pista}` };
  }

  const sujeito = (porTls ? e.tlsSujeito : e.cabecalhoSujeito) ?? '';
  if (c.sujeitoEsperado && !sujeito.toLowerCase().includes(c.sujeitoEsperado.toLowerCase())) {
    return { verificada: false, motivo:
      `O subject do certificado nao contem "${c.sujeitoEsperado}". Veio: ${sujeito || '(vazio)'}.` };
  }

  /* Atras de proxy o IP de quem chamou e o que o proxy repassou; o `remoteAddress`
   * e o proprio proxy, e conferi-lo autorizaria a loopback em vez do banco. */
  const ip = porProxy ? e.cabecalhoIp : e.ip;
  if (!c.ips.some((entrada) => ipCasa(ip, entrada))) {
    return { verificada: false, motivo: `IP ${ip ?? '(desconhecido)'} fora de WEBHOOK_IPS.` };
  }

  return { verificada: true, sujeito, ip: normalizarIp(ip)! };
}
