// O PAINEL DE SAÚDE, nas regras (`web/src/painel-de-saude.ts`). Sem JSX, sem rede.
// Uso: node --experimental-strip-types web/tests/painel-de-saude.ts
//
// O desenho montado está em `caso-render.tsx` (R13*, R33*); a ligação nas telas,
// em `automacoes.ts` (AU-16 a AU-18). Aqui: que peça aparece, com que estado e que
// frase, e o que o resumo de uma linha diz — inclusive o que ele NÃO pode dizer.

import {
  pecasDaSaude, pecaDosIgnorados, resumoDaSaude, algoLido, aindaLendo, temAlarme,
  type LeituraDaSaude, type AvisosIgnoradosNaTela, type ChaveDaPeca,
} from '../src/painel-de-saude.ts';
import type { RodadaNaTela } from '../src/automacoes.ts';
import { emReais } from '../src/dinheiro.ts';

let falhas = 0;
let feitas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  feitas++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const rodada = (chave: RodadaNaTela['chave'], nivel: RodadaNaTela['nivel'] = 'em_dia'): RodadaNaTela => ({
  chave, nivel, intervalo_segundos: 300,
  ultima: { iniciado_em: '2026-10-03T01:00:00.000Z', status: 'ok', examinados: 4, feitos: 1, falhos: 0 },
  ha_quanto_tempo_segundos: 120,
});
const RODADAS = [rodada('consulta_ativa'), rodada('fila_de_emissao'), rodada('ciclo_do_crm')];
const NENHUM: AvisosIgnoradosNaTela = {
  janela_em_dias: 30, titulo_desconhecido: { total: 0, valor_centavos: 0 }, evento_ignorado: { total: 0 }, avisos: [],
};
const leitura = (o: Partial<LeituraDaSaude> = {}): LeituraDaSaude => ({
  rodadas: RODADAS, erroDasRodadas: null, semConector: false, diasDoCertificado: 318,
  aviso: 'ativo', avisoSemPermissao: false, ignorados: NENHUM, erroDosIgnorados: false, ...o,
});
const chaves = (l: LeituraDaSaude) => pecasDaSaude(l).map((p) => p.chave);
const peca = (l: LeituraDaSaude, c: ChaveDaPeca) => pecasDaSaude(l).find((p) => p.chave === c);

// ---------------------------------------------------------- PS1 a ordem e o todo
{
  const c = chaves(leitura());
  chk('PS1', c.join(',') === 'consulta_ativa,fila_de_emissao,ciclo_do_crm,certificado,aviso,ignorados,backup,caixa',
      `as peças vêm na ordem do caminho do dinheiro: as rodadas, o banco, o que ele avisou e não entrou, e o que ainda não existe (${c.join(', ')})`);
  const tudo = pecasDaSaude(leitura());
  chk('PS1b', tudo.filter((p) => p.estado === 'em_dia').length === 6
          && tudo.filter((p) => p.estado === 'nao_existe').map((p) => p.chave).join(',') === 'backup,caixa',
      'tudo de pé: seis peças em dia, e backup e caixa como o que ainda não existe — nunca como falha');
}

// ---------------------------------------------------------- PS2 o aviso de pagamento
{
  const estado = (n: LeituraDaSaude['aviso']) => peca(leitura({ aviso: n }), 'aviso')?.estado;
  chk('PS2', estado('ativo') === 'em_dia' && estado('inativado') === 'falha' && estado('ausente') === 'falha'
          && estado('url_divergente') === 'falha' && estado('nao_verificavel') === 'nao_medido',
      'aviso: ligado é em dia; desligado, ausente ou apontando para outro lugar é falha; «não deu para perguntar» é não medido');
  const semPapel = peca(leitura({ aviso: 'nao_verificavel', avisoSemPermissao: true }), 'aviso')!;
  chk('PS2b', semPapel.estado === 'nao_medido' && /papel/.test(semPapel.frase) && semPapel.destino === null,
      'o 403 do papel de quem abriu a tela é dito como tal — e sem link para uma tela que esse papel não opera');
  chk('PS2c', !chaves(leitura({ aviso: null })).includes('aviso'),
      'aviso ainda lendo não vira linha (nem «não medido» piscando)');
}

// ---------------------------------------------------------- PS3 o certificado
{
  const c = (dias: number | null | undefined) => peca(leitura({ diasDoCertificado: dias }), 'certificado');
  chk('PS3', c(318)!.estado === 'em_dia' && c(318)!.frase.includes('318 dias') && c(1)!.frase.includes('1 dia,') === false
          && c(1)!.frase.includes('1 dia'),
      'em dia diz quantos dias faltam, no singular quando é um');
  chk('PS3b', c(12)!.estado === 'atencao' && c(-1)!.estado === 'falha' && c(null)!.estado === 'nao_medido' && c(undefined) === undefined,
      'perto de vencer é atenção, vencido é falha, sem data é não medido, e ainda lendo não vira linha');
}

// ---------------------------------------------------------- PS4 os pagamentos que não entraram
{
  chk('PS4', pecaDosIgnorados(NENHUM).estado === 'em_dia' && /nenhum nos últimos 30 dias/.test(pecaDosIgnorados(NENHUM).frase),
      'nenhum aviso sem registro: em dia, e a frase diz a janela olhada');
  const comDois: AvisosIgnoradosNaTela = {
    janela_em_dias: 30, titulo_desconhecido: { total: 3, valor_centavos: 50_000 }, evento_ignorado: { total: 1 },
    avisos: [
      { id: '1', recebido_em: '2026-10-02T17:40:06.000Z', motivo: 'titulo_desconhecido', nosso_numero: '72',
        valor_centavos: 30_000, data_liquidacao: '2026-10-02', detalhe: null },
      { id: '2', recebido_em: '2026-10-01T11:33:31.000Z', motivo: 'titulo_desconhecido', nosso_numero: '63',
        valor_centavos: 20_000, data_liquidacao: null, detalhe: null },
      { id: '3', recebido_em: '2026-09-30T10:00:00.000Z', motivo: 'evento_ignorado', nosso_numero: null,
        valor_centavos: null, data_liquidacao: null, detalhe: 'cancelamento de baixa do titulo 9' },
    ],
  };
  const p = pecaDosIgnorados(comDois);
  chk('PS4b', p.estado === 'atencao' && p.frase.includes('3 pagamentos avisados') && p.frase.includes(emReais(50_000))
          && /Além deles, 1 aviso não era pagamento/.test(p.frase),
      'com pagamentos sem registro: atenção, a contagem e a soma dos que SÃO pagamento, e o que não é pagamento contado à parte');
  chk('PS4c', p.detalhes.length === 3 && p.detalhes[0]!.includes('nosso número 72') && p.detalhes[0]!.includes('pago em 02/10/2026')
          && !p.detalhes[1]!.includes('pago em') && p.detalhes[2] === 'e mais 1',
      'cada pagamento numa linha (sem inventar data que o banco não mandou), e «e mais N» quando a lista é menor que o total');
  chk('PS4d', p.tecnico.length === 1 && p.tecnico[0]!.includes('cancelamento de baixa'),
      'o motivo do aviso que não é pagamento vai para o detalhe técnico, e não para a frase');
  chk('PS4e', peca(leitura({ ignorados: null, erroDosIgnorados: true }), 'ignorados')!.estado === 'nao_medido',
      'a leitura que falhou diz que não foi possível ler — sem fingir «nenhum»');
}

// ---------------------------------------------------------- PS5 o resumo
{
  chk('PS5', resumoDaSaude(pecasDaSaude(leitura())).startsWith('O que existe está de pé.')
          && /Ainda não existem: o backup do banco de dados, o saldo em caixa\./.test(resumoDaSaude(pecasDaSaude(leitura()))),
      'tudo de pé: o resumo afirma, e diz por último o que ainda não existe — sem contar como alarme');
  const ruim = pecasDaSaude(leitura({ aviso: 'inativado', diasDoCertificado: 5 }));
  chk('PS5b', /^2 pedem atenção: o certificado do banco, o aviso de pagamento do banco\./.test(resumoDaSaude(ruim)) && temAlarme(ruim),
      'com falha e atenção, o resumo conta e nomeia — e o painel abre sozinho');
  const naoSei = resumoDaSaude(pecasDaSaude(leitura({ aviso: 'nao_verificavel' })));
  chk('PS5c', naoSei.startsWith('O que existe está de pé.') && /1 não pôde ser medida: o aviso de pagamento/.test(naoSei),
      '«ninguém sabe» é dito à parte e não vira alarme: não saber não é estar quebrado');
  chk('PS5d', resumoDaSaude(pecasDaSaude(leitura({ aviso: null })), true).startsWith('Lendo o restante'),
      'com peça por voltar, o resumo diz que está lendo em vez de afirmar «de pé»');
}

// ---------------------------------------------------------- PS6 ainda lendo
{
  const nada: LeituraDaSaude = leitura({ rodadas: null, semConector: null, ignorados: null, aviso: null, diasDoCertificado: undefined });
  chk('PS6', !algoLido(nada) && aindaLendo(nada),
      'antes de qualquer resposta: nada lido — e o painel não desenha (backup e caixa sozinhos diriam «de pé»)');
  chk('PS6b', algoLido(leitura()) && !aindaLendo(leitura()) && aindaLendo(leitura({ ignorados: null }))
          && !aindaLendo(leitura({ ignorados: null, erroDosIgnorados: true })),
      'tudo voltou: lido e nada pendente; uma leitura pendente segura a afirmação; uma leitura que FALHOU já voltou');
  chk('PS6c', !aindaLendo(leitura({ semConector: true, aviso: null, diasDoCertificado: undefined, ignorados: null })),
      'sem banco ligado não há certificado nem aviso a esperar');
}

// ---------------------------------------------------------- PS7 sem banco
{
  const c = chaves(leitura({ semConector: true }));
  chk('PS7', c.includes('banco') && !c.includes('certificado') && !c.includes('aviso') && !c.includes('ignorados'),
      'sem banco ligado: UMA linha diz isso, e não três acusando um banco que ninguém ligou');
}

// ---------------------------------------------------------- PS8 as rodadas
{
  const p = pecasDaSaude(leitura({ rodadas: [rodada('consulta_ativa', 'atrasada'), rodada('fila_de_emissao'), rodada('ciclo_do_crm')] }));
  chk('PS8', p.find((x) => x.chave === 'consulta_ativa')!.estado === 'falha' && p.find((x) => x.chave === 'fila_de_emissao')!.estado === 'em_dia',
      'rodada parada é falha, a que roda está em dia — uma linha por rodada, como era o rodapé');
  const erro = pecasDaSaude(leitura({ rodadas: null, erroDasRodadas: 'a rede caiu' }));
  chk('PS8b', erro[0]!.chave === 'rodadas' && erro[0]!.estado === 'nao_medido' && erro[0]!.frase.includes('a rede caiu'),
      'a leitura das rodadas que falhou vira UMA linha que diz «ninguém sabe», com o motivo à vista');
}

// ---------------------------------------------------------- PS9 as palavras
{
  const todas = [
    ...pecasDaSaude(leitura()), ...pecasDaSaude(leitura({ aviso: 'inativado' })), ...pecasDaSaude(leitura({ aviso: 'ausente' })),
    ...pecasDaSaude(leitura({ aviso: 'url_divergente' })), ...pecasDaSaude(leitura({ semConector: true })),
    ...pecasDaSaude(leitura({ diasDoCertificado: -3 })), ...pecasDaSaude(leitura({ diasDoCertificado: null })),
  ].flatMap((p) => [p.nome, p.frase, ...p.detalhes]);
  const proibidas = [/\bwebhook\b/i, /\bendpoint\b/i, /\bsplit\b/i, /\bQ-[A-Z]/, /(?<![\w/])[a-z]{3,}_[a-z]{3,}(?![\w/])/, /\bfaturas?\b/i];
  const achadas = todas.filter((t) => proibidas.some((r) => r.test(t)));
  chk('PS9', achadas.length === 0,
      `nenhuma frase do painel usa jargão, código interno, nome de coluna nem «fatura»${achadas.length ? ` — ACHADO: ${achadas.join(' | ')}` : ''}`);
}

console.log();
if (falhas > 0) { console.log(`--- painel de saude: ${falhas} FALHA(S)`); process.exit(1); }
console.log(`--- painel de saude (peças, estados e o resumo de uma linha): ${feitas} verificacoes, 0 falhas`);
