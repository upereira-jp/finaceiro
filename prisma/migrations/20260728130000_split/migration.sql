-- MIGRATION 17 - SPLIT: a reparticao do dinheiro liquidado. A F3 comeca aqui.
--
-- ORIGEM DAS DECISOES, e de novo nenhuma e escolha de quem escreveu o SQL:
--
--   PAUTA-contador 2 = A   -> comissao a PF nao tem retencao.
--   PAUTA-contador 3a = Nao-> comissao a PJ nao tem retencao.
--   PAUTA-contador 3b      -> paga-se direto; a nota do parceiro vem depois. NAO
--                             existe estado "bloqueado aguardando nota", e por
--                             isso split_item nao tem maquina de estados.
--   PAUTA-contador 4b      -> repasse ao dono da usina tambem nao tem retencao.
--
--   CONSEQUENCIA DAS TRES JUNTAS, e ela e estrutural: split_item guarda UM
--   valor por item. Nao ha valor_bruto, retencao e valor_liquido, nao ha quebra
--   por tributo, e a invariante do centavo do PRD 5.5 sobrevive intacta - "a
--   soma dos itens e igual ao valor liquidado" continua verdadeira porque nada
--   sai pelo caminho do fisco no meio. Se qualquer uma das tres virar "incide",
--   esta tabela ganha tres colunas e a invariante vira "bruto = liquidado" e
--   "liquido + retencoes = bruto". Era a pergunta mais estrutural da PAUTA, e e
--   por isso que ela foi feita antes desta migration existir.
--
--   PAUTA-contador 8a = A  -> arredonda-se NO TOTAL, distribuindo o residuo. O
--                             PRD 5.5 ja dizia para onde: "diferencas de
--                             arredondamento vao sempre para o liquido G3". As
--                             duas coisas sao a mesma quando o liquido G3 e o
--                             item RESIDUAL - ver o bloco "8a" abaixo.
--   PAUTA-contador 1       -> caixa governa o split. Por isso a ancora e
--                             `liquidacao_id` e nao `fatura_id`.
--   PRD 5.3, 5.4, 5.5      -> as tres formulas.
--   SPEC-001 R20-b e R25   -> tier congelado no contrato; repasse pela
--                             competencia. Duas contrapartes, duas datas.

-- ============================================================ 1. a parcela da comissao
/*
 * O PRD 5.4 tem QUATRO tipos e ESCALONAMENTO por fatura cheia paga:
 *
 *   tipo                      total   1a cheia   2a cheia
 *   vendedor_g3                50%      25%        25%
 *   parceiro_indicador         25%      25%         -
 *   parceiro_captador          50%      30%        20%
 *   parceiro_captador_senior   60%      30%        30%
 *
 * `regra_comissao` guardava so o TOTAL. Aplicar o total em toda fatura pagaria
 * a comissao inteira todo mes, para sempre - nao e um erro de arredondamento, e
 * pagar varias vezes o que se deve uma vez. O escalonamento nao cabia na tabela
 * porque faltava a dimensao, e a dimensao e a PARCELA.
 *
 * NAO virou tabela nova e nao virou logica em codigo. Em tabela nova, dois
 * lugares diriam quanto se paga; em codigo, a taxa deixaria de ser versionada
 * por vigencia - e a R21 existe justamente porque aliquota que depende de qual
 * linha o planejador devolveu primeiro ja deu problema no CRM ao lado.
 */
ALTER TABLE regra_comissao ADD COLUMN parcela smallint;

/*
 * BACKFILL COM ASSERT, e o assert e o ponto.
 *
 * As linhas existentes carregam o total. A quebra abaixo e a do PRD 5.4, em
 * numeros absolutos, e ela SOMA exatamente o total seedado em cada tipo. Se
 * algum tenant tiver renegociado o total, a soma nao bate e a migration RECUSA
 * em vez de reprecificar o contrato daquele parceiro em silencio.
 *
 * `terceirizado` NAO esta no PRD 5.4. O seed o pos em 50%, o mesmo do
 * vendedor_g3, e a quebra abaixo espelha o vendedor_g3 pelo mesmo motivo: o
 * TOTAL e fato registrado, a REPARTICAO entre a 1a e a 2a nao. Fica como
 * Q-COMIS-TERC-01. A alternativa - deixar o tipo sem regra e fazer o split
 * levantar - foi descartada porque introduziria uma quebra onde hoje ha
 * comportamento funcionando, e a duvida e sobre o ritmo do pagamento, nao sobre
 * o valor devido.
 */
DO $$
DECLARE r record; v_1 numeric; v_2 numeric;
BEGIN
  FOR r IN SELECT * FROM regra_comissao WHERE parcela IS NULL LOOP
    SELECT q.p1, q.p2 INTO v_1, v_2 FROM (VALUES
      ('vendedor_g3',              25.00, 25.00),
      ('terceirizado',             25.00, 25.00),   -- Q-COMIS-TERC-01
      ('parceiro_indicador',       25.00,  0.00),   -- o "-" do PRD e ZERO DECLARADO,
      ('parceiro_captador',        30.00, 20.00),   -- nao ausencia de regra: R26
      ('parceiro_captador_senior', 30.00, 30.00)
    ) AS q(tipo, p1, p2) WHERE q.tipo = r.originador_tipo::text;

    IF v_1 IS NULL THEN
      RAISE EXCEPTION 'sem quebra por parcela declarada para o tier %', r.originador_tipo;
    END IF;
    IF v_1 + v_2 <> r.percentual THEN
      RAISE EXCEPTION
        'o total de % e %%%, e a quebra do PRD 5.4 soma %%%. Alguem renegociou o total: '
        'declare a quebra desta vigencia antes de aplicar esta migration',
        r.originador_tipo, r.percentual, v_1 + v_2;
    END IF;

    UPDATE regra_comissao SET percentual = v_1, parcela = 1 WHERE id = r.id;
    INSERT INTO regra_comissao (tenant_id, originador_tipo, percentual, parcela, vigencia_inicio, vigencia_fim)
    VALUES (r.tenant_id, r.originador_tipo, v_2, 2, r.vigencia_inicio, r.vigencia_fim);
  END LOOP;
END $$;

ALTER TABLE regra_comissao ALTER COLUMN parcela SET NOT NULL;
ALTER TABLE regra_comissao ADD CONSTRAINT regra_comissao_parcela_valida CHECK (parcela IN (1, 2));

-- O EXCLUDE ganha a parcela. Sem isto, a 1a e a 2a do mesmo tier na mesma
-- vigencia se recusariam entre si - a regra nova quebraria o proprio backfill.
ALTER TABLE regra_comissao DROP CONSTRAINT regra_comissao_sem_sobreposicao;
ALTER TABLE regra_comissao ADD CONSTRAINT regra_comissao_sem_sobreposicao EXCLUDE USING gist (
  tenant_id       WITH =,
  originador_tipo WITH =,
  parcela         WITH =,
  daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
);

COMMENT ON COLUMN regra_comissao.parcela IS
  'PRD 5.4. 1 = primeira fatura cheia paga do contrato, 2 = segunda. Da terceira '
  'em diante nao ha regra e nao ha comissao - e ausencia por desenho, conferida '
  'em app.percentual_comissao, nao no_data_found.';

/*
 * A funcao ganha a parcela e a ANTIGA E DERRUBADA. Manter as duas seria manter
 * duas respostas para "quanto se paga" - o mesmo motivo pelo qual
 * app.consumo_centavos existe em vez de cada chamador escrever a formula.
 *
 * Da 3a cheia em diante devolve ZERO em vez de levantar, e a diferenca para a
 * R26 e real: ali a ausencia de PRECO e erro - alguem esqueceu de cadastrar.
 * Aqui a ausencia e a REGRA - o PRD 5.4 diz "da 3a cheia em diante, comissao
 * zero". Levantar transformaria a regra de negocio em incidente operacional
 * todo mes, a partir do terceiro mes de todo contrato.
 */
DROP FUNCTION IF EXISTS app.percentual_comissao(originador_tipo, date);

CREATE OR REPLACE FUNCTION app.percentual_comissao(
  p_tier originador_tipo, p_parcela smallint, p_data_fechamento date
) RETURNS numeric LANGUAGE plpgsql STABLE AS
$$
DECLARE v numeric;
BEGIN
  IF p_parcela IS NULL OR p_parcela > 2 THEN
    RETURN 0;   -- PRD 5.4: da 3a cheia em diante, comissao zero. Nao e erro.
  END IF;

  SELECT r.percentual INTO v
  FROM public.regra_comissao r
  WHERE r.tenant_id = app.current_tenant_id()
    AND r.originador_tipo = p_tier
    AND r.parcela = p_parcela
    AND daterange(r.vigencia_inicio, r.vigencia_fim, '[)') @> p_data_fechamento;

  IF v IS NULL THEN
    RAISE EXCEPTION 'sem regra_comissao vigente para tier %, parcela %, em %',
      p_tier, p_parcela, p_data_fechamento USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END $$;

COMMENT ON FUNCTION app.percentual_comissao(originador_tipo, smallint, date) IS
  'R20-b + PRD 5.4. Tier CONGELADO no contrato e PARCELA (1a ou 2a fatura cheia '
  'paga). Parcela acima de 2 devolve zero por regra; tier sem regra vigente '
  'levanta, porque ai e cadastro faltando.';

GRANT EXECUTE ON FUNCTION app.percentual_comissao(originador_tipo, smallint, date) TO app_financeiro;

-- ============================================================ 2. os quatro tipos de item
/*
 * O QUARTO TIPO, `repasse_concessionaria`, NAO estava na lista do PRD 4.3 - que
 * nomeia tres - e ele e o que faz a invariante do centavo FECHAR. A conta:
 *
 *   liquidado = consumo + tarifas_da_concessionaria + juros + multa
 *   itens     = repasse_usina + comissao + liquido_g3
 *   liquido_g3 = liquidado - repasse - comissoes - tarifas   (PRD 5.5)
 *   => soma dos itens = liquidado - tarifas   <>  liquidado
 *
 * Falta exatamente a parcela da distribuidora. O PRD ja a trata como saida no
 * 5.5 passo 3 - "conta_pagar do repasse a Equatorial, agrupavel por
 * competencia" -, so nao a listou entre os tipos de item. Com ela na lista a
 * soma fecha e a invariante inegociavel do PRD 5.5 passa a ser verificavel; sem
 * ela, a invariante e falsa toda vez que houver tarifa de concessionaria na
 * fatura, que e sempre.
 */
CREATE TYPE tipo_split_item AS ENUM
  ('repasse_usina','comissao','repasse_concessionaria','liquido_g3');

-- ============================================================ 3. split_execucao
/*
 * Uma execucao por LIQUIDACAO, e a ancora e o evento de caixa (PRD 5.2, e a
 * PAUTA 1 confirmou o eixo). O unico e CHEIO e cobre o conjunto da FK, o que
 * faz o Prisma tipar 1:1 - e aqui isso e a verdade, nao o furo da regra 11:
 * uma liquidacao reparte-se uma vez.
 *
 * O QUE ESTE UNICO IMPEDE, concretamente: webhook duplicado da Sicoob. O PRD 6
 * pede "webhook idempotente - liquidacao duplicada nao roda split duas vezes".
 * Sao duas travas em serie: a liquidacao ja e unica por fatura (migration 16) e
 * a execucao e unica por liquidacao. Falhar as duas exige recriar a fatura.
 */
CREATE TABLE split_execucao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  liquidacao_id uuid NOT NULL,
  fatura_id     uuid NOT NULL,
  contrato_id   uuid NOT NULL,
  competencia   date NOT NULL,

  valor_liquidado_centavos integer NOT NULL CHECK (valor_liquidado_centavos > 0),
  -- Base da COMISSAO: somente o consumo. Sem juros, sem multa, sem tarifa da
  -- concessionaria (PRD 5.4, primeira linha).
  base_consumo_centavos    integer NOT NULL CHECK (base_consumo_centavos >= 0),
  -- Base do REPASSE: consumo + juros e multa, proporcionais (PRD 5.3). As
  -- tarifas da concessionaria ficam fora das duas bases.
  base_repasse_centavos    integer NOT NULL CHECK (base_repasse_centavos >= 0),

  /*
   * Qual parcela do escalonamento incidiu. NULL quando nao ha comissao a pagar
   * - contrato sem originador, fatura nao-cheia, ou da 3a cheia em diante. O
   * valor e o contador do contrato ANTES desta liquidacao, mais um.
   */
  parcela_comissao smallint CHECK (parcela_comissao IS NULL OR parcela_comissao >= 1),

  executado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT split_execucao_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT split_execucao_por_liquidacao_unica UNIQUE (tenant_id, liquidacao_id),
  CONSTRAINT split_execucao_liquidacao_fk FOREIGN KEY (tenant_id, liquidacao_id) REFERENCES liquidacao (tenant_id, id),
  CONSTRAINT split_execucao_fatura_fk     FOREIGN KEY (tenant_id, fatura_id)     REFERENCES fatura (tenant_id, id),
  CONSTRAINT split_execucao_contrato_fk   FOREIGN KEY (tenant_id, contrato_id)   REFERENCES contrato (tenant_id, id)
);

CREATE INDEX split_execucao_competencia_idx ON split_execucao (tenant_id, competencia);

-- ============================================================ 4. split_item
/*
 * BLOCO "8a" - ONDE SE ARREDONDA, E POR QUE AS DUAS RESPOSTAS SAO A MESMA.
 *
 * A PAUTA 8a escolheu "no total, distribuindo o residuo entre as parcelas". O
 * PRD 5.5 diz "diferencas de arredondamento vao sempre para o liquido G3". As
 * duas coincidem quando o liquido G3 e o item RESIDUAL e nao um item calculado:
 *
 *   repasse_usina          = round(percentual x base_repasse)      <- arredonda
 *   comissao               = round(percentual x base_consumo)      <- arredonda
 *   repasse_concessionaria = valor_tarifas da fatura               <- exato
 *   liquido_g3             = liquidado - os tres acima             <- SUBTRACAO
 *
 * O ultimo nao arredonda: ele e a diferenca. Entao a soma dos quatro e o
 * liquidado ao centavo por CONSTRUCAO aritmetica, e o residuo dos dois
 * arredondamentos acima esta dentro dele. Nao ha um quinto lugar onde o centavo
 * possa se perder, e nao ha caso em que a invariante dependa da ordem de
 * calculo.
 *
 * O liquido G3 PODE SER NEGATIVO, e isso e desenho e nao defeito: com captador
 * senior a 30% e repasse a 70%, o PRD 5.6 preve liquido zero nas duas primeiras
 * faturas de cada contrato. Um centavo de residuo para baixo torna o numero
 * negativo, e recusar por CHECK esconderia o CAC concentrado que o PRD manda
 * mostrar "sem suavizacao". Os outros tres tipos sao nao-negativos e o CHECK
 * abaixo separa os casos.
 */
CREATE TABLE split_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  split_execucao_id uuid NOT NULL,

  tipo tipo_split_item NOT NULL,

  -- Beneficiario. Um por tipo, nunca os dois, e a FK e COMPOSTA - e ela, e nao
  -- a frase, que impede o split de pagar beneficiario de outro tenant. E a
  -- "segunda invariante, de igual peso" do PRD 5.5.
  dono_usina_id  uuid,
  originador_id  uuid,

  base_calculo_centavos integer NOT NULL CHECK (base_calculo_centavos >= 0),
  -- Guardado por extenso e nao so referenciado: a regra pode ser fechada e
  -- reaberta com outro valor, e o extrato de um split de julho tem de continuar
  -- dizendo o que foi aplicado em julho. E o mesmo motivo dos cinco numeros da
  -- fatura, na outra ponta.
  percentual_aplicado numeric(5,2) CHECK (percentual_aplicado IS NULL OR (percentual_aplicado >= 0 AND percentual_aplicado <= 100)),
  valor_centavos integer NOT NULL,

  -- QUAL versao da regra produziu o numero (PRD 4.3, "versao da regra usada").
  regra_repasse_id  uuid,
  regra_comissao_id uuid,

  CONSTRAINT split_item_beneficiario_coerente CHECK (
    CASE tipo
      WHEN 'repasse_usina'          THEN dono_usina_id IS NOT NULL AND originador_id IS NULL     AND regra_repasse_id IS NOT NULL  AND regra_comissao_id IS NULL
      WHEN 'comissao'               THEN originador_id IS NOT NULL AND dono_usina_id IS NULL     AND regra_comissao_id IS NOT NULL AND regra_repasse_id IS NULL
      WHEN 'repasse_concessionaria' THEN dono_usina_id IS NULL     AND originador_id IS NULL     AND regra_repasse_id IS NULL      AND regra_comissao_id IS NULL
      WHEN 'liquido_g3'             THEN dono_usina_id IS NULL     AND originador_id IS NULL     AND regra_repasse_id IS NULL      AND regra_comissao_id IS NULL
    END
  ),
  -- Ver o bloco "8a": so o residual pode ser negativo.
  CONSTRAINT split_item_valor_coerente CHECK (
    tipo = 'liquido_g3' OR valor_centavos >= 0
  ),

  CONSTRAINT split_item_id_tenant UNIQUE (tenant_id, id),
  -- Um item por tipo em cada execucao. O contrato tem no maximo um originador e
  -- a UC uma usina, entao dois itens do mesmo tipo seria dupla contagem - e
  -- dupla contagem que a invariante do centavo NAO pegaria, porque ela olha a
  -- soma e a soma continuaria fechando com um liquido G3 menor.
  CONSTRAINT split_item_um_por_tipo UNIQUE (tenant_id, split_execucao_id, tipo),

  CONSTRAINT split_item_execucao_fk   FOREIGN KEY (tenant_id, split_execucao_id) REFERENCES split_execucao (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT split_item_dono_fk       FOREIGN KEY (tenant_id, dono_usina_id)     REFERENCES dono_usina (tenant_id, id),
  CONSTRAINT split_item_originador_fk FOREIGN KEY (tenant_id, originador_id)     REFERENCES originador (tenant_id, id),
  CONSTRAINT split_item_regra_repasse_fk  FOREIGN KEY (tenant_id, regra_repasse_id)  REFERENCES regra_repasse (tenant_id, id),
  CONSTRAINT split_item_regra_comissao_fk FOREIGN KEY (tenant_id, regra_comissao_id) REFERENCES regra_comissao (tenant_id, id)
);

CREATE INDEX split_item_execucao_idx    ON split_item (tenant_id, split_execucao_id);
CREATE INDEX split_item_beneficiario_idx ON split_item (tenant_id, tipo, dono_usina_id, originador_id);

-- ============================================================ 5. a invariante do centavo
/*
 * "Soma dos split_item = valor liquidado, ao centavo." O PRD 5.5 a chama de
 * INEGOCIAVEL, e a regra 8 deste projeto diz que invariante sem teste e
 * comentario. Aqui ela nao e nem teste: e constraint, e o teste prova que a
 * constraint morde.
 *
 * DEFERRABLE INITIALLY DEFERRED pelo mesmo motivo da R11: os itens entram um a
 * um e a soma so faz sentido no fim. Conferir por linha rejeitaria o primeiro
 * item de um split que fecha certo.
 *
 * E a consequencia ja registrada na R11 vale igual aqui, e por isso esta
 * escrita de novo: deferido protege NO COMMIT. Quem inserir os itens e ler a
 * propria soma antes de commitar VE o estado invalido, e a transacao aborta
 * depois, longe da linha. O motor em src/dominio/split.ts fecha a conta ANTES
 * de escrever, o que faz o abort ser impossivel no caminho normal - e a
 * constraint continua sendo o mecanismo para quem escrever por outro caminho.
 */
CREATE OR REPLACE FUNCTION app.exigir_centavo_fechado() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_exec uuid; v_tenant uuid; v_soma bigint; v_liquidado integer;
BEGIN
  v_exec   := coalesce(NEW.split_execucao_id, OLD.split_execucao_id);
  v_tenant := coalesce(NEW.tenant_id, OLD.tenant_id);

  SELECT e.valor_liquidado_centavos INTO v_liquidado
  FROM public.split_execucao e
  WHERE e.tenant_id = v_tenant AND e.id = v_exec;

  -- Execucao apagada em cascata: nao ha o que fechar.
  IF v_liquidado IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(sum(i.valor_centavos), 0) INTO v_soma
  FROM public.split_item i
  WHERE i.tenant_id = v_tenant AND i.split_execucao_id = v_exec;

  IF v_soma <> v_liquidado THEN
    RAISE EXCEPTION
      'PRD 5.5: a soma dos itens do split % e % centavos e o valor liquidado e %. '
      'Diferenca de % centavo(s). O residuo de arredondamento pertence ao liquido G3.',
      v_exec, v_soma, v_liquidado, v_soma - v_liquidado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER split_fecha_ao_centavo
  AFTER INSERT OR UPDATE OR DELETE ON split_item
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_centavo_fechado();

/*
 * A outra metade: uma execucao SEM item nenhum tambem violaria a invariante -
 * soma zero contra liquidado positivo - e o gatilho acima nunca dispararia,
 * porque ele e por linha de split_item e nao ha linha. Constraint trigger na
 * propria execucao fecha esse caminho.
 */
CREATE OR REPLACE FUNCTION app.exigir_split_com_itens() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_soma bigint;
BEGIN
  SELECT coalesce(sum(i.valor_centavos), 0) INTO v_soma
  FROM public.split_item i
  WHERE i.tenant_id = NEW.tenant_id AND i.split_execucao_id = NEW.id;

  IF v_soma <> NEW.valor_liquidado_centavos THEN
    RAISE EXCEPTION
      'PRD 5.5: split % fechou com % centavos em itens contra % liquidados',
      NEW.id, v_soma, NEW.valor_liquidado_centavos
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER split_execucao_fecha_ao_centavo
  AFTER INSERT OR UPDATE ON split_execucao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_split_com_itens();

-- ============================================================ 6. o contador do contrato
/*
 * PRD 5.4: "o contador vive no contrato" e "fatura nao-cheia nao avanca o
 * contador". Quem avanca e o BANCO, na execucao do split, e nao a aplicacao.
 *
 * O motivo e o modo de falha: se o incremento morasse no repositorio, um
 * caminho de baixa que esquecesse a linha faria o contrato pagar a 1a parcela
 * de comissao para sempre - todo mes, sem erro, sem log. E o mesmo padrao de
 * "silencio que so aparece no relatorio" que a regra 3 persegue nas policies,
 * com dinheiro saindo em vez de linha faltando.
 *
 * ORDEM IMPORTA E ESTA ESCRITA: o motor le o contador ANTES de inserir a
 * execucao, para saber qual parcela incide; o gatilho avanca DEPOIS. Ler depois
 * de inserir pularia a primeira parcela.
 */
CREATE OR REPLACE FUNCTION app.avancar_faturas_cheias() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_cheia boolean;
BEGIN
  SELECT f.flag_fatura_cheia INTO v_cheia
  FROM public.fatura f
  WHERE f.tenant_id = NEW.tenant_id AND f.id = NEW.fatura_id;

  IF coalesce(v_cheia, false) THEN
    UPDATE public.contrato
       SET faturas_cheias_pagas = faturas_cheias_pagas + 1
     WHERE tenant_id = NEW.tenant_id AND id = NEW.contrato_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER avancar_contador_de_faturas_cheias
  AFTER INSERT ON split_execucao
  FOR EACH ROW EXECUTE FUNCTION app.avancar_faturas_cheias();

COMMENT ON FUNCTION app.avancar_faturas_cheias() IS
  'PRD 5.4. O contador do contrato avanca no BANCO, na execucao do split, e so '
  'em fatura cheia. No repositorio, um caminho de baixa esquecido pagaria a 1a '
  'parcela de comissao para sempre.';

-- ============================================================ 7. isolamento
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['split_execucao','split_item'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
        WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
    $f$, t);
    EXECUTE format($f$
      CREATE TRIGGER auditar_%s
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION app.auditar()
    $f$, t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON split_execucao, split_item TO app_financeiro;
GRANT EXECUTE ON FUNCTION app.exigir_centavo_fechado(), app.exigir_split_com_itens(),
                          app.avancar_faturas_cheias() TO app_financeiro;

-- ============================================================ 8. os dois extratos
/*
 * PRD 9: "extrato de splits com drill-down (fatura -> liquidacao -> itens) ·
 * repasses por dono de usina · comissoes por originador". As duas views abaixo
 * sao o agregado por beneficiario; o drill-down sai por consulta direta.
 *
 * `security_invoker = true` nas duas - invariante 13. Uma view sem a opcao
 * anula o FORCE e as policies de uma vez, e estas duas devolvem PAGAMENTO A
 * FAZER: sem a opcao, um tenant leria a lista de pagamentos de outro.
 */
CREATE VIEW repasse_por_dono_usina WITH (security_invoker = true) AS
SELECT i.tenant_id,
       i.dono_usina_id,
       d.nome AS dono,
       e.competencia,
       count(*)                     AS itens,
       sum(i.valor_centavos)        AS valor_centavos
FROM public.split_item i
JOIN public.split_execucao e ON e.tenant_id = i.tenant_id AND e.id = i.split_execucao_id
JOIN public.dono_usina d     ON d.tenant_id = i.tenant_id AND d.id = i.dono_usina_id
WHERE i.tipo = 'repasse_usina'
GROUP BY i.tenant_id, i.dono_usina_id, d.nome, e.competencia;

CREATE VIEW comissao_por_originador WITH (security_invoker = true) AS
SELECT i.tenant_id,
       i.originador_id,
       o.nome AS originador,
       e.competencia,
       e.parcela_comissao,
       count(*)                     AS itens,
       sum(i.valor_centavos)        AS valor_centavos
FROM public.split_item i
JOIN public.split_execucao e ON e.tenant_id = i.tenant_id AND e.id = i.split_execucao_id
JOIN public.originador o     ON o.tenant_id = i.tenant_id AND o.id = i.originador_id
WHERE i.tipo = 'comissao'
GROUP BY i.tenant_id, i.originador_id, o.nome, e.competencia, e.parcela_comissao;

GRANT SELECT ON repasse_por_dono_usina, comissao_por_originador TO app_financeiro;

-- ============================================================ 9. conferencia
DO $$
DECLARE faltando text; n int;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n2 ON n2.oid = c.relnamespace AND n2.nspname = 'public'
  WHERE c.relkind = 'r' AND c.relname IN ('split_execucao','split_item')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;

  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n2 ON n2.oid = c.relnamespace AND n2.nspname = 'public'
  WHERE c.relkind = 'v' AND c.relname IN ('repasse_por_dono_usina','comissao_por_originador')
    AND NOT coalesce((SELECT option_value::boolean FROM pg_options_to_table(c.reloptions)
                      WHERE option_name = 'security_invoker'), false);
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'view sem security_invoker: %', faltando; END IF;

  -- Cada tier tem de ter as duas parcelas depois do backfill, ou o motor
  -- levanta no primeiro split de um contrato daquele tipo.
  SELECT count(*) INTO n
  FROM (SELECT tenant_id, originador_tipo, vigencia_inicio FROM regra_comissao
        GROUP BY 1,2,3 HAVING count(*) <> 2) x;
  IF n > 0 THEN
    RAISE EXCEPTION '% vigencia(s) de regra_comissao sem as duas parcelas', n;
  END IF;
END $$;
