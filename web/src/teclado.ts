// O TECLADO DE CADA CAMPO — o que o celular abre quando a pessoa toca nele.
//
// ============================================================================
// POR QUE ISTO EXISTE (01/10/2026, etapa 5 do redesenho)
//
// No celular o teclado e metade da tela, e o teclado errado e um campo que se
// preenche com o dobro de toques: o valor «789,00» digitado num teclado de
// letras pede trocar de painel duas vezes, e o CEP num teclado completo poe os
// algarismos numa fileira de 3mm de altura. O atributo que resolve e o
// `inputmode`, e ele nao muda nada no computador — e so o pedido do teclado.
//
// A REGRA SAI DO ROTULO, e nao de uma propriedade escrita em cada uma das 83
// chamadas de `Campo`. O rotulo ja diz o que o campo e («Valor (R$)», «CEP»,
// «Juros ao mês (%)»), e uma propriedade a mais em cada chamada seria a
// segunda copia dessa informacao — a que alguem esquece no campo novo. Quem
// precisar de outra coisa passa `teclado` e a inferencia nao entra.
//
// AS TRES DECISOES QUE NAO SAO OBVIAS:
//
//   CPF OU CNPJ NAO E TECLADO NUMERICO. O CNPJ alfanumerico existe desde
//   julho de 2026 (`src/dominio/documento.ts`): as doze primeiras posicoes
//   aceitam letra. O teclado numerico do iPhone nao tem letra nenhuma — um
//   cliente com CNPJ novo nao poderia ser cadastrado do celular. O campo fica
//   no teclado de texto, com maiuscula automatica (a Receita emite em
//   maiuscula) e sem corretor, que «corrigiria» o documento.
//
//   VALOR E PERCENTUAL SAO `decimal`, E NAO `numeric`: o `decimal` traz a
//   virgula no teclado do idioma do aparelho; o `numeric` nao traz separador.
//
//   O PREENCHIMENTO AUTOMATICO FICA DESLIGADO por padrao (`autocomplete=off`).
//   Todo campo deste sistema e dado de TERCEIRO — o endereco do cliente, o
//   e-mail do dono da usina, o CNPJ da empresa emissora. O navegador so sabe
//   oferecer os dados de quem esta operando, e oferecer o CEP da casa de quem
//   opera no endereco de cobranca do cliente e o erro que ninguem ve. O unico
//   formulario com dado proprio e o login, e ele nao usa `Campo`.

/** O que o `<input>` recebe. Os nomes sao os atributos do React. */
export type Teclado = {
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'none';
  autoComplete?: string;
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  spellCheck?: boolean;
};

const sem = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * O teclado de um campo, pelo rotulo e pelo tipo.
 *
 * A ORDEM DOS TESTES IMPORTA: «Valor de referência (R$)» tem «referência» e
 * tem «R$», e e o dinheiro que decide; «Chave Pix» pode ser um CPF, um e-mail
 * ou um telefone, e por isso nao ganha teclado especial nenhum.
 */
export function tecladoDoCampo(rotulo: string, tipo?: string): Teclado {
  const r = sem(rotulo);
  const base: Teclado = { autoComplete: 'off' };
  if (tipo === 'email' || /\be-?mail\b/.test(r)) {
    return { ...base, inputMode: 'email', autoCapitalize: 'none', spellCheck: false };
  }
  if (/chave pix/.test(r)) return { ...base, autoCapitalize: 'none', spellCheck: false };
  if (/\btelefone\b|\bcelular\b|\bwhatsapp\b/.test(r)) return { ...base, inputMode: 'tel' };
  if (/\bcep\b/.test(r)) return { ...base, inputMode: 'numeric' };
  // Documento: CPF sozinho e so algarismo; com CNPJ (alfanumerico) e texto.
  if (/\bcnpj\b|\bdocumento\b/.test(r)) {
    return { ...base, inputMode: 'text', autoCapitalize: 'characters', spellCheck: false };
  }
  if (/\bcpf\b/.test(r)) return { ...base, inputMode: 'numeric' };
  // Dinheiro, percentual e grandeza com casa decimal.
  if (/r\$|\(%\)|\bkwh\b|\bkwp\b|\bfator\b|\btarifa\b|\bpercentual\b|\bfatia\b|\bpotencia\b/.test(r)) {
    return { ...base, inputMode: 'decimal' };
  }
  // So algarismo: agencia, o numero da unidade consumidora, a leitura do
  // medidor e os dias faturados (a gaveta de Contas de luz).
  if (/\bagencia\b|\bunidade consumidora\b|\bleitura (anterior|atual)\b|\bdias faturados\b/.test(r)) {
    return { ...base, inputMode: 'numeric' };
  }
  if (/\buf\b/.test(r)) return { ...base, autoCapitalize: 'characters', spellCheck: false };
  return base;
}
