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
  const bruta = String(linha ?? '').replace(/\s+/g, ' ').trim();
  if (!bruta) return { ...VAZIO };

  const cep = acharCep(bruta);
  const uf = acharUf(bruta);

  /* O CEP e a UF saem da linha ANTES do corte: deixados, virariam um pedaço a
   * mais e empurrariam o município para a posição do bairro. */
  let resto = bruta;
  if (cep) resto = resto.replace(/\b\d{5}[.\s-]?\d{3}\b/, ' ');
  resto = resto.replace(/\bCEP\b[:\s]*/i, ' ');
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

  const { logradouro, numero } = separarNumero(cabeca);
  const sobra = pedacos.slice(daCabeca);

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
    endereco_cep: cep,
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
