// AS DUAS PORTAS DA CONCESSIONARIA. O sistema nao conhece o portal da
// Equatorial, nao conhece navegador e nao conhece modelo de visao.
//
// POR QUE DUAS E NAO UMA. Baixar o documento e ler o documento falham por
// motivos que nao tem nada em comum, e misturar as duas coisas numa porta so
// esconde qual metade quebrou:
//
//   a coleta falha por    credencial recusada, portal fora do ar, protecao de
//                         bot, UC sem fatura no mes
//   a leitura falha por   documento ilegivel, layout que mudou, campo que o
//                         extrator nao achou
//
// Sao dois donos, dois modos de retentativa e dois adaptadores falsos. Com a
// separacao, a fatura ja baixada continua legivel quando o portal cai, e o
// mesmo PDF pode ser relido quando o extrator melhorar - sem tocar o portal de
// novo, que e a operacao cara e a que tem limite.
//
// POR QUE PORTA E NAO CLIENTE DIRETO. O precedente e duplo e os dois funcionaram:
// a `PortaDeLeitura` do CRM (`SPEC-002`) e a `PortaDeCobranca` do Sicoob. Aqui o
// argumento e ainda mais forte, porque a coleta depende de um portal de terceiro
// que este repositorio NAO CONTROLA e que ja foi medido recusando cliente que nao
// e navegador - sem porta, nenhuma linha desta frente seria testavel.
//
// REGRA 5, e ela decide a forma destas interfaces. O acesso ao portal da
// distribuidora e credencial por tenant, entao nao ha usuario, senha, CPF nem
// cookie em tipo nenhum deste arquivo: o que circula e `credencial_ref`, e quem
// a resolve e o adaptador, no momento da chamada. Um tipo que aceitasse o
// segredo faria a violacao COMPILAR - foi assim que `src/sicoob/porta.ts` fechou
// a mesma porta, e o contraexemplo continua sendo o CRM ao lado, com cinco
// tokens em `text` puro.

import type { CamposDaFatura } from '../dominio/fatura-concessionaria.ts';

/** Referencia opaca ao segredo do tenant. NUNCA o segredo. */
export type CredencialRef = string;

/** O que o portal devolve. Bytes e proveniencia, sem interpretacao nenhuma. */
export type DocumentoDaFatura = {
  /** O arquivo como veio. PDF ou imagem — o leitor decide o que faz com isso. */
  conteudo: Uint8Array;
  /** `application/pdf`, `image/png`, `image/jpeg`. */
  tipo: string;
  /**
   * Impressao digital do conteudo.
   *
   * NAO E ENFEITE, e o que torna a coleta idempotente: baixar de novo a mesma
   * fatura tem de ser reconhecivel como a mesma fatura, senao toda rodada
   * produz um registro novo e a trilha da regra 9 vira ruido. E tambem e o que
   * permite dizer "o portal mudou o documento" sem guardar duas copias.
   */
  sha256: string;
  /** Quando o portal entregou. Nao e a data da fatura. */
  coletado_em: Date;
  /**
   * O que o portal disse sobre o documento, como disse. Vai para a trilha.
   * SEM SEGREDO: o adaptador entrega isto ja limpo, pela mesma razao que a
   * constraint `boleto_payload_sem_segredo` existe na migration 16.
   */
  proveniencia: Record<string, string>;
};

export type PedidoDeColeta = {
  credencialRef: CredencialRef;
  /** O numero como o banco guarda. Quem normaliza zero a esquerda e o dominio. */
  numeroUC: string;
  /** `AAAA-MM-01`. */
  competencia: string;
};

/**
 * A porta de COLETA. Um verbo, e nao mais.
 *
 * Nao ha `listar`, e a ausencia e escolha: uma lista de faturas disponiveis
 * convidaria o sistema a decidir quais baixar, e o universo de UCs e decisao com
 * dono (`Q-EQTL-ESCOPO-01`), nao descoberta do adaptador. Quem chama ja sabe
 * qual UC e qual competencia quer.
 */
export interface PortaDeColetaDeFatura {
  coletar(pedido: PedidoDeColeta): Promise<DocumentoDaFatura>;
}

/**
 * A porta de LEITURA. Documento entra, campos de TEXTO saem.
 *
 * O tipo de retorno e `CamposDaFatura` — texto cru, exatamente como o extrator
 * leu — e nao a leitura ja validada. A validacao e conversao para centavos
 * moram em `src/dominio/fatura-concessionaria.ts`, que e puro e testado sem
 * rede.
 *
 * ISSO NAO E CERIMONIA. Se o extrator devolvesse `Centavos`, a regra de "1.234"
 * viveria dentro do adaptador — fora do alcance dos testes, diferente da regra
 * da planilha, e impossivel de conferir contra o texto original. O ensaio precisa
 * imprimir a INTERPRETACAO ao lado do que estava escrito, e para isso o que
 * estava escrito tem de chegar inteiro. E a licao do `importar-tarifas`.
 */
export interface PortaDeLeituraDeFatura {
  extrair(documento: DocumentoDaFatura): Promise<ExtracaoDaFatura>;
}

export type ExtracaoDaFatura = {
  campos: CamposDaFatura;
  /**
   * Quem leu, e como. Vai para a trilha junto com o resultado.
   *
   * Uma leitura por modelo de visao e uma leitura por camada de texto do PDF
   * erram de formas diferentes, e no dia em que um numero sair errado a primeira
   * pergunta e qual das duas produziu aquele campo.
   */
  metodo: string;
  /**
   * O texto de onde cada campo saiu, quando o extrator sabe dizer.
   *
   * NAO E CONFIANCA EM PORCENTAGEM, e de proposito. Um numero de 0 a 1 convida a
   * um limiar, e um limiar e uma decisao de negocio disfarcada de configuracao:
   * abaixo de quanto a fatura para de ser cobrada? Isso tem dono e nao e o
   * extrator. O que serve para conferir e o trecho original, que uma pessoa le.
   */
  trechos?: Partial<Record<keyof CamposDaFatura, string>>;
};

// ---------------------------------------------------------------- as recusas

export class ColetaNaoConfigurada extends Error {
  readonly status = 503;
  constructor(operacao: string) {
    super(
      `Coleta de fatura da concessionaria nao configurada: "${operacao}" nao pode ser executada. `
      + 'Falta a credencial do portal da distribuidora, que vive em armazenamento cifrado e e '
      + 'acessada por credencial_ref (regra 5). Nenhum portal foi acessado e nenhuma fatura mudou.'
    );
    this.name = 'ColetaNaoConfigurada';
  }
}

export class LeituraNaoConfigurada extends Error {
  readonly status = 503;
  constructor() {
    super(
      'Leitura de fatura da concessionaria nao configurada: nao ha extrator ligado. O documento '
      + 'foi coletado e esta guardado; nenhum campo foi inventado.'
    );
    this.name = 'LeituraNaoConfigurada';
  }
}

// NOTA DE SINTAXE, e ela ja custou uma execucao: NADA de propriedade de
// parametro (`constructor(readonly x: string)`) nos tres erros abaixo. O
// `tsconfig` liga `erasableSyntaxOnly` porque o projeto roda TypeScript direto
// no Node por `--experimental-strip-types`, e strip-types APAGA tipos sem
// EXECUTAR TypeScript - propriedade de parametro nao e tipo, e sintaxe que gera
// codigo. O campo se declara e se atribui, como em `src/sicoob/falso.ts`.

/** A UC nao tem fatura naquela competencia. NAO e erro: e resposta. */
export class SemFaturaNaCompetencia extends Error {
  readonly status = 404;
  readonly numeroUC: string;
  readonly competencia: string;
  constructor(numeroUC: string, competencia: string) {
    super(`a UC ${numeroUC} nao tem fatura publicada na competencia ${competencia}`);
    this.name = 'SemFaturaNaCompetencia';
    this.numeroUC = numeroUC;
    this.competencia = competencia;
  }
}

/**
 * O portal recusou a credencial.
 *
 * SEPARADA DE `ColetaNaoConfigurada` de proposito, e a distincao vale dinheiro
 * de tempo: "nao ha credencial" e trabalho nosso, "a credencial nao serve" e
 * trabalho de quem tem a conta. Colapsar as duas em 503 faria a operacao
 * procurar no lugar errado — que e exatamente o que o `401` do deploy de 30/07
 * ensinou sobre confundir camadas.
 */
export class CredencialRecusadaPeloPortal extends Error {
  readonly status = 502;
  readonly numeroUC: string;
  constructor(numeroUC: string) {
    super(`o portal da distribuidora recusou a credencial da UC ${numeroUC}`);
    this.name = 'CredencialRecusadaPeloPortal';
    this.numeroUC = numeroUC;
  }
}

/**
 * O portal respondeu, e o que respondeu nao e a fatura.
 *
 * Medido em 07/08/2026: `equatorialenergia.com.br` responde **403** com cookies
 * `visid_incap_*` e header `x-iinfo` a cliente que nao e navegador. Isso e
 * protecao de bot, e o modo de falha dela e devolver uma PAGINA valida em vez de
 * um erro — quem nao distinguir vai extrair campos de um aviso de bloqueio.
 */
export class PortalBloqueouAColeta extends Error {
  readonly status = 502;
  readonly detalhe: string;
  constructor(detalhe: string) {
    super(`o portal da distribuidora bloqueou a coleta: ${detalhe}`);
    this.name = 'PortalBloqueouAColeta';
    this.detalhe = detalhe;
  }
}

// ---------------------------------------------------------------- os padroes

/**
 * O que o composition root liga quando NAO ha credencial de portal.
 *
 * Existe pela mesma razao do `COBRANCA_NAO_CONFIGURADA`: para que a ausencia da
 * integracao seja erro alto e nomeado em vez de `undefined` estourando tres
 * camadas adiante, e para que todo o resto — compor, lancar tarifa por planilha,
 * emitir, imprimir — siga funcionando inteiro sem portal nenhum. A frente de
 * leitura automatica ACRESCENTA um caminho; ela nao substitui o que ja existe.
 */
export const COLETA_NAO_CONFIGURADA: PortaDeColetaDeFatura = {
  async coletar() { throw new ColetaNaoConfigurada('coletar fatura'); },
};

export const LEITURA_NAO_CONFIGURADA: PortaDeLeituraDeFatura = {
  async extrair() { throw new LeituraNaoConfigurada(); },
};
