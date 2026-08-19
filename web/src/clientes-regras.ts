// As regras da aba Clientes, PURAS e fora do componente.
//
// POR QUE ELAS NAO MORAM NO `.tsx`. O runner do `web/` e
// `node --experimental-strip-types`, que NAO le JSX: regra dentro de um `.tsx` e
// inalcancavel por teste, e a regra 8 diz que invariante sem teste e comentario.
// O precedente sao `contrato-regras.ts`, `cobranca-regras.ts` e
// `unidades-regras.ts`.
//
// ============================================================================
// O QUE ESTE ARQUIVO EXISTE PARA RESOLVER, e esta medido na `PENDENCIAS.md` §2.a
//
// Item 1 da fila da primeira fatura: **CPF/CNPJ de 24 pessoas, 0 de 29 linhas de
// cliente**. A coluna esta NULA na carteira ativa inteira, e ate 17/08/2026 o
// unico caminho para preenche-la era `npm run documentos` — um script rodado de
// um Codespace, contra producao, por quem tem o repositorio clonado e o `.env` na
// mao. Quem opera nao tem nada disso.
//
// E o que a ausencia trava nao e cosmetico:
//
//   R9   `podeAtivarContrato` RECUSA levar contrato para `ativo` sem documento
//        VALIDADO. Sem contrato ativo a triagem recusa por `sem_contrato_vigente`
//        - os 29 contratos a digitar viram 29 rascunhos e 29 recusas 422;
//   boleto  `PagadorSemDocumento` (422) para a emissao antes de falar com o
//        banco: boleto sem identificacao do pagador o banco recusa.
//
// Nenhuma das 10 views do CRM expoe documento — conferido no catalogo. O dado
// entra por aqui, ou nao entra.
//
// ============================================================================
// A DISTINCAO QUE ESTE ARQUIVO NOMEIA, e ela e a R8 e nao um detalhe
//
// "Tem documento" e "o documento vale" sao coisas diferentes, e o sistema ja
// distinguia as duas em `src/dominio/documento.ts` sem que nenhuma tela mostrasse
// a diferenca. Um CPF vindo do CRM entra com `documento_validado = FALSE` **mesmo
// passando no digito verificador**: la o campo e livre, e digito correto nao
// prova que o documento e daquela pessoa. Quem olhasse so a coluna `documento`
// veria um CPF preenchido e concluiria que o contrato pode ativar. Nao pode.

/** Espelho de `documento_origem` no banco. */
export type OrigemDoDocumento = 'crm_semente' | 'coleta_local';

/** O que a aba precisa saber de um cliente para decidir o que mostrar. */
export type ClienteConferivel = {
  documento: string | null;
  documento_validado?: boolean;
  documento_origem?: OrigemDoDocumento | null;
};

/**
 * OS QUATRO ESTADOS DO DOCUMENTO, e os tres que nao sao `validado` sao
 * diferentes por razoes diferentes - e pedem acoes diferentes de quem opera:
 *
 *   `sem_documento`        nao ha nada. A acao e digitar
 *   `semente_do_crm`       veio do CRM e NAO vale, mesmo que o digito feche
 *                          (R8). A acao e reconfirmar aqui, o que troca a origem
 *   `digito_nao_confere`   foi digitado aqui e o digito NAO fecha. A acao e
 *                          corrigir - provavelmente e erro de transcricao
 *   `validado`             coletado localmente e digito conferido. E o UNICO que
 *                          destrava o contrato (R9)
 */
export type SituacaoDoDocumento =
  | 'sem_documento' | 'semente_do_crm' | 'digito_nao_confere' | 'validado';

export function situacaoDoDocumento(c: ClienteConferivel): SituacaoDoDocumento {
  if (!c.documento || !c.documento.trim()) return 'sem_documento';
  if (c.documento_validado === true) return 'validado';
  /* SEM `documento_origem` LEGIVEL, a resposta e `semente_do_crm` e nao
   * `digito_nao_confere`. As duas sao "nao vale", mas a segunda ACUSA um erro de
   * digitacao que pode nao existir - e mandar alguem procurar defeito num
   * documento correto e pior do que dizer que ele precisa de confirmacao. */
  return c.documento_origem === 'coleta_local' ? 'digito_nao_confere' : 'semente_do_crm';
}

export const ROTULO_DA_SITUACAO_DO_DOCUMENTO: Record<SituacaoDoDocumento, string> = {
  sem_documento: 'Sem CPF/CNPJ',
  semente_do_crm: 'Semente do CRM',
  digito_nao_confere: 'Dígito não confere',
  validado: 'Validado',
};

export const TOM_DA_SITUACAO_DO_DOCUMENTO:
  Record<SituacaoDoDocumento, 'ok' | 'pendente' | 'nao_medido'> = {
  sem_documento: 'pendente',
  digito_nao_confere: 'pendente',
  /* `nao_medido` e nao `pendente`: a semente do CRM nao esta errada, esta
   * NAO CONFIRMADA. E a mesma distincao que o `estadoDoCertificado` faz entre
   * "vencido" e "sem data cadastrada". */
  semente_do_crm: 'nao_medido',
  validado: 'ok',
};

/** O que ainda falta para o contrato poder ativar (R9). Os tres estados que nao
 *  sao `validado` contam junto, porque nenhum deles destrava. */
export const destravaContrato = (c: ClienteConferivel): boolean =>
  situacaoDoDocumento(c) === 'validado';

/**
 * O VOCABULARIO DO FILTRO DA ABA — os quatro estados MAIS um agregado.
 *
 * `nao_validado` NAO E UM QUINTO ESTADO: e o conjunto dos tres que a R9 recusa,
 * e ele entrou em 19/08/2026 junto com o link da tela de Pendencias.
 *
 * O MOTIVO E QUE O LINK NAO PODE MENTIR. A camada `documento_do_cliente` da
 * prontidao conta `NOT documento_validado` — os TRES —, e um link que caisse em
 * `sem_documento` mostraria uma lista MENOR do que a que a prontidao acusa:
 * quem conferisse veria a lista zerar com a camada ainda pendente, e concluiria
 * que uma das duas telas esta errada. Medido em producao em 04/08:
 * `documento_validado` false em 45 de 45, e a semente do CRM e justamente o
 * estado que "sem documento" nao alcanca.
 *
 * ELE VEM PRIMEIRO na ordem porque e o recorte do trabalho: os outros quatro
 * respondem "por que este nao vale", e este responde "quais nao valem".
 */
export type FiltroDeDocumento = 'nao_validado' | SituacaoDoDocumento;

export const ROTULO_DO_FILTRO_DE_DOCUMENTO: Record<FiltroDeDocumento, string> = {
  nao_validado: 'Ainda não vale para o contrato',
  ...ROTULO_DA_SITUACAO_DO_DOCUMENTO,
};

/** O filtro aplicado a um cliente. Filtro vazio nao filtra — a lista inteira e
 *  o padrao, e nao um recorte silencioso. */
export const casaComFiltroDeDocumento = (c: ClienteConferivel, filtro: string): boolean =>
  !filtro
  || (filtro === 'nao_validado' ? !destravaContrato(c) : situacaoDoDocumento(c) === filtro);

export type ContagemDeDocumentos = {
  total: number;
  sem_documento: number;
  /** Tem documento e NAO destrava o contrato - semente ou digito torto. */
  nao_validados: number;
  validados: number;
};

/**
 * A contagem para o aviso do topo.
 *
 * A INVARIANTE E A SOMA — `sem_documento + nao_validados + validados === total`,
 * sempre —, pelo mesmo motivo do `conferirTarifas`: uma contagem que perde item
 * em silencio e pior que contagem nenhuma, porque parece completa.
 */
export function contarDocumentos(lista: readonly ClienteConferivel[]): ContagemDeDocumentos {
  const c: ContagemDeDocumentos = { total: lista.length, sem_documento: 0, nao_validados: 0, validados: 0 };
  for (const x of lista) {
    const s = situacaoDoDocumento(x);
    if (s === 'sem_documento') c.sem_documento++;
    else if (s === 'validado') c.validados++;
    else c.nao_validados++;
  }
  return c;
}

// --------------------------------------------- a forma do documento, na tela
//
// ESPELHO DE `src/dominio/documento.ts`, e so da parte que e FORMA. A validacao
// - modulo 11, CPF repetido, CNPJ alfanumerico - fica no servidor, e a tela nao a
// refaz: ela mostra o que o servidor respondeu depois de gravar. Duas
// implementacoes do mesmo digito verificador divergiriam no dia em que a Receita
// mudasse uma regra, e a que divergiria em silencio seria a do navegador.

/** `normalizar()` do dominio: tira mascara, mantem letra (CNPJ alfanumerico
 *  comeca a ser emitido em 31/07/2026) e maiusculiza. */
export const normalizarDocumento = (bruto: string): string =>
  bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * `detectarTipo()` do dominio: tipo pelo COMPRIMENTO, 11 = CPF e 14 = CNPJ.
 *
 * Isto e forma e nao validacao, e a diferenca importa: um texto de 11 caracteres
 * e um CPF em forma, valido ou nao. A tela usa isto so para dizer o que esta
 * sendo digitado enquanto se digita; quem diz se VALE e o servidor.
 */
export function tipoPeloComprimento(bruto: string): 'cpf' | 'cnpj' | null {
  const d = normalizarDocumento(bruto);
  if (d.length === 11) return 'cpf';
  if (d.length === 14) return 'cnpj';
  return null;
}

/**
 * `12345678901` -> `123.456.789-01`. Posicional, e por isso funciona igual para
 * o CNPJ alfanumerico - as 12 primeiras posicoes aceitam letra e a mascara nao
 * olha o que ha nelas.
 *
 * O que nao tem 11 nem 14 caracteres volta como veio: inventar mascara para um
 * documento de comprimento errado o faria parecer mais correto do que e.
 */
export function formatarDocumento(bruto: string | null | undefined): string {
  const d = normalizarDocumento(String(bruto ?? ''));
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return d;
}

export type MotivoDeTravaDoDocumento = 'ocupado' | 'sem_mudanca' | 'comprimento';

/**
 * Por que o botao de gravar o documento esta travado.
 *
 * O QUE ELE NAO FAZ, E E A R9 INTEIRA: nao trava por digito errado. A R9 diz que
 * "documento invalido NAO bloqueia o cadastro - bloqueia a transicao do contrato
 * para ativo", e o comentario do dominio explica por que: *"o sistema nasce sobre
 * dado incompleto; travar na porta impediria a propria migracao"*. Uma tela que
 * recusasse gravar um CPF de digito torto seria mais rigida que a regra, e o
 * efeito pratico seria a pessoa nao conseguir registrar o que esta no contrato
 * de papel a sua frente.
 *
 * O comprimento TRAVA, e ele e outra coisa: 10 caracteres nao sao um CPF com
 * defeito, sao um documento pela metade - quase sempre digitacao interrompida.
 */
export function motivoDaTravaDoDocumento(e: {
  texto: string; atual: string | null; ocupado: boolean;
}): MotivoDeTravaDoDocumento | null {
  if (e.ocupado) return 'ocupado';
  const novo = normalizarDocumento(e.texto);
  const atual = normalizarDocumento(String(e.atual ?? ''));
  /* GRAVAR O MESMO TEXTO NAO E SEM EFEITO, e por isso "igual" so trava quando o
   * campo esta VAZIO e ja estava vazio. Reenviar o mesmo CPF que veio do CRM e
   * justamente o ato que troca a origem para `coleta_local` e destrava a R9 - e a
   * `so_validou` que o importador em lote ja contava a parte. */
  if (novo === '' && atual === '') return 'sem_mudanca';
  if (novo !== '' && tipoPeloComprimento(novo) === null) return 'comprimento';
  return null;
}

export const podeGravarDocumento = (e: { texto: string; atual: string | null; ocupado: boolean }): boolean =>
  motivoDaTravaDoDocumento(e) === null;
