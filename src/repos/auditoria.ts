// A TRILHA DE AUDITORIA, DO LADO DA LEITURA — e ela tinha 21.317 linhas e
// nenhum leitor.
//
// ============================================================================
// POR QUE ESTE ARQUIVO NASCEU EM 10/09/2026, e a varredura do mesmo dia o nomeou
//
// O gatilho `auditar_*` grava desde a migration 3 e cobre as tabelas que movem
// dinheiro e cadastro. A varredura de 10/09 mediu o outro lado:
//
//     auditoria em src/repos/ ......... 0 ocorrencias
//     auditoria em src/http/rotas.ts .. 0
//     auditoria em web/ ............... 0
//
// **Escrita a cada transacao, lida por ninguem.** A unica forma de perguntar
// "quem cancelou esta fatura?" ou "quando a chave Pix deste dono mudou, e para
// qual?" era abrir `psql` com a credencial de dono — ou seja, a pergunta exigia
// um desenvolvedor, em qualquer situacao. E o mesmo formato de dano que
// `automacoes.ts` fechou uma camada acima, e a mesma resposta: o dado ja existe,
// falta le-lo.
//
// ============================================================================
// SO LE, E NAO VAI HAVER ESCRITA AQUI — isto e imposto pelo BANCO
//
// A migration 6 desfez o `GRANT` largo da migration 2 exatamente nesta tabela:
//
//     REVOKE ALL ON auditoria FROM app_financeiro;
//     GRANT SELECT ON auditoria TO app_financeiro;
//
// Quem escreve e o gatilho, como `auditor_financeiro`, sob a unica policy de
// INSERT. Se alguem acrescentar uma escrita aqui, ela nao falha na revisao: ela
// falha no banco, que e onde a regra mora. Trilha que quem e auditado consegue
// reescrever nao e trilha.
//
// ============================================================================
// QUEM PODE LER, e a escolha e `ler_corporativo` e nao `ler`
//
// A trilha atravessa TODAS as tabelas auditadas, e quatro delas sao da coluna
// Corporativo do PRD 3 (`conta_pagar`, `pagamento`, `categoria`,
// `centro_custo`). O papel `cobranca` tem traco nessa coluna — ou seja, nao ve
// quanto a empresa deve a cada dono de usina. Exigir `ler` aqui devolveria esse
// mesmo dado pela porta dos fundos, em `antes`/`depois`, para o unico papel que
// a matriz separou dele.
//
// `ler_corporativo` (admin, financeiro, leitura) e exatamente o conjunto de
// papeis que ja pode ler todas as tabelas que a trilha cobre. Nao e uma
// permissao nova: e a que descreve "pode ver tudo", e a trilha e tudo.
//
// ============================================================================
// O TETO E O PERIODO, e os dois existem pela mesma razao
//
// 21.317 linhas hoje, e ela so cresce — cada rodada do conector do CRM escreve.
// Uma leitura sem teto seria a resposta inteira do tenant num `take` unico. O
// teto e do repositorio (`TETO`), o padrao e menor, e o indice
// `auditoria_tenant_idx (tenant_id, ocorrido_em DESC)` serve a ordem que a tela
// usa — a mais recente primeiro, que e a pergunta que se faz.

import { dbt } from '../db/tipado.ts';
import { exigir } from '../db/contexto.ts';
import {
  mudancas, type Mudanca, type OperacaoDaTrilha, type LinhaEmJson,
} from '../dominio/trilha.ts';

/** O teto duro. Pedir mais que isto devolve isto. */
export const TETO = 500;
/** O que a tela pede quando nao pede nada. */
export const PADRAO = 100;

/**
 * AS TRES TABELAS DO BATIMENTO DA MAQUINA — e esta lista e a decisao mais
 * importante deste arquivo. Ela saiu de MEDIR a producao, e nao de supor.
 *
 * Retrato de 10/09/2026, com 21.917 linhas de trilha visiveis neste tenant:
 *
 *     conector_execucao ..... 14.046   (a rodada do CRM, de 15 em 15 min)
 *     agenda_execucao ........ 5.042   (a fila de boleto, de 5 em 5 min)
 *     conector_crm ........... 1.989   (a mesma rodada carimbando a propria linha)
 *     ---------------------------------------------------------------
 *     as tres .............. 21.077 = 96%
 *     TUDO O QUE PESSOAS FIZERAM ......... 840, em 45 dias
 *
 * As tres crescem ~1.440 linhas POR DIA; o resto do sistema produz ~20. Sem esta
 * lista, "as 100 alteracoes mais recentes" seria 100 linhas de rodada — e a tela
 * inteira nasceria inutil, porque a alteracao de cadastro mais recente estaria a
 * milhares de linhas de distancia do topo.
 *
 * ⚠️ POR QUE ESCONDER ISTO NAO E ESCONDER NADA, e a distincao e de natureza:
 * uma rodada nao e um ATO de alguem, e a pergunta que esta trilha responde e
 * "quem decidiu isto?". "A fila rodou as 13:47" ja tem leitor proprio, melhor
 * que este — `repos/automacoes.ts` le a tabela na FONTE, com o nivel e o
 * intervalo, em vez de ler a sombra dela na auditoria.
 *
 * E o esconderijo NAO E BURACO em nenhum dos dois sentidos:
 *   - a tela liga as tres com um clique (`incluir_rodadas`);
 *   - **pedir uma delas pelo nome vence a lista** — quem filtra por
 *     `conector_crm` para ver quem mudou a ligacao com o outro sistema recebe
 *     as linhas dela, rodadas incluidas.
 */
export const RODADAS_AUTOMATICAS: readonly string[] =
  ['conector_execucao', 'agenda_execucao', 'conector_crm'];

export type LinhaDaTrilha = {
  /** `bigint` no banco; o servidor tem replacer de JSON e ele chega como texto. */
  id: string;
  ocorrido_em: Date;
  tabela: string;
  registro_id: string | null;
  operacao: OperacaoDaTrilha;
  /**
   * O NOME DE QUEM FEZ, resolvido aqui — e `null` tem tres causas diferentes,
   * que a tela separa: ninguem no contexto (rotina de banco), pessoa que nao e
   * mais do tenant, ou usuario de servico.
   */
  quem: string | null;
  usuario_id: string | null;
  /** Veio de quem administra a plataforma, e nao de dentro do tenant. */
  de_plataforma: boolean;
  mudancas: Mudanca[];
};

export type Filtro = {
  tabela?: string;
  registro_id?: string;
  operacao?: OperacaoDaTrilha;
  desde?: Date;
  ate?: Date;
  limite?: number;
  /** Traz tambem o batimento da maquina. Ver `RODADAS_AUTOMATICAS`. */
  incluir_rodadas?: boolean;
};

/**
 * A trilha, do mais recente para o mais antigo.
 *
 * O NOME DE QUEM FEZ SAI DE UMA SEGUNDA CONSULTA, e nao de um `join`: nao ha
 * relacao declarada entre `auditoria` e `usuario` no schema, e nao deve haver —
 * uma FK ali impediria apagar um usuario sem apagar a trilha dele, que e o
 * contrario do que uma trilha faz. A segunda consulta le no maximo tantas linhas
 * quantas pessoas distintas aparecem na pagina, que na pratica sao poucas.
 *
 * ⚠️ A POLICY DE `usuario` E QUEM LIMITA, e isso e bom: ela mostra quem e do
 * tenant. Um id que ela nao devolve fica com nome `null` em vez de vazar o nome
 * de alguem de outro tenant — e a tela diz "de fora deste sistema" em vez de
 * inventar.
 */
export async function trilha(f: Filtro = {}): Promise<LinhaDaTrilha[]> {
  await exigir('ler_corporativo');
  const db = dbt();

  /* PEDIR UMA TABELA PELO NOME VENCE A LISTA: quem escolheu `conector_crm` no
   * filtro esta perguntando justamente por ela, e devolver vazio seria a tela
   * ignorando em silencio o que a pessoa pediu. */
  const escondidas = f.tabela || f.incluir_rodadas ? [] : RODADAS_AUTOMATICAS;

  const linhas = await db.auditoria.findMany({
    where: {
      ...(f.tabela ? { tabela: f.tabela } : {}),
      ...(escondidas.length ? { tabela: { notIn: [...escondidas] } } : {}),
      ...(f.registro_id ? { registro_id: f.registro_id } : {}),
      ...(f.operacao ? { operacao: f.operacao } : {}),
      ...(f.desde || f.ate ? {
        ocorrido_em: { ...(f.desde ? { gte: f.desde } : {}), ...(f.ate ? { lte: f.ate } : {}) },
      } : {}),
    },
    /* `select` EXPLICITO, e nao por comodidade: `auditoria.xact_id` e `xid8`,
     * que o Prisma marca como `Unsupported`. Nomear as colunas mantem a consulta
     * fora do caminho em que um tipo desconhecido decide o que acontece. */
    select: {
      id: true, ocorrido_em: true, tabela: true, registro_id: true,
      operacao: true, usuario_id: true, tier: true, antes: true, depois: true,
    },
    orderBy: [{ ocorrido_em: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(f.limite ?? PADRAO, 1), TETO),
  });

  const ids = [...new Set(linhas.map((l) => l.usuario_id).filter((x): x is string => !!x))];
  const pessoas = ids.length === 0 ? [] : await db.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  });
  const nome = new Map(pessoas.map((p) => [p.id, p.nome]));

  return linhas.map((l) => {
    const operacao = String(l.operacao).trim() as OperacaoDaTrilha;
    return {
      id: String(l.id),
      ocorrido_em: l.ocorrido_em,
      tabela: l.tabela,
      registro_id: l.registro_id,
      operacao,
      quem: l.usuario_id ? nome.get(l.usuario_id) ?? null : null,
      usuario_id: l.usuario_id,
      de_plataforma: l.tier != null && l.tier !== '',
      mudancas: mudancas(operacao, l.antes as LinhaEmJson, l.depois as LinhaEmJson),
    };
  });
}

/**
 * QUAIS TABELAS APARECEM NA TRILHA, com quanto de cada uma.
 *
 * Serve o filtro da tela, e a razao de ser medida em vez de listada a mao e a de
 * sempre neste projeto: uma lista escrita envelhece na primeira migration que
 * acrescentar um gatilho. Aqui a tela oferece o que EXISTE.
 *
 * ⚠️ E ela responde uma pergunta que ninguem faria de proposito: uma tabela
 * auditada que NAO aparece aqui e uma tabela cujo gatilho parou de gravar.
 */
export async function tabelasDaTrilha(desde?: Date): Promise<Array<{ tabela: string; linhas: number }>> {
  await exigir('ler_corporativo');

  const r = await dbt().auditoria.groupBy({
    by: ['tabela'],
    ...(desde ? { where: { ocorrido_em: { gte: desde } } } : {}),
    _count: { _all: true },
  });

  return r
    .map((x: { tabela: string; _count: { _all: number } }) => ({ tabela: x.tabela, linhas: x._count._all }))
    .sort((a, b) => b.linhas - a.linhas || a.tabela.localeCompare(b.tabela));
}
