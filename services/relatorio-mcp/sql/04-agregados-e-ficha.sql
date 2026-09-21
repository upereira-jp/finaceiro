-- =====================================================================
-- AGREGADOS (as perguntas que se faz toda semana) + FICHA (gate de PII)
--
-- Por que agregado existe se ha espelho de tudo: somar linha a linha num
-- chat custa token, custa tempo e erra. A consistencia do numero mora
-- AQUI, no SQL, uma vez -- nao na cabeca do modelo, a cada pergunta.
-- Valores em CENTAVOS.
-- =====================================================================

begin;

-- ------------------------------------------------------ faturamento/mes
create or replace view relatorio.v_faturamento_mes as
select f.tenant_id, t.razao_social as tenant, f.competencia as mes,
       count(*)                                                        as faturas,
       count(*) filter (where f.status::text = 'cancelada')            as canceladas,
       count(*) filter (where f.status::text = 'rascunho')             as rascunhos,
       count(*) filter (where f.flag_fatura_cheia)                     as cheias,
       sum(f.valor_total_centavos) filter (where f.status::text <> 'cancelada')  as valor_faturado_centavos,
       sum(f.valor_consumo_centavos) filter (where f.status::text <> 'cancelada') as valor_consumo_centavos,
       sum(f.valor_tarifas_concessionaria_centavos) filter (where f.status::text <> 'cancelada') as valor_tarifas_centavos,
       sum(f.consumo_kwh) filter (where f.status::text <> 'cancelada')  as consumo_kwh,
       (sum(f.valor_total_centavos) filter (where f.status::text <> 'cancelada')
        / nullif(count(*) filter (where f.status::text <> 'cancelada'), 0))::bigint as ticket_medio_centavos,
       count(l.id)                                                     as liquidadas,
       sum(l.valor_liquidado_centavos)                                 as valor_liquidado_centavos
  from public.fatura f
  join public.tenant t on t.id = f.tenant_id
  left join public.liquidacao l on l.fatura_id = f.id and l.tenant_id = f.tenant_id
 group by f.tenant_id, t.razao_social, f.competencia;
comment on view relatorio.v_faturamento_mes is
  'Faturamento por competencia: quanto foi faturado, quanto disso ja voltou (liquidado) e o ticket medio. '
  'Cancelada nao entra em valor. Periodo natural: mes.';

-- ------------------------------------------------------ recebimento/mes
create or replace view relatorio.v_recebimento_mes as
select l.tenant_id, t.razao_social as tenant,
       date_trunc('month', l.data_liquidacao)::date as mes,
       l.origem::text as origem,
       count(*)                          as liquidacoes,
       sum(l.valor_liquidado_centavos)   as valor_liquidado_centavos,
       sum(l.juros_centavos)             as juros_centavos,
       sum(l.multa_centavos)             as multa_centavos,
       min(l.data_liquidacao)            as primeira,
       max(l.data_liquidacao)            as ultima
  from public.liquidacao l
  join public.tenant t on t.id = l.tenant_id
 group by l.tenant_id, t.razao_social, date_trunc('month', l.data_liquidacao), l.origem;
comment on view relatorio.v_recebimento_mes is
  'Dinheiro que entrou, por mes DE PAGAMENTO e por origem (baixa automatica, manual...). '
  'Nao confundir com v_faturamento_mes, que e por competencia. Periodo natural: mes.';

-- ------------------------------------------------------- inadimplencia
create or replace view relatorio.v_inadimplencia as
select f.tenant_id, t.razao_social as tenant,
       case when current_date - f.vencimento <= 0  then '0 a vencer'
            when current_date - f.vencimento <= 30 then '1 ate 30 dias'
            when current_date - f.vencimento <= 60 then '2 de 31 a 60 dias'
            when current_date - f.vencimento <= 90 then '3 de 61 a 90 dias'
            else '4 mais de 90 dias' end            as faixa_atraso,
       count(*)                                     as faturas,
       sum(f.valor_total_centavos)                  as valor_centavos,
       min(f.vencimento)                            as vencimento_mais_antigo,
       count(distinct ct.cliente_id)                as clientes
  from public.fatura f
  join public.tenant t on t.id = f.tenant_id
  join public.contrato ct on ct.id = f.contrato_id and ct.tenant_id = f.tenant_id
  left join public.liquidacao l on l.fatura_id = f.id and l.tenant_id = f.tenant_id
 where l.id is null
   and f.status::text not in ('cancelada', 'rascunho')
 group by f.tenant_id, t.razao_social, 3;
comment on view relatorio.v_inadimplencia is
  'Faturas vivas sem liquidacao, por faixa de atraso. A faixa "0 a vencer" e carteira sadia, nao inadimplencia. '
  'Sem periodo: e foto de agora.';

-- --------------------------------------------------- repasse e comissao
create or replace view relatorio.v_repasse_comissao_mes as
select s.tenant_id, t.razao_social as tenant, s.competencia as mes,
       i.tipo::text as tipo,
       count(*)                      as itens,
       sum(i.valor_centavos)         as valor_centavos,
       count(distinct coalesce(i.dono_usina_id, i.originador_id)) as beneficiarios,
       sum(i.base_calculo_centavos)  as base_centavos
  from public.split_item i
  join public.split_execucao s on s.id = i.split_execucao_id and s.tenant_id = i.tenant_id
  join public.tenant t on t.id = i.tenant_id
 group by s.tenant_id, t.razao_social, s.competencia, i.tipo;
comment on view relatorio.v_repasse_comissao_mes is
  'Quanto o rateio gerou de repasse (dono da usina) e de comissao (originador), por competencia. '
  'O que virou obrigacao de pagar esta em v_conta_pagar. Periodo natural: mes.';

-- ---------------------------------------------------- geracao x consumo
create or replace view relatorio.v_geracao_x_consumo_mes as
select g.tenant_id, t.razao_social as tenant, g.competencia as mes,
       g.usina_id, u.codigo_geradora as usina_codigo, u.apelido as usina_apelido,
       g.geracao_kwh,
       coalesce(fa.consumo_kwh, 0)                     as consumo_faturado_kwh,
       coalesce(fa.faturas, 0)                         as faturas,
       case when g.geracao_kwh > 0
            then round(coalesce(fa.consumo_kwh, 0) / g.geracao_kwh * 100, 2)
            end                                        as percentual_utilizado,
       u.geracao_nominal_kwh,
       (select coalesce(sum(uc.percentual_rateio), 0) from public.unidade_consumidora uc
         where uc.tenant_id = g.tenant_id and uc.usina_id = g.usina_id
           and uc.status::text = 'ativa')              as percentual_rateio_alocado
  from public.usina_geracao g
  join public.tenant t on t.id = g.tenant_id
  join public.usina u on u.id = g.usina_id and u.tenant_id = g.tenant_id
  left join lateral (
       select sum(f.consumo_kwh) as consumo_kwh, count(*) as faturas
         from public.fatura f
        where f.tenant_id = g.tenant_id and f.usina_id = g.usina_id
          and f.competencia = g.competencia and f.status::text <> 'cancelada'
  ) fa on true;
comment on view relatorio.v_geracao_x_consumo_mes is
  'Geracao medida contra consumo faturado, por usina e competencia. percentual_utilizado acima de 100 = '
  'faturou-se mais energia do que a usina gerou. percentual_rateio_alocado acima de 100 = sobrevenda de cota.';

-- ------------------------------------------------------------- carteira
create or replace view relatorio.v_carteira as
select t.id as tenant_id, t.razao_social as tenant,
       (select count(*) from public.cliente c where c.tenant_id = t.id and c.ativo) as clientes_ativos,
       (select count(*) from public.cliente c where c.tenant_id = t.id) as clientes_total,
       (select count(*) from public.unidade_consumidora uc where uc.tenant_id = t.id and uc.status::text = 'ativa') as ucs_ativas,
       (select count(*) from public.unidade_consumidora uc where uc.tenant_id = t.id and uc.usina_id is null) as ucs_sem_usina,
       (select count(*) from public.unidade_consumidora uc where uc.tenant_id = t.id and uc.tarifa_reais_por_kwh is null) as ucs_sem_tarifa,
       (select count(*) from public.contrato ct where ct.tenant_id = t.id and ct.status::text = 'ativo') as contratos_ativos,
       (select count(*) from public.contrato ct where ct.tenant_id = t.id and ct.status::text = 'suspenso') as contratos_suspensos,
       (select count(*) from public.contrato ct where ct.tenant_id = t.id and ct.status::text = 'rascunho') as contratos_rascunho,
       (select count(*) from public.usina u where u.tenant_id = t.id and u.status::text = 'ativa') as usinas_ativas,
       (select coalesce(sum(ct.valor_referencia_centavos), 0) from public.contrato ct
         where ct.tenant_id = t.id and ct.status::text = 'ativo') as valor_referencia_ativo_centavos,
       (select coalesce(sum(cp.valor_centavos - cp.valor_pago_centavos), 0) from public.conta_pagar cp
         where cp.tenant_id = t.id and cp.status::text = 'aberta') as a_pagar_aberto_centavos,
       (select max(f.competencia) from public.fatura f where f.tenant_id = t.id) as ultima_competencia_faturada,
       (select max(l.data_liquidacao) from public.liquidacao l where l.tenant_id = t.id) as ultima_liquidacao
  from public.tenant t;
comment on view relatorio.v_carteira is
  'Foto da carteira agora: clientes, UCs, contratos, usinas, saldo a pagar e as datas do ultimo movimento. '
  'Sem periodo -- e snapshot.';

-- -------------------------------------------------------- cobertura/meta
-- A metaview. Diz ONDE o numero e confiavel, e e a unica que responde
-- "posso citar isso?". Mesma ideia da v_cobertura_dados do conector do
-- CRM: todo numero que sai daqui pode vir com a ressalva colada.
create or replace view relatorio.v_cobertura_dados as
-- frescor: o dado mais novo que existe em cada trilha
select t.id as tenant_id, t.razao_social as tenant,
       'frescor_faturamento' as metrica, null::text as escopo,
       (select max(f.criado_em) from public.fatura f where f.tenant_id = t.id) is not null
         and (select max(f.criado_em) from public.fatura f where f.tenant_id = t.id) > now() - interval '45 days' as confiavel,
       coalesce('ultima fatura criada em ' || to_char((select max(f.criado_em) from public.fatura f where f.tenant_id = t.id), 'YYYY-MM-DD'),
                'TENANT SEM NENHUMA FATURA') as nota
  from public.tenant t
union all
select t.id, t.razao_social, 'frescor_recebimento', null,
       (select max(l.data_liquidacao) from public.liquidacao l where l.tenant_id = t.id) > current_date - 45,
       coalesce('ultima liquidacao em ' || to_char((select max(l.data_liquidacao) from public.liquidacao l where l.tenant_id = t.id), 'YYYY-MM-DD'),
                'NENHUMA LIQUIDACAO REGISTRADA -- "nao recebeu" e "nao registrou" ficam indistinguiveis')
  from public.tenant t
union all
select c.tenant_id, t.razao_social, 'espelho_crm', null,
       c.ultima_leitura_em > now() - interval '3 days' and c.ultimo_status::text <> 'erro',
       'conector CRM: status ' || c.ultimo_status::text ||
       coalesce(', ultima leitura ' || to_char(c.ultima_leitura_em, 'YYYY-MM-DD HH24:MI'), ', nunca leu')
  from public.conector_crm c join public.tenant t on t.id = c.tenant_id
union all
-- tarifa: faturar sem tarifa e faturar valor errado
select uc.tenant_id, t.razao_social, 'tarifa_uc', null,
       count(*) filter (where uc.tarifa_reais_por_kwh is null) = 0,
       count(*) filter (where uc.tarifa_reais_por_kwh is null) || ' de ' || count(*) ||
       ' UC ativas sem tarifa -- o valor da fatura delas nao tem base'
  from public.unidade_consumidora uc join public.tenant t on t.id = uc.tenant_id
 where uc.status::text = 'ativa'
 group by uc.tenant_id, t.razao_social
union all
-- documento do cliente: sem ele nao ha cobranca registravel
select c.tenant_id, t.razao_social, 'documento_cliente', null,
       count(*) filter (where c.documento is null) = 0,
       count(*) filter (where c.documento is null) || ' de ' || count(*) ||
       ' clientes ativos sem documento'
  from public.cliente c join public.tenant t on t.id = c.tenant_id
 where c.ativo
 group by c.tenant_id, t.razao_social
union all
-- sobrevenda: cota rateada acima de 100% da usina
select u.tenant_id, t.razao_social, 'rateio_alocado', u.codigo_geradora,
       coalesce((select sum(uc.percentual_rateio) from public.unidade_consumidora uc
                  where uc.tenant_id = u.tenant_id and uc.usina_id = u.id and uc.status::text = 'ativa'), 0) <= 100,
       'rateio alocado: ' || coalesce((select round(sum(uc.percentual_rateio), 2) from public.unidade_consumidora uc
                  where uc.tenant_id = u.tenant_id and uc.usina_id = u.id and uc.status::text = 'ativa'), 0)::text || '%'
  from public.usina u join public.tenant t on t.id = u.tenant_id
 where u.status::text = 'ativa'
union all
-- certificado A1: vencido derruba a emissao de boleto inteira
select c.tenant_id, t.razao_social, 'certificado_cobranca', c.provedor::text,
       c.certificado_expira_em is not null and c.certificado_expira_em > current_date + 15,
       coalesce('certificado expira em ' || to_char(c.certificado_expira_em, 'YYYY-MM-DD'),
                'SEM DATA DE EXPIRACAO REGISTRADA')
  from public.conector_cobranca c join public.tenant t on t.id = c.tenant_id
 where c.ativo;
comment on view relatorio.v_cobertura_dados is
  'METAVIEW: onde o dado e confiavel. CHAME ANTES de citar qualquer numero. Cada linha e uma metrica com '
  'confiavel (bool) e a nota que explica. Linha com confiavel=false nao invalida o numero -- exige a ressalva junto.';

-- ------------------------------------------------------- ficha (com PII)
-- A UNICA superficie de PII de cliente. SECURITY DEFINER com trava logica
-- de tenant: tenant errado devolve null, nao "dado do outro". A lista de
-- campos e ENUMERADA (fail-closed): coluna nova no banco nao entra na
-- ficha sem alguem editar este arquivo de proposito.
-- Meio de pagamento e credencial continuam de fora, aqui tambem.
create or replace function relatorio.fn_ficha_cliente(p_tenant uuid, p_cliente uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cliente', jsonb_build_object(
      'cliente_id', c.id, 'tenant_id', c.tenant_id,
      'nome', c.nome, 'documento', c.documento,
      'documento_tipo', c.documento_tipo::text,
      'documento_validado', c.documento_validado,
      'documento_origem', c.documento_origem::text,
      'telefone', c.telefone, 'email', c.email,
      'origem', c.origem, 'ativo', c.ativo, 'criado_em', c.criado_em,
      'consumo_kwh', c.consumo_kwh,
      'consumo_referencia_centavos', c.consumo_referencia_centavos,
      'crm_lead_id', c.crm_lead_id
    ),
    'unidades_consumidoras', coalesce((
      select jsonb_agg(jsonb_build_object(
        'uc_id', uc.id, 'numero_uc', uc.numero_uc, 'distribuidora', uc.distribuidora,
        'status', uc.status::text, 'titularidade', uc.titularidade::text,
        'endereco', jsonb_build_object(
          'logradouro', uc.endereco_logradouro, 'numero', uc.endereco_numero,
          'complemento', uc.endereco_complemento, 'bairro', uc.endereco_bairro,
          'municipio', uc.endereco_municipio, 'uf', uc.endereco_uf, 'cep', uc.endereco_cep),
        'usina_id', uc.usina_id, 'percentual_rateio', uc.percentual_rateio,
        'tarifa_reais_por_kwh', uc.tarifa_reais_por_kwh,
        'data_vencimento', uc.data_vencimento,
        'rateio_situacao', uc.rateio_situacao,
        'rateio_em_troca_titularidade', uc.rateio_em_troca_titularidade)
        order by uc.numero_uc)
      from public.unidade_consumidora uc
       where uc.tenant_id = c.tenant_id and uc.cliente_id = c.id), '[]'::jsonb),
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contrato_id', ct.id, 'status', ct.status::text,
        'data_fechamento', ct.data_fechamento,
        'valor_referencia_centavos', ct.valor_referencia_centavos,
        'valor_referencia_origem', ct.valor_referencia_origem::text,
        'faturas_cheias_pagas', ct.faturas_cheias_pagas,
        'unidade_consumidora_id', ct.unidade_consumidora_id,
        'usina_id', ct.usina_id, 'originador_id', ct.originador_id)
        order by ct.data_fechamento desc)
      from public.contrato ct
       where ct.tenant_id = c.tenant_id and ct.cliente_id = c.id), '[]'::jsonb),
    'faturas_recentes', coalesce((
      select jsonb_agg(x order by x->>'competencia' desc) from (
        select jsonb_build_object(
          'fatura_id', f.id, 'competencia', f.competencia, 'status', f.status::text,
          'vencimento', f.vencimento, 'valor_total_centavos', f.valor_total_centavos,
          'consumo_kwh', f.consumo_kwh, 'tarifa_reais_por_kwh', f.tarifa_reais_por_kwh,
          'liquidada_em', (select l.data_liquidacao from public.liquidacao l
                            where l.tenant_id = f.tenant_id and l.fatura_id = f.id),
          'boleto_status', (select b.status::text from public.boleto b
                             where b.tenant_id = f.tenant_id and b.fatura_id = f.id)) as x
          from public.fatura f
          join public.contrato ct2 on ct2.id = f.contrato_id and ct2.tenant_id = f.tenant_id
         where f.tenant_id = c.tenant_id and ct2.cliente_id = c.id
         order by f.competencia desc limit 12) s), '[]'::jsonb),
    'totais', jsonb_build_object(
      'faturado_centavos', coalesce((
        select sum(f.valor_total_centavos) from public.fatura f
          join public.contrato ct3 on ct3.id = f.contrato_id and ct3.tenant_id = f.tenant_id
         where f.tenant_id = c.tenant_id and ct3.cliente_id = c.id
           and f.status::text <> 'cancelada'), 0),
      'liquidado_centavos', coalesce((
        select sum(l.valor_liquidado_centavos) from public.liquidacao l
          join public.fatura f2 on f2.id = l.fatura_id and f2.tenant_id = l.tenant_id
          join public.contrato ct4 on ct4.id = f2.contrato_id and ct4.tenant_id = f2.tenant_id
         where l.tenant_id = c.tenant_id and ct4.cliente_id = c.id), 0))
  )
  from public.cliente c
 where c.tenant_id = p_tenant and c.id = p_cliente;
$$;
comment on function relatorio.fn_ficha_cliente(uuid, uuid) is
  'Ficha COMPLETA do cliente, com PII (documento, telefone, e-mail, endereco). Trava logica de tenant: '
  'par (tenant, cliente) que nao case devolve vazio. Lista de campos enumerada de proposito.';

commit;
