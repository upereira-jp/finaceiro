// A PLANILHA DE CONTRATOS, lida. Puro: texto entra, linhas saem.
//
// DE ONDE ISTO VEM. O passo 6 do caminho para a primeira fatura e "digitar os 29
// contratos", e ate 05/08/2026 era o unico insumo em massa deste projeto SEM
// importador - usinas, originadores, tarifas, vencimentos e documentos ja tinham
// o seu. A diferenca nao e de conveniencia:
//
//   `contrato` NAO tem caminho de edicao. `src/repos/contrato.ts` expoe
//   `rascunhar`, `ativar`, `suspender`, `encerrar` e `renovar`, e nenhuma
//   delas altera originador, tier, data de fechamento ou valor. A R20-b
//   CONGELA `originador_tipo_no_fechamento` no `rascunhar`.
//
// Errar uma linha na tela, 29 vezes, nao tem volta: o conserto e `encerrar` +
// `renovar`, que abre linha nova, zera `faturas_cheias_pagas` e deixa na trilha
// uma renovacao que nao houve comercialmente. Um arquivo conferido inteiro antes
// de escrever e o unico ponto em que esses 29 atos irreversiveis ainda sao
// revisaveis de uma vez.
//
// POR QUE PURO E SEPARADO DO SCRIPT. Regra 8, e a mesma razao das outras tres
// planilhas: o que decide um valor que vai para o banco tem de ser exercitavel
// sem banco, sem arquivo e sem `--valendo`.
//
// ============================================================================
// O MODO DE FALHA QUE ESTE MODULO PERSEGUE, e ele nao e o das outras tres
//
// Em tarifas o risco e a ESCALA ("1.234" valendo R$ 1,23). Em vencimentos, o dia
// curto. Em documentos, a COLISAO no meio do lote. Aqui o risco e outro e tem
// nome: **a celula plausivel que muda quem recebe dinheiro, e que nao produz
// erro em lugar nenhum depois de gravada.**
//
//   originador     decide QUEM recebe 25% a 60% do consumo, todo mes, e o tier
//                  congela no rascunhar. Trocado, ninguem percebe: o split roda,
//                  fecha e paga - a pessoa errada
//   sem originador PIOR que o errado. `src/dominio/split.ts` so monta o item de
//                  comissao quando ha `originador_id` E tier congelado; sem ele
//                  a reparticao roda, fecha e NAO PAGA - sem erro, sem log e sem
//                  recusa. Por isso a coluna e OBRIGATORIA aqui, como e no botao
//                  da tela (`web/src/contrato-regras.ts`)
//   fechamento     decide `flag_fatura_cheia` (`ehFaturaCheia`), e portanto em
//                  que mes a comissao daquele contrato COMECA. Um dia depois do
//                  primeiro do mes adia uma parcela inteira
//
// E o silencioso de verdade: **fechamento no futuro**. `ehFaturaCheia` compara
// `fechamento <= inicio da competencia`, entao uma data adiante do mes faturado
// torna toda fatura PARCIAL - e parcial nao avanca o contador nem paga comissao.
// O sistema nao erra, nao loga e nao recusa: simplesmente nunca comeca a pagar.
// Nao da para recusar isso aqui sem saber que dia e hoje, e "hoje" nao entra num
// modulo puro - entao a comparacao e `fechamentoNoFuturo`, que recebe a data de
// fora e tem teste proprio.

import { reaisParaCentavos, type Centavos } from './centavos.ts';

/** As duas origens do valor de referencia, e o enum do banco tem exatamente
 *  estas duas. Nao ha default: ver `lerOrigemDoValor`. */
export type OrigemDoValor = 'crm_consumo_reais' | 'local';

export type LinhaDeContrato = {
  /** 1-based e contando a linha do cabecalho, para bater com o que a pessoa ve
   *  aberto no Excel. */
  linha: number;
  numero_uc: string;
  /** O uuid do originador. Obrigatorio - ver o cabecalho. */
  originador_id: string;
  /** Meia-noite UTC do dia de fechamento. */
  data_fechamento: Date;
  valor_referencia_centavos: Centavos;
  valor_referencia_origem: OrigemDoValor;
  /** Os textos originais das celulas, para o ensaio imprimir a INTERPRETACAO ao
   *  lado do que a pessoa digitou - o mesmo recurso do importador de tarifas, e
   *  pela mesma razao: um valor lido certo pelo numero errado so aparece assim. */
  bruto: { fechamento: string; valor: string };
};

export type ErroDeContrato = { linha: number; motivo: string };

export type PlanilhaDeContratos = {
  linhas: LinhaDeContrato[];
  erros: ErroDeContrato[];
  vazias: number;
  cabecalho: boolean;
};

/** O separador e `;`, como nas outras tres planilhas e em `web/src/csv.ts`. */
const SEP = ';';

const semAspas = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
};

/** A forma do uuid, e so a forma - quem existe de verdade e o banco que diz. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehUuid = (s: string): boolean => UUID.test(s.trim());

/**
 * Le a celula de fechamento e devolve meia-noite UTC daquele dia.
 *
 * DUAS FORMAS, e as duas sao as que o Excel produz sozinho:
 *   "2026-06-05"     -> 2026-06-05T00:00:00Z
 *   "05/06/2026"     -> 2026-06-05T00:00:00Z
 *
 * O DIA SOZINHO E RECUSADO, e essa e a diferenca deliberada para
 * `lerDiaDoVencimento`. La "10" e a resposta certa e a data completa e a
 * tolerancia; aqui e o inverso - o ano e o mes SAO o dado, porque e deles que
 * sai `flag_fatura_cheia`. Aceitar "5" obrigaria a inventar o mes.
 *
 * E a data e conferida contra o CALENDARIO, nao contra a forma: "31/02/2026"
 * casa com a expressao regular e nao existe. `new Date` normalizaria para 03/03
 * em silencio, que e um fechamento um mes adiante do digitado - e um mes adiante
 * e exatamente a unidade em que `ehFaturaCheia` decide.
 *
 * Levanta com a razao dita. Quem chama transforma em erro de linha.
 */
export function lerDataDeFechamento(bruto: string): Date {
  const t = bruto.trim();
  if (t === '') {
    throw new Error(
      'a celula da data de fechamento esta vazia. Nao ha default: ela decide `flag_fatura_cheia` ' +
      'e portanto em que mes a comissao deste contrato comeca (PRD 5.4)');
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);

  let ano: number, mes: number, dia: number;
  if (iso) { ano = Number(iso[1]); mes = Number(iso[2]); dia = Number(iso[3]); }
  else if (br) { dia = Number(br[1]); mes = Number(br[2]); ano = Number(br[3]); }
  else {
    throw new Error(
      `"${bruto}" nao e uma data de fechamento. Aceito: "2026-06-05" ou "05/06/2026". ` +
      'O dia sozinho NAO serve - o mes e o ano sao o dado aqui, porque e deles que sai ' +
      'a primeira fatura cheia');
  }

  if (mes < 1 || mes > 12) throw new Error(`mes ${mes} nao existe em "${bruto}"`);
  if (dia < 1 || dia > 31) throw new Error(`dia ${dia} nao existe em "${bruto}"`);

  const d = new Date(Date.UTC(ano, mes - 1, dia));
  /*
   * A VOLTA CONFERE O CALENDARIO. `Date.UTC(2026, 1, 31)` devolve 03/03/2026 sem
   * reclamar, e um fechamento um mes adiante do digitado muda a competencia da
   * primeira fatura cheia. Comparar os tres campos de volta e o unico jeito de
   * pegar isso - nao ha excecao a capturar.
   */
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(
      `"${bruto}" nao existe no calendario - ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} ` +
      `de ${ano} viraria ${d.toISOString().slice(0, 10)}, um mes adiante do digitado`);
  }
  return d;
}

/**
 * O fechamento esta adiante de hoje?
 *
 * NAO E ERRO DE ARQUIVO, e por isso nao vive no leitor: pre-cadastrar um
 * contrato que fecha semana que vem e legitimo. E o efeito precisa ser VISTO
 * antes de gravar, porque ele e mudo - `ehFaturaCheia` compara
 * `fechamento <= inicio da competencia`, entao enquanto a data estiver no futuro
 * TODA fatura sai parcial: nao avanca `faturas_cheias_pagas` e nao paga comissao
 * nenhuma. Sem erro, sem log, sem recusa.
 *
 * `hoje` entra por parametro para este modulo continuar puro e a regra continuar
 * testavel - a mesma razao pela qual `competencia()` nao tem "mes corrente".
 */
export function fechamentoNoFuturo(fechamento: Date, hoje: Date): boolean {
  const dia = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return fechamento.getTime() > dia;
}

/**
 * Le a celula de origem do valor. Sem default, de proposito.
 *
 * As duas sao os rotulos do enum `valor_referencia_origem` do banco, e a coluna
 * existe no arquivo em vez de ser deduzida porque a deducao possivel mentiria:
 * "veio do CRM se o valor for igual ao que o CRM disse" marca como CRM um valor
 * que a pessoa digitou por acaso igual, e marca como local o mesmo numero
 * redigitado com outra mascara.
 */
export function lerOrigemDoValor(bruto: string): OrigemDoValor {
  const t = bruto.trim().toLowerCase();
  if (t === 'crm_consumo_reais') return 'crm_consumo_reais';
  if (t === 'local') return 'local';
  if (t === '') {
    throw new Error(
      'a celula de origem do valor esta vazia. Nao ha default: `crm_consumo_reais` diz que o ' +
      'numero veio do consumo que o CRM registrou na venda, `local` diz que uma pessoa o ' +
      'escolheu aqui - e a segunda nao se deduz da primeira');
  }
  throw new Error(
    `"${bruto}" nao e uma origem de valor. Sao duas, e sao os rotulos do enum do banco: ` +
    '`crm_consumo_reais` ou `local`');
}

/**
 * Le o conteudo de um CSV de cinco colunas:
 *
 *   numero_uc ; originador_id ; data_fechamento ; valor_referencia ; origem
 *
 * POR QUE A CHAVE E O `numero_uc` E NAO O uuid DA UC. E o mesmo argumento do
 * `lancarVencimentosPorUC` e do `lancarTarifasPorUC`, e vale aqui inteiro: e o
 * identificador que a operacao tem na mao, aparece na fatura de energia, e
 * `uc_numero_unico` e indice unico CHEIO sobre `(tenant_id, numero_uc)` - entao
 * navegar por ele nao esbarra na regra 11.
 *
 * A planilha de DOCUMENTOS e a excecao do projeto e continua sendo: la a chave e
 * o cliente, e as duas chaves legiveis de cliente foram medidas e descartadas
 * (`lead.codigo` muda sozinho, nome nao e unico). UC nao tem esse problema.
 *
 * POR QUE O ORIGINADOR E uuid E NAO O NOME. Pelo motivo oposto: aqui o nome
 * seria chave de uma pessoa, e o projeto ja decidiu que nome nao e chave. O
 * modelo sai com o nome do cadastro E o nome que o CRM creditou lado a lado,
 * justamente para a conferencia ser possivel sem ler uuid.
 *
 * Colunas adicionais sao IGNORADAS, como nas outras tres planilhas.
 */
export function lerPlanilhaDeContratos(conteudo: string): PlanilhaDeContratos {
  // BOM UTF-8: o Excel o escreve, e sem tirar aqui o primeiro `numero_uc` viria
  // com um caractere invisivel na frente e nao casaria com UC nenhuma.
  const texto = conteudo.replace(/^﻿/, '');
  const cruas = texto.split(/\r\n|\n|\r/);

  const linhas: LinhaDeContrato[] = [];
  const erros: ErroDeContrato[] = [];
  const vistas = new Map<string, number>();
  let vazias = 0;
  let cabecalho = false;

  cruas.forEach((crua, i) => {
    const numeroDaLinha = i + 1;
    if (crua.trim() === '') { vazias++; return; }

    if (!crua.includes(SEP)) {
      erros.push({
        linha: numeroDaLinha,
        motivo: 'nao ha ";" nesta linha - o arquivo precisa de cinco colunas: numero da UC, ' +
                'id do originador, data de fechamento, valor de referencia e origem do valor',
      });
      return;
    }

    const campos = crua.split(SEP).map(semAspas);
    const uc = campos[0] ?? '';
    const orig = campos[1] ?? '';
    const fechamento = campos[2] ?? '';
    const valor = campos[3] ?? '';
    const origem = campos[4] ?? '';

    /*
     * O CABECALHO PRECISA FALHAR NAS TRES COLUNAS CONFERIVEIS, e so na PRIMEIRA
     * linha util. Esta e a diferenca deliberada para as outras tres planilhas.
     *
     * Elas reconhecem o cabecalho por UMA coluna nao ser um valor valido, e isso
     * carrega um risco que os proprios arquivos registram: **a primeira linha de
     * dado com aquela celula digitada errada e engolida como "cabecalho" e some
     * sem erro**. La o risco e aceito porque a chave (numero de UC) nao tem forma
     * conferivel e so ha uma coluna de valor.
     *
     * Aqui ha tres colunas com forma: uuid, data e dinheiro. Exigir que as TRES
     * falhem juntas custa nada e fecha o buraco - uma linha com uuid de
     * originador e valor em reais NAO e cabecalho, mesmo com a data digitada
     * errada: ela vira erro nomeado, com o numero da linha. Para ser engolida,
     * uma linha teria de nao ter originador, nem data legivel, nem valor - que e
     * a descricao de um cabecalho.
     */
    if (linhas.length === 0 && erros.length === 0 && !cabecalho) {
      const dataFalha = (() => { try { lerDataDeFechamento(fechamento); return false; } catch { return true; } })();
      const valorFalha = (() => { try { reaisParaCentavos(valor); return false; } catch { return true; } })();
      if (dataFalha && valorFalha && !ehUuid(orig)) {
        cabecalho = true;
        return;
      }
    }

    if (!uc) {
      erros.push({ linha: numeroDaLinha, motivo: 'o numero da UC esta vazio' });
      return;
    }

    /*
     * ORIGINADOR VAZIO E RECUSA, E ELA E A RAZAO DESTE ARQUIVO EXISTIR.
     *
     * Um contrato gravado sem originador nao paga NUNCA: `split.ts` so monta o
     * item de comissao quando ha `originador_id` E tier congelado, entao a
     * reparticao roda, fecha e nao paga - sem erro, sem log e sem recusa. E a
     * R20-b congela no `rascunhar`, entao nao ha conserto que nao seja encerrar
     * e renovar. A tela ja trava por isso (`podeCriarContrato`); aqui trava
     * igual, e a simetria e deliberada - dois caminhos de escrita com travas
     * diferentes sao duas regras.
     */
    if (!orig) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc}: o originador esta vazio. Contrato sem originador NAO paga comissao ` +
                'nunca - o split roda, fecha e nao monta o item, sem erro e sem log - e a R20-b ' +
                'congela no rascunhar, entao nao ha conserto sem encerrar e renovar',
      });
      return;
    }
    if (!ehUuid(orig)) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc}: "${orig}" nao e um id de originador. E o uuid que o --modelo escreve ` +
                'quando o originador ja esta cadastrado; nome nao serve de chave. Se a coluna ' +
                'saiu vazia, rode `npm run originadores` e gere o modelo de novo',
      });
      return;
    }

    let data: Date;
    try {
      data = lerDataDeFechamento(fechamento);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    let centavos: Centavos;
    try {
      centavos = reaisParaCentavos(valor);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }
    /*
     * VALOR NEGATIVO E RECUSA. `valor_referencia_centavos` e `integer NOT NULL` e
     * o banco aceitaria o negativo - ele nao entra em nenhuma conta de fatura
     * (a base e geracao x tarifa, R23), entao nada estouraria depois. E
     * justamente por nao estourar que ele fica: uma referencia negativa em tela
     * de contrato nao tem leitura nenhuma em que esteja certa.
     */
    if (centavos < 0) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc}: valor de referencia negativo ("${valor}"). Nao ha leitura em que isso ` +
                'esteja certo, e o banco aceitaria - a coluna e `integer` sem CHECK',
      });
      return;
    }

    let origemLida: OrigemDoValor;
    try {
      origemLida = lerOrigemDoValor(origem);
    } catch (e) {
      erros.push({ linha: numeroDaLinha, motivo: `UC ${uc}: ${(e as Error).message}` });
      return;
    }

    /*
     * UC REPETIDA E RECUSA DE ARQUIVO, e nao "a ultima vence". A R14 da um
     * contrato vigente por UC: as duas linhas nao podem coexistir, e escolher
     * uma delas aqui seria escolher em silencio qual originador recebe.
     */
    const antes = vistas.get(uc);
    if (antes !== undefined) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `UC ${uc} repetida - ja aparece na linha ${antes}. A R14 da UM contrato vigente ` +
                'por UC, entao as duas nao podem existir juntas, e as duas sao plausiveis',
      });
      return;
    }

    vistas.set(uc, numeroDaLinha);
    linhas.push({
      linha: numeroDaLinha,
      numero_uc: uc,
      originador_id: orig.toLowerCase(),
      data_fechamento: data,
      valor_referencia_centavos: centavos,
      valor_referencia_origem: origemLida,
      bruto: { fechamento, valor },
    });
  });

  return { linhas, erros, vazias, cabecalho };
}

/** O modelo que o `--modelo` imprime quando nao ha banco a consultar. Com banco,
 *  `npm run contratos -- --modelo` sai preenchido com as UCs reais. */
export const MODELO_DE_CONTRATOS =
  'numero_uc;originador_id;data_fechamento;valor_referencia;origem;fatura;cliente;usina;originador_crm\n' +
  '000406456101252;7f1c6d2e-0000-4000-8000-000000000001;2026-06-05;565,00;crm_consumo_reais;sim;FULANO DE TAL;0001;Renata\n' +
  '000407359701237;7f1c6d2e-0000-4000-8000-000000000001;05/06/2026;1.130,00;crm_consumo_reais;sim;BELTRANA DA SILVA;0001;Renata\n';

// ============================================================================
// O MODELO PREENCHIDO
//
// Tres colunas saem preenchidas do CRM e uma sai preenchida do nosso cadastro, e
// a distincao entre elas e o assunto deste bloco.
//
//   data_fechamento   `vendas_creditadas.ganho_em` - o instante em que a venda
//                     foi dada por ganha. E SUGESTAO, nao decisao: "fechamento"
//                     no sentido do contrato pode nao ser o dia do ganho, e a
//                     escolha muda em que mes a comissao comeca (Q-FATCHEIA-01,
//                     que continua aberta). Vem preenchida porque o dia do ganho
//                     e o unico dado que existe; vem numa coluna editavel porque
//                     nao e nossa decisao
//   valor_referencia  `vendas_ganhas.consumo_reais`, medido em 29 de 29
//   origem            `crm_consumo_reais` quando o valor veio de la, e o rotulo
//                     acompanha o valor - trocar um sem o outro e a unica coisa
//                     que este arquivo NAO consegue pegar sozinho
//   originador_id     o uuid do NOSSO cadastro, resolvido pelo nome que o CRM
//                     creditou. Sai VAZIO enquanto o originador nao existir -
//                     e o arquivo entao e recusado pelo leitor, de proposito
//
// A COLUNA `originador_crm` FICA MESMO QUANDO O uuid RESOLVEU, e ela e a unica
// forma de conferir a atribuicao sem ler uuid. Foi o eixo do originador que
// custou uma sessao inteira (Q-EIXO-FUNCIONARIO-01): o mapa de 30/07 estava
// errado em 12 das 41 UCs e ninguem tinha como ver isso na tela.

export type LinhaDoModeloDeContrato = {
  numero_uc: string;
  /** Vazio quando o nome creditado pelo CRM nao casa com nenhum originador
   *  cadastrado - o que e o estado de hoje, com `originador` em 0 linhas. */
  originador_id: string;
  /** Sugerido a partir de `ganho_em`. Vazio quando o CRM nao tem credito para
   *  esta UC - e ai a decisao e inteiramente de quem preenche. */
  data_fechamento: string;
  valor_referencia: string;
  origem: string;
  cliente: string;
  usina: string;
  /** O nome que o CRM creditou, para conferir a atribuicao sem ler uuid. */
  originador_crm: string;
  /** O nome do originador no NOSSO cadastro, quando o uuid resolveu. */
  originador_cadastro: string;
  /** Ja tem contrato vigente: a linha nao vira contrato novo (R14). */
  ja_contratada: boolean;
  /** Faturavel hoje: o mesmo predicado da triagem e da prontidao. */
  fatura: boolean;
};

/** O `;` do CSV do Excel pt-BR, e o mesmo escape do `web/src/csv.ts`. */
const celula = (v: string): string =>
  /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * O CSV do modelo, montado. PURO de proposito (regra 8): o que decide a ORDEM e
 * a MARCA das linhas e o que a pessoa vai ler.
 *
 * A ORDEM TEM TRES NIVEIS, e cada um resolve uma pergunta diferente de quem abre
 * o arquivo:
 *
 *   1. o que FALTA primeiro   ja contratada desce - reimportar nao a duplica,
 *                             mas ela tambem nao e trabalho
 *   2. o que FATURA primeiro  as 12 com rateio nao ativado no CRM descem e vao
 *                             marcadas, pela mesma razao medida no modelo de
 *                             vencimentos: pedir 41 para cobrar 29 e o defeito
 *   3. por usina e por UC     o bloco continuo em que se confere sem procurar
 */
export function montarModeloDeContratos(linhas: LinhaDoModeloDeContrato[]): string {
  const ordenadas = [...linhas].sort((a, b) =>
    (a.ja_contratada === b.ja_contratada ? 0 : a.ja_contratada ? 1 : -1) ||
    (a.fatura === b.fatura ? 0 : a.fatura ? -1 : 1) ||
    a.usina.localeCompare(b.usina) ||
    a.numero_uc.localeCompare(b.numero_uc));

  // BOM UTF-8 primeiro: sem ele o Excel pt-BR abre "GABRIELLA" com acento quebrado.
  let csv = '﻿' +
    'numero_uc;originador_id;data_fechamento;valor_referencia;origem;' +
    'fatura;ja_contratada;cliente;usina;originador_crm;originador_cadastro\n';
  for (const l of ordenadas) {
    csv += [
      celula(l.numero_uc), celula(l.originador_id), celula(l.data_fechamento),
      celula(l.valor_referencia), celula(l.origem),
      l.fatura ? 'sim' : 'NAO', l.ja_contratada ? 'sim' : 'NAO',
      celula(l.cliente), celula(l.usina),
      celula(l.originador_crm || '(sem credito no CRM)'),
      celula(l.originador_cadastro || '(nao cadastrado)'),
    ].join(';') + '\n';
  }
  return csv;
}
