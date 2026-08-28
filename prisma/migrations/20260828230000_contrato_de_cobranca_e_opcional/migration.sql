-- MIGRATION 36 - O `numeroContratoCobranca` DEIXA DE SER EXIGIDO PARA LIGAR O
-- CONECTOR, PORQUE A DOCUMENTACAO DO BANCO DIZ QUE ELE E OPCIONAL.
--
-- ============================================================================
-- O QUE ESTA MIGRATION CONSERTA
--
-- A migration 35 criou a `conector_ativo_tem_identidade` exigindo os TRES
-- campos de identidade do cooperado. A intencao estava certa - um conector que
-- o sistema aceita ligar e que NAO consegue emitir e o pior defeito possivel,
-- porque so aparece no primeiro boleto do primeiro cliente.
--
-- Estava certa para DOIS dos tres. A colecao Postman oficial da Cobranca
-- Bancaria v3, lida em 28/08/2026, diz do terceiro, literalmente:
--
--     "numeroContratoCobranca: (optional) Somente para cooperados que possuem
--      mais de um contrato com a cooperativa"
--
-- Ou seja: o cooperado de contrato UNICO nao tem esse numero para informar - e
-- com a constraint como estava, ele NAO CONSEGUE ATIVAR O CONECTOR. A G3 pode
-- ser exatamente esse caso, e a descoberta cairia no pior momento: com o
-- `client_id` na mao, os numeros pedidos e a operacao esperando o primeiro
-- boleto.
--
-- Registrado como `Q-CONTRATOCOB-01`, decidida pelo dono em 28/08/2026 pela
-- opcao (a) - a que a documentacao sustenta.
--
-- E A PAGINA DA API, lida no mesmo dia, e AINDA MAIS FORTE que a colecao. Ela
-- nao diz "so para quem tem mais de um contrato"; diz para NAO MANDAR:
--
--     "O campo numeroContratoCobranca nao e necessario no corpo da requisicao
--      para o cadastro de um boleto. (...) Caso este campo seja preenchido
--      incorretamente, a API retornara o erro 'Numero do contrato de cobranca
--      invalido'. (...) O campo so deve ser preenchido em casos muito
--      especificos, quando houver uma orientacao expressa para utiliza-lo."
--
-- Entao NULL nao e o caso degenerado: e o caso NORMAL, e preencher por conta
-- propria e fonte de erro. A constraint que exigia o campo estava exigindo
-- justamente o que o banco pede para omitir.
--
-- ============================================================================
-- O QUE ELA NAO AFROUXA
--
-- `numero_cliente` e `codigo_modalidade` continuam OBRIGATORIOS para ligar, e
-- pelo mesmo motivo de sempre: os dois sao exigidos em todo POST /boletos, e
-- sem eles o conector ativo e uma promessa que a API recusa.
--
-- E ENTRA UM TERCEIRO NO LUGAR DO QUE SAIU: `numero_conta_corrente`. O modelo
-- `Boleto` (lido em 28/08/2026, depois desta migration ser escrita e ANTES de
-- ser aplicada) o marca com `*` - "conta corrente onde sera realizado o CREDITO
-- DA LIQUIDACAO do boleto". Ele estava nesta tabela como opcional, e o adaptador
-- o omitia quando faltava.
--
-- Nao se inventa conta de credito. Entao ele e condicao de ATIVAR, como os
-- outros dois. O saldo e uma troca, e nao um afrouxamento: a guarda continua
-- exigindo tres campos - so que os tres CERTOS.
--
-- E a `conector_identidade_positiva` (migration 35) NAO e tocada: se o campo
-- vier preenchido, continua tendo de ser inteiro positivo. Opcional quer dizer
-- "pode nao existir", nunca "pode ser zero ou lixo".
--
-- Preencher os tres continua valendo e continua sendo o caminho de quem TEM
-- mais de um contrato. O que muda e que deixou de ser condicao de ligar.
-- ============================================================================

ALTER TABLE conector_cobranca
  DROP CONSTRAINT conector_ativo_tem_identidade;

/*
 * `NOT VALID` PELA MESMA RAZAO DA 35, e ela nao envelheceu: esta migration nao
 * consegue saber o que existe em producao, e uma CHECK validada abortaria o
 * deploy inteiro por causa de uma linha antiga.
 *
 * ATENCAO: a nova NAO e mais fraca que a antiga - e uma TROCA. Ela deixa de
 * exigir `numero_contrato_cobranca` e passa a exigir `numero_conta_corrente`.
 * Entao existe, sim, linha que a antiga aceitava e esta recusa: um conector
 * ativo com contrato preenchido e sem conta de credito. Se existir em producao,
 * a linha fica como esta (o `NOT VALID` nao mexe no que ja esta gravado) e o
 * proximo UPDATE nela e que vai ser recusado - nomeando o campo que falta, que e
 * o comportamento certo, porque esse conector nao consegue emitir boleto.
 *
 * Quem quiser fechar o buraco herdado roda, como antes:
 *
 *     ALTER TABLE conector_cobranca VALIDATE CONSTRAINT conector_ativo_tem_identidade;
 */
ALTER TABLE conector_cobranca
  ADD CONSTRAINT conector_ativo_tem_identidade CHECK (
    NOT ativo
    OR provedor <> 'sicoob'
    OR (numero_cliente IS NOT NULL
        AND codigo_modalidade IS NOT NULL
        AND numero_conta_corrente IS NOT NULL)
  ) NOT VALID;

COMMENT ON COLUMN conector_cobranca.numero_contrato_cobranca IS
  'numeroContratoCobranca da Cobranca v3. NAO e o numero_contrato desta mesma '
  'tabela. OPCIONAL (colecao Postman, 28/08/2026): so existe para cooperado '
  'com mais de um contrato. Quando NULL, o campo NAO vai no corpo do POST - '
  'a API recusa campo com valor nulo.';
