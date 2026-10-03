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
//   a AFIRMAÇÃO             no rodapé da mesma tela. Aparece SEMPRE, inclusive com
//                           tudo em dia, porque a coisa que se quer poder perceber
//                           é uma AUSÊNCIA — e ausência não tem como gritar. Desde
//                           03/10/2026 ela mora no PAINEL DE SAÚDE
//                           (`painel-de-saude-corpo.tsx`), com as outras peças.
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

import { Aviso, DetalheTecnico } from './ui.tsx';
import { faixasDasAutomacoes, type RodadaNaTela } from './automacoes.ts';

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

/* A AFIRMAÇÃO (`PainelDasAutomacoes`) SAIU DAQUI EM 03/10/2026 e virou parte do
 * PAINEL DE SAÚDE (`painel-de-saude.ts` + `painel-de-saude-corpo.tsx`): as três
 * rodadas continuam lá, uma linha cada, SEMPRE — com o certificado, o aviso de
 * pagamento, os pagamentos avisados que não entraram, o backup e o caixa. O
 * argumento acima vale inteiro para o painel; as `R13*` agora o montam. */
