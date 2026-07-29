// Layout, roteador e a porta de entrada das telas.
//
// O ROTEADOR MUDOU DE HASH PARA CAMINHO EM 29/07/2026, a pedido do dono — a
// mecânica está em `rota.tsx`. O argumento antigo deste cabeçalho ("com hash o
// servidor de estáticos não precisa saber das rotas") já estava pago: o
// `servirEstatico` cai no index.html para todo caminho sem extensão, de
// propósito e com comentário dizendo que `/contratos` é uma tela.
//
// AS TELAS SAO A ORDEM DAS CAMADAS DA PRONTIDAO, e isso e deliberado: quem abre
// o sistema hoje precisa fechar quatro camadas de cadastro para a primeira
// fatura existir, e a barra de navegacao e a ordem em que o trabalho destrava o
// proximo passo.

import { useSessao } from './sessao.tsx';
import { ESTILO, Aviso, Logotipo, SeletorDeTema } from './ui.tsx';
import { useCaminho, Ligacao } from './rota.tsx';
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
  { rota: '/prontidao', titulo: 'Prontidão',  render: () => <TelaProntidao /> },
  { rota: '/clientes',  titulo: 'Clientes',   render: () => <TelaClientes /> },
  { rota: '/unidades',  titulo: 'Unidades',   render: () => <TelaUnidades /> },
  { rota: '/contratos', titulo: 'Contratos',  render: () => <TelaContratos /> },
  { rota: '/usinas',    titulo: 'Usinas',     render: () => <TelaUsinas /> },
  { rota: '/donos',     titulo: 'Donos',      render: () => <TelaDonos /> },
  { rota: '/tarifas',   titulo: 'Tarifas',    render: () => <TelaTarifas /> },
  { rota: '/carteira',  titulo: 'Carteira',   render: () => <TelaCarteira /> },
] as const;

export function App() {
  const s = useSessao();
  const caminho = useCaminho();

  if (s.carregando) return <><style>{ESTILO}</style><div className="conteudo fraco">Carregando…</div></>;

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

  // Caminho desconhecido (inclusive `/`) cai na primeira tela, que é a
  // Prontidão — a tela que diz o que falta é o lugar certo para se perder.
  const tela = TELAS.find((t) => t.rota === caminho) ?? TELAS[0];
  const vinculo = s.sessao?.tenants.find((t) => t.tenantId === s.tenantId);

  return (
    <>
      <style>{ESTILO}</style>
      <header className="topo">
        <div className="filete" aria-hidden="true" />
        <div className="barra">
          <span className="marca-app"><Logotipo /> Financeiro G3</span>
          <nav>
            {TELAS.map((t) => (
              <Ligacao key={t.rota} para={t.rota}
                       className={t.rota === tela.rota ? 'ativo' : undefined}>{t.titulo}</Ligacao>
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
                <option value="">Escolha a empresa…</option>
                {s.sessao.tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>{t.razaoSocial} ({t.papel})</option>
                ))}
              </select>
            ) : (
              <span className="fraco">{vinculo?.razaoSocial ?? '—'}{vinculo && ` · ${vinculo.papel}`}</span>
            )}
            <span className="fraco">{s.sessao?.nome}</span>
            <SeletorDeTema />
            <button onClick={() => void s.sair()}>Sair</button>
          </div>
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
