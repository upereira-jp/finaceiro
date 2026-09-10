// O HISTÓRICO — quem fez o quê, e quando. Puro, sem JSX, com suíte própria.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE
//
// O banco guarda cada alteração desde a primeira semana do projeto — 21.317
// registros em produção no dia em que esta tela foi escrita — e nada no sistema
// os mostrava. A pergunta *"quem cancelou esta fatura?"* só tinha uma resposta
// possível: chamar quem tem acesso ao banco.
//
// O servidor manda a diferença já reduzida (`src/dominio/trilha.ts`). O que
// falta, e é o que mora aqui, é a metade que decide o que a pessoa **lê**:
//
//   `ROTULO_DA_TABELA`   `unidade_consumidora` vira "unidade consumidora", e
//                        `conta_pagar` vira "conta a pagar". Sem isto a tela
//                        mostraria nome de tabela, que é o vocabulário do banco
//                        e não o de quem opera — e a suíte de vocabulário das
//                        telas proíbe, com razão;
//   `rotuloDaColuna`     o mesmo para as colunas, com regra geral para as que
//                        ninguém traduziu. Uma lista sem regra geral envelhece
//                        na primeira migration;
//   `valorNaTela`        centavo vira R$, data ISO vira data brasileira, `true`
//                        vira "sim". O valor cru é honesto e ilegível: "12345"
//                        e "R$ 123,45" são o mesmo dado e não são a mesma frase.
//
// ⚠️ A REGRA QUE NÃO É ÓBVIA, e ela é o coração desta tela: **traduzir não pode
// esconder**. Nenhuma coluna é omitida por ser feia, e o que não tem tradução
// aparece com o nome que tem. Uma trilha que decide sozinha o que merece ser
// vista é uma trilha em que a alteração inconveniente é a que some.
//
// É PURO PELO MOTIVO DE SEMPRE (regra 8): o runner do `web/` não lê JSX.

import { emReais } from './dinheiro.ts';

/** O espelho de `Mudanca` do servidor (`src/dominio/trilha.ts`). */
export type Mudanca = {
  coluna: string;
  de: string | null;
  para: string | null;
  cortado?: true;
};

export type OperacaoDaTrilha = 'I' | 'U' | 'D';

export type LinhaDaTrilha = {
  id: string;
  ocorrido_em: string;
  tabela: string;
  registro_id: string | null;
  operacao: OperacaoDaTrilha;
  quem: string | null;
  usuario_id: string | null;
  de_plataforma: boolean;
  mudancas: Mudanca[];
};

export type RespostaDaTrilha = {
  linhas: LinhaDaTrilha[];
  tabelas: Array<{ tabela: string; linhas: number }>;
  teto: number;
};

/* ==========================================================================
 * AS TABELAS, EM PORTUGUÊS
 * ==========================================================================
 *
 * SÃO NOMES DE COISA, e por isso vêm em minúscula e no singular: eles entram no
 * meio de uma frase ("alterou **uma unidade consumidora**"), e não como título
 * de coluna.
 *
 * ⚠️ A LISTA É CONFERIDA CONTRA AS MIGRATIONS, e não contra a memória de quem
 * escreve: `web/tests/historico.ts` lê os gatilhos `auditar_*` do próprio
 * `prisma/migrations` e exige rótulo para cada tabela auditada. Uma migration
 * nova que passe a auditar uma tabela sem rótulo aqui **derruba a suíte** — que
 * é o único jeito de uma lista destas não envelhecer.
 *
 * As três do fim (`tarifa`, `layout_do_documento`, `bloco_do_documento`) são de
 * tabelas que já não existem, e ficam de propósito: a trilha guarda o que
 * aconteceu quando elas existiam, e sem rótulo aquelas linhas apareceriam como
 * nome de tabela para sempre.
 */
export const ROTULO_DA_TABELA: Record<string, string> = {
  // cadastro
  cliente: 'cliente',
  cliente_estado_crm: 'situação do cliente no outro sistema',
  unidade_consumidora: 'unidade consumidora',
  contrato: 'contrato',
  usina: 'usina',
  usina_geracao: 'geração da usina',
  dono_usina: 'dono de usina',
  originador: 'originador',
  chave_pix: 'chave Pix',
  regra_comissao: 'regra de comissão',
  regra_repasse: 'regra de repasse',
  tarifa: 'tarifa',

  // o dinheiro
  fatura: 'fatura',
  boleto: 'boleto',
  liquidacao: 'baixa de pagamento',
  split_execucao: 'divisão do dinheiro recebido',
  split_item: 'parte da divisão do dinheiro',
  conta_pagar: 'conta a pagar',
  pagamento: 'pagamento de conta',
  categoria: 'categoria de despesa',
  centro_custo: 'centro de custo',

  // a fatura que o cliente recebe
  registro_de_fatura_unificada: 'conta lida da distribuidora',
  modelo_de_fatura: 'modelo da fatura',
  campo_personalizado_da_fatura: 'campo da fatura',
  campo_do_documento: 'campo do documento',
  identidade_de_cobranca: 'identidade de quem cobra',
  logo_de_cobranca: 'logotipo da cobrança',
  layout_do_documento: 'desenho do documento',
  bloco_do_documento: 'bloco do documento',

  // o que liga este sistema aos outros
  conector_cobranca: 'ligação com o banco',
  conector_crm: 'ligação com o outro sistema',
  conector_execucao: 'rodada da leitura do outro sistema',
  agenda_execucao: 'rodada automática da cobrança',

  // quem entra
  tenant: 'empresa',
  usuario: 'pessoa',
  usuario_tenant: 'acesso de uma pessoa',
  plataforma_admin: 'administração do sistema',
};

/** O nome legível, ou o nome cru quando ninguém traduziu — nunca um vazio. */
export const rotuloDaTabela = (t: string): string => ROTULO_DA_TABELA[t] ?? t;

/**
 * O BATIMENTO DA MÁQUINA — o espelho da lista do servidor
 * (`src/repos/auditoria.ts`), e as duas são conferidas uma contra a outra pela
 * suíte, porque duas listas que discordam produziriam uma tela que promete
 * esconder e mostra, ou que promete mostrar e esconde.
 *
 * Medido em produção em 10/09/2026: **96% de toda a trilha são estas três**, e
 * elas crescem 1.440 linhas por dia contra 20 de tudo o que pessoas fazem. O
 * porquê inteiro está no servidor; aqui fica o que a tela precisa para escrever
 * a frase do interruptor.
 */
export const RODADAS_AUTOMATICAS: readonly string[] =
  ['conector_execucao', 'agenda_execucao', 'conector_crm'];

export const ehRodadaAutomatica = (t: string): boolean => RODADAS_AUTOMATICAS.includes(t);

/* ==========================================================================
 * AS COLUNAS
 * ========================================================================== */

/**
 * OS RÓTULOS QUE A REGRA GERAL ERRARIA, e só eles.
 *
 * A regra geral abaixo acerta a maioria (`valor_pago_centavos` → "valor pago"),
 * e uma lista com trezentas linhas seria uma lista que ninguém mantém. Aqui
 * ficam os casos em que o resultado dela seria errado ou confuso.
 */
const ROTULO_DA_COLUNA: Record<string, string> = {
  status: 'situação',
  ativo: 'está ativo',
  documento: 'CPF ou CNPJ',
  chave_pix: 'chave Pix',
  tipo_chave_pix: 'tipo da chave Pix',
  data_pagamento: 'data do pagamento',
  data_liquidacao: 'data da baixa',
  valor_centavos: 'valor',
  criado_em: 'criado em',
  cancelada_em: 'cancelada em',
  cancelado_em: 'cancelado em',
  emitida_em: 'emitida em',
  numero_uc: 'número da unidade',
  codigo_geradora: 'código da usina',
  percentual_rateio: 'percentual do rateio',
  dia_vencimento: 'dia do vencimento',
  credencial_ref: 'onde mora a senha do banco',
  certificado_expira_em: 'validade do certificado',
  ultimo_erro: 'último erro do banco',
  nosso_numero: 'número do boleto no banco',
  linha_digitavel: 'linha digitável',
  origem_split_item_id: 'de qual parte da divisão nasceu',
  registro_id: 'registro',
};

/**
 * O NOME DA COLUNA VIRANDO FRASE, quando não há tradução escrita.
 *
 * Três cortes, e cada um desfaz uma convenção do banco que não é do leitor:
 * `_centavos` (o valor já sai em reais), `_id` (o que interessa é a coisa, não
 * a chave) e o sublinhado. O que sobra é lido em voz alta sem tropeço:
 * `valor_pago_centavos` → "valor pago", `categoria_id` → "categoria".
 */
export function rotuloDaColuna(coluna: string): string {
  const escrito = ROTULO_DA_COLUNA[coluna];
  if (escrito) return escrito;
  return coluna
    .replace(/_centavos$/, '')
    .replace(/_id$/, '')
    .replace(/_/g, ' ');
}

/* ==========================================================================
 * OS VALORES
 * ========================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/**
 * O valor de uma coluna, do jeito que a pessoa lê.
 *
 * A COLUNA DECIDE O FORMATO, e não o valor: "12345" é R$ 123,45 em
 * `valor_centavos` e é o número da unidade em `numero_uc`. Adivinhar pelo
 * formato do valor produziria dinheiro onde não há — que é o erro caro.
 *
 * ⚠️ VAZIO NÃO É ZERO. `null` vira um travessão, e nunca "R$ 0,00": a diferença
 * entre "não tem valor" e "vale nada" é a diferença entre uma parcela que ainda
 * não foi lançada e uma que foi lançada valendo zero.
 */
export function valorNaTela(coluna: string, v: string | null): string {
  if (v === null) return '—';
  if (v === '') return '(vazio)';

  if (/_centavos$/.test(coluna)) {
    const n = Number(v);
    if (Number.isFinite(n)) return emReais(n);
  }

  if (v === 'true') return 'sim';
  if (v === 'false') return 'não';

  const d = DATA_ISO.exec(v);
  if (d) {
    const dia = `${d[3]}/${d[2]}/${d[1]}`;
    return d[4] ? `${dia} ${d[4]}:${d[5]}` : dia;
  }

  /* O UUID INTEIRO NÃO CABE E NÃO AJUDA: trinta e seis caracteres numa célula
   * empurram a coluna vizinha para fora da tela, e ninguém reconhece um pelo
   * fim. Os oito primeiros bastam para ver que MUDOU, que é a pergunta. */
  if (UUID.test(v)) return `${v.slice(0, 8)}…`;

  return v;
}

/* ==========================================================================
 * A FRASE DE CADA LINHA
 * ========================================================================== */

/** O verbo, no passado — a trilha só fala de coisa que já aconteceu. */
export const VERBO: Record<OperacaoDaTrilha, string> = {
  I: 'criou',
  U: 'alterou',
  D: 'apagou',
};

/**
 * QUEM FEZ, e os quatro casos são diferentes de verdade.
 *
 * Um `null` de `usuario_id` e um `null` de nome parecem a mesma ausência e não
 * são: no primeiro ninguém estava logado (rotina do banco, migration), no
 * segundo alguém estava e essa pessoa não é mais desta empresa — a política de
 * leitura do banco não devolve o nome de quem saiu, e inventar um seria pior que
 * dizer que não se sabe.
 */
export function quemFez(l: LinhaDaTrilha): string {
  if (l.quem) return l.de_plataforma ? `${l.quem} (suporte)` : l.quem;
  if (l.de_plataforma) return 'o suporte do sistema';
  if (l.usuario_id) return 'alguém que não está mais nesta empresa';
  return 'o próprio sistema';
}

/**
 * A LINHA EM UMA FRASE, e ela é o que se lê antes de abrir a diferença.
 *
 * "Maria alterou uma unidade consumidora · vencimento, situação" — o nome, o
 * verbo, a coisa e o que foi tocado. Três campos ou menos aparecem por nome;
 * daí para cima vira contagem, porque uma lista de doze rótulos numa linha de
 * tabela deixa de ser resumo.
 */
export function resumoDaLinha(l: LinhaDaTrilha): string {
  if (l.operacao === 'U' && l.mudancas.length === 0) {
    return 'mandou salvar, e nenhum valor mudou';
  }
  if (l.mudancas.length === 0) return '';
  if (l.mudancas.length <= 3) {
    return l.mudancas.map((m) => rotuloDaColuna(m.coluna)).join(', ');
  }
  return `${l.mudancas.length} campos`;
}

/* ==========================================================================
 * O DIA
 * ==========================================================================
 *
 * A trilha é lida de cima para baixo e o que separa um assunto do outro é o
 * DIA, não a hora: "ontem de manhã alguém mexeu nisso" é como a pessoa lembra.
 * Agrupar aqui, e não na tela, é o que permite verificar a regra sem montar
 * componente.
 */

export type DiaDaTrilha = { dia: string; titulo: string; linhas: LinhaDaTrilha[] };

const soDia = (iso: string): string => iso.slice(0, 10);

/** "hoje", "ontem" ou a data — e a comparação é por texto de data, sem fuso: os
 *  dois lados vêm em ISO, e converter para `Date` só para comparar dia abriria a
 *  porta do fuso do navegador mudar a resposta à meia-noite. */
export function tituloDoDia(dia: string, hoje: string): string {
  if (dia === hoje) return 'hoje';
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  if (dia === d.toISOString().slice(0, 10)) return 'ontem';
  return dia.split('-').reverse().join('/');
}

/** A ordem de chegada é preservada: o servidor já mandou do mais recente para o
 *  mais antigo, e reordenar aqui seria uma segunda opinião sobre a mesma coisa. */
export function porDia(linhas: readonly LinhaDaTrilha[], hoje: string): DiaDaTrilha[] {
  const saida: DiaDaTrilha[] = [];
  for (const l of linhas) {
    const dia = soDia(l.ocorrido_em);
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.linhas.push(l);
    else saida.push({ dia, titulo: tituloDoDia(dia, hoje), linhas: [l] });
  }
  return saida;
}

/** A hora do dia, que é o que a linha mostra depois de o dia virar título. */
export const horaDaLinha = (iso: string): string => iso.slice(11, 16);

/**
 * A RESPOSTA ESTÁ CHEIA? — e por que a tela precisa perguntar isso.
 *
 * Quando voltam exatamente tantas linhas quanto o teto, a lista não terminou:
 * ela foi cortada. Sem dizer isso, "as últimas alterações" pareceria a história
 * inteira, e a alteração que interessa poderia estar logo abaixo do corte.
 */
export const veioCortada = (r: RespostaDaTrilha, pedido: number): boolean =>
  r.linhas.length >= Math.min(pedido, r.teto);
