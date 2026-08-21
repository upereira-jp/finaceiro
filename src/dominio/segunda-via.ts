// A SEGUNDA VIA da fatura unificada: a linha gravada de volta em campos de tela.
//
// ============================================================================
// POR QUE ISTO EXISTE, e a resposta esta escrita na propria migration
//
// A migration 29 declara o proposito de `registro_de_fatura_unificada` em duas
// linhas: *"Serve a duas coisas: a economia acumulada impressa na folha 2, e a
// SEGUNDA VIA."* A primeira foi construida no mesmo dia. **A segunda nunca foi.**
//
// O custo disso ficou visivel quando a `Q-CICLO-01` escolheu o caminho unificado
// como oficial (21/08/2026): a partir dali a folha de SETE faixas e o documento
// da G3, e ela so existia enquanto os campos estivessem na tela. Fechar a aba
// perdia o documento; reabrir exigia subir o PDF da distribuidora de novo. E o
// que `GET /faturas/:id/documento` devolve para uma fatura vinda de conta lida e
// a folha de CINCO faixas do caminho antigo - dois papeis diferentes para a
// mesma divida, que e exatamente o defeito que este projeto persegue.
//
// ============================================================================
// A CONTA NAO E LIDA DA LINHA: E RECALCULADA E CONFERIDA CONTRA ELA
//
// Seria mais curto devolver os nove valores em centavos que ja estao gravados.
// Nao e o que este arquivo faz, e a razao e a invariante do projeto: `calcular()`
// e a UNICA implementacao da conta, e uma segunda via que lesse os centavos
// direto seria uma segunda leitura - divergiria no dia em que a formula mudasse,
// e ninguem saberia.
//
// Entao a segunda via reconstroi os CAMPOS, chama `calcular()` com os PARAMETROS
// CONGELADOS na linha - e nao com os do modelo de hoje, senao trocar o desconto
// padrao reimprimiria o passado com outro numero - e compara o resultado com o
// que foi gravado. Divergencia vira erro NOMEADO, nao papel silenciosamente
// diferente do primeiro.
//
// ============================================================================
// O UNICO CAMPO QUE NAO VOLTA, e ele nao e fingido
//
// `outros_encargos` e o que o extrator LEU como "demais encargos", e existe para
// ser comparado com o residuo calculado (`residuo_discorda`). A migration 29
// **nao o guarda** - guarda o residuo, que e derivado.
//
// A segunda via devolve o campo VAZIO, e isso e deliberado: `calcular()` so
// acusa divergencia quando a string nao e vazia, entao o vazio significa "nao
// foi conferido aqui" e nao "conferido e bate". Preencher com o residuo faria os
// dois concordarem por construcao e a folha afirmaria uma conferencia que
// ninguem fez. Registrado como `Q-SEGVIA-01`.

import {
  CAMPOS_VAZIOS,
  type CamposDaFaturaUnificada, type ParametrosDaEmissao, type ContaDaFatura,
} from './fatura-unificada.ts';
import { BOLETO_VAZIO, type DadosDoBoleto } from './folha-unificada.ts';

/** A linha gravada, no formato em que o repositorio a entrega: `numeric` e
 *  `date` ja como STRING, porque converter para number reintroduziria o float
 *  que a regra 1 proibe e converter para Date perderia o fuso na volta. */
export type LinhaGravada = {
  numero_uc: string;
  competencia: string;
  cliente_nome: string | null;
  cliente_documento: string | null;
  endereco: string | null;
  classificacao: string | null;
  data_emissao: string | null;
  leitura_anterior: string | null;
  leitura_atual: string | null;
  dias_faturados: number | null;
  vencimento: string | null;
  bandeira_tarifaria: string | null;

  compensada_kwh: string;
  nao_compensado_kwh: string;
  tarifa_kwh: string;
  percentual_desconto: string;
  fator_emissao: string;

  integral_centavos: number;
  desconto_centavos: number;
  energia_g3_centavos: number;
  nao_compensado_centavos: number;
  iluminacao_publica_centavos: number;
  bandeira_centavos: number;
  demais_centavos: number;
  total_equatorial_centavos: number;
  total_centavos: number;

  linha_digitavel: string | null;
  pix_copia_e_cola: string | null;
  nosso_numero: string | null;
  instrucoes: string[];
  historico_consumo: unknown;
};

/** Centavos inteiros -> a string decimal em reais que os campos carregam.
 *  Inteiro para texto, sem divisao em ponto flutuante: a regra 1 vale tambem no
 *  caminho de volta. */
export function centavosParaTexto(c: number): string {
  const neg = c < 0;
  const v = Math.abs(Math.trunc(c)).toString().padStart(3, '0');
  const corte = v.length - 2;
  return `${neg ? '-' : ''}${v.slice(0, corte)}.${v.slice(corte)}`;
}

/** `2026-06-01` -> `06/2026`, que e a forma que o extrator devolve e que
 *  `primeiroDiaDaCompetencia` sabe ler de volta. */
export function competenciaParaMesReferencia(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? '').trim());
  return m ? `${m[2]}/${m[1]}` : '';
}

const historico = (v: unknown): Array<{ mes: string; kwh: string }> =>
  Array.isArray(v)
    ? v.filter((x) => x && typeof x === 'object')
       .map((x: any) => ({ mes: String(x.mes ?? ''), kwh: String(x.kwh ?? '') }))
    : [];

const txt = (v: string | null | undefined): string => (v == null ? '' : String(v));

/**
 * A linha gravada -> os campos, os parametros e o boleto, do jeito que a tela os
 * recebeu na primeira vez.
 *
 * PURA e sem banco: e o que permite provar o caminho de volta sem PostgreSQL, e
 * esta VPS nao tem um.
 */
export function segundaViaDoRegistro(l: LinhaGravada): {
  campos: CamposDaFaturaUnificada;
  parametros: ParametrosDaEmissao;
  boleto: DadosDoBoleto;
} {
  const campos: CamposDaFaturaUnificada = {
    ...CAMPOS_VAZIOS,
    cliente: txt(l.cliente_nome),
    documento: txt(l.cliente_documento),
    endereco: txt(l.endereco),
    unidade_consumidora: txt(l.numero_uc),
    classificacao: txt(l.classificacao),
    mes_referencia: competenciaParaMesReferencia(l.competencia),
    data_emissao: txt(l.data_emissao),
    leitura_anterior: txt(l.leitura_anterior),
    leitura_atual: txt(l.leitura_atual),
    dias_faturados: l.dias_faturados == null ? '' : String(l.dias_faturados),
    vencimento: txt(l.vencimento),
    energia_compensada_kwh: txt(l.compensada_kwh),
    tarifa_kwh: txt(l.tarifa_kwh),
    consumo_nao_compensado_kwh: txt(l.nao_compensado_kwh),
    consumo_nao_compensado_valor: centavosParaTexto(l.nao_compensado_centavos),
    iluminacao_publica: centavosParaTexto(l.iluminacao_publica_centavos),
    bandeira_tarifaria: txt(l.bandeira_tarifaria),
    bandeira_valor: centavosParaTexto(l.bandeira_centavos),
    /* VAZIO DE PROPOSITO - ver o cabecalho. Vazio significa "nao conferido
     * aqui"; preencher com o residuo afirmaria uma conferencia que nao houve. */
    outros_encargos: '',
    valor_total_equatorial: centavosParaTexto(l.total_equatorial_centavos),
    historico_consumo: historico(l.historico_consumo),
  };

  return {
    campos,
    /* OS PARAMETROS SAO OS DA LINHA, e nao os do modelo de hoje. Trocar o
     * desconto padrao no cadastro nao pode reimprimir uma fatura de junho com
     * outro numero - o cliente tem o primeiro papel na mao. */
    parametros: { percentual_desconto: txt(l.percentual_desconto), fator_emissao: txt(l.fator_emissao) },
    boleto: {
      ...BOLETO_VAZIO,
      linha_digitavel: txt(l.linha_digitavel),
      pix_copia_e_cola: txt(l.pix_copia_e_cola),
      nosso_numero: txt(l.nosso_numero),
      instrucoes: Array.isArray(l.instrucoes) ? l.instrucoes.map(String) : [],
    },
  };
}

/**
 * A conta recalculada bate com a que foi gravada?
 *
 * Devolve a lista de divergencias, vazia quando tudo fecha. Sao as NOVE parcelas
 * que a migration 29 guarda e que os tres CHECKs dela ja amarram entre si - aqui
 * a comparacao e contra a formula, e nao entre elas.
 *
 * O QUE UMA DIVERGENCIA SIGNIFICA: a formula mudou depois de a linha ser
 * gravada. Nao e erro de digitacao nem de leitura; e o passado sendo reimpresso
 * com a regra do presente, que e a coisa exata que a segunda via nao pode fazer.
 */
export function divergenciasDaSegundaVia(conta: ContaDaFatura, l: LinhaGravada): string[] {
  const pares: Array<[string, number, number]> = [
    ['integral', conta.integral_centavos, l.integral_centavos],
    ['desconto', conta.desconto_centavos, l.desconto_centavos],
    ['energia da G3', conta.energia_g3_centavos, l.energia_g3_centavos],
    ['nao compensado', conta.nao_compensado_centavos, l.nao_compensado_centavos],
    ['iluminacao publica', conta.iluminacao_publica_centavos, l.iluminacao_publica_centavos],
    ['bandeira', conta.bandeira_centavos, l.bandeira_centavos],
    ['demais encargos', conta.demais_centavos, l.demais_centavos],
    ['total da distribuidora', conta.total_equatorial_centavos, l.total_equatorial_centavos],
    ['total', conta.total_centavos, l.total_centavos],
  ];
  return pares
    .filter(([, agora, gravado]) => agora !== gravado)
    .map(([nome, agora, gravado]) => `${nome}: gravado ${gravado}, recalculado ${agora}`);
}
