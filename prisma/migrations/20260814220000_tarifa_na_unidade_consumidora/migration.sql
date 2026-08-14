-- MIGRATION 30 - A TARIFA SAI DA ABA E VAI PARA A UNIDADE CONSUMIDORA.
--
-- Decisao do dono, em duas formulacoes, a segunda de 14/08/2026:
--
--   *"por que a aba tarifas ainda existe? do modo com que ela esta sendo servida
--   ela e inutil, considerando que a tarifa esta sendo puxada diretamente da
--   UC/Card/Negociacao"*
--
--   *"remova definitivamente a aba Tarifas, pois ela ja nao possui finalidade e
--   apenas gera redundancia."*
--
-- ============================================================================
-- O QUE FOI MEDIDO ANTES, E SAO TRES SURPRESAS (RETOMADA-2026-08-14 §2.1)
--
--   1. a tarifa vinha de UMA tabela so - `tarifa`, chave (distribuidora,
--      vigencia). NAO havia coluna de tarifa em `unidade_consumidora` nem em
--      `contrato`. A composicao chamava `app.tarifa_vigente(distribuidora, comp)`;
--   2. a tabela guardava **UMA linha**: Equatorial, R$ 1,130000, vigencia aberta
--      dos dois lados. A planilha de 12/08 mediu **R$ 1,185396** na fatura real -
--      a aba servia **~5% abaixo**, e ninguem percebeu porque ZERO faturas foram
--      emitidas;
--   3. a tarifa por cliente EXISTE do lado do CRM, e ela nao se chama assim:
--      `financeiro.vendas_ganhas` expoe `consumo_kwh` e `consumo_reais`, e a
--      divisao da a tarifa do card. Pelo join `rateio_clientes.lead_codigo ->
--      vendas_ganhas.codigo`, **41 das 41 UCs** tem os dois preenchidos.
--
-- E a terceira medicao responde a pergunta que estava aberta: **a granularidade
-- e POR CLIENTE**, e nao uma por distribuidora. 35 UCs a 1,130000, 4 a 1,16 e 2 a
-- 1,180000. O modelo antigo - uma tarifa por distribuidora por vigencia - nao
-- comporta isso: ele obrigaria as 41 a compartilharem um numero que 6 delas
-- contradizem.
--
-- ============================================================================
-- POR QUE A COLUNA E DA UC, E NAO UMA LEITURA AO VIVO DO CRM
--
-- Tres caminhos foram medidos, e o custo de cada um esta na RETOMADA §2.4:
--
--   (a) ler do card AO VIVO na emissao      acopla o faturamento a
--                                            disponibilidade do CRM
--   (b) espelhar em coluna nossa            migration + o defeito conhecido do
--                                            conector de sobrescrever campo local
--   (c) ler da fatura da Equatorial em PDF   so serve ao fluxo da aba nova, que
--                                            ja o faz - o lote nao le PDF
--
-- **(b)**, e a razao de (a) nao servir e de consequencia e nao de gosto: emitir
-- fatura e o ato mais caro de errar do sistema, e o CRM e outro banco, de outro
-- time, com outra janela de manutencao. Uma emissao que para porque o CRM esta
-- fora e uma emissao que para por um motivo que nao e dela.
--
-- O DEFEITO DO CONECTOR QUE (b) TRAZIA JUNTO ESTA CONSERTADO NESTA LEVA, e ele e
-- real e ja foi medido: o espelho grava o NULO do CRM por cima de um valor local
-- preenchido, em silencio. A regra passa a ser explicita e esta em
-- `src/crm/sincronizacao.ts`: **o conector so escreve tarifa quando tem numero,
-- e nunca apaga o que ja existe**. E `COALESCE` no sentido certo.
--
-- ============================================================================
-- A R26 CONTINUA DE PE, E ELA E O QUE PERMITE APAGAR A TABELA
--
-- *"Sem tarifa vigente na competencia, a composicao LEVANTA em vez de devolver
-- zero - base de faturamento nula somaria como nada e coalesce como zero, e a
-- fatura sairia errada sem erro nenhum."*
--
-- A regra nao muda; muda de ONDE ela le. `app.tarifa_da_uc(uuid)` substitui
-- `app.tarifa_vigente(text, date)` com o MESMO comportamento de ausencia:
-- `no_data_found`, que `src/repos/fatura.ts` ja traduz para
-- `SemPrecoNaCompetencia` (422).
--
-- ============================================================================
-- E POR QUE A TABELA SAI AGORA, E NAO "DEPOIS, COM CALMA"
--
-- E a mesma decisao da migration 27, e o argumento e o mesmo: duas fontes para o
-- mesmo numero e o comeco de alguem editar uma e faturar pela outra. E o custo e
-- **zero medido, nao estimado**: producao tem **0 faturas**, entao nenhuma fatura
-- emitida aponta para a tarifa que sai. A unica linha da tabela carrega um valor
-- que a medicao de 12/08 ja mostrou estar ~5% abaixo do real - ela nao e dado a
-- preservar, e migra-la poria um numero sabidamente errado em 41 UCs.

-- ================================================= 1. A COLUNA NA UC

ALTER TABLE unidade_consumidora
  ADD COLUMN tarifa_reais_por_kwh numeric(12,6);

/*
 * SEIS CASAS, E NAO CENTAVOS. E a R22, e o motivo esta medido: truncar
 * 1,187650 em centavos cobra R$ 2,90 a mais numa UC, num mes, SEMPRE a mais.
 * Tarifa e preco por unidade - a regra 1 manda grandeza fisica e proporcao
 * manterem escala decimal, e R$/kWh e exatamente isso.
 */
ALTER TABLE unidade_consumidora
  ADD CONSTRAINT uc_tarifa_positiva
  CHECK (tarifa_reais_por_kwh IS NULL OR tarifa_reais_por_kwh > 0);

/*
 * O TETO NAO E ARBITRARIO. A tarifa medida na fatura real da Equatorial GO e
 * R$ 1,185396/kWh; a mais cara do Brasil nao passa de ~R$ 2. Um teto de 100
 * nao barra erro de digitacao plausivel, e um de 2 barraria uma alta legitima.
 * 10 e a ordem de grandeza que separa "tarifa" de "alguem digitou centavos no
 * campo de reais" (118,54 em vez de 1,185396), que e o erro de digitacao que
 * de fato acontece aqui.
 */
ALTER TABLE unidade_consumidora
  ADD CONSTRAINT uc_tarifa_na_ordem_de_grandeza
  CHECK (tarifa_reais_por_kwh IS NULL OR tarifa_reais_por_kwh <= 10);

COMMENT ON COLUMN unidade_consumidora.tarifa_reais_por_kwh IS
  'R$/kWh desta UC, seis casas (R22). Substitui a tabela `tarifa` desde a migration 30: a '
  'granularidade real e POR CLIENTE, medida em 14/08 - 35 UCs a 1,130000, 4 a 1,16 e 2 a '
  '1,180000. Preenchida a mao na aba Unidades ou pelo conector, a partir de '
  'financeiro.vendas_ganhas (consumo_reais / consumo_kwh). NULL faz a composicao LEVANTAR (R26).';

-- ================================================ 2. A FUNCAO NOVA
--
-- Mesmo contrato de ausencia da antiga: `no_data_found`, que o repositorio ja
-- traduz. O que muda e a chave - a UC, e nao a distribuidora.

CREATE OR REPLACE FUNCTION app.tarifa_da_uc(p_unidade_consumidora_id uuid)
  RETURNS numeric LANGUAGE plpgsql STABLE AS
$$
DECLARE v numeric;
BEGIN
  SELECT uc.tarifa_reais_por_kwh INTO v
    FROM public.unidade_consumidora uc
   WHERE uc.tenant_id = app.current_tenant_id()
     AND uc.id = p_unidade_consumidora_id;

  IF v IS NULL THEN
    RAISE EXCEPTION
      'sem tarifa vigente para a unidade consumidora %', p_unidade_consumidora_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION app.tarifa_da_uc(uuid) IS
  'R26: a tarifa da UC, e LEVANTA quando nao ha - ausencia de preco nao vira zero. Substitui '
  'app.tarifa_vigente(text, date), que lia a tabela `tarifa` por distribuidora e vigencia. A '
  'granularidade real e por cliente, medida em 14/08/2026.';

GRANT EXECUTE ON FUNCTION app.tarifa_da_uc(uuid) TO app_financeiro;

-- ============================ 3. A TABELA, A FUNCAO ANTIGA E A VIGENCIA SAEM
--
-- `tarifa` tem UMA linha em producao, com um valor que a medicao de 12/08 mostrou
-- estar ~5% abaixo do real, e ZERO faturas apontam para ela. Nao ha o que
-- preservar, e migra-la espalharia um numero errado por 41 UCs.

DROP FUNCTION IF EXISTS app.tarifa_vigente(text, date);
DROP TABLE IF EXISTS tarifa;

/*
 * O GATILHO DE VIGENCIA, se houver, cai junto com a tabela - `DROP TABLE` leva
 * gatilhos e indices dela. O que NAO cai sozinho e a funcao acima, porque ela e
 * de schema e nao da tabela: e por isso ela tem linha propria.
 */
