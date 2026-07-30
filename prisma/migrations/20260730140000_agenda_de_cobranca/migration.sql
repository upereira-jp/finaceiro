-- MIGRATION 21 - A AGENDA DE COBRANCA. Os dois processos periodicos que o PRD 6
-- pede e que nao existiam em lugar nenhum do sistema.
--
-- O QUE FALTAVA, medido em 28/07 e ainda verdadeiro em 30/07 (Q-AGENDA-01):
-- varredura de src/ e scripts/ nao acha `cron`, `setInterval` nem agendador.
-- `boleto.tentativas` e `boleto.ultimo_erro` existem desde a migration 16 e
-- NINGUEM AS CONSOME - a coluna conta uma tentativa que nada nunca refaz.
--
-- O PRD 6 pede duas coisas, e as duas sao sobre dinheiro que se perde em
-- silencio:
--
--   "fila de emissao com retry exponencial"
--     boleto que falhou no registro fica em `erro` para sempre. A fatura esta
--     emitida, o cliente nao recebe cobranca, e nada no sistema volta a tentar.
--
--   "consulta ativa diaria dos boletos em aberto para capturar liquidacoes cujo
--    webhook falhou"
--     webhook perdido e dinheiro RECEBIDO que o sistema nunca baixa. A fatura
--     vence, a inadimplencia passa a acusar quem pagou, e o split - que so roda
--     na liquidacao - nunca reparte. Ninguem recebe comissao nem repasse.
--
-- ============================================================================
-- POR QUE ISTO E MIGRATION E NAO SO CODIGO
--
-- O retry exponencial precisa saber QUANDO foi a ultima tentativa. Nao havia
-- coluna: `criado_em` e o nascimento da linha, e `registrado_em` e nulo
-- justamente no caso que interessa. Sem carimbo, "esperar 2^n" so pode ser
-- calculado a partir do nascimento - e um boleto que falhou ontem seria
-- retentado no mesmo instante em que um que falhou agora.
--
-- O QUE ESTA MIGRATION NAO DECIDE, e a distincao e da regra 10: o PRD diz
-- "exponencial" e NAO diz base, teto nem numero maximo de tentativas. Esses tres
-- numeros sao escolha de quem escreveu o codigo, vivem num lugar so
-- (`src/dominio/agenda.ts`) e estao registrados como Q-AGENDA-02 para o dono
-- confirmar. O banco nao tem opiniao sobre eles: guarda o carimbo e a data
-- calculada, e quem calcula e a aplicacao.
--
-- E O QUE ELA DELIBERADAMENTE NAO FAZ: desistir. Nao ha coluna "abandonado" e
-- nao ha teto de tentativas no schema. Parar de cobrar um cliente e decisao de
-- negocio com dono nomeado, e um boleto que sai da fila sozinho e exatamente a
-- falha silenciosa que esta migration existe para fechar. O teto e do INTERVALO,
-- nao da contagem: a fila desacelera e nunca esvazia por conta propria.

-- ============================================================ 1. O CARIMBO
ALTER TABLE boleto
  ADD COLUMN ultima_tentativa_em  timestamptz,
  ADD COLUMN proxima_tentativa_em timestamptz;

COMMENT ON COLUMN boleto.ultima_tentativa_em IS
  'Quando a ULTIMA tentativa de registro aconteceu - nao o nascimento da linha. '
  'PRD 6, fila de emissao com retry exponencial: sem este carimbo o intervalo so '
  'poderia ser contado a partir de criado_em, e um boleto que falhou ontem seria '
  'retentado junto com um que falhou agora.';

COMMENT ON COLUMN boleto.proxima_tentativa_em IS
  'Quando a fila PODE pegar esta linha de novo. NULO em boleto que nunca foi '
  'tentado significa VENCIDO - a fila o pega. E o estado das linhas que ja '
  'existiam quando esta migration entrou, e "pegar agora" e a leitura certa para '
  'elas: falharam e nunca foram retentadas.';

/*
 * A coerencia possivel, e so ela. Nao se agenda a proxima tentativa sem ter
 * feito uma - e as linhas que ja existem tem as duas colunas nulas, entao a
 * constraint nasce valida sem backfill.
 *
 * O que NAO se pode exigir aqui: `tentativas > 0 => ultima_tentativa_em NOT
 * NULL`. Isso seria falso para as linhas que a migration 16 deixou com
 * tentativas > 0 e nenhum carimbo, e inventar um timestamp para elas seria
 * gravar um fato que ninguem mediu.
 */
ALTER TABLE boleto
  ADD CONSTRAINT boleto_agendamento_coerente CHECK (
    proxima_tentativa_em IS NULL OR ultima_tentativa_em IS NOT NULL
  );

/*
 * O indice da fila. PARCIAL e NAO-UNICO, e a distincao e a regra 11 inteira:
 * o CAT-1 acusa indice unico parcial que cobre exatamente as colunas de uma FK,
 * porque o `db pull` ignora o predicado e infere relacao to-one. `indisunique`
 * aqui e false, entao nao ha cardinalidade a inferir e nao ha relacao a produzir.
 *
 * Ha precedente na propria arvore: `fatura_vencimento_idx` e parcial sobre
 * status desde a migration 16, e sai do `db pull` como @@index com where: raw().
 */
CREATE INDEX boleto_fila_idx ON boleto (tenant_id, proxima_tentativa_em)
  WHERE status IN ('pendente','erro');

-- ============================================================ 2. O REGISTRO
/*
 * E REGISTRO, NAO CADASTRO - a forma e copiada de `conector_execucao` (migration
 * 14) de proposito, e o argumento de la vale aqui inteiro: "log e efemero e
 * ninguem o consulta; contagem que cresce numa tabela e a unica forma de 'alguem
 * precisa olhar' chegar a alguem".
 *
 * Para a agenda o argumento e mais forte, porque o modo de falha e a AUSENCIA de
 * execucao. Um processo periodico que parou de rodar nao produz erro, nao produz
 * log e nao produz linha - produz nada, que e indistinguivel de "rodou e nao
 * havia trabalho". Com esta tabela, "a consulta ativa nao roda desde o dia 3" e
 * uma consulta; sem ela, e uma pergunta que ninguem sabe fazer.
 */
CREATE TYPE agenda_tarefa AS ENUM ('fila_de_emissao','consulta_ativa');

COMMENT ON TYPE agenda_tarefa IS
  'As duas tarefas periodicas do PRD 6. Enum e nao texto porque a lista e '
  'fechada pelo PRD: um terceiro valor exige mudar o produto, nao o codigo.';

CREATE TABLE agenda_execucao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  conector_id  uuid NOT NULL,
  tarefa       agenda_tarefa NOT NULL,
  ciclo_id     uuid NOT NULL,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,

  /*
   * Contadores. NOT NULL com default 0, pela mesma razao da migration 14: "zero
   * e um fato; ausencia de fato nao existe aqui". NULL em contador soma como
   * nada e coalesce como zero, e as duas coisas escondem a diferenca entre
   * "olhei e nao havia" e "nao olhei".
   *
   * Os cinco servem as duas tarefas, e o que nao se aplica fica em zero:
   *   fila_de_emissao  examinados = vencidos na fila
   *                    registrados = passaram   ·  falhos = falharam de novo
   *   consulta_ativa   examinados = em aberto consultados
   *                    liquidados = baixas aplicadas
   *                    divergentes = banco diz liquidado e o valor NAO fecha
   */
  examinados   int NOT NULL DEFAULT 0,
  registrados  int NOT NULL DEFAULT 0,
  falhos       int NOT NULL DEFAULT 0,
  liquidados   int NOT NULL DEFAULT 0,
  divergentes  int NOT NULL DEFAULT 0,

  status       execucao_status NOT NULL DEFAULT 'em_andamento',
  detalhe      jsonb,

  CONSTRAINT agenda_contadores_nao_negativos CHECK (
    examinados >= 0 AND registrados >= 0 AND falhos >= 0
    AND liquidados >= 0 AND divergentes >= 0
  ),
  -- Mesma coerencia da migration 14: execucao terminada tem status terminal, e
  -- execucao em andamento nao pode ter fim. Sem isto uma execucao que morre no
  -- meio fica 'em_andamento' para sempre e o EXCLUDE abaixo trava a agenda.
  CONSTRAINT agenda_fim_coerente CHECK (
    (terminado_em IS NULL AND status = 'em_andamento')
    OR (terminado_em IS NOT NULL AND status <> 'em_andamento')
  ),

  -- Regra 2: FK composta, e conector_cobranca ja carrega UNIQUE (tenant_id, id)
  -- desde a migration 18.
  CONSTRAINT agenda_conector_fk FOREIGN KEY (tenant_id, conector_id)
    REFERENCES conector_cobranca (tenant_id, id),
  CONSTRAINT agenda_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

-- Regra 2: UNIQUE (tenant_id, id) em toda tabela referenciavel, mesmo sem
-- referencia hoje. E o que o CAT-2 confere.
CREATE UNIQUE INDEX agenda_execucao_id_tenant ON agenda_execucao (tenant_id, id);

CREATE INDEX agenda_execucao_tenant_idx
  ON agenda_execucao (tenant_id, tarefa, iniciado_em DESC);

/*
 * UMA execucao em andamento por conector E POR TAREFA, imposto pelo banco.
 *
 * Duas execucoes simultaneas da mesma tarefa nao sao hipotese remota: e o que
 * acontece quando o agendador dispara de novo antes de a rodada anterior
 * terminar - exatamente o cenario que o retry exponencial torna mais provavel,
 * porque a rodada fica mais lenta quanto mais boletos ela tenta.
 *
 * Na fila de emissao o dano e concreto: as duas rodadas leem o mesmo boleto
 * `erro` e as duas chamam o banco. O `boleto_fatura_unico` da migration 16
 * impede o segundo DOCUMENTO, mas nao impede a segunda CHAMADA.
 *
 * EXCLUDE e nao indice unico parcial, e a razao esta escrita na migration 14:
 * `UNIQUE (tenant_id, conector_id) WHERE status='em_andamento'` cobriria
 * exatamente as colunas de `agenda_conector_fk` e viraria relacao to-one no
 * `db pull` (CAT-1); `UNIQUE (conector_id) WHERE ...` tornaria conector_id unico
 * sozinho e derrubaria o `generate` com P1012 (CAT-2). `indisunique` de um
 * EXCLUDE e false, entao nenhum dos dois se aplica.
 *
 * btree_gist ja esta instalado desde a migration 1, pela vigencia sem
 * sobreposicao de regra_comissao e tarifa - e ele cobre enum, o que foi
 * verificado antes de escrever esta linha.
 */
ALTER TABLE agenda_execucao
  ADD CONSTRAINT agenda_uma_execucao_por_tarefa
  EXCLUDE USING gist (conector_id WITH =, tarefa WITH =) WHERE (status = 'em_andamento');

-- ============================================================ 3. RLS
-- Regra 3: ENABLE + FORCE + ao menos uma policy. Sem a policy a tabela nega
-- tudo em silencio, e o sintoma seria a agenda "nao achando trabalho".
ALTER TABLE agenda_execucao ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_execucao FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agenda_execucao
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON agenda_execucao TO app_financeiro;
/*
 * DELETE revogado, como em conector_execucao: "contagem de recusas apagavel por
 * quem foi recusado nao e contagem". Aqui o que nao se apaga e a prova de que a
 * agenda rodou - ou de que nao rodou. A migration 2 concedeu DML em ALL TABLES
 * por ALTER DEFAULT PRIVILEGES, entao isto TEM que ser reimposto tabela a tabela.
 */
REVOKE DELETE ON agenda_execucao FROM app_financeiro;

-- ============================================================ 4. AUDITORIA
/*
 * A PRIMEIRA VERSAO DESTA SECAO NAO CRIAVA O GATILHO, e o teste `G2` de
 * `tests/auditoria.sql` acusou: "inv.17 sem gatilho: agenda_execucao". O erro
 * ficou registrado porque ele e o mesmo, com o mesmo argumento, que a migration
 * 14 cometeu - e a migration 15 ja o respondeu em 27/07.
 *
 * O que eu escrevi era: "registro de execucao nao e dado de negocio; o
 * precedente e a migration 14". O precedente estava INVERTIDO. A 14 de fato
 * dispensou o gatilho, o `G2` a acusou, e a 15 concluiu o contrario do que eu
 * citei:
 *
 *   "mexer numa lista branca de invariante para acomodar codigo novo e afrouxar
 *    a regra pelo lado errado (...) O custo de obedecer e uma linha. O custo de
 *    afrouxar e o precedente."
 *
 * Citar uma decisao pelo que ela tentou, e nao pelo que ela concluiu, e a mesma
 * classe de erro que a sessao 14 pegou numa citacao inventada e a 15 numa
 * contagem lida da tela. A conta aqui e ainda menor que a de la: a agenda faz UM
 * insert e UM ou dois updates por rodada.
 *
 * O DELETE revogado acima continua valendo. Ele e outra coisa - impede apagar a
 * prova; o gatilho registra quem mudou o que.
 */
CREATE TRIGGER auditar_agenda_execucao
  AFTER INSERT OR UPDATE OR DELETE ON agenda_execucao
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

COMMENT ON TABLE agenda_execucao IS
  'Registro das execucoes periodicas do PRD 6 - fila de emissao e consulta '
  'ativa. Existe porque o modo de falha de um processo periodico e a AUSENCIA '
  'de execucao, que nao produz erro nem log: sem esta tabela, "a consulta ativa '
  'parou no dia 3" nao e uma pergunta que alguem consiga fazer. Auditada como as '
  'outras (invariante 17); DELETE revogado para app_financeiro. Q-AGENDA-01.';

-- ============================================================ 5. A CONFERENCIA
-- Mesma guarda da migration 18: a migration falha se a RLS ficar incompleta,
-- em vez de deixar a tabela negando tudo em silencio ate alguem reparar.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r' AND c.relname = 'agenda_execucao'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
