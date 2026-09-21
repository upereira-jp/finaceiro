-- =====================================================================
-- ESPELHO -- MOVIMENTO E OPERACAO (o que aconteceu)
--
-- DINHEIRO SAI EM CENTAVOS, SEMPRE (CLAUDE.md 1). Nenhuma view divide por
-- 100: float em dinheiro e proibido em toda camada, e "so no relatorio"
-- e como a proibicao morre. Quem le converte na hora de escrever o texto,
-- e o servico carimba meta.unidade_monetaria = 'centavos' em toda resposta.
--
-- kWh, percentual e tarifa mantem a escala decimal da coluna -- sao
-- grandeza fisica e proporcao, nao dinheiro.
-- =====================================================================

begin;

-- ------------------------------------------------------------- fatura
create or replace view relatorio.v_fatura as
select f.tenant_id, t.razao_social as tenant,
       f.id as fatura_id, f.competencia, f.status::text as status,
       f.vencimento, f.emitida_em, f.cancelada_em, f.motivo_cancelamento, f.criado_em,
       f.flag_fatura_cheia,
       f.consumo_kwh, f.geracao_kwh_competencia, f.percentual_rateio_aplicado,
       f.tarifa_reais_por_kwh,
       f.valor_consumo_centavos, f.valor_tarifas_concessionaria_centavos,
       f.valor_juros_multa_centavos, f.valor_total_centavos,
       f.contrato_id,
       f.unidade_consumidora_id, uc.numero_uc,
       f.usina_id, us.codigo_geradora as usina_codigo,
       ct.cliente_id, c.nome as cliente_nome,
       l.id as liquidacao_id, l.data_liquidacao, l.valor_liquidado_centavos,
       (l.id is not null) as liquidada,
       case when l.id is null and f.status::text not in ('cancelada','rascunho') and f.vencimento < current_date
            then current_date - f.vencimento else 0 end as dias_em_atraso,
       b.id as boleto_id, b.status::text as boleto_status
  from public.fatura f
  join public.tenant t on t.id = f.tenant_id
  join public.contrato ct on ct.id = f.contrato_id and ct.tenant_id = f.tenant_id
  join public.cliente c on c.id = ct.cliente_id and c.tenant_id = f.tenant_id
  join public.unidade_consumidora uc on uc.id = f.unidade_consumidora_id and uc.tenant_id = f.tenant_id
  join public.usina us on us.id = f.usina_id and us.tenant_id = f.tenant_id
  left join public.liquidacao l on l.fatura_id = f.id and l.tenant_id = f.tenant_id
  left join public.boleto b on b.fatura_id = f.id and b.tenant_id = f.tenant_id;
comment on view relatorio.v_fatura is
  'Faturas emitidas pelo financeiro, ja com cliente, UC, usina, liquidacao e boleto. '
  'Periodo natural: competencia. dias_em_atraso so conta fatura viva e vencida sem liquidacao. Valores em CENTAVOS.';

-- ------------------------------------------------------------- boleto
create or replace view relatorio.v_boleto as
select b.tenant_id, t.razao_social as tenant,
       b.id as boleto_id, b.fatura_id, f.competencia,
       b.status::text as status, b.origem::text as origem,
       b.valor_registrado_centavos, b.vencimento,
       b.nosso_numero, b.sicoob_nosso_numero, b.sicoob_numero_contrato,
       b.registrado_em, b.baixado_em, b.criado_em,
       b.tentativas, b.ultima_tentativa_em, b.proxima_tentativa_em, b.ultimo_erro,
       uc.numero_uc, c.nome as cliente_nome,
       (b.linha_digitavel is not null) as tem_linha_digitavel,
       (b.pix_copia_e_cola is not null) as tem_pix
  from public.boleto b
  join public.tenant t on t.id = b.tenant_id
  join public.fatura f on f.id = b.fatura_id and f.tenant_id = b.tenant_id
  join public.unidade_consumidora uc on uc.id = f.unidade_consumidora_id and uc.tenant_id = f.tenant_id
  join public.contrato ct on ct.id = f.contrato_id and ct.tenant_id = f.tenant_id
  join public.cliente c on c.id = ct.cliente_id and c.tenant_id = f.tenant_id;
comment on view relatorio.v_boleto is
  'Boletos registrados no banco. LINHA DIGITAVEL, CODIGO DE BARRAS, PIX COPIA-E-COLA e os payloads de '
  'integracao NAO saem (sao instrumento de pagamento) -- so as flags tem_linha_digitavel/tem_pix. '
  'Periodo natural: vencimento.';

-- --------------------------------------------------------- liquidacao
create or replace view relatorio.v_liquidacao as
select l.tenant_id, t.razao_social as tenant,
       l.id as liquidacao_id, l.fatura_id, f.competencia,
       l.data_liquidacao, l.valor_liquidado_centavos,
       l.juros_centavos, l.multa_centavos,
       l.origem::text as origem, l.id_externo, l.observacao, l.criado_em,
       f.valor_total_centavos as fatura_valor_total_centavos,
       (l.valor_liquidado_centavos - f.valor_total_centavos) as diferenca_centavos,
       uc.numero_uc, c.nome as cliente_nome
  from public.liquidacao l
  join public.tenant t on t.id = l.tenant_id
  join public.fatura f on f.id = l.fatura_id and f.tenant_id = l.tenant_id
  join public.unidade_consumidora uc on uc.id = f.unidade_consumidora_id and uc.tenant_id = f.tenant_id
  join public.contrato ct on ct.id = f.contrato_id and ct.tenant_id = f.tenant_id
  join public.cliente c on c.id = ct.cliente_id and c.tenant_id = f.tenant_id;
comment on view relatorio.v_liquidacao is
  'Dinheiro que entrou, por fatura. diferenca_centavos = liquidado - valor da fatura (positivo inclui juros/multa). '
  'Periodo natural: data_liquidacao.';

-- ------------------------------------------------------- split / repasse
create or replace view relatorio.v_split_execucao as
select s.tenant_id, t.razao_social as tenant,
       s.id as split_execucao_id, s.competencia, s.executado_em,
       s.liquidacao_id, s.fatura_id, s.contrato_id,
       s.valor_liquidado_centavos, s.base_consumo_centavos, s.base_repasse_centavos,
       s.parcela_comissao,
       (select coalesce(sum(i.valor_centavos), 0) from public.split_item i
         where i.tenant_id = s.tenant_id and i.split_execucao_id = s.id) as total_distribuido_centavos
  from public.split_execucao s
  join public.tenant t on t.id = s.tenant_id;
comment on view relatorio.v_split_execucao is
  'Cada rateio de um recebimento entre dono da usina e originador. Periodo natural: competencia.';

create or replace view relatorio.v_split_item as
select i.tenant_id, t.razao_social as tenant,
       i.id as split_item_id, i.split_execucao_id, s.competencia, s.executado_em,
       i.tipo::text as tipo,
       i.base_calculo_centavos, i.percentual_aplicado, i.valor_centavos,
       i.dono_usina_id, d.nome as dono_usina_nome,
       i.originador_id, o.nome as originador_nome,
       coalesce(d.nome, o.nome) as beneficiario_nome,
       i.regra_repasse_id, i.regra_comissao_id,
       s.fatura_id, s.contrato_id
  from public.split_item i
  join public.tenant t on t.id = i.tenant_id
  join public.split_execucao s on s.id = i.split_execucao_id and s.tenant_id = i.tenant_id
  left join public.dono_usina d on d.id = i.dono_usina_id and d.tenant_id = i.tenant_id
  left join public.originador o on o.id = i.originador_id and o.tenant_id = i.tenant_id;
comment on view relatorio.v_split_item is
  'Cada parcela do rateio: quanto foi de repasse (dono da usina) e quanto de comissao (originador). Valores em CENTAVOS.';

-- ------------------------------------------------------- contas a pagar
create or replace view relatorio.v_conta_pagar as
select cp.tenant_id, t.razao_social as tenant,
       cp.id as conta_pagar_id, cp.descricao,
       cp.status::text as status,
       cp.competencia, cp.vencimento, cp.criado_em, cp.cancelada_em,
       cp.valor_centavos, cp.valor_pago_centavos,
       (cp.valor_centavos - cp.valor_pago_centavos) as valor_aberto_centavos,
       cp.beneficiario_tipo::text as beneficiario_tipo,
       coalesce(cp.beneficiario_nome, d.nome, o.nome) as beneficiario_nome,
       cp.dono_usina_id, cp.originador_id,
       cp.categoria_id, cat.nome as categoria_nome,
       cp.centro_custo_id, cc.nome as centro_custo_nome,
       cp.origem_split_item_id,
       case when cp.status::text = 'aberta' and cp.vencimento < current_date
            then current_date - cp.vencimento else 0 end as dias_em_atraso
  from public.conta_pagar cp
  join public.tenant t on t.id = cp.tenant_id
  left join public.dono_usina d on d.id = cp.dono_usina_id and d.tenant_id = cp.tenant_id
  left join public.originador o on o.id = cp.originador_id and o.tenant_id = cp.tenant_id
  left join public.categoria cat on cat.id = cp.categoria_id and cat.tenant_id = cp.tenant_id
  left join public.centro_custo cc on cc.id = cp.centro_custo_id and cc.tenant_id = cp.tenant_id;
comment on view relatorio.v_conta_pagar is
  'O que a empresa deve: repasse, comissao e despesa avulsa. valor_aberto_centavos e o saldo. '
  'Periodo natural: competencia (use vencimento para fluxo de caixa).';

create or replace view relatorio.v_pagamento as
select p.tenant_id, t.razao_social as tenant,
       p.id as pagamento_id, p.conta_pagar_id, cp.descricao as conta_descricao,
       p.data_pagamento, p.valor_centavos, p.forma::text as forma,
       p.referencia_externa, p.observacao, p.criado_em,
       coalesce(cp.beneficiario_nome, d.nome, o.nome) as beneficiario_nome
  from public.pagamento p
  join public.tenant t on t.id = p.tenant_id
  join public.conta_pagar cp on cp.id = p.conta_pagar_id and cp.tenant_id = p.tenant_id
  left join public.dono_usina d on d.id = cp.dono_usina_id and d.tenant_id = cp.tenant_id
  left join public.originador o on o.id = cp.originador_id and o.tenant_id = cp.tenant_id;
comment on view relatorio.v_pagamento is 'Baixas das contas a pagar. Periodo natural: data_pagamento.';

-- ------------------------------------------------------------- geracao
create or replace view relatorio.v_usina_geracao as
select g.tenant_id, t.razao_social as tenant,
       g.id as geracao_id, g.usina_id, u.codigo_geradora as usina_codigo, u.apelido as usina_apelido,
       g.competencia, g.geracao_kwh, g.origem::text as origem,
       u.geracao_nominal_kwh
  from public.usina_geracao g
  join public.tenant t on t.id = g.tenant_id
  join public.usina u on u.id = g.usina_id and u.tenant_id = g.tenant_id;
comment on view relatorio.v_usina_geracao is
  'Geracao medida por usina e competencia (kWh). Periodo natural: competencia.';

-- ------------------------------------------- conta unificada lida (OCR)
create or replace view relatorio.v_registro_fatura_unificada as
select r.tenant_id, t.razao_social as tenant,
       r.id as registro_id, r.numero_uc, r.competencia,
       r.unidade_consumidora_id, r.fatura_id,
       r.cliente_nome,
       relatorio.mascara_documento(r.cliente_documento) as cliente_documento_mascarado,
       r.classificacao, r.bandeira_tarifaria,
       r.data_emissao, r.leitura_anterior, r.leitura_atual, r.dias_faturados, r.vencimento,
       r.compensada_kwh, r.nao_compensado_kwh, r.tarifa_kwh,
       r.percentual_desconto, r.fator_emissao,
       r.integral_centavos, r.desconto_centavos, r.energia_g3_centavos,
       r.nao_compensado_centavos, r.iluminacao_publica_centavos,
       r.bandeira_centavos, r.demais_centavos,
       r.total_equatorial_centavos, r.total_centavos,
       r.historico_consumo,
       (r.linha_digitavel is not null) as tem_linha_digitavel,
       r.criado_em, r.atualizado_em
  from public.registro_de_fatura_unificada r
  join public.tenant t on t.id = r.tenant_id;
comment on view relatorio.v_registro_fatura_unificada is
  'A conta da distribuidora lida e transformada em fatura unificada. Endereco e linha digitavel nao saem; '
  'o documento do cliente sai mascarado. Periodo natural: competencia.';

-- ---------------------------------------------------------- integracoes
create or replace view relatorio.v_conector_crm as
select c.tenant_id, t.razao_social as tenant,
       c.id as conector_id, c.tipo::text as tipo, c.crm_tenant_id, c.ativo,
       c.ultimo_status::text as ultimo_status, c.ultima_execucao_em, c.ultima_leitura_em,
       c.ultimo_ciclo_id, c.ultimo_erro
  from public.conector_crm c
  join public.tenant t on t.id = c.tenant_id;
comment on view relatorio.v_conector_crm is
  'Estado do espelho com o CRM (leitura). credencial_ref nao sai. crm_tenant_id e o id do tenant NO CRM -- '
  'nunca confundir com tenant_id daqui.';

create or replace view relatorio.v_conector_execucao as
select e.tenant_id, t.razao_social as tenant,
       e.id as execucao_id, e.conector_id, e.ciclo_id,
       e.iniciado_em, e.terminado_em, e.status::text as status,
       e.lidos, e.criados, e.atualizados, e.desativados, e.recusados,
       extract(epoch from (e.terminado_em - e.iniciado_em)) as duracao_s
  from public.conector_execucao e
  join public.tenant t on t.id = e.tenant_id;
comment on view relatorio.v_conector_execucao is
  'Cada ciclo do conector com o CRM e o que ele fez. O payload `detalhe` nao sai (pode carregar dado de cliente). '
  'Periodo natural: iniciado_em.';

create or replace view relatorio.v_conector_cobranca as
select c.tenant_id, t.razao_social as tenant,
       c.id as conector_id, c.provedor::text as provedor,
       c.ativo, c.sandbox, c.certificado_expira_em,
       case when c.certificado_expira_em is null then null
            else c.certificado_expira_em - current_date end as dias_para_expirar_certificado,
       c.ultima_emissao_em, c.ultimo_erro, c.criado_em
  from public.conector_cobranca c
  join public.tenant t on t.id = c.tenant_id;
comment on view relatorio.v_conector_cobranca is
  'Estado do conector bancario (emissao de boleto). Agencia, conta, convenio e credencial_ref NAO saem. '
  'dias_para_expirar_certificado negativo = certificado A1 vencido: a cobranca para.';

create or replace view relatorio.v_agenda_execucao as
select a.tenant_id, t.razao_social as tenant,
       a.id as execucao_id, a.tarefa::text as tarefa, a.ciclo_id,
       a.iniciado_em, a.terminado_em, a.status::text as status,
       a.examinados, a.registrados, a.falhos, a.liquidados, a.divergentes,
       extract(epoch from (a.terminado_em - a.iniciado_em)) as duracao_s
  from public.agenda_execucao a
  join public.tenant t on t.id = a.tenant_id;
comment on view relatorio.v_agenda_execucao is
  'Rodadas automaticas de cobranca (fila de emissao, consulta de baixa). Periodo natural: iniciado_em.';

-- --------------------------------------------------------------- trilhas
create or replace view relatorio.v_auditoria as
select a.tenant_id, t.razao_social as tenant,
       a.id as auditoria_id, a.tabela, a.registro_id,
       a.operacao, a.usuario_id, u.nome as usuario_nome, a.tier, a.ocorrido_em,
       case when a.operacao = 'U' and a.antes is not null and a.depois is not null
            then array(select k from jsonb_object_keys(a.depois) k
                        where a.depois -> k is distinct from a.antes -> k)
            else null end as campos_alterados
  from public.auditoria a
  left join public.tenant t on t.id = a.tenant_id
  left join public.usuario u on u.id = a.usuario_id;
comment on view relatorio.v_auditoria is
  'Quem mudou o que, e quando. Os payloads `antes`/`depois` NAO saem (carregam qualquer coluna, inclusive PII) -- '
  'sai a LISTA de campos alterados, que responde "o que mudou" sem entregar valor. Periodo natural: ocorrido_em.';

create or replace view relatorio.v_acesso_plataforma_log as
select l.tenant_id, t.razao_social as tenant,
       l.id as log_id, l.usuario_id, u.nome as usuario_nome,
       l.acao, l.recurso, l.ocorrido_em
  from public.acesso_plataforma_log l
  join public.tenant t on t.id = l.tenant_id
  left join public.usuario u on u.id = l.usuario_id;
comment on view relatorio.v_acesso_plataforma_log is
  'Acesso de nivel plataforma a dado de tenant (CLAUDE.md 9). Periodo natural: ocorrido_em.';

create or replace view relatorio.v_ato_externo_log as
select l.tenant_id, t.razao_social as tenant,
       l.id as log_id, l.ato, l.contraparte, l.fase,
       l.usuario_id, u.nome as usuario_nome, l.tier, l.ocorrido_em,
       case when l.detalhe is null then null
            else array(select k from jsonb_object_keys(l.detalhe) k) end as detalhe_chaves
  from public.ato_externo_log l
  join public.tenant t on t.id = l.tenant_id
  left join public.usuario u on u.id = l.usuario_id;
comment on view relatorio.v_ato_externo_log is
  'Trilha de ato com efeito fora do sistema (registrar boleto, emitir, cancelar). O payload nao sai; saem as chaves. '
  'Periodo natural: ocorrido_em.';

create or replace view relatorio.v_cofre_acesso_log as
select l.tenant_id, t.razao_social as tenant,
       l.id as log_id, left(l.credencial_ref, 8) || '…' as credencial_ref_prefixo,
       l.usuario_id, u.nome as usuario_nome, l.tier, l.ocorrido_em
  from public.cofre_acesso_log l
  join public.tenant t on t.id = l.tenant_id
  left join public.usuario u on u.id = l.usuario_id;
comment on view relatorio.v_cofre_acesso_log is
  'Quem abriu o cofre de credenciais e quando. A referencia sai truncada -- ela aponta para segredo.';

commit;
