// O DOCUMENTO DE COBRANCA: identidade, logo, layout e a composicao da fatura.
//
// As cinco decisoes da `Q-DOCFATURA-01` (30/07) aterrissam aqui:
//   1. logo em `bytea` em tabela nossa            -> `salvarLogo` / `logo`
//   2. layout CONFIGURAVEL por tenant             -> `definirCampos`
//   3. HTML agora, gerador de PDF depois          -> `paraFatura` devolve DADOS
//   4. entrega manual, rota do CRM preparada      -> por isso `paraFatura` esta AQUI
//   5. sem A1, QR Pix estatico                    -> `pixEstatico` no fim
//
// POR QUE A COMPOSICAO E SERVER-SIDE. A decisao 4 foi "manual agora, com a
// primeira opcao ja preparada" - a primeira opcao e o `PRD` §7.8: endpoint
// exposto pelo financeiro e consumido pelo CRM. Se a composicao morasse no
// `.tsx`, publicar para o CRM seria reescrever, porque o CRM nao roda React.
// `paraFatura` devolve o documento pronto em DADOS; quem imprime decide como.
//
// A REGRA 5 NAO E ASSUNTO DESTE ARQUIVO, e vale dizer por que: chave Pix
// identifica DESTINO e sai impressa no documento. Quem a tem consegue te pagar,
// nao se autenticar como voce. O que e segredo mora em `conector_cobranca.
// credencial_ref`, e nada aqui toca nele.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { emReais } from '../dominio/centavos.ts';
import {
  conferirBoleto, linhaDigitavelFormatada, explicarDivergencia,
  type ConferenciaDoBoleto,
} from '../dominio/linha-digitavel.ts';
import {
  folha1, linhaDoEmissor, TEXTOS_DA_FOLHA_PADRAO,
  type FolhaG3, type EmissorDaFatura, type TextosDaFolha,
} from '../dominio/folha-g3.ts';
import { type TextosDoModelo } from '../dominio/folha-unificada.ts';
import { paraDecimal, decimalParaTexto } from '../dominio/fatura-unificada.ts';
import { validarCNPJ, normalizar } from '../dominio/documento.ts';

import {
  linhasDoDocumento, dataBr,
  type ConfiguracaoDeCampo, type CampoDeFatura,
  type DadosDaFatura, type LinhaDoDocumento,
} from '../dominio/layout-do-documento.ts';
import { pixEstatico } from '../dominio/brcode.ts';
import { svgDoBrCode } from '../dominio/qrcode.ts';
import { conferirChavePix } from '../dominio/chave-pix.ts';

export class ChavePixInvalida extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(
      `A chave Pix nao confere com o tipo declarado: ${motivo} Nada foi gravado. ` +
      'Um QR com chave errada e valido pelo padrao e o aplicativo do banco ACEITA - ' +
      'quem descobre e o cliente, depois de pagar (Pix estatico nao tem txid por fatura).'
    );
    this.name = 'ChavePixInvalida';
  }
}

export class IdentidadeNaoCadastrada extends Error {
  readonly status = 412;
  constructor() {
    super(
      'Este tenant nao tem identidade de cobranca. Cadastre-a na aba Cobranca antes de ' +
      'enviar a logo: o binario pendura na identidade por FK composta, e e ela que carrega ' +
      'a trilha da regra 9.'
    );
    this.name = 'IdentidadeNaoCadastrada';
  }
}

/**
 * O DOCUMENTO NAO SAI PORQUE O BOLETO NAO CONFERE. Decisao do dono em 14/08,
 * `Q-DOCG3-13`: das tres saidas possiveis - so registrar, marcar a fatura, ou
 * recusar a emissao -, a escolhida foi RECUSAR.
 *
 * O QUE ISSO COMPRA, e o que custa. Compra: nao existe caminho que imprima um
 * boleto cuja linha digitavel o banco recusaria no caixa, nem um cujo valor
 * discorde da fatura que o acompanha na mesma folha. Custa: uma divergencia
 * bloqueia a impressao daquela fatura ate alguem resolver - e nao ha como
 * "imprimir assim mesmo", de proposito.
 *
 * MEDIDO ANTES DE DECIDIR: producao tem **zero** boleto registrado hoje, entao a
 * recusa nao torna nenhum documento existente inimprimivel. Era de graca agora e
 * cara depois, e e por isso que entrou agora.
 *
 * 409 e nao 422: o pedido esta correto e o estado e que esta em conflito. Quem
 * chama nao tem o que corrigir na requisicao.
 *
 * NO LOTE ISSO NAO DERRUBA A PILHA: `separarCompostos` ja parte o resultado
 * entre o que compos e o que nao compos, e a fatura que recusa cai no segundo
 * grupo com o motivo - as outras imprimem.
 */
export class BoletoNaoConfere extends Error {
  readonly status = 409;
  readonly divergencias: ConferenciaDoBoleto['divergencias'];
  constructor(faturaId: string, divergencias: ConferenciaDoBoleto['divergencias']) {
    super(
      `O boleto da fatura ${faturaId} nao confere com ela, e o documento nao foi composto: `
      + divergencias.map(explicarDivergencia).join(' ')
      + ' Enquanto isso nao for resolvido no banco, imprimir seria entregar ao cliente '
      + 'um boleto que discorda da fatura impressa ao lado dele.'
    );
    this.name = 'BoletoNaoConfere';
    this.divergencias = divergencias;
  }
}


export class FaturaSemDocumento extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Fatura ${id} nao encontrada neste tenant.`);
    this.name = 'FaturaSemDocumento';
  }
}

// ------------------------------------------------------- o banco de chaves Pix

export type NovaChavePix = {
  apelido: string;
  tipo: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
  chave: string;
  recebedor_nome: string;
  recebedor_cidade: string;
  titular_nome?: string | null;
  titular_documento?: string | null;
  observacao?: string | null;
  ativa?: boolean;
};

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};

export class ChavePixNaoEncontrada extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Chave Pix ${id} nao encontrada neste tenant.`);
    this.name = 'ChavePixNaoEncontrada';
  }
}

/**
 * O CAMPO OBRIGATORIO QUE FALTA, nomeado. Existe porque o `NOT NULL` do banco
 * devolveria a coluna crua ("recebedor_cidade") a quem preencheu um formulario
 * cujo rotulo e "Cidade do recebedor".
 */
function exigirCampos(e: NovaChavePix): {
  apelido: string; recebedor_nome: string; recebedor_cidade: string;
} {
  const apelido = texto(e.apelido);
  const recebedor_nome = texto(e.recebedor_nome);
  const recebedor_cidade = texto(e.recebedor_cidade);
  const faltando = [
    ['apelido', apelido], ['nome do recebedor', recebedor_nome], ['cidade do recebedor', recebedor_cidade],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length > 0) {
    throw Object.assign(
      new TypeError(
        `Falta preencher: ${faltando.join(', ')}. Uma chave Pix so serve completa - `
        + 'o BR Code carrega os tres, e o banco recusa a linha pela metade.'
      ), { status: 422 },
    );
  }
  return { apelido: apelido!, recebedor_nome: recebedor_nome!, recebedor_cidade: recebedor_cidade! };
}

/**
 * Cadastra uma chave. A conferencia contra o TIPO acontece aqui, e nao no banco,
 * porque so a aplicacao sabe o que e digito verificador - ver `chave-pix.ts`.
 *
 * A CHAVE VAI NORMALIZADA. Recusar a mascara mandaria apagar pontos a mao;
 * grava-la mandaria o cliente pagar para lugar nenhum, e esse e o unico erro
 * deste caminho que o aplicativo do banco ACEITA.
 */
export async function criarChavePix(e: NovaChavePix) {
  await exigir('administrar');
  const { apelido, recebedor_nome, recebedor_cidade } = exigirCampos(e);
  const c = conferirChavePix(e.tipo, e.chave);
  if (!c.ok) throw new ChavePixInvalida(c.motivo);

  return dbt().chave_pix.create({
    data: {
      tenant_id: tenantCorrente(),
      apelido, tipo: e.tipo, chave: c.chave, recebedor_nome, recebedor_cidade,
      titular_nome: texto(e.titular_nome),
      titular_documento: texto(e.titular_documento),
      observacao: texto(e.observacao),
      ativa: e.ativa ?? true,
    },
  });
}

/**
 * Edita uma chave. A chave EM SI e editavel de proposito, ao contrario do tier
 * do contrato: um erro de digitacao aqui nao tem outro caminho de conserto, e as
 * faturas que ja a usaram guardam `chave_pix_id` - elas apontam para a LINHA.
 *
 * O que protege o documento ja emitido nao e a imutabilidade da chave, e sim o
 * gatilho `fatura_chave_pix_congelada`: a fatura nao troca de linha depois de
 * emitida. Editar a linha errada continua sendo possivel, e por isso a trilha
 * da regra 9 grava antes e depois.
 */
export async function editarChavePix(id: string, e: NovaChavePix) {
  await exigir('administrar');
  const { apelido, recebedor_nome, recebedor_cidade } = exigirCampos(e);
  const c = conferirChavePix(e.tipo, e.chave);
  if (!c.ok) throw new ChavePixInvalida(c.motivo);

  const atual = await dbt().chave_pix.findFirst({ where: { id, tenant_id: tenantCorrente() } });
  if (!atual) throw new ChavePixNaoEncontrada(id);

  return dbt().chave_pix.update({
    where: { id },
    data: {
      apelido, tipo: e.tipo, chave: c.chave, recebedor_nome, recebedor_cidade,
      titular_nome: texto(e.titular_nome),
      titular_documento: texto(e.titular_documento),
      observacao: texto(e.observacao),
      ativa: e.ativa ?? atual.ativa,
      atualizado_em: new Date(),
    },
  });
}

/** As chaves do tenant, pelo apelido - que e por ele que se escolhe. Traz as
 *  inativas tambem: some-las esconderia a chave que uma fatura antiga usou. */
export async function chavesPix() {
  await exigir('ler');
  return dbt().chave_pix.findMany({
    where: { tenant_id: tenantCorrente() }, orderBy: { apelido: 'asc' },
  });
}

// ------------------------------------------------------------------ identidade

export type NovaIdentidade = {
  chave_pix_padrao_id?: string | null;
  /** Quem EMITE, por extenso. Sai no cabecalho, no rodape e no Beneficiario. */
  razao_social?: string | null;
  /** Com ou sem mascara - normaliza aqui. O DV e conferido, nao so o formato. */
  cnpj?: string | null;
  /*
   * O CONTATO IMPRESSO NO RODAPE DA FOLHA 2 (migration 28).
   *
   * O tipo `ContatoDoEmissor` existia em `folha-unificada.ts` desde 14/08 e
   * NENHUM chamador de producao o preenchia - a rota de composicao chamava
   * `comporFolhas` com quatro argumentos e o quinto caia no default. O rodape da
   * folha do cliente saia com a linha do emissor e mais nada, e nao havia de
   * onde tirar o resto: as colunas nao existiam.
   */
  telefone?: string | null;
  endereco?: string | null;
  email?: string | null;
  site?: string | null;
};

export class CnpjDoEmissorInvalido extends Error {
  readonly status = 422;
  constructor(bruto: string) {
    super(
      `O CNPJ "${bruto}" nao passa no digito verificador. Nada foi gravado. `
      + 'Este numero sai IMPRESSO na fatura, ao lado do aviso que manda o cliente conferir o '
      + 'beneficiario antes de pagar - um CNPJ errado ali e pior que nenhum.'
    );
    this.name = 'CnpjDoEmissorInvalido';
  }
}

/**
 * Grava a identidade. `upsert` por tenant, como o `conector_cobranca`: um tenant,
 * uma identidade.
 *
 * ELA DEIXOU DE GUARDAR A CHAVE e passou a APONTAR para uma (migration 25). As
 * quatro colunas de Pix viviam aqui e comportavam exatamente uma chave, sem nome
 * e sem titular. O que a identidade guarda agora e a ESCOLHA PADRAO - quem
 * decide de fato e `fatura.chave_pix_id`, que congela na emissao.
 *
 * `null` e legitimo e significa "este tenant nao tem Pix": o documento cai na
 * faixa `nenhuma`, com motivo, em vez de sair com um QR que nao resolve.
 */
export async function salvarIdentidade(e: NovaIdentidade) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();

  /*
   * ==========================================================================
   * CAMPO AUSENTE NAO E CAMPO NULO, E CONFUNDIR OS DOIS APAGAVA O EMISSOR.
   *
   * DEFEITO MEDIDO EM 14/08. Este `upsert` escrevia a LINHA INTEIRA a cada
   * chamada, com `texto(e.razao_social)` devolvendo `null` para `undefined`.
   * A tela tem DOIS botoes que chamam esta funcao, e o segundo mandava um campo
   * so:
   *
   *     escolherPadrao(id) -> POST /cobranca/identidade { chave_pix_padrao_id }
   *
   * Consequencia: **trocar a chave Pix padrao apagava razao social e CNPJ**, em
   * silencio, sem erro e sem log. E a folha voltava a sair sem a linha do emissor
   * e sem o aviso contra o golpe do boleto - que era, literalmente, o bloqueio
   * numero 1 da retomada de 14/08.
   *
   * O conserto e distinguir "nao mandou" de "mandou vazio", que e o que
   * `cliente.editar` ja faz. `'campo' in e` responde isso; `e.campo !== undefined`
   * tambem, mas `in` diz o que se quer dizer.
   */
  const dados: Record<string, unknown> = { atualizado_em: new Date() };

  if ('chave_pix_padrao_id' in e) {
    const chave_pix_padrao_id = texto(e.chave_pix_padrao_id);
    if (chave_pix_padrao_id !== null) {
      // A FK composta ja recusaria chave de outro tenant com 23503, mas o erro
      // chegaria como "ReferenciaInvalida" generico. Conferir aqui nomeia o id.
      const existe = await dbt().chave_pix.findFirst({ where: { id: chave_pix_padrao_id, tenant_id } });
      if (!existe) throw new ChavePixNaoEncontrada(chave_pix_padrao_id);
    }
    dados.chave_pix_padrao_id = chave_pix_padrao_id;
  }

  if ('razao_social' in e) dados.razao_social = texto(e.razao_social);

  /* O CNPJ e conferido pelo DV e nao so pelo formato do CHECK da migration 26.
   * A divisao e a mesma da chave Pix: o banco sabe o que e formato, a aplicacao
   * sabe o que e digito verificador - e um CHECK com a aritmetica do DV dentro
   * seria uma segunda implementacao dela, em SQL, envelhecendo separado. */
  if ('cnpj' in e) {
    const cnpjBruto = texto(e.cnpj);
    let cnpj: string | null = null;
    if (cnpjBruto !== null) {
      cnpj = normalizar(cnpjBruto);
      if (!validarCNPJ(cnpj)) throw new CnpjDoEmissorInvalido(cnpjBruto);
    }
    dados.cnpj = cnpj;
  }

  for (const campo of ['telefone', 'endereco', 'email', 'site'] as const) {
    if (campo in e) dados[campo] = texto(e[campo]);
  }

  return dbt().identidade_de_cobranca.upsert({
    where: { tenant_id }, create: { tenant_id, ...dados }, update: dados,
  });
}

/** A identidade SEM o binario da logo - so o metadado. Toda tela e toda rota
 *  passam por aqui, e e por isso que a logo mora em outra tabela: uma leitura
 *  destas nao pode arrastar 300 KB. */
export async function identidade() {
  await exigir('ler');
  // `include` da chave padrao: quem le a identidade quer saber PARA ONDE o
  // dinheiro vai, e uma segunda consulta em cada chamador seria a mesma leitura
  // escrita seis vezes - `paraFatura` ja faz seis em paralelo.
  return dbt().identidade_de_cobranca.findFirst({
    where: { tenant_id: tenantCorrente() }, include: { chave_pix: true },
  });
}

/** A chave PADRAO do tenant, ou `null`. E o que `comporLote` carimba na fatura. */
export async function chavePixPadrao() {
  const ident = await identidade();
  return ident?.chave_pix ?? null;
}

/**
 * O QR DE CONFERENCIA: o mesmo desenho, a partir da identidade e de um valor
 * digitado, SEM fatura.
 *
 * POR QUE ISTO EXISTE, e a medicao que o produziu. Em 30/07 producao tinha
 * **0 contratos, 0 originadores, 0 faturas e 0 identidades de cobranca**, e as
 * 39 UCs sem `data_vencimento`. O unico teste que nenhuma das 964 verificacoes
 * substitui - **ler o QR com uma camera** - estava atras de quatro bloqueios
 * empilhados, sendo que tres deles dependem de insumo humano que nao chegou:
 * CPF/CNPJ dos originadores (`Q-ORIGVEND-01`), os 39 contratos e a
 * `data_vencimento` (`Q-SPEC001-02`).
 *
 * Ou seja: a coisa mais barata de conferir e a que menos podia ser conferida.
 *
 * O QUE ISTO NAO E, e a distincao importa: nao e um "modo de teste" e nao gera
 * fatura, boleto nem linha nenhuma. E a MESMA funcao pura (`pixEstatico` +
 * `svgDoBrCode`) que a fatura usa, alimentada pela identidade REAL do tenant.
 * Um QR desenhado por um caminho paralelo nao provaria nada sobre o de verdade.
 *
 * E POR SER A CHAVE REAL, o valor e obrigatorio e o chamador tem de avisar. Um
 * Pix sem valor deixaria quem le digitar a quantia - o mesmo argumento que
 * `faixaDePagamento` faz para recusar total nulo.
 */
export async function qrDeConferencia(valorCentavos: number) {
  await exigir('ler');
  const ident = await identidade();
  if (!ident) {
    throw Object.assign(
      new Error(
        'Nao ha identidade de cobranca cadastrada neste tenant. O QR sai da chave Pix, do nome e '
        + 'da cidade do recebedor - sem eles nao ha o que desenhar. Cadastre na aba Documento.'
      ), { status: 412 },
    );
  }
  if (!ident.chave_pix) {
    throw Object.assign(
      new Error(
        'A identidade de cobranca nao tem chave Pix padrao escolhida. Cadastre uma chave na aba '
        + 'Documento e marque-a como padrao - o QR sai dela, do nome e da cidade do recebedor.'
      ), { status: 412 },
    );
  }
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw Object.assign(
      new TypeError(
        'O valor em centavos e obrigatorio e maior que zero. Um QR Pix sem valor deixaria quem le '
        + 'digitar a quantia, e e o mesmo motivo pelo qual a fatura sem total nao ganha faixa.'
      ), { status: 422 },
    );
  }

  const brcode = pixEstatico({
    chave: ident.chave_pix.chave,
    recebedorNome: ident.chave_pix.recebedor_nome,
    recebedorCidade: ident.chave_pix.recebedor_cidade,
    valorCentavos,
  });
  return {
    brcode,
    ...qrDe(brcode),
    recebedor: ident.chave_pix.recebedor_nome,
    cidade: ident.chave_pix.recebedor_cidade,
    /* O APELIDO viaja junto, e nao e enfeite: ele e a unica coisa que diz QUAL
     * das chaves cadastradas desenhou este QR. Sem ele, conferir a chave certa
     * exigiria comparar o campo 01 do payload de cor. */
    apelido: ident.chave_pix.apelido,
    valor_centavos: valorCentavos,
    /* A advertencia viaja COM o payload e nao so na tela: o CRM consome esta
     * mesma API, e um consumidor que pintasse o QR sem o aviso poria a chave
     * real do tenant na frente de alguem sem dizer que ela e real. */
    aviso: 'Este QR aponta para a chave Pix REAL deste tenant. Serve para conferir se a camera le '
         + 'o codigo e se recebedor e valor aparecem certos - NAO confirme o pagamento.',
  };
}

// ------------------------------------------------------------------------ logo

/**
 * Grava a logo. O `mime`, o tamanho e o `sha256` NAO vem daqui - o gatilho
 * `auditar_logo_de_cobranca` os deriva do proprio bytea e os carimba na
 * identidade, que e auditada.
 *
 * Consequencia pratica, e ela e a razao de o gatilho existir: um PNG mentindo
 * que e SVG nao passa, e o metadado nunca divergir do conteudo nao depende de
 * este codigo estar certo.
 */
/**
 * ============================================================================
 * A LOGO E CONFERIDA AQUI ANTES DE IR AO BANCO — e ate 14/08 nao era.
 *
 * A defesa do banco esta certa e e forte: o gatilho `app.propagar_metadado_da_logo`
 * deriva o mime da ASSINATURA do arquivo e recusa o que nao for PNG ou JPEG, com
 * uma mensagem escrita para ser lida (*"SVG esta fora de proposito - e documento
 * com script dentro"*).
 *
 * O PROBLEMA ERA O CAMINHO DE VOLTA. `RAISE EXCEPTION` sem SQLSTATE cai em
 * `P0001`, que nao esta no `switch` de `src/http/erros.ts`. Medido: subir um
 * WebP, um GIF, um SVG ou uma imagem de 600 KB devolvia **500 "Erro interno."** -
 * a mensagem que o gatilho escreve com tanto cuidado nunca chegava a ninguem.
 *
 * A divisao e a mesma que `salvarIdentidade` ja faz com o CNPJ: o banco guarda o
 * formato como ULTIMA linha de defesa, e a aplicacao nomeia o erro. As duas
 * conferencias existem, e nenhuma substitui a outra - esta roda antes e fala
 * portugues; a do gatilho pega quem chegar por outro caminho.
 */
export class LogoGrandeDemais extends Error {
  readonly status = 413;
  constructor(bytes: number) {
    super(
      `A imagem tem ${Math.round(bytes / 1024)} KB e o teto e 512 KB - o mesmo do banco. `
      + 'A logo e embutida no HTML do documento, e uma fatura de 600 KB de logo demora a '
      + 'abrir na tela de quem confere e na impressora de quem emite.'
    );
    this.name = 'LogoGrandeDemais';
  }
}

export class LogoNaoEPngNemJpeg extends Error {
  readonly status = 422;
  constructor(assinatura: string) {
    super(
      `A logo nao e PNG nem JPEG: os primeiros bytes sao ${assinatura}. O tipo e reconhecido `
      + 'pelo CONTEUDO e nao pela extensao, entao renomear nao passa. SVG esta fora de '
      + 'proposito: e documento com script dentro, e a logo e embutida no HTML do documento.'
    );
    this.name = 'LogoNaoEPngNemJpeg';
  }
}

/** O mesmo teto do CHECK do banco. Um numero, dois lugares que o conhecem. */
const TETO_DA_LOGO = 512 * 1024;

export async function salvarLogo(bruto: Uint8Array) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const id = await dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } });
  if (!id) throw new IdentidadeNaoCadastrada();

  if (bruto.length > TETO_DA_LOGO) throw new LogoGrandeDemais(bruto.length);
  const png = bruto[0] === 0x89 && bruto[1] === 0x50 && bruto[2] === 0x4e && bruto[3] === 0x47;
  const jpeg = bruto[0] === 0xff && bruto[1] === 0xd8 && bruto[2] === 0xff;
  if (!png && !jpeg) {
    throw new LogoNaoEPngNemJpeg(
      Array.from(bruto.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' '));
  }

  /*
   * `Uint8Array.from` COPIA os bytes, e a copia e o que satisfaz o tipo: o Prisma
   * 7 declara `Bytes` como `Uint8Array<ArrayBuffer>`, e um `Buffer` do node e
   * `Uint8Array<ArrayBufferLike>` - pode estar sobre `SharedArrayBuffer`, que o
   * driver nao aceita. Uma logo tem dezenas de KB; a copia nao e custo.
   */
  const dados = { conteudo: Uint8Array.from(bruto), identidade_id: id.id };
  await dbt().logo_de_cobranca.upsert({
    where: { tenant_id }, create: { tenant_id, ...dados }, update: dados,
  });
  // Devolve a identidade RELIDA: o metadado que interessa a quem chamou (bytes,
  // sha256, mime) foi escrito pelo gatilho e nao esta no objeto acima.
  return dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } });
}

/** O binario. Rota separada de proposito - `Content-Type` de imagem, e nao JSON
 *  com base64 dentro, que dobraria o tamanho pelo mesmo motivo do `to_jsonb`. */
export async function logo() {
  await exigir('ler');
  return dbt().logo_de_cobranca.findFirst({ where: { tenant_id: tenantCorrente() } });
}

export async function removerLogo() {
  await exigir('administrar');
  // O gatilho limpa mime, bytes e sha256 na identidade - o hash de uma imagem
  // que nao existe mais mentiria.
  await dbt().logo_de_cobranca.deleteMany({ where: { tenant_id: tenantCorrente() } });
}

// ---------------------------------------------------------------- o layout

/**
 * Substitui a configuracao de campos INTEIRA.
 *
 * Nao ha "editar um campo": a lista e a unidade. Editar linha a linha exigiria
 * que a tela mandasse diffs, e um diff perdido deixaria o documento com dois
 * campos na mesma posicao ou um campo orfao. Trocar tudo numa transacao e o que
 * torna o estado final igual ao que a pessoa viu na tela.
 *
 * O campo INEXISTENTE nao e problema deste codigo: `campo` e o enum
 * `campo_de_fatura` da migration 19, e o banco recusa o que nao existe. Era o
 * risco que eu tinha nomeado ao recomendar layout fixo, e a decisao foi aceitar o
 * custo - com a validacao no schema, nao em revisao.
 */
export async function definirCampos(
  campos: ReadonlyArray<{ campo: CampoDeFatura; rotulo?: string | null; ordem?: number; visivel?: boolean }>,
) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  /* A CONFIGURACAO PENDE DO MODELO desde a migration 28: o mesmo tenant pode ter
   * "Fatura unificada" mostrando a tarifa e "Fatura simples" escondendo-a. Sem
   * modelo nenhum, `modeloPadraoId` cria o "Padrao" - ver a nota la. */
  const modelo_id = await modeloPadraoId();

  await dbt().campo_do_documento.deleteMany({ where: { tenant_id, modelo_id } });
  if (campos.length === 0) return [];   // volta ao PADRAO, que e vazio no banco

  await dbt().campo_do_documento.createMany({
    data: campos.map((c, i) => ({
      tenant_id, modelo_id,
      campo: c.campo,
      rotulo: texto(c.rotulo),
      // A ordem vem da POSICAO na lista quando nao e declarada: a tela manda os
      // campos na ordem em que a pessoa os arrastou.
      ordem: c.ordem ?? i,
      visivel: c.visivel ?? true,
    })),
  });
  return campos.length;
}

export async function campos(): Promise<ConfiguracaoDeCampo[]> {
  await exigir('ler');
  const modelo_id = (await modeloVigente())?.id;
  const r = modelo_id ? await dbt().campo_do_documento.findMany({
    where: { tenant_id: tenantCorrente(), modelo_id },
    orderBy: [{ ordem: 'asc' }, { campo: 'asc' }],
  }) : [];
  return r.map((c: any) => ({
    campo: c.campo as CampoDeFatura, rotulo: c.rotulo, ordem: c.ordem, visivel: c.visivel,
  }));
}

// ------------------------------------------------------- o documento da fatura

/**
 * O QR pronto para pintar. `svg` e uma string autocontida, montada no SERVIDOR.
 *
 * Vai no payload em vez de a tela desenhar por conta propria pela mesma razao da
 * decisao 4: o CRM vai consumir esta rota e nao roda React. Um QR que so o
 * navegador desenha obrigaria o CRM a portar `src/dominio/qrcode.ts`.
 */
export type QrDoDocumento = {
  svg: string;
  versao: number;
  nivel: string;
  modulos: number;
};

export type DocumentoDaFatura = {
  fatura_id: string;
  status: string;
  competencia: string;
  vencimento: string;
  /** NULO e possivel: a coluna e GENERATED ALWAYS e aceita nulo (medido). */
  valor_total_centavos: number | null;
  /**
   * As linhas, ja na ordem e formatadas.
   *
   * CONTINUA AQUI depois da migration 23, e nao e duplicacao esquecida: e o
   * documento em forma de LISTA, que e o que um consumidor sem geometria precisa
   * - um e-mail em texto, um CSV, um relatorio. `layout` abaixo e o mesmo
   * conteudo em forma de PAPEL. Quem pinta escolhe qual das duas usa, e nenhuma
   * delas obriga o consumidor a portar o motor do outro lado.
   */
  linhas: LinhaDoDocumento[];
  /**
   * A FOLHA 1 DO MODELO G3 - o documento em faixas nomeadas, sem coordenada.
   *
   * TERCEIRA forma do mesmo conteudo, e as tres tem consumidor diferente:
   * `linhas[]` e a LISTA (e-mail, CSV, relatorio), `layout` e o PAPEL POSICIONADO
   * (migration 23) e esta e o PAPEL FIXO. Nao e indecisao: a `Q-DOCFATURA-01`
   * reverteu para layout fixo em 12/08, e as duas convivem enquanto o modelo G3
   * nao esta completo - retirar a posicionada hoje deixaria o sistema sem
   * documento, porque a folha G3 ainda nao tem cinco das sete faixas.
   *
   * A convivencia e TEMPORARIA e datada: sai no passo 6 do §13.4 de
   * `REFERENCIA-fatura-unificada-2026-08-13.md`.
   *
   * `folha.faixas_ausentes` diz o que NAO entrou e por que. Viaja de proposito:
   * uma folha a que faltam duas faixas, sem dizer, parece uma folha pronta.
   */
  folha: FolhaG3;
  /**
   * Metadado da logo, e `data_uri` SO quando o chamador pediu `embutir_logo`.
   *
   * Por que nao vem sempre: base64 custa 33% a mais e a tela ja busca o binario
   * por `GET /cobranca/logo`, com o mime que o gatilho derivou do arquivo. Quem
   * precisa do embutido e o consumidor que nao pode fazer a segunda chamada
   * autenticada - e esse e o CRM (`Q-DOCFATURA-01`, pendencia (c)).
   */
  logo: { mime: string; bytes: number; sha256: string; data_uri?: string } | null;
  /**
   * A faixa de pagamento, e ela tem TRES estados que nao se confundem:
   *   `boleto`  - registrado na Sicoob: linha digitavel e Pix do banco;
   *   `pix`     - sem A1, QR estatico nosso (decisao 5). Conciliacao MANUAL;
   *   `nenhuma` - nao ha boleto e o tenant nao cadastrou chave Pix.
   *
   * `qr` acompanha as duas primeiras quando ha BR Code. `null` com `qr_motivo`
   * preenchido significa que o desenho falhou e o codigo segue pagavel por
   * copia-e-cola - nunca um QR mudo no lugar de um erro.
   *
   * `vencimento_br` E `valor_br` VEM FORMATADOS, e o sufixo e deliberado: o
   * `vencimento` do topo deste tipo e ISO e o `valor_total_centavos` e inteiro, e
   * dois campos com o mesmo nome e formatos diferentes seria pior que dois nomes.
   *
   * POR QUE ELES EXISTEM, ja que os crus estao logo acima: a partir de 12/08 a
   * faixa imprime vencimento e valor DENTRO dela (modelo G3), e a alternativa era
   * a tela formata-los. `documento.tsx` proibe isso na primeira tela do arquivo -
   * *"dinheiro e data ja vem formatados do servidor, e a tela NAO os reformata"* -
   * e o motivo vale inteiro aqui: `emReais` existe nos DOIS lados (`web/src/
   * dinheiro.ts` no browser e `dominio/centavos.ts` aqui - eram TRES ate 14/08,
   * ver o cabecalho de `centavos.ts`), entao formatar na tela poria o mesmo total
   * na tabela e na faixa por dois caminhos que podem divergir. E o CRM, que
   * consome esta rota e nao roda React, nao teria nenhum dos dois.
   *
   * NAO da para tirar isso de `linhas[]`: aquela lista obedece a configuracao de
   * campos do tenant, e quem esconder `vencimento` da tabela esconderia o
   * vencimento da FAIXA junto - que e onde ele mais precisa aparecer.
   */
  pagamento:
    | {
        tipo: 'boleto'; linha_digitavel: string | null; codigo_barras: string | null;
        pix_copia_e_cola: string | null; qr: QrDoDocumento | null; qr_motivo?: string;
        /** As linhas legais do banco, do MODELO. Vazio faz a faixa sumir. */
        rodape_legal: string[];
        /* O IDENTIFICADOR DO BOLETO NO BANCO, e ele passou a viajar em 12/08 com a
         * faixa nova. Nao e dado novo - `boleto.nosso_numero` existe desde a
         * migration da carteira e e o que a Sicoob devolve ao registrar. O que
         * mudou e que agora ele CHEGA ao papel: e por ele que a pessoa acha o
         * titulo quando liga para o banco, e o modelo G3 o imprime ao lado do
         * vencimento. Nulo enquanto o boleto nao registrou. */
        nosso_numero: string | null;
        /* QUEM RECEBE, e ele DEIXOU DE FALTAR em 14/08 com a migration 26. Ate ali
         * `identidade_de_cobranca` nao tinha razao social nem CNPJ, e o campo era
         * omitido de proposito: e a ele que o aviso anti-golpe da folha amarra, e
         * "Beneficiario: —" treina o comportamento oposto ao que o aviso pede.
         * Continua `null` — e nao travessao — enquanto o tenant nao cadastrar. */
        beneficiario: string | null;
        /* A LINHA EM GRUPOS, como ela vem IMPRESSA no boleto do banco:
         * `75691.50043 01727.686907 00000.130013 1 15410000059669`. O campo cru
         * continua ao lado porque quem copia e cola quer os digitos - e quem
         * DIGITA no aplicativo do banco precisa dos grupos, que sao a unica coisa
         * que torna 47 digitos conferiveis a olho. `null` quando nao sao 47:
         * inventar agrupamento sobre linha de outro tamanho e pior que o cru. */
        linha_digitavel_br: string | null;
        vencimento_br: string; valor_br: string;
        /* A CONFERENCIA DO QUE O BANCO DEVOLVEU, e ela nao existia ate 14/08: a
         * linha digitavel era impressa sem que nada perguntasse se ela esta certa.
         * Sao quatro digitos verificadores mais tres comparacoes - a linha contra o
         * `codigo_barras` do proprio banco, e o valor e o vencimento que o codigo
         * de barras CARREGA contra os da fatura. Ver `dominio/linha-digitavel.ts`.
         *
         * NAO E PARA O PAPEL. Vai no payload porque o CRM consome esta rota e
         * precisa saber tanto quanto a nossa tela; quem imprime ignora. Dizer ao
         * cliente que o boleto dele pode estar corrompido nao ajuda o cliente. */
        conferencia: ConferenciaDoBoleto;
      }
    | {
        tipo: 'pix'; brcode: string; qr: QrDoDocumento | null; qr_motivo?: string;
        conciliacao: 'manual';
        vencimento_br: string; valor_br: string;
        /* QUEM RECEBE, por extenso. Ja viajava dentro do BR Code (campo 59) e ja
         * aparecia no painel de conferencia; o que nao havia era a faixa impressa
         * dizer para quem o dinheiro vai sem obrigar quem le a decodificar o
         * payload. O `apelido` abaixo continua sendo o nome INTERNO da chave - os
         * dois nao se substituem: um identifica a chave para quem opera, o outro
         * identifica o destinatario para quem paga. */
        recebedor_nome: string;
        /* QUAL das chaves cadastradas desenhou este QR. Nao e enfeite: com um
         * banco de chaves, "o QR esta certo?" deixou de ter resposta olhando o
         * desenho - o apelido e a unica forma de conferir sem ler o campo 01 do
         * payload de cor. O CRM consome esta mesma rota e ve o mesmo. */
        apelido: string;
      }
    | { tipo: 'nenhuma'; motivo: string };
};

export type OpcoesDoDocumento = {
  /** Embute a logo como `data:` no payload. Ver `logo.data_uri`. */
  embutirLogo?: boolean;
};

/**
 * O QR de um BR Code, sem deixar a falha derrubar o documento.
 *
 * A DECISAO AQUI E RECUSAR EM SILENCIO O DESENHO, NUNCA O DOCUMENTO. O nosso BR
 * Code cabe com folga (medido: o pior possivel da versao 11, e o teto e 12), mas o
 * `pix_copia_e_cola` do boleto vem da SICOOB - e string externa, de tamanho que
 * nao controlamos. Se ela nao couber, a fatura ainda tem de sair: com linha
 * digitavel, com o codigo copiavel e com o motivo escrito ao lado.
 */
function qrDe(brcode: string | null): { qr: QrDoDocumento | null; qr_motivo?: string } {
  if (!brcode) return { qr: null };
  try {
    return { qr: svgDoBrCode(brcode, { nivel: 'M', lado: 220 }) };
  } catch (e) {
    return { qr: null, qr_motivo: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Compoe o documento de uma fatura. E o que a tela imprime e o que o CRM vai
 * consumir - a mesma funcao, para os dois, de propositio.
 *
 * Caminho de LEITURA: `exigir('ler')`. Compor documento nao escreve nada, e por
 * isso pode ser servido a um consumidor externo sem abrir superficie de escrita.
 */
export async function paraFatura(faturaId: string, opcoes: OpcoesDoDocumento = {}): Promise<DocumentoDaFatura> {
  await exigir('ler');
  const tenant_id = tenantCorrente();

  const f = await dbt().fatura.findFirst({ where: { id: faturaId } });
  if (!f) throw new FaturaSemDocumento(faturaId);

  const [uc, chaveDaFatura, ident, cfg, bol, modelo, usina] = await Promise.all([
    dbt().unidade_consumidora.findFirst({ where: { id: f.unidade_consumidora_id }, include: { cliente: true } }),
    /* A CHAVE VEM DA FATURA, e nao da identidade. A identidade so guarda o
      * PADRAO, e o padrao pode ter mudado desde que esta fatura foi emitida -
      * ler dela faria a segunda via sair com destino diferente da primeira, que
      * e exatamente o que o gatilho `fatura_chave_pix_congelada` impede do lado
      * do banco. A identidade continua sendo lida por causa da LOGO. */
    /* Sem chave nao ha consulta a fazer, e o `?? ''` que estava aqui era um
     * defeito meu: string vazia nao e uuid e o Postgres levanta 22P02 - a
     * fatura sem chave (legitima) derrubava o documento inteiro. */
    f.chave_pix_id
      ? dbt().chave_pix.findFirst({ where: { tenant_id, id: f.chave_pix_id } })
      : Promise.resolve(null),
    /* A identidade continua sendo lida, e agora SO pela logo - ela deixou de ser
     * a fonte da chave na migration 25. Sao duas leituras porque sao duas
     * perguntas: "de quem e este documento" e "para onde ESTA fatura cobra". */
    dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } }),
    campos(),
    dbt().boleto.findFirst({ where: { fatura_id: faturaId } }),
    /* OS TEXTOS DO MODELO (migration 28). A previa em lote imprimia a assinatura
     * do topo, o aviso e o rodape legal do BANCO como literais - e as duas
     * ultimas linhas nomeavam uma cooperativa especifica com o codigo dela. */
    modeloVigente(),
    /* A USINA ESTAVA FORA DO `Promise.all` SEM MOTIVO, e ela depende so de `f`,
     * que ja esta em maos desde a linha do `findFirst` acima. Custava uma viagem
     * SEQUENCIAL por documento - e o lote de uma competencia paga isso N vezes. */
    f.usina_id ? dbt().usina.findFirst({ where: { id: f.usina_id } }) : Promise.resolve(null),
  ]);
  /*
   * A LOGO SO E LIDA QUANDO PEDIDA, e a ordem importa: a leitura acima nao a
   * arrasta, que e a razao de ela viver em outra tabela. Pedir o embutido paga o
   * custo de propositio, e quem paga e o consumidor que nao pode fazer a segunda
   * chamada.
   */
  const bin = opcoes.embutirLogo && ident?.logo_mime ? await logo() : null;
  const textosDaFolha: TextosDaFolha = modelo
    ? { assinatura: modelo.assinatura, aviso_titulo: modelo.aviso_titulo,
        aviso_corpo: modelo.aviso_corpo, rodape_legal: modelo.rodape_legal }
    : TEXTOS_DA_FOLHA_PADRAO;

  const iso = (d: unknown): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

  const dados: DadosDaFatura = {
    competencia: iso(f.competencia),
    vencimento: iso(f.vencimento),
    numero_uc: uc?.numero_uc ?? null,
    distribuidora: uc?.distribuidora ?? null,
    cliente_nome: uc?.cliente?.nome ?? null,
    cliente_documento: uc?.cliente?.documento ?? null,
    usina_codigo_geradora: usina?.codigo_geradora ?? null,
    // `numeric` chega como string do driver, e ela segue string ate a tela.
    geracao_kwh_competencia: f.geracao_kwh_competencia?.toString() ?? null,
    percentual_rateio_aplicado: f.percentual_rateio_aplicado?.toString() ?? null,
    consumo_kwh: f.consumo_kwh?.toString() ?? null,
    tarifa_reais_por_kwh: f.tarifa_reais_por_kwh?.toString() ?? null,
    valor_consumo_centavos: f.valor_consumo_centavos,
    valor_tarifas_concessionaria_centavos: f.valor_tarifas_concessionaria_centavos,
    valor_juros_multa_centavos: f.valor_juros_multa_centavos,
    valor_total_centavos: f.valor_total_centavos,
    flag_fatura_cheia: f.flag_fatura_cheia,
  };

  const emissor: EmissorDaFatura = {
    razao_social: ident?.razao_social ?? null, cnpj: ident?.cnpj ?? null,
  };

  return {
    fatura_id: f.id,
    status: f.status,
    competencia: dados.competencia,
    vencimento: dados.vencimento,
    valor_total_centavos: f.valor_total_centavos,
    linhas: linhasDoDocumento(dados, cfg),
    // As duas formas do MESMO documento saem da mesma composicao de dados: a
    // lista e o papel nao podem divergir porque nao ha duas fontes.
    /* UM emissor para os DOIS: a folha e a faixa imprimem o mesmo nome, e le-lo
     * duas vezes de `ident` seria a divergencia que este arquivo evita desde 30/07. */
    // E a TERCEIRA forma, dos mesmos `dados`. Note o argumento: `dados`, e nao
    // `f` - se a folha lesse a fatura crua ela poderia divergir da lista e do
    // papel posicionado, que e a divergencia que este arquivo evita desde 30/07.
    folha: folha1({
      // AS MESMAS linhas de `linhas[]` acima, e nao uma segunda composicao: a
      // lista e a folha sao duas FORMAS do mesmo conteudo, e compo-las duas vezes
      // seria o caminho por onde elas passariam a discordar.
      linhas: linhasDoDocumento(dados, cfg),
      cliente_nome: dados.cliente_nome,
      cliente_documento: dados.cliente_documento,
      numero_uc: dados.numero_uc,
      endereco: enderecoDaUc(uc),
      competencia: dados.competencia,
      vencimento: dados.vencimento,
      valor_total_centavos: f.valor_total_centavos,
      numero_da_fatura: `${dados.numero_uc ?? '000000'}-${dados.competencia.slice(0, 7).replace('-', '')}`,
    }, emissor, textosDaFolha),
    logo: ident?.logo_mime && ident.logo_bytes != null && ident.logo_sha256
      ? {
          mime: ident.logo_mime, bytes: ident.logo_bytes, sha256: ident.logo_sha256,
          // O mime vem da IDENTIDADE, onde o gatilho o gravou a partir da assinatura
          // do arquivo. Nao ha mime escolhido pela aplicacao neste caminho.
          ...(bin?.conteudo
            ? { data_uri: `data:${ident.logo_mime};base64,${Buffer.from(bin.conteudo as Uint8Array).toString('base64')}` }
            : {}),
        }
      : null,
    pagamento: faixaDePagamento(f, chaveDaFatura, bol, emissor, textosDaFolha.rodape_legal),
  };
}

/**
 * A PRECEDENCIA E BOLETO PRIMEIRO, e ela nao e arbitraria: boleto registrado tem
 * `nossoNumero`, entao o pagamento se concilia sozinho. O Pix estatico nao tem
 * `txid` por fatura - o dinheiro chega sem dizer de quem e -, e por isso ele e o
 * SUBSTITUTO enquanto o A1 nao existe, nunca o preferido.
 */
/**
 * CONFERE O BOLETO E RECUSA O DOCUMENTO SE ELE NAO BATER (`Q-DOCG3-13`).
 *
 * A conferencia continua viajando no payload de quem PASSA, e isso nao e
 * redundante com a recusa: `conferida: true` com lista vazia e a diferenca entre
 * "conferido e limpo" e "nao havia o que conferir". O CRM consome esta rota e
 * precisa saber qual dos dois recebeu.
 */
/**
 * O ENDERECO DA UC NUMA LINHA. Vazio vira `null` e nao string com virgulas
 * soltas: `", , /"` impresso no lugar do endereco parece defeito de sistema, que
 * e pior do que o campo ausente que ele de fato e.
 */
function enderecoDaUc(uc: any): string | null {
  if (!uc) return null;
  const rua = [uc.endereco_logradouro, uc.endereco_numero].map((x: unknown) => String(x ?? '').trim())
    .filter(Boolean).join(', ');
  const cidade = [uc.endereco_bairro, uc.endereco_municipio].map((x: unknown) => String(x ?? '').trim())
    .filter(Boolean).join(' — ');
  const uf = String(uc.endereco_uf ?? '').trim();
  const partes = [rua, cidade ? (uf ? `${cidade}/${uf}` : cidade) : uf].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

function exigirBoletoQueConfere(faturaId: string, bol: any, f: any): ConferenciaDoBoleto {
  const c = conferirBoleto({
    linha_digitavel: bol.linha_digitavel ?? null,
    codigo_barras: bol.codigo_barras ?? null,
    /* O MESMO total e a MESMA data que a faixa imprime, em centavos inteiros e em
     * ISO - nao o `valor_br` ja formatado, que seria texto voltando a virar
     * numero para ser comparado. */
    valor_total_centavos: f.valor_total_centavos == null ? null : Number(f.valor_total_centavos),
    vencimento_iso: String(f.vencimento instanceof Date
      ? f.vencimento.toISOString()
      : f.vencimento).slice(0, 10),
  });
  if (c.divergencias.length > 0) throw new BoletoNaoConfere(faturaId, c.divergencias);
  return c;
}

function faixaDePagamento(
  f: any, chave: any, bol: any, emissor: EmissorDaFatura,
  /*
   * O RODAPE LEGAL DO BANCO, do modelo (migration 28). Ele era literal na TELA -
   * `documento.tsx` imprimia "EMITIDO PELA COOPERATIVA CONTRATANTE SEM
   * RESPONSABILIDADE DO BANCOOB" cravado no JSX -, o que punha o texto de um
   * banco especifico na fatura de qualquer tenant, e ainda por cima do lado
   * errado da fronteira: a tela nao decide o que a folha diz.
   *
   * VAZIO FAZ A FAIXA SUMIR, e e o padrao. Texto de banco so e verdade quando ha
   * convenio; afirma-lo sem convenio poe a assinatura de um banco num documento
   * que ele nunca viu.
   */
  rodapeLegal: string[] = [],
): DocumentoDaFatura['pagamento'] {
  /* Formatados UMA vez, pelos mesmos formatadores que compoem `linhas[]` - e nao
   * por um par proprio. Se o documento passar a escrever data ou dinheiro de outro
   * jeito, a faixa acompanha sozinha; um segundo formatador aqui seria a divergencia
   * que este projeto ja registrou duas vezes.
   *
   * O TOTAL NULO SAI "—" E NAO "R$ 0,00", pela R9 e pelo mesmo motivo que o resto
   * do documento: a coluna e GENERATED ALWAYS e aceita nulo, e um total desconhecido
   * impresso como zero e vazio virando numero. Note que o caso quase nao chega aqui
   * - o ramo do Pix abaixo recusa faixa sem valor -, mas o do boleto chega: um
   * boleto registrado tem valor no BANCO, e a coluna gerada daqui pode estar nula. */
  const vencimento_br = dataBr(String(f.vencimento instanceof Date
    ? f.vencimento.toISOString()
    : f.vencimento));
  const valor_br = f.valor_total_centavos == null ? '—' : emReais(Number(f.valor_total_centavos));

  if (bol && bol.status === 'registrado') {
    return {
      tipo: 'boleto',
      linha_digitavel: bol.linha_digitavel ?? null,
      linha_digitavel_br: linhaDigitavelFormatada(bol.linha_digitavel ?? ''),
      codigo_barras: bol.codigo_barras ?? null,
      pix_copia_e_cola: bol.pix_copia_e_cola ?? null,
      nosso_numero: bol.nosso_numero ?? null,
      beneficiario: linhaDoEmissor(emissor),
      vencimento_br, valor_br,
      /* A MESMA data e o MESMO total que a faixa imprime, comparados contra o que
       * o codigo de barras diz. Nao ha segunda fonte aqui: `vencimento_iso` sai
       * do mesmo `f.vencimento` de `vencimento_br` logo acima, e o valor sai do
       * mesmo `f.valor_total_centavos` - em centavos inteiros, sem passar pelo
       * `valor_br` ja formatado, que seria texto voltando a virar numero. */
      conferencia: exigirBoletoQueConfere(f.id, bol, f),
      rodape_legal: rodapeLegal,
      // O Pix DO BANCO tambem ganha desenho. Ele e melhor que o nosso estatico -
      // tem `txid` e concilia sozinho -, entao seria estranho desenhar so o pior.
      ...qrDe(bol.pix_copia_e_cola ?? null),
    };
  }

  /*
   * TOTAL NULO NAO GERA QR, e este e o caso que exigiu medicao:
   * `valor_total_centavos` e GENERATED ALWAYS e aceita nulo. Passa-lo adiante
   * faria `pixEstatico` omitir o campo 54 e produzir um QR SEM VALOR - o cliente
   * digitaria a quantia que quisesse, e o sistema nao teria como saber. Recusar
   * com motivo nomeado e a unica saida honesta.
   */
  if (f.valor_total_centavos == null) {
    return {
      tipo: 'nenhuma',
      motivo: 'A fatura esta sem valor total (a coluna e gerada e veio nula). Sem valor nao ha '
        + 'faixa de pagamento: um QR Pix sem valor deixaria o cliente digitar a quantia.',
    };
  }

  if (chave) {
    /* As tres colunas sao NOT NULL na `chave_pix` - uma linha nao existe pela
     * metade, ao contrario das quatro colunas soltas que ela substituiu. Entao
     * a condicao aqui e a EXISTENCIA da linha, e nao a conferencia campo a
     * campo que o `identidade_pix_completo_ou_ausente` exigia. */
    const brcode = pixEstatico({
      chave: chave.chave,
      recebedorNome: chave.recebedor_nome,
      recebedorCidade: chave.recebedor_cidade,
      valorCentavos: f.valor_total_centavos,
    });
    return {
      tipo: 'pix', brcode, ...qrDe(brcode), conciliacao: 'manual',
      vencimento_br, valor_br,
      recebedor_nome: chave.recebedor_nome, apelido: chave.apelido,
    };
  }

  return {
    tipo: 'nenhuma',
    motivo: bol
      ? `Existe boleto nesta fatura, em "${bol.status}", e ela nao carrega chave Pix para substituir a faixa.`
      : 'Sem boleto registrado (falta o certificado A1 - Q-SICOOB-01) e sem chave Pix nesta fatura. '
        + 'A chave e carimbada ao COMPOR o lote: fatura anterior a migration 25, ou tenant sem chave padrao.',
  };
}

// =========================================================== o modelo de fatura
//
// O TEMPLATE (migration 28). Ele guarda COMO a folha le - assinatura, textos do
// aviso, parametros padrao, rodape legal - e e de quem pendem os campos, os
// campos personalizados e a escolha de qual configuracao esta valendo.
//
// A DIVISAO COM A IDENTIDADE E A DECISAO DO DESENHO: `identidade_de_cobranca` diz
// QUEM emite (uma por tenant); `modelo_de_fatura` diz COMO a folha le (varias).
// A empresa e uma so, e a mesma empresa fatura de mais de um jeito.

/** Os textos do modelo, no formato que `comporFolhas` consome. */
export type TextosDoModeloVigente = TextosDoModelo & {
  id: string;
  nome: string;
  percentual_desconto_padrao: string;
  fator_emissao_padrao: string;
};

export class ModeloNaoEncontrado extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Modelo de fatura ${id} nao encontrado neste tenant.`);
    this.name = 'ModeloNaoEncontrado';
  }
}

/**
 * O ID DO MODELO QUE ESTA VALENDO, criando o "Padrao" se ainda nao houver.
 *
 * A criacao sob demanda e deliberada e vale ser justificada, porque o padrao
 * deste projeto e o contrario - `identidade_de_cobranca` NAO nasce sozinha, e a
 * tela avisa que ela falta.
 *
 * A diferenca e o que a ausencia SIGNIFICA nos dois casos. Identidade ausente e
 * informacao: ninguem sabe quem emite, e inventar um emissor poria um nome
 * errado na fatura. Modelo ausente nao e informacao nenhuma - os textos padrao
 * ja existem em `TEXTOS_PADRAO` e a folha ja sai com eles. Exigir que a pessoa
 * clique em "criar modelo" antes de renomear um campo seria um passo que so
 * existe para o banco.
 *
 * A migration 28 ja criou um para todo tenant que tinha identidade ou campos.
 * Esta funcao cobre o tenant NOVO, que nao existia quando ela rodou.
 */
export async function modeloPadraoId(): Promise<string> {
  const tenant_id = tenantCorrente();
  const ident = await dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } });
  if (ident?.modelo_padrao_id) return ident.modelo_padrao_id;

  const algum = await dbt().modelo_de_fatura.findFirst({
    where: { tenant_id, ativo: true }, orderBy: [{ criado_em: 'asc' }],
  });
  const modelo = algum ?? await dbt().modelo_de_fatura.create({
    data: { tenant_id, nome: 'Padrão', descricao: 'Criado automaticamente no primeiro uso.' },
  });

  /* A identidade passa a APONTAR para ele. `upsert` porque um tenant pode
   * configurar o documento antes de cadastrar quem emite - e nesse caso a linha
   * de identidade nasce so com o ponteiro, que e verdade e nao chute. */
  await dbt().identidade_de_cobranca.upsert({
    where: { tenant_id },
    create: { tenant_id, modelo_padrao_id: modelo.id },
    update: { modelo_padrao_id: modelo.id, atualizado_em: new Date() },
  });
  return modelo.id;
}

/** Os modelos do tenant, o padrao primeiro. */
export async function modelos() {
  await exigir('ler');
  const tenant_id = tenantCorrente();
  const [lista, ident] = await Promise.all([
    dbt().modelo_de_fatura.findMany({ where: { tenant_id }, orderBy: [{ nome: 'asc' }] }),
    dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } }),
  ]);
  return lista.map((m) => ({ ...m, padrao: m.id === ident?.modelo_padrao_id }));
}

export type NovoModelo = {
  nome?: string;
  descricao?: string | null;
  assinatura?: string;
  aviso_titulo?: string;
  aviso_corpo?: string;
  percentual_desconto_padrao?: string;
  fator_emissao_padrao?: string;
  multa_percentual?: string;
  juros_mes_percentual?: string;
  rodape_legal?: string[];
  nota_do_fator?: string;
  ativo?: boolean;
};

/** Os campos que o formulario manda, ja limpos. `undefined` = nao mexer. */
function camposDoModelo(e: NovoModelo) {
  const d: Record<string, unknown> = {};
  for (const k of ['nome', 'assinatura', 'aviso_titulo', 'aviso_corpo', 'nota_do_fator'] as const) {
    if (e[k] !== undefined) d[k] = String(e[k] ?? '').trim();
  }
  if (e.descricao !== undefined) d.descricao = texto(e.descricao);
  /* OS QUATRO NUMEROS SAO DECIMAIS E NAO CENTAVOS - regra 1, segundo paragrafo:
   * percentual e proporcao, fator de emissao e grandeza fisica. Passam por
   * `paraDecimal` para recusar "vinte por cento" antes do banco, e voltam como
   * TEXTO, que e o que `numeric` aceita sem passar por float. */
  const numero = (v: string, campo: string, casas: number) =>
    decimalParaTexto(paraDecimal(v, campo), casas);
  if (e.percentual_desconto_padrao !== undefined) {
    d.percentual_desconto_padrao = numero(e.percentual_desconto_padrao, 'percentual_desconto_padrao', 2);
  }
  if (e.fator_emissao_padrao !== undefined) {
    d.fator_emissao_padrao = numero(e.fator_emissao_padrao, 'fator_emissao_padrao', 6);
  }
  if (e.multa_percentual !== undefined) d.multa_percentual = numero(e.multa_percentual, 'multa_percentual', 2);
  if (e.juros_mes_percentual !== undefined) {
    d.juros_mes_percentual = numero(e.juros_mes_percentual, 'juros_mes_percentual', 2);
  }
  /* O RODAPE LEGAL E UMA LISTA E LINHA VAZIA NAO E LINHA: a tela manda um
   * `textarea` quebrado por `\n`, e uma linha em branco no meio viraria um vao
   * em branco no pe da caixa de pagamento. */
  if (e.rodape_legal !== undefined) {
    d.rodape_legal = (e.rodape_legal ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  }
  if (e.ativo !== undefined) d.ativo = Boolean(e.ativo);
  return d;
}

export async function criarModelo(e: NovoModelo) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const dados = camposDoModelo(e);
  if (!dados.nome) throw new TypeError('nome e obrigatorio: e por ele que o modelo e escolhido.');
  return dbt().modelo_de_fatura.create({ data: { tenant_id, ...(dados as any) } });
}

export async function salvarModelo(id: string, e: NovoModelo) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const existe = await dbt().modelo_de_fatura.findFirst({ where: { id, tenant_id } });
  if (!existe) throw new ModeloNaoEncontrado(id);
  return dbt().modelo_de_fatura.update({
    where: { id },
    data: { ...(camposDoModelo(e) as any), atualizado_em: new Date() },
  });
}

/** Escolher qual modelo vale. E um ato separado de editar, pelo mesmo motivo da
 *  chave Pix: um muda o texto, o outro muda o que a proxima fatura imprime. */
export async function escolherModeloPadrao(id: string) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const existe = await dbt().modelo_de_fatura.findFirst({ where: { id, tenant_id } });
  if (!existe) throw new ModeloNaoEncontrado(id);
  return dbt().identidade_de_cobranca.upsert({
    where: { tenant_id },
    create: { tenant_id, modelo_padrao_id: id },
    update: { modelo_padrao_id: id, atualizado_em: new Date() },
  });
}

/**
 * O MODELO VIGENTE NO FORMATO QUE A COMPOSICAO CONSOME.
 *
 * Sem modelo cadastrado devolve `null`, e `comporFolhas` cai em `TEXTOS_PADRAO`.
 * Isto e leitura pura e nao cria nada: criar dentro de uma composicao faria uma
 * rota de LEITURA escrever, o que quebraria `emRelatorio` e a promessa de que
 * compor nao muda nada.
 */
export async function modeloVigente(): Promise<TextosDoModeloVigente | null> {
  await exigir('ler');
  const tenant_id = tenantCorrente();
  const ident = await dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } });
  const m = ident?.modelo_padrao_id
    ? await dbt().modelo_de_fatura.findFirst({ where: { id: ident.modelo_padrao_id, tenant_id } })
    : await dbt().modelo_de_fatura.findFirst({ where: { tenant_id, ativo: true }, orderBy: [{ criado_em: 'asc' }] });
  if (!m) return null;
  return {
    id: m.id,
    nome: m.nome,
    assinatura: m.assinatura,
    aviso_titulo: m.aviso_titulo,
    aviso_corpo: m.aviso_corpo,
    multa_percentual: String(m.multa_percentual),
    juros_mes_percentual: String(m.juros_mes_percentual),
    rodape_legal: m.rodape_legal,
    nota_do_fator: m.nota_do_fator,
    percentual_desconto_padrao: String(m.percentual_desconto_padrao),
    fator_emissao_padrao: String(m.fator_emissao_padrao),
  };
}

// ================================================= os campos personalizados

export type NovoCampoPersonalizado = {
  chave: string;
  rotulo: string;
  origem?: 'fixo' | 'variavel';
  valor?: string | null;
  ordem?: number;
  visivel?: boolean;
};

export class ChaveDeCampoInvalida extends Error {
  readonly status = 422;
  constructor(chave: string) {
    super(
      `A chave "${chave}" nao serve: use minusculas, numeros e sublinhado, comecando por letra `
      + '(ate 40 caracteres). Ela nao e o rotulo - o rotulo muda, e a chave e o que liga o valor '
      + 'de uma fatura ja registrada ao campo que o imprime.'
    );
    this.name = 'ChaveDeCampoInvalida';
  }
}

/** Os campos personalizados do modelo vigente, na ordem em que saem na folha. */
export async function camposPersonalizados(modeloId?: string) {
  await exigir('ler');
  const tenant_id = tenantCorrente();
  const modelo_id = modeloId ?? (await modeloVigente())?.id;
  if (!modelo_id) return [];
  return dbt().campo_personalizado_da_fatura.findMany({
    where: { tenant_id, modelo_id },
    orderBy: [{ ordem: 'asc' }, { rotulo: 'asc' }],
  });
}

/**
 * Substitui a lista INTEIRA de campos personalizados do modelo.
 *
 * Mesma decisao de `definirCampos`: a lista e a unidade. Um diff perdido
 * deixaria dois campos com a mesma chave ou um campo orfao, e o sintoma sairia
 * impresso na fatura do cliente.
 */
export async function definirCamposPersonalizados(
  lista: ReadonlyArray<NovoCampoPersonalizado>,
) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const modelo_id = await modeloPadraoId();

  const limpos = lista.map((c, i) => {
    const chave = String(c.chave ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(chave)) throw new ChaveDeCampoInvalida(c.chave);
    const origem = c.origem === 'variavel' ? 'variavel' as const : 'fixo' as const;
    const valor = origem === 'fixo' ? texto(c.valor) : null;
    if (origem === 'fixo' && valor === null) {
      throw new TypeError(
        `O campo "${chave}" e de valor FIXO e veio sem valor. Um rotulo com nada embaixo e a `
        + 'mesma classe do travessao que este projeto recusa: use origem "variavel" se o valor '
        + 'muda a cada fatura.'
      );
    }
    return {
      tenant_id, modelo_id, chave,
      rotulo: String(c.rotulo ?? '').trim(),
      origem, valor,
      ordem: c.ordem ?? i,
      visivel: c.visivel ?? true,
    };
  });

  const chaves = new Set(limpos.map((c) => c.chave));
  if (chaves.size !== limpos.length) {
    throw new TypeError('ha duas linhas com a mesma chave - a chave identifica o campo e nao se repete.');
  }

  await dbt().campo_personalizado_da_fatura.deleteMany({ where: { tenant_id, modelo_id } });
  if (limpos.length === 0) return 0;
  await dbt().campo_personalizado_da_fatura.createMany({ data: limpos });
  return limpos.length;
}

/**
 * OS CAMPOS PERSONALIZADOS JA RESOLVIDOS, prontos para a grade da folha 1.
 *
 * `valores` sao os de origem `variavel` desta fatura, digitados na aba de
 * leitura. Os `fixo` vem do proprio cadastro.
 *
 * CAMPO SEM VALOR NAO SAI. E a mesma regra do emissor e do beneficiario: um
 * rotulo com travessao embaixo ensina o cliente a aceitar fatura incompleta. Aqui
 * o custo de omitir e menor ainda - o campo e do tenant, e quem o criou sabe o
 * que ele significa.
 */
export async function camposPersonalizadosResolvidos(
  valores: Record<string, string> = {},
): Promise<Array<{ rotulo: string; valor: string }>> {
  const lista = await camposPersonalizados();
  return lista
    .filter((c) => c.visivel)
    .map((c) => ({
      rotulo: c.rotulo,
      valor: (c.origem === 'fixo' ? c.valor ?? '' : valores[c.chave] ?? '').trim(),
    }))
    .filter((c) => c.valor !== '');
}
