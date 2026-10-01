// O QUE NÃO CHEGOU AO BANCO, na parte que DESENHA — e ela recebe tudo por
// propriedade, de propósito.
//
// ============================================================================
// [01/10/2026, etapa 7c] A LISTA VIROU UMA LINHA
//
// Até aqui o painel desenhava, embaixo da tabela de Cobranças, uma linha por
// cobrança sem boleto — com o estado, a resposta do banco e o «Pedir o boleto»
// ou o «Completar o endereço». Só que a tabela logo acima JÁ mostrava cada uma
// dessas cobranças do mês, com a segunda linha da situação, o «Boleto e baixa»
// e o mesmo botão: a tela dizia tudo duas vezes, e quem lia a de baixo achava
// que eram outras. Agora o detalhe do mês à vista fica na LINHA da tabela, que
// é onde se age; e aqui sobra o resumo de uma linha — quantas deste mês, quantas
// de outros meses, cada outro mês um link para Cobranças naquele mês, onde as
// linhas dele estão com as mesmas ações. A regra é `resumoDoBanco`, pura, em
// `emissao-travada.ts`. Os níveis (`fraseDaLinha`) continuam lá, com a suíte.
//
// ============================================================================
// ERAM DOIS COMPONENTES, E FICOU UM (30/09/2026, etapa 4a)
//
//   `PainelDaEmissao`   a LISTA, na tela Cobranças (desde 01/10, o RESUMO de
//                       uma linha — ver acima).
//
// O outro era `FaixaDaEmissao`, o ALARME que contava no alto de Pendências. Ele
// saiu da tela na etapa 3 e do código na 4a — ver a nota logo abaixo.
//
// ⚠️ A FAIXA SAIU DA TELA MÊS EM 30/09/2026 (etapa 3 do redesenho), e o que ela
// dizia mudou de lugar, não de dono. Ela ficava acima do roteiro do mês, em
// vermelho, mandando agir no passo 4 — enquanto o roteiro, logo abaixo, dizia
// «você está no 1 de 5». Duas respostas para «o que eu faço agora». Agora o
// PASSO 4 do funil conta as cobranças sem boleto (do mês e de outros meses) e
// ganha o destaque quando alguma pede gente — a mesma contagem, numa resposta
// só (`roteiro-do-mes.ts`, `RM2`/`RM10`). Na etapa 4a o componente e a regra que
// o alimentava (`faixaDaEmissaoTravada`) saíram também: nenhuma tela o montava,
// e código que ninguém monta é código que ninguém confere.
//
// COMO A SEPARAÇÃO SE PROVA: `renderToStaticMarkup` não roda efeito, então um
// componente que busca sozinho renderiza sempre o estado vazio e o teste mede o
// nada. Recebendo tudo por propriedade, qualquer estado é montável sem rede e
// sem tempo. É o mesmo par de `automacoes.ts` + `automacoes-corpo.tsx`.

import { Aviso, Icone } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { mesPorExtenso } from './formato.ts';
import { resumoDoBanco, fraseDoMesNoBanco, type EmissaoTravadaNaTela } from './emissao-travada.ts';

export type CorpoDaEmissao = {
  /** `null` enquanto a leitura não voltou, e ausência de resposta não é resposta:
   *  não desenha nada. Uma linha que pisca durante o carregamento é ruído. */
  dados: EmissaoTravadaNaTela | null;
  /** A leitura FALHOU, e isso é dito — nunca como alarme vermelho. «Não deu
   *  para perguntar» não é «está tudo em dia», e calar seria pior que as duas:
   *  uma linha vazia é exatamente a cara de uma linha que diz que não há nada
   *  pendente. */
  erro?: string | null;
  /** O mês que a tabela de cima mostra (`2026-09`). O que é dele está nas linhas
   *  da tabela; o resumo conta e aponta os OUTROS. */
  mes: string | null;
};

/**
 * O RESUMO DE UMA LINHA, e ele fala ATÉ quando está tudo certo.
 *
 * Os outros meses vêm do mais recente ao mais antigo, cada um com o link para
 * Cobranças naquele mês. «Pedir o boleto» e «Completar o endereço» não moram
 * aqui: estão na linha de cada cobrança, deste mês na tabela de cima e dos
 * outros meses na tabela do mês dela — um lugar só para cada ato.
 */
export function PainelDaEmissao({ dados, erro, mes }: CorpoDaEmissao) {
  if (erro) {
    return (
      <Aviso tipo="alerta">
        <strong>Não foi possível saber quais cobranças estão sem boleto no banco.</strong>{' '}
        Isso não quer dizer que estão todas certas — quer dizer que ninguém sabe. O motivo foi: {erro}
      </Aviso>
    );
  }
  if (!dados) return null;

  const r = resumoDoBanco(dados, mes);
  return (
    /* SEÇÃO COM NOME, sem título à vista: uma linha não pede cabeçalho, e o
       leitor de tela continua achando «O que ainda não chegou ao banco» na
       lista de regiões — o mesmo nome do bloco de antes. */
    <section className="cartao em-banco" id="em-banco" aria-label="O que ainda não chegou ao banco">
      <p className="em-banco-linha">
        <Icone nome="boleto" tamanho={16} />
        <span>
          {r.total === 0 ? (
            /* A AFIRMAÇÃO VEM MESMO VAZIA, e é a lição de 10/09/2026: «nenhuma
               linha» e «a leitura quebrou» têm a mesma cara quando a tela cala. */
            <>Todas as cobranças emitidas já têm boleto registrado no banco.</>
          ) : (
            <>
              <strong>{fraseDoMesNoBanco(r)}</strong>
              {r.doMes !== null && (r.deOutros === 0
                ? <span className="fraco"> · nenhuma de outros meses</span>
                : <>
                    {' · '}{r.deOutros} de outros meses:{' '}
                    {r.outros.map((o, i) => (
                      <span key={o.mes}>
                        {i > 0 && ', '}
                        <Ligacao para={`/faturas?mes=${o.mes}`}>
                          {o.quantos} em {mesPorExtenso(`${o.mes}-01`) || o.mes}
                        </Ligacao>
                      </span>
                    ))}
                  </>)}
              {r.truncou && <span className="fraco"> {r.truncou}</span>}
            </>
          )}
        </span>
      </p>
    </section>
  );
}
