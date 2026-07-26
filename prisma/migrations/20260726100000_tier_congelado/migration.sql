-- SPEC-001 R20-b - congela o tier do originador no fechamento do contrato.
--
-- O FURO QUE ISTO FECHA: a R20 lia originador.tipo, que e a classificacao de
-- HOJE. Um captador promovido a senior em junho faria todo contrato de marco
-- recalcular a 60%, porque a busca acharia o tier novo. A vigencia de
-- regra_comissao nao cobre isso: ela versiona o PERCENTUAL DE UM TIER, nao o
-- TIER DE UMA PESSOA.
--
-- O tier e fato do fechamento, como a data e o valor. Promocao nao reprecifica
-- o passado. O CRM ja carimba esse tier no lead na criacao (campo
-- Comissionamento, via app_settings.g3_partner_rules) - e a semente natural.

ALTER TABLE contrato
  ADD COLUMN originador_tipo_no_fechamento originador_tipo NULL;

COMMENT ON COLUMN contrato.originador_tipo_no_fechamento IS
  'Tier do originador CONGELADO na data de fechamento. Nao le originador.tipo '
  'no calculo: promocao de parceiro nao reprecifica contrato antigo (R20-b). '
  'Semente: campo Comissionamento do lead no CRM. Correcao por erro de '
  'classificacao e edicao de admin com auditoria, e recalcula de proposito.';

-- Coerencia: se ha originador, ha tier congelado. Sem originador, nao ha tier.
ALTER TABLE contrato
  ADD CONSTRAINT contrato_tier_coerente CHECK (
    (originador_id IS NULL AND originador_tipo_no_fechamento IS NULL)
    OR (originador_id IS NOT NULL AND originador_tipo_no_fechamento IS NOT NULL)
  );
