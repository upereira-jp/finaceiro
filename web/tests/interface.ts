// A INTERFACE, verificada por leitura do proprio CSS e dos proprios dados.
// Uso: node --experimental-strip-types web/tests/interface.ts
//
// POR QUE ESTA SUITE EXISTE. O acabamento de 30/07/2026 trouxe quatro promessas
// que estavam escritas em comentario e nenhuma delas se sustentava sozinha:
//
//   1. "nenhuma cor literal no estilo" — e havia tres, no bloco do documento
//      impresso. Elas estao CERTAS: papel e preto sobre branco independente do
//      tema. O que faltava era a lista ser fechada, para a quarta doer;
//   2. "so estas seis se movem, e todo movimento para sob prefers-reduced-motion"
//      — promessa de acessibilidade (WCAG 2.3.3) que um ajuste de CSS apaga sem
//      ninguem notar, e cujo efeito so aparece na maquina de quem precisa dela;
//   3. "toda tela tem icone, rota e titulo unicos" — um menu de navegacao com
//      dois itens do mesmo desenho e um menu em que a pessoa clica no errado;
//   4. "cor nunca e o unico sinal de estado" — a restricao 3 do tema, que agora
//      depende de tres coisas casarem: cor, icone e texto.
//
// TUDO ISTO E LEGIVEL DE MODULO PURO porque o CSS, a iconografia e a navegacao
// sairam do `.tsx` no mesmo dia. Era a condicao para a regra 8 alcancar a camada
// de apresentacao, que e onde ela nunca tinha chegado neste projeto.

import { readFileSync, readdirSync } from 'node:fs';
import { ESTILO, MENU_VIRA_GAVETA } from '../src/estilo.ts';
import { VARIAVEIS_CSS, TIPOGRAFIA, RITMO } from '../src/tema.ts';
import {
  ICONES_QUE_SE_MOVEM, ICONE_DO_ESTADO, ICONE_DO_AVISO, TONS_DO_SELO,
} from '../src/iconografia.ts';
import { SELO_DA_COBRANCA } from '../src/tom-do-estado.ts';
import {
  TELAS, FUNIS, PASTAS, telaDoCaminho, telasDoFunil, primeiraTelaDoFunil, funilDoCaminho,
  funisDaPasta, funisVisiveis, destinoVisivel, secoesDoMenu, caminhoNoMenu, SECAO_DO_GRUPO,
  rotuloDosPassos, fraseDosPassos,
} from '../src/navegacao.ts';
import {
  ABAS, ROTULO_DA_ABA, FRAGMENTO_DO_CADASTRO, abaDoFragmento, fragmentoDaAba,
} from '../src/abas-da-fatura.ts';
import {
  NIVEL_MAXIMO_DO_APERTO, proximoNivelDoAperto, classesDoAperto, larguraDoCampoDaFolha,
} from '../src/layout-regras.ts';

let falhas = 0;
/*
 * O TOTAL E CONTADO, e nao escrito. A versao anterior fechava com o literal
 * "52 verificacoes" e ele ja estava errado quando esta linha foi escrita — a
 * suite cresceu e o numero nao. E a terceira vez que este projeto encontra uma
 * contagem que nao se reproduz, e o `README` ja diz o metodo: a contagem oficial
 * e `npm test | grep -c '^ok '`. Aqui o proprio `chk` conta.
 */
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d}`);
};

// O CSS SEM O BLOCO DE VARIAVEIS. As custom properties sao justamente onde as
// cores da paleta moram, e `tema.ts` ja as verifica uma a uma (T4 da suite do
// tema). O que interessa aqui e o resto: as REGRAS.
const REGRAS = ESTILO.replace(VARIAVEIS_CSS, '');

// ------------------------------------------------- I1 cor literal, lista fechada

const MARCA_INICIO = 'INICIO-DOCUMENTO-IMPRESSO';
const MARCA_FIM = 'FIM-DOCUMENTO-IMPRESSO';
const iIni = REGRAS.indexOf(MARCA_INICIO);
const iFim = REGRAS.indexOf(MARCA_FIM);

chk('I1', iIni > 0 && iFim > iIni,
    'o bloco do documento impresso continua delimitado — sem os marcadores esta suite nao sabe onde a excecao vale');

const foraDoDocumento = REGRAS.slice(0, iIni) + REGRAS.slice(iFim);
const dentroDoDocumento = REGRAS.slice(iIni, iFim);

/** Cor escrita a mao: hexadecimal, `rgb(...)` ou `hsl(...)`. Nome de cor CSS
 *  (`transparent`, `currentColor`, `none`) nao conta — nenhum deles carrega
 *  valor de paleta, e `transparent` e estrutural: e o que mantem o layout parado
 *  quando a borda aparece. */
const literais = (css: string): string[] =>
  css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g) ?? [];

chk('I1b', literais(foraDoDocumento).length === 0,
    `fora do documento impresso, zero cor literal — achadas: ${literais(foraDoDocumento).join(', ') || 'nenhuma'}`);

// AS TRES EXCECOES, NOMEADAS UMA A UMA. Nao e "no maximo tres": e exatamente
// estas. Uma quarta cor de papel — ou trocar #fff por #fefefe — para esta linha e
// obriga quem mexeu a dizer por que. E o mesmo desenho do invariante 17-b da
// migration 19: "a segunda entrada nessa lista deve doer".
//
// AJUSTADO EM 03/08 com a migration 23, e o ajuste vale ser explicado porque ele
// AFROUXA a comparacao: antes era a SEQUENCIA de ocorrencias, e o bloco cresceu
// (a folha em mm, os blocos posicionados, borda e fundo). A sequencia prendia
// duas coisas ao mesmo tempo — quais cores e quantas vezes cada uma aparece — e
// so a primeira era a intencao declarada. Escrever `#eee` numa regra nova nao e
// excecao nova; escrever `#f2f2f2` e. Agora a comparacao e o CONJUNTO, na ordem
// da primeira aparicao, e a propriedade que importa continua inteira: a quarta
// cor de papel para esta linha, e trocar `#fff` por `#fefefe` tambem.
// EM 06/08 AS TRES VIRARAM QUATRO, e esta linha existe para essa entrada doer.
//
// A QUARTA E `#E4DFD4`, a cor de LINHA da paleta nova. Ela entrou porque o papel
// tinha uma divisoria interna de tabela em `#eee` - um cinza neutro que, ao lado
// de um documento agora inteiro em Navy sobre Creme, e a unica coisa que continua
// pertencendo a outra paleta. As duas alternativas eram piores: reusar o `#F6F2EA`
// do bloco secundario faria a divisoria quase sumir contra o papel branco, e
// manter o `#eee` guardaria uma cor orfa no unico lugar do sistema onde cor e
// escrita a mao.
//
// E A TROCA DE VALOR DAS OUTRAS TRES: A paleta nova pos
// Navy no texto e nas bordas de destaque do papel, e Creme no bloco secundario -
// "#111" virou "#14213D" e "#eee" virou "#F6F2EA". O branco do papel nao se mexe.
//
// E A REGRA QUE GOVERNA O BLOCO NAO MUDOU: sao LITERAIS, nao `var(--texto)`. O
// motivo esta escrito no `estilo.ts` e vale igual com Navy - o documento e
// IMPRESSO, e puxar token de tema faria a mesma fatura sair de duas cores
// dependendo de quem imprime. Trocar o VALOR de uma excecao nomeada e barato;
// trocar a NATUREZA dela, de literal para token, nao passaria daqui.
//
// EM 12/08 AS QUATRO VIRARAM SEIS, e esta linha existe para essa entrada doer. As
// duas novas chegaram com a faixa de pagamento do modelo G3 — o primeiro pedaco
// daquele desenho a entrar, e o unico que nao depende do leitor da Equatorial
// (`PLANO-documento-modelo-g3-2026-08-12.md` §6): `#E8843C` e `#8F939D`.
//
// ============================================================================
// EM 14/08 AS SEIS CONTINUARAM SEIS, E DUAS TROCARAM DE VALOR — POR MEDICAO.
//
// A entrada de 12/08 justificava as duas afirmando numeros. Os dois numeros
// estavam errados, e a mesma calculadora WCAG de `web/tests/tema.ts` os derruba:
//
//   `#8F939D` sobre branco   dizia 4,02:1   MEDIDO 3,08:1   reprova (AA pede 4,5)
//   `#E8843C` sobre branco   nao foi medido MEDIDO 2,69:1   reprova, e ele era
//                                                           TEXTO (o valor a pagar)
//
// A justificativa de 12/08 para o `#8F939D` era literalmente *"no papel o par e
// outro: cinza sobre BRANCO, 4,02:1, que passa AA"*. O par de fato e outro; o
// numero e que nao era. E o `#E8843C` como TEXTO nunca teve numero nenhum: a nota
// argumentava por que ele nao podia ser `var(--acento)` e nao perguntava se ele
// podia ser tinta.
//
// AS DUAS QUE ENTRARAM NAO SAO CORES NOVAS — sao os dois tokens que o `tema.ts`
// JA tinha derivado, em 28/07 e em 06/08, dos mesmos dois valores da G3 e pelo
// mesmo criterio (escalar os tres canais, que e o que preserva a matiz, ate o
// fator mais alto que ainda passa 4,5:1):
//
//   #66686F  o `--fraco` do tema claro, derivado do Gray `#8F939D`.
//            5,10:1 no branco e 4,57:1 no creme — os DOIS fundos do papel
//   #995728  o `--acento-forte` do tema claro, derivado do Orange `#E8843C`.
//            5,60:1 no branco e 5,02:1 no creme
//
// E O `#E8843C` FICOU, com o papel reduzido: SUPERFICIE cheia, nunca tinta. A
// faixa do aviso, o cartao do desconto e a barra do mes atual. Sobre ele pousa o
// Navy, 5,93:1 — que e o mesmo par do botao primario da interface.
//
// A REGRA NAO MUDOU: sao LITERAIS, nao `var()`. Coincidirem com dois tokens do
// tema claro e consequencia de virem do mesmo lugar pelo mesmo criterio, e nao
// uma ligacao — o `.g3` nao pode variar com o tema de quem imprime.
//
// A T7 de `web/tests/tema.ts` mede cada um destes pares. Esta lista diz QUAIS
// tintas existem; a T7 diz se elas passam.
const ESPERADAS = ['#fff', '#14213D', '#E4DFD4', '#66686F', '#F6F2EA', '#E8843C', '#995728'];
const achadas = [...new Set(literais(dentroDoDocumento))];
chk('I1c', JSON.stringify(achadas) === JSON.stringify(ESPERADAS),
    `no documento impresso, exatamente ${ESPERADAS.join(' ')} — Navy sobre branco, `
    + `independente do tema da tela (achadas: ${achadas.join(' ') || 'nenhuma'})`);

// E O `#8F939D` NAO PODE VOLTAR — e desde 30/09/2026 SEM EXCECAO NENHUMA.
//
// Ele e um valor da paleta entregue pela G3, entao a tentacao de reusa-lo "porque
// e a cor da marca" e permanente — foi assim que ele chegou aqui. Ele reprova AA
// nos TRES fundos do papel (3,08:1 no branco, 2,75:1 no creme, 2,31:1 na linha).
//
// DE 14/08 A 30/09 HOUVE UMA EXCECAO NOMEADA: a ilha `.g3ref` da aba Documento,
// decisao do dono (*"a referencia exata ... sem tirar nem por"*, `Q-DOCG3-15`).
// Estas tres linhas prendiam a fronteira dela — o Gray so dentro da ilha, so em
// token `--g3ref-*`. Em 30/09 o dono decidiu que o g3ref e a identidade do
// sistema INTEIRO e, na mesma decisao, que contraste AA e inegociavel ao
// espalha-lo. A ilha deixou de ter paleta propria, e a excecao fechou.
//
// A FRONTEIRA VIROU PROIBICAO, e a mudanca e de direcao, nao de afrouxamento:
//
//   I1d   nas REGRAS o Gray continua proibido (sem mudanca)
//   I1e   no bloco de variaveis ele tambem — em lugar nenhum, nem num escopo
//   I1f   e nenhum token `--g3ref-*` sobrevive. Era por eles que o Gray (e o
//         laranja como tinta, e o branco sobre o laranja) entravam; uma paleta
//         paralela de volta e o caminho de volta dos tres
//
// A T7b de `web/tests/tema.ts` continua medindo o par e dizendo o numero.
chk('I1d', !REGRAS.includes('#8F939D'),
    'fora do bloco de variaveis o Gray #8F939D nao pinta nada');

chk('I1e', !VARIAVEIS_CSS.includes('#8F939D'),
    'e no bloco de variaveis tambem nao — a excecao da ilha (Q-DOCG3-15) fechou em 30/09; '
    + '--fraco (#66686F, 5,56:1) e a tinta apagada do sistema inteiro');

{
  const semComentario = ESTILO.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokensDaIlha = [...new Set([...semComentario.matchAll(/--g3ref-[\w-]+/g)].map((m) => m[0]))];
  chk('I1f', tokensDaIlha.length === 0,
      'nenhum token --g3ref-* e declarado nem lido — a paleta paralela da ilha saiu inteira '
      + `(achados: ${tokensDaIlha.join(', ') || 'nenhum'})`);
}

// ------------------------------------------------------- I2 o movimento, fechado

/** Toda regra que ANIMA um icone, pelo nome do icone. Casa `.ic-<nome>` seguido,
 *  em algum ponto do bloco, de `animation:`. */
const iconesAnimados = new Set<string>();
for (const bloco of REGRAS.split('}')) {
  if (!/animation:/.test(bloco)) continue;
  for (const m of bloco.matchAll(/\.ic-([a-z_]+)/g)) iconesAnimados.add(m[1]!);
}

for (const nome of ICONES_QUE_SE_MOVEM) {
  chk('I2', iconesAnimados.has(nome),
      `${nome} esta na lista dos que se movem E tem regra de animacao no CSS`);
}
for (const nome of iconesAnimados) {
  chk('I2b', (ICONES_QUE_SE_MOVEM as readonly string[]).includes(nome),
      `${nome} anima no CSS E esta declarado em ICONES_QUE_SE_MOVEM — nada se move por acidente`);
}

// O `@media (prefers-reduced-motion: reduce)` E A SAIDA DE EMERGENCIA, e ela tem
// de neutralizar as DUAS coisas: animacao e transicao. Anular so a animacao
// deixaria de pe todo o hover deste arquivo, que e transicao.
const bloqueio = REGRAS.slice(REGRAS.indexOf('prefers-reduced-motion'));
chk('I3', REGRAS.includes('@media (prefers-reduced-motion: reduce)'),
    'existe bloco @media prefers-reduced-motion: reduce (WCAG 2.3.3)');
chk('I3b', /animation-duration:\s*\.?0*1?m?s\s*!important/.test(bloqueio)
        && /animation-iteration-count:\s*1\s*!important/.test(bloqueio),
    'ele zera animation-duration E fixa iteration-count em 1 — loop infinito nao sobrevive');
chk('I3c', /transition-duration:\s*\.?0*1?m?s\s*!important/.test(bloqueio),
    'e zera transition-duration tambem: o hover deste arquivo e transicao, nao animacao');
chk('I3d', /\*,\s*\*::before,\s*\*::after/.test(bloqueio),
    'e alcanca `*` com os dois pseudo-elementos — o brilho e a ondulacao do botao, que viviam neles, '
    + 'sairam em 30/09, e o proximo enfeite em ::before/::after ja nasce coberto');

/*
 * I3e — E ZERA O ATRASO, e nao so a duracao.
 *
 * O furo so ficou visivel em 21/08/2026, quando entrou a primeira animacao COM
 * atraso do arquivo (as duas bolhas do balao de ajuda). Zerar a duracao sem
 * zerar o atraso e cruel de um jeito silencioso: com `animation-fill-mode: both`
 * o elemento segura o estado inicial — que costuma ser opacidade zero — durante
 * todo o atraso, e so entao aparece. Quem pediu MENOS movimento recebia um
 * elemento surgindo na tela 130ms depois, que e movimento na mesma.
 *
 * Vale para transicao pelo mesmo motivo, e o custo de afirmar as duas e zero.
 */
chk('I3e', /animation-delay:\s*0s?\s*!important/.test(bloqueio)
        && /transition-delay:\s*0s?\s*!important/.test(bloqueio),
    'e zera o ATRASO de animacao e de transicao — sem isso, o estado inicial invisivel fica '
    + 'segurado durante o atraso e o movimento volta pela porta dos fundos');

// ------------------------------------------ I4 a navegacao (barra ate 30/09, menu lateral desde entao)

/* TREZE desde 10/09/2026 - entrou "Historico", a leitura da trilha de auditoria.
 * O dado ja existia desde a primeira semana do projeto (21.917 registros em
 * producao no dia) e nao tinha leitor nenhum: "quem cancelou esta fatura?" so
 * tinha resposta pelo banco, ou seja, exigia um desenvolvedor. Foi o ultimo item
 * de codigo da lista do `PLANO-sem-desenvolvedor`.
 *
 * DOZE entre 14/08 e 10/09/2026 - "Tarifas" SAIU, por decisao do dono ("ela ja
 * nao possui finalidade e apenas gera redundancia"). A tarifa passou a ser
 * coluna da UC (migration 30), porque a granularidade real e por cliente e nao
 * por distribuidora - medido: 35 UCs a 1,130000, 4 a 1,16 e 2 a 1,180000.
 *
 * DOZE DE NOVO em 10/09/2026 - "Faturamento" SAIU, por decisao do dono no mesmo
 * dia em que ela ganhou a marca «(caminho antigo)»: *"a aba faturamento do
 * caminho antigo pode deixar de existir? nao vejo sentido nela"*. Era o caminho
 * aposentado desde a `Q-CICLO-01` (21/08), e o que ela tinha de unico - os
 * quatro numeros do mes - foi para «Emissao e cobranca», onde agora seguem o
 * seletor de mes.
 *
 * O numero e literal de proposito: uma tela a mais e decisao de produto, e uma
 * contagem que se atualiza sozinha (`TELAS.length === TELAS.length`) nao
 * acusaria uma tela acrescentada por engano num merge. Esta linha ficou vermelha
 * na remocao acima, que e exatamente o trabalho dela. */
/* TREZE desde 22/09/2026 - entrou "Contas a receber", a ponte entre os dois
 * funis: a carteira INTEIRA em aberto, por vencimento, para a vertente da
 * empresa. Ate entao «quanto os clientes devem ao todo» so tinha resposta por
 * mes, e a fatura antiga sumia atras do mes corrente. */
/* QUATORZE desde 30/09/2026 - entrou «Usuarios», a primeira tela da pasta
 * «Administracao da plataforma» (pedido do dono: cadastrar pessoas e marcar, por
 * caixa, os setores que cada uma ve). */
chk('I4', TELAS.length === 14, `sao 14 telas (contadas: ${TELAS.length})`);
chk('I4b', new Set(TELAS.map((t) => t.rota)).size === TELAS.length,
    'nenhuma rota repetida — rota repetida faz a segunda tela ser inalcancavel');
chk('I4c', new Set(TELAS.map((t) => t.titulo)).size === TELAS.length,
    'nenhum titulo repetido');
chk('I4d', new Set(TELAS.map((t) => t.icone)).size === TELAS.length,
    'nenhum ICONE repetido: dois itens com o mesmo desenho e um menu em que se clica no errado');
chk('I4e', TELAS.every((t) => t.rota.startsWith('/') && !t.rota.includes(' ')),
    'toda rota comeca com / e nao tem espaco');

// A ORDEM E DECISAO DOCUMENTADA, nao gosto. DOIS FUNIS desde 22/09/2026 -
// Rateio (o dinheiro que entra dos clientes) e Empresa (o caixa) -, cada um
// contiguo na lista e na ordem em que `FUNIS` os declara; DENTRO de cada funil,
// os grupos sao contiguos, e cada grupo e uma SECAO do menu lateral.
/* [30/09/2026, etapa 3b] A PRIMEIRA TELA E A `abertura`: o menu passou a seguir
 * a ordem do trabalho, e o trabalho comeca pela tela que diz em que pe esta o
 * mes. A afirmacao que importa ficou: e onde cai quem se perde. */
chk('I4f', TELAS[0]!.funil === 'rateio' && TELAS[0]!.grupo === 'abertura' && TELAS[0]!.rota === '/pendencias',
    'a primeira tela e a que diz em que pe esta o mes - e onde cai quem se perde, e ela abre o Rateio');

/*
 * I4o — O MENU SEGUE A ORDEM DO TRABALHO (30/09/2026, etapa 3b).
 *
 * Pedido do dono: «a ordem das telas deve refletir a ordem de cada etapa de
 * trabalho». Ate esta data a barra do Rateio punha o trabalho do mes primeiro e
 * os cinco cadastros num menu suspenso no fim. No menu lateral:
 *
 *   Mes ‖ Cadastros ‖ O mes, passo a passo ‖ Resultado
 *
 * — o ponto de partida, o que precisa existir antes, os passos do mes na ordem
 * deles, e a apuracao. Os NOMES e a ORDEM estao presos aqui de proposito: e
 * deles que o roteiro, a ajuda e a tela Mes falam letra por letra.
 */
{
  const nomes = (f: 'rateio' | 'empresa' | 'administracao') => secoesDoMenu(telasDoFunil(f))
    .map((sec) => `${sec.titulo ?? '·'}: ${sec.telas.map((t) => t.titulo).join(', ')}`).join(' ‖ ');
  chk('I4o', nomes('rateio') === '·: Mês ‖ Cadastros: Donos de usina, Usinas, Clientes, Unidades consumidoras, '
                              + 'Contratos ‖ O mês, passo a passo: Contas de luz, Cobranças ‖ Resultado: Relatórios',
      `o Rateio segue o trabalho: Mês, os cadastros na ordem de dependencia, os passos do mes e o resultado `
      + `(hoje: ${nomes('rateio')})`);
  chk('I4o2', nomes('empresa') === 'Caixa: Contas a receber, Contas a pagar ‖ Apoio: Conector Sicoob, Histórico'
           && nomes('administracao') === '·: Usuários',
      `a Empresa: primeiro o que entra, depois o que se paga, e o apoio por ultimo; a Administracao, a tela dela `
      + `(hoje: ${nomes('empresa')} / ${nomes('administracao')})`);
  /* OS CADASTROS NA ORDEM DE DEPENDENCIA, par a par, com o motivo de cada um —
   * a ordem de I4o dita por que. Um cadastro reordenado por gosto quebra aqui
   * com a razao escrita, e nao so com uma string diferente. */
  const pos = (titulo: string) => TELAS.findIndex((t) => t.titulo === titulo);
  const DEPENDE: Array<[string, string, string]> = [
    ['Donos de usina', 'Usinas', 'a linha da usina so aceita dono que ja existe'],
    ['Usinas', 'Unidades consumidoras', 'o rateio da unidade aponta a usina'],
    ['Clientes', 'Unidades consumidoras', 'a unidade so nasce com cliente'],
    ['Clientes', 'Contratos', 'o contrato so ativa com o documento do cliente conferido'],
    ['Unidades consumidoras', 'Contratos', 'o contrato amarra a unidade'],
  ];
  const fora = DEPENDE.filter(([antes, depois]) => !(pos(antes) >= 0 && pos(antes) < pos(depois)));
  chk('I4o3', fora.length === 0,
      'cada cadastro vem depois do que ele precisa que exista'
      + `${fora.length ? ` (fora de ordem: ${fora.map(([a, d, m]) => `${a} antes de ${d}, porque ${m}`).join(' · ')})` : ''}`);
  chk('I4o4', TELAS.every((t) => {
    const c = caminhoNoMenu(t.rota);
    const sec = SECAO_DO_GRUPO[t.grupo].titulo;
    return c !== null && c[c.length - 1] === t.titulo && (sec ? c.length === 2 && c[0] === sec : c.length === 1);
  }),
      'toda tela e item do menu do setor dela, e o ultimo nome do caminho e o titulo dela — o que o roteiro e a '
      + 'ajuda chamam de «rotulo do item» (RM13, A9y)');
  /* OS PASSOS NO MENU (o conferir contra o funil e o `RM25`, na suite do
   * roteiro). Aqui: o formato que a pessoa le, e que os passos aparecem no menu
   * na ordem do mes — de cima para baixo, e do Rateio para a Empresa. */
  const comPassos = TELAS.filter((t) => t.passos && t.passos.length > 0);
  const sequencia = comPassos.flatMap((t) => [...t.passos!]);
  chk('I4o5', comPassos.map((t) => `${t.titulo} ${rotuloDosPassos(t.passos)}`).join(' | ')
                === 'Contas de luz 1\u20132 | Cobranças 3\u20134 | Contas a pagar 5'
          && sequencia.every((n, i) => i === 0 || n > sequencia[i - 1]!)
          && fraseDosPassos([1, 2]) === 'passos 1 e 2 do mês' && fraseDosPassos([5]) === 'passo 5 do mês',
      'o menu mostra os passos do mes nas telas onde eles acontecem, em ordem crescente de cima para baixo: '
      + '«1–2», «3–4», «5»');
}

{
  // Cada funil ocupa uma faixa contigua de TELAS, e as faixas vem na ordem de FUNIS.
  const primeiroIndice = FUNIS.map((f) => TELAS.findIndex((t) => t.funil === f.chave));
  const contiguos = FUNIS.every((f) => {
    const idx = TELAS.flatMap((t, i) => (t.funil === f.chave ? [i] : []));
    return idx.length > 0 && idx[idx.length - 1]! - idx[0]! === idx.length - 1;
  });
  chk('I4g', contiguos && primeiroIndice.every((v, i) => i === 0 || v > primeiroIndice[i - 1]!),
      'os funis sao contiguos e vem na ordem declarada - o seletor de setor e o menu '
      + 'contam a mesma historia');
  chk('I4g2', TELAS.every((t) => FUNIS.some((f) => f.chave === t.funil)),
      'toda tela pertence a um funil declarado');
  /* A REGRA DO NOME VALE PARA OS SETORES FINANCEIROS, e a pasta de administracao
   * e a excecao declarada (30/09/2026): ela NAO e financeira - e quem entra e o
   * que cada um ve -, e chama-la "Financeiro Administracao" seria o nome mentindo
   * sobre o conteudo. Ela se prende a outra regra: o nome dela E o titulo da
   * pasta no menu, letra por letra. */
  const setoresFinanceiros = funisDaPasta('setores');
  const daPlataforma = funisDaPasta('plataforma');
  chk('I4g3', new Set(FUNIS.map((f) => f.rotulo)).size === FUNIS.length
           && setoresFinanceiros.every((f) => f.rotulo.length <= 10 && f.nome.startsWith('Financeiro '))
           && daPlataforma.every((f) => f.rotulo.length <= 14
                && f.nome === PASTAS.find((p) => p.chave === 'plataforma')!.titulo),
      'os rotulos dos funis sao unicos e curtos; o setor financeiro comeca por "Financeiro", e a '
      + 'administracao se chama como a pasta do menu');
  chk('I4g6', FUNIS.every((f) => PASTAS.some((p) => p.chave === f.pasta))
           && PASTAS[0]!.chave === 'setores' && setoresFinanceiros.length === 2
           && daPlataforma.map((f) => f.chave).join() === 'administracao',
      'duas pastas no menu, setores financeiros primeiro; a de administracao tem so o funil dela');
  // O MENU DE SETORES (27/09/2026). Cada setor tem desenho proprio, e ele nao
  // repete o de uma tela nem o `empresa` do seletor de tenant, que fica na mesma
  // faixa: o mesmo desenho dizendo "qual setor" e "qual CNPJ" e ler um pelo outro.
  const iconesDasTelas = new Set<string>(TELAS.map((t) => t.icone));
  chk('I4g4', new Set(FUNIS.map((f) => f.icone)).size === FUNIS.length
           && FUNIS.every((f) => !iconesDasTelas.has(f.icone) && f.icone !== 'empresa'),
      'cada setor tem desenho proprio, que nao e o de nenhuma tela nem o do seletor de empresa');
  // O resumo e a linha de baixo de um menu de 324px: passou de 40 caracteres, quebra
  // em duas e o menu deixa de ser uma lista para virar um paragrafo.
  chk('I4g5', FUNIS.every((f) => f.resumo.length > 0 && f.resumo.length <= 40 && f.resumo !== f.descricao),
      'o resumo de cada setor cabe numa linha do menu (ate 40 caracteres) e nao e a descricao da ajuda');
}

/* A SECAO E REGRA DE SETOR FINANCEIRO. A pasta de administracao tem uma tela
 * so (30/09/2026), e uma secao com titulo sobre um item seria o menu dizendo a
 * mesma coisa duas vezes. Nos setores financeiros: cada grupo e UMA secao — um
 * grupo que volta depois de outro viraria duas secoes com o mesmo titulo, que e
 * o sintoma de uma tela fora do lugar —, e ha ao menos duas. */
for (const f of funisDaPasta('setores')) {
  const secoes = secoesDoMenu(telasDoFunil(f.chave));
  const grupos = secoes.map((sec) => sec.grupo);
  chk('I4h', new Set(grupos).size === grupos.length,
      `${f.nome}: cada grupo e uma secao so, contigua (hoje: ${grupos.join(' | ')})`);
  chk('I4h2', secoes.length >= 2 && secoes.filter((sec) => sec.titulo === null).every((sec, i, l) => l.length === 1 && secoes[0] === sec),
      `${f.nome}: ao menos duas secoes, e so a primeira pode vir sem titulo — uma lista sem fronteira e uma fila de itens iguais de novo`);
}

chk('I4l', primeiraTelaDoFunil('rateio').rota === '/pendencias'
        && primeiraTelaDoFunil('empresa').rota === '/contas-a-receber'
        && primeiraTelaDoFunil('administracao').rota === '/usuarios',
    'trocar de funil leva a tela que abre cada lado: o que falta (Rateio), o que vai entrar (Empresa) '
    + 'e quem entra (Administracao)');

/*
 * QUEM VE O QUE (30/09/2026). O menu so desenha os setores do vinculo, e o
 * endereco de um setor oculto desvia para a primeira tela visivel. As duas
 * pontas que importam: o servidor SEM a migration 41 (setores ausentes) mostra o
 * que todo mundo via ate entao - nunca a Administracao -, e o desvio nunca manda
 * para um setor que tambem esta oculto.
 */
chk('I4n', funisVisiveis(undefined).map((f) => f.chave).join() === 'rateio,empresa'
        && funisVisiveis([]).map((f) => f.chave).join() === 'rateio,empresa'
        && funisVisiveis(['empresa', 'administracao']).map((f) => f.chave).join() === 'empresa,administracao',
    'setores ausentes ou vazios: os dois financeiros e nunca a Administracao; presentes: so eles, na ordem do menu');
chk('I4n2', destinoVisivel('/usuarios', ['rateio', 'empresa']) === '/pendencias'
        && destinoVisivel('/faturas', ['empresa']) === '/contas-a-receber'
        && destinoVisivel('/', ['empresa']) === '/contas-a-receber'
        && destinoVisivel('/historico', ['empresa']) === null
        && destinoVisivel('/usuarios', ['rateio', 'administracao']) === null
        && destinoVisivel('/usuarios', undefined) === '/pendencias',
    'endereco de setor oculto desvia para a primeira tela visivel; endereco visivel fica onde esta');
chk('I4n3', TELAS.filter((t) => funisDaPasta('plataforma').some((f) => f.chave === t.funil))
          .every((t) => (t.resumo ?? '').length > 0 && t.resumo!.length <= 40),
    'toda tela da pasta de administracao tem a linha de resumo do menu, e ela cabe numa linha (40)');
chk('I4m', funilDoCaminho('/faturas').chave === 'rateio'
        && funilDoCaminho('/contas-a-pagar').chave === 'empresa'
        && funilDoCaminho('/nao-existe').chave === 'rateio'
        && funilDoCaminho('/').chave === 'rateio',
    'o funil e derivado do caminho, e caminho desconhecido cai no Rateio junto com a primeira tela');

// Caminho desconhecido cai na primeira tela. E o comportamento que o `app.tsx`
// documenta desde 29/07 e que nunca teve teste.
const primeira = TELAS[0]!.rota;
chk('I4i', telaDoCaminho('/nao-existe').rota === primeira
        && telaDoCaminho('/').rota === primeira
        && telaDoCaminho('/faturas').rota === '/faturas',
    'caminho desconhecido e / caem na primeira tela; caminho conhecido resolve para ele mesmo');

/*
 * E O `/prontidao` ANTIGO CONTINUA LEVANDO AO LUGAR CERTO, por consequencia da
 * regra acima e nao por um redirecionamento escrito a mao. Vale como verificacao
 * porque e o unico link que pode existir em favorito de alguem: a rota viveu de
 * 29/07 a 30/07.
 */
chk('I4j', telaDoCaminho('/prontidao').rota === TELAS[0]!.rota,
    'a rota antiga /prontidao cai na tela de Pendencias — caminho desconhecido resolve para a '
    + 'primeira, e a primeira e ela');

/*
 * DOIS ROTULOS COM O MESMO SUBSTANTIVO-CABECA — e por que `I4c` nao bastava.
 *
 * O `I4c` ja proibia titulo REPETIDO, e ele passou verde nas duas vezes em que a
 * barra confundiu o dono de fato:
 *
 *   17/08, manha  `Faturas` e `Documento` -> *"qual a diferenca entre a aba
 *                 Faturas e a aba Documento?"*. A correcao rebatizou a segunda
 *                 de `Fatura unificada`;
 *   17/08, tarde  `Faturas` e `Fatura unificada` -> *"o nome faturas e fatura
 *                 unificada esta causando confusao"*. A correcao rebatizou a
 *                 PRIMEIRA de `Emissao e cobranca`.
 *
 * A segunda foi CRIADA pela primeira, e e isso que este teste existe para nao
 * deixar acontecer uma terceira vez: duas telas distintas passaram a se
 * apresentar pelo mesmo substantivo. Igualdade exata nao pega — "Faturas" e
 * "Fatura unificada" sao strings diferentes.
 *
 * A CABECA E A PRIMEIRA PALAVRA, sem acento, minuscula e sem o plural. E uma
 * aproximacao grosseira do portugues e nao tenta ser mais que isso: e a palavra
 * que a pessoa le primeiro e pela qual ela chama a aba em voz alta.
 *
 * O QUE ELE NAO PROIBE, de proposito: `Faturamento` convive com
 * `Fatura unificada`, porque "faturamento" e outro substantivo — o PROCESSO de
 * gerar o lote, e nao o documento. Prefixo comum nao e o defeito; cabeca comum e.
 */
const cabecaDo = (titulo: string): string =>
  titulo.trim().split(/\s+/)[0]!
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/s$/, '');

/*
 * O PAR DECLARADO, e por que ele nao e a colisao que este teste persegue.
 *
 * «Contas a receber» e «Contas a pagar» (22/09/2026) comecam pela mesma palavra e
 * sao vizinhas na barra da Empresa. Mas a cabeca SEMANTICA do par e o verbo, nao
 * o substantivo: e o nome que todo plano de contas, todo banco e todo analista
 * financeiro usam, e foi o nome que o dono deu as duas ("Contas a pagar",
 * "Contas a receber - que vem de origem do funil 1"). Rebatizar uma delas para
 * escapar da regra criaria um sinonimo do termo canonico — divida de leitura
 * (regra 7) para resolver um problema que, neste par, nao existe: ninguem confunde
 * receber com pagar.
 *
 * A excecao e NOMINAL e de um par so. Uma terceira aba comecando por "Contas"
 * volta a reprovar.
 */
const PARES_DECLARADOS: ReadonlyArray<readonly [string, string]> = [
  ['Contas a receber', 'Contas a pagar'],
];
const ehParDeclarado = (ts: string[]): boolean =>
  ts.length === 2 && PARES_DECLARADOS.some(([a, b]) => ts.includes(a) && ts.includes(b));

/*
 * A EXCECAO ENTRE SETORES — «Contas de luz» (30/09/2026, etapa 3 do redesenho).
 *
 * «Conta de luz» e locucao fixa do portugues: ninguem a le como «conta a pagar»,
 * e e o nome que a operacao da ao documento da distribuidora (o roteiro ja
 * dizia «Ler as contas de luz do mes», e a ajuda ja buscava por ele). A cabeca
 * semantica e «luz», como a do par acima e o verbo.
 *
 * ELA E MAIS ESTREITA QUE O PAR, e a verificacao prende o estreitamento: um
 * titulo desta lista so pode colidir com telas de OUTRO setor — nunca dividir a
 * barra com outra aba que comece igual. A aba de Contas de luz mora no Rateio;
 * Contas a receber e Contas a pagar, na Empresa. Uma quarta «Contas» no Rateio,
 * ou esta mudando de setor, volta a reprovar.
 */
const ENTRE_SETORES: readonly string[] = ['Contas de luz'];
const setorDe = (titulo: string) => TELAS.find((t) => t.titulo === titulo)?.funil;
const semAsDeOutroSetor = (ts: string[]): string[] => ts.filter((t) =>
  !(ENTRE_SETORES.includes(t) && ts.every((o) => o === t || setorDe(o) !== setorDe(t))));

const porCabeca = new Map<string, string[]>();
for (const t of TELAS) {
  const c = cabecaDo(t.titulo);
  porCabeca.set(c, [...(porCabeca.get(c) ?? []), t.titulo]);
}
const colididos = [...porCabeca.values()].map(semAsDeOutroSetor)
  .filter((ts) => ts.length > 1 && !ehParDeclarado(ts));
chk('I4k2', ENTRE_SETORES.every((t) => {
  const c = cabecaDo(t);
  const vizinhas = (porCabeca.get(c) ?? []).filter((o) => o !== t);
  return TELAS.some((x) => x.titulo === t) && vizinhas.every((o) => setorDe(o) !== setorDe(t));
}),
    'toda excecao entre setores existe e nao divide o menu com nenhum item de mesma cabeca — '
    + '«Contas de luz» (Rateio) so convive com «Contas a receber» e «Contas a pagar» (Empresa)');
chk('I4k0', PARES_DECLARADOS.every(([a, b]) => TELAS.some((t) => t.titulo === a) && TELAS.some((t) => t.titulo === b)),
    'todo par declarado aponta para duas abas que existem — excecao para aba que sumiu e lista envelhecendo calada');

chk('I4k', colididos.length === 0,
    'nenhum par de abas se apresenta pelo mesmo substantivo-cabeca'
    + (colididos.length ? ` — colidem: ${colididos.map((ts) => ts.join(' / ')).join('; ')}` : ''));

// ----------------------------------------- I5 cor nunca e o unico sinal (rest. 3)

/* [30/09, etapa 4a] OS TONS SAO CINCO (`TomDoSelo`), e o vermelho so da falha. */
const TONS = TONS_DO_SELO;
for (const tom of TONS) {
  chk('I5', Boolean(ICONE_DO_ESTADO[tom]),
      `o estado ${tom} tem icone proprio — cor nao e o unico sinal`);
  chk('I5b', new RegExp(`\\.marca\\.${tom}\\s*\\{[^}]*background:`).test(REGRAS),
      `e tem fundo proprio na pilula .marca.${tom}`);
}
chk('I5c', new Set(TONS.map((t) => ICONE_DO_ESTADO[t])).size === TONS.length,
    `os ${TONS.length} icones de estado sao DIFERENTES entre si: um segundo sinal igual em dois tons nao e sinal`);
chk('I5c2', /\.marca\.erro\s*\{[^}]*var\(--erro\)/.test(REGRAS)
         && TONS.filter((t) => new RegExp(`\\.marca\\.${t}\\s*\\{[^}]*var\\(--erro`).test(REGRAS)).length === 1,
    'SO a pilula de `erro` e vermelha: a lacuna de cadastro (`a_fazer`) e o inativo (`neutro`) nao '
    + 'usam a tinta da falha');
chk('I5d', new Set(Object.values(ICONE_DO_AVISO)).size === 3,
    'e os tres icones de aviso tambem sao diferentes');

// A PILULA NAO PODE VOLTAR A DEPENDER DE `currentColor` NA BORDA. Ate 29/07 ela
// era contornada com `border: 1px solid currentColor`, e o desenho de 30/07 e
// preenchido. Se as duas formas convivessem, metade das telas teria uma e metade
// a outra — que e o estado em que este arquivo estava antes de existir `.marca`.
chk('I5e', /\.marca\s*\{[^}]*border:\s*1px solid transparent/.test(REGRAS),
    'a borda da pilula e transparente e existe: ela reserva o espaco sem desenhar contorno');

// OS SEIS STATUS DA FATURA, cada um com o icone do SIGNIFICADO e nao do tom. O
// mapa existe por causa de um defeito real: "Emitida" caia no tom `nao_medido` e
// exibia a interrogacao de "nao sei". [01/10/2026, etapa 7b] O icone mora com o
// tom em `SELO_DA_COBRANCA` (`tom-do-estado.ts`).
const ICONE_DO_STATUS_DA_FATURA: Record<string, string> =
  Object.fromEntries(Object.entries(SELO_DA_COBRANCA).map(([k, v]) => [k, v.icone]));
const STATUS_DA_FATURA = ['rascunho', 'emitida', 'paga', 'vencida', 'cancelada', 'negociada'];
for (const s of STATUS_DA_FATURA) {
  chk('I5f', Boolean(ICONE_DO_STATUS_DA_FATURA[s]), `o status ${s} tem icone proprio`);
}
chk('I5g', new Set(Object.values(ICONE_DO_STATUS_DA_FATURA)).size === STATUS_DA_FATURA.length,
    'os seis sao diferentes entre si — o icone existe para distinguir dentro do mesmo tom');
chk('I5h', Object.values(ICONE_DO_STATUS_DA_FATURA)
        .every((i) => !(ICONES_QUE_SE_MOVEM as readonly string[]).includes(i)),
    'e nenhum deles se move: uma competencia de 39 faturas desenharia 39 icones animados');

// ------------------------------------------------- I6 o que o acabamento promete

chk('I6', !/border-collapse:\s*separate/.test(REGRAS) && /border-collapse:\s*collapse/.test(REGRAS),
    'a tabela colapsa a borda — e o que permite UMA linha entre celulas, nao duas');
// O PADRAO FOI APERTADO EM 12/08, e ele estava FROUXO nos dois sentidos - a
// mensagem sempre disse "th ou td" e o regex dizia outra coisa:
//
//   1. `(th|td)` SEM FRONTEIRA casava o "th" de `width`. Entao `min-width: 0` numa
//      regra e um `border-left` na regra SEGUINTE bastavam para reprovar, e nenhum
//      dos dois tem a ver com tabela. Foi o que a faixa de pagamento encostou;
//   2. `[^{]*` NAO EXCLUI `}`, entao a busca atravessava o fim da regra e colava um
//      seletor de tabela numa declaracao de outro seletor qualquer, varias regras
//      abaixo.
//
// O que a verificacao existe para prender continua preso, e agora e so isso:
// `td`/`th` como SELETOR, e a borda dentro da PROPRIA regra dele.
chk('I6b', !new RegExp('\\b(th|td)\\b[^{}]*\\{[^}]*border-(left|right):(?!\\s*(0|none))').test(REGRAS),
    'nenhuma borda vertical em th ou td: era o pedido de "remover linhas verticais entre celulas"');
chk('I6c', /tbody td\s*\{[^}]*border-bottom: 1px solid var\(--borda-suave\)/.test(REGRAS),
    'a divisoria entre linhas e a --borda-suave (1.16:1), nao a --borda do contorno');
chk('I6d', /thead th\s*\{[^}]*background: var\(--fundo-recuo\)/.test(REGRAS),
    'o cabecalho recua por SUPERFICIE, com a terceira cor da paleta da G3');
chk('I6e', /tbody td\s*\{[^}]*padding: 13px/.test(REGRAS),
    'o respiro da linha subiu para 13px (era 9px) — o pedido de "aumentar o espacamento interno"');
chk('I6f', /\.inline input\s*,\s*\.inline select\s*\{[^}]*border-color: transparent/.test(REGRAS),
    'o input de dentro da tabela nasce sem borda visivel: parece texto ate receber atencao');
chk('I6g', /--sombra-1|--sombra-2|--sombra-3/.test(REGRAS)
        && !/box-shadow:\s*0 \d/.test(REGRAS.replace(/box-shadow: 0 0 0 3px var\(--acento-suave\)/g, '')),
    'toda sombra sai da escala de tres degraus — a unica excecao e o anel de foco, que e cor e nao profundidade');

// ------------------------------------------- I7 os estados dos elementos clicaveis
//
// POR QUE ESTA SECAO EXISTE, e ela nasce de um defeito medido em 14/08.
//
// A aba da tela de fatura unificada escrevia `.fu-aba:hover { color: var(--texto) }`
// — e essa regra NUNCA VALEU UM DIA. O seletor generico `button:hover:not(:disabled)`
// tem especificidade (0,2,1) e `.fu-aba:hover` tem (0,2,0): quem ganhava era o
// botao. Na pratica a aba pegava o laranja de link, a sombra do segundo degrau e o
// `translateY(-1px)` — passar o mouse por uma ABA a fazia FLUTUAR.
//
// O modo de falha e o pior tipo: o CSS estava escrito, a intencao estava escrita
// no comentario, e nada na tela obedecia. Nenhuma revisao de codigo pega isso —
// so quem abre a tela e olha, ou uma verificacao que compare especificidade.
//
// O QUE ESTA SECAO PRENDE, e ela e sobre a CLASSE do defeito e nao sobre esta aba:
// todo elemento que se pinta por cima do botao generico tem de vencer o seletor
// generico. A regra pratica e simples e verificavel: quem sobrescreve o hover do
// botao escreve `:hover:not(:disabled)`, igual ao generico, e assim ganha pela
// classe a mais.

/** As declaracoes de uma regra, pelo seletor exato. `''` quando a regra nao existe. */
function regraDe(seletor: string): string {
  const i = REGRAS.indexOf(`\n  ${seletor} {`);
  if (i < 0) return '';
  const j = REGRAS.indexOf('}', i);
  return j < 0 ? '' : REGRAS.slice(i, j);
}

/** Todo seletor de hover que pinta um `button` do sistema por cima do generico.
 *
 *  `.g3ref .fu-aba` E NAO `.fu-aba`: em 14/08 a aba passou a ser escopada na ilha
 *  do desenho da referencia. A CLASSE do defeito nao mudou nada com isso — a
 *  especificidade do generico continua (0,2,1) e quem o sobrescreve continua
 *  tendo de escrever `:hover:not(:disabled)`. So o seletor ficou mais longo. */
const HOVERS_DE_BOTAO = ['.g3ref .fu-aba', 'button.primario', 'button.discreto', '.interruptor'];
for (const base of HOVERS_DE_BOTAO) {
  chk('I7', regraDe(`${base}:hover:not(:disabled)`) !== '',
      `${base} sobrescreve o hover com ":hover:not(:disabled)" — mesma forma do seletor generico, `
      + 'e por isso ganha dele. Sem o ":not(:disabled)" a regra existe e nao vale');
}

// E A ABA NAO PODE FLUTUAR. As tres propriedades que o botao generico injeta no
// hover — sombra do segundo degrau, subida de 1px e a tinta de acento — precisam
// ser desfeitas explicitamente, porque `.fu-aba` e um `<button>` de verdade (e
// tem de ser: e o que da teclado e foco de graca).
{
  const h = regraDe('.g3ref .fu-aba:hover:not(:disabled)');
  chk('I7b', /box-shadow:\s*none/.test(h) && /transform:\s*none/.test(h),
      'o hover da aba desfaz a sombra e a subida do botao generico — aba nao flutua');
  /*
   * A I7c TROCOU DE CRITERIO EM 14/08, e a troca e consequencia direta de a aba
   * ter virado a ilha da referencia — nao de alguem ter achado o criterio ruim.
   *
   * O QUE ELA PRENDIA: "clicavel se diz por SUPERFICIE, nao por cor de texto", e
   * o teste media isso pelo `background: var(--fundo-hover)` no HOVER. Dentro da
   * ilha esse hover nao existe: a referencia nao tem nenhum na barra de etapas.
   *
   * O QUE ELA PRENDE AGORA: a mesma afirmacao, medida onde ela de fato acontece.
   * A aba SELECIONADA e um bloco laranja cheio com tinta clara por cima — uma
   * superficie inteira, que e uma forma mais forte de dizer o estado do que um
   * fundo de hover. O que a verificacao nao pode deixar passar e a aba ativa
   * voltar a se distinguir SO por cor de texto, que era o defeito original.
   */
  /* [30/09] O TOKEN TROCOU DE NOME, e a afirmacao ficou: era `--g3ref-laranja`
   * com tinta `#fff` (2,69:1); e `--acento` com `--acento-texto` (5,93:1) desde
   * que a paleta da ilha saiu. A tinta passou a ser verificada pelo NOME — branco
   * sobre o laranja e o par que reprovou duas vezes neste projeto. */
  /* [01/10/2026, etapa 7b] A AFIRMACAO MUDOU DE FORMA e nao de fundo: a aba
   * selecionada continua se distinguindo por FORMA e cor juntas — mas a forma
   * agora e o sublinhado de 2px na tinta forte, e nao o bloco laranja. O laranja
   * e do ato da tela (The One Orange Rule), e a aba ativa era o segundo laranja
   * da mesma area. A verificacao prende as duas metades: ha sublinhado, e o
   * laranja nao voltou. */
  const a = regraDe('.g3ref .fu-aba[aria-selected="true"]');
  chk('I7c', /border-bottom:\s*2px solid var\(--texto\)/.test(a) && /color:\s*var\(--texto\)/.test(a)
          && !/var\(--acento/.test(a),
      'a aba selecionada se distingue por FORMA (o sublinhado de 2px na tinta forte) e nao so por cor '
      + 'de texto — e nao e mais laranja: o laranja e do ato da tela (One Orange)');
}

// O ANEL DE FOCO E SEMPRE `--foco`. Ele e o unico token medido contra 3:1 em toda
// superficie (T2 da suite do tema); qualquer outra cor num `outline` e um anel
// que ninguem mediu. `.fu-solta` desenhava o dela com `--acento`, que da 2,41:1
// sobre o cartao e reprova a WCAG 1.4.11.
/*
 * E A I7d TINHA UM BURACO QUE SO APARECEU EM 14/08, quando a ilha `.g3ref`
 * trouxe o primeiro token com DIGITO no nome.
 *
 * O padrao era `var\(--([a-z-]+)\)`, e `[a-z-]` nao casa o `3` de `--g3ref-`. Um
 * `outline: 2px solid var(--g3ref-laranja)` simplesmente NAO ERA VISTO: a
 * verificacao seguia dizendo "todo outline do sistema usa var(--foco)" com um
 * outline que nao usa passando ao lado dela. Nao e o caso de agora ser assim de
 * proposito e a mensagem estar errada — a mensagem estava certa e o teste e que
 * nao media o que dizia medir.
 *
 * Agora ele le REGRA A REGRA, e a fronteira e explicita: fora da ilha continua
 * `--foco`, que e o unico token medido contra 3:1 em toda superficie (T2 da
 * suite do tema); DENTRO da ilha e o laranja da referencia, que e o que ela
 * escreve (`outline: 2px solid #E8843C; outline-offset: 0`) e que da 2,41:1
 * sobre o cartao — abaixo dos 3:1 da WCAG 1.4.11. Faz parte da mesma decisao de
 * tinta exata do dono, e esta em `Q-DOCG3-15` junto do resto.
 */

/** As regras do CSS, como pares (seletor, declaracoes). Duas limpezas antes, e
 *  as duas foram defeito na primeira versao desta funcao:
 *
 *    - os COMENTARIOS saem. Sem isso o bloco de comentario acima de uma regra
 *      entra no "seletor" dela, e a mensagem de falha vira um paragrafo;
 *    - os cabecalhos de `@media` saem. Eles nao sao seletor, e envolveriam o
 *      seletor de dentro. */
const REGRAS_PARES: Array<[string, string]> =
  [...REGRAS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '')
     .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => [m[1]!.trim().replace(/\s+/g, ' '), m[2]!]);

/** As declaracoes de uma regra, como pares (propriedade, valor).
 *
 *  ELAS SAO PARSEADAS E NAO CASADAS POR REGEX, e o motivo e um defeito medido:
 *  `border-radius:\s*(?!0\b)` parece dizer "raio diferente de zero" e nao diz —
 *  `\s*` casa VAZIO, entao o lookahead cai sobre o espaco depois dos dois
 *  pontos, o espaco nao e `0`, e `border-radius: 0` era acusado como raio. Todo
 *  teste "propriedade com valor diferente de X" escrito por regex tem essa
 *  armadilha; com o valor na mao ela nao existe. */
const declaracoes = (bloco: string): Array<[string, string]> =>
  bloco.split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
    })
    .filter(([p]) => p !== '');

{
  const daIlha = (sel: string) => sel.includes('.g3ref');
  const fora: string[] = [];
  const dentro: string[] = [];
  for (const [sel, decl] of REGRAS_PARES) {
    for (const m of decl.matchAll(/outline:\s*[^;]*var\(--([a-z0-9-]+)\)/g)) {
      (daIlha(sel) ? dentro : fora).push(m[1]!);
    }
  }
  chk('I7d', fora.length > 0 && fora.every((t) => t === 'foco'),
      `fora da ilha, todo "outline" usa var(--foco) — achados: ${[...new Set(fora)].join(', ') || 'nenhum'}`);
  /* [30/09] A I7f INVERTEU. Ela prendia o anel da ilha no laranja da referencia
   * (2,41:1 sobre o creme, abaixo dos 3:1 da 1.4.11), que era parte da excecao
   * `Q-DOCG3-15`. Com a excecao fechada, a ilha usa o anel do sistema — e o que
   * esta linha prende agora e que ela continue tendo anel (a area de envio e um
   * <label> com input invisivel: sem o `:focus-within` ela fica sem sinal) e que
   * ele seja o mesmo de todo o resto. */
  chk('I7f', dentro.length > 0 && dentro.every((t) => t === 'foco'),
      'dentro da ilha, todo "outline" e o mesmo --foco do sistema — um anel so, medido a 3:1 '
      + `(achados: ${[...new Set(dentro)].join(', ') || 'nenhum'})`);
}

// E TODO ELEMENTO FOCAVEL POR TECLADO TEM ANEL. `summary` nao e `a`, nao e
// `button` e nao e `.interruptor` — a regra geral de foco nao o alcancava, e
// quem navega por Tab chegava nele sem sinal nenhum na tela.
chk('I7e', /summary:focus-visible\s*\{[^}]*outline:/.test(REGRAS),
    'o <summary> do cadastro tem anel de foco proprio — a regra geral so alcanca a/button/th/.interruptor');

// ============================ I8 o g3ref E o sistema (30/09/2026)
//
// DE 14/08 A 30/09 ESTA SECAO PRENDIA UMA ILHA. O pedido do dono foi *"a
// referencia exata deve ser g3-fatura-unificada.vercel.app, sem tirar nem por"*,
// e a aba Documento ganhou fonte, paleta, raio e sombra proprios dentro de um
// escopo `.g3ref`. As verificacoes pegavam a EROSAO da ilha: escolhas que
// contrariavam o resto do sistema (quadrado onde tudo era redondo, sem sombra
// onde tudo tinha, outra fonte, outra tinta) e que voltariam sozinhas na
// proxima edicao distraida.
//
// EM 30/09 O DONO DECIDIU QUE A ILHA E O SISTEMA (etapa 0 do redesenho). A
// pergunta mudou de "a aba continua diferente das outras?" para "as quatorze
// telas continuam falando UMA lingua?" — e o modo de falha e o mesmo, de sinal
// trocado: uma regra nova com `border-radius: 8px`, um cartao com sombra, um
// titulo na fonte do corpo, uma segunda regra de botao so para uma tela. Cada
// verificacao abaixo e um caminho concreto de volta da segunda gramatica.
//
// Nenhuma delas afirma "esta igual a referencia" — isso e foto, e a foto e
// tirada a cada etapa. Elas pegam o que a foto nao pega na proxima edicao.

// --- I8a a fonte do sistema e a da referencia, nos papeis dela
{
  chk('I8a', /font:[^;]*var\(--fonte\)/.test(regraDe('body')) && /--fonte:\s*'Barlow'/.test(VARIAVEIS_CSS),
      'o corpo do sistema INTEIRO e a Barlow — declarada no body, nao num escopo');
  /* Os papeis da condensada numa regra so: titulo, rotulo caixa-alta, cabecalho
     de tabela, nome e numero do KPI, selo e item do menu (ate 30/09/2026, aba da
     barra: `.barra-nav a`; desde a etapa 3b, `.lateral-item`). */
  const papeis = REGRAS_PARES.find(([sel]) =>
    /(^|, )h1, h2, h3\b/.test(sel) && sel.includes('thead th') && sel.includes('.lateral-item')
    && sel.includes('.kpi .valor') && sel.includes('.marca'));
  chk('I8a2', papeis !== undefined && /font-family:\s*var\(--fonte-cond\)/.test(papeis[1]),
      'titulo, rotulo em caixa alta, cabecalho de tabela, numero do KPI, selo e item do menu sao a '
      + 'Barlow Semi Condensed — e numa regra so, por papel');
  chk('I8a3', /font-family:\s*var\(--fonte-cond\)/.test(regraDe('button'))
          && /text-transform:\s*uppercase/.test(regraDe('button.primario'))
          && !/text-transform/.test(regraDe('button')),
      'o botao e condensado, e SO o primario e caixa alta — e o que o separa dos outros antes da cor');
}

// --- I8b a ilha HERDA, nao copia
//
// O que a ilha repetia para se diferenciar da casa saiu em 30/09: fonte do
// escopo, cartao, campo, rotulo, botao comum e primario, aviso, titulos,
// cabecalho de tabela. Se qualquer um desses seletores voltar, a tela da Fatura
// unificada volta a ter um segundo desenho do mesmo componente — e a proxima
// correcao entra num so dos dois.
{
  const DUPLICATAS = [
    '.g3ref', '.g3ref button', '.g3ref button.primario', '.g3ref button:hover:not(:disabled)',
    '.g3ref input, .g3ref select, .g3ref textarea', '.g3ref label', '.g3ref h2', '.g3ref h3',
    '.g3ref thead th', '.g3ref .rolagem', '.g3ref .sub', '.g3ref .fraco',
    '.g3ref .fu-acao', '.g3ref button.fu-texto',
  ];
  const seletores = new Set(REGRAS_PARES.map(([sel]) => sel));
  const voltaram = DUPLICATAS.filter((d) => seletores.has(d));
  chk('I8b', voltaram.length === 0,
      'a ilha nao redesenha nenhum componente geral — cartao, campo, botao, titulo e tabela sao '
      + `herdados (voltaram: ${voltaram.join(' · ') || 'nenhum'})`);
  /* A aba de etapa e o painel navy continuam sendo DESTA tela: sem eles a
     secao teria virado vazia, e o que o `documento.tsx` poe na raiz nao teria o
     que escopar. [30/09, etapa 1] A grade de duas colunas (`.fu-grade`) saiu:
     o lote foi para a largura total e a conta aberta para a GAVETA, que e o
     terceiro desenho so desta tela. */
  chk('I8b2', seletores.has('.g3ref .fu-aba') && seletores.has('.g3ref .fu-painel')
          && seletores.has('.g3ref .fu-gaveta'),
      'e o que so a Fatura unificada tem continua escopado nela: abas de etapa, gaveta e painel navy');
}

// --- I8c raio e sombra, no sistema inteiro
//
// A referencia nao tem UM canto arredondado e nao tem UMA sombra — a folha A4
// tem, e ela e papel sobre a mesa. Desde 30/09 isso vale para as quatorze telas.
// Os tres tokens de raio continuam existindo (e por eles que o raio tem nome) e
// sao presos em no maximo 2px; toda regra fora do papel usa zero ou um deles.
// As excecoes sao NOMEADAS, e cada uma diz por que:
//
//   raio-pilula   as bolhas do balao de ajuda — a cauda de um balao de
//                 pensamento e redonda por natureza
//   sombra-3      o que FLUTUA: menu da conta, menu de setor, painel e balao de
//                 ajuda. Ali a sombra e o que diz "isto esta por cima"
{
  const px = (v: string) => (v === '0' ? 0 : /^(\d+(\.\d+)?)px$/.test(v) ? Number.parseFloat(v) : Number.NaN);
  const tokens = [RITMO.raio, RITMO.raioCartao, RITMO.raioPequeno];
  chk('I8c', tokens.every((v) => px(v) <= 2),
      `os tres raios do sistema sao retos ou quase (<= 2px) — hoje ${tokens.join(' / ')}`);

  const RAIO_OK = /^(0|var\(--raio(-cartao|-pequeno)?\))$/;
  const FLUTUAM = ['.menu-painel', '.setor-painel', '.ajuda-painel', '.ajuda-balao'];
  const ruins: string[] = [];
  const foraDoPapel: Array<[string, string]> =
    [...foraDoDocumento.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '')
       .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => [m[1]!.trim().replace(/\s+/g, ' '), m[2]!]);
  for (const [sel, decl] of foraDoPapel) {
    for (const [prop, valor] of declaracoes(decl)) {
      if (prop === 'border-radius') {
        const partes = valor.split(/\s+(?![^(]*\))/);
        const pilula = valor === 'var(--raio-pilula)' && sel.includes('.ajuda-bolha');
        if (!pilula && !partes.every((p) => RAIO_OK.test(p))) ruins.push(`${sel} { raio ${valor} }`);
      }
      if (prop === 'box-shadow' && valor !== 'none') {
        const flutua = valor === 'var(--sombra-3)' && FLUTUAM.some((f) => sel === f);
        if (!flutua) ruins.push(`${sel} { sombra ${valor} }`);
      }
    }
  }
  chk('I8c2', ruins.length === 0,
      'fora do papel impresso, nenhuma regra tem raio fora dos tokens nem sombra fora do que flutua '
      + `— achadas: ${ruins.join(' · ') || 'nenhuma'}`);
}

// --- I8d a tipografia da referencia esta servida pela nossa origem
//
// As duas familias, os quatro pesos que a referencia realmente pinta, `swap` em
// todas e ZERO URL externa. A ultima nao e detalhe: a referencia carrega as
// fontes do `fonts.gstatic.com`, e copiar isso poria uma dependencia de rede de
// terceiro no caminho de uma tela de faturamento — agora de TODAS elas.
{
  const faces = [...VARIAVEIS_CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!);
  const daRef = faces.filter((f) => /font-family:\s*'Barlow/.test(f));
  const chave = (f: string) =>
    `${/font-family:\s*'([^']+)'/.exec(f)?.[1]}|${/font-weight:\s*(\d+)/.exec(f)?.[1]}`;
  const combinacoes = new Set(daRef.map(chave));
  const esperadas = ['Barlow', 'Barlow Semi Condensed']
    .flatMap((fam) => [400, 500, 600, 700].map((p) => `${fam}|${p}`));
  chk('I8d', esperadas.every((e) => combinacoes.has(e)),
      `as duas familias da referencia cobrem os pesos 400/500/600/700 — faltando: `
      + `${esperadas.filter((e) => !combinacoes.has(e)).join(', ') || 'nenhum'}`);
  chk('I8e', daRef.length > 0 && daRef.every((f) => /font-display:\s*swap/.test(f)),
      'toda face da Barlow declara font-display: swap — o texto aparece antes do arquivo chegar');
  chk('I8f', daRef.length > 0 && daRef.every((f) => /src:\s*url\('\/fontes\//.test(f)),
      'toda face da Barlow vem de /fontes/, da nossa origem — a referencia as puxa do '
      + 'fonts.gstatic.com, e isso nao veio junto');
  chk('I8g', /--fonte:\s*'Barlow'/.test(VARIAVEIS_CSS)
          && /--fonte-cond:\s*'Barlow Semi Condensed'/.test(VARIAVEIS_CSS)
          && TIPOGRAFIA.familia.includes('system-ui') && TIPOGRAFIA.familiaCond.includes('sans-serif'),
      'as duas familias sao tokens do :root e a pilha de sistema fica ATRAS delas — sem o arquivo, '
      + 'a tela e a de ontem na fonte do sistema, nao uma tela quebrada');
}

// --- I8h o laranja cru nunca e TINTA sobre superficie clara
//
// Era a outra metade da excecao `Q-DOCG3-15`: a ilha escrevia titulo de secao e
// anel de foco com o `#E8843C` puro, 2,69:1 no branco e 2,41:1 no creme. O
// laranja cru vale como tinta num lugar so — sobre o NAVY (5,93:1) — e como
// desenho decorativo sem informacao (a marca d'agua do KPI, a engrenagem do
// carregando). Em superficie clara, o laranja-texto e `--acento-forte`.
{
  /* `.barra` (a faixa do topo) saiu em 30/09/2026 com a etapa 3b; o navy agora e
     o menu lateral (`.lateral`), e o item ativo dele e o laranja sobre o navy. */
  const SOBRE_O_NAVY_OU_DECORATIVO = ['.lateral', '.setor-gatilho', '.fu-painel', '.marca-dagua', '.marca-girando'];
  const intrusos: string[] = [];
  for (const [sel, decl] of REGRAS_PARES) {
    for (const [prop, valor] of declaracoes(decl)) {
      if (prop === 'color' && valor === 'var(--acento)'
          && !SOBRE_O_NAVY_OU_DECORATIVO.some((s) => sel.includes(s))) intrusos.push(sel);
    }
  }
  chk('I8h', intrusos.length === 0,
      'o laranja cru so e tinta sobre o Navy ou em desenho decorativo — em superficie clara o '
      + `texto laranja e --acento-forte (achados: ${intrusos.join(' · ') || 'nenhum'})`);
}

// --- I8i a folha impressa nao herda a fonte da tela
//
// A regra 4 da etapa: o papel nao muda de aparencia. Ate 30/09 a folha HERDAVA
// familia, tamanho, entrelinha e tracking do `.g3ref` em volta; quando o
// `.g3ref` parou de declara-los, a folha mudaria de medida sem ninguem tocar
// nela. Os quatro estao cravados no `.g3`, e a familia e literal.
{
  const g3 = regraDe('.g3');
  chk('I8i', /font-family:\s*'Barlow', system-ui, sans-serif/.test(g3) && /font-size:\s*16px/.test(g3)
          && /line-height:\s*normal/.test(g3) && /letter-spacing:\s*normal/.test(g3),
      'a folha crava a propria fonte (Barlow literal, 16px, entrelinha e tracking normais) — '
      + 'o corpo da tela pode mudar sem o papel acompanhar');
}

// =============== I9 as tres abas estao na barra, e o `#cadastro` abre a terceira
//
// De 14/08 a 30/09 a aba de cadastro esteve OCULTA — *"deixe a etapa de cadastro
// da fatura oculta por enquanto"* — e estas verificacoes protegiam o "por
// enquanto": que oculta nao virasse inalcancavel. Em 30/09 (etapa 1 do
// redesenho) ela voltou para a barra, pelo motivo que a propria I9 guardava: e o
// UNICO caminho de tela para razao social, CNPJ, contato, logo, chave Pix,
// campos, modelo e campos personalizados — e os cinco campos do emissor estavam
// VAZIOS em producao no dia em que ela foi escondida.
//
// O que continua valendo e o fragmento: Pendencias, a ajuda e tres mensagens do
// servidor mandam para `/documento#cadastro` pelo nome da aba («Dados de quem
// cobra» desde 01/10/2026).

chk('I9', ABAS.length === 3 && ABAS[0] === 'leitura' && ABAS[1] === 'emissao' && ABAS[2] === 'cadastro',
    `as tres abas estao na barra, na ordem do trabalho (hoje: ${ABAS.join(' | ')})`);

/* [01/10/2026, etapa 7b] AS ABAS PERDERAM O NUMERO. A I9b prendia o contrario
 * («3 ·» na terceira), e o numero era o defeito que a critica de 01/10 achou:
 * Contas de luz e onde moram os PASSOS 1 e 2 do mes, e as abas «1 · 2 · 3»
 * logo abaixo eram uma segunda numeracao que nao casava com a primeira. A
 * terceira tambem mudou de nome: «Cadastro da fatura» nao cadastra fatura — e
 * o emissor, quem cobra. Ver `abas-da-fatura.ts`. */
chk('I9b', ABAS.every((a) => !/\d|·/.test(ROTULO_DA_ABA[a])),
    `nenhuma aba carrega numero — a tela ja numera os passos do mes (hoje: ${ABAS.map((a) => ROTULO_DA_ABA[a]).join(' | ')})`);
chk('I9b2', ROTULO_DA_ABA.cadastro === 'Dados de quem cobra' && !/fatura/i.test(ABAS.map((a) => ROTULO_DA_ABA[a]).join(' ')),
    'a terceira diz o que guarda — os dados de quem cobra — e nenhuma diz «fatura», que na tela e so a folha impressa');
{
  /* E NENHUM TEXTO CITA A ABA PELO NOME VELHO, na web nem no SERVIDOR: tres
   * mensagens de `src/` mandam a pessoa para a aba pelo nome, e um nome que a
   * barra nao mostra e um caminho que nao existe. */
  const raiz = new URL('../../', import.meta.url);
  const arquivos = (dir: string): string[] => readdirSync(new URL(dir, raiz), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? arquivos(`${dir}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}${e.name}`] : []));
  const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '');
  const velhos = [...arquivos('web/src/'), ...arquivos('src/')]
    .filter((f) => /\d · (Leitura e c|Folha do cliente|Cadastro da fatura)/.test(semComentario(readFileSync(new URL(f, raiz), 'utf8'))));
  chk('I9b3', velhos.length === 0,
      `nenhum texto da web nem do servidor cita uma aba numerada${velhos.length ? ` — ACHADO: ${velhos.join(', ')}` : ''}`);
  const doServidor = ['src/repos/documento.ts', 'src/repos/prontidao.ts']
    .every((f) => readFileSync(new URL(f, raiz), 'utf8').includes('"Dados de quem cobra"'));
  chk('I9b4', doServidor && readFileSync(new URL('src/dominio/fatura-do-registro.ts', raiz), 'utf8').includes('"Leitura e cálculo"'),
      'e as mensagens do servidor citam as abas pelo nome de hoje');
}

// A PORTA DO ENDERECO CONTINUA ABERTA, agora para ABRIR e nao para revelar.
chk('I9c', abaDoFragmento(FRAGMENTO_DO_CADASTRO) === 'cadastro'
        && abaDoFragmento(FRAGMENTO_DO_CADASTRO.replace(/^#/, '')) === 'cadastro'
        && abaDoFragmento('#CADASTRO') === 'cadastro',
    `"${FRAGMENTO_DO_CADASTRO}" abre a aba do cadastro, com ou sem o "#" e sem depender de caixa`);

chk('I9d', abaDoFragmento('') === null && abaDoFragmento('#') === null
        && abaDoFragmento('#emissao') === null && abaDoFragmento('#cadastro-de-outra-coisa') === null,
    'e nenhum outro fragmento abre aba nenhuma — inclusive o vazio, que e o caso normal');

// A ABA 2 NAO DIZ «EMISSAO». Ela e a folha que o cliente recebe, para conferir e
// imprimir; «2 · Emissão» fazia quem estava no passo 1 procurar ali o passo 3 do
// mes, que e a tela «Emissão e cobrança» (critica de 30/09, heuristica 2).
chk('I9e', !/emiss/i.test(ROTULO_DA_ABA.emissao) && /folha/i.test(ROTULO_DA_ABA.emissao),
    `a aba 2 diz o que mostra — a folha — e nao «Emissão» (hoje: «${ROTULO_DA_ABA.emissao}»)`);

// O ENDERECO ACOMPANHA A ABA. Com `#cadastro` parado no endereco depois de
// sair do cadastro, um link para `/documento#cadastro` nao mudava o fragmento,
// nao disparava `hashchange` e o clique nao abria nada.
chk('I9f', fragmentoDaAba('cadastro') === FRAGMENTO_DO_CADASTRO
        && fragmentoDaAba('leitura') === '' && fragmentoDaAba('emissao') === '',
    'o fragmento so esta no endereco com o cadastro aberto — sair dele o tira');

chk('I9g', ABAS.every((a) => (ROTULO_DA_ABA[a] ?? '').trim() !== ''),
    'toda aba tem rotulo — uma aba sem nome na barra e um botao mudo');

// ============================================================================
// I10 — A ABA DO CAMINHO APOSENTADO NÃO EXISTE MAIS
// ============================================================================
//
// Ela teve, por três semanas, o nome mais óbvio da barra para quem procura «onde
// eu faturo o mês» — e era o caminho aposentado desde 21/08/2026, em que uma
// cobrança composta TRAVA a mesma unidade no caminho oficial (`uc_ja_faturada`).
// Em 10/09 ganhou a marca «(caminho antigo)» e, no mesmo dia, saiu.
//
// ESTAS LINHAS PRENDEM O QUE A REMOÇÃO COMPROU. Uma tela removida volta fácil:
// basta alguém acrescentar a linha na lista achando que faltava. O que a suíte
// afirma é que a barra não a oferece de novo, e que ninguém aponta para um
// endereço que não desenha mais nada.
{
  chk('I10a', !TELAS.some((t) => t.rota === '/carteira'),
      'a aba do faturamento em lote não está na barra — quem seguisse o nome dela não recebia '
      + 'erro, recebia um mês composto pelo caminho velho');

  /* O `telaDoCaminho` cai na PRIMEIRA tela para caminho desconhecido, de
   * propósito (é o que faz `/prontidao` continuar abrindo Pendências). Aqui isso
   * é a garantia de que um link velho para `/carteira`, guardado por alguém nos
   * favoritos, abre a primeira tela em vez de uma página em branco. */
  chk('I10b', telaDoCaminho('/carteira').rota === TELAS[0]!.rota,
      'e um link antigo para ela cai em Pendências, que é a primeira tela — favorito velho não '
      + 'vira tela em branco');

  chk('I10c', TELAS.every((t) => t.titulo.trim() !== '' && t.rota.startsWith('/')),
      'e as que ficaram continuam todas com rótulo e rota — a remoção tirou uma linha da lista '
      + 'sem deixar buraco nas vizinhas');
}

// ============================================================================
// I11 — A FATURA UNIFICADA SAI EM DUAS PAGINAS, SEMPRE (30/09/2026)
// ============================================================================
//
// O dono imprimiu uma fatura com boleto e recebeu TRES paginas: a folha tinha so
// altura MINIMA de 297 mm, e com endereco longo e campos do tenant a folha 1
// media 301 mm. Os 4 mm sobrando viravam uma pagina propria e o corte "uma folha
// por pagina" empurrava a folha 2 para a terceira. MEDIDO no espelho com o build
// de producao: 3 paginas antes, 2 depois, nos dois modos de PDF.
//
// ESTAS LINHAS PRENDEM AS TRES METADES DO CONSERTO. Nenhuma delas se ve olhando a
// tela com um caso que cabe — e justamente o caso das suites e do espelho antigo,
// que dava 2 paginas e deixou o defeito passar.
//
// E A SEGUNDA RODADA DO MESMO DIA: a primeira versao fazia o detalhamento
// encolher com recorte, e no caso real a barra «Total» saia cortada ao meio. O
// conserto passou a ser na CAUSA (o endereco ganha a largura que pede) e, quando
// ainda nao cabe, a folha COMPACTA em degraus medidos em vez de recortar.
{
  const g3 = regraDe('.g3');
  chk('I11a', /(^|[\s;{])height:\s*297mm/.test(g3) && !/min-height/.test(g3) && /overflow:\s*hidden/.test(g3),
      'a folha tem ALTURA FIXA de 297 mm e apara o que sobra — "min-height" so garantia o piso, e o '
      + 'excesso virava uma terceira pagina');

  const inicioPrint = REGRAS.indexOf('@media print');
  const fimPrint = REGRAS.indexOf(MARCA_FIM, inicioPrint);
  const print = inicioPrint > 0 && fimPrint > inicioPrint ? REGRAS.slice(inicioPrint, fimPrint) : '';
  const regrasDaFolhaNoPapel = print.match(/\.g3\s*\{[^}]*\}/g) ?? [];
  chk('I11b', print !== '' && regrasDaFolhaNoPapel.length > 0
      && regrasDaFolhaNoPapel.every((r) => !/(min-|max-)?height|overflow/.test(r)),
      'e nenhuma regra de impressao devolve a folha a altura livre — a altura fixa vale no papel');

  /* Sem comentarios: um comentario com "overflow" ou "{" no meio nao pode virar regra. */
  const SO_REGRAS = REGRAS.replace(/\/\*[\s\S]*?\*\//g, '');
  const encolhe = (SO_REGRAS.match(/[^{}]*\{[^}]*flex-shrink:\s*1[^}]*\}/g) ?? [])
    .filter((r) => /\.g3\b/.test(r)).map((r) => r.slice(0, r.indexOf('{')).trim());
  chk('I11c', /flex-shrink:\s*0/.test(regraDe('.g3 > *'))
      && encolhe.length === 1 && encolhe[0] === '.g3.aperto-maximo > .g3-hist'
      && /min-height:\s*0/.test(regraDe('.g3.aperto-maximo > .g3-hist'))
      && /overflow:\s*clip/.test(regraDe('.g3.aperto-maximo > .g3-hist')),
      'nada da folha encolhe sozinho; so o grafico do historico, e so no ultimo degrau — '
      + `achadas: ${encolhe.join(' | ') || 'nenhuma'}`);

  const regrasDoDet = (SO_REGRAS.match(/[^{}]*\.g3-det[^{}]*\{[^}]*\}/g) ?? []);
  chk('I11c2', /flex:\s*none/.test(regraDe('.g3 > .g3-det'))
      && regrasDoDet.every((r) => !/overflow|flex-shrink:\s*1|max-height/.test(r)),
      'o detalhamento NUNCA encolhe nem recorta — a barra «Total» saia cortada ao meio na '
      + 'primeira versao deste conserto');

  const faixa = regraDe('.faixa-pgto');
  chk('I11d', /flex:\s*none/.test(faixa) && !/height:\s*100%/.test(faixa)
      && /break-inside:\s*avoid/.test(faixa),
      'a faixa de pagamento NAO ENCOLHE e nao quebra — e "height: 100%" contra a folha fixa a '
      + 'esticaria ate o pe e empurraria o resto para fora');

  chk('I11e', /height:\s*13mm/.test(regraDe('.faixa-pgto-barras')) && /flex:\s*none/.test(regraDe('.faixa-pgto-barras'))
      && /width:\s*30mm;\s*height:\s*30mm/.test(regraDe('.faixa-pgto-qr')) && /flex:\s*none/.test(regraDe('.faixa-pgto-qr')),
      'codigo de barras (13 mm) e QR (30 mm) tem tamanho cravado e nao cedem — precisam ler no '
      + 'caixa e na camera');

  chk('I11f', /\.folha-item \+ \.folha-item\s*\{\s*break-before:\s*page/.test(print)
      && /#documento\s*\{[^}]*position:\s*absolute;\s*left:\s*0;\s*top:\s*0/.test(print),
      'o corte continua sendo um por folha, e o documento continua preso ao topo da pagina');

  chk('I11g', /body \*:has\(#documento\)\s*\{[^}]*position:\s*static !important;[^}]*transform:\s*none !important/.test(print),
      'e nenhum ancestral pode virar referencia do "top: 0" — um "position: relative" na casca '
      + 'desceria as folhas e mandaria o pe da segunda para outra pagina');

  // ---- os degraus de aperto
  chk('I11h', proximoNivelDoAperto(0, 1123, 1123) === 0 && proximoNivelDoAperto(0, 1124, 1123) === 0
      && proximoNivelDoAperto(0, 1138, 1123) === 1 && proximoNivelDoAperto(2, 1200, 1123) === 3
      && proximoNivelDoAperto(NIVEL_MAXIMO_DO_APERTO, 9999, 1123) === NIVEL_MAXIMO_DO_APERTO,
      'a folha so sobe de degrau quando o conteudo passa do pe (1 px de folga para o subpixel), '
      + 'um por vez, e para no ultimo');

  chk('I11i', classesDoAperto(0) === '' && classesDoAperto(1) === 'aperto-grade'
      && classesDoAperto(2) === 'aperto-grade aperto-compacta'
      && classesDoAperto(3) === 'aperto-grade aperto-compacta aperto-maximo',
      'o degrau 0 nao poe classe nenhuma — a fatura que cabe sai identica — e os degraus acumulam');

  const ENDERECO_DA_EQUATORIAL = 'RUA DAS ORQUÍDEAS DO CERRADO QD 147 LT 22 CASA 02, RESIDENCIAL '
    + 'JARDINS DO LAGO III, APARECIDA DE GOIÂNIA-GO, 74968-510';
  chk('I11j', larguraDoCampoDaFolha('Endereço', ENDERECO_DA_EQUATORIAL) === 'meta-inteira'
      && larguraDoCampoDaFolha('Consultor responsável', 'Leonard Rateio de Souza') === 'meta-dupla'
      && larguraDoCampoDaFolha('Vencimento na conta da Equatorial', '07/10/2026') === 'meta-dupla'
      && larguraDoCampoDaFolha('Unidade consumidora', '5507447721') === 'meta-simples'
      && larguraDoCampoDaFolha('Mês de referência', '09/2026') === 'meta-simples',
      'no aperto, o endereco da Equatorial ganha linha propria e o campo que quebraria ganha duas '
      + 'colunas — a causa medida dos 301 mm era o endereco em 1/4 da grade');

  chk('I11k', /grid-column:\s*1 \/ -1/.test(regraDe('.g3.aperto-grade .g3-meta > .meta-inteira'))
      && /grid-column:\s*span 2/.test(regraDe('.g3.aperto-grade .g3-meta > .meta-dupla'))
      && /grid-auto-flow:\s*row dense/.test(regraDe('.g3.aperto-grade .g3-meta')),
      'e a grade obedece: linha inteira, duas colunas, e "dense" para nao deixar buraco');

  const doAperto = (SO_REGRAS.match(/[^{}]*\.aperto-[a-z]+[^{}]*\{[^}]*\}/g) ?? []);
  chk('I11l', doAperto.length >= 10
      && doAperto.every((r) => !/faixa-pgto-(barras|qr|linha|codigo)|font-size/.test(r)),
      'nenhum degrau toca codigo de barras, QR, linha digitavel nem copia-e-cola, e nenhum reduz '
      + 'corpo de letra — compactar e espacamento e entrelinha');
}

// ------------------------------------------ I12 celular e acessibilidade (01/10/2026, etapa 5)
//
// O que a etapa 5 prometeu no CSS e que um ajuste distraido desfaz sem nenhum
// teste de tela perceber: a tabela vira cartao pela largura DELA, o alvo de
// toque e de 44px no celular, a regiao viva vazia continua na arvore de
// acessibilidade, e o botao da ajuda sobe para a faixa do topo onde ela existe.
{
  const LIMPO = REGRAS.replace(/\/\*[\s\S]*?\*\//g, '');
  const bloco = (abre: string): string => {
    const i = LIMPO.indexOf(abre);
    if (i < 0) return '';
    let n = 0;
    for (let j = LIMPO.indexOf('{', i); j < LIMPO.length; j++) {
      if (LIMPO[j] === '{') n++;
      else if (LIMPO[j] === '}' && --n === 0) return LIMPO.slice(i, j + 1);
    }
    return '';
  };
  chk('I12a', /\.tabela-cartoes\s*\{\s*container:\s*tabela \/ inline-size;/.test(LIMPO)
      && bloco('@container tabela (max-width: 720px)').includes('.tabela-cartoes tbody > tr {'),
      'a tabela e um container e vira cartao abaixo de 720px DELA — com o menu aberto, recolhido ou na gaveta');
  const cartao = bloco('@container tabela (max-width: 720px)');
  chk('I12b', /td\[data-rotulo\]:not\(\[data-rotulo=""\]\)::before\s*\{[^}]*content:\s*attr\(data-rotulo\)/.test(cartao)
      && /td\.c-aco/.test(cartao) && /td\.c-sit/.test(cartao) && /td\.c-val/.test(cartao) && /td\.c-id/.test(cartao)
      && /min-width:\s*0 !important/.test(cartao),
      'no cartao cada celula leva o nome da coluna, ha lugar para identificacao, situacao, valor e acao, e a '
      + 'largura escrita na celula deixa de empurrar o cartao para fora do telefone');
  const celular = bloco('@media (max-width: 720px) {\n    button:not(');
  chk('I12c', /min-height:\s*44px/.test(celular) && /button\.so-icone[^{]*\{[^}]*min-width:\s*44px/.test(celular)
      && /font-size:\s*16px/.test(celular),
      'no celular todo botao tem 44px, o so-icone 44 nos dois lados, e o campo fica em 16px (o Safari nao da zoom)');
  chk('I12d', /\.regiao-viva:empty\s*\{[^}]*clip-path:\s*inset\(50%\)/.test(LIMPO)
      && !/\.regiao-viva:empty\s*\{[^}]*display:\s*none/.test(LIMPO),
      'a regiao viva vazia e RECORTADA, e nao display:none — sumida da arvore ela nao anunciaria a frase que chega');
  const faixa = bloco(`@media (max-width: ${MENU_VIRA_GAVETA - 0.02}px) {\n    .faixa-celular-linha { padding-right`);
  chk('I12e', /\.ajuda-gatilho\s*\{[^}]*top:\s*6px[^}]*bottom:\s*auto[^}]*width:\s*44px/.test(faixa)
      && /\.ajuda-balao\s*\{[^}]*top:/.test(faixa) && /\.ajuda-gatilho\s*\{[^}]*right:\s*22px;\s*bottom:\s*22px/.test(LIMPO),
      'no computador o botao da ajuda fica no canto de baixo (pedido de 21/08); onde ha a faixa do topo, ele sobe '
      + 'para ela com 44px, e o balao desce dele');
  chk('I12f', /th \.ordenar\s*\{\s*min-height:\s*24px/.test(LIMPO) && /\.campo-porque-botao\s*\{\s*width:\s*24px;\s*height:\s*24px/.test(LIMPO)
      && /\.ajuda-balao-x\s*\{\s*width:\s*24px;\s*height:\s*24px/.test(LIMPO),
      'em qualquer largura nada se aperta com menos de 24px: a seta de ordenar, o porque do campo e o x do balao');
  chk('I12g', /\.rolagem\s*\{[^}]*position:\s*relative/.test(LIMPO),
      'a rolagem e posicionada — o recorte do leitor de tela dentro dela nao escapa e nao empurra a pagina');
}

console.log();
if (falhas > 0) { console.log(`--- interface: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- interface (estilo, movimento e navegacao): ${feitas} verificacoes, 0 falhas`);
