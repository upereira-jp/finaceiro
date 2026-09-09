// A FAIXA DO CAMINHO DO DINHEIRO, na primeira tela. Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/saude-do-dinheiro.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e o defeito e de OMISSAO, nao de calculo.
//
// Ate 09/09/2026 os dois alertas da agenda - o certificado A1 e o aviso de
// pagamento - chegavam a dois lugares, e nenhum dos dois procura ninguem: o
// journal do systemd e a tela de **Cobranca**. A de Cobranca e a pior das duas
// para isso: e a tela de CONFIGURAR o banco, aberta uma vez por trimestre. O
// alerta morava na tela que ninguem abre.
//
// AS TRES COISAS QUE PODEM DAR ERRADO AQUI, e as tres ja deram em outras telas
// deste projeto:
//
//   1. o alerta some quando esta tudo bem E TAMBEM quando ninguem perguntou.
//      E o `nao_medido` da prontidao e o `sem_certificado` do A1: ausencia de
//      leitura nao e ausencia de problema;
//   2. o alerta aparece para sempre numa instalacao que nunca ligou banco -
//      vermelho permanente e alarme desligado (`deploy/README`);
//   3. o texto fala de integracao e nao de operacao, e quem le entra em panico
//      achando que o dinheiro sumiu. Sem a frase do atraso, "o banco desligou o
//      aviso" parece perda de dinheiro.

import { readFileSync } from 'node:fs';
import { faixasDaSaude, type NivelDoAviso } from '../src/saude-do-dinheiro.ts';
import type { EstadoDoCertificado } from '../src/cobranca-regras.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const f = (certificado: EstadoDoCertificado, aviso: NivelDoAviso | null) =>
  faixasDaSaude({ certificado, aviso });

console.log('\n-- a saude do caminho do dinheiro, na tela --');

chk('SD-1', f('ok', 'ativo').length === 0,
    'com tudo de pe a faixa nao existe - vazio E a resposta, e a tela nao ganha um verde a mais '
    + 'para conferir todo dia');

chk('SD-2', f('sem_conector', null).length === 0,
    'sem conector de cobranca NAO ha faixa nenhuma: nao ha banco ligado, entao nao ha caminho do '
    + 'dinheiro sobre o qual alarmar. E a mesma razao do codigo de saida 3 no systemd - vermelho '
    + 'permanente e alarme desligado');

chk('SD-3', f('ok', null).length === 0,
    'enquanto a leitura nao volta tambem nao ha faixa - uma faixa que pisca vermelho durante o '
    + 'carregamento e ruido');

// ------------------------------------------------- os dois tons, e a fronteira
chk('SD-4', f('ok', 'inativado')[0]?.tom === 'erro' && f('ok', 'ausente')[0]?.tom === 'erro',
    '`inativado` e `ausente` sao ERRO: ha uma acao a tomar');

chk('SD-5', f('ok', 'nao_verificavel')[0]?.tom === 'alerta' && f('nao_medido', 'ativo')[0]?.tom === 'alerta',
    'e "ninguem perguntou" e ALERTA e nao erro - a mesma fronteira que separa `inativado` de '
    + '`nao_verificavel` no servidor: "esta quebrado" nao e "ninguem sabe"');

chk('SD-6', f('nao_medido', 'ativo').length === 1,
    'A1 sem data cadastrada gera faixa - nao ter medido nao autoriza a tela a dizer que esta bem, '
    + 'e essa e a licao que a prontidao ja tinha aprendido com o `nao_medido`');

// --------------------------------------- SD-7 as duas metades sao independentes
chk('SD-7', f('vencido', 'inativado').length === 2,
    'A1 vencido e aviso desligado dao DUAS faixas, e nao uma: sao dois consertos diferentes, com '
    + 'dois donos diferentes, e colapsar os dois esconderia um deles');

// ------------------------------- SD-8 a frase que impede o panico
{
  const corpo = f('ok', 'inativado')[0]?.corpo ?? '';
  chk('SD-8', /dinheiro n[aã]o se perde/i.test(corpo) && /atraso/i.test(corpo),
      'a faixa do aviso desligado DIZ que o dinheiro nao se perde e que o que muda e o atraso - '
      + 'sem essa frase o alerta parece perda de dinheiro e vira panico');
}

// ------------------------------- SD-9 texto de operacao, nao de integracao
{
  const jargao = /webhook|endpoint|mTLS|token|payload|API|HTTP|404|412/i;
  const sujos = faixasDaSaude({ certificado: 'vencido', aviso: 'inativado' })
    .concat(faixasDaSaude({ certificado: 'nao_medido', aviso: 'ausente' }))
    .concat(faixasDaSaude({ certificado: 'vence_em_breve', aviso: 'nao_verificavel' }))
    .filter((x) => jargao.test(`${x.titulo} ${x.corpo}`))
    .map((x) => x.titulo);
  chk('SD-9', sujos.length === 0,
      'nenhuma faixa usa jargao de integracao - quem le nao sabe o que e webhook e nao precisa '
      + `saber; precisa saber que boleto pago vai demorar mais${sujos.length ? ` (sujas: ${sujos.join(' | ')})` : ''}`);
}

// ------------------------- SD-10 a exaustao: todo estado ruim gera exatamente uma
{
  const certs: EstadoDoCertificado[] = ['ok', 'sem_conector', 'nao_medido', 'vencido', 'vence_em_breve'];
  const avisos: (NivelDoAviso | null)[] = ['ativo', 'inativado', 'ausente', 'nao_verificavel', null];
  let mudos = 0, semTitulo = 0;
  for (const c of certs) {
    for (const a of avisos) {
      const r = f(c, a);
      const esperadas = (c === 'ok' || c === 'sem_conector' ? 0 : 1)
                      + (a === 'ativo' || a === null ? 0 : 1);
      /* `sem_conector` zera as duas metades na TELA, e nao so a do A1: quem nao
       * tem banco nao recebe leitura de aviso nenhuma - ver `SaudeDoDinheiro`
       * em `prontidao.tsx`, que passa `aviso: null` nesse caso. Aqui o par
       * ('sem_conector', <algo>) nao acontece na vida real, entao a contagem
       * esperada dele e so a do aviso. */
      if (r.length !== esperadas) mudos++;
      if (r.some((x) => !x.titulo.trim() || !x.corpo.trim())) semTitulo++;
    }
  }
  chk('SD-10', mudos === 0 && semTitulo === 0,
      `os 25 pares dao a contagem esperada de faixas (${mudos} fora) e nenhuma faixa sai sem `
      + `titulo ou sem corpo (${semTitulo})`);
}

// ------------------- SD-11 toda faixa aponta uma tela, porque recusa e ponteiro
{
  const todas = certs2().flatMap((c) => avisos2().map((a) => f(c, a))).flat();
  chk('SD-11', todas.length > 0 && todas.every((x) => x.destino !== null && x.destino.endereco.startsWith('/')),
      'toda faixa aponta uma tela onde se resolve - "recusa e ponteiro, nao beco" e a regra que a '
      + 'coluna «Onde resolver» da prontidao ja segue');
}
function certs2(): EstadoDoCertificado[] { return ['nao_medido', 'vencido', 'vence_em_breve']; }
function avisos2(): NivelDoAviso[] { return ['inativado', 'ausente', 'nao_verificavel']; }

// ------------------- SD-12 e SD-13 a ULTIMA ligacao: a PRIMEIRA tela monta a faixa
{
  /* AS DUAS PONTAS JA ESTAVAM PROVADAS E A DO MEIO NAO. `SD-*` prova as regras;
   * `R12*` prova que `CorpoDaSaude` desenha. Nada provava que a TELA o chama —
   * e apagar `<CorpoDaSaude />` de `prontidao.tsx` passaria nas duas suites e no
   * `tsc`, com o sintoma sendo faixa nenhuma. Que e o mesmo sintoma de estar
   * tudo bem.
   *
   * E le fonte porque a tela NAO e montavel: ela chama `useDados`, e
   * `renderToStaticMarkup` nao roda efeito. Confere-se por mutacao. */
  const fonte = readFileSync(new URL('../src/telas/prontidao.tsx', import.meta.url), 'utf8');

  /* ⚠️ COMENTARIO SAI ANTES DE PROCURAR, e a primeira versao destas duas linhas
   * NAO fazia isso — foi conferir por mutacao que mostrou. Comentar
   * `{/* <SaudeDoDinheiro /> *\/}` apaga a faixa da tela e DEIXA o texto no
   * arquivo, entao as duas passavam verdes sobre uma tela que nao mostra nada.
   * Verificacao que le fonte mede o que RODA, nunca o que esta escrito — e este
   * e o segundo lugar do mesmo dia onde essa armadilha apareceu (ver `CI-1` em
   * `tests/ci-apt.ts`). */
  const tela = fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // {/* JSX */}
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // /* bloco */
    .replace(/^\s*\/\/.*$/gm, ' ');          // // linha

  const importa = /import \{ CorpoDaSaude \} from '\.\.\/saude-corpo\.tsx'/.test(tela);
  const monta = /<CorpoDaSaude\b/.test(tela);
  chk('SD-12', importa && monta,
      'a tela de Pendencias — a PRIMEIRA da barra — importa e MONTA `CorpoDaSaude`. Sem esta '
      + 'linha, apagar a faixa da tela passaria em todas as outras verificacoes, e o sintoma '
      + 'seria silencio');

  /* ACIMA DA TABELA, e nao e estetica: as camadas dizem o que falta para FATURAR
   * este mes; a faixa diz se o que ja foi faturado consegue ser cobrado e
   * baixado. Um mes inteiro de camadas fechadas nao vale nada com o caminho do
   * dinheiro quebrado, e quem le de cima para baixo tem de encontrar a pergunta
   * mais alta primeiro. */
  const iFaixa = tela.indexOf('<SaudeDoDinheiro />');
  const iTabela = tela.indexOf('<Tabela cabecalho=');
  chk('SD-13', iFaixa > 0 && iTabela > iFaixa,
      'e ela fica ACIMA da tabela das camadas — a pergunta «o dinheiro anda?» e mais alta que '
      + '«o mes fecha?», e quem le de cima para baixo tem de topar com ela primeiro');
}

console.log(`\n${falhas === 0 ? 'saude-do-dinheiro: todas as verificacoes passaram'
                              : `saude-do-dinheiro: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
