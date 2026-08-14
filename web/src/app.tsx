// Layout, roteador e a porta de entrada das telas.
//
// O ROTEADOR MUDOU DE HASH PARA CAMINHO EM 29/07/2026, a pedido do dono — a
// mecânica está em `rota.tsx`. O argumento antigo deste cabeçalho ("com hash o
// servidor de estáticos não precisa saber das rotas") já estava pago: o
// `servirEstatico` cai no index.html para todo caminho sem extensão, de
// propósito e com comentário dizendo que `/contratos` é uma tela.
//
// A LISTA DAS TELAS SAIU DAQUI EM 30/07 e virou `navegacao.ts`, dado puro. O que
// ficou é o `RENDER` — de qual componente cada rota é feita — e a divisão é a
// mesma que existe entre `cobranca-regras.ts` e a tela de Cobrança: o que precisa
// de teste sai do `.tsx`, porque o runner do `web/` não lê JSX.
//
// AS TELAS SAO A ORDEM DAS CAMADAS DA PRONTIDAO, e isso e deliberado: quem abre
// o sistema hoje precisa fechar quatro camadas de cadastro para a primeira
// fatura existir, e a barra de navegacao e a ordem em que o trabalho destrava o
// proximo passo. A ordem mora em `navegacao.ts`, e agora a barra MOSTRA a
// fronteira entre cadastro e dinheiro com uma divisoria.
//
// O TOPO TEM DUAS FAIXAS DESDE 30/07. Doze telas mais o bloco do usuario numa
// faixa unica dependiam de `flex-wrap` para caber, e o resultado era duas linhas
// irregulares em tela media. Agora: identidade e sessao em cima, navegacao
// embaixo, com rolagem horizontal quando nao couber.

import { lazy, Suspense, type ReactElement } from 'react';
import { useSessao } from './sessao.tsx';
import {
  Aviso, Logotipo, Icone, Menu, ItensDeTema, Escolha, Carregando, ESTILO,
} from './ui.tsx';
import { useCaminho, Ligacao } from './rota.tsx';
import { TELAS, telaDoCaminho, inicioDoGrupoDinheiro } from './navegacao.ts';
import { Login } from './telas/login.tsx';
/*
 * ============================================================================
 * AS DOZE TELAS CHEGAM SOB DEMANDA desde 14/08/2026.
 *
 * O QUE ISSO CONSERTA, e foi medido: `web/dist` tinha um pedaco unico de 227 KB
 * mais 161 KB de icones, e a **tela de login** — que e a primeira coisa que
 * qualquer pessoa carrega, todo dia — baixava as doze telas, o codificador de
 * QR, o desenhista de codigo de barras e o CSS inteiro antes de mostrar dois
 * campos e um botao.
 *
 * O CORTE E POR ROTA e nao por biblioteca, porque e a rota que decide o que a
 * pessoa vai usar: quem abre Clientes nao carrega o desenho da fatura, e as duas
 * telas mais pesadas do sistema — Documento e a fatura unificada, 2.088 das
 * 4.461 linhas de `telas/` — so chegam para quem abre a aba Documento.
 *
 * O QUE FICA NO PEDACO DE ENTRADA: o login, o chrome (`ui.tsx`, `rota.tsx`,
 * `sessao.tsx`, `estilo.ts`) e `navegacao.ts`. A barra de navegacao precisa dos
 * nomes e dos icones das doze ANTES de qualquer uma carregar — ela e o que
 * mostra para onde ir.
 *
 * `Suspense` COM O MESMO `Carregando` DO RESTO, e nao um spinner proprio: a
 * troca de tela ja tinha um estado de carga (o `useDados` de cada tela), e um
 * segundo desenho para a mesma espera faria a pessoa ver duas coisas diferentes
 * significando o mesmo.
 */
const TelaProntidao = lazy(() => import('./telas/prontidao.tsx').then((m) => ({ default: m.TelaProntidao })));
const TelaClientes = lazy(() => import('./telas/clientes.tsx').then((m) => ({ default: m.TelaClientes })));
const TelaUnidades = lazy(() => import('./telas/unidades.tsx').then((m) => ({ default: m.TelaUnidades })));
const TelaContratos = lazy(() => import('./telas/contratos.tsx').then((m) => ({ default: m.TelaContratos })));
const TelaDonos = lazy(() => import('./telas/donos.tsx').then((m) => ({ default: m.TelaDonos })));
const TelaUsinas = lazy(() => import('./telas/usinas.tsx').then((m) => ({ default: m.TelaUsinas })));
const TelaCarteira = lazy(() => import('./telas/carteira.tsx').then((m) => ({ default: m.TelaCarteira })));
const TelaFaturas = lazy(() => import('./telas/faturas.tsx').then((m) => ({ default: m.TelaFaturas })));
const TelaCobranca = lazy(() => import('./telas/cobranca.tsx').then((m) => ({ default: m.TelaCobranca })));
const TelaRelatorios = lazy(() => import('./telas/relatorios.tsx').then((m) => ({ default: m.TelaRelatorios })));
const TelaDocumento = lazy(() => import('./telas/documento.tsx').then((m) => ({ default: m.TelaDocumento })));
const TelaContasAPagar = lazy(() => import('./telas/contas-a-pagar.tsx').then((m) => ({ default: m.TelaContasAPagar })));

/**
 * Rota -> componente. `Record` sobre as rotas de `navegacao.ts`, então uma tela
 * nova sem render aqui **não compila** — é o mesmo mecanismo que garante que todo
 * nome de ícone tenha desenho.
 */
const RENDER: Record<string, () => ReactElement> = {
  '/pendencias': () => <TelaProntidao />,
  '/clientes': () => <TelaClientes />,
  '/unidades': () => <TelaUnidades />,
  '/contratos': () => <TelaContratos />,
  '/usinas': () => <TelaUsinas />,
  '/donos': () => <TelaDonos />,
  '/carteira': () => <TelaCarteira />,
  '/faturas': () => <TelaFaturas />,
  '/cobranca': () => <TelaCobranca />,
  '/documento': () => <TelaDocumento />,
  '/contas-a-pagar': () => <TelaContasAPagar />,
  '/relatorios': () => <TelaRelatorios />,
};

export function App() {
  const s = useSessao();
  const caminho = useCaminho();

  if (s.carregando) {
    return <><style>{ESTILO}</style><div className="conteudo"><Carregando /></div></>;
  }

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
  // Pendências — a tela que diz o que falta é o lugar certo para se perder.
  const tela = telaDoCaminho(caminho);
  const vinculo = s.sessao?.tenants.find((t) => t.tenantId === s.tenantId);
  const varios = Boolean(s.sessao && s.sessao.tenants.length > 1);

  return (
    <>
      <style>{ESTILO}</style>
      <header className="topo">
        <div className="filete" aria-hidden="true" />

        <div className="barra">
          <span className="marca-app"><Logotipo tamanho={22} /> Financeiro G3</span>

          <div className="sessao">
            {/*
              O TENANT FICA VISIVEL O TEMPO TODO, e nao escondido num menu. Todo
              dado desta tela e de UM tenant, e a RLS garante que so ele apareca -
              mas quem opera precisa saber de qual empresa esta olhando o dinheiro
              sem ter que procurar. Com mais de um vinculo ele continua sendo um
              seletor na barra, porque trocar de empresa e um ato frequente; com
              um so, e um rotulo com o icone de predio.
            */}
            {varios ? (
              <Escolha valor={s.tenantId ?? ''} ao={(v) => s.escolherTenant(v)}
                       rotuloAcessivel="Empresa" primeira="Escolha a empresa…"
                       opcoes={s.sessao!.tenants.map((t) => ({
                         valor: t.tenantId, texto: `${t.razaoSocial} (${t.papel})`,
                       }))} />
            ) : (
              <span className="fraco" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icone nome="empresa" tamanho={15} />
                {vinculo?.razaoSocial ?? '—'}
              </span>
            )}

            <Menu rotulo="Conta e aparência"
                  gatilho={<><Icone nome="usuario" tamanho={18} />
                             <span className="so-largo">{s.sessao?.nome}</span></>}>
              <div className="quem">
                <strong>{s.sessao?.nome}</strong>
                <span>{vinculo ? `${vinculo.razaoSocial} · ${vinculo.papel}` : '—'}</span>
              </div>
              <hr />
              <ItensDeTema />
              <hr />
              <button type="button" role="menuitem" onClick={() => void s.sair()}>
                <Icone nome="sair" tamanho={16} /> Sair
              </button>
            </Menu>
          </div>
        </div>

        <nav className="barra-nav" aria-label="Telas">
          {/* `flatMap` e nao `map` com fragmento: a divisoria e um IRMAO dos
              links, nao um filho. Envolver o par num fragmento por item faria o
              `gap` do flex contar o par como um elemento so, e a divisoria
              grudaria no link seguinte. */}
          {TELAS.flatMap((t, i) => {
            const ativo = t.rota === tela.rota;
            const link = (
              <Ligacao key={t.rota} para={t.rota} atual={ativo}
                       className={ativo ? 'ativo' : undefined}>
                <Icone nome={t.icone} tamanho={17} peso={ativo ? 'fill' : 'regular'} />
                {t.titulo}
              </Ligacao>
            );
            // A divisoria entre cadastro e dinheiro. O indice vem calculado de
            // `navegacao.ts`: reordenar as telas move a divisoria junto.
            return i === inicioDoGrupoDinheiro
              ? [<span key="divisor" className="divisor" aria-hidden="true" />, link]
              : [link];
          })}
        </nav>
      </header>

      <main className="conteudo">
        {!s.tenantId ? (
          <Aviso tipo="erro">
            Escolha a empresa na barra acima. Nenhuma tela carrega sem isso — e o servidor recusaria
            de qualquer forma: com mais de um vínculo, ele não escolhe por você.
          </Aviso>
        ) : (
          <Suspense fallback={<Carregando texto="Abrindo a tela…" />}>
            {RENDER[tela.rota]!()}
          </Suspense>
        )}
      </main>
    </>
  );
}
