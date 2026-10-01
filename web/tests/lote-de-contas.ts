// A FILA DO LOTE DE CONTAS. Puras, sem banco e sem DOM.
// Uso: node --experimental-strip-types web/tests/lote-de-contas.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e por que o custo de perde-las e alto.
//
// `registrar()` no servidor e um `upsert` pela chave (UC, competencia). Isso
// significa que uma linha com a competencia lida errada NAO levanta erro: ela
// grava no MES ERRADO e sobrescreve, em silencio, a conta que ja estava certa
// ali. Num lote de 29, uma regra de tela que se perde numa refatoracao vira 29
// gravacoes erradas de uma vez — e a economia acumulada impressa na folha do
// cliente sai do que ficou gravado.
//
// Por isso as regras de "esta linha pode ser registrada?" moram fora do `.tsx`:
// o runner do `web/` nao le JSX, e o que nao pode ser verificado nao e regra
// (regra 8).

import { readFileSync } from 'node:fs';
import {
  recusaDoArquivo, normalizarUc, competenciaDoItem, chaveDoItem,
  pendenciaDoItem, avisoDoItem, chavesRepetidas, podeRegistrar,
  resumoDoLote, ordemDaFila, corrigirItem, vizinhosNaFila, TETO_DO_ARQUIVO, LEITURAS_SIMULTANEAS,
  type ItemDoLote,
} from '../src/lote-de-contas.ts';
import {
  mesesDaLista, filtrarRegistradas, selecaoParaGerar, somaEmCentavos,
  economiaAcumulada, resumoDaRodada, podeGerar, rotuloDoMes, mesCurto, listaParcial,
  ordemDasRegistradas, LIMITE_DA_LISTA,
} from '../src/registradas-regras.ts';
import { CAMPOS_DA_FATURA_VAZIOS, type RegistroDeFatura } from '../src/api.ts';
import { candidatosDoMes, mesSemTrabalho } from '../src/emissao-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const UCS = new Set(['000091584701207', '000091670201219', '000307301401201']);
const VAZIO = new Set<string>();

/** Uma linha lida, com o que a Equatorial de fato imprime. */
const lido = (over: Partial<ItemDoLote> & { uc?: string; mes?: string; total?: string } = {}): ItemDoLote => ({
  id: over.id ?? 'i1',
  nome: over.nome ?? 'conta.pdf',
  tamanho: over.tamanho ?? 120_000,
  estado: over.estado ?? 'lido',
  erro: over.erro ?? null,
  campos: over.campos !== undefined ? over.campos : {
    ...CAMPOS_DA_FATURA_VAZIOS,
    unidade_consumidora: over.uc ?? '000091584701207',
    mes_referencia: over.mes ?? 'MAI/2026',
    valor_total_equatorial: over.total ?? '412.80',
  },
});

// -------------------------------------------- L1 a competencia REAL da Equatorial
{
  // O caso que fechava a porta: o papel diz MAI/2026, e ate 08/09/2026 o caminho
  // oficial so aceitava 05/2026.
  chk('L1a', competenciaDoItem(lido({ mes: 'MAI/2026' })) === '05/2026',
      'MAI/2026 — o formato IMPRESSO — vira 05/2026 na fila');
  chk('L1b', competenciaDoItem(lido({ mes: '05/2026' })) === '05/2026', '05/2026 continua valendo');
  chk('L1c', competenciaDoItem(lido({ mes: '2026-05' })) === '05/2026', '2026-05 continua valendo');
  chk('L1d', competenciaDoItem(lido({ mes: 'bagunça' })) === '', 'o que nao e mes nao vira mes');
  chk('L1e', pendenciaDoItem(lido({ mes: 'MAI/2026' }), UCS) === null,
      'e por isso a linha com MAI/2026 pode registrar — antes ela nao podia');
}

// ------------------------------------------------------- L2 a UC do papel
{
  chk('L2a', normalizarUc('91584701207') === '000091584701207',
      'a UC curta recebe os zeros a esquerda que a Equatorial imprime');
  chk('L2b', normalizarUc('000091584701207') === '000091584701207', 'a UC completa passa intacta');
  chk('L2c', normalizarUc('UC 000091584701207 ') === '000091584701207', 'texto em volta e descartado');
  chk('L2d', normalizarUc('') === '' && normalizarUc(null) === '', 'ausente e vazio, e nao "000000000000000"');
  chk('L2e', normalizarUc('1234567890123456') === '1234567890123456',
      'mais de 15 digitos NAO e truncado nem completado — e outro numero, e a tela mostra qual');
}

// ------------------------------------ L3 o que impede registrar, na ordem do servidor
{
  chk('L3a', pendenciaDoItem(lido({ uc: '' }), UCS)?.includes('unidade consumidora') === true,
      'sem UC a linha nao registra — e a recusa nomeia o campo (UcIlegivel no servidor)');
  chk('L3b', pendenciaDoItem(lido({ mes: '' }), UCS)?.includes('mês') === true,
      'sem competencia a linha nao registra (CompetenciaIlegivel no servidor)');
  chk('L3c', pendenciaDoItem(lido({ estado: 'na_fila' }), UCS) !== null,
      'quem ainda nao foi lida nao registra');
  chk('L3d', pendenciaDoItem(lido({ estado: 'falhou', erro: 'tempo esgotado' }), UCS) === 'tempo esgotado',
      'a linha que falhou mostra o motivo da falha, e nao uma frase generica');
  chk('L3e', pendenciaDoItem(lido({ estado: 'registrado' }), UCS) === null,
      'a linha ja registrada nao tem pendencia');

  // A UC fora do cadastro AVISA e nao bloqueia — a mesma decisao que o servidor
  // ja tomou em `registrar()`, que aceita `unidade_consumidora_id` nulo.
  const fora = lido({ uc: '000999999999999' });
  chk('L3f', pendenciaDoItem(fora, UCS) === null, 'UC fora do cadastro NAO bloqueia o registro');
  chk('L3g', avisoDoItem(fora, UCS)?.includes('não está no cadastro') === true,
      'mas ela AVISA, dizendo que a conta nao vira fatura enquanto a unidade nao existir');
  chk('L3h', avisoDoItem(lido(), UCS) === null, 'UC do cadastro nao gera aviso nenhum');
  chk('L3i', avisoDoItem(lido({ uc: '000999999999999' }), VAZIO) === null,
      'sem cadastro carregado a tela NAO acusa UC desconhecida — seria acusar o proprio desconhecimento');
}

// ----------------------------------------- L4 a duplicata dentro do MESMO lote
{
  // Dois arquivos da mesma UC no mesmo mes: registrar os dois faz o segundo
  // sobrescrever o primeiro, sem erro. E o modo de falha do `upsert`.
  const a = lido({ id: 'a' });
  const b = lido({ id: 'b', nome: 'conta (1).pdf' });
  const rep = chavesRepetidas([a, b]);
  chk('L4a', rep.has('000091584701207|05/2026'), 'a chave repetida e detectada');
  chk('L4b', pendenciaDoItem(a, UCS, rep)?.includes('MESMA unidade') === true,
      'as DUAS linhas ficam bloqueadas — nao se escolhe uma sozinha por ordem de chegada');
  chk('L4c', pendenciaDoItem(b, UCS, rep) !== null, 'a segunda tambem');

  // Meses diferentes da mesma UC nao sao duplicata: e o caso normal de quem
  // sobe atrasados.
  const outroMes = lido({ id: 'c', mes: 'JUN/2026' });
  chk('L4d', chavesRepetidas([a, outroMes]).size === 0,
      'a mesma UC em meses diferentes NAO e duplicata');

  // A ja registrada sai da contagem: reenviar a mesma conta para corrigir e o
  // caminho normal do `upsert`, e bloquear isso impediria a correcao.
  chk('L4e', chavesRepetidas([{ ...a, estado: 'registrado' }, b]).size === 0,
      'a linha ja registrada nao torna a nova uma duplicata — corrigir e permitido');

  // ACHADO POR ESTA SUITE, em 08/09/2026: uma linha que ainda NAO PODE ser
  // registrada nao pode impedir outra de ser. A primeira versao contava todas as
  // que nao estivessem registradas, e a fila acusava duplicata contra um arquivo
  // que o modelo nem tinha aberto — travando as duas.
  for (const estado of ['na_fila', 'lendo', 'falhou'] as const) {
    chk('L4f', chavesRepetidas([a, { ...b, estado }]).size === 0,
        `linha em "${estado}" nao cria duplicata: quem nao pode registrar nao bloqueia quem pode`);
  }
  chk('L4g', chavesRepetidas([a, { ...b, estado: 'registrando' }]).size === 1,
      'mas a que ja esta INDO para o banco conta — as duas gravariam na mesma chave');
}

// -------------------------------------------------- L5 o zero, que nao e ausente
{
  chk('L5a', avisoDoItem(lido({ total: '0' }), UCS)?.includes('R$\u00a00,00') === true,
      'a conta que fecha em zero AVISA (a do Fernando Albino, medida em 08/09)');
  chk('L5b', pendenciaDoItem(lido({ total: '0' }), UCS) === null,
      'e nao bloqueia: emitir fatura de valor zero e decisao da operacao, nao da tela');
  chk('L5c', avisoDoItem(lido({ total: '412,80' }), UCS) === null,
      '1.234,56 com virgula nao e confundido com zero');
  chk('L5d', avisoDoItem(lido({ total: '1.234,56' }), UCS) === null,
      'o separador de milhar tambem nao — foi assim que a conferencia de valor sumiu em 14/08');
}

// ------------------------------------------------ L6 a recusa antes de subir
{
  chk('L6a', recusaDoArquivo({ nome: 'c.pdf', tamanho: 0, tipo: 'application/pdf' })?.includes('vazio') === true,
      'arquivo de 0 bytes e recusado antes da subida');
  chk('L6b', recusaDoArquivo({ nome: 'c.pdf', tamanho: TETO_DO_ARQUIVO + 1, tipo: 'application/pdf' })
        ?.includes('MB') === true,
      'acima do teto e recusado com o TAMANHO na frase, e nao "erro ao enviar"');
  chk('L6c', recusaDoArquivo({ nome: 'c.pdf', tamanho: 500_000, tipo: 'application/pdf' }) === null,
      'um PDF de 500 KB passa');
  chk('L6d', recusaDoArquivo({ nome: 'foto.jpg', tamanho: 500_000, tipo: 'image/jpeg' }) === null,
      'foto da conta passa — e como varias chegam');
  chk('L6e', recusaDoArquivo({ nome: 'planilha.xlsx', tamanho: 5_000, tipo: 'application/vnd.ms-excel' }) !== null,
      'planilha e recusada pelo nome, sem gastar a subida');
  chk('L6f', recusaDoArquivo({ nome: 'c.pdf', tamanho: 5_000, tipo: '' }) === null,
      'o navegador nem sempre da o tipo: o .pdf no nome basta, e quem decide de verdade sao os BYTES no servidor');
}

// ------------------------------------------------ L7 o resumo que a tela mostra
{
  const fila: ItemDoLote[] = [
    lido({ id: '1' }),
    lido({ id: '2', uc: '000091670201219', mes: 'JUN/2026' }),
    lido({ id: '3', uc: '', mes: 'MAI/2026' }),
    lido({ id: '4', estado: 'na_fila', campos: null }),
    lido({ id: '5', uc: '000307301401201', estado: 'registrado' }),
  ];
  const r = resumoDoLote(fila, UCS);
  chk('L7a', r.total === 5, 'o total conta todas as linhas');
  chk('L7b', r.prontos === 2, `dois prontos (achou ${r.prontos})`);
  chk('L7c', r.comPendencia === 1, `um com pendencia — o sem UC (achou ${r.comPendencia})`);
  chk('L7d', r.lendo === 1, `um ainda na fila (achou ${r.lendo})`);
  chk('L7e', r.registrados === 1, `um registrado (achou ${r.registrados})`);
  chk('L7f', r.prontos + r.comPendencia + r.lendo + r.registrados === r.total,
      'os quatro grupos somam o total: nenhuma linha fica invisivel na contagem');
}

// ------------------------------------- L8 a ordem: o trabalho primeiro, sempre
{
  const fila: ItemDoLote[] = [
    lido({ id: 'pronto' }),
    lido({ id: 'registrado', uc: '000307301401201', estado: 'registrado' }),
    lido({ id: 'pendente', uc: '' }),
    lido({ id: 'lendo', uc: '000091670201219', estado: 'lendo' }),
  ];
  const ids = ordemDaFila(fila, UCS).map((i) => i.id);
  chk('L8a', ids[0] === 'pendente',
      `a linha que precisa de gente vem primeiro (ordem: ${ids.join(' ')})`);
  chk('L8b', ids[ids.length - 1] === 'registrado', 'a ja registrada vai para o fim');
  chk('L8c', ordemDaFila(fila, UCS).length === fila.length, 'ordenar nao perde nem duplica linha');

  // A ordem dentro do grupo e a de chegada: a fila nao pode dancar embaixo da
  // mao de quem esta conferindo.
  const tres = [lido({ id: 'a', uc: '' }), lido({ id: 'b', uc: '' }), lido({ id: 'c', uc: '' })];
  chk('L8d', ordemDaFila(tres, UCS).map((i) => i.id).join('') === 'abc',
      'dentro do grupo, a ordem de chegada e preservada');
}

// ------------------------- L9 O ESPELHO DO TETO: medido no arquivo do servidor
{
  // O teto vive em `src/http/rotas.ts` e nao pode ser importado daqui (arrasta
  // banco e sessao para o bundle do browser). Entao esta verificacao LE o
  // arquivo e compara os numeros — o espelho nao pode divergir em silencio.
  const fonte = readFileSync(new URL('../../src/http/rotas.ts', import.meta.url), 'utf8');
  const m = /export const TETO_DO_ARQUIVO = (\d+) \* 1024 \* 1024;/.exec(fonte);
  chk('L9a', m !== null, 'o teto continua declarado em src/http/rotas.ts na forma que esta verificacao le');
  chk('L9b', m !== null && Number(m[1]) * 1024 * 1024 === TETO_DO_ARQUIVO,
      `o teto do browser (${TETO_DO_ARQUIVO / 1024 / 1024} MB) e o do servidor (${m ? m[1] : '?'} MB) sao o MESMO numero`);
  chk('L9c', LEITURAS_SIMULTANEAS >= 1 && LEITURAS_SIMULTANEAS <= 6,
      'a concorrencia cabe no limite de conexoes por origem do navegador');
}

// ------------------ L10 a correcao feita na gaveta volta para a linha da fila
{
  // O beco que isto fecha: a conta chega sem a unidade, a pessoa digita o numero
  // na gaveta — e ate 30/09 a linha da fila continuava dizendo «Corrigir».
  const semUc = lido({ id: 'x', uc: '' });
  chk('L10a', pendenciaDoItem(semUc, UCS) !== null, 'a linha sem unidade comeca com pendencia');
  const corrigida = corrigirItem(semUc, { ...semUc.campos!, unidade_consumidora: '91584701207' });
  chk('L10b', pendenciaDoItem(corrigida, UCS) === null && podeRegistrar(corrigida, UCS, new Set()),
      'digitada a unidade na gaveta, a linha se resolve e o «Registrar N» passa a conta-la');

  chk('L10c', corrigirItem(semUc, semUc.campos!) === semUc,
      'abrir a gaveta copia os campos SEM mexer: a mesma referencia nao conta como correcao');

  const recusada = { ...lido({ id: 'r' }), estado: 'falhou' as const, erro: 'O servidor recusou.' };
  const mexida = corrigirItem(recusada, { ...recusada.campos!, vencimento: '10/06/2026' });
  chk('L10d', mexida.estado === 'lido' && mexida.erro === null,
      'a linha que o servidor recusou volta a «lido» quando alguem a corrige — e o jeito de tentar de novo');

  const gravada = lido({ id: 'g', estado: 'registrado' });
  chk('L10e', corrigirItem(gravada, { ...gravada.campos!, valor_total_equatorial: '99,00' }).estado === 'lido',
      'a ja registrada que e editada volta a «lido»: o que esta na tela deixou de ser o que esta gravado');

  const lendo: ItemDoLote = { ...lido({ id: 'l' }), estado: 'lendo', campos: null };
  chk('L10f', corrigirItem(lendo, CAMPOS_DA_FATURA_VAZIOS) === lendo,
      'a linha que ainda esta lendo nao recebe campos de fora — a leitura paga e quem os traz');
}

// ------------------------- L11 «Anterior» e «Proxima» andam pelo que falta
{
  const fila = [
    lido({ id: 'ok1' }),
    lido({ id: 'pend', uc: '' }),
    lido({ id: 'ok2', uc: '000091670201219' }),
    lido({ id: 'feita', uc: '000307301401201', estado: 'registrado' }),
    { ...lido({ id: 'lendo' }), estado: 'lendo' as const, campos: null },
  ];
  // Ordem da tabela: pendencia primeiro, depois as conferidas, a registrada no fim.
  const v = vizinhosNaFila(fila, UCS, 'ok1');
  chk('L11a', v.total === 3 && v.posicao === 2 && v.anterior === 'pend' && v.proxima === 'ok2',
      `anda na ordem da tabela e so pelo que espera registro (${JSON.stringify(v)})`);
  const depois = vizinhosNaFila(fila, UCS, 'feita');
  chk('L11b', depois.posicao === null && depois.proxima === 'pend',
      'quem acabou de ser registrada sai da conta, e «Proxima» leva a primeira que falta');
  chk('L11c', vizinhosNaFila(fila, UCS, 'ok2').proxima === null,
      'na ultima, nao ha proxima — o botao desliga em vez de dar a volta');
  chk('L11d', vizinhosNaFila([], UCS, null).total === 0, 'fila vazia, nada a andar');
}

// ============================================================================
// AS CONTAS REGISTRADAS (`registradas-regras.ts`) — 30/09/2026
// ============================================================================

const reg = (over: Partial<RegistroDeFatura> & { id: string }): RegistroDeFatura => ({
  numero_uc: '000091584701207', competencia: '2026-09-01', cliente_nome: 'Cliente',
  vencimento: '2026-10-10', compensada_kwh: '100', tarifa_kwh: '0.95',
  desconto_centavos: 1000, total_centavos: 10000, fatura_id: null, cobranca_disponivel: true,
  criado_em: '2026-09-30T12:00:00.000Z', atualizado_em: '2026-09-30T12:00:00.000Z',
  ...over,
});

// ----------------------------------------- L12 a lista abre no mes que tem trabalho
/* [01/10/2026, etapa 8] `mesPadrao` SAIU: a lista de registradas mostra o MES
 * DE TRABALHO da casca, e o criterio dela — o mais recente com conta por gerar,
 * senao o mais recente — virou parte da procura do trabalho, a mesma de Mes e
 * Cobrancas. As afirmacoes ficam, contra a fonte unica: a conta por gerar e
 * trabalho CERTO (`candidatosDoMes`), e sem trabalho vale o mais recente com
 * conta (`mesSemTrabalho`, origem `recente`). */
const mesDaLista = (l: readonly RegistroDeFatura[]): string | null =>
  candidatosDoMes([], [], l).find((c) => c.certo)?.mes ?? null;
{
  const lista = [
    reg({ id: 's1', competencia: '2026-09-01T00:00:00.000Z', fatura_id: 'f1' }),
    reg({ id: 's2', competencia: '2026-09-01', fatura_id: 'f2' }),
    reg({ id: 'a1', competencia: '2026-08-01', fatura_id: null }),
    reg({ id: 'j1', competencia: '2026-07-01', fatura_id: 'f3' }),
  ];
  chk('L12a', mesDaLista(lista) === '2026-08',
      'setembro esta todo cobrado e agosto tem uma esperando: o trabalho esta em AGOSTO, e nao no mais recente');
  const cobradas = lista.map((r) => ({ ...r, fatura_id: 'x' }));
  chk('L12b', mesDaLista(cobradas) === null
          && JSON.stringify(mesSemTrabalho(null, [], '2026-10', cobradas)) === JSON.stringify({ mes: '2026-09', origem: 'recente' }),
      'sem nada por cobrar, nao ha trabalho, e o mes e o mais recente com conta — a confirmacao do que foi feito');
  chk('L12c', mesDaLista([]) === null && mesSemTrabalho(null, [], '2026-10', []).origem === 'hoje',
      'lista vazia nao inventa mes de trabalho: sem conta nem cobranca, o mes e o de hoje, e diz que e');
  chk('L12d', mesesDaLista(lista).join(',') === '2026-09,2026-08,2026-07',
      'os meses saem do mais novo para o mais velho, sem repetir — mesmo com horario no JSON');
  const semLigacao = lista.map((r) => ({ ...r, fatura_id: null, cobranca_disponivel: false }));
  chk('L12e', mesDaLista(semLigacao) === null && mesSemTrabalho(null, [], '2026-10', semLigacao).mes === '2026-09',
      'num banco que ainda nao cobra conta lida, nada «tem trabalho»: vale o mais recente');
  chk('L12f', rotuloDoMes('2026-09') === 'setembro de 2026' && mesCurto('2026-09') === '09/2026',
      'o mes se le por extenso no titulo e curto na linha');
}

// ----------------------------------- L13 o filtro e explicito, e a unidade tambem
{
  const lista = [
    reg({ id: 'a', competencia: '2026-09-01', numero_uc: '91584701207' }),
    reg({ id: 'b', competencia: '2026-09-01', numero_uc: '000091670201219', fatura_id: 'f' }),
    reg({ id: 'c', competencia: '2026-08-01', numero_uc: '000091584701207' }),
  ];
  const f = (o: Partial<Parameters<typeof filtrarRegistradas>[1]>) =>
    filtrarRegistradas(lista, { mes: null, soSemCobranca: false, unidade: null, ...o }).map((r) => r.id).join('');
  chk('L13a', f({ mes: '2026-09' }) === 'ab', 'o mes filtra pelo mes da conta');
  chk('L13b', f({ mes: '2026-09', soSemCobranca: true }) === 'a', '«Só sem cobrança» tira a que ja virou cobranca');
  chk('L13c', f({ unidade: '000091584701207' }) === 'ac',
      'a unidade casa com ou sem os zeros da Equatorial, e atravessa os meses');
  chk('L13d', f({}) === 'abc', 'sem filtro nenhum, a lista inteira');
  const misturada = [
    reg({ id: 'g1', fatura_id: 'f1' }), reg({ id: 's1' }), reg({ id: 'g2', fatura_id: 'f2' }),
    reg({ id: 'x1', cobranca_disponivel: false }), reg({ id: 's2' }),
  ];
  chk('L13e', ordemDasRegistradas(misturada).map((r) => r.id).join(' ') === 's1 s2 x1 g1 g2',
      'o trabalho no topo: as que podem virar cobranca primeiro, as ja cobradas no fim, e a ordem de chegada dentro de cada grupo');
}

// ------------------------- L14 a selecao do «Gerar N» e o que ela soma
{
  const visiveis = [
    reg({ id: 'a', total_centavos: 12345 }),
    reg({ id: 'b', total_centavos: 100 }),
    reg({ id: 'c', total_centavos: 999, fatura_id: 'f' }),
    reg({ id: 'd', total_centavos: 1, cobranca_disponivel: false }),
  ];
  const todas = selecaoParaGerar(visiveis, new Set());
  chk('L14a', todas.map((r) => r.id).join('') === 'ab',
      'todas as que podem gerar comecam marcadas — a que ja virou cobranca e a do banco que nao sabe cobrar ficam fora');
  chk('L14b', selecaoParaGerar(visiveis, new Set(['a'])).map((r) => r.id).join('') === 'b',
      'desmarcar tira da rodada');
  chk('L14c', selecaoParaGerar(visiveis, new Set(['c'])).length === 2,
      'uma desmarcada que ja virou cobranca nao muda nada — a selecao pelo avesso nao precisa de poda');
  chk('L14d', somaEmCentavos(todas) === 12445 && Number.isInteger(somaEmCentavos(todas)),
      'a soma da revisao e inteiro em centavos (regra 1)');
  chk('L14e', !podeGerar(visiveis[2]!) && !podeGerar(visiveis[3]!) && podeGerar(visiveis[0]!),
      'pode gerar = sem cobranca E banco que sabe cobrar');
}

// ------------------------------------ L15 a economia e o placar da rodada
{
  const serie = [reg({ id: 'a', desconto_centavos: 5000 }), reg({ id: 'b', desconto_centavos: 1595 })];
  const e = economiaAcumulada(serie);
  chk('L15a', e.centavos === 6595 && e.faturas === 2, 'a economia acumulada soma os descontos da serie');
  const r = resumoDaRodada({
    a: { estado: 'gerada' }, b: { estado: 'recusada', motivo: 'sem contrato' },
    c: { estado: 'gerando' }, d: { estado: 'na_vez' },
  });
  chk('L15b', r.total === 4 && r.geradas === 1 && r.recusadas === 1 && r.faltam === 2,
      `o placar conta geradas, recusadas e as que faltam (${JSON.stringify(r)})`);
  chk('L15c', LIMITE_DA_LISTA <= 500 && !listaParcial([reg({ id: 'x' })])
          && listaParcial(Array.from({ length: LIMITE_DA_LISTA }, (_, i) => reg({ id: `p${i}` }))),
      'a lista pede no maximo o que o servidor aceita, e diz quando bateu no teto');
}

console.log(falhas === 0 ? '\nEXIT=0' : `\nFALHAS: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
