// O LAYOUT DO DOCUMENTO DE COBRANCA. Funcao pura: recebe a fatura e a
// configuracao do tenant, devolve as linhas prontas para imprimir.
//
// De onde vem: a decisao 2 da `Q-DOCFATURA-01`, em 30/07 - layout CONFIGURAVEL
// por tenant, contra a minha recomendacao de layout fixo. O custo que eu tinha
// nomeado era "schema + tela + validacao, e campo inexistente vira fatura
// errada". A parte da validacao foi resolvida no banco, pelo enum
// `campo_de_fatura`: um campo que nao existe nao entra na tabela. O que sobra e
// este arquivo - a ORDEM, o ROTULO e a FORMATACAO.
//
// POR QUE PURO E FORA DO `.tsx`, e aqui o motivo e mais forte que a regra 8. A
// decisao 4 foi "entrega manual agora, com a rota do CRM ja preparada". Se a
// composicao do documento morar no componente, publicar o documento para o CRM
// consumir depois e REESCREVER - e o CRM nao roda React. Entao a composicao e
// server-side e pura, e a tela e um renderizador do que ela devolve.
//
// A REGRA 1 ATRAVESSA ESTE ARQUIVO INTEIRO. Dinheiro chega em centavos inteiros e
// sai formatado por TEXTO; kWh, percentual e tarifa chegam como STRING (numeric do
// Postgres) e saem como string. Nao ha um `Number()` sobre grandeza fisica em
// lugar nenhum: a tarifa tem seis casas e virar float a estragaria em silencio.

/** Os 16 valores do enum `campo_de_fatura` da migration 19. */
export type CampoDeFatura =
  | 'competencia' | 'vencimento' | 'numero_uc' | 'distribuidora'
  | 'cliente_nome' | 'cliente_documento' | 'usina_codigo_geradora'
  | 'geracao_kwh_competencia' | 'percentual_rateio_aplicado' | 'consumo_kwh' | 'tarifa_reais_por_kwh'
  | 'valor_consumo_centavos' | 'valor_tarifas_concessionaria_centavos'
  | 'valor_juros_multa_centavos' | 'valor_total_centavos'
  | 'flag_fatura_cheia';

/** O que o documento sabe sobre a fatura. Montado pelo repositorio. */
export type DadosDaFatura = {
  competencia: string;               // ISO, AAAA-MM-DD
  vencimento: string;                // ISO
  numero_uc: string | null;
  distribuidora: string | null;
  cliente_nome: string | null;
  cliente_documento: string | null;
  usina_codigo_geradora: string | null;
  // Grandeza fisica e proporcao: STRING, sempre (regra 1).
  geracao_kwh_competencia: string | null;
  percentual_rateio_aplicado: string | null;
  consumo_kwh: string | null;
  tarifa_reais_por_kwh: string | null;
  // Dinheiro: centavos inteiros.
  valor_consumo_centavos: number;
  valor_tarifas_concessionaria_centavos: number;
  valor_juros_multa_centavos: number;
  /* NULLABLE, e foi MEDIDO: `valor_total_centavos` e GENERATED ALWAYS na
     migration 16, e coluna gerada pode ser nula. Ver o comentario de `formatar`. */
  valor_total_centavos: number | null;
  flag_fatura_cheia: boolean;
};

export type ConfiguracaoDeCampo = {
  campo: CampoDeFatura;
  rotulo: string | null;
  ordem: number;
  visivel: boolean;
};

/** Como o valor e apresentado - a tela usa isto para alinhar e destacar. */
export type TipoDeValor = 'texto' | 'data' | 'competencia' | 'dinheiro' | 'decimal' | 'booleano';

/**
 * O PADRAO, e ele existe porque `campo_do_documento` vazio NAO significa
 * documento vazio.
 *
 * A migration 19 nao semeia layout nenhum de proposito: um padrao no banco
 * decidiria o layout de todo tenant futuro a partir do gosto de hoje. Aqui ele e
 * codigo - visivel, versionado e igual para quem nunca configurou nada.
 *
 * A ordem e a de uma fatura de energia: primeiro o que identifica, depois como o
 * credito foi calculado, depois o dinheiro, e o total por ultimo.
 */
export const PADRAO: ReadonlyArray<{ campo: CampoDeFatura; rotulo: string; tipo: TipoDeValor }> = [
  { campo: 'competencia',                           rotulo: 'Competência',            tipo: 'competencia' },
  { campo: 'numero_uc',                             rotulo: 'Unidade consumidora',    tipo: 'texto' },
  { campo: 'cliente_nome',                          rotulo: 'Cliente',                tipo: 'texto' },
  { campo: 'cliente_documento',                     rotulo: 'CPF/CNPJ',               tipo: 'texto' },
  { campo: 'distribuidora',                         rotulo: 'Distribuidora',          tipo: 'texto' },
  { campo: 'usina_codigo_geradora',                 rotulo: 'Usina geradora',         tipo: 'texto' },
  { campo: 'geracao_kwh_competencia',               rotulo: 'Geração da usina (kWh)', tipo: 'decimal' },
  { campo: 'percentual_rateio_aplicado',            rotulo: 'Seu rateio (%)',         tipo: 'decimal' },
  { campo: 'consumo_kwh',                           rotulo: 'Crédito injetado (kWh)', tipo: 'decimal' },
  { campo: 'tarifa_reais_por_kwh',                  rotulo: 'Tarifa (R$/kWh)',        tipo: 'decimal' },
  { campo: 'valor_consumo_centavos',                rotulo: 'Valor do crédito',       tipo: 'dinheiro' },
  { campo: 'valor_tarifas_concessionaria_centavos', rotulo: 'Tarifas da concessionária', tipo: 'dinheiro' },
  { campo: 'valor_juros_multa_centavos',            rotulo: 'Juros e multa',          tipo: 'dinheiro' },
  { campo: 'valor_total_centavos',                  rotulo: 'TOTAL A PAGAR',          tipo: 'dinheiro' },
  { campo: 'vencimento',                            rotulo: 'Vencimento',             tipo: 'data' },
];

const TIPO: Record<CampoDeFatura, TipoDeValor> = Object.fromEntries(
  PADRAO.map((p) => [p.campo, p.tipo]),
) as Record<CampoDeFatura, TipoDeValor>;

// `flag_fatura_cheia` esta no enum e NAO no padrao: e estado interno, util para
// conferencia e ruim numa fatura que vai ao cliente. Fica disponivel para quem
// configurar, com tipo declarado - e por isso o tipo dele entra aqui a mao.
TIPO.flag_fatura_cheia = 'booleano';

const ROTULO_PADRAO: Record<string, string> = Object.fromEntries(PADRAO.map((p) => [p.campo, p.rotulo]));

/** 123456 -> "R$ 1.234,56". Por TEXTO, sem divisao (regra 1). */
export function emReais(centavos: number): string {
  const negativo = centavos < 0;
  const s = String(Math.abs(Math.trunc(centavos))).padStart(3, '0');
  const inteiro = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${inteiro},${s.slice(-2)}`;
}

/** "2026-07-01" -> "01/07/2026". Recorte de string: `new Date` aplicaria fuso e
 *  a competencia viraria o mes anterior nas primeiras horas do dia. */
export const dataBr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** "2026-07-01" -> "07/2026". */
export const competenciaBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-');
  return `${m}/${a}`;
};

export type LinhaDoDocumento = {
  campo: CampoDeFatura;
  rotulo: string;
  /** Ja formatado para exibicao. */
  valor: string;
  tipo: TipoDeValor;
  /** `true` quando o dado nao existe - a tela mostra "—" e nao zero. */
  ausente: boolean;
};

function formatar(campo: CampoDeFatura, d: DadosDaFatura): { valor: string; ausente: boolean } {
  const tipo = TIPO[campo];
  const cru = (d as unknown as Record<string, unknown>)[campo];

  /*
   * AUSENTE NAO E ZERO, e esta e a mesma R9 que o conector aplica na leitura do
   * CRM: `consumo_kwh` nulo nao vale "0 kWh" num documento que o cliente recebe.
   *
   * E VALE PARA DINHEIRO TAMBEM. A primeira versao deste comentario afirmava que
   * as colunas de centavos eram todas NOT NULL, "entao zero ali e zero de
   * verdade" - MEDIDO em 30/07 contra producao: `valor_total_centavos` e
   * `GENERATED ALWAYS` (migration 16) e ACEITA NULO; as outras tres sao NOT NULL.
   * Imprimir "R$ 0,00" num total desconhecido seria o modo de falha exato que
   * este projeto persegue: vazio virando numero.
   */
  if (cru == null) return { valor: '—', ausente: true };

  switch (tipo) {
    case 'dinheiro':    return { valor: emReais(Number(cru)), ausente: false };
    case 'data':        return { valor: dataBr(String(cru)), ausente: false };
    case 'competencia': return { valor: competenciaBr(String(cru)), ausente: false };
    case 'booleano':    return { valor: cru ? 'sim' : 'não', ausente: false };
    // Decimal sai COMO VEIO do banco - string. Formatar com `toLocaleString`
    // exigiria passar por `Number`, e a tarifa tem seis casas.
    case 'decimal':     return { valor: String(cru), ausente: false };
    default:            return { valor: String(cru), ausente: false };
  }
}

/**
 * As linhas do documento, na ordem em que serao impressas.
 *
 * `configuracao` vazia devolve o `PADRAO` inteiro. Configuracao existente vence
 * por completo - nao ha mistura -, porque mesclar faria um campo que o tenant
 * ESCONDEU reaparecer no dia em que o padrao ganhasse um item novo. Esconder e
 * uma decisao, e ela tem de sobreviver a atualizacao do sistema.
 *
 * Empate de `ordem` e desempatado pelo nome do campo: a migration 19 nao poe
 * UNIQUE em `ordem` de proposito (trocar duas linhas de lugar violaria a
 * constraint no meio da transacao), entao a estabilidade e resolvida aqui.
 */
export function linhasDoDocumento(
  d: DadosDaFatura,
  configuracao: ReadonlyArray<ConfiguracaoDeCampo> = [],
): LinhaDoDocumento[] {
  const escolhidos = configuracao.length === 0
    ? PADRAO.map((p, i) => ({ campo: p.campo, rotulo: p.rotulo, ordem: i, visivel: true }))
    : [...configuracao];

  return escolhidos
    .filter((c) => c.visivel)
    .sort((a, b) => (a.ordem - b.ordem) || a.campo.localeCompare(b.campo))
    .map((c) => {
      const { valor, ausente } = formatar(c.campo, d);
      return {
        campo: c.campo,
        // Rotulo nulo cai no padrao: a migration nao poe default na coluna de
        // proposito, e o default vive aqui.
        rotulo: c.rotulo?.trim() || ROTULO_PADRAO[c.campo] || c.campo,
        valor, tipo: TIPO[c.campo], ausente,
      };
    });
}
