// O Autenticador de producao - auth PROPRIO, Supabase Auth do projeto do
// financeiro (MT-06, resolvida em 27/07).
//
// Ele so faz uma coisa: transformar `Authorization: Bearer <jwt>` no
// `auth_user_id`. Quem traduz auth_user_id em sessao e app.login(), por
// app.resolver_login() - e essa e a unica consulta do sistema feita fora de
// contexto de tenant (R1-c). A separacao importa: este arquivo nao conhece
// tenant, papel nem vinculo, e nao deve conhecer.

import type { IncomingMessage } from 'node:http';
import type { Autenticador } from '../http/servidor.ts';
import { verificarJwt, chaveiroJwks, TokenInvalido, type Chaveiro } from './jwt.ts';

export type OpcoesDeAuth = {
  /** URL do projeto Supabase DO FINANCEIRO. Nunca a do CRM. */
  supabaseUrl: string;
  /**
   * Segredo HS256 do projeto (legado). Se ausente, a verificacao usa o JWKS
   * assimetrico do proprio projeto - que e o caminho preferido: o segredo
   * simetrico verifica E ASSINA, entao quem o tem pode forjar token de
   * qualquer usuario. Com chave assimetrica o servidor so verifica.
   */
  jwtSecret?: string;
  audiencia?: string;
  toleranciaSegundos?: number;
  agora?: () => number;
  buscar?: typeof fetch;
};

export function autenticadorSupabase(o: OpcoesDeAuth): Autenticador {
  const base = o.supabaseUrl.replace(/\/+$/, '');
  const emissor = `${base}/auth/v1`;

  const chaveiro: Chaveiro = o.jwtSecret
    ? { tipo: 'hs256', segredo: o.jwtSecret }
    : chaveiroJwks({ url: `${emissor}/.well-known/jwks.json`, buscar: o.buscar, agora: o.agora });

  return async function autenticar(req: IncomingMessage): Promise<string> {
    const h = req.headers['authorization'];
    const valor = Array.isArray(h) ? h[0] : h;
    if (!valor) throw new TokenInvalido('sem header Authorization');

    // Case-insensitive no esquema porque a RFC 7235 manda, e clientes variam.
    const m = /^Bearer[ ]+(\S+)$/i.exec(valor.trim());
    if (!m) throw new TokenInvalido('Authorization nao e Bearer');

    const p = await verificarJwt(m[1], {
      chaveiro,
      emissor,
      audiencia: o.audiencia ?? 'authenticated',
      toleranciaSegundos: o.toleranciaSegundos,
      agora: o.agora,
    });
    return p.sub;
  };
}

/**
 * Monta o autenticador a partir do ambiente. Falha ALTO se faltar configuracao -
 * um autenticador que "funciona sem configurar" e um servidor aberto.
 */
export function autenticadorDoAmbiente(): Autenticador {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL ausente. E o projeto Supabase DO FINANCEIRO (auth proprio, MT-06), ' +
      'nunca o do CRM. Formato no .env.example.'
    );
  }
  return autenticadorSupabase({ supabaseUrl, jwtSecret: process.env.SUPABASE_JWT_SECRET });
}
