// O GATILHO DA CENTRAL DE AJUDA — o item que a abre, o atalho do teclado, e o
// balão que ensina que ele existe.
//
// ============================================================================
// [01/10/2026, etapa 7c] O BOTÃO SAIU DO CANTO E FOI PARA O PÉ DO MENU
//
// Decisão do dono em 01/10, e é ele mesmo revendo o pedido de 21/08 (abaixo).
// O quadrado laranja fixo no canto de baixo à direita tinha três defeitos que o
// menu lateral tornou visíveis, e a crítica de 01/10 mediu os três:
//
//   1. ERA O SEGUNDO LARANJA DA TELA. O primário da casa é o laranja, e a regra
//      é UM por contexto (DESIGN.md, «One Orange»): o botão do ato da página e
//      o da ajuda disputavam o olho em toda tela que tinha um ato;
//   2. COBRIA O QUE ESTAVA EMBAIXO. Flutuando sobre a página, ele tapava a
//      última coluna — o «⋯» da linha, o «Emitir» — de toda tabela que
//      passasse por ele;
//   3. O CANTO DEIXOU DE SER «FORA DA NAVEGAÇÃO». O argumento de 21/08 era
//      que a barra do topo era uma fila de controles de sessão; com o menu
//      lateral, o pé dele É o lugar das coisas que não são etapa do trabalho:
//      recolher o menu, a conta, o tema. A ajuda entra ali, ao lado da conta,
//      com o nome escrito — um desenho sozinho num canto pede que a pessoa já
//      saiba o que ele é.
//
// O QUE FICOU DO DESENHO DE 21/08: ele continua FORA da lista de telas (ajuda
// não é etapa do trabalho), continua em toda tela, e o balão de primeira visita
// continua — agora apontando para o pé do menu. NÃO É LARANJA: é um item comum
// do menu, na tinta apagada da faixa, como «Recolher o menu».
//
// NO CELULAR há DOIS lugares, e não é o «dois gatilhos são ruído» de 21/08: com
// a gaveta fechada, o pé do menu não existe na tela — sem um segundo lugar, a
// ajuda ficaria a dois toques de quem travou. O segundo é um botão de desenho na
// faixa do topo, discreto, ao lado de «Menu»; com a gaveta aberta ele fica sob o
// véu, e o item do pé passa a ser o que se vê. Cada largura mostra UM — o
// outro está fora da vista e fora do Tab — e o balão aponta para o que existe.
//
// O ATALHO `?` (para quem opera de teclado o dia inteiro — a persona Alex da
// crítica): abre a central de qualquer tela, menos quando o foco está num campo
// de texto, onde `?` é uma letra. É anunciado na própria tela — a tecla
// desenhada no item e a dica do menu recolhido —, porque atalho sem aviso é
// atalho que ninguém descobre (a mesma razão por que o Ctrl+B do intreply ficou
// de fora do menu lateral).
//
// ============================================================================
// O HISTÓRICO: POR QUE O BOTÃO TINHA DESCIDO PARA O CANTO EM 21/08/2026
//
// Ele nasceu na barra do topo, ao lado do menu da conta, e o argumento continua
// válido: ajuda não é etapa do trabalho, então não entra na barra de navegação —
// aquela lista é a ORDEM em que o trabalho destrava o próximo passo.
//
// O que mudou é ONDE ele fica fora dessa lista. Pedido do dono: *«colocar o
// ícone no canto inferior direito»*. Três coisas o justificam além do gosto:
//
//   1. A BARRA DO TOPO É UMA FILA DE CONTROLES DE SESSÃO — empresa, conta, tema.
//      Um botão de ajuda no meio deles se lê como mais um item de configuração,
//      e não como socorro. No canto de baixo ele não disputa com nada;
//
//   2. O CANTO INFERIOR DIREITO É O LUGAR ONDE SE PROCURA AJUDA. Não é
//      convenção arbitrária: é onde quase todo sistema que a pessoa já usou põe
//      esse botão. Discoverability importa mais aqui do que em qualquer outro
//      controle, porque quem precisa dele está travado;
//
//   3. ELE PASSA A CABER NA TELA ESTREITA. A barra do topo já rolava na
//      horizontal com doze abas; o canto flutuante não compete por largura.
//
// O BOTÃO SAIU DE CIMA, e não ganhou um irmão. Dois gatilhos para o mesmo painel
// seriam ruído — e o balão abaixo aponta para UM lugar: com dois, ele mentiria
// para metade das pessoas.
//
// ============================================================================
// O BALÃO, e por que ele existe
//
// Um ícone sozinho num canto é mudo. Quem entra pela primeira vez não tem por
// que saber que aquele desenho responde perguntas — e este sistema recebe
// usuários novos SEM DIVISÃO DE SUPORTE: se a ajuda não se apresentar, ela não
// será encontrada por quem mais precisa dela.
//
// Pedido do dono, ao pé da letra: *«sempre que o computador fizer o login pela
// primeira vez no sistema, deve aparecer uma mensagem indicando onde fica a
// central de ajuda; o balão deve subir a partir do botão, nada que ocupe muito a
// tela, com um "x" bem pequeno no seu canto superior direito»*.
//
// As quatro decisões que isso virou:
//
//   UMA VEZ POR COMPUTADOR   quem guarda a marca é o `app.tsx`, no armazenamento
//                            do próprio navegador. Aqui não há efeito nenhum: o
//                            balão aparece porque alguém passou `aviso`;
//   NÃO É MODAL              não escurece a tela, não prende o foco e não impede
//                            clicar em nada atrás. Um aviso que interrompe o
//                            trabalho para dizer «existe ajuda» é o contrário de
//                            ajudar;
//   SOBE DO BOTÃO            a animação parte de baixo, na direção do balão, e as
//                            duas bolhas de pensamento fazem a ligação visual. É
//                            o que faz a frase «fica aqui» ter um AQUI;
//   MORRE AO SER USADO       fechar no «x» ou abrir a ajuda dão o mesmo
//                            resultado. Um aviso que sobrevive ao ato que ele
//                            pedia é um aviso que não estava lendo a pessoa.
//
// [01/10/2026, etapa 7c] O BALÃO SAI DO ITEM, e não mais sobe do canto: no
// computador ele abre ao lado do pé do menu, com as duas bolhas indo do item até
// ele; no celular ele desce do botão da faixa. A frase é a mesma, e a do
// computador ganha o atalho.
//
// ESTE ARQUIVO NÃO É `lazy`, e é o único pedaço da ajuda que não é: o painel
// inteiro (a base de assuntos, o glossário, a busca) continua chegando sob
// demanda. O que fica no pedaço de entrada é só o gatilho — que precisa existir
// em toda tela, porque quem trava não sabe que vai travar.

import { Icone } from './ui.tsx';

/** Onde o gatilho mora: o item do pé do menu lateral, ou o botão de desenho da
 *  faixa do topo do celular. */
export type LugarDaAjuda = 'menu' | 'faixa';

/** A tecla que abre a central — o texto do atalho, igual na dica e no item. */
export const TECLA_DA_AJUDA = '?';

export type GatilhoDeAjuda = {
  /** O painel está aberto. O botão continua no DOM — sumir com ele faria o foco
   *  do teclado cair no nada ao fechar —, mas fica sob o véu do painel. */
  aberta: boolean;
  aoAbrir: () => void;
  /** Mostrar o balão de primeira visita. Quem decide é o `app.tsx`: aqui não há
   *  relógio, armazenamento nem efeito — é o que deixa este arquivo montável num
   *  teste. */
  aviso: boolean;
  aoFecharAviso: () => void;
  lugar: LugarDaAjuda;
};

export function GatilhoDeAjuda(p: GatilhoDeAjuda) {
  const noMenu = p.lugar === 'menu';
  return (
    /* O `data-dica` é a dica do menu RECOLHIDO (`menu-lateral.tsx`), a mesma
       dos itens de tela: o nome e o atalho, no ponteiro e no foco. */
    <div className={`ajuda-lugar ajuda-no-${p.lugar}`} data-dica={noMenu ? `Ajuda · tecla ${TECLA_DA_AJUDA}` : undefined}>
      {noMenu ? (
        /* O ITEM DO PÉ: o nome escrito, o desenho da casa e a tecla do atalho à
           direita, no mesmo quadro fino do número do passo dos itens de tela.
           O nome acessível é o que está escrito, «Ajuda»; a tecla é
           `aria-hidden` e vai no `aria-keyshortcuts`, que é o lugar dela. */
        <button type="button" className="ajuda-gatilho lateral-ajuda" onClick={p.aoAbrir}
                aria-haspopup="dialog" aria-expanded={p.aberta} aria-keyshortcuts={TECLA_DA_AJUDA}>
          <Icone nome="ajuda" tamanho={18} />
          <span className="lateral-rotulo">Ajuda</span>
          <kbd className="lateral-tecla" aria-hidden="true">{TECLA_DA_AJUDA}</kbd>
        </button>
      ) : (
        /* O BOTÃO DA FAIXA: só o desenho, então o nome vai no `aria-label`.
           Discreto como o «Menu» ao lado — nenhum laranja na faixa. */
        <button type="button" className="ajuda-gatilho faixa-celular-ajuda" onClick={p.aoAbrir}
                title="Ajuda" aria-label="Abrir a central de ajuda"
                aria-haspopup="dialog" aria-expanded={p.aberta} aria-keyshortcuts={TECLA_DA_AJUDA}>
          <Icone nome="ajuda" tamanho={22} />
        </button>
      )}

      {p.aviso && !p.aberta && (
        <>
          {/*
            AS DUAS BOLHAS DO PENSAMENTO, entre o gatilho e o balão. São
            `aria-hidden` porque não dizem nada: quem ouve a tela recebe o texto
            do balão, e duas bolinhas anunciadas seriam ruído sem conteúdo.
          */}
          <span className="ajuda-bolha ajuda-bolha-1" aria-hidden="true" />
          <span className="ajuda-bolha ajuda-bolha-2" aria-hidden="true" />

          {/*
            `role="status"` e não `alert`: isto não é urgência, é apresentação.
            `alert` interrompe a leitura do que a pessoa estava ouvindo para
            avisar que existe um botão de ajuda — desproporcional.
          */}
          <aside className="ajuda-balao" role="status">
            <strong>A ajuda mora aqui.</strong>
            <p>
              Pergunte com suas palavras. Eu digo o que falta neste mês e abro a tela que resolve.
              {/* O atalho só onde há teclado de verdade: o celular não tem `?`
                  a um toque, e prometer a tecla ali seria ensinar o que não
                  serve. */}
              {noMenu && <> De qualquer tela, a tecla <kbd>{TECLA_DA_AJUDA}</kbd> também abre.</>}
            </p>
            {/*
              O «x» É BEM PEQUENO, por pedido — e mesmo pequeno leva nome
              acessível e área de clique de 24px. Um alvo minúsculo sem nome é um
              enfeite, não um botão de fechar.
            */}
            <button type="button" className="ajuda-balao-x" onClick={p.aoFecharAviso}
                    title="Fechar" aria-label="Fechar este aviso">
              <Icone nome="limpar" tamanho={11} peso="bold" />
            </button>
          </aside>
        </>
      )}
    </div>
  );
}

/**
 * A TECLA `?` ABRE A AJUDA? (01/10/2026, etapa 7c)
 *
 * Só o `?` sozinho — com Ctrl, Alt ou ⌘ ele é de outra coisa (do navegador, do
 * sistema) — e nunca quando o foco está onde `?` é uma LETRA: campo de texto,
 * área de texto, lista de escolha, texto editável. A busca da própria central é
 * um campo de texto, e é por isso que digitar «cadê o boleto?» nela não reabre
 * nada. Caixa de marcar e botão não recebem letra: ali a tecla vale.
 *
 * PURA e sem `instanceof HTMLElement`, para o teste montar o evento com um
 * objeto qualquer — o runner do teste não tem DOM.
 */
export function ehOAtalhoDaAjuda(e: {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  isComposing?: boolean; defaultPrevented?: boolean; target: EventTarget | null;
}): boolean {
  if (e.key !== TECLA_DA_AJUDA || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented) return false;
  const alvo = e.target as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!alvo) return true;
  if (alvo.isContentEditable) return false;
  const tag = (alvo.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (tag === 'INPUT') {
    const tipo = (alvo.type ?? 'text').toLowerCase();
    return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(tipo);
  }
  return true;
}

/* ==========================================================================
 * ABRIR A AJUDA DE DENTRO DE UMA TELA (30/09/2026, etapa 4a)
 * ==========================================================================
 *
 * O «Como ler esta tela» da tela Mês saiu da página e virou assunto da central;
 * na tela ficou um link. Quem o clica precisa do PAINEL aberto, e o estado do
 * painel mora no `app.tsx` — por isso é um evento, o mesmo gesto que `rota.tsx`
 * usa para navegar sem passar a navegação de mão em mão. `topico` abre aquele
 * assunto já expandido.
 */
export const EVENTO_ABRIR_AJUDA = 'financeiro:abrir-ajuda';

export function abrirAjuda(topico?: string): void {
  dispatchEvent(new CustomEvent(EVENTO_ABRIR_AJUDA, { detail: { topico: topico ?? null } }));
}
