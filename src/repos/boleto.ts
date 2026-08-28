// Repositorio de boleto. E a unica coisa do sistema que fala com a porta de
// cobranca - e ainda assim nao fala com a Sicoob: fala com a INTERFACE.
//
// A PORTA CHEGA POR PARAMETRO e nao por import. E o mesmo desenho do conector do
// CRM, e o motivo e o mesmo: um modulo que importa o adaptador concreto nao
// consegue ser exercitado sem ele, e aqui "sem ele" significa sem certificado
// A1, sem credencial de sandbox e sem rede. Com a porta injetada, todo o caminho
// - registrar, guardar, falhar, tentar de novo, baixar - roda no teste.
//
// O QUE ESTE ARQUIVO NAO FAZ: nao liquida. Boleto liquidado no banco vira baixa
// em src/repos/liquidacao.ts, que e o unico gatilho do split. Se o registro do
// boleto pudesse liquidar, existiriam dois caminhos para repartir dinheiro.

import { dbt } from '../db/tipado.ts';
import { db, tenantCorrente, exigir } from '../db/contexto.ts';
import { emReais } from '../dominio/centavos.ts';
import { proximaTentativaEm } from '../dominio/agenda.ts';
import { digitosDaLinha } from '../dominio/linha-digitavel.ts';
import {
  conferirImportacao, explicarRecusa,
  type ConferenciaDaImportacao, type TranscricaoDoBoleto,
} from '../dominio/boleto-importado.ts';
import { CobrancaNaoConfigurada, type PortaDeCobranca, type SituacaoDoBoleto } from '../sicoob/porta.ts';

export class CobrancaNaoHabilitada extends Error {
  readonly status = 412;
  constructor() {
    super(
      'Este tenant nao tem conector de cobranca ativo. Cadastre o conector com a ' +
      'credencial_ref (regra 5 - a referencia, nunca o segredo) e marque-o como ativo. ' +
      'A fatura continua valida e cobravel por outro meio; o que nao existe e o boleto.'
    );
    this.name = 'CobrancaNaoHabilitada';
  }
}

export class FaturaSemBoleto extends Error {
  readonly status = 409;
  constructor(status: string) {
    super(
      `So fatura emitida ganha boleto, e esta esta em "${status}". Rascunho ainda pode mudar ` +
      'de valor - registrar boleto de rascunho poria no banco um numero que a conferencia ' +
      'ainda vai alterar.'
    );
    this.name = 'FaturaSemBoleto';
  }
}

/**
 * O pagador sem CPF/CNPJ. `422`, e nao `502` — ver a guarda em `registrar()`.
 *
 * A MENSAGEM NOMEIA A UC, e isso nao e enfeite: quem le esta frase esta num lote
 * de 28 boletos e precisa saber QUAL cliente falta, nao que "algum" falta. O nome
 * vem junto porque numero de UC nao se reconhece de cabeca.
 */
export class PagadorSemDocumento extends Error {
  readonly status = 422;
  constructor(nome: string | null, numeroUc: string) {
    super(
      `A UC ${numeroUc} nao tem CPF/CNPJ do cliente${nome ? ` (${nome})` : ''}, e boleto sem ` +
      'identificacao do pagador o banco recusa. O dado entra pela aba Clientes, no proprio ' +
      'sistema, ou em lote por `npm run documentos` — preenchido, peca o boleto de novo. ' +
      'Nada foi enviado a Sicoob e nenhum boleto foi criado.'
    );
    this.name = 'PagadorSemDocumento';
  }
}

/** O conector do tenant corrente, ou erro. Nunca devolve credencial ao chamador
 *  alem da referencia - e a referencia nao e segredo. */
async function conector() {
  const c = await dbt().conector_cobranca.findFirst({ where: { ativo: true } });
  if (!c) throw new CobrancaNaoHabilitada();
  return c;
}

/**
 * A IDENTIDADE DO COOPERADO, e por que ela nao e mais um `?? null`.
 *
 * Estes quatro campos vao para a API como NUMERO JSON, e numero JSON nao tem
 * zero a esquerda. Quem digita "0025" numa tela quer dizer 25, e guardar o texto
 * "0025" para mandar 25 depois e guardar uma informacao que nao existe.
 *
 * E o que NAO e numero para AQUI, e nao la: um `codigoModalidade` digitado como
 * "1a" viraria `NaN`, e `NaN` em coluna `integer` o Prisma manda como `null` -
 * o campo simplesmente sumiria, e o conector ficaria "salvo" e incapaz de
 * emitir. Recusar aqui e a diferenca entre um erro de digitacao e um conector
 * que parece pronto.
 */
export class IdentidadeInvalida extends Error {
  readonly status = 422;
  constructor(campo: string, valor: unknown) {
    super(
      `"${campo}" tem de ser um numero inteiro positivo, e veio ${JSON.stringify(valor)}. ` +
      'Estes campos vem da COOPERATIVA e vao para a API da Sicoob como numero - eles nao se ' +
      'derivam de agencia, conta nem do numero do contrato desta mesma tela.'
    );
    this.name = 'IdentidadeInvalida';
  }
}

function inteiroPositivoOuNull(v: unknown, campo: string): number | null {
  if (v == null || v === '') return null;
  // `Number(" 12 ")` e 12 e `Number("")` e 0: os dois seriam aceitos por um
  // `Number.isInteger` ingenuo. O teste e sobre o TEXTO, antes da conversao.
  const t = String(v).trim();
  if (!/^\d+$/.test(t)) throw new IdentidadeInvalida(campo, v);
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n <= 0) throw new IdentidadeInvalida(campo, v);
  return n;
}

export async function cadastrarConector(e: {
  credencial_ref: string;
  numero_contrato?: string | null;
  numero_convenio?: string | null;
  agencia?: string | null;
  conta?: string | null;
  numero_cliente?: number | string | null;
  codigo_modalidade?: number | string | null;
  numero_contrato_cobranca?: number | string | null;
  numero_conta_corrente?: number | string | null;
  certificado_expira_em?: Date | null;
  sandbox?: boolean;
  ativo?: boolean;
}) {
  await exigir('administrar');
  const tenant_id = tenantCorrente();
  const dados = {
    credencial_ref: e.credencial_ref.trim(),
    numero_contrato: e.numero_contrato ?? null,
    numero_convenio: e.numero_convenio ?? null,
    agencia: e.agencia ?? null,
    conta: e.conta ?? null,
    numero_cliente: inteiroPositivoOuNull(e.numero_cliente, 'numeroCliente'),
    codigo_modalidade: inteiroPositivoOuNull(e.codigo_modalidade, 'codigoModalidade'),
    numero_contrato_cobranca: inteiroPositivoOuNull(e.numero_contrato_cobranca, 'numeroContratoCobranca'),
    numero_conta_corrente: inteiroPositivoOuNull(e.numero_conta_corrente, 'numeroContaCorrente'),
    certificado_expira_em: e.certificado_expira_em ?? null,
    sandbox: e.sandbox ?? true,
    ativo: e.ativo ?? false,
  };
  return dbt().conector_cobranca.upsert({
    where: { tenant_id }, create: { tenant_id, provedor: 'sicoob', ...dados }, update: dados,
  });
}

/**
 * Registra o boleto da fatura no banco, pela porta.
 *
 * A LINHA DO BOLETO NASCE ANTES DA CHAMADA, em `pendente`. Parece detalhe e nao
 * e: se a linha so existisse depois da resposta, uma chamada que sobe o boleto e
 * perde a resposta - timeout, processo morto - deixaria um boleto registrado no
 * banco sem nada do nosso lado apontando para ele. Na proxima tentativa,
 * registrariamos o SEGUNDO boleto da mesma fatura, e o cliente receberia dois.
 *
 * Com a linha nascendo antes, o unico `boleto_fatura_unico` da migration 16
 * impede a segunda tentativa de criar um segundo documento: ela reaproveita a
 * linha, e `tentativas` conta.
 */
/**
 * O resultado do registro. NAO e excecao, e a razao foi MEDIDA em 28/07 ao
 * escrever o teste K17.
 *
 * A primeira versao gravava a falha na linha do boleto e RELANCAVA o erro. Parece
 * certo e nao e: a unidade de trabalho e UMA transacao (SPEC-001 3.2), entao o
 * `throw` desfaz a propria gravacao da falha. O resultado era o pior dos dois
 * mundos - a rota devolvia erro, e a fila de retentativa do PRD 6 nao tinha
 * memoria nenhuma: `tentativas` voltava a zero e `ultimo_erro` sumia.
 *
 * Gravar em transacao separada nao e caminho: transacao dentro de transacao toma
 * conexao nova e nao herda o contexto de tenant, e a escrita cairia na policy
 * (invariante 10, e o ContextoAninhado existe para nao deixar tentar).
 *
 * Entao o fato "tentamos e falhou" COMMITA junto com o resto, e quem traduz isso
 * em status HTTP e a rota. Nao ha 200 para emissao que nao aconteceu - ha 502
 * com a linha gravada. O teste K17 confere as duas coisas.
 */
export type ResultadoDoRegistro =
  | { registrado: true; boleto: Awaited<ReturnType<typeof porFatura>> }
  | { registrado: false; boleto: Awaited<ReturnType<typeof porFatura>>; erro: string };

export async function registrar(faturaId: string, cobranca: PortaDeCobranca): Promise<ResultadoDoRegistro> {
  await exigir('escrever_carteira');
  const c = await conector();

  const f = await dbt().fatura.findFirst({ where: { id: faturaId } });
  if (!f) throw Object.assign(new Error('Fatura nao encontrada.'), { status: 404 });
  if (f.status !== 'emitida') throw new FaturaSemBoleto(f.status);

  const uc = await dbt().unidade_consumidora.findFirst({
    where: { id: f.unidade_consumidora_id },
    include: { cliente: true },
  });
  if (!uc?.cliente) throw Object.assign(new Error('Cliente da fatura nao encontrado.'), { status: 404 });
  /*
   * O PAGADOR SEM IDENTIFICACAO PARA AQUI, e ate 06/08/2026 nao parava: a linha
   * do `pagador` mandava `documento ?? ''` e a string vazia ia para o banco.
   *
   * POR QUE A RECUSA E NOSSA E NAO DELES. Sem guarda, quem recusa e a Sicoob, e a
   * recusa volta pelo `catch` la embaixo traduzida em **502** - o codigo que diz
   * "o outro lado falhou". O defeito nao e do outro lado: e um CPF que ninguem
   * digitou, e o conserto e `npm run documentos`. Um 502 manda procurar
   * indisponibilidade de banco; esta mensagem manda preencher um campo.
   *
   * E POR QUE ANTES DE CRIAR A LINHA, que e a parte que nao e obvia. Todo o resto
   * deste arquivo trabalha para que a linha nasca ANTES da chamada - se a rede
   * cair no meio, existe boleto no banco e precisa existir do nosso lado tambem.
   * Aqui e o contrario: nada foi tentado, porque nao ha o que tentar. Criar a
   * linha poria na fila de retentativa do `PRD` 6 um boleto que **nao pode dar
   * certo** ate alguem digitar um documento - e a fila, por decisao registrada
   * em `dominio/agenda.ts`, NUNCA DESISTE SOZINHA. Seria uma tentativa a cada
   * `tetoSegundos`, para sempre, contra a mesma ausencia.
   *
   * Metade aberta da `Q-PAGADOR-01`. A outra metade - o endereco - fechou em
   * 05/08 com `npm run enderecos`, e NAO entra nesta guarda: o que a Sicoob
   * exige de fato de endereco nao esta medido (item (c) da questao), e recusar
   * por um campo que talvez seja opcional bloquearia boleto que sairia.
   */
  const documentoDoPagador = uc.cliente.documento?.trim();
  if (!documentoDoPagador) throw new PagadorSemDocumento(uc.cliente.nome, uc.numero_uc);

  const total = f.valor_total_centavos ?? 0;
  const existente = await dbt().boleto.findFirst({ where: { fatura_id: faturaId } });
  if (existente?.status === 'registrado') return { registrado: true, boleto: existente };

  const linha = existente ?? await dbt().boleto.create({
    data: {
      tenant_id: tenantCorrente(),
      fatura_id: faturaId,
      valor_registrado_centavos: total,
      vencimento: f.vencimento,
      status: 'pendente',
    },
  });

  /*
   * O CARIMBO DA TENTATIVA, e ele e o mesmo nos dois desfechos. A migration 21
   * acrescentou `ultima_tentativa_em` porque a fila do PRD 6 precisa saber
   * QUANDO foi a ultima tentativa: sem ele o intervalo exponencial so poderia
   * ser contado a partir de `criado_em`, e um boleto que falhou ontem seria
   * retentado no mesmo instante que um que falhou agora.
   *
   * Carimbado aqui, e nao no motor da agenda, porque este e o unico lugar do
   * sistema que TENTA. A rota `POST /faturas/:id/boleto` chamada a mao e uma
   * tentativa igual, e uma tentativa manual que nao mexe na fila faria a agenda
   * retentar dois minutos depois do que uma pessoa acabou de tentar.
   */
  const agora = new Date();

  try {
    const r = await cobranca.registrar({
      credencialRef: c.credencial_ref,
      referencia: linha.id,
      valorCentavos: total,
      vencimento: f.vencimento,
      pagador: {
        nome: uc.cliente.nome,
        // Sem `?? ''`: a guarda la em cima ja garantiu que ha documento, e
        // deixar o fallback aqui manteria vivo o caminho que ela fecha.
        documento: documentoDoPagador,
        endereco: {
          logradouro: uc.endereco_logradouro, numero: uc.endereco_numero,
          bairro: uc.endereco_bairro, municipio: uc.endereco_municipio,
          uf: uc.endereco_uf, cep: uc.endereco_cep,
        },
      },
      mensagens: [`Competencia ${f.competencia.toISOString().slice(0, 7)}`, `UC ${uc.numero_uc}`],
    });

    const gravado = await dbt().boleto.update({
      where: { id: linha.id },
      data: {
        nosso_numero: r.nossoNumero,
        linha_digitavel: r.linhaDigitavel,
        codigo_barras: r.codigoBarras,
        pix_copia_e_cola: r.pixCopiaECola,
        pix_txid: r.pixTxid,
        sicoob_numero_contrato: r.sicoobNumeroContrato ?? c.numero_contrato,
        sicoob_nosso_numero: r.sicoobNossoNumero,
        status: 'registrado',
        registrado_em: agora,
        ultimo_erro: null,
        // Passou: sai da fila. `proxima_tentativa_em` nulo com
        // `ultima_tentativa_em` preenchido satisfaz o
        // `boleto_agendamento_coerente` da migration 21 - o inverso e que o
        // banco recusa.
        ultima_tentativa_em: agora,
        proxima_tentativa_em: null,
        // A constraint `boleto_payload_sem_segredo` confere estes dois. Um
        // adaptador que devolvesse o token junto faria o INSERT falhar - que e
        // o comportamento certo, e e testado plantando o segredo.
        payload_envio: r.payloadEnvio as any,
        payload_retorno: r.payloadRetorno as any,
      },
    });
    return { registrado: true, boleto: gravado };
  } catch (err: any) {
    /*
     * A FALHA COMMITA, e o `throw` e que nao pode existir aqui - ver o
     * comentario de ResultadoDoRegistro. A fila de retentativa do PRD 6 precisa
     * saber o que tentou e falhou, e um erro relancado desfaria essa mesma
     * gravacao junto com a transacao.
     *
     * Erro de PROGRAMACAO continua subindo: o `catch` so absorve falha da porta
     * de cobranca. Um TypeError daqui de dentro virando "boleto com erro" seria
     * a mesma falha silenciosa com outra roupa.
     */
    if (err instanceof TypeError || err instanceof RangeError) throw err;
    /*
     * "Nao configurada" tambem sobe, e a distincao nao e formal: falha de
     * transporte e para retentar, ausencia de credencial nao. Marcar o boleto
     * como `erro` e consumir uma tentativa aqui encheria a fila de retentativa
     * com itens que nunca vao passar - e esconderia o unico conserto possivel,
     * que e cadastrar a credencial.
     */
    if (err instanceof CobrancaNaoConfigurada) throw err;

    /*
     * O intervalo sai da contagem DEPOIS desta falha - `linha.tentativas` e o
     * valor lido antes do incremento, entao o `+ 1` e a tentativa que acabou de
     * falhar. Ler o valor de volta do banco para calcular custaria um round-trip
     * e daria o mesmo numero.
     */
    const tentativaAtual = linha.tentativas + 1;
    const comErro = await dbt().boleto.update({
      where: { id: linha.id },
      data: {
        status: 'erro',
        tentativas: { increment: 1 },
        ultimo_erro: String(err?.message ?? err).slice(0, 500),
        ultima_tentativa_em: agora,
        proxima_tentativa_em: proximaTentativaEm(tentativaAtual, agora),
      },
    });
    return { registrado: false, boleto: comErro, erro: String(err?.message ?? err) };
  }
}

// ------------------------------------------------- o boleto emitido no banco
//
// A METADE QUE GRAVA do caminho descrito em `src/dominio/boleto-importado.ts`.
// A conferencia inteira mora la, e e pura; aqui ficam as tres perguntas que
// dependem do banco - a fatura pode receber boleto, ja ha linha, e o que fazer
// com ela.
//
// O QUE ESTE CAMINHO NAO FAZ, E OS QUATRO SAO DELIBERADOS:
//
//   - NAO chama `conector()`. E o ponto inteiro: ele existe para funcionar sem
//     conector e sem certificado A1, que e a unica pendencia do projeto. Exigir
//     conector aqui recriaria a trava que este caminho contorna;
//   - NAO exige CPF/CNPJ do pagador, ao contrario de `registrar()`. La a guarda
//     existe porque o BANCO recusaria; aqui o banco JA aceitou - o boleto esta
//     impresso. Repetir a guarda seria recusar um fato consumado;
//   - NAO grava `payload_envio` nem `payload_retorno`. Nada subiu e nada voltou,
//     e um payload sintetico ali seria a unica linha do sistema em que esses dois
//     campos nao significam "o que trocamos com a Sicoob";
//   - NAO liquida. Continua valendo o cabecalho deste arquivo: baixa e de
//     `liquidacao.ts`, e ela e o unico gatilho do split.

/** A fatura ja tem boleto, e ele nao e este. `409`, e a lista de estados que
 *  podem ser sobrescritos e curta de proposito - ver `importar()`. */
export class BoletoJaExiste extends Error {
  readonly status = 409;
  constructor(status: string, origem: string) {
    super(
      `Esta fatura ja tem um boleto em "${status}" (origem ${origem}), e importar por cima ` +
      'apagaria o que ele registrou. So boleto `pendente` ou `erro` — tentativa nossa que ' +
      'nao completou — pode ser substituido pelo que foi emitido a mao. Para trocar um boleto ' +
      'registrado, de baixa nele no banco primeiro.'
    );
    this.name = 'BoletoJaExiste';
  }
}

/**
 * A transcricao nao passa na conferencia. `422` - o dado que chegou e que esta
 * errado, e nada foi gravado.
 *
 * A frase vem do dominio, inteira: as mesmas palavras que a tela mostra antes de
 * a pessoa apertar o botao. Duas redacoes para a mesma recusa fariam quem opera
 * achar que sao dois problemas.
 */
export class ImportacaoRecusada extends Error {
  readonly status = 422;
  readonly conferencia: ConferenciaDaImportacao;
  constructor(c: ConferenciaDaImportacao) {
    super(
      (c.recusa ? explicarRecusa(c.recusa) : 'A transcricao do boleto nao confere.') +
      ' Nada foi gravado.'
    );
    this.name = 'ImportacaoRecusada';
    this.conferencia = c;
  }
}

/** A fatura como a conferencia a enxerga. Uma consulta, dois usos - `conferir()`
 *  e `importar()` -, e nunca duas leituras que possam divergir no meio. */
async function faturaParaBoleto(faturaId: string) {
  const f = await dbt().fatura.findFirst({ where: { id: faturaId } });
  if (!f) throw Object.assign(new Error('Fatura nao encontrada.'), { status: 404 });
  if (f.status !== 'emitida') throw new FaturaSemBoleto(f.status);
  return f;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * CONFERE SEM GRAVAR. E a mesma funcao do dominio, contra a fatura de verdade.
 *
 * Existe porque a tela nao pode responder isto sozinha: os quatro digitos
 * verificadores e a leitura dos 44 digitos vivem em `dominio/linha-digitavel.ts`,
 * do lado do servidor, e reimplementa-los no navegador seria a segunda
 * implementacao da mesma aritmetica - o defeito que este projeto ja colapsou
 * quatro vezes com "centavos -> R$".
 *
 * `exigir('ler')`: nao escreve nada.
 */
export async function conferirParaImportar(
  faturaId: string, t: TranscricaoDoBoleto,
): Promise<ConferenciaDaImportacao> {
  await exigir('ler');
  const f = await faturaParaBoleto(faturaId);
  return conferirImportacao(t, {
    valor_total_centavos: f.valor_total_centavos == null ? null : Number(f.valor_total_centavos),
    vencimento_iso: iso(f.vencimento),
  });
}

/**
 * Importa para a fatura o boleto que ja foi emitido no portal do banco.
 *
 * IDEMPOTENTE PELA LINHA, e nao pelo pedido. Importar duas vezes a MESMA linha
 * devolve a mesma coisa sem escrever de novo - a pessoa que nao viu o resultado e
 * clicou outra vez nao produz um segundo fato. Linha DIFERENTE por cima de um
 * registrado e outra historia, e ela para em `BoletoJaExiste`.
 */
export async function importar(faturaId: string, t: TranscricaoDoBoleto) {
  await exigir('escrever_carteira');
  const f = await faturaParaBoleto(faturaId);

  const c = conferirImportacao(t, {
    valor_total_centavos: f.valor_total_centavos == null ? null : Number(f.valor_total_centavos),
    vencimento_iso: iso(f.vencimento),
  });
  /* A RECUSA VEM ANTES DE QUALQUER ESCRITA, e ao contrario de `registrar()` ela
   * LEVANTA. La o `throw` era proibido porque a fila de retentativa precisa da
   * memoria da falha; aqui nao ha fila e nao ha tentativa: ha um texto que nao
   * confere, e retentar sozinho o mesmo texto daria o mesmo resultado para
   * sempre. */
  if (!c.aceita) throw new ImportacaoRecusada(c);

  const existente = await dbt().boleto.findFirst({ where: { fatura_id: faturaId } });
  if (existente && existente.status !== 'pendente' && existente.status !== 'erro') {
    const mesmaLinha = digitosDaLinha(existente.linha_digitavel ?? '') === c.digitos;
    if (mesmaLinha && existente.origem === 'importado') return existente;
    throw new BoletoJaExiste(existente.status, existente.origem);
  }

  const dados = {
    nosso_numero: c.nosso_numero,
    linha_digitavel: c.digitos,
    /* REMONTADO da linha, nunca digitado - `codigoDeBarrasDaLinha`. Os dois tem
     * de ser a MESMA informacao em duas formas, e a unica maneira de garantir
     * isso e derivar um do outro em vez de aceitar os dois. */
    codigo_barras: c.codigo_barras,
    pix_copia_e_cola: c.pix_copia_e_cola,
    /* SEM `pix_txid`. O txid identifica uma cobranca Pix registrada na API, e
     * este payload foi COPIADO de um papel: inventar um txid faria a conciliacao
     * procurar no banco por uma cobranca que ela nao criou. */
    valor_registrado_centavos: c.valor_centavos!,
    /* O VENCIMENTO DO PROPRIO BOLETO, lido do fator dentro dos 44 digitos. O
     * `?? f.vencimento` cobre o fator 0000, que a especificacao define como "sem
     * vencimento" e que a conferencia NAO trata como divergencia - e a coluna e
     * NOT NULL. Nesse caso a data da fatura e a melhor verdade disponivel, e ela
     * e a mesma que o documento imprime. */
    vencimento: c.vencimento ? new Date(`${c.vencimento}T00:00:00.000Z`) : f.vencimento,
    status: 'registrado' as const,
    origem: 'importado' as const,
    registrado_em: new Date(),
    /* O ERRO DA TENTATIVA ANTERIOR SAI, e `tentativas` FICA. O erro descrevia o
     * estado de agora e deixou de ser verdade; a contagem descreve o que
     * aconteceu e continua sendo. Apagar as duas coisas junto seria reescrever a
     * historia da fatura para que ela pareca ter dado certo de primeira. */
    ultimo_erro: null,
    /* SAI DA FILA. `ultima_tentativa_em` NAO e carimbado: nenhuma tentativa
     * aconteceu, e carimba-lo aqui faria a agenda contar um intervalo a partir de
     * um evento que nao existiu. Nulo em `proxima_tentativa_em` satisfaz
     * `boleto_agendamento_coerente` nos dois casos - com e sem tentativa previa. */
    proxima_tentativa_em: null,
  };

  return existente
    ? dbt().boleto.update({ where: { id: existente.id }, data: dados })
    : dbt().boleto.create({ data: { tenant_id: tenantCorrente(), fatura_id: faturaId, ...dados } });
}

/**
 * PRD 6: "consulta ativa diaria dos boletos em aberto para capturar liquidacoes
 * cujo webhook falhou". Devolve o que o banco diz; NAO baixa.
 *
 * Nao baixar aqui e deliberado: quem baixa e liquidacao.baixar(), e ter um unico
 * caminho de baixa e o que faz a idempotencia por `id_externo` valer para os dois
 * canais. Um webhook e uma consulta ativa que trazem o mesmo evento produzem o
 * mesmo `id_externo`, e o segundo nao entra.
 */
export async function situacaoDosEmAberto(cobranca: PortaDeCobranca, limite = 200): Promise<SituacaoDoBoleto[]> {
  await exigir('ler');
  const c = await conector();
  /* A CONSULTA E `emAberto`, e nao uma copia dela. As duas viviam neste mesmo
   * arquivo com o mesmo `where` e o mesmo `orderBy`, e ja divergiam num ponto:
   * com `limite = 0`, `emAberto` trazia 1 linha (`Math.max(1, ...)`) e esta
   * trazia 0. Duas copias da mesma pergunta divergem calado no dia em que
   * "em aberto" mudar de definicao. */
  const abertos = await emAberto(limite);
  const situacoes: SituacaoDoBoleto[] = [];
  for (const b of abertos) situacoes.push(await cobranca.consultar(c.credencial_ref, b.nosso_numero!));
  return situacoes;
}

/**
 * A FILA DE EMISSAO do PRD 6: o que esta vencido para nova tentativa.
 *
 * Duas classes entram, e a segunda e a que nao era obvia:
 *
 *   `erro`     tentou e falhou. E o caso do nome.
 *   `pendente` a LINHA nasceu e a chamada nunca terminou - processo morto,
 *              timeout do lado de ca. A linha nasce antes da chamada de
 *              proposito (ver o cabecalho de `registrar`), entao `pendente`
 *              velho e um boleto que ninguem sabe se subiu. Deixa-lo fora da
 *              fila e o mesmo buraco em outra roupa.
 *
 * `proxima_tentativa_em` NULO conta como vencido, e o `NULLS FIRST` da ordem faz
 * essas linhas saírem primeiro: sao as mais antigas sem agendamento - as que a
 * migration 21 encontrou ja em erro, e as `pendente` que nunca foram carimbadas.
 *
 * Nao ha teto de tentativas na consulta, e a ausencia e deliberada: ver o
 * cabecalho de `src/dominio/agenda.ts`. O que cresce e o intervalo, nunca o
 * silencio.
 */
export async function filaDeEmissao(agora: Date, limite: number) {
  await exigir('ler');
  const r: Array<{ boleto_id: string; fatura_id: string; status: string; tentativas: number;
                   ultimo_erro: string | null; proxima_tentativa_em: Date | null }> =
    await db().$queryRaw`
      SELECT b.id AS boleto_id, b.fatura_id, b.status::text, b.tentativas,
             b.ultimo_erro, b.proxima_tentativa_em
        FROM boleto b
        JOIN fatura f ON f.tenant_id = b.tenant_id AND f.id = b.fatura_id
       WHERE b.status IN ('pendente','erro')
         AND (b.proxima_tentativa_em IS NULL OR b.proxima_tentativa_em <= ${agora})
         -- So fatura emitida ganha boleto - FaturaSemBoleto. Sem este filtro a
         -- fila retentaria eternamente o boleto de uma fatura CANCELADA, e cada
         -- rodada gastaria uma chamada para receber o mesmo 409.
         AND f.status IN ('emitida','vencida')
       ORDER BY b.proxima_tentativa_em ASC NULLS FIRST, b.vencimento ASC
       LIMIT ${Math.max(1, Math.min(limite, 500))}`;
  return r;
}

/** Quantos ficaram para tras nesta rodada. Existe para a rodada poder DIZER que
 *  truncou - "cobri tudo" e "cobri os 200 primeiros" nao podem ser a mesma
 *  saida. */
export async function tamanhoDaFila(agora: Date): Promise<number> {
  await exigir('ler');
  const r: Array<{ n: bigint }> = await db().$queryRaw`
    SELECT count(*) AS n
      FROM boleto b
      JOIN fatura f ON f.tenant_id = b.tenant_id AND f.id = b.fatura_id
     WHERE b.status IN ('pendente','erro')
       AND (b.proxima_tentativa_em IS NULL OR b.proxima_tentativa_em <= ${agora})
       AND f.status IN ('emitida','vencida')`;
  return Number(r[0]?.n ?? 0);
}

/**
 * QUANTOS ESTAO EM ABERTO, ao todo. Irmao de `tamanhoDaFila`, e ele existe pelo
 * mesmo motivo: a rodada tem de poder DIZER que truncou.
 *
 * ============================================================================
 * A CONSULTA ATIVA MENTIA, E FOI MEDIDO. `executarFilaDeEmissao` calcula
 * `deixados_para_tras = total - fila.length` desde sempre; `executarConsultaAtiva`
 * nunca tocava no campo, entao ele saia **0** em toda rodada - inclusive quando
 * havia 5.000 boletos registrados e a rodada examinou 200.
 *
 * "0 deixados para tras" e uma afirmacao, e ela e a mais perigosa que um relatorio
 * de rodada pode fazer: e a diferenca entre "conferi todos" e "conferi os 200
 * primeiros por vencimento". Com a carteira crescendo, os mesmos 200 mais antigos
 * seriam consultados para sempre e os demais nunca - sem nenhum sinal.
 */
export async function tamanhoDosEmAberto(): Promise<number> {
  await exigir('ler');
  const r: Array<{ n: bigint }> = await db().$queryRaw`
    SELECT count(*) AS n FROM boleto b
     WHERE b.status = 'registrado' AND b.nosso_numero IS NOT NULL
       AND b.origem = 'api_sicoob'`;
  return Number(r[0]?.n ?? 0);
}

/**
 * Os `registrado` com nosso numero, que e o universo da consulta ativa. Devolve
 * a linha inteira porque o motor precisa do `fatura_id` para baixar.
 *
 * O IMPORTADO FICA DE FORA, e a exclusao e o motivo de a coluna `origem` existir
 * (migration 32). O `nosso_numero` de um boleto importado foi TRANSCRITO do
 * rotulo impresso no papel, e o rotulo impresso nao e necessariamente o
 * identificador que a API de Cobranca v3 aceita em consulta. Perguntar por ele
 * nao devolve "este titulo nao e nosso": devolve erro, e o motor traduz erro em
 * `registrarDivergencia` — uma divergencia gravada, na tela, contra um boleto que
 * esta certo.
 *
 * O QUE ISSO CUSTA, dito por extenso: boleto importado nao e conciliado
 * automaticamente. Ele e cobrado pela baixa manual da aba `Emissao e cobranca`
 * (`/faturas`), que e o mesmo caminho que a operacao ja usa hoje para tudo — e
 * o unico, enquanto o A1 nao
 * existe. Quando o A1 existir, se a conciliacao automatica dos importados passar
 * a valer a pena, a pergunta e a `Q-BOLIMP-01`: ela tem dono e nao e o
 * implementador (regra 10).
 */
export async function emAberto(limite: number) {
  await exigir('ler');
  return dbt().boleto.findMany({
    where: { status: 'registrado', nosso_numero: { not: null }, origem: 'api_sicoob' },
    orderBy: [{ vencimento: 'asc' }],
    take: Math.max(1, Math.min(limite, 500)),
  });
}

/** A divergencia achada pela consulta ativa fica NA LINHA do boleto, e nao so no
 *  registro da execucao. Quem abre a fatura precisa ver o que o banco disse sem
 *  saber que existe uma tabela de agenda. */
export async function registrarDivergencia(boletoId: string, motivo: string) {
  await exigir('escrever_carteira');
  return dbt().boleto.update({
    where: { id: boletoId },
    data: { ultimo_erro: motivo.slice(0, 500) },
  });
}

/** O banco cancelou o titulo. Nao ha dinheiro, entao nao ha split - so o nosso
 *  estado a alinhar com o dele. */
export async function marcarBaixadoNoBanco(boletoId: string, motivo: string) {
  await exigir('escrever_carteira');
  return dbt().boleto.update({
    where: { id: boletoId },
    data: { status: 'baixado', baixado_em: new Date(), ultimo_erro: motivo.slice(0, 500) },
  });
}

export async function baixarNoBanco(faturaId: string, motivo: string, cobranca: PortaDeCobranca) {
  await exigir('escrever_carteira');
  const c = await conector();
  const b = await dbt().boleto.findFirst({ where: { fatura_id: faturaId } });
  if (!b?.nosso_numero) throw Object.assign(new Error('Boleto nao registrado.'), { status: 404 });
  /* PELA MESMA RAZAO DE `emAberto`: o `nosso_numero` do importado foi transcrito
   * do papel, e mandar a Sicoob baixar por ele ou nao acha titulo nenhum ou acha
   * o ERRADO. Baixar titulo emitido a mao e no portal onde ele foi emitido. */
  if (b.origem === 'importado') {
    throw Object.assign(
      new Error(
        'Este boleto foi IMPORTADO — emitido a mao no portal do banco, e nao registrado por ' +
        'nos pela porta de cobranca. Baixa-lo por aqui mandaria a Sicoob procurar por um ' +
        '"nosso numero" que foi transcrito de um PDF. Baixe no proprio portal, e registre o ' +
        'desfecho nesta fatura pela baixa manual.'
      ),
      { status: 409, name: 'BoletoImportadoNaoSeBaixaPelaApi' },
    );
  }

  await cobranca.baixar(c.credencial_ref, b.nosso_numero, motivo);
  return dbt().boleto.update({
    where: { id: b.id },
    data: { status: 'baixado', baixado_em: new Date(), ultimo_erro: null },
  });
}

export async function porFatura(faturaId: string) {
  await exigir('ler');
  return dbt().boleto.findFirst({ where: { fatura_id: faturaId } });
}

/** PRD 6, ultima linha: certificado vencido para a emissao "sem erro obvio".
 *  Isto e o erro obvio, e ele nao depende de abrir o cofre. */
export async function certificadoVenceEm(): Promise<{ dias: number | null; expira_em: Date | null }> {
  await exigir('ler');
  const c = await dbt().conector_cobranca.findFirst({});
  if (!c?.certificado_expira_em) return { dias: null, expira_em: null };
  const dias = Math.floor((c.certificado_expira_em.getTime() - Date.now()) / 86_400_000);
  return { dias, expira_em: c.certificado_expira_em };
}

export { emReais };
