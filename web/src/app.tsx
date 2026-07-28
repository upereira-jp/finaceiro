// Layout, roteador e a porta de entrada das telas.
//
// O ROTEADOR SAO 20 LINHAS E NAO UMA DEPENDENCIA. Sao nove telas, todas de
// primeiro nivel, sem rota aninhada e sem carregamento sob demanda. `hash` em
// vez de History API de proposito: com hash, o servidor de estaticos nao precisa
// saber nada sobre as rotas do front - e o `servirEstatico` ja cai no
// index.html, mas depender disso seria acoplar as duas coisas sem ganho.
//
// AS TELAS SAO A ORDEM DAS CAMADAS DA PRONTIDAO, e isso e deliberado: quem abre
// o sistema hoje precisa fechar quatro camadas de cadastro para a primeira
// fatura existir, e a barra de navegacao e a ordem em que o trabalho destrava o
// proximo passo.

import { useEffect, useState } from 'react';
import { useSessao } from './sessao.tsx';
import { ESTILO, Aviso } from './ui.tsx';
import { Login } from './telas/login.tsx';
import { TelaProntidao } from './telas/prontidao.tsx';
import { TelaClientes } from './telas/clientes.tsx';
import { TelaUnidades } from './telas/unidades.tsx';
import { TelaContratos } from './telas/contratos.tsx';
import { TelaDonos } from './telas/donos.tsx';
import { TelaUsinas } from './telas/usinas.tsx';
import { TelaTarifas } from './telas/tarifas.tsx';
import { TelaCarteira } from './telas/carteira.tsx';

const TELAS = [
  { rota: 'prontidao', titulo: 'Prontidão',  render: () => <TelaProntidao /> },
  { rota: 'clientes',  titulo: 'Clientes',   render: () => <TelaClientes /> },
  { rota: 'unidades',  titulo: 'Unidades',   render: () => <TelaUnidades /> },
  { rota: 'contratos', titulo: 'Contratos',  render: () => <TelaContratos /> },
  { rota: 'usinas',    titulo: 'Usinas',     render: () => <TelaUsinas /> },
  { rota: 'donos',     titulo: 'Donos',      render: () => <TelaDonos /> },
  { rota: 'tarifas',   titulo: 'Tarifas',    render: () => <TelaTarifas /> },
  { rota: 'carteira',  titulo: 'Carteira',   render: () => <TelaCarteira /> },
] as const;

function useRota(): string {
  const [r, setR] = useState(() => location.hash.slice(1) || 'prontidao');
  useEffect(() => {
    const ao = () => setR(location.hash.slice(1) || 'prontidao');
    addEventListener('hashchange', ao);
    return () => removeEventListener('hashchange', ao);
  }, []);
  return r;
}

export function App() {
  const s = useSessao();
  const rota = useRota();

  if (s.carregando) return <><style>{ESTILO}</style><div className="conteudo fraco">carregando…</div></>;

  if (s.erro && !s.sessaoAuth) {
    return (
      <><style>{ESTILO}</style>
        <div className="conteudo">
          <h1>Financeiro G3</h1>
          <Aviso tipo="erro">{s.erro}</Aviso>
          <p className="sub">
            Se a mensagem fala de <code>SUPABASE_ANON_KEY</code>, a variável não está no ambiente do
            servidor. O <code>.env.example</code> diz onde encontrá-la.
          </p>
        </div>
      </>
    );
  }

  if (!s.sessaoAuth) return <><style>{ESTILO}</style><Login /></>;

  const tela = TELAS.find((t) => t.rota === rota) ?? TELAS[0];
  const vinculo = s.sessao?.tenants.find((t) => t.tenantId === s.tenantId);

  return (
    <>
      <style>{ESTILO}</style>
      <header className="barra">
        <strong style={{ fontSize: 15 }}>Financeiro G3</strong>
        <nav>
          {TELAS.map((t) => (
            <a key={t.rota} href={`#${t.rota}`} className={t.rota === tela.rota ? 'ativo' : ''}>{t.titulo}</a>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
          {/*
            O TENANT FICA VISIVEL O TEMPO TODO, e nao escondido num menu. Todo
            dado desta tela e de UM tenant, e a RLS garante que so ele apareca -
            mas quem opera precisa saber de qual empresa esta olhando o dinheiro
            sem ter que procurar.
          */}
          {s.sessao && s.sessao.tenants.length > 1 ? (
            <select value={s.tenantId ?? ''} onChange={(e) => s.escolherTenant(e.target.value)}
                    style={{ width: 'auto', padding: '4px 8px' }}>
              <option value="">escolha a empresa…</option>
              {s.sessao.tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>{t.razaoSocial} ({t.papel})</option>
              ))}
            </select>
          ) : (
            <span className="fraco">{vinculo?.razaoSocial ?? '—'}{vinculo && ` · ${vinculo.papel}`}</span>
          )}
          <span className="fraco">{s.sessao?.nome}</span>
          <button onClick={() => void s.sair()}>sair</button>
        </div>
      </header>

      <main className="conteudo">
        {!s.tenantId ? (
          <Aviso tipo="erro">
            Escolha a empresa na barra acima. Nenhuma tela carrega sem isso — e o servidor recusaria
            de qualquer forma: com mais de um vínculo, ele não escolhe por você.
          </Aviso>
        ) : tela.render()}
      </main>
    </>
  );
}
