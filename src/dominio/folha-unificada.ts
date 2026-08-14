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
import { historicoPlausivel, paraDecimal, decimalParaTexto,
         type CamposDaFaturaUnificada, type ContaDaFatura } from './fatura-unificada.ts';
import { conferirLinhaDigitavel, linhaDigitavelFormatada,
         codigoDeBarrasDaLinha } from './linha-digitavel.ts';
import { barrasDoCodigo } from './codigo-de-barras.ts';
import { svgDoBrCode } from './qrcode.ts';

export type DadosDoBoleto = {
  linha_digitavel: string;
  pix_copia_e_cola: string;
  nosso_numero: string;
  instrucoes: string[];
};

export const BOLETO_VAZIO: DadosDoBoleto = {
  linha_digitavel: '', pix_copia_e_cola: '', nosso_numero: '', instrucoes: [],
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
    };
    rodape: {
      telefone: string;
      emissor: string | null;
      endereco: string | null;
      email: string | null;
      informacoes: string[];
    };
  };
};

/** O contato impresso no rodape. Do tenant, nao do codigo. */
export type ContatoDoEmissor = {
  telefone: string | null;
  endereco: string | null;
  email: string | null;
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
 * Compoe as duas folhas.
 *
 * `economia_acumulada_centavos` e opcional e vem de fora: e a soma dos descontos
 * das faturas ja registradas nesta UC, e ela mora no repositorio, nao aqui. Sem
 * ela a folha diz "Primeira fatura com a G3 Solar", que e o que a referencia faz.
 */
export function comporFolhas(
  campos: CamposDaFaturaUnificada,
  conta: ContaDaFatura,
  emissor: EmissorDaFatura,
  boleto: DadosDoBoleto,
  extras: {
    contato?: ContatoDoEmissor;
    economia_acumulada_centavos?: Centavos;
    desde?: string;
  } = {},
): FolhaUnificada {
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
      percentual: `${decimalParaTexto(paraDecimal(conta.percentual_desconto), 0)}%`,
      valor: emReais(conta.desconto_centavos),
    },
    com_g3: { rotulo: 'Seu consumo com a G3 Solar', valor: emReais(conta.energia_g3_centavos) },
    nota: 'Desconto aplicado sobre a energia compensada. '
        + 'Encargos e tarifas da distribuidora não têm desconto.',
  } : null;

  const naoCompKwh = ou(campos.consumo_nao_compensado_kwh, '—');
  const detalhamento = temTarifa ? {
    titulo: 'Detalhamento da fatura',
    energia: {
      titulo: 'Energia G3 Solar',
      linhas: [{
        descricao: 'Energia solar compensada',
        kwh: decimalParaTexto(paraDecimal(conta.compensada_kwh), 0),
        tarifa: conta.tarifa_g3,
        tarifa_cheia: conta.tarifa_kwh,
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
  const hist = campos.historico_consumo;
  const plausivel = historicoPlausivel(hist);
  const valores = hist.map((h) => paraDecimal(h.kwh).valor);
  const maior = valores.length ? valores.reduce((a, b) => (b > a ? b : a), 1n) : 1n;
  const ultimos = hist.slice(-13);
  const barras: BarraDoHistorico[] = ultimos.map((h, i) => {
    const v = paraDecimal(h.kwh).valor;
    return {
      mes: h.mes,
      kwh: decimalParaTexto(paraDecimal(h.kwh), 0),
      /* A ALTURA E CALCULADA AQUI, em inteiro, e nao na tela. Grandeza fisica
       * dividida por grandeza fisica da proporcao - nao e dinheiro, e a regra 1
       * nao se aplica -, mas a tela nao pode dividir: ela pinta o que o servidor
       * compos, e o CRM consome o mesmo numero. */
      altura_pct: maior > 0n ? Number((v * 100n) / maior) : 0,
      atual: i === ultimos.length - 1,
    };
  });

  const acumulada = extras.economia_acumulada_centavos ?? conta.desconto_centavos;
  const conferencia = conferirLinhaDigitavel(boleto.linha_digitavel);
  const cod = conferencia.valida ? codigoDeBarrasDaLinha(boleto.linha_digitavel) : null;

  return {
    numero_da_fatura: numero,
    folha1: {
      cabecalho: { assinatura: 'Energia Solar por Assinatura', emissor: linhaEmissor },
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
        ],
      },
      cartoes,
      total: {
        rotulo: 'Valor total a pagar',
        detalhe: 'Consumo G3 Solar + tarifas Equatorial',
        valor: emReais(conta.total_centavos),
        vencimento: venc,
        nota: 'Pagável em qualquer banco',
      },
      aviso: {
        titulo: 'Não pague a conta da Equatorial',
        corpo: 'Sua conta é unificada — o valor da distribuidora já está incluído neste boleto. '
             + 'Pagar a conta da Equatorial gera duplicidade.',
      },
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
        consumo: { rotulo: 'Consumo do mês', valor: `${conta.consumo_do_mes_kwh} kWh` },
        co2: {
          rotulo: 'CO₂ evitado',
          valor: `${conta.co2_kg} kg`,
          nota: 'Fator médio da margem de operação do SIN · MCTI/SIRENE',
        },
      },
      pagamento: comporPagamento(boleto, emissor, venc, conta.total_centavos, conferencia, cod),
      rodape: {
        telefone: extras.contato?.telefone?.trim() || '',
        emissor: linhaEmissor,
        endereco: extras.contato?.endereco?.trim() || null,
        email: extras.contato?.email?.trim() || null,
        informacoes: [
          `Bandeira tarifária vigente no mês de referência: ${ou(campos.bandeira_tarifaria, 'Verde')}`
            + `${conta.bandeira_centavos ? ` (${emReais(conta.bandeira_centavos)})` : ' (sem adicional)'}.`,
          'Após o vencimento incidem multa de 2% e juros de 1% ao mês.',
          ...(linhaEmissor
            ? [`Atenção ao golpe do boleto: confira sempre se o beneficiário é ${linhaEmissor}.`]
            : []),
        ],
      },
    },
  };
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
  return decimalParaTexto({ valor: (num + den / 2n) / den, escala: 6 }, 6);
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
  emissor: EmissorDaFatura,
  vencimento: string,
  total: Centavos,
  conferencia: ReturnType<typeof conferirLinhaDigitavel>,
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
    barrasMotivo = conferencia.digitos.length === 0
      ? 'Sem linha digitável — envie o boleto ou cole a linha.'
      : conferencia.falhas.includes('comprimento')
        ? `A linha tem ${conferencia.digitos.length} dígitos e precisa de 47.`
        : `A linha não passa na verificação de ${conferencia.falhas.join(', ')}.`;
  }

  return {
    titulo: 'Pagamento',
    beneficiario: linhaDoEmissor(emissor),
    campos: [
      { rotulo: 'Nosso número', valor: ou(b.nosso_numero) },
      { rotulo: 'Vencimento', valor: vencimento },
      { rotulo: 'Valor do documento', valor: emReais(total) },
    ],
    instrucoes: b.instrucoes.map((x) => String(x ?? '').trim()).filter(Boolean),
    qr, qr_motivo: qrMotivo,
    pix_texto: pix.length >= 20 ? pix : null,
    barras, barras_motivo: barrasMotivo,
    linha_formatada: linhaDigitavelFormatada(b.linha_digitavel),
    rodape_legal: [
      'EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB',
      'COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR',
    ],
  };
}
