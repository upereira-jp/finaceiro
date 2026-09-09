// A PORTA DE COBRANCA. O motor de faturamento nao conhece HTTP, nao conhece
// mTLS e nao conhece a Sicoob.
//
// POR QUE PORTA E NAO CLIENTE DIRETO. O precedente e o conector do CRM: a
// `PortaDeLeitura` e injetada, e foi isso que permitiu que 57 verificacoes do
// conector rodassem sem CRM de pe e que o ciclo fosse testado nos dois sentidos
// por plantio. Aqui o argumento e mais forte, porque a integracao Sicoob exige
// certificado A1 e credencial por tenant (PRD 6) - sem porta, nenhuma linha do
// faturamento seria testavel antes de existir um certificado.
//
// REGRA 5, e ela decide a forma desta interface. "Segredo POR TENANT vive em
// armazenamento cifrado e e acessado por REFERENCIA." Por isso nao ha
// `clientId`, `clientSecret` nem caminho de certificado em lugar nenhum deste
// arquivo: o que circula e `credencial_ref`, e quem a resolve e o adaptador, no
// momento da chamada. Um tipo que aceitasse o segredo faria a violacao
// compilar.
//
// O contraexemplo esta no banco ao lado: a tabela `tenants` do CRM guarda cinco
// tokens em `text` puro (P8 4), e o repositorio foi publico ate 25/07.

import type { Centavos } from '../dominio/centavos.ts';

/** Referencia opaca ao segredo do tenant. NUNCA o segredo. */
export type CredencialRef = string;

export type Pagador = {
  nome: string;
  /** So digitos. O tipo sai do tamanho, como em src/dominio/documento.ts. */
  documento: string;
  endereco?: {
    logradouro?: string | null; numero?: string | null; bairro?: string | null;
    municipio?: string | null; uf?: string | null; cep?: string | null;
  } | null;
};

/**
 * OS CINCO CAMPOS DE ENDERECO QUE A API EXIGE, e quais faltam neste pagador.
 *
 * ATE 28/08/2026 ISTO NAO PODIA EXISTIR. A guarda de emissao em `repos/boleto.ts`
 * dizia, por escrito, por que o endereco ficava de fora dela: "o que a Sicoob
 * exige de fato de endereco NAO ESTA MEDIDO (item (c) da Q-PAGADOR-01), e recusar
 * por um campo que talvez seja opcional bloquearia boleto que sairia". Era a
 * decisao certa com o que se sabia.
 *
 * AGORA ESTA MEDIDO: no modelo `Boleto`, dentro de `pagador`, os campos
 * `endereco`, `bairro`, `cidade`, `cep` e `uf` estao todos marcados com `*`. So
 * `email` e opcional. Entao a premissa da exclusao caiu, e a guarda pode existir.
 *
 * `numero` NAO entra na lista: ele nao e campo da API - vira parte da string
 * `endereco`, e endereco sem numero e endereco que o carteiro entrega.
 *
 * POR QUE ISTO IMPORTA MAIS DO QUE PARECE. Sem a guarda, quem recusa e a Sicoob,
 * com 400, que o adaptador traduz em 502 - e 502 poe o boleto na fila do `PRD` 6,
 * que por decisao registrada em `dominio/agenda.ts` NUNCA DESISTE SOZINHA. Com 0
 * de 29 enderecos preenchidos, a primeira emissao em lote poria 29 boletos
 * retentando para sempre contra um campo que so uma pessoa pode preencher.
 */
export const CAMPOS_DE_ENDERECO_EXIGIDOS = ['logradouro', 'bairro', 'municipio', 'cep', 'uf'] as const;

export function faltamNoEndereco(e: Partial<Record<string, unknown>> | null | undefined): string[] {
  const tem = (v: unknown) => {
    if (v == null) return false;
    const t = String(v).trim();
    // O CEP e o unico com forma: "00000-000" sem digito nenhum e preenchimento
    // de fachada, e a API recebe `cep` so com digitos.
    return t !== '';
  };
  const faltando = CAMPOS_DE_ENDERECO_EXIGIDOS.filter((c) => !tem((e ?? {})[c]));
  // CEP presente mas sem digito nenhum conta como ausente - `pagadorSicoob`
  // tiraria os nao-digitos e mandaria string vazia, que e campo obrigatorio vazio.
  if (!faltando.includes('cep') && String((e ?? {}).cep).replace(/\D/g, '') === '') faltando.push('cep');
  return faltando;
}

export type PedidoDeBoleto = {
  credencialRef: CredencialRef;
  /** Nosso identificador. A Sicoob devolve o dela; guardamos as duas, porque
   *  conciliar por um id que so o banco conhece nos deixa sem chave se a
   *  resposta se perder. */
  referencia: string;
  valorCentavos: Centavos;
  vencimento: Date;
  pagador: Pagador;
  /** Linhas livres impressas no boleto. Sem dado sensivel: o boleto e
   *  documento que circula. */
  mensagens?: string[];
};

export type BoletoRegistrado = {
  nossoNumero: string;
  linhaDigitavel: string;
  codigoBarras: string;
  /** Hibrido (PRD 4.3): o mesmo documento carrega boleto e Pix. */
  pixCopiaECola: string | null;
  pixTxid: string | null;
  sicoobNumeroContrato: string | null;
  sicoobNossoNumero: string | null;
  /**
   * O que subiu e o que voltou, para auditoria (PRD 6). O adaptador entrega
   * isto JA SEM SEGREDO - a constraint `boleto_payload_sem_segredo` da migration
   * 16 recusa a linha se vier com token dentro, e ela existe porque este e o
   * caminho obvio de vazamento: gravar a resposta do OAuth junto com a do
   * boleto.
   */
  payloadEnvio: unknown;
  payloadRetorno: unknown;
};

export type SituacaoDoBoleto = {
  nossoNumero: string;
  /** Situacao NO BANCO, nao no nosso sistema. */
  situacao: 'em_aberto' | 'liquidado' | 'baixado' | 'desconhecida';
  valorLiquidadoCentavos: Centavos | null;
  jurosCentavos: Centavos;
  multaCentavos: Centavos;
  dataLiquidacao: Date | null;
  /** Id do evento na origem. E a chave de idempotencia da baixa: o mesmo evento
   *  chegando por webhook e por consulta ativa nao entra duas vezes. */
  idExterno: string | null;
};

/**
 * O QUE O MOTOR PRECISA SABER SOBRE O AVISO DE PAGAMENTO, e nada alem disso.
 *
 * NAO E O MODELO DO BANCO. `WebhookCadastrado`, em `sicoob/http.ts`, tem onze
 * campos e fala a lingua da Sicoob; este tem quatro e responde a UNICA pergunta
 * que a agenda faz - "o banco ainda avisa quando alguem paga?". Subir o modelo
 * inteiro ate aqui poria o vocabulario da integracao dentro da porta, que existe
 * exatamente para nao ter nenhum.
 *
 * `inativado_em` e o campo que decide, e a escolha e a mesma de
 * `webhookInativo`: NAO se deriva de codigo de situacao. O contrato da Sicoob
 * nomeia um codigo e nao explica os outros - e a producao ja devolveu 2 onde o
 * exemplo do proprio banco mostrava 3, com a mesma descricao. Enum conhecido
 * pela metade nao vira afirmacao.
 */
export type AvisoDePagamento = {
  id: string;
  url: string | null;
  /** Carimbo do banco quando ele DESLIGOU o aviso. Enquanto for null, ele avisa. */
  inativado_em: string | null;
  motivo_da_inativacao: string | null;
};

/**
 * O contrato. Tres verbos, e nao mais: registrar, consultar, baixar.
 *
 * A CONSULTA ATIVA E REQUISITO, nao conveniencia - o PRD 6 pede "consulta ativa
 * diaria dos boletos em aberto para capturar liquidacoes cujo webhook falhou".
 * Um webhook perdido sem consulta ativa e dinheiro recebido que o sistema nunca
 * baixa, e a inadimplencia passa a acusar quem pagou.
 */
export interface PortaDeCobranca {
  registrar(pedido: PedidoDeBoleto): Promise<BoletoRegistrado>;
  consultar(credencialRef: CredencialRef, nossoNumero: string): Promise<SituacaoDoBoleto>;
  baixar(credencialRef: CredencialRef, nossoNumero: string, motivo: string): Promise<void>;

  /**
   * OPCIONAL, e o opcional e a decisao. Os tres verbos acima sao o caminho do
   * dinheiro e todo adaptador tem de saber fazer os tres; este e DIAGNOSTICO, e
   * exigi-lo obrigaria `COBRANCA_NAO_CONFIGURADA` e a `CobrancaFalsa` a inventar
   * uma resposta sobre um webhook que nao existe no mundo delas.
   *
   * Ausente NAO significa "esta tudo bem": significa "este adaptador nao sabe
   * responder", e quem chama tem de distinguir as duas - ver `nivelDoAviso`.
   */
  avisoDePagamento?(credencialRef: CredencialRef): Promise<AvisoDePagamento[]>;

  /**
   * OPCIONAL PELO MESMO MOTIVO do irmao acima, e com um agravante: este ESCREVE.
   *
   * Ele religa o canal por onde o banco avisa que um boleto foi pago - o unico
   * verbo desta porta que muda algo do lado de la sem que haja um titulo
   * envolvido. Nao entra na lista obrigatoria porque um adaptador que nao sabe
   * consultar webhook tambem nao teria como saber cadastrar um, e porque
   * `COBRANCA_NAO_CONFIGURADA` inventaria uma resposta sobre um canal que nao
   * existe no mundo dele.
   *
   * ⚠️ NAO E IDEMPOTENTE, e a porta nao esconde isso: chamar duas vezes cria
   * DOIS webhooks e o banco notifica em dobro. A guarda que impede e
   * `podeReligarOAviso`, no dominio, e ela roda ANTES - quem chama este metodo
   * ja decidiu que pode.
   *
   * A URL vem de FORA, e nao daqui: ela e derivada do tenant
   * (`sicoob/webhook.ts`), e um adaptador que a inventasse poria o dinheiro de
   * um tenant no endereco de outro.
   */
  religarAvisoDePagamento?(
    credencialRef: CredencialRef,
    p: { url: string; email: string },
  ): Promise<{ id: string }>;
}

export class CobrancaNaoConfigurada extends Error {
  readonly status = 503;
  constructor(operacao: string) {
    super(
      `Cobranca Sicoob nao configurada: "${operacao}" nao pode ser executada. Falta o ` +
      'certificado A1 e a credencial do tenant, que vivem em armazenamento cifrado e sao ' +
      'acessados por credencial_ref (regra 5). Nenhum boleto foi registrado e nenhuma fatura ' +
      'mudou de estado.'
    );
    this.name = 'CobrancaNaoConfigurada';
  }
}

/**
 * O adaptador que o composition root liga quando NAO ha credencial.
 *
 * Ele existe para que a ausencia de integracao seja um erro alto e nomeado em
 * vez de um `undefined` que estoura tres camadas adiante, e para que o resto do
 * sistema - composicao, emissao, baixa manual, split - funcione inteiro sem
 * Sicoob. A F2 nao fica bloqueada por um certificado.
 */
export const COBRANCA_NAO_CONFIGURADA: PortaDeCobranca = {
  async registrar() { throw new CobrancaNaoConfigurada('registrar boleto'); },
  async consultar() { throw new CobrancaNaoConfigurada('consultar boleto'); },
  async baixar() { throw new CobrancaNaoConfigurada('baixar boleto'); },
};
