// O VOCABULARIO DAS DOZE TELAS — a mesma regra que a ajuda ja obedecia, agora
// valendo para o sistema inteiro.
// Uso: node --experimental-strip-types web/tests/vocabulario-das-telas.ts
//
// ============================================================================
// O VAO QUE ESTA SUITE FECHA, e ele era grande
//
// Em 21/08/2026 o texto da CENTRAL DE AJUDA era o unico guardado contra jargao:
// `V4` (em `ajuda.ts`) mede os verbetes e os assuntos, `R9` (em
// `caso-render.tsx`) mede o HTML que o painel monta. Nenhum dos dois olha para
// as telas — e as telas sao onde a pessoa passa o dia.
//
// A primeira varredura achou **23 trechos em 7 das 12 telas**, e o retrato era
// exatamente o que se esperaria de um vao sem medicao:
//
//   a PRIMEIRA tela      "Contando as camadas…" era a primeira frase que um
//                        usuario novo lia no sistema, e "Camadas pendentes" era
//                        o titulo de um cartao. "Camada" e o nome da estrutura
//                        interna do relatorio — a propria `V4` o proibe;
//   a ORDEM, em Clientes a unica linha acionavel do aviso ("digite na coluna
//                        Documento") vinha DEPOIS de tres identificadores
//                        internos e antes de um comando de terminal;
//   dois SUBTITULOS      Usinas e Faturas explicavam a divisao do dinheiro com a
//                        palavra "split", que a `GLOSSARIO.md` proibe usar
//                        sozinha porque colide com o split payment tributario.
//
// ============================================================================
// A REGRA E CUMPRIVEL PORQUE EXISTE UM LUGAR PARA O JARGAO
//
// Esta suite NAO manda apagar codigo de questao nem comando em lote: ela manda
// GUARDA-LOS. `<DetalheTecnico>` (em `ui.tsx`) e recortado antes da varredura, e
// isso e o desenho inteiro — a decisao do dono foi "esconder, nao remover", e uma
// regra que obrigasse a remover seria desobedecida na primeira vez que alguem
// precisasse do ponteiro.
//
// Quem escreve texto de tela tem, entao, duas saidas legitimas e nenhuma
// terceira: dizer em portugues, ou por dentro do `<DetalheTecnico>`.
//
// ============================================================================
// POR QUE LE O ARQUIVO COMO TEXTO em vez de montar o componente
//
// O runner do `web/` e `node --experimental-strip-types`, que nao le JSX — o
// mesmo motivo que empurrou toda regra para fora do `.tsx` neste projeto. Ler
// como texto tem um custo declarado: e uma APROXIMACAO do que a tela mostra, nao
// o HTML final. Ela erra para o lado seguro em dois pontos conhecidos, e os dois
// estao tratados abaixo (`${...}` de dado e `className`).
//
// O precedente e `tests/prontidao-destino.ts`, que le o arquivo do servidor como
// texto para conferir a lista de camadas.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rotuloDaColuna, rotuloDaTabela } from '../src/historico.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ler = (rel: string) => readFileSync(SRC + rel, 'utf8');

// ============================================================================
// O QUE A PESSOA LE
// ============================================================================

/** Comentario fora, e as quebras de linha preservadas para o numero da linha do
 *  achado continuar apontando para o lugar certo. */
const semComentario = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/(?<!:)\/\/[^\n]*/g, '');

/**
 * O `<DetalheTecnico>` E A EXCECAO, e a unica.
 *
 * Recortado inteiro: e a forma suportada de manter codigo de questao, nome de
 * coluna e comando em lote. Ele nasce fechado, entao nada disso e a primeira
 * coisa que alguem le — que era o defeito, e nao a existencia do ponteiro.
 */
const semDetalheTecnico = (src: string): string =>
  /* `\b[^>]*` (01/10/2026, etapa 7a): o componente ganhou a propriedade `de`
     («ver detalhe técnico: Contrato ativo»), e `<DetalheTecnico de={…}>` deixou
     de casar com a abertura exata — o recorte parava de recortar. */
  src.replace(/<DetalheTecnico\b[^>]*>[\s\S]*?<\/DetalheTecnico>/g,
              (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));

/** Interpolacao de DADO nao e texto da tela: `${u.codigo_geradora}` vira o codigo
 *  da usina para quem le, e nao o nome da coluna. Sem este corte a suite acusaria
 *  o proprio dado de ser jargao. */
const semInterpolacao = (t: string): string => t.replace(/\$\{[^}]*\}/g, '');

/**
 * NOME DE ICONE NAO E TEXTO DE TELA, e este corte foi pago na primeira execucao:
 * `<Icone nome="abrir_menu" />` caiu na regra de snake_case duas vezes no
 * `ui.tsx`. O `nome` de um `<Icone>` e uma chave da uniao fechada de
 * `iconografia.ts` — ninguem o le, e o compilador ja recusa um valor invalido.
 *
 * O `nome` de um `<Kpi>`, ao contrario, E o titulo do cartao. Por isso o corte e
 * pelo ELEMENTO e nao pela propriedade: some o `<Icone>` inteiro e a propriedade
 * `icone=` de quem a recebe, e `nome=` segue medido em todo o resto.
 */
const semIcones = (src: string): string =>
  src
    .replace(/<Icone\b[^>]*\/?>/g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/\bicone=(?:"[^"]*"|\{[^}]*\})/g, '');

/** As propriedades que carregam texto para a pessoa. `className` e `key` ficam
 *  fora por definicao — sao para o navegador. */
const PROPS = [
  'titulo', 'sub', 'rotulo', 'rotuloTexto', 'rotuloAcessivel', 'dica', 'texto',
  'nome', 'placeholder', 'title', 'label', 'aria-label', 'primeira', 'confirmLabel',
  /*
   * `vazio` ENTROU EM 21/08/2026, e a ausencia dele tinha custo medido.
   *
   * E o texto que a tabela mostra quando NAO ha linha - ou seja, exatamente o
   * que quem abre o sistema pela primeira vez le, porque no comeco toda tabela
   * esta vazia. Ele nao estava na lista, e a varredura passava verde por cima de
   * tres frases que a propria lista de proibidos condena:
   *
   *   usinas      "Sem regra de repasse - o split levanta."
   *   relatorios  "...o split so roda quando uma fatura e liquidada (PRD 5.2)."
   *   relatorios  "...a prontidao acusa (camada `originador_do_contrato`)."
   *
   * Duas com "split", uma com "prontidao", uma com "camada" e uma com nome de
   * coluna. A licao e a de sempre neste projeto: a regra vale onde ela E MEDIDA,
   * e uma propriedade fora da lista e uma regra que nao existe ali.
   */
  'vazio',
  /*
   * `nota`, `manter` e `confirmar` ENTRARAM EM 30/09/2026 (etapa 4b). `nota` e a
   * frase de baixo dos blocos de Relatorios, e era por ela que «PRD §5.4» e
   * «`saldo_kwh` ... RATEIO-USO-01» chegavam a tela sem a suite ver; `manter` e
   * `confirmar` sao os dois botoes da `PerguntaNaTela` (serie.tsx).
   */
  'nota', 'manter', 'confirmar',
];

/** (linha, texto) de tudo o que a tela EXIBE — as propriedades de rotulo e o
 *  texto solto entre tags. */
function visiveis(src: string): Array<[number, string]> {
  const saida: Array<[number, string]> = [];
  const linhaDe = (i: number) => (src.slice(0, i).match(/\n/g) ?? []).length + 1;

  const props = new RegExp(
    `\\b(${PROPS.join('|')})=(?:"([^"]{2,})"|\\{"([^"]{2,})"\\}|\\{\`([^\`]{2,})\`\\})`, 'g');
  for (const m of src.matchAll(props)) {
    saida.push([linhaDe(m.index), m[2] ?? m[3] ?? m[4] ?? '']);
  }
  for (const m of src.matchAll(/>\s*([^<>{}\n]{4,})\s*</g)) {
    const t = m[1]!.trim();
    if (/[A-Za-zÀ-ÿ]/.test(t)) saida.push([linhaDe(m.index), t]);
  }
  return saida;
}

// ============================================================================
// O QUE NAO PODE APARECER
// ============================================================================

/**
 * A MESMA LISTA DA `V4`, e ela e a mesma DE PROPOSITO.
 *
 * Duas listas divergiriam, e a divergencia teria uma forma previsivel: a ajuda
 * ficaria limpa e as telas acumulariam excecoes, porque e nas telas que o dev
 * escreve com pressa. Se um termo passar a ser aceitavel, ele tem de ser
 * aceitavel nos dois lugares — ou nao e.
 */
const PROIBIDO: Array<[RegExp, string]> = [
  [/\bR\d{1,2}\b/, 'codigo de regra (R9, R25) — nao significa nada para quem opera'],
  [/\bQ-[A-Z]/, 'codigo de questao (Q-PAGADOR-01) — e rastreio interno'],
  [/npm run/, 'comando de terminal — quem abre a tela nao tem o repositorio clonado'],
  [/\bADR-\d/, 'numero de decisao de arquitetura'],
  [/\bsplit\b/i, 'a GLOSSARIO.md proibe usar "split" sozinho: colide com o split payment tributario'],
  [/\bprontid[aã]o\b/i, 'o nome interno do calculo; na tela a palavra e "Mês" (a aba) ou "pendencias" (a lista)'],
  [/\bcamadas?\b/i, 'nome da estrutura interna do relatorio'],
  [/\btiers?\b/i, 'jargao de comissionamento'],
  [/\bUC\b/, 'sigla — a tela diz "unidade" ou "unidade consumidora"'],
  [/(?<![\w/])[a-z]{3,}_[a-z]{3,}(?![\w/])/, 'nome de coluna em snake_case'],
  /* [30/09/2026, etapa 4b] Os tres de baixo vieram da critica de 30/09, que
     achou «PRD §5.4» e «RATEIO-USO-01» em Relatorios. Estao tambem na V4
     (`ajuda.ts`) — a lista e uma so, de proposito. */
  [/\bPRD\b|§/, 'referencia a documento interno (PRD §5.4) — quem opera nao tem o documento'],
  [/\b(?:SPEC|AUD)-\d/, 'numero de documento interno (especificacao, auditoria)'],
  [/\b[A-Z]{3,}-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}\b/, 'codigo de rastreio interno (RATEIO-USO-01)'],
];

// ============================================================================
// T1 — as doze telas
// ============================================================================

const TELAS = readdirSync(SRC + 'telas').filter((f) => f.endsWith('.tsx')).sort();

chk('T0', TELAS.length >= 12,
    `ha ${TELAS.length} arquivos de tela para varrer — a suite nao esta olhando para uma pasta vazia`);

for (const arq of TELAS) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(`telas/${arq}`))));
  const achados: string[] = [];

  for (const [linha, cru] of visiveis(src)) {
    const txt = semInterpolacao(cru);
    for (const [regra, porque] of PROIBIDO) {
      const m = regra.exec(txt);
      if (m) { achados.push(`${arq}:${linha} "${m[0]}" (${porque}) em «${txt.slice(0, 60)}»`); break; }
    }
  }

  chk('T1', achados.length === 0,
      `${arq}: nenhum jargao no texto exibido${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T2 — o chrome, que aparece em TODA tela
// ============================================================================
//
// `ui.tsx` e `app.tsx` desenham os avisos, os botoes e os vazios de tabela, e
// `menu-lateral.tsx` o menu (a barra, ate 30/09/2026). Um rotulo errado ali
// aparece em toda tela, e nao em uma.

for (const arq of ['ui.tsx', 'app.tsx', 'menu-lateral.tsx']) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(arq))));
  const achados: string[] = [];
  for (const [linha, cru] of visiveis(src)) {
    const txt = semInterpolacao(cru);
    for (const [regra, porque] of PROIBIDO) {
      const m = regra.exec(txt);
      if (m) { achados.push(`${arq}:${linha} "${m[0]}" (${porque})`); break; }
    }
  }
  chk('T2', achados.length === 0,
      `${arq}: o que aparece em toda tela tambem esta em portugues${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T3 — o esconderijo existe, e e um so
// ============================================================================
//
// A regra acima so e cumprivel porque ha onde guardar o ponteiro. Se
// `DetalheTecnico` sumir do `ui.tsx`, a proxima pessoa que precisar de um codigo
// de questao na tela nao tera saida legitima — e a suite passaria verde enquanto
// o jargao voltasse a ser escrito em outro lugar qualquer.

{
  const ui = ler('ui.tsx');
  chk('T3', /export function DetalheTecnico/.test(ui),
      '`DetalheTecnico` existe em `ui.tsx` — e o unico lugar suportado para codigo de questao, '
      + 'nome de coluna e comando em lote');
  chk('T3b', /ocultar detalhe t[ée]cnico/.test(ui) && /ver detalhe t[ée]cnico/.test(ui),
      'e ele se anuncia com as duas palavras, aberto e fechado');
}

{
  // O bloco tem de ser USADO, e nao so existir: o valor da regra e o jargao ter
  // descido para dentro dele nas telas que o tinham na superficie.
  const usam = TELAS.filter((f) => /<DetalheTecnico>/.test(ler(`telas/${f}`)));
  chk('T3c', usam.length >= 4,
      `${usam.length} tela(s) guardam o detalhe tecnico atras do clique (${usam.join(', ')})`);
}

// ============================================================================
// T4 — nenhuma tela manda rodar comando, em lugar nenhum
// ============================================================================
//
// Esta e a unica regra que NAO aceita o esconderijo, e a diferenca e de
// natureza: as outras proibem uma PALAVRA no lugar errado; esta proibe uma
// INSTRUCAO impossivel. Quem abre a tela nao tem o repositorio clonado nem o
// `.env` na mao — mandar rodar `npm run` como PROXIMO PASSO e um beco, mesmo
// escrito em portugues perfeito.
//
// Dentro do `DetalheTecnico` o mesmo comando e legitimo: la ele e informacao
// para quem tem o repositorio, e nao instrucao para quem nao tem.

for (const arq of TELAS) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(`telas/${arq}`))));
  const linhas = visiveis(src).filter(([, t]) => /npm run/.test(t));
  chk('T4', linhas.length === 0,
      `${arq}: nao manda rodar comando na superficie${linhas.length ? ` — ACHADO na(s) linha(s) ${linhas.map(([l]) => l).join(', ')}` : ''}`);
}

// ============================================================================
// T5 — os corpos, que as telas montam (30/09/2026, etapa 4b)
// ============================================================================
//
// T1 olha `telas/` e T2 o chrome, e o resto do texto do sistema mora nos
// `*-corpo.tsx` e em `serie.tsx` — a revisao da serie, o painel da emissao, o
// funil do mes, o vinculo com o outro sistema. Eram quinze arquivos de texto
// exibido fora da varredura.

const CORPOS = readdirSync(SRC).filter((f) => f.endsWith('.tsx') && !['ui.tsx', 'app.tsx', 'menu-lateral.tsx'].includes(f)).sort();
chk('T5', CORPOS.length >= 10, `ha ${CORPOS.length} arquivos .tsx fora de telas/ para varrer`);
for (const arq of CORPOS) {
  const src = semIcones(semDetalheTecnico(semComentario(ler(arq))));
  const achados: string[] = [];
  for (const [linha, cru] of visiveis(src)) {
    const txt = semInterpolacao(cru);
    for (const [regra, porque] of PROIBIDO) {
      const m = regra.exec(txt);
      if (m) { achados.push(`${arq}:${linha} "${m[0]}" (${porque})`); break; }
    }
  }
  chk('T5', achados.length === 0,
      `${arq}: nenhum jargao no texto exibido${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T6 — codigo interno em QUALQUER texto, e nao so nas propriedades conhecidas
// ============================================================================
//
// T1 a T5 olham as propriedades de rotulo e o texto entre tags. Um codigo que
// chega por outro caminho — uma frase montada numa funcao de regra, um ternario,
// uma propriedade que a lista ainda nao conhece — passava. Foi assim que
// «(Q-ESTORNO-01)» chegou a dica de um botao (`contas-regras.ts`) e «O caminho
// e `npm run ciclo`» a tela Mes (vindo de um DADO, `d.caminho`).
//
// Aqui a varredura e o ARQUIVO INTEIRO, sem comentario e sem `<DetalheTecnico>`,
// de todo `.ts`/`.tsx` de `web/src` — e ela so procura CODIGO (regra, questao,
// comando, documento interno), que nao aparece em nome de variavel nem em chave.
// Por isso nao ha falso positivo a tratar.
//
// DUAS EXCECOES, e as duas declaradas:
//   `estilo.ts`/`tema.ts`  sao CSS dentro de template: os comentarios de CSS
//                          citam questoes, e nenhum deles chega a tela;
//   `destino-da-camada.ts` e o texto de ENGENHARIA de cada camada (`nota`,
//                          `caminho`), escrito para o detalhe tecnico — e a T6b
//                          prova que a tela Mes so o mostra la dentro.

const CODIGO: Array<[RegExp, string]> = [
  [/\bR\d{1,2}\b/, 'codigo de regra'],
  [/\bQ-[A-Z]/, 'codigo de questao'],
  [/npm run/, 'comando de terminal'],
  [/\bPRD\b|§/, 'documento interno'],
  [/\b(?:ADR|SPEC|AUD)-\d/, 'numero de documento interno'],
  [/\b[A-Z]{3,}-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}\b/, 'codigo de rastreio interno'],
];

function todosOsArquivos(dir: string, base = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? todosOsArquivos(`${dir}${e.name}/`, `${base}${e.name}/`)
      : /\.(ts|tsx)$/.test(e.name) ? [`${base}${e.name}`] : []);
}
const FONTES = todosOsArquivos(SRC).sort();
const EXCECOES_T6 = new Set(['estilo.ts', 'tema.ts', 'destino-da-camada.ts']);

{
  const achados: string[] = [];
  for (const arq of FONTES.filter((f) => !EXCECOES_T6.has(f))) {
    semDetalheTecnico(semComentario(ler(arq))).split('\n').forEach((l, i) => {
      for (const [regra, porque] of CODIGO) {
        const m = regra.exec(l);
        if (m) { achados.push(`${arq}:${i + 1} "${m[0]}" (${porque})`); break; }
      }
    });
  }
  chk('T6', FONTES.length > 40 && achados.length === 0,
      `nenhum codigo interno fora do detalhe tecnico, em ${FONTES.length} arquivos de web/src`
      + `${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}
{
  // T6b: a excecao se sustenta — a tela Mes usa `d.nota` e `d.caminho` SO dentro
  // do `<DetalheTecnico>`. Fora dele, os dois nao aparecem.
  const tela = semComentario(ler('telas/prontidao.tsx'));
  const fora = semDetalheTecnico(tela);
  chk('T6b', /d\??\.nota/.test(tela) && /d\.caminho/.test(tela) && !/\{d\??\.(nota|caminho)\}/.test(fora),
      'a nota e o comando em lote de cada camada so aparecem atras do «ver detalhe tecnico»');
}

// ============================================================================
// T7 — nenhuma pergunta do navegador, em lugar nenhum (30/09/2026, etapa 4b)
// ============================================================================
//
// `window.confirm` e `window.prompt` tiram a pessoa da tela para responder sobre
// ela, sem a lista, os valores e o que muda a vista — e o `prompt` e uma caixa
// de uma linha para digitar um motivo. A etapa 4b trocou as seis que restavam
// (Contas de luz, Unidades, Contratos, Usuarios) pela `PerguntaNaTela` de
// `serie.tsx`. Esta verificacao vale para `web/src` inteiro: a proxima tela que
// escrever `confirm(` falha aqui, e nao numa revisao.

{
  const achados: string[] = [];
  for (const arq of FONTES) {
    semComentario(ler(arq)).split('\n').forEach((l, i) => {
      if (/\b(?:window\.)?(?:confirm|prompt|alert)\s*\(/.test(l)) achados.push(`${arq}:${i + 1}`);
    });
  }
  chk('T7', achados.length === 0,
      `nenhum window.confirm, window.prompt ou alert em web/src${achados.length ? ` — ACHADO: ${achados.join(', ')}` : ''}`);
  chk('T7b', /export function PerguntaNaTela/.test(ler('serie.tsx')) && /key === 'Escape'/.test(ler('serie.tsx')),
      'e ha o lugar suportado para perguntar: a `PerguntaNaTela`, que desiste com Esc');
}

// ============================================================================
// T8 — plural por inteiro (30/09/2026, etapa 4b)
// ============================================================================
//
// «3 conta(s) vencida(s)» e o sistema dizendo que nao sabe contar. Os textos vem
// inteiros (`formato.ts:contagem`). A marca procurada e letra seguida de «(s)»
// ou «(es)» e de espaco ou virgula — o que exclui `test(s) ?` e `normalizar(s).`.

{
  const achados: string[] = [];
  for (const arq of FONTES.filter((f) => !EXCECOES_T6.has(f))) {
    semComentario(ler(arq)).split('\n').forEach((l, i) => {
      const m = /[a-zà-ú]\((?:s|es)\)(?:,| [a-zà-úA-Z])/.exec(l);
      if (m) achados.push(`${arq}:${i + 1} "${m[0]}"`);
    });
  }
  chk('T8', achados.length === 0,
      `nenhum plural de parenteses («conta(s)») no texto${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ============================================================================
// T9 e T10 — UM NOME SÓ PARA CADA COISA (01/10/2026, etapa 7b)
// ============================================================================
//
// A crítica de 01/10 (P1 nº 3) achou um objeto com três nomes: a cobrança da G3
// era «fatura» em Cobranças («faturas emitidas ainda sem boleto»), no Mês
// («Para gerar as faturas de setembro») e na ajuda, e «cobrança» no resto; e a
// pessoa que trouxe o cliente era «quem trouxe o cliente» em Contratos, «quem
// traz clientes» no cadastro dela, «quem indicou» no glossário e «originador»
// em Relatórios.
//
// O MAPA, que vale para a tela inteira:
//
//   conta de luz   o que ENTRA, da distribuidora — lida em Contas de luz;
//   cobrança       o que a G3 cobra do cliente — a tabela `fatura` no banco;
//   boleto         o título da cobrança no banco;
//   pagamento      o que o cliente pagou (a baixa);
//   Fatura unificada  SÓ o nome da folha impressa que o cliente recebe;
//   quem trouxe o cliente  a pessoa da comissão — `originador` no banco.
//
// Os NOMES DE CÓDIGO NÃO MUDAM (regra 7 do CLAUDE.md: a tabela é `fatura`, a
// coluna é `originador_id`), e por isso a varredura lê só TEXTO: nos `.tsx`, o
// que `visiveis` acha (rótulos e texto entre tags); nos `.ts`, as frases (o
// literal com espaço), que é como texto de tela é escrito em regra, ajuda e
// vocabulário. Comentário e `<DetalheTecnico>` ficam fora, como em T1.
//
// AS EXCEÇÕES SÃO DECLARADAS AQUI, cada uma com o motivo, e são as únicas:

const EXCECOES_DE_VOCABULARIO: ReadonlyArray<[RegExp, string]> = [
  [/Fatura unificada/gi, 'o nome da folha impressa que o cliente recebe — o único uso de «fatura» na tela'],
  [/\btermos:\s*\[[^\]]*\]/g, 'as palavras que a pessoa DIGITA na busca da ajuda — «fatura» e «originador» são palavras dela'],
  [/\bbusca:\s*\[[^\]]*\]/g, 'idem, no glossário'],
  [/export const PALAVRAS_DA_TELA[\s\S]*?\n\};/g, 'idem, as palavras que levam a cada tela'],
  [/\{ campo: 'flag_fatura_cheia', rotulo: 'Fatura cheia' \}/g,
    'rótulo padrão de um campo IMPRESSO do documento (`documento.tsx`): mudar aqui mudaria o papel'],
  [/\b(?:nota|caminho):\s*(?:null|'(?:[^'\\]|\\.)*'(?:\s*\+\s*'(?:[^'\\]|\\.)*')*)/g,
    'o texto de engenharia de cada camada (`destino-da-camada.ts`), que só aparece atrás do «ver detalhe técnico» (T6b)'],
];

/** A cobrança chamada de fatura: o SUBSTANTIVO. O verbo «faturar» («a unidade
 *  que fatura», «faturável») é o ato de cobrar por período e fica. */
const FATURA_SUBSTANTIVO =
  /\b(?:[Aa]s?|[Dd]as?|[Nn]as?|[Uu]mas?|[Dd]esta|[Dd]essa|[Ee]ssa|[Ee]sta|[Cc]ada|[Ss]ua|[Pp]rimeira|[Nn]enhuma|[Tt]oda|à|[Pp]ela|[Pp]or|de)\s+faturas?\b|\bfaturas\b|\bFaturas?\b/;
const ORIGINADOR = /\boriginador(?:es)?\b|\bquem (?:traz|indicou)\b/i;

/** As frases de um `.ts`: o literal com pelo menos um espaço e uma letra. */
const frasesDoTs = (src: string): Array<[number, string]> => {
  const saida: Array<[number, string]> = [];
  src.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`/g)) {
      const t = m[1] ?? m[2] ?? m[3] ?? '';
      if (/\s/.test(t.trim()) && /[A-Za-zÀ-ÿ]/.test(t)) saida.push([i + 1, t]);
    }
  });
  return saida;
};

const semExcecoes = (src: string): string =>
  EXCECOES_DE_VOCABULARIO.reduce((t, [r]) => t.replace(r, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length)), src);

const TEXTO_DA_TELA = FONTES.filter((f) => !EXCECOES_T6.has(f) || f === 'destino-da-camada.ts')
  .filter((f) => !['estilo.ts', 'tema.ts', 'icones.tsx', 'iconografia.ts', 'api.ts'].includes(f))
  .map((arq) => {
    const limpo = semExcecoes(semIcones(semDetalheTecnico(semComentario(ler(arq)))));
    /* No `.tsx`, além do que `visiveis` acha, a LINHA DE PROSA solta — o meio de
       um parágrafo que quebra linha entre duas tags, que `visiveis` não alcança
       (a aproximação declarada no alto). Prosa é a linha sem sinal de código e
       com pelo menos três palavras. */
    const semImport = (t: string) => t.replace(/^import\b[\s\S]*?from\s+'[^']+';/gm, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));
    const prosa = (t: string): Array<[number, string]> => semImport(t).split('\n')
      .map((l, i): [number, string] => [i + 1, l.trim()])
      .filter(([, l]) => !/[=;{}()]|=>|^[<'"`/*]|^[a-z_]+:/.test(l) && (l.match(/[A-Za-zÀ-ÿ]+/g) ?? []).length >= 3);
    const frases = arq.endsWith('.tsx') ? [...visiveis(limpo), ...prosa(limpo)] : frasesDoTs(limpo);
    return [arq, frases.map(([l, t]) => [l, semInterpolacao(t)] as [number, string])] as const;
  });

{
  const achados = TEXTO_DA_TELA.flatMap(([arq, frases]) =>
    frases.filter(([, t]) => FATURA_SUBSTANTIVO.test(t)).map(([l, t]) => `${arq}:${l} «${t.trim().slice(0, 70)}»`));
  chk('T9', TEXTO_DA_TELA.length > 40 && achados.length === 0,
      `«fatura» só como o nome da folha impressa (a Fatura unificada), em ${TEXTO_DA_TELA.length} arquivos de `
      + `web/src — a cobrança da G3 se chama cobrança${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}
{
  const achados = TEXTO_DA_TELA.flatMap(([arq, frases]) =>
    frases.filter(([, t]) => ORIGINADOR.test(t)).map(([l, t]) => `${arq}:${l} «${t.trim().slice(0, 70)}»`));
  chk('T10', achados.length === 0,
      '«quem trouxe o cliente» em toda tela — nem «originador», nem «quem traz», nem «quem indicou»'
      + `${achados.length ? ` — ACHADO: ${achados.join(' · ')}` : ''}`);
}
{
  /* E OS DOIS NOMES CERTOS ESTÃO ONDE A CRÍTICA ACHOU OS ERRADOS — sem isto, T9
     e T10 passariam com as frases simplesmente apagadas. */
  const rel = ler('telas/relatorios.tsx');
  const ctr = ler('telas/contratos.tsx');
  chk('T10b', /titulo="Comissão por quem trouxe o cliente"/.test(rel) && /<th>Quem trouxe o cliente<\/th>/.test(rel)
          && /Cadastro de quem trouxe o cliente<\/h2>/.test(ctr) && /Cadastrar quem trouxe o cliente/.test(ctr),
      'Relatórios diz «Comissão por quem trouxe o cliente», e o cadastro em Contratos é «Cadastro de quem trouxe o cliente»');
  /* A TRILHA TAMBÉM: o Histórico mostra o nome da tabela e das colunas tocadas,
     e «originador» chegava à tela por ali — pela regra geral, que tira o `_id`. */
  chk('T10c', rotuloDaColuna('originador_id') === 'quem trouxe o cliente' && rotuloDaColuna('fatura_id') === 'cobrança'
          && rotuloDaTabela('fatura') === 'cobrança' && !/originador|fatura/.test(rotuloDaTabela('originador')),
      'no Histórico, a coluna e a tabela também dizem «quem trouxe o cliente» e «cobrança»');
  const mes = ler('vocabulario.ts');
  const travada = ler('emissao-travada.ts');
  chk('T9b', /Para gerar as cobranças de \$\{mes\}/.test(mes) && /cobranças emitidas/.test(travada)
          && /A cobrança foi emitida e o boleto ainda não foi pedido/.test(travada),
      'o Mês diz «Para gerar as cobranças de setembro», e Cobranças diz «cobranças emitidas ainda sem boleto»');
  const fu = ler('telas/fatura-unificada.tsx');
  chk('T9c', /'Descartar e começar outra conta'/.test(fu) && !/'Nova fatura'/.test(fu),
      '«Nova fatura» virou «Descartar e começar outra conta» — o botão diz o que faz: descarta a conta em edição');
}

console.log();
if (falhas > 0) { console.log(`--- vocabulario das telas: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- vocabulario das telas (jargao no texto exibido): ${feitas} verificacoes, 0 falhas`);
