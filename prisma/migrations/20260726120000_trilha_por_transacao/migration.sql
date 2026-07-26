-- SPEC-001 R2 - a trilha tem que ser DESTA transacao, nao de qualquer uma recente.
--
-- FURO MEDIDO EM 26/07/2026, no teste S15 da camada de sessao.
--
-- A migration 3 conferia assim:
--   EXISTS (... WHERE l.usuario_id = current_usuario_id()
--                 AND l.tenant_id  = current_tenant_id()
--                 AND l.ocorrido_em >= now() - interval '1 minute')
--
-- Isso torna a trilha FUNGIVEL: um usuario de plataforma que registre UM acesso
-- legitimo passa a poder escrever qualquer coisa naquele tenant pelos 60
-- segundos seguintes, sem gerar linha nenhuma. Medido: a escrita sem trilha
-- COMMITOU, satisfeita por uma linha de outra transacao ocorrida segundos antes.
--
-- "A trilha prova este acesso" era falso. Passa a ser verdade: a linha tem que
-- ter sido inserida NESTA transacao, e xmin distingue isso.
--
-- Removida tambem a tabela app_marcador_leitura_plataforma, criada na migration 3
-- e nunca usada - era a tentativa anterior de resolver isto, e ficou como lixo.

CREATE OR REPLACE FUNCTION app.exigir_trilha_de_plataforma() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF app.current_tier() IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.acesso_plataforma_log l
    WHERE l.usuario_id = app.current_usuario_id()
      AND l.tenant_id  = app.current_tenant_id()
      AND l.xmin = pg_current_xact_id()::xid   -- inserida NESTA transacao
  ) THEN
    RAISE EXCEPTION
      'R2: escrita em dado de tenant sob tier de plataforma sem trilha NESTA transacao'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION app.exigir_trilha_de_plataforma() IS
  'R2. Confere no COMMIT que a transacao que escreveu sob tier de plataforma '
  'gerou trilha NA PROPRIA transacao. A janela de 1 minuto da versao anterior '
  'tornava a trilha fungivel entre transacoes.';

DROP TABLE IF EXISTS app_marcador_leitura_plataforma;

-- Escrita sob tier de plataforma nao e caso de uso previsto - plataforma
-- diagnostica. O gatilho existe nas tabelas onde uma escrita indevida doeria
-- mais, nao em todas: cobrir as treze custaria treze triggers deferidos por
-- transacao para um caminho que deveria ser somente leitura.
CREATE CONSTRAINT TRIGGER exigir_trilha_contrato
  AFTER INSERT OR UPDATE OR DELETE ON contrato
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_trilha_de_plataforma();

CREATE CONSTRAINT TRIGGER exigir_trilha_regra_comissao
  AFTER INSERT OR UPDATE OR DELETE ON regra_comissao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_trilha_de_plataforma();

CREATE CONSTRAINT TRIGGER exigir_trilha_tarifa
  AFTER INSERT OR UPDATE OR DELETE ON tarifa
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_trilha_de_plataforma();
