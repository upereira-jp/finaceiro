// A FAIXA DO CAMINHO DO DINHEIRO, na parte que DESENHA — e ela recebe tudo por
// propriedade, de propósito.
//
// ============================================================================
// POR QUE ELA SAIU DE DENTRO DA TELA, e a razão foi medida em 09/09/2026
//
// A faixa nasceu dentro de `telas/prontidao.tsx`, num componente que chamava
// `useDados` duas vezes. As REGRAS estavam provadas — `saude-do-dinheiro.ts`
// tem as onze verificações de `SD-*`, com os 25 pares por exaustão. **O que não
// estava provado era que a tela mostra.**
//
// E a distância entre as duas coisas é exatamente onde este defeito mora. Um
// `&&` mal colocado, um `faixas.length === 0` invertido, um `map` que devolve
// `null`: nada disso quebra o `tsc`, nada disso reprova `SD-*`, e o sintoma é
// **faixa nenhuma** — que é, letra por letra, o mesmo sintoma de "está tudo de
// pé". Foi o que o dono observou ao abrir Pendências: *"nenhuma faixa aparece"*,
// e a observação era a esperada e não provava nada.
//
// É o modo de falha que este projeto persegue desde a regra 3, agora dentro do
// alarme: **um alerta que não aparece é indistinguível de não haver alerta.**
//
// COMO A SEPARAÇÃO CONSERTA: `renderToStaticMarkup` não roda efeito, então um
// componente que busca por `useEffect` renderiza sempre o estado vazio e o teste
// mede o nada. Recebendo os dois níveis por propriedade, qualquer estado é
// montável sem rede e sem tempo — e o `caso-render.tsx` monta os quatro.
//
// É O MESMO PAR de `ajuda.ts` + `ajuda-corpo.tsx`, e pelo mesmo motivo escrito
// lá: *"foi separado justamente para receber TUDO por propriedade"*.

import { Aviso } from './ui.tsx';
import { Ligacao } from './rota.tsx';
import { faixasDaSaude, type NivelDoAviso } from './saude-do-dinheiro.ts';
import type { EstadoDoCertificado } from './cobranca-regras.ts';

export type CorpoDaSaude = {
  certificado: EstadoDoCertificado;
  /** `null` = não perguntar. É o estado de quem não tem conector e o de quem
   *  ainda está carregando — os dois desenham nada, e é o certo nos dois. */
  aviso: NivelDoAviso | null;
};

/** Devolve `null` quando não há o que dizer, e **`null` é a resposta**: quem
 *  monta não precisa saber quais níveis merecem faixa. Mesma disciplina de
 *  `alertaDoAviso` no servidor. */
export function CorpoDaSaude({ certificado, aviso }: CorpoDaSaude) {
  const faixas = faixasDaSaude({ certificado, aviso });
  if (faixas.length === 0) return null;

  return (
    <>
      {faixas.map((f) => (
        <Aviso key={f.titulo} tipo={f.tom}>
          <strong>{f.titulo}</strong> {f.corpo}
          {f.destino && <> <Ligacao para={f.destino.endereco}>Abrir {f.destino.rotulo}</Ligacao></>}
        </Aviso>
      ))}
    </>
  );
}
