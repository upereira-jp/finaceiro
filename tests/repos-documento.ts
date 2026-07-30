// O DOCUMENTO DE COBRANCA PONTA A PONTA, contra banco real, pela role SEM BYPASSRLS.
// Uso: bash tests/repos.sh
//
// De onde este arquivo vem: era a segunda das tres pendencias nomeadas da
// `Q-DOCFATURA-01` em 30/07. Os modulos puros (`brcode.ts`, `layout-do-documento.ts`)
// tinham 55 verificacoes e o repositorio tinha ZERO - as suites de repo do projeto
// rodam por `tests/repos.sh` e este nunca entrou nela.
//
// O QUE SO SE VERIFICA AQUI, E NAO NO TESTE PURO. Tres coisas do documento nao
// moram no codigo, moram no BANCO, e um teste sem banco passaria verde com elas
// quebradas:
//
//   1. O MIME SAI DA ASSINATURA DO ARQUIVO. E gatilho, nao aplicacao. Um SVG
//      rotulado `image/png` tem de ser recusado pelos BYTES - e importa porque a
//      logo e embutida no HTML do documento, e SVG executa script.
//   2. O SHA256 E DERIVADO PELO BANCO. A regra 9 se cumpre por construcao: o
//      metadado nao PODE divergir do conteudo. Isso se prova comparando com um
//      sha256 calculado aqui, por `node:crypto` - caminho independente.
//   3. A LISTA DE CAMPOS E FECHADA POR ENUM. Era o custo que eu tinha nomeado ao
//      recomendar layout fixo, e a decisao 2 aceitou o custo com a validacao no
//      schema. "O banco recusa" e afirmacao que precisa de teste.
//
// E a quarta, que e de isolamento: `paraFatura` le fatura, UC, cliente, usina,
// layout e boleto. Seis leituras, uma policy cada. Pela role sem BYPASSRLS, a
// fatura do tenant B tem de ser 404 e nao um documento do vizinho.

import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as usinaRepo from '../src/repos/usina.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import * as rateio from '../src/repos/rateio.ts';
import * as contrato from '../src/repos/contrato.ts';
import * as regras from '../src/repos/regras.ts';
import * as fatura from '../src/repos/fatura.ts';
import * as boletoRepo from '../src/repos/boleto.ts';
import * as documento from '../src/repos/documento.ts';
import { CobrancaFalsa } from '../src/sicoob/falso.ts';
import { crcConfere } from '../src/dominio/brcode.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;
const ULEI = process.env.TEST_USUARIO_LEITURA!;
const CLI = process.env.TEST_CLIENTE!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());
const emALeitura = <T>(f: () => Promise<T>) =>
  withTenantEm(prisma as any, { tenantId: A, usuarioId: ULEI }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d}`);
};
const lancou = async (f: () => Promise<unknown>): Promise<any> => {
  try { await f(); return null; } catch (e) { return e; }
};
/*
 * O RESUMO DE UM ERRO EM UMA LINHA, e isto nao e cosmetico: a contagem oficial da
 * suite e `npm test | grep -c '^ok '`, e mensagem do Prisma tem `\n` no meio. Uma
 * verificacao que passa e imprime duas linhas conta como uma e polui a proxima -
 * foi o que fez o total desta suite dar 46 sozinha e 45 dentro do `npm test`.
 */
const resumo = (e: unknown, n = 60) =>
  String(e).replace(/\s+/g, ' ').trim().slice(0, n);
const mes = (ano: number, m: number) => new Date(Date.UTC(ano, m - 1, 1));

/*
 * IMAGENS DE VERDADE, pelo que o gatilho olha: os primeiros bytes.
 *
 * Nao sao PNG e JPEG completos - o gatilho le a assinatura e o `octet_length`, e e
 * exatamente isso que esta sob teste. Um PNG valido de 300 KB nao provaria mais e
 * poria um arquivo binario no repositorio.
 */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
// `<svg ...` em ASCII. E o caso que a decisao 1 mandou recusar.
const SVG = Uint8Array.from([...'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'].map((c) => c.charCodeAt(0)));
const GIF = Uint8Array.from([...'GIF89a'].map((c) => c.charCodeAt(0)));

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/*
 * A DISTRIBUIDORA E 'Equatorial' PORQUE NAO HA OUTRA, e isso decidiu como esta
 * suite afirma valor.
 *
 * `usina.distribuidora` e FK para a tabela `distribuidora` (a da `Q-DISTRIB-01`), e
 * ela tem UMA linha. Inventar 'Equatorial-DOC' levanta 23503. Consequencia: a
 * tarifa vigente vem de quem abriu a vigencia primeiro, e no `repos.sh` isso e a
 * suite da CARTEIRA, com 1,130000 - a minha conta a mao dizia 85.000 e o total veio
 * 95.400.
 *
 * Entao esta suite NAO afirma um total constante. Ela afirma a RELACAO, que e o
 * invariante de verdade e nao depende de qual suite rodou antes:
 *
 *   - o documento REPETE a coluna gerada da fatura, nao a recalcula;
 *   - o campo 54 do BR Code e esse mesmo total formatado em reais POR TEXTO.
 *
 * Fixar 85.000 aqui teria sido fixar uma dependencia de ordem de execucao com cara
 * de conta conferida.
 */
const DISTRIB = 'Equatorial';

// ================================================================ fixture
let ucId: string; let faturaA: string; let faturaB: string;

/*
 * A TARIFA E CONDICIONAL, e a razao e do harness: `tests/repos.sh` roda todas as
 * suites no MESMO banco `fin_repos`, e a da carteira ja abriu vigencia para
 * Equatorial no tenant A. Abrir de novo levanta `VigenciaNoPassado` - e com razao,
 * porque vigencia nova comecando antes da atual reprecifica retroativamente.
 *
 * Conferir antes e o que torna esta suite independente da ORDEM em que ela roda.
 * Um `try/catch` aqui esconderia uma falha real de vigencia.
 *
 * A CONSULTA USA `db()`, NAO `prisma`, e a primeira versao disto errou justamente
 * ai: `prisma.$queryRaw` dentro de `withTenantEm` roda FORA da transacao, portanto
 * sem `SET LOCAL`, portanto a RLS devolve ZERO linhas. A contagem deu 0 com a
 * vigencia existindo, e o `abrirVigencia` seguinte falhou dizendo que ela existe.
 * E o modo de falha que o `ADR-0003` nomeia - contexto emitido em ponto unico,
 * dentro da transacao, reconstruindo a operacao no client de transacao.
 */
const garantirTarifa = async (emT: <T>(f: () => Promise<T>) => Promise<T>) => {
  const abertas: Array<{ n: bigint }> = await emT(() => db().$queryRawUnsafe(
    `SELECT count(*)::bigint AS n FROM tarifa WHERE distribuidora = $1 AND vigencia_fim IS NULL`, DISTRIB));
  if (Number(abertas[0].n) > 0) return;
  await emT(() => regras.abrirVigenciaDeTarifa({
    distribuidora: DISTRIB, tarifa_reais_por_kwh: '1.000000', vigencia_inicio: mes(2020, 1),
  }));
};

{
  const u = await emA(() => usinaRepo.criar({ codigo_geradora: 'DOC-0001', distribuidora: DISTRIB }));
  await garantirTarifa(emA);
  const uc = await emA(() => ucRepo.criar({
    cliente_id: CLI, numero_uc: 'DOC-UC-1', distribuidora: DISTRIB,
    data_vencimento: new Date(Date.UTC(2026, 0, 15)),
  }));
  ucId = uc.id;
  await emA(() => rateio.definirRateio({
    unidade_consumidora_id: uc.id, usina_id: u.id, percentual_rateio: '10.0000',
  }));
  const k = await emA(() => contrato.rascunhar({
    cliente_id: CLI, unidade_consumidora_id: uc.id, usina_id: u.id, originador_id: null,
    data_fechamento: new Date(Date.UTC(2026, 0, 1)),
    valor_referencia_centavos: 50_000, valor_referencia_origem: 'local',
  }));
  await emA(() => contrato.ativar(k.id));
  await emA(() => usinaRepo.registrarGeracao({
    usina_id: u.id, competencia: mes(2027, 3), geracao_kwh: '8000.0000', origem: 'local',
  }));
  await emA(() => fatura.comporLote('2027-03-01', {
    tarifas_concessionaria_centavos: { [uc.id]: 5_000 },
  }));
  faturaA = (await emA(() => fatura.daCompetencia('2027-03-01')))
    .find((f: any) => f.unidade_consumidora_id === uc.id)!.id;

  // Uma fatura no tenant B, para o teste de isolamento ter alvo real. A fixture do
  // `repos.sh` da ao B a mesma usina? Nao - o B tem so o vinculo do admin, entao
  // aqui se monta o minimo.
  const uB = await emB(() => usinaRepo.criar({ codigo_geradora: 'DOC-B-0001', distribuidora: DISTRIB }));
  await garantirTarifa(emB);
  // O cliente do B nao existe na fixture; `cliente_id` do A nao atravessa (FK
  // composta, regra 2). Cria-se um cliente do B pelo caminho do repo.
  const clienteB = await emB(async () => {
    const { criar } = await import('../src/repos/cliente.ts');
    return criar({ nome: 'Cliente do B', documento_bruto: '529.982.247-25' });
  });
  const ucB = await emB(() => ucRepo.criar({
    cliente_id: clienteB.id, numero_uc: 'DOC-B-UC-1', distribuidora: DISTRIB,
    data_vencimento: new Date(Date.UTC(2026, 0, 15)),
  }));
  await emB(() => rateio.definirRateio({
    unidade_consumidora_id: ucB.id, usina_id: uB.id, percentual_rateio: '10.0000',
  }));
  const kB = await emB(() => contrato.rascunhar({
    cliente_id: clienteB.id, unidade_consumidora_id: ucB.id, usina_id: uB.id, originador_id: null,
    data_fechamento: new Date(Date.UTC(2026, 0, 1)),
    valor_referencia_centavos: 50_000, valor_referencia_origem: 'local',
  }));
  await emB(() => contrato.ativar(kB.id));
  await emB(() => usinaRepo.registrarGeracao({
    usina_id: uB.id, competencia: mes(2027, 3), geracao_kwh: '8000.0000', origem: 'local',
  }));
  await emB(() => fatura.comporLote('2027-03-01'));
  faturaB = (await emB(() => fatura.daCompetencia('2027-03-01')))
    .find((f: any) => f.unidade_consumidora_id === ucB.id)!.id;
}

// ===================================================== W1 a identidade
{
  const antes = await emA(() => documento.identidade());
  chk('W1a', antes === null, 'tenant sem identidade le NULL, nao erro - "nao cadastrada" e estado legitimo');

  const i = await emA(() => documento.salvarIdentidade({
    pix_chave: '11222333000181', pix_tipo_chave: 'cnpj',
    pix_recebedor_nome: 'G3 SOLAR LTDA', pix_recebedor_cidade: 'GOIANIA',
  }));
  chk('W1b', i.pix_chave === '11222333000181' && i.tenant_id === A,
    'a identidade grava no tenant corrente');

  // UPSERT por tenant: um tenant, uma identidade. Salvar de novo ATUALIZA.
  await emA(() => documento.salvarIdentidade({
    pix_chave: '11222333000181', pix_tipo_chave: 'cnpj',
    pix_recebedor_nome: 'G3 SOLAR ENERGIA', pix_recebedor_cidade: 'GOIANIA',
  }));
  const depois = await emA(() => documento.identidade());
  chk('W1c', depois!.pix_recebedor_nome === 'G3 SOLAR ENERGIA' && depois!.id === i.id,
    'salvar de novo ATUALIZA a mesma linha (upsert por tenant), nao cria a segunda');

  /*
   * O CHECK `identidade_pix_completo_ou_ausente` E DO BANCO, e este e o teste dele.
   * Pix pela metade - chave sem nome de recebedor - gera BR Code que alguns
   * aplicativos aceitam e outros recusam, e o sintoma aparece no celular de quem ia
   * pagar. O banco recusa antes.
   */
  const e = await lancou(() => emA(() => documento.salvarIdentidade({
    pix_chave: '11222333000181', pix_tipo_chave: 'cnpj',
    pix_recebedor_nome: null, pix_recebedor_cidade: null,
  })));
  chk('W1d', e !== null, `Pix pela metade (chave sem recebedor) e RECUSADO pelo banco: ${e?.constructor?.name}`);

  // Isolamento: o B nao ve a identidade do A.
  const noB = await emB(() => documento.identidade());
  chk('W1e', noB === null, 'o tenant B nao ve a identidade do A (policy, role sem BYPASSRLS)');

  // Papel: `leitura` LE e nao ESCREVE. A matriz e aplicada no repositorio.
  const podeLer = await emALeitura(() => documento.identidade());
  const naoEscreve = await lancou(() => emALeitura(() => documento.salvarIdentidade({ pix_chave: 'x' })));
  chk('W1f', podeLer !== null && naoEscreve !== null,
    'papel `leitura` le a identidade e NAO a escreve (exigir no repositorio, nao no handler)');
}

// ===================================================== W2 a logo, e o gatilho
{
  const png = await emA(() => documento.salvarLogo(PNG));

  /*
   * O MIME E O SHA256 NAO VEM DA APLICACAO. `salvarLogo` grava so o bytea; o
   * gatilho `auditar_logo_de_cobranca` deriva os tres metadados e os carimba na
   * identidade, que e a tabela auditada.
   *
   * O sha256 e conferido contra `node:crypto` - caminho independente do banco. E o
   * que torna a regra 9 verificada e nao declarada.
   */
  chk('W2a', png!.logo_mime === 'image/png' && png!.logo_bytes === PNG.length,
    `o gatilho derivou mime=${png!.logo_mime} e bytes=${png!.logo_bytes} da ASSINATURA do arquivo`);
  chk('W2b', png!.logo_sha256 === sha(PNG),
    `o sha256 do banco == o de node:crypto (${png!.logo_sha256?.slice(0, 16)}…) — o metadado nao pode divergir do conteudo`);

  const jpeg = await emA(() => documento.salvarLogo(JPEG));
  chk('W2c', jpeg!.logo_mime === 'image/jpeg' && jpeg!.logo_sha256 === sha(JPEG),
    'trocar a logo por um JPEG re-deriva mime e hash na mesma linha (upsert por tenant)');

  /*
   * A RECUSA DO SVG E POR BYTES, e ela e o motivo de o gatilho existir. A logo e
   * EMBUTIDA no HTML do documento; SVG executa script. Rotular nao adianta - aqui
   * nao ha rotulo a mandar, e e esse o desenho.
   */
  const eSvg = await lancou(() => emA(() => documento.salvarLogo(SVG)));
  chk('W2d', eSvg !== null, `SVG e recusado pela ASSINATURA, nao pelo rotulo: ${resumo(eSvg)}`);
  const eGif = await lancou(() => emA(() => documento.salvarLogo(GIF)));
  chk('W2e', eGif !== null, 'GIF tambem e recusado - a lista de aceitos e fechada em PNG e JPEG');

  // O conteudo anterior sobrevive a recusa: a transacao que falha nao apaga a logo.
  const aindaLa = await emA(() => documento.identidade());
  chk('W2f', aindaLa!.logo_mime === 'image/jpeg' && aindaLa!.logo_sha256 === sha(JPEG),
    'a recusa do SVG NAO apagou a logo que estava lá (a transacao abortou inteira)');

  // O binario, por rota separada. `Content-Type` de imagem, nao JSON com base64.
  const bin = await emA(() => documento.logo());
  chk('W2g', bin != null && sha(Uint8Array.from(bin.conteudo as Uint8Array)) === sha(JPEG),
    'o binario lido de volta e byte a byte o que entrou');

  // Remover LIMPA o metadado: o hash de uma imagem que nao existe mais mentiria.
  await emA(() => documento.removerLogo());
  const limpa = await emA(() => documento.identidade());
  chk('W2h', limpa!.logo_mime === null && limpa!.logo_bytes === null && limpa!.logo_sha256 === null,
    'remover a logo LIMPA mime, bytes e sha256 na identidade - metadado orfao mentiria');
  chk('W2i', (await emA(() => documento.logo())) === null, 'e o binario sai junto');

  // Sem identidade nao ha logo: a FK e composta e a trilha pendura nela.
  const eSemIdent = await lancou(() => emB(() => documento.salvarLogo(PNG)));
  chk('W2j', eSemIdent instanceof documento.IdentidadeNaoCadastrada && eSemIdent.status === 412,
    'logo sem identidade e 412 com a razao nomeada, nao erro de FK cru');

  // Volta a por a logo, que as verificacoes do documento usam.
  await emA(() => documento.salvarLogo(PNG));
}

// ===================================================== W3 os campos, e o enum
{
  const padrao = await emA(() => documento.campos());
  chk('W3a', padrao.length === 0,
    'sem configuracao a lista e VAZIA, e vazio significa "usa o padrao" - o padrao vive no codigo, nao semeado na migration');

  const n = await emA(() => documento.definirCampos([
    { campo: 'cliente_nome', rotulo: 'Nome do titular' },
    { campo: 'numero_uc' },
    { campo: 'valor_total_centavos', rotulo: 'TOTAL', visivel: true },
    { campo: 'flag_fatura_cheia', visivel: false },
  ] as any));
  const lidos = await emA(() => documento.campos());
  chk('W3b', n === 4 && lidos.length === 4 && lidos[0].campo === 'cliente_nome' && lidos[0].ordem === 0,
    'a ordem vem da POSICAO na lista quando nao e declarada - e a ordem em que a pessoa arrastou');
  chk('W3c', lidos[0].rotulo === 'Nome do titular' && lidos[1].rotulo === null,
    'rotulo ausente fica NULL, e quem resolve o padrao e o dominio - nao a tela');
  chk('W3d', lidos[3].visivel === false, 'campo invisivel e gravado como invisivel, nao removido');

  /*
   * O ENUM `campo_de_fatura` E A MITIGACAO DA DECISAO 2. Eu tinha recomendado layout
   * fixo, e o custo que nomeei foi "campo inexistente vira fatura errada". A decisao
   * aceitou o custo com a validacao NO SCHEMA - entao "o banco recusa" precisa de
   * teste, senao e frase.
   */
  const e = await lancou(() => emA(() => documento.definirCampos([{ campo: 'nao_existe_este_campo' }] as any)));
  chk('W3e', e !== null, `campo fora do enum e RECUSADO pelo banco: ${String(e?.constructor?.name)}`);

  // A lista e a UNIDADE: substituir INTEIRA. E lista vazia volta ao padrao.
  await emA(() => documento.definirCampos([{ campo: 'competencia' }] as any));
  chk('W3f', (await emA(() => documento.campos())).length === 1,
    'definir de novo SUBSTITUI a lista inteira - nao ha PATCH de um campo');
  await emA(() => documento.definirCampos([]));
  chk('W3g', (await emA(() => documento.campos())).length === 0, 'lista vazia volta ao PADRAO');

  const naoEscreve = await lancou(() => emALeitura(() => documento.definirCampos([{ campo: 'competencia' }] as any)));
  chk('W3h', naoEscreve !== null, 'papel `leitura` nao define layout');
}

// ===================================================== W4 o documento, e o QR
{
  const doc = await emA(() => documento.paraFatura(faturaA));

  chk('W4a', doc.fatura_id === faturaA && doc.status === 'rascunho',
    'o documento compoe de uma fatura em rascunho - conferir antes de emitir e o desenho');
  /*
   * O TOTAL E A COLUNA GERADA, REPETIDA - nao um numero recalculado na composicao.
   * A verificacao le a fatura pelo repositorio e exige igualdade, e confere a soma
   * das tres parcelas: se a composicao um dia passar a somar por conta propria, os
   * dois numeros divergem aqui.
   */
  const linhaDaFatura = (await emA(() => fatura.daCompetencia('2027-03-01')))
    .find((f: any) => f.id === faturaA)!;
  const soma = linhaDaFatura.valor_consumo_centavos
    + linhaDaFatura.valor_tarifas_concessionaria_centavos
    + linhaDaFatura.valor_juros_multa_centavos;
  chk('W4b', doc.valor_total_centavos === linhaDaFatura.valor_total_centavos
    && doc.valor_total_centavos === soma,
    `o total do documento == a coluna GERADA da fatura == a soma das parcelas (${doc.valor_total_centavos} centavos)`);
  chk('W4c', doc.linhas.length > 0 && doc.linhas.every((l) => typeof l.valor === 'string'),
    `as ${doc.linhas.length} linhas do padrao vem FORMATADAS do servidor (a tela nao reformata)`);

  chk('W4d', doc.logo?.mime === 'image/png' && doc.logo?.sha256 === sha(PNG),
    'o metadado da logo entra no documento; o binario NAO - a leitura da identidade nao arrasta 300 KB');
  chk('W4e', doc.logo?.data_uri === undefined,
    'sem pedir, a logo NAO vem embutida - base64 custa 33% e a tela busca o binario por rota propria');

  /*
   * A PENDENCIA (c) DA `Q-DOCFATURA-01`. Um consumidor externo - o CRM - nao pode
   * fazer a segunda chamada autenticada a `GET /cobranca/logo`. Com `embutirLogo`
   * ele monta o documento numa requisicao so.
   */
  const comLogo = await emA(() => documento.paraFatura(faturaA, { embutirLogo: true }));
  const b64 = comLogo.logo?.data_uri?.replace(/^data:image\/png;base64,/, '') ?? '';
  chk('W4f', comLogo.logo?.data_uri?.startsWith('data:image/png;base64,') === true
    && sha(Uint8Array.from(Buffer.from(b64, 'base64'))) === sha(PNG),
    'com `embutirLogo` a logo vem em data: URI, e os bytes decodificados batem com o arquivo');

  /*
   * A FAIXA DE PAGAMENTO, ESTADO `pix`: sem A1, QR estatico nosso (decisao 5).
   *
   * O BR Code e verificado por CRC - a mesma funcao que `tests/brcode.ts` usa -, e o
   * QR vem como SVG PRONTO. A tela nao codifica QR, e o CRM tambem nao vai precisar:
   * e a decisao 4 (composicao no servidor) valendo para o desenho tambem.
   */
  chk('W4g', doc.pagamento.tipo === 'pix', `a faixa e Pix estatico enquanto nao houver boleto: ${doc.pagamento.tipo}`);
  if (doc.pagamento.tipo === 'pix') {
    chk('W4h', crcConfere(doc.pagamento.brcode) && doc.pagamento.brcode.includes('br.gov.bcb.pix'),
      'o BR Code do documento tem CRC valido e o GUI do Pix');
    /*
     * O CAMPO 54 EM REAIS, POR TEXTO. A esperada e montada aqui por manipulacao de
     * STRING sobre o total em centavos - sem dividir por 100 e sem float, que e a
     * regra 1 valendo na verificacao tambem. Depois entra no formato `IITT`: id 54,
     * tamanho de dois digitos, valor.
     */
    const c = String(doc.valor_total_centavos).padStart(3, '0');
    const reais = `${c.slice(0, -2)}.${c.slice(-2)}`;
    const campo54 = `54${String(reais.length).padStart(2, '0')}${reais}`;
    chk('W4i', doc.pagamento.brcode.includes(campo54),
      `o campo 54 do BR Code e o total em reais por TEXTO: ${doc.valor_total_centavos} centavos -> "${campo54}"`);
    chk('W4j', doc.pagamento.qr !== null && doc.pagamento.qr.svg.startsWith('<svg ')
      && doc.pagamento.qr.modulos === 4 * doc.pagamento.qr.versao + 17,
      `o QR vem desenhado: versao ${doc.pagamento.qr?.versao}, ${doc.pagamento.qr?.modulos} modulos, nivel ${doc.pagamento.qr?.nivel}`);
    chk('W4k', doc.pagamento.conciliacao === 'manual' && doc.pagamento.qr_motivo === undefined,
      'a conciliacao continua MANUAL - o desenho do QR nao cria `txid` por fatura');
  }

  // Isolamento: a fatura do B e 404 no A, e nao um documento do vizinho.
  const e = await lancou(() => emA(() => documento.paraFatura(faturaB)));
  chk('W4l', e instanceof documento.FaturaSemDocumento && e.status === 404,
    'a fatura do tenant B e 404 no tenant A - seis leituras, seis policies');

  const eInexistente = await lancou(() => emA(() => documento.paraFatura('00000000-0000-4000-8000-000000000000')));
  chk('W4m', eInexistente instanceof documento.FaturaSemDocumento, 'fatura inexistente tambem e 404, com a mesma classe');

  // Papel `leitura` COMPOE o documento: `exigir('ler')`. E o que permite servi-lo a
  // consumidor externo sem abrir superficie de escrita.
  const porLeitura = await emALeitura(() => documento.paraFatura(faturaA));
  chk('W4n', porLeitura.fatura_id === faturaA,
    'papel `leitura` compoe o documento - compor nao escreve, e por isso a rota do CRM e segura');
}

// ===================================================== W5 sem chave Pix, e com boleto
{
  // Estado `nenhuma`: o tenant apaga a chave Pix e nao ha boleto.
  await emA(() => documento.salvarIdentidade({
    pix_chave: null, pix_tipo_chave: null, pix_recebedor_nome: null, pix_recebedor_cidade: null,
  }));
  const semNada = await emA(() => documento.paraFatura(faturaA));
  chk('W5a', semNada.pagamento.tipo === 'nenhuma'
    && semNada.pagamento.motivo.includes('A1'),
    'sem boleto e sem chave Pix a faixa e `nenhuma`, e o motivo NOMEIA o A1 (Q-SICOOB-01)');

  // A logo sobrevive ao apagar do Pix: sao metadados independentes na mesma linha.
  chk('W5b', semNada.logo?.mime === 'image/png',
    'apagar a chave Pix nao apaga a logo - o gatilho so mexe no que e da logo');

  // Volta a chave e emite + registra boleto, para o estado `boleto`.
  await emA(() => documento.salvarIdentidade({
    pix_chave: '11222333000181', pix_tipo_chave: 'cnpj',
    pix_recebedor_nome: 'G3 SOLAR LTDA', pix_recebedor_cidade: 'GOIANIA',
  }));
  await emA(() => fatura.emitir(faturaA));
  await emA(() => boletoRepo.registrar(faturaA, new CobrancaFalsa('SICOOB-T')));

  const comBoleto = await emA(() => documento.paraFatura(faturaA));
  chk('W5c', comBoleto.pagamento.tipo === 'boleto',
    'com boleto registrado a faixa vira `boleto` - a PRECEDENCIA e do banco, nao do Pix estatico');
  if (comBoleto.pagamento.tipo === 'boleto') {
    chk('W5d', (comBoleto.pagamento.linha_digitavel ?? '').length > 0,
      `a linha digitavel do adaptador entra na faixa (${(comBoleto.pagamento.linha_digitavel ?? '').slice(0, 20)}…)`);
    // O Pix DO BANCO tambem ganha desenho: ele tem `txid` e concilia sozinho, entao
    // desenhar so o pior dos dois seria estranho.
    const temPix = (comBoleto.pagamento.pix_copia_e_cola ?? '').length > 0;
    chk('W5e', !temPix || comBoleto.pagamento.qr !== null,
      temPix
        ? `o Pix do BOLETO tambem vem desenhado (versao ${comBoleto.pagamento.qr?.versao})`
        : 'o adaptador falso nao devolveu Pix nesta fatura, e sem Pix nao ha QR a desenhar');
  }
}

// ===================================================== W6 o total nulo, medido
{
  /*
   * ESTE E O CASO QUE A SESSAO 14 CORRIGIU EM MIM, e a verificacao aqui e do
   * CONTORNO dele, nao do caminho. Eu havia escrito que toda coluna de dinheiro era
   * `NOT NULL` e que "zero ali e zero de verdade". Falso: `valor_total_centavos` e
   * `GENERATED ALWAYS` e a coluna ACEITA nulo - e `faixaDePagamento` tem um ramo que
   * recusa montar QR sem valor, porque um QR sem valor deixa o cliente digitar a
   * quantia.
   *
   * O QUE ESTE TESTE HONESTAMENTE PROVA: o ramo e INALCANCAVEL pelo caminho da
   * aplicacao hoje, porque as tres colunas de entrada da expressao gerada sao
   * `NOT NULL`. Ele e defensivo, nao morto - e esta verificacao existe para que
   * tornar qualquer uma das tres nullable FALHE AQUI, em vez de a fatura passar a
   * imprimir "R$ 0,00" para um total desconhecido.
   */
  const cols: Array<{ column_name: string; is_nullable: string; is_generated: string }> =
    await emA(() => db().$queryRawUnsafe(`
      SELECT column_name, is_nullable, is_generated FROM information_schema.columns
       WHERE table_name = 'fatura' AND column_name IN
             ('valor_consumo_centavos','valor_tarifas_concessionaria_centavos',
              'valor_juros_multa_centavos','valor_total_centavos')`));
  const entradas = cols.filter((c) => c.column_name !== 'valor_total_centavos');
  const total = cols.find((c) => c.column_name === 'valor_total_centavos')!;
  chk('W6a', entradas.length === 3 && entradas.every((c) => c.is_nullable === 'NO'),
    `as 3 entradas da expressao gerada sao NOT NULL (${entradas.map((c) => c.is_nullable).join(',')}) — e o que torna o total sempre presente pelo caminho da aplicacao`);
  chk('W6b', total.is_generated === 'ALWAYS' && total.is_nullable === 'YES',
    'valor_total_centavos e GENERATED ALWAYS e a COLUNA aceita nulo — medido, contra o que eu tinha escrito');
}

// ===================================================== W7 o QR de conferencia
/*
 * O CAMINHO QUE NAO DEPENDE DE FATURA, e ele existe por uma medicao: em 30/07
 * producao tinha 0 contratos, 0 faturas e 39 UCs sem `data_vencimento`, entao o
 * unico teste que nenhuma verificacao automatica substitui - ler o QR com uma
 * camera - estava atras de tres bloqueios de insumo humano.
 *
 * O QUE ESTAS VERIFICACOES PRENDEM, e nao e o desenho: `tests/qrcode.ts` ja prova
 * a matriz com 45 verificacoes. Aqui o que importa e que este caminho use as
 * MESMAS funcoes que a fatura usa. Um QR de conferencia desenhado por caminho
 * paralelo daria confianca sobre uma coisa que nao e a que vai para o cliente.
 */
{
  const q = await emA(() => documento.qrDeConferencia(123_45));
  chk('W7a', q.qr !== null && q.qr!.modulos > 20 && crcConfere(q.brcode),
      `o QR sai desenhado e o BR Code tem CRC valido (versao ${q.qr?.versao}, ${q.qr?.modulos} modulos) - `
      + 'sem fatura nenhuma no caminho');

  chk('W7b', q.brcode.includes('5406123.45') && q.valor_centavos === 123_45,
      'o campo 54 e o valor DIGITADO formatado por texto - 12345 centavos viram "5406123.45", a '
      + 'mesma conversao que a fatura usa');

  /*
   * A IDENTIDADE E A MESMA, e esta e a verificacao que impede o caminho paralelo:
   * recebedor e cidade vem da linha do banco, nao de constante do codigo.
   */
  const ident = await emA(() => documento.identidade());
  chk('W7c', q.recebedor === ident!.pix_recebedor_nome && q.cidade === ident!.pix_recebedor_cidade,
      'recebedor e cidade saem da identidade REAL do tenant, e nao de valor fixo - e o que faz este '
      + 'QR provar alguma coisa sobre o QR de verdade');

  chk('W7d', /NAO confirme o pagamento/.test(q.aviso),
      'o aviso de que a chave e REAL viaja no PAYLOAD e nao so na tela - o CRM consome esta mesma '
      + 'API, e um consumidor que pintasse o QR sem o aviso poria a chave do tenant na frente de '
      + 'alguem sem dizer que ela e real');

  const semValor = await lancou(() => emA(() => documento.qrDeConferencia(0)));
  const fracionado = await lancou(() => emA(() => documento.qrDeConferencia(12.5 as any)));
  chk('W7e', semValor?.status === 422 && fracionado?.status === 422,
      'valor zero e valor fracionario sao RECUSADOS com 422 - um Pix sem valor deixaria quem le '
      + 'digitar a quantia, e e o mesmo motivo pelo qual a fatura sem total nao ganha faixa');

  const daLeitura = await emALeitura(() => documento.qrDeConferencia(100));
  chk('W7f', daLeitura.qr !== null,
      'o papel `leitura` conferre o QR - a rota e GET e nao escreve nada, entao exigir escrita aqui '
      + 'seria pedir permissao que a operacao nao precisa ter');
}

console.log(falhas === 0
  ? `\nTODAS as verificacoes do documento passaram.`
  : `\n${falhas} FALHA(S) no documento.`);
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
