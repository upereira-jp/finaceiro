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
  // as treze telas — a ordem é a de `navegacao.ts`
  | 'prontidao' | 'clientes' | 'unidades' | 'contratos' | 'usinas' | 'donos' | 'tarifas'
  | 'carteira' | 'faturas' | 'cobranca' | 'documento' | 'relatorios' | 'contas_a_pagar'
  // os três estados da prontidão
  | 'ok' | 'pendente' | 'nao_medido'
  // os três avisos
  | 'aviso_erro' | 'aviso_ok' | 'aviso_alerta'
  // as métricas dos cartões de resumo
  | 'pode_faturar' | 'pode_repartir' | 'faturado' | 'recebido' | 'a_receber' | 'vencidas'
  // o par sim/não dos cartões — grande, colorido, e ele APARECE animado
  | 'sim' | 'nao'
  // ações e controles
  | 'buscar' | 'calendario' | 'confirmar' | 'limpar' | 'baixar' | 'imprimir' | 'copiar'
  | 'subir' | 'descer' | 'remover' | 'enviar' | 'acrescentar' | 'emitir' | 'recarregar'
  // ordenação de coluna
  | 'ordem_crescente' | 'ordem_decrescente' | 'ordem_nenhuma'
  // a barra do topo
  | 'empresa' | 'usuario' | 'sair' | 'tema_claro' | 'tema_escuro' | 'tema_sistema' | 'abrir_menu'
  // cobrança e documento
  | 'boleto' | 'pix' | 'certificado'
  // movimento: as duas que existem para ANIMAR, não para informar
  | 'carregando' | 'engrenagem';

/**
 * OS TRÊS ESTADOS DA PRONTIDÃO -> ícone.
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
export const ICONE_DO_ESTADO: Record<'ok' | 'pendente' | 'nao_medido', NomeDeIcone> = {
  ok: 'ok',
  pendente: 'pendente',
  nao_medido: 'nao_medido',
};

/**
 * O STATUS DA FATURA -> ícone, e este mapa existe por causa de um defeito que a
 * primeira versão do acabamento produziu — vale registrar porque ele é sobre
 * significado, não sobre desenho.
 *
 * A pílula de estado deriva a COR de três tons (`ok`, `pendente`, `nao_medido`),
 * e a fatura reusa esses três para seis status: `emitida` cai em `nao_medido`
 * porque não é nem bom nem ruim, é meio do caminho. Enquanto o único sinal era a
 * cor, isso funcionava. Assim que o ícone entrou, "Emitida" passou a exibir uma
 * INTERROGAÇÃO — o desenho de "não sei", que é o significado certo para uma
 * camada de prontidão não medida e o significado errado para uma fatura que foi
 * emitida com sucesso.
 *
 * O tom continua vindo de `tomDoStatusDaFatura` (`cobranca-regras.ts`, testado);
 * o que este mapa faz é dar ao terceiro sinal o significado do DOMÍNIO em vez do
 * significado do tom.
 *
 * NENHUM DELES PODE ESTAR EM `ICONES_QUE_SE_MOVEM`: uma tabela de 39 faturas
 * desenharia 39 ícones animados a cada render.
 */
export const ICONE_DO_STATUS_DA_FATURA: Record<string, NomeDeIcone> = {
  rascunho: 'documento',
  emitida: 'emitir',
  paga: 'ok',
  vencida: 'vencidas',
  cancelada: 'remover',
  negociada: 'donos',
};

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
 * ícone e faixa lateral, o sim/não tem a palavra escrita —, então parar tudo não
 * esconde nada.
 */
export const ICONES_QUE_SE_MOVEM: readonly NomeDeIcone[] =
  ['carregando', 'engrenagem', 'aviso_erro', 'aviso_ok', 'sim', 'nao'] as const;
