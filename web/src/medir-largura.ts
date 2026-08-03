// A LARGURA DE UM ELEMENTO, MEDIDA DE VERDADE. Puro o suficiente para viver
// fora do `.tsx` - o que ele toca e `ResizeObserver`, e o hook e de tres linhas.
//
// POR QUE ELE EXISTE, e o motivo e um defeito que so a FOTOGRAFIA pegou.
//
// A primeira versao media dentro de um `useEffect` com `[dados]` na lista de
// dependencias, assim:
//
//   useEffect(() => { setLargura(ref.current?.clientWidth ?? 0); }, [dados]);
//
// E ela nunca media. A sequencia: os dados chegam -> o componente ainda faz
// `return` cedo porque o ESTADO derivado deles so e preenchido no efeito
// seguinte -> o efeito de medir roda com `ref.current === null` -> largura 0.
// Quando o estado chega e o palco finalmente e montado, o efeito NAO roda de
// novo, porque `dados` nao mudou.
//
// O SINTOMA NAO ERA UM ERRO. `escalaDaPrevia(0, ...)` devolve 1 de proposito -
// para o primeiro quadro nao renderizar a folha com `scale(0)` -, entao a folha
// saia em tamanho natural (794 px de A4) dentro de uma coluna de 490 e era
// CORTADA pelo `overflow: hidden`. Sem erro, sem log, e com o resto da tela
// perfeito. Achado ao fotografar a tela, nao ao ler o codigo.
//
// `ResizeObserver` nao tem esse modo de falha: ele dispara quando o elemento
// GANHA tamanho, e nao quando alguem adivinha que ele ja tem.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useLargura<T extends HTMLElement>(): [(n: T | null) => void, number] {
  const [largura, setLargura] = useState(0);
  const observador = useRef<ResizeObserver | null>(null);

  const referencia = useCallback((no: T | null) => {
    observador.current?.disconnect();
    if (!no) return;
    setLargura(no.clientWidth);
    observador.current = new ResizeObserver(([e]) => {
      // `contentRect` e o que o observador mede; `clientWidth` seria uma segunda
      // leitura, num instante diferente, e as duas divergem durante animacao.
      if (e) setLargura(e.contentRect.width);
    });
    observador.current.observe(no);
  }, []);

  useEffect(() => () => observador.current?.disconnect(), []);
  return [referencia, largura];
}
