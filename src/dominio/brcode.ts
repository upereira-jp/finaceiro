// BR CODE - o "Pix copia e cola" e o conteudo do QR estatico.
//
// De onde ele vem: a decisao 5 da `Q-DOCFATURA-01`, em 30/07. Enquanto nao houver
// certificado A1, o documento sai sem faixa de boleto e com um QR Pix ESTATICO,
// gerado por nos. Fora isto, quem produz o Pix e a Sicoob, junto com o boleto.
//
// ------------------------------------------------------------------------
// POR QUE ESTE MODULO E PURO, E POR QUE ISSO NAO E PREFERENCIA.
//
// Uma string de BR Code errada tem dois modos de falha, e eles sao muito
// diferentes entre si:
//
//   - CRC errado ou TLV malformado: o aplicativo do banco RECUSA. Barulhento, o
//     cliente reclama no mesmo dia, ninguem perde dinheiro.
//   - chave ou valor errados, com CRC certo: o aplicativo ACEITA. O cliente paga.
//     O dinheiro vai para outro lugar, ou vai o valor errado, e o sistema nao tem
//     como saber - o Pix estatico nao tem `txid` por fatura, entao a conciliacao
//     e manual (`Q-DOCFATURA-01`, decisao 5).
//
// O segundo e silencioso e e sobre dinheiro de terceiro. Por isso o BR Code nao
// e montado dentro de um componente nem dentro de um repositorio: e funcao pura,
// com suite propria, e o valor entra em CENTAVOS INTEIROS - a conversao para os
// "0.00" que o padrao exige e feita por TEXTO, sem divisao e sem float (regra 1).
//
// ------------------------------------------------------------------------
// O QUE O PADRAO PEDE (EMV MPM, Manual de Padroes do BACEN):
//
// O payload e uma sequencia de campos `IITTvalor`, onde II e o id de dois digitos
// e TT o tamanho de dois digitos. Campos aninhados repetem a forma dentro do
// valor. O ultimo campo e sempre `6304` seguido do CRC16 em hex maiusculo, e o
// CRC e calculado SOBRE a string inteira ja incluindo os literais `6304`.
//
// CRC16/CCITT-FALSE: polinomio 0x1021, inicial 0xFFFF, sem reflexao, sem XOR
// final. Ele NAO e o CRC16 mais comum das bibliotecas - trocar de variante da um
// codigo que so falha no celular do cliente.

/** Dinheiro, sempre inteiro, sempre centavos - igual ao resto do sistema. */
export type Centavos = number;

export class BrCodeInvalido extends Error {
  constructor(m: string) { super(`BR Code: ${m}`); this.name = 'BrCodeInvalido'; }
}

/**
 * `1234` -> `"12.34"`. Por TEXTO, e o padrao exige ponto como separador.
 *
 * Nao ha `c / 100` aqui pelo mesmo motivo do `web/src/dinheiro.ts`: em ponto
 * flutuante `815 / 100 * 100` nao volta 815, e o valor daqui vai numa cobranca.
 */
export function valorParaBrCode(centavos: Centavos): string {
  if (!Number.isSafeInteger(centavos)) throw new BrCodeInvalido(`valor ${centavos} nao e inteiro seguro`);
  if (centavos < 0) throw new BrCodeInvalido('valor negativo');
  const s = String(centavos).padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** CRC16/CCITT-FALSE, como o Manual de Padroes do BACEN exige. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  // `charCodeAt` basta porque tudo que chega aqui ja passou por `apenasAscii`:
  // acentuacao viraria dois bytes em UTF-8 e o CRC sairia de um byte que o
  // celular nao ve.
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Um campo `IITTvalor`.
 *
 * O tamanho e de DOIS digitos e nao ha campo de 100+ caracteres no que montamos:
 * quem estourar isso levanta, em vez de gerar um payload que o leitor corta no
 * meio e interpreta como outro campo.
 */
export function campo(id: string, valor: string): string {
  if (!/^\d{2}$/.test(id)) throw new BrCodeInvalido(`id "${id}" nao tem dois digitos`);
  if (valor.length > 99) throw new BrCodeInvalido(`campo ${id} tem ${valor.length} caracteres, o maximo e 99`);
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/**
 * Acentuacao fora, maiusculas dentro, e o corte no tamanho do padrao.
 *
 * Nome do recebedor aceita 25 e cidade 15 (campos 59 e 60). O banco ja recusa
 * acima disso (`identidade_de_cobranca`), mas cortar aqui tambem importa: um
 * payload de 26 caracteres no campo 59 e recusado pelo aplicativo, e o sintoma
 * aparece no celular de quem ia pagar.
 */
export function apenasAscii(texto: string, maximo: number): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // "João" -> "Joao"
    .replace(/[^\x20-\x7e]/g, '')
    .trim().toUpperCase().slice(0, maximo);
}

export type PixEstatico = {
  /** A chave Pix do recebedor - CPF/CNPJ so digitos, e-mail, telefone ou aleatoria. */
  chave: string;
  /** Nome do recebedor. Cortado em 25 caracteres ASCII. */
  recebedorNome: string;
  /** Cidade do recebedor. Cortada em 15. */
  recebedorCidade: string;
  /**
   * Valor em centavos, ou `null` para QR sem valor (o pagador digita).
   *
   * COM valor e o que o documento usa: o cliente nao deve ter de digitar o total
   * de uma fatura de energia. Sem valor existe porque um QR de mostruario e caso
   * legitimo, e omitir o campo 54 e diferente de manda-lo em zero.
   */
  valorCentavos: Centavos | null;
  /**
   * Identificador da transacao, campo 62-05. Ate 25 caracteres alfanumericos.
   *
   * `***` e o valor que o padrao define como "sem identificador", e e o default
   * DELIBERADO aqui: Pix estatico nao carrega `txid` por fatura, e por isso a
   * conciliacao e manual. Passar um `txid` proprio nao o torna conciliavel
   * automaticamente - o extrato nao o devolve num Pix estatico.
   */
  txid?: string;
};

/**
 * Monta o BR Code estatico. E a unica funcao que o resto do sistema chama.
 *
 * A ORDEM DOS CAMPOS NAO E LIVRE: o padrao pede id crescente, e alguns
 * aplicativos recusam fora de ordem. Ela esta fixa aqui e o teste a prende.
 */
export function pixEstatico(p: PixEstatico): string {
  const chave = p.chave.trim();
  if (!chave) throw new BrCodeInvalido('chave vazia');
  if (chave.length > 77) throw new BrCodeInvalido(`chave com ${chave.length} caracteres, o maximo e 77`);

  const nome = apenasAscii(p.recebedorNome, 25);
  const cidade = apenasAscii(p.recebedorCidade, 15);
  if (!nome) throw new BrCodeInvalido('nome do recebedor vazio depois de normalizar');
  if (!cidade) throw new BrCodeInvalido('cidade do recebedor vazia depois de normalizar');

  const txid = apenasAscii(p.txid ?? '***', 25).replace(/[^A-Z0-9*]/g, '') || '***';

  const merchant =
    campo('00', 'br.gov.bcb.pix') +   // GUI, obrigatorio e sempre este
    campo('01', chave);

  const partes = [
    campo('00', '01'),               // versao do payload
    // 010211 = estatico (reutilizavel). 010212 seria de uso unico, e um QR de uso
    // unico num documento que a pessoa guarda e pior que nao ter QR.
    campo('01', '11'),
    campo('26', merchant),
    campo('52', '0000'),             // categoria do comerciante: nao informada
    campo('53', '986'),              // BRL
    ...(p.valorCentavos != null ? [campo('54', valorParaBrCode(p.valorCentavos))] : []),
    campo('58', 'BR'),
    campo('59', nome),
    campo('60', cidade),
    campo('62', campo('05', txid)),
  ];

  // O CRC entra sobre a string JA COM os literais `6304`. Calcular antes de
  // acrescenta-los da um codigo que o aplicativo recusa - e e o erro classico
  // desta implementacao.
  const semCrc = `${partes.join('')}6304`;
  return `${semCrc}${crc16(semCrc)}`;
}

/**
 * Confere um BR Code recebido de fora: o CRC dos ultimos 4 caracteres bate?
 *
 * Existe para o teste poder verificar a propria saida sem repetir a conta, e para
 * o dia em que um BR Code vier da Sicoob e alguem quiser conferir antes de
 * imprimir. Nao valida semantica - so integridade.
 */
export function crcConfere(brcode: string): boolean {
  if (brcode.length < 8) return false;
  const corpo = brcode.slice(0, -4);
  if (!corpo.endsWith('6304')) return false;
  return crc16(corpo) === brcode.slice(-4).toUpperCase();
}

/**
 * O BR Code COLADO DE FORA, normalizado - e este e um conserto medido, nao uma
 * conveniencia.
 *
 * ============================================================================
 * O DEFEITO, ACHADO EM 17/08/2026 PELO TESTE `B7b` DA IMPORTACAO DE BOLETO
 *
 * Tres lugares deste sistema faziam a MESMA coisa com um payload Pix vindo de
 * fora: `.replace(/\s+/g, '')` — `concessionaria/leitor-visao.ts`,
 * `dominio/folha-unificada.ts` e a primeira versao de `boleto-importado.ts`. A
 * intencao era limpar a quebra de linha de quem copia de um PDF, e ela e
 * legitima. O efeito, nao:
 *
 *     5908G3 SOLAR      ->    5908G3SOLAR
 *     ^^  ^^                  o campo diz 08 caracteres e passou a ter 7
 *
 * **O nome do beneficiario (campo 59) e a cidade (60) tem espaco de verdade
 * dentro**, e quase todo nome de empresa tem. Tirar esses espacos quebra o
 * comprimento declarado do campo E o CRC, que cobre o payload inteiro. O
 * resultado nao e erro: e um QR impresso na fatura que o aplicativo do banco NAO
 * LE. Medido com `pixEstatico({recebedorNome: 'G3 SOLAR'})`, que produz um codigo
 * integro e virava um codigo invalido ao passar pela limpeza.
 *
 * ============================================================================
 * A REGRA: O CRC DECIDE, E NAO UM PALPITE SOBRE ESPACO
 *
 * Nao ha como distinguir por inspecao o espaco que pertence ao nome do espaco que
 * a colagem inseriu. Entao nao se tenta: candidata-se, e QUEM DECIDE E O CRC - os
 * quatro digitos do fim sao exatamente a pergunta "este texto esta inteiro?". A
 * escada vai da hipotese mais conservadora para a mais agressiva:
 *
 *   1. como veio, so aparado       o payload correto, colado inteiro
 *   2. sem quebra de linha e TAB   `\n` e `\t` NUNCA sao parte de um BR Code, e o
 *                                  espaco do nome do beneficiario sobrevive
 *   3. sem a quebra E o branco     a mesma coisa, quando a colagem indentou a
 *      GRUDADO nela                linha seguinte
 *   4. a quebra vira UM espaco     o caso inverso: o payload ja tinha um espaco
 *                                  ali e o PDF quebrou EM CIMA dele
 *   5. sem espaco nenhum           o legado - payload sem espaco legitimo que
 *                                  recebeu espacos na colagem
 *
 * A ORDEM IMPORTA, e os degraus do meio sao o que faltava na primeira versao
 * deste conserto: um payload com nome composto E quebra de linha nao passa no 1
 * (tem `\n`) nem no 5 (perde o espaco do nome). Sem eles, o caso mais frequente
 * da operacao — copiar do PDF do boleto — continuaria sendo recusado.
 *
 * NAO HA RISCO DE ACEITAR LIXO NO CAMINHO. Os cinco candidatos sao transformacoes
 * deterministicas do MESMO texto, e o CRC de 16 bits e calculado sobre cada um: o
 * que fecha e o payload que o banco emitiu, nao uma variante plausivel dele.
 *
 * Quando NENHUM dos cinco fecha, devolve o texto so aparado. Devolver uma das
 * variantes seria entregar adiante um sexto texto, que nao e nem o que veio nem
 * um payload valido - e quem chama confere o CRC de qualquer forma.
 */
export function normalizarBrCode(bruto: string | null | undefined): string {
  const aparado = String(bruto ?? '').trim();
  if (!aparado) return '';
  const candidatos = [
    aparado,
    aparado.replace(/[\r\n\t]+/g, ''),
    aparado.replace(/\s*[\r\n\t]+\s*/g, ''),
    aparado.replace(/\s*[\r\n\t]+\s*/g, ' '),
    aparado.replace(/\s+/g, ''),
  ];
  return candidatos.find(crcConfere) ?? aparado;
}

/**
 * O `txid` de dentro de um BR Code, ou `null`. Existe porque a resposta da
 * Cobranca v3 traz `qrCode` (o copia-e-cola) e NAO traz campo de txid, e a
 * `PortaDeCobranca` tem `pixTxid` - o `SICOOB-contrato-medido` 3.3 deixou a
 * escolha para quem escrevesse o adaptador: "ou ele sai de dentro do BR Code,
 * ou fica nulo".
 *
 * SAI DE DENTRO, E COM FREQUENCIA E NULO - de proposito. O txid mora no campo
 * 62, subcampo 05 (Reference Label). Numa cobranca DINAMICA, que e o caso do
 * boleto hibrido, esse subcampo costuma vir `***`, que na especificacao do BACEN
 * significa "nao se aplica": o txid de verdade so existe do lado da API Pix,
 * atras da URL do campo 26. Medido no proprio payload de exemplo do sandbox em
 * 27/08/2026: `62070503***`.
 *
 * ENTAO POR QUE NAO TIRAR O UUID DA URL DO CAMPO 26? Porque aquele identificador
 * e a LOCALIZACAO DO PAYLOAD, e nao o txid - sao conceitos diferentes na
 * especificacao, e coincidem em alguns PSPs e nao em outros. Gravar um pelo
 * outro poria em `boleto.pix_txid` um valor que nao casa com nada na
 * conciliacao, e um identificador errado e pior que um campo vazio: o vazio
 * ninguem tenta usar.
 */
export function txidDoBrCode(bruto: string | null | undefined): string | null {
  const t = normalizarBrCode(bruto);
  if (!t) return null;

  const ler = (texto: string, alvo: string): string | null => {
    let i = 0;
    while (i + 4 <= texto.length) {
      const id = texto.slice(i, i + 2);
      const n = Number(texto.slice(i + 2, i + 4));
      // Tamanho nao numerico = payload quebrado. Para em vez de escorregar: um
      // laco que "tenta continuar" num TLV corrompido le lixo como se fosse dado.
      if (!Number.isInteger(n) || n < 0) return null;
      const valor = texto.slice(i + 4, i + 4 + n);
      if (valor.length < n) return null;
      if (id === alvo) return valor;
      i += 4 + n;
    }
    return null;
  };

  const adicional = ler(t, '62');
  if (!adicional) return null;
  const txid = ler(adicional, '05');
  if (!txid || txid === '***') return null;
  return txid;
}
