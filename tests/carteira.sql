-- AS INVARIANTES DA CARTEIRA QUE SAO DO BANCO, nao da aplicacao.
-- Uso: psql -d <db> -f tests/carteira.sql   (depois de todas as migrations)
--
-- O CRITERIO DO QUE ENTRA AQUI: se a regra so vale enquanto o codigo da
-- aplicacao a respeitar, ela nao e invariante - e convencao. As de baixo valem
-- para quem escrever por psql, por script de correcao, por migration futura ou
-- por um repositorio novo que ninguem reviu. Sao as que a regra 8 chama de
-- invariante e a regra 3 manda verificar por catalogo, nao por revisao de PR.
--
-- CADA UMA E VERIFICADA NOS DOIS SENTIDOS: uma que falha se o furo reabrir,
-- outra que falha se o aperto virar nega-tudo. O padrao vem do tests/auditoria.sql,
-- e o motivo esta la: constraint que recusa TUDO tambem passa no teste que so
-- confere a recusa.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = notice;

DO $bloco$
DECLARE
  T uuid; T2 uuid; usr uuid; cli uuid; us uuid; dono uuid; dono2 uuid;
  uc1 uuid; uc2 uuid; org uuid; k1 uuid; k2 uuid;
  f1 uuid; f2 uuid; l1 uuid; se1 uuid; rr uuid; rc uuid;
  falhas int := 0; n int; v numeric; c int;
BEGIN
  -- ============================================================== fixture
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Carteira','00000000000272') RETURNING id INTO T;
  INSERT INTO tenant (razao_social, cnpj) VALUES ('Vizinha','00000000000353') RETURNING id INTO T2;
  INSERT INTO usuario (auth_user_id, nome, email) VALUES (gen_random_uuid(),'C','c@x') RETURNING id INTO usr;
  INSERT INTO usuario_tenant (tenant_id, usuario_id, papel) VALUES (T, usr, 'admin'), (T2, usr, 'admin');

  INSERT INTO dono_usina (tenant_id,nome,natureza,documento,documento_tipo,chave_pix)
    VALUES (T,'Dono','pf','52998224725','cpf','dono@pix') RETURNING id INTO dono;
  INSERT INTO dono_usina (tenant_id,nome,natureza,documento,documento_tipo,chave_pix)
    VALUES (T2,'Dono da vizinha','pf','11144477735','cpf','viz@pix') RETURNING id INTO dono2;

  INSERT INTO cliente (tenant_id, nome) VALUES (T,'C') RETURNING id INTO cli;
  INSERT INTO usina (tenant_id, codigo_geradora, distribuidora, dono_usina_id)
    VALUES (T,'G1','Equatorial',dono) RETURNING id INTO us;
  INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id,percentual_rateio,data_vencimento)
    VALUES (T,cli,'UC-1','Equatorial',us,50.0000,'2026-01-10') RETURNING id INTO uc1;
  INSERT INTO unidade_consumidora (tenant_id,cliente_id,numero_uc,distribuidora,usina_id,percentual_rateio,data_vencimento)
    VALUES (T,cli,'UC-2','Equatorial',us,25.0000,'2026-01-10') RETURNING id INTO uc2;
  INSERT INTO originador (tenant_id,nome,natureza,tipo,documento,documento_tipo)
    VALUES (T,'O','pf','parceiro_captador','12345678909','cpf') RETURNING id INTO org;

  INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,originador_id,
                        originador_tipo_no_fechamento,data_fechamento,valor_referencia_centavos,
                        valor_referencia_origem,status)
    VALUES (T,cli,uc1,us,org,'parceiro_captador','2026-05-01',100000,'local','ativo') RETURNING id INTO k1;
  INSERT INTO contrato (tenant_id,cliente_id,unidade_consumidora_id,usina_id,data_fechamento,
                        valor_referencia_centavos,valor_referencia_origem,status)
    VALUES (T,cli,uc2,us,'2026-05-01',100000,'local','ativo') RETURNING id INTO k2;

  -- A tarifa e da UC desde a migration 30 - a tabela `tarifa` saiu.
  UPDATE unidade_consumidora SET tarifa_reais_por_kwh = 1.130000
   WHERE tenant_id = T AND id IN (uc1, uc2);
  -- Duas linhas, dois INSERTs: `RETURNING ... INTO` com duas linhas levanta
  -- "query returned more than one row", e o id que interessa e o da 1a parcela.
  INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio)
    VALUES (T,'parceiro_captador',30,1,'-infinity') RETURNING id INTO rc;
  INSERT INTO regra_comissao (tenant_id,originador_tipo,percentual,parcela,vigencia_inicio)
    VALUES (T,'parceiro_captador',20,2,'-infinity');
  INSERT INTO regra_repasse (tenant_id,usina_id,percentual,vigencia_inicio)
    VALUES (T,us,70.00,'-infinity') RETURNING id INTO rr;
  INSERT INTO usina_geracao (tenant_id,usina_id,competencia,geracao_kwh,origem)
    VALUES (T,us,'2026-07-01',10000.0000,'local');

  -- ============================================================== A. composicao
  -- A1 ACUSA: competencia que nao e o primeiro dia do mes.
  BEGIN
    INSERT INTO fatura (tenant_id,contrato_id,unidade_consumidora_id,usina_id,competencia,
      geracao_kwh_competencia,percentual_rateio_aplicado,consumo_kwh,tarifa_reais_por_kwh,
      valor_consumo_centavos,flag_fatura_cheia,vencimento)
      VALUES (T,k1,uc1,us,'2026-07-15',10000,50,5000,1.13,565000,true,'2026-08-10');
    RAISE WARNING 'FALHA A1 competencia no dia 15 foi ACEITA'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   A1   competencia fora do dia 1 recusada: meio mes nao existe, e dias diferentes furariam o unico';
  END;

  -- A2 PASSA: a fatura legitima entra, e o total e coluna GERADA.
  INSERT INTO fatura (tenant_id,contrato_id,unidade_consumidora_id,usina_id,competencia,
    geracao_kwh_competencia,percentual_rateio_aplicado,consumo_kwh,tarifa_reais_por_kwh,
    valor_consumo_centavos,valor_tarifas_concessionaria_centavos,flag_fatura_cheia,vencimento,
    status,emitida_em)
    VALUES (T,k1,uc1,us,'2026-07-01',10000,50,5000,1.130000,
            app.consumo_centavos(5000, 1.130000),12000,true,'2026-08-10','emitida',now())
    RETURNING id INTO f1;
  SELECT valor_total_centavos INTO c FROM fatura WHERE id = f1;
  IF c = 565000 + 12000 THEN
    RAISE NOTICE 'ok   A2   R23 5.000 kWh x 1,130000 = 565000 centavos, e o total gerado soma a tarifa da concessionaria (%)', c;
  ELSE RAISE WARNING 'FALHA A2 total gerado deu %', c; falhas := falhas + 1; END IF;

  -- A3 ACUSA: segunda fatura da mesma UC na mesma competencia.
  BEGIN
    INSERT INTO fatura (tenant_id,contrato_id,unidade_consumidora_id,usina_id,competencia,
      geracao_kwh_competencia,percentual_rateio_aplicado,consumo_kwh,tarifa_reais_por_kwh,
      valor_consumo_centavos,flag_fatura_cheia,vencimento)
      VALUES (T,k1,uc1,us,'2026-07-01',10000,50,5000,1.13,565000,true,'2026-08-10');
    RAISE WARNING 'FALHA A3 segunda fatura da mesma UC/competencia ACEITA'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   A3   uma UC nao tem duas faturas da mesma competencia';
  END;

  -- A4 PASSA: cancelar a primeira LIBERA a competencia. E o que a coluna gerada
  --     `competencia_faturada` existe para permitir sem indice parcial (regra 11).
  UPDATE fatura SET status='cancelada', cancelada_em=now(), motivo_cancelamento='teste A4' WHERE id=f1;
  INSERT INTO fatura (tenant_id,contrato_id,unidade_consumidora_id,usina_id,competencia,
    geracao_kwh_competencia,percentual_rateio_aplicado,consumo_kwh,tarifa_reais_por_kwh,
    valor_consumo_centavos,valor_tarifas_concessionaria_centavos,flag_fatura_cheia,vencimento,
    status,emitida_em)
    VALUES (T,k1,uc1,us,'2026-07-01',10000,50,5000,1.130000,565000,12000,true,'2026-08-10','emitida',now())
    RETURNING id INTO f1;
  RAISE NOTICE 'ok   A4   fatura cancelada libera a competencia para reemissao (o aperto nao virou nega-tudo)';

  -- ============================================================== B. liquidacao
  -- B1 ACUSA: baixa por valor menor que o titulo.
  BEGIN
    INSERT INTO liquidacao (tenant_id,fatura_id,data_liquidacao,valor_liquidado_centavos,origem)
      VALUES (T,f1,'2026-08-10',500000,'manual');
    RAISE WARNING 'FALHA B1 pagamento parcial ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   B1   PRD 5.2 pagamento parcial recusado pelo banco: split sobre valor errado fecharia a invariante sobre um numero errado';
  END;

  -- B2 PASSA: pelo valor cheio, com juro na fatura antes.
  UPDATE fatura SET valor_juros_multa_centavos = 3000 WHERE id = f1;
  INSERT INTO liquidacao (tenant_id,fatura_id,data_liquidacao,valor_liquidado_centavos,
                          juros_centavos,multa_centavos,origem,id_externo)
    VALUES (T,f1,'2026-08-10',565000+12000+3000,2000,1000,'webhook_sicoob','evt-1')
    RETURNING id INTO l1;
  RAISE NOTICE 'ok   B2   baixa pelo total, com juro lancado na fatura ANTES - a ordem das escritas e requisito';

  -- B3 ACUSA: o mesmo evento externo duas vezes.
  BEGIN
    INSERT INTO liquidacao (tenant_id,fatura_id,data_liquidacao,valor_liquidado_centavos,origem,id_externo)
      VALUES (T,f1,'2026-08-10',580000,'webhook_sicoob','evt-1');
    RAISE WARNING 'FALHA B3 webhook duplicado ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   B3   PRD 6 webhook idempotente: o mesmo id_externo nao entra duas vezes';
  END;

  -- ============================================================== C. a invariante do centavo
  -- C1 ACUSA: itens que nao somam o liquidado. Constraint DEFERIDA - o erro sai
  --    no SET CONSTRAINTS, nao no INSERT, e e por isso que este bloco o forca.
  BEGIN
    INSERT INTO split_execucao (tenant_id,liquidacao_id,fatura_id,contrato_id,competencia,
      valor_liquidado_centavos,base_consumo_centavos,base_repasse_centavos,parcela_comissao)
      VALUES (T,l1,f1,k1,'2026-07-01',580000,565000,567938,1) RETURNING id INTO se1;
    INSERT INTO split_item (tenant_id,split_execucao_id,tipo,dono_usina_id,base_calculo_centavos,
                            percentual_aplicado,valor_centavos,regra_repasse_id)
      VALUES (T,se1,'repasse_usina',dono,567938,70.00,397557,rr);
    -- Falta tudo o resto: 580000 - 397557 = 182443 sem dono.
    SET CONSTRAINTS split_fecha_ao_centavo, split_execucao_fecha_ao_centavo IMMEDIATE;
    RAISE WARNING 'FALHA C1 split que nao fecha foi ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   C1   PRD 5.5 split que nao fecha ao centavo e recusado pelo BANCO, nao por revisao';
  END;
  SET CONSTRAINTS ALL DEFERRED;
  DELETE FROM split_item WHERE tenant_id = T;
  DELETE FROM split_execucao WHERE tenant_id = T;

  -- C2 PASSA: os quatro itens, incluindo o repasse a concessionaria - o tipo que
  --    faz a soma fechar e que o PRD 4.3 nao listava.
  INSERT INTO split_execucao (tenant_id,liquidacao_id,fatura_id,contrato_id,competencia,
    valor_liquidado_centavos,base_consumo_centavos,base_repasse_centavos,parcela_comissao)
    VALUES (T,l1,f1,k1,'2026-07-01',580000,565000,567938,1) RETURNING id INTO se1;
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,dono_usina_id,base_calculo_centavos,percentual_aplicado,valor_centavos,regra_repasse_id)
    VALUES (T,se1,'repasse_usina',dono,567938,70.00,397557,rr);
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,originador_id,base_calculo_centavos,percentual_aplicado,valor_centavos,regra_comissao_id)
    VALUES (T,se1,'comissao',org,565000,30.00,169500,rc);
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,base_calculo_centavos,valor_centavos)
    VALUES (T,se1,'repasse_concessionaria',12000,12000);
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,base_calculo_centavos,valor_centavos)
    VALUES (T,se1,'liquido_g3',580000,580000-397557-169500-12000);
  SET CONSTRAINTS split_fecha_ao_centavo, split_execucao_fecha_ao_centavo IMMEDIATE;
  SELECT sum(valor_centavos) INTO c FROM split_item WHERE split_execucao_id = se1;
  IF c = 580000 THEN
    RAISE NOTICE 'ok   C2   os QUATRO tipos fecham ao centavo (%). Sem repasse_concessionaria a soma daria 568000 e a invariante seria falsa toda vez que houvesse tarifa', c;
  ELSE RAISE WARNING 'FALHA C2 soma deu %', c; falhas := falhas + 1; END IF;
  SET CONSTRAINTS ALL DEFERRED;

  -- C3 ACUSA: dois itens do mesmo tipo. A soma continuaria fechando com um
  --    liquido G3 menor - e por isso o unico existe alem da invariante.
  BEGIN
    INSERT INTO split_item (tenant_id,split_execucao_id,tipo,dono_usina_id,base_calculo_centavos,percentual_aplicado,valor_centavos,regra_repasse_id)
      VALUES (T,se1,'repasse_usina',dono,567938,70.00,1,rr);
    RAISE WARNING 'FALHA C3 segundo item do mesmo tipo ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   C3   um item por tipo: dupla contagem nao seria pega pela soma, so pelo unico';
  END;

  -- C4 ACUSA: comissao sem originador.
  BEGIN
    INSERT INTO split_item (tenant_id,split_execucao_id,tipo,base_calculo_centavos,valor_centavos)
      VALUES (T,se1,'comissao',1000,100);
    RAISE WARNING 'FALHA C4 comissao sem beneficiario ACEITA'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   C4   comissao sem originador recusada (pelo unico de tipo, antes do CHECK)';
  WHEN check_violation THEN
    RAISE NOTICE 'ok   C4   comissao sem originador recusada pelo CHECK de coerencia';
  END;

  -- C5 ACUSA: repasse NEGATIVO. So o residual pode ser.
  BEGIN
    INSERT INTO split_item (tenant_id,split_execucao_id,tipo,dono_usina_id,base_calculo_centavos,percentual_aplicado,valor_centavos,regra_repasse_id)
      VALUES (T,se1,'repasse_usina',dono,100,70.00,-1,rr);
    RAISE WARNING 'FALHA C5 repasse negativo ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   C5   (o unico de tipo pegou antes; o CHECK de sinal e conferido em C6)';
  WHEN check_violation THEN
    RAISE NOTICE 'ok   C5   repasse negativo recusado';
  END;

  -- C6 PASSA: liquido G3 negativo e ACEITO - PRD 5.6, captador senior.
  UPDATE split_item SET valor_centavos = valor_centavos - 1 WHERE split_execucao_id = se1 AND tipo = 'liquido_g3';
  UPDATE split_item SET valor_centavos = valor_centavos + 1 WHERE split_execucao_id = se1 AND tipo = 'comissao';
  SELECT count(*) INTO n FROM split_item WHERE split_execucao_id = se1;
  IF n = 4 THEN
    RAISE NOTICE 'ok   C6   o CHECK de sinal nao virou nega-tudo: o residual continua editavel e a soma segue fechando';
  ELSE RAISE WARNING 'FALHA C6 itens = %', n; falhas := falhas + 1; END IF;

  -- ============================================================== D. cross-tenant
  -- D1 ACUSA: beneficiario de OUTRO tenant. E a "segunda invariante, de igual
  --    peso" do PRD 5.5, e quem a garante e a FK COMPOSTA, nao a frase.
  BEGIN
    UPDATE split_item SET dono_usina_id = dono2 WHERE split_execucao_id = se1 AND tipo = 'repasse_usina';
    RAISE WARNING 'FALHA D1 split_item apontou para dono de outro tenant'; falhas := falhas + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok   D1   FK composta rejeita beneficiario de outro tenant com 23503';
  END;

  -- ============================================================== E. o contador
  -- E1 PASSA: o contador avancou sozinho, no gatilho, para fatura CHEIA.
  SELECT faturas_cheias_pagas INTO n FROM contrato WHERE id = k1;
  IF n = 1 THEN
    RAISE NOTICE 'ok   E1   PRD 5.4 o contador do contrato avancou para 1 no INSERT do split, sem a aplicacao mandar';
  ELSE RAISE WARNING 'FALHA E1 contador = % (esperado 1)', n; falhas := falhas + 1; END IF;

  -- E2 ACUSA o oposto: fatura NAO-cheia nao avanca o contador.
  INSERT INTO fatura (tenant_id,contrato_id,unidade_consumidora_id,usina_id,competencia,
    geracao_kwh_competencia,percentual_rateio_aplicado,consumo_kwh,tarifa_reais_por_kwh,
    valor_consumo_centavos,flag_fatura_cheia,vencimento,status,emitida_em)
    VALUES (T,k2,uc2,us,'2026-07-01',10000,25,2500,1.130000,282500,false,'2026-08-10','emitida',now())
    RETURNING id INTO f2;
  INSERT INTO liquidacao (tenant_id,fatura_id,data_liquidacao,valor_liquidado_centavos,origem)
    VALUES (T,f2,'2026-08-10',282500,'manual') RETURNING id INTO l1;
  INSERT INTO split_execucao (tenant_id,liquidacao_id,fatura_id,contrato_id,competencia,
    valor_liquidado_centavos,base_consumo_centavos,base_repasse_centavos)
    VALUES (T,l1,f2,k2,'2026-07-01',282500,282500,282500) RETURNING id INTO se1;
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,dono_usina_id,base_calculo_centavos,percentual_aplicado,valor_centavos,regra_repasse_id)
    VALUES (T,se1,'repasse_usina',dono,282500,70.00,197750,rr);
  INSERT INTO split_item (tenant_id,split_execucao_id,tipo,base_calculo_centavos,valor_centavos)
    VALUES (T,se1,'liquido_g3',282500,282500-197750);
  SELECT faturas_cheias_pagas INTO n FROM contrato WHERE id = k2;
  IF n = 0 THEN
    RAISE NOTICE 'ok   E2   fatura NAO-cheia liquidada e repartida NAO avanca o contador (PRD 5.4)';
  ELSE RAISE WARNING 'FALHA E2 contador de contrato nao-cheio = %', n; falhas := falhas + 1; END IF;

  -- ============================================================== F. a parcela da comissao
  -- As tres funcoes de preco filtram por app.current_tenant_id(), e sem contexto
  -- devolvem zero linhas - que a R26 transforma em no_data_found. Isso e o
  -- comportamento certo e e o motivo do set_config aqui: sem ele o teste mediria
  -- "ausencia de contexto", nao "ausencia de regra".
  PERFORM set_config('app.tenant_id', T::text, true);
  PERFORM set_config('app.usuario_id', usr::text, true);

  SELECT app.percentual_comissao('parceiro_captador', 1::smallint, date '2026-05-01') INTO v;
  IF v = 30.00 THEN RAISE NOTICE 'ok   F1   1a fatura cheia: captador paga 30%% (PRD 5.4)';
  ELSE RAISE WARNING 'FALHA F1 devolveu %', v; falhas := falhas + 1; END IF;

  SELECT app.percentual_comissao('parceiro_captador', 2::smallint, date '2026-05-01') INTO v;
  IF v = 20.00 THEN RAISE NOTICE 'ok   F2   2a fatura cheia: 20%% - o escalonamento existe, e o total de 50%% e a soma das duas';
  ELSE RAISE WARNING 'FALHA F2 devolveu %', v; falhas := falhas + 1; END IF;

  SELECT app.percentual_comissao('parceiro_captador', 3::smallint, date '2026-05-01') INTO v;
  IF v = 0 THEN RAISE NOTICE 'ok   F3   da 3a cheia em diante: ZERO por regra, e nao no_data_found - "comissao zero" e a regra, nao cadastro faltando';
  ELSE RAISE WARNING 'FALHA F3 3a parcela devolveu %', v; falhas := falhas + 1; END IF;

  BEGIN
    SELECT app.percentual_comissao('vendedor_g3', 1::smallint, date '2026-05-01') INTO v;
    RAISE WARNING 'FALHA F4 tier sem regra devolveu % em vez de levantar', v; falhas := falhas + 1;
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'ok   F4   R26 tier SEM regra vigente levanta: ai e cadastro faltando, e ausencia de preco e erro';
  END;

  -- ============================================================== G. regra 5 no boleto
  -- G1 ACUSA: payload com token.
  BEGIN
    INSERT INTO boleto (tenant_id,fatura_id,valor_registrado_centavos,vencimento,payload_retorno)
      VALUES (T,f2,282500,'2026-08-10','{"nossoNumero":"1","access_token":"eyJhbGciOi..."}'::jsonb);
    RAISE WARNING 'FALHA G1 payload com access_token ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   G1   regra 5 pelo BANCO: payload com access_token recusado. "Violacao disto e falha de revisao" - e revisao nao roda em toda escrita';
  END;

  -- G2 PASSA: payload limpo entra.
  INSERT INTO boleto (tenant_id,fatura_id,valor_registrado_centavos,vencimento,payload_retorno,status,registrado_em)
    VALUES (T,f2,282500,'2026-08-10','{"nossoNumero":"1","situacao":"em_aberto"}'::jsonb,'registrado',now());
  RAISE NOTICE 'ok   G2   payload sem segredo entra normalmente (o aperto nao virou nega-tudo)';

  -- G3 ACUSA: segundo boleto para a mesma fatura.
  BEGIN
    INSERT INTO boleto (tenant_id,fatura_id,valor_registrado_centavos,vencimento)
      VALUES (T,f2,282500,'2026-08-10');
    RAISE WARNING 'FALHA G3 segundo boleto da mesma fatura ACEITO'; falhas := falhas + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'ok   G3   boleto e 1:1 com a fatura: o cliente nao recebe dois documentos da mesma cobranca';
  END;

  -- G4 ACUSA: credencial colada no lugar da referencia.
  BEGIN
    INSERT INTO conector_cobranca (tenant_id, credencial_ref)
      VALUES (T, '-----BEGIN PRIVATE KEY-----MIIEvQIBADAN');
    RAISE WARNING 'FALHA G4 chave privada aceita como credencial_ref'; falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   G4   chave privada colada no lugar da referencia e recusada pelo banco';
  END;

  -- G5 PASSA: a referencia entra, COM a identidade que a migration 36 exige para
  -- ligar. `numero_contrato_cobranca` fica de fora de proposito: a pagina da API
  -- pede para OMITIR, e a 36 justamente tirou ele da exigencia.
  INSERT INTO conector_cobranca (tenant_id, credencial_ref, ativo,
                                 numero_cliente, codigo_modalidade, numero_conta_corrente)
    VALUES (T, 'vault://sicoob/g3', true, 99999, 1, 88888);
  RAISE NOTICE 'ok   G5   a REFERENCIA entra normalmente, com numero_cliente + modalidade + conta';

  -- G5b ACUSA: A LINHA QUE A 35 ACEITAVA E A 36 RECUSA, e ela e o unico jeito de
  -- provar no CI que a troca da migration 36 pegou.
  --
  -- A 36 nao afrouxou nada - ela TROCOU qual e o terceiro campo obrigatorio:
  -- saiu `numero_contrato_cobranca` (o banco pede para omitir) e entrou
  -- `numero_conta_corrente` (o modelo do POST /boletos o marca com `*`, e e a
  -- conta que recebe o credito da liquidacao). Entao um conector ativo COM
  -- contrato numerado e SEM conta de credito passava antes e tem de falhar agora.
  --
  -- Note que a constraint nasce NOT VALID, e isso nao a enfraquece aqui: NOT
  -- VALID dispensa a checagem das linhas ANTIGAS, e continua valendo para toda
  -- linha nova - que e exatamente o caso deste INSERT.
  BEGIN
    INSERT INTO conector_cobranca (tenant_id, credencial_ref, ativo,
                                   numero_cliente, codigo_modalidade, numero_contrato_cobranca)
      VALUES (T, 'vault://sicoob/sem-conta', true, 99999, 1, 12345);
    RAISE WARNING 'FALHA G5b conector ativo SEM numero_conta_corrente foi aceito - a migration 36 nao pegou';
    falhas := falhas + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok   G5b  migration 36: contrato numerado nao substitui a conta de credito - ativo sem numero_conta_corrente e recusado';
  END;

  -- ============================================================== H. as views
  SELECT count(*) INTO n FROM posicao_da_carteira WHERE competencia = '2026-07-01';
  IF n = 1 THEN RAISE NOTICE 'ok   H1   posicao_da_carteira agrega a competencia';
  ELSE RAISE WARNING 'FALHA H1 posicao devolveu % linhas', n; falhas := falhas + 1; END IF;

  -- Com a base sendo a geracao MEDIDA, o consumo faturado nao passa da geracao.
  -- 50% + 25% de 10.000 kWh = 7.500, e sobram 2.500.
  SELECT saldo_kwh INTO v FROM uso_da_usina_por_competencia
   WHERE usina_id = us AND competencia = '2026-07-01';
  IF v = 2500 THEN
    RAISE NOTICE 'ok   H2   RATEIO-USO-01: 10.000 kWh gerados, 7.500 faturados, saldo 2.500 - o "quanto JA FOI usada" existe e nao pode ficar negativo com a base sendo a geracao medida';
  ELSE RAISE WARNING 'FALHA H2 saldo deu %', v; falhas := falhas + 1; END IF;

  IF falhas > 0 THEN RAISE EXCEPTION '% falha(s) na carteira', falhas;
  ELSE RAISE NOTICE '--- carteira: 26 verificacoes, 0 falhas'; END IF;
END $bloco$;
