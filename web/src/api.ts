// O UNICO lugar do front que fala com a API. Um lugar para errar, um para
// consertar - e o mesmo argumento de `src/crm/leitura.ts` no servidor.
//
// DUAS COISAS QUE ELE CARREGA EM TODA CHAMADA, e esquecer qualquer uma e o modo
// de falha silencioso:
//
//   Authorization: Bearer <jwt>   sem ele, 401 - barulhento, facil de achar
//   x-tenant-id: <uuid>           sem ele, o servidor usa o UNICO vinculo do
//                                 login; com dois vinculos, `selecionarTenant`
//                                 recusa. Nunca "escolhe um" em silencio.
//
// O ERRO DA API E TRADUZIDO NUMA CLASSE, e nao num `alert`. O servidor ja
// devolve `{ erro, mensagem }` com o nome do erro de negocio - `RateioAcimaDoTeto`,
// `ContratoVigenteJaExiste`, `RepasseBloqueado` -, e essas mensagens foram
// escritas para serem lidas por quem opera. Substitui-las por "erro ao salvar"
// jogaria fora o trabalho que o servidor fez.

export class ErroDaApi extends Error {
  readonly status: number;
  readonly nome: string;
  constructor(status: number, nome: string, mensagem: string) {
    super(mensagem);
    this.status = status;
    this.nome = nome;
    this.name = 'ErroDaApi';
  }
  /** 401 e 403 pedem acao diferente de 422: reautenticar contra corrigir o dado. */
  get ehDeSessao(): boolean { return this.status === 401; }

  /**
   * O QUE A PESSOA LE, e nao e a mensagem do servidor.
   *
   * O servidor responde "Credencial invalida." e isso e correto do lado dele: a
   * mensagem e generica de proposito, porque dizer "expirado" versus "assinatura
   * invalida" a quem tenta entrega mais do que ele precisa. O motivo real vai
   * para o log de la (30/07).
   *
   * Do lado de ca, "Credencial invalida." e uma frase que nao diz o que fazer -
   * e a pessoa esta olhando para a propria tela, ja logada. O que ela precisa
   * ouvir e que a sessao venceu e que basta entrar de novo.
   */
  get mensagemDeSessao(): string {
    return 'Sua sessão expirou. Entre de novo para continuar.';
  }
}

type Contexto = { token: () => string | null; tenantId: () => string | null };

let contexto: Contexto = { token: () => null, tenantId: () => null };

/** Ligado uma vez, no arranque, pelo provedor de sessao. */
export function ligarContexto(c: Contexto): void { contexto = c; }

/*
 * O QUE ACONTECE QUANDO A SESSAO ACABA — e ate 30/07/2026 a resposta era "nada",
 * o que e o defeito que este bloco conserta.
 *
 * `ErroDaApi.ehDeSessao` existia desde que esta camada foi escrita, com o
 * comentario "401 e 403 pedem acao diferente de 422: reautenticar contra
 * corrigir o dado". Medido em 30/07: **ninguem o chamava**. O 401 descia como
 * erro comum ate `useDados`, e cada painel da tela pintava "Credencial
 * invalida." numa caixa vermelha. Uma tela com seis blocos mostrava a mesma
 * frase seis vezes, e nenhuma delas dizia o que fazer.
 *
 * O relato do dono foi literal: *"esta destruindo a UX"*. E o diagnostico e pior
 * que a estetica — a pessoa NAO tem como sair daquele estado pela tela. Recarregar
 * nao adianta: a sessao vencida vive no `localStorage`, e um F5 a le de volta.
 * So sair e entrar resolve, e nada na tela dizia isso.
 *
 * UMA VEZ SO, E NAO POR CHAMADA. Uma tela dispara varias requisicoes em
 * paralelo, e todas falham juntas quando o token vence. Sem a trava, seriam N
 * `signOut()` concorrentes e N re-renders.
 */
type AoPerderSessao = (motivo: string) => void;
let aoPerderSessao: AoPerderSessao = () => {};
let jaAvisou = false;

export function ligarPerdaDeSessao(f: AoPerderSessao): void { aoPerderSessao = f; }

/** Chamado pelo provedor quando uma sessao NOVA e estabelecida: rearma o aviso. */
export function rearmarPerdaDeSessao(): void { jaAvisou = false; }

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const cabecalhos: Record<string, string> = {};
  const token = contexto.token();
  if (token) cabecalhos['authorization'] = `Bearer ${token}`;
  const tenant = contexto.tenantId();
  if (tenant) cabecalhos['x-tenant-id'] = tenant;
  if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';

  const r = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  if (r.status === 204) return undefined as T;

  const texto = await r.text();
  let dado: any;
  try { dado = texto ? JSON.parse(texto) : undefined; } catch { dado = undefined; }

  if (!r.ok) {
    const e = new ErroDaApi(
      r.status,
      dado?.erro ?? 'ErroDesconhecido',
      // Sem mensagem no corpo, o status sozinho e melhor do que uma frase
      // inventada: "erro ao salvar" esconderia qual das 78 rotas falhou.
      dado?.mensagem ?? `${metodo} ${caminho} devolveu ${r.status}`,
    );
    avisarSePerdeuSessao(e);
    throw e;
  }
  return dado as T;
}

/**
 * O UNICO lugar que decide "a sessao acabou". Chamado pelos dois pontos de erro
 * desta camada - o JSON e o binario -, porque a logo do documento passa pelo
 * segundo e um 401 la significa a mesma coisa.
 *
 * `throw` continua acontecendo: a tela que quiser tratar o erro pode. O que muda
 * e que alguem, em algum lugar, agora SABE que a sessao caiu.
 */
function avisarSePerdeuSessao(e: ErroDaApi): void {
  if (!e.ehDeSessao || jaAvisou) return;
  jaAvisou = true;
  aoPerderSessao(e.mensagemDeSessao);
}

/**
 * Resposta BINARIA, com os mesmos cabecalhos de sessao.
 *
 * Existe por uma rota so - a logo do documento. Um `<img src="/api/cobranca/logo">`
 * NAO funcionaria: a tag nao carrega `Authorization` nem `x-tenant-id`, e a
 * resposta seria 401. A saida e buscar aqui e usar `URL.createObjectURL`.
 */
export async function buscarBinario(caminho: string): Promise<Blob> {
  const cabecalhos: Record<string, string> = {};
  const token = contexto.token();
  if (token) cabecalhos['authorization'] = `Bearer ${token}`;
  const tenant = contexto.tenantId();
  if (tenant) cabecalhos['x-tenant-id'] = tenant;

  const r = await fetch(`/api${caminho}`, { headers: cabecalhos });
  if (!r.ok) {
    const texto = await r.text();
    let dado: any;
    try { dado = texto ? JSON.parse(texto) : undefined; } catch { dado = undefined; }
    const e = new ErroDaApi(r.status, dado?.erro ?? 'ErroDesconhecido',
      dado?.mensagem ?? `GET ${caminho} devolveu ${r.status}`);
    avisarSePerdeuSessao(e);
    throw e;
  }
  return r.blob();
}

export const api = {
  get:   <T>(c: string) => chamar<T>('GET', c),
  post:  <T>(c: string, corpo?: unknown) => chamar<T>('POST', c, corpo ?? {}),
  put:   <T>(c: string, corpo?: unknown) => chamar<T>('PUT', c, corpo ?? {}),
  patch: <T>(c: string, corpo?: unknown) => chamar<T>('PATCH', c, corpo ?? {}),
  del:   <T>(c: string) => chamar<T>('DELETE', c),
};

// ---------------------------------------------------------------- tipos
// Espelham o que as rotas devolvem. Deliberadamente PARCIAIS: so o que a tela
// usa. Copiar o modelo inteiro criaria uma segunda definicao do schema, que
// diverge do banco no primeiro `db pull` e ninguem percebe.

export type Sessao = {
  usuarioId: string; nome: string; email: string; tier: string | null;
  tenants: Array<{ tenantId: string; razaoSocial: string; papel: string }>;
};

/**
 * O CLIENTE COMO A ABA O EDITA. Cresceu em 17/08/2026, e o motivo e a fila da
 * primeira fatura: `documento` estava NULO em 29 de 29 linhas da carteira ativa,
 * e o unico caminho para preenche-lo era `npm run documentos` — um script rodado
 * de um Codespace contra producao, por quem tem o repositorio clonado.
 *
 * OS TRES CAMPOS DE ESTADO DO DOCUMENTO vem juntos porque significam coisas
 * diferentes e a tela precisa das tres (SPEC-001 R7/R8/R9):
 *
 *   `documento`            o que esta gravado, normalizado
 *   `documento_validado`   passou no digito E foi coletado localmente. E O UNICO
 *                          que destrava a ativacao do contrato (R9) — semente do
 *                          CRM entra FALSE mesmo com digito correto (R8)
 *   `documento_origem`     de onde veio. E o que explica um documento correto que
 *                          continua nao valendo
 */
export type Cliente = {
  id: string; nome: string; documento: string | null; ativo: boolean;
  documento_tipo?: 'cpf' | 'cnpj' | null;
  documento_validado?: boolean;
  documento_origem?: 'crm_semente' | 'coleta_local' | null;
  telefone?: string | null;
  email?: string | null;
};

export type UnidadeConsumidora = {
  id: string; cliente_id: string; numero_uc: string; distribuidora: string;
  usina_id: string | null; percentual_rateio: string | null;
  data_vencimento: string | null;
  /** R$/kWh DESTA UC, seis casas (migration 30). Substituiu a aba Tarifas em
   *  14/08: a granularidade real e por cliente, medida em 41 UCs. NULO faz a
   *  composicao do lote LEVANTAR (R26) em vez de faturar por zero. */
  tarifa_reais_por_kwh: string | null;
  /** NOSSO cadastro: `ativa | suspensa | cancelada`. Nao diz nada sobre o CRM. */
  status: string;
  /**
   * O ENDERECO DO PAGADOR, e ele e da UC e nao do cliente. `PENDENCIAS.md` §2.a
   * item 7: 0 de 29 em producao, e ate 17/08/2026 so entrava por
   * `npm run enderecos` — script de Codespace. E o endereco que vai no boleto.
   */
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_municipio?: string | null;
  endereco_uf?: string | null;
  endereco_cep?: string | null;
  /** Espelho do CRM (migration 24). Ver `web/src/unidades-regras.ts` - "ativo"
   *  significava duas coisas, e a tela mostrava a errada. */
  rateio_situacao?: string | null;
  rateio_em_troca_titularidade?: boolean | null;
  /** Preenchido quando a UC veio do rateio do CRM. UC local nao tem. */
  crm_usina_cliente_id?: string | null;
};

export type Usina = {
  id: string; codigo_geradora: string; apelido: string | null; distribuidora: string;
  dono_usina_id: string | null; status: string;
};

export type DonoUsina = {
  id: string; nome: string; natureza: string; documento: string;
  chave_pix: string | null; banco: string | null; ativo: boolean;
};

export type Contrato = {
  id: string; cliente_id: string; unidade_consumidora_id: string; usina_id: string;
  originador_id: string | null; data_fechamento: string; status: string;
  faturas_cheias_pagas: number;
};

export type Originador = { id: string; nome: string; tipo: string; ativo: boolean };

export type RegraRepasse = {
  id: string; usina_id: string; percentual: string;
  vigencia_inicio: string; vigencia_fim: string | null;
};

/**
 * A fatura, como as rotas de carteira a devolvem.
 *
 * DINHEIRO CHEGA EM CENTAVOS INTEIROS e grandeza fisica chega como STRING - a
 * regra 1 nas duas direcoes. `geracao_kwh_competencia`, `consumo_kwh` e
 * `tarifa_reais_por_kwh` sao `numeric` no Postgres e o driver os entrega como
 * texto de proposito: converter para `number` aqui reintroduziria o float que a
 * regra proibe, e a tarifa tem seis casas.
 */
export type Fatura = {
  id: string; unidade_consumidora_id: string; usina_id: string; contrato_id: string;
  competencia: string;
  geracao_kwh_competencia: string | null; percentual_rateio_aplicado: string | null;
  consumo_kwh: string | null; tarifa_reais_por_kwh: string | null;
  valor_consumo_centavos: number; valor_tarifas_concessionaria_centavos: number;
  valor_juros_multa_centavos: number;
  /** NULO e possivel: a coluna e GENERATED ALWAYS e aceita nulo (medido em 30/07).
   *  `emReais(null)` devolve "—", que e o certo - total desconhecido nao e zero. */
  valor_total_centavos: number | null;
  status: 'rascunho' | 'emitida' | 'paga' | 'vencida' | 'cancelada' | 'negociada';
  flag_fatura_cheia: boolean; vencimento: string;
  emitida_em: string | null; cancelada_em: string | null; motivo_cancelamento: string | null;
};

export type Boleto = {
  id: string; fatura_id: string;
  nosso_numero: string | null; linha_digitavel: string | null; codigo_barras: string | null;
  pix_copia_e_cola: string | null; pix_txid: string | null;
  valor_registrado_centavos: number; vencimento: string;
  status: 'pendente' | 'registrado' | 'liquidado' | 'baixado' | 'cancelado' | 'erro';
  registrado_em: string | null; tentativas: number; ultimo_erro: string | null;
  /**
   * De onde a linha veio (migration 32). `api_sicoob`: registrado por nos pela
   * porta de cobranca. `importado`: emitido a mao no portal do banco e transcrito
   * para ca — o sistema nao falou com a Sicoob em momento nenhum.
   *
   * A tela PRECISA mostrar isto: "registrado" sem dizer por quem esconde
   * justamente o que quem opera usa para saber onde conferir o titulo.
   */
  origem: 'api_sicoob' | 'importado';
};

/**
 * O QUE O SERVIDOR DIZ SOBRE UMA LINHA DIGITAVEL COLADA, antes de grava-la.
 * Espelho de `ConferenciaDaImportacao` em `src/dominio/boleto-importado.ts`.
 *
 * A CONTA NAO E REFEITA AQUI, e isso e deliberado: os quatro digitos
 * verificadores, a remontagem dos 44 e a leitura do valor e do vencimento de
 * dentro deles moram no dominio, do lado do servidor. Reimplementa-los no
 * navegador seria a segunda implementacao da mesma aritmetica — o defeito que
 * este projeto ja colapsou quatro vezes com "centavos -> R$".
 */
export type ConferenciaDoBoletoImportado = {
  aceita: boolean;
  recusa: { tipo: 'sem_linha' | 'linha_invalida' | 'divergencia' | 'pix_nao_confere' } | null;
  /** Uma frase por problema, ja escritas para quem opera. Vazio quando aceita. */
  frases: string[];
  digitos: string;
  codigo_barras: string | null;
  valor_centavos: number | null;
  vencimento: string | null;
  nosso_numero: string | null;
  pix_copia_e_cola: string | null;
};

export type Repasse = { dono: string; competencia: string; itens: number; valor_centavos: number };

export type Comissao = {
  originador: string; competencia: string; parcela_comissao: number;
  itens: number; valor_centavos: number;
};

/** kWh como STRING, pelo mesmo motivo da `Fatura`: e grandeza fisica. */
export type UsoDaUsina = {
  codigo_geradora: string; competencia: string;
  geracao_kwh: string | null; consumo_faturado_kwh: string | null; saldo_kwh: string | null;
};

/** Uma linha do banco de chaves (migration 25). O `apelido` e o que se escolhe:
 *  uma chave Pix nao se reconhece de cor, e conferir CNPJ digito a digito na
 *  hora de faturar e onde o erro passa sem ninguem ver. */
export type ChavePix = {
  id: string;
  apelido: string;
  tipo: string;
  chave: string;
  recebedor_nome: string;
  recebedor_cidade: string;
  titular_nome: string | null;
  titular_documento: string | null;
  observacao: string | null;
  ativa: boolean;
};

export type IdentidadeDeCobranca = {
  id: string;
  /** A chave SUGERIDA ao compor. Quem decide de fato e `fatura.chave_pix_id`,
   *  que congela na emissao - por isso trocar aqui nao mexe no ja composto. */
  chave_pix_padrao_id: string | null;
  chave_pix: ChavePix | null;
  /** Metadado da logo. O binario vem por `GET /cobranca/logo`, nunca aqui. */
  logo_mime: string | null;
  logo_bytes: number | null;
  logo_sha256: string | null;
  /* QUEM EMITE, por extenso (migration 26). Sai no cabecalho da folha, no rodape
   * e no campo Beneficiario da faixa - e e a ele que o aviso anti-golpe amarra.
   * Nulo enquanto o tenant nao cadastrou, e nulo NAO vira travessao na folha. */
  razao_social: string | null;
  /** 14 digitos, sem mascara. A tela formata; o banco guarda cru. */
  cnpj: string | null;
  /* O CONTATO IMPRESSO NO RODAPE DA FOLHA 2 (migration 28). O tipo
   * `ContatoDoEmissor` existia no dominio desde 14/08 e NINGUEM o preenchia -
   * nem havia colunas. O rodape da folha do cliente saia com a linha do emissor
   * e mais nada. */
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  site: string | null;
  /** O modelo que esta valendo. `null` = o tenant ainda nao criou nenhum, e a
   *  folha cai nos textos padrao do dominio. */
  modelo_padrao_id: string | null;
  atualizado_em: string;
};

export type CampoDoDocumento = {
  campo: string;
  rotulo: string | null;
  ordem: number;
  visivel: boolean;
};

export type LinhaDoDocumento = {
  campo: string;
  rotulo: string;
  /** JA formatado pelo servidor - a tela nao formata dinheiro nem data de novo. */
  valor: string;
  tipo: 'texto' | 'data' | 'competencia' | 'dinheiro' | 'decimal' | 'booleano';
  /** `true` quando o dado NAO EXISTE. A tela mostra "—", nunca zero. */
  ausente: boolean;
};

/**
 * O QR pronto para pintar, montado no SERVIDOR (`src/dominio/qrcode.ts`).
 *
 * A tela NAO codifica QR, e isso e a decisao 4 da `Q-DOCFATURA-01`: o CRM consome
 * a mesma rota e nao roda React. Se o desenho nascesse aqui, o CRM precisaria
 * portar o codificador inteiro - Reed-Solomon, mascaras e tudo.
 */
/** O retorno de `GET /cobranca/qr-de-conferencia`. Existe para o teste de campo
 *  do QR nao depender de haver fatura — ver o cabecalho de `qrDeConferencia`. */
export type QrDeConferencia = {
  brcode: string;
  qr: QrDoDocumento | null;
  qr_motivo?: string;
  recebedor: string;
  cidade: string;
  valor_centavos: number;
  aviso: string;
};

export type QrDoDocumento = {
  svg: string;
  versao: number;
  nivel: string;
  modulos: number;
};
// ===================================================== a fatura unificada
//
// Espelha `src/dominio/fatura-unificada.ts` e `folha-unificada.ts`. A tela NAO
// calcula e NAO compoe: manda os campos, recebe a conta e as duas folhas. E a
// mesma regra do resto deste arquivo, e aqui ela tem peso extra - recalcular na
// tela seria a segunda implementacao da conta, em float, contra a regra 1.

/** Os 21 campos lidos da fatura da Equatorial. Todos STRING, como saem do leitor. */
export type CamposDaFatura = {
  cliente: string; documento: string; endereco: string; unidade_consumidora: string;
  classificacao: string; mes_referencia: string; data_emissao: string;
  leitura_anterior: string; leitura_atual: string; dias_faturados: string;
  vencimento: string; energia_compensada_kwh: string; tarifa_kwh: string;
  consumo_nao_compensado_kwh: string; consumo_nao_compensado_valor: string;
  iluminacao_publica: string; bandeira_tarifaria: string; bandeira_valor: string;
  outros_encargos: string; valor_total_equatorial: string;
  historico_consumo: Array<{ mes: string; kwh: string }>;
};

export const CAMPOS_DA_FATURA_VAZIOS: CamposDaFatura = {
  cliente: '', documento: '', endereco: '', unidade_consumidora: '', classificacao: '',
  mes_referencia: '', data_emissao: '', leitura_anterior: '', leitura_atual: '',
  dias_faturados: '', vencimento: '', energia_compensada_kwh: '', tarifa_kwh: '',
  consumo_nao_compensado_kwh: '', consumo_nao_compensado_valor: '', iluminacao_publica: '',
  bandeira_tarifaria: '', bandeira_valor: '', outros_encargos: '',
  valor_total_equatorial: '', historico_consumo: [],
};

export type ParametrosDaEmissao = { percentual_desconto: string; fator_emissao: string };
export const PARAMETROS_PADRAO: ParametrosDaEmissao = {
  percentual_desconto: '20', fator_emissao: '0,029',
};

export type BoletoLido = {
  linha_digitavel: string; pix_copia_e_cola: string; beneficiario: string;
  vencimento: string; valor: string; nosso_numero: string; instrucoes: string[];
};
export const BOLETO_LIDO_VAZIO: BoletoLido = {
  linha_digitavel: '', pix_copia_e_cola: '', beneficiario: '', vencimento: '',
  valor: '', nosso_numero: '', instrucoes: [],
};

/** A conta, em centavos inteiros. Vem do servidor; a tela nunca a refaz. */
export type ContaDaFatura = {
  compensada_kwh: string; tarifa_kwh: string; tarifa_g3: string; percentual_desconto: string;
  integral_centavos: number; desconto_centavos: number; energia_g3_centavos: number;
  total_equatorial_centavos: number; nao_compensado_centavos: number;
  iluminacao_publica_centavos: number; bandeira_centavos: number; demais_centavos: number;
  outros_encargos_lidos_centavos: number; residuo_discorda: boolean;
  total_centavos: number; sem_g3_centavos: number;
  co2_kg: string; consumo_do_mes_kwh: string;
};

export type Par = { rotulo: string; valor: string };
export type LinhaDetalhada = {
  descricao: string; kwh: string; tarifa: string;
  tarifa_cheia?: string; valor: string; valor_cheio?: string;
};
export type BarraDoHistorico = { mes: string; kwh: string; altura_pct: number; atual: boolean };

export type FolhaUnificada = {
  numero_da_fatura: string;
  folha1: {
    cabecalho: { assinatura: string; emissor: string | null };
    cliente: { nome: string; documento: string; meta: Par[] };
    cartoes: {
      sem_g3: { rotulo: string; valor: string };
      desconto: { rotulo: string; percentual: string; valor: string };
      com_g3: { rotulo: string; valor: string };
      nota: string;
    } | null;
    /** Por que os tres cartoes e o detalhamento nao sairam. Vem do SERVIDOR e
     *  aparece so na TELA - ate 14/08 a tela reimplantava a condicao com
     *  `.trim()` e ela nunca era verdadeira, porque o extrator devolve
     *  "0.000000" quando a linha nao existe, e isso e truthy. */
    cartoes_motivo: string | null;
    total: { rotulo: string; detalhe: string; valor: string; vencimento: string; nota: string };
    aviso: { titulo: string; corpo: string };
    detalhamento: {
      titulo: string;
      energia: { titulo: string; linhas: LinhaDetalhada[] };
      repasses: { titulo: string; nota: string; linhas: LinhaDetalhada[]; subtotal: string };
      total: { rotulo: string; valor: string };
    } | null;
    rodape: { emissor: string | null; paginacao: string };
  };
  folha2: {
    cabecalho: { emissor: string | null; identificacao: string };
    historico: { titulo: string; nota: string; barras: BarraDoHistorico[] } | null;
    historico_motivo: string | null;
    indicadores: {
      economia: { rotulo: string; valor: string; nota: string };
      consumo: { rotulo: string; valor: string };
      co2: { rotulo: string; valor: string; nota: string };
    };
    pagamento: {
      titulo: string; beneficiario: string | null; campos: Par[]; instrucoes: string[];
      qr: { svg: string; versao: number } | null; qr_motivo: string | null;
      pix_texto: string | null;
      barras: { svg: string } | null; barras_motivo: string | null;
      linha_formatada: string | null; rodape_legal: string[];
      /** A conferencia ARITMETICA do boleto: valor e vencimento saem dos 44
       *  digitos do codigo de barras e sao comparados com a conta. Vai no
       *  payload, NUNCA no papel - o CRM consome a mesma rota. */
      conferencia: { conferida: boolean; divergencias: Array<{ tipo: string }> };
      /** As quatro perguntas de conferencia em frases prontas, compostas no
       *  servidor. Ate 14/08 as tres primeiras viviam no React, em float. */
      alertas: string[];
    };
    rodape: {
      telefone: string; emissor: string | null; endereco: string | null;
      email: string | null; site: string | null; informacoes: string[];
    };
  };
};

/** O retorno de `POST /faturas/unificada/compor`. */
export type ComposicaoUnificada = FolhaUnificada & {
  conta: ContaDaFatura;
  /** A economia acumulada desta UC ate esta competencia. `null` quando nao ha UC
   *  ou competencia legivel - e nesse caso a folha diz "Primeira fatura". */
  economia: { centavos: number; desde: string | null; faturas: number } | null;
  /** O modelo VIGENTE, para a tela mostrar de onde saem os parametros padrao. */
  modelo: ModeloDeFatura | null;
};

/**
 * O MODELO DE FATURA — o template (migration 28).
 *
 * Guarda COMO a folha le: assinatura do topo, texto do aviso laranja, parametros
 * padrao de emissao, multa, juros e o rodape legal do banco. Ate 14/08 os cinco
 * eram literais no dominio, e dois deles nomeavam uma cooperativa especifica com
 * o codigo dela — o mesmo defeito que a migration 26 tirou do emissor.
 */
export type ModeloDeFatura = {
  id: string;
  nome: string;
  descricao: string | null;
  assinatura: string;
  aviso_titulo: string;
  aviso_corpo: string;
  percentual_desconto_padrao: string;
  fator_emissao_padrao: string;
  multa_percentual: string;
  juros_mes_percentual: string;
  rodape_legal: string[];
  nota_do_fator: string;
  ativo: boolean;
  /** So vem em `GET /cobranca/modelos`. */
  padrao?: boolean;
};

/**
 * UM CAMPO QUE O TENANT INVENTOU, ao lado dos 16 do enum `campo_de_fatura`.
 *
 * Aqueles nomeiam colunas da fatura e por isso sao fechados; estes nomeiam dados
 * que nao existem em coluna nenhuma nossa — "Contrato n", "Vendedor", "Placa da
 * usina".
 *
 * `origem`: `fixo` sai igual em toda fatura do modelo; `variavel` e digitado a
 * cada fatura, na aba de leitura.
 */
export type CampoPersonalizado = {
  id: string;
  chave: string;
  rotulo: string;
  origem: 'fixo' | 'variavel';
  valor: string | null;
  ordem: number;
  visivel: boolean;
};

/**
 * A FATURA UNIFICADA REGISTRADA, por UC e competencia (migration 29).
 *
 * E a `fatura:{uc}:{AAAA-MM}` da referencia com `tenant_id`, policy e trilha. A
 * soma dos `desconto_centavos` da serie e o "Voce ja economizou" da folha 2 —
 * que ate 14/08 imprimia o desconto desta fatura e dizia "Primeira fatura", para
 * toda fatura.
 */
export type RegistroDeFatura = {
  id: string;
  numero_uc: string;
  competencia: string;
  cliente_nome: string | null;
  vencimento: string | null;
  compensada_kwh: string;
  tarifa_kwh: string;
  desconto_centavos: number;
  total_centavos: number;
  /**
   * A cobranca que esta conta virou, quando virou (migration 34).
   *
   * `null` tem DOIS significados que a tela precisa separar, e por isso ela nao
   * decide sozinha: ou a conta ainda nao foi cobrada, ou a ligacao ainda nao
   * existe neste banco. O servidor devolve `null` nos dois casos e recusa
   * nomeando no segundo — a tela mostra a recusa em vez de adivinhar.
   */
  fatura_id: string | null;
  /** Se ESTE banco já sabe transformar conta lida em cobrança. É propriedade do
   *  banco e não da linha — vem repetida em todas. Falso enquanto a ligação não
   *  estiver aplicada, e aí a tela não oferece o ato em vez de oferecê-lo e
   *  falhar. */
  cobranca_disponivel: boolean;
  criado_em: string;
  atualizado_em: string;
};

/**
 * A FOLHA 1 DO MODELO G3, composta pelo SERVIDOR.
 *
 * Espelha `src/dominio/folha-g3.ts`. A tela nao decide rotulo, nao formata
 * dinheiro e nao mascara documento: recebe tudo pronto, pelo mesmo motivo que o
 * resto deste arquivo - o CRM consome a mesma rota e nao roda React.
 */
export type FolhaG3 = {
  cabecalho: { assinatura: string; emissor: string | null };
  cliente: {
    nome: string; documento: string;
    meta: Array<{ rotulo: string; valor: string }>;
  };
  total: {
    rotulo: string; detalhe: string; valor: string;
    ausente: boolean; vencimento: string; nota: string;
  };
  aviso: { titulo: string; corpo: string };
  /** A tabela de valores, obedecendo `campo_do_documento` do tenant. */
  detalhamento: { titulo: string; linhas: LinhaDoDocumento[] };
  rodape: { emissor: string | null; paginacao: string };
  /** O que NAO entrou, com o motivo e a questao que destrava. */
  faixas_ausentes: Array<{ faixa: string; motivo: string; questao: string }>;
};

export type DocumentoDaFatura = {
  fatura_id: string;
  status: string;
  competencia: string;
  vencimento: string;
  valor_total_centavos: number | null;
  linhas: LinhaDoDocumento[];
  /** E em forma de MODELO G3 FIXO, que e o destino decidido em 12/08. As duas
   *  convivem ate a folha G3 ter as sete faixas - ver `folha.faixas_ausentes`. */
  folha: FolhaG3;
  /** `data_uri` so vem com `?embutir_logo=1`, que e o caminho do consumidor
   *  externo - a tela busca o binario por `GET /cobranca/logo`. */
  logo: { mime: string; bytes: number; sha256: string; data_uri?: string } | null;
  pagamento:
    | {
        tipo: 'boleto'; linha_digitavel: string | null; codigo_barras: string | null;
        /** As linhas legais do banco, do MODELO. Vazio faz a faixa sumir. */
        rodape_legal: string[];
        /** A mesma linha em grupos, como o banco a imprime. `null` se nao tem 47. */
        linha_digitavel_br: string | null;
        /** Quem recebe, por extenso (migration 26). `null` — nunca "—" — enquanto
         *  o tenant nao cadastrar: e a ele que o aviso anti-golpe amarra. */
        beneficiario: string | null;
        pix_copia_e_cola: string | null; qr: QrDoDocumento | null; qr_motivo?: string;
        /** O identificador do titulo no banco. Nulo enquanto nao registrou. */
        nosso_numero: string | null;
        /** JA FORMATADOS pelo servidor - a tela nao os reformata. O sufixo separa
         *  do `vencimento` ISO e do `valor_total_centavos` inteiro do topo. */
        vencimento_br: string; valor_br: string;
      }
    | {
        tipo: 'pix'; brcode: string; qr: QrDoDocumento | null; qr_motivo?: string;
        conciliacao: 'manual';
        vencimento_br: string; valor_br: string;
        /** Quem recebe, por extenso - o campo 59 do BR Code, legivel no papel. */
        recebedor_nome: string;
      }
    | { tipo: 'nenhuma'; motivo: string };
};

export type Camada = {
  camada: string;
  situacao: 'ok' | 'pendente' | 'nao_medido';
  faltam: number; total: number;
  efeito: 'bloqueia_fatura' | 'bloqueia_split';
  explicacao: string; questao: string | null; dono: string;
};

export type Prontidao = {
  competencia: string; ucs_ativas: number;
  pode_faturar: boolean; pode_repartir: boolean;
  camadas: Camada[];
};
