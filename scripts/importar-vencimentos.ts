// IMPORTACAO do DIA DE VENCIMENTO das UCs, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run vencimentos -- --modelo --auth-user <uuid> --saida vencimentos.csv
//        O modelo sai PREENCHIDO com as UCs reais e a coluna do dia em branco -
//        e a diferenca que faz o passo 2 do caminho critico caber numa tarde em
//        vez de numa digitacao de 39 numeros de 15 digitos.
//
//        `--saida` E OBRIGATORIO, E NAO E PREFERENCIA DE ESTILO. Medido em
//        03/08: `iniciar()` imprime duas linhas em STDOUT antes de qualquer
//        consulta ("conectado como app_financeiro_login...", "client gerado
//        cobre as 30 tabelas"), e o `npm` acrescenta as dele. Um CSV montado por
//        redirecionamento (`> arquivo.csv`) nasce com essas linhas no topo - e
//        o proprio importador o recusa depois, dizendo que falta ";" na linha 1.
//        Um comando que produz um arquivo que o comando seguinte rejeita e uma
//        armadilha, e `--silent` so a esconde ate alguem esquece-lo.
//   npm run vencimentos -- --ensaio  --auth-user <uuid> --arquivo vencimentos.csv
//   npm run vencimentos -- --valendo --auth-user <uuid> --arquivo vencimentos.csv
//
// DE ONDE ISTO VEM: `Q-SPEC001-02`, respondida pelo dono em 03/08/2026 - o dia
// de vencimento **varia por cliente/UC**. Nao e um `UPDATE`, e uma planilha.
//
// O QUE O ENSAIO IMPRIME, E POR QUE E OUTRA COISA QUE NO IMPORTADOR DE TARIFAS.
// La o risco e a escala ("1.234" virando R$ 1,23). Aqui o numero e pequeno e o
// intervalo e curto, entao o ensaio mostra o que de fato pode surpreender:
//
//   - o dia ANTES e DEPOIS, por UC, para a segunda passada ser obviamente vazia;
//   - as UCs que a planilha NAO cobriu, porque ausente nao e zero e o
//     lancamento nao apaga o que nao veio;
//   - as UCs com dia 29, 30 ou 31, que sao VALIDAS e caem no ultimo dia do mes
//     em fevereiro - quem digitou precisa ver isso antes, nao em marco.

import { readFileSync, writeFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import { lancarVencimentosPorUC, type ResultadoDosVencimentos } from '../src/repos/unidade_consumidora.ts';
import {
  lerPlanilhaDeVencimentos, montarModeloDeVencimentos, MODELO_DE_VENCIMENTOS,
  type LinhaDoModelo,
} from '../src/dominio/planilha-vencimentos.ts';
import { db } from '../src/db/contexto.ts';

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

async function main(): Promise<void> {
  const modelo = tem('modelo');
  const ensaio = tem('ensaio'), valendo = tem('valendo');

  if (!modelo && ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    console.error('       ou --modelo, que so LE e imprime o CSV para preencher.');
    process.exit(2);
  }

  const saida = arg('saida');
  if (modelo && !saida) {
    // Sem banco nao ha o que consultar: o modelo de exemplo vale, e sai no stdout
    // porque nao ha nada mais no stdout deste caminho - `iniciar()` nem roda.
    if (!arg('auth-user')) { process.stdout.write(MODELO_DE_VENCIMENTOS); return; }
    console.error('ERRO: --modelo com --auth-user exige --saida <arquivo.csv>.');
    console.error('       O arranque imprime duas linhas no stdout, e um CSV feito por');
    console.error('       redirecionamento nasceria com elas no topo - o proprio importador');
    console.error('       o recusaria depois, dizendo que falta ";" na linha 1.');
    process.exit(2);
  }

  const authUserId = arg('auth-user');
  if (!authUserId) {
    console.error('ERRO: --auth-user <uuid> e obrigatorio.');
    process.exit(2);
  }

  const a = await iniciar();
  const sessao = await a.login(authUserId);

  /*
   * O MODELO PREENCHIDO. Le e nao escreve - e a razao de ele viver aqui e nao
   * numa consulta solta: passa pelo contexto de tenant e pela RLS como todo o
   * resto, entao o arquivo que sai e o das UCs DAQUELE tenant.
   */
  if (modelo) {
    /*
     * O PREDICADO DE `fatura` E O MESMO DA TRIAGEM E DA PRONTIDAO, copiado de
     * `src/repos/prontidao.ts`: UC espelhada do CRM (`crm_usina_cliente_id`
     * preenchido) so fatura com o rateio `ativado`; UC criada a mao continua
     * contando, porque o CRM nao tem opiniao sobre ela.
     *
     * Espelho de regra tem modo de falha proprio - divergir sem que nenhum dos
     * dois lados pareca errado -, e por isso a `M2f` compara esta coluna contra
     * o que a triagem recusa, e nao contra um numero meu.
     */
    const linhas: any[] = await a.withTenant(sessao, arg('tenant'), async () => db().$queryRaw`
      SELECT uc.numero_uc, c.nome AS cliente,
             coalesce(us.codigo_geradora, '') AS usina,
             uc.percentual_rateio::text AS rateio,
             uc.status::text AS status,
             coalesce(uc.rateio_situacao::text, '') AS situacao_crm,
             (uc.status = 'ativa'
              AND (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado')) AS fatura,
             CASE WHEN uc.data_vencimento IS NULL THEN ''
                  ELSE to_char(uc.data_vencimento, 'DD') END AS dia_atual
        FROM unidade_consumidora uc
        JOIN cliente c  ON c.tenant_id = uc.tenant_id AND c.id = uc.cliente_id
        LEFT JOIN usina us ON us.tenant_id = uc.tenant_id AND us.id = uc.usina_id
       WHERE uc.status <> 'cancelada'`) as any[];

    const modeladas: LinhaDoModelo[] = linhas.map((l) => ({
      numero_uc: l.numero_uc, dia_atual: l.dia_atual, cliente: l.cliente,
      usina: l.usina, rateio: l.rateio ?? '', status: l.status,
      situacao_crm: l.situacao_crm, fatura: l.fatura === true,
    }));
    writeFileSync(saida!, montarModeloDeVencimentos(modeladas), 'utf8');

    const faturaveis = modeladas.filter((l) => l.fatura);
    const semDia = faturaveis.filter((l) => !l.dia_atual).length;

    console.log(`\n== ${linhas.length} UC(s) nao canceladas, escritas em ${saida} ==`);
    console.log(`   ${faturaveis.length} FATURAM hoje e vem primeiro; ${modeladas.length - faturaveis.length} nao,`);
    console.log('   e vao marcadas com NAO na coluna `fatura` - o rateio delas nao esta ativado no CRM,');
    console.log('   entao a triagem as recusa por `rateio_nao_ativado` ANTES de olhar o vencimento.');
    console.log(`   ${semDia} das ${faturaveis.length} que faturam estao SEM dia hoje - e o trabalho.`);
    console.log('\n   Preencha a coluna dia_vencimento e importe com --ensaio.');
    console.log('   As demais colunas sao so para voce saber qual linha e qual - o importador');
    console.log('   le as duas primeiras e ignora o resto.\n');
    await encerrarApp();
    return;
  }

  const caminho = arg('arquivo');
  if (!caminho) {
    console.error('ERRO: --arquivo <caminho.csv> e obrigatorio. `--modelo` imprime o formato preenchido.');
    await encerrarApp();
    process.exit(2);
  }

  let conteudo: string;
  try {
    conteudo = readFileSync(caminho, 'utf8');
  } catch (e) {
    console.error(`ERRO ao ler ${caminho}: ${e instanceof Error ? e.message : String(e)}`);
    await encerrarApp();
    process.exit(2);
  }

  const p = lerPlanilhaDeVencimentos(conteudo);

  /*
   * O ARQUIVO INTEIRO ANTES DE QUALQUER ESCRITA, como em
   * `cadastrar-originadores.ts` e `importar-tarifas.ts`. Um lote meio gravado
   * exigiria saber quais entraram, e o banco nao guarda o arquivo.
   */
  if (p.erros.length > 0) {
    console.error(`\n== ${p.erros.length} problema(s) no arquivo. NADA foi gravado. ==\n`);
    for (const e of p.erros) console.error(`  linha ${String(e.linha).padStart(4)}: ${e.motivo}`);
    console.error('');
    await encerrarApp();
    process.exit(1);
  }
  if (p.linhas.length === 0) {
    console.error('ERRO: o arquivo nao tem nenhuma linha de dado.');
    await encerrarApp();
    process.exit(1);
  }

  console.log(`\n== ${p.linhas.length} linha(s) lida(s)${p.cabecalho ? ', 1 cabecalho' : ''}`
              + `${p.vazias > 0 ? `, ${p.vazias} vazia(s)` : ''} ==`);
  console.log(`== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);
  console.log(`${sessao.nome} <${sessao.email}>\n`);

  const porUC = new Map<string, number>(p.linhas.map((l) => [l.numero_uc, l.dia as number]));

  let r: ResultadoDosVencimentos;
  try {
    r = await a.withTenant(sessao, arg('tenant'), async () => {
      const feito = await lancarVencimentosPorUC(porUC);
      if (ensaio) throw new RollbackDoEnsaio(feito);
      return feito;
    }) as ResultadoDosVencimentos;
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) { r = e.valor as ResultadoDosVencimentos; }
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log('--- resultado ---');
  console.log(`  aplicadas ........ ${r!.aplicadas.length}`);
  console.log(`  inalteradas ...... ${r!.inalteradas.length}  (ja tinham esse dia)`);
  console.log(`  UC nao encontrada  ${r!.sem_uc.length}`);
  console.log(`  nao cobertas ..... ${r!.nao_cobertas.length}`);

  if (r!.aplicadas.length > 0) {
    console.log('\n  o que MUDA (antes -> depois):');
    for (const x of r!.aplicadas) {
      console.log(`    ${x.numero_uc.padEnd(20)} ${String(x.antes ?? '(vazio)').padStart(7)} -> dia ${x.dia}`);
    }
  }

  // Os dias 29/30/31 sao validos e nao sao erro - mas quem digitou precisa saber
  // agora, e nao em fevereiro, que eles caem no ultimo dia do mes curto.
  const curtos = p.linhas.filter((l) => l.mesCurtoAfeta);
  if (curtos.length > 0) {
    console.log(`\n  ${curtos.length} UC(s) com dia 29, 30 ou 31 - VALIDO, e em mes curto cai no ULTIMO dia:`);
    for (const l of curtos) console.log(`    ${l.numero_uc.padEnd(20)} dia ${l.dia}`);
  }

  if (r!.sem_uc.length > 0) {
    console.log('\n  UC da planilha que NAO existe no cadastro (ou esta cancelada):');
    for (const s of r!.sem_uc) console.log(`    ${s.numero_uc.padEnd(20)} dia ${s.dia}`);
  }

  if (r!.nao_cobertas.length > 0) {
    /*
     * AUSENTE NAO E ZERO. A UC que a planilha nao cobriu FICA como estava - o
     * script nao apaga vencimento nenhum -, e quem decide se falta linha no
     * arquivo ou se aquela UC nao deve vencer e uma pessoa.
     */
    console.log('\n  UC do cadastro que a planilha NAO cobriu (ficaram como estavam):');
    for (const s of r!.nao_cobertas) {
      console.log(`    ${s.numero_uc.padEnd(20)} ${s.fatura ? '     ' : '(nao fatura) '}` +
                  `${s.dia_atual === null ? 'SEM vencimento' : `continua no dia ${s.dia_atual}`}`);
    }
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${r!.aplicadas.length} teriam sido gravadas. Nada foi gravado. ==`
    : `\n== COMMIT. ${r!.aplicadas.length} UC(s) com dia de vencimento gravado. ==`);

  /*
   * SO AS FATURAVEIS SAO PENDENCIA. A UC com rateio nao ativado no CRM para na
   * recusa `rateio_nao_ativado`, que vem ANTES de `sem_vencimento` na ordem da
   * triagem - o dia dela nao muda nada hoje. Contar as duas juntas foi o que
   * fez o alerta da tela dizer "41 unidades ativas sem dia de vencimento"
   * (`RESUMO-SESSAO-20` §4.3), mandando preencher doze que nao faturariam.
   */
  const faltando = r!.nao_cobertas.filter((x) => x.dia_atual === null);
  const faltandoQueFatura = faltando.filter((x) => x.fatura);
  if (!ensaio && faltandoQueFatura.length > 0) {
    console.log(`\n   ATENCAO: ${faltandoQueFatura.length} UC(s) QUE FATURAM seguem SEM vencimento. Na composicao`);
    console.log('   do lote elas viram recusa contada `sem_vencimento` - depois das quatro que vem antes.');
  }
  if (!ensaio && faltando.length > faltandoQueFatura.length) {
    console.log(`\n   (${faltando.length - faltandoQueFatura.length} outra(s) sem vencimento NAO faturam hoje - o rateio delas nao esta`);
    console.log('   ativado no CRM. Elas param na recusa anterior, e o dia nao e trabalho pendente.)');
  }

  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
