-- MIGRATION 29 - O REGISTRO DA FATURA UNIFICADA, por UC e competencia.
--
-- ============================================================================
-- O QUE ESTA MIGRATION FECHA, E ELE ESTA IMPRESSO ERRADO NA FOLHA HOJE
--
-- A folha 2 tem tres indicadores, e o primeiro - o maior da folha, 21pt, o
-- numero pelo qual o cliente abre a segunda pagina - diz **"Voce ja economizou"**.
--
-- Medido em 14/08: ele imprime o desconto DESTA fatura, e a nota abaixo dele
-- afirma **"Primeira fatura com a G3 Solar"**. Para toda fatura. Inclusive a
-- decima. A causa e de uma linha:
--
--   `const acumulada = extras.economia_acumulada_centavos ?? conta.desconto_centavos;`
--
-- e `extras` nunca chega, porque `POST /faturas/unificada/compor` chama
-- `comporFolhas` com quatro argumentos. O caminho FUNCIONA - a verificacao `F7c`
-- de `tests/folha-unificada.ts` prova que passando `{economia_acumulada_centavos,
-- desde}` a folha imprime a soma e a data. O que falta e o alimentador.
--
-- E o alimentador nao existe porque **nada guarda a fatura lida**. A referencia
-- (`REFERENCIA-fatura-unificada-2026-08-13.md` §8) guarda em `localStorage`, sob
-- `fatura:{uc}:{AAAA-MM}`, e tira a economia acumulada da soma dos descontos
-- dessa serie. Isso e a `Q-DOCG3-04`, e a RETOMADA de 14/08 §5 a listava como
-- "nao entrou, de proposito".
--
-- ============================================================================
-- A CHAVE DA REFERENCIA NAO SE PORTA, E A RETOMADA JA DIZIA POR QUE
--
-- `fatura:{uc}:{AAAA-MM}` nao tem tenant. Do lado de ca, indice de negocio e
-- SEMPRE composto com `tenant_id` (regra 2) - senao a UC 000123 do tenant A
-- somaria a economia da UC 000123 do tenant B, e o numero errado sairia impresso
-- sem erro nenhum em lugar nenhum.
--
-- ============================================================================
-- POR QUE `numero_uc` E TEXTO E A FK PARA A UC E OPCIONAL
--
-- A aba nova compoe a partir do **PDF da Equatorial**, e o numero da UC vem da
-- leitura - nao de uma escolha em lista. Exigir que a UC exista no nosso cadastro
-- para registrar a fatura inverteria a ordem do trabalho: quem sobe o PDF esta
-- justamente conferindo, e travar a conferencia por cadastro faltando e o tipo de
-- exigencia que faz a pessoa registrar em outro lugar.
--
-- Entao `numero_uc text NOT NULL` e a chave de negocio, e
-- `unidade_consumidora_id` e a ligacao QUANDO ela existe - composta
-- `(tenant_id, unidade_consumidora_id)`, porque nenhuma FK atravessa tenant
-- (regra 2). A economia acumulada soma por `numero_uc`, que e o que a folha
-- imprime e o que o cliente reconhece.
--
-- ============================================================================
-- O DINHEIRO E COLUNA, E O QUE FOI LIDO E TEXTO
--
-- Toda parcela da conta vira `_centavos integer` - regra 1, em toda camada. O que
-- NAO vira centavo e o que a fatura da distribuidora DIZIA: aquilo e transcricao
-- de documento de terceiro, e guarda-lo como numero nosso apagaria a diferenca
-- entre "o que lemos" e "o que calculamos".
--
-- kWh, tarifa, percentual e fator mantem escala decimal - regra 1, segundo
-- paragrafo: grandeza fisica e proporcao nao viram centavos.
--
-- O historico de consumo e `jsonb` e nao tabela filha, e a razao e de uso: sao 13
-- pares mes/kWh que so existem para desenhar UM grafico de UMA folha, sempre
-- lidos inteiros e nunca consultados por mes. Uma tabela filha custaria uma FK,
-- uma policy, um gatilho de auditoria e um join, e nao responderia nenhuma
-- pergunta que o jsonb nao responda.

CREATE TABLE registro_de_fatura_unificada (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,

  -- ------------------------------------------------------------- a chave
  numero_uc   text NOT NULL,
  /* Primeiro dia do mes. `date` e nao `text` porque a serie e ORDENADA por ele -
   * e "desde marco de 2026" sai do menor. */
  competencia date NOT NULL,

  /* A ligacao com o cadastro, quando a UC existe aqui. Composta: regra 2. */
  unidade_consumidora_id uuid,

  -- --------------------------------------------- o que a fatura da Equatorial dizia
  cliente_nome      text,
  cliente_documento text,
  endereco          text,
  classificacao     text,
  data_emissao      date,
  leitura_anterior  date,
  leitura_atual     date,
  dias_faturados    smallint,
  vencimento        date,
  bandeira_tarifaria text,

  -- ------------------------------------------------- grandezas fisicas e proporcoes
  compensada_kwh     numeric(14,3) NOT NULL,
  nao_compensado_kwh numeric(14,3) NOT NULL DEFAULT 0,
  /* Seis casas, como a coluna "Preco unit (R$) com tributos" da fatura. Truncar
   * em centavos custaria R$ 2,90 a mais numa UC num mes - medido na R22. */
  tarifa_kwh          numeric(12,6) NOT NULL,
  percentual_desconto numeric(5,2)  NOT NULL,
  fator_emissao       numeric(12,6) NOT NULL,

  -- ------------------------------------------------------------- o dinheiro
  integral_centavos           integer NOT NULL,
  desconto_centavos           integer NOT NULL,
  energia_g3_centavos         integer NOT NULL,
  nao_compensado_centavos     integer NOT NULL,
  iluminacao_publica_centavos integer NOT NULL,
  bandeira_centavos           integer NOT NULL,
  demais_centavos             integer NOT NULL,
  total_equatorial_centavos   integer NOT NULL,
  total_centavos              integer NOT NULL,

  -- ------------------------------------------------------------- o pagamento
  linha_digitavel  text,
  pix_copia_e_cola text,
  nosso_numero     text,
  instrucoes       text[] NOT NULL DEFAULT '{}',

  -- ------------------------------------------------------------- o resto
  historico_consumo     jsonb NOT NULL DEFAULT '[]',
  /* Os campos personalizados de origem `variavel` desta fatura: chave -> valor.
   * Os `fixo` NAO entram aqui - eles vivem no modelo, e copia-los faria a
   * segunda via divergir do cadastro sem ninguem ter mudado nada. */
  campos_personalizados jsonb NOT NULL DEFAULT '{}',

  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT registro_numero_uc_nao_vazio CHECK (length(btrim(numero_uc)) > 0),
  /* A competencia e o PRIMEIRO DIA do mes. Sem isto, a mesma UC teria duas
   * linhas para julho - dia 1 e dia 15 - e a unica que existe e o mes. E a
   * mesma regra que `fatura.competencia` ja carrega. */
  CONSTRAINT registro_competencia_no_dia_1 CHECK (date_trunc('month', competencia) = competencia),
  CONSTRAINT registro_kwh_nao_negativo CHECK (compensada_kwh >= 0 AND nao_compensado_kwh >= 0),
  CONSTRAINT registro_tarifa_positiva  CHECK (tarifa_kwh >= 0),
  CONSTRAINT registro_desconto_na_faixa CHECK (percentual_desconto BETWEEN 0 AND 50),
  CONSTRAINT registro_fator_positivo   CHECK (fator_emissao > 0),
  /* O desconto nao pode ser maior que o integral: e o que impediria a economia
   * acumulada de crescer com numero negativo dentro. */
  CONSTRAINT registro_desconto_cabe CHECK (desconto_centavos BETWEEN 0 AND integral_centavos),
  /* AS PARTES SOMAM O TODO, e o banco confere. E a mesma classe da verificacao
   * `F1b` da folha: tres linhas arredondadas que nao somam sao o defeito medido
   * na referencia, em 229 de 900 casos. Aqui a soma e exata por construcao
   * (inteiros), e o CHECK e o que garante que continue sendo depois de qualquer
   * mudanca no caminho de gravacao. */
  CONSTRAINT registro_energia_fecha CHECK (energia_g3_centavos = integral_centavos - desconto_centavos),
  CONSTRAINT registro_equatorial_fecha CHECK (
    total_equatorial_centavos = nao_compensado_centavos + iluminacao_publica_centavos
                              + bandeira_centavos + demais_centavos
  ),
  CONSTRAINT registro_total_fecha CHECK (total_centavos = energia_g3_centavos + total_equatorial_centavos),
  CONSTRAINT registro_historico_e_lista CHECK (jsonb_typeof(historico_consumo) = 'array'),
  CONSTRAINT registro_personalizados_e_objeto CHECK (jsonb_typeof(campos_personalizados) = 'object'),

  CONSTRAINT registro_fatura_unificada_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT registro_fatura_unificada_uc_fk
    FOREIGN KEY (tenant_id, unidade_consumidora_id) REFERENCES unidade_consumidora (tenant_id, id)
);

CREATE UNIQUE INDEX registro_fatura_unificada_id_tenant
  ON registro_de_fatura_unificada (tenant_id, id);

/*
 * UMA FATURA POR UC POR MES, e o indice e CHEIO.
 *
 * Regra 11: nenhum indice unico PARCIAL pode cobrir exatamente as colunas de uma
 * FK. Este e (tenant_id, numero_uc, competencia) - tres colunas, sem predicado, e
 * nao e o conjunto de FK nenhuma. Ele e tambem o caminho de leitura da economia
 * acumulada, que consulta por (tenant_id, numero_uc) ordenando por competencia.
 */
CREATE UNIQUE INDEX registro_fatura_unificada_unico
  ON registro_de_fatura_unificada (tenant_id, numero_uc, competencia);

/* O caminho da tela de historico: as ultimas competencias do tenant, em ordem. */
CREATE INDEX registro_fatura_unificada_competencia_idx
  ON registro_de_fatura_unificada (tenant_id, competencia DESC);

/* E o caminho de quem entra pela UC do cadastro, quando ela existe. */
CREATE INDEX registro_fatura_unificada_uc_idx
  ON registro_de_fatura_unificada (tenant_id, unidade_consumidora_id);

COMMENT ON TABLE registro_de_fatura_unificada IS
  'A fatura unificada REGISTRADA, por UC e competencia. E a `fatura:{uc}:{AAAA-MM}` da '
  'referencia com tenant_id, policy e trilha - a chave sem tenant nao se porta (regra 2). '
  'Serve a duas coisas: a economia acumulada impressa na folha 2, e a segunda via.';
COMMENT ON COLUMN registro_de_fatura_unificada.numero_uc IS
  'A chave de negocio. TEXTO e nao FK porque a fatura vem do PDF da distribuidora, e exigir '
  'cadastro para registrar inverteria a ordem do trabalho: quem sobe o PDF esta conferindo.';
COMMENT ON COLUMN registro_de_fatura_unificada.campos_personalizados IS
  'Os campos personalizados de origem `variavel` desta fatura: chave -> valor. Os de origem '
  '`fixo` NAO entram - eles vivem no modelo, e copia-los faria a segunda via divergir do '
  'cadastro sem ninguem ter mudado nada.';

-- ================================================ isolamento e permissao

ALTER TABLE registro_de_fatura_unificada ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_de_fatura_unificada FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON registro_de_fatura_unificada
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

/*
 * DELETE PERMITIDO, E A ASSIMETRIA COM `fatura` E DELIBERADA.
 *
 * `fatura` e `pagamento` tem DELETE revogado porque sao documento financeiro:
 * apagar reescreveria a historia de um titulo que circulou. Este registro e
 * outra coisa - e o que a pessoa transcreveu de um PDF de terceiro, e ele
 * ALIMENTA UM NUMERO IMPRESSO na folha do cliente.
 *
 * Uma transcricao errada que nao pode ser apagada vira economia acumulada errada
 * para sempre, e o unico conserto seria uma linha compensatoria - que e pior:
 * duas linhas mentindo em vez de uma. A trilha da regra 9 grava o "antes" do
 * DELETE, entao o que se perde e a linha, nunca o registro de que ela existiu.
 */
GRANT SELECT, INSERT, UPDATE, DELETE ON registro_de_fatura_unificada TO app_financeiro;

-- ========================================================= auditoria
-- Regra 9: quem, quando, antes e depois. Este registro decide um numero que sai
-- impresso na folha do cliente - a economia acumulada -, e "o numero mudou e
-- ninguem sabe desde quando" e exatamente o que a trilha impede.
CREATE TRIGGER auditar_registro_de_fatura_unificada
  AFTER INSERT OR UPDATE OR DELETE ON registro_de_fatura_unificada
  FOR EACH ROW EXECUTE FUNCTION app.auditar();
