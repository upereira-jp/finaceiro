// Carregamento e acao, com o estado de erro EXPLICITO.
//
// Nao ha biblioteca de dados aqui pelo mesmo motivo que nao ha biblioteca de UI:
// sao nove telas de formulario e tabela. O que estes dois hooks garantem e a
// unica coisa que importava - que nenhuma tela engula erro.
//
// A ARMADILHA QUE ELES FECHAM: um `catch` vazio, ou um `.catch(console.error)`,
// deixa a tela mostrando lista vazia quando a chamada falhou. Vazio e um estado
// legitimo do sistema (nao ha contratos, de fato), entao uma falha silenciosa
// vira "nao ha nada" - indistinguivel do certo. E o mesmo modo de falha que a
// regra 3 persegue nas policies, dentro do front.

import { useCallback, useEffect, useState } from 'react';
import { ErroDaApi } from './api.ts';

export type Carga<T> = {
  dado: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
};

export function useDados<T>(buscar: () => Promise<T>, deps: unknown[] = []): Carga<T> {
  const [dado, setDado] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    buscar()
      .then((d) => { if (vivo) setDado(d); })
      .catch((e: unknown) => {
        // O dado ANTERIOR e descartado junto: manter a lista velha na tela ao
        // lado de uma mensagem de erro faria parecer que ela esta atual.
        if (vivo) { setDado(null); setErro(e instanceof Error ? e.message : String(e)); }
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  return { dado, carregando, erro, recarregar: useCallback(() => setVersao((v) => v + 1), []) };
}

/**
 * Teto de chamadas simultaneas de uma tela que varre uma lista.
 *
 * NAO e numero escolhido por gosto: cada requisicao de dado de negocio prende
 * uma conexao do pool TRANSACIONAL pelo bloco inteiro da transacao, e esse pool
 * tem `max` 8 (`src/db/pools.ts`, `POOL_TRANSACIONAL`). Disparar as 39 UCs de
 * uma vez poe 39 transacoes contra 8 slots, com `maxWait` de 5.000 ms - e o que
 * estoura ali sai como P2028, nao como fila. Seis deixa folga para o resto da
 * tela e para a outra pessoa que estiver digitando ao mesmo tempo.
 *
 * O TETO PRECISA SER NOSSO, e isso foi MEDIDO em 29/07. Sobre HTTP/1.1 o proprio
 * browser ja limita a 6 conexoes por origem - e foi por isso que o mock local
 * mostrou pico 6 com e sem este arquivo, escondendo o problema. Producao
 * responde em `h2` (conferido por ALPN em `financeiro.blackhaus.io`), onde os
 * 39 pedidos viajam multiplexados numa conexao so e o limite do browser nao
 * existe. O ambiente que reproduziria a falha e justamente o de producao.
 *
 * Se `POOL_TRANSACIONAL` mudar no servidor, este numero muda junto.
 */
const SIMULTANEAS = 6;

/** Aplica `f` a cada item com no maximo `SIMULTANEAS` em voo. Preserva a ordem. */
export async function emLotes<T, R>(itens: readonly T[], f: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await f(itens[i]);
    }
  };
  // Um `reject` derruba o `Promise.all` inteiro, que e o que se quer: a tela
  // precisa do mapa COMPLETO ou de um erro - nunca de um mapa com buracos.
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, itens.length) }, trabalhador));
  return saida;
}

export type Acao = {
  executar: (f: () => Promise<unknown>) => Promise<boolean>;
  ocupado: boolean;
  erro: string | null;
  sucesso: string | null;
  anunciar: (m: string) => void;
  limpar: () => void;
};

export function useAcao(): Acao {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const executar = useCallback(async (f: () => Promise<unknown>) => {
    setOcupado(true); setErro(null); setSucesso(null);
    try {
      await f();
      return true;
    } catch (e: unknown) {
      // A MENSAGEM DO SERVIDOR VAI INTEIRA PARA A TELA. As mensagens de erro de
      // negocio deste projeto foram escritas para quem opera - "R11: o rateio da
      // usina 0002 passaria a somar 110%, acima do teto de 100" -, e troca-las
      // por "erro ao salvar" jogaria fora o trabalho que o servidor fez.
      setErro(e instanceof ErroDaApi ? e.message : e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  return {
    executar, ocupado, erro, sucesso,
    anunciar: useCallback((m: string) => setSucesso(m), []),
    limpar: useCallback(() => { setErro(null); setSucesso(null); }, []),
  };
}
