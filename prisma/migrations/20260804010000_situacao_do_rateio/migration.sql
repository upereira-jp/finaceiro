-- MIGRATION 24 - A SITUACAO DO RATEIO NA UC. `Q-SITUACAO-01`, decidida em 04/08.
--
-- De onde ela vem: a §4 da `RESPOSTA-dev-crm-rodada5` pediu ao dev do CRM uma
-- coluna que dissesse a SITUACAO do contrato de rateio, porque sem ela **toda
-- linha de `financeiro.rateio_clientes` era lida como valida**. Eles entregaram
-- `financeiro.rateio_situacao` em 01/08, o conector passou a ler em 03/08 (R26),
-- e a leitura mostrou o que ninguem tinha medido:
--
--   das 41 UCs espelhadas, 29 estao `ativado` e 12 NAO - sete delas em troca de
--   titularidade.
--
-- O dono decidiu em 04/08: **o financeiro considera as ativadas.** As 12 seguem
-- espelhadas e visiveis nos cadastros - some-las seria encolher a carteira sem
-- ninguem ter cancelado nada -, mas o lote de faturamento as RECUSA, com motivo
-- nomeado, na mesma lista das outras cinco recusas.
--
-- POR QUE UMA COLUNA, E NAO UMA CONSULTA AO CRM NA HORA DE FATURAR.
--
-- A triagem (`src/dominio/faturamento.ts`) e PURA e roda sobre os nossos dados.
-- Fazer o faturamento falar com o CRM criaria um segundo caminho de leitura -
-- a `SPEC-002` R1 existe para haver um so - e amarraria a emissao de fatura a
-- disponibilidade de outro banco. O conector le, grava o espelho, e o
-- faturamento decide sobre o que esta aqui.
--
-- A REGRA SO ALCANCA UC ESPELHADA, e essa condicao impediu um defeito de entrar.
--
-- A triagem so recusa por situacao quando `crm_usina_cliente_id` esta
-- preenchido. `POST /unidades-consumidoras` cria UC A MAO, e essa UC nunca vai
-- ter situacao no CRM porque o CRM nao sabe dela - sem a condicao ela ficaria
-- NAO FATURAVEL PARA SEMPRE, sem erro e sem log. O buraco existiu na primeira
-- versao desta migration e apareceu porque QUATRO suites quebraram de uma vez,
-- todas criando UC pelo caminho da aplicacao, que e o mesmo caminho da tela.
--
-- TEXT E NAO ENUM, e a diferenca importa. `campo_de_fatura` e enum porque a
-- lista e NOSSA. Esta e vocabulario DELES: se a G3 acrescentar um terceiro
-- estado amanha, um enum faria o conector quebrar no meio do ciclo por causa de
-- uma palavra nova. Text espelha o que vier, e quem decide o que fazer com o
-- valor desconhecido e a triagem - que trata "diferente de ativado" como nao
-- faturavel, o que e o lado seguro.

ALTER TABLE unidade_consumidora
  /*
   * NULL significa "o conector ainda nao leu", e NAO "nao ativado". A distincao
   * e a mesma de `nao_medido` contra `pendente` na prontidao: ausencia de
   * medicao nao e medicao de ausencia. As duas caem na mesma recusa hoje, por
   * decisao - o lado seguro para dinheiro e nao faturar o que nao se confirmou -,
   * mas a EXPLICACAO da recusa distingue as duas, porque a acao e diferente:
   * uma pede rodar o ciclo, a outra pede falar com o CRM.
   */
  ADD COLUMN rateio_situacao text,
  ADD COLUMN rateio_em_troca_titularidade boolean,
  ADD COLUMN rateio_situacao_lida_em timestamptz;

COMMENT ON COLUMN unidade_consumidora.rateio_situacao IS
  'Espelho de financeiro.rateio_situacao.situacao do CRM. NULL = nunca lido pelo conector, '
  'que NAO e o mesmo que nao ativado. So o conector escreve (SPEC-002 R5, campo espelho).';
COMMENT ON COLUMN unidade_consumidora.rateio_em_troca_titularidade IS
  'Espelho de financeiro.rateio_situacao.em_troca_titularidade. 7 de 41 em 03/08/2026.';
COMMENT ON COLUMN unidade_consumidora.rateio_situacao_lida_em IS
  'Quando o conector leu. Existe para distinguir "lido e vazio" de "nunca lido" sem '
  'depender de o CRM sempre mandar valor - a mesma razao de `ultima_leitura_em` no conector.';

/*
 * O INDICE E PARCIAL E NAO-UNICO, e a distincao e a regra 11 inteira.
 *
 * Ele serve a UMA consulta: "quais UCs deste tenant estao ativadas", que e o
 * predicado do lote de faturamento. Nao-unico porque N UCs compartilham o
 * valor; parcial porque as nao ativadas nao sao procuradas por ele.
 *
 * O CAT-1 nao o recusa: as colunas `(tenant_id, rateio_situacao)` NAO sao o
 * conjunto de nenhuma FK. E o CAT-9 nao se aplica, porque ele cobra predicado
 * `IS NOT NULL` de indice UNICO parcial - este nao e unico, entao nao pode
 * virar chave de `findUnique` e nao ha como o Prisma navegar por ele.
 */
CREATE INDEX uc_rateio_ativado ON unidade_consumidora (tenant_id, id)
  WHERE rateio_situacao = 'ativado';

-- ====================================================== A CONFERENCIA
-- As colunas nasceram numa tabela que JA tem RLS, FORCE, policy e gatilho de
-- auditoria - `ALTER TABLE ADD COLUMN` nao mexe em nenhum dos quatro. A
-- conferencia existe para dizer isso por medicao e nao por confianca, que e o
-- mesmo criterio das migrations 18, 21, 22 e 23.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname = 'unidade_consumidora'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      OR NOT EXISTS (SELECT 1 FROM pg_trigger g
                      WHERE g.tgrelid = c.oid AND NOT g.tgisinternal
                        AND g.tgfoid = 'app.auditar()'::regprocedure));
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'unidade_consumidora perdeu RLS, policy ou gatilho de auditoria';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'unidade_consumidora'
                    AND column_name = 'rateio_situacao') THEN
    RAISE EXCEPTION 'a coluna rateio_situacao nao foi criada';
  END IF;
END $$;
