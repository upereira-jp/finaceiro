-- SPEC-001 R2, R9 e Q-SPEC001-04 - migration 10: AUDITORIA, REPASSE E OS QUATRO FUROS
--
-- Fecha, em ordem de gravidade:
--   1. autopromocao a plataforma_admin  (policy FOR ALL sem WITH CHECK)
--   2. trilha da R2 desligavel pelo GUC (o gatilho lia app.tier no COMMIT)
--   3. gatilho de trilha em 4 das 13    (dono_usina e originador guardam a chave PIX)
--   4. regra 9 sem implementacao        (nao havia "antes e depois" em lugar nenhum)
-- e resolve a Q-SPEC001-04, que decidia se sao 7 ou 8 repositorios.
--
-- MUDANCA DE SEMANTICA DA R2, que exige edicao da SPEC-001 e nao e silenciosa:
-- a R2 deixa de COBRAR trilha e passa a GRAVAR auditoria. O que era
-- "existe linha de log?" conferido no commit contra uma variavel de sessao vira
-- "a escrita gravou linha, no mesmo comando, com o tier que valia na escrita".
-- A cobranca de acesso_plataforma_log continua existindo - agora ancorada no
-- fato gravado, nao no GUC.

-- ============================================================ 1. REPASSE (Q-SPEC001-04)
/*
 * DECISAO: o percentual de repasse e VERSIONADO POR USINA, nao coluna mutavel.
 *
 * O PRD se contradizia: 182 declara regra_split versionada "nunca editada no
 * lugar"; 205 calcula com percentual_repasse_usina; e o schema embarcou
 * usina.percentual_repasse DEFAULT 70.00. Tres lugares, duas verdades.
 *
 * O eixo de tempo do repasse e a COMPETENCIA, nao o fechamento do contrato: o
 * contrato e com o consumidor, o repasse e com o dono da usina, e sao duas
 * contrapartes com datas proprias. Congelar no contrato - como a R20-b fez com
 * o tier do originador - seria errado aqui: contrato fechado em marco nao fixa
 * o que se deve ao dono da usina em novembro.
 *
 * Manter na usina era o furo da R20 com outro nome: renegociar 70 para 65 hoje
 * reprecificava todo repasse ja pago.
 */
CREATE TABLE regra_repasse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  usina_id        uuid NOT NULL,
  percentual      numeric(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  vigencia_inicio date NOT NULL,
  vigencia_fim    date,
  CONSTRAINT regra_repasse_vigencia_coerente CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio),
  CONSTRAINT regra_repasse_id_tenant UNIQUE (tenant_id, id),
  -- FK COMPOSTA 10 de 10. A SPEC-001 3.4 passa de nove para dez.
  CONSTRAINT regra_repasse_usina_fk FOREIGN KEY (tenant_id, usina_id)
    REFERENCES usina (tenant_id, id),
  CONSTRAINT regra_repasse_sem_sobreposicao EXCLUDE USING gist (
    tenant_id WITH =,
    usina_id  WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
  )
);

-- Backfill ANTES de habilitar a RLS, de proposito: depois do FORCE, um INSERT
-- sem contexto de tenant so passaria se o dono tivesse BYPASSRLS - e depender
-- disso e o que a asserção de boot da secao 7 proibe.
INSERT INTO regra_repasse (tenant_id, usina_id, percentual, vigencia_inicio)
SELECT u.tenant_id, u.id, u.percentual_repasse, '-infinity'::date
FROM usina u;

ALTER TABLE regra_repasse ENABLE ROW LEVEL SECURITY;
ALTER TABLE regra_repasse FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON regra_repasse
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

-- A coluna sai. Duas verdades e o defeito, nao a redundancia.
ALTER TABLE usina DROP COLUMN percentual_repasse;

/*
 * Sem LIMIT 1 e sem ORDER BY de proposito: a garantia de linha unica e o
 * EXCLUDE acima, nao a clausula da consulta. Foi o que apontamos no VIEWS-
 * PROPOSTAS-r2 92 do dev do CRM, e vale para dentro tambem.
 *
 * Ausencia LEVANTA. Devolver NULL faria a base de repasse virar NULL, que soma
 * como nada e coalesce como zero - o modo de falha silenciosa que este projeto
 * persegue na RLS, dentro da funcao que calcula dinheiro.
 */
CREATE OR REPLACE FUNCTION app.percentual_repasse(p_usina_id uuid, p_competencia date)
  RETURNS numeric LANGUAGE plpgsql STABLE AS
$$
DECLARE v numeric;
BEGIN
  SELECT rr.percentual INTO v
  FROM public.regra_repasse rr
  WHERE rr.tenant_id = app.current_tenant_id()
    AND rr.usina_id  = p_usina_id
    AND daterange(rr.vigencia_inicio, rr.vigencia_fim, '[)') @> p_competencia;

  IF v IS NULL THEN
    RAISE EXCEPTION 'sem regra_repasse vigente para usina % na competencia %',
      p_usina_id, p_competencia USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END $$;

COMMENT ON FUNCTION app.percentual_repasse(uuid, date) IS
  'Q-SPEC001-04. Percentual de repasse vigente na COMPETENCIA, nunca o corrente '
  'da usina. Levanta no_data_found quando nao ha regra: ausencia de preco e erro, '
  'nao zero.';

-- ============================================================ 2. AUDITORIA (regra 9)
/*
 * A regra 9 exige quem, quando, o que, ANTES E DEPOIS. Nao havia tabela nenhuma:
 * acesso_plataforma_log e trilha de ACESSO (quem olhou), nao auditoria (o que
 * mudou) - nao carrega imagem de linha.
 *
 * O desenho INVERTE o anterior: em vez de CONFERIR trilha no commit, GRAVA na
 * escrita. Nao ha GUC para desligar, porque o gatilho escreve em vez de conferir.
 *
 * Dono proprio (auditor_financeiro) e nao o dono das tabelas de negocio: e o que
 * permite append-only de verdade sob FORCE RLS, sem depender de BYPASSRLS.
 */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditor_financeiro') THEN
    CREATE ROLE auditor_financeiro NOLOGIN;
  END IF;
END $$;

/*
 * OBRIGATORIO sob dono nao-superusuario, que e o caso do Supabase: sem isto a
 * migration morre no ALTER FUNCTION ... OWNER TO com "must be able to SET ROLE".
 * No PostgreSQL 16 quem cria uma role recebe ADMIN OPTION mas NAO recebe SET.
 * Nao afrouxa nada: o dono da migration ja pode dropar tabela e desabilitar
 * trigger. O append-only protege contra app_financeiro, a role de RUNTIME.
 */
GRANT auditor_financeiro TO CURRENT_USER WITH SET TRUE;

CREATE TABLE auditoria (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- SEM FK para tenant, de proposito: a auditoria tem que sobreviver ao
  -- encerramento do tenant. Mesmo raciocinio do lead_merges do dev do CRM,
  -- criado sem FK para leads para a trilha sobreviver a DELETE fisico.
  -- NULLABLE de proposito: entidade de PLATAFORMA (tenant, usuario,
  -- plataforma_admin) nao tem tenant. NULL = escrita de plataforma, e a regra 9
  -- nomeia "papel" - conceder tier e a escrita mais privilegiada do sistema.
  tenant_id   uuid,
  tabela      text NOT NULL,
  registro_id text,
  operacao    char(1) NOT NULL CHECK (operacao IN ('I','U','D')),
  usuario_id  uuid,           -- NULL = escrita sem contexto (migration, seed, DBA). E informacao.
  tier        text,           -- capturado NA ESCRITA. E o que torna a R2 nao-burlavel.
  xact_id     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  ocorrido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  antes       jsonb,
  depois      jsonb
);
/*
 * A TABELA NAO TROCA DE DONO. Posse nunca foi necessaria: append-only se
 * sustenta em FORCE RLS, na policy de INSERT restrita a auditor_financeiro e na
 * ausencia de UPDATE/DELETE para app_financeiro. Quem precisa ser
 * auditor_financeiro e a FUNCAO, por ser SECURITY DEFINER, nao a tabela.
 */
CREATE INDEX auditoria_tenant_idx  ON auditoria (tenant_id, ocorrido_em DESC);
CREATE INDEX auditoria_registro_idx ON auditoria (tabela, registro_id);
CREATE INDEX auditoria_xact_idx    ON auditoria (xact_id);

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;

-- Leitura: quem pertence ao tenant le a propria auditoria. Mesma forma das treze.
CREATE POLICY auditoria_leitura ON auditoria
  FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

-- Auditoria de entidade de plataforma (tenant_id NULL) nao pertence a tenant
-- nenhum: so tier a le.
CREATE POLICY auditoria_leitura_plataforma ON auditoria
  FOR SELECT
  USING (tenant_id IS NULL AND app.current_tier() IS NOT NULL);

-- Escrita: SO o gatilho, que roda como auditor_financeiro.
CREATE POLICY auditoria_escrita_do_gatilho ON auditoria
  FOR INSERT TO auditor_financeiro
  WITH CHECK (true);

/*
 * ATENCAO - pegadinha da migration 2: ela rodou
 *   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ... TO app_financeiro
 * o que concede DML em TODA tabela futura do schema. Append-only nao e o padrao:
 * tem que ser reimposto, tabela por tabela. Sem o REVOKE abaixo, a auditoria
 * nasceria apagavel por quem ela audita.
 */
REVOKE ALL ON auditoria FROM app_financeiro;
GRANT SELECT ON auditoria TO app_financeiro;

-- O gatilho escreve como auditor_financeiro: INSERT explicito, e so INSERT.
GRANT INSERT ON auditoria TO auditor_financeiro;

-- CREATE, e nao so USAGE: para ser DONA de uma funcao em `app`, a role precisa
-- de CREATE no schema que a contem.
GRANT USAGE, CREATE ON SCHEMA app TO auditor_financeiro;
GRANT USAGE ON SCHEMA public TO auditor_financeiro;

CREATE OR REPLACE FUNCTION app.auditar() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
DECLARE v_antes jsonb; v_depois jsonb; v_tenant uuid; v_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_antes  := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_depois := to_jsonb(NEW); END IF;

  v_tenant := coalesce((v_depois->>'tenant_id')::uuid, (v_antes->>'tenant_id')::uuid);
  v_id     := coalesce(v_depois->>'id', v_antes->>'id',
                       v_depois->>'cliente_id', v_antes->>'cliente_id');

  INSERT INTO public.auditoria
    (tenant_id, tabela, registro_id, operacao, usuario_id, tier, antes, depois)
  VALUES
    (v_tenant, TG_TABLE_NAME, v_id, left(TG_OP,1),
     app.current_usuario_id(), app.current_tier(), v_antes, v_depois);
  RETURN NULL;
END $$;

ALTER FUNCTION app.auditar() OWNER TO auditor_financeiro;
REVOKE ALL ON FUNCTION app.auditar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auditar() TO app_financeiro;

COMMENT ON FUNCTION app.auditar() IS
  'Regra 9. Grava antes e depois na propria escrita. SECURITY DEFINER como '
  'auditor_financeiro: e o que permite append-only sob FORCE RLS sem BYPASSRLS.';

-- As dezesseis: as treze com tenant_id, mais regra_repasse, mais as tres de
-- plataforma - que nao tem tenant_id mas guardam PAPEL, e a regra 9 nomeia papel.
-- auditoria e acesso_plataforma_log ficam fora: log nao se audita, se torna
-- imutavel (secao 5).
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'usuario_tenant','conector_crm',
    'cliente','cliente_estado_crm','unidade_consumidora',
    'usina','usina_geracao','dono_usina','originador','contrato',
    'regra_comissao','tarifa','regra_repasse',
    'tenant','usuario','plataforma_admin'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format($f$
      CREATE TRIGGER auditar_%s
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION app.auditar()
    $f$, t, t);
  END LOOP;
END $$;

-- ============================================================ 3. A R2 REANCORADA
/*
 * FURO MEDIDO: o gatilho da migration 7 comecava com
 *   IF app.current_tier() IS NULL THEN RETURN NULL;
 * e e DEFERRABLE INITIALLY DEFERRED - le o GUC no COMMIT, nao na escrita.
 * Quem escreve controla o GUC. Medido: tier de plataforma, UPDATE em cliente,
 * set_config('app.tier','',true) antes do commit -> commitou, zero trilha.
 *
 * Some-se a isso o xmin: linha inserida em subtransacao (bloco EXCEPTION,
 * savepoint) tem xmin de subxid, e a conferencia falharia FECHADO, abortando
 * escrita legitima.
 *
 * Reancoragem: o fato "esta escrita foi sob tier" passa a viver na linha de
 * auditoria, gravada NA ESCRITA e nao apagavel. E a conferencia usa xact_id
 * explicito, nao xmin.
 */
ALTER TABLE acesso_plataforma_log
  ADD COLUMN xact_id xid8 DEFAULT pg_current_xact_id();
ALTER TABLE acesso_plataforma_log ALTER COLUMN xact_id SET NOT NULL;

CREATE OR REPLACE FUNCTION app.exigir_trilha_de_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
BEGIN
  -- NEW e a linha de auditoria. NEW.tier foi capturado na escrita: nao ha GUC
  -- para desligar aqui. SECURITY DEFINER para que a conferencia seja factual e
  -- nao dependa do contexto ainda estar valido no commit.
  IF NOT EXISTS (
    SELECT 1 FROM public.acesso_plataforma_log l
    WHERE l.xact_id    = NEW.xact_id
      AND l.usuario_id = NEW.usuario_id
      AND l.tenant_id  = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION
      'R2: escrita em % sob tier % sem trilha NESTA transacao', NEW.tabela, NEW.tier
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END $$;

ALTER FUNCTION app.exigir_trilha_de_plataforma() OWNER TO auditor_financeiro;
-- O definer precisa LER o log que ele confere. Sem isto a conferencia falha
-- fechada e aborta escrita LEGITIMA de plataforma - falso positivo, nao furo,
-- mas quebra o caminho do abrirComoPlataforma().
GRANT SELECT ON acesso_plataforma_log TO auditor_financeiro;
GRANT EXECUTE ON FUNCTION app.tem_vinculo_no_tenant() TO auditor_financeiro;
-- E precisa ver o log INTEIRO, nao o filtrado pelo contexto: a conferencia e
-- factual (xact_id), e nao pode depender de o GUC ainda estar valido no commit -
-- que e justamente o que o atacante apaga.
CREATE POLICY log_leitura_do_auditor ON acesso_plataforma_log
  FOR SELECT TO auditor_financeiro USING (true);

/*
 * UM gatilho, nao treze. Como toda escrita de negocio agora produz linha de
 * auditoria, a constraint em auditoria cobre as quatorze tabelas de uma vez.
 * O WHEN de constraint trigger NAO e deferido - e avaliado logo apos a escrita,
 * que e exatamente onde o tier ainda e o verdadeiro.
 */
DROP TRIGGER IF EXISTS exigir_trilha_cliente        ON cliente;
DROP TRIGGER IF EXISTS exigir_trilha_contrato       ON contrato;
DROP TRIGGER IF EXISTS exigir_trilha_regra_comissao ON regra_comissao;
DROP TRIGGER IF EXISTS exigir_trilha_tarifa         ON tarifa;

CREATE CONSTRAINT TRIGGER exigir_trilha_de_plataforma
  AFTER INSERT ON auditoria
  DEFERRABLE INITIALLY DEFERRED
  -- tenant_id NOT NULL na condicao: a R2 fala de acesso de plataforma a DADO DE
  -- TENANT. Provisionar usuario ou conceder tier e dado de plataforma - e
  -- auditado, mas nao exige trilha de travessia de fronteira de cliente.
  FOR EACH ROW WHEN (NEW.tier IS NOT NULL AND NEW.tenant_id IS NOT NULL)
  EXECUTE FUNCTION app.exigir_trilha_de_plataforma();

-- ============================================================ 4. AUTOPROMOCAO
/*
 * FURO MEDIDO: policy FOR ALL sem WITH CHECK usa o USING como check de ESCRITA.
 *   CREATE POLICY plataforma_admin_self ON plataforma_admin
 *     USING (usuario_id = app.current_usuario_id());
 * Com o INSERT que a migration 2 concedeu em ALL TABLES, um usuario de papel
 * 'leitura' fazia:
 *   INSERT INTO plataforma_admin VALUES (app.current_usuario_id(), 'plataforma_admin')
 * e passava. Depois, com o tier valendo, tem_vinculo_no_tenant() devolve true
 * para qualquer tenant. Medido: leu cliente de outro tenant sem vinculo.
 *
 * A policy confere identidade e nao autoridade - o desenho do furo 1.1 outra vez.
 */
DROP POLICY plataforma_admin_self ON plataforma_admin;
CREATE POLICY plataforma_admin_self ON plataforma_admin
  FOR SELECT USING (usuario_id = app.current_usuario_id());

-- Conceder tier e caminho de operacao, nunca da aplicacao.
REVOKE INSERT, UPDATE, DELETE ON plataforma_admin FROM app_financeiro;

-- Mesma classe em usuario: o WITH CHECK existia, mas deixava a pessoa reescrever
-- o proprio auth_user_id, que e a chave do login.
DROP POLICY usuario_self_ou_membro ON usuario;
CREATE POLICY usuario_self_ou_membro ON usuario
  FOR SELECT
  USING (id = app.current_usuario_id() OR id IN (SELECT app.membros_do_tenant()));

-- ============================================================ 5. LOG IMUTAVEL
/*
 * FURO MEDIDO: a migration 2 concedeu UPDATE e DELETE em ALL TABLES, e a policy
 * pos-migration 6 exige tenant + vinculo, que o tier satisfaz. Medido: DELETE
 * das proprias linhas de acesso_plataforma_log passou. Log apagavel por quem
 * foi auditado nao e log.
 */
REVOKE UPDATE, DELETE ON acesso_plataforma_log FROM app_financeiro;

-- ============================================================ 6. PRECO QUE FALHA ALTO
/*
 * FURO MEDIDO: tarifa_vigente devolvia NULL na ausencia, e
 * consumo_centavos(1234.567, NULL) devolve NULL. Base de faturamento NULL soma
 * como nada e coalesce como zero.
 *
 * E a chave do lookup era texto livre em tres tabelas: 'Equatorial' na seed,
 * 'Equatorial GO' digitado numa UC, e aquela UC fatura NULL. O custo de nao ter
 * tabela de distribuidora nunca foi "zero enquanto for uma" - o custo e o
 * primeiro erro de digitacao.
 */
CREATE TABLE distribuidora (
  nome  text PRIMARY KEY,
  ativa boolean NOT NULL DEFAULT true
);
-- Sem tenant_id e sem RLS: lista de referencia publica, nao dado de negocio.
-- Por isso as FKs abaixo NAO sao compostas, e a regra 2 continua valendo -
-- ela fala de referencia entre entidades DE NEGOCIO.
INSERT INTO distribuidora (nome)
SELECT DISTINCT d FROM (
  SELECT distribuidora FROM tarifa
  UNION SELECT distribuidora FROM usina
  UNION SELECT distribuidora FROM unidade_consumidora
) s(d) WHERE d IS NOT NULL
ON CONFLICT DO NOTHING;

/*
 * A distribuidora real da operacao hoje. Semear aqui e nao na seed porque as
 * FKs abaixo dependem dela existir num banco limpo.
 *
 * A seed ja tinha NOMEADO este risco e escolhido conviver com ele: "enquanto
 * for uma, o custo de nao ter e zero; na segunda, vira Q-SPEC001 nova em vez de
 * virar string divergente ('Equatorial' vs 'EQUATORIAL GO' vs 'Equatorial
 * Goias')". O erro do raciocinio nao e a segunda distribuidora - e a primeira
 * digitacao divergente da primeira. Com texto livre, 'Equatorial GO' numa UC e
 * outra concessionaria, sem tarifa, e a UC fatura NULL. A FK abaixo transforma
 * o risco aceito em impossibilidade.
 */
INSERT INTO distribuidora (nome) VALUES ('Equatorial') ON CONFLICT DO NOTHING;

GRANT SELECT ON distribuidora TO app_financeiro;

ALTER TABLE tarifa              ADD CONSTRAINT tarifa_distribuidora_fk
  FOREIGN KEY (distribuidora) REFERENCES distribuidora (nome);
ALTER TABLE usina               ADD CONSTRAINT usina_distribuidora_fk
  FOREIGN KEY (distribuidora) REFERENCES distribuidora (nome);
ALTER TABLE unidade_consumidora ADD CONSTRAINT uc_distribuidora_fk
  FOREIGN KEY (distribuidora) REFERENCES distribuidora (nome);

CREATE OR REPLACE FUNCTION app.tarifa_vigente(p_distribuidora text, p_competencia date)
  RETURNS numeric LANGUAGE plpgsql STABLE AS
$$
DECLARE v numeric;
BEGIN
  SELECT t.tarifa_reais_por_kwh INTO v
  FROM public.tarifa t
  WHERE t.tenant_id = app.current_tenant_id()
    AND t.distribuidora = p_distribuidora
    AND daterange(t.vigencia_inicio, t.vigencia_fim, '[)') @> p_competencia;
  IF v IS NULL THEN
    RAISE EXCEPTION 'sem tarifa vigente para % na competencia %', p_distribuidora, p_competencia
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION app.percentual_comissao(p_tier originador_tipo, p_data_fechamento date)
  RETURNS numeric LANGUAGE plpgsql STABLE AS
$$
DECLARE v numeric;
BEGIN
  SELECT r.percentual INTO v
  FROM public.regra_comissao r
  WHERE r.tenant_id = app.current_tenant_id()
    AND r.originador_tipo = p_tier
    AND daterange(r.vigencia_inicio, r.vigencia_fim, '[)') @> p_data_fechamento;
  IF v IS NULL THEN
    RAISE EXCEPTION 'sem regra_comissao vigente para tier % em %', p_tier, p_data_fechamento
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION app.tarifa_vigente(text, date),
                          app.percentual_comissao(originador_tipo, date),
                          app.percentual_repasse(uuid, date) TO app_financeiro;

/*
 * MESMA ARMADILHA, herdada da migration 2: sob dono nao-superusuario o criador
 * de app_financeiro tambem nao ganha SET nessa role, e o "SET LOCAL ROLE
 * app_financeiro" das quatro suites nao roda contra um banco Supabase.
 */
GRANT app_financeiro TO CURRENT_USER WITH SET TRUE;

-- ============================================================ 7. INVARIANTES DE CATALOGO
-- Nao valem por revisao de PR. Rodam aqui e no CI.
DO $$
DECLARE m text;
BEGIN
  -- 16: policy FOR ALL sem WITH CHECK em tabela com grant de escrita.
  -- E a classe do furo da autopromocao, nao o caso.
  SELECT string_agg(format('%s.%s', c.relname, p.polname), ', ') INTO m
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE p.polcmd = '*' AND p.polwithcheck IS NULL
    AND has_table_privilege('app_financeiro', c.oid, 'INSERT');
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'inv.16 policy FOR ALL sem WITH CHECK em tabela gravavel: %', m;
  END IF;

  -- 17: toda tabela de negocio OU de papel tem gatilho de auditoria.
  SELECT string_agg(c.relname, ', ') INTO m
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
                   AND a.attname = 'tenant_id' AND a.attnum > 0)
         OR c.relname IN ('tenant','usuario','plataforma_admin'))
    AND c.relname NOT IN ('auditoria','acesso_plataforma_log')
    AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = c.oid AND t.tgname LIKE 'auditar_%');
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'inv.17 sem gatilho de auditoria: %', m;
  END IF;

  -- 18: auditoria e acesso_plataforma_log sao append-only para a aplicacao.
  IF has_table_privilege('app_financeiro','auditoria','UPDATE')
     OR has_table_privilege('app_financeiro','auditoria','DELETE')
     OR has_table_privilege('app_financeiro','acesso_plataforma_log','UPDATE')
     OR has_table_privilege('app_financeiro','acesso_plataforma_log','DELETE') THEN
    RAISE EXCEPTION 'inv.18 log gravavel pela aplicacao: append-only violado';
  END IF;

  -- 19: lista branca de SECURITY DEFINER. Cada uma delas e leitura sem policy.
  SELECT string_agg(p.proname, ', ') INTO m
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('app','public') AND p.prosecdef
    AND p.proname NOT IN ('membros_do_tenant','tem_vinculo_no_tenant',
                          'resolver_login','auditar','exigir_trilha_de_plataforma');
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'inv.19 SECURITY DEFINER fora da lista branca: %', m;
  END IF;

  -- 3 e 13 outra vez, agora com as quinze tabelas.
  SELECT string_agg(c.relname, ', ') INTO m
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0
  WHERE c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'inv.3 RLS incompleta em: %', m;
  END IF;
END $$;
