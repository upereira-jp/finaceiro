// Roteador por CAMINHO, não por hash — `/clientes` em vez de `#clientes`.
//
// A troca é de 29/07/2026, a pedido do dono: URL com hash parece endereço de
// âncora, não de tela, e quem cola um link no WhatsApp quer que ele se pareça
// com um endereço. O custo que o hash evitava já estava pago: o `servirEstatico`
// do servidor cai no index.html para todo caminho sem extensão, de propósito e
// com comentário dizendo que `/contratos` é uma tela, não um arquivo.
//
// CONTINUA SENDO 30 LINHAS E NÃO UMA DEPENDÊNCIA. São nove telas de primeiro
// nível, sem rota aninhada e sem carregamento sob demanda.

import { useEffect, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';

// pushState não dispara popstate — o evento próprio avisa os hooks da mesma aba.
const EVENTO = 'financeiro:navegou';

export function navegar(caminho: string): void {
  history.pushState(null, '', caminho);
  dispatchEvent(new Event(EVENTO));
}

export function useCaminho(): string {
  const [c, setC] = useState(() => location.pathname);
  useEffect(() => {
    const ao = () => setC(location.pathname);
    addEventListener('popstate', ao);
    addEventListener(EVENTO, ao);
    return () => { removeEventListener('popstate', ao); removeEventListener(EVENTO, ao); };
  }, []);
  return c;
}

/** Âncora que navega sem recarregar — e continua âncora: botão do meio,
 *  ctrl+clique e "copiar endereço" funcionam porque o href é real. */
export function Ligacao(p: {
  para: string; className?: string; style?: CSSProperties; children: ReactNode;
  rotulo?: string;
}) {
  return (
    <a href={p.para} className={p.className} style={p.style} aria-label={p.rotulo}
       onClick={(e) => {
         if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
         e.preventDefault();
         navegar(p.para);
       }}>
      {p.children}
    </a>
  );
}
