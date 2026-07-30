// As condicoes de criacao de contrato. Puras, sem banco e sem DOM.
// Uso: node --experimental-strip-types web/tests/contrato.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM. A Q-ORIGINADOR-01 foi decidida em
// 29/07/2026 na opcao (a): as 39 UCs da carteira LEVAM originador, e nenhuma
// comissao foi paga ainda. A consequencia e uma regra de tela, e regra de tela
// e o tipo de coisa que some numa refatoracao sem nada falhar - o `disabled`
// volta a ser `!uc` e a digitacao dos 39 grava nulo nos 39 outra vez.
//
// O CUSTO DE PERDER ESTA REGRA NAO E UM ERRO NA TELA, e por isso ela tem suite
// propria: `src/repos/split.ts` so monta o item de comissao quando ha
// `originador_id` E tier congelado. Sem eles a reparticao roda, fecha em zero e
// NAO levanta - o dinheiro simplesmente nao sai, sem erro e sem log. E nao ha
// desfazer: a R20-b congela o tier no `rascunhar`, e o conserto e
// `encerrar` + `renovar`, que zera o contador de faturas cheias e deixa na
// trilha uma renovacao que nao houve.

import { podeCriarContrato, motivoDaTrava, type EstadoDoFormulario } from '../src/contrato-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};

/** O formulario preenchido por inteiro. Cada caso abaixo estraga UM campo. */
const completo: EstadoDoFormulario = {
  ucEscolhida: true, ucTemUsina: true, temOriginador: true, ocupado: false,
};

// ------------------------------------------------------------ C1 caminho bom
{
  chk('C1', podeCriarContrato(completo) === true && motivoDaTrava(completo) === null,
      'formulario completo libera o botao, e sem motivo de trava');
}

// ------------------------------------------- C2 o originador, nos DOIS sentidos
{
  // O sentido que importa: sem originador o botao TRAVA. Um teste que so
  // conferisse o caminho bom passaria com a regra removida.
  const semOrig = { ...completo, temOriginador: false };
  chk('C2', podeCriarContrato(semOrig) === false,
      'sem originador o botao TRAVA - Q-ORIGINADOR-01 (a): a carteira leva originador e o campo nao e editavel depois');
  chk('C2b', motivoDaTrava(semOrig) === 'sem_originador',
      'e a trava se NOMEIA, para a tela poder dizer por que em vez de so ficar cinza');
  chk('C2c', podeCriarContrato({ ...semOrig, temOriginador: true }) === true,
      'e escolher o originador destrava - a regra e sobre o campo, nao um `false` preso');
}

// ------------------------------------------------- C3 as outras tres condicoes
{
  chk('C3a', podeCriarContrato({ ...completo, ucEscolhida: false }) === false
          && motivoDaTrava({ ...completo, ucEscolhida: false }) === 'sem_uc',
      'sem UC escolhida trava, e o motivo e sem_uc');
  chk('C3b', podeCriarContrato({ ...completo, ucTemUsina: false }) === false
          && motivoDaTrava({ ...completo, ucTemUsina: false }) === 'uc_sem_usina',
      'UC sem usina trava: sem usina nao ha de onde vir o credito');
  chk('C3c', podeCriarContrato({ ...completo, ocupado: true }) === false
          && motivoDaTrava({ ...completo, ocupado: true }) === 'ocupado',
      'escrita em voo trava - o duplo clique criaria dois contratos e o segundo bateria na R14 com 409');
}

// ------------------------------------------------------------- C4 a ORDEM
{
  /*
   * A ordem existe porque a tela mostra UM motivo por vez. Com tudo vazio, a
   * pessoa precisa ouvir "escolha a UC" - e nao "escolha o originador", que ela
   * so consegue depois. E a mesma regra da triagem da prontidao: o que impede
   * de EXISTIR vem antes do que impede de calcular.
   */
  const vazio: EstadoDoFormulario = {
    ucEscolhida: false, ucTemUsina: false, temOriginador: false, ocupado: false,
  };
  chk('C4', motivoDaTrava(vazio) === 'sem_uc',
      'com tudo vazio o motivo e a UC, nao o originador - um motivo por vez, na ordem em que se resolve');
  chk('C4b', motivoDaTrava({ ...vazio, ocupado: true }) === 'ocupado',
      'e `ocupado` vence todos: durante a escrita o que importa e que ela esta em curso');
}

console.log();
if (falhas > 0) { console.log(`--- contrato: ${falhas} FALHA(S)`); process.exit(1); }
console.log('--- contrato (regras da tela): 9 verificacoes, 0 falhas');
