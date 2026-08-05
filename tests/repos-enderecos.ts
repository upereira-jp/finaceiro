// O LANCAMENTO EM LOTE do ENDERECO DO PAGADOR, com banco e pela role SEM
// BYPASSRLS. Uso: bash tests/repos.sh
//
// O QUE `tests/planilha-enderecos.ts` NAO ALCANCA. Aquela suite prova a LEITURA
// do arquivo - UF, CEP, obrigatorios, cabecalho. Esta prova o que so existe no
// banco, e sao quatro coisas:
//
//   1. O PARCIAL. Endereco e o unico insumo do projeto que pode estar PELA
//      METADE - cinco campos e um vazio -, e uma UC assim nao e "pronta" nem
//      "vazia". Sem banco nao ha como distinguir as duas.
//   2. AUSENTE NAO E ZERO: a UC que a planilha nao cobriu fica como estava. O
//      lancamento nao apaga endereco de quem nao veio.
//   3. A SEGUNDA PASSADA E VAZIA, e ela conta o COMPLEMENTO: reimportar o mesmo
//      arquivo sai com `aplicados` em zero, e corrigir SO o complemento sai como
//      aplicado - comparar so os seis obrigatorios engoliria essa correcao.
//   4. O ISOLAMENTO: UC do tenant B e uma UC desconhecida, nao erro de permissao.
//
// E a QUINTA, que e a razao de este arquivo existir e nao uma conveniencia de
// cadastro: **o pagador do boleto passa a ter endereco**. O `Y5` monta o pagador
// pelo MESMO caminho que `src/repos/boleto.ts` monta, antes e depois do lote.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { withTenantEm, db } from '../src/db/contexto.ts';
import { criarPools } from '../src/db/pools.ts';
import * as clienteRepo from '../src/repos/cliente.ts';
import * as ucRepo from '../src/repos/unidade_consumidora.ts';
import { lerPlanilhaDeEnderecos } from '../src/dominio/planilha-enderecos.ts';

const CONN = process.env.TEST_DATABASE_URL ?? 'postgresql://app_financeiro_login:spike@127.0.0.1:5432/fin_repos';
const A = process.env.TEST_TENANT_A!;
const B = process.env.TEST_TENANT_B!;
const U = process.env.TEST_USUARIO_ADMIN!;

const pools = criarPools(CONN);
const prisma = new PrismaClient({ adapter: new PrismaPg(pools.transacional) });
const emA = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: A, usuarioId: U }, () => f());
const emB = <T>(f: () => Promise<T>) => withTenantEm(prisma as any, { tenantId: B, usuarioId: U }, () => f());

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const CAB = 'numero_uc;logradouro;numero;complemento;bairro;municipio;uf;cep\n';

/** O mapa que o script monta, pelo MESMO leitor que ele usa. Monta-lo a mao aqui
 *  testaria o repositorio contra uma leitura que nao e a de producao. */
const mapaDe = (csv: string) => new Map(lerPlanilhaDeEnderecos(csv).linhas.map((l) => [l.numero_uc, {
  logradouro: l.logradouro, numero: l.numero, complemento: l.complemento,
  bairro: l.bairro, municipio: l.municipio, uf: l.uf, cep: l.cep,
}]));

const enderecoDe = async (numero: string): Promise<any> => {
  const r: any[] = await emA(() => db().$queryRawUnsafe(
    `SELECT endereco_logradouro AS logradouro, endereco_numero AS numero,
            endereco_complemento AS complemento, endereco_bairro AS bairro,
            endereco_municipio AS municipio, endereco_uf AS uf, endereco_cep AS cep
       FROM unidade_consumidora WHERE numero_uc = $1`, numero));
  return r[0];
};

// ================================================================ fixture
//
// Quatro UCs do tenant A, e cada uma existe por uma razao:
//   END-1  vazia                  - o caminho normal
//   END-2  PARCIAL (so tres)      - o estado que nao e nem pronto nem vazio
//   END-3  ja completa            - a segunda passada, e o complemento
//   END-4  fora da planilha       - ausente nao e zero
{
  const c = await emA(() => clienteRepo.criar({ nome: 'END pagador' }));
  for (const n of ['END-1', 'END-2', 'END-3', 'END-4']) {
    await emA(() => ucRepo.criar({ cliente_id: c.id, numero_uc: n, distribuidora: 'Equatorial' }));
  }
  // A END-2 nasce PELA METADE: logradouro, municipio e UF, sem numero, bairro e CEP.
  await emA(() => db().$queryRawUnsafe(
    `UPDATE unidade_consumidora
        SET endereco_logradouro = 'Rua Antiga', endereco_municipio = 'Goiania', endereco_uf = 'GO'
      WHERE numero_uc = 'END-2'`));
  // A END-4 tambem, para provar que o lote nao a apaga.
  await emA(() => db().$queryRawUnsafe(
    `UPDATE unidade_consumidora
        SET endereco_logradouro = 'Rua Intocada', endereco_cep = '74000001'
      WHERE numero_uc = 'END-4'`));

  const cB = await emB(() => clienteRepo.criar({ nome: 'END do outro tenant' }));
  await emB(() => ucRepo.criar({ cliente_id: cB.id, numero_uc: 'END-B', distribuidora: 'Equatorial' }));
}

// ---------------------------------------------------- Y1 o caminho inteiro
{
  const r = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(
    CAB
    + 'END-1;Rua das Flores;120;Apto 302;Setor Bueno;Goiania;GO;74210-030\n'
    + 'END-NAO-EXISTE;Rua X;1;;Centro;Goiania;GO;74000-010\n')));

  chk('Y1a', r.aplicados.length === 1 && r.aplicados[0]!.numero_uc === 'END-1',
      `uma UC recebe endereco (aplicados=${r.aplicados.length})`);
  chk('Y1b', r.sem_uc.length === 1 && r.sem_uc[0]!.numero_uc === 'END-NAO-EXISTE',
      'UC que nao existe e recusa contada, nao excecao - planilha e banco discordando e caso de gente');

  const e = await enderecoDe('END-1');
  chk('Y1c', e.logradouro === 'Rua das Flores' && e.numero === '120' && e.bairro === 'Setor Bueno',
      'os campos de texto chegam como digitados');
  chk('Y1d', e.cep === '74210030',
      `o CEP e gravado SEM mascara - oito digitos (${e.cep})`);
  chk('Y1e', e.uf === 'GO', 'e a UF em caixa alta, normalizada por `editar()` e nao por este modulo');
  chk('Y1f', e.complemento === 'Apto 302', 'o complemento entra quando ha');
  chk('Y1g', r.aplicados[0]!.antes === null,
      'e o relatorio diz que ANTES estava vazio - nao "(nulo)", que ninguem le como vazio');
}

// ---------------------------------------------------- Y2 o parcial
{
  const antes = await enderecoDe('END-2');
  chk('Y2a', antes.logradouro === 'Rua Antiga' && antes.numero === null && antes.cep === null,
      'a END-2 comeca PELA METADE: tres campos preenchidos e tres vazios');

  const r = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(
    CAB + 'END-2;Rua Nova;45;;Setor Oeste;Goiania;GO;74110-020\n')));

  chk('Y2b', r.aplicados.length === 1 && r.aplicados[0]!.antes !== null,
      'o parcial conta como TENDO algo antes - e o que distingue correcao de primeira coleta');
  chk('Y2c', r.aplicados[0]!.antes!.includes('Rua Antiga') && r.aplicados[0]!.depois.includes('Rua Nova'),
      `o relatorio mostra antes e depois ("${r.aplicados[0]!.antes}" -> "${r.aplicados[0]!.depois}")`);

  const depois = await enderecoDe('END-2');
  chk('Y2d', depois.logradouro === 'Rua Nova' && depois.numero === '45' && depois.cep === '74110020',
      'e os seis campos ficam com o valor novo, inclusive os que estavam vazios');
}

// ---------------------------------------------------- Y3 a segunda passada
{
  const arquivo = CAB + 'END-3;Rua Terceira;7;Casa;Centro;Anapolis;GO;75020-010\n';

  const r1 = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(arquivo)));
  chk('Y3a', r1.aplicados.length === 1, 'a primeira passada aplica');

  const r2 = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(arquivo)));
  chk('Y3b', r2.aplicados.length === 0 && r2.inalterados.length === 1,
      `reimportar o MESMO arquivo aplica ZERO (aplicados=${r2.aplicados.length}, inalterados=${r2.inalterados.length})`);

  /*
   * SO O COMPLEMENTO MUDA, e este e o ponto do bloco. Comparar apenas os seis
   * obrigatorios faria esta correcao sair como "inalterado" - e o complemento e
   * justamente o campo que mais se corrige depois da primeira coleta.
   */
  const soComplemento = CAB + 'END-3;Rua Terceira;7;Fundos;Centro;Anapolis;GO;75020-010\n';
  const r3 = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(soComplemento)));
  chk('Y3c', r3.aplicados.length === 1,
      'mudar SO o complemento conta como aplicado - a comparacao e dos SETE campos, nao dos seis obrigatorios');
  chk('Y3d', (await enderecoDe('END-3')).complemento === 'Fundos',
      'e o valor novo chega a coluna');

  // E apagar o complemento tambem e mudanca: null nao e "nao mexeu".
  const semComplemento = CAB + 'END-3;Rua Terceira;7;;Centro;Anapolis;GO;75020-010\n';
  const r4 = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(semComplemento)));
  chk('Y3e', r4.aplicados.length === 1 && (await enderecoDe('END-3')).complemento === null,
      'apagar o complemento e mudanca e vira NULL - a celula vazia do arquivo tem significado');
}

// ---------------------------------------------------- Y4 ausente nao e zero
{
  const r = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(
    CAB + 'END-1;Rua das Flores;120;Apto 302;Setor Bueno;Goiania;GO;74210-030\n')));

  const e4 = await enderecoDe('END-4');
  chk('Y4a', e4.logradouro === 'Rua Intocada' && e4.cep === '74000001',
      'a UC que a planilha NAO cobriu fica como estava - o lancamento nao apaga endereco de quem nao veio');

  const fora = r.nao_cobertos.find((u) => u.numero_uc === 'END-4');
  chk('Y4b', fora !== undefined && fora.completo === false,
      'e ela aparece no relatorio marcada como INCOMPLETA - dois campos de seis nao e "pronta"');

  const completa = r.nao_cobertos.find((u) => u.numero_uc === 'END-3');
  chk('Y4c', completa !== undefined && completa.completo === true,
      'enquanto a que tem os seis aparece como completa - sem essa distincao o relatorio mandaria '
      + 'procurar endereco que ja existe');

  chk('Y4d', r.nao_cobertos.find((u) => u.numero_uc === 'END-1') === undefined,
      'quem veio no arquivo nao entra em `nao_cobertos` - a lista e do que FALTOU');
}

// ---------------------------------------------------- Y5 o pagador do boleto
{
  /*
   * O ELO COM O BOLETO. `src/repos/boleto.ts` monta o pagador com o nome do
   * cliente e os seis campos de endereco da UC - e ate 05/08 eles saiam vazios
   * em 29 de 29. Aqui os dois lados sao exercitados um contra o outro.
   */
  const pagadorDe = async (numero: string) => {
    const r: any[] = await emA(() => db().$queryRawUnsafe(
      `SELECT c.nome, c.documento,
              uc.endereco_logradouro, uc.endereco_numero, uc.endereco_bairro,
              uc.endereco_municipio, uc.endereco_uf, uc.endereco_cep
         FROM unidade_consumidora uc
         JOIN cliente c ON c.tenant_id = uc.tenant_id AND c.id = uc.cliente_id
        WHERE uc.numero_uc = $1`, numero));
    const l = r[0]!;
    return {
      nome: l.nome,
      documento: l.documento ?? '',      // o `?? ''` de boleto.ts:164 - Q-PAGADOR-01
      endereco: {
        logradouro: l.endereco_logradouro, numero: l.endereco_numero,
        bairro: l.endereco_bairro, municipio: l.endereco_municipio,
        uf: l.endereco_uf, cep: l.endereco_cep,
      },
    };
  };

  const antes = await pagadorDe('END-4');
  chk('Y5a', antes.endereco.municipio === null && antes.endereco.uf === null,
      'sem o lote, o pagador do boleto vai para a Sicoob sem municipio e sem UF');

  const depois = await pagadorDe('END-1');
  chk('Y5b', depois.endereco.municipio === 'Goiania' && depois.endereco.uf === 'GO'
          && depois.endereco.cep === '74210030',
      'com o lote, o mesmo pagador vai completo - o circuito fecha');

  /*
   * E O `?? ''` CONTINUA LA, de propósito: a `Q-PAGADOR-01` registra a guarda
   * como pendente e nao decidida. Prender isto aqui e o registro executavel de
   * que o endereco foi resolvido e o DOCUMENTO nao - as duas metades do pagador
   * sao questoes diferentes, e so uma foi fechada.
   */
  chk('Y5c', depois.documento === '',
      'e o documento do pagador SEGUE vazio - endereco e documento sao duas questoes, '
      + 'e o `?? \'\'` de boleto.ts:164 continua sem guarda (Q-PAGADOR-01)');
}

// ---------------------------------------------------- Y6 o isolamento
{
  const r = await emA(() => ucRepo.lancarEnderecosPorUC(mapaDe(
    CAB + 'END-B;Rua Invasora;1;;Centro;Goiania;GO;74000-020\n')));
  chk('Y6a', r.sem_uc.length === 1 && r.aplicados.length === 0,
      'UC do tenant B e uma UC DESCONHECIDA - nao um erro de permissao, que confirmaria que ela existe');

  const e: any[] = await emB(() => db().$queryRawUnsafe(
    "SELECT endereco_logradouro FROM unidade_consumidora WHERE numero_uc = 'END-B'"));
  chk('Y6b', e[0]!.endereco_logradouro === null, 'e nada foi gravado do lado do tenant B');
}

console.log();
if (falhas > 0) { console.log(`--- endereco por planilha: ${falhas} FALHA(S)`); }
else { console.log('--- endereco por planilha: todas as verificacoes passaram'); }
await prisma.$disconnect();
await pools.transacional.end();
await pools.relatorio.end();
process.exit(falhas === 0 ? 0 : 1);
