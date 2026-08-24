// POR QUE CADA DADO EXISTE — o texto, num lugar so.
//
// ============================================================================
// POR QUE ESTE ARQUIVO E SEPARADO DA `ajuda.ts`
//
// Ele tem DOIS consumidores, e um deles nao pode carregar o outro:
//
//   `ajuda.ts`   a central de ajuda, que desenha o porque dentro do assunto;
//   `ui.tsx`     o proprio CAMPO do formulario, que mostra o porque ao lado.
//
// O painel de ajuda e carregado sob demanda - so quando alguem o abre. Se o
// `ui.tsx` importasse a `ajuda.ts` para pegar estes textos, os 45 assuntos, o
// glossario e a busca inteira entrariam no carregamento INICIAL de toda tela,
// para exibir tres linhas de texto. Este arquivo carrega so o texto.
//
// ============================================================================
// UM TEXTO SO, E ESSE E O PONTO
//
// A alternativa era escrever a explicacao duas vezes - uma na ajuda, outra na
// tela - e duas copias da mesma frase divergem na primeira correcao, sem que
// nada quebre. O modo de falha seria o pior deste sistema: a tela dizendo uma
// coisa e a ajuda dizendo outra sobre o mesmo campo, e as duas parecendo certas.
//
// ============================================================================
// O QUE ENTRA AQUI, e o criterio nao e "explicar o campo"
//
// Cada texto diz O QUE QUEBRA SEM O DADO, e nao o que o dado e. A diferenca
// importa porque quem nao sabe para que um campo serve preenche qualquer coisa
// nele para a tela parar de reclamar - e o defeito caro e justamente o que nao
// levanta erro: um dia de vencimento inventado nao da erro nenhum, so cobra o
// cliente na data errada todo mes, ate alguem reclamar.
//
// A chave e o `id` do assunto da ajuda que trata daquele dado. A suite prende os
// dois lados: todo assunto ligado a uma pendencia precisa de uma entrada aqui
// (A6h), e todo `porqueDe=` escrito numa tela precisa achar chave nesta lista.

export const PORQUE: Record<string, string> = {
  'documento-cliente':
    'Porque a cobrança precisa dizer de quem ela é. É esse número que identifica o pagador '
    + 'no documento que ele recebe, e o sistema o exige antes de deixar um contrato valer — sem ele, '
    + 'a cobrança sairia sem dono, e uma cobrança sem dono não se defende se alguém contestar.',
  'contrato':
    'Porque é o contrato que autoriza cobrar aquela unidade. Ele guarda o que foi combinado e '
    + 'quem tem direito à comissão por ela — sem contrato, o sistema não sabe se a unidade pode ser '
    + 'cobrada, nem quanto alguém recebe por ela todo mês.',
  'rateio':
    'Porque é a fatia que liga a unidade a uma usina. Ela diz de onde veio o crédito daquele '
    + 'cliente, e é da usina que sai a parte do dono quando o dinheiro entrar. Sem ela a unidade fica '
    + 'sem origem e o pagamento ao dono não tem como ser calculado.',
  'conta-lida':
    'Porque é a conta da distribuidora que diz quanta energia foi compensada e quanto ela '
    + 'custou. O valor da cobrança sai de lá, e não de um cálculo que o sistema faça sozinho — é por '
    + 'isso que o cliente consegue conferir a folha dele contra o papel que já tem em casa.',
  'vencimento':
    'Porque toda cobrança precisa de uma data, e o sistema não inventa nenhuma. Em geral a '
    + 'conta da distribuidora já traz a data e nada precisa ser preenchido; o dia do cadastro é a '
    + 'reserva para quando ela vier sem. Um dia errado aqui não dá erro — só cobra na data errada, '
    + 'todo mês, até alguém reclamar.',
  'tarifa':
    'Porque é o preço do kWh que transforma energia em dinheiro na folha do cliente. Ele vem '
    + 'impresso na conta com seis casas depois da vírgula, e essas casas não são exagero: arredondar '
    + 'para centavos muda o total de uma unidade em alguns reais por mês.',
  'geracao':
    'Porque é o registro de quanto a usina produziu naquele mês. Ele não entra no valor que o '
    + 'cliente paga, e é contra ele que o pagamento ao dono da usina é conferido depois — sem esse '
    + 'número não há como mostrar de onde veio o que foi repassado.',
  'dono-usina':
    'Porque quando o cliente pagar, uma parte do dinheiro é do dono da usina. Sem ele '
    + 'cadastrado, o valor entra e fica parado sem destino: dá para cobrar, não dá para repassar. '
    + 'A chave de pagamento é conferida aqui no cadastro porque, na hora de pagar, já é tarde.',
  'repasse':
    'Porque é ela que diz quanto do que entrou é do dono da usina e quanto fica na empresa. '
    + 'Vale por período, e não «para sempre»: renegociar hoje não muda o que já foi pago no mês '
    + 'passado, e é por isso que se abre um período novo em vez de editar o número antigo.',
  'banco':
    'Porque é a credencial que deixa o sistema emitir o boleto sozinho. Sem ela a cobrança '
    + 'existe e pode ser paga por Pix normalmente — o que falta é o boleto sair daqui em vez de ser '
    + 'emitido à mão no banco e importado depois.',
  'comissao':
    'Porque é quem recebe comissão por aquela unidade, todo mês, enquanto o cliente pagar. '
    + 'O nome fica preso ao contrato no momento em que ele é criado e não tem tela de edição — '
    + 'trocar depois exige refazer o contrato, e o modo de falha é silencioso: sem essa pessoa '
    + 'preenchida, a divisão do dinheiro roda, fecha e simplesmente não paga ninguém.',
  'valor-da-comissao':
    'Porque é ela que diz quanto quem trouxe o cliente recebe, e em quais cobranças. O valor '
    + 'fica amarrado à data em que o contrato foi fechado, de propósito: uma mudança de hoje não '
    + 'pode reprecificar uma venda do mês passado, que já foi combinada com outra pessoa.',

  // ------------------------------------------------ campos sem pendencia propria
  //
  // Estes nao sao pendencias - nenhum deles impede a cobranca de sair -, e mesmo
  // assim sao digitados pela operacao e mesmo assim tem um porque. A A6h nao os
  // exige; a tela os usa.

  'endereco-unidade':
    'Porque é o endereço que vai impresso no boleto, no campo do pagador. O documento do cliente e '
    + 'a cobrança por Pix saem sem ele — quem depende é só o boleto, e ele recusa endereço pela '
    + 'metade em vez de emitir um documento que o banco devolve depois.',

  'cadastrar-cliente':
    'Porque é o nome que sai impresso na folha que o cliente recebe e no campo do pagador da '
    + 'cobrança. Ele vem do outro sistema quando o cliente é espelhado de lá; digitado aqui, vale '
    + 'para quem não veio por aquele caminho.',

  'valor-de-referencia':
    'Porque é o consumo que a pessoa tinha ANTES de entrar, e ele serve de referência para conferir '
    + 'se a economia prometida está acontecendo. Não é o valor cobrado: quanto o cliente paga sai da '
    + 'conta da distribuidora daquele mês, não daqui.',

  'contato-do-cliente':
    'Porque é por onde se fala com ele quando a cobrança não é paga, e porque o documento do cliente '
    + 'pode ser enviado por ali. Não impede cobrar: impede resolver quando algo dá errado, que é '
    + 'justamente quando ninguém quer estar procurando telefone.',

  'percentual-do-dono':
    'Porque é ele que diz quanto do dinheiro que entrar é do dono da usina — o resto fica na empresa. '
    + 'Vale por período e não se edita: renegociar abre um período novo e fecha o anterior, para o que '
    + 'já foi pago no mês passado continuar valendo o que valia.',

  'pagar-dono':
    'Porque é o registro de que a empresa DEVE esse valor a alguém. Ele nasce da divisão do dinheiro '
    + 'que o cliente pagou, e existe para o pagamento ao dono da usina e a comissão terem prazo, '
    + 'destinatário e comprovante — em vez de viverem numa conversa.',

  'identidade-da-empresa':
    'Porque a folha precisa dizer quem está cobrando. É a esse nome que o aviso contra o golpe do '
    + 'boleto se amarra — ele manda o cliente conferir o beneficiário, e sem o cadastro preenchido a '
    + 'folha sai sem a linha, mandando conferir contra um espaço em branco.',
};
