// O HISTORICO NA TELA — rotulos, formatos e agrupamento.
// Uso: node --experimental-strip-types web/tests/historico.ts
//
// ============================================================================
// A VERIFICACAO QUE JUSTIFICA O ARQUIVO, e ela e a H1
//
// `ROTULO_DA_TABELA` traduz nome de tabela para portugues, e uma lista dessas
// envelhece sozinha: a proxima migration que acrescentar um gatilho `auditar_*`
// passa a produzir linhas de trilha que a tela mostraria como `nome_da_tabela` —
// que e jargao de banco no meio da tela, exatamente o que a suite de vocabulario
// proibe no resto do sistema.
//
// Por isso a H1 nao confere a lista contra a minha memoria: ela LE os gatilhos
// do proprio `prisma/migrations` e exige rotulo para cada tabela auditada. E o
// mesmo metodo de `tests/prontidao-destino.ts` e de `web/tests/rotas-com-tela.ts`
// — medir o codigo com o codigo, em vez de confiar numa anotacao.
//
// A H2 e da mesma familia e fecha o outro lado: a lista das rodadas automaticas
// existe DUAS vezes (servidor e tela), porque uma delas decide a consulta e a
// outra decide a frase do interruptor. Duas listas que discordassem produziriam
// uma tela que promete esconder e mostra, ou que promete mostrar e esconde.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ROTULO_DA_TABELA, RODADAS_AUTOMATICAS, rotuloDaTabela, rotuloDaColuna, valorNaTela,
  quemFez, resumoDaLinha, porDia, tituloDoDia, horaDaLinha, veioCortada, ehRodadaAutomatica,
  VERBO, type LinhaDaTrilha,
} from '../src/historico.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

// ============================================================================
// H1 — toda tabela auditada tem rotulo
// ============================================================================

/**
 * As tabelas auditadas, lidas das migrations. Dois formatos, porque as
 * migrations usam os dois:
 *
 *   `CREATE TRIGGER auditar_conta_pagar`      nome literal;
 *   `FOREACH t IN ARRAY ARRAY['a','b'] ...`   um bloco `DO` que cria varios de
 *                                             uma vez, com `auditar_%s`.
 */
function tabelasAuditadas(): Set<string> {
  const dir = `${RAIZ}prisma/migrations/`;
  const saida = new Set<string>();

  for (const m of readdirSync(dir).sort()) {
    let sql: string;
    try { sql = readFileSync(`${dir}${m}/migration.sql`, 'utf8'); } catch { continue; }

    for (const g of sql.matchAll(/CREATE TRIGGER auditar_([a-z_]+)/g)) saida.add(g[1]!);

    /* O bloco `DO $$ ... $$` que cria varios: os nomes estao no `ARRAY[...]`
     * mais proximo, dentro do mesmo bloco. Recortar por bloco evita colher um
     * `ARRAY` de outra coisa que esteja no mesmo arquivo. */
    for (const bloco of sql.split(/DO \$\$/).slice(1)) {
      if (!bloco.includes('auditar_%s')) continue;
      const corpo = bloco.split(/\$\$;/)[0] ?? '';
      for (const arr of corpo.matchAll(/ARRAY\s*\[([^\]]*)\]/g)) {
        for (const nome of arr[1]!.matchAll(/'([a-z_]+)'/g)) saida.add(nome[1]!);
      }
    }
  }
  return saida;
}

const AUDITADAS = tabelasAuditadas();

chk('H1-0', AUDITADAS.size >= 25,
    `a leitura das migrations achou ${AUDITADAS.size} tabelas auditadas — a suite nao esta `
    + 'medindo uma pasta vazia nem uma expressao que parou de casar');

{
  const semRotulo = [...AUDITADAS].filter((t) => !(t in ROTULO_DA_TABELA)).sort();
  chk('H1', semRotulo.length === 0,
      `toda tabela com gatilho de auditoria tem rotulo em portugues${
        semRotulo.length ? ` — SEM ROTULO: ${semRotulo.join(', ')}` : ''}`);
}

{
  /*
   * O QUE SE MEDE E O SUBLINHADO, e nao a identidade — e a distincao e um
   * resultado da regra 7 do `CLAUDE.md`, nao uma frouxidao desta suite.
   *
   * A primeira versao desta verificacao exigia rotulo DIFERENTE do nome da
   * tabela, e acusou sete: `cliente`, `contrato`, `usina`, `originador`,
   * `tarifa`, `fatura` e `boleto`. Nenhuma delas e preguica — sao tabelas cujo
   * nome ja E a palavra portuguesa que a pessoa usa, porque o dominio deste
   * sistema foi nomeado em portugues desde a primeira migration. Traduzir
   * `fatura` para outra coisa seria inventar um segundo vocabulario.
   *
   * O que a tela nao pode receber e SUBLINHADO: `conta_pagar` na celula e
   * jargao de banco, e e o que a suite de vocabulario proibe no resto do
   * sistema.
   */
  const comSublinhado = Object.entries(ROTULO_DA_TABELA).filter(([, rotulo]) => /_/.test(rotulo));
  chk('H1b', comSublinhado.length === 0,
      `nenhum rotulo de tabela carrega sublinhado${
        comSublinhado.length ? ` — ACHADO: ${comSublinhado.map(([t]) => t).join(', ')}` : ''}`);

  /* E as que PRECISAM de traducao a receberam: as de nome composto sao
   * justamente aquelas em que o nome da tabela nao e uma palavra. */
  const compostas = [...AUDITADAS].filter((t) => t.includes('_'));
  const naoTraduzidas = compostas.filter((t) => ROTULO_DA_TABELA[t] === t);
  chk('H1b2', compostas.length >= 10 && naoTraduzidas.length === 0,
      `as ${compostas.length} tabelas de nome composto foram traduzidas de verdade${
        naoTraduzidas.length ? ` — FALTAM: ${naoTraduzidas.join(', ')}` : ''}`);
}

chk('H1c', rotuloDaTabela('tabela_que_nao_existe') === 'tabela_que_nao_existe',
    'o que nao tem rotulo aparece com o nome que tem — a tela nunca mostra vazio no lugar '
    + 'de uma alteracao que aconteceu');

// ============================================================================
// H2 — as duas listas das rodadas automaticas concordam
// ============================================================================

{
  const servidor = readFileSync(`${RAIZ}src/repos/auditoria.ts`, 'utf8');
  /* O `=\s*\[` e obrigatorio: a declaracao carrega a anotacao `readonly string[]`
   * antes do valor, e um `[...]` preguicoso casaria com o `[]` do TIPO e
   * devolveria lista vazia — que passaria a verificacao por engano se o outro
   * lado tambem estivesse vazio. */
  const bloco = /export const RODADAS_AUTOMATICAS[^=]*=\s*\[([^\]]*)\]/.exec(servidor);
  const doServidor = [...(bloco?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();

  chk('H2', doServidor.length === 3 && doServidor.join(',') === [...RODADAS_AUTOMATICAS].sort().join(','),
      `a lista da tela e a do servidor sao a mesma (servidor: ${doServidor.join(', ')})`);
  chk('H2b', doServidor.every((t) => t in ROTULO_DA_TABELA),
      'e as tres tem rotulo — elas aparecem quando o interruptor liga, e apareceriam como '
      + 'nome de tabela sem isto');
  chk('H2c', ehRodadaAutomatica('agenda_execucao') && !ehRodadaAutomatica('fatura'),
      'o reconhecedor separa o batimento da maquina do que pessoas fazem');
}

// ============================================================================
// H3 — as colunas
// ============================================================================

chk('H3', rotuloDaColuna('valor_pago_centavos') === 'valor pago',
    'a regra geral corta o `_centavos` (o valor ja sai em reais) e desfaz o sublinhado');
chk('H3b', rotuloDaColuna('categoria_id') === 'categoria',
    'e corta o `_id`: o que interessa e a coisa, nao a chave');
chk('H3c', rotuloDaColuna('status') === 'situacao' || rotuloDaColuna('status') === 'situação',
    '`status` tem rotulo escrito, porque a regra geral o deixaria em ingles');
chk('H3d', rotuloDaColuna('coluna_nunca_vista_antes') === 'coluna nunca vista antes',
    'coluna sem rotulo escrito ainda assim sai legivel — uma lista sem regra geral '
    + 'envelheceria na primeira migration');

{
  /* NENHUM ROTULO DE COLUNA CHEGA A TELA COM SUBLINHADO, e esta e a ponte com a
   * suite de vocabulario: `web/tests/vocabulario-das-telas.ts` proibe snake_case
   * no texto exibido, e o texto exibido aqui vem por interpolacao — que aquela
   * suite corta antes de medir. Ou seja: se esta verificacao nao existisse,
   * ninguem estaria medindo o jargao desta tela. */
  const amostra = ['valor_centavos', 'data_pagamento', 'origem_split_item_id', 'numero_uc',
                   'percentual_rateio', 'tipo_chave_pix', 'qualquer_coisa_nova'];
  const comSublinhado = amostra.filter((c) => /_/.test(rotuloDaColuna(c)));
  chk('H3e', comSublinhado.length === 0,
      `nenhum rotulo de coluna chega a tela com sublinhado${
        comSublinhado.length ? ` — ACHADO: ${comSublinhado.join(', ')}` : ''}`);
}

// ============================================================================
// H4 — os valores
// ============================================================================

chk('H4', valorNaTela('valor_centavos', '12345').includes('123,45'),
    'centavo vira real na coluna de dinheiro');
chk('H4b', valorNaTela('numero_uc', '12345') === '12345',
    'e o MESMO numero em outra coluna continua numero — quem decide o formato e a coluna, '
    + 'nao o valor: adivinhar pelo formato produziria dinheiro onde nao ha');
chk('H4c', valorNaTela('nome', null) === '—',
    'ausencia vira travessao, e nunca "R$ 0,00" — a diferenca entre "nao tem valor" e '
    + '"vale nada" e a diferenca entre nao lancado e lancado como zero');
chk('H4d', valorNaTela('valor_centavos', null) === '—',
    'inclusive em coluna de dinheiro, que e onde o erro custaria');
chk('H4e', valorNaTela('obs', '') === '(vazio)',
    'e texto apagado e dito, porque apagar o conteudo de um campo e um ato');
chk('H4f', valorNaTela('ativo', 'true') === 'sim' && valorNaTela('ativo', 'false') === 'não',
    'booleano vira sim/nao');
chk('H4g', valorNaTela('vencimento', '2026-09-10') === '10/09/2026',
    'data ISO vira data brasileira');
chk('H4h', valorNaTela('criado_em', '2026-09-10T13:24:40.123Z') === '10/09/2026 13:24',
    'e data com hora mostra a hora, sem os segundos que ninguem le');
chk('H4i', valorNaTela('cliente_id', '804294b7-6546-418e-92a4-dd451ff15073') === '804294b7…',
    'identificador longo aparece encurtado: trinta e seis caracteres empurram a coluna '
    + 'vizinha para fora, e ninguem reconhece um pelo fim');
chk('H4j', valorNaTela('nome', 'Maria Silva') === 'Maria Silva',
    'e texto comum passa intacto');

// ============================================================================
// H5 — quem fez
// ============================================================================

const linha = (p: Partial<LinhaDaTrilha>): LinhaDaTrilha => ({
  id: '1', ocorrido_em: '2026-09-10T13:24:40.000Z', tabela: 'cliente', registro_id: 'r',
  operacao: 'U', quem: null, usuario_id: null, de_plataforma: false, mudancas: [], ...p,
});

chk('H5', quemFez(linha({ quem: 'Maria', usuario_id: 'u' })) === 'Maria',
    'com nome, mostra o nome');
chk('H5b', quemFez(linha({ quem: null, usuario_id: 'u' })) === 'alguém que não está mais nesta empresa',
    'com usuario e sem nome, DIZ que nao sabe — a policy do banco nao devolve o nome de quem '
    + 'saiu, e inventar um seria pior');
chk('H5c', quemFez(linha({})) === 'o próprio sistema',
    'sem usuario nenhum, foi rotina de banco — e as duas ausencias sao coisas diferentes');
chk('H5d', quemFez(linha({ de_plataforma: true })) === 'o suporte do sistema'
        && quemFez(linha({ quem: 'Ana', usuario_id: 'u', de_plataforma: true })) === 'Ana (suporte)',
    'quem entrou por fora do tenant e identificado como tal');

// ============================================================================
// H6 — o resumo da linha
// ============================================================================

const mud = (...cs: string[]) => cs.map((coluna) => ({ coluna, de: 'a', para: 'b' }));

chk('H6', resumoDaLinha(linha({ mudancas: mud('status', 'vencimento') })).includes('situa'),
    'ate tres campos aparecem por nome, e traduzidos');
chk('H6b', resumoDaLinha(linha({ mudancas: mud('a', 'b', 'c', 'd') })) === '4 campos',
    'dai para cima vira contagem — doze rotulos numa celula deixa de ser resumo');
chk('H6c', resumoDaLinha(linha({ operacao: 'U', mudancas: [] })) === 'mandou salvar, e nenhum valor mudou',
    'o UPDATE que nao mudou nada DIZ isso, em vez de mostrar uma celula vazia que pareceria defeito');
chk('H6d', VERBO.I === 'criou' && VERBO.U === 'alterou' && VERBO.D === 'apagou',
    'os tres verbos estao no passado — a trilha so fala de coisa que ja aconteceu');

// ============================================================================
// H7 — o dia
// ============================================================================

chk('H7', tituloDoDia('2026-09-10', '2026-09-10') === 'hoje'
       && tituloDoDia('2026-09-09', '2026-09-10') === 'ontem'
       && tituloDoDia('2026-09-08', '2026-09-10') === '08/09/2026',
    'hoje, ontem, e a data para o resto');
chk('H7b', tituloDoDia('2026-08-31', '2026-09-01') === 'ontem',
    'e "ontem" atravessa a virada do mes — a conta e de calendario, nao de subtrair um do dia');

{
  const ls = [
    linha({ id: '1', ocorrido_em: '2026-09-10T13:00:00.000Z' }),
    linha({ id: '2', ocorrido_em: '2026-09-10T09:00:00.000Z' }),
    linha({ id: '3', ocorrido_em: '2026-09-08T09:00:00.000Z' }),
  ];
  const ds = porDia(ls, '2026-09-10');
  chk('H7c', ds.length === 2 && ds[0]!.linhas.length === 2 && ds[1]!.linhas.length === 1,
      'as linhas se agrupam por dia');
  chk('H7d', ds[0]!.titulo === 'hoje' && ds[0]!.linhas[0]!.id === '1',
      'e a ordem que o servidor mandou e preservada — reordenar aqui seria uma segunda '
      + 'opiniao sobre a mesma coisa');
  chk('H7e', porDia([], '2026-09-10').length === 0,
      'lista vazia nao inventa um dia');
}

chk('H7f', horaDaLinha('2026-09-10T13:24:40.000Z') === '13:24',
    'a linha mostra a hora, ja que o dia virou titulo');

// ============================================================================
// H8 — a lista cortada
// ============================================================================

{
  const cheia = { linhas: new Array(200).fill(linha({})), tabelas: [], teto: 500 };
  const curta = { linhas: new Array(12).fill(linha({})), tabelas: [], teto: 500 };
  chk('H8', veioCortada(cheia, 200) === true,
      'quando voltam tantas linhas quantas foram pedidas, a lista NAO terminou: ela foi cortada, '
      + 'e a tela precisa dizer isso');
  chk('H8b', veioCortada(curta, 200) === false,
      'e uma lista menor que o pedido acabou de verdade');
  chk('H8c', veioCortada({ linhas: new Array(500).fill(linha({})), tabelas: [], teto: 500 }, 9000) === true,
      'pedir acima do teto tambem devolve cortada — o teto do servidor vence o pedido da tela');
}

console.log();
if (falhas > 0) { console.log(`--- historico: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- historico (a trilha na tela): ${feitas} verificacoes, 0 falhas`);
