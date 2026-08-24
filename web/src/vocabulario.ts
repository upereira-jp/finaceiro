// O VOCABULÁRIO DA TELA — o nome que a PESSOA lê, separado do nome que o
// SISTEMA usa.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE
//
// A tabela de Pendências mostrava o nome da coluna do banco, capitalizado por
// `rotulo()`: «Documento do cliente», «Cobranca sicoob», «Tarifa da uc». Isso
// funciona para quem escreveu o schema e falha para quem abre o sistema pela
// primeira vez — e a partir de 22/08/2026 quem abre são usuários novos, sem
// ninguém do lado para explicar (não há divisão de suporte).
//
// A mesma tela dizia ainda «Split», que a própria `GLOSSARIO.md` proíbe usar
// sozinho, e trazia do servidor frases como «a R9 (`podeAtivarContrato`)
// recusa» — precisas para o dev, ilegíveis para quem opera.
//
// O PRINCÍPIO NÃO É NOVO NESTE PROJETO, e é o que torna esta separação legítima
// em vez de uma segunda fonte de verdade. `navegacao.ts` já o escreve:
//
//   > «Rótulo é o que a pessoa lê; domínio é o que o sistema é. Foi assim que
//   >  "Prontidão" virou "Pendências" em 30/07 sem mover uma linha de
//   >  repos/prontidao.ts.»
//
// Aqui é o mesmo ato, aplicado às camadas em vez de à aba. O servidor continua
// devolvendo `documento_do_cliente` com a explicação de engenharia; o `explicacao`
// dele NÃO é jogado fora — vira «detalhe técnico», atrás de um toggle, por
// decisão do dono em 21/08: quem precisa dos códigos de questão e dos comandos
// em lote continua com eles a um clique.
//
// ISTO É `.ts` PURO E FORA DO `.tsx` PELO MOTIVO DE SEMPRE: o runner do `web/` é
// `node --experimental-strip-types`, que não lê JSX. Regra 8 — invariante sem
// teste é comentário. A suíte confere que toda camada do servidor tem verbete
// aqui, lendo o arquivo do servidor, do mesmo jeito que `destino-da-camada.ts`
// já faz.

/** O verbete de uma camada da prontidão, em português de quem opera. */
export type Verbete = {
  /** O nome curto, como apareceria numa conversa. Não é o nome da coluna. */
  titulo: string;
  /** UMA frase dizendo o que falta. Sem sigla, sem nome de função, sem código
   *  de questão — esses vivem no `explicacao` que o servidor manda. */
  simples: string;
  /** O que acontece enquanto isso não for feito. É a consequência, e é ela que
   *  responde «posso deixar para depois?». */
  consequencia: string;
};

/**
 * CAMADA -> COMO SE DIZ ISSO EM PORTUGUÊS.
 *
 * As chaves são as de `src/repos/prontidao.ts`. Camada nova no servidor sem
 * verbete aqui FALHA na suíte, em vez de aparecer na tela com o nome da coluna.
 *
 * A ORDEM É A DA PRONTIDÃO, que é a ordem do trabalho.
 */
export const VERBETE_DA_CAMADA: Record<string, Verbete> = {
  documento_do_cliente: {
    titulo: 'CPF ou CNPJ do cliente',
    simples: 'Tem cliente sem o CPF ou o CNPJ confirmado aqui no sistema.',
    consequencia: 'Sem esse número conferido, o contrato dele não pode ser ativado — e sem contrato '
      + 'ativo não existe cobrança para enviar.',
  },

  contrato_ativo: {
    titulo: 'Contrato ativo',
    simples: 'Tem unidade de cliente sem contrato ativo no sistema.',
    consequencia: 'A cobrança nasce do contrato. Sem ele, essa unidade fica de fora do mês inteiro.',
  },

  rateio: {
    titulo: 'Usina e fatia do cliente',
    simples: 'Tem unidade sem usina ligada a ela, ou sem a fatia (o percentual) que cabe ao cliente.',
    consequencia: 'É a fatia que diz quanta energia daquela usina é desse cliente. Sem ela não há '
      + 'como calcular o desconto, e a conta não fecha.',
  },

  geracao_da_competencia: {
    titulo: 'Energia gerada no mês',
    simples: 'Tem usina que ainda não teve a energia deste mês lançada.',
    consequencia: 'A conta do cliente parte da energia que a usina produziu. Sem esse número, o mês '
      + 'não pode ser calculado.',
  },

  conta_lida_da_competencia: {
    titulo: 'Conta da distribuidora do mês',
    simples: 'Tem unidade sem a conta da distribuidora lida e registrada neste mês.',
    consequencia: 'É dessa conta que sai o valor a cobrar. Sem ela registrada, a cobrança do mês '
      + 'não tem de onde nascer.',
  },

  vencimento: {
    titulo: 'Dia de vencimento',
    simples: 'Tem unidade cuja conta do mês veio sem a data de vencimento e que também não tem o '
      + 'dia preenchido no cadastro.',
    consequencia: 'Quando a conta traz a data, ela vale e não há nada a preencher. Quando não '
      + 'traz, o dia do cadastro é o que salva a cobrança — e o sistema não escolhe uma data por '
      + 'você.',
  },

  tarifa_na_conta: {
    titulo: 'Preço do kWh na conta lida',
    simples: 'Tem conta lida em que o preço do kWh ficou zerado.',
    consequencia: 'É por esse preço que a energia vira dinheiro na folha do cliente. Zerado, a '
      + 'cobrança sairia dizendo que o kWh não custa nada — por isso ela é recusada.',
  },

  dono_da_usina: {
    titulo: 'Dono da usina',
    simples: 'Tem usina sem dono cadastrado.',
    consequencia: 'Dá para cobrar o cliente normalmente. O que trava é depois: quando o dinheiro '
      + 'entrar, não há para quem repassar a parte do dono.',
  },

  regra_de_repasse: {
    titulo: 'Quanto o dono da usina recebe',
    simples: 'Tem usina sem o percentual de repasse valendo para este mês.',
    consequencia: 'Dá para cobrar. O que trava é a divisão do dinheiro que entrar — sem o '
      + 'percentual, o sistema não sabe quanto é do dono.',
  },

  originador_do_contrato: {
    titulo: 'Quem trouxe o cliente',
    simples: 'Tem contrato ativo sem a indicação de quem trouxe aquele cliente.',
    consequencia: 'Dá para cobrar. O que trava é a comissão: sem saber quem indicou, não há a quem '
      + 'pagar quando o dinheiro entrar.',
  },

  regra_de_comissao: {
    titulo: 'Valor da comissão',
    simples: 'Tem contrato cuja comissão ainda não tem valor definido para a data em que foi fechado.',
    consequencia: 'Dá para cobrar. A comissão é que não pode ser calculada quando o dinheiro entrar.',
  },

  cobranca_sicoob: {
    titulo: 'Conexão com o banco',
    simples: 'A conexão com o Sicoob ainda não está configurada.',
    consequencia: 'A cobrança até existe e pode ser paga por Pix, e um boleto emitido no site do '
      + 'banco pode ser importado aqui. O que não dá é o sistema emitir o boleto sozinho.',
  },
};

/**
 * O EFEITO, em consequência e não em rótulo de coluna.
 *
 * A tela mostrava «Fatura» e «Split». A primeira palavra não diz o que acontece
 * e a segunda a `GLOSSARIO.md` proíbe usar sozinha — «a reforma tributária
 * introduziu o *split payment*: são conceitos diferentes com o mesmo apelido».
 */
export const EFEITO: Record<string, { curto: string; longo: string }> = {
  bloqueia_fatura: {
    curto: 'Impede cobrar',
    longo: 'Enquanto isso faltar, a cobrança deste mês não pode ser gerada.',
  },
  bloqueia_split: {
    curto: 'Impede dividir o dinheiro',
    longo: 'Dá para cobrar o cliente normalmente. O que fica travado é a divisão do dinheiro '
      + 'quando ele entrar — a parte do dono da usina e a comissão de quem indicou.',
  },
};

/**
 * A SITUAÇÃO, em palavra de gente.
 *
 * `nao_medido` é o caso que mais confunde, e ele já era pintado de amarelo por
 * um defeito real achado em 28/07: «0 de 0» em verde seria o relatório
 * autorizando o que não conferiu. A palavra agora diz a mesma coisa que a cor.
 */
export const SITUACAO: Record<string, { curto: string; longo: string }> = {
  ok: { curto: 'Pronto', longo: 'Nada a fazer aqui.' },
  pendente: { curto: 'Falta preencher', longo: 'Tem coisa faltando nesta linha.' },
  nao_medido: {
    curto: 'Ainda não dá para conferir',
    longo: 'Não é o mesmo que «pronto». Esta conferência depende de algo da linha de cima, que '
      + 'ainda está vazio — então não há o que medir. Resolva a de cima e esta passa a mostrar '
      + 'um número de verdade.',
  },
};

/**
 * O GLOSSÁRIO DE TELA — as palavras que o sistema usa e que ninguém é obrigado
 * a saber no primeiro dia.
 *
 * NÃO É A `GLOSSARIO.md`, e a diferença importa: aquela define o termo para quem
 * escreve spec e código («cliente — uma pessoa ou empresa espelhada de `leads`
 * do CRM, com chave `crm_lead_id`»). Esta explica para quem vai clicar.
 *
 * `busca` são as palavras que a pessoa digitaria procurando por isso — inclusive
 * as erradas. «luz», «conta de luz» e «energia» levam a unidade consumidora
 * porque é assim que se fala, e não porque seja o nome certo.
 */
export type TermoDoGlossario = {
  termo: string;
  /** A explicação, sem depender de outro termo do próprio glossário. */
  texto: string;
  busca: string[];
  /**
   * ONDE ISSO APARECE NA TELA — ao menos um, sempre.
   *
   * Acrescentado em 21/08/2026, com o pedido de que a central *«sempre devolva o
   * possível link de rota»*. Antes, quem buscasse «rateio» recebia a definição e
   * parava ali: entendia a palavra e continuava sem saber onde mexer nela. Uma
   * definição sem endereço é meio caminho, e meio caminho num sistema sem
   * suporte é a pessoa perguntando a próxima coisa a ninguém.
   *
   * O tipo é o mesmo `Caminho` de `ajuda.ts`, mas escrito aqui como literal para
   * este módulo não importar aquele — a dependência corre no sentido contrário,
   * e invertê-la faria um ciclo.
   */
  caminhos: ReadonlyArray<{ rota: string; rotulo: string; tipo: 'resolver' | 'ver' }>;
};

export const GLOSSARIO: readonly TermoDoGlossario[] = [
  {
    termo: 'Unidade consumidora (UC)',
    texto: 'É o ponto de luz do cliente — a casa, a loja, a fábrica. Cada uma tem um número, que '
      + 'vem impresso na conta de energia. Um mesmo cliente pode ter mais de uma.',
    busca: ['uc', 'unidade', 'unidade consumidora', 'ponto de luz', 'conta de luz', 'energia',
            'numero da conta', 'instalacao', 'imovel', 'casa', 'loja'],
    caminhos: [{ rota: '/unidades', rotulo: 'Ver as unidades', tipo: 'ver' }],
  },
  {
    termo: 'Mês de referência',
    texto: 'O mês a que a cobrança se refere. A conta de agosto cobra a energia de agosto, mesmo '
      + 'que ela seja paga em setembro. No sistema aparece como «competência» em alguns lugares.',
    busca: ['mes', 'mes de referencia', 'competencia', 'periodo', 'qual mes', 'mes errado'],
    caminhos: [{ rota: '/pendencias', rotulo: 'Escolher o mês em Pendências', tipo: 'ver' }],
  },
  {
    termo: 'Fatia do cliente (rateio)',
    texto: 'A parte da energia de uma usina que é daquele cliente, em percentual. É o que permite '
      + 'calcular o desconto dele no fim do mês.',
    busca: ['rateio', 'fatia', 'percentual', 'porcentagem', 'divisao da usina', 'quanto e do cliente'],
    caminhos: [{ rota: '/unidades?pendencia=sem_usina', rotulo: 'Preencher a fatia', tipo: 'resolver' }],
  },
  {
    termo: 'Repasse ao dono da usina',
    texto: 'Quando o cliente paga, o dinheiro é dividido: uma parte vai para o dono da usina, uma '
      + 'para quem trouxe o cliente e o resto fica com a G3. Essa divisão é o repasse.',
    busca: ['repasse', 'split', 'divisao', 'dividir o dinheiro', 'quanto o dono recebe',
            'pagar o dono', 'reparticao', 'repartir'],
    caminhos: [
      { rota: '/usinas', rotulo: 'Definir o percentual do dono', tipo: 'resolver' },
      { rota: '/contas-a-pagar', rotulo: 'Ver o que já é devido', tipo: 'ver' },
    ],
  },
  {
    termo: 'Quem trouxe o cliente (originador)',
    texto: 'A pessoa ou parceiro que indicou aquele cliente e recebe comissão por isso. Fica '
      + 'gravado no contrato e não muda depois que o contrato é criado.',
    busca: ['originador', 'quem trouxe', 'indicacao', 'indicou', 'comissao', 'parceiro', 'vendedor'],
    caminhos: [{ rota: '/contratos', rotulo: 'Ver nos contratos', tipo: 'ver' }],
  },
  {
    termo: 'Preço do kWh (tarifa)',
    texto: 'Quanto custa cada kWh de energia daquela unidade. Varia de cliente para cliente. Na '
      + 'cobrança de hoje o preço que vale é o lido na conta da distribuidora; o preço da aba '
      + 'Unidades consumidoras serve o caminho antigo, e continua sendo semeado sozinho.',
    busca: ['tarifa', 'preco do kwh', 'kwh', 'valor da energia', 'preco da energia', 'quanto custa'],
    caminhos: [{ rota: '/documento', rotulo: 'Conferir o preço na conta lida', tipo: 'resolver' },
               { rota: '/unidades?pendencia=sem_tarifa', rotulo: 'Ver o preço no cadastro', tipo: 'ver' }],
  },
  {
    termo: 'Pendências',
    texto: 'A lista do que está faltando para o mês poder ser cobrado. Cada linha diz quantos faltam '
      + 'de quantos, quem preenche e onde. Vermelho impede cobrar; laranja impede dividir o dinheiro '
      + 'depois; amarelo é o que ainda não dá para conferir.',
    busca: ['pendencia', 'pendencias', 'o que falta', 'lista', 'checklist', 'vermelho', 'laranja',
            'cores', 'status', 'painel'],
    caminhos: [{ rota: '/pendencias', rotulo: 'Abrir Pendências', tipo: 'resolver' }],
  },
  {
    termo: 'Geração do mês',
    texto: 'Quanta energia a usina produziu naquele mês. É lançada no outro sistema, o do comercial, e '
      + 'chega aqui sozinha — não se digita aqui. Sem ela, o mês daquela usina não pode ser cobrado.',
    busca: ['geracao', 'energia gerada', 'producao', 'kwh gerado', 'quanto a usina gerou',
            'medicao', 'energia do mes'],
    caminhos: [{ rota: '/usinas', rotulo: 'Ver o que já chegou de cada usina', tipo: 'ver' }],
  },
  {
    termo: 'Desconto do cliente',
    texto: 'O quanto o cliente deixa de pagar por usar a energia da usina em vez da energia da '
      + 'distribuidora. Sai da conta que ele já recebe, e é impresso na folha dele. A parte da '
      + 'distribuidora não tem desconto: ela é repassada como veio.',
    busca: ['desconto', 'economia', 'quanto economiza', 'porcentagem', 'abatimento', 'quanto ele paga'],
    caminhos: [{ rota: '/documento', rotulo: 'Abrir a leitura da conta', tipo: 'ver' }],
  },
  {
    termo: 'Contrato ativo',
    texto: 'O contrato precisa estar ativo para a unidade ser cobrada. Ele só ativa depois que o '
      + 'CPF ou CNPJ do cliente estiver confirmado aqui no sistema.',
    busca: ['contrato', 'contrato ativo', 'ativar contrato', 'rascunho', 'nao ativa'],
    caminhos: [{ rota: '/contratos', rotulo: 'Abrir Contratos', tipo: 'resolver' }],
  },
  {
    termo: 'Documento confirmado',
    texto: 'Um CPF ou CNPJ que veio do CRM entra aqui como sugestão, não como confirmado — mesmo '
      + 'estando certo. Alguém precisa reenviar o número na aba Clientes para ele passar a valer. '
      + 'É esse ato que libera o contrato.',
    busca: ['documento', 'cpf', 'cnpj', 'confirmar documento', 'validar', 'nao vale',
            'documento do crm', 'sugestao'],
    caminhos: [{ rota: '/clientes?pendencia=nao_validado', rotulo: 'Confirmar o documento', tipo: 'resolver' }],
  },
  {
    termo: 'Ensaio',
    texto: 'A simulação do faturamento: mostra quem entraria no mês e quem ficaria de fora, com o '
      + 'motivo de cada recusa, e não grava nada. Na aba Faturamento é o botão «Simular, sem '
      + 'cobrar ninguém» — clicar quantas vezes quiser não cobra ninguém.',
    /* «ensaio» continua na busca embora tenha saído do botão: quem ouviu a
     * palavra numa conversa vai digitá-la, e é para isso que o verbete serve. */
    busca: ['ensaio', 'simular', 'simulacao', 'teste', 'ensaiar', 'sem gravar', 'sem valer'],
    caminhos: [{ rota: '/carteira', rotulo: 'Abrir Faturamento', tipo: 'resolver' }],
  },
  {
    termo: 'Baixa',
    texto: 'Registrar que o cliente pagou aquela fatura. É o ato que dispara a divisão do dinheiro: '
      + 'a parte do dono da usina e a comissão de quem indicou só nascem depois dele.',
    /* «pagou» e «recebido» ficam DE FORA, e não por descuido: o assunto «O
     * cliente pagou. Como dou baixa?» já responde a essas duas com passos, e um
     * verbete que casa a mesma frase apareceria embaixo dele definindo o que a
     * resposta acabou de explicar. O glossário define a PALAVRA que alguém não
     * conhece; quem escreve «pagou» não está pedindo definição. */
    busca: ['baixa', 'dar baixa', 'baixar fatura', 'quitado', 'liquidar', 'baixa da fatura'],
    caminhos: [{ rota: '/faturas', rotulo: 'Dar baixa numa fatura', tipo: 'resolver' }],
  },
  {
    termo: 'Fatura unificada',
    texto: 'A folha que o cliente recebe, juntando a conta da distribuidora com a cobrança da G3 num '
      + 'papel só. Ela não cria a cobrança nem recebe dinheiro — só apresenta.',
    busca: ['fatura unificada', 'folha', 'papel do cliente', 'documento do cliente', 'unificada',
            'conta junta'],
    caminhos: [{ rota: '/documento', rotulo: 'Abrir Fatura unificada', tipo: 'resolver' }],
  },
  {
    termo: 'Empresa selecionada',
    texto: 'O sistema mostra os dados de uma empresa por vez, e o nome dela fica no alto à direita. '
      + 'Número que parece errado costuma ser a empresa errada escolhida ali.',
    busca: ['empresa', 'trocar empresa', 'tenant', 'qual empresa', 'empresa errada', 'razao social'],
    caminhos: [{ rota: '/pendencias', rotulo: 'Conferir o que falta nela', tipo: 'ver' }],
  },
];
