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
import { pixEstatico } from '../dominio/brcode.ts';
import { svgDoBrCode } from '../dominio/qrcode.ts';

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

// ------------------------------------------------------------------ identidade

export type NovaIdentidade = {
  pix_chave?: string | null;
  pix_tipo_chave?: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null;
  pix_recebedor_nome?: string | null;
  pix_recebedor_cidade?: string | null;
};

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
};

/**
 * Grava a identidade. `upsert` por tenant, como o `conector_cobranca`: um tenant,
 * uma identidade.
 *
 * O CHECK `identidade_pix_completo_ou_ausente` do banco recusa Pix pela metade -
 * chave sem nome de recebedor gera um BR Code que alguns aplicativos aceitam e
 * outros recusam, e esse modo de falha aparece no celular do cliente. Aqui os
 * quatro campos sao normalizados juntos para o erro sair do lado certo.
 */
export async function salvarIdentidade(e: NovaIdentidade) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const dados = {
    pix_chave: texto(e.pix_chave),
    pix_tipo_chave: texto(e.pix_tipo_chave) as NovaIdentidade['pix_tipo_chave'] ?? null,
    pix_recebedor_nome: texto(e.pix_recebedor_nome),
    pix_recebedor_cidade: texto(e.pix_recebedor_cidade),
    atualizado_em: new Date(),
  };
  return dbt().identidade_de_cobranca.upsert({
    where: { tenant_id }, create: { tenant_id, ...dados }, update: dados,
  });
}

/** A identidade SEM o binario da logo - so o metadado. Toda tela e toda rota
 *  passam por aqui, e e por isso que a logo mora em outra tabela: uma leitura
 *  destas nao pode arrastar 300 KB. */
export async function identidade() {
  await exigir('ler');
  return dbt().identidade_de_cobranca.findFirst({ where: { tenant_id: tenantCorrente() } });
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
  /** As linhas, ja na ordem e formatadas. */
  linhas: LinhaDoDocumento[];
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
    | { tipo: 'pix'; brcode: string; qr: QrDoDocumento | null; qr_motivo?: string; conciliacao: 'manual' }
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

  const [uc, ident, cfg, bol] = await Promise.all([
    dbt().unidade_consumidora.findFirst({ where: { id: f.unidade_consumidora_id }, include: { cliente: true } }),
    dbt().identidade_de_cobranca.findFirst({ where: { tenant_id } }),
    campos(),
    dbt().boleto.findFirst({ where: { fatura_id: faturaId } }),
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
    pagamento: faixaDePagamento(f, ident, bol),
  };
}

/**
 * A PRECEDENCIA E BOLETO PRIMEIRO, e ela nao e arbitraria: boleto registrado tem
 * `nossoNumero`, entao o pagamento se concilia sozinho. O Pix estatico nao tem
 * `txid` por fatura - o dinheiro chega sem dizer de quem e -, e por isso ele e o
 * SUBSTITUTO enquanto o A1 nao existe, nunca o preferido.
 */
function faixaDePagamento(f: any, ident: any, bol: any): DocumentoDaFatura['pagamento'] {
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

  if (ident?.pix_chave && ident.pix_recebedor_nome && ident.pix_recebedor_cidade) {
    const brcode = pixEstatico({
      chave: ident.pix_chave,
      recebedorNome: ident.pix_recebedor_nome,
      recebedorCidade: ident.pix_recebedor_cidade,
      valorCentavos: f.valor_total_centavos,
    });
    return { tipo: 'pix', brcode, ...qrDe(brcode), conciliacao: 'manual' };
  }

  return {
    tipo: 'nenhuma',
    motivo: bol
      ? `Existe boleto nesta fatura, em "${bol.status}", e nao ha chave Pix cadastrada para substituir a faixa.`
      : 'Sem boleto registrado (falta o certificado A1 - Q-SICOOB-01) e sem chave Pix na identidade de cobranca.',
  };
}
