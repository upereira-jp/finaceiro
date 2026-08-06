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
import {
  linhasDoDocumento, type ConfiguracaoDeCampo, type CampoDeFatura,
  type DadosDaFatura, type LinhaDoDocumento,
} from '../dominio/layout-do-documento.ts';
import {
  FOLHA_PADRAO, conferirLayout, documentoPosicionado,
  type Folha, type Bloco, type Papel, type Orientacao, type DocumentoPosicionado,
} from '../dominio/layout-visual.ts';
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
};

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

  const chave_pix_padrao_id = texto(e.chave_pix_padrao_id);
  if (chave_pix_padrao_id !== null) {
    // A FK composta ja recusaria chave de outro tenant com 23503, mas o erro
    // chegaria como "ReferenciaInvalida" generico. Conferir aqui nomeia o id.
    const existe = await dbt().chave_pix.findFirst({ where: { id: chave_pix_padrao_id, tenant_id } });
    if (!existe) throw new ChavePixNaoEncontrada(chave_pix_padrao_id);
  }

  const dados = { chave_pix_padrao_id, atualizado_em: new Date() };
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
export async function salvarLogo(bruto: Uint8Array) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const id = await dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } });
  if (!id) throw new IdentidadeNaoCadastrada();

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

  await dbt().campo_do_documento.deleteMany({ where: { tenant_id } });
  if (campos.length === 0) return [];   // volta ao PADRAO, que e vazio no banco

  await dbt().campo_do_documento.createMany({
    data: campos.map((c, i) => ({
      tenant_id,
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
  const r = await dbt().campo_do_documento.findMany({
    where: { tenant_id: tenantCorrente() },
    orderBy: [{ ordem: 'asc' }, { campo: 'asc' }],
  });
  return r.map((c: any) => ({
    campo: c.campo as CampoDeFatura, rotulo: c.rotulo, ordem: c.ordem, visivel: c.visivel,
  }));
}

// ----------------------------------------------- a folha e os blocos (mig. 23)
//
// O QUE ISTO ACRESCENTA A `campo_do_documento`, e por que nao a substitui.
//
// `campo_do_documento` resolve QUAIS campos e em que ORDEM - uma lista linear,
// sem coordenada e sem largura. Os blocos daqui sao a MOLDURA: onde essa tabela
// fica na folha, e onde ficam a logo, o pagamento, os textos livres e o total.
// As duas configuracoes sao independentes, e por isso nenhuma migracao de dado
// foi necessaria - quem so configurou campos continua com o documento que tinha.

export class BlocoForaDaPagina extends Error {
  readonly status = 422;
  constructor(detalhe: string) {
    super(`O bloco nao cabe na folha: ${detalhe}`);
    this.name = 'BlocoForaDaPagina';
  }
}

/** `numeric` chega como Decimal/string do driver. A regra 1 proibe float ate em
 *  calculo intermediario - mas medida de papel nao e dinheiro, e o consumo final
 *  e geometria de tela. A conversao acontece AQUI, num lugar so, na fronteira. */
const nmm = (v: unknown): number => Number(v ?? 0);

export async function layout(): Promise<Folha> {
  await exigir('ler');
  const l = await dbt().layout_do_documento.findFirst({ where: { tenant_id: tenantCorrente() } });
  // Sem linha e o caso NORMAL, nao ausencia de dado: a migration 23 nao semeia
  // nada, e o padrao vive em codigo pela mesma razao que o `PADRAO` de campos.
  if (!l) return FOLHA_PADRAO;
  return {
    papel: l.papel as Papel,
    orientacao: l.orientacao as Orientacao,
    margem_topo_mm: nmm(l.margem_topo_mm),
    margem_direita_mm: nmm(l.margem_direita_mm),
    margem_baixo_mm: nmm(l.margem_baixo_mm),
    margem_esquerda_mm: nmm(l.margem_esquerda_mm),
  };
}

export async function blocos(): Promise<Bloco[]> {
  await exigir('ler');
  const r = await dbt().bloco_do_documento.findMany({
    where: { tenant_id: tenantCorrente() },
    orderBy: [{ z: 'asc' }, { id: 'asc' }],
  });
  return r.map((b: any) => ({
    id: b.id, tipo: b.tipo, campo: b.campo, texto: b.texto,
    x_mm: nmm(b.x_mm), y_mm: nmm(b.y_mm),
    largura_mm: nmm(b.largura_mm), altura_mm: nmm(b.altura_mm),
    alinhamento: b.alinhamento, tamanho_pt: b.tamanho_pt, peso: b.peso,
    borda: b.borda, fundo: b.fundo, z: b.z,
  }));
}

export type NovoBloco = Omit<Bloco, 'id'> & { id?: string };

/**
 * Grava a folha e os blocos JUNTOS, e a atomicidade e o ponto.
 *
 * Um `PUT` do layout inteiro em vez de rotas por bloco: com chamadas separadas,
 * trocar de A4 para A5 e reposicionar os blocos seriam dois estados no banco, e
 * o do meio - blocos de A4 numa folha A5 - e justamente o que a conferencia
 * recusa. Quem tenta salvar em duas etapas ou e recusado no meio, ou grava um
 * estado invalido. Aqui e uma escrita so, dentro da transacao da requisicao.
 *
 * `blocos` vazio APAGA os blocos e volta ao layout padrao em codigo - mesma
 * semantica que `definirCampos([])` ja tinha para os campos.
 */
export async function salvarLayout(folha: Folha, novos: ReadonlyArray<NovoBloco>) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();

  /*
   * A CONFERENCIA RODA ANTES DE QUALQUER ESCRITA, e a divisao entre o que recusa
   * e o que so avisa e a mesma da R21-b do conector:
   *
   *   fora_da_pagina  RECUSA - nao ha leitura em que o usuario esteja certo:
   *                   um bloco fora do papel simplesmente nao imprime;
   *   sobreposicao    AVISA - sobrepor pode ser intencional (tarja atras de um
   *                   valor, moldura em volta da tabela), e recusar decidiria
   *                   pelo dono o que ele quer no papel dele;
   *   sem_conteudo    AVISA - bloco vazio ocupa area e nao pinta nada, o que so
   *                   se descobre imprimindo, mas e um layout em construcao.
   */
  const comId = novos.map((b, i) => ({ ...b, id: b.id ?? `novo-${i}` }));
  const problemas = conferirLayout(folha, comId);
  const fora = problemas.filter((p) => p.tipo === 'fora_da_pagina');
  if (fora.length > 0) throw new BlocoForaDaPagina(fora.map((p) => p.detalhe).join(' | '));

  await dbt().layout_do_documento.upsert({
    where: { tenant_id },
    create: { tenant_id, ...paraColunas(folha) },
    update: { ...paraColunas(folha), atualizado_em: new Date() },
  });

  /*
   * APAGA E RECRIA, e nao um diff por bloco. O layout e um documento inteiro -
   * mover tres blocos e apagar um e UMA edicao, nao quatro. Um diff exigiria
   * casar id a id e teria o modo de falha de deixar orfao o bloco que a tela
   * esqueceu de mandar. `deleteMany` + `createMany` sao duas viagens, na mesma
   * transacao, e a trilha da regra 9 grava as duas pontas.
   */
  await dbt().bloco_do_documento.deleteMany({ where: { tenant_id } });
  if (comId.length > 0) {
    await dbt().bloco_do_documento.createMany({
      data: comId.map((b) => ({
        tenant_id, tipo: b.tipo,
        // O CHECK `bloco_conteudo_por_tipo` recusa a combinacao errada no banco;
        // normalizar aqui e o que faz o erro sair como recusa nomeada em vez de
        // 23514 no meio de um `createMany`.
        campo: b.tipo === 'campo' ? b.campo : null,
        texto: b.tipo === 'texto' ? (texto(b.texto) ?? '') : null,
        x_mm: b.x_mm, y_mm: b.y_mm, largura_mm: b.largura_mm, altura_mm: b.altura_mm,
        alinhamento: b.alinhamento, tamanho_pt: b.tamanho_pt, peso: b.peso,
        borda: b.borda, fundo: b.fundo, z: b.z,
      })),
    });
  }
  // Os avisos VOLTAM para quem salvou. Sinal que nao interrompe nada e o que
  // mais facilmente vira silencio - a mesma frase de `scripts/ciclo-crm.ts`.
  return { blocos: comId.length, avisos: problemas.filter((p) => p.tipo !== 'fora_da_pagina') };
}

const paraColunas = (f: Folha) => ({
  papel: f.papel, orientacao: f.orientacao,
  margem_topo_mm: f.margem_topo_mm, margem_direita_mm: f.margem_direita_mm,
  margem_baixo_mm: f.margem_baixo_mm, margem_esquerda_mm: f.margem_esquerda_mm,
});

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
   * O documento POSICIONADO - folha, area imprimivel e blocos com coordenada em
   * milimetros, cada um com o conteudo ja formatado (migration 23).
   *
   * `problemas` viaja DENTRO dele de proposito: um bloco que nao cabe ou dois
   * que se cobrem sao coisas que quem imprime precisa saber, e mandar isso so
   * para log seria o silencio que este projeto ja pagou tres vezes.
   */
  layout: DocumentoPosicionado;
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
   */
  pagamento:
    | {
        tipo: 'boleto'; linha_digitavel: string | null; codigo_barras: string | null;
        pix_copia_e_cola: string | null; qr: QrDoDocumento | null; qr_motivo?: string;
      }
    | {
        tipo: 'pix'; brcode: string; qr: QrDoDocumento | null; qr_motivo?: string;
        conciliacao: 'manual';
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

  const [uc, chaveDaFatura, ident, cfg, bol, folha, blocosDoTenant] = await Promise.all([
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
    layout(),
    blocos(),
  ]);
  /*
   * A LOGO SO E LIDA QUANDO PEDIDA, e a ordem importa: a leitura acima nao a
   * arrasta, que e a razao de ela viver em outra tabela. Pedir o embutido paga o
   * custo de propositio, e quem paga e o consumidor que nao pode fazer a segunda
   * chamada.
   */
  const bin = opcoes.embutirLogo && ident?.logo_mime ? await logo() : null;
  const usina = f.usina_id
    ? await dbt().usina.findFirst({ where: { id: f.usina_id } })
    : null;

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

  return {
    fatura_id: f.id,
    status: f.status,
    competencia: dados.competencia,
    vencimento: dados.vencimento,
    valor_total_centavos: f.valor_total_centavos,
    linhas: linhasDoDocumento(dados, cfg),
    // As duas formas do MESMO documento saem da mesma composicao de dados: a
    // lista e o papel nao podem divergir porque nao ha duas fontes.
    layout: documentoPosicionado(dados, folha, blocosDoTenant, cfg),
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
    pagamento: faixaDePagamento(f, chaveDaFatura, bol),
  };
}

/**
 * A PRECEDENCIA E BOLETO PRIMEIRO, e ela nao e arbitraria: boleto registrado tem
 * `nossoNumero`, entao o pagamento se concilia sozinho. O Pix estatico nao tem
 * `txid` por fatura - o dinheiro chega sem dizer de quem e -, e por isso ele e o
 * SUBSTITUTO enquanto o A1 nao existe, nunca o preferido.
 */
function faixaDePagamento(f: any, chave: any, bol: any): DocumentoDaFatura['pagamento'] {
  if (bol && bol.status === 'registrado') {
    return {
      tipo: 'boleto',
      linha_digitavel: bol.linha_digitavel ?? null,
      codigo_barras: bol.codigo_barras ?? null,
      pix_copia_e_cola: bol.pix_copia_e_cola ?? null,
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
    return { tipo: 'pix', brcode, ...qrDe(brcode), conciliacao: 'manual', apelido: chave.apelido };
  }

  return {
    tipo: 'nenhuma',
    motivo: bol
      ? `Existe boleto nesta fatura, em "${bol.status}", e ela nao carrega chave Pix para substituir a faixa.`
      : 'Sem boleto registrado (falta o certificado A1 - Q-SICOOB-01) e sem chave Pix nesta fatura. '
        + 'A chave e carimbada ao COMPOR o lote: fatura anterior a migration 25, ou tenant sem chave padrao.',
  };
}
