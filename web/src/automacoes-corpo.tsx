// O QUE O SISTEMA FAZ SOZINHO, na parte que DESENHA — e ela recebe tudo por
// propriedade, de propósito.
//
// ============================================================================
// POR QUE SÃO DOIS COMPONENTES E NÃO UM
//
// Eles respondem à mesma pergunta em dois momentos diferentes, e misturá-los
// obrigaria a escolher um dos dois erros:
//
//   `FaixasDasAutomacoes`   o ALARME, no alto de Pendências, junto das outras
//                           faixas do caminho do dinheiro. Só aparece quando há
//                           o que gritar — um alarme que fala todo dia é um
//                           alarme que se aprende a ignorar;
//   `PainelDasAutomacoes`   a AFIRMAÇÃO, no rodapé da mesma tela, ao lado do que
//                           o conector achou. Aparece SEMPRE, inclusive com tudo
//                           em dia, porque a coisa que se quer poder perceber é
//                           uma AUSÊNCIA — e ausência não tem como gritar.
//
// Se só existisse o alarme, o dia em que ele quebrasse seria idêntico ao dia em
// que está tudo bem. Foi exatamente esse o defeito que o dono observou em
// 09/09/2026 na faixa vizinha (*"nenhuma faixa aparece"*), e a resposta lá foi
// montar o componente num teste. Aqui a resposta é mais forte: o rodapé fala
// mesmo quando não há nada errado, então "não estou vendo nada" volta a ser uma
// observação que significa alguma coisa.
//
// COMO A SEPARAÇÃO SE PROVA: `renderToStaticMarkup` não roda efeito, então um
// componente que busca sozinho renderiza sempre o estado vazio e o teste mede o
// nada. Recebendo tudo por propriedade, qualquer estado é montável sem rede e
// sem tempo — e `caso-render.tsx` monta os seis níveis. É o mesmo par de
// `saude-do-dinheiro.ts` + `saude-corpo.tsx`, pelo mesmo motivo escrito lá.

import { Aviso, DetalheTecnico, Icone } from './ui.tsx';
import { faixasDasAutomacoes, linhasDasAutomacoes, type RodadaNaTela } from './automacoes.ts';

export type CorpoDasAutomacoes = {
  /** `null` enquanto a leitura não voltou, e ausência de resposta não é resposta:
   *  não desenha faixa nem afirmação. Uma faixa que pisca vermelho durante o
   *  carregamento é ruído. */
  rodadas: readonly RodadaNaTela[] | null;
  /** A leitura FALHOU, e isso é dito — no rodapé, nunca como alarme vermelho.
   *  «Não deu para perguntar» não é «parou de rodar», e é a mesma fronteira que
   *  separa `nao_verificavel` de `inativado` no aviso de pagamento. Calar seria
   *  pior que as duas: um rodapé vazio é exatamente a cara de um rodapé que diz
   *  que está tudo bem. */
  erro?: string | null;
};

/** Devolve `null` quando não há nada parado, e **`null` é a resposta**: quem
 *  monta não precisa saber quais níveis merecem faixa. */
export function FaixasDasAutomacoes({ rodadas }: CorpoDasAutomacoes) {
  const faixas = rodadas ? faixasDasAutomacoes(rodadas) : [];
  if (faixas.length === 0) return null;

  return (
    <>
      {faixas.map((f) => (
        <Aviso key={f.titulo} tipo={f.tom}>
          <strong>{f.titulo}</strong> {f.corpo}
          {/* O COMANDO MORA AQUI DENTRO E NÃO NA FRASE. Quem abre a tela não tem
              terminal, e mandar rodar comando como próximo passo é um beco
              (`T4`). Quem administra o servidor tem — e para essa pessoa o
              ponteiro vale a sessão inteira. */}
          <DetalheTecnico>
            <code>{f.comando}</code>
          </DetalheTecnico>
        </Aviso>
      ))}
    </>
  );
}

/**
 * A AFIRMAÇÃO, no rodapé — e ela desenha ATÉ quando está tudo bem.
 *
 * A ordem das linhas é a que o servidor mandou, e ela é de consequência: a
 * conferência de pagamentos primeiro, porque é a única porta automática de
 * baixa; o envio de boletos depois; a leitura do outro sistema por último,
 * porque cadastro velho atrasa cadastro, e não dinheiro.
 */
export function PainelDasAutomacoes({ rodadas, erro }: CorpoDasAutomacoes) {
  const linhas = rodadas ? linhasDasAutomacoes(rodadas) : [];
  if (erro) {
    return (
      <Aviso tipo="alerta">
        <strong>Não foi possível saber se as rodadas automáticas aconteceram.</strong>{' '}
        Isso não quer dizer que elas pararam — quer dizer que ninguém sabe. O motivo foi: {erro}
      </Aviso>
    );
  }
  if (linhas.length === 0) return null;

  return (
    <>
      <h2><Icone nome="calendario" tamanho={17} /> O que o sistema fez sozinho</h2>
      <p className="sub">
        Estas rodadas acontecem sem ninguém pedir, e quando uma para o aviso sobe para o alto
        desta tela. Elas aparecem aqui mesmo estando em dia porque parar é uma ausência: sem esta
        lista, «não estou vendo aviso nenhum» significaria as duas coisas ao mesmo tempo.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 16px', display: 'grid', gap: 8 }}>
        {linhas.map((l) => (
          <li key={l.chave} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            {/* O ícone é o SEGUNDO sinal, e não a informação: quem não distingue
                a cor lê a mesma frase inteira. Restrição 3 do tema. */}
            <Icone nome={l.saudavel ? 'ok' : 'pendente'} tamanho={15} peso="bold" />
            <span>
              <strong>{l.nome}</strong> {l.quando}
              {l.fez && <span className="fraco"> — {l.fez}</span>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
