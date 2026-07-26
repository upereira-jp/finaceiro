// SPEC-001 R7, R8, R9 - documento do cliente, do dono de usina e do originador.
//
// ATENCAO AO CALENDARIO: o CNPJ ALFANUMERICO comeca a ser emitido em
// 31/07/2026 (Receita Federal). As 12 primeiras posicoes passam a aceitar
// letras maiusculas A-Z junto com digitos; os 2 digitos verificadores seguem
// numericos. Os dois formatos COEXISTEM e ambos sao plenamente validos.
//
// Consequencia: validador que exija "somente digitos" REJEITA CNPJ VALIDO a
// partir daquela data. A R7 da SPEC-001 dizia exatamente isso, e foi corrigida.
//
// O DV continua modulo 11. A adaptacao e uma linha: o valor de cada caractere e
// (codigo ASCII - 48). Para digito isso da o proprio digito ('0'=0 ... '9'=9),
// e para letra da 17 a 42 ('A'=17 ... 'Z'=42). Logo o algoritmo alfanumerico
// REDUZ ao numerico quando todos os caracteres sao digitos - e ha teste disso,
// porque e a garantia de que nada quebrou para os CNPJs que ja existem.

export type TipoDocumento = 'cpf' | 'cnpj';
export type OrigemDocumento = 'crm_semente' | 'coleta_local';

/**
 * Remove mascara e normaliza. NAO remove letras: isso seria destruir CNPJ
 * alfanumerico. Maiusculiza porque a Receita emite em maiuscula.
 */
export function normalizar(bruto: string | null | undefined): string {
  if (bruto == null) return '';
  return bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Valor posicional de um caractere no calculo do DV: ASCII menos 48. */
const valor = (c: string): number => c.charCodeAt(0) - 48;

function digitoModulo11(chars: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += valor(chars[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CPF_1  = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CPF_2  = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

export function validarCPF(doc: string): boolean {
  if (!/^[0-9]{11}$/.test(doc)) return false;
  // Repetidos passam no modulo 11 e sao placeholders conhecidos (111.111.111-11).
  if (/^(\d)\1{10}$/.test(doc)) return false;
  return doc[9] === String(digitoModulo11(doc, PESOS_CPF_1))
      && doc[10] === String(digitoModulo11(doc, PESOS_CPF_2));
}

export function validarCNPJ(doc: string): boolean {
  // 12 posicoes alfanumericas + 2 digitos verificadores numericos.
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(doc)) return false;
  // Repetidos: rejeitamos so o caso NUMERICO, que e placeholder consagrado
  // (00000000000000). Para alfanumerico a Receita nao publicou lista de
  // invalidos, e inventar uma seria rejeitar cadastro legitimo por palpite.
  if (/^(\d)\1{13}$/.test(doc)) return false;
  return doc[12] === String(digitoModulo11(doc, PESOS_CNPJ_1))
      && doc[13] === String(digitoModulo11(doc, PESOS_CNPJ_2));
}

export function ehAlfanumerico(doc: string): boolean {
  return /[A-Z]/.test(doc);
}

/** Tipo pelo comprimento. Continua funcionando com letras: 11 = CPF, 14 = CNPJ. */
export function detectarTipo(doc: string): TipoDocumento | null {
  if (doc.length === 11) return 'cpf';
  if (doc.length === 14) return 'cnpj';
  return null;
}

export function validar(doc: string): boolean {
  const t = detectarTipo(doc);
  if (t === 'cpf') return validarCPF(doc);
  if (t === 'cnpj') return validarCNPJ(doc);
  return false;
}

export type DocumentoClassificado = {
  documento: string | null;
  documento_tipo: TipoDocumento | null;
  documento_validado: boolean;
  documento_origem: OrigemDocumento | null;
  /** Passou no digito verificador. Diferente de `documento_validado` - ver R8. */
  digito_confere: boolean;
};

/**
 * R7, R8 e R9 num lugar so.
 *
 * R8 e a regra contraintuitiva e ela e deliberada: documento vindo do CRM entra
 * com documento_validado = FALSE **mesmo passando no digito verificador**.
 * Semente nao e confirmacao - la o campo e livre, com 8 a 20% de preenchimento,
 * e digito correto nao prova que o documento e daquela pessoa.
 *
 * R9: documento invalido NAO bloqueia o cadastro. Bloqueia a transicao do
 * contrato para 'ativo'. O sistema nasce sobre dado incompleto; travar na porta
 * impediria a propria migracao.
 */
export function classificar(bruto: string | null | undefined, origem: OrigemDocumento): DocumentoClassificado {
  const doc = normalizar(bruto);
  if (doc === '') {
    return { documento: null, documento_tipo: null, documento_validado: false, documento_origem: null, digito_confere: false };
  }
  const tipo = detectarTipo(doc);
  const confere = validar(doc);
  return {
    documento: doc,
    documento_tipo: tipo,
    documento_validado: origem === 'coleta_local' && confere,   // R8
    documento_origem: origem,
    digito_confere: confere,
  };
}

/** R9 - a unica porta que o documento fecha. */
export function podeAtivarContrato(cliente: { documento_validado: boolean }): boolean {
  return cliente.documento_validado === true;
}
