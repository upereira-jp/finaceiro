// A DIVISÃO DO DINHEIRO DO CLIENTE, como número para a tela mostrar.
//
// ============================================================================
// A REGRA, dita pelo dono em 21/08/2026
//
// *"Além dos valores destinados à Equatorial, que são as tarifas mínimas, a
// divisão ocorre da seguinte maneira: 70% vai para o dono da usina e 30% fica na
// G3 para pagar as contas."*
//
// O sistema já fazia exatamente isso. O que ele NÃO fazia era **mostrar**: a tela
// pede um percentual e não diz que o resto é da G3, então quem digita 70 não vê a
// outra metade da frase que acabou de escrever.
//
// ============================================================================
// POR QUE SÓ UM NÚMERO É EDITÁVEL, e o outro é calculado
//
// Guardar os dois seria guardar a mesma informação duas vezes, e duas cópias
// divergem: bastaria alguém salvar 70 e 25 para o dinheiro deixar de fechar, sem
// erro em lugar nenhum. O que sobra depois de todos os destinos é **apurado por
// subtração** — é assim que a repartição garante que a soma feche no centavo, e
// é por isso que a parte da G3 não é um campo.
//
// Aqui ela é derivada para a pessoa VER, e nunca viaja para o servidor.
//
// ============================================================================
// E POR QUE 30% NÃO É O QUE A G3 RECEBE NAS DUAS PRIMEIRAS COBRANÇAS
//
// A comissão de quem trouxe o cliente sai da MESMA parte — a energia — e só
// existe na 1ª e na 2ª cobrança cheia de cada contrato. Nessas duas, a G3 fica
// com o que sobra depois dela: com 70% de repasse e 25% de comissão, sobram 5%.
//
// Isso é conhecido e é para ser assim: o custo de trazer o cliente é concentrado
// no começo, e o `PRD` §5.6 manda mostrá-lo "sem suavização". A tela diz, porque
// alguém que lê "30% fica na G3" e recebe 5% no primeiro mês vai achar que o
// sistema errou.
//
// Sem JSX: o runner do `web/` é `node --experimental-strip-types` e não lê `.tsx`.
// Regra 8 — invariante sem teste é comentário.

/** Quantas casas o percentual carrega, dos dois lados. É a escala da coluna. */
const CASAS = 2;

/**
 * `"70"` ou `"70,00"` -> `"30.00"`. `null` quando não dá para dizer.
 *
 * EXATO E SEM PONTO FLUTUANTE: `100 - 69.99` em `number` dá `30.009999999999998`,
 * e esse número apareceria na tela ao lado de um campo de dinheiro. A conta é
 * feita em centésimos inteiros e só volta a texto no fim.
 */
export function parteDaG3(percentualDoDono: string): string | null {
  const s = String(percentualDoDono ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;

  const [inteira, fracao = ''] = s.split('.');
  const centesimos = BigInt(inteira!) * 100n + BigInt((fracao + '00').slice(0, CASAS));
  if (centesimos > 10000n) return null;   // acima de 100% não há complemento

  const resto = 10000n - centesimos;
  return `${resto / 100n}.${String(resto % 100n).padStart(2, '0')}`;
}

/** `"30.00"` -> `"30,00"`. A tela mostra vírgula; o servidor recebe ponto. */
export const comVirgula = (v: string): string => v.replace('.', ',');

/**
 * A frase que a tela mostra ao lado do campo, ou `null` enquanto o número não
 * for legível — um aviso que pisca a cada tecla é pior que aviso nenhum.
 */
export function divisaoEmPalavras(percentualDoDono: string): string | null {
  const g3 = parteDaG3(percentualDoDono);
  if (g3 === null) return null;
  const dono = comVirgula(String(percentualDoDono).trim().replace(',', '.'));
  return `${dono}% para o dono da usina · ${comVirgula(g3)}% fica na G3`;
}

/**
 * A parte da G3 nas duas primeiras cobranças cheias de um contrato, quando há
 * comissão. `null` quando algum dos dois números não é legível.
 *
 * PODE SER NEGATIVA, e a tela precisa poder dizer isso: com 70% de repasse e 30%
 * de comissão não sobra nada, e um centavo de arredondamento faz o número cruzar
 * o zero. Recusar aqui esconderia o custo de aquisição que o `PRD` §5.6 manda
 * mostrar.
 */
export function parteDaG3ComComissao(
  percentualDoDono: string, percentualDaComissao: string,
): string | null {
  const g3 = parteDaG3(percentualDoDono);
  const semComissao = parteDaG3(percentualDaComissao);
  if (g3 === null || semComissao === null) return null;

  const paraCentesimos = (v: string) => {
    const [i, f = '00'] = v.split('.');
    return BigInt(i!) * 100n + BigInt(f.padEnd(2, '0'));
  };
  const resto = paraCentesimos(g3) - (10000n - paraCentesimos(semComissao));
  const neg = resto < 0n;
  const abs = neg ? -resto : resto;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
