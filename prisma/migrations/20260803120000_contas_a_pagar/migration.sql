-- MIGRATION 22 - CONTAS A PAGAR E PAGAMENTO. O lado que apura ja existia; o que
-- QUITA nao existia em lugar nenhum.
--
-- DE ONDE ISTO VEM: `Q-PAGAMENTO-01`, decidida pelo dono em 03/08/2026 na opcao
-- "conta_pagar completa, como o PRD 4.4 desenha" - contra a alternativa de
-- colunas de quitacao dentro de `split_item`.
--
-- O QUE FALTAVA, medido em 30/07 e ainda verdadeiro em 03/08:
--
--   O PRD 5.5 manda QUATRO escritas na mesma transacao do split.
--   `src/repos/split.ts` fazia DUAS - `split_execucao` e `split_item`.
--
--   E `split_item` NAO TEM COLUNA DE PAGAMENTO: sem `pago_em`, sem status, sem
--   vinculo a um pagamento. No dia da primeira fatura paga, o sistema saberia ao
--   centavo QUANTO o dono da usina e o originador tem a receber, e nao teria
--   onde registrar que foram pagos. Os relatorios sao extrato de APURACAO, nao
--   de QUITACAO, e nada impediria pagar duas vezes o mesmo repasse.
--
-- A JANELA E O MOTIVO DE ISTO SER AGORA: `split_item` tem ZERO linhas. Depois da
-- primeira liquidacao vira migration em tabela com dinheiro gravado, que e
-- exatamente o custo que a `Q-011` evitou ao perguntar antes.
--
-- ============================================================================
-- O QUE ESTA MIGRATION NAO TRAZ, E POR QUE - a lista importa tanto quanto a do
-- que ela traz, porque o PRD 4.4 tem TREZE entidades e aqui entram QUATRO.
--
--   conta_receber        a `fatura` JA E o titulo a receber do cliente. Uma
--                        segunda tabela para o mesmo fato criaria duas verdades
--                        sobre quanto se tem a receber, e a reconciliacao entre
--                        elas seria trabalho puro
--   conta_bancaria       `pagamento` guarda forma e referencia externa, que e o
--                        que responde "foi pago". De QUAL conta saiu e pergunta
--                        do fluxo de caixa, e o fluxo de caixa nao esta aqui
--   movimento_caixa      o PRD 5.5 item 1 e o livro-razao. E a fatia do DRE, e a
--                        decisao de agrupamento se toma melhor olhando o
--                        primeiro lote real - hoje ha ZERO liquidacoes
--   extrato_importado    conciliacao por API/OFX. Depende do A1 (Q-SICOOB-01)
--   conciliacao
--   cartao_credito       competencia <> caixa. Nao toca o caminho do repasse
--   fatura_cartao
--   fornecedor           compra e cadastro de fornecedor sao despesa OPERACIONAL,
--   compra               e o que tem prazo aqui e a despesa que NASCE DO SPLIT
--
-- As nove ficam registradas em `Q-CORPORATIVO-01`. O criterio de corte foi um
-- so: entra o que impede pagar duas vezes o mesmo repasse, porque so isso tem
-- prazo - a primeira liquidacao.

-- ======================================================== 1. OS TIPOS
CREATE TYPE tipo_beneficiario AS ENUM ('dono_usina','originador','concessionaria','outro');

COMMENT ON TYPE tipo_beneficiario IS
  'Quem recebe. Os tres primeiros saem direto dos tipos de split_item que geram '
  'despesa (repasse_usina, comissao, repasse_concessionaria); `outro` e a conta '
  'a pagar digitada a mao, que nao nasce de split.';

CREATE TYPE status_conta_pagar AS ENUM ('aberta','parcial','paga','cancelada');

/*
 * `parcial` existe porque o PRD 4.4 separa a conta do PAGAMENTO, e evento
 * separado admite mais de um. Sem o estado intermediario, uma conta com metade
 * paga apareceria como `aberta` - e quem olhasse a lista de pendencias pagaria a
 * metade de novo, que e a falha que esta migration existe para fechar.
 */
COMMENT ON TYPE status_conta_pagar IS
  'Estado da conta a pagar. NAO e escrito a mao: `app.recalcular_conta_pagar()` '
  'o deriva da soma dos pagamentos, e a unica transicao manual e o cancelamento.';

CREATE TYPE forma_de_pagamento AS ENUM ('pix','ted','doc','boleto','dinheiro','compensacao');

COMMENT ON TYPE forma_de_pagamento IS
  '`compensacao` e o encontro de contas - o beneficiario devia algo a G3 e a '
  'divida foi abatida. Sai dinheiro nenhum, e por isso ela precisa existir como '
  'forma: registrar como `pix` um valor que nunca saiu da conta faria a '
  'conciliacao bancaria nunca fechar.';

-- ======================================================== 2. O PLANO GERENCIAL
/*
 * `categoria` e `centro_custo` nascem VAZIAS, e isso e decisao.
 *
 * Semear um plano de contas aqui decidiria a estrutura do DRE de todo tenant
 * futuro - o mesmo argumento que `layout-do-documento.ts` ja carrega sobre o
 * layout do documento: "campo vazio significa usa o padrao, e semear um padrao
 * na migration decidiria o layout de todo tenant futuro".
 *
 * Consequencia aceita: a conta a pagar nasce SEM classificacao, e as duas FKs
 * sao nullable. A alternativa - NOT NULL - travaria o split, que e o unico
 * caminho que cria conta hoje e que roda sem ninguem por perto.
 */
CREATE TABLE categoria (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome      text NOT NULL,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT categoria_nome_nao_vazio CHECK (length(btrim(nome)) > 0),
  CONSTRAINT categoria_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);
CREATE UNIQUE INDEX categoria_id_tenant   ON categoria (tenant_id, id);
CREATE UNIQUE INDEX categoria_nome_unico  ON categoria (tenant_id, nome);

CREATE TABLE centro_custo (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome      text NOT NULL,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT centro_custo_nome_nao_vazio CHECK (length(btrim(nome)) > 0),
  CONSTRAINT centro_custo_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);
CREATE UNIQUE INDEX centro_custo_id_tenant  ON centro_custo (tenant_id, id);
CREATE UNIQUE INDEX centro_custo_nome_unico ON centro_custo (tenant_id, nome);

-- ======================================================== 3. A CONTA A PAGAR
CREATE TABLE conta_pagar (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,

  descricao text NOT NULL,

  categoria_id    uuid,
  centro_custo_id uuid,

  /*
   * O BENEFICIARIO E POLIMORFICO, e a forma e copiada de
   * `split_item_beneficiario_coerente` (migration 17): enum discriminador mais
   * FKs nullable, com um CASE que exige exatamente as colunas do caso.
   *
   * A alternativa - uma tabela `beneficiario` acima de dono_usina e originador -
   * foi descartada porque criaria uma terceira identidade para pessoas que ja
   * tem cadastro proprio, com documento e dados bancarios. O CHECK abaixo faz o
   * mesmo trabalho sem a indirecao.
   */
  beneficiario_tipo tipo_beneficiario NOT NULL,
  dono_usina_id     uuid,
  originador_id     uuid,
  /* Nome livre para `concessionaria` e `outro`: a Equatorial nao e cadastro
   * nosso, e a conta digitada a mao pode ser para quem nao esta em tabela
   * nenhuma. Nos dois casos NOT NULL pelo CHECK - "outro" sem nome seria uma
   * despesa sem dono, que e o mesmo que nao registrar. */
  beneficiario_nome text,

  /* Regra 1: dinheiro e Int em centavos, e a coluna carrega o sufixo. O valor e
   * o BRUTO - o PRD 4.4 e explicito: "registra a despesa bruta". Retencao sobre
   * PF sai no PAGAMENTO, que e onde a Q-011 a poe. */
  valor_centavos int NOT NULL,

  /* Mantida por gatilho, nunca escrita a mao. Existe para o status ser barato e
   * para a invariante ser CONFERIVEL: soma dos pagamentos = esta coluna. */
  valor_pago_centavos int NOT NULL DEFAULT 0,

  competencia date NOT NULL,
  vencimento  date NOT NULL,

  status status_conta_pagar NOT NULL DEFAULT 'aberta',

  /*
   * A ORIGEM. Nulo quando a conta e digitada a mao.
   *
   * "Quando nasce de split, o vinculo e obrigatorio e o valor e IMUTAVEL"
   * (PRD 4.4). A imutabilidade e imposta por gatilho abaixo, e nao por CHECK,
   * porque CHECK nao ve o valor anterior.
   */
  origem_split_item_id uuid,

  /*
   * A CHAVE DA UNICIDADE DA ORIGEM, e ela e uma coluna GERADA de proposito.
   *
   * O que se quer e "um split_item gera no maximo UMA conta a pagar" - sem isso,
   * rodar o split duas vezes (ou consertar um bug e reprocessar) provisionaria o
   * mesmo repasse duas vezes, e a lista de pendencias mandaria pagar em dobro.
   *
   * O caminho obvio seria `UNIQUE (tenant_id, origem_split_item_id) WHERE
   * origem_split_item_id IS NOT NULL`. ELE E PROIBIDO PELA REGRA 11: e indice
   * unico PARCIAL cobrindo EXATAMENTE as colunas da FK `conta_pagar_split_fk`, e
   * o `db pull` do Prisma 7.9 ignora o predicado e infere uma relacao to-one -
   * a mesma armadilha que devolveu um contrato de R$ 111,00 onde o vigente valia
   * R$ 789,00. O CAT-1 acusaria.
   *
   * O conserto e o que a propria regra 11 prescreve: "coluna gerada e indice
   * unico CHEIO sobre um conjunto que nao e o da FK". `coalesce(origem, id)` da
   * o proprio id para a conta manual - que e unico por construcao e nunca colide
   * - e o id do split_item para a que nasce do split.
   */
  origem_split_item_chave uuid
    GENERATED ALWAYS AS (coalesce(origem_split_item_id, id)) STORED,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  cancelada_em  timestamptz,

  CONSTRAINT conta_pagar_descricao_nao_vazia CHECK (length(btrim(descricao)) > 0),
  CONSTRAINT conta_pagar_valor_positivo      CHECK (valor_centavos > 0),
  CONSTRAINT conta_pagar_pago_nao_negativo   CHECK (valor_pago_centavos >= 0),

  /* NAO SE PAGA MAIS DO QUE SE DEVE, e esta e a linha que a Q-PAGAMENTO-01
   * nomeia. Com ela, "pagar duas vezes o mesmo repasse" deixa de ser possivel
   * por construcao em vez de depender de alguem conferir. */
  CONSTRAINT conta_pagar_nao_paga_demais CHECK (valor_pago_centavos <= valor_centavos),

  CONSTRAINT conta_pagar_competencia_e_primeiro_dia CHECK (EXTRACT(day FROM competencia) = 1),

  CONSTRAINT conta_pagar_cancelamento_coerente CHECK (
    (status = 'cancelada') = (cancelada_em IS NOT NULL)
  ),

  /* Mesma forma do `split_item_beneficiario_coerente`. */
  CONSTRAINT conta_pagar_beneficiario_coerente CHECK (
    CASE beneficiario_tipo
      WHEN 'dono_usina'     THEN dono_usina_id IS NOT NULL AND originador_id IS NULL
      WHEN 'originador'     THEN originador_id IS NOT NULL AND dono_usina_id IS NULL
      WHEN 'concessionaria' THEN dono_usina_id IS NULL AND originador_id IS NULL
                                 AND beneficiario_nome IS NOT NULL
      WHEN 'outro'          THEN dono_usina_id IS NULL AND originador_id IS NULL
                                 AND beneficiario_nome IS NOT NULL
    END
  ),

  -- Regra 2: FK composta em toda referencia entre entidades de negocio.
  CONSTRAINT conta_pagar_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT conta_pagar_categoria_fk FOREIGN KEY (tenant_id, categoria_id)
    REFERENCES categoria (tenant_id, id),
  CONSTRAINT conta_pagar_centro_custo_fk FOREIGN KEY (tenant_id, centro_custo_id)
    REFERENCES centro_custo (tenant_id, id),
  CONSTRAINT conta_pagar_dono_fk FOREIGN KEY (tenant_id, dono_usina_id)
    REFERENCES dono_usina (tenant_id, id),
  CONSTRAINT conta_pagar_originador_fk FOREIGN KEY (tenant_id, originador_id)
    REFERENCES originador (tenant_id, id),
  CONSTRAINT conta_pagar_split_fk FOREIGN KEY (tenant_id, origem_split_item_id)
    REFERENCES split_item (tenant_id, id)
);

CREATE UNIQUE INDEX conta_pagar_id_tenant ON conta_pagar (tenant_id, id);

-- O indice CHEIO sobre a coluna gerada. Ver o comentario da coluna: e a regra 11
-- em vez do parcial que o CAT-1 recusaria.
CREATE UNIQUE INDEX conta_pagar_origem_unica
  ON conta_pagar (tenant_id, origem_split_item_chave);

-- A fila de "o que tenho a pagar", que e a pergunta que a tela faz.
CREATE INDEX conta_pagar_aberta_idx ON conta_pagar (tenant_id, vencimento)
  WHERE status IN ('aberta','parcial');

CREATE INDEX conta_pagar_competencia_idx ON conta_pagar (tenant_id, competencia);

COMMENT ON TABLE conta_pagar IS
  'Titulo a pagar - PRD 4.4 e 5.5 item 2 e 3. Nasce do split (vinculo '
  'obrigatorio, valor imutavel, despesa BRUTA) ou digitada a mao. O que ela '
  'fecha e a Q-PAGAMENTO-01: antes dela o sistema sabia QUANTO devia ao dono da '
  'usina e ao originador e nao tinha onde registrar que pagou.';

COMMENT ON COLUMN conta_pagar.valor_centavos IS
  'BRUTO, sempre. PRD 4.4: "o valor e imutavel e registra a despesa bruta". '
  'Retencao sobre PF sai no pagamento (Q-011) - descontar aqui destruiria a '
  'igualdade com o split_item de origem.';

-- ======================================================== 4. O PAGAMENTO
/*
 * EVENTO SEPARADO DA CONTA, e o PRD 4.4 e explicito sobre isso. Tres razoes que
 * a separacao compra, e nenhuma e teorica:
 *
 *   1. pagamento parcial existe, e sem tabela propria ele nao tem onde caber;
 *   2. a retencao sobre PF (Q-011) sai daqui - "gera saida liquida ao
 *      beneficiario mais contas a recolher quando houver retencao" - sem violar
 *      a imutabilidade do valor bruto da conta;
 *   3. "quando foi pago" e "quanto se devia" sao fatos de datas diferentes, e
 *      juntar os dois numa linha so faz o segundo perder a data do primeiro.
 */
CREATE TABLE pagamento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  conta_pagar_id uuid NOT NULL,

  data_pagamento date NOT NULL,
  valor_centavos int  NOT NULL,
  forma          forma_de_pagamento NOT NULL,

  /* O identificador do outro lado: end-to-end do Pix, numero do comprovante,
   * id da transacao. Nao e obrigatorio - `dinheiro` e `compensacao` nao tem -,
   * e quando existe e unico, porque e ele que impede o mesmo comprovante entrar
   * duas vezes por engano. */
  referencia_externa text,
  observacao         text,

  criado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pagamento_valor_positivo CHECK (valor_centavos > 0),

  CONSTRAINT pagamento_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT pagamento_conta_fk FOREIGN KEY (tenant_id, conta_pagar_id)
    REFERENCES conta_pagar (tenant_id, id)
);

CREATE UNIQUE INDEX pagamento_id_tenant ON pagamento (tenant_id, id);
CREATE INDEX pagamento_conta_idx ON pagamento (tenant_id, conta_pagar_id);
CREATE INDEX pagamento_data_idx  ON pagamento (tenant_id, data_pagamento);

/*
 * A REFERENCIA EXTERNA E UNICA QUANDO EXISTE - e este indice E parcial e unico,
 * e ele NAO viola a regra 11: as colunas sao `(tenant_id, referencia_externa)`,
 * e nao existe FK sobre esse par. A regra proibe o parcial que cobre EXATAMENTE
 * as colunas de uma FK, porque e ali que o `db pull` inventa cardinalidade.
 *
 * O predicado e `IS NOT NULL`, que e o que o CAT-9 exige de todo unico parcial.
 */
CREATE UNIQUE INDEX pagamento_referencia_unica
  ON pagamento (tenant_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

COMMENT ON TABLE pagamento IS
  'O ato de pagar - PRD 4.4. Separado da conta porque pagamento parcial existe, '
  'porque a retencao sobre PF mora aqui (Q-011) e porque "quando pagou" e '
  '"quanto devia" sao fatos de datas diferentes.';

-- ======================================================== 5. OS GATILHOS
/*
 * O ESTADO DA CONTA E DERIVADO, NUNCA ESCRITO A MAO.
 *
 * A alternativa seria a aplicacao atualizar `status` e `valor_pago_centavos` a
 * cada pagamento. Isso funciona ate o dia em que um caminho novo insere em
 * `pagamento` sem lembrar de atualizar a conta - e o sintoma seria uma conta
 * paga aparecendo como aberta, que e literalmente o defeito que estamos
 * fechando, reintroduzido pela porta dos fundos.
 *
 * Aqui a soma e refeita do zero a cada mudanca. Recalcular e mais caro que
 * somar o delta e e a escolha certa: somar delta acumula erro se qualquer
 * caminho errar uma vez, e recalcular converge sempre.
 */
/*
 * NAO E `SECURITY DEFINER`, E A PRIMEIRA VERSAO ERA - o teste `G4` de
 * `tests/auditoria.sql` acusou: "inv.19 fora da lista: recalcular_conta_pagar".
 *
 * O invariante 19 diz que todo `SECURITY DEFINER` do projeto e LEITURA sem
 * policy, e a lista branca e fechada "porque a garantia de leitura da R2 depende
 * de nao existir um segundo caminho". Esta funcao ESCREVE - e escrever contornando
 * a RLS e o oposto do que se quer numa tabela de dinheiro a pagar.
 *
 * Sem ele o gatilho roda como quem inseriu o pagamento, e a policy de
 * `conta_pagar` e avaliada normalmente: o UPDATE so alcanca conta do mesmo
 * tenant. Um pagamento que apontasse para conta de outro tenant nao acharia a
 * linha - e a FK composta ja o teria recusado antes.
 *
 * `SET search_path` fica: a resolucao de nome nao deve depender de quem chama.
 */
CREATE OR REPLACE FUNCTION app.recalcular_conta_pagar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  alvo_tenant uuid := coalesce(NEW.tenant_id, OLD.tenant_id);
  alvo_conta  uuid := coalesce(NEW.conta_pagar_id, OLD.conta_pagar_id);
  soma        int;
  devido      int;
  estado      status_conta_pagar;
BEGIN
  SELECT coalesce(sum(p.valor_centavos), 0) INTO soma
    FROM pagamento p
   WHERE p.tenant_id = alvo_tenant AND p.conta_pagar_id = alvo_conta;

  SELECT c.valor_centavos, c.status INTO devido, estado
    FROM conta_pagar c
   WHERE c.tenant_id = alvo_tenant AND c.id = alvo_conta;

  /*
   * Conta CANCELADA nao recebe pagamento. A recusa e aqui e nao num CHECK
   * porque o CHECK da conta nao enxerga a tabela de pagamento, e o da tabela de
   * pagamento nao enxerga o status da conta.
   */
  IF estado = 'cancelada' AND TG_OP <> 'DELETE' THEN
    RAISE EXCEPTION 'conta a pagar cancelada nao recebe pagamento (conta %)', alvo_conta
      USING ERRCODE = '23514';
  END IF;

  /*
   * O `::status_conta_pagar` NAO E ENFEITE, e a primeira versao nao o tinha: os
   * ramos do CASE sao literais `unknown`, o Postgres resolve o resultado como
   * `text` e o UPDATE morre com `42804 - column "status" is of type
   * status_conta_pagar but expression is of type text`. Pego pelo `P2b`.
   */
  UPDATE conta_pagar c
     SET valor_pago_centavos = soma,
         status = (CASE
                     WHEN c.status = 'cancelada' THEN 'cancelada'
                     WHEN soma = 0        THEN 'aberta'
                     WHEN soma >= devido  THEN 'paga'
                     ELSE 'parcial'
                   END)::status_conta_pagar
   WHERE c.tenant_id = alvo_tenant AND c.id = alvo_conta;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION app.recalcular_conta_pagar() IS
  'Deriva valor_pago_centavos e status da SOMA dos pagamentos. Recalcula do '
  'zero em vez de somar delta: delta acumula erro se qualquer caminho errar uma '
  'vez, e recalcular converge sempre. O CHECK conta_pagar_nao_paga_demais e '
  'quem recusa o pagamento a mais - esta funcao so escreve, e a escrita falha.';

CREATE TRIGGER recalcular_conta_do_pagamento
  AFTER INSERT OR UPDATE OR DELETE ON pagamento
  FOR EACH ROW EXECUTE FUNCTION app.recalcular_conta_pagar();

/*
 * A IMUTABILIDADE DO VALOR QUE NASCEU DE SPLIT - PRD 4.4, "quando nasce de
 * split, o vinculo e obrigatorio, o valor e IMUTAVEL".
 *
 * Por que gatilho e nao CHECK: CHECK nao ve o valor anterior. E por que
 * importa: `conta_pagar.valor_centavos` tem de continuar igual ao
 * `split_item.valor_centavos` que o gerou. Editar aqui faria o extrato de
 * apuracao e o de quitacao discordarem sobre o mesmo repasse, sem que nenhum
 * dos dois parecesse errado.
 *
 * A ORIGEM tambem nao se muda: repontar uma conta paga para outro split_item
 * transferiria uma quitacao de um beneficiario para outro.
 */
CREATE OR REPLACE FUNCTION app.conta_de_split_e_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.origem_split_item_id IS NOT NULL THEN
    IF NEW.valor_centavos IS DISTINCT FROM OLD.valor_centavos THEN
      RAISE EXCEPTION
        'conta a pagar nascida de split tem valor IMUTAVEL (PRD 4.4). Conta %, % -> %',
        OLD.id, OLD.valor_centavos, NEW.valor_centavos USING ERRCODE = '23514';
    END IF;
    IF NEW.origem_split_item_id IS DISTINCT FROM OLD.origem_split_item_id THEN
      RAISE EXCEPTION
        'a origem de uma conta a pagar nao se repointa (conta %)', OLD.id
        USING ERRCODE = '23514';
    END IF;
    IF NEW.beneficiario_tipo IS DISTINCT FROM OLD.beneficiario_tipo
       OR NEW.dono_usina_id IS DISTINCT FROM OLD.dono_usina_id
       OR NEW.originador_id IS DISTINCT FROM OLD.originador_id THEN
      RAISE EXCEPTION
        'o beneficiario de uma conta nascida de split nao muda (conta %)', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER conta_pagar_de_split_imutavel
  BEFORE UPDATE ON conta_pagar
  FOR EACH ROW EXECUTE FUNCTION app.conta_de_split_e_imutavel();

-- ======================================================== 6. RLS
-- Regra 3: ENABLE + FORCE + ao menos uma policy, nas quatro.
ALTER TABLE categoria     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria     FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON categoria
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE centro_custo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE centro_custo  FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON centro_custo
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE conta_pagar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta_pagar   FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conta_pagar
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE pagamento     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamento     FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pagamento
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON categoria, centro_custo, conta_pagar TO app_financeiro;
GRANT SELECT, INSERT, UPDATE ON pagamento TO app_financeiro;

/*
 * DELETE revogado em `pagamento` e em `conta_pagar`, pelo mesmo argumento de
 * `conector_execucao` e `agenda_execucao`: o que nao se apaga aqui e a PROVA de
 * que alguem foi pago. Um pagamento apagavel por quem pagou nao e comprovante.
 *
 * O caminho de desfazer existe e e outro: cancelar a conta (que deixa
 * `cancelada_em` e trilha) ou lancar o estorno como fato proprio - o que a
 * Q-ESTORNO-01 ainda tem de decidir para a liquidacao, e vale igual aqui.
 *
 * A migration 2 concedeu DML em ALL TABLES por ALTER DEFAULT PRIVILEGES, entao
 * isto TEM que ser reimposto tabela a tabela.
 */
REVOKE DELETE ON pagamento   FROM app_financeiro;
REVOKE DELETE ON conta_pagar FROM app_financeiro;

-- ======================================================== 7. AUDITORIA
-- Invariante 17: escrita de dado de negocio grava auditoria (regra 9). As quatro
-- sao dado de negocio - a que mais e `pagamento`, que e dinheiro saindo.
CREATE TRIGGER auditar_categoria
  AFTER INSERT OR UPDATE OR DELETE ON categoria
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_centro_custo
  AFTER INSERT OR UPDATE OR DELETE ON centro_custo
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_conta_pagar
  AFTER INSERT OR UPDATE OR DELETE ON conta_pagar
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_pagamento
  AFTER INSERT OR UPDATE OR DELETE ON pagamento
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

-- ======================================================== 8. A CONFERENCIA
-- Mesma guarda das migrations 18 e 21: falha aqui em vez de deixar a tabela
-- negando tudo em silencio ate alguem reparar.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname IN ('categoria','centro_custo','conta_pagar','pagamento')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
