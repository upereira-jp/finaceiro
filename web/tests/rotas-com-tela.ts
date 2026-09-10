// TODA ROTA DE ESCRITA TEM CAMINHO DE TELA — ou tem uma exceção com motivo.
// Uso: node --experimental-strip-types web/tests/rotas-com-tela.ts
//
// ============================================================================
// POR QUE ESTA SUITE EXISTE, e ela e a varredura de 10/09/2026 virando regra
//
// A varredura daquele dia cruzou as 122 rotas contra o que a SPA chama, e o que
// achou nao era teoria:
//
//   `POST /faturas/:id/boleto/baixar`     existia desde sempre, nenhuma tela
//                                         chamava. Sem ela, cancelar a fatura
//                                         deixava o titulo VIVO no banco - o
//                                         cliente ainda podia pagar, e a baixa
//                                         seria recusada. Dinheiro sem titulo;
//   `POST /contratos/:id/encerrar`        a propria tela mandava usa-lo por
//                                         escrito («trocar depois exige encerrar
//                                         e refazer») e nao o oferecia;
//   `POST /usinas`                        a leitura do outro sistema NAO cria
//                                         usina. Usina nova = todas as unidades
//                                         dela recusadas, e o unico caminho era
//                                         o terminal;
//   `PUT /faturas/:id/tarifas-…`          a aba de emissao avisava que havia
//                                         rascunho sem a tarifa da distribuidora
//                                         e o conserto nao existia na interface.
//
// Quatro furos da mesma familia, achados por uma varredura manual. Varredura
// manual acontece uma vez; esta suite acontece a cada push.
//
// ============================================================================
// O QUE ELA MEDE, e o limite esta declarado
//
// Ela procura o CAMINHO da rota no texto de `web/src`, com os parametros virando
// coringa. E uma aproximacao, e erra para o lado seguro nos dois sentidos:
//
//   falso NEGATIVO   uma tela pode montar a URL por pedacos (`${base}/${acao}`)
//                    e a rota parecer sem tela. Por isso existe a lista de
//                    excecoes, e por isso cada linha dela carrega o motivo;
//   falso POSITIVO   o caminho pode aparecer num comentario. `semComentario`
//                    corta antes de procurar - a mesma armadilha do `SD-12`.
//
// O que ela NAO mede: se o botao esta alcancavel, se a permissao deixa, se a
// tela e boa. Mede a unica coisa que a varredura mediu - existe alguma tela que
// cita esta rota - e essa e a fronteira entre "furo" e "detalhe".

import { readFileSync, readdirSync } from 'node:fs';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const semComentario = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* ==========================================================================
 * AS EXCECOES, e cada uma carrega o motivo de ser legitima.
 *
 * ⚠️ ACRESCENTAR UMA LINHA AQUI E UMA DECISAO, e nao um jeito de calar a suite:
 * o que se esta afirmando e "a operacao NAO precisa disto pela tela, e aqui esta
 * o porque". Uma linha sem motivo escrito nao passa na propria verificacao de
 * baixo (`RT-3`).
 * ========================================================================== */
const EXCECOES: Record<string, string> = {
  'POST /liquidacoes/webhook-sicoob/:tenant':
    'quem chama e o banco, nao a tela. E a unica rota com autenticacao de webhook.',

  'POST /faturamento/:competencia/ensaio':
    'a tela CHAMA, montando o caminho por pedaco (`${competencia}/${modo}`, com modo ensaio ou '
    + 'compor) - a busca por texto nao alcanca. Ver `telas/carteira.tsx`.',
  /* O IRMAO DA DE CIMA, e ele FALTAVA. Ate 10/09/2026 a busca nao ancorava o fim
   * do caminho, entao `POST /faturamento/:competencia/compor` casava com o texto
   * de `/faturamento/${...}/emitir` que existe em `telas/faturas.tsx` - passava
   * por PREFIXO, e nao por ter tela. Ancorado o fim, a falta apareceu. Mesmo
   * motivo, mesma tela, mesma linha de codigo: `${competencia}/${modo}`. */
  'POST /faturamento/:competencia/compor':
    'a tela CHAMA, montando o caminho por pedaco (`${competencia}/${modo}`, com modo ensaio ou '
    + 'compor) - a busca por texto nao alcanca. Ver `telas/carteira.tsx`.',

  'POST /carteira/marcar-vencidas':
    'o status `vencida` e registro do ATO, e a leitura do fato e a view '
    + '`posicao_da_carteira`, que calcula "vencidas em aberto" pela data. Nenhum numero de tela '
    + 'depende de alguem ter clicado - por isso nao ha clique.',

  'POST /liquidacoes/conciliacao':
    'conciliacao por extrato/OFX e o CAMINHO DE RESERVA do PRD 6. Os tres caminhos vivos - '
    + 'aviso do banco, conferencia diaria e baixa manual - tem tela. Enquanto o extrato nao for '
    + 'insumo de rotina, uma tela para ele seria manutencao de codigo que ninguem abre.',

  'POST /unidades-consumidoras/:id/suspender':
    'o ciclo de vida da unidade e do outro sistema: e a leitura automatica que desativa a '
    + 'unidade do lead arquivado. O que PARA a cobranca deste lado e encerrar o contrato, e isso '
    + 'tem tela desde 10/09/2026.',
  'POST /unidades-consumidoras/:id/reativar':
    'o inverso do suspender, e pelo mesmo motivo: quem devolve a unidade ao espelho ativo e a '
    + 'leitura automatica, quando o lead volta a valer do outro lado.',
  'POST /unidades-consumidoras/:id/cancelar':
    'cancelar a unidade e mais forte que parar de cobrar - e dizer que ela nao existe mais para '
    + 'este sistema. Quem manda nisso e o outro sistema, e o efeito na cobranca se obtem '
    + 'encerrando o contrato, que tem tela.',

  'POST /unidades-consumidoras/:id/renovar-contrato':
    'encerrar e criar, os dois passos que ela junta numa transacao, tem tela. A renovacao real '
    + 'esta a doze faturas cheias de distancia (nenhuma foi emitida ainda) - quando virar rotina, '
    + 'vira botao, e o ganho e nao deixar a unidade sem contrato entre os dois cliques.',

  'POST /usinas/:id/suspender':
    'usina que para de gerar e acontecimento raro, e o efeito na cobranca se obtem encerrando os '
    + 'contratos das unidades dela, que tem tela. Suspender a usina sem tocar nos contratos '
    + 'deixaria unidades apontando para uma usina parada - decisao que precisa de gente, e nao '
    + 'de um botao.',
  'POST /usinas/:id/encerrar':
    'encerrar a usina com unidades apontando para ela deixaria o rateio delas sem origem, e a '
    + 'ordem certa (encerrar os contratos, depois a usina) tem tela na primeira metade. O botao '
    + 'sozinho ofereceria o passo dois sem o passo um.',

  'PATCH /originadores/:id':
    'corrigir quem traz o cliente NAO conserta contrato nenhum: a aliquota fica congelada no '
    + 'rascunho do contrato (R20-b), entao o efeito seria so no cadastro. O caminho da tela e '
    + 'cadastrar o certo e usar nos contratos novos. ⚠️ Se um dia a operacao precisar renomear '
    + 'um originador existente, esta linha vira tela.',
  'DELETE /originadores/:id':
    'apagar quem ja aparece em contrato assinado apagaria a trilha de quem recebe comissao. O '
    + 'caminho seguro e parar de usa-lo, e ele nao precisa de botao.',

  'PUT /cobranca/chaves-pix/:id':
    'editar a chave existente muda para onde o dinheiro vai em documentos JA emitidos, sem deixar '
    + 'rastro de que mudou. O caminho da tela e cadastrar a chave certa e torna-la padrao - duas '
    + 'coisas que a aba de documento faz -, e a antiga fica no historico.',

  'POST /categorias':
    'categoria e centro de custo sao classificacao OPCIONAL de conta a pagar, e o lancamento '
    + 'manual nem os pede. Nenhum relatorio depende deles: o resumo agrupa por beneficiario. Se '
    + 'um dia depender, e esta linha que precisa cair.',
  'POST /centros-de-custo':
    'como a categoria: classificacao opcional que o lancamento manual nao pede e que nenhum '
    + 'relatorio le. Enquanto for assim, uma tela para ela seria um campo que ninguem preenche.',
};

// ============================================================================
// A VARREDURA
// ============================================================================

const raiz = new URL('../src/', import.meta.url);
const lerTudo = (dir: URL): string[] => {
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) saida.push(...lerTudo(new URL(`${e.name}/`, dir)));
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      saida.push(semComentario(readFileSync(new URL(e.name, dir), 'utf8')));
    }
  }
  return saida;
};
const web = lerTudo(raiz).join('\n');

const rotas = readFileSync(new URL('../../src/http/rotas.ts', import.meta.url), 'utf8');
const declaradas = [...rotas.matchAll(/metodo: '(GET|POST|PUT|PATCH|DELETE)', padrao: '([^']+)'/g)]
  .map((m) => ({ metodo: m[1]!, padrao: m[2]! }));

chk('RT-0', declaradas.length >= 100,
    `a tabela de rotas foi lida: ${declaradas.length} rotas - a suite nao esta medindo um arquivo vazio`);

const escritas = declaradas.filter((r) => r.metodo !== 'GET');

const temCaminho = (padrao: string): boolean => {
  /*
   * ⚠️ DUAS CORRECOES DE 10/09/2026, e as duas vieram de um FALSO POSITIVO real.
   *
   * A tela de Contratos ganhou `PUT /originadores/:id/vendedor-do-crm`, e a
   * suite passou a dizer que `PATCH /originadores/:id` e `DELETE
   * /originadores/:id` "ganharam tela" (RT-2). Nao ganharam: a string nova
   * apenas COMECA igual. Duas frouxidoes somadas produziam isso:
   *
   *   1. o coringa do parametro aceitava `/`, entao `:id` engolia
   *      `${o.id}/vendedor-do-crm` inteiro. Parametro e UM segmento de caminho;
   *   2. a busca nao ancorava o FIM, entao qualquer rota era prefixo de si
   *      mesma seguida de mais coisa.
   *
   * O terminador aceita o que de fato fecha uma URL no codigo: aspas, crase,
   * `?` de query string, ou o fim do texto. Sem ele, uma rota curta herdaria a
   * tela de toda rota longa que comece com ela - e o furo que esta suite existe
   * para achar passaria calado exatamente nas familias mais populosas.
   */
  const rx = padrao.replace(/^\//, '').split('/')
    .map((p) => (p.startsWith(':') ? '[^\'"`\\s/]*' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .map((p) => `/${p}`).join('');
  return new RegExp(`${rx}(?=['"\`?]|$)`).test(web);
};

const orfas = escritas
  .map((r) => `${r.metodo} ${r.padrao}`)
  .filter((chave) => {
    const [metodo, padrao] = chave.split(' ') as [string, string];
    return !temCaminho(padrao) && !(chave in EXCECOES);
  });

chk('RT-1', orfas.length === 0,
    `as ${escritas.length} rotas de ESCRITA tem caminho de tela ou excecao declarada`
    + `${orfas.length ? ` - SEM TELA E SEM MOTIVO: ${orfas.join(' · ')}` : ''}`
    + '. Uma rota de escrita sem tela e um ato que so acontece por fora do sistema, e foi assim '
    + 'que o cancelamento do boleto no banco passou seis semanas invisivel');

// ============================================================================
// RT-2 — a lista de excecoes nao pode envelhecer calada
// ============================================================================
//
// Uma excecao que PASSOU a ter tela continua na lista dizendo que nao tem, e a
// proxima pessoa lê ali um motivo que ja nao vale. Pior: a lista cresce e vira o
// lugar onde furo novo se esconde no meio de motivos velhos.

const excecoesQueGanharamTela = Object.keys(EXCECOES).filter((chave) => {
  const padrao = chave.split(' ')[1]!;
  return temCaminho(padrao);
});
chk('RT-2', excecoesQueGanharamTela.filter((c) => !/tela CHAMA/.test(EXCECOES[c] ?? '')).length === 0,
    'nenhuma excecao esta obsoleta - quando uma rota ganha tela, a linha dela sai da lista'
    + `${excecoesQueGanharamTela.length ? ` (ganharam tela: ${excecoesQueGanharamTela.join(', ')})` : ''}`);

// ============================================================================
// RT-3 — toda excecao carrega motivo, e motivo e frase e nao rotulo
// ============================================================================

const semMotivo = Object.entries(EXCECOES).filter(([, m]) => m.trim().length < 60);
chk('RT-3', semMotivo.length === 0,
    `as ${Object.keys(EXCECOES).length} excecoes tem motivo escrito`
    + `${semMotivo.length ? ` - CURTOS DEMAIS: ${semMotivo.map(([k]) => k).join(', ')}` : ''}`
    + ' - "nao precisa" nao e motivo; o que se escreve aqui e o que a proxima pessoa vai usar '
    + 'para decidir se ainda vale');

const orfasDaLista = Object.keys(EXCECOES).filter((chave) => {
  const [metodo, padrao] = chave.split(' ') as [string, string];
  return !declaradas.some((r) => r.metodo === metodo && r.padrao === padrao);
});
chk('RT-4', orfasDaLista.length === 0,
    `nenhuma excecao aponta para rota que nao existe mais${orfasDaLista.length ? ` - ORFAS: ${orfasDaLista.join(', ')}` : ''}`
    + ' - a rota some, a excecao fica, e a lista passa a documentar um sistema que nao e este');

console.log(`\n${falhas === 0 ? `rotas com tela: ${feitas} verificacoes, 0 falhas`
                              : `rotas com tela: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
