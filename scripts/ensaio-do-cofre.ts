// ENSAIO DO COFRE: a migration 35 exercida contra o banco REAL, dentro de uma
// transacao que SEMPRE termina em ROLLBACK.
//
//   COFRE_DATABASE_URL="..." npm run ensaio-cofre -- --tenant <uuid>
//
// ============================================================================
// O QUE ELE PROVA, e por que nenhum teste da suite podia provar
//
// `tests/sicoob-http.ts` prova o adaptador com uma resolvedora de mentira.
// `npm run ensaio-sicoob` prova o transporte contra a Sicoob. Entre os dois ha
// um buraco, e e justamente a peca que a migration 35 criou: **a resolvedora de
// verdade**, que e uma funcao `SECURITY DEFINER` no banco.
//
// Ela nao e testavel em TypeScript, porque o que ela promete e sobre
// PRIVILEGIO - "a role de runtime nao alcanca o schema vault, e mesmo assim
// consegue a credencial DO SEU tenant, e so dele". Isso so se mede contra o
// PostgreSQL, com a role de verdade.
//
// AS SEIS PROMESSAS, e as tres do meio sao as que valem:
//
//   1. o dono da funcao enxerga o cofre                (senao nada sai)
//   2. a role de RUNTIME nao enxerga o cofre, e TEM EXECUTE na resolvedora
//      (`ADR-0005` opcao A) - por catalogo sempre, e por execucao quando da
//   3. e ainda assim resolve a credencial do SEU tenant
//   4. a trilha e gravada NA MESMA TRANSACAO           (regra 9)
//   5. tenant errado nao resolve                       (isolamento)
//   6. conector DESLIGADO nao resolve                  (o botao de emergencia)
//
// A 6 e a menos obvia e a mais importante num incidente: desligar o conector e
// o que se faz quando um certificado vaza, e um interruptor que nao corta o
// acesso ao segredo nao e interruptor.
//
// ============================================================================
// POR QUE SAVEPOINT, e nao try/catch simples
//
// No PostgreSQL, um erro dentro de transacao a ENVENENA: todo comando seguinte
// falha com "current transaction is aborted". As verificacoes 5 e 6 esperam
// erro - sem `SAVEPOINT` antes de cada uma, a primeira recusa esperada mataria o
// resto do ensaio e o `ROLLBACK` final nao teria o que conferir.
//
// ============================================================================
// NAO HA `--valendo`
//
// Como no `ensaio-da-juncao`: o unico caminho termina em ROLLBACK. E a ultima
// verificacao conta, DEPOIS da transacao, se sobrou segredo ou linha de trilha
// com a marca do ensaio - e falha se sobrou. E o que torna a promessa
// verificavel em vez de declarada.

import pg from 'pg';

const arg = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const url = process.env.COFRE_DATABASE_URL;
if (!url) {
  console.error(`
  Falta COFRE_DATABASE_URL - a conexao de DONO (a mesma DIRECT_URL das migrations).
  A DATABASE_URL de runtime nao serve, e e justamente isso que este ensaio prova.
`);
  process.exit(1);
}

const tenant = arg('tenant');
if (!tenant || !/^[0-9a-f-]{36}$/i.test(tenant)) {
  console.error('\n  Uso: COFRE_DATABASE_URL="..." npm run ensaio-cofre -- --tenant <uuid>\n');
  process.exit(1);
}

/**
 * A role de runtime - a que o `financeiro.service` REALMENTE usa para conectar.
 *
 * E `app_financeiro_login`, e nao `app_financeiro`. Medido no arranque do
 * servico em 28/08/2026: "conectado como app_financeiro_login - sem BYPASSRLS,
 * sem SUPERUSER". A segunda e a role de GRUPO que carrega os grants; a primeira
 * e a que abre a conexao e herda deles.
 *
 * A DIFERENCA IMPORTA PARA ESTE ENSAIO. Testar o grupo responderia "o grupo nao
 * le o cofre", que nao e a pergunta: a pergunta e se o processo que atende
 * requisicao le. Herança de role tem `INHERIT`/`NOINHERIT`, e um ensaio contra o
 * grupo passaria mesmo se a role de login tivesse um grant proprio a mais.
 */
const ROLE_RUNTIME = process.env.ROLE_RUNTIME ?? 'app_financeiro_login';
const MARCA = 'ENSAIO-COFRE';
const REF = `${MARCA}-${tenant.slice(0, 8)}`;

let falhas = 0;
const chk = (id: string, cond: boolean, d: string) => {
  if (!cond) falhas++;
  console.log(`${cond ? 'ok   ' : 'FALHA'} ${id.padEnd(5)} ${d.replace(/\s+/g, ' ')}`);
};

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

/** Roda algo que DEVE falhar, sem envenenar a transacao. Devolve o SQLSTATE. */
async function esperaRecusa(sql: string, params: unknown[] = []): Promise<string | null> {
  await cliente.query('SAVEPOINT sp');
  try {
    await cliente.query(sql, params);
    await cliente.query('RELEASE SAVEPOINT sp');
    return null;                       // nao recusou - e o teste falha
  } catch (e: any) {
    await cliente.query('ROLLBACK TO SAVEPOINT sp');
    return e?.code ?? 'erro-sem-codigo';
  }
}

try {
  // ------------------------------------------------- 1. o dono enxerga o cofre
  {
    const { rows: [r] } = await cliente.query(`
      SELECT pg_get_userbyid(proowner) AS dono,
             has_table_privilege(pg_get_userbyid(proowner),
                                 'vault.decrypted_secrets', 'SELECT') AS enxerga
        FROM pg_proc WHERE oid = 'app.resolver_credencial_cobranca(text)'::regprocedure`);
    chk('K1', r?.enxerga === true,
        `o dono da resolvedora ("${r?.dono}") enxerga vault.decrypted_secrets - sem isso nenhum boleto sai`);
  }

  await cliente.query('BEGIN');

  // -------------------------------------------------------- a fixture
  const segredo = JSON.stringify({
    client_id: 'ENSAIO-client-id',
    pfx_base64: Buffer.from('nao-e-certificado-de-verdade').toString('base64'),
    senha: 'ENSAIO',
  });
  await cliente.query('SELECT vault.create_secret($1, $2, $3)',
    [segredo, REF, `${MARCA} - criado e desfeito no mesmo ensaio`]);

  // O conector do tenant e UNIQUE por tenant_id: guarda o que houver, troca pela
  // fixture, e o ROLLBACK devolve o original. Nada disto sobrevive a transacao.
  await cliente.query('DELETE FROM conector_cobranca WHERE tenant_id = $1', [tenant]);
  await cliente.query(`
    INSERT INTO conector_cobranca
      (tenant_id, provedor, credencial_ref, numero_cliente, codigo_modalidade,
       numero_contrato_cobranca, sandbox, ativo)
    VALUES ($1, 'sicoob', $2, 25546454, 1, 1, true, true)`, [tenant, REF]);

  /*
   * VIRAR A ROLE DE RUNTIME, SE DER - e medido em 28/08/2026 que nem sempre da.
   *
   * A primeira versao fazia `SET LOCAL ROLE` direto e MORRIA com "permission
   * denied to set role app_financeiro_login": a conexao de dono da DIRECT_URL
   * nao e membro da role de runtime. No Supabase o `postgres` nao e superusuario
   * de verdade, e `SET ROLE` exige pertencer.
   *
   * O CONSERTO NAO E PEDIR O GRANT. `GRANT app_financeiro_login TO postgres`
   * resolveria o ensaio mexendo em PRIVILEGIO DE PRODUCAO para que um teste
   * passe - trocar a coisa medida pela medicao. E a pergunta nao precisa disso:
   * "esta role le aquela tabela?" o proprio catalogo responde, por
   * `has_table_privilege`, que JA considera heranca de role.
   *
   * Entao ha dois modos, e o ensaio diz em qual rodou:
   *
   *   FORTE       vira a role e TENTA ler o cofre. Prova por execucao.
   *   DECLARATIVO pergunta ao catalogo. Prova por privilegio.
   *
   * O declarativo roda SEMPRE, inclusive quando o forte roda - duas fontes para
   * a mesma promessa. O que nao existe e pular em silencio.
   */
  let comoRuntime = false;
  {
    const code = await esperaRecusa(`SET LOCAL ROLE ${ROLE_RUNTIME}`);
    comoRuntime = code === null;
    const { rows: [r] } = await cliente.query<{ usuario: string }>('SELECT current_user AS usuario');
    console.log(comoRuntime
      ? `\n  modo FORTE: a conexao virou "${ROLE_RUNTIME}".\n`
      : `\n  modo DECLARATIVO: "${r.usuario}" nao pode virar "${ROLE_RUNTIME}" (${code}).\n`
        + '  As perguntas de privilegio vao ao catalogo, que considera heranca. Pedir\n'
        + '  GRANT so para o ensaio passar seria mexer em producao para caber no teste.\n');
  }

  await cliente.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
  await cliente.query("SELECT set_config('app.usuario_id', $1, true)", [tenant]);

  {
    // DECLARATIVO, e sempre. `has_table_privilege` enxerga o privilegio herdado
    // do grupo `app_financeiro`, que e como a role de login recebe o que tem.
    const { rows: [r] } = await cliente.query<{ le_cofre: boolean; executa: boolean }>(`
      SELECT has_table_privilege($1, 'vault.decrypted_secrets', 'SELECT')                    AS le_cofre,
             has_function_privilege($1, 'app.resolver_credencial_cobranca(text)', 'EXECUTE') AS executa`,
      [ROLE_RUNTIME]);
    chk('K2a', r.le_cofre === false,
        `o catalogo diz que "${ROLE_RUNTIME}" NAO tem SELECT em vault.decrypted_secrets - a propriedade central do ADR-0005 A`);
    chk('K2b', r.executa === true,
        `e TEM EXECUTE na resolvedora - sem isso a emissao morreria com permission denied na funcao`);
  }

  if (comoRuntime) {
    const code = await esperaRecusa('SELECT decrypted_secret FROM vault.decrypted_secrets LIMIT 1');
    chk('K2c', code === '42501',
        `e a leitura direta, TENTADA como "${ROLE_RUNTIME}", e recusada de fato (SQLSTATE ${code ?? 'nenhum - leu!'})`);
  }

  {
    const { rows } = await cliente.query<{ segredo: string }>(
      'SELECT app.resolver_credencial_cobranca($1) AS segredo', [REF]);
    const devolvido = rows[0]?.segredo ? JSON.parse(rows[0].segredo) : null;
    chk('K3', devolvido?.client_id === 'ENSAIO-client-id',
        'e ainda assim resolve a credencial DO SEU tenant, pela funcao SECURITY DEFINER');
  }

  // --------------------------------------- 4. a trilha, na mesma transacao
  {
    const { rows: [r] } = await cliente.query<{ n: string }>(
      'SELECT count(*) AS n FROM cofre_acesso_log WHERE credencial_ref = $1 AND tenant_id = $2',
      [REF, tenant]);
    chk('K4', Number(r.n) === 1,
        'a leitura gravou UMA linha de trilha, e ela e visivel na mesma transacao (regra 9)');
  }

  // ------------------------------------------------ 5. tenant errado nao resolve
  {
    const outro = '00000000-0000-4000-8000-000000000000';
    await cliente.query("SELECT set_config('app.tenant_id', $1, true)", [outro]);
    const code = await esperaRecusa('SELECT app.resolver_credencial_cobranca($1)', [REF]);
    chk('K5', code === '42501',
        `com OUTRO tenant no contexto, a mesma referencia e recusada (SQLSTATE ${code ?? 'nenhum - resolveu!'})`);
    await cliente.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
  }

  // -------------------------------------------- 6. conector desligado nao resolve
  {
    if (comoRuntime) await cliente.query('RESET ROLE');
    await cliente.query('UPDATE conector_cobranca SET ativo = false WHERE tenant_id = $1', [tenant]);
    if (comoRuntime) await cliente.query(`SET LOCAL ROLE ${ROLE_RUNTIME}`);
    const code = await esperaRecusa('SELECT app.resolver_credencial_cobranca($1)', [REF]);
    chk('K6', code === '42501',
        `conector DESLIGADO nao resolve credencial (SQLSTATE ${code ?? 'nenhum - resolveu!'}) - e o que faz "desligar" ser botao de emergencia de verdade`);
  }

  // ------------------------------- 7. a guarda de identidade do conector morde
  {
    if (comoRuntime) await cliente.query('RESET ROLE');
    const code = await esperaRecusa(`
      UPDATE conector_cobranca SET ativo = true, numero_cliente = NULL WHERE tenant_id = $1`, [tenant]);
    chk('K7', code === '23514',
        `conector Sicoob ATIVO sem numeroCliente e recusado pelo banco (SQLSTATE ${code ?? 'nenhum - aceitou!'}) - a constraint conector_ativo_tem_identidade`);
  }

  // ------- 7b. e ela NAO morde o contrato de cobranca, que a API diz ser opcional
  /*
   * O outro lado da mesma guarda, e a razao de existir: a colecao Postman diz
   * que `numeroContratoCobranca` e "somente para cooperados que possuem mais de
   * um contrato". Com a constraint da migration 35 exigindo os tres, o
   * cooperado de contrato UNICO nao conseguia LIGAR o conector - descoberto so
   * na hora de ativar, com tudo o mais pronto. A migration 36 tirou a
   * exigencia, e este ensaio e o que impede alguem de recoloca-la sem perceber.
   */
  {
    if (comoRuntime) await cliente.query('RESET ROLE');
    const code = await esperaRecusa(`
      UPDATE conector_cobranca SET ativo = true, numero_contrato_cobranca = NULL WHERE tenant_id = $1`, [tenant]);
    chk('K8', code === null,
        `conector Sicoob ATIVO SEM numeroContratoCobranca e ACEITO${code ? ` (recusou com ${code} - a migration 36 nao esta no ar)` : ''} - o campo e opcional, e exigi-lo travaria o cooperado de contrato unico`);
  }

  await cliente.query('ROLLBACK');

  // ----------------------------------------- 8. o ensaio nao deixou rastro
  {
    const { rows: [r] } = await cliente.query<{ segredos: string; trilha: string; conector: string }>(`
      SELECT (SELECT count(*) FROM vault.secrets      WHERE name = $1)           AS segredos,
             (SELECT count(*) FROM cofre_acesso_log   WHERE credencial_ref = $1) AS trilha,
             (SELECT count(*) FROM conector_cobranca  WHERE credencial_ref = $1) AS conector`, [REF]);
    chk('K8', Number(r.segredos) === 0 && Number(r.trilha) === 0 && Number(r.conector) === 0,
        `depois do ROLLBACK nao sobrou nada: segredos=${r.segredos} trilha=${r.trilha} conector=${r.conector}`);
  }

  // E o conector ORIGINAL do tenant continua onde estava.
  {
    const { rows } = await cliente.query<{ credencial_ref: string; ativo: boolean }>(
      'SELECT credencial_ref, ativo FROM conector_cobranca WHERE tenant_id = $1', [tenant]);
    console.log(`\n  conector do tenant depois do ensaio: ${
      rows.length ? `${rows[0].credencial_ref} (ativo=${rows[0].ativo})` : 'nenhum - como estava antes'}`);
  }
} catch (e: any) {
  falhas++;
  console.error(`\n  ERRO no ensaio: ${e?.message ?? e}`);
  await cliente.query('ROLLBACK').catch(() => {});
} finally {
  await cliente.end().catch(() => {});
}

console.log(falhas === 0 ? '\nENSAIO DO COFRE OK\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
