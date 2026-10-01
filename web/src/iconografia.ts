// OS NOMES DOS ÍCONES, e só os nomes. Sem JSX, sem importar biblioteca.
//
// A ICONOGRAFIA É PHOSPHOR, EXCLUSIVAMENTE — decisão do dono em 30/07/2026, e o
// "exclusivamente" é a parte que precisa de mecanismo. Duas famílias de ícone na
// mesma tela é o tipo de coisa que ninguém decide: acontece porque um SVG
// desenhado à mão resolveu um caso, e seis meses depois metade da interface tem
// traço de 1.5px e a outra de 2.4px.
//
// COMO O MECANISMO FUNCIONA, em duas metades:
//
//   - AQUI mora o vocabulário: `NomeDeIcone`, uma união fechada. Nenhuma tela
//     escolhe ícone — ela pede um NOME semântico, e quem decide qual desenho
//     corresponde é o `icones.tsx`;
//   - LÁ mora `Record<NomeDeIcone, Icon>` com o componente do Phosphor para cada
//     nome. Sendo `Record` exaustivo, um nome novo aqui sem desenho lá **não
//     compila**. É o `tsc` recusando, não alguém lembrando.
//
// Este arquivo é `.ts` puro de propósito: o runner do `web/` não lê JSX, e é
// aqui que ficam as duas coisas que precisam de teste (as duas abaixo).

/** O vocabulário fechado. Nome SEMÂNTICO, nunca o nome do desenho: a tela pede
 *  `confirmar`, não `check-circle`. Trocar o desenho de um nome é um `Record` em
 *  `icones.tsx`; trocar o desenho de trinta chamadas espalhadas é um mutirão. */
export type NomeDeIcone =
  // as telas — a ordem é a de `navegacao.ts` (`carteira` e `vigencia` ficaram sem
  // tela e seguem aqui porque cartões de resumo ainda os desenham)
  | 'prontidao' | 'clientes' | 'unidades' | 'contratos' | 'usinas' | 'donos' | 'vigencia'
  | 'carteira' | 'faturas' | 'cobranca' | 'documento' | 'relatorios'
  | 'contas_a_receber' | 'contas_a_pagar' | 'historico' | 'usuarios'
  /* `cadastros` SAIU EM 30/09/2026 (etapa 3b), no mesmo dia em que entrou: era
   * o desenho do gatilho «Cadastros ▾» da barra, e no menu lateral os cadastros
   * são uma seção com título, sem gatilho para desenhar. */
  /* OS CINCO TONS DO SELO (30/09/2026, etapa 4a do redesenho). Até esta data
   * eram três, e o do meio se chamava `pendente` e desenhava o X vermelho — o
   * mesmo X para «o banco recusou o boleto» e para «falta o CPF do cliente».
   * Hoje o X é `falha`, e só a falha o usa; a lacuna de cadastro ganhou o lápis
   * de `a_fazer`, e o que não é bom nem ruim (inativo, cancelada) ganhou o traço
   * de `neutro`. Ver `TomDoSelo`, logo abaixo. */
  | 'ok' | 'falha' | 'a_fazer' | 'nao_medido' | 'neutro'
  // os três avisos
  | 'aviso_erro' | 'aviso_ok' | 'aviso_alerta'
  // as métricas dos cartões de resumo
  | 'pode_repartir' | 'faturado' | 'recebido' | 'a_receber' | 'vencidas'
  /* O PAR `sim`/`nao` E O `pode_faturar` SAÍRAM EM 30/09/2026 (etapa 4a) com
   * o `KpiSimNao`, que era o único a desenhá-los: os três cartões de sim e não
   * da tela Mês repetiam a linha de cadastro do funil. */
  // ações e controles
  | 'buscar' | 'calendario' | 'confirmar' | 'limpar' | 'baixar' | 'imprimir' | 'copiar'
  /* FECHAR E O X, e nao a vassoura de `limpar` (30/09): fechar a gaveta da
   * Fatura unificada e tirar um filtro-chip nao limpam nada — a vassoura ali
   * dizia um ato que nao acontece. */
  | 'fechar'
  | 'subir' | 'descer' | 'remover' | 'enviar' | 'acrescentar' | 'emitir' | 'recarregar'
  // ordenação de coluna
  | 'ordem_crescente' | 'ordem_decrescente' | 'ordem_nenhuma'
  // a sessão: empresa, conta e tema (até 30/09/2026 na barra do topo, hoje no pé do menu)
  | 'empresa' | 'usuario' | 'sair' | 'tema_claro' | 'tema_escuro' | 'tema_sistema' | 'abrir_menu'
  /* O MENU LATERAL (30/09/2026, etapa 3b). `abrir_navegacao` é o ☰ da faixa do
   * celular, que abre a gaveta; `recolher_navegacao` e `expandir_navegacao` são
   * o par do botão que deixa o menu só com os desenhos. São DOIS nomes, e não um
   * desenho girado: a seta diz para que lado o menu vai, e quem lê o botão
   * recolhido precisa ver «abre para cá», não «fecha». */
  | 'abrir_navegacao' | 'recolher_navegacao' | 'expandir_navegacao'
  /* O MENU DE SETORES (27/09/2026): um desenho por setor e o ⌃⌄ que abre a
   * lista. `trocar_setor` NÃO reusa `abrir_menu`: a seta única é "abre um menu
   * de ações" (a conta); as duas setas são "troca o lugar em que você está". */
  | 'setor_rateio' | 'setor_empresa' | 'trocar_setor'
  /* A PASTA «Administração da plataforma» (30/09/2026) — o escudo, e a senha
   * provisória da pessoa nova (a chave). */
  | 'setor_administracao' | 'senha'
  /* A ajuda tem desenho PRÓPRIO e não reusa o ponto de interrogação: aquele já é
   * o `nao_medido` da tabela de Pendências, e o mesmo desenho significando
   * "estado desta linha" num lugar e "peça ajuda" noutro é a cor sendo o único
   * sinal outra vez, só que com forma. */
  | 'ajuda'
  /* SAIR DESTE SISTEMA tem desenho proprio, e nao reusa a seta de navegacao: a
   * seta significa "vai para outra tela daqui" em todo o resto da interface, e o
   * mesmo desenho significando "abre outro sistema em outra aba" seria a pessoa
   * descobrindo a diferenca depois do clique. */
  | 'abrir_externo'
  /* A LINHA DA TABELA DE EMISSÃO (30/09, etapa 2). `mais_acoes` são os três
   * pontos do menu da linha — onde mora o que desfaz («Cancelar esta
   * cobrança»), fora da linha principal. `abrir_linha` é o triângulo de abrir o
   * painel da linha, que vira `abrir_menu` (para baixo) quando ela está aberta.
   * `ir_para` é a seta do ato que LEVA a outra tela («Completar o endereço»):
   * quem clica precisa saber antes que vai sair daqui. */
  | 'mais_acoes' | 'abrir_linha' | 'ir_para'
  /* O PAINEL DO MÊS DE TRABALHO (01/10/2026, etapa 8): as duas setas que
   * andam um ANO na grade dos meses. Nome próprio, e não `abrir_linha` girado:
   * o triângulo da linha abre um painel; estes andam no tempo. */
  | 'mes_anterior' | 'mes_seguinte'
  /* OS DESENHOS DE ESTADO QUE A ETAPA 7b TROUXE (01/10/2026), cada um porque o
   * anterior mentia:
   *   `cancelado`  o círculo cortado. A cobrança, a unidade e a conta a pagar
   *                canceladas usavam a lixeira (`remover`), que é o desenho do
   *                BOTÃO de apagar — o selo lia como ação;
   *   `a_pagar`    a conta a pagar em aberto. Usava o lápis de `a_fazer`, que é
   *                o desenho da lacuna de cadastro: «em aberto» não é campo a
   *                preencher, é dinheiro a entregar;
   *   `alterou`    o verbo da trilha. As duas setas da troca — de um valor para
   *                outro, que é o que a linha aberta mostra (antes → depois). */
  | 'cancelado' | 'a_pagar' | 'alterou'
  // cobrança e documento
  | 'boleto' | 'pix' | 'certificado'
  // movimento: as duas que existem para ANIMAR, não para informar
  | 'carregando' | 'engrenagem';

/**
 * O TOM DO SELO — e o nome é o que ele QUER DIZER, não a cor.
 *
 * ============================================================================
 * VERMELHO SÓ PARA FALHA (30/09/2026, etapa 4a do redesenho)
 *
 * Até esta data havia três tons — `ok`, `pendente` e `nao_medido` — e o do meio
 * era vermelho. O nome vinha da prontidão, onde `pendente` quer dizer «falta
 * preencher», e a tela passava a situação da camada DIRETO como tom: resultado,
 * «Falta preencher» em vermelho, ao lado de «Recusada pelo banco» no mesmo
 * vermelho. A crítica de 30/09 (P2 nº 4) mediu o efeito: a tela de trabalho
 * gritava em toda linha de cadastro, e o grito que importava — o banco recusou,
 * venceu, o conector caiu — não se distinguia mais.
 *
 * AGORA SÃO CINCO, e o vermelho tem nome próprio:
 *
 *   `ok`          pronto, pago, registrado;
 *   `erro`        FALHA — a recusa do banco, a cobrança vencida, o conector
 *                 caído, a leitura que não voltou. Só isto é vermelho;
 *   `a_fazer`     TAREFA — a lacuna de cadastro, a conta a pagar em aberto, o
 *                 rascunho a emitir. É trabalho de alguém, e não um defeito:
 *                 âmbar, com o lápis;
 *   `nao_medido`  «ainda não dá para saber». Âmbar também, com a interrogação;
 *   `neutro`      nada a fazer agora: inativo, cancelada, suspenso — e, desde
 *                 01/10/2026 (etapa 7b), o que está EM CURSO sem você (emitida,
 *                 boleto a caminho, lendo, na fila). Cinza.
 *
 * QUEM DECIDE O TOM DE CADA ESTADO é `tom-do-estado.ts`, e só ele: a tela não
 * escolhe cor (`Marca` recebe um `Selo` de lá).
 *
 * `pendente` SAIU DO VOCABULÁRIO DE TOM DE PROPÓSITO: com ele fora, passar a
 * situação da prontidão direto como tom não compila mais — a tela tem de dizer
 * o que a situação significa, e é essa tradução que faltava.
 */
export type TomDoSelo = 'ok' | 'erro' | 'a_fazer' | 'nao_medido' | 'neutro';

/** A ordem de apresentação dos tons, para quem precisa percorrê-los (a suíte). */
export const TONS_DO_SELO: readonly TomDoSelo[] = ['ok', 'erro', 'a_fazer', 'nao_medido', 'neutro'];

/**
 * OS CINCO TONS -> ícone.
 *
 * ESTA É A RESTRIÇÃO 3 DO TEMA GANHANDO UM SEGUNDO SINAL. O `tema.ts` exige que
 * "cor não pode ser o único sinal" e resolvia isso com o texto do estado dentro
 * da pílula ("OK", "Pendente", "Não medido"). O texto continua — o ícone é um
 * terceiro sinal, não um substituto dele.
 *
 * O ÂMBAR GANHOU INTERROGAÇÃO, E ISSO É DOMÍNIO E NÃO ENFEITE. `nao_medido`
 * significa "o universo desta camada depende de contrato, e não há contrato":
 * zero sobre nada não é pronto. Um triângulo de alerta diria "algo está errado",
 * e não está — o que falta é a medição. A interrogação é a única forma que diz
 * "não sei" em vez de "está ruim" ou "está bom".
 */
export const ICONE_DO_ESTADO: Record<TomDoSelo, NomeDeIcone> = {
  ok: 'ok',
  erro: 'falha',
  /* O LÁPIS, e não o triângulo de alerta: a lacuna de cadastro é uma coisa a
   * preencher, e o desenho diz o ato. O triângulo continua sendo o do AVISO. */
  a_fazer: 'a_fazer',
  nao_medido: 'nao_medido',
  neutro: 'neutro',
};

/* O STATUS DA FATURA -> ícone (`ICONE_DO_STATUS_DA_FATURA`) SAIU DAQUI em
 * 01/10/2026 (etapa 7b): o desenho e a cor de cada status da cobrança moram
 * juntos em `tom-do-estado.ts` (`SELO_DA_COBRANCA`), com os de todos os outros
 * estados do sistema. O defeito que o mapa existia para evitar continua
 * evitado lá — a emitida tem o avião de papel, não a interrogação. */

/** Os três avisos -> ícone. `erro` leva octógono e não triângulo: octógono é
 *  parada, triângulo é atenção, e a diferença entre "a fatura não vai nascer" e
 *  "confira isto" é exatamente essa. */
export const ICONE_DO_AVISO: Record<'erro' | 'ok' | 'alerta', NomeDeIcone> = {
  erro: 'aviso_erro',
  ok: 'aviso_ok',
  alerta: 'aviso_alerta',
};

/**
 * OS ÍCONES QUE SE MOVEM, nomeados como lista fechada.
 *
 * O pedido de 30/07 foi micro-interação em quase tudo, e a lista existe para o
 * "quase" ter fronteira escrita. Movimento é ferramenta de ATENÇÃO: quando tudo
 * se move, nada chama atenção, e uma tela de operação que se agita o dia inteiro
 * cansa quem lê 39 linhas de dinheiro.
 *
 * As seis que se movem, e o porquê de cada uma:
 *
 *   `carregando`   gira enquanto espera — movimento CONTÍNUO, e ele significa
 *                  "ainda estou trabalhando", que é informação
 *   `engrenagem`   gira dentro do indicador de carga, com o sol da G3 parado no
 *                  centro. Um dos dois em movimento lê como mecanismo; os dois
 *                  girando lê como defeito
 *   `aviso_erro`   pulsa DUAS VEZES e para. Aparece quando algo já falhou, e
 *                  pulsar para sempre viraria ruído que se aprende a ignorar
 *   `aviso_ok`     o traço do check é desenhado uma vez, ao aparecer
 *   `sim` / `nao`  entram desenhando-se, uma vez, no cartão de métrica. São o
 *                  par de maior consequência da tela de Prontidão — "pode
 *                  faturar" e "pode repartir" —, e o movimento existe para o
 *                  olho ir neles primeiro
 *
 * O que NÃO está aqui não se move, e isso é a regra: ícone de tela, de estado e
 * de ação são estáticos. Eles ganham cor e leve deslocamento no hover pelo CSS,
 * o que é feedback de ponteiro — não animação.
 *
 * TUDO ISTO É SUSPENSO POR `prefers-reduced-motion`. Não é cortesia: é WCAG
 * 2.3.3, e há gente para quem movimento na tela é sintoma, não estilo. Nenhuma
 * informação vive só no movimento — o carregando tem texto ao lado, o erro tem
 * ícone e faixa lateral —, então parar tudo não esconde nada.
 */
export const ICONES_QUE_SE_MOVEM: readonly NomeDeIcone[] =
  ['carregando', 'engrenagem', 'aviso_erro', 'aviso_ok'] as const;
