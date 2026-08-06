// CADASTRA UMA CHAVE PIX no banco de chaves e a torna a PADRAO do tenant, pelo
// CAMINHO DA APLICACAO. E o item 1.5 de `PENDENCIAS-2026-08-05`, e o unico meio
// de pagamento que nao espera o certificado A1.
//
// Desde a migration 25 a chave e uma LINHA em `chave_pix`, com apelido proprio,
// e `identidade_de_cobranca` so aponta para a padrao. Este script faz os dois
// atos numa transacao: cadastrar sem apontar deixaria o tenant com uma chave que
// nao desenha QR nenhum, e o script diria "gravada".
//
// USO
//   npm run identidade -- --ensaio  --auth-user <uuid> \
//        --tipo cnpj --chave "66.714.022/0001-21" \
//        --nome "G3 GESTAO ENERGIA SOLAR" --cidade GOIANIA \
//        [--apelido "Conta principal"]
//   npm run identidade -- --valendo --auth-user <uuid> ... (idem)
//   npm run identidade -- --ver     --auth-user <uuid>      (so le)
//
// POR QUE SCRIPT, havendo TELA. A aba Documento faz isto em quatro campos, e
// continua sendo o caminho de todo dia. O script existe por uma razao que a tela
// nao tem como dar: **o ensaio**. Escrever a chave errada nao produz erro em
// lugar nenhum - o QR sai valido, o CRC fecha e o aplicativo do banco aceita -,
// entao o unico ponto em que da para conferir e ANTES de gravar, com a
// interpretacao ao lado do texto digitado. E o mesmo desenho do
// `importar-tarifas`, e pela mesma razao: ler certo o valor errado.
//
// O QUE ELE IMPRIME, e cada linha existe por um modo de falha:
//
//   chave      o que foi digitado -> o que sera GRAVADO. Mascara de CNPJ nao e
//              informacao, e some; se sumir mais do que a mascara, aparece aqui
//   recebedor  o que foi digitado -> o que CABE no campo 59 do BR Code. O corte
//              e em 25 caracteres ASCII e o banco recusa acima disso, entao um
//              nome cortado NAO chega a ser gravado - mas um nome que perde
//              acento no caminho chega, e o dono precisa ver como ficou
//              (`apenasAscii` tira acentuacao antes de o CRC ser calculado)
//   cidade     idem, com teto de 15
//   BR CODE    o payload inteiro, do jeito que o celular vai ler
//
// O QUE ELE NAO PROVA, e a distincao e a mesma do `ROTEIRO-REVISAO` parte 5: que
// a chave esteja REGISTRADA no DICT e seja da nossa conta. Nada no sistema
// deriva isso. O unico teste e ler o QR com a camera e ver o nome que o banco
// devolve - e e por isso que o `--valendo` termina imprimindo o BR Code.

import { iniciar, encerrarApp } from '../src/app.ts';
import {
  salvarIdentidade, identidade, qrDeConferencia, criarChavePix, chavesPix,
} from '../src/repos/documento.ts';
import { conferirChavePix, TIPOS_DE_CHAVE_PIX } from '../src/dominio/chave-pix.ts';
import { apenasAscii } from '../src/dominio/brcode.ts';

/** Valor de conferencia do QR impresso no fim. Nao grava nada e nao vira
 *  fatura - e so o que o campo 54 do BR Code precisa carregar para o
 *  aplicativo mostrar uma quantia em vez de pedir que se digite uma. */
const VALOR_DE_CONFERENCIA_CENTAVOS = 100;

class RollbackDoEnsaio extends Error {
  readonly valor: unknown;
  constructor(valor: unknown) { super('ensaio'); this.name = 'RollbackDoEnsaio'; this.valor = valor; }
}

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (n: string) => process.argv.includes(`--${n}`);

function mostrar(rotulo: string, de: string, para: string, teto?: number) {
  const mudou = de !== para;
  console.log(`  ${rotulo.padEnd(10)} ${JSON.stringify(de)}`);
  console.log(`  ${''.padEnd(10)} ${mudou ? '->' : '=='} ${JSON.stringify(para)}`
    + (teto ? `  (${para.length}/${teto})` : '')
    + (mudou ? '   <- CONFIRA' : ''));
}

async function main(): Promise<void> {
  const ver = tem('ver');
  const ensaio = tem('ensaio'), valendo = tem('valendo');
  if (!ver && ensaio === valendo) {
    console.error('ERRO: informe --ensaio (ROLLBACK), --valendo (COMMIT) ou --ver (so leitura).');
    process.exit(2);
  }
  const authUserId = arg('auth-user');
  if (!authUserId) { console.error('ERRO: --auth-user <uuid> e obrigatorio.'); process.exit(2); }
  const tenantProposto = arg('tenant');

  const tipo = arg('tipo');
  const chave = arg('chave');
  const nome = arg('nome');
  const cidade = arg('cidade');
  /* O APELIDO cai no nome do recebedor quando nao vem. Nao e preguica: com uma
   * chave so os dois coincidem, e exigir que a pessoa digite duas vezes o mesmo
   * texto produz divergencia por digitacao, nao informacao. Quem tem varias
   * chaves passa `--apelido` e e ai que ele ganha funcao. */
  const apelido = arg('apelido') ?? nome;

  // CONFERENCIA ANTES DE ABRIR CONEXAO. Um erro de digitacao nao precisa de
  // banco para ser encontrado, e descobri-lo depois do login confunde a causa.
  let conferida: { chave: string; original: string; normalizou: boolean; explicacao: string } | null = null;
  if (!ver) {
    const faltando = [
      ['--tipo', tipo], ['--chave', chave], ['--nome', nome], ['--cidade', cidade],
    ].filter(([, v]) => !v).map(([n]) => n);
    if (faltando.length > 0) {
      console.error(`ERRO: faltam ${faltando.join(', ')}.`);
      console.error('       Uma chave Pix so serve completa: o BR Code carrega chave, nome e');
      console.error('       cidade, e as tres colunas sao NOT NULL na `chave_pix`.');
      console.error(`       --tipo e um de: ${TIPOS_DE_CHAVE_PIX.join(', ')}`);
      process.exit(2);
    }
    const c = conferirChavePix(tipo, chave);
    if (!c.ok) {
      console.error(`\nERRO na chave Pix: ${c.motivo}\n`);
      console.error('Nada foi gravado e nenhuma conexao foi aberta.\n');
      process.exit(1);
    }
    conferida = c;

    console.log('\n== O QUE FOI DIGITADO -> O QUE VAI SER GRAVADO ==\n');
    mostrar('chave', c.original, c.chave);
    console.log(`  ${''.padEnd(10)} ${c.explicacao}`);
    mostrar('recebedor', nome!, apenasAscii(nome!, 25), 25);
    mostrar('cidade', cidade!, apenasAscii(cidade!, 15), 15);
    console.log(`\n  tipo       ${tipo}`);
    console.log(`  apelido    ${JSON.stringify(apelido)}`
      + (arg('apelido') ? '' : '   (veio de --nome; use --apelido para diferenciar)'));

    // O corte NAO acontece em silencio: o banco recusa acima de 25 e 15, entao
    // o nome cortado nunca chega a ser gravado. Avisar aqui e a diferenca entre
    // uma recusa que diz o que fazer e um 23514 sem contexto.
    for (const [rotulo, valor, teto] of [['recebedor', nome!, 25], ['cidade', cidade!, 15]] as const) {
      const cabe = apenasAscii(valor, 999);
      if (cabe.length > teto) {
        console.error(`\nERRO: "${rotulo}" tem ${cabe.length} caracteres depois de tirar acento e o teto e ${teto}.`);
        console.error(`      O campo ${rotulo === 'recebedor' ? '59' : '60'} do BR Code nao aceita mais, e o CHECK da coluna tambem nao.`);
        console.error('      QUEM ESCOLHE O CORTE E VOCE - cortar aqui poria no celular do cliente');
        console.error('      um nome truncado no meio da palavra, escolhido por um `slice`.\n');
        process.exit(1);
      }
    }
    console.log(`\n== modo: ${ensaio ? 'ENSAIO (ROLLBACK no fim)' : 'VALENDO (COMMIT)'} ==\n`);
  }

  const a = await iniciar();
  const sessao = await a.login(authUserId);
  console.log(`${sessao.nome} <${sessao.email}>, papel=${sessao.tenants.map((t) => t.papel).join(',')}\n`);

  const trabalho = async () => {
    const cadastradas = await chavesPix();
    const atual = await identidade();
    console.log(cadastradas.length === 0
      ? '  ANTES:  nenhuma chave Pix cadastrada neste tenant'
      : `  ANTES:  ${cadastradas.length} chave(s) cadastrada(s):`);
    for (const c of cadastradas) {
      const ehPadrao = atual?.chave_pix_padrao_id === c.id;
      console.log(`            ${ehPadrao ? '*' : ' '} ${c.apelido.padEnd(28)} ${c.tipo.padEnd(10)} ${c.chave}`
        + (c.ativa ? '' : '  (inativa)'));
    }
    if (ver) return { cadastradas };

    // Passa a chave BRUTA de proposito: quem normaliza e o repositorio, e mandar
    // daqui a ja normalizada faria este script exercitar um caminho que a tela
    // nao exercita. O ensaio tem de percorrer o mesmo codigo do dia a dia.
    const nova = await criarChavePix({
      apelido: apelido!, tipo: tipo as never, chave: chave!,
      recebedor_nome: nome!, recebedor_cidade: cidade!,
      observacao: 'Cadastrada por scripts/cadastrar-identidade.ts.',
    });
    console.log(`  DEPOIS: ${nova.apelido} -> ${nova.chave} (${nova.tipo})`);

    // A chave nova vira a PADRAO. Cadastrar sem apontar deixaria o tenant com
    // uma chave que nao desenha QR nenhum, e o script diria "gravada".
    const depois = await salvarIdentidade({ chave_pix_padrao_id: nova.id });
    console.log(`  PADRAO: ${depois.chave_pix_padrao_id}`);

    // Le pelo MESMO caminho da fatura. Um QR montado aqui a partir das variaveis
    // locais nao provaria que a linha gravada produz este payload.
    const qr = await qrDeConferencia(VALOR_DE_CONFERENCIA_CENTAVOS);
    return { depois, qr };
  };

  let resultado: any = null;
  try {
    resultado = await a.withTenant(sessao, tenantProposto, async () => {
      const r = await trabalho();
      if (ensaio) throw new RollbackDoEnsaio(r);
      return r;
    });
  } catch (e) {
    if (e instanceof RollbackDoEnsaio) resultado = e.valor;
    else { console.error('\nFALHOU:', e); await encerrarApp(); process.exit(1); }
  }

  if (!ver && resultado?.qr) {
    console.log('\n== O BR CODE, do jeito que o celular vai ler ==\n');
    console.log(`  ${resultado.qr.brcode}\n`);
    console.log(`  recebedor no QR: ${resultado.qr.recebedor} / ${resultado.qr.cidade}`);
    console.log(`  valor: R$ ${(VALOR_DE_CONFERENCIA_CENTAVOS / 100).toFixed(2)} (so para conferir - nao e fatura)`);
  }

  console.log(ver
    ? '\n== leitura apenas. Nada foi gravado. =='
    : ensaio
      ? '\n== ROLLBACK (--ensaio). Nada foi gravado. =='
      : '\n== COMMIT. Identidade de cobranca gravada. ==');

  if (!ensaio && !ver) {
    console.log('\n   O QUE ISTO AINDA NAO PROVA: que a chave esta REGISTRADA no DICT e');
    console.log('   e da conta certa. Nada no sistema deriva isso. Leia o QR acima com a');
    console.log('   camera e confira o NOME que o aplicativo devolve - ROTEIRO-REVISAO parte 5.');
  }
  await encerrarApp();
}

main().catch(async (e) => { console.error(e); await encerrarApp(); process.exit(1); });
