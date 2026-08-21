// A CENTRAL DE AJUDA, como dado e como busca. Sem JSX, sem rede, sem React.
//
// ============================================================================
// O QUE ELA PRECISA RESOLVER, e o prazo que a desenhou
//
// A partir de 22/08/2026 entram usuários novos no sistema, e **não há divisão de
// suporte**: não existe alguém para quem perguntar. Então a ajuda não pode ser
// um manual que a pessoa lê antes — ela tem de responder no momento em que a
// pessoa trava, com as palavras que a pessoa usa, e terminar num CLIQUE e não
// numa explicação.
//
// ============================================================================
// AS QUATRO DECISÕES
//
//   1. A BUSCA É DETERMINÍSTICA, e não um modelo de linguagem. O domínio é
//      fechado — doze telas e onze camadas —, e uma tabela de sinônimos curada
//      acerta mais do que um modelo nesse tamanho, responde na hora, funciona
//      sem rede, não custa por pergunta e **é testável** (regra 8). Um modelo
//      aqui seria imprevisibilidade paga para resolver um problema que cabe
//      numa lista;
//
//   2. O TERMO DA BUSCA É O DA PESSOA, e não o do sistema. «cadê o boleto»,
//      «não consigo cobrar», «conta de luz», «quem indicou» — os `termos` de
//      cada tópico existem para casar com a palavra errada, porque a palavra
//      errada é a que a pessoa vai digitar. Quem já sabe o nome certo acha de
//      qualquer jeito;
//
//   3. NUNCA TERMINA EM «NADA ENCONTRADO». Busca sem resultado devolve lista
//      vazia aqui, e a tela cai nos assuntos comuns e no estado ao vivo — um
//      beco sem saída num sistema sem suporte é a pessoa parada até alguém
//      chegar;
//
//   4. O ESTADO AO VIVO É PARTE DA RESPOSTA. `passosDoEstado` lê a prontidão
//      real e diz o que está travando AGORA, em ordem, com o link de cada uma.
//      É a diferença entre «para cobrar você precisa de contrato ativo» e
//      «faltam 11 clientes sem CPF confirmado — clique aqui».
//
// O MAPA DE DESTINO NÃO É REESCRITO AQUI: `destino-da-camada.ts` já sabe onde
// cada pendência se resolve, com rota e filtro, e tem suíte própria. Duplicar
// aquilo criaria dois mapas para discordarem em silêncio.

import { DESTINO_DA_CAMADA, enderecoDoDestino } from './destino-da-camada.ts';
import { VERBETE_DA_CAMADA, GLOSSARIO, type TermoDoGlossario } from './vocabulario.ts';

// ============================================================================
// NORMALIZAÇÃO
// ============================================================================

/**
 * Texto -> forma comparável: minúscula, SEM ACENTO, sem pontuação.
 *
 * O acento sai porque ninguém digita «competência» com acento numa busca com
 * pressa, e «competencia» tem de achar a mesma coisa. `NFD` + corte da faixa de
 * diacríticos faz isso sem tabela de substituição.
 */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * As palavras VAZIAS, que aparecem em toda frase e não distinguem nada.
 *
 * `nao` FICA DE FORA desta lista de propósito: «não consigo cobrar» e «consigo
 * cobrar» são perguntas diferentes, e é justamente a negação que marca quem
 * está travado.
 */
const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'o', 'a', 'os', 'as', 'um', 'uma', 'e', 'em',
  'no', 'na', 'nos', 'nas', 'por', 'que', 'com', 'ao', 'aos', 'se', 'ou', 'para',
  'pra', 'meu', 'minha', 'eu', 'me', 'esse', 'essa', 'este', 'esta', 'isso',
]);

/** Plural simples do português: «clientes» e «cliente» têm de casar. Só corta
 *  palavra com mais de três letras, senão «mes» viraria «me». */
const raiz = (t: string): string => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

/** Frase -> palavras que valem para a comparação. */
export function palavras(s: string): string[] {
  return normalizar(s).split(' ').filter((t) => t.length > 1 && !VAZIAS.has(t)).map(raiz);
}

// ============================================================================
// OS TÓPICOS
// ============================================================================

export type Topico = {
  id: string;
  /** O título é A PERGUNTA, como a pessoa faria — e não o nome do assunto.
   *  «Como cadastro um cliente» acha mais gente do que «Cadastro de clientes». */
  pergunta: string;
  /** A resposta em uma frase, antes dos passos. Quem só quer confirmar uma
   *  suspeita para aqui. */
  resposta: string;
  /** O que fazer, na ordem. Imperativo, um ato por linha. */
  passos: readonly string[];
  /** Para onde o botão leva. `null` quando não há tela — e aí os passos dizem
   *  o caminho real, em vez de um botão para lugar nenhum. */
  destino: string | null;
  /** A camada da prontidão, quando este tópico É uma pendência. Serve para o
   *  painel casar o tópico com o número ao vivo. */
  camada: string | null;
  /** As telas em que este tópico é sugerido SEM ninguém buscar nada. */
  telas: readonly string[];
  /** Sugerido quando a busca não acha nada. São as perguntas do primeiro dia. */
  comum?: boolean;
  /** As palavras da PESSOA, inclusive as erradas. */
  termos: readonly string[];
};

/** O endereço de uma camada, reusando o mapa que já existe. Sem isto, cada
 *  tópico repetiria a rota e o filtro — e um dia discordariam. */
const daCamada = (c: string): string | null => {
  const d = DESTINO_DA_CAMADA[c];
  return d ? enderecoDoDestino(d) : null;
};

export const TOPICOS: readonly Topico[] = [
  // ---------------------------------------------------------------- a grande
  {
    id: 'nao-consigo-cobrar',
    pergunta: 'Por que não consigo cobrar este mês?',
    resposta: 'Quase sempre falta um cadastro, e não é um defeito do sistema. A tela de Pendências '
      + 'mostra exatamente o que está faltando, em ordem.',
    passos: [
      'Abra a aba Pendências (é a primeira da barra).',
      'Confira o mês no alto da tela.',
      'Olhe as linhas marcadas como «Falta preencher» — cada uma tem um botão que abre a tela certa, já filtrada.',
      'Comece pela de cima: fechar a primeira costuma destravar as de baixo.',
    ],
    destino: '/pendencias',
    camada: null,
    telas: [],
    comum: true,
    /* «o que falta» e «pendencia» NAO estao aqui, e sao do topico de baixo: os
     * dois levam a mesma tela, mas quem digita «o que falta» esta se orientando
     * e quem digita «nao consigo cobrar» esta travado. Termo disputado por dois
     * topicos faz o desempate cair na ordem da lista, que nao e resposta. */
    termos: ['nao consigo cobrar', 'nao consigo faturar', 'nao sai a fatura', 'nao gera fatura',
             'fatura nao sai', 'nao consigo emitir', 'travado', 'bloqueado', 'nao deixa',
             'por que nao', 'nao da', 'erro ao faturar', 'faturar', 'cobrar', 'emitir'],
  },
  {
    id: 'o-que-falta',
    pergunta: 'Onde vejo tudo o que está faltando?',
    resposta: 'Na aba Pendências. Ela lista o que impede cobrar e o que impede dividir o dinheiro, '
      + 'com o número exato de cada coisa e o caminho para resolver.',
    passos: [
      'Abra a aba Pendências.',
      'Os dois cartões do alto respondem de uma vez: «Pode faturar» e «Pode repartir».',
      'Cada linha de baixo tem um botão «onde resolver» que já abre a tela filtrada.',
    ],
    destino: '/pendencias',
    camada: null,
    telas: [],
    comum: true,
    termos: ['o que falta', 'pendencias', 'o que preciso fazer', 'por onde comeco', 'checklist',
             'lista do que falta', 'status', 'como esta', 'resumo'],
  },

  // ------------------------------------------------------------- as camadas
  {
    id: 'documento-cliente',
    pergunta: 'O cliente tem CPF na tela, mas o sistema diz que falta. Por quê?',
    resposta: 'Documento que veio do CRM entra como sugestão, não como confirmado — mesmo estando '
      + 'certo. Alguém precisa reenviar o número aqui para ele passar a valer.',
    passos: [
      'Abra a aba Clientes.',
      'No filtro «Filtrar por documento», escolha «Ainda não vale para o contrato».',
      'Abra o cliente, confira o número com o documento dele e grave de novo — pode ser o mesmo número.',
      'Ao gravar, ele passa a valer e o contrato daquele cliente fica liberado.',
    ],
    destino: daCamada('documento_do_cliente'),
    camada: 'documento_do_cliente',
    telas: ['/clientes'],
    comum: true,
    termos: ['cpf', 'cnpj', 'documento', 'documento nao vale', 'cpf nao vale', 'confirmar documento',
             'validar documento', 'documento pendente', 'ja tem cpf', 'cpf esta la', 'sugestao do crm'],
  },
  {
    id: 'contrato',
    pergunta: 'Como crio e ativo o contrato de um cliente?',
    resposta: 'O formulário fica no topo da aba Contratos e já cria ativando. Ele exige duas coisas '
      + 'prontas antes: o CPF/CNPJ confirmado e quem trouxe o cliente.',
    passos: [
      'Confirme antes o CPF ou CNPJ do cliente na aba Clientes — sem isso o sistema recusa ativar.',
      'Abra a aba Contratos.',
      'Preencha o formulário do topo: cliente, unidade, quem trouxe o cliente, data de fechamento e valor.',
      'Grave. O contrato já nasce ativo.',
    ],
    destino: daCamada('contrato_ativo'),
    camada: 'contrato_ativo',
    telas: ['/contratos'],
    comum: true,
    termos: ['contrato', 'criar contrato', 'ativar contrato', 'contrato nao ativa', 'novo contrato',
             'rascunho', 'assinar', 'contrato do cliente'],
  },
  {
    id: 'rateio',
    pergunta: 'Como ligo a unidade do cliente a uma usina?',
    resposta: 'Na aba Unidades consumidoras, na linha da própria unidade. Primeiro a usina, depois '
      + 'a fatia em percentual — o campo da fatia fica travado enquanto não houver usina.',
    passos: [
      'Abra a aba Unidades consumidoras.',
      'Encontre a unidade e escolha a usina na coluna correspondente.',
      'Preencha o percentual que cabe a esse cliente.',
    ],
    destino: daCamada('rateio'),
    camada: 'rateio',
    telas: ['/unidades'],
    termos: ['rateio', 'usina do cliente', 'ligar usina', 'vincular usina', 'percentual', 'fatia',
             'porcentagem do cliente', 'quanto e do cliente', 'sem usina'],
  },
  {
    id: 'vencimento',
    pergunta: 'Onde preencho o dia de vencimento?',
    resposta: 'Na aba Unidades consumidoras, por unidade. Não existe dia padrão: o sistema prefere '
      + 'recusar a cobrança a escolher uma data por você.',
    passos: [
      'Abra a aba Unidades consumidoras.',
      'Use o filtro de pendência «Sem vencimento» para ver só as que faltam.',
      'Preencha o DIA do mês em cada uma. A cobrança de um mês vence no mês seguinte, nesse mesmo dia.',
    ],
    destino: daCamada('vencimento'),
    camada: 'vencimento',
    telas: ['/unidades'],
    termos: ['vencimento', 'data de vencimento', 'dia de vencimento', 'quando vence', 'prazo',
             'sem vencimento', 'dia do pagamento'],
  },
  {
    id: 'tarifa',
    pergunta: 'Onde coloco o preço do kWh?',
    resposta: 'É uma coluna da própria linha da unidade, na aba Unidades consumidoras. O preço muda '
      + 'de cliente para cliente, por isso não há um valor único para todos.',
    passos: [
      'Abra a aba Unidades consumidoras.',
      'Use o filtro de pendência «Sem tarifa».',
      'Preencha a coluna «Tarifa R$/kWh» na linha da unidade. Aceita até seis casas depois da vírgula.',
    ],
    destino: daCamada('tarifa_da_uc'),
    camada: 'tarifa_da_uc',
    telas: ['/unidades'],
    termos: ['tarifa', 'preco do kwh', 'kwh', 'valor da energia', 'preco da energia', 'sem tarifa',
             'quanto custa o kwh', 'aba tarifas'],
  },
  {
    id: 'geracao',
    pergunta: 'A energia gerada do mês não aparece. O que faço?',
    resposta: 'Esse número não se digita aqui: ele é lançado no CRM e chega ao financeiro sozinho. '
      + 'Se já foi lançado lá e continua faltando aqui, é caso de avisar o responsável técnico.',
    passos: [
      'Confira se a geração do mês já foi lançada no CRM.',
      'Se já foi e não apareceu aqui, avise quem cuida da integração — não há tela para digitar isso.',
      'Não tente contornar preenchendo outro campo: o valor viria a ser sobrescrito depois.',
    ],
    destino: null,
    camada: 'geracao_da_competencia',
    telas: [],
    termos: ['geracao', 'energia gerada', 'kwh gerado', 'producao', 'usina nao gerou',
             'nao aparece a geracao', 'sem geracao', 'energia do mes'],
  },
  {
    id: 'dono-usina',
    pergunta: 'Como cadastro o dono de uma usina?',
    resposta: 'Primeiro a pessoa precisa existir na aba Donos de usina; depois você a escolhe na '
      + 'linha da usina. A escolha grava na hora, sem botão de confirmar.',
    passos: [
      'Se o dono ainda não existe, cadastre-o na aba Donos de usina — exige chave Pix ou conta completa.',
      'Abra a aba Usinas.',
      'Na linha da usina, escolha o dono na lista.',
    ],
    destino: daCamada('dono_da_usina'),
    camada: 'dono_da_usina',
    telas: ['/usinas', '/donos'],
    termos: ['dono', 'dono da usina', 'proprietario', 'cadastrar dono', 'sem dono', 'quem recebe',
             'pix do dono', 'conta do dono'],
  },
  {
    id: 'repasse',
    pergunta: 'Como defino quanto o dono da usina recebe?',
    resposta: 'No fim da aba Usinas, na seção de percentual de repasse. Não existe «editar»: abrir '
      + 'um percentual novo fecha o anterior, porque renegociar hoje não muda o que já foi pago.',
    passos: [
      'Abra a aba Usinas.',
      'Vá até a seção «Percentual de repasse, por vigência», no fim da tela.',
      'Abra uma vigência nova com o percentual e a data em que ele passa a valer.',
    ],
    destino: daCamada('regra_de_repasse'),
    camada: 'regra_de_repasse',
    telas: ['/usinas'],
    termos: ['repasse', 'percentual do dono', 'quanto o dono recebe', 'split', 'divisao do dinheiro',
             'vigencia', 'renegociar', 'mudar percentual'],
  },
  {
    id: 'banco',
    pergunta: 'Como configuro a emissão de boleto?',
    resposta: 'Na aba Conector Sicoob, com os dados da conta. O certificado e a senha não são '
      + 'digitados ali — eles ficam guardados em cofre e a tela pede só a referência.',
    passos: [
      'Abra a aba Conector Sicoob.',
      'Preencha agência, conta, contrato, convênio e a validade do certificado.',
      'Enquanto isso não estiver pronto, dá para cobrar por Pix e importar na aba Emissão e cobrança um boleto emitido no site do banco.',
    ],
    destino: daCamada('cobranca_sicoob'),
    camada: 'cobranca_sicoob',
    telas: ['/cobranca'],
    termos: ['boleto', 'banco', 'sicoob', 'cobranca', 'emitir boleto', 'certificado', 'conta bancaria',
             'nao emite boleto', 'cade o boleto', 'codigo de barras'],
  },
  {
    id: 'comissao',
    pergunta: 'Quem trouxe o cliente e quanto ele recebe de comissão?',
    resposta: 'Quem trouxe fica gravado no contrato e não muda depois. O valor da comissão é '
      + 'decisão da direção, definida por período — não se preenche na tela.',
    passos: [
      'Ao criar o contrato, escolha quem trouxe o cliente — o campo é obrigatório.',
      'Se um contrato já ativo estiver com a pessoa errada, fale com a direção antes: corrigir exige encerrar e refazer o contrato.',
      'O valor da comissão em si não tem tela; é definido por quem decide isso.',
    ],
    destino: daCamada('originador_do_contrato'),
    camada: 'originador_do_contrato',
    telas: ['/contratos'],
    termos: ['comissao', 'originador', 'quem trouxe', 'indicacao', 'indicou', 'parceiro', 'vendedor',
             'quanto de comissao', 'quem indicou o cliente'],
  },

  // ---------------------------------------------------------- o dia a dia
  {
    id: 'gerar-mes',
    pergunta: 'Como gero as cobranças do mês?',
    resposta: 'Na aba Faturamento. Ela primeiro ENSAIA — mostra o que entraria e o que ficaria de '
      + 'fora, com o motivo — e só depois você confirma.',
    passos: [
      'Confira antes a aba Pendências: o que estiver faltando lá vira recusa aqui.',
      'Abra a aba Faturamento e escolha o mês.',
      'Rode o ensaio e leia os motivos de quem ficou de fora.',
      'Confirme para gerar. Depois, a emissão e a cobrança acontecem na aba Emissão e cobrança.',
    ],
    destino: '/carteira',
    camada: null,
    telas: ['/carteira'],
    comum: true,
    termos: ['gerar fatura', 'fechar o mes', 'faturar o mes', 'rodar o faturamento', 'lote',
             'gerar cobranca', 'carteira', 'faturamento', 'como faturo'],
  },
  {
    id: 'cliente-pagou',
    pergunta: 'O cliente pagou. Como dou baixa?',
    resposta: 'Na aba Emissão e cobrança, na linha da própria fatura.',
    passos: [
      'Abra a aba Emissão e cobrança.',
      'Encontre a fatura do cliente.',
      'Registre o pagamento na linha dela.',
    ],
    destino: '/faturas',
    camada: null,
    telas: ['/faturas'],
    comum: true,
    termos: ['pagou', 'dar baixa', 'baixa', 'recebido', 'quitar', 'marcar como pago', 'pagamento',
             'cliente pagou', 'confirmar pagamento'],
  },
  {
    id: 'cliente-nao-aparece',
    pergunta: 'O cliente não aparece na lista. O que houve?',
    resposta: 'Quase sempre é filtro ligado ou a empresa errada selecionada no alto da tela.',
    passos: [
      'Confira a empresa selecionada no canto superior direito.',
      'Limpe os filtros da barra acima da tabela — inclusive o de pendência, que pode ter vindo de um link.',
      'Busque pelo nome ou pelo documento no campo de busca.',
      'Se ainda assim não aparecer, o cliente pode não ter vindo do CRM ainda.',
    ],
    destino: '/clientes',
    camada: null,
    telas: ['/clientes', '/unidades'],
    termos: ['nao aparece', 'sumiu', 'nao encontro', 'cade o cliente', 'lista vazia', 'nao acho',
             'faltando cliente', 'nao esta na lista'],
  },
  {
    id: 'trocar-empresa',
    pergunta: 'Como troco de empresa?',
    resposta: 'No seletor do canto superior direito. Todas as telas mostram os dados de uma empresa '
      + 'só por vez.',
    passos: [
      'Clique no nome da empresa, no alto à direita.',
      'Escolha a outra empresa na lista.',
    ],
    destino: null,
    camada: null,
    telas: [],
    termos: ['trocar empresa', 'mudar empresa', 'outra empresa', 'tenant', 'empresa errada',
             'dados errados', 'nao e minha empresa'],
  },
];

// ============================================================================
// A BUSCA
// ============================================================================

export type Achado = { topico: Topico; pontos: number };

/**
 * PESOS. A ordem entre eles é o que faz a busca acertar, e não os valores:
 * frase inteira batendo num termo vale mais que palavra solta, e palavra no
 * termo vale mais que palavra no meio da resposta — porque os `termos` foram
 * escritos para casar e a resposta foi escrita para ler.
 */
const PESO = { frase: 100, termo: 12, pergunta: 8, corpo: 2 } as const;

/**
 * Os tópicos que respondem a uma pergunta, do mais provável ao menos.
 *
 * DEVOLVE VAZIO quando nada casa, de propósito: quem decide o que mostrar num
 * vazio é a tela, que tem mais contexto (a aba aberta, o estado do mês). Uma
 * lista de consolo montada aqui apareceria idêntica nos dois casos.
 */
export function buscar(consulta: string, base: readonly Topico[] = TOPICOS): Achado[] {
  const alvo = normalizar(consulta);
  if (alvo.length < 2) return [];
  const ps = palavras(consulta);

  const achados: Achado[] = [];
  for (const topico of base) {
    let pontos = 0;
    let frase = false;

    for (const t of topico.termos) {
      const n = normalizar(t);
      // Frase inteira: a busca dentro do termo OU o termo dentro da busca. O
      // segundo sentido é o que faz «nao consigo cobrar hoje» achar «nao
      // consigo cobrar».
      if (n.includes(alvo) || alvo.includes(n)) { pontos += PESO.frase; frase = true; break; }
    }

    const nosTermos = new Set(topico.termos.flatMap((t) => palavras(t)));
    const naPergunta = new Set(palavras(topico.pergunta));
    const noCorpo = new Set([topico.resposta, ...topico.passos].flatMap((t) => palavras(t)));

    let casadas = 0;
    for (const p of ps) {
      const bateu = nosTermos.has(p) || naPergunta.has(p);
      if (nosTermos.has(p)) pontos += PESO.termo;
      if (naPergunta.has(p)) pontos += PESO.pergunta;
      if (noCorpo.has(p)) pontos += PESO.corpo;
      if (bateu) casadas++;
    }

    /*
     * UMA PALAVRA SOLTA DE UMA PERGUNTA LONGA NÃO É RESPOSTA — e este corte foi
     * medido, não suposto: «conta de luz» casava com «Como configuro a emissão
     * de boleto?» pela palavra «conta», que ali quer dizer conta BANCÁRIA.
     *
     * O resultado errado é pior que resultado nenhum, porque chega sob o título
     * «Isto responde» e a pessoa vai atrás. Sem ele, a busca cai no glossário —
     * que responde «conta de luz» corretamente — ou nos assuntos comuns.
     *
     * Busca de UMA palavra escapa da regra: quem digita «tarifa» deu tudo o que
     * tinha, e exigir duas casadas de uma só recusaria a busca mais comum de
     * todas.
     */
    const forte = frase || casadas >= 2 || ps.length <= 1;
    if (pontos > 0 && forte) achados.push({ topico, pontos });
  }

  return achados.sort((a, b) => b.pontos - a.pontos || a.topico.id.localeCompare(b.topico.id));
}

/** Os termos do glossário que respondem a «o que quer dizer X». Separado da
 *  busca de tópicos porque a resposta é de outra natureza: define uma palavra,
 *  não ensina um caminho. */
export function buscarTermos(consulta: string): TermoDoGlossario[] {
  const alvo = normalizar(consulta);
  if (alvo.length < 2) return [];
  const ps = palavras(consulta);

  return GLOSSARIO.filter((g) => {
    if (g.busca.some((b) => { const n = normalizar(b); return n.includes(alvo) || alvo.includes(n); })) return true;
    /*
     * TODAS as palavras da pergunta, e não alguma — e a diferença foi medida
     * contra producao: com `some`, «o cliente pagou» devolvia os verbetes de
     * rateio E de originador, porque os dois citam «cliente». Três definições
     * irrelevantes embaixo da resposta certa fazem a pessoa duvidar dela.
     *
     * Definir uma palavra é uma resposta CERTA ou ERRADA — não há meio termo que
     * ajude —, então o casamento parcial não vale.
     */
    const chaves = new Set([...g.busca.flatMap((b) => palavras(b)), ...palavras(g.termo)]);
    return ps.length > 0 && ps.every((p) => chaves.has(p));
  });
}

/** Os tópicos sugeridos numa tela, sem ninguém ter buscado nada. É o que faz a
 *  ajuda abrir já falando do que a pessoa está olhando. */
export const topicosDaTela = (rota: string, base: readonly Topico[] = TOPICOS): Topico[] =>
  base.filter((t) => t.telas.includes(rota));

/** As perguntas do primeiro dia, para quando a busca não acha nada e para a
 *  abertura em telas sem tópico próprio. */
export const topicosComuns = (base: readonly Topico[] = TOPICOS): Topico[] =>
  base.filter((t) => t.comum === true);

// ============================================================================
// O ESTADO AO VIVO
// ============================================================================

/** O mínimo que `passosDoEstado` precisa saber de uma camada. Estrutural de
 *  propósito: o `Camada` de `api.ts` satisfaz isto sem que este módulo puro
 *  precise importar o cliente de rede. */
export type CamadaLida = {
  camada: string;
  situacao: 'ok' | 'pendente' | 'nao_medido';
  faltam: number;
  total: number;
  efeito: 'bloqueia_fatura' | 'bloqueia_split';
};

export type PassoDoEstado = {
  camada: string;
  titulo: string;
  /** A frase pronta, com o número dentro. É o que a tela mostra. */
  frase: string;
  faltam: number;
  total: number;
  efeito: 'bloqueia_fatura' | 'bloqueia_split';
  /** Para onde ir. `null` quando a camada não tem tela. */
  destino: string | null;
  /** O tópico que explica isso com passos, quando existe. */
  topico: Topico | null;
};

/**
 * O QUE ESTÁ TRAVANDO AGORA, em ordem de trabalho e em português.
 *
 * A ORDEM É A DO SERVIDOR e não uma reordenação por gravidade: a prontidão já
 * vem na ordem em que fechar a de cima torna a de baixo mensurável, e embaralhar
 * isso mandaria a pessoa preencher o que ainda não dá para preencher.
 *
 * `nao_medido` ENTRA NA LISTA junto com `pendente`, e é a mesma decisão que a
 * tela de Pendências já toma ao desenhar link para as duas: universo vazio quase
 * sempre se destrava uma camada acima, e esconder isso deixaria a pessoa achando
 * que aquela linha está resolvida.
 */
export function passosDoEstado(camadas: readonly CamadaLida[]): PassoDoEstado[] {
  const passos: PassoDoEstado[] = [];

  for (const c of camadas) {
    if (c.situacao === 'ok') continue;

    const v = VERBETE_DA_CAMADA[c.camada];
    const d = DESTINO_DA_CAMADA[c.camada];
    const titulo = v?.titulo ?? c.camada;

    passos.push({
      camada: c.camada,
      titulo,
      frase: c.situacao === 'nao_medido'
        // Sem número, porque não há número: dizer «0 de 0» aqui seria repetir o
        // defeito que a cor amarela da tela de Pendências existe para evitar.
        ? `${titulo}: ainda não dá para conferir — depende de algo acima nesta lista.`
        : `${titulo}: ${c.faltam} de ${c.total} ${c.faltam === 1 ? 'pendente' : 'pendentes'}.`,
      faltam: c.faltam,
      total: c.total,
      efeito: c.efeito,
      destino: d ? enderecoDoDestino(d) : null,
      topico: TOPICOS.find((t) => t.camada === c.camada) ?? null,
    });
  }

  return passos;
}

/** Só o que impede COBRAR — a pergunta que mais vai ser feita amanhã. */
export const travamCobranca = (p: readonly PassoDoEstado[]): PassoDoEstado[] =>
  p.filter((x) => x.efeito === 'bloqueia_fatura');
