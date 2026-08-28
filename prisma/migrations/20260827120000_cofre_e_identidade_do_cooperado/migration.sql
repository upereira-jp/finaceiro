-- MIGRATION 35 - O COFRE PASSA A EXISTIR, E A IDENTIDADE DO COOPERADO GANHA
-- CAMPO PROPRIO EM VEZ DE UM MAPEAMENTO ADIVINHADO.
--
-- ============================================================================
-- O QUE ESTA MIGRATION DESTRAVA
--
-- `src/sicoob/http.ts` - o adaptador real da Cobranca Bancaria v3, que e a
-- ultima peca de codigo do repositorio. Ele precisa de duas coisas que ate hoje
-- nao existiam no banco:
--
--   1. um jeito de a role de runtime resolver a `credencial_ref` para o
--      certificado A1, SEM que a role alcance o schema `vault` (ADR-0005 A);
--   2. os tres campos que a API chama de `numeroCliente`,
--      `codigoModalidade` e `numeroContratoCobranca`.
--
-- ============================================================================
-- POR QUE OS TRES CAMPOS SAO NOVOS, TENDO A TABELA QUATRO PARECIDOS
--
-- `conector_cobranca` ja tem `numero_contrato`, `numero_convenio`, `agencia` e
-- `conta`. A tentacao e mapear - `numero_contrato` -> `numeroContratoCobranca`,
-- e pronto. O `SICOOB-contrato-medido` 4 registrou por que nao:
--
--     "Sao a IDENTIDADE do cooperado e vem com o contrato. NAO se derivam de
--      conector_cobranca (...) e qual mapeia para qual e pergunta para quem
--      abrir a conta, nao para codigo."
--
-- Um mapeamento adivinhado aqui nao falha em migration nem em teste: falha no
-- primeiro POST real, com `400` do banco, ou - pior - registra o boleto na
-- carteira errada. Entao os campos entram com o NOME DA API, ao lado dos
-- quatro antigos e sem tocar neles. Os quatro continuam sendo o que sempre
-- foram: o que NOS anotamos da conta. Os tres novos sao o que O BANCO diz.
--
-- Enquanto ninguem perguntar a cooperativa, eles ficam NULL - e o adaptador
-- recusa nomeando qual falta, que e o comportamento que a regra 10 pede: a
-- lacuna vira recusa visivel, nunca default "porque parecia razoavel".
--
-- ============================================================================
-- 1. A IDENTIDADE DO COOPERADO
-- ============================================================================

ALTER TABLE conector_cobranca
  ADD COLUMN numero_cliente           integer,
  ADD COLUMN codigo_modalidade        smallint,
  ADD COLUMN numero_contrato_cobranca integer,
  ADD COLUMN numero_conta_corrente    integer;

COMMENT ON COLUMN conector_cobranca.numero_cliente IS
  'numeroCliente da Cobranca v3. Vem da COOPERATIVA, nao se deriva de agencia/conta.';
COMMENT ON COLUMN conector_cobranca.codigo_modalidade IS
  'codigoModalidade da Cobranca v3 (1 = simples com registro). Vem da COOPERATIVA.';
COMMENT ON COLUMN conector_cobranca.numero_contrato_cobranca IS
  'numeroContratoCobranca da Cobranca v3. NAO e o numero_contrato desta mesma tabela.';
COMMENT ON COLUMN conector_cobranca.numero_conta_corrente IS
  'numeroContaCorrente da Cobranca v3. Opcional no envio: so vai quando preenchido.';

-- Inteiro positivo, e a razao e o literal JSON: a API recebe estes quatro como
-- NUMERO, e numero JSON nao tem zero a esquerda. Guardar "0025" em text e
-- depois mandar 25 seria perder informacao que nunca existiu.
ALTER TABLE conector_cobranca
  ADD CONSTRAINT conector_identidade_positiva CHECK (
    (numero_cliente           IS NULL OR numero_cliente           > 0) AND
    (codigo_modalidade        IS NULL OR codigo_modalidade        > 0) AND
    (numero_contrato_cobranca IS NULL OR numero_contrato_cobranca > 0) AND
    (numero_conta_corrente    IS NULL OR numero_conta_corrente    > 0)
  );

/*
 * A GUARDA DE ATIVACAO, e ela entra NOT VALID de proposito.
 *
 * O que ela impede: conector `ativo` da Sicoob sem os tres campos de identidade
 * - ou seja, um conector que o sistema aceita ligar e que NAO consegue emitir.
 * Sem ela, o erro aparece no primeiro boleto do primeiro cliente, que e o pior
 * momento possivel para descobrir que falta um dado cadastral.
 *
 * POR QUE `NOT VALID`: esta migration nao consegue saber se ja existe linha
 * ativa em producao, e uma CHECK validada abortaria o deploy inteiro por causa
 * de uma linha antiga. `NOT VALID` cobre toda linha NOVA e todo UPDATE, deixa
 * as antigas em paz, e quem preencher os campos depois roda
 *
 *     ALTER TABLE conector_cobranca VALIDATE CONSTRAINT conector_ativo_tem_identidade;
 *
 * para fechar o buraco. Isso esta na PENDENCIAS, com dono.
 */
ALTER TABLE conector_cobranca
  ADD CONSTRAINT conector_ativo_tem_identidade CHECK (
    NOT ativo
    OR provedor <> 'sicoob'
    OR (numero_cliente IS NOT NULL
        AND codigo_modalidade IS NOT NULL
        AND numero_contrato_cobranca IS NOT NULL)
  ) NOT VALID;

-- ============================================================================
-- 2. A TRILHA DE ACESSO AO COFRE
-- ============================================================================
/*
 * A regra 9 manda gravar quem leu dado de tenant. O `ADR-0005` 6 deixou EM
 * ABERTO se isso vale para leitura de credencial - "minha leitura e que sim,
 * mas e leitura, nao decisao registrada".
 *
 * Esta migration implementa o lado conservador (a trilha existe) e NAO fecha a
 * decisao: se o dono decidir que nao vale, sobra uma tabela de log a mais, o
 * que e barato. O contrario - descobrir depois que precisava e nao ter o
 * historico - nao tem conserto retroativo. Registrado como `Q-COFRE-01`.
 *
 * TABELA PROPRIA, e nao `auditoria`: aquela tem
 * `operacao char(1) CHECK (operacao IN ('I','U','D'))`, e leitura nao e
 * nenhuma das tres. Enfiar 'L' ali exigiria afrouxar uma constraint que hoje
 * cobre quatorze tabelas - o preco errado por um campo.
 *
 * SEM FK PARA `tenant`, pelo mesmo motivo de `auditoria`: a trilha tem de
 * sobreviver ao encerramento do tenant.
 */
CREATE TABLE cofre_acesso_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  credencial_ref text NOT NULL,
  usuario_id     uuid,          -- NULL = leitura sem contexto de usuario (agenda, script)
  tier           text,          -- capturado NA LEITURA, como em auditoria
  ocorrido_em    timestamptz NOT NULL DEFAULT clock_timestamp(),
  xact_id        xid8 NOT NULL DEFAULT pg_current_xact_id()
);
CREATE INDEX cofre_acesso_log_tenant_idx ON cofre_acesso_log (tenant_id, ocorrido_em DESC);

COMMENT ON TABLE cofre_acesso_log IS
  'Regra 9 - quem resolveu qual credencial, e quando. Append-only: a role de '
  'runtime nao tem UPDATE nem DELETE. Log nao se audita, se torna imutavel.';

ALTER TABLE cofre_acesso_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cofre_acesso_log FORCE ROW LEVEL SECURITY;

-- Regra 3: RLS habilitada sem policy e falha, nao configuracao.
CREATE POLICY cofre_log_do_tenant ON cofre_acesso_log
  FOR SELECT USING (tenant_id = app.current_tenant_id());

GRANT SELECT ON cofre_acesso_log TO app_financeiro;
-- INSERT so pela resolvedora (SECURITY DEFINER). Ninguem forja linha de trilha.
REVOKE INSERT, UPDATE, DELETE ON cofre_acesso_log FROM app_financeiro;

-- ============================================================================
-- 3. A RESOLVEDORA
-- ============================================================================
/*
 * O DESENHO E O DO `ADR-0005` OPCAO A, ponto a ponto:
 *
 *   1. o segredo vive em `vault.secrets` com `name = credencial_ref`;
 *   2. a role de runtime CONTINUA sem alcancar o schema `vault` - medido em
 *      28/07: `app_financeiro` nao tem grant nenhum la, e isso e propriedade a
 *      preservar, nao acidente a desfazer;
 *   3. quem atravessa e esta funcao, `SECURITY DEFINER`, e ela confere que a
 *      `credencial_ref` pedida e a do conector DAQUELE tenant antes de devolver;
 *   4. a trilha entra na MESMA transacao (regra 9). Se o INSERT falhar, a
 *      leitura falha junto - e e isso que "na mesma transacao" quer dizer.
 *
 * O QUE ELA NAO FAZ, e e o ponto mais importante: ela nao aceita `p_tenant`.
 * O tenant sai de `app.current_tenant_id()`, que so o `withTenant` emite. Uma
 * assinatura que recebesse o tenant por parametro deixaria quem chama escolher
 * de quem e o certificado - e "quem chama" e codigo de aplicacao.
 *
 * `ativo` FAZ PARTE DA CONFERENCIA. Conector desligado nao resolve credencial:
 * desligar o conector e o botao de emergencia quando um certificado vaza, e um
 * botao que nao corta o acesso ao segredo nao e botao de emergencia.
 */
CREATE OR REPLACE FUNCTION app.resolver_credencial_cobranca(p_ref text)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE
  v_tenant  uuid;
  v_segredo text;
BEGIN
  v_tenant := app.current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'resolver_credencial_cobranca fora de contexto de tenant'
      USING ERRCODE = '42501',
            HINT = 'Envolva a chamada em withTenant(). Sem contexto nao ha de quem e a credencial.';
  END IF;

  PERFORM 1 FROM public.conector_cobranca
   WHERE tenant_id = v_tenant AND credencial_ref = p_ref AND ativo;
  IF NOT FOUND THEN
    -- Mensagem deliberadamente igual para "nao e sua", "nao existe" e "esta
    -- desligada". Distinguir os tres contaria a quem perguntou que a
    -- referencia existe em OUTRO tenant.
    RAISE EXCEPTION 'credencial nao disponivel para este tenant'
      USING ERRCODE = '42501',
            HINT = 'Confira se o conector_cobranca do tenant esta ativo e se a credencial_ref confere.';
  END IF;

  SELECT decrypted_secret INTO v_segredo
    FROM vault.decrypted_secrets WHERE name = p_ref;
  IF v_segredo IS NULL THEN
    RAISE EXCEPTION 'credencial % nao esta no cofre', p_ref
      USING ERRCODE = '42704',
            HINT = 'O conector aponta para uma referencia que ninguem guardou. Rode o provisionamento do A1.';
  END IF;

  INSERT INTO public.cofre_acesso_log (tenant_id, credencial_ref, usuario_id, tier)
  VALUES (v_tenant, p_ref, app.current_usuario_id(), app.current_tier());

  RETURN v_segredo;
END $$;

REVOKE ALL ON FUNCTION app.resolver_credencial_cobranca(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_credencial_cobranca(text) TO app_financeiro;

COMMENT ON FUNCTION app.resolver_credencial_cobranca(text) IS
  'ADR-0005 opcao A. Unica ponte entre a role de runtime e o schema vault. '
  'Confere tenant + conector ativo, grava trilha na mesma transacao (regra 9).';

/*
 * A CONFERENCIA QUE NAO E ENFEITE.
 *
 * `SECURITY DEFINER` roda com os privilegios do DONO da funcao. Se esta
 * migration for aplicada por uma role que nao enxerga `vault.decrypted_secrets`,
 * a funcao COMPILA, o deploy PASSA, e a falha aparece na primeira emissao - com
 * "permission denied for view decrypted_secrets" a tres camadas de distancia.
 *
 * Entao o proprio deploy avisa. WARNING e nao EXCEPTION porque o resto da
 * migration e util mesmo assim: os campos de identidade e a trilha entram, e o
 * conserto e um ALTER FUNCTION ... OWNER TO postgres depois.
 */
DO $$
DECLARE v_dono text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_dono
    FROM pg_proc WHERE oid = 'app.resolver_credencial_cobranca(text)'::regprocedure;

  IF NOT has_table_privilege(v_dono, 'vault.decrypted_secrets', 'SELECT') THEN
    RAISE WARNING E'\n'
      '  ============================================================\n'
      '  A resolvedora foi criada, mas o dono dela (%) NAO enxerga\n'
      '  vault.decrypted_secrets. Nenhum boleto vai sair assim.\n'
      '  Conserto:  ALTER FUNCTION app.resolver_credencial_cobranca(text) OWNER TO postgres;\n'
      '  ============================================================', v_dono;
  ELSE
    RAISE NOTICE 'resolvedora do cofre: dono % enxerga o vault. OK.', v_dono;
  END IF;
END $$;
