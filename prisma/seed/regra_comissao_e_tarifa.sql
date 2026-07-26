-- Seed das duas tabelas de "valor com data". SPEC-001 R20 a R24.
-- Idempotente: roda quantas vezes quiser. Recebe o tenant por :tenant.
--   psql -d <db> -v tenant="'<uuid>'" -f prisma/seed/regra_comissao_e_tarifa.sql
--
-- A DECISAO QUE PARECE TRIVIAL E NAO E: vigencia_inicio = '-infinity'.
--
-- Se a vigencia abrisse HOJE, recalcular a comissao de um ganho de marco nao
-- acharia regra: a consulta por vigencia devolveria zero linhas e o motor
-- cairia no PADRAO por AUSENCIA, nao por decisao. E como o PADRAO e 50% e o
-- parceiro_indicador e 25%, o erro pagaria o DOBRO no caso mais comum, em
-- silencio, so em recalculo historico.
--
-- '-infinity' diz o que e verdade: estas taxas nao comecaram numa data, elas
-- sempre foram. A decisao PADRAO registra isso - "50%, e sempre foi. Os 303
-- leads em PADRAO ja eram 50%". Quando uma taxa mudar de fato, fecha-se a linha
-- com vigencia_fim na data real e abre-se outra. Ai a data significa algo.

BEGIN;

-- ---------------------------------------------------------------- comissao
INSERT INTO regra_comissao (id, tenant_id, originador_tipo, percentual, vigencia_inicio)
SELECT gen_random_uuid(), :tenant::uuid, t.tipo, t.pct, '-infinity'::date
FROM (VALUES
  ('vendedor_g3'::originador_tipo,              50.00),   -- = PADRAO, a taxa da casa
  ('terceirizado'::originador_tipo,             50.00),
  ('parceiro_indicador'::originador_tipo,       25.00),
  ('parceiro_captador'::originador_tipo,        50.00),
  ('parceiro_captador_senior'::originador_tipo, 60.00)
) AS t(tipo, pct)
WHERE NOT EXISTS (
  SELECT 1 FROM regra_comissao r
  WHERE r.tenant_id = :tenant::uuid AND r.originador_tipo = t.tipo
);

-- ---------------------------------------------------------------- tarifa
-- 1,130000 R$/kWh. Derivada de consumo_reais / consumo_kwh, exata em 5 de 5
-- ganhos medidos. NAO e "fator de consumo": e preco por unidade, R22.
--
-- A distribuidora entra como texto porque a SPEC-001 3.3 nao criou tabela de
-- distribuidora. Enquanto for uma, o custo de nao ter e zero; na segunda,
-- vira Q-SPEC001 nova em vez de virar string divergente ('Equatorial' vs
-- 'EQUATORIAL GO' vs 'Equatorial Goias').
INSERT INTO tarifa (id, tenant_id, distribuidora, tarifa_reais_por_kwh, vigencia_inicio)
SELECT gen_random_uuid(), :tenant::uuid, 'Equatorial', 1.130000, '-infinity'::date
WHERE NOT EXISTS (
  SELECT 1 FROM tarifa t
  WHERE t.tenant_id = :tenant::uuid AND t.distribuidora = 'Equatorial'
);

-- ---------------------------------------------------------------- conferencia
DO $$
DECLARE nr int; nt int;
BEGIN
  SELECT count(*) INTO nr FROM regra_comissao;
  SELECT count(*) INTO nt FROM tarifa;
  RAISE NOTICE 'seed: % regra(s) de comissao, % tarifa(s)', nr, nt;
  IF nr < 5 THEN RAISE EXCEPTION 'esperadas 5 regras de comissao, ha %', nr; END IF;
END $$;

COMMIT;
