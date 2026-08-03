// AS REGRAS DA TELA DE CONTAS A PAGAR, sem browser e sem banco.
// Uso: node --experimental-strip-types web/tests/contas.ts
//
// O QUE ESTA SUITE PERSEGUE. As travas daqui sao ESPELHO das do servidor, e
// espelho tem um modo de falha proprio: divergir sem que nenhum dos dois lados
// pareca errado. Uma tela mais permissiva que o servidor manda o usuario para um
// erro 422 que ele nao podia prever; uma tela mais restritiva esconde um caminho
// que existe, e ninguem descobre que ele existe.
//
// Entao cada trava e exercitada NOS DOIS SENTIDOS - trava quando deve, e destrava
// quando deve -, e a linha do servidor que ela espelha esta nomeada no texto.

import {
  saldoCentavos, nomeDoBeneficiario, estaAtrasada, diaISO,
  podePagar, podeCancelar, podeCriar,
  ROTULO_DO_STATUS, ROTULO_DA_FORMA, ROTULO_DO_BENEFICIARIO,
  type ContaAPagar,
} from '../src/contas-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const conta = (o: Partial<ContaAPagar> = {}): ContaAPagar => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  descricao: 'Repasse ao dono da usina - 0001 2026-07',
  beneficiario_tipo: 'dono_usina',
  beneficiario_nome: null,
  dono_usina: { nome: 'Dono da usina' },
  originador: null,
  valor_centavos: 100_000,
  valor_pago_centavos: 0,
  competencia: '2026-07-01',
  vencimento: '2026-08-10',
  status: 'aberta',
  origem_split_item_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  ...o,
});

// ---------------------------------------------------- C1 o saldo, em inteiros
{
  chk('C1a', saldoCentavos(conta({ valor_centavos: 100_000, valor_pago_centavos: 30_000 })) === 70_000,
      'o saldo e subtracao de inteiros - regra 1 vale no browser tambem');
  chk('C1b', saldoCentavos(conta({ valor_pago_centavos: 100_000 })) === 0,
      'conta paga por inteiro tem saldo zero');

  /*
   * O banco impede pago > devido (`conta_pagar_nao_paga_demais`), entao este
   * caso nao chega da API. O piso existe porque um saldo NEGATIVO na tela seria
   * lido como credito, e a tela nao deve inventar um conceito que o schema nao
   * tem.
   */
  chk('C1c', saldoCentavos({ valor_centavos: 100, valor_pago_centavos: 500 }) === 0,
      'saldo nunca e negativo - negativo na tela seria lido como credito, e credito nao existe aqui');
}

// ---------------------------------------------------- C2 o nome de quem recebe
{
  chk('C2a', nomeDoBeneficiario(conta()) === 'Dono da usina', 'dono de usina vem da relacao');
  chk('C2b', nomeDoBeneficiario(conta({
        beneficiario_tipo: 'originador', dono_usina: null, originador: { nome: 'Renata' },
      })) === 'Renata', 'originador idem');
  chk('C2c', nomeDoBeneficiario(conta({
        beneficiario_tipo: 'concessionaria', dono_usina: null, beneficiario_nome: 'Equatorial',
      })) === 'Equatorial', 'concessionaria e "outro" vem do campo de texto');
  chk('C2d', nomeDoBeneficiario(conta({ dono_usina: null })) === '(sem nome)',
      'e a ausencia tem rotulo proprio, em vez de celula vazia que parece defeito de carga');
}

// ---------------------------------------------------- C3 atrasada e por DIA
{
  const c = conta({ vencimento: '2026-08-10' });
  chk('C3a', estaAtrasada(c, new Date(2026, 7, 11)) === true, 'venceu ontem: atrasada');
  chk('C3b', estaAtrasada(c, new Date(2026, 7, 10)) === false,
      'VENCE HOJE nao e atrasada - e a borda que uma comparacao por instante erraria a partir '
      + 'das 00:00, dizendo que atrasou o dia inteiro em que ainda da para pagar');
  chk('C3c', estaAtrasada(c, new Date(2026, 7, 9)) === false, 'vence amanha: nao atrasada');

  // Hora do dia nao muda nada - e a razao de a comparacao ser de STRING de dia.
  chk('C3d', estaAtrasada(c, new Date(2026, 7, 10, 23, 59, 59)) === false,
      'as 23:59 do dia do vencimento ainda NAO esta atrasada');

  chk('C3e', estaAtrasada(conta({ vencimento: '2020-01-01', status: 'paga' }), new Date(2026, 7, 11)) === false
        && estaAtrasada(conta({ vencimento: '2020-01-01', status: 'cancelada' }), new Date(2026, 7, 11)) === false,
      'paga e cancelada NAO atrasam, por mais velhas que sejam - atraso e sobre o que falta pagar');

  chk('C3f', diaISO(new Date(2026, 0, 5)) === '2026-01-05',
      'o dia sai com zero a esquerda - sem isso "2026-1-5" compararia errado como string');
}

// ---------------------------------------------------- C4 pagar, nos dois sentidos
//
// Espelha `registrarPagamento` de `src/repos/conta_pagar.ts` e o CHECK
// `conta_pagar_nao_paga_demais` da migration 22.
{
  const aberta = conta({ valor_centavos: 100_000, valor_pago_centavos: 0 });
  chk('C4a', podePagar(aberta, 100_000).pode === true, 'conta aberta aceita o valor inteiro');
  chk('C4b', podePagar(aberta, 1).pode === true, 'e aceita pagamento parcial de um centavo');

  /* O `\$` e o `\.` sao ESCAPES e nao enfeite: `/R$ /` casa "fim de string
   * seguido de espaco" e nunca casa nada, e `/1.000/` casaria "1X000". A
   * primeira versao tinha os dois erros e ficou vermelha por eles, depois de eu
   * ja ter consertado a formatacao que ela existia para pegar. */
  const p = podePagar(aberta, 100_001);
  chk('C4c', p.pode === false && /excede o saldo/.test((p as any).porque) && /R\$ 1\.000,00/.test((p as any).porque),
      'um centavo a mais TRAVA, e a mensagem DIZ quanto falta - "pagar duas vezes o mesmo repasse" '
      + 'e o modo de falha que a Q-PAGAMENTO-01 nomeia');

  const parcial = conta({ valor_centavos: 100_000, valor_pago_centavos: 70_000 });
  chk('C4d', podePagar(parcial, 30_000).pode === true && podePagar(parcial, 30_001).pode === false,
      'numa conta parcial o teto e o SALDO, nao o valor - 30.000 passa, 30.001 nao');

  const paga = podePagar(conta({ status: 'paga', valor_pago_centavos: 100_000 }), 1);
  chk('C4e', paga.pode === false && /já está paga/.test((paga as any).porque), 'conta paga nao recebe mais');

  const canc = podePagar(conta({ status: 'cancelada' }), 1_000);
  chk('C4f', canc.pode === false && /cancelada/.test((canc as any).porque),
      'conta cancelada nao recebe - espelha o gatilho `app.recalcular_conta_pagar`, que recusa no banco');

  chk('C4g', podePagar(aberta, 0).pode === false && podePagar(aberta, -100).pode === false
        && podePagar(aberta, 10.5).pode === false,
      'zero, negativo e fracionario travam - centavo e INTEIRO (regra 1)');
}

// ---------------------------------------------------- C5 cancelar, nos dois sentidos
{
  chk('C5a', podeCancelar(conta()).pode === true, 'conta aberta sem pagamento se cancela');

  const comPag = podeCancelar(conta({ valor_pago_centavos: 1, status: 'parcial' }));
  chk('C5b', comPag.pode === false && /Q-ESTORNO-01/.test((comPag as any).porque),
      'UM CENTAVO pago ja trava o cancelamento, e a mensagem aponta a questao - cancelar deixaria '
      + 'um pagamento apontando para titulo que "nao existe", que e a R46 na fatura');

  chk('C5c', podeCancelar(conta({ status: 'cancelada' })).pode === false, 'cancelar duas vezes trava');
}

// ---------------------------------------------------- C6 criar a mao
{
  const base = {
    descricao: 'Aluguel', beneficiario_nome: 'Imobiliaria', valorCentavos: 250_000,
    competencia: '2026-08', vencimento: '2026-09-10',
  };
  chk('C6a', podeCriar(base).pode === true, 'o caminho limpo destrava');
  chk('C6b', podeCriar({ ...base, descricao: '   ' }).pode === false, 'descricao so de espaco trava');
  chk('C6c', podeCriar({ ...base, beneficiario_nome: '' }).pode === false,
      'sem beneficiario trava - "uma despesa sem dono e o mesmo que nao registrar"');
  chk('C6d', podeCriar({ ...base, valorCentavos: 0 }).pode === false, 'valor zero trava');
  chk('C6e', podeCriar({ ...base, competencia: '2026' }).pode === false
        && podeCriar({ ...base, vencimento: '10/09/2026' }).pode === false,
      'mes e vencimento mal formados travam antes de virar requisicao');
}

// ---------------------------------------------------- C7 os rotulos sao exaustivos
//
// O QUE ESTA VERIFICACAO PEGA e o que o `tsc` ja pegaria no `Record` - mas so se
// alguem recompilar. Ela existe pela metade oposta: um rotulo VAZIO compila.
{
  const todos = [
    ...Object.values(ROTULO_DO_STATUS),
    ...Object.values(ROTULO_DA_FORMA),
    ...Object.values(ROTULO_DO_BENEFICIARIO),
  ];
  chk('C7a', todos.length === 4 + 6 + 4 && todos.every((r) => r.trim().length > 2),
      `os ${todos.length} rotulos existem e nenhum e vazio - `
      + 'vazio compila e sai como celula em branco na tela');

  chk('C7b', /Compensa/.test(ROTULO_DA_FORMA.compensacao) && /encontro de contas/.test(ROTULO_DA_FORMA.compensacao),
      'e `compensacao` NAO se chama "outro": e encontro de contas, dinheiro nenhum saiu, e '
      + 'registra-lo como Pix faria a conciliacao bancaria nunca fechar');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
