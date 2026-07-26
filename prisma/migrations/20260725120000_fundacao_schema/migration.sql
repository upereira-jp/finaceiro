-- SPEC-001 v2.2 - migration 1 de 2: SCHEMA
-- Tabelas, enums, indices e as NOVE FKs compostas da SPEC-001 3.4.
-- As policies ficam na migration 2, por decisao da SPEC-001 3.2.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- exigido pelos EXCLUDE de vigencia

-- ---------------------------------------------------------------- enums
CREATE TYPE tenant_status        AS ENUM ('ativo','suspenso','encerrado');
CREATE TYPE papel_tenant         AS ENUM ('admin','financeiro','cobranca','leitura');
CREATE TYPE tier_plataforma      AS ENUM ('plataforma_admin','plataforma_suporte');
CREATE TYPE conector_tipo        AS ENUM ('intreply');
CREATE TYPE conector_status      AS ENUM ('ok','erro','nunca_executou');
CREATE TYPE documento_tipo       AS ENUM ('cpf','cnpj');
CREATE TYPE documento_origem     AS ENUM ('crm_semente','coleta_local');
CREATE TYPE titularidade_uc      AS ENUM ('propria','terceiro','em_troca');
CREATE TYPE status_uc            AS ENUM ('ativa','suspensa','cancelada');
CREATE TYPE status_usina         AS ENUM ('ativa','suspensa','encerrada');
CREATE TYPE origem_geracao       AS ENUM ('crm','local');
CREATE TYPE natureza_pessoa      AS ENUM ('pf','pj');
CREATE TYPE tipo_chave_pix       AS ENUM ('cpf','cnpj','email','telefone','aleatoria');
CREATE TYPE tipo_conta_bancaria  AS ENUM ('corrente','poupanca');
CREATE TYPE status_contrato      AS ENUM ('rascunho','ativo','suspenso','encerrado');
CREATE TYPE valor_referencia_origem AS ENUM ('crm_consumo_reais','local');
-- SPEC-001 3.3: 'terceirizado' entrou na v2.2 - a tabela de taxas tem cinco linhas
CREATE TYPE originador_tipo      AS ENUM
  ('vendedor_g3','terceirizado','parceiro_indicador','parceiro_captador','parceiro_captador_senior');

-- ---------------------------------------------------------------- 3.1 plataforma
-- tenant e a RAIZ: sem tenant_id, e por isso fora da invariante 2.
CREATE TABLE tenant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social  text NOT NULL,
  cnpj          text NOT NULL,
  status        tenant_status NOT NULL DEFAULT 'ativo',
  data_ativacao date,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_cnpj_unico UNIQUE (cnpj)
);

-- usuario e plataforma_admin sao entidades de PLATAFORMA: sem tenant_id.
CREATE TABLE usuario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid NOT NULL UNIQUE,   -- auth.users do projeto Supabase do financeiro
  nome          text NOT NULL,
  email         text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plataforma_admin (
  usuario_id uuid PRIMARY KEY REFERENCES usuario(id),
  tier       tier_plataforma NOT NULL
);

CREATE TABLE usuario_tenant (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  usuario_id uuid NOT NULL REFERENCES usuario(id),
  papel      papel_tenant NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  CONSTRAINT usuario_tenant_unico UNIQUE (usuario_id, tenant_id)
  -- MT-01: se a resposta for "usuario em um tenant so", acrescenta-se
  -- UNIQUE (usuario_id). N:N e o superconjunto - SPEC-001 3.1.
);

CREATE TABLE acesso_plataforma_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  usuario_id  uuid NOT NULL REFERENCES usuario(id),
  acao        text NOT NULL,
  recurso     text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acesso_plataforma_log_tenant_idx ON acesso_plataforma_log (tenant_id, ocorrido_em DESC);

CREATE TABLE conector_crm (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL UNIQUE REFERENCES tenant(id),
  tipo                conector_tipo NOT NULL,
  crm_tenant_id       uuid NOT NULL,
  credencial_ref      text NOT NULL,   -- REFERENCIA. Invariante 8: nunca o segredo.
  ativo               boolean NOT NULL DEFAULT false,
  ultima_execucao_em  timestamptz,
  ultimo_status       conector_status NOT NULL DEFAULT 'nunca_executou'
);

-- ---------------------------------------------------------------- 3.3 cadastros
CREATE TABLE cliente (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(id),
  crm_lead_id                 uuid,
  nome                        text NOT NULL,
  telefone                    text,
  email                       text,
  origem                      text,
  consumo_kwh                 numeric(14,4),        -- inv. 6: grandeza fisica, nao centavos
  consumo_referencia_centavos integer,              -- R24: semente, NAO base de faturamento
  documento                   text,
  documento_tipo              documento_tipo,
  documento_validado          boolean NOT NULL DEFAULT false,
  documento_origem            documento_origem,
  ativo                       boolean NOT NULL DEFAULT true,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_id_tenant UNIQUE (tenant_id, id)   -- alvo das FKs compostas
);
CREATE UNIQUE INDEX cliente_crm_lead_unico ON cliente (tenant_id, crm_lead_id) WHERE crm_lead_id IS NOT NULL;
CREATE UNIQUE INDEX cliente_documento_unico ON cliente (tenant_id, documento) WHERE documento IS NOT NULL;

CREATE TABLE dono_usina (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  nome               text NOT NULL,
  natureza           natureza_pessoa NOT NULL,
  documento          text NOT NULL,
  documento_tipo     documento_tipo NOT NULL,
  documento_validado boolean NOT NULL DEFAULT false,
  banco              text, agencia text, conta text,
  tipo_conta         tipo_conta_bancaria,
  chave_pix          text, tipo_chave_pix tipo_chave_pix,
  telefone           text, email text,
  ativo              boolean NOT NULL DEFAULT true,
  CONSTRAINT dono_usina_documento_unico UNIQUE (tenant_id, documento),
  CONSTRAINT dono_usina_id_tenant UNIQUE (tenant_id, id)
);

CREATE TABLE originador (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  nome               text NOT NULL,
  natureza           natureza_pessoa NOT NULL,
  tipo               originador_tipo NOT NULL,  -- R20: LOCAL. Nao e o vendedor_tipo do CRM.
  crm_partner_id     uuid,                      -- R15: semente, nunca sobrescreve 'tipo'
  documento          text NOT NULL,
  documento_tipo     documento_tipo NOT NULL,
  documento_validado boolean NOT NULL DEFAULT false,
  banco              text, agencia text, conta text,
  tipo_conta         tipo_conta_bancaria,
  chave_pix          text, tipo_chave_pix tipo_chave_pix,
  telefone           text, email text,
  ativo              boolean NOT NULL DEFAULT true,
  CONSTRAINT originador_documento_unico UNIQUE (tenant_id, documento),
  CONSTRAINT originador_id_tenant UNIQUE (tenant_id, id)
);

CREATE TABLE usina (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  codigo_geradora     text NOT NULL,
  apelido             text,
  distribuidora       text NOT NULL,
  potencia_kwp        numeric(12,4),      -- 100% nula hoje (P8 5). Nunca assume zero.
  geracao_nominal_kwh numeric(14,4),
  crm_usina_id        uuid,
  dono_usina_id       uuid,               -- R12: nulo nao bloqueia cadastro, bloqueia repasse
  percentual_repasse  numeric(5,2) NOT NULL DEFAULT 70.00,
  data_homologacao    date,
  regime_fio_b        boolean NOT NULL DEFAULT true,
  status              status_usina NOT NULL DEFAULT 'ativa',
  CONSTRAINT usina_codigo_unico UNIQUE (tenant_id, codigo_geradora),
  CONSTRAINT usina_id_tenant UNIQUE (tenant_id, id),
  -- FK COMPOSTA 4/9
  CONSTRAINT usina_dono_fk FOREIGN KEY (tenant_id, dono_usina_id)
    REFERENCES dono_usina (tenant_id, id)
);

CREATE TABLE unidade_consumidora (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id),
  cliente_id           uuid NOT NULL,
  numero_uc            text NOT NULL,
  distribuidora        text NOT NULL,
  endereco_logradouro  text, endereco_numero text, endereco_complemento text,
  endereco_bairro      text, endereco_municipio text, endereco_uf text, endereco_cep text,
  titularidade         titularidade_uc NOT NULL DEFAULT 'propria',
  usina_id             uuid,
  percentual_rateio    numeric(7,4),   -- R10: read-only quando ha crm_usina_cliente_id
  data_vencimento      date,           -- 100% vazia no CRM (P8 5)
  status               status_uc NOT NULL DEFAULT 'ativa',
  crm_usina_cliente_id uuid,
  CONSTRAINT uc_numero_unico UNIQUE (tenant_id, numero_uc),
  CONSTRAINT uc_id_tenant UNIQUE (tenant_id, id),
  -- FKs COMPOSTAS 2/9 e 3/9
  CONSTRAINT uc_cliente_fk FOREIGN KEY (tenant_id, cliente_id) REFERENCES cliente (tenant_id, id),
  CONSTRAINT uc_usina_fk   FOREIGN KEY (tenant_id, usina_id)   REFERENCES usina   (tenant_id, id)
);
CREATE UNIQUE INDEX uc_crm_unico ON unidade_consumidora (tenant_id, crm_usina_cliente_id)
  WHERE crm_usina_cliente_id IS NOT NULL;

CREATE TABLE cliente_estado_crm (
  cliente_id      uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  tem_rateio_ativo boolean,       -- vigente
  tem_venda_ganha  boolean,       -- bloqueado por F-02
  em_carteira      boolean,       -- v2.2: nasce e permanece nulo. F-04 e F-01b.
  sincronizado_em  timestamptz,
  -- FK COMPOSTA 1/9
  CONSTRAINT cec_cliente_fk FOREIGN KEY (tenant_id, cliente_id) REFERENCES cliente (tenant_id, id)
);

CREATE TABLE usina_geracao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  usina_id    uuid NOT NULL,
  competencia date NOT NULL,
  geracao_kwh numeric(14,4) NOT NULL,
  origem      origem_geracao NOT NULL,
  CONSTRAINT usina_geracao_competencia_unica UNIQUE (tenant_id, usina_id, competencia),
  CONSTRAINT usina_geracao_dia_1 CHECK (date_part('day', competencia) = 1),
  -- FK COMPOSTA 5/9
  CONSTRAINT usina_geracao_usina_fk FOREIGN KEY (tenant_id, usina_id) REFERENCES usina (tenant_id, id)
);

CREATE TABLE contrato (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(id),
  cliente_id               uuid NOT NULL,
  unidade_consumidora_id   uuid NOT NULL,
  usina_id                 uuid NOT NULL,
  originador_id            uuid,
  data_fechamento          date NOT NULL,
  valor_referencia_centavos integer NOT NULL,       -- R24: referencia, nao base
  valor_referencia_origem  valor_referencia_origem NOT NULL,
  status                   status_contrato NOT NULL DEFAULT 'rascunho',
  faturas_cheias_pagas     integer NOT NULL DEFAULT 0,
  CONSTRAINT contrato_id_tenant UNIQUE (tenant_id, id),
  -- FKs COMPOSTAS 6/9, 7/9, 8/9, 9/9
  CONSTRAINT contrato_cliente_fk    FOREIGN KEY (tenant_id, cliente_id)             REFERENCES cliente (tenant_id, id),
  CONSTRAINT contrato_uc_fk         FOREIGN KEY (tenant_id, unidade_consumidora_id) REFERENCES unidade_consumidora (tenant_id, id),
  CONSTRAINT contrato_usina_fk      FOREIGN KEY (tenant_id, usina_id)               REFERENCES usina (tenant_id, id),
  CONSTRAINT contrato_originador_fk FOREIGN KEY (tenant_id, originador_id)          REFERENCES originador (tenant_id, id)
);
-- R14: uma UC tem no maximo um contrato ativo
CREATE UNIQUE INDEX contrato_ativo_unico_por_uc ON contrato (tenant_id, unidade_consumidora_id)
  WHERE status = 'ativo';

-- ---------------------------------------------------------------- 3.3 valor com data
-- R21: vigencia sem sobreposicao e garantia do BANCO, nao da aplicacao.
CREATE TABLE regra_comissao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id),
  originador_tipo originador_tipo NOT NULL,
  percentual      numeric(5,2) NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  vigencia_inicio date NOT NULL,
  vigencia_fim    date,
  CONSTRAINT regra_comissao_vigencia_coerente CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio),
  CONSTRAINT regra_comissao_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT regra_comissao_sem_sobreposicao EXCLUDE USING gist (
    tenant_id       WITH =,
    originador_tipo WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
  )
);

-- R22: tarifa e PRECO POR UNIDADE, escala decimal. Centavos truncariam o digito.
CREATE TABLE tarifa (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id),
  distribuidora        text NOT NULL,
  tarifa_reais_por_kwh numeric(12,6) NOT NULL CHECK (tarifa_reais_por_kwh > 0),
  vigencia_inicio      date NOT NULL,
  vigencia_fim         date,
  CONSTRAINT tarifa_vigencia_coerente CHECK (vigencia_fim IS NULL OR vigencia_fim > vigencia_inicio),
  CONSTRAINT tarifa_id_tenant UNIQUE (tenant_id, id),
  CONSTRAINT tarifa_sem_sobreposicao EXCLUDE USING gist (
    tenant_id     WITH =,
    distribuidora WITH =,
    daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&
  )
);
