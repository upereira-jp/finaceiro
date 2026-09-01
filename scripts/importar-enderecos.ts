// IMPORTACAO DO ENDERECO DO PAGADOR, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run enderecos -- --modelo  --auth-user <uuid> --saida enderecos.csv
//   npm run enderecos -- --ensaio  --auth-user <uuid> --arquivo enderecos.csv
//   npm run enderecos -- --valendo --auth-user <uuid> --arquivo enderecos.csv
//
//        `--saida` E OBRIGATORIO no modelo, pela mesma razao medida em 03/08 nos
//        outros importadores: `iniciar()` imprime duas linhas em STDOUT antes de
//        qualquer consulta, e um CSV feito por redirecionamento nasce com elas
//        no topo - o proprio importador o recusa depois.
//
// DE ONDE ISTO VEM. Medido em 05/08/2026 percorrendo a cadeia do BOLETO, que e
// outra cadeia que a da fatura - e foi por isso que ninguem tinha listado este
// insumo em lugar nenhum:
//
//   endereco_logradouro / municipio / uf / cep    NULL em 29 de 29 faturaveis
//   views do CRM com endereco                     ZERO das 10
//
// `src/repos/boleto.ts` monta o pagador com os seis campos da UC e eles saem
// vazios. E a mesma forma da `Q-PAGADOR-01`, do outro lado da cobranca.
//
// O QUE ISTO DESTRAVA, e VIROU AO CONTRARIO em 01/09/2026: o endereco deixou de
// ser um dos quatro que faltavam e passou a ser O UNICO. Naquele dia o aplicativo
// foi autorizado, o `client_id` entrou no cofre, os escopos foram MEDIDOS contra o
// servidor de autorizacao e o conector foi ligado - e a resolvedora foi exercida
// de ponta a ponta, com a role de runtime sem enxergar o `vault`.
//
// Entao a partir daqui a conta e por UC: a que TEM endereco pode emitir, e a que
// nao tem e recusada com `PagadorSemEndereco` (422) antes de qualquer chamada ao
// banco - uma a uma, sem contaminar as outras nem entrar na fila que nao desiste.
//
// CORPO ANTERIOR, de 05/08, quando nada disso existia, e guardado porque explica
// por que este script nasceu falando de expectativa: "O QUE ISTO NAO DESTRAVA, e
// esta dito aqui para nao virar expectativa: nao destrava boleto nenhum. Falta o
// certificado A1 e a credencial (`Q-SICOOB-01`), falta `src/sicoob/http.ts` (que
// o `ADR-0005`, decidido em 05/08, agora permite escrever) e falta o desenho do
// webhook (`Q-WEBHOOK-01`). Este script fecha um dos quatro, e e o unico dos
// quatro que e coleta e nao decisao nem codigo.".
//
// E CONFERIDO ANTES DE CONSTRUIR: o conector NAO escreve `endereco_*`. O objeto
// `espelho` de `espelharUnidades` tem `cliente_id`, `usina_id`,
// `percentual_rateio`, `crm_usina_cliente_id` e as tres de `rateio_*`, e mais
// nada. Ou seja, preencher os enderecos e rodar `npm run ciclo` NAO os apaga -
// que era exatamente o defeito que a `SPEC-002` R25 corrigiu para
// `data_vencimento` em 03/08, e a razao de conferir antes em vez de supor.

import { readFileSync, writeFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import { lancarEnderecosPorUC, type ResultadoDosEnderecos } from '../src/repos/unidade_consumidora.ts';
import {
  lerPlanilhaDeEnderecos, montarModeloDeEnderecos, cepComMascara,
  MODELO_DE_ENDERECOS, type LinhaDoModeloDeEndereco,
} from '../src/dominio/planilha-enderecos.ts';
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
    console.error('       ou --modelo, que so LE e escreve o CSV para preencher.');
    process.exit(2);
  }

  const saida = arg('saida');
  if (modelo && !saida) {
    if (!arg('auth-user')) { process.stdout.write(MODELO_DE_ENDERECOS); return; }
    console.error('ERRO: --modelo com --auth-user exige --saida <arquivo.csv>.');
    console.error('       O arranque imprime duas linhas no stdout, e um CSV feito por');
    console.error('       redirecionamento nasceria com elas no topo.');
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
    const linhas: any[] = await a.withTenant(sessao, tenantProposto, async () => db().$queryRaw`
      SELECT uc.numero_uc,
             coalesce(uc.endereco_logradouro,  '') AS logradouro,
             coalesce(uc.endereco_numero,      '') AS numero,
             coalesce(uc.endereco_complemento, '') AS complemento,
             coalesce(uc.endereco_bairro,      '') AS bairro,
             coalesce(uc.endereco_municipio,   '') AS municipio,
             coalesce(uc.endereco_uf,          '') AS uf,
             coalesce(uc.endereco_cep,         '') AS cep,
             coalesce(c.nome, '') AS cliente,
             coalesce(u.codigo_geradora, '') AS usina,
             (uc.crm_usina_cliente_id IS NULL OR uc.rateio_situacao = 'ativado') AS fatura
        FROM unidade_consumidora uc
        JOIN cliente c ON c.tenant_id = uc.tenant_id AND c.id = uc.cliente_id
        LEFT JOIN usina u ON u.tenant_id = uc.tenant_id AND u.id = uc.usina_id
       WHERE uc.status = 'ativa'`) as any[];

    const modeladas: LinhaDoModeloDeEndereco[] = linhas.map((l) => ({
      numero_uc: l.numero_uc,
      logradouro: l.logradouro, numero: l.numero, complemento: l.complemento,
      bairro: l.bairro, municipio: l.municipio, uf: l.uf,
      // O CEP sai COM mascara no modelo: e como a pessoa o reconhece, e o leitor
      // a tira de volta. Guardar mascara e que nao pode.
      cep: l.cep ? cepComMascara(l.cep) : '',
      cliente: l.cliente, usina: l.usina, fatura: l.fatura === true,
      completo: Boolean(l.logradouro && l.numero && l.bairro && l.municipio && l.uf && l.cep),
    }));

    writeFileSync(saida!, montarModeloDeEnderecos(modeladas), 'utf8');

    const faltam = modeladas.filter((l) => !l.completo);
    const faltamQueFaturam = faltam.filter((l) => l.fatura);

    console.log(`\n== ${modeladas.length} UC(s) ativa(s), escritas em ${saida} ==`);
    console.log(`   ${faltam.length} sem endereco completo e vem primeiro; ` +
                `${modeladas.length - faltam.length} ja tem e descem marcadas.`);
    console.log(`   destas ${faltam.length}, ${faltamQueFaturam.length} FATURAM hoje - as outras estao com o rateio`);
    console.log('   nao ativado no CRM, vao marcadas com NAO e descem para o fim.');
    console.log('\n   Sao SETE colunas de endereco e SEIS sao obrigatorias - so `complemento` pode');
    console.log('   ficar vazio. A UF e conferida contra a lista fechada de 27 ("GO", nao "GOI"),');
    console.log('   e o CEP contra oito digitos, com mascara ou sem.');
    console.log('\n   O ENDERECO E O QUE FALTA PARA EMITIR, e desde 01/09/2026 ele e o UNICO:');
    console.log('   A1 no cofre, credencial resolvendo, escopos medidos e conector ligado. A UC');
    console.log('   COM endereco emite; a SEM e recusada com PagadorSemEndereco (422), uma a uma,');
    console.log('   antes de chamar o banco. E nao bloqueia fatura nem Pix - a triagem nao tem');
    console.log('   recusa por endereco.\n');
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

  const p = lerPlanilhaDeEnderecos(conteudo);

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

  const porUC = new Map(p.linhas.map((l) => [l.numero_uc, {
    logradouro: l.logradouro, numero: l.numero, complemento: l.complemento,
    bairro: l.bairro, municipio: l.municipio, uf: l.uf, cep: l.cep,
  }]));

  let r: ResultadoDosEnderecos;
  try {
    r = await a.withTenant(sessao, tenantProposto, async () => {
      const feito = await lancarEnderecosPorUC(porUC);
      if (ensaio) throw new RollbackDoEnsaio(feito);
      return feito;
    }) as ResultadoDosEnderecos;
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) { r = e.valor as ResultadoDosEnderecos; }
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  console.log('--- resultado ---');
  console.log(`  ${ensaio ? 'a aplicar' : 'aplicados'} ... ${r!.aplicados.length}`);
  console.log(`  inalterados ..... ${r!.inalterados.length}  (ja tinham este mesmo endereco)`);
  console.log(`  UC inexistente .. ${r!.sem_uc.length}`);

  if (r!.aplicados.length > 0) {
    /*
     * ANTES E DEPOIS, e nao so o depois. Endereco e o unico destes insumos que
     * pode estar PELA METADE, entao a segunda passada quase sempre e correcao -
     * e uma correcao que so mostra o valor novo nao deixa conferir o que mudou.
     */
    console.log('\n  o que MUDA (antes -> depois):');
    for (const x of r!.aplicados) {
      console.log(`    ${x.numero_uc}${x.fatura ? '' : ' (NAO fatura)'}`);
      console.log(`      de:   ${x.antes ?? '(vazio)'}`);
      console.log(`      para: ${x.depois}`);
    }
  }

  if (r!.sem_uc.length > 0) {
    console.log('\n  UC da planilha que nao existe no cadastro:');
    for (const s of r!.sem_uc) console.log(`    ${s.numero_uc}`);
  }

  /*
   * AUSENTE NAO E ZERO: a UC que a planilha nao cobriu fica como estava - este
   * script nao apaga endereco nenhum. So conta as que FATURAM e seguem
   * incompletas; as outras nao sao trabalho pendente hoje.
   */
  const fora = r!.nao_cobertos.filter((u) => !u.completo);
  const foraQueFatura = fora.filter((u) => u.fatura);
  if (foraQueFatura.length > 0) {
    console.log(`\n  ${foraQueFatura.length} UC(s) que FATURAM seguem sem endereco completo e nao estavam no arquivo:`);
    console.log(`    ${foraQueFatura.slice(0, 12).map((u) => u.numero_uc).join(', ')}` +
                `${foraQueFatura.length > 12 ? `, +${foraQueFatura.length - 12}` : ''}`);
  }
  if (fora.length > foraQueFatura.length) {
    console.log(`\n  (${fora.length - foraQueFatura.length} outra(s) incompleta(s) NAO faturam hoje - o rateio delas`);
    console.log('   nao esta ativado no CRM. O endereco delas nao e trabalho pendente ainda.)');
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${r!.aplicados.length} teriam sido gravados. Nada foi gravado. ==`
    : `\n== COMMIT. ${r!.aplicados.length} UC(s) com endereco do pagador. ==`);

  if (!ensaio) {
    console.log('   Estas UCs passam a PODER emitir: desde 01/09/2026 o endereco e o unico');
    console.log('   bloqueio do caminho do boleto - A1, credencial, escopos e conector ja estao.');
    console.log('   A UC que seguir sem endereco continua recusada com PagadorSemEndereco (422).');
  }

  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
