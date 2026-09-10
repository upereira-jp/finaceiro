// O SISTEMA AINDA ESTA TRABALHANDO SOZINHO? Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/automacoes.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM, e o defeito e de AUSENCIA
//
// A tabela `agenda_execucao` guarda uma linha por rodada desde 30/07/2026, e ate
// 10/09/2026 NUNCA foi lida - nem por repositorio, nem por rota, nem pela tela.
// O proprio `scripts/agenda.ts` tinha escrito por que ela existia: *"sem esse
// registro, «a agenda nao roda desde o dia 3» volta a ser impossivel de
// perguntar"*. Escrevia-se a resposta e nao se perguntava.
//
// E O QUE ISSO CUSTAVA E O PIOR MODO DE FALHA DESTE SISTEMA: a consulta ativa e
// a UNICA porta automatica de baixa. Parada, boleto pago para de virar baixa e a
// cobranca segue acusando quem ja pagou - sem erro, sem log e sem linha, porque
// a ausencia de execucao nao produz nenhuma das tres coisas.
//
// ============================================================================
// A REGRA DE EXIBICAO E O CONTRARIO DA DA FAIXA VIZINHA, e e o assunto do arquivo
//
// `saude-do-dinheiro.ts` cala quando esta tudo bem: `SD-1` exige vazio, para a
// tela nao ganhar um verde a mais para conferir todo dia. Aqui isso seria o
// defeito - "nenhum alerta" e letra por letra a mesma cara de "o alarme tambem
// parou". Por isso `AU-1` mede as DUAS metades no mesmo estado: faixa nenhuma E
// tres linhas de afirmacao. Sem esse par, uma quebra na leitura seria
// indistinguivel de um dia normal.

import { readFileSync } from 'node:fs';
import {
  faixasDasAutomacoes, linhasDasAutomacoes, faz, cadencia, oQueFez,
  type RodadaNaTela, type NivelDaRodada, type ChaveDaAutomacao,
} from '../src/automacoes.ts';
import { pedeGente } from '../../src/dominio/agenda.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const CHAVES: ChaveDaAutomacao[] = ['consulta_ativa', 'fila_de_emissao', 'ciclo_do_crm'];
const NIVEIS: NivelDaRodada[] =
  ['em_dia', 'terminou_mal', 'atrasada', 'travada', 'nunca_rodou', 'sem_conector'];

const INTERVALO: Record<ChaveDaAutomacao, number> =
  { consulta_ativa: 86_400, fila_de_emissao: 300, ciclo_do_crm: 900 };

const r = (
  chave: ChaveDaAutomacao,
  nivel: NivelDaRodada,
  segundos: number | null = 240,
  numeros: { examinados: number; feitos: number; falhos: number } = { examinados: 12, feitos: 3, falhos: 0 },
): RodadaNaTela => ({
  chave, nivel,
  intervalo_segundos: INTERVALO[chave],
  ultima: segundos === null ? null : {
    iniciado_em: '2026-09-10T06:17:00.000Z',
    status: nivel === 'terminou_mal' ? 'erro' : 'ok',
    ...numeros,
  },
  ha_quanto_tempo_segundos: segundos,
});

const TUDO_EM_DIA = CHAVES.map((c) => r(c, 'em_dia'));

console.log('\n-- o sistema ainda esta trabalhando sozinho --');

// ====================================================== AU-1 o par que e o ponto
{
  const faixas = faixasDasAutomacoes(TUDO_EM_DIA);
  const linhas = linhasDasAutomacoes(TUDO_EM_DIA);
  chk('AU-1', faixas.length === 0 && linhas.length === 3,
      'com as tres em dia NAO ha faixa nenhuma (alarme que fala todo dia se aprende a ignorar) e '
      + 'HA tres linhas de afirmacao - e este par e o arquivo inteiro: sem a afirmacao, o dia em '
      + 'que a leitura quebrar tem exatamente a cara do dia em que esta tudo bem');
}

// ============================================ AU-2 o unico silencio autorizado
{
  const so = [r('consulta_ativa', 'sem_conector', null), r('fila_de_emissao', 'sem_conector', null)];
  chk('AU-2', faixasDasAutomacoes(so).length === 0 && linhasDasAutomacoes(so).length === 0,
      'sem conector as duas metades calam: uma instalacao que ainda nao ligou o banco nao tem '
      + 'rodada a esperar, e listar "nunca rodou" ali seria acusar de parado o que ninguem ligou');
}

// ================================ AU-3 exaustao: cada nivel gera o que promete
{
  let fora = 0;
  const semTexto: string[] = [];
  for (const c of CHAVES) {
    for (const n of NIVEIS) {
      const f = faixasDasAutomacoes([r(c, n, n === 'nunca_rodou' ? null : 240)]);
      const esperadas = n === 'em_dia' || n === 'sem_conector' ? 0 : 1;
      if (f.length !== esperadas) fora++;
      for (const x of f) {
        if (!x.titulo.trim() || !x.corpo.trim() || !x.comando.trim()) semTexto.push(`${c}/${n}`);
      }
    }
  }
  chk('AU-3', fora === 0 && semTexto.length === 0,
      `os 18 pares (3 automacoes x 6 niveis) dao a contagem esperada de faixas (${fora} fora) e `
      + `nenhuma sai sem titulo, sem corpo ou sem o comando de quem administra (${semTexto.join(', ')})`);
}

// ===================== AU-4 a tela nao pode divergir do servidor sobre o alarme
{
  /* O ESPELHO, E ELE E O MESMO MECANISMO DO `SD-14`. `NivelDaRodada` e copiado
   * do servidor porque o `web/` e outro pacote e nao alcanca `src/` - entao esta
   * linha importa a funcao DE VERDADE (`pedeGente`, do dominio) e exige que a
   * tela desenhe faixa exatamente onde o servidor diz que precisa de gente,
   * mais `terminou_mal`, que e o unico que a tela conta e a unidade do systemd
   * nao.
   *
   * O que a divergencia custaria: um nivel que o servidor considera parado e a
   * tela desenha calada e uma automacao morta com a tela dizendo que esta tudo
   * bem - que e o defeito original, reintroduzido pela propria correcao. */
  const divergem = NIVEIS.filter((n) => {
    const desenha = faixasDasAutomacoes([r('consulta_ativa', n, 240)]).length > 0;
    return desenha !== (pedeGente(n) || n === 'terminou_mal');
  });
  chk('AU-4', divergem.length === 0,
      'a tela desenha faixa exatamente nos niveis que o servidor considera parados, mais o que '
      + `terminou com erro${divergem.length ? ` (divergem: ${divergem.join(', ')})` : ''} - a copia `
      + 'do tipo esta prendida a funcao de verdade do dominio');
}

// ================================== AU-5 texto de operacao, nao de infraestrutura
{
  const jargao = /\bwebhook\b|\bendpoint\b|\btimer\b|\bsystemd\b|\bcron\b|\bAPI\b|\bHTTP\b|systemctl|_/i;
  const sujos: string[] = [];
  for (const c of CHAVES) {
    for (const n of NIVEIS) {
      for (const f of faixasDasAutomacoes([r(c, n, 240)])) {
        if (jargao.test(`${f.titulo} ${f.corpo}`)) sujos.push(`${c}/${n}`);
      }
    }
  }
  chk('AU-5', sujos.length === 0,
      'nenhuma faixa usa palavra de infraestrutura no que a pessoa le - quem abre a tela nao sabe '
      + `o que e timer e nao precisa saber${sujos.length ? ` (sujas: ${sujos.join(', ')})` : ''}`);

  const comandos = CHAVES.flatMap((c) => faixasDasAutomacoes([r(c, 'atrasada', 999_999)]).map((f) => f.comando));
  chk('AU-6', comandos.length === 3 && comandos.every((x) => x.startsWith('systemctl status financeiro-')),
      'e o comando existe, separado do texto - ele vai atras do `<DetalheTecnico>`, que e o unico '
      + 'lugar suportado para comando de terminal na interface (`T4`). Guardar nao e apagar: quem '
      + 'administra o servidor precisa do ponteiro');
}

// ==================================== AU-7 a frase que impede o panico, e a que age
{
  const f = faixasDasAutomacoes([r('consulta_ativa', 'atrasada', 400_000)])[0]!;
  chk('AU-7', /n[aã]o se perde|est[aá] na conta/i.test(f.corpo) && /[aà] m[aã]o|manual/i.test(f.corpo),
      'a faixa da conferencia de pagamentos diz que o dinheiro NAO se perde e diz o que fazer '
      + 'enquanto isso (dar baixa a mao) - sem a primeira frase o alerta vira panico, sem a '
      + 'segunda ele vira impotencia');

  const fila = faixasDasAutomacoes([r('fila_de_emissao', 'atrasada', 4_000)])[0]!;
  chk('AU-8', /cliente/i.test(fila.corpo) && /fila|esperando/i.test(fila.corpo),
      'e a do envio de boletos diz a consequencia dela, que e outra: o cliente nao recebe o que '
      + 'pagar, e as faturas ficam esperando - duas automacoes paradas nao contam a mesma historia');
}

// ============================================== AU-9 "ha quanto tempo", por extenso
{
  chk('AU-9', faz(0) === 'agora há pouco' && faz(89) === 'agora há pouco'
           && /^há 5 minutos$/.test(faz(300))
           && faz(3600) === 'há 1 hora' && /^há 3 horas$/.test(faz(3 * 3600))
           && faz(86_400) === 'há 1 dia' && /^há 4 dias$/.test(faz(4 * 86_400)),
      'a escala acompanha o tamanho: segundos viram "agora ha pouco", minutos viram minutos, e a '
      + 'partir de um dia e meio vira dia - "ha 30 horas" faz quem le dividir de cabeca');

  const feias = [0, 1, 59, 90, 3599, 86_399, 999_999, 9_999_999]
    .map(faz).filter((x) => /NaN|undefined|-\d|\b0 /.test(x));
  chk('AU-10', feias.length === 0,
      `nenhuma duracao produz texto quebrado (${feias.join(' | ')}) - a frase e lida por quem opera, `
      + 'e "ha NaN dias" seria a tela confessando defeito no lugar de informar');
}

// ================================================= AU-11 a cadencia por extenso
chk('AU-11', cadencia(300) === 'a cada 5 minutos' && cadencia(900) === 'a cada 15 minutos'
          && cadencia(86_400) === 'uma vez por dia',
    'a cadencia sai do numero que o servidor manda e nao de um texto repetido aqui - o dia em que '
    + 'o intervalo mudar, a frase muda junto');

// ============================================ AU-12 zero e um fato, e ele e dito
{
  const vazias = CHAVES.map((c) => oQueFez(r(c, 'em_dia', 60, { examinados: 0, feitos: 0, falhos: 0 })));
  chk('AU-12', vazias.every((x) => x.length > 10 && !/^0\b/.test(x)),
      'a rodada que nao achou nada DIZ que nao achou nada, com uma frase e nao com um zero - '
      + '"nao havia nada a fazer" e "nao rodou" sao historias opostas, e a tela precisa separar as '
      + 'duas: e a razao de este arquivo existir');

  const cheia = oQueFez(r('consulta_ativa', 'em_dia', 60, { examinados: 12, feitos: 3, falhos: 1 }));
  chk('AU-13', cheia.includes('12') && cheia.includes('3') && cheia.includes('1'),
      'e a rodada que trabalhou mostra os tres numeros dela - examinados, feitos e o que nao fechou');
}

// ================================== AU-14 "nunca rodou" e dito com todas as letras
{
  const l = linhasDasAutomacoes([r('consulta_ativa', 'nunca_rodou', null)])[0]!;
  chk('AU-14', /nenhuma vez/i.test(l.quando) && l.saudavel === false && l.fez === '',
      'sem rodada nenhuma a linha diz "ainda nao rodou nenhuma vez" e nao finge contadores - e ela '
      + 'nao sai como saudavel, porque o icone e o segundo sinal e a cor sozinha nunca e o sinal');

  const ok = linhasDasAutomacoes(TUDO_EM_DIA);
  chk('AU-15', ok.every((x) => x.saudavel && /rodou/.test(x.quando) && x.fez !== ''),
      'e as tres em dia dizem QUANDO rodaram e O QUE fizeram - a afirmacao so vale se ela carregar '
      + 'o fato; "esta tudo bem" sem numero nenhum e a mesma promessa vazia que ela veio substituir');
}

// ==================== AU-16 e AU-17 a ULTIMA ligacao: a PRIMEIRA tela monta as duas
{
  /* AS DUAS PONTAS PROVADAS E A DO MEIO NAO - a licao do `SD-12`, de 09/09/2026,
   * e ela vale em dobro aqui: apagar `<PainelDasAutomacoes />` de `prontidao.tsx`
   * passaria em `AU-*`, passaria em `R13*` e passaria no `tsc`, e o sintoma seria
   * rodape vazio. Que e a cara de uma tela que nunca teve o painel.
   *
   * ⚠️ COMENTARIO SAI ANTES DE PROCURAR. Comentar `{/* <Painel /> *\/}` apaga o
   * painel e DEIXA o texto no arquivo - foi assim que a primeira versao do
   * `SD-12` passou verde sobre uma tela que nao mostrava nada, e e a mesma
   * armadilha do `CI-1`. Verificacao que le fonte mede o que RODA, nunca o que
   * esta escrito. */
  const fonte = readFileSync(new URL('../src/telas/prontidao.tsx', import.meta.url), 'utf8');
  const tela = fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const importa = /import \{ FaixasDasAutomacoes, PainelDasAutomacoes \} from '\.\.\/automacoes-corpo\.tsx'/.test(tela);
  const monta = /<FaixasDasAutomacoes\b/.test(tela) && /<PainelDasAutomacoes\b/.test(tela);
  const busca = /api\.get\('\/automacoes'\)/.test(tela);
  chk('AU-16', importa && monta && busca,
      'a tela de Pendencias - a PRIMEIRA da barra - importa, BUSCA `/automacoes` e monta as duas '
      + 'metades. Sem esta linha, apagar qualquer uma das tres coisas passaria em todo o resto e o '
      + 'sintoma seria silencio');

  const iFaixa = tela.indexOf('<FaixasDasAutomacoes');
  const iTabela = tela.indexOf('<Tabela cabecalho=');
  const iPainel = tela.indexOf('<PainelDasAutomacoes');
  chk('AU-17', iFaixa > 0 && iTabela > iFaixa && iPainel > iTabela,
      'o ALARME fica acima da tabela das camadas e a AFIRMACAO abaixo dela - a pergunta «o sistema '
      + 'esta andando?» e mais alta que «o mes fecha?», e a afirmacao de rotina nao pode disputar '
      + 'o alto da tela com o que exige acao');
}

console.log(`\n${falhas === 0 ? 'automacoes: todas as verificacoes passaram'
                              : `automacoes: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
