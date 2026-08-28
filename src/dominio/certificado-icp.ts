// QUEM E O TITULAR DE UM CERTIFICADO ICP-BRASIL, lido do subject do X.509.
//
// ============================================================================
// ESTE ARQUIVO NASCEU DE UM BUG, e o bug vale mais que o conserto
//
// Em 27/08/2026, na PRIMEIRA vez que o A1 de verdade da G3 passou pelo
// `scripts/certificado.ts`, a conferencia acusou:
//
//     CNPJ   32888787000166  <-- NAO e o da G3 (66714022000121)
//
// O certificado estava CERTO. Quem estava errado era a leitura: ela pegava
// `subject.match(/(\d{14})/)` - os primeiros catorze digitos do subject inteiro.
// E o subject de um A1 do ICP-Brasil tem mais de um documento dentro:
//
//     C  = BR
//     O  = ICP-Brasil
//     OU = videoconferencia
//     OU = 32888787000166                                        <- a AR emissora
//     OU = Pessoa Juridica A1
//     OU = Autoridade Certificadora DIGITAL CERTY
//     CN = CONSORCIO G3 GESTAO DE ENERGIA SOLAR:66714022000121    <- o TITULAR
//
// O titular vive no `CN`, depois dos dois-pontos, e em lugar nenhum mais. O que
// esta nos `OU` e a cadeia de quem emitiu.
//
// POR QUE ISSO E PIOR QUE UM ERRO DE EXIBICAO. A conferencia existe para pegar
// o dia em que alguem subir o certificado da empresa errada - um socio, uma
// coligada, o contador. Uma guarda que acusa o certificado CERTO ensina quem
// opera a ignora-la, e no dia do caso de verdade o aviso ja virou ruido de
// fundo. Falso positivo em guarda nao e incomodo: e desarme.
//
// E POR QUE ELE SAIU DO SCRIPT PARA O DOMINIO: regra 8 - invariante sem teste e
// comentario. Dentro de `scripts/certificado.ts` a funcao nao era testavel (o
// arquivo executa no import), e um bug de leitura de identidade e exatamente o
// que precisa de teste com o caso real dentro.

import { normalizar, detectarTipo, validar, type TipoDocumento } from './documento.ts';

export type TitularDoCertificado = {
  /** A razao social ou o nome, como esta no `CN`, antes dos dois-pontos. */
  nome: string;
  /** CPF ou CNPJ normalizado, ou `null` se o `CN` nao trouxer identificacao. */
  documento: string | null;
  tipo: TipoDocumento | null;
  /** Os digitos verificadores fecham. `false` com `documento` preenchido e
   *  sinal de subject fora do padrao - nao de certificado invalido. */
  valido: boolean;
};

/**
 * Corta o `CN` de um subject no formato que o `openssl x509 -subject` imprime.
 *
 * O CUIDADO COM A VIRGULA: o separador entre campos e `, `, e razao social PODE
 * ter virgula ("EMPRESA X, LTDA"). Cortar no primeiro `,` truncaria o nome. Por
 * isso o corte e no proximo campo DE VERDADE - o padrao `, SIGLA = ` -, e nao
 * em qualquer virgula.
 */
function valorDoCN(subject: string): string {
  const m = /(?:^|,)\s*CN\s*=\s*/.exec(subject);
  if (!m) return '';
  const resto = subject.slice(m.index + m[0].length);
  return resto.split(/,\s*[A-Za-z][A-Za-z0-9.]*\s*=\s*/)[0].trim();
}

export function titularDoSubject(subject: string | null | undefined): TitularDoCertificado {
  const cn = valorDoCN(String(subject ?? ''));
  if (!cn) return { nome: '', documento: null, tipo: null, valido: false };

  // `RAZAO SOCIAL:CNPJ`. O ULTIMO dois-pontos, e nao o primeiro: nome com
  // dois-pontos no meio e raro e possivel, e o documento esta sempre no fim.
  const corte = cn.lastIndexOf(':');
  if (corte === -1) return { nome: cn, documento: null, tipo: null, valido: false };

  const nome = cn.slice(0, corte).trim();
  // `normalizar` de `documento.ts` sobe para maiuscula e tira o que nao e
  // alfanumerico - o que preserva CNPJ ALFANUMERICO, que existe desde 2026 e
  // que um `replace(/\D/g, '')` teria destruido em silencio.
  const doc = normalizar(cn.slice(corte + 1));
  const tipo = detectarTipo(doc);

  // Sem tipo reconhecido, o que veio depois dos dois-pontos nao era documento.
  // Devolve o `CN` inteiro como nome, em vez de cortar um pedaco fora.
  if (!tipo) return { nome: cn, documento: null, tipo: null, valido: false };

  return { nome, documento: doc, tipo, valido: validar(doc) };
}
