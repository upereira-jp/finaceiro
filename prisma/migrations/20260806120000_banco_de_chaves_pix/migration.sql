-- MIGRATION 25 - O BANCO DE CHAVES PIX. Decidido pelo dono em 06/08/2026,
-- opcao (a): uma chave PADRAO por tenant, com troca no momento de compor o lote.
--
-- DE ONDE ELA VEM. Ate aqui a chave Pix morava em quatro colunas de
-- `identidade_de_cobranca`, que e UMA linha por tenant (UNIQUE tenant_id). Isso
-- comportava exatamente uma chave, sem nome, sem titular e sem historia - e o
-- dono pediu um cadastro: varias chaves, cada uma com APELIDO proprio, e na hora
-- de faturar escolhe-se pelo apelido em vez de reconhecer um CNPJ de cor.
--
-- O QUE ESTA MIGRATION FAZ DE VERDADE, e a ordem importa:
--   1. cria `chave_pix`, o cadastro;
--   2. MOVE a linha que ja existe em producao para dentro dele, sem digitacao;
--   3. troca as quatro colunas por um ponteiro para a chave padrao;
--   4. da a `fatura` a chave que ela USOU, e CONGELA depois de emitida.
--
-- ================================================================= O CONGELAMENTO
--
-- O item 4 e o que nao era obvio e e o que custa caro se faltar. Um QR ja
-- impresso e entregue ao cliente nao pode mudar porque alguem editou o cadastro
-- depois: a segunda via sairia com destino diferente da primeira, **sem erro e
-- sem log**, e as duas seriam "a fatura 123". E a mesma classe da R20-b, que
-- congela `originador_tipo_no_fechamento` no `rascunhar` - e a mesma classe da
-- `conta_pagar_de_split_imutavel` da migration 22, cujo gatilho e copiado aqui.
--
-- A janela em que a troca AINDA e livre e o rascunho, e e de proposito: compor,
-- olhar, trocar a chave, emitir. Depois de emitida, nao.
--
-- POR QUE `ativa` E NAO `DELETE`. Chave que ja pagou fatura nao pode sumir - a
-- FK da fatura aponta para ela, e apagar reescreveria a historia de um documento
-- que circulou. `DELETE` fica revogado, como em `pagamento` e `conta_pagar`, e
-- tirar uma chave de circulacao e `ativa = false`.
--
-- POR QUE (tenant_id, chave) E UNICO. Duas linhas com a mesma chave e apelidos
-- diferentes nao sao duas chaves - sao duas formas de dizer o mesmo destino, e a
-- tela ofereceria as duas sem nada distinguir. O apelido resolve nome; a chave
-- resolve destino, e destino nao se repete.

-- =========================================================== 1. O CADASTRO
CREATE TABLE chave_pix (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,

  /*
   * O APELIDO E LOCAL e nao viaja no BR Code. Ele existe para a pessoa que
   * escolhe - "G3 GESTAO ENERGIA SOLAR", "Conta antiga", "Usina 3" - e e por
   * ele que a tela lista. Nao ha teto de 25 aqui porque ele nao e o campo 59.
   */
  apelido   text NOT NULL,

  /*
   * Os QUATRO campos que saem de `identidade_de_cobranca`. Os tetos sao os do
   * BR Code (EMV): campo 59 aceita 25 e o 60 aceita 15, e cortar no banco e
   * melhor que cortar no gerador - la o sintoma e um QR que nao le.
   */
  tipo             tipo_chave_pix NOT NULL,
  chave            text NOT NULL,
  recebedor_nome   text NOT NULL,
  recebedor_cidade text NOT NULL,

  /*
   * PARA QUEM E A CHAVE. Nao e o mesmo que `recebedor_nome`: aquele e o que o
   * padrao deixa caber em 25 caracteres ASCII maiusculos, e este e a pessoa
   * juridica de verdade. Sao nullable porque uma chave util nao depende deles -
   * exigi-los faria o cadastro travar por dado que so o contador tem.
   */
  titular_nome      text,
  titular_documento text,
  observacao        text,

  ativa      boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chave_pix_apelido_nao_vazio CHECK (length(btrim(apelido)) > 0),
  CONSTRAINT chave_pix_tamanho          CHECK (length(chave) BETWEEN 3 AND 77),
  CONSTRAINT chave_pix_nome_tamanho     CHECK (length(recebedor_nome) BETWEEN 1 AND 25),
  CONSTRAINT chave_pix_cidade_tamanho   CHECK (length(recebedor_cidade) BETWEEN 1 AND 15),

  /*
   * ESPACO NA CHAVE E RECUSADO PELO BANCO, e nao so pela aplicacao.
   *
   * `src/dominio/chave-pix.ts` ja confere a forma contra o tipo, e este CHECK
   * NAO o substitui - ele e o piso. A guarda da aplicacao sabe que um CNPJ tem
   * digito verificador; o banco nao vai saber disso nunca. O que ele consegue
   * afirmar e que nenhuma chave carrega espaco, e essa e a unica classe que
   * quebra o campo 01 do EMV de um jeito que o leitor nao denuncia.
   */
  CONSTRAINT chave_pix_sem_espaco CHECK (chave !~ '\s'),

  CONSTRAINT chave_pix_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

-- (tenant_id, id) redundante com a PK e NECESSARIO: e o lado definidor das FKs
-- compostas de `identidade_de_cobranca` e `fatura` - regra 2, e CAT-2.
CREATE UNIQUE INDEX chave_pix_id_tenant     ON chave_pix (tenant_id, id);
CREATE UNIQUE INDEX chave_pix_apelido_unico ON chave_pix (tenant_id, apelido);
CREATE UNIQUE INDEX chave_pix_chave_unica   ON chave_pix (tenant_id, chave);

COMMENT ON TABLE chave_pix IS
  'Cadastro de chaves Pix de RECEBIMENTO do tenant. Chave Pix NAO E SEGREDO (regra 5): '
  'ela identifica destino e sai impressa no documento. Quem a tem consegue pagar, nao se '
  'autenticar. O que e segredo mora em conector_cobranca.credencial_ref.';
COMMENT ON COLUMN chave_pix.apelido IS
  'Nome LOCAL, so para escolher. Nao viaja no BR Code.';
COMMENT ON COLUMN chave_pix.recebedor_nome IS
  'Campo 59 do BR Code, teto de 25. O que o cliente ve no celular ao pagar.';

-- ============================ 2. A LINHA QUE JA EXISTE, MOVIDA E NAO DIGITADA
--
-- Producao tem UMA identidade com Pix preenchido (gravada em 06/08). Ela entra
-- no cadastro com o apelido igual ao nome do recebedor, que e exatamente o nome
-- que o dono escolheu. Digitar de novo seria pedir que uma pessoa reproduzisse a
-- mao um dado que o banco ja tem - e a chance de divergir nao e zero.
INSERT INTO chave_pix (tenant_id, apelido, tipo, chave, recebedor_nome, recebedor_cidade, observacao)
SELECT tenant_id, pix_recebedor_nome, pix_tipo_chave, pix_chave,
       pix_recebedor_nome, pix_recebedor_cidade,
       'Migrada de identidade_de_cobranca pela migration 25.'
FROM identidade_de_cobranca
WHERE pix_chave IS NOT NULL
  AND pix_tipo_chave IS NOT NULL
  AND pix_recebedor_nome IS NOT NULL
  AND pix_recebedor_cidade IS NOT NULL;

-- ==================================================== 3. A IDENTIDADE APONTA
ALTER TABLE identidade_de_cobranca
  ADD COLUMN chave_pix_padrao_id uuid,
  ADD CONSTRAINT identidade_chave_pix_fk
    FOREIGN KEY (tenant_id, chave_pix_padrao_id) REFERENCES chave_pix (tenant_id, id);

UPDATE identidade_de_cobranca i
   SET chave_pix_padrao_id = c.id
  FROM chave_pix c
 WHERE c.tenant_id = i.tenant_id
   AND c.chave = i.pix_chave;

/*
 * AS QUATRO COLUNAS SAEM AGORA, e nao "depois, com calma".
 *
 * Deixa-las como copia faria duas verdades sobre para onde o dinheiro vai, e o
 * modo de falha de duas verdades e sempre o mesmo: alguem edita uma e le a
 * outra. O CHECK `identidade_pix_completo_ou_ausente` cai junto com elas, e o
 * "tudo ou nada" que ele defendia passa a ser estrutural - a chave agora e uma
 * LINHA, e linha nao existe pela metade.
 */
ALTER TABLE identidade_de_cobranca
  DROP COLUMN pix_chave,
  DROP COLUMN pix_tipo_chave,
  DROP COLUMN pix_recebedor_nome,
  DROP COLUMN pix_recebedor_cidade;

/*
 * ESTE UNIQUE E REDUNDANTE PARA O BANCO E NECESSARIO PARA O GERADOR, e ele nao
 * estava na primeira versao desta migration - o `prisma generate` recusou com
 * **P1012** e foi assim que ele apareceu.
 *
 * A causa e a `Q-PRISMA11B-01`, e o precedente e a migration 20, que passou por
 * isto com `(tenant_id, identidade_id)`. `identidade_de_cobranca.tenant_id` e
 * UNIQUE, entao o `db pull` infere a relacao com `chave_pix` como **to-one** - e
 * o validador exige que o lado definidor tenha unicidade sobre as colunas da FK.
 * Sem este indice o schema puxado do banco NAO COMPILA.
 *
 * E O CONSERTO E AQUI, e nao no `schema.prisma`: a regra 11 diz que editar
 * compila e o `db pull` seguinte reverte em silencio. Foi a mesma conclusao da
 * 20, e a segunda vez que este projeto a alcanca pelo mesmo caminho.
 *
 * Semanticamente ele nao restringe nada que ja nao estivesse restrito: ha no
 * maximo UMA identidade por tenant, entao "a mesma chave padrao em duas
 * identidades do mesmo tenant" ja era impossivel.
 */
CREATE UNIQUE INDEX identidade_chave_pix_unico
  ON identidade_de_cobranca (tenant_id, chave_pix_padrao_id);

COMMENT ON COLUMN identidade_de_cobranca.chave_pix_padrao_id IS
  'A chave sugerida ao compor o lote. NULL e legitimo: tenant sem Pix cadastrado. '
  'Quem decide de fato e fatura.chave_pix_id, que congela na emissao.';

-- ================================================= 4. A FATURA GUARDA A SUA
ALTER TABLE fatura
  ADD COLUMN chave_pix_id uuid,
  ADD CONSTRAINT fatura_chave_pix_fk
    FOREIGN KEY (tenant_id, chave_pix_id) REFERENCES chave_pix (tenant_id, id);

COMMENT ON COLUMN fatura.chave_pix_id IS
  'A chave que ESTA fatura usa. NULL nas faturas anteriores a esta migration e em '
  'tenant sem Pix - e nesse caso o documento cai na faixa "nenhuma", com motivo. '
  'CONGELA na emissao: ver o gatilho fatura_chave_pix_congelada.';

/*
 * O CONGELAMENTO, e ele e gatilho e nao CHECK pela mesma razao da migration 22:
 * CHECK nao ve o valor anterior.
 *
 * NAO E `SECURITY DEFINER`, e isso e deliberado. O invariante 19 diz que todo
 * `SECURITY DEFINER` deste projeto e LEITURA sem policy; este so levanta
 * excecao, nao le e nao escreve linha nenhuma. O gatilho da migration 22 nasceu
 * DEFINER por descuido meu e o teste G4 acusou - o erro esta registrado la, e
 * nao se repete aqui.
 */
CREATE OR REPLACE FUNCTION app.chave_pix_da_fatura_e_congelada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'rascunho'
     AND NEW.chave_pix_id IS DISTINCT FROM OLD.chave_pix_id THEN
    RAISE EXCEPTION
      'A chave Pix da fatura % nao muda depois de emitida (status %). Um QR ja entregue '
      'ao cliente apontaria para outro destino na segunda via, sem erro e sem log. '
      'Para trocar: cancelar a fatura, com motivo, e compor de novo.',
      OLD.id, OLD.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fatura_chave_pix_congelada
  BEFORE UPDATE ON fatura
  FOR EACH ROW EXECUTE FUNCTION app.chave_pix_da_fatura_e_congelada();

-- =============================================== 5. ISOLAMENTO E PERMISSAO
ALTER TABLE chave_pix ENABLE ROW LEVEL SECURITY;
ALTER TABLE chave_pix FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chave_pix
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT, UPDATE ON chave_pix TO app_financeiro;

/*
 * DELETE revogado. Chave que ja pagou fatura e referenciada por ela, e apagar
 * reescreveria o destino de um documento que circulou. Tirar de uso e
 * `ativa = false`, que e visivel e reversivel.
 */
REVOKE DELETE ON chave_pix FROM app_financeiro;

-- ======================================================== 6. AUDITORIA
-- Invariante 17 / regra 9: escrita de dado de negocio grava quem, quando, antes
-- e depois. Trocar a chave de recebimento e das escritas que mais precisam
-- disso - e o campo que decide para onde o dinheiro do cliente vai.
CREATE TRIGGER auditar_chave_pix
  AFTER INSERT OR UPDATE OR DELETE ON chave_pix
  FOR EACH ROW EXECUTE FUNCTION app.auditar();
