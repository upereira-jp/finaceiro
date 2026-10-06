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
-- E as da migration 44 (06/10/2026, o chao da empresa), no segundo bloco:
--   - fornecedor unico por documento no tenant, e nao atravessa tenant (D12, D13);
--   - plano de contas em dois niveis, com a natureza do grupo (D14);
--   - a origem guarda so o final da conta, e banco so em conta (D15);
--   - anexo: append-only por privilegio, um arquivo por sha256, teto, tipo pelos
--     bytes, e a trilha sem os bytes (D16);
--   - estorno: o estornado nao soma, e coerente, definitivo, nao toca o split e
--     leva junto a divida do socio em aberto (D17);
--   - o numero do lancamento: sequencial por tenant, so na despesa a mao, imutavel (D18).
-- Roda como dono do banco (RLS nao se aplica); o isolamento por tenant ja tem a
-- suite propria, e o D9 prova o que importa aqui: a FK composta.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  T uuid; T2 uuid; o uuid; o2 uuid; c uuid; pg uuid;
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

  -- ---------------------------------------------------- D11 a divida com o socio (Q-SOCIOS-01)
  SELECT id INTO pg FROM pagamento WHERE conta_pagar_id = c LIMIT 1;
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                           competencia, vencimento, reembolso_de_pagamento_id)
    VALUES (T, 'Reembolso a Vinicius Leal', 'outro', 'Vinicius Leal', 440538, '2026-10-01', '2026-10-12', pg);
  RAISE NOTICE 'ok  D11 a divida com o socio aponta para o pagamento que ele fez';
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, reembolso_de_pagamento_id)
      VALUES (T, 'Reembolso em dobro', 'outro', 'Vinicius Leal', 440538, '2026-10-01', '2026-10-12', pg);
    RAISE WARNING 'FALHA D11b aceitou dois reembolsos do mesmo pagamento'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok  D11b um reembolso por pagamento: o segundo e recusado (conta_pagar_reembolso_unico, regra 11)';
  END;
  BEGIN
    UPDATE conta_pagar SET natureza = 'fixa' WHERE reembolso_de_pagamento_id = pg;
    RAISE WARNING 'FALHA D11c o reembolso virou despesa fixa'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D11c reembolso e divida, nao despesa: nao tem natureza nem recorrencia';
  END;

  IF falhas = 0 THEN RAISE NOTICE 'despesas: nenhuma falha'; END IF;
END $bloco$;

-- ============================================================================
-- MIGRATION 44 — o chao da empresa (PLANO-empresa-controle-total-2026-10-06, etapa 1)
-- ============================================================================
DO $bloco44$
DECLARE
  T uuid; T2 uuid; f uuid; f2 uuid; g uuid; s uuid; g2 uuid; c uuid; c2 uuid; pg uuid; pg2 uuid;
  conteudo2 uuid; ac uuid; o uuid; socio uuid; r uuid;
  falhas int := 0; st text; pago int; n1 int; n2 int; n3 int; nat text; txt text; jb jsonb;
  pdf bytea := convert_to('%PDF-1.4 comprovante do aluguel', 'UTF8');
BEGIN
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Chao', '00000000000434') RETURNING id INTO T;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Chao outro', '00000000000515') RETURNING id INTO T2;

  -- ---------------------------------------------------- D12 fornecedor unico por documento
  INSERT INTO fornecedor (tenant_id, nome, documento, documento_tipo)
    VALUES (T, 'Imobiliaria Centro', '11222333000181', 'cnpj') RETURNING id INTO f;
  BEGIN
    INSERT INTO fornecedor (tenant_id, nome, documento, documento_tipo)
      VALUES (T, 'Imobiliaria Centro Ltda', '11222333000181', 'cnpj');
    RAISE WARNING 'FALHA D12 aceitou dois fornecedores com o mesmo CNPJ no tenant'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok  D12 o mesmo CNPJ duas vezes no tenant e recusado (fornecedor_documento_unico)';
  END;
  INSERT INTO fornecedor (tenant_id, nome) VALUES (T, 'Padaria sem CNPJ');
  INSERT INTO fornecedor (tenant_id, nome) VALUES (T, 'Feira sem CNPJ');
  INSERT INTO fornecedor (tenant_id, nome, documento, documento_tipo)
    VALUES (T2, 'Imobiliaria Centro', '11222333000181', 'cnpj') RETURNING id INTO f2;
  RAISE NOTICE 'ok  D12b o mesmo CNPJ em OUTRO tenant entra, e dois fornecedores sem documento convivem';
  BEGIN
    INSERT INTO fornecedor (tenant_id, nome, documento, documento_tipo) VALUES (T, 'Mascara', '11.222.333/0001-81', 'cnpj');
    RAISE WARNING 'FALHA D12c aceitou documento com mascara'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D12c o documento entra normalizado: com mascara e recusado';
  END;

  -- ---------------------------------------------------- D13 a despesa nao aponta fornecedor de outro tenant
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                           competencia, vencimento, fornecedor_id)
    VALUES (T, 'Aluguel de outubro', 'outro', 'Imobiliaria Centro', 431900, '2026-10-01', '2026-10-10', f)
    RETURNING id INTO c;
  BEGIN
    UPDATE conta_pagar SET fornecedor_id = f2 WHERE id = c;
    RAISE WARNING 'FALHA D13 a despesa do tenant A apontou para o fornecedor do B'; falhas := falhas + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  D13 fornecedor de outro tenant e recusado pela FK composta (regra 2)';
  END;
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento)
    VALUES (T, 'Sem fornecedor, como o aluguel da planilha', 'outro', 1000, '2026-10-01', '2026-10-10');
  RAISE NOTICE 'ok  D13b despesa a mao sem fornecedor nem nome entra (lacuna 4)';
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento)
      VALUES (T, 'Concessionaria sem nome', 'concessionaria', 1000, '2026-10-01', '2026-10-10');
    RAISE WARNING 'FALHA D13c a concessionaria entrou sem nome'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D13c a concessionaria continua exigindo nome (so o outro relaxou)';
  END;

  -- ---------------------------------------------------- D14 dois niveis, natureza do grupo
  INSERT INTO categoria (tenant_id, nome, ordem) VALUES (T, 'Despesas Administrativas', 1) RETURNING id INTO g;
  INSERT INTO categoria (tenant_id, nome, pai_id) VALUES (T, 'Aluguel e condominio', g) RETURNING id INTO s;
  BEGIN
    INSERT INTO categoria (tenant_id, nome, pai_id) VALUES (T, 'Neto', s);
    RAISE WARNING 'FALHA D14 aceitou um terceiro nivel'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      INSERT INTO categoria (tenant_id, nome) VALUES (T, 'Outro grupo') RETURNING id INTO g2;
      UPDATE categoria SET pai_id = g2 WHERE id = g;
      RAISE WARNING 'FALHA D14 um grupo com subcategorias virou subcategoria'; falhas := falhas + 1;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'ok  D14 dois niveis: neto recusado, e grupo com filhos nao vira filho';
    END;
  END;
  BEGIN
    INSERT INTO categoria (tenant_id, nome) VALUES (T2, 'Grupo do outro') RETURNING id INTO g2;
    INSERT INTO categoria (tenant_id, nome, pai_id) VALUES (T, 'Filha de outro tenant', g2);
    RAISE WARNING 'FALHA D14b a subcategoria do A ficou sob um grupo do B'; falhas := falhas + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  D14b o grupo de outro tenant e recusado pela FK composta';
  END;
  UPDATE categoria SET natureza = 'investimento' WHERE id = g;
  SELECT natureza::text INTO nat FROM categoria WHERE id = s;
  IF nat = 'investimento' THEN
    UPDATE categoria SET natureza = 'despesa' WHERE id = s;   -- a filha nao escolhe: herda
    SELECT natureza::text INTO nat FROM categoria WHERE id = s;
  END IF;
  IF nat = 'investimento' THEN
    BEGIN
      UPDATE categoria SET natureza = 'custo' WHERE id = g;
      RAISE WARNING 'FALHA D14c aceitou natureza fora da lista'; falhas := falhas + 1;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE NOTICE 'ok  D14c a natureza e do grupo: a subcategoria herda e nao escolhe, e a lista e fechada';
    END;
  ELSE
    RAISE WARNING 'FALHA D14c a subcategoria nao seguiu a natureza do grupo (ficou %)', nat; falhas := falhas + 1;
  END IF;
  UPDATE categoria SET natureza = 'despesa' WHERE id = g;

  -- ---------------------------------------------------- D15 a conta: so o final
  INSERT INTO origem_pagamento (tenant_id, nome, tipo, banco, agencia, conta_final)
    VALUES (T, 'Sicoob PJ', 'conta_bancaria', 'Sicoob', '3069', '0123') RETURNING id INTO o;
  BEGIN
    UPDATE origem_pagamento SET conta_final = '123456' WHERE id = o;
    RAISE WARNING 'FALHA D15 guardou mais que os 4 ultimos digitos da conta'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D15 a conta guarda so o final de 4 digitos (o numero inteiro e recusado)';
  END;
  BEGIN
    INSERT INTO origem_pagamento (tenant_id, nome, tipo, banco) VALUES (T, 'Socio com banco', 'socio', 'Nubank');
    RAISE WARNING 'FALHA D15b o adiantamento de socio ganhou banco'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D15b banco, agencia e final so na origem do tipo conta bancaria';
  END;

  -- ---------------------------------------------------- D16 anexo
  IF NOT has_table_privilege('app_financeiro', 'public.anexo_conteudo', 'DELETE')
     AND NOT has_table_privilege('app_financeiro', 'public.anexo_conteudo', 'UPDATE')
     AND has_table_privilege('app_financeiro', 'public.anexo_conteudo', 'INSERT')
     AND NOT has_table_privilege('app_financeiro', 'public.anexo', 'DELETE')
     AND NOT has_column_privilege('app_financeiro', 'public.anexo', 'conta_pagar_id', 'UPDATE')
     AND NOT has_column_privilege('app_financeiro', 'public.anexo', 'conteudo_id', 'UPDATE')
     AND has_column_privilege('app_financeiro', 'public.anexo', 'desvinculado_em', 'UPDATE') THEN
    RAISE NOTICE 'ok  D16 anexo nao se apaga nem se troca: os bytes so entram, e do vinculo so muda o desvincular';
  ELSE
    RAISE WARNING 'FALHA D16 os privilegios de app_financeiro em anexo/anexo_conteudo nao sao os declarados'; falhas := falhas + 1;
  END IF;

  INSERT INTO anexo_conteudo (tenant_id, conteudo) VALUES (T, pdf) RETURNING id INTO ac;
  SELECT sha256 INTO txt FROM anexo_conteudo WHERE id = ac;
  BEGIN
    INSERT INTO anexo_conteudo (tenant_id, conteudo) VALUES (T, pdf);
    RAISE WARNING 'FALHA D16b o mesmo arquivo entrou duas vezes no tenant'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO anexo_conteudo (tenant_id, conteudo) VALUES (T2, pdf) RETURNING id INTO conteudo2;
    IF txt = encode(sha256(pdf), 'hex')
       AND (SELECT tipo FROM anexo_conteudo WHERE id = ac) = 'application/pdf'
       AND (SELECT tamanho_bytes FROM anexo_conteudo WHERE id = ac) = octet_length(pdf) THEN
      RAISE NOTICE 'ok  D16b um arquivo por sha256 no tenant (o mesmo em outro tenant entra), e sha, tipo e tamanho sao do banco';
    ELSE
      RAISE WARNING 'FALHA D16b o carimbo do gatilho nao confere (sha %)', txt; falhas := falhas + 1;
    END IF;
  END;
  BEGIN
    INSERT INTO anexo_conteudo (tenant_id, conteudo)
      VALUES (T, '\x255044462d'::bytea || decode(repeat('00', 8388608), 'hex'));
    RAISE WARNING 'FALHA D16c aceitou anexo acima de 8 MB'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      INSERT INTO anexo_conteudo (tenant_id, conteudo) VALUES (T, convert_to('MZ isto e um executavel', 'UTF8'));
      RAISE WARNING 'FALHA D16c aceitou um arquivo que nao e PDF nem imagem'; falhas := falhas + 1;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'ok  D16c teto de 8 MB, e o tipo e decidido pelos bytes (executavel recusado)';
    END;
  END;
  BEGIN
    INSERT INTO anexo (tenant_id, conteudo_id, conta_pagar_id, nome_arquivo) VALUES (T, conteudo2, c, 'recibo.pdf');
    RAISE WARNING 'FALHA D16d o anexo do A apontou para o arquivo do B'; falhas := falhas + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO anexo (tenant_id, conteudo_id, conta_pagar_id, nome_arquivo) VALUES (T, ac, c, 'recibo.pdf');
    RAISE NOTICE 'ok  D16d o anexo nao atravessa tenant (FK composta), e o do proprio tenant entra';
  END;
  SELECT depois INTO jb FROM auditoria WHERE tabela = 'anexo_conteudo' AND registro_id = ac::text ORDER BY id DESC LIMIT 1;
  IF jb IS NOT NULL AND jb ? 'sha256' AND NOT jb ? 'conteudo' THEN
    RAISE NOTICE 'ok  D16e a trilha registra o anexo pelo sha256, sem os bytes';
  ELSE
    RAISE WARNING 'FALHA D16e a trilha do anexo_conteudo: %', left(coalesce(jb::text, '(sem linha)'), 120); falhas := falhas + 1;
  END IF;

  -- ---------------------------------------------------- D17 estorno
  INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma, referencia_externa)
    VALUES (T, c, '2026-10-10', 431900, 'pix', 'E2E-ALUGUEL-OUT') RETURNING id INTO pg;
  UPDATE pagamento SET estornado_em = now(), motivo_estorno = 'data errada' WHERE id = pg;
  SELECT status::text, valor_pago_centavos INTO st, pago FROM conta_pagar WHERE id = c;
  IF st = 'aberta' AND pago = 0 THEN
    INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma, referencia_externa)
      VALUES (T, c, '2026-10-09', 431900, 'pix', 'E2E-ALUGUEL-OUT') RETURNING id INTO pg2;
    SELECT status::text INTO st FROM conta_pagar WHERE id = c;
    IF st = 'paga' THEN
      RAISE NOTICE 'ok  D17 o estornado deixa de somar (a despesa volta a aberta), e a baixa certa entra com a mesma referencia';
    ELSE
      RAISE WARNING 'FALHA D17 a baixa refeita deixou a despesa %', st; falhas := falhas + 1;
    END IF;
  ELSE
    RAISE WARNING 'FALHA D17 depois do estorno: status %, pago %', st, pago; falhas := falhas + 1;
  END IF;
  BEGIN
    UPDATE pagamento SET estornado_em = now() WHERE id = pg2;
    RAISE WARNING 'FALHA D17b estorno sem motivo'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    BEGIN
      UPDATE pagamento SET estornado_em = now(), motivo_estorno = 'x', valor_centavos = 1 WHERE id = pg2;
      RAISE WARNING 'FALHA D17b o estorno mudou o valor da baixa'; falhas := falhas + 1;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'ok  D17b o estorno exige motivo e so marca: o valor da baixa nao muda junto';
    END;
  END;
  BEGIN
    UPDATE pagamento SET motivo_estorno = 'outro motivo' WHERE id = pg;
    RAISE WARNING 'FALHA D17c o pagamento estornado mudou depois'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    -- a divida com o socio: a baixa que saiu do bolso dele, estornada com a divida em aberto
    INSERT INTO origem_pagamento (tenant_id, nome, tipo) VALUES (T, 'Socio do teste', 'socio') RETURNING id INTO socio;
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos, competencia, vencimento)
      VALUES (T, 'Internet', 'outro', 'Provedor', 19990, '2026-10-01', '2026-10-15') RETURNING id INTO c2;
    INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma, origem_pagamento_id)
      VALUES (T, c2, '2026-10-15', 19990, 'pix', socio) RETURNING id INTO pg;
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                             competencia, vencimento, reembolso_de_pagamento_id)
      VALUES (T, 'Reembolso ao socio', 'outro', 'Socio do teste', 19990, '2026-10-01', '2026-10-15', pg) RETURNING id INTO r;
    UPDATE pagamento SET estornado_em = now(), motivo_estorno = 'pagou duas vezes' WHERE id = pg;
    IF (SELECT status::text FROM conta_pagar WHERE id = r) = 'cancelada'
       AND (SELECT status::text FROM conta_pagar WHERE id = c2) = 'aberta' THEN
      -- e com a divida JA PAGA, o estorno e recusado
      INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma, origem_pagamento_id)
        VALUES (T, c2, '2026-10-16', 19990, 'pix', socio) RETURNING id INTO pg;
      INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, beneficiario_nome, valor_centavos,
                               competencia, vencimento, reembolso_de_pagamento_id)
        VALUES (T, 'Reembolso ao socio 2', 'outro', 'Socio do teste', 19990, '2026-10-01', '2026-10-16', pg) RETURNING id INTO r;
      INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma, origem_pagamento_id)
        VALUES (T, r, '2026-10-20', 19990, 'pix', o);
      BEGIN
        UPDATE pagamento SET estornado_em = now(), motivo_estorno = 'tarde demais' WHERE id = pg;
        RAISE WARNING 'FALHA D17c estornou a baixa do socio com a divida ja reembolsada'; falhas := falhas + 1;
      EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'ok  D17c estorno e definitivo; leva junto a divida do socio em aberto, e e recusado com ela ja paga';
      END;
    ELSE
      RAISE WARNING 'FALHA D17c a divida do socio nao foi cancelada com o estorno'; falhas := falhas + 1;
    END IF;
  END;

  -- D17d: baixa de conta nascida do split nao se estorna. A cadeia do split inteira
  -- (fatura, liquidacao, execucao) e da suite de carteira; aqui so importa o gatilho,
  -- entao a conta e o pagamento entram com FK e gatilhos desligados (replica) e o
  -- UPDATE roda com eles ligados.
  SET LOCAL session_replication_role = replica;
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, dono_usina_id, valor_centavos,
                           competencia, vencimento, origem_split_item_id)
    VALUES (T, 'Repasse ao dono', 'dono_usina', gen_random_uuid(), 50000, '2026-10-01', '2026-11-10', gen_random_uuid())
    RETURNING id INTO c2;
  INSERT INTO pagamento (tenant_id, conta_pagar_id, data_pagamento, valor_centavos, forma)
    VALUES (T, c2, '2026-11-10', 50000, 'pix') RETURNING id INTO pg;
  SET LOCAL session_replication_role = origin;
  BEGIN
    UPDATE pagamento SET estornado_em = now(), motivo_estorno = 'teste' WHERE id = pg;
    RAISE WARNING 'FALHA D17d estornou a baixa de um repasse do split'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D17d a baixa de repasse ou comissao nao se estorna aqui (Q-ESTORNO-01 segue com o dono)';
  END;

  -- ---------------------------------------------------- D18 o numero do lancamento
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento)
    VALUES (T, 'Numero 1', 'outro', 100, '2026-10-01', '2026-10-10') RETURNING numero INTO n1;
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento)
    VALUES (T, 'Numero 2', 'outro', 100, '2026-10-01', '2026-10-10') RETURNING numero INTO n2;
  INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento)
    VALUES (T2, 'Primeira do outro', 'outro', 100, '2026-10-01', '2026-10-10') RETURNING numero INTO n3;
  IF n2 = n1 + 1 AND n3 = 1 AND n1 = (SELECT count(*) FROM conta_pagar WHERE tenant_id = T AND origem_split_item_id IS NULL) - 1
     AND (SELECT numero FROM conta_pagar WHERE id = c2) IS NULL THEN
    RAISE NOTICE 'ok  D18 o numero e sequencial por tenant (% e %, e o outro tenant comeca em %), e o repasse do split nao tem', n1, n2, n3;
  ELSE
    RAISE WARNING 'FALHA D18 numeros % % no A e % no B', n1, n2, n3; falhas := falhas + 1;
  END IF;
  SELECT count(*) INTO n1 FROM pg_index i
   WHERE i.indexrelid = 'public.conta_pagar_numero_unico'::regclass AND i.indisunique AND i.indpred IS NULL;
  BEGIN
    INSERT INTO conta_pagar (tenant_id, descricao, beneficiario_tipo, valor_centavos, competencia, vencimento, numero)
      VALUES (T, 'Pede o numero 1', 'outro', 100, '2026-10-01', '2026-10-10', 1) RETURNING numero INTO n2;
    IF n1 = 1 AND n2 <> 1 THEN
      RAISE NOTICE 'ok  D18b o numero e do banco (pedir o 1 nao adianta, veio o %), e o indice (tenant, numero) e unico e cheio', n2;
    ELSE
      RAISE WARNING 'FALHA D18b indice % / numero pedido virou %', n1, n2; falhas := falhas + 1;
    END IF;
  END;
  BEGIN
    UPDATE conta_pagar SET numero = 999 WHERE id = c;
    RAISE WARNING 'FALHA D18c o numero do lancamento mudou'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  D18c o numero do lancamento nao muda depois de dado';
  END;

  IF falhas = 0 THEN RAISE NOTICE 'despesas (migration 44): nenhuma falha'; END IF;
END $bloco44$;
