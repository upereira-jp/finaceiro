// O A1, DA MAO ATE O COFRE. Quatro passos, e nenhum deles escreve chave privada
// em disco do servidor.
//
//   conferir     le o .pfx e diz o que ha dentro: CNPJ, titular, validade, e se
//                o Node consegue abri-lo
//   publica      extrai a PARTE PUBLICA (.pem) - o unico arquivo que sobe no
//                Portal Developers, e o unico que nao e segredo
//   normalizar   re-exporta o .pfx com cifragem moderna, quando o Node recusa a
//                antiga
//   guardar      poe o .pfx no cofre (Supabase Vault) e liga a credencial_ref
//
// ============================================================================
// POR QUE `normalizar` EXISTE, e a medicao que a criou (27/08/2026)
//
// O Node 22.20 embute OpenSSL 3.5. Um `.pfx` cifrado com o padrao ANTIGO -
// `pbeWithSHA1And40BitRC2-CBC`, que AC brasileira ainda entrega - faz
// `tls.createSecureContext` estourar `ERR_CRYPTO_UNSUPPORTED_OPERATION:
// Unsupported PKCS12 PFX data`. E o `openssl` do SISTEMA abre o mesmo arquivo
// sem reclamar, porque tem o provider `legacy` ligado. Ou seja: o certificado
// "funciona" em todo teste manual e falha exatamente no processo que emite
// boleto.
//
// Medido lado a lado, com certificado de teste gerado nas duas cifragens:
//
//     legado (RC2-40 + SHA1)    -> Node RECUSA
//     moderno (AES-256/PBKDF2)  -> Node carrega
//     legado normalizado        -> Node carrega
//
// ============================================================================
// A CHAVE PRIVADA NUNCA TOCA O DISCO, e a normalizacao e o unico ponto onde
// isso exigiu cuidado. `openssl pkcs12 -export` precisa de arquivo BUSCAVEL na
// entrada - medido: por pipe e por `/dev/fd/63` ele recusa com "Could not read
// any certificates". Entao o intermediario em claro vai para `/dev/shm`, que e
// tmpfs - RAM, nao disco -, com modo 600 e apagado em seguida. O `ADR-0005` D
// recusou "certificado em disco no VPS"; RAM por um segundo nao e isso, e a
// alternativa seria nao poder usar certificado antigo nenhum.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';
import { titularDoSubject } from '../src/dominio/certificado-icp.ts';

const CNPJ_G3 = '66714022000121';
const CTRL_C = '\u0003';
const BACKSPACE = '\u007f';

function morrer(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/**
 * A senha, por tres caminhos - e NENHUM deles e argumento de linha de comando.
 *
 * `ps` mostra a linha de comando de qualquer processo para a maquina inteira, e
 * o historico do shell guarda o que foi digitado. Por isso senha nunca entra em
 * `argv`, e por isso o `--` do npm nao serve para ela.
 *
 * OS TRES, na ordem em que sao tentados:
 *
 *   1. `SENHA_PFX` no ambiente             - para automacao
 *   2. stdin, quando NAO ha terminal       - `... < arquivo` ou por pipe
 *   3. o terminal, sem eco                 - o caso normal, uma pessoa digitando
 *
 * O CAMINHO 2 FOI ACRESCENTADO EM 27/08/2026, e a razao foi um erro real: a
 * primeira versao morria com "Sem terminal para pedir a senha" sempre que o
 * comando rodava fora de um terminal interativo - por um pipe, dentro de um
 * agente, num script. O script era usavel so no caminho mais estreito, e quem
 * batesse nisso nao teria o que fazer alem de por a senha no ambiente.
 */
async function pedirSenha(rotulo: string): Promise<string> {
  if (process.env.SENHA_PFX) return process.env.SENHA_PFX;

  if (!process.stdin.isTTY) {
    const partes: Buffer[] = [];
    for await (const p of process.stdin) partes.push(p as Buffer);
    // So a PRIMEIRA linha: arquivo de senha costuma terminar com quebra, e uma
    // senha com quebra grudada falha o MAC com a MESMA mensagem de senha
    // errada - meia hora perdida procurando no lugar errado.
    const senha = Buffer.concat(partes).toString('utf8').split('\n')[0].replace(/\r$/, '');
    if (!senha) morrer(
      'Sem terminal e sem senha na entrada padrao. Tres caminhos:\n'
      + '    ssh na VPS e rode normal (ele pergunta sem eco), ou\n'
      + '    npm run certificado -- conferir <pfx> < /caminho/arquivo-com-a-senha, ou\n'
      + '    SENHA_PFX=... npm run certificado -- conferir <pfx>');
    return senha;
  }

  process.stdout.write(`${rotulo}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let senha = '';
  return new Promise((resolve) => {
    process.stdin.on('data', (b) => {
      for (const ch of b.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          return resolve(senha);
        }
        if (ch === CTRL_C) { process.stdout.write('\n'); process.exit(130); }
        if (ch === BACKSPACE) { senha = senha.slice(0, -1); continue; }
        senha += ch;
      }
    });
  });
}

/** openssl com a senha por ENV, nunca por argv. */
function openssl(args: string[], senha: string, entrada?: Buffer) {
  const r = spawnSync('openssl', args, {
    env: { ...process.env, SENHA_A1: senha, SENHA_A1_SAIDA: senha },
    input: entrada,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    saida: r.stdout ?? Buffer.alloc(0),
    erro: (r.stderr ?? Buffer.alloc(0)).toString('utf8'),
  };
}

/** Le o .pfx tentando primeiro o moderno e depois o `-legacy`. Devolve tambem
 *  QUAL dos dois funcionou, porque essa e a informacao que decide se precisa
 *  normalizar. */
function lerPfx(caminho: string, senha: string, extra: string[]) {
  const base = ['pkcs12', '-in', caminho, '-passin', 'env:SENHA_A1', ...extra];
  const moderno = openssl(base, senha);
  if (moderno.ok) return { ...moderno, legado: false };
  const legado = openssl([...base, '-legacy'], senha);
  if (legado.ok) return { ...legado, legado: true };
  const pista = /mac verify failure|invalid password/i.test(moderno.erro + legado.erro)
    ? 'A SENHA parece errada - o MAC do arquivo nao confere.'
    : moderno.erro.split('\n').find((l) => l.trim()) ?? 'erro desconhecido do openssl';
  morrer(`Nao consegui abrir ${caminho}. ${pista}`);
}

/** O Node abre este .pfx? E a unica pergunta que importa para emitir boleto. */
function nodeAbre(pfx: Buffer, senha: string): { ok: boolean; causa?: string } {
  try { tls.createSecureContext({ pfx, passphrase: senha }); return { ok: true }; }
  catch (e: any) { return { ok: false, causa: e?.code ?? e?.message }; }
}

function conferir(caminho: string, senha: string) {
  const pem = lerPfx(caminho, senha, ['-nokeys']);
  const info = openssl(['x509', '-noout', '-subject', '-issuer', '-dates'], senha, pem.saida);
  if (!info.ok) morrer(`Certificado ilegivel: ${info.erro.slice(0, 200)}`);
  const texto = info.saida.toString('utf8');

  const linha = (p: string) => texto.split('\n').find((l) => l.startsWith(p))?.slice(p.length).trim() ?? '?';
  const subject = linha('subject=');
  const notAfter = linha('notAfter=');
  const titular = titularDoSubject(subject);
  const digitos = titular.documento;

  const vence = new Date(notAfter);
  const dias = Math.floor((vence.getTime() - Date.now()) / 86_400_000);
  const abre = nodeAbre(readFileSync(caminho), senha);

  console.log(`
  ARQUIVO      ${caminho}
  TITULAR      ${titular.nome || subject}
  EMISSOR      ${linha('issuer=')}
  VALIDADE     ate ${notAfter}  (${dias} dias)
  ${(titular.tipo ?? 'documento').toUpperCase().padEnd(12)} ${digitos ?? 'NAO ENCONTRADO no CN do subject'}${
    digitos && digitos !== CNPJ_G3 ? `  <-- NAO e o da G3 (${CNPJ_G3})` : digitos ? '  confere com a G3' : ''}
  CIFRAGEM     ${pem.legado ? 'ANTIGA (so abre com -legacy)' : 'moderna'}
  NODE ABRE?   ${abre.ok ? 'SIM' : `NAO - ${abre.causa}`}
`);

  if (dias < 0) console.log('  >> O certificado esta VENCIDO. Nao adianta subir no portal.\n');
  else if (dias < 30) console.log(`  >> Vence em ${dias} dias. Renove antes de configurar a emissao.\n`);
  if (!abre.ok) {
    console.log('  >> O Node NAO abre este arquivo. Rode:\n'
      + `     npm run certificado -- normalizar ${caminho} ${caminho.replace(/\.(pfx|p12)$/i, '')}-moderno.pfx\n`);
  }
  if (abre.ok && digitos === CNPJ_G3 && dias > 30) {
    console.log('  >> Pronto para o portal. Proximo passo:\n'
      + `     npm run certificado -- publica ${caminho}\n`);
  }
}

function publica(caminho: string, senha: string, saida?: string) {
  const r = lerPfx(caminho, senha, ['-nokeys']);
  // So o bloco CERTIFICATE. O `-nokeys` ja tira a chave privada, mas ele deixa
  // "Bag Attributes" e o subject em texto antes do PEM, e formulario web
  // engasga com isso mais vezes do que devia. O que sobe e o PEM puro.
  const texto = r.saida.toString('utf8');
  const blocos = texto.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocos?.length) morrer('Nao achei bloco CERTIFICATE dentro do .pfx.');

  const destino = saida ?? caminho.replace(/\.(pfx|p12)$/i, '') + '-publico.pem';

  /*
   * QUAL DOS QUATRO, e por que nao "o primeiro".
   *
   * Um A1 do ICP-Brasil traz a FOLHA mais a cadeia inteira - aqui foram quatro
   * certificados. A primeira versao gravava `blocos[0]` com o comentario "o
   * primeiro e o do titular". No certificado da G3 isso estava certo, e ESTAVA
   * CERTO POR SORTE: a ordem dos bags num PKCS#12 nao e definida pelo padrao, e
   * quem gera decide. Num arquivo com outra ordem, o que subiria no portal seria
   * uma AC - e o modo de falha nao e um erro no upload, e autenticacao que nao
   * fecha depois, com o aplicativo ja criado e ninguem sabendo por que.
   *
   * A ESCOLHA E POR PROPRIEDADE, entao, e nao por posicao: a folha e o unico que
   * NAO e autoridade (`CA:TRUE` ausente) e que tem documento no `CN`. E o que
   * for escolhido e IMPRESSO - quem opera confere o nome antes de subir.
   */
  const ehAutoridade = (pem: string) =>
    /CA:TRUE/i.test(openssl(['x509', '-noout', '-text'], senha, Buffer.from(pem)).saida.toString('utf8'));

  const comSubject = blocos.map((pem) => {
    const sub = openssl(['x509', '-noout', '-subject'], senha, Buffer.from(pem))
      .saida.toString('utf8').replace(/^subject=/, '').trim();
    return { pem, sub, titular: titularDoSubject(sub) };
  });

  const folha = comSubject.find((c) => c.titular.documento && !ehAutoridade(c.pem));
  if (!folha) {
    morrer(
      `Nenhum dos ${blocos.length} certificados do arquivo parece ser o do titular - todos sao \n`
      + '  autoridade ou nao tem CPF/CNPJ no CN. Nao vou escolher um no chute: o que subir no\n'
      + '  portal define quem a G3 e para o banco. Rode `conferir` e confira o arquivo.');
  }

  writeFileSync(destino, folha.pem + '\n', { mode: 0o644 });
  console.log(`
  Parte PUBLICA escrita em: ${destino}
  TITULAR gravado: ${folha.titular.nome} (${folha.titular.documento})
  ${blocos.length > 1
    ? `escolhido entre ${blocos.length} certificados do arquivo - os outros ${blocos.length - 1} sao a cadeia da AC`
    : ''}

  ESTE ARQUIVO NAO E SEGREDO. E ele que sobe no Portal Developers da Sicoob, no
  "+" do formulario de aplicativo. O manual do banco diz, com todas as letras,
  "insira somente a chave publica do certificado" - e e isto aqui.

  O .pfx e a senha NAO sobem em lugar nenhum: vao para o cofre, com
      npm run certificado -- guardar ${caminho}
`);
}

function normalizar(entrada: string, saida: string, senha: string) {
  const claro = lerPfx(entrada, senha, ['-nodes']);
  // /dev/shm e tmpfs: RAM. Ver o cabecalho sobre por que o intermediario nao
  // pode ser um pipe.
  const dir = existsSync('/dev/shm') ? '/dev/shm' : tmpdir();
  const pasta = mkdtempSync(join(dir, 'a1-'));
  const tmp = join(pasta, `${randomBytes(6).toString('hex')}.pem`);
  try {
    writeFileSync(tmp, claro.saida, { mode: 0o600 });
    const r = openssl(
      ['pkcs12', '-export', '-in', tmp, '-passout', 'env:SENHA_A1_SAIDA', '-out', saida],
      senha,
    );
    if (!r.ok) morrer(`Falhou ao re-exportar: ${r.erro.slice(0, 300)}`);
  } finally {
    // Sobrescreve antes de apagar: `rm` so tira a entrada de diretorio.
    try { writeFileSync(tmp, Buffer.alloc(claro.saida.length, 0)); } catch { /* nada */ }
    rmSync(pasta, { recursive: true, force: true });
  }

  const abre = nodeAbre(readFileSync(saida), senha);
  console.log(`
  Escrito: ${saida}
  Node abre? ${abre.ok ? 'SIM - e este o arquivo que vai para o cofre' : `NAO - ${abre.causa}`}
  Senha: a MESMA do arquivo original.
`);
  if (!abre.ok) process.exit(1);
}

/**
 * O cofre. Escreve em `vault.secrets` com `name = credencial_ref`.
 *
 * ROLE DE DONO, e nao a de runtime - `ADR-0005` 6: "a role de runtime nao deve
 * ter INSERT em vault.secrets. Provisionamento, como o
 * bootstrap-plataforma-admin.sql - nao migration". Por isso a URL vem de
 * `COFRE_DATABASE_URL` e nao de `DATABASE_URL`: sao credenciais diferentes de
 * proposito, e usar a de runtime aqui daria certo hoje e apagaria a separacao.
 */
async function guardar(caminho: string, senha: string, ref: string, clientId: string) {
  const url = process.env.COFRE_DATABASE_URL;
  if (!url) morrer(
    'Falta COFRE_DATABASE_URL - a conexao de DONO (a mesma DIRECT_URL usada para aplicar\n'
    + '  migration). A DATABASE_URL de runtime nao serve, e nao servir e o desenho:\n'
    + '  quem emite boleto nao pode escrever no cofre.');
  /*
   * SEM `client_id`, MAS COM OPT-IN EXPLICITO. E o caso real de 27/08/2026: o
   * certificado existe, o aplicativo no portal ainda nao, e o `.pfx` esta no
   * DISCO da VPS - que e precisamente o que o `ADR-0005` D recusou, num disco
   * compartilhado com o CRM.
   *
   * Entre "meia credencial no cofre" e "certificado inteiro no disco por
   * semanas", a segunda e pior, e nao e perto. E o meio-termo nao e silencioso:
   * a resolvedora ja recusa credencial sem `client_id` com mensagem propria
   * ("o segredo guardado nao tem client_id"), e o conector so liga com os campos
   * de identidade que tambem ainda nao existem. Nao ha estado em que isto emita
   * boleto pela metade.
   *
   * O opt-in existe para que ninguem chegue nesse estado por engano - so de
   * proposito, sabendo que falta o `client-id` depois.
   */
  const incompleta = !clientId;
  if (incompleta && process.env.SEM_CLIENT_ID !== '1') morrer(
    'Falta o client_id do aplicativo do Portal Developers. Passe como 3o argumento ou em\n'
    + '  SICOOB_CLIENT_ID.\n\n'
    + '  Se o aplicativo ainda NAO existe e voce quer tirar o .pfx do disco desde ja,\n'
    + '  guarde a credencial incompleta de proposito:\n\n'
    + '      SEM_CLIENT_ID=1 npm run certificado -- guardar <pfx> <ref>\n\n'
    + '  e complete depois, sem reenviar o certificado:\n\n'
    + '      npm run certificado -- client-id <ref> <client_id>');

  const pfx = readFileSync(caminho);
  const abre = nodeAbre(pfx, senha);
  if (!abre.ok) morrer(
    `O Node nao abre este .pfx (${abre.causa}). Guardar assim poria no cofre um certificado\n`
    + '  que nunca vai emitir boleto. Rode `normalizar` antes.');

  const segredo = JSON.stringify({ client_id: clientId, pfx_base64: pfx.toString('base64'), senha });

  const { default: pg } = await import('pg');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    // `vault.create_secret` cifra; um UPDATE direto na coluna `secret` NAO
    // cifraria - guardaria o A1 em claro dentro do proprio cofre.
    const existe = await cliente.query('SELECT id FROM vault.secrets WHERE name = $1', [ref]);
    if (existe.rowCount) {
      await cliente.query(
        'SELECT vault.update_secret(id, $2, $1) FROM vault.secrets WHERE name = $1', [ref, segredo]);
      console.log(`\n  Credencial ATUALIZADA no cofre sob a referencia "${ref}".`);
    } else {
      await cliente.query('SELECT vault.create_secret($1, $2, $3)',
        [segredo, ref, 'A1 e client_id da Cobranca Sicoob - ADR-0005']);
      console.log(`\n  Credencial GUARDADA no cofre sob a referencia "${ref}".`);
    }
    if (incompleta) {
      console.log(`
  ATENCAO: guardada SEM client_id. Nenhum boleto sai assim - a resolvedora recusa
  nomeando o que falta. Quando o aplicativo existir no portal:

      npm run certificado -- client-id ${ref} <client_id>

  e o certificado NAO precisa ser reenviado.`);
    }

    console.log(`
  Agora APAGUE o .pfx do disco - o lugar dele e o cofre:

      shred -u ${caminho}

  E ligue o conector do tenant a esta referencia, com os campos que a
  cooperativa informar. Os DOIS primeiros sao obrigatorios; o
  numero_contrato_cobranca e OPCIONAL - so existe para cooperado com mais de um
  contrato, e deixa-lo NULL e o caminho certo de quem tem um so (migration 36):

    UPDATE conector_cobranca
       SET credencial_ref = '${ref}',
           numero_cliente = <numeroCliente>,
           codigo_modalidade = <codigoModalidade>,
           -- so esta linha se a cooperativa disser que ha mais de um contrato:
           -- numero_contrato_cobranca = <numeroContratoCobranca>,
           certificado_expira_em = '<AAAA-MM-DD>',
           sandbox = false,
           ativo = true
     WHERE tenant_id = '<tenant da G3>';

    ALTER TABLE conector_cobranca VALIDATE CONSTRAINT conector_ativo_tem_identidade;
`);
  } finally {
    await cliente.end();
  }
}

/**
 * Completa a credencial ja guardada com o `client_id`, sem reenviar o
 * certificado.
 *
 * POR QUE NAO E "guardar DE NOVO": guardar exige o `.pfx` e a senha, e depois
 * do `shred` o arquivo nao existe mais nesta maquina - ele foi para o cofre, que
 * era o objetivo. Obrigar a subir o certificado outra vez so para escrever um
 * identificador publico faria o `.pfx` voltar ao disco pelo caminho errado.
 *
 * Ele LE o segredo, troca UM campo e regrava. Nao imprime o conteudo em momento
 * nenhum.
 */
async function definirClientId(ref: string, clientId: string) {
  const url = process.env.COFRE_DATABASE_URL;
  if (!url) morrer('Falta COFRE_DATABASE_URL - a conexao de DONO.');
  if (!clientId.trim()) morrer('client_id vazio.');

  const { default: pg } = await import('pg');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const r = await cliente.query<{ decrypted_secret: string }>(
      'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1', [ref]);
    if (!r.rowCount) morrer(`Nao ha credencial "${ref}" no cofre. Rode \`guardar\` primeiro.`);

    let segredo: Record<string, unknown>;
    try { segredo = JSON.parse(r.rows[0].decrypted_secret); }
    catch { morrer('O segredo guardado nao e um JSON valido. Regrave com `guardar`.'); }

    const antes = segredo.client_id;
    segredo.client_id = clientId.trim();
    await cliente.query(
      'SELECT vault.update_secret(id, $2, $1) FROM vault.secrets WHERE name = $1',
      [ref, JSON.stringify(segredo)]);

    console.log(`
  client_id gravado em "${ref}"${antes ? ' (havia um anterior, foi substituido)' : ''}.
  O certificado nao foi tocado.
`);
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------------- main

const [comando, ...resto] = process.argv.slice(2);
const USO = `
  npm run certificado -- conferir    <arquivo.pfx>
  npm run certificado -- publica     <arquivo.pfx> [saida.pem]
  npm run certificado -- normalizar  <entrada.pfx> <saida.pfx>
  npm run certificado -- guardar     <arquivo.pfx> [credencial_ref] [client_id]
  npm run certificado -- client-id   <credencial_ref> <client_id>

  A senha e pedida no terminal, sem eco. Nunca passe senha por argumento:
  a linha de comando de qualquer processo e visivel para o sistema inteiro.
`;

if (!comando || !resto[0]) { console.log(USO); process.exit(comando ? 1 : 0); }

// `client-id` nao toca no certificado: nao pede arquivo e nao pede senha. Pedir
// a senha de um .pfx que talvez ja tenha ido para o shred seria pedir o que nao
// existe mais.
if (comando === 'client-id') {
  if (!resto[1]) morrer('Uso: npm run certificado -- client-id <credencial_ref> <client_id>');
  await definirClientId(resto[0], resto[1]);
  process.exit(0);
}

if (!existsSync(resto[0])) morrer(`Nao existe: ${resto[0]}`);

const senha = await pedirSenha('Senha do certificado');
if (!senha) morrer('Senha vazia.');

switch (comando) {
  case 'conferir': conferir(resto[0], senha); break;
  case 'publica': publica(resto[0], senha, resto[1]); break;
  case 'normalizar':
    if (!resto[1]) morrer('Falta o arquivo de saida. Ver: npm run certificado');
    normalizar(resto[0], resto[1], senha); break;
  case 'guardar':
    await guardar(resto[0], senha, resto[1] ?? 'sicoob-g3-a1', resto[2] ?? process.env.SICOOB_CLIENT_ID ?? '');
    break;
  default: console.log(USO); process.exit(1);
}
