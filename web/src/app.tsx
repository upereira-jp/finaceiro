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

import type { ReactElement } from 'react';
import { useSessao } from './sessao.tsx';
import {
  Aviso, Logotipo, Icone, Menu, ItensDeTema, Escolha, Carregando, ESTILO,
} from './ui.tsx';
import { useCaminho, Ligacao } from './rota.tsx';
import { TELAS, telaDoCaminho, inicioDoGrupoDinheiro } from './navegacao.ts';
import { Login } from './telas/login.tsx';
import { TelaProntidao } from './telas/prontidao.tsx';
import { TelaClientes } from './telas/clientes.tsx';
import { TelaUnidades } from './telas/unidades.tsx';
import { TelaContratos } from './telas/contratos.tsx';
import { TelaDonos } from './telas/donos.tsx';
import { TelaUsinas } from './telas/usinas.tsx';
import { TelaTarifas } from './telas/tarifas.tsx';
import { TelaCarteira } from './telas/carteira.tsx';
import { TelaFaturas } from './telas/faturas.tsx';
import { TelaCobranca } from './telas/cobranca.tsx';
import { TelaRelatorios } from './telas/relatorios.tsx';
import { TelaDocumento } from './telas/documento.tsx';

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
  '/tarifas': () => <TelaTarifas />,
  '/carteira': () => <TelaCarteira />,
  '/faturas': () => <TelaFaturas />,
  '/cobranca': () => <TelaCobranca />,
  '/documento': () => <TelaDocumento />,
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
              <Ligacao key={t.rota} para={t.rota} className={ativo ? 'ativo' : undefined}>
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
        ) : RENDER[tela.rota]!()}
      </main>
    </>
  );
}
