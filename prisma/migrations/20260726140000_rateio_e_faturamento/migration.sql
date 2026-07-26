-- SPEC-001 R11, R14 e R23 - as tres regras que nao dependem da camada de aplicacao.

-- ============================================================ R11
/*
 * Sigma percentual_rateio por usina: ACIMA de 100% rejeita, ABAIXO passa com alerta.
 *
 * Assimetria deliberada, e a razao esta no dado real: hoje duas usinas somam
 * 91,20% e 99,78%. Bloquear abaixo de 100 pararia a operacao. Passar acima de
 * 100 alocaria credito que nao existe - e ai o erro sai em fatura.
 *
 * Tolerancia de 0,0001 porque percentual_rateio e numeric(7,4) e a soma de
 * varias parcelas fechadas em quatro casas pode dar 100,0001 sem ninguem ter
 * errado. Acima disso e erro de alocacao, nao arredondamento.
 *
 * CONSTRAINT TRIGGER DEFERRABLE, nao CHECK: CHECK nao soma linhas. E deferido
 * porque um rateio inteiro entra em varios INSERTs - conferir a cada linha
 * rejeitaria a UC intermediaria de um rateio que fecha certo no fim.
 *
 * CONSEQUENCIA QUE PRECISA FICAR ESCRITA: deferido protege no COMMIT, nao DENTRO
 * da transacao. Um bloco de codigo que insira acima do teto e leia o proprio
 * resultado antes de commitar VE o estado invalido - a transacao inteira aborta
 * depois. Quem precisar conferir no meio usa SET CONSTRAINTS ... IMMEDIATE, ou
 * a view rateio_por_usina. A suite de regras faz isso, e por isso ela pegou
 * esse comportamento em vez de mascara-lo.
 */
CREATE OR REPLACE FUNCTION app.exigir_teto_de_rateio() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE alvo uuid; soma numeric;
BEGIN
  alvo := coalesce(NEW.usina_id, OLD.usina_id);
  IF alvo IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(sum(uc.percentual_rateio), 0) INTO soma
  FROM public.unidade_consumidora uc
  WHERE uc.usina_id = alvo
    AND uc.tenant_id = coalesce(NEW.tenant_id, OLD.tenant_id)
    AND uc.status <> 'cancelada';

  IF soma > 100.0001 THEN
    RAISE EXCEPTION
      'R11: rateio da usina soma % por cento, acima do teto de 100 (tolerancia 0,0001)', soma
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER exigir_teto_de_rateio
  AFTER INSERT OR UPDATE OF percentual_rateio, usina_id, status ON unidade_consumidora
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_teto_de_rateio();

/*
 * O lado do ALERTA da R11. Primeira view do projeto - e por isso declara
 * security_invoker = true, sem o que ela ignoraria a RLS das tabelas base e a
 * invariante 13 falharia no CI. A regra existiu antes da primeira view
 * justamente para este momento.
 */
CREATE VIEW rateio_por_usina WITH (security_invoker = true) AS
SELECT u.tenant_id,
       u.id                                        AS usina_id,
       u.codigo_geradora,
       count(uc.id)                                AS ucs,
       coalesce(sum(uc.percentual_rateio), 0)      AS percentual_alocado,
       100 - coalesce(sum(uc.percentual_rateio),0) AS percentual_livre,
       CASE
         WHEN coalesce(sum(uc.percentual_rateio),0) > 100.0001 THEN 'acima_do_teto'
         WHEN coalesce(sum(uc.percentual_rateio),0) >= 99.9999 THEN 'completo'
         ELSE 'com_folga'
       END                                         AS situacao
FROM public.usina u
LEFT JOIN public.unidade_consumidora uc
       ON uc.usina_id = u.id AND uc.tenant_id = u.tenant_id AND uc.status <> 'cancelada'
GROUP BY u.tenant_id, u.id, u.codigo_geradora;

COMMENT ON VIEW rateio_por_usina IS
  'R11 - o lado do alerta. "com_folga" nao e erro: hoje duas usinas reais somam '
  '91,20% e 99,78%. O bloqueio e so acima do teto, e e da constraint trigger.';

GRANT SELECT ON rateio_por_usina TO app_financeiro;

-- ============================================================ R23
/*
 * Base de faturamento. UM arredondamento, no ULTIMO passo.
 *
 * O erro que isto evita nao e teorico. Se o consumo em reais for arredondado
 * antes de multiplicar, ou se a tarifa for truncada em centavos, o valor
 * divergir do faturado e questao de tempo - medido na R22: tarifa de
 * 1,187650 R$/kWh sobre 1.234,567 kWh da R$ 1.466,23 em numeric e R$ 1.469,13
 * guardando a tarifa em centavos. R$ 2,90 numa UC, num mes, sempre a mais.
 *
 * A funcao existe para que aplicacao e relatorio usem a MESMA conta. Duas
 * implementacoes da mesma formula sao duas respostas.
 */
CREATE OR REPLACE FUNCTION app.consumo_centavos(
  p_consumo_kwh numeric, p_tarifa_reais_por_kwh numeric
) RETURNS integer LANGUAGE sql IMMUTABLE AS
$$ SELECT round(p_consumo_kwh * p_tarifa_reais_por_kwh * 100)::integer $$;

COMMENT ON FUNCTION app.consumo_centavos(numeric, numeric) IS
  'R23. Um round(), no ultimo passo. Nunca arredonde consumo nem tarifa antes '
  'de multiplicar. IMMUTABLE: mesma entrada, mesma saida, sempre.';

/* Tarifa vigente numa competencia. Sem isto, cada chamador escreve o proprio
 * daterange e um deles usa o operador errado de borda. */
CREATE OR REPLACE FUNCTION app.tarifa_vigente(p_distribuidora text, p_competencia date)
  RETURNS numeric LANGUAGE sql STABLE AS
$$
  SELECT t.tarifa_reais_por_kwh
  FROM public.tarifa t
  WHERE t.tenant_id = app.current_tenant_id()
    AND t.distribuidora = p_distribuidora
    AND daterange(t.vigencia_inicio, t.vigencia_fim, '[)') @> p_competencia
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.consumo_centavos(numeric, numeric),
                          app.tarifa_vigente(text, date) TO app_financeiro;

/* Percentual de comissao pelo tier CONGELADO e pela data do fechamento (R20-b). */
CREATE OR REPLACE FUNCTION app.percentual_comissao(
  p_tier originador_tipo, p_data_fechamento date
) RETURNS numeric LANGUAGE sql STABLE AS
$$
  SELECT r.percentual
  FROM public.regra_comissao r
  WHERE r.tenant_id = app.current_tenant_id()
    AND r.originador_tipo = p_tier
    AND daterange(r.vigencia_inicio, r.vigencia_fim, '[)') @> p_data_fechamento
  LIMIT 1
$$;

COMMENT ON FUNCTION app.percentual_comissao(originador_tipo, date) IS
  'R20-b. Recebe o tier CONGELADO no contrato, nunca originador.tipo corrente: '
  'promocao de parceiro nao reprecifica contrato antigo.';

GRANT EXECUTE ON FUNCTION app.percentual_comissao(originador_tipo, date) TO app_financeiro;
