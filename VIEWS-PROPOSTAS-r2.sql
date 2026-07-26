-- =====================================================================
-- OBSOLETO COMO ESTADO. Nota de 26/07/2026.
--
-- Este arquivo e a PROPOSTA de 24/07, e o dev do CRM informou que ele NAO
-- EXISTE no host de producao - lá só havia o r1 e a view viva. O defeito do
-- LIMIT 1 sem ORDER BY estava VIVO em producao, nao apenas proposto aqui.
--
-- O estado APLICADO em 26/07 e outro, e o canonico e do lado do CRM:
--   /root/auditoria/VIEWS-APLICADAS-20260726.sql
--
-- Diferencas ja conhecidas em relacao a este arquivo:
--   - LATERAL do Comissionamento: array_agg ordenado + comissionamento_n_opcoes
--   - comissionamento_n_opcoes fica no FIM da lista de colunas
--   - o predicado o.tenant_id = v.tenant_id NAO existe (a coluna nao existe em
--     custom_field_options; sugestao minha, errada)
--   - DISTINCT ON com desempate ORDER BY l.id, entered_at DESC, lfp.id DESC
--   - views novas: geracao_mensal, rateio_creditos, leads_arquivados, lead_merges
--
-- Guardado como registro do que foi PEDIDO. Nao use como referencia do que ESTA
-- no ar: para isso, o arquivo do CRM.
-- =====================================================================

-- =====================================================================
-- VIEWS-PROPOSTAS.sql — r2 — Contrato de interface CRM → Financeiro
-- Auditoria intreply · original 2026-07-23 · revisão r2 2026-07-23
-- tenant G3 Solar
--
-- ⚠️  PROPOSTA. NÃO EXECUTAR. Para o dev do CRM revisar e, se concordar,
--    aplicar. Nenhuma DDL deste arquivo foi rodada. As definições atuais
--    foram lidas de pg_views em 23/07/2026 (somente leitura).
--
-- CONTEXTO (por que views, e não SELECT direto nas tabelas):
--   As 151 tabelas de `public` têm RLS com policies sobre auth.uid().
--   Uma role de serviço sem contexto de usuário lê 0 linhas das tabelas
--   base. As views abaixo são OWNED por `postgres` — verificado: as 4
--   existentes têm viewowner = postgres — e rodam com o privilégio do
--   dono. O conector do financeiro lê SÓ estas views, nunca as tabelas.
--
-- O QUE MUDOU NA r2 (motivo: relatório P7, topologia de funis)
--   1. `vendas_ganhas` — o dedup sugerido no arquivo original é INSEGURO
--      sem filtro de funil. Ver (A.1).
--   2. `rateio_clientes` e `usinas` — não expõem os uuid de lead. O
--      financeiro chaveia por uuid. Ver (A.2) e (A.3).
--   3. Seção (C), aliases `integracao.vw_*` — REMOVIDA. Q-023 decidiu
--      consumir `financeiro.*` direto.
--   4. Comentário de `geracao_mensal` corrigido: o CRM TEM dado monetário
--      (`leads.consumo_reais`, 100% preenchido). O que não tem é valor
--      em R$ *nesta tabela*.
--   5. Nova view proposta: `carteira_ativa`. Ver (B.3).
--
-- NOTA DE APLICAÇÃO — CREATE OR REPLACE VIEW só aceita colunas NOVAS no
--   FIM da lista, com as anteriores idênticas em nome, ordem e tipo. As
--   alterações abaixo respeitam isso: nada é inserido no meio. Se preferir
--   reordenar, é DROP + CREATE, e aí os GRANTs da seção (D) precisam ser
--   reaplicados.
--
-- PENDÊNCIA TRANSVERSAL (MT-08) — todas as views carregam o uuid da G3
--   como literal, em até três pontos do corpo. A camada de interface é
--   mono-tenant na prática: um segundo tenant exige view nova, não
--   configuração. Aceito para a F1; vira bloqueio no segundo tenant.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (A) VIEWS EXISTENTES — correções propostas
-- ---------------------------------------------------------------------

-- (A.1) financeiro.vendas_ganhas — filtro de funil + dedup, NESTA ORDEM
--
-- Problema medido no P7: a view filtra só por stage_type = 'won', sem
-- restringir funil. Os 46 "ganhos" da auditoria são 38 de Vendas -
-- Assinatura, 1 de Vendas - Integração e 7 do funil Parceiros — que é
-- onboarding de parceiro, não venda.
--
-- Por que o dedup sozinho é pior que o problema: DISTINCT ON (lead_id)
-- ORDER BY ganho_em DESC escolhe UMA linha por lead entre funis. Sem
-- filtro, ele pode eleger a linha do funil Parceiros e a contaminação
-- deixa de ser visível na contagem. Filtrar primeiro, deduplicar depois.
--
-- ⚠️ BLOQUEADO POR F-02 — a lista de funis abaixo é provisória. Decidir
--    quais funis contam como conversão final antes de aplicar.
--    'Vendas - Integração' está FORA: é obra, não assinatura de crédito
--    (F-05).

CREATE OR REPLACE VIEW financeiro.vendas_ganhas AS
SELECT DISTINCT ON (l.id)
    l.codigo,
    l.id                  AS lead_id,
    l.nome,
    l.telefone,
    l.email,
    f.name                AS funil,
    s.name                AS etapa,
    lfp.entered_at        AS ganho_em,
    l.valor_venda,                      -- 100% NULL (ver comentário)
    lfp.valor             AS valor_posicao,  -- 100% NULL (ver comentário)
    l.parceria_tipo,
    com.label             AS comissionamento,
    l.partner_id,
    pu.name               AS parceiro_nome,
    vu.name               AS vendedor_origem,
    ru.name               AS responsavel_atual,
    l.consumo_kwh,
    l.consumo_reais,
    l.created_at
FROM public.leads l
JOIN public.lead_funnel_position lfp ON lfp.lead_id  = l.id
JOIN public.funnel_stages       s   ON s.id         = lfp.stage_id
JOIN public.funnels             f   ON f.id         = s.funnel_id
LEFT JOIN public.partners p  ON p.id  = l.partner_id
LEFT JOIN public.users    pu ON pu.id = p.user_id
LEFT JOIN public.users    vu ON vu.id = l.vendedor_origem_user_id
LEFT JOIN public.users    ru ON ru.id = l.responsavel_user_id
LEFT JOIN LATERAL (
    SELECT o.label
    FROM public.custom_field_values v
    JOIN public.custom_field_definitions d ON d.id = v.field_definition_id
    LEFT JOIN public.custom_field_options o ON o.id = ANY (v.valor_options)
    WHERE v.lead_id = l.id
      AND v.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
      AND d.label = 'Comissionamento'
    LIMIT 1
) com ON true
WHERE s.stage_type = 'won'
  AND f.name IN ('Vendas - Assinatura')          -- ⚠️ F-02: revisar lista
  AND l.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
  AND f.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
  AND l.removido_do_funil_em IS NULL
ORDER BY l.id, lfp.entered_at DESC;

COMMENT ON VIEW financeiro.vendas_ganhas IS
  'Vendas fechadas em funil de VENDA, uma linha por lead. Restringe funil '
  'antes de deduplicar: sem o filtro, o dedup elege silenciosamente linha de '
  'funil errado (P7). NÃO inclui o funil Parceiros (onboarding) nem Vendas - '
  'Integração (obra, F-05). valor_venda e valor_posicao são 100% NULL e estão '
  'mortos por desenho: funnels.valor_mode = ''consumo_solar'' faz o CRM derivar '
  'o valor exibido do consumo. O dado monetário utilizável é consumo_reais.';


-- (A.2) financeiro.rateio_clientes — expor os uuid de junção
--
-- Problema: a view expõe l.codigo (texto legível) mas NÃO expõe
-- usina_clientes.lead_id. O financeiro chaveia cliente por crm_lead_id
-- uuid e faz upsert sempre pelo id da origem — com a view atual, não é
-- possível. Mesma falta para usina_id.
-- Colunas acrescentadas ao FIM, para manter CREATE OR REPLACE válido.

CREATE OR REPLACE VIEW financeiro.rateio_clientes AS
SELECT
    uc.id                 AS contrato_id,
    us.codigo_geradora,
    us.apelido            AS usina,
    l.codigo              AS lead_codigo,
    l.nome                AS cliente,
    l.telefone,
    uc.percentual_rateio,
    uc.uc,
    uc.troca_titularidade,
    uc.numero_protocolo,
    uc.data_cadastro,
    uc.data_vencimento,
    uc.observacoes,
    uc.created_at,
    -- novas:
    uc.lead_id,
    uc.usina_id,
    uc.updated_at
FROM public.usina_clientes uc
JOIN public.usinas us ON us.id = uc.usina_id
    AND us.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
JOIN public.leads l ON l.id = uc.lead_id
    AND l.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
WHERE uc.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid;

COMMENT ON VIEW financeiro.rateio_clientes IS
  'Vínculo UC ↔ usina. lead_id e usina_id expostos para permitir upsert por '
  'uuid da origem. ATENÇÃO: updated_at NÃO é confiável nesta tabela — sem '
  'trigger, 83% das linhas têm updated_at < created_at. Serve para diagnóstico, '
  'nunca como marca-d''água de sincronização incremental. A estratégia é '
  'full-scan com reconciliação de conjunto.';


-- (A.3) financeiro.usinas — expor dono_lead_id
--
-- dono_lead_id está 100% NULL hoje, e o dono de usina é cadastro exclusivo
-- do financeiro. Ainda assim a coluna precisa estar na interface: se o CRM
-- passar a preencher, o financeiro precisa conseguir ler por uuid.

CREATE OR REPLACE VIEW financeiro.usinas AS
SELECT
    us.id                 AS usina_id,
    us.codigo_geradora,
    us.apelido,
    us.localizacao,
    us.potencia_kwp,
    us.geracao_kwh_mensal,
    us.distribuidora,
    us.status,
    us.data_instalacao,
    dl.codigo             AS dono_lead_codigo,
    dl.nome               AS dono_lead_nome,
    -- nova:
    us.dono_lead_id
FROM public.usinas us
LEFT JOIN public.leads dl ON dl.id = us.dono_lead_id
    AND dl.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
WHERE us.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid;

COMMENT ON VIEW financeiro.usinas IS
  'Usinas do tenant. geracao_kwh_mensal é a geração NOMINAL (valor único '
  'cadastrado), não a série real — ver financeiro.geracao_mensal. dono_lead_id '
  'está 100% NULL: o beneficiário do repasse é cadastro do financeiro.';


-- (A.4) financeiro.parceiros — sem alteração
--   Já expõe partner_id e lead_origem_id em uuid. Nada a corrigir.


-- ---------------------------------------------------------------------
-- (B) VIEWS NOVAS
-- ---------------------------------------------------------------------

-- (B.1) Geração mensal — a série real, por competência.
--   Fonte: public.usina_geracao_mensal (kWh digitado manualmente).

CREATE OR REPLACE VIEW financeiro.geracao_mensal AS
SELECT
    gm.id,
    gm.usina_id,
    us.codigo_geradora,
    us.apelido            AS usina,
    gm.ano_mes            AS competencia,
    gm.geracao_kwh,
    gm.created_at,
    gm.updated_at
FROM public.usina_geracao_mensal gm
JOIN public.usinas us ON us.id = gm.usina_id
    AND us.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
WHERE gm.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid;

COMMENT ON VIEW financeiro.geracao_mensal IS
  'Geração mensal por usina em kWh, digitada manualmente. EXPÕE competência '
  '(ano_mes, date no dia 1º) e geração kWh. NÃO EXPÕE, porque não existe NESTA '
  'tabela: valor faturado, tarifa, economia, e sinal de competência fechada. '
  'Ausência de linha significa mês não lançado, NÃO zero — a diferença é '
  'ambígua no CRM e o financeiro não deve faturar assumindo completude (Q-004 '
  'aud). Observação: o CRM TEM dado monetário utilizável em leads.consumo_reais, '
  '100% preenchido; a ausência aqui é desta tabela, não do sistema.';


-- (B.2) Créditos de rateio calculados — conveniência.
--
-- ⚠️ NÃO APLICAR até a Q-021 ser decidida. Esta view materializa o cálculo
--    do CRM, que usa geração NOMINAL. Se o faturamento passar a usar a série
--    real, expor isto cria duas fontes concorrentes de crédito e o painel do
--    CRM passa a discordar do financeiro sem que ninguém saiba qual está certo.

CREATE OR REPLACE VIEW financeiro.rateio_creditos AS
SELECT
    uc.id                 AS contrato_id,
    uc.usina_id,
    uc.lead_id,
    uc.percentual_rateio,
    us.geracao_kwh_mensal AS geracao_nominal_kwh,
    round(COALESCE(uc.percentual_rateio, 0) / 100.0
          * COALESCE(us.geracao_kwh_mensal, 0), 3) AS creditos_kwh_mes
FROM public.usina_clientes uc
JOIN public.usinas us ON us.id = uc.usina_id
    AND us.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
WHERE uc.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid;

COMMENT ON VIEW financeiro.rateio_creditos IS
  'Créditos de rateio em kWh/mês = percentual_rateio/100 * geração NOMINAL. '
  'Replica rateio_service.creditos_kwh. EM kWh, NUNCA em R$. Usa geração '
  'nominal, não a série real de financeiro.geracao_mensal — as duas dão números '
  'diferentes (Q-021). O rateio não soma 100% em 2 das 3 usinas (91,2% e '
  '99,78%) e a regra dos 25% não é aplicada pelo CRM.';


-- (B.3) Carteira ativa — NOVA, e é a que o conector realmente precisa.
--
-- Diretriz de 23/07/2026: a carteira do financeiro sai do funil
-- "Clientes ativos - Assinatura", e os ganhos dos funis de conversão final
-- passarão a entrar nele por automação.
--
-- ⚠️ ESTA VIEW RETORNA ZERO LINHAS HOJE. O funil existe, foi criado em
--    29/06/2026, e está vazio. Nenhuma automação está configurada em funil
--    algum (auto_enter_rules, auto_exit_rules e entry_sources todos vazios).
--    Zero linhas é o resultado esperado, não defeito da view.
--
-- ⚠️ BLOQUEADA POR:
--    F-01 — a carteira legada (36 clientes com rateio) está no funil "Rateio"
--           e nunca passou por etapa `won`. Automação disparada por `won` não
--           a alcança. Sem migração, o financeiro fatura zero.
--    F-02 — quais funis alimentam a automação.
--    F-04 — participação no funil ou etapa dentro dele.

CREATE OR REPLACE VIEW financeiro.carteira_ativa AS
SELECT DISTINCT ON (l.id)
    l.id                  AS lead_id,
    l.codigo,
    l.nome,
    l.telefone,
    l.email,
    l.consumo_kwh,
    l.consumo_reais,
    f.name                AS funil,
    s.name                AS etapa,
    s.stage_type,
    lfp.entered_at        AS entrou_em,
    l.created_at
FROM public.leads l
JOIN public.lead_funnel_position lfp ON lfp.lead_id = l.id
JOIN public.funnel_stages       s   ON s.id        = lfp.stage_id
JOIN public.funnels             f   ON f.id        = s.funnel_id
WHERE f.name = 'Clientes ativos - Assinatura'
  AND l.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
  AND f.tenant_id = 'd4640f4b-f833-4a80-a4db-ccced1956ae4'::uuid
  AND l.removido_do_funil_em IS NULL
ORDER BY l.id, lfp.entered_at DESC;

COMMENT ON VIEW financeiro.carteira_ativa IS
  'Quem é cliente da carteira, por PARTICIPAÇÃO no funil Clientes ativos - '
  'Assinatura. As colunas etapa e stage_type existem para relatório de '
  'reconciliação, NÃO como fonte de estado financeiro: a etapa INADIMPLENTES é '
  'produzida pelo financeiro, e lê-la de volta do CRM seria ler a própria saída '
  'com atraso (ADR-0002 r2, F-03). Retorna zero linhas enquanto o funil estiver '
  'vazio e a carteira legada não for migrada (F-01).';


-- ---------------------------------------------------------------------
-- (C) [REMOVIDA na r2] — aliases integracao.vw_*
--
--   A Q-023 decidiu consumir financeiro.* diretamente. Menos indireção,
--   uma camada a menos para manter. O PRD foi corrigido de acordo.
--   Não criar o schema `integracao`.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- (D) GRANTs para a role read-only do conector
--   `financeiro_ro` já existe, sem BYPASSRLS, e não deve ler tabela base.
-- ---------------------------------------------------------------------

GRANT USAGE  ON SCHEMA financeiro            TO financeiro_ro;
GRANT SELECT ON financeiro.geracao_mensal    TO financeiro_ro;
GRANT SELECT ON financeiro.rateio_creditos   TO financeiro_ro;
GRANT SELECT ON financeiro.carteira_ativa    TO financeiro_ro;
-- As 4 views originais já estão concedidas. CREATE OR REPLACE preserva o
-- GRANT; DROP + CREATE não. Se optar por recriar, reaplicar:
--   GRANT SELECT ON financeiro.vendas_ganhas, financeiro.rateio_clientes,
--                   financeiro.usinas, financeiro.parceiros TO financeiro_ro;

-- Opcional, evita esquecer GRANT em view futura:
-- ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro GRANT SELECT ON TABLES TO financeiro_ro;


-- ---------------------------------------------------------------------
-- LEMBRETE FORA DO ESCOPO DESTE ARQUIVO
--   A role `auditoria_ro` continua ativa, com LOGIN, senha e BYPASSRLS,
--   válida até 23/08/2026. É o item de segurança mais barato e o único com
--   prazo correndo: DROP ROLE auditoria_ro;
-- ---------------------------------------------------------------------
-- FIM DA PROPOSTA r2 — nada acima foi executado.
