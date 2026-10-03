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
  saldoCentavos, nomeDoBeneficiario, estaAtrasada, diaISO, recibo, emBr,
  podePagar, podeCancelar, podeCriar,
  ROTULO_DO_STATUS, ROTULO_DA_FORMA, ROTULO_DO_BENEFICIARIO,
  consultaDaLista, hojeDoServidor, semSeguintes, seguintesDe, acrescentarBloco, inicioDoProximo,
  haMaisContas, contagemDaLista, lerTodasAsContas,
  type ContaAPagar, type PagamentoDaConta, type BlocoDeContas,
} from '../src/contas-regras.ts';
import { readFileSync } from 'node:fs';
import { pesoDoSelo, SELO_DA_CONTA_A_PAGAR } from '../src/tom-do-estado.ts';
import { PESO_DA_SITUACAO, normalizarBusca } from '../../src/dominio/lista-de-contas.ts';

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
  chk('C4c', p.pode === false && /excede o saldo/.test((p as any).porque) && /R\$\u00a01\.000,00/.test((p as any).porque),
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
  /* [30/09/2026, etapa 4b] A frase e a DICA DO BOTAO na tela, e quem a le opera o
     sistema: o codigo da questao (Q-ESTORNO-01, ainda aberta no QUESTOES.md) saiu
     dela. A verificacao passou a exigir o contrario — o porque em portugues, e
     nenhum codigo interno. */
  chk('C5b', comPag.pode === false && /estorno/.test((comPag as any).porque)
          && !/\bQ-[A-Z]|\bR\d{1,2}\b/.test((comPag as any).porque),
      'UM CENTAVO pago ja trava o cancelamento, e a mensagem diz por que (desfazer seria estorno) sem '
      + 'codigo interno - cancelar deixaria um pagamento apontando para titulo que "nao existe", que e '
      + 'a R46 na fatura');

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
  chk('C7a', todos.length === 4 + 8 + 4 && todos.every((r) => r.trim().length > 2),
      `os ${todos.length} rotulos existem e nenhum e vazio - `
      + 'vazio compila e sai como celula em branco na tela');

  chk('C7b', /Compensa/.test(ROTULO_DA_FORMA.compensacao) && /encontro de contas/.test(ROTULO_DA_FORMA.compensacao),
      'e `compensacao` NAO se chama "outro": e encontro de contas, dinheiro nenhum saiu, e '
      + 'registra-lo como Pix faria a conciliacao bancaria nunca fechar');
}

// ------------------------------------------- C8 o recibo, que ate 10/09 nao existia
//
// A TELA REGISTRAVA PAGAMENTO E NAO MOSTRAVA NENHUM. Depois de pagar, a unica
// coisa que mudava era o saldo - e numa conta paga em duas vezes ninguem
// respondia "quando foi a primeira, e por qual chave?" sem abrir o banco. A
// razao pela qual esta tela existe (`Q-PAGAMENTO-01`) e justamente que o sistema
// sabia o QUANTO e nao sabia o SE.
{
  const pgto = (o: Partial<PagamentoDaConta> = {}): PagamentoDaConta => ({
    id: 'p1', data_pagamento: '2026-09-03', valor_centavos: 50_000,
    forma: 'pix', referencia_externa: null, observacao: null, ...o,
  });

  chk('C8a', recibo(conta()).frase === 'nada pago ainda' && recibo(conta()).alerta === false,
      'conta nunca paga DIZ isso - "0 pagamentos" soaria a defeito, e nao a estado normal');

  chk('C8b', recibo(conta({ pagamento: [pgto()], valor_pago_centavos: 50_000 })).frase === 'pago em 03/09/2026',
      'pago de uma vez: a data resolve a pergunta inteira, sem ninguem abrir nada');

  {
    const r = recibo(conta({
      valor_pago_centavos: 100_000,
      pagamento: [pgto(), pgto({ id: 'p2', data_pagamento: '2026-09-09' })],
    }));
    chk('C8c', r.frase.startsWith('2 pagamentos') && r.frase.includes('09/09/2026') && !r.alerta,
        `pago em partes: a contagem e a ultima data (veio "${r.frase}")`);
  }

  /*
   * C8d E A VERIFICACAO QUE JUSTIFICA A FUNCAO EXISTIR. `valor_pago_centavos` e
   * mantido por gatilho a partir da tabela de pagamentos: os dois so divergem se
   * alguem escrever no banco por fora. Quando isso acontece, o numero da tela
   * deixa de ter historia por tras - e somar em silencio seria a tela afirmando
   * uma quitacao que nao tem recibo.
   */
  {
    const r = recibo(conta({ valor_pago_centavos: 70_000, pagamento: [] }));
    chk('C8d', r.alerta === true && r.frase.includes('sem nenhum pagamento registrado'),
        'saldo que diz "pago" sem pagamento registrado e ACUSADO, e nao somado em silencio');
  }

  chk('C8e', recibo(conta({ pagamento: undefined })).frase === 'nada pago ainda',
      'e uma resposta antiga, sem a lista, nao quebra a tela - ela le como "nada pago"');

  chk('C8f', emBr('2026-09-03') === '03/09/2026' && emBr('2026-09-03T00:00:00.000Z') === '03/09/2026',
      'a data sai brasileira venha ela como `date` puro ou com horario junto');
}

// ============================================================================
// L — a lista que vem do servidor em blocos (03/10/2026)
// ============================================================================

const bloco = (ids: string[], o: Partial<BlocoDeContas> = {}): BlocoDeContas => ({
  itens: ids.map((id) => conta({ id })),
  total: 5, total_geral: 9, inicio: 0, limite: 2, hoje: '2026-10-03',
  totais: { em_aberto: { qtd: 0, saldo_centavos: 0 }, vencidas: { qtd: 0, saldo_centavos: 0 } },
  ...o,
});

{
  chk('L1', consultaDaLista({ busca: '', situacao: '', ordem: 'vencimento', desc: false }) === '',
      'o pedido padrao nao manda nada: o servidor ja ordena por vencimento crescente');
  const q = new URLSearchParams(consultaDaLista({
    busca: '  João  ', situacao: 'parcial', ordem: 'saldo', desc: true, inicio: 400, limite: 200 }).slice(1));
  chk('L1b', q.get('busca') === 'João' && q.get('situacao') === 'parcial' && q.get('ordem') === 'saldo'
          && q.get('desc') === '1' && q.get('inicio') === '400' && q.get('limite') === '200',
      'busca (aparada, com acento — quem tira e o servidor), situacao, ordem, direcao e o bloco vao na query');
}

{
  const h = hojeDoServidor('2026-10-03');
  chk('L2', h.getFullYear() === 2026 && h.getMonth() === 9 && h.getDate() === 3,
      'o «hoje» do servidor vira o dia 3 LOCAL — `new Date(\'2026-10-03\')` seria meia-noite UTC, 21h do dia 2 no Brasil');
  chk('L2b', estaAtrasada(conta({ vencimento: '2026-10-02' }), h) && !estaAtrasada(conta({ vencimento: '2026-10-03' }), h),
      'com o hoje do servidor, a que venceu ontem e vencida e a que vence hoje nao — o selo da linha e o total do aviso usam o mesmo dia');
}

{
  const b1 = bloco(['a', 'b']);
  const s0 = semSeguintes(b1);
  chk('L3', inicioDoProximo(s0) === 2 && haMaisContas(s0),
      'depois do primeiro bloco de 2 (de 5), o proximo comeca na 3a linha e ha mais');
  const s1 = acrescentarBloco(s0, bloco(['c', 'd'], { inicio: 2 }));
  chk('L3b', s1.itens.map((c) => c.id).join(',') === 'c,d' && inicioDoProximo(s1) === 4 && haMaisContas(s1),
      'cada bloco acrescenta e avanca o inicio pelo tamanho do bloco');
  const s2 = acrescentarBloco(s1, bloco(['d', 'e'], { inicio: 4 }));
  chk('L3c', s2.itens.map((c) => c.id).join(',') === 'c,d,e' && inicioDoProximo(s2) === 6 && !haMaisContas(s2),
      'conta repetida entre blocos nao entra duas vezes, e o fim e medido pelo INICIO contra o total — '
      + 'pela contagem na tela (5 de 5 so por acaso) o botao poderia nunca sumir');
  const outra = bloco(['z']);
  chk('L3d', seguintesDe(s2, outra).itens.length === 0 && seguintesDe(s2, b1) === s2,
      'trocar busca/filtro/ordem rele o primeiro bloco e descarta os seguintes da consulta velha');
}

{
  chk('L4', contagemDaLista(2, { total: 5, total_geral: 5 }) === '2 de 5',
      'com mais por carregar, a contagem diz quantas faltam — nada de «paginacao escondida»');
  chk('L4b', contagemDaLista(5, { total: 5, total_geral: 5 }) === '5 contas'
          && contagemDaLista(1, { total: 1, total_geral: 1 }) === '1 conta',
      'tudo carregado: diz o numero, no singular quando e uma');
  chk('L4c', contagemDaLista(3, { total: 3, total_geral: 9 }) === '3 contas (de 9 no total)',
      'com busca ou filtro recortando, diz de quantas no total — «3» sozinho pareceria a tabela inteira');
}

{
  const pedidos: Array<[number, number]> = [];
  const universo = ['1', '2', '3', '4', '5'];
  const todas = await lerTodasAsContas(async (inicio, limite) => {
    pedidos.push([inicio, limite]);
    // a 4a aparece de novo no bloco seguinte, como se uma conta tivesse mudado de lugar
    const ids = universo.slice(inicio, inicio + limite);
    if (inicio === 2) ids.push('2');
    return bloco(ids, { total: universo.length, inicio, limite });
  }, 2);
  chk('L5', todas.map((c) => c.id).join(',') === '1,2,3,4,5' && pedidos.map((p) => p[0]).join(',') === '0,2,4',
      'o CSV le TODAS as que casam, bloco a bloco ate o total, sem repetir — e nao so as carregadas na tela');
  const vazio = await lerTodasAsContas(async () => bloco([], { total: 0 }), 500);
  chk('L5b', vazio.length === 0, 'lista vazia: uma ida so, e acaba');
}

{
  const chaves = ['vencida', 'aberta', 'parcial', 'paga', 'cancelada'] as const;
  const diverge = chaves.filter((k) => PESO_DA_SITUACAO[k] !== pesoDoSelo(SELO_DA_CONTA_A_PAGAR[k]));
  chk('L6', diverge.length === 0,
      'o peso de cada situacao no SQL do servidor e o `pesoDoSelo` da tela concordam nas cinco — '
      + `a ordem «o que precisa de voce primeiro» e uma so (divergem: ${diverge.join(', ') || 'nenhuma'})`);

  const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  const amostras = ['João', 'ÇAÇÃO', 'Érica Ünder', 'ação de cobrança'];
  chk('L6b', /export function normalizar\(s: string\): string \{\s*return s\.toLowerCase\(\)\.normalize\('NFD'\)/.test(ui)
          && amostras.every((a) => normalizarBusca(a) === a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')),
      'a busca do servidor normaliza como a da tela (minusculo + NFD sem marca): «joao» continua achando «João»');
}

console.log(`\n${falhas === 0 ? 'TODAS PASSARAM' : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
