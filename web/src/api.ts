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
}

type Contexto = { token: () => string | null; tenantId: () => string | null };

let contexto: Contexto = { token: () => null, tenantId: () => null };

/** Ligado uma vez, no arranque, pelo provedor de sessao. */
export function ligarContexto(c: Contexto): void { contexto = c; }

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
    throw new ErroDaApi(
      r.status,
      dado?.erro ?? 'ErroDesconhecido',
      // Sem mensagem no corpo, o status sozinho e melhor do que uma frase
      // inventada: "erro ao salvar" esconderia qual das 78 rotas falhou.
      dado?.mensagem ?? `${metodo} ${caminho} devolveu ${r.status}`,
    );
  }
  return dado as T;
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
    throw new ErroDaApi(r.status, dado?.erro ?? 'ErroDesconhecido',
      dado?.mensagem ?? `GET ${caminho} devolveu ${r.status}`);
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
  data_vencimento: string | null; status: string;
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

export type IdentidadeDeCobranca = {
  id: string;
  pix_chave: string | null;
  pix_tipo_chave: string | null;
  pix_recebedor_nome: string | null;
  pix_recebedor_cidade: string | null;
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

export type DocumentoDaFatura = {
  fatura_id: string;
  status: string;
  competencia: string;
  vencimento: string;
  valor_total_centavos: number | null;
  linhas: LinhaDoDocumento[];
  logo: { mime: string; bytes: number; sha256: string } | null;
  pagamento:
    | { tipo: 'boleto'; linha_digitavel: string | null; codigo_barras: string | null; pix_copia_e_cola: string | null }
    | { tipo: 'pix'; brcode: string; conciliacao: 'manual' }
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
