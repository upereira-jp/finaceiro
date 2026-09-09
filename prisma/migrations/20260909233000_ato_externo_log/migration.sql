-- ============================================================================
-- Q-AUDIT-EXTERNO-01 — a trilha dos atos que acontecem FORA do nosso banco
-- ============================================================================
/*
 * O QUE ESTA MIGRATION FECHA, e a lacuna foi registrada antes de ser tapada.
 *
 * Em 09/09/2026 nasceu o botao «Religar o aviso de pagamento»: ele CADASTRA, na
 * Sicoob, o canal por onde o banco avisa que um boleto foi pago. A regra 9 pede
 * "quem, quando, o que" para cadastro — e esse ato **nao deixava trilha
 * nenhuma**, por uma razao estrutural e nao por descuido:
 *
 *   1. ele nao escreve NADA no nosso banco, entao o gatilho `app.auditar()` —
 *      que e quem grava — nao tem o que pegar; e
 *   2. a aplicacao nao pode gravar direto: `GRANT SELECT ON auditoria TO
 *      app_financeiro`, `GRANT INSERT ... TO auditor_financeiro`.
 *
 * TABELA PROPRIA, E NAO `auditoria`, e a decisao NAO e nova — e a mesma que a
 * migration do cofre tomou em 27/08/2026, com as mesmas palavras: `auditoria`
 * tem `operacao char(1) CHECK (operacao IN ('I','U','D'))`, e afrouxar uma
 * constraint que hoje cobre quatorze tabelas seria "o preco errado por um
 * campo". Ali o que nao cabia era LEITURA e saiu `cofre_acesso_log`; aqui o que
 * nao cabe e ATO EM SISTEMA DE TERCEIRO — `auditoria.tabela` nomeia tabelas
 * NOSSAS, e `auditoria_registro_idx` e `(tabela, registro_id)`. Escrever
 * 'aviso_de_pagamento_sicoob' ali seria mentir sobre o que a coluna significa.
 *
 * ============================================================================
 * DUAS LINHAS POR ATO, E E ISTO QUE TORNA A TRILHA HONESTA
 *
 * A chamada ao banco NAO E TRANSACIONAL, e nao ha como fingir que e. Entao:
 *
 *   gravar SO ANTES   registraria um ato que talvez nao aconteca;
 *   gravar SO DEPOIS  perde a trilha se o processo morrer no meio — e o ato ja
 *                     aconteceu no mundo.
 *
 * Por isso `fase`: uma linha `pedido` ANTES (na nossa transacao, e se ela falhar
 * nada e enviado — falhar aqui e seguro, porque nada aconteceu ainda) e uma
 * `feito` ou `falhou` DEPOIS, com o que o banco respondeu.
 *
 * O DESENHO NAO E INVENTADO AQUI: e o mesmo do `agenda_execucao`, cujo motor
 * declara no cabecalho "uma linha de registro que COMMITA antes do trabalho".
 * Um `pedido` sem `feito` e exatamente a pergunta que se quer poder fazer —
 * "alguem mandou religar e nao sabemos o que aconteceu" — e hoje ela nao tem
 * onde ser feita.
 *
 * ============================================================================
 * O QUE NAO ENTRA EM `detalhe`: segredo, nunca (regra 5). Entram a URL, o
 * e-mail de aviso, o nivel de antes e o id que o banco devolveu — tudo o que ja
 * viaja em claro ate a contraparte.
 */

CREATE TABLE ato_externo_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SEM FK para tenant, pelo mesmo motivo de `auditoria` e de
  -- `cofre_acesso_log`: a trilha tem de sobreviver ao encerramento do tenant.
  tenant_id   uuid NOT NULL,
  /* O ATO, em vocabulario de dominio e nao de HTTP (regra 7). 'religar_aviso'
   * e o que aconteceu; 'POST /webhooks' e como aconteceu, e como muda. */
  ato         text NOT NULL,
  -- Quem esta do outro lado. Hoje so 'sicoob', e a coluna existe para o dia em
  -- que houver outro banco: sem ela, `ato` viraria 'religar_aviso_sicoob'.
  contraparte text NOT NULL,
  fase        text NOT NULL CHECK (fase IN ('pedido', 'feito', 'falhou')),
  usuario_id  uuid,          -- NULL = ato sem contexto de usuario (script, agenda)
  tier        text,          -- capturado NA ESCRITA, como em auditoria
  detalhe     jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  xact_id     xid8 NOT NULL DEFAULT pg_current_xact_id()
);

CREATE INDEX ato_externo_log_tenant_idx ON ato_externo_log (tenant_id, ocorrido_em DESC);
/* O indice do PAR pedido/feito: a pergunta que esta tabela existe para
 * responder e "houve pedido sem desfecho?", e ela varre por ato dentro do
 * tenant. */
CREATE INDEX ato_externo_log_ato_idx ON ato_externo_log (tenant_id, ato, ocorrido_em DESC);

COMMENT ON TABLE ato_externo_log IS
  'Regra 9 para atos que acontecem FORA do nosso banco - o gatilho app.auditar() '
  'nao os alcanca porque nao ha escrita nossa para disparar. Duas linhas por ato '
  '(pedido antes, feito/falhou depois) porque chamada a terceiro nao e '
  'transacional. Append-only: a role de runtime nao tem UPDATE nem DELETE.';

ALTER TABLE ato_externo_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ato_externo_log FORCE ROW LEVEL SECURITY;

-- Regra 3: RLS habilitada sem policy e falha, nao configuracao.
CREATE POLICY ato_externo_log_do_tenant ON ato_externo_log
  FOR SELECT USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

-- Escrita: SO a funcao, que roda como auditor_financeiro. Ninguem forja linha
-- de trilha - a mesma frase da migration do cofre.
CREATE POLICY ato_externo_log_escrita_da_funcao ON ato_externo_log
  FOR INSERT TO auditor_financeiro
  WITH CHECK (true);

/*
 * A PEGADINHA DA MIGRATION 2 VALE AQUI TAMBEM, e ela ja mordeu uma vez: aquela
 * rodou `ALTER DEFAULT PRIVILEGES ... GRANT SELECT,INSERT,UPDATE,DELETE ... TO
 * app_financeiro`, o que concede DML em TODA tabela futura do schema.
 * Append-only tem de ser REIMPOSTO, tabela por tabela. Sem o REVOKE abaixo, a
 * trilha nasceria apagavel por quem ela audita.
 */
REVOKE ALL ON ato_externo_log FROM app_financeiro;
GRANT SELECT ON ato_externo_log TO app_financeiro;
GRANT INSERT ON ato_externo_log TO auditor_financeiro;

/*
 * ELA NAO ACEITA `p_tenant`, e a razao e a mesma da resolvedora do cofre: o
 * tenant sai de `app.current_tenant_id()`, que so o `withTenant` emite. Uma
 * assinatura que o recebesse por parametro deixaria quem chama escolher em nome
 * de quem a trilha e gravada — e "quem chama" e codigo de aplicacao.
 *
 * DEVOLVE O `id` para que a linha `feito` possa apontar para o `pedido` que a
 * originou (`detalhe->>'pedido_id'`), e o par fique legivel sem adivinhacao por
 * horario.
 */
CREATE OR REPLACE FUNCTION app.registrar_ato_externo(
  p_ato text, p_contraparte text, p_fase text, p_detalhe jsonb DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE v_id uuid; v_tenant uuid;
BEGIN
  v_tenant := app.current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ato externo sem contexto de tenant'
      USING HINT = 'Chame dentro de withTenant. A trilha nao existe fora de um tenant, '
                   'e gravar com tenant NULL esconderia o ato de quem tem direito de ve-lo.';
  END IF;

  INSERT INTO public.ato_externo_log
    (tenant_id, ato, contraparte, fase, usuario_id, tier, detalhe)
  VALUES
    (v_tenant, p_ato, p_contraparte, p_fase,
     app.current_usuario_id(), app.current_tier(), p_detalhe)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

ALTER FUNCTION app.registrar_ato_externo(text, text, text, jsonb) OWNER TO auditor_financeiro;
REVOKE ALL ON FUNCTION app.registrar_ato_externo(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.registrar_ato_externo(text, text, text, jsonb) TO app_financeiro;

COMMENT ON FUNCTION app.registrar_ato_externo(text, text, text, jsonb) IS
  'Regra 9 para ato em sistema de terceiro. SECURITY DEFINER como '
  'auditor_financeiro: e o que permite append-only sob FORCE RLS sem BYPASSRLS. '
  'O tenant sai do contexto e NAO e parametro.';
