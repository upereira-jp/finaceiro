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
// AS LEITURAS SÃO AS MESMAS DA TELA MÊS, de propósito, e desde 30/09/2026 pelo
// MESMO gancho (`useLeiturasDoMes`). O painel não tem relatório próprio: dois
// caminhos de leitura para o mesmo número poderiam discordar, e nenhum dos dois
// pareceria errado. E a FRASE do estado do mês sai da mesma função que escreve a
// do alto da tela Mês — até ali a ajuda tinha a sua, e ela olhava só o cadastro.

import { useEffect, useMemo } from 'react';
import { navegar } from './rota.tsx';
import { passosDoEstado } from './ajuda.ts';
import { CorpoDaAjuda } from './ajuda-corpo.tsx';
import { useLeiturasDoMes, mesDeHoje } from './leitura-do-mes.ts';
import { mesNoFunil } from './roteiro-do-mes.ts';
import { mesPorExtenso } from './formato.ts';
import { useMesDoTrabalho } from './seletor-de-mes.tsx';

/*
 * [30/09/2026, etapa 4b] O MÊS NARRADO É O DA TELA. Até aqui era o mês de hoje
 * (`toISOString`, em UTC), enquanto a tela Mês abria no mês com trabalho — a
 * ajuda dizia «nada falta» de setembro com agosto inteiro por emitir à vista.
 *
 * [01/10/2026, etapa 8] E A FONTE É UMA SÓ: o MÊS DE TRABALHO da casca
 * (`seletor-de-mes.tsx`), o mesmo que Mês, Contas de luz e Cobranças mostram.
 * Até aqui as telas anunciavam o mês numa variável de módulo
 * (`anunciarMesEmTela`) e a ajuda aberta de outra tela refazia a procura por
 * conta própria — duas procuras podiam responder dois meses. Aberta no setor
 * Empresa, ela PEDE a procura à casca (`pedir`); para um vínculo sem o Rateio,
 * narra o mês corrente.
 */

export function PainelDeAjuda({ rota, topico, aoFechar }: {
  rota: string;
  /** O assunto que abre expandido — o link de dentro de uma tela (`abrirAjuda`). */
  topico?: string | null;
  aoFechar: () => void;
}) {
  const trabalho = useMesDoTrabalho();
  const mes = trabalho.ativo ? trabalho.mes : mesDeHoje();
  const leituras = useLeiturasDoMes(mes);
  const { dado, erro } = leituras.prontidao;
  /* Sem mês ainda, a procura está andando: é carga, e não falha. */
  const carregando = mes === null || leituras.prontidao.carregando;

  /* Fora do Rateio a casca não procura sozinha: a ajuda pede. */
  const { pedir } = trabalho;
  useEffect(() => { if (trabalho.ativo && trabalho.mes === null) pedir(); }, [trabalho.ativo, trabalho.mes, pedir]);

  const passos = useMemo(() => (dado ? passosDoEstado(dado.camadas) : []), [dado]);
  const funil = leituras.leitura ? mesNoFunil(leituras.leitura) : null;
  const estado = funil ? { estado: funil.estado, frase: funil.frase } : null;

  return (
    <CorpoDaAjuda
      rota={rota}
      topicoAberto={topico ?? null}
      passos={passos}
      mes={estado}
      nomeDoMes={mes ? mesPorExtenso(mes) : null}
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
