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

  vencimento: {
    titulo: 'Dia de vencimento',
    simples: 'Tem unidade sem o dia de vencimento preenchido.',
    consequencia: 'O sistema não escolhe uma data por você. Sem o dia, a cobrança não é gerada.',
  },

  tarifa_da_uc: {
    titulo: 'Preço do kWh',
    simples: 'Tem unidade sem o preço do kWh preenchido.',
    consequencia: 'É por esse preço que a energia vira dinheiro na conta. Sem ele, o valor da '
      + 'cobrança não pode ser calculado.',
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
};

export const GLOSSARIO: readonly TermoDoGlossario[] = [
  {
    termo: 'Unidade consumidora (UC)',
    texto: 'É o ponto de luz do cliente — a casa, a loja, a fábrica. Cada uma tem um número, que '
      + 'vem impresso na conta de energia. Um mesmo cliente pode ter mais de uma.',
    busca: ['uc', 'unidade', 'unidade consumidora', 'ponto de luz', 'conta de luz', 'energia',
            'numero da conta', 'instalacao', 'imovel', 'casa', 'loja'],
  },
  {
    termo: 'Mês de referência',
    texto: 'O mês a que a cobrança se refere. A conta de agosto cobra a energia de agosto, mesmo '
      + 'que ela seja paga em setembro. No sistema aparece como «competência» em alguns lugares.',
    busca: ['mes', 'mes de referencia', 'competencia', 'periodo', 'qual mes', 'mes errado'],
  },
  {
    termo: 'Fatia do cliente (rateio)',
    texto: 'A parte da energia de uma usina que é daquele cliente, em percentual. É o que permite '
      + 'calcular o desconto dele no fim do mês.',
    busca: ['rateio', 'fatia', 'percentual', 'porcentagem', 'divisao da usina', 'quanto e do cliente'],
  },
  {
    termo: 'Repasse ao dono da usina',
    texto: 'Quando o cliente paga, o dinheiro é dividido: uma parte vai para o dono da usina, uma '
      + 'para quem trouxe o cliente e o resto fica com a G3. Essa divisão é o repasse.',
    busca: ['repasse', 'split', 'divisao', 'dividir o dinheiro', 'quanto o dono recebe',
            'pagar o dono', 'reparticao', 'repartir'],
  },
  {
    termo: 'Quem trouxe o cliente (originador)',
    texto: 'A pessoa ou parceiro que indicou aquele cliente e recebe comissão por isso. Fica '
      + 'gravado no contrato e não muda depois que o contrato é criado.',
    busca: ['originador', 'quem trouxe', 'indicacao', 'indicou', 'comissao', 'parceiro', 'vendedor'],
  },
  {
    termo: 'Preço do kWh (tarifa)',
    texto: 'Quanto custa cada kWh de energia daquela unidade. Varia de cliente para cliente, e é '
      + 'por ele que a energia gerada vira valor em reais na cobrança.',
    busca: ['tarifa', 'preco do kwh', 'kwh', 'valor da energia', 'preco da energia', 'quanto custa'],
  },
  {
    termo: 'Contrato ativo',
    texto: 'O contrato precisa estar ativo para a unidade ser cobrada. Ele só ativa depois que o '
      + 'CPF ou CNPJ do cliente estiver confirmado aqui no sistema.',
    busca: ['contrato', 'contrato ativo', 'ativar contrato', 'rascunho', 'nao ativa'],
  },
  {
    termo: 'Documento confirmado',
    texto: 'Um CPF ou CNPJ que veio do CRM entra aqui como sugestão, não como confirmado — mesmo '
      + 'estando certo. Alguém precisa reenviar o número na aba Clientes para ele passar a valer. '
      + 'É esse ato que libera o contrato.',
    busca: ['documento', 'cpf', 'cnpj', 'confirmar documento', 'validar', 'nao vale',
            'documento do crm', 'sugestao'],
  },
];
