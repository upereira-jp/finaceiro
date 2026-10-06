-- Migration 44 — o chão da empresa.
--
-- DE ONDE ISTO VEM: em 06/10/2026 o dono pediu o controle máximo do que a EMPRESA
-- gasta — cartões sem expor número, gastos com pessoas, «tudo o que uma empresa
-- pode gastar» — e que nada da planilha `G3Solar_Financeiro.xlsx` ficasse de fora.
-- O plano é `PLANO-empresa-controle-total-2026-10-06.md`; as decisões, o QUESTOES
-- §2.y. Esta é a etapa 1: o que os cartões (etapa 2) e as pessoas (etapa 3) vão
-- precisar por baixo, e as lacunas da planilha que mudavam número.
--
-- O QUE NÃO MUDA: toda saída continua sendo uma `conta_pagar` quitada por
-- `pagamento`. Nenhuma tabela desta migration é um segundo jeito de sair dinheiro.
--
-- NADA É SEMEADO (Q-CONTAPAGAR-01 c): fornecedores, subcategorias e centros entram
-- pela tela.

-- ------------------------------------------------------------ fornecedor
--
-- Até aqui o «fornecedor / credor» da planilha era o texto livre de
-- `beneficiario_nome`: o mesmo aluguel com «Imobiliária X» num mês e «Imob. X» no
-- outro eram dois credores, e não havia onde guardar o documento, a chave Pix e o
-- plano de contas de costume. O documento é guardado NORMALIZADO (sem máscara, em
-- maiúsculas — o CNPJ alfanumérico existe desde 31/07/2026) e conferido pelo
-- dígito no repositório (`dominio/documento.ts`), como o do cliente.
CREATE TABLE fornecedor (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  nome                text NOT NULL,
  documento           text,
  documento_tipo      documento_tipo,
  contato             text,
  categoria_padrao_id uuid,
  centro_padrao_id    uuid,
  banco               text,
  agencia             text,
  conta               text,
  tipo_conta          tipo_conta_bancaria,
  chave_pix           text,
  tipo_chave_pix      tipo_chave_pix,
  observacao          text,
  ativo               boolean NOT NULL DEFAULT true,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedor_nome_nao_vazio CHECK (length(btrim(nome)) > 0),
  CONSTRAINT fornecedor_documento_coerente CHECK (
    (documento IS NULL) = (documento_tipo IS NULL)
    AND (documento IS NULL OR documento ~ '^[0-9A-Z]{11,14}$')),
  CONSTRAINT fornecedor_chave_pix_coerente CHECK ((chave_pix IS NULL) = (tipo_chave_pix IS NULL)),
  CONSTRAINT fornecedor_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fornecedor_categoria_fk FOREIGN KEY (tenant_id, categoria_padrao_id) REFERENCES categoria (tenant_id, id),
  CONSTRAINT fornecedor_centro_fk FOREIGN KEY (tenant_id, centro_padrao_id) REFERENCES centro_custo (tenant_id, id)
);

CREATE UNIQUE INDEX fornecedor_id_tenant ON fornecedor (tenant_id, id);
-- Índice CHEIO: documento nulo não colide (NULL é distinto no UNIQUE), e um índice
-- parcial aqui seria a armadilha da regra 11 sem necessidade.
CREATE UNIQUE INDEX fornecedor_documento_unico ON fornecedor (tenant_id, documento);

COMMENT ON TABLE fornecedor IS
  'A quem a empresa paga (o «fornecedor / credor» da planilha). Desativar, nunca apagar - ha despesa apontando para ele.';

-- ------------------------------------------------------------ a despesa ganha o fornecedor
ALTER TABLE conta_pagar
  ADD COLUMN fornecedor_id uuid,
  ADD CONSTRAINT conta_pagar_fornecedor_fk
    FOREIGN KEY (tenant_id, fornecedor_id) REFERENCES fornecedor (tenant_id, id),
  -- Repasse e comissão têm beneficiário próprio (dono, originador); a dívida com o
  -- sócio é dele. Fornecedor só na despesa lançada à mão.
  ADD CONSTRAINT conta_pagar_fornecedor_so_a_mao CHECK (
    fornecedor_id IS NULL OR (origem_split_item_id IS NULL AND reembolso_de_pagamento_id IS NULL));

CREATE INDEX conta_pagar_fornecedor_idx ON conta_pagar (tenant_id, fornecedor_id) WHERE fornecedor_id IS NOT NULL;

/*
 * O FORNECEDOR DEIXA DE SER OBRIGATÓRIO NA DESPESA À MÃO (lacuna 4 da auditoria de
 * 06/10): na planilha a coluna C é opcional, e o único lançamento real dela (o
 * aluguel) não tem fornecedor. O `outro` é sempre lançado à mão — o split só cria
 * dono_usina, originador e concessionaria —, então o nome deixa de ser exigido só
 * nele. A concessionária continua exigindo nome.
 */
ALTER TABLE conta_pagar DROP CONSTRAINT conta_pagar_beneficiario_coerente;
ALTER TABLE conta_pagar ADD CONSTRAINT conta_pagar_beneficiario_coerente CHECK (
  CASE beneficiario_tipo
    WHEN 'dono_usina'     THEN dono_usina_id IS NOT NULL AND originador_id IS NULL
    WHEN 'originador'     THEN originador_id IS NOT NULL AND dono_usina_id IS NULL
    WHEN 'concessionaria' THEN dono_usina_id IS NULL AND originador_id IS NULL
                               AND beneficiario_nome IS NOT NULL
    WHEN 'outro'          THEN dono_usina_id IS NULL AND originador_id IS NULL
  END
);

-- ------------------------------------------------------------ o plano de contas em dois níveis
--
-- Os 12 itens da planilha continuam sendo o 1º nível (o «grupo»); embaixo de cada
-- um entram subcategorias. DOIS níveis e não árvore: o Painel e a Projeção somam a
-- subcategoria no grupo, e três níveis não acrescentam pergunta nenhuma que a
-- empresa faça hoje.
--
-- A NATUREZA separa o que sai do caixa e é DESPESA do que sai e não é: investimento
-- (equipamento, construção de usina) e retirada de sócio (distribuição de lucro).
-- É do grupo — a subcategoria herda, e o gatilho abaixo garante.
CREATE TYPE natureza_da_categoria AS ENUM ('despesa', 'investimento', 'retirada_socio');

ALTER TABLE categoria
  ADD COLUMN pai_id   uuid,
  ADD COLUMN natureza natureza_da_categoria NOT NULL DEFAULT 'despesa',
  ADD CONSTRAINT categoria_pai_fk FOREIGN KEY (tenant_id, pai_id) REFERENCES categoria (tenant_id, id),
  ADD CONSTRAINT categoria_pai_nao_e_ela CHECK (pai_id IS NULL OR pai_id <> id);

CREATE INDEX categoria_pai_idx ON categoria (tenant_id, pai_id) WHERE pai_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.conferir_nivel_da_categoria() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE avo uuid; natureza_do_pai natureza_da_categoria;
BEGIN
  IF NEW.pai_id IS NOT NULL THEN
    SELECT c.pai_id, c.natureza INTO avo, natureza_do_pai
      FROM categoria c WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.pai_id;
    -- Grupo que não existe NESTE tenant: quem recusa é a FK composta, com o erro
    -- certo (23503). Seguir adiante copiaria uma natureza nula e o erro seria outro.
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF avo IS NOT NULL THEN
      RAISE EXCEPTION 'o plano de contas tem dois niveis: % ja e subcategoria e nao recebe subcategoria', NEW.pai_id
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM categoria f WHERE f.tenant_id = NEW.tenant_id AND f.pai_id = NEW.id) THEN
      RAISE EXCEPTION 'o plano de contas tem dois niveis: % tem subcategorias e nao vira subcategoria', NEW.id
        USING ERRCODE = '23514';
    END IF;
    NEW.natureza := natureza_do_pai;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER categoria_dois_niveis
  BEFORE INSERT OR UPDATE OF pai_id, natureza ON categoria
  FOR EACH ROW EXECUTE FUNCTION app.conferir_nivel_da_categoria();

-- O grupo muda de natureza → as subcategorias mudam junto.
CREATE OR REPLACE FUNCTION app.propagar_natureza_da_categoria() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.pai_id IS NULL AND NEW.natureza IS DISTINCT FROM OLD.natureza THEN
    UPDATE categoria SET natureza = NEW.natureza
     WHERE tenant_id = NEW.tenant_id AND pai_id = NEW.id AND natureza IS DISTINCT FROM NEW.natureza;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER categoria_natureza_desce
  AFTER UPDATE OF natureza ON categoria
  FOR EACH ROW EXECUTE FUNCTION app.propagar_natureza_da_categoria();

-- ------------------------------------------------------------ centro de custo
ALTER TABLE centro_custo ADD COLUMN ordem smallint NOT NULL DEFAULT 0;

-- ------------------------------------------------------------ a conta de onde sai o dinheiro
--
-- A origem do tipo conta bancária ganha banco, agência e o FINAL da conta — só os
-- 4 últimos dígitos, o bastante para a pessoa reconhecer a conta e nada que sirva
-- para movimentá-la. É a «conta de débito» que o cartão da etapa 2 vai apontar.
ALTER TABLE origem_pagamento
  ADD COLUMN banco       text,
  ADD COLUMN agencia     text,
  ADD COLUMN conta_final text,
  ADD CONSTRAINT origem_pagamento_conta_final_4_digitos CHECK (conta_final IS NULL OR conta_final ~ '^[0-9]{4}$'),
  ADD CONSTRAINT origem_pagamento_agencia_digitos CHECK (agencia IS NULL OR agencia ~ '^[0-9]{1,6}(-?[0-9Xx])?$'),
  ADD CONSTRAINT origem_pagamento_banco_so_em_conta CHECK (
    tipo = 'conta_bancaria' OR (banco IS NULL AND agencia IS NULL AND conta_final IS NULL));

-- ------------------------------------------------------------ o comprovante como arquivo
--
-- ADR-0009: o arquivo mora no PRÓPRIO Postgres, e não no Storage — a chave de
-- serviço do Supabase não está no ambiente, e aqui a RLS, a auditoria e a
-- transação vêm de graça. Duas tabelas, para a lista nunca carregar bytes:
--   `anexo_conteudo` — os bytes, um por sha256 no tenant (o mesmo PDF anexado a
--                      duas despesas é guardado uma vez), nunca alterado;
--   `anexo`          — o vínculo: a qual despesa, com que nome, quem mandou.
-- O tipo é decidido pelos BYTES, num gatilho — como a logo desde a migration 19.
CREATE TABLE anexo_conteudo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  sha256        text NOT NULL,
  tipo          text NOT NULL,
  tamanho_bytes int  NOT NULL,
  conteudo      bytea NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anexo_conteudo_sha256_hex CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT anexo_conteudo_tipo_aceito CHECK (tipo IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  -- 8 MB: o mesmo teto da leitura de fatura (`TETO_DO_ARQUIVO`). Um comprovante
  -- tem centenas de KB, e a imagem é reduzida no navegador antes de subir.
  CONSTRAINT anexo_conteudo_teto CHECK (tamanho_bytes BETWEEN 1 AND 8388608),
  CONSTRAINT anexo_conteudo_tamanho_confere CHECK (octet_length(conteudo) = tamanho_bytes),
  CONSTRAINT anexo_conteudo_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

CREATE UNIQUE INDEX anexo_conteudo_id_tenant ON anexo_conteudo (tenant_id, id);
CREATE UNIQUE INDEX anexo_conteudo_sha_unico ON anexo_conteudo (tenant_id, sha256);

CREATE OR REPLACE FUNCTION app.carimbar_anexo_conteudo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE cabeca bytea := substring(NEW.conteudo FROM 1 FOR 12);
BEGIN
  NEW.sha256 := encode(sha256(NEW.conteudo), 'hex');
  NEW.tamanho_bytes := octet_length(NEW.conteudo);
  NEW.tipo := CASE
    WHEN substring(cabeca FROM 1 FOR 5) = '\x255044462d'::bytea         THEN 'application/pdf'
    WHEN substring(cabeca FROM 1 FOR 8) = '\x89504e470d0a1a0a'::bytea   THEN 'image/png'
    WHEN substring(cabeca FROM 1 FOR 3) = '\xffd8ff'::bytea             THEN 'image/jpeg'
    WHEN substring(cabeca FROM 1 FOR 4) = '\x52494646'::bytea
     AND substring(cabeca FROM 9 FOR 4) = '\x57454250'::bytea           THEN 'image/webp'
    ELSE NULL
  END;
  IF NEW.tipo IS NULL THEN
    RAISE EXCEPTION 'o anexo nao e PDF, PNG, JPEG nem WEBP pelos primeiros bytes'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER anexo_conteudo_carimbo
  BEFORE INSERT ON anexo_conteudo
  FOR EACH ROW EXECUTE FUNCTION app.carimbar_anexo_conteudo();

CREATE TABLE anexo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  conteudo_id     uuid NOT NULL,
  -- O dono do anexo. Hoje só a despesa; a compra de cartão (etapa 2) e o reembolso
  -- (etapa 3) entram como colunas novas no `num_nonnulls` abaixo.
  conta_pagar_id  uuid,
  nome_arquivo    text NOT NULL,
  enviado_por     uuid DEFAULT app.current_usuario_id(),
  enviado_em      timestamptz NOT NULL DEFAULT now(),
  desvinculado_em  timestamptz,
  desvinculado_por uuid,
  CONSTRAINT anexo_um_dono CHECK (num_nonnulls(conta_pagar_id) = 1),
  CONSTRAINT anexo_nome_arquivo CHECK (length(btrim(nome_arquivo)) BETWEEN 1 AND 200),
  CONSTRAINT anexo_desvinculo_coerente CHECK (desvinculado_por IS NULL OR desvinculado_em IS NOT NULL),
  CONSTRAINT anexo_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT anexo_conteudo_fk FOREIGN KEY (tenant_id, conteudo_id) REFERENCES anexo_conteudo (tenant_id, id),
  CONSTRAINT anexo_conta_pagar_fk FOREIGN KEY (tenant_id, conta_pagar_id) REFERENCES conta_pagar (tenant_id, id)
);

CREATE UNIQUE INDEX anexo_id_tenant ON anexo (tenant_id, id);
CREATE INDEX anexo_conta_pagar_idx ON anexo (tenant_id, conta_pagar_id) WHERE conta_pagar_id IS NOT NULL;

COMMENT ON TABLE anexo IS
  'O comprovante de uma despesa (nota, recibo, boleto pago). Nunca se apaga: desvincular marca desvinculado_em e o arquivo continua no historico.';
COMMENT ON TABLE anexo_conteudo IS
  'Os bytes de um anexo, um por sha256 no tenant. Nunca se altera nem se apaga. ADR-0009.';

-- ------------------------------------------------------------ desfazer uma baixa (o estorno)
--
-- Na planilha, desfazer uma baixa era apagar «data de pagamento» e «valor pago». Aqui
-- o pagamento é prova de dinheiro e não se apaga (`DELETE` revogado desde a 22): o
-- estorno MARCA o pagamento, e o gatilho de recálculo deixa de somá-lo. A despesa
-- volta a aberta (ou parcial), e a baixa errada continua no histórico.
--
-- SÓ A DESPESA À MÃO. Estornar a baixa de um repasse ou de uma comissão toca o split
-- e a receita da competência — é a Q-ESTORNO-01, que continua aberta e com o dono.
ALTER TABLE pagamento
  ADD COLUMN estornado_em   timestamptz,
  ADD COLUMN estornado_por  uuid,
  ADD COLUMN motivo_estorno text,
  ADD CONSTRAINT pagamento_estorno_coerente CHECK (
    (estornado_em IS NULL) = (motivo_estorno IS NULL)
    AND (motivo_estorno IS NULL OR length(btrim(motivo_estorno)) > 0)
    AND (estornado_por IS NULL OR estornado_em IS NOT NULL));

/*
 * A REFERÊNCIA DA BAIXA ESTORNADA FICA LIVRE. O caso real: a baixa entrou com a
 * data errada, é estornada e lançada de novo com o MESMO end-to-end do Pix. O
 * índice antigo recusaria a segunda. A regra 11 e a CAT-9 proíbem um parcial com
 * predicado que não seja `IS NOT NULL` — então a referência «viva» é uma coluna
 * GERADA, e o índice é sobre ela.
 */
ALTER TABLE pagamento
  ADD COLUMN referencia_viva text GENERATED ALWAYS AS (
    CASE WHEN estornado_em IS NULL THEN referencia_externa END) STORED;
DROP INDEX pagamento_referencia_unica;
CREATE UNIQUE INDEX pagamento_referencia_unica ON pagamento (tenant_id, referencia_viva)
  WHERE referencia_viva IS NOT NULL;

CREATE OR REPLACE FUNCTION app.guardar_estorno() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE do_split boolean; divida_paga int;
BEGIN
  IF OLD.estornado_em IS NOT NULL THEN
    RAISE EXCEPTION 'pagamento estornado e definitivo e nao muda mais (pagamento %)', OLD.id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.estornado_em IS NULL THEN RETURN NEW; END IF;

  -- O estorno só marca: nada mais da baixa muda junto.
  IF (NEW.conta_pagar_id, NEW.data_pagamento, NEW.valor_centavos, NEW.forma, NEW.acrescimo_centavos,
      NEW.desconto_centavos, NEW.origem_pagamento_id, NEW.referencia_externa)
     IS DISTINCT FROM
     (OLD.conta_pagar_id, OLD.data_pagamento, OLD.valor_centavos, OLD.forma, OLD.acrescimo_centavos,
      OLD.desconto_centavos, OLD.origem_pagamento_id, OLD.referencia_externa) THEN
    RAISE EXCEPTION 'o estorno marca o pagamento e nao muda a baixa (pagamento %)', OLD.id
      USING ERRCODE = '23514';
  END IF;

  SELECT c.origem_split_item_id IS NOT NULL INTO do_split
    FROM conta_pagar c WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.conta_pagar_id;
  IF do_split THEN
    RAISE EXCEPTION 'baixa de repasse ou comissao nao se estorna aqui: toca o split (Q-ESTORNO-01)'
      USING ERRCODE = '23514';
  END IF;

  -- A dívida com o sócio que nasceu desta baixa (Q-SOCIOS-01): se ela já foi paga,
  -- desfazer a baixa deixaria a empresa tendo pago ao sócio por nada; se está em
  -- aberto, ela some junto (cancelada, não apagada).
  SELECT coalesce(sum(r.valor_pago_centavos), 0) INTO divida_paga
    FROM conta_pagar r WHERE r.tenant_id = NEW.tenant_id AND r.reembolso_de_pagamento_id = NEW.id
     AND r.status <> 'cancelada';
  IF divida_paga > 0 THEN
    RAISE EXCEPTION 'esta baixa saiu do bolso de um socio e a empresa ja o reembolsou: estorne o reembolso antes (pagamento %)', OLD.id
      USING ERRCODE = '23514';
  END IF;
  UPDATE conta_pagar SET status = 'cancelada', cancelada_em = now()
   WHERE tenant_id = NEW.tenant_id AND reembolso_de_pagamento_id = NEW.id AND status = 'aberta';

  NEW.estornado_por := coalesce(NEW.estornado_por, app.current_usuario_id());
  RETURN NEW;
END $$;

CREATE TRIGGER pagamento_estorno
  BEFORE UPDATE ON pagamento
  FOR EACH ROW EXECUTE FUNCTION app.guardar_estorno();

-- O recálculo da 22, com UMA linha a mais: o pagamento estornado não soma.
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
   WHERE p.tenant_id = alvo_tenant AND p.conta_pagar_id = alvo_conta
     AND p.estornado_em IS NULL;

  SELECT c.valor_centavos, c.status INTO devido, estado
    FROM conta_pagar c
   WHERE c.tenant_id = alvo_tenant AND c.id = alvo_conta;

  IF estado = 'cancelada' AND TG_OP <> 'DELETE' THEN
    RAISE EXCEPTION 'conta a pagar cancelada nao recebe pagamento (conta %)', alvo_conta
      USING ERRCODE = '23514';
  END IF;

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
  'Deriva valor_pago_centavos e status da SOMA dos pagamentos NAO ESTORNADOS. Recalcula do '
  'zero em vez de somar delta: delta acumula erro se qualquer caminho errar uma '
  'vez, e recalcular converge sempre. O CHECK conta_pagar_nao_paga_demais e '
  'quem recusa o pagamento a mais - esta funcao so escreve, e a escrita falha.';

-- ------------------------------------------------------------ o nº do lançamento
--
-- A coluna A da planilha («Nº LANÇ.»): o número com que se fala de um título («o 37
-- está pago?»). Sequencial POR TENANT, só na despesa à mão — repasse e comissão têm
-- a fatura de origem como referência. Atribuído pelo banco, sob um lock por tenant
-- (dois lançamentos ao mesmo tempo não pegam o mesmo número), e imutável.
ALTER TABLE conta_pagar ADD COLUMN numero int;

UPDATE conta_pagar c SET numero = n.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY criado_em, id) AS rn
          FROM conta_pagar WHERE origem_split_item_id IS NULL) n
 WHERE c.id = n.id;

ALTER TABLE conta_pagar
  ADD CONSTRAINT conta_pagar_numero_so_a_mao CHECK ((numero IS NULL) = (origem_split_item_id IS NOT NULL)),
  ADD CONSTRAINT conta_pagar_numero_positivo CHECK (numero IS NULL OR numero > 0);

CREATE UNIQUE INDEX conta_pagar_numero_unico ON conta_pagar (tenant_id, numero);

CREATE OR REPLACE FUNCTION app.numerar_lancamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.numero IS DISTINCT FROM OLD.numero THEN
      RAISE EXCEPTION 'o numero do lancamento nao muda (conta %)', OLD.id USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.origem_split_item_id IS NOT NULL THEN
    NEW.numero := NULL;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('conta_pagar.numero:' || NEW.tenant_id::text, 0));
  SELECT coalesce(max(c.numero), 0) + 1 INTO NEW.numero
    FROM conta_pagar c WHERE c.tenant_id = NEW.tenant_id;
  RETURN NEW;
END $$;

CREATE TRIGGER conta_pagar_numero
  BEFORE INSERT OR UPDATE OF numero ON conta_pagar
  FOR EACH ROW EXECUTE FUNCTION app.numerar_lancamento();

-- ------------------------------------------------------------ RLS, grants, trilha
ALTER TABLE fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedor FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fornecedor
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE anexo_conteudo ENABLE ROW LEVEL SECURITY;
ALTER TABLE anexo_conteudo FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON anexo_conteudo
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE anexo ENABLE ROW LEVEL SECURITY;
ALTER TABLE anexo FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON anexo
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON fornecedor TO app_financeiro;
REVOKE DELETE ON fornecedor FROM app_financeiro;
-- Os bytes: só entram e são lidos. Nem UPDATE nem DELETE.
GRANT SELECT, INSERT ON anexo_conteudo TO app_financeiro;
REVOKE UPDATE, DELETE ON anexo_conteudo FROM app_financeiro;
-- O vínculo: entra, e a única mudança é desvincular. O REVOKE do UPDATE inteiro vem
-- ANTES do grant por coluna: o privilégio padrão do schema (`arwd` para
-- app_financeiro) já concede UPDATE na tabela toda, e o grant por coluna sozinho
-- não tiraria nada — foi o que o D16 pegou na primeira rodada.
REVOKE UPDATE, DELETE ON anexo FROM app_financeiro;
GRANT SELECT, INSERT ON anexo TO app_financeiro;
GRANT UPDATE (desvinculado_em, desvinculado_por) ON anexo TO app_financeiro;

CREATE TRIGGER auditar_fornecedor
  AFTER INSERT OR UPDATE OR DELETE ON fornecedor
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_anexo
  AFTER INSERT OR UPDATE OR DELETE ON anexo
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

/*
 * OS BYTES NÃO VÃO PARA A TRILHA. `to_jsonb` de bytea ocupa o dobro (medido na logo,
 * 30/07): um comprovante de 2 MB poria 4 MB na `auditoria` a cada anexo. A trilha
 * grava a linha SEM a coluna `conteudo` — o sha256, o tipo e o tamanho continuam lá,
 * e o sha256 identifica o arquivo sem guardá-lo. É a segunda entrada da lista branca
 * do 17-b (`tests/auditoria.sql`), com o mecanismo nomeado ao lado, e o D16e de
 * `tests/despesas.sql` prova que a linha chega à trilha sem os bytes.
 */
CREATE OR REPLACE FUNCTION app.auditar_sem_conteudo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE v_antes jsonb; v_depois jsonb; v_tenant uuid; v_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_antes  := to_jsonb(OLD) - 'conteudo'; END IF;
  IF TG_OP <> 'DELETE' THEN v_depois := to_jsonb(NEW) - 'conteudo'; END IF;
  v_tenant := coalesce((v_depois->>'tenant_id')::uuid, (v_antes->>'tenant_id')::uuid);
  v_id     := coalesce(v_depois->>'id', v_antes->>'id');
  INSERT INTO public.auditoria
    (tenant_id, tabela, registro_id, operacao, usuario_id, tier, antes, depois)
  VALUES
    (v_tenant, TG_TABLE_NAME, v_id, left(TG_OP,1),
     app.current_usuario_id(), app.current_tier(), v_antes, v_depois);
  RETURN NULL;
END $$;

ALTER FUNCTION app.auditar_sem_conteudo() OWNER TO auditor_financeiro;
REVOKE ALL ON FUNCTION app.auditar_sem_conteudo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auditar_sem_conteudo() TO app_financeiro;

CREATE TRIGGER auditar_anexo_conteudo
  AFTER INSERT OR UPDATE OR DELETE ON anexo_conteudo
  FOR EACH ROW EXECUTE FUNCTION app.auditar_sem_conteudo();

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname IN ('fornecedor', 'anexo', 'anexo_conteudo')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
