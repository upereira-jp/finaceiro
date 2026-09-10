// O QUE NAO CHEGOU AO BANCO. Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/emissao-travada.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM
//
// O levantamento de 10/09/2026 escreveu o §5.2 assim: *"o erro aparece POR
// FATURA, uma de cada vez; com 29 unidades, descobrir que 4 estao retentando
// exige abrir 29"*. E ao medir para escrever a lista apareceu o caso que a
// frase nao via: a fatura emitida em que NINGUEM PEDIU o boleto. Ela nao esta em
// erro, nao esta atrasada e nao esta em fila nenhuma - `emitir()` nao cria linha
// de boleto e a fila so enxerga linha que existe.
//
// As duas ausencias tem a mesma cara para quem espera o dinheiro, e por isso
// saem na mesma lista. `EM-2` e `EM-3` prendem as duas metades disso.
//
// ============================================================================
// A REGRA DE EXIBICAO E A DAS AUTOMACOES: A LISTA AFIRMA QUANDO ESTA VAZIA
//
// "Nenhuma linha" e "a leitura quebrou" tem a mesma cara quando a tela cala, e o
// que se quer perceber aqui e uma AUSENCIA - a cobranca que nao saiu. `EM-1`
// mede as duas metades no mesmo estado: faixa nenhuma E uma frase que diz, com
// todas as letras, que todo mundo tem boleto.

import { readFileSync } from 'node:fs';
import {
  faixaDaEmissaoTravada, fraseDaLinha, haQuantoTempo, resumoDaEmissao, avisoDeTruncagem,
  type LinhaNaTela, type NivelDaEmissao, type EmissaoTravadaNaTela,
} from '../src/emissao-travada.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(6)} ${d.replace(/\s+/g, ' ')}`);
};

const linha = (nivel: NivelDaEmissao, extra: Partial<LinhaNaTela> = {}): LinhaNaTela => ({
  fatura_id: `f-${nivel}`,
  unidade: '000401269001287',
  cliente: 'Cliente de Ensaio',
  competencia: '2026-08-01',
  vencimento: '2026-09-20',
  valor_total_centavos: 123_45,
  status_fatura: nivel === 'parado' ? 'vencida' : 'emitida',
  nivel,
  pede_gente: nivel === 'esquecido' || nivel === 'insistindo' || nivel === 'parado',
  ha_quanto_tempo_segundos: 3 * 86_400,
  boleto: nivel === 'nao_pedido' || nivel === 'esquecido' ? null : {
    status: 'erro', tentativas: 4,
    ultimo_erro: 'CPF/CNPJ do pagador invalido (codigo 400)',
    ultima_tentativa_em: '2026-09-10T09:00:00Z',
    proxima_tentativa_em: '2026-09-10T15:00:00Z',
  },
  ...extra,
});

const conjunto = (linhas: LinhaNaTela[], total = linhas.length): EmissaoTravadaNaTela => ({
  linhas, total, pedem_gente: linhas.filter((l) => l.pede_gente).length,
});

const TODOS: NivelDaEmissao[] = ['nao_pedido', 'esquecido', 'esperando', 'insistindo', 'parado'];

// ============================================================ EM-1 o vazio FALA
{
  const vazio = conjunto([]);
  chk('EM-1', faixaDaEmissaoTravada(vazio) === null
           && /j[aá] t[eê]m boleto/i.test(resumoDaEmissao(vazio)),
      'com a lista vazia nao ha faixa NENHUMA e o painel AFIRMA que todas as faturas emitidas tem '
      + 'boleto no banco - as duas metades no mesmo estado, porque uma lista que so cala nao '
      + 'distingue "esta tudo certo" de "a leitura quebrou"');

  chk('EM-1b', faixaDaEmissaoTravada(null) === null,
      'e enquanto a leitura nao voltou (`null`) tambem nao ha faixa: ausencia de resposta nao e '
      + 'resposta, e uma faixa que pisca vermelho durante o carregamento e ruido');
}

// ================================================ EM-2 e EM-3 as duas ausencias
{
  const semPedido = fraseDaLinha(linha('esquecido'));
  chk('EM-2', /ningu[eé]m pediu/i.test(semPedido.estado)
           && /n[aã]o vai pedir sozinho|nada vai pedir/i.test(semPedido.oQueFazer)
           && semPedido.grave,
      'a fatura que ninguem clicou DIZ que ninguem pediu e DIZ que nada vai pedir sozinho - a '
      + 'segunda metade e a que importa: quem le pode achar que ha uma fila cuidando disso, e '
      + 'nao ha, porque a fila so retenta boleto que ja foi pedido uma vez');

  const tentando = fraseDaLinha(linha('esperando'));
  chk('EM-3', /banco recusou/i.test(tentando.estado)
           && /n[aã]o [eé] preciso fazer nada/i.test(tentando.oQueFazer)
           && !tentando.grave,
      'a que a fila esta retentando diz para NAO fazer nada - instrucao tao legitima quanto as '
      + 'outras, e sem ela alguem fica clicando em cima de uma fila que ja esta trabalhando');
}

// ================================================== EM-4 toda linha e acionavel
{
  const sem = TODOS.filter((n) => {
    const f = fraseDaLinha(linha(n));
    return !f.estado.trim() || !f.oQueFazer.trim();
  });
  chk('EM-4', sem.length === 0,
      `os ${TODOS.length} niveis tem estado E o que fazer${sem.length ? ` - FALTAM: ${sem.join(', ')}` : ''}`
      + ' - uma linha que diz o problema e nao diz o passo seguinte transfere o beco para quem le');
}

// ================================================ EM-5 nenhuma frase manda ao terminal
{
  /* A mesma regra que a suite de vocabulario chama de beco (`T4`), medida aqui na
   * fonte das frases: quem abre esta tela nao tem o repositorio clonado, e mandar
   * rodar comando como proximo passo e uma instrucao impossivel. Aqui nao ha
   * `DetalheTecnico` que valha - estas frases sao o texto exibido. */
  const fonte = readFileSync(new URL('../src/emissao-travada.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  const proibido = [/npm run/, /\bQ-[A-Z]/, /\bR\d{1,2}\b/, /\bUC\b/, /systemctl/];
  const achados = proibido.filter((p) => p.test(fonte));
  chk('EM-5', achados.length === 0,
      `nenhuma frase manda rodar comando nem cita codigo interno${achados.length ? ` - ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ====================================== EM-6 a faixa CONTA, da idade e nao lista
{
  const f = faixaDaEmissaoTravada(conjunto([
    linha('esquecido', { fatura_id: 'a', ha_quanto_tempo_segundos: 9 * 86_400 }),
    linha('insistindo', { fatura_id: 'b', ha_quanto_tempo_segundos: 2 * 86_400 }),
    linha('esperando', { fatura_id: 'c' }),
  ]));
  chk('EM-6', f !== null && /2 faturas/.test(f.titulo) && /9 dias/.test(f.corpo)
           && !f.corpo.includes('000401269001287'),
      'a faixa conta as que pedem gente (2 das 3 - `esperando` nao entra), da a idade da MAIS '
      + 'ANTIGA e NAO lista unidade nenhuma: «4 sem cobranca» pode ser de hoje de manha, e «a mais '
      + 'antiga ha 9 dias» e o que faz alguem abrir a tela hoje');

  const so = faixaDaEmissaoTravada(conjunto([linha('esquecido')]));
  chk('EM-6b', so !== null && /1 fatura emitida est[aá]/.test(so.titulo),
      'e no singular a frase e singular - "1 faturas estao" e a marca de contador escrito sem '
      + 'ninguem ler a saida');
}

// ============================== EM-7 a faixa cala quando so ha o que anda sozinho
{
  const f = faixaDaEmissaoTravada(conjunto([linha('nao_pedido'), linha('esperando')]));
  chk('EM-7', f === null,
      'com so `nao_pedido` e `esperando` NAO ha faixa - as duas sao o dia normal de quem acabou '
      + 'de emitir o mes, e um alarme que toca todo dia de trabalho e um alarme que se ignora');
}

// ========================================= EM-8 o resumo nao mente sobre o total
{
  const r = resumoDaEmissao(conjunto([linha('esquecido'), linha('esperando')]));
  chk('EM-8', /2 faturas emitidas/.test(r) && /1 delas n[aã]o se resolve sozinha/.test(r),
      'o resumo separa QUANTAS estao sem boleto de QUANTAS precisam de gente - somar as duas '
      + 'coisas num numero so faria "8 pendencias" significar oito trabalhos que nao existem');

  const calmo = resumoDaEmissao(conjunto([linha('esperando')]));
  chk('EM-8b', /nenhuma precisa de voc[eê]/i.test(calmo),
      'e com tudo andando sozinho o resumo diz isso em vez de calar - "1 fatura sem boleto" sem '
      + 'a segunda metade leria como trabalho de alguem');
}

// ================================================ EM-9 truncar e DITO, nao calado
{
  const muitas = Array.from({ length: 200 }, (_, i) => linha('esperando', { fatura_id: `f${i}` }));
  const aviso = avisoDeTruncagem(conjunto(muitas, 340));
  chk('EM-9', aviso !== null && /200/.test(aviso) && /340/.test(aviso),
      'quando o teto corta, a tela DIZ que mostra 200 de 340 - "sao estas" sobre uma amostra e a '
      + 'mesma mentira que a rodada que contava "0 deixados para tras" contava');

  chk('EM-9b', avisoDeTruncagem(conjunto([linha('esperando')])) === null,
      'e sem truncagem nao ha aviso nenhum: um rodape que explica um corte que nao houve treina a '
      + 'nao ler o rodape');
}

// ======================================== EM-10 o sujeito do relogio muda com o caso
{
  chk('EM-10', /^emitida h[aá] 3 dias$/.test(haQuantoTempo(linha('esquecido')))
            && /^tentando desde h[aá] 3 dias$/.test(haQuantoTempo(linha('insistindo'))),
      'antes do primeiro pedido conta-se desde a EMISSAO, depois dele desde a primeira TENTATIVA - '
      + 'a mesma frase para as duas faria "ha 3 dias" significar duas coisas na mesma lista');

  chk('EM-10b', haQuantoTempo(linha('esperando', { ha_quanto_tempo_segundos: null })) === '',
      'e sem o numero do servidor a frase e VAZIA em vez de inventada - o relogio da maquina de '
      + 'quem abriu a tela erra minutos, horas e as vezes o fuso inteiro');
}

// ===================== EM-11 a resposta do banco chega crua, e so quando existe
{
  chk('EM-11', fraseDaLinha(linha('insistindo')).respostaDoBanco === 'CPF/CNPJ do pagador invalido (codigo 400)'
            && fraseDaLinha(linha('esquecido')).respostaDoBanco === null,
      'o que o banco respondeu chega INTEIRO e sem traducao (inventar uma para recusa que nao se '
      + 'conhece e pior que mostrar a original), e some quando nunca houve tentativa');

  chk('EM-11b', fraseDaLinha(linha('esperando')).tentativas === '4 tentativas'
             && fraseDaLinha(linha('nao_pedido')).tentativas === ''
             && fraseDaLinha(linha('esperando', { boleto: { ...linha('esperando').boleto!, tentativas: 1 } })).tentativas === '1 tentativa',
      'o contador vem por extenso, no singular quando e uma, e VAZIO quando nao houve nenhuma - '
      + '"0 tentativas" numa fatura que ninguem pediu leria como fracasso');
}

// ============ EM-12 e EM-13 a ULTIMA ligacao: as telas montam as duas metades
{
  /* AS DUAS PONTAS PROVADAS E A DO MEIO NAO - a licao do `SD-12` e do `AU-16`.
   * Apagar `<PainelDaEmissao />` de `faturas.tsx` passaria em `EM-*`, passaria no
   * `tsc` e o sintoma seria uma tela sem a lista. Que e a cara de uma tela que
   * nunca teve lista.
   *
   * COMENTARIO SAI ANTES DE PROCURAR: comentar o componente apaga a tela e DEIXA
   * o texto no arquivo. Verificacao que le fonte mede o que RODA. */
  const semComentario = (t: string) => t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

  const faturas = semComentario(readFileSync(new URL('../src/telas/faturas.tsx', import.meta.url), 'utf8'));
  chk('EM-12', /<PainelDaEmissao/.test(faturas)
            && /api\.get\('\/emissao\/travada'\)/.test(faturas)
            && /pedirBoleto=/.test(faturas),
      'a tela de emissao BUSCA `/emissao/travada`, MONTA a lista e liga o botao que pede o boleto - '
      + 'as tres coisas, porque apagar qualquer uma delas passaria em todo o resto');

  const pendencias = semComentario(readFileSync(new URL('../src/telas/prontidao.tsx', import.meta.url), 'utf8'));
  const iFaixa = pendencias.indexOf('<FaixaDaEmissao');
  const iTabela = pendencias.indexOf('<Tabela cabecalho=');
  chk('EM-13', iFaixa > 0 && /api\.get\('\/emissao\/travada'\)/.test(pendencias) && iTabela > iFaixa,
      'e a PRIMEIRA tela da barra busca a mesma leitura e poe a faixa ACIMA da tabela do mes - '
      + 'quem so abre Pendencias tem de descobrir ali que ha cliente sem boleto, sem depender de '
      + 'abrir a aba certa no dia certo');
}

console.log(`\n${falhas === 0 ? `emissao travada: ${feitas} verificacoes, 0 falhas`
                              : `emissao travada: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
