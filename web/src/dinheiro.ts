// DINHEIRO NO FRONT. A regra 1 do CLAUDE.md nao para na borda do servidor:
// "Int em centavos em TODA camada: banco, API, UI, teste, fixture".
//
// E aqui ela e mais facil de furar do que em qualquer outro lugar, porque o
// caminho obvio - `Number(campo.value) * 100` - parece certo e nao e:
//
//     Number('1234,56'.replace(',', '.')) * 100   ->  123455.99999999999
//     Math.round(...)                             ->  123456   (acertou)
//     Number('8,15') * 100                        ->  814.9999999999999
//     Math.round(...)                             ->  815      (acertou)
//
// De novo o "acertou por sorte" que a medicao de 28/07 encontrou no servidor: o
// arredondamento salva quase sempre, e "quase sempre" nao e criterio para o
// valor que vai numa cobranca. Aqui a conversao e feita por TEXTO - separa
// inteiro de decimal na virgula e concatena -, entao nao ha multiplicacao por
// 100 e nao ha float em ponto nenhum do caminho.

/** Dinheiro. Sempre inteiro, sempre em centavos. */
export type Centavos = number;

export class ValorInvalido extends Error {
  constructor(bruto: string) {
    super(`"${bruto}" nao e um valor em reais. Use 1234,56 ou 1234.56.`);
    this.name = 'ValorInvalido';
  }
}

/**
 * "1.234,56" -> 123456. Sem passar por float em momento nenhum.
 *
 * Aceita ponto ou virgula como separador decimal, e ignora o separador de
 * milhar. Uma casa decimal vira duas ("12,5" -> 1250), porque quem digita 12,5
 * quer doze reais e cinquenta - nao doze reais e cinco centavos.
 */
export function paraCentavos(bruto: string): Centavos {
  const limpo = bruto.trim().replace(/\s/g, '');
  if (!limpo) throw new ValorInvalido(bruto);

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  // O ULTIMO ponto ou virgula e o separador decimal; os demais sao de milhar.
  // "1.234,56", "1,234.56" e "1234,56" caem todos no mesmo lugar.
  const ultimo = Math.max(semSinal.lastIndexOf(','), semSinal.lastIndexOf('.'));
  const inteiraBruta = ultimo === -1 ? semSinal : semSinal.slice(0, ultimo);
  const decimalBruta = ultimo === -1 ? '' : semSinal.slice(ultimo + 1);

  const inteira = inteiraBruta.replace(/[.,]/g, '');
  // Tres ou mais digitos depois do separador significa que ele era de milhar:
  // "1.234" e mil duzentos e trinta e quatro, nao um real e 234 centavos.
  const ehMilhar = decimalBruta.length === 3 && ultimo !== -1 && !/[.,]/.test(inteiraBruta);
  const decimal = ehMilhar ? '' : decimalBruta;
  const inteiraFinal = ehMilhar ? inteira + decimalBruta : inteira;

  if (!/^\d*$/.test(inteiraFinal) || !/^\d*$/.test(decimal)) throw new ValorInvalido(bruto);
  if (inteiraFinal === '' && decimal === '') throw new ValorInvalido(bruto);
  if (decimal.length > 2) throw new ValorInvalido(bruto);

  const centavos = Number(`${inteiraFinal || '0'}${decimal.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(centavos)) throw new ValorInvalido(bruto);
  return negativo ? -centavos : centavos;
}

/** 123456 -> "R$ 1.234,56". So para exibir. Nunca volta para calculo. */
export function emReais(c: Centavos | null | undefined): string {
  if (c == null) return '—';
  const negativo = c < 0;
  const a = Math.abs(c);
  const inteiro = Math.trunc(a / 100).toLocaleString('pt-BR');
  return `${negativo ? '-' : ''}R$ ${inteiro},${String(a % 100).padStart(2, '0')}`;
}

/**
 * Grandeza decimal - percentual, kWh, tarifa - normalizada como STRING.
 *
 * A regra 1 manda mante-las em escala decimal e NUNCA converte-las para
 * centavos: sao grandeza fisica e proporcao, nao dinheiro. E os repositorios
 * recusam `number` de proposito, porque numeric do Postgres chega como string e
 * converter na entrada reintroduz o float que a regra proibe. Entao o front
 * tambem manda string, e a virgula do teclado brasileiro vira ponto aqui.
 */
export function decimalTexto(bruto: string, casas: number): string {
  const s = bruto.trim().replace(',', '.');
  if (!new RegExp(`^\\d{1,9}(\\.\\d{1,${casas}})?$`).test(s)) {
    throw new Error(`"${bruto}" deve ser decimal com ate ${casas} casas.`);
  }
  return s;
}

/** Data ISO (AAAA-MM-DD) a partir do <input type="date">, ou null. */
export const dataOuNull = (v: string): string | null => (v.trim() ? v.trim() : null);

/** "2026-07" -> "2026-07-01". A competencia e o MES, e o primeiro dia o
 *  representa - o servidor recusa qualquer outro dia. */
export const competenciaISO = (mes: string): string => (/^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : mes);
