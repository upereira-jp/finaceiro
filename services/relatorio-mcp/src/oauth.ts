/**
 * OAuth 2.1 Authorization Server para o relatorio-mcp do Financeiro.
 *
 * Copia deliberada do arquivo homonimo do conector do CRM (intreply-reporting-mcp),
 * com a marca trocada. Nao e biblioteca compartilhada de proposito: os dois
 * servicos rodam de repositorios, usuarios e ciclos de vida diferentes, e um
 * pacote comum criaria acoplamento entre duas coisas que precisam poder
 * divergir. Correcao de seguranca aqui tem irma la -- e vice-versa.
 *
 * Existe porque o connector do claude.ai web (fora do beta de request-header) so
 * conecta em MCP remoto via OAuth. O SDK do MCP entrega os endpoints padrao
 * (mcpAuthRouter: /authorize /token /register /revoke + os dois .well-known);
 * aqui implementamos APENAS o OAuthServerProvider e o passo de consentimento.
 *
 * Modelo de seguranca:
 *  - Todo token emitido mapeia para UMA identidade do reporting (por padrao
 *    'vinicius' -> todos os tenants dele, pii=true). Nao ha multiusuario aqui.
 *  - O passo /authorize e gated por SENHA (OAUTH_LOGIN_PASSWORD, sobre TLS).
 *    Sem isso, DCR + authorize deixaria qualquer um pegar token -> PII aberta.
 *  - PKCE (S256) e validado pelo proprio SDK no /token.
 *  - clients/tokens persistem em arquivo (OAUTH_STORE_PATH) para sobreviver a
 *    restart do pm2 sem forcar re-login do connector.
 *  - codigos de autorizacao vivem so em memoria (efemeros, ~5 min).
 *  - refresh token tem VIDA ABSOLUTA (REFRESH_TTL_S) e ROTACIONA a cada uso;
 *    reapresentar um ja rotacionado derruba a familia inteira. Ver adiante.
 *  - toda decisao de auth vira linha na trilha de auditoria do servico.
 *
 * Sobre o refresh (auditoria 2026-07-23): antes ele era eterno e imutavel --
 * um unico vazamento dava acesso indefinido a PII de quatro tenants, e a unica
 * revogacao possivel era editar o store na mao. Agora:
 *   - vida absoluta que a rotacao NAO reinicia (senao volta a ser eterno);
 *   - rotacao a cada uso, entao o token que vazou envelhece sozinho;
 *   - familia por sessao: reuso detectado ou /revoke matam a sessao toda,
 *     nao um token isolado.
 */
import express, { type Express, type Request, type Response } from "express";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const ACCESS_TTL_S = 3600;          // access token: 1h
const CODE_TTL_MS = 5 * 60 * 1000;  // authorization code: 5 min

// Vida ABSOLUTA do refresh token. Absoluta mesmo: a rotacao NAO reinicia o
// relogio. Se reiniciasse, bastaria o connector renovar em dia para o refresh
// virar eterno -- que era exatamente o defeito. Passado o prazo, re-login.
const REFRESH_TTL_S = Number(process.env.OAUTH_REFRESH_TTL_S ?? 30 * 24 * 3600); // 30 dias

// Trava de forca bruta na senha do consentimento. O rate-limit do nginx e' por
// TAXA (10 r/s), nao por tentativa: sozinho, so obriga o atacante a ir devagar.
// Aqui a tentativa custa. Em memoria de proposito -- restart zera o balde, e
// tudo bem: isto e' contra enxurrada; contra atacante paciente o que vale e' o
// prazo do token.
const FAIL_MAX = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;

/** Mesma assinatura do audit() do index -- injetado, para nao criar ciclo de import. */
export type AuditFn = (fields: Record<string, string | number | undefined>) => void;

type StoredAccess = {
  identityLabel: string; clientId: string; scopes: string[]; expiresAt: number;
  familyId: string;
};
type StoredRefresh = {
  identityLabel: string; clientId: string; scopes: string[];
  /** Sessao a que este token pertence. Revogar mata a familia inteira. */
  familyId: string;
  /** Absoluto, PRESERVADO na rotacao. */
  expiresAt: number;
  /** Marcado ao rotacionar. Presenca + reapresentacao = replay. */
  consumedAt?: number;
};
type StoredCode = {
  codeChallenge: string;
  clientId: string;
  redirectUri: string;
  identityLabel: string;
  scopes: string[];
  expiresAt: number;
};

type Persisted = {
  clients: Record<string, OAuthClientInformationFull>;
  access: Record<string, StoredAccess>;
  refresh: Record<string, StoredRefresh>;
};

// --------------------------------------------------------------- store em arquivo
class FileStore {
  private data: Persisted = { clients: {}, access: {}, refresh: {} };
  constructor(private path: string, note?: (fields: Record<string, string | number>) => void) {
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        this.data = { clients: raw.clients ?? {}, access: raw.access ?? {}, refresh: raw.refresh ?? {} };
      } catch (err: any) {
        console.error(`[oauth] store ilegivel em ${path}: ${err.message} -- comecando vazio`);
      }
    }
    const now = Math.floor(Date.now() / 1000);

    // ADOCAO ANTES DA PODA. Token emitido antes desta versao nao tem familia
    // nem prazo, e prazo ausente cairia na poda como se estivesse vencido.
    // Adotar em vez de apagar evita forcar re-login do connector; o ganho --
    // vida limitada e rotacao -- passa a valer a partir de agora.
    let adotados = 0;
    for (const v of Object.values(this.data.refresh)) {
      if (!v.familyId) v.familyId = randomUUID();
      if (!v.expiresAt) { v.expiresAt = now + REFRESH_TTL_S; adotados++; }
    }

    // Poda: access vencido, refresh vencido. Registro CONSUMIDO fica ate' o
    // prazo absoluto -- e' ele que detecta replay enquanto a familia vive.
    for (const [t, v] of Object.entries(this.data.access)) if (v.expiresAt <= now) delete this.data.access[t];
    for (const [t, v] of Object.entries(this.data.refresh)) if (v.expiresAt <= now) delete this.data.refresh[t];
    // Access sem familia e' orfao: nao da' pra revogar por familia. Vive no
    // maximo 1h, entao descartar so' antecipa um refresh que o cliente ja faz.
    let orfaos = 0;
    for (const [t, v] of Object.entries(this.data.access)) if (!v.familyId) { delete this.data.access[t]; orfaos++; }

    this.flush();
    if (adotados || orfaos) note?.({ refresh_adotados: adotados, access_orfaos_descartados: orfaos });
  }
  private flush() {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
  getClient(id: string) { return this.data.clients[id]; }
  putClient(c: OAuthClientInformationFull) { this.data.clients[c.client_id] = c; this.flush(); }
  putAccess(token: string, v: StoredAccess) { this.data.access[token] = v; this.flush(); }
  getAccess(token: string) { return this.data.access[token]; }
  delAccess(token: string) { if (this.data.access[token]) { delete this.data.access[token]; this.flush(); } }
  putRefresh(token: string, v: StoredRefresh) { this.data.refresh[token] = v; this.flush(); }
  getRefresh(token: string) { return this.data.refresh[token]; }
  delRefresh(token: string) { if (this.data.refresh[token]) { delete this.data.refresh[token]; this.flush(); } }

  /** Marca o refresh como gasto na rotacao. O registro FICA: e' o detector de replay. */
  markConsumed(token: string, at: number) {
    const r = this.data.refresh[token];
    if (r) { r.consumedAt = at; this.flush(); }
  }
  /** Familia de um token qualquer (access ou refresh). */
  familyOf(token: string): string | undefined {
    return this.data.access[token]?.familyId ?? this.data.refresh[token]?.familyId;
  }
  /** Derruba a sessao inteira: todo access e todo refresh daquela familia. */
  revokeFamily(familyId: string): number {
    let n = 0;
    for (const [t, v] of Object.entries(this.data.access)) if (v.familyId === familyId) { delete this.data.access[t]; n++; }
    for (const [t, v] of Object.entries(this.data.refresh)) if (v.familyId === familyId) { delete this.data.refresh[t]; n++; }
    if (n) this.flush();
    return n;
  }
}

const rnd = (n = 32) => randomBytes(n).toString("hex");

// ------------------------------------------------------------------- provider
class RelatorioOAuthProvider implements OAuthServerProvider {
  private codes = new Map<string, StoredCode>(); // efemeros, so em memoria
  constructor(
    private store: FileStore,
    private identityLabel: string,
    private view: ConsentView,
    private audit: AuditFn,
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => this.store.getClient(id),
      registerClient: (client) => {
        // o handler /register do SDK ja gerou client_id/secret; so persistimos.
        this.store.putClient(client as OAuthClientInformationFull);
        return client as OAuthClientInformationFull;
      },
    };
  }

  // Renderiza a tela de login/consentimento. O codigo so e emitido no POST
  // /oauth/approve (approveHandler), depois de conferir a senha.
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const hidden: Record<string, string> = {
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      scope: (params.scopes ?? []).join(" "),
    };
    if (params.state) hidden.state = params.state;
    const view = { ...this.view, clientName: client.client_name };
    res.set("Content-Type", "text/html; charset=utf-8").send(loginPage(hidden, false, view));
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, code: string): Promise<string> {
    const c = this.codes.get(code);
    if (!c || c.expiresAt < Date.now()) throw new InvalidGrantError("codigo de autorizacao invalido ou expirado");
    return c.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,   // PKCE ja validado pelo SDK
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const c = this.codes.get(code);
    if (!c || c.expiresAt < Date.now()) throw new InvalidGrantError("codigo de autorizacao invalido ou expirado");
    if (c.clientId !== client.client_id) throw new InvalidGrantError("codigo nao pertence a este cliente");
    if (redirectUri && redirectUri !== c.redirectUri) throw new InvalidGrantError("redirect_uri diverge do pedido inicial");
    this.codes.delete(code); // uso unico

    // Nasce a sessao: familia nova e relogio absoluto comecando agora.
    const familyId = randomUUID();
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_S;
    this.audit({
      evento: "oauth_sessao_criada", identidade: c.identityLabel, client: client.client_id,
      familia: familyId, refresh_valido_dias: Math.round(REFRESH_TTL_S / 86400),
    });
    return this.issueTokens(c.identityLabel, client.client_id, c.scopes, familyId, refreshExpiresAt);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const now = Math.floor(Date.now() / 1000);
    const r = this.store.getRefresh(refreshToken);
    if (!r) throw new InvalidGrantError("refresh token invalido");

    // REPLAY: token ja rotacionado, reapresentado. Ou vazou, ou o cliente
    // perdeu a resposta da rotacao. Nos dois casos a familia inteira cai:
    // derrubar a sessao custa um re-login; manter uma credencial possivelmente
    // clonada custa a base de PII de quatro tenants.
    if (r.consumedAt) {
      const n = this.store.revokeFamily(r.familyId);
      this.audit({
        evento: "oauth_refresh_REUSO_DETECTADO", identidade: r.identityLabel,
        client: client.client_id, familia: r.familyId, tokens_revogados: n,
      });
      throw new InvalidGrantError("refresh token ja utilizado -- sessao revogada por seguranca");
    }
    if (r.expiresAt <= now) {
      this.store.delRefresh(refreshToken);
      this.audit({
        evento: "oauth_refresh_expirado", identidade: r.identityLabel,
        client: client.client_id, familia: r.familyId,
      });
      throw new InvalidGrantError("refresh token expirado -- e' preciso autorizar de novo");
    }
    if (r.clientId !== client.client_id) throw new InvalidGrantError("refresh token nao pertence a este cliente");

    const useScopes = scopes && scopes.length ? scopes.filter((s) => r.scopes.includes(s)) : r.scopes;
    // ROTACAO: o usado morre, nasce outro na MESMA familia com o MESMO prazo.
    // Preservar o prazo e' o que impede o refresh de se renovar pra sempre.
    this.store.markConsumed(refreshToken, now);
    this.audit({
      evento: "oauth_refresh_rotacionado", identidade: r.identityLabel,
      client: client.client_id, familia: r.familyId,
      expira_em_h: Math.round((r.expiresAt - now) / 3600),
    });
    return this.issueTokens(r.identityLabel, client.client_id, useScopes, r.familyId, r.expiresAt);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const a = this.store.getAccess(token);
    const now = Math.floor(Date.now() / 1000);
    if (!a || a.expiresAt <= now) {
      if (a) this.store.delAccess(token);
      throw new InvalidTokenError("token expirado ou desconhecido");
    }
    return {
      token,
      clientId: a.clientId,
      scopes: a.scopes,
      expiresAt: a.expiresAt,
      extra: { identityLabel: a.identityLabel },
    };
  }

  // Desconectar o connector revoga a SESSAO, nao um token solto: quem remove a
  // integracao espera que o acesso acabe, nao que o access token vizinho siga
  // valendo mais uma hora.
  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const familyId = this.store.familyOf(request.token);
    if (familyId) {
      const n = this.store.revokeFamily(familyId);
      this.audit({ evento: "oauth_sessao_revogada", familia: familyId, tokens_revogados: n });
      return;
    }
    // Token desconhecido: RFC 7009 manda responder 200 assim mesmo.
    this.store.delAccess(request.token);
    this.store.delRefresh(request.token);
  }

  // ------- helpers usados pelo approveHandler --------
  issueCode(clientId: string, redirectUri: string, codeChallenge: string, scopes: string[]): string {
    const code = rnd(24);
    this.codes.set(code, {
      codeChallenge,
      clientId,
      redirectUri,
      identityLabel: this.identityLabel,
      scopes,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    return code;
  }

  /** `refreshExpiresAt` presente => emite refresh novo com ESSE prazo absoluto. */
  private issueTokens(
    identityLabel: string,
    clientId: string,
    scopes: string[],
    familyId: string,
    refreshExpiresAt?: number,
  ): OAuthTokens {
    const access = "at_" + rnd(32);
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_S;
    this.store.putAccess(access, { identityLabel, clientId, scopes, expiresAt, familyId });
    const tokens: OAuthTokens = {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      scope: scopes.length ? scopes.join(" ") : undefined,
    };
    if (refreshExpiresAt !== undefined) {
      const refresh = "rt_" + rnd(32);
      this.store.putRefresh(refresh, { identityLabel, clientId, scopes, familyId, expiresAt: refreshExpiresAt });
      tokens.refresh_token = refresh;
    }
    return tokens;
  }
}

// ------------------------------------------------------------------- login page
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
// Slug -> rotulo legivel. Nomes proprios com grafia propria entram no mapa;
// o resto vira Title Case.
const TENANT_LABELS: Record<string, string> = {
  "g3-solar": "G3 Solar",
  hausgo: "HausGo",
  sonari: "Sonari",
  blackhaus: "Blackhaus",
};
const tenantLabel = (slug: string) =>
  TENANT_LABELS[slug] ?? slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function loginPage(hidden: Record<string, string>, errored: boolean, view: ConsentView): string {
  const fields = Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("\n    ");
  const who = view.clientName ? esc(view.clientName) : "Um aplicativo";
  const chips = view.tenants.map((t) => `<li>${esc(tenantLabel(t))}</li>`).join("");
  const piiItem = view.pii
    ? `<li class="warn"><span class="ico" aria-hidden="true">!</span><div><b>Fichas completas de leads</b><span>Inclui dados pessoais de clientes (nome, telefone, documentos).</span></div></li>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Autorizar acesso &middot; Relatórios do Financeiro</title>
<style>
  :root{
    --bg:#f1f5f9; --card:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0;
    --field:#fff; --field-line:#cbd5e1; --chip:#f1f5f9; --chip-fg:#334155;
    --brand:#4f46e5; --brand-fg:#fff; --ok:#059669;
    --warn-bg:#fffbeb; --warn-line:#fde68a; --warn-fg:#92400e;
    --err-bg:#fef2f2; --err-line:#fecaca; --err-fg:#b91c1c;
    --shadow:0 1px 2px rgba(15,23,42,.06),0 12px 32px -8px rgba(15,23,42,.18);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#020617; --card:#0f172a; --fg:#e2e8f0; --muted:#94a3b8; --line:#1e293b;
      --field:#020617; --field-line:#334155; --chip:#1e293b; --chip-fg:#cbd5e1;
      --brand:#6366f1; --ok:#34d399;
      --warn-bg:#2a1f05; --warn-line:#78500a; --warn-fg:#fcd34d;
      --err-bg:#2a0f12; --err-line:#7f2226; --err-fg:#fca5a5;
      --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -8px rgba(0,0,0,.6);
    }
  }
  *{box-sizing:border-box}
  body{
    margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
    background:var(--bg);color:var(--fg);
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .card{
    width:100%;max-width:26rem;background:var(--card);border:1px solid var(--line);
    border-radius:16px;box-shadow:var(--shadow);padding:1.75rem;
  }
  .brand{display:flex;align-items:center;gap:.625rem;margin-bottom:1.5rem}
  .mark{
    width:2rem;height:2rem;border-radius:8px;flex:none;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);
    display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:700;font-size:.8rem;letter-spacing:-.02em;
  }
  .brand span{font-weight:600;font-size:.9rem;letter-spacing:-.01em}
  h1{font-size:1.25rem;line-height:1.3;margin:0 0 .375rem;letter-spacing:-.02em}
  h1 b{color:var(--brand)}
  .lede{font-size:.875rem;color:var(--muted);margin:0 0 1.25rem;line-height:1.5}
  .perms{list-style:none;margin:0 0 1.25rem;padding:0;display:flex;flex-direction:column;gap:.625rem}
  .perms li{display:flex;gap:.625rem;align-items:flex-start;font-size:.8125rem;line-height:1.45}
  .perms b{display:block;font-weight:600;font-size:.8125rem}
  .perms span{color:var(--muted)}
  .ico{
    width:1.125rem;height:1.125rem;border-radius:999px;flex:none;margin-top:.05rem;
    display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;
    background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok);
  }
  .perms .warn{
    background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:10px;padding:.625rem .75rem;
  }
  .perms .warn b{color:var(--warn-fg)}
  .perms .warn span{color:var(--warn-fg);opacity:.85}
  .perms .warn .ico{background:color-mix(in srgb,var(--warn-fg) 20%,transparent);color:var(--warn-fg)}
  .chips-label{font-size:.8125rem;font-weight:500;margin:0}
  .chips{list-style:none;display:flex;flex-wrap:wrap;gap:.375rem;margin:.375rem 0 0;padding:0}
  .chips li{
    background:var(--chip);color:var(--chip-fg);border-radius:999px;
    padding:.1875rem .5rem;font-size:.75rem;font-weight:500;
  }
  hr{border:0;border-top:1px solid var(--line);margin:1.25rem 0}
  label{display:block;font-size:.8125rem;font-weight:500;margin-bottom:.375rem}
  input[type=password]{
    width:100%;padding:.625rem .75rem;font-size:.9375rem;font-family:inherit;
    background:var(--field);color:var(--fg);
    border:1px solid var(--field-line);border-radius:9px;outline:0;
    transition:border-color .12s,box-shadow .12s;
  }
  input[type=password]:focus{
    border-color:var(--brand);
    box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 25%,transparent);
  }
  .err{
    display:flex;gap:.5rem;align-items:center;margin-top:.625rem;padding:.5rem .625rem;
    background:var(--err-bg);border:1px solid var(--err-line);border-radius:9px;
    color:var(--err-fg);font-size:.8125rem;
  }
  button{
    width:100%;margin-top:1.125rem;padding:.6875rem;font-size:.9375rem;font-weight:600;font-family:inherit;
    border:0;border-radius:9px;background:var(--brand);color:var(--brand-fg);cursor:pointer;
    transition:filter .12s;
  }
  button:hover{filter:brightness(1.08)}
  button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  .foot{
    display:flex;align-items:center;justify-content:center;gap:.375rem;
    margin:1.125rem 0 0;font-size:.75rem;color:var(--muted);
  }
  .foot svg{width:.8125rem;height:.8125rem;flex:none}
</style></head>
<body>
<form class="card" method="POST" action="/oauth/approve">
  <div class="brand"><div class="mark" aria-hidden="true">R$</div><span>Relatórios do Financeiro</span></div>

  <h1><b>${who}</b> quer acessar seus relatórios</h1>
  <p class="lede">Confirme com sua senha para liberar o acesso. Você pode revogar a qualquer momento removendo o conector.</p>

  <ul class="perms">
    <li><span class="ico" aria-hidden="true">&check;</span><div><b>Ler os dados do financeiro</b><span>Faturamento, recebimento, inadimplência, repasses e comissões, carteira, usinas e geração.</span></div></li>
    ${piiItem}
    <li><span class="ico" aria-hidden="true">&check;</span><div><b>Somente leitura</b><span>Não emite, não cancela e não dá baixa em nada. Dados bancários, chave PIX e linha digitável nunca saem.</span></div></li>
  </ul>

  ${view.tenants.length ? `<div><p class="chips-label">Contas incluídas</p><ul class="chips">${chips}</ul></div><hr>` : "<hr>"}

  <label for="pw">Senha de acesso</label>
  <input id="pw" type="password" name="password" autofocus autocomplete="current-password" required
         ${errored ? 'aria-invalid="true" aria-describedby="err"' : ""}>
  ${errored ? '<div class="err" id="err" role="alert"><span aria-hidden="true">&#9888;</span> Senha incorreta. Tente novamente.</div>' : ""}
  ${fields}
  <button type="submit">Autorizar acesso</button>

  <p class="foot">
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 6V4.5a3.5 3.5 0 1 1 7 0V6h.5a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 6h.5Zm1.5 0h4V4.5a2 2 0 1 0-4 0V6Z"/></svg>
    Conexão segura &middot; ${esc(view.host)}
  </p>
</form>
</body></html>`;
}

// ------------------------------------------------------------------- instalacao
export type OAuthConfig = {
  baseUrl: URL;         // ex.: https://relatorio-financeiro.blackhaus.io
  loginPassword: string;
  storePath: string;
  identityLabel: string;
  scopesSupported?: string[];
  // Apenas para a tela de consentimento: o que essa identidade concede.
  displayTenants?: string[];
  displayPii?: boolean;
  /** Trilha de auditoria do servico (injetada; ver AuditFn). */
  audit: AuditFn;
};

// O que a tela de consentimento mostra sobre o acesso sendo concedido.
type ConsentView = { clientName?: string; tenants: string[]; pii: boolean; host: string };

/**
 * Monta o AS OAuth no app e devolve o provider (para o gate do /mcp verificar
 * tokens). Deve ser chamado ANTES do gate de bearer e depois do express.json.
 */
export function installOAuth(app: Express, cfg: OAuthConfig): OAuthServerProvider {
  const audit = cfg.audit;
  const store = new FileStore(cfg.storePath, (f) => audit({ evento: "oauth_store_migrado", ...f }));
  const view: ConsentView = {
    tenants: cfg.displayTenants ?? [],
    pii: !!cfg.displayPii,
    host: cfg.baseUrl.host,
  };
  const provider = new RelatorioOAuthProvider(store, cfg.identityLabel, view, audit);
  const pwBuf = Buffer.from(cfg.loginPassword);

  // ---- balde de tentativas de senha, por IP ----
  const fails = new Map<string, { n: number; first: number; until: number }>();
  const bloqueioRestante = (ip: string, agora: number): number => {
    const f = fails.get(ip);
    return f && f.until > agora ? Math.ceil((f.until - agora) / 1000) : 0;
  };
  const registraFalha = (ip: string, agora: number): void => {
    let f = fails.get(ip);
    if (!f || agora - f.first > FAIL_WINDOW_MS) f = { n: 0, first: agora, until: 0 };
    f.n++;
    if (f.n >= FAIL_MAX) { f.until = agora + LOCK_MS; f.n = 0; f.first = agora; }
    fails.set(ip, f);
    if (fails.size > 1000) {
      for (const [k, v] of fails) if (v.until < agora && agora - v.first > FAIL_WINDOW_MS) fails.delete(k);
    }
  };

  // Endpoints padrao (metadata, register, authorize, token, revoke).
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: cfg.baseUrl,
      baseUrl: cfg.baseUrl,
      resourceServerUrl: cfg.baseUrl,
      resourceName: "Relatorios do Financeiro",
      scopesSupported: cfg.scopesSupported,
    }),
  );

  // Consentimento: recebe a senha + os parametros do pedido, valida e emite o code.
  app.post("/oauth/approve", express.urlencoded({ extended: false }), (req: Request, res: Response) => {
    const agora = Date.now();
    // req.ip e' confiavel aqui: 'trust proxy' = 1 no app (nginx no mesmo host).
    const ip = req.ip ?? "desconhecido";
    const espera = bloqueioRestante(ip, agora);
    if (espera) {
      audit({ evento: "oauth_senha_bloqueada", ip, espera_s: espera });
      return res.status(429).set("Retry-After", String(espera))
        .send(`muitas tentativas -- tente de novo em ${espera}s`);
    }

    const b = req.body ?? {};
    const client_id = String(b.client_id ?? "");
    const redirect_uri = String(b.redirect_uri ?? "");
    const code_challenge = String(b.code_challenge ?? "");
    const state = b.state ? String(b.state) : undefined;
    const scope = String(b.scope ?? "");
    const password = String(b.password ?? "");

    const client = store.getClient(client_id);
    if (!client) {
      audit({ evento: "oauth_client_desconhecido", ip, client: client_id });
      return res.status(400).send("cliente desconhecido");
    }
    // trava anti-open-redirect: redirect_uri TEM que ser um dos registrados.
    if (!client.redirect_uris.includes(redirect_uri)) {
      audit({ evento: "oauth_redirect_nao_registrado", ip, client: client_id });
      return res.status(400).send("redirect_uri nao registrado");
    }
    if (!code_challenge) {
      audit({ evento: "oauth_sem_pkce", ip, client: client_id });
      return res.status(400).send("code_challenge ausente");
    }

    // senha timing-safe
    const inBuf = Buffer.from(password);
    const ok = inBuf.length === pwBuf.length && timingSafeEqual(inBuf, pwBuf);
    if (!ok) {
      // A senha e' a UNICA barreira entre a internet e a PII. Errar tem que
      // deixar rastro -- antes disto, forca bruta aqui era invisivel na trilha.
      // client_name fica de fora de proposito: vem de DCR aberto (texto de
      // terceiro) e quebraria o formato k=v da linha de auditoria.
      registraFalha(ip, agora);
      audit({ evento: "oauth_senha_incorreta", ip, client: client_id });
      const hidden: Record<string, string> = { client_id, redirect_uri, code_challenge, scope };
      if (state) hidden.state = state;
      return res
        .status(401)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(loginPage(hidden, true, { ...view, clientName: client.client_name }));
    }
    fails.delete(ip); // acertou: zera o balde deste IP

    const scopes = scope.split(/\s+/).filter(Boolean);
    const code = provider.issueCode(client_id, redirect_uri, code_challenge, scopes);
    const u = new URL(redirect_uri);
    u.searchParams.set("code", code);
    if (state) u.searchParams.set("state", state);
    audit({ evento: "oauth_consentimento_aprovado", ip, client: client_id, escopos: scopes.join(",") || "-" });
    res.redirect(u.href);
  });

  return provider;
}
