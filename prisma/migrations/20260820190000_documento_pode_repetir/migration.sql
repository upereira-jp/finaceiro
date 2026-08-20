-- MIGRATION 33 — o documento do cliente PODE se repetir. A UC nao.
--
-- A REGRA VEIO DO DONO, em 20/08/2026, e ela corrige uma premissa nossa:
--   "os documentos podem se repetir, pois nas negociacoes mais de uma pessoa
--    pode ser responsavel por uma UC, entretanto, nao podem existir mais de
--    uma UC."
--
-- O QUE ISSO DESFAZ. O indice `cliente_documento_unico` nasceu supondo que
-- documento repetido era erro de cadastro — e foi essa suposicao que produziu a
-- `Q-CLIENTEDUP-01` ("5 das 29 UCs sao clientes duplicados"). Medido no CRM em
-- 20/08, os quatro casos que o ciclo recusou NAO sao duplicados:
--
--   Carlos Gabriel Santos Alves ....... 1 CPF, 3 UCs DISTINTAS
--   Thiago Goncalves Taquary .......... 1 CPF, 2 UCs distintas
--   Renata Lucy N. D. Teles Leao ...... 1 CPF, 2 UCs distintas
--   Renata Ferreira Estevam ........... 1 CPF, 2 UCs distintas
--
-- Mesma pessoa, imoveis diferentes. E o caso NORMAL do negocio, nao anomalia:
-- quem tem duas casas tem duas unidades consumidoras e um CPF so.
--
-- O QUE **NAO** MUDA, e e a outra metade da regra: `uc_numero_unico`
-- (tenant_id, numero_uc) FICA. Duas linhas para a mesma UC continuam sendo erro,
-- e a `UC-DUP-01` continua valendo inteira. A unicidade que protege o
-- faturamento e a da UC — e uma UC so pode ser cobrada uma vez.
--
-- CONSEQUENCIA ACEITA: sem o indice, o banco deixa de recusar um cadastro
-- genuinamente duplicado pelo documento. Isso e uma perda real, e ela e o preco
-- de admitir o caso legitimo. Quem detecta duplicata de verdade passa a ser
-- quem olha a lista, nao a constraint — e `cliente_crm_lead_unico` continua
-- garantindo que o mesmo card do CRM nunca vire dois clientes.

DROP INDEX IF EXISTS cliente_documento_unico;

COMMENT ON COLUMN cliente.documento IS
  'CPF ou CNPJ. NAO e unico por tenant desde a migration 33 (20/08/2026): a mesma pessoa pode responder por varias UCs, e cada UC vira um cliente espelhado do seu card no CRM. Quem e unico e o numero_uc.';
