// O GATILHO DA CENTRAL DE AJUDA — o botão que a abre, e o balão que ensina que
// ele existe.
//
// ============================================================================
// POR QUE O BOTÃO DESCEU PARA O CANTO INFERIOR DIREITO EM 21/08/2026
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
// ESTE ARQUIVO NÃO É `lazy`, e é o único pedaço da ajuda que não é: o painel
// inteiro (a base de assuntos, o glossário, a busca) continua chegando sob
// demanda. O que fica no pedaço de entrada é só o botão — que precisa existir em
// toda tela, porque quem trava não sabe que vai travar.

import { Icone } from './ui.tsx';

export type GatilhoDeAjuda = {
  /** O painel está aberto. O botão continua no DOM — sumir com ele faria o foco
   *  do teclado cair no nada ao fechar —, mas some sob o véu do painel. */
  aberta: boolean;
  aoAbrir: () => void;
  /** Mostrar o balão de primeira visita. Quem decide é o `app.tsx`: aqui não há
   *  relógio, armazenamento nem efeito — é o que deixa este arquivo montável num
   *  teste. */
  aviso: boolean;
  aoFecharAviso: () => void;
};

export function GatilhoDeAjuda(p: GatilhoDeAjuda) {
  return (
    <>
      {p.aviso && !p.aberta && (
        <>
          {/*
            AS DUAS BOLHAS DO PENSAMENTO, entre o botão e o balão. São
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
            <p>Pergunte com suas palavras. Eu digo o que falta neste mês e abro a tela que resolve.</p>
            {/*
              O «x» É BEM PEQUENO, por pedido — e mesmo pequeno leva nome
              acessível e área de clique de 20px. Um alvo minúsculo sem nome é um
              enfeite, não um botão de fechar.
            */}
            <button type="button" className="ajuda-balao-x" onClick={p.aoFecharAviso}
                    title="Fechar" aria-label="Fechar este aviso">
              <Icone nome="limpar" tamanho={11} peso="bold" />
            </button>
          </aside>
        </>
      )}

      {/*
        `primario` DE PROPÓSITO, e não um botão neutro redondo: o laranja da
        marca sobre o navy das telas é o par de maior contraste que o tema tem, e
        o botão herda de graça o brilho e a expansão do clique que o resto do
        sistema já usa. Um desenho próprio aqui seria um segundo idioma visual
        para o controle mais visível da tela.
      */}
      <button type="button" className="primario ajuda-gatilho" onClick={p.aoAbrir}
              title="Ajuda" aria-label="Abrir a central de ajuda"
              aria-haspopup="dialog" aria-expanded={p.aberta}>
        <Icone nome="ajuda" tamanho={23} peso="fill" />
      </button>
    </>
  );
}
