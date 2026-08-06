// A CHAVE PIX conferida contra o TIPO. Sem banco.
// Uso: node --experimental-strip-types tests/chave-pix.ts
//
// O QUE ESTA SUITE PERSEGUE, e ela e diferente das outras cinco puras.
//
// Nas planilhas o erro tem consequencia DESTE lado - o total sai errado, o
// contrato nasce sem originador, a UF nao existe. Aqui nao: uma chave Pix errada
// nao quebra nada nosso. O BR Code sai bem formado, o CRC fecha, o QR desenha, o
// documento imprime, e **o aplicativo do banco aceita**. O erro so aparece na
// conta de destino de outra pessoa, e num Pix estatico nao ha `txid` por fatura
// para conciliar depois. Quem descobre e o cliente, e depois de pagar.
//
// Entao a suite tem duas metades, e a segunda e a que vale:
//
//   1. a guarda faz o que diz  - normaliza mascara, recusa digito que nao fecha,
//      nao inventa DDD, nao rejeita CNPJ alfanumerico
//   2. **o registro executavel de por que ela existe** - Z9 monta um BR Code com
//      a chave MASCARADA e afirma que ele sai VALIDO: CRC conferindo e a mascara
//      inteira dentro do payload. Enquanto essa verificacao passar, ela e a prova
//      de que nada a jusante pega o defeito - e a guarda e o unico ponto que pega
//
// A forma da 2 e copiada da `S2a` de `tests/sqlstate.ts`, que afirma que a
// condicao ANTIGA falha. Afirmar o defeito e diferente de comentar o defeito.

import { conferirChavePix, TIPOS_DE_CHAVE_PIX, ehTipoDeChavePix } from '../src/dominio/chave-pix.ts';
import { pixEstatico, crcConfere } from '../src/dominio/brcode.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

/** O CNPJ do CONSORCIO G3, medido no cartao CNPJ em 06/08/2026. */
const CNPJ_MASCARA = '66.714.022/0001-21';
const CNPJ_LIMPO   = '66714022000121';

const ok = (r: ReturnType<typeof conferirChavePix>) => (r.ok ? r : null);
const nao = (r: ReturnType<typeof conferirChavePix>) => (r.ok ? null : r);

// ======================================================= Z1 o caso medido
{
  const comMascara = ok(conferirChavePix('cnpj', CNPJ_MASCARA));
  const semMascara = ok(conferirChavePix('cnpj', CNPJ_LIMPO));

  chk('Z1a', comMascara?.chave === CNPJ_LIMPO,
      `"${CNPJ_MASCARA}" com tipo cnpj vira "${comMascara?.chave}" - a mascara nao chega ao BR Code`);
  chk('Z1b', comMascara?.normalizou === true && semMascara?.normalizou === false,
      'o resultado DIZ que normalizou; sem mascara ele diz que nao - e o que o ensaio imprime');
  chk('Z1c', comMascara?.original === CNPJ_MASCARA,
      'o texto original volta intacto - mostrar so o normalizado esconderia a conversao');
  chk('Z1d', comMascara?.chave === semMascara?.chave,
      'as duas formas convergem na MESMA chave - e a ida-e-volta que prova que nada se perde');
  chk('Z1e', ok(conferirChavePix('cnpj', ` ${CNPJ_MASCARA} `))?.chave === CNPJ_LIMPO,
      'espaco em volta nao muda o resultado - colar de um PDF traz espaco');
}

// ================================================ Z2 o digito, nos dois sentidos
{
  const vizinho = '66.714.022/0001-22';   // o mesmo CNPJ com o ultimo DV trocado
  chk('Z2a', ok(conferirChavePix('cnpj', CNPJ_MASCARA)) !== null,
      'o CNPJ do consorcio passa - o digito fecha');
  chk('Z2b', nao(conferirChavePix('cnpj', vizinho)) !== null,
      `"${vizinho}" e recusado - um digito trocado nao passa, e e o erro de digitacao mais provavel`);
  chk('Z2c', (nao(conferirChavePix('cnpj', vizinho))?.motivo ?? '').includes('66714022000122'),
      'a recusa mostra o valor NORMALIZADO, nao so o que foi digitado - senao nao da para conferir a olho');
  chk('Z2d', nao(conferirChavePix('cnpj', '00.000.000/0000-00')) !== null,
      'o placeholder numerico repetido e recusado, como em `dominio/documento.ts`');
}

// ======================================== Z3 o tipo errado, que e o erro do lado
{
  const r = nao(conferirChavePix('cpf', CNPJ_LIMPO));
  chk('Z3a', r !== null, 'CNPJ no campo declarado como cpf e recusado - a forma nao bate com o tipo');
  chk('Z3b', (r?.motivo ?? '').includes('cnpj'),
      'e a recusa nomeia o tipo PROVAVEL: o erro costuma estar no seletor do lado, nao no numero');
  chk('Z3c', nao(conferirChavePix('cnpj', 'contato@g3solar.com.br')) !== null &&
             (nao(conferirChavePix('cnpj', 'contato@g3solar.com.br'))?.motivo ?? '').includes('email'),
      'e-mail declarado como cnpj: recusado, e a dica diz "email"');
}

// ==================================== Z4 CNPJ alfanumerico (Receita, 31/07/2026)
// O DV e calculado AQUI por uma rotina escrita de outro jeito - somatorio direto
// em vez do laco sobre pesos do `dominio/documento.ts`. Casar contra a propria
// implementacao sob teste nao afirmaria nada.
{
  const base = 'A1B2C3D4E5F6';
  const v = (c: string) => c.charCodeAt(0) - 48;
  const dv = (s: string) => {
    // Pesos 2..9 ciclicos, da direita para a esquerda - a formulacao da Receita.
    let soma = 0, peso = 2;
    for (let i = s.length - 1; i >= 0; i--) { soma += v(s[i]!) * peso; peso = peso === 9 ? 2 : peso + 1; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  const d2 = dv(`${base}${d1}`);
  const alfa = `${base}${d1}${d2}`;

  chk('Z4a', ok(conferirChavePix('cnpj', alfa))?.chave === alfa,
      `CNPJ alfanumerico ${alfa} atravessa a guarda - filtro de "so digitos" o rejeitaria`);
  chk('Z4b', ok(conferirChavePix('cnpj', 'a1b2c3d4e5f6' + d1 + d2))?.chave === alfa,
      'minuscula vira maiuscula: a Receita emite em maiuscula e as duas sao o mesmo CNPJ');
  chk('Z4c', nao(conferirChavePix('cnpj', `${base}${d1}${(d2 + 1) % 10}`)) !== null,
      'o mesmo alfanumerico com o DV corrompido e recusado - a guarda nao esta so olhando o formato');
}

// ============================================================= Z5 e-mail
{
  const r = ok(conferirChavePix('email', 'CONTATO@G3SOLAR.COM.BR'));
  chk('Z5a', r?.chave === 'contato@g3solar.com.br',
      'e-mail minusculiza - o DICT guarda assim, e a chave que o pagador resolve e a REGISTRADA');
  chk('Z5b', r?.normalizou === true, 'e a conversao aparece, como a da mascara');
  chk('Z5c', nao(conferirChavePix('email', 'contato@g3solar')) !== null,
      'sem ponto no dominio e recusado');
  chk('Z5d', nao(conferirChavePix('email', 'con tato@g3solar.com.br')) !== null,
      'espaco no meio e recusado - o campo 01 do BR Code nao o carrega de volta');
}

// =========================================================== Z6 telefone
{
  chk('Z6a', ok(conferirChavePix('telefone', '(62) 99975-1477'))?.chave === '+5562999751477',
      'telefone com mascara e sem pais vira E.164 - o +55 e acrescentado');
  chk('Z6b', ok(conferirChavePix('telefone', '+55 62 99975-1477'))?.chave === '+5562999751477',
      'com o +55 digitado, o resultado e o mesmo - as duas formas convergem');
  chk('Z6c', ok(conferirChavePix('telefone', '(62) 3975-1477'))?.chave === '+556239751477',
      'fixo de 8 digitos tambem passa - nem toda chave de telefone e celular');
  chk('Z6d', nao(conferirChavePix('telefone', '99975-1477')) !== null,
      'SEM DDD e recusado: completar por "provavelmente Goiania" e o improviso que a regra 10 proibe');
  chk('Z6e', nao(conferirChavePix('telefone', '+1 415 555 2671')) !== null,
      'telefone de fora do Brasil e recusado - a chave Pix e +55');
}

// ========================================================== Z7 aleatoria
{
  const u = '7F3E9A1C-2B4D-4E6F-8A9B-1C2D3E4F5A6B';
  chk('Z7a', ok(conferirChavePix('aleatoria', u))?.chave === u.toLowerCase(),
      'a EVP minusculiza - o registro e minusculo');
  chk('Z7b', nao(conferirChavePix('aleatoria', u.replace(/-/g, ''))) !== null,
      'sem hifen e recusado: nao e a mesma string para quem resolve a chave');
}

// ================================================= Z8 as bordas da entrada
{
  chk('Z8a', nao(conferirChavePix('pix', CNPJ_LIMPO)) !== null,
      'tipo fora do enum e recusado - o banco tem `tipo_chave_pix` e um valor novo nao nasce aqui');
  chk('Z8b', nao(conferirChavePix('cnpj', null)) !== null &&
             nao(conferirChavePix('cnpj', 66714022000121)) !== null,
      'null e numero sao recusados como TEXTO ausente - o `String(v)` distraido gravaria "null"');
  chk('Z8c', nao(conferirChavePix('cnpj', '   ')) !== null,
      'so espaco e vazio, nao chave');
  chk('Z8d', nao(conferirChavePix('email', `${'a'.repeat(70)}@g3solar.com.br`)) !== null,
      'acima de 77 e recusado - e o teto do campo 01 do EMV E o CHECK da coluna');
  chk('Z8e', TIPOS_DE_CHAVE_PIX.every(ehTipoDeChavePix) && !ehTipoDeChavePix('cnjp'),
      'os cinco do enum sao aceitos pelo predicado e um vizinho de digitacao nao');
}

// ============ Z9 O REGISTRO EXECUTAVEL: por que a guarda e o unico ponto que pega
//
// Se esta verificacao passar a falhar, o motivo importa: significa que alguma
// camada a jusante passou a recusar a chave mascarada, e a guarda deixou de ser
// a unica defesa. Nesse dia esta suite e que precisa mudar, e o comentario
// tambem - nao o resultado.
{
  const comum = { recebedorNome: 'G3 GESTAO ENERGIA SOLAR', recebedorCidade: 'GOIANIA', valorCentavos: 12345 };
  const errado = pixEstatico({ chave: CNPJ_MASCARA, ...comum });
  const certo  = pixEstatico({ chave: CNPJ_LIMPO,   ...comum });

  chk('Z9a', crcConfere(errado),
      'o BR Code montado com a chave MASCARADA tem CRC valido - o aplicativo do banco NAO recusa');
  chk('Z9b', errado.includes(CNPJ_MASCARA),
      'e a mascara viaja inteira dentro do payload, com pontos e barra');
  chk('Z9c', errado !== certo && crcConfere(certo),
      'os dois payloads sao diferentes e os dois sao validos: nada a jusante distingue certo de errado');
  chk('Z9d', nao(conferirChavePix('cnpj', CNPJ_MASCARA)) === null &&
             ok(conferirChavePix('cnpj', CNPJ_MASCARA))!.chave === CNPJ_LIMPO,
      'a guarda e o unico ponto do caminho que converte antes de o payload existir');
}

console.log(falhas === 0 ? '\nTODAS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
