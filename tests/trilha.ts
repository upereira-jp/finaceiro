// A DIFERENCA DA TRILHA DE AUDITORIA. Puro, sem banco.
// Uso: node --experimental-strip-types tests/trilha.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e por que valem mais do que parecem.
//
// A trilha e a unica coisa do sistema que responde "quem fez isto?", e ela so
// tem valor se for FIEL. Uma reducao que engole uma coluna alterada nao produz
// erro, nao produz log e nao produz falta: produz uma tela que afirma, com toda
// a confianca, que aquele campo nao mudou. E o mesmo formato de dano que este
// projeto persegue nas policies - a resposta errada com cara de resposta certa.
//
// Por isso o T3 abaixo e o mais importante do arquivo: ele afirma que TODA
// coluna que mudou aparece, inclusive as feias, inclusive as internas. As tres
// que ficam de fora estao nomeadas em `FORA_DA_DIFERENCA`, com motivo escrito, e
// nenhuma delas e uma coluna que muda.

import {
  mudancas, comoTexto, naoMudouNada, FORA_DA_DIFERENCA, TETO_DO_VALOR,
} from '../src/dominio/trilha.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

// ============================================================ T1 comoTexto

chk('T1', comoTexto(null) === null && comoTexto(undefined) === null,
    'ausencia continua ausencia, e nao vira a string "null" - a tela precisa distinguir '
    + '"ficou vazio" de "passou a conter a palavra null"');
chk('T1b', comoTexto('') === '',
    'texto vazio NAO e ausencia: alguem apagou o conteudo do campo, e isso e um fato');
chk('T1c', comoTexto(12345) === '12345' && comoTexto(true) === 'true' && comoTexto(0) === '0',
    'numero e booleano viram texto sem perder nada - inclusive o zero, que e falsy em JS '
    + 'e sumiria numa implementacao ingenua');
chk('T1d', comoTexto({ a: 1 }) === '{"a":1}' && comoTexto([1, 2]) === '[1,2]',
    'objeto e lista viram JSON compacto');

// ============================================================ T2 as tres operacoes

{
  const antes = { id: 'x', tenant_id: 't', nome: 'Maria', valor_centavos: 100, obs: null };
  const depois = { id: 'x', tenant_id: 't', nome: 'Maria Silva', valor_centavos: 100, obs: null };
  const m = mudancas('U', antes, depois);

  chk('T2', m.length === 1 && m[0]!.coluna === 'nome',
      `um UPDATE que tocou uma coluna de cinco produz UMA linha (produziu ${m.length})`);
  chk('T2b', m[0]!.de === 'Maria' && m[0]!.para === 'Maria Silva',
      'e ela carrega o antes e o depois, que e a resposta inteira');
}

{
  const m = mudancas('I', null, { id: 'x', tenant_id: 't', nome: 'Nova', apelido: null, criado_em: 'hoje' });
  chk('T3', m.length === 1 && m[0]!.coluna === 'nome',
      `um INSERT mostra o que a linha nasceu tendo, sem os vazios nem as tres de fora (veio ${
        m.map((x) => x.coluna).join(', ')})`);
  chk('T3b', m[0]!.de === null,
      'e o "antes" e ausencia de verdade - nao havia linha');
}

{
  const m = mudancas('D', { id: 'x', tenant_id: 't', nome: 'Sumiu', apelido: null }, null);
  chk('T4', m.length === 1 && m[0]!.de === 'Sumiu' && m[0]!.para === null,
      'um DELETE mostra o que a linha TINHA, e o depois e ausencia');
}

// ============================================================ T5 nada some

/*
 * A VERIFICACAO CENTRAL DO ARQUIVO. Uma coluna alterada que nao aparece e uma
 * trilha que mente com cara de trilha - e nenhuma suite de tipo pegaria, porque
 * o tipo da saida continua certo.
 */
{
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  const nomes = ['a_feia', 'zzz_interna', 'x', 'percentual_rateio', 'ativo', 'status'];
  for (const n of nomes) { antes[n] = 'antes'; depois[n] = 'depois'; }
  const m = mudancas('U', antes, depois);
  chk('T5', m.length === nomes.length,
      `todas as ${nomes.length} colunas alteradas aparecem, inclusive as de nome feio (vieram ${m.length})`);
  chk('T5b', m.map((x) => x.coluna).join(',') === nomes.join(','),
      'e na ORDEM do banco, que e a ordem em que quem desenhou a tabela agrupou o que e da mesma familia');
}

{
  /* As tres de fora nao sao "colunas chatas": sao colunas que nao mudam ou que
   * repetem algo que a propria linha da trilha ja mostra. Se uma delas MUDAR, a
   * regra continua escondendo - e por isso a lista e curta e tem motivo escrito. */
  chk('T5c', FORA_DA_DIFERENCA.length === 3
          && FORA_DA_DIFERENCA.includes('tenant_id')
          && FORA_DA_DIFERENCA.includes('id')
          && FORA_DA_DIFERENCA.includes('criado_em'),
      'a lista do que fica de fora tem exatamente tres, e sao as tres declaradas');
}

// ============================================================ T6 o corte

{
  const gigante = 'x'.repeat(TETO_DO_VALOR * 3);
  const m = mudancas('U', { campo: 'antes' }, { campo: gigante });
  chk('T6', m[0]!.para!.length === TETO_DO_VALOR,
      `valor gigante e cortado no teto de ${TETO_DO_VALOR} - sem isso, uma linha de `
      + '`conector_execucao` (11.676 bytes de JSON, medida em producao) viajaria inteira');
  chk('T6b', m[0]!.cortado === true,
      'e o corte e DECLARADO - a tela avisa em vez de fingir que o texto acabou ali');
  chk('T6c', mudancas('U', { c: 'a' }, { c: 'b' })[0]!.cortado === undefined,
      'o que cabe nao carrega a marca de cortado');
}

// ============================================================ T7 o U que nao mudou nada

{
  const igual = { id: 'x', nome: 'Maria' };
  const m = mudancas('U', igual, { ...igual });
  chk('T7', m.length === 0,
      'um UPDATE que reescreveu os mesmos valores produz diferenca vazia');
  chk('T7b', naoMudouNada('U', m) === true && naoMudouNada('I', []) === false,
      'e isso e RECONHECIVEL, para a tela poder dizer "mandou salvar e nada mudou" em vez de '
      + 'mostrar uma lista vazia, que pareceria defeito');
}

// ============================================================ T8 o nulo dos dois lados

{
  const m = mudancas('U', { campo: null }, { campo: 'agora tem' });
  chk('T8', m.length === 1 && m[0]!.de === null && m[0]!.para === 'agora tem',
      'preencher um campo que estava vazio E uma mudanca, e aparece');
  const n = mudancas('U', { campo: 'tinha' }, { campo: null });
  chk('T8b', n.length === 1 && n[0]!.para === null,
      'e apagar o conteudo de um campo tambem - este e o caso que uma comparacao por '
      + 'truthiness engoliria');
}

// ============================================================ T9 a linha vazia

chk('T9', mudancas('U', null, null).length === 0 && mudancas('I', null, null).length === 0,
    'sem `antes` e sem `depois` a saida e vazia, e nao um estouro - a trilha tem linhas '
    + 'antigas em que o gatilho gravou menos do que grava hoje');

console.log(falhas === 0 ? '\nEXIT=0' : `\nFALHAS: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
