// A FOLHA 1 DO MODELO G3. Funcao pura: entram os dados da fatura e o emissor,
// saem as faixas prontas para imprimir. Sem banco, sem rede, sem DOM.
//
// DE ONDE ISTO VEM. Da terceira volta da `Q-DOCFATURA-01`, em 12/08: o layout
// deixa de ser configuravel e passa a ser o modelo G3 FIXO. A referencia esta
// medida em `REFERENCIA-fatura-unificada-2026-08-13.md` §7, e este arquivo e a
// folha 1 dela - a folha da conta.
//
// ============================================================================
// POR QUE ELA NASCE AO LADO DA POSICIONADA, e nao no lugar dela
//
// `layout-visual.ts` compoe o documento em BLOCO POSICIONADO em milimetro, e
// continua vivo. Nao e indecisao: e a ordem do §13.4 do documento de referencia,
// e o motivo e que a folha G3 COMPLETA depende do leitor da Equatorial, que nao
// existe. Retirar a composicao antiga hoje deixaria o sistema sem documento
// nenhum - o editor e o unico documento que existe ate a virada.
//
// A redundancia e TEMPORARIA e esta datada. Some no passo 6 do §13.4.
//
// ============================================================================
// O QUE ESTA FOLHA NAO TEM, e a ausencia e deliberada
//
// A folha 1 da referencia tem sete faixas. Esta tem cinco. Faltam duas, e as
// duas dependem de dado que o sistema NAO tem:
//
//   os tres cartoes    "Seu consumo sem a G3" x "Seu desconto" x "Seu consumo
//                      com a G3" exigem TARIFA CHEIA e ENERGIA COMPENSADA. A
//                      tarifa cheia nao existe deste lado (`Q-DOCG3-02`,
//                      `Q-TARIFA-CRM-01`), e sem ela nao ha o que comparar
//   a quebra do        o detalhamento EXISTE e mostra o que o sistema fatura,
//   repasse            mas a linha "Tarifas da concessionaria" e UMA soma.
//                      Quebra-la em nao compensado, iluminacao, bandeira e
//                      encargos exige o leitor da distribuidora (`Q-DOCG3-11`)
//
// DESENHAR AS DUAS COM O QUE HA SERIA PIOR QUE OMITI-LAS. Um cartao de desconto
// calculado sobre uma tarifa inventada e um numero errado impresso no documento
// que prova a economia ao cliente - e o cliente confere. Uma linha "Demais
// encargos" derivada por subtracao absorve em silencio todo erro de leitura, que
// e exatamente o que o §5 do documento de referencia mostra a propria referencia
// fazendo. Ausencia e honesta; aproximacao nao e.
//
// ============================================================================
// REGRA 1 ATRAVESSA O ARQUIVO. Todo dinheiro entra em centavos inteiros e sai
// formatado por `emReais`. Nao ha um `Number()` sobre grandeza fisica, nao ha
// divisao e nao ha percentual - as duas faixas que precisariam deles sao
// justamente as que nao entraram.

import { emReais, type Centavos } from './centavos.ts';
import { dataBr, competenciaBr, type LinhaDoDocumento } from './layout-do-documento.ts';

/** Quem emite. Nulo em tudo enquanto o tenant nao cadastrou (migration 26). */
export type EmissorDaFatura = {
  razao_social: string | null;
  /** 14 digitos, sem mascara. */
  cnpj: string | null;
};

export type DadosDaFolha = {
  /** As linhas ja compostas e formatadas por `linhasDoDocumento`. */
  linhas: LinhaDoDocumento[];
  cliente_nome: string | null;
  cliente_documento: string | null;
  numero_uc: string | null;
  endereco: string | null;
  competencia: string;
  vencimento: string;
  valor_total_centavos: Centavos | null;
  numero_da_fatura: string;
};

/** Um par rotulo/valor da grade de metadados. */
export type MetaDaFolha = { rotulo: string; valor: string };

export type FaixaDeAviso = { titulo: string; corpo: string };

export type FolhaG3 = {
  cabecalho: {
    /** Fixo, e por isso esta aqui e nao no banco: e a assinatura do produto. */
    assinatura: string;
    emissor: string | null;
  };
  cliente: {
    nome: string;
    /** MASCARADO. Ver `mascararDocumento`. */
    documento: string;
    meta: MetaDaFolha[];
  };
  total: {
    rotulo: string;
    detalhe: string;
    valor: string;
    /** `true` quando o total e nulo - a tela nao pode imprimir "R$ 0,00". */
    ausente: boolean;
    vencimento: string;
    nota: string;
  };
  aviso: FaixaDeAviso;
  /**
   * A TABELA DE VALORES — o que compoe o total, linha a linha.
   *
   * NAO E a faixa "Repasses obrigatorios Equatorial" da referencia, e a diferenca
   * e de fonte e nao de gosto: aquela quebra o repasse em quatro parcelas vindas
   * do leitor da distribuidora, que nao existe aqui. Esta mostra a composicao que
   * o sistema REALMENTE fatura — credito injetado, tarifa, valor do credito,
   * tarifas da concessionaria, juros e multa, total.
   *
   * E ELA OBEDECE `campo_do_documento`. Ordem, rotulo e visibilidade continuam do
   * tenant: e por isso que a superficie de CONTEUDO fica quando a de POSICAO sair
   * — sao coisas diferentes, e so a segunda o modelo fixo substitui.
   */
  detalhamento: { titulo: string; linhas: LinhaDoDocumento[] };
  rodape: { emissor: string | null; paginacao: string };
  /** O que NAO entrou nesta folha, nomeado. Ver o cabecalho deste arquivo. */
  faixas_ausentes: Array<{ faixa: string; motivo: string; questao: string }>;
};

/** `66714022000121` -> `66.714.022/0001-21`. Sem mascara se nao tiver 14 digitos. */
export function cnpjFormatado(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * O EMISSOR NUMA LINHA, ou `null`.
 *
 * `null` e nao "-" de proposito, e e a mesma decisao que a faixa de pagamento
 * tomou em 12/08 sobre o beneficiario: e a este nome que o aviso anti-golpe
 * amarra (*"confira sempre se o beneficiario e ..."*), e um travessao no lugar
 * dele treina exatamente o comportamento que o aviso quer impedir. Quem nao
 * cadastrou nao ve a linha.
 */
export function linhaDoEmissor(e: EmissorDaFatura): string | null {
  if (!e.razao_social) return null;
  const cnpj = cnpjFormatado(e.cnpj);
  return cnpj ? `${e.razao_social} · CNPJ ${cnpj}` : e.razao_social;
}

/**
 * CPF/CNPJ MASCARADO - cinco primeiros caracteres, o resto vira `*`.
 *
 * E o que a referencia faz, e o motivo dela vale aqui inteiro: a fatura circula.
 * Vai por e-mail, fica na mesa, e o documento completo do cliente impresso nela
 * e dado que nao precisa estar la para a fatura cumprir a funcao dela.
 *
 * SO DIGITO VIRA `*`. Ponto, barra e hifen ficam - eles nao identificam ninguem
 * e sem eles o campo perde a forma de documento.
 */
export function mascararDocumento(doc: string | null): string {
  if (!doc) return '—';
  const s = String(doc);
  return s.slice(0, 5) + s.slice(5).replace(/\d/g, '*');
}

/**
 * Compoe a folha 1.
 *
 * `faixas_ausentes` NAO e log: viaja no retorno porque quem imprime - a nossa
 * tela e o CRM - precisa saber que a folha esta incompleta e por que. Uma folha
 * a que faltam duas faixas sem dizer nada parece uma folha pronta.
 */
export function folha1(d: DadosDaFolha, emissor: EmissorDaFatura): FolhaG3 {
  const linha = linhaDoEmissor(emissor);
  const ausente = d.valor_total_centavos == null;

  return {
    cabecalho: { assinatura: 'Energia Solar por Assinatura', emissor: linha },
    cliente: {
      nome: d.cliente_nome?.trim() || '—',
      documento: mascararDocumento(d.cliente_documento),
      meta: [
        { rotulo: 'Endereço', valor: d.endereco?.trim() || '—' },
        { rotulo: 'Unidade consumidora', valor: d.numero_uc?.trim() || '—' },
        { rotulo: 'Mês de referência', valor: competenciaBr(d.competencia) },
        { rotulo: 'Vencimento', valor: dataBr(d.vencimento) },
        { rotulo: 'Fatura nº', valor: d.numero_da_fatura },
      ],
    },
    total: {
      rotulo: 'Valor total a pagar',
      detalhe: 'Consumo G3 Solar + tarifas Equatorial',
      /* O TOTAL NULO SAI "—" E NUNCA "R$ 0,00". `valor_total_centavos` e
       * GENERATED ALWAYS e aceita nulo - medido em 30/07 -, e zero impresso no
       * lugar de desconhecido e vazio virando numero na fatura do cliente. */
      valor: ausente ? '—' : emReais(d.valor_total_centavos as Centavos),
      ausente,
      vencimento: dataBr(d.vencimento),
      nota: 'Pagável em qualquer banco',
    },
    /*
     * O AVISO E A FAIXA QUE MAIS TRABALHA NESTA FOLHA, e por isso ele e fixo e
     * nao configuravel. A conta unificada tem um modo de falha proprio: o cliente
     * recebe a fatura da Equatorial TAMBEM, porque a distribuidora continua
     * emitindo a dela, e pagar as duas e duplicidade que ele so descobre depois.
     */
    aviso: {
      titulo: 'Não pague a conta da Equatorial',
      corpo: 'Sua conta é unificada — o valor da distribuidora já está incluído neste boleto. '
           + 'Pagar a conta da Equatorial gera duplicidade.',
    },
    detalhamento: {
      titulo: 'Detalhamento da fatura',
      linhas: d.linhas.filter((l) => !JA_IMPRESSO_NA_FOLHA.has(l.campo)),
    },
    rodape: { emissor: linha, paginacao: `Fatura ${d.numero_da_fatura}` },
    faixas_ausentes: FAIXAS_AUSENTES,
  };
}

/**
 * OS CAMPOS QUE A TABELA NAO REPETE, porque a folha ja os imprimiu acima.
 *
 * E o achado que apareceu MEDINDO, e nao lendo: com os quinze campos do padrao a
 * folha ia a 350,9 mm e saia em duas paginas. A tentacao era diminuir a fonte. O
 * problema nao era tamanho — era que a mesma fatura imprimia o nome do cliente,
 * o CPF, a UC, a competencia, o vencimento e o total DUAS VEZES na mesma folha.
 *
 * O layout posicionado punha tudo numa tabela so porque nao tinha outro lugar. A
 * folha G3 tem: identificacao no bloco do cliente, o total na barra navy, e a
 * tabela para o que COMPOE esse total. Repetir nao e redundancia de codigo, e
 * redundancia impressa — a que o cliente ve.
 *
 * NAO E CONFIGURAVEL, e nao deve ser: `campo_do_documento` decide o que APARECE
 * na fatura; isto decide ONDE. Sao perguntas diferentes, e a segunda e do
 * desenho. Esconder `cliente_nome` pelo cadastro continua escondendo-o da folha
 * inteira — inclusive do bloco de cima.
 */
const JA_IMPRESSO_NA_FOLHA = new Set<string>([
  'cliente_nome',        // bloco do cliente
  'cliente_documento',   // bloco do cliente, mascarado
  'numero_uc',           // grade de metadados
  'competencia',         // grade de metadados, como "Mes de referencia"
  'vencimento',          // grade de metadados E barra do total
  'valor_total_centavos', // barra do total, em 26pt
]);

/**
 * Congelado como constante e nao montado por condicao: hoje as duas faltam
 * SEMPRE, para toda fatura, porque falta a coluna e nao o valor de uma fatura
 * especifica. Montar isto por `if` sugeriria que existe fatura em que a faixa
 * aparece, e nao existe. No dia em que existir, a condicao entra aqui e o teste
 * que conta duas quebra - que e o aviso certo na hora certa.
 */
const FAIXAS_AUSENTES: FolhaG3['faixas_ausentes'] = [
  {
    faixa: 'Os três cartões (sem a G3 · desconto · com a G3)',
    motivo: 'Exigem a tarifa cheia e a energia compensada, e a tarifa cheia não existe neste sistema. '
          + 'Calcular o desconto sobre uma tarifa suposta poria um número errado no campo que prova a economia.',
    questao: 'Q-DOCG3-02 · Q-TARIFA-CRM-01',
  },
  {
    faixa: 'A quebra dos repasses da Equatorial em quatro parcelas',
    motivo: 'O detalhamento existe e mostra o que o sistema fatura, mas a linha "Tarifas da concessionária" é '
          + 'UMA soma. Quebrá-la em não compensado, iluminação, bandeira e encargos exige o leitor da '
          + 'distribuidora — derivar as parcelas por subtração absorveria erro de leitura em silêncio.',
    questao: 'Q-DOCG3-11',
  },
];
