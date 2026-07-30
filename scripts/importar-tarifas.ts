// IMPORTACAO das tarifas da concessionaria, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run --silent tarifas -- --modelo > tarifas.csv
//        o `--silent` NAO e enfeite: sem ele o npm escreve o proprio cabecalho
//        no stdout e o arquivo sai com lixo na primeira linha.
//   npm run tarifas -- --ensaio  --auth-user <uuid> --competencia 2026-08 --arquivo tarifas.csv
//   npm run tarifas -- --valendo --auth-user <uuid> --competencia 2026-08 --arquivo tarifas.csv
//
// DE ONDE ISTO VEM: `Q-TARIFA-CONC-01`. O `PRD` §5.1 diz que os dados da
// Equatorial entram "por planilha ou lancamento manual" e que nao ha API da
// distribuidora. A coluna existia, a rota existia - e a rota pede o ID DA
// FATURA, que ninguem tem na mao. "Por planilha" significava, na pratica, abrir
// uma fatura por vez na tela e digitar.
//
// POR QUE O ENSAIO E O MODO QUE IMPORTA AQUI, mais do que nos outros scripts. O
// risco desta importacao nao e falhar - e ACERTAR a leitura errada. "1.234" e um
// numero valido lido de dois jeitos, e a fatura sai certa nos dois. Por isso o
// ensaio imprime a INTERPRETACAO de cada linha ao lado do texto original:
//
//     linha 4   000406456101252   "1.234"  ->  R$ 1.234,00
//
// Conferir isso e barato antes e caro depois: `lancarTarifasPorUC` so aceita
// rascunho, entao o conserto depois de emitir passa por cancelar a fatura.
//
// A REGRA E A MESMA DO CADASTRO DE ORIGINADORES: o arquivo INTEIRO e conferido
// antes de qualquer escrita, e uma linha ilegivel aborta tudo nomeando a linha.
// Um lote meio gravado exigiria saber quais entraram, e o banco nao guarda o
// arquivo.

import { readFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import { lancarTarifasPorUC, type ResultadoDoLancamento } from '../src/repos/fatura.ts';
import { lerPlanilhaDeTarifas, MODELO_DE_PLANILHA } from '../src/dominio/planilha-tarifas.ts';
import { emReais, type Centavos } from '../src/dominio/centavos.ts';

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

async function main(): Promise<void> {
  if (tem('modelo')) { process.stdout.write(MODELO_DE_PLANILHA); return; }

  const ensaio = tem('ensaio'), valendo = tem('valendo');
  if (ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    process.exit(2);
  }
  const authUserId = arg('auth-user');
  if (!authUserId) { console.error('ERRO: --auth-user <uuid> e obrigatorio.'); process.exit(2); }

  const competencia = arg('competencia');
  if (!competencia || !/^\d{4}-\d{2}(-01)?$/.test(competencia)) {
    console.error('ERRO: --competencia AAAA-MM e obrigatorio.');
    console.error('Nao ha "mes corrente" por default, pelo mesmo motivo do `faturar`: a competencia');
    console.error('governa a receita (PAUTA-contador 1), e erra-la poe dinheiro no mes errado.');
    process.exit(2);
  }
  const caminho = arg('arquivo');
  if (!caminho) {
    console.error('ERRO: --arquivo <caminho.csv> e obrigatorio. `--modelo` imprime o formato.');
    process.exit(2);
  }

  let conteudo: string;
  try {
    conteudo = readFileSync(caminho, 'utf8');
  } catch (e) {
    console.error(`ERRO ao ler ${caminho}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  const p = lerPlanilhaDeTarifas(conteudo);

  if (p.erros.length > 0) {
    console.error(`\n== ${p.erros.length} problema(s) no arquivo. NADA foi gravado. ==\n`);
    for (const e of p.erros) console.error(`  linha ${String(e.linha).padStart(4)}: ${e.motivo}`);
    console.error('');
    process.exit(1);
  }
  if (p.linhas.length === 0) {
    console.error('ERRO: o arquivo nao tem nenhuma linha de dado.');
    process.exit(1);
  }

  // A INTERPRETACAO, ANTES DE TUDO. E o unico jeito de pegar o "1.234" lido como
  // R$ 1,23 - as duas leituras produzem uma fatura que parece certa.
  console.log(`\n== ${p.linhas.length} linha(s) lida(s)${p.cabecalho ? ', 1 cabecalho' : ''}`
              + `${p.vazias > 0 ? `, ${p.vazias} vazia(s)` : ''} ==`);
  console.log('== confira a INTERPRETACAO de cada valor antes de seguir ==\n');
  for (const l of p.linhas) {
    console.log(`  linha ${String(l.linha).padStart(4)}  ${l.numero_uc.padEnd(20)} `
                + `${JSON.stringify(l.bruto).padEnd(14)} -> ${emReais(l.centavos)}`);
  }
  const total = p.linhas.reduce((s, l) => s + l.centavos, 0);
  console.log(`\n  total do arquivo: ${emReais(total)}`);
  console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);

  const porUC = new Map<string, Centavos>(p.linhas.map((l) => [l.numero_uc, l.centavos]));

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`${sessao.nome} <${sessao.email}>\n`);

  let r: ResultadoDoLancamento;
  try {
    r = await a.withTenant(sessao, arg('tenant'), async () => {
      const feito = await lancarTarifasPorUC(competencia, porUC);
      if (ensaio) throw new RollbackDoEnsaio(feito);
      return feito;
    }) as ResultadoDoLancamento;
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) { r = e.valor as ResultadoDoLancamento; }
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log('--- resultado ---');
  console.log(`  competencia .......... ${r!.competencia}`);
  console.log(`  aplicadas ............ ${r!.aplicadas.length}`);
  console.log(`  sem fatura ........... ${r!.sem_fatura.length}`);
  console.log(`  rascunho sem valor ... ${r!.sem_valor.length}`);

  if (r!.sem_fatura.length > 0) {
    console.log('\n  UC da planilha SEM fatura em rascunho nesta competencia:');
    for (const s of r!.sem_fatura) console.log(`    ${s.numero_uc.padEnd(20)} ${emReais(s.centavos)}  ${s.porque}`);
  }
  if (r!.sem_valor.length > 0) {
    /*
     * AUSENTE NAO E ZERO, e por isso esta lista existe e nao e uma linha de
     * contagem. Uma fatura que a planilha nao cobriu FICA com o valor que tinha -
     * o script nao zera nada -, e quem decide se falta dado da distribuidora ou
     * se aquela UC nao tem tarifa e uma pessoa.
     */
    console.log('\n  Fatura em RASCUNHO que a planilha NAO cobriu (ficaram como estavam):');
    for (const s of r!.sem_valor) {
      console.log(`    ${s.numero_uc.padEnd(20)} continua em ${emReais(s.centavos_atuais)}`);
    }
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${r!.aplicadas.length} teriam sido lancadas. Nada foi gravado. ==`
    : `\n== COMMIT. ${r!.aplicadas.length} fatura(s) com a tarifa da concessionaria lancada. ==`);

  if (!ensaio && r!.aplicadas.length > 0) {
    console.log('\n   O total da fatura e coluna GERADA: consumo + concessionaria + juros.');
    console.log('   Conferir na tela de Faturas antes de emitir - depois de emitida o');
    console.log('   boleto carrega o total, e a correcao passa por cancelar a fatura.');
  }

  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
