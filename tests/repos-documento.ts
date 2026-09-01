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
import { codigoDeBarrasDaLinha, montarLinhaDigitavel } from '../src/dominio/linha-digitavel.ts';
import { dbt } from '../src/db/tipado.ts';

/*
 * O ENDERECO DO PAGADOR NA FIXTURE, e ele nao e enfeite.
 *
 * `boleto.registrar()` recusa com `PagadorSemEndereco` (422) ANTES de tocar a
 * porta desde 30/08/2026 - a Sicoob marca logradouro, bairro, cidade, CEP e UF
 * como obrigatorios no pagador, e sem a guarda a primeira emissao em lote poria
 * boletos numa fila que nunca desiste, retentando contra um campo que so uma
 * pessoa preenche.
 *
 * Toda fixture que EMITE precisa dele, e nenhuma tinha: o CI nao rodava quando a
 * guarda entrou, entao a quebra so apareceu em 01/09. A guarda continua coberta
 * onde deve estar, em `tests/repos-enderecos.ts` (E1a-E1e), com fixture propria.
 */
const ENDERECO_DO_PAGADOR = {
  endereco_logradouro: 'Rua do Teste', endereco_bairro: 'Centro',
  endereco_municipio: 'Goiania', endereco_uf: 'GO', endereco_cep: '74000-000',
} as const;


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
let ucId: string; let faturaA: string; let faturaB: string; let usinaA: string;

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
/*
 * A TARIFA DEIXOU DE SER FIXTURE em 14/08 (migration 30): ela e coluna da UC, e
 * `ucRepo.criar` a carimba junto com o resto do cadastro. A funcao
 * `garantirTarifa` que existia aqui abria vigencia na tabela `tarifa`, que saiu.
 *
 * O invariante que ela protegia continua valendo e continua sendo exercitado: UC
 * sem tarifa faz `comporLote` LEVANTAR (R26) - `tests/regras.sql` mede isso
 * diretamente contra `app.tarifa_da_uc`.
 */

{
  const u = await emA(() => usinaRepo.criar({ codigo_geradora: 'DOC-0001', distribuidora: DISTRIB }));
  const uc = await emA(() => ucRepo.criar({
    cliente_id: CLI, numero_uc: 'DOC-UC-1', distribuidora: DISTRIB, tarifa_reais_por_kwh: '1.000000',
    ...ENDERECO_DO_PAGADOR,
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
  /* A CHAVE VEM ANTES DO LOTE, e a ordem e a propria regra: `comporLote`
   * CARIMBA a chave padrao em cada fatura (migration 25). Compor antes de haver
   * chave produz fatura sem faixa de pagamento - estado legitimo, e e o que a
   * W5 exercita de proposito. */
  usinaA = u.id;
  const chaveA = await emA(() => documento.criarChavePix({
    apelido: 'G3 SOLAR LTDA', tipo: 'cnpj', chave: '11222333000181',
    recebedor_nome: 'G3 SOLAR LTDA', recebedor_cidade: 'GOIANIA',
  }));
  await emA(() => documento.salvarIdentidade({ chave_pix_padrao_id: chaveA.id }));

  await emA(() => fatura.comporLote('2027-03-01', {
    tarifas_concessionaria_centavos: { [uc.id]: 5_000 },
  }));
  faturaA = (await emA(() => fatura.daCompetencia('2027-03-01')))
    .find((f: any) => f.unidade_consumidora_id === uc.id)!.id;

  // Uma fatura no tenant B, para o teste de isolamento ter alvo real. A fixture do
  // `repos.sh` da ao B a mesma usina? Nao - o B tem so o vinculo do admin, entao
  // aqui se monta o minimo.
  const uB = await emB(() => usinaRepo.criar({ codigo_geradora: 'DOC-B-0001', distribuidora: DISTRIB }));
  // O cliente do B nao existe na fixture; `cliente_id` do A nao atravessa (FK
  // composta, regra 2). Cria-se um cliente do B pelo caminho do repo.
  const clienteB = await emB(async () => {
    const { criar } = await import('../src/repos/cliente.ts');
    return criar({ nome: 'Cliente do B', documento_bruto: '529.982.247-25' });
  });
  const ucB = await emB(() => ucRepo.criar({
    cliente_id: clienteB.id, numero_uc: 'DOC-B-UC-1', distribuidora: DISTRIB, tarifa_reais_por_kwh: '1.000000',
    ...ENDERECO_DO_PAGADOR,
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

// ============================== W1 o banco de chaves Pix e a identidade
//
// ESTE BLOCO MUDOU DE FORMA na migration 25, e a mudanca merece nota porque uma
// das verificacoes NAO TEM MAIS COMO EXISTIR: a `W1d` afirmava o CHECK
// `identidade_pix_completo_ou_ausente`, que recusava "Pix pela metade" nas
// quatro colunas soltas. As colunas sairam, o CHECK saiu com elas, e a GARANTIA
// nao - ela mudou de mecanismo: agora a chave e uma LINHA com tres colunas
// `NOT NULL`, e linha nao existe pela metade. A W1d passou a afirmar isso.
//
// Apagar a verificacao teria perdido a garantia de vista; deixa-la como estava
// seria medir um CHECK que nao existe. E a mesma escolha da `Y5c` na sessao 22.
{
  // O tenant B nao tem identidade: "nao cadastrada" e estado legitimo, e o
  // caminho que le tem de devolver NULL em vez de levantar.
  chk('W1a', (await emB(() => documento.identidade())) === null,
    'tenant sem identidade le NULL, nao erro - "nao cadastrada" e estado legitimo');

  const k = (await emA(() => documento.chavesPix()))[0]!;
  chk('W1b', k.chave === '11222333000181' && k.tenant_id === A && k.apelido === 'G3 SOLAR LTDA',
    'a chave da fixture esta cadastrada no tenant corrente, com apelido proprio');

  const lida = await emA(() => documento.identidade());
  chk('W1c', lida!.chave_pix_padrao_id === k.id && lida!.chave_pix!.chave === '11222333000181',
    'a identidade APONTA para a chave, e `identidade()` a traz junto - uma leitura, nao duas');

  /*
   * A GARANTIA DO ANTIGO CHECK, no mecanismo novo. "Pix pela metade" gerava um
   * BR Code que alguns aplicativos aceitam e outros recusam, com o sintoma no
   * celular de quem ia pagar. Agora a recusa e da aplicacao e vem NOMEADA, com o
   * campo que falta - o `NOT NULL` sozinho devolveria a coluna crua.
   */
  const meia = await lancou(() => emA(() => documento.criarChavePix({
    apelido: 'incompleta', tipo: 'cnpj', chave: '11222333000181',
    recebedor_nome: 'G3 SOLAR LTDA', recebedor_cidade: '',
  })));
  chk('W1d', meia !== null && /cidade do recebedor/.test(String(meia)),
    `chave sem cidade e RECUSADA, nomeando o campo: ${String(meia).slice(0, 60)}`);

  /*
   * A GUARDA DA CHAVE pelo caminho do repositorio, nos dois sentidos. A suite
   * pura `tests/chave-pix.ts` ja exercita a funcao; o que se afirma AQUI e que
   * ela esta LIGADA - `Q-PECA-NAO-PLUGADA-01` e a classe que este projeto
   * registrou depois de achar tres pecas prontas e nao plugadas numa tarde.
   */
  const comMascara = await emA(() => documento.criarChavePix({
    apelido: 'com mascara', tipo: 'cnpj', chave: '11.222.333/0001-81',
    recebedor_nome: 'G3 SOLAR LTDA', recebedor_cidade: 'GOIANIA',
  }).catch((e) => e));
  chk('W1g', comMascara instanceof Error && /unicidade|Unico|constraint|P2002/i.test(String(comMascara)),
    'a mascara e NORMALIZADA antes de gravar - por isso ela colide com a chave que ja existe, '
    + 'em vez de virar uma segunda linha apontando para o mesmo destino');

  const digitoErrado = await lancou(() => emA(() => documento.criarChavePix({
    apelido: 'digito errado', tipo: 'cnpj', chave: '11222333000182',
    recebedor_nome: 'G3 SOLAR LTDA', recebedor_cidade: 'GOIANIA',
  })));
  chk('W1h', digitoErrado !== null && /ChavePixInvalida/.test(String(digitoErrado?.constructor?.name ?? digitoErrado)),
    'digito verificador que nao fecha e recusado pelo REPOSITORIO, e nao pela Sicoob depois');

  // Apontar chave que nao e deste tenant: a FK composta recusaria com 23503
  // generico, e a guarda nomeia o id antes disso.
  const forasteira = await lancou(() => emA(() =>
    documento.salvarIdentidade({ chave_pix_padrao_id: '00000000-0000-4000-8000-000000000000' })));
  chk('W1i', forasteira !== null, 'apontar chave inexistente ou de outro tenant e recusado, com o id nomeado');

  // Isolamento: o B nao ve a identidade nem a chave do A.
  const noB = await emB(() => documento.identidade());
  const chavesNoB = await emB(() => documento.chavesPix());
  chk('W1e', noB === null && chavesNoB.length === 0,
    'o tenant B nao ve a identidade nem as chaves do A (policy, role sem BYPASSRLS)');

  // Papel: `leitura` LE e nao ESCREVE. A matriz e aplicada no repositorio.
  const podeLer = await emALeitura(() => documento.chavesPix());
  const naoEscreve = await lancou(() => emALeitura(() => documento.criarChavePix({
    apelido: 'x', tipo: 'cnpj', chave: '11222333000181',
    recebedor_nome: 'X', recebedor_cidade: 'GOIANIA',
  })));
  chk('W1f', podeLer !== null && naoEscreve !== null,
    'papel `leitura` le as chaves e NAO as escreve (exigir no repositorio, nao no handler)');

  /*
   * W1j a W1m — `editarChavePix`, que ate 06/08 NAO TINHA TESTE e NAO TINHA
   * CHAMADOR. A rota `PUT /cobranca/chaves-pix/:id` existia desde a migration 25,
   * a aba Documento so cadastra, e nenhum script a alcancava: `Q-PECA-NAO-
   * PLUGADA-01` de novo, e desta vez na peca que a `RETOMADA-2026-08-06` §2
   * chamava de "um comando" para alinhar o nome do recebedor ao do DICT.
   *
   * O motivo de existir agora e concreto: o nome que o DICT devolve
   * ("consorcio G gestao solar") e o do campo 59 do BR Code nao sao o mesmo, e
   * corrigir isso pelo cadastro e impossivel - `chave_pix_chave_unica` recusa a
   * mesma chave. A alternativa seria `UPDATE` a mao, por fora do contexto de
   * tenant e da conferencia de chave.
   */
  const paraEditar = await emA(() => documento.criarChavePix({
    apelido: 'a corrigir', tipo: 'cnpj', chave: '19131243000197',
    recebedor_nome: 'NOME ANTIGO', recebedor_cidade: 'GOIANIA',
    titular_nome: 'G3 GESTAO ENERGIA SOLAR LTDA', titular_documento: '19131243000197',
    observacao: 'conferida no DICT',
  }));

  const corrigida = await emA(() => documento.editarChavePix(paraEditar.id, {
    apelido: paraEditar.apelido, tipo: 'cnpj', chave: paraEditar.chave,
    recebedor_nome: 'NOME NOVO', recebedor_cidade: paraEditar.recebedor_cidade,
    titular_nome: paraEditar.titular_nome, titular_documento: paraEditar.titular_documento,
    observacao: paraEditar.observacao, ativa: paraEditar.ativa,
  }));
  chk('W1j', corrigida.recebedor_nome === 'NOME NOVO' && corrigida.id === paraEditar.id,
    'editar troca o nome do recebedor NA MESMA LINHA - a fatura guarda `chave_pix_id`, e uma linha nova a deixaria apontando para o texto velho');
  chk('W1k', corrigida.titular_nome === 'G3 GESTAO ENERGIA SOLAR LTDA' && corrigida.observacao === 'conferida no DICT',
    'titular e observacao SOBREVIVEM quando sao passados de volta - e o que o script tem de fazer');

  /*
   * O SENTIDO PERIGOSO, afirmado de proposito: `editarChavePix` reescreve a
   * linha INTEIRA, e `texto(undefined)` e NULL. Quem chamar sem devolver os tres
   * campos APAGA os tres, sem erro. Isto nao e um defeito a consertar aqui - e o
   * contrato do repositorio -, e a verificacao existe para que o dia em que
   * alguem mudar isso nao passe em silencio pelos chamadores.
   */
  const semTitular = await emA(() => documento.editarChavePix(paraEditar.id, {
    apelido: paraEditar.apelido, tipo: 'cnpj', chave: paraEditar.chave,
    recebedor_nome: 'NOME NOVO', recebedor_cidade: paraEditar.recebedor_cidade,
  }));
  chk('W1l', semTitular.titular_nome === null && semTitular.observacao === null,
    'editar SEM devolver titular/observacao os APAGA - o contrato e "a linha inteira", e o script devolve os tres por isso');

  // Editar NAO escolhe a padrao. Sao dois atos, e a aba Documento os separa em
  // dois botoes pelo mesmo motivo: um acrescenta destino, o outro decide destino.
  const identDepois = await emA(() => documento.identidade());
  chk('W1m', identDepois!.chave_pix_padrao_id !== paraEditar.id,
    'editar uma chave NAO a torna a padrao - trocar o destino do proximo lote sem ninguem pedir seria a tela decidindo');
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

    /*
     * O QUE A FAIXA DO MODELO G3 IMPRIME, e ele entrou em 12/08 (`PLANO-documento-
     * modelo-g3-2026-08-12.md` §6). As tres verificacoes abaixo prendem a coisa que
     * o desenho novo poderia perder em silencio: a faixa passou a mostrar quem
     * recebe, quando vence e quanto e - e nenhum dos tres pode ser reformatado pela
     * tela, porque `emReais` existe nos dois lados e duas formatacoes do mesmo total
     * e como duas telas passam a discordar.
     *
     * W4o compara com a LINHA do documento em vez de com uma constante: se o
     * formatador mudar, os dois mudam juntos ou a verificacao cai. Uma string
     * cravada aqui concordaria comigo por construcao e deixaria a divergencia
     * passar, que e exatamente o defeito que ela existe para prender.
     */
    chk('W4o', doc.pagamento.recebedor_nome === 'G3 SOLAR LTDA',
      `a faixa diz QUEM recebe por extenso, sem obrigar a decodificar o BR Code: "${doc.pagamento.recebedor_nome}"`);

    const linhaDoTotal = doc.linhas.find((l) => l.campo === 'valor_total_centavos');
    chk('W4p', doc.pagamento.valor_br === linhaDoTotal?.valor,
      `o valor da faixa e o MESMO texto da linha do total, pelo mesmo formatador `
      + `(faixa "${doc.pagamento.valor_br}" == linha "${linhaDoTotal?.valor}")`);

    const linhaDoVenc = doc.linhas.find((l) => l.campo === 'vencimento');
    chk('W4q', doc.pagamento.vencimento_br === linhaDoVenc?.valor
      && /^\d{2}\/\d{2}\/\d{4}$/.test(doc.pagamento.vencimento_br),
      `o vencimento da faixa vem FORMATADO e igual ao da linha: "${doc.pagamento.vencimento_br}"`);
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
  /*
   * Estado `nenhuma`, e desde a migration 25 ele NAO se produz apagando a chave
   * do tenant: a fatura carrega a SUA, e apagar o padrao nao mexe no que ja foi
   * carimbado - que e exatamente a garantia que o congelamento existe para dar.
   *
   * O estado real e outro e continua acontecendo: fatura composta quando nao
   * havia chave padrao. E o caso de toda fatura anterior a esta migration.
   */
  const chavePadrao = (await emA(() => documento.identidade()))!.chave_pix_padrao_id!;
  await emA(() => documento.salvarIdentidade({ chave_pix_padrao_id: null }));

  await emA(() => usinaRepo.registrarGeracao({
    usina_id: usinaA, competencia: mes(2027, 4), geracao_kwh: '8000.0000', origem: 'local',
  }));
  await emA(() => fatura.comporLote('2027-04-01', {
    tarifas_concessionaria_centavos: { [ucId]: 5_000 },
  }));
  const semChave = (await emA(() => fatura.daCompetencia('2027-04-01')))
    .find((f: any) => f.unidade_consumidora_id === ucId)!.id;

  const semNada = await emA(() => documento.paraFatura(semChave));
  chk('W5a', semNada.pagamento.tipo === 'nenhuma'
    && semNada.pagamento.motivo.includes('A1'),
    'fatura composta SEM chave padrao: a faixa e `nenhuma`, e o motivo NOMEIA o A1 (Q-SICOOB-01)');

  // E o congelamento pelo outro lado: a faturaA, composta COM chave, continua
  // com a dela mesmo com o padrao do tenant apagado.
  const aindaTem = await emA(() => documento.paraFatura(faturaA));
  chk('W5b', aindaTem.pagamento.tipo === 'pix' && aindaTem.logo?.mime === 'image/png',
    'apagar o padrao do tenant NAO tira a faixa da fatura ja composta - ela carrega a chave dela '
    + '- e a logo continua, porque sao metadados independentes');

  // Volta o padrao e emite + registra boleto, para o estado `boleto`.
  await emA(() => documento.salvarIdentidade({ chave_pix_padrao_id: chavePadrao }));
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

    /*
     * A CONFERENCIA RODOU E PASSOU, e as duas metades da frase importam. O
     * adaptador falso passou a montar linha estruturalmente real em 14/08
     * exatamente para exercer este caminho - se ele ainda devolvesse o formato
     * inventado de antes, W5f falharia aqui e a unica saida seria uma excecao
     * para dado de teste DENTRO da regra de recusa.
     */
    chk('W5f', comBoleto.pagamento.conferencia.conferida
            && comBoleto.pagamento.conferencia.divergencias.length === 0,
      'o boleto do adaptador passa nas quatro verificacoes e bate com valor e vencimento da fatura');

    const daLinha = codigoDeBarrasDaLinha(comBoleto.pagamento.linha_digitavel ?? '');
    chk('W5g', daLinha !== null && daLinha === comBoleto.pagamento.codigo_barras,
      'o codigo de barras remontado da linha e IGUAL ao que o adaptador gravou - nada comparava os dois ate 14/08');

    /* A `Q-DOCG3-08` FECHADA, medida no payload. A fixture nao cadastra razao
     * social, entao o esperado aqui e `null` - e `null` e a resposta certa, nao a
     * ausencia de teste: e o valor que faz a faixa OMITIR o campo em vez de
     * imprimir "—" sob o rotulo do aviso anti-golpe. */
    chk('W5k', comBoleto.pagamento.beneficiario === null,
      'sem razao social cadastrada o beneficiario do boleto e `null` - e a faixa omite, nao imprime travessao');

    chk('W5l', (comBoleto.pagamento.linha_digitavel_br ?? '').split(' ').length === 5
            && (comBoleto.pagamento.linha_digitavel_br ?? '').replace(/\D/g, '')
               === comBoleto.pagamento.linha_digitavel,
      `a linha viaja TAMBEM em grupos, e os digitos dos dois campos sao os mesmos (${comBoleto.pagamento.linha_digitavel_br})`);
  }
}

// ============================== W5h a RECUSA, no caminho real (`Q-DOCG3-13`)
{
  /*
   * O INVARIANTE DA DECISAO DE 14/08, e ele precisa de teste no caminho REAL e
   * nao so no modulo puro (regra 8): boleto que nao confere com a fatura NAO tem
   * documento composto. As verificacoes L8* de `tests/linha-digitavel.ts` provam
   * que `conferirBoleto` acha a divergencia; esta prova que `paraFatura` RECUSA
   * por causa dela - que e coisa diferente, e e a que o cliente sente.
   *
   * O ESTRAGO E FEITO NO BANCO, direto na coluna, e nao pela porta: a porta nao
   * tem como registrar boleto errado de proposito, e simular isso nela testaria a
   * simulacao. Um digito trocado na linha e exatamente o que uma resposta
   * truncada da Sicoob produziria.
   */
  const antes = await emA(() => documento.paraFatura(faturaA));
  const linhaBoa = antes.pagamento.tipo === 'boleto' ? (antes.pagamento.linha_digitavel ?? '') : '';
  const corrompida = linhaBoa.slice(0, 3) + String((Number(linhaBoa[3]) + 1) % 10) + linhaBoa.slice(4);

  await emA(() => dbt().boleto.updateMany({
    where: { fatura_id: faturaA }, data: { linha_digitavel: corrompida },
  }));

  const recusa = await lancou(() => emA(() => documento.paraFatura(faturaA)));
  chk('W5h', recusa?.name === 'BoletoNaoConfere' && (recusa as { status?: number }).status === 409,
    `um digito trocado na linha e o documento NAO compoe: ${recusa?.name} (${(recusa as { status?: number })?.status})`);
  chk('W5i', String(recusa?.message ?? '').includes('campo 1'),
    'a mensagem NOMEIA o que falhou, e nao so diz "nao confere" - quem le tem de saber onde procurar');

  // E o valor divergente, que os verificadores NAO pegam sozinhos: a linha
  // continua valida, o que discorda e o total. E o buraco medido em L2e.
  await emA(() => dbt().boleto.updateMany({
    where: { fatura_id: faturaA }, data: { linha_digitavel: linhaBoa },
  }));
  const outraLinha = montarLinhaDigitavel({
    vencimento_iso: String(antes.pagamento.tipo === 'boleto' ? antes.pagamento.vencimento_br : '')
      .split('/').reverse().join('-'),
    valor_centavos: 1, campoLivre: '9'.repeat(25),
  });
  await emA(() => dbt().boleto.updateMany({
    where: { fatura_id: faturaA },
    data: { linha_digitavel: outraLinha.linha, codigo_barras: outraLinha.codigo_barras },
  }));
  const porValor = await lancou(() => emA(() => documento.paraFatura(faturaA)));
  chk('W5j', porValor?.name === 'BoletoNaoConfere'
          && String(porValor.message).includes('R$ 0,01'),
    'LINHA VALIDA com valor errado tambem recusa, e a mensagem diz os DOIS valores - '
    + 'e o caso que os digitos verificadores nao pegam (1 em 5 escapa, medido em L2e)');

  // Devolve o estado, para nao contaminar as verificacoes seguintes.
  await emA(() => dbt().boleto.updateMany({
    where: { fatura_id: faturaA },
    data: { linha_digitavel: linhaBoa, codigo_barras: codigoDeBarrasDaLinha(linhaBoa) },
  }));
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
  chk('W7c', q.recebedor === ident!.chave_pix!.recebedor_nome && q.cidade === ident!.chave_pix!.recebedor_cidade,
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
