-- Migration 42 — a planilha da empresa vira dado.
--
-- DE ONDE ISTO VEM: em 02/10/2026 o dono subiu `G3Solar_Financeiro.xlsx`, a
-- planilha com que a G3 controla hoje as contas a pagar da EMPRESA (nao do
-- rateio), e mandou que o processo passe a funcionar dentro do sistema. O plano
-- esta em `PLANO-planilha-empresa-2026-10-02.md`; as decisoes, no QUESTOES §2.w.
--
-- O QUE NAO MUDA, e e o que torna esta migration pequena: todo lancamento da
-- planilha continua sendo uma `conta_pagar` manual, e toda baixa continua sendo
-- um `pagamento`. O gatilho que deriva status e valor pago, o CHECK contra pagar
-- a mais e a imutabilidade do que nasce do split ficam exatamente como estao.
--
-- NADA E SEMEADO (Q-CONTAPAGAR-01 c): o plano de contas e as origens entram pela
-- tela, com um clique que oferece os itens da planilha.

-- ------------------------------------------------------------ as formas novas
--
-- A planilha tem «Cartao de Credito» e «Debito Automatico», que o enum de 03/08
-- nao tinha. ADD VALUE roda dentro de transacao desde o PostgreSQL 12; o valor
-- novo so nao pode ser USADO na mesma transacao, e nada abaixo o usa.
ALTER TYPE forma_de_pagamento ADD VALUE IF NOT EXISTS 'cartao_credito';
ALTER TYPE forma_de_pagamento ADD VALUE IF NOT EXISTS 'debito_automatico';

-- «Tipo de despesa» da planilha. Fica no titulo, e nao na categoria, porque e
-- assim que a planilha o trata: o mesmo plano de contas tem conta fixa e variavel.
CREATE TYPE natureza_despesa AS ENUM ('fixa','variavel');

-- A recorrencia e enum, e nao cadastro: a projecao depende do SIGNIFICADO de
-- cada valor (o intervalo em meses), e um item renomeado na tela mudaria a conta.
CREATE TYPE recorrencia_despesa AS ENUM ('avulsa','mensal','trimestral','semestral','anual','parcelada');

CREATE TYPE tipo_origem_pagamento AS ENUM ('conta_bancaria','socio','outra');

-- ------------------------------------------------------------ plano de contas
--
-- A planilha tem uma ordem que significa alguma coisa (Administrativas primeiro,
-- Outras por ultimo) e o Painel lista nessa ordem. Por nome ela se perderia.
ALTER TABLE categoria ADD COLUMN ordem smallint NOT NULL DEFAULT 0;

-- ------------------------------------------------------------ de onde sai o dinheiro
--
-- «CONTA BANCARIA / ORIGEM» da planilha: a Conta PJ e os adiantamentos de socio
-- (o socio paga do bolso e a empresa fica devendo a ele). E o embriao da
-- `conta_bancaria` da onda 1 do plano de 22/09 — saldo inicial e conciliacao
-- entram quando o Caixa entrar, como colunas desta mesma tabela.
CREATE TABLE origem_pagamento (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome      text NOT NULL,
  tipo      tipo_origem_pagamento NOT NULL DEFAULT 'conta_bancaria',
  ativo     boolean NOT NULL DEFAULT true,
  ordem     smallint NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT origem_pagamento_nome_nao_vazio CHECK (length(btrim(nome)) > 0),
  CONSTRAINT origem_pagamento_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

CREATE UNIQUE INDEX origem_pagamento_id_tenant  ON origem_pagamento (tenant_id, id);
CREATE UNIQUE INDEX origem_pagamento_nome_unico ON origem_pagamento (tenant_id, nome);

COMMENT ON TABLE origem_pagamento IS
  'De onde sai o dinheiro de uma conta a pagar: conta bancaria, adiantamento de socio ou outra. '
  'Desativar, nunca apagar - ha conta e pagamento apontando para ela.';

-- ------------------------------------------------------------ o titulo
ALTER TABLE conta_pagar
  ADD COLUMN natureza            natureza_despesa,
  ADD COLUMN recorrencia         recorrencia_despesa,
  ADD COLUMN recorrente_ate      date,
  ADD COLUMN serie_id            uuid,
  ADD COLUMN parcela_numero      smallint,
  ADD COLUMN parcela_total       smallint,
  ADD COLUMN forma_prevista      forma_de_pagamento,
  ADD COLUMN origem_pagamento_id uuid,
  ADD COLUMN numero_documento    text,
  ADD COLUMN comprovante_url     text,
  ADD COLUMN observacao          text,
  ADD CONSTRAINT conta_pagar_origem_pagamento_fk
    FOREIGN KEY (tenant_id, origem_pagamento_id) REFERENCES origem_pagamento (tenant_id, id),
  /*
   * A SERIE E UM ID, E NAO O TEXTO DO HISTORICO. Na planilha, a serie de uma
   * conta recorrente e «os titulos com o mesmo texto no Historico» - uma virgula
   * a mais quebra a recorrencia sem aviso. Aqui a serie nasce no primeiro
   * lancamento recorrente ou parcelado e todo titulo dela carrega o mesmo id.
   * Avulsa (ou sem recorrencia, como a conta do split) nao tem serie.
   */
  ADD CONSTRAINT conta_pagar_serie_coerente CHECK (
    (recorrencia IS NULL OR recorrencia = 'avulsa') = (serie_id IS NULL)),
  ADD CONSTRAINT conta_pagar_parcela_coerente CHECK (
    (coalesce(recorrencia::text, '') = 'parcelada') = (parcela_numero IS NOT NULL)
    AND (parcela_numero IS NULL) = (parcela_total IS NULL)
    AND (parcela_numero IS NULL
         OR (parcela_total BETWEEN 2 AND 360 AND parcela_numero BETWEEN 1 AND parcela_total))),
  -- «Recorrente ate (mes/ano)»: guardado como o primeiro dia do mes, como a
  -- competencia, e so faz sentido para o que se repete. O `coalesce` NAO e
  -- enfeite: sem ele, `NULL IN (...)` da NULL, CHECK com NULL passa, e uma
  -- despesa sem recorrencia aceitava «recorrente ate» - foi o que o D5 de
  -- `tests/despesas.sql` pegou na primeira rodada.
  ADD CONSTRAINT conta_pagar_recorrente_ate_coerente CHECK (
    recorrente_ate IS NULL
    OR (coalesce(recorrencia::text, '') IN ('mensal','trimestral','semestral','anual')
        AND EXTRACT(day FROM recorrente_ate) = 1)),
  -- O que nasce do split nao e lancamento da planilha: repasse e comissao
  -- seguem a regra do rateio, e uma recorrencia ali projetaria repasse em dobro.
  ADD CONSTRAINT conta_pagar_planilha_so_a_mao CHECK (
    origem_split_item_id IS NULL
    OR (natureza IS NULL AND recorrencia IS NULL AND serie_id IS NULL)),
  ADD CONSTRAINT conta_pagar_comprovante_e_link CHECK (
    comprovante_url IS NULL OR comprovante_url ~* '^https?://');

CREATE INDEX conta_pagar_serie_idx ON conta_pagar (tenant_id, serie_id) WHERE serie_id IS NOT NULL;

-- ------------------------------------------------------------ o socio que pagou do bolso
--
-- DECISAO DO DONO, 02/10/2026 (Q-SOCIOS-01): «quando paga do bolso e uma divida
-- da empresa com ele». A baixa cuja origem e um socio faz nascer, na MESMA
-- transacao, uma conta a pagar AO SOCIO no valor que saiu do bolso dele
-- (valor + acrescimo - desconto). Ela e quitada como qualquer outra - por um
-- pagamento que sai da conta da empresa - e e assim que o caixa continua com um
-- tipo so de saida (principio 1 do plano de 22/09).
--
-- E DIVIDA, NAO DESPESA: a despesa ja foi contada quando o socio pagou. Por isso
-- o Painel e a Projecao leem `reembolso_de_pagamento_id IS NULL`, e o reembolso
-- aparece a parte, como «Devido aos socios».
--
-- UM REEMBOLSO POR PAGAMENTO, com a chave gerada da regra 11 (a mesma forma de
-- `origem_split_item_chave`): indice unico PARCIAL sobre as colunas da FK e
-- proibido, porque o `db pull` o le como relacao to-one.
ALTER TABLE conta_pagar
  ADD COLUMN reembolso_de_pagamento_id uuid,
  ADD COLUMN reembolso_chave uuid GENERATED ALWAYS AS (coalesce(reembolso_de_pagamento_id, id)) STORED,
  ADD CONSTRAINT conta_pagar_reembolso_fk
    FOREIGN KEY (tenant_id, reembolso_de_pagamento_id) REFERENCES pagamento (tenant_id, id),
  ADD CONSTRAINT conta_pagar_reembolso_e_divida CHECK (
    reembolso_de_pagamento_id IS NULL
    OR (origem_split_item_id IS NULL AND recorrencia IS NULL AND serie_id IS NULL AND natureza IS NULL));

CREATE UNIQUE INDEX conta_pagar_reembolso_unico ON conta_pagar (tenant_id, reembolso_chave);

COMMENT ON COLUMN conta_pagar.reembolso_de_pagamento_id IS
  'Preenchida quando a conta e a divida da empresa com um socio que pagou do bolso: o pagamento que ele fez. Divida, nao despesa.';

COMMENT ON COLUMN conta_pagar.serie_id IS
  'Os titulos de uma mesma conta recorrente ou parcelada. O ultimo (maior vencimento) e o molde da projecao.';

-- ------------------------------------------------------------ a baixa
--
-- ACRESCIMO E DESCONTO FICAM NO PAGAMENTO, E NAO NO VALOR DO TITULO. A planilha
-- deixa o valor pago diferir do original («acrescimos (+) / descontos (-)»); o
-- sistema recusa pagar acima do titulo (`conta_pagar_nao_paga_demais`), e essa
-- regra fica. `valor_centavos` continua sendo o que ABATE do titulo; o que saiu
-- do banco e `valor_centavos + acrescimo_centavos - desconto_centavos`.
ALTER TABLE pagamento
  ADD COLUMN acrescimo_centavos  int NOT NULL DEFAULT 0,
  ADD COLUMN desconto_centavos   int NOT NULL DEFAULT 0,
  ADD COLUMN origem_pagamento_id uuid,
  ADD CONSTRAINT pagamento_acrescimo_nao_negativo CHECK (acrescimo_centavos >= 0),
  ADD CONSTRAINT pagamento_desconto_cabe CHECK (desconto_centavos >= 0 AND desconto_centavos <= valor_centavos),
  ADD CONSTRAINT pagamento_origem_pagamento_fk
    FOREIGN KEY (tenant_id, origem_pagamento_id) REFERENCES origem_pagamento (tenant_id, id);

-- ------------------------------------------------------------ RLS, grants, trilha
ALTER TABLE origem_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE origem_pagamento FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON origem_pagamento
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON origem_pagamento TO app_financeiro;
REVOKE DELETE ON origem_pagamento FROM app_financeiro;

CREATE TRIGGER auditar_origem_pagamento
  AFTER INSERT OR UPDATE OR DELETE ON origem_pagamento
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname = 'origem_pagamento'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
