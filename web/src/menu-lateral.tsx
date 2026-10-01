// O MENU LATERAL — a casca da aplicação desde 30/09/2026 (etapa 3b do redesenho).
//
// ============================================================================
// O PEDIDO, e o que ele trocou
//
// Do dono, ao pé da letra: *«Ao invés dos tópicos ficarem dispostos na barra
// fixa superior, quero um menu lateral, similar ao de /opt/intreply. As telas
// devem permanecer as mesmas.»* E no mesmo dia: *«A ordem das telas deve
// refletir a ordem de cada etapa de trabalho.»*
//
// A barra de duas faixas (marca, setor e conta em cima; as abas embaixo) saiu
// inteira. Tudo o que ela tinha mudou de lugar e nada sumiu:
//
//   a marca e o filete de 3px     o alto do menu
//   o seletor de setor ⌃⌄          logo abaixo da marca, na largura do menu
//   as abas                        a lista do meio, em seções, na ordem do
//                                  trabalho (`secoesDoMenu`, `navegacao.ts`)
//   «Cadastros ▾»                  deixou de ser suspenso: é uma seção à vista
//   a empresa e a conta            o pé do menu
//
// As telas não mudaram: mesmas rotas, mesmos parâmetros (`?uc=`, `?mes=`,
// `#cadastro`), mesmo conteúdo. Só o recipiente que as envolve ganhou a altura
// que a barra comia e perdeu a largura que o menu ocupa.
//
// ============================================================================
// O QUE VEIO DO INTREPLY, e o que ficou lá
//
// Do `DashboardLayout.tsx` de lá veio o COMPORTAMENTO, reescrito aqui sem uma
// linha de Tailwind nem de shadcn:
//
//   seções com título que fecham   o estado fica no navegador, por seção
//   recolher para os desenhos      botão com nome e `title`; a escolha fica no
//                                  navegador, com `try` — como lá
//   rodapé com a conta             quem está logado e em qual empresa, e o
//                                  menu com tema e Sair
//   gaveta no celular              faixa fina com o botão; fecha no Esc, no
//                                  toque fora e ao navegar; o recolher não vale
//                                  dentro dela, e a preferência do desktop fica
//                                  guardada
//   nome da tela sem o texto       lá o `title` do item recolhido; aqui uma dica
//                                  própria, que aparece também no foco do
//                                  teclado (o `title` só aparece no ponteiro)
//
// E ficou lá, de propósito:
//
//   o realce que DESLIZA até o item ativo   é movimento de decoração numa tela
//       de trabalho; aqui o ativo é dito por superfície, tinta e desenho, e não
//       anda;
//   a largura que DESLIZA ao recolher       cada quadro refaria o layout de
//       tabelas de até 500 linhas; aqui o menu troca de largura num quadro só
//       (a nota está no `.lateral` de `estilo.ts`);
//   o seletor de EMPRESA no alto            lá o alto é o tenant; aqui o alto é
//       o SETOR, e a empresa mora no pé, junto de quem está logado — em cima o
//       «onde», embaixo o «quem»;
//   o atalho de teclado do `sidebar.tsx`    Ctrl+B não existe no layout de lá
//       (só no componente que ele não usa), e um atalho sem aviso na tela é um
//       atalho que ninguém descobre;
//   bolinhas de aviso, sinos, badges        não há o que avisar por ali: o que
//       trava o mês está na tela Mês, e a ajuda tem o item dela no pé.
//
// E UM COMPORTAMENTO QUE LÁ NÃO HÁ: na janela média (900 a 1279px) o menu nasce
// recolhido enquanto a pessoa não escolher — lá ele nasce sempre aberto. As
// tabelas daqui são mais largas que as de lá (`MENU_VIRA_TRILHO`, abaixo).
//
// ============================================================================
// A CENTRAL DE AJUDA MORA NO PÉ desde 01/10/2026 (etapa 7c), logo acima da
// conta, com o nome escrito e a tecla do atalho. Até ali ela era o quadrado
// laranja do canto inferior direito, pedido pelo dono em 21/08 — e foi o próprio
// dono que o tirou de lá, em 01/10: era o segundo laranja de toda tela e cobria
// a última coluna das tabelas. O porquê inteiro está em `ajuda-gatilho.tsx`. No
// celular, com a gaveta fechada, o pé não está na tela: a faixa do topo ganha um
// botão de desenho ao lado de «Menu», e cada largura mostra um só.
//
// ============================================================================
// ACESSIBILIDADE, que é o que um menu desenhado à mão costuma perder
//
//   `<nav aria-label>` com o nome do setor; cada item é âncora de verdade
//   (`Ligacao`), com `aria-current="page"` no aberto;
//   recolhido, o nome sai da VISTA e fica no DOM — é o nome acessível do link;
//   a seção é um botão com `aria-expanded`, e a lista dela leva o nome dele;
//   no celular a gaveta é `role="dialog"` + `aria-modal`, o foco entra nela, o
//   Tab dá a volta por dentro, o Esc fecha e o foco volta ao botão que abriu;
//   «Pular para o conteúdo» é a primeira parada do Tab.

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent,
  type ReactNode, type SyntheticEvent } from 'react';
import { Icone, Logotipo } from './icones.tsx';
import { focaveis } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { SeletorDeSetor } from './seletor-de-setor.tsx';
import { MENU_VIRA_GAVETA } from './estilo.ts';
import type { LugarDaAjuda } from './ajuda-gatilho.tsx';
import type { LugarDoMes } from './seletor-de-mes.tsx';
import {
  secoesDoMenu, telasDoFunil, rotuloDosPassos, fraseDosPassos,
  type Funil, type Tela, type SecaoDoMenu,
} from './navegacao.ts';

// ------------------------------------------------------------------ memória
//
// DUAS PREFERÊNCIAS DE APRESENTAÇÃO, e por isso no navegador e não no servidor
// — o mesmo argumento do tema. Ler e gravar vivem dentro de `try`: janela
// anônima com armazenamento bloqueado LANÇA ao ler, e um menu que derruba a
// aplicação por não poder lembrar se estava recolhido seria o contrário do
// propósito. Sem armazenamento, o menu abre expandido e com todas as seções.

const CHAVE_RECOLHIDO = 'financeiro.menu.recolhido';
const CHAVE_SECOES = 'financeiro.menu.secoes-fechadas';

/** A escolha da pessoa: recolhido, aberto, ou `null` — nunca escolheu, e aí
 *  quem decide é a largura da janela (`MENU_VIRA_TRILHO`). */
function lerRecolhido(): boolean | null {
  try {
    const v = localStorage.getItem(CHAVE_RECOLHIDO);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

function lerSecoesFechadas(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE_SECOES) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  } catch { return {}; }
}

function gravar(chave: string, valor: string): void {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento, sem memória */ }
}

/**
 * AS TRÊS LARGURAS DO MENU, e é o desenho de `adapt` para navegação: gaveta no
 * celular, trilho de desenhos na tela média, menu inteiro na larga.
 *
 *   abaixo de `MENU_VIRA_GAVETA` (900)   gaveta, aberta por um botão;
 *   de 900 a `MENU_VIRA_TRILHO` (1280)   RECOLHIDO por padrão — 248px de menu
 *                                        numa janela de 1024 deixavam 736px para
 *                                        tabelas desenhadas para 1120, e a tela de
 *                                        Contas a receber escondia 310px de colunas;
 *   de 1280 para cima                    aberto por padrão.
 *
 * «POR PADRÃO» É A PALAVRA QUE IMPORTA: a largura só decide enquanto a pessoa
 * não escolheu. Quem clicou em recolher ou expandir tem a escolha respeitada em
 * qualquer largura — e a tabela larga rola dentro da própria caixa, como já
 * rolava. 1280 e não 1366 porque 1280 é o notebook mais estreito em uso, e nele
 * o conteúdo aberto ainda tem os 1032px que cabem as telas de lista.
 */
const MENU_VIRA_TRILHO = 1280;

/** A janela está abaixo de uma largura — reage ao redimensionar. Sem
 *  `matchMedia` (o teste de render), é larga. */
function useAbaixoDe(largura: number): boolean {
  const consulta = `(max-width: ${largura - 0.02}px)`;
  const [estreita, setEstreita] = useState(() => typeof matchMedia === 'function' && matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(consulta);
    const ao = () => setEstreita(mq.matches);
    ao();
    mq.addEventListener('change', ao);
    return () => mq.removeEventListener('change', ao);
  }, [consulta]);
  return estreita;
}

/* O que recebe o foco dentro da gaveta mora em `ui.tsx` (`focaveis`) desde
 * 01/10/2026: a central de ajuda prende o foco do mesmo jeito. Só conta o que
 * está à vista — a linha de recolher existe no DOM e não no celular. */

// ------------------------------------------------------------------- o menu

export type PropsDoMenuLateral = {
  /** O setor aberto — derivado do caminho por quem chama (`funilDoCaminho`). */
  funil: Funil;
  /** Os setores que o vínculo vê, para o seletor. */
  visiveis: readonly Funil[];
  /** A tela aberta. */
  tela: Tela;
  /** O pé: empresa e conta. Recebe se o menu está recolhido, porque recolhido a
   *  conta vira só o desenho. Função e não nó: o menu não conhece sessão, e é o
   *  que o deixa montável no teste de render. */
  pe: (recolhido: boolean) => ReactNode;
  /** Abre o menu mesmo com a preferência de recolhido — para quando o que falta
   *  fazer mora nele (escolher a empresa, com mais de um vínculo). */
  forcarAberto?: boolean;
  /** Estado inicial sem armazenamento, para o teste de render. */
  recolhidoInicial?: boolean;
  /**
   * O GATILHO DA AJUDA (e o balão dele), desenhado para cada lugar. [01/10/2026,
   * etapa 7c] Dois lugares, um por largura: `'menu'` é o item do pé, logo acima
   * da conta — no computador e dentro da gaveta —, e `'faixa'` é o botão de
   * desenho da faixa do topo do celular, que existe só abaixo de
   * `MENU_VIRA_GAVETA`. Cada um some da vista e do Tab onde o outro aparece.
   * Função e não nó: o mesmo gatilho, com o balão, nos dois lugares — e o
   * menu continua sem conhecer a ajuda (é o que o deixa montável no teste).
   * (Até a etapa 7c era um nó só, entre a faixa e o conteúdo, flutuando no
   * canto de baixo.)
   */
  ajuda?: (lugar: LugarDaAjuda) => ReactNode;
  /**
   * O MÊS DE TRABALHO (01/10/2026, etapa 8), desenhado para cada lugar, como a
   * ajuda: `'menu'` logo abaixo do seletor de setor — no computador e dentro da
   * gaveta —, e `'faixa'` na faixa do topo do celular, antes da ajuda. Quem
   * chama só o passa no setor Rateio: no Empresa não há mês de trabalho. Função
   * e não nó pelo mesmo motivo da ajuda — o menu não conhece o mês.
   */
  mes?: (lugar: LugarDoMes) => ReactNode;
  children: ReactNode;
};

export function MenuLateral(p: PropsDoMenuLateral) {
  const idMenu = useId();
  const gaveta = useAbaixoDe(MENU_VIRA_GAVETA);
  const media = useAbaixoDe(MENU_VIRA_TRILHO);
  const [escolhido, setRecolhido] = useState<boolean | null>(() => p.recolhidoInicial ?? lerRecolhido());
  const recolhidoPreferido = escolhido ?? media;
  const [fechadas, setFechadas] = useState<Record<string, boolean>>(lerSecoesFechadas);
  const [aberta, setAberta] = useState(false);
  const [dica, setDica] = useState<{ texto: string; topo: number } | null>(null);
  const lateral = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);

  /** Recolhido DE FATO: a preferência vale no desktop, e a gaveta está sempre
   *  aberta por dentro. */
  const recolhido = recolhidoPreferido && !gaveta && !p.forcarAberto;
  const gavetaAberta = gaveta && aberta;

  /** Clicar é ESCOLHER: o contrário do que se vê agora vira a escolha gravada,
   *  e a largura da janela deixa de decidir. */
  const alternarRecolhido = () => {
    const novo = !recolhidoPreferido;
    gravar(CHAVE_RECOLHIDO, novo ? '1' : '0');
    setRecolhido(novo);
  };

  /** A chave da seção leva o SETOR: fechar «Apoio» na Empresa não fecha uma
   *  seção de mesmo nome que um dia exista em outro setor. */
  const alternarSecao = (chave: string) => {
    setFechadas((f) => {
      const nova = { ...f, [chave]: !f[chave] };
      gravar(CHAVE_SECOES, JSON.stringify(nova));
      return nova;
    });
  };

  const fecharGaveta = (devolverFoco: boolean) => {
    setAberta(false);
    if (devolverFoco) requestAnimationFrame(() => gatilho.current?.focus());
  };

  // A janela alargou com a gaveta aberta: não deixar o estado pendurado — nem a
  // página travada sem rolagem.
  useEffect(() => { if (!gaveta) setAberta(false); }, [gaveta]);
  // Navegar fecha a gaveta, inclusive pelo «voltar» do navegador.
  useEffect(() => { setAberta(false); }, [p.tela.rota]);
  // A dica é só do menu recolhido.
  useEffect(() => { if (!recolhido) setDica(null); }, [recolhido]);

  useEffect(() => {
    if (!gavetaAberta) return;
    /* O FOCO ENTRA NA GAVETA, no item da tela aberta: é de onde se parte, e ver
       o foco nele diz «você está aqui» antes de qualquer leitura. Sem item
       ativo (tela fora do menu, que hoje não existe), o botão de fechar. */
    const raf = requestAnimationFrame(() => {
      const raiz = lateral.current;
      (raiz?.querySelector<HTMLElement>('.lateral-item[aria-current="page"]')
        ?? raiz?.querySelector<HTMLElement>('.lateral-fechar'))?.focus();
    });
    /* O Esc FECHA — a não ser que uma lista aberta DENTRO da gaveta (setores,
       conta) esteja pedindo o mesmo Esc para fechar a si mesma: aí o primeiro
       Esc é dela, e o segundo, da gaveta. */
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lateral.current?.querySelector('.setor-painel, .menu-painel, .mes-painel')) return;
      fecharGaveta(true);
    };
    addEventListener('keydown', tecla);
    // A página de trás não rola enquanto a gaveta está por cima dela.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [gavetaAberta]);

  /** O Tab dá a volta dentro da gaveta aberta — é o `aria-modal` cumprido, e não
   *  só declarado. */
  const prenderFoco = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!gavetaAberta || e.key !== 'Tab' || !lateral.current) return;
    const lista = focaveis(lateral.current);
    if (lista.length === 0) return;
    const primeiro = lista[0]!;
    const ultimo = lista[lista.length - 1]!;
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  };

  /** Escolher um lugar DENTRO da gaveta fecha a gaveta — inclusive a tela que já
   *  está aberta, que não muda a rota e por isso não passaria pelo efeito acima.
   *  O foco volta ao botão «Menu», que é o que continua na tela. */
  const aoClicar = (e: MouseEvent<HTMLDivElement>) => {
    if (gavetaAberta && (e.target as Element).closest('a[href]')) fecharGaveta(true);
  };

  /** A dica do menu recolhido, no ponteiro e no foco. A altura é a do item na
   *  janela agora — e rolar a lista a apaga, em vez de deixá-la solta. */
  const mostrarDica = (e: SyntheticEvent) => {
    if (!recolhido) return;
    const alvo = (e.target as Element).closest?.<HTMLElement>('[data-dica]');
    if (!alvo) { setDica(null); return; }
    const r = alvo.getBoundingClientRect();
    setDica({ texto: alvo.dataset['dica'] ?? '', topo: r.top + r.height / 2 });
  };
  const esconderDica = () => setDica(null);

  /** Pular para o conteúdo SEM mexer no fragmento: `#conteudo` no endereço
   *  seria lido pelas telas que escutam `hashchange` (a de Contas de luz abre
   *  a aba pelo fragmento). */
  const pular = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('conteudo')?.focus();
  };

  const secoes = secoesDoMenu(telasDoFunil(p.funil.chave));
  const classe = ['casca', recolhido ? 'recolhida' : '', gavetaAberta ? 'gaveta-aberta' : ''].filter(Boolean).join(' ');

  return (
    <div className={classe}>
      <a className="pular" href="#conteudo" onClick={pular}>Pular para o conteúdo</a>

      <div id={idMenu} ref={lateral} className="lateral"
           role={gavetaAberta ? 'dialog' : undefined}
           aria-modal={gavetaAberta ? true : undefined}
           aria-label={gavetaAberta ? 'Menu' : undefined}
           onKeyDown={prenderFoco} onClick={aoClicar}>
        <div className="filete" aria-hidden="true" />

        <div className="lateral-cabeca">
          <span className="marca-app">
            <Logotipo tamanho={22} /><span className="lateral-rotulo">Financeiro G3</span>
          </span>
          <button type="button" className="lateral-fechar" aria-label="Fechar o menu" title="Fechar o menu"
                  onClick={() => fecharGaveta(true)}>
            <Icone nome="fechar" tamanho={20} />
          </button>
        </div>

        {/*
          O SELETOR DE SETOR, no alto: o setor ativo é derivado do caminho — não
          há estado próprio para ele desincronizar. Trocar de setor leva à
          PRIMEIRA tela do outro lado (`primeiraTelaDoFunil`).
        */}
        <div className="lateral-setor" onMouseOver={mostrarDica} onFocus={mostrarDica}
             onMouseLeave={esconderDica} onBlur={esconderDica}>
          <SeletorDeSetor atual={p.funil} visiveis={p.visiveis} rotaAtual={p.tela.rota} />
          {/* O MÊS DE TRABALHO, logo abaixo do setor (etapa 8): «Rateio», e
              embaixo «setembro de 2026» — o endereço de onde se está. O porquê
              do lugar está no cabeçalho de `seletor-de-mes.tsx`. */}
          {p.mes?.('menu')}
        </div>

        <nav className="lateral-nav" aria-label={p.funil.nome}
             onMouseOver={mostrarDica} onFocus={mostrarDica}
             onMouseLeave={esconderDica} onBlur={esconderDica} onScroll={esconderDica}>
          {secoes.map((secao) => {
            const chave = `${p.funil.chave}:${secao.grupo}`;
            return (
              <Secao key={chave} secao={secao} rotaAtual={p.tela.rota} recolhido={recolhido}
                     fechada={Boolean(secao.titulo) && Boolean(fechadas[chave])}
                     alternar={() => alternarSecao(chave)} />
            );
          })}
        </nav>

        <div className="lateral-recolher">
          <button type="button" onClick={alternarRecolhido} aria-expanded={!recolhido} aria-controls={idMenu}
                  aria-label={recolhido ? 'Expandir o menu' : 'Recolher o menu'}
                  title={recolhido ? 'Expandir o menu' : 'Recolher o menu — só os desenhos'}>
            <Icone nome={recolhido ? 'expandir_navegacao' : 'recolher_navegacao'} tamanho={18} />
            <span className="lateral-rotulo">Recolher o menu</span>
          </button>
        </div>

        {/* O PÉ: a ajuda e, logo abaixo, a conta. A dica do menu recolhido
            vale também aqui — a ajuda recolhida é só o desenho, como os itens. */}
        <div className="lateral-pe" onMouseOver={mostrarDica} onFocus={mostrarDica}
             onMouseLeave={esconderDica} onBlur={esconderDica}>
          {p.ajuda?.('menu')}
          {p.pe(recolhido)}
        </div>
      </div>

      {gavetaAberta && <div className="lateral-veu" aria-hidden="true" onClick={() => fecharGaveta(true)} />}

      {recolhido && dica && (
        <div className="lateral-dica" aria-hidden="true"
             style={{ '--dica-topo': `${dica.topo}px` } as CSSProperties}>
          {dica.texto}
        </div>
      )}

      <div className="casca-corpo">
        {/*
          A FAIXA DO CELULAR: o botão que abre a gaveta, a marca, o setor e a
          ajuda. É a única barra que sobrou, e só abaixo de `MENU_VIRA_GAVETA` —
          o CSS a esconde no desktop. O botão diz «Menu» por escrito, além do desenho: as
          três linhas sozinhas pedem que a pessoa já saiba o que elas são.
        */}
        <div className="faixa-celular">
          <div className="filete" aria-hidden="true" />
          <div className="faixa-celular-linha">
            <button ref={gatilho} type="button" className="faixa-celular-botao"
                    aria-controls={idMenu} aria-expanded={gavetaAberta} onClick={() => setAberta(true)}>
              <Icone nome="abrir_navegacao" tamanho={22} /> Menu
            </button>
            {/* O NOME DO SISTEMA sai da vista no telefone estreito (etapa 8): a
                faixa ganhou o mês, e o logotipo sozinho já diz de quem é a
                tela. O nome continua no DOM, para quem ouve. */}
            <span className="marca-app"><Logotipo tamanho={20} /><span className="faixa-marca-nome"> Financeiro G3</span></span>
            <span className="faixa-celular-setor">{p.funil.rotulo}</span>
            {/* O MÊS COM A GAVETA FECHADA: «set/26 ▾», que abre a mesma grade. */}
            {p.mes?.('faixa')}
            {/* A AJUDA COM A GAVETA FECHADA: um botão de desenho, discreto,
                no fim da faixa. Com a gaveta aberta ele fica sob o véu, e o
                item do pé, dentro dela, é o que se vê. */}
            {p.ajuda?.('faixa')}
          </div>
        </div>

        {/* A TELA DE LISTA ALARGA na janela grande (`Tela.larga`, etapa 7c). */}
        <main id="conteudo" className={p.tela.larga ? 'conteudo larga' : 'conteudo'} tabIndex={-1}>{p.children}</main>
      </div>
    </div>
  );
}

/**
 * UMA SEÇÃO. Com título, o título é o botão que a fecha, e a lista leva o nome
 * dele (`aria-labelledby`). A abertura (Mês, Usuários) vem sem título.
 *
 * SEÇÃO FECHADA NÃO ESCONDE A TELA ABERTA. Fechar «Cadastros» estando em
 * Unidades consumidoras deixaria o menu sem «você está aqui» — e o menu existe
 * para isso. A seção fechada mostra só o item aberto, e a seta diz que há mais.
 *
 * Recolhido, o título sai e as seções se separam por uma linha: todos os
 * desenhos aparecem, porque recolhido já é o menu fechado.
 */
function Secao({ secao, rotaAtual, recolhido, fechada, alternar }: {
  secao: SecaoDoMenu; rotaAtual: string; recolhido: boolean; fechada: boolean; alternar: () => void;
}) {
  const id = useId();
  const telas = fechada && !recolhido ? secao.telas.filter((t) => t.rota === rotaAtual) : secao.telas;
  return (
    <div className="lateral-secao">
      {secao.titulo && (
        <button type="button" className="lateral-secao-tit" id={`${id}-t`}
                aria-expanded={!fechada} aria-controls={`${id}-l`} onClick={alternar}>
          {secao.titulo}
          <Icone nome="abrir_menu" tamanho={12} peso="bold" className="lateral-secao-seta" />
        </button>
      )}
      <ul className="lateral-lista" id={`${id}-l`} aria-labelledby={secao.titulo ? `${id}-t` : undefined}>
        {telas.map((t) => <Item key={t.rota} tela={t} ativo={t.rota === rotaAtual} />)}
      </ul>
    </div>
  );
}

/**
 * UM ITEM: âncora de verdade (botão do meio e «copiar endereço» funcionam), com
 * o desenho, o nome e — nas telas que são passo do mês — o número do passo.
 *
 * O NOME ACESSÍVEL É O NOME DA TELA e, quando há, os passos por extenso («Contas
 * de luz, passos 1 e 2 do mês»). O «1–2» à vista é `aria-hidden`: o leitor de
 * tela ouviria «um traço dois».
 */
function Item({ tela, ativo }: { tela: Tela; ativo: boolean }) {
  const passos = rotuloDosPassos(tela.passos);
  const frase = fraseDosPassos(tela.passos);
  return (
    <li data-dica={frase ? `${tela.titulo} · ${frase}` : tela.titulo}>
      <Ligacao para={tela.rota} atual={ativo} className={`lateral-item${ativo ? ' ativo' : ''}`}>
        <Icone nome={tela.icone} tamanho={19} peso={ativo ? 'fill' : 'regular'} />
        <span className="lateral-rotulo">{tela.titulo}</span>
        {passos && (
          <>
            <span className="lateral-passos" aria-hidden="true" title={frase.charAt(0).toUpperCase() + frase.slice(1)}>
              {passos}
            </span>
            <span className="so-leitor">, {frase}</span>
          </>
        )}
      </Ligacao>
    </li>
  );
}
