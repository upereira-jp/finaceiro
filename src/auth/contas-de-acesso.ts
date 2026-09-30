// A CONTA DE LOGIN de uma pessoa nova — a metade do cadastro que NAO mora no
// nosso banco.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE, e por que ele precisa de uma chave nova
//
// Cadastrar alguem no Financeiro tem duas metades: a CONTA em `auth.users` do
// Supabase Auth do projeto do financeiro (MT-06: auth proprio), e o VINCULO em
// `usuario`/`usuario_tenant`. Ate 30/09/2026 as duas eram feitas a mao pelo dono
// — painel do Supabase e `scripts/provisionar-usuario.sql`.
//
// A primeira metade so tem tres portas, e duas nao servem:
//
//   - o SIGNUP publico (chave anonima): o projeto tem `mailer_autoconfirm:
//     false` (lido em `/auth/v1/settings` em 30/09), entao a conta nasce sem
//     e-mail confirmado e o login e RECUSADO ate a pessoa clicar num e-mail — que
//     o SMTP padrao do Supabase so manda para membros da equipe do projeto;
//   - INSERT direto em `auth.users` por SQL: esquema interno do GoTrue, sem
//     contrato; muda de versao sem aviso e ha `auth.identities` junto;
//   - a API ADMINISTRATIVA do GoTrue (`/auth/v1/admin/users`), com a chave
//     SECRETA do projeto. E esta.
//
// A CHAVE E SEGREDO DE PLATAFORMA, e a regra 5 manda esse tipo para variavel de
// ambiente: `SUPABASE_SERVICE_ROLE_KEY` em `/etc/financeiro.env`. Ela NUNCA sai
// deste arquivo — nao vai para mensagem de erro, log nem resposta — e o
// servidor so a usa para tres chamadas: criar conta, achar conta por e-mail,
// e trocar a senha de uma conta que nunca entrou no sistema.
//
// SEM A CHAVE, O RESTO DA ADMINISTRACAO FUNCIONA: a lista e a troca de setores
// sao so banco. So o botao de cadastrar diz o que falta (503 nomeado).

export type ContaDeAcesso = {
  authUserId: string;
  /** A conta ja existia em `auth.users` antes deste cadastro. */
  jaExistia: boolean;
};

export interface PortaDeContas {
  /** Cria a conta com e-mail JA CONFIRMADO e a senha dada. Se o e-mail ja tem
   *  conta, devolve a existente com `jaExistia: true` — e NAO mexe na senha. */
  criarOuAchar(p: { email: string; senha: string; nome: string }): Promise<ContaDeAcesso>;
  /** Senha nova + e-mail confirmado. So para conta que nunca teve acesso ao
   *  sistema (quem chama confere isso no nosso banco). */
  redefinirSenha(authUserId: string, senha: string): Promise<void>;
}

/** 503: o servidor nao tem a chave. Nomeado, porque a correcao e uma linha no
 *  ambiente e quem opera precisa ler exatamente isso. */
export class CadastroDeLoginIndisponivel extends Error {
  readonly status = 503;
  constructor() {
    super('O servidor ainda não tem a chave que cria logins no Supabase. Quem cuida do servidor '
      + 'precisa acrescentar a chave secreta do projeto ao ambiente e reiniciar. A lista e os setores '
      + 'continuam funcionando.');
    this.name = 'CadastroDeLoginIndisponivel';
  }
}

/** 502: o Supabase Auth respondeu, e nao foi o esperado. A mensagem carrega o
 *  codigo DELE (e publico), nunca a chave nem a resposta inteira. */
export class FalhaNoSupabaseAuth extends Error {
  readonly status: number;
  constructor(mensagem: string, status = 502) {
    super(mensagem);
    this.status = status;
    this.name = 'FalhaNoSupabaseAuth';
  }
}

type Resposta = { status: number; corpo: any };

export function contasSupabase(o: {
  supabaseUrl: string;
  chave: string;
  buscar?: typeof fetch;
  /** Tamanho da pagina ao procurar conta por e-mail. Injetavel so para teste. */
  porPagina?: number;
}): PortaDeContas {
  const base = `${o.supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin`;
  const buscar = o.buscar ?? fetch;
  const porPagina = o.porPagina ?? 200;

  async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<Resposta> {
    let r: Response;
    try {
      r = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          // A chave vai nos DOIS cabecalhos, IGUAL: e o que o gateway do Supabase
          // aceita tanto para a `service_role` antiga (JWT) quanto para a chave
          // secreta nova (`sb_secret_...`), que nao e JWT.
          apikey: o.chave,
          authorization: `Bearer ${o.chave}`,
          'content-type': 'application/json',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      throw new FalhaNoSupabaseAuth(
        `Não foi possível falar com o Supabase Auth (${e?.name === 'TimeoutError' ? 'tempo esgotado' : 'rede'}). `
        + 'Nada foi criado; tente de novo em instantes.');
    }
    const texto = await r.text();
    let dado: any = undefined;
    try { dado = texto ? JSON.parse(texto) : undefined; } catch { /* corpo nao-JSON */ }
    return { status: r.status, corpo: dado };
  }

  /** O codigo do erro do GoTrue. Versoes novas mandam `error_code`; as antigas,
   *  so a frase em `msg`. */
  const codigoDe = (c: any): string => String(c?.error_code ?? c?.code ?? '');
  const fraseDe = (c: any): string => String(c?.msg ?? c?.message ?? c?.error_description ?? '');

  const emailJaExiste = (r: Resposta): boolean =>
    r.status === 422 && (codigoDe(r.corpo) === 'email_exists' || /already been registered/i.test(fraseDe(r.corpo)));

  async function acharPorEmail(email: string): Promise<string | null> {
    /* PAGINADO, e sem filtro no servidor de proposito: o parametro de busca da
     * listagem nao e o mesmo em toda versao do GoTrue, e o projeto do financeiro
     * tem poucas contas — uma pagina, na pratica. O teto de 50 paginas existe
     * para um defeito na paginacao nao virar um laco infinito. */
    for (let pagina = 1; pagina <= 50; pagina++) {
      const r = await chamar('GET', `/users?page=${pagina}&per_page=${porPagina}`);
      if (r.status !== 200) {
        throw new FalhaNoSupabaseAuth(`O Supabase Auth recusou a busca da conta (HTTP ${r.status}).`);
      }
      const contas: any[] = Array.isArray(r.corpo?.users) ? r.corpo.users : [];
      const achada = contas.find((u) => String(u?.email ?? '').toLowerCase() === email);
      if (achada?.id) return String(achada.id);
      if (contas.length < porPagina) return null;
    }
    return null;
  }

  return {
    async criarOuAchar({ email, senha, nome }) {
      const r = await chamar('POST', '/users', {
        email, password: senha, email_confirm: true, user_metadata: { nome },
      });
      if (r.status === 200 || r.status === 201) {
        if (!r.corpo?.id) throw new FalhaNoSupabaseAuth('O Supabase Auth criou a conta e não devolveu o id dela.');
        return { authUserId: String(r.corpo.id), jaExistia: false };
      }
      if (emailJaExiste(r)) {
        const id = await acharPorEmail(email);
        if (!id) {
          throw new FalhaNoSupabaseAuth('O Supabase Auth diz que este e-mail já tem conta, e a conta não '
            + 'aparece na lista dele. Nada foi gravado no Financeiro.');
        }
        return { authUserId: id, jaExistia: true };
      }
      if (r.status === 422 && codigoDe(r.corpo) === 'weak_password') {
        throw new FalhaNoSupabaseAuth('O Supabase Auth recusou a senha por ser fraca. Use uma senha mais '
          + 'longa, com letras e números.', 422);
      }
      if (r.status === 401 || r.status === 403) {
        throw new FalhaNoSupabaseAuth('O Supabase Auth recusou a chave do servidor (HTTP '
          + `${r.status}). Confira se a chave no ambiente é a chave SECRETA deste projeto.`);
      }
      const codigo = codigoDe(r.corpo);
      throw new FalhaNoSupabaseAuth(`O Supabase Auth recusou criar a conta (HTTP ${r.status}`
        + `${codigo ? `, ${codigo}` : ''}). Nada foi gravado no Financeiro.`);
    },

    async redefinirSenha(authUserId, senha) {
      const r = await chamar('PUT', `/users/${encodeURIComponent(authUserId)}`, {
        password: senha, email_confirm: true,
      });
      if (r.status !== 200) {
        throw new FalhaNoSupabaseAuth(`O Supabase Auth recusou definir a senha (HTTP ${r.status}).`);
      }
    },
  };
}

/**
 * A porta a partir do ambiente, ou `null` sem a chave. `null` e nao excecao:
 * o processo SOBE sem ela — a chave so e necessaria para um botao, e um servidor
 * que nao arranca por causa de um botao para o faturamento inteiro.
 */
export function contasDoAmbiente(): PortaDeContas | null {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) return null;
  return contasSupabase({ supabaseUrl: url, chave });
}
