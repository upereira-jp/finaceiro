// O ENDEREÇO QUE VEIO NA CONTA, virando os sete campos do boleto.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE
//
// A conta da distribuidora imprime o endereço, e o leitor de visão **já o
// arranca** — `endereco` é campo obrigatório do que ele extrai do PDF, e a conta
// lida o guarda. Medido em 10/09/2026: **nada na interface lia essa coluna.**
//
// Ao lado disso, 10 das 28 unidades faturáveis estão com o endereço do pagador
// **completamente vazio** — não pela metade: nada —, e sem os cinco campos que a
// Sicoob exige o boleto é recusado com 422. Ou seja: a resposta chegava junto da
// conta lida, ia para uma coluna que ninguém abria, e alguém digitaria setenta
// campos à mão.
//
// ============================================================================
// ⚠️ ESTA REGRA NUNCA FOI EXERCIDA CONTRA UMA CONTA DE VERDADE
//
// E isso está escrito aqui porque muda como ela deve se comportar. Em 10/09/2026
// a produção tinha **0 contas lidas gravadas**, então a coluna está vazia em
// todas as linhas e **ninguém sabe qual string o leitor produz** numa conta real
// da Equatorial. O único endereço de exemplo do repositório é de um teste, e ele
// **não tem CEP** — que é justamente um dos cinco que a Sicoob exige.
//
// Duas consequências, e as duas são desenho e não cautela vazia:
//
//   1. **NA DÚVIDA, VAZIO.** Nenhum campo é preenchido por semelhança. Um bairro
//      errado num boleto é pior que um bairro em branco: o branco alguém vê e
//      preenche, e o errado vai impresso na cobrança do cliente;
//   2. **ELA NÃO GRAVA NADA.** O que sai daqui preenche um FORMULÁRIO, que a
//      pessoa revê e manda gravar. Se o formato for outro, o custo é um botão
//      que não ajudou — e a linha crua continua na tela para ser lida com o olho.
//
// Quando a primeira conta real for lida, o jeito de fechar isto é o mesmo de
// sempre nesta casa: pegar a string que veio e medir contra ela.
//
// ============================================================================
// E POR QUE O ENDEREÇO DA CONTA NÃO É AUTOMATICAMENTE O DO BOLETO
//
// O impresso na conta é o da **instalação**; o do boleto é o do **pagador**. Nos
// clientes desta carteira normalmente coincidem — e "normalmente" não é critério
// para escrever sozinho no que vai impresso numa cobrança. Por isso a decisão
// final é de quem olha, e a tela diz de onde o dado veio e de qual mês.
//
// ============================================================================
// 28/09/2026 — A PRIMEIRA MEDIÇÃO CONTRA CONTA DE VERDADE, e ela reprovou tudo
//
// O leitor do CRM leu as contas anexadas aos cards, e o bloco de endereço de 18
// contas da Equatorial em PDF foi passado por esta função. **Errou nas 18**: a
// conta de Goiás é escrita por QUADRA e LOTE, e o primeiro pedaço depois da rua
// é `Q. 91`. A leitura posicional o punha no BAIRRO, mandava `GOIANIA BRASIL`
// (ou `CASA 1 VILA ALVORADA GOIANIA BRASIL`) para o município, perdia o `S/N` e
// partia «RUA 1044» em logradouro «RUA» e número «1044».
//
// O bloco da Equatorial tem forma fixa, e agora é reconhecido por ela antes de
// qualquer leitura genérica (`separarBlocoDaEquatorial`). E duas conferências
// passaram a valer nos dois caminhos: um pedaço que é quadra, lote ou
// complemento nunca vira bairro nem município, e um CEP de outro estado sai em
// branco. A mesma medição achou uma conta que imprime o CEP de Rondônia para
// uma cidade de Goiás.

import { cepDeOutraUf } from '../../src/dominio/cep.ts';

/** As unidades federativas, para a UF só ser reconhecida quando for uma. */
const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export type CamposDoEndereco = {
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_municipio: string;
  endereco_uf: string;
  endereco_cep: string;
};

export const VAZIO: CamposDoEndereco = {
  endereco_logradouro: '', endereco_numero: '', endereco_complemento: '',
  endereco_bairro: '', endereco_municipio: '', endereco_uf: '', endereco_cep: '',
};

/** As palavras que começam um logradouro. Servem para RECONHECER, nunca para
 *  recusar: um logradouro que não comece por nenhuma delas continua sendo o
 *  primeiro pedaço da linha. */
const INICIO_DE_LOGRADOURO =
  /^(RUA|R\.|AV|AVENIDA|AV\.|TRAVESSA|TV|ALAMEDA|AL\.|PRACA|PRAÇA|RODOVIA|ROD\.|ESTRADA|EST\.|QUADRA|QD|Q|SETOR|CONJUNTO|CJ|LOTEAMENTO|VILA|LARGO|VIELA|PASSAGEM)\b/i;

/** `74000-000`, `74000000` e `CEP 74.000-000` são o mesmo CEP. Sai sempre no
 *  formato com hífen, que é o que a Sicoob recebe. */
export function acharCep(linha: string): string {
  /* O PONTO SAI ANTES DA BUSCA, e nao e detalhe: o CEP pontuado e `74.210-030`,
   * ou seja **2 + 3 - 3** e nao 5 + 3. Uma expressao que espere cinco digitos
   * seguidos nao acha esse — e foi assim que ela falhou na primeira execucao
   * desta suite. Tirar o ponto de uma COPIA resolve os dois formatos com uma
   * regra so, sem tocar no resto da linha. */
  const m = /\b(\d{5})[\s-]?(\d{3})\b/.exec(linha.replace(/\./g, ''));
  return m ? `${m[1]}-${m[2]}` : '';
}

/**
 * A UF, e ela só é aceita **isolada** — nunca como pedaço de palavra.
 *
 * O cuidado não é teórico: `GO` aparece dentro de "GOIANIA" e `MA` dentro de
 * "MARANHAO". Sem a fronteira de palavra, quase toda linha de Goiás produziria
 * uma UF por acidente, e ela iria impressa no boleto.
 */
export function acharUf(linha: string): string {
  const pedacos = linha.toUpperCase().split(/[^A-ZÀ-Ú]+/).filter(Boolean);
  for (let i = pedacos.length - 1; i >= 0; i--) {
    if ((UFS as readonly string[]).includes(pedacos[i]!)) return pedacos[i]!;
  }
  return '';
}

/** `nº 930`, `n° 930`, `, 930` ou `930` no fim do logradouro. `S/N` conta como
 *  número informado — é o que se digita quando não há, e a própria tela diz. */
function separarNumero(pedaco: string): { logradouro: string; numero: string } {
  /* ⚠️ O `S/N` E CONFERIDO ANTES DE QUALQUER LIMPEZA, e a ordem foi paga na
   * suite: o "N" dele vem depois de uma barra, que e fronteira de palavra —
   * entao a regra que tira o "nº" o engolia, e o resultado era logradouro
   * "RUA DAS FLORES, S/" com numero vazio. Duas coisas erradas de uma vez. */
  const sn = /\bS\/?N\b/i.exec(pedaco);
  if (sn) return { logradouro: limpo(pedaco.replace(/[,\s]*\bS\/?N\b/i, '')), numero: 'S/N' };

  /* E `n` SOZINHO NAO E MARCADOR DE NUMERO: exige `nº`, `n°`, `n.` ou a palavra
   * inteira. Aceitar o `n` nu comeria a letra de qualquer logradouro que a
   * tivesse solta. */
  const semN = pedaco.replace(/\b(n[º°]|n\.|numero|num\.)\s*/i, ' ');

  const m = /^(.*?)[\s,]+(\d{1,6}[A-Z]?)$/i.exec(semN.trim());
  if (!m) return { logradouro: semN.trim().replace(/[,\s]+$/, ''), numero: '' };
  return { logradouro: m[1]!.trim().replace(/[,\s]+$/, ''), numero: m[2]! };
}

const limpo = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/^[\s,;/-]+|[\s,;/-]+$/g, '').trim();

/**
 * O PEDAÇO QUE É DO LOGRADOURO, e por isso nunca é bairro nem município.
 *
 * Quadra (`Q. 91`, `QD 4`), lote (`L. 27/28`, `LT 3`), o número (`S/N`,
 * `N. 315`, ou só dígitos) e o que é complemento (`CASA 1`, `APART - 402`, `BLOCO C`,
 * `SALA 4`). E também o pedaço que COMEÇA com traço solto (`- CASA 1`,
 * `- - 16`): na conta da Equatorial é o que sobra de um campo vazio, e no meio de
 * uma linha juntada por espaço é o sinal de que o complemento e o bairro colaram.
 */
function pareceDoLogradouro(pedaco: string): boolean {
  const p = pedaco.trim();
  return /^-/.test(p)
    || /^\d+[A-Z]?$/i.test(p)
    || /^(Q|QD|QUADRA|L|LT|LOTE)\b\.?\s*[\w/-]/i.test(p)
    || /^S\/?N\b/i.test(p)
    || /^N[º°.]?\s*\d/i.test(p)
    || /^(CASA|APART|APTO|AP|APARTAMENTO|BLOCO|BL|SALA|LOJA|COND|CONDOMINIO|ED|EDIFICIO|UNIDADE|FUNDOS|ANDAR)\b/i.test(p);
}

/**
 * O BLOCO DA EQUATORIAL, reconhecido pela forma. Medido em 28/09/2026 em 18
 * contas reais (o endereço abaixo é inventado; a forma, não):
 *
 *   RUA 1010, Q. 12, L. 3/4, S/N, APART - 201, COND - ED EXEMPLO, - - 16
 *   SETOR PEDRO LUDOVICO
 *   CEP: 74825110 GOIANIA GO BRASIL
 *
 * Três linhas: a do logradouro (rua, quadra, lote, número e complemento, por
 * vírgula), a do BAIRRO sozinho, e o rabo `CEP: <oito dígitos> <MUNICÍPIO> <UF>
 * BRASIL`. O rabo é o que identifica a forma, e dele saem sem ambiguidade CEP,
 * município e UF. A primeira linha quebra em duas quando é longa.
 *
 * O BAIRRO SÓ SAI QUANDO A FRONTEIRA DELE EXISTE: uma quebra de linha ou uma
 * vírgula antes dele. Se o leitor juntou as linhas com espaço, `- CASA 1 VILA
 * ALVORADA` não diz onde termina o complemento — e aí o bairro fica vazio.
 *
 * O COMPLEMENTO AQUI É PREENCHIDO, ao contrário da leitura genérica, porque não é
 * adivinhado: é tudo o que a primeira linha tem além da rua e do número. E em
 * Goiás ele carrega a quadra e o lote, que numa rua sem número SÃO o endereço.
 *
 * `null` quando a linha não tem o rabo: aí quem decide é a leitura genérica.
 */
export function separarBlocoDaEquatorial(linha: string | null | undefined): CamposDoEndereco | null {
  const texto = String(linha ?? '').replace(/\r/g, '').trim();
  /* `BRASIL` é opcional: o leitor de visão pode deixar o país de fora, e o que
   * identifica a forma é o CEP ANTES da cidade — na leitura genérica ele vem
   * depois (`GOIANIA - GO, 74210-030`). */
  const rabo = /\bCEP:?\s*(\d{5})-?(\d{3})\s+([^\n,]+?)\s+([A-Z]{2})(?:\s+BRASIL)?\s*$/i.exec(texto);
  if (!rabo) return null;
  const uf = rabo[4]!.toUpperCase();
  if (!(UFS as readonly string[]).includes(uf)) return null;
  const municipio = limpo(rabo[3]!);
  const cep = `${rabo[1]}-${rabo[2]}`;

  const antes = texto.slice(0, rabo.index);
  let cabeca: string;
  let bairro = '';
  const linhas = antes.split('\n').map(limpo).filter(Boolean);
  if (linhas.length >= 2) {
    /* Com quebra de linha, a última antes do CEP é a do bairro — e a primeira
     * linha, se era longa, veio partida nas de cima. */
    const ultima = linhas[linhas.length - 1]!;
    if (!pareceDoLogradouro(ultima) && !ultima.includes(',')) {
      bairro = ultima;
      cabeca = linhas.slice(0, -1).join(' ');
    } else {
      cabeca = linhas.join(' ');
    }
  } else {
    const pedacos = (linhas[0] ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    const ultimo = pedacos[pedacos.length - 1] ?? '';
    const semNumero = /^(S\/?N|N[º°.]?\s*\d+[A-Z]?)\s+(.+)$/i.exec(ultimo);
    if (pedacos.length >= 2 && !pareceDoLogradouro(ultimo)) {
      bairro = limpo(ultimo);
      pedacos.pop();
    } else if (pedacos.length >= 2 && semNumero && !pareceDoLogradouro(semNumero[2]!)) {
      /* `..., S/N CONJUNTO ANHANGUERA`: a linha foi juntada por espaço logo
       * depois do número, e o número marca a fronteira. */
      bairro = limpo(semNumero[2]!);
      pedacos[pedacos.length - 1] = semNumero[1]!;
    }
    cabeca = pedacos.join(', ');
  }

  const pedacos = cabeca.split(',').map((p) => p.trim()).filter(Boolean);
  const logradouro = limpo(pedacos.shift() ?? '');
  let numero = '';
  const complemento: string[] = [];
  for (const p of pedacos) {
    const num = /^N[º°.]?\s*(\d+[A-Z]?)$/i.exec(p);
    if (!numero && /^S\/?N$/i.test(p)) { numero = 'S/N'; continue; }
    if (!numero && num) { numero = num[1]!; continue; }
    /* O traço solto é o que a Equatorial imprime entre um rótulo e um valor
     * vazio (`APART - 402`, `- - 16`): sai, e o que sobra fica como veio. */
    const semTraco = p.replace(/(^|\s)-(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    if (semTraco) complemento.push(semTraco);
  }

  return {
    endereco_logradouro: logradouro,
    endereco_numero: numero,
    endereco_complemento: complemento.join(', '),
    endereco_bairro: bairro,
    endereco_municipio: municipio,
    endereco_uf: uf,
    endereco_cep: cepDeOutraUf(cep, uf) ? '' : cep,
  };
}

/**
 * O CEP IMPRESSO NA CONTA QUE É DE OUTRO ESTADO, dito em uma frase para a tela.
 * `null` quando não há o que dizer. Medido em 28/09/2026: uma conta da
 * Equatorial de Indiara (GO) imprime o CEP 76995-000, que é de Rondônia.
 */
export function avisoDoCepDaConta(linha: string | null | undefined): string | null {
  const bruta = String(linha ?? '');
  const cep = acharCep(bruta);
  const uf = acharUf(bruta);
  const outra = cepDeOutraUf(cep, uf);
  return outra
    ? `O CEP impresso na conta, ${cep}, é de ${outra}, e a cidade é de ${uf}. Ele ficou em branco: confira o da rua nos Correios antes de gravar.`
    : null;
}

/**
 * A LINHA DA CONTA VIRANDO SETE CAMPOS — **melhor esforço, e sem chute**.
 *
 * O formato brasileiro típico é `LOGRADOURO, NÚMERO, BAIRRO, MUNICÍPIO - UF, CEP`,
 * com o separador variando entre vírgula, hífen e travessão. A leitura é
 * posicional depois de arrancar o que é reconhecível sozinho (CEP e UF), porque
 * esses dois são os únicos que a forma identifica sem ambiguidade.
 *
 * ⚠️ **O que sobra em dúvida sai VAZIO.** Uma linha com dois pedaços não diz se
 * o segundo é bairro ou município, e adivinhar poria o bairro no lugar do
 * município num boleto de verdade. Duas regras decidem:
 *
 *   - com **três ou mais** pedaços depois do logradouro, o ÚLTIMO é o município
 *     (é o que vem colado à UF) e o PRIMEIRO é o bairro;
 *   - com **dois**, só o bairro é preenchido — o município fica para a pessoa,
 *     que tem a conta na frente.
 */
export function separarEndereco(linha: string | null | undefined): CamposDoEndereco {
  /* A forma conhecida primeiro: a conta da Equatorial é a de toda a carteira
   * hoje, e a leitura genérica errava nela em 18 de 18 (28/09/2026). */
  const daEquatorial = separarBlocoDaEquatorial(linha);
  if (daEquatorial) return daEquatorial;

  const bruta = String(linha ?? '').replace(/\s+/g, ' ').trim();
  if (!bruta) return { ...VAZIO };

  const cep = acharCep(bruta);
  const uf = acharUf(bruta);

  /* O CEP e a UF saem da linha ANTES do corte: deixados, virariam um pedaço a
   * mais e empurrariam o município para a posição do bairro. */
  let resto = bruta;
  if (cep) resto = resto.replace(/\b\d{5}[.\s-]?\d{3}\b/, ' ');
  resto = resto.replace(/\bCEP\b[:\s]*/i, ' ');
  /* O país no fim ("GOIANIA GO BRASIL") não é município nem bairro. */
  resto = resto.replace(/[\s,;-]*\bBRASIL\s*$/i, ' ');
  if (uf) resto = resto.replace(new RegExp(`(^|[^A-Za-zÀ-ú])${uf}([^A-Za-zÀ-ú]|$)`, 'i'), '$1 $2');

  /* ⚠️ A BARRA NAO ENTRA NOS SEPARADORES, e ela estava entrando: `GOIANIA/GO` a
   * pedia, mas `S/N` — que e o numero que a propria tela manda digitar quando
   * nao ha — era partido ao meio em "S" e "N", e o "N" virava bairro. Medido na
   * primeira execucao desta suite. O `GOIANIA/GO` continua resolvido porque a UF
   * sai da linha antes do corte, e `limpo` tira a barra que sobra na ponta. */
  const pedacos = resto.split(/\s*[,;]\s*|\s+[-–—]\s+/).map(limpo).filter(Boolean);
  if (pedacos.length === 0) return { ...VAZIO, endereco_cep: cep, endereco_uf: uf };

  /* O logradouro pode ter vindo separado do número por vírgula (`RUA X, 930`),
   * e nesse caso o número é um pedaço próprio. Juntar os dois antes de separar
   * evita que `930` seja lido como bairro. */
  let cabeca = pedacos[0]!;
  let daCabeca = 1;
  const ehPedacoDeNumero = (p: string) => /^\d{1,6}[A-Za-z]?$/.test(p) || /^S\/?N$/i.test(p);
  if (pedacos[1] && ehPedacoDeNumero(pedacos[1]!)) { cabeca = `${cabeca}, ${pedacos[1]}`; daCabeca = 2; }

  const separado = separarNumero(cabeca);
  const logradouro = separado.logradouro;
  let numero = separado.numero;
  const depois = pedacos.slice(daCabeca);

  /* QUADRA, LOTE E COMPLEMENTO NUNCA SÃO BAIRRO NEM MUNICÍPIO (28/09/2026: a
   * conta de Goiás põe `Q. 91` logo depois da rua, e ele virava o bairro). Saem
   * da conta posicional antes dela — e o `S/N` que estava entre eles ainda
   * serve de número. */
  if (!numero) {
    const n = depois.find((p) => /^S\/?N$/i.test(p) || /^N[º°.]?\s*\d+[A-Z]?$/i.test(p));
    if (n) numero = /^S\/?N$/i.test(n) ? 'S/N' : n.replace(/^N[º°.]?\s*/i, '');
  }
  const sobra = depois.filter((p) => !pareceDoLogradouro(p));

  /* O COMPLEMENTO NAO E ADIVINHADO: ele e opcional para o boleto e nao conta
   * como pendencia, entao errar nele nao paga o risco de tirar um pedaco que
   * era o bairro. */
  let bairro = '';
  let municipio = '';
  if (sobra.length >= 2) { bairro = sobra[0]!; municipio = sobra[sobra.length - 1]!; }
  else if (sobra.length === 1) { bairro = sobra[0]!; }

  return {
    endereco_logradouro: INICIO_DE_LOGRADOURO.test(logradouro) || logradouro ? logradouro : '',
    endereco_numero: numero,
    endereco_complemento: '',
    endereco_bairro: bairro,
    endereco_municipio: municipio,
    endereco_uf: uf,
    /* O CEP de outro estado sai em branco: a tela diz por quê
     * (`avisoDoCepDaConta`), e o branco alguém preenche. */
    endereco_cep: cepDeOutraUf(cep, uf) ? '' : cep,
  };
}

/**
 * O QUE A PROPOSTA ACRESCENTA, e nunca o que ela SUBSTITUI.
 *
 * Só entra em campo que está vazio hoje. Quem digitou o bairro à mão e apertou o
 * botão não pode ver o que digitou desaparecer — e é o caso mais provável de
 * todos, porque quem abre a linha para preencher endereço costuma já ter
 * começado.
 */
export function completarVazios(
  atual: Readonly<Record<string, string>>,
  proposta: CamposDoEndereco,
): CamposDoEndereco {
  const saida = { ...VAZIO };
  for (const c of Object.keys(VAZIO) as Array<keyof CamposDoEndereco>) {
    const tem = String(atual[c] ?? '').trim();
    saida[c] = tem !== '' ? tem : proposta[c];
  }
  return saida;
}

/** Quantos dos cinco que a Sicoob exige a proposta consegue preencher. É o que a
 *  tela usa para dizer «preenche 4 dos 5 — falta o CEP» em vez de prometer que
 *  resolve tudo. */
export const EXIGIDOS_PELO_BOLETO = [
  'endereco_logradouro', 'endereco_bairro', 'endereco_municipio', 'endereco_uf', 'endereco_cep',
] as const;

export function faltamNaProposta(p: CamposDoEndereco): string[] {
  const ROTULO: Record<string, string> = {
    endereco_logradouro: 'logradouro', endereco_bairro: 'bairro',
    endereco_municipio: 'município', endereco_uf: 'UF', endereco_cep: 'CEP',
  };
  return EXIGIDOS_PELO_BOLETO.filter((c) => p[c].trim() === '').map((c) => ROTULO[c]!);
}
