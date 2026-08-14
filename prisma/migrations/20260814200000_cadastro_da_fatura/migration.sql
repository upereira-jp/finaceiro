-- MIGRATION 28 - O CADASTRO DA FATURA. Pedido do dono em 14/08/2026, literal:
-- *"inclua como nova implementacao a funcionalidade de Cadastro de Fatura,
-- contemplando no minimo: emissor; logotipo; chave Pix; campos personalizados/
-- templates; demais informacoes necessarias para emissao completa de faturas."*
--
-- ============================================================================
-- O QUE JA EXISTIA, E O QUE ESTAVA FALTANDO
--
-- Tres dos cinco itens do pedido ja tinham coluna, rota e formulario:
--
--   emissor    `identidade_de_cobranca.razao_social` e `.cnpj`  (migration 26)
--   logotipo   `logo_de_cobranca.conteudo` + o metadado na identidade (19/20)
--   chave Pix  a tabela `chave_pix` inteira                      (migration 25)
--
-- Os outros dois nao existiam de forma nenhuma, e um TERCEIRO buraco apareceu
-- quando fui medir: **o que a folha imprime e nao tem de onde vir**.
--
-- ============================================================================
-- O BURACO MEDIDO: A FOLHA 2 IMPRIME UM RODAPE QUE NINGUEM PODE PREENCHER
--
-- `src/dominio/folha-unificada.ts` declara `ContatoDoEmissor` - telefone,
-- endereco e e-mail - e o usa para compor a coluna esquerda do rodape da folha 2.
-- Medido em 14/08: `grep -rn ContatoDoEmissor src/ web/src/ tests/` devolve a
-- definicao, um uso interno e um teste. **Nenhum chamador de producao.**
--
-- A rota `POST /faturas/unificada/compor` chama `comporFolhas` com QUATRO
-- argumentos; o quinto (`extras`) tem default `{}`. Entao `telefone` sai `''`,
-- `endereco` e `email` saem `null`, a tela os esconde sob guarda de truthy, e o
-- rodape da folha do cliente sai com a linha do emissor e mais nada.
--
-- E nao havia de onde tirar: `identidade_de_cobranca` nao tem telefone, nem
-- endereco, nem e-mail. E o mesmo defeito que a migration 26 descreve com estas
-- palavras - *"a coluna existia e nao havia formulario; um campo que so o psql
-- alcanca nao e um campo, e uma coluna"* -, agora do lado oposto: **o formulario
-- nao existia porque a coluna nao existia, e o codigo que consome as duas ja
-- estava escrito e testado.**
--
-- ============================================================================
-- O SEGUNDO BURACO: TEXTO DE UMA EMPRESA SO, CRAVADO NO CODIGO
--
-- Cinco textos que saem impressos na fatura de QUALQUER tenant estao escritos
-- em `folha-unificada.ts` e em `folha-g3.ts`:
--
--   'Energia Solar por Assinatura'                             a assinatura do topo
--   'Nao pague a conta da Equatorial' + o corpo do aviso        a faixa laranja
--   'Apos o vencimento incidem multa de 2% e juros de 1% ao mes'
--   'EMITIDO PELA COOPERATIVA CONTRATANTE SEM RESPONSABILIDADE DO BANCOOB'
--   'COOPERATIVA CONTRATANTE 5004 SICOOB UNICENTRO BR'
--
-- As duas ultimas carregam o CODIGO 5004 e o nome de uma cooperativa especifica.
-- E exatamente o defeito que a migration 26 tirou do emissor: *"escrever o CNPJ
-- da G3 no fonte poria o CNPJ dela na fatura de outro tenant"*. Aqui poe o banco
-- de outro tenant, e sob a assinatura de um banco que nunca viu o documento.
--
-- ============================================================================
-- O DESENHO: IDENTIDADE E QUEM, MODELO E COMO
--
-- Duas coisas diferentes, e junta-las seria o erro classico deste tipo de
-- cadastro:
--
--   `identidade_de_cobranca`  QUEM emite - razao social, CNPJ, contato, logo,
--                             chave Pix padrao. Uma por tenant, e ja era assim
--   `modelo_de_fatura`        COMO a folha le - assinatura, textos, parametros
--                             padrao, rodape legal - mais os campos e os campos
--                             personalizados que pendem dele. VARIAS por tenant
--
-- Por que o modelo e varios e a identidade e uma: a empresa e uma so, e a mesma
-- empresa fatura de mais de um jeito. Um modelo para a fatura unificada da
-- Equatorial, outro para um convenio diferente, outro para um cliente que exige
-- um campo a mais. Trocar de modelo nao pode significar reescrever quem emite.
--
-- QUAL MODELO VALE E UM PONTEIRO NA IDENTIDADE (`modelo_padrao_id`), e nao uma
-- coluna `padrao boolean` no modelo. Os dois desenhos resolvem "qual e o
-- vigente"; o segundo precisaria de um indice unico PARCIAL sobre
-- `(tenant_id) WHERE padrao`, e `(tenant_id)` e **exatamente** o conjunto de
-- colunas da FK para `tenant` - o que a **regra 11** proibe, e pelo motivo
-- medido nela: o `db pull` do Prisma 7.9 ignora o predicado e inferiria uma
-- relacao to-one de `tenant` para `modelo_de_fatura`. O ponteiro e o mesmo
-- desenho de `chave_pix_padrao_id` (migration 25), que ja passou por isto.
--
-- ============================================================================
-- CAMPOS PERSONALIZADOS: POR QUE UMA TABELA NOVA E NAO MAIS UM VALOR NO ENUM
--
-- `campo_do_documento` configura os **16 campos do enum `campo_de_fatura`**:
-- ordem, rotulo e visibilidade. O que ele NAO permite e o tenant inventar um
-- campo - e nao permite por construcao, porque o enum e fechado e um valor novo
-- nele e uma migration.
--
-- Isso esta certo para os 16: eles nomeiam colunas da `fatura`, e um nome de
-- campo que a tela inventasse seria recusado pelo banco - com o erro saindo do
-- lado errado. E esta errado para o resto: "Contrato n", "Vendedor", "Placa da
-- usina" sao dados do tenant que nao existem em coluna nenhuma nossa e nunca vao
-- existir.
--
-- Entao sao dois vocabularios, e a tabela nova nao substitui a antiga:
--
--   `campo_do_documento`             os 16 do enum. ORDEM, ROTULO, VISIBILIDADE
--   `campo_personalizado_da_fatura`  os do tenant. CHAVE, ROTULO, VALOR, ORIGEM
--
-- A `origem` tem dois valores e a distincao e de onde o valor vem:
--
--   `fixo`      o valor esta nesta linha e sai IGUAL em toda fatura do modelo
--   `variavel`  o valor e digitado A CADA fatura, na aba de leitura
--
-- ============================================================================
-- O QUE ESTA MIGRATION NAO FAZ, DE PROPOSITO
--
-- Nao inventa valor nenhum para o rodape legal. Ele nasce VAZIO, e vazio faz a
-- folha OMITIR as linhas - a mesma regra ja aplicada ao emissor e ao
-- beneficiario neste projeto: ausente e ausente, nunca o texto de outro. Copiar
-- 'SICOOB UNICENTRO BR' para dentro do banco na migration transformaria um
-- literal errado em um dado errado, que e pior: o literal ao menos dava para
-- achar por grep.

-- ============================================== 1. O CONTATO DE QUEM EMITE
--
-- Nulaveis, pelo mesmo motivo da migration 26: a tabela ja tem linha em
-- producao, e o que se adivinhasse aqui sairia impresso na fatura do cliente.

ALTER TABLE identidade_de_cobranca
  ADD COLUMN telefone text,
  ADD COLUMN endereco text,
  ADD COLUMN email    text,
  ADD COLUMN site     text;

-- Vazio nao e valor: `''` passaria por um NOT NULL que nao existe e sairia
-- impresso como espaco em branco sob o rotulo. Mesma decisao de
-- `razao_social_da_identidade_nao_vazia` na migration 26.
ALTER TABLE identidade_de_cobranca
  ADD CONSTRAINT contato_da_identidade_nao_vazio CHECK (
    (telefone IS NULL OR length(btrim(telefone)) > 0) AND
    (endereco IS NULL OR length(btrim(endereco)) > 0) AND
    (email    IS NULL OR length(btrim(email))    > 0) AND
    (site     IS NULL OR length(btrim(site))     > 0)
  );

/*
 * O E-MAIL E CONFERIDO POR FORMA MINIMA E NAO POR EXPRESSAO DE VALIDACAO.
 * A forma completa da RFC 5322 num CHECK e uma segunda implementacao de
 * validacao de e-mail, em SQL, que envelhece separado da da aplicacao - a mesma
 * divisao que a migration 26 escreveu para o CNPJ: o banco sabe o que e FORMATO,
 * a aplicacao sabe o resto. Aqui o formato e "tem uma arroba, com coisa dos dois
 * lados, e nao tem espaco". Isso ja barra o que de fato acontece, que e alguem
 * colar um nome no campo do e-mail.
 */
ALTER TABLE identidade_de_cobranca
  ADD CONSTRAINT email_da_identidade_tem_forma
  CHECK (email IS NULL OR email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

COMMENT ON COLUMN identidade_de_cobranca.telefone IS
  'Telefone impresso no rodape da folha 2, no bloco "Duvidas? Fale com a gente". Nulo enquanto o tenant nao cadastrou, e nulo faz a folha OMITIR o bloco.';
COMMENT ON COLUMN identidade_de_cobranca.endereco IS
  'Endereco impresso no rodape da folha 2. Texto livre de uma linha - nao e endereco estruturado, porque nada aqui o consulta, so imprime.';
COMMENT ON COLUMN identidade_de_cobranca.email IS
  'E-mail de atendimento impresso no rodape da folha 2. Forma minima conferida pelo CHECK; o resto e da aplicacao.';
COMMENT ON COLUMN identidade_de_cobranca.site IS
  'Site do emissor, impresso no rodape da folha 2 quando preenchido.';

-- ==================================================== 2. O MODELO DE FATURA
--
-- O TEMPLATE. Um conjunto nomeado de decisoes sobre COMO a folha le, reusavel e
-- trocavel sem tocar em quem emite.

CREATE TABLE modelo_de_fatura (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,

  nome      text NOT NULL,
  descricao text,

  /*
   * A ASSINATURA DO TOPO. Sai em 9pt caixa-alta com `letter-spacing .26em`, ao
   * lado da logo. Era 'Energia Solar por Assinatura' literal em
   * `folha-unificada.ts` e em `folha-g3.ts` - a frase de UMA empresa, impressa
   * na folha de todas.
   */
  assinatura text NOT NULL DEFAULT 'Energia Solar por Assinatura',

  /*
   * O AVISO LARANJA. E a unica faixa da folha que precisa ser lida ANTES do
   * valor, e o texto dela e especifico da distribuidora: "Nao pague a conta da
   * Equatorial" nao serve a um tenant que fatura contra a CEMIG.
   *
   * Os dois nasceram com o texto que ja estava no codigo, e aqui isso NAO e a
   * contradicao do cabecalho: o aviso e uma frase de PRODUTO que o sistema
   * inteiro exibe hoje e que nenhum tenant novo existe para contradizer. O que
   * a migration se recusa a inventar e dado de TERCEIRO - o codigo de uma
   * cooperativa bancaria -, que e outra coisa.
   */
  aviso_titulo text NOT NULL DEFAULT 'Não pague a conta da Equatorial',
  aviso_corpo  text NOT NULL DEFAULT 'Sua conta é unificada — o valor da distribuidora já está incluído neste boleto. Pagar a conta da Equatorial gera duplicidade.',

  /*
   * OS PARAMETROS PADRAO DA EMISSAO. Ate aqui eles eram `PARAMETROS_PADRAO` em
   * `src/dominio/fatura-unificada.ts` - 20% e 0,029 - e a tela os oferecia
   * editaveis sem lugar nenhum para gravar a escolha. Quem opera redigitava 20
   * em toda fatura, ou esquecia e faturava com o numero errado.
   *
   * NAO SAO CENTAVOS, e a regra 1 diz por que: percentual e proporcao, fator de
   * emissao e grandeza fisica. Os dois mantem escala decimal.
   */
  percentual_desconto_padrao numeric(5,2)  NOT NULL DEFAULT 20,
  fator_emissao_padrao       numeric(12,6) NOT NULL DEFAULT 0.029,

  /*
   * MULTA E JUROS. Saem na linha "Apos o vencimento incidem multa de 2% e juros
   * de 1% ao mes" do rodape da folha 2, e eram os dois numeros literais dela.
   * Sao percentuais - decimal, nunca centavos.
   */
  multa_percentual     numeric(5,2) NOT NULL DEFAULT 2,
  juros_mes_percentual numeric(5,2) NOT NULL DEFAULT 1,

  /*
   * O RODAPE LEGAL, e ele nasce VAZIO. Ver o cabecalho: as duas linhas que
   * estavam no codigo nomeiam uma cooperativa especifica e o numero dela, e
   * copia-las para ca faria toda fatura de todo tenant continuar afirmando que
   * um banco que nunca viu o documento responde por ele.
   *
   * Vazio faz a folha omitir a faixa inteira. Quem tem convenio Sicoob digita as
   * duas linhas no cadastro, uma vez.
   */
  rodape_legal text[] NOT NULL DEFAULT '{}',

  /*
   * A NOTA DO FATOR DE CO2. Sai sob o indicador de CO2 evitado, e cita a fonte -
   * hoje "Fator medio da margem de operacao do SIN - MCTI/SIRENE". Fonte de
   * numero e coisa que muda de ano e de orgao; deixa-la literal seria assinar
   * uma citacao que ninguem revisa.
   */
  nota_do_fator text NOT NULL DEFAULT 'Fator médio da margem de operação do SIN · MCTI/SIRENE',

  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT modelo_nome_nao_vazio       CHECK (length(btrim(nome)) > 0),
  CONSTRAINT modelo_assinatura_nao_vazia CHECK (length(btrim(assinatura)) > 0),
  CONSTRAINT modelo_aviso_nao_vazio      CHECK (length(btrim(aviso_titulo)) > 0 AND length(btrim(aviso_corpo)) > 0),
  /*
   * O TETO DO DESCONTO E 50, E O NUMERO TEM ORIGEM. E o `max` do controle da
   * referencia (`min 0, max 50, step 0.5`), que e o unico valor medido que
   * existe para isto. Sem teto, 150% compoe a folha inteira com total NEGATIVO e
   * os tres cartoes SAEM - medido em 14/08 com 500 kWh a 1,185396: desconto
   * R$ 889,05 acima de "sem a G3 R$ 592,70", e total a pagar -R$ 196,35.
   */
  CONSTRAINT modelo_desconto_na_faixa CHECK (percentual_desconto_padrao BETWEEN 0 AND 50),
  CONSTRAINT modelo_fator_positivo    CHECK (fator_emissao_padrao > 0),
  CONSTRAINT modelo_encargos_na_faixa CHECK (
    multa_percentual     BETWEEN 0 AND 100 AND
    juros_mes_percentual BETWEEN 0 AND 100
  ),

  CONSTRAINT modelo_de_fatura_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

-- (tenant_id, id) redundante com a PK e NECESSARIO: e o lado definidor das FKs
-- compostas de `campo_do_documento`, `campo_personalizado_da_fatura` e
-- `identidade_de_cobranca`. Regra 2, e CAT-2 de `tests/catalogo.sql`.
CREATE UNIQUE INDEX modelo_de_fatura_id_tenant ON modelo_de_fatura (tenant_id, id);
CREATE UNIQUE INDEX modelo_de_fatura_nome_unico ON modelo_de_fatura (tenant_id, nome);

COMMENT ON TABLE modelo_de_fatura IS
  'TEMPLATE da fatura: como a folha LE. Assinatura, textos, parametros padrao e rodape legal, '
  'mais os campos e campos personalizados que pendem dele. Quem EMITE e identidade_de_cobranca, '
  'que e uma por tenant; de modelo ha varios, e o vigente e identidade_de_cobranca.modelo_padrao_id.';
COMMENT ON COLUMN modelo_de_fatura.rodape_legal IS
  'As linhas legais do banco, no pe da caixa de pagamento. VAZIO faz a folha OMITIR a faixa - '
  'e o padrao, porque texto de banco so e verdade quando ha convenio, e afirma-lo sem convenio '
  'poria a assinatura de um banco num documento que ele nunca viu.';

-- ================================ 3. UM MODELO PADRAO PARA QUEM JA TEM CADASTRO
--
-- Producao tem UMA identidade e 15 campos configurados. Os dois precisam de um
-- modelo para pendurar, e ele nasce aqui em vez de exigir que alguem clique -
-- pela mesma razao da migration 25, que MOVEU a chave Pix em vez de pedir que
-- ela fosse redigitada: reproduzir a mao um dado que o banco ja tem e onde a
-- divergencia entra.

INSERT INTO modelo_de_fatura (tenant_id, nome, descricao)
SELECT t.id, 'Padrão',
       'Criado pela migration 28 com os textos que estavam no código até 14/08/2026.'
  FROM tenant t
 WHERE EXISTS (SELECT 1 FROM identidade_de_cobranca i WHERE i.tenant_id = t.id)
    OR EXISTS (SELECT 1 FROM campo_do_documento c     WHERE c.tenant_id = t.id);

-- =========================== 4. OS 16 CAMPOS DO ENUM PASSAM A PENDER DO MODELO
--
-- `campo_do_documento` era (tenant_id, campo) unico - uma configuracao por
-- tenant. Com o modelo, e uma configuracao por MODELO: o mesmo tenant pode ter
-- "Fatura unificada" mostrando a tarifa e "Fatura simples" escondendo-a.

ALTER TABLE campo_do_documento ADD COLUMN modelo_id uuid;

UPDATE campo_do_documento c
   SET modelo_id = m.id
  FROM modelo_de_fatura m
 WHERE m.tenant_id = c.tenant_id;

/*
 * NOT NULL DEPOIS DO BACKFILL, e nao junto com a coluna. Um DEFAULT nao serviria
 * (nao ha valor constante possivel) e um NOT NULL na criacao recusaria a
 * migration com 15 linhas ja na tabela.
 *
 * O `DELETE` abaixo e a rede: se sobrar linha sem modelo, ela e de um tenant que
 * o passo 3 nao alcancou - e um tenant sem identidade e sem outros campos, o que
 * e contradicao com a linha existir. Medido em producao: zero.
 */
DELETE FROM campo_do_documento WHERE modelo_id IS NULL;
ALTER TABLE campo_do_documento ALTER COLUMN modelo_id SET NOT NULL;

ALTER TABLE campo_do_documento
  ADD CONSTRAINT campo_do_documento_modelo_fk
  FOREIGN KEY (tenant_id, modelo_id) REFERENCES modelo_de_fatura (tenant_id, id);

/* E CONSTRAINT, E NAO INDICE SOLTO - a migration 19 o criou com `UNIQUE (...)`
 * dentro do `CREATE TABLE`, e o Postgres recusa `DROP INDEX` sobre o indice que
 * sustenta uma constraint. Sai pela constraint; entra como indice, que e a forma
 * que o resto deste schema usa (ver `chave_pix_apelido_unico`). */
ALTER TABLE campo_do_documento DROP CONSTRAINT campo_do_documento_unico;
CREATE UNIQUE INDEX campo_do_documento_unico
  ON campo_do_documento (tenant_id, modelo_id, campo);

CREATE INDEX campo_do_documento_modelo_idx
  ON campo_do_documento (tenant_id, modelo_id, ordem);

COMMENT ON COLUMN campo_do_documento.modelo_id IS
  'O modelo a que esta configuracao pertence. Ate a migration 28 havia uma configuracao por '
  'tenant; agora ha uma por modelo, e o vigente e identidade_de_cobranca.modelo_padrao_id.';

-- ======================================== 5. OS CAMPOS PERSONALIZADOS DO TENANT

CREATE TYPE origem_do_campo AS ENUM ('fixo', 'variavel');

COMMENT ON TYPE origem_do_campo IS
  'De onde sai o valor de um campo personalizado. `fixo`: esta na propria linha e sai igual em '
  'toda fatura do modelo. `variavel`: e digitado a cada fatura, na aba de leitura.';

CREATE TABLE campo_personalizado_da_fatura (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  modelo_id uuid NOT NULL,

  /*
   * A CHAVE E UM SLUG E NAO O ROTULO. O rotulo muda ("Vendedor" vira "Consultor
   * responsavel") e o valor de uma fatura ja registrada continua tendo de achar
   * o campo dele. Minusculo, sem acento e sem espaco, porque ele viaja como
   * chave de objeto JSON entre a tela, a rota e o registro da fatura.
   */
  chave  text NOT NULL,
  rotulo text NOT NULL,

  origem origem_do_campo NOT NULL DEFAULT 'fixo',

  /*
   * O VALOR, so para `fixo`. Em `variavel` ele e NULL aqui e chega por fatura.
   * O CHECK amarra os dois: campo fixo sem valor imprimiria um rotulo com nada
   * embaixo, que e a mesma classe do travessao que este projeto recusa.
   */
  valor text,

  ordem   smallint NOT NULL DEFAULT 0,
  visivel boolean  NOT NULL DEFAULT true,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campo_personalizado_chave_forma
    CHECK (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  CONSTRAINT campo_personalizado_rotulo_nao_vazio
    CHECK (length(btrim(rotulo)) > 0),
  CONSTRAINT campo_personalizado_fixo_tem_valor
    CHECK (origem <> 'fixo' OR (valor IS NOT NULL AND length(btrim(valor)) > 0)),
  CONSTRAINT campo_personalizado_variavel_sem_valor
    CHECK (origem <> 'variavel' OR valor IS NULL),

  CONSTRAINT campo_personalizado_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT campo_personalizado_modelo_fk
    FOREIGN KEY (tenant_id, modelo_id) REFERENCES modelo_de_fatura (tenant_id, id)
);

CREATE UNIQUE INDEX campo_personalizado_id_tenant
  ON campo_personalizado_da_fatura (tenant_id, id);
CREATE UNIQUE INDEX campo_personalizado_chave_unica
  ON campo_personalizado_da_fatura (tenant_id, modelo_id, chave);
CREATE INDEX campo_personalizado_modelo_idx
  ON campo_personalizado_da_fatura (tenant_id, modelo_id, ordem);

COMMENT ON TABLE campo_personalizado_da_fatura IS
  'Campos que o TENANT inventa, ao lado dos 16 do enum campo_de_fatura. Aqueles nomeiam colunas '
  'da fatura e por isso o enum e fechado; estes nomeiam dados que nao existem em coluna nenhuma '
  'nossa - "Contrato n", "Vendedor", "Placa da usina" - e por isso sao linha e nao valor de enum.';

-- ======================================= 6. QUAL MODELO ESTA VALENDO
--
-- Ponteiro na identidade, e nao `padrao boolean` no modelo. Ver o cabecalho: a
-- segunda forma exigiria indice unico PARCIAL sobre `(tenant_id)`, que e
-- exatamente o conjunto de colunas da FK para `tenant` - regra 11.

ALTER TABLE identidade_de_cobranca ADD COLUMN modelo_padrao_id uuid;

ALTER TABLE identidade_de_cobranca
  ADD CONSTRAINT identidade_modelo_fk
  FOREIGN KEY (tenant_id, modelo_padrao_id) REFERENCES modelo_de_fatura (tenant_id, id);

UPDATE identidade_de_cobranca i
   SET modelo_padrao_id = m.id
  FROM modelo_de_fatura m
 WHERE m.tenant_id = i.tenant_id;

/*
 * ESTE UNIQUE E REDUNDANTE PARA O BANCO E NECESSARIO PARA O GERADOR, e a
 * migration 25 ja passou por isto com `(tenant_id, chave_pix_padrao_id)`:
 * `identidade_de_cobranca.tenant_id` e UNIQUE, entao o `db pull` infere a
 * relacao como to-one e o validador do Prisma 7.9 exige unicidade sobre as
 * colunas da FK. Sem ele o schema puxado do banco nao compila (P1012).
 *
 * Semanticamente nao restringe nada novo: ha no maximo UMA identidade por
 * tenant, entao "o mesmo modelo padrao em duas identidades do mesmo tenant" ja
 * era impossivel.
 */
CREATE UNIQUE INDEX identidade_modelo_unico
  ON identidade_de_cobranca (tenant_id, modelo_padrao_id);

COMMENT ON COLUMN identidade_de_cobranca.modelo_padrao_id IS
  'O modelo que vale ao compor. NULL e legitimo: tenant que ainda nao criou modelo nenhum - e '
  'nesse caso a folha cai nos textos padrao do dominio, com os parametros padrao.';

-- ================================================ 7. ISOLAMENTO E PERMISSAO

ALTER TABLE modelo_de_fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelo_de_fatura FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON modelo_de_fatura
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

ALTER TABLE campo_personalizado_da_fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE campo_personalizado_da_fatura FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON campo_personalizado_da_fatura
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON modelo_de_fatura TO app_financeiro;
GRANT SELECT, INSERT, UPDATE, DELETE ON campo_personalizado_da_fatura TO app_financeiro;

/*
 * DELETE REVOGADO NO MODELO, PERMITIDO NO CAMPO, e a assimetria e deliberada.
 *
 * Apagar um modelo apagaria a configuracao de campos que pende dele, e um
 * modelo que ja imprimiu fatura descreve como aquela fatura saiu - a segunda
 * via de uma fatura precisa achar o modelo dela. Tirar de circulacao e
 * `ativo = false`, como em `chave_pix`.
 *
 * Um campo personalizado e outra coisa: ele foi acrescentado por engano com a
 * mesma facilidade com que foi acrescentado, e mante-lo invisivel para sempre
 * porque um dia alguem o digitou seria transformar erro de digitacao em
 * historia. A trilha da regra 9 grava o "antes" do DELETE.
 */
REVOKE DELETE ON modelo_de_fatura FROM app_financeiro;

-- ========================================================= 8. AUDITORIA
--
-- Regra 9 / invariante 17. O que muda aqui sai IMPRESSO na fatura do cliente -
-- quem emite, o telefone de atendimento, o texto do aviso -, e "a folha saiu
-- diferente e ninguem sabe desde quando" e exatamente o que a trilha impede.
--
-- `identidade_de_cobranca` NAO precisa de gatilho novo: ela ja tem
-- `auditar_identidade_de_cobranca` desde a migration 21, e coluna nova entra
-- nele sozinha. E o retorno de ter posto trilha por TABELA e nao por coluna.

CREATE TRIGGER auditar_modelo_de_fatura
  AFTER INSERT OR UPDATE OR DELETE ON modelo_de_fatura
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

CREATE TRIGGER auditar_campo_personalizado_da_fatura
  AFTER INSERT OR UPDATE OR DELETE ON campo_personalizado_da_fatura
  FOR EACH ROW EXECUTE FUNCTION app.auditar();
