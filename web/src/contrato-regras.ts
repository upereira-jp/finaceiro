// As condicoes de criacao de contrato, PURAS e fora do componente.
//
// POR QUE ELAS SAIRAM DO `contratos.tsx`. A regra 8 manda que invariante tenha
// teste, e o runner do `web/` e `node --experimental-strip-types`, que nao le
// JSX: qualquer coisa dentro de um `.tsx` e inalcancavel para ele. Enquanto o
// `disabled` do botao fosse uma expressao inline, a unica prova de que ele
// existe era ler o arquivo - e foi assim que a tela de Contratos passou dias
// afirmando "Nenhum contrato" sobre uma falha de leitura.
//
// O QUE ESTE ARQUIVO PRENDE, e vale dinheiro: a Q-ORIGINADOR-01, decidida em
// 29/07/2026. A carteira LEVA originador, e **nenhuma comissao foi paga a
// ninguem ainda** - e e da segunda frase que decorre a primeira ser segura: o
// contador `faturas_cheias_pagas` nascer em 0 e o valor CERTO, com a comissao
// inteira pela frente.
//
// ESSA SEGUNDA FRASE E TESTEMUNHO DO DONO, NAO MEDICAO, e a distincao esta
// escrita aqui de proposito. Nem o financeiro nem o CRM registram comissao paga
// por fora: nao existe consulta que a confirme ou desminta. O que se mede e so
// o contorno - `fatura`, `boleto` e `liquidacao` em ZERO no banco, ou seja este
// sistema nunca cobrou ninguem.
//
// E OS CLIENTES ATIVOS DO CRM SAO REAIS - 29 em `Clientes ativos - Assinatura`,
// medidos em 29/07 - e nao contradizem nada disto: cliente ativo diz que ele
// recebe credito, nao que alguem foi comissionado pela venda dele. A primeira
// versao deste comentario tentou conciliar as duas coisas inventando que
// "efetivada" significaria "faturada por nos". Nao significava - a premissa
// estava errada e foi corrigida pelo dono. O que sustenta a regra e o
// testemunho, sozinho.
//
// SE ESSE TESTEMUNHO MUDAR, esta regra muda junto: preencher o originador de
// uma venda ja comissionada paga a MESMA comissao duas vezes - 25% a 30% do
// consumo, em silencio.
//
// Um contrato gravado sem originador, por outro lado, nao paga NUNCA:
// `split.ts` so monta o item quando ha `originador_id` E tier congelado, e a
// reparticao roda, fecha e nao paga - sem erro, sem log e sem recusa. E nao ha
// desfazer, porque a R20-b congela o tier no `rascunhar`.

/** O que a tela sabe no momento do clique. Booleanos e nao objetos: a regra nao
 *  depende de nenhum campo alem destes, e recebe-los inteiros convidaria a
 *  regra a crescer aqui em vez de virar camada de prontidao. */
export type EstadoDoFormulario = {
  /** Uma UC livre foi escolhida. */
  ucEscolhida: boolean;
  /** A UC escolhida tem usina vinculada - sem ela nao ha de onde vir o credito. */
  ucTemUsina: boolean;
  /** Um originador foi escolhido no select. */
  temOriginador: boolean;
  /** Ja ha uma escrita em voo. */
  ocupado: boolean;
};

/**
 * Verdadeiro so quando as QUATRO condicoes valem. A ausencia de originador
 * pesa igual as outras de proposito: ela e a unica cujo erro nao aparece em
 * lugar nenhum depois.
 */
export function podeCriarContrato(e: EstadoDoFormulario): boolean {
  return e.ucEscolhida && e.ucTemUsina && e.temOriginador && !e.ocupado;
}

/**
 * Por que o botao esta travado, na ordem em que a pessoa resolve.
 *
 * `null` quando nao ha impedimento. NAO devolve texto de UI: a tela decide como
 * mostrar, e um motivo por vez evita a lista de quatro reclamacoes que ninguem
 * le. A ordem e a mesma da prontidao - o que impede de EXISTIR antes do que
 * impede de calcular.
 */
export type MotivoDeTrava = 'sem_uc' | 'uc_sem_usina' | 'sem_originador' | 'ocupado';

export function motivoDaTrava(e: EstadoDoFormulario): MotivoDeTrava | null {
  if (e.ocupado) return 'ocupado';
  if (!e.ucEscolhida) return 'sem_uc';
  if (!e.ucTemUsina) return 'uc_sem_usina';
  if (!e.temOriginador) return 'sem_originador';
  return null;
}
