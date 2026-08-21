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
// A PROMESSA, escrita em 21/08 e agora VERIFICADA: TODA RESPOSTA TERMINA NUMA TELA
//
// O pedido do dono foi *"que esteja preparado para receber todo tipo de pergunta
// e sempre devolver o possível link de rota para resolução"*. Isso deixou de ser
// intenção e virou invariante: `respostaTemCaminho` percorre um banco de
// perguntas selvagens e exige que NENHUMA delas termine sem uma tela clicável.
//
// As três defesas, da mais precisa para a menos:
//
//   1. O ASSUNTO. Casou um tópico -> os `caminhos` dele. Cada tópico tem ao
//      menos um, e a suíte recusa um tópico sem nenhum;
//   2. A PALAVRA. Casou só um verbete do glossário («o que quer dizer rateio?»)
//      -> o verbete agora carrega os caminhos de onde aquilo aparece na tela;
//   3. A TELA. Não casou nada -> `telasCitadas` procura no texto da pergunta o
//      nome (ou o apelido) de uma das doze telas e oferece ir direto. Só depois
//      disso é que entram os assuntos do primeiro dia.
//
// A terceira defesa é a que fecha o buraco: «onde eu vejo as usinas» não casa
// tópico nenhum, e ainda assim tem de acabar em `/usinas`.
//
// ============================================================================
// AS QUATRO DECISÕES QUE NÃO MUDARAM
//
//   1. A BUSCA É DETERMINÍSTICA, e não um modelo de linguagem. O domínio é
//      fechado — doze telas e onze pendências do relatório —, e uma tabela de
//      sinônimos curada acerta mais do que um modelo nesse tamanho, responde na
//      hora, funciona sem rede, não custa por pergunta e **é testável** (regra
//      8). Um modelo aqui seria imprevisibilidade paga para resolver um problema
//      que cabe numa lista;
//
//   2. O TERMO DA BUSCA É O DA PESSOA, e não o do sistema. «cadê o boleto»,
//      «não consigo cobrar», «conta de luz», «quem indicou» — os `termos` de
//      cada tópico existem para casar com a palavra errada, porque a palavra
//      errada é a que a pessoa vai digitar. Quem já sabe o nome certo acha de
//      qualquer jeito;
//
//   3. NUNCA TERMINA EM «NADA ENCONTRADO». Um beco sem saída num sistema sem
//      suporte é a pessoa parada até alguém chegar;
//
//   4. O ESTADO AO VIVO É PARTE DA RESPOSTA. `passosDoEstado` lê o relatório
//      real e diz o que está travando AGORA, em ordem, com o link de cada uma.
//      É a diferença entre «para cobrar você precisa de contrato ativo» e
//      «faltam 11 clientes sem CPF confirmado — clique aqui».
//
// O MAPA DE DESTINO NÃO É REESCRITO AQUI: `destino-da-camada.ts` já sabe onde
// cada pendência se resolve, com rota e filtro, e tem suíte própria. Duplicar
// aquilo criaria dois mapas para discordarem em silêncio.

import { DESTINO_DA_CAMADA, enderecoDoDestino } from './destino-da-camada.ts';
import { TELAS } from './navegacao.ts';
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
 * A forma de comparar FRASE, com espaço nas pontas.
 *
 * O espaço não é enfeite — é o que transforma «contém o texto» em «contém a
 * PALAVRA». Sem ele, buscar «baixa» casava com o termo «baixar a lista», e a
 * pessoa que queria dar baixa numa fatura recebia o assunto de exportar
 * planilha sob o título «Isto responde». Foi o mesmo defeito de «conta de luz»
 * caindo no boleto, uma escala acima: quanto mais assuntos a base tem, mais
 * pares de palavras uma dentro da outra ela contém.
 */
const emFrase = (s: string): string => ` ${normalizar(s)} `;

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
// O CAMINHO — a peça que faz a promessa ser cumprível
// ============================================================================

/**
 * PARA ONDE IR. É o que toda resposta desta central tem de carregar.
 *
 * O `tipo` existe porque prometer conserto onde só há vista é pior do que não
 * prometer nada: duas pendências do relatório NÃO TÊM TELA de preenchimento — a
 * energia gerada é espelhada do CRM e o valor da comissão é decisão versionada.
 * Antes, essas duas terminavam sem link nenhum, o que respeitava a verdade e
 * deixava a pessoa sem próximo passo. Agora terminam num caminho `ver`, com o
 * rótulo dizendo o que se encontra lá.
 */
export type Caminho = {
  /** A rota da tela, com o filtro embutido quando houver. */
  rota: string;
  /** O ATO, em imperativo — «Confirmar o CPF ou CNPJ», e não «Clientes». Vira o
   *  texto do botão, e um botão que diz o nome da tela não diz o que fazer lá. */
  rotulo: string;
  /** `resolver` — é aqui que o dado entra. `ver` — aqui dá para OLHAR, mas o
   *  conserto é em outro lugar (ou não é de tela). */
  tipo: 'resolver' | 'ver';
};

/**
 * O caminho de uma pendência do relatório, REUSANDO o mapa que já existe.
 *
 * Sem isto, cada tópico repetiria a rota e o filtro — e um dia discordariam do
 * botão que a tela de Pendências desenha para a mesma linha.
 *
 * Pendência sem tela cai em `/pendencias`, que é onde ela aparece de qualquer
 * forma, marcada como `ver`. Não é consolo: é o único lugar honesto, e a
 * alternativa (nenhum link) já foi medida e deixa a pessoa sem saída.
 */
const daCamada = (chave: string, rotulo: string): Caminho => {
  const d = DESTINO_DA_CAMADA[chave];
  const endereco = d ? enderecoDoDestino(d) : null;
  return endereco
    ? { rota: endereco, rotulo, tipo: 'resolver' }
    : { rota: '/pendencias', rotulo: 'Ver esta pendência', tipo: 'ver' };
};

/** Atalho de leitura para os caminhos escritos à mão. */
const ir = (rota: string, rotulo: string): Caminho => ({ rota, rotulo, tipo: 'resolver' });
const ver = (rota: string, rotulo: string): Caminho => ({ rota, rotulo, tipo: 'ver' });

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
  /** PARA ONDE IR — ao menos um, sempre. É a invariante que a suíte prende, e é
   *  a diferença entre uma ajuda que explica e uma que resolve. Mais de um
   *  quando o assunto atravessa telas (emitir é numa, configurar o banco é em
   *  outra), e a ordem é a do trabalho. */
  caminhos: readonly Caminho[];
  /** A pendência do relatório, quando este tópico É uma delas. Serve para o
   *  painel casar o tópico com o número ao vivo. */
  camada: string | null;
  /** As telas em que este tópico é sugerido SEM ninguém buscar nada. */
  telas: readonly string[];
  /** Sugerido quando a busca não acha nada. São as perguntas do primeiro dia. */
  comum?: boolean;
  /** As palavras da PESSOA, inclusive as erradas. */
  termos: readonly string[];
};

export const TOPICOS: readonly Topico[] = [
  // ================================================================ a grande
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
    caminhos: [ir('/pendencias', 'Ver o que está faltando')],
    camada: null,
    telas: [],
    comum: true,
    /* «o que falta» e «pendencia» NAO estao aqui, e sao do topico de baixo: os
     * dois levam a mesma tela, mas quem digita «o que falta» esta se orientando
     * e quem digita «nao consigo cobrar» esta travado. Termo disputado por dois
     * topicos faz o desempate cair na ordem da lista, que nao e resposta.
     *
     * «faturar», «cobrar» e «emitir» SOZINHOS sairam daqui em 21/08, quando a
     * base cresceu: quem digita so o verbo esta perguntando COMO se faz, e a
     * resposta disso e a aba Faturamento — nao o diagnostico de por que nao dá. */
    termos: ['nao consigo cobrar', 'nao consigo faturar', 'nao sai a fatura', 'nao gera fatura',
             'fatura nao sai', 'nao consigo emitir', 'travado', 'bloqueado', 'nao deixa',
             'por que nao', 'nao da', 'erro ao faturar', 'nao consigo', 'esta impedido'],
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
    caminhos: [ir('/pendencias', 'Abrir Pendências')],
    camada: null,
    telas: ['/pendencias'],
    comum: true,
    termos: ['o que falta', 'pendencias', 'o que preciso fazer', 'por onde comeco', 'checklist',
             'lista do que falta', 'status', 'como esta', 'resumo', 'primeiro dia', 'comecar do zero'],
  },
  {
    id: 'ainda-nao-da-para-conferir',
    pergunta: 'O que quer dizer «Ainda não dá para conferir»?',
    resposta: 'Que aquela linha depende de outra que ainda está vazia — então não há o que contar. '
      + 'Não é o mesmo que «pronto», e por isso ela aparece em amarelo e não em verde.',
    passos: [
      'Resolva primeiro a linha de cima, que é de onde vem o vazio.',
      'Volte a Pendências: a linha passa a mostrar um número de verdade.',
      'Se a linha de cima já estiver pronta e esta continuar amarela, o mês escolhido pode não ter movimento.',
    ],
    caminhos: [ir('/pendencias', 'Abrir Pendências')],
    camada: null,
    telas: ['/pendencias'],
    termos: ['amarelo', 'nao da para conferir', 'nao medido', 'zero de zero', 'linha amarela',
             'nem pronto nem pendente', 'o que significa amarelo'],
  },
  {
    id: 'mes-de-referencia',
    pergunta: 'Como troco o mês? E qual mês eu escolho?',
    resposta: 'O seletor de mês fica no alto das telas de dinheiro. Vale o mês da ENERGIA, não o do '
      + 'pagamento: a conta de agosto cobra agosto, mesmo sendo paga em setembro.',
    passos: [
      'Procure o campo «Mês de referência» no alto da tela.',
      'Escolha o mês da energia que está sendo cobrada.',
      'Em Relatórios, deixar o campo vazio mostra o histórico inteiro em vez de um mês só.',
    ],
    caminhos: [ir('/pendencias', 'Conferir o mês em Pendências'), ver('/carteira', 'Ver o mês em Faturamento')],
    camada: null,
    telas: [],
    termos: ['mes', 'mes de referencia', 'competencia', 'trocar o mes', 'mudar o mes', 'mes errado',
             'qual mes', 'periodo', 'data de referencia'],
  },

  // ======================================== as pendências do relatório mensal
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
    caminhos: [daCamada('documento_do_cliente', 'Confirmar o CPF ou CNPJ')],
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
    caminhos: [
      daCamada('contrato_ativo', 'Criar e ativar o contrato'),
      ver('/clientes?pendencia=nao_validado', 'Antes: confirmar o CPF ou CNPJ'),
    ],
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
    caminhos: [daCamada('rateio', 'Vincular a usina e a fatia')],
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
    caminhos: [daCamada('vencimento', 'Preencher o dia de vencimento')],
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
    caminhos: [daCamada('tarifa_da_uc', 'Preencher o preço do kWh')],
    camada: 'tarifa_da_uc',
    telas: ['/unidades'],
    termos: ['tarifa', 'preco do kwh', 'kwh', 'valor da energia', 'preco da energia', 'sem tarifa',
             'quanto custa o kwh', 'aba tarifas'],
  },
  {
    id: 'endereco-unidade',
    pergunta: 'Falta o endereço de uma unidade. Onde preencho?',
    resposta: 'Na aba Unidades consumidoras, abrindo a linha. O endereço não impede cobrar, mas é '
      + 'ele que sai impresso na folha que o cliente recebe.',
    passos: [
      'Abra a aba Unidades consumidoras.',
      'Use o filtro de pendência «Sem endereço completo».',
      'Abra a linha da unidade e complete o endereço.',
    ],
    caminhos: [ir('/unidades?pendencia=sem_endereco', 'Completar o endereço')],
    camada: null,
    telas: ['/unidades'],
    termos: ['endereco', 'rua', 'cep', 'cidade', 'sem endereco', 'endereco incompleto',
             'endereco da unidade', 'endereco do cliente'],
  },
  {
    id: 'geracao',
    pergunta: 'A energia gerada do mês não aparece. O que faço?',
    resposta: 'Esse número não se digita aqui: ele é lançado no CRM e chega ao financeiro sozinho. '
      + 'Se já foi lançado lá e continua faltando aqui, é caso de avisar o responsável técnico.',
    passos: [
      'Confira se a geração do mês já foi lançada no CRM.',
      'Na aba Usinas dá para ver quais usinas já receberam o número deste mês.',
      'Se já foi lançado lá e não apareceu aqui, avise quem cuida da integração — não há tela para digitar isso.',
      'Não tente contornar preenchendo outro campo: o valor viria a ser sobrescrito depois.',
    ],
    /* SEM CAMINHO `resolver`, DE PROPOSITO — e com um `ver`, que e a mudanca de
     * 21/08. A tela de digitar nao existe e nao vai existir (o numero e
     * espelhado do CRM), mas a de OLHAR existe: e em Usinas que se ve quem ja
     * recebeu o mes. Antes esta linha terminava sem clique nenhum. */
    caminhos: [ver('/usinas', 'Ver as usinas e o que já chegou'), ver('/pendencias', 'Ver quantas faltam')],
    camada: 'geracao_da_competencia',
    telas: ['/usinas'],
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
    caminhos: [
      daCamada('dono_da_usina', 'Vincular o dono à usina'),
      ir('/donos', 'Cadastrar uma pessoa nova'),
    ],
    camada: 'dono_da_usina',
    telas: ['/usinas', '/donos'],
    termos: ['dono', 'dono da usina', 'proprietario', 'cadastrar dono', 'sem dono', 'quem recebe',
             'pix do dono', 'conta do dono', 'dono nao aparece na lista'],
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
    caminhos: [daCamada('regra_de_repasse', 'Abrir a vigência de repasse')],
    camada: 'regra_de_repasse',
    telas: ['/usinas'],
    termos: ['repasse', 'percentual do dono', 'quanto o dono recebe', 'divisao do dinheiro',
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
    caminhos: [
      daCamada('cobranca_sicoob', 'Cadastrar a credencial do banco'),
      ver('/faturas', 'Enquanto isso: cobrar por Pix'),
    ],
    camada: 'cobranca_sicoob',
    telas: ['/cobranca'],
    termos: ['sicoob', 'conector', 'certificado', 'credencial', 'conta bancaria', 'agencia',
             'convenio', 'configurar o banco', 'ligar o banco', 'dados bancarios da empresa'],
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
    caminhos: [
      daCamada('originador_do_contrato', 'Conferir os contratos ativos'),
      ver('/relatorios', 'Ver o que já foi apurado'),
    ],
    camada: 'originador_do_contrato',
    telas: ['/contratos'],
    termos: ['comissao', 'originador', 'quem trouxe', 'indicacao', 'indicou', 'parceiro', 'vendedor',
             'quanto de comissao', 'quem indicou o cliente'],
  },
  {
    id: 'valor-da-comissao',
    pergunta: 'O sistema diz que falta o valor da comissão. Onde preencho?',
    resposta: 'Não há tela para isso, e é de propósito: o percentual de cada tipo de parceiro é '
      + 'decisão da direção, registrada por período de vigência. Ela não impede cobrar.',
    passos: [
      'Cobre o mês normalmente — isto não trava a cobrança, só a divisão do dinheiro depois.',
      'Se esta linha aparecer como «ainda não dá para conferir», olhe a linha de cima primeiro: sem quem trouxe o cliente não há o que medir aqui.',
      'Peça à direção a definição do percentual e do período em que ele passa a valer.',
    ],
    caminhos: [ver('/contratos', 'Ver quem trouxe cada cliente'), ver('/pendencias', 'Ver esta pendência')],
    camada: 'regra_de_comissao',
    telas: ['/contratos'],
    termos: ['valor da comissao', 'percentual da comissao', 'regra de comissao', 'quanto paga o parceiro',
             'tabela de comissao', 'porcentagem do vendedor'],
  },

  // ================================================= cadastros do dia a dia
  {
    id: 'cadastrar-cliente',
    pergunta: 'Como cadastro um cliente novo?',
    resposta: 'A maioria chega sozinha do CRM. Se precisar de um que não está lá, o formulário do '
      + 'topo da aba Clientes cria na hora — nome basta, o documento pode vir depois.',
    passos: [
      'Abra a aba Clientes e procure primeiro pelo nome: ele pode já ter vindo do CRM.',
      'Não achou? Preencha o nome no formulário do topo e grave.',
      'Depois confirme o CPF ou CNPJ dele — sem isso o contrato não ativa.',
    ],
    caminhos: [ir('/clientes', 'Abrir Clientes')],
    camada: null,
    telas: ['/clientes'],
    termos: ['cadastrar cliente', 'criar cliente', 'cliente novo', 'novo cliente', 'incluir cliente',
             'adicionar cliente', 'cliente que nao existe'],
  },
  {
    id: 'contato-do-cliente',
    pergunta: 'Onde corrijo o telefone ou o e-mail do cliente?',
    resposta: 'Na aba Clientes, abrindo a linha do cliente. É por esse contato que a cobrança chega '
      + 'até ele.',
    passos: [
      'Abra a aba Clientes.',
      'Busque pelo nome ou pelo documento e abra a linha.',
      'Corrija o telefone ou o e-mail e grave.',
    ],
    caminhos: [ir('/clientes', 'Abrir Clientes')],
    camada: null,
    telas: ['/clientes'],
    termos: ['telefone', 'celular', 'email', 'contato', 'whatsapp do cliente', 'corrigir telefone',
             'mudar email'],
  },
  {
    id: 'cadastrar-unidade',
    pergunta: 'Como cadastro uma unidade nova?',
    resposta: 'Aqui não se cadastra: as unidades chegam do CRM sozinhas. O que é preenchido no '
      + 'financeiro é o que só existe aqui — vencimento, preço do kWh, usina e fatia.',
    passos: [
      'Cadastre a unidade no CRM.',
      'Espere a próxima passada da integração — ela roda sozinha várias vezes por hora.',
      'Quando a unidade aparecer na aba Unidades consumidoras, preencha vencimento, preço do kWh e a usina.',
    ],
    caminhos: [ir('/unidades', 'Abrir Unidades consumidoras')],
    camada: null,
    telas: ['/unidades'],
    termos: ['cadastrar unidade', 'unidade nova', 'nova unidade', 'incluir unidade', 'criar unidade',
             'unidade nao aparece', 'numero da unidade', 'instalacao nova'],
  },
  {
    id: 'cadastrar-usina',
    pergunta: 'Como cadastro uma usina nova?',
    resposta: 'As usinas também chegam do CRM. No financeiro se preenche o que é daqui: o dono e o '
      + 'percentual de repasse.',
    passos: [
      'Cadastre a usina no CRM.',
      'Quando ela aparecer na aba Usinas, escolha o dono na linha.',
      'Abra a vigência de repasse dela, no fim da mesma tela.',
    ],
    caminhos: [ir('/usinas', 'Abrir Usinas')],
    camada: null,
    telas: ['/usinas'],
    termos: ['cadastrar usina', 'usina nova', 'nova usina', 'incluir usina', 'criar usina',
             'usina nao aparece', 'geradora'],
  },
  {
    id: 'contrato-errado',
    pergunta: 'Errei alguma coisa num contrato já ativo. Dá para editar?',
    resposta: 'Quem trouxe o cliente não se edita depois de ativo — corrigir exige encerrar e '
      + 'refazer, o que deixa marca no histórico. Antes de mexer, fale com a direção.',
    passos: [
      'Abra a aba Contratos e confirme o que está gravado.',
      'Se o erro for em quem trouxe o cliente, pare: a correção é encerrar e refazer o contrato, e a decisão não é de quem opera a tela.',
      'Fale com a direção antes de encerrar qualquer contrato ativo.',
    ],
    caminhos: [ir('/contratos', 'Abrir Contratos')],
    camada: null,
    telas: ['/contratos'],
    termos: ['editar contrato', 'corrigir contrato', 'contrato errado', 'errei o contrato',
             'encerrar contrato', 'cancelar contrato', 'trocar quem trouxe'],
  },

  // ============================================================== o dinheiro
  {
    id: 'gerar-mes',
    pergunta: 'Como gero as cobranças do mês?',
    resposta: 'Na aba Faturamento. Ela primeiro ENSAIA — mostra o que entraria e o que ficaria de '
      + 'fora, com o motivo — e só depois você confirma.',
    passos: [
      'Confira antes a aba Pendências: o que estiver faltando lá vira recusa aqui.',
      'Abra a aba Faturamento e escolha o mês.',
      'Clique em «Simular, sem cobrar ninguém» e leia os motivos de quem ficou de fora.',
      'Clique em «Gerar as cobranças». Depois, a emissão e a cobrança acontecem na aba Emissão e cobrança.',
    ],
    caminhos: [
      ir('/carteira', 'Abrir Faturamento'),
      ver('/pendencias', 'Antes: ver o que falta'),
      ver('/faturas', 'Depois: emitir e cobrar'),
    ],
    camada: null,
    telas: ['/carteira'],
    comum: true,
    termos: ['gerar fatura', 'fechar o mes', 'faturar o mes', 'rodar o faturamento', 'lote',
             'gerar cobranca', 'carteira', 'faturamento', 'como faturo', 'faturar', 'cobrar',
             'gerar as cobrancas', 'compor'],
  },
  {
    id: 'ensaio',
    pergunta: 'O que é o ensaio? Ele cobra alguém sem eu querer?',
    resposta: 'Não. O ensaio só simula: ele mostra quem entraria no mês e quem ficaria de fora, com '
      + 'o motivo de cada recusa, e não grava nada. Rodar de novo não faz mal.',
    passos: [
      'Abra a aba Faturamento e escolha o mês.',
      'Clique em «Simular, sem cobrar ninguém» quantas vezes quiser — nada é gravado e ninguém é cobrado.',
      'Só o botão ao lado, «Gerar as cobranças», grava as faturas.',
    ],
    caminhos: [ir('/carteira', 'Abrir Faturamento')],
    camada: null,
    telas: ['/carteira'],
    termos: ['ensaio', 'simular', 'teste', 'sem gravar', 'vai cobrar', 'e seguro', 'ensaiar',
             'da para desfazer', 'sem risco'],
  },
  {
    id: 'ficou-de-fora',
    pergunta: 'Um cliente ficou de fora do faturamento. Por quê?',
    resposta: 'O ensaio diz o motivo de cada recusa, linha por linha. Quase sempre é um cadastro '
      + 'faltando — e o mesmo motivo aparece contado na aba Pendências.',
    passos: [
      'Abra a aba Faturamento e clique em «Simular, sem cobrar ninguém».',
      'Leia o motivo escrito na linha de quem ficou de fora.',
      'Abra a aba Pendências: o botão de cada linha leva à tela onde aquilo se preenche.',
      'Resolva e rode o ensaio de novo.',
    ],
    caminhos: [ir('/carteira', 'Abrir Faturamento'), ir('/pendencias', 'Ver o que falta')],
    camada: null,
    telas: ['/carteira'],
    termos: ['ficou de fora', 'recusado', 'nao entrou', 'faltou cliente no lote', 'motivo da recusa',
             'por que recusou', 'nao foi faturado', 'cliente fora do mes'],
  },
  {
    id: 'emitir-fatura',
    pergunta: 'Como emito as faturas do mês?',
    resposta: 'Na aba Emissão e cobrança. Emitir fecha o valor da fatura — o boleto e a baixa vêm '
      + 'depois, cada um no seu botão.',
    passos: [
      'Abra a aba Emissão e cobrança e escolha o mês.',
      'Use «Emitir em lote» para fechar todos os rascunhos de uma vez, ou emita linha por linha.',
      'Depois de emitida, a fatura ganha os botões de boleto e de baixa.',
    ],
    caminhos: [ir('/faturas', 'Abrir Emissão e cobrança'), ver('/carteira', 'Antes: gerar o mês')],
    camada: null,
    telas: ['/faturas'],
    /* «como emito» SOZINHO saiu: ele casava frase inteira com «como emito
     * boleto», que e do assunto de baixo, e os dois empatavam em pontos — o
     * desempate caia na ordem alfabetica do id, que nao e resposta. */
    termos: ['emitir', 'emitir fatura', 'emitir em lote', 'fechar a fatura', 'emitir as faturas',
             'como emito a fatura'],
  },
  {
    id: 'gerar-boleto',
    pergunta: 'Cadê o boleto? Como gero o boleto de uma fatura?',
    resposta: 'Na linha da fatura, na aba Emissão e cobrança, depois de emitida. O botão só funciona '
      + 'com a conexão do banco configurada; sem ela, dá para cobrar por Pix ou importar um boleto '
      + 'emitido no site do banco.',
    passos: [
      'Abra a aba Emissão e cobrança e ache a fatura.',
      'Emita a fatura, se ela ainda estiver em rascunho.',
      'Clique em gerar o boleto na linha dela.',
      'Não funcionou? Confira a aba Conector Sicoob: sem a credencial cadastrada o sistema não emite sozinho.',
    ],
    caminhos: [
      ir('/faturas', 'Abrir Emissão e cobrança'),
      ver('/cobranca', 'Conferir a conexão com o banco'),
    ],
    camada: null,
    telas: ['/faturas'],
    comum: true,
    termos: ['boleto', 'cade o boleto', 'gerar boleto', 'emitir boleto', 'emito boleto',
             'codigo de barras', 'linha digitavel', 'boleto nao sai', 'segunda via', 'nao emite boleto'],
  },
  {
    id: 'importar-boleto',
    pergunta: 'Emiti o boleto no site do banco. Como registro aqui?',
    resposta: 'Na linha da fatura, colando a linha digitável. O sistema confere o valor e a data '
      + 'dentro do próprio código antes de aceitar — se não bater com a fatura, ele recusa.',
    passos: [
      'Abra a aba Emissão e cobrança e ache a fatura.',
      'Cole a linha digitável do boleto no campo da linha.',
      'Clique em conferir: o sistema lê o valor e o vencimento de dentro do código.',
      'Se bater, importe. Se não bater, ele diz o que está diferente.',
    ],
    caminhos: [ir('/faturas', 'Abrir Emissão e cobrança')],
    camada: null,
    telas: ['/faturas'],
    termos: ['importar boleto', 'boleto do banco', 'emiti no site do banco', 'colar linha digitavel',
             'boleto de fora', 'registrar boleto', 'boleto manual'],
  },
  {
    id: 'cobrar-por-pix',
    pergunta: 'Dá para cobrar por Pix?',
    resposta: 'Dá, e independe da conexão com o banco. A fatura traz o código para copiar e mandar '
      + 'ao cliente.',
    passos: [
      'Abra a aba Emissão e cobrança e ache a fatura emitida.',
      'Copie o código de pagamento na linha dela — o botão de copiar evita errar um dígito.',
      'Mande ao cliente. Quando ele pagar, dê baixa na mesma linha.',
    ],
    caminhos: [ir('/faturas', 'Abrir Emissão e cobrança')],
    camada: null,
    telas: ['/faturas'],
    termos: ['pix', 'cobrar por pix', 'qr code', 'codigo pix', 'copia e cola', 'chave pix da empresa'],
  },
  {
    id: 'cliente-pagou',
    pergunta: 'O cliente pagou. Como dou baixa?',
    resposta: 'Na aba Emissão e cobrança, na linha da própria fatura. É a baixa que dispara a '
      + 'divisão do dinheiro: a parte do dono da usina e a comissão de quem indicou nascem dela.',
    passos: [
      'Abra a aba Emissão e cobrança.',
      'Encontre a fatura do cliente.',
      'Clique em «Registrar pagamento» na linha dela.',
      'O que a empresa passa a dever aparece sozinho na aba Contas a pagar.',
    ],
    caminhos: [ir('/faturas', 'Abrir Emissão e cobrança'), ver('/contas-a-pagar', 'Depois: o que a empresa deve')],
    camada: null,
    telas: ['/faturas'],
    comum: true,
    termos: ['pagou', 'dar baixa', 'baixa', 'recebido', 'quitar', 'marcar como pago', 'pagamento',
             'cliente pagou', 'confirmar pagamento', 'caiu na conta'],
  },
  {
    id: 'valor-errado',
    pergunta: 'A fatura saiu com o valor errado. O que faço?',
    resposta: 'O valor nasce de três coisas: a energia gerada no mês, a fatia daquele cliente e o '
      + 'preço do kWh da unidade dele. Conferir as três costuma achar o erro.',
    passos: [
      'Confira o preço do kWh na linha da unidade, na aba Unidades consumidoras.',
      'Confira a fatia em percentual da mesma unidade.',
      'Confira a energia gerada do mês na aba Usinas — ela vem do CRM.',
      'Corrigido o cadastro, gere o mês de novo na aba Faturamento.',
    ],
    caminhos: [
      ir('/unidades', 'Conferir preço do kWh e fatia'),
      ver('/usinas', 'Conferir a energia do mês'),
      ver('/carteira', 'Gerar o mês de novo'),
    ],
    camada: null,
    telas: ['/faturas'],
    termos: ['valor errado', 'conta errada', 'valor alto', 'valor baixo', 'calculo errado',
             'fatura errada', 'desconto errado', 'valor nao bate'],
  },

  // =========================================================== o que sai
  {
    id: 'pagar-dono',
    pergunta: 'Quando e como pago o dono da usina?',
    resposta: 'A parte dele nasce sozinha quando um cliente paga, e vai para a aba Contas a pagar. '
      + 'É lá que se registra a quitação.',
    passos: [
      'Dê baixa na fatura do cliente, na aba Emissão e cobrança — é isso que cria o que a empresa deve.',
      'Abra a aba Contas a pagar.',
      'Confira a linha e registre o pagamento.',
    ],
    caminhos: [ir('/contas-a-pagar', 'Abrir Contas a pagar'), ver('/faturas', 'Antes: dar baixa na fatura')],
    camada: null,
    telas: ['/contas-a-pagar'],
    termos: ['pagar o dono', 'quando pago o dono', 'repasse ao dono', 'contas a pagar', 'a pagar',
             'quitar o repasse', 'o que a empresa deve', 'saida de dinheiro', 'pagar'],
  },
  {
    id: 'despesa-avulsa',
    pergunta: 'Como lanço uma despesa da empresa?',
    resposta: 'Na aba Contas a pagar tem um cadastro de conta avulsa, para o que não nasce de uma '
      + 'fatura — a conta da concessionária e as despesas do dia a dia.',
    passos: [
      'Abra a aba Contas a pagar.',
      'Use o cadastro de conta nova.',
      'Preencha o que é, para quem, o valor e o vencimento.',
    ],
    caminhos: [ir('/contas-a-pagar', 'Abrir Contas a pagar')],
    camada: null,
    telas: ['/contas-a-pagar'],
    termos: ['despesa', 'conta avulsa', 'lancar despesa', 'conta de energia da empresa',
             'concessionaria', 'gasto', 'nova conta a pagar'],
  },

  // ============================================== a folha que o cliente recebe
  {
    id: 'fatura-unificada',
    pergunta: 'Que papel o cliente recebe? Onde eu monto isso?',
    resposta: 'Na aba Fatura unificada. Ela junta a conta da distribuidora com a cobrança da G3 numa '
      + 'folha só — e não cria fatura nem cobra ninguém: isso é Faturamento e Emissão e cobrança.',
    passos: [
      'Abra a aba Fatura unificada.',
      'Suba a conta de energia daquele cliente.',
      'Confira os dados lidos e emita a folha.',
    ],
    caminhos: [
      ir('/documento', 'Abrir Fatura unificada'),
      ver('/faturas', 'A cobrança em si fica aqui'),
    ],
    camada: null,
    telas: ['/documento'],
    termos: ['fatura unificada', 'folha do cliente', 'papel que o cliente recebe', 'documento',
             'imprimir a fatura', 'mandar a fatura', 'juntar as contas', 'conta da distribuidora',
             'equatorial'],
  },
  {
    id: 'identidade-da-empresa',
    pergunta: 'Como coloco o logotipo e os dados da empresa na fatura?',
    resposta: 'No cadastro do emissor, na aba Fatura unificada. É de lá que saem o nome, o '
      + 'documento, o logotipo e a chave de pagamento impressos na folha.',
    passos: [
      'Abra a aba Fatura unificada.',
      'Vá ao cadastro do emissor.',
      'Preencha os dados da empresa, suba o logotipo e cadastre a chave de pagamento.',
      'Grave e emita uma folha para conferir como ficou.',
    ],
    caminhos: [ir('/documento', 'Abrir o cadastro do emissor')],
    camada: null,
    telas: ['/documento'],
    termos: ['logotipo', 'logo', 'dados da empresa', 'emissor', 'cabecalho da fatura', 'marca',
             'nome da empresa na fatura', 'chave de pagamento'],
  },

  // ================================================================ conferir
  {
    id: 'quanto-entrou',
    pergunta: 'Onde vejo quanto entrou e quanto a empresa tem a pagar?',
    resposta: 'Na aba Relatórios: quanto cabe a cada dono de usina, quanto sai para quem trouxe os '
      + 'clientes e quanto de cada usina foi usado. Sem escolher mês, mostra o histórico inteiro.',
    passos: [
      'Abra a aba Relatórios.',
      'Deixe o mês vazio para ver tudo, ou escolha um mês para recortar.',
      'Os números do mês corrente também aparecem no alto da aba Faturamento.',
    ],
    caminhos: [ir('/relatorios', 'Abrir Relatórios'), ver('/carteira', 'Ver o resumo do mês')],
    camada: null,
    telas: ['/relatorios'],
    comum: true,
    termos: ['relatorio', 'quanto entrou', 'quanto recebi', 'quanto a empresa deve', 'total do mes',
             'historico', 'conferir os numeros', 'fechamento', 'uso da usina', 'quanto faturei'],
  },
  {
    id: 'exportar',
    pergunta: 'Como levo esses números para uma planilha?',
    resposta: 'As telas de lista têm um botão que salva o que está na tela em arquivo de planilha — '
      + 'e ele respeita o filtro: o que estiver escondido não vai junto.',
    passos: [
      'Abra a tela que tem a lista: Relatórios, Contas a pagar ou Emissão e cobrança.',
      'Deixe na tela só o que você quer levar — o arquivo sai igual ao que está visível.',
      'Use o botão de salvar em planilha.',
    ],
    caminhos: [
      ir('/relatorios', 'Abrir Relatórios'),
      ver('/contas-a-pagar', 'Abrir Contas a pagar'),
      ver('/faturas', 'Abrir Emissão e cobrança'),
    ],
    camada: null,
    telas: ['/relatorios'],
    termos: ['exportar', 'planilha', 'excel', 'salvar a lista', 'levar para planilha', 'arquivo',
             'gerar planilha', 'tirar da tela'],
  },

  // ============================================================ transversais
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
    caminhos: [ir('/clientes', 'Abrir Clientes'), ver('/unidades', 'Abrir Unidades consumidoras')],
    camada: null,
    telas: ['/clientes', '/unidades'],
    termos: ['nao aparece', 'sumiu', 'nao encontro', 'cade o cliente', 'lista vazia', 'nao acho',
             'faltando cliente', 'nao esta na lista', 'lista curta'],
  },
  {
    id: 'trocar-empresa',
    pergunta: 'Como troco de empresa?',
    resposta: 'No seletor do canto superior direito. Todas as telas mostram os dados de uma empresa '
      + 'só por vez.',
    passos: [
      'Clique no nome da empresa, no alto à direita.',
      'Escolha a outra empresa na lista.',
      'Confira em Pendências: o que falta é contado por empresa, e muda junto.',
    ],
    caminhos: [ir('/pendencias', 'Ver o que falta nesta empresa')],
    camada: null,
    telas: [],
    termos: ['trocar empresa', 'mudar empresa', 'outra empresa', 'tenant', 'empresa errada',
             'dados errados', 'nao e minha empresa', 'cnpj errado no alto'],
  },
  {
    id: 'deu-erro',
    pergunta: 'Apareceu uma faixa vermelha de erro. E agora?',
    resposta: 'A faixa vermelha diz o que o sistema recusou e por quê — quase sempre é um cadastro '
      + 'faltando, não uma falha. Ler a frase inteira costuma dar o próximo passo.',
    passos: [
      'Leia a frase da faixa: ela nomeia o que faltou.',
      'Abra a aba Pendências e procure a linha correspondente.',
      'Se a mensagem falar de sessão ou de credencial, saia e entre de novo pelo menu da conta.',
      'Se ela voltar sempre igual depois disso, avise o responsável técnico com a frase copiada.',
    ],
    caminhos: [ir('/pendencias', 'Ver o que falta')],
    camada: null,
    telas: [],
    termos: ['erro', 'faixa vermelha', 'mensagem de erro', 'deu erro', 'nao funciona', 'quebrou',
             'travou', 'nao carrega', 'tela em branco', 'recusou'],
  },
  {
    id: 'sessao-caiu',
    pergunta: 'O sistema me desconectou e pede login de novo.',
    resposta: 'A sessão vence sozinha depois de um tempo aberta. Entrar de novo resolve — e o que já '
      + 'tinha sido gravado continua gravado.',
    passos: [
      'Entre de novo com o mesmo e-mail e senha.',
      'Se a tela insistir no erro sem voltar ao login, saia pelo menu da conta e entre outra vez.',
      'O que estava digitado e ainda não gravado se perde; o que foi gravado, não.',
    ],
    caminhos: [ir('/pendencias', 'Voltar ao começo')],
    camada: null,
    telas: [],
    termos: ['desconectou', 'caiu a sessao', 'pede login', 'expirou', 'credencial invalida',
             'sair e entrar', 'senha', 'nao consigo entrar', 'deslogou'],
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
 * vazio é `responder`, que tem mais contexto. Uma lista de consolo montada aqui
 * apareceria idêntica nos dois casos.
 */
export function buscar(consulta: string, base: readonly Topico[] = TOPICOS): Achado[] {
  const alvo = normalizar(consulta);
  if (alvo.length < 2) return [];
  const alvoF = emFrase(consulta);
  const ps = palavras(consulta);

  const achados: Achado[] = [];
  for (const topico of base) {
    let pontos = 0;
    let frase = false;

    for (const t of topico.termos) {
      /*
       * FRASE INTEIRA, e nos DOIS sentidos: a busca dentro do termo (quem digita
       * «boleto» acha «cade o boleto») ou o termo dentro da busca (quem digita
       * «nao consigo cobrar hoje» acha «nao consigo cobrar»).
       *
       * A COMPARACAO E POR PALAVRA e nao por pedaco de texto — ver `emFrase`. A
       * versao por pedaco casava «baixa» com «baixar a lista», e o resultado
       * errado chega sob o titulo «Isto responde», que e pior que vazio.
       */
      const tf = emFrase(t);
      if (tf.includes(alvoF) || alvoF.includes(tf)) { pontos += PESO.frase; frase = true; break; }
    }

    const nosTermos = new Set(topico.termos.flatMap((t) => palavras(t)));
    const naPergunta = new Set(palavras(topico.pergunta));
    const noCorpo = new Set([topico.resposta, ...topico.passos].flatMap((t) => palavras(t)));

    /*
     * A PERGUNTA PONTUA, MAS NÃO SERVE DE PROVA — e a distinção foi medida em
     * 21/08, quando a base dobrou de tamanho.
     *
     * «onde ficam as usinas» caía em «Onde vejo quanto entrou e quanto a empresa
     * tem a pagar?»: duas palavras casadas, logo forte. Só que UMA delas era
     * «onde», que aparece no título de meia dúzia de assuntos porque título é
     * prosa, e prosa tem palavra de pergunta. A outra era «usina», vinda do termo
     * «uso da usina».
     *
     * Os `termos` foram escritos PARA CASAR; a pergunta foi escrita para ler.
     * Contar as duas como evidência transforma qualquer «onde…?» num casamento
     * de duas palavras. A pergunta segue somando pontos — ela ordena bem — e
     * deixou de abrir a porta.
     */
    let casadas = 0;
    for (const p of ps) {
      if (nosTermos.has(p)) { pontos += PESO.termo; casadas++; }
      if (naPergunta.has(p)) pontos += PESO.pergunta;
      if (noCorpo.has(p)) pontos += PESO.corpo;
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
 *  não ensina um caminho — mas o verbete agora também carrega um, para o
 *  «entendi a palavra, e agora?» não virar beco. */
export function buscarTermos(consulta: string): TermoDoGlossario[] {
  const alvo = normalizar(consulta);
  if (alvo.length < 2) return [];
  const alvoF = emFrase(consulta);
  const ps = palavras(consulta);

  return GLOSSARIO.filter((g) => {
    if (g.busca.some((b) => { const bf = emFrase(b); return bf.includes(alvoF) || alvoF.includes(bf); })) return true;
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
// A ÚLTIMA DEFESA: A TELA CITADA
// ============================================================================

/**
 * COMO CADA TELA É CHAMADA POR QUEM NÃO SABE O NOME DELA.
 *
 * Existe para a pergunta que não casa assunto nenhum ainda assim terminar num
 * clique: «onde ficam as usinas», «quero ver os donos», «abrir contas a pagar».
 * Nenhuma dessas é uma dúvida — é uma pessoa procurando uma tela —, e um painel
 * de ajuda que responde «não achei» a isso está devolvendo um beco.
 *
 * NÃO SUBSTITUI OS `termos` DOS TÓPICOS, e a diferença é de precisão: o tópico
 * responde COMO se faz; isto só abre a porta. Por isso só entra em cena quando
 * nada mais casou.
 */
export const PALAVRAS_DA_TELA: Record<string, readonly string[]> = {
  '/pendencias': ['pendencia', 'pendencias', 'o que falta', 'bloqueio', 'inicio', 'comeco', 'painel'],
  '/clientes': ['cliente', 'clientes', 'cadastro de cliente', 'quem paga', 'documento do cliente'],
  '/unidades': ['unidade', 'unidades', 'unidade consumidora', 'instalacao', 'ponto de luz',
                'conta de luz', 'numero da unidade'],
  '/contratos': ['contrato', 'contratos'],
  '/usinas': ['usina', 'usinas', 'geradora', 'geracao', 'energia gerada', 'producao'],
  '/donos': ['dono', 'donos', 'donos de usina', 'proprietario', 'chave pix do dono'],
  '/carteira': ['faturamento', 'faturar', 'gerar o mes', 'ensaio', 'compor', 'fechar o mes'],
  '/faturas': ['fatura', 'faturas', 'emissao e cobranca', 'boleto', 'cobranca do cliente', 'baixa',
               'emitir'],
  '/cobranca': ['sicoob', 'conector', 'banco', 'certificado', 'credencial do banco'],
  '/documento': ['fatura unificada', 'folha', 'documento do cliente', 'imprimir', 'logotipo',
                 'papel do cliente'],
  '/contas-a-pagar': ['contas a pagar', 'a pagar', 'despesa', 'o que a empresa deve', 'pagar'],
  '/relatorios': ['relatorio', 'relatorios', 'numeros', 'planilha', 'exportar', 'historico'],
};

/** O nome da tela como a barra de navegação a chama. Sem ele o botão diria
 *  «/contas-a-pagar», que é endereço e não nome. */
const tituloDaRota = (rota: string): string =>
  TELAS.find((t) => t.rota === rota)?.titulo ?? rota;

/**
 * AS TELAS QUE A PERGUNTA PARECE CITAR, da mais provável à menos.
 *
 * Frase inteira vale mais que palavra solta, pela mesma razão da busca de
 * tópicos. Devolve no máximo três: uma lista de doze telas é um menu, e a pessoa
 * já tem um na barra.
 */
export function telasCitadas(consulta: string): Caminho[] {
  const alvoF = emFrase(consulta);
  const ps = palavras(consulta);
  if (ps.length === 0) return [];

  const pontuadas: Array<{ rota: string; pontos: number }> = [];

  for (const [rota, apelidos] of Object.entries(PALAVRAS_DA_TELA)) {
    let pontos = 0;
    for (const a of apelidos) {
      const af = emFrase(a);
      if (af.includes(alvoF) || alvoF.includes(af)) pontos += PESO.frase;
    }
    const chaves = new Set(apelidos.flatMap((a) => palavras(a)));
    for (const p of ps) if (chaves.has(p)) pontos += PESO.termo;
    if (pontos > 0) pontuadas.push({ rota, pontos });
  }

  return pontuadas
    .sort((a, b) => b.pontos - a.pontos || a.rota.localeCompare(b.rota))
    .slice(0, 3)
    .map(({ rota }) => ver(rota, `Abrir ${tituloDaRota(rota)}`));
}

// ============================================================================
// A RESPOSTA — o único ponto de entrada, e o que garante a promessa
// ============================================================================

export type Resposta = {
  /** Os assuntos que casaram, do mais provável ao menos. */
  achados: Achado[];
  /** As palavras que a pergunta pediu para definir. */
  termos: TermoDoGlossario[];
  /** Para onde ir quando nada mais casou. NUNCA vem vazio num palpite: ou são as
   *  telas que a pergunta citou, ou a saída universal abaixo. */
  telas: Caminho[];
  /** Os assuntos do primeiro dia, oferecidos quando nada casou. */
  sugestoes: Topico[];
  /** Nada casou: a tela diz isso com todas as letras. Admitir é melhor que
   *  fingir — o que não pode é admitir e parar por aí. */
  palpite: boolean;
  /** As telas de `telas` foram RECONHECIDAS no texto da pergunta, e não são a
   *  saída universal. Muda a frase que as apresenta: «se você procurava uma
   *  tela» só é verdade quando de fato houve uma tela reconhecida. */
  citou: boolean;
};

/**
 * A SAÍDA UNIVERSAL — o clique que existe quando nenhum outro existe.
 *
 * É sempre Pendências, e não por falta de ideia melhor: aquela tela foi
 * construída para exatamente esta pessoa, a que não sabe o que fazer a seguir.
 * Ela diz o que falta, em ordem, com o caminho de cada coisa. Mandar para a
 * primeira tela da barra seria arbitrário; mandar para cá é a resposta.
 */
const SAIDA: Caminho = { rota: '/pendencias', rotulo: 'Ver o que falta neste mês', tipo: 'ver' };

/**
 * A RESPOSTA A UMA PERGUNTA QUALQUER — e ela NUNCA vem sem uma tela.
 *
 * É este o ponto onde a promessa do dono («sempre devolver o possível link de
 * rota») deixa de ser intenção: `caminhosDaResposta` achata tudo o que a
 * resposta oferece, e a suíte roda um banco de perguntas selvagens exigindo que
 * a lista jamais saia vazia.
 */
export function responder(consulta: string): Resposta {
  const achados = buscar(consulta);
  const termos = buscarTermos(consulta);
  if (achados.length > 0 || termos.length > 0) {
    return { achados, termos, telas: [], sugestoes: [], palpite: false, citou: false };
  }
  const citadas = telasCitadas(consulta);
  return {
    achados: [], termos: [],
    // «asdfgh» nao cita tela nenhuma, e mesmo assim tem de terminar em algum
    // lugar. E aqui que a promessa deixa de depender do acaso do casamento.
    telas: citadas.length > 0 ? citadas : [SAIDA],
    sugestoes: topicosComuns(),
    palpite: true,
    citou: citadas.length > 0,
  };
}

/** TODOS os caminhos que uma resposta oferece, sem repetir rota. É o que a suíte
 *  mede, e o que a tela desenha. */
export function caminhosDaResposta(r: Resposta): Caminho[] {
  const todos = [
    ...r.achados.flatMap((a) => a.topico.caminhos),
    ...r.termos.flatMap((t) => t.caminhos),
    ...r.telas,
    ...r.sugestoes.flatMap((t) => t.caminhos),
  ];
  const vistas = new Set<string>();
  return todos.filter((c) => (vistas.has(c.rota) ? false : (vistas.add(c.rota), true)));
}

// ============================================================================
// O ESTADO AO VIVO
// ============================================================================

/** O mínimo que `passosDoEstado` precisa saber de uma linha do relatório.
 *  Estrutural de propósito: o tipo de `api.ts` satisfaz isto sem que este módulo
 *  puro precise importar o cliente de rede. */
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
  /**
   * PARA ONDE IR. `resolver` quando a pendência tem tela de preenchimento;
   * `ver` quando não tem e o melhor que existe é a tela onde dá para olhar.
   *
   * Só é nulo para uma pendência que o servidor mandou e este front não conhece
   * — e mesmo essa aparece na lista, com o nome cru, porque sumir seria a ajuda
   * escondendo um bloqueio real.
   */
  caminho: Caminho | null;
  /** O tópico que explica isso com passos, quando existe. */
  topico: Topico | null;
};

/**
 * O QUE ESTÁ TRAVANDO AGORA, em ordem de trabalho e em português.
 *
 * A ORDEM É A DO SERVIDOR e não uma reordenação por gravidade: o relatório já
 * vem na ordem em que fechar a de cima torna a de baixo mensurável, e embaralhar
 * isso mandaria a pessoa preencher o que ainda não dá para preencher.
 *
 * `nao_medido` ENTRA NA LISTA junto com `pendente`, e é a mesma decisão que a
 * tela de Pendências já toma ao desenhar link para as duas: universo vazio quase
 * sempre se destrava uma linha acima, e esconder isso deixaria a pessoa achando
 * que aquela está resolvida.
 */
export function passosDoEstado(camadas: readonly CamadaLida[]): PassoDoEstado[] {
  const passos: PassoDoEstado[] = [];

  for (const c of camadas) {
    if (c.situacao === 'ok') continue;

    const v = VERBETE_DA_CAMADA[c.camada];
    const d = DESTINO_DA_CAMADA[c.camada];
    const titulo = v?.titulo ?? c.camada;
    const endereco = d ? enderecoDoDestino(d) : null;
    const topico = TOPICOS.find((t) => t.camada === c.camada) ?? null;

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
      /*
       * A TELA DE PREENCHIMENTO PRIMEIRO; o `ver` do tópico como reserva.
       *
       * A reserva é a novidade de 21/08 e existe para as duas pendências sem
       * tela — energia gerada e valor da comissão. Elas terminavam sem link
       * nenhum, o que era verdadeiro e inútil: a pessoa lia «faltam 4» e não
       * tinha para onde ir olhar. Agora vão para onde aquilo APARECE, com o
       * rótulo dizendo que ali se olha.
       */
      caminho: endereco
        ? { rota: endereco, rotulo: 'Resolver', tipo: 'resolver' }
        : topico?.caminhos[0] ?? null,
      topico,
    });
  }

  return passos;
}

/** Só o que impede COBRAR — a pergunta que mais vai ser feita amanhã. */
export const travamCobranca = (p: readonly PassoDoEstado[]): PassoDoEstado[] =>
  p.filter((x) => x.efeito === 'bloqueia_fatura');
