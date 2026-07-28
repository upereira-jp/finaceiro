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
