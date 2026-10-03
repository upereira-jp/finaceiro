-- Migration 43 — o aviso de pagamento que o sistema ignorou passa a ficar registrado.
--
-- POR QUE. O webhook da Sicoob avisa cada pagamento. Quando o aviso nao e de
-- boleto deste sistema («nosso_numero ... nao pertence a este tenant») ou e um
-- evento que nao se trata (cancelamento de baixa, baixa sem valor), a rota
-- responde 200 — 4xx/5xx fariam a Sicoob reprocessar para sempre — e o motivo ia
-- SO para o journal. Medido em 03/10/2026: seis avisos assim entre 22/09 e 02/10
-- (nossos numeros 45, 50, 51, 62, 63 e 72), com o tenant tendo ZERO boletos no
-- sistema. Eram pagamentos de boletos emitidos a mao no portal: dinheiro entrando
-- que o Financeiro nao registra, e que so quem le o journal via.
--
-- A tabela guarda o aviso com o que ele trazia — nosso numero, valor, data e o id
-- do pagamento no banco — para o painel de saude mostrar e a operacao conferir.
-- NAO E BAIXA: nada aqui liquida fatura nem entra em relatorio de dinheiro.
--
-- APPEND-ONLY POR PRIVILEGIO (SELECT e INSERT, sem UPDATE nem DELETE) e AUDITADA
-- como toda tabela de tenant (inv. 17): o aviso tambem aparece no Historico.

CREATE TABLE aviso_pagamento_ignorado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  recebido_em     timestamptz NOT NULL DEFAULT now(),
  -- `titulo_desconhecido`: o nosso numero nao e de boleto deste tenant.
  -- `evento_ignorado`: o aviso nao e um pagamento a registrar (o tradutor disse por que).
  motivo          text NOT NULL,
  nosso_numero    text,
  valor_centavos  integer,
  data_liquidacao date,
  id_externo      text,
  -- O porque, em texto, como o tradutor escreveu. Cortado para nao virar deposito.
  detalhe         text,
  CONSTRAINT aviso_pagamento_ignorado_motivo CHECK (motivo IN ('titulo_desconhecido', 'evento_ignorado')),
  CONSTRAINT aviso_pagamento_ignorado_valor  CHECK (valor_centavos IS NULL OR valor_centavos >= 0),
  CONSTRAINT aviso_pagamento_ignorado_detalhe CHECK (detalhe IS NULL OR length(detalhe) <= 500),
  CONSTRAINT aviso_pagamento_ignorado_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenant (id)
);

CREATE UNIQUE INDEX aviso_pagamento_ignorado_id_tenant ON aviso_pagamento_ignorado (tenant_id, id);
-- O MESMO PAGAMENTO NAO ENTRA DUAS VEZES: se a Sicoob repetir o aviso, o id do
-- pagamento no banco e o mesmo. Parcial porque o evento ignorado pode nao ter id
-- — e com `IS NOT NULL`, como a CAT-9 exige.
CREATE UNIQUE INDEX aviso_pagamento_ignorado_externo_unico
  ON aviso_pagamento_ignorado (tenant_id, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX aviso_pagamento_ignorado_recente_idx ON aviso_pagamento_ignorado (tenant_id, recebido_em DESC);

COMMENT ON TABLE aviso_pagamento_ignorado IS
  'Aviso de pagamento da Sicoob que o sistema respondeu e nao baixou (titulo que nao e deste tenant, '
  'ou evento que nao e pagamento). Nao e baixa. Append-only: so SELECT e INSERT.';

-- ------------------------------------------------------------ RLS, grants, trilha
ALTER TABLE aviso_pagamento_ignorado ENABLE ROW LEVEL SECURITY;
ALTER TABLE aviso_pagamento_ignorado FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON aviso_pagamento_ignorado
  USING (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant())
  WITH CHECK (tenant_id = app.current_tenant_id() AND app.tem_vinculo_no_tenant());

GRANT SELECT, INSERT ON aviso_pagamento_ignorado TO app_financeiro;
REVOKE UPDATE, DELETE ON aviso_pagamento_ignorado FROM app_financeiro;

CREATE TRIGGER auditar_aviso_pagamento_ignorado
  AFTER INSERT OR UPDATE OR DELETE ON aviso_pagamento_ignorado
  FOR EACH ROW EXECUTE FUNCTION app.auditar();

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND c.relname = 'aviso_pagamento_ignorado'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
      OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid));
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'RLS incompleta em: %', faltando; END IF;
  IF has_table_privilege('app_financeiro', 'public.aviso_pagamento_ignorado', 'UPDATE')
     OR has_table_privilege('app_financeiro', 'public.aviso_pagamento_ignorado', 'DELETE') THEN
    RAISE EXCEPTION 'aviso_pagamento_ignorado tem de ser append-only para app_financeiro';
  END IF;
END $$;
