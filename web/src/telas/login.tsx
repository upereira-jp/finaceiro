// Login. E-mail e senha contra o Supabase Auth DO FINANCEIRO.
//
// Nunca contra o do CRM: a MT-06 foi decidida em 27/07 por auth proprio, e o
// motivo esta registrado - do CRM o financeiro so LE lead ativo, e leitura de
// dado nao e motivo para acoplar identidade. Acoplar faria o ciclo de vida da
// conta no CRM (desativacao, rotacao de segredo, troca de provedor) governar o
// acesso ao sistema de dinheiro.

import { useState } from 'react';
import { useSessao } from '../sessao.tsx';
import { Aviso } from '../ui.tsx';

export function Login() {
  const { cliente } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return;
    setOcupado(true); setErro(null);
    const { error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: senha });
    // A mensagem do Supabase e generica de proposito ("Invalid login credentials")
    // e ela fica: dizer se o e-mail existe entregaria a lista de usuarios.
    if (error) setErro(error.message);
    setOcupado(false);
  }

  return (
    <div className="conteudo" style={{ maxWidth: 380, paddingTop: 80 }}>
      <h1>Financeiro G3</h1>
      <p className="sub">Entre com a conta do financeiro.</p>
      <form onSubmit={entrar} className="cartao">
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label>e-mail</label>
            <input type="email" value={email} autoComplete="username"
                   onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label>senha</label>
            <input type="password" value={senha} autoComplete="current-password"
                   onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="primario" disabled={ocupado || !cliente}>
            {ocupado ? 'entrando…' : 'entrar'}
          </button>
        </div>
      </form>
    </div>
  );
}
