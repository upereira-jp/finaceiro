// QUAL FAMILIA DE ESCOPOS A COBRANCA V3 ACEITA - medido, e nao lido.
//
// Uso:  COFRE_DATABASE_URL=... npm run escopos -- [credencial_ref]
//
// ============================================================================
// POR QUE ESTE SCRIPT EXISTE
//
// `Q-ESCOPO-V3-01`, aberta em 28/08/2026. Duas fontes primarias discordam:
//
//   - o realm `cooperado` anuncia, em `scopes_supported`, 29 escopos
//     `cobranca_boletos_*` - medido em 27/08, e e de la que saiu a lista que o
//     adaptador pede hoje;
//   - a pagina da propria API Cobranca Bancaria V3 traz uma "Lista de escopos"
//     com OUTRA familia: `boletos_inclusao`, `boletos_consulta`,
//     `boletos_alteracao`, `webhooks_inclusao`, `webhooks_consulta`,
//     `webhooks_alteracao`.
//
// E A DOCUMENTACAO NAO DESEMPATA: o Swagger do portal NAO declara escopo por
// endpoint (conferido em 28/08 - o icone que parece cadeado e "copy to
// clipboard"). Entao nao ha o que ler; ha o que MEDIR.
//
// O QUE TORNA ISTO MEDIVEL: o `client_credentials` devolve, no corpo do token, o
// campo `scope` com o que foi de fato CONCEDIDO. Pedir e receber sao coisas
// diferentes, e e a diferenca entre as duas que responde a pergunta.
//
// ============================================================================
// POR QUE UM DE CADA VEZ, E NAO A FAMILIA INTEIRA
//
// Um conjunto pode ser recusado por causa de UM escopo invalido, e ai o erro nao
// diz qual. Pedindo um por vez, cada linha da saida e uma afirmacao isolada:
// este escopo existe e e meu, ou nao. So depois disso o script pede o conjunto
// vencedor junto - que e como o adaptador pede em producao.
//
// ELE NAO EMITE NADA. So fala com o servidor de autorizacao; nenhum boleto, e
// nenhuma escrita em lugar nenhum - nem no banco, nem no cofre.

import { SICOOB, ESCOPOS, transporteHttps, CertificadoRecusado } from '../src/sicoob/http.ts';

/** Os quatro que o adaptador pede hoje, do `scopes_supported` do realm. */
const FAMILIA_REALM = [...ESCOPOS];

/** Os seis que a pagina da API V3 lista. Os de webhook nao tem equivalente na
 *  outra familia, e sao o que falta para cadastrar a URL por codigo. */
const FAMILIA_DOCUMENTACAO = [
  'boletos_inclusao', 'boletos_consulta', 'boletos_alteracao',
  'webhooks_inclusao', 'webhooks_consulta', 'webhooks_alteracao',
];

function morrer(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

/** Pede um token com exatamente estes escopos e conta o que voltou. */
async function pedir(clientId: string, pfx: Buffer, senha: string, escopos: string[]) {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    scope: escopos.join(' '),
  }).toString();

  const r = await transporteHttps({
    url: SICOOB.token,
    metodo: 'POST',
    cabecalhos: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(corpo)),
      Accept: 'application/json',
    },
    corpo,
    pfx,
    senha,
  });

  let j: any = null;
  try { j = JSON.parse(r.texto); } catch { /* corpo nao-JSON entra como texto */ }

  return {
    status: r.status,
    /* O QUE FOI CONCEDIDO, que nem sempre e o que foi pedido: um servidor pode
     * devolver 200 e SILENCIOSAMENTE derrubar o escopo que nao conhece. Por isso
     * a coluna "concedido" e a que decide, e nao o status. */
    concedido: typeof j?.scope === 'string' ? j.scope : null,
    erro: j?.error ?? null,
    detalhe: j?.error_description ?? (j ? null : r.texto.slice(0, 120)),
  };
}

async function credencialDoCofre(ref: string) {
  const url = process.env.COFRE_DATABASE_URL;
  if (!url) {
    morrer(
      'Falta COFRE_DATABASE_URL - a conexao de DONO (a mesma DIRECT_URL das migrations).\n'
      + '  A DATABASE_URL de runtime NAO serve: ela nao alcanca o schema vault, e nao\n'
      + '  alcancar e o desenho do ADR-0005. Rode de onde a conexao de dono existe.',
    );
  }

  const { default: pg } = await import('pg');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const r = await cliente.query<{ decrypted_secret: string }>(
      'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1', [ref]);
    if (!r.rowCount) morrer(`Nao ha credencial "${ref}" no cofre.`);

    let s: any;
    try { s = JSON.parse(r.rows[0].decrypted_secret); }
    catch { morrer('O segredo guardado nao e um JSON valido.'); }

    if (!s.client_id) {
      morrer(
        'A credencial esta no cofre SEM client_id - o aplicativo ainda nao foi autorizado,\n'
        + `  ou o id nao foi gravado. Rode:  npm run certificado -- client-id ${ref} <id>`,
      );
    }
    return { clientId: String(s.client_id), pfx: Buffer.from(s.pfx_base64, 'base64'), senha: String(s.senha) };
  } finally {
    await cliente.end();
  }
}

// ------------------------------------------------------------------------ main

const ref = process.argv[2] || 'sicoob-g3-a1';
const c = await credencialDoCofre(ref);

console.log(`\n  ESCOPOS SICOOB - ${SICOOB.token}`);
console.log(`  credencial "${ref}", client_id ${c.clientId.slice(0, 6)}...\n`);

const vivos: string[] = [];

for (const familia of [
  { nome: 'do realm (o que pedimos hoje)', escopos: FAMILIA_REALM },
  { nome: 'da pagina da API V3', escopos: FAMILIA_DOCUMENTACAO },
]) {
  console.log(`  --- familia ${familia.nome}`);
  for (const escopo of familia.escopos) {
    try {
      const r = await pedir(c.clientId, c.pfx, c.senha, [escopo]);
      const aceito = r.status === 200 && r.concedido != null && r.concedido.split(/\s+/).includes(escopo);
      if (aceito) vivos.push(escopo);
      console.log(
        `  ${aceito ? 'CONCEDIDO' : 'recusado '} ${escopo.padEnd(26)} ` +
        `HTTP ${r.status}` +
        (r.concedido != null ? `  scope="${r.concedido}"` : '') +
        (r.erro ? `  ${r.erro}: ${r.detalhe ?? ''}` : ''),
      );
    } catch (e: any) {
      const porque = e instanceof CertificadoRecusado ? `certificado recusado (${e.message})` : String(e?.message ?? e);
      console.log(`  ERRO      ${escopo.padEnd(26)} ${porque}`);
      // Certificado quebrado nao melhora no proximo escopo - parar e honesto.
      if (e instanceof CertificadoRecusado) process.exit(1);
    }
  }
  console.log('');
}

// ------------------------------------------------- e o conjunto, como em producao
if (vivos.length) {
  const r = await pedir(c.clientId, c.pfx, c.senha, vivos);
  console.log(`  --- os ${vivos.length} concedidos, pedidos JUNTOS (e como o adaptador pede)`);
  console.log(`  HTTP ${r.status}  scope="${r.concedido ?? ''}"${r.erro ? `  ${r.erro}` : ''}\n`);
  console.log('  Ponha exatamente estes em ESCOPOS, em src/sicoob/http.ts:\n');
  for (const e of vivos) console.log(`    '${e}',`);
  console.log('');
} else {
  console.log(
    '  NENHUM escopo foi concedido. Isso NAO e resposta sobre a familia - e sinal de que\n'
    + '  o aplicativo nao esta autorizado no Sicoobnet, ou de que o certificado nao e o\n'
    + '  que o portal registrou. Confira o aplicativo antes de concluir qualquer coisa.\n',
  );
}
