// A CENTRAL DE AJUDA, ligada aos dados. O DESENHO mora em `ajuda-corpo.tsx`.
//
// ============================================================================
// POR QUE É UM PAINEL E NÃO UMA TELA
//
// Uma aba «Ajuda» na barra custaria o lugar em que a pessoa está: quem trava no
// meio do cadastro de uma unidade teria de sair da unidade para ler como
// preencher, e voltar sem o filtro que tinha. O painel abre POR CIMA, sabe em
// que tela foi aberto e devolve a pessoa ao trabalho com um clique.
//
// É também o motivo de ele não entrar na barra de navegação: aquela lista tem
// ordem própria — a ordem em que o trabalho destrava o próximo passo — e a ajuda
// não é uma etapa do trabalho. Ela mora ao lado do menu da conta, disponível de
// toda tela.
//
// ============================================================================
// O QUE SOBROU AQUI, e por que é tão pouco
//
// Este arquivo faz TRÊS coisas e nenhuma delas é desenho: busca a prontidão do
// mês corrente, traduz o resultado em passos e navega. Tudo o que se vê está no
// `ajuda-corpo.tsx`, que não tem efeito nenhum e por isso pode ser renderizado
// num teste (`web/tests/render.ts`) sem rede, sem relógio e sem banco.
//
// A CHAMADA É A MESMA DA TELA DE PENDÊNCIAS, de propósito. O painel não tem
// relatório próprio: dois caminhos de leitura para o mesmo número poderiam
// discordar, e nenhum dos dois pareceria errado.

import { useMemo } from 'react';
import { api, type Prontidao } from './api.ts';
import { useDados } from './dados.ts';
import { navegar } from './rota.tsx';
import { competenciaISO } from './dinheiro.ts';
import { passosDoEstado } from './ajuda.ts';
import { CorpoDaAjuda } from './ajuda-corpo.tsx';

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function PainelDeAjuda({ rota, aoFechar }: { rota: string; aoFechar: () => void }) {
  const { dado, carregando, erro } = useDados<Prontidao>(
    () => api.get(`/faturamento/${competenciaISO(mesAtual())}/prontidao`), []);

  const passos = useMemo(() => (dado ? passosDoEstado(dado.camadas) : []), [dado]);

  return (
    <CorpoDaAjuda
      rota={rota}
      passos={passos}
      carregando={carregando}
      /* `!carregando` NA FRENTE, e não só `erro || !dado`: durante a carga o
       * dado é nulo por definição, e sem esta guarda o painel nasceria
       * anunciando uma falha que ainda não houve. O `!dado` fica porque
       * `useDados` descarta o dado anterior ao falhar — «sem dado e parado» é o
       * mesmo estado, para quem lê a tela, que «deu erro». */
      falhou={!carregando && (Boolean(erro) || !dado)}
      aoFechar={aoFechar}
      /* Ir para uma tela FECHA o painel: deixá-lo aberto por cima do destino
       * faria a pessoa ler a instrução tapando o campo que ela manda preencher. */
      ir={(destino) => { navegar(destino); aoFechar(); }}
    />
  );
}
