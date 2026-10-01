// Login. E-mail e senha contra o Supabase Auth DO FINANCEIRO.
//
// Nunca contra o do CRM: a MT-06 foi decidida em 27/07 por auth proprio, e o
// motivo esta registrado - do CRM o financeiro so LE lead ativo, e leitura de
// dado nao e motivo para acoplar identidade. Acoplar faria o ciclo de vida da
// conta no CRM (desativacao, rotacao de segredo, troca de provedor) governar o
// acesso ao sistema de dinheiro.

import { useState } from 'react';
import { useSessao } from '../sessao.tsx';
import { Aviso, Logotipo, Icone, DetalheTecnico } from '../ui.tsx';
import { erroDeLogin, type ErroDeLogin } from '../login-regras.ts';

export function Login() {
  const { cliente, motivoDeSaida } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<ErroDeLogin | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return;
    setOcupado(true); setErro(null);
    // A mensagem do Supabase e generica de proposito ("Invalid login credentials")
    // e a traducao tambem e: dizer se o e-mail existe entregaria a lista de
    // usuarios. [30/09/2026, etapa 4b] Ela deixou de ir crua, em ingles, para a
    // tela — `login-regras.ts` a traduz no que fazer, e o original fica atras do
    // «ver detalhe tecnico». O `try` pega o `fetch` que cai antes de haver
    // resposta (rede fora), que levanta em vez de devolver `error`.
    try {
      const { error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) setErro(erroDeLogin(error));
    } catch (e: any) {
      setErro(erroDeLogin({ name: e?.name, message: e?.message ?? String(e) }));
    }
    setOcupado(false);
  }

  return (
    <div className="central">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
          <Logotipo tamanho={32} />
          <h1 style={{ margin: 0 }}>Financeiro G3</h1>
        </div>
        <p className="sub">Entre com a conta do financeiro.</p>
        {/*
          * QUEM CHEGOU AQUI SEM QUERER precisa saber por que. `motivoDeSaida` so
          * vem preenchido quando a sessao caiu sozinha (401) - sair pelo menu o
          * deixa nulo, e ai o formulario aparece limpo, como deve.
          *
          * Ate 30/07/2026 nao havia nem uma coisa nem outra: a sessao vencida
          * NAO derrubava para ca, ficava pintando "Credencial invalida." em cada
          * painel da tela, e recarregar nao ajudava porque a sessao vencida vive
          * no localStorage.
          */}
        {motivoDeSaida && <Aviso tipo="alerta">{motivoDeSaida}</Aviso>}
        <form onSubmit={entrar} className="cartao">
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label htmlFor="login-email">E-mail</label>
              <input id="login-email" type="email" value={email} autoComplete="username"
                     aria-invalid={erro?.caso === 'credencial' || undefined}
                     onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="login-senha">Senha</label>
              <input id="login-senha" type="password" value={senha} autoComplete="current-password"
                     aria-invalid={erro?.caso === 'credencial' || undefined}
                     onChange={(e) => setSenha(e.target.value)} required />
            </div>
            {erro && (
              <Aviso tipo="erro">
                {erro.frase}
                <DetalheTecnico>
                  <p style={{ margin: 0 }}>O que o servidor de login respondeu: <code>{erro.original}</code></p>
                </DetalheTecnico>
              </Aviso>
            )}
            <button className="primario" disabled={ocupado || !cliente}>
              <Icone nome={ocupado ? 'carregando' : 'usuario'} tamanho={16} peso="bold" />
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
