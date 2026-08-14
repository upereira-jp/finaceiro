// AS DUAS FOLHAS DO MODELO G3, compostas dos campos LIDOS da fatura. Funcao
// pura: entram os 21 campos, a conta em centavos e o emissor, saem as faixas
// prontas para imprimir. Sem banco, sem rede, sem DOM.
//
// DE ONDE ISTO VEM. A tela definitiva do dono. `folha-g3.ts`, de 14/08 pela
// manha, compunha a folha 1 a partir da FATURA DO NOSSO BANCO e por isso so
// tinha cinco das sete faixas - faltavam a tarifa cheia e a quebra da Equatorial,
// que nao existem em coluna nenhuma daqui. Este arquivo compoe a partir do PDF,
// e por isso tem as sete: os dois numeros que faltavam estao na fatura da
// distribuidora, e o leitor os traz.
//
// ============================================================================
// A DIFERENCA DE FONTE E O ARQUIVO INTEIRO
//
//   `folha-g3.ts`      fatura do nosso banco -> 5 faixas. O que falta nao existe
//   `folha-unificada`  PDF da Equatorial     -> 7 faixas. O que faltava veio junto
//
// As duas convivem enquanto a aba nova nao substitui a Previa. E redundancia, e
// esta datada: some quando o fluxo antigo sair.
//
// ============================================================================
// TODO DINHEIRO CHEGA EM CENTAVO INTEIRO e sai formatado por `emReais`. Este
// arquivo nao faz aritmetica de dinheiro - quem faz e `calcular()` em
// `fatura-unificada.ts`, e a separacao e de proposito: composicao que calcula e
// composicao que pode discordar da conta.

import { emReais, type Centavos } from './centavos.ts';
import { mascararDocumento, linhaDoEmissor, type EmissorDaFatura } from './folha-g3.ts';
import { historicoPlausivel, paraDecimal, decimalBr, serieNaMesmaEscala, textoParaCentavos,
         type CamposDaFaturaUnificada, type ContaDaFatura } from './fatura-unificada.ts';
import { conferirLinhaDigitavel, linhaDigitavelFormatada, conferirBoleto, explicarDivergencia,
         codigoDeBarrasDaLinha, type ConferenciaDoBoleto } from './linha-digitavel.ts';
import { barrasDoCodigo } from './codigo-de-barras.ts';
import { svgDoBrCode } from './qrcode.ts';

/**
 * O BOLETO LIDO, INTEIRO — e ate 14/08 ele chegava pela metade.
 *
 * `lerBoletoSicoob` devolve SETE campos e a tela mandava QUATRO ao servidor. Os
 * tres que ficavam de fora — `beneficiario`, `vencimento` e `valor` — eram
 * justamente os que respondem as tres perguntas de conferencia da referencia
 * (§4.1), e por isso as tres comparacoes viviam no React, em float, invisiveis
 * para o CRM que consome a mesma rota.
 *
 * Agora os sete viajam, e a conferencia sai composta daqui junto com as folhas.
 */
export type DadosDoBoleto = {
  linha_digitavel: string;
  pix_copia_e_cola: string;
  nosso_numero: string;
  instrucoes: string[];
  /** O que o PDF do banco diz. Sao a base das tres comparacoes de `alertas`. */
  beneficiario: string;
  vencimento: string;
  valor: string;
};

export const BOLETO_VAZIO: DadosDoBoleto = {
  linha_digitavel: '', pix_copia_e_cola: '', nosso_numero: '', instrucoes: [],
  beneficiario: '', vencimento: '', valor: '',
};

export type Par = { rotulo: string; valor: string };

/** Uma linha do detalhamento. `kwh` e `tarifa` vem "—" quando nao se aplicam. */
export type LinhaDetalhada = {
  descricao: string;
  kwh: string;
  tarifa: string;
  /** Tachado acima do valor com desconto, quando ha desconto. */
  tarifa_cheia?: string;
  valor: string;
  valor_cheio?: string;
};

export type BarraDoHistorico = {
  mes: string;
  kwh: string;
  /** Percentual da altura, `0`..`100`. Ja calculado - a tela nao divide. */
  altura_pct: number;
  /** `true` no mes da fatura. */
  atual: boolean;
};

export type FolhaUnificada = {
  numero_da_fatura: string;
  folha1: {
    cabecalho: { assinatura: string; emissor: string | null };
    cliente: { nome: string; documento: string; meta: Par[] };
    /** Os TRES CARTOES. `null` quando falta tarifa cheia - ver `cartoes`. */
    cartoes: {
      sem_g3: { rotulo: string; valor: string };
      desconto: { rotulo: string; percentual: string; valor: string };
      com_g3: { rotulo: string; valor: string };
      nota: string;
    } | null;
    /** Por que os cartoes e o detalhamento nao sairam. `null` quando sairam.
     *  Vai para a TELA e nunca para o papel - ver `cartoes_motivo` na composicao. */
    cartoes_motivo: string | null;
    total: { rotulo: string; detalhe: string; valor: string; vencimento: string; nota: string };
    aviso: { titulo: string; corpo: string };
    detalhamento: {
      titulo: string;
      energia: { titulo: string; linhas: LinhaDetalhada[] };
      repasses: { titulo: string; nota: string; linhas: LinhaDetalhada[]; subtotal: string };
      total: { rotulo: string; valor: string };
    } | null;
    rodape: { emissor: string | null; paginacao: string };
  };
  folha2: {
    cabecalho: { emissor: string | null; identificacao: string };
    /** `null` quando o historico nao parece consumo real - ver `historicoPlausivel`. */
    historico: { titulo: string; nota: string; barras: BarraDoHistorico[] } | null;
    /** Por que o grafico nao apareceu, quando nao apareceu. */
    historico_motivo: string | null;
    indicadores: {
      economia: { rotulo: string; valor: string; nota: string };
      consumo: { rotulo: string; valor: string };
      co2: { rotulo: string; valor: string; nota: string };
    };
    pagamento: {
      titulo: string;
      beneficiario: string | null;
      campos: Par[];
      instrucoes: string[];
      /** QR do Pix. `null` sem payload; `motivo` diz por que quando falha. */
      qr: { svg: string; versao: number } | null;
      qr_motivo: string | null;
      pix_texto: string | null;
      /** As barras. `null` quando a linha nao passa nos verificadores. */
      barras: { svg: string } | null;
      barras_motivo: string | null;
      linha_formatada: string | null;
      rodape_legal: string[];
      /** A conferencia ARITMETICA do boleto contra a conta: valor e vencimento
       *  saem dos 44 digitos do codigo de barras. Vai no payload, NUNCA no papel
       *  - o CRM consome a mesma rota e precisa saber tanto quanto a nossa tela,
       *  e dizer ao cliente que o boleto dele pode estar corrompido nao o ajuda. */
      conferencia: ConferenciaDoBoleto;
      /** As tres perguntas da referencia (§4.1) mais o residuo, em frases
       *  prontas. Compostas AQUI e nao na tela: a comparacao de valor usa o total
       *  em centavos, e a tela nao pode refazer a conta (regra 1). */
      alertas: string[];
    };
    rodape: {
      telefone: string;
      emissor: string | null;
      endereco: string | null;
      email: string | null;
      site: string | null;
      informacoes: string[];
    };
  };
};

/** O contato impresso no rodape. Do tenant, nao do codigo. */
export type ContatoDoEmissor = {
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  site: string | null;
};

/**
 * OS TEXTOS QUE A FOLHA IMPRIME E QUE NAO SAO DADO DA FATURA.
 *
 * Ate 14/08 os cinco eram literais neste arquivo — a assinatura do topo, o
 * titulo e o corpo do aviso laranja, a linha de multa e juros, e as duas linhas
 * legais do banco. Dois deles nomeavam uma DISTRIBUIDORA ("Nao pague a conta da
 * Equatorial") e dois nomeavam uma COOPERATIVA especifica, com o codigo dela
 * ("COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR").
 *
 * E o mesmo defeito que a migration 26 tirou do emissor, e com as mesmas
 * palavras: escrever no fonte o dado de uma empresa poe o dado dela na fatura de
 * outro tenant. Aqui poria o banco de outro tenant, sob a assinatura de um banco
 * que nunca viu o documento.
 *
 * Agora eles vem de `modelo_de_fatura` (migration 28). O default abaixo e o que
 * a folha usa quando o tenant nao criou modelo nenhum — e `rodape_legal` nasce
 * VAZIO ali de proposito: ausente e ausente.
 */
export type TextosDoModelo = {
  assinatura: string;
  aviso_titulo: string;
  aviso_corpo: string;
  multa_percentual: string;
  juros_mes_percentual: string;
  rodape_legal: string[];
  nota_do_fator: string;
};

export const TEXTOS_PADRAO: TextosDoModelo = {
  assinatura: 'Energia Solar por Assinatura',
  aviso_titulo: 'Não pague a conta da Equatorial',
  aviso_corpo: 'Sua conta é unificada — o valor da distribuidora já está incluído neste boleto. '
             + 'Pagar a conta da Equatorial gera duplicidade.',
  multa_percentual: '2',
  juros_mes_percentual: '1',
  /* VAZIO, e nao as duas linhas do Sicoob: texto de banco so e verdade quando ha
   * convenio, e afirma-lo sem convenio poe a assinatura de um banco num
   * documento que ele nunca viu. Vazio faz a faixa sumir. */
  rodape_legal: [],
  nota_do_fator: 'Fator médio da margem de operação do SIN · MCTI/SIRENE',
};

const ou = (v: string | null | undefined, alt = '—') => (v && v.trim() ? v.trim() : alt);

/** `07/2026` a partir de `07/2026` ou de `2026-07`. O extrator devolve o primeiro. */
function competencia(v: string): string {
  const s = String(v ?? '').trim();
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  return iso ? `${iso[2]}/${iso[1]}` : s || '—';
}

/** `{UC}-{AAAAMM}`, como na referencia. */
function numeroDaFatura(uc: string, mes: string): string {
  const m = /^(\d{2})\/(\d{4})$/.exec(String(mes ?? '').trim());
  return `${String(uc ?? '').trim() || '000000'}-${m ? m[2] + m[1] : '000000'}`;
}
/**
 * OS EXTRAS — tudo o que a folha imprime e que NAO esta na fatura da
 * distribuidora nem na conta.
 *
 * Ate 14/08 este parametro tinha tres campos e a rota nunca o passava: chamava
 * `comporFolhas` com QUATRO argumentos, e o quinto caia no default `{}`. O
 * efeito estava impresso na folha do cliente:
 *
 *   - o rodape da folha 2 saia SEM telefone, endereco e e-mail — e nao havia de
 *     onde tira-los, porque `identidade_de_cobranca` nao tinha as colunas;
 *   - o indicador "Voce ja economizou" imprimia o desconto DESTA fatura, com a
 *     nota "Primeira fatura com a G3 Solar", **para toda fatura, sempre**.
 *
 * As tres coisas entraram nas migrations 28 e 29. Este tipo e o contrato entre
 * elas e o papel.
 */
export type ExtrasDaFolha = {
  contato?: ContatoDoEmissor;
  /** Os textos que sao do TENANT e nao do codigo. Ver `TextosDoModelo`. */
  modelo?: TextosDoModelo;
  /** Os campos que o tenant inventou, ja resolvidos (fixos do modelo + variaveis
   *  desta fatura). Saem na grade de metadados da folha 1, depois dos oito. */
  campos_personalizados?: Par[];
  /** A soma dos descontos das faturas ja REGISTRADAS nesta UC. Vem do
   *  repositorio (`registro_de_fatura_unificada`), nao daqui. */
  economia_acumulada_centavos?: Centavos;
  /** "com a G3 Solar desde <isto>". A competencia do registro mais antigo. */
  desde?: string;
};

/**
 * Compoe as duas folhas.
 *
 * TUDO O QUE SAI EM NUMERO DECIMAL PASSA POR `decimalBr`, e isso e conserto de
 * 14/08: a folha imprimia a saida de `decimalParaTexto`, que usa PONTO como
 * separador decimal porque e a forma de TROCA. Medido numa folha composta, a
 * mesma linha trazia `Tarifa R$ 1.185396` ao lado de `Valor R$ 35,56` — as duas
 * pontuacoes na mesma coluna de uma fatura brasileira. Quem le "1.185396" numa
 * coluna de reais le mil cento e oitenta e cinco.
 */
export function comporFolhas(
  campos: CamposDaFaturaUnificada,
  conta: ContaDaFatura,
  emissor: EmissorDaFatura,
  boleto: DadosDoBoleto,
  extras: ExtrasDaFolha = {},
): FolhaUnificada {
  const textos = extras.modelo ?? TEXTOS_PADRAO;
  const linhaEmissor = linhaDoEmissor(emissor);
  const mes = competencia(campos.mes_referencia);
  const numero = numeroDaFatura(campos.unidade_consumidora, mes);
  const venc = ou(campos.vencimento);

  /*
   * OS TRES CARTOES SO EXISTEM COM TARIFA CHEIA, e a ausencia e nomeada em vez de
   * desenhada com zero. Sem `tarifa_kwh` a fatura da Equatorial nao tinha linha de
   * CONSUMO NAO COMPENSADO - acontece - e nesse caso nao ha o que comparar: um
   * cartao dizendo "voce economizou R$ 0,00" e pior que cartao nenhum.
   *
   * A SEMANTICA E A DE 13/08 (`Q-DOCG3-12`): compara ENERGIA com ENERGIA. O
   * primeiro cartao e a energia integral, nao a conta inteira - a versao antiga
   * diluia o desconto contra um total que inclui repasse sem desconto nenhum.
   */
  const temTarifa = conta.integral_centavos > 0;
  const cartoes = temTarifa ? {
    sem_g3: { rotulo: 'Seu consumo sem a G3 Solar', valor: emReais(conta.integral_centavos) },
    desconto: {
      rotulo: 'Seu desconto',
      percentual: `${decimalBr(paraDecimal(conta.percentual_desconto), 0)}%`,
      valor: emReais(conta.desconto_centavos),
    },
    com_g3: { rotulo: 'Seu consumo com a G3 Solar', valor: emReais(conta.energia_g3_centavos) },
    nota: 'Desconto aplicado sobre a energia compensada. '
        + 'Encargos e tarifas da distribuidora não têm desconto.',
  } : null;

  /*
   * POR QUE OS CARTOES NAO SAIRAM, EM UMA FRASE — e ela existe porque a tela
   * reimplementava a pergunta e errava.
   *
   * Ate 14/08 `fatura-unificada.tsx` decidia sozinha se avisava, com
   * `Boolean(energia_compensada_kwh.trim()) && !tarifa_kwh.trim()`. O prompt do
   * extrator manda *"se a linha CONSUMO NAO COMPENSADO nao existir, retorne 0"*,
   * e `numeroParaTexto(0, 6)` devolve `"0.000000"` — que e truthy. Medido: **o
   * aviso nunca aparecia no caminho da extracao**, que e o unico caminho em que
   * ele importa.
   *
   * Agora a razao vem de quem tomou a decisao. Uma implementacao so.
   */
  const cartoes_motivo = temTarifa ? null
    : 'Sem tarifa cheia não há o que comparar: os três cartões e o detalhamento saem '
    + 'inteiros da folha. A fatura da distribuidora não trouxe a linha CONSUMO NÃO '
    + 'COMPENSADO — informe a tarifa à mão no campo "Tarifa cheia (R$/kWh)".';

  const naoCompKwh = campos.consumo_nao_compensado_kwh.trim()
    ? decimalBr(paraDecimal(campos.consumo_nao_compensado_kwh, 'consumo_nao_compensado_kwh'), 0)
    : '—';
  const detalhamento = temTarifa ? {
    titulo: 'Detalhamento da fatura',
    energia: {
      titulo: 'Energia G3 Solar',
      linhas: [{
        descricao: 'Energia solar compensada',
        kwh: decimalBr(paraDecimal(conta.compensada_kwh), 0),
        tarifa: decimalBr(paraDecimal(conta.tarifa_g3), 6),
        tarifa_cheia: decimalBr(paraDecimal(conta.tarifa_kwh), 6),
        valor: emReais(conta.energia_g3_centavos),
        valor_cheio: emReais(conta.integral_centavos),
      }],
    },
    repasses: {
      titulo: 'Repasses obrigatórios Equatorial',
      nota: '(quitados pela G3)',
      linhas: [
        { descricao: 'Consumo não compensado', kwh: naoCompKwh,
          tarifa: tarifaDoNaoCompensado(campos, conta), valor: emReais(conta.nao_compensado_centavos) },
        { descricao: 'Contribuição de iluminação pública', kwh: '—', tarifa: '—',
          valor: emReais(conta.iluminacao_publica_centavos) },
        { descricao: `Bandeira tarifária ${ou(campos.bandeira_tarifaria, 'Verde')}`, kwh: '—',
          tarifa: '—', valor: emReais(conta.bandeira_centavos) },
        { descricao: 'Demais encargos e tributos', kwh: '—', tarifa: '—',
          valor: emReais(conta.demais_centavos) },
      ] as LinhaDetalhada[],
      subtotal: emReais(conta.total_equatorial_centavos),
    },
    total: { rotulo: 'Total a pagar', valor: emReais(conta.total_centavos) },
  } : null;

  // ------------------------------------------------------------- folha 2
  //
  // O GRAFICO SO EXISTE SOBRE UMA ESCALA SO, e isto e conserto de 14/08: os
  // valores vinham de `paraDecimal(...).valor`, o inteiro ESCALADO, com a escala
  // jogada fora. Numa serie com casas decimais misturadas - que e o que o
  // extrator produz, e o que a pessoa digita no campo editavel - "320.5" virava
  // 3205n e "340" virava 340n: **a barra de 320,5 kWh saia com 100% de altura e
  // a de 340 kWh com 10%**, no papel que vai ao cliente. E `historicoPlausivel`
  // aprovava a serie, porque a variacao artificial de dez vezes e exatamente o
  // que ela procura para dizer "isto parece consumo real".
  const hist = campos.historico_consumo;
  const plausivel = historicoPlausivel(hist);
  const ultimos = hist.slice(-13);
  // E O MAXIMO E DOS 13 DESENHADOS, nao da serie inteira: com 18 meses lidos, o
  // pico de um mes fora da janela achatava as treze barras visiveis contra um
  // valor que o cliente nao ve.
  const valores = serieNaMesmaEscala(ultimos);
  const maior = valores.length ? valores.reduce((a, b) => (b > a ? b : a), 1n) : 1n;
  const barras: BarraDoHistorico[] = ultimos.map((h, i) => ({
    mes: h.mes,
    kwh: decimalBr(paraDecimal(h.kwh, 'historico'), 0),
    /* A ALTURA E CALCULADA AQUI, em inteiro, e nao na tela. Grandeza fisica
     * dividida por grandeza fisica da proporcao - nao e dinheiro, e a regra 1
     * nao se aplica -, mas a tela nao pode dividir: ela pinta o que o servidor
     * compos, e o CRM consome o mesmo numero. */
    altura_pct: maior > 0n ? Number((valores[i]! * 100n) / maior) : 0,
    atual: i === ultimos.length - 1,
  }));

  const acumulada = extras.economia_acumulada_centavos ?? conta.desconto_centavos;

  /*
   * A CONFERENCIA DO BOLETO, E ELA E ARITMETICA E NAO OPINIAO.
   *
   * `conferirLinhaDigitavel` responde "os quatro digitos verificadores batem?".
   * `conferirBoleto` responde tambem "o VALOR e o VENCIMENTO que os 44 digitos
   * carregam batem com esta fatura?" - e essa segunda pergunta e a que fechava o
   * buraco medido em 14/08: os verificadores deixam passar **26 de 126**
   * corrupcoes de um digito no campo do valor, porque a regra de colapso do
   * modulo 11 manda resto 0, 10 e 11 para o DV 1.
   *
   * ATE AGORA ELA SO EXISTIA NO CAMINHO ANTIGO. `exigirBoletoQueConfere` roda em
   * `GET /faturas/:id/documento` e levanta `BoletoNaoConfere` (409); a rota da
   * aba nova nao a chamava, e a folha saia dizendo "Valor do documento
   * R$ 1.270,70" ao lado de um codigo de barras que carregava R$ 500,00.
   */
  const conferencia = conferirBoleto({
    linha_digitavel: boleto.linha_digitavel || null,
    codigo_barras: null,
    valor_total_centavos: conta.total_centavos,
    vencimento_iso: isoDaData(campos.vencimento),
  });
  const conf = conferirLinhaDigitavel(boleto.linha_digitavel);
  const cod = conf.valida ? codigoDeBarrasDaLinha(boleto.linha_digitavel) : null;

  return {
    numero_da_fatura: numero,
    folha1: {
      cabecalho: { assinatura: textos.assinatura, emissor: linhaEmissor },
      cliente: {
        nome: ou(campos.cliente, 'Nome do cliente'),
        documento: mascararDocumento(campos.documento),
        meta: [
          { rotulo: 'Endereço', valor: ou(campos.endereco) },
          { rotulo: 'Unidade consumidora', valor: ou(campos.unidade_consumidora) },
          { rotulo: 'Mês de referência', valor: mes },
          { rotulo: 'Vencimento', valor: venc },
          { rotulo: 'Período de leitura', valor: periodoDeLeitura(campos) },
          { rotulo: 'Emissão', valor: ou(campos.data_emissao) },
          { rotulo: 'Classificação', valor: ou(campos.classificacao) },
          { rotulo: 'Fatura nº', valor: numero },
          /* OS CAMPOS DO TENANT ENTRAM DEPOIS DOS OITO, e nao no meio: os oito
           * primeiros sao os que a fatura da distribuidora traz, e a ordem deles
           * e a que o cliente reconhece da conta antiga. O que o tenant
           * acrescentou vem em seguida, na ordem que ele escolheu. */
          ...(extras.campos_personalizados ?? []),
        ],
      },
      cartoes,
      cartoes_motivo,
      total: {
        rotulo: 'Valor total a pagar',
        detalhe: 'Consumo G3 Solar + tarifas Equatorial',
        valor: emReais(conta.total_centavos),
        vencimento: venc,
        nota: 'Pagável em qualquer banco',
      },
      aviso: { titulo: textos.aviso_titulo, corpo: textos.aviso_corpo },
      detalhamento,
      rodape: { emissor: linhaEmissor, paginacao: `Fatura ${numero} · página 1 de 2` },
    },
    folha2: {
      cabecalho: {
        emissor: linhaEmissor,
        identificacao: `${ou(campos.cliente, '—')} · UC ${ou(campos.unidade_consumidora)} · ${mes}`,
      },
      historico: plausivel
        ? { titulo: 'Histórico de consumo', nota: 'kWh · últimos meses', barras }
        : null,
      historico_motivo: plausivel ? null : motivoDoHistorico(hist.length),
      indicadores: {
        economia: {
          rotulo: 'Você já economizou',
          valor: emReais(acumulada),
          nota: extras.desde ? `com a G3 Solar desde ${extras.desde}` : 'Primeira fatura com a G3 Solar',
        },
        consumo: { rotulo: 'Consumo do mês', valor: `${decimalBr(paraDecimal(conta.consumo_do_mes_kwh), 0)} kWh` },
        co2: {
          rotulo: 'CO₂ evitado',
          valor: `${decimalBr(paraDecimal(conta.co2_kg), 1)} kg`,
          nota: textos.nota_do_fator,
        },
      },
      pagamento: comporPagamento(boleto, campos, emissor, venc, conta, textos, conferencia, conf, cod),
      rodape: {
        telefone: extras.contato?.telefone?.trim() || '',
        emissor: linhaEmissor,
        endereco: extras.contato?.endereco?.trim() || null,
        email: extras.contato?.email?.trim() || null,
        site: extras.contato?.site?.trim() || null,
        informacoes: [
          `Bandeira tarifária vigente no mês de referência: ${ou(campos.bandeira_tarifaria, 'Verde')}`
            + `${conta.bandeira_centavos ? ` (${emReais(conta.bandeira_centavos)})` : ' (sem adicional)'}.`,
          `Após o vencimento incidem multa de ${decimalBr(paraDecimal(textos.multa_percentual), 0)}% `
            + `e juros de ${decimalBr(paraDecimal(textos.juros_mes_percentual), 0)}% ao mês.`,
          ...(linhaEmissor
            ? [`Atenção ao golpe do boleto: confira sempre se o beneficiário é ${linhaEmissor}.`]
            : []),
        ],
      },
    },
  };
}

/**
 * `DD/MM/AAAA` -> `AAAA-MM-DD`, e `null` quando nao e uma data reconhecivel.
 *
 * O extrator devolve a data no formato do papel; `conferirBoleto` compara com o
 * que os 44 digitos do codigo de barras carregam, que e ISO. Sem esta conversao
 * a comparacao de vencimento nunca aconteceria - e "nao da para conferir" sairia
 * como "conferiu e bateu", que e o pior dos dois.
 */
function isoDaData(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * A tarifa da linha de nao compensado, DERIVADA do proprio par que a fatura traz.
 *
 * Nao e a `tarifa_kwh`: aquela e a coluna "Preco unit com tributos" que o leitor
 * captura; esta e `valor / quantidade` da mesma linha, e existe para que a coluna
 * do detalhamento tenha o que mostrar quando as duas divergirem. Divergindo, o
 * que aparece e o que a fatura cobrou, nao o que dizia a coluna.
 */
function tarifaDoNaoCompensado(c: CamposDaFaturaUnificada, conta: ContaDaFatura): string {
  const kwh = paraDecimal(c.consumo_nao_compensado_kwh);
  if (kwh.valor === 0n || conta.nao_compensado_centavos === 0) return '—';
  // centavos / kWh -> reais por kWh, em seis casas. Inteiro dividido por inteiro.
  const num = BigInt(conta.nao_compensado_centavos) * 10n ** BigInt(6 + kwh.escala);
  const den = kwh.valor * 100n;
  return decimalBr({ valor: (num + den / 2n) / den, escala: 6 }, 6);
}

function periodoDeLeitura(c: CamposDaFaturaUnificada): string {
  const a = ou(c.leitura_anterior), b = ou(c.leitura_atual);
  const dias = String(c.dias_faturados ?? '').trim();
  if (a === '—' && b === '—') return '—';
  return `${a} a ${b}${dias ? ` · ${dias} dias` : ''}`;
}

/**
 * POR QUE O GRAFICO NAO APARECEU, em uma frase que quem opera entende.
 *
 * Portado da referencia com o motivo dela: um modelo de visao que nao acha a
 * tabela lateral INVENTA uma plausivel, e a folha do cliente e o pior lugar do
 * sistema para descobrir isso.
 */
function motivoDoHistorico(quantos: number): string {
  if (quantos === 0) return 'Sem histórico lido no PDF — o gráfico de consumo fica oculto.';
  if (quantos < 3) return `Só ${quantos} mês(es) lido(s) — poucos pontos para um gráfico honesto.`;
  return `${quantos} meses lidos, mas os valores não oscilam como um consumo real — `
       + 'o gráfico fica oculto para não exibir dado inventado.';
}

/**
 * A CAIXA DE PAGAMENTO.
 *
 * O QR E AS BARRAS FALHAM EM SILENCIO SEPARADO, e cada um diz por que. Um Pix que
 * nao cabe no QR nao pode derrubar o boleto, e uma linha digitavel corrompida nao
 * pode derrubar o Pix - sao dois caminhos de pagamento, e a folha sai com o que
 * funcionar. O que nao acontece e desenhar por aproximacao.
 */
function comporPagamento(
  b: DadosDoBoleto,
  campos: CamposDaFaturaUnificada,
  emissor: EmissorDaFatura,
  vencimento: string,
  conta: ContaDaFatura,
  textos: TextosDoModelo,
  conferencia: ConferenciaDoBoleto,
  conf: ReturnType<typeof conferirLinhaDigitavel>,
  codigo: string | null,
): FolhaUnificada['folha2']['pagamento'] {
  const pix = String(b.pix_copia_e_cola ?? '').replace(/\s+/g, '');
  let qr: { svg: string; versao: number } | null = null;
  let qrMotivo: string | null = null;
  if (pix.length >= 20) {
    try {
      const d = svgDoBrCode(pix, { nivel: 'M', lado: 220 });
      qr = { svg: d.svg, versao: d.versao };
    } catch (e) { qrMotivo = e instanceof Error ? e.message : String(e); }
  }

  let barras: { svg: string } | null = null;
  let barrasMotivo: string | null = null;
  if (codigo) {
    try { barras = { svg: barrasDoCodigo(codigo).svg }; }
    catch (e) { barrasMotivo = e instanceof Error ? e.message : String(e); }
  } else {
    barrasMotivo = conf.digitos.length === 0
      ? 'Sem linha digitável — envie o boleto ou cole a linha.'
      : conf.falhas.includes('comprimento')
        ? `A linha tem ${conf.digitos.length} dígitos e precisa de 47.`
        : `A linha não passa na verificação de ${conf.falhas.join(', ')}.`;
  }

  return {
    titulo: 'Pagamento',
    beneficiario: linhaDoEmissor(emissor),
    campos: [
      { rotulo: 'Nosso número', valor: ou(b.nosso_numero) },
      { rotulo: 'Vencimento', valor: vencimento },
      { rotulo: 'Valor do documento', valor: emReais(conta.total_centavos) },
    ],
    instrucoes: b.instrucoes.map((x) => String(x ?? '').trim()).filter(Boolean),
    qr, qr_motivo: qrMotivo,
    pix_texto: pix.length >= 20 ? pix : null,
    barras, barras_motivo: barrasMotivo,
    /*
     * A LINHA SO SAI NO PAPEL QUANDO CONFERE, e ate 14/08 ela saia sempre.
     *
     * `linhaDigitavelFormatada` so olha o comprimento, entao qualquer sequencia
     * de 47 digitos era agrupada e impressa. O codigo de barras JA era suprimido
     * quando os verificadores reprovavam - e a linha, que e o caminho de
     * pagamento por DIGITACAO, continuava la. O caixa do banco recusa; quem
     * descobre e o cliente, no balcao, com o papel na mao.
     *
     * A via do boleto sai sem numero em vez de com numero errado. E a mesma
     * decisao ja tomada para as barras, agora aplicada aos dois.
     */
    linha_formatada: conf.valida ? linhaDigitavelFormatada(b.linha_digitavel) : null,
    rodape_legal: textos.rodape_legal.map((t) => String(t ?? '').trim()).filter(Boolean),
    conferencia,
    alertas: alertasDoBoleto(b, campos, conta, conferencia, emissor),
  };
}

/**
 * AS QUATRO PERGUNTAS DA CONFERENCIA, EM FRASES PRONTAS.
 *
 * As tres primeiras sao as da referencia (§4.1) — vencimento, valor e
 * beneficiario — e ate 14/08 elas viviam em `fatura-unificada.tsx`, no
 * navegador. Duas consequencias, e nenhuma era de estilo:
 *
 *   - A COMPARACAO DE VALOR PASSAVA POR FLOAT. `Math.round(Number(valor.replace(
 *     ',', '.')) * 100)` — e `String.replace` com string troca so a PRIMEIRA
 *     ocorrencia, entao "1.234,56" virava "1.234.56" e `Number` disso e `NaN`.
 *     O guarda `Number.isFinite` fazia o alerta simplesmente **nao sair**: quem
 *     digitasse no formato que o proprio campo sugere perdia a conferencia, em
 *     silencio;
 *   - O CRM NAO AS RECEBIA. Ele consome a mesma rota e nao roda React, entao
 *     para ele o boleto nunca era conferido contra nada.
 *
 * A quarta e o residuo, que a referencia nao tem: `outros_encargos` lido
 * discordando do `total - naoCompensado - iluminacao - bandeira` significa que
 * alguma das tres parcelas foi lida errado e o residuo absorveu a diferenca.
 */
function alertasDoBoleto(
  b: DadosDoBoleto,
  campos: CamposDaFaturaUnificada,
  conta: ContaDaFatura,
  conferencia: ConferenciaDoBoleto,
  emissor: EmissorDaFatura,
): string[] {
  const a: string[] = [];

  /* O que a ARITMETICA dos 44 digitos diz - valor e vencimento -, nas frases que
   * `BoletoNaoConfere` tambem usa. Uma fonte so para as duas saidas. */
  a.push(...conferencia.divergencias.map(explicarDivergencia));

  /* E o que o PDF do boleto DIZ, que e outra coisa: os digitos podem estar
   * certos e o beneficiario ser outro. */
  const venc = b.vencimento.trim();
  if (venc && !/^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
    a.push(`O vencimento lido no PDF do boleto ("${venc}") não está em DD/MM/AAAA — não deu para conferi-lo.`);
  } else if (venc && campos.vencimento.trim() && venc !== campos.vencimento.trim()) {
    /* A TERCEIRA PERGUNTA DA REFERENCIA (§4.1), e ela e sobre o TEXTO: o codigo
     * de barras ja e conferido pela aritmetica acima, e as duas podem discordar
     * entre si - e nesse caso o boleto discorda de si mesmo, que e a informacao
     * mais util das tres. */
    a.push(`O vencimento lido no PDF do boleto é ${venc} e esta fatura vence em `
         + `${campos.vencimento.trim()}.`);
  }

  const valor = b.valor.trim();
  if (valor) {
    let noBoleto: Centavos | null = null;
    try { noBoleto = textoParaCentavos(valor, 'valor do boleto'); } catch { noBoleto = null; }
    if (noBoleto === null) {
      a.push(`O valor lido no boleto ("${valor}") não é um número reconhecível — não deu para conferi-lo.`);
    } else if (Math.abs(noBoleto - conta.total_centavos) > 1) {
      /* "LIDO NO PDF" e o que separa esta frase da irma dela, que sai dos 44
       * digitos do codigo de barras. Sao dois fatos e nao um repetido. */
      a.push(`O valor lido no PDF do boleto é ${emReais(noBoleto)} e o cálculo desta fatura `
           + `dá ${emReais(conta.total_centavos)}.`);
    }
  }

  /* O BENEFICIARIO E CONFERIDO CONTRA O EMISSOR CADASTRADO, e nao contra `/g3/i`.
   * A referencia e de UMA empresa e podia cravar o nome dela na expressao; aqui
   * o emissor e coluna (migration 26), e comparar com a razao social gravada e o
   * que torna a conferencia verdadeira em qualquer tenant. Sem emissor
   * cadastrado nao ha com o que comparar, e a ausencia e dita. */
  const lido = b.beneficiario.trim();
  if (lido) {
    const razao = (emissor.razao_social ?? '').trim();
    if (!razao) {
      a.push(`Beneficiário lido no boleto: "${lido}". Não há razão social cadastrada para comparar `
           + '— preencha o emissor na aba Cadastro.');
    } else if (!pareceMesmoNome(lido, razao)) {
      a.push(`Beneficiário divergente: o boleto diz "${lido}" e o emissor cadastrado é "${razao}". `
           + 'Confira se o boleto é o correto.');
    }
  }

  if (conta.residuo_discorda) {
    a.push('O "outros encargos" lido no PDF não bate com o resíduo da conta — '
         + 'alguma das parcelas da Equatorial pode ter sido lida errado.');
  }
  return a;
}

/**
 * DOIS NOMES DE EMPRESA SAO O MESMO?
 *
 * Nao e igualdade de string: o boleto imprime em caixa alta, sem acento, as
 * vezes sem "LTDA" e com o nome fantasia no lugar da razao social. O criterio e
 * a PRIMEIRA PALAVRA SIGNIFICATIVA aparecer nos dois — e ele e deliberadamente
 * frouxo, porque o custo dos dois erros nao e o mesmo: um alerta a mais faz
 * alguem conferir; um alerta a menos deixa passar um boleto de terceiro.
 */
function pareceMesmoNome(a: string, b: string): boolean {
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/).filter((p) => p.length > 2 && !PALAVRAS_VAZIAS.has(p));
  const pa = chave(a), pb = chave(b);
  if (!pa.length || !pb.length) return false;
  return pa.some((p) => pb.includes(p));
}

const PALAVRAS_VAZIAS = new Set(['LTDA', 'EIRELI', 'ME', 'EPP', 'SA', 'DAS', 'DOS', 'COM', 'DE']);
