// A COMPOSICAO do faturamento: o unico lugar que liga sessao, tenant e o motor
// de composicao do lote.
//
// USO
//   npm run faturar -- --prontidao --competencia 2026-07 --auth-user <uuid> [--tenant <uuid>]
//   npm run faturar -- --ensaio  --competencia 2026-07 --auth-user <uuid> [--tenant <uuid>]
//   npm run faturar -- --valendo --competencia 2026-07 --auth-user <uuid> [--tenant <uuid>]
//
// `--ensaio` e `--valendo` sao OBRIGATORIOS e nao ha default, pelo mesmo motivo
// do `ciclo` e do bootstrap: um lote que grava porque alguem esqueceu uma flag e
// o modo de falha errado - e aqui o erro nao e uma linha a mais no banco, e
// cobranca emitida para a carteira inteira.
//
// A ENTRADA E O `auth_user_id`, nao o usuario interno, porque este script usa o
// MESMO caminho da aplicacao: `app.login()` resolve a identidade e os vinculos, e
// `app.withTenant()` confere o tenant proposto contra a lista que o login
// devolveu. Um script que montasse contexto por fora seria um segundo caminho de
// isolamento, e a SPEC-001 3.2 existe para nao haver um segundo.
//
// O ENSAIO NAO E UM ROLLBACK, e a diferenca importa. `ensaiarLote()` roda a
// triagem e nao chega a escrever - ele NAO exercita o INSERT. Isso e diferente do
// `--ensaio` do ciclo, que executa o caminho de escrita inteiro e desfaz. Aqui o
// caminho de escrita e uma unica instrucao por UC, coberta por 31 verificacoes
// ponta a ponta, e a decisao de faturar e sobre QUEM entra - que e exatamente o
// que a triagem responde.
//
// O que o ensaio prova, entao: quantas UCs virariam fatura, quantas nao viram e
// POR QUE cada uma nao vira. Nao prova que o INSERT funciona contra este banco.

import { iniciar, encerrarApp } from '../src/app.ts';
import * as fatura from '../src/repos/fatura.ts';
import { prontidao } from '../src/repos/prontidao.ts';
import { emReais } from '../src/dominio/centavos.ts';

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tem = (nome: string) => process.argv.includes(`--${nome}`);

/**
 * O relatorio de PRONTIDAO, e ele responde outra pergunta que a do ensaio.
 *
 * O ensaio diz "esta UC entra?" e devolve UM motivo por UC - a triagem da R32
 * para no primeiro que impede de existir, de proposito. Isso e o certo para
 * diagnosticar uma UC e insuficiente para planejar: o primeiro ensaio contra
 * producao devolveu "35 sem_contrato_vigente" e havia mais tres camadas vazias
 * atras, que so apareceriam uma a uma, um ensaio por vez.
 *
 * Este mostra as nove de uma vez, e nao decide nenhuma delas.
 */
async function relatorioDeProntidao(a: any, sessao: any, tenantProposto: string | undefined, competencia: string) {
  const p = await a.withTenant(sessao, tenantProposto, () => prontidao(competencia));

  console.log('--- prontidao para faturar ---');
  console.log(`  competencia .... ${p.competencia}`);
  console.log(`  UCs ativas ..... ${p.ucs_ativas}`);
  console.log(`  pode faturar ... ${p.pode_faturar ? 'SIM' : 'NAO'}`);
  console.log(`  pode repartir .. ${p.pode_repartir ? 'SIM' : 'NAO'}\n`);

  const larg = Math.max(...p.camadas.map((c: any) => c.camada.length));
  for (const c of p.camadas) {
    const marca = c.situacao === 'nao_medido' ? '?'
                : c.situacao === 'ok' ? 'ok'
                : c.efeito === 'bloqueia_fatura' ? 'FALTA' : 'split';
    console.log(`  ${marca.padEnd(6)} ${c.camada.padEnd(larg)}  ${String(c.faltam).padStart(4)} de ${String(c.total).padStart(4)}` +
                `${c.faltam === 0 ? '' : `   [${c.dono}${c.questao ? ` · ${c.questao}` : ''}]`}`);
  }

  const pendentes = p.camadas.filter((c: any) => c.situacao !== 'ok');
  if (pendentes.length > 0) {
    console.log('\n--- o que cada pendencia significa ---');
    for (const c of pendentes) {
      const cabeca = c.situacao === 'nao_medido'
        ? `${c.camada} (NAO MEDIDO - o universo depende de contrato, e nao ha contrato)`
        : `${c.camada} (${c.faltam} de ${c.total})`;
      console.log(`\n  ${cabeca}:\n    ${c.explicacao}`);
    }
  } else {
    console.log('\n  Nenhuma camada pendente. `--ensaio` mostra quantas faturas sairiam.');
  }
  console.log('\n== PRONTIDAO. Leitura pura, nada foi gravado. ==');
}

async function main(): Promise<void> {
  const prontidaoSo = tem('prontidao');
  const ensaio = tem('ensaio');
  const valendo = tem('valendo');
  if (!prontidaoSo && ensaio === valendo) {
    console.error('ERRO: informe --prontidao (o que falta), --ensaio (nao escreve) ou --valendo (grava).');
    process.exit(2);
  }

  const authUserId = arg('auth-user');
  if (!authUserId) {
    console.error('ERRO: --auth-user <uuid> e obrigatorio (o `sub` do JWT do Supabase Auth).');
    console.error('O faturamento roda DENTRO de contexto de tenant: nao ha caminho privilegiado,');
    console.error('e excecao de isolamento e ausencia de isolamento.');
    process.exit(2);
  }

  const comp = arg('competencia');
  if (!comp) {
    console.error('ERRO: --competencia AAAA-MM e obrigatoria. Nao ha "mes corrente" por default:');
    console.error('a competencia so fecha quando a geracao e medida, e a medicao chega depois do');
    console.error('mes virar - "hoje" faturaria o mes errado em toda virada.');
    process.exit(2);
  }
  const competencia = /^\d{4}-\d{2}$/.test(comp) ? `${comp}-01` : comp;
  const tenantProposto = arg('tenant');

  const modo = prontidaoSo ? 'PRONTIDAO (leitura pura)' : ensaio ? 'ENSAIO (nao escreve)' : 'VALENDO (grava)';
  console.log(`\n== modo: ${modo} · competencia ${competencia} ==\n`);

  // iniciar() recusa o arranque se a role de runtime tiver BYPASSRLS.
  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`financeiro: ${sessao.nome} <${sessao.email}>, tier=${sessao.tier ?? '(nenhum)'}, ` +
              `tenants=${sessao.tenants.map((t) => t.papel).join(',') || '(nenhum)'}\n`);

  if (prontidaoSo) {
    await relatorioDeProntidao(a, sessao, tenantProposto, competencia);
    await encerrarApp();
    return;
  }

  const r = await a.withTenant(sessao, tenantProposto, () =>
    ensaio ? fatura.ensaiarLote(competencia) : fatura.comporLote(competencia));

  console.log('--- resultado ---');
  console.log(`  competencia .... ${r.competencia}`);
  console.log(`  faturas ........ ${ensaio ? 'a criar' : 'criadas'} ${r.criadas}`);
  console.log(`  recusadas ...... ${r.recusadas}`);

  if (Object.keys(r.recusas).length > 0) {
    console.log('  recusas por motivo:');
    for (const [motivo, n] of Object.entries(r.recusas).sort((x, y) => y[1] - x[1])) {
      console.log(`    ${String(n).padStart(3)}  ${motivo}`);
    }
  }
  if (Object.keys(r.alertas).length > 0) {
    // ALERTA NAO E RECUSA: a fatura vale e foi (ou seria) gravada. A distincao e
    // a mesma do conector - recusa significa "nada foi gravado", alerta significa
    // "foi gravado, e alguem precisa olhar".
    console.log('  alertas (faturam, e alguem precisa olhar):');
    for (const [alerta, n] of Object.entries(r.alertas)) console.log(`    ${String(n).padStart(3)}  ${alerta}`);
  }

  if (r.detalhe.length > 0) {
    console.log('\n--- por que cada uma nao entra ---');
    // Agrupa por motivo: com 35 UCs a lista linha a linha esconde o padrao, e o
    // padrao e o que diz onde esta o trabalho.
    const porMotivo = new Map<string, string[]>();
    for (const d of r.detalhe) {
      if (!porMotivo.has(d.motivo)) porMotivo.set(d.motivo, []);
      porMotivo.get(d.motivo)!.push(d.numero_uc);
    }
    for (const [motivo, ucs] of porMotivo) {
      console.log(`\n  ${motivo} (${ucs.length}):`);
      console.log(`    ${fatura.EXPLICACAO[motivo as keyof typeof fatura.EXPLICACAO]}`);
      console.log(`    UCs: ${ucs.slice(0, 12).join(', ')}${ucs.length > 12 ? `, +${ucs.length - 12}` : ''}`);
    }
  }

  if (!ensaio && r.criadas > 0) {
    const fs = await a.withTenant(sessao, tenantProposto, () => fatura.daCompetencia(competencia));
    const total = fs.reduce((s, f) => s + (f.valor_total_centavos ?? 0), 0);
    console.log(`\n  faturado na competencia: ${emReais(total)} em ${fs.length} fatura(s), todas em RASCUNHO.`);
    console.log('  Compor e emitir sao atos separados (PRD 9): confira antes de emitir.');

    /*
     * SAO TRES PASSOS E NAO DOIS, e ate 06/08 nenhum documento dizia isso.
     *
     * `valor_total_centavos` e coluna GERADA e a tarifa da concessionaria tem
     * default 0: sem o lancamento, este lote emite cobrando SO o credito - sem
     * erro, sem log e sem recusa. E `lancarTarifasPorUC` so aceita RASCUNHO,
     * entao a janela e agora. Depois de emitida, corrigir e cancelar.
     *
     * Isto CONTA e nao decide (regra 10): zero pode ser o valor certo, e essa e
     * a pergunta (a) da `Q-TARIFA-CONC-01`, que tem dono e nao e este script.
     */
    const semTarifa = fs.filter((f) => !f.valor_tarifas_concessionaria_centavos).length;
    console.log(`\n  tarifa da concessionaria lancada em ${fs.length - semTarifa} de ${fs.length}.`);
    if (semTarifa > 0) {
      console.log(`  ATENCAO: ${semTarifa} fatura(s) sairiam cobrando SO o credito injetado.`);
      console.log('  A ordem e:  compor  ->  npm run tarifas  ->  emitir');
      console.log('  Lancar tarifa so funciona em RASCUNHO. Se esta competencia realmente nao');
      console.log('  leva tarifa da distribuidora, emitir esta certo - Q-TARIFA-CONC-01 (a).');
    }
  }

  if (ensaio) {
    console.log('\n== ENSAIO. Nada foi gravado. ==');
    console.log('   A triagem rodou de verdade e os numeros sao reais; o INSERT nao foi executado.');
  }

  await encerrarApp();
}

main().catch(async (e) => {
  console.error('\nERRO:', e?.message ?? e);
  await encerrarApp().catch(() => {});
  process.exit(1);
});
