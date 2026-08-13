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

export type Cliente = { id: string; nome: string; documento: string | null; ativo: boolean };

export type UnidadeConsumidora = {
  id: string; cliente_id: string; numero_uc: string; distribuidora: string;
  usina_id: string | null; percentual_rateio: string | null;
  data_vencimento: string | null;
  /** NOSSO cadastro: `ativa | suspensa | cancelada`. Nao diz nada sobre o CRM. */
  status: string;
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

export type Tarifa = {
  id: string; distribuidora: string; tarifa_reais_por_kwh: string;
  vigencia_inicio: string; vigencia_fim: string | null;
};

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

// ------------------------------------------------ o layout por posicao (mig. 23)

export type Papel = 'a4' | 'a5' | 'carta' | 'oficio';
export type Orientacao = 'retrato' | 'paisagem';
export type TipoDeBloco = 'tabela_de_campos' | 'campo' | 'texto' | 'logo' | 'pagamento' | 'linha';
export type Alinhamento = 'esquerda' | 'centro' | 'direita';
export type Peso = 'normal' | 'forte';

export type Folha = {
  papel: Papel;
  orientacao: Orientacao;
  margem_topo_mm: number;
  margem_direita_mm: number;
  margem_baixo_mm: number;
  margem_esquerda_mm: number;
};

export type Bloco = {
  id: string;
  tipo: TipoDeBloco;
  campo: string | null;
  texto: string | null;
  x_mm: number; y_mm: number; largura_mm: number; altura_mm: number;
  alinhamento: Alinhamento;
  tamanho_pt: number;
  peso: Peso;
  borda: boolean;
  fundo: boolean;
  z: number;
};

export type ProblemaDeLayout =
  | { tipo: 'fora_da_pagina'; blocoId: string; detalhe: string }
  | { tipo: 'sobreposicao'; blocoId: string; comBlocoId: string; detalhe: string }
  | { tipo: 'sem_conteudo'; blocoId: string; detalhe: string };

export type BlocoComposto = Omit<Bloco, 'campo' | 'texto'> & {
  linhas?: LinhaDoDocumento[];
  rotulo?: string;
  valor?: string;
  tipoDeValor?: string;
  ausente?: boolean;
  texto?: string;
};

export type DocumentoPosicionado = {
  folha: Folha;
  medidas: { largura_mm: number; altura_mm: number };
  area: { x_mm: number; y_mm: number; largura_mm: number; altura_mm: number };
  blocos: BlocoComposto[];
  problemas: ProblemaDeLayout[];
};

/**
 * O que `GET /cobranca/layout` devolve. `papeis` vem do SERVIDOR de proposito:
 * duplicar as medidas de A4 e A5 aqui criaria duas verdades sobre o tamanho do
 * papel, e o sintoma seria a previa desenhando uma folha e a impressao saindo
 * noutra. Ver `web/src/layout-regras.ts`.
 */
export type LayoutDoDocumento = {
  folha: Folha;
  blocos: Bloco[];
  papeis: Record<Papel, { largura_mm: number; altura_mm: number; rotulo: string; css: string }>;
};

export type DocumentoDaFatura = {
  fatura_id: string;
  status: string;
  competencia: string;
  vencimento: string;
  valor_total_centavos: number | null;
  linhas: LinhaDoDocumento[];
  /** O mesmo documento em forma de PAPEL - folha, area e blocos posicionados. */
  layout: DocumentoPosicionado;
  /** `data_uri` so vem com `?embutir_logo=1`, que e o caminho do consumidor
   *  externo - a tela busca o binario por `GET /cobranca/logo`. */
  logo: { mime: string; bytes: number; sha256: string; data_uri?: string } | null;
  pagamento:
    | {
        tipo: 'boleto'; linha_digitavel: string | null; codigo_barras: string | null;
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
