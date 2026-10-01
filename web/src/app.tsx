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
// DOIS FUNIS DESDE 22/09/2026 — «Rateio» e «Empresa» —, e a navegacao passou a
// ter dois niveis: o seletor de funil e, abaixo dele, SO as telas do funil
// escolhido (na barra ate 30/09/2026; no menu lateral desde entao). A divisao e
// a do negocio (o dinheiro que entra dos clientes; o caixa da empresa), e mora
// em `navegacao.ts` como dado — aqui so se desenha. O funil ativo e DERIVADO do
// caminho, nunca guardado em estado: o endereco ja diz de que lado a pessoa
// esta. Desde 27/09 o seletor e o nome do setor com o ⌃⌄ — o porque esta em
// `seletor-de-setor.tsx`.
//
// O TOPO TEVE DUAS FAIXAS DE 30/07 A 30/09/2026: identidade, funil e sessao em
// cima, navegacao embaixo. Em 30/09 (etapa 3b) a barra inteira virou o MENU
// LATERAL, a pedido do dono — ver `menu-lateral.tsx`. O que ficou aqui e o que
// liga a casca a sessao: quem esta logado, em qual empresa, e o que o vinculo ve.

import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { useSessao } from './sessao.tsx';
import {
  Aviso, Icone, Menu, ItensDeTema, Escolha, Carregando, DetalheTecnico, ESTILO,
} from './ui.tsx';
import { useCaminho, navegar } from './rota.tsx';
import { telaDoCaminho, funilDoCaminho, funisVisiveis, destinoVisivel } from './navegacao.ts';
import { GatilhoDeAjuda, EVENTO_ABRIR_AJUDA } from './ajuda-gatilho.tsx';
import { MenuLateral } from './menu-lateral.tsx';
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
 * `sessao.tsx`, `estilo.ts`, `menu-lateral.tsx`) e `navegacao.ts`. O menu de
 * navegacao precisa dos nomes e dos icones das telas ANTES de qualquer uma
 * carregar — ele e o que mostra para onde ir.
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
const TelaFaturas = lazy(() => import('./telas/faturas.tsx').then((m) => ({ default: m.TelaFaturas })));
const TelaCobranca = lazy(() => import('./telas/cobranca.tsx').then((m) => ({ default: m.TelaCobranca })));
const TelaRelatorios = lazy(() => import('./telas/relatorios.tsx').then((m) => ({ default: m.TelaRelatorios })));
const TelaDocumento = lazy(() => import('./telas/documento.tsx').then((m) => ({ default: m.TelaDocumento })));
const TelaContasAReceber = lazy(() => import('./telas/contas-a-receber.tsx').then((m) => ({ default: m.TelaContasAReceber })));
const TelaContasAPagar = lazy(() => import('./telas/contas-a-pagar.tsx').then((m) => ({ default: m.TelaContasAPagar })));
const TelaHistorico = lazy(() => import('./telas/historico.tsx').then((m) => ({ default: m.TelaHistorico })));
const TelaUsuarios = lazy(() => import('./telas/usuarios.tsx').then((m) => ({ default: m.TelaUsuarios })));

/*
 * A AJUDA TAMBEM CHEGA SOB DEMANDA, e pela mesma razao das telas: ela carrega a
 * base de topicos e o vocabulario inteiro, e a maioria das sessoes nunca a abre.
 * O que fica no pedaco de entrada e so o BOTAO — que precisa existir em toda
 * tela, porque quem trava nao sabe que travou antes de travar.
 */
const PainelDeAjuda = lazy(() => import('./ajuda-painel.tsx').then((m) => ({ default: m.PainelDeAjuda })));

/*
 * ============================================================================
 * O BALAO DE PRIMEIRA VISITA — a marca que o faz aparecer UMA vez.
 *
 * Pedido do dono em 21/08: *"sempre que o computador fizer o login pela primeira
 * vez no sistema, deve aparecer uma mensagem indicando onde fica a central de
 * ajuda"*. "O computador" e a leitura literal e a certa: a marca vive no
 * navegador daquela maquina, e nao no perfil da pessoa no servidor.
 *
 * POR QUE NAO NO SERVIDOR: guardar isto no perfil custaria uma coluna, uma rota
 * e uma escrita — para uma dica de interface. E ficaria PIOR: quem entra de uma
 * maquina nova, onde o botao esta num canto que ela nunca viu, e exatamente quem
 * precisa da dica, e o perfil diria que ela ja foi vista.
 *
 * O `try` NAO E PARANOIA: navegador em janela anonima com armazenamento
 * bloqueado LANCA ao ler `localStorage`, e uma dica de ajuda derrubando a
 * aplicacao inteira seria o contrario do proposito. Falhou a leitura, o balao
 * aparece (o estado em memoria cuida de nao repetir dentro da sessao); falhou a
 * escrita, nao acontece nada.
 */
const CHAVE_AVISO = 'financeiro.ajuda.apresentada';

const avisoJaVisto = (): boolean => {
  try { return localStorage.getItem(CHAVE_AVISO) === '1'; } catch { return false; }
};

const marcarAvisoVisto = (): void => {
  try { localStorage.setItem(CHAVE_AVISO, '1'); } catch { /* sem armazenamento, sem marca */ }
};

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
  '/faturas': () => <TelaFaturas />,
  '/cobranca': () => <TelaCobranca />,
  '/documento': () => <TelaDocumento />,
  '/contas-a-receber': () => <TelaContasAReceber />,
  '/contas-a-pagar': () => <TelaContasAPagar />,
  '/historico': () => <TelaHistorico />,
  '/relatorios': () => <TelaRelatorios />,
  '/usuarios': () => <TelaUsuarios />,
};

export function App() {
  const s = useSessao();
  const caminho = useCaminho();
  const [ajudaAberta, setAjudaAberta] = useState(false);
  // Lido UMA vez, na montagem: reler a cada desenho faria o balao piscar de volta
  // entre o clique e a gravacao.
  const [avisoDaAjuda, setAvisoDaAjuda] = useState(() => !avisoJaVisto());

  /** Fechar no «x» e abrir a ajuda dao o mesmo resultado: o aviso ja cumpriu o
   *  que tinha para dizer, e insistir depois disso e o que transforma uma dica em
   *  incomodo. */
  const encerrarAviso = () => { setAvisoDaAjuda(false); marcarAvisoVisto(); };

  /* O ASSUNTO PEDIDO DE DENTRO DE UMA TELA (30/09/2026, etapa 4a): o link «Como
   * ler esta lista», da tela Mês, abre o painel já nesse assunto. É um evento
   * porque o estado do painel mora aqui — ver `abrirAjuda`. */
  const [topicoDaAjuda, setTopicoDaAjuda] = useState<string | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => {
      setTopicoDaAjuda((e as CustomEvent<{ topico: string | null }>).detail?.topico ?? null);
      setAjudaAberta(true);
      setAvisoDaAjuda(false); marcarAvisoVisto();
    };
    addEventListener(EVENTO_ABRIR_AJUDA, abrir);
    return () => removeEventListener(EVENTO_ABRIR_AJUDA, abrir);
  }, []);

  /*
   * O SETOR QUE O VÍNCULO NÃO VÊ (30/09/2026). O menu só desenha os setores do
   * vínculo, mas o endereço pode chegar de um favorito, de um link da ajuda ou
   * de antes de alguém desmarcar a caixa. O desvio troca o ENDEREÇO — o setor
   * ativo é derivado dele, e um segundo estado diria outra coisa. `replaceState`
   * e não `pushState`: o «voltar» não deve devolver a pessoa a um lugar que a
   * manda embora de novo.
   *
   * Só depois de a sessão chegar: sem ela, `setores` é desconhecido, e desviar
   * no escuro mandaria todo mundo para o Rateio a cada recarga.
   */
  const vinculoAtual = s.sessao?.tenants.find((t) => t.tenantId === s.tenantId);
  const destino = vinculoAtual ? destinoVisivel(caminho, vinculoAtual.setores) : null;
  useEffect(() => {
    if (destino) navegar(destino, true);
  }, [destino]);

  if (s.carregando) {
    return <><style>{ESTILO}</style><div className="conteudo"><Carregando /></div></>;
  }

  if (s.erro && !s.sessaoAuth) {
    return (
      <><style>{ESTILO}</style>
        <div className="conteudo">
          <h1>Financeiro G3</h1>
          {/* [30/09/2026, etapa 4b] A FRASE É PARA QUEM ABRIU A TELA; a mensagem
              crua e o nome da variável de ambiente são para quem cuida do
              servidor, e ficam atrás do «ver detalhe técnico». */}
          <Aviso tipo="erro">
            <strong>O sistema não conseguiu se preparar para o login.</strong> Recarregue a página
            em alguns minutos; se continuar assim, avise quem cuida do servidor e mostre o detalhe
            técnico abaixo.
            <DetalheTecnico>
              <p style={{ margin: '0 0 6px' }}>O que voltou: <code>{s.erro}</code></p>
              <p style={{ margin: 0 }}>
                Se a mensagem fala de <code>SUPABASE_ANON_KEY</code>, a variável não está no ambiente
                do servidor. O <code>.env.example</code> diz onde encontrá-la.
              </p>
            </DetalheTecnico>
          </Aviso>
        </div>
      </>
    );
  }

  if (!s.sessaoAuth) return <><style>{ESTILO}</style><Login /></>;

  // Caminho desconhecido (inclusive `/`) cai na primeira tela, que é Mês — a
  // tela que diz em que pé está o mês é o lugar certo para se perder.
  const tela = telaDoCaminho(caminho);
  const funil = funilDoCaminho(caminho);
  const vinculo = vinculoAtual;
  const visiveis = funisVisiveis(vinculo?.setores);
  const varios = Boolean(s.sessao && s.sessao.tenants.length > 1);

  /*
   * O PE DO MENU: a empresa e a conta. Ate 30/09/2026 os dois moravam no canto
   * direito da barra do topo; o menu lateral os levou para baixo, e o alto
   * ficou com o «onde» (marca e setor).
   *
   * O TENANT FICA VISIVEL O TEMPO TODO, e nao escondido num menu. Todo dado desta
   * tela e de UM tenant, e a RLS garante que so ele apareca - mas quem opera
   * precisa saber de qual empresa esta olhando o dinheiro sem ter que procurar.
   * Com um vinculo so, ele e a segunda linha do botao da conta; com mais de um,
   * vira um seletor logo acima dela, porque trocar de empresa e um ato frequente.
   * Recolhido, o menu mostra so o desenho da conta — o nome da empresa continua
   * no alto da lista dela.
   *
   * O GATILHO DA AJUDA NAO ESTA AQUI, e o motivo e o de 21/08 (`ajuda-gatilho.tsx`):
   * ele desceu para o canto inferior direito por pedido do dono, e o balao de
   * primeira visita aponta para la.
   */
  const pe = (recolhido: boolean) => (
    <>
      {varios && !recolhido && (
        <Escolha valor={s.tenantId ?? ''} ao={(v) => s.escolherTenant(v)}
                 rotuloAcessivel="Empresa" primeira="Escolha a empresa…"
                 opcoes={s.sessao!.tenants.map((t) => ({
                   valor: t.tenantId, texto: `${t.razaoSocial} (${t.papel})`,
                 }))} />
      )}
      <Menu acima soIcone={recolhido} className="lateral-conta" rotulo="Conta e aparência"
            gatilho={recolhido ? <Icone nome="usuario" tamanho={20} /> : (
              <>
                <Icone nome="usuario" tamanho={20} />
                <span className="lateral-conta-texto">
                  <strong>{s.sessao?.nome}</strong>
                  <span>{vinculo?.razaoSocial ?? '—'}</span>
                </span>
              </>
            )}>
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
    </>
  );

  return (
    <>
      <style>{ESTILO}</style>
      {/*
        Com mais de um vinculo e nenhuma empresa escolhida, o menu abre mesmo que
        a preferencia seja recolhido: o seletor de empresa mora nele, e a tela
        manda escolher ali.
      */}
      <MenuLateral funil={funil} visiveis={visiveis} tela={tela} pe={pe}
                   forcarAberto={varios && !s.tenantId}
                   ajuda={
                     /*
                       O BOTAO DA AJUDA e o balao que ensina que ele existe. Ele
                       NAO e `lazy`: precisa estar em toda tela desde o primeiro
                       desenho, porque quem trava nao sabe que vai travar. O que
                       chega sob demanda e o painel — a base de assuntos e o
                       glossario inteiro.

                       ONDE ELE APARECE e do CSS: no canto inferior direito no
                       computador (pedido do dono, 21/08), na faixa do topo no
                       celular (01/10, etapa 5). O DOM e um so, entre a faixa e
                       o conteudo — ver `ajuda` em `menu-lateral.tsx`.

                       O BALAO SO APARECE COM EMPRESA ESCOLHIDA. Sem ela a tela
                       ja mostra um aviso pedindo para escolher, e dois avisos ao
                       mesmo tempo fazem a pessoa ler o menos importante primeiro.
                     */
                     <GatilhoDeAjuda
                       aberta={ajudaAberta}
                       aoAbrir={() => { setTopicoDaAjuda(null); setAjudaAberta(true); encerrarAviso(); }}
                       aviso={avisoDaAjuda && Boolean(s.tenantId)}
                       aoFecharAviso={encerrarAviso}
                     />
                   }>
        {destino ? (
          <Carregando texto="Abrindo o seu setor…" />
        ) : !s.tenantId ? (
          /* [01/10/2026, etapa 7b] ÂMBAR, E NÃO O VERMELHO DA FALHA: nada deu
             errado — falta uma escolha, e ela é da pessoa. */
          <Aviso tipo="alerta">
            Escolha a empresa no pé do menu, logo acima do seu nome. Nenhuma tela abre antes disso: com
            mais de um vínculo, o sistema não escolhe por você.
          </Aviso>
        ) : (
          <Suspense fallback={<Carregando texto="Abrindo a tela…" />}>
            {RENDER[tela.rota]!()}
          </Suspense>
        )}
      </MenuLateral>

      {/* Sem `fallback` visivel: o painel chega em milissegundos e um spinner
          piscando por cima da pagina seria mais ruido do que espera. */}
      {ajudaAberta && (
        <Suspense fallback={null}>
          <PainelDeAjuda rota={tela.rota} topico={topicoDaAjuda} aoFechar={() => setAjudaAberta(false)} />
        </Suspense>
      )}
    </>
  );
}
