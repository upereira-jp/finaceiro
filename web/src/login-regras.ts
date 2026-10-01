// O ERRO DO LOGIN, em português de quem está na frente da tela.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU (30/09/2026, etapa 4b do redesenho)
//
// A tela de login mostrava o `error.message` do Supabase como veio: «Invalid
// login credentials», «Email not confirmed», «Failed to fetch», «Request rate
// limit reached». É a primeira tela de quem chega, e a única do sistema em
// inglês — e nenhuma das quatro frases dizia o que fazer.
//
// A FRASE NÃO DIZ QUAL DOS DOIS ESTÁ ERRADO, e isso continua de propósito: a
// resposta do Supabase é genérica para não entregar quem tem conta, e a
// tradução não pode desfazer isso («este e-mail não existe» seria a lista de
// usuários a uma tentativa de distância).
//
// O ORIGINAL NÃO SOME: ele vai para o «ver detalhe técnico», com o código e o
// status, porque é o que quem cuida do servidor precisa ver.
//
// ISTO É `.ts` PURO pelo motivo de sempre: o runner do `web/` não lê JSX, e a
// suíte `web/tests/formato.ts` mede cada caso.

/** O que o Supabase devolve (ou o que um `fetch` que caiu levanta). */
export type ErroDoAuth = {
  code?: string | null;
  status?: number | null;
  name?: string | null;
  message?: string | null;
} | null | undefined;

export type CasoDoLogin = 'credencial' | 'nao_confirmado' | 'limite' | 'rede' | 'desligado' | 'outro';

export type ErroDeLogin = {
  caso: CasoDoLogin;
  /** A frase da tela: o que houve e o que fazer. */
  frase: string;
  /** O que o Supabase disse, para o detalhe técnico. */
  original: string;
};

const FRASE: Record<CasoDoLogin, string> = {
  credencial: 'E-mail ou senha não conferem. Confira os dois e tente de novo — se esqueceu a senha, '
    + 'peça uma nova a quem administra a plataforma.',
  nao_confirmado: 'Este e-mail ainda não foi confirmado. Abra a mensagem de confirmação que chegou nele '
    + '(olhe também o spam) e tente de novo; se ela não chegou, peça um convite novo a quem administra a '
    + 'plataforma.',
  limite: 'Muitas tentativas seguidas. Espere alguns minutos antes de tentar de novo.',
  rede: 'Sem conexão com o servidor de login. Confira a internet deste computador e tente de novo em '
    + 'instantes.',
  desligado: 'Este acesso está desligado. Peça a quem administra a plataforma para religar.',
  outro: 'Não foi possível entrar agora. Tente de novo em instantes; se continuar, avise quem administra '
    + 'a plataforma e mostre o detalhe técnico abaixo.',
};

/** Qual dos casos é — pelo CÓDIGO quando o Supabase manda um (versões novas),
 *  pela frase em inglês quando não manda (versões velhas e o `fetch` caído). */
export function casoDoErro(e: ErroDoAuth): CasoDoLogin {
  const code = (e?.code ?? '').toLowerCase();
  const msg = (e?.message ?? '').toLowerCase();
  const status = e?.status ?? null;
  const nome = e?.name ?? '';

  if (code === 'invalid_credentials' || /invalid login credentials|invalid_grant/.test(msg)) return 'credencial';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(msg)) return 'nao_confirmado';
  if (code === 'user_banned' || /banned/.test(msg)) return 'desligado';
  if (/^over_.*rate_limit$/.test(code) || status === 429 || /rate limit|too many requests|only request this after/.test(msg)) {
    return 'limite';
  }
  if (nome === 'AuthRetryableFetchError' || status === 0
      || /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(msg)) {
    return 'rede';
  }
  return 'outro';
}

export function erroDeLogin(e: ErroDoAuth): ErroDeLogin {
  const caso = casoDoErro(e);
  const partes = [e?.message?.trim() || '(sem mensagem)'];
  const extra = [e?.code, e?.status != null ? `status ${e.status}` : null, e?.name].filter(Boolean);
  if (extra.length) partes.push(`(${extra.join(', ')})`);
  return { caso, frase: FRASE[caso], original: partes.join(' ') };
}
