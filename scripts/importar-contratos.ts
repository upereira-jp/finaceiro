// IMPORTACAO DOS CONTRATOS, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run contratos -- --modelo  --auth-user <uuid> --saida contratos.csv [--sem-crm]
//   npm run contratos -- --ensaio  --auth-user <uuid> --arquivo contratos.csv
//   npm run contratos -- --valendo --auth-user <uuid> --arquivo contratos.csv
//
//        `--saida` E OBRIGATORIO no modelo, pela mesma razao medida em 03/08 nos
//        outros dois importadores: `iniciar()` imprime duas linhas em STDOUT
//        antes de qualquer consulta, e um CSV feito por redirecionamento nasce
//        com elas no topo - o proprio importador o recusa depois.
//
// DE ONDE ISTO VEM. O passo 6 do caminho para a primeira fatura sao os 29
// contratos, e ele era o unico insumo em massa deste projeto sem importador. A
// razao de existir nao e digitar mais rapido:
//
//   `contrato` NAO TEM EDICAO. A R20-b congela `originador_tipo_no_fechamento`
//   no `rascunhar`, e nem originador, nem data de fechamento, nem valor mudam
//   depois. Conserto = `encerrar` + `renovar`, que abre linha nova, zera
//   `faturas_cheias_pagas` e deixa na trilha uma renovacao que nao houve.
//
// Vinte e nove atos irreversiveis precisam de um ponto em que sejam revisaveis
// de uma vez. Esse ponto e o arquivo, e o `--ensaio` e onde ele se le.
//
// O QUE O ENSAIO IMPRIME, E POR QUE E OUTRA COISA QUE NAS OUTRAS TRES PLANILHAS.
// Em tarifas o risco e a escala; em vencimentos, o dia curto; em documentos, a
// colisao. Aqui o risco e a celula plausivel que muda QUEM RECEBE DINHEIRO e nao
// produz erro em lugar nenhum depois. Entao o ensaio mostra, por linha:
//
//   - o NOME do originador e o TIER que vai congelar, nao o uuid;
//   - a data de fechamento interpretada ao lado do texto digitado, e um aviso
//     quando ela esta no futuro - o que torna TODA fatura parcial, em silencio;
//   - o valor em reais a partir dos centavos que serao gravados;
//   - e quem NAO entra, com o motivo, separando quem fatura de quem nao fatura.

import { readFileSync, writeFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import {
  lancarContratosPorUC, type ResultadoDosContratos, type ContratoDaPlanilha,
} from '../src/repos/contrato.ts';
import {
  lerPlanilhaDeContratos, montarModeloDeContratos, fechamentoNoFuturo,
  MODELO_DE_CONTRATOS, type LinhaDoModeloDeContrato,
} from '../src/dominio/planilha-contratos.ts';
import { emReais } from '../src/dominio/centavos.ts';
import { crmDoAmbiente, conferirRoleDeLeitura } from '../src/crm/conexao.ts';
import { criarLeitorCrm } from '../src/crm/leitura.ts';

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** "1130.00" (numeric do CRM, que chega como string) -> "1130,00" para a celula.
 *  Por TEXTO, sem passar por float: a regra 1 vale na saida tambem. */
const paraCelulaEmReais = (numerico: string | null): string =>
  numerico === null ? '' : String(numerico).trim().replace('.', ',');

/**
 * O que o CRM sabe sobre cada UC, para o modelo sair preenchido.
 *
 * Le pelo LEITOR FECHADO (`src/crm/leitura.ts`), nao por SQL montado aqui: a
 * SPEC-002 R1 poe a leitura do CRM num ponto unico com lista fechada de views, e
 * um script que consultasse por fora seria o segundo caminho que aquela regra
 * existe para nao haver.
 */
type DoCrm = {
  vendedor: string;
  parceiro_nome: string | null;
  ganho_em: Date | null;
  consumo_reais: string | null;
};

async function lerOCrm(a: any, sessao: any, tenantProposto: string | undefined): Promise<Map<string, DoCrm>> {
  const poolCrm = crmDoAmbiente();
  try {
    const diag = await conferirRoleDeLeitura(poolCrm);
    console.log(`CRM:        conectado como "${diag.usuario}", ${diag.viewsLegiveis.length} view(s) legiveis`);
    /*
     * A MESMA CONFERENCIA DO CICLO, e ela fica aqui pelo motivo da §1.1 da
     * sessao 20: as duas views que respondem quem vendeu existiam havia dois
     * dias e ninguem comparava o que o CRM expoe contra a nossa lista fechada.
     * Contagem que ninguem confere nao e medicao.
     */
    if (diag.viewsNovasNoCrm.length > 0) {
      console.log(`            ATENCAO: ${diag.viewsNovasNoCrm.length} view(s) novas que o conector NAO le: ${diag.viewsNovasNoCrm.join(', ')}`);
    }
    if (diag.viewsAusentes.length > 0) {
      console.log(`            ATENCAO: ${diag.viewsAusentes.length} view(s) da lista fechada sumiram: ${diag.viewsAusentes.join(', ')}`);
    }

    // Regra 6: o crm_tenant_id vem do BANCO, nunca de argumento de linha de comando.
    const conector = await a.withTenant(sessao, tenantProposto, async (tx: any) =>
      tx.conector_crm.findFirst({ select: { crm_tenant_id: true } }));
    if (!conector) throw new Error('nenhum conector_crm para este tenant');

    const leitor = criarLeitorCrm({
      pool: poolCrm, crmTenantId: conector.crm_tenant_id,
      viewsComColunaDeTenant: diag.viewsComColunaDeTenant,
    });

    const creditos = await leitor.vendasCreditadas();
    const ganhos = await leitor.vendasGanhas();
    const consumoPorLead = new Map(ganhos.linhas.map((g: any) => [g.lead_id, g.consumo_reais]));

    const porUC = new Map<string, DoCrm>();
    for (const c of creditos.linhas as any[]) {
      // SO O VIGENTE. O credito e imutavel por gatilho do lado deles e a
      // correcao e revogar + recreditar, entao o revogado continua na view.
      if (!c.vigente || !c.uc) continue;
      porUC.set(c.uc, {
        vendedor: c.vendedor ?? '',
        parceiro_nome: c.parceiro_nome,
        ganho_em: c.ganho_em,
        consumo_reais: consumoPorLead.get(c.crm_lead_id) ?? null,
      });
    }
    console.log(`            ${porUC.size} credito(s) vigente(s) com UC\n`);
    return porUC;
  } finally {
    await poolCrm.end();
  }
}

async function main(): Promise<void> {
  const modelo = tem('modelo');
  const ensaio = tem('ensaio'), valendo = tem('valendo');

  if (!modelo && ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK) ou --valendo (COMMIT), e so um dos dois.');
    console.error('       ou --modelo, que so LE e escreve o CSV para preencher.');
    process.exit(2);
  }

  const saida = arg('saida');
  if (modelo && !saida) {
    if (!arg('auth-user')) { process.stdout.write(MODELO_DE_CONTRATOS); return; }
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
  const tenantProposto = arg('tenant');

  // ------------------------------------------------------------------ modelo
  if (modelo) {
    let doCrm = new Map<string, DoCrm>();
    if (!tem('sem-crm')) {
      try {
        doCrm = await lerOCrm(a, sessao, tenantProposto);
      } catch (e) {
        console.error(`\nERRO ao ler o CRM: ${e instanceof Error ? e.message : String(e)}`);
        console.error('\nO modelo depende dele para tres colunas: a data de fechamento (ganho_em),');
        console.error('o valor de referencia (consumo_reais) e o nome de quem vendeu. Rode com');
        console.error('--sem-crm para gerar o arquivo com essas colunas VAZIAS - o que e um');
        console.error('arquivo legitimo e muito mais trabalho de preencher.');
        await encerrarApp();
        process.exit(1);
      }
    }

    const { ucs, originadores } = await a.withTenant(sessao, tenantProposto, async (tx: any) => ({
      ucs: await tx.unidade_consumidora.findMany({
        where: { status: 'ativa' },
        select: {
          id: true, numero_uc: true, crm_usina_cliente_id: true, rateio_situacao: true,
          cliente: { select: { nome: true } },
          usina: { select: { codigo_geradora: true } },
        },
      }),
      originadores: await tx.originador.findMany({
        where: { ativo: true }, select: { id: true, nome: true, tipo: true },
      }),
    }));

    const vigentes = await a.withTenant(sessao, tenantProposto, async (tx: any) =>
      tx.contrato.findMany({ where: { uc_vigente: { not: null } }, select: { uc_vigente: true } }));
    const jaContratada = new Set(vigentes.map((c: any) => c.uc_vigente));

    /*
     * A RESOLUCAO DO ORIGINADOR, e ela e deliberadamente FRACA: casa por nome
     * exato (sem acento de caixa) e desiste no empate. Nome nao e chave neste
     * projeto - e a razao pela qual a coluna do arquivo e o uuid. O casamento
     * aqui existe so para poupar a digitacao quando ele e obvio; quando nao e,
     * a celula sai vazia e o leitor RECUSA o arquivo, que e o comportamento
     * certo: melhor um erro na importacao do que a comissao na pessoa errada.
     */
    const porNome = new Map<string, Array<{ id: string; nome: string; tipo: string }>>();
    for (const o of originadores as any[]) {
      const chave = o.nome.trim().toLowerCase();
      if (!porNome.has(chave)) porNome.set(chave, []);
      porNome.get(chave)!.push(o);
    }

    const comParceria: string[] = [];
    const modeladas: LinhaDoModeloDeContrato[] = (ucs as any[]).map((u) => {
      const crm = doCrm.get(u.numero_uc);
      const candidatos = crm ? (porNome.get(crm.vendedor.trim().toLowerCase()) ?? []) : [];
      const resolvido = candidatos.length === 1 ? candidatos[0]! : null;

      if (crm?.parceiro_nome) comParceria.push(`${u.numero_uc}  ${crm.vendedor} E ${crm.parceiro_nome}`);

      const valor = paraCelulaEmReais(crm?.consumo_reais ?? null);
      return {
        numero_uc: u.numero_uc,
        originador_id: resolvido?.id ?? '',
        data_fechamento: crm?.ganho_em ? iso(new Date(crm.ganho_em)) : '',
        valor_referencia: valor,
        // O rotulo ACOMPANHA o valor: vazio quando nao ha valor do CRM, para a
        // pessoa que digitar o numero ter de escolher `local` conscientemente.
        origem: valor ? 'crm_consumo_reais' : '',
        cliente: u.cliente?.nome ?? '',
        usina: u.usina?.codigo_geradora ?? '',
        originador_crm: crm
          ? `${crm.vendedor}${crm.parceiro_nome ? ` + PARCEIRO: ${crm.parceiro_nome} (Q-PARCERIA-01)` : ''}`
          : '',
        originador_cadastro: resolvido?.nome ?? '',
        ja_contratada: jaContratada.has(u.id),
        fatura: u.crm_usina_cliente_id === null || u.rateio_situacao === 'ativado',
      };
    });

    writeFileSync(saida!, montarModeloDeContratos(modeladas), 'utf8');

    const faltam = modeladas.filter((l) => !l.ja_contratada);
    const faturam = faltam.filter((l) => l.fatura);
    const semOrig = faltam.filter((l) => !l.originador_id);

    console.log(`== ${modeladas.length} UC(s) ativa(s), escritas em ${saida} ==`);
    console.log(`   ${faltam.length} ainda SEM contrato vigente e vem primeiro; ` +
                `${modeladas.length - faltam.length} ja tem e descem marcadas.`);
    console.log(`   destas ${faltam.length}, ${faturam.length} FATURAM hoje - as outras estao com o rateio`);
    console.log('   nao ativado no CRM, vao marcadas com NAO e descem para o fim.');

    if (originadores.length === 0) {
      console.log('\n   NENHUM ORIGINADOR CADASTRADO, entao a coluna `originador_id` saiu VAZIA nas');
      console.log(`   ${modeladas.length} linhas e o arquivo sera RECUSADO como esta - de proposito.`);
      console.log('   Rode `npm run originadores` primeiro e gere o modelo de novo: o CRM ja diz');
      console.log('   quem vendeu cada UC, e a coluna `originador_crm` do arquivo mostra isso.');
    } else {
      console.log('\n   originadores cadastrados (o uuid e o que vai na coluna 2):');
      for (const o of originadores as any[]) console.log(`     ${o.id}  ${o.nome} · ${o.tipo}`);
      if (semOrig.length > 0) {
        console.log(`\n   ${semOrig.length} linha(s) sairam SEM originador - o nome do CRM nao casou com`);
        console.log('   nenhum cadastro, ou casou com mais de um. Preencha o uuid a mao nessas:');
        for (const l of semOrig.slice(0, 15)) {
          console.log(`     ${l.numero_uc}  ${l.originador_crm || '(sem credito no CRM)'}`);
        }
        if (semOrig.length > 15) console.log(`     +${semOrig.length - 15}`);
      }
    }

    if (comParceria.length > 0) {
      /*
       * Q-PARCERIA-01, VERMELHA E ABERTA. O credito traz vendedor E parceiro na
       * mesma venda e `contrato` guarda UM originador so - e a escolha muda a 2a
       * parcela de 25% para zero (`terceirizado` 25+25, `parceiro_indicador`
       * 25+0). Nao ha o que escolher aqui (regra 10): o modelo grita e para.
       */
      console.log(`\n   ATENCAO - Q-PARCERIA-01: ${comParceria.length} UC(s) tem VENDEDOR E PARCEIRO no mesmo`);
      console.log('   credito, e o contrato guarda um originador so. A escolha muda a 2a parcela');
      console.log('   da comissao de 25% para ZERO, e a R20-b congela no rascunhar:');
      for (const c of comParceria) console.log(`     ${c}`);
      console.log('   A questao esta aberta e tem dono. Nao digite essas linhas antes dela.');
    }

    console.log('\n   Confira a coluna `originador_crm` linha a linha antes de importar - o eixo');
    console.log('   do originador ja esteve errado em 12 de 41 UCs sem que nada aparecesse na tela.');
    console.log('   Depois: --ensaio, que roda a conferencia inteira e nao grava nada.\n');
    await encerrarApp();
    return;
  }

  // ------------------------------------------------------- ensaio e valendo
  const caminho = arg('arquivo');
  if (!caminho) {
    console.error('ERRO: --arquivo <caminho.csv> e obrigatorio. `--modelo` escreve o formato preenchido.');
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

  const p = lerPlanilhaDeContratos(conteudo);

  // O ARQUIVO INTEIRO ANTES DE QUALQUER ESCRITA, como nos outros importadores.
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

  /*
   * O FECHAMENTO NO FUTURO, conferido AQUI e nao no leitor: a regra e pura
   * (`fechamentoNoFuturo`) e "hoje" nao entra num modulo puro. Nao recusa - pre-
   * cadastrar contrato que fecha semana que vem e legitimo -, mas nao pode
   * passar em silencio: enquanto a data estiver adiante, TODA fatura sai parcial
   * e a comissao nao comeca. Sem erro, sem log, sem recusa.
   */
  const hoje = new Date();
  const futuras = p.linhas.filter((l) => fechamentoNoFuturo(l.data_fechamento, hoje));
  if (futuras.length > 0) {
    console.log(`  ATENCAO: ${futuras.length} linha(s) com fechamento no FUTURO (hoje e ${iso(hoje)}).`);
    console.log('  `ehFaturaCheia` compara fechamento <= inicio da competencia, entao enquanto a');
    console.log('  data estiver adiante do mes faturado a fatura sai PARCIAL: nao avanca');
    console.log('  `faturas_cheias_pagas` e NAO PAGA COMISSAO. Nao ha erro nem log disso.');
    for (const l of futuras.slice(0, 10)) {
      console.log(`    linha ${String(l.linha).padStart(4)}  UC ${l.numero_uc}  ${iso(l.data_fechamento)}  (digitado: "${l.bruto.fechamento}")`);
    }
    if (futuras.length > 10) console.log(`    +${futuras.length - 10}`);
    console.log('');
  }

  const daPlanilha: ContratoDaPlanilha[] = p.linhas.map((l) => ({
    numero_uc: l.numero_uc,
    originador_id: l.originador_id,
    data_fechamento: l.data_fechamento,
    valor_referencia_centavos: l.valor_referencia_centavos,
    valor_referencia_origem: l.valor_referencia_origem,
  }));

  let r: ResultadoDosContratos;
  try {
    r = await a.withTenant(sessao, tenantProposto, async () => {
      const feito = await lancarContratosPorUC(daPlanilha);
      if (ensaio) throw new RollbackDoEnsaio(feito);
      return feito;
    }) as ResultadoDosContratos;
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) { r = e.valor as ResultadoDosContratos; }
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log('--- resultado ---');
  console.log(`  ${ensaio ? 'a criar' : 'criados'} ........ ${r!.criados.length}`);
  console.log(`  ja tinham contrato . ${r!.ja_tem_contrato.length}`);
  console.log(`  sem documento (R9) . ${r!.sem_documento.length}`);
  console.log(`  sem originador ..... ${r!.sem_originador.length}`);
  console.log(`  sem usina .......... ${r!.sem_usina.length}`);
  console.log(`  UC nao ativa ....... ${r!.uc_nao_ativa.length}`);
  console.log(`  UC inexistente ..... ${r!.sem_uc.length}`);

  if (r!.criados.length > 0) {
    /*
     * O NOME E O TIER, NAO O uuid. O que precisa ser conferido aqui e a quem o
     * dinheiro vai e quanto - e uuid nao se confere lendo. O tier aparece porque
     * ele CONGELA nesta linha (R20-b) e nao ha caminho de edicao depois.
     */
    console.log(`\n  o que ${ensaio ? 'seria criado' : 'foi criado'} - o tier CONGELA aqui (R20-b), e nao ha edicao:`);
    const larguraUC = Math.max(...r!.criados.map((c) => c.numero_uc.length));
    for (const c of r!.criados) {
      console.log(`    ${c.numero_uc.padEnd(larguraUC)}  ${iso(c.data_fechamento)}  ` +
                  `${emReais(c.valor_referencia_centavos).padStart(14)}  ` +
                  `${c.originador_nome} · ${c.originador_tipo}${c.fatura ? '' : '   (NAO fatura hoje)'}`);
      console.log(`    ${' '.repeat(larguraUC)}  usina ${c.usina || '(sem codigo)'} · ${c.cliente_nome}`);
    }
  }

  if (r!.sem_documento.length > 0) {
    console.log('\n  R9 - cliente SEM documento validado. Nada foi gravado para estas UCs, e e');
    console.log('  deliberado: `rascunhar` aceitaria e `ativar` recusaria, deixando um RASCUNHO');
    console.log('  que nao ocupa a UC, nao fatura e nao aparece em recusa nenhuma:');
    for (const s of r!.sem_documento) console.log(`    ${s.numero_uc}  ${s.cliente_nome}`);
    console.log('  Destrave com `npm run documentos` e reimporte o MESMO arquivo - as que ja');
    console.log('  entraram saem em `ja tinham contrato` e nao viram linha nova.');
  }

  if (r!.sem_originador.length > 0) {
    console.log('\n  originador da planilha que nao existe neste tenant (ou esta inativo):');
    for (const s of r!.sem_originador) {
      console.log(`    ${s.numero_uc}  ${s.originador_id}  ${s.motivo === 'inativo' ? 'INATIVO' : 'nao existe'}`);
    }
  }
  if (r!.sem_usina.length > 0) {
    console.log('\n  UC sem usina vinculada - sem ela nao ha de onde vir o credito:');
    for (const s of r!.sem_usina) console.log(`    ${s.numero_uc}`);
  }
  if (r!.uc_nao_ativa.length > 0) {
    console.log('\n  UC que nao esta ativa no cadastro:');
    for (const s of r!.uc_nao_ativa) console.log(`    ${s.numero_uc}  ${s.status}`);
  }
  if (r!.sem_uc.length > 0) {
    console.log('\n  UC da planilha que nao existe no cadastro:');
    for (const s of r!.sem_uc) console.log(`    ${s.numero_uc}`);
  }
  if (r!.ja_tem_contrato.length > 0) {
    console.log(`\n  ja tinham contrato vigente (R14) - intactas, nada foi renovado:`);
    for (const s of r!.ja_tem_contrato) console.log(`    ${s.numero_uc}  ${s.status}`);
  }

  /*
   * AUSENTE NAO E ZERO: a UC que a planilha nao cobriu fica como estava, e este
   * script nao encerra contrato nenhum. So conta as que FATURAM e ainda nao tem
   * contrato - as outras nao sao trabalho pendente hoje.
   */
  const faltando = r!.nao_cobertas.filter((u) => !u.tem_contrato && u.fatura);
  if (faltando.length > 0) {
    console.log(`\n  ${faltando.length} UC(s) que FATURAM seguem sem contrato e nao estavam no arquivo:`);
    console.log(`    ${faltando.slice(0, 12).map((u) => u.numero_uc).join(', ')}` +
                `${faltando.length > 12 ? `, +${faltando.length - 12}` : ''}`);
    console.log('    A triagem as recusa por `sem_contrato_vigente`, que e a PRIMEIRA da ordem.');
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${r!.criados.length} teriam sido criados e ativados. Nada foi gravado. ==`
    : `\n== COMMIT. ${r!.criados.length} contrato(s) criado(s) e ATIVADO(S). ==`);

  if (!ensaio && r!.criados.length > 0) {
    console.log('   O tier de cada um esta congelado (R20-b) e nao ha caminho de edicao.');
    console.log('   Confira com `npm run faturar -- --prontidao --competencia AAAA-MM`.');
  }

  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
