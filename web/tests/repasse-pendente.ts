// A FILA ONDE O DINHEIRO ESPERA — as regras da tela, sem banco e sem rede.
// Uso: node --experimental-strip-types web/tests/repasse-pendente.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e a mais importante e uma AUSENCIA.
//
// A fila mistura duas esperas que parecem iguais numa tabela e sao opostas para
// quem opera: uma pede acao de uma pessoa (falta o dono da usina) e a outra pede
// que ninguem faca nada (o banco ainda nao confirmou). O erro caro nao e mostrar
// o rotulo errado - e oferecer um BOTAO de repartir na segunda, porque clicar
// nele reparte dinheiro sobre uma intencao de pagamento, que e exatamente o que
// a espera existe para impedir (`Q-BAIXAOPER-01`).
//
// Por isso `R3` afirma a ausencia do botao, e nao a presenca do texto.

import {
  motivoDaEspera, podeRepartirAgora, contarPorMotivo, totalCentavos,
  ordenarPelaEspera, resumoDaEspera, ROTULO_DO_MOTIVO, EXPLICACAO_DO_MOTIVO,
  type RepassePendente,
} from '../src/repasse-pendente.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const linha = (e: Partial<RepassePendente> = {}): RepassePendente => ({
  liquidacao_id: 'l1', data_liquidacao: '2026-09-01', valor_liquidado_centavos: 100_000,
  competencia: '2026-08-01', codigo_geradora: '0001', usina_sem_dono: false,
  origem: 'webhook_sicoob', ...e,
});

// ---------------------------------------------------- R1 as tres esperas
chk('R1', motivoDaEspera(linha({ usina_sem_dono: true })) === 'sem_dono'
      && motivoDaEspera(linha({ origem: 'webhook_sicoob' })) === 'aguardando_banco'
      && motivoDaEspera(linha({ origem: 'manual' })) === 'pronto'
      && motivoDaEspera(linha({ origem: 'conciliacao' })) === 'pronto',
    'o aviso do banco espera confirmacao; a baixa manual e a conferida no banco ja estao provadas, '
    + 'entao so lhes falta repartir');

// ---------------------------------------------------- R2 sem dono vence
chk('R2', motivoDaEspera(linha({ usina_sem_dono: true, origem: 'webhook_sicoob' })) === 'sem_dono',
    'esperando as DUAS coisas, a tela mostra a que exige gente: mesmo depois de o banco confirmar '
    + 'essa linha continuaria parada, e mandar a pessoa esperar seria mandar esperar por nada');

// ---------------------------------------------------- R3 o botao que NAO existe
chk('R3', podeRepartirAgora(linha({ origem: 'webhook_sicoob' })) === false
      && podeRepartirAgora(linha({ usina_sem_dono: true, origem: 'manual' })) === false
      && podeRepartirAgora(linha({ origem: 'manual' })) === true,
    'nao ha botao de repartir enquanto o banco nao confirma - clicar ali repartiria dinheiro sobre '
    + 'uma intencao de pagamento. A ausencia do botao E a regra, e nao prudencia de quem desenhou');

// ---------------------------------------------------- R4 a ordem serve a quem age
{
  const ls = [
    linha({ liquidacao_id: 'espera-nova', origem: 'webhook_sicoob', data_liquidacao: '2026-09-08' }),
    linha({ liquidacao_id: 'sem-dono-velha', usina_sem_dono: true, data_liquidacao: '2026-07-01' }),
    linha({ liquidacao_id: 'pronta', origem: 'manual', data_liquidacao: '2026-09-05' }),
    linha({ liquidacao_id: 'sem-dono-nova', usina_sem_dono: true, data_liquidacao: '2026-09-02' }),
  ];
  const ids = ordenarPelaEspera(ls).map((l) => l.liquidacao_id);
  chk('R4', ids[0] === 'pronta' && ids[1] === 'sem-dono-velha' && ids[2] === 'sem-dono-nova'
        && ids[3] === 'espera-nova',
      'quem exige acao vem primeiro e, dentro do grupo, o dinheiro que espera ha mais tempo: '
      + `${ids.join(' < ')}`);
}

// ---------------------------------------------------- R5 ordenar nao altera a lista recebida
{
  const ls = [linha({ liquidacao_id: 'a', origem: 'webhook_sicoob' }), linha({ liquidacao_id: 'b', origem: 'manual' })];
  ordenarPelaEspera(ls);
  chk('R5', ls[0]!.liquidacao_id === 'a',
      'a ordenacao devolve lista nova e nao mexe na que veio - a mesma lista alimenta o total e a '
      + 'contagem, e reordenar por baixo delas e o tipo de efeito que ninguem procura depois');
}

// ---------------------------------------------------- R6 contagem e total
{
  const ls = [
    linha({ origem: 'webhook_sicoob', valor_liquidado_centavos: 10_000 }),
    linha({ origem: 'webhook_sicoob', valor_liquidado_centavos: 20_000 }),
    linha({ usina_sem_dono: true, valor_liquidado_centavos: 30_000 }),
    linha({ origem: 'manual', valor_liquidado_centavos: 1 }),
  ];
  const c = contarPorMotivo(ls);
  chk('R6', c.aguardando_banco === 2 && c.sem_dono === 1 && c.pronto === 1
        && totalCentavos(ls) === 60_001,
      'a contagem cobre as tres esperas e o total soma ao centavo - e dinheiro de gente, e o '
      + 'centavo perdido aqui seria o mesmo centavo perdido no repasse');
}

// ---------------------------------------------------- R7 vazio nao vira frase
chk('R7', resumoDaEspera([]) === '',
    'lista vazia nao produz texto: nada esperando e o estado NORMAL, e escrever "0 pendencias" '
    + 'poe na tela um problema que nao existe');

// ---------------------------------------------------- R8 o resumo nomeia so o que ha
{
  const so = resumoDaEspera([linha({ usina_sem_dono: true })]);
  chk('R8', so.includes('dono') && !so.includes('banco'),
      `com uma espera so, a frase fala de uma so: "${so}"`);
}

// ---------------------------------------------------- R9 o texto nao devolve jargao
{
  const textos = [...Object.values(ROTULO_DO_MOTIVO), ...Object.values(EXPLICACAO_DO_MOTIVO)].join(' ');
  const jargao = /\bsplit\b|\bcamada\b|liquida[cç][aã]o|webhook|Q-[A-Z]|R12|npm |conciliac/i;
  chk('R9', !jargao.test(textos),
      'nem rotulo nem explicacao usam a palavra interna do sistema - quem le esta tela quer saber '
      + 'de quem recebe o dinheiro, nao do nome que o codigo da ao evento');
}

console.log(`\n--- repasse pendente (a fila onde o dinheiro espera): ${feitas} verificacoes, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
