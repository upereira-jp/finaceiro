-- Suite da migration 42 — a planilha da empresa (`G3Solar_Financeiro.xlsx`) como dado.
--
-- Regra 8 do CLAUDE.md: invariante sem teste e comentario. As que esta suite
-- prova sao as que a migration 42 declara por CHECK, FK e GRANT:
--   - a serie existe se, e so se, a despesa repete (D2, D2b);
--   - parcela so em parcelada, e entre 1 e o total (D3, D4);
--   - «recorrente ate» so no que repete, e no primeiro dia do mes (D5, D5b);
--   - comprovante e link (D6);
--   - juros e desconto ficam FORA do valor que abate, e o teto do titulo nao
--     mudou (D7, D7b, D8);
--   - a origem nao atravessa tenant (D9) e nao se apaga (D10).
-- Roda como dono do banco (RLS nao se aplica); o isolamento por tenant ja tem a
-- suite propria, e o D9 prova o que importa aqui: a FK composta.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  T uuid; T2 uuid; o uuid; o2 uuid; c uuid;
  falhas int := 0; st text; pago int;
BEGIN
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Despesas','00000000000272') RETURNING id INTO T;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Outra','00000000000353') RETURNING id INTO T2;
  INSERT INTO origem_pagamento (tenant_id, nome, tipo) VALUES (T, 'Conta PJ G3 Solar', 'conta_bancaria') RETURNING id INTO o;
  INSERT INTO origem_pagamento (tenant_id, nome, tipo) VALUES (T2, 'Conta de outro tenant', 'conta_bancaria') RETURNING id INTO o2;

  -- ---------------------------------------------------- D1 o exemplo da planilha passa
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                           competencia, vencimento, natureza, recorrencia, serie_id, forma_prevista,
                           origem_pagamento_id, comprovante_url)
    VALUES (T, 'Aluguel da sala comercial', 'outro', 'Imobiliaria', 431900, '2026-10-01', '2026-10-10',
            'fixa', 'mensal', gen_random_uuid(), 'cartao_credito', o, 'https://drive.example/recibo')
    RETURNING id INTO c;
  RAISE NOTICE 'ok  D1 o aluguel da planilha (mensal, com serie, cartao, origem e link) entra';

  -- ---------------------------------------------------- D2 repete sem serie
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, recorrencia)
      VALUES (T, 'Sem serie', 'outro', 'X', 100, '2026-10-01', '2026-10-10', 'mensal');
    RAISE WARNING 'FALHA D2 aceitou despesa mensal sem serie_id'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D2 despesa que repete exige serie (conta_pagar_serie_coerente)';
  END;

  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, recorrencia, serie_id)
      VALUES (T, 'Avulsa com serie', 'outro', 'X', 100, '2026-10-01', '2026-10-10', 'avulsa', gen_random_uuid());
    RAISE WARNING 'FALHA D2b aceitou avulsa com serie_id'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D2b avulsa nao tem serie';
  END;

  -- ---------------------------------------------------- D3/D4 parcelas
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, recorrencia, serie_id, parcela_numero, parcela_total)
      VALUES (T, 'Parcela em mensal', 'outro', 'X', 100, '2026-10-01', '2026-10-10', 'mensal', gen_random_uuid(), 1, 3);
    RAISE WARNING 'FALHA D3 aceitou parcela numa despesa mensal'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D3 parcela so existe em despesa parcelada';
  END;

  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, recorrencia, serie_id, parcela_numero, parcela_total)
      VALUES (T, 'Parcela 4 de 3', 'outro', 'X', 100, '2026-10-01', '2026-10-10', 'parcelada', gen_random_uuid(), 4, 3);
    RAISE WARNING 'FALHA D4 aceitou a parcela 4 de 3'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D4 parcela 4 de 3 e recusada';
  END;

  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                           competencia, vencimento, recorrencia, serie_id, parcela_numero, parcela_total)
    VALUES (T, 'Notebook 2/3', 'outro', 'Dell', 82500, '2026-11-01', '2026-11-15', 'parcelada', gen_random_uuid(), 2, 3);
  RAISE NOTICE 'ok  D4b a parcela 2 de 3 entra (controle positivo do D3/D4)';

  -- ---------------------------------------------------- D5 recorrente ate
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, recorrente_ate)
      VALUES (T, 'Avulsa com fim', 'outro', 'X', 100, '2026-10-01', '2026-10-10', '2027-01-01');
    RAISE WARNING 'FALHA D5 aceitou «recorrente ate» numa despesa que nao repete'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D5 «recorrente ate» so no que repete';
  END;

  BEGIN
    UPDATE conta_pagar SET recorrente_ate = '2027-01-15' WHERE id = c;
    RAISE WARNING 'FALHA D5b aceitou «recorrente ate» no dia 15'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D5b «recorrente ate» e um mes: o dia 15 e recusado';
  END;

  -- ---------------------------------------------------- D6 comprovante
  BEGIN
    UPDATE conta_pagar SET comprovante_url = 'C:\recibos\aluguel.pdf' WHERE id = c;
    RAISE WARNING 'FALHA D6 aceitou comprovante que nao e link'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D6 comprovante precisa ser link http(s)';
  END;

  -- ---------------------------------------------------- D7 juros e desconto
  INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, acrescimo_centavos, forma, origem_pagamento_id)
    VALUES (T, c, '2026-10-12', 431900, 8638, 'boleto', o);
  SELECT status::text, valor_pago_centavos INTO st, pago FROM conta_pagar WHERE id = c;
  IF st = 'paga' AND pago = 431900 THEN
    RAISE NOTICE 'ok  D7 pago com 2%% de multa: o titulo fecha com 431900 abatidos e os 8638 de juros ficam no pagamento';
  ELSE
    RAISE WARNING 'FALHA D7 depois da baixa com juros: status %, pago %', st, pago; falhas := falhas + 1;
  END IF;

  BEGIN
    INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
      VALUES (T, c, '2026-10-13', 1, 'pix');
    RAISE WARNING 'FALHA D7b o teto do titulo deixou de valer'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D7b o CHECK contra pagar a mais continua valendo: juros nao abrem folga no titulo';
  END;

  BEGIN
    INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, desconto_centavos, forma)
      SELECT T, id, '2026-11-15', 100, 101, 'pix' FROM conta_pagar WHERE tenant_id = T AND descricao = 'Notebook 2/3';
    RAISE WARNING 'FALHA D8 aceitou desconto maior que o valor abatido'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D8 desconto maior que o abatido e recusado (o que saiu do banco nunca e negativo)';
  END;

  -- ---------------------------------------------------- D9 a origem nao atravessa tenant
  BEGIN
    UPDATE conta_pagar SET origem_pagamento_id = o2 WHERE id = c;
    RAISE WARNING 'FALHA D9 a conta do tenant A apontou para a origem do tenant B'; falhas := falhas + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  D9 a origem de outro tenant e recusada pela FK composta (regra 2)';
  END;

  -- ---------------------------------------------------- D10 a origem nao se apaga
  IF NOT has_table_privilege('app_financeiro', 'public.origem_pagamento', 'DELETE')
     AND has_table_privilege('app_financeiro', 'public.origem_pagamento', 'UPDATE') THEN
    RAISE NOTICE 'ok  D10 a aplicacao desativa origem, nunca apaga (DELETE revogado, UPDATE concedido)';
  ELSE
    RAISE WARNING 'FALHA D10 os privilegios de app_financeiro em origem_pagamento nao sao os declarados'; falhas := falhas + 1;
  END IF;

  IF falhas = 0 THEN RAISE NOTICE 'despesas: nenhuma falha'; END IF;
END $bloco$;
