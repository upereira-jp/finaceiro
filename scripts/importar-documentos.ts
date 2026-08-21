// IMPORTACAO do CPF/CNPJ DOS CLIENTES, pelo CAMINHO DA APLICACAO.
//
// USO
//   npm run documentos -- --modelo --auth-user <uuid> --saida documentos.csv
//   npm run documentos -- --ensaio  --auth-user <uuid> --arquivo documentos.csv
//   npm run documentos -- --valendo --auth-user <uuid> --arquivo documentos.csv
//
//        `--saida` E OBRIGATORIO no modelo, pela mesma razao medida em 03/08 no
//        importador de vencimentos: `iniciar()` imprime duas linhas em STDOUT
//        antes de qualquer consulta, e um CSV feito por redirecionamento nasce
//        com elas no topo - o proprio importador o recusa depois.
//
// DE ONDE ISTO VEM, e nao e de auditoria. Medido em 04/08/2026 contra producao,
// percorrendo o caminho para a primeira fatura:
//
//   cliente.documento               NULL em 45 de 45 linhas ativas
//   documento_validado              false nas 29 UCs faturaveis
//   views do CRM que expoem CPF     ZERO das 10 (conferido no catalogo)
//
// e a R9 (`podeAtivarContrato`) recusa levar contrato para `ativo` sem documento
// validado. Como a triagem recusa `sem_contrato_vigente` PRIMEIRO, o efeito e
// que **nao ha fatura nenhuma** - nem por Pix - enquanto esta coluna estiver
// vazia. A `Q-PAGADOR-01` mediu o mesmo NULL em 03/08 e concluiu "nao bloqueia
// hoje": aquilo vale para o BOLETO, e nao vale para a fatura.
//
// O QUE O ENSAIO IMPRIME, E POR QUE E OUTRA COISA QUE NAS OUTRAS DUAS PLANILHAS.
// Em tarifas o risco e a escala; em vencimentos, o dia curto. Aqui o risco e a
// COLISAO - `cliente_documento_unico` sobre 45 linhas ativas com 36 nomes
// distintos (`Q-CLIENTEDUP-01`) -, entao o ensaio mostra:
//
//   - as colisoes primeiro, com o nome de quem JA tem aquele documento;
//   - quem vai apenas ser VALIDADO (mesmo documento, origem nova - R8);
//   - quem ficou de fora, separando quem fatura de quem nao fatura hoje.

import { readFileSync, writeFileSync } from 'node:fs';
import { iniciar, encerrarApp } from '../src/app.ts';
import { lancarDocumentosPorCliente, type ResultadoDosDocumentos } from '../src/repos/cliente.ts';
import {
  lerPlanilhaDeDocumentos, montarModeloDeDocumentos, MODELO_DE_DOCUMENTOS,
  type LinhaDoModeloDeDocumento,
} from '../src/dominio/planilha-documentos.ts';
import { db } from '../src/db/contexto.ts';
import { indiceDeDocumentoExiste } from '../src/db/catalogo.ts';

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
    if (!arg('auth-user')) { process.stdout.write(MODELO_DE_DOCUMENTOS); return; }
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
   * O MODELO PREENCHIDO. Le e nao escreve - e passa pelo contexto de tenant e
   * pela RLS como todo o resto, entao o arquivo que sai e o daquele tenant.
   */
  if (modelo) {
    /*
     * UMA LINHA POR PESSOA, e as UCs agregadas na celula. Pedir o mesmo CPF duas
     * vezes - uma por UC - fabricaria dentro do arquivo a colisao que ele existe
     * para evitar.
     *
     * O PREDICADO DE `fatura` E O MESMO DA TRIAGEM E DA PRONTIDAO, aplicado a
     * pessoa por `bool_or`: basta UMA UC faturavel.
     */
    const linhas: any[] = await a.withTenant(sessao, arg('tenant'), async () => db().$queryRaw`
      SELECT c.id::text AS cliente_id, c.nome,
             coalesce(c.telefone, '')  AS telefone,
             coalesce(c.documento, '') AS documento_atual,
             c.documento_validado      AS validado,
             coalesce(string_agg(uc.numero_uc, ' ' ORDER BY uc.numero_uc), '') AS ucs,
             coalesce(bool_or(uc.status = 'ativa'
                      AND (uc.crm_usina_cliente_id IS NULL
                           OR uc.rateio_situacao = 'ativado')), false) AS fatura
        FROM cliente c
        LEFT JOIN unidade_consumidora uc
               ON uc.tenant_id = c.tenant_id AND uc.cliente_id = c.id
       WHERE c.ativo
       GROUP BY c.id, c.nome, c.telefone, c.documento, c.documento_validado`) as any[];

    const modeladas: LinhaDoModeloDeDocumento[] = linhas.map((l) => ({
      cliente_id: l.cliente_id, documento_atual: l.documento_atual, validado: l.validado === true,
      nome: l.nome, telefone: l.telefone, ucs: l.ucs, fatura: l.fatura === true,
    }));
    writeFileSync(saida!, montarModeloDeDocumentos(modeladas), 'utf8');

    const faturam = modeladas.filter((l) => l.fatura);
    const faltam = faturam.filter((l) => !l.validado);

    console.log(`\n== ${linhas.length} cliente(s) ativo(s), escritos em ${saida} ==`);
    console.log(`   ${faturam.length} tem ao menos uma UC que FATURA e vem primeiro; ` +
                `${modeladas.length - faturam.length} nao,`);
    console.log('   e vao marcados com NAO na coluna `fatura` - o rateio deles nao esta ativado no CRM.');
    console.log(`   ${faltam.length} dos ${faturam.length} que faturam AINDA NAO destravam a R9 - e o trabalho.`);
    console.log('\n   Preencha a coluna documento e importe com --ensaio. Mascara pode:');
    console.log('   "529.982.247-25" e "52998224725" sao a mesma coisa para o leitor.');
    console.log('   As demais colunas sao so para saber qual linha e qual - o importador');
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

  /*
   * O CATALOGO ANTES DO ARQUIVO. O leitor e puro e nao pergunta ao banco, entao
   * quem pergunta e este script - e a resposta muda o que "documento repetido"
   * significa. Ate 20/08/2026 `cliente_documento_unico` existia e repetir era
   * escrita impossivel; a migration 33 o dropou, e repetir passou a ser o caso
   * NORMAL de uma pessoa com duas UCs.
   *
   * A chamada e barata e cacheada por processo: a segunda, la dentro de
   * `lancarDocumentosPorCliente`, nao volta ao banco.
   */
  const travaAtiva = await a.withTenant(sessao, arg('tenant'), () => indiceDeDocumentoExiste());
  const p = lerPlanilhaDeDocumentos(conteudo, { documentoPodeRepetir: !travaAtiva });

  /*
   * O ARQUIVO INTEIRO ANTES DE QUALQUER ESCRITA, como em
   * `cadastrar-originadores.ts` e nos outros dois importadores.
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

  const porCliente = new Map<string, string>(p.linhas.map((l) => [l.cliente_id, l.documento]));

  let r: ResultadoDosDocumentos;
  try {
    r = await a.withTenant(sessao, arg('tenant'), async () => {
      const feito = await lancarDocumentosPorCliente(porCliente);
      if (ensaio) throw new RollbackDoEnsaio(feito);
      return feito;
    }) as ResultadoDosDocumentos;
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) { r = e.valor as ResultadoDosDocumentos; }
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  /*
   * AS COLISOES PRIMEIRO, e antes do resumo. Elas abortam o lote inteiro, entao
   * enterra-las embaixo de quatro contagens faria a pessoa ler "aplicados 0" e
   * procurar o motivo em outro lugar.
   */
  if (r!.colisoes.length > 0) {
    console.log(`== ${r!.colisoes.length} COLISAO(OES). NADA foi gravado, nem as linhas boas. ==\n`);
    for (const c of r!.colisoes) {
      console.log(`  ${c.documento}  ${c.nome}`);
      console.log(`  ${' '.repeat(c.documento.length)}  ja pertence a "${c.dono_atual_nome}"` +
                  `${c.dono_atual_ativo ? '' : ' (INATIVO - vitima de merge, e o indice unico nao olha `ativo`)'}`);
    }
    console.log('\n  Sao a `Q-CLIENTEDUP-01` chegando: ou as duas linhas sao a MESMA pessoa duplicada,');
    console.log('  ou o documento foi digitado na linha errada. As duas leituras produzem um arquivo');
    console.log('  plausivel, e escolher aqui seria escolher em silencio.\n');
  }

  /*
   * AS REPETICOES TAMBEM ANTES DO RESUMO, e pela razao oposta a das colisoes:
   * elas NAO abortam nada, e e justamente por isso que precisam ser lidas. Um
   * par que grava em silencio e o unico jeito de um CPF na linha errada entrar
   * carimbado como `coleta_local` - que e a origem que VALIDA.
   */
  if (r!.repeticoes.length > 0) {
    console.log(`== ${r!.repeticoes.length} REPETICAO(OES). O lote SEGUE - confira depois. ==\n`);
    for (const c of r!.repeticoes) {
      console.log(`  ${c.documento}  ${c.nome}`);
      console.log(`  ${' '.repeat(c.documento.length)}  tambem esta em "${c.dono_atual_nome}"` +
                  `${c.dono_atual_ativo ? '' : ' (INATIVO - vitima de merge)'}`);
    }
    console.log('\n  `cliente_documento_unico` nao existe mais (migration 33): o documento PODE repetir,');
    console.log('  a UC nao. O par legitimo e uma pessoa com duas UCs; o par errado e um CPF digitado');
    console.log('  na linha de outra pessoa. Os dois produzem este mesmo relatorio.\n');
  }

  console.log('--- resultado ---');
  console.log(`  aplicados ........ ${r!.aplicados.length}`);
  console.log(`  inalterados ...... ${r!.inalterados.length}  (ja tinham este documento, ja validado)`);
  console.log(`  colisoes ......... ${r!.colisoes.length}`);
  console.log(`  repeticoes ....... ${r!.repeticoes.length}  (gravam - o indice unico nao existe mais)`);
  console.log(`  cliente ausente .. ${r!.sem_cliente.length}`);
  console.log(`  nao cobertos ..... ${r!.nao_cobertos.length}`);

  if (r!.aplicados.length > 0) {
    console.log('\n  o que MUDA (antes -> depois):');
    for (const x of r!.aplicados) {
      const antes = x.antes === null ? '(vazio)' : x.antes;
      console.log(`    ${x.documento.padEnd(16)} ${antes.padStart(16)} -> ${x.documento}` +
                  `${x.so_validou ? '   (mesmo documento: so passou a VALER - R8)' : ''}  ${x.nome}`);
    }
  }

  if (r!.sem_cliente.length > 0) {
    console.log('\n  cliente da planilha que NAO recebe (id desconhecido ou inativo):');
    for (const s of r!.sem_cliente) {
      console.log(`    ${s.cliente_id}  ${s.documento.padEnd(16)} ${s.motivo === 'inativo' ? 'INATIVO' : 'nao existe'}`);
    }
  }

  const fora = r!.nao_cobertos.filter((x) => !x.validado);
  const foraQueFatura = fora.filter((x) => x.fatura);
  if (fora.length > 0) {
    /*
     * AUSENTE NAO E ZERO. O cliente que a planilha nao cobriu FICA como estava -
     * este script nao apaga documento nenhum -, e quem decide se falta linha no
     * arquivo ou se aquela pessoa ainda nao tem CPF na mao e uma pessoa.
     */
    console.log('\n  cliente ATIVO que a planilha nao cobriu e que segue sem destravar a R9:');
    for (const s of fora) {
      console.log(`    ${s.fatura ? '        ' : '(nao fatura) '}` +
                  `${(s.documento_atual ?? 'SEM documento').padEnd(16)}  ${s.nome}`);
    }
  }

  console.log(ensaio
    ? `\n== ROLLBACK (--ensaio). ${r!.aplicados.length} teriam sido gravados. Nada foi gravado. ==`
    : r!.colisoes.length > 0
      ? '\n== NADA GRAVADO: o lote inteiro parou nas colisoes acima. =='
      : `\n== COMMIT. ${r!.aplicados.length} cliente(s) com documento validado. ==`);

  if (!ensaio && r!.colisoes.length === 0 && foraQueFatura.length > 0) {
    console.log(`\n   ATENCAO: ${foraQueFatura.length} cliente(s) QUE FATURAM seguem sem documento validado.`);
    console.log('   O contrato deles NAO ativa (R9) e a UC vira recusa `sem_contrato_vigente` no lote -');
    console.log('   que e a PRIMEIRA da ordem da triagem, entao nada depois dela chega a ser medido.');
  }
  if (!ensaio && fora.length > foraQueFatura.length) {
    console.log(`\n   (${fora.length - foraQueFatura.length} outro(s) sem documento NAO faturam hoje - o rateio deles nao esta`);
    console.log('   ativado no CRM. O documento deles nao e trabalho pendente ainda.)');
  }

  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
