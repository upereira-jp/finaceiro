-- MIGRATION 26 - QUEM EMITE A FATURA, por extenso. Decidido pelo dono em
-- 14/08/2026, fechando a `Q-DOCG3-08`.
--
-- DE ONDE ELA VEM, e o achado nao foi de auditoria de spec: foi de CONSTRUIR. Em
-- 12/08, montando a faixa de pagamento do modelo G3, apareceu que o primeiro
-- campo dela e *Beneficiario* - e que `identidade_de_cobranca` nao tem razao
-- social nem CNPJ, e o caminho do boleto nao tem nome de quem recebe em lugar
-- nenhum do schema. O campo foi OMITIDO naquele dia, e a omissao foi deliberada:
-- e a ele que o modelo amarra o aviso anti-golpe, e "Beneficiario: -" treina o
-- comportamento oposto ao que o aviso pede.
--
-- Em 14/08, construindo a FOLHA 1, o mesmo buraco reapareceu num segundo lugar:
-- o cabecalho da folha traz razao social e CNPJ a direita da logo, e o rodape os
-- repete. Na referencia (`g3_fatura_unificada`) os dois estao ESCRITOS NO CODIGO
-- - o que serve para um app de uma empresa so e nao serve para um sistema
-- multi-tenant, onde escrever o CNPJ da G3 no fonte poria o CNPJ dela na fatura
-- de outro tenant.
--
-- ================================================================ AS DUAS COLUNAS
--
-- `razao_social` e `cnpj`, NULAVEIS. Nulaveis porque a tabela ja tem linha em
-- producao e uma coluna NOT NULL sem default exigiria adivinhar o valor - e o que
-- se adivinha aqui sai impresso na fatura do cliente. Quem nao preencheu ve o
-- campo ausente, que e verdade; nao ve um chute.
--
-- O CNPJ E `text` E NAO NUMERO, pelo mesmo motivo de sempre neste projeto:
-- zero a esquerda. `01234567000199` virando 1234567000199 e a classe de defeito
-- que `numero_uc` e `documento` ja evitam.
--
-- ============================================================= O QUE O BANCO CONFERE
--
-- Formato, e so. `cnpj_da_identidade_e_digitos` exige 14 digitos quando a coluna
-- esta preenchida. O DIGITO VERIFICADOR fica na aplicacao (`validarCNPJ` em
-- `src/dominio/documento.ts`), e a divisao e a mesma da chave Pix: o banco sabe o
-- que e formato, a aplicacao sabe o que e digito verificador. Um CHECK com a
-- aritmetica do DV dentro seria uma segunda implementacao dela, em outra
-- linguagem, que envelheceria separado.
--
-- A trilha da regra 9 e a policy de isolamento NAO precisam ser criadas: a tabela
-- ja tem `auditar_identidade_de_cobranca` (migration 21) e `tenant_isolation`
-- (idem), e coluna nova entra nas duas sozinha. E o retorno de ter posto trilha
-- por tabela em vez de por coluna.

ALTER TABLE identidade_de_cobranca
  ADD COLUMN razao_social text,
  ADD COLUMN cnpj         text;

ALTER TABLE identidade_de_cobranca
  ADD CONSTRAINT cnpj_da_identidade_e_digitos
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

-- Razao social vazia nao e razao social: `''` passaria pelo NOT NULL que nao
-- existe e sairia impressa como espaco em branco no lugar do nome da empresa.
ALTER TABLE identidade_de_cobranca
  ADD CONSTRAINT razao_social_da_identidade_nao_vazia
  CHECK (razao_social IS NULL OR length(btrim(razao_social)) > 0);

COMMENT ON COLUMN identidade_de_cobranca.razao_social IS
  'Quem EMITE a fatura, por extenso. Sai no cabecalho da folha, no rodape e no campo Beneficiario da faixa de pagamento - e e a ele que o aviso anti-golpe amarra. Nulo enquanto o tenant nao cadastrou.';

COMMENT ON COLUMN identidade_de_cobranca.cnpj IS
  'CNPJ do emissor, 14 digitos sem mascara. `text` por causa do zero a esquerda. O DV e conferido na aplicacao (validarCNPJ), nao aqui.';
