// Repositorio de cliente. CLAUDE.md 1 (centavos), 2 (tenant nunca vem do
// chamador), 11 (indice parcial nao e caminho de navegacao). R7-R9 ficam em
// dominio/documento.ts e nao sao reimplementadas aqui.

import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { classificar, type OrigemDocumento } from '../dominio/documento.ts';

export type NovoCliente = {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
  crm_lead_id?: string | null;
  documento_bruto?: string | null;
  documento_origem?: OrigemDocumento;
  /** Decimal como STRING. Number aqui e a porta de entrada do float numa
   *  grandeza fisica - CLAUDE.md 1 proibe float ate em calculo intermediario. */
  consumo_kwh?: string | null;
  consumo_referencia_centavos?: number | null;
};

export type EdicaoCliente = Partial<Omit<NovoCliente, 'crm_lead_id'>>;

/** CLAUDE.md 1: se chegou float, morre aqui - nao no fechamento do mes. */
function centavos(v: number | null | undefined, campo: string): number | null {
  if (v == null) return null;
  if (!Number.isInteger(v)) throw new TypeError(`${campo} deve ser Int em centavos, recebeu ${v}`);
  return v;
}

const limpar = (v: string | null | undefined) => {
  const s = v?.trim();
  return s ? s : null;
};

export async function criar(e: NovoCliente) {
  await exigir('escrever_cadastro');
  const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');

  return dbt().cliente.create({
    data: {
      // NUNCA do chamador, e a defesa nao e a policy WITH CHECK - e nao existir
      // parametro. Este e o unico ponto do cadastro onde uma escrita poderia
      // atravessar tenant, e o que nao entra na assinatura nao vaza.
      tenant_id: tenantCorrente(),
      nome: e.nome.trim(),
      telefone: limpar(e.telefone),
      email: limpar(e.email)?.toLowerCase() ?? null,
      origem: limpar(e.origem),
      crm_lead_id: e.crm_lead_id ?? null,
      documento: d.documento,
      documento_tipo: d.documento_tipo,
      documento_validado: d.documento_validado,   // R8: semente do CRM entra FALSE
      documento_origem: d.documento_origem,
      consumo_kwh: e.consumo_kwh ?? null,
      consumo_referencia_centavos: centavos(e.consumo_referencia_centavos, 'consumo_referencia_centavos'),
    },
  });
}

/**
 * CLAUDE.md 11 na pratica.
 *
 * `cliente_documento_unico` e PARCIAL (WHERE documento IS NOT NULL), e a escolha
 * do `findFirst` com predicado explicito e por isso.
 *
 * CORRIGIDO EM 30/07/2026. A versao anterior deste comentario afirmava que "o
 * Prisma 7.9 exclui indice parcial das chaves de findUnique - verificado no
 * DMMF, as chaves de cliente sao so [tenant_id+id] - entao nem existe findUnique
 * por documento". **E falso desde 27/07**, e a `Q-CLAUDE11-01` o mediu: com
 * `previewFeatures = ["partialIndexes"]` ligado no generator, o `db pull` emite
 * `where: raw(...)` no `@@unique` e a chave APARECE em `findUnique` -
 * `clienteWhereUniqueInput` expoe `tenant_id_documento`.
 *
 * Ou seja: a protecao automatica que este comentario invocava NAO existe. O que
 * protege e a escolha abaixo, e ela nao depende de o gerador cooperar. O
 * `tests/regra11.ts` transformou isso em invariante: nenhum arquivo de `src/`
 * navega por chave parcial, e a lista de chaves parciais sai do proprio
 * `schema.prisma`.
 *
 * `findFirst` com o predicado explicito, e null nunca chega ao banco. O tenant
 * sai da RLS, nao de um WHERE.
 */
export async function porDocumento(bruto: string | null | undefined) {
  await exigir('ler');
  const { documento } = classificar(bruto, 'coleta_local');
  if (documento === null) return null;
  return dbt().cliente.findFirst({ where: { documento } });
}

export async function porId(id: string) {
  await exigir('ler');
  return dbt().cliente.findFirst({ where: { id } });
}

/**
 * A LISTA DE CLIENTES, e por PADRAO ela e a carteira ATIVA - nao o cadastro
 * inteiro. Decisao do dono em 04/08/2026.
 *
 * O QUE "ATIVO" PASSOU A SIGNIFICAR AQUI, e a palavra ja significou tres coisas
 * neste sistema num unico dia:
 *
 *   `cliente.ativo`                 nosso: o conector nao o desativou por
 *                                   ausencia no CRM. Eram 45 em 04/08
 *   `unidade_consumidora.status`    nosso: ninguem suspendeu a UC. Eram 41
 *   `rateio_situacao = 'ativado'`   DO CRM: a etapa `Desconto Ativo` do funil
 *                                   `Rateio`, `stage_type = 'won'`. **29**
 *
 * O dono pediu a terceira, e so ela: "apenas, exclusivamente, unicamente, os
 * clientes da etapa Ativos". Medido no dia: **29 linhas, 24 pessoas** - a
 * diferenca e a `Q-CLIENTEDUP-01`, que e outro assunto e nao se resolve aqui.
 *
 * POR QUE PELA UC E NAO PELO CLIENTE. A etapa e do contrato de rateio, e o
 * rateio pendura na UC - `cliente` nao tem, e nao deve ter, coluna de etapa de
 * funil. Um cliente entra na lista porque tem PELO MENOS UMA UC ativada; quem
 * tem duas UCs e so uma ativada continua sendo cliente ativo, o que e o certo.
 *
 * `escopo: 'todos'` EXISTE E NAO E CONTRADICAO COM O PEDIDO. Sem ele, um cliente
 * criado a mao por `POST /clientes` - que nunca tera UC do CRM - ficaria
 * invisivel PARA SEMPRE, e nao ha outro caminho de busca no sistema: a tela
 * lista, e o que nao esta na lista nao existe para quem opera. O padrao e o que
 * o dono pediu; a saida de emergencia e explicita e a tela a nomeia.
 */
export type EscopoDeClientes = 'carteira_ativa' | 'todos';

export async function listar(
  opcoes: { ativo?: boolean; limite?: number; escopo?: EscopoDeClientes } = {},
) {
  await exigir('ler');
  const escopo = opcoes.escopo ?? 'carteira_ativa';
  return dbt().cliente.findMany({
    where: {
      ...(opcoes.ativo === undefined ? {} : { ativo: opcoes.ativo }),
      ...(escopo === 'todos' ? {} : {
        // `some` vira EXISTS: um cliente com duas UCs nao duplica na lista.
        unidade_consumidora: { some: { rateio_situacao: 'ativado' } },
      }),
    },
    orderBy: [{ nome: 'asc' }],
    take: Math.min(opcoes.limite ?? 100, 500),
  });
}

/**
 * R8 continua valendo na edicao: documento reenviado com origem 'crm_semente'
 * NAO passa a valer, mesmo com digito correto. Por isso a reclassificacao passa
 * pelo dominio em vez de um UPDATE direto no campo.
 */
export async function editar(id: string, e: EdicaoCliente) {
  await exigir('escrever_cadastro');

  const dados: Record<string, unknown> = {};
  if (e.nome !== undefined)     dados.nome = e.nome.trim();
  if (e.telefone !== undefined) dados.telefone = limpar(e.telefone);
  if (e.email !== undefined)    dados.email = limpar(e.email)?.toLowerCase() ?? null;
  if (e.origem !== undefined)   dados.origem = limpar(e.origem);
  if (e.consumo_kwh !== undefined) dados.consumo_kwh = e.consumo_kwh ?? null;
  if (e.consumo_referencia_centavos !== undefined) {
    dados.consumo_referencia_centavos =
      centavos(e.consumo_referencia_centavos, 'consumo_referencia_centavos');
  }
  if (e.documento_bruto !== undefined) {
    const d = classificar(e.documento_bruto, e.documento_origem ?? 'coleta_local');
    dados.documento = d.documento;
    dados.documento_tipo = d.documento_tipo;
    dados.documento_validado = d.documento_validado;
    dados.documento_origem = d.documento_origem;
  }
  if (Object.keys(dados).length === 0) return;

  // updateMany e nao update: `update` usa chave unica e lanca P2025 quando a RLS
  // esconde a linha - erro de "nao existe" que na verdade e "outro tenant".
  // updateMany devolve count 0 e a decisao sobre o 404 fica aqui.
  const r = await dbt().cliente.updateMany({ where: { id }, data: dados });
  if (r.count === 0) throw Object.assign(new Error('Cliente nao encontrado.'), { status: 404 });
}

// ------------------------------------------------- lancamento de documento

export type ResultadoDosDocumentos = {
  aplicados: Array<{
    cliente_id: string; nome: string; documento: string;
    /** O que havia antes, para a segunda passada ser obviamente vazia. */
    antes: string | null;
    /** R8 na pratica: o mesmo documento ja podia estar la, vindo do CRM, com
     *  `documento_validado = false`. Trocar so a origem E mudanca - e a que
     *  destrava a R9 -, e sem esta marca ela pareceria escrita a toa. */
    so_validou: boolean;
  }>;
  /** Cliente da planilha que nao existe, ou existe e esta inativo. Nao e erro do
   *  arquivo: e a planilha e o banco discordando sobre quem existe, e quem
   *  decide o que fazer com isso e uma pessoa. */
  sem_cliente: Array<{ cliente_id: string; documento: string; motivo: 'nao_existe' | 'inativo' }>;
  /** Ja tinham ESTE documento e ja validado. Contados a parte para reimportar o
   *  mesmo arquivo sair com `aplicados` em zero. */
  inalterados: Array<{ cliente_id: string; nome: string; documento: string }>;
  /**
   * O documento ja pertence a OUTRO cliente. E a `Q-CLIENTEDUP-01` chegando pelo
   * unico caminho em que ela e observavel: o banco.
   *
   * O leitor puro pega a repeticao DENTRO do arquivo; esta lista pega a
   * repeticao contra o que ja esta gravado - inclusive contra cliente INATIVO,
   * porque `cliente_documento_unico` nao olha a coluna `ativo`.
   */
  colisoes: Array<{
    cliente_id: string; nome: string; documento: string;
    dono_atual_id: string; dono_atual_nome: string; dono_atual_ativo: boolean;
  }>;
  /** Cliente ATIVO que a planilha nao cobriu, com o que ele tem hoje. Ausente
   *  nao e zero: o lancamento nao apaga o documento de quem nao veio. */
  nao_cobertos: Array<{
    cliente_id: string; nome: string; documento_atual: string | null;
    validado: boolean;
    /** Tem ao menos uma UC faturavel - mesmo predicado da triagem. Sem isto o
     *  relatorio contaria junto quem nao fatura hoje e mandaria procurar CPF que
     *  nao destrava nada, que foi o defeito medido no modelo de vencimentos. */
    fatura: boolean;
  }>;
};

/**
 * Lanca o CPF/CNPJ de varios clientes de uma vez, casando por `id`.
 *
 * POR QUE ISTO EXISTE - medido em 04/08/2026 contra producao. `cliente.documento`
 * e NULL em 45 de 45 linhas ativas, e a R9 (`podeAtivarContrato`) recusa levar
 * contrato para `ativo` sem documento VALIDADO. Sem contrato ativo a triagem
 * recusa por `sem_contrato_vigente`, que e a primeira da ordem: **os 29 contratos
 * a digitar viram 29 rascunhos e 29 recusas 422** enquanto esta coluna estiver
 * vazia. Nenhuma das 10 views do CRM expoe documento - conferido no catalogo do
 * schema `financeiro` no mesmo dia -, entao o dado entra por aqui ou nao entra.
 *
 * O QUE ESTA FUNCAO NAO FAZ, e os quatro sao deliberados:
 *   - nao apaga documento de cliente que a planilha nao trouxe (ausente nao e zero);
 *   - nao escreve nada se ALGUMA linha colidir - ver abaixo;
 *   - nao toca cliente inativo, nem para conferir: ele aparece na recusa;
 *   - nao valida digito, porque o leitor puro ja recusou o que nao fecha.
 *
 * A CONFERENCIA E DE LOTE, E ISSO E O PONTO DESTE ARQUIVO. `cliente_documento_
 * unico` e UNIQUE parcial sobre (tenant_id, documento), e gravando linha a linha
 * a violacao chega no MEIO do lote - com metade escrita, sem o arquivo no banco
 * para saber qual metade. Entao: colide alguma, nao escreve nenhuma. E o mesmo
 * criterio do `cadastrar-originadores.ts`, e a razao aqui foi medida antes de
 * escrita (`Q-CLIENTEDUP-01`: 45 linhas ativas para 36 nomes distintos).
 */
export async function lancarDocumentosPorCliente(
  porCliente: ReadonlyMap<string, string>,
): Promise<ResultadoDosDocumentos> {
  await exigir('escrever_cadastro');

  /*
   * TODOS os clientes, inclusive os inativos, e as duas razoes sao diferentes:
   * o inativo entra no mapa de COLISAO porque o indice unico nao olha `ativo`
   * (as 41 vitimas de merge de 30/07 continuam la), e fica FORA de
   * `nao_cobertos` porque documento de cliente desativado nao e trabalho.
   */
  const todos = await dbt().cliente.findMany({
    select: {
      id: true, nome: true, ativo: true, documento: true, documento_validado: true,
      unidade_consumidora: {
        select: { status: true, crm_usina_cliente_id: true, rateio_situacao: true },
      },
    },
  });
  const porId = new Map(todos.map((c) => [c.id, c]));
  const donoDoDocumento = new Map(
    todos.filter((c) => c.documento !== null).map((c) => [c.documento!, c]));

  const r: ResultadoDosDocumentos = {
    aplicados: [], sem_cliente: [], inalterados: [], colisoes: [], nao_cobertos: [],
  };

  /*
   * PRIMEIRA PASSADA: so decide. Nada e escrito aqui, e e por isso que a colisao
   * pode abortar o lote inteiro sem deixar rastro pela metade.
   */
  const aEscrever: Array<{ cliente: typeof todos[number]; documento: string }> = [];
  for (const [cliente_id, documento] of porCliente) {
    const c = porId.get(cliente_id);
    if (!c) { r.sem_cliente.push({ cliente_id, documento, motivo: 'nao_existe' }); continue; }
    if (!c.ativo) { r.sem_cliente.push({ cliente_id, documento, motivo: 'inativo' }); continue; }

    // R8: mesmo documento com `documento_validado = false` NAO e inalterado - e
    // semente do CRM esperando confirmacao, e confirmar e exatamente o ato que
    // esta planilha registra.
    if (c.documento === documento && c.documento_validado) {
      r.inalterados.push({ cliente_id, nome: c.nome, documento });
      continue;
    }

    const dono = donoDoDocumento.get(documento);
    if (dono && dono.id !== cliente_id) {
      r.colisoes.push({
        cliente_id, nome: c.nome, documento,
        dono_atual_id: dono.id, dono_atual_nome: dono.nome, dono_atual_ativo: dono.ativo,
      });
      continue;
    }

    aEscrever.push({ cliente: c, documento });
  }

  for (const c of todos) {
    if (!c.ativo || porCliente.has(c.id)) continue;
    r.nao_cobertos.push({
      cliente_id: c.id, nome: c.nome,
      documento_atual: c.documento, validado: c.documento_validado,
      // O predicado da triagem, aplicado a PESSOA: basta uma UC faturavel. Quem
      // tem duas UCs e so uma ativada e cliente que fatura, e o documento dele e
      // trabalho de verdade.
      fatura: c.unidade_consumidora.some((u) =>
        u.status === 'ativa' && (u.crm_usina_cliente_id === null || u.rateio_situacao === 'ativado')),
    });
  }

  // COLIDIU ALGUMA, NAO ESCREVE NENHUMA. O relatorio sai inteiro - quem le
  // precisa ver as colisoes E o que teria sido gravado, senao conserta uma linha
  // por rodada.
  if (r.colisoes.length > 0) return r;

  /*
   * SEGUNDA PASSADA: escreve, e por `editar()`. Nao ha UPDATE direto aqui de
   * proposito - `editar` e o unico lugar que aplica a R8 (a origem decide se o
   * documento vale), e um segundo caminho de escrita divergiria dele sem que
   * nenhum dos dois parecesse errado.
   */
  for (const { cliente, documento } of aEscrever) {
    await editar(cliente.id, { documento_bruto: documento, documento_origem: 'coleta_local' });
    r.aplicados.push({
      cliente_id: cliente.id, nome: cliente.nome, documento,
      antes: cliente.documento,
      so_validou: cliente.documento === documento,
    });
  }

  return r;
}

/** Baixa logica. Nunca DELETE: contrato, UC e comissao apontam para ca. */
export async function desativar(id: string) {
  await exigir('escrever_cadastro');
  const r = await dbt().cliente.updateMany({ where: { id }, data: { ativo: false } });
  if (r.count === 0) throw Object.assign(new Error('Cliente nao encontrado.'), { status: 404 });
}
