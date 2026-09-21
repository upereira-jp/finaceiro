-- =====================================================================
-- ESPELHO -- CADASTRO (quem e o que existe)
-- Uma view por tabela de cadastro. O criterio de recorte de coluna e um so:
--   * dado de NEGOCIO sai inteiro;
--   * PII de pessoa sai MASCARADA (ficha completa: fn_ficha_cliente, com gate);
--   * SEGREDO E MEIO DE PAGAMENTO NAO SAEM -- nunca, nem com pii=true:
--     chave PIX, banco/agencia/conta, credencial_ref, linha digitavel,
--     codigo de barras, pix copia-e-cola, payloads de integracao, bytes de
--     logo. Quem tem esses campos consegue receber no lugar da empresa ou
--     pagar em nome dela; relatorio nao precisa deles para nada.
--
-- O `comment on view` NAO e decoracao: o servico le esses comentarios do
-- catalogo e os entrega ao modelo como descricao da tabela. Comentario
-- errado aqui vira relatorio errado la.
-- =====================================================================

begin;

-- ------------------------------------------------------------- tenant
create or replace view relatorio.v_tenant as
select t.id as tenant_id, t.razao_social as tenant,
       t.razao_social, t.cnpj, t.status::text as status,
       t.data_ativacao, t.criado_em, t.atualizado_em,
       (select count(*) from public.usuario_tenant ut where ut.tenant_id = t.id and ut.ativo) as usuarios_ativos,
       (select count(*) from public.cliente c where c.tenant_id = t.id and c.ativo) as clientes_ativos
  from public.tenant t;
comment on view relatorio.v_tenant is
  'Empresas (tenants) do financeiro. CNPJ da empresa sai inteiro -- e dado publico de pessoa juridica, nao PII.';

-- ------------------------------------------------------------ usuario
create or replace view relatorio.v_usuario as
select ut.tenant_id, t.razao_social as tenant,
       u.id as usuario_id, u.nome,
       relatorio.mascara_email(u.email) as email_mascarado,
       ut.papel::text as papel, ut.ativo as ativo_no_tenant, u.ativo as usuario_ativo,
       pa.tier::text as tier_plataforma, u.criado_em
  from public.usuario_tenant ut
  join public.usuario u on u.id = ut.usuario_id
  join public.tenant  t on t.id = ut.tenant_id
  left join public.plataforma_admin pa on pa.usuario_id = u.id;
comment on view relatorio.v_usuario is
  'Quem opera o sistema, por tenant e papel. Nome de funcionario sai inteiro; e-mail sai mascarado.';

-- ------------------------------------------------------------ cliente
create or replace view relatorio.v_cliente as
select c.tenant_id, t.razao_social as tenant,
       c.id as cliente_id, c.nome,
       relatorio.mascara_documento(c.documento) as documento_mascarado,
       c.documento_tipo::text as documento_tipo,
       c.documento_validado,
       c.documento_origem::text as documento_origem,
       (c.documento is not null) as tem_documento,
       relatorio.mascara_telefone(c.telefone) as telefone_mascarado,
       relatorio.mascara_email(c.email)       as email_mascarado,
       c.origem, c.consumo_kwh, c.consumo_referencia_centavos,
       c.ativo, c.criado_em, c.crm_lead_id,
       ec.tem_rateio_ativo, ec.tem_venda_ganha, ec.em_carteira,
       ec.sincronizado_em as crm_sincronizado_em,
       (select count(*) from public.unidade_consumidora uc
         where uc.tenant_id = c.tenant_id and uc.cliente_id = c.id) as qtd_ucs,
       (select count(*) from public.contrato ct
         where ct.tenant_id = c.tenant_id and ct.cliente_id = c.id
           and ct.status::text = 'ativo') as qtd_contratos_ativos
  from public.cliente c
  join public.tenant t on t.id = c.tenant_id
  left join public.cliente_estado_crm ec on ec.cliente_id = c.id and ec.tenant_id = c.tenant_id;
comment on view relatorio.v_cliente is
  'Clientes. Documento/telefone/e-mail MASCARADOS -- ficha completa so por fn_ficha_cliente (gate de PII). '
  'Traz o espelho do CRM (tem_rateio_ativo, tem_venda_ganha, em_carteira) e a contagem de UCs e contratos.';

-- ------------------------------------------------- unidade consumidora
create or replace view relatorio.v_unidade_consumidora as
select uc.tenant_id, t.razao_social as tenant,
       uc.id as uc_id, uc.numero_uc, uc.distribuidora,
       relatorio.endereco_grao(uc.endereco_municipio, uc.endereco_uf) as municipio_uf,
       (uc.endereco_logradouro is not null and uc.endereco_cep is not null) as tem_endereco_completo,
       uc.titularidade::text as titularidade,
       uc.status::text as status,
       uc.cliente_id, c.nome as cliente_nome,
       uc.usina_id, us.codigo_geradora as usina_codigo, us.apelido as usina_apelido,
       uc.percentual_rateio, uc.data_vencimento, uc.tarifa_reais_por_kwh,
       uc.rateio_situacao, uc.rateio_em_troca_titularidade, uc.rateio_situacao_lida_em,
       uc.crm_usina_cliente_id,
       (select ct.id from public.contrato ct
         where ct.tenant_id = uc.tenant_id and ct.unidade_consumidora_id = uc.id
           and ct.status::text = 'ativo' limit 1) as contrato_ativo_id
  from public.unidade_consumidora uc
  join public.tenant t on t.id = uc.tenant_id
  join public.cliente c on c.id = uc.cliente_id and c.tenant_id = uc.tenant_id
  left join public.usina us on us.id = uc.usina_id and us.tenant_id = uc.tenant_id;
comment on view relatorio.v_unidade_consumidora is
  'Unidades consumidoras (UC): a que usina estao rateadas, com que percentual, situacao do rateio e tarifa. '
  'Endereco sai como municipio/UF; rua, numero e CEP so na ficha (gate de PII).';

-- -------------------------------------------------------------- usina
create or replace view relatorio.v_usina as
select u.tenant_id, t.razao_social as tenant,
       u.id as usina_id, u.codigo_geradora, u.apelido, u.distribuidora,
       u.potencia_kwp, u.geracao_nominal_kwh, u.status::text as status,
       u.regime_fio_b, u.data_homologacao, u.crm_usina_id,
       u.dono_usina_id, d.nome as dono_nome,
       (select count(*) from public.unidade_consumidora uc
         where uc.tenant_id = u.tenant_id and uc.usina_id = u.id) as qtd_ucs,
       (select coalesce(sum(uc.percentual_rateio), 0) from public.unidade_consumidora uc
         where uc.tenant_id = u.tenant_id and uc.usina_id = u.id
           and uc.status::text = 'ativa') as percentual_rateio_alocado
  from public.usina u
  join public.tenant t on t.id = u.tenant_id
  left join public.dono_usina d on d.id = u.dono_usina_id and d.tenant_id = u.tenant_id;
comment on view relatorio.v_usina is
  'Usinas geradoras. percentual_rateio_alocado soma o rateio das UCs ATIVAS -- acima de 100 e sobrevenda.';

-- --------------------------------------------------------- dono_usina
create or replace view relatorio.v_dono_usina as
select d.tenant_id, t.razao_social as tenant,
       d.id as dono_usina_id, d.nome, d.natureza::text as natureza,
       relatorio.mascara_documento(d.documento) as documento_mascarado,
       d.documento_tipo::text as documento_tipo, d.documento_validado,
       relatorio.mascara_telefone(d.telefone) as telefone_mascarado,
       relatorio.mascara_email(d.email) as email_mascarado,
       ((d.banco is not null and d.conta is not null) or d.chave_pix is not null) as tem_meio_de_pagamento,
       d.tipo_chave_pix::text as tipo_chave_pix,
       d.tipo_conta::text as tipo_conta,
       d.ativo,
       (select count(*) from public.usina u where u.tenant_id = d.tenant_id and u.dono_usina_id = d.id) as qtd_usinas
  from public.dono_usina d
  join public.tenant t on t.id = d.tenant_id;
comment on view relatorio.v_dono_usina is
  'Donos de usina (quem recebe repasse). Banco/agencia/conta e a chave PIX NAO sao expostos -- so a flag '
  'tem_meio_de_pagamento e o tipo, que e o que interessa para saber se da para pagar.';

-- --------------------------------------------------------- originador
create or replace view relatorio.v_originador as
select o.tenant_id, t.razao_social as tenant,
       o.id as originador_id, o.nome, o.natureza::text as natureza,
       o.tipo::text as tipo,
       relatorio.mascara_documento(o.documento) as documento_mascarado,
       o.documento_tipo::text as documento_tipo, o.documento_validado,
       relatorio.mascara_telefone(o.telefone) as telefone_mascarado,
       relatorio.mascara_email(o.email) as email_mascarado,
       ((o.banco is not null and o.conta is not null) or o.chave_pix is not null) as tem_meio_de_pagamento,
       o.tipo_chave_pix::text as tipo_chave_pix,
       o.ativo, o.crm_partner_id, o.crm_user_id,
       (select count(*) from public.contrato ct where ct.tenant_id = o.tenant_id and ct.originador_id = o.id) as qtd_contratos
  from public.originador o
  join public.tenant t on t.id = o.tenant_id;
comment on view relatorio.v_originador is
  'Originadores (quem trouxe a venda e recebe comissao): vendedor interno ou parceiro. '
  'crm_partner_id/crm_user_id sao a ponte com o CRM. Dados bancarios nao saem.';

-- ----------------------------------------------------------- contrato
create or replace view relatorio.v_contrato as
select ct.tenant_id, t.razao_social as tenant,
       ct.id as contrato_id, ct.status::text as status,
       ct.data_fechamento,
       ct.valor_referencia_centavos,
       ct.valor_referencia_origem::text as valor_referencia_origem,
       ct.faturas_cheias_pagas,
       ct.originador_tipo_no_fechamento::text as originador_tipo_no_fechamento,
       ct.cliente_id, c.nome as cliente_nome,
       ct.unidade_consumidora_id, uc.numero_uc,
       ct.usina_id, us.codigo_geradora as usina_codigo,
       ct.originador_id, o.nome as originador_nome
  from public.contrato ct
  join public.tenant t on t.id = ct.tenant_id
  join public.cliente c on c.id = ct.cliente_id and c.tenant_id = ct.tenant_id
  join public.unidade_consumidora uc on uc.id = ct.unidade_consumidora_id and uc.tenant_id = ct.tenant_id
  join public.usina us on us.id = ct.usina_id and us.tenant_id = ct.tenant_id
  left join public.originador o on o.id = ct.originador_id and o.tenant_id = ct.tenant_id;
comment on view relatorio.v_contrato is
  'Contratos de assinatura. valor_referencia_centavos e a base do contrato (CENTAVOS). '
  'Periodo natural: data_fechamento.';

-- ------------------------------------------------------ regras/tabelas
create or replace view relatorio.v_regra_repasse as
select r.tenant_id, t.razao_social as tenant,
       r.id as regra_repasse_id, r.usina_id, u.codigo_geradora as usina_codigo,
       r.percentual, r.vigencia_inicio, r.vigencia_fim,
       (r.vigencia_fim is null or r.vigencia_fim >= current_date) as vigente
  from public.regra_repasse r
  join public.tenant t on t.id = r.tenant_id
  join public.usina u on u.id = r.usina_id and u.tenant_id = r.tenant_id;
comment on view relatorio.v_regra_repasse is
  'Percentual repassado ao dono da usina, por usina e vigencia.';

create or replace view relatorio.v_regra_comissao as
select r.tenant_id, t.razao_social as tenant,
       r.id as regra_comissao_id, r.originador_tipo::text as originador_tipo,
       r.percentual, r.parcela, r.vigencia_inicio, r.vigencia_fim,
       (r.vigencia_fim is null or r.vigencia_fim >= current_date) as vigente
  from public.regra_comissao r
  join public.tenant t on t.id = r.tenant_id;
comment on view relatorio.v_regra_comissao is
  'Comissao por tipo de originador e parcela (1a, 2a...), com vigencia.';

create or replace view relatorio.v_categoria as
select c.tenant_id, t.razao_social as tenant, c.id as categoria_id, c.nome, c.ativo, c.criado_em
  from public.categoria c join public.tenant t on t.id = c.tenant_id;
comment on view relatorio.v_categoria is 'Categorias de conta a pagar.';

create or replace view relatorio.v_centro_custo as
select c.tenant_id, t.razao_social as tenant, c.id as centro_custo_id, c.nome, c.ativo, c.criado_em
  from public.centro_custo c join public.tenant t on t.id = c.tenant_id;
comment on view relatorio.v_centro_custo is 'Centros de custo.';

create or replace view relatorio.v_distribuidora as
select d.nome, d.ativa from public.distribuidora d;
comment on view relatorio.v_distribuidora is
  'Lista de referencia de distribuidoras. NAO tem tenant_id de proposito (e global).';

-- ------------------------------------------------- cobranca: identidade
create or replace view relatorio.v_chave_pix as
select k.tenant_id, t.razao_social as tenant,
       k.id as chave_pix_id, k.apelido, k.tipo::text as tipo,
       k.recebedor_nome, k.recebedor_cidade, k.ativa, k.criado_em, k.atualizado_em,
       (k.chave is not null) as tem_chave
  from public.chave_pix k
  join public.tenant t on t.id = k.tenant_id;
comment on view relatorio.v_chave_pix is
  'Chaves PIX de recebimento cadastradas. A CHAVE EM SI NAO SAI -- quem a tem recebe no lugar da empresa.';

create or replace view relatorio.v_identidade_de_cobranca as
select i.tenant_id, t.razao_social as tenant,
       i.razao_social, i.cnpj, i.telefone, i.email, i.site, i.endereco,
       (i.logo_bytes is not null) as tem_logo, i.logo_bytes, i.logo_mime,
       i.chave_pix_padrao_id, k.apelido as chave_pix_padrao_apelido,
       i.modelo_padrao_id, m.nome as modelo_padrao_nome,
       i.criado_em, i.atualizado_em
  from public.identidade_de_cobranca i
  join public.tenant t on t.id = i.tenant_id
  left join public.chave_pix k on k.id = i.chave_pix_padrao_id and k.tenant_id = i.tenant_id
  left join public.modelo_de_fatura m on m.id = i.modelo_padrao_id and m.tenant_id = i.tenant_id;
comment on view relatorio.v_identidade_de_cobranca is
  'Identidade que a empresa mostra na fatura (razao social, CNPJ, contato). E dado da EMPRESA, nao do cliente. '
  'Do logo sai so o tamanho e o mime -- os bytes ficam no banco.';

create or replace view relatorio.v_logo_de_cobranca as
select l.tenant_id, t.razao_social as tenant,
       l.id as logo_id, l.identidade_id,
       octet_length(l.conteudo) as bytes, l.criado_em
  from public.logo_de_cobranca l
  join public.tenant t on t.id = l.tenant_id;
comment on view relatorio.v_logo_de_cobranca is
  'Logo impresso na fatura. Sai so o tamanho em bytes -- a imagem em si nao e dado de relatorio.';

create or replace view relatorio.v_modelo_de_fatura as
select m.tenant_id, t.razao_social as tenant,
       m.id as modelo_id, m.nome, m.descricao, m.assinatura,
       m.percentual_desconto_padrao, m.fator_emissao_padrao,
       m.multa_percentual, m.juros_mes_percentual,
       m.aviso_titulo, m.aviso_corpo, m.nota_do_fator, m.rodape_legal,
       m.ativo, m.criado_em, m.atualizado_em
  from public.modelo_de_fatura m
  join public.tenant t on t.id = m.tenant_id;
comment on view relatorio.v_modelo_de_fatura is
  'Modelos da fatura unificada: desconto padrao, multa, juros e os textos impressos.';

create or replace view relatorio.v_campo_do_documento as
select c.tenant_id, t.razao_social as tenant,
       c.id as campo_id, c.modelo_id, m.nome as modelo_nome,
       c.campo::text as campo, c.rotulo, c.ordem, c.visivel, c.atualizado_em
  from public.campo_do_documento c
  join public.tenant t on t.id = c.tenant_id
  left join public.modelo_de_fatura m on m.id = c.modelo_id and m.tenant_id = c.tenant_id;
comment on view relatorio.v_campo_do_documento is 'Quais campos nativos aparecem na fatura, em que ordem.';

create or replace view relatorio.v_campo_personalizado_da_fatura as
select c.tenant_id, t.razao_social as tenant,
       c.id as campo_id, c.modelo_id, m.nome as modelo_nome,
       c.chave, c.rotulo, c.origem::text as origem, c.valor,
       c.ordem, c.visivel, c.criado_em, c.atualizado_em
  from public.campo_personalizado_da_fatura c
  join public.tenant t on t.id = c.tenant_id
  left join public.modelo_de_fatura m on m.id = c.modelo_id and m.tenant_id = c.tenant_id;
comment on view relatorio.v_campo_personalizado_da_fatura is 'Campos livres acrescentados ao modelo de fatura.';

commit;
