// O VINCULO COM O OUTRO SISTEMA, nas frases. Pura, sem DOM.
// Uso: node --experimental-strip-types web/tests/vinculo-do-crm.ts
//
// ============================================================================
// O QUE ESTAS VERIFICACOES PRENDEM, e a medicao veio antes delas
//
// Quando um contrato de rateio muda de unidade no outro sistema, o conector
// RECUSA copiar a mudanca (SPEC-002 R23) - das duas leituras uma esta errada, e
// escolher seria palpite. A recusa esta certa. O que faltava era a saida, e ela
// morava so em `npm run destravar-uc`, no terminal.
//
// ⚠️ O PRECO DISSO FOI MEDIDO NO JOURNAL EM 10/09/2026: a unidade
// `000091762801211` estava sendo recusada a cada 15 minutos **desde 04/09 as
// 18h** - 519 vezes, seis dias fora do espelho. O que fica fora do espelho fica
// fora do faturamento, e ninguem sabia por quanto tempo.
//
// ============================================================================
// A ARMADILHA QUE ESTAS FRASES EVITAM
//
// O botao faz UMA coisa: solta o vinculo velho DESTA unidade. Ele nao escreve o
// vinculo novo, nao move cliente e nao move usina - quem faz isso e o ciclo, ate
// 15 minutos depois. Uma frase que prometesse "corrigir o cadastro" faria alguem
// clicar esperando outra coisa, e o resultado (a unidade some da recusa e
// reaparece ja vinculada) pareceria efeito colateral em vez de o desenho.
//
// Por isso `V-3` exige que TODO estado que oferece clique diga o que o clique
// faz E o que o sistema faz sozinho depois.

import { readFileSync } from 'node:fs';
import { fraseDoVinculo, resumoDoVinculo, type VinculoNaTela } from '../src/vinculo-do-crm.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const rateio = (uc: string, contrato: string) => ({
  uc, contrato_id: contrato, lead_codigo: `LEAD-${uc.slice(-4)}`, cliente: `Cliente ${uc.slice(-4)}`,
});

/** O caso de producao, com os identificadores do journal de 10/09/2026. */
const TRAVADA: VinculoNaTela = {
  numero_uc: '000091762801211',
  cliente: 'Cliente do caso real',
  contrato_no_espelho: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
  crm_por_contrato: rateio('000000100076075', 'd7d1758d-e60b-4124-8720-6bc6e0171535'),
  crm_por_uc: rateio('000091762801211', 'aaaa1111-2222-3333-4444-555566667777'),
  uc_presa_ao_substituto: null,
  decisao: {
    pode: true,
    contratoASoltar: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
    ucQueVaiNascer: '000000100076075',
    contratoQueVaiEntrar: 'aaaa1111-2222-3333-4444-555566667777',
  },
};

const recusada = (guarda: 1 | 2 | 3 | 4, motivo: string, extra: Partial<VinculoNaTela> = {}): VinculoNaTela => ({
  ...TRAVADA, decisao: { pode: false, guarda, motivo }, ...extra,
});

// ==================================================== V-1 o caso que destrava
{
  const f = fraseDoVinculo(TRAVADA);
  chk('V-1', f.podeDestravar && f.travada
          && /travada/i.test(f.titulo) && f.corpo.includes('000000100076075'),
      'o caso real DIZ que esta travado, NOMEIA para onde o contrato foi e oferece o clique - '
      + 'sem o numero da outra unidade a frase seria verdadeira e inutil: quem opera precisa '
      + 'reconhecer as duas pontas para saber que e mesmo a troca que ele conhece');

  chk('V-1b', /15 minutos/.test(f.corpo) || /15 minutos/.test(f.oQueOBotaoFaz),
      'e diz de quanto em quanto tempo a recusa se repete (ou quando o conserto chega) - "esta '
      + 'travado" sem cadencia nao distingue um susto de um problema que dura dias');
}

// ============================== V-2 o que o botao faz, e o que ele NAO faz
{
  const f = fraseDoVinculo(TRAVADA);
  chk('V-2', /solta o v[ií]nculo velho/i.test(f.oQueOBotaoFaz)
          && /n[aã]o escreve o v[ií]nculo novo/i.test(f.oQueOBotaoFaz)
          && /pr[oó]ximo ciclo/i.test(f.oQueOBotaoFaz),
      'a frase do botao diz as tres coisas: o que ele faz, o que ele NAO faz, e o que o sistema '
      + 'faz sozinho depois. Sem a segunda, quem clica espera o cadastro corrigido na hora');
}

// ================================ V-3 nenhum estado deixa a pessoa sem frase
{
  const casos: Array<[string, VinculoNaTela]> = [
    ['destravavel', TRAVADA],
    ['guarda 1', recusada(1, 'a UC X nao tem crm_usina_cliente_id.', { contrato_no_espelho: null })],
    ['guarda 2 sumiu', recusada(2, 'o contrato X nao esta mais em financeiro.rateio_clientes.', { crm_por_contrato: null })],
    ['guarda 2 igual', recusada(2, 'no CRM o contrato X continua na UC Y.')],
    ['guarda 3', recusada(3, 'no CRM a UC X nao e servida por contrato nenhum.', { crm_por_uc: null })],
    ['guarda 4', recusada(4, 'o contrato substituto ja esta vinculado a UC Z.', { uc_presa_ao_substituto: '000000100076075' })],
  ];
  const mudos = casos.filter(([, v]) => {
    const f = fraseDoVinculo(v);
    return !f.titulo.trim() || !f.corpo.trim();
  });
  chk('V-3', mudos.length === 0,
      `os ${casos.length} estados tem titulo e corpo${mudos.length ? ` - MUDOS: ${mudos.map(([n]) => n).join(', ')}` : ''}`
      + ' - inclusive os que nao oferecem clique, porque "nada aparece" e a pior resposta possivel '
      + 'para quem abriu a linha justamente para entender o que esta acontecendo');

  const comBotao = casos.filter(([, v]) => fraseDoVinculo(v).podeDestravar);
  chk('V-3b', comBotao.length === 1 && comBotao[0]![0] === 'destravavel',
      'e so UM deles oferece o clique - a tela repete o que as quatro guardas responderam, e nao '
      + 'decide nada por conta propria');
}

// =============== V-3c o caso REAL de producao cai na guarda 3, e a frase muda
{
  /*
   * MEDIDO EM 10/09/2026 CONTRA A PRODUCAO, pelo caminho novo: a unidade que
   * estava travada ha seis dias NAO e uma troca entre duas unidades nossas. O
   * CRM diz que o contrato dela passou a servir `000091762801211` e que nenhum
   * contrato serve `000000100076075` - o numero da unidade foi CORRIGIDO la.
   *
   * A frase generica da guarda 3 («falta o contrato novo la») mandava esperar
   * por uma coisa que ja tinha acontecido. Esta verificacao prende a versao que
   * NOMEIA para onde o contrato foi.
   */
  const real: VinculoNaTela = {
    numero_uc: '000000100076075',
    cliente: 'CARLA GONZAGA DE MORAIS SILVA - PANIFICADORA PLAZZA - LOURIVAL',
    contrato_no_espelho: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
    crm_por_contrato: { uc: '000091762801211', contrato_id: 'd7d1758d-e60b-4124-8720-6bc6e0171535',
                        lead_codigo: 'G3-0229',
                        cliente: 'CARLA GONZAGA DE MORAIS SILVA - PANIFICADORA PLAZZA - LOURIVAL' },
    crm_por_uc: null,
    uc_presa_ao_substituto: null,
    decisao: { pode: false, guarda: 3,
               motivo: 'no CRM a UC 000000100076075 nao e servida por contrato nenhum.' },
  };
  const f = fraseDoVinculo(real);
  chk('V-3c', f.corpo.includes('000091762801211') && /n[uú]mero da unidade/i.test(f.corpo)
           && !f.podeDestravar,
      'o caso real de producao NOMEIA para onde o contrato foi e levanta a hipotese certa (numero '
      + 'corrigido do outro lado) em vez de mandar esperar por um contrato que ja existe - e '
      + 'continua sem oferecer o clique, porque soltar deixaria a linha orfa');

  const semPista = fraseDoVinculo({ ...real, crm_por_contrato: null });
  chk('V-3d', !/n[uú]mero da unidade/i.test(semPista.corpo),
      'e sem essa pista a frase volta a ser a generica - levantar a hipotese sem o dado que a '
      + 'sustenta seria a tela adivinhando');
}

// ============================== V-4 as guardas viram frase de operacao
{
  const g2 = fraseDoVinculo(recusada(2, 'tecnico', { crm_por_contrato: null }));
  chk('V-4', !/rateio_clientes|crm_usina_cliente_id/.test(g2.corpo)
          && /contrato que sumiu|sumiu de l[aá]/i.test(g2.corpo),
      'a guarda 2 vira "contrato que sumiu do outro sistema" em vez do nome da view - o motivo '
      + 'tecnico continua existindo, atras do detalhe tecnico, e nao no meio da frase');

  const g4 = fraseDoVinculo(recusada(4, 'tecnico', { uc_presa_ao_substituto: '000000100076075' }));
  chk('V-4b', g4.corpo.includes('000000100076075') && g4.travada,
      'a guarda 4 NOMEIA a outra unidade e conta como travamento - ela e a unica recusa que '
      + 'continua bloqueando o ciclo, e trata-la como "nada a fazer" esconderia um problema ativo');

  const g1 = fraseDoVinculo(recusada(1, 'tecnico', { contrato_no_espelho: null }));
  chk('V-4c', !g1.travada && !g1.podeDestravar,
      'e a guarda 1 nao e travamento: unidade sem vinculo nenhum nao esta prendendo o ciclo, e '
      + 'pedir atencao ali seria alarme sobre o que nao existe');
}

// ============================================= V-5 nenhuma frase manda ao terminal
{
  const fonte = readFileSync(new URL('../src/vinculo-do-crm.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  const proibido = [/npm run/, /\bQ-[A-Z]/, /\bR\d{1,2}\b/, /\bUC\b/, /psql/];
  const achados = proibido.filter((p) => p.test(fonte));
  chk('V-5', achados.length === 0,
      `nenhuma frase manda rodar comando nem cita codigo interno${achados.length ? ` - ACHADO: ${achados.join(' · ')}` : ''}`);
}

// ==================================================== V-6 o resumo de uma palavra
{
  chk('V-6', resumoDoVinculo(TRAVADA) === 'travado'
          && resumoDoVinculo(recusada(1, 'x', { contrato_no_espelho: null })) === 'sem vínculo'
          && resumoDoVinculo(recusada(2, 'x')) === 'vinculado',
      'o resumo separa os tres estados que importam de relance: travado, vinculado e sem vinculo');
}

// ================== V-7 a ULTIMA ligacao: a tela busca, monta e chama a escrita
{
  const tela = readFileSync(new URL('../src/telas/unidades.tsx', import.meta.url), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  chk('V-7', /<PainelDoVinculo/.test(tela)
          && /\/vinculo`\)/.test(tela)
          && /destravar-vinculo/.test(tela),
      'a aba de unidades BUSCA o vinculo, MONTA o painel e CHAMA a rota que solta - as tres, '
      + 'porque apagar qualquer uma passaria no resto e o sintoma seria uma linha que abre e '
      + 'nao mostra nada');

  const pendencias = readFileSync(new URL('../src/telas/prontidao.tsx', import.meta.url), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  chk('V-7b', /recusas/i.test(pendencias) && /Unidades consumidoras/.test(pendencias),
      'e a tela de Pendencias, onde a recusa aparece, manda para a aba certa - a frase antiga '
      + 'dizia que a correcao era "no outro sistema, dono do dado", e nesta recusa o outro '
      + 'sistema ja esta certo: o que esta velho e o vinculo daqui');
}

console.log(`\n${falhas === 0 ? `vinculo com o outro sistema: ${feitas} verificacoes, 0 falhas`
                              : `vinculo com o outro sistema: ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
