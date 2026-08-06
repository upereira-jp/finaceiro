// A CHAVE PIX conferida contra o TIPO que a acompanha. PURO, sem banco.
//
// O MODO DE FALHA QUE ESTE ARQUIVO PERSEGUE e o mesmo que o cabecalho do
// `brcode.ts` ja nomeia, e e assimetrico: CRC errado o aplicativo RECUSA, e
// ninguem perde dinheiro; **chave errada com CRC certo o aplicativo ACEITA**. E
// num Pix estatico nao ha `txid` por fatura, entao nao ha conciliacao depois: o
// dinheiro sai da conta de quem pagou, nao chega na nossa, e o primeiro sinal e
// um cliente dizendo que pagou.
//
// MEDIDO EM 06/08/2026, e e o que trouxe este arquivo. `salvarIdentidade`
// (`repos/documento.ts`) fazia `trim()` e mais nada, e `telas/documento.tsx:106`
// manda o campo verbatim. Colar `66.714.022/0001-21` com `pix_tipo_chave =
// 'cnpj'` ao lado gravava **a mascara**, e ela viajava inteira para o campo 01
// do BR Code. O CHECK do banco (`length BETWEEN 3 AND 77`) aceita - 18
// caracteres passam -, e nada correlacionava o tipo declarado com a forma do
// valor. Nenhuma verificacao da suite olhava para isso porque nao havia o que
// olhar: a coluna era texto livre com teto de tamanho.
//
// POR QUE NORMALIZAR, E NAO SO RECUSAR. A mascara nao e informacao:
// "66.714.022/0001-21" e "66714022000121" sao o mesmo CNPJ, e a primeira forma e
// como uma pessoa le um CNPJ. Recusar mandaria o dono apagar pontos a mao, que e
// trabalho sem decisao dentro. O que NAO pode acontecer e a normalizacao ser
// invisivel - entao toda conversao volta no resultado com o texto original ao
// lado, e quem chama tem obrigacao de mostrar os dois. E o desenho de
// `importar-tarifas`: ver "1.234" interpretado como R$ 1,23 ANTES de a fatura
// sair e a unica defesa que existe contra ler certo o numero errado.
//
// O QUE ESTE ARQUIVO NAO FAZ, e a distincao importa: ele confere que a chave tem
// a FORMA do tipo declarado. Ele nao pode dizer que a chave esta REGISTRADA no
// DICT, nem que ela e da nossa conta - isso nao e derivavel de nada que o
// sistema tenha, e o unico teste e ler o QR com a camera (`ROTEIRO-REVISAO`
// parte 5). Confundir as duas coisas daria uma falsa sensacao de conferido.

import { normalizar, validarCPF, validarCNPJ } from './documento.ts';

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/** Os cinco do enum `tipo_chave_pix` do banco. */
export const TIPOS_DE_CHAVE_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const;

export function ehTipoDeChavePix(v: unknown): v is TipoChavePix {
  return typeof v === 'string' && (TIPOS_DE_CHAVE_PIX as readonly string[]).includes(v);
}

export type ChaveConferida =
  | {
      ok: true;
      /** O que vai para o banco e para o campo 01 do BR Code. */
      chave: string;
      /** O que a pessoa digitou, intacto - quem chama TEM de mostrar os dois. */
      original: string;
      /** `true` quando os dois diferem. E o gatilho para o ensaio gritar. */
      normalizou: boolean;
      /** A chave em palavras, para o ensaio imprimir ao lado do original. */
      explicacao: string;
    }
  | { ok: false; motivo: string };

/**
 * O teto do BR Code e do banco ao mesmo tempo: campo 01 do EMV e o CHECK
 * `length(pix_chave) BETWEEN 3 AND 77` da `identidade_de_cobranca`.
 */
const MAXIMO = 77;

/**
 * O palpite sobre o que a pessoa QUIS digitar, usado so para enriquecer a
 * recusa. Existe porque "chave invalida para o tipo cnpj" manda procurar o erro
 * no CNPJ, e o erro costuma estar no TIPO - o campo do lado, que ninguem olha.
 */
function pareceSer(bruto: string): TipoChavePix | null {
  if (bruto.includes('@')) return 'email';
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(bruto.trim())) {
    return 'aleatoria';
  }
  const digitos = bruto.replace(/\D/g, '');
  if (bruto.trim().startsWith('+') || digitos.length === 10 || digitos.length === 11) {
    // 11 digitos e ambiguo com CPF de proposito: so o `+` ou o tipo decidem, e
    // e por isso que este palpite nunca escolhe sozinho - ele so entra no texto.
    if (digitos.length >= 10 && digitos.length <= 13) return 'telefone';
  }
  if (digitos.length === 11) return 'cpf';
  if (digitos.length === 14) return 'cnpj';
  return null;
}

function dica(bruto: string, tipoDeclarado: TipoChavePix): string {
  const p = pareceSer(bruto);
  return p && p !== tipoDeclarado
    ? ` O valor tem a forma de "${p}" - confira se o tipo da chave e o certo antes de mexer no valor.`
    : '';
}

/**
 * Confere a chave contra o tipo. Devolve a chave JA NORMALIZADA ou a recusa
 * nomeada - nunca uma chave "quase certa".
 *
 * Recebe `unknown` de proposito: o valor vem de JSON de arquivo e de corpo de
 * requisicao, e ambos podem trazer numero, `null` ou objeto. Tratar isso aqui e
 * o que impede o `String(v)` distraido do lado de fora, que transformaria
 * `null` na string "null" e a gravaria como chave.
 */
export function conferirChavePix(tipo: unknown, bruto: unknown): ChaveConferida {
  if (!ehTipoDeChavePix(tipo)) {
    return {
      ok: false,
      motivo: `tipo de chave Pix invalido: ${JSON.stringify(tipo)}. `
            + `Os cinco do enum sao ${TIPOS_DE_CHAVE_PIX.join(', ')}.`,
    };
  }
  if (typeof bruto !== 'string') {
    return { ok: false, motivo: `a chave Pix precisa ser texto (veio ${JSON.stringify(bruto)}).` };
  }

  const original = bruto.trim();
  if (!original) return { ok: false, motivo: 'a chave Pix esta vazia.' };

  const feito = (chave: string, explicacao: string): ChaveConferida =>
    chave.length > MAXIMO
      ? { ok: false, motivo: `a chave tem ${chave.length} caracteres e o maximo e ${MAXIMO}.` }
      : { ok: true, chave, original, normalizou: chave !== original, explicacao };

  switch (tipo) {
    // CPF e CNPJ: `normalizar()` tira mascara SEM tirar letra - CNPJ
    // alfanumerico existe desde 31/07/2026 e um filtro de "so digitos"
    // rejeitaria CNPJ valido. Ver o cabecalho de `dominio/documento.ts`.
    case 'cpf': {
      const d = normalizar(original);
      if (!validarCPF(d)) {
        return { ok: false, motivo:
          `"${original}" nao e um CPF valido (normalizado: "${d}", ${d.length} caracteres). `
          + 'O digito verificador nao fecha, ou nao sao 11 digitos.' + dica(original, tipo) };
      }
      return feito(d, `CPF ${d}, digito confere`);
    }

    case 'cnpj': {
      const d = normalizar(original);
      if (!validarCNPJ(d)) {
        return { ok: false, motivo:
          `"${original}" nao e um CNPJ valido (normalizado: "${d}", ${d.length} caracteres). `
          + 'O digito verificador nao fecha, ou nao sao 14 posicoes.' + dica(original, tipo) };
      }
      return feito(d, `CNPJ ${d}, digito confere`);
    }

    // E-MAIL: minusculo porque o DICT guarda assim, e a chave que o pagador
    // resolve e a registrada. Manter a caixa digitada faria o QR carregar uma
    // string que o registro nao tem - e o aplicativo diria "chave nao
    // encontrada" no celular do cliente, que e o pior lugar para descobrir.
    case 'email': {
      const e = original.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) {
        return { ok: false, motivo: `"${original}" nao tem forma de e-mail.` + dica(original, tipo) };
      }
      return feito(e, `e-mail ${e}`);
    }

    // TELEFONE: a chave Pix e E.164 - `+55`, DDD e o numero. Quem digita um
    // telefone brasileiro raramente escreve o `+55`, entao ele e ACRESCENTADO
    // quando falta, e a normalizacao aparece no resultado. O que nao se inventa
    // e DDD: 8 ou 9 digitos sozinhos sao recusados, porque escolher o DDD por
    // "provavelmente Goiania" e o improviso que a regra 10 proibe.
    case 'telefone': {
      // O `+` digitado significa "este JA e o numero internacional inteiro", e
      // respeita-lo nao e cortesia: sem isso "+1 415 555 2671" tem 11 digitos,
      // recebe um `55` na frente e vira um celular brasileiro perfeitamente
      // plausivel. A verificacao Z6e pegou exatamente isso.
      const temPais = original.startsWith('+');
      const digitos = original.replace(/\D/g, '');
      const comPais = !temPais && (digitos.length === 10 || digitos.length === 11)
        ? `55${digitos}` : digitos;
      const chave = `+${comPais}`;
      if (!/^\+55[1-9]\d{9,10}$/.test(chave)) {
        return { ok: false, motivo:
          `"${original}" nao tem forma de telefone Pix (esperado +55, DDD e 8 ou 9 digitos; `
          + `ficou "${chave}"). Sem DDD nao da para completar - o DDD nao se adivinha.`
          + dica(original, tipo) };
      }
      return feito(chave, `telefone ${chave}`);
    }

    // ALEATORIA: a EVP e um UUID, e o registro e minusculo. Sem hifen nao e a
    // mesma string para quem resolve a chave.
    case 'aleatoria': {
      const u = original.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u)) {
        return { ok: false, motivo:
          `"${original}" nao tem forma de chave aleatoria (UUID de 36 caracteres com hifens).`
          + dica(original, tipo) };
      }
      return feito(u, `chave aleatoria ${u}`);
    }
  }
}
