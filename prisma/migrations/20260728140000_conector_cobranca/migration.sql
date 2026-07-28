-- MIGRATION 18 - CONECTOR DE COBRANCA. Onde mora a REFERENCIA ao segredo da
-- Sicoob, e por que ela e uma tabela em vez de uma variavel de ambiente.
--
-- Regra 5, e ela e explicita sobre a divisao: "segredo POR TENANT vive em
-- armazenamento cifrado e e acessado por REFERENCIA (credencial_ref). So
-- segredo DE PLATAFORMA vai para variavel de ambiente."
--
-- Cobranca e por tenant, sem excecao possivel: o PRD 6 diz "cada empresa tem sua
-- conta, seu certificado, seu client_id". Poe-los no `.env` funcionaria com um
-- tenant e quebraria no segundo - e quebraria da pior forma, emitindo boleto de
-- uma empresa na conta de outra.
--
-- A FORMA E COPIADA DE `conector_crm`, DE PROPOSITO. Aquela tabela ja resolveu
-- este problema em 25/07: `credencial_ref text NOT NULL` e nenhuma coluna de
-- segredo. Duas formas diferentes para o mesmo problema dariam duas revisoes
-- diferentes sobre o que pode ser gravado.

CREATE TYPE provedor_cobranca AS ENUM ('sicoob');

CREATE TABLE conector_cobranca (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE e nao so indice: um tenant, uma conta de cobranca. Duas contas
  -- ativas fariam a emissao escolher uma, e escolher qual conta recebe o
  -- dinheiro nao e decisao de planejador de consultas.
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenant(id),
  provedor  provedor_cobranca NOT NULL DEFAULT 'sicoob',

  /*
   * A REFERENCIA. Nunca o segredo. O que vai aqui e um ponteiro para o
   * armazenamento cifrado - nome de secret, ARN, caminho no cofre -, e o
   * adaptador o resolve no momento da chamada.
   *
   * O CHECK abaixo nao prova que nao ha segredo: nada em SQL prova isso. Ele
   * pega o caminho que de fato acontece, que e alguem colar o valor no lugar da
   * referencia com pressa. Um `client_secret` da Sicoob e uma chave PEM tem
   * forma reconhecivel, e reconhecivel basta para virar erro em vez de linha.
   */
  credencial_ref text NOT NULL CHECK (
    length(credencial_ref) BETWEEN 3 AND 200
    AND credencial_ref !~ '^-----BEGIN'
    AND credencial_ref !~* '(client_secret|private_key|BEGIN (RSA |EC )?PRIVATE KEY)'
  ),

  -- Dados NAO secretos da conta, e a distincao importa: numero de contrato de
  -- cobranca e numero de convenio saem impressos no proprio boleto, que e
  -- documento que circula. Segredo e o que autentica, nao o que identifica.
  numero_contrato text,
  numero_convenio text,
  agencia         text,
  conta           text,

  /*
   * PRD 6, ultima linha: "alerta de expiracao do certificado A1 - vencido, a
   * emissao para sem erro obvio". A data de expiracao NAO e segredo e mora
   * aqui exatamente para que o alerta seja possivel sem abrir o cofre.
   */
  certificado_expira_em date,

  ativo     boolean NOT NULL DEFAULT false,
  -- `sandbox` e coluna e nao variavel de ambiente porque o PRD 6 exige "virada
  -- para producao e troca de credenciais e endpoint, SEM codigo condicional por
  -- ambiente". Com a coluna, um tenant pode estar em sandbox enquanto outro ja
  -- produz, e nenhum `if (process.env.NODE_ENV)` aparece no caminho do dinheiro.
  sandbox   boolean NOT NULL DEFAULT true,

  ultima_emissao_em timestamptz,
  ultimo_erro       text,
  criado_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conector_cobranca_id_tenant UNIQUE (tenant_id, id)
);

COMMENT ON COLUMN conector_cobranca.credencial_ref IS
  'CLAUDE.md regra 5. REFERENCIA ao segredo em armazenamento cifrado, nunca o '
  'segredo. O contraexemplo esta no CRM ao lado: tenants.openai_api_key e mais '
  'quatro tokens em text puro (P8 4).';
COMMENT ON COLUMN conector_cobranca.certificado_expira_em IS
  'PRD 6. Data de expiracao do A1 - nao e segredo, e mora aqui para o alerta '
  'existir sem abrir o cofre. Certificado vencido para a emissao sem erro obvio.';

ALTER TABLE conector_cobranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE conector_cobranca FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conector_cobranca
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

-- Regra 9. Trocar a referencia da credencial e mudar para onde o dinheiro vai:
-- e o caso central da auditoria, nao a borda. `dono_usina` entrou na lista da
-- migration 10 pelo mesmo motivo - guarda a chave PIX.
CREATE TRIGGER auditar_conector_cobranca
  AFTER INSERT OR UPDATE OR DELETE ON conector_cobranca
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

GRANT SELECT, INSERT, UPDATE, DELETE ON conector_cobranca TO app_financeiro;

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r' AND c.relname = 'conector_cobranca'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
END $$;
