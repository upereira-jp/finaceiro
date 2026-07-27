-- Migration 14 - o registro de execucao do conector. SPEC-002 §3.
--
-- E REGISTRO, NAO CADASTRO. Ninguem edita conector_execucao pela UI: ela e
-- escrita pelo ciclo e lida por quem investiga. A diferenca importa para a
-- invariante 8 da SPEC-002 - `recusados > 0` tem que ser VISIVEL em tabela,
-- nunca so em log. Log e efemero e ninguem o consulta; contagem que cresce numa
-- tabela e a unica forma de "alguem precisa olhar o CRM" chegar a alguem.

-- ============================================================ 1. O ENUM
CREATE TYPE execucao_status AS ENUM ('em_andamento','ok','parcial','erro');

-- ============================================================ 2. O LADO DEFINIDOR
-- Regra 2: toda tabela referenciada por FK composta carrega UNIQUE (tenant_id, id).
-- Tem que vir ANTES da FK - o Postgres exige a unicidade ja declarada.
-- conector_crm tinha tenant_id UNIQUE sozinho (um conector por tenant), o que
-- nao serve: a FK composta precisa do PAR exato.
CREATE UNIQUE INDEX conector_id_tenant ON conector_crm (tenant_id, id);

-- ============================================================ 3. A TABELA
CREATE TABLE conector_execucao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  conector_id  uuid NOT NULL,
  ciclo_id     uuid NOT NULL,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,

  -- Contadores. NOT NULL com default 0 de proposito: NULL em contador soma como
  -- nada e coalesce como zero, que e o modo de falha que a migration 10 secao 6
  -- perseguiu no preco. Zero e um fato; ausencia de fato nao existe aqui.
  lidos        int NOT NULL DEFAULT 0,
  criados      int NOT NULL DEFAULT 0,
  atualizados  int NOT NULL DEFAULT 0,
  desativados  int NOT NULL DEFAULT 0,
  recusados    int NOT NULL DEFAULT 0,

  status       execucao_status NOT NULL DEFAULT 'em_andamento',
  detalhe      jsonb,

  CONSTRAINT execucao_contadores_nao_negativos CHECK (
    lidos >= 0 AND criados >= 0 AND atualizados >= 0
    AND desativados >= 0 AND recusados >= 0
  ),
  -- Ciclo terminado tem que ter status terminal, e ciclo em andamento nao pode
  -- ter fim. Sem isto um ciclo que morre no meio fica 'em_andamento' para sempre
  -- e o "segundo ciclo nao inicia" da §7 trava o conector permanentemente.
  CONSTRAINT execucao_fim_coerente CHECK (
    (terminado_em IS NULL AND status = 'em_andamento')
    OR (terminado_em IS NOT NULL AND status <> 'em_andamento')
  ),

  -- Regra 2: FK composta, e a referenciada carrega UNIQUE (tenant_id, id).
  CONSTRAINT execucao_conector_fk FOREIGN KEY (tenant_id, conector_id)
    REFERENCES conector_crm (tenant_id, id),
  CONSTRAINT execucao_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

-- A regra 2 exige UNIQUE (tenant_id, id) em toda tabela referenciada. Esta ainda
-- nao e referenciada por ninguem, mas o CAT-2 confere o par FK-composta/UNIQUE e
-- a proxima tabela que apontar para ca nao deveria precisar de migration extra.
CREATE UNIQUE INDEX execucao_id_tenant ON conector_execucao (tenant_id, id);

CREATE INDEX execucao_tenant_idx ON conector_execucao (tenant_id, iniciado_em DESC);
CREATE INDEX execucao_ciclo_idx  ON conector_execucao (ciclo_id);

/*
 * UM ciclo em andamento por conector, imposto PELO BANCO - e por EXCLUDE, nao
 * por indice unico parcial. A escolha do mecanismo e a parte interessante.
 *
 * A §7 diz "dois ciclos do mesmo conector se sobrepoem -> o segundo nao inicia".
 * Deixar para a aplicacao e deixar para uma condicao de corrida: dois
 * agendadores, ou um retry, e os dois leem o estado antes de qualquer um escrever.
 *
 * O NATURAL SERIA UM INDICE UNICO PARCIAL, E A REGRA 11 O PROIBE AQUI - as duas
 * formas obvias caem em armadilha medida:
 *
 *   UNIQUE (tenant_id, conector_id) WHERE status='em_andamento'
 *     cobre EXATAMENTE as colunas da FK execucao_conector_fk. O `db pull` ignora
 *     o predicado, infere relacao to-one e devolve linha arbitraria. E o CAT-1.
 *
 *   UNIQUE (conector_id) WHERE status='em_andamento'
 *     torna conector_id unico SOZINHO aos olhos da introspeccao, e a FK composta
 *     (tenant_id, conector_id) passa a emitir relacao 1-1 sobre um par que nao e
 *     unico: o Prisma recusa o schema inteiro com P1012. E o CAT-2, e foi ele que
 *     acusou esta migration na primeira tentativa.
 *
 * EXCLUDE resolve os dois porque NAO e indice unico: `indisunique` e false, entao
 * nem CAT-1 nem CAT-2 se aplicam, e a introspeccao do Prisma nao infere
 * cardinalidade a partir dele. E o mesmo mecanismo que a regra 21 ja usa para
 * vigencia de regra_comissao e tarifa - btree_gist ja esta instalado por isso.
 *
 * Viola com 23P01, nao 23505. O repositorio traduz em erro de negocio, como o de
 * rateio faz com o teto da R11.
 */
ALTER TABLE conector_execucao
  ADD CONSTRAINT execucao_um_ciclo_em_andamento
  EXCLUDE USING gist (conector_id WITH =) WHERE (status = 'em_andamento');

-- ============================================================ 3. RLS
-- Regra 3: ENABLE + FORCE + ao menos uma policy. A decima quarta tabela.
ALTER TABLE conector_execucao ENABLE ROW LEVEL SECURITY;
ALTER TABLE conector_execucao FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conector_execucao
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

/*
 * Registro nao se edita nem se apaga - mesmo raciocinio do acesso_plataforma_log
 * na migration 10 secao 5. UPDATE fica: o ciclo comeca 'em_andamento' e precisa
 * fechar. DELETE nao: contagem de recusas apagavel por quem foi recusado nao e
 * contagem. A migration 2 concedeu DML em ALL TABLES por ALTER DEFAULT
 * PRIVILEGES, entao isto TEM que ser reimposto tabela a tabela.
 */
REVOKE DELETE ON conector_execucao FROM app_financeiro;

-- ============================================================ 4. SEM AUDITORIA
/*
 * DE PROPOSITO, e o precedente e da migration 10: "auditoria e
 * acesso_plataforma_log ficam fora: log nao se audita, se torna imutavel".
 * conector_execucao e da mesma familia - registro de execucao, nao dado de
 * negocio. A regra 9 fala de "escrita de dado de negocio", e o que o conector
 * grava EM dado de negocio (cliente, cliente_estado_crm) ja e auditado nas
 * proprias tabelas, com antes e depois.
 *
 * Havia um argumento pratico junto: o ciclo faz UPDATE nos contadores a cada
 * lote, e auditar isso encheria `auditoria` de imagem de contador para cada lote
 * de cada ciclo de cada tenant. Trilha que ninguem consegue ler nao e trilha.
 *
 * O que substitui: DELETE revogado acima. A contagem de recusas nao se apaga.
 */

-- ============================================================ 5. conector_crm
-- SPEC-002 §3: o conector guarda a marca-d'agua e o ultimo erro.
ALTER TABLE conector_crm
  ADD COLUMN ultimo_ciclo_id    uuid,
  ADD COLUMN ultima_leitura_em  timestamptz,
  ADD COLUMN ultimo_erro        text;

COMMENT ON COLUMN conector_crm.ultima_leitura_em IS
  'Marca-d''agua da LEITURA, nao do processamento. A diferenca importa quando um '
  'ciclo le e falha ao gravar: reler do ponto de processamento perderia linhas.';

COMMENT ON COLUMN conector_crm.crm_tenant_id IS
  'Identificador do tenant no CRM. NUNCA se chama tenant_id (regra 6): os dois '
  'sao uuid, trocar um pelo outro nao falha em runtime e devolve dado de outra '
  'empresa. SPEC-002 R1-b: o conector valida toda linha recebida contra este '
  'valor, porque o isolamento das views financeiro.* vem de um LITERAL no corpo '
  'da view e nao da RLS do CRM.';

COMMENT ON TABLE conector_execucao IS
  'Registro de execucao do conector, nao cadastro. SPEC-002 §3. `recusados` e o '
  'numero que importa: o conector RECUSA linha ambigua em vez de adivinhar, e '
  'contagem crescente e o sinal de que alguem precisa olhar o CRM.';
