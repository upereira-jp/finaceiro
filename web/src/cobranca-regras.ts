// As regras da cobranca, PURAS e fora do componente.
//
// POR QUE ELAS NAO MORAM NO `.tsx`. O runner do `web/` e
// `node --experimental-strip-types`, que NAO le JSX: regra dentro de um `.tsx` e
// inalcancavel por teste, e a regra 8 diz que invariante sem teste e comentario.
// O precedente e o `contrato-regras.ts`, escrito no mesmo dia por esse motivo.
//
// ------------------------------------------------------------------------
// O QUE ESTE ARQUIVO PROTEGE, e e a regra 5 no lugar exato onde ela costuma cair.
//
// A tela de Cobranca e um formulario que pede a credencial da Sicoob. E o campo
// `credencial_ref` e uma REFERENCIA a um cofre - nunca o segredo. Quem opera nao
// tem por que saber dessa distincao: o caminho natural e colar ali o
// `client_secret`, o conteudo do `.pem` ou o token, e o banco aceitaria, porque
// a coluna e `text`.
//
// O contraexemplo esta no banco ao lado: a tabela `tenants` do CRM guarda cinco
// tokens em `text` puro (`P8` §4), e o repositorio foi PUBLICO ate 25/07. Nao
// herdamos esse padrao por descuido de formulario.
//
// Entao a trava e aqui, nomeada, e testada nos dois sentidos: uma referencia
// curta e opaca passa; qualquer coisa com CARA de segredo nao passa, e a tela
// diz por que. Isso NAO substitui o cofre - o `ADR-0005` esta em proposta e a
// `credencial_ref` hoje aponta para um armazenamento que nao existe. E deteccao,
// como o `CAT-8` para o `rls_auto_enable`, e nao prevencao.
//
// ------------------------------------------------------------------------
// AS TRANSICOES ABAIXO SAO ESPELHO DO SERVIDOR, NAO REGRA NOVA.
//
// Cada uma cita a linha que manda de verdade. A tela existe para nao oferecer um
// botao que o servidor vai recusar - e o servidor recusa de qualquer forma, o
// que e a ordem certa: a UI economiza um erro, ela nao autoriza nada.

/** Status da fatura, como o enum `status_fatura` do banco. */
export type StatusFatura = 'rascunho' | 'emitida' | 'paga' | 'vencida' | 'cancelada' | 'negociada';

/** Status do boleto, como o enum `status_boleto`. */
export type StatusBoleto = 'pendente' | 'registrado' | 'liquidado' | 'baixado' | 'cancelado' | 'erro';

// ------------------------------------------------------- regra 5 no formulario

/**
 * Sinais de que o texto colado no campo e o SEGREDO, e nao a referencia a ele.
 *
 * A lista e de sinais grosseiros de proposito: ela nao tenta decidir se algo e
 * secreto, so reconhecer as formas em que segredo de verdade chega. Um falso
 * positivo custa uma mensagem explicando a regra 5; um falso negativo custa um
 * segredo em `text` puro no banco, e ai a correcao e rotacao de credencial, nao
 * `UPDATE`.
 */
const SINAIS_DE_SEGREDO: Array<{ nome: string; casa: (v: string) => boolean }> = [
  { nome: 'bloco PEM', casa: (v) => /-----BEGIN [A-Z ]+-----/.test(v) },
  { nome: 'JWT', casa: (v) => /^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(v) },
  { nome: 'chave privada ou certificado', casa: (v) => /PRIVATE KEY|CERTIFICATE|\.pfx\b|\.p12\b/i.test(v) },
  { nome: 'nome de campo de segredo', casa: (v) => /client[_-]?secret|password|senha|access[_-]?token|api[_-]?key/i.test(v) },
  // Base64 longo e a forma de um `.pfx` colado. 120 e folgado: uma referencia
  // como "sicoob/g3-solar/prod" ou um UUID tem menos de 60.
  { nome: 'base64 longo', casa: (v) => /^[A-Za-z0-9+/=]{120,}$/.test(v.replace(/\s/g, '')) },
  { nome: 'texto longo demais para ser referencia', casa: (v) => v.replace(/\s/g, '').length > 200 },
];

/** O primeiro sinal encontrado, ou `null`. O NOME volta para a tela poder dizer
 *  o que ela reconheceu, em vez de recusar sem explicacao. */
export function sinalDeSegredo(valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;
  return SINAIS_DE_SEGREDO.find((s) => s.casa(v))?.nome ?? null;
}

export type EstadoDoConector = {
  /** O que o usuario digitou em `credencial_ref`. */
  credencialRef: string;
  /** `provedor` escolhido - hoje o enum do banco tem so a Sicoob, mas a coluna
   *  existe porque um segundo banco nao muda o resto do desenho. */
  provedor: string;
  /** Ja ha uma escrita em voo. */
  ocupado: boolean;
};

export type MotivoDeTravaDoConector =
  | 'ocupado'
  | 'sem_provedor'
  | 'sem_credencial_ref'
  | 'credencial_ref_parece_segredo';

/**
 * Por que o botao de salvar esta travado, na ordem em que a pessoa resolve.
 *
 * `null` quando nao ha impedimento. Nao devolve texto de UI: a tela decide como
 * mostrar, e um motivo por vez evita a lista de reclamacoes que ninguem le.
 */
export function motivoDaTravaDoConector(e: EstadoDoConector): MotivoDeTravaDoConector | null {
  if (e.ocupado) return 'ocupado';
  if (!e.provedor.trim()) return 'sem_provedor';
  if (!e.credencialRef.trim()) return 'sem_credencial_ref';
  if (sinalDeSegredo(e.credencialRef)) return 'credencial_ref_parece_segredo';
  return null;
}

export const podeSalvarConector = (e: EstadoDoConector): boolean => motivoDaTravaDoConector(e) === null;

// ------------------------------------------------------------- o certificado A1

/**
 * O estado do A1, e ele tem QUATRO valores porque tres deles sao diferentes de
 * "ok" por razoes diferentes.
 *
 * O `PRD` §6, ultima linha, nomeia o modo de falha: certificado vencido derruba
 * a emissao "sem erro obvio". `nao_medido` (sem data cadastrada) NAO e `ok` - e
 * a mesma distincao que o `prontidao.ts` faz e que a tela de Contratos aprendeu
 * a fazer em 29/07: ausencia de leitura nao e ausencia de problema.
 *
 * O limite de 30 dias e escolha declarada, nao medicao: e o prazo tipico de
 * emissao de um A1 novo. Se virar decisao, muda aqui, num lugar so.
 */
export const DIAS_DE_AVISO_DO_CERTIFICADO = 30;

export type EstadoDoCertificado = 'sem_conector' | 'nao_medido' | 'vencido' | 'vence_em_breve' | 'ok';

export function estadoDoCertificado(e: { temConector: boolean; dias: number | null }): EstadoDoCertificado {
  if (!e.temConector) return 'sem_conector';
  if (e.dias == null) return 'nao_medido';
  if (e.dias < 0) return 'vencido';
  if (e.dias <= DIAS_DE_AVISO_DO_CERTIFICADO) return 'vence_em_breve';
  return 'ok';
}

// --------------------------------------------------- espelho do que o servidor
//                                                     permite, com a linha dele

/** `src/repos/fatura.ts` → `emitir()`: `updateMany` com `status: 'rascunho'`, e
 *  a mensagem do erro e "so rascunho pode ser emitida". */
export const podeEmitirFatura = (s: StatusFatura): boolean => s === 'rascunho';

/**
 * `src/repos/boleto.ts` → `registrar()`: `if (f.status !== 'emitida') throw
 * FaturaSemBoleto`. E o registro e IDEMPOTENTE - boleto ja `registrado` volta o
 * mesmo, sem chamar o banco -, entao a tela nao oferece pedir de novo.
 */
export function podeGerarBoleto(fatura: StatusFatura, boleto: StatusBoleto | null): boolean {
  if (fatura !== 'emitida') return false;
  return boleto !== 'registrado' && boleto !== 'liquidado';
}

// ------------------------------------------- o boleto EMITIDO NO BANCO (17/08)
//
// A aba Faturas ganhou um segundo caminho para o boleto existir, e ele nao passa
// pela Sicoob: o titulo e emitido a mao no internet banking e TRANSCRITO para ca.
// Ver `src/dominio/boleto-importado.ts` para o porque e para as recusas.
//
// O QUE ESTAS DUAS FUNCOES NAO FAZEM, e e o mesmo limite do resto do arquivo:
// elas nao conferem a linha digitavel. Os quatro digitos verificadores, a
// remontagem dos 44 e a leitura do valor e do vencimento sao do dominio, no
// servidor, e a tela os pede por `POST /faturas/:id/boleto/conferir`. O que mora
// aqui e so o que a tela precisa saber SEM ida ao servidor: se oferece o campo, e
// se o botao pode acender.

/**
 * `src/repos/boleto.ts` → `importar()`: mesma precondicao de `registrar()` (`if
 * (f.status !== 'emitida') throw FaturaSemBoleto`) e a lista curta de boletos
 * substituiveis (`pendente` e `erro` — tentativa nossa que nao completou).
 *
 * REPARE QUE `erro` ACEITA IMPORTACAO, e e o caso mais provavel de todos: a
 * chamada a Sicoob falhou, alguem emitiu o boleto no portal, e e esse boleto que
 * precisa entrar. Tratar `erro` como "ja tem boleto" fecharia a porta exatamente
 * onde ela e mais necessaria.
 */
export function podeImportarBoleto(fatura: StatusFatura, boleto: StatusBoleto | null): boolean {
  if (fatura !== 'emitida') return false;
  return boleto === null || boleto === 'pendente' || boleto === 'erro';
}

export type EstadoDaImportacao = {
  /** O que esta no campo da linha digitavel, como a pessoa colou. */
  linha: string;
  /** Ja ha uma escrita ou uma leitura em voo. */
  ocupado: boolean;
  /** O que a ULTIMA conferencia do servidor respondeu. `null` = ainda nao houve. */
  conferida: boolean | null;
};

export type MotivoDeTravaDaImportacao =
  | 'ocupado'
  | 'sem_linha'
  | 'digitos_de_menos'
  | 'nao_conferida'
  | 'recusada';

/** Quantos digitos uma linha digitavel de cobranca tem. Espelho de
 *  `conferirLinhaDigitavel`, que recusa por `comprimento` antes de qualquer
 *  aritmetica. */
export const DIGITOS_DA_LINHA = 47;

/**
 * Por que o botao de importar esta travado, na ordem em que a pessoa resolve.
 *
 * `null` quando nao ha impedimento. A CONTAGEM DE DIGITOS E O UNICO JUIZO QUE A
 * TELA FAZ SOZINHA, e ela e barata e honesta: dizer "faltam 12 dígitos" enquanto
 * alguem digita e melhor que uma ida ao servidor por tecla. Quem decide se a
 * linha CONFERE continua sendo o servidor - `nao_conferida` e o estado entre uma
 * coisa e outra, e ele TRAVA: um botao aceso sobre conferencia que nao voltou
 * convidaria a gravar sem saber.
 */
export function motivoDaTravaDaImportacao(e: EstadoDaImportacao): MotivoDeTravaDaImportacao | null {
  if (e.ocupado) return 'ocupado';
  const digitos = e.linha.replace(/\D/g, '');
  if (digitos.length === 0) return 'sem_linha';
  if (digitos.length !== DIGITOS_DA_LINHA) return 'digitos_de_menos';
  if (e.conferida === null) return 'nao_conferida';
  if (e.conferida === false) return 'recusada';
  return null;
}

export const podeImportarAgora = (e: EstadoDaImportacao): boolean =>
  motivoDaTravaDaImportacao(e) === null;

/** `src/repos/liquidacao.ts` → `baixar()`: `if (f.status !== 'emitida' && f.status
 *  !== 'vencida') throw FaturaNaoLiquidavel`. */
export const podeBaixarManual = (s: StatusFatura): boolean => s === 'emitida' || s === 'vencida';

/**
 * O valor que a baixa TEM de ter, ao centavo.
 *
 * `src/repos/liquidacao.ts` confere `recebido !== total` e levanta
 * `ValorNaoConfere`, e a constraint `liquidacao_pelo_total` confere de novo no
 * banco. A tela pre-enche com esta conta para que o caminho normal nao seja um
 * erro de servidor - e a conta e SOMA DE INTEIROS em centavos, sem divisao e sem
 * float em ponto nenhum (regra 1).
 *
 * Repare que juros e multa entram na conta e sao digitados na mesma tela: mudar
 * um deles muda o total esperado, e e por isso que isto e funcao e nao um campo
 * fixo lido da fatura.
 */
export function totalEsperadoDaBaixa(
  f: { valor_consumo_centavos: number; valor_tarifas_concessionaria_centavos: number },
  jurosCentavos: number,
  multaCentavos: number,
): number {
  return f.valor_consumo_centavos + f.valor_tarifas_concessionaria_centavos + jurosCentavos + multaCentavos;
}

// ------------------------------------- a tarifa da concessionaria que nao chegou
//
// `Q-TARIFA-CONC-01`, a metade que voltou a abrir em 06/08. O que falta ali nao e
// um dado: e uma ORDEM que nenhum documento diz, e a ausencia dela NAO aparece
// como recusa.
//
// `fatura.valor_total_centavos` e coluna GERADA - `valor_consumo +
// valor_tarifas_concessionaria + valor_juros_multa` (`schema.prisma:485`) -, o
// segundo tem default 0, e `comporLote` usa zero quando ninguem informa
// (`src/repos/fatura.ts:191`). Entao o lote compoe e emite **sem erro nenhum**,
// cobrando so o credito. Nao ha excecao, nao ha log e nao ha linha vermelha: ha
// uma fatura de valor menor, que o cliente paga, e que fecha o mes errado.
//
// E `lancarTarifasPorUC` so aceita RASCUNHO, o que fixa a sequencia em TRES
// passos e nao dois:  compor  ->  `npm run tarifas`  ->  emitir.
//
// O QUE ESTA CONTAGEM NAO FAZ, e a regra 10 e o motivo: ela nao decide que zero
// esta errado. Uma competencia pode legitimamente nao levar tarifa da
// distribuidora - e essa e a pergunta (a) da questao, que tem dono e nao e a
// tela. Ela tambem nao trava o botao. O que ela faz e transformar um silencio em
// numero, que e o que a `prontidao` faz com as onze camadas: conta e NAO decide.
//
// A janela existe: rascunho volta atras de graca. Depois de emitida, corrigir
// obriga a CANCELAR - e cancelamento exige motivo e fica na trilha.

export type FaturaConferivel = {
  status: StatusFatura;
  unidade_consumidora_id: string;
  valor_tarifas_concessionaria_centavos: number | null;
};

export type ConferenciaDeTarifas = {
  /** O universo: os rascunhos da competencia, que sao o que "Emitir" alcanca. */
  rascunhos: number;
  comTarifa: number;
  semTarifa: number;
  /** As UCs sem tarifa, nomeadas. Contar sozinho manda procurar; nomear diz onde. */
  ucsSemTarifa: string[];
};

/**
 * Quantos rascunhos sairiam cobrando SO o credito.
 *
 * A INVARIANTE E A SOMA - `comTarifa + semTarifa === rascunhos`, sempre -, pelo
 * mesmo motivo do `lote-de-documentos.ts`: uma contagem que perde item em
 * silencio e pior que contagem nenhuma, porque parece completa.
 *
 * `null` conta como AUSENTE e nao como zero. A coluna e `NOT NULL` com default 0
 * no banco, entao `null` so chega aqui por leitura parcial - e tratar leitura
 * parcial como "tarifa zero conferida" e exatamente a mentira que esta funcao
 * existe para nao contar.
 */
export function conferirTarifas(
  lista: readonly FaturaConferivel[],
  numeroDaUc: (id: string) => string | null | undefined,
): ConferenciaDeTarifas {
  const rascunhos = lista.filter((f) => podeEmitirFatura(f.status));
  const sem = rascunhos.filter((f) => !f.valor_tarifas_concessionaria_centavos);
  return {
    rascunhos: rascunhos.length,
    comTarifa: rascunhos.length - sem.length,
    semTarifa: sem.length,
    ucsSemTarifa: sem.map((f) => numeroDaUc(f.unidade_consumidora_id) ?? f.unidade_consumidora_id),
  };
}

/** Tom da marca de status, para a tela nao decidir cor por `if` espalhado. */
export function tomDoStatusDaFatura(s: StatusFatura): 'ok' | 'pendente' | 'nao_medido' {
  if (s === 'paga') return 'ok';
  if (s === 'vencida' || s === 'cancelada') return 'pendente';
  return 'nao_medido';
}

// ------------------------------------------------- o layout do documento na tela
//
// A decisao 2 da `Q-DOCFATURA-01` foi layout CONFIGURAVEL por tenant. A parte
// perigosa - campo que nao existe - morreu no enum do banco. O que sobra na tela
// e reordenar, renomear e esconder, e o `mover` abaixo esta aqui em vez de dentro
// do componente pelo motivo de sempre: o runner do `web/` nao le JSX, e um
// off-by-one em reordenacao nao quebra nada visivelmente - so troca a ordem dos
// campos numa fatura que alguem ja imprimiu.

export type CampoConfigurado = {
  campo: string;
  rotulo: string;
  visivel: boolean;
};

/**
 * Move o item de `i` para `i + passo`, devolvendo uma lista NOVA.
 *
 * Fora dos limites, devolve a mesma ordem - e nao um array com `undefined`
 * dentro, que e o que o `splice` ingenuo produz e que a tela renderizaria como
 * linha em branco.
 */
export function mover<T>(lista: readonly T[], i: number, passo: number): T[] {
  const destino = i + passo;
  if (i < 0 || i >= lista.length || destino < 0 || destino >= lista.length) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(i, 1);
  copia.splice(destino, 0, item);
  return copia;
}

/**
 * O que vai para `PUT /cobranca/campos`.
 *
 * A `ordem` sai da POSICAO na lista, e nao de um campo que a pessoa digita:
 * numero digitado a mao empata, e empate e desempatado pelo nome do campo no
 * servidor - ou seja, a tela mostraria uma ordem e o documento sairia com outra.
 */
export function paraEnvio(lista: readonly CampoConfigurado[]) {
  return lista.map((c, i) => ({
    campo: c.campo,
    rotulo: c.rotulo.trim() || null,
    ordem: i,
    visivel: c.visivel,
  }));
}
