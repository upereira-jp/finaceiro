// O LOG POR REQUISICAO. `PLANO-global-por-etapas-2026-09-22.md` §5, «Log de
// requisicao»: *"log estruturado por requisicao (rota, tenant, papel, duracao,
// status) — e o que responde «o que a tela fez» sem `grep` no nginx"*.
//
// Ate 03/10/2026 a aplicacao nao registrava pedido nenhum. O nginx era a unica
// fonte, e ele nao sabe quem e o usuario, em que tenant ele estava nem que papel
// tinha — so o IP, o caminho e o status. Uma reclamacao como "a tela de contas
// ficou lenta hoje a tarde" nao tinha onde ser medida.
//
// ============================================================================
// O QUE NAO ENTRA, e cada ausencia e decisao
//
// - A QUERY STRING. A busca no servidor manda o nome do cliente por ela
//   (`?busca=silva`), e o journal nao tem o gate de PII que a ficha tem. Sai o
//   PADRAO da rota (`/faturas/:id`), nunca o caminho concreto com a query.
// - O CORPO. Carrega documento, endereco, chave Pix.
// - A CREDENCIAL. Nem o token, nem o cabecalho `authorization`.
// - O TENANT PROPOSTO QUE NAO E DA SESSAO. `X-Tenant-ID` e entrada do cliente; o
//   que vai para o log e o tenant que `selecionarTenant` de fato escolheu. Um
//   uuid arbitrario no cabecalho vira `tenant: null`, e nao uma linha que parece
//   dizer que alguem trabalhou num tenant onde nao entrou.
// - OS ESTATICOS DA SPA. Um carregamento de tela puxa uma duzia de arquivos com
//   hash no nome; isso e trabalho do nginx, nao "o que a tela fez".
//
// O caminho concreto so aparece quando NENHUMA rota casou (404/405) — ai nao ha
// padrao para registrar, e "alguem esta chamando uma rota que nao existe" e
// justamente o que se quer ver. Ele sai cortado em 120 caracteres e SEM query.
// ============================================================================

import { selecionarTenant, type Sessao } from '../auth/sessao.ts';

export type ModoDaRota = 'sessao' | 'webhook' | 'publica';

/** O que o servidor vai sabendo enquanto atende. Preenchido aos poucos. */
export type ContextoDaRequisicao = {
  inicio: bigint;
  metodo: string;
  /** So as chamadas sob o prefixo da API geram linha. */
  naApi: boolean;
  /** O caminho sem o prefixo e sem a query. */
  caminho?: string;
  /** O padrao da rota que casou. Ausente = nenhuma casou. */
  rota?: string;
  modo?: ModoDaRota;
  sessao?: Sessao;
  tenantProposto?: string;
};

export type LinhaDeRequisicao = {
  metodo: string;
  /** Padrao da tabela de rotas, ou `null` quando nenhuma casou. */
  rota: string | null;
  /** So quando `rota` e `null`: o caminho pedido, sem query, cortado. */
  caminho?: string;
  status: number;
  ms: number;
  modo: ModoDaRota | null;
  usuario: string | null;
  tenant: string | null;
  papel: string | null;
  /** `plataforma_admin` / `plataforma_suporte`; ausente para quem nao tem tier. */
  tier?: string;
  /** O cliente fechou a conexao antes de a resposta terminar de sair. */
  abortado?: true;
};

const TETO_DO_CAMINHO = 120;

/**
 * Monta a linha. Pura: nao consulta banco, nao le relogio, nao levanta.
 *
 * O tenant e o papel saem de `selecionarTenant`, a MESMA funcao que a unidade de
 * trabalho usa — nao de uma segunda regra escrita aqui, que um dia discordaria
 * da primeira. Quando ela recusa (tenant fora da sessao, escolha pendente com
 * varios vinculos, sessao sem vinculo), a linha sai sem tenant e sem papel.
 */
export function montarLinha(
  ctx: ContextoDaRequisicao, status: number, ms: number, abortado = false,
): LinhaDeRequisicao {
  let tenant: string | null = null;
  let papel: string | null = null;
  if (ctx.sessao) {
    try {
      const v = selecionarTenant(ctx.sessao, ctx.tenantProposto);
      tenant = v.tenantId;
      papel = v.papel;
    } catch { /* sem tenant resolvido: a linha diz isso, e nao adivinha */ }
  }

  const linha: LinhaDeRequisicao = {
    metodo: ctx.metodo,
    rota: ctx.rota ?? null,
    status,
    ms: Math.max(0, Math.round(ms)),
    modo: ctx.modo ?? null,
    usuario: ctx.sessao?.usuarioId ?? null,
    tenant,
    papel,
  };
  if (ctx.rota === undefined && ctx.caminho !== undefined) {
    linha.caminho = ctx.caminho.slice(0, TETO_DO_CAMINHO);
  }
  if (ctx.sessao?.tier) linha.tier = ctx.sessao.tier;
  if (abortado) linha.abortado = true;
  return linha;
}

/**
 * O DESTINO PADRAO: uma linha no stdout, que o systemd leva ao journal.
 *
 * O prefixo `[financeiro] requisicao ` e o mesmo idioma das outras linhas do
 * processo, e separa estas das demais com um `grep` so; o resto da linha e JSON,
 * que `jq` le sem regex:
 *
 *   journalctl -u financeiro -o cat | grep '^\[financeiro\] requisicao ' \
 *     | cut -d' ' -f3- | jq -s 'group_by(.rota) | map({rota: .[0].rota, n: length})'
 *
 * `JSON.stringify` escapa quebra de linha, entao um caminho malicioso nao forja
 * uma segunda linha no journal.
 */
export const logDeRequisicaoPadrao = (linha: LinhaDeRequisicao): void => {
  console.log(`[financeiro] requisicao ${JSON.stringify(linha)}`);
};
