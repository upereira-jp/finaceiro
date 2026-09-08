// A COMPETENCIA, nos tres formatos. Puro, sem banco e sem DOM.
// Uso: node --experimental-strip-types tests/competencia.ts
//
// O QUE ESTAS VERIFICACOES PRENDEM, e por que elas valem mais que parecem.
//
// A regra dos tres formatos ja existiu DUAS VEZES neste repositorio, escrita em
// dois arquivos, e as duas copias discordavam justamente no formato que a
// Equatorial imprime. `fatura-concessionaria.ts` aprendeu `MMM/AAAA` em
// 08/08/2026 numa fatura real; `registro-unificado.ts` — o caminho OFICIAL da
// `Q-CICLO-01`, o que grava a conta lida que a prontidao conta — nunca aprendeu.
//
// O efeito nao era um erro de tela: era a camada `conta_lida_da_competencia`
// presa em 0 de 29, porque registrar uma conta REAL levantava
// `CompetenciaIlegivel` e a saida era reescrever `MAI/2026` como `05/2026`,
// vinte e nove vezes por mes.
//
// Por isso o K3 abaixo compara os DOIS caminhos um contra o outro em vez de
// comparar cada um com um numero meu: enquanto eles concordarem, a copia nao
// pode voltar sem falhar aqui.

import {
  lerCompetencia, competenciaEmIso, competenciaEmBr, MES_POR_EXTENSO,
  FORMATOS_DA_COMPETENCIA,
} from '../src/dominio/competencia.ts';
import { primeiroDiaDaCompetencia, CompetenciaIlegivel } from '../src/repos/registro-unificado.ts';
import { lerFaturaDaConcessionaria } from '../src/dominio/fatura-concessionaria.ts';

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};

const iso = (b: string) => {
  const c = lerCompetencia(b);
  return c ? competenciaEmIso(c) : null;
};

// ------------------------------------------------- K1 os tres formatos entram
{
  chk('K1a', iso('05/2026') === '2026-05-01', 'MM/AAAA — o que a pessoa digita');
  chk('K1b', iso('2026-05') === '2026-05-01', 'AAAA-MM — o que o banco guarda');
  chk('K1c', iso('MAI/2026') === '2026-05-01', 'MMM/AAAA — o que a Equatorial IMPRIME');
  chk('K1d', iso('2026-05-01') === '2026-05-01', 'AAAA-MM-DD: o dia vem e e ignorado, a competencia E o mes');
}

// ------------------------------------- K2 as doze abreviacoes, uma por uma
{
  // A tabela inteira e nao uma amostra: um mes trocado no mapa poe a conta do
  // cliente na competencia errada, e o erro sai como "ja registrado" no mes que
  // nao e o dele - sem nada falhar.
  const esperado = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const nomes = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const lidos = nomes.map((n) => lerCompetencia(`${n}/2026`)?.mes ?? '--');
  chk('K2a', JSON.stringify(lidos) === JSON.stringify(esperado),
      `os doze meses por extenso mapeiam na ordem certa (lidos: ${lidos.join(' ')})`);
  chk('K2b', Object.keys(MES_POR_EXTENSO).length === 12, 'o mapa tem exatamente doze entradas');
}

// ----------------------------- K3 OS DOIS CAMINHOS CONCORDAM — o que a copia quebrava
{
  // O caminho oficial (registro-unificado) e o caminho da leitura pura
  // (fatura-concessionaria) precisam dar a MESMA competencia para o mesmo
  // texto. Enquanto eram duas copias, `MAI/2026` passava num e era recusado no
  // outro — e o recusado era o que grava a conta lida.
  const camposMinimos = (mes: string) => ({
    numero_uc: '000091584701207',
    competencia: mes,
    fio_b: '10,00',
    iluminacao_publica: '5,00',
    encargos: '0,00',
  });

  for (const bruto of ['05/2026', '2026-05', 'MAI/2026']) {
    const pelaLeitura = lerFaturaDaConcessionaria(camposMinimos(bruto));
    const oficial = primeiroDiaDaCompetencia(bruto).toISOString().slice(0, 10);
    const daLeitura = pelaLeitura.ok ? pelaLeitura.leitura.competencia : `RECUSOU: ${JSON.stringify(pelaLeitura.erros)}`;
    chk('K3', daLeitura === oficial && oficial === '2026-05-01',
        `"${bruto}" da a mesma competencia nos dois caminhos (oficial ${oficial} · leitura ${daLeitura})`);
  }
}

// ------------------------------------------- K4 o que NAO passa continua nao passando
{
  const recusa = (b: string) => lerCompetencia(b) === null;
  chk('K4a', recusa(''), 'vazio nao e competencia');
  chk('K4b', recusa('13/2026'), 'mes 13 nao existe');
  chk('K4c', recusa('00/2026'), 'mes 00 nao existe');
  chk('K4d', recusa('XXX/2026'), 'abreviacao que nao e mes e recusada, e nao vira mes 1');
  chk('K4e', recusa('2026'), 'ano sozinho nao e competencia — falta o mes');
  chk('K4f', recusa('maio'), 'mes sem ano e recusado');

  // A recusa do caminho oficial continua sendo EXCECAO NOMEADA, e nao `null`
  // silencioso: quem grava precisa parar, nao gravar no mes errado.
  let levantou = '';
  try { primeiroDiaDaCompetencia('XXX/2026'); } catch (e) { levantou = (e as Error).name; }
  chk('K4g', levantou === 'CompetenciaIlegivel',
      `o caminho oficial LEVANTA em vez de devolver null (levantou: ${levantou || 'nada'})`);

  const msg = new CompetenciaIlegivel('XXX/2026').message;
  chk('K4h', msg.includes(FORMATOS_DA_COMPETENCIA),
      'a mensagem de recusa lista os tres formatos aceitos, e nao dois');
  chk('K4i', msg.includes('MAI/2026'),
      'a mensagem mostra o formato da Equatorial como exemplo — e o que a pessoa tem na mao');
}

// ------------------------------------------ K5 tolerancias de digitacao e layout
{
  chk('K5a', iso('mai/2026') === '2026-05-01', 'minuscula passa — o layout nem sempre vem em caixa alta');
  chk('K5b', iso('MAI./2026') === '2026-05-01', 'o ponto da abreviacao e opcional');
  chk('K5c', iso('MAIO/2026') === '2026-05-01', 'o nome inteiro passa: so os tres primeiros decidem');
  chk('K5d', iso('  MAI/2026  ') === '2026-05-01', 'espaco em volta nao muda a competencia');
  chk('K5e', iso('MAR/2026') === '2026-03-01' && iso('MÁR/2026') === '2026-03-01',
      'acento e retirado antes da consulta — outro layout pode trazer o til');
}

// ------------------------------------------------------ K6 as duas saidas
{
  const c = lerCompetencia('MAI/2026')!;
  chk('K6a', competenciaEmIso(c) === '2026-05-01', 'a saida do banco e o PRIMEIRO DIA (CHECK da migration 29)');
  chk('K6b', competenciaEmBr(c) === '05/2026', 'a saida da tela e MM/AAAA, ja normalizada');
  chk('K6c', competenciaEmBr(lerCompetencia('2026-5')! ?? { ano: '', mes: '' }) === '05/2026'
          || lerCompetencia('2026-5') === null,
      'AAAA-M com um digito so: ou normaliza, ou recusa — nunca inventa mes');
}

console.log(falhas === 0 ? '\nEXIT=0' : `\nFALHAS: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
