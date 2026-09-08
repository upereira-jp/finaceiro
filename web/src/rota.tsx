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
  const hashAntes = location.hash;
  history.pushState(null, '', caminho);
  dispatchEvent(new Event(EVENTO));

  /*
   * O FRAGMENTO TAMBEM AVISA, e ate 08/09/2026 ele nao avisava.
   *
   * `pushState` nao dispara `popstate` — por isso o evento proprio acima — e
   * tambem NAO dispara `hashchange`. Quem escuta o fragmento nunca soube que ele
   * mudou por navegacao interna.
   *
   * O CASO CONCRETO, e ele estava no caminho critico: a aba «3 · Cadastro da
   * fatura» esta oculta da barra por decisao do dono e so aparece com
   * `#cadastro` no endereco (`abas-da-fatura.ts`). Ela e o UNICO caminho de tela
   * para a razao social e o CNPJ de quem cobra — que estao VAZIOS em producao, e
   * cuja falta faz a folha sair sem dizer quem cobra e sem a linha antigolpe do
   * boleto. Os dois links que levavam ate ela passavam por aqui, entao **quem ja
   * estava em `/documento` clicava e nada acontecia**: mesma rota, mesmo
   * componente montado, e o `hashchange` que a tela escuta nunca chegava.
   *
   * So dispara quando o fragmento REALMENTE mudou: um evento a cada clique de
   * barra faria toda tela que escuta hash refazer trabalho a toa.
   */
  if (location.hash !== hashAntes) dispatchEvent(new HashChangeEvent('hashchange'));
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
 *  ctrl+clique e "copiar endereço" funcionam porque o href é real.
 *
 *  `atual` EMITE `aria-current="page"`, e ele entrou em 14/08 por um buraco
 *  medido: a tela ativa da barra era sinalizada por TRÊS coisas visuais — cor do
 *  texto, filete inferior e lastro de fundo — mais a troca de peso do ícone. As
 *  quatro dependem de ver. Para quem usa leitor de tela, as treze telas eram
 *  treze links idênticos, e "onde estou" não existia. É exatamente a restrição 3
 *  do `tema.ts` ("cor nunca é o único sinal") aplicada ao lugar onde ela ainda
 *  não tinha chegado. */
export function Ligacao(p: {
  para: string; className?: string; style?: CSSProperties; children: ReactNode;
  rotulo?: string; atual?: boolean;
}) {
  return (
    <a href={p.para} className={p.className} style={p.style} aria-label={p.rotulo}
       aria-current={p.atual ? 'page' : undefined}
       onClick={(e) => {
         if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
         e.preventDefault();
         navegar(p.para);
       }}>
      {p.children}
    </a>
  );
}
