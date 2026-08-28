// A RESOLVEDORA. O unico lugar do sistema que transforma `credencial_ref` em
// certificado - e ela mora aqui, e nao no adaptador, por uma razao de desenho
// que o `ADR-0005` 4 nomeia:
//
//   "Trocar o cofre depois e trocar a implementacao do resolvedor - nao muda a
//    porta, nao muda conector_cobranca, nao muda migration, nao muda
//    repositorio."
//
// Por isso o que o `http.ts` recebe e uma FUNCAO, nao um cliente de Vault. No
// dia em que o cofre virar AWS Secrets Manager (opcao C do mesmo ADR), muda
// este arquivo e mais nada.
//
// O QUE ELE NUNCA FAZ: devolver o segredo para log, para payload gravado ou
// para mensagem de erro. O `toJSON` la embaixo existe exatamente para isso - um
// `console.log(credencial)` ou um `JSON.stringify` acidental imprime
// "[credencial resolvida - conteudo omitido]" em vez do A1.

import { db, tenantCorrente } from '../db/contexto.ts';
import { dbt } from '../db/tipado.ts';
import type { CredencialRef } from './porta.ts';

/**
 * A identidade do cooperado na Cobranca v3. Ela vem da COOPERATIVA - ver a
 * migration 35 sobre por que nao se deriva de `agencia`/`conta`/`numero_contrato`.
 *
 * DOIS sao obrigatorios; os outros dois sao opcionais e SOMEM do corpo quando
 * nao existem, porque a colecao Postman diz que a API "nao permite enviar um
 * campo com valor nulo".
 */
export type IdentidadeDoCooperado = {
  numeroCliente: number;
  codigoModalidade: number;
  /**
   * OPCIONAL, e o DEFAULT CERTO E NULL. A pagina da API (fonte primaria, colada
   * pelo dono em 28/08/2026) e mais forte que a colecao Postman:
   *
   *   "O campo numeroContratoCobranca NAO E NECESSARIO no corpo da requisicao
   *    para o cadastro de um boleto. (...) Caso este campo seja preenchido
   *    INCORRETAMENTE, a API retornara o erro 'Numero do contrato de cobranca
   *    invalido'. (...) O campo so deve ser preenchido em casos muito
   *    especificos, quando houver uma ORIENTACAO EXPRESSA para utiliza-lo."
   *
   * Ou seja: preencher por conta propria nao e "mais completo", e uma FONTE DE
   * ERRO. Exigi-lo impedia o cooperado de contrato unico de ligar o conector -
   * era a `Q-CONTRATOCOB-01`, e a migration 36 tirou a exigencia do banco.
   */
  numeroContratoCobranca: number | null;
  /**
   * OBRIGATORIO. Estava marcado aqui como "nao esta medido se a API o exige" -
   * e em 28/08/2026 mediu-se: o modelo `Boleto` o marca com `*`, "conta
   * corrente onde sera realizado o CREDITO DA LIQUIDACAO do boleto".
   *
   * Continua valendo que `0` nao serve: inventar conta de credito e o pior
   * default concebivel num sistema que move dinheiro. Como e exigido e nao se
   * inventa, ele virou condicao de ATIVAR o conector - `CredencialIncompleta`
   * recusa antes de qualquer chamada, e a migration 36 o exige no banco.
   */
  numeroContaCorrente: number;
};

export type CredencialResolvida = {
  clientId: string;
  /** O A1 em memoria. NUNCA em disco - `ADR-0005` D, e o VPS e compartilhado
   *  com o CRM, que guarda cinco tokens em text puro. */
  pfx: Buffer;
  senhaDoPfx: string;
  sandbox: boolean;
  /**
   * Token pronto, quando NAO ha OAuth a fazer. E o caso do SANDBOX da Sicoob, e
   * so dele: medido em 27/08/2026, o sandbox nao emite token - ele aceita um
   * `client_id` e um Bearer fixos, ambos publicos, e responde exemplo estatico.
   *
   * Em producao isto e `null`, sempre, e o token nasce do `client_credentials`
   * sobre mTLS. O campo existe para que o adaptador seja exercitavel HOJE contra
   * o sandbox, que era a terceira razao pela qual ele nunca foi escrito
   * (`SICOOB-contrato-medido` 5: "nao ha como exercita-lo").
   */
  tokenFixo: string | null;
  identidade: IdentidadeDoCooperado;
  toJSON(): string;
};

/** A porta do cofre. Uma funcao, de proposito - ver o cabecalho. */
export type Resolvedora = (ref: CredencialRef) => Promise<CredencialResolvida>;

export class CredencialIncompleta extends Error {
  readonly status = 412;
  constructor(faltando: string[]) {
    super(
      `O conector de cobranca esta ativo mas incompleto: falta ${faltando.join(', ')}. ` +
      'Estes campos vem da COOPERATIVA e nao se derivam de agencia, conta ou numero ' +
      'de contrato. (O numeroContratoCobranca NAO entra nesta lista: e opcional, e so ' +
      'existe para cooperado com mais de um contrato.) ' +
      'Nenhum boleto foi enviado. Preencha na aba Emissao e cobranca e peca de novo.'
    );
    this.name = 'CredencialIncompleta';
  }
}

export class CofreIndisponivel extends Error {
  readonly status = 503;
  constructor(porque: string) {
    super(
      `O cofre nao devolveu a credencial: ${porque}. Nenhum boleto foi enviado e nenhuma ` +
      'fatura mudou de estado.'
    );
    this.name = 'CofreIndisponivel';
  }
}

/**
 * O que a linha do cofre guarda. UM JSON, e nao tres segredos separados, porque
 * a resolucao tem de ser atomica: um `client_id` novo com o certificado velho e
 * um estado que nao existe no portal da Sicoob, e resolver em duas leituras
 * abriria essa janela.
 *
 * `client_secret` NAO ESTA AQUI, e isso e medicao de 27/08/2026, nao suposicao:
 * o realm `cooperado` declara `tls_client_auth` e
 * `tls_client_certificate_bound_access_tokens: true` no proprio
 * openid-configuration. O certificado E a credencial, e o token nasce atado a
 * ele. O `SICOOB-contrato-medido` 1 dizia "nao esta medido" - agora esta, por
 * fonte primaria.
 */
type SegredoNoCofre = {
  client_id: string;
  pfx_base64: string;
  senha: string;
  /** So sandbox. Ver `tokenFixo` em `CredencialResolvida`. */
  token_fixo?: string;
};

function redigido(): string { return '[credencial resolvida - conteudo omitido]'; }

/**
 * A resolvedora de producao: Supabase Vault pela funcao `SECURITY DEFINER` da
 * migration 35.
 *
 * DUAS LEITURAS, E UMA SO TRANSACAO. O segredo vem do cofre; a identidade do
 * cooperado vem de `conector_cobranca`, que NAO e segredo - e numero de
 * contrato, nao chave privada. Guardar identidade no cofre obrigaria a
 * reescrever o segredo inteiro para corrigir um `codigoModalidade` digitado
 * errado, e o cofre e a peca do sistema que menos se quer estar mexendo.
 */
export const cofreDoVault: Resolvedora = async (ref: CredencialRef) => {
  const c = await dbt().conector_cobranca.findFirst({ where: { credencial_ref: ref, ativo: true } });
  if (!c) {
    throw new CofreIndisponivel(
      `nao ha conector de cobranca ATIVO com esta referencia no tenant ${tenantCorrente()}`
    );
  }

  const faltando: string[] = [];
  if (c.numero_cliente == null) faltando.push('numeroCliente');
  if (c.codigo_modalidade == null) faltando.push('codigoModalidade');
  if (c.numero_conta_corrente == null) faltando.push('numeroContaCorrente');
  if (faltando.length) throw new CredencialIncompleta(faltando);

  let linhas: Array<{ segredo: string }>;
  try {
    linhas = await db().$queryRaw`
      SELECT app.resolver_credencial_cobranca(${ref}) AS segredo`;
  } catch (err: any) {
    // A mensagem do Postgres entra, e o HINT com ela - as duas foram escritas
    // na migration para quem le o erro, nao para quem escreveu a funcao. O que
    // NAO entra e o `ref`... que ja esta na mensagem do banco e nao e segredo:
    // referencia opaca e justamente o que se pode dizer em voz alta.
    throw new CofreIndisponivel(String(err?.message ?? err).split('\n')[0]);
  }

  const bruto = linhas?.[0]?.segredo;
  if (!bruto) throw new CofreIndisponivel('a resolvedora devolveu vazio');

  let s: SegredoNoCofre;
  try {
    s = JSON.parse(bruto);
  } catch {
    // Sem o conteudo na mensagem: um JSON quebrado pode ter o certificado
    // inteiro dentro, e mensagem de erro vai para log.
    throw new CofreIndisponivel('o segredo guardado nao e um JSON valido');
  }

  const semCampo = ['client_id', 'pfx_base64', 'senha'].filter((k) => !(s as any)[k]);
  if (semCampo.length) {
    throw new CofreIndisponivel(`o segredo guardado nao tem ${semCampo.join(', ')}`);
  }

  const pfx = Buffer.from(s.pfx_base64, 'base64');
  if (pfx.length === 0) throw new CofreIndisponivel('o certificado guardado esta vazio');

  return {
    clientId: s.client_id,
    pfx,
    senhaDoPfx: s.senha,
    sandbox: c.sandbox,
    tokenFixo: s.token_fixo ?? null,
    identidade: {
      numeroCliente: c.numero_cliente!,
      codigoModalidade: c.codigo_modalidade!,
      numeroContratoCobranca: c.numero_contrato_cobranca ?? null,
      numeroContaCorrente: c.numero_conta_corrente!,
    },
    toJSON: redigido,
  };
};

/**
 * Resolvedora de TESTE. Nao le banco, nao le cofre, e existe para que o
 * adaptador HTTP seja exercitavel contra um servidor local - que e o unico
 * jeito de testar o caminho de SUCESSO do registro, ja que o sandbox da Sicoob
 * e mock estatico e devolve 400 em todo POST (medido em 27/08/2026).
 */
export function cofreFixo(v: {
  clientId?: string; pfx?: Buffer; senha?: string; sandbox?: boolean;
  tokenFixo?: string | null;
  identidade?: Partial<IdentidadeDoCooperado>;
}): Resolvedora {
  return async () => ({
    clientId: v.clientId ?? 'cliente-de-teste',
    pfx: v.pfx ?? Buffer.alloc(0),
    senhaDoPfx: v.senha ?? '',
    sandbox: v.sandbox ?? true,
    tokenFixo: v.tokenFixo ?? null,
    identidade: {
      numeroCliente: 25546454,
      codigoModalidade: 1,
      numeroContratoCobranca: 1,
      numeroContaCorrente: 123456,
      ...v.identidade,
    },
    toJSON: redigido,
  });
}
