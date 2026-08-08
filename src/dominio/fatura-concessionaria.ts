// A FATURA DA EQUATORIAL, LIDA. Puro: campos de texto entram, leitura validada
// sai. Sem rede, sem banco, sem portal, sem modelo de visao.
//
// DE ONDE ISTO VEM. A frente de "leitura automatica de fatura via imagem" pedida
// em 07/08/2026. O que este arquivo cobre e a metade que NAO depende de nada
// externo: dado o conjunto de campos que alguem extraiu do documento - por OCR,
// por modelo de visao, por PDF com camada de texto ou digitados a mao -, o que
// vale como valor do sistema e o que e recusa nomeada.
//
// A EXTRACAO NAO MORA AQUI, e a separacao e o ponto. Qual rotulo da fatura da
// Equatorial corresponde a qual campo e uma medicao que ninguem deste lado fez
// ainda (`Q-EQTL-CAMPOS-01`); o que este modulo faz e garantir que, seja qual
// for a resposta, o numero que chega na coluna de dinheiro esteja certo ou seja
// recusado com nome. Trocar o extrator nao toca uma linha daqui.
//
// ============================================================================
// A DECISAO QUE IMPORTA: `total_a_pagar` NAO E `valor_tarifas_concessionaria`
//
// E o modo de falha mais caro desta frente inteira, e ele e silencioso.
//
// O `PRD-v2.2` §5.1 define a coluna com precisao: `valor_tarifas_concessionaria`
// e **fio B, iluminacao publica e encargos** - "repasse puro a Equatorial",
// sobre o qual "ninguem comissiona nem repassa". O total da fatura da Equatorial
// e outra coisa: ele inclui o consumo que a compensacao abateu, tributos e
// bandeira. Sao numeros da mesma pagina, ambos plausiveis, e a diferenca entre
// eles NAO aparece como erro - aparece como fatura de valor errado, comissao
// errada e repasse errado, porque a base do split (`PRD` §5.4 e §5.5) exclui
// justamente esta parcela.
//
// Por isso aqui a soma e EXPLICITA e por componente. `total_a_pagar` entra como
// CONFERENCIA e nunca como fonte: se ele vier, a leitura compara; se ele nao
// vier, nada muda. Nao existe caminho neste arquivo em que o total vire o valor.
//
// ============================================================================
// AS TRES TENTACOES, todas erradas do mesmo jeito - e a lista e a mesma de
// `planilha-tarifas.ts`, porque o modo de falha e o mesmo:
//
//   assumir zero para campo ausente   AUSENTE NAO E ZERO. Uma fatura sem a
//                                     linha de iluminacao publica e uma fatura
//                                     que ninguem leu direito, nao uma fatura
//                                     com COSIP de R$ 0,00
//   completar o que falta pelo total  o total menos as partes conhecidas da um
//                                     numero. Ele so nao e o numero certo
//   pular o campo que nao entende     a leitura fica incompleta e parece completa
//
// Entao: cada campo vira valor OU erro nomeado, nunca as duas coisas e nunca
// nenhuma. Quem decide o que fazer com os erros e o chamador.

import { reaisParaCentavos, ReaisInvalidos, type Centavos } from './centavos.ts';

/** Como o campo chega do extrator: o texto cru, ou a ausencia dele. */
export type CampoBruto = string | null | undefined;

/**
 * Os campos que o sistema precisa da fatura da distribuidora.
 *
 * NAO E a fatura inteira, e a poda e deliberada: cada campo aqui tem destino em
 * coluna ou em conferencia. Um extrator que devolva mais do que isto nao quebra
 * nada; um que devolva menos e recusado nomeando o que faltou.
 */
export type CamposDaFatura = {
  /** O que casa com `unidade_consumidora.numero_uc`. 15 digitos em producao. */
  numero_uc: CampoBruto;
  /** `MM/AAAA`, `AAAA-MM` ou `AAAA-MM-DD`. Vira o primeiro dia do mes. */
  competencia: CampoBruto;

  // --- as tres parcelas que SOMAM a coluna, PRD 5.1 ---
  fio_b: CampoBruto;
  iluminacao_publica: CampoBruto;
  encargos: CampoBruto;

  // --- conferencia, nunca fonte ---
  total_a_pagar?: CampoBruto;

  // --- grandezas fisicas: escala decimal, regra 1. NUNCA viram centavos ---
  consumo_kwh?: CampoBruto;
  energia_compensada_kwh?: CampoBruto;
};

export type ErroDaLeitura = { campo: string; motivo: string };

/**
 * Divergencia que NAO impede a leitura de valer.
 *
 * A distincao e a mesma da `prontidao` e do `conferirTarifas`: conta e nao
 * decide. Um total que nao fecha com as partes e sinal de que a extracao pode
 * ter errado - e tambem e o caso normal, porque o total inclui consumo e
 * tributos que nao entram na coluna. Recusar por isso seria a leitura inventando
 * regra de negocio; calar seria perder o unico sinal barato que existe.
 */
export type AvisoDaLeitura = { campo: string; observacao: string };

export type LeituraDaFatura = {
  numero_uc: string;
  /** `AAAA-MM-01`, como a coluna `fatura.competencia`. */
  competencia: string;
  /** A soma explicita das tres parcelas. E o unico numero que vai para a coluna. */
  tarifas_concessionaria_centavos: Centavos;
  componentes: {
    fio_b: Centavos;
    iluminacao_publica: Centavos;
    encargos: Centavos;
  };
  /** Presente so se o extrator devolveu. Conferencia, nao fonte. */
  total_a_pagar_centavos: Centavos | null;
  /** Texto decimal preservado. Regra 1: kWh nao e dinheiro e nao vira centavos. */
  consumo_kwh: string | null;
  energia_compensada_kwh: string | null;
  avisos: AvisoDaLeitura[];
};

export type ResultadoDaLeitura =
  | { ok: true; leitura: LeituraDaFatura }
  | { ok: false; erros: ErroDaLeitura[] };

// ---------------------------------------------------------------- utilitarios

const vazio = (v: CampoBruto): boolean => v === null || v === undefined || String(v).trim() === '';

/**
 * Tira o que o documento carrega e o conversor nao aceita: simbolo de moeda,
 * espaco fino, espaco nao-quebravel.
 *
 * NAO tira ponto nem virgula, e essa e a linha inteira do cuidado: `1.234` e
 * ambiguo de verdade, e quem resolve a ambiguidade e `reaisParaCentavos`, que ja
 * tem a regra medida e testada. Reimplementar a limpeza aqui faria "1.234" valer
 * uma coisa na planilha e outra na fatura lida.
 */
const semMoeda = (v: string): string =>
  v.replace(/R\$/gi, '').replace(/[   \s]/g, '').trim();

function dinheiro(campo: string, bruto: CampoBruto, erros: ErroDaLeitura[]): Centavos | null {
  if (vazio(bruto)) {
    erros.push({
      campo,
      motivo: 'ausente na leitura — e ausente nao e zero. Uma parcela que o documento nao mostrou '
        + 'e uma extracao incompleta, nao uma parcela de R$ 0,00',
    });
    return null;
  }
  const texto = semMoeda(String(bruto));
  try {
    const c = reaisParaCentavos(texto);
    if (c < 0) {
      erros.push({ campo, motivo: `"${String(bruto).trim()}" e negativo, e parcela de repasse nao e credito` });
      return null;
    }
    return c;
  } catch (e) {
    if (e instanceof ReaisInvalidos) {
      erros.push({ campo, motivo: `"${String(bruto).trim()}" nao virou valor: ${e.message}` });
      return null;
    }
    throw e;
  }
}

/**
 * kWh e percentual mantem escala decimal e nunca convertem para centavos
 * (`CLAUDE.md` regra 1). Entao aqui nao ha conversao nenhuma: ha validacao de
 * forma e o texto normalizado de volta, com ponto como separador decimal, que e
 * o que `numeric(14,4)` aceita.
 */
function grandeza(campo: string, bruto: CampoBruto, erros: ErroDaLeitura[]): string | null {
  if (vazio(bruto)) return null;             // opcional: ausencia nao e erro aqui
  const t = semMoeda(String(bruto)).replace(/kwh/gi, '');
  // Milhar com ponto e decimal com virgula, ou decimal com ponto. Sem os dois papeis
  // para o mesmo caractere na mesma string.
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(normal)) {
    erros.push({ campo, motivo: `"${String(bruto).trim()}" nao e uma quantidade em kWh` });
    return null;
  }
  return normal;
}

/**
 * O numero da UC do documento contra o numero da UC do banco.
 *
 * ZERO A ESQUERDA E O CASO REAL, nao hipotetico: medido em 07/08/2026, as 41 UCs
 * de producao tem 15 digitos com zero a esquerda (`000000013290060`), e todo
 * caminho que passa por planilha, OCR ou celula de Excel perde esses zeros. Um
 * numero que perde o zero nao casa com nada e a fatura fica sem tarifa - em
 * silencio, porque `lancarTarifasPorUC` devolve `sem_fatura` e segue.
 *
 * O padding aqui e para 15 porque e o que o banco tem hoje, e o comprimento e
 * conferido: um numero MAIOR que 15 digitos nao e um zero perdido, e outra coisa.
 */
export const DIGITOS_DA_UC = 15;

function numeroDaUC(bruto: CampoBruto, erros: ErroDaLeitura[]): string | null {
  if (vazio(bruto)) {
    erros.push({ campo: 'numero_uc', motivo: 'ausente — sem ele a leitura nao casa com fatura nenhuma' });
    return null;
  }
  const so = String(bruto).replace(/[\s.\-/]/g, '');
  if (!/^\d+$/.test(so)) {
    erros.push({ campo: 'numero_uc', motivo: `"${String(bruto).trim()}" tem caractere que nao e digito` });
    return null;
  }
  if (so.length > DIGITOS_DA_UC) {
    erros.push({
      campo: 'numero_uc',
      motivo: `"${String(bruto).trim()}" tem ${so.length} digitos e a UC tem ${DIGITOS_DA_UC} — `
        + 'isto nao e zero a esquerda perdido, e outro numero',
    });
    return null;
  }
  return so.padStart(DIGITOS_DA_UC, '0');
}

/**
 * O mes por extenso abreviado, como a Equatorial escreve.
 *
 * MEDIDO EM 08/08/2026 numa fatura REAL: a competencia sai como `FEV/2026`, e
 * nao `02/2026`. A primeira versao desta funcao aceitava `MM/AAAA` e `AAAA-MM`
 * e teria RECUSADO toda fatura da Equatorial - o defeito que so apareceu porque
 * o dono trouxe o documento em vez de descreve-lo.
 *
 * Sem acento e em maiuscula porque e assim que o PDF traz; a normalizacao de
 * entrada tira acento antes de consultar, para o caso de outro layout trazer
 * `MAR/2026` com til em alguma variante.
 */
const MES_POR_EXTENSO: Readonly<Record<string, string>> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
};

function competenciaDe(bruto: CampoBruto, erros: ErroDaLeitura[]): string | null {
  if (vazio(bruto)) {
    erros.push({ campo: 'competencia', motivo: 'ausente — a fatura da concessionaria e sempre de um mes' });
    return null;
  }
  const t = String(bruto).trim();
  let ano: string | undefined;
  let mes: string | undefined;

  const iso = /^(\d{4})-(\d{2})(-\d{2})?$/.exec(t);
  const br = /^(\d{2})\/(\d{4})$/.exec(t);
  const extenso = /^([A-Za-zÀ-ÿ]{3,})\.?\/(\d{4})$/.exec(t);
  if (iso) { ano = iso[1]; mes = iso[2]; }
  else if (br) { ano = br[2]; mes = br[1]; }
  else if (extenso) {
    const nome = extenso[1]!.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 3);
    mes = MES_POR_EXTENSO[nome];
    ano = extenso[2];
    if (!mes) {
      erros.push({ campo: 'competencia', motivo: `"${t}" tem mes por extenso que nao reconheco ("${nome}")` });
      return null;
    }
  }

  if (!ano || !mes) {
    erros.push({ campo: 'competencia', motivo: `"${t}" nao e MM/AAAA, AAAA-MM nem MMM/AAAA` });
    return null;
  }
  const m = Number(mes);
  if (m < 1 || m > 12) {
    erros.push({ campo: 'competencia', motivo: `"${t}" tem mes ${mes}` });
    return null;
  }
  return `${ano}-${mes}-01`;
}

// ---------------------------------------------------------------- a leitura

/**
 * Le uma fatura da distribuidora a partir dos campos extraidos.
 *
 * Devolve `ok: true` com a leitura completa, ou `ok: false` com TODOS os erros -
 * nunca o primeiro. Uma extracao que errou tres campos e um problema de
 * extracao; devolver so o primeiro faria alguem consertar tres vezes.
 */
export function lerFaturaDaConcessionaria(campos: CamposDaFatura): ResultadoDaLeitura {
  const erros: ErroDaLeitura[] = [];
  const avisos: AvisoDaLeitura[] = [];

  const numero_uc = numeroDaUC(campos.numero_uc, erros);
  const competencia = competenciaDe(campos.competencia, erros);

  const fio_b = dinheiro('fio_b', campos.fio_b, erros);
  const iluminacao_publica = dinheiro('iluminacao_publica', campos.iluminacao_publica, erros);
  const encargos = dinheiro('encargos', campos.encargos, erros);

  const consumo_kwh = grandeza('consumo_kwh', campos.consumo_kwh, erros);
  const energia_compensada_kwh = grandeza('energia_compensada_kwh', campos.energia_compensada_kwh, erros);

  // O total e OPCIONAL e so serve para conferir. Se vier ilegivel, isso e um
  // aviso e nao um erro: a leitura das tres parcelas nao depende dele em nada.
  let total_a_pagar_centavos: Centavos | null = null;
  if (!vazio(campos.total_a_pagar)) {
    const errosDoTotal: ErroDaLeitura[] = [];
    total_a_pagar_centavos = dinheiro('total_a_pagar', campos.total_a_pagar, errosDoTotal);
    if (errosDoTotal.length > 0) {
      avisos.push({
        campo: 'total_a_pagar',
        observacao: `nao foi possivel ler o total para conferencia (${errosDoTotal[0]!.motivo}). `
          + 'A leitura das parcelas nao depende dele',
      });
      total_a_pagar_centavos = null;
    }
  }

  if (erros.length > 0) return { ok: false, erros };

  // A SOMA E EXPLICITA. Este e o unico lugar do sistema onde o valor da coluna
  // `valor_tarifas_concessionaria_centavos` nasce de uma fatura lida, e ele
  // nasce das tres parcelas nomeadas do `PRD` 5.1 - nunca do total da pagina.
  const tarifas = fio_b! + iluminacao_publica! + encargos!;

  if (total_a_pagar_centavos !== null && total_a_pagar_centavos < tarifas) {
    avisos.push({
      campo: 'total_a_pagar',
      observacao: 'o total da fatura da distribuidora e MENOR que a soma das tres parcelas lidas — '
        + 'uma das duas leituras esta errada, e a conferencia nao diz qual',
    });
  }

  return {
    ok: true,
    leitura: {
      numero_uc: numero_uc!,
      competencia: competencia!,
      tarifas_concessionaria_centavos: tarifas,
      componentes: { fio_b: fio_b!, iluminacao_publica: iluminacao_publica!, encargos: encargos! },
      total_a_pagar_centavos,
      consumo_kwh,
      energia_compensada_kwh,
      avisos,
    },
  };
}

// ---------------------------------------------------------------- o lote

export type LinhaDoLote = { indice: number; origem: string };

export type ResultadoDoLote = {
  lidas: Array<LinhaDoLote & { leitura: LeituraDaFatura }>;
  recusadas: Array<LinhaDoLote & { erros: ErroDaLeitura[] }>;
  /** UCs que apareceram mais de uma vez na MESMA competencia. */
  duplicadas: Array<{ numero_uc: string; competencia: string; origens: string[] }>;
};

/**
 * Le um lote de faturas e mantem a soma fechada.
 *
 * `lidas + recusadas === entradas`, sempre — e a mesma invariante do
 * `lote-de-documentos.ts` e do `conferirTarifas`, pela mesma razao: contagem que
 * perde item em silencio e pior que contagem nenhuma, porque parece completa.
 *
 * DUPLICATA NAO E SOMA. Duas faturas da mesma UC na mesma competencia sao um
 * problema de coleta - o portal devolveu a segunda via duas vezes, ou a UC
 * mudou de titular no meio do mes. Somar produziria o dobro do repasse sem erro
 * nenhum. Aqui as duas ficam em `lidas` e a colisao e nomeada, porque quem
 * decide qual vale nao e este modulo.
 */
export function lerLoteDeFaturas(
  entradas: ReadonlyArray<{ origem: string; campos: CamposDaFatura }>,
): ResultadoDoLote {
  const r: ResultadoDoLote = { lidas: [], recusadas: [], duplicadas: [] };
  const vistas = new Map<string, string[]>();

  entradas.forEach((e, i) => {
    const indice = i + 1;
    const res = lerFaturaDaConcessionaria(e.campos);
    if (!res.ok) {
      r.recusadas.push({ indice, origem: e.origem, erros: res.erros });
      return;
    }
    r.lidas.push({ indice, origem: e.origem, leitura: res.leitura });
    const chave = `${res.leitura.numero_uc}@${res.leitura.competencia}`;
    const jaVistas = vistas.get(chave);
    if (jaVistas) jaVistas.push(e.origem);
    else vistas.set(chave, [e.origem]);
  });

  for (const [chave, origens] of vistas) {
    if (origens.length < 2) continue;
    const [numero_uc, competencia] = chave.split('@') as [string, string];
    r.duplicadas.push({ numero_uc, competencia, origens });
  }

  return r;
}
