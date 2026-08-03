-- MIGRATION 23 - O LAYOUT DA FATURA POR POSICAO: folha e blocos.
--
-- De onde ela vem: o pedido do dono em 03/08 - "construir com base no tamanho de
-- folha que eu escolher e colocar os elementos onde eu desejar, nao apenas
-- assinalar se o elemento aparece ou deixa de aparecer". E a SEGUNDA VOLTA da
-- decisao 2 da `Q-DOCFATURA-01` (layout configuravel por tenant, 30/07), e o
-- plano inteiro esta em `PLANO-layout-visual-2026-08-03.md`.
--
-- O QUE A MIGRATION 19 DEIXOU DE FORA, e nao por descuido: `campo_do_documento`
-- resolve QUAIS campos e em que ORDEM - uma lista linear. Ela nao tem coordenada,
-- nao tem largura e nao tem coluna, entao duas informacoes nunca podem ficar lado
-- a lado. E a moldura - logo, titulo, faixa de pagamento - nem configuravel era:
-- estava em JSX fixo em `web/src/telas/documento.tsx`.
--
-- ESTA MIGRATION NAO SUBSTITUI A 19, ELA A EMOLDURA. `campo_do_documento`
-- continua sendo o CONTEUDO da tabela de valores; os blocos daqui sao onde essa
-- tabela - e tudo o mais - fica na folha. Nenhuma configuracao existente e
-- migrada, tocada ou perdida.
--
-- E ELA TAMBEM NAO SEMEIA NADA, pela mesma razao escrita na 19: `bloco_do_
-- documento` vazio NAO significa documento vazio - significa "usa o layout
-- padrao", que vive em `src/dominio/layout-visual.ts` e reproduz exatamente o
-- documento que a tela ja pintava. Um layout semeado aqui decidiria a folha de
-- todo tenant futuro a partir do gosto de hoje.
--
-- MILIMETRO, E A REGRA 1 NA SEGUNDA METADE. Papel e milimetro: pixel depende de
-- DPI e porcentagem faria o mesmo layout mudar de proporcao entre A4 e A5, que e
-- justamente o que escolher a folha deveria impedir. Milimetro e GRANDEZA FISICA
-- - mantem escala decimal e NUNCA vira centavos. `numeric(6,1)` da 0,1 mm de
-- resolucao, que esta abaixo da tolerancia de qualquer impressora da faixa.

-- ------------------------------------------------------------------ os enums
--
-- PAPEL FECHADO POR ENUM, e nao largura/altura livres. Mesmo argumento do
-- `campo_de_fatura` da 19: o banco recusando e melhor que codigo que alguem tem
-- de lembrar de rodar, e um papel inventado vira fatura que nao imprime.
--
-- As MEDIDAS de cada papel NAO estao aqui - estao em codigo, como o `PADRAO` de
-- campos. Elas sao norma internacional (ISO 216 para A4 e A5), nao configuracao,
-- e o enum valida QUAL papel, nao quanto ele mede.
CREATE TYPE papel_do_documento AS ENUM ('a4', 'a5', 'carta', 'oficio');

CREATE TYPE orientacao_do_documento AS ENUM ('retrato', 'paisagem');

-- OS SEIS TIPOS DE BLOCO.
--
-- `tabela_de_campos` e o que preserva o documento de hoje inteiro num bloco so -
-- ele pinta a lista de `campo_do_documento`, com a ordem e os rotulos que ja
-- estao configurados. Os outros cinco sao o que nao existia:
--
--   campo      um campo isolado, para por o TOTAL num quadro proprio
--   texto      texto livre - endereco, instrucoes, aviso legal. Nao cabia no
--              enum de CAMPOS DA FATURA, e alargar aquele enum para caber texto
--              livre destruiria a validacao que ele existe para dar
--   logo       a logo da identidade, agora com posicao
--   pagamento  a faixa (QR, linha digitavel), idem
--   linha      um filete separador, que nao existia de forma nenhuma
CREATE TYPE tipo_de_bloco AS ENUM
  ('tabela_de_campos', 'campo', 'texto', 'logo', 'pagamento', 'linha');

CREATE TYPE alinhamento_do_bloco AS ENUM ('esquerda', 'centro', 'direita');
CREATE TYPE peso_do_bloco AS ENUM ('normal', 'forte');

-- ------------------------------------------------------------------- a folha

CREATE TABLE layout_do_documento (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),

  papel       papel_do_documento      NOT NULL DEFAULT 'a4',
  orientacao  orientacao_do_documento NOT NULL DEFAULT 'retrato',

  /*
   * As quatro margens, em milimetros. O default de 16 nao e gosto: e o mesmo
   * `@page { margin: 16mm }` que `web/src/estilo.ts` ja usava, para que quem
   * nunca abrir o editor imprima exatamente o que imprimia antes.
   *
   * O CHECK e por lado e nao pela soma porque a soma depende da orientacao, e
   * um CHECK que dependesse dela travaria o giro do papel. O que impede margem
   * absurda de verdade e a conferencia de area imprimivel, que roda em codigo
   * puro e sabe qual e o papel - `conferirLayout`.
   */
  margem_topo_mm     numeric(6,1) NOT NULL DEFAULT 16 CHECK (margem_topo_mm     BETWEEN 0 AND 100),
  margem_direita_mm  numeric(6,1) NOT NULL DEFAULT 16 CHECK (margem_direita_mm  BETWEEN 0 AND 100),
  margem_baixo_mm    numeric(6,1) NOT NULL DEFAULT 16 CHECK (margem_baixo_mm    BETWEEN 0 AND 100),
  margem_esquerda_mm numeric(6,1) NOT NULL DEFAULT 16 CHECK (margem_esquerda_mm BETWEEN 0 AND 100),

  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now(),

  -- Um tenant, uma folha. Mesmo argumento da `identidade_de_cobranca`: duas
  -- folhas ativas fariam o documento escolher uma, e qual papel a fatura usa nao
  -- e decisao de planejador de consultas.
  CONSTRAINT layout_do_documento_tenant_unico UNIQUE (tenant_id),
  -- Regra 2: redundante com a PK e NECESSARIA para a FK composta dos blocos.
  CONSTRAINT layout_do_documento_id_tenant UNIQUE (tenant_id, id)
);

-- ------------------------------------------------------------------ os blocos

CREATE TABLE bloco_do_documento (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),

  tipo tipo_de_bloco NOT NULL,

  /*
   * `campo` e `texto` sao exclusivos por TIPO, e o CHECK abaixo e o que impede o
   * estado que nao existe - um bloco de logo com texto dentro, ou um bloco de
   * campo sem campo. Sem ele a validacao seria codigo que alguem tem de lembrar
   * de rodar, e a 19 ja registrou o que este projeto acha disso.
   */
  campo campo_de_fatura,
  texto text CHECK (texto IS NULL OR length(texto) BETWEEN 1 AND 500),

  /*
   * A GEOMETRIA. Origem no canto superior esquerdo do PAPEL - nao da area
   * imprimivel -, porque e assim que o CSS de impressao trabalha e converter num
   * dos dois lados so criaria uma segunda convencao para alguem confundir.
   *
   * O CHECK aqui e frouxo de proposito (0 a 2000 mm cobre qualquer papel da
   * lista com folga). Quem sabe se o bloco cabe e `conferirLayout`, que conhece
   * o papel E as margens; um CHECK apertado no banco recusaria o bloco valido de
   * um papel grande, e nao tem como olhar a linha do `layout_do_documento`.
   */
  x_mm       numeric(6,1) NOT NULL CHECK (x_mm       BETWEEN 0 AND 2000),
  y_mm       numeric(6,1) NOT NULL CHECK (y_mm       BETWEEN 0 AND 2000),
  largura_mm numeric(6,1) NOT NULL CHECK (largura_mm > 0 AND largura_mm <= 2000),
  altura_mm  numeric(6,1) NOT NULL CHECK (altura_mm  > 0 AND altura_mm  <= 2000),

  /*
   * A APRESENTACAO E DADO, e isto conserta um defeito que ja estava em producao.
   *
   * `web/src/telas/documento.tsx` punha o total em negrito 18px, e essa decisao
   * NAO viajava no que `GET /faturas/:id/documento` devolve. O CRM consome a
   * mesma rota e nao roda React: ele receberia a mesma fatura SEM o negrito, e
   * nenhum dos dois lados pareceria errado. Com o estilo em coluna, os dois
   * consumidores recebem o mesmo documento.
   */
  alinhamento alinhamento_do_bloco NOT NULL DEFAULT 'esquerda',
  tamanho_pt  smallint             NOT NULL DEFAULT 10 CHECK (tamanho_pt BETWEEN 6 AND 72),
  peso        peso_do_bloco        NOT NULL DEFAULT 'normal',
  borda       boolean              NOT NULL DEFAULT false,
  fundo       boolean              NOT NULL DEFAULT false,

  /*
   * Ordem de pintura. SEM UNIQUE, e pelo mesmo argumento que a 19 escreveu para
   * `ordem`: com `UNIQUE (tenant_id, z)`, trocar dois blocos de camada violaria
   * a constraint no meio da transacao. O empate desempata pelo `id`, de forma
   * estavel - e estabilidade importa aqui mais que na 19, porque sem ela a
   * fatura que o CRM compoe poderia sair numa ordem e a nossa em outra, sem
   * ninguem ter mexido em nada.
   */
  z smallint NOT NULL DEFAULT 0,

  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bloco_do_documento_id_tenant UNIQUE (tenant_id, id),

  CONSTRAINT bloco_conteudo_por_tipo CHECK (
    (tipo = 'campo' AND campo IS NOT NULL AND texto IS NULL) OR
    (tipo = 'texto' AND texto IS NOT NULL AND campo IS NULL) OR
    (tipo IN ('tabela_de_campos', 'logo', 'pagamento', 'linha') AND campo IS NULL AND texto IS NULL)
  )
);

/*
 * O INDICE DA LEITURA. NAO-UNICO e NAO-PARCIAL, e as duas coisas sao a regra 11.
 *
 * Um parcial sobre `(tenant_id, tipo)` seria a tentacao obvia ("so os blocos
 * visiveis"), e o CAT-1 o recusaria: nao ha coluna de visibilidade aqui de
 * proposito - bloco que nao deve aparecer se apaga, e a trilha da regra 9 guarda
 * o que ele era. Esconder um bloco seria um segundo estado para a mesma coisa.
 */
CREATE INDEX bloco_do_documento_por_tenant ON bloco_do_documento (tenant_id, z, id);

-- ========================================================== RLS (regra 3)
--
-- ENABLE + FORCE + policy nas duas. Regra 3: habilitada sem policy nega tudo em
-- SILENCIO - o modo de falha e resultado vazio, nao erro de permissao, entao nao
-- aparece em log e so e descoberto quando o documento sai sem layout nenhum.

ALTER TABLE layout_do_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_do_documento FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON layout_do_documento
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE bloco_do_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloco_do_documento FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bloco_do_documento
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

/*
 * DELETE CONCEDIDO em `bloco_do_documento`, e a diferenca em relacao a
 * `pagamento` e `conector_execucao` merece a frase: la o que nao se apaga e a
 * PROVA de que algo aconteceu. Aqui um bloco e configuracao de aparencia - tirar
 * um elemento do papel e o uso normal da tela, e a alternativa (uma coluna
 * `removido`) criaria dois estados para "nao aparece" e faria o layout carregar
 * lixo para sempre. O que aconteceu fica na trilha da regra 9, com o antes.
 *
 * A migration 2 concedeu DML em ALL TABLES por ALTER DEFAULT PRIVILEGES, entao
 * o DELETE ja viria - isto e explicito para que a decisao esteja escrita, e nao
 * herdada por acidente.
 */
GRANT SELECT, INSERT, UPDATE         ON layout_do_documento TO app_financeiro;
GRANT SELECT, INSERT, UPDATE, DELETE ON bloco_do_documento  TO app_financeiro;

/*
 * O layout NAO se apaga: um tenant tem uma folha, e "voltar ao padrao" e um
 * UPDATE para os defaults, nao um DELETE que deixaria o tenant sem linha.
 */
REVOKE DELETE ON layout_do_documento FROM app_financeiro;

-- ==================================================== AUDITORIA (regra 9)
--
-- Invariante 17: escrita de dado de negocio grava auditoria. E aqui a tentacao
-- de dispensar era REAL - "layout e aparencia, nao dado de negocio" -, que e
-- exatamente o argumento que a migration 21 usou e a 15 ja tinha derrubado:
-- "o custo de obedecer e uma linha; o custo de afrouxar e o precedente".
--
-- E ha razao propria, alem do precedente: o layout decide o que o cliente LE na
-- fatura dele. Um bloco de texto trocado muda o que a empresa afirma por
-- escrito, e "quem, quando, antes e depois" e a pergunta certa sobre isso.
CREATE TRIGGER auditar_layout_do_documento
  AFTER INSERT OR UPDATE OR DELETE ON layout_do_documento
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_bloco_do_documento
  AFTER INSERT OR UPDATE OR DELETE ON bloco_do_documento
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

-- ====================================================== A CONFERENCIA
-- Mesma guarda das migrations 18, 21 e 22: falha aqui em vez de deixar a tabela
-- negando tudo em silencio ate alguem reparar.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname IN ('layout_do_documento', 'bloco_do_documento')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;

  -- E o gatilho, porque o teste G2 ja pegou esta ausencia uma vez (migration 14,
  -- corrigida pela 15) e a 21 quase a repetiu com um argumento.
  SELECT string_agg(t.rel, ', ') INTO faltando
  FROM (VALUES ('layout_do_documento'), ('bloco_do_documento')) AS t(rel)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger g
    JOIN pg_class c ON c.oid = g.tgrelid
    WHERE c.relname = t.rel AND NOT g.tgisinternal
      AND g.tgfoid = 'app.auditar()'::regprocedure);
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'gatilho de auditoria ausente em: %', faltando; END IF;
END $$;
