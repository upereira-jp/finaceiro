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
