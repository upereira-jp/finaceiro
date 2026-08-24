// O LEITOR POR MODELO DE VISAO. Puro, sem rede e sem chave.
// Uso: node --experimental-strip-types tests/leitor-visao.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e a primeira e a que mais importa:
//
//   1. QUE OS PROMPTS CONTINUAM OS DA REFERENCIA, palavra por palavra. Eles
//      nomeiam rotulos REAIS de uma fatura da Equatorial Goias - `CONSUMO SCEE`,
//      `CONSUMO NAO COMPENSADO`, `CONTRIB. ILUM. PUBLICA - MUNICIPAL`, `ADC
//      BANDEIRA`, a tabela lateral `CONSUMO (kWh)`. Esse mapa e a `Q-EQTL-CAMPOS-01`
//      respondida por quem teve a fatura na mao, e nao ha fatura neste repositorio
//      para reconferir se alguem "melhorar a redacao". A copia de referencia
//      abaixo e a testemunha.
//   2. QUE NENHUM FLOAT SOBREVIVE A FRONTEIRA. O schema declara os campos como
//      `number`, entao eles CHEGAM em ponto flutuante; `numeroParaTexto` e o unico
//      lugar onde isso e verdade, e a tarifa tem de sair com seis casas.
//   3. QUE O SCHEMA COBRE OS 21 CAMPOS. Um campo fora do `required` volta
//      `undefined` e vira string vazia sem ninguem notar.
//
// NAO HA CHAMADA DE REDE AQUI. O que se prende e o contrato e a fronteira; a
// chamada em si e do adaptador, e provar que ela funciona exige um PDF real e
// uma chave - `Q-LEITOR-01`.

import {
  INSTRUCOES_DA_FATURA, INSTRUCOES_DO_BOLETO, SCHEMA_DA_FATURA, SCHEMA_DO_BOLETO,
  blocoDoArquivo, numeroParaTexto, MODELO, ArquivoNaoSuportado, leitorConfigurado,
  SemChaveDaAnthropic, RespostaInesperadaDoModelo, LeitorSemCredencialValida,
  LeitorSobrecarregado, ArquivoRecusadoPeloLeitor, LeituraRecusada,
} from '../src/concessionaria/leitor-visao.ts';
import { CAMPOS_VAZIOS } from '../src/dominio/fatura-unificada.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

/*
 * AS REGRAS DA REFERENCIA, copiadas do bundle desempacotado de
 * `g3_fatura_unificada@36e964e` em 14/08/2026. Esta e a TESTEMUNHA: se o prompt
 * do adaptador divergir dela, a verificacao cai. Nao editar para fazer passar -
 * editar significa que alguem mudou o mapa de rotulos sem uma fatura na mao.
 */
const REGRAS_DA_REFERENCIA = [
  '- energia_compensada_kwh: QUANTIDADE (coluna "Quant.", kWh) da linha "CONSUMO SCEE" da tabela Itens da Fatura. Ignore linhas de injeção ("INJEÇÃO SCEE", "PARC INJET S/DESC"). Some se houver mais de uma.',
  '- tarifa_kwh: coluna "Preço unit (R$) com tributos" da linha "CONSUMO NÃO COMPENSADO", com todas as casas decimais. Se a linha não existir, retorne 0.',
  '- consumo_nao_compensado_kwh e consumo_nao_compensado_valor: quantidade e valor da mesma linha.',
  '- iluminacao_publica: valor da linha "CONTRIB. ILUM. PÚBLICA - MUNICIPAL".',
  '- bandeira_tarifaria e bandeira_valor: nome e valor da linha "ADC BANDEIRA ...". Se não houver, retorne "Verde" e 0.',
];

const REGRA_DA_LINHA_DIGITAVEL =
  '- linha_digitavel: transcreva a linha digitável EXATAMENTE como aparece impressa no boleto, mantendo os pontos e os espaços entre os grupos. Formato esperado, com cinco grupos separados por espaço: "75691.50043 01727.686907 00000.130013 1 15410000059669". Não remova separadores, não junte os grupos, não reformate, não abrevie. Copie caractere por caractere o que está impresso acima do código de barras na ficha de compensação. O quarto grupo é um único dígito isolado — não o omita.';

// ------------------------------------ V1 os prompts sao os da referencia
{
  const faltando = REGRAS_DA_REFERENCIA.filter((r) => !INSTRUCOES_DA_FATURA.includes(r));
  chk('V1', faltando.length === 0,
      `as ${REGRAS_DA_REFERENCIA.length} regras de rotulo da referencia estao no prompt, palavra por palavra`
      + (faltando.length ? ` — falta: ${faltando[0].slice(0, 60)}…` : ''));

  chk('V1b', INSTRUCOES_DA_FATURA.includes('13 meses reais')
          && INSTRUCOES_DA_FATURA.includes('INVERTA')
          && INSTRUCOES_DA_FATURA.includes('não invente progressão regular'),
      'a regra do historico sobreviveu inteira: 13 meses, INVERTER a ordem, e nao inventar progressao');

  chk('V1c', INSTRUCOES_DO_BOLETO.includes(REGRA_DA_LINHA_DIGITAVEL),
      'a regra da linha digitavel esta palavra por palavra - foi ela que a referencia CONSERTOU '
      + 'em 13/08, e o defeito que ela conserta e o quarto grupo (um digito isolado) sumir');

  chk('V1d', !INSTRUCOES_DA_FATURA.includes('JSON puro')
          && !INSTRUCOES_DO_BOLETO.includes('JSON puro'),
      'e o "Responda APENAS com JSON puro" saiu dos dois: o formato agora e imposto pela API, '
      + 'nao pedido em prosa e recortado com indexOf');
}

// --------------------------------- V2 o schema cobre os 21 campos, sem sobra
{
  const doSchema = SCHEMA_DA_FATURA.required as string[];
  const doTipo = Object.keys(CAMPOS_VAZIOS);
  const faltamNoSchema = doTipo.filter((c) => !doSchema.includes(c));
  const sobramNoSchema = doSchema.filter((c) => !doTipo.includes(c));

  chk('V2', faltamNoSchema.length === 0 && sobramNoSchema.length === 0,
      `os ${doTipo.length} campos do tipo e os ${doSchema.length} do schema sao o MESMO conjunto`
      + (faltamNoSchema.length ? ` — falta no schema: ${faltamNoSchema.join(', ')}` : '')
      + (sobramNoSchema.length ? ` — sobra no schema: ${sobramNoSchema.join(', ')}` : ''));

  chk('V2b', SCHEMA_DA_FATURA.additionalProperties === false
          && SCHEMA_DO_BOLETO.additionalProperties === false,
      '`additionalProperties: false` nos dois - sem ele a validacao aceita campo inventado ao lado');

  const hist = SCHEMA_DA_FATURA.properties.historico_consumo.items;
  chk('V2c', hist.required.length === 2 && hist.additionalProperties === false,
      'o item do historico tambem e fechado - `mes` e `kwh`, e mais nada');

  chk('V2d', (SCHEMA_DO_BOLETO.required as string[]).length
             === Object.keys(SCHEMA_DO_BOLETO.properties).length,
      'no boleto todo campo declarado e obrigatorio - opcional volta `undefined` e vira vazio em silencio');
}

// ------------------------------- V3 a fronteira onde o float morre
{
  chk('V3', numeroParaTexto(1.185396, 6) === '1.185396',
      'a tarifa atravessa com as SEIS casas - truncar em duas custa R$ 2,90 numa UC (R22)');

  chk('V3b', numeroParaTexto(44, 2) === '44.00' && numeroParaTexto(8.4, 2) === '8.40',
      'valor inteiro e de uma casa saem com duas - "8.4" impresso como R$ 8,4 seria defeito de fatura');

  chk('V3c', numeroParaTexto(10250.5, 1) === '10250.5',
      'grandeza fisica mantem a casa que veio, e o ponto NAO vira separador de milhar');

  chk('V3d', numeroParaTexto(null, 2) === '' && numeroParaTexto(undefined, 2) === ''
          && numeroParaTexto('', 2) === '',
      'AUSENTE CONTINUA AUSENTE: nulo nao vira "0.00" - a diferenca entre a linha que nao existe '
      + 'e a que existe valendo zero e o que `fatura-concessionaria.ts` chama de tentacao');

  chk('V3e', numeroParaTexto(0, 2) === '0.00',
      'e zero DE VERDADE vira "0.00" - a bandeira verde vale zero, e isso e informacao');

  chk('V3f', typeof numeroParaTexto(1.185396, 6) === 'string',
      'o que sai da fronteira e STRING - depois desta linha nao ha float no caminho do dinheiro');
}

// ------------------------------------- V4 o bloco por tipo de arquivo
{
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

  const pdf = blocoDoArquivo({ conteudo: bytes, tipo: 'application/pdf' });
  chk('V4', pdf.type === 'document' && pdf.source.media_type === 'application/pdf',
      'PDF vira bloco `document`');

  const png = blocoDoArquivo({ conteudo: bytes, tipo: 'image/png' });
  chk('V4b', png.type === 'image' && png.source.media_type === 'image/png',
      'imagem vira bloco `image` - sao tipos diferentes na API, e trocar um pelo outro e 400');

  chk('V4c', pdf.source.data === Buffer.from(bytes).toString('base64'),
      'os bytes viajam em base64, sem quebra de linha');

  let erro: unknown;
  try { blocoDoArquivo({ conteudo: bytes, tipo: 'application/vnd.oasis.opendocument.text' }); }
  catch (e) { erro = e; }
  chk('V4d', erro instanceof ArquivoNaoSuportado
          && String((erro as Error).message).includes('opendocument'),
      'tipo nao suportado e recusado AQUI e a mensagem NOMEIA o que veio - deixar passar '
      + 'produziria um 400 da API falando de `media_type`');
}

// ---------------------------------------- V5 o modelo, e a chave ausente
{
  chk('V5', MODELO === 'claude-opus-5',
      `o modelo e ${MODELO}, e nao o da referencia: a tarifa lida com seis casas vira a conta `
      + 'impressa, e extracao errada nao aparece como erro, aparece como valor');

  const antes = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  chk('V5b', leitorConfigurado() === false,
      'sem a variavel, o leitor se declara ausente - a tela nao oferece o que nao ha');
  process.env.ANTHROPIC_API_KEY = '   ';
  chk('V5c', leitorConfigurado() === false,
      'e chave em branco tambem e ausencia, nao configuracao');
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
}

// ---------------------------------------- V6 as mensagens sao para quem OPERA
/*
 * POR QUE ESTE BLOCO EXISTE, e ele nasceu de um defeito real medido em 24/08:
 * a chave da Anthropic ficou ausente por semanas, e a frase que aparecia na aba
 * «1 · Leitura e calculo» dizia o nome da variavel de ambiente, o caminho do
 * arquivo no servidor e o numero de uma regra do CLAUDE.md.
 *
 * Quem le essa aba e quem esta com a conta da distribuidora na mao. Nao tem
 * acesso ao servidor, nao vai editar arquivo nenhum, e a frase so lhe dizia que
 * o problema existia - sem dizer o que fazer agora.
 *
 * E A MESMA REGRA DAS TELAS, e ela ja tem dois testes: `web/tests/ajuda.ts` V4 e
 * `web/tests/vocabulario-das-telas.ts` T1 proibem jargao no texto exibido. Estas
 * mensagens sao exibidas igual e escapavam das duas varreduras porque moram no
 * backend. Agora nao escapam.
 *
 * O QUE ESTE TESTE NAO PROIBE: `${detalhe}` e `${tipo}` interpolados. O que vem
 * de fora pode ser tecnico, e mesmo assim ajuda - "opendocument" na frase e o
 * unico jeito de a pessoa entender que mandou o arquivo errado.
 */
{
  const PROIBIDO: Array<[RegExp, string]> = [
    [/[A-Z][A-Z0-9]*_[A-Z0-9_]+/,        'nome de variavel de ambiente'],
    [/\/etc\/|\.env\b/,                 'caminho de arquivo do servidor'],
    [/CLAUDE\.md|\bregra \d/i,           'regra do repositorio'],
    [/\bQ-[A-Z]/,                        'codigo de questao aberta'],
    [/`[A-Za-z]+`/,                      'nome de simbolo do codigo em crase'],
    [/\bAnthropic\b/,                   'nome do fornecedor do modelo'],
    [/\b\d{3}\/\d{3}\b|\bHTTP \d{3}\b/,   'codigo de status HTTP'],
  ];

  const mensagens: Array<[string, string]> = [
    ['SemChaveDaAnthropic',       new SemChaveDaAnthropic().message],
    ['ArquivoNaoSuportado',       new ArquivoNaoSuportado('application/vnd.oasis.opendocument.text').message],
    ['RespostaInesperadaDoModelo', new RespostaInesperadaDoModelo('sem bloco de texto').message],
    ['LeitorSemCredencialValida', new LeitorSemCredencialValida().message],
    ['LeitorSobrecarregado',      new LeitorSobrecarregado().message],
    ['ArquivoRecusadoPeloLeitor', new ArquivoRecusadoPeloLeitor('pdf ilegivel').message],
    ['LeituraRecusada',           new LeituraRecusada('documento pessoal').message],
  ];

  chk('V6', mensagens.length === 7,
      `as ${mensagens.length} mensagens do leitor que chegam na tela foram conferidas uma a uma - `
      + 'um erro novo sem linha aqui passa verde sobre texto que ninguem leu');

  for (const [nome, texto] of mensagens) {
    const achado = PROIBIDO.find(([re]) => re.test(texto));
    chk('V6a', achado === undefined,
        `${nome}: fala com quem opera${achado ? ` — VAZOU ${achado[1]}: "${texto}"` : ''}`);
  }

  for (const [nome, texto] of mensagens) {
    chk('V6b', texto.length >= 60,
        `${nome}: a frase tem corpo — mensagem de uma linha nao chega a dizer o que fazer`);
  }

  /*
   * E AS TRES QUE A PESSOA NAO RESOLVE SOZINHA MANDAM PEDIR AJUDA. Sem isto, o
   * teste acima passaria com uma frase educada que deixa a pessoa parada.
   */
  const pedeAjuda = [new SemChaveDaAnthropic().message, new LeitorSemCredencialValida().message];
  for (const t of pedeAjuda) {
    chk('V6c', /avise quem cuida/i.test(t) && /à mão/i.test(t),
        'falta de credencial diz as DUAS saidas: avisar quem instala, e seguir a mao');
  }

  chk('V6d', new ArquivoNaoSuportado('application/vnd.oasis.opendocument.text').message.includes('opendocument'),
      'e o tipo recusado continua NOMEADO na frase, que e o que faz a pessoa ver o proprio engano');
}

console.log();
if (falhas > 0) { console.log(`--- leitor por visao: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- o leitor por modelo de visao: 39 verificacoes, 0 falhas');
