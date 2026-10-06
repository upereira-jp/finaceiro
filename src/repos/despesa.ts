// DESPESAS DA EMPRESA — a planilha `G3Solar_Financeiro.xlsx` dentro do sistema.
//
// DE ONDE ISTO VEM: em 02/10/2026 o dono subiu a planilha com que a G3 controla
// as contas a pagar da EMPRESA e mandou que o processo passasse a funcionar aqui
// (`PLANO-planilha-empresa-2026-10-02.md`). Cada linha da aba «Lançamentos» vira
// uma `conta_pagar` manual; a aba «Cadastros» vira `categoria` e
// `origem_pagamento`; Painel, Dashboard e Projeção são LEITURAS, feitas no
// navegador sobre a lista que `listar()` devolve (`web/src/despesas-regras.ts`).
//
// O QUE ESTE ARQUIVO NAO FAZ, e a ausencia e a regra: nao toca conta nascida de
// split. Repasse e comissao do rateio tem regra propria (valor imutavel, origem
// unica) e moram em Contas a pagar; aqui so entra o que nasce a mao, e o CHECK
// `conta_pagar_planilha_so_a_mao` impede o caminho inverso.
//
// A SERIE (recorrente ou parcelada) e um `serie_id`, e nao o texto do historico
// como na planilha — la uma virgula a mais quebrava a recorrencia sem aviso.
//
// A ETAPA 1 DO CONTROLE TOTAL (06/10/2026, `PLANO-empresa-controle-total-2026-10-06.md`,
// migration 44) trouxe o fornecedor como cadastro (opcional, como na planilha), o
// centro de custo, o plano em dois niveis com a natureza do grupo, a conta de onde
// sai o dinheiro com banco/agencia/final, o parcelamento ja em andamento, o
// «recorrente ate» cortando pelo VENCIMENTO (como a planilha) e o estorno da baixa.

import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.ts';
import { dbt } from '../db/tipado.ts';
import { tenantCorrente, exigir } from '../db/contexto.ts';
import { HOJE } from './conta_pagar.ts';
import type {
  forma_de_pagamento as FormaDePagamento,
  natureza_despesa as Natureza,
  natureza_da_categoria as NaturezaDaCategoria,
  recorrencia_despesa as Recorrencia,
  tipo_origem_pagamento as TipoOrigem,
} from '../generated/prisma/enums.ts';

const erro = (status: number, mensagem: string) => Object.assign(new Error(mensagem), { status });

// ------------------------------------------------------ o que a planilha traz

/** O plano de contas da aba «Cadastros», na ordem dela. Só é gravado quando
 *  alguém pede, na tela («Começar com o plano da planilha») — nunca semeado. */
export const PLANO_DA_PLANILHA = [
  'Despesas Administrativas',
  'Despesas com Pessoal',
  'Tributos e Taxas',
  'Custos Operacionais - O&M Usinas',
  'Comissões e Repasses',
  'Despesas Comerciais e Marketing',
  'Tecnologia e Software',
  'Serviços de Terceiros',
  'Despesas Financeiras',
  'Veículos e Deslocamento',
  'Honorários Contábeis e Jurídicos',
  'Outras Despesas',
] as const;

/** As origens da planilha: a Conta PJ e os sócios. «Adiantamento Sócio 1/2» da
 *  planilha viraram os nomes que o dono deu em 02/10/2026 (Q-SOCIOS-01). Baixa que
 *  sai de um sócio vira dívida da empresa com ele (`registrarPagamento`). */
export const ORIGENS_DA_PLANILHA: ReadonlyArray<{ nome: string; tipo: TipoOrigem }> = [
  { nome: 'Conta PJ G3 Solar', tipo: 'conta_bancaria' },
  { nome: 'Vinicius Leal', tipo: 'socio' },
  { nome: 'Renata Estevam', tipo: 'socio' },
];

export const FORMAS: readonly FormaDePagamento[] = [
  'pix', 'boleto', 'ted', 'doc', 'cartao_credito', 'debito_automatico', 'dinheiro', 'compensacao',
];
export const NATUREZAS: readonly Natureza[] = ['fixa', 'variavel'];
export const RECORRENCIAS: readonly Recorrencia[] = ['avulsa', 'mensal', 'trimestral', 'semestral', 'anual', 'parcelada'];
export const TIPOS_DE_ORIGEM: readonly TipoOrigem[] = ['conta_bancaria', 'socio', 'outra'];
export const NATUREZAS_DA_CATEGORIA: readonly NaturezaDaCategoria[] = ['despesa', 'investimento', 'retirada_socio'];

/**
 * «AMPLIAR COM AS SUBCATEGORIAS SUGERIDAS» (seção B do plano de 06/10/2026): tudo o
 * que uma empresa como a G3 pode gastar, pendurado nos 12 grupos da planilha. É
 * SUGESTÃO — só entra quando alguém pede, na tela, e o que não servir se desativa.
 * Os nomes são únicos no tenant (o banco exige), por isso «Seguro do imóvel», «Seguro
 * das usinas» e «Seguro de veículos» e não três «Seguros».
 */
export const SUBCATEGORIAS_SUGERIDAS: Readonly<Record<string, readonly string[]>> = {
  'Despesas Administrativas': ['Aluguel e condomínio', 'IPTU', 'Energia e água do escritório', 'Internet e telefone',
    'Material de escritório', 'Limpeza e copa', 'Correios', 'Manutenção predial', 'Seguro do imóvel'],
  'Despesas com Pessoal': ['Salários', 'Pró-labore', '13º salário', 'Férias', 'Rescisões', 'FGTS', 'INSS',
    'Vale-transporte', 'Vale-refeição e alimentação', 'Plano de saúde e odontológico', 'Seguro de vida',
    'Exames ocupacionais', 'Treinamento', 'Uniforme e EPI', 'Bônus e premiações', 'Bolsa de estágio'],
  'Tributos e Taxas': ['DAS (Simples Nacional)', 'Alvará e taxas municipais', 'CREA e ART', 'Certidões', 'Multas e infrações'],
  'Custos Operacionais - O&M Usinas': ['Limpeza de módulos', 'Manutenção preventiva', 'Manutenção corretiva',
    'Peças e inversores', 'Monitoramento das usinas', 'Seguro das usinas', 'Arrendamento de terreno', 'Vigilância das usinas'],
  'Comissões e Repasses': ['Comissões fora do rateio', 'Repasses fora do rateio'],
  'Despesas Comerciais e Marketing': ['Anúncios online', 'Agência e produção', 'Material gráfico', 'Brindes', 'Eventos e feiras'],
  'Tecnologia e Software': ['Assinaturas de software', 'Servidor e hospedagem', 'Domínio e e-mail', 'Certificado digital', 'Suporte de TI'],
  'Serviços de Terceiros': ['Consultoria', 'Prestador PJ eventual', 'Despachante', 'Cartório', 'Engenharia e projetos'],
  'Despesas Financeiras': ['Tarifas bancárias', 'Tarifa de boleto', 'IOF', 'Juros e multas', 'Anuidade e encargos de cartão'],
  'Veículos e Deslocamento': ['Combustível', 'Pedágio e estacionamento', 'Manutenção de veículos', 'IPVA e licenciamento',
    'Seguro de veículos', 'Aplicativo de transporte', 'Passagens', 'Hospedagem', 'Alimentação em viagem'],
  'Honorários Contábeis e Jurídicos': ['Contabilidade', 'Advocacia', 'Custas judiciais'],
  'Outras Despesas': ['Associações e anuidades', 'Doações', 'Diversos'],
};

/** Os dois grupos que SAEM do caixa e NÃO são despesa (Q-PLANO-NATUREZA-01, proposta;
 *  o dono desativa se não quiser). O DRE da etapa 4 os deixa fora do resultado. */
export const GRUPOS_FORA_DO_RESULTADO: ReadonlyArray<{ nome: string; natureza: NaturezaDaCategoria; subs: readonly string[] }> = [
  { nome: 'Investimentos', natureza: 'investimento',
    subs: ['Equipamentos', 'Construção de usinas', 'Compra de veículos', 'Móveis e instalações'] },
  { nome: 'Retiradas dos sócios', natureza: 'retirada_socio', subs: ['Distribuição de lucros'] },
];

/** Os meses entre dois títulos de uma série periódica — a coluna X da planilha. */
export const INTERVALO_EM_MESES: Partial<Record<Recorrencia, number>> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

function umDe<T extends string>(v: unknown, lista: readonly T[], campo: string): T {
  if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return v as T;
  throw erro(422, `${campo} inválido: ${JSON.stringify(v)}. Aceito: ${lista.join(', ')}.`);
}
const umDeOuNull = <T extends string>(v: unknown, lista: readonly T[], campo: string): T | null =>
  v === null || v === undefined || v === '' ? null : umDe(v, lista, campo);

function centavos(v: unknown, campo: string, minimo = 1): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < minimo) {
    throw erro(422, `${campo} precisa ser um inteiro de centavos ≥ ${minimo}; veio ${JSON.stringify(v)}.`);
  }
  return v;
}

const textoLivre = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

function link(v: unknown): string | null {
  const t = textoLivre(v);
  if (t && !/^https?:\/\//i.test(t)) {
    throw erro(422, 'O comprovante precisa ser um link que comece com http:// ou https://.');
  }
  return t;
}

/** O primeiro dia do mês, em UTC — a forma em que competência e «recorrente até» vivem. */
export const primeiroDia = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Soma meses a uma data sem transbordar: 31/01 + 1 mês é 28/02 (ou 29), não 03/03. */
export function somarMeses(d: Date, meses: number): Date {
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo)));
}

// ------------------------------------------------------ cadastros

export async function cadastros() {
  await exigir('ler_corporativo');
  const categorias = await dbt().categoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  const origens = await dbt().origem_pagamento.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  const centros = await dbt().centro_custo.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  return { categorias, origens, centros };
}

/**
 * «COMEÇAR COM O PLANO DA PLANILHA»: grava os itens da planilha que ainda não
 * existem, na ordem dela, e as origens (a Conta PJ e os dois sócios) que faltam.
 *
 * Idempotente por nome — rodar duas vezes não duplica, e um item que o analista
 * já criou com o mesmo nome fica como está. Em SÉRIE, nunca `Promise.all`:
 * dentro da transação é uma conexão só.
 */
export async function comecarPelaPlanilha() {
  await exigir('escrever_corporativo');
  const tenant_id = tenantCorrente();
  const existentes = new Set((await dbt().categoria.findMany({ select: { nome: true } })).map((c) => c.nome));
  let criadas = 0;
  for (const [i, nome] of PLANO_DA_PLANILHA.entries()) {
    if (existentes.has(nome)) continue;
    await dbt().categoria.create({ data: { tenant_id, nome, ordem: i + 1 } });
    criadas++;
  }
  const jaHa = new Set((await dbt().origem_pagamento.findMany({ select: { nome: true } })).map((o) => o.nome));
  let origens = 0;
  for (const [i, o] of ORIGENS_DA_PLANILHA.entries()) {
    if (jaHa.has(o.nome)) continue;
    await dbt().origem_pagamento.create({ data: { tenant_id, nome: o.nome, tipo: o.tipo, ordem: i + 1 } });
    origens++;
  }
  return { categorias_criadas: criadas, origens_criadas: origens };
}

/** O grupo existe NESTE tenant e é grupo (não subcategoria)? */
async function grupoDoPlano(id: string) {
  const g = await dbt().categoria.findFirst({ where: { id } });
  if (!g) throw erro(404, 'O grupo do plano de contas não foi encontrado.');
  if (g.pai_id) throw erro(422, `«${g.nome}» já é subcategoria. O plano de contas tem dois níveis: grupo e subcategoria.`);
  return g;
}

/** Um nome de categoria já usado no tenant (o banco exige único). */
async function nomeLivre(nome: string, menos?: string) {
  const ja = await dbt().categoria.findFirst({ where: { nome, ...(menos ? { id: { not: menos } } : {}) } });
  if (ja) throw erro(409, `Já existe «${nome}» no plano de contas${ja.pai_id ? ' (como subcategoria)' : ''}. Use outro nome.`);
}

/**
 * Um GRUPO (sem `pai_id`) entra no fim dos grupos, com a natureza pedida; uma
 * SUBCATEGORIA entra no fim do grupo dela e herda a natureza do grupo (o gatilho
 * da migration 44 garante — a natureza de uma subcategoria não se escolhe).
 */
export async function criarCategoria(e: { nome: unknown; pai_id?: unknown; natureza?: unknown }) {
  await exigir('escrever_corporativo');
  const nome = textoLivre(e.nome);
  if (!nome) throw erro(422, 'O plano de contas precisa de um nome.');
  const pai_id = textoLivre(e.pai_id);
  if (pai_id) await grupoDoPlano(pai_id);
  await nomeLivre(nome);
  const ultima = await dbt().categoria.aggregate({ _max: { ordem: true }, where: { pai_id: pai_id ?? null } });
  return dbt().categoria.create({
    data: {
      tenant_id: tenantCorrente(), nome, ordem: (ultima._max.ordem ?? 0) + 1, pai_id,
      ...(pai_id ? {} : { natureza: umDe(e.natureza ?? 'despesa', NATUREZAS_DA_CATEGORIA, 'natureza') }),
    },
  });
}

/**
 * Renomear, ativar ou desativar, mudar a natureza (só do grupo) ou mover a
 * subcategoria para outro grupo. NUNCA apagar: há conta classificada nela.
 */
export async function alterarCategoria(id: string, e: { nome?: unknown; ativo?: unknown; natureza?: unknown; pai_id?: unknown }) {
  await exigir('escrever_corporativo');
  const atual = await dbt().categoria.findFirst({ where: { id } });
  if (!atual) throw erro(404, 'Plano de contas não encontrado.');
  const data: { nome?: string; ativo?: boolean; natureza?: NaturezaDaCategoria; pai_id?: string | null } = {};
  if (e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'O plano de contas precisa de um nome.');
    if (nome !== atual.nome) await nomeLivre(nome, id);
    data.nome = nome;
  }
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  if (e.pai_id !== undefined) {
    const novo = textoLivre(e.pai_id);
    if (novo) {
      if (novo === id) throw erro(422, 'Um item não fica embaixo dele mesmo.');
      await grupoDoPlano(novo);
      const filhos = await dbt().categoria.count({ where: { pai_id: id } });
      if (filhos) throw erro(422, `«${atual.nome}» tem subcategorias e por isso é grupo: não vai para dentro de outro.`);
    }
    data.pai_id = novo;
  }
  if (e.natureza !== undefined) {
    /* `??` não serve aqui: `pai_id: null` (virar grupo) é nulo e cairia no atual. */
    const paiFinal = e.pai_id !== undefined ? data.pai_id : atual.pai_id;
    if (paiFinal) {
      throw erro(422, 'A natureza é do grupo: a subcategoria segue a do grupo dela.');
    }
    data.natureza = umDe(e.natureza, NATUREZAS_DA_CATEGORIA, 'natureza');
  }
  await dbt().categoria.update({ where: { id }, data });
}

/**
 * «AMPLIAR COM AS SUBCATEGORIAS SUGERIDAS»: pendura as sugeridas nos grupos da
 * planilha que existem (pelo nome) e cria os dois grupos fora do resultado.
 * Idempotente por nome — rodar de novo não duplica, e o que alguém renomeou ou
 * criou com o mesmo nome fica como está. Em SÉRIE (uma conexão na transação).
 */
export async function ampliarComSugeridas() {
  await exigir('escrever_corporativo');
  const tenant_id = tenantCorrente();
  const todas = await dbt().categoria.findMany({ select: { id: true, nome: true, pai_id: true } });
  const porNome = new Map(todas.map((c) => [c.nome, c]));
  let subcategorias = 0, grupos = 0;
  const semGrupo: string[] = [];

  const pendurar = async (grupoId: string, nomes: readonly string[]) => {
    for (const [i, nome] of nomes.entries()) {
      if (porNome.has(nome)) continue;
      const c = await dbt().categoria.create({ data: { tenant_id, nome, pai_id: grupoId, ordem: i + 1 } });
      porNome.set(nome, { id: c.id, nome, pai_id: grupoId });
      subcategorias++;
    }
  };

  for (const [grupo, subs] of Object.entries(SUBCATEGORIAS_SUGERIDAS)) {
    const g = porNome.get(grupo);
    if (!g || g.pai_id) { semGrupo.push(grupo); continue; }
    await pendurar(g.id, subs);
  }
  const maior = await dbt().categoria.aggregate({ _max: { ordem: true }, where: { pai_id: null } });
  let ordem = maior._max.ordem ?? 0;
  for (const f of GRUPOS_FORA_DO_RESULTADO) {
    let g = porNome.get(f.nome);
    if (!g) {
      const c = await dbt().categoria.create({ data: { tenant_id, nome: f.nome, natureza: f.natureza, ordem: ++ordem } });
      g = { id: c.id, nome: f.nome, pai_id: null };
      porNome.set(f.nome, g);
      grupos++;
    }
    if (!g.pai_id) await pendurar(g.id, f.subs);
  }
  return { subcategorias_criadas: subcategorias, grupos_criados: grupos, grupos_que_faltam: semGrupo };
}

const listaDeIds = (ids: unknown): string[] => {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw erro(422, 'ids precisa ser uma lista.');
  return ids as string[];
};

/** A ordem nova, inteira: a lista de ids na ordem em que a tela os mostra. */
export async function ordenarCategorias(ids: unknown) {
  await exigir('escrever_corporativo');
  for (const [i, id] of listaDeIds(ids).entries()) {
    await dbt().categoria.updateMany({ where: { id }, data: { ordem: i + 1 } });
  }
}

// ------------------------------------------------------ centros de custo
//
// A tabela existe desde a migration 22, vazia e sem tela. Centro de custo é o
// «onde» do gasto (Administrativo, Comercial, Operação das usinas, Diretoria), ao
// lado do plano de contas, que é o «o quê». Nada é semeado: a tela cria.

export async function criarCentro(e: { nome: unknown }) {
  await exigir('escrever_corporativo');
  const nome = textoLivre(e.nome);
  if (!nome) throw erro(422, 'O centro de custo precisa de um nome.');
  if (await dbt().centro_custo.findFirst({ where: { nome } })) throw erro(409, `Já existe o centro de custo «${nome}».`);
  const ultima = await dbt().centro_custo.aggregate({ _max: { ordem: true } });
  return dbt().centro_custo.create({ data: { tenant_id: tenantCorrente(), nome, ordem: (ultima._max.ordem ?? 0) + 1 } });
}

/** Renomear, ativar ou desativar. Nunca apagar: há despesa classificada nele. */
export async function alterarCentro(id: string, e: { nome?: unknown; ativo?: unknown }) {
  await exigir('escrever_corporativo');
  const data: { nome?: string; ativo?: boolean } = {};
  if (e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'O centro de custo precisa de um nome.');
    if (await dbt().centro_custo.findFirst({ where: { nome, id: { not: id } } })) throw erro(409, `Já existe o centro de custo «${nome}».`);
    data.nome = nome;
  }
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  const r = await dbt().centro_custo.updateMany({ where: { id }, data });
  if (r.count === 0) throw erro(404, 'Centro de custo não encontrado.');
}

export async function ordenarCentros(ids: unknown) {
  await exigir('escrever_corporativo');
  for (const [i, id] of listaDeIds(ids).entries()) {
    await dbt().centro_custo.updateMany({ where: { id }, data: { ordem: i + 1 } });
  }
}

export async function criarOrigem(e: { nome: unknown; tipo?: unknown; banco?: unknown; agencia?: unknown; conta_final?: unknown }) {
  await exigir('escrever_corporativo');
  const nome = textoLivre(e.nome);
  if (!nome) throw erro(422, 'A origem precisa de um nome.');
  if (await dbt().origem_pagamento.findFirst({ where: { nome } })) throw erro(409, `Já existe a origem «${nome}».`);
  const tipo = umDe(e.tipo ?? 'conta_bancaria', TIPOS_DE_ORIGEM, 'tipo');
  const banco = { banco: textoLivre(e.banco), agencia: agencia(e.agencia), conta_final: finalDaConta(e.conta_final) };
  if (tipo !== 'conta_bancaria' && Object.values(banco).some((x) => x)) {
    throw erro(422, 'Banco, agência e final da conta só valem para origem do tipo conta bancária.');
  }
  const ultima = await dbt().origem_pagamento.aggregate({ _max: { ordem: true } });
  return dbt().origem_pagamento.create({
    data: { tenant_id: tenantCorrente(), nome, tipo, ...banco, ordem: (ultima._max.ordem ?? 0) + 1 },
  });
}

/**
 * O FINAL DA CONTA é só ele: 4 dígitos. Se vier o número inteiro, a resposta é
 * recusar — e não guardar os 4 últimos em silêncio —, porque quem digitou o número
 * inteiro precisa saber que o sistema não o guarda (o banco também recusa).
 */
function finalDaConta(v: unknown): string | null {
  const t = textoLivre(v);
  if (t === null) return null;
  if (!/^[0-9]{4}$/.test(t)) throw erro(422, 'Da conta, guarde só os 4 últimos dígitos (o final) — o número inteiro não fica no sistema.');
  return t;
}

function agencia(v: unknown): string | null {
  const t = textoLivre(v);
  if (t === null) return null;
  if (!/^[0-9]{1,6}(-?[0-9Xx])?$/.test(t)) throw erro(422, 'A agência são só números (com o dígito, se houver: 3069-5).');
  return t;
}

export async function alterarOrigem(id: string, e: {
  nome?: unknown; tipo?: unknown; ativo?: unknown; banco?: unknown; agencia?: unknown; conta_final?: unknown;
}) {
  await exigir('escrever_corporativo');
  const atual = await dbt().origem_pagamento.findFirst({ where: { id } });
  if (!atual) throw erro(404, 'Origem não encontrada.');
  const data: { nome?: string; tipo?: TipoOrigem; ativo?: boolean; banco?: string | null; agencia?: string | null; conta_final?: string | null } = {};
  if (e.nome !== undefined) {
    const nome = textoLivre(e.nome);
    if (!nome) throw erro(422, 'A origem precisa de um nome.');
    if (nome !== atual.nome && await dbt().origem_pagamento.findFirst({ where: { nome, id: { not: id } } })) {
      throw erro(409, `Já existe a origem «${nome}».`);
    }
    data.nome = nome;
  }
  if (e.tipo !== undefined) data.tipo = umDe(e.tipo, TIPOS_DE_ORIGEM, 'tipo');
  if (e.ativo !== undefined) data.ativo = e.ativo === true;
  if (e.banco !== undefined) data.banco = textoLivre(e.banco);
  if (e.agencia !== undefined) data.agencia = agencia(e.agencia);
  if (e.conta_final !== undefined) data.conta_final = finalDaConta(e.conta_final);
  /* Banco, agência e final só existem em conta bancária: virar sócio ou «outra» limpa os três. */
  if ((data.tipo ?? atual.tipo) !== 'conta_bancaria') {
    if ([data.banco, data.agencia, data.conta_final].some((x) => x)) {
      throw erro(422, 'Banco, agência e final da conta só valem para origem do tipo conta bancária.');
    }
    data.banco = null; data.agencia = null; data.conta_final = null;
  }
  await dbt().origem_pagamento.update({ where: { id }, data });
}

export async function ordenarOrigens(ids: unknown) {
  await exigir('escrever_corporativo');
  for (const [i, id] of listaDeIds(ids).entries()) {
    await dbt().origem_pagamento.updateMany({ where: { id }, data: { ordem: i + 1 } });
  }
}

// ------------------------------------------------------ lançar

export type NovaDespesa = {
  descricao: unknown;
  /** O nome escrito de quem recebe — opcional, como a coluna C da planilha. */
  fornecedor?: unknown;
  /** O fornecedor do cadastro. Quando vem, o nome gravado é o dele. */
  fornecedor_id?: unknown;
  valor_centavos: unknown;
  competencia: Date;
  vencimento: Date;
  recorrencia?: unknown;
  /** Só para `parcelada`: quantas parcelas, de 2 a 360. O valor é o de CADA parcela. */
  parcelas?: unknown;
  /**
   * Só para `parcelada`: a parcela em que o lançamento COMEÇA (1 por padrão). Um
   * parcelamento já em andamento — «estou na 4ª de 10» — entra de 4 a 10, e o
   * vencimento e a competência informados são os da 4ª (lacuna 5 de 06/10).
   */
  parcela_inicial?: unknown;
  recorrente_ate?: Date | null;
  categoria_id?: unknown;
  centro_custo_id?: unknown;
  natureza?: unknown;
  forma_prevista?: unknown;
  origem_pagamento_id?: unknown;
  numero_documento?: unknown;
  comprovante_url?: unknown;
  observacao?: unknown;
};

/**
 * QUEM RECEBE, nas três formas que a tela manda: o fornecedor do cadastro (o nome
 * gravado é o dele, para a lista não mostrar um apelido velho), só o nome escrito,
 * ou nada — na planilha a coluna C é opcional, e o aluguel de exemplo não tem.
 */
async function quemRecebe(e: { fornecedor?: unknown; fornecedor_id?: unknown }) {
  const fornecedor_id = textoLivre(e.fornecedor_id);
  if (fornecedor_id) {
    const f = await dbt().fornecedor.findFirst({ where: { id: fornecedor_id } });
    if (!f) throw erro(404, 'O fornecedor escolhido não foi encontrado.');
    return { fornecedor_id, beneficiario_nome: f.nome };
  }
  return { fornecedor_id: null, beneficiario_nome: textoLivre(e.fornecedor) };
}

/** Os campos que todo título da planilha carrega e que a série copia. */
async function camposComuns(e: Omit<NovaDespesa, 'competencia' | 'vencimento' | 'recorrencia' | 'parcelas' | 'parcela_inicial' | 'recorrente_ate'>) {
  const descricao = textoLivre(e.descricao);
  if (!descricao) throw erro(422, 'O histórico (o que é a despesa) é obrigatório.');
  return {
    descricao,
    ...(await quemRecebe(e)),
    valor_centavos: centavos(e.valor_centavos, 'valor_centavos'),
    categoria_id: textoLivre(e.categoria_id),
    centro_custo_id: textoLivre(e.centro_custo_id),
    natureza: umDeOuNull(e.natureza, NATUREZAS, 'natureza'),
    forma_prevista: umDeOuNull(e.forma_prevista, FORMAS, 'forma_prevista'),
    origem_pagamento_id: textoLivre(e.origem_pagamento_id),
    numero_documento: textoLivre(e.numero_documento),
    comprovante_url: link(e.comprovante_url),
    observacao: textoLivre(e.observacao),
  };
}

/**
 * Lança uma despesa: avulsa (um título), periódica (o PRIMEIRO título de uma
 * série — os seguintes a Projeção mostra e «Lançar o próximo» grava) ou
 * parcelada (TODAS as parcelas de uma vez, como a planilha pedia uma linha por
 * parcela, e cada uma vencendo um mês depois da anterior).
 */
export async function lancar(e: NovaDespesa) {
  await exigir('escrever_corporativo');
  const comum = await camposComuns(e);
  const recorrencia = umDe(e.recorrencia ?? 'avulsa', RECORRENCIAS, 'recorrencia');
  const competencia = primeiroDia(e.competencia);
  const ate = e.recorrente_ate ? primeiroDia(e.recorrente_ate) : null;
  if (ate && !INTERVALO_EM_MESES[recorrencia]) {
    throw erro(422, '«Recorrente até» só vale para despesa mensal, trimestral, semestral ou anual.');
  }
  /* O «recorrente até» é o último MÊS DE VENCIMENTO, como na planilha (coluna W
     contra o mês da coluna I) — não a competência. */
  if (ate && ate < primeiroDia(e.vencimento)) throw erro(422, '«Recorrente até» não pode ser antes do mês do vencimento.');

  const base = {
    tenant_id: tenantCorrente(),
    beneficiario_tipo: 'outro' as const,
    ...comum,
    recorrencia,
    recorrente_ate: ate,
  };

  if (recorrencia === 'parcelada') {
    const total = e.parcelas;
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 2 || total > 360) {
      throw erro(422, 'Despesa parcelada precisa de 2 a 360 parcelas.');
    }
    const inicio = e.parcela_inicial === undefined || e.parcela_inicial === null ? 1 : e.parcela_inicial;
    if (typeof inicio !== 'number' || !Number.isInteger(inicio) || inicio < 1 || inicio > total) {
      throw erro(422, `A parcela em que o lançamento começa vai de 1 a ${total}.`);
    }
    const serie_id = randomUUID();
    const criadas = [];
    for (let n = inicio; n <= total; n++) {
      criadas.push(await dbt().conta_pagar.create({
        data: {
          ...base, serie_id, parcela_numero: n, parcela_total: total,
          competencia: somarMeses(competencia, n - inicio), vencimento: somarMeses(e.vencimento, n - inicio),
        },
      }));
    }
    return criadas;
  }

  return [await dbt().conta_pagar.create({
    data: {
      ...base,
      serie_id: recorrencia === 'avulsa' ? null : randomUUID(),
      competencia, vencimento: e.vencimento,
    },
  })];
}

/** A conta manual, viva, ou o erro que diz por que não. */
async function contaDaEmpresa(id: string) {
  const c = await dbt().conta_pagar.findFirst({ where: { id } });
  if (!c) throw erro(404, 'Despesa não encontrada.');
  if (c.origem_split_item_id) {
    throw erro(409, 'Esta conta nasceu da divisão do dinheiro de um cliente (repasse ou comissão) e não se edita aqui.');
  }
  if (c.status === 'cancelada') throw erro(409, 'Despesa cancelada não se edita.');
  return c;
}

/**
 * Edita um título. O que muda a SÉRIE inteira (o tipo da recorrência) muda em
 * todos os títulos dela, para a projeção não ler um molde de cada tipo.
 */
export async function editar(id: string, e: Partial<NovaDespesa>) {
  await exigir('escrever_corporativo');
  const c = await contaDaEmpresa(id);
  const data: Record<string, unknown> = {};

  if (e.descricao !== undefined) {
    const t = textoLivre(e.descricao);
    if (!t) throw erro(422, 'O histórico não pode ficar vazio.');
    data.descricao = t;
  }
  if (c.reembolso_de_pagamento_id && (e.valor_centavos !== undefined || e.recorrencia !== undefined
      || e.fornecedor !== undefined || e.fornecedor_id !== undefined)) {
    throw erro(422, 'O reembolso ao sócio vale o que saiu do bolso dele, é dele e não se repete: valor, credor e recorrência não mudam aqui.');
  }
  if (e.fornecedor_id !== undefined || e.fornecedor !== undefined) {
    Object.assign(data, await quemRecebe({
      fornecedor_id: e.fornecedor_id === undefined ? c.fornecedor_id : e.fornecedor_id,
      fornecedor: e.fornecedor === undefined ? c.beneficiario_nome : e.fornecedor,
    }));
  }
  if (e.valor_centavos !== undefined) {
    const v = centavos(e.valor_centavos, 'valor_centavos');
    if (v < c.valor_pago_centavos) {
      throw erro(422, `O valor não pode ficar abaixo do que já foi pago (${c.valor_pago_centavos} centavos).`);
    }
    data.valor_centavos = v;
  }
  if (e.competencia !== undefined) data.competencia = primeiroDia(e.competencia);
  if (e.vencimento !== undefined) data.vencimento = e.vencimento;
  if (e.categoria_id !== undefined) data.categoria_id = textoLivre(e.categoria_id);
  if (e.centro_custo_id !== undefined) data.centro_custo_id = textoLivre(e.centro_custo_id);
  if (e.natureza !== undefined) data.natureza = umDeOuNull(e.natureza, NATUREZAS, 'natureza');
  if (e.forma_prevista !== undefined) data.forma_prevista = umDeOuNull(e.forma_prevista, FORMAS, 'forma_prevista');
  if (e.origem_pagamento_id !== undefined) data.origem_pagamento_id = textoLivre(e.origem_pagamento_id);
  if (e.numero_documento !== undefined) data.numero_documento = textoLivre(e.numero_documento);
  if (e.comprovante_url !== undefined) data.comprovante_url = link(e.comprovante_url);
  if (e.observacao !== undefined) data.observacao = textoLivre(e.observacao);

  if (e.recorrencia !== undefined) {
    const nova = umDe(e.recorrencia, RECORRENCIAS, 'recorrencia');
    const atual = c.recorrencia ?? 'avulsa';
    if (nova !== atual) {
      if (nova === 'parcelada' || atual === 'parcelada') {
        throw erro(422, 'Parcelamento não se liga nem desliga num título lançado: cancele e lance de novo com as parcelas.');
      }
      if (nova === 'avulsa') {
        const irmaos = c.serie_id ? await dbt().conta_pagar.count({ where: { serie_id: c.serie_id, status: { not: 'cancelada' } } }) : 1;
        if (irmaos > 1) throw erro(422, 'Esta despesa já tem outros meses lançados. Para parar de repetir, use «Encerrar recorrência».');
        data.recorrencia = 'avulsa'; data.serie_id = null; data.recorrente_ate = null;
      } else if (atual === 'avulsa') {
        data.recorrencia = nova; data.serie_id = randomUUID();
      } else {
        /* periódica → periódica: a série inteira muda junto. */
        await dbt().conta_pagar.updateMany({ where: { serie_id: c.serie_id! }, data: { recorrencia: nova } });
      }
    }
  }

  await dbt().conta_pagar.update({ where: { id }, data });
}

/** O último título vivo de uma série — o molde da projeção e do «próximo». */
async function ultimoDaSerie(serieId: string) {
  const u = await dbt().conta_pagar.findFirst({
    where: { serie_id: serieId, status: { not: 'cancelada' } },
    orderBy: [{ vencimento: 'desc' }, { criado_em: 'desc' }],
  });
  if (!u) throw erro(404, 'Série não encontrada.');
  return u;
}

/**
 * «LANÇAR O PRÓXIMO»: o que a planilha mandava fazer à mão («no mês seguinte,
 * lance o novo título com o MESMO texto no Histórico»), num clique. Copia o
 * último título da série, um intervalo adiante; o valor e o vencimento podem
 * vir ajustados (a conta de energia varia).
 */
export async function lancarProximo(serieId: string, e: { valor_centavos?: unknown; vencimento?: Date | null }) {
  await exigir('escrever_corporativo');
  const u = await ultimoDaSerie(serieId);
  const meses = INTERVALO_EM_MESES[u.recorrencia ?? 'avulsa'];
  if (!meses) throw erro(422, 'Só despesa mensal, trimestral, semestral ou anual tem «próximo».');
  const competencia = somarMeses(u.competencia, meses);
  /* O corte é pelo MÊS DO VENCIMENTO da série (o da agenda, não o que alguém
     ajustou à mão), como a planilha: o mesmo critério da Projeção. */
  const vencimentoDaSerie = somarMeses(u.vencimento, meses);
  if (u.recorrente_ate && primeiroDia(vencimentoDaSerie) > u.recorrente_ate) {
    throw erro(422, 'A recorrência desta despesa já terminou. Para continuar, tire o «recorrente até».');
  }
  const ja = await dbt().conta_pagar.count({ where: { serie_id: serieId, competencia, status: { not: 'cancelada' } } });
  if (ja) throw erro(409, 'O próximo título desta série já está lançado.');

  return dbt().conta_pagar.create({
    data: {
      tenant_id: u.tenant_id,
      beneficiario_tipo: 'outro',
      descricao: u.descricao,
      beneficiario_nome: u.beneficiario_nome,
      valor_centavos: e.valor_centavos === undefined || e.valor_centavos === null
        ? u.valor_centavos : centavos(e.valor_centavos, 'valor_centavos'),
      competencia,
      vencimento: e.vencimento ?? vencimentoDaSerie,
      fornecedor_id: u.fornecedor_id,
      categoria_id: u.categoria_id,
      centro_custo_id: u.centro_custo_id,
      natureza: u.natureza,
      recorrencia: u.recorrencia,
      recorrente_ate: u.recorrente_ate,
      serie_id: serieId,
      forma_prevista: u.forma_prevista,
      origem_pagamento_id: u.origem_pagamento_id,
    },
  });
}

/** «Recorrente até» da série inteira. `null` volta a repetir sem fim. */
export async function encerrarRecorrencia(serieId: string, ate: Date | null) {
  await exigir('escrever_corporativo');
  const u = await ultimoDaSerie(serieId);
  if (!INTERVALO_EM_MESES[u.recorrencia ?? 'avulsa']) throw erro(422, 'Esta série não é periódica.');
  const mes = ate ? primeiroDia(ate) : null;
  if (mes && mes < primeiroDia(u.vencimento)) {
    throw erro(422, 'O fim da recorrência não pode ser antes do mês em que vence o último título lançado.');
  }
  await dbt().conta_pagar.updateMany({ where: { serie_id: serieId }, data: { recorrente_ate: mes } });
}

// ------------------------------------------------------ ler

/**
 * Tudo o que a planilha mostrava, numa leitura: os títulos da empresa (os que
 * nascem à mão — repasse e comissão do rateio ficam de fora), com o plano, a
 * origem e os pagamentos, mais o `hoje` do BANCO.
 *
 * O `hoje` vem do banco pelo mesmo motivo de Contas a receber: situação e
 * «vence em 7 dias» comparam com a data, e a data do navegador muda com o fuso
 * de quem abre.
 */
export async function listar(limite = 2000) {
  await exigir('ler_corporativo');
  /* O DIA DE GOIÂNIA, e não `current_date`: a sessão do banco está em UTC, e das
     21h à meia-noite o «hoje» dela já é amanhã — «vence hoje» saía vencida à noite
     (lacuna 1 da auditoria de 06/10). O mesmo `HOJE` de Contas a pagar. */
  const [{ hoje }] = await dbt().$queryRaw<Array<{ hoje: string }>>(Prisma.sql`SELECT ${HOJE}::text AS hoje`);
  const onde = { origem_split_item_id: null };
  const total = await dbt().conta_pagar.count({ where: onde });
  const linhas = await dbt().conta_pagar.findMany({
    where: onde,
    select: {
      id: true, descricao: true, beneficiario_nome: true, valor_centavos: true, valor_pago_centavos: true,
      competencia: true, vencimento: true, status: true, criado_em: true, cancelada_em: true,
      categoria_id: true, natureza: true, recorrencia: true, recorrente_ate: true, serie_id: true,
      parcela_numero: true, parcela_total: true, forma_prevista: true, origem_pagamento_id: true,
      numero_documento: true, comprovante_url: true, observacao: true, reembolso_de_pagamento_id: true,
      numero: true, fornecedor_id: true, centro_custo_id: true,
      pagamento: {
        select: {
          id: true, data_pagamento: true, valor_centavos: true, acrescimo_centavos: true,
          desconto_centavos: true, forma: true, origem_pagamento_id: true,
          referencia_externa: true, observacao: true, estornado_em: true, motivo_estorno: true,
        },
        orderBy: [{ data_pagamento: 'asc' }, { criado_em: 'asc' }],
      },
      anexo: {
        where: { desvinculado_em: null },
        select: {
          id: true, nome_arquivo: true, enviado_em: true,
          anexo_conteudo: { select: { tipo: true, tamanho_bytes: true } },
        },
        orderBy: [{ enviado_em: 'asc' }],
      },
    },
    orderBy: [{ vencimento: 'asc' }, { criado_em: 'asc' }],
    take: Math.min(Math.max(limite, 1), 5000),
  });
  return { hoje, total, linhas };
}

// ------------------------------------------------------ desfazer a baixa (o estorno)

/**
 * «DESFAZER A BAIXA» (lacuna 6 de 06/10/2026). Na planilha era apagar a data e o
 * valor pagos; aqui o pagamento é prova de dinheiro e não se apaga: ele é MARCADO
 * como estornado, com o motivo, e o gatilho da migration 44 deixa de somá-lo — a
 * despesa volta a aberta (ou parcial) e a baixa errada fica no histórico.
 *
 * O banco é quem garante (gatilho `pagamento_estorno`); as conferências daqui
 * existem para a MENSAGEM, como em `registrarPagamento`:
 *   - só a despesa à mão — repasse e comissão tocam o split (Q-ESTORNO-01);
 *   - a baixa que saiu do bolso de um sócio leva junto a dívida com ele, se ela
 *     ainda está em aberto; se a empresa já o reembolsou, o reembolso se desfaz antes.
 */
export async function estornarBaixa(pagamentoId: string, e: { motivo?: unknown }) {
  await exigir('escrever_corporativo');
  const motivo = textoLivre(e.motivo);
  if (!motivo) throw erro(422, 'Diga por que a baixa está sendo desfeita (fica no histórico).');
  const p = await dbt().pagamento.findFirst({
    where: { id: pagamentoId },
    include: { conta_pagar: { select: { descricao: true, origem_split_item_id: true } } },
  });
  if (!p) throw erro(404, 'Baixa não encontrada.');
  if (p.estornado_em) throw erro(409, 'Esta baixa já foi desfeita.');
  if (p.conta_pagar.origem_split_item_id) {
    throw erro(409, 'A baixa de um repasse ou de uma comissão do rateio não se desfaz aqui: ela mexe na divisão do dinheiro do cliente, e essa decisão é do dono (Q-ESTORNO-01).');
  }
  const divida = await dbt().conta_pagar.findFirst({
    where: { reembolso_de_pagamento_id: p.id, status: { not: 'cancelada' } },
  });
  if (divida && divida.valor_pago_centavos > 0) {
    throw erro(409, `Esta baixa saiu do bolso de ${divida.beneficiario_nome ?? 'um sócio'}, e a empresa já o reembolsou. Desfaça primeiro a baixa do reembolso.`);
  }
  await dbt().pagamento.update({ where: { id: pagamentoId }, data: { estornado_em: new Date(), motivo_estorno: motivo } });
  return { divida_cancelada: !!divida };
}
