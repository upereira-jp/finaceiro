-- MIGRATION 16 - CARTEIRA: fatura, boleto, liquidacao. A F2 comeca aqui.
--
-- ORIGEM DAS DECISOES QUE ESTA MIGRATION EMBARCA. Nenhuma foi escolhida por
-- quem escreveu o SQL; todas tem fonte datada, e onde a fonte falta a coluna
-- NAO existe (regra 10 - lacuna vira questao, nao valor default):
--
--   PAUTA-contador 9a = B  -> a base de faturamento e a GERACAO EFETIVAMENTE
--                             MEDIDA na competencia, nao o percentual alocado
--                             no contrato. Fecha a Q-021 do PRD 11, aberta
--                             desde a F0, e da a RATEIO-USO-01 a segunda
--                             medida que faltava. Ver o bloco "9a" abaixo.
--   PAUTA-contador 1       -> competencia para RECEITA, caixa para SPLIT. Por
--                             isso `emitida_em` existe e e o fato gerador da
--                             receita, e o split (migration 17) so roda na
--                             liquidacao, como o PRD 5.2 ja mandava.
--   PAUTA-contador 5 = A   -> nao ha exigencia de nota fiscal. O BOLETO e o
--                             instrumento de cobranca, e por isso `boleto` e a
--                             unica tabela de documento desta migration. Nao
--                             ha integracao com prefeitura nem com SEFAZ, e
--                             nao ha coluna reservada para isso.
--   PAUTA-contador 6b = Nao-> sem credito de IBS/CBS a apropriar. A fatura NAO
--                             carrega coluna de tributo recuperavel, e nao
--                             nasce conta a receber de credito fiscal.
--   PAUTA-contador 6c      -> Simples. Nenhuma tabela de aliquota por regime e
--                             versionada aqui.
--   PRD-v2.2 4.3 e 5.1     -> os componentes da fatura e a formula do total.
--   SPEC-001 R23           -> um arredondamento, no ultimo passo, e os TRES
--                             valores persistidos: kWh, tarifa e o derivado.
--
-- O QUE NAO ESTA AQUI, DE PROPOSITO: `inadimplencia` (PRD 4.3) e visao derivada
-- mais registro de tratativa. Derivada ja sai de `fatura` por consulta; o
-- registro de tratativa e entidade propria e entra com a tela que a usa. Criar
-- a tabela agora seria schema sem escritor.

-- ============================================================ enums
/*
 * Os seis estados do PRD 4.3, sem acrescimo. `negociada` existe la e fica aqui
 * mesmo sem motor de negociacao: e estado do PRD, e o enum e do PRD.
 */
CREATE TYPE status_fatura AS ENUM
  ('rascunho','emitida','paga','vencida','cancelada','negociada');

/*
 * De onde veio a baixa. Importa para auditoria e para a Q-LIQ-01: webhook e
 * conciliacao sao automaticos e carregam id externo; `manual` e humano e
 * exige que alguem assine a baixa - a trilha da regra 9 pega quem foi.
 */
CREATE TYPE origem_liquidacao AS ENUM ('webhook_sicoob','conciliacao','manual');

/*
 * Estado do boleto NO BANCO, nao no nosso sistema. `pendente` e "ainda nao
 * subiu para a Sicoob"; `erro` guarda a tentativa que falhou sem perder o
 * boleto, que e o que permite a fila de retentativa do PRD 6.
 */
CREATE TYPE status_boleto AS ENUM
  ('pendente','registrado','liquidado','baixado','cancelado','erro');

-- ============================================================ fatura
/*
 * BLOCO "9a" - POR QUE A FATURA GUARDA CINCO NUMEROS E NAO UM.
 *
 * A resposta 9a da PAUTA escolheu faturar pela geracao efetivamente medida. A
 * cadeia inteira e:
 *
 *     geracao_kwh_competencia   (usina_geracao, medida na competencia)
 *   x percentual_rateio_aplicado (a fatia contratada daquela UC)
 *   = consumo_kwh                (o credito que esta UC recebeu de fato)
 *   x tarifa_reais_por_kwh       (tarifa vigente NA COMPETENCIA, R21)
 *   = valor_consumo_centavos     (um round(), no ultimo passo - R23)
 *
 * Os cinco sao persistidos porque cada um pode mudar depois por motivo
 * legitimo: a distribuidora reajusta a tarifa, a operacao corrige a geracao
 * lancada, o rateio e renegociado. Guardar so o valor final faz o historico
 * divergir do faturado no primeiro reajuste - e a R23 ja dizia isso para tres
 * dos cinco. Guardar so os insumos obrigaria a recalcular para exibir, e
 * recalcular com regra de hoje um documento de marco e o furo da R20-b.
 *
 * CONSEQUENCIA MEDIDA, E ELA E O PONTO: com a base sendo a geracao medida, o
 * "quanto a usina JA FOI usada" da RATEIO-USO-01 deixa de precisar de
 * invariante propria. A soma dos kWh faturados de uma usina numa competencia e
 *
 *     geracao x (soma dos percentuais das UCs) / 100
 *
 * e a R11 ja garante que a soma dos percentuais nao passa de 100. Logo a soma
 * do faturado nao passa da geracao POR CONSTRUCAO, e nao por vigilancia. Nao e
 * a decisao inteira da RATEIO-USO-01 - o que sobra la e o que fazer quando a
 * geracao nao foi lancada -, mas o overbooking de credito, que era o medo
 * declarado, some com a escolha de 9a.
 *
 * E o caso concreto que a PAUTA levantou fica resolvido por recusa e nao por
 * silencio: a usina 0003 tem 100% alocado e ZERO geracao lancada. Sem linha em
 * usina_geracao nao ha `geracao_kwh_competencia`, a coluna e NOT NULL, e a
 * fatura simplesmente nao nasce. Faturar sobre ela seria emitir receita de
 * energia que ninguem registrou ter sido gerada.
 */
CREATE TABLE fatura (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(id),

  -- O contrato e obrigatorio e nao e conveniencia de join: ele carrega o tier
  -- CONGELADO do originador (R20-b) e o contador de faturas cheias pagas. Sem
  -- ele a comissao da migration 17 nao tem como ser calculada sem reprecificar
  -- o passado, que e exatamente o furo que a R20-b fechou.
  contrato_id            uuid NOT NULL,
  unidade_consumidora_id uuid NOT NULL,
  -- Congelada tambem: a UC pode ser remanejada para outra usina amanha, e a
  -- fatura de julho tem de continuar dizendo de qual usina veio aquele credito
  -- - e dela que sai o repasse ao dono (migration 17).
  usina_id               uuid NOT NULL,

  competencia            date NOT NULL,
  CONSTRAINT fatura_competencia_e_primeiro_dia CHECK (EXTRACT(DAY FROM competencia) = 1),

  -- Os cinco do bloco "9a". Grandeza fisica e proporcao em escala decimal, e
  -- nunca em centavos - regra 1, segundo paragrafo, e SPEC-001 R22.
  geracao_kwh_competencia    numeric(14,4) NOT NULL CHECK (geracao_kwh_competencia >= 0),
  percentual_rateio_aplicado numeric(7,4)  NOT NULL CHECK (percentual_rateio_aplicado > 0 AND percentual_rateio_aplicado <= 100),
  consumo_kwh                numeric(14,4) NOT NULL CHECK (consumo_kwh >= 0),
  tarifa_reais_por_kwh       numeric(12,6) NOT NULL CHECK (tarifa_reais_por_kwh > 0),

  -- Dinheiro: Int em centavos, em toda camada. Regra 1.
  valor_consumo_centavos                 integer NOT NULL CHECK (valor_consumo_centavos >= 0),
  -- Repasse puro a distribuidora (PRD 5.1). Ninguem comissiona nem repassa
  -- sobre isso, e a migration 17 o devolve como item proprio do split.
  -- Na v1 entra por lancamento manual ou planilha: nao ha API da distribuidora.
  valor_tarifas_concessionaria_centavos  integer NOT NULL DEFAULT 0 CHECK (valor_tarifas_concessionaria_centavos >= 0),
  -- Apurado NA LIQUIDACAO e gravado aqui depois (PRD 4.3 lista o campo na
  -- fatura). Zero ate la. Por isso o total e coluna GERADA: ele muda quando o
  -- juro e apurado, e duas formulas do total seriam duas respostas.
  valor_juros_multa_centavos             integer NOT NULL DEFAULT 0 CHECK (valor_juros_multa_centavos >= 0),
  valor_total_centavos integer GENERATED ALWAYS AS (
    valor_consumo_centavos + valor_tarifas_concessionaria_centavos + valor_juros_multa_centavos
  ) STORED,

  status            status_fatura NOT NULL DEFAULT 'rascunho',

  /*
   * PRD 5.4: "fatura nao-cheia nao avanca o contador nem gera comissao". A
   * coluna e NOT NULL e SEM DEFAULT de proposito - quem compoe a fatura tem de
   * dizer, e a regra que hoje decide esta em src/dominio/faturamento.ts, nao
   * aqui. O que e "cheia" nao esta declarado em documento nenhum do projeto:
   * virou Q-FATCHEIA-01.
   */
  flag_fatura_cheia boolean NOT NULL,

  vencimento    date NOT NULL,
  -- Fato gerador da RECEITA (PAUTA 1: competencia). O split nao olha para ele.
  emitida_em    timestamptz,
  cancelada_em  timestamptz,
  motivo_cancelamento text,
  criado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fatura_emissao_coerente CHECK (
    (status = 'rascunho'  AND emitida_em IS NULL) OR
    (status <> 'rascunho' AND (emitida_em IS NOT NULL OR status = 'cancelada'))
  ),
  CONSTRAINT fatura_cancelamento_coerente CHECK (
    (status = 'cancelada') = (cancelada_em IS NOT NULL)
  ),
  CONSTRAINT fatura_vencimento_na_competencia_ou_depois CHECK (vencimento >= competencia),

  /*
   * REGRA 11, e o motivo esta escrito na migration 12 (R14).
   *
   * A regra que o negocio quer e "uma UC nao tem duas faturas da mesma
   * competencia", com a excecao obvia de que uma fatura CANCELADA libera a
   * competencia para reemissao. Isso pede predicado - e indice parcial e o que
   * a regra 11 proibe como caminho de navegacao, porque o `db pull` ignora o
   * predicado e a Q-CLAUDE11-01 mediu que o parcial voltou a ser chave de
   * findUnique com o preview `partialIndexes` ligado.
   *
   * Coluna gerada + unico CHEIO e a forma que sobrevive ao `db pull`. E o
   * conjunto (tenant_id, unidade_consumidora_id, competencia_faturada) tem
   * TRES colunas, entao nao coincide com o conjunto de FK nenhuma - o CAT-1
   * continua verde e a relacao uc->faturas continua 1-N.
   */
  competencia_faturada date GENERATED ALWAYS AS (
    CASE WHEN status <> 'cancelada' THEN competencia END
  ) STORED,

  CONSTRAINT fatura_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT fatura_uc_fk       FOREIGN KEY (tenant_id, unidade_consumidora_id) REFERENCES unidade_consumidora (tenant_id, id),
  CONSTRAINT fatura_contrato_fk FOREIGN KEY (tenant_id, contrato_id)            REFERENCES contrato (tenant_id, id),
  CONSTRAINT fatura_usina_fk    FOREIGN KEY (tenant_id, usina_id)               REFERENCES usina (tenant_id, id)
);

CREATE UNIQUE INDEX fatura_competencia_unica_por_uc
  ON fatura (tenant_id, unidade_consumidora_id, competencia_faturada);

CREATE INDEX fatura_competencia_idx ON fatura (tenant_id, competencia, status);
CREATE INDEX fatura_vencimento_idx  ON fatura (tenant_id, vencimento) WHERE status IN ('emitida','vencida');
CREATE INDEX fatura_contrato_idx    ON fatura (tenant_id, contrato_id);

COMMENT ON COLUMN fatura.competencia_faturada IS
  'Regra 11. Espelha competencia enquanto a fatura vale, NULL quando cancelada. '
  'Coluna GERADA: nunca escrever. Existe para o unico ser CHEIO em vez de parcial.';
COMMENT ON COLUMN fatura.geracao_kwh_competencia IS
  'PAUTA-contador 9a=B. A geracao MEDIDA que originou esta fatura. Sem linha em '
  'usina_geracao a fatura nao nasce - e o que impede faturar a usina 0003.';
COMMENT ON COLUMN fatura.valor_total_centavos IS
  'PRD 5.1. Coluna GERADA: consumo + tarifas da concessionaria + juros/multa. '
  'Duas formulas do total seriam duas respostas.';
COMMENT ON COLUMN fatura.flag_fatura_cheia IS
  'PRD 5.4. Nao-cheia nao avanca o contador do contrato nem gera comissao. Sem '
  'DEFAULT de proposito: o criterio nao esta declarado em documento (Q-FATCHEIA-01).';

-- ============================================================ boleto
/*
 * 1:1 com a fatura (PRD 4.3), e o unico instrumento de cobranca do sistema
 * (PAUTA 5 = A: nao ha nota fiscal a emitir).
 *
 * O UNICO da FK e CHEIO e cobre exatamente (tenant_id, fatura_id), que e o
 * conjunto da FK. Isso e legitimo e a regra 11 nao o proibe: ela proibe o
 * indice PARCIAL que cobre o conjunto da FK, porque ali a cardinalidade
 * inferida MENTE. Aqui ela diz a verdade - e 1:1 mesmo, e o `db pull` tipar
 * como to-one e o resultado correto.
 *
 * REGRA 5, e ela e aplicada pelo BANCO e nao por revisao. Os payloads de ida e
 * volta da Sicoob sao persistidos para auditoria (PRD 6), e o caminho obvio de
 * violacao e alguem gravar o payload inteiro do OAuth junto. O CHECK abaixo
 * recusa a linha. O contraexemplo esta no banco ao lado: a tabela `tenants` do
 * CRM guarda cinco tokens em `text` puro (P8 4).
 */
CREATE TABLE boleto (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  fatura_id uuid NOT NULL,

  -- Hibrido: codigo de barras E QR Pix no mesmo documento (PRD 4.3).
  nosso_numero      text,
  linha_digitavel   text,
  codigo_barras     text,
  pix_copia_e_cola  text,
  pix_txid          text,

  -- O valor REGISTRADO no banco, congelado. A fatura pode ganhar juros depois
  -- (coluna de juros na fatura), e o boleto registrado nao muda por isso: o
  -- juro e calculado pelo banco na liquidacao. Sem esta coluna a conciliacao
  -- compararia o recebido com um total que mudou depois da emissao.
  valor_registrado_centavos integer NOT NULL CHECK (valor_registrado_centavos > 0),
  vencimento date NOT NULL,

  status status_boleto NOT NULL DEFAULT 'pendente',

  sicoob_numero_contrato text,
  sicoob_nosso_numero    text,
  registrado_em          timestamptz,
  baixado_em             timestamptz,

  -- Fila de retentativa do PRD 6: a tentativa que falhou nao perde o boleto.
  tentativas   integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  ultimo_erro  text,

  payload_envio   jsonb,
  payload_retorno jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT boleto_registro_coerente CHECK (
    (status IN ('registrado','liquidado','baixado')) <= (registrado_em IS NOT NULL)
  ),
  /*
   * Regra 5 aplicada pelo banco. `?|` pergunta se QUALQUER uma das chaves
   * existe no nivel raiz do jsonb. Nao pega segredo aninhado tres niveis
   * abaixo, e nao finge pegar: pega o caminho que de fato acontece, que e
   * gravar a resposta do token junto com a do boleto.
   */
  CONSTRAINT boleto_payload_sem_segredo CHECK (
    NOT (coalesce(payload_envio,   '{}'::jsonb) ?| ARRAY['client_id','client_secret','access_token','refresh_token','certificado','private_key','senha'])
    AND
    NOT (coalesce(payload_retorno, '{}'::jsonb) ?| ARRAY['client_id','client_secret','access_token','refresh_token','certificado','private_key','senha'])
  ),

  CONSTRAINT boleto_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT boleto_fatura_unico UNIQUE (tenant_id, fatura_id),
  CONSTRAINT boleto_fatura_fk FOREIGN KEY (tenant_id, fatura_id) REFERENCES fatura (tenant_id, id)
);

CREATE INDEX boleto_pendente_idx ON boleto (tenant_id, status);

COMMENT ON CONSTRAINT boleto_payload_sem_segredo ON boleto IS
  'CLAUDE.md regra 5. Segredo nao mora em coluna. Aplicado pelo banco porque '
  '"violacao disto e falha de revisao" e revisao humana nao roda em toda escrita.';
COMMENT ON COLUMN boleto.valor_registrado_centavos IS
  'O valor que subiu para o banco, congelado. A fatura pode ganhar juros depois; '
  'o boleto registrado nao muda por isso.';

-- ============================================================ liquidacao
/*
 * O EVENTO DE CAIXA. Ele e o gatilho do split (PRD 5.2: "exclusivamente na
 * liquidacao, nunca na emissao"), e a PAUTA 1 manteve isso ao separar os dois
 * eixos - competencia governa a receita, caixa governa a reparticao.
 *
 * DUAS IDEMPOTENCIAS, e elas sao diferentes:
 *
 *   liquidacao_fatura_unica  - uma fatura liquida UMA vez. Vem do PRD 5.2:
 *                              "boleto registrado nao aceita pagamento parcial;
 *                              liquidacao e sempre pelo valor cheio". Sem ela,
 *                              dois webhooks da mesma fatura rodariam o split
 *                              duas vezes e pagariam o dono da usina em dobro.
 *   liquidacao_externa_unica - o MESMO evento externo nao entra duas vezes,
 *                              ainda que por caminhos diferentes. Indice CHEIO
 *                              de tres colunas: `id_externo` nulo nao conflita
 *                              com nulo (NULLS DISTINCT e o default), entao
 *                              baixa manual - que nao tem id externo - nao
 *                              precisa de predicado e a regra 11 nao e tocada.
 */
CREATE TABLE liquidacao (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  fatura_id uuid NOT NULL,

  data_liquidacao          date NOT NULL,
  valor_liquidado_centavos integer NOT NULL CHECK (valor_liquidado_centavos > 0),
  -- Apurados pelo banco, entram na base do repasse proporcionalmente (PRD 5.3)
  -- e NAO entram na base da comissao (PRD 5.4).
  juros_centavos integer NOT NULL DEFAULT 0 CHECK (juros_centavos >= 0),
  multa_centavos integer NOT NULL DEFAULT 0 CHECK (multa_centavos >= 0),

  origem     origem_liquidacao NOT NULL,
  id_externo text,
  observacao text,
  criado_em  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT liquidacao_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT liquidacao_fatura_unica UNIQUE (tenant_id, fatura_id),
  CONSTRAINT liquidacao_externa_unica UNIQUE (tenant_id, origem, id_externo),
  CONSTRAINT liquidacao_fatura_fk FOREIGN KEY (tenant_id, fatura_id) REFERENCES fatura (tenant_id, id)
);

CREATE INDEX liquidacao_data_idx ON liquidacao (tenant_id, data_liquidacao);

COMMENT ON CONSTRAINT liquidacao_fatura_unica ON liquidacao IS
  'PRD 5.2 - sem pagamento parcial. Sem esta constraint, dois webhooks da mesma '
  'fatura rodariam o split duas vezes e pagariam o dono da usina em dobro.';

/*
 * O valor liquidado tem de bater com o total da fatura, ao centavo. Nao e
 * CHECK porque CHECK nao enxerga outra tabela; e constraint trigger IMEDIATA
 * porque o erro tem de sair na linha que o causou - diferente da R11, onde o
 * lote inteiro so fecha no fim e o diferimento e o que faz sentido.
 *
 * O motivo de existir: sem ela, uma baixa manual digitada a menos passaria, o
 * split repartiria o valor digitado, e a invariante do centavo da migration 17
 * fecharia certo sobre um numero errado. Invariante que fecha sobre entrada
 * errada e pior do que invariante nenhuma - ela produz confianca.
 */
CREATE OR REPLACE FUNCTION app.exigir_liquidacao_pelo_total() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_total integer; v_status status_fatura;
BEGIN
  SELECT f.valor_total_centavos, f.status INTO v_total, v_status
  FROM public.fatura f
  WHERE f.tenant_id = NEW.tenant_id AND f.id = NEW.fatura_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'fatura % nao encontrada no tenant corrente', NEW.fatura_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'fatura % esta cancelada e nao pode ser liquidada', NEW.fatura_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.valor_liquidado_centavos <> v_total THEN
    RAISE EXCEPTION
      'PRD 5.2: liquidacao e sempre pelo valor cheio. Fatura % vale % centavos e a baixa trouxe %',
      NEW.fatura_id, v_total, NEW.valor_liquidado_centavos
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER liquidacao_pelo_total
  AFTER INSERT OR UPDATE ON liquidacao
  FOR EACH ROW EXECUTE FUNCTION app.exigir_liquidacao_pelo_total();

-- ============================================================ isolamento
/*
 * Regra 2 e regra 3. As tres tabelas tem tenant_id, entao as tres levam
 * ENABLE + FORCE + policy. A policy e a mesma das demais desde a migration 6:
 * pertencer ao tenant NAO basta, e preciso haver vinculo ativo do usuario.
 */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fatura','boleto','liquidacao'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
        WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
    $f$, t);
    -- Regra 9: escrita de dado de negocio grava auditoria, antes e depois.
    -- Dinheiro faturado e baixa de titulo sao o caso central da regra, nao a
    -- borda dela.
    EXECUTE format($f$
      CREATE TRIGGER auditar_%s
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION app.auditar()
    $f$, t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON fatura, boleto, liquidacao TO app_financeiro;
GRANT EXECUTE ON FUNCTION app.exigir_liquidacao_pelo_total() TO app_financeiro;

-- ============================================================ visao da carteira
/*
 * `security_invoker = true` NAO e opcional e nao e estilo: sem ele a RLS das
 * tabelas base e avaliada contra o DONO da view, e uma view sem a opcao anula
 * o FORCE e as policies de uma vez. Medido no proprio schema do financeiro em
 * 26/07: 2 linhas de todos os tenants sem a opcao, 0 com ela. Regra 3, tabela
 * de medicao, e SPEC-001 invariante 13, conferida por catalogo no CI.
 */
CREATE VIEW posicao_da_carteira WITH (security_invoker = true) AS
SELECT f.tenant_id,
       f.competencia,
       count(*)                                                            AS faturas,
       count(*) FILTER (WHERE f.status = 'emitida')                        AS emitidas,
       count(*) FILTER (WHERE l.id IS NOT NULL)                            AS liquidadas,
       count(*) FILTER (WHERE f.status IN ('emitida','vencida')
                          AND l.id IS NULL
                          AND f.vencimento < current_date)                 AS vencidas_em_aberto,
       coalesce(sum(f.valor_total_centavos), 0)                            AS faturado_centavos,
       coalesce(sum(l.valor_liquidado_centavos), 0)                        AS recebido_centavos,
       coalesce(sum(f.valor_total_centavos) FILTER (WHERE l.id IS NULL), 0) AS a_receber_centavos
FROM public.fatura f
LEFT JOIN public.liquidacao l ON l.tenant_id = f.tenant_id AND l.fatura_id = f.id
WHERE f.status <> 'cancelada'
GROUP BY f.tenant_id, f.competencia;

COMMENT ON VIEW posicao_da_carteira IS
  'Dashboard da carteira por competencia (PRD 9). Cancelada fica fora: ela nao e '
  'a receber nem recebido, e conta-la em qualquer das duas mentiria nas duas.';

GRANT SELECT ON posicao_da_carteira TO app_financeiro;

/*
 * O outro lado da RATEIO-USO-01: quanto da geracao de cada usina JA FOI
 * consumido por faturamento numa competencia. Com a base sendo a geracao
 * medida (9a), este numero nao pode ultrapassar a geracao - e a view existe
 * para que isso seja OLHAVEL, nao so verdadeiro. Se um dia ela mostrar
 * consumido > gerado, a regra de composicao foi contornada por outro caminho.
 */
CREATE VIEW uso_da_usina_por_competencia WITH (security_invoker = true) AS
SELECT g.tenant_id,
       g.usina_id,
       u.codigo_geradora,
       g.competencia,
       g.geracao_kwh,
       coalesce(sum(f.consumo_kwh), 0)                 AS consumo_faturado_kwh,
       g.geracao_kwh - coalesce(sum(f.consumo_kwh), 0) AS saldo_kwh
FROM public.usina_geracao g
JOIN public.usina u ON u.tenant_id = g.tenant_id AND u.id = g.usina_id
LEFT JOIN public.fatura f
       ON f.tenant_id = g.tenant_id AND f.usina_id = g.usina_id
      AND f.competencia = g.competencia AND f.status <> 'cancelada'
GROUP BY g.tenant_id, g.usina_id, u.codigo_geradora, g.competencia, g.geracao_kwh;

COMMENT ON VIEW uso_da_usina_por_competencia IS
  'RATEIO-USO-01, o lado "quanto JA FOI usada". Com a base de faturamento sendo a '
  'geracao medida (PAUTA 9a), saldo_kwh nao pode ser negativo por construcao.';

GRANT SELECT ON uso_da_usina_por_competencia TO app_financeiro;

-- ============================================================ conferencia
/*
 * A propria migration confere o que afirmou. O mesmo padrao da migration 2: o
 * teste de catalogo continua sendo o mecanismo, mas uma migration que mente
 * sobre o que fez e pior do que uma que falha.
 */
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0
  WHERE c.relkind = 'r'
    AND c.relname IN ('fatura','boleto','liquidacao')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'RLS incompleta em: %', faltando;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'v' AND c.relname IN ('posicao_da_carteira','uso_da_usina_por_competencia')
    AND NOT coalesce((SELECT option_value::boolean FROM pg_options_to_table(c.reloptions)
                      WHERE option_name = 'security_invoker'), false);
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'view sem security_invoker: %', faltando;
  END IF;
END $$;
