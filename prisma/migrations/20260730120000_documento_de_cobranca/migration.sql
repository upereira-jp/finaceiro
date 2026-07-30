-- MIGRATION 19 - O DOCUMENTO DE COBRANCA: identidade, layout e recebimento Pix.
--
-- De onde ela vem: a decisao de 29/07 (`Q-DOCFATURA-01`) de que o documento que
-- o cliente recebe e NOSSO - fatura de energia com a logo e os campos da G3 -, e
-- a parte pagavel entra como faixa. Nao renderizamos boleto FEBRABAN, e por isso
-- nao assumimos a responsabilidade de imprimir linha digitavel errada.
--
-- TRES TABELAS, E A DIVISAO ENTRE ELAS FOI MEDIDA, NAO ESTETICA.
--
-- `app.auditar()` grava `to_jsonb(OLD)` e `to_jsonb(NEW)` - a linha INTEIRA. E
-- medido em 30/07 contra este banco: um `bytea` dentro de `to_jsonb` sai em hex e
-- ocupa EXATAMENTE 2,00x o tamanho real (50.000 bytes -> 100.012 caracteres).
-- Uma logo de 300 KB numa tabela auditada custaria 600 KB em `dados_depois` e
-- outros 600 KB em `dados_antes` a cada substituicao - 1,2 MB de trilha por
-- troca de logo, na mesma tabela que o caminho de plataforma consulta.
--
-- Entao o binario mora sozinho, SEM gatilho de auditoria, e a tabela auditada
-- guarda o `logo_sha256`. A regra 9 pede "quem, quando, o que, antes e depois" -
-- e "antes: hash A, depois: hash B" cumpre isso inteiro, sem carregar o arquivo.
-- A trilha nao perde nada: o hash muda se e somente se a imagem mudou.
--
-- O QUE ESTA MIGRATION NAO FAZ, e e deliberado: nao semeia layout nenhum.
-- `campo_do_documento` vazio NAO significa documento vazio - significa "usa o
-- padrao", que vive em codigo, e um padrao semeado aqui decidiria o layout de
-- todo tenant futuro a partir do gosto de hoje.

-- ---------------------------------------------------------------- os campos
--
-- A LISTA E FECHADA POR ENUM, e e aqui que "campo inexistente vira fatura
-- errada" deixa de ser possivel. A alternativa era `jsonb` com uma lista de
-- nomes, e ai a validacao seria codigo que alguem tem de lembrar de rodar - o
-- enum e o banco recusando.
--
-- Cada valor corresponde a um dado que EXISTE no momento de compor o documento:
-- coluna de `fatura`, de `unidade_consumidora`, de `cliente` ou de `usina`.
-- Nenhum valor derivado entrou: "economia do mes" nao esta aqui porque nao ha de
-- onde tira-la sem inventar a conta.
CREATE TYPE campo_de_fatura AS ENUM (
  -- identificacao
  'competencia', 'vencimento', 'numero_uc', 'distribuidora',
  'cliente_nome', 'cliente_documento', 'usina_codigo_geradora',
  -- grandeza fisica e proporcao. Regra 1: mantem escala decimal, NUNCA viram
  -- centavos - sao kWh, percentual e R$/kWh com seis casas.
  'geracao_kwh_competencia', 'percentual_rateio_aplicado', 'consumo_kwh', 'tarifa_reais_por_kwh',
  -- dinheiro, em centavos inteiros
  'valor_consumo_centavos', 'valor_tarifas_concessionaria_centavos',
  'valor_juros_multa_centavos', 'valor_total_centavos',
  -- estado
  'flag_fatura_cheia'
);

-- --------------------------------------------------- identidade e recebimento

CREATE TABLE identidade_de_cobranca (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Um tenant, uma identidade. Mesmo argumento do `conector_cobranca`: duas
  -- identidades ativas fariam o documento escolher uma, e qual logo representa a
  -- empresa nao e decisao de planejador de consultas.
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenant(id),

  /*
   * O RECEBIMENTO Pix, e a distincao com a regra 5 e explicita: chave Pix NAO E
   * SEGREDO. Ela e identificador de destino, sai IMPRESSA no documento que
   * circula, e quem a tem consegue te PAGAR - nao consegue se autenticar como
   * voce. Segredo e o que autentica (`conector_cobranca.credencial_ref`); isto e
   * o que identifica.
   *
   * Os limites de tamanho vem do BR Code (EMV): campo 59 (nome do recebedor)
   * aceita 25 caracteres e o 60 (cidade) aceita 15. Cortar no banco e melhor que
   * cortar no gerador, onde o sintoma seria um QR que nao le.
   */
  pix_chave            text CHECK (length(pix_chave) BETWEEN 3 AND 77),
  pix_tipo_chave       tipo_chave_pix,
  pix_recebedor_nome   text CHECK (length(pix_recebedor_nome) BETWEEN 1 AND 25),
  pix_recebedor_cidade text CHECK (length(pix_recebedor_cidade) BETWEEN 1 AND 15),

  /*
   * TUDO OU NADA. Um Pix sem nome de recebedor gera um BR Code que alguns
   * aplicativos aceitam e outros recusam, e o modo de falha aparece no celular
   * do cliente - o pior lugar possivel para descobrir. Aqui a linha ou nao tem
   * Pix, ou tem os quatro.
   */
  CONSTRAINT identidade_pix_completo_ou_ausente CHECK (
    (pix_chave IS NULL AND pix_tipo_chave IS NULL
      AND pix_recebedor_nome IS NULL AND pix_recebedor_cidade IS NULL)
    OR (pix_chave IS NOT NULL AND pix_tipo_chave IS NOT NULL
      AND pix_recebedor_nome IS NOT NULL AND pix_recebedor_cidade IS NOT NULL)
  ),

  /*
   * METADADO da logo. O binario esta em `logo_de_cobranca`, e a razao esta no
   * cabecalho: `to_jsonb` de bytea custa 2,00x, medido.
   *
   * `logo_sha256` e o que faz a regra 9 valer sem carregar o arquivo: a trilha
   * registra a troca porque o hash muda.
   */
  logo_mime   text CHECK (logo_mime IN ('image/png', 'image/jpeg')),
  logo_bytes  integer CHECK (logo_bytes > 0 AND logo_bytes <= 524288),
  logo_sha256 text CHECK (logo_sha256 ~ '^[0-9a-f]{64}$'),

  CONSTRAINT identidade_logo_completa_ou_ausente CHECK (
    (logo_mime IS NULL AND logo_bytes IS NULL AND logo_sha256 IS NULL)
    OR (logo_mime IS NOT NULL AND logo_bytes IS NOT NULL AND logo_sha256 IS NOT NULL)
  ),

  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT identidade_de_cobranca_id_tenant UNIQUE (tenant_id, id)
);

COMMENT ON COLUMN identidade_de_cobranca.pix_chave IS
  'NAO e segredo, e a distincao e proposital: chave Pix identifica o DESTINO e '
  'sai impressa no documento. Quem a tem consegue pagar, nao se autenticar. '
  'Compare com conector_cobranca.credencial_ref, que e o oposto (regra 5).';
COMMENT ON COLUMN identidade_de_cobranca.logo_sha256 IS
  'A regra 9 sobre a logo SEM a logo na trilha. `app.auditar()` grava '
  'to_jsonb(OLD/NEW) da linha inteira, e bytea em to_jsonb custa 2,00x - medido '
  'em 30/07. O hash muda se e so se a imagem mudou.';

-- ------------------------------------------------------------ o binario, so

CREATE TABLE logo_de_cobranca (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
   * A LOGO PENDURA NA IDENTIDADE, e a FK e o mecanismo e nao um enfeite: a trilha
   * da logo acontece por PROPAGACAO para a linha auditada ao lado, e uma logo sem
   * linha de identidade propagaria para zero linhas - trilha ausente, em
   * silencio. Com a FK, esse estado nao existe.
   *
   * E ela e COMPOSTA (regra 2), como as dez outras. A primeira versao desta
   * migration referenciava `identidade_de_cobranca(tenant_id)` direto, achando
   * que uma FK sobre a propria coluna de tenant nao poderia atravessar tenant -
   * o `CAT-7` recusou, e ele esta certo por classe: a excecao que "obviamente nao
   * atravessa" e como a proxima, que atravessa, entra sem ninguem olhar.
   */
  tenant_id     uuid NOT NULL UNIQUE REFERENCES tenant(id),
  identidade_id uuid NOT NULL,

  /*
   * 512 KB de teto. Uma logo de cabecalho de fatura tem dezenas de KB; o teto
   * existe porque o caminho de upload aceita o que mandarem, e um PNG de camera
   * de 8 MB atravessaria o pool transacional inteiro.
   *
   * PNG e JPEG so - SVG esta FORA por decisao de 29/07, e o motivo e seguranca e
   * nao estetica: SVG e documento com script dentro, e a logo e embutida no HTML
   * do documento. Aceitar SVG seria executar codigo de terceiro na tela de quem
   * fatura.
   */
  conteudo bytea NOT NULL CHECK (octet_length(conteudo) BETWEEN 1 AND 524288),

  criado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT logo_de_cobranca_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT logo_identidade_fk
    FOREIGN KEY (tenant_id, identidade_id) REFERENCES identidade_de_cobranca (tenant_id, id)
);

COMMENT ON TABLE logo_de_cobranca IS
  'Auditada por PROPAGACAO, nao por app.auditar(): bytea em to_jsonb ocupa 2,00x '
  '(medido, 30/07), e auditar aqui poria 1,2 MB na trilha por troca de uma logo '
  'de 300 KB. O gatilho abaixo carimba o sha256 em identidade_de_cobranca, que '
  'e auditada - a trilha registra antes/depois do HASH. RLS e FORCE valem igual.';

/*
 * O HASH E DERIVADO PELO BANCO, e isso e mais forte do que parece: a aplicacao
 * nao escreve `logo_sha256`. Se ela escrevesse, o metadado poderia mentir sobre
 * o conteudo - bastaria um `UPDATE` na tabela de identidade sem tocar o binario,
 * e a trilha registraria uma troca que nao houve (ou pior, nao registraria a que
 * houve).
 *
 * Com o gatilho, `logo_sha256` e funcao do bytea, sempre. E como ele faz um
 * UPDATE na tabela auditada, `app.auditar()` dispara la e a regra 9 fica
 * cumprida por construcao, nao por alguem lembrar de atualizar as duas.
 */
CREATE OR REPLACE FUNCTION app.propagar_metadado_da_logo() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_mime text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.identidade_de_cobranca
       SET logo_mime = NULL, logo_bytes = NULL, logo_sha256 = NULL, atualizado_em = now()
     WHERE tenant_id = OLD.tenant_id;
    RETURN OLD;
  END IF;

  /*
   * O MIME SAI DOS BYTES, nao do que o upload alegou - e isso e mais que higiene.
   * Um mime declarado pode MENTIR: o caminho obvio de ataque e mandar um SVG
   * dizendo `image/png`, e a logo e embutida no HTML do documento, onde SVG
   * executa script. Aqui o tipo e reconhecido pela assinatura, entao a recusa
   * vale contra o CONTEUDO.
   *
   * PNG: 89 50 4E 47 0D 0A 1A 0A · JPEG: FF D8 FF. Nada mais entra.
   */
  IF substring(NEW.conteudo from 1 for 8) = '\x89504e470d0a1a0a'::bytea THEN
    v_mime := 'image/png';
  ELSIF substring(NEW.conteudo from 1 for 3) = '\xffd8ff'::bytea THEN
    v_mime := 'image/jpeg';
  ELSE
    RAISE EXCEPTION 'A logo nao e PNG nem JPEG: os primeiros bytes sao %. '
      'SVG esta fora de proposito - e documento com script dentro, e a logo e '
      'embutida no HTML do documento de cobranca.',
      encode(substring(NEW.conteudo from 1 for 8), 'hex');
  END IF;

  UPDATE public.identidade_de_cobranca
     SET logo_mime     = v_mime,
         logo_bytes    = octet_length(NEW.conteudo),
         logo_sha256   = encode(sha256(NEW.conteudo), 'hex'),
         atualizado_em = now()
   WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION app.propagar_metadado_da_logo() IS
  'Regra 9 sobre a logo SEM a logo na trilha. Carimba bytes e sha256 na tabela '
  'auditada; o UPDATE la dispara app.auditar(). O hash e derivado do bytea pelo '
  'BANCO, entao o metadado nao pode divergir do conteudo.';

-- ------------------------------------------------------- o layout, por tenant

CREATE TABLE campo_do_documento (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  campo     campo_de_fatura NOT NULL,

  /*
   * O rotulo e do tenant: "Crédito injetado" e "Energia compensada" sao o mesmo
   * campo com nomes diferentes, e quem fala com o cliente decide qual. NULL
   * significa "usa o rotulo padrao", que vive em codigo - e nao ha default aqui
   * porque um default no banco vira o rotulo de todo tenant futuro.
   */
  rotulo  text CHECK (rotulo IS NULL OR length(rotulo) BETWEEN 1 AND 40),

  /*
   * ORDEM SEM UNIQUE, e e escolha declarada. Com `UNIQUE (tenant_id, ordem)`,
   * trocar duas linhas de lugar viola a constraint no meio da transacao e exige
   * ou constraint deferida ou um valor de passagem. Sem ela, empate e desempatado
   * pelo nome do campo, de forma estavel - e o custo de dois campos na mesma
   * posicao e cosmetico, nao dinheiro.
   */
  ordem   smallint NOT NULL DEFAULT 0,
  visivel boolean NOT NULL DEFAULT true,

  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- Um campo aparece no maximo uma vez por tenant. Indice unico CHEIO, sem
  -- predicado: regra 11.
  CONSTRAINT campo_do_documento_unico UNIQUE (tenant_id, campo),
  CONSTRAINT campo_do_documento_id_tenant UNIQUE (tenant_id, id)
);

COMMENT ON TABLE campo_do_documento IS
  'O layout do documento, por tenant. VAZIO NAO E DOCUMENTO VAZIO: significa '
  '"usa o padrao", que vive em codigo. Nada e semeado aqui de proposito - um '
  'padrao no banco decidiria o layout de todo tenant futuro.';

-- ------------------------------------------------------------- regras 2, 3 e 9

ALTER TABLE identidade_de_cobranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE identidade_de_cobranca FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identidade_de_cobranca
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE logo_de_cobranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE logo_de_cobranca FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON logo_de_cobranca
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE campo_do_documento ENABLE ROW LEVEL SECURITY;
ALTER TABLE campo_do_documento FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campo_do_documento
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

-- Regra 9. A identidade decide PARA ONDE O DINHEIRO VAI (a chave Pix impressa) e
-- o layout decide O QUE O CLIENTE VE. As duas sao escrita de dado de negocio.
--
-- `logo_de_cobranca` tem gatilho tambem, e ele NAO e `app.auditar()` - e a
-- propagacao acima, pelo numero medido. O invariante 17 exige o gatilho; o 17-b,
-- acrescentado nesta migration, exige que quem NAO usa `app.auditar()` esteja
-- numa lista branca nomeada. Esta e a unica entrada dela.
CREATE TRIGGER auditar_logo_de_cobranca
  AFTER INSERT OR UPDATE OR DELETE ON logo_de_cobranca
  FOR EACH ROW EXECUTE FUNCTION app.propagar_metadado_da_logo();

CREATE TRIGGER auditar_identidade_de_cobranca
  AFTER INSERT OR UPDATE OR DELETE ON identidade_de_cobranca
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_campo_do_documento
  AFTER INSERT OR UPDATE OR DELETE ON campo_do_documento
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

GRANT SELECT, INSERT, UPDATE, DELETE ON identidade_de_cobranca TO app_financeiro;
GRANT SELECT, INSERT, UPDATE, DELETE ON logo_de_cobranca       TO app_financeiro;
GRANT SELECT, INSERT, UPDATE, DELETE ON campo_do_documento     TO app_financeiro;

-- A mesma guarda das migrations anteriores: RLS habilitada sem policy e falha,
-- nao configuracao (regra 3), e o modo de falha dela e resultado VAZIO - nao
-- erro. Por isso a verificacao e aqui, no fim da propria migration.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname IN ('identidade_de_cobranca', 'logo_de_cobranca', 'campo_do_documento')
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
