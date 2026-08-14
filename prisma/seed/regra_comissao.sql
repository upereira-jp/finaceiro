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
--
-- DUAS LINHAS POR TIPO desde a migration 17, e a segunda coluna nao e detalhe:
-- o PRD 5.4 nao paga a comissao de uma vez, paga ESCALONADA pela 1a e pela 2a
-- fatura cheia paga do contrato. Da 3a em diante e zero, e o zero e a ausencia
-- de linha com parcela 3 - conferida em app.percentual_comissao, que devolve
-- zero por regra em vez de levantar.
--
--   tipo                      total   1a      2a
--   vendedor_g3                50%    25%     25%
--   terceirizado               50%    25%     25%   <- Q-COMIS-TERC-01
--   parceiro_indicador         25%    25%      0%   <- o "-" do PRD e zero DECLARADO
--   parceiro_captador          50%    30%     20%
--   parceiro_captador_senior   60%    30%     30%
--
-- `terceirizado` nao esta na tabela do PRD. O total de 50% e o que este seed ja
-- afirmava e nao muda; a quebra espelha o vendedor_g3, que e o tipo de mesmo
-- total, e fica registrada como Q-COMIS-TERC-01. O total e fato, a repartição
-- entre as duas parcelas e suposicao - e ela esta escrita aqui em vez de
-- escondida no motor.
--
-- `parceiro_indicador` parcela 2 com 0,00 e DECLARACAO, nao lacuna: sem a linha
-- a funcao levantaria no_data_found na 2a fatura cheia de todo contrato de
-- indicador, transformando "nao ha o que pagar" em incidente mensal.
INSERT INTO regra_comissao (id, tenant_id, originador_tipo, percentual, parcela, vigencia_inicio)
SELECT gen_random_uuid(), :tenant::uuid, t.tipo, t.pct, t.parcela, '-infinity'::date
FROM (VALUES
  ('vendedor_g3'::originador_tipo,              25.00, 1::smallint),
  ('vendedor_g3'::originador_tipo,              25.00, 2::smallint),
  ('terceirizado'::originador_tipo,             25.00, 1::smallint),
  ('terceirizado'::originador_tipo,             25.00, 2::smallint),
  ('parceiro_indicador'::originador_tipo,       25.00, 1::smallint),
  ('parceiro_indicador'::originador_tipo,        0.00, 2::smallint),
  ('parceiro_captador'::originador_tipo,        30.00, 1::smallint),
  ('parceiro_captador'::originador_tipo,        20.00, 2::smallint),
  ('parceiro_captador_senior'::originador_tipo, 30.00, 1::smallint),
  ('parceiro_captador_senior'::originador_tipo, 30.00, 2::smallint)
) AS t(tipo, pct, parcela)
WHERE NOT EXISTS (
  SELECT 1 FROM regra_comissao r
  WHERE r.tenant_id = :tenant::uuid AND r.originador_tipo = t.tipo AND r.parcela = t.parcela
);

-- ---------------------------------------------------------------- tarifa
-- ELA SAIU DAQUI EM 14/08/2026, com a migration 30, e a tabela `tarifa` junto.
--
-- O seed inseria 1,130000 R$/kWh para 'Equatorial', derivado de
-- consumo_reais / consumo_kwh e "exato em 5 de 5 ganhos medidos". A medicao de
-- 14/08 sobre os 41 cards mostrou que a amostra de 5 escondia a variacao: 35
-- UCs a 1,130000, 4 a 1,16 e 2 a 1,180000 - e a fatura real da Equatorial traz
-- 1,185396, com seis casas.
--
-- Uma tarifa por distribuidora obrigaria as 41 a compartilharem um numero que 6
-- delas contradizem, e o seed a plantaria como se fosse verdade. Hoje ela e
-- `unidade_consumidora.tarifa_reais_por_kwh`, preenchida na aba Unidades ou
-- semeada pelo conector a partir do card - e NENHUM seed a inventa, porque
-- inventar preco por unidade e o improviso que a regra 10 proibe.

-- ---------------------------------------------------------------- conferencia
DO $$
DECLARE nr int;
BEGIN
  SELECT count(*) INTO nr FROM regra_comissao;
  RAISE NOTICE 'seed: % regra(s) de comissao', nr;
  IF nr < 10 THEN RAISE EXCEPTION 'esperadas 10 regras de comissao (5 tipos x 2 parcelas), ha %', nr; END IF;
END $$;

COMMIT;
