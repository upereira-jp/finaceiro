// O LEITOR DA FATURA E DO BOLETO, por modelo de visao. E o adaptador que preenche
// a `PortaDeLeitura` que existia vazia desde 07/08.
//
// DE ONDE ISTO VEM. A tela definitiva do dono (`g3_fatura_unificada`) sobe o PDF
// da fatura da Equatorial e o do boleto Sicoob e extrai os campos com um modelo
// de visao. Este arquivo e esse caminho, portado - MESMOS prompts, palavra por
// palavra, porque eles nomeiam os rotulos reais de uma fatura que alguem leu.
//
// ============================================================================
// A PRIMEIRA CHAMADA PAGA A SERVICO EXTERNO DESTE SISTEMA
//
// Ate aqui o financeiro so falava com o proprio banco, com o CRM (leitura) e com
// a Sicoob. Isto acrescenta uma chamada a API da Anthropic, com custo por fatura
// lida. Consequencias que ficam registradas aqui e nao so no PR:
//
//   - a chave e segredo de PLATAFORMA, nao de tenant, entao variavel de ambiente
//     e o lugar certo pela regra 5 - o que a regra proibe e segredo POR TENANT em
//     coluna ou em env;
//   - a rota que expoe isto e AUTENTICADA e passa por `exigir()`. A referencia
//     expoe um proxy aberto (`Q-REF-SEGREDO-01`), e o custo dela e de quem tem a
//     URL. Aqui e de quem tem sessao;
//   - sem a variavel, o leitor NAO existe: `SemChaveDaAnthropic` responde 503
//     nomeando o que falta, em vez de estourar no meio de uma leitura.
//
// ============================================================================
// TRES COISAS QUE A REFERENCIA FAZ E ESTA NAO
//
//   1. `t.indexOf('{')` ... `t.lastIndexOf('}')`. A referencia pede JSON puro no
//      prompt e depois RECORTA a resposta entre a primeira chave e a ultima. Se o
//      modelo escrever uma chave em texto antes do JSON, o recorte pega o pedaco
//      errado - e o que sai disso vira fatura. Aqui o formato e imposto pela API
//      (`output_config.format`), que valida contra o schema antes de devolver.
//   2. Chamada do NAVEGADOR. La o PDF do cliente sai do browser para um endpoint
//      publico. Aqui o arquivo vai para a nossa rota autenticada e a chamada sai
//      do servidor.
//   3. O modelo. A referencia usa `claude-sonnet-4-6`; aqui e `claude-opus-5`, e
//      a razao e o destino do numero: a tarifa lida com seis casas e a quebra dos
//      repasses viram a conta impressa que o cliente confere. Extracao errada nao
//      aparece como erro, aparece como valor.

import Anthropic from '@anthropic-ai/sdk';
import {
  CAMPOS_VAZIOS, paraDecimal, decimalParaTexto,
  type CamposDaFaturaUnificada,
} from '../dominio/fatura-unificada.ts';

/** Opus 5. Ver a nota 3 do cabecalho para por que nao e o modelo da referencia. */
export const MODELO = 'claude-opus-5';

export class SemChaveDaAnthropic extends Error {
  readonly status = 503;
  constructor() {
    super(
      'ANTHROPIC_API_KEY nao esta definida. A leitura de fatura e de boleto por imagem ' +
      'depende dela, e ela e segredo de PLATAFORMA - variavel de ambiente, nunca coluna ' +
      '(CLAUDE.md regra 5). Sem ela o resto do sistema funciona; so o leitor nao existe.'
    );
    this.name = 'SemChaveDaAnthropic';
  }
}

export class ArquivoNaoSuportado extends Error {
  readonly status = 422;
  constructor(tipo: string) {
    super(
      `A leitura nao aceita "${tipo}". Envie PDF ou imagem (PNG, JPEG, WebP, GIF). ` +
      'A recusa e AQUI e nomeia o que veio: deixar passar produziria um 400 da API ' +
      'falando de `media_type`, que nao ajuda quem subiu um .docx.'
    );
    this.name = 'ArquivoNaoSuportado';
  }
}

export class RespostaInesperadaDoModelo extends Error {
  readonly status = 502;
  constructor(detalhe: string) {
    super(
      `O modelo respondeu de forma inesperada: ${detalhe}. Nada foi extraido. ` +
      'NAO E `LeituraNaoConfigurada` - o extrator existe e respondeu; o que veio e que nao serve.'
    );
    this.name = 'RespostaInesperadaDoModelo';
  }
}

export class LeituraRecusada extends Error {
  readonly status = 422;
  constructor(categoria: string | null) {
    super(
      `O modelo recusou ler este documento${categoria ? ` (${categoria})` : ''}. ` +
      'Nada foi extraido. Confira se o arquivo enviado e mesmo a fatura ou o boleto.'
    );
    this.name = 'LeituraRecusada';
  }
}

/** O que entra: o arquivo como veio, e o que ele e. */
export type DocumentoParaLer = {
  /** Bytes do arquivo. PDF ou imagem. */
  conteudo: Uint8Array;
  /** `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `image/gif`. */
  tipo: string;
};

const IMAGENS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function cliente(): Anthropic {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave || !chave.trim()) throw new SemChaveDaAnthropic();
  return new Anthropic({ apiKey: chave.trim() });
}

/**
 * O BLOCO DE CONTEUDO, por tipo de arquivo.
 *
 * PDF vira `document` e imagem vira `image` - sao tipos de bloco diferentes na
 * API, e mandar um como o outro e erro de requisicao, nao degradacao. Qualquer
 * outro mime e recusado AQUI, com o nome do que veio: deixar passar produziria um
 * 400 da API falando de `media_type`, que nao ajuda quem subiu um `.docx`.
 */
export function blocoDoArquivo(d: DocumentoParaLer) {
  const dados = Buffer.from(d.conteudo).toString('base64');
  if (d.tipo === 'application/pdf') {
    return {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: dados },
    };
  }
  if (IMAGENS.has(d.tipo)) {
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: d.tipo as 'image/png', data: dados },
    };
  }
  throw new ArquivoNaoSuportado(d.tipo);
}

/**
 * O PROMPT DA FATURA DA EQUATORIAL - PORTADO PALAVRA POR PALAVRA.
 *
 * NAO REESCREVER SEM MEDIR. Cada regra aqui nomeia um rotulo real da fatura da
 * Equatorial Goias - `CONSUMO SCEE`, `CONSUMO NAO COMPENSADO`, `CONTRIB. ILUM.
 * PUBLICA - MUNICIPAL`, `ADC BANDEIRA`, a tabela lateral `CONSUMO (kWh)` -, e
 * esse mapa e a coisa mais valiosa que a referencia trouxe: e a `Q-EQTL-CAMPOS-01`
 * respondida por quem teve a fatura na mao. Melhorar a redacao daqui sem uma
 * fatura para conferir e trocar conhecimento medido por preferencia de estilo.
 *
 * O que MUDOU em relacao a referencia: a instrucao "Responda APENAS com JSON puro"
 * saiu, porque o formato agora e imposto pela API e nao pedido em prosa.
 */
export const INSTRUCOES_DA_FATURA = [
  'Você extrai dados de uma fatura da Equatorial Goiás.',
  'Regras:',
  '- energia_compensada_kwh: QUANTIDADE (coluna "Quant.", kWh) da linha "CONSUMO SCEE" da tabela Itens da Fatura. Ignore linhas de injeção ("INJEÇÃO SCEE", "PARC INJET S/DESC"). Some se houver mais de uma.',
  '- tarifa_kwh: coluna "Preço unit (R$) com tributos" da linha "CONSUMO NÃO COMPENSADO", com todas as casas decimais. Se a linha não existir, retorne 0.',
  '- consumo_nao_compensado_kwh e consumo_nao_compensado_valor: quantidade e valor da mesma linha.',
  '- iluminacao_publica: valor da linha "CONTRIB. ILUM. PÚBLICA - MUNICIPAL".',
  '- bandeira_tarifaria e bandeira_valor: nome e valor da linha "ADC BANDEIRA ...". Se não houver, retorne "Verde" e 0.',
  '- outros_encargos: soma dos demais itens que compõem o total da Equatorial e não foram capturados acima, para que o detalhamento feche com valor_total_equatorial.',
  '- historico_consumo: a tabela lateral "CONSUMO (kWh)", que traz 13 meses reais. Ignore a linha "MÉDIA" — não é um mês. Ignore as colunas de dias e de tipo de faturamento ("LIDA"). A tabela da fatura vem em ordem decrescente: INVERTA e retorne em ordem cronológica crescente, do mês mais antigo ao mais recente. Use os valores exatos em kWh, com decimais quando houver. O consumo real oscila de mês a mês — não invente progressão regular nem repita valores.',
  'Números com ponto decimal, sem separador de milhar, sem símbolo de moeda.',
].join('\n');

const texto = { type: 'string' as const };
const numero = { type: 'number' as const };

/**
 * O SCHEMA DA FATURA. Substitui o "Formato exato: {...}" que a referencia
 * escrevia no prompt e depois torcia para o modelo obedecer.
 *
 * `additionalProperties: false` e todo campo em `required` - as duas coisas que a
 * API exige para validar de verdade. Campo ausente e recusado antes de virar
 * `undefined` do lado de ca.
 */
export const SCHEMA_DA_FATURA = {
  type: 'object' as const,
  properties: {
    cliente: texto, documento: texto, endereco: texto, unidade_consumidora: texto,
    classificacao: texto, mes_referencia: texto, data_emissao: texto,
    leitura_anterior: texto, leitura_atual: texto, dias_faturados: numero,
    vencimento: texto, energia_compensada_kwh: numero, tarifa_kwh: numero,
    consumo_nao_compensado_kwh: numero, consumo_nao_compensado_valor: numero,
    iluminacao_publica: numero, bandeira_tarifaria: texto, bandeira_valor: numero,
    outros_encargos: numero, valor_total_equatorial: numero,
    historico_consumo: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { mes: texto, kwh: numero },
        required: ['mes', 'kwh'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'cliente', 'documento', 'endereco', 'unidade_consumidora', 'classificacao',
    'mes_referencia', 'data_emissao', 'leitura_anterior', 'leitura_atual',
    'dias_faturados', 'vencimento', 'energia_compensada_kwh', 'tarifa_kwh',
    'consumo_nao_compensado_kwh', 'consumo_nao_compensado_valor', 'iluminacao_publica',
    'bandeira_tarifaria', 'bandeira_valor', 'outros_encargos', 'valor_total_equatorial',
    'historico_consumo',
  ],
  additionalProperties: false,
};

/** O prompt do boleto Sicoob, portado palavra por palavra. Ver `§4` da referencia. */
export const INSTRUCOES_DO_BOLETO = [
  'Você extrai dados de um boleto bancário brasileiro (Sicoob).',
  'Regras:',
  '- linha_digitavel: transcreva a linha digitável EXATAMENTE como aparece impressa no boleto, mantendo os pontos e os espaços entre os grupos. Formato esperado, com cinco grupos separados por espaço: "75691.50043 01727.686907 00000.130013 1 15410000059669". Não remova separadores, não junte os grupos, não reformate, não abrevie. Copie caractere por caractere o que está impresso acima do código de barras na ficha de compensação. O quarto grupo é um único dígito isolado — não o omita.',
  '- pix_copia_e_cola: o payload PIX EMV completo, que começa com 00020101. Costuma aparecer como texto próximo ao QR Code, sob rótulos como "PIX Copia e Cola" ou "Código PIX". Se o boleto não tiver PIX, retorne string vazia.',
  '- beneficiario, vencimento e valor: dados do boleto, usados apenas para conferência. valor com ponto decimal, sem separador de milhar e sem símbolo de moeda.',
  '- instrucoes: array de strings com cada linha do campo "Instruções (texto de responsabilidade do beneficiário)", na ordem em que aparecem, exatamente como estão escritas. Não reformule, não resuma, não corrija. Ignore nesse array as linhas fixas sobre a cooperativa contratante e sobre o Bancoob.',
  '- nosso_numero: o campo "Nosso Número" do boleto (ex.: 1-3).',
].join('\n');

export const SCHEMA_DO_BOLETO = {
  type: 'object' as const,
  properties: {
    linha_digitavel: texto, pix_copia_e_cola: texto, beneficiario: texto,
    vencimento: texto, valor: numero, nosso_numero: texto,
    instrucoes: { type: 'array' as const, items: texto },
  },
  required: ['linha_digitavel', 'pix_copia_e_cola', 'beneficiario', 'vencimento',
             'valor', 'nosso_numero', 'instrucoes'],
  additionalProperties: false,
};

/**
 * UMA chamada ao modelo, com o formato imposto pelo schema.
 *
 * `stop_reason: "refusal"` E CONFERIDO ANTES DE LER O CONTEUDO, e nao e zelo
 * teorico: numa recusa o `content` vem vazio, e `content[0].text` seria um
 * `TypeError` sem nome no meio de uma leitura de fatura.
 */
async function extrair<T>(d: DocumentoParaLer, instrucoes: string, schema: object): Promise<T> {
  const resposta = await cliente().messages.create({
    model: MODELO,
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema } as never },
    messages: [{
      role: 'user',
      content: [blocoDoArquivo(d), { type: 'text', text: instrucoes }],
    }],
  } as never) as Anthropic.Message;

  if (resposta.stop_reason === 'refusal') {
    throw new LeituraRecusada((resposta as { stop_details?: { category?: string } })
      .stop_details?.category ?? null);
  }
  const bloco = resposta.content.find((b) => b.type === 'text');
  if (!bloco || bloco.type !== 'text') {
    throw new RespostaInesperadaDoModelo('nenhum bloco de texto na resposta');
  }
  return JSON.parse(bloco.text) as T;
}

/**
 * NUMERO -> STRING, preservando as casas que vieram.
 *
 * O schema declara os campos monetarios e fisicos como `number`, entao eles
 * chegam em ponto flutuante - e a regra 1 nao permite que fiquem assim. A
 * conversao acontece AQUI, na fronteira, uma vez: de `number` para o decimal em
 * texto que `fatura-unificada.ts` consome. Depois desta linha nao ha float no
 * caminho do dinheiro.
 *
 * `casas` fixa o minimo; um valor com mais casas do que isso mantem as dele -
 * a tarifa tem seis e arredonda-la para duas custaria R$ 2,90 numa UC (medido em
 * `web/src/telas/tarifas.tsx`, R22).
 */
export function numeroParaTexto(v: unknown, casas: number): string {
  if (v === null || v === undefined || v === '') return '';
  const bruto = typeof v === 'number' ? v.toString() : String(v);
  const d = paraDecimal(bruto, 'campo extraido');
  return decimalParaTexto(d, Math.max(casas, d.escala));
}

/** Lê a fatura da Equatorial e devolve os 21 campos, todos como STRING. */
export async function lerFaturaDaEquatorial(d: DocumentoParaLer): Promise<CamposDaFaturaUnificada> {
  const r = await extrair<Record<string, unknown>>(d, INSTRUCOES_DA_FATURA, SCHEMA_DA_FATURA);
  const s = (k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]));
  return {
    ...CAMPOS_VAZIOS,
    cliente: s('cliente'), documento: s('documento'), endereco: s('endereco'),
    unidade_consumidora: s('unidade_consumidora'), classificacao: s('classificacao'),
    mes_referencia: s('mes_referencia'), data_emissao: s('data_emissao'),
    leitura_anterior: s('leitura_anterior'), leitura_atual: s('leitura_atual'),
    dias_faturados: numeroParaTexto(r.dias_faturados, 0),
    vencimento: s('vencimento'),
    energia_compensada_kwh: numeroParaTexto(r.energia_compensada_kwh, 1),
    /* SEIS CASAS, e e a unica que pede tanto: e a tarifa cheia, e ela multiplica
     * o kWh para virar o valor impresso. Ver R22. */
    tarifa_kwh: numeroParaTexto(r.tarifa_kwh, 6),
    consumo_nao_compensado_kwh: numeroParaTexto(r.consumo_nao_compensado_kwh, 0),
    consumo_nao_compensado_valor: numeroParaTexto(r.consumo_nao_compensado_valor, 2),
    iluminacao_publica: numeroParaTexto(r.iluminacao_publica, 2),
    bandeira_tarifaria: s('bandeira_tarifaria'),
    bandeira_valor: numeroParaTexto(r.bandeira_valor, 2),
    outros_encargos: numeroParaTexto(r.outros_encargos, 2),
    valor_total_equatorial: numeroParaTexto(r.valor_total_equatorial, 2),
    historico_consumo: Array.isArray(r.historico_consumo)
      ? (r.historico_consumo as Array<Record<string, unknown>>).map((h) => ({
          mes: String(h.mes ?? ''), kwh: numeroParaTexto(h.kwh, 0),
        }))
      : [],
  };
}

export type BoletoLido = {
  linha_digitavel: string;
  pix_copia_e_cola: string;
  beneficiario: string;
  vencimento: string;
  /** Em texto decimal. Vira centavo em quem consome. */
  valor: string;
  nosso_numero: string;
  instrucoes: string[];
};

/** Lê o boleto Sicoob. A conferência dos dígitos é de `linha-digitavel.ts`. */
export async function lerBoletoSicoob(d: DocumentoParaLer): Promise<BoletoLido> {
  const r = await extrair<Record<string, unknown>>(d, INSTRUCOES_DO_BOLETO, SCHEMA_DO_BOLETO);
  return {
    linha_digitavel: String(r.linha_digitavel ?? ''),
    pix_copia_e_cola: String(r.pix_copia_e_cola ?? '').replace(/\s+/g, ''),
    beneficiario: String(r.beneficiario ?? ''),
    vencimento: String(r.vencimento ?? ''),
    valor: numeroParaTexto(r.valor, 2),
    nosso_numero: String(r.nosso_numero ?? ''),
    instrucoes: Array.isArray(r.instrucoes)
      ? (r.instrucoes as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [],
  };
}

/** `true` quando a chave existe. A tela usa isto para nao oferecer o que nao ha. */
export const leitorConfigurado = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
