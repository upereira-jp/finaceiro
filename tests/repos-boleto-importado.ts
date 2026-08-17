// O BOLETO EMITIDO NO BANCO, contra banco real, pela role SEM BYPASSRLS.
// Uso: bash tests/repos.sh
//
// A metade PURA da conferencia esta em `tests/boleto-importado.ts`, e ela nao
// precisa de banco. Aqui esta o que SO se ve com banco:
//
//   - a linha de `boleto` nascendo com `origem = 'importado'` (migration 32) e a
//     constraint `boleto_importado_tem_linha` recusando o contrario;
//   - o caminho funcionando SEM conector e SEM certificado A1 - que e a razao de
//     ele existir. Nenhuma outra escrita de boleto do sistema consegue isso;
//   - a idempotencia e a recusa de sobrescrita, que dependem do estado gravado;
//   - a exclusao do importado da CONSULTA ATIVA (`emAberto`), que e um predicado
//     em SQL e passaria verde quebrado num teste puro;
//   - o valor e o vencimento gravados saindo dos 44 digitos do codigo de barras,
//     e nao do que alguem digitou.
//
// AS TRANSACOES SAO SEPARADAS DE PROPOSITO - cada `emA(...)` e uma unidade de
// trabalho e portanto um COMMIT, que e onde as constraints deferidas disparam.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as donoUsina from '../src/repos/dono_usina.ts';
import * as usinaRepo from '../src/repos/usina.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as regras from '../src/repos/regras.ts';
import * as fatura from '../src/repos/fatura.ts';
import * as boleto from '../src/repos/boleto.ts';
import { montarLinhaDigitavel, digitosDaLinha } from '../src/dominio/linha-digitavel.ts';
import { pixEstatico } from '../src/dominio/brcode.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const U = process.env.TEST_USUARIO_ADMIN!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());

let falhas = 0;
let total = 0;
const chk = (id: string, cond: boolean, d: string) => {
  total++;
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(4)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));

// ================================================================= fixture
//
// Uma fatura EMITIDA, pelos caminhos de producao: compor o lote e emitir. Nada
// de INSERT direto - o `status` da fatura e a precondicao do caminho todo, e
// plantar a linha a mao provaria menos do que parece.
let faturaId: string;
let faturaDois: string;
let valorTotal: number;
let valorDois: number;
let vencimentoIso: string;

{
  const dono = await emA(() => donoUsina.criar({
    nome: 'Dono BOLIMP', natureza: 'pf', documento_bruto: '111.444.777-35', chave_pix: 'bolimp@pix',
  }));
  const usina = await emA(() => usinaRepo.criar({
    codigo_geradora: 'BOLIMP-0001', distribuidora: 'Equatorial', dono_usina_id: dono.id,
  }));
  await emA(() => regras.abrirVigenciaDeRepasse({
    usina_id: usina.id, percentual: '70.00', vigencia_inicio: mes(2020, 1),
  }));

  /* DUAS UCs, e portanto duas faturas emitidas. A segunda existe para o Y7: um
   * boleto que a Sicoob RECUSOU, com a linha ja em `erro`, que e o cenario mais
   * provavel de todos - e o unico em que a importacao escreve por cima de algo. */
  const criarUC = async (numero: string, pct: string) => {
    const uc = await emA(() => ucRepo.criar({
      cliente_id: CLI, numero_uc: numero, distribuidora: 'Equatorial',
      tarifa_reais_por_kwh: '1.130000', data_vencimento: new Date(Date.UTC(2026, 0, 10)),
    }));
    await emA(() => rateio.definirRateio({
      unidade_consumidora_id: uc.id, usina_id: usina.id, percentual_rateio: pct,
    }));
    const k = await emA(() => contrato.rascunhar({
      cliente_id: CLI, unidade_consumidora_id: uc.id, usina_id: usina.id, originador_id: null,
      data_fechamento: new Date(Date.UTC(2026, 4, 1)),
      valor_referencia_centavos: 100_000, valor_referencia_origem: 'local',
    }));
    await emA(() => contrato.ativar(k.id));
    return uc.id;
  };
  const uc1 = await criarUC('BOLIMP-UC-1', '50.0000');
  const uc2 = await criarUC('BOLIMP-UC-2', '25.0000');

  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usina.id, competencia: mes(2027, 3), geracao_kwh: '10000.0000', origem: 'local',
  }));

  await emA(() => fatura.comporLote('2027-03-01'));
  await emA(() => fatura.emitirLote('2027-03-01'));
  const fs = await emA(() => fatura.daCompetencia('2027-03-01'));
  const f1 = fs.find((x: any) => x.unidade_consumidora_id === uc1)!;
  const f2 = fs.find((x: any) => x.unidade_consumidora_id === uc2)!;
  faturaId = f1.id; valorTotal = Number(f1.valor_total_centavos);
  faturaDois = f2.id; valorDois = Number(f2.valor_total_centavos);
  vencimentoIso = f1.vencimento.toISOString().slice(0, 10);
}

/** Uma linha digitavel REAL para esta fatura: mesmo centavo, mesmo dia. */
const linhaDaFatura = (valor = valorTotal, iso = vencimentoIso) =>
  montarLinhaDigitavel({
    vencimento_iso: iso, valor_centavos: valor, campoLivre: '1500401727686900000013001',
  }).linha;

// ------------------------------------ Y1 sem conector e sem A1, e mesmo assim entra
{
  /*
   * A PRECONDICAO E DESLIGADA EXPLICITAMENTE, e a primeira versao desta suite
   * apenas SUPUNHA que o tenant nao tinha conector - ficou vermelha, porque
   * `tests/repos-carteira.ts` roda antes e cadastra um (K5). O conector e por
   * tenant e o `cadastrarConector` e upsert, entao supor estado de outra suite e
   * medir a ordem do arquivo, nao a regra.
   *
   * Desligado, `registrar()` para em `CobrancaNaoHabilitada` antes de qualquer
   * coisa. E e esse o ponto: o caminho importado NAO pergunta pelo conector, e e
   * por isso que ele existe.
   */
  await emA(() => boleto.cadastrarConector({ credencial_ref: 'vault://sicoob/bolimp', ativo: false }));
  const e = await lancou(() => emA(() => boleto.registrar(faturaId, {
    registrar: async () => { throw new Error('nao devia chegar aqui'); },
  } as any)));
  chk('Y1', e?.name === 'CobrancaNaoHabilitada' && e.status === 412,
      `com o conector inativo, registrar() para em 412 nomeado (veio ${e?.name})`);

  const b = await emA(() => boleto.importar(faturaId, {
    linha_digitavel: linhaDaFatura(), nosso_numero: '1-3',
  }));
  chk('Y1b', b.status === 'registrado' && b.origem === 'importado',
      'e a importacao entra igual, com origem `importado` - nenhum conector, nenhum A1');
  chk('Y1c', b.linha_digitavel === digitosDaLinha(linhaDaFatura()) && b.codigo_barras?.length === 44,
      'grava os 47 digitos e os 44 do codigo de barras REMONTADO, nao digitado');
  chk('Y1d', b.valor_registrado_centavos === valorTotal
        && b.vencimento.toISOString().slice(0, 10) === vencimentoIso,
      `valor e vencimento saem de DENTRO do codigo de barras (${b.valor_registrado_centavos} centavos, ${vencimentoIso})`);
  chk('Y1e', b.payload_envio === null && b.payload_retorno === null && b.pix_txid === null,
      'nada subiu e nada voltou: os payloads e o txid do Pix ficam NULOS, e nao inventados');
  chk('Y1f', b.registrado_em !== null && b.ultima_tentativa_em === null
        && b.proxima_tentativa_em === null && b.tentativas === 0,
      'linha NOVA sai da fila sem carimbar tentativa - nenhuma aconteceu, e carimbar faria a agenda contar um evento que nao houve');
}

// -------------------------------------------- Y2 idempotencia e sobrescrita
{
  const denovo = await emA(() => boleto.importar(faturaId, {
    linha_digitavel: linhaDaFatura(), nosso_numero: '1-3',
  }));
  const linhas: Array<{ n: bigint }> = await emA(() => db().$queryRaw`
    SELECT count(*) AS n FROM boleto WHERE fatura_id = ${faturaId}::uuid`);
  chk('Y2', denovo.status === 'registrado' && Number(linhas[0]!.n) === 1,
      'importar a MESMA linha de novo devolve a mesma linha - quem clicou duas vezes nao produz dois fatos');

  /* Linha DIFERENTE por cima de um registrado e outra historia: sobrescrever
   * apagaria o titulo que ja esta na mao do cliente. */
  const outra = montarLinhaDigitavel({
    vencimento_iso: vencimentoIso, valor_centavos: valorTotal, campoLivre: '9990401727686900000013001',
  }).linha;
  const e = await lancou(() => emA(() => boleto.importar(faturaId, { linha_digitavel: outra })));
  chk('Y2b', e?.name === 'BoletoJaExiste' && e.status === 409,
      `outra linha por cima de um registrado e 409 nomeado (veio ${e?.name})`);
}

// ------------------------------------- Y3 a consulta ativa NAO alcanca o importado
{
  /* O PREDICADO E SQL, e um teste puro passaria verde com ele quebrado. Sem a
   * exclusao, a consulta ativa perguntaria a Sicoob por um `nosso_numero` que
   * foi TRANSCRITO de um PDF - e o retorno nao e "nao e nosso", e erro, que o
   * motor grava como divergencia num boleto que esta certo. */
  const abertos = await emA(() => boleto.emAberto(500));
  chk('Y3', abertos.every((b: any) => b.origem === 'api_sicoob'),
      `nenhum importado no universo da consulta ativa (${abertos.length} em aberto, todos da API)`);
  chk('Y3b', !abertos.some((b: any) => b.fatura_id === faturaId),
      'e o nosso, especificamente, nao esta la');

  const n = await emA(() => boleto.tamanhoDosEmAberto());
  chk('Y3c', n === abertos.length,
      `o CONTADOR usa o mesmo universo da lista (${n}) - divergir faria "0 deixados para tras" mentir`);

  /* E a baixa pela API tambem recusa, pelo mesmo motivo. Ela para no conector
   * antes disso nesta suite, entao a recusa nomeada e conferida no caminho em
   * que ha conector - ver Y4. */
}

// ---------------------------- Y4 a baixa pela API recusa o titulo que nao e nosso
{
  /* O conector volta a ATIVO: o Y1 o desligou de proposito, e `baixarNoBanco`
   * pergunta por ele antes de olhar a origem do boleto. Sem religar, a recusa que
   * esta verificacao mede seria confundida com a falta de conector. */
  await emA(() => boleto.cadastrarConector({ credencial_ref: 'vault://sicoob/bolimp', ativo: true }));
  const e = await lancou(() => emA(() => boleto.baixarNoBanco(faturaId, 'teste', {
    baixar: async () => { throw new Error('nao devia chegar a porta'); },
  } as any)));
  chk('Y4', e?.name === 'BoletoImportadoNaoSeBaixaPelaApi' && e.status === 409,
      `baixar pela API um boleto importado e 409 nomeado, e a porta NAO e chamada (veio ${e?.name})`);
}

// -------------------------------- Y5 a recusa da conferencia, do lado do banco
{
  const e = await lancou(() => emA(() => boleto.importar(faturaId, { linha_digitavel: '123' })));
  chk('Y5', e?.name === 'ImportacaoRecusada' && e.status === 422,
      `linha invalida e 422 nomeado, com a frase do dominio (veio ${e?.name})`);
  chk('Y5b', String(e?.message ?? '').includes('Nada foi gravado'),
      'e a mensagem DIZ que nada foi gravado - "erro ao importar" deixaria a duvida');

  const rec = await lancou(() => emA(() => boleto.importar(faturaDois, {
    linha_digitavel: linhaDaFatura(valorDois + 1),
  })));
  chk('Y5c', rec?.name === 'ImportacaoRecusada',
      'UM CENTAVO de diferenca para em 422 - antes de gravar, e nao tres telas adiante');
  const nada = await emA(() => boleto.porFatura(faturaDois));
  chk('Y5e', nada === null,
      'e a recusa NAO deixou linha nenhuma para tras: "nada foi gravado" e literal');

  /* O PIX QUEBRADO E RECUSA, e o boleto continua sendo o mesmo. */
  const brcode = pixEstatico({
    chave: 'a@g3.com', recebedorNome: 'G3 SOLAR', recebedorCidade: 'GOIANIA', valorCentavos: valorTotal,
  });
  const pixRuim = await lancou(() => emA(() => boleto.importar(faturaId, {
    linha_digitavel: linhaDaFatura(), pix_copia_e_cola: `${brcode.slice(0, -4)}0000`,
  })));
  chk('Y5d', pixRuim?.name === 'ImportacaoRecusada',
      'Pix com CRC quebrado recusa a importacao inteira - um QR ilegivel impresso parece pagamento e nao e');
}

// -------------------- Y7 POR CIMA DE UM `erro`: o cenario que motivou tudo isto
{
  /*
   * A HISTORIA REAL, ponta a ponta: a chamada a Sicoob falha, a linha fica em
   * `erro` com a tentativa contada e a fila agendada, alguem emite o boleto a mao
   * no portal, e ELE precisa entrar. Se este caminho nao existisse, a fatura
   * ficaria com um boleto em `erro` para sempre e o documento sairia cobrando por
   * Pix estatico, que nao concilia.
   */
  const falhou = await emA(() => boleto.registrar(faturaDois, {
    registrar: async () => { throw new Error('o banco recusou: 400 numeroContrato'); },
  } as any));
  chk('Y7', falhou.registrado === false && falhou.boleto!.status === 'erro'
        && falhou.boleto!.tentativas === 1 && falhou.boleto!.proxima_tentativa_em !== null,
      'a tentativa que falhou COMMITA: status `erro`, uma tentativa contada e a fila agendada');

  const b = await emA(() => boleto.importar(faturaDois, {
    linha_digitavel: linhaDaFatura(valorDois), nosso_numero: '2-7',
  }));
  chk('Y7b', b.id === falhou.boleto!.id && b.status === 'registrado' && b.origem === 'importado',
      'a importacao REAPROVEITA a linha em erro - `boleto_fatura_unico` nao deixaria criar a segunda');
  chk('Y7c', b.ultimo_erro === null && b.proxima_tentativa_em === null,
      'o erro sai e a fila para: ele descrevia o estado de agora e deixou de ser verdade');
  chk('Y7d', b.tentativas === 1 && b.ultima_tentativa_em !== null,
      'e a CONTAGEM fica, com o carimbo da tentativa: ela descreve o que aconteceu, e continua sendo verdade');

  const fila = await emA(() => boleto.filaDeEmissao(new Date(Date.now() + 86_400_000), 100));
  chk('Y7e', !fila.some((x: any) => x.fatura_id === faturaDois),
      'e a fatura sai da FILA DE EMISSAO - sem isso a agenda retentaria para sempre um boleto que ja existe');
}

// ---------------------- Y6 a constraint do banco, e ela nao depende do repositorio
{
  /*
   * `boleto_importado_tem_linha` (migration 32). O repositorio ja garante que
   * `origem = 'importado'` so entra com linha conferida, mas a garantia do
   * REPOSITORIO vale enquanto alguem escrever pelo repositorio. Esta verificacao
   * e sobre o banco: a mesma razao pela qual `boleto_payload_sem_segredo` existe
   * apesar de nenhum adaptador devolver segredo.
   */
  const e = await lancou(() => emA(() => db().$executeRaw`
    UPDATE boleto SET linha_digitavel = NULL WHERE fatura_id = ${faturaId}::uuid`));
  chk('Y6', e !== null && String(e?.message ?? '').includes('boleto_importado_tem_linha'),
      'apagar a linha digitavel de um boleto importado e recusado PELO BANCO, e nao so pelo repositorio');
}

console.log();
if (falhas > 0) {
  console.log(`--- boleto importado: ${falhas} FALHA(S) de ${total}`);
  await pools.transacional.end(); await pools.relatorio.end();
  process.exit(1);
}
console.log(`--- boleto importado: ${total} verificacoes, 0 falhas`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
